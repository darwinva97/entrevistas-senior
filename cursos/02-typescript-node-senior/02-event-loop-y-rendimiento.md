# Módulo 2 · Event loop, memoria y rendimiento en Node

> **Curso 02 · TypeScript/Node** · 180 min · El módulo decisivo del curso

## Por qué esto importa en la entrevista

Todo lo raro que hace Node en producción —health checks que fallan con el proceso vivo, p99 que se dispara con ciertos payloads, OOM procesando un CSV— viene de un solo hecho: **tu código corre en un único hilo**. Un senior de Node puede razonar sobre ese hilo como un senior de Java razona sobre la JVM.

## Modelo mental: un bucle, seis fases y dos colas privilegiadas

```
   ┌──► timers            setTimeout / setInterval vencidos
   │    pending callbacks  callbacks de I/O diferidos (algunos errores TCP)
   │    idle / prepare     interno de libuv
   │    poll  ◄─────────── espera aquí por I/O; ejecuta sus callbacks
   │    check              setImmediate
   └──  close callbacks    'close' de sockets/streams

   Entre CADA callback (y entre fases) se vacían por completo:
     1) process.nextTick queue     ← prioridad máxima
     2) microtasks (promesas)      ← await/then
```

Consecuencias que hay que saber explicar:

- **`await` no libera la CPU**, libera el *hilo mientras espera I/O*. Si lo que haces es cómputo, `await` no ayuda en nada.
- **Un bucle de `nextTick`/promesas puede matar de hambre al event loop**: las microtasks se vacían *enteras* antes de volver al bucle. Un `Promise` recursivo sin `setImmediate` hace que el servidor no acepte ni un socket más, con el proceso perfectamente "vivo" (health check por TCP en verde, HTTP sin respuesta). Es el [CASO] 2 del banco.
- **`setImmediate` vs `setTimeout(0)`:** dentro de un ciclo de I/O, `setImmediate` siempre va antes (fase check tras poll). Fuera, el orden no es determinista. Para "ceder" el control en un bucle pesado, `setImmediate` es la herramienta correcta.
- **El thread pool de libuv** (por defecto 4, `UV_THREADPOOL_SIZE`) sirve a `fs`, `dns.lookup`, `crypto.pbkdf2`, `zlib`. Saturarlo produce latencia en operaciones aparentemente asíncronas. Las operaciones de red **no** usan el pool (van con epoll/kqueue).

## Bloqueo del event loop: detectarlo y evitarlo

Culpables típicos: `JSON.parse`/`stringify` de payloads grandes, expresiones regulares con backtracking catastrófico (ReDoS), `crypto` síncrono, `zlib` síncrono, bucles sobre arrays enormes, `fs.readFileSync`, y serialización de respuestas gigantes.

**Detección:**

```js
// Métrica imprescindible en producción: retardo del event loop
import { monitorEventLoopDelay } from 'node:perf_hooks';
const h = monitorEventLoopDelay({ resolution: 20 }); h.enable();
setInterval(() => console.log('p99 lag ms', h.percentile(99) / 1e6), 5000);
```

Expórtala a Prometheus (`nodejs_eventloop_lag_p99_seconds`) y **alerta sobre ella**: es el equivalente en Node a las pausas de GC en la JVM.

**Soluciones, por orden:**
1. No hacer el trabajo (paginar, filtrar en la BD, streaming).
2. Trocear con `setImmediate` cada N elementos para ceder el bucle.
3. **Worker threads** para CPU real (parseo pesado, imágenes, criptografía). Comparte memoria con `SharedArrayBuffer`/transferencias, misma máquina, mismo proceso.
4. **Cluster / múltiples réplicas** para escalar por núcleos. En Kubernetes suele ser mejor *un proceso por pod* y escalar pods (más simple de observar y limitar) que `cluster` dentro del contenedor.
5. **`child_process`** para ejecutables externos o aislamiento total.

| | worker_threads | cluster | child_process |
|---|---|---|---|
| Para qué | CPU dentro del proceso | escalar a N núcleos el mismo servidor | tareas/binarios externos |
| Memoria | compartible | separada | separada |
| Coste de arranque | ~10 ms | proceso completo | proceso completo |

## Streams y backpressure

La respuesta a "procesa un fichero de 10 GB en un servicio con 512 MB":

```js
import { pipeline } from 'node:stream/promises';
await pipeline(
  fs.createReadStream('pedidos.ndjson'),      // trocea
  split2(),                                    // línea a línea
  new Transform({ objectMode: true, transform(l, _, cb) { ... } }),
  escribirEnBD                                 // sink lento
);   // pipeline propaga errores y CIERRA todo; nunca uses .pipe() a mano en producción
```

Lo que hay que explicar: `highWaterMark` es el umbral del buffer interno; `write()` devuelve `false` cuando lo supera y **debes dejar de escribir hasta el evento `drain`**; ignorar eso es exactamente cómo se llena la memoria. `pipeline` gestiona esa negociación por ti y además propaga el cierre y los errores (`.pipe()` no destruye el origen si falla el destino: fuga clásica de descriptores).

Backpressure es el mismo concepto del [curso 00 módulo 4](../00-fundamentos-distribuidos/04-resiliencia.md), aplicado dentro del proceso. Y aplica igual a un consumidor de cola: si procesas más lento de lo que llegan mensajes, necesitas `pause()`/`resume()` o prefetch limitado, no un array creciente.

**JSON grande:** `JSON.parse` es síncrono y O(n) bloqueante; alternativas: NDJSON línea a línea, parsers en streaming (`stream-json`), o formatos binarios (protobuf/msgpack) si el volumen lo justifica.

## Memoria y GC en V8

