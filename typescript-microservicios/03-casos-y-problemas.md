# Casos y Problemas Reales — Entrevista Senior

Colección de casos de producción típicos en microservicios Node.js/TypeScript: síntomas, diagnóstico paso a paso, herramientas, solución con código y prevención. Pensados para responder como lo haría un ingeniero senior con horas de guardia encima.

## 1. Memory leak: el heap crece hasta OOM

**Categoría:** Node.js internals / Observabilidad · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Un heap que crece de forma monótona hasta el OOM killer casi siempre es retención accidental: listeners acumulados, closures que capturan objetos grandes, caches sin límite o Maps que nunca se limpian. Lo confirmo con `process.memoryUsage()` y métricas de heap en Prometheus, y lo diagnostico comparando heap snapshots (Chrome DevTools o `v8.writeHeapSnapshot`) tras forzar carga, mirando el *retained size* de los objetos que crecen entre snapshots. La solución suele ser liberar referencias (removeListener, `WeakMap`, cache con TTL/LRU) y la prevención es alertar sobre tendencia de heap y hacer soak tests.

### 📖 Respuesta detallada

**Escenario.** Un servicio de checkout en Kubernetes se reinicia cada 6–8 horas con `OOMKilled` (exit code 137). La gráfica de `container_memory_working_set_bytes` muestra una pendiente ascendente constante, sin el patrón "sierra" sano del GC: sube, nunca baja. `process.memoryUsage().heapUsed` (expuesto vía Prometheus) confirma que es heap de V8 y no memoria nativa (si `rss` creciera pero `heapUsed` no, sospecharía de Buffers, addons nativos o `external`). Los logs no muestran errores hasta el `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`.

**Diagnóstico paso a paso.**
1. *Hipótesis 1 — cache sin límite:* busco Maps/objetos usados como cache in-memory. Es la causa más frecuente.
2. *Hipótesis 2 — listeners acumulados:* si los logs muestran `MaxListenersExceededWarning`, es casi seguro un `on()` dentro de un handler de request que nunca hace `off()`.
3. *Hipótesis 3 — closures/promesas retenidas:* callbacks registrados en objetos long-lived (sockets, colas) que capturan el contexto completo del request (body, usuario, buffers).
4. Reproduzco en staging con carga sintética (autocannon), arranco con `node --inspect` y tomo **tres heap snapshots** en Chrome DevTools: baseline, tras 5 minutos de carga, tras 10. Uso la vista *Comparison* entre snapshot 2 y 3: ordeno por *#Delta* y *Retained Size*. Veo 40.000 instancias nuevas de `EventListener` y strings gigantes retenidos por un `Map`. El *retainer tree* me dice exactamente qué referencia mantiene vivo cada objeto — ese es el dato clave, no el *shallow size*.
5. En producción, si no puedo adjuntar el inspector, uso `v8.writeHeapSnapshot()` bajo un endpoint administrativo protegido, o `heapdump`/`clinic heapprofiler` en un pod canario.

**Herramientas.** `process.memoryUsage()` y `v8.getHeapStatistics()` en métricas; Chrome DevTools (Comparison view, retained size, retainers); `clinic heapprofiler`; `node --inspect`; alertas Prometheus sobre pendiente de heap (`deriv()`/`predict_linear()`).

**Solución.** Ejemplo real: un cache de resultados por usuario implementado con un `Map` global y un listener por request:

```typescript
// ❌ Antes: crece sin límite y registra listeners que nunca se liberan
const cache = new Map<string, UserProfile>();
emitter.on('invalidate', (id) => cache.delete(id)); // dentro del handler → leak

// ✅ Después: LRU con TTL acotado y listener registrado una sola vez
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, UserProfile>({
  max: 10_000,          // límite duro de entradas
  ttl: 5 * 60_000,      // 5 min
  updateAgeOnGet: true,
});

// Registro único a nivel de módulo, no por request
emitter.on('invalidate', (id: string) => cache.delete(id));

// Para asociar metadatos a objetos con ciclo de vida ajeno, WeakMap:
const requestMeta = new WeakMap<Request, { startedAt: number }>();
// Cuando el Request es recolectado, la entrada desaparece sola.
```

Si el listener debe vivir lo que dura una operación, uso `once()` o `AbortSignal`:

```typescript
const ac = new AbortController();
emitter.on('data', onData, { signal: ac.signal } as never); // Node >= 20 en EventTarget
// ... al terminar:
ac.abort(); // desregistra todo lo asociado al signal
```

**Prevención.** Cache siempre acotado (LRU + TTL) o externalizado a Redis; lint rule/PR checklist para `on()` sin `off()`; soak test de 2h en CI de performance; alerta `predict_linear(heap_used[30m], 3600) > limit`; dimensionar `--max-old-space-size` coherente con el limit del contenedor (~75–80%).

**Qué espera oír el entrevistador:** que distingues heap de RSS/memoria nativa, que sabes comparar snapshots y leer *retained size* y retainers (no solo "usaría un profiler"), causas típicas concretas (listeners, closures, caches), y prevención operativa con métricas y límites.

## 2. Event loop bloqueado: p99 disparado por código CPU-bound

**Categoría:** Performance / Event loop · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Si el p99 se dispara mientras el p50 sigue razonable y la CPU del pod está al 100% en un solo core, sospecho de bloqueo del event loop: una petición CPU-bound (serialización de payloads enormes, regex catastrófica, cripto síncrona) congela a *todas* las demás. Lo confirmo midiendo event loop delay (`perf_hooks.monitorEventLoopDelay`) y localizo el código con un flamegraph (`clinic flame` o 0x). La solución es sacar el trabajo del loop: streaming/chunking, `worker_threads`, o rediseñar el algoritmo. Prevención: métrica de event loop lag con alerta y presupuesto de payload.

### 📖 Respuesta detallada

**Escenario.** Un API gateway interno muestra p50 = 12 ms estable pero p99 que salta de 40 ms a 3–8 s en ráfagas. Grafana muestra correlación con un endpoint `/export` que devuelve JSON de ~80 MB. La CPU del contenedor clava un core al 100% durante los picos; el resto de endpoints, que no comparten nada con `/export`, también se degradan — señal inequívoca de que el problema es *compartido*: el event loop. Los health checks empiezan a fallar por timeout y Kubernetes reinicia pods sanos, amplificando el incidente.

**Diagnóstico paso a paso.**
1. *Hipótesis 1 — event loop bloqueado:* la degradación transversal de endpoints no relacionados apunta aquí primero. Añado (o consulto) la métrica de event loop delay:

```typescript
import { monitorEventLoopDelay } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  metrics.gauge('nodejs_eventloop_delay_p99_ms', h.percentile(99) / 1e6);
  metrics.gauge('nodejs_eventloop_delay_max_ms', h.max / 1e6);
  h.reset();
}, 10_000).unref();
```

   El p99 del delay pasa de 1 ms a 2.500 ms durante los picos: confirmado.
2. *Hipótesis 2 — ¿qué código?* Reproduzco en staging y genero un flamegraph con `clinic flame -- node dist/main.js` (o `0x`). El 85% del tiempo on-CPU está en `JSON.stringify` y en una regex de sanitización aplicada al payload completo. `clinic doctor` ya habría señalado "event loop blocked" como diagnóstico automático.
3. *Hipótesis 3 (descartada) — GC:* `--trace-gc` no muestra pausas relevantes; el sawtooth es normal.

**Herramientas.** `perf_hooks.monitorEventLoopDelay`, `clinic doctor` (diagnóstico general), `clinic flame`/`0x` (flamegraphs on-CPU), `node --inspect` + tab Performance de DevTools para profiling puntual, métricas Prometheus/OTel (`nodejs_eventloop_lag_seconds` del client por defecto).

**Solución.** Dos frentes: no materializar 80 MB en un solo tick, y aislar lo CPU-bound.

```typescript
// ✅ 1) Serializar en streaming: nunca JSON.stringify de todo el dataset
import { Readable, pipeline } from 'node:stream';

app.get('/export', async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const cursor = db.items.find().batchSize(500).stream(); // cursor de DB
  async function* toJson(source: AsyncIterable<Item>) {
    yield '[';
    let first = true;
    for await (const item of source) {
      yield (first ? '' : ',') + JSON.stringify(item); // objetos pequeños
      first = false;
    }
    yield ']';
  }
  pipeline(Readable.from(toJson(cursor)), res, (err) => {
    if (err) req.log.error({ err }, 'export failed');
  });
});

// ✅ 2) CPU-bound real (compresión, cripto, parsing pesado) → worker_threads
import Piscina from 'piscina';
const pool = new Piscina({ filename: new URL('./worker.js', import.meta.url).href });
const result = await pool.run({ payload }, { name: 'sanitize' });
```

Además: reemplazo la regex vulnerable (backtracking catastrófico) por un parser lineal, y pongo límite de tamaño de payload y paginación obligatoria en el contrato del endpoint.

**Prevención.** Alerta sobre event loop lag (> 100 ms p99); presupuesto de payload en el API design review; regla mental "nada síncrono > 10 ms en el request path"; tests de carga que midan p99 y no solo throughput; health check que incluya el lag para que el readiness saque al pod de rotación *antes* de que arrastre tráfico.

**Qué espera oír el entrevistador:** el razonamiento "p99 alto + degradación transversal = event loop", la medición con `monitorEventLoopDelay`, flamegraphs para localizar (no adivinar), y soluciones idiomáticas: streaming, workers, y entender que un solo core al 100% es la firma de Node single-threaded.

## 3. OOM procesando archivos grandes: readFile vs streams

**Categoría:** Streams / Backpressure · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Un servicio que muere con OOM al procesar archivos grandes casi siempre está materializando el archivo entero en memoria (`fs.readFile`, `Buffer.concat`, `await request.body`) en lugar de procesarlo por chunks. La solución es `stream.pipeline` con transformaciones en streaming y respeto del backpressure, y para subir a S3, multipart upload por streaming (`@aws-sdk/lib-storage`). Con streams, la memoria se mantiene plana (~decenas de MB) independientemente del tamaño del archivo. Prevención: límites de tamaño, tests con archivos grandes y prohibir `readFile` en rutas de ficheros de usuario.

### 📖 Respuesta detallada

**Escenario.** Un microservicio de ingesta acepta CSVs subidos por clientes, los transforma y los sube a S3. Funciona meses hasta que un cliente sube un CSV de 2,3 GB: el pod (limit 1 GiB) muere `OOMKilled` en segundos. La gráfica de memoria es un escalón vertical, no una pendiente — no es un leak, es una asignación puntual gigante. En los logs, la última línea antes del crash es "processing upload…". Con varios archivos medianos concurrentes (4 × 300 MB) también muere: la memoria pico es la *suma* de los archivos en vuelo.

