# Java Core Avanzado — Preguntas de Entrevista Senior

## 1. ¿Cómo funciona G1 GC internamente y qué parámetros clave usarías para hacer tuning?
**Categoría:** JVM / Garbage Collection · **Tipo:** Conceptual

### 📝 Respuesta resumen
G1 divide el heap en regiones de tamaño fijo (1–32 MB) en lugar de espacios contiguos, y prioriza recolectar las regiones con más basura (*garbage first*). Trabaja por fases: young collections (STW), marcado concurrente y mixed collections. Su objetivo principal es cumplir un *pause time goal* (`-XX:MaxGCPauseMillis`, 200 ms por defecto) ajustando dinámicamente el tamaño de la young generation y cuántas regiones old incluye en cada mixed collection.

### 📖 Respuesta detallada
G1 (Garbage First) es el colector por defecto desde JDK 9. Sus conceptos internos clave:

- **Regiones:** el heap se divide en ~2048 regiones del mismo tamaño (`-XX:G1HeapRegionSize`). Una región puede ser Eden, Survivor, Old o Humongous (objetos ≥ 50% del tamaño de región, que se asignan directamente en old y son una fuente clásica de problemas).
- **Remembered Sets (RSets) y card tables:** para recolectar una región sin escanear todo el heap, G1 mantiene por región un RSet con las referencias entrantes desde otras regiones. Los *write barriers* mantienen esto actualizado, y es parte del overhead de G1.
- **SATB (Snapshot-At-The-Beginning):** el marcado concurrente usa SATB para garantizar que los objetos vivos al inicio del ciclo se consideren vivos, con un write barrier pre-escritura que registra el valor antiguo.
- **Ciclo:** young GC (evacuación STW de Eden/Survivor) → cuando la ocupación de old supera `-XX:InitiatingHeapOccupancyPercent` (IHOP, ~45%, hoy adaptativo) se lanza el marcado concurrente → después vienen *mixed collections* que evacúan young + las regiones old con más basura, controladas por `-XX:G1MixedGCCountTarget` y `-XX:G1HeapWastePercent`.

**Tuning práctico (lo que el entrevistador espera oír):**

```bash
java -Xms8g -Xmx8g \
  -XX:MaxGCPauseMillis=100 \
  -XX:InitiatingHeapOccupancyPercent=35 \
  -XX:G1HeapRegionSize=16m \
  -Xlog:gc*,gc+heap=debug:file=gc.log:time,uptime,level,tags \
  -jar app.jar
```

- Fijar `-Xms = -Xmx` en servicios para evitar resize del heap.
- No bajar `MaxGCPauseMillis` a valores irreales (p. ej. 10 ms): G1 lo compensa reduciendo la young gen, lo que dispara la frecuencia de GC y baja el throughput.
- Si hay muchos objetos *humongous* (visibles en los logs como "humongous allocation"), subir `G1HeapRegionSize` o revisar el código que crea arrays gigantes (típico: leer un archivo entero en un `byte[]`, respuestas HTTP enormes, caches mal diseñadas).
- **Evacuation Failure / to-space exhausted:** cuando G1 no tiene regiones libres donde evacuar, degenera en un Full GC single-threaded (pre-JDK 10) o paralelo, con pausas de segundos. Solución: más heap, IHOP más bajo (empezar el marcado antes) o `-XX:G1ReservePercent` más alto.

**Errores comunes:** copiar flags de blogs antiguos (`-XX:+UseParNewGC`), tunear sin logs de GC, o mezclar flags de CMS con G1. Un senior siempre parte de los logs (`-Xlog:gc*`) y de métricas (pause time p99, frecuencia, promoción), no de flags "mágicas".

---

## 2. ¿Cuándo elegirías ZGC o Shenandoah en lugar de G1? ¿Qué sacrificas?
**Categoría:** JVM / Garbage Collection · **Tipo:** Conceptual

### 📝 Respuesta resumen
ZGC y Shenandoah son colectores de baja latencia que hacen marcado *y compactación* concurrentes, con pausas sub-milisegundo independientes del tamaño del heap. Los elegiría en servicios sensibles a latencia (trading, gateways, APIs con SLO de p99 estricto) o con heaps enormes (decenas o cientos de GB). El precio: mayor uso de CPU (barriers más costosos) y algo menos de throughput; G1 sigue siendo mejor default para batch y servicios sin SLO de latencia agresivo.

### 📖 Respuesta detallada
La diferencia arquitectónica clave es **dónde ocurre el trabajo de compactación**:

- **G1:** evacúa (mueve objetos) durante pausas STW. La pausa crece con el live set de la young gen.
- **ZGC:** usa *colored pointers* (bits de metadatos dentro del puntero de 64 bits) y *load barriers*. Cuando un hilo de aplicación carga una referencia a un objeto que está siendo movido, el barrier lo relocaliza o corrige el puntero al vuelo (*self-healing*). Resultado: pausas < 1 ms incluso con heaps de terabytes. Desde JDK 21 existe **ZGC generacional** (`-XX:+UseZGC -XX:+ZGenerational`, default en JDK 23), que reduce muchísimo el CPU overhead porque deja de recolectar todo el heap en cada ciclo.
- **Shenandoah:** enfoque similar (concurrente casi todo) pero con *Brooks pointers* históricamente y load reference barriers en versiones modernas. Disponible en builds de Red Hat/Adoptium; comportamiento comparable a ZGC.

**Trade-offs que debes verbalizar en la entrevista:**

1. **Throughput vs latencia:** los barriers de ZGC/Shenandoah añaden ~5–15% de overhead de CPU. Si tu servicio es un batch nocturno de procesamiento, Parallel GC o G1 terminan antes.
2. **Allocation stall:** si la aplicación aloca más rápido de lo que ZGC recolecta concurrentemente, los hilos se bloquean esperando memoria (visible como "Allocation Stall" en los logs). La mitigación es más heap o más hilos concurrentes de GC (`-XX:ConcGCThreads`), es decir: ZGC cambia pausas por consumo de recursos.
3. **Heap headroom:** los colectores concurrentes necesitan más memoria libre para trabajar mientras la aplicación sigue alocando; regla práctica: 20–30% extra vs G1.
4. **Compressed oops:** ZGC clásico no usaba compressed oops (punteros de 32 bits para heaps < 32 GB), así que en heaps pequeños podía consumir más memoria; el generacional lo mitiga.

```bash
# ZGC generacional en JDK 21+
java -XX:+UseZGC -XX:+ZGenerational -Xmx16g -Xms16g -Xlog:gc* -jar app.jar
```

**Qué espera oír el entrevistador:** que la decisión se toma con datos (histograma de pausas, SLO del servicio), que conoces el mecanismo de load barriers y colored pointers al menos conceptualmente, y que no dices "ZGC siempre es mejor". Un buen cierre: "para un microservicio típico de 2–4 GB de heap con p99 de 200 ms, G1 bien configurado sobra; ZGC lo reservo para cuando las pausas de GC aparecen de verdad en el análisis de latencia".

