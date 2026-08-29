# Fundamentos de Mensajería y Arquitecturas Event-Driven — Preguntas de Entrevista Senior

Banco de preguntas sobre fundamentos de mensajería asíncrona y arquitecturas event-driven: semánticas de entrega, idempotencia, outbox, ordering, backpressure, DLQs, event sourcing, CQRS, sagas, evolución de esquemas y reintentos. Las respuestas son agnósticas de broker (Kafka, RabbitMQ, SQS, Pub/Sub) pero bajan al detalle concreto cuando el mecanismo lo exige, porque eso es lo que distingue a un senior de alguien que recita definiciones.

---

## 1. ¿Por qué meterías una cola entre dos servicios? ¿Qué compras y qué pagas?
**Categoría:** Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una cola compra **desacoplo temporal** (el consumidor puede estar caído o lento sin tumbar al productor), **buffering** de picos (absorbe ráfagas que un servicio síncrono rechazaría con 503), **backpressure natural** y escalado independiente de ambos lados. Lo que pagas: **latencia extra** (de milisegundos a segundos según el broker y la carga), **consistencia eventual** (el productor ya no sabe si el trabajo se hizo), **complejidad operativa** (un sistema distribuido más que monitorizar, dimensionar y actualizar) y un modelo de errores mucho más difícil: reintentos, duplicados, orden y mensajes envenenados pasan a ser tu problema.

### 📖 Respuesta detallada
La pregunta de fondo es siempre la misma: ¿el llamante necesita el **resultado** de la operación para continuar, o solo necesita que la operación **ocurra**? Si necesita el resultado (validar un pago antes de confirmar el pedido), la cola no te libra de esperar; solo añade saltos. Si solo necesita que ocurra (enviar un email, actualizar analítica), la cola es casi siempre la respuesta correcta.

**Qué compras, con mecanismo:**

1. **Desacoplo temporal (availability decoupling).** Con REST, la disponibilidad compuesta de una cadena de N servicios es el producto de las disponibilidades: 5 servicios al 99.9% en serie dan ~99.5% (43 min/mes → 3.6 h/mes de error budget consumido). Con una cola, el productor solo depende del broker (normalmente lo más disponible del sistema). Un deploy o caída del consumidor se convierte en *lag* en vez de en errores 5xx.
2. **Buffering / absorción de picos.** Un servicio síncrono dimensionado para 500 req/s rechaza el pico de 5.000 req/s del Black Friday. Una cola lo absorbe y el consumidor drena a su ritmo. La pregunta senior es: ¿cuánto lag es aceptable? Si llegan 5.000 msg/s y procesas 500 msg/s, acumulas 4.500 msg/s; un pico de 10 minutos son 2.7M de mensajes, que a 500 msg/s tardan **90 minutos** en drenarse. El buffering no crea capacidad, solo la difiere.
3. **Backpressure explícito.** El consumidor hace *pull* a su ritmo (Kafka `poll()`, SQS `ReceiveMessage`); nadie le empuja más de lo que puede tragar. En síncrono, el backpressure es implícito y feo: timeouts, thread pools agotados, colas internas invisibles.
4. **Fan-out y evolución.** Añadir un quinto consumidor a un topic no toca al productor; en síncrono, cada nuevo interesado es código y un modo de fallo nuevos en él.

**Qué pagas, con números:**

- **Latencia:** un hop de Kafka bien afinado añade 5–20 ms p99; SQS estándar 10–100 ms. Pero bajo lag, la latencia efectiva es *lag/throughput*: minutos u horas. Nunca prometas "tiempo real" sobre una cola sin monitorizar lag.
- **Consistencia eventual:** el productor recibe ack del broker, no del negocio. La UI puede mostrar "pedido creado" mientras stock aún no lo ha visto; se diseña para ello (estados "procesando"), no se descubre en producción.
- **Semántica de errores:** en síncrono, un 400 llega al llamante y alguien decide. En asíncrono, ¿quién se entera de que el mensaje falló 3 horas después? Necesitas DLQs, alertas y reprocesamiento (preguntas 7 y 14).
- **Operación y debugging:** el broker es un sistema distribuido más que dimensionar, retener y actualizar (autogestionar Kafka cuesta fácilmente 0.5–1 FTE), y sin trazas propagadas en headers (W3C `traceparent`), reconstruir "qué pasó con el pedido 4711" es arqueología.

**Errores comunes:** meter cola "porque microservicios" en un flujo request/response (y acabar haciendo polling del resultado, reimplementando RPC mal); usar la cola como base de datos (retención infinita "por si acaso"); y no definir qué pasa cuando el broker está caído — el productor también necesita un plan (outbox, pregunta 4).

**Qué espera oír el entrevistador:** el criterio "¿necesito el resultado o solo que ocurra?", que la cola difiere capacidad pero no la crea, números de disponibilidad compuesta, y que menciones el coste operativo y de consistencia sin que te lo pregunten. Un buen cierre: "la cola no elimina el acoplamiento, lo transforma: pasas de acoplamiento temporal a acoplamiento por contrato de mensaje, que es más barato pero no gratis".

---

## 2. Semánticas de entrega: at-most-once, at-least-once, exactly-once. ¿Por qué exactly-once end-to-end es un mito?
**Categoría:** Semánticas de entrega · **Tipo:** Conceptual

### 📝 Respuesta resumen
*At-most-once*: ack antes de procesar; si el consumidor muere, el mensaje se pierde. *At-least-once*: ack después de procesar; si el consumidor muere entre procesar y ack, el mensaje se reentrega → duplicados. *Exactly-once* de verdad, extremo a extremo, es imposible cuando el procesamiento tiene efectos fuera del sistema de mensajería (una API externa, un email): no puedes hacer atómico "efecto externo + ack". Lo que existe es *exactly-once processing* dentro de un dominio transaccional cerrado (Kafka transactions para read-process-write dentro de Kafka) y, para todo lo demás, la práctica estándar: **at-least-once + consumidores idempotentes**, que produce el mismo resultado observable.

### 📖 Respuesta detallada
El problema es dónde colocas el ack respecto al procesamiento:

```
at-most-once:   receive → ack → process     (crash tras ack = mensaje perdido)
at-least-once:  receive → process → ack     (crash tras process = duplicado)
```

No hay tercera opción porque *process* y *ack* son dos operaciones en dos sistemas distintos y no existe commit atómico entre ambos — es la versión mensajería del problema de los dos generales. Cualquier "exactly-once" comercial es una de estas dos cosas:

1. **Exactly-once processing en un dominio cerrado.** Kafka lo ofrece para pipelines read-process-write *dentro de Kafka* (Kafka Streams, `processing.guarantee=exactly_once_v2`): offset consumido y mensajes producidos se escriben en la misma transacción de broker, con producer idempotente (dedupe por `(producer id, sequence)` por partición; default desde Kafka 3.0) y downstream en `isolation.level=read_committed`. En cuanto el "write" es un INSERT en Postgres o un POST a Stripe, la transacción ya no lo cubre.
2. **At-least-once + deduplicación**, que es lo que hacen SQS FIFO (`MessageDeduplicationId` con ventana de **5 minutos** — un duplicado a los 6 minutos pasa) y la mayoría de "exactly-once delivery" de marketing.

**La configuración del productor también importa.** At-least-once empieza en el productor:

```properties
# Productor Kafka para no perder mensajes
acks=all                      # ack cuando todas las ISR lo tienen
enable.idempotence=true       # dedupe de reintentos del producer en el broker
retries=2147483647
max.in.flight.requests.per.connection=5   # seguro CON idempotence (mantiene orden)
delivery.timeout.ms=120000
# y en el topic: min.insync.replicas=2 con replication.factor=3
```

Sin `acks=all` + `min.insync.replicas=2`, un líder que muere tras ackear puede perder mensajes: eso es at-most-once disfrazado. Y en el consumidor, `enable.auto.commit=true` con procesamiento asíncrono puede commitear offsets de mensajes aún no procesados → pérdida; el patrón correcto es commit manual tras procesar el batch.

**Por qué end-to-end es imposible con efectos externos:** "cobrar la tarjeta y ackear". Si cobras y mueres antes del ack, la reentrega recobra; si ackeas y mueres antes de cobrar, no cobras nunca. La salida es que el efecto sea **idempotente** (Stripe acepta `Idempotency-Key` por esto) o detectar el duplicado tú mismo (pregunta 3). Exactly-once no es propiedad del transporte: se construye en los extremos (end-to-end argument).

**Cuándo elegir cada una:** at-most-once para métricas y ticks donde el siguiente valor invalida al anterior; at-least-once + idempotencia como default de todo lo de negocio; exactly-once (Kafka transactions) para stream processing con agregaciones donde el doble conteo corrompe estado, pagando ~3–10% de throughput y latencia extra por los markers de transacción.

**Errores comunes:** creer que SQS FIFO da exactly-once end-to-end (su dedupe no cubre tu efecto en base de datos), o que `enable.idempotence` deduplica *tus* reintentos de aplicación (solo cubre los internos del cliente: dos `send()` tuyos son dos mensajes).

