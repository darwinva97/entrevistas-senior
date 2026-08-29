# Módulo 2 · Kafka por dentro: del log a producción

> **Curso 10 · Mensajería y streaming** · 150 min · Requiere [Módulo 1](01-colas-y-mensajeria.md)

## Por qué esto importa en la entrevista

Cualquiera puede recitar "Kafka es un log distribuido y particionado". Un senior sabe **qué pasa dentro del broker**: por qué no hay `fsync` por mensaje y aun así no se pierden datos, qué es exactamente el high watermark, por qué `acks=all` con `min.insync.replicas=1` es una promesa vacía, y qué mirar primero cuando el lag explota a las 3 a.m. Este módulo es agnóstico de lenguaje a propósito — la capa de cliente (Spring, librdkafka, kafkajs) cambia; el broker es el mismo para todos, y es sobre el broker sobre lo que preguntan cuando quieren separar a quien "usó Kafka" de quien **operó Kafka**. Si vienes del curso de Java, allí viste el cliente; aquí bajamos un nivel.

## El log distribuido: por qué Kafka es rápido

### Segmentos y offsets

Una partición no es un fichero: es un directorio de **segmentos**. Cada segmento es un fichero append-only con dos índices al lado (offset→posición física y timestamp→offset). Solo el *active segment* acepta escrituras; los anteriores son inmutables, y esa inmutabilidad hace triviales la retención (borrar ficheros enteros), la replicación (copiar bytes secuenciales) y la lectura concurrente sin locks.

```
partición pedidos-3/
├── 00000000000000000000.log      # segmento cerrado: offsets 0–49999
├── 00000000000000000000.index    # offset → posición en bytes (índice disperso)
├── 00000000000000000000.timeindex
├── 00000000000000050000.log      # segmento cerrado: offsets 50000–99999
├── 00000000000000050000.index
└── 00000000000000100000.log      # segmento activo ← solo aquí se escribe

  offset:   0 ──── 49999 │ 50000 ─── 99999 │ 100000 ──▶ (append)
                          │                 │
  retención borra desde aquí ◀── ficheros enteros, nunca "trozos"
```

El **offset** es un contador monótono por partición — no global, no por topic. De ahí la frase que hay que soltar entera: *Kafka garantiza orden por partición, no por topic*. Y el offset no lo asigna el productor sino el broker líder al hacer append; por eso dos productores concurrentes serializan en el log sin coordinarse.

La anatomía la controlan `segment.bytes` (1 GiB por defecto) y `segment.ms` (7 días) — rota lo que ocurra primero. Importa porque **retención y compactación operan sobre segmentos cerrados**: con poco tráfico y `segment.bytes` gigante, el segmento activo nunca rota y "retención de 1 hora" puede significar días de datos vivos. Clásico de incidente con topics compactados.

### Page cache y zero-copy: la respuesta a "¿por qué es tan rápido?"

Es pregunta directa de entrevista y la respuesta tiene cuatro patas:

1. **I/O secuencial.** Append al final del fichero y lecturas secuenciales: el patrón exacto para el que discos y prefetch del SO están optimizados. Nada de seeks aleatorios en el camino caliente.
2. **Page cache, no heap.** Kafka escribe al **page cache del SO** y responde; el flush a disco es asíncrono. No hay `fsync` por mensaje (`flush.messages`/`flush.ms` existen; la recomendación oficial es no tocarlos). La durabilidad ante la caída de *una máquina* no viene del disco: **viene de la replicación** — el dato está en 3 máquinas antes del ack. El insight que casi nadie verbaliza: Kafka cambia "fsync local" por "réplica remota" como unidad de durabilidad.
3. **Zero-copy (`sendfile`).** Para servir a un consumidor, el broker no copia los bytes a espacio de usuario: `sendfile()` los mueve del page cache directamente al socket, sin pasar por el heap de la JVM. Consecuencia real: los consumidores al día leen de RAM pura, y el heap del broker puede ser pequeño (4–6 GiB) — el resto de la máquina es page cache. Letra pequeña honesta: con TLS el zero-copy puro se pierde (hay que cifrar en userspace) y sigue siendo rápido por las otras tres patas.
4. **Batching y compresión extremo a extremo.** El productor comprime el batch entero; el broker lo almacena **tal cual** y el consumidor lo descomprime. El broker apenas toca los bytes: valida, asigna offsets y hace append.

```
productor                    broker (líder)                consumidor
  batch zstd ──────────▶  append al page cache ──────▶  sendfile()
                          (el SO flushea después)       page cache → socket
                                    │                   (0 copias a userspace)
                          réplicas hacen fetch
                          (la durabilidad real)
```

