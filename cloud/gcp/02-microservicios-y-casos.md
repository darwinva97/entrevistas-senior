# Microservicios en GCP y Casos de Producción — Entrevistas Senior

Preguntas de diseño de microservicios en GCP y casos reales de diagnóstico de incidentes ([CASO]).

---

## 1. Arquitectura de referencia de microservicios en GCP: GKE/Cloud Run + Pub/Sub

**Categoría:** Arquitectura de microservicios · **Tipo:** Conceptual

### 📝 Respuesta resumen
Mi arquitectura de referencia: **Global External ALB + Cloud Armor** en el borde, un **API Gateway/BFF**, servicios en **Cloud Run** (default) o **GKE Autopilot** (cuando hay workloads no-HTTP o mesh), comunicación síncrona con gRPC/REST autenticada por IAM, y asíncrona con **Pub/Sub** (eventos de dominio, outbox). Datos: base por servicio (Cloud SQL/AlloyDB, Spanner o Firestore según el caso), **Memorystore** para caché. Transversal: Artifact Registry + Cloud Build/Deploy, Secret Manager, OpenTelemetry hacia Cloud Trace/Monitoring/Logging, todo en Shared VPC con IaC (Terraform).

### 📖 Respuesta detallada
**Borde y entrada**: una sola IP anycast con el Global External ALB, TLS gestionado, **Cloud Armor** (WAF + rate limiting) y Cloud CDN para contenido cacheable. Detrás, según el caso: serverless NEGs directos a Cloud Run, o un gateway propio (Envoy/Kong) o **API Gateway/Apigee** si se necesita gestión de API keys, planes de consumo y transformación. Para tráfico interno este-oeste, Internal ALB o llamadas directas servicio-a-servicio con tokens OIDC de la SA emisora validados por IAM (`roles/run.invoker`) — autenticación entre servicios sin escribir código de authz.

**Capa de servicios**: Cloud Run como plataforma por defecto (escala a cero para servicios de baja demanda, escalado por concurrencia para APIs, jobs para batch). GKE Autopilot para lo que Cloud Run no modela bien: consumidores de Kafka, procesos con estado de larga vida, operators. La clave arquitectónica es la **uniformidad**: contenedores OCI en Artifact Registry, una SA dedicada por servicio con mínimo privilegio, config por variables de entorno + **Secret Manager** (montado o inyectado), y *readiness* clara (startup probes en GKE, health endpoint en Cloud Run).

**Comunicación asíncrona — el corazón del desacople**: Pub/Sub como bus de eventos de dominio. Convenciones que impongo: un topic por *tipo de evento agregado* (`orders.events`) con atributos para filtrar (las suscripciones soportan **filters** por atributo, evitando fan-out inútil), esquemas versionados (Pub/Sub schema registry con Avro/Protobuf o contrato en el repo), **outbox pattern** en los productores para atomicidad DB+evento, idempotencia en todos los consumidores, y DLQ con alertas en toda suscripción. Push subscriptions hacia Cloud Run (el flow control lo hace Pub/Sub); StreamingPull en GKE para throughput alto.

**Datos**: *database-per-service* estricto — compartir esquema es acoplar deployments. Cloud SQL/AlloyDB para lo relacional normal, Spanner si hay escala/globalidad, Firestore para modelos documentales, BigQuery como sink analítico alimentado por eventos (no queries OLTP cruzadas). Las necesidades de lectura entre servicios se resuelven con eventos + vistas materializadas locales (CQRS ligero), no con joins cross-service.

**Plataforma transversal**: Cloud Build (o GitHub Actions con WIF) → Artifact Registry (con análisis de vulnerabilidades y, si el riesgo lo amerita, Binary Authorization) → **Cloud Deploy** con progresión dev→staging→prod y canary. Observabilidad: OpenTelemetry SDK en cada servicio exportando a Cloud Trace/Monitoring, logs estructurados JSON a Cloud Logging con `trace` correlacionado. Red: Shared VPC, Direct VPC egress desde Cloud Run para alcanzar Memorystore/Cloud SQL privados, y salida a internet por Cloud NAT.

**Trade-offs que explicito**: empezar con un *modular monolith* y extraer servicios cuando haya fricción real de equipos es válido y a menudo correcto; cada servicio nuevo añade costo fijo (pipeline, SLOs, on-call). El error común es el "microservicio distribuido monolítico": servicios separados que se llaman síncronamente en cadena (la disponibilidad compuesta se multiplica: cinco servicios al 99.9% en cadena ≈ 99.5%) — por eso el sesgo hacia eventos y por eso los presupuestos de timeout/retry se diseñan de extremo a extremo, no por servicio aislado.

---

## 2. Cloud Run internals: concurrencia por instancia, cold starts y CPU throttling fuera de request

**Categoría:** Cómputo / Serverless · **Tipo:** Conceptual

### 📝 Respuesta resumen
Cloud Run escala **instancias** que atienden hasta `concurrency` requests simultáneas (default 80). El autoscaler crea instancias según concurrencia observada y CPU (~60% objetivo). Un **cold start** = arrancar contenedor + runtime + tu init; se mitiga con `min-instances`, startup CPU boost e imágenes ligeras. El detalle que más gente ignora: con el billing por defecto (request-based), la **CPU se estrangula a casi cero fuera de una request en vuelo** — cualquier trabajo en background (threads, timers, flush de telemetría) se congela; para eso existe *instance-based billing* (CPU always-on).

### 📖 Respuesta detallada
**Modelo de ejecución**: cada revisión define CPU/memoria (hasta 8 vCPU/32 GiB), `concurrency` (1–1000) y límites de escalado (`min-instances`, `max-instances`). El autoscaler decide instancias con base en: concurrencia en vuelo vs objetivo, utilización de CPU (~60%) y requests en cola. Puntos finos: (a) `concurrency=1` reproduce el modelo Lambda y multiplica instancias (y costo y cold starts) — para APIs I/O-bound conviene 50–250 si el runtime es concurrente (Go, Java con threads, Node async); (b) la concurrencia real alcanzable depende de tu app: si con 80 concurrentes tu p99 explota por contención de CPU, el número correcto es menor y se encuentra con pruebas de carga; (c) el *request timeout* (default 5 min, máx 60) corta la request pero no mata la instancia.

**Cold starts**: ocurren al escalar desde cero o crecer rápido. Componentes: pull de imagen (mitigado por caché de Cloud Run, pero imágenes de 1 GB duelen), arranque del runtime (JVM clásica es lo peor: segundos; Go/Rust: decenas de ms), y tu inicialización (conexiones a DB, carga de config). Mitigaciones concretas: **`min-instances`** ≥1 para eliminar el cero (se paga tarifa idle reducida por instancia caliente); **startup CPU boost** (CPU extra durante el arranque, gratis en la práctica para acortar boot); imágenes distroless/multistage pequeñas; en Java, CRaC/AppCDS/GraalVM native-image o pasar a frameworks ligeros; lazy-init de dependencias no críticas; y *startup probes* correctas para no recibir tráfico antes de tiempo. Importante para el diseño: los cold starts afectan p99, no la media — con tráfico estable y `min-instances`, un servicio bien hecho tiene cold starts solo en picos de escalado.

**CPU throttling fuera de request — la trampa clásica**: con el modelo request-based (default), solo hay CPU asignada mientras existe al menos una request en vuelo; al terminar la última, la instancia queda viva pero con CPU estrangulada (~0.01 vCPU). Consecuencias reales: exporters de OpenTelemetry con envío batch en background pierden spans; los *goroutines*/threads que "seguían trabajando" tras responder se congelan y despiertan segundos/minutos después (mensajes de "trabajo fantasma" al llegar la siguiente request); conexiones keep-alive y consumidores propios de colas se comportan erráticamente. Soluciones: (1) **instance-based billing / CPU always-on**: pagas la instancia completa mientras vive, pero con tráfico sostenido suele ser *más barato* que el modelo por request (no hay cargo por request-CPU) y habilita background work legítimo; (2) no hacer trabajo post-respuesta: delegarlo a Pub/Sub + otro servicio, o a Cloud Tasks; (3) para telemetría, forzar flush antes de responder o usar el sidecar/collector con la instancia en always-on.

**Otros internals que menciono**: sidecars (collector de OTel, proxies) y volúmenes (GCS FUSE) por revisión; *session affinity* best-effort (no garantía — no diseñar estado pegajoso); el gateway de Cloud Run buffériza y las requests se enrutan a instancias sanas; **direct VPC egress** (mejor latencia y sin costo de connector frente a Serverless VPC Access); y el orden de apagado: SIGTERM con ~10 s de gracia — manejar el drain (cerrar servers, flush) en el handler de SIGTERM es obligatorio para no perder trabajo.

---

## 3. Sagas y patrón Outbox con Pub/Sub: consistencia entre microservicios sin 2PC

**Categoría:** Patrones distribuidos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Sin transacciones distribuidas, una operación de negocio que cruza servicios se modela como **saga**: secuencia de transacciones locales encadenadas por eventos, con **compensaciones** para deshacer en caso de fallo. El problema del *dual write* (escribir en mi DB y publicar a Pub/Sub atómicamente) se resuelve con **outbox**: el evento se inserta en una tabla local dentro de la misma transacción y un relay lo publica después. Ambos exigen idempotencia en consumidores y diseño explícito de fallos: la saga no da aislamiento, solo atomicidad eventual.

