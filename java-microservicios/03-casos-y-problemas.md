# Casos y Problemas de Producción — Preguntas de Entrevista Senior

## 1. Memory leak en producción: el heap crece hasta OOM cada 3 días
**Categoría:** JVM / Troubleshooting · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Primero confirmar el leak con métricas: heap usado *después de cada Full GC* creciendo monótonamente (si baja tras GC no es leak, es presión normal). Capturar heap dump (`jmap`/`jcmd`, o `-XX:+HeapDumpOnOutOfMemoryError` ya configurado), analizarlo con Eclipse MAT: dominator tree + leak suspects para encontrar qué retiene los objetos y desde qué GC root. Sospechosos habituales: caches sin límite, colecciones static, ThreadLocals no limpiados en pools, listeners no desregistrados. Fix + test de regresión + alerta sobre tendencia post-GC.

### 📖 Respuesta detallada
**Escenario:** un servicio Spring Boot con 4 GB de heap muere con `java.lang.OutOfMemoryError: Java heap space` cada ~72 h. Tras el reinicio todo va bien. El equipo "soluciona" reiniciando cada noche.

**Diagnóstico paso a paso:**
1. **Confirmar que es leak:** en Grafana, graficar `jvm_memory_used_bytes{area="heap"}` muestreado justo tras GC (o `jvm.gc.live.data.size` de Micrometer, que es exactamente el heap vivo tras Full GC). Un diente de sierra con suelos ascendentes = leak. Suelos planos con picos = solo presión de tráfico.
2. **Capturar evidencia sin matar el servicio:**
```bash
# Siempre configurado de antemano en prod:
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps
# Manual (CUIDADO: pausa STW proporcional al heap, sacar el pod del LB antes):
jcmd <pid> GC.heap_dump /dumps/heap-$(date +%s).hprof
# Menos invasivo para una primera hipótesis:
jcmd <pid> GC.class_histogram | head -30    # top clases por instancias/bytes
```
Idealmente DOS dumps separados por horas: el diff muestra qué crece.
3. **Análisis con Eclipse MAT:** abrir el `.hprof` → *Leak Suspects Report* como primer barrido → **dominator tree** (qué objetos retienen más memoria transitivamente) → sobre el sospechoso, *Path to GC Roots* (excluyendo weak/soft refs) para ver QUIÉN lo mantiene vivo. La respuesta siempre tiene la forma: "un `ConcurrentHashMap` referenciado por el campo static `SESSIONS` de `FooManager` retiene 3.2 GB".
4. **Hipótesis típicas y cómo se ven en MAT:**
   - **Cache sin bound:** `HashMap`/`ConcurrentHashMap` gigante desde un singleton. Fix: Caffeine con `maximumSize`/`expireAfterWrite`. (Un "cache" hecho con HashMap es un leak con autoestima.)
   - **ThreadLocal en pools:** valores retenidos por `ThreadLocalMap` de los workers de Tomcat que nunca mueren. En MAT: `Thread` → `threadLocals`. Fix: `remove()` en un finally / filtro.
   - **Listeners/callbacks no desregistrados**, colecciones static que solo crecen (métricas caseras con cardinalidad infinita: un `Map<String, Counter>` con un userId como clave).
   - **Hibernate:** session/EntityManager de larga vida acumulando el persistence context (miles de entidades en L1 cache) — típico en batchs sin `clear()`.
   - **ClassLoader leak** si lo que crece es Metaspace (ver caso 9).
5. **Si no se puede tener dump** (tamaño, datos sensibles): async-profiler en modo alloc (`asprof -e alloc -d 60 -f alloc.html <pid>`) muestra QUIÉN aloca más — no prueba retención, pero orienta; y JFR con `OldObjectSample` está diseñado exactamente para leaks con overhead mínimo.

**Solución y prevención:** además del fix puntual — límites en TODO cache, revisar statics mutables en code review, `-XX:+HeapDumpOnOutOfMemoryError` como estándar de plataforma, alerta sobre `jvm.gc.live.data.size` con pendiente positiva sostenida, y prueba de carga de larga duración (soak test) en el pipeline para cambios de manejo de estado. Lo que el entrevistador evalúa: método (confirmar → capturar → dominator tree → GC roots), no adivinar; y saber que reiniciar cada noche no es una solución sino una deuda con interés.

---

## 2. Latencia p99 alta en un servicio Spring Boot con p50 normal: ¿cómo lo investigas?
**Categoría:** Performance · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
p50 sano + p99 malo = un subconjunto de peticiones sufre algo intermitente: pausas GC, contención en pools (conexiones/hilos), un downstream con cola, locks, o requests patológicamente pesadas. El método: segmentar la métrica por endpoint/instancia para localizar, correlacionar los picos con pausas de GC y métricas de saturación (HikariCP pending, cola de Tomcat), examinar trazas distribuidas de las requests lentas exactas (tail-based sampling), y perfilar con async-profiler en wall-clock mode si lo anterior no cierra. Arreglar la causa dominante y repetir: la latencia de cola se pela por capas.

### 📖 Respuesta detallada
**Escenario:** SLO de 300 ms p99; el dashboard muestra p50=40 ms, p95=90 ms, p99=2.5 s. Sucede a cualquier hora, algo peor en picos.

**Paso 1 — Segmentar antes de teorizar:** `http_server_requests` por `uri`, `status`, `pod`. Tres resultados posibles que cambian todo: (a) un solo endpoint es lento → problema de esa lógica (query, payload); (b) todos los endpoints, una sola instancia → problema local (GC, noisy neighbor, conexión); (c) todos los endpoints, todas las instancias → recurso compartido (BD, downstream, GC sistémico por presión uniforme).

**Paso 2 — Las tres causas más frecuentes, con su comprobación:**
1. **GC:** superponer `jvm_gc_pause_seconds_max` con los picos de latencia. Si correlan: analizar logs de GC (¿young frecuentes por allocation rate? ¿mixed largos? ¿humongous?) — se convierte en el caso 12. Señal delatora: los picos afectan a requests de TODOS los endpoints a la vez, en ventanas de la duración de la pausa.
2. **Espera de conexión (HikariCP):** `hikaricp_connections_pending > 0` y `hikaricp_connections_acquire_seconds` con cola. p99 = `connectionTimeout` truncado o espera de pool. Causa raíz: pool pequeño, transacciones largas, o queries lentas que retienen conexiones (ver caso 13).
3. **Downstream lento:** las trazas lo muestran inmediatamente — por eso el paso 3.

**Paso 3 — Trazas de las requests lentas exactas:** con tail-based sampling (o exemplars de Prometheus, que enlazan un bucket del histograma con un traceId concreto) abrir 10 trazas > 1 s y mirar dónde se va el tiempo: ¿un span de JDBC de 2 s? ¿un gap SIN spans (tiempo en cola del servidor o GC)? ¿fan-out secuencial que debía ser paralelo? Un gap entre "request recibida" y "primer span de trabajo" apunta a cola de Tomcat/espera de hilo — medir `tomcat_threads_busy` vs `server.tomcat.threads.max`.

**Paso 4 — Profiling si hace falta:** `asprof -e wall -t -d 60 -f profile.html <pid>` (wall-clock, no cpu: las esperas también cuentan) sobre una instancia afectada. El flamegraph con hilos separados muestra locks (`park`, `monitorenter`), I/O y hotspots reales. JFR como alternativa siempre-activa (`-XX:StartFlightRecording=maxsize=256m`) permite mirar *hacia atrás* cuando ocurrió el pico.

**Causas menos obvias que un senior menciona:** logging síncrono a disco lento (appender sin async, picos al rotar), DNS resolviendo en cada request (TTL 0, sin cache), TLS handshakes por pool de conexiones HTTP mal dimensionado (`maxConnections` bajo → conexiones nuevas constantes), deserialización de payloads enormes ocasionales (un cliente que manda 20 MB), safepoints largos no-GC (`-Xlog:safepoint`), y CPU throttling de Kubernetes (`container_cpu_cfs_throttled_periods_total` — el pod tiene picos de uso y el CFS lo estrangula justo bajo carga).

