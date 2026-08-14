# Módulo 2 · Concurrencia y el Java Memory Model

> **Curso 01 · Java senior** · 180 min · El módulo más rentable del curso

## Por qué esto importa en la entrevista

La concurrencia es donde el entrevistador puede hacerte preguntas infinitas y ver hasta dónde llegas. Y es donde más candidatos repiten mantras sin entenderlos ("uso `volatile` para que sea thread-safe"). Si dominas **visibilidad vs atomicidad**, el resto se deduce.

## Modelo mental: dos problemas distintos, no uno

```
ATOMICIDAD        "count++ son 3 operaciones: leer, sumar, escribir"
                  → dos hilos pueden entrelazarlas y perder incrementos
                  → se resuelve con locks o CAS

VISIBILIDAD/ORDEN "el hilo B puede no ver nunca lo que escribió A,
                   o verlo en otro orden"
                  → por caches de CPU, store buffers y reordenamiento del JIT
                  → se resuelve con happens-before (volatile, synchronized, ...)
```

Casi todo error de concurrencia es no distinguir estos dos ejes. `volatile` da visibilidad y orden, **no** atomicidad. `synchronized` da ambos. `AtomicLong` da atomicidad sobre *una* variable y visibilidad.

## happens-before: la regla que define qué puedes ver

El JMM (JLS §17.4) dice que si la acción A *happens-before* B, entonces B ve todo lo que hizo A. Las fuentes que debes citar de memoria:

1. **Orden de programa** dentro de un hilo.
2. **Monitor:** `unlock` de un monitor hb cualquier `lock` posterior del mismo monitor.
3. **Volatile:** escritura volatile hb cualquier lectura posterior de esa variable — y arrastra consigo todo lo escrito *antes*.
4. **Thread:** `t.start()` hb todo lo que haga `t`; todo lo de `t` hb el retorno de `t.join()`.
5. **Campos `final`:** correctamente construidos, son visibles tras la publicación del objeto (base de la inmutabilidad segura).
6. **Transitividad:** A hb B, B hb C ⇒ A hb C.

Corolario clave: **las estructuras de `java.util.concurrent` ya establecen happens-before** entre quien mete y quien saca (una `BlockingQueue`, un `Executor`, un `CompletableFuture`). Por eso en código de aplicación casi nunca necesitas `volatile` a mano: si pasas los datos por una cola concurrente, la visibilidad viene incluida.

```java
class Roto {
    private boolean listo = false;   // sin volatile
    private int valor = 0;
    void escritor() { valor = 42; listo = true; }          // puede reordenarse
    void lector()   { while (!listo) {}                     // puede no salir NUNCA
                      System.out.println(valor); }          // puede imprimir 0
}
```

Dos fallos independientes: el JIT puede sacar la lectura del bucle (`if (!listo) while(true);`) y las escrituras pueden no propagarse en ese orden. En x86 quizá "funciona"; en ARM (Graviton, Apple Silicon) explota. **Un data race es un bug aunque no lo veas.**

## Herramientas, en orden de preferencia

| Necesidad | Herramienta | Nota |
|---|---|---|
| Flag de parada, publicar referencia inmutable | `volatile` | barato; nada de read-modify-write |
| Contador, acumulador | `AtomicLong` / `LongAdder` | `LongAdder` gana con alta contención (particiona celdas) |
| Invariante entre varias variables | `synchronized` / `ReentrantLock` | el lock protege *invariantes*, no variables sueltas |
| Estructura compartida | `ConcurrentHashMap`, `CopyOnWriteArrayList`, colas de `j.u.c.` | elige por patrón de lectura/escritura |
| Coordinación | `CountDownLatch`, `Semaphore`, `CyclicBarrier`, `Phaser` | |
| Nada compartido | **inmutabilidad + confinamiento** | la mejor solución de concurrencia es no tenerla |

**`ReentrantLock` vs `synchronized`:** el segundo es más simple y hoy igual de rápido (biased locking se retiró, pero el JIT elide locks sin contención); el primero aporta `tryLock` con timeout, interrumpibilidad, equidad opcional y múltiples `Condition`. Con virtual threads, `synchronized` podía *pinnear* el carrier thread (mitigado en JDK 24; en 21 es real), así que en código que bloquea dentro de secciones críticas, `ReentrantLock` es más seguro.