```
Heap V8 = new space (scavenger, semispaces) + old space (mark-compact incremental/concurrente)
        + large object space (>~600 KB, directo a old)
Fuera del heap V8: Buffers (memoria externa), código, stacks, memoria nativa de addons
```

- `--max-old-space-size=<MB>`: por defecto V8 no conoce el límite del contenedor; en un pod de 512 MB conviene fijarlo ~ 70–75% del límite (por ejemplo `--max-old-space-size=384`) para que el GC actúe antes de que el kernel te mate con OOMKill (137).
- **Sawtooth agresivo** (memoria en sierra muy marcada + CPU alta) = tasa de asignación excesiva: busca el hot path que crea objetos por petición.
- **Buffers cuentan fuera del heap:** un servicio que acumula `Buffer` puede reventar el RSS con el heap "pequeño". Ese es un caso del banco.
- Fugas típicas en Node: closures que capturan objetos grandes, `Map`/array global sin límite, listeners no removidos (`MaxListenersExceededWarning` es la pista), timers no limpiados, y cachés sin TTL.

**Diagnóstico:**

```bash
node --heapsnapshot-signal=SIGUSR2 app.js   # kill -USR2 <pid> genera .heapsnapshot
# Compara 3 snapshots en Chrome DevTools con la vista "Comparison": lo que crece siempre es el leak
node --cpu-prof --cpu-prof-dir=./prof app.js   # perfil de CPU (o kill -SIGUSR1 + inspector)
npx clinic doctor -- node app.js               # te dice si el problema es CPU, I/O o GC
```

## Cliente HTTP: keep-alive, DNS y pools

Casos reales del banco que salen de aquí:

- **Sin keep-alive**, cada petición saliente abre conexión TCP + TLS: latencia extra y agotamiento de puertos efímeros bajo carga. En Node 19+ el agente global tiene keep-alive activo, pero **`maxSockets` por host sigue siendo un pool**: si es pequeño, tus peticiones hacen cola *dentro* del proceso, y eso se ve como latencia sin causa aparente.
- **`undici`** (el fetch nativo) con `Agent({ connections, pipelining })` y `headersTimeout`/`bodyTimeout` es lo que se usa hoy; `axios` sobre el `http.Agent` clásico requiere configurarlo explícitamente.
- **DNS:** `dns.lookup` (que usa el thread pool) sin caché puede convertirse en cuello de botella con mucha concurrencia; y un TTL mal gestionado hace que sigas llamando a IPs viejas tras un failover.
- **Timeouts:** hay al menos tres (conexión, headers, body). Sin ellos, una petición colgada retiene un socket del pool para siempre.

## Errores comunes que delatan a un no-senior

- "Node es asíncrono, no se bloquea" — se bloquea con cualquier cómputo.
- Usar `await` esperando que paralelice (para eso está `Promise.all`, con cuidado del fan-out sin límite: usa `p-limit`).
- `.pipe()` sin manejo de errores ni `pipeline`.
- No fijar `--max-old-space-size` en contenedores.
- Ignorar `unhandledRejection` (en Node 15+ **termina el proceso** por defecto).
- No medir el retardo del event loop.
- Meter `JSON.parse` de 20 MB en el hilo principal y culpar a "Node que es lento".

## 🧪 Laboratorio

1. **Bloquea el bucle:** endpoint con un bucle de 3 s. Con `autocannon`, mide p50/p99 del *resto* de endpoints. Añade la métrica de event loop delay y observa la correlación.
2. **Starvation de microtasks:** función recursiva con promesas sin ceder. Comprueba que el proceso vive, el health check TCP pasa y el servidor no responde. Arréglalo con `setImmediate` y explica por qué funciona.
3. **Worker thread:** mueve un cálculo pesado a un worker y vuelve a medir; grafica antes/después.
4. **Backpressure real:** genera un NDJSON de 5 GB y procésalo (a) con `readFile` (observa el OOM), (b) con `pipeline` y límite de memoria de 256 MB. Mide RSS en ambos.
5. **Leak:** `Map` global que crece por petición; toma tres heap snapshots y encuéntralo en la vista *Comparison*.
6. **Keep-alive:** compara 1.000 peticiones salientes con y sin agente keep-alive; mira `ss -s` y los puertos efímeros en `TIME_WAIT`.
7. **`--cpu-prof`** bajo carga: encuentra el método más caro de tu servicio y optimízalo.

**Entregable:** gráfica de event loop delay vs latencia p99 de tu servicio, y el antes/después de una de las optimizaciones.

## ✅ Autoevaluación

1. Enumera las fases del event loop y di dónde encajan `nextTick` y las promesas.
2. El proceso está vivo, el puerto acepta conexiones, pero no responde nada. ¿Qué hipótesis manejas?
3. ¿Por qué `await` no evita bloquear la CPU?
4. ¿Cuándo worker_threads y cuándo más réplicas?
5. Explica backpressure con `highWaterMark` y `drain`.
6. Pod de 512 MB, Node muere con 137 y el heap se ve en 300 MB. ¿Qué pasa?
7. ¿Por qué el keep-alive cambia tanto la latencia y qué problema puede crear el pool del agente?

## 🎯 Preguntas del banco que ya puedes responder

- [`typescript-microservicios/02-node-y-microservicios.md`](../../typescript-microservicios/02-node-y-microservicios.md) — 1, 2, 3, 4, 15, 16
- [`typescript-microservicios/03-casos-y-problemas.md`](../../typescript-microservicios/03-casos-y-problemas.md) — 1, 2, 3, 11, 12, 15
- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — 2 (p99 tras deploy), 9 (dependencia lenta)

---

**Anterior:** [Módulo 1](01-sistema-de-tipos.md) · **Siguiente:** [Módulo 3 · Arquitectura de servicios en Node/NestJS](03-arquitectura-de-servicios.md)