### Retención vs compactación

Dos políticas de limpieza (`cleanup.policy`), dos modelos mentales distintos:

| | `delete` (retención) | `compact` (compactación) |
|---|---|---|
| Qué garantiza | Datos de las últimas X horas / Y bytes | **El último valor por clave**, para siempre |
| Semántica del topic | Flujo de eventos ("qué pasó") | Tabla materializada ("estado actual") |
| Borrado de una clave | Expira sola | **Tombstone**: mensaje con esa clave y value `null` |
| Casos de uso | Eventos de dominio, clickstream, logs | Changelog de CDC, estado de Kafka Streams, `__consumer_offsets`, cachés reconstruibles |
| Parámetros clave | `retention.ms`, `retention.bytes` | `min.cleanable.dirty.ratio`, `delete.retention.ms`, `max.compaction.lag.ms` |

Matices que puntúan:

- La compactación **no es inmediata ni continua**: el log cleaner actúa cuando el "sucio" supera `min.cleanable.dirty.ratio` (50 %) y **nunca toca el segmento activo**. Un consumidor siempre puede ver claves repetidas; compactación garantiza *al menos* el último valor, no *solo* el último.
- Los tombstones se retienen `delete.retention.ms` (24 h) antes de desaparecer: un consumidor que reconstruye la tabla desde cero y tarda más puede **perderse el borrado** y resucitar la clave. Detalle de guerra real con CDC.
- `cleanup.policy=compact,delete` existe: compacta y además expira por tiempo, para changelogs que no deben crecer sin límite.

```bash
# topic tipo "tabla": estado de clientes vía CDC
kafka-topics --bootstrap-server localhost:19092 --create \
  --topic clientes.estado --partitions 12 --replication-factor 3 \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.3 \
  --config segment.ms=3600000          # rota cada hora: sin esto, poco tráfico = nunca compacta
```

## Réplicas: líder, ISR y el high watermark

### El modelo

Cada partición tiene un **líder** y N−1 **followers**. Toda lectura y escritura de clientes pasa por el líder (salvo *follower fetching* por rack, KIP-392); los followers replican haciendo fetch, como un consumidor más. El **ISR** (in-sync replicas) es el subconjunto de réplicas al día: un follower que se retrasa más de `replica.lag.time.max.ms` (30 s) sale del ISR — y esto es dinámico, el ISR encoge y crece en operación normal.

El **high watermark (HW)** es el offset hasta el cual **todas las réplicas del ISR** tienen el dato. Es la línea que separa dos mundos:

```
líder, partición pedidos-3:

offset:    ... 100  101  102  103  104  105  106
               ─────────────────────┤    ├─────────
               committed            HW   solo en el líder
               (visible a consumidores)  (aún no replicado)

follower A (ISR):  ... 103           ┐ el HW avanza cuando
follower B (ISR):  ... 104           ┘ el mínimo del ISR avanza
```

Los consumidores **solo leen hasta el HW**. Si el líder muere, el nuevo (elegido de dentro del ISR) trunca lo que esté por encima de su HW — por eso un mensaje "escrito en el líder pero no committed" puede desaparecer sin ser un bug: nunca fue visible ni confirmado con `acks=all`.

### El triángulo durabilidad–disponibilidad–latencia

Tres parámetros, un trade-off:

- **`acks`** (productor): `0` = fire-and-forget; `1` = ack del líder; `all` = ack cuando **todo el ISR actual** lo tiene.
- **`min.insync.replicas`** (broker/topic): tamaño mínimo del ISR para aceptar escrituras `acks=all`. Es la otra mitad de la garantía: `acks=all` significa "todo el ISR", y si el ISR se ha encogido a 1, "todo el ISR" es una sola máquina.
- **`unclean.leader.election.enable`**: si no queda nadie del ISR, ¿promovemos a una réplica desfasada (disponibilidad, perdiendo datos confirmados) o esperamos (durabilidad, partición offline)? `false` por defecto desde 0.11, y así debe quedarse para datos de negocio.

Los tres escenarios de pérdida, dibujados — memorízalos porque son *la* pregunta:

```
ESCENARIO 1 · acks=1 y muere el líder
  productor ──▶ líder (ack ✓) ──✗── followers aún no lo tienen
                  💀
  nuevo líder = follower sin el mensaje → PERDIDO (el productor cree que no)

ESCENARIO 2 · acks=all con min.insync.replicas=1
  ISR se encoge a {líder} (followers lentos/caídos — nadie lo impide)
  productor ──▶ líder (ack ✓, "todo el ISR" = él solo)
                  💀
  → mismo resultado que acks=1. La configuración prometía y no cumplía.

ESCENARIO 3 · unclean.leader.election.enable=true
  ISR entero muere; una réplica vieja (fuera del ISR, desfasada 5000 offsets)
  es promovida a líder → los 5000 mensajes committed DESAPARECEN
  y los offsets se reutilizan para datos nuevos (divergencia silenciosa)
```

La configuración canónica para no perder datos y la frase que la acompaña:

```bash
kafka-configs --bootstrap-server localhost:19092 --alter \
  --entity-type topics --entity-name pedidos \
  --add-config min.insync.replicas=2
# RF=3 + min.insync.replicas=2 + acks=all (productor)
# → tolera 1 broker caído sin perder datos NI disponibilidad de escritura.
# Con 2 brokers caídos: la partición rechaza escrituras (NotEnoughReplicas)
# → elegiste durabilidad sobre disponibilidad, y lo elegiste A PROPÓSITO.
```

Nota de latencia para cerrar el triángulo: `acks=all` no espera a las réplicas más lentas del mundo, espera al ISR — y como el ISR expulsa a los lentos, el extra en un clúster sano son pocos milisegundos. Decirlo desactiva la falsa dicotomía "rápido o seguro".

## Particiones: el número, la clave y sus consecuencias

### Cómo se elige el número

No hay fórmula mágica, hay un razonamiento en tres pasos que es lo que quieren oír:

1. **Paralelismo objetivo:** el máximo de consumidores activos de un grupo = número de particiones. Dimensiona para el throughput pico *dividido por lo que procesa un consumidor* (medido, no imaginado), con margen 2–3×.
2. **Throughput por partición:** una partición aguanta decenas de MB/s de escritura; el cuello suele ser el consumidor, no el broker.
3. **El coste de pasarse:** más ficheros abiertos, más réplicas que mover en failover, más latencia de elección de líder, más memoria en clientes, y batches más pequeños (peor compresión). 12–30 particiones cubren la mayoría de casos de negocio; miles por topic es un olor, no un mérito.

Regla práctica honesta: **es más barato sobredimensionar razonablemente al crear que repartir después**, por lo que viene ahora.

### La clave: orden, afinidad y hot partitions

`partition = murmur2(key) % numPartitions` (partitioner por defecto; sin clave, el *sticky partitioner* llena un batch por partición y rota). Elegir la clave es elegir tres cosas a la vez:

- **Orden:** todos los eventos de la misma clave van a la misma partición → orden total por entidad (`pedidoId`, `cuentaId`). Es la única garantía de orden que Kafka da.
- **Afinidad de estado:** en procesadores con estado, co-localiza todos los eventos de la entidad en el mismo procesador.
- **Distribución de carga:** y aquí está la trampa. Con una clave sesgada (el 30 % del tráfico es `clienteId=MEGACORP`), esa partición es una **hot partition**: su consumidor va al límite mientras los demás bostezan, el lag del grupo lo domina una sola partición, y añadir consumidores **no ayuda en nada** — el paralelismo máximo por clave es 1.

Salidas del hot partition, en orden de preferencia: repensar la clave (¿de verdad necesitas orden por cliente, o basta por pedido?); clave compuesta (`clienteId + bucket(0..9)` — sacrificas orden global del cliente por 10× paralelismo, y hay que decir en voz alta que es un trade-off); o topic propio para la entidad caliente. Lo que no es una salida: añadir particiones, porque…

### Por qué añadir particiones después rompe el particionado por clave

`hash(key) % N` cambia de resultado cuando cambia N. Al pasar de 12 a 24 particiones:

```
antes (N=12):  hash("cliente-42") % 12 = 7   → todos sus eventos en P7
después (N=24): hash("cliente-42") % 24 = 19 → los NUEVOS van a P19

consumidor de P19: ve el evento nuevo ANTES de procesar los viejos de P7
→ orden por clave roto durante toda la retención del topic
→ un stream con estado (Streams, Flink) puede leer "pedido cancelado"
  antes que "pedido creado"
```

Kafka **no re-particiona datos existentes** (los offsets son inmutables; moverlos rompería a todos los consumidores), y reducir particiones ni existe como operación. La respuesta senior a "¿cómo escalo un topic con clave?": se planifica al crear; si hay que crecer de verdad, **topic nuevo con N particiones**, migración con doble escritura o copiado que respete claves, y mover los consumidores — un proyecto, no un comando.

