# Go Core Avanzado — Preguntas de Entrevista Senior

---

## 1. Explica el modelo GMP del scheduler de Go

**Categoría:** Runtime / Scheduler · **Tipo:** Conceptual

### 📝 Respuesta resumen
El scheduler de Go usa el modelo GMP: **G** (goroutine), **M** (thread del OS) y **P** (processor, contexto lógico de ejecución con una run queue local). Hay `GOMAXPROCS` Ps; cada M necesita adquirir un P para ejecutar código Go. El scheduler hace *work-stealing* entre run queues, tiene una cola global, y es preemptivo desde Go 1.14 (preempción asíncrona basada en señales). Esto permite multiplexar millones de goroutines sobre pocos threads.

### 📖 Respuesta detallada
Los tres componentes:

- **G (goroutine):** estructura ligera (~2KB de stack inicial, crece dinámicamente) que contiene el stack, el program counter y el estado. Crear una G es una operación en user space, sin syscall.
- **M (machine):** un thread real del sistema operativo. El runtime crea y destruye Ms según necesidad (limitado por `debug.SetMaxThreads`, default 10 000).
- **P (processor):** recurso lógico que representa "permiso para ejecutar código Go". Hay exactamente `GOMAXPROCS` Ps (por defecto, número de CPUs, o el límite de CPU del cgroup desde Go 1.25 / con `automaxprocs` antes). Cada P tiene una **run queue local** (hasta 256 Gs) y caches de allocación (mcache), lo que evita locks en el fast path.

Flujo de scheduling:

1. `go f()` crea una G y la encola en la run queue local del P actual (o en la global si está llena).
2. Un M con P toma Gs de su cola local; si se vacía, roba la mitad de la cola de otro P (**work stealing**), revisa la cola global (1 de cada 61 ticks para evitar starvation) y el netpoller.
3. **Syscalls bloqueantes:** si una G entra en una syscall bloqueante, el M queda bloqueado, pero el P se desacopla (*handoff*) y otro M (existente o nuevo) lo toma para seguir ejecutando Gs. Por eso muchas syscalls bloqueantes pueden disparar la creación de threads.
4. **I/O de red:** no bloquea el M. El netpoller (epoll/kqueue/IOCP) registra el fd y aparca la G; cuando el fd está listo, la G vuelve a una run queue. Esto es lo que hace que `net/http` escale con código aparentemente bloqueante.

**Preempción:** hasta Go 1.13, una goroutine solo cedía en puntos de cooperación (llamadas a función, channels, etc.); un loop `for {}` sin llamadas podía monopolizar un P e incluso bloquear el GC (stop-the-world colgado). Desde Go 1.14 existe **preempción asíncrona**: el sysmon detecta Gs corriendo >10ms y envía `SIGURG` al thread, insertando un punto de preempción seguro.

**Errores comunes que el entrevistador espera oír:**
- Asumir `GOMAXPROCS` correcto en Kubernetes: con límite de 2 CPUs y un nodo de 64 cores, versiones < 1.25 crean 64 Ps → exceso de throttling de CFS y latencias p99 altas. Solución: `uber-go/automaxprocs` o Go ≥ 1.25.
- Confundir concurrencia con paralelismo: `GOMAXPROCS=1` sigue permitiendo miles de goroutines concurrentes.
- No saber que `runtime.Gosched()` cede voluntariamente y que `LockOSThread` ata una G a un M (necesario para CGo/UI thread).

Herramientas: `GODEBUG=schedtrace=1000,scheddetail=1` imprime el estado del scheduler cada segundo; `go tool trace` visualiza Gs por P, bloqueos y latencia de scheduling.

---

## 2. ¿Por qué las goroutines son más baratas que los threads del OS?

**Categoría:** Runtime / Concurrencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
Tres razones: (1) **stack**: una goroutine arranca con ~2KB y crece/decrece dinámicamente, un thread reserva 1–8MB de stack fijo; (2) **creación y context switch en user space**: cambiar de goroutine cuesta ~decenas de nanosegundos (guardar 3 registros) vs microsegundos de un context switch de kernel (registros completos, TLB, cache pollution); (3) **scheduling cooperativo con el runtime**: el scheduler conoce la semántica de Go (channels, GC) y puede aparcar Gs sin involucrar al kernel.

### 📖 Respuesta detallada
**Stacks crecibles (contiguous stacks):** cada G empieza con ~2KB. En el prólogo de cada función hay un chequeo (`morestack`): si el stack no alcanza, el runtime aloca uno el doble de grande, **copia** el stack viejo y ajusta los punteros. Esto es posible porque Go conoce con precisión qué es un puntero (GC preciso). Consecuencia práctica: 1 millón de goroutines ociosas ≈ 2–8 GB; 1 millón de threads es inviable. Gotcha: el crecimiento de stack tiene coste; funciones con frames enormes en hot paths pueden causar `morestack` frecuente (visible en pprof como `runtime.morestack`).

**Context switch barato:** cambiar de G solo requiere guardar SP, PC y unos pocos registros, sin cruzar al kernel, sin invalidar TLB. Un switch de thread implica syscall, guardar el estado completo de CPU y ensuciar caches.

**Bloqueo inteligente:** cuando una G bloquea en un channel, mutex del runtime o I/O de red, **solo la G se aparca**; el M sigue ejecutando otras Gs. Con threads, bloquear = thread dormido ocupando memoria y forzando al kernel a schedulear otro.

```go
// Esto es viable en Go; con threads del OS sería un desastre:
for i := 0; i < 1_000_000; i++ {
    go func(id int) {
        <-startSignal // un millón de Gs aparcadas: solo memoria de stacks
        process(id)
    }(i)
}
```

**Matices que diferencian a un senior:**
- Las goroutines **no son gratis**: cada una consume stack + estructura g (~ unos cientos de bytes extra). Un leak de goroutines es un leak de memoria y de fds/conexiones que tengan capturadas.
- Syscalls bloqueantes (I/O de disco, CGo, DNS con cgo resolver) **sí** bloquean el M y pueden crear threads: un servicio que hace mucho I/O de disco puede acabar con cientos de threads aunque tenga `GOMAXPROCS=4`.
- No hay prioridades de goroutines: no puedes marcar una G como "más importante"; el diseño debe usar colas propias si necesitas QoS.
- Comparación con async/await (Node, Rust): Go elige stacks reales y código secuencial (sin *function coloring*), pagando memoria de stacks; async/await usa máquinas de estado sin stack, más baratas en memoria pero con código viral (`async` se propaga).

El entrevistador espera oír: números de orden de magnitud (2KB vs MBs, ns vs µs), el rol del netpoller, y que sepas que "baratas" no significa "ilimitadas": siempre acota la concurrencia con worker pools o semáforos (`golang.org/x/sync/semaphore`).

---

## 3. Channels buffered vs unbuffered: semántica y cuándo usar cada uno

**Categoría:** Concurrencia / Channels · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un channel **unbuffered** sincroniza: el send bloquea hasta que hay un receive (rendezvous), garantizando *happens-before* y entrega confirmada. Un channel **buffered** desacopla: el send solo bloquea con el buffer lleno; sirve para absorber ráfagas y como semáforo. Regla práctica: unbuffered por defecto (semántica más simple de razonar), buffered solo con una justificación concreta de capacidad (no "por si acaso", porque un buffer oculta backpressure y convierte deadlocks en leaks diferidos).

### 📖 Respuesta detallada
**Unbuffered (`make(chan T)`):** la comunicación es el punto de sincronización. `ch <- v` no retorna hasta que otra goroutine ejecuta `<-ch`. Esto da dos garantías: (1) cuando el send retorna, sabes que el consumidor **recibió** el valor; (2) establece una relación *happens-before* formal en el memory model de Go: todo lo escrito antes del send es visible después del receive.

**Buffered (`make(chan T, n)`):** el send deposita y sigue si hay espacio. Pierdes la confirmación de entrega: `ch <- v` retornando solo significa "está en el buffer". Usos legítimos:

```go
// 1. Semáforo de concurrencia
sem := make(chan struct{}, 10)
for _, job := range jobs {
    sem <- struct{}{}
    go func(j Job) {
        defer func() { <-sem }()
        process(j)
    }(job)
}

// 2. Resultado que no debe bloquear al productor si el consumidor abandonó
resultCh := make(chan Result, 1) // buffer 1: el worker puede enviar y morir
go func() { resultCh <- doWork() }()
select {
case r := <-resultCh:
    use(r)
case <-ctx.Done():
    return ctx.Err() // el worker no queda bloqueado gracias al buffer 1
}

// 3. Absorber ráfagas con capacidad calculada (no arbitraria)
events := make(chan Event, 1024) // dimensionado por rate esperado × latencia del consumidor
```

El patrón 2 es crítico: es la forma canónica de evitar **goroutine leaks** cuando el receptor puede abandonar por timeout. Con channel unbuffered, el worker quedaría bloqueado en el send para siempre.

**Errores comunes:**
- **Buffer como "fix" de deadlocks:** si tu código hace deadlock sin buffer, con buffer probablemente solo lo pospones hasta que el buffer se llena bajo carga real (falla en producción, no en tests).
- **Buffers gigantes sin backpressure:** `make(chan T, 1_000_000)` esconde que el consumidor no da abasto; la memoria crece y, si el proceso muere, pierdes todo lo encolado. Mejor buffer pequeño + métrica de `len(ch)` + estrategia explícita (bloquear, descartar, derivar a disco).
- **Olvidar quién cierra:** solo el **emisor** cierra el channel, nunca el receptor; cerrar dos veces o enviar a un channel cerrado = panic. Con múltiples emisores, no cierres: usa un `sync.WaitGroup` y una goroutine coordinadora que cierre cuando todos terminen.
- `len(ch)`/`cap(ch)` para lógica de control es una race conceptual: el valor puede cambiar antes de que actúes; solo son válidos para métricas.