**Diagnóstico paso a paso.**
1. *Hipótesis 1 — materialización completa:* busco `fs.readFile`, `Buffer.concat`, librerías de upload que bufferizan (multer en modo memoria) o `csv.parse(wholeString)`. Bingo: `const data = await fs.promises.readFile(tmpPath)` seguido de un split por líneas.
2. *Hipótesis 2 — streams mal usados sin backpressure:* si ya hubiera streams, revisaría `write()` ignorando el retorno `false`, o `data` handlers que empujan a un destino lento sin `pause()`. Eso también acumula en el buffer interno del Writable.
3. Confirmo con `process.memoryUsage()` logueado alrededor del procesamiento y, en local, `clinic doctor` que marca el pico de RSS. Un heap snapshot mostraría un `ArrayBuffer`/string de cientos de MB con un solo retainer.

**Herramientas.** `process.memoryUsage()` (mirar `rss` y `external`, porque los Buffers viven fuera del heap JS), `clinic doctor`, heap snapshot para identificar el buffer gigante, métricas de memoria del contenedor.

**Solución.** Pipeline completo en streaming con backpressure automático de extremo a extremo:

```typescript
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createReadStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { parse } from 'csv-parse';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({});

export async function ingest(filePath: string, key: string): Promise<void> {
  const normalize = new Transform({
    objectMode: true,
    transform(record: string[], _enc, cb) {
      try {
        cb(null, JSON.stringify(mapToDomain(record)) + '\n');
      } catch (err) {
        cb(err as Error);
      }
    },
  });

  const body = createReadStream(filePath, { highWaterMark: 64 * 1024 });

  const upload = new Upload({
    client: s3,
    params: { Bucket: 'ingest-bucket', Key: key, Body: body
      .pipe(parse({ relaxQuotes: true }))
      .pipe(normalize)
      .pipe(createGzip()) },
    queueSize: 4,            // partes concurrentes del multipart
    partSize: 8 * 1024 * 1024,
  });

  await upload.done(); // multipart streaming: memoria acotada a queueSize × partSize
}
```

Puntos clave que menciono en voz alta: `pipeline`/`pipe` propagan backpressure (el reader se pausa cuando el consumidor va lento) y `pipeline` destruye todos los streams ante error, evitando fds y memoria huérfanos; `highWaterMark` controla el buffer por etapa; `Upload` de `lib-storage` hace multipart sin materializar el objeto. Para la subida HTTP de entrada, uso `busboy`/multer en modo streaming directo a disco o a la pipeline, jamás a memoria. La memoria pico pasa de "tamaño del archivo" a ~`queueSize × partSize + buffers` ≈ 40 MB, constante.

**Prevención.** Límite explícito de `content-length` y validación temprana; semáforo de concurrencia de ingestas por pod (p. ej. `p-limit`); prohibición en code review de `readFile` para contenido de usuario; test de integración con un archivo sintético de varios GB (generado en streaming, claro); alerta de RSS cercano al limit del contenedor.

**Qué espera oír el entrevistador:** que lees la forma de la gráfica (escalón vs pendiente), la diferencia buffer-todo vs streaming, qué es backpressure y cómo `pipeline` lo maneja y limpia recursos en errores, y el detalle de S3 multipart streaming con memoria acotada y configurable.

## 4. Unhandled promise rejection tumbando pods en cascada

**Categoría:** Async / Resiliencia · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Desde Node 15, un `unhandledRejection` mata el proceso por defecto. Una promesa huérfana (fire-and-forget, `map` sin `await`, `.then` sin `.catch`) que falla bajo cierta condición tumba el pod; Kubernetes lo reinicia, el tráfico se concentra en los pods restantes, disparan la misma condición y entran todos en restart loop (CrashLoopBackOff en cascada). El diagnóstico es leer el stack del rejection en los logs de crash y buscar promesas no esperadas. La solución: no dejar promesas sin dueño, `Promise.allSettled` donde aplique, wrapper de fire-and-forget con catch, y un handler global que loguee con contexto antes de decidir la política de salida.

### 📖 Respuesta detallada

**Escenario.** A las 03:12, el deployment de notificaciones pasa de 6/6 pods Ready a un ciclo de reinicios. Los logs muestran, justo antes de cada muerte: `UnhandledPromiseRejection: ... TypeError: Cannot read properties of undefined (reading 'email')` con un stack que apunta a un helper de auditoría. El patrón temporal es revelador: muere un pod, el HPA no reacciona a tiempo, los 5 restantes absorben su tráfico, procesan el mismo tipo de mensaje "envenenado" y van cayendo — cascada clásica. `kubectl get pods` muestra `CrashLoopBackOff` con backoff creciente, lo que reduce capacidad aún más.

**Diagnóstico paso a paso.**
1. *Identificar el tipo de crash:* el exit code es 1, no 137 (OOM), y la última línea es el rejection. Node moderno (`--unhandled-rejections=throw` por defecto desde v15) convierte el rejection en excepción fatal.
2. *Localizar la promesa huérfana:* el stack señala `audit.log(...)`. Reviso el código: `audit.log()` es async y se llama sin `await` ni `.catch()` — fire-and-forget intencional "para no añadir latencia". También encuentro el otro clásico: `items.map(async (i) => process(i))` sin `Promise.all`, que crea N promesas huérfanas.
3. *¿Por qué ahora?* Un productor empezó a emitir eventos sin `user` (deploy de otro equipo esa noche). El mensaje envenenado además vuelve a entregarse tras el crash (at-least-once), realimentando el loop.
4. Reproduzco en local con el payload del mensaje y `node --trace-uncaught` para confirmar el origen exacto.

**Herramientas.** Logs estructurados del crash (stack del rejection), `process.on('unhandledRejection')` con logging enriquecido, eventos de Kubernetes (`kubectl describe pod`, razones de restart), métricas de restarts (`kube_pod_container_status_restarts_total` en Prometheus), DLQ para inspeccionar el mensaje envenenado, ESLint como herramienta de detección estática.

**Solución.**

```typescript
// ✅ 1) Fire-and-forget explícito y seguro: la promesa siempre tiene dueño
export function fireAndForget(task: () => Promise<unknown>, ctx: Record<string, unknown> = {}): void {
  task().catch((err) => logger.error({ err, ...ctx }, 'background task failed'));
}
fireAndForget(() => audit.log(event), { eventId: event.id });

// ✅ 2) map async siempre agregado; allSettled si los fallos parciales son tolerables
const results = await Promise.allSettled(items.map((i) => processItem(i)));
for (const r of results) {
  if (r.status === 'rejected') logger.warn({ err: r.reason }, 'item failed');
}

// ✅ 3) Handler global: observabilidad + política explícita (no rescatar y seguir a ciegas)
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection — shutting down gracefully');
  // dejar de aceptar trabajo, flush de telemetría, luego salir
  shutdown().finally(() => process.exit(1));
});

// ✅ 4) El consumidor no debe crashear por un mensaje envenenado: validar + DLQ
async function handleMessage(msg: QueueMessage): Promise<void> {
  try {
    const event = EventSchema.parse(JSON.parse(msg.value)); // Zod en la frontera
    await notify(event);
    await msg.ack();
  } catch (err) {
    logger.error({ err, offset: msg.offset }, 'poison message -> DLQ');
    await deadLetter.publish(msg);
    await msg.ack(); // no reentregar infinitamente
  }
}
```

Matiz senior: *no* silencio los rejections globalmente para "estabilizar"; tras un error desconocido el proceso puede quedar en estado inconsistente, así que el crash controlado + supervisor (K8s) es correcto como último recurso. Lo que arreglo es (a) que no existan promesas sin dueño y (b) que un dato inválido sea un error de negocio manejado, no un crash.

**Prevención.** ESLint `@typescript-eslint/no-floating-promises` y `no-misused-promises` en modo error (esto se atrapa en CI); validación con Zod en todas las fronteras de entrada; DLQ y contador de mensajes envenenados; PodDisruptionBudget y HPA calibrados para amortiguar la pérdida de un pod; alerta sobre tasa de restarts; contract tests entre productores y consumidores para que un cambio de schema no llegue a producción.

**Qué espera oír el entrevistador:** que sabes que Node moderno muere ante rejections no manejadas y por qué la cascada ocurre (redistribución de carga + mensaje envenenado reentregado), la regla "toda promesa tiene dueño", `no-floating-promises` como guardarraíl, y la postura matizada de crash-fast con graceful shutdown en vez de tragarse errores.

## 5. Fuga de conexiones a Postgres: pool agotado

**Categoría:** Bases de datos / Recursos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Errores intermitentes de `timeout exceeded when trying to connect` con la DB sana indican pool agotado del lado del servicio: clientes tomados con `pool.connect()` y no liberados en algún camino de error, o transacciones que quedan abiertas (`idle in transaction`). Lo confirmo con las métricas del pool (total/idle/waiting) y con `pg_stat_activity`. La solución: `release()` en `finally` — o mejor, helpers `pool.query`/`withTransaction` que encapsulan el ciclo de vida —, timeouts de statement y de transacción, y PgBouncer para multiplexar conexiones. Prevención: exponer métricas del pool y alertar sobre `waiting` sostenido.

### 📖 Respuesta detallada

**Escenario.** Un servicio de pedidos empieza a devolver 500 intermitentes; el log muestra `Error: timeout exceeded when trying to connect` (pg-pool, `connectionTimeoutMillis`). CPU y latencia de Postgres normales. La métrica del pool muestra `total=20, idle=0, waiting=35` sostenido: las 20 conexiones están tomadas y nadie las devuelve. En Postgres, `SELECT state, count(*) FROM pg_stat_activity GROUP BY 1` revela 14 conexiones `idle in transaction` con `xact_start` de hace 40 minutos — transacciones colgadas que, además, bloquean vacuum y generan bloat.

**Diagnóstico paso a paso.**
1. *Hipótesis 1 — leak de clientes:* busco patrones `const client = await pool.connect()` donde el `release()` no está en `finally`. Cualquier `throw` entre `connect` y `release` fuga el cliente para siempre.
2. *Hipótesis 2 — transacción sin commit/rollback:* un `BEGIN` cuyo camino de error hace `return` temprano sin `ROLLBACK` deja la conexión `idle in transaction`. Con `idle_in_transaction_session_timeout` en 0 (default), queda así indefinidamente.
3. *Hipótesis 3 — pool infradimensionado:* descartable aquí porque `waiting` crece sin recuperarse jamás; un pool corto se recupera al bajar el tráfico.
4. Cruzo `pg_stat_activity.query` (última query de esas conexiones) con el código: todas terminan en el mismo repositorio que hace transacciones manuales. Ahí está el bug.

