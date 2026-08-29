# RabbitMQ y Otros Brokers (SQS · SNS · NATS · Pulsar) — Preguntas de Entrevista Senior

Banco de preguntas para entrevistas senior sobre brokers de mensajería más allá de Kafka: RabbitMQ en profundidad (AMQP, fiabilidad, clustering, streams), los servicios gestionados de AWS (SQS/SNS), NATS/JetStream y Apache Pulsar. Cada pregunta incluye el mecanismo interno, los parámetros con su nombre exacto, configuración realista y los trade-offs que separan una respuesta de senior de una de junior.

---

## 1. Explica el modelo AMQP 0-9-1: exchanges, bindings, routing keys y colas. ¿Cómo modelarías un routing complejo?
**Categoría:** RabbitMQ / AMQP · **Tipo:** Conceptual

### 📝 Respuesta resumen
En AMQP 0-9-1 el productor nunca publica a una cola: publica a un **exchange** con una **routing key**, y el exchange enruta copias del mensaje a cero o más colas según sus **bindings**. Hay cuatro tipos: `direct` (match exacto de routing key), `topic` (patrones con `*` y `#` sobre claves separadas por puntos), `fanout` (ignora la key, copia a todas las colas enlazadas) y `headers` (match sobre headers con `x-match: any|all`). El routing complejo se modela componiendo topic exchanges con convenciones de claves jerárquicas (`<dominio>.<entidad>.<evento>`), exchange-to-exchange bindings y alternate exchanges para lo no enrutable.

### 📖 Respuesta detallada
El desacoplamiento productor/consumidor de AMQP es *topológico*: el productor conoce el exchange y el contrato de la routing key; los consumidores deciden qué reciben declarando colas y bindings. Esto invierte la responsabilidad respecto a Kafka, donde el productor elige la partición/topic destino de forma directa.

**Los cuatro tipos, con su mecanismo:**

- **`direct`:** entrega a las colas cuyo binding key sea *idéntico* a la routing key. Una cola puede tener varios bindings (p. ej. `payments.captured` y `payments.refunded` a la misma cola). El **default exchange** (`""`, nameless) es un direct especial: cada cola queda enlazada automáticamente con su propio nombre como key — por eso `basic.publish("", "mi-cola", msg)` "publica a la cola" (en realidad enruta por el default exchange).
- **`topic`:** claves con segmentos separados por punto; `*` casa exactamente un segmento, `#` casa cero o más. `order.*.created` casa `order.eu.created` pero no `order.eu.b2b.created`; `order.#` casa ambas. Un topic con binding `#` se comporta como fanout.
- **`fanout`:** ignora la routing key; copia a todas las colas enlazadas. Es el más rápido porque no evalúa nada. Patrón típico: broadcast de invalidación de cachés, con una **cola exclusiva y auto-delete por instancia** de servicio.
- **`headers`:** matching sobre headers del mensaje con el argumento de binding `x-match` = `all` (todos deben casar) o `any` (al menos uno). Se usa poco: es más lento y casi todo lo que resuelve se resuelve con topic; conocerlo suma, proponerlo como primera opción resta.

**Modelado de routing complejo — lo que espera el entrevistador:**

1. **Convención de routing keys jerárquica** y documentada como contrato: `<bounded-context>.<agregado>.<evento>[.<cualificador>]`, p. ej. `billing.invoice.issued.eu`. Los consumidores hacen binding por lo que les importa: facturación completa (`billing.#`), solo emisiones (`billing.invoice.issued.*`), solo EU (`billing.*.*.eu`).
2. **Exchange-to-exchange bindings** (`exchange.bind`, extensión de RabbitMQ): permiten capas — un exchange `events` (topic) del que cuelga un exchange `audit` (fanout) que recibe todo vía binding `#`, sin duplicar bindings en cada cola. Útil para separar "topología de dominio" de "topología de infraestructura" (auditoría, réplica a data lake).
3. **Alternate exchange** (`alternate-exchange` como argumento del exchange, normalmente vía policy): los mensajes que *no casan con ningún binding* van a un exchange alternativo (típicamente fanout → cola `unrouted`) en vez de perderse en silencio. Es la red de seguridad contra typos en routing keys.
4. **Declaración idempotente por código o IaC:** `exchangeDeclare`/`queueDeclare` son idempotentes si los argumentos coinciden; si difieren, el broker cierra el canal con `PRECONDITION_FAILED (406)` — error clásico al cambiar `durable` o un `x-argument` de una cola existente. En producción, topología por definitions/Terraform y **policies** en lugar de `x-arguments` hardcodeados, porque los argumentos de una cola declarada son inmutables y las policies no.

```bash
# Topología ejemplo con rabbitmqadmin
rabbitmqadmin declare exchange name=events type=topic durable=true \
  arguments='{"alternate-exchange":"unrouted"}'
rabbitmqadmin declare queue name=billing.invoice-issued durable=true \
  arguments='{"x-queue-type":"quorum"}'
rabbitmqadmin declare binding source=events destination=billing.invoice-issued \
  routing_key="billing.invoice.issued.*"
```

**Errores comunes:** publicar directamente a colas por el default exchange (acopla productor a consumidor y mata la extensibilidad), usar un exchange fanout y filtrar en el consumidor (tráfico y deserialización inútiles: en Rabbit se filtra en el broker), y meter datos variables de alta cardinalidad (IDs de usuario) en la routing key cuando nadie hará binding por ellos. Un cierre de senior: "la routing key es parte del contrato público del productor, la versiono y la documento igual que el schema del payload".

---

## 2. Acks de consumidor y publisher confirms en RabbitMQ: ¿qué garantiza cada mecanismo y qué pierdes sin cada uno?
**Categoría:** RabbitMQ / Fiabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Hay dos tramos independientes de fiabilidad. Lado consumidor: **manual acks** (`basic.ack`, `basic.nack`, `basic.reject`) — sin ellos (`autoAck=true`) el broker borra el mensaje al escribirlo al socket, y un crash del consumidor lo pierde. Lado productor: **publisher confirms** (`confirm.select`) — el broker confirma asíncronamente cuando el mensaje está enrutado y (en colas durables/quorum) persistido; sin confirms, un `basic.publish` es fire-and-forget y una caída del broker o un error de canal pierde mensajes sin que nadie se entere. Y ortogonal a ambos: el flag **`mandatory`** + `basic.return`, porque un confirm también llega cuando el mensaje *no casó con ninguna cola* y se descartó.

### 📖 Respuesta detallada
**1. Consumer acknowledgements.** Con `autoAck=false`, el mensaje entregado queda *unacked* asociado al canal; si el canal/conexión muere, el broker lo re-encola y lo redelivera (con el flag `redelivered=true`). Las tres primitivas:

- `basic.ack(deliveryTag, multiple)` — confirma uno o, con `multiple=true`, todos los tags ≤ deliveryTag del canal (amortiza acks en lotes).
- `basic.nack(deliveryTag, multiple, requeue)` — rechazo con soporte de `multiple`.
- `basic.reject(deliveryTag, requeue)` — el original AMQP, sin `multiple`.
- Con `requeue=true` el mensaje vuelve (lo más cerca posible de su posición original); con `requeue=false` se descarta o va al **DLX** si la cola tiene `x-dead-letter-exchange`.

Qué pierdes sin manual acks: cualquier crash, deploy o kill del pod entre la entrega y el final del procesamiento pierde el mensaje. Qué pierdes con manual acks *mal usados*: hacer ack **antes** de procesar (equivale a autoAck), o acumular unacked sin límite de prefetch (memoria del broker y del cliente). Detalle que distingue seniors: el `deliveryTag` es **por canal**; ackear desde otro hilo/canal produce `PRECONDITION_FAILED — unknown delivery tag` y cierra el canal.

**2. Publisher confirms.** El canal entra en modo confirm con `confirm.select` (`channel.confirmSelect()`). El broker envía `basic.ack` al productor cuando el mensaje está "a salvo": enrutado a todas sus colas y, si son durables y el mensaje es persistente (`delivery_mode=2`), tras el fsync (que RabbitMQ agrupa en lotes, por eso los confirms llegan con latencia variable y conviene tratarlos asíncronamente). `basic.nack` del broker significa que **no pudo** responsabilizarse (p. ej. la cola perdió su quorum). En quorum queues, el confirm llega cuando la **mayoría** de réplicas ha persistido el mensaje.

```java
channel.confirmSelect();
ConcurrentNavigableMap<Long, Message> outstanding = new ConcurrentSkipListMap<>();

channel.addConfirmListener(
    (tag, multiple) -> {                       // ack del broker
        if (multiple) outstanding.headMap(tag, true).clear();
        else outstanding.remove(tag);
    },
    (tag, multiple) -> {                       // nack del broker: republicar
        var failed = multiple ? outstanding.headMap(tag, true) : Map.of(tag, outstanding.get(tag));
        resend(failed); 
    });

long seq = channel.getNextPublishSeqNo();      // correlación manual por secuencia
outstanding.put(seq, msg);
channel.basicPublish("events", "billing.invoice.issued.eu",
    MessageProperties.PERSISTENT_BASIC, body);
```

Anti-patrón clásico: `waitForConfirmsOrDie()` tras **cada** publish — serializa un RTT por mensaje y hunde el throughput de miles/seg a cientos/seg. Lo correcto: confirms asíncronos con ventana de mensajes en vuelo (el mapa `outstanding`), o al menos confirmar por lotes.