**Qué espera el entrevistador:** que menciones la garantía happens-before, el patrón del buffer 1 para evitar leaks con `select`+`ctx.Done()`, y la postura de diseño: "los buffers son una decisión de capacidad, no de corrección". Bonus: `nil` channel bloquea para siempre (útil para deshabilitar un case de `select` dinámicamente).

---

## 4. `select`: semántica, patrones y trampas

**Categoría:** Concurrencia / Channels · **Tipo:** Conceptual

### 📝 Respuesta resumen
`select` espera sobre múltiples operaciones de channel; si varias están listas elige **pseudoaleatoriamente** (evita starvation), si ninguna lo está bloquea, y `default` lo hace no bloqueante. Patrones clave: timeout con `ctx.Done()`, envío no bloqueante (drop), deshabilitar cases con channels `nil`. Trampas: `for-select` que hace busy-loop con `default`, `time.After` en loops (leak de timers pre-1.23), y creer que el orden textual de los cases da prioridad.

### 📖 Respuesta detallada
Semántica: se evalúan todas las expresiones de channel y los valores a enviar **una vez**, en orden; luego, entre los cases listos, se elige uniformemente al azar. Esto es deliberado: elegir siempre el primero causaría starvation de los demás.

**Patrones esenciales:**

```go
// 1. Cancelación + trabajo (el patrón más importante en microservicios)
select {
case res := <-workCh:
    return res, nil
case <-ctx.Done():
    return nil, ctx.Err()
}

// 2. Envío no bloqueante con drop (telemetría, logs)
select {
case metricsCh <- m:
default:
    droppedCounter.Inc() // preferible a bloquear el hot path
}

// 3. Deshabilitar un case dinámicamente con nil channel
var out chan Item // nil hasta que haya algo que enviar
var next Item
for {
    if pending.Len() > 0 { out = realOut; next = pending.Front() } else { out = nil }
    select {
    case v := <-in:
        pending.Push(v)
    case out <- next: // este case "no existe" cuando out == nil
        pending.Pop()
    }
}
```

El patrón 3 (nil channel) es una pregunta trampa clásica: enviar o recibir de un channel `nil` **bloquea para siempre**, lo que dentro de un `select` significa "case deshabilitado". Fuera de un select, es un deadlock.

**Trampas que espera oír el entrevistador:**

1. **`for { select { ... default: } }` = busy loop.** Con `default`, el select nunca bloquea y el loop quema una CPU entera. Si añades `default`, debe haber trabajo real o un `time.Sleep`/ticker.

2. **`time.After` en un loop:**
```go
for {
    select {
    case v := <-ch:
        handle(v)
    case <-time.After(time.Minute): // pre-Go 1.23: crea un timer por iteración
        return
    }
}
```
Antes de Go 1.23, cada iteración creaba un timer que vivía en el heap hasta expirar (con tráfico alto, millones de timers → presión de GC). Fix clásico: `timer := time.NewTimer(d)` reutilizado con `Reset` (con su famosa danza de `Stop`/drenado, simplificada en 1.23 donde los timers ya son garbage-collectable inmediatamente y `Reset` es seguro).

3. **No hay prioridad entre cases.** Si necesitas "drena datos antes de atender la cancelación", hay que anidarlo explícitamente:
```go
select {
case <-ctx.Done():
    // antes de salir, intenta drenar lo urgente
    for {
        select {
        case v := <-ch:
            handle(v)
        default:
            return ctx.Err()
        }
    }
case v := <-ch:
    handle(v)
}
```

4. **Recibir de un channel cerrado nunca bloquea** (devuelve zero value con `ok=false`): un `for-select` sobre un channel cerrado sin comprobar `ok` gira infinitamente procesando zero values. Siempre `case v, ok := <-ch: if !ok { ch = nil }` en loops de larga vida.

---

## 5. Patrones de concurrencia: pipeline, fan-out y fan-in

**Categoría:** Concurrencia / Patrones · **Tipo:** Conceptual

### 📝 Respuesta resumen
**Pipeline:** etapas conectadas por channels donde cada etapa consume del anterior y produce para la siguiente. **Fan-out:** N goroutines leyendo del mismo channel para paralelizar una etapa lenta. **Fan-in:** fusionar varios channels en uno con una goroutine por fuente y un `WaitGroup` que cierra el canal de salida. Las reglas de oro: cada etapa debe poder abortar vía `ctx.Done()` en cada send/receive, y quien produce es quien cierra.

### 📖 Respuesta detallada
Implementación canónica con cancelación (lo que un senior debe escribir de memoria):

```go
// Etapa generadora: produce y respeta cancelación
func generate(ctx context.Context, nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out) // el productor cierra
        for _, n := range nums {
            select {
            case out <- n:
            case <-ctx.Done():
                return // sin esto: goroutine leak si el consumidor abandona
            }
        }
    }()
    return out
}

// Etapa de trabajo (se lanzan N copias = fan-out)
func square(ctx context.Context, in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            select {
            case out <- n * n:
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}

// Fan-in: fusiona múltiples channels en uno
func merge(ctx context.Context, chans ...<-chan int) <-chan int {
    out := make(chan int)
    var wg sync.WaitGroup
    wg.Add(len(chans))
    for _, c := range chans {
        go func(c <-chan int) {
            defer wg.Done()
            for v := range c {
                select {
                case out <- v:
                case <-ctx.Done():
                    return
                }
            }
        }(c)
    }
    go func() { wg.Wait(); close(out) }() // cierra cuando TODAS las fuentes acaban
    return out
}

// Uso: fan-out de 4 workers sobre la misma entrada, luego fan-in
in := generate(ctx, nums...)
ws := make([]<-chan int, 4)
for i := range ws { ws[i] = square(ctx, in) } // comparten `in`: fan-out
for v := range merge(ctx, ws...) { fmt.Println(v) }
```

**Puntos que evalúa el entrevistador:**

- **Cancelación en cada send:** el error nº1 es `out <- n` sin `select` sobre `ctx.Done()`. Si el downstream deja de leer (timeout, error), cada etapa queda bloqueada enviando → goroutine leak con todos sus recursos. Todo send/receive en una goroutine de larga vida debe ser cancelable.
- **Cierre correcto en fan-in:** cerrar `out` requiere saber que *todas* las fuentes terminaron → `WaitGroup` + goroutine de cierre. Cerrar desde una sola fuente provoca panic (`send on closed channel`) en las demás.
- **El orden se pierde con fan-out:** si el orden importa, o etiquetas cada item con su índice y reordenas al final, o usas un patrón de "canal de resultados por item" (cada job lleva su propio channel de respuesta).
- **Cuándo NO usar esto:** para paralelizar un simple "procesa N items y junta errores", `errgroup.WithContext` + `SetLimit` es más corto, propaga errores y cancela a los hermanos; los pipelines brillan cuando hay **streaming** real (datasets que no caben en memoria, etapas con throughputs distintos).
- **Dimensionamiento:** el fan-out óptimo depende de si la etapa es CPU-bound (≈ `GOMAXPROCS` workers) o I/O-bound (decenas/cientos, limitado por el recurso externo). Decir "siempre lanzo 100" es red flag.

---

## 6. El paquete `sync`: Mutex, RWMutex, WaitGroup, Once — usos y trampas

**Categoría:** Concurrencia / Sincronización · **Tipo:** Conceptual

### 📝 Respuesta resumen
`Mutex` protege secciones críticas; `RWMutex` permite lectores concurrentes pero es más caro y solo gana con lecturas largas y dominantes; `WaitGroup` espera a un conjunto de goroutines (`Add` antes de `go`, `Done` con `defer`); `sync.Once` garantiza inicialización única. Trampas top: copiar un struct con mutex, `Add` dentro de la goroutine, locks no liberados en paths de error, y RWMutex no reentrante (un lector que intenta `RLock` de nuevo puede deadlockear con un writer esperando).

### 📖 Respuesta detallada
**Mutex — reglas de senior:**

```go
type Cache struct {
    mu sync.Mutex // convención: el mutex encima de lo que protege
    m  map[string]entry
}

func (c *Cache) Get(k string) (entry, bool) { // receiver POR PUNTERO
    c.mu.Lock()
    defer c.mu.Unlock()
    e, ok := c.m[k]
    return e, ok
}
```

- **Nunca copies un mutex:** métodos con value receiver copian el lock → cada llamada bloquea una copia distinta = cero protección. `go vet` lo detecta (`copylocks`).
- **Secciones críticas mínimas:** no hagas I/O, RPC ni logging pesado bajo lock. Patrón: toma el lock, copia/lee lo necesario, suelta, y luego trabaja.
- No es reentrante: `Lock` dos veces en la misma goroutine = deadlock. Si sientes que necesitas reentrancia, el diseño está mal (separa métodos "locked" internos: `get()` asume lock tomado, `Get()` lo toma).

**RWMutex — el falso amigo:** su bookkeeping hace que `RLock/RUnlock` sea **más caro** que `Lock/Unlock` de un Mutex en secciones cortas, y el contador de lectores es un punto de contención en sí mismo con muchos cores. Solo gana cuando las lecturas son largas y muy mayoritarias. Trampa de reentrancia real: goroutine A tiene `RLock`, goroutine B pide `Lock` (queda esperando y bloquea nuevos lectores para no morir de hambre), A intenta un segundo `RLock` → deadlock A↔B. Para read-mostly extremo (config, feature flags): `atomic.Pointer[Config]` con copy-on-write es órdenes de magnitud mejor.

