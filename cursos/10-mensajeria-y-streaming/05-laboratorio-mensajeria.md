# Módulo 5 · Laboratorio integrador: opera tu propio clúster de mensajería

> **Curso 10 · Mensajería y streaming** · 180 min · Requiere los módulos 1–4 y Docker

## Por qué esto importa en la entrevista

Cualquier candidato puede recitar "Kafka garantiza orden por partición". Lo que separa a un senior es **la anécdota operativa**: "tuvimos un rebalance loop porque el procesamiento superaba `max.poll.interval.ms`; lo vimos porque el lag no bajaba y el `consumer-id` cambiaba en cada `--describe`". Eso no se puede fingir, y el entrevistador lo sabe.

Quizá nunca te tocó ese incidente en producción. Este laboratorio existe para **fabricar esas anécdotas de forma controlada**: vas a perder mensajes a propósito, provocar rebalances infinitos, crear hot partitions, duplicar eventos con un `kill -9` y bloquear publishers con una memory alarm. Al final habrás *vivido* los 8 incidentes más preguntados de mensajería. Regla del laboratorio: **no leas la salida esperada antes de ejecutar** — ejecuta, formula tu hipótesis y solo entonces compara.

---

## Preparación del entorno (10 min)

```bash
mkdir -p ~/lab-mensajeria && cd ~/lab-mensajeria
pnpm init
pnpm add kafkajs@2.2.4 amqplib@0.10.4 pg@8.12.0
export KAFKAJS_NO_PARTITIONER_WARNING=1   # silencia el aviso del partitioner de kafkajs 2.x
```

Todos los scripts van en `~/lab-mensajeria/`. Entre ejercicios, limpia con `docker compose down -v`.

---

## Ejercicio 1 — Kafka KRaft desde cero: producir, consumir y tocar el log en disco (20 min)

**Objetivo:** levantar un broker KRaft (sin ZooKeeper), producir y consumir con `kafkajs`, y abrir el segmento de log en disco para ver que "un topic" es literalmente un fichero append-only con offsets.

Crea `docker-compose.yml`:

```yaml
services:
  kafka:
    image: apache/kafka:3.9.1
    container_name: kafka
    ports: ["9092:9092"]
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: INTERNAL://:19092,CONTROLLER://:9093,EXTERNAL://:9092
      KAFKA_ADVERTISED_LISTENERS: INTERNAL://kafka:19092,EXTERNAL://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: INTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT,EXTERNAL:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: INTERNAL
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
```

```bash
docker compose up -d
docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:19092 \
  --create --topic pedidos --partitions 3
```

Crea `producir.js`:

```js
const { Kafka } = require('kafkajs');
(async () => {
  const producer = new Kafka({ clientId: 'lab', brokers: ['localhost:9092'] }).producer();
  await producer.connect();
  for (let i = 0; i < 10; i++) {
    const meta = await producer.send({ topic: 'pedidos',
      messages: [{ key: `cliente-${i % 3}`, value: JSON.stringify({ pedido: i, total: 100 + i }) }] });
    console.log(`pedido=${i} key=cliente-${i % 3} -> particion=${meta[0].partition} offset=${meta[0].baseOffset}`);
  }
  await producer.disconnect();
})();
```

Crea `consumir.js`:

```js
const { Kafka } = require('kafkajs');
const consumer = new Kafka({ clientId: 'lab', brokers: ['localhost:9092'] })
  .consumer({ groupId: 'facturacion' });
(async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: 'pedidos', fromBeginning: true });
  await consumer.run({ eachMessage: async ({ partition, message }) =>
    console.log(`p${partition} o${message.offset} key=${message.key} ${message.value}`) });
})();
```

```bash
node producir.js
node consumir.js   # Ctrl+C cuando veas los 10
```

**Qué observar:** cada `key` cae **siempre** en la misma partición, con offsets crecientes:

```text
pedido=0 key=cliente-0 -> particion=2 offset=0
pedido=1 key=cliente-1 -> particion=0 offset=0
pedido=2 key=cliente-2 -> particion=2 offset=1
pedido=3 key=cliente-0 -> particion=2 offset=2
...
```

Ahora abre el log en disco — la parte que casi nadie ha hecho:

```bash
docker exec kafka ls /tmp/kraft-combined-logs/pedidos-2/
# 00000000000000000000.log  00000000000000000000.index  00000000000000000000.timeindex ...
docker exec kafka /opt/kafka/bin/kafka-dump-log.sh --print-data-log \
  --files /tmp/kraft-combined-logs/pedidos-2/00000000000000000000.log
```

```text
baseOffset: 0 lastOffset: 0 ... isTransactional: false
| offset: 0 ... key: cliente-0 payload: {"pedido":0,"total":100}
| offset: 1 ... key: cliente-2 payload: {"pedido":2,"total":102}
```

Fíjate en `/tmp/kraft-combined-logs/` en que los offsets del grupo `facturacion` viven en otro topic (`__consumer_offsets`): en Kafka **todo es un log, incluso el estado de los consumers**.

**Qué acabas de aprender:** un topic no es una cola: es un conjunto de ficheros append-only segmentados con índice de offsets, y "consumir" es leer secuencialmente con un puntero que Kafka guarda en otro log. Cuando digas "Kafka es un commit log distribuido", lo dirás porque abriste el fichero con `kafka-dump-log.sh` y viste tus mensajes dentro.

