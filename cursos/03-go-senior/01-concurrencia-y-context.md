# Módulo 1 · Concurrencia: scheduler, channels y context

> **Curso 03 · Go senior** · 180 min

## Por qué esto importa en la entrevista

Go se elige por su concurrencia, así que ahí es donde aprietan. Y la pregunta implícita en todas las variantes es: **¿sabes quién para tu goroutine?** Las fugas de goroutines son el memory leak de Go, y son consecuencia de no responder esa pregunta.

## Modelo mental: GMP

```
G  goroutine    ~2 KB de stack inicial, crece y encoge
M  machine      hilo del SO
P  processor    contexto de ejecución; GOMAXPROCS de ellos (nº de CPUs)

  P tiene una cola local de G; hay una cola global; y hay work stealing
  entre P (roba la mitad de la cola de otro P cuando se queda sin trabajo).
```

Lo que debes poder explicar:

- **Bloqueo en syscall:** la M se queda bloqueada con la G; el runtime **desacopla la P** y la entrega a otra M para que siga ejecutando otras goroutines. Por eso mil goroutines bloqueadas en I/O no paran el programa.
- **I/O de red:** no bloquea la M — va al *netpoller* (epoll/kqueue), y la G se aparca hasta que el fd esté listo. Ese es el truco que hace que un servidor Go con 100.000 conexiones no necesite 100.000 hilos.
- **Preempción asíncrona (desde Go 1.14):** el runtime puede interrumpir una goroutine en un bucle apretado sin llamadas a función. Antes, un `for {}` sin puntos de preempción podía congelar el GC del proceso entero.
- **`GOMAXPROCS` en contenedores:** por defecto es el número de CPUs *del nodo*, no el límite del cgroup. Con `limits.cpu: 2` en una máquina de 64 núcleos tendrás 64 P y sufrirás throttling y contención. Solución: `automaxprocs` (Uber) o fijarlo. **Este detalle es oro en una entrevista de plataforma.**

## Channels: semántica exacta

| Operación | Canal nil | Canal vacío/lleno | Canal cerrado |
|---|---|---|---|
| enviar | bloquea para siempre | bloquea | **panic** |
| recibir | bloquea para siempre | bloquea | devuelve valor cero, `ok=false` |
| cerrar | panic | — | **panic** (doble cierre) |

- **Unbuffered = punto de sincronización** (rendezvous): el emisor no continúa hasta que alguien recibe. Úsalo cuando la entrega debe ser confirmada.
- **Buffered = desacople limitado**: absorbe picos; el tamaño del búfer *es* tu política de backpressure. Búfer enorme = cola oculta que estalla en memoria (el mismo error que la cola ilimitada de un pool de hilos).
- **Regla de propiedad:** *cierra el canal quien escribe, nunca quien lee*, y solo si hay un único escritor. Con varios escritores, coordina con `sync.WaitGroup` y cierra después del `Wait()`.
- **`select`**: elige aleatoriamente entre casos listos (evita la inanición); `default` lo hace no bloqueante; un canal `nil` en un `case` lo deshabilita — truco elegante para apagar ramas de un `select` en un bucle.

```go
// select con timeout y cancelación: el patrón que se espera de ti
select {
case res := <-ch:
    return res, nil
case <-ctx.Done():
    return nil, ctx.Err()          // cancelación o deadline
case <-time.After(2 * time.Second):
    return nil, ErrTimeout          // ⚠️ time.After no libera el timer hasta que vence
}
```

## Fugas de goroutines: el bug característico de Go

Una goroutine que bloquea para siempre **nunca se recolecta**, y con ella todo lo que retiene. Las tres causas:

```go
// 1) Escribir en un canal que ya nadie lee (el lector se fue por timeout)
func fuga(ctx context.Context) {
    ch := make(chan int)            // sin búfer
    go func() { ch <- calcular() }() // ← si el de abajo sale antes, esta goroutine queda colgada
    select {
    case v := <-ch: usar(v)
    case <-ctx.Done(): return       // salimos... y dejamos la goroutine viva para siempre
    }
}
// Arreglo: canal con búfer 1 (el emisor nunca bloquea) o propagar ctx al productor.

// 2) Range sobre un canal que nunca se cierra
for v := range ch { ... }           // si nadie cierra ch, esta goroutine no termina

// 3) WaitGroup mal contado: Wait() eterno (Add después del go, o Done que no se ejecuta)
```

**Detección en producción:** `runtime.NumGoroutine()` como métrica (creciente y monótona = fuga) y `go tool pprof http://host:6060/debug/pprof/goroutine?debug=2`, que da los stacks agrupados: verás miles de goroutines en la misma línea. En tests, `go.uber.org/goleak` detecta la fuga automáticamente.

## `context`: reglas no negociables

1. Primer parámetro, siempre: `func F(ctx context.Context, ...)`. Nunca en un struct (salvo casos muy justificados).
2. **Quien crea un `WithCancel`/`WithTimeout` llama a `cancel()`**, siempre con `defer`: si no, fugas el timer y su goroutine interna.
3. `ctx.Value` solo para datos de petición que cruzan capas (trace id, usuario, tenant), con claves de tipo propio no exportado. **Nunca para pasar dependencias**.
4. **La cancelación es cooperativa:** cancelar no mata nada; tu código debe comprobar `ctx.Done()`/pasar el ctx a las llamadas. Una consulta SQL sin ctx sigue corriendo en la BD aunque el cliente se haya ido.
5. Propaga el **presupuesto de latencia** ([curso 00 módulo 4](../00-fundamentos-distribuidos/04-resiliencia.md)): `ctx, cancel := context.WithTimeout(ctx, restante)`.
6. Trabajo que debe sobrevivir a la petición (un evento a publicar) **no** debe usar el ctx de la petición; usa `context.WithoutCancel` (Go 1.21+) o un contexto de fondo con su propio timeout.