---

## 3. Explica el Java Memory Model: ¿qué es happens-before y por qué importa?
**Categoría:** Concurrencia / JMM · **Tipo:** Conceptual

### 📝 Respuesta resumen
El JMM define qué valores puede ver un hilo cuando lee memoria escrita por otro. Sin sincronización, el compilador, el JIT y la CPU pueden reordenar instrucciones y cachear valores, así que un hilo puede ver escrituras desordenadas o nunca verlas. *Happens-before* es la relación formal que garantiza visibilidad y orden: si A happens-before B, entonces B ve los efectos de A. La crean `synchronized`, `volatile`, `Thread.start()/join()`, los `final` fields correctamente publicados y las clases de `java.util.concurrent`.

### 📖 Respuesta detallada
El JMM (JSR-133, JLS §17.4) existe porque el hardware y el JIT optimizan agresivamente: *store buffers*, reordenamiento out-of-order, hoisting de lecturas fuera de loops. El ejemplo canónico que todo senior debe poder escribir:

```java
class Broken {
    private boolean ready = false;   // sin volatile
    private int value = 0;

    void writer() {          // Hilo A
        value = 42;
        ready = true;        // puede reordenarse antes de value = 42
    }

    void reader() {          // Hilo B
        while (!ready) { }   // puede loopear para siempre (lectura hoisted)
        System.out.println(value); // puede imprimir 0
    }
}
```

Dos fallos posibles: (1) el JIT puede transformar el `while` en `if (!ready) while(true);` porque sin `volatile` asume que ningún otro hilo modifica `ready`; (2) aunque B salga del loop, puede ver `value == 0` porque las escrituras se reordenaron o no se propagaron.

**Reglas happens-before que hay que citar:**
- **Program order:** dentro de un hilo, cada acción happens-before las siguientes (según el orden del programa, aunque la ejecución real se reordene mientras no sea observable).
- **Monitor lock:** el `unlock` de un monitor happens-before cada `lock` posterior del mismo monitor.
- **Volatile:** una escritura volatile happens-before toda lectura posterior de esa variable. Además actúa como barrera: todo lo escrito *antes* del volatile write es visible *después* del volatile read (por eso el patrón "volatile flag" publica correctamente el estado previo).
- **Thread start/join:** `t.start()` happens-before cualquier acción de `t`; todas las acciones de `t` happen-before el retorno de `t.join()`.
- **Transitividad:** si A hb B y B hb C, entonces A hb C. Esta transitividad es lo que hace útil el modelo: sincronizas en un punto y "arrastras" la visibilidad de todo lo anterior.

**Qué espera el entrevistador:** que no confundas *atomicidad* con *visibilidad* (son problemas distintos: `volatile` da visibilidad y orden, no atomicidad de `count++`), que menciones que `java.util.concurrent` (colas, executors, `CompletableFuture`) ya establece happens-before entre productor y consumidor —por eso casi nunca necesitas `volatile` manual en código de aplicación—, y que un *data race* (acceso concurrente sin happens-before con al menos una escritura) es siempre un bug aunque "funcione en mi máquina", porque el comportamiento depende del JIT y la arquitectura (x86 es muy permisivo; ARM reordena mucho más, y el bug aparece al migrar a instancias Graviton).

---

## 4. `volatile` vs `synchronized` vs `AtomicLong`/VarHandle: ¿cuándo usar cada uno?
**Categoría:** Concurrencia / JMM · **Tipo:** Conceptual

### 📝 Respuesta resumen
`volatile` garantiza visibilidad y prohíbe reordenamiento, pero no atomicidad: sirve para flags y publicación de referencias inmutables. `synchronized` da exclusión mutua + visibilidad: necesario cuando hay invariantes entre varias variables o secuencias read-modify-write complejas. Los `Atomic*` usan CAS (compare-and-swap) para operaciones read-modify-write sin bloqueo sobre una sola variable. Para contadores de altísima contención, `LongAdder` supera a `AtomicLong` porque particiona el estado.

### 📖 Respuesta detallada
La decisión se estructura por el tipo de operación:

**1. Solo visibilidad de una variable → `volatile`.**
```java
private volatile boolean shutdownRequested;

public void requestShutdown() { shutdownRequested = true; }
public void workLoop() {
    while (!shutdownRequested) { processNext(); }
}
```
Error común: creer que `volatile int counter; counter++;` es thread-safe. `counter++` son tres operaciones (read, add, write); dos hilos pueden leer el mismo valor y perder incrementos. `volatile` no lo arregla.

**2. Read-modify-write sobre UNA variable → `AtomicLong`/`AtomicReference`.**
```java
private final AtomicLong requests = new AtomicLong();
public long next() { return requests.incrementAndGet(); }

// CAS loop explícito para lógica condicional:
public boolean tryUpgrade(State from, State to) {
    return state.compareAndSet(from, to);
}
```
CAS no bloquea: bajo contención los hilos reintentan (spin), lo cual es más rápido que un lock salvo contención extrema. Ahí entra **`LongAdder`**: mantiene celdas separadas por hilo (striping) y suma al leer; ideal para métricas (Micrometer lo usa internamente), malo si necesitas leer el valor exacto con frecuencia.

**3. Invariantes entre VARIAS variables o secciones críticas → `synchronized` / `ReentrantLock`.**
```java
public synchronized void transfer(Account a, Account b, long amount) {
    a.debit(amount);   // estas dos operaciones deben ser atómicas JUNTAS
    b.credit(amount);  // ni volatile ni Atomic pueden garantizarlo
}
```
`ReentrantLock` añade `tryLock(timeout)` (clave para evitar deadlocks), fairness opcional y `Condition`s múltiples. Desde la mejora de `synchronized` en JDK moderno (biased locking eliminado en 15, lock elision, inflación adaptativa), el rendimiento es comparable; se elige `ReentrantLock` por funcionalidad, no por velocidad. **Con virtual threads (JDK 21-23), `synchronized` que se bloquea con el monitor tomado "pineaba" el carrier thread; en JDK 24 (JEP 491) esto se resolvió** — mencionar esto suma muchos puntos.

**4. Nivel experto: `VarHandle`** (reemplazo moderno de `Unsafe`) permite elegir el modo de memoria: `getVolatile`, `getAcquire/setRelease`, `getOpaque`, `compareAndExchange`. Se usa en librerías de alto rendimiento para pagar solo las barreras necesarias.

**Qué espera el entrevistador:** el razonamiento "¿cuántas variables forman el invariante?" como criterio de decisión, el error clásico de `volatile` con `++`, conocer `LongAdder` para contadores calientes, y no sobre-sincronizar (locks amplios que serializan todo el servicio son el origen de muchos problemas de throughput en producción).

---

