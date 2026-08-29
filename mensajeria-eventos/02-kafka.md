# Apache Kafka — Preguntas de Entrevista Senior

Banco de preguntas de nivel senior sobre Apache Kafka: arquitectura interna, semánticas de entrega, tuning, operación y diagnóstico en producción. Cada pregunta incluye el mecanismo interno, los parámetros con su nombre exacto, trade-offs y lo que un entrevistador espera oír de un candidato con años de Kafka en producción, no solo de tutoriales.

---

## 1. Arquitectura de Kafka: brokers, topics, particiones, réplicas e ISR. ¿Por qué decimos que es un log distribuido y no una cola?
**Categoría:** Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
Kafka es un *commit log* distribuido, particionado y replicado. Un topic se divide en particiones; cada partición es un log append-only, inmutable y ordenado, identificado por offsets crecientes. Cada partición tiene un broker líder (que sirve lecturas y escrituras) y N−1 followers que replican; los followers al día forman el ISR (*in-sync replicas*). A diferencia de una cola, consumir NO destruye el mensaje: cada consumer group mantiene su propia posición (offset), lo que permite múltiples consumidores independientes, replay y retención temporal desacoplada del consumo.

### 📖 Respuesta detallada
**Anatomía física.** Un topic es una abstracción lógica; la unidad real de almacenamiento, paralelismo y replicación es la **partición**. En disco, cada partición es un directorio (`orders-3/`) con **segmentos**: ficheros `.log` (records) + `.index` (offset → posición física) + `.timeindex`. El segmento activo recibe los appends; los cerrados (por `segment.bytes`, 1 GiB por defecto, o `segment.ms`, 7 días) son candidatos a retención/compactación.

**Replicación e ISR.** Con `replication.factor=3`, cada partición vive en 3 brokers: 1 líder + 2 followers que hacen fetch del líder igual que un consumidor. El **ISR** es el subconjunto de réplicas que no se ha quedado atrás más de `replica.lag.time.max.ms` (30 s por defecto — criterio de *tiempo*, no de número de mensajes). Conceptos clave:

- **High watermark (HW):** el offset máximo replicado por *todo* el ISR. Los consumidores solo ven mensajes hasta el HW; un mensaje escrito en el líder pero aún no replicado es invisible (y se perdería si el líder cae).
- **Log End Offset (LEO):** el final físico del log de cada réplica.
- **Leader epoch:** contador que se incrementa en cada elección de líder; los followers lo usan para truncar correctamente su log tras un failover (antes de KIP-101 se truncaba por HW y podía divergir).

**Por qué "log", no "cola":**

| Cola clásica (RabbitMQ/SQS) | Kafka |
|---|---|
| El consumo destruye el mensaje (ack → delete) | El consumo solo avanza un puntero (offset); el dato sigue ahí |
| El broker trackea el estado de entrega por mensaje | El broker no sabe nada de consumidores individuales; el estado es un simple entero por partición |
| Un mensaje va a UN consumidor | N consumer groups leen el mismo dato independientemente |
| Replay imposible o costoso | Replay trivial: `seek()` a un offset o timestamp |
| Orden global débil con consumidores concurrentes | Orden total garantizado *dentro de cada partición* |

El precio del diseño: no hay entrega selectiva por mensaje ni prioridades, y el "ack individual con reintento" (patrón cola de trabajo) hay que construirlo encima (pause/resume, retry topics).

**Qué espera oír el entrevistador:** partición = unidad de orden/paralelismo, el rol del HW en la visibilidad, que el ISR se define por tiempo y no por conteo, y la consecuencia del log: los consumidores son baratos porque el broker no mantiene estado por mensaje. Buen cierre: "Kafka no es una cola con esteroides; es un log distribuido sobre el que puedes *implementar* una cola, un pub/sub o una base de datos de eventos".

---

## 2. KRaft vs ZooKeeper: ¿qué cambió exactamente y por qué el proyecto migró?
**Categoría:** Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
Hasta Kafka 2.x, la metadata del clúster (brokers vivos, líderes, configs, ACLs) vivía en ZooKeeper y un broker "controller" la traducía a los demás. KRaft (KIP-500) elimina ZooKeeper: la metadata pasa a ser un topic interno (`__cluster_metadata`) replicado con el protocolo Raft entre un quorum de controllers, y los brokers la consumen como un log de eventos. Resultado: una sola tecnología que operar, failover de controller casi instantáneo (el quorum ya tiene la metadata) y escalado a millones de particiones. ZooKeeper quedó deprecado en 3.5 y eliminado en Kafka 4.0.

### 📖 Respuesta detallada
**El problema con ZooKeeper.** No era solo "dos sistemas que operar":

1. **Failover lento del controller:** el controller nuevo debía leer TODA la metadata de ZooKeeper (O(particiones)) antes de operar; con cientos de miles de particiones, minutos sin elecciones de líder ni cambios administrativos.
2. **Divergencia de estado:** la metadata llegaba a los brokers por RPCs (`LeaderAndIsr`, `UpdateMetadata`) que podían retrasarse o perderse → visiones inconsistentes del clúster.
3. **Límite práctico de ~200K particiones** por clúster, dictado por los tiempos de recuperación; y dos sistemas con seguridad, monitoreo y tuning distintos.

**El diseño KRaft.** La idea elegante: Kafka *es* un log replicado — usa un log replicado para su propia metadata:

- Un **quorum de controllers** (3 o 5 nodos, `process.roles=controller` o `broker,controller` en clústeres pequeños) replica el topic `__cluster_metadata` (una sola partición) con **Raft** (variante pull-based, KIP-595). El líder del quorum es el *active controller*.
- Cada cambio (broker registrado, líder elegido, config alterada) es un **evento** en ese log. Los brokers lo consumen y aplican los deltas — la propagación de metadata pasa de RPCs imperativas a un log con offsets, con snapshots para arranque rápido.
- Los controllers standby ya tienen la metadata en memoria: el failover pasa de minutos a **milisegundos**, y el techo de particiones sube a millones. Configuración: `controller.quorum.voters=1@ctrl1:9093,2@ctrl2:9093,3@ctrl3:9093`.

**Cronología que conviene citar:** KIP-500 (2019) → producción en 3.3 → ZK deprecado en 3.5 → **Kafka 4.0 (2025) elimina ZooKeeper por completo**; la migración debe hacerse en 3.9 antes de subir.

**Diferencias operativas:** el almacenamiento se formatea antes del primer arranque (`kafka-storage.sh format -t <cluster-uuid>`), hay métricas nuevas del quorum que monitorear (`current-state`, `high-watermark` del metadata log), y en clústeres serios se usan controllers dedicados (no `broker,controller` combinado) para aislar la latencia del quorum.

**Errores comunes:** decir "quitaron ZooKeeper porque era lento" sin explicar el failover O(particiones); confundir el quorum Raft de controllers con la replicación normal de particiones (que sigue usando el protocolo ISR/HW clásico, NO Raft).

**Qué espera oír el entrevistador:** "metadata as an event log", failover en ms porque los standby ya están al día, y la simetría conceptual: Kafka resolvió su metadata con su propia primitiva, un log replicado.

---

## 3. El productor por dentro: batching, `linger.ms`, compresión, particionador sticky, `acks` e idempotencia (PID + secuencias)
**Categoría:** Productor · **Tipo:** Conceptual

### 📝 Respuesta resumen
`send()` no envía nada: serializa, elige partición y encola el record en un buffer (`buffer.memory`, 32 MB) agrupado en batches por partición (`batch.size`, 16 KB). Un hilo de I/O (sender) despacha un batch cuando se llena o expira `linger.ms` (0 por defecto). La compresión (`compression.type`) se aplica por batch. Desde 2.4 el particionador *sticky* pega los mensajes sin clave a una partición hasta cerrar el batch. `acks` controla la durabilidad (0/1/all) y la idempotencia (activada por defecto desde 3.0) usa un Producer ID + números de secuencia por partición para que los retries no dupliquen.

### 📖 Respuesta detallada
**Pipeline interno de `KafkaProducer.send(record)`:**
1. **Serializer** (`key.serializer`/`value.serializer`) → bytes.
2. **Partitioner:** con clave → `murmur2(key) % numPartitions` (determinista: misma clave, misma partición — la base del ordering por entidad). Sin clave → **sticky partitioner** (KIP-480): en lugar del round-robin por mensaje antiguo (que fragmentaba batches en N particiones), pega todos los records a UNA partición hasta que el batch se cierra, y entonces cambia. Menos requests, mejor compresión, latencia p99 notablemente menor.
3. **RecordAccumulator:** un deque de batches por partición dentro de `buffer.memory`. Si el buffer se llena, `send()` **bloquea** hasta `max.block.ms` (60 s) y luego lanza `TimeoutException` — sorpresa clásica: "mi API asíncrona se bloquea".
4. **Sender thread:** agrupa batches por broker destino en un solo request. Envía cuando `batch.size` se llena **o** vence `linger.ms` — lo que ocurra primero.

**Tuning de throughput realista:**
```properties
# Productor de alto throughput (pipeline de eventos)
linger.ms=10            # espera hasta 10 ms para llenar batches
batch.size=65536        # 64 KB; batches grandes = mejor compresión
compression.type=lz4    # lz4/zstd: mejor ratio CPU/compresión que gzip
buffer.memory=67108864  # 64 MB
acks=all
enable.idempotence=true
max.in.flight.requests.per.connection=5
delivery.timeout.ms=120000   # límite TOTAL (encolado+retries), no solo request.timeout.ms
```
`linger.ms=10` añade hasta 10 ms de latencia a cambio de batches llenos (con carga alta ni se nota: el batch se llena antes). La compresión es **por batch**: batches grandes comprimen mejor — otro motivo para el sticky partitioner.

**`acks` — el contrato de durabilidad:**
- `acks=0`: fire-and-forget, sin garantía ninguna (ni siquiera de que llegó al socket).
- `acks=1`: confirma cuando el **líder** escribió en su log. Si el líder muere antes de replicar, el mensaje se pierde silenciosamente.
- `acks=all` (`-1`): confirma cuando todo el **ISR** lo tiene. Solo da durabilidad real combinado con `min.insync.replicas>=2` (ver pregunta 13).