### 📖 Respuesta detallada
**El problema del dual write**: si el servicio de pedidos hace `INSERT order` y luego `publish(OrderCreated)`, hay dos fallos posibles: publica y la transacción hace rollback (evento fantasma), o comitea y el publish falla (evento perdido). Ninguna combinación de orden lo arregla. Tampoco sirve "publicar dentro de la transacción": Pub/Sub no participa en transacciones de tu base de datos.

**Outbox**: dentro de la transacción de negocio se inserta el evento en una tabla `outbox` (id, aggregate_id, tipo, payload JSON, created_at, published_at NULL). Un **relay** lo mueve a Pub/Sub. Dos variantes: (1) *Polling publisher*: job (Cloud Run job cada minuto, o loop en el propio servicio con CPU always-on) que lee `WHERE published_at IS NULL ORDER BY id LIMIT N` con `FOR UPDATE SKIP LOCKED` (para varios relays sin pisarse), publica y marca. Simple y suficiente casi siempre; la latencia es el intervalo de polling. (2) *CDC con Datastream* o Debezium (en GKE) leyendo el WAL: menor latencia y sin carga de polling, más piezas que operar. El relay garantiza **at-least-once** (puede publicar y morir antes de marcar → duplicado), por lo que los consumidores deduplican con el `event_id` del outbox como clave de idempotencia (tabla `processed_events` con insert condicional en la misma transacción del efecto — el patrón **inbox**). Con ordering keys por `aggregate_id` se preserva el orden por agregado si importa.

**Sagas**: dos estilos. **Coreografía**: cada servicio reacciona a eventos y emite los suyos (`OrderCreated` → payments cobra → `PaymentCompleted` → inventory reserva → ...). Sin punto central, pero el flujo global vive "en ningún sitio": difícil de razonar con >4 pasos, riesgo de ciclos. **Orquestación**: un orquestador mantiene el estado de la saga y comanda cada paso; en GCP puede ser **Cloud Workflows** (barato, serverless, con retries/timeouts declarativos y compensaciones explícitas en el YAML) o un servicio propio con state machine persistida. Mi regla: coreografía para 2–3 pasos naturales, orquestación en cuanto hay compensaciones múltiples o SLA de visibilidad ("¿en qué estado está el pedido 123?").

**Compensaciones y sus límites**: no son rollbacks — son transacciones nuevas de negocio (`RefundPayment`, `ReleaseStock`) y pueden fallar a su vez (retry + alerta humana como último eslabón). La saga **no aísla**: entre pasos, otros actores ven estados intermedios (*dirty reads* de negocio); contramedidas: estados explícitos (`PENDING_PAYMENT`) tratados como de primera clase por el dominio, *semantic locks*, y diseñar qué operaciones son conmutativas. También hay que decidir pivotes: pasos a partir de los cuales ya no se compensa sino que se sigue adelante con reintentos (p. ej., tras cobrar, el envío se reintenta, no se reembolsa automáticamente).

**Errores comunes**: consumidores sin idempotencia "porque Pub/Sub tiene exactly-once" (EOD no cubre efectos de aplicación); outbox sin limpieza (la tabla crece hasta comerse la DB — purgar publicados > X días); usar el `messageId` de Pub/Sub como clave de dedupe (cambia si el relay re-publica; usar el id del outbox); y modelar como saga lo que cabía en una transacción local moviendo la frontera del servicio.

---

## 4. Observabilidad de microservicios con OpenTelemetry en GCP

**Categoría:** Observabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
La instrumentación se hace con **OpenTelemetry** (estándar, sin lock-in) exportando a **Cloud Trace** (trazas), **Cloud Monitoring** (métricas) y **Cloud Logging** (logs estructurados con el `trace_id` inyectado para correlación). El patrón robusto: SDK OTel + **Collector** como sidecar/DaemonSet haciendo batching, filtrado y sampling. Sobre eso: SLOs con burn-rate alerts en Cloud Monitoring, y en GKE/Cloud Run aprovechar la telemetría automática de la plataforma. La clave senior es la **correlación**: de una alerta a la traza, de la traza al log del span exacto.

### 📖 Respuesta detallada
**Los tres pilares en GCP**:
- **Trazas**: SDK de OTel con propagación W3C `traceparent` (los LBs y Cloud Run ya propagan `X-Cloud-Trace-Context`/traceparent, así que la traza puede empezar en el borde). Exportar vía OTLP al **Collector**, y de ahí a Cloud Trace con el exporter de Google. En Pub/Sub, propagar el contexto en atributos del mensaje (las client libraries recientes tienen soporte OTel nativo) para que productor y consumidor queden en la misma traza — sin esto, las trazas "mueren" en cada salto asíncrono, que es justo donde más se necesitan.
- **Métricas**: las de plataforma vienen gratis (Cloud Run: request_count/latencies por revisión; GKE: kube-state + contenedores; Pub/Sub: backlog; Cloud SQL: conexiones/CPU). Las de aplicación (RED: rate, errors, duration por endpoint; y las de negocio) van por OTel a Cloud Monitoring o a **Managed Service for Prometheus** (ideal en GKE: PromQL, exporters estándar, sin operar Prometheus). Cuidado con la **cardinalidad**: labels como `user_id` en una métrica generan series ilimitadas y facturas enormes (Monitoring cobra por series/muestras ingeridas).
- **Logs**: JSON estructurado a stdout (la plataforma los recoge). Campos especiales que Cloud Logging entiende: `severity`, `logging.googleapis.com/trace` (con formato `projects/PID/traces/TRACE_ID`), `spanId`, `httpRequest`. Con el trace inyectado, la UI de Trace muestra los logs de cada span y viceversa — esta correlación es la diferencia entre 5 minutos y 2 horas de diagnóstico. Costos: ingesta ~0.50 USD/GiB pasados los 50 GiB/mes gratis por project; controlar con exclusion filters (health checks fuera), sampling de logs de debug y buckets con retención ajustada.

**Collector como pieza central**: en GKE, DaemonSet/Deployment; en Cloud Run, sidecar (con instance-based billing para que el flush en background funcione — conexión directa con la pregunta de CPU throttling). Funciones: batching, reintentos, enriquecimiento (resource detection: project, region, service), **tail-based sampling** (guardar el 100% de trazas con error o lentas y muestrear el resto — con head sampling puro te pierdes justo las trazas interesantes) y *fan-out* a múltiples backends si conviene (Cloud Trace + Grafana Tempo, por ejemplo).

**SLOs y alertas**: definir SLIs por servicio (disponibilidad = respuestas buenas/total; latencia = fracción bajo umbral) y crear SLOs en Cloud Monitoring, alertando por **burn rate** multi-ventana (rápida: 14.4x en 1 h; lenta: 3x en 6 h) en vez de umbrales estáticos por métrica — menos ruido, alertas accionables ligadas a presupuesto de error. Los uptime checks globales cubren la vista de caja negra.

**Errores comunes**: instrumentar solo HTTP y perder los saltos por Pub/Sub; logs sin `trace_id` (tres pilares que no se hablan entre sí); sampling head-based al 1% y descubrir que el incidente no dejó ni una traza; métricas de alta cardinalidad que cuestan más que el cómputo que miden; y montar el stack (OTel+dashboards) *después* del primer incidente serio en lugar de como parte de la definición de "servicio listo para producción".

---

## 5. Despliegues canary con Cloud Deploy: pipeline de entrega progresiva en GCP

**Categoría:** CI/CD / Entrega · **Tipo:** Conceptual

### 📝 Respuesta resumen
**Cloud Deploy** modela la entrega como *delivery pipeline* con *targets* (dev→staging→prod), *releases* y *rollouts*, con aprobaciones y **canary nativo**: en Cloud Run reparte tráfico entre revisiones por porcentajes (10→50→100) y en GKE manipula el Gateway/Service. Las fases avanzan con **verify** (jobs de verificación post-despliegue) y se automatizan con *automation rules* (auto-promote tras N minutos sanos, auto-rollback). El canary solo vale lo que valen sus métricas de comparación: sin análisis de errores/latencia de la nueva revisión, es teatro de despliegue.

### 📖 Respuesta detallada
**Modelo de Cloud Deploy**: defines un `DeliveryPipeline` (YAML) con la secuencia de `Targets` (cada uno apunta a un cluster GKE, servicio Cloud Run o Anthos). Cloud Build produce artefactos; `gcloud deploy releases create` crea la **release** (inmutable: imágenes + manifests renderizados con Skaffold por target) y se generan **rollouts** por target. Entre targets: aprobaciones manuales (IAM: `roles/clouddeploy.approver` — separación de deberes auditada), y dentro de un target, estrategias: estándar o **canary**.

**Canary en Cloud Run**: Cloud Deploy despliega la revisión nueva sin tráfico y va moviendo porcentajes (`phases: [10, 50, 100]`) usando el traffic splitting nativo de revisiones. Entre fases ejecuta **verify** si lo defines: un contenedor de verificación (curl de smoke tests, consulta a Cloud Monitoring comparando error rate/latencia de la revisión canary vs la estable — las métricas de Cloud Run vienen etiquetadas por `revision_name`, lo que hace el análisis directo). Con **automation rules**: `promote-release` automático tras X tiempo sano y `repair-rollout`/rollback si verify falla. Nota fina: el split de Cloud Run es por request (o con session affinity best-effort); para canary por usuario/header hace falta el LB con URL maps ponderados o un gateway.