## 5. ¿Qué garantías especiales dan los campos `final` y qué es la publicación segura (safe publication)?
**Categoría:** Concurrencia / JMM · **Tipo:** Conceptual

### 📝 Respuesta resumen
El JMM da a los campos `final` una garantía especial: si un objeto se construye correctamente (sin dejar escapar `this` durante el constructor), cualquier hilo que vea la referencia verá los valores de sus campos `final` completamente inicializados, sin sincronización adicional. Los campos no-final no tienen esa garantía: otro hilo puede ver el objeto "a medio construir". Por eso los objetos inmutables (todos los campos `final`) pueden publicarse por un data race sin romperse, y por eso el double-checked locking necesita `volatile`.

### 📖 Respuesta detallada
La semántica de `final` (JLS §17.5) introduce un *freeze* al final del constructor: existe una barrera que impide que las escrituras a campos final se reordenen después de la publicación de la referencia. Comparemos:

```java
class Config {
    private final Map<String, String> values;  // final: garantía JMM
    private int version;                        // no-final: SIN garantía

    Config(Map<String, String> v, int ver) {
        this.values = Map.copyOf(v);
        this.version = ver;
    }
}

// Hilo A publica sin sincronización:
static Config INSTANCE;               // ni volatile ni final
void init() { INSTANCE = new Config(map, 7); }

// Hilo B:
void read() {
    Config c = INSTANCE;
    if (c != null) {
        c.values.get("x");   // SEGURO: values está congelado
        int v = c.version;   // PUEDE SER 0: no-final, sin happens-before
    }
}
```

**Condición crítica: no dejar escapar `this` en el constructor.** Si el constructor registra `this` en un listener, lo pasa a otro hilo o arranca un thread interno, la garantía de freeze se rompe porque la referencia se publica *antes* de terminar la construcción:

```java
class Leaky {
    private final EventBus bus;
    Leaky(EventBus bus) {
        this.bus = bus;
        bus.register(this);  // BUG: this escapa antes de que termine el constructor
    }
}
```

**Formas de publicación segura** (Java Concurrency in Practice, la lista que el entrevistador quiere oír):
1. Inicializar en un campo `static final` (class loading garantiza visibilidad — es la base del *initialization-on-demand holder idiom*).
2. Guardar en un campo `volatile` o `AtomicReference`.
3. Publicar a través de una estructura concurrente (`ConcurrentHashMap`, `BlockingQueue`).
4. Proteger con lock tanto escritura como lectura.
5. Objeto **inmutable** (todos los campos `final`, estado interno no mutable): se puede publicar incluso con data race — es la única categoría con esta propiedad, y es la razón profunda por la que `String` es seguro de compartir.

**Conexión con double-checked locking:**
```java
private static volatile Service instance;  // volatile es OBLIGATORIO
static Service get() {
    Service s = instance;
    if (s == null) {
        synchronized (Service.class) {
            s = instance;
            if (s == null) instance = s = new Service();
        }
    }
    return s;
}
```
Sin `volatile`, otro hilo puede ver `instance != null` pero con campos no-final sin inicializar (la escritura de la referencia se reordena antes que las escrituras del constructor). Con records (campos implícitamente final) el problema desaparece para el estado del propio objeto — buen momento para mencionar que la inmutabilidad es la herramienta número uno de concurrencia, no los locks.

---

## 6. `CompletableFuture`: composición, manejo de errores y sus pitfalls principales
**Categoría:** Concurrencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
`CompletableFuture` permite componer operaciones asíncronas de forma declarativa: `thenApply` (map), `thenCompose` (flatMap), `thenCombine` (zip), `allOf/anyOf` (fan-in) y manejo de errores con `exceptionally`/`handle`/`whenComplete`. Los pitfalls clave: los métodos `*Async` sin executor usan `ForkJoinPool.commonPool()` (peligroso para I/O), `get()` sin timeout bloquea indefinidamente, las excepciones se envuelven en `CompletionException`, y `allOf` devuelve `CompletableFuture<Void>` obligando a recolectar resultados manualmente.

### 📖 Respuesta detallada
Ejemplo realista de fan-out en un microservicio que agrega datos de tres servicios:

```java
public OrderView getOrderView(String orderId) {
    CompletableFuture<Order> order =
        CompletableFuture.supplyAsync(() -> orderClient.find(orderId), ioExecutor);
    CompletableFuture<Customer> customer =
        order.thenComposeAsync(o ->                       // flatMap: dependencia
            CompletableFuture.supplyAsync(
                () -> customerClient.find(o.customerId()), ioExecutor),
            ioExecutor);
    CompletableFuture<List<Shipment>> shipments =
        CompletableFuture.supplyAsync(() -> shippingClient.byOrder(orderId), ioExecutor)
            .exceptionally(ex -> {                        // degradación parcial
                log.warn("shipping degraded", ex);
                return List.of();
            });

    return order.thenCombine(customer, OrderView::partial)
                .thenCombine(shipments, OrderView::withShipments)
                .orTimeout(2, TimeUnit.SECONDS)           // JDK 9+: timeout obligatorio
                .join();
}
```

**Pitfalls que hay que saber explicar:**

1. **`commonPool` para I/O.** `supplyAsync(supplier)` sin executor usa `ForkJoinPool.commonPool()`, dimensionado a `cores - 1`. Si metes llamadas HTTP/JDBC bloqueantes, agotas el pool compartido de TODA la JVM (incluyendo streams paralelos) y el servicio se degrada de forma misteriosa. Regla: I/O siempre con executor dedicado y acotado (o virtual threads: `Executors.newVirtualThreadPerTaskExecutor()`).
2. **`thenApply` vs `thenApplyAsync`.** Sin `Async`, el callback corre en el hilo que completó el future (que puede ser el hilo de I/O de Netty de tu HTTP client, bloqueándolo si el callback es pesado) o en el hilo que registró el callback si el future ya estaba completo. Esta no-determinación es fuente de bugs sutiles de latencia.
3. **Errores envueltos:** `join()` lanza `CompletionException` con la causa dentro; `get()` lanza `ExecutionException`. Hay que desenvolver (`ex.getCause()`) para hacer matching de excepciones de negocio. `exceptionally` solo se ejecuta si hubo error; `handle((val, ex) -> ...)` siempre; `whenComplete` observa sin transformar.
4. **`allOf` incómodo:**
```java
CompletableFuture<List<Result>> all =
    CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new))
        .thenApply(v -> futures.stream().map(CompletableFuture::join).toList());
```
Los `join()` internos no bloquean porque `allOf` ya garantizó la finalización — hay que saber justificarlo. Además `allOf` falla si *cualquiera* falla; para "todas las que puedan", cada future debe manejar su error antes.
5. **Cancelación débil:** `cancel(true)` no interrumpe el hilo que ejecuta el supplier (a diferencia de `FutureTask`); solo marca el future como cancelado. La tarea sigue consumiendo recursos.
6. **Sin contexto:** MDC, security context y trazas no se propagan solos entre hilos — hay que decorar el executor (Micrometer `ContextSnapshot`).

