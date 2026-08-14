# Módulo 4 · Laboratorio de diagnóstico Node

> **Curso 02 · TypeScript/Node** · 180 min · Práctica pura para [`typescript-microservicios/03-casos-y-problemas.md`](../../typescript-microservicios/03-casos-y-problemas.md)

## Runbook: qué ejecutas y qué te dice

```bash
# Estado del proceso
node --version && node -p "process.memoryUsage()"   # rss, heapTotal, heapUsed, external, arrayBuffers
kill -SIGUSR1 <pid>                                  # abre el inspector en un proceso vivo
chrome://inspect                                     # conectar DevTools

# CPU
node --cpu-prof --cpu-prof-dir=./prof app.js         # .cpuprofile → DevTools → Bottom-Up
npx 0x -- node app.js                                # flamegraph rápido
npx clinic flame -- node app.js

# Memoria
node --heapsnapshot-signal=SIGUSR2 app.js            # kill -USR2 <pid>
node --max-old-space-size=384 app.js                 # en contenedores, ~70% del límite
npx clinic heapprofiler -- node app.js

# Event loop y I/O
npx clinic doctor -- node app.js                     # te clasifica el problema
# métrica en producción: perf_hooks.monitorEventLoopDelay

# Sistema
ss -tanp | awk '{print $1}' | sort | uniq -c         # CLOSE_WAIT/TIME_WAIT
lsof -p <pid> | wc -l                                # descriptores abiertos
cat /sys/fs/cgroup/cpu.stat                          # nr_throttled → CPU throttling
```

**Los cuatro grandes síntomas y su primera medida:**

| Síntoma | Primera medida | Si sale plano, siguiente |
|---|---|---|
| Latencia alta, CPU alta | `--cpu-prof` | GC (`--trace-gc`) |
| Latencia alta, CPU baja | event loop delay | pools, I/O externa, DNS |
| RSS creciente | 3 heap snapshots comparados | `external`/`arrayBuffers` (Buffers) |
| Errores en deploys | logs de shutdown + readiness | ver módulo 3 |

---

## Escenario 1 · Memory leak

**Monta:** `const cache = new Map()` global; cada petición mete un objeto de 100 KB con clave única.

**Diagnóstico:** `process.memoryUsage().heapUsed` creciente entre GCs; tres snapshots con carga en medio; DevTools → *Comparison* → ordenar por *Delta*; abre *Retainers* hasta llegar a `cache`.

**Arreglo:** `lru-cache` con `max` y `ttl`. **Verificación:** 20 min de carga con heapUsed estable.

**Variante importante:** si `heapUsed` es plano pero el RSS crece, mira `external` y `arrayBuffers` (Buffers retenidos), o fragmentación del allocator. Es un caso distinto y muy citado en entrevistas.

---

## Escenario 2 · Event loop bloqueado

**Monta:** endpoint con `JSON.parse` de un payload de 30 MB, o una regex catastrófica sobre input controlado por el usuario (`/^(a+)+$/`).

**Diagnóstico:** event loop delay p99 en segundos; `--cpu-prof` señala el frame exacto; el health check falla aunque el proceso vive.

**Arreglo:** límite de tamaño de body (`body-parser` `limit`), streaming, worker thread, y regex sin backtracking (o `re2`). **Este escenario es también un caso de seguridad: ReDoS es una DoS de aplicación** — ver [curso 06](../06-seguridad/).

---

## Escenario 3 · OOM procesando ficheros

**Monta:** `fs.readFile` de un NDJSON de 3 GB con `--max-old-space-size=512`.

**Diagnóstico:** el proceso muere con `JavaScript heap out of memory` o el pod con 137. Nota la diferencia: el primero es V8 rindiéndose; el segundo, el kernel.

**Arreglo:** `pipeline` + parser por líneas + escritura por lotes. Mide RSS máximo en ambas versiones.

---

## Escenario 4 · Pool de Postgres agotado

**Monta:** `pg` con `max: 5`, un endpoint que hace `client = await pool.connect()` y no llama a `client.release()` en el camino de error.