**Herramientas.** Métricas del pool (`pool.totalCount`, `pool.idleCount`, `pool.waitingCount` exportadas a Prometheus), `pg_stat_activity` (estado, `xact_start`, `wait_event`), logs de Postgres con `log_min_duration_statement`, trazas OTel con spans de DB para ver dónde se detiene el flujo de un request.

**Solución.**

```typescript
import { Pool, PoolClient } from 'pg';

export const pool = new Pool({
  max: 20,
  connectionTimeoutMillis: 2_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 5_000,                    // ninguna query cuelga el cliente
  idle_in_transaction_session_timeout: 10_000, // Postgres mata tx zombis
});

// ✅ Regla 1: para queries sueltas, pool.query() — nunca tomar cliente manualmente
const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);

// ✅ Regla 2: transacciones solo a través de un helper que garantiza el ciclo de vida
export async function withTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined); // no enmascarar el error original
    throw err;
  } finally {
    client.release(); // SIEMPRE, pase lo que pase
  }
}

await withTransaction(async (tx) => {
  await tx.query('UPDATE stock SET qty = qty - 1 WHERE sku = $1 AND qty > 0', [sku]);
  await tx.query('INSERT INTO order_lines (order_id, sku) VALUES ($1, $2)', [orderId, sku]);
});
```

Sobre **PgBouncer**: con decenas de réplicas, `max` por pod × pods puede superar `max_connections` de Postgres. PgBouncer en `transaction pooling` multiplexa miles de conexiones de cliente sobre pocas de servidor; a cambio hay que evitar estado de sesión (prepared statements con nombre, `SET` de sesión, advisory locks de sesión) o configurar el driver/ORM en consecuencia (p. ej. deshabilitar prepared statements nombrados).

**Prevención.** Helper de transacción único en el codebase (prohibido `BEGIN` manual en code review); métricas del pool con alerta en `waiting > 0` sostenido más de N segundos; `statement_timeout` e `idle_in_transaction_session_timeout` como defaults de plataforma; test que inyecta errores entre `connect` y `release` para verificar liberación; dimensionado documentado: pools pequeños por pod (10–20) + PgBouncer delante.

**Qué espera oír el entrevistador:** el razonamiento pool-side vs DB-side, `pg_stat_activity` e `idle in transaction` como evidencia concreta, `release()` en `finally` encapsulado en helpers, timeouts en capas (connect, statement, tx) y el trade-off real de PgBouncer en transaction pooling.

## 6. Cola con lag creciente: consumidores que no dan abasto

**Categoría:** Mensajería / Kafka / BullMQ · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Consumer lag que crece linealmente significa que el throughput de consumo es menor que el de producción; antes de tocar nada, hago la aritmética: msg/s producidos vs consumidos y latencia por mensaje. Causas típicas: procesamiento secuencial con I/O lenta, particiones insuficientes (en Kafka el paralelismo tiene techo = nº de particiones), rebalanceos por exceder `max.poll.interval`, o un downstream degradado. Soluciones: concurrencia por clave/partición, batching hacia el downstream, más particiones/workers y caché. Prevención: alertas de lag por tendencia y tests de throughput del consumer.

### 📖 Respuesta detallada

**Escenario.** El dashboard muestra `kafka_consumergroup_lag` del grupo `billing-consumer` subiendo de 2k a 1,4 M en 6 horas, con pendiente constante. Producción: ~800 msg/s; consumo: ~450 msg/s. Los eventos de facturación llegan con horas de retraso (impacto de negocio directo). En los logs del consumer aparecen periódicamente eventos de `Rebalancing` y warnings de heartbeat. Cada mensaje hace 2 llamadas HTTP a un servicio de impuestos con p50 de 120 ms.

**Diagnóstico paso a paso.**
1. *Cuantificar el techo actual:* procesamiento secuencial ⇒ throughput por partición ≈ 1/latencia_por_mensaje. Con ~240 ms de I/O por mensaje, cada partición da ~4 msg/s; con 6 particiones, ~25 msg/s totales. Las cuentas no salen ni de lejos frente a 800 msg/s: el sistema estaba condenado desde el diseño.
2. *Hipótesis 1 — procesamiento secuencial con I/O lenta:* confirmada por el cálculo y por trazas OTel donde el 95% del tiempo del span es la llamada HTTP externa.
3. *Hipótesis 2 — rebalanceos:* los `Rebalancing` encajan con batches que tardan más que `max.poll.interval.ms` (o el `sessionTimeout` de KafkaJS sin heartbeats): el broker expulsa al consumer, reasigna particiones, se reprocesa y el lag empeora. Es consecuencia y a la vez agravante.
4. *Hipótesis 3 — particiones insuficientes:* 6 particiones limitan el escalado horizontal a 6 consumers activos; los extra quedan idle.
5. *Hipótesis 4 — downstream:* el servicio de impuestos tiene margen de QPS; no es el cuello ahora, pero al paralelizar lo golpearé más — lo vigilo.

**Herramientas.** `kafka_consumergroup_lag` (kafka-exporter) y offsets por partición, trazas OTel del handler, histograma de duración de proceso por mensaje, logs de rebalance; en BullMQ: `queue.getJobCounts()` (waiting/active/failed) y edad del job más antiguo como métrica de backlog.

**Solución.** Concurrencia dentro del consumer preservando el orden por clave, más batching y caché hacia el downstream:

```typescript
import pLimit from 'p-limit';

await consumer.run({
  partitionsConsumedConcurrently: 6,
  eachBatchAutoResolve: false,
  eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
    // Agrupar por clave: claves distintas en paralelo, misma clave en orden
    const byKey = new Map<string, typeof batch.messages>();
    for (const m of batch.messages) {
      const k = m.key?.toString() ?? '_null_';
      const arr = byKey.get(k) ?? [];
      arr.push(m);
      byKey.set(k, arr);
    }
    const limit = pLimit(24);
    await Promise.all(
      [...byKey.values()].map((msgs) =>
        limit(async () => {
          for (const m of msgs) {
            if (!isRunning() || isStale()) return;
            await processBilling(parseMessage(m));
            resolveOffset(m.offset);
          }
        }),
      ),
    );
    await heartbeat(); // evita expulsión del grupo durante batches largos
  },
});
```

Además: subo particiones de 6 a 24 (decisión consciente: cambia el hashing por clave para mensajes futuros, se coordina con los equipos consumidores), cacheo la respuesta del servicio de impuestos por jurisdicción (elimina ~50% de llamadas) y uso su endpoint batch. En BullMQ el equivalente sería `new Worker(queueName, handler, { concurrency: 25 })` más réplicas del worker, sabiendo que la concurrencia rompe el orden global (si el orden por entidad importa, colas por entidad o agrupación como arriba).

Resultado: throughput de consumo ~1.900 msg/s; el lag drena en un par de horas mientras vigilo el dashboard del downstream.

**Prevención.** Alerta de lag por tendencia, no por valor absoluto ("a este ritmo, X horas de retraso"); test de throughput del consumer en CI de performance; dimensionar particiones para 2–3× el pico proyectado desde el diseño (aumentarlas después reordena claves); presupuesto de latencia del handler documentado; autoscaling de consumers por lag (KEDA).

**Qué espera oír el entrevistador:** que haces la aritmética de throughput antes de tocar nada, que conoces el techo paralelismo = particiones, el trade-off concurrencia vs orden por clave, el papel de `max.poll.interval`/heartbeats en los rebalanceos, y que piensas en el downstream antes de abrir el grifo.

## 7. Race condition: doble descuento de stock en operaciones concurrentes

**Categoría:** Concurrencia / Consistencia de datos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Dos requests concurrentes leen el mismo stock (read-modify-write), ambos ven `qty=1` y ambos descuentan: stock negativo o doble venta. Es la race clásica de leer y escribir en pasos separados sin control de concurrencia. Soluciones por orden de preferencia: update atómico condicionado (`UPDATE ... WHERE qty >= n`), locking pesimista (`SELECT ... FOR UPDATE`) cuando hay lógica entre lectura y escritura, locking optimista con columna `version` cuando el conflicto es raro, unique constraints como red de seguridad, e idempotencia por `requestId` para reintentos. Nunca resolverlo "en memoria" en Node: con múltiples pods no existe la sección crítica local.

### 📖 Respuesta detallada

**Escenario.** Black Friday. Soporte reporta ventas de unidades sin stock; la tabla `stock` tiene filas con `qty = -3`. Los logs muestran pares de requests al mismo SKU con timestamps separados por 2–10 ms, ambos con respuesta 200. El código: `SELECT qty FROM stock WHERE sku=$1`, un `if (qty >= amount)` en JS, y luego `UPDATE stock SET qty = $2`. Entre el SELECT y el UPDATE de un request, el otro ejecutó su SELECT: ambos vieron stock suficiente. Con un solo pod y poca carga jamás se manifestó; con 12 pods y picos de tráfico, constantemente.

**Diagnóstico paso a paso.**
1. *Reconocer el patrón:* read-modify-write no atómico. Cualquier `if` en la aplicación sobre datos leídos antes de escribirlos es sospechoso.
2. *Confirmar con datos:* correlaciono en logs requests concurrentes al mismo SKU (mismo `sku`, ventana < 50 ms) y verifico que ambos pasaron la validación.
3. *Descartar soluciones falsas:* un mutex en memoria (o una cola en el proceso) solo serializa dentro de un pod; con N réplicas la race persiste. Señalarlo explícitamente suma puntos.
4. *Clasificar el caso:* alta contención sobre pocas filas calientes en checkout ⇒ el update condicionado atómico es lo más simple y lo más rápido; el optimista generaría muchos reintentos bajo contención alta.

**Herramientas.** Logs correlacionados por entidad y ventana temporal, `pg_locks`/`pg_stat_activity` para observar contención cuando se usa `FOR UPDATE`, métricas de conflictos (contador de "version conflict" o de filas afectadas = 0), tests de concurrencia con `Promise.all` de N operaciones simultáneas contra una DB real (testcontainers).

**Solución.**