**Idempotencia (EOS parte 1).** Con `enable.idempotence=true` (default desde Kafka 3.0, KIP-679):
- El broker asigna al productor un **PID** (Producer ID) en `InitProducerId`.
- Cada batch lleva un **número de secuencia** monótono por (PID, partición). El broker guarda las últimas 5 secuencias por productor y partición:
  - secuencia esperada → acepta;
  - secuencia ya vista (retry de un batch que sí llegó pero cuyo ack se perdió) → responde OK **sin re-escribir** → no hay duplicado;
  - hueco en la secuencia → `OutOfOrderSequenceException`.
- Por eso `max.in.flight.requests.per.connection` puede ser hasta 5 manteniendo el orden con retries (sin idempotencia había que bajarlo a 1 para no reordenar).
- **Límites:** cubre duplicados por retry *dentro de la sesión del productor y por partición*. Un `producer.send()` reejecutado por la aplicación (p. ej. reintento a nivel de servicio tras un timeout) es un mensaje nuevo con secuencia nueva: duplicado. Idempotencia ≠ transacciones (pregunta 7).

**Errores comunes:** ignorar el callback/`Future` de `send()` (errores tragados → pérdida); creer que `retries=0` es necesario para no duplicar (la idempotencia existe para eso); subir `batch.size` esperando latencia menor (es un *techo*, no un mínimo; quien introduce espera es `linger.ms`).

**Qué espera oír el entrevistador:** que `send()` es asíncrono con un buffer que puede bloquear, la mecánica PID+secuencia (no solo "activa idempotencia"), por qué sticky mejora p99, y que `delivery.timeout.ms` es el verdadero SLA de entrega del productor.

---

## 4. ¿Cuándo se puede perder un mensaje en Kafka? Enumera todas las vías
**Categoría:** Fiabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Kafka no pierde mensajes "solo" si toda la cadena está bien configurada; hay al menos seis vías de pérdida: (1) productor con `acks=0/1` y caída del líder; (2) `acks=all` pero `min.insync.replicas=1`, que degenera en acks=1 cuando el ISR encoge; (3) `unclean.leader.election.enable=true`, que corona a una réplica desactualizada; (4) errores del productor no manejados (callback ignorado, buffer lleno, `delivery.timeout.ms` vencido); (5) auto-commit del consumidor comiteando offsets de mensajes aún no procesados antes de un crash; (6) retención (`retention.ms`) borrando datos antes de que un consumidor rezagado los lea.

### 📖 Respuesta detallada
Un senior debe recorrer el camino productor → broker → consumidor y señalar cada punto de fuga:

**1. Productor: `acks=0` o `acks=1`.** Con `acks=1`, el líder confirma tras escribir en *su* log (page cache, ni siquiera fsync). Si muere antes de que un follower replique, el nuevo líder no tiene ese mensaje: pérdida confirmada-y-perdida, la peor clase. Con `acks=0` ni hay confirmación.

**2. `acks=all` + `min.insync.replicas=1` (el default engañoso).** `acks=all` espera al ISR *actual*. Si dos followers se caen o se rezagan, el ISR = {líder}, y `acks=all` degenera exactamente en `acks=1` — sin ningún error visible. La pareja correcta: `replication.factor=3` + `min.insync.replicas=2`; con ISR < 2 el broker rechaza escrituras con `NotEnoughReplicasException` (eliges indisponibilidad sobre pérdida, y te enteras).

**3. Unclean leader election.** Si todas las réplicas del ISR mueren, hay dos opciones: esperar (indisponible) o permitir que una réplica *fuera* del ISR sea líder. `unclean.leader.election.enable=true` hace lo segundo: todo lo que el ISR tenía y la réplica atrasada no, se **trunca** — pérdida masiva y silenciosa de mensajes ya confirmados con `acks=all`. Default `false` desde 0.11; verificar que nadie lo activó "para arreglar una indisponibilidad" a las 3 AM.

**4. Errores del productor sin manejar.**
```java
// MAL: fire-and-forget involuntario, los errores desaparecen
producer.send(record);

// BIEN: manejar el resultado; tras delivery.timeout.ms el record se descarta
producer.send(record, (metadata, ex) -> {
    if (ex != null) {
        // TimeoutException, NotEnoughReplicas, RecordTooLargeException...
        deadLetterStore.persist(record, ex);   // o alerta + reintento controlado
    }
});
```
Vías concretas: callback ignorado; `RecordTooLargeException` (> `max.request.size`); buffer lleno + `max.block.ms` vencido en un hilo que traga la excepción; `delivery.timeout.ms` (120 s) agotado durante una indisponibilidad larga del clúster; y el clásico **apagado sin `producer.flush()`/`close()`**: todo lo que estaba en el RecordAccumulator muere con el proceso.

**5. Consumidor: auto-commit y commit prematuro.** Con `enable.auto.commit=true`, el consumidor comitea cada `auto.commit.interval.ms` (5 s) las posiciones del *último* `poll()`. Si el procesamiento es asíncrono o el proceso crashea tras el commit pero antes de terminar el batch, esos mensajes constan como consumidos y no se re-entregan: **pérdida en el lado consumidor** (at-most-once accidental). Solución: commit manual *después* de procesar.

**6. Retención y consumidores rezagados.** Si un consumidor está caído/lento más de `retention.ms` (7 días por defecto) o la partición supera `retention.bytes`, los segmentos se borran bajo sus pies. Al volver, `auto.offset.reset` decide: `latest` (default) salta silenciosamente al presente — hueco invisible; `earliest` reprocesa lo que quede; `none` lanza excepción (lo correcto para pipelines críticos + alerta de lag).

**Qué espera oír el entrevistador:** el recorrido sistemático por las tres capas, la trampa de `min.insync.replicas=1` con `acks=all`, el recordatorio de que Kafka no hace fsync por mensaje (la durabilidad es la replicación: un ISR entero en la misma AZ puede perder los últimos segundos), y la frase "la durabilidad es una propiedad de la cadena completa: el eslabón más débil define la garantía".

---

## 5. Consumer groups y rebalancing: eager vs cooperative, static membership y los dos timeouts
**Categoría:** Consumidor · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un consumer group reparte las particiones entre sus miembros vía un protocolo coordinado por el *group coordinator* (un broker). Un rebalance se dispara al entrar/salir un miembro, al expirar `session.timeout.ms` sin heartbeats, al exceder `max.poll.interval.ms` entre polls, o al cambiar la suscripción/particiones. El protocolo *eager* clásico revoca TODAS las particiones de todos (stop-the-world); el *cooperative/incremental* (KIP-429) solo mueve las que cambian de dueño. Static membership (`group.instance.id`) evita rebalances en reinicios rápidos. Confundir los dos timeouts es la causa nº 1 de rebalance loops.

### 📖 Respuesta detallada
**Mecánica del protocolo (clásico):** cada miembro envía `JoinGroup` al coordinator (el broker líder de la partición de `__consumer_offsets` que corresponde al hash del `group.id`); el coordinator elige un *group leader* (un consumidor) que ejecuta el assignor (`partition.assignment.strategy`: `range`, `round-robin`, `sticky`, `CooperativeStickyAssignor`) y reparte en `SyncGroup`.

**Eager vs cooperative:**
- **Eager:** al iniciarse un rebalance, *todos* los miembros revocan *todas* sus particiones, se paran, y reciben la nueva asignación. Un solo pod reiniciándose en un deployment de 50 congela el grupo entero N veces. Con estado (Streams) es aún peor: revocar = cerrar state stores.
- **Cooperative incremental (KIP-429, `CooperativeStickyAssignor`):** el rebalance ocurre en dos vueltas; solo se revocan las particiones que van a *cambiar de dueño*; el resto sigue procesando sin interrupción. Es el comportamiento correcto para deployments rolling, y la dirección del proyecto: en el protocolo nuevo KIP-848 (Kafka 4.0, `group.protocol=consumer`) es el único modo.

**Los dos timeouts (pregunta trampa favorita):**
- `session.timeout.ms` (45 s desde Kafka 3.0; antes 10 s): tiempo sin **heartbeats** para dar al consumidor por muerto. Los heartbeats los envía un **hilo de fondo** cada `heartbeat.interval.ms` (3 s) — NO dependen de tu código.
- `max.poll.interval.ms` (5 min): tiempo máximo entre **llamadas a `poll()`**. Esto sí depende de tu código: si procesar el batch tarda más, el consumidor se autoexcluye del grupo (deja de heartbeatear y aborta) y sus particiones se reasignan… mientras tu código *sigue procesando* → procesamiento duplicado + posible rebalance loop (pregunta 17).

```properties
max.poll.records=100          # menos records por poll si el procesamiento es lento
max.poll.interval.ms=600000   # o subir el margen: 10 min
session.timeout.ms=45000
heartbeat.interval.ms=3000    # regla: <= 1/3 de session.timeout
```

**Static membership (KIP-345):** con `group.instance.id=payment-consumer-pod-3`, el coordinator recuerda al miembro por identidad estática: si reinicia y vuelve dentro de `session.timeout.ms`, recupera sus particiones **sin rebalance**. Diseñado para Kubernetes (StatefulSets) y Streams con state stores grandes. Trade-off: si el pod muere de verdad, sus particiones quedan sin procesar hasta que expire el session timeout (por eso con static membership se sube a 1–2 min, no más).

**Qué dispara rebalances (checklist):** miembro entra/sale (deploy, scale, crash, OOMKill); `max.poll.interval.ms` excedido (dependencia lenta, batch pesado); `session.timeout.ms` sin heartbeats (GC total, red, CPU throttling); cambio en particiones o suscripción (regex que matchea un topic nuevo); coordinator failover.

**Errores comunes:** procesar en el mismo hilo del poll sin controlar duración; poner `session.timeout.ms` gigante "para evitar rebalances" (solo retrasa la detección de muertes reales); migrar a cooperative sin su procedimiento de rolling upgrade (todos los miembros deben soportarlo antes de retirar el assignor viejo).

**Qué espera oír el entrevistador:** la diferencia heartbeat-thread vs poll-loop, qué significa "stop-the-world" en eager y cómo cooperative lo elimina, static membership para rolling restarts, y la conexión con el caso típico de producción: "lag creciendo + rebalances continuos = casi siempre `max.poll.interval.ms`".

---

