# Módulo 3 · RabbitMQ en producción (y cuándo elegir otro broker)

> **Curso 10 · Mensajería y streaming** · 120 min · Requiere [Módulo 1](01-colas-y-mensajeria.md)

## Por qué esto importa en la entrevista

RabbitMQ es el broker que más aparece en sistemas "de empresa" reales, y la pregunta trampa favorita del entrevistador tiene dos caras: **"¿por qué se te perdieron mensajes?"** y **"¿por qué elegiste Rabbit y no Kafka?"**. La primera se responde con la cadena de fiabilidad tramo a tramo (confirms → durabilidad → acks): basta que falte un eslabón para perder mensajes *sin que nada dé error*. La segunda se responde con criterios, no con moda: replay, orden, routing, throughput y coste operativo. Un senior sabe además qué se rompe primero en producción — memory alarms, poison messages, prefetch mal puesto — porque son los tres incidentes que todo equipo con Rabbit acaba viviendo.

## El modelo AMQP: exchanges, bindings y colas

En Kafka el productor escribe *en el log* y el consumidor decide qué leer. En AMQP 0-9-1 es al revés: el productor **no conoce las colas**. Publica en un *exchange* con una *routing key*, y son los *bindings* (declarados por quien consume, normalmente) los que deciden a qué colas se copia el mensaje. El enrutamiento es responsabilidad del broker, y eso es a la vez su superpoder (routing riquísimo sin tocar al productor) y su límite (el broker hace más trabajo por mensaje).

```
                        bindings
 producer ──► exchange ══════════► queue A ──► consumer(s)
              (direct/     ╚═════► queue B ──► consumer(s)
               topic/
               fanout/     el mensaje se COPIA a cada cola
               headers)    cuyo binding matchea la routing key
```

| Exchange | Matching | Uso típico |
|---|---|---|
| `direct` | igualdad exacta de routing key | trabajo por tipo de tarea, DLX |
| `topic` | patrones `a.b.*` / `a.#` (`*`=1 palabra, `#`=0..n) | eventos jerárquicos, suscripción selectiva |
| `fanout` | ignora la routing key, copia a todas las colas | broadcast: invalidar cachés, notificar a todos |
| `headers` | matching por cabeceras (`x-match: all/any`) | raro; cuando la clave no cabe en un string |

Dos piezas más que salen en entrevista: el **default exchange** (`""`, un direct implícito donde cada cola está ligada por su propio nombre — por eso "publicar a una cola" existe como atajo) y el **alternate exchange** (`alternate-exchange` en el exchange principal: adónde van los mensajes que *no* matchean ningún binding, tu red de seguridad contra typos de routing key).

### Tres ejemplos de routing bien modelado

**1. Notificaciones por país y canal** — topic exchange con clave `notif.<país>.<canal>`:

```
 exchange: notifications (topic)
   routing keys publicadas: notif.pe.email, notif.pe.sms, notif.mx.push ...

   queue email-workers      binding: notif.*.email     (todos los países, solo email)
   queue sms-peru           binding: notif.pe.sms      (solo SMS de Perú, regulación local)
   queue audit-all          binding: notif.#           (todo, para auditoría)
```

El productor publica una sola vez; añadir un nuevo consumidor por país o canal es *declarar un binding*, sin deploy del productor. Ese desacoplamiento es el argumento de venta del topic exchange.

**2. Prioridades sin priority queues** — dos colas y un direct exchange:

```
 exchange: jobs (direct)
   queue jobs-high   binding: high    ── 10 consumers
   queue jobs-low    binding: low     ──  2 consumers
```

Mejor que una priority queue (`x-max-priority`) en la mayoría de casos: las priority queues cuestan CPU/memoria por cada nivel, no combinan bien con colas largas (la prioridad solo importa si hay backlog *en memoria*) y ocultan la señal operativa. Dos colas te dan métricas separadas, escalado independiente y aislamiento: un backlog de `low` jamás retrasa a `high`.

**3. Fan-out selectivo** — un evento, N interesados, cada uno con su cola:

```
 exchange: orders (topic)
   order.created / order.paid / order.cancelled

   queue billing        binding: order.paid
   queue warehouse      bindings: order.paid, order.cancelled
   queue analytics      binding: order.#
```

Cada consumidor tiene **su propia cola** (cursor y backlog independientes, como los consumer groups de Kafka pero materializados como colas). El error clásico es hacer que dos servicios distintos consuman de *la misma* cola esperando que ambos reciban todo: en AMQP una cola reparte, no duplica; quien duplica es el exchange.

**💬 Cómo lo dices:** *"En Rabbit modelo el routing en el exchange y dejo las colas como unidades de consumo: una cola por servicio consumidor, bindings como contrato de suscripción. Así añadir un consumidor nuevo no toca al productor, y un backlog de un consumidor no afecta al resto."*

## Fiabilidad tramo a tramo: dónde se pierden los mensajes

Un mensaje cruza tres tramos, y cada uno tiene su mecanismo. La fiabilidad es la **cadena completa**: el eslabón que omitas define tu ventana de pérdida.

```
 producer ──(1)──► exchange ──(2)──► queue ──(3)──► consumer
    │                  │                │               │
 publisher         mandatory        durable +        manual ack
 confirms          (unroutable)     persistent       (tras procesar)
```

**Tramo 1 — Publisher confirms.** Sin confirms, `basic.publish` es fire-and-forget: si la conexión TCP muere o el broker está en alarma, el mensaje se evapora y tu código no se entera. Con `confirm.select`, el broker devuelve `ack` cuando el mensaje está seguro (encolado en todas las colas destino y, si es persistente, escrito a disco / replicado en la quorum). Publica en lotes y espera confirms asíncronos; un confirm síncrono por mensaje hunde el throughput ~100×. Añade **`mandatory=true`**: si el mensaje no matchea ningún binding, el broker lo devuelve (`basic.return`) en vez de descartarlo en silencio — el confirm solo garantiza "lo recibí", no "lo enruté a alguna parte".

**Tramo 2 — Durabilidad.** Dos flags distintos que la gente confunde: la **cola** debe ser `durable` (sobrevive su *definición* al reinicio) y el **mensaje** debe ser `persistent` (`delivery_mode=2`; se escribe a disco). Cola durable + mensaje transient = cola vacía tras el reinicio. Con quorum queues esto desaparece como fuente de error: son siempre durables y todo mensaje es persistente.

**Tramo 3 — Consumer acks.** Con `autoAck=true` el broker considera entregado el mensaje en cuanto lo escribe al socket: si tu proceso muere con 200 mensajes en el buffer, se perdieron. Ack manual **después** de procesar te da at-least-once. El vocabulario completo:

- `basic.ack(multiple=false)` — procesado, elimínalo.
- `basic.nack(requeue=true)` — fallé, reencólalo (vuelve *a la cabeza*, no al final).
- `basic.nack(requeue=false)` / `basic.reject` — fallé y no quiero verlo más → va a la DLX si la cola tiene una, o se descarta.
- Si la **conexión** muere con mensajes sin ack, el broker los reencola solo (por eso necesitas idempotencia: redelivery es la norma, no la excepción).

| Si te falta… | Qué pierdes | Cómo se manifiesta |
|---|---|---|
| Publisher confirms | mensajes al caer conexión/broker durante publish | pérdidas silenciosas "aleatorias", imposibles de reproducir |
| `mandatory` / alternate exchange | mensajes con routing key que no matchea nada | un typo en la key = agujero negro sin error |
| Cola durable | la cola entera (definición y contenido) al reiniciar | tras un restart, la cola no existe |
| Mensaje persistent | el contenido de colas clásicas al reiniciar | cola durable pero vacía tras el restart |
| Ack manual | mensajes en vuelo al morir el consumidor | pérdidas proporcionales al prefetch en cada crash/deploy |
| Idempotencia del consumidor | nada — pero **duplicas** efectos | cobros dobles tras cada redelivery |

