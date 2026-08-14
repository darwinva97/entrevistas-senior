# Módulo 6 · Observabilidad y método de diagnóstico

> **Curso 00 · Fundamentos** · 90 min · Cierra el curso 00

## Por qué esto importa en la entrevista

En las preguntas **[CASO]** de este repositorio, el entrevistador no evalúa si aciertas la causa: evalúa **cómo la buscas**. Un candidato mid dispara hipótesis ("será la BD", "reinicia el pod"); un senior sigue un método: *síntoma → qué mediría → qué descarta cada medida → hipótesis → verificación → contención → causa raíz → prevención*.

Y para poder medir, el sistema tiene que estar instrumentado. De ahí que observabilidad y diagnóstico sean el mismo módulo.

## Modelo mental: monitorización responde a preguntas conocidas; observabilidad, a las nuevas

- **Monitorización:** dashboards y alertas sobre fallos que ya sabes que existen (CPU, errores 5xx, lag).
- **Observabilidad:** poder responder *"¿por qué esta petición concreta de este cliente tardó 4 s?"* sin desplegar código nuevo. Requiere **alta cardinalidad** (poder filtrar por `cliente_id`, `endpoint`, `versión`, `zona`) y correlación entre señales.

### Las tres señales, y qué pregunta responde cada una

| Señal | Responde | Coste | Cardinalidad |
|---|---|---|---|
| **Métricas** | ¿Hay un problema y desde cuándo? | Muy bajo | Baja (¡cuidado con las etiquetas!) |
| **Trazas** | ¿Dónde se va el tiempo en este flujo? | Medio (muestreo) | Alta |
| **Logs** | ¿Qué pasó exactamente en este caso? | Alto | Máxima |

El flujo sano de un incidente es **métrica → traza → log**: la métrica te dice que hay fuego y dónde, la traza qué salto se lo come, el log el detalle. Si empiezas por logs (`grep` en producción), estás perdiendo tiempo.

> **⚠️ Trampa:** meter `user_id` o `request_id` como etiqueta de una métrica de Prometheus. Cada combinación de etiquetas crea una serie temporal: es la vía rápida a tumbar tu propio sistema de métricas (*cardinality explosion*). Lo de alta cardinalidad va en trazas/logs, no en métricas.

## Qué instrumentar (y en qué orden)

**RED, para servicios** (lo que ve el usuario): **R**ate (rps), **E**rrors (tasa y tipo), **D**uration (histograma, no promedio). Por endpoint y por versión de despliegue.

**USE, para recursos** (CPU, disco, pool, cola): **U**tilization, **S**aturation (cuánto trabajo espera), **E**rrors. La saturación es la que casi nadie mide y la que más avisa: profundidad de cola, hilos esperando conexión, `run queue` del SO, consumer lag.

**Los cuatro señales doradas de Google** = RED + saturación.

Mínimo viable para un servicio nuevo, en este orden:
1. Histograma de latencia y contador de errores por endpoint (RED).
2. Saturación de los pools (BD, HTTP, hilos) y de las colas.
3. Trazas distribuidas con propagación de contexto W3C `traceparent`.
4. Logs estructurados en JSON con `trace_id` incluido.
5. Métricas de negocio: pedidos/min, pagos fallidos/min. **Son las que detectan los incidentes que la infra no ve** (todo verde y cero pedidos = incidente).

```json
{"ts":"2026-08-14T10:00:00Z","level":"error","msg":"pago rechazado",
 "trace_id":"4bf92f...","span_id":"00f067...","pedido_id":"A1",
 "proveedor":"stripe","codigo":"card_declined","duracion_ms":842}
```

Reglas de logging que se notan en la entrevista: estructurado siempre; nunca datos personales ni tokens (ver [curso 06](../06-seguridad/)); un log por evento significativo, no por línea de código; niveles con criterio (`ERROR` = alguien debe mirarlo).

### Trazas: lo que hay que saber