---

## Ejercicio 2 — Pierde mensajes a propósito: `acks` + `kill -9` del broker (25 min)

**Objetivo:** demostrar empíricamente que `acks=0` y `acks=1` pierden mensajes cuando muere un broker, y que `acks=all` con `min.insync.replicas=2` no — midiéndolo con un **contador de conciliación**, no con sensaciones.

Necesitas 3 brokers. Crea `docker-compose.cluster.yml`:

```yaml
x-kafka: &kafka
  image: apache/kafka:3.9.1
x-env: &env
  KAFKA_PROCESS_ROLES: broker,controller
  KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
  KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
  KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: INTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT,EXTERNAL:PLAINTEXT
  KAFKA_INTER_BROKER_LISTENER_NAME: INTERNAL
  KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
  KAFKA_MIN_INSYNC_REPLICAS: 2
  KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0

services:
  kafka1:
    <<: *kafka
    container_name: kafka1
    ports: ["19092:19092"]
    environment:
      <<: *env
      KAFKA_NODE_ID: 1
      KAFKA_LISTENERS: INTERNAL://:9092,CONTROLLER://:9093,EXTERNAL://:19092
      KAFKA_ADVERTISED_LISTENERS: INTERNAL://kafka1:9092,EXTERNAL://localhost:19092
  kafka2:
    <<: *kafka
    container_name: kafka2
    ports: ["29092:29092"]
    environment:
      <<: *env
      KAFKA_NODE_ID: 2
      KAFKA_LISTENERS: INTERNAL://:9092,CONTROLLER://:9093,EXTERNAL://:29092
      KAFKA_ADVERTISED_LISTENERS: INTERNAL://kafka2:9092,EXTERNAL://localhost:29092
  kafka3:
    <<: *kafka
    container_name: kafka3
    ports: ["39092:39092"]
    environment:
      <<: *env
      KAFKA_NODE_ID: 3
      KAFKA_LISTENERS: INTERNAL://:9092,CONTROLLER://:9093,EXTERNAL://:39092
      KAFKA_ADVERTISED_LISTENERS: INTERNAL://kafka3:9092,EXTERNAL://localhost:39092
```

```bash
docker compose down -v && docker compose -f docker-compose.cluster.yml up -d
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic pagos --partitions 1 --replication-factor 3
```

Crea `conciliar.js` — el corazón del ejercicio: produce N mensajes numerados, luego consume todo y calcula la diferencia:

```js
const { Kafka } = require('kafkajs');
const kafka = new Kafka({
  clientId: 'lab', brokers: ['localhost:19092', 'localhost:29092', 'localhost:39092'],
  retry: { retries: 8 },
});
const N = 20000;
const ACKS = Number(process.argv[2] ?? 1); // 0 | 1 | -1 (all)

async function producir() {
  const producer = kafka.producer();
  await producer.connect();
  let confirmados = 0;
  for (let seq = 0; seq < N; seq++) {
    try {
      await producer.send({ topic: 'pagos', acks: ACKS,
        messages: [{ key: 'k', value: String(seq) }] });
      confirmados++;
    } catch (e) { console.error(`seq=${seq} ERROR ${e.message}`); }
    if (seq % 2000 === 0) console.log(`enviados ${seq}...`);
  }
  await producer.disconnect();
  return confirmados;
}

async function contar() {
  const vistos = new Set();
  const consumer = kafka.consumer({ groupId: `audit-${Date.now()}` });
  await consumer.connect();
  await consumer.subscribe({ topic: 'pagos', fromBeginning: true });
  let idle = null;
  await new Promise((done) => {
    consumer.run({ eachMessage: async ({ message }) => {
      vistos.add(Number(message.value.toString()));
      clearTimeout(idle); idle = setTimeout(done, 5000);
    }});
    idle = setTimeout(done, 10000);
  });
  await consumer.disconnect();
  return vistos;
}

(async () => {
  const confirmados = await producir();
  await new Promise(r => setTimeout(r, 5000));   // deja asentar el clúster
  const vistos = await contar();
  console.log(`\n=== CONCILIACIÓN (acks=${ACKS}) ===`);
  console.log(`intentados=${N} confirmados=${confirmados} en_el_log=${vistos.size}`);
  console.log(`PERDIDOS TRAS SER CONFIRMADOS: ${confirmados - vistos.size}`);
})();
```

El experimento: lanza el productor y, **mientras produce**, mata de un tiro al líder de la partición:

```bash
# ¿Quién es el líder de pagos-0?
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic pagos
# Topic: pagos  Partition: 0  Leader: 2  Replicas: 2,3,1  Isr: 2,3,1

node conciliar.js 1                    # Terminal A
docker kill --signal=SIGKILL kafka2    # Terminal B, cuando veas "enviados 6000..."
```

Salida esperada (los números varían — repítelo 2 o 3 veces si a la primera sale 0):

```text
seq=6412 ERROR There is no leader for this topic-partition as we are in the middle of a leadership election
=== CONCILIACIÓN (acks=1) ===
intentados=20000 confirmados=19987 en_el_log=19964
PERDIDOS TRAS SER CONFIRMADOS: 23
```

