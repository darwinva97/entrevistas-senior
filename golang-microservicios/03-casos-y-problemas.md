# Casos y Problemas de Producción — Go y Microservicios

Todas las preguntas de este archivo son de tipo **[CASO] Análisis de problema**: escenario realista, diagnóstico paso a paso, herramientas, solución y prevención.

---

## 1. [CASO] Goroutine leak en producción: la memoria y el número de goroutines crecen sin parar

**Categoría:** Concurrencia / Debugging · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Síntoma: `go_goroutines` sube monótonamente (10k, 50k, 200k...) junto con la memoria, hasta OOM o degradación. Diagnóstico: perfil de goroutines de pprof (`/debug/pprof/goroutine?debug=1`) que agrupa por stack — el stack con conteo desbocado señala la línea exacta donde miles de goroutines están bloqueadas (send/receive de channel, `ctx` no consultado). Causas top: send a channel que nadie lee tras un timeout del caller, receive de un channel que nunca se cierra, y workers sin vía de salida. Fix: todo bloqueo cancelable con `select` + `ctx.Done()` o buffer 1. Prevención: métrica + alerta de goroutines, `goleak` en tests.

### 📖 Respuesta detallada
**Escenario:** un servicio API lleva 3 días desplegado; `go_goroutines` pasó de 200 a 180 000 y el heap de 150MB a 2GB. No hay errores en logs; la latencia empieza a degradar.

**Diagnóstico paso a paso:**

1. **Confirmar el leak:** gráfica de `go_goroutines` (Prometheus, del GoCollector). Crecimiento monótono correlacionado con tráfico = leak; un plateau alto pero estable puede ser dimensionamiento normal.
2. **Capturar el perfil:**
```bash
curl -s 'http://pod:6060/debug/pprof/goroutine?debug=1' > goroutines.txt
# o interactivo: go tool pprof http://pod:6060/debug/pprof/goroutine
```
   Con `debug=1`, las goroutines vienen **agrupadas por stack idéntico con contador**:
```
174532 @ 0x43a1b6 0x40795c ... 
#   0x6f1d2a  myapp/client.(*Enricher).Fetch.func1+0x8a  enricher.go:87
```
   174 532 goroutines con el mismo stack, todas en `enricher.go:87`. El caso está resuelto en el 90%: solo falta entender el porqué. Con `debug=2` ves además **cuánto tiempo** llevan bloqueadas (`chan send, 47 minutes`).
3. **Leer el código señalado:**
```go
func (e *Enricher) Fetch(ctx context.Context, id string) (Data, error) {
    ch := make(chan Data)            // unbuffered ← el bug
    go func() {
        d := e.slowUpstream(id)      // 2º bug: ignora ctx
        ch <- d                      // enricher.go:87 — bloqueada para siempre
    }()
    select {
    case d := <-ch:
        return d, nil
    case <-ctx.Done():               // el caller hace timeout a 500ms...
        return Data{}, ctx.Err()     // ...y NADIE leerá ch jamás
    }
}
```
   Cada timeout del caller huérfana una goroutine bloqueada en el send, reteniendo su stack, la conexión del upstream y todo lo capturado. Con 1% de timeouts a 2000 RPS: 20 goroutines/segundo filtradas.

**Solución (dos capas):**
```go
ch := make(chan Data, 1)             // buffer 1: el send nunca bloquea, la goroutine muere sola
go func() {
    d, err := e.slowUpstreamCtx(ctx, id) // y propagar ctx: aborta el trabajo, no solo el bloqueo
    ch <- result{d, err}
}()
```
El buffer 1 elimina el leak (si nadie lee, el valor queda en el buffer y el GC recoge todo); propagar el ctx elimina además el **trabajo huérfano** (la llamada upstream se cancela). Ambas cosas, no una.

**Otras variantes clásicas del mismo leak** que hay que nombrar: `range ch` sobre un channel que el productor nunca cierra en su path de error; workers escuchando un channel de jobs sin case de shutdown; `time.Tick` (sin Stop posible) en funciones de corta vida; bodies HTTP sin cerrar reteniendo la goroutine de lectura de la conexión.

**Prevención:** alerta sobre `go_goroutines` (umbral + derivada); `goleak.VerifyTestMain(m)` de Uber en las suites de tests (falla si un test deja goroutines vivas); revisión de código con la regla "toda goroutine que lanzo tiene una respuesta escrita a ¿cómo y cuándo termina?"; y perfiles de goroutine comparados entre despliegues en el continuous profiler.

---

## 2. [CASO] La memoria RSS crece y el pod es OOM-killed, pero el heap de pprof se ve pequeño

**Categoría:** Memoria / GC · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
El pod muere OOM con límite de 1GB pero `/debug/pprof/heap` muestra 300MB en uso. Hipótesis a barrer en orden: (1) el heap de Go real es mayor que el "in use" del perfil (basura aún no recolectada: con GOGC=100 el proceso puede necesitar ~2× el live set); (2) memoria fuera del heap de Go: stacks de miles de goroutines, CGo/librdkafka, mmap; (3) páginas liberadas por Go pero aún no devueltas al OS; (4) el kernel cuenta page cache/tmpfs del cgroup. Herramientas: `runtime/metrics`, gctrace, comparación heap-goal vs límite. Fix estándar: `GOMEMLIMIT` al ~90% del límite del contenedor + reducir tasa de allocación.

### 📖 Respuesta detallada
**Escenario:** servicio con `limits.memory: 1Gi`, OOM-killed cada pocas horas. pprof heap (`inuse_space`) muestra 300MB. "No puede ser Go", dice alguien. Sí puede.

**Paso 1 — entender qué mide cada cosa:**
- `inuse_space` de pprof: bytes **vivos** en el heap en el último GC. No incluye basura pendiente, stacks, ni runtime.
- RSS que ve el kernel: todo — heap (vivo + basura + fragmentación), stacks de goroutines, binario, estructuras del runtime, memoria CGo, buffers de mmap.
- Con `GOGC=100`, el pacer deja crecer el heap hasta ~2× el live set antes del siguiente ciclo: 300MB vivos ⇒ picos legítimos de ~600-700MB solo de heap. Súmale stacks (50k goroutines × 8KB medios = 400MB) y ya explicaste el OOM sin ningún leak.

**Paso 2 — medir de verdad:**
```bash
# Desglose del runtime (la herramienta central de este caso):
curl -s http://pod:6060/debug/pprof/heap?debug=1 | grep -A20 '^# runtime.MemStats'
# HeapAlloc, HeapSys, HeapIdle, HeapReleased, StackSys, Sys

# O runtime/metrics vía expvar/Prometheus:
# /memory/classes/heap/objects (vivo), /memory/classes/heap/free (liberable),
# /memory/classes/heap/released (devuelto al OS), /memory/classes/os-stacks + goroutine stacks
GODEBUG=gctrace=1  # cada ciclo: "gc 210 @... 4% cpu, 280->310->300 MB, goal 610 MB"
```
Chequeos concretos: `HeapSys - HeapReleased` ≈ lo que el heap le cuesta al OS; `StackSys` grande delata el ejército de goroutinas (cruzar con el caso 1); `Sys` total muy por debajo del RSS delata **memoria fuera de Go** → CGo (confluent-kafka-go, sqlite, RocksDB): valgrind/jemalloc profiling o revisar Frees pendientes de la librería C.

**Paso 3 — hipótesis y fixes según lo encontrado:**
1. **Heap goal > límite del contenedor (lo más común):** el GC no sabe que existe un límite. Fix canónico desde Go 1.19:
```
GOMEMLIMIT=900MiB   # techo blando: el GC se vuelve agresivo al acercarse
GOGC=100            # o subir si sobra CPU… ahora es seguro porque GOMEMLIMIT acota
```
   Antes de 1.19 el apaño era GOGC bajo (más CPU de GC siempre) o el ballast hack; hoy la respuesta es GOMEMLIMIT y saberlo es la marca de estar al día. Advertir el riesgo: si el live set real se acerca al límite, el GC entra en ciclos continuos (hasta ~50% CPU) — la solución de fondo es menos memoria viva o más límite, GOMEMLIMIT solo administra el margen.
2. **Picos de allocación transitorios** (cargar un CSV de 400MB para procesarlo): el heap crece al pico y el OS tarda en recuperar las páginas (Go las devuelve con MADV_FREE gradualmente; el RSS baja "cuando el kernel quiere"). Fix: streaming en lugar de materializar (caso 13), o aceptar el pico dimensionando el límite.
3. **Fragmentación real:** `HeapInuse - HeapAlloc` grande y sostenido — objetos de tamaños muy heterogéneos con vidas mezcladas. Mitigación: sync.Pool para los tamaños dominantes, buffers de tamaño uniforme.
4. **Leak de verdad en el heap:** si `inuse_space` también crece sin parar, es otro caso: comparar dos perfiles (`pprof -base heap1.pb.gz heap2.pb.gz`) y ver qué stack acumula — típicamente maps/caches sin expiración o slices retenidos por sub-slicing.

**Prevención:** GOMEMLIMIT como estándar en todos los manifests (90% del limit), dashboards con el desglose de `runtime/metrics` (no solo RSS), alerta sobre `derivada del heap > 0 sostenida`, y load tests que incluyan los picos de payload reales antes del deploy.

---