> **⚠️ Trampa:** confirms + persistencia + acks te dan **at-least-once**, nunca exactly-once. El cierre de la cadena es siempre un consumidor idempotente (clave de deduplicación o efecto naturalmente idempotente). Si en la entrevista dices "activé confirms y ya no pierdo ni duplico", acabas de perder puntos.

## Quorum queues: el default moderno

Las **classic mirrored queues** (HA por políticas `ha-mode`) están **eliminadas en RabbitMQ 4.x**, y con razón: su protocolo de replicación ad-hoc podía perder mensajes al promocionar un mirror desincronizado, y las resincronizaciones bloqueaban la cola entera. Las **quorum queues** las reemplazan con Raft.

**Raft en 10 líneas:** cada cola es un grupo de réplicas (3 o 5) con un **líder** elegido por mayoría. Toda escritura va al líder, que la añade a su log y espera confirmación de una **mayoría** (2 de 3) antes de confirmar al publisher. Si el líder muere, los seguidores convocan elección; solo puede ganar quien tenga el log más avanzado, así que **nada confirmado se pierde jamás**. Con 3 réplicas toleras la caída de 1 nodo; con 5, de 2. Con solo minoría viva, la cola deja de aceptar escrituras — prefiere no estar disponible a mentir (CP, no AP). Ese "espera a la mayoría" es también por qué una quorum queue confirma un poco más lento que una clásica sin réplica: estás pagando la durabilidad real.

Declaración con argumentos:

```bash
# rabbitmqadmin (o política equivalente; el tipo de cola NO se puede cambiar después)
rabbitmqadmin declare queue name=orders durable=true \
  arguments='{
    "x-queue-type": "quorum",
    "x-quorum-initial-group-size": 3,
    "x-delivery-limit": 5,
    "x-dead-letter-exchange": "dlx.orders",
    "x-max-length": 1000000,
    "x-overflow": "reject-publish"
  }'
```

Límites y gotchas que un senior menciona sin que se lo pregunten:

- **Memoria:** las quorum guardan en memoria metadatos por mensaje pendiente además del log Raft en disco; millones de mensajes ready = presión de memoria real. Una cola no es una base de datos: si tu backlog "normal" son millones, quieres Streams o Kafka.
- **Poison messages:** el punto donde las quorum brillan. Llevan un contador de reenvíos por mensaje (cabecera **`x-delivery-count`**) y con **`x-delivery-limit`** el broker corta el bucle: al superar el límite, el mensaje va a la DLX (o se descarta si no hay). En clásicas ese contador no existe — solo el flag booleano `redelivered` — y un `nack(requeue=true)` incondicional es un bucle infinito a velocidad de CPU.
- **No soportan** priorities per-message al estilo clásico ni TTL por mensaje con la misma semántica; diseña con colas separadas.

**Defaults recomendados** (lo que responderías a "¿cómo declaro las colas?"): `x-queue-type=quorum` para todo lo que importe, grupo de 3, `x-delivery-limit` entre 3 y 10 **siempre con DLX configurada** (desde 4.0 el delivery limit tiene default 20; sin DLX eso significa *descartar* al mensaje envenenado), `x-max-length` + `x-overflow=reject-publish` como airbag. Clásicas sin réplica solo para datos triviales o efímeros; `x-queue-type=stream` para replay y fan-out masivo.

## Prefetch y fairness: `basic.qos`

El **prefetch** (`basic.qos(prefetch_count=N)`) limita cuántos mensajes sin ack puede tener cada consumidor. Es el parámetro de rendimiento más importante del lado consumidor y casi nadie lo toca conscientemente.

```
 prefetch=1                            prefetch=100
 broker ─►[1]─► consumer               broker ─►[100 en buffer]─► consumer
 (espera el ack para enviar otro)      (el consumidor siempre tiene trabajo)

 + reparto justo, redelivery mínimo    + sin round-trips: throughput alto
 – un RTT de red por mensaje           – acapara mensajes; crash = 100 redeliveries
```