**Qué espera oír el entrevistador:** la posición del ack como explicación mecánica, que "exactly-once delivery" y "exactly-once processing" son cosas distintas, la config concreta de `acks`/`min.insync.replicas`, y la conclusión práctica sin dudar: at-least-once + idempotencia es el contrato por defecto de cualquier sistema serio.

---

## 3. ¿Cómo haces un consumidor idempotente? Claves de idempotencia, tabla inbox, dedupe y TTL
**Categoría:** Fiabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Primero intento **idempotencia natural**: operaciones que son seguras de repetir por diseño (`UPDATE order SET status='PAID'`, upserts por clave de negocio). Cuando no la hay (efectos acumulativos: `balance = balance + X`, llamadas a terceros), uso una **clave de idempotencia** por mensaje (`event_id` UUID puesto por el productor) y una **tabla inbox**: registro el `event_id` procesado *en la misma transacción* que el efecto de negocio; un duplicado viola la unique constraint y se descarta. El TTL de las claves debe superar con margen la ventana máxima de reentrega (retención del topic + replays operativos): días o semanas, no minutos.

### 📖 Respuesta detallada
**Jerarquía de soluciones, de más barata a más cara:**

1. **Idempotencia natural.** Set-based en vez de delta-based: `SET status = 'SHIPPED'` es idempotente, `SET stock = stock - 5` no. A menudo puedes rediseñar el evento: en vez de `StockDecremented {delta: 5}`, `StockLevelChanged {newLevel: 95, version: 12}` con guard de versión. Upserts por clave natural (`ON CONFLICT ... DO UPDATE`) cubren la mayoría de proyecciones.
2. **Tabla inbox (el patrón que hay que saber escribir):**

```sql
CREATE TABLE inbox (
    event_id     uuid PRIMARY KEY,          -- clave de idempotencia
    consumer     text NOT NULL,             -- si varias apps comparten la tabla
    processed_at timestamptz NOT NULL DEFAULT now()
);
```

```java
@Transactional
public void handle(OrderPaidEvent evt) {
    try {
        inboxRepo.insert(evt.eventId(), "billing-service"); // 1. reclamar la clave
    } catch (DuplicateKeyException e) {
        log.info("duplicate event {}, skipping", evt.eventId());
        return;                                             // ya procesado: no-op
    }
    invoiceService.createInvoice(evt);                      // 2. efecto de negocio
}   // 3. COMMIT atómico de inbox + efecto; el ack al broker va después
```

Lo esencial: el INSERT en `inbox` y el efecto de negocio están **en la misma transacción de la misma base de datos**. Si el proceso muere después del commit pero antes del ack, la reentrega choca con la PK y sale limpia. Si muere antes del commit, todo hace rollback y la reentrega reprocesa desde cero. No hay ventana en la que el efecto exista sin la marca, ni al revés.

3. **Efectos externos no transaccionales** (Stripe, email): la inbox local no basta, porque el efecto vive fuera de tu transacción. Propaga la clave al tercero (`idempotencyKey = evt.eventId()` en Stripe), que sí puede deduplicar en su lado. Para email, o aceptas el duplicado raro o registras el envío *antes* de llamar al SMTP, aceptando el riesgo inverso (marca sin envío) — hay que verbalizar qué lado eliges.

**Detalles que separan al senior:**

- **¿Quién genera la clave?** El **productor**, en el origen del hecho, y viaja en el mensaje. Si la genera el consumidor (hash del payload), dos eventos legítimamente iguales se confunden con un duplicado. Y para reintentos del propio productor, la clave se genera *antes* del primer intento y se reutiliza.
- **TTL de las claves.** La ventana de duplicados = máximo tiempo en que un mensaje puede reaparecer: reentregas del broker, retry topics (horas) y —el que todos olvidan— **replays operativos** ("reconsumimos el topic desde hace 3 días"). Regla práctica: TTL ≥ retención del topic (con retención de 7 días, purgar a las 24 h te deja expuesto). La purga: DELETE por lotes o particiones por fecha con `DROP PARTITION`.
- **Dedupe en memoria** (caches, Bloom filters) solo como optimización delante de la tabla: se vacía en cada deploy y no se comparte entre instancias.
- **Concurrencia:** dos entregas en paralelo (rebalanceo) chocan en la PK; con `READ COMMITTED` el segundo INSERT espera al desenlace del primero — correcto por defecto en Postgres/MySQL, pero hay que saber explicarlo.

**Errores comunes:** check con `SELECT` + `INSERT` sin constraint (dos hilos pasan el SELECT); inbox en otra base o en Redis rompiendo la atomicidad; TTL de minutos (los replays operativos no llegan seguidos); dedupe por payload en vez de por identidad del evento.

**Qué espera oír el entrevistador:** la jerarquía natural→inbox→propagar clave al tercero, la palabra "misma transacción", quién genera la clave y por qué, y el razonamiento del TTL ligado a la retención y a los replays.

---

## 4. Patrón outbox transaccional: ¿por qué el dual write está prohibido y cómo lo implementa Debezium?
**Categoría:** Patrones de integración · **Tipo:** Conceptual

### 📝 Respuesta resumen
*Dual write* = escribir en la base de datos Y publicar al broker como dos operaciones separadas: si el proceso muere entre ambas (o el broker está caído), tienes estado sin evento o evento sin estado, y no hay transacción distribuida razonable que lo arregle. El patrón **outbox** lo resuelve escribiendo el evento en una tabla `outbox` **dentro de la misma transacción local** que el cambio de negocio; un proceso aparte lo publica después al broker. La publicación es at-least-once (el relay puede reenviar), así que se combina con consumidores idempotentes. **Debezium** implementa el relay leyendo el WAL de la base (CDC) — sin polling, con el orden de commit y latencia de milisegundos.

### 📖 Respuesta detallada
**El bug del dual write, con sus dos ordenaciones:**

```java
// Orden A: si publish() falla o el proceso muere tras el commit → estado sin evento
orderRepo.save(order);          // commit en Postgres
kafka.send(orderCreatedEvent);  // ¿y si esto no llega a ejecutarse?

// Orden B: si el commit falla tras publicar → evento fantasma de un pedido que no existe
kafka.send(orderCreatedEvent);
orderRepo.save(order);          // rollback → downstream facturó un pedido inexistente
```

No se arregla con try/catch (el proceso puede morir con `kill -9` entre las dos líneas), ni con "publico dentro de la transacción" (el send no participa del rollback), ni con 2PC/XA: Kafka no habla XA, y XA trae bloqueos, un coordinador como SPOF y heurísticas que nadie quiere operar.

**Outbox, la implementación completa:**

```sql
CREATE TABLE outbox (
    id             uuid PRIMARY KEY,
    aggregate_type text NOT NULL,      -- 'Order'  → routing al topic
    aggregate_id   text NOT NULL,      -- '4711'   → key del mensaje (ordering, pregunta 5)
    event_type     text NOT NULL,      -- 'OrderCreated'
    payload        jsonb NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
```

```java
@Transactional
public Order createOrder(CreateOrderCommand cmd) {
    Order order = orderRepo.save(Order.from(cmd));
    outboxRepo.save(OutboxEvent.of("Order", order.id(),
        "OrderCreated", toJson(order)));     // MISMA transacción, atómico por ACID local
    return order;
}
```

El commit local garantiza estado-y-evento o nada. Falta sacarlo al broker; dos estrategias:

1. **Polling publisher:** un job lee `outbox` cada N ms, publica y marca/borra. Simple y universal; costes: latencia = intervalo, carga de queries, y con varias instancias `SELECT ... FOR UPDATE SKIP LOCKED` (el duplicado ocasional es aceptable: es at-least-once igualmente).
2. **CDC con Debezium (lo que se espera en 2026):** Debezium corre como conector de Kafka Connect, se conecta a Postgres como cliente de **replicación lógica** (slot sobre el WAL; en MySQL, binlog) y convierte cada INSERT en `outbox` en un mensaje. Con el `EventRouter` SMT oficial, rutea por `aggregate_type` y usa `aggregate_id` como key:

```json
{
  "name": "orders-outbox-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "orders-db", "database.dbname": "orders",
    "plugin.name": "pgoutput",
    "table.include.list": "public.outbox",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.route.by.field": "aggregate_type",
    "transforms.outbox.table.expand.json.payload": "true"
  }
}
```

Ventajas de CDC sobre polling: latencia de ms, orden de commit exacto, cero queries. Coste operativo a mencionar: **el replication slot retiene WAL si el conector se cae** (un Debezium parado 48 h puede llenar el disco de la base — monitorizar `pg_replication_slots` es obligatorio), más operar Kafka Connect.

**Detalles finos:** la tabla outbox se purga agresivamente (incluso INSERT+DELETE en la misma transacción: Debezium captura el INSERT del WAL igualmente). El relay es at-least-once → consumidores idempotentes (pregunta 3). El evento del outbox debe ser el **contrato público**, no un volcado de la fila: no expongas tu esquema interno vía CDC directo de tablas de negocio. Y Kafka transactions no resuelven el dual write: no abarcan a Postgres.

