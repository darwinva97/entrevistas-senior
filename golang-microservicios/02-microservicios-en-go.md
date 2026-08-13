# Microservicios en Go — Preguntas de Entrevista Senior

---

## 1. Diseño de un servidor HTTP de producción con `net/http`: timeouts y configuración

**Categoría:** HTTP / Servicios · **Tipo:** Conceptual

### 📝 Respuesta resumen
El `http.Server` por defecto **no tiene timeouts**: un cliente lento o malicioso puede retener conexiones y goroutines para siempre (slowloris). Producción exige configurar `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, `IdleTimeout` y, para timeouts por-handler, `http.TimeoutHandler` o contextos. Lo mismo aplica al cliente: `http.DefaultClient` no tiene timeout global. Un senior configura ambos lados explícitamente y sabe qué cubre cada timeout.

### 📖 Respuesta detallada
```go
srv := &http.Server{
    Addr:    ":8080",
    Handler: mux,

    ReadHeaderTimeout: 5 * time.Second,   // anti-slowloris: leer los headers
    ReadTimeout:       10 * time.Second,  // request completa (headers + body)
    WriteTimeout:      30 * time.Second,  // desde fin de lectura hasta fin de respuesta
    IdleTimeout:       120 * time.Second, // keep-alive entre requests
    MaxHeaderBytes:    1 << 20,
}
```

**Qué cubre cada timeout (esto distingue al senior):**
- `ReadHeaderTimeout`: solo la lectura de headers. Es el mínimo imprescindible — sin él, un atacante que envía un byte de header por minuto retiene una goroutine y un fd por conexión (slowloris).
- `ReadTimeout`: toda la lectura (incluye el body). Cuidado con uploads grandes legítimos: puede convenir dejarlo amplio y controlar el body con `http.MaxBytesReader` + deadline por handler.
- `WriteTimeout`: cubre la escritura de la respuesta; en HTTPS arranca desde la aceptación. Un `WriteTimeout` corto rompe streaming/SSE — para esos endpoints se usa un server aparte o `ResponseController` (Go 1.20) que permite ajustar deadlines por request: `rc := http.NewResponseController(w); rc.SetWriteDeadline(...)`.
- `IdleTimeout`: cuánto vive una conexión keep-alive ociosa; sin él, hereda `ReadTimeout` y si ambos faltan, conexiones eternas.

Los timeouts del server son de **conexión/IO**, no cancelan tu handler. Para acotar el trabajo del handler: el ctx de la request (`r.Context()`) se cancela si el cliente desconecta, y se le añade budget propio:

```go
func handler(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()
    result, err := svc.Do(ctx, ...) // toda la cadena respeta el budget
    ...
}
```

**El cliente, igual de crítico:**

```go
client := &http.Client{
    Timeout: 10 * time.Second, // total: conexión + redirects + leer el body completo
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 100, // ¡default 2! cuello de botella clásico hacia un mismo upstream
        IdleConnTimeout:     90 * time.Second,
        DialContext: (&net.Dialer{Timeout: 2 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
        TLSHandshakeTimeout: 3 * time.Second,
    },
}
```

Gotchas de cliente que el entrevistador espera: `http.DefaultClient` sin timeout (request colgada = goroutine colgada para siempre); `MaxIdleConnsPerHost=2` por defecto que, contra un único upstream con alta concurrencia, cierra y reabre conexiones sin parar (latencia + puertos en TIME_WAIT); y el contrato de **drenar y cerrar el body siempre** (`io.Copy(io.Discard, resp.Body); resp.Body.Close()`) — sin ello la conexión no vuelve al pool y se fuga.

Preferir timeouts por request con `context.WithTimeout` sobre `Client.Timeout` cuando el budget varía por endpoint. Y mencionar `http.MaxBytesReader(w, r.Body, maxSize)` como defensa estándar contra bodies gigantes.

---

## 2. Middleware en Go: patrón, orden y ejemplos reales

**Categoría:** HTTP / Servicios · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un middleware es `func(http.Handler) http.Handler`: envuelve un handler devolviendo otro que ejecuta lógica antes/después. Se componen por encadenamiento y el orden importa: recovery el más externo, luego logging/tracing, luego auth, luego rate limiting, y el handler de negocio dentro. Los datos entre middlewares viajan en el context de la request; capturar el status code exige envolver el `ResponseWriter`.

### 📖 Respuesta detallada
```go
type Middleware func(http.Handler) http.Handler

func Logging(logger *slog.Logger) Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            sw := &statusWriter{ResponseWriter: w, status: 200}
            next.ServeHTTP(sw, r)
            logger.Info("request",
                "method", r.Method, "path", r.URL.Path,
                "status", sw.status, "duration", time.Since(start),
                "request_id", RequestIDFrom(r.Context()))
        })
    }
}

// Para capturar el status hay que envolver el writer
type statusWriter struct {
    http.ResponseWriter
    status int
}
func (w *statusWriter) WriteHeader(code int) { w.status = code; w.ResponseWriter.WriteHeader(code) }

func Recovery(logger *slog.Logger) Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            defer func() {
                if rec := recover(); rec != nil {
                    logger.Error("panic", "err", rec, "stack", string(debug.Stack()))
                    http.Error(w, "internal error", http.StatusInternalServerError)
                }
            }()
            next.ServeHTTP(w, r)
        })
    }
}

// Composición (se lee de fuera hacia dentro)
func Chain(h http.Handler, mws ...Middleware) http.Handler {
    for i := len(mws) - 1; i >= 0; i-- { h = mws[i](h) }
    return h
}
handler := Chain(mux, Recovery(log), RequestID, Tracing, Logging(log), Auth(verifier))
```

**El orden y su porqué (pregunta favorita de entrevista):**
1. **Recovery primero (más externo):** debe capturar panics de todos los demás, incluido el logging.
2. **RequestID/Tracing antes que Logging:** para que el logger ya tenga el ID/trace en el context.
3. **Auth después de logging:** quieres loguear también los 401.
4. **Rate limiting antes de auth o después según el objetivo:** antes = proteger el coste de validar tokens; después = límites por usuario identificado. Saber discutir ambas opciones puntúa.

**Trampas que espera oír el entrevistador:**
- **El wrapping del ResponseWriter rompe interfaces opcionales:** el writer original puede implementar `http.Flusher`, `http.Hijacker`, `io.ReaderFrom`; tu wrapper las oculta y rompe SSE/websockets/sendfile. Solución moderna: `http.ResponseController` las descubre a través de wrappers que expongan `Unwrap() http.ResponseWriter`.
- **Escribir dos veces:** si el recovery escribe un 500 pero el handler ya había hecho `WriteHeader`, obtienes "superfluous response.WriteHeader". El wrapper con flag `wroteHeader` lo gestiona.
- **Estado por request en el context, no en el middleware:** un middleware es un singleton compartido por todas las requests; cualquier campo mutable sin lock es una race.
- **Panic tras empezar a streamear:** el recovery no puede "des-enviar" media respuesta; solo abortará la conexión. Es un límite conocido, no un bug del middleware.

Con `chi` o `gin` el patrón es idéntico conceptualmente (`chi` usa exactamente esta firma; `gin` usa su propio `HandlerFunc` con `c.Next()`). Mostrar que sabes implementarlo sin framework es lo que marca nivel.

---

## 3. gRPC en Go: unary vs streaming, deadlines y manejo de errores

**Categoría:** gRPC · **Tipo:** Conceptual

### 📝 Respuesta resumen
gRPC sobre HTTP/2 ofrece cuatro modos: unary, server streaming, client streaming y bidireccional. Los deadlines se propagan automáticamente por la cadena (`ctx` → header `grpc-timeout`), y los errores usan códigos canónicos (`codes.NotFound`, `codes.DeadlineExceeded`...) con detalles tipados vía `status.New(...).WithDetails(...)`. Reglas senior: todo cliente fija deadline, el servidor respeta `ctx.Err()`, los errores se mapean a códigos correctos (no todo es `Internal`), y los streams se consumen hasta `io.EOF`.

### 📖 Respuesta detallada
```protobuf
service OrderService {
  rpc GetOrder(GetOrderRequest) returns (Order);                      // unary
  rpc WatchOrders(WatchRequest) returns (stream OrderEvent);          // server streaming
  rpc UploadItems(stream Item) returns (UploadSummary);               // client streaming
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);          // bidi
}
```

**Deadlines — el contrato más importante:**

```go
// Cliente: SIEMPRE con deadline; sin él, una llamada puede colgar para siempre
ctx, cancel := context.WithTimeout(ctx, 800*time.Millisecond)
defer cancel()
order, err := client.GetOrder(ctx, &pb.GetOrderRequest{Id: id})