**Diagnóstico:** las peticiones se quedan colgadas sin error claro; `pool.waitingCount` alto; en la BD, `SELECT * FROM pg_stat_activity` muestra conexiones `idle in transaction`.

**Arreglo:** `try/finally` con `release()`, o `pool.query()` directo cuando no necesitas transacción; `statement_timeout` e `idle_in_transaction_session_timeout` en el servidor como red de seguridad.

---

## Escenario 5 · Race condition: doble descuento de stock

**Monta:** dos peticiones concurrentes que leen stock, restan y escriben (el clásico del [curso 00 módulo 2](../00-fundamentos-distribuidos/02-consistencia-y-cap.md), ahora en Node).

**Diagnóstico:** reproducirlo con `Promise.all` de 50 peticiones; el resultado no es determinista. **Ojo con el falso mito:** que Node sea monohilo *no* evita la carrera, porque el `await` intercala operaciones.

**Arreglo:** `UPDATE ... WHERE stock >= 1` atómico, o bloqueo optimista con `version`. Verifica con 1.000 concurrentes que nunca hay stock negativo.

---

## Escenario 6 · Timeouts en cascada A→B→C

Reproduce el laboratorio del [curso 00 módulo 4](../00-fundamentos-distribuidos/04-resiliencia.md) con `undici`: presupuesto de latencia decreciente, `AbortSignal.timeout()` propagado, reintento en una sola capa con jitter, y un breaker (`opossum`). Mide la amplificación antes y después.

```ts
const signal = AbortSignal.timeout(restanteMs());   // presupuesto propagado
await fetch(url, { signal, dispatcher: agent });
```

---

## Escenario 7 · CPU throttling en Kubernetes

**Monta:** despliega con `limits.cpu: 200m` y carga moderada.

**Diagnóstico:** latencia con picos periódicos, CPU "al 20%" en las métricas del pod, y `nr_throttled`/`container_cpu_cfs_throttled_seconds_total` creciendo. Sin mirar esa métrica, este caso parece magia negra.

**Arreglo:** dimensionar con datos reales (percentiles de uso), subir el límite o quitarlo en servicios sensibles a latencia manteniendo `requests` correctos. Discute el trade-off con el equipo de plataforma: quitar límites mejora la latencia y empeora la previsibilidad del nodo.

---

## Escenario 8 · Mensajes duplicados y perdidos

Con BullMQ o Kafka: mata el worker (a) antes de completar el job, (b) después de procesar y antes de commitear. Cuenta duplicados y pérdidas. Implementa dedupe por `jobId`/`messageId` en una tabla y demuestra convergencia. Es el mismo laboratorio del [curso 00 módulo 3](../00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md) en tu stack.

---

## Plantilla para narrarlo en la entrevista

> "Teníamos un servicio Node con p99 de 4 s y CPU al 30%. Lo primero que miré fue el retardo del event loop, que estaba en 900 ms de p99 — eso descartaba la red y la base de datos. Un `--cpu-prof` bajo carga señaló `JSON.parse` de las respuestas de un proveedor, que había pasado a devolver 20 MB. Contención: límite de tamaño y rechazo temprano. Solución: pedirle al proveedor paginación y parsear en streaming. Prevención: alerta sobre event loop delay y un test de carga con payload grande en CI."

Treinta segundos. Síntoma → medida → descarte → causa → contención → fix → prevención.

## ✅ Autoevaluación final del curso 02

1. Latencia alta con CPU baja en Node: ¿qué mides primero y qué descarta cada medida?
2. `heapUsed` plano pero RSS creciente: ¿qué sospechas?
3. ¿Por qué una app monohilo puede tener race conditions?
4. ¿Cómo demuestras que un rollout no pierde peticiones?
5. ¿Qué métrica de Node incluirías en el dashboard por defecto de cualquier servicio y por qué?

## 🎯 Preguntas del banco que ya puedes responder

Los **16 casos** de [`typescript-microservicios/03-casos-y-problemas.md`](../../typescript-microservicios/03-casos-y-problemas.md).

---

**Anterior:** [Módulo 3](03-arquitectura-de-servicios.md) · **Fin del curso 02.**