**3. `mandatory` y `basic.return`.** Un confirm dice "me hice responsable", pero *descartar un mensaje que no casó con ningún binding también es hacerse responsable*: el broker lo confirma igualmente. Con `mandatory=true`, el mensaje no enrutable vuelve al productor vía `basic.return` (callback `addReturnListener`) **antes** del confirm. Sin `mandatory` ni alternate exchange, un typo en la routing key produce pérdida silenciosa con confirms en verde — trampa favorita de entrevistadores. El flag `immediate` de AMQP 0-9-1 ya no está soportado por RabbitMQ.

**El cuadro completo que espera oír el entrevistador:** at-least-once extremo a extremo = publisher confirms + `mandatory` (o alternate exchange) + mensajes persistentes + colas quorum/durables + manual acks tras procesar + **consumidor idempotente**, porque tanto la republicación por nack/timeout como la redelivery por caída de canal producen duplicados. Quien promete exactly-once en RabbitMQ sin hablar de idempotencia (clave de deduplicación en BD, `redelivered` como pista, outbox en el productor) no ha operado esto en producción.

---

## 3. Quorum queues vs classic mirrored queues: ¿por qué las mirrored están deprecadas y qué límites tienen las quorum?
**Categoría:** RabbitMQ / Alta disponibilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Las classic mirrored queues (policies `ha-mode`/`ha-sync-mode`) replicaban con un algoritmo propio (variante de chained replication) con fallos de diseño conocidos: mirrors no sincronizados tras un reinicio, resincronización *bloqueante* de la cola entera, y escenarios de failover con pérdida de datos confirmados. Las quorum queues (`x-queue-type: quorum`) usan **Raft**: un líder y followers, commit por mayoría, failover determinista sin resync total. Mirroring está deprecado desde 3.9 y **eliminado en RabbitMQ 4.0**. Límites de quorum: mayor huella de memoria/disco (WAL + segmentos), sin colas `exclusive` ni no-durables, sin per-message TTL histórico, y necesitan `delivery-limit` para no sufrir con poison messages (contador `x-delivery-count`).

### 📖 Respuesta detallada
**Por qué murió el mirroring clásico.** El diseño tenía tres pecados capitales que cualquier operador sufrió:

1. **Resincronización bloqueante:** cuando un mirror se reincorporaba (deploy, reinicio), partía vacío ("unsynchronised"). Con `ha-sync-mode: automatic`, sincronizarlo **bloqueaba la cola entera** mientras transfería todo el backlog — en colas de millones de mensajes, minutos de indisponibilidad justo después de un reinicio. Con `manual`, los operadores olvidaban sincronizar y corrían sin redundancia real.
2. **Pérdida en failover:** con mirrors no sincronizados, si caía el master había que elegir entre promocionar un mirror desactualizado (perder mensajes) o no promocionar (`ha-promote-on-shutdown`/`ha-promote-on-failure`, indisponibilidad). Además, hubo bugs históricos de pérdida incluso con mirrors "sincronizados" en particiones.
3. **Coste de red absurdo:** el algoritmo replicaba el tráfico de forma ineficiente (los publishes viajaban por todos los mirrors en cadena) y cada operación de cola pasaba por el proceso master, con throughput peor que una cola sin replicar y sin garantías proporcionales al coste.

**Qué hacen distinto las quorum queues.** Cada cola quorum es un grupo Raft independiente (implementación `ra` de RabbitMQ): réplicas típicamente 3 o 5 (`x-quorum-initial-group-size`), un líder por el que pasan publishes y consumos, y **commit cuando la mayoría persiste en su WAL**. Consecuencias directas:

- El publisher confirm llega tras replicación a mayoría → un confirm sí significa "sobrevive a la caída de un nodo".
- Failover: elección Raft en milisegundos, sin resync total — los followers ya tienen el log; un nodo que vuelve solo recupera el *delta*.
- Un mirror clásico "unsynchronised" no tenía análogo seguro; en Raft, un follower atrasado nunca puede ser elegido líder sin tener las entradas comprometidas.

```bash
# Declaración (los args de cola son inmutables; el tipo se fija al crear)
rabbitmqadmin declare queue name=orders durable=true \
  arguments='{"x-queue-type":"quorum","x-quorum-initial-group-size":3,"x-delivery-limit":5}'
# delivery limit también por policy (recomendado):
rabbitmqctl set_policy dl "^orders$" '{"delivery-limit":5}' --apply-to quorum_queues
```

**Límites y letra pequeña de las quorum (lo que diferencia al senior):**

- **Memoria y disco:** mantienen un WAL compartido por nodo (`raft.wal_max_size_bytes`, 512 MB por defecto) más segmentos por cola. Históricamente guardaban más estado en memoria que una classic lazy; desde 3.10+ mueven payloads a disco agresivamente, pero un backlog enorme sigue costando más que en una stream. Muchas colas quorum = muchos procesos Raft = elecciones y heartbeats que consumen CPU; no son para topologías de "una cola por usuario".
- **Poison messages:** un `basic.nack(requeue=true)` en bucle es peor que en classic, porque la cola trackea cada redelivery en el header **`x-delivery-count`** (y eso escribe en el log Raft). La salida correcta: **`delivery-limit`** — al superarlo, el mensaje se descarta o se dead-letterea si hay DLX. En RabbitMQ 4.x el límite por defecto es 20; antes era ilimitado y un poison message podía ciclar para siempre.
- **Funcionalidad ausente:** no soportan `exclusive`, ni colas no-durables/transient, ni per-message TTL con `expiration` (per-queue `x-message-ttl` sí, desde 3.10); las prioridades llegaron tarde y limitadas. `global=true` en `basic.qos` no aplica.
- **Dead-lettering:** por defecto es `at-most-once`; para no perder mensajes camino del DLX existe `dead-letter-strategy: at-least-once` (exige `overflow: reject-publish`).

**Qué espera oír el entrevistador:** "quorum por defecto para todo lo que importe; classic (sin mirroring, v2) solo para colas efímeras/exclusivas o de baja importancia; streams para backlog masivo y replay". Y el matiz de migración: no se puede "convertir" una cola — hay que crear la quorum, mover el tráfico (nuevo binding o shovel) y drenar la vieja.

---

## 4. `basic.qos` / prefetch: ¿qué controla exactamente y cómo lo dimensionas?
**Categoría:** RabbitMQ / Rendimiento · **Tipo:** Conceptual

### 📝 Respuesta resumen
`basic.qos(prefetch_count)` limita cuántos mensajes **entregados sin ack** puede tener un consumidor (o canal): el broker deja de empujar cuando `unacked == prefetch` y reanuda con cada ack. Es la palanca de backpressure del lado consumidor. `prefetch=1` da máxima fairness (nadie acapara) a costa de un RTT por mensaje; valores altos maximizan throughput pero concentran mensajes en consumidores que quizá van lentos, y prefetch ilimitado (0) puede tumbar al cliente por memoria. Regla práctica: `prefetch ≈ tasa_por_consumidor × latencia_total (procesamiento + RTT)`, con margen ×2, y medir.

### 📖 Respuesta detallada
**Mecanismo.** RabbitMQ es push: el broker entrega tan rápido como la red permita. Sin QoS, un consumidor de una cola con 2M de mensajes recibe una avalancha que se acumula en el buffer del cliente — heap creciendo, GC, y mensajes "secuestrados" que otros consumidores no pueden procesar. `basic.qos` crea una ventana deslizante de crédito: entregados-sin-ack ≤ `prefetch_count`. Cada `basic.ack` libera hueco y dispara la siguiente entrega.

El flag **`global`** confunde a todos: en RabbitMQ, `global=false` (defecto) aplica el límite **a cada consumidor** nuevo del canal por separado; `global=true` lo aplica **compartido a todo el canal** (todos los consumidores del canal suman contra el mismo límite), lo que es más costoso de coordinar para el broker. (La spec AMQP original decía otra cosa; RabbitMQ la reinterpretó y así lo documenta.) En quorum queues `global=true` no está soportado.

**Dimensionado con números (lo que quiere oír el entrevistador):**

- Consumidor que procesa en ~5 ms, RTT de red ~5 ms: para no quedar ocioso esperando la siguiente entrega necesita en vuelo aproximadamente `(5+5)/5 = 2` mensajes; con margen, prefetch 5–10. 
- Tareas de segundos o minutos (render de vídeo, envíos de email masivos): `prefetch=1`. El coste del RTT extra es ruido frente al procesamiento, y garantiza que un worker libre coja el siguiente trabajo en vez de que esté asignado a uno ocupado.
- Colas de alto throughput con procesamiento de microsegundos: prefetch 100–300. Spring AMQP usa **250 por defecto** (`spring.rabbitmq.listener.simple.prefetch`) precisamente por esto — y es una trampa conocida cuando la gente lo usa para work queues lentas: con 2 workers y prefetch 250, el primero "reserva" 250 tareas de una hora y el segundo mira el techo.

```yaml
# Spring Boot: work queue lenta y justa
spring:
  rabbitmq:
    listener:
      simple:
        prefetch: 1
        acknowledge-mode: manual
        concurrency: 4          # 4 consumidores en el contenedor
```

**Efectos que hay que saber verbalizar:**