**WaitGroup:**

```go
var wg sync.WaitGroup
for _, t := range tasks {
    wg.Add(1)            // SIEMPRE antes de `go` — dentro de la goroutine es una race
    go func(t Task) {    // (con la wg.Wait() pudiendo pasar antes del Add)
        defer wg.Done()  // defer: se ejecuta aunque haya panic
        process(t)
    }(t)
}
wg.Wait()
```
Go 1.25 añade `wg.Go(func(){...})` que encapsula Add/Done. Un `WaitGroup` no transporta errores ni cancela: para eso, `errgroup`.

**sync.Once:**

```go
var (
    once     sync.Once
    instance *DB
    initErr  error
)
func GetDB() (*DB, error) {
    once.Do(func() { instance, initErr = connect() })
    return instance, initErr // ojo: si falló, falla PARA SIEMPRE
}
```
Gotcha clave: si la inicialización falla, `Once` ya "se gastó" y nunca reintentará. Para init con retry: `sync.OnceValues` (Go 1.21) tiene el mismo comportamiento; necesitas un mutex con flag propio o rediseñar. Otro gotcha: `once.Do` dentro de la propia función inicializadora (reentrante) = deadlock.

**Qué espera el entrevistador:** que menciones `go vet`/`-race` como red de seguridad, la comparación honesta Mutex vs RWMutex vs atomic, y que sepas cuándo NO usar locks: si puedes rediseñar para que un solo owner (goroutine) posea el dato y los demás se comuniquen por channel, a menudo es más simple ("don't communicate by sharing memory; share memory by communicating") — pero también lo contrario: para un contador, un `atomic.Int64` es mejor que un channel.

---

## 7. `errgroup`: qué aporta sobre WaitGroup y cómo usarlo bien

**Categoría:** Concurrencia / Sincronización · **Tipo:** Conceptual

### 📝 Respuesta resumen
`golang.org/x/sync/errgroup` es un WaitGroup con manejo de errores y cancelación: `Group.Go` lanza tareas, `Wait` devuelve el **primer** error, y con `errgroup.WithContext` el primer fallo cancela el contexto compartido para que los hermanos aborten. `SetLimit(n)` acota la concurrencia. Es la herramienta por defecto para "lanza N operaciones, falla rápido, espera a todas".

### 📖 Respuesta detallada
Uso canónico en un microservicio (agregación de datos de varios servicios):

```go
func (s *Service) GetDashboard(ctx context.Context, userID string) (*Dashboard, error) {
    g, ctx := errgroup.WithContext(ctx) // ctx derivado: se cancela con el 1er error

    var profile *Profile
    var orders  []Order
    var recs    []Rec

    g.Go(func() error {
        var err error
        profile, err = s.profiles.Get(ctx, userID) // usa el ctx DERIVADO
        return err
    })
    g.Go(func() error {
        var err error
        orders, err = s.orders.List(ctx, userID)
        return err
    })
    g.Go(func() error {
        var err error
        recs, err = s.recommender.For(ctx, userID)
        if err != nil {
            recs = nil // degradación: no propagar error de un servicio opcional
            return nil
        }
        return err
    })

    if err := g.Wait(); err != nil {
        return nil, fmt.Errorf("dashboard: %w", err)
    }
    return &Dashboard{Profile: profile, Orders: orders, Recs: recs}, nil
}
```

Cada goroutine escribe en **su propia variable**, y `g.Wait()` actúa como barrera de memoria: leer `profile/orders/recs` después de `Wait` es seguro sin locks. Escribir varias goroutines en la misma variable sí sería race.

**Con límite de concurrencia (bounded parallelism):**

```go
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(10) // máx 10 en vuelo; g.Go BLOQUEA si el límite está lleno
for _, item := range items {
    g.Go(func() error { return process(ctx, item) }) // Go 1.22+: item por iteración
}
err := g.Wait()
```

**Detalles que marcan seniority:**

- **`Wait` devuelve solo el primer error**; los demás se descartan. Si necesitas todos (p. ej. reporte de validación), acumula en un slice protegido por mutex o usa un channel de errores.
- **El ctx de `WithContext` queda cancelado tras `Wait`** (incluso en éxito, desde su implementación actual): no lo reutilices para trabajo posterior; deriva del ctx padre original.
- La cancelación es **cooperativa**: si tus funciones ignoran `ctx`, el "fail fast" no aborta nada; solo dejará de lanzarse trabajo nuevo con `SetLimit`.
- `SetLimit` debe llamarse antes de cualquier `Go` activo; `TryGo` permite no bloquear si el límite está lleno.
- Pre-Go 1.22, el clásico bug de capturar la variable de loop (`item`) exigía shadow (`item := item`); en 1.22+ cada iteración tiene su variable, pero debes saber explicar el bug histórico porque hay mucho código legacy.
- Un panic dentro de `g.Go` tumba el proceso (errgroup clásico no recovera; versiones recientes lo propagan a `Wait`): en workers de servidor, envuelve con tu propio recover si procede.

**Alternativas y trade-offs:** `WaitGroup` puro cuando no hay errores que propagar; semáforo + channels cuando necesitas resultados en streaming en lugar de barrera final; `conc` (sourcegraph) como API más rica si el equipo lo adopta. El entrevistador quiere oír "errgroup es mi default para scatter-gather con fail-fast, y sé exactamente qué hace su ctx".

---

## 8. `sync/atomic` vs Mutex: cuándo y por qué

**Categoría:** Concurrencia / Sincronización · **Tipo:** Conceptual

### 📝 Respuesta resumen
`atomic` ofrece operaciones lock-free (Load, Store, Add, Swap, CompareAndSwap) sobre tipos primitivos y punteros, ideales para contadores, flags y snapshots de configuración (`atomic.Pointer[T]` con copy-on-write). Un Mutex es necesario cuando la invariante abarca **más de una variable** o una estructura mutable. Regla: atomic para un valor único e independiente; mutex para invariantes compuestas. Y nunca mezcles acceso atómico y no atómico a la misma variable.

### 📖 Respuesta detallada
Desde Go 1.19 existen los tipos `atomic.Int64`, `atomic.Bool`, `atomic.Pointer[T]`, etc., que evitan los errores de alineación y de API de las funciones antiguas (`atomic.AddInt64(&x, 1)`).

**Casos donde atomic es la respuesta correcta:**

```go
// 1. Contadores de métricas en hot path
type Stats struct {
    requests atomic.Int64
    errors   atomic.Int64
}
func (s *Stats) Hit(err error) {
    s.requests.Add(1)
    if err != nil { s.errors.Add(1) }
}

// 2. Config recargable: copy-on-write + atomic.Pointer
type Server struct{ cfg atomic.Pointer[Config] }

func (s *Server) Reload(c *Config) { s.cfg.Store(c) }        // escribe puntero nuevo
func (s *Server) handle() {
    cfg := s.cfg.Load() // snapshot inmutable, cero contención entre lectores
    _ = cfg.Timeout
}
```

El patrón 2 es la respuesta senior a "¿cómo sirvo configuración/feature flags a miles de RPS?": los lectores hacen un `Load` (una instrucción), y el writer construye un `*Config` **nuevo completo** y lo publica. Nadie muta el Config publicado — la inmutabilidad es lo que hace esto correcto.

**Dónde atomic se queda corto (y la gente se corta):**

```go
// MAL: dos atomics no forman una invariante atómica
if s.balance.Load() >= amount {   // otra goroutine puede pasar el mismo check
    s.balance.Add(-amount)        // → doble gasto
}

// BIEN con CAS-loop:
for {
    cur := s.balance.Load()
    if cur < amount { return ErrInsufficient }
    if s.balance.CompareAndSwap(cur, cur-amount) { return nil }
    // si otro ganó la carrera, reintenta
}
```

Si la invariante involucra varias variables (saldo + historial, mapa + contador), un CAS no alcanza: usa Mutex. El coste de un mutex sin contención es de ~20-25ns (fast path es un CAS + no syscall); solo bajo contención real escala mal. **No optimices a atomic por reflejo**: hazlo cuando el profiler muestre contención (`pprof` mutex profile, `runtime.SetMutexProfileFraction`).

**Reglas de memoria (Go memory model):** las operaciones atomic en Go son secuencialmente consistentes entre sí (equivalente a seq_cst; no hay ordering relajado configurable como en C++). Un `Store` atómico publica todo lo escrito antes (release) y un `Load` lo observa (acquire) — por eso el patrón `atomic.Pointer` a struct inmutable es seguro. Lo que **nunca** es válido: leer una variable "normal" sin sincronización porque "solo es un int" — es una data race, el compilador puede cachear la lectura en registro y no ver jamás el cambio. `-race` lo detecta.

**Qué espera el entrevistador:** la distinción "una variable vs una invariante", el patrón copy-on-write con `atomic.Pointer`, el CAS-loop, y madurez: "empiezo con mutex por claridad, paso a atomic con evidencia de profiling".

---

## 9. `context.Context`: cancelación, deadlines y valores — reglas de uso

**Categoría:** Context / Diseño de APIs · **Tipo:** Conceptual

### 📝 Respuesta resumen
`context` propaga cancelación, deadlines y valores request-scoped a través del árbol de llamadas. Reglas: primer parámetro `ctx context.Context`; siempre `defer cancel()`; la cancelación es cooperativa (tu código debe chequear `ctx.Done()` o pasarlo a APIs que lo hagan); cancelar un ctx cancela todos sus hijos; `ctx.Value` solo para datos transversales de request (trace ID, auth), jamás para parámetros de negocio; y no guardar contexts en structs.