```typescript
// ✅ Opción A (preferida aquí): update atómico condicionado — la DB es el árbitro
export async function reserveStock(sku: string, amount: number): Promise<boolean> {
  const res = await pool.query(
    'UPDATE stock SET qty = qty - $2 WHERE sku = $1 AND qty >= $2',
    [sku, amount],
  );
  return res.rowCount === 1; // 0 filas ⇒ stock insuficiente, sin race posible
}

// ✅ Opción B: pesimista, si hay lógica no trivial entre lectura y escritura
await withTransaction(async (tx) => {
  const { rows } = await tx.query(
    'SELECT qty FROM stock WHERE sku = $1 FOR UPDATE', // bloquea la fila
    [sku],
  );
  if (rows[0].qty < amount) throw new OutOfStockError(sku);
  await applyBusinessRules(tx, sku, amount); // descuentos, bundles...
  await tx.query('UPDATE stock SET qty = qty - $2 WHERE sku = $1', [sku, amount]);
});

// ✅ Opción C: optimista con versión, para entidades con conflicto poco frecuente
const res = await pool.query(
  'UPDATE wallet SET balance = $2, version = version + 1 WHERE id = $1 AND version = $3',
  [id, newBalance, expectedVersion],
);
if (res.rowCount === 0) throw new ConcurrencyConflictError(id); // reintentar releyendo
```

Redes de seguridad adicionales: constraint `CHECK (qty >= 0)` para que el invariante sea imposible de violar aunque aparezca otro camino de escritura, y **idempotencia**: si el cliente reintenta por timeout, un `INSERT` de la reserva con `UNIQUE (order_id, sku)` + `ON CONFLICT DO NOTHING` evita descontar dos veces la misma operación lógica. Para locks distribuidos entre servicios (no dentro de una DB), mencionaría advisory locks de Postgres o Redis con Redlock, pero como último recurso: si el dato vive en la DB, la DB debe arbitrar.

Elección según contexto: pesimista serializa (latencia bajo contención, riesgo de deadlocks — siempre lockear en orden consistente); optimista escala mejor con conflicto raro pero necesita lógica de retry; el update condicionado es imbatible cuando la condición cabe en el `WHERE`.

**Prevención.** Tests de concurrencia reales en CI (lanzar 50 compras simultáneas del último ítem y afirmar exactamente 1 éxito); constraints como invariantes en DB; revisión de todo read-modify-write en PRs; documentar la estrategia de concurrencia por agregado; métricas de conflictos optimistas para detectar cuándo cambiar de estrategia.

**Qué espera oír el entrevistador:** que identificas el read-modify-write como raíz, que descartas el mutex en memoria por multi-réplica, que comparas optimista/pesimista/atómico con criterio de contención, y que añades constraints e idempotencia como defensa en profundidad.

## 8. Hot reload de configuración sin reiniciar el servicio

**Categoría:** Configuración / Operabilidad · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Necesitamos rotar secrets y cambiar feature flags sin redeploy. El riesgo principal es la config parcialmente aplicada: una request que lee la mitad vieja y la mitad nueva, o una config inválida que tumba el servicio en caliente. El patrón correcto: watcher sobre la fuente (archivo montado de ConfigMap/Secret, o polling a un config service), validación completa con Zod del candidato, y swap atómico de la referencia completa — nunca mutación campo a campo. Cada request captura la config vigente al inicio y la usa consistentemente. Si la nueva config es inválida, se conserva la anterior y se alerta.

### 📖 Respuesta detallada

**Escenario.** Un servicio de pagos usa credenciales de un proveedor que se rotan cada 24 h y flags de negocio que Producto quiere cambiar sin esperar al tren de deploys. Hoy cada cambio implica redeploy (10 min, drenado de conexiones, riesgo). El primer intento de hot reload de otro equipo terminó mal: mutaban `config.apiKey` y `config.apiUrl` en dos pasos, y bajo tráfico algunas requests salieron con la key nueva contra la URL vieja (401 intermitentes que costaron horas de diagnóstico). Otro incidente: un YAML con un typo dejó `timeoutMs: NaN` y el servicio empezó a fallar en caliente sin deploy que lo explicara.

**Diagnóstico paso a paso (de los riesgos).**
1. *Config desgarrada (torn read):* mutación in-place de un objeto compartido mientras hay requests en vuelo ⇒ mezcla de versiones dentro de una misma operación.
2. *Config inválida aplicada:* sin validación previa, un cambio malo se propaga al instante a toda la flota — el hot reload amplifica errores igual que aciertos.
3. *Recursos con estado:* cambiar la URL de la DB no basta con swapear un string; hay que reconstruir el pool. Distinguir config "de lectura" (flags, límites) de config "estructural" (conexiones) es clave.
4. *Observabilidad:* sin log/métrica de "config version X aplicada", los incidentes son inexplicables porque "nadie desplegó nada".

**Herramientas.** `fs.watch`/chokidar sobre el archivo montado (los Secrets/ConfigMaps montados en K8s se actualizan vía symlink swap — vigilar el directorio, no el inode), Zod para validación, métrica gauge `config_version`/`config_last_reload_timestamp`, log estructurado del diff aplicado (sin volcar secrets), OTel para correlacionar cambios de config con cambios de comportamiento.

**Solución.**

```typescript
import { z } from 'zod';
import { watch } from 'chokidar';
import { readFile } from 'node:fs/promises';

const ConfigSchema = z.object({
  provider: z.object({
    apiUrl: z.string().url(),
    apiKey: z.string().min(20),
  }),
  timeoutMs: z.number().int().positive().max(30_000),
  flags: z.record(z.string(), z.boolean()),
}).strict();

export type AppConfig = z.infer<typeof ConfigSchema>;

let current: Readonly<AppConfig>;         // única referencia mutable
let version = 0;

export function getConfig(): Readonly<AppConfig> {
  return current; // los callers capturan UNA versión y la usan toda la operación
}

async function loadAndSwap(path: string): Promise<void> {
  try {
    const candidate = ConfigSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    const previous = current;
    current = Object.freeze(candidate);   // ✅ swap atómico de la referencia completa
    version += 1;
    metrics.gauge('config_version', version);
    logger.info({ version, changedKeys: diffKeys(previous, candidate) }, 'config reloaded');
  } catch (err) {
    // ✅ config inválida ⇒ conservar la anterior y alertar, nunca aplicar a medias
    metrics.increment('config_reload_failures_total');
    logger.error({ err }, 'invalid config candidate — keeping previous version');
  }
}

export async function initConfig(path: string): Promise<void> {
  await loadAndSwap(path); // el arranque SÍ falla si la config inicial es inválida
  watch(path, { awaitWriteFinish: true }).on('change', () => void loadAndSwap(path));
}

// Uso en un handler: capturar una vez, usar consistentemente
app.post('/charge', async (req, res) => {
  const cfg = getConfig(); // snapshot coherente para toda la request
  const client = providerClientFor(cfg.provider); // memoizado por versión de config
  // ...
});
```

Para config estructural (pools, clientes con keep-alive) uso un factory memoizado por versión: al cambiar la config se construye el recurso nuevo, el tráfico nuevo lo usa, y el viejo se drena y cierra tras un grace period. Para secrets rotados, el proveedor suele aceptar la key vieja y la nueva durante una ventana — despliego la rotación en dos fases apoyándome en eso.

**Prevención.** Validación Zod idéntica en CI sobre los archivos de config (el typo se atrapa antes de llegar al cluster); rollout progresivo de flags (porcentaje/por pod) en lugar de flota completa; `Object.freeze` para detectar mutaciones accidentales; alerta sobre `config_reload_failures_total`; runbook que incluya "¿cambió la config?" como pregunta estándar, con la métrica de versión en el dashboard principal.

**Qué espera oír el entrevistador:** el patrón snapshot + validación + swap atómico de referencia, la distinción config de lectura vs estructural, fail-closed en arranque pero keep-previous en caliente, y la observabilidad del cambio de config como parte de la solución, no como extra.

## 9. Migración JS→TS incremental en un servicio grande

**Categoría:** TypeScript / Deuda técnica · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Para un servicio de cientos de archivos JS, la migración big-bang está descartada: se hace incremental con `allowJs` + `checkJs` para que TS y JS convivan compilando desde el día uno. Priorizo las fronteras (tipos de dominio, contratos de API, capa de datos) porque es donde los tipos rinden más, y migro hacia dentro. Estricto desde el inicio para código nuevo (por carpetas via project references o overrides de lint), prohibición efectiva de `any` gratuito, herramientas como ts-migrate para el volumen mecánico, y un ratchet en CI que impide retroceder: el contador de errores/`any` solo puede bajar. Sin fecha de "gran final": cada PR deja el codebase más tipado.

### 📖 Respuesta detallada

**Escenario.** Servicio Express de ~700 archivos JS, 6 años, sin tipos, con tests parciales. Bugs recurrentes de "undefined is not a function" y contratos implícitos rotos entre módulos. El equipo quiere TS pero el intento anterior fracasó: una rama de migración masiva que vivió 3 semanas, acumuló conflictos y se abandonó. Restricción: el tren de features no se detiene.

**Diagnóstico paso a paso (plan, no incidente).**
1. *Fundación (semana 1):* `tsconfig.json` con `allowJs: true`, `checkJs: false` inicialmente, `strict: true` para `.ts`, y el build (tsc o esbuild/swc + `tsc --noEmit` en CI) compilando el mix. La app sigue funcionando idéntica; nada se migra aún.
2. *Fronteras primero:* creo `src/types/` con los tipos de dominio (Order, User, eventos) y tipo los contratos: schemas Zod en los endpoints (que dan tipos y validación runtime a la vez), tipos de la capa de datos, clientes de otros servicios. Es el 10% del esfuerzo con el 60% del valor: los errores de frontera son los caros.
3. *Estricto por zonas:* carpetas nuevas (`src/payments-v2/`) nacen `.ts` estricto. Para el legacy, `checkJs` se activa por carpeta con JSDoc donde renta.
4. *Volumen mecánico:* ts-migrate (o codemods propios) para renombrar y anotar en masa; deja `any` y `@ts-expect-error` marcados que se pagan después de forma controlada.
5. *Ratchet en CI:* script que cuenta errores con strict total y ocurrencias de `any` explícito; el número se guarda como baseline y el CI falla si sube. La migración avanza por presión suave y constante, sin heroísmos.
6. *Ruta de migración por archivo:* al tocar un archivo JS por una feature/bugfix, se migra en un commit separado del cambio funcional (renombrado + tipos primero, lógica después) para mantener el diff revisable.

**Herramientas.** `tsc --noEmit` como gate de CI, `allowJs`/`checkJs`/JSDoc, ts-migrate, `typescript-eslint` con `no-explicit-any` (warn en legacy, error en código nuevo vía overrides), type-coverage para medir % de expresiones tipadas, Zod en fronteras, project references si el monolito se parte en paquetes.

**Solución (fragmentos representativos).**