1. **Fairness:** RabbitMQ reparte round-robin entre consumidores *con crédito disponible*. Con prefetch alto y velocidades desiguales, el reparto inicial asigna lotes iguales a consumidores desiguales → cola "vacía" pero p99 de latencia altísimo porque hay mensajes esperando en el buffer del consumidor lento. Con prefetch bajo, el reparto se auto-nivela al ritmo real de cada uno.
2. **Redelivery amplificada:** todo lo prefetched y no-ackeado en el momento de un crash se redelivera. Prefetch 500 + deploy = 500 duplicados potenciales por consumidor. Otro motivo para acotarlo.
3. **Ack por lotes:** prefetch alto combina bien con `basic.ack(multiple=true)` cada N mensajes — se amortizan los RTT de ack. Pero amplía la ventana de duplicados; es un trade-off explícito.
4. **Diagnóstico:** en el management UI, la gráfica de la cola distingue `Ready` vs `Unacked`. Miles de unacked estables = prefetch demasiado alto o consumidor colgado sin ackear; `Ready` creciendo con consumidores ociosos y unacked al tope = consumidores lentos, no falta de consumidores.

**Error común de diseño:** intentar "priorizar" subiendo el prefetch de un consumidor. El prefetch no prioriza: solo cambia cuánto acapara. Para prioridad real están las priority queues (classic) o colas separadas por prioridad con pools de consumidores dedicados — que es la respuesta senior, porque las priority queues no funcionan bien con backlogs grandes ni con prefetch alto (el broker ya entregó los mensajes de baja prioridad).

---

## 5. TTL, dead-letter exchanges y colas de retraso: patrón de retry con backoff y sus trampas
**Categoría:** RabbitMQ / Patrones · **Tipo:** Conceptual

### 📝 Respuesta resumen
TTL en RabbitMQ existe a dos niveles: **per-queue** (`x-message-ttl`, aplica a todos los mensajes de la cola) y **per-message** (propiedad `expiration`), más el TTL de la propia cola (`x-expires`, borra colas sin uso). Un mensaje muerto (expirado, rechazado con `requeue=false`, `delivery-limit` superado o overflow con `reject-publish` no) se re-publica al **DLX** (`x-dead-letter-exchange` + `x-dead-letter-routing-key`) con el header `x-death` acumulando el historial. El patrón de retry con backoff se construye con "wait queues" con TTL y DLX de vuelta a la cola de trabajo. La trampa capital: la expiración per-message solo se evalúa **en la cabeza de la cola** — un mensaje con TTL largo bloquea la expiración de los que van detrás (head-of-line blocking del TTL).

### 📖 Respuesta detallada
**Los tres TTL, con nombres exactos:**

- `x-message-ttl` (argumento de cola o policy `message-ttl`): milisegundos que un mensaje puede vivir en la cola. Uniforme → los mensajes expiran en orden → se pueden descartar de la cabeza eficientemente.
- `expiration` (propiedad AMQP del mensaje, string en ms): TTL individual. Aquí vive la trampa: RabbitMQ **solo descarta al llegar a la cabeza**. Un mensaje con `expiration=60000` delante de mil con `expiration=1000` retiene a los mil ya "muertos" ocupando memoria/disco, y serán descartados (¡no entregados!) al alcanzar la cabeza.
- `x-expires` (cola): borra la cola entera tras N ms sin consumidores ni operaciones. Para colas de reply o por-sesión.

**Dead lettering.** Configuración vía policy (mejor que argumentos, porque es mutable):

```bash
rabbitmqctl set_policy work-dlx "^work$" \
  '{"dead-letter-exchange":"dlx","dead-letter-routing-key":"work.dead"}' --apply-to queues
```

Causas de dead-letter: `rejected` (nack/reject con `requeue=false`), `expired` (TTL), `maxlen` (overflow con `drop-head`... cuidado: con `reject-publish` el mensaje nuevo se rechaza al productor y NO se dead-letterea), y `delivery_limit` (quorum). El header **`x-death`** (array) acumula por cada paso: `queue`, `reason`, `count`, `time`, `exchange`, `routing-keys` — es la caja negra para depurar por qué un mensaje acabó donde acabó. Ojo: por defecto el dead-lettering interno es best-effort (`at-most-once`); para colas quorum críticas, `dead-letter-strategy: at-least-once` + `overflow: reject-publish`.

**Patrón retry con backoff (TTL + DLX), la versión por niveles:**

```text
work ──nack(requeue=false)──► dlx ──► retry.5s   (x-message-ttl=5000,  DLX=events, DLRK=work)
                                  ──► retry.1m   (x-message-ttl=60000, DLX=events, DLRK=work)
                                  ──► retry.10m  (x-message-ttl=600000, ...)
work ──tras N intentos──► parking-lot (sin TTL; intervención humana)
```

El consumidor decide el nivel leyendo `x-death[0].count` (o un header propio `x-retry-count` que incrementa al republicar) y publica/enruta a la wait queue correspondiente. Cada wait queue tiene TTL **uniforme** — así se esquiva el head-of-line blocking: nunca mezclar TTLs distintos en la misma cola de espera. Al expirar, el DLX de la wait queue devuelve el mensaje a `work`.

**Trampas que el entrevistador quiere oír:**

1. **Head-of-line del TTL per-message** (explicado arriba). Si necesitas retrasos arbitrarios por mensaje, o niveles discretos de wait queues, o el plugin `rabbitmq_delayed_message_exchange` (`x-delayed-message`) — sabiendo que el plugin guarda los mensajes retrasados en una tabla Mnesia/Khepri local, con límites de escalabilidad, sin réplica robusta históricamente y con pérdida posible: no para retrasos críticos masivos.
2. **Ciclos de dead-letter:** `work → dlx → retry → work` con un fallo permanente = bucle eterno. Siempre un contador con corte (`delivery-limit` en quorum, o leer `x-death.count`) y un **parking lot** final.
3. **Pérdida del contexto:** al dead-letterear, la routing key puede ser reescrita (`dead-letter-routing-key`) pero `x-death` conserva las originales. Republicar "a mano" desde código en vez de dead-letterear pierde los headers `x-death` — mejor dejar que el broker haga el dead-lettering y llevar además un header propio idempotente.
4. **TTL=0:** un mensaje con `expiration: "0"` se descarta al llegar a una cola donde no pueda entregarse inmediatamente — truco ocasional ("entrega solo si hay consumidor"), sorpresa habitual.

**Cierre senior:** "si el sistema de retries se vuelve el 30% de la topología, es señal de que ese flujo pedía un broker con retraso nativo (SQS `DelaySeconds`, Pulsar `deliverAfter`) o un scheduler; en Rabbit los retries con TTL+DLX funcionan, pero son artesanía que hay que documentar y monitorizar (profundidad del parking lot como alerta)".

---

## 6. Flow control en RabbitMQ: memory/disk alarms y credit flow. ¿Qué ve el productor cuando el broker se defiende?
**Categoría:** RabbitMQ / Operación · **Tipo:** Conceptual

### 📝 Respuesta resumen
RabbitMQ se defiende en dos niveles. **Alarmas de recursos**: si la memoria supera `vm_memory_high_watermark` (0.6 relativo por defecto en 4.x; históricamente 0.4) o el disco libre baja de `disk_free_limit` (50 MB por defecto — peligrosamente bajo), el broker **bloquea todas las conexiones que publican** en todo el cluster hasta salir de la alarma. **Credit flow**: mecanismo interno por conexión/canal/cola que frena a un publisher concreto cuando publica más rápido de lo que la cadena de procesos puede absorber (estado `flow`). El productor no recibe errores: sus writes TCP dejan de ser leídos y `basic.publish` se vuelve bloqueante — publishers "colgados" sin excepción es el síntoma clásico.

### 📖 Respuesta detallada
**Alarmas de recursos (cluster-wide).**

- `vm_memory_high_watermark.relative = 0.6` (o `absolute = 4GB`): cuando el uso de memoria del nodo lo supera, se dispara la memory alarm. `disk_free_limit.absolute = 50MB` por defecto: en producción se sube a ≥ 1–2× la RAM (porque bajo memory pressure Rabbit pagina mensajes a disco y necesita hueco). 
- Efecto: el broker deja de leer de los sockets de **todas** las conexiones marcadas como publishers, *en todos los nodos* (una alarma en un nodo bloquea el cluster entero, porque una publicación puede enrutarse a una cola en el nodo alarmado). Consumir sigue permitido — es deliberado: consumir drena colas y ayuda a salir de la alarma.
- El cliente que declaró `connection.blocked` en sus capabilities recibe la notificación **`connection.blocked`** / **`connection.unblocked`** (en Java, `addBlockedListener`). Los clientes que no la escuchan simplemente ven `basic.publish` bloquear (el buffer TCP se llena) o timeouts en `waitForConfirms` — de ahí los "publishers colgados sin error en logs".

**Credit flow (por conexión, permanente).** Independiente de alarmas: cada eslabón de la cadena `reader TCP → canal → proceso de cola` concede créditos al anterior (`credit_flow_default_credit`, por defecto `{400, 200}`: 400 mensajes de crédito, se reponen de 200 en 200 al consumirse). Si una cola no da abasto (fsync, réplica Raft, cola larga paginando), retiene créditos, el canal se queda sin crédito, el reader deja de leer el socket, y esa conexión aparece en estado **`flow`**. Es backpressure selectivo: solo frena a quien publica contra el recurso saturado, y estar en `flow` intermitentemente es *normal* en publishers rápidos — significa que el broker está limitando al ritmo sostenible.