**Canary en GKE**: requiere que Cloud Deploy pueda partir el tráfico: con **Gateway API** gestiona los pesos de `HTTPRoute` entre el Deployment estable y el canary (opción recomendada); con Services clásicos hace un canary "basado en réplicas" (aprox. porcentual por número de pods — menos preciso). Alternativas si se necesita análisis sofisticado: Argo Rollouts o Flagger con análisis automático contra Prometheus, integrables igualmente, aceptando operar más piezas.

**Lo que hace bueno a un canary (y que digo siempre)**: (1) **comparar contra baseline concurrente**, no contra histórico: la revisión canary y la estable reciben el mismo tráfico al mismo tiempo, se comparan error rate, p95/p99, y métricas de negocio clave (conversión, publicación de eventos); (2) duración suficiente por fase para acumular significancia con tu volumen (10 minutos con 10 rps casi no dice nada); (3) **compatibilidad hacia atrás obligatoria**: durante el canary conviven dos versiones contra la misma DB y los mismos topics — migraciones de esquema con expand/contract (añadir columna → doble escritura → migrar → retirar), eventos versionados, nunca cambios rompientes en un solo paso; (4) rollback barato y ensayado: en Cloud Run es instantáneo (mover tráfico a la revisión anterior), en GKE re-desplegar el estable; (5) feature flags para separar *deploy* de *release* — el canary valida el binario, el flag activa la funcionalidad, y apagar un flag es más rápido que cualquier rollback.

**Errores comunes**: canary sin verify (solo "esperar y mirar Slack"); medir el agregado del servicio en vez de por revisión (el 10% canary se diluye en el promedio); olvidar los workers asíncronos (el canary de un consumidor de Pub/Sub también existe: dos suscriptores conviviendo — pensar qué pasa con mensajes procesados por la versión nueva si hay rollback); y pipelines donde staging no se parece a prod (el canary acaba siendo el primer entorno real de pruebas).

---

## 6. Resiliencia entre microservicios: timeouts, retries, circuit breakers y load shedding en GCP

**Categoría:** Arquitectura / Resiliencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
La resiliencia se diseña por presupuesto de extremo a extremo: **timeouts** decrecientes a lo largo de la cadena (el caller siempre menos que la suma de sus downstream), **retries solo de errores idempotentes y transitorios** con exponential backoff + jitter y presupuesto (retry budget), **circuit breakers** para dejar de golpear a un servicio enfermo, y **load shedding**/backpressure para degradar con gracia. En GCP: los timeouts del ALB y Cloud Run deben alinearse con los de la app, Pub/Sub absorbe picos como buffer natural, y el mesh (o Envoy) da retries/outlier detection sin código.

### 📖 Respuesta detallada
**Timeouts**: el fallo más común en sistemas distribuidos son timeouts incoherentes: el LB corta a 30 s (default del backend service), Cloud Run a 300 s, el cliente HTTP interno a 60 s y la query a la DB sin límite. Regla: definir el presupuesto desde el usuario (p. ej., 2 s) y repartirlo hacia abajo con margen (gateway 2 s → servicio A 1.5 s → servicio B 800 ms → DB statement_timeout 500 ms). Cada capa corta *antes* que su caller para que el error sea informativo y no un `504` genérico. En gRPC, propagar **deadlines** (el deadline viaja con la llamada); en REST, aplicarlo por cliente.

**Retries**: solo sobre operaciones idempotentes (GET, PUT bien diseñado, publicaciones con clave de idempotencia) y errores transitorios (`503`, `429`, timeouts de conexión — no `400/401/404`). Siempre exponential backoff con **jitter completo** (sin jitter, los reintentos sincronizados crean olas), máximo 2–3 intentos, y **retry budget** global (p. ej., reintentos ≤10% del tráfico): sin presupuesto, los retries amplifican los incidentes — un downstream al 50% de errores con 3 retries por caller recibe 4x su tráfico justo cuando peor está (*retry storm*). Los retries en múltiples capas se multiplican: si el cliente, el gateway y el servicio reintentan 3 veces cada uno, el downstream puede ver 27 intentos; decidir **una** capa dueña del retry.

**Circuit breakers y outlier detection**: el breaker (por instancia o por servicio, con estados closed/open/half-open) evita colas de espera hacia un servicio caído: fallar rápido libera threads y permite fallback (respuesta cacheada, degradación funcional, encolar para después). En GKE con mesh/Envoy: `outlierDetection` (expulsar endpoints con 5xx consecutivos) y límites de conexiones/requests pendientes por destino hacen esto sin código; en Cloud Run, librerías (resilience4j, gobreaker) o un Envoy intermedio. El fallback hay que *diseñarlo*: "¿qué mostramos si recomendaciones no responde?" es una decisión de producto, no de librería.

**Load shedding y backpressure**: mejor rechazar temprano (`429` con `Retry-After`) que degradar a todos: limitar la concurrencia interna (semáforos por dependencia), colas acotadas, y en Cloud Run usar `max-instances` como límite de gasto pero sabiendo que al alcanzarlo aparecen `429` del sistema — decidir dónde se encola (Pub/Sub delante del trabajo pesado convierte picos en backlog procesable en lugar de errores). **Pub/Sub como amortiguador** es el patrón GCP por excelencia: lo síncrono se mantiene mínimo (validar + aceptar), lo costoso va a un topic y se procesa al ritmo sostenible; el usuario recibe `202 Accepted` + polling/webhook.

**Cómo lo valido**: pruebas de carga hasta el fallo (¿dónde rompe primero?), *chaos testing* dirigido (matar una zona, inyectar latencia en una dependencia con el mesh), y revisar en cada postmortem si el sistema falló como estaba diseñado. Anti-patrones que menciono: retries infinitos "para robustez"; health checks que dependen de downstream (un fallo de la DB tumba el readiness de toda la flota y convierte una degradación en outage total — el readiness debe reflejar "puedo atender *algo*"); y cachear errores sin TTL corto.

---

## 7. [CASO] El backlog de una suscripción de Pub/Sub crece sin parar y los mensajes se reentregan varias veces

**Categoría:** Mensajería / Operación · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Backlog creciente + redeliveries casi siempre significa que el consumidor **no acknowledgea a tiempo**: procesa más lento de lo que llega, expira el ack deadline y Pub/Sub reenvía, lo que duplica trabajo y realimenta el atasco. Diagnostico con las métricas de la suscripción (`num_undelivered_messages`, `oldest_unacked_message_age`, `expired_ack_deadlines_count`) y trazas del consumidor. Soluciones: arreglar el mensaje venenoso o el cuello de botella downstream, ajustar ack deadline y flow control, escalar consumidores, y DLQ para cortar los venenosos.

### 📖 Respuesta detallada
**Escenario**: la suscripción `orders-processor` acumula 2 M de mensajes, `oldest_unacked_message_age` sube a horas, y los logs del consumidor muestran los mismos `order_id` procesándose repetidas veces.

**Diagnóstico paso a paso**:
1. **Cloud Monitoring** — métricas de la suscripción: `subscription/num_undelivered_messages` (tamaño del backlog y pendiente de crecimiento: ¿entra más de lo que sale, o el consumo es cero?), `subscription/oldest_unacked_message_age` (¿es un atasco general o unos pocos mensajes atascados? — edad alta con backlog pequeño delata *mensajes venenosos*), `subscription/expired_ack_deadlines_count` (la firma de las redeliveries: acks que expiran), y `subscription/ack_latencies` vs el `ackDeadline` configurado. Comparar `topic/send_message_operation_count` (entrada) contra `subscription/ack_message_operation_count` (salida real).
2. **Cloud Logging** — logs del consumidor filtrados por los IDs repetidos: ¿el handler termina con error?, ¿tarda más que el deadline?, ¿hay un tipo concreto de mensaje que siempre falla (payload malformado, referencia a entidad inexistente)? Un solo tipo venenoso con `retry` infinito puede monopolizar el flow control del cliente.
3. **Cloud Trace** — trazas del handler: ¿dónde se va el tiempo? Típicamente una llamada downstream degradada (Cloud SQL saturada, API externa lenta) alarga el procesamiento de 200 ms a 15 s; con `ackDeadline=10s`, *todos* los mensajes expiran y se reentregan: el sistema trabaja mucho y no completa nada (*livelock*).
4. Revisar configuración del suscriptor: `ackDeadline`, flow control del cliente (`max_outstanding_messages/bytes`), número de instancias/streams, y si la extensión automática de deadline (lease management) está activa y con margen (`max_lease_duration`).

**Causas raíz frecuentes** (en orden de probabilidad): downstream lento que alarga el procesamiento por encima del deadline; mensaje venenoso en bucle sin DLQ; consumidor infra-escalado tras un cambio de tráfico; deadlock de flow control (pocas instancias con `max_outstanding` bajo y mensajes lentos); y en push a Cloud Run, `max-instances` alcanzado (Pub/Sub recibe 429 y reintenta con backoff — el backlog crece aunque "todo esté verde").