## 3. [CASO] Deadlock: el servicio se congela por completo bajo carga y no responde ni el health check

**Categoría:** Concurrencia / Debugging · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Congelación total o parcial sin CPU alta = sospecha de deadlock (locks cruzados o channels esperándose mutuamente). A diferencia del deadlock global (que el runtime detecta y aborta con "all goroutines are asleep"), el deadlock parcial en un servidor pasa desapercibido: siempre hay otras goroutines vivas. Herramienta reina: volcado de stacks (`/debug/pprof/goroutine?debug=2` o SIGQUIT) — buscar goroutines en `semacquire`/`chan send` con minutos de antigüedad y reconstruir el ciclo. Fixes: orden global de locks, no llamar código externo bajo lock, sends cancelables. Prevención: mutex profile, timeouts en adquisiciones críticas, tests de concurrencia.

### 📖 Respuesta detallada
**Escenario:** tras un pico de tráfico, el endpoint `/orders` deja de responder; el resto del servicio va lento; CPU casi a cero (la pista clave: sobrecarga = CPU alta; deadlock = CPU muerta). Reinician el pod y "se arregla"… hasta la próxima.

**Paso 1 — capturar el estado, no reiniciar a ciegas:**
```bash
curl -s 'http://pod:6060/debug/pprof/goroutine?debug=2' > stacks.txt
# sin pprof: kill -QUIT <pid> vuelca stacks a stderr antes de morir
```
`debug=2` da cada goroutine con su stack completo, estado y **antigüedad del bloqueo**: `goroutine 4123 [sync.Mutex.Lock, 32 minutes]`. Filtrar por bloqueos viejos:
```bash
grep -B1 'minutes' stacks.txt | sort | uniq -c | sort -rn
```

**Paso 2 — reconstruir el ciclo.** Ejemplo real de libro:
```
goroutine A: Cache.Set → mu.Lock (cache) [HELD] → notifier.Publish → nmu.Lock (notifier) [WAITING]
goroutine B: Notifier.Flush → nmu.Lock (notifier) [HELD] → cache.Get → mu.Lock (cache) [WAITING]
```
A tiene cache y quiere notifier; B tiene notifier y quiere cache: abrazo mortal. Las 8000 goroutines restantes esperando `mu.Lock (cache)` son víctimas, no causa — por eso el servicio entero degrada.

Variante con channels igual de común:
```go
// Worker pool cuyos workers publican resultados en un channel
// que lee la MISMA goroutine que también hace Submit:
for _, j := range jobs { pool.Submit(j) }   // se bloquea cuando la cola se llena…
for r := range results { ... }              // …porque los resultados no se drenan aún
// workers bloqueados enviando a results (lleno) → no consumen jobs → Submit bloqueado → ciclo
```
El runtime **no** puede detectarlo: hay goroutines runnables en el proceso (el detector "all goroutines are asleep" solo salta cuando TODAS duermen — nunca en un servidor con listeners).

**Paso 3 — fixes según la causa:**
1. **Locks cruzados:** imponer **orden global de adquisición** (siempre cache antes que notifier, documentado y revisado); o mejor, eliminar la necesidad: **no llamar código externo (callbacks, publish, I/O) sosteniendo un lock** — copiar lo necesario bajo lock, soltar, y luego llamar. Esta regla sola evita la mayoría de deadlocks reales.
2. **Ciclo de channels:** separar producción y consumo en goroutines distintas (drenar `results` concurrentemente con el Submit), o dimensionar colas con la relación productor/consumidor demostrada, no esperada.
3. **Parche defensivo mientras se arregla:** `TryLock` (Go 1.18) con métrica de fallos, o contexto con timeout alrededor de la sección para convertir el cuelgue en error visible — nunca como solución final.

**Prevención:**
- **Mutex/block profiles activados** (`runtime.SetMutexProfileFraction(5)`, `SetBlockProfileRate`): la contención creciente en esos locks se veía días antes del deadlock.
- Health check que detecte el cuelgue parcial: el liveness debe ejercitar el path real (tocar el lock del cache con timeout), no solo devolver 200 desde otro goroutine sana — si no, Kubernetes nunca reinicia el pod colgado.
- Tests de estrés con `-race` y `-timeout` cortos: un test que se cuelga bajo goroutines concurrentes es el deadlock reproducido en CI.
- Diseño: minimizar locks compartidos entre subsistemas; preferir ownership por goroutine + channels donde el grafo de locks empiece a cruzarse.

---

## 4. [CASO] El race detector señala una race en producción... que "nunca ha dado problemas". Convence al equipo y arréglala

**Categoría:** Concurrencia / Debugging · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Una canary con `-race` reporta write/read concurrente sobre un struct de config recargable. El equipo dice "lleva años así". Argumento técnico: una data race en Go es comportamiento indefinido — el compilador puede cachear lecturas en registros (el reader no ve jamás la escritura), y escrituras multi-palabra (interfaces, slices, strings, maps) pueden observarse **a medias** (torn reads → punteros corruptos → panics aleatorios imposibles de reproducir). Diagnóstico: leer el reporte (dos stacks + goroutines), correlacionar con los panics "raros" históricos. Fix según patrón: mutex, `atomic.Pointer` con copy-on-write, o rediseño de ownership.

### 📖 Respuesta detallada
**Escenario:** para cazar otro bug se despliega una réplica canary compilada con `-race`. A los minutos:
```
WARNING: DATA RACE
Read at 0x00c000234038 by goroutine 91:  myapp/config.(*Store).Current() store.go:31
Previous write at 0x00c000234038 by goroutine 12: myapp/config.(*Store).reload() store.go:58
```
El código: un `*Config` que un watcher reasigna cada minuto y todos los handlers leen sin sincronización. "Siempre ha funcionado."

**Paso 1 — desmontar el "siempre ha funcionado" con mecanismos concretos:**
1. **Visibilidad:** sin sincronización, no hay garantía de que el reader vea la escritura *nunca*. El compilador puede legalmente izar `s.cfg` fuera de un loop y leerlo una vez; el hardware puede servir la caché local. El código "funciona" hoy por accidente del código generado; la próxima versión del compilador o un refactor que habilite inlining puede cambiarlo.
2. **Torn reads:** `s.cfg = newCfg` sobre un campo interface o slice son 2 palabras (o 3); otra goroutine puede leer la palabra de tipo nueva y el puntero de datos viejo → llamada a método sobre memoria equivocada → panic esporádico con stack absurdo. Preguntar por el historial: "¿esos 3-4 panics `invalid memory address` al año que nadie reproduce y se cierran como 'cosmic ray'?" — suelen ser exactamente esto. Correlacionar el reporte de race con esos tickets es lo que convence a un equipo escéptico.
3. **El memory model de Go es explícito:** programas con races no tienen semántica definida. No es una opinión del linter; es la especificación.

**Paso 2 — dimensionar el fix según el patrón de acceso.** Aquí es read-mostly extremo (miles de reads/s, 1 write/min): la respuesta óptima es copy-on-write con puntero atómico:
```go
type Store struct{ cur atomic.Pointer[Config] }

func (s *Store) Current() *Config { return s.cur.Load() } // 1 instrucción, sin contención

func (s *Store) reload(newCfg *Config) {
    // newCfg es un objeto NUEVO y completo; nadie muta el publicado (inmutabilidad = la clave)
    s.cur.Store(newCfg)
}
```
Los handlers toman el snapshot una vez por request (`cfg := store.Current()`) — además arregla el bug lógico de ver dos configs distintas dentro de la misma request. Un `RWMutex` también sería correcto pero añade contención innecesaria para este patrón; para estados mutables compuestos, mutex; si el dato tiene un solo escritor natural y consumidores, channel/ownership. Elegir con criterio es lo evaluado.

**Paso 3 — barrer el resto del codebase:** una race encontrada implica hermanas. Acciones: correr la suite completa con `-race` (¿por qué no estaba ya en CI?), tests de concurrencia dirigidos a los singletons compartidos, y canary con `-race` permanente al 1% del tráfico si el overhead (5-10× CPU, 5-10× memoria) es asumible en una réplica — práctica real en varias empresas.

**Prevención institucional:** `-race` como gate de CI innegociable; prohibición en review de estado compartido mutable sin sincronización documentada; preferencia por diseño sin compartición (ownership, inmutabilidad, channels); y formación: el memory model de Go y "benign data race no existe" como parte del onboarding. Cierre para la entrevista: "una race sin síntomas es una race sin síntomas *todavía*, con coste de fix de 10 líneas hoy y de un incidente irreproducible mañana".

---

## 5. [CASO] p99 degradado con p50 normal: ¿GC o contención? Diagnostica y arregla

**Categoría:** Performance / Latencia · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
p50 estable (20ms) pero p99 disparado (800ms): algo pausa o encola *algunas* requests. Sospechosos ordenados: GC (ciclos frecuentes por tasa de allocación alta + mark assists castigando a quien aloca), contención de mutex (cola en un lock caliente), contención del scheduler (GOMAXPROCS mal en contenedor, CFS throttling), o un downstream con su propio p99. Herramientas por hipótesis: gctrace/runtime metrics para GC, mutex profile para locks, `go tool trace` para ver qué le pasa exactamente a una request lenta, métricas del downstream. Fix según culpable: reducir allocaciones / repartir el lock / ajustar CPU / aislar el downstream.