**Diagnóstico — el runbook que espera el entrevistador:**

```bash
rabbitmq-diagnostics alarms                       # ¿hay memory/disk alarm y en qué nodo?
rabbitmqctl list_connections name state recv_cnt  # estados: running | flow | blocked | blocking
rabbitmq-diagnostics memory_breakdown             # ¿quién come la memoria?
rabbitmqctl list_queues name messages messages_unacknowledged memory consumers
```

- `blocking`/`blocked` = alarma de recursos (blocked cuando además intentó publicar). `flow` = credit flow.
- `memory_breakdown` distingue: `queue_procs` (mensajes en colas → el problema son backlogs), `binary` (payloads referenciados, a menudo por conexiones/canales con mensajes en tránsito), `connection_*` (demasiadas conexiones/canales — el clásico "un canal por mensaje" de código mal escrito), `quorum_ets`/WAL, `mgmt_db` (métricas del management con retención excesiva).

**Errores comunes que hay que citar:**

1. Tratar el síntoma subiendo el watermark: la alarma es el airbag; subirla sin resolver el backlog acerca al OOM killer, que es estrictamente peor (crash + recuperación larga de índices de colas).
2. `disk_free_limit` en su defecto de 50 MB en producción: cuando salta ya es tarde, el nodo puede no tener disco ni para paginar y se degrada de forma no lineal.
3. Publishers sin timeout ni listener de `connection.blocked`: hilos HTTP del servicio upstream esperando en `basic.publish` → pool de hilos agotado → la caída se propaga hacia arriba. Un publisher senior publica con timeout, escucha blocked/unblocked, y tiene una política explícita (buffer local acotado, shed de carga, circuit breaker).
4. Confundir `flow` con un problema: es un indicador de ritmo, no un fallo — pero `flow` *constante* en muchas conexiones apunta a colas lentas (¿quorum con fsync saturado?, ¿un solo binding caliente?) y merece investigación.

---

## 7. Clustering y particiones de red en RabbitMQ: `pause_minority`, ¿por qué no cruzar regiones, y qué papel juegan federation y shovel?
**Categoría:** RabbitMQ / Distribución · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un cluster RabbitMQ es una malla completa de nodos Erlang que comparten topología (usuarios, exchanges, bindings — hoy en Khepri/antes Mnesia) y asume red LAN fiable: latencia baja y sin particiones frecuentes. Ante partición, `cluster_partition_handling` decide: `ignore` (split-brain: ambos lados siguen y divergen), `autoheal` (al sanar, reinicia el lado perdedor y **descarta** sus cambios) o **`pause_minority`** (el lado minoritario se pausa — CP, requiere nº impar de nodos, la opción por defecto sensata). Por eso un cluster no debe cruzar regiones: la latencia WAN rompe los timeouts de heartbeat Erlang (`net_ticktime` ~60 s), multiplica falsas particiones y degrada Raft. Para WAN existen **federation** (réplica laxa de exchanges/colas por AMQP, tolera cortes) y **shovel** (bombeo cola→destino, unidireccional y robusto).

### 📖 Respuesta detallada
**Anatomía del cluster.** Los nodos se conectan todos-con-todos por distribución Erlang (puerto 25672), autenticados por la Erlang cookie. Se replica el *metadata* (desde 3.13/4.x en **Khepri**, un store Raft que sustituye a Mnesia, precisamente para arreglar el peor punto histórico: la recuperación de Mnesia tras particiones); los *datos* solo se replican donde se pida (quorum queues, streams). Una cola classic vive en un nodo: los clientes pueden conectar a cualquier nodo y el cluster enruta internamente, con el coste de un salto extra.

**Particiones y `cluster_partition_handling`:**

- `ignore`: cada isla sigue aceptando publishes y acks. Al reconectar, dos historias incompatibles: colas classic duplicadas o divergentes, y con Mnesia, "partitioned network" que exigía reiniciar nodos a mano eligiendo un lado. Solo defendible con quorum queues puras (que ya son Raft y la minoría pierde quorum sola) y aún así arriesgado para el metadata.
- `autoheal`: AP — al sanar la partición, el algoritmo elige lado ganador (más clientes conectados) y **reinicia** los nodos del perdedor, descartando lo que aceptaron durante la partición. Disponibilidad a cambio de pérdida aceptada. 
- `pause_minority`: CP — cada nodo comprueba si ve a la mayoría; si no, se **pausa** por completo (deja de aceptar conexiones). Con 3 nodos y partición 2/1, el nodo aislado se detiene y los clientes reconectan a la mayoría. Requiere nodos impares y hace explícito el trade-off: durante la partición, la minoría no sirve tráfico. Es lo que casi todo el mundo debe usar.

**Por qué no cruzar regiones (la pregunta trampa):** 

1. La detección de fallos de la distribución Erlang (`net_ticktime = 60`; ojo, la detección tarda entre 45–75 s con ese valor) y los heartbeats de Raft están pensados para RTT de microsegundos-a-pocos-ms. Con 80–150 ms interregión, cada blip de la WAN parece una partición → pausas de minoría espurias, elecciones Raft constantes.
2. Cada publish a una quorum queue paga RTT interregión para el commit por mayoría → latencia y throughput hundidos.
3. Un cluster estirado entre 2 regiones ni siquiera da DR real: la región con la minoría se pausa entera. Con 3 regiones "funciona" en la pizarra, pero el coste por mensaje lo descarta.

**Federation y shovel — las herramientas correctas para WAN:**

- **Federation** (plugin `rabbitmq_federation`): un exchange/cola *downstream* se suscribe por AMQP normal al *upstream* (`rabbitmqctl set_parameter federation-upstream ...` + policy `federation-upstream-set`). Los mensajes fluyen bajo demanda (federated exchange replica lo que los bindings downstream piden; federated queue mueve mensajes solo si el downstream tiene consumidores con capacidad). Tolera cortes (reconecta y sigue), cada cluster es soberano, entrega at-least-once, **sin** garantías de orden global ni exactly-once. Ideal: hub-and-spoke entre regiones, "los eventos de EU también se procesan en US".
- **Shovel** (plugin `rabbitmq_shovel`): un worker que consume de un origen (cola) y publica a un destino (exchange/cola, mismo u otro cluster, AMQP 0-9-1 o 1.0), con acks extremo a extremo (`ack-mode: on-confirm`). Más simple y quirúrgico: drenar una cola a otro sitio, migraciones (classic→quorum, cluster viejo→nuevo), puentear datacenters para un flujo concreto. Dynamic shovels se crean por parámetros en caliente.

**Qué espera oír el entrevistador:** que el cluster es para un solo datacenter/región con `pause_minority` + quorum queues; que la geo-distribución en Rabbit es *aplicativa* (federation/shovel, con at-least-once y desorden asumidos); y la comparación honesta: "si el requisito es replicación multi-región nativa y consistente del stream de datos, Rabbit no es la herramienta — ahí hablamos de Kafka con MirrorMaker/Cluster Linking, o Pulsar con geo-replication integrada".

---

## 8. RabbitMQ Streams: ¿qué añaden frente a las colas clásicas y cuándo los elegirías frente a Kafka?
**Categoría:** RabbitMQ / Streams · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una stream (`x-queue-type: stream`) es un **log append-only replicado** dentro de RabbitMQ: lectura no destructiva, múltiples consumidores independientes leyendo el mismo dato, replay por **offset** (`x-stream-offset`: `first`, `last`, `next`, offset numérico o timestamp) y retención por tamaño/tiempo (`x-max-length-bytes`, `x-max-age`) en vez de por consumo. Rompe las dos limitaciones estructurales de las colas: el fan-out barato (una cola clásica por consumidor duplica el dato N veces) y los backlogs enormes (las colas se degradan con millones de mensajes; una stream es I/O secuencial feliz con terabytes). Elegiría streams de Rabbit cuando ya opero RabbitMQ y necesito replay/fan-out en algunos flujos; Kafka cuando el log es el centro del sistema y necesito su ecosistema.

### 📖 Respuesta detallada
**Qué son mecánicamente.** Segmentos en disco (log segmentado, índice por offset y timestamp), replicación con un protocolo de consenso propio del equipo de RabbitMQ (osiris) con líder y réplicas, y dos formas de acceso: AMQP 0-9-1 normal (una stream se consume con `basic.consume` como una cola, pasando `x-stream-offset` en los argumentos del consumidor y **obligatoriamente** manual acks y prefetch definido) o el **stream protocol** binario dedicado (puerto 5552, plugin `rabbitmq_stream`) que es el que da el throughput real (sub-entry batching, chunks, y lectura que puede aprovechar `sendfile`).

```java
// Cliente stream nativo
Environment env = Environment.builder().host("rabbit").port(5552).build();
env.streamCreator().stream("events")
   .maxLengthBytes(ByteCapacity.GB(50))
   .maxAge(Duration.ofDays(7))
   .create();
Consumer c = env.consumerBuilder().stream("events")
   .offset(OffsetSpecification.timestamp(yesterdayMillis))
   .name("billing-reader")                      // server-side offset tracking
   .autoTrackingStrategy().builder()
   .messageHandler((ctx, msg) -> process(ctx.offset(), msg))
   .build();
```