Repite el ciclo (`docker start kafka2 && sleep 15`, borra y recrea el topic) con `acks=0` — perderás cientos o miles **sin un solo error en el productor** — y con `acks=-1`:

```bash
node conciliar.js -1   # mata al líder igual que antes
# === CONCILIACIÓN (acks=-1) ===
# intentados=20000 confirmados=20000 en_el_log=20000
# PERDIDOS TRAS SER CONFIRMADOS: 0
```

**Qué observar:** con `acks=1` la pérdida es **probabilística**: solo caen los mensajes que el líder confirmó pero no había replicado al morir; el nuevo líder (un follower del ISR) no los tiene y el high watermark los descarta. Con `acks=0` ni siquiera hay confirmación que perder. Con `acks=all` + `min.insync.replicas=2` hay errores (timeouts durante la elección) pero **todo lo confirmado sobrevive**.

**Qué acabas de aprender:** "perder mensajes" en Kafka no es un bug, es un contrato que eliges con `acks`, y la forma honesta de medirlo es un contador de conciliación (confirmados vs. presentes en el log), como un job de auditoría real. Frase de entrevista: "con acks=1 medí ~20 mensajes perdidos por failover de líder en 20k; por eso en pagos usábamos acks=all, min.insync.replicas=2 e idempotencia, aceptando el coste de latencia".

---

## Ejercicio 3 — Provoca un rebalance loop y sal de él (20 min)

**Objetivo:** reproducir el incidente de consumo más común — el consumer que procesa tan lento que es expulsado del grupo una y otra vez, con **el lag que nunca baja** — y arreglarlo con heartbeats manuales.

Reutiliza el clúster del ejercicio 2. Carga trabajo:

```bash
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic tareas --partitions 2
for i in $(seq 1 200); do echo "tarea-$i"; done | docker exec -i kafka1 \
  /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic tareas
```

Crea `consumidor-lento.js` — nota los timeouts agresivos (en kafkajs, `rebalanceTimeout` cumple el papel de `max.poll.interval.ms` del cliente Java):

```js
const { Kafka } = require('kafkajs');
const consumer = new Kafka({ clientId: 'lento', brokers: ['localhost:19092'] }).consumer({
  groupId: 'workers',
  sessionTimeout: 10000,
  heartbeatInterval: 3000,
  rebalanceTimeout: 12000,   // <- "max.poll.interval" bajo: 12 s para reincorporarse
});
(async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: 'tareas', fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message }) => {
      console.log(`procesando ${message.value}...`);
      await new Promise(r => setTimeout(r, 30000)); // <- 30 s por tarea > rebalanceTimeout
      console.log(`  hecho ${message.value}`);
    },
  });
})();
```

```bash
node consumidor-lento.js &   # dos instancias del mismo grupo
node consumidor-lento.js &
watch -n 5 "docker exec kafka1 /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group workers"
```

**Qué observar:** en los logs de kafkajs se repite `The group is rebalancing, re-joining`. En el `--describe`, tres firmas del bucle:

```text
GROUP    TOPIC   PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG   CONSUMER-ID
workers  tareas  0          3               102             99    lento-...-a1b2   <- offset casi congelado
workers  tareas  1          2               98              96    lento-...-9f3c
```

1. **El lag no baja** aunque los procesos "trabajan": el offset nunca llega a commitearse y las mismas tareas se reprocesan tras cada expulsión.
2. **El `CONSUMER-ID` cambia** entre ejecuciones del `--describe`: cada rebalance genera miembros nuevos.
3. A ratos: `Warning: Consumer group 'workers' is rebalancing`.

**El arreglo** — `consumidor-sano.js` con procesamiento por lotes y heartbeat explícito:

```js
  await consumer.run({
    eachBatchAutoResolve: false,
    eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
      for (const message of batch.messages) {
        await procesarEnTrozos(message, heartbeat); // heartbeat() entre trozos
        resolveOffset(message.offset);              // commit incremental
        await heartbeat();                          // "sigo vivo" tras CADA mensaje
      }
    },
  });
```

Con `heartbeat()` tras cada unidad de trabajo, el coordinator sabe que el consumer vive aunque el lote tarde minutos, y el lag por fin baja. Alternativas que debes poder enumerar: subir `rebalanceTimeout`/`max.poll.interval.ms` (parche), reducir `max.poll.records` en clientes Java, o sacar el trabajo pesado fuera y commitear rápido.

**Qué acabas de aprender:** un rebalance loop se diagnostica con dos evidencias del `--describe`: lag estático + consumer-ids que rotan; la causa raíz casi siempre es procesamiento por poll que supera el plazo de reincorporación. Frase de entrevista: "consumir de Kafka es un contrato de liveness: si no haces poll o heartbeat a tiempo, el grupo te da por muerto aunque estés trabajando".

---

## Ejercicio 4 — Hot partition: genera skew, mídelo y arréglalo con clave compuesta (20 min)

**Objetivo:** crear una partición caliente con una clave dominante, **medir** el desbalance (offsets y lag por partición) y arreglarlo con una clave compuesta, verbalizando el trade-off de ordering.

```bash
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic eventos --partitions 6
```

Crea `skew.js`:

```js
const { Kafka } = require('kafkajs');
const MODO = process.argv[2] ?? 'sesgado'; // 'sesgado' | 'compuesto'
(async () => {
  const producer = new Kafka({ clientId: 'skew', brokers: ['localhost:19092'] }).producer();
  await producer.connect();
  for (let i = 0; i < 30000; i++) {
    // el 85% del tráfico es del tenant grande (el cliente enterprise de turno)
    const tenant = Math.random() < 0.85 ? 'tenant-mega' : `tenant-${i % 50}`;
    const key = MODO === 'compuesto' && tenant === 'tenant-mega'
      ? `${tenant}#${i % 6}`     // clave compuesta SOLO para el tenant caliente
      : tenant;
    await producer.send({ topic: 'eventos',
      messages: [{ key, value: JSON.stringify({ tenant, i }) }] });
  }
  await producer.disconnect();
})();
```

```bash
node skew.js sesgado
# ¿Dónde cayó el volumen? End-offsets por partición:
docker exec kafka1 /opt/kafka/bin/kafka-get-offsets.sh \
  --bootstrap-server localhost:9092 --topic eventos
```

```text
eventos:0:842
eventos:1:790
eventos:2:26034     <- hot partition: aquí hashea "tenant-mega"
eventos:3:811
...
```

Conéctale un grupo de 6 consumers lentos (reutiliza `consumidor-sano.js` apuntando a `eventos`, con ~5 ms de trabajo por mensaje) y mide el **lag por partición**:

```bash
docker exec kafka1 /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group workers-eventos
# TOPIC    PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# eventos  0          842             842             0
# eventos  2          3110            26034           22924  <- un consumer se come el 85%
# eventos  4          745             745             0
```

Cinco consumers ociosos y uno ahogado: **escalar horizontalmente no arregla nada**, porque la unidad de paralelismo es la partición, no el consumer. Repite con clave compuesta (borra y recrea el topic, luego `node skew.js compuesto`):

```text
eventos:0:5122
eventos:1:4980
eventos:2:5301
...               <- repartido: el tenant caliente ahora hashea en 6 sub-claves
```

**Qué observar:** el skew se mide en dos capas: `kafka-get-offsets.sh` dice dónde **entra** el volumen (problema de clave) y el lag por partición dónde **duele** (problema de consumo). El fix con `tenant#N` reparte, pero rompes el orden global por tenant: solo queda orden dentro de cada sub-clave. Mejor aún que `#N` aleatorio: `tenant#id-del-agregado` (p. ej. `tenant-mega#pedido-123`), que hereda el reparto **y** conserva el orden que de verdad importa.

**Qué acabas de aprender:** las hot partitions no se arreglan añadiendo consumers ni particiones (re-particionar ni re-hashea lo ya escrito): se arreglan en la clave. Anécdota lista: "detecté el skew comparando end-offsets por partición — una tenía 30x las demás; cambié la clave de `tenantId` a `tenantId+orderId`, conservando el único orden que el consumidor necesitaba".

---

## Ejercicio 5 — Outbox + dedupe end-to-end: sobrevive a un `kill -9` con cero duplicados efectivos (30 min)

**Objetivo:** montar el pipeline transaccional completo — outbox en Postgres → relay → Kafka → consumer idempotente —, matar el relay con `kill -9` en el peor momento, y verificar que **hay duplicados en el topic** pero **cero duplicados efectivos** en el destino.

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=lab -p 5432:5432 postgres:16-alpine
sleep 5
docker exec -i pg psql -U postgres <<'SQL'
CREATE TABLE pedidos (id text PRIMARY KEY, importe numeric NOT NULL);
CREATE TABLE outbox  (id bigserial PRIMARY KEY, event_id text UNIQUE NOT NULL,
                      payload jsonb NOT NULL, published_at timestamptz);