- **Sin límite (0 o sin qos):** el broker vuelca la cola entera al consumidor más rápido en conectarse. Un consumidor acapara miles de mensajes en su buffer TCP mientras los demás miran; si muere, todo eso se reencola de golpe.
- **Dimensionado:** regla práctica `prefetch ≈ throughput_por_consumidor × RTT` con margen ×2 — lo justo para que el consumidor nunca espere red, no más. Tareas rápidas (ms) y broker remoto: 100–300. Tareas de segundos (vídeo, PDFs, ML): **prefetch=1**, porque lo que importa es el reparto justo, no ahorrar RTTs.
- **Síntomas de prefetch mal puesto:** (a) muy bajo con tareas rápidas → consumidores ociosos, throughput plano al escalar, CPU del broker baja: estás limitado por RTT; (b) muy alto con tareas lentas → un consumidor con 100 encoladas y los otros nueve ociosos (`rabbitmqctl list_channels ... messages_unacknowledged` lo delata), latencias p99 absurdas para mensajes "secuestrados" en un buffer, y avalanchas de redelivery en cada deploy.

> **⚠️ Trampa:** el prefetch es por **canal/consumidor**, y `unacked` crece con él. Si ves `messages_unacknowledged = prefetch × consumidores` de forma sostenida, tus consumidores no dan abasto — el prefetch alto solo estaba *escondiendo* la cola dentro de los buffers de los clientes.

## Defensas del broker: alarms, flow control y límites de cola

Rabbit se defiende de quedarse sin recursos frenando **a los productores**, nunca tirando mensajes por su cuenta. Conocer la escalera de defensas es lo que separa "el broker se colgó" de un diagnóstico.

**Memory alarm** (`vm_memory_high_watermark`, default 0.6 de la RAM en 4.x) y **disk alarm** (`disk_free_limit`, default absurdamente bajo — súbelo a ≥ 2–5 GB): cuando saltan, el broker **bloquea todas las conexiones que publican** en el cluster entero. Los consumidores siguen; la idea es que drenen el backlog hasta salir de la alarma.

**Qué ve el productor:** nada explícito. No hay error: el `basic.publish` simplemente **se bloquea** (el broker deja de leer del socket, TCP backpressure). Con confirms, ves confirms que no llegan; sin confirms, hilos colgados en `publish` y timeouts río arriba. Es el incidente clásico "la API se cayó" cuya causa raíz está en el broker.

**Cómo se diagnostica:**

```bash
rabbitmqctl status | grep -A4 alarms          # alarmas activas (memoria/disco, por nodo)
rabbitmq-diagnostics check_alarms             # exit code != 0 si hay alarma (para monitors)
rabbitmqctl list_connections name state       # state: blocked / blocking = alarma activa
rabbitmqctl list_queues name messages messages_unacknowledged memory --sort-column memory
```

En la Management UI las conexiones bloqueadas salen en rojo ("blocked"); los clientes decentes exponen el callback `connection.blocked` — engánchalo a una métrica.

**Flow control** (estado `flow` en conexiones/canales): freno *fino* y transitorio, por conexión, cuando un publisher va más rápido de lo que la cola puede escribir. Ver `flow` a ratos es normal; verlo constantemente significa que el cuello es esa cola (disco, réplicas) y no la red.

**Límites por cola** — la defensa que tú diseñas, mejor que la alarma global:

- `x-max-length` / `x-max-length-bytes`: tope de backlog por cola.
- `x-overflow`: **`drop-head`** (default clásico: tira el mensaje más viejo — razonable para telemetría donde lo reciente vale más), **`reject-publish`** (rechaza al productor con `basic.nack` si usa confirms — lo correcto para colas de trabajo: backpressure explícita al que produce, no pérdida silenciosa del que espera).
- Preferible por **política** para poder cambiarlo sin recrear la cola:

```bash
rabbitmqctl set_policy lim-orders "^orders" \
  '{"max-length": 1000000, "overflow": "reject-publish"}' \
  --apply-to quorum_queues
```

**💬 Cómo lo dices:** *"Prefiero mil veces que un productor reciba un nack por `reject-publish` en una cola concreta a que el broker entero entre en memory alarm y bloquee a todos los productores del cluster. La alarma global es el último airbag, no el mecanismo de backpressure de diseño."*

## Retry bien hecho: TTL + DLX con backoff escalonado