```typescript
// tsconfig.json (fase incremental)
{
  "compilerOptions": {
    "strict": true,
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "target": "ES2022",
    "module": "NodeNext"
  },
  "include": ["src/**/*"]
}
```

```typescript
// Frontera tipada: schema Zod = validación runtime + tipo estático de una sola fuente
import { z } from 'zod';

export const CreateOrderBody = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  couponCode: z.string().optional(),
});
export type CreateOrderBody = z.infer<typeof CreateOrderBody>;

app.post('/orders', (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.issues });
  return createOrder(parsed.data); // parsed.data: CreateOrderBody — tipado hacia dentro
});
```

```typescript
// Ratchet de CI (esquema): la deuda solo puede bajar
const current = countStrictErrors(); // tsc --noEmit -p tsconfig.strict.json | parse
const baseline = readBaseline();     // committed en el repo
if (current > baseline) {
  console.error(`Type debt increased: ${current} > ${baseline}`);
  process.exit(1);
}
if (current < baseline) writeBaseline(current); // el progreso se consolida solo
```

Errores a evitar y que menciono proactivamente: `any` masivo para "compilar rápido" (compila pero no protege: preferir `unknown` + narrowing en fronteras); migrar utilidades hoja antes que fronteras (esfuerzo con poco retorno); ramas de migración de larga vida (todo va a main, detrás del CI); y desactivar `strictNullChecks` "temporalmente" (es la mitad del valor de TS).

**Prevención (que la migración no muera).** Métrica visible de progreso (type-coverage en el dashboard del equipo); acuerdo de equipo escrito: "archivo tocado, archivo migrado"; presupuesto explícito por sprint para pagar `@ts-expect-error`; celebración de hitos (carpetas que entran en strict total).

**Qué espera oír el entrevistador:** estrategia incremental con `allowJs` y convivencia real, priorización por fronteras con Zod como puente runtime/estático, el ratchet como mecanismo antifrágil frente a la disciplina voluntaria, y el juicio de qué NO hacer (big-bang, any masivo, ramas eternas).

## 10. Timeout en cascada entre servicios: A→B→C

**Categoría:** Sistemas distribuidos / Resiliencia · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

C se degrada, B espera a C con timeouts largos y agota sus recursos, A espera a B, y los retries de cada capa multiplican el tráfico sobre C justo cuando peor está: retry storm y caída en cascada. El arreglo tiene piezas: presupuestos de timeout decrecientes a lo largo de la cadena (deadline propagation), retries acotados solo en errores idempotentes con exponential backoff + jitter, circuit breakers para fallar rápido cuando el downstream está roto, y degradación parcial (fallbacks) en vez de error total. La regla de oro: el timeout de quien llama debe ser mayor que el timeout total (con retries) de quien es llamado — o al revés la cadena miente.

### 📖 Respuesta detallada

**Escenario.** Checkout (A) llama a Pricing (B), que llama a un servicio de promociones (C). C sufre un deploy malo y su p99 pasa de 50 ms a 9 s. B tiene timeout de 10 s hacia C y 3 retries; A tiene timeout de 10 s hacia B y 2 retries. Efecto observado: los pools HTTP y el event loop de B se llenan de requests en vuelo esperando a C (memoria y sockets arriba), A empieza a hacer timeout y reintenta ⇒ cada request de usuario genera hasta 3×4=12 llamadas a C. C, que estaba lento, ahora está muerto por sobrecarga; B agota conexiones y también cae; el checkout entero está caído por un servicio de cupones. Las gráficas muestran el patrón: latencia de C sube primero, in-flight requests de B se disparan después, errores de A al final — la cascada se lee en orden en las trazas distribuidas.

**Diagnóstico paso a paso.**
1. *Leer la traza:* en OTel/Jaeger, un trace de checkout muestra el árbol A→B→C con los spans de C en 9–10 s y múltiples spans hermanos de retry. La traza cuenta la historia completa mejor que cualquier log.
2. *Identificar la amplificación:* multiplico retries por capa (2×… en A, ×4 intentos en B) y comparo QPS entrante en C vs QPS de usuario: ratio 10-12×. Ese número es el diagnóstico.
3. *Auditar los timeouts:* A espera 10 s a B, pero B puede tardar hasta 40 s (4 intentos × 10 s) en responder sobre C. Los presupuestos están invertidos: quien llama abandona antes de que el llamado termine, dejando trabajo zombi en vuelo.
4. *Revisar qué se reintenta:* B reintentaba también timeouts (¿la operación llegó a C? desconocido) sin garantía de idempotencia aguas abajo.

**Herramientas.** Tracing distribuido (OTel + Jaeger/Tempo) para ver el árbol de llamadas y retries, métricas RED por servicio y por edge (A→B, B→C), gauge de in-flight requests, métricas del circuit breaker (estado, aperturas), dashboards de amplificación (QPS interno vs QPS de usuario).

**Solución.**

```typescript
// ✅ Presupuesto de deadline propagado: cada salto consume del budget total
import CircuitBreaker from 'opossum';

const TOTAL_BUDGET_MS = 2_000; // presupuesto de checkout de cara al usuario

export async function callWithDeadline<T>(
  fn: (signal: AbortSignal, remainingMs: number) => Promise<T>,
  deadlineAt: number, // epoch ms, viaja en el header x-request-deadline
): Promise<T> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 50) throw new DeadlineExceededError(); // fail fast, ni lo intentes
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), remaining);
  try {
    return await fn(ac.signal, remaining);
  } finally {
    clearTimeout(t);
  }
}

// ✅ Retries: pocos, con backoff exponencial + full jitter, solo si es seguro
async function retryable<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) throw err; // 4xx, errores de negocio: jamás
      const backoff = Math.random() * Math.min(1_000, 100 * 2 ** i); // full jitter
      await sleep(backoff);
    }
  }
  throw lastErr;
}

// ✅ Circuit breaker hacia C: si está roto, fallar en microsegundos y degradar
const promoBreaker = new CircuitBreaker(fetchPromotions, {
  timeout: 300,                 // C sano responde en 50 ms; 300 ya es anomalía
  errorThresholdPercentage: 50,
  resetTimeout: 10_000,
  volumeThreshold: 20,
});
promoBreaker.fallback(() => ({ promotions: [], degraded: true })); // checkout sin cupones > checkout caído
```

Decisiones de diseño que explico: los timeouts se fijan por percentil real del downstream (p99 sano × margen), no por números redondos; el deadline viaja en un header y cada servicio deja de trabajar cuando expira (dejar de procesar algo que el caller ya abandonó es desperdicio puro); los retries viven en *una sola capa* (idealmente la más externa o el mesh, no todas); y el fallback convierte una dependencia no crítica (promociones) en degradación elegante con flag `degraded` para observabilidad.

**Prevención.** Revisión de presupuestos de timeout como parte del diseño de cada integración (documento con el árbol de llamadas y budgets); load shedding en C (rechazar temprano con 503 + `Retry-After` cuando está saturado); tests de caos (latencia inyectada en C en staging) verificando que la cascada no ocurre; alerta sobre ratio de amplificación; retry budgets (p. ej. máx. 20% de tráfico extra por retries, estilo Finagle/Envoy).

**Qué espera oír el entrevistador:** la mecánica de la cascada (colas llenas + amplificación por retries), presupuestos de timeout coherentes y deadline propagation, jitter y su porqué (desincronizar reintentos), circuit breaker con fallback de negocio, y la madurez de "retries en una sola capa" y solo sobre operaciones idempotentes.

## 11. DNS y keep-alive con axios/undici en alta concurrencia

**Categoría:** Redes / HTTP clients · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

`ENOTFOUND`/`EAI_AGAIN` intermitentes bajo carga y latencias con picos regulares apuntan a dos problemas relacionados: sin keep-alive, cada request abre socket nuevo ⇒ resolución DNS por request + handshake TCP/TLS + acumulación de sockets en TIME_WAIT y posible agotamiento de puertos efímeros; y el resolver DNS (getaddrinfo corre en el threadpool de libuv, 4 threads por defecto) se satura o el servidor DNS del cluster (CoreDNS/node-local) ratelimitea. Solución: agentes keep-alive bien dimensionados (o el pool de undici, que lo trae por defecto), caché de DNS con lookup propio (cacheable-lookup) y, si aplica, subir `UV_THREADPOOL_SIZE`. Prevención: métricas de sockets y de resolución DNS.

### 📖 Respuesta detallada

**Escenario.** Un BFF que agrega 4 APIs internas empieza, a partir de cierto tráfico (~600 RPS), a lanzar ráfagas de `getaddrinfo EAI_AGAIN api-pricing.internal` y `ENOTFOUND` intermitentes — el hostname existe y resuelve bien con `dig` desde el mismo pod. Además, el p95 hacia los downstreams es ~80 ms cuando el servidor responde en 15 ms. En el nodo, `ss -tan | grep TIME-WAIT | wc -l` da decenas de miles: churn masivo de conexiones. CoreDNS muestra QPS altísimo desde estos pods. Diagnóstico preliminar: no hay reutilización de conexiones y cada request paga DNS + TCP + TLS.

**Diagnóstico paso a paso.**
1. *¿Keep-alive activo?* El servicio usa axios con la config por defecto sobre el `http.Agent` global de Node clásico sin `keepAlive` (en Node < 19 el default era sin keep-alive). Cada request: conexión nueva. Confirmado con `ss` (TIME_WAIT masivo) y con el header `Connection: close`.
2. *¿Por qué EAI_AGAIN?* `dns.lookup` usa `getaddrinfo`, que es síncrono y corre en el threadpool de libuv (default 4). A 600 RPS × 4 downstreams sin caché, el threadpool se satura (y compite con fs y crypto) y CoreDNS ratelimitea; `EAI_AGAIN` es "resolver temporalmente sobrecargado", no "el host no existe".
3. *¿Puertos efímeros?* Con churn alto, los sockets en TIME_WAIT (~60 s) pueden agotar el rango efímero hacia una misma IP:puerto destino, provocando fallos de conexión adicionales.
4. Verifico con una prueba controlada: activando keep-alive en un pod canario, el TIME_WAIT cae dos órdenes de magnitud y los EAI_AGAIN desaparecen.

