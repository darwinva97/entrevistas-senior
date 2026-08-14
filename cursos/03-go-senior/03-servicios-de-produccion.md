# Módulo 3 · Servicios de producción en Go

> **Curso 03 · Go senior** · 150 min

## Por qué esto importa en la entrevista

El código de ejemplo de la documentación de Go (`http.ListenAndServe(":8080", nil)`) es exactamente lo que **no** debe ir a producción: sin timeouts, sin límites, sin apagado ordenado. Un entrevistador senior te va a pedir "escribe un servidor HTTP de producción" y va a contar cuántas de estas cosas mencionas.

## Servidor HTTP: los timeouts que nadie pone

```go
srv := &http.Server{
    Addr:              ":8080",
    Handler:           router,
    ReadHeaderTimeout: 5 * time.Second,   // ← defensa contra Slowloris
    ReadTimeout:       15 * time.Second,  // cuerpo completo
    WriteTimeout:      30 * time.Second,  // desde el fin de la lectura hasta la respuesta
    IdleTimeout:       120 * time.Second, // keep-alive ocioso
    MaxHeaderBytes:    1 << 20,
    BaseContext:       func(net.Listener) context.Context { return ctxRaíz },
}
```

Y en el handler: `http.MaxBytesReader(w, r.Body, 1<<20)` para limitar el cuerpo, y un `context.WithTimeout` por operación. Sin `ReadHeaderTimeout`, una conexión que envía cabeceras de a un byte por minuto te consume descriptores indefinidamente — es un ataque trivial y una pregunta frecuente.

**Cliente HTTP** (igual de importante y más olvidado):

```go
transport := &http.Transport{
    MaxIdleConns:        200,
    MaxIdleConnsPerHost: 100,   // el default (2) estrangula la concurrencia hacia un mismo host
    IdleConnTimeout:     90 * time.Second,
    DialContext: (&net.Dialer{Timeout: 2 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
    TLSHandshakeTimeout: 2 * time.Second,
}
cli := &http.Client{Transport: transport, Timeout: 5 * time.Second}
```

**Nunca uses `http.DefaultClient` en producción**: no tiene timeout global, así que una respuesta que nunca llega bloquea la goroutine para siempre. Y siempre `io.Copy(io.Discard, resp.Body)` + `resp.Body.Close()`, o la conexión no vuelve al pool (fuga de conexiones y descriptores: el caso "too many open files" del banco).

## Middleware: el patrón

```go
type Middleware func(http.Handler) http.Handler

func Chain(h http.Handler, ms ...Middleware) http.Handler {
    for i := len(ms) - 1; i >= 0; i-- { h = ms[i](h) }
    return h
}

func Recover(log *slog.Logger) Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            defer func() {
                if rec := recover(); rec != nil {
                    log.Error("panic", "err", rec, "stack", string(debug.Stack()))
                    http.Error(w, "internal error", 500)   // sin filtrar detalles
                }
            }()
            next.ServeHTTP(w, r)
        })
    }
}
```

Orden habitual: `Recover → RequestID/Trace → Logger → Métricas → RateLimit → Auth → Timeout → handler`. Que el `Recover` sea el más externo es deliberado: debe capturar los panics de todos los demás. **Un panic sin recover en un handler tumba el proceso entero**, no solo esa petición.

## Apagado ordenado completo

```go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()

go func() { if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) { log.Fatal(err) } }()

<-ctx.Done()                       // llegó SIGTERM
readiness.Store(false)             // 1) readiness en rojo
time.Sleep(5 * time.Second)        // 2) que el LB deje de enviar tráfico

shutCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
defer cancel()
_ = srv.Shutdown(shutCtx)          // 3) no acepta nuevas, termina las en vuelo
consumidor.Close()                 // 4) commit de offsets, parar de consumir
workers.Wait()                     // 5) terminar los jobs activos
db.Close()                         // 6) cerrar el pool
```

`srv.Shutdown` **no** cierra conexiones *hijacked* ni WebSockets: hay que cerrarlas tú. Y el `terminationGracePeriodSeconds` del pod debe ser mayor que la suma de esperas o Kubernetes te mandará `SIGKILL` a mitad. Explicar la carrera entre la retirada del endpoint y el `SIGTERM` es lo que demuestra experiencia real (caso 16 del banco: 502s durante los rollouts).

## gRPC en Go

- **Deadlines son obligatorios** y se propagan solos por el contexto: es la implementación natural del presupuesto de latencia. `codes.DeadlineExceeded` es la señal de que hay que dejar de trabajar.
- **Errores tipados** con `status.Error(codes.NotFound, ...)` y detalles con `errdetails`. Mapea a HTTP en el borde, no antes.
- **Interceptors** (unary y stream) para logging, métricas, autenticación, recuperación de panics y reintentos: son el equivalente al middleware.
- **Balanceo:** gRPC mantiene conexiones HTTP/2 largas; un balanceador L4 reparte *conexiones*, no *peticiones*, así que un servidor se lleva todo el tráfico. Solución: balanceo L7 (mesh, proxy) o resolución DNS del lado del cliente con `round_robin`.
- **Streaming:** server-side para grandes conjuntos, client-side para ingesta, bidireccional para tiempo real. Cada stream mantiene una goroutine viva: aplica los mismos cuidados de cancelación del [módulo 1](01-concurrencia-y-context.md).

## Resiliencia y control de carga