### 📖 Respuesta detallada
El árbol de contexts: de `context.Background()` derivas hijos con `WithCancel`, `WithTimeout`, `WithDeadline`, `WithValue`, `WithCancelCause`. Cancelar al padre cancela recursivamente a todos los descendientes; el deadline efectivo es siempre el **más restrictivo** de la cadena.

```go
func (s *Service) ProcessOrder(ctx context.Context, id string) error {
    // Budget local más estricto que el del caller (nunca más laxo de facto)
    ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
    defer cancel() // SIEMPRE: libera el timer y la goroutine interna aunque no expire

    order, err := s.repo.Get(ctx, id) // database/sql, http, grpc aceptan ctx
    if err != nil {
        // distingue el "por qué" para métricas y retry
        if errors.Is(err, context.DeadlineExceeded) { ... }
        return err
    }

    // En loops largos sin I/O: chequeo explícito
    for _, item := range order.Items {
        if err := ctx.Err(); err != nil {
            return err // cooperativo: nadie mata goroutines a la fuerza
        }
        heavyCompute(item)
    }
    return nil
}
```

**Puntos que evalúa un entrevistador senior:**

1. **La cancelación no mata nada.** Cancelar un ctx solo cierra el channel `Done()`; una goroutine que no lo mira sigue corriendo (trabajo huérfano, leak). El contrato es cooperativo de punta a punta.
2. **`defer cancel()` no es opcional.** Un `WithTimeout` sin cancel deja timer + goroutine vivos hasta expirar; miles de requests/seg lo convierten en leak medible. `go vet` (lostcancel) lo señala.
3. **`ctx.Value`: el criterio.** Solo datos *request-scoped* que atraviesan APIs que no puedes cambiar: trace/span, request ID, identidad autenticada, tenant. Nunca: conexión de DB, logger obligatorio para la lógica, parámetros funcionales. Claves con tipo propio no exportado para evitar colisiones:
```go
type ctxKey struct{}
func WithUser(ctx context.Context, u User) context.Context { return context.WithValue(ctx, ctxKey{}, u) }
func UserFrom(ctx context.Context) (User, bool) { u, ok := ctx.Value(ctxKey{}).(User); return u, ok }
```
4. **No guardar ctx en structs** (regla oficial): un ctx pertenece a una llamada/request, no a un objeto de larga vida. Excepción conocida y documentada: structs que representan una operación en curso (`http.Request` lo hace).
5. **`context.WithoutCancel` (Go 1.21):** para trabajo que debe sobrevivir a la request (auditoría, publicar evento tras responder) — hereda los valores (¡trazas!) pero no la cancelación. Antes se hacía a mano y era fuente de bugs (usar `context.Background()` pierde el trace).
6. **`WithCancelCause` / `context.Cause(ctx)`:** permite registrar *por qué* se canceló (p.ej. "circuit breaker abierto") en lugar del genérico `context.Canceled`.

Errores comunes de producción: pasar `context.Background()` "para que no me cancelen" (rompe la propagación de deadlines y deja trabajo zombi tras el timeout del caller), y timeouts iguales en toda la cadena (el downstream debería tener menos budget que el upstream para poder responder el error a tiempo).

---

## 10. Escape analysis, stack vs heap, y cómo reducir allocaciones

**Categoría:** Memoria / Performance · **Tipo:** Conceptual

### 📝 Respuesta resumen
El compilador decide con *escape analysis* si un valor vive en el stack (gratis: se libera al retornar) o "escapa" al heap (coste de allocación + trabajo para el GC). Escapan: valores cuya referencia sobrevive a la función, lo que cruza interfaces (a menudo), capturas de closures que sobreviven, y slices de tamaño dinámico. Se inspecciona con `go build -gcflags='-m'` y se ataca con pprof (`alloc_objects`), `sync.Pool` y APIs que reciben buffers (`AppendX`).

### 📖 Respuesta detallada
Go no decide stack/heap por sintaxis (`new` no implica heap) sino por análisis: si el compilador puede probar que ninguna referencia al valor sobrevive al frame, va al stack.

**Causas típicas de escape:**

```go
func newUser() *User {
    u := User{Name: "x"}
    return &u            // escapa: la referencia sobrevive a la función
}

func log(v interface{}) { ... }
log(42)                  // el int suele escapar al convertirse a interface{}
                         // (fmt.Println y logging son fábricas de allocaciones)

func f() []byte {
    n := computeSize()
    b := make([]byte, n) // tamaño no constante → heap
    return b
}

var global *int
func g() { x := 5; global = &x } // escapa a variable global

func handler() func() int {
    count := 0
    return func() int { count++; return count } // count escapa con la closure
}
```

Diagnóstico:

```bash
go build -gcflags='-m -m' ./... 2>&1 | grep escape
# "moved to heap: u", "x escapes to heap", "... does not escape"
```

Y en runtime, `go tool pprof -alloc_objects http://svc/debug/pprof/heap` te dice **dónde** se aloca más (para presión de GC importa `alloc_objects`/`alloc_space` acumulados, no solo `inuse`).

**Técnicas de reducción (con sus trade-offs):**

1. **APIs estilo append:** en lugar de `func Marshal(v T) []byte`, ofrecer `func AppendMarshal(dst []byte, v T) []byte` — el caller reutiliza el buffer. Es el patrón de `strconv.AppendInt`, `time.AppendFormat`.
2. **`sync.Pool`** para objetos grandes y frecuentes (buffers de serialización, `gzip.Writer`):
```go
var bufPool = sync.Pool{New: func() any { return new(bytes.Buffer) }}
buf := bufPool.Get().(*bytes.Buffer)
buf.Reset()
defer bufPool.Put(buf)
```
Cuidados: el pool se vacía en cada GC (no es una cache garantizada), no guardes buffers gigantes de vuelta (pin de memoria: comprueba `cap` antes de `Put`), y nunca devuelvas un objeto que alguien más sigue referenciando.
3. **Preasignar slices/maps con capacidad conocida** (`make([]T, 0, n)`) para evitar los re-growth (cada crecimiento = nueva allocación + copia).
4. **Evitar interfaces en hot paths** medidos: la conversión a interface puede alocar; generics (`func Sum[T Number](xs []T)`) evitan el boxing.
5. **Struct values vs punteros:** devolver values pequeños por copia suele ser más barato que punteros (copia en stack vs allocación + presión de GC + indirection en cada acceso).

**Madurez esperada:** no microoptimizar a ciegas — "primero pprof, luego -gcflags='-m' en el hot path identificado, benchmark con `-benchmem` antes/después". Y saber que la inlining afecta al escape analysis: una función no inlineable puede forzar escapes que desaparecen al simplificarla. Errores comunes: usar `sync.Pool` para objetos diminutos (el overhead del pool supera la allocación) y "optimizar" a punteros en todas partes empeorando cache locality y GC.

---

## 11. El GC de Go: cómo funciona, GOGC y GOMEMLIMIT

**Categoría:** Memoria / GC · **Tipo:** Conceptual

### 📝 Respuesta resumen
Go usa un GC concurrente mark-and-sweep, tri-color, con write barriers y **sin compactación** ni generaciones. Los stop-the-world son sub-milisegundo; la mayor parte del marcado corre concurrente robando ~25% de CPU. `GOGC` (default 100) controla cuánto puede crecer el heap entre ciclos (100 = duplicarse); `GOMEMLIMIT` (Go 1.19) fija un techo blando de memoria total que hace el GC más agresivo al acercarse. La combinación estándar en contenedores: `GOMEMLIMIT` ~90% del límite del contenedor, `GOGC` según trade-off CPU/memoria.

### 📖 Respuesta detallada
**Mecánica:** tri-color concurrente — blanco (candidato a basura), gris (alcanzado, pendiente de escanear), negro (vivo y escaneado). Fases: (1) STW breve para activar write barriers y escanear raíces (~decenas de µs–pocos ms), (2) marcado concurrente con dedicación ~25% de `GOMAXPROCS` más *mark assists* (¡las goroutines que alocan mucho son reclutadas para ayudar a marcar → latencia imputada al que aloca!), (3) STW de terminación de marca, (4) sweep concurrente/perezoso. El write barrier garantiza que mutaciones durante el marcado no "escondan" objetos vivos.

Consecuencias de diseño:
- **Sin generaciones ni compactación** → no hay pausas de compaction, pero hay posible fragmentación (mitigada por size classes de tcmalloc-style) y el coste de marcado es proporcional a los **punteros vivos**: heaps con millones de objetos pequeños con punteros (mapas gigantes de strings, árboles) son caros de marcar. Optimización clásica: estructuras "flat" sin punteros (`[]byte` + índices, `map[int32]int32`) que el GC ni escanea.
- El coste del GC ≈ frecuencia de ciclos × coste de marcado. Reducir **allocación** (pprof `alloc_objects`) reduce frecuencia; reducir **punteros vivos** reduce el coste de cada ciclo.

**GOGC:** el pacer dispara el siguiente ciclo cuando `heap_live ≈ heap_marked × (1 + GOGC/100)`. `GOGC=100`: el heap puede llegar al doble del live set. Subirlo (`GOGC=400`) = menos ciclos, menos CPU de GC, más RAM. Bajarlo = lo contrario. `GOGC=off` lo desactiva (solo válido junto con GOMEMLIMIT o en batch jobs cortos).

**GOMEMLIMIT:** techo *blando* de la memoria total del runtime (heap + stacks + estructuras). Al acercarse, el GC corre más frecuente; si el live set se acerca al límite, puede degenerar en "death spiral" de GC continuo (por eso hay un cap de ~50% de CPU para GC). Resuelve el problema clásico de OOM-kill en contenedores: antes de 1.19, un pico de allocación con `GOGC=100` podía duplicar el heap y superar el límite del cgroup aunque el live set fuera pequeño.