```bash
# esto es irreversible y rompe el particionado por clave: pedir confirmación humana
kafka-topics --bootstrap-server localhost:19092 --alter \
  --topic pedidos --partitions 24
```

## Consumer groups a fondo

### El protocolo: group coordinator y rebalanceo

Cada grupo tiene un **group coordinator** (un broker, elegido por `hash(group.id)` sobre las particiones de `__consumer_offsets`). Los miembros mandan heartbeats; cuando la membresía cambia (join, leave, expulsión), el coordinator dispara un **rebalanceo**: elige un líder de grupo *entre los consumidores*, que ejecuta el assignor y reparte particiones.

**Eager vs cooperative** — la distinción que pocos saben explicar:

```
EAGER (protocolo clásico: range, round-robin)
  rebalanceo ⇒ TODOS sueltan TODAS sus particiones ⇒ reasignación ⇒ retoman
  ────────────█████ stop-the-world █████──────────
  30 consumidores estables + 1 que entra = los 31 dejan de procesar

COOPERATIVE (CooperativeStickyAssignor, KIP-429)
  rebalanceo en 2 fases: solo se revocan las particiones QUE CAMBIAN de dueño
  ──────────── el resto sigue procesando ────────────
       P7: ──█ revoca █──▶ nuevo dueño
```

Con eager, cada deploy rolling de 30 réplicas provoca ~60 stop-the-world: minutos de pausa acumulada y picos de lag en cada release. `CooperativeStickyAssignor` (o el protocolo KIP-848, que en Kafka 4.x mueve el assignment al broker y hace el rebalanceo incremental por defecto) lo vuelve casi invisible.

**Static membership** (`group.instance.id`, KIP-345): identidad estable por consumidor. Si muere y vuelve **dentro de `session.timeout.ms`** con el mismo id, recupera sus particiones **sin rebalanceo** — un restart de pod en Kubernetes deja de ser un evento de grupo. La pareja habitual: static membership + `session.timeout.ms` generoso (30–60 s) + cooperative assignor. El precio: un pod muerto de verdad tarda ese session timeout en ser detectado.

### Los tres timeouts y el incidente que provoca cada uno

| Parámetro | Qué vigila | Quién lo evalúa | Mal puesto ⇒ incidente típico |
|---|---|---|---|
| `session.timeout.ms` (45 s) | Que lleguen heartbeats (hilo aparte del de proceso) | Coordinator | Muy bajo + GC pause o red con hipo ⇒ expulsiones espurias ⇒ rebalanceos en cascada sin que nadie esté caído |
| `heartbeat.interval.ms` (3 s) | Frecuencia de heartbeat; debe ser ≈⅓ del session | Cliente | Muy alto respecto al session ⇒ pocos latidos de margen: un heartbeat perdido y fuera |
| `max.poll.interval.ms` (5 min) | Que el **hilo de proceso** llame a `poll()` a tiempo | Cliente (sale del grupo él solo) | Procesar un batch tarda más ⇒ el consumidor abandona el grupo ⇒ rebalanceo ⇒ el sucesor hereda el batch y también tarda ⇒ **bucle de rebalanceos** con lag creciendo y CPU al 100 % "sin procesar nada" |

El matiz que delata al que lo ha vivido: heartbeat y proceso son **hilos distintos** (KIP-62). Un consumidor puede latir perfectamente mientras su hilo de proceso lleva 20 minutos atascado en una llamada HTTP sin timeout — el grupo no rebalancea, la partición no avanza, el lag sube con todos los healthchecks en verde. `session.timeout.ms` detecta procesos muertos; `max.poll.interval.ms` detecta procesos **zombis**. Necesitas los dos.

El diagnóstico empieza siempre igual:

```bash
kafka-consumer-groups --bootstrap-server localhost:19092 \
  --describe --group facturacion

# TOPIC    PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG    CONSUMER-ID
# pedidos  0          184220          184230          10     consumer-...-1
# pedidos  1          97101           142553          45452  consumer-...-2  ← una sola caliente: hot partition
# pedidos  2          183001          183001          0      -               ← sin dueño: rebalanceo o miembro caído

# lag uniforme y creciente → el grupo no da abasto (o bucle de rebalanceo)
# lag en UNA partición     → hot partition o poison pill atascando al dueño
```

Y la operación de incidente que hay que conocer:

```bash
# saltar un poison pill / reprocesar: mover offsets con el grupo PARADO
kafka-consumer-groups --bootstrap-server localhost:19092 \
  --group facturacion --topic pedidos:1 \
  --reset-offsets --shift-by 1 --execute        # o --to-datetime, --to-earliest
```

## Transacciones y exactly-once

### El problema exacto que resuelven

No es "no quiero duplicados en general" — para eso están la idempotencia del productor (duplicados por reintento de red, por defecto desde Kafka 3.0) y el consumidor idempotente (módulo 1). Las transacciones resuelven un problema más estrecho: **consume–transform–produce atómico**. Un procesador lee de un topic, produce a otro y comitea su offset; sin transacciones, un crash entre el produce y el commit ⇒ reprocesa ⇒ duplica aguas abajo. La transacción hace atómicos *el produce y el commit del offset* (el offset ES un produce a `__consumer_offsets`, por eso puede entrar en la transacción — detalle elegante que vale la pena soltar).

### transactional.id y fencing

```
productor con transactional.id="procesador-pagos-0"
   │ initTransactions() → el transaction coordinator le da (producerId, epoch=5)
   │
   ▼ el proceso viejo (epoch=4) quedó colgado en una pausa de GC y revive:
     intenta escribir → InvalidProducerEpochException → FENCED (cercado)
```

El `transactional.id` es una identidad **estable entre reinicios**. Cada `initTransactions()` incrementa el epoch, y el coordinator rechaza escrituras de epochs anteriores. Esto mata a los **zombis**: la instancia antigua que el orquestador dio por muerta pero sigue viva y escribiendo. Sin fencing, exactly-once es imposible por definición (siempre puede haber dos "yo" escribiendo). Consecuencia operativa: el `transactional.id` debe mapear 1:1 con la unidad de trabajo (p. ej. `app-particiónDeEntrada`), no ser aleatorio por arranque — un id aleatorio nunca cerca a nadie.

### read_committed y el LSO

Los mensajes de una transacción se escriben en el log **entrelazados** con los demás (no hay buffer aparte); al final se añade un marker de commit/abort. Un consumidor `read_committed` no lee más allá del **LSO** (last stable offset): el offset de la primera transacción aún abierta. Dos efectos reales: los abortados ocupan log aunque nadie los vea, y **una transacción colgada congela el LSO** — todos los consumidores `read_committed` de esa partición se paran aunque haya datos committed detrás. Síntoma: lag creciendo con el grupo "sano"; causa: un productor transaccional zombi; límite de seguridad: `transaction.max.timeout.ms` en el broker.

### La letra pequeña

- **EOS solo existe dentro del ecosistema Kafka**: topic → proceso → topic (exactamente lo que Kafka Streams activa con `processing.guarantee=exactly_once_v2`). En cuanto el efecto sale de Kafka — un INSERT en Postgres, un email, una llamada HTTP — la transacción **no lo cubre** y vuelves a idempotencia + outbox del módulo 1. "Exactly-once end-to-end con el mundo exterior" no lo vende ni Kafka; decirlo sin que te lo pregunten es señal fuerte.
- Coste: latencia extra por markers y coordinator, y throughput menor. Para pipelines de analítica compensa; para un consumidor que escribe en una BD, no aplica y sobra.
- Requiere `read_committed` en TODOS los lectores aguas abajo; uno en `read_uncommitted` (el default) ve los abortados y arruina la garantía para su rama.

## KRaft, operación y observabilidad

### KRaft en dos párrafos

ZooKeeper está muerto (eliminado en Kafka 4.0): los metadatos — topics, líderes, ISR — viven ahora en un **quorum Raft de controllers** dentro del propio Kafka, materializados como un log interno (`__cluster_metadata`) que los brokers consumen. Menos piezas que operar, failover de controller casi instantáneo (el líder del quorum ya tiene los metadatos en memoria; con ZK había que releerlos), y escalado a millones de particiones por clúster.

Operativamente: en producción, 3 o 5 nodos `process.roles=controller` dedicados (el modo *combined* es para dev). Para la entrevista basta: consenso Raft para metadatos, el data plane (produce/fetch) no cambia en nada, y la elección de líder de particiones la resuelve el controller quorum sin sesiones de ZK.

### Las métricas que importan (y en qué orden mirarlas)