```go
// Rate limiting: token bucket de la stdlib extendida
lim := rate.NewLimiter(rate.Limit(100), 200)   // 100 rps, ráfagas de 200
if !lim.Allow() { http.Error(w, "rate limited", 429); return }

// Concurrencia máxima hacia una dependencia (bulkhead)
sem := semaphore.NewWeighted(20)
if err := sem.Acquire(ctx, 1); err != nil { return err }
defer sem.Release(1)
```

Circuit breaker: `sony/gobreaker` o propio; los mismos criterios del [curso 00 módulo 4](../00-fundamentos-distribuidos/04-resiliencia.md) (ventana con volumen mínimo, apertura por lentitud, fallback definido). **Hedging** (lanzar una segunda petición si la primera supera el p95 y quedarte con la que llegue antes) es fácil en Go con `select` y merece mencionarse: reduce el p99 a costa de tráfico extra, y solo vale para operaciones idempotentes.

## Estructura de proyecto y dependencias

```
cmd/api/main.go                # composición: aquí y solo aquí se construyen las dependencias
internal/pedido/               # dominio: entidades y casos de uso, sin imports de infra
internal/pedido/postgres/      # adaptador de persistencia
internal/pedido/http/          # adaptador de entrada
internal/platform/{log,otel,db}/
```

- `internal/` impide que otros módulos importen tus tripas: es una barrera del compilador, no una convención.
- **Interfaces definidas en el consumidor**, pequeñas (la idiomática de Go: *accept interfaces, return structs*).
- **DI manual en `main`** para la mayoría de servicios; `wire` (generación en compilación) si el grafo crece; `fx` solo si el equipo ya lo conoce, porque cambia la depuración a runtime.
- Evita `pkg/` como cajón de sastre y los paquetes `util`/`common`: acaban siendo dependencias de todo.

## Observabilidad

```go
import _ "net/http/pprof"     // en un puerto INTERNO, jamás expuesto públicamente
go func() { log.Println(http.ListenAndServe("localhost:6060", nil)) }()
```

`pprof` siempre disponible en producción es una de las mejores decisiones que puedes defender en una entrevista: el coste es despreciable y te permite diagnosticar sin desplegar. Añade OpenTelemetry (trazas + métricas RED), `slog` estructurado con `trace_id`, y expón `runtime.NumGoroutine()` y las métricas de `runtime/metrics`.

## Testing

- **Table-driven tests** con subtests (`t.Run`), y `t.Parallel()` donde sea seguro.
- **`-race` en CI, siempre.** Una carrera que "nunca dio problemas" es una que aún no se manifestó.
- **Testcontainers** para Postgres/Kafka reales; `httptest.Server` para dependencias HTTP.
- **`goleak`** en `TestMain` para detectar fugas de goroutines automáticamente.
- Mocks generados solo para interfaces pequeñas y propias; para lo demás, fakes escritos a mano suelen ser más claros.

## Errores comunes que delatan a un no-senior

- `http.ListenAndServe` sin timeouts.
- `http.DefaultClient` o cliente sin `Timeout`.
- No cerrar/drenar `resp.Body`.
- No implementar apagado ordenado, o hacerlo sin esperar al readiness.
- Exponer `/debug/pprof` públicamente.
- gRPC tras un balanceador L4 sin saber por qué el tráfico se desequilibra.
- Estructura `pkg/` + `models/` + `utils/` (arquitectura por capas técnicas en lugar de por dominio).

## 🧪 Laboratorio

1. **Servidor de producción:** escribe uno con los cinco timeouts, límite de cuerpo, middleware de recover/trace/métricas y apagado ordenado. Verifica el Slowloris con `slowhttptest` antes y después de `ReadHeaderTimeout`.
2. **Fuga de descriptores:** cliente que no cierra `resp.Body`; observa `lsof | wc -l` creciendo hasta "too many open files". Arréglalo y verifica.
3. **Cero 502 en rollout:** despliega en kind, carga con `vegeta`, `kubectl rollout restart` y cuenta errores. Itera hasta cero.
4. **gRPC:** servicio con deadline propagado; comprueba con `grpcurl` que al vencer el deadline el servidor deja de trabajar (loguea `ctx.Err()`).
5. **Hedging:** implementa la petición cubierta y mide la mejora del p99 y el aumento de carga.
6. **`pprof` en caliente:** con el servicio bajo carga, captura `heap`, `goroutine`, `profile` (CPU 30 s) y `mutex`; aprende a leer cada uno.

**Entregable:** una plantilla de servicio Go que puedas reutilizar (y enseñar en la entrevista).

## ✅ Autoevaluación

1. Escribe de memoria un `http.Server` de producción y justifica cada timeout.
2. ¿Por qué `MaxIdleConnsPerHost` por defecto puede estrangular tu servicio?
3. ¿Qué pasa si no drenas `resp.Body`?
4. Detalla el apagado ordenado y la carrera con el readiness de Kubernetes.
5. ¿Por qué gRPC se desbalancea con un LB L4?
6. ¿Dónde pones el middleware de recover y por qué?
7. ¿Qué expones en `/debug/pprof` y cómo lo proteges?

## 🎯 Preguntas del banco que ya puedes responder

- [`golang-microservicios/02-microservicios-en-go.md`](../../golang-microservicios/02-microservicios-en-go.md) — las 18
- [`golang-microservicios/03-casos-y-problemas.md`](../../golang-microservicios/03-casos-y-problemas.md) — 6 (fds), 11 (timeouts en cascada), 12 (pool), 16 (502 en rollouts)

---

**Anterior:** [Módulo 2](02-runtime-memoria-y-gc.md) · **Siguiente:** [Módulo 4 · Laboratorio pprof](04-laboratorio-pprof.md)