**Receta de producción para un microservicio en Kubernetes:**

```
limits.memory: 1Gi
env:
  GOMEMLIMIT: "900MiB"   # ~90%: margen para stacks, cgo, page cache del runtime
  GOGC: "100"            # o mayor si sobra memoria y falta CPU
```

**Observabilidad:** `GODEBUG=gctrace=1` (una línea por ciclo: pausas, heap goal, CPU); métricas de `runtime/metrics` (`/gc/heap/live`, `/gc/pauses`, `/cpu/classes/gc/...`); `go tool trace` muestra mark assists castigando goroutines concretas. Síntoma clásico de examen: "p99 alto correlacionado con ciclos de GC" → mirar % CPU en GC y assists, atacar la tasa de allocación (sync.Pool, AppendX) antes que tunear GOGC.

Errores comunes: llamar `runtime.GC()` manualmente en servidores, subir GOGC sin límite en contenedores (OOM), y confundir "memoria RSS no baja" con leak (el runtime retiene y devuelve páginas al OS gradualmente; ver pregunta de casos).

---

## 12. Slices internals: capacidad, aliasing, append y sus gotchas

**Categoría:** Estructuras de datos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un slice es un header de 3 palabras {puntero al array, len, cap} pasado por copia; el array subyacente es compartido. `append` muta el array compartido si hay capacidad, o aloca uno nuevo si no — de ahí los bugs de aliasing: dos slices que "a veces" comparten memoria. Gotchas top: sub-slicing retiene el array completo (leak), `append` sobre un sub-slice pisa datos del padre, y la solución es el *full slice expression* `s[a:b:c]` o copiar explícitamente.

### 📖 Respuesta detallada
```go
s := make([]int, 3, 8) // header: {ptr, len:3, cap:8}
t := s[1:3]            // t comparte el MISMO array; {ptr+1, len:2, cap:7}
```

**Gotcha 1 — append que pisa al padre:**

```go
a := []int{1, 2, 3, 4, 5}
b := a[:2]           // len 2, cap 5: le "sobran" 3 huecos del array de a
b = append(b, 99)    // hay capacidad → escribe en el array compartido
fmt.Println(a)       // [1 2 99 4 5]  ← a[2] fue pisado silenciosamente
```
Este bug es insidioso porque **depende de la capacidad**: si `b` no hubiera tenido cap sobrante, `append` habría alocado un array nuevo y `a` quedaría intacto. El mismo código corrompe o no según el historial del slice. Fix: **full slice expression** — `b := a[:2:2]` limita cap a 2, forzando a `append` a alocar siempre; o `b := slices.Clone(a[:2])`.

**Gotcha 2 — retención de memoria (leak por sub-slice):**

```go
func firstLine(data []byte) []byte { // data puede ser 100MB
    i := bytes.IndexByte(data, '\n')
    return data[:i] // ¡retiene los 100MB! el GC ve el array entero alcanzable
}
// Fix:
return bytes.Clone(data[:i]) // copia solo lo necesario
```

**Gotcha 3 — el header se copia, el array no:**

```go
func addItem(s []int) { s = append(s, 1) } // el caller NO ve el append (header por copia)
func fill(s []int)    { s[0] = 42 }        // el caller SÍ ve esto (array compartido)
```
Por eso `append` siempre se usa como `s = append(s, x)` y las funciones que "extienden" deben devolver el slice.

**Crecimiento:** cuando `append` no tiene capacidad, aloca un array mayor (~2× para slices pequeños, ~1.25× para grandes desde Go 1.18+, con ajuste a size classes) y **copia**. En loops calientes, `make([]T, 0, n)` preasignado evita O(log n) reallocaciones y basura intermedia.

**Otras trampas de nivel senior:**
- `var s []int` (nil) vs `s := []int{}` (vacío no-nil): ambos con `len 0` y `append` funciona en ambos; difieren en `s == nil` y en serialización JSON (`null` vs `[]`) — fuente real de bugs de contrato de API.
- Slices como claves de comparación: no son comparables (`==` no compila salvo contra nil); usa `slices.Equal`.
- Compartir slices entre goroutines: dos goroutines haciendo `append` sobre el mismo slice es race sobre el header Y sobre el array; incluso lecturas concurrentes con un `append` que realoca son race.
- `copy(dst, src)` copia `min(len(dst), len(src))` — el clásico `dst := make([]T, 0, n); copy(dst, src)` copia **cero** elementos (len 0).

**Qué espera el entrevistador:** que dibujes el header, expliques el bug de aliasing con append dependiente de capacidad, conozcas `s[a:b:c]` y el leak por retención. Bonus: `slices.Grow`, `slices.Clip` (pone cap=len) del paquete `slices` estándar.

---

## 13. Maps internals: buckets, iteración aleatoria y concurrencia

**Categoría:** Estructuras de datos · **Tipo:** Conceptual

### 📝 Respuesta resumen
El map de Go es una hash table de buckets de 8 entradas con overflow chaining y crecimiento incremental (hasta Go 1.23; Go 1.24 lo reemplazó por Swiss Tables, más compacto y rápido). Claves de examen: el orden de iteración es deliberadamente aleatorio, el acceso concurrente con al menos un writer provoca `fatal error: concurrent map writes` (crash no recuperable, no un panic), los elementos no son addressables (`&m[k]` no compila), y un map nunca "encoge" sus buckets aunque borres todo.

### 📖 Respuesta detallada
**Estructura (pre-1.24, aún la referencia de entrevista):** `hmap` apunta a un array de buckets; cada bucket guarda 8 pares con los top-8 bits del hash (`tophash`) para descartar rápido, y un puntero a bucket de overflow. Con load factor ~6.5/8 se duplica el número de buckets y la migración es **incremental**: cada operación mueve algunos buckets viejos (por eso insertar durante un growth tiene coste variable). En Go 1.24, la implementación pasó a **Swiss Tables** (grupos de 8 slots con metadata de control comparable por SIMD): ~30% menos overhead y mejor localidad — buen bonus mencionarlo.

**Gotchas que definen la pregunta:**

1. **Iteración aleatoria a propósito:** el runtime elige un bucket y offset inicial aleatorios en cada `range`. Es una decisión de diseño para que nadie dependa del orden (que cambiaría entre versiones). Si necesitas orden: extrae claves, `slices.Sort`, itera.

2. **Concurrencia — crash, no race "silenciosa":** el runtime tiene detección barata de escritura concurrente y aborta con `fatal error: concurrent map read and map write` que **no es capturable con recover** (es throw, no panic). Opciones:
   - `sync.Mutex`/`RWMutex` envolviendo el map (default correcto).
   - `sync.Map` solo para sus dos casos benditos: claves write-once/read-many (caches de tipo, registries) o goroutines que trabajan sobre conjuntos de claves disjuntos. Para uso general es más lento y sin tipos (hasta las mejoras recientes basadas en HashTrieMap).
   - Sharding manual (N maps con N mutexes por hash de clave) para alta contención.

3. **No addressability:** `m[k].field = v` no compila si el value es struct (el value puede moverse en un growth). Patrón: value como puntero (`map[string]*Obj`) o leer-modificar-escribir (`o := m[k]; o.F = v; m[k] = o`).

4. **La memoria no se devuelve:** borrar todas las claves (`clear(m)` en 1.21+, o loop de delete) vacía el map pero mantiene los buckets alocados. Un map que creció a 10M entradas y ahora tiene 100 sigue ocupando memoria de 10M. Fix: crear un map nuevo y dejar que el GC recoja el viejo. Es causa real de "memoria que no baja" en servicios con caches caseras.

5. **Micro-detalles útiles:** `make(map[K]V, hint)` preasigna buckets y evita growths; el zero value (`var m map[K]V`) permite leer (zero values) pero **panic al escribir**; las claves deben ser comparables (slices/maps/funcs no); comparar structs con campos no comparables como clave = panic en runtime, no compile error, si el tipo es interface.

**Qué espera oír:** el porqué del orden aleatorio, el fatal error no recuperable (y que `-race` lo cazaría antes), los criterios reales de `sync.Map` (citados de su doc), y el gotcha de memoria que no encoge — este último conecta con debugging de memoria en producción.

---

## 14. Interfaces internals: iface/eface y el gotcha del "typed nil"

**Categoría:** Tipos / Interfaces · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una interface es un par de palabras: (tipo, puntero a dato) — `iface` con itab (tipo + tabla de métodos) para interfaces con métodos, `eface` (tipo, dato) para `interface{}`. Una interface es `nil` solo si **ambas** palabras son nil. De ahí el gotcha más famoso de Go: devolver un `*MyError` nil dentro de un `error` produce una interface no-nil (tipo=`*MyError`, valor=nil) y el `if err != nil` del caller se cumple. Regla: las funciones que devuelven `error` deben devolver el literal `nil`, no un puntero concreto que "es nil".

### 📖 Respuesta detallada
**Representación:**

```
iface: [ *itab | unsafe.Pointer ]   // itab = {tipo concreto, interfaz, tabla de métodos}
eface: [ *_type | unsafe.Pointer ]  // para interface{} / any
```

El *method dispatch* es una indirection por la itab (calculada una vez y cacheada por par tipo-interfaz). Meter un valor en una interface puede requerir **alocarlo en heap** (boxing) — relevante para hot paths (ver escape analysis).

**El gotcha canónico:**