**Qué espera el entrevistador:** que menciones executors explícitos, timeouts siempre (`orTimeout`/`completeOnTimeout`), y que reconozcas cuándo `CompletableFuture` deja de valer la pena frente a virtual threads: con Loom, el código bloqueante secuencial recupera legibilidad y stack traces útiles con el mismo throughput.

---

## 7. ForkJoinPool y work-stealing: ¿cómo funciona y qué problemas causa el commonPool?
**Categoría:** Concurrencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
ForkJoinPool implementa *work-stealing*: cada worker tiene su propia deque; empuja y saca subtareas por un extremo (LIFO, aprovecha caché) y los workers ociosos roban del extremo contrario (FIFO) de deques ajenas. Está optimizado para divide-y-vencerás CPU-bound (`RecursiveTask`). El `commonPool()` es compartido por toda la JVM (streams paralelos, `CompletableFuture` sin executor) y tiene `cores - 1` hilos: cualquier tarea bloqueante lo envenena para todos sus usuarios.

### 📖 Respuesta detallada
**Mecánica interna:** al hacer `fork()`, la subtarea se apila en la deque del worker actual. `join()` intenta: (1) ejecutar la tarea si aún está en la propia deque (*help-first*), (2) robar trabajo relacionado, (3) como último recurso, bloquear. El robo por el extremo FIFO significa que se roban las tareas *más grandes* (las primeras en dividirse), lo que amortiza el coste de sincronización del robo. Este diseño minimiza contención: cada worker opera casi siempre sobre su propia deque sin locks.

```java
class SumTask extends RecursiveTask<Long> {
    private static final int THRESHOLD = 10_000;
    private final long[] data; private final int lo, hi;

    SumTask(long[] data, int lo, int hi) { this.data = data; this.lo = lo; this.hi = hi; }

    @Override protected Long compute() {
        if (hi - lo <= THRESHOLD) {
            long sum = 0;
            for (int i = lo; i < hi; i++) sum += data[i];
            return sum;
        }
        int mid = (lo + hi) >>> 1;
        SumTask left = new SumTask(data, lo, mid);
        SumTask right = new SumTask(data, mid, hi);
        left.fork();                      // asíncrono en la deque local
        long r = right.compute();         // el hilo actual sigue trabajando
        return left.join() + r;           // orden fork/compute/join importa
    }
}
```
Detalle que distingue a un senior: el patrón correcto es `fork()` una mitad y `compute()` la otra en el hilo actual (no `fork()` ambas), y hacer `join()` sobre la forkeada *al final* — así el hilo nunca queda ocioso y se minimiza el robo. El umbral (`THRESHOLD`) es crítico: demasiado fino y el overhead de tareas domina; demasiado grueso y no hay paralelismo.

**Problemas del commonPool:**
1. **Dimensionado para CPU:** `parallelism = cores - 1`. En un contenedor con `cpu-limit=2`, el commonPool tiene ~1 hilo. Un `parallelStream()` que "en local vuela" no paraleliza nada en Kubernetes. (Y recordar: la JVM respeta cgroups desde JDK 10 — `availableProcessors()` devuelve el limit del contenedor.)
2. **Contaminación cruzada:** streams paralelos, `CompletableFuture.supplyAsync` sin executor y librerías de terceros comparten el mismo pool. Una librería que bloquea en I/O dentro del commonPool degrada TODAS las operaciones paralelas de la JVM. Diagnóstico típico: thread dump muestra `ForkJoinPool.commonPool-worker-*` bloqueados en sockets.
3. **`ManagedBlocker`** es el mecanismo de escape: informa al pool de que un hilo va a bloquear para que cree un worker de compensación. Lo usa `Phaser` internamente; casi nadie lo usa en aplicación, y es mejor así — la respuesta correcta es un executor dedicado.

**Relación con virtual threads:** el scheduler de Loom ES un ForkJoinPool (en modo FIFO, no LIFO), con los carrier threads como workers. Entender work-stealing explica también cómo se planifican los virtual threads.

**Qué espera el entrevistador:** el patrón fork/compute/join correcto, el peligro del commonPool en contenedores y con I/O, y el criterio: ForkJoinPool para CPU-bound divisible; executors clásicos o virtual threads para I/O.

---

## 8. Virtual threads (Project Loom): ¿cómo funcionan, cuándo usarlos y qué es el pinning?
**Categoría:** Concurrencia / Loom · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los virtual threads (estables en JDK 21) son hilos gestionados por la JVM, no por el SO: su stack vive en el heap y se montan sobre pocos *carrier threads* (un ForkJoinPool). Cuando un virtual thread bloquea en I/O, la JVM lo desmonta y el carrier ejecuta otro; esto permite millones de hilos baratos y recupera el modelo "un hilo por request" para servicios I/O-bound sin programación reactiva. No aceleran código CPU-bound. El *pinning* (quedar clavado al carrier durante `synchronized` bloqueante o llamadas nativas) fue su principal limitación hasta JDK 24 (JEP 491).

### 📖 Respuesta detallada
**Mecánica:** un virtual thread es una `Continuation` cuyo stack se copia a/desde el heap al desmontarse/montarse. Toda la infraestructura de I/O bloqueante del JDK (`Socket`, `HttpClient`, JDBC drivers que usan sockets estándar, `Thread.sleep`, `BlockingQueue`) fue adaptada: en lugar de bloquear el hilo del SO, registra el evento en un poller y desmonta el virtual thread (*yield*). Coste de creación: ~1 KB inicial vs ~1 MB de stack reservado de un platform thread; se pueden crear millones.

```java
// Servidor con un virtual thread por tarea:
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (Order order : orders) {
        executor.submit(() -> {
            var customer = customerClient.find(order.customerId()); // bloquea SIN coste
            var stock = stockClient.check(order.sku());
            process(order, customer, stock);
        });
    }
} // close espera a que terminen

// Spring Boot 3.2+:
// spring.threads.virtual.enabled=true  → Tomcat usa un VT por request
```