```go
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 800*time.Millisecond)
    defer cancel()
    row := h.db.QueryRowContext(ctx, "SELECT ...")   // ← el ctx llega hasta el driver
    ...
}
```

## `sync` y `errgroup`

- **`Mutex`**: protege invariantes, no variables. No copies un struct que contenga un `Mutex` (`go vet` lo detecta). No lo uses recursivamente: no es reentrante.
- **`RWMutex`**: solo gana con muchas más lecturas que escrituras y secciones críticas no triviales; con contención alta, su coste puede superar al `Mutex` simple.
- **`sync.Once`** para inicialización perezosa; **`sync.Map`** solo para dos patrones concretos (claves estables leídas mucho, o particiones disjuntas por goroutine) — en general un `map` + `RWMutex` es más rápido y claro.
- **`atomic`** para contadores y flags; desde Go 1.19, los tipos `atomic.Int64`, `atomic.Pointer[T]` evitan errores de alineación y son mucho más legibles.
- **`errgroup`**: `WaitGroup` + primer error + contexto cancelado. `g.SetLimit(n)` te da un pool con control de concurrencia en dos líneas.

```go
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(100)                                  // máximo 100 en vuelo
for _, id := range ids {
    id := id                                     // innecesario en Go 1.22+, obligatorio antes
    g.Go(func() error { return procesar(ctx, id) })
}
if err := g.Wait(); err != nil { return err }    // el ctx ya está cancelado para el resto
```

## Patrones que te van a pedir dibujar

- **Pipeline:** etapas conectadas por canales, cada una con `defer close(out)`, todas escuchando `ctx.Done()`.
- **Fan-out / fan-in:** N workers leyendo del mismo canal; un `WaitGroup` cierra el canal de salida cuando todos terminan.
- **Worker pool con límite** (o `errgroup.SetLimit`): el patrón para "procesar 10M de registros contra una API con máximo 100 concurrentes" — pregunta 21 del banco.
- **Semáforo** con canal con búfer o `golang.org/x/sync/semaphore` (con pesos).

## Errores comunes que delatan a un no-senior

- No cerrar canales o cerrarlos desde el lector.
- `time.After` en un bucle apretado (acumula timers hasta que vencen: fuga de memoria).
- Olvidar `defer cancel()`.
- Capturar la variable del `for` en una closure (bug clásico; corregido en Go 1.22, pero debes saber que existió y que en 1.21− es real).
- Lanzar goroutines sin saber quién las para ni cuántas puede haber (fan-out ilimitado contra un servicio externo).
- Usar `ctx.Value` como bolsa de dependencias.
- Un `panic` en una goroutine sin `recover`: **tumba el proceso entero**, no solo esa goroutine.

## 🧪 Laboratorio

1. **Provoca una fuga** con el patrón 1 de arriba, exponla en `/debug/pprof/goroutine?debug=2`, grafica `runtime.NumGoroutine()` y arréglala de dos formas (búfer 1 y propagación de ctx).
2. **`goleak` en tests:** añádelo a un paquete real y arregla lo que encuentre.
3. **Pipeline cancelable:** generador → transformación → sink, con `ctx` que corta a mitad. Verifica que no queda ninguna goroutine viva.
4. **Worker pool:** procesa 1M de items contra un servidor simulado con `errgroup.SetLimit`, midiendo throughput con límites de 10, 100 y 1.000. Encuentra el punto donde el throughput deja de subir (y relaciónalo con la ley de Little del [curso 00 módulo 5](../00-fundamentos-distribuidos/05-latencia-y-colas.md)).
5. **Race detector:** escribe una carrera sobre un map de caché, confírmala con `go test -race`, arréglala con `RWMutex` y con `sync.Map`; compara benchmarks.
6. **Deadlock:** dos mutex en orden inverso; observa `fatal error: all goroutines are asleep - deadlock!` y luego el caso más realista donde el runtime *no* lo detecta (bloqueo parcial).
7. **`GOMAXPROCS`:** ejecuta un benchmark en un contenedor con `--cpus=2` con y sin `automaxprocs`. Mide la diferencia.

**Entregable:** el pipeline cancelable y el informe del punto 4.

## ✅ Autoevaluación

1. Explica GMP y qué pasa cuando una goroutine hace una syscall bloqueante.
2. ¿Por qué 100.000 conexiones no requieren 100.000 hilos?
3. Enumera las tres causas de fuga de goroutines y cómo detectarlas en producción.
4. ¿Cuándo canal con búfer y de qué tamaño?
5. Seis reglas de `context` y por qué la cancelación es cooperativa.
6. ¿`RWMutex` siempre es mejor que `Mutex` para lecturas? Justifica.
7. `GOMAXPROCS` en Kubernetes: ¿qué problema hay y cómo lo resuelves?

## 🎯 Preguntas del banco que ya puedes responder

- [`golang-microservicios/01-go-core-avanzado.md`](../../golang-microservicios/01-go-core-avanzado.md) — 1–9, 17, 18, 20, 21
- [`golang-microservicios/03-casos-y-problemas.md`](../../golang-microservicios/03-casos-y-problemas.md) — 1 (goroutine leak), 3 (deadlock), 4 (race), 7 (contexto no propagado), 9 (panic)

---

**Siguiente:** [Módulo 2 · Runtime: memoria, escape analysis y GC](02-runtime-memoria-y-gc.md)