### 📖 Respuesta detallada
**Paso 1 — triage con métricas ya existentes (antes de perfilar):**
- **GC:** `go_gc_duration_seconds`, y mejor `runtime/metrics`: `/gc/cycles/total` (frecuencia), `/cpu/classes/gc/...` (% CPU en GC). Un ciclo por segundo = tasa de allocación brutal. ¿El p99 malo se correlaciona temporalmente con los ciclos? `GODEBUG=gctrace=1` en una réplica lo muestra en crudo.
- **CPU/throttling:** `container_cpu_cfs_throttled_periods_total`. Si el pod tiene limit de 2 CPUs y GOMAXPROCS=32 (nodo grande, Go < 1.25 sin automaxprocs), el runtime intenta usar 32 Ps, agota la cuota CFS en la primera parte de cada período de 100ms y **todo el proceso queda congelado el resto del período** → picos de exactamente decenas de ms en p99. Este caso es tan común que hay que descartarlo primero: es un fix de una línea.
- **Downstream:** el p99 propio puede ser simplemente el p99 del downstream + cola. Histogramas por dependencia.

**Paso 2 — profiling dirigido según la pista:**

*Hipótesis GC:* `go tool pprof -alloc_objects http://pod:6060/debug/pprof/heap` → quién aloca. Además, el mecanismo concreto que castiga el p99: los **mark assists** — cuando la allocación va más rápido de lo que el GC marca, las goroutines que alocan son reclutadas para marcar *dentro de su propia request*. Resultado: las requests con más allocación pagan decenas de ms extra, exactamente el patrón "p50 bien, p99 mal". `go tool trace` lo muestra sin ambigüedad (bloques MARK ASSIST dentro de la goroutine del handler).
Fix: atacar los top allocadores (sync.Pool para buffers, streaming JSON, `AppendX`, menos punteros vivos si el marcado es caro) y, si sobra memoria, subir GOGC/GOMEMLIMIT para espaciar ciclos. Verificar con el mismo perfil después.

*Hipótesis contención:*
```go
runtime.SetMutexProfileFraction(5) // activarlo (idealmente ya activo de serie)
```
`go tool pprof http://pod:6060/debug/pprof/mutex` → dónde se **espera** por locks. Caso típico: un `sync.Mutex` global en un caché/registry por el que pasan todas las requests; con carga, la cola en el lock crece de forma no lineal y solo la cola larga (p99) lo sufre. Fixes por orden de preferencia: achicar la sección crítica (sacar I/O y serialización fuera del lock), sharding del lock (N buckets por hash de key), `atomic.Pointer`+copy-on-write si es read-mostly, o eliminar la compartición.

*Hipótesis scheduler/trace fino:* `curl 'http://pod:6060/debug/pprof/trace?seconds=5' > t.out && go tool trace t.out`. El trace responde la pregunta exacta "¿en qué gastó el tiempo esta request lenta?": ¿runnable esperando P (CPU insuficiente/throttling)? ¿bloqueada en syscall? ¿mark assist? ¿esperando un lock? Es la herramienta más cara de leer pero la única que no obliga a adivinar.

**Paso 3 — anti-patrones de conclusión que hay que evitar (y decir en la entrevista):** subir GOGC a ciegas "porque el GC es lento" (si el problema era throttling, empeoraste memoria a cambio de nada); añadir réplicas (la contención por lock global no escala horizontalmente dentro del pod, y el GC tampoco si la causa es por-request); y cachear sin evidencia. Primero el culpable con perfil en mano, luego el fix, luego re-medir el p99 con el mismo dashboard — el ciclo completo evidencia→cambio→verificación es lo que puntúa.

**Prevención:** mutex profile y block profile activados de serie (coste mínimo con fraction moderada), continuous profiling comparando releases, presupuesto de allocaciones en endpoints calientes (benchmarks con `-benchmem` en CI que fallan por regresión), GOMAXPROCS/automaxprocs auditado en todos los manifests, y SLO sobre p99 con alerta temprana sobre su tendencia.

---

## 6. [CASO] El servidor HTTP agota file descriptors: "too many open files"

**Categoría:** HTTP / Recursos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Errores `accept: too many open files` y conexiones rechazadas. Los fds se van en: bodies de respuesta HTTP no cerrados/no drenados (la fuga nº1 en clientes Go), conexiones keep-alive excesivas por `MaxIdleConnsPerHost` mal puesto con transports recreados por request, ficheros abiertos con `defer` dentro de loops, y conexiones entrantes eternas sin timeouts. Diagnóstico: `ls /proc/<pid>/fd | wc -l`, `ss -tanp` para clasificar (¿sockets a quién?, ¿CLOSE_WAIT?), y de ahí al código. CLOSE_WAIT acumulado = el peer cerró y tu proceso no hizo Close: leak de tu lado, señalando qué conexiones.

### 📖 Respuesta detallada
**Escenario:** servicio proxy/agregador; tras horas de tráfico, logs con `http: Accept error: accept tcp [::]:8080: accept4: too many open files; retrying in 1s` y health checks fallando. `ulimit -n` es 65536 — no es "subir el límite y ya".

**Paso 1 — inventariar qué son los fds:**
```bash
ls /proc/$(pgrep app)/fd | wc -l          # 65530: confirmado
ls -l /proc/$(pgrep app)/fd | awk '{print $NF}' | sed 's/:.*//' | sort | uniq -c | sort -rn
# 64800 socket:  ← sockets, no ficheros
ss -tanp | grep "$(pgrep app)" | awk '{print $1, $5}' | sort | uniq -c | sort -rn
# 61000 CLOSE-WAIT hacia upstream-api:443   ← LA pista
```
Miles de **CLOSE_WAIT hacia un upstream**: el upstream cerró (fin del keep-alive) y nuestro proceso nunca hizo `Close()` del socket. En Go, eso apunta casi siempre a **response bodies sin cerrar**.

**Paso 2 — las cuatro causas típicas, en orden de frecuencia:**

1. **Body no cerrado / no drenado:**
```go
resp, err := client.Do(req)
if err != nil { return err }
if resp.StatusCode != 200 {
    return fmt.Errorf("status %d", resp.StatusCode) // ← FUGA: return sin Close
}
var v T
json.NewDecoder(resp.Body).Decode(&v) // y aunque decodifique: si no lee hasta EOF…
// …la conexión NO vuelve al pool y queda colgando
```
Contrato correcto, siempre:
```go
defer func() {
    io.Copy(io.Discard, io.LimitReader(resp.Body, 4<<10)) // drenar (acotado) para reusar la conexión
    resp.Body.Close()
}()
```
Cerrar sin drenar no fuga el fd pero mata el keep-alive (conexión se descarta) → tormenta de dials nuevos → puertos efímeros y TIME_WAIT — el problema hermano.

2. **Transport nuevo por request:**
```go
func call() { client := &http.Client{Transport: &http.Transport{...}}; ... } // ← cada Transport tiene SU pool
```
Cada Transport mantiene su propio pool de conexiones idle que nadie reutiliza ni cierra a tiempo. Regla: **un** `http.Client`/Transport compartido por proceso (es thread-safe), creado en el wiring.

3. **`defer f.Close()` en loop** (procesar miles de ficheros): los defers se acumulan hasta el return de la función — todos los ficheros abiertos a la vez. Fix: extraer el cuerpo del loop a una función con su propio defer.

4. **Conexiones entrantes eternas:** sin `ReadHeaderTimeout`/`IdleTimeout`, clientes lentos o rotos (o un LB mal configurado) retienen fds indefinidamente (slowloris accidental). Configurar los cuatro timeouts del server (ver archivo 02).

**Paso 3 — fix inmediato + estructural:** mitigación: reciclar pods y, si procede, subir temporalmente el límite (`LimitNOFILE`) para ganar margen de diagnóstico — subir el límite **sin** arreglar la fuga solo retrasa la muerte. Estructural: auditar todos los `client.Do` del codebase (un linter como `bodyclose` lo automatiza), unificar el http.Client, y ajustar el Transport (`MaxIdleConnsPerHost` acorde al fan-out real, `IdleConnTimeout`).

**Prevención:** `bodyclose` y revisión del contrato de body en el onboarding; métrica de fds (`process_open_fds` de Prometheus client — gratis) con alerta al 70% del límite; test de fuga en CI (llamar al cliente 10k veces y comprobar fds estables); y en el chaos/load testing, incluir upstreams que cierran conexiones y devuelven errores — las fugas viven en los paths de error.

---

## 7. [CASO] Contexto cancelado que no se propaga: el caller recibe timeout pero el trabajo sigue ejecutándose (trabajo huérfano)

**Categoría:** Context / Consistencia · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Síntoma doble: (a) bajo incidentes de latencia, la carga interna se multiplica — el usuario recibió 504 pero el servicio sigue ejecutando su pedido minutos después (trabajo huérfano que amplifica la sobrecarga); o (b) efectos "fantasma": el cliente vio error y reintentó, pero la operación original también terminó → duplicados. Causa raíz: algún punto de la cadena no propaga el ctx (`context.Background()` intermedio, goroutine lanzada sin ctx, librería que lo ignora, loop sin chequeo). Diagnóstico: trazas (spans que continúan tras el error del padre), perfil de goroutines durante un incidente. Fix: propagación disciplinada + idempotencia para el reintento, y `WithoutCancel` solo para lo deliberadamente post-respuesta.