// Servidor: el deadline del cliente llega en el ctx; propágalo y respétalo
func (s *server) GetOrder(ctx context.Context, req *pb.GetOrderRequest) (*pb.Order, error) {
    if d, ok := ctx.Deadline(); ok && time.Until(d) < 50*time.Millisecond {
        return nil, status.Error(codes.DeadlineExceeded, "insufficient time budget")
    }
    o, err := s.repo.Get(ctx, req.Id) // el ctx propaga el deadline a la DB
    if errors.Is(err, ErrNotFound) {
        return nil, status.Errorf(codes.NotFound, "order %s", req.Id)
    }
    if err != nil {
        return nil, status.Error(codes.Internal, "storage failure") // sin detalles internos al cliente
    }
    return toProto(o), nil
}
```

gRPC serializa el deadline del ctx en el header `grpc-timeout`: cada salto recibe el budget **restante**. Esto es superior a HTTP donde la propagación de deadline es manual. Patrón senior: cada hop reserva margen (el caller da 800ms, tú usas 700ms hacia abajo) para poder responder el error a tiempo en vez de que te corten.

**Errores — mapeo correcto:**
- `InvalidArgument` (validación), `NotFound`, `AlreadyExists`, `FailedPrecondition` (estado no permite la op), `ResourceExhausted` (rate limit), `Unavailable` (transitorio, **retryable**), `DeadlineExceeded`, `Internal` (bug/fallo no clasificado).
- El código determina el comportamiento de retry de los clientes y las métricas: marcar un error de validación como `Internal` dispara alertas y reintentos inútiles.
- Detalles ricos: `status.New(codes.InvalidArgument, "bad request").WithDetails(&errdetails.BadRequest{...})` — errores estructurados multiplataforma.
- En el cliente: `s, ok := status.FromError(err); s.Code()` — nunca comparar strings.

**Streaming — dónde fallan los juniors:**

```go
// Server streaming (cliente): consumir hasta io.EOF y cancelar si abandonas
stream, err := client.WatchOrders(ctx, req)
for {
    ev, err := stream.Recv()
    if err == io.EOF { break }
    if err != nil { return err } // status del error del stream
    handle(ev)
}
```
- Abandonar un stream sin cancelar el ctx deja recursos vivos en ambos lados: la cancelación del ctx es la forma de cerrar.
- `Send` en un stream **no** es seguro para llamadas concurrentes (un `Send` a la vez; `Send` y `Recv` sí pueden ser concurrentes entre sí en bidi).
- El servidor de streaming debe seleccionar sobre `stream.Context().Done()` para detectar la desconexión del cliente y no producir a nadie.
- El flow control de HTTP/2 aplica backpressure automático: un consumidor lento frena al productor — es una feature, pero significa que un `Send` puede bloquear.

Bonus: keepalive configurado en ambos lados (defaults conservadores; con LBs intermedios los streams "silenciosos" se cortan), `MaxRecvMsgSize` (default 4MB — los mensajes grandes deben trocearse o usar streaming), y para balanceo con gRPC en Kubernetes: conexiones HTTP/2 persistentes se pegan a un pod — hace falta L7 LB (Envoy/Linkerd) o client-side load balancing con resolver headless.

---

## 4. Interceptors de gRPC: para qué y cómo implementarlos

**Categoría:** gRPC · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los interceptors son el equivalente gRPC del middleware HTTP: envuelven las llamadas para lógica transversal — auth, logging, métricas, tracing, recovery, retries del lado cliente. Hay cuatro tipos: unary/stream × server/client. Se encadenan con `grpc.ChainUnaryInterceptor` y el orden importa igual que en HTTP. La mayor sutileza son los stream interceptors, que exigen envolver `grpc.ServerStream` para interceptar cada mensaje.

### 📖 Respuesta detallada
```go
// Server-side unary interceptor
func AuthInterceptor(verifier TokenVerifier) grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo,
        handler grpc.UnaryHandler) (any, error) {

        md, _ := metadata.FromIncomingContext(ctx)
        tokens := md.Get("authorization")
        if len(tokens) == 0 {
            return nil, status.Error(codes.Unauthenticated, "missing token")
        }
        claims, err := verifier.Verify(ctx, tokens[0])
        if err != nil {
            return nil, status.Error(codes.Unauthenticated, "invalid token")
        }
        return handler(WithClaims(ctx, claims), req) // inyecta identidad en el ctx
    }
}

func RecoveryInterceptor(log *slog.Logger) grpc.UnaryServerInterceptor {
    return func(ctx context.Context, req any, info *grpc.UnaryServerInfo,
        handler grpc.UnaryHandler) (resp any, err error) {
        defer func() {
            if r := recover(); r != nil {
                log.Error("panic in handler", "method", info.FullMethod, "panic", r,
                    "stack", string(debug.Stack()))
                err = status.Error(codes.Internal, "internal error")
            }
        }()
        return handler(ctx, req)
    }
}

srv := grpc.NewServer(
    grpc.ChainUnaryInterceptor(
        RecoveryInterceptor(log),   // externo: captura panics de todo
        otelgrpc... /* tracing */,
        MetricsInterceptor(reg),
        AuthInterceptor(verifier),  // interno: más cercano al handler
    ),
)
```

**Recovery en gRPC es aún más crítico que en HTTP:** el servidor gRPC de Go **no** recovera panics de handlers por defecto — un panic en un handler tumba el proceso completo (a diferencia de `net/http`, que recovera por conexión). Todo servidor gRPC de producción lleva recovery interceptor; olvidarlo es un incidente esperando fecha.

**Stream interceptors — la parte que separa niveles:** el interceptor de stream corre **una vez al abrir el stream**, no por mensaje. Para actuar por mensaje hay que envolver el stream:

```go
type wrappedStream struct {
    grpc.ServerStream
    ctx context.Context
}
func (w *wrappedStream) Context() context.Context { return w.ctx }
func (w *wrappedStream) RecvMsg(m any) error {
    msgCounter.Inc()
    return w.ServerStream.RecvMsg(m) // interceptar cada mensaje recibido
}

func StreamAuth(v TokenVerifier) grpc.StreamServerInterceptor {
    return func(srv any, ss grpc.ServerStream, info *grpc.StreamServerInfo,
        handler grpc.StreamHandler) error {
        ctx, err := authenticate(ss.Context(), v)
        if err != nil { return err }
        return handler(srv, &wrappedStream{ServerStream: ss, ctx: ctx})
    }
}
```
El truco de sobrescribir `Context()` es la única forma de inyectar valores al ctx de un stream — pregunta trampa habitual.

**Client-side:** retries con backoff (solo para códigos retryables y métodos idempotentes), inyección de metadata (trace, auth), métricas de latencia por método. Alternativa declarativa: retry policy en la service config de gRPC (JSON), que evita reimplementar; conocer ambas opciones puntúa.

**Ecosistema:** no reinventar — `go-grpc-middleware` (recovery, auth, validator), `otelgrpc` para tracing, `grpc-ecosystem/go-grpc-prometheus`. En entrevista: saber escribirlos a mano Y saber cuándo usar los estándar.

---

## 5. Graceful shutdown completo de un microservicio en Go

**Categoría:** Ciclo de vida / Operación · **Tipo:** Conceptual

### 📝 Respuesta resumen
Graceful shutdown: capturar SIGTERM/SIGINT con `signal.NotifyContext`, dejar de aceptar trabajo nuevo (`http.Server.Shutdown`, `grpc.GracefulStop`, pausar consumers), esperar a que el trabajo en vuelo termine con un deadline (menor que el `terminationGracePeriodSeconds` de Kubernetes), y cerrar recursos en orden inverso a su apertura. En Kubernetes además: fallar el readiness probe primero y esperar unos segundos a que los endpoints se propaguen antes de cerrar, o las LBs seguirán mandando tráfico a un pod que ya no acepta.

### 📖 Respuesta detallada
```go
func main() {
    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
    defer stop()

    deps := buildDependencies(ctx) // DB, kafka, clients...
    srv := &http.Server{Addr: ":8080", Handler: buildHandler(deps), ...}

    g, gctx := errgroup.WithContext(ctx)

    g.Go(func() error {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            return err // fallo real del server también dispara el shutdown de todo
        }
        return nil
    })

    g.Go(func() error {
        consumer := deps.Kafka.NewConsumer(...)
        return consumer.Run(gctx) // los consumers respetan el mismo ctx
    })

    g.Go(func() error {
        <-gctx.Done() // señal recibida (o fallo de otro componente)

        // 1. En Kubernetes: readiness ya está en "not ready" (ver abajo); pequeña espera
        //    para que kube-proxy/LBs dejen de enrutar hacia este pod
        time.Sleep(5 * time.Second)

        // 2. Cierre del server con deadline propio
        shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
        defer cancel()
        return srv.Shutdown(shutdownCtx) // deja de aceptar; espera a las requests en vuelo
    })

    err := g.Wait()
    deps.Close() // orden inverso: primero lo que produce, al final la DB
    if err != nil { log.Fatal(err) }
}
```

**Los detalles que evalúa el entrevistador:**

1. **`srv.Shutdown` usa `context.Background()` derivado, no el ctx cancelado:** el error clásico es `srv.Shutdown(ctx)` con el mismo ctx de la señal — ya está cancelado, así que Shutdown aborta inmediatamente matando las requests en vuelo. El shutdown necesita su **propio** budget.
2. **La carrera del load balancer en Kubernetes:** SIGTERM llega al pod *a la vez* que se inicia la retirada del endpoint; durante segundos siguen llegando requests. Si cierras el listener al instante → ráfaga de errores 502/connection refused en cada deploy. Solución: hacer fallar el readiness probe al recibir la señal + `sleep` breve (o `preStop` hook con sleep) antes de `Shutdown`. Los errores "solo durante deploys" casi siempre son esto.
3. **Presupuestos anidados:** `terminationGracePeriodSeconds` (default 30s) > sleep de propagación + timeout de Shutdown + cierre de consumers + margen. Si te pasas, llega SIGKILL y todo lo "graceful" fue teatro.
4. **Consumers y workers:** para Kafka, dejar de hacer poll, terminar el batch actual, **commitear offsets** y salir del consumer group limpiamente (rebalance rápido). Para worker pools: cerrar el channel de entrada, `wg.Wait()` con timeout.
5. **Shutdown ≠ Close:** `srv.Close()` corta conexiones en seco; `Shutdown` espera activas pero **no espera websockets/conexiones hijacked** (hay que registrarlas con `srv.RegisterOnShutdown` y cerrarlas aparte).
6. **In-flight con context:** las requests en vuelo durante shutdown conservan su ctx intacto — bien. Pero el trabajo que lanzaste con `context.WithoutCancel` (auditoría async) debe estar contabilizado en un WaitGroup propio o morirá con el proceso.

Prevención/verificación: test de integración que envía SIGTERM bajo carga y asegura cero errores; métrica de requests interrumpidas por deploy; y en el pipeline, deploys canary donde un pico de 5xx en el rollout delata un shutdown mal hecho.

---

## 6. Worker pools y control de concurrencia en servicios

**Categoría:** Concurrencia aplicada · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un worker pool acota la concurrencia: N goroutines fijas consumiendo de un channel de jobs, con cierre ordenado (close del channel + WaitGroup), manejo de panics por worker y cancelación por context. Alternativas según el caso: `errgroup.SetLimit` para lotes con fail-fast, semáforo (`x/sync/semaphore` o channel buffered) para limitar secciones concretas. La decisión clave es el tamaño: CPU-bound ≈ GOMAXPROCS; I/O-bound se dimensiona por el recurso externo (pool de DB, rate limit del upstream), no por la CPU.

### 📖 Respuesta detallada
```go
type Pool struct {
    jobs    chan Job
    wg      sync.WaitGroup
    logger  *slog.Logger
}