**Reglas de uso que el entrevistador quiere oír:**
1. **NO poolear virtual threads.** Son baratos; se crea uno por tarea. Un "pool de virtual threads" es un anti-patrón — para limitar concurrencia hacia un recurso (p. ej. una DB con 20 conexiones) se usa un `Semaphore`, no un pool.
2. **Pinning:** hasta JDK 23, si un virtual thread bloqueaba *dentro de* un bloque `synchronized` (esperando el monitor o haciendo I/O con el monitor tomado) o durante una llamada JNI, quedaba clavado al carrier. Con pocos carriers (= cores) y muchas secciones pinned, el throughput colapsaba. Diagnóstico: `-Djdk.tracePinnedThreads=full` o el evento JFR `jdk.VirtualThreadPinned`. Mitigación histórica: reemplazar `synchronized` por `ReentrantLock` en hot paths (los drivers JDBC y librerías lo fueron haciendo). **JDK 24 (JEP 491) eliminó el pinning por `synchronized`** — citar esto demuestra estar al día.
3. **ThreadLocal:** funciona, pero con millones de hilos un `ThreadLocal` con objetos pesados (p. ej. `SimpleDateFormat`, buffers) explota la memoria y no se reutiliza entre tareas. La alternativa es `ScopedValue` (JEP 506, final en JDK 25): inmutable, con ámbito estructurado y heredable barato.
4. **CPU-bound no mejora:** el paralelismo real sigue limitado por los carriers (= cores). Los virtual threads optimizan la *espera*, no el cómputo.
5. **Observabilidad:** los thread dumps clásicos no listan bien millones de VTs; usar `jcmd <pid> Thread.dump_to_file -format=json` que los agrupa.

**Frente a reactivo (WebFlux):** mismo throughput I/O-bound con código imperativo, stack traces legibles, debugging normal y sin "function coloring". Reactivo mantiene ventaja en backpressure explícito y streaming. La respuesta senior: "para el 90% de los microservicios CRUD/agregadores, virtual threads simplifican; no reescribiría un sistema WebFlux que funciona, pero no empezaría uno nuevo en reactivo sin una razón concreta".

---

## 9. Structured concurrency: ¿qué problema resuelve frente a ExecutorService y CompletableFuture?
**Categoría:** Concurrencia / Loom · **Tipo:** Conceptual

### 📝 Respuesta resumen
La concurrencia estructurada (JEP 505, en preview evolutiva desde JDK 21) ata el ciclo de vida de las subtareas a un bloque léxico: si el bloque termina, las subtareas terminan; si una falla, las hermanas se cancelan; los errores se propagan al padre con stack traces conectados. Elimina los *thread leaks* y las cancelaciones huérfanas típicas de lanzar `CompletableFuture`s sueltos, igual que los bloques estructurados eliminaron el `goto`.

### 📖 Respuesta detallada
**El problema:** con `ExecutorService`/`CompletableFuture`, la relación padre-hijo entre tareas solo existe en la cabeza del programador. Consecuencias reales en producción:
- El request principal falla o hace timeout, pero las subtareas siguen ejecutándose (llamadas HTTP zombies que cargan servicios downstream).
- Una subtarea falla y nadie cancela a las hermanas: pagas la latencia de la más lenta para luego descartar todo.
- Excepciones que se pierden (`CompletableFuture` nunca consultado) y thread dumps donde es imposible saber qué tarea pertenece a qué request.

**La solución (API de JDK 25, JEP 505):**

```java
Response handle(String orderId) throws InterruptedException {
    try (var scope = StructuredTaskScope.open(
            StructuredTaskScope.Joiner.<Object>allSuccessfulOrThrow())) {

        Subtask<Order> order   = scope.fork(() -> orderClient.find(orderId));
        Subtask<Customer> cust = scope.fork(() -> customerClient.find(orderId));

        scope.join();                       // espera a TODAS o lanza si una falló
        return new Response(order.get(), cust.get());
    }
    // Al salir del try: garantizado que no queda ningún hilo vivo del scope
}
```

Semánticas clave:
- **`allSuccessfulOrThrow`** (antes `ShutdownOnFailure`): al primer fallo, cancela (interrumpe) las demás subtareas y propaga la excepción original como causa. Esto implementa "fail-fast con limpieza" en tres líneas — hacerlo bien a mano con `CompletableFuture` requiere `allOf` + cancelaciones manuales + cuidado con las carreras.
- **`anySuccessfulResultOrThrow`** (antes `ShutdownOnSuccess`): carrera entre réplicas — el primer éxito gana y cancela el resto (patrón *hedged requests*).
- **Joiners personalizados:** p. ej. "recoge los éxitos, tolera fallos parciales" implementando `Joiner`.
- **Cancelación jerárquica:** si el hilo padre es interrumpido (timeout del request), la interrupción se propaga en cascada a todo el árbol de subtareas. Con `ScopedValue` el contexto (traceId, tenant) fluye automáticamente al árbol.
- **Observabilidad:** el thread dump JSON (`jcmd Thread.dump_to_file`) muestra los scopes como árbol: se ve qué subtareas pertenecen a qué request.

**Trade-offs y estado:** la API sigue en preview (quinta preview en JDK 25) — en producción conservadora se usa el patrón manualmente (try/finally con cancelación) o librerías tipo JOX. No reemplaza a `CompletableFuture` para pipelines event-driven donde no hay un "padre" con ciclo de vida claro (p. ej. callbacks de un consumer Kafka).

**Qué espera el entrevistador:** que articules el problema (lifetimes huérfanos, cancelación, pérdida de excepciones) antes que la API, la analogía con la programación estructurada, y la combinación natural: virtual threads (hilos baratos) + structured concurrency (ciclo de vida) + scoped values (contexto) como el nuevo modelo de concurrencia de Java.

---

## 10. HashMap por dentro: hashing, resize, treeification y por qué es peligroso en concurrencia
**Categoría:** Colecciones · **Tipo:** Conceptual

### 📝 Respuesta resumen
HashMap usa un array de buckets; el índice es `(n-1) & hash` donde `hash` mezcla los 16 bits altos con los bajos (`h ^ (h >>> 16)`) para compensar tablas pequeñas. Las colisiones se encadenan en listas; desde Java 8, un bucket con ≥ 8 nodos (y tabla ≥ 64) se convierte en árbol rojo-negro (O(log n) frente a O(n), mitigando ataques de colisión). Al superar `capacity × loadFactor` (0.75) se duplica la capacidad y se redistribuyen los nodos. En concurrencia sin sincronizar se corrompe: pérdida de entradas y, en Java 7, loops infinitos.

### 📖 Respuesta detallada
**Puntos internos que hay que dominar:**

1. **Capacidad siempre potencia de 2** → el módulo se calcula con AND bit a bit (`(n-1) & hash`), mucho más barato que `%`. Consecuencia: solo los bits bajos del hash participan, por eso el *spreading* `h ^ (h >>> 16)` es necesario — sin él, hashes que solo difieren en bits altos (común con `Double`, hashes de direcciones) colisionarían masivamente.

2. **Resize:** al insertar el elemento que supera el umbral (`threshold = capacity * 0.75`), se crea una tabla del doble y se recolocan todos los nodos. Optimización de Java 8: como la capacidad se duplica, cada nodo va o al mismo índice o a `índice + oldCapacity` (según un solo bit del hash), así que cada bucket se divide en dos listas "lo" y "hi" sin recalcular hashes. Aun así el resize es O(n) — por eso **pre-dimensionar importa**:
```java
// Para 10_000 elementos: capacidad inicial correcta
Map<String, User> users = HashMap.newHashMap(10_000); // JDK 19+: calcula capacity/loadFactor
// equivalente antiguo: new HashMap<>((int) (10_000 / 0.75f) + 1)
```
Error común: `new HashMap<>(10_000)` NO evita resizes: con load factor 0.75 hará resize al llegar a 7 500.