**`ConcurrentHashMap`:** sin lock global; usa CAS para insertar en bins vacíos y `synchronized` sobre la cabeza del bin en colisión. Sus operaciones compuestas atómicas son `computeIfAbsent`, `merge`, `putIfAbsent` — usarlas es la diferencia entre thread-safe y "casi". Cuidado: `computeIfAbsent` con una función que vuelve a tocar el mismo mapa puede bloquear o corromper; y `size()` es una estimación.

**`HashMap` compartido sin sincronizar** puede, además de perder datos, entrar en bucle infinito durante un resize concurrente (clásico en JDK 7; en 8+ ya no hay lista circular, pero sigue corrompiéndose y perdiendo entradas). Es una gran anécdota: *CPU al 100% en un hilo sin razón aparente*.

## Pools de hilos: lo que de verdad preguntan

```java
new ThreadPoolExecutor(
    core, max, keepAlive, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(1000),          // ¡LIMITADA!
    new ThreadFactoryBuilder().setNameFormat("pagos-%d").build(),
    new ThreadPoolExecutor.CallerRunsPolicy() // backpressure
);
```

Puntos que suman:

- **Colas ilimitadas = OOM diferido.** `Executors.newFixedThreadPool` usa `LinkedBlockingQueue` sin límite: el pool nunca crece a `max`, y la cola se come el heap. Es la razón de "no uses los factories de `Executors`".
- **Nombra tus hilos.** Un thread dump con `pool-3-thread-7` no dice nada; con `pagos-7` lo dice todo.
- **Política de rechazo = tu estrategia de backpressure.** `CallerRunsPolicy` frena al productor (a menudo lo que quieres); `AbortPolicy` te deja decidir; descartar en silencio casi nunca es correcto.
- **Un pool por tipo de trabajo** (bulkhead): no mezcles llamadas a un proveedor lento con trabajo rápido de CPU.
- **Dimensionado:** CPU-bound ≈ nº de núcleos; I/O-bound ≈ núcleos × (1 + espera/servicio) — o, más práctico, por la ley de Little (ver [curso 00 módulo 5](../00-fundamentos-distribuidos/05-latencia-y-colas.md)).
- **`ForkJoinPool.commonPool()`** lo comparten los streams paralelos y muchos `CompletableFuture` sin executor explícito. Una tarea bloqueante ahí congela a toda la aplicación. **Nunca hagas I/O en el common pool.**

## `CompletableFuture` sin dispararte en el pie

```java
CompletableFuture
    .supplyAsync(() -> clienteA.buscar(id), ioPool)      // ← SIEMPRE tu executor
    .thenCombine(CompletableFuture.supplyAsync(() -> clienteB.buscar(id), ioPool),
                 Resultado::unir)
    .orTimeout(800, MILLISECONDS)                        // JDK 9+
    .exceptionally(ex -> Resultado.degradado())          // fallback explícito
    .thenAccept(this::responder);
```

Pitfalls que debes nombrar: `join()` dentro de una cadena (bloquea un hilo del pool y puede deadlockear), olvidar el executor (cae en el common pool), tragarse excepciones al no encadenar `exceptionally`/`handle`, `thenApply` vs `thenApplyAsync` (dónde se ejecuta la continuación: en el hilo que completó vs en el pool), y que `allOf` no propaga resultados (hay que recogerlos después).

## Virtual threads (Loom, JDK 21+)

- Son hilos gestionados por la JVM que se montan sobre *carrier threads* de un `ForkJoinPool`. Al bloquearse en I/O, el virtual thread se desmonta y libera el carrier: **millones de hilos concurrentes** con estilo de código bloqueante.
- Cambian el modelo mental: se acabó el "dimensiona el pool"; ahora se limita la **concurrencia** con un `Semaphore` donde haga falta (los recursos externos siguen siendo finitos).
- **Pinning:** si el virtual thread bloquea dentro de un `synchronized` o en una llamada nativa, no puede desmontarse y ocupa el carrier. Diagnóstico: `-Djdk.tracePinnedThreads=full` (JDK 21). Mitigación: `ReentrantLock`.
- **No aceleran cómputo**: para CPU-bound siguen valiendo los pools clásicos.
- No mezclar con `ThreadLocal` como caché (un valor por tarea × millones = memoria); usar `ScopedValue`.