func NewPool(ctx context.Context, workers, queueSize int, logger *slog.Logger) *Pool {
    p := &Pool{jobs: make(chan Job, queueSize), logger: logger}
    p.wg.Add(workers)
    for i := 0; i < workers; i++ {
        go p.worker(ctx, i)
    }
    return p
}

func (p *Pool) worker(ctx context.Context, id int) {
    defer p.wg.Done()
    for {
        select {
        case job, ok := <-p.jobs:
            if !ok { return } // channel cerrado: drenado completo y salir
            p.safeRun(ctx, job)
        case <-ctx.Done():
            return // cancelación: salir sin drenar (elección de política)
        }
    }
}

func (p *Pool) safeRun(ctx context.Context, job Job) {
    defer func() {
        if r := recover(); r != nil { // un panic no mata al worker ni al proceso
            p.logger.Error("job panic", "job", job.ID, "panic", r, "stack", string(debug.Stack()))
        }
    }()
    if err := job.Run(ctx); err != nil {
        p.logger.Error("job failed", "job", job.ID, "err", err)
        // según política: DLQ, retry con backoff, métrica
    }
}

// Submit con backpressure explícito
func (p *Pool) Submit(ctx context.Context, j Job) error {
    select {
    case p.jobs <- j:
        return nil
    case <-ctx.Done():
        return ctx.Err()
    }
}

func (p *Pool) Drain() { close(p.jobs); p.wg.Wait() } // shutdown: acaba lo encolado
```

**Decisiones de diseño que hay que saber defender:**

1. **Tamaño del pool:** CPU-bound → `runtime.GOMAXPROCS(0)` workers (más solo añade context switching). I/O-bound → dimensionar por el downstream: si la DB tiene `MaxOpenConns=25`, 200 workers solo crean cola dentro del driver. Ideal: configurable + métricas para ajustar (Little's Law: concurrencia = throughput × latencia como primera aproximación).
2. **Cola acotada + `Submit` bloqueante = backpressure real.** Las tres políticas al saturarse: bloquear (protege, propaga la presión hacia arriba), rechazar (`TrySubmit` con `default:` → el caller decide, típico en APIs), descartar (telemetría). Cola infinita = ocultar el problema hasta el OOM.
3. **Dos vías de salida distintas:** `close(jobs)` → los workers drenan lo pendiente y salen (shutdown graceful); `ctx.Done()` → salida inmediata (shutdown forzado). Tener ambas y saber cuál usa el caller es diseño maduro.
4. **Recover por job:** sin él, un panic en un job tumba el proceso entero (no hay recover global en Go). Con él, un job venenoso no mata a los demás — pero loguea con stack y cuenta métricas, o esconderás bugs.
5. **Errores:** este pool "traga" errores (log + política). Si el caller necesita resultados: channel de resultados por job, o futures (`chan Result` de capacidad 1 dentro del Job). Para lotes finitos, `errgroup.SetLimit` es menos código.

**Cuándo NO montar un pool:** para un lote finito de tareas, `errgroup` con `SetLimit` hace lo mismo en 5 líneas. El pool de larga vida se justifica con flujo continuo (consumers, schedulers, procesamiento en background). Y mención de madurez: goroutines baratas ≠ concurrencia infinita gratis — el límite lo pone siempre el recurso más escaso (DB, memoria, upstream).

---

## 7. Rate limiting en Go: algoritmos e implementación

**Categoría:** Resiliencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
Token bucket es el algoritmo estándar (permite bursts controlados) y `golang.org/x/time/rate` su implementación canónica: `Allow` para rechazar, `Wait` para encolar con ctx, `Reserve` para programar. Para límites por cliente: mapa de limiters con expiración. Para límites distribuidos entre réplicas: Redis con script Lua o middleware en el gateway. La decisión clave es qué hacer al superar el límite (429 + Retry-After, encolar, degradar) y dónde aplicarlo (ingress, por servicio, por cliente).

### 📖 Respuesta detallada
```go
import "golang.org/x/time/rate"

// 100 req/s sostenidas, bursts de hasta 200
limiter := rate.NewLimiter(rate.Limit(100), 200)

// Estilo servidor: rechazar de inmediato
func RateLimitMiddleware(l *rate.Limiter) Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if !l.Allow() {
                w.Header().Set("Retry-After", "1")
                http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
                return
            }
            next.ServeHTTP(w, r)
        })
    }
}

// Estilo cliente: esperar el hueco respetando cancelación
if err := limiter.Wait(ctx); err != nil { return err } // ctx cancelado o deadline < espera
resp, err := api.Call(ctx, req)
```

**Algoritmos y trade-offs (hay que saber compararlos):**
- **Token bucket:** tokens se rellenan a tasa fija hasta un máximo (burst). Permite ráfagas naturales del tráfico real. Es el default correcto.
- **Leaky bucket:** salida a tasa constante — suaviza el tráfico hacia el downstream, útil como *shaper* de salida más que como limitador de entrada.
- **Fixed window:** contador por ventana (simple en Redis: `INCR` + `EXPIRE`), pero sufre el **problema del borde**: 100 req al final de una ventana + 100 al inicio de la siguiente = 200 en un instante.
- **Sliding window (log o counter ponderado):** corrige el borde a cambio de más memoria/cómputo. El sliding window counter (interpolación entre dos ventanas) es el compromiso habitual en Redis.

**Por cliente (API keys, IPs):**

```go
type ClientLimiters struct {
    mu  sync.Mutex
    m   map[string]*clientLimiter // limiter + lastSeen
}
func (c *ClientLimiters) Get(key string) *rate.Limiter {
    c.mu.Lock(); defer c.mu.Unlock()
    cl, ok := c.m[key]
    if !ok {
        cl = &clientLimiter{lim: rate.NewLimiter(perClientRate, perClientBurst)}
        c.m[key] = cl
    }
    cl.lastSeen = time.Now()
    return cl.lim
}
// + goroutine janitor que borra entradas con lastSeen > TTL (o el mapa crece sin límite)
```
El janitor de limpieza es el detalle que separa: sin él, este mapa es un memory leak dirigible por el atacante (una IP nueva por request).

**Distribuido — el salto de nivel:** `rate.Limiter` es por proceso; con 10 réplicas, "100 RPS" se convierte en 1000. Opciones:
1. **Aceptar límite aproximado local** (`limit / numRéplicas`): simple, falla con LB desigual o autoscaling.
2. **Redis centralizado** con script Lua atómico (leer contador + decidir + incrementar en una operación): exacto, añade una llamada de red al hot path — se mitiga con permisos por lotes (pedir 10 tokens de golpe y gastarlos localmente).
3. **En el gateway/ingress** (Envoy rate limit service, NGINX): saca la complejidad de los servicios; el límite fino por lógica de negocio sigue necesitando el servicio.

Además: distinguir rate limiting (protege de exceso de tasa) de **load shedding** (rechazar por sobrecarga real del servidor — cola llena, latencia interna alta) y de circuit breaking (protege al *caller* de un downstream roto). Devolver 429 con `Retry-After` y documentar los límites es parte del contrato de API.

---

## 8. Circuit breakers: por qué, cómo funcionan y su implementación en Go

**Categoría:** Resiliencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un circuit breaker evita martillear un downstream que ya está fallando: en estado *closed* deja pasar y cuenta fallos; al superar el umbral pasa a *open* y rechaza al instante (fail fast, sin gastar timeout); tras un intervalo pasa a *half-open* y deja pasar unas pruebas — si van bien cierra, si no reabre. En Go: `sony/gobreaker` o implementación propia. Claves senior: qué cuenta como fallo (5xx y timeouts sí, 4xx no), fallback definido para el estado open, y breaker por endpoint/host, no global.

### 📖 Respuesta detallada
El problema que resuelve: sin breaker, cuando el servicio B cae, cada llamada de A consume su timeout completo (p.ej. 2s), las goroutines y conexiones de A se acumulan esperando, la latencia de A explota y el fallo **cascadea** hacia arriba. Además, los reintentos de todos los upstream machacan a B justo cuando intenta recuperarse (fenómeno de *retry storm* / metastable failure). El breaker corta ambas cosas: A falla en microsegundos y B recibe tregua.

```go
import "github.com/sony/gobreaker/v2"