Detalles con enjundia: el **offset tracking** puede guardarse en el propio servidor asociado al `name` del consumidor (análogo al commit de offsets de Kafka); los **single active consumer** dan failover activo-pasivo por nombre; y las **super streams** particionan una stream lógica en varias físicas con routing por hash de clave — el análogo (más joven) a las particiones de Kafka, necesario porque una stream individual, como una partición, se consume ordenada pero no escala horizontalmente el consumo.

**Qué NO son:** no hay dead-lettering, ni TTL per-message, ni prioridades, ni el routing AMQP se aplica *dentro* (una stream puede recibir de un exchange, pero el filtrado fino en el broker es limitado — existe *stream filtering* por valores de filtro con falsos positivos, estilo Bloom, que obliga a re-filtrar en cliente). El ack de consumidor no borra nada: la retención es la única limpieza.

**Streams de Rabbit vs Kafka — el criterio que espera el entrevistador:**

- **A favor de streams:** ya tienes RabbitMQ operado y el 90% de tus flujos son colas; añadir replay/fan-out/backlog en 3 flujos con streams evita operar un segundo sistema distribuido (ZK/KRaft, otro modelo de seguridad, otro clientes). Interoperabilidad AMQP: el mismo mensaje puede ir a colas y a una stream con la topología de exchanges de siempre. Para throughput medio-alto (cientos de miles/seg) sobran.
- **A favor de Kafka:** el ecosistema es el producto — Kafka Connect (cientos de connectors), Kafka Streams/Flink, ksqlDB, schema registry maduro, transacciones/EOS (`exactly_once_v2`), compacted topics (las streams de Rabbit no compactan por clave), particionado y rebalanceo de consumer groups batalla-probados, y tooling operativo de una década. Si el sistema *es* el log (event sourcing a escala, CDC, pipelines de datos), Kafka.
- La respuesta madura no es "cuál es mejor" sino de topología organizativa: "streams me deja cubrir casos de log dentro de la plataforma Rabbit existente; adoptaría Kafka cuando los casos de log dominen o necesite su ecosistema, no por el motor de almacenamiento en sí".

---

## 9. Kafka vs RabbitMQ: criterio de elección de un senior
**Categoría:** Arquitectura / Comparativa · **Tipo:** Conceptual

### 📝 Respuesta resumen
Son primitivas distintas: Kafka es un **log particionado y replicado** — los mensajes se retienen por tiempo/tamaño, los consumer groups traen su offset y el fan-out y el replay son gratis; RabbitMQ es un **broker de colas con routing inteligente** — el mensaje se elimina al consumirse, el broker empuja con backpressure por prefetch y ofrece routing rico (topic/headers), TTL per-message, prioridades, DLX y RPC. Kafka gana en throughput masivo, replay, orden por clave y ecosistema de streaming; Rabbit gana en routing complejo, work queues con fairness, latencias bajas a escala moderada y semánticas por-mensaje. La elección se argumenta con el patrón de acceso, no con benchmarks.

### 📖 Respuesta detallada
**Diferencias estructurales, no de grado:**

1. **Propiedad del cursor.** En Kafka el consumidor posee su offset: veinte equipos leen el mismo topic sin coste marginal para el broker, y "reprocesa desde el martes" es `seek()` a un timestamp. En Rabbit el broker posee el estado de entrega: fan-out = una cola por consumidor lógico (N copias físicas del dato) y replay = no existe en colas (solo en streams, pregunta 8).
2. **Ordering.** Kafka: orden total por partición; con clave de partición consistente, orden por entidad garantizado incluso con cientos de consumidores (uno por partición). Rabbit: orden FIFO por cola con *un* consumidor; con varios consumidores compitiendo, los redeliveries y el prefetch rompen el orden observable — no hay equivalente a "orden por clave con consumo paralelo" (las super streams lo aproximan).
3. **Throughput.** Kafka hace I/O secuencial, batching agresivo y zero-copy: millones de msg/s por cluster con hardware modesto. Rabbit con colas quorum se mueve cómodo en decenas de miles/s por cola; el routing por mensaje y la contabilidad de acks tienen coste por mensaje. Para el 95% de los sistemas ambos sobran — decir esto en la entrevista, con cifras, da credibilidad.
4. **Routing y semánticas por-mensaje.** Rabbit filtra **en el broker** (topic exchanges, headers), y tiene TTL per-message, prioridades, delayed delivery (con plugin), DLX con historial `x-death`, mandatory/returns. Kafka no enruta: el consumidor lee la partición entera y filtra en cliente, el "retry con backoff" son topics `-retry`/`-dlt` artesanales (Spring Kafka `DefaultErrorHandler` + `DeadLetterPublishingRecoverer`), y no hay prioridades ni TTL por mensaje (la retención es por topic).
5. **Backpressure y reparto.** Rabbit: push con prefetch → un pool elástico de workers donde el lento recibe menos, autoscaling trivial por profundidad de cola. Kafka: pull, pero el paralelismo está **cuantizado por particiones** — 8 particiones = máximo 8 consumidores útiles, un mensaje lento bloquea su partición (head-of-line), y añadir consumidores dispara rebalances.

**Ejemplos concretos para anclar el criterio (lo que convierte la respuesta en senior):**

- *Procesado de imágenes subidas por usuarios, tareas de 2–60 s, workers autoescalados* → **RabbitMQ**: work queue con `prefetch=1`, fairness real, DLX para fallos, escalar consumidores sin tocar particiones.
- *Clickstream de 300k eventos/s alimentando data lake, agregaciones en tiempo real y un equipo de ML que quiere re-leer 30 días* → **Kafka**: retención larga, replay, Connect a S3, Streams/Flink.
- *Orquestación de microservicios con comandos enrutados por tipo y tenant, más RPC ocasional* → **RabbitMQ**: topic exchange `command.<tenant>.<tipo>`, reply-to para RPC.
- *Event sourcing donde el log es la fuente de verdad y otros equipos construirán proyecciones que hoy no existen* → **Kafka**: el dato retenido y re-leíble es el requisito.
- *CDC desde Postgres con Debezium* → **Kafka** por ecosistema, aunque Rabbit "podría".

**Errores comunes:** elegir Kafka "por escala" para 200 msg/s y pagar el coste operativo/conceptual (particiones, rebalances, lag) sin usar replay jamás; elegir Rabbit para un pipeline de datos y descubrir que el fan-out a 6 equipos multiplica el almacenamiento y que no hay replay tras un bug de un consumidor; y el error de marco: presentarlos como competidores excluyentes cuando muchas plataformas maduras usan ambos (Rabbit para comandos/trabajos, Kafka para eventos/datos).

---

## 10. SQS y SNS: standard vs FIFO, visibility timeout, DLQs y el patrón fan-out. ¿Qué límites y costes hay que conocer?
**Categoría:** AWS / Mensajería gestionada · **Tipo:** Conceptual

### 📝 Respuesta resumen
SQS es una cola gestionada por polling: **standard** da throughput prácticamente ilimitado con at-least-once y *best-effort ordering* (duplicados y desorden posibles); **FIFO** da orden estricto por `MessageGroupId` y deduplicación de 5 minutos por `MessageDeduplicationId`, a cambio de límites de throughput (300 TPS por operación, 3.000 con batching, decenas de miles en high-throughput mode que reparte por message group). El **visibility timeout** (30 s por defecto) implementa el "lease" del mensaje: si no borras (`DeleteMessage`) antes de que venza, reaparece — es la fuente nº 1 de duplicados. DLQ vía `RedrivePolicy` con `maxReceiveCount`. SNS es pub/sub push; el patrón canónico es **SNS → varias SQS** con filter policies, que da fan-out duradero por suscriptor.

### 📖 Respuesta detallada
**El modelo de SQS es un lease, no una entrega.** `ReceiveMessage` no saca el mensaje: lo *oculta* durante el visibility timeout. El ciclo correcto: recibir → procesar → `DeleteMessage` con el `ReceiptHandle` (que cambia en cada recepción — borrar con un handle viejo falla silenciosamente en algunos flujos, otro clásico). Si el procesamiento excede el timeout, el mensaje se vuelve visible y otro worker lo procesa **en paralelo con el primero** → duplicado con solapamiento temporal, el bug de producción más repetido con SQS. Mitigaciones con nombre: dimensionar el timeout a ~6× el tiempo de proceso esperado (recomendación AWS), extenderlo en caliente con `ChangeMessageVisibility` (patrón heartbeat para tareas largas), e idempotencia siempre. `ApproximateReceiveCount` en los atributos delata mensajes que están ciclando.

**Standard vs FIFO — la letra pequeña:**