3. **Treeification:** con ≥ `TREEIFY_THRESHOLD` (8) nodos en un bucket y tabla ≥ 64, la lista se convierte en árbol rojo-negro; si las claves son `Comparable`, se ordenan por `compareTo`, si no, por hash e identidad. Vuelve a lista al bajar de 6. Motivación: un atacante que controla claves (parámetros HTTP) podía generar miles de colisiones y degradar el servidor a O(n) por lookup (ataque HashDoS real, CVE-2011-4858 en su época); el árbol acota a O(log n).

4. **Contrato equals/hashCode:** si `hashCode` es inconsistente con `equals`, o si la clave **muta después de insertarse** (cambia su hash), el elemento se "pierde": está en el bucket antiguo pero se busca en el nuevo. Por eso las claves deben ser inmutables (records son ideales).

5. **Concurrencia:** dos hilos escribiendo pueden perder entradas (ambos escriben en el mismo bucket, uno pisa al otro) o corromper el árbol/lista durante resize. El caso histórico famoso: en Java 7 el resize invertía las listas y dos hilos concurrentes podían crear un **ciclo** → `get()` entraba en loop infinito con CPU al 100% (bug clásico de producción, visible en thread dumps como hilos RUNNABLE eternamente dentro de `HashMap.get`). Java 8 mantiene el orden y ya no forma ciclos, pero sigue siendo incorrecto: la respuesta es `ConcurrentHashMap`, no "parece que ya no se cuelga".

**Qué espera el entrevistador:** el porqué de cada decisión de diseño (potencias de 2 → spreading; HashDoS → árboles), el cálculo correcto de capacidad inicial, claves inmutables, y la anécdota del loop infinito como demostración de que conoces el riesgo real, no solo la teoría.

---

## 11. ConcurrentHashMap: ¿cómo logra thread-safety sin un lock global y qué garantías da?
**Categoría:** Colecciones / Concurrencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
Desde Java 8, ConcurrentHashMap abandonó los segments: usa CAS para insertar en buckets vacíos y `synchronized` sobre el primer nodo del bucket para colisiones — la contención se reduce al bucket individual. Las lecturas no bloquean nunca (campos `volatile` + happens-before). Ofrece operaciones atómicas compuestas (`computeIfAbsent`, `merge`, `compute`) que eliminan el patrón roto check-then-act. Sus iteradores son *weakly consistent* y `size()` es una estimación bajo concurrencia.

### 📖 Respuesta detallada
**Diseño interno (Java 8+):**
- **put en bucket vacío:** CAS directo sobre el slot del array (`tabAt/casTabAt` con VarHandle). Sin lock.
- **put con colisión:** `synchronized (primerNodo)` — lock de granularidad bucket. Con buena dispersión, la probabilidad de contención es mínima.
- **get:** sin locks; `Node.val` y `Node.next` son `volatile`, lo que establece happens-before entre escritores y lectores.
- **Resize cooperativo:** el hilo que detecta la necesidad inicia la transferencia, y otros hilos que llegan a escribir *ayudan* a mover buckets (nodos `ForwardingNode` marcan los ya movidos y redirigen los gets a la tabla nueva). El resize se paraleliza en vez de bloquear.
- **size():** se mantiene con un `baseCount` + `CounterCell[]` (mismo diseño que `LongAdder`) para no serializar los contadores; el valor es una estimación instantánea, no exacta bajo escrituras concurrentes.

**La API compuesta es lo importante en el día a día:**

```java
private final ConcurrentHashMap<String, RateLimiter> limiters = new ConcurrentHashMap<>();

// MAL: check-then-act, condición de carrera — dos hilos crean dos limiters
RateLimiter bad(String tenant) {
    RateLimiter rl = limiters.get(tenant);
    if (rl == null) { rl = RateLimiter.create(100); limiters.put(tenant, rl); }
    return rl;
}

// BIEN: atómico por bucket
RateLimiter good(String tenant) {
    return limiters.computeIfAbsent(tenant, t -> RateLimiter.create(100));
}

// Contadores atómicos sin AtomicLong por clave:
errorsByCode.merge(statusCode, 1L, Long::sum);
```

**Pitfalls que el entrevistador espera oír:**
1. **`computeIfAbsent` con función lenta o recursiva:** la mapping function se ejecuta con el lock del bucket tomado. Si hace I/O, bloqueas a todos los que colisionen en ese bucket; si vuelve a modificar el mismo mapa (recursión sobre la misma clave/bucket) puede lanzar `IllegalStateException` o deadlockear. Para caches con carga costosa: Caffeine, no CHM a pelo.
2. **Atomicidad no composicional:** dos llamadas atómicas seguidas NO son atómicas juntas. `if (map.containsKey(k)) map.remove(k);` sigue siendo una carrera; se usa `remove(k, expectedValue)` o `compute`.
3. **No admite null** (ni clave ni valor) — porque `get() == null` debe significar inequívocamente "ausente" en un contexto concurrente.
4. **Iteración weakly consistent:** no lanza `ConcurrentModificationException`; refleja algún estado entre el inicio y el fin de la iteración. Perfecto para métricas/limpieza, inaceptable si necesitas un snapshot consistente (ahí: copiar o repensar el diseño).
5. **CHM no da atomicidad entre mapas:** invariantes que abarcan dos estructuras necesitan locks externos igualmente.

**Cierre senior:** CHM es la estructura concurrente más usada en microservicios (caches locales, registries, contadores) y la pregunta de fondo del entrevistador es si sabes usar la API atómica compuesta en lugar de reproducir carreras con get/put.

---

## 12. Records: ¿qué aportan realmente, qué limitaciones tienen y cuándo NO usarlos?
**Categoría:** Lenguaje moderno · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un record (estable desde Java 16) es una clase nominal para *datos inmutables*: declara componentes y el compilador genera constructor canónico, accessors, `equals/hashCode/toString`. Es transparente: su API es su estado. Aporta inmutabilidad por defecto (campos `final`), semántica de valor y menos boilerplate que Lombok sin magia de bytecode. No sirve cuando necesitas mutabilidad, herencia de clases, encapsular representación interna distinta de la API, o frameworks que exigen no-arg constructor + setters (JPA entities).

### 📖 Respuesta detallada
```java
public record Money(BigDecimal amount, Currency currency) {
    // Constructor compacto: validación/normalización sin repetir asignaciones
    public Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
        if (amount.scale() > currency.getDefaultFractionDigits())
            throw new IllegalArgumentException("scale inválida para " + currency);
        amount = amount.setScale(currency.getDefaultFractionDigits()); // reasigna el parámetro
    }
    // Los records admiten métodos, statics y factory methods:
    public static Money zero(Currency c) { return new Money(BigDecimal.ZERO, c); }
    public Money plus(Money other) {
        if (!currency.equals(other.currency)) throw new IllegalArgumentException();
        return new Money(amount.add(other.amount), currency);
    }
}
```