cb := gobreaker.NewCircuitBreaker[*PaymentResponse](gobreaker.Settings{
    Name:        "payments-api",
    MaxRequests: 5,                     // pruebas permitidas en half-open
    Interval:    30 * time.Second,      // ventana de conteo en closed
    Timeout:     10 * time.Second,      // cuánto permanece open antes de half-open
    ReadyToTrip: func(c gobreaker.Counts) bool {
        return c.Requests >= 10 && float64(c.TotalFailures)/float64(c.Requests) >= 0.5
    },
    IsSuccessful: func(err error) bool {
        // CLAVE: los errores de negocio NO abren el circuito
        if err == nil { return true }
        var apiErr *APIError
        if errors.As(err, &apiErr) && apiErr.Status < 500 { return true } // 4xx = éxito para el breaker
        return false // timeouts, 5xx, connection refused = fallo
    },
    OnStateChange: func(name string, from, to gobreaker.State) {
        breakerState.WithLabelValues(name).Set(float64(to)) // métrica + alerta
    },
})

resp, err := cb.Execute(func() (*PaymentResponse, error) {
    return paymentsClient.Charge(ctx, req)
})
if errors.Is(err, gobreaker.ErrOpenState) {
    return s.fallbackCharge(ctx, req) // encolar para después, respuesta degradada, o error claro
}
```

**Los matices que marcan seniority:**

1. **Clasificación de errores:** un breaker que cuenta 404s o errores de validación como fallos se abre por bugs del *caller* y tumba un downstream sano. Solo errores que indican que el downstream está mal: 5xx, timeouts, fallos de conexión, `codes.Unavailable`.
2. **Granularidad:** un breaker por servicio downstream (o por endpoint crítico), nunca uno global — que fallen los pagos no debe cortar el catálogo. En clientes multi-host, por host.
3. **Umbral por tasa con mínimo de requests** (`Requests >= 10 && ratio >= 0.5`), no por conteo absoluto: 5 fallos seguidos a las 3 AM con 5 RPM no significa lo mismo que con 5000 RPS.
4. **El fallback es una decisión de producto**, no técnica: ¿respuesta cacheada/stale? ¿encolar y confirmar async? ¿degradar la feature? ¿error explícito? "Pongo un breaker" sin definir el comportamiento en open es trabajo a medias.
5. **Half-open con pocas pruebas (`MaxRequests`)**: dejar pasar todo el tráfico al recuperarse re-tumba al downstream frío (caches vacías, pools por llenar). Relacionado: jitter en `Timeout` entre réplicas para que no prueben todas a la vez.
6. **Interacción con retries y deadlines:** orden correcto por llamada: breaker fuera, retry dentro (un "fallo" del breaker debe ser el resultado neto tras retries... o al revés según filosofía — lo importante es poder justificarlo: retry-dentro evita que fallos transitorios abran el circuito; breaker-dentro reacciona más rápido). Y siempre con deadline total, no por intento.

**Observabilidad:** el cambio de estado es un evento de primer orden — métrica + log + alerta. Un breaker abierto durante horas sin que nadie lo sepa es un outage silencioso. Alternativa arquitectural: service mesh (Istio/Linkerd) hace outlier detection fuera del código; el breaker en código sigue aportando el fallback de negocio.

---

## 9. Kafka en Go: consumer groups, rebalancing y elección de librería

**Categoría:** Mensajería / Kafka · **Tipo:** Conceptual

### 📝 Respuesta resumen
En Go las opciones principales son `franz-go` (moderna, rendimiento y API coherente), `sarama` (veterana, muy usada, API de bajo nivel con más pie para errores) y `confluent-kafka-go` (bindings de librdkafka, CGo). Conceptos que dominan la entrevista: consumer groups y particiones (una partición → un consumer del grupo; el paralelismo máximo = nº de particiones), rebalancing (cooperative vs eager), commit de offsets (auto vs manual, y el at-least-once que implica), y orden garantizado solo por partición vía key.

### 📖 Respuesta detallada
**Modelo mental imprescindible:** un topic tiene N particiones; dentro de un consumer group, cada partición la lee **exactamente un** consumer. Más consumers que particiones = consumers ociosos. El orden solo existe **dentro de una partición**, y la key del mensaje decide la partición (hash) — por eso "eventos del mismo pedido en orden" = key `order_id`.

```go
// franz-go: consumo con commit manual tras procesar (at-least-once)
cl, err := kgo.NewClient(
    kgo.SeedBrokers(brokers...),
    kgo.ConsumerGroup("billing-service"),
    kgo.ConsumeTopics("orders"),
    kgo.DisableAutoCommit(), // control explícito del commit
)

for {
    fetches := cl.PollFetches(ctx)
    if fetches.IsClientClosed() { return }
    fetches.EachError(func(t string, p int32, err error) {
        log.Error("fetch error", "topic", t, "partition", p, "err", err)
    })

    fetches.EachRecord(func(rec *kgo.Record) {
        if err := process(ctx, rec); err != nil {
            // decisión crítica: retry inline / DLQ / parar la partición — nunca "log y sigo" sin más
            sendToDLQ(ctx, rec, err)
        }
    })
    if err := cl.CommitUncommittedOffsets(ctx); err != nil {
        log.Error("commit failed", "err", err) // el batch se reprocesará: por eso idempotencia
    }
}
```

**Semánticas de entrega — la pregunta siempre cae:**
- **At-most-once:** commit antes de procesar → si mueres procesando, el mensaje se pierde.
- **At-least-once (el estándar):** procesar → commit. Si mueres tras procesar y antes del commit, reprocesas → **el handler debe ser idempotente**. Esta frase es obligatoria en la respuesta.
- **Exactly-once:** solo dentro del ecosistema Kafka (transacciones productor-consumidor, read-process-write). Con side effects externos (DB, HTTP) no existe: se simula con idempotencia + outbox.

**Rebalancing y sus dolores:**
- Al entrar/salir un consumer (deploy, crash, scale), el grupo redistribuye particiones. Con la estrategia *eager* clásica, todos sueltan todo y se reasigna (stop-the-world del grupo); *cooperative/incremental* (soportada por franz-go y sarama modernos) solo mueve las particiones necesarias — respuesta correcta para deploys frecuentes.
- **El bug clásico:** procesamiento más lento que `max.poll.interval` (o su equivalente) → el broker considera muerto al consumer → rebalance → otro consumer retoma desde el último commit → reproceso, y si el lento revive, *fencing* o loop de rebalances. Señales: rebalances constantes en las métricas + lag que no baja.
- En el shutdown graceful: cerrar el consumer limpiamente (leave group) para un rebalance inmediato, y commitear antes de salir.

**Elección de librería (respuesta honesta):** `franz-go` para código nuevo (API coherente, cooperative rebalancing, transacciones, sin CGo, gran rendimiento); `sarama` si el equipo ya lo opera (madura, pero API propensa a errores — p.ej. su ConsumerGroup handler y la gestión de sesiones); `confluent-kafka-go` si necesitas paridad exacta con librdkafka o features de Confluent, aceptando CGo (build más complejo, debugging más opaco).

**Producer también puntúa:** `acks=all` + producer idempotente para no duplicar en reintentos del broker, batching/linger para throughput, y manejo del error de mensaje demasiado grande. Y NATS como contraste si sale: JetStream da persistencia estilo Kafka con operación más simple; Kafka gana en ecosistema, retención masiva y particionado maduro.

---

## 10. Patrón Outbox e idempotencia: publicar eventos sin perder ni duplicar

**Categoría:** Mensajería / Consistencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
El problema dual-write: guardar en DB y publicar a Kafka son dos sistemas sin transacción común — cualquier orden deja un hueco (commit sin evento, o evento sin commit). El patrón Outbox lo resuelve escribiendo el evento en una tabla `outbox` **dentro de la misma transacción** que el cambio de negocio; un relay (polling o CDC/Debezium) lo publica después. Como el relay es at-least-once, los consumidores deben ser idempotentes (tabla de mensajes procesados o upsert natural). Outbox + idempotencia del consumidor = "efectivamente exactly-once".

### 📖 Respuesta detallada
**El bug que motiva todo:**

```go
// ROTO — dual write
tx.Commit()                      // pedido guardado
kafka.Publish(ctx, orderCreated) // si esto falla: pedido sin evento → billing nunca se entera
// (y al revés — publicar antes del commit — es peor: evento de algo que no existe)
```

**Outbox:**

```go
func (s *OrderService) Create(ctx context.Context, o Order) error {
    return s.db.WithTx(ctx, func(tx *sql.Tx) error {
        if err := insertOrder(ctx, tx, o); err != nil { return err }
        evt := OrderCreated{ID: uuid.New(), OrderID: o.ID, At: time.Now()}
        payload, _ := json.Marshal(evt)
        _, err := tx.ExecContext(ctx,
            `INSERT INTO outbox (id, aggregate_id, topic, payload, created_at)
             VALUES ($1, $2, $3, $4, now())`,
            evt.ID, o.ID, "orders", payload)
        return err
    }) // una sola transacción: negocio + evento son atómicos
}