- Standard: at-least-once real (duplicados *sin* que tú hagas nada mal, por la replicación interna), orden best-effort. Escala "infinita". 120.000 mensajes en vuelo (recibidos y no borrados) por cola.
- FIFO (`.fifo`): orden garantizado **dentro de cada `MessageGroupId`** — el group es la unidad de paralelismo, como la clave de partición de Kafka: un solo grupo = procesamiento serializado total. Deduplicación por `MessageDeduplicationId` explícito o `ContentBasedDeduplication` (SHA-256 del cuerpo) con ventana de **5 minutos** — no es idempotencia extremo a extremo, solo dedupe de publicación cercana. Throughput: 300 TPS/operación, 3.000 con batches de 10; high-throughput mode llega a ~70.000 TPS en regiones grandes *si distribuyes bien los message groups*. En vuelo: 20.000. Detalle fino: en FIFO, mientras un mensaje de un grupo esté en vuelo, SQS no entrega los siguientes de ese grupo — un mensaje atascado bloquea su grupo entero (head-of-line por diseño).
- Otros límites transversales: mensaje ≤ 256 KB (1 MB desde 2025 en SQS; payloads mayores → patrón claim check con S3 y la Extended Client Library), retención máx. 14 días, `DelaySeconds` hasta 15 min.

**Long polling.** Con `WaitTimeSeconds=20` (máximo), `ReceiveMessage` espera hasta que haya mensajes y consulta todos los servidores (short polling muestrea un subconjunto: puede devolver vacío habiendo mensajes). Siempre long polling: menos requests vacíos = menos coste y menos latencia media. Con cada request se piden hasta `MaxNumberOfMessages=10`.

**DLQ y redrive.** `RedrivePolicy = {deadLetterTargetArn, maxReceiveCount}`: cuando `ReceiveCount` supera el umbral, SQS mueve el mensaje a la DLQ (misma clase standard/FIFO, misma región/cuenta). Matices de senior: `maxReceiveCount=1` convierte cualquier blip (o un visibility timeout corto) en dead-letter — típico 3–5; la retención de la DLQ debe ser larga (el reloj de retención **no se reinicia** al mover el mensaje: cuenta desde el `SentTimestamp` original); y existe **redrive to source** nativo para devolver mensajes reparados a la cola origen. Alarma obligatoria: `ApproximateNumberOfMessagesVisible > 0` en la DLQ.

**SNS y el fan-out.** SNS es push (topics → suscriptores: SQS, Lambda, HTTP, email...) sin retención para suscriptores caídos (salvo reintentos de la delivery policy). Por eso el patrón canónico es **SNS → SQS por consumidor**: durabilidad y ritmo propio para cada uno. Piezas con nombre: `RawMessageDelivery=true` (sin el sobre JSON de SNS), **filter policies** (por message attributes o, con `FilterPolicyScope=MessageBody`, por el cuerpo) que filtran en el lado de AWS, SNS FIFO → SQS FIFO para fan-out ordenado, y la cola SQS necesita una resource policy permitiendo `sns.amazonaws.com` con `aws:SourceArn` del topic — el fallo de permisos que hace que "no llegue nada" sin error visible. Alternativa moderna a evaluar: EventBridge (routing por contenido más rico, 24h de reintentos, archive/replay) cuando el caso es event bus y no fan-out simple.

**Costes:** se paga por request (cada `SendMessage`, `ReceiveMessage` — también los vacíos — y `DeleteMessage` cuenta; cada 64 KB de payload = 1 request facturable). Orden de magnitud: ~0,40 $/millón de requests standard (~0,50 FIFO). Consecuencias: batching (`SendMessageBatch`/`DeleteMessageBatch`) divide el coste hasta por 10, long polling elimina el coste de polls vacíos, y un fleet de workers haciendo short-polling agresivo sobre colas vacías es dinero quemado — con Lambda, el event source mapping ya gestiona el polling eficientemente.

**Qué espera oír el entrevistador:** el modelo de lease bien explicado, "FIFO no me exime de idempotencia" (dedupe de 5 min ≠ exactly-once), el bloqueo por message group, y criterio frente a un broker propio: SQS/SNS ganan por operación cero, IAM y escala elástica cuando el patrón es cola simple + fan-out; pierden cuando necesitas routing rico, replay, orden global alto-throughput o latencias p99 de un dígito de ms.

---

## 11. NATS y JetStream: ¿qué garantiza cada capa y dónde encajan frente a Kafka y RabbitMQ?
**Categoría:** NATS · **Tipo:** Conceptual

### 📝 Respuesta resumen
Core NATS es pub/sub **at-most-once** en memoria: subjects jerárquicos (`orders.eu.created`, wildcards `*` y `>`), **queue groups** para repartir carga y **request-reply** de primera clase con latencias de microsegundos — si no hay suscriptor interesado, el mensaje se descarta por diseño. **JetStream** es la capa de persistencia opcional sobre el mismo protocolo: *streams* que capturan subjects con retención configurable (`limits`, `interest`, `workqueue`), replicación Raft (R1/R3/R5) y *consumers* duraderos (push/pull) con acks explícitos, redeliveries (`max_deliver`, `ack_wait`) y replay por secuencia/tiempo. Encaja como fabric de comunicación ligera de microservicios/edge (un binario, multi-tenancy por accounts, leaf nodes), no como plataforma de big data.

### 📖 Respuesta detallada
**Core NATS.** Un binario en Go de ~20 MB, sin dependencias, clustering con auto-descubrimiento y topologías jerárquicas (superclusters con gateways, **leaf nodes** para edge/IoT). El servidor no guarda nada: interest-based routing — entrega a quien está suscrito *ahora*. Primitivas:

- Subjects: tokens separados por punto; `*` un token, `>` el resto (`orders.>`). El namespace es dinámico: no se declara nada.
- **Queue groups:** suscriptores con el mismo nombre de grupo se reparten los mensajes (load balancing sin configurar colas) — el análogo a un consumer group, pero sin estado ni rebalance: entra un pod, empieza a recibir su parte; se va, deja de recibir.
- **Request-reply nativo:** `nc.request("svc.users.get", payload, timeout)` — el cliente publica con un `reply` subject efímero (inbox) y espera. Combinado con queue groups da RPC balanceado con failover sin service mesh ni descubrimiento adicional: es el argumento de venta de NATS como *fabric* de microservicios frente a HTTP/gRPC punto a punto.

Qué se pierde: todo, si nadie escucha. Deploy del consumidor = mensajes de ese intervalo desaparecidos. Core NATS es para donde eso es correcto (telemetría en vivo, RPC, señales de presencia, cache invalidation).

**JetStream.** Se habilita por servidor y se usa desde el mismo cliente/protocolo:

```go
js, _ := jetstream.New(nc)
js.CreateStream(ctx, jetstream.StreamConfig{
    Name: "ORDERS", Subjects: []string{"orders.>"},
    Retention: jetstream.LimitsPolicy,        // o InterestPolicy / WorkQueuePolicy
    MaxAge: 7 * 24 * time.Hour, Replicas: 3,  // Raft R3
})
cons, _ := js.CreateOrUpdateConsumer(ctx, "ORDERS", jetstream.ConsumerConfig{
    Durable: "billing", FilterSubject: "orders.*.created",
    AckPolicy: jetstream.AckExplicitPolicy,
    AckWait: 30 * time.Second, MaxDeliver: 5,
    DeliverPolicy: jetstream.DeliverByStartTimePolicy, // replay desde un punto
})
msgs, _ := cons.Fetch(50)                      // pull consumer: batch + backpressure natural
for msg := range msgs.Messages() { process(msg); msg.Ack() }
```

Piezas clave con nombre: retención `limits` (por edad/tamaño/nº, estilo Kafka), `interest` (se borra cuando todos los consumers lo ackearon), `workqueue` (se borra al primer ack — cola clásica); acks `AckExplicit`/`AckAll`/`AckNone` más `msg.Nak()` (redeliver ya, opcionalmente con delay), `msg.InProgress()` (extiende `ack_wait`, el heartbeat de tareas largas) y `msg.Term()` (no reintentar más — la vía de escape del poison message); deduplicación de publicación por header `Nats-Msg-Id` en ventana configurable; y sobre streams se construyen **KV** y **Object Store**, que la plataforma usa como primitivas (feature flags, config distribuida). Los pull consumers son la recomendación moderna: el batch de `Fetch` da backpressure natural y escala horizontal sin rebalances.

**Dónde encaja — el mapa que espera el entrevistador:**

- **vs Kafka:** JetStream cubre persistencia y replay para volúmenes moderados, pero no compite en pipelines de datos masivos: sin equivalente a Connect/Streams/Flink-integración madura, particionado menos desarrollado (subjects por convención + varios streams), y un log Raft por stream no está pensado para cientos de MB/s sostenidos por stream. Kafka tampoco compite con NATS en lo suyo: latencia de µs, request-reply, edge con leaf nodes, huella mínima.
- **vs RabbitMQ:** solapan en work queues y pub/sub persistente. NATS es radicalmente más simple de operar (un binario, config declarativa, multi-tenancy real por *accounts* con aislamiento de subjects) y su modelo de seguridad descentralizado (NKeys/JWT) es superior para plataformas multi-equipo. Rabbit sigue ganando en riqueza AMQP: routing headers, TTL/DLX maduros, prioridades, ecosistema empresarial y décadas de tooling.
- El pitch honesto: "NATS como sistema nervioso de microservicios e IoT/edge — mensajería + RPC + KV con una sola pieza operativa; Kafka como columna de datos; Rabbit cuando el dominio pide semánticas AMQP finas. El error es evaluar NATS solo como 'otro Kafka': su valor está en la capa de comunicación, no en la de datos".

Error común a citar: usar core NATS (at-most-once) para algo que necesitaba JetStream y descubrirlo en el primer deploy del consumidor; o lo inverso, envolver cada RPC en JetStream pagando persistencia Raft para peticiones efímeras.

