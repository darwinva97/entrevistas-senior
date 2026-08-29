# Entrevistas Técnicas — Mensajería y Event-Driven (Kafka · RabbitMQ · Colas)

Banco de preguntas de entrevista sobre **mensajería, colas y arquitecturas event-driven**: el terreno donde se deciden las entrevistas de microservicios en entornos corporativos. Cada pregunta incluye una respuesta resumen (30–60 segundos) y una respuesta detallada con configuración real, trade-offs, errores comunes y lo que el entrevistador espera oír.


> 🎓 **¿Te faltan bases para responder esto?** El curso [Mensajería y streaming](../cursos/10-mensajeria-y-streaming/) enseña exactamente lo necesario, con laboratorios y autoevaluación.
> Ver también: [índice completo](../INDICE.md) · [plan de estudio](../PLAN-DE-ESTUDIO.md) · [glosario](../GLOSARIO.md) · [inicio](../README.md)

## Archivos

| Archivo | Contenido | Preguntas |
|---|---|:-:|
| [01-fundamentos-de-mensajeria.md](01-fundamentos-de-mensajeria.md) | Semánticas de entrega, idempotencia, outbox, ordering, DLQ, event sourcing, CQRS, sagas, schema evolution | 15 |
| [02-kafka.md](02-kafka.md) | Kafka a fondo: réplicas e ISR, particiones, consumer groups, offsets, EOS, Streams, Connect, tuning, DR | 18 |
| [03-rabbitmq-y-otros-brokers.md](03-rabbitmq-y-otros-brokers.md) | RabbitMQ (AMQP, quorum queues, prefetch, alarmas) y comparativa con SQS/SNS, NATS y Pulsar | 14 |
| [04-casos-y-problemas.md](04-casos-y-problemas.md) | Casos de producción [CASO]: lag, rebalances, hot partitions, duplicados, DLQ, sagas colgadas, migraciones | 12 |

**Total: 59 preguntas.**

---

## Índice de preguntas

### 01 — Fundamentos de mensajería y event-driven

1. ¿Por qué meterías una cola entre dos servicios? ¿Qué compras y qué pagas?
2. Semánticas de entrega: at-most-once, at-least-once, exactly-once. ¿Por qué exactly-once end-to-end es un mito?
3. ¿Cómo haces un consumidor idempotente? Claves de idempotencia, tabla inbox, dedupe y TTL
4. Patrón outbox transaccional: ¿por qué el dual write está prohibido y cómo lo implementa Debezium?
5. Ordering: ¿qué garantiza realmente un broker y qué haces cuando el orden importa de verdad?
6. Backpressure y colas: ley de Little, productor más rápido que el consumidor, límites y load shedding
7. Dead letter queues: ¿cuándo envías un mensaje, qué metadatos guardas y cómo reprocesas?
8. Event notification vs event-carried state transfer vs event sourcing: diferencias y cuándo usar cada uno
9. Event sourcing en serio: qué resuelve, qué complica y cuándo NO usarlo
10. CQRS: ¿qué es de verdad, qué relación tiene con los eventos y cómo manejas la consistencia eventual en la UI?
11. Sagas: coreografía vs orquestación, compensaciones, timeouts y dónde vive el estado
12. Colas de comando vs topics de eventos: ¿qué diferencia semántica hay y quién es dueño del contrato?
13. Schema evolution en eventos: compatibilidad backward/forward/full, schema registry y cómo migrar consumidores
14. Reintentos: backoff exponencial con jitter, retry topics, retry budget y cuándo NO reintentar
15. **[CASO]** Comunicación entre el servicio de pedidos y 6 servicios downstream

### 02 — Apache Kafka