// Relay (polling publisher) en background:
func (r *Relay) run(ctx context.Context) {
    tick := time.NewTicker(200 * time.Millisecond)
    defer tick.Stop()
    for {
        select {
        case <-ctx.Done(): return
        case <-tick.C:
            rows, _ := r.db.QueryContext(ctx, `
                SELECT id, aggregate_id, topic, payload FROM outbox
                ORDER BY created_at LIMIT 100
                FOR UPDATE SKIP LOCKED`) // varias réplicas del relay sin pisarse
            for _, m := range scan(rows) {
                // key = aggregate_id → eventos del mismo pedido en la misma partición (orden)
                if err := r.producer.Publish(ctx, m.Topic, m.AggregateID, m.Payload); err != nil {
                    break // reintentará el próximo tick; NO borrar
                }
                r.db.ExecContext(ctx, `DELETE FROM outbox WHERE id = $1`, m.ID)
            }
        }
    }
}
```

Puntos finos del relay: `FOR UPDATE SKIP LOCKED` permite escalar réplicas sin duplicar demasiado; el crash entre Publish y DELETE ⇒ republicación ⇒ **at-least-once por construcción**; alternativa superior en volumen: CDC con Debezium leyendo el WAL de la tabla outbox (sin polling, menor latencia, pero una pieza más que operar).

**Idempotencia del consumidor — la otra mitad obligatoria:**

```go
func (h *BillingHandler) OnOrderCreated(ctx context.Context, evt OrderCreated) error {
    return h.db.WithTx(ctx, func(tx *sql.Tx) error {
        res, err := tx.ExecContext(ctx,
            `INSERT INTO processed_messages (id) VALUES ($1) ON CONFLICT DO NOTHING`, evt.ID)
        if err != nil { return err }
        if n, _ := res.RowsAffected(); n == 0 { return nil } // duplicado: ya procesado, ACK y fuera
        return createInvoice(ctx, tx, evt) // efecto + marca en LA MISMA transacción
    })
}
```

Claves: el ID de idempotencia lo genera el **productor** (viaja en el evento); la marca de procesado y el efecto van en la misma transacción (si no, reaparece la dual-write en el consumidor); la tabla `processed_messages` necesita TTL/limpieza. Cuando el efecto es un upsert natural (`ON CONFLICT UPDATE` con datos deterministas), la idempotencia sale gratis sin tabla auxiliar.

**Trade-offs a verbalizar:** Outbox añade latencia (tick del relay o pipeline CDC), una tabla caliente que hay que purgar, y complejidad operativa — para eventos "best effort" (analytics no críticos) puede bastar publicar después del commit aceptando pérdidas raras y midiendo. La respuesta senior siempre clasifica los eventos por criticidad antes de imponer outbox a todo.

---

## 11. Patrón Saga: transacciones distribuidas sin 2PC

**Categoría:** Patrones distribuidos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una saga descompone una transacción de negocio que cruza servicios en pasos locales, cada uno con su **compensación**; si un paso falla, se ejecutan las compensaciones de los anteriores en orden inverso. Dos estilos: **coreografía** (cada servicio reacciona a eventos — simple para 2-3 pasos, invisible después) y **orquestación** (un coordinador con máquina de estados persistida — trazable y testeable, es el default sensato para flujos serios). Requisitos duros: pasos y compensaciones idempotentes, estado persistido, y diseño para fallos de compensación.

### 📖 Respuesta detallada
2PC no se usa entre microservicios (bloqueo sincrónico, coordinador como SPOF, no soportado por la mayoría del stack moderno); la saga acepta **consistencia eventual** con estados intermedios visibles a cambio de disponibilidad.

**Ejemplo — pedido de e-commerce:** reservar stock → cobrar → crear envío. Compensaciones: liberar stock ← reembolsar ← cancelar envío.

**Orquestación en Go (esqueleto realista):**

```go
type SagaState string
const (
    StateStockReserved SagaState = "STOCK_RESERVED"
    StatePaymentDone   SagaState = "PAYMENT_DONE"
    StateCompleted     SagaState = "COMPLETED"
    StateCompensating  SagaState = "COMPENSATING"
    StateFailed        SagaState = "FAILED"
)

func (o *Orchestrator) Run(ctx context.Context, sagaID string, order Order) error {
    // Cada transición se PERSISTE antes de avanzar: el orquestador debe sobrevivir a su propio crash
    if err := o.store.Init(ctx, sagaID, order); err != nil { return err }

    if err := o.stock.Reserve(ctx, sagaID, order.Items); err != nil {
        return o.fail(ctx, sagaID, err) // nada que compensar aún
    }
    o.store.SetState(ctx, sagaID, StateStockReserved)

    if err := o.payments.Charge(ctx, sagaID, order.Total); err != nil {
        return o.compensate(ctx, sagaID, err) // libera stock
    }
    o.store.SetState(ctx, sagaID, StatePaymentDone)

    if err := o.shipping.Create(ctx, sagaID, order); err != nil {
        return o.compensate(ctx, sagaID, err) // reembolsa + libera stock, en orden inverso
    }
    return o.store.SetState(ctx, sagaID, StateCompleted)
}
```

`sagaID` viaja en **todas** las llamadas como idempotency key: si el orquestador muere tras `Charge` y reintenta, payments detecta el duplicado y responde el resultado anterior sin cobrar dos veces. Un recovery job escanea sagas en estados intermedios más viejas que X y las retoma/compensa.

**Los puntos que separan a un senior:**

1. **Las compensaciones no son rollbacks:** son operaciones de negocio nuevas (un reembolso no borra el cobro, crea un movimiento contrario) y **pueden fallar**. Política obligatoria: retry con backoff y, agotado, cola de intervención manual + alerta. Una saga colgada en COMPENSATING es un incidente de negocio (dinero retenido).
2. **Clasificar pasos:** *compensables* (reservar stock), *pivote* (el cobro: tras él no se aborta hacia atrás, se avanza sí o sí) y *reintentables* (crear envío: no puede fallar definitivamente, solo reintentarse). Ordenar el flujo con el pivote lo más tarde posible minimiza compensaciones dolorosas.
3. **Aislamiento perdido:** entre pasos, otros actores ven estado intermedio (stock reservado de un pedido que se cancelará). Contramedidas: *semantic locking* (estado RESERVADO explícito en lugar de descontar), o rediseñar para tolerar la anomalía.
4. **Coreografía vs orquestación, criterio real:** coreografía (eventos: `OrderCreated` → stock reacciona y emite `StockReserved` → payments reacciona...) desacopla pero el flujo completo no existe en ningún sitio — depurar "por qué este pedido está a medias" exige arqueología de eventos. Orquestación centraliza el flujo (testeable como máquina de estados, trazable), a cambio de un servicio más y cierto acoplamiento. Con >3 pasos o compensaciones no triviales: orquestación. Mención de herramientas: Temporal (durable execution) resuelve persistencia+reintentos+recovery del orquestador a cambio de operar su cluster — conocerlo es un plus.
5. **Observabilidad:** tabla/dashboard de sagas por estado y edad; alerta sobre sagas estancadas. El trace distribuido debe enlazar todos los pasos vía `sagaID`.

---

## 12. Estructura de proyecto en Go: `internal/`, hexagonal y organización de paquetes

**Categoría:** Arquitectura / Proyecto · **Tipo:** Conceptual

### 📝 Respuesta resumen
Go no impone estructura, pero las convenciones maduras sí: `cmd/<app>/main.go` como punto de entrada fino, `internal/` para todo lo no importable desde fuera del módulo (encapsulación real, garantizada por el compilador), y paquetes organizados **por dominio/feature, no por capa técnica** (evitar `controllers/`, `services/`, `models/` globales). La arquitectura hexagonal en Go se reduce a: el dominio define interfaces (puertos), los adaptadores las implementan, y las dependencias apuntan hacia dentro — sin frameworks, con interfaces pequeñas definidas donde se consumen.

### 📖 Respuesta detallada
```
order-service/
├── cmd/
│   └── server/main.go          # wiring: config, DI manual, arranque. FINO.
├── internal/
│   ├── order/                  # dominio: por FEATURE, no por capa
│   │   ├── order.go            # entidades + lógica de negocio pura
│   │   ├── service.go          # casos de uso; define los PUERTOS que necesita
│   │   └── service_test.go
│   ├── platform/               # adaptadores de infraestructura
│   │   ├── postgres/order_repo.go   # implementa order.Repository
│   │   └── kafka/publisher.go       # implementa order.EventPublisher
│   └── transport/
│       ├── httpapi/handler.go  # HTTP → llama a order.Service
│       └── grpcapi/server.go
├── go.mod
└── Makefile
```

**Las decisiones y su porqué:**

1. **`internal/` es la única encapsulación real a nivel de módulo:** el compilador prohíbe importar `foo/internal/...` desde fuera de `foo`. Todo lo que no sea API pública del módulo va dentro — en un microservicio típico, *casi todo*. Un `pkg/` con la mitad del código es un anti-patrón habitual: publica implícitamente lo que nadie debería importar.
2. **Paquetes por dominio, no por capa:** `internal/order`, `internal/billing` — cada uno cohesivo, con sus tipos y lógica. El layout por capas (`models/`, `services/`) produce paquetes-cajón sin cohesión, imports circulares al crecer, y nombres redundantes (`services.OrderService`). El nombre del paquete es parte del nombre: `order.Service`, no `order.OrderService`.
3. **Hexagonal a la manera Go — interfaces definidas por el consumidor:**

```go
// internal/order/service.go — el DOMINIO declara lo que necesita (puerto)
type Repository interface {
    Get(ctx context.Context, id string) (*Order, error)
    Save(ctx context.Context, o *Order) error
}
type EventPublisher interface {
    OrderCreated(ctx context.Context, o *Order) error
}