---

## 12. Apache Pulsar: separación compute/storage, multi-tenancy y tipos de subscription. ¿Cuándo tendría sentido frente a Kafka?
**Categoría:** Pulsar · **Tipo:** Conceptual

### 📝 Respuesta resumen
Pulsar separa el plano de servicio del de almacenamiento: **brokers stateless** sirven topics pero no poseen datos; el almacenamiento vive en **Apache BookKeeper** (*bookies*) como ledgers segmentados replicados (quorum de escritura configurable: `ensemble/write-quorum/ack-quorum`). Consecuencias: un topic no está atado a un disco concreto, el failover de broker es instantáneo (sin mover datos), escalar storage no rebalancea particiones enteras y el **tiered storage** descarga segmentos antiguos a S3/GCS de forma nativa. Añade multi-tenancy de primera clase (`tenant/namespace/topic` con cuotas y aislamiento), geo-replicación integrada y cuatro tipos de subscription (`exclusive`, `failover`, `shared`, `key_shared`) que le permiten comportarse como log *y* como cola con el mismo topic.

### 📖 Respuesta detallada
**Arquitectura, y por qué importa.** En Kafka, broker = almacenamiento: cada partición vive en discos de brokers concretos; escalar o reequilibrar implica **mover datos** (horas en clusters grandes), y un broker nuevo no ayuda hasta recibir réplicas. En Pulsar, el broker es un proxy con caché que posee la *ownership* de topics; los datos son **ledgers** de BookKeeper repartidos por segmentos entre bookies (`ensemble size` E, `write quorum` Qw, `ack quorum` Qa — p. ej. E3/Qw3/Qa2: cada entrada a 3 bookies, confirmada con 2). Resultados operativos concretos:

- Cae un broker → otro toma ownership de sus topics en segundos, cero copia de datos.
- Añades un bookie → los *nuevos* segmentos ya lo usan; no hay rebalance masivo.
- Un topic puede crecer sin límite del disco de una máquina (los segmentos se reparten).
- **Tiered storage:** ledgers antiguos se offloadean a S3 con una policy de namespace y se leen transparentemente → "retención infinita" barata sin sacar los datos del sistema, algo que en Kafka llegó después (KIP-405, tiered storage) y con menos rodaje.

El precio: **tres sistemas** (brokers + bookies + metadata en ZooKeeper, u opciones más recientes), más piezas que dimensionar (journal + storage device por bookie, caches), y una comunidad/ecosistema menor. Este trade-off ES la respuesta a "¿por qué no todo el mundo usa Pulsar?".

**Multi-tenancy.** Jerarquía `tenant/namespace/topic` (p. ej. `persistent://payments/prod/invoice-events`). Las policies se aplican a nivel de namespace: retención, TTL, cuotas de backlog (`backlog quotas` con acción `producer_exception`/`consumer_backlog_eviction`), throttling de dispatch, aislamiento de bookies por tenant, auth por tenant. En Kafka, multi-tenancy = convenciones de nombres + quotas por cliente + a menudo *clusters separados*; en Pulsar un cluster compartido entre decenas de equipos es el diseño previsto — el argumento fuerte para plataformas internas grandes.

**Subscriptions — el rasgo más citable en entrevista.** Una subscription es un cursor con nombre sobre el topic, y su *tipo* define la semántica de consumo:

- **`exclusive`**: un solo consumidor; orden total. (Kafka: consumer group de 1.)
- **`failover`**: varios conectados, uno activo por vez (por topic/partición), failover automático; orden con HA.
- **`shared`**: los mensajes se reparten round-robin entre N consumidores **sin relación con particiones** — una cola de trabajo real sobre un log: escalas a 50 consumidores sobre un topic de 4 particiones, con acks individuales, `negativeAcknowledge()` con `negativeAckRedeliveryDelay`, `redeliverCount` y dead letter policy nativa (`deadLetterTopic`, `maxRedeliverCount`), y `deliverAfter/deliverAt` para mensajes retrasados sin plugins. Se pierde el orden, claro.
- **`key_shared`**: reparto por hash de clave → paralelismo masivo *conservando orden por clave* sin re-particionar el topic — lo que en Kafka exige elegir el número de particiones correcto para siempre.

Varias subscriptions de distinto tipo conviven sobre el mismo topic: el mismo stream sirve a un consumidor `failover` que proyecta en orden y a un pool `shared` que procesa en paralelo — en Kafka serían decisiones de particionado en tensión; en Rabbit, colas duplicando datos.

**¿Cuándo Pulsar frente a Kafka? La respuesta estructurada:**

1. **Plataforma multi-tenant grande** con cientos/miles de topics y equipos: tenants, cuotas y aislamiento nativos amortizan la complejidad extra.
2. **Colas y streaming en el mismo sistema:** si tienes mitad work queues (shared/DLQ/delays nativos) y mitad event streaming, Pulsar cubre ambos donde Kafka cojea en el lado cola (sin delays nativos, retries artesanales) y Rabbit en el lado log.
3. **Retención larguísima con coste controlado** (tiered storage maduro) y **geo-replicación** integrada por configuración de namespace (activo-activo entre regiones sin MirrorMaker).
4. **Elasticidad operativa:** clusters que crecen/encogen a menudo (autoscaling real) sufren el rebalanceo de Kafka; la separación compute/storage lo elimina.

En contra: para un caso de uso estándar con un equipo pequeño, Kafka (o un servicio gestionado) gana por ecosistema (Connect, Streams, schema registry, tooling, contratación) y por tener una pieza menos que operar. **Qué espera oír el entrevistador:** el mecanismo de segmentos/bookies bien explicado, `key_shared` como resolución de la tensión orden-vs-paralelismo, y la honestidad de que la complejidad operativa de tres subsistemas solo se paga a partir de cierta escala organizativa.

---

## 13. Producción: la memoria del nodo RabbitMQ sube hasta disparar la memory alarm y los publishers se quedan colgados. Las colas crecen. Diagnostica y resuelve.
**Categoría:** RabbitMQ / Operación · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
Servicio en producción sobre RabbitMQ (3 nodos, colas quorum). Alertas: memoria del nodo 1 al 92%, en el log `memory resource limit alarm set on node rabbit@node1`. Varios servicios productores reportan hilos bloqueados publicando; sus health checks empiezan a fallar. El management UI muestra colas con millones de mensajes en `Ready` y creciendo. Nadie ha desplegado el broker. ¿Cómo lo diagnosticas y resuelves, primero el incendio y luego la causa raíz?

### 📝 Respuesta resumen
La memory alarm es el airbag, no el problema: el broker bloquea a todos los publishers (`connection.blocked`) porque el backlog de las colas consume la memoria. La cadena causal casi siempre es: consumidores caídos o degradados → `Ready` crece sin límite (colas sin `max-length` ni TTL) → memoria supera `vm_memory_high_watermark` → publishers bloqueados → los servicios upstream, publicando de forma síncrona y sin timeout, agotan sus pools. Mitigación: restaurar/escalar consumidores (consumir está permitido durante la alarma), purgar lo purgable, y solo temporalmente dar aire (watermark/nodo). Corrección real: límites de cola (`max-length` + `overflow`), publishers resilientes al blocked, y alertas por profundidad de cola — mucho antes de la alarma.

### 📖 Respuesta detallada
**Fase 1 — Confirmar el diagnóstico (minutos):**

```bash
rabbitmq-diagnostics alarms                          # qué nodo, qué alarma
rabbitmq-diagnostics memory_breakdown -n rabbit@node1
rabbitmqctl list_queues name messages messages_unacknowledged consumers memory \
  --sort messages --reverse | head
rabbitmqctl list_connections name state | grep -c blocked
```

Lecturas esperadas y sus significados:
- `memory_breakdown`: si domina `queue_procs`/`quorum_ets`/`binary` → la memoria son mensajes encolados: problema de backlog. Si dominara `connection_procs`/`channel_procs` → fuga de conexiones/canales en algún cliente (otro incidente distinto: buscar el servicio que abre canal por mensaje).
- Colas top: ¿`consumers = 0`? Consumidor muerto (deploy roto, crash-loop, credenciales rotadas, o un **exclusive consumer**/single-active en zombie). ¿Consumers > 0 pero `unacked` clavado al prefetch y `Ready` creciendo? Consumidores vivos pero lentos o colgados (¿dependencia downstream caída? ¿deadlock tras redeliver?).
- Publishers `blocked`: confirma por qué los servicios upstream sufren — y revela el segundo bug: publican síncronamente sin timeout ni listener de `connection.blocked`, así que la caída del broker se propaga a sus pools de hilos y de ahí a sus health checks (fallo en cascada).

**Fase 2 — Apagar el incendio (el orden importa):**