El instinto (`nack(requeue=true)` en el catch) es un desastre doble: el mensaje vuelve a la **cabeza** de la cola (reintento inmediato, sin backoff, en bucle) y bloquea a los de detrás. El patrón correcto usa dos piezas: **TTL** (el mensaje expira) y **DLX** (dead-letter exchange: adónde va un mensaje al expirar, ser rechazado o desbordar la cola).

**Backoff escalonado con colas de espera:** una *wait queue* por escalón de delay, sin consumidores, cuyo único trabajo es dejar expirar mensajes y devolverlos.

```
        work.q ──error──► nack(requeue=false) ──DLX──► retry router
          ▲                                                │ (según nº intento)
          │                                     ┌──────────┼──────────┐
          │ (TTL expira → DLX de vuelta)     wait.5s    wait.1m    wait.10m
          └─────────────────────────────────────┴──────────┴──────────┘
                                       tras N intentos ──► parking-lot.q (humano)
```

```bash
# Cola de trabajo: sus muertos van al router de retries
rabbitmqadmin declare queue name=work.q durable=true \
  arguments='{"x-queue-type":"quorum","x-delivery-limit":4,
              "x-dead-letter-exchange":"retry.router"}'

# Escalón de espera: TTL de cola + al expirar, de vuelta al exchange de trabajo
rabbitmqadmin declare queue name=wait.1m durable=true \
  arguments='{"x-message-ttl":60000,
              "x-dead-letter-exchange":"work.exchange",
              "x-dead-letter-routing-key":"work"}'
```

El consumidor (o un pequeño router) decide el escalón leyendo la cabecera `x-death` (o `x-delivery-count`), que lleva la cuenta de por cuántas DLX ha pasado el mensaje. Tras agotar intentos: **parking lot** (cola sin TTL que un humano revisa con alerta sobre su profundidad), nunca descartar.

> **⚠️ Trampa — head-of-line en TTL per-message:** Rabbit solo expira **el mensaje en cabeza** de la cola. Con TTL *de cola* (`x-message-ttl`) todos llevan el mismo TTL y el orden de expiración coincide con el de llegada: perfecto. Con TTL *por mensaje* (`expiration` en las propiedades), un mensaje con TTL de 10 min en cabeza **tapa** a uno de 5 s que llegó detrás: el segundo no se entregará ni expirará hasta que salga el primero. Por eso el patrón usa una cola por escalón de delay con TTL fijo, y no una sola cola con TTLs variados.

**Delayed message exchange plugin** (`rabbitmq_delayed_message_exchange`, `x-delay` por mensaje): delays arbitrarios sin una cola por escalón. Contras honestos: plugin comunitario (no core), los mensajes retenidos viven en una tabla Mnesia/Khepri **de un solo nodo** (no replicada: ese nodo cae, los delayed en tránsito peligran), no hay visibilidad de cuántos hay esperando, y con cientos de miles de delayed degrada. Para retries con 3–4 escalones fijos, TTL+DLX es más aburrido y más robusto; el plugin brilla para scheduling fino de negocio ("recordatorio en 37 minutos") de volumen moderado.

## Topologías: cluster, federation, shovel y Streams

**Clustering:** varios nodos comparten metadatos (exchanges, bindings, definiciones) vía Khepri/Raft, y las quorum queues reparten sus réplicas entre nodos. Requisito implícito: **red de datacenter** — latencia baja y estable. **Nunca cruces WAN con un cluster**: el consenso de metadatos y el Raft de cada cola meten la latencia inter-DC en el camino de *cada confirm*, y las particiones de red — rutina en WAN — obligan a elegir entre parar minorías (`pause_minority`) o inconsistencia. Un cluster estirado entre regiones es un incidente programado.

Para unir DCs, dos herramientas *sobre* AMQP, tolerantes a cortes y latencia:

| | **Federation** | **Shovel** |
|---|---|---|
| Modelo | el downstream se *suscribe* a un exchange/cola upstream (pull) | bomba configurada: mueve de un origen a un destino (push) |
| Qué cruza | solo lo que los bindings downstream piden | todo lo que llegue al origen |
| Uso típico | multi-región "cada DC su broker, comparte ciertos eventos" | migraciones, drenar un broker a otro, integrar un tercero |
| Garantía | at-least-once, asíncrono (el publisher local confirma sin esperar al remoto) | at-least-once, asíncrono |

La frase que resume la decisión: *cluster para HA dentro de un DC; federation/shovel para geografía*. Y en ambos casos la entrega remota es asíncrona: RPO > 0 entre sitios, dilo antes de que te lo pregunten.

**RabbitMQ Streams** (`x-queue-type=stream`, y su protocolo binario propio): un log append-only replicado *dentro* de Rabbit — semántica Kafka sin segundo sistema. Los consumidores no destruyen al leer: cada uno mantiene su **offset** y puede releer desde donde quiera; fan-out a decenas de consumidores sin copiar el mensaje por cola; millones de mensajes en disco sin presión de memoria; retención por tamaño/edad como Kafka. Límites: sin DLX ni TTL por mensaje ni selective routing avanzado (es un log, no una cola), y el ecosistema (conectores, stream processing) es una fracción del de Kafka. Úsalo cuando ya tienes Rabbit y necesitas replay o fan-out masivo en *algunos* flujos; si toda tu plataforma es event streaming, Kafka sigue ganando por ecosistema.

## Decidir: Kafka vs RabbitMQ vs SQS/SNS vs NATS

La pregunta de entrevista no es "¿cuál es mejor?" sino "¿con qué criterios eliges?". Tabla honesta:

| Criterio | RabbitMQ | Kafka | SQS/SNS | NATS (JetStream) |
|---|---|---|---|---|
| Replay / historial | solo con Streams | ★ nativo, es un log | no (14 días máx y destructivo) | sí, con JetStream |
| Orden | por cola con 1 consumidor; se rompe con retries/competing consumers | ★ por partición, sólido | FIFO queues (300 msg/s/grupo sin batching) | por stream |
| Routing selectivo | ★ topic/headers, riquísimo | ninguno (eliges topic y filtras tú) | filtros de suscripción SNS (básicos) | subjects jerárquicos con comodines, muy bueno |
| Throughput por nodo | decenas de miles msg/s | ★ cientos de miles/millones (batch + secuencial) | "infinito" gestionado (pagas por request) | muy alto (core), alto (JetStream) |
| Latencia | ★ sub-ms a ms | ms a decenas de ms (batching) | decenas de ms + polling | ★ sub-ms |
| Colas de trabajo (ack por mensaje, DLX, retries) | ★ es su terreno | incómodo (un mensaje lento bloquea la partición) | ★ muy bueno (visibility timeout, DLQ nativa) | bueno |
| Operación | media: alarms, quorum, upgrades — pero un equipo pequeño puede | alta (o pagas Confluent/MSK) | ★ cero: serverless | ★ un binario Go, ligerísimo |
| Coste | infra propia, modesto | infra/managed, alto a escala pequeña | por request: barato al empezar, caro a volumen alto y constante | infra propia, mínimo |
| Lock-in | ninguno (AMQP estándar) | bajo (protocolo abierto de facto) | total (AWS) | bajo |

Reglas rápidas: **¿necesitas releer el pasado o alimentar N sistemas con los mismos eventos?** → Kafka (o Streams). **¿Colas de trabajo con routing fino, retries y prioridades?** → RabbitMQ. **¿Estás 100% en AWS y no quieres operar nada?** → SQS/SNS hasta que sus límites te duelan. **¿Latencia mínima, edge/IoT, request-reply, footprint diminuto?** → NATS.

### Cuatro escenarios resueltos