CREATE TABLE procesados (event_id text PRIMARY KEY);          -- lado consumidor
CREATE TABLE saldo (cuenta text PRIMARY KEY, total numeric NOT NULL DEFAULT 0);
INSERT INTO saldo VALUES ('ventas', 0);
SQL
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic pedidos-creados --partitions 1
```

`negocio.js` — escribe el pedido **y** el evento en la misma transacción (eso es outbox):

```js
const { Client } = require('pg');
const { randomUUID } = require('crypto');
(async () => {
  const db = new Client('postgres://postgres:lab@localhost:5432/postgres');
  await db.connect();
  for (let i = 0; i < 500; i++) {
    const id = randomUUID();
    await db.query('BEGIN');
    await db.query('INSERT INTO pedidos VALUES ($1, $2)', [id, 10]);
    await db.query('INSERT INTO outbox (event_id, payload) VALUES ($1, $2)',
      [id, JSON.stringify({ tipo: 'PedidoCreado', pedidoId: id, importe: 10 })]);
    await db.query('COMMIT');   // pedido y evento: atómicos o nada
  }
  await db.end();
})();
```

`relay.js` — publica y marca **después** (at-least-once a conciencia; el sueño artificial agranda la ventana para que el `kill -9` acierte):

```js
const { Client } = require('pg');
const { Kafka } = require('kafkajs');
(async () => {
  const db = new Client('postgres://postgres:lab@localhost:5432/postgres');
  await db.connect();
  const producer = new Kafka({ clientId: 'relay', brokers: ['localhost:19092'] }).producer();
  await producer.connect();
  for (;;) {
    const { rows } = await db.query(
      'SELECT id, event_id, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 10');
    if (!rows.length) { await new Promise(r => setTimeout(r, 500)); continue; }
    for (const r of rows) {
      await producer.send({ topic: 'pedidos-creados',
        messages: [{ key: r.event_id, value: JSON.stringify(r.payload) }] });
      await new Promise(res => setTimeout(res, 50));  // <- ventana de crash publicar↔marcar
      await db.query('UPDATE outbox SET published_at = now() WHERE id = $1', [r.id]);
    }
    console.log(`publicados hasta outbox.id=${rows.at(-1).id}`);
  }
})();
```

`consumidor-idempotente.js` — dedupe y efecto en **la misma transacción**:

```js
const { Client } = require('pg');
const { Kafka } = require('kafkajs');
(async () => {
  const db = new Client('postgres://postgres:lab@localhost:5432/postgres');
  await db.connect();
  const consumer = new Kafka({ clientId: 'apl', brokers: ['localhost:19092'] })
    .consumer({ groupId: 'aplicador' });
  await consumer.connect();
  await consumer.subscribe({ topic: 'pedidos-creados', fromBeginning: true });
  let vistos = 0, duplicados = 0;
  await consumer.run({
    eachMessage: async ({ message }) => {
      const ev = JSON.parse(message.value.toString()); vistos++;
      await db.query('BEGIN');
      const ins = await db.query(
        'INSERT INTO procesados (event_id) VALUES ($1) ON CONFLICT DO NOTHING', [ev.pedidoId]);
      if (ins.rowCount === 0) { duplicados++; await db.query('ROLLBACK'); }
      else {
        await db.query('UPDATE saldo SET total = total + $1 WHERE cuenta = $2', [ev.importe, 'ventas']);
        await db.query('COMMIT');
      }
      console.log(`vistos=${vistos} duplicados_descartados=${duplicados}`);
    },
  });
})();
```

El experimento:

```bash
node negocio.js
node consumidor-idempotente.js &   # déjalo corriendo
node relay.js & RELAY_PID=$!
sleep 6                            # deja que publique unos cientos
kill -9 $RELAY_PID                 # muere ENTRE publicar y marcar, garantizado
node relay.js &                    # reinicia: re-publicará lo no marcado
sleep 15
```

**Qué observar** — la conciliación en tres números:

```bash
# 1) ¿Cuántos mensajes hay físicamente en el topic?
docker exec kafka1 /opt/kafka/bin/kafka-get-offsets.sh --bootstrap-server localhost:9092 --topic pedidos-creados
# pedidos-creados:0:509        <- ¡509! El relay re-publicó 9 tras el kill -9

# 2) ¿Cuántos efectos hubo?
docker exec -i pg psql -U postgres -c "SELECT (SELECT count(*) FROM outbox) eventos,
  (SELECT count(*) FROM procesados) aplicados, (SELECT total FROM saldo) saldo;"