**Prevención:** SLO con burn-rate alerts, exemplars conectando métricas↔trazas, timeouts y pools dimensionados con números (Little's law: concurrencia = throughput × latencia), y tests de carga que midan p99 —no medias— antes de cada release mayor. El entrevistador busca método sistemático (segmentar → correlacionar → trazar → perfilar) y vocabulario de causas concretas, no "revisaría los logs".

---

## 3. Thread pool exhaustion: Tomcat deja de responder pero la CPU está al 10%
**Categoría:** Concurrencia / Spring · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
CPU baja + servicio colgado = hilos bloqueados esperando, no trabajando. Un thread dump (`jstack`/`jcmd Thread.print`) lo confirma en minutos: los 200 hilos de Tomcat en WAITING/BLOCKED, y el stack dice en qué (HikariCP `getConnection`, un HTTP client sin timeout, un lock). La cadena causal típica: downstream lento → hilos esperando su respuesta → pool de Tomcat agotado → hasta el health check deja de responder → Kubernetes mata el pod y el problema migra. Solución inmediata: restaurar el downstream o abrir el breaker; solución real: timeouts agresivos en TODO I/O, bulkheads por dependencia y circuit breakers.

### 📖 Respuesta detallada
**Escenario:** alertas de health check fallando en cascada; los pods se reinician en bucle; CPU al 10%, memoria normal. Los logs de aplicación... simplemente se detienen.

**Diagnóstico paso a paso:**
1. **Thread dump inmediato, tres veces separadas por ~10 s** (para distinguir espera transitoria de bloqueo estable):
```bash
jcmd <pid> Thread.print > td1.txt   # o kill -3 <pid> (va a stdout del contenedor)
```
2. **Leerlo con método:** contar hilos `http-nio-8080-exec-*` por estado. El patrón del caso:
```text
"http-nio-8080-exec-187" #245 WAITING on condition
   at jdk.internal.misc.Unsafe.park
   at java.util.concurrent.SynchronousQueue...
   at com.zaxxer.hikari.util.ConcurrentBag.borrow
   at com.zaxxer.hikari.pool.HikariPool.getConnection   ← 200/200 hilos AQUÍ
```
   o bien todos dentro de `SocketInputStream.read` / `HttpClient` hacia el mismo host (downstream lento sin timeout), o `BLOCKED` sobre el mismo monitor (lock caliente → caso 4 si hay ciclo). Herramientas: fastthread.io o `krakatau`-style scripts para agregar; a mano, `grep -c 'HikariPool.getConnection'`.
3. **Confirmar la cadena con métricas:** `tomcat_threads_busy` clavado en el máximo (200), `hikaricp_connections_pending` alto o latencia del downstream disparada en sus dashboards. La secuencia temporal (¿qué se saturó primero?) identifica al culpable original.
4. **Por qué muere el health check:** `/actuator/health` entra por el MISMO pool de Tomcat. Si los 200 hilos están secuestrados, el liveness probe falla y Kubernetes reinicia un pod que estaba "sano pero esperando" — reinicio que además pierde el estado de warm-up y empeora la tormenta. Mitigación específica: separar liveness (proceso vivo) de readiness (dependencias), y nunca hacer que liveness dependa de downstreams.

**Solución estructural (lo que el entrevistador quiere oír):**
1. **Timeouts en absolutamente todo I/O**, y menores que el timeout del que te llama:
```java
// RestClient con timeouts explícitos (los defaults de muchas libs son infinitos o enormes)
var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(500)).build());
factory.setReadTimeout(Duration.ofSeconds(2));
// HikariCP: connectionTimeout=2000 en vez del default 30000 → falla rápido y visible
```
2. **Bulkheads:** un pool/semáforo por dependencia (Resilience4j `Bulkhead`), de modo que "recomendaciones lento" pueda agotar SUS 20 permisos sin tocar los hilos que sirven el checkout. Sin bulkhead, cualquier dependencia puede secuestrar el 100% de Tomcat.
3. **Circuit breaker con slow-call detection** (una dependencia lenta sin errores no abre un breaker que solo cuenta excepciones).
4. **Dimensionado consciente:** 200 hilos con 50 conexiones de BD garantiza 150 hilos esperando bajo carga de BD — los números deben ser coherentes entre capas (Little's law otra vez).
5. **Virtual threads** (`spring.threads.virtual.enabled=true`) eliminan el límite de hilos, pero OJO: no eliminan el problema, lo desplazan — ahora 10 000 requests esperan al downstream y agotan el pool de HikariCP o al propio downstream. Backpressure (limitar concurrencia con semáforos, rate limiting de entrada) sigue siendo necesario.

**Prevención:** alertas sobre `tomcat_threads_busy / max > 0.8` sostenido y `hikaricp_connections_pending > 0`, chaos testing de latencia (Toxiproxy: +5 s al downstream y verificar que el servicio degrada elegante), y revisión de timeouts como checklist de PR para todo cliente nuevo.

---

## 4. Deadlock en producción: dos funcionalidades se congelan a la vez de forma intermitente
**Categoría:** Concurrencia · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Un deadlock clásico de JVM lo detecta el propio thread dump: `jstack`/`jcmd Thread.print` imprime "Found one Java-level deadlock" con el ciclo exacto de hilos y monitores. Si es con `ReentrantLock` también sale (ownable synchronizers). Los deadlocks de BD los detecta el motor (Postgres/MySQL abortan una víctima con error 40P01/1213). La solución universal: ordenar la adquisición de locks globalmente, reducir su alcance, o usar `tryLock` con timeout. Los "livelocks" y deadlocks de pool (todas las conexiones esperando conexiones) no aparecen como deadlock formal y hay que reconocerlos por patrón.

### 📖 Respuesta detallada
**Escenario:** intermitentemente, las transferencias entre cuentas se quedan colgadas y a la vez el job de recálculo de saldos. Reiniciando se arregla... hasta la próxima.

**Diagnóstico:**
1. **Thread dump.** La JVM hace la detección por ti:
```text
Found one Java-level deadlock:
=============================
"transfer-exec-3":
  waiting to lock monitor 0x00007f... (object 0x000000076b..., a com.acme.Account),
  which is held by "recalc-job-1"
"recalc-job-1":
  waiting to lock monitor 0x00007f... (object 0x000000076c..., a com.acme.Account),
  which is held by "transfer-exec-3"
```
   También visible con `jconsole`/JMC (pestaña Threads → Detect Deadlock) y programáticamente con `ThreadMXBean.findDeadlockedThreads()` (útil para un health check que lo reporte). Con `ReentrantLock` el dump lo muestra en "Locked ownable synchronizers".
2. **Reconstruir el ciclo en el código:** transfer bloquea cuenta A→B por orden de parámetros; el job bloquea por orden de iteración B→A. Dos órdenes distintos sobre los mismos recursos = deadlock esperando su carrera.

**El fix canónico — orden global de adquisición:**
```java
void transfer(Account from, Account to, long amount) {
    // Orden total por ID: TODOS los caminos del código bloquean igual
    Account first = from.id() < to.id() ? from : to;
    Account second = first == from ? to : from;
    synchronized (first) {
        synchronized (second) {
            from.debit(amount);
            to.credit(amount);
        }
    }
}
```
Alternativas según contexto: `tryLock` con timeout y retry con backoff+jitter (convierte el deadlock en contención recuperable — cuidado con el livelock: dos hilos soltando y reintentando eternamente en sincronía, de ahí el jitter); reducir la granularidad (¿de verdad hacen falta dos locks, o una cola single-writer por cuenta?); o llevar la concurrencia a la BD con `SELECT FOR UPDATE` ordenado.

**Variantes que el entrevistador puede sondear:**
1. **Deadlock de BD:** Postgres lo detecta (~1 s) y mata una víctima con `deadlock detected`. Mismo remedio: ordenar updates (p. ej. `ORDER BY id` en updates masivos, actualizar filas en orden consistente entre servicios), transacciones cortas, índices que eviten lock escalation/gap locks (MySQL). El código debe REINTENTAR la transacción víctima — un deadlock de BD esporádico es normal; no manejarlo, no.
2. **Deadlock de pool (no aparece como deadlock formal):** todos los hilos tienen una conexión y esperan una SEGUNDA (por `REQUIRES_NEW` anidado o llamadas re-entrantes) — el dump muestra a todos en `HikariPool.getConnection` y ningún ciclo de monitores. Se reconoce por patrón, no por el detector. Fix: eliminar la anidación o dimensionar pool > hilos × conexiones-por-hilo.
3. **Deadlock con `synchronized` + virtual threads pre-JDK 24** (pinning masivo que parece deadlock), y **lock-ordering entre servicios** (dos servicios que se llaman mutuamente con locks tomados — ahí el "detector" eres tú y las trazas).

**Prevención:** minimizar locks compartidos (inmutabilidad, confinamiento a un hilo, colas), jamás llamar código ajeno/alien (callbacks, I/O) con un lock tomado, documentar el orden de locks donde exista más de uno, `tryLock` con timeout en código nuevo con múltiples locks, y tests de concurrencia dirigidos (jcstress para estructuras propias). Señal de seniority: mencionar que el deadlock "bueno" es el que el diseño hace imposible, no el que se detecta rápido.

---

## 5. Consumer lag creciente en Kafka: el consumidor procesa pero cada vez va más atrás
**Categoría:** Kafka · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Lag creciente = tasa de producción > tasa de consumo, o consumo intermitente por rebalances. Diagnóstico: ¿el lag crece en todas las particiones (consumo globalmente lento) o en una (hot partition / consumer atascado)? ¿Hay rebalances frecuentes en los logs (expulsiones por `max.poll.interval.ms`)? Medir el tiempo de proceso por record. Soluciones por orden: acelerar el procesamiento (batching, paralelismo interno, quitar I/O síncrono por record), escalar consumers hasta el número de particiones, y si no basta, más particiones (con migración cuidadosa) o repartir el trabajo pesado a otro pool con pausa/resume del consumer.

### 📖 Respuesta detallada
**Escenario:** el lag del grupo `billing` sobre `orders` (12 particiones) crece 50k mensajes/hora en horas pico y no se recupera de noche del todo. Los consumidores "están vivos".

**Diagnóstico paso a paso:**
1. **Forma del lag:** `kafka-consumer-groups.sh --describe --group billing` (o el dashboard de `kafka_consumergroup_lag`). Tres patrones: (a) lag uniforme en las 12 particiones → throughput global insuficiente; (b) lag solo en 2–3 particiones → hot partitions (caso 15) o un pod degradado (¿ese pod tiene CPU throttling? ¿un GC enfermo?); (c) lag en diente de sierra con caídas a cero → rebalances en bucle.
2. **Descartar el bucle de rebalances** (la causa más traicionera): buscar en logs `Attempt to heartbeat failed`, `member ... has left`, `Rebalance` repetidos. Causa: procesar un batch tarda más que `max.poll.interval.ms` (5 min default) → expulsión → otro pod relee el mismo batch → también excede → el grupo pasa más tiempo rebalanceando que consumiendo, y encima duplica procesamiento. Fix inmediato: bajar `max.poll.records` (500→50) para que cada poll quepa de sobra en el intervalo.
3. **Medir el coste por record:** instrumentar el listener (Micrometer `kafka.listener` en Spring Kafka ya lo da). Si procesar un record cuesta 80 ms y son I/O (una llamada HTTP + un insert), un hilo consume ~12 rec/s: 12 particiones × 12 = 144 rec/s de techo con 12 consumers, frente a picos de producción de 400 rec/s. El lag es aritmética, no misterio.

**Soluciones, en el orden que hay que contarlas:**
1. **Optimizar el procesamiento (siempre primero):** batch de BD (un `INSERT ... ON CONFLICT` de 500 filas en vez de 500 inserts), cache de lookups repetidos, llamadas HTTP en paralelo dentro del batch (virtual threads / CompletableFuture, preservando por-clave el orden si importa), y commit por batch (`AckMode.BATCH`).
2. **Escalar horizontal:** hasta 12 consumers (= particiones). El consumer 13 queda ocioso — límite estructural que hay que verbalizar.
3. **Paralelismo intra-partición (con cuidado):** procesar en un pool interno rompe el orden y complica los commits (offset commiteado sin procesar los anteriores = pérdida en crash). Hacerlo bien: agrupar por clave dentro del batch (orden por clave preservado), commitear solo el mínimo offset completado, y `pause()/resume()` de la partición mientras el pool drena para no exceder `max.poll.interval.ms`. O usar el consumidor paralelo de Confluent (parallel-consumer) que implementa exactamente esto.
4. **Más particiones:** de 12 a 48 — pero las claves se redistribuyen (rompe orden histórico por clave y localidad de caches; los mensajes viejos no se mueven), así que se planifica: idealmente crear un topic nuevo y migrar productores/consumidores de forma controlada.
5. **¿Es necesario procesarlo todo?** A veces la respuesta senior es de producto: ¿eventos redundantes que se pueden compactar/agregar en origen? ¿un consumidor que hace trabajo por evento que podría hacerse cada N?

**Prevención:** alertar sobre *tendencia* de lag y sobre `records-lag-max` por partición (no solo el total), dimensionar particiones para el pico proyectado ×2 desde el diseño, tests de carga del consumidor, y separar topics de distinta criticidad (el batch analítico no comparte grupo ni topic con la facturación).

---

## 6. Mensajes duplicados: facturación cobró dos veces el mismo pedido
**Categoría:** Kafka / Patrones · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
En un sistema at-least-once los duplicados son un CUÁNDO, no un si: retries del producer, rebalances tras procesar-sin-commitear, replays de DLQ, reintentos de sagas. El incidente se ataca en dos frentes: contención inmediata (identificar los pedidos afectados con una query de reconciliación y compensar los cobros dobles) y causa raíz: hacer al consumidor idempotente de verdad — deduplicación por `eventId` persistida en la misma transacción que el efecto, o idempotencia natural por diseño (upsert, operaciones absolutas en vez de relativas), más idempotency keys en la pasarela de pago.

### 📖 Respuesta detallada
**Escenario:** clientes reportan cargos dobles. Los logs muestran el mismo `OrderPlaced` procesado dos veces con ~40 s de diferencia, en dos pods distintos. Hubo un deploy (rolling restart) a esa hora.

**Reconstrucción del fallo (lo que hay que saber narrar):** el pod A consumió el mensaje, llamó a la pasarela de pago (cobro OK), y ANTES de commitear el offset llegó el rebalance del rolling restart. La partición pasó al pod B, que arrancó desde el último offset commiteado y reprocesó el mensaje: segundo cobro. Nada falló "mal": esto es at-least-once funcionando según lo prometido. El bug es un consumidor no idempotente ejecutando una operación no idempotente (cobrar).

**Contención inmediata:**
1. Query de reconciliación: cobros agrupados por `order_id` con count > 1 en la ventana del incidente; cruzar con la pasarela.
2. Compensar (refunds) con comunicación proactiva al cliente.
3. Si sigue entrando tráfico duplicado (p. ej. un replay en curso): pausar el consumer o activar un dedupe de emergencia delante.

**Causa raíz y solución por capas:**
1. **Deduplicación transaccional en el consumidor (la base):**
```java
@Transactional
public void handle(OrderPlaced event) {
    try {
        processedRepo.insert(event.eventId());   // PK sobre event_id
    } catch (DuplicateKeyException e) {
        log.info("duplicate {} ignored", event.eventId());
        return;                                   // ya procesado: no-op
    }
    Invoice invoice = invoiceService.create(event);   // efecto de negocio
    paymentGateway.charge(invoice, event.eventId());  // MISMA tx para lo local
}
```
   La clave: el marcador de procesado y el efecto local comparten transacción — o ambos o ninguno. Requiere un `eventId` estable generado EN EL ORIGEN (el outbox lo da gratis); deduplicar por hash del payload es frágil.
2. **El efecto externo (la pasarela) no entra en tu transacción** — ahí la herramienta es la **idempotency key**: `charge(amount, idempotencyKey=eventId)`. Stripe/Adyen/cualquier pasarela seria deduplica del lado del servidor. Si tu propio servicio ES la "pasarela" de otros, debes ofrecer idempotency keys tú (tabla de respuestas por key con TTL).
3. **Idempotencia por diseño donde se pueda:** upsert en vez de insert, `SET balance = :absolute` en vez de `balance = balance + :delta`, máquinas de estado que ignoran transiciones repetidas (`if (order.status() != PENDING) return;` — cuidado: esto por sí solo tiene carrera sin lock/versionado; se combina con optimistic locking).
4. **Reducir la frecuencia de duplicados (no los elimina):** commit síncrono tras procesar (`AckMode.RECORD` para operaciones críticas), static membership + cooperative rebalancing para que los deploys no muevan particiones, `enable.idempotence=true` en producers (elimina los duplicados por retry de red del producer).

**El matiz que separa al senior:** distinguir deduplicación (infraestructura, ventana limitada — la tabla de eventIds no puede crecer para siempre: TTL alineado con la retención del topic y el horizonte de replays) de idempotencia semántica (propiedad del diseño, sin ventana). Y la honestidad de que exactly-once de Kafka no cubría este caso porque el efecto era una llamada HTTP externa (ver pregunta 6 del archivo 2).

**Prevención:** contract de eventos con `eventId` obligatorio, test de integración que procese cada evento DOS veces y afirme efecto único (barato y brutal), chaos testing de rebalances, y auditoría de todo consumidor que ejecute efectos no idempotentes.

---

## 7. Transacción distribuida que deja datos inconsistentes: pedido pagado sin stock reservado
**Categoría:** Patrones / Datos distribuidos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Un flujo pedido→stock→pago sin saga formal falló a mitad: el pago se ejecutó, la reserva de stock se perdió (timeout + "rollback" local que no compensó el pago). Contención: detectar los pedidos en estado imposible con una query de reconciliación cruzando los tres servicios, y repararlos (compensar o completar). Causa raíz: el flujo necesita una saga con estado persistente, compensaciones definidas por paso, timeouts con acción, publicación por outbox e idempotencia — o mejor: rediseñar límites para que la invariante crítica viva en un solo servicio. Además, montar reconciliación periódica permanente porque la consistencia entre servicios se verifica, no se supone.

### 📖 Respuesta detallada
**Escenario:** el OrderService llama síncronamente a StockService (reserva OK) y luego a PaymentService; el pago tarda, salta el timeout del OrderService, que marca el pedido FAILED y llama a StockService para liberar la reserva. Pero el pago SÍ se había ejecutado (el timeout fue del lado cliente, no del procesamiento). Resultado: cliente cobrado, pedido fallido, stock liberado. 37 casos en tres días, descubiertos por reclamaciones.

**Los errores de diseño a nombrar explícitamente:**
1. **Timeout ≠ fallo:** tras un timeout el resultado es DESCONOCIDO (pudo ejecutarse). Tratar unknown como failure y seguir adelante es el bug número uno de los sistemas distribuidos. Un timeout exige: consultar el estado real (query de status a PaymentService), reintentar idempotentemente hasta resolver, o pasar el caso a un estado `UNKNOWN` con resolución asíncrona — nunca asumir.
2. **"Rollback" sin transacción:** liberar el stock no deshace el cobro; eran pasos independientes sin coordinación ni compensación del pago.
3. **Sin registro del flujo:** nadie persiste en qué paso está cada pedido → imposible saber qué reparar sin arqueología de logs.

**Contención y reparación:**
```sql
-- Reconciliación: estados imposibles (contra réplicas/exports de cada servicio)
SELECT o.id FROM orders o
JOIN payments p ON p.order_id = o.id AND p.status = 'CAPTURED'
WHERE o.status = 'FAILED';    -- pagado pero fallido → refund o revivir pedido
```
Decisión de negocio por caso: reembolsar, o completar el pedido (¿queda stock?). Ejecutar reparaciones con las mismas operaciones idempotentes que usará la saga futura — la reparación manual es el prototipo de las compensaciones.

**Solución estructural — saga orquestada con lo mínimo imprescindible:**
- **Estado persistente por pedido** (`saga_instance`: paso actual, intentos, deadline) actualizado transaccionalmente con cada avance; los comandos salen por **outbox**.
- **Compensaciones definidas por paso** (liberar stock; refund) — idempotentes y reintentables, con la regla de orden: pasos compensables primero, el pivote (cobro) lo más tarde posible, después solo pasos que siempre pueden completarse (email, analytics). Con el cobro al final, el escenario original ni existe.
- **Timeouts con semántica:** cada paso tiene deadline; al vencer, la saga consulta el estado real del paso (endpoint de status idempotente en cada servicio) antes de decidir compensar — la respuesta directa al error 1.
- **Idempotency keys en cada comando** (sagas reintentan; los servicios deben deduplicar).
- Si el análisis muestra que pedido+stock cambian siempre juntos y el 90% de la complejidad viene de separarlos: **mover la invariante a un solo servicio** (fusionar, o rediseñar el límite) es la respuesta más senior de todas — la mejor saga es la que no necesitas.

**Prevención permanente:** el job de reconciliación se queda para siempre (detecta divergencias en minutos, con métrica y alerta — en sistemas eventualmente consistentes la reconciliación es un componente de producción, no un script de incidente); tests de caos del flujo (matar PaymentService a mitad; inyectar timeouts con Toxiproxy) verificando que toda ejecución termina en un estado consistente (completado o compensado); y dashboards del funnel de sagas (cuántas en cada paso, edad de la más vieja).

---

## 8. N+1 queries con JPA/Hibernate: un listado que hace 400 queries
**Categoría:** JPA / Performance · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
El endpoint de listado carga 100 pedidos y, al serializar, cada `order.getCustomer()` y `getItems()` (LAZY) dispara su propia query: 1 + 100 + 100... Se detecta con estadísticas de Hibernate, p6spy/datasource-proxy contando queries por request, o el span JDBC repetido en las trazas. Se corrige eligiendo estrategia de fetch POR CASO DE USO: `JOIN FETCH`/`@EntityGraph` para asociaciones to-one y UNA colección, `@BatchSize`/`default_batch_fetch_size` para el resto, o proyecciones DTO que eviten entidades. Y se previene haciendo fallar tests cuando el conteo de queries se dispara.

### 📖 Respuesta detallada
**Escenario:** `GET /orders?page=0&size=100` tarda 1.8 s. La traza muestra 401 spans JDBC de <2 ms: el tiempo no está en la BD sino en 401 round-trips.

**Detección sistemática:**
```properties
# Diagnóstico (no dejar en prod):
spring.jpa.properties.hibernate.generate_statistics=true
logging.level.org.hibernate.stat=DEBUG   # "401 JDBC statements executed"
```
Mejor aún: datasource-proxy/p6spy con un listener que loguea (o falla en tests) cuando un request supera N queries. En prod: las trazas (span JDBC repetido N veces) o `pg_stat_statements` con una query de frecuencia anómala.

**Por qué ocurre:** `@ManyToOne` es EAGER por defecto (¡error de diseño de JPA — cambiarlo siempre a LAZY!) y las colecciones LAZY se inicializan una a una al accederlas fuera de un fetch conjunto. El serializador Jackson tocando getters es el detonante típico (además del riesgo de `LazyInitializationException` fuera de la sesión — que la gente "arregla" con el anti-patrón `spring.jpa.open-in-view=true`, que justamente convierte errores visibles en N+1 silenciosos; **desactivar OSIV** es parte de la solución).

**Soluciones por caso, con sus trade-offs:**
1. **`JOIN FETCH` / `@EntityGraph` — para to-one y UNA colección:**
```java
@Query("""
    select distinct o from Order o
    join fetch o.customer
    left join fetch o.items
    where o.status = :status""")
List<Order> findWithDetails(OrderStatus status);
```
   Advertencias que debe conocer un senior: (a) fetch join de colección + `Pageable` → Hibernate no puede paginar en SQL y **pagina en memoria** (warning `HHH90003004`, `firstResult/maxResults applied in memory`): carga TODO y recorta — un incidente esperando; (b) dos colecciones en fetch join → `MultipleBagFetchException` (con `List`) o producto cartesiano (con `Set`).
2. **Batch fetching — el mejor default global:**
```properties
spring.jpa.properties.hibernate.default_batch_fetch_size=50
```
   Convierte N+1 en 1 + ceil(N/50): al tocar la primera asociación no inicializada, Hibernate carga en un `IN (...)` las de hasta 50 entidades del contexto. No rompe paginación, funciona con múltiples colecciones. Para paginar entidades con colecciones: dos pasos — query paginada de IDs, luego fetch join sobre esos IDs.
3. **Proyecciones DTO — para listados de solo lectura, la mejor opción:**
```java
public record OrderRow(String id, String customerName, BigDecimal total) {}
@Query("select new com.acme.OrderRow(o.id, c.name, o.total) from Order o join o.customer c")
Page<OrderRow> listRows(Pageable page);
```
   Una query, sin persistence context, sin dirty checking, sin riesgo de lazy. La pregunta de fondo: ¿necesitas entidades gestionadas o solo datos? Los listados casi siempre necesitan solo datos.

**Prevención:** `@ManyToOne(fetch = LAZY)` como estándar, OSIV off, `default_batch_fetch_size` global como red de seguridad, y un test guard: con Hibernate `Statistics` (o la librería quickperf), afirmar `getPrepareStatementCount() <= K` en los endpoints de listado — el N+1 reaparece con cada asociación nueva; sin test, vuelve.

---

## 9. OutOfMemoryError: Metaspace tras varios redeploys o en un servicio con mucha reflection
**Categoría:** JVM / Troubleshooting · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Metaspace almacena metadatos de clases (fuera del heap); se agota cuando se cargan clases sin descargarse: classloader leaks (clásico en redeploys sobre Tomcat standalone), generación dinámica descontrolada de clases (proxies CGLIB, lambdas de scripting, serializadores generados, Groovy/EL) o simplemente un `MaxMetaspaceSize` mal puesto. Diagnóstico: `jcmd GC.class_stats`/`VM.classloader_stats` para ver cuántas clases y de qué classloaders, heap dump en MAT buscando classloaders duplicados retenidos, y `-Xlog:class+load,class+unload` para ver el ritmo. Fix según causa: liberar la referencia que retiene el classloader, cachear los proxies/clases generadas, o dimensionar Metaspace.

### 📖 Respuesta detallada
**Escenario:** un servicio muere con `java.lang.OutOfMemoryError: Metaspace` cada ~2 semanas. `jvm_memory_used_bytes{id="Metaspace"}` sube en escalones, no con el tráfico.

**Diagnóstico paso a paso:**
1. **Cuantificar:** `jcmd <pid> VM.metaspace` (resumen por espacio), `jcmd <pid> VM.classloader_stats` (clases y bytes POR classloader — la pista clave), y `jcmd <pid> GC.class_histogram` no sirve aquí (eso es heap); lo que importa es el número de clases cargadas: `jvm_classes_loaded_classes` en Micrometer subiendo sin bajar.
2. **Ver el ritmo y los nombres:** `-Xlog:class+load=info,class+unload=info`. Si se cargan clases con nombres tipo `com.acme.Foo$$SpringCGLIB$$1234`, `GeneratedSerializer123`, `Script_20240811_...` a ritmo constante → generación dinámica descontrolada. Si no hay `class+unload` nunca pese a redeploys → classloader leak.
3. **Encontrar quién retiene el classloader (MAT):** heap dump → buscar instancias de `WebappClassLoader`/el classloader sospechoso duplicadas → *Path to GC Roots*. Culpables clásicos que hay que citar: un `ThreadLocal` con una clase de la app vieja retenido por un worker de un pool que sobrevive al redeploy; un thread arrancado por la app y nunca parado (su context classloader ancla todo); un driver JDBC registrado en el `DriverManager` del sistema; librerías con caches static (logging, beans introspection — `Introspector.flushCaches()` existía por esto); un shutdown hook no eliminado. Un solo objeto vivo de la app vieja retiene su classloader, que retiene TODAS sus clases: por eso cada redeploy suma un "piso" al escalón.

**Los tres cuadros típicos y su solución:**
1. **Redeploys en servlet container compartido:** cada `redeploy` filtra el classloader anterior. Solución moderna: no redeployar en caliente — contenedores inmutables, un proceso por app (el modelo Spring Boot / Docker elimina la categoría entera de bugs). Si no es opción: cazar la referencia con MAT y los "memory leak detection" logs de Tomcat al parar la app.
2. **Generación dinámica descontrolada (el caso frecuente en microservicios):**
```java
// BUG: un ProxyFactory/enhancer NUEVO por request genera una CLASE nueva cada vez
Enhancer enhancer = new Enhancer();                 // dentro del request handler…
enhancer.setSuperclass(Handler.class);              // → clases CGLIB infinitas
// Lo mismo con: compilar expresiones SpEL/EL por request, Groovy scripts sin cache,
// crear ObjectMapper nuevos por request con afterburner, JAXBContext.newInstance por llamada
```
   La solución es siempre la misma: **generar una vez y cachear** (el proxy, el `JAXBContext`, la expresión compilada, el script). `JAXBContext.newInstance` por request es un clásico absoluto de Metaspace OOM.
3. **Dimensionado:** Metaspace es ilimitado por defecto (crece hasta la RAM del contenedor → puede manifestarse como OOMKilled del pod en vez de OOM de Java). Poner límites explícitos y monitorizarlos: `-XX:MaxMetaspaceSize=256m -XX:MetaspaceSize=128m`. Nota fina: las clases se descargan solo cuando su classloader es recolectado, y eso ocurre en GC — con G1 en un heap holgado puede tardar; `-XX:+ClassUnloadingWithConcurrentMark` está on por defecto.

**Prevención:** alerta sobre `jvm_classes_loaded` con pendiente sostenida (mucho más temprana que la de Metaspace), presupuesto de Metaspace explícito en los manifests, revisión en PR de cualquier uso de Enhancer/ByteBuddy/compilación de expresiones fuera de un cache, y en plataformas con scripting de usuario (reglas Groovy, plantillas), límites y cache LRU de clases generadas con classloaders desechables por lote.

---

## 10. Un servicio degradado tumba en cascada a toda la plataforma: anatomía y defensa
**Categoría:** Resiliencia / Arquitectura · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
El patrón: un servicio secundario (recomendaciones) se pone lento; sus llamadores no tienen timeout agresivo ni bulkhead, así que sus hilos se agotan esperando; ahora los llamadores están lentos, y los llamadores de estos repiten el proceso — la lentitud se propaga aguas arriba hasta el gateway, mientras los retries multiplican la carga sobre el servicio enfermo impidiendo su recuperación (metastable failure). La defensa: timeouts con presupuesto decreciente, breakers con detección de slow calls, bulkheads por dependencia, retries con budget y jitter, degradación funcional planificada (la página funciona sin recomendaciones) y load shedding. La recuperación a menudo exige cortar tráfico deliberadamente.

### 📖 Respuesta detallada
**Escenario:** 14:02, deploy de "recomendaciones" con una query nueva sin índice: su p99 pasa de 30 ms a 8 s. 14:07, el catálogo (que lo llama en el render) agota sus 200 hilos de Tomcat. 14:10, el gateway acumula colas hacia catálogo; el checkout — que NO usa recomendaciones — empieza a fallar porque comparte gateway e infraestructura. 14:15, outage total con todos los servicios "sanos" excepto uno secundario.

**Análisis de los fallos, capa por capa (esto es lo que se evalúa):**
1. **Timeout ausente o absurdo:** el catálogo esperaba hasta 30 s (default del client) por algo que adorna una página. Regla: timeout por dependencia proporcional a su valor y su p99 real (aquí: 150 ms y a otra cosa), y **presupuesto decreciente**: si el gateway da 2 s al catálogo, el catálogo no puede dar 30 s a nadie — cada salto recibe menos budget que el anterior (deadline propagation, idealmente con un header de deadline).
2. **Sin bulkhead:** los 200 hilos eran un pool único; recomendaciones podía secuestrarlos todos. Con un `Bulkhead` de 20 permisos para recomendaciones, el resto del catálogo habría seguido sirviendo. (Con virtual threads el bulkhead sigue siendo necesario — limita el daño al downstream y a los recursos, no solo hilos.)
3. **Breaker que no miraba latencia:** recomendaciones no devolvía errores, solo tardaba: un breaker sin `slowCallDurationThreshold` nunca abre. Y su fallback estaba sin definir: la degradación correcta era "carrusel vacío", decidida de antemano con producto.
4. **Retries multiplicadores:** cliente móvil (2 retries) × gateway (2) × catálogo (3) = hasta 18 requests por intento de usuario contra un servicio ya ahogado. Los retries convirtieron degradación en colapso y mantienen el estado metastable: aunque la causa original se arregle, la carga amplificada impide recuperarse. Regla: retries en UNA capa, con backoff exponencial + jitter y **retry budget** (p. ej. máx 10% del tráfico en retries; Resilience4j + métricas, o el mesh).
5. **Sin load shedding ni prioridad:** el gateway aceptaba todo hasta morir. Mejor: rechazar temprano (429/503 + `Retry-After`) cuando la cola supera un umbral, y por clase de tráfico (checkout prioritario sobre browsing — el shedding proporcional salva lo que importa).

**Gestión del incidente en vivo:** identificar el origen con el mapa de dependencias y las trazas (el servicio cuyo p99 se degradó PRIMERO — la cascada se lee hacia atrás en el tiempo); mitigar cortando: feature flag para desactivar recomendaciones (por eso toda integración no crítica lleva kill switch), o rollback del deploy; y si el sistema está metastable, reducir tráfico entrante (shedding agresivo temporal) para dejarle aire — contraintuitivo y necesario.

**Prevención:** revisión de resiliencia por dependencia como checklist de arquitectura (timeout, breaker, bulkhead, fallback, kill switch: cinco casillas por flecha del diagrama), chaos engineering regular (inyectar 5 s de latencia a UNA dependencia en staging y verificar que solo se degrada SU funcionalidad), y game days. La frase que resume la seniority: "un sistema distribuido bien diseñado degrada funcionalidades, no disponibilidad; el radio de explosión de cada dependencia se decide en diseño, no durante el incidente".

---

## 11. Migrar un monolito a microservicios: ¿por dónde empiezas y cómo evitas el desastre?
**Categoría:** Arquitectura / Migración · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Nunca big-bang: strangler fig — poner una fachada (gateway) delante del monolito y extraer capacidades una a una, redirigiendo tráfico gradualmente mientras el monolito sigue funcionando. Elegir el primer candidato por: acoplamiento bajo (pocas tablas compartidas), valor claro (necesita escalar/desplegar distinto), y riesgo tolerable — ni el core crítico ni algo trivial. Lo difícil no es el código sino los datos: separar el esquema (el servicio nuevo es el único dueño de sus tablas), sincronizar durante la transición (eventos/CDC, doble escritura controlada) y aceptar consistencia eventual donde había joins. Cada extracción debe llegar a producción y demostrar valor antes de la siguiente.

### 📖 Respuesta detallada
**Escenario:** monolito Spring de 900k líneas, 40 devs pisándose, deploys semanales aterradores, y la orden de "pasarlo a microservicios". Qué contestar como senior:

**Paso 0 — ¿por qué?** Si el dolor es deploys lentos y equipos bloqueados, la solución es *límites* + entrega independiente — a veces basta un monolito modular (Spring Modulith, módulos con APIs internas explícitas y eventos) sin pagar red, sagas y operación distribuida. Decir esto NO es evadir la pregunta: es la respuesta que los entrevistadores buenos premian. Si hay razones reales (escalado asimétrico, aislamiento de fallos, tecnologías distintas, equipos autónomos), adelante con extracción incremental.

**Paso 1 — Mapear el dominio, no las clases:** event storming / DDD para encontrar bounded contexts (pedidos, catálogo, fidelización...) y medir el acoplamiento REAL en datos: ¿qué módulos comparten tablas? ¿dónde hay joins entre contextos? El grafo de dependencias de tablas vale más que el de paquetes.

**Paso 2 — Elegir el primer strangler:** criterios: (1) límites de datos razonablemente limpios; (2) motivo concreto (p. ej. "notificaciones" necesita escalar en picos y cambia a diario); (3) si sale mal, no quiebra la empresa; (4) representativo: obliga a construir la plataforma (CI/CD por servicio, observabilidad, gateway) que las siguientes extracciones reutilizarán. El primer proyecto es 30% servicio y 70% pavimentar el camino.

**Paso 3 — El patrón strangler fig en mecánica:**
1. Fachada delante del monolito (gateway o el propio LB) — TODA petición pasa por un punto que puede enrutar.
2. Construir el servicio nuevo; el monolito deja de ser dueño de esa capacidad gradualmente:
   - **Branch by abstraction dentro del monolito:** interfaz `NotificationSender` con dos implementaciones (local y cliente HTTP del servicio nuevo) conmutable por feature flag → rollback instantáneo.
   - **Tráfico progresivo:** shadow traffic primero (el nuevo recibe copia y se comparan resultados — la herramienta más infravalorada de una migración), luego canary 1% → 10% → 100% por flag/route.
3. **Datos, la parte dura:** el servicio nuevo estrena SU esquema/BD. Durante la transición: o el monolito sigue siendo el escritor y el nuevo se sincroniza por CDC (Debezium) hasta el switchover; o doble escritura desde la fachada con reconciliación continua (más frágil: preferir CDC). Los joins que cruzaban el límite se convierten en llamadas API o vistas materializadas alimentadas por eventos — y aquí el negocio debe validar la consistencia eventual resultante.
4. Retirar el código viejo (de verdad — el strangler termina cuando el monolito adelgaza; saltarse la limpieza deja DOS sistemas).

**Anti-patrones que hay que nombrar:** *distributed monolith* (servicios que se despliegan juntos y se llaman síncronamente para todo — todos los costes, ninguna ventaja); base de datos compartida entre servicios "temporalmente" (para siempre); extraer por capas técnicas ("el servicio de acceso a datos") en vez de por capacidades de negocio; y congelar features 18 meses para migrar (la migración convive con el roadmap o muere).

**Métricas de éxito:** lead time y frecuencia de deploy del área extraída, incidentes con radio contenido, y equipos desplegando sin coordinarse. Cadencia realista: primera extracción en un trimestre, aprendiendo; después, ritmo sostenido — y quizá descubrir que con 6 servicios bien elegidos + un monolito modular sano es donde hay que parar.

---

## 12. Full GC pauses de varios segundos: los health checks fallan y los pods se reinician
**Categoría:** JVM / GC · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Pausas largas con G1 casi siempre significan Full GC de emergencia (evacuation failure / to-space exhausted) o marcado concurrente que no llega a tiempo: heap demasiado justo, allocation rate brutal, objetos humongous fragmentando, o promoción masiva por caches/batches. Diagnóstico con GC logs (`-Xlog:gc*`): buscar "Pause Full", "to-space exhausted", "humongous allocation". Solución según causa: más headroom, IHOP más bajo, región más grande para humongous, reducir allocation (el arreglo real suele estar en el código), o cambiar de colector. Y separar el liveness probe de la salud "instantánea" para no matar pods por una pausa.

### 📖 Respuesta detallada
**Escenario:** cada 2–4 horas, pausas de 6–9 s; el liveness probe (timeout 3 s, 3 fallos) mata el pod en plena pausa; el reinicio provoca cold start y más carga en los demás — mini cascada.

**Diagnóstico con los GC logs (la fuente de verdad):**
```bash
-Xlog:gc*,gc+heap=debug,gc+ergo*=trace:file=/logs/gc.log:time,uptime,level,tags
```
Qué buscar, en orden:
1. **`Pause Full (G1 Compaction Pause)`** — G1 no debería hacer Full GC nunca en régimen sano; su presencia ya es el incidente.
2. **`to-space exhausted`** justo antes: G1 se quedó sin regiones libres donde evacuar → evacuation failure → Full GC compactador. Causas: heap al límite, o marcado/mixed que van por detrás del allocation rate.
3. **`humongous allocation`** frecuentes: objetos ≥ 50% de región van directos a old, fragmentan (ocupan regiones contiguas) y aceleran el agotamiento. Ver el tamaño: si la región es 4 MB, cualquier buffer de 2 MB+ es humongous — ¿quién aloca eso? (respuestas HTTP enteras en byte[], filas con JSON gigantes, un cache de PDFs...).
4. **Métricas derivadas:** allocation rate (GB/s entre young GCs), promotion rate, ocupación de old tras cada mixed. Herramientas: GCeasy o gceventlog para no leer a mano.

**Soluciones según el cuadro:**
1. **Heap justo:** más `-Xmx` (y `-Xms` igual) o menos live set. Regla: old ocupada en régimen < 60–70% del heap. En Kubernetes revisar la coherencia heap vs limit del contenedor (heap 4 GB con limit 4 GB = OOMKilled esperando; dejar ~25% para metaspace, stacks, direct buffers, code cache).
2. **Marcado tardío:** bajar `-XX:InitiatingHeapOccupancyPercent=30` (empieza antes), subir `-XX:ConcGCThreads`; darle más margen con `-XX:G1ReservePercent=15`.
3. **Humongous:** subir `-XX:G1HeapRegionSize=16m` (o 32m) para que esos objetos dejen de ser humongous — y en paralelo, arreglar el código: streaming en lugar de materializar (InputStream → destino sin byte[] completo), trocear batches, revisar caches de blobs.
4. **Allocation rate desbocado:** el tuning solo compra tiempo; async-profiler en modo alloc señala el código (JSON re-serializado N veces, colecciones redimensionándose, logs debug construyendo strings enormes, boxing masivo). Reducir allocation es la única solución que escala.
5. **Cambiar de colector:** si el live set es grande y el SLO de pausas estricto, ZGC generacional elimina la categoría de pausas largas (a cambio de CPU y headroom — ver archivo 1, pregunta 2).

**El ángulo de plataforma que suma puntos:** liveness probe que NO muera por una pausa (timeout > pausa máxima tolerada, `failureThreshold` amplio; liveness = "el proceso responde algo", readiness = "puedo atender tráfico" — es correcto que readiness falle durante la pausa y vuelva); `-XX:+HeapDumpOnOutOfMemoryError` y GC logs SIEMPRE activos (coste ~0); y alerta sobre `jvm_gc_pause_seconds` p99 y sobre la frecuencia de mixed vs young como leading indicator, para tratar el problema antes del primer Full GC.

---

## 13. HikariCP agotado: "Connection is not available, request timed out after 30000ms"
**Categoría:** Base de datos / Spring · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
El pool se agota por tres familias de causas: conexiones retenidas demasiado tiempo (queries lentas, transacciones que engloban I/O externo — el clásico HTTP dentro de @Transactional), leaks (conexión no devuelta: raro con Spring, posible con código JDBC manual o streams de JPA no cerrados), o pool simplemente pequeño para la concurrencia real. Diagnóstico: `leakDetectionThreshold` para cazar retenciones largas con stack trace, métricas de Hikari (active/pending/acquire time), y `pg_stat_activity` para ver qué hacen las conexiones en la BD. La solución casi nunca es "subir el pool": es acortar la retención.

### 📖 Respuesta detallada
**Escenario:** picos de `SQLTransientConnectionException` en horas punta; `hikaricp_connections_active` = 20/20 sostenido, `pending` de dos dígitos. El equipo propone subir el pool a 100.

**Por qué "subir el pool" suele ser la respuesta equivocada:** la BD tiene un máximo útil de trabajo concurrente (≈ cores + disco; la fórmula clásica de HikariCP: `connections ≈ cores × 2 + espindles`). 100 conexiones activas en un Postgres de 8 cores no procesan más: hacen cola DENTRO de la BD, suben la latencia de todas las queries y pueden alcanzar `max_connections` (multiplicado por N réplicas del servicio). Pool pequeño y sano con retención corta > pool gigante congestionado. Dicho esto: si la retención media es 5 ms y hay 400 req/s, Little's law dice que necesitas ~2 conexiones — si están agotadas 20, el problema ES la retención.

**Diagnóstico paso a paso:**
1. **¿Quién retiene y cuánto?**
```properties
spring.datasource.hikari.leak-detection-threshold=10000   # ms: loguea stack trace del "leak"
```
   El log señala el código exacto que tenía la conexión > 10 s. Revisar también `hikaricp_connections_acquire_seconds` (espera para obtener) vs `hikaricp_connections_usage_seconds` (tiempo de uso — la métrica reveladora).
2. **Desde la BD:** `SELECT state, wait_event, query, now()-xact_start FROM pg_stat_activity` → ¿conexiones `active` con queries lentas (falta índice), o `idle in transaction` (¡la app retiene transacción abierta sin usar la BD — el smoking gun del I/O externo dentro de la transacción!)?
3. **Casos típicos que hay que enumerar:**
   - **`@Transactional` que envuelve llamadas HTTP/Kafka:** la conexión se retiene los 2–30 s del I/O externo. Fix: sacar el I/O de la transacción (outbox para publicar; leer-antes/escribir-después para HTTP).
   - **Transacción abierta en todo el request** (`@Transactional` en el controller, u OSIV con `spring.jpa.open-in-view=true` reteniendo conexión durante la serialización — otro motivo para apagarlo).
   - **Queries lentas:** ver caso N+1 y planes de ejecución; cada query de 800 ms convierte 20 conexiones en 25 req/s de techo.
   - **Leak real:** JDBC manual sin try-with-resources, `Stream<Entity>` de Spring Data no cerrado, `queryForStream` sin close. El leakDetection los caza.
   - **Picos legítimos:** si todo lo anterior está sano y `usage` es de pocos ms, entonces sí: dimensionar con Little's law (`pool ≈ throughput × usage` + margen) y considerar backpressure arriba (limitar concurrencia de entrada) en vez de pool infinito.
4. **Configuración sana de referencia:**
```properties
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.connection-timeout=2000     # fallar rápido y visible, no 30 s de cola
spring.datasource.hikari.max-lifetime=1800000        # < timeout del LB/proxy de la BD
spring.datasource.hikari.validation-timeout=1000
```
   `connectionTimeout` bajo es contraintuitivo pero clave: 30 s de espera solo transforma agotamiento en latencia catastrófica y hilos de Tomcat secuestrados (encadena con el caso 3); mejor fallar en 2 s, alimentar el breaker y degradar.

**Prevención:** transacciones que solo abarcan trabajo de BD (checklist de PR), pool sizing por servicio documentado contra la capacidad de la BD (sumando réplicas), alertas sobre `pending > 0` sostenido y `usage p99`, y separar pools para cargas distintas (transaccional vs reporting) para que el informe pesado no se coma el checkout — el bulkhead aplicado a la BD.

---

## 14. Pérdida de mensajes: un evento de pedido nunca llegó a facturación
**Categoría:** Kafka · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Los mensajes se pierden en cuatro sitios: el productor (fire-and-forget, `acks=0/1` con caída del líder, crash antes de publicar → falta outbox), el broker (`unclean.leader.election`, `min.insync.replicas` mal), el consumidor (offset commiteado antes de procesar — auto-commit con procesamiento async, o error tragado en el listener) y la retención (mensajes expirados antes de consumirse durante un lag largo). El análisis forense: localizar el mensaje por clave/offset con kcat o kafka-console-consumer para determinar si llegó al topic — eso divide el problema en mitades. La solución cubre las cuatro capas: producer con acks=all+outbox, broker con RF=3/minISR=2, consumer con commit-tras-procesar y DLQ, y retención dimensionada.

### 📖 Respuesta detallada
**Escenario:** el pedido 8842 se pagó pero facturación nunca emitió factura. Su listener no tiene registro del evento. Hay que encontrar dónde murió — y cuántos más hay.

**Análisis forense paso a paso:**
1. **¿Está el mensaje en el topic?** Buscarlo (la partición se deriva de la key):
```bash
kcat -b broker:9092 -t orders -p 4 -o beginning -e | grep 8842   # o por timestamps
```
   - **Está en el topic** → el fallo es del lado consumidor (paso 3).
   - **No está** → fallo de publicación (paso 2).
2. **Lado productor — las formas de perder al publicar:**
   - **Crash entre commit de BD y send:** sin patrón outbox, la ventana existe SIEMPRE. ¿Hubo deploy/restart del servicio de pedidos a esa hora? El fix estructural es outbox + relay (archivo 2, pregunta 8).
   - **Fire-and-forget:** `kafkaTemplate.send(...)` ignorando el future — un fallo de broker/serialización/tamaño (`RecordTooLargeException`) desaparece en silencio. Mínimo: callback con log+métrica+alerta; para críticos, esperar confirmación.
   - **`acks=1` + caída del líder:** el líder confirmó, murió antes de replicar, y un follower sin el mensaje fue elegido. Configuración de supervivencia: producer `acks=all` + `enable.idempotence=true`; topic `replication.factor=3`, `min.insync.replicas=2`; broker `unclean.leader.election.enable=false` (elegir un líder desincronizado = pérdida garantizada de lo no replicado). Verificar también `retries` alto y `delivery.timeout.ms` coherente.
3. **Lado consumidor — las formas de perder al consumir:**
   - **Offset commiteado antes de procesar:** auto-commit (`enable.auto.commit=true`) con hand-off a otro hilo: el poll siguiente commitea offsets de mensajes aún en proceso; crash → esos mensajes constan como consumidos. En Spring Kafka: dejar el commit al container (AckMode RECORD/BATCH tras el listener) y no sacar el procesamiento del hilo del listener sin gestionar offsets manualmente.
   - **Excepción tragada:** un `try/catch` que loguea y sigue equivale a "procesado". Spring Kafka moderno: `DefaultErrorHandler` con backoff y **DeadLetterPublishingRecoverer** → tras N reintentos, el mensaje va a `orders.DLT` con headers de diagnóstico, y una alerta sobre profundidad de DLT > 0. Un sistema sin DLQ pierde mensajes por diseño, solo que despacio.
   - **`auto.offset.reset=latest` en un grupo nuevo/reseteado:** el consumidor "nace" al final del topic y todo lo anterior nunca se procesa. Para consumidores de negocio: `earliest` + idempotencia.
   - **Retención vencida:** lag de días + `retention.ms` de horas = el offset pendiente ya no existe; el consumer salta al earliest disponible (con `log.retention` es silencioso). Dimensionar retención >> peor lag esperado + margen de incidentes (y monitorizar lag vs retención como ratio).
4. **Cuantificar el daño:** reconciliación pedidos-pagados vs facturas del período (la query del caso 7) — un incidente de pérdida casi nunca es de UN mensaje.

**Reparación:** re-emitir los eventos perdidos (desde el estado de la BD del productor — otra razón para outbox: re-publicar es trivial) y procesar el backlog con los consumidores idempotentes (dedupe por eventId absorbe los solapamientos).

**Qué evalúa el entrevistador:** el método de bisección (¿está en el topic?), conocer las cuatro capas con sus configs exactas, y la visión de sistema: durabilidad end-to-end = outbox + acks=all/minISR + commit-tras-procesar + DLQ + retención, cada eslabón necesario.

---

## 15. Hot partition en Kafka: una partición concentra el tráfico y un consumer va ahogado
**Categoría:** Kafka · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Una clave dominante (el tenant gigante, el producto viral, o una key null/constante) manda una fracción desproporcionada de mensajes a UNA partición: su consumer acumula lag mientras los demás están ociosos, y escalar consumers no ayuda (el límite es la partición). Diagnóstico: lag y bytes-in POR partición, y muestreo de claves de la partición caliente para identificar la dominante. Soluciones según el caso: corregir keys degeneradas (null/constante), sub-particionar la clave caliente (key compuesta `tenant#bucket` sacrificando orden global por tenant), aislar al tenant gigante en su topic, o repensar qué orden se necesita de verdad.

### 📖 Respuesta detallada
**Escenario:** topic `events` con 24 particiones; el lag total parece moderado pero la partición 7 lleva 2M de mensajes de retraso y creciendo; las otras 23, casi a cero. El equipo ya escaló a 24 consumers "y no mejora" — correcto: 23 están de brazos cruzados.

**Diagnóstico paso a paso:**
1. **Confirmar la asimetría:** `kafka-consumer-groups.sh --describe` (lag por partición) y métricas de broker `MessagesInPerSec`/`BytesInPerSec` por partición (o los records-lag por partición del consumer). Si una partición recibe 40% del tráfico con 24 particiones, hay hot key.
2. **Identificar la clave dominante:** muestrear la partición caliente:
```bash
kcat -b broker:9092 -t events -p 7 -o -100000 -e -f '%k\n' | sort | uniq -c | sort -rn | head
```
   Resultados típicos y su historia: (a) una clave real domina (el tenant que es el 45% del negocio, el producto en campaña); (b) **clave null** — el particionador sticky de Kafka moderno manda cada batch entero a una partición y con pocos producers puede sesgar, pero sobre todo: alguien decidió no poner key y otra parte del sistema ASUME orden por entidad que no existe; (c) clave constante por bug (`"orderEvent"` literal como key — visto en producción más veces de las que parece); (d) hashing correcto pero cardinalidad bajísima (key = país, y un país domina).
3. **Medir el techo real del consumer de esa partición:** quizá además procesa lento (el tenant grande tiene payloads mayores) — el hot partition suele venir con hot processing.

**Soluciones, de menos a más invasivas:**
1. **Bug de key (null/constante):** corregir la key a la entidad correcta (`orderId`, `tenantId`). Trivial en código; planificar que el histórico queda donde está y el orden por entidad solo vale desde el cambio.
2. **Sub-particionar la clave caliente (key compuesta):** `key = tenantId + "#" + (hash(entityId) % N)` — el tenant gigante se reparte en N sub-buckets. Trade-off explícito: se conserva el orden POR ENTIDAD (lo que casi siempre basta) pero se pierde el orden global por tenant. N se elige para que tenant/N quepa en el throughput de un consumer. Variante: particionador custom que solo sub-particiona las claves de una lista caliente, manteniendo el resto intacto.
3. **Aislar al elefante:** topic dedicado para el tenant gigante (`events-tenant-bigcorp`), con sus particiones y su grupo de consumers dimensionados aparte. Beneficio extra: su tráfico deja de afectar el SLO del resto (bulkhead de datos), y se le puede aplicar throttling/quotas de Kafka (`producer_byte_rate` por client-id) si el productor es externo.
4. **Cuestionar el requisito de orden:** si el consumidor realmente no necesita orden por tenant (p. ej. eventos independientes que agregan a contadores), la key puede ser la entidad fina o incluso round-robin — el hot partition desaparece por diseño. Muchísimos "necesitamos orden" son "nunca lo pensamos".
5. **Lo que NO funciona y hay que decir:** añadir particiones (la clave caliente sigue yendo a UNA), añadir consumers más allá de las particiones (ociosos), y "subir max.poll.records" (el cuello es la partición, no el poll).

**Prevención:** diseñar la key con análisis de cardinalidad y distribución REAL (top-N de claves con su % del tráfico, no la suposición), dashboards de lag y throughput POR partición con alerta de skew (max/mediana > 3), tests de carga con la distribución de producción (el 80/20 de tenants, no claves uniformes), y revisar la elección de keys en el design review de cada topic nuevo — cambiar una key en producción siempre es más caro que elegirla bien.