## 6. Gestión de offsets: auto-commit, commit manual, batch vs record, y qué pasa tras un crash
**Categoría:** Consumidor · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los offsets comiteados viven en el topic interno compactado `__consumer_offsets` y marcan "el siguiente offset a leer". `enable.auto.commit=true` comitea cada 5 s las posiciones del último `poll()`, lo que puede perder mensajes (commit antes de terminar de procesar) o duplicarlos (crash entre polls). El patrón robusto es commit manual **después** de procesar: `commitSync()` al final del batch (equilibrio rendimiento/re-entrega) o commit por record en casos críticos (caro: una escritura a `__consumer_offsets` por mensaje). Tras un crash siempre hay re-entrega desde el último commit: el procesamiento debe ser idempotente.

### 📖 Respuesta detallada
**Dónde viven.** Cada commit escribe un record `(group, topic, partition) → offset` en `__consumer_offsets` (50 particiones, compactado). El offset comiteado es el **siguiente a consumir**, no el último procesado — error de ±1 clásico: se comitea `record.offset() + 1`. Los offsets de grupos inactivos expiran a los 7 días (`offset.retention.minutes`): un consumidor que vuelve tarde puede quedarse sin posición y caer en `auto.offset.reset`.

**Los tres modos y sus fallos:**

1. **Auto-commit** (`enable.auto.commit=true`, `auto.commit.interval.ms=5000`). El commit ocurre *dentro de `poll()`* (y en `close()`): si pasaron 5 s, comitea las posiciones del poll anterior. Es *at-least-once* solo si procesas todo el batch síncronamente antes del siguiente poll; se rompe en cuanto despachas a un pool de hilos (el poll siguiente comitea mensajes aún no procesados → crash → **pérdida**).

2. **Commit manual por batch** — el patrón estándar:
```java
consumer = new KafkaConsumer<>(props);  // enable.auto.commit=false
while (running) {
    ConsumerRecords<String, Order> records = consumer.poll(Duration.ofMillis(500));
    for (ConsumerRecord<String, Order> r : records) {
        process(r);                       // procesar PRIMERO
    }
    consumer.commitSync();                // comitear DESPUÉS (posiciones actuales)
}
```
Ventana de duplicados = tamaño del batch. `commitAsync()` da mejor throughput pero no reintenta; el patrón maduro: `commitAsync` en el loop + `commitSync` en el shutdown y en `onPartitionsRevoked` del `ConsumerRebalanceListener` — sin esto, cada rebalance regala duplicados.

3. **Commit por record / por offsets explícitos:**
```java
consumer.commitSync(Map.of(
    new TopicPartition(r.topic(), r.partition()),
    new OffsetAndMetadata(r.offset() + 1)    // ¡+1! el siguiente a leer
));
```
Minimiza la re-entrega a 1 mensaje, pero cada commit es una escritura replicada: a 10K msg/s por consumidor es insostenible. Se reserva para mensajes de coste alto (cobros, envío de emails) — y aun así la solución de fondo es idempotencia, no granularidad de commit.

**Tras un crash — el razonamiento completo:** Kafka re-entrega TODO desde el último offset comiteado. No hay forma de evitar la ventana commit-vs-procesamiento entre dos sistemas: o comiteas antes (pérdida posible) o después (duplicado posible). At-least-once + **procesamiento idempotente** (upsert por clave natural o event-id) es la respuesta senior. La alternativa elegante: guardar el offset **en el mismo almacén y transacción que el resultado** y al arrancar hacer `consumer.seek()` a lo guardado — exactly-once *hacia esa base de datos* sin transacciones de Kafka.

**Errores comunes:** comitear antes de procesar "para no repetir"; olvidar el +1; `commitAsync` sin callback ni sync final; despachar a un executor manteniendo auto-commit.

**Qué espera oír el entrevistador:** que el commit es solo un puntero en un topic compactado, la imposibilidad estructural de evitar duplicados-o-pérdida sin idempotencia o commit transaccional junto al estado, y el patrón `ConsumerRebalanceListener` + commit en revocación.

---

## 7. Exactly-once en Kafka: transacciones, `read_committed`, `transactional.id` y zombie fencing. ¿Qué cubre y qué no?
**Categoría:** Fiabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Las transacciones de Kafka (KIP-98) hacen atómico el conjunto {escrituras a N particiones + commit de offsets del consumidor}: el patrón consume-transform-produce se ejecuta exactly-once *dentro del ecosistema Kafka*. El productor se registra con un `transactional.id` estable ante el *transaction coordinator*; cada `initTransactions()` incrementa una época que hace *fencing* de instancias zombie anteriores. Los consumidores con `isolation.level=read_committed` solo ven mensajes de transacciones comiteadas. Lo que NO cubre: cualquier side effect externo (llamada REST, email, escritura a otra BD) — eso se ejecuta aunque la transacción aborte.

### 📖 Respuesta detallada
**Las tres piezas de EOS:** (1) productor idempotente (PID + secuencias) elimina duplicados por retry; (2) transacciones dan atomicidad multi-partición; (3) `read_committed` da aislamiento en el consumidor. El patrón completo:

```java
props.put("transactional.id", "billing-processor-0");  // estable por "instancia lógica"
producer.initTransactions();   // registra PID, bump de época → fencing de zombies

while (running) {
    ConsumerRecords<String, Order> records = consumer.poll(timeout);
    if (records.isEmpty()) continue;
    producer.beginTransaction();
    try {
        for (var r : records) {
            producer.send(new ProducerRecord<>("invoices", r.key(), toInvoice(r.value())));
        }
        // los offsets se comitean DENTRO de la transacción:
        producer.sendOffsetsToTransaction(currentOffsets(records),
                                          consumer.groupMetadata());
        producer.commitTransaction();
    } catch (ProducerFencedException | OutOfOrderSequenceException e) {
        producer.close();       // otra instancia tomó el relevo; morir
        throw e;
    } catch (KafkaException e) {
        producer.abortTransaction();   // reintentar el batch entero
    }
}
```

**Mecánica interna que hay que poder narrar:**
- El **transaction coordinator** (un broker) mantiene el topic `__transaction_state`; el productor registra en la transacción cada partición a la que envía (`AddPartitionsToTxn`).
- `commitTransaction` es un **two-phase commit interno**: el coordinator escribe `PREPARE_COMMIT` en `__transaction_state` y luego inserta **control records** (markers COMMIT/ABORT) en cada partición implicada, incluida la de `__consumer_offsets`. Si el coordinator cae a mitad, recupera del log.
- **Zombie fencing:** el `transactional.id` mapea a un PID persistente + **época**. Cuando una instancia nueva llama a `initTransactions()` con el mismo id, la época sube; cualquier request de la instancia vieja (un zombie colgado en un GC de 2 minutos que "revive") recibe `ProducerFencedException`. Sin esto, el zombie comitearía trabajo duplicado.
- **`read_committed`:** el consumidor retiene mensajes hasta el marker de su transacción. Introduce el **LSO** (*Last Stable Offset*): no se entrega nada por encima de la primera transacción abierta. Consecuencia operativa: una transacción colgada (productor muerto sin abortar, hasta `transaction.timeout.ms`, 60 s default) **bloquea el avance de todos los consumidores read_committed** de esa partición — el lag sube sin que nadie procese nada.

**Qué cubre / qué no:**
- ✅ Consume de topics A → produce a topics B + offsets, atómico. Kafka Streams (`processing.guarantee=exactly_once_v2`) lo empaqueta.
- ❌ **Side effects externos.** Un `emailService.send()` dentro del bloque transaccional se ejecuta N veces si la transacción aborta y reintenta. Para sistemas externos: idempotencia downstream (idempotency keys), outbox pattern o sinks idempotentes. El consumidor final que escribe en Postgres sigue siendo at-least-once salvo que aplique sus propias técnicas.
- **Coste:** markers extra, latencia de commit, throughput menor (`commit.interval.ms=100` en Streams EOS vs 30000). EOS no es gratis ni default.

**Errores comunes:** creer que `enable.idempotence=true` ya es exactly-once end-to-end; usar `transactional.id` aleatorio por arranque (rompe el fencing: los zombies no se detectan); olvidar `isolation.level=read_committed` en los consumidores downstream (leen aborted data); meter llamadas HTTP dentro de la transacción esperando rollback.

**Qué espera oír el entrevistador:** "exactly-once processing dentro de Kafka, at-least-once con idempotencia fuera", la mecánica de época/fencing, el LSO y su efecto en el lag, y que sabes cuándo NO pagar el coste (telemetría, logs: at-least-once sobra).

---

## 8. ¿Cómo eliges el número de particiones de un topic y qué cuesta cambiarlo después?
**Categoría:** Diseño · **Tipo:** Conceptual

### 📝 Respuesta resumen
Las particiones son la unidad de paralelismo: el máximo de consumidores activos de un group = número de particiones. Se dimensiona por throughput objetivo (particiones ≥ max(T/throughput_productor_por_partición, T/throughput_consumidor_por_partición)) con margen de crecimiento 2–3×, típicamente 12–30 para un topic de servicio normal. Demasiadas particiones cuestan: más ficheros y memoria, failovers más largos, más presión en el controller, batches más pequeños. Añadir particiones después es un comando trivial que **rompe el mapeo hash de las claves**: el orden por clave se pierde en la transición y los procesadores con estado particionado quedan mal ruteados.

### 📖 Respuesta detallada
**El cálculo base (regla de Confluent):** mide el throughput alcanzable en UNA partición con tu configuración real (productor: 10–100 MB/s con batching; consumidor: a menudo el límite real, p. ej. 5 MB/s si el procesamiento es pesado). Para un objetivo T: `particiones = max(T / P_partición, T / C_partición)` con margen. Ejemplo: 60 MB/s objetivo, consumidor a 5 MB/s por partición → mínimo 12; con crecimiento ×2 → 24. Además:

- **Paralelismo máximo de consumidores:** 24 particiones = máximo 24 instancias útiles en el group; la 25 queda ociosa. Dimensionar mirando el *consumidor más lento* de todos los groups presentes y futuros.
- **Hot partitions:** el hash por clave reparte bien solo si la cardinalidad de claves es alta y uniforme. Con claves sesgadas (el 30% de eventos son del tenant "MegaCorp"), una partición concentra el tráfico y define el lag del grupo entero, da igual cuántas particiones haya. Mitigaciones: clave compuesta (`tenantId + "-" + (hash(entityId) % 8)`, sacrificando orden global por tenant) o repensar la clave.

