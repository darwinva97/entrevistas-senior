# Módulo 1 · Colas y mensajería: el modelo que lo explica todo

> **Curso 10 · Mensajería y streaming** · 120 min · Requiere [curso 00 módulo 3](../00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

## Por qué esto importa en la entrevista

Prácticamente todo system design senior acaba con una cola o un log en el diagrama. Y ahí es donde el entrevistador separa a quien "pone un Kafka" de quien entiende lo que acaba de comprar:

- *"¿Por qué una cola aquí y no una llamada HTTP?"*
- *"¿Qué pasa si el consumidor se cae a mitad de procesar un mensaje?"*
- *"¿RabbitMQ o Kafka? ¿Por qué?"*
- *"El lag de la cola crece sin parar. ¿Qué haces?"*

Las cuatro se responden con el mismo modelo mental: **un sistema de mensajería es una transferencia de responsabilidad con un buffer en medio**. Si tienes claro qué se transfiere, quién es responsable en cada tramo y cómo se dimensiona el buffer, puedes razonar cualquier variante (SQS, Rabbit, Kafka, Pub/Sub, NATS) sin haberla usado. Este módulo construye ese modelo; los siguientes lo especializan en Kafka.

## Sincrónico vs asíncrono: qué compras y qué pagas

Una llamada HTTP dice: *"hazlo ahora y dime cómo fue"*. Un mensaje dice: *"esto tiene que ocurrir; ya no es mi problema cuándo"*. Esa diferencia de contrato lo cambia todo.

### El checkout, de punta a punta

Versión sincrónica de un checkout típico:

```
Cliente ──HTTP──▶ Checkout ──▶ Pagos (300 ms)
                     │
                     ├────────▶ Inventario (50 ms)
                     ├────────▶ Emails (800 ms, SMTP lento)
                     ├────────▶ Facturación (200 ms)
                     └────────▶ Analytics (100 ms)

Latencia del cliente: suma de todo ≈ 1,45 s
Disponibilidad: producto de todas ≈ 5 nueves⁵ → mucho menos que cualquiera
Si Emails está caído → el checkout FALLA (¿en serio?)
```

Versión con mensajería:

```
Cliente ──HTTP──▶ Checkout ──▶ Pagos (síncrono: SÍ necesitas la respuesta)
                     │
                     └──▶ [ pedido-confirmado ] ──┬──▶ Inventario
                              (broker)            ├──▶ Emails
                                                  ├──▶ Facturación
                                                  └──▶ Analytics

Latencia del cliente: pago + publicar ≈ 350 ms
Si Emails está caído → los mensajes esperan; el checkout no se entera
```

Fíjate en el detalle senior: **Pagos sigue siendo síncrono**. No puedes confirmar un pedido sin saber si el cobro pasó. La mensajería no sustituye a las llamadas; separa lo que necesita respuesta de lo que solo necesita *ocurrir*.

### La factura completa

| | Compras | Pagas |
|---|---|---|
| **Desacoplo temporal** | El productor no necesita que el consumidor esté vivo, ni rápido, ni siquiera desplegado todavía | **Consistencia eventual:** hay una ventana en la que el pedido existe pero el email no salió, el stock no bajó. La UI y el negocio deben tolerarla |
| **Buffering** | Un pico de 10× se absorbe en la cola en vez de tirar el servicio; el consumidor drena a su ritmo | **Lag:** si el pico dura más que tu capacidad de drenar, la cola crece sin límite. Necesitas monitorizarla (más abajo) |
| **Retry gratis** | El mensaje ya está persistido; si el consumidor falla, se reintenta sin que el productor haga nada | **Duplicados:** reintentar implica poder procesar dos veces. El consumidor debe ser idempotente, sí o sí |
| **Fan-out barato** | Añadir el quinto consumidor no toca al productor ni a los otros cuatro | **Contratos implícitos:** nadie sabe quién consume qué; romper un esquema rompe equipos que no conoces |
| **Aislamiento de fallos** | Emails caído no afecta al checkout | **Observabilidad más difícil:** no hay un stack trace de punta a punta; necesitas trazas con contexto propagado en el mensaje, y "¿dónde está mi pedido?" pasa a ser una pregunta de tres sistemas |

**💬 Cómo lo dices:** *"Meto una cola cuando el emisor no necesita la respuesta para continuar. Compro desacoplo, buffering y retry; pago consistencia eventual y duplicados, así que el consumidor es idempotente desde el día uno y el lag es una métrica de primera clase."* Esa frase, tal cual, es la respuesta a "¿por qué una cola aquí?".

## Anatomía: productor, broker, consumidor

```
 Productor              Broker                Consumidor
┌─────────┐   (1)   ┌───────────┐    (2)    ┌──────────┐
│ publica │ ──────▶ │ almacena  │ ────────▶ │ procesa  │
│         │ ◀────── │ y enruta  │ ◀──────── │          │
└─────────┘  ack    └───────────┘  ack (3)  └──────────┘
```

Tres piezas, tres responsabilidades, tres sitios donde algo puede salir mal (sección siguiente). Sobre esta base hay dos ejes de diseño que debes dominar.

### Eje 1 · Punto-a-punto vs pub/sub

- **Punto-a-punto (cola de trabajo):** cada mensaje lo procesa **exactamente un** consumidor del grupo. Es reparto de trabajo: "redimensiona esta imagen", "envía este email". SQS, una queue de Rabbit, un consumer group de Kafka.
- **Pub/sub:** cada mensaje llega a **todos los suscriptores** interesados. Es difusión de hechos: "se confirmó el pedido 42". SNS, exchanges fanout/topic de Rabbit, varios consumer groups sobre el mismo topic de Kafka.

Los sistemas reales combinan ambos: pub/sub entre servicios (cada servicio recibe su copia) y punto-a-punto dentro de cada servicio (las instancias se reparten los mensajes). En Kafka ese doble nivel viene de serie: **topic = pub/sub entre grupos, grupo = punto-a-punto entre sus instancias**.

### Eje 2 · Cola vs log: la distinción que explica Rabbit vs Kafka

Esta es LA pregunta de arquitectura de mensajería, y casi nadie la responde bien:

```
COLA (RabbitMQ, SQS)                    LOG (Kafka, Kinesis, Pulsar)

  ┌──┬──┬──┬──┐                          ┌──┬──┬──┬──┬──┬──┬──┐
─▶│m4│m3│m2│m1│─▶ consumidor            │m1│m2│m3│m4│m5│m6│m7│─▶ append
  └──┴──┴──┴──┘                          └──┴──┴──┴─▲┴──┴─▲┴──┘
                                                    │      │
El broker ENTREGA y BORRA:                    offset A   offset B
- el mensaje consumido desaparece
- el broker rastrea qué entregó         El broker solo APPENDEA:
- reparto mensaje a mensaje             - los consumidores llevan su offset
- fácil: prioridades, TTL, routing      - el mismo dato, leído N veces
- difícil: relectura, orden global      - relectura = mover el offset atrás
                                        - retención por tiempo, no por consumo
```

Consecuencias prácticas que suman puntos:

| | Cola (Rabbit/SQS) | Log (Kafka) |
|---|---|---|
| ¿Releer mensajes de ayer? | No (ya se borraron) | Sí, mueve el offset |
| ¿Nuevo consumidor ve la historia? | No, solo lo nuevo | Sí, hasta donde llegue la retención |
| Orden | Por cola, se rompe con reintentos y prefetch | Estricto **por partición** (por clave) |
| Reparto de trabajo | Mensaje a mensaje (grano fino) | Partición a partición (grano grueso) |
| Un consumidor lento | Los demás siguen cogiendo mensajes | Bloquea su partición entera |
| Routing sofisticado | Sí (exchanges, headers, prioridades) | No: eso es problema del consumidor |
| Sweet spot | Colas de trabajo, RPC, tareas con prioridad | Event streaming, fan-out masivo, event sourcing, integración de datos |

**💬 Cómo lo dices:** *"Rabbit es una cola: entrega y borra, ideal para repartir trabajo. Kafka es un log: retiene y deja que cada consumidor lleve su offset, ideal para difundir hechos que varios sistemas leerán a su ritmo, incluso re-leerán. Si mi pregunta es 'quién hace esta tarea' → cola; si es 'quién necesita enterarse de esto' → log."*

## Semánticas de entrega: dónde se pierde o duplica un mensaje

"¿Tu sistema garantiza exactly-once?" es una pregunta trampa. La respuesta senior empieza por descomponer el viaje en **tres tramos**, porque las garantías se negocian tramo a tramo:

```
   TRAMO 1                 TRAMO 2                TRAMO 3
Productor ──▶ Broker    Broker (almacena)     Broker ──▶ Consumidor

Se PIERDE si:           Se PIERDE si:         Se PIERDE si:
- publicas sin ack      - solo en memoria     - ack ANTES de procesar
  (fire & forget)         y el broker cae       y el proceso muere
- ack de 1 réplica      - disco sin réplica     (at-most-once)
  y esa réplica muere
                        Se DUPLICA: nunca     Se DUPLICA si:
Se DUPLICA si:          (el broker no crea    - procesas y mueres ANTES
- timeout del ack y     mensajes)               del ack → redelivery
  reintentas: el                                (at-least-once)
  broker ya lo tenía
```

### Tramo 1 · Productor → broker

El dilema es qué haces cuando **no llega el ack**: no sabes si el mensaje se perdió o si se escribió y se perdió solo el ack. Si no reintentas → puedes perder. Si reintentas → puedes duplicar. No hay tercera opción sin ayuda del broker (el *idempotent producer* de Kafka deduplica por número de secuencia justo para esto; lo veremos en el módulo 2). Regla senior: **reintenta siempre y asume duplicados aguas abajo**.

### Tramo 2 · Dentro del broker

Aquí se pierde por durabilidad mal configurada, no por lógica: mensajes no persistidos a disco, ack con una sola réplica, o retención/TTL que expira antes de consumir. Es configuración (`acks=all` y réplicas en Kafka, quorum queues y publisher confirms en Rabbit), y es la parte que en la entrevista se despacha en una frase: *"con replicación y ack de quórum, doy el tramo 2 por resuelto"*.

### Tramo 3 · Broker → consumidor

Todo se reduce a **cuándo haces ack** respecto a procesar:

| Orden de operaciones | Semántica | Fallo típico |
|---|---|---|
| ack → procesar | **At-most-once** | Mueres tras el ack: mensaje perdido para siempre |
| procesar → ack | **At-least-once** | Mueres antes del ack: el broker reenvía → duplicado |
| procesar + ack atómicos | **Exactly-once (efectivo)** | Requiere transacción u idempotencia; no es gratis |

### La respuesta completa a la pregunta trampa

*"Exactly-once de transporte no existe de punta a punta entre sistemas independientes; lo que se construye es **procesamiento efectivamente-una-vez**: at-least-once en el transporte (reintentos en el tramo 1, replicación en el 2, ack después de procesar en el 3) más **idempotencia en el consumidor** para que el duplicado inevitable sea inofensivo."* El cómo de esa idempotencia (clave natural, tabla de deduplicación, upserts) lo cubriste en el curso 00, módulo 3; aquí basta con que sea tu reflejo automático.

## Contratos: comandos vs eventos

Un mensaje es una API. La diferencia con REST es que aquí nadie te fuerza a pensarlo, y por eso el 80% del dolor de mensajería en producción es dolor de contratos.

### Comando vs evento

| | Comando | Evento |
|---|---|---|
| Semántica | "Haz esto" (imperativo, futuro) | "Esto pasó" (hecho, pasado) |
| Nombre | `EnviarEmail`, `CobrarPedido` | `PedidoConfirmado`, `PagoRechazado` |
| Destinatarios | **Uno**, conocido | **N**, desconocidos para el emisor |
| ¿Puede rechazarse? | Sí (validación, negocio) | No: un hecho no se rechaza, se reacciona |
| Acoplamiento | El emisor conoce al receptor (sabe qué le pide) | El emisor no sabe quién escucha |
| Transporte natural | Cola punto-a-punto | Pub/sub, log |

El error clásico es el **evento que es un comando disfrazado**: publicas `PedidoConfirmado` pero en realidad *esperas* que Emails mande la confirmación, y si no lo hace, tu flujo está roto. Si dependes de que un receptor concreto haga algo concreto, es un comando: hazlo explícito. Los eventos son para lo que te da igual quién escuche.

### Ownership del contrato

- **Un evento lo posee quien lo emite.** `PedidoConfirmado` pertenece al equipo de Pedidos: su esquema, su versionado, su compatibilidad. Los consumidores opinan, no deciden.
- **Un comando lo posee quien lo recibe.** `EnviarEmail` pertenece al equipo de Emails: es su API de entrada, igual que un endpoint.
- Corolario: **el evento no es tu tabla.** Publicar el row de la BD como evento acopla tu esquema interno a media empresa; el evento es una proyección estable y deliberada (igual que un DTO no es la entidad).

### Versionado básico

Con N consumidores que no controlas, no puedes "avisar y romper". Reglas mínimas:

1. **Cambios compatibles siempre que se pueda:** añadir campos opcionales sí; renombrar, quitar o cambiar tipos, no. Los consumidores deben ignorar campos desconocidos (tolerant reader).
2. **Esquema explícito y validado en el pipeline** (JSON Schema, Avro/Protobuf con schema registry): el contrato vive en un sitio, no en la cabeza de cada equipo, y una publicación incompatible falla en CI, no en producción a las 3 a. m.
3. **Cambio incompatible = evento nuevo** (`PedidoConfirmado.v2` o topic nuevo): publicas ambos durante la migración, los consumidores migran a su ritmo, y retiras el viejo cuando el consumo llegue a cero — que puedes ver en las métricas del broker.
4. **Metadatos de sobre (envelope) desde el día uno:** `message_id` (dedupe), `type`, `version`, `occurred_at`, `trace_id` (observabilidad), `key` de correlación. Añadirlos después cuesta una migración; ponerlos al principio cuesta cinco minutos.

## Dimensionar: Little aplicado a colas, y el lag como métrica reina

La ley de Little (`L = λ × W`) que usaste para pools e hilos funciona igual aquí, con una lectura extra: en una cola, **L es el lag** (mensajes pendientes) y **W es cuánto espera un mensaje** desde que se publica hasta que se procesa.

### ¿Cuántos consumidores necesito?

Ejemplo numérico completo, del tipo que se pide en entrevista:

```
Llegan:    λ = 2.000 msg/s (pico sostenido)
Procesar:  W_servicio = 40 ms por mensaje (llamada a BD incluida)

Capacidad de 1 consumidor: 1 / 0,04 s = 25 msg/s
Consumidores mínimos:      2.000 / 25 = 80
Con utilización objetivo del 70% (¡las colas también sufren el 1/(1−ρ)!):
                           80 / 0,7 ≈ 115 consumidores
```

Y el matiz que te hace senior: **en Kafka, el paralelismo máximo lo fijan las particiones**. Con 60 particiones, tus 115 consumidores son imposibles: 60 trabajan y 55 miran. O subes particiones (decisión que conviene tomar *antes*, repartir de nuevo las claves tiene coste), o bajas W (batching, pipeline, cachear esa llamada a BD), o aceptas lag durante el pico. En Rabbit/SQS no existe ese techo: el reparto es por mensaje y escalas consumidores hasta donde aguante el downstream.

### El lag como métrica de salud

El lag (queue depth en Rabbit/SQS, consumer lag en Kafka) es la mejor métrica de un sistema asíncrono porque integra todo: llegadas, capacidad, fallos del consumidor, lentitud del downstream.

- **Lo que importa no es el valor, es la derivada.** Lag 100.000 drenando es un pico absorbiéndose (para eso pusiste la cola); lag 5.000 creciendo monótonamente es `λ > capacidad` y no se arregla solo: o escalas o recortas.
- **Convierte el lag a tiempo:** `lag / capacidad de drenado = cuándo se procesará lo que entra ahora`. 600.000 mensajes drenando a 2.000/s = 5 minutos de retraso. "5 minutos" es una conversación de negocio ("¿puede el email de confirmación tardar 5 min?"); "600.000 mensajes" no le dice nada a nadie. Algunas plataformas lo exponen directamente como *time lag* o edad del mensaje más antiguo; si la tuya no, calcúlalo tú.
- **Alerta por tiempo de lag creciente, no por lag > N:** el umbral fijo o llora en cada pico normal o calla cuando de verdad pasa algo.

**💬 Cómo lo dices:** *"Dimensiono con Little: 2.000 msg/s a 40 ms son 80 en proceso; con 70% de utilización, ~115 consumidores, techado por particiones si es Kafka. Y opero con el lag convertido a tiempo: si el retraso proyectado supera el SLA del flujo, escalo o degrado."*

## Patrones esenciales que hay que saber operar

Seis patrones que aparecen en cualquier sistema de mensajería serio. La entrevista no pide recitarlos: pide saber **cuándo y qué se rompe sin ellos**.

### DLQ (dead letter queue)

Sin DLQ, un mensaje que siempre falla (el *poison pill*: JSON corrupto, un caso de negocio no contemplado) se reintenta para siempre y, en una cola FIFO o una partición de Kafka, **bloquea todo lo que viene detrás**. Ese es el incidente clásico "el lag crece pero los consumidores están al 2% de CPU".

- Tras N intentos (3–5 típico), el mensaje va a una cola aparte con metadatos del error, y el flujo principal sigue.
- Una DLQ **sin alertas ni proceso de revisión es un agujero negro con otro nombre**: cada mensaje ahí es un caso de negocio sin atender. Métrica + alerta + runbook de re-drive (reinyectar tras arreglar el bug).
- Distingue error **transitorio** (timeout del downstream → reintentar tiene sentido) de **permanente** (schema inválido → a la DLQ a la primera; reintentar 5 veces un JSON corrupto es liturgia, no resiliencia).

### Retry con backoff

Reintento inmediato contra un downstream caído = machacarlo justo cuando peor está (y sincronizar a todos los consumidores en oleadas). Lo correcto: **backoff exponencial con jitter** (1 s, 2 s, 4 s… ±aleatorio). En mensajería hay un matiz que no existe en HTTP: si reintentas *sin sacar el mensaje de la cola/partición*, bloqueas el resto. El patrón operable son **colas de retraso escalonadas** (`retry-1m`, `retry-10m`, `retry-1h`): el mensaje fallido se re-publica en la siguiente con TTL, el flujo principal nunca se detiene, y lo que agota los niveles cae a la DLQ. Precio: se pierde el orden — si tu flujo exige orden por clave, reintentar "por el lado" reordena, y tienes que elegir entre bloquear la clave o tolerar el desorden.

### Idempotencia del consumidor

Ya lo tienes del curso 00: at-least-once implica duplicados, el consumidor deduplica por `message_id` o clave natural (tabla de procesados, upsert, o operación naturalmente idempotente). Aquí solo el recordatorio operativo: la deduplicación **debe ser atómica con el efecto** (mismo commit de BD), porque "compruebo, proceso, marco" en tres pasos vuelve a dejar la ventana abierta.

### Claim check

Los brokers quieren mensajes pequeños (Kafka por defecto rechaza >1 MB; con mensajes grandes la replicación, el page cache y el rebalanceo sufren). Para un vídeo, un PDF o un batch de 50 MB: **sube el payload a object storage (S3) y publica solo la referencia** + metadatos. El consumidor "canjea el resguardo". Precios a mencionar: dos sistemas que mantener consistentes (¿quién borra el blob y cuándo?, ¿qué pasa si el mensaje sobrevive a la retención del blob o viceversa?) y un GET extra de latencia.

### Competing consumers

Es el nombre formal de "escalar horizontalmente el consumo": N instancias compitiendo por los mensajes de una misma cola/grupo. Las dos cosas que se rompen sin cuidado: el **orden** (dos mensajes de la misma entidad en paralelo en instancias distintas → estado final impredecible; la solución es particionar por clave de entidad, que es exactamente lo que hace Kafka con la key) y el **reparto con consumidores heterogéneos** (en Rabbit, limita el prefetch para que un consumidor rápido no acapare y uno lento no retenga cientos de mensajes sin ack).

### Request-reply sobre mensajería

A veces necesitas respuesta pero quieres el buffering y desacoplo del broker (o el receptor solo habla mensajería). El patrón: el productor publica con `reply_to` (cola de respuestas) y `correlation_id`; el consumidor procesa y publica la respuesta ahí; el productor correlaciona. Úsalo con timeout sí o sí — la respuesta puede no llegar nunca — y sé honesto en la entrevista: **si todos tus flujos son request-reply con timeouts cortos, has construido HTTP con más piezas**; probablemente querías HTTP.

## Cuándo NO usar mensajería

Decir "no" a la cola también puntúa. Señales de que la llamada síncrona es la respuesta correcta:

1. **Necesitas la respuesta para continuar.** Autorizar un pago, validar stock antes de confirmar, login. Convertirlo en mensaje no elimina la espera: la disfraza de polling o de callback, con más latencia y más piezas.
2. **Transaccionalidad fuerte real.** Si dos efectos deben ser atómicos de verdad (débito y crédito del mismo movimiento contable), la respuesta es una transacción en una BD, no dos mensajes "que ya se compensarán". Las sagas existen para cuando la atomicidad es *imposible* (dos servicios, dos BD), no como sustituto gratuito de una transacción que sí podías tener.
3. **Un solo consumidor, volumen bajo, sin picos.** 10 req/s entre dos servicios tuyos con SLA holgado: un HTTP con retry y timeout hace lo mismo con una pieza de infraestructura menos que operar, monitorizar y pagar de guardia.
4. **La frescura es el producto.** Precios en tiempo real, disponibilidad de asiento: leer de una proyección eventual y decidir sobre datos viejos puede costar dinero. O lectura síncrona de la fuente, o diseño explícito para reservar/confirmar.

**💬 Cómo lo dices:** *"La cola compra desacoplo a cambio de operación y eventual consistency. Si no necesito el desacoplo — un consumidor, poco volumen, y encima necesito la respuesta — estoy pagando el precio sin llevarme el producto."*

## Errores comunes que delatan a un no-senior

- Decir "uso Kafka" para una cola de trabajo de 50 msg/s con un consumidor — o "uso Rabbit" para difundir eventos que cinco equipos querrán releer.
- Prometer exactly-once "porque el broker lo garantiza", sin hablar de idempotencia ni de los tres tramos.
- Diseñar el evento copiando la tabla de la BD (acoplamiento de esquema interno a toda la empresa).
- No distinguir comando de evento: publicar `PedidoConfirmado` *esperando* que alguien concreto haga algo concreto.
- Cola sin DLQ (un poison pill congela el flujo) o DLQ sin alertas (agujero negro con SLA).
- Reintento inmediato e infinito contra un downstream caído, sin backoff, sin jitter, sin tope.
- Monitorizar "mensajes en cola" con umbral fijo en vez de lag convertido a tiempo y su tendencia.
- Escalar consumidores de Kafka por encima del número de particiones y sorprenderse de que no mejora.
- Olvidar que el orden por entidad se rompe con competing consumers sin partición por clave — o con retries "por el lado".
- Meter payloads de 20 MB por el broker en vez de claim check.

## 🧪 Laboratorio — pierde, duplica y atasca mensajes a propósito

Objetivo: provocar con tus manos los tres fallos de los que habla todo el módulo. Usa RabbitMQ por su UI de gestión; los conceptos son idénticos en cualquier broker.

1. Levanta el broker con Docker Compose:

   ```yaml
   # docker-compose.yml
   services:
     rabbitmq:
       image: rabbitmq:3-management
       ports: ["5672:5672", "15672:15672"]   # UI en http://localhost:15672 (guest/guest)
   ```

   ```bash
   docker compose up -d
   ```

2. Escribe un **productor** que publique 1.000 mensajes numerados (`{"id": n}`) y un **consumidor** que los procese con `sleep(50 ms)` y los apunte en un fichero. Lenguaje libre (`pika`, `amqplib`…).
3. **Pierde mensajes (tramo 3):** configura el consumidor con auto-ack (ack antes de procesar) y mátalo (`kill -9`) a mitad del millar. Reinicia y cuenta los ids del fichero: los que estaban en vuelo no están, y el broker ya no los tiene. Acabas de ver at-most-once.
4. **Duplica mensajes:** cambia a ack manual *después* de procesar y repite el `kill -9`. Al reiniciar, cuenta ids repetidos en el fichero: at-least-once en acción. Añade deduplicación por `id` (un set persistido o una tabla SQLite con PK) y verifica que el resultado final queda limpio pese al duplicado.
5. **Atasca la cola (poison pill):** publica un mensaje con JSON inválido en medio del flujo y haz que el consumidor haga `nack` con requeue. Observa en la UI cómo el mensaje rebota para siempre y (con prefetch=1) el resto espera. Ahora configura una DLQ (`x-dead-letter-exchange` + límite de reintentos) y verifica que el veneno se aparta y el flujo continúa.
6. **Mide el lag y valida a Little:** publica a 200 msg/s durante 60 s con un consumidor de 50 ms (capacidad: 20 msg/s). Grafica el queue depth desde la UI o la API de gestión (`/api/queues`): debe crecer a ~180 msg/s. Calcula cuántos consumidores necesitas para drenar (200/20 = 10, más margen ⇒ 12–15), lánzalos y cronometra el drenado. Compara con tu predicción.

**Entregable:** un README corto con: recuento de mensajes perdidos (paso 3) y duplicados (paso 4), captura de la DLQ con el poison pill dentro (paso 5), y la gráfica de lag del paso 6 junto al cálculo de consumidores y el tiempo real de drenado frente al predicho.

## ✅ Autoevaluación

1. En el checkout del módulo, ¿por qué Pagos queda síncrono y Emails asíncrono? Enuncia el criterio general en una frase.
2. Un compañero propone Kafka "porque es lo estándar" para una cola de envío de emails con reintentos y prioridad VIP. ¿Qué le preguntas y qué propones tú? Justifica con la distinción cola vs log.
3. Dibuja los tres tramos productor→broker→consumidor y di, para cada uno, un escenario concreto de pérdida y (donde aplique) de duplicado, con su mitigación.
4. `PagoRechazado`: ¿comando o evento? ¿Quién es dueño del contrato? ¿Cómo introduces un cambio incompatible en su esquema sin romper a 4 consumidores que no controlas?
5. Llegan 5.000 msg/s de pico y procesar uno tarda 30 ms. ¿Cuántos consumidores necesitas con utilización objetivo del 70%? Si es un topic de Kafka con 100 particiones, ¿qué problema tienes y qué tres salidas hay?
6. El lag lleva 40 minutos creciendo linealmente pero los consumidores están al 3% de CPU y sin errores en los logs. Da dos hipótesis y cómo confirmarías cada una.

## 🎯 Preguntas del banco que ya puedes responder

- [`mensajeria-eventos/01-fundamentos-de-mensajeria.md`](../../mensajeria-eventos/01-fundamentos-de-mensajeria.md) — sync vs async, cola vs log, semánticas de entrega, DLQ y patrones
- [`mensajeria-eventos/04-casos-y-problemas.md`](../../mensajeria-eventos/04-casos-y-problemas.md) — lag creciente, poison pills, duplicados en producción y dimensionamiento

## Para profundizar

- Martin Kleppmann, *Designing Data-Intensive Applications*, cap. 11 ("Stream Processing") — la comparación cola vs log definitiva.
- Gregor Hohpe & Bobby Woolf, *Enterprise Integration Patterns* — el vocabulario canónico: claim check, competing consumers, request-reply, DLQ.
- Jay Kreps, *"The Log: What every software engineer should know about real-time data's unifying abstraction"* (LinkedIn Engineering) — el ensayo que explica por qué Kafka es como es.
- Tyler Treat, *"You Cannot Have Exactly-Once Delivery"* — corto y demoledor; la munición exacta para la pregunta trampa.

---

**Siguiente:** [Módulo 2 · Kafka por dentro](02-kafka-por-dentro.md)