```go
type ValidationError struct{ Field string }
func (e *ValidationError) Error() string { return e.Field }

func validate(input string) *ValidationError {
    if input != "" { return nil }
    return &ValidationError{Field: "input"}
}

func handler(input string) error {
    var err error = validate(input) // ← aquí está el bug
    return err
}

func main() {
    err := handler("ok")
    fmt.Println(err == nil) // false 😱  (tipo=*ValidationError, valor=nil)
}
```

Al asignar el `*ValidationError(nil)` a `error`, la interface guarda el **tipo** `*ValidationError` y el valor nil. `err != nil` compara la interface completa: como la palabra de tipo no es nil, la interface no es nil. El programa entra al branch de error con un error cuyo `Error()` puede además panic (nil receiver).

**Reglas para evitarlo:**
1. Las funciones devuelven `error`, no tipos concretos de error. `func validate(...) error` y dentro `return nil` literal.
2. Si necesitas el tipo concreto en el caller: devuelve `error` y usa `errors.As`.
3. Linters (`staticcheck` no lo caza siempre; el conocimiento del equipo sí). En code review, cualquier `return err` donde `err` es de tipo concreto puntero es sospechoso.

**Otros aspectos internos que suman puntos:**
- **Comparación de interfaces:** `a == b` compara (tipo, valor). Si los tipos dinámicos son iguales pero **no comparables** (slice, map, func) → panic en runtime. Por eso `any` como clave de map es una mina.
- **Type assertion vs type switch:** `v, ok := x.(T)` es barato (comparación de punteros de tipo/itab); un type switch compila a una cadena de comparaciones. `x.(T)` sin `ok` panics si falla.
- **Method sets:** `*T` tiene los métodos de `T` y de `*T`; `T` solo los de receiver value. Un valor `T` no addressable (elemento de map, resultado de función) no satisface interfaces cuyos métodos son de puntero — clásico error de compilación "T does not implement I (method has pointer receiver)".
- **Interfaces pequeñas** como filosofía de diseño: "accept interfaces, return structs"; interfaces definidas por el **consumidor** (donde se usan), no junto a la implementación — esto habilita mocks sin frameworks.

El entrevistador espera el diagrama de dos palabras, el ejemplo del typed nil explicado sin dudar, y la regla práctica de "siempre devuelve el tipo interface `error`".

---

## 15. Generics en Go: type parameters, constraints y cuándo usarlos

**Categoría:** Tipos / Generics · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los generics (Go 1.18+) permiten funciones y tipos parametrizados por tipos con *constraints* (interfaces, incluyendo uniones de tipos y `~T` para tipos derivados). Casos buenos: estructuras de datos contenedoras, utilidades sobre slices/maps/channels, evitar boxing en hot paths. Casos malos: reemplazar interfaces donde el polimorfismo de comportamiento ya funciona. La implementación (GC-shape stenciling con dictionaries) comparte código entre tipos con la misma "forma" — no es siempre tan rápido como monomorfización total.

### 📖 Respuesta detallada
```go
// Constraint con unión de tipos y aproximación (~)
type Number interface {
    ~int | ~int64 | ~float64 // ~int acepta `type MyInt int`
}

func Sum[T Number](xs []T) T {
    var total T
    for _, x := range xs { total += x }
    return total
}

// Tipo genérico: cache tipada
type Cache[K comparable, V any] struct {
    mu sync.RWMutex
    m  map[K]V
}

func (c *Cache[K, V]) Get(k K) (V, bool) {
    c.mu.RLock(); defer c.mu.RUnlock()
    v, ok := c.m[k]
    return v, ok
}
```

**Cuándo generics es la respuesta correcta:**
1. **Contenedores y estructuras de datos:** stacks, sets, LRU caches, result types — antes exigían `interface{}` + assertions (pérdida de type safety y boxing).
2. **Utilidades de slices/maps:** el propio stdlib (`slices.SortFunc`, `maps.Keys`) es el ejemplo.
3. **Performance:** `func Sum[T Number]` sobre `[]int64` opera sin boxear cada elemento en interfaces; en hot paths numéricos la diferencia es real.
4. **APIs con relación entre tipos:** `func Map[T, U any](xs []T, f func(T) U) []U` — imposible de expresar con interfaces sin perder tipos.

**Cuándo NO:**
- Si solo necesitas **comportamiento polimórfico** (un `io.Reader`, un `Repository`), la interface es más simple, permite mocks y no infecta las firmas. Señal de mal uso: `[T any]` donde T solo se pasa a métodos de una interface que ya tienes.
- Métodos no pueden tener type parameters propios (limitación del lenguaje): `func (c *Cache[K,V]) MapValues[U any](...)` no compila — a veces esto obliga a funciones libres y rompe el diseño esperado.
- No hay especialización condicional ni metaprogramación: si sientes que necesitas "si T es X haz esto", el diseño es incorrecto (o usas una interface).

**Implementación (nivel senior):** Go usa *GC-shape stenciling*: genera una instancia por "forma" (todos los punteros comparten shape) y pasa un *dictionary* con la info del tipo concreto para operaciones dependientes del tipo. Consecuencia: `Sum[*Foo]` y `Sum[*Bar]` comparten código (llamadas a métodos vía dictionary pueden impedir inlining y devirtualización), mientras `Sum[int]` y `Sum[float64]` tienen instancias distintas. Traducción práctica: **generics con tipos concretos escalares suelen ser rápidos; generics sobre punteros con llamadas a métodos pueden no ganar nada** frente a interfaces — hay que benchmarkear, no asumir.

**Constraints útiles del ecosistema:** `comparable` (claves de map; ojo: interfaces son comparables estáticamente pero pueden panic en runtime — por eso existe la vuelta de tuerca de "strictly comparable"), `constraints.Ordered` (`cmp.Ordered` en stdlib desde 1.21), y definir constraints propias mínimas.

**Qué espera el entrevistador:** criterio (interfaces para comportamiento, generics para contenedores/relaciones de tipos), el significado de `~`, `comparable`, y idealmente una mención honesta al stenciling y sus implicaciones de performance.

---

## 16. Error handling idiomático: wrapping, errors.Is/As, sentinel vs typed errors

**Categoría:** Errores / Diseño de APIs · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los errores son valores. Se envuelven con `fmt.Errorf("contexto: %w", err)` para añadir contexto sin perder la causa; `errors.Is` compara contra sentinels a través de la cadena de wrapping y `errors.As` extrae tipos concretos. Sentinel errors (`var ErrNotFound = errors.New(...)`) para condiciones fijas comparables; typed errors (structs) cuando el error transporta datos. Regla de API: envolver con `%w` expone la causa como contrato público — hazlo consciente; `%v` la oculta a propósito.

### 📖 Respuesta detallada
**Wrapping y la cadena de errores:**

```go
func (r *Repo) GetUser(ctx context.Context, id string) (*User, error) {
    u, err := r.db.QueryRow(ctx, q, id)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, fmt.Errorf("user %s: %w", id, ErrNotFound) // traduce al error del dominio
    }
    if err != nil {
        return nil, fmt.Errorf("querying user %s: %w", id, err) // contexto + causa
    }
    return u, nil
}

// En el handler HTTP, decisión por semántica, no por string:
switch {
case errors.Is(err, ErrNotFound):
    http.Error(w, "not found", http.StatusNotFound)
case errors.As(err, &validationErr):
    http.Error(w, validationErr.Field, http.StatusBadRequest)
default:
    logger.Error("unhandled", "err", err) // aquí sí se loguea, UNA vez
    http.Error(w, "internal error", http.StatusInternalServerError)
}
```

`errors.Is(err, target)` recorre la cadena de `Unwrap()` comparando con `==` (o `Is(error) bool` custom). `errors.As(err, &target)` busca el primer error asignable al tipo destino. Desde Go 1.20, `errors.Join` y el soporte de `Unwrap() []error` permiten árboles de errores (multi-error), e `Is/As` los recorren.

**Sentinel vs typed — criterio:**
- **Sentinel** (`var ErrRateLimited = errors.New("rate limited")`): condición sin datos, comparable con `Is`. Exportarlo lo convierte en **API pública** (compatibilidad para siempre). Úsalo con moderación.
- **Typed** (struct que implementa `error`): cuando el caller necesita datos del error:
```go
type QuotaError struct{ Limit, Used int; RetryAfter time.Duration }
func (e *QuotaError) Error() string { return fmt.Sprintf("quota %d/%d", e.Used, e.Limit) }
```
- **Opaque errors + comportamiento:** a veces basta exponer una función (`IsRetryable(err) bool`) o una interface (`interface{ Temporary() bool }`) sin exportar tipos — mínimo acoplamiento.

**Errores comunes que el entrevistador quiere oír:**
1. **`err.Error() == "..."` o `strings.Contains`** para decidir lógica: frágil, se rompe con cualquier cambio de mensaje.
2. **Log-and-return:** loguear el error y además retornarlo → cada capa lo loguea → 5 stack de logs por un fallo. Regla: *o lo manejas, o lo retornas (con contexto); se loguea una vez, en el borde*.
3. **Wrapping indiscriminado con `%w`:** exponer `sql.ErrNoRows` de tu repositorio significa que los callers pueden depender de que uses SQL. En fronteras de capa, **traduce** a errores del dominio (como el `ErrNotFound` de arriba).
4. **Perder contexto:** `return err` pelado desde 6 niveles de profundidad produce "connection refused" sin saber de qué conexión. Cada nivel añade su pieza: `"processing order 123: charging payment: connection refused"`.
5. **Typed nil** (ver pregunta de interfaces): devolver `*QuotaError` nil como `error`.