**Solución**:
- Inmediato: escalar consumidores (más pods/instancias; en push, subir `max-instances`), subir `ackDeadline` a > p99 real de procesamiento, y si hay venenosos identificados, desplegar un guard que los loggee y ack-ee (o configurar ya el **dead letter topic** con `max_delivery_attempts=5`).
- Estructural: arreglar el downstream (la causa real suele estar ahí); *nack* inmediato en errores permanentes en lugar de dejar expirar (reentrega más rápida y controlada); idempotencia sólida para que las redeliveries no dupliquen efectos; procesar en paralelo dentro del consumidor si el orden no importa.
- Si el backlog acumulado ya no vale la pena: `seek` a un timestamp para descartarlo conscientemente (decisión de negocio, documentada).

**Prevención**: DLQ + alerta en toda suscripción de producción desde el día uno; alertas sobre `oldest_unacked_message_age` (p. ej., >10 min) y sobre crecimiento sostenido del backlog; pruebas de carga del consumidor con el doble del pico esperado; autoscaling de consumidores basado en el backlog (en GKE, HPA sobre la métrica externa `num_undelivered_messages`); y runbook de replay/descarte escrito antes del incidente.

---

## 8. [CASO] Cloud Run con latencia p99 alta: diagnóstico de cold starts y contención

**Categoría:** Serverless / Rendimiento · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Una p99 mala con p50 sana en Cloud Run apunta a tres sospechosos: **cold starts** (picos al escalar), **contención por concurrencia** (instancias saturadas de requests simultáneas) o **una dependencia lenta** en la cola de la distribución. Distingo con las métricas por revisión (`container/startup_latencies`, `instance_count`, latencias vs concurrencia) y Cloud Trace comparando trazas lentas vs rápidas. Remedios según causa: `min-instances` + startup boost + imagen ligera para cold starts; bajar `concurrency` o subir CPU para contención; arreglar la dependencia si es downstream.

### 📖 Respuesta detallada
**Escenario**: API de checkout en Cloud Run; p50 = 80 ms, p99 = 6 s con picos a 20 s tras despliegues y en horas punta. Quejas de timeouts intermitentes.

**Diagnóstico paso a paso**:
1. **Cloud Monitoring** — por *revision*: `request_latencies` (heatmap: ¿la cola son picos discretos — cold starts — o una banda continua — contención?); `container/startup_latencies` (cuánto tarda en arrancar una instancia: si son 8 s, cada scale-up genera p99 de 8+ s); `instance_count` (¿oscila agresivamente? *flapping* de instancias = cold starts constantes); `container/cpu/utilizations` y `container/billable_instance_time`. Correlación clave: si los picos de latencia coinciden con subidas de `instance_count`, son cold starts; si coinciden con picos de tráfico sin nuevas instancias, es contención.
2. **Cloud Trace** — comparar 10 trazas lentas contra 10 rápidas: (a) si la traza lenta tiene un hueco *antes* del primer span del servidor, el tiempo se fue en arranque/enrutamiento (cold start o cola); (b) si los spans de la dependencia (Cloud SQL, servicio B) se alargan, el problema es downstream; (c) si todos los spans propios se alargan proporcionalmente, la instancia estaba saturada de CPU (con `concurrency=80` y trabajo CPU-bound, 80 requests compiten por 1-2 vCPUs).
3. **Cloud Logging** — buscar señales: logs del sistema de Cloud Run sobre throttling, `The request was aborted because there was no available instance` (agotamiento de `max-instances` — otro caso), y medir en logs propios el tiempo de init del contenedor.

**Causas y soluciones**:
- **Cold starts**: imagen de 1.2 GB con JVM que tarda 9 s en arrancar. Solución escalonada: `min-instances` (p. ej., 3) para el tráfico base — con instance-based billing el costo de instancias idle es moderado y elimina el problema para el 95% de los casos; **startup CPU boost**; adelgazar imagen (multistage, distroless, JVM con CDS/CRaC o native-image); mover inicialización pesada a lazy o al startup (no en la primera request); startup probe correcta para no recibir tráfico antes de estar listo.
- **Contención por concurrencia**: si el servicio hace trabajo CPU-bound (serialización pesada, crypto), `concurrency=80` es demasiado: bajarlo (p. ej., 8–20) con pruebas de carga hasta encontrar el codo, o subir CPU. Ojo: bajar concurrency multiplica instancias → más cold starts y costo; es un equilibrio a medir, no a adivinar.
- **Downstream**: si Trace señala a Cloud SQL, revisar pool de conexiones (crear conexión por request es un asesino de p99: 50–100 ms extra), índices y `statement_timeout`.
- **Throttling fuera de request**: si hay trabajo en background (flush de telemetría) con billing por request, la primera request tras un idle paga los platos rotos — pasar a instance-based billing.

**Prevención**: SLO de latencia con burn-rate alerts por revisión; pruebas de carga en el pipeline (canary con verify comparando p99 de revisión nueva vs estable); presupuesto de latencia documentado por dependencia; y revisar `startup_latencies` como métrica de regresión en cada release (una dependencia nueva que añade 3 s de init se detecta en staging, no en el on-call).

---

## 9. [CASO] GKE: pods OOMKilled intermitentes y el autoscaler de nodos tarda en absorber picos

**Categoría:** Kubernetes / Operación · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Dos problemas entrelazados: pods que mueren por **OOMKilled** (exit code 137: el contenedor superó su `limits.memory`, o el nodo entró en presión de memoria) y **scale-up lento** (pods Pending minutos mientras el cluster autoscaler aprovisiona nodos: ~1-2 min de VM + pull de imagen). Diagnostico con `kubectl describe` (razón del kill, eventos de scheduling), métricas de memoria del contenedor y logs del autoscaler. Remedios: requests/limits realistas (memoria: requests=limits), arreglar la fuga si la hay, y para el autoscaling: headroom con *balloon pods*, imágenes pequeñas y perfiles de autoscaler.

### 📖 Respuesta detallada
**Escenario**: el servicio `pricing` en GKE Standard sufre reinicios aleatorios (restarts con exit 137) varias veces al día, y en los picos de la mañana los pods nuevos quedan `Pending` 4–6 minutos, causando errores 503 mientras tanto.

**Diagnóstico paso a paso**:
1. **OOMKilled**: `kubectl describe pod` → `Last State: Terminated, Reason: OOMKilled, Exit Code: 137`. Distinguir dos variantes: (a) el contenedor superó su propio `limits.memory` (cgroup OOM — lo mata el kernel aunque el nodo tenga memoria libre); (b) *node memory pressure*: el nodo se quedó sin memoria porque los pods usan más de lo que *pidieron* (requests bajos, limits altos o ausentes → sobresuscripción) y el kubelet/kernel mató víctimas. En **Cloud Monitoring**: `kubernetes.io/container/memory/used_bytes` vs `limit_bytes` por pod (¿crecimiento lineal hasta el kill = fuga o caché sin límite?, ¿escalones al procesar ciertos payloads = picos legítimos infradimensionados?) y memoria *allocatable* vs uso por nodo.
2. **Cloud Logging**: eventos de K8s (`grep OOMKill` en los logs del nodo / `journal` del kubelet via logging del sistema GKE), y logs de la app justo antes del kill (¿procesaba un batch grande?). Para JVM: ¿el heap está limitado (`-XX:MaxRAMPercentage`) o la JVM ve toda la RAM del nodo? Un clásico: `limits.memory=2Gi` con JVM sin límites que asume que puede usar más — el kernel la mata sin stack trace.
3. **Autoscaling lento**: `kubectl get events` del pod Pending → `FailedScheduling: insufficient memory` seguido de `TriggeredScaleUp` del cluster autoscaler. En los logs del autoscaler (visibles en Cloud Logging, `resource.type="k8s_cluster"`), ver cuánto tardó la decisión y el aprovisionamiento. Descomponer el tiempo total: decisión del CA (~30 s) + boot de la VM (60–120 s) + registro del nodo + **pull de imagen** (una imagen de 2 GB añade 1–2 min) + readiness de la app.

**Soluciones**:
- **OOM**: dimensionar con datos: p99 de uso real + 20–30% de margen; para memoria, la práctica recomendada es **requests = limits** (Guaranteed QoS: sin sobresuscripción de un recurso incompresible — la memoria no se "estrangula", se mata). Arreglar la fuga si existe (heap dumps, profiler); limitar cachés en memoria; en JVM, alinear heap con el limit del contenedor. VPA en modo recomendación para calibrar.
- **Autoscaling**: (1) **headroom caliente**: *balloon pods* de baja prioridad (`PriorityClass` negativa) que reservan capacidad; al llegar pods reales, los globos son desalojados al instante y el CA repone nodos por detrás — convierte minutos en segundos; (2) imágenes pequeñas + **image streaming** de GKE (arranca el contenedor mientras descarga) y secondary boot disks para precachear; (3) `optimize-utilization` vs `balanced` según prioridad costo/velocidad; (4) HPA proactivo: escalar por una métrica adelantada (RPS, backlog) en lugar de CPU tardía, y bajar el umbral; (5) PodDisruptionBudgets y `topologySpreadConstraints` para que los picos no concentren todo en un nodo.

**Prevención**: alertas sobre `container/memory/used_bytes > 85% limit` (avisa antes del kill) y sobre pods Pending >60 s; load tests que incluyan el escalado (no solo estado estacionario); revisar recomendaciones de VPA trimestralmente; y considerar **Autopilot**, que elimina la gestión de nodos (aunque el tiempo de aprovisionamiento sigue existiendo — los balloon pods aplican igual).

---

## 10. [CASO] Cloud SQL (Postgres) agota las conexiones: `FATAL: remaining connection slots are reserved`