**El coste de demasiadas particiones** (por qué "pon 1000 por si acaso" es mala respuesta):
1. **Recursos por partición:** cada una son ficheros abiertos (segmento + índices), buffers de réplica, y entradas de fetch. Miles de particiones por broker inflan heap y file descriptors.
2. **Failover y controller:** más particiones = más elecciones de líder que procesar cuando un broker cae → ventanas de indisponibilidad más largas (KRaft lo mejora enormemente, pero no lo hace gratis).
3. **Eficiencia de batching:** el productor batchea *por partición*; el mismo tráfico en 10× particiones produce batches 10× más pequeños → peor compresión, más requests, peor throughput.
4. En Streams: cada partición es una task con su state store y su changelog → RocksDB × N, restauraciones más largas.

**Cambiar después:**
```bash
kafka-topics.sh --alter --topic orders --partitions 36 --bootstrap-server broker:9092
```
Solo se puede **aumentar** (nunca reducir). Y aquí está el dolor con claves: la partición se elige como `hash(key) % numPartitions`; al cambiar el módulo, la clave `user-42` que iba a P3 ahora va a P17. Consecuencias: **orden roto en la transición** (eventos viejos en P3, nuevos en P17: un consumidor puede procesar el nuevo antes que el viejo — corrupción lógica para un ledger o CDC); **estado particionado desalineado** (un Streams tiene el estado de `user-42` en la task de P3 pero los eventos nuevos llegan a P17 → agregaciones que "se resetean"; Streams directamente rechaza el cambio en topics con estado); y compacted topics con la "última versión" de una clave repartida entre dos particiones.

Estrategias reales: sobredimensionar desde el diseño; o crear `orders-v2` con N particiones, migrar productores y drenar el viejo (el patrón limpio, también el único para *reducir*).

**Qué espera oír el entrevistador:** el cálculo por throughput con el consumidor como cuello típico, el techo de paralelismo, hot partitions como problema de *clave* y no de *cantidad*, y sobre todo que sepas explicar por qué `hash % N` hace que aumentar particiones no sea inocuo — mucha gente lo descubre en producción.

---

## 9. Retención vs compactación: `delete`, `compact`, tombstones y casos de uso de compacted topics
**Categoría:** Almacenamiento · **Tipo:** Conceptual

### 📝 Respuesta resumen
`cleanup.policy=delete` borra segmentos completos por edad (`retention.ms`, 7 días) o tamaño (`retention.bytes`): el topic es una ventana temporal de eventos. `cleanup.policy=compact` garantiza conservar **al menos el último valor por clave**: el log cleaner reescribe segmentos antiguos eliminando versiones obsoletas — el topic se vuelve un snapshot incremental (changelog). Un valor `null` es un *tombstone*: marca la clave para borrado y se purga tras `delete.retention.ms` (24 h). Casos de uso de compaction: changelogs de state stores de Streams, `__consumer_offsets`, cachés reconstruibles, CDC en modo "última versión de cada fila".

### 📖 Respuesta detallada
**Delete (semántica de eventos).** Se borran segmentos cerrados cuyo record más reciente supera `retention.ms` (el segmento activo nunca se toca). Matiz operativo: la granularidad es el **segmento** — con `segment.bytes=1GiB` y poco tráfico, un segmento tarda semanas en cerrarse y la retención efectiva excede la configurada; en topics de bajo tráfico se ajusta `segment.ms`. `retention.ms=-1` = infinito (event sourcing con replay total, viable a gran escala con tiered storage, KIP-405).

**Compact (semántica de estado).** El cleaner divide el log en *head* (sucio) y *tail* (limpio): construye un mapa clave→último-offset del head y reescribe el tail eliminando versiones obsoletas. Garantías y matices:
- Se conserva **al menos** el último valor por clave — no "solo" el último: los duplicados sobreviven hasta que el cleaner pase (`min.cleanable.dirty.ratio=0.5`: compacta cuando la mitad del log está sucia). Los consumidores DEBEN tolerar versiones intermedias.
- **El orden por clave se preserva**; los offsets no se renumeran (quedan huecos).
- `min.compaction.lag.ms`: tiempo mínimo que un record queda sin compactar (da a los consumidores en vivo una ventana para ver *todas* las versiones); `max.compaction.lag.ms` fuerza compactación (compliance/GDPR: garantizar que lo sobrescrito desaparece).
- **Tombstones:** `send(key, null)`. Para un lector que hace *bootstrap* del topic (leerlo entero para materializar un mapa), el tombstone significa "borra esta clave". Se retiene `delete.retention.ms=86400000` (24 h) tras la compactación para que los lectores en curso lo vean; después desaparece del todo. Bug clásico de GDPR/right-to-erasure: creer que publicar el tombstone borra ya — hasta que el cleaner pasa Y expira `delete.retention.ms`, los datos viejos siguen legibles.
- `cleanup.policy=compact,delete`: compacta Y aplica retención — usado en changelogs de ventanas de Streams (estado viejo caduca).

**Casos de uso donde compaction es la respuesta correcta:**
1. **Changelog de state stores (Kafka Streams):** si la instancia muere, otra restaura el store reproduciendo el changelog; compactado, la restauración es O(claves vivas), no O(historia).
2. **`__consumer_offsets`:** solo importa el último offset por (group, topic, partition) — el ejemplo canónico dentro del propio Kafka.
3. **Snapshot de referencia / caché distribuida:** precios, perfiles, feature flags: los servicios consumen el topic desde el principio y materializan un mapa (patrón *bootstrapping*, la base de KTable/GlobalKTable).
4. **CDC "última versión":** Debezium con clave = PK; el topic converge al contenido actual de la tabla.

**Errores comunes:** usar compaction para un stream de *eventos* (se comería eventos intermedios que sí importan) — compaction es para *estado* (upserts), delete para *hechos*; mensajes sin clave en un topic compactado (inválidos); no dimensionar el cleaner (`log.cleaner.dedupe.buffer.size`) en topics enormes; sorprenderse de que el head no está compactado.

**Qué espera oír el entrevistador:** la dicotomía eventos vs estado como criterio, la garantía exacta ("al menos el último por clave", head/tail), tombstones con su `delete.retention.ms`, y el vínculo con Streams: "un compacted topic es la forma durable de una tabla; un topic con retención es la forma durable de un stream — la dualidad stream-table".

---

## 10. Consumer lag: qué es exactamente, cómo se mide y cómo se ataca
**Categoría:** Operación · **Tipo:** Conceptual

### 📝 Respuesta resumen
El lag de una partición es `log-end-offset − committed-offset`: cuántos mensajes hay pendientes para ese group. Se mide con `kafka-consumer-groups.sh --describe`, con la métrica de cliente `records-lag-max`, o con herramientas dedicadas (Burrow, kafka-lag-exporter + Prometheus) que además evalúan la *tendencia*. Lag estable ≠ problema (es un buffer); lag creciente = el consumo no alcanza a la producción. Causas típicas: procesamiento lento (dependencias), rebalance loops, hot partitions, picos de producción, consumidor infra-dimensionado. Se ataca identificando primero si el lag es global, por partición o por instancia.

### 📖 Respuesta detallada
**Definición precisa.** Por partición: `lag = LEO − offset_comiteado` (con `read_committed`, contra el LSO — una transacción colgada infla el lag sin mensajes reales pendientes, matiz que delata experiencia). Importante: el lag en *mensajes* no dice cuánto *tiempo* de retraso llevas; para SLOs lo útil es el **time lag** (timestamp del último mensaje procesado vs now).

**Cómo medirlo:**
```bash
kafka-consumer-groups.sh --bootstrap-server broker:9092 \
  --describe --group billing-service

# GROUP    TOPIC   PART  CURRENT-OFFSET  LOG-END-OFFSET  LAG     CONSUMER-ID
# billing  orders  0     1500234         1500240         6       consumer-1-…
# billing  orders  1     1498001         1734500         236499  consumer-2-…  ← localizado
```
- **Métricas JMX del consumidor:** `records-lag-max`, `records-lag-avg`, `fetch-rate`, `records-consumed-rate`, y las del poll: `time-between-poll-avg`/`last-poll-seconds-ago` (oro para detectar polls lentos antes de que exploten en `max.poll.interval.ms`).
- **Burrow** (LinkedIn): en vez de umbrales absolutos evalúa **ventanas de offsets comiteados**: si el committed avanza y el lag baja → OK aunque sea grande; si no avanza → ERROR/STALLED. Elimina el falso positivo del umbral fijo durante picos.
- **kafka-lag-exporter / KMinion:** lag + derivada + time lag en Prometheus; alertar sobre `deriv(lag[10m]) > 0` sostenido, no sobre el valor absoluto.

**Árbol de diagnóstico (lo que un senior recita):**
1. **¿El lag crece o es constante?** Constante y acotado = buffer sano. Creciente = déficit de capacidad o fallo.
2. **¿Todas las particiones o algunas?** *Todas por igual* → problema global: throughput de procesamiento < producción, o rebalance loop (`rebalance-rate-per-hour`, logs de heartbeat). *Unas pocas* → hot partition o instancia enferma (el `CONSUMER-ID`/`HOST` del describe lo localiza). *CURRENT-OFFSET sin avanzar en nada* → consumidor colgado o transacción colgada bloqueando el LSO.
3. **¿Cambió la producción?** Comparar `MessagesInPerSec`; un pico legítimo con consumo a tope solo necesita tiempo o más capacidad.

**Cómo atacarlo:**
- **Rendimiento por mensaje:** batching hacia la dependencia (bulk insert), llamadas async con límite de in-flight, caches. Casi siempre la mayor palanca.
- **Paralelismo:** más instancias hasta el nº de particiones; después, más particiones o paralelismo intra-partición (pool de workers por clave con commit cuidadoso, o Confluent Parallel Consumer).
- **Tuning de fetch:** `fetch.min.bytes`/`fetch.max.bytes`, `max.partition.fetch.bytes` (1 MB default — sube si los mensajes son grandes), `max.poll.records` acorde a la duración de procesamiento.
- **Emergencias:** si el backlog es tóxico y perderlo es tolerable, `kafka-consumer-groups.sh --reset-offsets --to-latest --execute` con el grupo parado.

**Errores comunes:** alertar por lag absoluto (una alerta que llora en cada pico deja de leerse); escalar instancias por encima del nº de particiones; mirar solo el agregado y no ver que es UNA partición; olvidar que el lag también sube si se procesa pero los commits fallan.

**Qué espera oír el entrevistador:** la fórmula, la distinción lag-valor vs lag-tendencia (filosofía Burrow), el árbol global/partición/instancia, y time lag para SLOs. Puntos extra por mencionar el efecto del LSO con transacciones.