**Errores comunes:** "lo arreglo con retry en el send" (no cubre el crash), CDC directo sobre tablas de dominio (acoplas el esquema interno como API pública), olvidar la monitorización del slot, y no poner key al mensaje (pierdes el orden por agregado).

**Qué espera oír el entrevistador:** el fallo del dual write explicado con la muerte del proceso entre las dos escrituras, "misma transacción local" como núcleo del patrón, polling vs CDC con sus trade-offs, el gotcha del WAL/slot, y que el conjunto entrega at-least-once y por tanto se apoya en idempotencia downstream.

---

## 5. Ordering: ¿qué garantiza realmente un broker y qué haces cuando el orden importa de verdad?
**Categoría:** Ordering / Particionado · **Tipo:** Conceptual

### 📝 Respuesta resumen
Ningún broker da orden global útil: Kafka garantiza orden **solo dentro de una partición**; RabbitMQ solo con un consumidor y sin reintentos (un requeue reordena); SQS estándar no garantiza nada y FIFO ordena por *message group*. El patrón real es **orden por clave de entidad**: todos los eventos del pedido 4711 van a la misma partición (key = `orderId`) y se procesan secuencialmente; entre pedidos distintos el orden no importa ni debe importar. Cuando ni eso basta, se diseña para tolerar desorden: números de versión en los eventos, descartar eventos viejos, o modelar el estado como CRDT-like en el consumidor.

### 📖 Respuesta detallada
**Qué garantiza cada broker, exactamente:**

- **Kafka:** orden por partición, punto. La key se hashea → partición. Dos matices que todo el mundo falla: (1) un producer con retries y `max.in.flight > 1` **sin** `enable.idempotence` puede reordenar dentro de la partición (el batch 2 entra mientras el 1 se reintenta); con idempotence, el broker rechaza secuencias fuera de orden y el orden se preserva hasta con 5 in-flight; (2) **cambiar el número de particiones cambia el mapeo key→partición**: los eventos nuevos del pedido 4711 pueden adelantar a los viejos — por eso se sobredimensionan particiones desde el día uno (24–48 en un topic de dominio).
- **RabbitMQ:** FIFO por cola solo con un consumidor, `prefetch=1` y sin requeues (un `nack` con requeue reordena; con N consumidores compitiendo, el orden de *procesamiento* se pierde aunque el de *entrega* exista). Para orden por entidad: plugin *consistent-hash exchange* o *super streams*.
- **SQS:** estándar = best-effort, ni orden ni unicidad. FIFO = orden por `MessageGroupId` (equivalente a la key de Kafka) con throughput limitado (300 msg/s por grupo sin batching, 3.000 con high throughput mode).

**El insight de diseño: el orden global es un anti-requisito.** Orden total exige un único punto de serialización = throughput de una sola cola, sin paralelismo. El negocio casi nunca necesita ordenar el pedido 4711 respecto al 4712, solo los eventos *del mismo pedido*. La entidad define la clave:

```java
producer.send(new ProducerRecord<>("orders.events",
    order.getId(),        // key → misma partición → orden garantizado por pedido
    event));
```

Y el paralelismo queda acotado: dentro de una partición, un solo consumidor del grupo procesa secuencialmente; el throughput por entidad es el de un hilo, y una **hot key** (un cliente que genera el 30% de los eventos) desequilibra las particiones — se detecta midiendo lag por partición, no solo agregado.

**Cuando el desorden llega igualmente** (particiones repartcionadas, retry topics que sacan el mensaje de su carril, mezcla de fuentes), el consumidor se defiende:

1. **Versionado + descarte:** cada evento lleva `version` (o `sequence`) del agregado; el consumidor guarda la última aplicada y descarta versiones ≤ actual (`UPDATE ... WHERE version < :new`). Convierte "procesar en orden" en "no aplicar hacia atrás", que es mucho más barato.
2. **Buffer de reordenación:** retener eventos con `version > última + 1` un tiempo corto esperando el hueco. Complejo, memoria acotada, timeouts — último recurso.
3. **Diseño conmutativo:** eventos que puedan aplicarse en cualquier orden con el mismo resultado (sets, máximos, upserts por versión). Si lo logras, el problema desaparece.

**Trampa clásica de los reintentos:** un retry topic (pregunta 14) rompe el orden de la entidad — el evento 2 se procesa mientras el 1 espera en retry. Si el orden es crítico: reintentar in situ pagando head-of-line blocking, o aparcar **la entidad entera** (desviar sus eventos siguientes a la DLQ hasta resolver). Hay que elegir y decirlo.

**Errores comunes:** creer que Kafka ordena por topic; añadir particiones con keys en producción sin plan; paralelizar con un pool de hilos dentro de la app rompiendo el orden recibido (si paralelizas, hazlo por key, como Parallel Consumer de Confluent); exigir "orden global" sin preguntar para qué.

**Qué espera oír el entrevistador:** "orden por partición, no por topic", key = identidad del agregado, el gotcha del repartitioning y el de `max.in.flight` sin idempotence, la tensión retry-vs-orden, y la madurez de diseñar consumidores tolerantes al desorden en vez de perseguir garantías globales imposibles.

---

## 6. Backpressure y colas: ley de Little, productor más rápido que el consumidor, límites y load shedding
**Categoría:** Capacidad / Performance · **Tipo:** Conceptual

### 📝 Respuesta resumen
La ley de Little (`L = λ × W`) dice que el tamaño medio de la cola es tasa de llegada por tiempo de espera; su lectura útil es la inversa: con λ de llegada y μ de servicio, si **λ > μ la cola crece sin límite** — no hay tuning que lo arregle, solo más capacidad de consumo o menos entrada. Un pico temporal se absorbe (para eso está la cola); un desequilibrio sostenido exige backpressure hacia el productor, escalar consumidores o **load shedding**: descartar o degradar trabajo explícitamente (TTL de mensajes, colas acotadas, rechazar en el borde) antes de que la latencia crezca sin límite y el sistema colapse persiguiendo trabajo ya inútil.

### 📖 Respuesta detallada
**Los números primero.** Consumidor a μ = 1.000 msg/s, pico de λ = 3.000 msg/s durante 5 minutos: acumulas (3.000−1.000)×300 = **600.000 mensajes**; con 500 msg/s de capacidad sobrante tras el pico, tardas **20 minutos** en volver a lag cero. Un OTP que entra al final del pico espera esos minutos: el usuario ya se fue. La cola convierte errores en latencia, y hay mensajes cuya utilidad caduca — de ahí el TTL.

**Dónde aparece el backpressure según el broker:**

- **Kafka (pull):** el backpressure es natural — el consumidor hace `poll()` a su ritmo y el exceso se queda en disco del broker. El "límite de cola" es la **retención** (`retention.ms` / `retention.bytes`): si el lag supera la retención, pierdes datos silenciosamente *por el principio*. Por eso la alerta correcta no es "lag > N" sino **lag medido en tiempo** (¿a cuántos segundos/horas del head voy?) comparado contra retención y contra el SLO de frescura.
- **RabbitMQ (push):** límites explícitos: `x-max-length` con `overflow: drop-head` (descarta lo viejo) o `reject-publish` (backpressure real al productor), y memory/disk alarms que bloquean *todas* las conexiones de publicación — modo de fallo famoso: el broker saturado congela también a productores de colas sanas.
- **SQS:** cola "infinita" pero con retención máxima de 14 días y `maxReceiveCount`→DLQ; el backpressure se dimensiona en el polling del consumidor.

**El pipeline interno del consumidor también es una cola.** El clásico: `poll()` mete 500 records en un `ExecutorService` con cola ilimitada → el heap es tu buffer, el broker cree que vas bien y el OOM llega sin lag visible. Regla: buffers internos **acotados** y `pause()`/`resume()` de particiones cuando se llenan — así el backpressure se propaga hasta el broker (en reactive, es el contrato de `request(n)`).

**Cuando λ > μ sostenido, en orden de preferencia:**