**Herramientas.** `ss`/`netstat` para estados de socket, métricas de CoreDNS, `perf_hooks` o interceptores de axios/undici para separar tiempo de DNS/connect/TTFB, diagnósticos de undici (`undici`'s diagnostics_channel: eventos de pool y conexiones), `process.env.UV_THREADPOOL_SIZE`, tcpdump si hace falta llegar al nivel de red.

**Solución.**

```typescript
// ✅ Opción A — axios con agentes keep-alive y caché de DNS
import http from 'node:http';
import https from 'node:https';
import axios from 'axios';
import CacheableLookup from 'cacheable-lookup';

const dnsCache = new CacheableLookup({ maxTtl: 30, errorTtl: 1 }); // respeta TTL, acota errores

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 128,        // por origin: techo de concurrencia hacia el downstream
  maxFreeSockets: 16,
  timeout: 30_000,        // idle timeout del socket
});
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 128, maxFreeSockets: 16 });
dnsCache.install(httpAgent);
dnsCache.install(httpsAgent);

export const pricingClient = axios.create({
  baseURL: 'http://api-pricing.internal',
  httpAgent,
  httpsAgent,
  timeout: 2_000,
});

// ✅ Opción B — undici (recomendado en servicios nuevos): pooling nativo y más rápido
import { Agent, request, setGlobalDispatcher } from 'undici';

setGlobalDispatcher(new Agent({
  connections: 128,            // pool por origin
  pipelining: 1,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connect: { timeout: 1_000 }, // fallar rápido el connect
}));

const res = await request('http://api-pricing.internal/prices/sku-1', {
  headersTimeout: 2_000,
  bodyTimeout: 2_000,
});
```

Matices que menciono: `maxSockets`/`connections` es también un mecanismo de protección del downstream (backpressure de cliente) — dimensionarlo con el downstream, no al infinito; el idle timeout del cliente debe ser *menor* que el del servidor/LB para no reutilizar sockets que el otro lado ya cerró (causa clásica de `ECONNRESET` esporádicos); si el pod hace mucho fs/crypto además de DNS, `UV_THREADPOOL_SIZE=16` alivia; en Kubernetes, revisar `ndots:5` en resolv.conf, que multiplica queries DNS por cada nombre no-FQDN (usar FQDN con punto final o ajustar `dnsConfig`). NodeLocal DNSCache a nivel de cluster reduce la presión sobre CoreDNS.

**Prevención.** Cliente HTTP de plataforma (wrapper único con keep-alive, timeouts, métricas y trazas ya configurados — nadie instancia axios "a pelo"); dashboards de conexiones activas/creadas por segundo (el ratio creadas/reutilizadas delata regresiones); alertas de errores DNS por código; test de carga que valide el comportamiento a 2–3× el tráfico pico.

**Qué espera oír el entrevistador:** entender qué significa EAI_AGAIN de verdad (resolver saturado, threadpool de libuv), la cadena keep-alive → menos DNS/handshakes → menos TIME_WAIT, dimensionamiento del pool como protección mutua, el detalle del idle timeout cliente < servidor, y los específicos de Kubernetes (ndots, CoreDNS).

## 12. Degradación por GC: pausas largas y sawtooth agresivo

**Categoría:** Node.js internals / Memoria · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Picos de latencia periódicos que no correlacionan con tráfico ni con endpoints concretos, con un sawtooth de heap muy pronunciado, apuntan al GC: la aplicación asigna tanto (objetos temporales por request) que V8 vive haciendo scavenges, y si el old space va lleno, major GCs (mark-compact) con pausas que paran el mundo decenas o cientos de ms. Confirmo con `--trace-gc` o con `PerformanceObserver` de tipo `gc`, y ataco por dos vías: dar espacio al GC (`--max-old-space-size` acorde al contenedor) y, sobre todo, reducir presión de allocations en el hot path (evitar copias/objetos intermedios, reutilizar buffers, revisar qué sobrevive a young generation). El GC casi siempre es el síntoma; el exceso de basura es la enfermedad.

### 📖 Respuesta detallada

**Escenario.** Un servicio de agregación muestra p99 con picos de 200–400 ms cada 20–30 s, sin patrón por endpoint. `heapUsed` dibuja un sawtooth violento: sube 400 MB en segundos y cae de golpe. La métrica `nodejs_gc_duration_seconds` (prom-client) muestra major GCs de 150–300 ms varias veces por minuto. El pod tiene limit de 2 GiB pero el proceso corre con el default de `--max-old-space-size` (~heap pequeño relativo al contenedor en versiones antiguas de Node; hoy Node lee cgroups mejor, pero conviene fijarlo). Coincide con una feature nueva que "enriquece" cada elemento de respuestas grandes.

**Diagnóstico paso a paso.**
1. *Confirmar que es GC:* activo `--trace-gc` en un pod canario (o `PerformanceObserver({ entryTypes: ['gc'] })` a métricas). Los logs muestran `Mark-Compact ... 280 ms` alineados exactamente con los picos de p99. Correlación temporal = confirmación.
2. *¿Falta de espacio o exceso de basura?* Miro `v8.getHeapStatistics()`: `used_heap_size` ronda el 90% de `heap_size_limit` ⇒ el GC trabaja con el agua al cuello; cada major libera poco. Hay ambas cosas: heap corto Y allocations excesivas.
3. *¿Quién asigna tanto?* Allocation sampling con Chrome DevTools (pestaña Memory → Allocation sampling) o `clinic heapprofiler` en staging con carga. El culpable: el enriquecimiento hace spread de cada objeto (`{ ...item, extra }`) sobre arrays de 50k elementos, más `JSON.parse(JSON.stringify(...))` como deep-clone defensivo — cientos de MB de objetos temporales por request.
4. *¿Sobrevive basura a la young generation?* Objetos temporales que viven "un poco de más" (retenidos por promesas/lotes grandes) se promocionan a old space y convierten scavenges baratos en major GCs caros. El batching de 50k elementos por tick provoca justo eso.

**Herramientas.** `--trace-gc` / `--trace-gc-verbose`, `PerformanceObserver` tipo `gc` exportado a Prometheus (`nodejs_gc_duration_seconds` por `kind`), `v8.getHeapStatistics()`, allocation sampling de DevTools, `clinic heapprofiler`, flags `--max-old-space-size` y (con criterio) `--max-semi-space-size` para dar más espacio a la young generation en servicios de alto throughput.

**Solución.**

```typescript
// 1) Dar al heap el espacio que el contenedor ya paga (limit 2 GiB → ~1.5 GiB de heap)
//    NODE_OPTIONS=--max-old-space-size=1536

// 2) ❌ Antes: montañas de objetos temporales por request
const enriched = items.map((item) => ({
  ...structuredClone(item),          // copia profunda innecesaria
  price: computePrice(item),
  labels: item.tags.map((t) => t.toUpperCase()),
}));

// ✅ Después: mutación local sobre datos propios + procesar en chunks
async function enrich(items: Item[]): Promise<EnrichedItem[]> {
  const out: EnrichedItem[] = new Array(items.length);
  const CHUNK = 2_000;
  for (let start = 0; start < items.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, items.length);
    for (let i = start; i < end; i++) {
      const item = items[i]; // los datos ya son nuestros: no hace falta clonar
      out[i] = { id: item.id, sku: item.sku, price: computePrice(item), labels: upper(item.tags) };
    }
    await setImmediateP(); // cede el loop entre chunks: lotes cortos, menos promoción a old space
  }
  return out;
}
```

Además: elimino el `JSON.parse(JSON.stringify())` (si hace falta inmutabilidad, la garantizo por diseño en la capa de datos); para payloads muy grandes vuelvo a streaming (caso 2 y 3, los problemas se tocan); y en clientes/serializadores calientes reutilizo Buffers en lugar de crear uno por mensaje. Tras el cambio: major GCs de varios por minuto a uno cada varios minutos, pausas < 40 ms, p99 plano.

Matiz importante: subir `--max-old-space-size` sin reducir allocations solo espacia los majors y los hace *más largos* (más heap que marcar). Y al revés: heap demasiado corto respecto al limit del contenedor desperdicia memoria pagada y asfixia al GC. Regla práctica: heap ≈ 75–80% del limit, y atacar siempre la tasa de allocations.

**Prevención.** Métrica de GC (duración por tipo y % de tiempo en GC) en el dashboard estándar con alerta; presupuesto de allocations en endpoints calientes (revisar spreads/clones en code review de hot paths); benchmark de regresión de memoria en CI para los endpoints top; fijar `--max-old-space-size` explícito en la imagen base de la plataforma, coherente con los limits de K8s.

**Qué espera oír el entrevistador:** correlacionar pausas GC con picos de latencia usando `--trace-gc`/métricas (no adivinar), la distinción scavenge vs mark-compact y el efecto de la promoción a old space, que el fix real es reducir presión de allocations y no solo subir el heap, y la relación heap/limit del contenedor.

## 13. Pérdida de eventos: mensajes que "desaparecen"

**Categoría:** Mensajería / Consistencia · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Cuando negocio reporta que "a veces no llega el evento", busco las tres fugas clásicas: (1) el consumidor confirma antes de procesar — ack temprano o auto-commit de offsets que confirma mensajes aún no procesados cuando el pod muere; (2) el productor publica fuera de la transacción de DB — se hace commit y la publicación falla (o publica y el commit falla): estados divergentes; (3) errores tragados sin DLQ. Las soluciones: ack solo tras procesar, commit manual de offsets, patrón Transactional Outbox para atomizar "escribir en DB + publicar evento", y DLQ con alertas para que nada muera en silencio. Y para auditar: reconciliación punta a punta con IDs de evento.

### 📖 Respuesta detallada

**Escenario.** El equipo de fidelización reporta que ~0,1% de los pedidos no generan puntos. No hay errores en los logs del productor ni del consumidor (primera pista incómoda: la pérdida silenciosa). Ocurre en ráfagas que coinciden con deploys y con picos de tráfico. Arquitectura: servicio de pedidos escribe en Postgres y publica `order.completed` en Kafka/RabbitMQ; el servicio de puntos consume y acredita.

**Diagnóstico paso a paso.**
1. *¿Se publicó el evento?* Reconcilio por `orderId`: pedidos en DB vs eventos publicados (log de publicación o conteo en el broker). Resultado: parte de los pedidos afectados nunca publicaron. Reviso el código del productor:

```typescript
// ❌ Publicación fuera de la transacción: ventana de pérdida
await withTransaction(async (tx) => {
  await tx.query('INSERT INTO orders ...');
}); // commit OK...
await producer.send({ topic: 'orders', messages: [...] }); // ...y esto falla o el pod muere aquí
```

   Si el proceso muere entre commit y send (deploy, OOM, crash), el pedido existe y el evento no existirá jamás. El orden inverso (publicar antes de commit) produce el fantasma contrario: eventos de pedidos que no existen.
2. *¿Se consumió y se perdió?* Para los restantes, el evento sí está en el broker. El consumidor usa auto-commit de offsets cada 5 s (o `noAck: true` en Rabbit): al morir el pod en deploy, los offsets confirmados incluían mensajes en el batch aún no procesados ⇒ nunca se reentregan. La correlación con deploys queda explicada.
3. *¿Errores tragados?* Un `try/catch` que solo loguea a nivel debug y hace ack completaba el cuadro en un tercer flujo. Sin DLQ, sin métricas, invisible.

**Herramientas.** Reconciliación por IDs (query DB vs consumo del topic con un consumer de auditoría), métricas de publicación/consumo por tipo de evento (contadores end-to-end), lag y offsets por partición, trazas OTel con el `traceparent` propagado en headers del mensaje, DLQ como fuente forense.

**Solución.** Outbox transaccional en el productor + commits manuales tras procesar en el consumidor + DLQ:

```typescript
// ✅ Productor: Transactional Outbox — evento y estado en la MISMA transacción
await withTransaction(async (tx) => {
  await tx.query('INSERT INTO orders (id, status) VALUES ($1, $2)', [orderId, 'completed']);
  await tx.query(
    `INSERT INTO outbox (id, topic, key, payload, created_at)
     VALUES ($1, $2, $3, $4, now())`,
    [eventId, 'orders', orderId, JSON.stringify({ type: 'order.completed', orderId })],
  );
}); // atómico: o existen los dos, o ninguno

// Relay (polling publisher o Debezium CDC): lee outbox, publica, marca publicado.
// Es at-least-once: puede duplicar, nunca perder → el consumidor debe ser idempotente (caso 14).
async function relayOutbox(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`,
  );
  for (const row of rows) {
    await producer.send({ topic: row.topic, messages: [{ key: row.key, value: row.payload }] });
    await pool.query('UPDATE outbox SET published_at = now() WHERE id = $1', [row.id]);
  }
}