1. **Procesador de pagos: cobros a pasarelas externas, con reintentos con backoff, sin perder ni un cobro y con revisión manual de fallos.** → **RabbitMQ** con quorum queues (confirms + Raft = no se pierde nada confirmado), `x-delivery-limit` + TTL/DLX para el backoff, parking lot para el humano. Kafka encaja mal: un cobro que tarda o falla bloquea su partición y el retry por mensaje es artesanía. SQS sería el segundo mejor si ya estás en AWS.
2. **Clickstream de 200k eventos/s que alimenta al equipo de ML, al de fraude y a un data lake, con capacidad de reprocesar la última semana.** → **Kafka**, sin discusión: throughput por batching, fan-out barato (N consumer groups, un solo dato), replay nativo por retención. Rabbit con colas moriría copiando cada evento a 3 colas y comiéndose la memoria del backlog.
3. **Startup en AWS: thumbnails de imágenes tras cada upload, cientos por minuto, equipo de 3 personas.** → **SQS** (+S3 event notifications): cero operación, DLQ y visibility timeout resuelven retries, el coste a ese volumen es ruido. Montar un cluster Rabbit o Kafka aquí es el error senior-negativo por excelencia: complejidad operativa sin requisito que la justifique.
4. **Telemetría y comandos para 50k dispositivos IoT con hardware modesto, request-reply de control y latencia baja; perder una lectura aislada es aceptable.** → **NATS**: subjects jerárquicos (`sensor.<region>.<device>.temp`), footprint mínimo en ambos extremos, request-reply nativo, y JetStream solo para los subjects que sí necesitan persistencia (comandos). MQTT+Rabbit sería la alternativa si el requisito fuera el protocolo MQTT en sí.

**💬 Cómo lo dices:** *"No elijo broker por benchmark sino por semántica: si el dato es un evento que varios leerán y quizá releerán, quiero un log (Kafka/Streams); si es un trabajo que exactamente uno debe ejecutar con retries y prioridades, quiero una cola (Rabbit/SQS). El resto — throughput, coste, quién lo opera a las 3 a.m. — desempata."*

## Errores comunes que delatan a un no-senior

- Publicar sin confirms ni `mandatory` y jurar que "Rabbit no pierde mensajes".
- `autoAck=true` en producción, o ack *antes* de procesar "para que vaya más rápido".
- `nack(requeue=true)` incondicional en el catch: bucle infinito de poison message que se come una CPU y bloquea la cola.
- Cola durable con mensajes transient (o al revés) y descubrirlo en el primer reinicio.
- No configurar prefetch, y extrañarse de que un consumidor acapare todo mientras nueve miran.
- Cluster de RabbitMQ estirado entre regiones "para tener DR".
- Seguir declarando classic mirrored queues (eliminadas en 4.x) o quorum queues con `x-delivery-limit` sin DLX (= descartar poison messages en silencio).
- Elegir Kafka "porque escala" para una cola de trabajos con retries por mensaje, o Rabbit para replay de eventos, y luego pelearse contra la semántica del broker elegido.
- No saber qué es una memory alarm: "los publishers se quedaron colgados y reiniciamos todo".

## 🧪 Laboratorio — rompe RabbitMQ cuatro veces en local

Levanta un broker con Management UI y capacidad de observarlo todo:

```bash
docker run -d --name rmq -p 5672:5672 -p 15672:15672 \
  --memory=512m rabbitmq:4-management
# UI: http://localhost:15672 (guest/guest)
```