Bonus points: mencionar que los stack traces no vienen de serie (decisión de diseño; `%w` encadena contexto en su lugar; si se necesitan, `pkg/errors` legacy o capturar en el borde con el logger), y el patrón de comprobar errores de `defer` en escrituras (`defer f.Close()` ignorando el error en un writer puede perder datos: cierra explícito y captura el error).

---

## 17. `defer`: semántica precisa y sus gotchas

**Categoría:** Lenguaje / Control de flujo · **Tipo:** Conceptual

### 📝 Respuesta resumen
`defer` encola una llamada para ejecutarse al salir de la **función** (no del bloque), en orden LIFO, evaluando **los argumentos en el momento del defer** pero ejecutando el cuerpo al final. Gotchas: defers en loops se acumulan hasta el return (leak de fds), argumentos capturados "congelados" vs closures que ven el valor final, modificación de named return values, y el coste (hoy casi nulo: open-coded defers desde 1.14).

### 📖 Respuesta detallada
**Los cuatro gotchas canónicos:**

**1. Argumentos evaluados en el defer, no al ejecutar:**
```go
func f() {
    x := 1
    defer fmt.Println("A:", x) // imprime 1: x se evaluó AHORA
    defer func() { fmt.Println("B:", x) }() // imprime 2: la closure lee x al final
    x = 2
}
```
Corolario con receivers: `defer obj.Method()` evalúa `obj` ya (si luego reasignas la variable, el defer usa el viejo); y `defer log(time.Since(start))` mide **cero** — el `time.Since` se evalúa al deferir. Correcto: `defer func() { log(time.Since(start)) }()`.

**2. Defer en loops — se acumulan hasta el return de la función:**
```go
func processAll(paths []string) error {
    for _, p := range paths {
        f, err := os.Open(p)
        if err != nil { return err }
        defer f.Close() // ¡10k archivos abiertos simultáneamente hasta el return!
        use(f)
    }
    return nil
}
// Fix: extraer el cuerpo a una función (o closure) con su propio defer
for _, p := range paths {
    if err := func() error {
        f, err := os.Open(p)
        if err != nil { return err }
        defer f.Close()
        return use(f)
    }(); err != nil { return err }
}
```
Este es el origen real de "servidor agota file descriptors" en jobs de procesamiento.

**3. Named returns + defer = el único modo de modificar el valor devuelto:**
```go
func do() (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("recovered: %v", r) // legítimo: convertir panic en error
        }
        if err != nil {
            err = fmt.Errorf("do: %w", err) // wrapping centralizado
        }
    }()
    ...
}
```
Con returns anónimos, un defer no puede tocar lo devuelto. Este patrón es la base de `recover` en workers y de instrumentación (medir duración + status).

**4. Errores de Close ignorados:**
```go
defer f.Close() // en un WRITER, el error de Close puede ser el flush fallido = datos perdidos
// Correcto para writers:
defer func() {
    if cerr := f.Close(); cerr != nil && err == nil { err = cerr }
}()
```
Para readers, ignorar el error de Close es aceptable y idiomático.

**Detalles de runtime que suman:** desde Go 1.14 los *open-coded defers* hacen que un defer simple cueste ~1ns (inline en el frame, sin allocación) cuando el número de defers es fijo y ≤8 sin loops; defers en loops usan el mecanismo heap-allocated antiguo. Traducción: no evites `defer mu.Unlock()` "por performance" — esa época pasó; la legibilidad y la seguridad ante panics (el unlock ocurre incluso si la sección crítica panickea) ganan.

**Y recover:** solo funciona llamado **directamente** dentro de un defer de la goroutine que panickea; un panic en una goroutine sin recover propio tumba el proceso entero (no existe recover "global") — esto conecta con el caso de producción correspondiente.

---

## 18. `for range`, closures y goroutines: el bug clásico de captura de variables

**Categoría:** Lenguaje / Concurrencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
Hasta Go 1.21, la variable de un `for range` era **una sola** reutilizada por iteración: lanzarla capturada en goroutines/closures hacía que casi todas vieran el último valor. El fix clásico era shadow (`v := v`) o pasarla como argumento. Desde Go 1.22, cada iteración tiene su propia variable y el bug desaparece — pero hay que saber explicarlo por el código legacy y porque revela cómo funcionan las closures (capturan por referencia).

### 📖 Respuesta detallada
**El bug (semántica pre-1.22):**

```go
ids := []string{"a", "b", "c"}
for _, id := range ids {
    go func() {
        process(id) // pre-1.22: probablemente "c", "c", "c"
    }()
}
```

Las closures en Go capturan **variables**, no valores. Pre-1.22 había una única variable `id` mutada en cada vuelta; las goroutines, que arrancan cuando el scheduler quiere (normalmente después de que el loop avance), leían el estado final. El mismo bug aplicaba a guardar punteros/closures en slices dentro del loop, y a `defer` en loops.

**Fixes clásicos (que verás en todo el código legacy):**

```go
for _, id := range ids {
    id := id                    // shadow: nueva variable por iteración
    go func() { process(id) }()
}
// o pasar por parámetro (evaluación inmediata):
for _, id := range ids {
    go func(id string) { process(id) }(id)
}
```

**Go 1.22 cambió la semántica del lenguaje** (con la directiva `go 1.22` en go.mod): cada iteración declara variables nuevas. Fue un cambio retrocompatible-por-módulo tras análisis masivo de código real (el patrón era abrumadoramente un bug, casi nunca intencional). `go vet` (loopclosure) cazaba los casos obvios; ahora es innecesario para código 1.22+.

**Lo que el entrevistador realmente evalúa con esta pregunta:**

1. **Que entiendas la captura por referencia:** una closure que captura `x` comparte la variable con el entorno; si dos closures capturan la misma variable, se ven mutuamente. Esto sigue siendo cierto en 1.22+ — solo cambió cuántas variables crea el loop.
2. **La interacción con el scheduler:** el bug era no determinista — a veces salía "bien" en tests (poca carga, la goroutine corría antes del siguiente tick del loop) y mal en producción. Buen pie para hablar de por qué `-race` y tests con `-count` importan.
3. **Variantes del mismo bug que 1.22 NO arregla:**
```go
var wg sync.WaitGroup
results := make([]Result, len(jobs))
for i, j := range jobs {
    wg.Add(1)
    go func() {
        defer wg.Done()
        results[i] = run(j) // OK en 1.22+ (i, j por iteración) y sin race (índices disjuntos)
    }()
}
wg.Wait()
```
   vs el antipatrón `results = append(results, ...)` desde varias goroutines (race en el header del slice, siempre, en cualquier versión).
4. **Range sobre otras cosas:** `range` sobre map (orden aleatorio), sobre channel (consume hasta close), sobre func (range-over-func / iteradores de Go 1.23: `func(yield func(V) bool)`) — mencionar los iteradores modernos (`iter.Seq`) es un bonus de estar al día.

**Respuesta redonda:** explica el bug con la línea de tiempo (loop termina antes de que las goroutines lean), da los dos fixes clásicos, y remata con "desde 1.22 la semántica es per-iteration, pero en el codebase con `go 1.21` en go.mod el bug sigue vivo — el go.mod decide".

---

## 19. Stack growth, `sync.Pool` y presión de GC en hot paths

**Categoría:** Memoria / Performance · **Tipo:** Conceptual

### 📝 Respuesta resumen
En servicios de alto throughput, los tres frenos de memoria típicos son: allocación excesiva por request (presión de GC), crecimiento de stacks en call chains profundos, y objetos grandes de vida corta. `sync.Pool` amortiza el segundo y tercero reutilizando objetos entre requests, con reglas estrictas: `Reset` antes de reutilizar, no retener referencias tras `Put`, y aceptar que el pool se limpia con cada GC. La evidencia siempre viene de pprof (`alloc_objects`) y benchmarks con `-benchmem`.

### 📖 Respuesta detallada
**El problema:** un endpoint que aloca 50KB por request a 5000 RPS genera 250MB/s de basura. El GC deberá correr constantemente, robando CPU (~25% + mark assists sobre las goroutines que alocan) y ensuciando latencias p99.

**sync.Pool bien usado:**

```go
var bufPool = sync.Pool{
    New: func() any { return bytes.NewBuffer(make([]byte, 0, 4096)) },
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    buf := bufPool.Get().(*bytes.Buffer)
    buf.Reset()                       // CRÍTICO: estado del uso anterior
    defer bufPool.Put(buf)

    if err := json.NewEncoder(buf).Encode(h.build(r)); err != nil { ... }
    w.Write(buf.Bytes())              // ojo: escribir ANTES del Put (defer ordena bien aquí)
}
```

**Reglas y trampas de sync.Pool:**
1. **Reset obligatorio:** olvidarlo mezcla datos de requests distintas — con suerte corrupción visible, sin suerte **fuga de datos entre usuarios** (incidente de seguridad clásico).
2. **No retener tras Put:** devolver el buffer y seguir usando `buf.Bytes()` (o habérselo pasado a algo asíncrono) es use-after-free lógico: otra goroutine hará Get y escribirá encima. Las races resultantes son terribles de depurar porque `-race` puede no verlas (el pool sincroniza).
3. **El pool se vacía en GC** (con un victim cache que da una generación de gracia): no sirve como cache de conexiones ni de nada que deba sobrevivir; para eso, un pool con lista propia.
4. **Objetos de tamaño muy variable:** si a veces creces el buffer a 10MB, devolverlo al pool "fija" esa memoria. Patrón: `if buf.Cap() > maxRetained { return }` antes de Put.
5. **No para objetos triviales:** poolear un struct de 3 ints pierde contra el allocator (el tcache de Go es rapidísimo para objetos pequeños).