// ✅ Consumidor: confirmar SOLO tras procesar, y DLQ para lo irrecuperable
await consumer.run({
  autoCommit: false,
  eachMessage: async ({ topic, partition, message }) => {
    try {
      await creditPoints(parseEvent(message)); // idempotente por eventId
    } catch (err) {
      if (isPermanent(err)) {
        await dlqProducer.send({ topic: `${topic}.dlq`, messages: [message] });
        metrics.increment('events_dead_lettered_total', { topic });
      } else {
        throw err; // transitorio: no commitear, que se reentregue
      }
    }
    await consumer.commitOffsets([
      { topic, partition, offset: (Number(message.offset) + 1).toString() },
    ]);
  },
});
```

Explico el trade-off en voz alta: el Outbox convierte "perder eventos" en "posibilidad de duplicarlos", que es el problema *bueno* porque tiene solución barata (idempotencia). La alternativa de transacciones distribuidas broker+DB (XA) la descarto por complejidad y acoplamiento; Kafka transactions + exactly-once aplican dentro del ecosistema Kafka (streams), no cubren la DB externa.

**Prevención.** Regla de arquitectura: ningún publish fuera de transacción cuando el evento deriva de un cambio de estado (lint/PR checklist); auto-commit prohibido en consumidores con side effects; DLQ obligatoria con alerta > 0; job de reconciliación periódico (pedidos sin evento en N minutos ⇒ alerta) como red final; chaos testing matando pods durante el procesamiento.

**Qué espera oír el entrevistador:** las tres ventanas de pérdida localizadas con precisión (commit-vs-publish, ack/auto-commit temprano, errores tragados), el patrón Outbox con su trade-off explícito hacia at-least-once + idempotencia, commits manuales tras procesar, y la reconciliación como mecanismo de detección independiente.

## 14. Duplicación de jobs/mensajes: el mismo evento procesado dos veces

**Categoría:** Mensajería / Idempotencia · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Clientes cobrados dos veces o emails duplicados en un sistema at-least-once no son un bug del broker: son el contrato. La entrega duplicada es inevitable (reintentos tras timeout de visibilidad, rebalanceos, redelivery tras crash, retries del productor), así que la única solución robusta es el consumidor idempotente: clave de idempotencia estable (eventId o clave de negocio), deduplicación con unique constraint en DB dentro de la misma transacción que el side effect, o `SET NX` en Redis para efectos no transaccionales, y propagación de idempotency keys a APIs externas (Stripe-style). Deduplicar "antes de procesar" sin atomicidad con el efecto deja una race abierta.

### 📖 Respuesta detallada

**Escenario.** Tras un incidente de lentitud en el consumidor de pagos (SQS), soporte recibe quejas de cargos dobles. Los logs muestran el mismo `paymentId` procesado dos veces en workers distintos con 31 s de diferencia — justo el visibility timeout de la cola (30 s): el primer worker seguía procesando (lento por el incidente) cuando el mensaje volvió a ser visible y otro worker lo tomó. Variantes del mismo problema: rebalanceo de Kafka reentregando el batch no commiteado, BullMQ reejecutando un job tras `stalledInterval` cuando el worker perdió el lock, o el productor reintentando un `send` cuyo ack se perdió (duplicado desde el origen).

**Diagnóstico paso a paso.**
1. *Confirmar duplicación de entrega, no de origen:* comparo IDs: mismo `messageId`/`eventId` en ambos procesamientos ⇒ redelivery. Si fueran eventos distintos con el mismo contenido, el problema estaría en el productor (doble publicación) y se ataca allí también (outbox con eventId determinista).
2. *Entender el mecanismo:* la latencia del handler (p99 45 s durante el incidente) superó el visibility timeout (30 s). No es un caso raro: cualquier degradación puntual convierte at-least-once en "seguro que duplico".
3. *Auditar el handler:* el cargo al PSP y el registro en DB se hacían sin ninguna clave de idempotencia. El sistema era correcto solo mientras nada fallara — es decir, incorrecto.
4. *Revisar dónde deduplicar:* había un "check si existe y skip" con `SELECT` previo — inútil bajo concurrencia: dos workers pasan el check a la vez (misma race del caso 7). La deduplicación tiene que ser atómica con el efecto.

**Herramientas.** Logs correlacionados por `eventId` (detectar procesamientos múltiples), métricas `duplicate_events_total` (cuando la dedupe salta, contarlo: es la señal de salud del mecanismo), visibility timeout vs histograma de duración del handler en el mismo dashboard, en BullMQ eventos `stalled`, en Kafka logs de rebalance.

**Solución.** Idempotencia en capas, de dentro hacia fuera:

```typescript
// ✅ 1) Dedupe transaccional: la clave única y el side effect en la MISMA transacción
export async function processPayment(evt: PaymentEvent): Promise<void> {
  try {
    await withTransaction(async (tx) => {
      // La constraint UNIQUE(event_id) es el árbitro; el INSERT es el "lock"
      await tx.query(
        'INSERT INTO processed_events (event_id, processed_at) VALUES ($1, now())',
        [evt.eventId],
      );
      await tx.query(
        'INSERT INTO charges (payment_id, amount_cents, status) VALUES ($1, $2, $3)',
        [evt.paymentId, evt.amountCents, 'captured'],
      );
    });
  } catch (err) {
    if (isUniqueViolation(err)) { // 23505: ya procesado — duplicado benigno
      metrics.increment('duplicate_events_total', { type: 'payment' });
      return; // ack sin efectos
    }
    throw err;
  }
}

// ✅ 2) Efectos externos: propagar idempotency key al proveedor
await stripe.charges.create(
  { amount: evt.amountCents, currency: 'eur', customer: evt.customerId },
  { idempotencyKey: evt.eventId }, // el PSP deduplica en su lado
);

// ✅ 3) Efectos no transaccionales (email, push): dedupe rápida con Redis
async function sendOnce(evt: NotificationEvent): Promise<void> {
  const acquired = await redis.set(`dedupe:notif:${evt.eventId}`, '1', 'EX', 86_400, 'NX');
  if (acquired === null) return; // ya lo envió (o lo está enviando) otro worker
  try {
    await mailer.send(evt);
  } catch (err) {
    await redis.del(`dedupe:notif:${evt.eventId}`); // liberar para permitir el retry
    throw err;
  }
}
```

Jerarquía que explico: la dedupe en DB con unique constraint es la más fuerte (atómica con el efecto, sobrevive a reinicios y a Redis caído); la de Redis es más barata pero es best-effort (TTL, failover) — válida para efectos donde un duplicado raro es tolerable (email) y no para dinero; la idempotency key hacia el proveedor externo cubre el tramo que mi transacción no puede cubrir. Complementos operativos: alinear visibility timeout con la duración real del handler (timeout ≥ p99.9 × margen, y extenderlo con heartbeat para jobs largos), y en la tabla `processed_events`, un job de retención (borrar > 30 días) para que no crezca sin límite.

Detalle fino para señalar seniority: incluso con todo esto, "exactly-once end-to-end" no existe en general; lo que se construye es *entrega at-least-once + procesamiento efectivamente-una-vez* por idempotencia, y hay que decidir la clave con criterio de negocio (¿`eventId` técnico o `(orderId, concepto)` de negocio? La segunda también deduplica republicaciones con ID distinto).

**Prevención.** Idempotencia como requisito de definición de done para todo consumidor con side effects (checklist de PR); tests que entregan cada mensaje dos veces (harness de test que duplica adrede) y afirman efecto único; dashboard visibility-timeout vs duración de handler; convención de eventId determinista desde el productor (derivado del agregado, no un uuid por intento de publicación).

**Qué espera oír el entrevistador:** que asumes at-least-once como contrato y no culpas al broker, el porqué del duplicado (visibility timeout vs duración, rebalanceos), dedupe atómica con el efecto (unique constraint en la misma transacción) frente al check-then-act roto, idempotency keys hacia terceros, y la elección razonada de clave de idempotencia.

## 15. Hot path degradado: CPU throttling en Kubernetes distorsionando latencias

**Categoría:** Kubernetes / Runtime · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Un servicio Node con CPU limits sufre picos de latencia periódicos aunque el uso "medio" de CPU parezca bajo: el scheduler CFS reparte cuota por ventanas de 100 ms, y cuando el proceso agota su cuota es *throttled* — pausado hasta la siguiente ventana. Para Node es letal: el event loop entero se congela decenas o cientos de ms, afectando a todas las requests, al GC y a los health checks. Se diagnostica con `container_cpu_cfs_throttled_periods_total` y correlación con p99. Soluciones: dimensionar requests/limits con datos reales (o quitar el CPU limit y gobernar por requests), ajustar el paralelismo interno (UV_THREADPOOL_SIZE, workers) a la CPU real, y recordar que la media de CPU esconde los bursts.

### 📖 Respuesta detallada

**Escenario.** Un servicio con `requests: cpu 250m, limits: cpu 500m` muestra p99 con picos de 300–800 ms sin correlación con tráfico ni GC. La gráfica de CPU "media" ronda el 30% del limit — aparentemente sobra. Pero `rate(container_cpu_cfs_throttled_periods_total[5m]) / rate(container_cpu_cfs_periods_total[5m])` da 40–60% en los picos: en la mitad de las ventanas de 100 ms el contenedor agota su cuota (50 ms de CPU por ventana con limit 500m) y el kernel lo pausa el resto de la ventana. Cada burst — un JSON.stringify mediano, un scavenge del GC, TLS handshakes agrupados — consume la cuota en 20–50 ms y el event loop queda congelado hasta la ventana siguiente. Además, algunos liveness probes fallan durante los throttles y provocan restarts espurios que empeoran todo.

**Diagnóstico paso a paso.**
1. *Descartar sospechosos internos:* event loop delay alto (sí lo está) pero sin código CPU-bound en flamegraphs y sin major GCs largos en `--trace-gc`. Cuando el interior no explica la pausa, mirar al carcelero: el kernel.
2. *Confirmar throttling:* las métricas de cAdvisor citadas arriba, y dentro del contenedor `cat /sys/fs/cgroup/cpu.stat` (`nr_throttled`, `throttled_usec`). La correlación temporal entre `throttled_usec` y los picos de p99 es exacta.
3. *Entender por qué la media engaña:* 30% de media sobre ventanas de 100 ms es compatible con ráfagas que agotan el 100% de la cuota en muchas ventanas. La latencia vive en la ventana, no en la media del minuto.
4. *Revisar el paralelismo interno:* Node ve las CPUs del *nodo* (p. ej. 16) — `os.cpus().length` engaña dentro de un contenedor con límites; libuv levanta su threadpool y V8 sus threads de GC/JIT como si hubiera 16 cores, y ese paralelismo consume cuota más rápido aún.

**Herramientas.** `container_cpu_cfs_throttled_periods_total` / `container_cpu_cfs_throttled_seconds_total` (cAdvisor/Prometheus), `/sys/fs/cgroup/cpu.stat`, `perf_hooks.monitorEventLoopDelay` (la víctima visible), dashboards que crucen throttling con p99, `kubectl top` con la conciencia de que promedia, VPA en modo recomendación para dimensionar con datos.

**Solución.**

```yaml
# ✅ Opción A: dimensionar con datos (VPA recommendations + percentiles de uso real)
resources:
  requests: { cpu: "1" }     # garantiza scheduling acorde al uso real en burst
  limits:   { cpu: "2" }     # techo holgado: el burst cabe en la cuota