1. Arquitectura de Kafka: brokers, topics, particiones, réplicas e ISR. ¿Por qué es un log distribuido y no una cola?
2. KRaft vs ZooKeeper: ¿qué cambió exactamente y por qué el proyecto migró?
3. El productor por dentro: batching, `linger.ms`, compresión, particionador sticky, `acks` e idempotencia
4. ¿Cuándo se puede perder un mensaje en Kafka? Enumera todas las vías
5. Consumer groups y rebalancing: eager vs cooperative, static membership y los dos timeouts
6. Gestión de offsets: auto-commit, commit manual, batch vs record, y qué pasa tras un crash
7. Exactly-once en Kafka: transacciones, `read_committed`, `transactional.id` y zombie fencing
8. ¿Cómo eliges el número de particiones de un topic y qué cuesta cambiarlo después?
9. Retención vs compactación: `delete`, `compact`, tombstones y compacted topics
10. Consumer lag: qué es exactamente, cómo se mide y cómo se ataca
11. Kafka Streams: topología, state stores, RocksDB, changelogs, ventanas y EOS
12. Schema Registry: formatos, modos de compatibilidad y despliegue de un cambio de esquema
13. Réplicas y durabilidad: el triángulo durabilidad/disponibilidad/latencia
14. Kafka Connect: workers, source/sink, converters, DLQ y casos típicos (CDC, data lake)
15. Tuning de rendimiento: ¿por qué Kafka es rápido y dónde está normalmente el cuello de botella?
16. Multi-cluster y disaster recovery: MirrorMaker 2, Cluster Linking, offset translation y RPO/RTO
17. **[CASO]** El lag del consumer group de facturación crece sin parar, pero el throughput de entrada no cambió
18. **[CASO]** Tras un failover de broker aparecieron miles de duplicados en downstream

### 03 — RabbitMQ y otros brokers

1. El modelo AMQP 0-9-1: exchanges, bindings, routing keys y colas
2. Acks de consumidor y publisher confirms: ¿qué garantiza cada mecanismo?
3. Quorum queues vs classic mirrored queues
4. `basic.qos` / prefetch: ¿qué controla exactamente y cómo lo dimensionas?
5. TTL, dead-letter exchanges y colas de retraso: retry con backoff y sus trampas
6. Flow control: memory/disk alarms y credit flow
7. Clustering y particiones de red: `pause_minority`, federation y shovel
8. RabbitMQ Streams: qué añaden y cuándo elegirlos frente a Kafka
9. Kafka vs RabbitMQ: criterio de elección de un senior
10. SQS y SNS: standard vs FIFO, visibility timeout, DLQs y fan-out
11. NATS y JetStream: qué garantiza cada capa y dónde encajan
12. Apache Pulsar: separación compute/storage, multi-tenancy y subscriptions
13. **[CASO]** Memory alarm en RabbitMQ: publishers colgados y colas creciendo
14. **[CASO]** Mensaje envenenado con `requeue=true`: 4 consumidores al 100% de CPU en bucle

### 04 — Casos y problemas de producción

1. **[CASO]** Rebalance storm: el consumer group entra en bucle de rebalanceos
2. **[CASO]** Partición caliente: una de 24 concentra el 40% del tráfico
3. **[CASO]** Duplicados masivos tras un incidente: cobros repetidos downstream
4. **[CASO]** Mensajes fuera de orden tras escalar de 1 a 8 consumidores
5. **[CASO]** El outbox se atasca: eventos que llegan horas tarde
6. **[CASO]** DLQ desbordada un lunes: 200.000 mensajes y nadie sabe cuáles reprocesar
7. **[CASO]** Kafka "pierde" mensajes de auditoría: la conciliación mensual detecta huecos
8. **[CASO]** RabbitMQ: la cola que crece hasta tirar el nodo cada Black Friday
9. **[CASO]** Schema roto en cascada: cinco consumidores muertos a la vez
10. **[CASO]** Consumidor lento por dependencia: cada mensaje llama a una API con p99 de 3 s
11. **[CASO]** Saga colgada: pedidos 6 horas en RESERVANDO_STOCK
12. **[CASO]** Migración de RabbitMQ a Kafka en caliente, sin parar producción

## Cómo usar este material

- **Primero la teoría, luego el broker:** el fichero 01 es transversal; si dudas ahí, los ficheros de Kafka y RabbitMQ te van a costar el doble.
- **En los [CASO], dibuja antes de leer:** productor → broker → consumidor, y marca en qué tramo se pierde/duplica/desordena el mensaje. Ese diagrama es el 80% de la respuesta.
- **Responde en voz alta y cronometrado:** 30–60 segundos con la respuesta resumen; si el entrevistador quiere más, ahí está la detallada.