**Categoría:** Bases de datos / Operación · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Los errores de conexiones agotadas en Cloud SQL casi siempre son aritmética de autoscaling: N instancias serverless × pool de M conexiones supera el `max_connections` de la instancia. En Postgres cada conexión es un proceso (~memoria real), así que subir `max_connections` a lo bruto degrada. La solución correcta es **pooling en capas**: pool pequeño por instancia de app + **PgBouncer** (o el pooling gestionado de Cloud SQL) en modo transaction delante de la base, y revisar conexiones fugadas/idle-in-transaction. El Cloud SQL Auth Proxy no es un pooler: solo autentica y cifra.

### 📖 Respuesta detallada
**Escenario**: tras un pico de tráfico, los servicios en Cloud Run empiezan a fallar con `FATAL: remaining connection slots are reserved for non-replication superuser connections`. La instancia es `db-custom-4-16384` (Postgres, `max_connections` ~400 por defecto según memoria).

**Diagnóstico paso a paso**:
1. **Cloud Monitoring**: `database/postgresql/num_backends` contra el `max_connections` (¿saturación total o por usuario?); correlacionar con `instance_count` de los servicios Cloud Run: el patrón típico es tráfico ↑ → Cloud Run escala de 10 a 80 instancias → 80 × pool de 10 = 800 intentos contra 400 slots. También CPU/memoria de la instancia: cientos de backends de Postgres consumen memoria (work_mem por operación) y context switching.
2. **En la base**: `SELECT state, count(*) FROM pg_stat_activity GROUP BY state;` — mucha atención a `idle` (conexiones abiertas sin usar: pools sobredimensionados) e **`idle in transaction`** (transacciones abiertas sin commitear: fugas de código — un `BEGIN` sin `COMMIT` en un path de error — que además bloquean vacuum y locks). `pg_stat_activity` también da el origen por `application_name`/IP para identificar al servicio ofensor.
3. **Cloud Logging**: logs de Postgres (habilitar `log_connections/log_disconnections` temporalmente) y errores de la app: ¿los errores son al *conectar* (agotamiento real) o timeouts de *checkout* del pool local (pool demasiado pequeño — el problema inverso)?

**Solución**:
- **Inmediato**: reducir el pool por instancia de la app (con `concurrency=80` en Cloud Run, la mayoría de apps I/O-bound necesitan 2–5 conexiones por instancia, no 20); poner `max-instances` acorde a la aritmética (`max_instances × pool_size < max_connections × 0.8`, reservando margen para admin/replicación); matar las `idle in transaction` (`pg_terminate_backend`) y arreglar la fuga; `idle_in_transaction_session_timeout` y `statement_timeout` como cinturón de seguridad.
- **Estructural**: **PgBouncer en modo transaction** entre apps y Cloud SQL (en GKE como deployment, o el **managed connection pooling** de Cloud SQL Enterprise Plus): miles de conexiones de cliente multiplexadas sobre decenas de conexiones de servidor. En modo transaction hay incompatibilidades a conocer: prepared statements con nombre, `SET` de sesión, advisory locks de sesión — revisar el driver. Aclaración importante en entrevista: el **Cloud SQL Auth Proxy** (o los conectores de lenguaje) hace autenticación IAM + TLS, **no** pooling; se combinan: app → pool local → PgBouncer → Cloud SQL, con el proxy/conector donde corresponda.
- Complementos: réplicas de lectura para sacar el tráfico de solo lectura del primario; revisar si hay conexiones creadas por request (antipatrón letal en serverless); y para funciones muy spiky, considerar colas (Pub/Sub) delante de la escritura.

**Prevención**: alerta en Monitoring a 80% de `num_backends`/`max_connections`; presupuesto de conexiones documentado por servicio (quién puede abrir cuántas, sumado contra el total); pruebas de carga que incluyan el escalado del serverless (el estado estacionario nunca revela este fallo); dashboards que crucen instancias de Cloud Run con backends de Postgres; y revisar la aritmética en cada cambio de `concurrency`, `max-instances` o tamaño de pool — es un invariante del sistema, no una configuración de un solo servicio.

---

## 11. [CASO] La factura de BigQuery se triplica en un mes: queries sin particionar y dashboards descontrolados

**Categoría:** Datos / FinOps · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Una factura disparada de BigQuery on-demand se investiga en `INFORMATION_SCHEMA.JOBS`: quién, qué query y cuántos `total_bytes_billed`. El patrón típico: tabla de eventos grande sin filtro de partición (o sin particionar), `SELECT *`, y un dashboard que refresca cada 5 minutos ejecutándola. Remedio: particionar + clusterizar + `require_partition_filter`, reescribir las queries ofensoras, límites (`maximum_bytes_billed`, custom quotas) y decidir si conviene pasar a slots (editions) para cargas sostenidas.

### 📖 Respuesta detallada
**Escenario**: el costo de BigQuery pasa de 4 000 a 13 000 USD/mes sin cambio aparente de negocio. Billing muestra que es todo "Analysis" (cómputo on-demand).

**Diagnóstico paso a paso**:
1. **Encontrar a los ofensores**: consultar `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT` (o `JOBS_BY_ORGANIZATION`) agregando `total_bytes_billed` por `user_email`, `query` (normalizada) y día. En minutos aparece el pareto: p. ej., una query de un dashboard de Looker Studio que escanea 1.8 TiB por ejecución, programada cada 15 minutos = ~170 TiB/día ≈ 1 000 USD/día. También revisar `cache_hit` (si el dashboard añade `CURRENT_TIMESTAMP()` o parámetros cambiantes, anula la caché de 24 h).
2. **Analizar la query**: `total_bytes_billed` vs tamaño de tabla — si coinciden, hay *full scan*: tabla de eventos de 2 años sin particionar, o particionada pero con el filtro sobre una expresión (`WHERE DATE(ts_string)...` no siempre poda) o sin filtro de partición; `SELECT *` sobre 120 columnas cuando el dashboard usa 6 (columnar: cada columna leída se paga). El *dry run* (`--dry_run` o la estimación del editor) confirma el costo antes/después de cada arreglo.
3. **Cloud Monitoring / Billing**: alertas de presupuesto que llegaron tarde o no existían; el billing export a BigQuery (¡particionado!) permite atribuir por label/project.

**Solución**:
- **Modelado**: particionar la tabla por fecha (`PARTITION BY DATE(event_ts)`) — para tablas existentes, `CREATE TABLE AS SELECT` a una nueva y swap; activar **`require_partition_filter=true`**; clusterizar por las columnas de filtro habituales (`tenant_id, event_type`). Resultado típico: la query del dashboard pasa de 1.8 TiB a 15–40 GiB.
- **Queries**: eliminar `SELECT *`, materializar agregados intermedios (tabla resumen horaria/diaria alimentada por scheduled query incremental o **materialized views** con refresco automático) para que los dashboards lean la tabla pequeña, nunca la cruda. Recordar: `LIMIT` no reduce el escaneo; `TABLESAMPLE` sí para exploración.
- **Controles duros**: `maximum_bytes_billed` por query (falla antes de gastar), **custom quotas** de bytes/día por project y por usuario (el freno de emergencia real), presupuestos con alertas al 50/80/100%, y revisar permisos: ¿quién puede lanzar queries en el project de producción? (separar project de *cómputo* de analistas del de *almacenamiento*).
- **Modelo de precios**: con gasto sostenido, evaluar **editions/slots**: si el on-demand mensual supera el equivalente de una reserva con autoscaling (p. ej., 100 slots baseline), migrar los workloads pesados a una reservation con assignment — coste predecible y aislamiento (el ETL no compite con dashboards). Cuidado con la trampa inversa: pocas queries pequeñas salen más baratas on-demand.

**Prevención**: `require_partition_filter` como estándar en tablas nuevas; revisión de costos en el PR de toda scheduled query (dry run documentado); dashboard de FinOps sobre `INFORMATION_SCHEMA.JOBS` con alertas de queries >X TiB; educación a analistas (el preview de tabla es gratis, `SELECT *` no); y billing export + labels desde el día uno para que la conversación de costos tenga datos por equipo.

---

## 12. [CASO] Spanner con latencias de escritura degradadas: hotspotting por claves secuenciales

**Categoría:** Bases de datos distribuidas · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Latencia de escritura creciente en Spanner con CPU total baja pero desequilibrada delata **hotspotting**: claves primarias secuenciales (timestamps, autoincrementales) concentran todas las escrituras en el último *split*, y añadir nodos no ayuda porque el trabajo no es paralelizable. Se confirma con **Key Visualizer** (banda diagonal brillante) y estadísticas de lock. La solución es rediseñar la clave: UUIDv4, hash-prefix, bit-reversal (`GENERATED ... AS (REVERSE_BITS(seq))`) o shard_id calculado, más revisar índices secundarios sobre columnas monotónicas, que sufren lo mismo.

### 📖 Respuesta detallada
**Escenario**: tabla `events(event_ts TIMESTAMP, ...) PRIMARY KEY(event_ts, event_id)` para ingestar eventos. Con el crecimiento del tráfico, la p99 de commit pasa de 15 ms a 400 ms; se escala de 3 a 6 nodos y **no mejora**.