# ✅ Opción B (común en servicios latency-sensitive): sin CPU limit
resources:
  requests: { cpu: "1" }     # el aislamiento lo dan los requests (cpu.shares)
  # sin limits.cpu ⇒ sin throttling CFS; puede usar CPU ociosa del nodo
  limits:   { memory: "1Gi" } # el limit de memoria SÍ se mantiene siempre
```

```typescript
// ✅ Ajustar el paralelismo interno a la CPU asignada, no a la del nodo
// En el manifest: env UV_THREADPOOL_SIZE: "4"
// availableParallelism respeta mejor el entorno que os.cpus().length:
import os from 'node:os';
const parallelism = Math.max(1, Math.min(os.availableParallelism(), 4));
const pool = new Piscina({ maxThreads: parallelism });

// ✅ Health checks tolerantes a pausas cortas para no convertir throttling en restarts
// livenessProbe: timeoutSeconds: 3, failureThreshold: 5  (no matar por una pausa de 300 ms)
```

Sobre el debate "¿quitar CPU limits?": explico ambas posturas. Sin limit no hay throttling y las requests siguen garantizando la porción justa bajo contención (cpu.shares); el riesgo es el vecino ruidoso enmascarando infra-dimensionamiento y la variabilidad entre nodos vacíos/llenos. Con limit, el comportamiento es predecible pero hay que dimensionarlo para el *burst*, no para la media (regla práctica: limit ≥ p99 de uso por ventana; si el ratio de throttling > 1–5% sostenido, está mal dimensionado). En clusters modernos, `cpuManagerPolicy: static` con requests enteros da cores exclusivos para lo ultra-sensible.

Resultado tras aplicar A + threadpool acotado + probes ajustadas: ratio de throttling < 1%, p99 estable en 45 ms, cero restarts espurios.

**Prevención.** Alerta estándar de plataforma sobre ratio de throttling (> 5% warning, > 25% crítico); dashboards de p99 con overlay de throttling; dimensionado por percentiles de burst (VPA en recommend); load tests ejecutados con los mismos limits que producción (un clásico: staging sin limits que "no reproduce" el problema); documentar en la imagen base UV_THREADPOOL_SIZE y flags de Node coherentes con los recursos del pod.

**Qué espera oír el entrevistador:** la mecánica CFS de cuota por ventanas y por qué la media de CPU engaña, el impacto singular en Node (un solo event loop congelado afecta todo, incluidos probes), el diagnóstico con métricas de throttling y cgroups, el matiz requests-vs-limits con las dos posturas argumentadas, y el detalle de ajustar el paralelismo interno del runtime al CPU real del contenedor.

## 16. Graceful shutdown roto: 502s en cada deploy

**Categoría:** Kubernetes / Ciclo de vida · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen

Errores 502/ECONNRESET concentrados exactamente en las ventanas de deploy delatan un shutdown mal hecho: el pod recibe SIGTERM y muere de inmediato (o ignora la señal y llega el SIGKILL), cortando requests en vuelo, keep-alives y jobs a medias. El apagado correcto en Kubernetes es una coreografía: al recibir SIGTERM, primero fallar el readiness (dejar de recibir tráfico nuevo mientras el endpoint se propaga — de ahí el sleep en preStop), luego `server.close()` drenando requests en vuelo, cerrar consumidores/colas terminando el mensaje actual sin tomar más, cerrar pools y flush de telemetría, y salir antes del `terminationGracePeriodSeconds`. Sin esto, cada deploy es un mini-incidente.

### 📖 Respuesta detallada

**Escenario.** Cada rolling update genera un pico de ~0,3% de 502 en el ingress y ECONNRESET en clientes internos durante 20–30 s. También aparecen jobs de BullMQ en estado `stalled` y algún mensaje reprocesado tras cada deploy (conecta con el caso 14). El contenedor usa `CMD ["npm", "start"]` — primer problema: npm no reenvía señales de forma fiable, el proceso Node ni se entera del SIGTERM y muere con SIGKILL a los 30 s. Segundo problema: aunque llegara la señal, el handler hacía `process.exit(0)` inmediato. Tercero: el endpoint kube-proxy/ingress sigue mandando tráfico al pod unos instantes después del SIGTERM, porque la retirada del endpoint es asíncrona respecto a la señal.

**Diagnóstico paso a paso.**
1. *Correlación temporal:* los 502 coinciden al segundo con `kubectl rollout`. Los logs del pod que muere terminan abruptamente sin mensaje de shutdown ⇒ no hay manejo de SIGTERM efectivo.
2. *¿Llega la señal?* `kubectl exec` + `ps` dentro del contenedor: PID 1 es `npm`, Node es hijo. npm/sh como PID 1 es la causa clásica de señales perdidas. Se corrige con `CMD ["node", "dist/main.js"]` (o tini como init).
3. *¿Race de endpoints?* Aun con señal bien manejada, cerrar el listener inmediatamente produce 502: durante ~1–5 s tras el SIGTERM siguen llegando conexiones porque los endpoints se propagan de forma eventual. Se necesita la ventana de gracia (preStop sleep o delay interno) con readiness en rojo.
4. *Recursos con estado:* el worker de BullMQ y el consumer de Kafka no se cerraban: mensajes a medias ⇒ stalled/reentregas.

**Herramientas.** Métricas del ingress por ventana de deploy (tasa de 5xx anotada con eventos de rollout), logs de ciclo de vida del pod (`kubectl describe pod`: razones de kill, uso del grace period), logs estructurados de las fases de shutdown del propio servicio, contadores de conexiones activas del server (`server.getConnections`).

**Solución.**

```typescript
import { createServer } from 'node:http';

const server = createServer(app);
server.keepAliveTimeout = 65_000; // > idle timeout del LB (60s): evita resets de keep-alive
server.headersTimeout = 66_000;

let shuttingDown = false;

app.get('/health/ready', (_req, res) =>
  shuttingDown ? res.status(503).end() : res.status(200).end(),
);

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown: draining');

  // 1) Readiness en rojo + gracia para que los endpoints se propaguen
  await sleep(8_000); // alternativa: preStop hook con sleep equivalente

  // 2) Dejar de aceptar conexiones nuevas y drenar las que están en vuelo
  await new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeIdleConnections(); // Node >= 18: corta keep-alives ociosos

  // 3) Consumidores: terminar el mensaje/job actual, no tomar más
  await Promise.allSettled([
    kafkaConsumer.disconnect(),   // commitea offsets pendientes y abandona el grupo limpio
    bullWorker.close(),           // espera el job activo, no toma nuevos
  ]);

  // 4) Recursos y telemetría
  await Promise.allSettled([pool.end(), redis.quit(), otelSdk.shutdown()]);

  logger.info('shutdown: complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Cinturón: si el drenado se atasca, salir antes del SIGKILL con log propio
process.on('SIGTERM', () => setTimeout(() => process.exit(1), 25_000).unref());
```

Con `terminationGracePeriodSeconds: 30`, el presupuesto interno debe cerrar en ~25 s. En el Dockerfile, `CMD ["node", "dist/main.js"]` para que Node sea quien reciba la señal. El detalle de `keepAliveTimeout > idle timeout del LB` también arregla ECONNRESET *fuera* de los deploys (el server cerraba sockets que el LB creía vivos).

**Prevención.** Plantilla de servicio de la plataforma con el shutdown ya implementado y testeado; test de integración que manda SIGTERM bajo carga y afirma cero errores; deploy canary con presupuesto de error por rollout (si un deploy genera 5xx, es un bug, no un peaje); alerta sobre pods que agotan el grace period (kill forzado = shutdown roto); revisar que consumidores y crons también participan del drenado.

**Qué espera oír el entrevistador:** la coreografía completa y ordenada (readiness → gracia por propagación de endpoints → drenar HTTP → consumidores → pools/telemetría), el clásico de npm/sh como PID 1 tragándose señales, la race de endpoints que obliga al sleep, keepAliveTimeout vs LB, y tratar los 502 de deploy como bug con presupuesto cero, no como normalidad.