**Lo que hay que saber más allá del boilerplate:**
1. **Semántica, no solo sintaxis:** un record declara públicamente "soy una tupla nominal transparente e inmutable". Eso habilita *record patterns* en pattern matching y, a futuro, optimizaciones de Valhalla (value classes). Decir "es como Lombok @Data" es una respuesta junior — @Data genera setters y equals mutable, justo lo contrario.
2. **Inmutabilidad superficial (shallow):** los componentes son `final`, pero si un componente es una `List` mutable, el record no protege nada. Patrón correcto: copiar defensivamente en el constructor compacto (`items = List.copyOf(items)`), que además valida null y es barata si ya era inmutable.
3. **Restricciones:** extiende implícitamente `java.lang.Record` → no puede extender otra clase (sí implementar interfaces, incluso sealed); no puede declarar campos de instancia extra (todo el estado son los componentes); no puede ser abstract. Los componentes no pueden ser volatile/mutables.
4. **Serialización:** los records se deserializan SIEMPRE por el constructor canónico (no por magia de reflection sobre campos), así que las validaciones del constructor compacto se aplican también al deserializar — mejora de seguridad real frente a clases normales. Jackson los soporta sin anotaciones desde 2.12.
5. **Con frameworks:** perfectos como DTOs de API, mensajes Kafka, `@ConfigurationProperties` (constructor binding), projections de Spring Data, claves de mapas. **No** como entidades JPA: Hibernate necesita proxies, instanciación sin argumentos y estado mutable para dirty checking (sí pueden usarse como `@Embeddable` desde Hibernate 6.2+, matiz que suma puntos).
6. **equals/hashCode generados:** basados en TODOS los componentes vía `invokedynamic` (ObjectMethods bootstrap), no en código generado estáticamente — curiosidad de implementación que demuestra profundidad. Si necesitas identidad por un subconjunto de campos (p. ej. solo el id), un record probablemente no es el tipo correcto.

**Cuándo NO:** entidades con identidad y ciclo de vida (JPA), builders con muchos opcionales (un record de 12 componentes posicionales es ilegible — considerar builder + record, o dividir el tipo), tipos donde la representación interna debe poder cambiar sin romper la API pública (los accessors exponen los componentes 1:1).

---

## 13. Sealed classes + pattern matching: ¿cómo cambian el diseño de dominio en Java moderno?
**Categoría:** Lenguaje moderno · **Tipo:** Conceptual

### 📝 Respuesta resumen
`sealed` (Java 17) restringe qué clases pueden implementar/extender un tipo, cerrando la jerarquía. Combinado con records y `switch` con patterns (Java 21), habilita tipos suma (ADTs) con *exhaustividad verificada por el compilador*: si añades un subtipo, todos los switch sin default dejan de compilar. Esto sustituye al patrón Visitor y a los enums-con-campos para modelar resultados, eventos y estados de dominio.

### 📖 Respuesta detallada
```java
public sealed interface PaymentResult
        permits PaymentResult.Approved, PaymentResult.Declined, PaymentResult.Pending {

    record Approved(String authCode, Instant at) implements PaymentResult {}
    record Declined(String reason, boolean retryable) implements PaymentResult {}
    record Pending(String checkUrl) implements PaymentResult {}
}

// Consumo con switch de patterns — exhaustivo, sin default:
String describe(PaymentResult result) {
    return switch (result) {
        case Approved(String code, Instant at) -> "OK " + code + " @ " + at;   // record pattern
        case Declined(String reason, boolean retryable) when retryable          // guarded pattern
                -> "Reintentable: " + reason;
        case Declined(String reason, boolean ignored) -> "Definitivo: " + reason;
        case Pending p -> "Verificar en " + p.checkUrl();
    };
}
```

**Puntos que debes articular:**

1. **Exhaustividad como herramienta de mantenimiento:** sin `default`, añadir `Refunded` a la jerarquía rompe la compilación de cada `switch` — el compilador te lleva a todos los sitios que deben decidir qué hacer. Con `default` (o con if/else instanceof) ese cambio pasa silenciosamente y el bug aparece en runtime. Regla senior: **en jerarquías sealed, evita `default`**.
2. **Reemplaza al Visitor:** el doble dispatch del Visitor existía para obtener exhaustividad y "métodos por caso" sin instanceof. El switch con patterns lo hace con una fracción del código y sin acoplar la jerarquía a la interfaz visitante.
3. **Reglas de sealed:** los subtipos permitidos deben estar en el mismo módulo (o paquete si no hay módulos); cada subtipo debe declararse `final`, `sealed` (para seguir restringiendo) o `non-sealed` (reabre la extensión — útil para puntos de extensión controlados). Las clases `record` son implícitamente final, por eso el combo records+sealed es tan natural.
4. **Detalles de pattern matching:** los *record patterns* deconstruyen anidado (`case Shipment(Address(String city, var zip), var items)`); `when` añade guardas; el orden de los `case` importa (dominancia: un patrón más general antes que uno específico no compila); `case null` es explícito — sin él, un null lanza NPE en el switch.
5. **Uso real en microservicios:** modelar eventos de Kafka (`sealed interface OrderEvent permits Created, Paid, Cancelled`) da deserialización y handling exhaustivo por tipo; modelar errores como datos (`Result<T>` casero con `Ok/Err`) en lugar de excepciones para flujos de negocio esperables; máquinas de estados donde los estados llevan datos distintos (imposible con enums).

**Errores comunes:** poner `default` "por si acaso" (mata la exhaustividad); usar sealed para todo (si la jerarquía debe ser extensible por otros equipos/módulos, sealed es un obstáculo); confundir sealed con inmutabilidad (sealed restringe la *extensión*, no la mutación).

**Qué espera el entrevistador:** que expliques el valor (ADTs + exhaustividad) y no solo la sintaxis, la comparación con Visitor/enums, y un ejemplo de dominio real donde el compilador te protege al evolucionar el modelo.

---

## 14. Streams paralelos: ¿cuándo ayudan, cuándo perjudican y cuáles son sus pitfalls?
**Categoría:** Streams / Concurrencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
`parallelStream()` trocea la fuente con un `Spliterator` y ejecuta en el `ForkJoinPool.commonPool()`. Solo compensa con: datos grandes, operación por elemento costosa y CPU-bound, fuente que se divide bien (ArrayList/array sí, LinkedList/iterator no) y sin operaciones con estado. Pitfalls: commonPool compartido y dimensionado por cores (desastroso con I/O y en contenedores), overhead que supera al beneficio en colecciones pequeñas, efectos laterales no sincronizados, y coste oculto de operaciones dependientes del orden (`limit`, `findFirst`, `sorted`).