**Por qué pasa**: Spanner particiona por rangos contiguos de clave primaria en *splits* distribuidos entre servidores. Con clave que empieza por timestamp, cada nueva fila cae al final del último rango: un único split (y su servidor) recibe el 100% de las escrituras. Spanner divide splits calientes (*load-based splitting*), pero con inserciones estrictamente crecientes la nueva cola vuelve a ser un único punto: es un problema de diseño, no de capacidad — por eso añadir nodos no cambia nada (la firma diagnóstica clave).

**Diagnóstico paso a paso**:
1. **Cloud Monitoring**: latencia de escritura p50/p99 (`api/request_latencies` por método Commit), CPU total moderada (p. ej., 45%) pero — el dato clave — **CPU de alta prioridad desequilibrada entre servidores**; throughput de escritura plano aunque el tráfico ofrecido crece.
2. **Key Visualizer**: el heatmap de acceso por rango de clave en el tiempo. El hotspot secuencial se ve como una **banda diagonal brillante** (la zona caliente se desplaza con el tiempo porque la clave crece con él). Es la herramienta que cierra el diagnóstico en minutos.
3. **Introspección**: `SPANNER_SYS.LOCK_STATS` (esperas de lock concentradas en el rango final), query stats para descartar que sean lecturas, y revisar el DDL: claves primarias **y** índices secundarios (un índice sobre `created_at` es una tabla interna con clave monotónica: mismo hotspot aunque la PK sea buena).

**Solución**:
- **Rediseño de clave** (elegir según patrones de lectura): (1) **UUIDv4** como PK (no v1, que tiene componente temporal) — distribuye perfecto, pero pierde el scan por tiempo; (2) **hash prefix**: `PRIMARY KEY(shard_id, event_ts, event_id)` con `shard_id = hash(event_id) % N` (N ~ 2–4× nodos): las lecturas por rango temporal hacen N scans paralelos (fan-out asumible); (3) **bit-reversal**: Spanner soporta secuencias con `bit_reversed_positive`, que dan valores únicos y crecientes "revueltos" — la opción idiomática para reemplazar autoincrementales; (4) para series temporales puras, cuestionar si Spanner es la herramienta (Bigtable con row key bien diseñada suele encajar mejor).
- **Migración**: cambiar PK exige tabla nueva + backfill (Dataflow) + doble escritura + switch — planificarlo como proyecto. Mientras tanto, mitigar reduciendo el tráfico al rango caliente (batch commits, buffer en Pub/Sub).
- Revisar también: transacciones que leen-modifican-escriben la misma fila caliente (contadores globales → fragmentar), y commits grandes (límite de mutaciones por commit; trocear).

**Prevención**: revisión de esquema obligatoria antes de producción con la checklist anti-monotonicidad (PK, índices, foreign keys por timestamp); pruebas de carga con distribución de claves realista (las pruebas con datos aleatorios esconden el problema); Key Visualizer en el dashboard estándar; y educar que en Spanner el diseño de claves es el 80% del rendimiento — lo que en Postgres era un `btree` inocente aquí es una decisión de particionado.

---

## 13. [CASO] Firestore con errores ABORTED y latencia: contención en documentos calientes

**Categoría:** Bases de datos NoSQL · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Errores `ABORTED: too much contention on these documents` y latencia creciente en Firestore delatan **documentos calientes**: Firestore sostiene ~1 escritura/segundo por documento; contadores globales, documentos "estado del sistema" o agregados que todos actualizan revientan ese límite y las transacciones optimistas reintentan en cascada. Solución: **contadores fragmentados** (N shards sumados al leer), mover agregación a un consumidor serializado vía Pub/Sub, rediseñar el modelo para repartir escrituras, y evitar también los rangos de índice calientes (claves/timestamps monotónicos).

### 📖 Respuesta detallada
**Escenario**: app con un documento `stats/global` que acumula `total_orders` y `revenue`, actualizado en cada compra con una transacción. En campaña de ventas (300 pedidos/s), las escrituras fallan con `ABORTED` masivamente, los retries del SDK amplifican la carga y la latencia de *todo* el flujo de compra se degrada.

**Por qué pasa**: cada documento (y cada rango contiguo de índice) vive en rangos de un almacenamiento distribuido con replicación síncrona; las escrituras a un mismo documento se serializan (~1/s sostenido como regla de diseño). Las transacciones de Firestore son **optimistas** en los SDK de servidor: leen, validan versión al commitear y abortan si otro commiteó antes; con 300 escritores sobre el mismo documento, casi todas colisionan, reintentan (backoff del SDK) y multiplican la carga — colapso por contención. Existe además la variante de **hotspot de índice**: escribir muchos documentos con un campo indexado monotónico (timestamp de creación) concentra las escrituras en la cola del índice — la regla "500/50/5" de ramp-up de Firestore existe por esto.

**Diagnóstico paso a paso**:
1. **Cloud Logging / errores de la app**: código `ABORTED` con mensaje de contención, agrupar por path de documento → identifica el documento caliente exacto. Medir la tasa de retry del SDK (logs de la librería o métrica propia).
2. **Cloud Monitoring**: métricas de Firestore (`api/request_count` por tipo y código de error, `document/write_ops_count`); correlacionar el inicio de los ABORTED con el throughput de escritura. Firestore no tiene "Key Visualizer", así que la atribución fina sale de los logs de la app — razón para loggear siempre el path en errores de escritura.
3. **Cloud Trace**: confirmar que la latencia del checkout se va en el span de la transacción de Firestore con sus reintentos (se ven como duración inflada del span o spans repetidos).

**Solución**:
- **Contadores fragmentados (sharded counters)**: sustituir `stats/global` por subcolección `stats/global/shards/{0..N-1}`; cada escritura incrementa un shard aleatorio (`FieldValue.increment()` — que además evita la transacción read-modify-write); la lectura suma los N shards (o lee un agregado precalculado). N se dimensiona: 300 escrituras/s → ≥300 shards con margen (p. ej., 500).
- **Agregación asíncrona (mi preferida para métricas de negocio)**: el flujo de compra publica el evento a Pub/Sub y un consumidor agrega en batch (cada segundo, un solo escritor actualiza el agregado): el path crítico del usuario deja de depender del documento caliente por completo.
- **Rediseño del modelo**: preguntarse si el agregado necesita ser un documento en tiempo real o puede ser una query a BigQuery; repartir estados "globales" por tenant/región/día (`stats/2026-08-11`) para acotar la contención.
- Para hotspots de índice: exención de índice sobre el campo monotónico si no se consulta, o prefijos distribuidos en el valor.

**Prevención**: checklist de diseño "¿qué documentos reciben escrituras de muchos actores concurrentes?" antes de producción; pruebas de carga con el patrón real de concurrencia (las pruebas secuenciales no lo revelan); presupuestar los límites de Firestore en el diseño (1 write/s/doc, 1 MiB/doc, ramp-up 500/50/5); y alertas sobre tasa de errores ABORTED > umbral para detectar contención emergente antes de la próxima campaña.

---

## 14. [CASO] Se ha filtrado una clave JSON de service account en un repositorio público: respuesta al incidente

**Categoría:** Seguridad / Respuesta a incidentes · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Una clave de SA filtrada es un compromiso de identidad activo: cualquiera puede firmar tokens con ella desde cualquier lugar. Respuesta en orden: **contener** (deshabilitar/borrar la clave — no la SA a lo loco si sostiene producción: evaluar impacto en segundos, no horas), **investigar** con Cloud Audit Logs qué hizo esa identidad desde la exposición (Admin Activity + Data Access), **erradicar** persistencias que el atacante haya creado (claves nuevas, bindings, VMs), **recuperar** y, como prevención, eliminar las claves exportadas de raíz: org policy que las prohíbe + Workload Identity Federation.

### 📖 Respuesta detallada
**Escenario**: un scanner (o el propio GitHub secret scanning, que notifica a Google) avisa: `sa-deploy@prod-x.iam.gserviceaccount.com` tiene su clave JSON commiteada en un repo público desde hace 3 días. La SA tiene `roles/editor` en el project de producción (el agravante clásico).