| Métrica | Dónde | Qué significa | Umbral mental |
|---|---|---|---|
| **Consumer lag** (y su derivada) | `kafka-consumer-groups` / exporter (Burrow, kminion) | La única métrica de negocio: cuánto tiempo real llevas de retraso | Lag estable = dimensionamiento; lag **creciente** = incidente |
| **UnderReplicatedPartitions** | broker JMX | Particiones con ISR < RF: replicación rota o broker caído | > 0 sostenido = alarma; es LA métrica de salud del clúster |
| **UnderMinIsrPartitionCount** | broker JMX | Particiones que ya rechazan `acks=all` | > 0 = pérdida de disponibilidad de escritura AHORA |
| **Request latency p99 (produce/fetch)** por fase | broker JMX | En qué fase se va el tiempo: `RemoteTime` alto en produce = réplicas lentas; `LocalTime` alto = disco | Comparar contra su línea base |
| **IsrShrinksPerSec / IsrExpandsPerSec** | broker JMX | ISR entrando/saliendo en oleadas: red o GC inestables | Flapping = investigar antes de que sea pérdida |
| **ActiveControllerCount** | controller JMX | Debe sumar exactamente 1 en el clúster | ≠ 1 = problema de quorum |

Playbook de incidente "hay lag", en el orden real:

1. `kafka-consumer-groups --describe`: ¿lag uniforme o en una partición? ¿miembros asignados o rebalanceando?
2. Uniforme + miembros estables ⇒ throughput: ¿subió el tráfico o se ralentizó la dependencia del consumidor (BD, API)? El 80 % de los "problemas de Kafka" son el sistema de al lado.
3. Miembros entrando/saliendo ⇒ bucle de rebalanceo: buscar en logs `max.poll.interval.ms` excedido o expulsiones por session timeout.
4. Una partición ⇒ hot partition (offsets por partición) o poison pill (log del dueño de esa partición).
5. Solo entonces, el broker: URP, ISR shrinks, latencia por fase. Si URP > 0, el problema es del clúster, no del consumidor.

## Ecosistema en 15 líneas cada uno

### Kafka Connect

Framework declarativo para mover datos entre Kafka y sistemas externos: **source connectors** (de fuera hacia Kafka — el caso estrella es CDC con Debezium leyendo el WAL de Postgres/MySQL y publicando cada cambio de fila como evento) y **sink connectors** (hacia S3, Elasticsearch, JDBC, BigQuery). Se opera como un clúster de *workers*: los conectores se parten en *tasks*, con offsets, reintentos y rebalanceo gestionados por el framework — configuras JSON, no despliegas código. Lo que hay que saber decir: los sinks son at-least-once (el sink idempotente/upsert lo convierte en efectivamente-once); los errores de datos van a una **DLQ** por conector (`errors.tolerance=all` + `errors.deadletterqueue.topic.name`) en vez de parar el pipeline; y las transformaciones ligeras (SMT) van en el conector, pero la lógica de negocio no. En entrevista, Connect es la respuesta correcta a "¿cómo llevo mi BD a Kafka?" (Debezium, no polling) y a "¿cómo archivo topics en S3?" — decir "escribiría un consumidor" para esos casos resta puntos.

### Kafka Streams vs consumidor plano vs Flink

Tres niveles de la misma escalera, y la pregunta real es cuándo subir. El **consumidor plano** cubre el 80 %: procesar un evento, escribir en una BD, llamar a una API — sin estado propio o con el estado en la BD de siempre. **Kafka Streams** es una librería (no un clúster: tu app de siempre, escalada con réplicas) para cuando el procesamiento tiene **estado**: agregaciones por ventana, joins, tablas materializadas — el estado vive en RocksDB local respaldado por *changelog topics* compactados, el paralelismo hereda las particiones, y EOS es una línea de config. Su límite: solo Kafka como entrada/salida. **Flink** es un clúster de procesamiento aparte, con estado y checkpoints propios: se justifica con volúmenes/estado enormes, *event time* y ventanas complejas de verdad, conectores más allá de Kafka o SQL sobre streams como producto. La respuesta senior no es "Flink porque es lo más potente", es la escalera: consumidor plano hasta que el estado lo pida, Streams mientras todo sea Kafka y quepa en la app, Flink cuando el procesamiento sea un sistema en sí mismo con equipo que lo opere.

### Schema Registry y compatibilidad