---

## 11. Kafka Streams: topología, state stores, RocksDB, changelogs, ventanas y EOS. ¿Cuándo Streams y cuándo un consumidor plano?
**Categoría:** Procesamiento · **Tipo:** Conceptual

### 📝 Respuesta resumen
Kafka Streams es una librería (no un clúster) que convierte topología declarativa (map/filter/join/aggregate) en tasks: una por partición de entrada, repartidas entre las instancias de la app vía el protocolo de consumer groups. El estado (agregaciones, joins, ventanas) vive en state stores locales sobre RocksDB, respaldados por changelog topics compactados que permiten restaurar el estado en otra instancia tras un fallo. Soporta ventanas (tumbling, hopping, session, sliding) con grace period para eventos tardíos, y EOS con `processing.guarantee=exactly_once_v2`. Usa Streams cuando hay estado, joins o ventanas; un consumidor plano basta para pipelines stateless o cuando el side effect es externo.

### 📖 Respuesta detallada
**Modelo de ejecución.** La topología (DSL o Processor API) se divide en *sub-topologías* separadas por reparticiones. Cada sub-topología × partición = una **task**, la unidad de paralelismo y de estado; las tasks se reparten entre los `num.stream.threads` de todas las instancias con el mismo `application.id` (que es también el `group.id`). Escalar = más instancias; el máximo útil = nº de particiones de entrada. Cuando una operación cambia la clave (`selectKey`, `groupBy`), Streams inserta un **repartition topic** interno — coste real en tráfico y almacenamiento. Y los joins exigen **co-partitioning**: mismo nº de particiones y misma estrategia de clave, o falla.

**Estado: RocksDB + changelog.**
- Cada state store es un RocksDB embebido en disco local (`state.dir`) — no cabe-en-heap no es problema; los stores de cientos de GB son normales.
- Cada escritura al store se publica también a un **changelog topic** (`<appId>-<store>-changelog`, compactado; con `compact,delete` para stores de ventana). Es la fuente de verdad durable: si la instancia muere, la task migra y **restaura** el store re-consumiendo el changelog.
- Restaurar un store grande tarda (minutos-horas); mitigaciones: **standby replicas** (`num.standby.replicas=1`: copia caliente, failover casi instantáneo) y static membership para que un reinicio no mueva tasks.
- Tuning RocksDB vía `rocksdb.config.setter` (memtables, block cache compartido) — el OOM por memoria *nativa* de RocksDB (fuera del heap) es un clásico: el pod muere por el límite del contenedor con el heap de la JVM impecable.

**Ventanas y tiempo.** Event time por defecto (timestamp del record, `TimestampExtractor` custom si va en el payload):
- *Tumbling* (fijas, sin solape), *hopping* (solapadas), *session* (por gaps de inactividad), *sliding* (relativas a cada evento, para joins).
- `grace period` (`ofSizeWithNoGrace` / `ofSizeAndGrace(…, Duration.ofMinutes(5))`): cuánto se aceptan eventos tardíos antes de cerrar la ventana. Default histórico de 24 h — sorpresa clásica: "¿por qué mis ventanas no emiten resultado final?".
- `suppress(Suppressed.untilWindowCloses(...))` para emitir solo el resultado final de la ventana en vez de cada actualización intermedia.

**EOS en Streams:** `processing.guarantee=exactly_once_v2` (KIP-447, desde 2.6; `exactly_once` v1 está deprecado) envuelve consume + updates de stores (vía changelog) + produce en transacciones de Kafka, con `commit.interval.ms=100`. Mismas fronteras que la pregunta 7: los side effects externos dentro de un `foreach` NO están cubiertos.

**Streams vs consumidor plano:**
- **Streams** cuando hay: agregaciones/joins/ventanas (te regala el estado tolerante a fallos, que a mano son cientos de líneas traicioneras), dualidad stream-table (KTable, GlobalKTable para lookups), EOS de serie, `interactive queries` para exponer el estado por API.
- **Consumidor plano** cuando: pipeline stateless (transformar y llamar a una API — o directamente Connect), control fino del threading/commit, o side effects externos como núcleo del trabajo. Tercera opción a nombrar: ksqlDB/Flink cuando el equipo quiere SQL u orquestación separada.

**Errores comunes:** ignorar los topics internos (repartition/changelog) en el capacity planning y en las ACLs; cambiar la topología incompatiblemente sin `application.reset` o sin versionar el `application.id`; joins sin co-partitioning; olvidar el grace period; el OOM nativo de RocksDB.

**Qué espera oír el entrevistador:** task = partición como unidad de estado y paralelismo, changelog + standby replicas como historia de recuperación, grace period vs latencia de resultados, y un criterio honesto de cuándo NO usar Streams.

---

## 12. Schema Registry: formatos, modos de compatibilidad, subject naming strategies y cómo se despliega un cambio de esquema
**Categoría:** Ecosistema · **Tipo:** Conceptual

### 📝 Respuesta resumen
Kafka transporta bytes; el contrato productor-consumidor lo gestiona el Schema Registry: los serializers registran/validan esquemas (Avro, Protobuf, JSON Schema) por *subject* y escriben en el mensaje un schema ID (formato wire: magic byte 0 + ID de 4 bytes). La compatibilidad se controla por subject: `BACKWARD` (default: el esquema nuevo lee datos viejos → se actualizan primero los consumidores), `FORWARD` (el viejo lee datos nuevos → primero productores), `FULL`, y sus variantes `_TRANSITIVE`. La subject strategy (`TopicNameStrategy` por defecto, `RecordNameStrategy`, `TopicRecordNameStrategy`) decide el ámbito del contrato. Un cambio se despliega: validar compatibilidad en CI → desplegar el lado correcto según el modo → registrar el esquema → desplegar el otro lado.

### 📖 Respuesta detallada
**Mecánica.** El `KafkaAvroSerializer` (o Protobuf/JsonSchema) busca/registra el esquema para el subject, cachea el **schema ID** y antepone al payload `[0x0][int32 id]`. El deserializer lee el ID, obtiene el writer schema (cache local) y decodifica — en Avro, resolviendo contra el reader schema. El registry guarda todo en el topic compactado `_schemas`: un servicio stateless con caché delante de Kafka. En producción: `auto.register.schemas=false` (los esquemas se registran desde CI/CD, no desde la app).

**Formatos:** **Avro** (compacto, evolución bien definida, defaults obligatorios para compatibilidad), **Protobuf** (ecosistema gRPC, field numbers que nunca se reutilizan), **JSON Schema** (legible, validación más laxa, payloads grandes). Las reglas de evolución difieren por formato: en Avro "añadir campo con default" es backward; en Protobuf casi todo añade-campo es compatible por diseño.

**Modos de compatibilidad — la parte que separa seniors:**

| Modo | Garantiza | Cambios permitidos (Avro) | Orden de despliegue |
|---|---|---|---|
| `BACKWARD` | esquema N lee datos de N−1 | borrar campos; añadir campos **con default** | **consumidores primero** |
| `FORWARD` | esquema N−1 lee datos de N | añadir campos; borrar campos con default | **productores primero** |
| `FULL` | ambos, contra N−1 | añadir/borrar solo campos con default | cualquiera |
| `*_TRANSITIVE` | lo mismo pero contra **todas** las versiones, no solo la última | — | — |
| `NONE` | nada (solo versionado) | todo | coordinación manual |

El razonamiento a verbalizar: `BACKWARD` protege al consumidor nuevo frente a datos viejos (incluidos los *retenidos en el topic*: replay!). Como en Kafka los datos viejos persisten días o años, `BACKWARD_TRANSITIVE` o `FULL_TRANSITIVE` es lo prudente para topics con retención larga o compactados — la compatibilidad "solo contra la última versión" no cubre releer un topic con 3 generaciones de esquemas.

**Subject naming strategies:** `TopicNameStrategy` (default): subject = `<topic>-value`/`<topic>-key`, un tipo por topic. `RecordNameStrategy`: subject = nombre del record — permite **varios tipos de evento en el mismo topic** (necesario cuando el orden entre tipos importa: event sourcing de una entidad). `TopicRecordNameStrategy`: `<topic>-<record>`, varios tipos con contrato scoped al topic. Con las dos últimas, la comprobación de compatibilidad ya no impide publicar un tipo *totalmente nuevo* al topic: el contrato pasa a ser disciplina de equipo.

**Flujo de despliegue de un cambio (respuesta esperada, paso a paso):**
1. El esquema vive en el repo (contrato como código). En CI: `mvn schema-registry:test-compatibility` o llamada a `POST /compatibility/subjects/orders-value/versions/latest` contra el registry.
2. Según el modo, decidir el orden de despliegue ("quién tiene que entender a quién"). "Añadir campo con default" es FULL y no duele; los cambios peligrosos son renombrar, quitar o cambiar tipos.
3. Registrar la nueva versión desde CD (`POST /subjects/orders-value/versions`), con `auto.register.schemas=false` en las apps.
4. Desplegar el otro lado. Nunca "los dos servicios a la vez y cruzar los dedos": con replay y lag, versiones viejas de datos conviven semanas.
5. Cambios incompatibles de verdad: topic nuevo (`orders-v2`) + migración, igual que una API v2.

**Errores comunes:** `auto.register.schemas=true` en prod; asumir que `BACKWARD` no transitiva protege el replay; ignorar el `-key` subject (cambiar el esquema de la clave cambia el particionado lógico).

**Qué espera oír el entrevistador:** el wire format con schema ID, la tabla modo→orden de despliegue razonada (no memorizada: "quién tiene que entender a quién"), transitive para datos retenidos, y esquemas gestionados por CI/CD como contrato, no por las apps en runtime.

---

## 13. Réplicas y durabilidad: `replication.factor`, `min.insync.replicas`, unclean election y rack awareness — el triángulo durabilidad/disponibilidad/latencia
**Categoría:** Fiabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
La durabilidad de Kafka es replicación, no fsync. La configuración canónica: `replication.factor=3`, `min.insync.replicas=2`, `acks=all`, `unclean.leader.election.enable=false` — tolera 1 broker caído sin perder ni parar, y con 2 caídos elige pararse antes que perder. Cada parámetro mueve una esquina del triángulo: más réplicas/acks = más durabilidad y latencia; permitir unclean election = disponibilidad a costa de perder datos confirmados; `min.insync.replicas=1` = disponibilidad silenciosamente comprada con durabilidad. `broker.rack` reparte réplicas entre AZs para que un fallo de zona no se lleve un ISR completo.