### 📖 Respuesta detallada
**Escenario:** timeout del gateway a 2s. Bajo un pico, los usuarios ven 504… y la base de datos muestra que las operaciones se completaron a los 30-40s igualmente. Peor: algunos usuarios reintentaron y hay pedidos duplicados. La sobrecarga se retroalimenta: cada timeout deja trabajo zombi corriendo que roba recursos a las requests vivas (colapso metastable).

**Paso 1 — localizar dónde se rompe la cadena.** El ctx se propaga solo si *cada* eslabón lo pasa. Los puntos de ruptura clásicos, en orden de frecuencia:

```go
// 1. El Background() intermedio ("es que me cancelaban la query")
func (r *Repo) Save(ctx context.Context, o Order) error {
    return r.db.ExecContext(context.Background(), q, ...) // ← rompe TODO lo de abajo
}

// 2. Goroutine lanzada sin ctx
go s.enrichAndStore(order) // vive hasta terminar, pase lo que pase arriba

// 3. Librería/SDK que no acepta ctx (cliente legacy) — la cancelación muere ahí

// 4. Loop CPU-bound sin chequeo: nadie lo interrumpe entre I/Os
for _, item := range hugeList { compute(item) } // añadir: if ctx.Err() != nil { return }
```

Cómo encontrarlos sin leer 50k líneas: (a) **trazas**: buscar traces donde el span raíz termina en DEADLINE_EXCEEDED pero los hijos siguen abiertos/terminan OK mucho después — el primer span que "sobrevive" a su padre señala el archivo; (b) **perfil de goroutines** durante el incidente: stacks trabajando en requests cuyos deadlines ya pasaron; (c) grep dirigido: `context.Background()`/`context.TODO()` fuera de main y tests es sospechoso por defecto.

**Paso 2 — decidir qué DEBE cancelarse (no todo).** Aquí está el matiz senior: hay trabajo que debe morir con la request (queries, llamadas downstream, cómputo para la respuesta) y trabajo que debe **sobrevivirla** (auditoría, métricas, publicar el evento de algo ya commiteado). Cancelarlo todo a ciegas crea el bug inverso: transacción commiteada cuyo evento de outbox... — no, precisamente outbox lo resuelve; pero un `kafka.Publish(ctx)` post-commit cancelado a medias deja inconsistencia. Herramienta correcta para lo que sobrevive:

```go
// Hereda valores (trace, tenant) pero NO la cancelación — Go 1.21
bgCtx := context.WithoutCancel(ctx)
s.audit.Record(bgCtx, event) // y contabilizado en un WaitGroup para el graceful shutdown
```

**Paso 3 — cortar la amplificación de los reintentos.** El trabajo huérfano + retry del cliente = duplicados. La propagación de cancelación reduce la ventana pero **no la cierra** (la cancelación es cooperativa y llega tarde por definición): la respuesta completa exige **idempotencia** en las operaciones de escritura (idempotency key del cliente, upsert, tabla de operaciones procesadas). En la entrevista hay que decir explícitamente: "cancelación para eficiencia, idempotencia para corrección; la primera no sustituye a la segunda".

**Solución aplicada al escenario:** arreglar el `Background()` del repo (pasar el ctx real), envolver el SDK legacy con el patrón goroutine+channel buffer-1+select para poder abandonarlo (aceptando que su trabajo interno sigue: documentarlo), chequeos de `ctx.Err()` en los loops largos, y `WithoutCancel` explícito y auditado en los 3 sitios legítimos. Resultado verificable: bajo el mismo pico, el trabajo interno cae al cortarse las requests (gráfica de queries activas vs requests activas).

**Prevención:** lint (`contextcheck`, y prohibir `context.Background()` fuera de main/tests/wiring por convención revisada), pasar ctx como primer parámetro en TODA función que haga I/O o pueda tardar, tests que verifican cancelación (cancelar el ctx y asegurar que la función retorna en <X ms y no deja efectos), y la métrica "trabajo ejecutado con deadline ya vencido" (chequear `ctx.Err()` al empezar cada etapa cara y contarlo).

---

## 8. [CASO] Datos corruptos intermitentes: dos features pisan los mismos bytes por aliasing de slices

**Categoría:** Slices / Memoria · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Bug intermitente e irreproducible: respuestas de un endpoint contienen fragmentos de datos de *otra* entidad. Sin races reportadas por `-race` (a veces) y sin patrón claro. Hipótesis dirigida: dos slices comparten array subyacente (sub-slicing + append con capacidad sobrante, o reutilización de buffers) y una escritura posterior muta datos que otro código retiene. Diagnóstico: rastrear el linaje del slice (¿de dónde salió? ¿quién lo retiene? ¿quién appendea?), reproducir con un test que fuerce las capacidades. Fix: cortar el aliasing con copias explícitas o full slice expressions en las fronteras de ownership.

### 📖 Respuesta detallada
**Escenario:** un servicio parsea mensajes binarios/JSON de un stream y los distribuye a dos subsistemas: uno indexa (síncrono) y otro encola para auditoría (asíncrono). Auditoría reporta registros con campos de mensajes *posteriores* mezclados. Ocurre ~1 de cada 50k mensajes, más bajo carga.

**Paso 1 — hipótesis por el patrón del síntoma.** "Datos de otro mensaje" + intermitente + sensible a carga = alguien escribe sobre memoria que otro retiene. Dos familias: data race clásica (goroutines) o **aliasing de slices** (que puede corromper incluso en código secuencial y que `-race` no siempre ve: si la escritura y la lectura están sincronizadas por el channel de la cola, para el race detector *hay* happens-before — race no reportada, corrupción lógica igual).

**Paso 2 — rastrear el linaje del buffer:**
```go
func (r *Reader) next() ([]byte, error) {
    n, err := r.conn.Read(r.buf)      // r.buf: buffer REUTILIZADO por mensaje
    return r.buf[:n], nil             // ← devuelve una vista del buffer interno
}

func (s *Svc) handle(msg []byte) {
    rec := parse(msg)                  // rec.Payload = msg[12:44]  ← sub-slice: MISMO array
    s.indexer.Index(rec)               // síncrono: todavía intacto, por eso indexer "funciona"
    s.auditQ <- rec                    // asíncrono: se procesará DESPUÉS…
}                                      // …de que next() sobrescriba r.buf con el siguiente mensaje
```
La cadena completa: buffer reutilizado → parse que sub-slicea sin copiar → retención asíncrona. El indexer funciona (consume antes de la sobreescritura); auditoría ve el buffer ya pisado. La probabilidad depende del timing de la cola — de ahí la intermitencia y la sensibilidad a carga.

La variante hermana con append:
```go
base := makeHeader()                  // len 8, cap 64
a := append(base, bodyA...)           // escribe en el array de base (cap sobrante)
b := append(base, bodyB...)           // ¡pisa los mismos bytes! a y b comparten cola
```

**Paso 3 — reproducirlo en un test** (clave para el fix y la no-regresión): forzar las condiciones — buffer pequeño reutilizado, encolar, sobrescribir, comparar checksum del payload encolado vs procesado. Un test que falla de forma determinista convierte el fantasma en bug normal.

**Paso 4 — fix: definir ownership en las fronteras.**
```go
// Regla: lo que cruza una frontera asíncrona o se retiene, SE COPIA
rec.Payload = bytes.Clone(msg[12:44])       // Go 1.20; antes: append([]byte(nil), s...)
// Para el caso append: full slice expression corta la capacidad compartida
a := append(base[:8:8], bodyA...)           // cap==len ⇒ append siempre realoca
```
¿Dónde copiar? En la frontera de **ownership**, una sola vez: la API `next()` puede documentar "el slice es válido solo hasta la siguiente llamada" (patrón de `bufio.Scanner.Bytes()`, eficiente) y entonces el que retiene copia; o `next()` devuelve copia siempre (seguro, más allocs). Elegir y **documentar el contrato** es la solución real; copiar en todas partes "por si acaso" es rendirse.

**Prevención:** contratos de lifetime explícitos en godoc de toda API que devuelva `[]byte` sobre buffers internos; en review, alarma ante `s[a:b]` de un buffer compartido que escapa del scope; tests de propiedad con payloads checksumados en pipelines asíncronos; y conocer los precedentes del stdlib (`Scanner.Bytes` vs `Scanner.Text`, el `Body` que no puedes retener) como vocabulario común del equipo.

---

## 9. [CASO] Un panic en una goroutine tumba todo el proceso cada pocas horas

**Categoría:** Errores / Runtime · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
El servicio muere entero con `panic: runtime error: invalid memory address` cuyo stack apunta a una goroutine de background. En Go, un panic no recuperado en **cualquier** goroutine termina el proceso completo — `recover` solo funciona dentro de un defer de la misma goroutine, y el recovery middleware del server no cubre las goroutines que tú lanzas. Diagnóstico: leer el stack del crash (está completo en stderr), identificar la goroutine y el nil/índice culpable. Fix doble: arreglar el bug Y establecer política de recovery en todos los puntos de lanzamiento de goroutines (helper `safego`), decidiendo conscientemente qué componentes deben "morir rápido" en lugar de recuperarse.