type Service struct {
    repo   Repository
    events EventPublisher
}
func NewService(r Repository, e EventPublisher) *Service { return &Service{r, e} }
```

`internal/platform/postgres` importa `order` (para implementar `order.Repository`), nunca al revés: **las dependencias apuntan hacia el dominio**. No hace falta el ceremonial de puertos/adaptadores con nombres pomposos: son interfaces pequeñas (1-3 métodos) declaradas junto a quien las usa. Esto además hace el dominio testeable con mocks triviales sin frameworks.

4. **`main.go` como composition root:** ahí (y solo ahí) se conoce todo: se leen configs, se construyen adaptadores concretos y se inyectan. Si `main` supera ~150 líneas, se extrae a `internal/app/wire.go`, pero sigue siendo composición manual y explícita.
5. **Sobre `golang-standards/project-layout`:** conocido y útil como menú, pero no es oficial y aplicarlo entero a un microservicio pequeño es sobre-ingeniería. Empezar plano y extraer paquetes cuando duela es más idiomático que crear 12 directorios el día uno. Decir esto con criterio puntúa más que recitar el layout.
6. **Multi-módulo / monorepo:** módulo único por servicio como default; `go.work` para desarrollo local multi-servicio; módulos compartidos (`libs/events`) versionados con cuidado porque acoplan deploys.

Red flags que un entrevistador busca: lógica de negocio en handlers HTTP, el paquete `utils/`/`common/` (imán de acoplamiento), interfaces gigantes definidas junto a la implementación "por si acaso", y estructura calcada de Java (una interface por clase, factories de factories).

---

## 13. Inyección de dependencias en Go: manual, wire, fx — criterio

**Categoría:** Arquitectura / Proyecto · **Tipo:** Conceptual

### 📝 Respuesta resumen
En Go, la DI idiomática es **constructor injection manual** en `main`: funciones `NewX(deps...)` compuestas explícitamente. No hay (ni se echa de menos) un container de runtime como Spring. Para grafos grandes existen `google/wire` (generación de código en compile-time, cero magia en runtime) y `uber-go/fx` (container por reflection con lifecycle). Criterio: manual hasta que el wiring duela de verdad; wire si prefieres errores en compilación; fx solo si adoptas también su modelo de lifecycle y su curva.

### 📖 Respuesta detallada
**DI manual — el default idiomático:**

```go
func main() {
    cfg := config.Load()
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    db, err := postgres.Connect(cfg.DB)          // adaptador
    if err != nil { logger.Error(...); os.Exit(1) }
    defer db.Close()

    repo    := postgres.NewOrderRepo(db)
    pub     := kafka.NewPublisher(cfg.Kafka)
    svc     := order.NewService(repo, pub)        // dominio recibe interfaces
    handler := httpapi.NewHandler(svc, logger)

    srv := &http.Server{Addr: cfg.Addr, Handler: handler}
    ...
}
```

Ventajas que hay que saber defender: el grafo de dependencias es **visible y compilado** — un error de wiring es un error de compilación con línea exacta, no un panic de container al arrancar; el orden de inicialización y cierre es explícito; no hay reflection ni tags. Para el 80% de los microservicios (5-20 dependencias) esto es todo lo que hace falta, y decir "uso DI manual y esta es la razón" es una respuesta senior, no una carencia.

**Cuándo duele:** 40+ constructores, subconjuntos compartidos entre binarios (`cmd/server`, `cmd/worker`, `cmd/migrator`), cambios de firma que obligan a tocar N mains. Ahí entran las herramientas:

**`google/wire` — codegen:**

```go
//go:build wireinject
func InitializeServer(cfg config.Config) (*Server, func(), error) {
    wire.Build(postgres.Connect, postgres.NewOrderRepo, kafka.NewPublisher,
               order.NewService, httpapi.NewHandler, NewServer)
    return nil, nil, nil // reemplazado por el código generado
}
```

`wire` analiza los tipos de los constructores y **genera** el main manual que habrías escrito, incluidas las funciones de cleanup. Errores (dependencia faltante, ciclo) en tiempo de generación/compilación. Coste: un paso de build, providers set que mantener, y mensajes de error a veces crípticos. Es la opción "Go-flavored": el resultado final es código normal legible.

**`uber-go/fx` — container en runtime:**

```go
fx.New(
    fx.Provide(config.Load, postgres.Connect, postgres.NewOrderRepo, order.NewService),
    fx.Invoke(func(lc fx.Lifecycle, srv *http.Server) {
        lc.Append(fx.Hook{OnStart: ..., OnStop: ...}) // lifecycle gestionado
    }),
).Run()
```

Aporta lifecycle uniforme (start/stop ordenado por dependencias), módulos reutilizables entre decenas de servicios (el caso de Uber), y wiring por reflection. Costes: errores de wiring en **runtime** (al arrancar), stack traces a través del framework, curva para el equipo, y una forma de pensar que se propaga a todo el código. Justificable en organizaciones con muchos servicios y una plataforma interna que estandariza módulos fx; sobredimensionado para un equipo con 5 servicios.

**Trampas y señales:** service locator (`container.Get("orderService")`) — anti-patrón, esconde dependencias; `init()` con estado global y singletons paquete-nivel (`var DB *sql.DB` global) — intesteable y con orden de init frágil; interfaces creadas solo "para inyectar" cuando solo hay una implementación y no hay test que la sustituya (YAGNI — se extrae la interface cuando aparece el segundo uso o el mock). La respuesta redonda termina con el criterio: manual → wire cuando el wiring sea el problema → fx solo con una razón organizacional.

---

## 14. Observabilidad en Go: OpenTelemetry, métricas y pprof en producción

**Categoría:** Observabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Tres señales: **trazas** (OpenTelemetry: propagación de contexto W3C entre servicios, spans en operaciones relevantes), **métricas** (RED por endpoint: rate, errors, duration en histogramas; más runtime: goroutines, GC, heap) y **logs** estructurados (`slog`) correlacionados con trace_id. En Go se suma un cuarto pilar: **pprof continuo en producción** (endpoint `/debug/pprof` en un puerto interno o profiling continuo tipo Pyroscope/Parca), que convierte "el p99 subió" en "esta función aloca de más".

### 📖 Respuesta detallada
**Tracing con OpenTelemetry — lo esencial:**

```go
// Setup (una vez, en main)
tp := sdktrace.NewTracerProvider(
    sdktrace.WithBatcher(otlpExporter),
    sdktrace.WithResource(resource.NewWithAttributes(semconv.ServiceName("orders"))),
    sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(0.1))), // muestreo
)
otel.SetTracerProvider(tp)
otel.SetTextMapPropagator(propagation.TraceContext{}) // W3C traceparent

// Instrumentación automática de bordes:
handler := otelhttp.NewHandler(mux, "server")             // HTTP server
client := &http.Client{Transport: otelhttp.NewTransport(nil)} // HTTP client
// gRPC: otelgrpc.NewServerHandler() / NewClientHandler()

// Spans manuales solo donde aportan:
ctx, span := tracer.Start(ctx, "order.ApplyDiscounts")
defer span.End()
span.SetAttributes(attribute.String("order.id", id))
if err != nil { span.RecordError(err); span.SetStatus(codes.Error, err.Error()) }
```

La clave que evalúan: **la propagación vive en el `context.Context`**. Toda la disciplina de "pasa el ctx siempre" cobra sentido aquí — un `context.Background()` en medio de la cadena rompe la traza (y es como se detecta código que no propaga ctx). Entre servicios, el header `traceparent` (W3C) enlaza los spans; con Kafka, el trace context viaja en headers del mensaje y el consumer crea un *link* o span hijo.

**Métricas — RED + runtime:**

```go
httpDuration := prometheus.NewHistogramVec(prometheus.HistogramOpts{
    Name:    "http_request_duration_seconds",
    Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5},
}, []string{"method", "route", "status"})
```

Puntos de senior: label `route` con el **patrón** (`/orders/{id}`), jamás el path real (cardinalidad explosiva = tumbar Prometheus); histogramas (no summaries) para poder agregar percentiles entre réplicas; y las métricas de runtime vía `collectors.NewGoCollector` — `go_goroutines` (leaks), `go_memstats_*`/`runtime/metrics` de GC (% CPU en GC, pausas). Alertar sobre síntomas (SLO de latencia/errores), dashboard sobre causas.

**pprof en producción — el diferencial de Go:**

```go
import _ "net/http/pprof" // registra /debug/pprof en DefaultServeMux