**Respuesta paso a paso**:
1. **Contención inmediata (minutos)**: deshabilitar la clave (`gcloud iam service-accounts keys disable`) o directamente borrarla. Antes de deshabilitar la **SA entera**, 60 segundos de evaluación: ¿qué workloads de producción la usan legítimamente? (si corre en CI/CD, se rompe el deploy — aceptable; si firma requests de producción, preparar el reemplazo en paralelo). La clave borrada invalida los tokens que se firmen a partir de entonces; los access tokens ya emitidos duran hasta 1 h — asumir hasta 1 h extra de exposición. Si el riesgo lo justifica: deshabilitar la SA (invalida el uso) y quitarle los roles.
2. **Alcance del daño — Cloud Audit Logs**: en Logs Explorer, filtrar `protoPayload.authenticationInfo.principalEmail="sa-deploy@..."` desde la fecha del commit. Los **Admin Activity logs** (gratuitos, siempre activos, inmutables) muestran creación de recursos, cambios de IAM, claves nuevas. Los **Data Access logs** solo si estaban habilitados — si no lo estaban, hay que asumir acceso a los datos que la SA podía leer (lección dolorosa: habilitarlos *antes* del incidente). Señales de compromiso típicas: `SetIamPolicy` (escalada/persistencia), `serviceAccounts.keys.create` sobre otras SAs (pivote), VMs nuevas en regiones raras (cryptomining), `storage.objects.list` masivo (exfiltración). Revisar también desde qué IPs (`requestMetadata.callerIp`): IPs desconocidas = uso confirmado por el atacante.
3. **Erradicación**: revertir todo cambio hecho por la identidad comprometida (IaC ayuda: `terraform plan` revela drift), borrar claves/SAs/bindings/recursos creados por el atacante, rotar cualquier secreto al que la SA tuviera acceso (Secret Manager: versiones nuevas + deshabilitar viejas), y revisar si tocó otras identidades (una SA con `iam.serviceAccountTokenCreator` compromete transitivamente a las SAs que puede impersonar).
4. **Recuperación**: reconstituir el servicio legítimo **sin clave**: si era CI/CD externo → Workload Identity Federation; si era un workload en GCP → SA adjunta al recurso. Purgar la clave del historial de git (BFG/filter-repo) — aunque una clave expuesta se considera quemada para siempre, se borra igualmente.
5. **Postmortem y prevención sistémica**: org policy `constraints/iam.disableServiceAccountKeyCreation` (con excepciones explícitas y temporales si algo aún la necesita); mínimo privilegio real (la SA de deploy no necesitaba `editor`); detección: Security Command Center (Premium detecta anomalías de SA y claves filtradas), alertas sobre `keys.create` y `SetIamPolicy`; secret scanning en pre-commit y en el pipeline (gitleaks/trufflehog) como puerta obligatoria; e inventario de claves existentes (`gcloud iam service-accounts keys list` por SA + métricas de antigüedad) con plan de eliminación total.

El mensaje final de senior: la respuesta buena tarda minutos porque estaba **ensayada** (runbook, permisos del on-call para deshabilitar claves, dashboards de auditoría listos); la mala improvisa a las 3 AM decidiendo si puede romper producción.

---

## 15. [CASO] Latencia elevada entre servicios desplegados en regiones distintas

**Categoría:** Redes / Rendimiento · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Un servicio en `europe-west1` llamando a dependencias en `us-central1` paga ~100 ms de RTT por viaje — y con N llamadas secuenciales o un pool que abre conexiones (TLS: 2-3 RTTs), la latencia se multiplica. Se diagnostica con Cloud Trace (spans cross-region con duración ≈ múltiplos del RTT) y se resuelve con **colocalidad**: datos y dependencias en la región del cómputo, réplicas de lectura locales, cachés regionales, y minimizando viajes (batching, conexiones persistentes, hedging). La regla: la velocidad de la luz no se negocia; se diseña alrededor.

### 📖 Respuesta detallada
**Escenario**: tras "expandir a Europa" desplegando el frontend y la API en `europe-west1`, la p50 del checkout europeo es 900 ms frente a 210 ms en EE. UU. La base de datos (Cloud SQL) y dos servicios internos siguen en `us-central1`.

**Diagnóstico paso a paso**:
1. **Cloud Trace**: la traza del checkout europeo muestra la firma inequívoca: spans hacia `payments` y Cloud SQL con duraciones de ~110–130 ms cada uno (RTT transatlántico ~100 ms + servicio), y — el multiplicador — **secuencias**: 5 queries seriales a la DB = 5 × RTT ≈ 550 ms solo de red. Comparar la misma traza en EE. UU. (spans de 5–15 ms) elimina toda duda.
2. **Cloud Monitoring**: latencia por par región-origen/destino (métricas de los servicios etiquetadas por location); métricas del LB si el tráfico entra por el Global ALB (¿está mandando usuarios europeos a backends de EE. UU. por falta de capacidad europea? — revisar `backend_latencies` por backend region).
3. **Cloud Logging**: tiempos de conexión: si el pool no reutiliza conexiones, cada request paga TCP+TLS handshake cross-region (2–3 RTTs extra ≈ 200–300 ms) — visible como picos en la primera llamada.
4. Verificar rutas: ¿el tráfico va por IP interna en la red de Google (VPC global) o sale por internet público (IP externa sin Premium Tier)? El primero es más estable; ambos pagan el RTT físico.

**Solución** (en orden de impacto):
- **Colocalizar datos**: réplica de lectura de Cloud SQL en `europe-west1` para las lecturas del flujo (las escrituras siguen al primario — evaluar si el flujo lo tolera); o migrar a una arquitectura de datos multi-región real: Spanner multi-región (con *leader region* elegida donde más se escribe), Firestore multi-región, o particionar por geografía (usuarios europeos → stack europeo completo, el patrón *regional home*).
- **Colocalizar servicios**: desplegar `payments` y demás dependencias del path crítico en Europa también — un stack regional completo por región, comunicándose cross-region solo asíncronamente (Pub/Sub es global) o para los pocos datos realmente compartidos.
- **Reducir viajes**: fusionar las 5 queries seriales (batch, JOIN, stored procedure, o un endpoint agregador); paralelizar llamadas independientes; caché regional (Memorystore en cada región) para datos leídos-frecuentemente/escritos-poco (catálogo, configuración) con invalidación por Pub/Sub.
- **Optimizar lo inevitable**: conexiones persistentes con keep-alive y pools calientes (paga el handshake una vez), gRPC con HTTP/2 multiplexado, *hedged requests* para p99 de lecturas idempotentes, y compresión si el payload pesa.

**Prevención**: política de arquitectura explícita: "ningún servicio llama síncronamente cross-region en el path de usuario" (las excepciones se aprueban con presupuesto de latencia); tests de latencia desde cada región en el pipeline; presupuesto de latencia documentado por endpoint con su descomposición; y al planear expansión geográfica, empezar por el **modelo de datos** (qué es regional, qué es global, dónde se escribe) — desplegar cómputo lejos de sus datos es la forma más cara de no expandirse.

---

## 16. [CASO] Errores 429 `RESOURCE_EXHAUSTED` en producción: cuotas de GCP alcanzadas

**Categoría:** Operación / Cuotas · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Las cuotas (por project, región y servicio: QPS de APIs, CPUs, instancias, conexiones) son el límite invisible que aparece justo en el pico de tráfico. Ante `429 RESOURCE_EXHAUSTED` o `Quota exceeded`: identificar la cuota exacta en el mensaje y en la página de Quotas (IAM & Admin → Quotas, filtrando por "usage ≥ 80%"), pedir aumento (tarda horas-días: por eso se pide *antes*), y mitigar mientras: backoff con jitter, degradación, y repartir carga. La prevención es un proceso: alertas de consumo de cuota, aumentos previos a eventos, y aislamiento por project para que un servicio no agote la cuota de otro.

### 📖 Respuesta detallada
**Escenario**: Black Friday, 11:00. El servicio de notificaciones empieza a fallar: `429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'Write requests' ... limit 'Write requests per minute per region'` contra una API de Google. A la vez, Cloud Run no escala más allá de cierto punto y aparecen errores de despliegue de VMs (`CPUS quota exceeded`) en el autoscaling de GKE.

**Diagnóstico paso a paso**:
1. **Identificar la cuota exacta**: el mensaje de error trae métrica, límite y dimensión (project/región). En **IAM & Admin → Quotas** (o `gcloud alpha services quota list`), filtrar por servicio y ordenar por % de uso — confirmar cuál está al 100% y desde cuándo. Distinguir **rate quotas** (por minuto, se rellenan solas — causan 429 intermitentes) de **allocation quotas** (CPUs, IPs, instancias — bloquean creación de recursos hasta liberar o ampliar).
2. **Cloud Monitoring**: métricas `serviceruntime.googleapis.com/quota/rate/net_usage` y `quota/allocation/usage` contra `quota/limit` — graficar el consumo histórico responde "¿crecimiento orgánico que nadie miró o un bug que multiplicó llamadas?". Un despliegue reciente con un retry loop sin backoff puede ser el verdadero culpable (los retries contra un 429 sin jitter *sostienen* el agotamiento).
3. **Cloud Logging**: ¿qué componente consume? Filtrar los 429 por servicio llamante; con Audit/Data Access logs, atribuir el consumo de la API por SA — a veces es un job batch mal programado compitiendo con producción.

**Solución**:
- **Inmediato**: solicitar el aumento desde la página de Quotas (los aumentos pequeños se auto-aprueban en minutos-horas; los grandes pasan por revisión — el soporte con un caso P1 acelera). Mientras llega: **backoff exponencial con jitter** en los llamantes (si no lo tenían, hotfix — reintentar en caliente un 429 es echar gasolina), priorizar tráfico (dejar de enviar notificaciones de marketing para preservar las transaccionales — *load shedding* por clase), y mover carga no urgente a después del pico (encolar en Pub/Sub y drenar despacio).
- Para allocation quotas (CPUs para autoscaling): liberar recursos no críticos en la región (apagar entornos de staging que comparten project — y anotar la lección: no deberían compartirlo), o desbordar a otra región si la arquitectura lo permite.
- Verificar también los límites *de producto* no ampliables o con techos (p. ej., instancias máximas por servicio de Cloud Run, conexiones por instancia de Cloud SQL): si se chocó con uno duro, la solución es arquitectónica (sharding por project/servicio), no un formulario.