### 📖 Respuesta detallada
**Escenario:** pods reinician con exit code 2. En los logs previos al reinicio:
```
panic: runtime error: invalid memory address or nil pointer dereference
goroutine 8231 [running]:
myapp/notifier.(*Batcher).flush(0xc0003c2000)  batcher.go:74
myapp/notifier.(*Batcher).loop(...)            batcher.go:52
created by myapp/notifier.NewBatcher           batcher.go:31
```

**Paso 1 — entender el modelo de fallo de Go (lo que evalúan primero):** el `net/http` server recovera panics *de sus handlers* (por conexión); el server gRPC de Go **ni eso** (sin recovery interceptor, un panic de handler mata el proceso). Pero ninguna red de seguridad cubre `go func()` lanzadas por tu código: el panic sube hasta el tope del stack de esa goroutine y el runtime termina el proceso. No existe un "recover global". Por eso el crash de un batcher de notificaciones tumba también el servidor de pedidos que convivía en el proceso.

**Paso 2 — leer el crash.** El volcado incluye el stack completo de la goroutine culpable y (con `GOTRACEBACK=all`) de todas. El `created by` dice quién la lanzó — oro para localizar. En Kubernetes: `kubectl logs --previous` recupera el stderr del contenedor muerto; si se pierde, configurar la captura (log shipper leyendo stderr, o `GOTRACEBACK` + volcado a un archivo/terminationMessagePath). El bug concreto suele ser mundano: mapa nil tras un refactor del constructor, índice fuera de rango con batch vacío, assertion `x.(T)` sin ok. Se arregla — pero el caso no va de eso.

**Paso 3 — política de recovery, con criterio y no con dogma:**
```go
// Helper estándar del proyecto para TODA goroutine de larga vida:
func SafeGo(logger *slog.Logger, name string, fn func()) {
    go func() {
        defer func() {
            if r := recover(); r != nil {
                logger.Error("goroutine panic", "name", name, "panic", r,
                    "stack", string(debug.Stack()))
                panicCounter.WithLabelValues(name).Inc() // métrica + alerta SIEMPRE
            }
        }()
        fn()
    }()
}
```
Y las decisiones que hay que verbalizar:
1. **Recuperar ≠ ignorar:** recover sin log+stack+métrica+alerta convierte crashes visibles en corrupción silenciosa — peor que el crash. Cada recovery es un bug que debe abrir ticket.
2. **¿Reiniciar el trabajo o dejarlo muerto?** Un `flush` que paniquea con el mismo dato reintentado = crash-loop dentro del proceso. El restart del worker necesita backoff y un límite (N panics → dejar caer el pod de verdad y que el orchestrator actúe: a veces **fail-fast es lo correcto** — proceso en estado desconocido tras un panic en código con estado compartido).
3. **El panic puede dejar estado inconsistente:** si la goroutine paniqueó a mitad de una sección con lock… el `defer mu.Unlock()` lo suelta, pero la invariante protegida puede haber quedado rota. Recuperar y seguir usando ese estado es ruleta. Componentes con estado crítico → preferir morir y rearrancar limpio.
4. **Dónde sí recovery sin duda:** workers de pool por job (un job venenoso no mata a los demás — caso típico: un mensaje de Kafka malformado), interceptor gRPC, tareas periódicas independientes.

**Paso 4 — encontrar los demás puntos débiles:** grep de `go func` / `go x.method` y auditar cuáles carecen de recovery y deberían tenerlo; prohibir el `go` desnudo fuera del helper en el linter (forbidigo) si el equipo lo acuerda.

**Prevención:** el helper SafeGo como convención; recovery interceptor gRPC desde el día uno; tests que inyectan panics (el mensaje malformado de Kafka en la suite); alerta sobre la métrica de panics recuperados (>0 = investigar); y en el postmortem, la pregunta doble: por qué paniqueó Y por qué un componente auxiliar pudo tumbar el crítico (¿deberían ser procesos separados?).

---

## 10. [CASO] Consumer de Kafka con lag creciente: los mensajes se acumulan más rápido de lo que se procesan