El broker no valida contenido: para él un mensaje son bytes. El contrato productor–consumidor vive en el **Schema Registry**: los esquemas (Avro/Protobuf/JSON Schema) se registran por *subject* (por defecto `<topic>-value`), el mensaje lleva solo el id del esquema (5 bytes), y el registry **rechaza al registrar** cualquier evolución que rompa la política de compatibilidad del subject. Las políticas que hay que saber razonar: `BACKWARD` (el consumidor nuevo lee datos viejos ⇒ puedes borrar campos y añadir opcionales; **consumidores primero**) — el default y lo habitual con Kafka, porque el consumidor releerá historia retenida; `FORWARD` (el consumidor viejo lee datos nuevos ⇒ productores primero); `FULL` (ambas); y las variantes `*_TRANSITIVE`, que comprueban contra **todas** las versiones y no solo la última — importa precisamente porque la retención hace convivir versiones antiguas con consumidores nuevos. La frase resumen: el registry convierte "romper el contrato" de incidente en producción a error de CI.

## Errores comunes que delatan a un no-senior

- Explicar la velocidad de Kafka con "está escrito muy optimizado" sin mencionar page cache, I/O secuencial ni zero-copy.
- Creer que la durabilidad viene del `fsync` y no de la replicación — o al revés, que `acks=all` espera al disco de las tres réplicas.
- `acks=all` sin `min.insync.replicas=2`: la promesa vacía del escenario 2.
- "Añadimos particiones y ya" ante un hot partition — sin mencionar que rompe `hash % N`.
- Confundir `session.timeout.ms` con `max.poll.interval.ms`, o no saber que heartbeat y proceso son hilos distintos.
- Vender transacciones de Kafka como exactly-once contra una base de datos externa.
- Compactación entendida como "solo queda el último valor, inmediatamente y siempre" — sin dirty ratio, segmento activo ni tombstones.
- Diagnóstico de lag empezando por reiniciar brokers en vez de por `kafka-consumer-groups --describe`.

## 🧪 Laboratorio — romper Kafka a propósito y medirlo

Clúster de 3 brokers KRaft en modo combined (suficiente para el lab). `docker-compose.yml`:

```yaml
# Los tres brokers son idénticos salvo NODE_ID, hostname y puerto expuesto.
services:
  kafka-1:
    image: apache/kafka:3.9.0
    ports: ["19092:19092"]
    environment: &kafka-env
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller            # combined: solo para labs
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka-1:9093,2@kafka-2:9093,3@kafka-3:9093
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093,EXTERNAL://:19092
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:9092,EXTERNAL://localhost:19092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT,EXTERNAL:PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
      CLUSTER_ID: "labcluster0000000000001"
  kafka-2:
    image: apache/kafka:3.9.0
    ports: ["29092:19092"]
    environment:
      <<: *kafka-env
      KAFKA_NODE_ID: 2
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-2:9092,EXTERNAL://localhost:29092
  kafka-3:
    image: apache/kafka:3.9.0
    ports: ["39092:19092"]
    environment:
      <<: *kafka-env
      KAFKA_NODE_ID: 3
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-3:9092,EXTERNAL://localhost:39092
```

Las CLI vienen dentro de las imágenes: entra con `docker compose exec kafka-1 bash` (están en `/opt/kafka/bin`). Bootstrap interno: `kafka-1:9092`.

1. **Anatomía del log.** Crea `lab` con 6 particiones y RF=3, produce 100k mensajes con `kafka-producer-perf-test` (`--record-size 1024`), y mira el directorio de una partición (`ls -la /tmp/kraft-combined-logs/lab-0/`). Baja `segment.bytes` a 1 MiB con `kafka-configs --alter`, produce otra tanda y observa los segmentos nuevos. Vuelca uno con `kafka-dump-log --files ...log --print-data-log` y localiza offsets, batches y compresión.
2. **Pérdida real con `acks=1`.** Produce 50.000 mensajes numerados con `kafka-verifiable-producer --acks 1 --max-messages 50000`; a mitad de la carga, `docker compose kill` al broker líder de una partición (localízalo con `kafka-topics --describe`). Consume todo con `kafka-verifiable-consumer` y cuenta los que faltan. Repite con `--acks -1` y `min.insync.replicas=2`: cero perdidos (aunque quizá duplicados — verbalizarlo es parte del lab). Levanta el broker y observa en los logs cómo trunca a su HW y reingresa al ISR.
3. **Unclean election, con los ojos abiertos.** Con `min.insync.replicas=1`, mata los dos followers de una partición, produce 1.000 mensajes más (solo el líder los tiene), mata al líder y levanta solo un follower viejo. Partición offline; activa `unclean.leader.election.enable=true` con `kafka-configs` y mira cómo vuelve a estar disponible… con los 1.000 mensajes desaparecidos. Deshaz el flag y explica en una frase cuándo aceptarías ese trade.
4. **Lag y bucle de rebalanceo.** Lanza un consumidor lento (`kafka-console-consumer` canalizado a `while read; do sleep 0.1; done`) contra tráfico constante y grafica el LAG de `kafka-consumer-groups --describe` en un watch. Después fuerza el bucle: consumidor con `max.poll.interval.ms=10000` que tarda 15 s por batch (un script de 20 líneas en tu lenguaje); observa las salidas del grupo en los logs y en `--describe --state --members` cómo no sale de `PreparingRebalance`. Arréglalo por las dos vías (menos records por poll / más intervalo) y compara el lag.
5. **Eager vs cooperative.** Grupo de 3 consumidores sobre 6 particiones. Mata y arranca un miembro con el assignor por defecto y mide cuánto dejan de procesar los otros dos; repite con `CooperativeStickyAssignor` en los tres y compara. Cierra con `group.instance.id` distinto en cada uno y comprueba que un restart rápido ya no provoca rebalanceo ninguno.
6. **Hot partition.** Produce 100k mensajes donde el 40 % lleva la clave `"MEGACORP"` (un one-liner que genere `clave,valor` hacia `kafka-console-producer --property parse.key=true`). Mide el desequilibrio con `kafka-get-offsets --topic lab` (offsets finales por partición) y con el LAG por partición de un grupo consumiendo. Demuestra que pasar de 6 a 12 particiones con `--alter` no arregla nada (la clave caliente sigue entera en una) y que además cualquier clave cambia de partición. Arréglalo con clave compuesta `MEGACORP-<n%8>` y vuelve a medir.