**Prevención** (lo que evalúa la entrevista): (1) **alertas de cuota** en Cloud Monitoring: uso > 80% del límite para las cuotas críticas del sistema (APIs core, CPUs por región, instancias Cloud Run, conexiones) — es una alerta barata que evita incidentes enteros; (2) ritual pre-evento: antes de Black Friday, load test + revisión de todas las cuotas implicadas + solicitudes de aumento con semanas de antelación (los aumentos grandes tardan); (3) **aislamiento por project**: cuotas son por project — servicios críticos en projects separados no compiten con batch/analytics; (4) diseño tolerante: todo cliente de API de Google con backoff+jitter y presupuesto de retry desde el día uno; (5) documentar las cuotas como parte del capacity planning: cada servicio lista de qué cuotas depende y su margen actual.

---

## 17. [CASO] Migración de AWS a GCP de una plataforma de microservicios: estrategia y mapeo de servicios

**Categoría:** Arquitectura / Migración · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Migrar de AWS a GCP se planifica por cargas, no *big bang*: mapear servicios (EKS→GKE, ECS/Fargate→Cloud Run, SQS/SNS→Pub/Sub, RDS→Cloud SQL, DynamoDB→Firestore/Spanner/Bigtable según patrón de acceso, S3→GCS, Lambda→Cloud Run functions, IAM→IAM de GCP que es *muy* distinto), montar la landing zone primero (org, projects, Shared VPC, identidad federada), interconectar redes para la coexistencia, y migrar por olas empezando por lo stateless. Los riesgos reales: la capa de datos (CDC y corte controlado), IAM/seguridad (modelos diferentes) y los servicios sin equivalente 1:1.

### 📖 Respuesta detallada
**Escenario**: plataforma con 40 microservicios en EKS + Lambda, SQS/SNS, RDS Postgres, DynamoDB, S3 y ElastiCache; motivo de migración: acuerdo corporativo con Google y consolidación en BigQuery. Piden plan y riesgos.

**Mapeo de servicios (con matices, no solo la tabla)**:
- **EKS → GKE**: el más directo (Kubernetes es Kubernetes); las diferencias están en los bordes: IRSA → **Workload Identity**, ALB Ingress → Gateway API/Ingress de GCE con NEGs, EBS CSI → PD CSI, Karpenter → NAP/Autopilot. Evaluar **Autopilot** en la pasada (mejor momento para adoptarlo).
- **Lambda → Cloud Run functions o Cloud Run**: revisar triggers (SQS→Pub/Sub push, S3 events→Eventarc/GCS notifications, API Gateway→ALB+Cloud Run) y el modelo de concurrencia (Lambda: 1 request/instancia; Cloud Run: N — a menudo permite consolidar y abaratar).
- **SQS/SNS → Pub/Sub**: SNS+SQS fan-out ≡ topic+suscripciones (más simple en GCP). Diferencias a auditar: SQS FIFO → ordering keys (con sus límites de throughput por clave); visibility timeout → ack deadline; DLQ existe en ambos; SQS long-polling pull ≡ StreamingPull.
- **RDS Postgres → Cloud SQL/AlloyDB**: **Database Migration Service** hace la replicación continua (CDC) para un corte con downtime mínimo; auditar extensiones, versiones y parámetros.
- **DynamoDB**: la decisión difícil, no hay equivalente exacto. Según patrón: clave-valor/documental de app → **Firestore** (ojo a sus límites de escritura por documento); escala masiva por clave con throughput brutal → **Bigtable** (rediseño de row keys); si en realidad pedía SQL a escala → **Spanner**. Requiere análisis por tabla de patrones de acceso — es el capítulo con más riesgo de rediseño.
- **S3 → GCS**: **Storage Transfer Service** (masivo, incremental); API distinta pero conceptos idénticos; revisar clases de storage y lifecycle. **ElastiCache → Memorystore**. **CloudWatch → Cloud Monitoring/Logging** (re-crear alertas y dashboards — momento ideal para estandarizar en OpenTelemetry y quedar portable). **AWS IAM → GCP IAM**: el mapeo conceptual más traicionero — en AWS las policies (JSON, con Deny explícito) se adjuntan a identidades/recursos; en GCP son bindings rol→principal sobre la jerarquía con herencia aditiva: hay que *rediseñar* el modelo de permisos, no traducirlo.

**Estrategia por fases**: (1) **Landing zone**: org/folders/projects, Shared VPC, federación de identidad, IaC (Terraform), logging/seguridad centralizados — sin esto, cada equipo migra a su manera; (2) **Interconexión**: VPN HA o Interconnect entre AWS y GCP para la coexistencia (meses): servicios en GCP llamando a datos aún en AWS con latencia y egress conocidos (el **egress de AWS** durante la migración es una línea del presupuesto, no una sorpresa); (3) **Olas**: primero stateless de bajo riesgo (validan pipeline CI/CD, observabilidad, runbooks), luego servicios con estado, al final los críticos; *strangler* con pesos de DNS/LB por servicio y rollback definido; (4) **Datos**: CDC continuo, doble escritura donde aplique, corte por servicio con ventana y verificación (row counts, checksums); (5) **Descomisionado** y revisión de costos con CUDs una vez estabilizado el perfil.

**Riesgos que destaco**: subestimar DynamoDB (rediseño, no lift-and-shift); el modelo IAM (auditoría de seguridad completa en el destino); los costos duales durante la coexistencia; equipos formados en AWS operando GCP sin entrenamiento (invertir en enablement antes de la primera ola); y definir el *success criteria* por ola (SLOs iguales o mejores, no "ya corre").

---

## 18. [CASO] Incidente: Cloud Run devuelve errores porque alcanzó su límite de instancias

**Categoría:** Serverless / Operación · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Cuando un servicio de Cloud Run llega a `max-instances` (o a la cuota regional de instancias), las requests que no caben esperan brevemente en cola y luego reciben **429** (`no available instance`), aunque CPU y memoria se vean sanas. Se confirma con `instance_count` clavado en el máximo + 429 con ese mensaje en logs. Remedio inmediato: subir `max-instances` (y cuota si aplica) o subir `concurrency` si hay margen; remedio de fondo: dimensionar el límite con datos, absorber picos con Pub/Sub, y alertar cuando `instance_count` se acerque al techo — el límite existe para proteger el gasto y los downstream, no para descubrirlo en el pico.

### 📖 Respuesta detallada
**Escenario**: lanzamiento de producto a las 10:00; el servicio `api-catalog` (Cloud Run, `max-instances=100`, `concurrency=40`) empieza a devolver 429/5xx al 15% del tráfico. CPU por instancia ~55%, memoria normal. El equipo descarta "capacidad" porque "las instancias no están saturadas" — error de diagnóstico típico.

**Diagnóstico paso a paso**:
1. **Cloud Monitoring**: `container/instance_count` — la gráfica lo dice todo: sube y se queda **plana exactamente en 100** mientras `request_count` sigue creciendo. Cruzar con `request_count` filtrado por `response_code_class=4xx`: los 429 arrancan justo al tocar el techo. La latencia p99 también sube antes de los errores (las requests esperan en el buffer del gateway a que se libere una instancia).
2. **Cloud Logging**: los 429 del *sistema* (no de la app) con el mensaje característico `The request was aborted because there was no available instance` — la firma inequívoca. Distinguirlos de 429 emitidos por la propia app (rate limiting propio): estos vienen del gateway de Cloud Run, con `severity=WARNING` en `run.googleapis.com/requests`.
3. Verificar el porqué del techo: ¿`max-instances=100` fue una decisión (presupuesto, proteger la DB) o un default heredado? ¿Hay margen de **cuota regional** de instancias del project? ¿El escalado se frenó antes del máximo por otra razón (cuota de CPU, startup lento que hace que el autoscaler no siga al pico)?
4. Revisar el downstream **antes de subir el límite**: si `max-instances` protegía a Cloud SQL (100 instancias × pool = su tope de conexiones), subir a 300 sin más traslada el incidente a la base de datos en 10 minutos. La aritmética de conexiones y los límites del downstream son parte del diagnóstico, no un after-thought.

**Solución**:
- **Inmediato**: subir `max-instances` (deploy de configuración, sin nueva imagen, tarda segundos) al nivel que el downstream tolere — acompañado si hace falta de subir el pool ceiling con PgBouncer o réplicas. Si hay margen de CPU real (55%), subir `concurrency` de 40 a 60–80 da +50–100% de capacidad **sin instancias nuevas** — palanca más rápida y barata, validando con la p99 que no degrada.
- Si el 429 lo causó cuota regional: solicitud de aumento + desbordar tráfico a otra región si el servicio es multi-región tras el Global ALB.
- **Diseño**: para picos previsibles o trabajo diferible, poner **Pub/Sub delante** (aceptar rápido, procesar al ritmo sostenible) en los endpoints que lo permitan; los 429 restantes deben ser *manejados* por los clientes (retry con backoff+jitter — un 429 sin backoff en los clientes convierte el límite en tormenta).

**Prevención**: (1) dimensionar `max-instances` con load tests y documentar el porqué del número (y su relación con límites del downstream); (2) **alerta** sobre `instance_count > 80% de max-instances` sostenido — el incidente entero era una alerta barata; (3) ensayo de picos antes de lanzamientos (load test al 2× del pico esperado, con el pipeline de datos real detrás); (4) revisar cuotas regionales de Cloud Run en el capacity planning; (5) `min-instances` para el escalón inicial del pico y startup rápido (el autoscaler sigue mejor los picos si las instancias arrancan en 2 s que en 20); y postmortem sin culpables que deje las tres cosas institucionalizadas: alerta, runbook y aritmética de capacidad end-to-end.

---