1. **Escalar consumidores** — hasta el límite de paralelismo: en Kafka, el número de particiones (el consumidor #25 de un topic de 24 no hace nada); y solo hasta que el cuello pase a la base downstream (escalar consumidores mueve el problema un salto).
2. **Aumentar μ por consumidor:** batching (procesar 500 inserts en un `INSERT ... VALUES` múltiple puede dar 10–50×), pipelining, eliminar N+1 contra la base.
3. **Backpressure al origen:** rate limiting en la API que genera el trabajo (429 con `Retry-After`), reject-publish. Es la única solución honesta si la capacidad no puede crecer.
4. **Load shedding:** descartar con criterio. TTL por mensaje (chequear el timestamp del evento y saltarse lo caducado — "si el OTP tiene > 2 min, ni lo envíes"), priorización (cola separada para lo crítico: nunca mezclar OTPs con newsletters), o *drop-head* para telemetría, donde lo reciente vale más.

**Anti-patrón de colapso (metastable failure):** la cola crece → la latencia crece → los llamantes upstream hacen timeout y **reintentan** → λ sube todavía más → el sistema procesa trabajo cuyo solicitante ya se rindió. El lag deja de bajar incluso cuando la causa original desapareció. Defensas: TTL/deadline propagado en el mensaje, retry budgets upstream (pregunta 14), y admission control en el borde.

**Errores comunes:** dimensionar para la media y no para el p99; monitorizar lag en mensajes en vez de en tiempo; buffers internos sin límite; tratar el load shedding como fracaso y no como decisión de diseño; "añadimos consumidores" cuando el cuello es la base compartida.

**Qué espera oír el entrevistador:** la ley de Little aplicada con un cálculo concreto de drenaje, la diferencia pull/push en dónde vive el backpressure, el gotcha del buffer interno con `pause()`/`resume()`, la espiral de reintentos como modo de colapso, y que digas sin complejos que a veces la respuesta correcta es tirar trabajo.

---

## 7. Dead letter queues: ¿cuándo envías un mensaje, qué metadatos guardas y cómo reprocesas?
**Categoría:** Fiabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
A la DLQ va lo que **no se va a arreglar reintentando**: errores no transitorios (payload inválido, regla de negocio violada, bug del consumidor) inmediatamente, y errores transitorios solo tras agotar el presupuesto de reintentos. El mensaje debe llegar con metadatos completos en headers: origen (topic/partición/offset), excepción y stack trace, número de intentos, timestamps y trace id — sin eso, la DLQ es un cementerio inauditables. Una DLQ sin **alerta, dueño y proceso de reprocesamiento** es peor que no tenerla: da sensación de seguridad mientras acumula pérdida de datos silenciosa.

### 📖 Respuesta detallada
**Clasificación de errores — la decisión central:**

| Tipo | Ejemplo | Acción |
|---|---|---|
| Transitorio | timeout de red, deadlock, 503 downstream, broker de destino saturado | reintentar con backoff (pregunta 14) |
| Permanente del mensaje | JSON inválido, schema incompatible, FK a entidad inexistente, importe negativo | DLQ **directa**, reintentar es ruido |
| Permanente del consumidor | bug, NPE en un branch nuevo | DLQ + alerta; tras el fix, redrive |
| Poison message | mata el proceso (OOM por payload de 50 MB, bucle infinito del parser) | detectar por contador de entregas y aislar ANTES de que tumbe al consumidor en bucle |

El **poison message** merece mención propia: un mensaje que crashea al consumidor se reentrega, vuelve a crashear y el consumer group entra en crash-loop — un solo mensaje para toda la partición o cola. La defensa es un límite duro de entregas *independiente del tipo de error*: SQS lo trae de serie (`maxReceiveCount` en la redrive policy), RabbitMQ con `x-death` sobre DLX, y en Kafka lo implementas tú (header `retry-count`) porque Kafka **no tiene DLQ nativa**: es un topic normal al que publica tu código o el framework (Spring Kafka `DeadLetterPublishingRecoverer`).

**Metadatos obligatorios** (en headers, sin mutar el payload original — lo necesitarás intacto para reprocesar):

```java
new RecordHeaders()
    .add("dlq-original-topic", "orders.events")
    .add("dlq-original-partition", "3")
    .add("dlq-original-offset", "1077245")
    .add("dlq-exception-class", "jakarta.validation.ConstraintViolationException")
    .add("dlq-exception-message", "amount must be positive")
    .add("dlq-stacktrace", first4Kb(stackTrace))
    .add("dlq-attempts", "6")
    .add("dlq-consumer-group", "billing-service")
    .add("dlq-first-failure-at", "...")
    .add("traceparent", originalTraceParent);  // para reconstruir la traza completa
```

Con esto puedes agrupar la DLQ por `exception-class` y ver de un vistazo si son 10.000 mensajes de un mismo bug o 10.000 problemas distintos.

**Operación — lo que convierte la DLQ en un sistema y no en un vertedero:**

1. **Alerta con umbral bajo:** un mensaje en DLQ de un flujo de dinero es un incidente, no una métrica. Alertar por *tasa* y por *primer mensaje tras periodo limpio*.
2. **Dueño y SLA:** cada DLQ tiene un equipo que la revisa, y retención larga (semanas) porque el fix puede tardar — perder los mensajes de la DLQ por `retention.ms` es perder los datos dos veces.
3. **Redrive:** SQS lo tiene nativo DLQ→origen; en Kafka es un consumidor de la DLQ que republica o invoca directamente el handler. Reglas: reprocesar **tras** desplegar el fix, en lotes pequeños, con idempotencia activa (el mensaje pudo procesarse a medias) y decidiendo el **orden**: el evento reprocesado llega tarde respecto a sus hermanos — el guard de versión de la pregunta 5 vuelve a salvar.
4. **Descarte documentado:** a veces la resolución correcta es "estos 200 eventos de test corruptos se descartan" — con registro de quién y por qué. Una DLQ que solo crece indica que nadie decide.

**Decisiones a verbalizar:** DLQ por **consumidor**, no por topic (`orders.events.billing.dlq`): el mismo evento puede fallar en billing y procesarse bien en stock. Payload original + headers, para que el redrive sea trivial.

**Errores comunes:** reintentar errores de validación 10 veces antes de la DLQ; DLQ sin alertas descubierta con 2M de mensajes seis meses después; mutar el payload al enviarlo (adiós redrive limpio); y el más caro: no saber responder "¿qué hicimos con la DLQ del incidente de marzo?".

**Qué espera oír el entrevistador:** la taxonomía transitorio/permanente/poison como criterio de envío, que Kafka no tiene DLQ nativa y cómo se construye, la lista de metadatos, y sobre todo la parte operativa: alerta, dueño, redrive con idempotencia y decisión consciente sobre el orden.

---

## 8. Event notification vs event-carried state transfer vs event sourcing: diferencias y cuándo usar cada uno
**Categoría:** Patrones event-driven · **Tipo:** Conceptual

### 📝 Respuesta resumen
Son tres cosas distintas que comparten la palabra "evento". **Event notification**: aviso mínimo ("el pedido 4711 cambió") y el interesado llama de vuelta a la API para leer el estado — eventos pequeños, pero re-acoplas por la consulta. **Event-carried state transfer (ECST)**: el evento lleva el estado completo o suficiente; los consumidores mantienen réplicas locales y no llaman a nadie — autonomía total a cambio de eventos gordos, duplicación de datos y consistencia eventual entre copias. **Event sourcing** es otra categoría: patrón de *persistencia* donde el log de eventos ES la fuente de verdad del agregado, no un mecanismo de integración. Confundir el tercero con los dos primeros es el error clásico que la pregunta intenta cazar.

### 📖 Respuesta detallada
**1. Event notification.**

```json
{ "eventType": "OrderStatusChanged", "orderId": "4711", "occurredAt": "..." }
```

El consumidor recibe el aviso y hace `GET /orders/4711` si le interesa. Ventajas: contrato mínimo y estable, sin duplicar datos, lectura siempre fresca y con la autorización de la API. Costes: **el acoplamiento temporal reaparece** (si Orders está caído, nadie puede reaccionar aunque el evento llegara) y hay **read storms**: un burst de 1.000 eventos con 10 consumidores son 10.000 GETs al origen — el productor debe dimensionarse para sus consumidores, justo lo que la mensajería quería evitar. Y una carrera sutil: entre evento y GET el estado pudo cambiar; el consumidor lee un estado *más nuevo* que el hecho notificado y puede saltarse estados intermedios (a veces fatal para auditoría).

**2. Event-carried state transfer.**

```json
{ "eventType": "OrderStatusChanged", "orderId": "4711", "version": 12,
  "order": { "status": "PAID", "customerId": "c-9", "lines": [...], "total": 129.90 } }
```

El consumidor actualiza su réplica local (con guard de `version`, pregunta 5) y responde a todo desde ella. Ventajas: autonomía real (Orders puede estar caído y facturación sigue), latencia de lectura local, cero read storms. Costes: eventos grandes (payloads > ~1 MB piden claim check: referencia a S3), **duplicación con consistencia eventual** (cada consumidor tiene su copia desfasada), contrato ancho (cada campo publicado es API pública → presión sobre schema evolution, pregunta 13) y el arranque: un consumidor nuevo necesita la foto inicial — replay de un topic compactado (log compaction con key=orderId existe para esto) o bulk load.

**Regla práctica:** notificación cuando los consumidores reaccionan poco, quieren el estado más fresco o los datos son sensibles (pasan por la autorización de la API); ECST cuando mandan la autonomía y la latencia o el consumo es masivo. El híbrido común: evento con **delta significativo** (`status`, `previousStatus`, ids, totales) — suficiente para el 90%, GET para el resto.

**3. Event sourcing NO es un patrón de integración.** Es una decisión de persistencia: el agregado se reconstruye aplicando su secuencia de eventos desde un event store; no hay tabla de "estado actual" como fuente de verdad. Puedes hacer ES sin publicar un solo evento fuera, y ECST sobre un CRUD con outbox. Publicar los eventos internos de persistencia como contrato de integración acopla tu modelo de dominio a todos los consumidores: cada refactor se vuelve negociación externa. Lo sano: separar **eventos internos** (finos, cambian con el modelo) de **eventos públicos** (gruesos, estables, versionados) con una capa de traducción — mismo razonamiento que no exponer tablas por CDC (pregunta 4).

**Errores comunes:** llamar "event sourcing" a tener un topic ("tenemos Kafka, hacemos event sourcing" — no); ECST publicando la entidad JPA serializada; notificación sin pensar el read storm; ECST sin versión de agregado (imposible aplicar réplicas con desorden).

**Qué espera oír el entrevistador:** las tres definiciones con sus costes de acoplamiento (temporal en notificación, de contrato en ECST), el read storm y la carrera del GET, log compaction para réplicas, y con especial peso: la distinción tajante entre integración (los dos primeros) y persistencia (el tercero), más la separación evento interno vs evento público.

---

## 9. Event sourcing en serio: qué resuelve, qué complica y cuándo NO usarlo
**Categoría:** Event Sourcing · **Tipo:** Conceptual

### 📝 Respuesta resumen
Event sourcing persiste cada cambio como un evento inmutable y deriva el estado actual reproduciéndolos: te da auditoría perfecta por construcción, consultas temporales ("¿qué veía el sistema el día 3?"), capacidad de corregir bugs re-derivando estado y de crear proyecciones nuevas por replay. Lo pagas con complejidad estructural: snapshots para agregados largos, versionado eterno de eventos (los de hace 5 años se siguen leyendo), GDPR contra la inmutabilidad, replays que se miden en horas y un modelo mental caro para el equipo. Lo usaría en dominios donde el historial ES el negocio (ledgers, trading, apuestas, inventario regulado); no lo usaría como default de arquitectura ni en CRUDs donde nadie preguntará jamás "cómo llegamos a este estado".

### 📖 Respuesta detallada
**El mecanismo:** el agregado no se guarda; se guarda su historia. Escribir = append de eventos con **concurrencia optimista** sobre la versión del stream (`expectedVersion`): dos comandos concurrentes sobre el mismo pedido → uno recibe conflicto y reintenta sobre el estado nuevo. Leer = cargar eventos del stream y aplicarlos en orden (`fold`). El event store puede ser específico (EventStoreDB, Axon) o Postgres con una tabla append-only (`stream_id, version, event_type, payload`, PK `(stream_id, version)` — la unique constraint ES el control de concurrencia). Kafka a secas es mala elección como event store: no puedes leer eficientemente "los eventos del pedido 4711" (un stream por entidad ≠ una partición por entidad) ni hacer append condicional por versión.

**Qué resuelve de verdad:**
- **Auditoría por construcción**, no como feature añadida: en un ledger financiero, la pregunta "¿por qué el saldo es X?" tiene respuesta exacta y ordenada. Intención incluida: el evento `PriceOverriddenByManager` dice *por qué*, cosa que un UPDATE nunca dirá.
- **Proyecciones retroactivas:** ¿marketing quiere desde hoy "carritos abandonados por franja horaria"... con datos históricos? Con CRUD, imposible (el pasado se sobrescribió); con ES, replay y la proyección nace con historia completa.
- **Debugging forense:** reproduces el estado exacto del agregado en el momento del bug, evento a evento.

**Qué complica, con los detalles que demuestran que lo has operado:**

1. **Snapshots.** Un agregado con 100.000 eventos (cuenta con años de movimientos) no puede rehidratarse en cada comando. Snapshot cada N eventos (típico 100–1.000): cargas snapshot + cola de eventos posteriores. Los snapshots son **cache derivada, descartable** — nunca fuente de verdad — y se regeneran cuando cambia la lógica de fold. Si tus agregados crecen sin límite, suele ser un error de modelado: cerrar streams por periodo (cuenta-mes) es el fix.
2. **Versionado eterno de eventos.** Un evento escrito en 2021 se leerá en 2028. Estrategias: *upcasters* (funciones v1→v2 aplicadas al leer, se acumulan en cadena), weak schema (tolerar campos ausentes con defaults), y como última opción migración copy-transform del store completo (delicada: cambia offsets/posiciones que las proyecciones referencian). Renombrar un campo es trivial en CRUD y un proyecto en ES; el diseño de eventos pide el mismo cuidado que una API pública.
3. **GDPR / right to erasure contra inmutabilidad.** No puedes borrar eventos sin romper hashes de integridad, versiones y replays. Patrón estándar: **crypto-shredding** — los datos personales van cifrados con una clave por sujeto; borrar = destruir la clave, los eventos quedan pero ilegibles. Alternativa: datos personales fuera del evento (referencia a un store mutable). Ambas hay que diseñarlas el día uno, no ante el primer requerimiento legal.
4. **Replays.** Reconstruir una proyección leyendo 500M de eventos a 50k eventos/s son ~3 horas; mientras tanto, ¿la proyección vieja sigue sirviendo? Patrón blue/green de proyecciones: construyes la nueva en paralelo, cambias el switch al alcanzar el head, borras la vieja. Y los replays no deben re-disparar efectos externos: los handlers de proyección (puros) se separan de los de proceso (emails, pagos) — replay solo alimenta a los primeros.
5. **Coste humano.** Todo el equipo (incluido el que llega mañana) piensa en comandos→eventos→proyecciones, consistencia eventual en cada lectura, y herramienta interna para inspeccionar streams. Es el mayor coste y el menos visible en el diseño.

**Cuándo NO:** CRUD administrativo (catálogos, configuración), equipos sin experiencia con deadline corto, dominios donde el estado actual es lo único que importa, y "porque así tenemos eventos para integrarnos" — para eso basta outbox sobre CRUD (pregunta 4), que da el 80% del valor de integración con el 20% de la complejidad. Aplicarlo **por agregado**, no por sistema: el ledger event-sourced, el catálogo CRUD, conviviendo.

**Errores comunes:** eventos-CRUD (`OrderUpdated {todo el objeto}` — pierdes la intención, que era el punto), snapshots como fuente de verdad, proyección y efectos externos en el mismo handler (los replays reenvían 500.000 emails — incidente real en más de una empresa), y subestimar GDPR.

**Qué espera oír el entrevistador:** append + expectedVersion como mecanismo, snapshots como cache, crypto-shredding, blue/green de proyecciones, la separación proyección/efectos ante replays, por qué Kafka no es un event store, y un criterio de adopción selectivo y escéptico.

---

## 10. CQRS: ¿qué es de verdad, qué relación tiene con los eventos y cómo manejas la consistencia eventual en la UI?
**Categoría:** CQRS · **Tipo:** Conceptual

### 📝 Respuesta resumen
CQRS es separar el **modelo** de escritura (comandos que validan invariantes sobre agregados) del de lectura (proyecciones desnormalizadas optimizadas por pantalla/consulta) — no necesariamente dos bases de datos ni requiere event sourcing ni Kafka. Va de reconocer que las escrituras quieren normalización e invariantes y las lecturas quieren joins ya hechos. La sincronización entre ambos modelos suele hacerse con eventos (outbox → proyector), lo que introduce consistencia eventual: la UI debe diseñarse para ello — read-your-writes dirigiendo lecturas críticas al modelo de escritura, UI optimista, o esperar la versión de la proyección — y no descubrirlo como bug ("guardo y no aparece").

### 📖 Respuesta detallada
**Qué es y qué no es.** La escala real de CQRS, de menor a mayor coste:

1. **Mismo servicio, misma base:** comandos pasan por agregados de dominio con invariantes; queries van con SQL directo/proyecciones a DTOs saltándose el modelo de dominio (nada de cargar el agregado de 40 campos para pintar una lista). Esto ya es CQRS y es donde debería empezar casi todo el mundo. Consistencia inmediata, coste casi cero.
2. **Misma base, tablas de lectura separadas:** proyecciones desnormalizadas actualizadas por eventos internos o en la misma transacción. Permite índices y formas distintas sin segundo sistema.
3. **Stores separados:** Postgres para escritura, Elasticsearch para búsqueda facetada, Redis para vistas calientes. Aquí aparecen de verdad la consistencia eventual y el coste operativo. Solo se justifica cuando los requisitos de lectura no caben en el store de escritura (búsqueda full-text, agregaciones analíticas, ratio lectura/escritura de 1000:1 con formas de consulta incompatibles).

**Relación con eventos y ES:** son tres decisiones independientes que se suelen empaquetar mal. CQRS sin eventos existe (nivel 1). Eventos sin CQRS existen (outbox para integración). ES casi siempre implica CQRS (el log no es consultable; necesitas proyecciones) pero no al revés. En la práctica, el pegamento típico del nivel 3 es: transacción de escritura + outbox → topic → **proyector** (consumidor idempotente que hace upsert en el read store, con guard de versión — preguntas 3 y 5 otra vez; los patrones componen y eso es lo que hay que mostrar).

**Consistencia eventual en la UI — el problema que define si lo has hecho en producción.** El lag de proyección típico es de decenas de ms a segundos (más bajo p50, picos con lag del consumidor). El flujo roto: usuario crea el pedido → POST ok → redirect a la lista (que lee la proyección) → el pedido no está → usuario reintenta → duplicado. Opciones, con sus trade-offs:

1. **Read-your-writes selectivo:** las lecturas inmediatamente posteriores a una escritura del propio usuario van al modelo de escritura (o la respuesta del comando ya devuelve la representación completa y la UI la usa sin releer). Barato y cubre el 90% de los casos.
2. **UI optimista:** el cliente añade el pedido a la lista localmente con estado "confirmando" y lo reconcilia cuando la proyección llega (polling corto o push por WebSocket/SSE). Es la solución de casi todas las apps modernas; requiere manejar el caso de rechazo posterior.
3. **Espera por versión:** el comando devuelve `{orderId, version: 12}`; la UI consulta con `GET /orders?minVersion=12` y el backend espera (long-poll con timeout corto) a que la proyección alcance esa versión. La más correcta y la más cara; para flujos donde mostrar estado viejo es inaceptable (saldo tras transferencia).
4. **Rediseño del flujo:** a veces la respuesta es no volver a la lista — pantalla de confirmación con los datos del comando. La consistencia eventual se gestiona también con UX, no solo con ingeniería.

**Costes a verbalizar del nivel 3:** cada pantalla nueva puede pedir una proyección nueva (¿quién la mantiene?); los rebuilds de proyección (bug en el proyector = datos de lectura mal durante horas, pregunta 9); monitorización de lag de proyección como métrica de producto (no solo de infraestructura); y el debugging "¿esta pantalla lee de dónde?" que confunde a todo recién llegado.

**Errores comunes:** empezar por el nivel 3 "porque escala" sin problema de lectura real; proyectores no idempotentes ni versionados (la proyección diverge silenciosamente con cada rebalanceo); tratar la consistencia eventual como bug a "arreglar bajando el lag" en vez de como propiedad a diseñar; y el cargo cult de que CQRS requiere event sourcing y un message broker.

**Qué espera oír el entrevistador:** la escala de niveles con "empieza en el 1", la independencia CQRS/eventos/ES, el pipeline outbox→proyector idempotente, y sobre todo soluciones concretas de UI (read-your-writes, optimista, espera por versión) con criterio de cuándo cada una — eso delata experiencia real más que cualquier diagrama.

---

## 11. Sagas: coreografía vs orquestación, compensaciones, timeouts y dónde vive el estado
**Categoría:** Transacciones distribuidas · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una saga descompone una transacción de negocio que cruza servicios en pasos locales, cada uno con su **compensación** (acción de negocio que revierte el efecto, no un rollback técnico). En **coreografía**, cada servicio reacciona a eventos del anterior y nadie tiene la vista global — simple para 2–3 pasos, ingobernable después. En **orquestación**, un componente (el orquestador) manda comandos, espera respuestas y persiste el estado de la saga — flujo explícito, testeable y con dueño, a cambio de un punto de acoplamiento. El estado vive siempre en algún sitio: explícito en la tabla del orquestador o disperso e implícito en los estados de cada servicio; lo segundo es lo que hace dolorosa la coreografía en producción.

### 📖 Respuesta detallada
El punto de partida es que **no hay 2PC entre servicios**: crear pedido → reservar stock → cobrar → programar envío no puede ser atómico. La saga acepta estados intermedios visibles (el pedido existe con stock reservado antes de cobrarse) y define qué hacer en cada fallo.

**Compensaciones son negocio, no rollback:** `ReleaseStock` deshace `ReserveStock`, `RefundPayment` deshace `ChargePayment`… pero un email enviado no se des-envía y un refund no borra el cargo del extracto — son **semánticamente** compensables, no técnicamente reversibles. De ahí la ordenación clásica de pasos: primero los compensables baratos, después el **pivot** (el paso tras el cual ya no se compensa, típicamente el cobro), y al final los pasos *retriables* que deben acabar teniendo éxito (el envío se reintenta hasta lograrse, no se compensa el cobro porque logística tuvo un blip). Las compensaciones también fallan: se reintentan con backoff y, agotado el presupuesto, alertan a un humano — toda saga seria tiene un estado terminal `REQUIRES_INTERVENTION`.

**Coreografía:** Orders publica `OrderCreated` → Stock reserva y publica `StockReserved` → Payments cobra… Ventaja: acoplamiento mínimo, sin componente central. Costes reales: para saber "¿en qué estado está la saga del pedido 4711?" hay que correlacionar logs de 4 servicios; los timeouts no tienen dueño natural (¿quién detecta que `StockReserved` nunca llegó?); y añadir un paso obliga a tocar varios servicios. Funciona bien hasta ~3 pasos lineales.

**Orquestación:** un orquestador (código propio con una tabla, o Temporal/Camunda; Step Functions en AWS) persiste una máquina de estados:

```sql
CREATE TABLE saga_instance (
  saga_id uuid PRIMARY KEY, order_id text NOT NULL,
  current_step text NOT NULL,       -- AWAITING_PAYMENT, COMPENSATING_STOCK...
  state jsonb NOT NULL, deadline_at timestamptz,   -- timeout del paso actual
  updated_at timestamptz NOT NULL
);
```

Manda comandos por colas punto a punto (pregunta 12), consume respuestas correlacionadas por `saga_id`, y un scheduler barre `deadline_at` vencidos para disparar timeout→compensación. Todo lo difícil de la coreografía se vuelve una fila consultable. El riesgo a verbalizar: que el orquestador degenere en un "god service" con lógica de negocio de todos — debe orquestar *secuencia*, no contener las reglas de cada dominio; y es un servicio más que debe ser HA (su estado está en la base, así que instancias stateless compitiendo por filas con `SKip LOCKED` funciona).

**Detalles transversales:** cada paso es un consumidor at-least-once → comandos idempotentes (pregunta 3: `saga_id + step` como clave); los timeouts necesitan cuidado con la carrera "timeout dispara compensación y justo después llega el `StockReserved` tardío" — la compensación debe ganar de forma determinista (la máquina de estados rechaza transiciones desde estados ya compensados); y la observabilidad (métrica de sagas por estado, edad de la más vieja) es lo primero que se construye, no lo último.

**Errores comunes:** coreografía de 6 pasos "para no acoplar" que nadie puede depurar; compensaciones no idempotentes (doble refund); olvidar el pivot y "compensar" un cobro por un fallo trivial posterior; y no persistir el estado ("está en los eventos") hasta el primer incidente.

**Qué espera oír el entrevistador:** compensación semántica vs rollback, pivot y pasos retriables, el criterio ~3 pasos para saltar a orquestación, dónde vive el estado en cada variante, timeouts con dueño y la carrera timeout-vs-respuesta-tardía.

---

## 12. Colas de comando vs topics de eventos: ¿qué diferencia semántica hay y quién es dueño del contrato?
**Categoría:** Contratos / Diseño · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un **comando** es una petición dirigida a un destinatario concreto para que haga algo (`ChargePayment`), en imperativo, con exactamente un receptor que puede rechazarla; el contrato es **del receptor** (como una API) y el emisor conoce y depende de él. Un **evento** es un hecho pasado e inmutable (`OrderPlaced`), en pasado, publicado sin saber quién escucha, con 0..N consumidores que no pueden "rechazar" la historia; el contrato es **del productor**. Infraestructura acorde: comandos en colas punto a punto (un consumidor lógico, competing consumers), eventos en topics pub/sub con fan-out. Mezclarlos produce el anti-patrón estrella: "eventos" que en realidad son órdenes disfrazadas a un consumidor concreto.

### 📖 Respuesta detallada
La diferencia no es de tecnología sino de **dirección de la dependencia**:

- Con un comando, el emisor sabe qué quiere que pase y de quién: Orders depende de la API de mensajes de Payments. Acoplamiento explícito y legítimo — el orquestador de una saga (pregunta 11) emite comandos precisamente porque dirige el flujo. El receptor valida y puede responder con rechazo (`PaymentDeclined` como *respuesta*), y el emisor debe manejar ese resultado.
- Con un evento, el productor narra hechos de su dominio y termina su responsabilidad al publicarlo con un contrato estable. Quién reacciona y cómo no es asunto suyo: la lógica "cuando se paga un pedido se emite factura" vive en Billing (el interesado), no en Orders. Esa inversión es lo que permite añadir el consumidor N+1 sin tocar al productor.

**El anti-patrón a nombrar: comandos pasivo-agresivos.** Un topic `email-events` con eventos `SendWelcomeEmailRequested` es un comando con disfraz gramatical: tiene un destinatario implícito (el email service), expresa intención ajena al dominio del productor, y si mañana el email service cambia su payload, el "productor" tiene que adaptarse — la dependencia real es de comando aunque viaje por un topic. Consecuencias prácticas: nadie sabe si es API del receptor o hecho del emisor, así que nadie sabe quién puede cambiarla. El test rápido: ¿el nombre está en pasado y sería verdad aunque no existiera ningún consumidor? Evento. ¿Describe trabajo que otro debe hacer? Comando — y entonces que sea explícito: cola `payments.commands` documentada por Payments.

**Consecuencias de infraestructura y gobierno:**

- **Comando → cola** (RabbitMQ queue, SQS): un consumidor lógico escalado por competing consumers; el mensaje se consume y desaparece; DLQ del receptor; naming del receptor (`payments.commands.charge`). Versionar el contrato = versionar la API del receptor; el receptor publica el esquema y sus SLAs (¿cuánto tarda en atender?).
- **Evento → topic** (Kafka, SNS, Rabbit exchange fanout): retención definida por el productor (posibilita replay y consumidores nuevos con historia), cada consumer group con su offset y su DLQ propia (pregunta 7), naming del dominio productor (`orders.events`). El productor es dueño del esquema y de su evolución (pregunta 13), idealmente registrado en un schema registry y descubrible (catálogo de eventos); los consumidores son responsables de su propia tolerancia (campos desconocidos se ignoran).
- **Queries** completan la tripleta (request/response síncrono o RPC sobre mensajería con reply-to y correlation id) — mencionarla muestra que conoces la taxonomía completa de mensajes.

**Errores comunes:** fan-out de comandos (dos servicios consumiendo `ChargePayment` = doble cobro); eventos con destinatario implícito; el productor de eventos "preguntando a los consumidores qué campos necesitan" para cada cambio (señal de que el contrato en realidad no es suyo o de que está haciendo ECST sin gobierno); y publicar comandos en el topic de eventos del dominio, mezclando semánticas de retención y replay (reprocesar un topic de eventos es seguro; "reprocesar" comandos re-ejecuta órdenes).

**Qué espera oír el entrevistador:** imperativo-vs-pasado como test superficial y la dirección de dependencia como test real, dueño del contrato en cada caso, el anti-patrón del comando disfrazado con su consecuencia de gobierno, y el mapeo cola/topic con los detalles de DLQ, retención y replay.

---

## 13. Schema evolution en eventos: compatibilidad backward/forward/full, schema registry y cómo migrar consumidores
**Categoría:** Schema evolution · **Tipo:** Conceptual

### 📝 Respuesta resumen
En mensajería no puedes desplegar productor y consumidores a la vez, y con replay los consumidores nuevos leen mensajes viejos: el esquema es un contrato con versiones conviviendo siempre. **Backward compatibility** = consumidor nuevo lee datos viejos (necesaria para replay/upgrade de consumidores primero); **forward** = consumidor viejo lee datos nuevos (necesaria para desplegar el productor primero, el caso normal); **full** = ambas, el default sensato para topics compartidos. Un **schema registry** valida en CI/publicación que cada nueva versión cumple el modo del topic, convirtiendo "rompimos a los consumidores el viernes" en un fallo de build. Los cambios rotos (renombrar/quitar campos, cambiar tipos, añadir campo obligatorio) no se hacen in situ: se hacen con expand-contract o con un topic v2 y migración de consumidores.

### 📖 Respuesta detallada
**Qué cambia sin romper (con Avro + registry como referencia):** añadir campo **con default** (backward y forward: el lector viejo lo ignora, el lector nuevo usa el default al leer datos viejos); quitar un campo **que tenía default**; ampliar tipos promocionables (int→long). **Qué rompe:** renombrar un campo (para Avro es quitar+añadir; en JSON sin registry, los consumidores leen `null` silenciosamente — peor que una excepción), cambiar tipo (long→string), añadir campo requerido sin default (rompe backward: los datos viejos no lo tienen), cambiar la semántica sin cambiar la forma (importes que pasan de euros a céntimos: el registry da OK y contabilidad multiplica por 100 — la compatibilidad sintáctica no cubre la semántica; eso va en review humana del contrato y en el nombre del campo: `amountCents`).

**El registry en el flujo:** el producer serializa con el schema id registrado (5 bytes de cabecera en el wire format de Confluent); el registry rechaza la publicación de un esquema que viole el modo del subject (`BACKWARD`, `FORWARD`, `FULL`, y las variantes `_TRANSITIVE`, que validan contra todas las versiones y no solo la última — usa transitive, el gotcha clásico es que v3 sea compatible con v2 pero no con v1 que aún está en el topic). Lo importante no es la herramienta sino dónde corta: el check corre en CI contra el registry (`mvn schema-registry:test-compatibility` o equivalente) y el cambio incompatible no llega a producción. Con JSON Schema o Protobuf aplica igual con matices (Protobuf: nunca reutilizar números de campo; JSON: consumidores tolerantes que ignoren campos desconocidos — la tolerancia del lector es la mitad de la forward compatibility).

**Matriz operativa que hay que saber recitar:** ¿quién despliega primero? Backward → primero consumidores; forward → primero productor. Como en la práctica el productor cambia su esquema y despliega cuando quiere, y los replays existen, **full transitive** en topics de más de un equipo es la política por defecto y las excepciones se negocian.

**Cambio incompatible de verdad (rediseño del evento):** dos estrategias:

1. **Expand-contract dentro del mismo esquema:** añades el campo nuevo con default junto al viejo (`amountCents` junto a `amount`), el productor escribe ambos, los consumidores migran a su ritmo, y meses después (cuando la retención garantiza que no quedan mensajes solo-viejos y todos los consumidores migraron) contraes quitando el viejo. Lento pero sin coordinación de despliegues.
2. **Topic nuevo versionado** (`orders.events.v2`): el productor publica en ambos durante la transición (o un traductor v2→v1 alimenta el viejo), los consumidores migran de topic uno a uno con sus propios offsets, y el v1 se apaga cuando su consumer lag es cero y sus grupos están vacíos — se verifica con métricas, no por email. Necesario cuando el cambio es estructural (repartir un evento en dos, cambiar la key y por tanto el particionado).

**Errores comunes:** "es JSON, es flexible" (la flexibilidad solo pospone el error al runtime del consumidor); defaults ausentes en Avro que hacen imposible la evolución futura; compatibilidad no transitiva; upcasting solo en el consumidor nuevo y olvidar los mensajes retenidos/replay (pregunta 9); y borrar el topic v1 porque "ya nadie lo usa" sin mirar los consumer groups.

**Qué espera oír el entrevistador:** las tres compatibilidades atadas a *quién despliega primero* y a los replays, ejemplos concretos de qué rompe, el registry como gate de CI y no como catálogo decorativo, el límite sintáctico-vs-semántico, y expand-contract vs topic v2 con el criterio de cierre por métricas de lag.

---

## 14. Reintentos: backoff exponencial con jitter, retry topics, retry budget y cuándo NO reintentar
**Categoría:** Resiliencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
Reintentar solo errores **transitorios**, con backoff exponencial **con jitter** (sin jitter, todos los que fallaron a la vez reintentan a la vez: retry storm sincronizada contra un servicio que intenta levantarse). En consumidores de Kafka, reintentar in situ bloquea la partición (head-of-line blocking), así que se usan **retry topics** escalonados (5s → 1m → 10m → DLQ) aceptando que rompen el orden por entidad. Un **retry budget** (p. ej. reintentos ≤ 10–20% del tráfico) evita que los reintentos amplifiquen una degradación en colapso: en cascada de N niveles con 3 intentos cada uno, una petición fallida se multiplica por 3^N. No se reintenta lo no-transitorio (400, validación, negocio) ni lo no-idempotente sin clave de idempotencia.

### 📖 Respuesta detallada
**La fórmula que hay que saber escribir:**

```java
long backoff = min(maxDelay, baseDelay * (1L << attempt));   // exponencial, capado
long sleep = ThreadLocalRandom.current().nextLong(backoff);  // FULL jitter (AWS)
```

Full jitter (dormir un uniforme entre 0 y el backoff) es el que mejor desincroniza; equal jitter (mitad fija + mitad aleatoria) si necesitas un mínimo garantizado. El porqué: si 10.000 requests fallan en el mismo segundo por un blip del downstream, sin jitter reintentan en oleadas exactas a t+1s, t+2s, t+4s… cada oleada tumba de nuevo al servicio convaleciente. Con full jitter, la carga se esparce uniformemente. Complemento obligatorio: **circuit breaker** — el breaker corta el flujo cuando el downstream está claramente caído (reintentar contra un muerto solo quema budget y latencia) y sus half-open probes hacen de sonda de recuperación; retry maneja el fallo puntual, breaker el fallo sostenido.

**Reintentos en consumidores de mensajería — el trade-off central es con el orden:**

- **In situ (bloqueante):** el consumidor reintenta el mensaje sin avanzar (Spring Kafka `DefaultErrorHandler` con `ExponentialBackOff`). Preserva el orden de la partición al precio de head-of-line blocking: un mensaje reintentando 10 minutos frena a todos los de su partición y, con `max.poll.interval.ms` excedido, provoca rebalanceo (mitigable con `pause()` del container). Correcto cuando el orden por entidad es crítico (pregunta 5) o los backoffs son cortos.
- **Retry topics escalonados (patrón "tiered retry"):** el fallo se publica en `orders.billing.retry.5s`; su consumidor espera hasta `timestamp + 5s` (pausando la partición, no con `sleep` por mensaje), reprocesa, y si falla escala a `retry.1m`, `retry.10m` y finalmente DLQ (pregunta 7). No bloquea el flujo principal, da visibilidad por nivel (lag del topic `retry.10m` = cuántos mensajes van mal de verdad)… y **rompe el orden**: los eventos posteriores de la misma entidad adelantan al que está en retry — se combina con guards de versión o se aparca la entidad completa. En RabbitMQ, el equivalente son colas con TTL + dead-letter-exchange de vuelta a la cola principal (gotcha: el TTL por mensaje solo expira en cabeza de cola; usar TTL por cola con una cola por nivel de delay). SQS lo trae casi gratis: visibility timeout creciente por `ApproximateReceiveCount` + redrive policy.
- **Delay corto in situ + niveles para lo largo** es la combinación práctica habitual (2–3 intentos de milisegundos cubren el 95% de blips sin sacar el mensaje de su carril).

**Retry budget:** límite global de reintentos como fracción del tráfico (el 20% de gRPC/Envoy, o token bucket local: cada éxito deposita, cada retry gasta). Racional: con retries por capa en una cadena API→servicio A→servicio B, 3 intentos por capa convierten 1 fallo de B en hasta 9 llamadas — la amplificación exponencial es lo que convierte degradaciones en caídas (la espiral metastable de la pregunta 6). Presupuesto agotado → el fallo se propaga rápido (fail fast) en vez de amplificarse. Regla de arquitectura: reintentos **en un solo nivel** de la cadena (el más cercano al fallo o el borde, no ambos).

**Cuándo NO reintentar:** errores permanentes (400/422, validación, autorización, negocio: "saldo insuficiente" no se cura esperando) → DLQ o rechazo directo; operaciones no idempotentes sin clave de idempotencia (¿el timeout fue antes o después de cobrar? no lo sabes — reintentar sin `Idempotency-Key` es apostar dinero del cliente); cuando el deadline del llamante ya expiró (propagar deadline y comprobarlo antes de cada intento: trabajo cuyo solicitante se fue es carga pura); y 429/`Retry-After` — eso no es "reintenta ya", es "obedece el header".

**Errores comunes:** reintentar todo uniformemente sin clasificar errores; backoff sin jitter ni cap; retry topics sin pensar el orden; `sleep()` en el hilo del consumidor de Kafka hasta provocar rebalanceos; y retries en cada capa de la cadena "por seguridad".

**Qué espera oír el entrevistador:** full jitter con su porqué (thundering herd), la tensión retry-vs-orden y cómo la resuelves, tiered retry con implementación real en su broker, retry budget con el cálculo de amplificación 3^N, breaker como complemento y una lista clara de cuándo no reintentar.

---

## 15. [CASO] Comunicación entre el servicio de pedidos y 6 servicios downstream
**Categoría:** Diseño de sistemas · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
> "Estás diseñando la plataforma de e-commerce. Cuando se confirma un pedido deben reaccionar seis servicios: facturación, stock, notificaciones, analítica, fraude y logística. ¿Cómo comunicas el servicio de pedidos con cada uno — síncrono, colas, eventos? Justifícalo servicio por servicio, no me vale 'todo por Kafka'."

### 📝 Respuesta resumen
La pregunta clave por servicio es doble: ¿Orders necesita la respuesta para decidir (síncrono o saga), y el flujo es un hecho a difundir (evento) o una orden a un destinatario (comando)? Mi corte: **fraude y stock** participan en la decisión de confirmar → dentro del flujo de confirmación (fraude síncrono o pre-calculado; stock como paso de saga con reserva y compensación). **Facturación, notificaciones, analítica y logística** reaccionan a un hecho consumado → un único evento `OrderConfirmed` (outbox → topic, key = orderId) con cuatro consumer groups independientes, cada uno con su DLQ, idempotencia y su tolerancia al lag. Nada de seis llamadas REST desde Orders (disponibilidad compuesta y acoplamiento a seis contratos) ni de fraude "por evento" (decidirías confirmar sin su respuesta).

### 📖 Respuesta detallada
**Primero, separar los que están en el camino de la decisión de los que reaccionan al hecho.** Confirmar un pedido es la transacción de negocio; fraude y stock condicionan su resultado, los otros cuatro no.

**1. Fraude — síncrono en el flujo de confirmación (con presupuesto y fallback).** Si la respuesta de fraude decide si el pedido se confirma, pedirla "por evento" significa confirmar primero y preguntar después. Llamada síncrona con timeout corto (p. ej. 300–500 ms de budget dentro del checkout) y **política explícita de fallo**: si fraude no responde, ¿fail-open (confirmar y revisar async, riesgo acotado por importe) o fail-closed (rechazar, pérdida de venta)? Esa decisión es de negocio y hay que forzarla en el diseño — típico: fail-open bajo un umbral de importe, fail-closed encima. Alternativa válida a mencionar: scoring asíncrono continuo (fraude consume eventos de comportamiento y mantiene un score pre-calculado; el checkout solo lee el score local → rápido y disponible), con revisión post-confirmación para los casos grises que puede desembocar en cancelación compensada.

**2. Stock — paso de saga, no un consumidor más.** Reservar stock debe poder fallar y abortar la confirmación (o dejarla en backorder): es un paso con respuesta y compensación (`ReserveStock` / `ReleaseStock`), no una reacción a un hecho. Con dos participantes con resultado (stock y pago) esto es una saga corta orquestada por Orders (pregunta 11): comando a stock por cola, respuesta, cobro, y `OrderConfirmed` solo al final feliz. Si el negocio acepta overselling con reconciliación (algunos retailers sí), stock puede degradarse a consumidor del evento — hay que preguntar al negocio, y decir en voz alta que esa pregunta existe.

**3. Facturación — consumidor del evento, con at-least-once en serio.** Reacciona a `OrderConfirmed`; nadie espera la factura para confirmar. Es el consumidor donde la pérdida o duplicado cuesta dinero legal: outbox en Orders (pregunta 4), inbox idempotente en billing (pregunta 3), DLQ con alerta de umbral uno (pregunta 7), y orden por `orderId` para procesar `OrderConfirmed`/`OrderCancelled` sin invertir (pregunta 5). Lag tolerable: minutos.

**4. Notificaciones — consumidor del evento, con TTL y prioridad.** El email de confirmación tolera segundos-minutos de lag pero su utilidad caduca: chequear la edad del evento y descartar (o degradar) lo muy viejo tras un incidente — reenviar 200.000 confirmaciones con 6 horas de retraso es peor que no enviarlas (pregunta 6). Cola separada de otros tipos de notificación menos críticos; duplicado ocasional aceptable → idempotencia best-effort (dedupe por `eventId` con TTL corto) basta.

**5. Analítica — consumidor del evento, el más desacoplado.** Alto volumen, lag de minutos u horas irrelevante, consumo en batch hacia el warehouse (o Kafka Connect sink). Es el ejemplo perfecto de por qué el evento con ECST razonable (pregunta 8: totales, líneas, ids) evita que analítica martillee la API de Orders. Pérdidas puntuales asumibles → sin la artillería de facturación; si el negocio exige exactitud contable en analítica, se reconcilia batch contra la fuente, no se persigue exactly-once en el pipeline.

**6. Logística — consumidor del evento… pero probablemente de `OrderPaid`, no `OrderConfirmed`.** No debe prepararse el envío de lo no cobrado: elegir el evento correcto del ciclo de vida es parte de la respuesta. Consume el hecho, ejecuta con reintentos largos (integra con carriers externos lentos y caprichosos: tiered retry de la pregunta 14) y publica sus propios eventos (`ShipmentDispatched`) que Orders u otros consumen — la conversación es bidireccional por eventos, no un árbol de llamadas.

**Arquitectura resultante:** Orders ejecuta una saga corta (fraude→stock→pago) y publica `OrderConfirmed`/`OrderPaid`/`OrderCancelled` vía outbox en `orders.events` (key = orderId, full-transitive compat en el registry — pregunta 13). Cuatro consumer groups independientes con DLQs y políticas de retry propias. Orders no conoce a ninguno de los cuatro; conoce el contrato de stock y fraude porque participan en su decisión.

**Qué espera oír el entrevistador:** que no des una respuesta uniforme; el criterio "¿condiciona la decisión o reacciona al hecho?"; la política de fallo de fraude como decisión de negocio; stock como saga con compensación; los cuatro consumidores diferenciados por coste de pérdida/duplicado/lag (facturación ≠ analítica); la elección del evento correcto del ciclo de vida para logística; y que compongas sin nombrarlas todas las piezas del resto del banco: outbox, idempotencia, ordering por key, DLQ, TTL y retry budgets.