**Entregable:** una tabla con los números de cada experimento — perdidos con `acks=1` vs `acks=all`, segundos de pausa eager vs cooperative, offsets antes/después de la clave compuesta. Contar un lab con números propios vale más que cualquier teoría en una entrevista.

## ✅ Autoevaluación

1. Explica por qué Kafka es rápido con las cuatro patas (I/O secuencial, page cache, zero-copy, batching) y di dónde se rompe el zero-copy.
2. Dibuja el escenario en el que `acks=all` pierde datos y di qué parámetro lo evita y qué disponibilidad sacrificas a cambio.
3. ¿Qué es el high watermark, quién lo avanza, y qué pasa con los mensajes por encima de él cuando muere el líder?
4. Te piden duplicar el throughput de un topic con clave que ya está en producción con consumidores con estado. Explica por qué `--alter --partitions` es una mala idea y qué harías.
5. Un grupo de consumidores tiene lag creciente pero todos los healthchecks están en verde y no hay rebalanceos. Da la causa más probable y los dos timeouts implicados.
6. ¿Qué garantiza exactamente una transacción de Kafka, qué es el fencing por epoch, y por qué nada de eso te da exactly-once contra una base de datos externa?

## 🎯 Preguntas del banco que ya puedes responder

- [`mensajeria-eventos/02-kafka.md`](../../mensajeria-eventos/02-kafka.md) — arquitectura del log, réplicas/ISR, particionado, consumer groups, transacciones, ecosistema
- [`mensajeria-eventos/04-casos-y-problemas.md`](../../mensajeria-eventos/04-casos-y-problemas.md) — incidentes de lag, rebalanceo, hot partitions y pérdida de datos

## Para profundizar

- **Kafka: The Definitive Guide, 2ª ed.** (Shapira, Palino, Sivaram, Petty — O'Reilly): los capítulos de internals y operación son este módulo con más páginas.
- **Docs oficiales de Apache Kafka** — [kafka.apache.org/documentation](https://kafka.apache.org/documentation): la sección *Design* (persistence, efficiency, replication) es corta y de lectura obligatoria; casi nadie la lee y se nota.
- **Confluent Developer** — [developer.confluent.io](https://developer.confluent.io): el curso "Kafka Internals" (Jun Rao) es la mejor explicación gratuita del replication protocol y KRaft.
- **KIPs citados**: KIP-98 (transacciones), KIP-345 (static membership), KIP-429 (cooperative), KIP-500 (KRaft), KIP-848 (nuevo protocolo de grupos). Leer un KIP es la forma más rápida de entender el porqué de un diseño.
- **The Log** (Jay Kreps, 2013): el ensayo fundacional sobre el log como abstracción.
- **Kleppmann, *Designing Data-Intensive Applications***, cap. 11: donde encajan EOS, CDC y el dualismo tabla-stream.

---

**Anterior:** [Módulo 1](01-colas-y-mensajeria.md) · **Siguiente:** [Módulo 3 · RabbitMQ en producción](03-rabbitmq-en-produccion.md)