- **Contexto propagado** por cabeceras (`traceparent`); si se rompe en una cola o en un `ExecutorService`, la traza se parte — instrumenta también la propagación asíncrona.
- **Muestreo:** *head-based* (decides al inicio, barato, pierde los raros) vs *tail-based* (decides al final y te quedas con los lentos y los erróneos; es lo que quieres, cuesta más infraestructura). Una respuesta senior: muestreo bajo por defecto + 100% de errores y lentos.
- **Span attributes** con los identificadores de negocio: sin ellos, la traza no te lleva al caso concreto.
- OpenTelemetry es el estándar de facto: API/SDK + colector; te desacopla del backend (Jaeger, Tempo, Datadog…).

## SLI, SLO y por qué te lo preguntan

- **SLI:** una medida de la experiencia del usuario (% de peticiones < 300 ms, % sin error).
- **SLO:** el objetivo sobre ese SLI (99,9% mensual).
- **Error budget:** lo que te queda por gastar (0,1% ≈ 43 min/mes). Es la herramienta política: si te lo has gastado, se congelan las features y se trabaja en fiabilidad.
- **Alerta sobre síntomas, no sobre causas.** "CPU al 90%" no es una alerta accionable; "el 5% de los checkouts fallan" sí. Las alertas sobre causas generan fatiga y ruido.
- Alertas basadas en **burn rate** del error budget (rápido: 2% en 1 h → página; lento: 10% en 3 días → ticket).

## Método de diagnóstico en 7 pasos (memorízalo)

Este es el guion que debes verbalizar en cualquier **[CASO]**:

1. **Define el síntoma con números.** "¿Qué porcentaje, desde cuándo, en qué endpoints, para qué clientes?" Nunca aceptes "va lento" sin acotarlo.
2. **¿Qué cambió?** Deploys, feature flags, configuración, migraciones, tráfico, un proveedor, un certificado, una cuota. El 80% de los incidentes tiene un cambio detrás; los otros son acumulativos (disco, memoria, datos que crecieron).
3. **Delimita el ámbito.** ¿Todos los pods o unos pocos? ¿Una AZ? ¿Un tenant? ¿Solo escrituras? Cada respuesta elimina medio árbol de hipótesis.
4. **Sigue el tiempo, no la intuición.** Traza una petición lenta y mira dónde se va: red, cola, CPU, espera de I/O, lock, GC.
5. **Formula hipótesis falsables y ordénalas por (probabilidad × facilidad de comprobación).** "Si fuese la BD, la latencia de la BD habría subido; no subió → descartada."
6. **Contén antes de entender del todo.** Rollback, apagar el flag, subir réplicas, cortar reintentos, tirar carga. Mitigar y diagnosticar son actividades distintas y la primera va primero.
7. **Causa raíz + prevención.** No basta el fix: ¿qué detección faltaba (alerta), qué barrera faltaba (límite, validación, test) y qué haría que este fallo fuese aburrido la próxima vez?

**💬 Cómo lo dices al empezar un caso:** *"Antes de teorizar, necesito tres datos: desde cuándo, qué porcentaje del tráfico y si coincide con algún cambio. Con eso descarto medio espacio de búsqueda."*

## Caja de herramientas por síntoma

| Síntoma | Primeras medidas | Herramientas |
|---|---|---|
| Latencia alta, CPU baja | saturación de pools, esperas de I/O, locks | trazas, métricas de pool, `pg_stat_activity` |
| CPU al 100% | perfil de CPU en caliente | async-profiler (JVM), `pprof` (Go), `--cpu-prof` (Node) |
| Memoria que crece | heap vs RSS, objetos dominantes | heap dump + MAT, `pprof heap`, `--heapsnapshot` |
| Errores intermitentes | correlación con pod/AZ/versión | métricas segmentadas, logs con `trace_id` |
| Todo lento tras deploy | comparar por versión y por edad del pod | métricas con etiqueta `version`, canary |
| Lag creciente en cola | throughput vs producción, rebalanceos | métricas del broker, `consumer-groups --describe` |
| "Solo pasa en producción" | datos, concurrencia, entorno, estado acumulado | `EXPLAIN` comparado, perfiles, feature flags |