go func() { // SIEMPRE en un puerto interno, nunca expuesto públicamente
    http.ListenAndServe("localhost:6060", nil)
}()
```

- `go tool pprof http://pod:6060/debug/pprof/profile?seconds=30` → CPU; `/heap` → memoria (`-inuse_space` para leaks, `-alloc_objects` para presión de GC); `/goroutine` → leaks de goroutines; `/mutex` y `/block` (activando `runtime.SetMutexProfileFraction`/`SetBlockProfileRate`) → contención.
- El overhead del profiling on-demand es bajo (~1-5% durante la captura); el **continuous profiling** (Pyroscope, Parca, Cloud Profiler) lo deja siempre activo y permite comparar "hoy vs ayer" o "v1.2 vs v1.3" — la herramienta estrella para regresiones de rendimiento.
- Seguridad: exponer `/debug/pprof` en el puerto público es un finding clásico (DoS + información) — puerto de administración separado o mTLS.

**Correlación — donde se cierra el círculo:** logs con `trace_id` (un handler de `slog` que extrae el span del ctx), exemplars en histogramas Prometheus enlazando a trazas, y el flujo de diagnóstico completo: alerta de SLO → dashboard RED → trazas del percentil malo → span culpable → pprof del servicio culpable → función exacta. Contar ese flujo de punta a punta es lo que convence en la entrevista.

---

## 15. Testing en microservicios Go: table-driven, testcontainers, mocks y race detector

**Categoría:** Testing · **Tipo:** Conceptual

### 📝 Respuesta resumen
La pirámide en Go: tests unitarios table-driven para lógica de dominio (rápidos, sin I/O, con mocks triviales gracias a interfaces pequeñas), tests de integración con `testcontainers-go` contra Postgres/Kafka reales (la fidelidad que los mocks no dan), y pocos tests E2E. Reglas duras: `go test -race ./...` en CI siempre, `t.Parallel()` donde se pueda, `httptest` para bordes HTTP, y mocks escritos a mano contra interfaces propias antes que frameworks de mocking pesados.

### 📖 Respuesta detallada
**Table-driven — el idioma estándar:**

```go
func TestCalculateDiscount(t *testing.T) {
    tests := []struct {
        name    string
        order   Order
        want    Money
        wantErr error
    }{
        {name: "no discount under threshold", order: orderOf(50), want: Money{0}},
        {name: "10pct over 100", order: orderOf(150), want: Money{15}},
        {name: "negative total", order: orderOf(-1), wantErr: ErrInvalidOrder},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel()
            got, err := CalculateDiscount(tt.order)
            if !errors.Is(err, tt.wantErr) { t.Fatalf("err = %v, want %v", err, tt.wantErr) }
            if got != tt.want { t.Errorf("got %v, want %v", got, tt.want) }
        })
    }
}
```

Cada caso con nombre (aparece en el fallo), `t.Run` para sub-tests filtrables (`-run TestX/negative`), `t.Parallel()` para velocidad y para **exponer races**. Con lógica no determinista, fuzzing nativo (`go test -fuzz`) para parsers/validadores.

**Mocks: interfaces propias y a mano primero:**

```go
type stubRepo struct {
    getFn func(ctx context.Context, id string) (*Order, error)
}
func (s *stubRepo) Get(ctx context.Context, id string) (*Order, error) { return s.getFn(ctx, id) }

// En el test:
svc := order.NewService(&stubRepo{getFn: func(_ context.Context, id string) (*Order, error) {
    return nil, ErrNotFound
}}, noopPublisher{})
```

Como las interfaces se definen en el consumidor y son pequeñas (1-3 métodos), un stub manual son 5 líneas: sin dependencias, legible, sin la fragilidad de las expectativas estilo `mockery`/`gomock` ("expected Get to be called once") que acoplan el test a la implementación. Los generadores (`mockery`, `moq`) se justifican con interfaces grandes o cientos de mocks — es una respuesta de criterio, no de dogma. Regla de oro acompañante: testear **comportamiento observable**, no interacciones internas.

**Integración con testcontainers-go — donde los mocks mienten:**

```go
func TestOrderRepo(t *testing.T) {
    if testing.Short() { t.Skip() }
    ctx := context.Background()
    pg, err := postgres.Run(ctx, "postgres:16-alpine",
        postgres.WithDatabase("test"), postgres.WithUsername("test"), postgres.WithPassword("test"),
        testcontainers.WithWaitStrategy(wait.ForLog("ready to accept connections").WithOccurrence(2)))
    if err != nil { t.Fatal(err) }
    t.Cleanup(func() { pg.Terminate(ctx) })

    db := mustConnect(t, pg.MustConnectionString(ctx))
    mustMigrate(t, db)

    repo := NewOrderRepo(db)
    // tests reales: constraints, transacciones, ON CONFLICT, tipos de columna...
}
```

Los mocks de repositorio no validan SQL, constraints, ni el comportamiento transaccional — el bug típico de producción (deadlock de DB, constraint violada, mapeo de tipos) solo lo caza un Postgres real. Testcontainers da eso en CI con Docker: contenedor por suite (no por test), migraciones reales, y datos aislados por test (transacción con rollback o truncate). Lo mismo para Kafka (contenedor + producir/consumir de verdad) donde el mock del producer jamás detectará un problema de serialización o de particionado.

**Race detector y bordes:**
- `go test -race ./...` en CI **como gate obligatorio** — es la herramienta más rentable del ecosistema; su coste (5-10× CPU) se paga solo en CI. Complemento: tests que ejercitan concurrencia real (N goroutines contra el componente compartido), porque `-race` solo ve las races que ocurren.
- HTTP: `httptest.NewServer` para clientes (fake del upstream) y `httptest.NewRecorder` para handlers; gRPC: arrancar el server real sobre `bufconn` (sin red).
- Utilidades modernas: `t.Cleanup` (mejor que defer para helpers), `t.Setenv`, `t.TempDir`, y `-shuffle=on` para cazar dependencias de orden entre tests.

Cerrar con la postura: "unit para el dominio (milisegundos, miles), integración con contenedores para adaptadores (segundos, decenas), E2E mínimos para flujos críticos — y todo con -race".

---

## 16. Timeouts, retries y hedging entre servicios: presupuesto de latencia end-to-end

**Categoría:** Resiliencia / Comunicación · **Tipo:** Conceptual

### 📝 Respuesta resumen
El presupuesto de latencia fluye hacia abajo: si el edge promete 1s, cada nivel usa un timeout menor que lo que le queda, reservando margen para responder y quizá reintentar. Reglas: deadline total por operación (no solo por intento), retries solo de errores transitorios sobre operaciones idempotentes, con backoff exponencial + jitter y retry budget (no multiplicar el tráfico ×3 en pleno incidente). Propagación automática con ctx (gRPC lo serializa; en HTTP se hace explícito).

### 📖 Respuesta detallada
**El anti-patrón que motiva la pregunta:** todos los servicios con timeout de 5s. El edge llama a A (5s), A llama a B (5s), B a la DB (5s). Cuando la DB tarda, B agota sus 5s, pero A ya cortó a los 5s (empezó antes) — el trabajo de B fue inútil, el usuario ya recibió error, y quizá A reintentó, duplicando carga sobre un sistema ya lento. Los timeouts en cascada mal alineados **amplifican** incidentes.

**Diseño correcto — budget decreciente:**

```
Edge (1000ms) → A: llama a B con ctx de 800ms → B: llama a DB con ctx de 600ms
                     (reserva 200ms para procesar la respuesta / degradar / responder)
```

En Go esto es natural con context: cada nivel deriva `context.WithTimeout(ctx, budgetLocal)` y como el deadline efectivo es el mínimo de la cadena, nadie puede exceder al padre. gRPC propaga el deadline restante en el wire automáticamente; en HTTP se propaga el ctx del request y, si hace falta cruzar el borde, un header tipo `X-Request-Timeout` que el receptor convierte en su deadline.

```go
func (c *BClient) Get(ctx context.Context, id string) (*Thing, error) {
    // budget local acotado, NUNCA mayor que el restante del padre
    ctx, cancel := context.WithTimeout(ctx, 600*time.Millisecond)
    defer cancel()
    return c.doWithRetry(ctx, id)
}

func (c *BClient) doWithRetry(ctx context.Context, id string) (*Thing, error) {
    backoff := 50 * time.Millisecond
    for attempt := 0; ; attempt++ {
        thing, err := c.call(ctx, id) // cada intento con sub-timeout si conviene
        if err == nil || !isRetryable(err) || attempt == 2 { return thing, err }
        select {
        case <-time.After(backoff + rand.N(backoff)): // full jitter
            backoff *= 2
        case <-ctx.Done():
            return nil, ctx.Err() // el deadline TOTAL manda: no reintentar sin budget
        }
    }
}
```

**Reglas de retry que evalúa el entrevistador:**
1. **Solo errores transitorios:** `Unavailable`, timeouts de conexión, 502/503/429 (respetando `Retry-After`). Nunca 400/404/errores de negocio. Un 500 genérico es zona gris: idealmente el servidor distingue.
2. **Solo operaciones idempotentes** — o con idempotency key. Reintentar un POST de cobro sin key es el bug más caro de la lista.
3. **Backoff exponencial con jitter completo:** sin jitter, todos los clientes reintentan sincronizados (thundering herd sobre el servicio caído).
4. **Retry budget / limitar amplificación:** con 3 niveles reintentando ×3 cada uno, un fallo en la base genera 27× tráfico. Reglas prácticas: reintenta solo el nivel más cercano al fallo (o el edge, pero no todos), y un budget global (p.ej. retries ≤ 10% del tráfico — como hace gRPC con retry throttling) que desactiva retries durante incidentes masivos.
5. **Hedging (para p99, no para errores):** lanzar una segunda request si la primera no respondió en el p95 esperado, quedarse con la primera que llegue y cancelar la otra (ctx). Solo lecturas idempotentes, coste = tráfico extra acotado. gRPC lo soporta declarativamente; en Go manual son dos goroutines + select.