1. **Memory alarm.** Baja el watermark para provocarla rápido: `docker exec rmq rabbitmqctl set_vm_memory_high_watermark 0.05`. Publica sin parar (script con `pika`/`amqplib`, mensajes de ~10 KB, sin consumidores) hasta que el publisher **se congele sin error**. Comprueba `rabbitmqctl status` (alarma activa) y `list_connections name state` (`blocked`). Arranca un consumidor, drena, y observa cómo el publisher revive solo. Conclusión escrita: qué vería tu servicio de producción y qué métrica lo habría avisado.
2. **Poison message con requeue infinito.** Cola clásica, consumidor que hace `nack(requeue=true)` si el JSON es inválido. Publica 1 mensaje corrupto entre 100 buenos: mide la tasa de redeliveries en la UI (decenas de miles/min) y verifica que los mensajes detrás avanzan a trompicones. Ahora recrea la cola como quorum con `x-delivery-limit=5` y una DLX hacia `parking-lot`: el mensaje corrupto aterriza en el parking tras 5 intentos y el flujo se limpia. Inspecciona `x-delivery-count` en las cabeceras del mensaje aparcado.
3. **Retry con TTL+DLX.** Monta el patrón completo del módulo: `work.q` (quorum, DLX→`retry.router`), `wait.5s` y `wait.30s` (con `x-message-ttl` y dead-letter de vuelta a `work.exchange`), `parking-lot`. Consumidor que falla siempre. Cronometra con timestamps en las cabeceras que un mensaje sigue la secuencia 5 s → 30 s → parking. Extra: publica en la misma wait queue un mensaje con `expiration` per-message corto detrás de uno largo y comprueba el head-of-line blocking en vivo.
4. **Prefetch 1 vs 100.** Cola con 10 000 mensajes; consumidor que simula 5 ms de trabajo por mensaje, 4 instancias. Corre con `basic.qos(1)` y con `basic.qos(100)`; mide throughput total (msgs/s hasta drenar, la UI te da la tasa de deliver/ack) y el reparto entre consumidores (`rabbitmqctl list_channels ... messages_unacknowledged`). Repite con trabajo de 2 s por mensaje y 1 mensaje lento de 30 s: observa cómo con prefetch=100 un consumidor secuestra mensajes que otros podrían procesar.

**Entregable:** tabla con throughput y reparto por configuración de prefetch, y las capturas de la alarma y del parking lot. Es material directo para la pregunta "cuéntame un incidente con un broker".

## ✅ Autoevaluación

1. Un publisher recibe el confirm del broker, pero el mensaje nunca llegó a ninguna cola y nadie vio un error. ¿Qué dos configuraciones faltaban y cuál habría detectado el problema?
2. Enumera los tres tramos de la cadena de fiabilidad y qué pierdes exactamente si omites el mecanismo de cada uno.
3. ¿Por qué las quorum queues reemplazaron a las mirrored? Explica en tres frases qué garantiza Raft al confirmar con mayoría y qué pasa cuando solo sobrevive una minoría.
4. Tus 10 consumidores procesan tareas de 3–4 segundos y ves que uno tiene 200 mensajes unacked mientras el resto está ocioso. ¿Qué está mal, qué valor pondrías y por qué?
5. ¿Por qué el patrón de retry usa una cola de espera por cada escalón de delay en lugar de una sola cola con `expiration` por mensaje?
6. Te piden "eventos de pedidos que consumen 4 equipos, con posibilidad de reprocesar un mes" y "cola de envío de emails con reintentos y prioridad". ¿Qué broker (o tipo de cola) para cada uno y con qué dos criterios lo justificas?

## 🎯 Preguntas del banco que ya puedes responder

- [`mensajeria-eventos/03-rabbitmq-y-otros-brokers.md`](../../mensajeria-eventos/03-rabbitmq-y-otros-brokers.md) — modelo AMQP, quorum queues, confirms/acks, comparativa de brokers
- [`mensajeria-eventos/04-casos-y-problemas.md`](../../mensajeria-eventos/04-casos-y-problemas.md) — memory alarms, poison messages, retries con TTL+DLX, prefetch y backlogs

## Para profundizar

- Docs oficiales de RabbitMQ: *Reliability Guide*, *Quorum Queues*, *Consumer Prefetch* y *Memory Alarms* — inusualmente bien escritas; la de quorum queues es la mejor introducción práctica a Raft aplicada.
- "RabbitMQ in Depth" (Gavin Roy) — el modelo AMQP a fondo; los capítulos de exchanges y de garantías de entrega envejecen bien.
- Blog de CloudAMQP: series *RabbitMQ Best Practices* y *Part 1-4: RabbitMQ for beginners* — destiladas de operar miles de brokers ajenos.
- Jack Vanlightly: comparativas Kafka vs RabbitMQ y análisis de la replicación de quorum queues — el nivel de detalle que un entrevistador de plataforma agradece.

---

**Anterior:** [Módulo 2](02-kafka-por-dentro.md) · **Siguiente:** [Módulo 4 · Patrones event-driven](04-patrones-event-driven.md)