### 📖 Respuesta detallada
**Por qué replicación y no disco.** Kafka escribe al page cache y deja el fsync al SO; un mensaje confirmado con `acks=all` está en la *memoria* de ≥`min.insync.replicas` máquinas. La apuesta: N copias en máquinas/AZs independientes sobreviven mejor que 1 copia fsynceada. Corolario: los fallos **correlacionados** (misma AZ, mismo rack) son el enemigo real — de ahí rack awareness.

**La aritmética del quorum (hay que saber derivarla):**
- `replication.factor=RF`, `min.insync.replicas=MIR`, productor con `acks=all`.
- Tolerancia a fallos *sin pérdida ni parada*: `RF − MIR` brokers pueden caer y se sigue escribiendo.
- Con `RF=3, MIR=2`: cae 1 → ISR=2, todo sigue; caen 2 → ISR=1 < MIR → las escrituras `acks=all` se rechazan (`NotEnoughReplicasException`) pero **las lecturas siguen** y nada confirmado se perdió. Ese "parar de aceptar antes que mentir" es el diseño.
- `RF=3, MIR=1` (defaults si nadie lo toca): con ISR degradado a 1, `acks=all` confirma con una sola copia → la caída de ese último broker pierde datos confirmados. Es la mala configuración más común del mundo real.
- `RF=2`: no existe configuración buena (MIR=2 → cualquier broker caído para el topic; MIR=1 → sin durabilidad real). Por eso 3 es el mínimo serio, y `__consumer_offsets`/`__transaction_state` con RF=3 también (`offsets.topic.replication.factor=3`, `transaction.state.log.replication.factor=3`, `transaction.state.log.min.isr=2` — en clústeres levantados "de prueba" con 1 broker estos quedan en 1 y luego muerden).

**Unclean leader election.** Cuando muere el último miembro del ISR, la partición queda offline. Opciones: esperar a que vuelva una réplica del ISR (indisponible, sin pérdida) o `unclean.leader.election.enable=true`: promover una réplica fuera del ISR — su log va por detrás y todo lo posterior se descarta al re-sincronizar: pérdida de datos **ya confirmados con acks=all**. Legítimo solo donde disponibilidad > durabilidad (métricas, clickstream), y configurado *por topic*, no a nivel de clúster.

**Rack awareness.** `broker.rack=us-east-1a` (una AZ = un "rack"): el assignor coloca las RF copias en racks distintos, de modo que perder una AZ deja ISR≥2. Complemento moderno: **follower fetching** (KIP-392, `client.rack` + `replica.selector.class=RackAwareReplicaSelector`): los consumidores leen del follower de su AZ, recortando el coste de tráfico cross-AZ en cloud.

**El triángulo:** durabilidad ↑ (`acks=all`, MIR≥2, unclean=false, RF≥3) cuesta latencia de escritura (esperas al follower más lento del ISR) y disponibilidad de *escritura*; disponibilidad ↑ (unclean=true, MIR=1, `acks=1`) se paga con durabilidad, a menudo silenciosamente. No hay configuración correcta universal: un topic de pagos y uno de telemetría deben tener overrides distintos — esa frase en sí misma puntúa en la entrevista.

**Errores comunes:** confundir `min.insync.replicas` con "número de réplicas que quiero" (es el *mínimo del ISR para aceptar acks=all*, no un objetivo); creer que `acks=all` espera a las RF réplicas (espera al **ISR actual**); RF=3 con los tres brokers en la misma AZ; olvidar los topics internos; activar unclean global durante un incidente y no revertirlo.

**Qué espera oír el entrevistador:** la terna canónica 3/2/all/false con la aritmética `RF−MIR`, qué pasa exactamente en cada nivel de degradación, unclean como decisión de negocio por topic, y rack awareness + follower fetching como respuesta cloud (durabilidad ante caída de AZ y factura de tráfico).

---

## 14. Kafka Connect: workers, source/sink, converters, DLQ y casos típicos (CDC, data lake)
**Categoría:** Ecosistema · **Tipo:** Conceptual

### 📝 Respuesta resumen
Connect es el runtime declarativo para mover datos entre Kafka y sistemas externos sin escribir consumidores/productores a mano: un **source connector** trae datos hacia Kafka (Debezium/CDC, JDBC), un **sink** los saca (S3, Elasticsearch, JDBC). En modo distribuido, N workers forman un grupo que reparte las *tasks* (`tasks.max`) y guarda config, offsets y estado en tres topics internos, con rebalanceo y tolerancia a fallos gratis. Los **converters** (`Avro/Protobuf/JsonConverter`) traducen entre el formato interno de Connect y los bytes del topic; los SMTs transforman registros al vuelo. En sinks, `errors.tolerance=all` + `errors.deadletterqueue.topic.name` desvía los registros venenosos a una DLQ en vez de parar la task.

### 📖 Respuesta detallada
**Arquitectura.** Un clúster Connect distribuido = workers JVM idénticos con el mismo `group.id`, coordinados con el protocolo de grupos de Kafka (rebalanceo incremental cooperativo desde 2.3). Estado en Kafka mismo: `config.storage.topic` (configs, compactado), `offset.storage.topic` (posiciones de los *sources*: p. ej. binlog position de MySQL) y `status.storage.topic` (RUNNING/FAILED de conectores y tasks).
Los *sinks* no usan `offset.storage`: son consumer groups normales (`connect-<connector-name>`) con offsets en `__consumer_offsets`, monitoreables con las herramientas de lag habituales. Todo se administra por REST (`POST /connectors`, `GET /connectors/<n>/status`).

**Connector vs task:** el conector es el "cerebro" que decide el particionado del trabajo (qué tablas, qué particiones del topic) y genera hasta `tasks.max` tasks, que son las unidades que ejecutan y escalan entre workers. `tasks.max=1` es el cuello de botella silencioso más común en sinks (un solo hilo consumiendo 48 particiones).

**Converters — la fuente nº 1 de confusión:** el conector produce/consume objetos internos (`Struct` + `Schema` de Connect); el converter los materializa a bytes del topic. `key.converter`/`value.converter` se definen a nivel worker y se pueden sobreescribir por conector:
```json
{
  "name": "orders-s3-sink",
  "config": {
    "connector.class": "io.confluent.connect.s3.S3SinkConnector",
    "topics": "orders",
    "tasks.max": "4",
    "value.converter": "io.confluent.connect.avro.AvroConverter",
    "value.converter.schema.registry.url": "http://schema-registry:8081",
    "format.class": "io.confluent.connect.s3.format.parquet.ParquetFormat",
    "flush.size": "10000", "rotate.interval.ms": "600000",
    "errors.tolerance": "all",
    "errors.deadletterqueue.topic.name": "dlq.orders-s3-sink",
    "errors.deadletterqueue.context.headers.enable": "true"
  }
}
```
El error clásico: topic escrito en Avro + sink con `JsonConverter` → `DataException: Converting byte[] to Kafka Connect data failed`.

**Manejo de errores y DLQ.** Por defecto `errors.tolerance=none`: un registro venenoso (deserialización, SMT, conversión) mata la task (FAILED). Con `errors.tolerance=all`, los fallos de *conversión y transformación* se saltan o van a la DLQ (`errors.deadletterqueue.*`, solo sinks), con headers de contexto (topic, partición, offset, excepción) para reprocesar. Matiz senior: los errores **dentro del `put()` del sink** (fila que viola una constraint en JDBC) no pasan por la DLQ genérica salvo que el conector lo implemente; y los *sources* no tienen DLQ. `errors.retry.timeout` añade reintentos con backoff.

**Casos típicos que hay que saber contar:**
1. **CDC con Debezium** (source): lee el binlog/WAL y publica un topic por tabla con eventos before/after + snapshot inicial. Es LA forma de implementar el **outbox pattern** (tabla outbox + Debezium + SMT `EventRouter`), que resuelve el dual-write entre BD y Kafka. Garantía: at-least-once → consumidores idempotentes.
2. **Exportar a data lake** (sink S3/GCS): Parquet particionado por tiempo; el sink S3 logra exactly-once por nombres de fichero deterministas + escritura idempotente.
3. JDBC sink con `insert.mode=upsert` + `pk.mode=record_key` (idempotencia), Elasticsearch sink, y MirrorMaker 2 (que *es* un conjunto de conectores).

**Errores comunes:** escribir un microservicio consumidor para algo que era un sink de catálogo; `tasks.max=1`; converters desalineados; no monitorear el estado de tasks por REST/JMX (una task FAILED puede pasar días inadvertida sin alerta); tratar la DLQ como un agujero negro sin proceso de replay.

**Qué espera oír el entrevistador:** la separación conector/task/worker, los tres topics internos y que los sinks son consumer groups normales, converters como frontera de formato (y su error típico), el alcance real de la DLQ, y Debezium+outbox como patrón estrella.

---

## 15. Tuning de rendimiento: ¿por qué Kafka es rápido y dónde está normalmente el cuello de botella?
**Categoría:** Rendimiento · **Tipo:** Conceptual

### 📝 Respuesta resumen
Kafka es rápido por diseño, no por tuning: I/O secuencial append-only, page cache del SO como caché de lectura/escritura (sin caché propia en heap), zero-copy (`sendfile()`) del page cache al socket para consumidores al día, batching y compresión extremo a extremo (el broker no recomprime), y un modelo de red multiplexado con pocas syscalls. En producción el cuello casi nunca es la CPU del broker: suele ser la red (sobre todo el tráfico de replicación + consumidores rezagados que rompen el page cache), el disco solo cuando hay lecturas frías, y muy a menudo el *cliente* (batching pobre, fetch sizes por defecto, pocos in-flight).

### 📖 Respuesta detallada
**Los cinco mecanismos que hay que saber explicar:**