**Observabilidad asociada:** métricas de retries por servicio (un aumento de retries es el síntoma más temprano de degradación), y distinguir en métricas `deadline_exceeded` propio vs cancelación heredada del caller — cambia totalmente el diagnóstico. Cierre senior: los valores concretos salen de los SLO y de los histogramas reales de latencia (timeout ≈ p99.9 del downstream sano), no de números mágicos copiados.

---

## 17. Versionado y evolución de APIs y eventos en microservicios Go

**Categoría:** Contratos / Evolución · **Tipo:** Conceptual

### 📝 Respuesta resumen
La regla de oro es compatibilidad hacia atrás: los consumidores no se despliegan a la vez que tú. En REST: versión mayor en la URL o header solo para rupturas reales, cambios aditivos siempre compatibles (campos nuevos opcionales), tolerant reader en los clientes. En gRPC/protobuf: no renumerar campos, no cambiar tipos, `reserved` para lo eliminado, y campos nuevos siempre opcionales. En eventos: schema registry (Avro/Protobuf) con reglas de compatibilidad, y versionar el evento cuando la semántica cambia. Expand → migrate → contract es el ciclo para toda ruptura.

### 📖 Respuesta detallada
**Protobuf/gRPC — reglas mecánicas que hay que recitar:**

```protobuf
message Order {
  string id = 1;
  // string customer_email = 2;  // ELIMINADO: jamás reutilizar el número
  reserved 2;
  reserved "customer_email";
  OrderStatus status = 3;
  google.protobuf.Timestamp created_at = 4;  // añadir campos = siempre seguro
}
```

- Los campos se identifican por **número** en el wire: renumerar o cambiar el tipo de un número existente corrompe la deserialización silenciosamente (el peor tipo de bug: datos cruzados, no errores).
- Añadir campos es seguro (los clientes viejos los ignoran; los nuevos ven zero value desde servidores viejos → el código debe tratar zero value como "ausente"; wrappers u `optional` para distinguir "no enviado" de "cero").
- Renombrar el nombre del campo es seguro en el wire (viaja el número), pero rompe JSON mapping si lo usas.
- No convertir `repeated` ↔ singular, ni cambiar la semántica de un campo existente — para eso, campo nuevo + deprecar el viejo.
- Servicios: añadir RPCs es seguro; cambiar firmas no — se crea `GetOrderV2` o un servicio nuevo.

**REST/JSON:** mismos principios sin enforcement mecánico — por eso el contrato debe ser explícito (OpenAPI versionado en el repo, revisado en PR, con lint de breaking changes tipo `oasdiff` en CI). Cambios seguros: campos nuevos en respuestas, parámetros opcionales nuevos, endpoints nuevos. Rupturas: quitar/renombrar campos, cambiar tipos, endurecer validación, cambiar semántica de códigos de estado. En Go, cuidado clásico: `encoding/json` ignora campos desconocidos por defecto (tolerant reader gratis), pero `DisallowUnknownFields` en un servidor rompe a los clientes que evolucionan — usarlo solo con una razón.

**El ciclo expand → migrate → contract (la respuesta estructural):**
1. **Expand:** despliega el productor escribiendo/aceptando ambas formas (campo nuevo Y viejo).
2. **Migrate:** los consumidores migran a la forma nueva a su ritmo; se mide el uso de la vieja (métrica por versión de cliente / campo).
3. **Contract:** cuando el uso de la vieja es cero (medido, no supuesto), se elimina — con deprecation policy comunicada (headers `Deprecation`/`Sunset` en REST, `deprecated = true` en proto).

Sin la fase de medición, el "contract" rompe a alguien siempre.

**Eventos — el caso más delicado:** un evento persiste en Kafka días o años (retención, replays); el consumidor de mañana leerá lo que publicaste hoy. Por eso: schema registry (Confluent/Redpanda) con compatibilidad **BACKWARD o FULL** enforced al publicar esquemas — el registry rechaza el esquema incompatible en CI, no en producción. Cambios de semántica (no de forma) = evento nuevo (`OrderCreatedV2` o mejor un nombre de dominio distinto), manteniendo el viejo hasta drenar consumidores; el productor puede publicar ambos durante la transición (double-publish) o los consumidores nuevos upcastean el evento viejo.

**Versionado del módulo Go (bonus que suma):** los contratos compartidos (`libs/events`, clientes generados) siguen semver de módulos Go: ruptura = major version con sufijo de import path (`module libs/events/v2`) — el mecanismo del lenguaje obliga a la migración explícita. Y en el pipeline: `buf breaking` para proto en cada PR es el estándar de facto.

---

## 18. Configuración y secretos en microservicios Go

**Categoría:** Operación / Configuración · **Tipo:** Conceptual

### 📝 Respuesta resumen
Config por variables de entorno (12-factor) parseada al arranque en un struct tipado y **validada con fail-fast**: si falta algo crítico, el proceso no arranca. Librerías: `env`/`envconfig` o `koanf`/`viper` si hay ficheros+flags+env. Secretos: nunca en el repo ni en la imagen; inyectados por la plataforma (Kubernetes Secrets, Vault, cloud secret managers), con rotación contemplada. Config dinámica (feature flags, niveles de log) separada de la estática, servida con recarga segura (`atomic.Pointer`).

### 📖 Respuesta detallada
```go
type Config struct {
    Addr            string        `env:"ADDR" envDefault:":8080"`
    DBURL           string        `env:"DATABASE_URL,required"`
    KafkaBrokers    []string      `env:"KAFKA_BROKERS,required"`
    ShutdownTimeout time.Duration `env:"SHUTDOWN_TIMEOUT" envDefault:"20s"`
    LogLevel        slog.Level    `env:"LOG_LEVEL" envDefault:"INFO"`
}

func Load() (Config, error) {
    var c Config
    if err := env.Parse(&c); err != nil {
        return c, fmt.Errorf("parsing config: %w", err)
    }
    if err := c.validate(); err != nil { // validación semántica: URLs parseables, rangos...
        return c, fmt.Errorf("invalid config: %w", err)
    }
    return c, nil
}

// main: fail-fast. Un servicio con config rota NO debe arrancar a medias.
cfg, err := config.Load()
if err != nil { slog.Error("config", "err", err); os.Exit(1) }
```

**Principios que evalúa el entrevistador:**

1. **Fail-fast al arrancar:** descubrir a las 3 AM que faltaba `KAFKA_BROKERS` porque el consumer paniquea en la primera request es lo que se evita validando todo en `main`. Kubernetes + readiness probe convierten el fail-fast en un rollout abortado limpio en lugar de un incidente.
2. **Struct tipado como única fuente:** nada de `os.Getenv` esparcido por el código (intesteable, sin defaults coherentes, sin catálogo de qué config existe). El struct documenta el contrato de configuración del servicio.
3. **Sin flags de entorno tipo `if env == "prod"`:** la config describe *valores* (URLs, tamaños, timeouts), no identidades de entorno que activan ramas de código — las ramas por entorno son bugs de paridad dev/prod esperando.

**Secretos — lo que distingue nivel:**
- **Nunca** en el repo, ni en la imagen, ni en logs (cuidado con el `fmt.Printf("%+v", cfg)` de debugging: implementar `String()`/`LogValue()` que redacta secretos es un detalle que puntúa mucho).
- Mecanismos por orden de madurez: Kubernetes Secrets montados como env/fichero (base, suficiente con RBAC y encryption at rest), External Secrets Operator sincronizando desde el secret manager del cloud, o Vault/cloud SDK directo cuando se necesita **rotación dinámica** (credenciales de DB de corta vida — el servicio renueva el lease en runtime y el pool de conexiones debe soportar re-autenticación).
- Rotación: diseñar para que un secreto pueda cambiar sin redeploy (releer de fichero montado ante fallo de auth, o restart controlado por el operator). "El secreto es eterno" es deuda de seguridad.

**Config dinámica (la parte con Go interesante):** niveles de log, feature flags, umbrales de circuit breaker — cosas que quieres cambiar sin redeploy. Patrón seguro de recarga:

```go
type Runtime struct{ cur atomic.Pointer[DynamicConfig] }

func (r *Runtime) Get() *DynamicConfig { return r.cur.Load() } // snapshot inmutable por request

// watcher: fsnotify sobre ConfigMap montado, o SDK de flags (LaunchDarkly/OpenFeature)
func (r *Runtime) onUpdate(newCfg *DynamicConfig) {
    if err := newCfg.Validate(); err != nil { // validar ANTES de publicar
        slog.Error("rejected dynamic config", "err", err)
        return // se conserva la config anterior válida
    }
    r.cur.Store(newCfg)
}
```

Claves: el snapshot inmutable evita que una request vea media recarga; la validación previa evita que una config rota tumbe el servicio en caliente; y cada cambio de config dinámica se loguea/metrica (es un evento de cambio en producción, igual que un deploy). Anti-patrón de cierre: releer env vars o ficheros en el hot path por request — la config estática se lee una vez; la dinámica, por push/watch con snapshot atómico.