## Errores comunes que delatan a un no-senior

- Empezar por `grep` en los logs en vez de mirar métricas.
- Reiniciar el servicio como primera medida y perder toda la evidencia (haz *antes* el heap dump / stack dump).
- Cambiar dos cosas a la vez y no saber cuál funcionó.
- Confundir correlación con causa ("subió el tráfico" cuando el tráfico subió *porque* los clientes reintentaban).
- Postmortem que termina en "el desarrollador se equivocó" en vez de en qué barrera del sistema faltaba.

## 🧪 Laboratorio — instrumenta y diagnostica a ciegas

1. Instrumenta un servicio con OpenTelemetry: trazas + histograma de latencia + logs JSON con `trace_id`. Levanta Jaeger/Tempo y Prometheus + Grafana con Docker Compose.
2. Verifica que puedes ir de una alerta a la traza y de la traza al log del caso concreto. **Si no puedes hacer ese recorrido en 3 clics, tu observabilidad no sirve.**
3. **Juego de fallos a ciegas:** pide a alguien (o a un script) que active *uno* de estos sin decírtelo, y diagnostícalo con el método de 7 pasos, cronometrado:
   - un `sleep` aleatorio en el 5% de peticiones,
   - una consulta sin índice tras cargar 5M de filas,
   - un pool de BD reducido a 2 conexiones,
   - un memory leak (lista global que crece),
   - un `Retry-After` ignorado y reintentos en dos capas,
   - un reloj desfasado en un contenedor.
4. Escribe el **postmortem** de uno de ellos con el formato: impacto, cronología, causa raíz, hipótesis descartadas, fix inmediato, fix estructural, acciones de prevención con dueño.

**Entregable:** el postmortem. Llévalo mentalmente a la entrevista: es exactamente lo que te van a pedir que narres.

## ✅ Autoevaluación

1. Diferencia entre monitorización y observabilidad, con un ejemplo de pregunta que solo la segunda responde.
2. ¿Qué es RED, qué es USE y cuál usas para un pool de conexiones?
3. ¿Por qué no debes etiquetar métricas con `user_id`?
4. Explica muestreo head-based vs tail-based y cuál pedirías.
5. Enumera los 7 pasos del método de diagnóstico sin mirar.
6. ¿Por qué "CPU > 90%" es mala alerta y cuál sería la buena?
7. Vas a reiniciar un pod con un memory leak. ¿Qué haces antes?

## 🎯 Preguntas del banco que ya puedes responder

- Todos los **[CASO]** del repositorio: este módulo es el guion con el que se responden.
- [`java-microservicios/02-spring-y-microservicios.md`](../../java-microservicios/02-spring-y-microservicios.md) — 14 (Micrometer/OTel)
- [`microfrontends/02-casos-y-problemas.md`](../../microfrontends/02-casos-y-problemas.md) — 12 (error tracking por equipo)
- [`cloud/gcp/02-microservicios-y-casos.md`](../../cloud/gcp/02-microservicios-y-casos.md) y [`cloud/azure/02-microservicios-y-casos.md`](../../cloud/azure/02-microservicios-y-casos.md) — observabilidad gestionada

## Para profundizar

- Google SRE Book y SRE Workbook (SLO, error budgets, alertas por burn rate).
- Charity Majors et al., *Observability Engineering* (alta cardinalidad).
- Brendan Gregg, método USE y sus *flame graphs*.

---

**Anterior:** [Módulo 5](05-latencia-y-colas.md) · **Fin del curso 00.** Continúa con tu curso de lenguaje ([01 Java](../01-java-senior/), [02 TypeScript](../02-typescript-node-senior/), [03 Go](../03-go-senior/)) o directamente con [08 System design](../08-system-design/).