### 📖 Respuesta detallada
**Modelo de decisión (el "NQ model" que cita Brian Goetz):** paraleliza si `N × Q > ~10 000`, donde N = elementos y Q = coste por elemento. Filtrar 500 strings no se beneficia jamás; aplicar un modelo de scoring costoso a 100 000 registros sí.

**Pitfalls concretos con código:**

1. **I/O en parallel stream — el más grave en microservicios:**
```java
// MAL: bloquea los ~cores-1 hilos del commonPool de TODA la JVM
List<Price> prices = skus.parallelStream()
    .map(sku -> priceClient.fetch(sku))   // HTTP bloqueante
    .toList();
```
Cualquier otro parallel stream o `CompletableFuture` sin executor de la JVM se degrada a la vez. En un pod con limit de 2 CPUs, el commonPool tiene 1 hilo: no hay paralelismo ninguno y sí todo el riesgo. Solución: executor dedicado con `CompletableFuture`, o virtual threads.

2. **Efectos laterales y estado compartido:**
```java
// MAL: ArrayList no es thread-safe → resultados corruptos o ArrayIndexOutOfBounds
List<String> out = new ArrayList<>();
data.parallelStream().map(this::transform).forEach(out::add);

// BIEN: dejar la mutabilidad al collector (usa contenedores por hilo + merge)
List<String> out2 = data.parallelStream().map(this::transform).toList();
```
Los collectors están diseñados para paralelismo (acumulan por segmento y combinan); `forEach` con estado compartido es siempre un bug. Igual con `peek` para mutar, o lambdas que tocan campos.

3. **Fuentes que se dividen mal:** `ArrayList`, arrays e `IntStream.range` tienen spliterators que parten en mitades exactas O(1). `LinkedList`, `Stream.iterate`, `BufferedReader.lines()` y los iteradores se dividen fatal (troceo secuencial) — el paralelismo se evapora. También `boxed` streams (`Stream<Integer>` vs `IntStream`) añaden presión de GC que domina el tiempo total.

4. **Orden cuesta:** `findFirst()`, `limit(n)` y `sorted()` sobre streams ordenados obligan a coordinar entre hilos; `findAny()` o `unordered()` liberan esa restricción cuando el orden no importa. `forEachOrdered` serializa la salida.

5. **Reducciones incorrectas:** `reduce` exige operación **asociativa** y elemento identidad real. `reduce(0, (a,b) -> a - b)` da resultados distintos en paralelo (resta no asociativa); usar acumuladores no conmutativos o identidades falsas produce bugs que solo aparecen en paralelo.

6. **Medir, no suponer:** la respuesta senior siempre incluye JMH. La mayoría de los `parallelStream()` que se encuentran en code reviews son más lentos que el secuencial y además acoplan el throughput del servicio al commonPool.

**Qué espera el entrevistador:** el criterio N×Q, el problema del commonPool en contenedores, la disciplina de "sin efectos laterales, collectors para mutabilidad", y que menciones que en un microservicio típico el paralelismo útil casi siempre es de I/O concurrente (CompletableFuture/virtual threads), no de CPU con parallel streams.

---

## 15. Streams secuenciales: pitfalls avanzados que delatan a un desarrollador junior
**Categoría:** Streams · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los errores finos: streams son de un solo uso y lazy (nada corre sin operación terminal); `Files.lines`/streams sobre recursos deben cerrarse; boxing implícito en pipelines numéricos; `Collectors.groupingBy` no admite claves null y `toMap` lanza en duplicados y valores null; `peek` no es para lógica (puede eliminarse por optimización); y abusar de streams donde un for es más claro o donde las excepciones checked ensucian todo.

### 📖 Respuesta detallada
**1. Laziness y un solo uso:**
```java
Stream<String> s = names.stream().filter(n -> n.startsWith("A"));
s.count();
s.toList();   // IllegalStateException: stream has already been operated upon or closed
```
Y el clásico: un `filter` con efecto lateral "no se ejecuta" porque nadie añadió operación terminal. Corolario para code review: nunca devolver `Stream` de un método público salvo API deliberadamente lazy — devuelve `List`.

**2. Recursos:**
```java
// MAL: file descriptor leak (el stream de líneas mantiene el fichero abierto)
List<String> lines = Files.lines(path).filter(l -> !l.isBlank()).toList();

// BIEN:
try (Stream<String> stream = Files.lines(path)) {
    return stream.filter(l -> !l.isBlank()).toList();
}
```
En un servicio que procesa uploads, este leak agota los file descriptors del pod en horas ("Too many open files").

**3. `toMap` — la mina más pisada:**
```java
// Lanza IllegalStateException a la primera clave duplicada:
users.stream().collect(Collectors.toMap(User::email, u -> u));
// Y lanza NPE si algún VALOR es null (documentado, pero sorprende a todos).

// Correcto: política de merge explícita
users.stream().collect(Collectors.toMap(
    User::email, Function.identity(),
    (first, second) -> second,        // última gana — decisión consciente
    LinkedHashMap::new));             // y tipo de mapa si el orden importa
```

**4. Boxing silencioso:** `list.stream().map(x -> x * 2).reduce(0, Integer::sum)` crea millones de `Integer`. Con volumen: `mapToInt(...).sum()`. Igualmente `Stream<Long>` en IDs — `mapToLong` y `LongStream.range` existen por algo. En hot paths medidos con async-profiler, el boxing aparece como asignación dominante.

**5. `peek` no es un hook fiable:** está especificado para debugging; el pipeline puede eliminarlo si puede probar que no necesita los elementos (p. ej. `count()` sobre una fuente SIZED con solo peek en medio no recorre elementos). Lógica de negocio en `peek` = bug latente.

**6. Excepciones checked:** las lambdas de Stream no declaran checked exceptions; el patrón envolver-en-RuntimeException dentro de cada `map` produce pipelines ilegibles. Alternativas: extraer método que traduzca la excepción, usar un tipo Result (sealed interface Ok/Err) y particionar, o simplemente un for-loop — "streams no son un fin; si el for con try/catch es más claro, es mejor código".

**7. `Optional` mal usado en pipelines:** `findFirst().get()` sin comprobar; `Optional.of(nullable)` (NPE) vs `ofNullable`; campos/parámetros `Optional` (anti-patrón; es un tipo de retorno). Y `orElse(computeExpensive())` evalúa SIEMPRE el argumento — usar `orElseGet(() -> ...)` para costes perezosos.

**8. `groupingBy` con clave null lanza NPE** — típico con getters que pueden devolver null; primero `filter(Objects::nonNull)` o mapear a un valor sentinel.

**Qué espera el entrevistador:** conocimiento demostrado con los casos exactos (`toMap`, recursos, boxing), y criterio: los streams expresan transformaciones de datos declarativas; cuando el pipeline necesita índices, estado mutable, break temprano complejo o excepciones checked, el for clásico es la elección senior.