**Categoría:** Kafka / Throughput · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
El lag del consumer group crece sin parar. Diagnóstico ordenado: ¿es pico de producción o caída de consumo? (métricas de ambos lados); ¿todas las particiones o unas pocas? (lag por partición: sesgo de key = partición caliente); ¿dónde se va el tiempo de cada mensaje? (casi siempre en I/O por-mensaje hacia DB/HTTP, no en Kafka). Palancas por orden: procesar en batch (el fix #1), paralelizar dentro del consumer preservando orden por key, escalar consumers hasta el nº de particiones, y arreglar el rebalancing si hay churn. Con el incendio activo: decidir si el backlog viejo se procesa, se salta o se degrada.

### 📖 Respuesta detallada
**Paso 1 — caracterizar antes de tocar nada:**
- **¿Producción subió o consumo bajó?** Comparar tasa de entrada al topic vs tasa de commit del grupo. Un deploy reciente del consumer que duplicó la latencia por mensaje es tan común como un pico de tráfico.
- **Lag por partición:** si 2 de 24 particiones acumulan todo → **partición caliente** por sesgo de key (un tenant enorme, o key nula enviando todo a round-robin… o al contrario, todos con la misma key). Ninguna cantidad de consumers extra arregla esto: una partición = un consumer como máximo. Fix: repensar la key (sub-particionar el tenant: `tenant:bucket`), y a corto plazo procesar esa partición con paralelismo interno por sub-key.
- **¿Rebalanceos en bucle?** Logs del grupo: si el procesamiento de un batch excede `max.poll.interval.ms` (o el equivalente de sesión), el broker expulsa al consumer, rebalancea, otro retoma, también tarda, rebalancea... — el grupo pasa más tiempo rebalanceando que consumiendo, y el lag crece con los consumers "sanos". Señal: lag alto + CPU baja + métricas de rebalance altas. Fix: batches más pequeños, subir el intervalo, y cooperative rebalancing.

**Paso 2 — perfilar el coste por mensaje.** pprof CPU del consumer durante el lag. El hallazgo típico no es Kafka sino el handler:
```go
// ANTES: 1 mensaje = 1 INSERT + 1 llamada HTTP = 25ms/mensaje = 40 msg/s por consumer
for _, rec := range fetches.Records() {
    db.ExecContext(ctx, "INSERT ...", rec)     // round-trip por mensaje
    enricher.Call(ctx, rec)                    // otro round-trip
}
```
Con 24 particiones y 24 consumers: ~960 msg/s de techo. Si entran 5000/s, el lag crece 4000/s. Las palancas, por impacto:

1. **Batching (la palanca grande):** acumular N mensajes o T ms y hacer un `INSERT ... unnest/COPY` de 500 filas + llamadas agrupadas. 25ms/msg → 0.5ms/msg amortizado. El commit de offsets pasa a ser por batch (ya lo era: at-least-once, idempotencia obligatoria — decirlo).
2. **Paralelismo interno preservando orden por clave:** el orden solo importa **por key**, no global. Worker pool interno con routing `hash(key) % N` → N workers, cada key siempre al mismo worker: paralelismo × N sin romper el orden que importa. Es el diseño de librerías como el partition-worker de franz-go y lo que un senior debe saber dibujar.
3. **Escalar consumers:** solo ayuda hasta `nº de particiones`. Si ya estás ahí, ampliar particiones del topic (decisión con consecuencias: re-mapea keys → transición donde el orden entre viejo y nuevo no está garantizada; planificarlo, no improvisarlo).

**Paso 3 — gestionar el backlog del incidente:** con horas de lag acumulado, procesarlo todo puede tardar más que su utilidad. Opciones de negocio a plantear: consumir y descartar lo más viejo que X (si son datos con TTL, p.ej. notificaciones), saltar a offsets recientes y reprocesar lo viejo aparte a baja prioridad, o simplemente escalar temporalmente y drenar. Elegirlo es decisión de producto — plantearlo en la entrevista suma.

**Prevención:** alerta sobre lag **y sobre su derivada** (lag estable alto ≠ lag creciendo); dashboard de lag por partición (el sesgo se ve venir); load test del consumer al 3-5× del throughput esperado; presupuesto de latencia por mensaje vigilado en métricas; DLQ para mensajes venenosos (un mensaje que hace panic/retry infinito para toda la partición: sin DLQ, un solo mensaje malo genera lag infinito — conectar con el caso 9).

---

## 11. [CASO] Timeouts en cascada entre servicios gRPC: un incidente pequeño se convierte en outage general

**Categoría:** gRPC / Resiliencia · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Una degradación puntual de la DB del servicio D (hoja del grafo) escala a outage de toda la plataforma: C, B y A se llenan de goroutines esperando, los retries multiplican el tráfico y todo el mundo agota deadlines. Anatomía: timeouts no jerarquizados (todos 5s), retries en cada nivel (amplificación exponencial), sin circuit breakers ni load shedding, pools compartidos saturados por el path lento (head-of-line blocking). Diagnóstico en caliente: trazas para ver dónde muere el budget, métricas de deadline_exceeded por servicio y de tráfico amplificado. Solución en capas: budgets decrecientes propagados por ctx/gRPC, retries solo en un nivel con throttling, breakers por downstream, y aislamiento de pools (bulkheads).

### 📖 Respuesta detallada
**Reconstrucción del incidente (lo que hay que saber narrar):**
1. La DB de D pasa de 10ms a 3s por un plan de query degradado. D no protege nada: sus handlers esperan la DB con el deadline entero.
2. C llama a D con timeout 5s y **2 retries**: cada request de C ahora ocupa hasta 15s de goroutines/conexiones en C, y triplica el tráfico hacia D — que estaba mal y ahora recibe 3×.
3. B hace lo mismo hacia C (retries): amplificación 3×3 = 9× sobre D. Los pools de conexiones y workers de B se llenan de esperas hacia C; las requests de B que NO dependen de D también mueren esperando pool libre (**head-of-line blocking** en recursos compartidos).
4. A (edge) agota su timeout global; los usuarios reintentan (amplificación humana). Todos los servicios muestran deadline_exceeded; el "culpable" original queda enterrado bajo el ruido. Estado clásico de **fallo metastable**: incluso cuando la DB de D se recupera, la tormenta de retries encolados mantiene el sistema caído.

**Diagnóstico en caliente:**
- **Trazas primero:** una traza del edge muestra el árbol de spans y dónde se consume el tiempo — el span de D contra su DB con 3s lo delata aunque todos los niveles den timeout. Sin tracing distribuido este incidente son horas de confusión; con él, minutos. (Argumento para el caso de observabilidad.)
- Métricas: `deadline_exceeded` por edge de llamada (quién→quién), RPS hacia D (¿multiplicado? = retries), profundidad de colas/pools por servicio.
- En cada servicio Go: goroutines por stack (`/debug/pprof/goroutine?debug=1`) — miles esperando en el mismo `grpc.Invoke` hacia D confirma el embudo.

**Solución por capas (el corazón de la respuesta):**
1. **Jerarquía de deadlines:** el edge define el budget total (1s); cada nivel deriva `WithTimeout` menor que el restante, y gRPC propaga el **restante** real en `grpc-timeout`. Además, cada servidor debe chequear el budget al entrar (si quedan <50ms, rechazar ya con `DeadlineExceeded` en vez de trabajar para nadie) y las requests cuyo caller ya canceló deben abortarse (el ctx del handler gRPC se cancela solo — respetarlo).
2. **Política de retries global, no local:** retries en **un** nivel (idealmente el más cercano al fallo o el edge, elegido y documentado), con backoff+jitter, solo códigos retryables y con **retry throttling** (como el token-bucket de gRPC: si la tasa de fallos supera umbral, los retries se suprimen — es exactamente el freno anti-tormenta).
3. **Circuit breakers por downstream:** C detecta la tasa de fallos hacia D y abre — falla en µs, D recibe tregua, y C ejecuta su fallback (respuesta parcial/stale). Los usuarios de B que no dependen de D vuelven a respirar.
4. **Bulkheads:** pools de conexiones/semáforos **separados por downstream** (o por criticidad): el path hacia D saturado no puede consumir los recursos del path hacia E. En Go: semáforo por cliente, `MaxIdleConnsPerHost` por transport, workers dedicados.
5. **Load shedding en D:** al detectar cola > umbral o budget agotado, rechazar temprano (`ResourceExhausted`) en vez de aceptar trabajo que morirá — rechazar barato salva el sistema; aceptar y fallar caro lo mata.

**Prevención:** mapa de budgets documentado por ruta crítica; game days inyectando latencia (chaos engineering: latency injection en la DB de D en staging reproduce exactamente esto); revisión de "retry policy" como propiedad global del sistema en el design review de cada servicio nuevo; y alertas sobre amplificación (tráfico downstream / tráfico edge como ratio vigilado).

---

## 12. [CASO] Connection pool de `database/sql` agotado: requests esperando conexión y timeouts en la capa de datos

**Categoría:** Base de datos / Recursos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Latencia disparada con la DB sana: el tiempo se va **esperando conexión del pool** (`DBStats.WaitDuration` creciendo). Causas típicas: fugas de conexiones por `rows.Close()` olvidado o transacciones sin commit/rollback en paths de error; `MaxOpenConns` sin configurar (ilimitado: tormenta sobre la DB) o demasiado bajo; queries lentas que retienen conexiones; y concurrencia entrante muy superior al pool. Diagnóstico: `db.Stats()` expuesto como métricas (InUse, Idle, WaitCount, WaitDuration), `pg_stat_activity` para ver qué hacen las conexiones (¿`idle in transaction`? = fuga de tx). Fix: cerrar siempre rows/tx con defer, dimensionar el pool contra la capacidad real de la DB, y acotar la concurrencia aguas arriba.

### 📖 Respuesta detallada
**Escenario:** p99 del servicio a 5s; la DB muestra CPU baja y queries de 5ms. La latencia no está EN la base de datos: está esperando ENTRAR.

**Paso 1 — instrumentar el pool (debería estar hecho de antes):**
```go
// db.Stats() exportado a Prometheus (sql collector de prometheus/client o a mano):
// OpenConnections, InUse, Idle, WaitCount, WaitDuration, MaxIdleClosed, MaxLifetimeClosed
```
Lectura del incidente: `InUse` clavado en `MaxOpenConns` (25), `WaitCount` disparado, `WaitDuration` acumulando segundos. Todas las conexiones ocupadas permanentemente → o hay fuga, o retención larga, o falta pool.

**Paso 2 — mirar la DB: ¿qué hacen esas 25 conexiones?**
```sql
SELECT state, wait_event_type, query, state_change FROM pg_stat_activity WHERE application_name='orders';
```
- Muchas **`idle in transaction`** antiguas → transacciones abiertas sin commit/rollback: fuga de tx. El clásico:
```go
tx, _ := db.BeginTx(ctx, nil)
if err := step1(tx); err != nil { return err } // ← return sin Rollback: conexión secuestrada
// Correcto: defer tx.Rollback() inmediatamente tras BeginTx (no-op si ya hubo Commit)
```
- Muchas `active` con la misma query lenta → retención por query (índice caído, plan malo): caso distinto, va de EXPLAIN.
- Estado `idle` en la DB pero pool lleno en Go → fuga de `rows`:
```go
rows, err := db.QueryContext(ctx, q)
for rows.Next() { ... }        // si rompes el loop con break/return a medias…
// …sin rows.Close(), la conexión NO vuelve al pool
// Correcto: defer rows.Close() SIEMPRE, y comprobar rows.Err() tras el loop
```
Los linters (`sqlclosecheck`, `rowserrcheck`) cazan ambos.

**Paso 3 — dimensionar (si no había fuga, o después de arreglarla):**
```go
db.SetMaxOpenConns(25)                  // techo: proteger la DB (¡default = ILIMITADO!)
db.SetMaxIdleConns(25)                  // ≈ MaxOpen en servicios calientes (evitar churn abrir/cerrar)
db.SetConnMaxLifetime(30 * time.Minute) // rotación: failover de DB, DNS, credenciales
db.SetConnMaxIdleTime(5 * time.Minute)
```
Criterios de dimensionado que evalúan: el techo lo pone la **DB**, no el servicio — Postgres con `max_connections=200` y 8 réplicas del servicio ⇒ ≤25 por réplica y contar también migradores/workers/otros servicios (o usar pgbouncer y cambiar las reglas del juego). MaxOpenConns ilimitado no acelera nada: solo mueve la cola del pool (con backpressure controlable) al servidor de DB (donde degrada a todos). Y Little's Law como sanity check: conexiones necesarias ≈ QPS × duración media de uso — 2000 QPS × 5ms = 10 conexiones; si "necesitas" 200, el problema es retención, no pool.

**Paso 4 — acotar aguas arriba:** si entran 500 requests concurrentes y hay 25 conexiones, 475 esperan dentro del driver **sin límite de cola ni orden justo**. Mejor: semáforo/worker pool antes de la capa de datos con timeout de adquisición corto y rechazo temprano (503/`ResourceExhausted`) — convertir la espera invisible en backpressure visible; y `ctx` con deadline en TODAS las queries para que una espera de pool no consuma el budget entero de la request.

**Prevención:** métricas de `db.Stats()` con alertas (`WaitDuration` como leading indicator); linters de rows/tx en CI; helper `WithTx(ctx, fn)` que encapsula Begin/defer Rollback/Commit para que el patrón correcto sea el único posible; load test que sature el pool y verifique degradación limpia (errores rápidos, no cuelgues); y revisión periódica del dimensionado cuando cambien réplicas o el `max_connections`.

---

## 13. [CASO] Procesar un archivo de 20GB tumba el servicio por memoria: diseño de streaming

**Categoría:** I/O / Memoria · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Un endpoint/job que procesa exports (CSV/JSON/NDJSON) muere OOM al llegar archivos grandes: el código materializa todo (`io.ReadAll`, `json.Unmarshal` del archivo entero, slice con todas las filas). La solución es streaming de punta a punta: leer con `bufio`/`json.Decoder` token a token o línea a línea, procesar por chunks con memoria constante, escribir la salida incremental, y componer un pipeline (leer → transformar N workers → escribir en batch) con backpressure natural de channels. Claves: ninguna etapa materializa el total, límites explícitos (tamaño de línea, buffer), checkpointing para reanudar, y verificación con pprof de que la memoria es plana respecto al tamaño del archivo.

### 📖 Respuesta detallada
**El código que muere y por qué:**
```go
data, _ := io.ReadAll(r)              // 20GB en heap (pico real ~2× por el growth del buffer)
var records []Record
json.Unmarshal(data, &records)        // + la representación decodificada: OOM garantizado
for _, rec := range records { ... }
```
Tres materializaciones del total: bytes crudos, árbol decodificado, slice de resultados. La memoria escala O(tamaño del archivo) — funciona en dev con 50MB, muere con el primer cliente enterprise.

**Diseño streaming:**
```go
func ProcessNDJSON(ctx context.Context, r io.Reader, sink BatchSink) error {
    g, ctx := errgroup.WithContext(ctx)
    lines := make(chan []byte, 256)     // backpressure: si el sink va lento, la lectura se frena sola
    out   := make(chan Record, 256)

    g.Go(func() error {                  // Etapa 1: lectura línea a línea, memoria constante
        defer close(lines)
        sc := bufio.NewScanner(r)
        sc.Buffer(make([]byte, 0, 64*1024), 10*1024*1024) // límite explícito de línea (default 64KB: falla con líneas largas)
        for sc.Scan() {
            line := bytes.Clone(sc.Bytes()) // Scanner reutiliza el buffer: COPIAR (ver caso de aliasing)
            select {
            case lines <- line:
            case <-ctx.Done(): return ctx.Err()
            }
        }
        return sc.Err()
    })

    for i := 0; i < 8; i++ {             // Etapa 2: fan-out de parseo/transformación (CPU-bound)
        g.Go(func() error {
            for line := range lines {
                var rec Record
                if err := json.Unmarshal(line, &rec); err != nil {
                    badLines.Inc(); continue // política de errores por línea: descartar+contar o abortar — decidir
                }
                select {
                case out <- transform(rec):
                case <-ctx.Done(): return ctx.Err()
                }
            }
            return nil
        })
    }
    go func() { /* cerrar out cuando los 8 workers acaben */ }() // WaitGroup + close(out)

    g.Go(func() error {                  // Etapa 3: escritura en batches
        batch := make([]Record, 0, 500)
        flush := func() error { if len(batch) == 0 { return nil }; err := sink.Write(ctx, batch); batch = batch[:0]; return err }
        for rec := range out {
            batch = append(batch, rec)
            if len(batch) == 500 { if err := flush(); err != nil { return err } }
        }
        return flush()
    })
    return g.Wait()
}
```

**Los puntos que el entrevistador busca:**
1. **Memoria constante demostrable:** ~256 líneas + 256 records + batch de 500 en vuelo, independiente de que el archivo tenga 20GB o 2TB. Verificación: correr con archivo sintético grande y mirar el heap profile — plano.
2. **Backpressure gratis:** channels acotados — si la DB de salida se atasca, `out` se llena, los workers se bloquean, `lines` se llena, el Scanner se detiene, y (si la fuente es una descarga HTTP/S3) el TCP flow control frena incluso la red. Nada explota; todo se ralentiza coordinadamente.
3. **Los detalles que rompen streaming en producción:** el buffer del Scanner (default 64KB por línea → `bufio.Scanner: token too long` con la primera línea gorda); la copia del `sc.Bytes()` (aliasing); JSON gigante no-NDJSON → `json.Decoder` con `dec.Token()`/`dec.More()` para streamear dentro de un array JSON; compresión (`gzip.NewReader` encadenado — streaming se compone); y no loguear por línea (20GB = millones de logs).
4. **Fallos a mitad:** un job de horas fallará. Checkpointing (offset de bytes/número de línea persistido por batch confirmado) + reanudación, y sink idempotente (upsert) porque el último batch puede repetirse. Si la fuente es S3, rangos (`Range: bytes=N-`) permiten reanudar la descarga.
5. **Límites y validación:** tamaño máximo aceptado (aunque sea alto), `http.MaxBytesReader` si entra por HTTP, y cuota de líneas erróneas (>X% = abortar: el archivo probablemente está corrupto, no "tiene algunas líneas malas").

**Prevención:** tests con archivos sintéticos de tamaño realista en CI (generados, no commiteados), presupuesto de memoria del job en el manifest coherente con el diseño (si es streaming de verdad, 256MB bastan — ponerlo bajo *detecta* regresiones de materialización), y la regla de review: "¿esta función escala O(1) o O(n) en memoria respecto a la entrada?" para todo lo que toque archivos o resultsets.

---

## 14. [CASO] Migración de un servicio Java/Node a Go: qué evaluar, cómo ejecutarla y qué trampas esperan

**Categoría:** Arquitectura / Migración · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Primero el "si": la migración se justifica con números (coste de infra por RPS, p99, cold start, memoria) y razones organizativas, no por moda. Evaluación previa: inventario de contratos (APIs, eventos, side effects), dependencias con equivalente en Go (¿hay cliente maduro para X?), y features del origen sin análogo directo (reflection mágica de Spring, decoradores, ORMs ricos). Ejecución: strangler con shadow traffic y comparación de respuestas, cutover gradual por porcentaje con rollback instantáneo. Trampas Go para equipos Java/Node: modelo de errores, nil vs null, JSON con zero values, concurrencia explícita, y "reescribir traduciendo" en lugar de rediseñar idiomático.

### 📖 Respuesta detallada
**Fase 0 — el caso de negocio (lo que un senior pregunta antes de escribir código):** ¿qué problema resuelve Go aquí? Respuestas válidas y medibles: memoria (JVM: cientos de MB baseline por pod vs decenas en Go → densidad de pods), p99 sin pausas de GC largas ni warm-up de JIT, cold start (serverless/autoscaling: ms vs segundos), binario estático (imagen `FROM scratch` de 15MB, superficie de ataque mínima), y a veces homogeneidad del stack del equipo. Respuestas inválidas: "Go es más rápido" sin haber perfilado el servicio actual (si el 95% del tiempo es la DB, Go no lo arregla). Entregable: benchmark del servicio actual + objetivo cuantificado (p.ej. −60% memoria, p99 <100ms) que luego valide o invalide la migración.

**Fase 1 — inventario de riesgo:**
1. **Contratos externos:** OpenAPI/proto de las APIs, esquemas de eventos, formatos de fecha/número en JSON, códigos de error, headers. Todo lo implícito que los clientes actuales asumen ("el campo viene aunque sea null", "los errores tienen este shape") debe hacerse explícito, porque es lo que el servicio Go debe clavar byte a byte.
2. **Dependencias:** ¿hay librería Go madura para cada pieza (driver de esa DB exótica, SDK de ese proveedor, XML/SOAP legacy)? Un hueco aquí puede matar la migración o forzar un sidecar.
3. **Lógica implícita del framework:** lo que Spring/Nest hacían por magia (validación por anotaciones, transacciones declarativas `@Transactional`, serialización con convenciones, AOP) en Go será **código explícito**. Subestimarlo es el error de estimación clásico: el "controller de 40 líneas" tenía 400 líneas de comportamiento en anotaciones.
4. **Estado y jobs:** ¿schedulers embebidos, caches en memoria, sesiones sticky? Cada uno necesita decisión propia.

**Fase 2 — ejecución con red de seguridad (strangler + shadow):**
1. Go implementa el servicio detrás del mismo contrato; tests de contrato (los mismos casos disparados contra ambos) como primer gate.
2. **Shadow traffic:** el gateway duplica requests reales al servicio Go (fire-and-forget, sin side effects: cuidado con las escrituras — solo shadow de lecturas, o entorno con DB espejo) y un comparador diffea respuestas normalizadas. Semanas de diffs → catálogo de discrepancias: la mayoría serán detalles de serialización (orden de campos da igual; `null` vs campo ausente NO da igual).
3. **Cutover por porcentaje** (1% → 10% → 50% → 100%) con métricas comparadas lado a lado y rollback de un click (el servicio viejo sigue desplegado hasta días después del 100%).
4. Migrar consumers de eventos con doble consumo idempotente o handover de consumer group planificado.

**Trampas Go específicas para equipos que vienen de Java/Node (la parte jugosa):**
- **JSON y zero values:** `encoding/json` no distingue "campo ausente" de "campo con zero value" sin punteros (`*int`, `*string`) u `omitempty` bien pensado — los contratos con `null` semántico (PATCH parcial) son la fuente nº1 de diffs en el shadow. Y slices nil serializan como `null`, no `[]`.
- **Errores como valores:** el equipo intentará recrear excepciones (panics para flujo de control, "error handlers" globales). Formación temprana en `errors.Is/As`, wrapping, y panic solo para bugs.
- **Concurrencia explícita:** en Node el single-thread ocultaba las races; en Java el framework gestionaba los threads. En Go, cada `go` es responsabilidad del equipo: establecer desde el día uno las convenciones (ctx en todo, SafeGo, -race en CI) o la migración estrenará la clase de bugs que este archivo describe.
- **No traducir, rediseñar:** el puerto 1:1 de una jerarquía de clases Java (interfaces gigantes, factories, inyección por todos lados) produce el peor Go posible. Presupuestar el rediseño idiomático (interfaces pequeñas, composición, DI manual) — más caro al escribir, mucho más barato para siempre.
- **Lo que se pierde y hay que reponer:** hot reload de Spring DevTools, ecosistema de anotaciones, ORM rico (en Go: sqlc/sqlx/pgx y SQL explícito — venderlo como feature, pero es un cambio de hábitos real).

**Criterio de éxito:** los objetivos de la Fase 0 medidos en producción al 100% + ausencia de regresión funcional (diffs a ~0 antes del cutover) + el equipo capaz de operar el servicio (runbooks, dashboards, formación) — una migración que solo el migrador entiende es un fracaso con buen p99.

---

## 15. [CASO] El servicio consume 100% CPU con tráfico normal: busy loop, serialización o algo peor

**Categoría:** Performance / CPU · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
CPU al 100% sin aumento de tráfico. El perfil de CPU de pprof (30s) responde en minutos: los culpables típicos son un busy loop (`for-select` con `default`, espera activa, retry sin backoff girando contra un error permanente), serialización/reflection dominando el flamegraph (JSON/fmt en hot path), GC desbocado por tasa de allocación (se ve como `runtime.gcBgMarkWorker`/`mallocgc` arriba del perfil), o regexps/algoritmos O(n²) con inputs nuevos. Método: flamegraph → función dominante → arreglar esa, no adivinar. Verificación: mismo perfil después del fix.

### 📖 Respuesta detallada
**Paso 1 — capturar el perfil (siempre antes de especular):**
```bash
go tool pprof -http=:8081 'http://pod:6060/debug/pprof/profile?seconds=30'
# flamegraph en el navegador; top10 en la vista de texto
```
El perfil de CPU muestrea ~100 veces/s dónde está ejecutando cada P. Con 30s hay señal de sobra. Cuatro firmas típicas y su lectura:

**Firma A — un frame propio domina (>60%):** p.ej. `matchRoute` o un parser. Mirar el código: o es un busy loop, o un algoritmo que degeneró con datos nuevos (regex con backtracking catastrófico sobre un input adversarial — aunque el motor RE2 de Go evita el backtracking exponencial, un regex mal escrito sobre inputs enormes sigue doliendo; o un O(n²) que con n=50 era invisible y con n=50 000 come el core). Fix puntual + test con el input real que lo disparó.

Busy loops típicos que hay que reconocer a simple vista:
```go
// 1. for-select con default (quema un core entero)
for {
    select {
    case msg := <-ch: handle(msg)
    default: // sin bloqueo ni sleep: girar a máxima velocidad
    }
}
// 2. Retry sin backoff contra error permanente
for { if err := connect(); err != nil { continue }; break } // DNS roto = 100% CPU para siempre
// 3. Espera activa de una condición
for !ready.Load() {} // sin runtime.Gosched ni channel: un core clavado
```
El perfil delata los tres: la función del loop concentra todo el tiempo. Fix: quitar el `default` (que el select bloquee), backoff exponencial con techo y jitter, y sustituir espera activa por channel/`sync.Cond`.

**Firma B — `encoding/json`, `fmt`, `reflect` arriba:** serialización dominando. Con payloads grandes y RPS alto, `json.Marshal` (reflection) + `fmt.Sprintf` en logging por request pueden ser el 40-60% de la CPU. Palancas: no serializar lo que no cambia (cachear bytes serializados de respuestas repetidas), logging con `slog` y niveles bien puestos (el `Debugf` que formatea aunque el nivel esté apagado), generadores de serialización si el perfil lo justifica, y revisar si se está serializando dos veces (struct→map→json es un clásico).

**Firma C — `runtime.mallocgc`, `runtime.gcBgMarkWorker`, `scanobject` dominan:** la CPU se va en alocar y recolectar — el problema no es "el GC" sino la tasa de allocación del código. Puente al caso 5/pregunta de GC: `pprof -alloc_objects` para los top allocadores, sync.Pool/streaming/menos punteros. Un heap gigante de objetos pequeños con punteros también encarece cada marcado.

**Firma D — el tiempo está en `runtime.futex`, `lock`, o repartido sin dominante claro:** contención (ir al mutex profile, caso 5) o muerte por mil cortes (mirar el flamegraph acumulando por paquete). Si `GOMAXPROCS` > CPUs reales del cgroup, parte del "100%" es throttling y colas de scheduler: verificar automaxprocs/Go 1.25.

**Paso 2 — correlacionar con el disparador:** ¿desde qué deploy/config/dato ocurre? `git log` del rango + diff de config + ¿algún cliente nuevo enviando payloads distintos? Un perfil de la versión anterior (continuous profiling brilla aquí: diff de flamegraphs entre releases) convierte "algo va mal" en "esta función se volvió 8× más cara en la v1.42".

**Paso 3 — verificar el fix con el mismo instrumento:** mismo perfil de 30s tras desplegar; la función culpable debe desaparecer del top. Sin esta verificación, "parece que va mejor" es folclore.

**Prevención:** continuous profiling con comparación entre versiones; benchmarks de los hot paths en CI con umbral de regresión (`benchstat`); linters/review para los patrones de busy loop (select con default vacío, retry sin backoff); presupuesto de CPU por pod con alerta sobre el *cambio* de consumo por request (CPU/RPS), no solo sobre el total — detecta regresiones antes de que el autoscaler las esconda escalando.

---

## 16. [CASO] Tras un deploy, errores 502/connection reset intermitentes solo durante los rollouts

**Categoría:** Ciclo de vida / Kubernetes · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Errores solo durante deploys = el shutdown o el arranque no están bien coordinados con el balanceo. Causas en orden de probabilidad: el pod recibe SIGTERM y cierra el listener antes de que los endpoints/LB dejen de mandarle tráfico (la carrera clásica); readiness probe que pasa antes de que el servicio esté realmente listo (pools fríos, migraciones); keep-alives no drenados (el LB reutiliza una conexión que el pod ya cerró → reset); o grace period insuficiente (SIGKILL a mitad de requests). Diagnóstico: correlacionar los errores con los eventos de rollout y con qué pod los sirvió. Fix: readiness que falla al recibir la señal + espera de propagación + Shutdown con budget + grace period coherente.

### 📖 Respuesta detallada
**Escenario:** cada deploy genera 30-90s de errores 502 y `connection reset by peer` en el gateway; fuera de deploys, cero errores. El equipo "lo asume" y despliega de madrugada — inaceptable con CD.

**Paso 1 — identificar la fase exacta.** Correlacionar timestamps de errores con eventos del rollout (`kubectl rollout status`, eventos de endpoints). Dos ventanas posibles:
- Errores cuando pods **viejos** terminan → problema de shutdown/drenaje.
- Errores cuando pods **nuevos** entran → problema de readiness/arranque.
El header/log de qué pod sirvió cada error lo resuelve. Suelen ser ambos.

**Paso 2 — la carrera del shutdown (la causa nº1).** Kubernetes, al terminar un pod, hace dos cosas **en paralelo, sin orden garantizado**: enviar SIGTERM al contenedor y retirar el pod de los endpoints. kube-proxy, ingress y clientes con DNS cacheado tardan segundos en enterarse. Si el proceso hace `srv.Shutdown()` inmediatamente al recibir SIGTERM, durante esos segundos siguen llegando conexiones a un listener cerrado → `connection refused`/502. Solución canónica completa:

```go
<-ctx.Done()                    // SIGTERM recibido
healthz.SetNotReady()           // 1. readiness empieza a fallar YA
time.Sleep(propagationDelay)    // 2. 5-10s: que endpoints/LBs se enteren y dejen de enrutar
shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
defer cancel()
srv.Shutdown(shutdownCtx)       // 3. deja de aceptar, drena las en vuelo
```
(o el equivalente con `preStop: sleep` en el manifest, que retrasa el SIGTERM). Y la aritmética: `terminationGracePeriodSeconds` > delay + timeout de Shutdown + cierre de consumers — si no, SIGKILL corta requests a medias (los `connection reset`).

**Paso 3 — keep-alives y el reset del lado LB.** `srv.Shutdown` cierra las conexiones idle y espera a las activas — bien. Pero si el proceso muere sin Shutdown limpio (o con Close), las conexiones keep-alive que el gateway tenía abiertas se cierran abruptamente y la **siguiente** request que el gateway intente sobre esa conexión reusada falla con reset. Mitigaciones: el Shutdown correcto (envía cierre limpio), y en el server `IdleTimeout` menor que el idle timeout del LB (que sea siempre el server, no el LB, quien nota primero la muerte de la conexión... y para upstreams, al revés: el cliente debe reintentar el dial ante conexión reusada muerta — los http.Transport de Go ya reintentan requests idempotentes sobre conexiones rotas reusadas).

**Paso 4 — el lado del arranque.** El pod nuevo pasa readiness y recibe tráfico… con el pool de DB vacío, caches frías, JIT... no en Go, pero sí conexiones TLS a upstreams por establecer: las primeras requests pagan p99 altísimo o fallan por timeout. Fixes: readiness probe que verifica dependencias reales (ping a DB con timeout corto, no un `return 200` incondicional), warm-up en el arranque **antes** de reportar ready (establecer M conexiones del pool, cargar la config/cache crítica), y `minReadySeconds`/rollout budget conservadores (`maxUnavailable: 0, maxSurge: 25%`) para no quedarse corto de capacidad durante la ola.

**Verificación y prevención:** test de deploy bajo carga sintética constante como parte del pipeline (el deploy debe producir **cero** errores — se mide, no se supone); dashboard de errores etiquetado por fase de rollout; alerta si un deploy genera 5xx; y runbook con la aritmética de tiempos documentada para que el próximo que cambie `terminationGracePeriodSeconds` o el timeout de Shutdown sepa qué está tocando. Este caso además es el examen práctico del graceful shutdown "de libro": mucha gente lo implementa; pocos lo verifican bajo tráfico.