1. **I/O secuencial.** Append al final del segmento activo; lecturas normalmente secuenciales. El acceso secuencial a disco rivaliza con accesos aleatorios a memoria. No hay B-trees por mensaje: el índice es disperso (`index.interval.bytes=4096`, una entrada cada 4 KB) con búsqueda binaria + scan corto.
2. **Page cache, no heap.** El broker escribe al page cache y responde (fsync lo hace el SO; durabilidad = replicación). Los consumidores al día leen del page cache: RAM pura. Por eso los brokers llevan heaps modestos (~6 GB) y el resto de la RAM "libre" para el SO — poner el heap a 31 de 32 GB es un anti-patrón directo.
3. **Zero-copy.** Para consumidores cuyos datos están en page cache, el broker usa `sendfile()`/`FileChannel.transferTo`: page cache → NIC sin pasar por espacio de usuario (4 copias y 2 cambios de contexto menos). Matiz: **TLS rompe el zero-copy puro** (hay que cifrar en user space) — coste medible pero normalmente asumido.
4. **Batching + compresión end-to-end.** El productor comprime el batch; el broker lo almacena **tal cual** (sin descomprimir) y el consumidor lo descomprime. El broker mueve bloques opacos: CPU mínima por mensaje (1 request, 1 CRC por batch, 1 entrada de índice cada 4 KB).

**Dónde está el cuello en la práctica (orden de sospecha):**

1. **La red del broker.** Cada byte producido se multiplica: RF=3 → 1 entrada + 2 de replicación salientes + N consumer groups leyendo. Con 3 groups: 1 MB/s de producción ≈ 6 MB/s en NICs. En cloud, el límite de la instancia (y el *coste* cross-AZ) llega antes que el disco. Señales: `NetworkProcessorAvgIdlePercent` bajo, saturación de la NIC.
2. **Consumidores rezagados que rompen el page cache.** Un consumer que hace replay de 2 días fuerza lecturas frías de disco Y expulsa del page cache los datos calientes → *también* degrada a los consumidores al día. Es el modo de fallo en cascada más elegante de Kafka. Tiered storage (KIP-405) lo mitiga sirviendo lo frío desde object storage.
3. **El cliente.** Antes de tocar el broker, revisar: productor (`linger.ms`, `batch.size`, compresión, `max.in.flight`), consumidor (`fetch.min.bytes=1` default → subir a 64 KB+ con `fetch.max.wait.ms=500` para trades latencia/eficiencia; `max.partition.fetch.bytes=1MB` corto para mensajes grandes; `fetch.max.bytes=50MB`). El 80% de los "Kafka está lento" se arreglan aquí.
4. **Hilos del broker:** `num.network.threads` (8), `num.io.threads` (8), y las métricas reina: `RequestHandlerAvgIdlePercent` y `NetworkProcessorAvgIdlePercent` < 30% = broker saturado; `RequestQueueSize` creciendo = backpressure; `num.replica.fetchers` cuando la replicación no alcanza (ISR shrink bajo carga).
5. **Disco de verdad:** solo con replays masivos, compaction agresiva o EBS con burst agotado (`gp3` provisionado, nunca `gp2` a créditos para brokers serios).

**Números de referencia:** un broker en hardware moderno mueve cientos de MB/s; los benchmarks clásicos citan 2M+ msg/s en 3 máquinas modestas y p99 de pocos ms con `acks=all` intra-AZ. Si alguien reporta 5K msg/s con mensajes de 1 KB, el problema es de cliente o configuración, no de Kafka.

**Errores comunes:** heap gigante que estrangula el page cache; medir throughput con mensajes de 10 bytes sin batching y concluir que Kafka es lento; olvidar el multiplicador de replicación y consumo al dimensionar la red; TLS + compresión gzip en CPU-bound sin medir; culpar al broker sin mirar `records-lag` y configs del cliente.

**Qué espera oír el entrevistador:** los mecanismos con sus nombres (page cache, sendfile, batching end-to-end), la cadena "consumidor rezagado → cache eviction → todos sufren", el multiplicador de red por RF y fan-out, y la disciplina de mirar cliente → red → broker → disco, con métricas concretas (`RequestHandlerAvgIdlePercent`), no por intuición.

---

## 16. Multi-cluster y disaster recovery: MirrorMaker 2, Cluster Linking, active-passive vs active-active, offset translation y RPO/RTO
**Categoría:** Operación / DR · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un clúster Kafka bien configurado sobrevive a brokers y AZs, pero no a la pérdida de una región ni a errores lógicos: para eso hay replicación entre clústeres. **MirrorMaker 2** (basado en Connect) replica topics, configs, ACLs y offsets de grupos, con *offset translation* vía el topic `checkpoints` porque los offsets NO coinciden entre clústeres. **Cluster Linking** (Confluent) replica a nivel de protocolo preservando offsets — failover mucho más simple. Topologías: active-passive (más simple, RTO minutos y RPO = lag de replicación, típicamente segundos) y active-active (prefijos de topics para evitar ciclos, escrituras locales, complejidad de conflictos). La replicación es asíncrona: RPO cero no existe con MM2; para RPO≈0 se necesita stretch cluster multi-AZ/región con latencias bajas.

### 📖 Respuesta detallada
**Por qué no basta un clúster:** fallo regional completo, aislamiento de red prolongado, y —lo que se olvida— *errores lógicos* (borrado de topic, bug que corrompe datos: la replicación los replica igual de rápido; para eso hacen falta además backups/replay).

**MirrorMaker 2 (KIP-382).** Tres conectores sobre un clúster Connect: `MirrorSourceConnector` (datos + configs de topics + ACLs), `MirrorCheckpointConnector` (traducción de offsets de consumer groups), `MirrorHeartbeatConnector` (monitoreo de la conexión). Puntos clave:
- **Naming con prefijo:** el topic `orders` del clúster `eu` aparece en `us` como `eu.orders` (`DefaultReplicationPolicy`). Evita ciclos en active-active y hace explícito el origen; el precio: los consumidores en el clúster de destino deben suscribirse a `orders` **y** `eu.orders` (o usar `IdentityReplicationPolicy` sin prefijo, asumiendo el riesgo de ciclos y colisiones, común en active-passive puro).
- **Offset translation:** los offsets difieren entre clústeres (compaction, retención, arranques distintos). MM2 escribe en `<source>.checkpoints.internal` mapeos `offset_origen → offset_destino` por (group, partition), y la sincronización automática (`sync.group.offsets.enabled=true`, solo para grupos inactivos en destino) los materializa en el `__consumer_offsets` del destino. Sin esto, el failover de consumidores es "elige entre reprocesar horas o saltarte datos".
- **Garantía: at-least-once.** MM2 es un pipeline consume→produce sin transacciones entre clústeres: en el failover habrá **duplicados** cerca del punto de corte (y con `IdentityReplicationPolicy` mal montado, riesgo de bucles). Los consumidores post-failover deben ser idempotentes. RPO = lag de MM2 (monitorearlo como a cualquier grupo, con la métrica `replication-latency-ms`).

**Cluster Linking / geo-replicación nativa** (Confluent; análogos: MSK Replicator, Redpanda remote read replicas): el clúster destino hace fetch a nivel del protocolo de replicación y **preserva los offsets byte a byte** en *mirror topics* (read-only hasta la promoción). Failover: `promote` del mirror topic y los consumidores siguen con sus mismos offsets — sin traducción, sin duplicados por offsets desalineados. Menos piezas (no hay clúster Connect). Trade-off: producto comercial/vendor-specific; MM2 es lo portable.

**Topologías:**
- **Active-passive:** todo el tráfico al primario. Failover = (1) verificar lag/checkpoints, (2) redirigir productores (DNS/service discovery), (3) arrancar consumidores con offsets traducidos, (4) planear el *failback* — la parte que nadie ensaya: lo escrito en el secundario durante el incidente debe volver sin ciclos. RTO realista: minutos si está automatizado y **ensayado**; RPO: segundos (el lag).
- **Active-active:** cada región escribe en su clúster local y consume lo local + lo remoto (`orders` + `eu.orders`). Ventajas: latencia local, failover "gratis" para productores. Costes: consumidores agregando N topics, sin orden global entre regiones, y conflictos que resuelve tu dominio (last-write-wins, particionar usuarios por región de origen).
- **Stretch cluster** (un clúster sobre 3 AZs cercanas, rack awareness): RPO=0 real con `acks=all`, pero exige latencias bajas y no protege de errores lógicos.

**RPO/RTO:** RPO (datos perdibles) = lag de replicación en asíncrono; 0 solo con replicación síncrona (stretch). RTO = detección + decisión + redirección + offsets: lo dominan el runbook y la automatización, no la tecnología. Frase que puntúa: "el RTO real es el del último game day, no el del documento".

**Errores comunes:** montar MM2 y no replicar `__consumer_offsets`/checkpoints (failover de datos sin failover de *posición*); no monitorear el lag de MM2; DR jamás ensayado; ignorar el failback; asumir que la replicación protege contra `--delete --topic` (lo replica); olvidar schemas (el Schema Registry también necesita DR y los IDs deben coincidir o los mensajes replicados son ilegibles en destino).

**Qué espera oír el entrevistador:** MM2 = Connect + prefijos + checkpoints, por qué la traducción de offsets es necesaria y cuál es su alternativa (offsets preservados en Cluster Linking), duplicados como parte contractual del failover, la matriz active-passive/active-active con conflictos, y RPO/RTO ligados a lag y runbooks, no a marketing.

---

## 17. [CASO] El lag del consumer group de facturación crece sin parar desde ayer, pero el throughput de entrada no ha cambiado. Diagnostica
**Categoría:** Operación / Troubleshooting · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
El group `billing-service` (12 instancias, topic `invoices` de 24 particiones, ~2K msg/s estables desde hace meses) acumula lag creciente desde ayer a las 16:00. El dashboard muestra `MessagesInPerSec` plano. No hubo deploy de la app de facturación… aunque sí "cosas menores" en otros equipos. Los pods están `Running` y sin restarts. ¿Cómo lo diagnosticas y qué esperas encontrar?

### 📝 Respuesta resumen
Entrada constante + lag creciente = el *consumo efectivo* cayó. Las tres familias de causa, en orden de probabilidad: (1) **rebalance loop** — el grupo se pasa el día reasignando y nadie procesa (típicamente `max.poll.interval.ms` excedido porque el procesamiento por batch se alargó); (2) **procesamiento degradado** por una dependencia lenta (la latencia por mensaje subió de 20 ms a 400 ms: mismo código, quinta parte de throughput); (3) **desbalance**: una hot partition o una instancia enferma arrastran el agregado. El diagnóstico empieza con `kafka-consumer-groups --describe` para ver si el lag es global o localizado y si los offsets avanzan, y con las métricas de rebalance y de duración de poll.