#  eventos | aplicados | saldo
#      500 |       500 |  5000     <- 500 x 10: NI UN duplicado efectivo
```

Y el consumer lo confirma: `vistos=509 duplicados_descartados=9`. El topic tiene duplicados (at-least-once cumplido); el mundo, no (exactly-once **efectivo**, el único que existe end-to-end).

**Qué acabas de aprender:** exactly-once real son dos piezas en dos extremos: outbox (el evento se crea atómicamente con el dato: ni mentiras ni pérdidas) y dedupe transaccional en el consumidor (`event_id` y efecto commitean juntos). El `kill -9` es el test de fuego: si la conciliación cuadra, tu pipeline sobrevive a un OOMKill de Kubernetes. Los duplicados del topic no son un fallo — son el precio explícito de no perder nada; por eso el dedupe vive donde el efecto es irreversible.

---

## Ejercicio 6 — RabbitMQ: topic exchange, DLX con retry escalonado y el mensaje envenenado (25 min)

**Objetivo:** montar la topología de resiliencia canónica — topic exchange, cola quorum con límite de entregas, retries escalonados por TTL y parking lot — e inyectar un mensaje envenenado para verla actuar, siguiendo `x-delivery-count` en cada vuelta.

```bash
docker run -d --name rabbit -p 5672:5672 -p 15672:15672 rabbitmq:3-management
sleep 10   # UI en http://localhost:15672 (guest/guest)
```

`topologia.js` — declárala entera por código (idempotente):

```js
const amqp = require('amqplib');
(async () => {
  const ch = await (await amqp.connect('amqp://localhost')).createChannel();
  await ch.assertExchange('pedidos', 'topic', { durable: true });
  await ch.assertExchange('pedidos.dlx', 'topic', { durable: true });

  // Cola de trabajo: quorum + límite de entregas + DLX
  await ch.assertQueue('pedidos.procesar', { durable: true, arguments: {
    'x-queue-type': 'quorum',
    'x-delivery-limit': 3,                    // tras 3 redeliveries -> DLX
    'x-dead-letter-exchange': 'pedidos.dlx',
  }});
  await ch.bindQueue('pedidos.procesar', 'pedidos', 'pedido.*');

  // Retries escalonados: colas de espera con TTL que devuelven al exchange principal
  for (const [nombre, ttl] of [['retry.10s', 10000], ['retry.60s', 60000]]) {
    await ch.assertQueue(`pedidos.${nombre}`, { durable: true, arguments: {
      'x-message-ttl': ttl,
      'x-dead-letter-exchange': 'pedidos',   // al expirar, vuelve a la cola de trabajo
    }});
    await ch.bindQueue(`pedidos.${nombre}`, 'pedidos.dlx', `${nombre}.#`);
  }

  // Parking lot: lo que agotó el delivery-limit acaba aquí, para humanos
  await ch.assertQueue('pedidos.parking', { durable: true });
  await ch.bindQueue('pedidos.parking', 'pedidos.dlx', 'pedido.*');
  console.log('topología lista');
  process.exit(0);
})();
```

`worker.js` — distingue error transitorio (retry escalonado con contador propio) de veneno (nack y que el `x-delivery-limit` decida):

```js
const amqp = require('amqplib');
(async () => {
  const ch = await (await amqp.connect('amqp://localhost')).createChannel();
  ch.prefetch(1);
  await ch.consume('pedidos.procesar', (msg) => {
    const cuenta = msg.properties.headers['x-delivery-count'] ?? 0; // lo pone la quorum queue
    const intento = msg.properties.headers['x-intento'] ?? 0;
    let pedido;
    try { pedido = JSON.parse(msg.content.toString()); }
    catch { // VENENO: jamás parseará; el x-delivery-limit corta el bucle por nosotros
      console.log(`  [veneno] x-delivery-count=${cuenta} -> nack requeue`);
      return ch.nack(msg, false, true);
    }
    if (pedido.fallaTransitoria && intento < 2) {  // TRANSITORIO: retry escalonado
      const espera = intento === 0 ? 'retry.10s' : 'retry.60s';
      console.log(`pedido=${pedido.id} transitorio -> ${espera} (intento ${intento + 1})`);
      ch.publish('pedidos.dlx', `${espera}.pedido`, msg.content,
        { headers: { 'x-intento': intento + 1 } });
      return ch.ack(msg);
    }
    console.log(`pedido=${pedido.id ?? '?'} OK (intento=${intento}, delivery-count=${cuenta})`);
    ch.ack(msg);
  });
})();
```

Inyecta tráfico sano, uno transitorio y uno envenenado (`inyectar.js`):

```js
const amqp = require('amqplib');
(async () => {
  const ch = await (await amqp.connect('amqp://localhost')).createChannel();
  for (let i = 1; i <= 5; i++)
    ch.publish('pedidos', 'pedido.nuevo', Buffer.from(JSON.stringify({ id: i })));
  ch.publish('pedidos', 'pedido.nuevo', Buffer.from(JSON.stringify({ id: 99, fallaTransitoria: true })));
  ch.publish('pedidos', 'pedido.nuevo', Buffer.from('{esto no es json'));   // veneno
  setTimeout(() => process.exit(0), 500);
})();
```

```bash
node topologia.js && node worker.js &
node inyectar.js
```

**Qué observar:**

```text
pedido=1 OK (intento=0, delivery-count=0)
...
pedido=99 transitorio -> retry.10s (intento 1)
  [veneno] x-delivery-count=0 -> nack requeue
  [veneno] x-delivery-count=1 -> nack requeue
  [veneno] x-delivery-count=2 -> nack requeue
  [veneno] x-delivery-count=3 -> nack requeue    <- 4ª entrega: agotó el límite
pedido=99 OK (intento=1, delivery-count=0)        <- ~10 s después, vuelve del retry.10s
```

```bash
docker exec rabbit rabbitmqctl list_queues name messages type
# pedidos.procesar   0   quorum
# pedidos.parking    1   classic    <- el veneno acabó aquí, no en un bucle infinito
```

Fíjate en `x-delivery-count` creciendo entrega a entrega: es la memoria que las **quorum queues** tienen y las classic no — con una classic queue, ese `nack(requeue=true)` habría girado para siempre a miles de vueltas por segundo, comiéndose la CPU del broker (incidente clásico). En la UI, el pico de redeliveries del veneno se ve a simple vista.

**Qué acabas de aprender:** en RabbitMQ la resiliencia es **topología**, no código: TTL + DLX componen retries escalonados sin scheduler, `x-delivery-limit` convierte el veneno de incidente en una fila del parking lot, y `x-delivery-count` es tu evidencia forense. El matiz senior: transitorio y veneno se tratan distinto — backoff programado para uno, apartar rápido y sin reintentos ciegos para el otro.

---

## Ejercicio 7 — RabbitMQ: memory alarm, publisher bloqueado, y la salida elástica (20 min)

**Objetivo:** llevar al broker a su memory alarm, ver cómo **bloquea silenciosamente a todos los publishers** (el fallo que en producción parece "el sistema se colgó"), y arreglarlo con `max-length` + consumidores elásticos.

```bash
# Baja el watermark a algo ridículo para provocar la alarma sin esperar
docker exec rabbit rabbitmqctl set_vm_memory_high_watermark absolute "120MB"
```

`inundar.js` — publica sin consumidor y escucha el evento `blocked` de la conexión:

```js
const amqp = require('amqplib');
(async () => {
  const conn = await amqp.connect('amqp://localhost');
  conn.on('blocked', (reason) => console.log(`*** CONEXIÓN BLOQUEADA: ${reason} ***`));
  conn.on('unblocked', () => console.log('*** desbloqueada ***'));
  const ch = await conn.createConfirmChannel();
  await ch.assertQueue('embudo', { durable: true });
  const carga = Buffer.alloc(100 * 1024, 'x');   // 100 KB por mensaje
  for (let i = 0; ; i++) {
    ch.publish('', 'embudo', carga);
    if (i % 500 === 0) { await ch.waitForConfirms(); console.log(`publicados ${i}`); }
  }
})();
```

```bash
node inundar.js
```

**Qué observar** — el momento clave:

```text
publicados 2000
publicados 2500
*** CONEXIÓN BLOQUEADA: low on memory ***
              <- y aquí se queda. Ni error, ni excepción, ni timeout: SILENCIO.