**Otras palancas del mismo problema:**
- **Streaming en lugar de materializar:** `json.NewEncoder(w).Encode(v)` directo al ResponseWriter en lugar de `json.Marshal` a un []byte intermedio.
- **APIs Append** (`AppendQuote`, `AppendFormat`) y `strconv` en lugar de `fmt.Sprintf` (fmt usa reflection y aloca).
- **Stacks:** goroutines con recursión profunda o frames grandes fuerzan `morestack` (copias de stack). El stack encoge al hacerse GC si sobra mucho; workers de larga vida que una vez crecieron a 1MB no son leak sino histéresis. Visible en pprof CPU como `runtime.morestack`/`runtime.newstack`.
- **Medición honesta:** `go test -bench . -benchmem` (allocs/op es la métrica), pprof en producción comparando `alloc_space` entre despliegues, y `runtime/metrics` para % de CPU en GC.

**Qué espera el entrevistador:** el flujo completo evidencia→fix→verificación, los riesgos de seguridad del pool mal usado (Reset), y criterio de cuándo NO optimizar: si el GC usa 3% de CPU, cualquier sync.Pool es complejidad gratis.

---

## 20. [CASO] Un servicio funciona en tests pero `-race` en CI reporta una data race en un map de caché. Analiza

**Categoría:** Concurrencia / Debugging · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
El race detector reporta acceso concurrente lectura/escritura a un map sin sincronización — típico caché casero `map[string]T` poblado desde handlers concurrentes. Los tests unitarios secuenciales no lo exponen; `-race` con tests paralelos sí. Diagnóstico: leer el reporte (dos stacks: quién lee, quién escribe, qué goroutinas), reproducir con un test concurrente dirigido, y arreglar con RWMutex, sync.Map o sharding según el patrón de acceso. Prevención: `-race` obligatorio en CI y tests con `t.Parallel` + carga concurrente para código compartido.

### 📖 Respuesta detallada
**Escenario:** un `Handler` usa un caché para no recalcular:

```go
type Handler struct {
    cache map[string]Result // sin lock
}

func (h *Handler) Serve(key string) Result {
    if r, ok := h.cache[key]; ok { return r }   // LECTURA
    r := expensiveCompute(key)
    h.cache[key] = r                            // ESCRITURA concurrente = race
    return r
}
```

**Paso 1 — leer el reporte del race detector.** El reporte da oro y hay que saber leerlo:

```
WARNING: DATA RACE
Write at 0x00c0001a2000 by goroutine 15:
  runtime.mapassign_faststr()
  myapp.(*Handler).Serve() handler.go:12
Previous read at 0x00c0001a2000 by goroutine 14:
  runtime.mapaccess2_faststr()
  myapp.(*Handler).Serve() handler.go:10
```

Dos stacks completos: la escritura (`mapassign`) y la lectura previa (`mapaccess2`), con archivo:línea. También indica dónde se **crearon** ambas goroutines. Con esto el bug está localizado sin adivinar.

**Paso 2 — entender por qué los tests no lo veían.** El race detector solo detecta races que **ocurren** durante la ejecución instrumentada: necesita que dos accesos conflictivos sucedan de verdad. Tests secuenciales (un request cada vez) jamás ejercitan la concurrencia. Por eso: (a) tests con concurrencia real para todo componente compartido, (b) `-race` también en tests de integración y en un porcentaje de carga en staging.

```go
func TestHandlerConcurrent(t *testing.T) {
    h := NewHandler()
    var wg sync.WaitGroup
    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func(i int) {
            defer wg.Done()
            h.Serve(fmt.Sprintf("key-%d", i%10)) // claves compartidas: fuerza conflicto
        }(i)
    }
    wg.Wait()
}
```

**Paso 3 — elegir el fix según el patrón de acceso:**

```go
// Opción A (default): RWMutex con double-check para no computar dos veces
type Handler struct {
    mu    sync.RWMutex
    cache map[string]Result
}
func (h *Handler) Serve(key string) Result {
    h.mu.RLock()
    r, ok := h.cache[key]
    h.mu.RUnlock()
    if ok { return r }
    r = expensiveCompute(key)      // fuera del lock: no serializar el cómputo
    h.mu.Lock()
    h.cache[key] = r               // puede pisar un cómputo paralelo: aceptable en caché
    h.mu.Unlock()
    return r
}
// Opción B: singleflight si expensiveCompute no debe duplicarse (thundering herd)
// golang.org/x/sync/singleflight agrupa llamadas concurrentes con la misma key
// Opción C: sync.Map si es write-once/read-many real
```

Mencionar `singleflight` aquí es diferencial: el double-check con RWMutex permite cómputos duplicados bajo contención; `singleflight.Group.Do(key, fn)` deduplica.

**Paso 4 — por qué no se puede ignorar "porque nunca ha crashеado":** una race sobre un map puede acabar en `fatal error: concurrent map writes` (crash no recuperable), pero también en corrupción silenciosa del map (buckets a medio migrar). El memory model de Go declara el comportamiento **indefinido**. "Funciona en producción" es supervivencia, no corrección.

**Prevención:** `go test -race ./...` en CI como gate (coste: ~5-10× CPU y ~5-10× memoria — se paga solo en CI/staging, no en producción), linters de copylocks, y diseño: encapsular todo estado compartido detrás de tipos con su lock, nunca maps desnudos compartidos.

---

## 21. [CASO] Necesitas procesar 10M de registros llamando a una API externa con límite de 100 concurrentes. Diseña la solución

**Categoría:** Concurrencia / Diseño · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Worker pool acotado: un productor que streamea los registros a un channel (no cargar 10M en memoria), N=100 workers consumiendo, `errgroup` con contexto para fail-fast o acumulación de errores según el requisito, rate limiting con `golang.org/x/time/rate` si el límite es de RPS además de concurrencia, reintentos con backoff para errores transitorios, y checkpointing para reanudar. La clave es distinguir límite de **concurrencia** (semáforo/workers) de límite de **tasa** (token bucket) — suelen hacer falta ambos.

### 📖 Respuesta detallada
```go
func ProcessAll(ctx context.Context, src RecordSource, api *Client) error {
    g, ctx := errgroup.WithContext(ctx)
    records := make(chan Record, 256) // buffer pequeño: desacopla sin ocultar backpressure

    // Productor: streaming desde la fuente (DB cursor, archivo), nunca los 10M en RAM
    g.Go(func() error {
        defer close(records)
        for src.Next() {
            select {
            case records <- src.Record():
            case <-ctx.Done():
                return ctx.Err()
            }
        }
        return src.Err()
    })

    // Rate limiter compartido: la API además limita a 500 req/s
    limiter := rate.NewLimiter(rate.Limit(500), 50)

    // 100 workers fijos (límite de concurrencia del enunciado)
    for i := 0; i < 100; i++ {
        g.Go(func() error {
            for rec := range records {
                if err := limiter.Wait(ctx); err != nil { return err } // respeta RPS y cancelación
                if err := callWithRetry(ctx, api, rec); err != nil {
                    return fmt.Errorf("record %s: %w", rec.ID, err) // fail-fast: cancela a todos
                }
            }
            return nil
        })
    }
    return g.Wait()
}

func callWithRetry(ctx context.Context, api *Client, rec Record) error {
    backoff := 100 * time.Millisecond
    for attempt := 0; attempt < 4; attempt++ {
        err := api.Send(ctx, rec)
        if err == nil || !isRetryable(err) { return err }
        select {
        case <-time.After(backoff + time.Duration(rand.Int63n(int64(backoff)))): // jitter
            backoff *= 2
        case <-ctx.Done():
            return ctx.Err()
        }
    }
    return fmt.Errorf("retries exhausted")
}
```

**Decisiones de diseño que hay que verbalizar:**

1. **Workers fijos vs goroutine-por-item + semáforo:** con 10M items, goroutine-por-item con `SetLimit(100)` también funciona (errgroup bloquea en `Go`), pero el pool fijo de 100 workers leyendo de un channel es más predecible en memoria y más simple de razonar. Ambas son válidas; saber comparar es lo que puntúa.
2. **Concurrencia ≠ tasa:** 100 concurrentes con latencia de 50ms = 2000 RPS potenciales. Si la API limita a 500 RPS, sin `rate.Limiter` la vas a tirar. El token bucket (`rate.NewLimiter`) con burst modela exactamente esto, y `Wait(ctx)` integra la cancelación.
3. **Política de errores — preguntar antes de diseñar:** ¿un fallo aborta todo (fail-fast, errgroup canónico) o se acumulan fallos y sigue (side-channel de errores + contador, abortando solo si supera un umbral)? Para migraciones masivas, lo segundo es lo normal:
```go
var failed atomic.Int64
// en el worker: en vez de return err → failed.Add(1); registrar en tabla de DLQ; continuar
```
4. **Idempotencia y reanudación:** un job de horas fallará alguna vez. Cada registro debe llevar idempotency key hacia la API, y el productor debe poder reanudar desde un checkpoint (offset/último ID procesado persistido cada N registros). Sin esto, cada reintento del job duplica efectos o reprocesa 10M.
5. **Observabilidad:** contador de procesados/fallidos, gauge de `len(records)` (¿productor o consumidores son el cuello?), histograma de latencia de la API. Un job silencioso de horas es ingestionable.

**Errores comunes:** cargar todo en un slice y repartir por índices (10M × struct en RAM), `go` por registro sin límite (100k goroutines contra la API = rate limit inmediato + memoria), retry sin jitter (sincronización de reintentos = thundering herd), y olvidar `close(records)` (workers bloqueados para siempre → el Wait nunca retorna).