### 📖 Respuesta detallada
**Paso 0 — precisar el síntoma (2 minutos):**
```bash
kafka-consumer-groups.sh --bootstrap-server broker:9092 --describe --group billing-service
```
Tres lecturas posibles que bifurcan todo el diagnóstico:
- **CURRENT-OFFSET avanza en todas las particiones pero más lento que LOG-END** → el grupo procesa, pero menos: degradación de throughput (ir a paso 2).
- **CURRENT-OFFSET congelado en todas** → nadie comitea: rebalance loop, deadlock, o commits fallando (paso 1).
- **Lag concentrado en 2–3 particiones** → hot partition o instancia enferma (paso 3). Anotar el `CONSUMER-ID`/`HOST` de las particiones retrasadas.
Ejecutarlo dos veces con 60 s de diferencia: la *derivada* del CURRENT-OFFSET es el dato, no la foto.

**Paso 1 — ¿rebalance loop?** Señales: la columna CONSUMER-ID cambia entre ejecuciones del describe; métrica `rebalance-rate-per-hour` alta y `failed-rebalance-rate-per-hour` > 0; logs del consumidor con el mensaje canónico:
```
Member consumer-billing-7 sending LeaveGroup request to coordinator
(reason: consumer poll timeout has expired. This means the time between
subsequent calls to poll() was longer than the configured max.poll.interval.ms)
```
**El mecanismo del loop** (esto es lo que el entrevistador quiere oír completo): el procesamiento de un batch pasa a tardar más de `max.poll.interval.ms` (5 min) → el heartbeat thread expulsa al miembro → rebalance (con assignor *eager*: todo el grupo se detiene) → sus particiones van a otra instancia, que recibe el mismo trabajo lento + el backlog acumulado → también excede el timeout → rebalance otra vez. El grupo entero entra en un ciclo donde el tiempo se va en reasignar y reprocesar (los offsets no comiteados se re-entregan), el lag crece y el CPU está *alto*, lo que despista. Disparadores típicos sin deploy propio: un mensaje "veneno" que tarda minutos (payload gigante, bucle en el parser), una dependencia que pasó de 20 ms a 3 s (paso 2), o `max.poll.records` alto que siempre estuvo al límite y ayer cruzó la línea.
**Mitigación inmediata:** bajar `max.poll.records` (500 → 50) o subir `max.poll.interval.ms` para romper el ciclo y dejar que el grupo se estabilice; después arreglar la causa. Estructural: cooperative rebalancing (`CooperativeStickyAssignor`), static membership si el disparador eran reinicios, y presupuesto de tiempo por batch (procesamiento con timeout).

**Paso 2 — ¿procesamiento degradado?** "No hubo deploy de facturación" ≠ "nada cambió": facturación llama a servicios de otros equipos (los de las "cosas menores"). Comprobar:
- Latencia por mensaje en las trazas/APM: si `process()` pasó de 20 ms a 400 ms, el techo teórico por instancia cae 20×. Con 12 instancias × 24 particiones, 2 particiones por instancia y procesamiento secuencial: throughput_max = 24 particiones × (1000/400) ≈ 60 msg/s… contra 2000 de entrada. Las cuentas delatan el problema en 30 segundos.
- Sospechosos: API de impuestos/cliente con latencia alta (timeout+retry por mensaje es el multiplicador clásico: 2 retries × 5 s timeout = 15 s por mensaje), pool de conexiones a BD agotado, GC de la propia app (un GC enfermo también dispara `session.timeout.ms`). Sin APM, lo confirman las métricas de cliente: `time-between-poll-avg` disparado con `fetch-rate` normal.

**Paso 3 — ¿desbalance?** Si el lag vive en pocas particiones:
- **Hot partition:** ayer a las 16:00 un tenant grande empezó a emitir masivamente, o un productor cambió la clave de particionado (deploy de *otro* equipo). Verificar con el ratio de mensajes por partición en dos instantes. Solución corta: nada elegante — una partición la consume un solo hilo; optimizar el coste por mensaje. Larga: rediseñar la clave.
- **Instancia enferma:** mismo host en todas las particiones retrasadas → CPU throttling, vecino ruidoso, GC o hilo bloqueado (thread dump). `kubectl delete pod` como mitigación y autopsia después.

**Causas adicionales para cerrar:** transacción colgada aguas arriba bloqueando el LSO con `read_committed` (lag sube sin nada que leer); `CommitFailedException` tras rebalances (procesa pero no comitea → el lag medido crece).

**Qué espera oír el entrevistador:** método (describe dos veces → global/congelado/localizado), el mecanismo completo del rebalance loop con el mensaje de log y su mitigación en dos tiempos, la aritmética latencia×particiones como techo de throughput, y la sospecha instintiva de que "no desplegamos nada" nunca es cierto en un sistema distribuido.

---

## 18. [CASO] Tras un failover de broker aparecieron miles de duplicados en downstream. ¿Por qué y cómo lo evitas?
**Categoría:** Fiabilidad / Troubleshooting · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
Anoche un broker cayó y las particiones que lideraba hicieron failover (ISR sano, sin unclean election, sin pérdida de datos). Esta mañana, el equipo del ERP reporta miles de pedidos duplicados llegados desde el consumidor que exporta `orders` al ERP. La cadena: productores → `orders` → consumer group `erp-export` → API del ERP. ¿De dónde salen los duplicados y qué cambiarías para que no vuelva a pasar?

### 📝 Respuesta resumen
Un failover convierte en visibles las dos ventanas de duplicación de cualquier despliegue at-least-once: (1) **productores sin idempotencia**: durante el failover hubo timeouts de acks y los `retries` reenviaron batches que sí se habían escrito — duplicados *dentro del topic*; (2) **consumidores con offsets no comiteados**: el rebalance (el coordinator o las conexiones se vieron afectadas) re-entregó los mensajes procesados-pero-no-comiteados desde el último commit, y el exportador llamó al ERP otra vez — duplicados *en el downstream* aunque el topic esté limpio. La solución en capas: `enable.idempotence=true` en productores, commits disciplinados (batch pequeño + commit en `onPartitionsRevoked`), y —la única garantía real— **idempotencia end-to-end**: idempotency key hacia el ERP o dedupe por event-id, porque at-least-once + failover = duplicados por contrato.

### 📖 Respuesta detallada
**Primero: localizar dónde nació el duplicado.** Es la pregunta que ordena todo el análisis, y se responde mirando el topic: ¿hay records físicamente repetidos (mismo contenido, offsets distintos) en `orders`, o el topic está limpio y el ERP recibió dos veces el mismo offset?
```bash
# muestrear alrededor de la ventana del incidente
kafka-console-consumer.sh --bootstrap-server broker:9092 --topic orders \
  --partition 7 --offset 1500000 --max-messages 5000 \
  --property print.offset=true --property print.key=true | sort ... | uniq -d
```

**Vía A — duplicados en el topic: retries sin idempotencia.** Durante el failover, un batch se escribe y replica pero el ack no vuelve (broker muriendo, `request.timeout.ms=30s` vencido); el productor, con `retries` (default `Integer.MAX_VALUE` dentro de `delivery.timeout.ms=120s`), lo reenvía al líder nuevo → segunda copia física. Con decenas de productores y varios segundos de failover, "miles" salen fáciles. Auditar los productores reales, no asumir el default: la idempotencia es default desde Kafka 3.0 pero se desactiva silenciosamente con `acks=1` u otras configs incompatibles, y cuentan los "productores" no obvios (MM2 y la mayoría de sources de Connect son at-least-once por diseño). Además, un reintento a nivel de *aplicación* (re-llamar a `send()` tras un `TimeoutException`) crea un mensaje nuevo que el PID+secuencia **no** deduplica.
**Fix:** `enable.idempotence=true` + `acks=all`, sin retries de aplicación desnudos: el broker descarta los reenvíos por (PID, secuencia) incluso a través del failover de líder (las secuencias se replican con el log).

**Vía B — topic limpio: el consumidor reprocesó.** El failover tocó al `erp-export` por dos caminos: (a) el broker caído era el **group coordinator** del grupo (líder de su partición de `__consumer_offsets`) → rebalance; (b) los fetch a las particiones movidas fallaron y hubo reasignaciones. En cualquier rebalance, el nuevo dueño arranca **desde el último offset comiteado**: si el exportador comitea cada 30 s o cada 1000 mensajes, esa es la ventana de re-entrega — por partición — y todo lo procesado-no-comiteado llamó al ERP dos veces con topic impecable. Agravantes a buscar: `commitAsync()` sin manejo de fallo, ausencia de `ConsumerRebalanceListener.onPartitionsRevoked` con commit final, auto-commit con procesamiento asíncrono.
**Fix:** commits síncronos al cerrar cada batch razonable, commit en `onPartitionsRevoked`, cooperative rebalancing, y dimensionar la ventana de re-entrega conscientemente (es tu "unidad de duplicación").

**La capa que lo resuelve de verdad: idempotencia end-to-end.** Aunque A y B estén perfectos, at-least-once sigue siendo at-least-once (crash del consumidor tras llamar al ERP y antes de comitear: inevitable). Un senior lo dice explícitamente: *los duplicados no son un bug del failover, son el contrato; el failover solo los hizo visibles en masa*. Opciones por orden de robustez:
1. **Idempotency key en el ERP:** `PUT /orders/{orderId}` o header `Idempotency-Key: <event-id>` — el ERP deduplica. La solución correcta si controlas o puedes pedir la API.
2. **Dedupe en el exportador:** almacén de event-ids procesados (tabla con unique constraint, Redis SETNX con TTL > ventana máxima de re-entrega) escrito atómicamente con la exportación; o guardar `(partition, offset)` en la misma transacción que el efecto y descartar offsets ya vistos.
3. **Transacciones de Kafka** si el downstream fuera otro topic — aquí no aplican porque el sink es HTTP, justo lo que las transacciones no cubren.

Y cerrar con proceso: probarlo matando brokers en staging (chaos testing) — un failover no debería ser la primera vez que el sistema ejercita estos caminos.

**Qué espera oír el entrevistador:** la bifurcación "¿duplicado en el topic o en el downstream?" como primer movimiento, los dos mecanismos con sus parámetros (`retries`/`delivery.timeout.ms`/PID-secuencia; coordinator failover/offsets no comiteados), el límite de la idempotencia del productor frente a retries de aplicación, y la tesis final: en sistemas at-least-once la deduplicación downstream no es opcional, es diseño — las capas de productor y consumidor solo *reducen* la ventana; la downstream la *elimina*.