```

El publisher no recibe un error: el broker deja de leer de su socket (TCP backpressure) y manda `connection.blocked`. Si tu código no escucha ese evento, tu servicio "se cuelga publicando" y nadie sabe por qué. Confírmalo desde el broker:

```bash
docker exec rabbit rabbitmqctl list_connections name state
# 172.17.0.1:51234 -> ... blocked        <- ahí está
docker exec rabbit rabbitmqctl list_queues name messages message_bytes
# embudo   2612   267468800
```

**El arreglo, en dos frentes.** Primero, que el broker nunca llegue ahí — límite explícito con overflow definido:

```bash
docker exec rabbit rabbitmqctl set_policy limite-embudo "^embudo$" \
  '{"max-length":1000,"overflow":"reject-publish"}' --apply-to queues
```

Con `reject-publish` el publisher (en confirm channel) recibe un **nack explícito** en vez de un bloqueo silencioso: el fallo se vuelve visible y manejable. La alternativa `drop-head` descarta lo más viejo — válida para telemetría, inaceptable para pedidos: elegir es parte de la respuesta.

Segundo, drena con consumidores elásticos — escalar consumers según profundidad de cola:

```bash
# drenar.js: consume 'embudo' y hace ack, nada más
for i in 1 2 3 4; do node drenar.js & done      # "autoescalado" manual
watch -n 2 'docker exec rabbit rabbitmqctl list_queues name messages'
# embudo 2612 -> 18XX -> 9XX -> 0    ... y en inundar.js: *** desbloqueada ***
docker exec rabbit rabbitmqctl set_vm_memory_high_watermark 0.4   # restaura el default
```

**Qué acabas de aprender:** cuando una cola de RabbitMQ crece sin consumidores, el broker no degrada — **bloquea a todos los publishers de golpe**, y el síntoma aguas arriba es un servicio colgado sin errores. Tres defensas: (1) escuchar `connection.blocked` y alertar sobre la memory alarm, (2) `max-length` + `overflow` elegido a conciencia por cola, (3) autoscaling de consumidores por profundidad (en Kubernetes: KEDA). La comparación que brilla en la entrevista: Kafka no tiene este problema porque su buffer es el disco y el lag; RabbitMQ te obliga a diseñar el desbordamiento.

---

## Ejercicio 8 — Mini caos final: incidente cronometrado de 30 minutos (30 min)

**Objetivo:** diagnosticar bajo presión, con método, un fallo que no elegiste: romper una cosa **al azar** y resolverla con el ciclo hipótesis → evidencia → fix, cronometrado.

**Preparación (5 min).** Levanta el escenario completo: clúster Kafka de 3 (ej. 2), pipeline outbox (ej. 5) corriendo en bucle, RabbitMQ con la topología del ej. 6 y un worker consumiendo. Ese es "tu sistema en producción". Deja que el azar elija tu incidente:

```bash
cat > averias.txt <<'EOF'
docker kill --signal=SIGKILL kafka2
docker pause kafka3
docker exec rabbit rabbitmqctl set_vm_memory_high_watermark absolute "100MB"
node inyectar.js && node inyectar.js && node inyectar.js  # ráfaga con venenos
pkill -f consumidor-idempotente.js
docker network disconnect $(docker network ls -q --filter name=lab) kafka1
EOF
shuf -n1 averias.txt > /tmp/averia.sh
bash /tmp/averia.sh > /dev/null 2>&1   # ¡NO mires /tmp/averia.sh todavía!
date +%T   # arranca el reloj: tienes 30 minutos
```

(En pareja, mejor: que la otra persona rompa algo de la lista, o algo peor.)

**El método — rellénalo por escrito mientras diagnosticas** (es tu timeline de postmortem):

```text
T+0   SÍNTOMA observado (no causa): ¿qué métrica/log lo delata?
T+?   HIPÓTESIS 1: ____  →  EVIDENCIA a favor/en contra: comando + salida
T+?   HIPÓTESIS 2: ____  →  EVIDENCIA: ...
T+?   CAUSA confirmada (con la evidencia que la demuestra)
T+?   MITIGACIÓN (parar el sangrado) → FIX → verificación: ¿qué número volvió a la normalidad?
```

Tu caja de herramientas de triage — en este orden, de síntoma a causa:

```bash
docker ps -a                                                  # ¿está todo vivo?
docker exec kafka1 /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --all-groups   # lag y miembros
docker exec kafka1 /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --describe --under-replicated-partitions
docker exec rabbit rabbitmqctl list_queues name messages consumers
docker exec rabbit rabbitmqctl list_connections name state
docker exec -i pg psql -U postgres -c "SELECT count(*) FROM outbox WHERE published_at IS NULL;"
docker logs --since 5m kafka1 2>&1 | tail -30                 # y el resto de contenedores
```

Solo al terminar (o al agotar el reloj), mira `/tmp/averia.sh` y compara con tu diagnóstico.

**Rúbrica de autoevaluación** (puntúate con honestidad; repite otro día con otra avería):

| Criterio | 0 puntos | 1 punto | 2 puntos |
|---|---|---|---|
| Detección | Miré la avería antes de tiempo | Síntoma en >10 min | Síntoma en <5 min, con una métrica concreta |
| Método | Toqué cosas al azar | Hipótesis mentales, sin evidencia escrita | Cada hipótesis con su comando y su salida |
| Mitigación vs. fix | Solo "reinicié todo" | Fix sin mitigar antes | Primero parar el sangrado, luego causa raíz |
| Verificación | "Parece que va" | Comprobé un indicador | Conciliación numérica (lag=0, saldo cuadra) |
| Narrativa | No sabría contarlo | Lo cuento con las notas delante | En 90 s: síntoma→evidencia→causa→fix→prevención |

**8–10 puntos:** tienes una anécdota de incidente lista — escríbela hoy en 5 líneas con el formato de la última fila. **<8:** repite con otra línea de `averias.txt`; el método se entrena, no se lee.

**Qué acabas de aprender:** los incidentes se resuelven con un bucle disciplinado de hipótesis y evidencia, no con intuición — y distinguir mitigar (parar el sangrado) de arreglar (causa raíz) es exactamente lo que busca el entrevistador cuando pide "cuéntame un incidente". Ahora tienes uno, cronometrado y documentado, que viviste tú.

---

## ✅ Autoevaluación

Responde en voz alta, como se lo contarías a un entrevistador (90 segundos, formato síntoma → evidencia → causa → fix):

1. **Ejercicio 2:** ¿por qué con `acks=1` se perdieron mensajes *confirmados* al matar al líder, qué papel jugó el high watermark, y por qué con `acks=all` + `min.insync.replicas=2` la conciliación dio cero?
2. **Ejercicio 3:** ¿qué dos evidencias del `--describe` delataron el rebalance loop, cuál era la causa raíz, y por qué `heartbeat()` por mensaje lo arregla mientras que subir el timeout solo lo esconde?
3. **Ejercicio 4:** ¿cómo detectaste la hot partition con dos medidas distintas (entrada y consumo), por qué añadir consumers no servía, y qué trade-off de ordering aceptaste con la clave compuesta?
4. **Ejercicio 5:** ¿por qué el topic acabó con 509 mensajes pero el saldo cuadró exacto? ¿Dónde vive cada garantía (outbox, relay at-least-once, dedupe transaccional) y por qué el `kill -9` no pudo romper ninguna?
5. **Ejercicio 6:** ¿cómo trató la topología (TTL + DLX + `x-delivery-limit`) al error transitorio frente al mensaje envenenado, y qué habría pasado con el veneno en una classic queue con `nack(requeue=true)`?
6. **Ejercicio 7:** narra el publisher "colgado": qué hace el broker durante una memory alarm, por qué el publisher no ve ningún error, y tus tres defensas.

## 🎯 Preguntas del banco que ya puedes responder

Con este laboratorio cierras, con evidencia de primera mano, los tres bloques del banco:

- Todo el bloque de Kafka de [`mensajeria-eventos/02-kafka.md`](../../mensajeria-eventos/02-kafka.md) — acks/ISR, rebalances, particionado y skew los has *ejecutado*, no solo leído.
- El bloque de RabbitMQ de [`mensajeria-eventos/03-rabbitmq-y-otros-brokers.md`](../../mensajeria-eventos/03-rabbitmq-y-otros-brokers.md) — topologías, DLX, quorum queues, alarms y flow control.
- Los casos e incidentes de [`mensajeria-eventos/04-casos-y-problemas.md`](../../mensajeria-eventos/04-casos-y-problemas.md) — pérdida, duplicados, poison messages, hot partitions y el incidente del ejercicio 8.

## Para profundizar

- [Kafka Design](https://kafka.apache.org/documentation/#design) — replicación y high watermark: lo que mediste en el ejercicio 2, formalizado.
- [RabbitMQ: Memory Alarms](https://www.rabbitmq.com/docs/memory) y [Quorum Queues](https://www.rabbitmq.com/docs/quorum-queues) — la base de los ejercicios 6 y 7.
- Martin Kleppmann, *Designing Data-Intensive Applications*, cap. 11 — el marco conceptual del laboratorio.
- [Jepsen: Kafka](https://aphyr.com/posts/293-jepsen-kafka) — el análisis clásico de pérdida con acks=1; compáralo con tu contador de conciliación.
- [KIP-848](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848) — cómo cambia el protocolo de rebalance que sufriste en el ejercicio 3.

---

**Anterior:** [Módulo 4](04-patrones-event-driven.md) · **Volver al curso:** [Curso 10](README.md)