1. **Recuperar consumo.** Consumir sigue permitido durante la alarma. Si los consumidores están caídos: arrancarlos/rollback del deploy. Si están lentos: escalarlos horizontalmente y, si su cuello es una dependencia, valorar un consumidor temporal "drenador" que mueva mensajes a almacenamiento frío (o un shovel a otro cluster con capacidad).
2. **Descartar lo descartable.** Si alguna cola gigante contiene datos tolerantes a pérdida (métricas, notificaciones caducadas): `rabbitmqctl purge_queue <q>` libera memoria de inmediato. Decisión de negocio explícita, no técnica — decirlo así en la entrevista suma.
3. **Aire temporal, con disciplina:** subir `vm_memory_high_watermark` (p. ej. `rabbitmqctl set_vm_memory_high_watermark 0.7`) solo si hay headroom físico real y solo para desbloquear publishers mientras el drenaje avanza — y verbalizar el riesgo: acercarse al OOM killer es peor que la alarma. Alternativa a menudo mejor: dejar los publishers bloqueados (los mensajes esperan arriba) mientras el consumo drena.
4. **No** reiniciar el nodo "para que se arregle": la recuperación de colas grandes al arrancar consume más memoria y tiempo, y con quorum queues fuerza elecciones innecesarias.

**Fase 3 — Causa raíz y prevención (lo que separa al senior):**

- **Colas acotadas siempre:** toda cola necesita una política de overflow *decidida*, no heredada del defecto (ilimitado). Por policy: `max-length`/`max-length-bytes` con `overflow: reject-publish` (backpressure al productor: el publish recibe `basic.nack` vía confirms — requiere publishers con confirms, pregunta 2) o `drop-head` (se pierde lo viejo: válido para datos con caducidad natural). La pregunta "¿qué debe pasar cuando esta cola se llena?" tiene que tener respuesta de negocio por cada cola.
- **El backlog masivo pide otro tipo de cola:** si el patrón legítimo incluye backlogs de millones (consumidor batch, picos estacionales), una **stream** (pregunta 8) los sostiene con memoria plana, o al menos quorum queues modernas (3.10+) que pagan el backlog en disco — y entonces el límite a vigilar es el disco (`disk_free_limit` bien dimensionado, no los 50 MB por defecto).
- **Publishers resilientes:** timeout en publish, `addBlockedListener` exportado como métrica y alerta, buffer local acotado con política de descarte/backoff, y circuit breaker hacia el broker para no arrastrar los pools de hilos del servicio.
- **Alertar por indicadores adelantados:** profundidad de cola y *edad del mensaje más viejo* (o ratio publish/ack) con umbrales muy por debajo del equivalente de memoria de la alarma; `consumers == 0` en colas críticas como alerta inmediata; consumer utilisation baja sostenida. La memory alarm en el dashboard debe ser la *última* línea, no la primera noticia.

**Errores comunes que el entrevistador quiere oír descartados:** subir el watermark como "solución" y archivar el incidente; añadir nodos (la memoria de una cola quorum no se reparte: sus réplicas cargan el mismo log); purgar sin preguntar a negocio; y culpar al broker cuando el sistema simplemente no tenía definida ninguna política de backpressure extremo a extremo.

---

## 14. Un patrón de retry con `requeue=true` y un mensaje envenenado tiene a 4 consumidores al 100% de CPU en bucle. ¿Qué pasó y cómo se arregla bien?
**Categoría:** RabbitMQ / Patrones de error · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
Un equipo implementó el manejo de errores de su consumidor RabbitMQ así: ante cualquier excepción, `basic.nack(deliveryTag, false, requeue=true)`. En producción entra un mensaje con un payload que rompe la deserialización. Desde hace 40 minutos, los 4 pods consumidores están al 100% de CPU, el throughput útil de la cola es ~0, la tasa de redeliveries es de miles/segundo y los logs son un festival de stack traces idénticos. Explica exactamente qué está pasando y diseña el arreglo correcto.

### 📝 Respuesta resumen
Es el bucle infinito de redelivery clásico: `requeue=true` devuelve el mensaje envenenado a la **cabeza** de la cola, el broker lo re-entrega inmediatamente (a ese consumidor u otro), vuelve a fallar, y así miles de veces por segundo — los 4 pods queman CPU deserializando y fallando el mismo mensaje, bloqueando además el trabajo útil. El arreglo correcto tiene capas: nunca `requeue=true` incondicional para errores *permanentes* (distinguir error transitorio de permanente); cortar los reintentos con `delivery-limit` (quorum, header `x-delivery-count`) y DLX; retry con backoff fuera de la cola caliente (TTL+DLX, pregunta 5); y una DLQ tratada como **cuarentena con proceso**: metadatos para diagnóstico, alertas, y decisión humana o automática de descarte/reparación/replay.

### 📖 Respuesta detallada
**Qué está pasando, mecánicamente.** `basic.nack(requeue=true)` reencola el mensaje sin penalización ni retraso: RabbitMQ no tiene backoff nativo en el requeue. Al volver cerca de la cabeza, es de lo próximo que se entrega. El fallo es determinista (deserialización), así que cada entrega falla en milisegundos → bucle a la velocidad del RTT broker↔consumidor multiplicado por 4 consumidores. Con prefetch > 1 el resto de mensajes avanza a trompicones entre redeliveries, pero el envenenado consume una fracción enorme de cada consumidor; con `prefetch=1` la cola queda efectivamente bloqueada. Síntomas confirmables: `redelivered=true` en casi todas las entregas, `message_stats.redeliver` disparado en el management, y en quorum queues el header **`x-delivery-count`** del mensaje subiendo sin techo... si nadie configuró el límite (en RabbitMQ 4.x el defecto pasó a 20 precisamente por este escenario; en 3.x era ilimitado).

**El arreglo, por capas (la estructura que espera el entrevistador):**

**1. Clasificar errores en el consumidor — la corrección de diseño principal.** Un `catch (Exception)` uniforme es el bug de fondo. La política mínima:

```java
try {
    Order order = deserialize(body);          // error permanente si falla
    handler.process(order);                    // puede fallar transitoriamente
    channel.basicAck(tag, false);
} catch (DeserializationException | ValidationException e) {
    // Permanente: reintentar es inútil. A la DLQ, YA.
    channel.basicNack(tag, false, /*requeue*/ false);   // → DLX
} catch (TransientException e) {              // timeout downstream, lock, 503...
    // Transitorio: reintentar con retraso, NUNCA requeue inmediato en caliente
    publishToRetryQueue(body, props, nextAttempt(props)); // TTL+DLX con backoff
    channel.basicAck(tag, false);             // este delivery queda cerrado
}
```

Regla verbalizable: *"`requeue=true` solo lo uso para el caso 'este consumidor no puede ahora' (shutdown en curso, recurso local no disponible), no para 'este mensaje falla'"*.

**2. Red de seguridad en el broker — porque el código volverá a tener bugs.** En quorum queues, policy con **`delivery-limit`** (p. ej. 5): al superarlo, el broker dead-letterea (o descarta si no hay DLX — así que el DLX es obligatorio) usando `x-delivery-count` como contador. Esto convierte el peor caso futuro de "bucle infinito" en "5 intentos y cuarentena", sin depender de la disciplina de los consumidores. En classic queues no existe: una razón más para quorum, o para llevar el contador leyendo `x-death.count` en el patrón TTL+DLX.

**3. Backoff fuera de la cola caliente.** Los reintentos transitorios van a wait queues con `x-message-ttl` escalonado (5s/1m/10m) y DLX de retorno (pregunta 5): el mensaje que espera no ocupa consumidores ni bloquea la cola de trabajo, y el backoff da tiempo a que lo transitorio se resuelva. Spring AMQP ofrece el atajo dentro del proceso: `RetryInterceptorBuilder` con `ExponentialBackOffPolicy` y `RepublishMessageRecoverer` hacia el exchange de DLQ — válido para reintentos cortos; los largos, siempre vía broker (un retry in-process de 10 minutos es un consumidor secuestrado y un redelivery seguro en cada deploy).

**4. La DLQ como cuarentena con proceso, no como vertedero.** Lo que distingue la respuesta senior:

- **Metadatos:** el broker ya adjunta `x-death` (cola, razón, contador, timestamps); el consumidor debe añadir los suyos al republicar a cuarentena: excepción y stack resumido, versión del servicio, `correlation-id`/trace id, timestamp del último intento. Sin esto, la DLQ es un montón de bytes sin contexto a las 3 AM.
- **Alerta por profundidad > 0** en colas de parking (con umbral y ventana razonables): una DLQ sin alerta es pérdida de datos con latencia de descubrimiento de semanas.
- **Proceso de triaje:** herramienta/runbook para inspeccionar (management UI, `rabbitmqadmin get`), decidir por lote (descartar, corregir y **re-publicar a la cola original** — no shovel ciego de vuelta: si la causa no está arreglada, es el bucle otra vez con extra de latencia), y medir: tasa de llegada a DLQ como métrica de calidad del pipeline.
- **Anti-corrupción en el borde:** el caso concreto era deserialización → validación de esquema en el productor (schema en el contrato, pregunta 1) y tolerancia del consumidor (campos desconocidos ignorados) reducen la clase entera de venenos.

**Errores comunes a descartar explícitamente:** "arreglarlo" con `try/catch` + `ack` silencioso (pérdida de datos invisible: peor que el bucle, que al menos hace ruido); poner un `Thread.sleep(5000)` antes del nack (bloquea el consumidor y con prefetch>1 retiene otros mensajes; es backoff de pega); confiar en `redelivered=true` como contador (es un booleano: no distingue el intento 2 del 2.000); y shovelar la DLQ de vuelta a producción sin arreglar la causa. Cierre redondo: "el objetivo del diseño de errores en mensajería no es que no haya mensajes envenenados — habrá — sino que un veneno cueste N reintentos acotados y un ticket, no una noche de guardia".