**Structured concurrency** (`StructuredTaskScope`) resuelve lo que `ExecutorService` no: si una subtarea falla, se cancelan las hermanas; el scope no se cierra hasta que todas terminan; y el árbol de tareas queda reflejado en los dumps.

```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    var usuario = scope.fork(() -> usuarios.buscar(id));
    var pedidos = scope.fork(() -> pedidos.buscar(id));
    scope.join().throwIfFailed();          // ambas o ninguna
    return new Vista(usuario.get(), pedidos.get());
}
```

## Errores comunes que delatan a un no-senior

- "Le puse `volatile` para hacerlo thread-safe" en un `contador++`.
- Usar `Executors.newFixedThreadPool` en producción y no saber que la cola es ilimitada.
- Bloquear en el common pool de ForkJoin (incluye `parallelStream()` con I/O dentro).
- Sincronizar sobre `this` o sobre objetos públicos (cualquiera puede lockear tu monitor).
- Double-checked locking sin `volatile`.
- Creer que virtual threads sustituyen a los pools para todo.
- No saber sacar un thread dump ni leer un deadlock en él.

## 🧪 Laboratorio

1. **Reproduce el data race:** clase `Roto` de arriba con `-XX:+UnlockDiagnosticVMOptions`. Ejecútala en x86 y, si puedes, en ARM. Añade `volatile` y observa la diferencia.
2. **Lost update:** 10 hilos × 100.000 `contador++`. Compara `int`, `volatile int`, `AtomicLong`, `LongAdder` y `synchronized`. Mide tiempo y resultado. **Grafícalo**: es la mejor forma de recordar cuándo `LongAdder`.
3. **Deadlock a propósito:** dos locks tomados en orden inverso. Sácalo con `jcmd <pid> Thread.print` y localiza el bloque "Found one Java-level deadlock". Arréglalo imponiendo orden global de adquisición.
4. **Pool agotado:** pool de 10 hilos llamando a un servicio con 3 s de latencia, cola ilimitada, 200 rps. Observa el crecimiento del heap y del tiempo de espera. Arregla con cola limitada + `CallerRunsPolicy` + timeout.
5. **Virtual threads:** el mismo servicio I/O-bound con pool de plataforma vs `Executors.newVirtualThreadPerTaskExecutor()`. Mide throughput y memoria. Luego mete un `synchronized` alrededor del I/O y detecta el pinning con `-Djdk.tracePinnedThreads=full`.

**Entregable:** la tabla comparativa del punto 2 y el thread dump comentado del punto 3.

## ✅ Autoevaluación

1. Explica happens-before y da tres formas de establecerlo.
2. ¿Por qué `volatile` no basta para un contador? ¿Y qué usarías con 64 hilos incrementando?
3. ¿Qué tiene de malo `Executors.newFixedThreadPool(10)`?
4. Un `parallelStream()` con una llamada HTTP dentro: ¿qué puede salir mal?
5. ¿Qué es el pinning en virtual threads y cómo lo detectas?
6. ¿Cómo lees un deadlock en un thread dump y cómo lo previenes por diseño?
7. `ConcurrentHashMap`: ¿por qué `get` no bloquea y qué garantiza `computeIfAbsent`?

## 🎯 Preguntas del banco que ya puedes responder

- [`java-microservicios/01-java-core-avanzado.md`](../../java-microservicios/01-java-core-avanzado.md) — 3–11 (JMM, volatile/synchronized/atomics, final, CompletableFuture, ForkJoin, Loom, structured concurrency, HashMap, ConcurrentHashMap), 14 (streams paralelos)
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 3 (thread pool exhaustion), 4 (deadlock)

---

**Anterior:** [Módulo 1](01-jvm-memoria-y-gc.md) · **Siguiente:** [Módulo 3 · Spring por dentro y transacciones](03-spring-por-dentro-y-transacciones.md)
