# Azure — Microservicios y Casos Prácticos (Perfil Senior Backend/Microservicios)

## 1. Arquitectura de referencia de microservicios en Azure (AKS + Service Bus + APIM)
**Categoría:** Arquitectura de microservicios · **Tipo:** Conceptual

### 📝 Respuesta resumen
Entrada: Front Door (WAF, TLS en edge) → APIM (autenticación JWT, rate limiting, contrato público) → ingress interno del clúster AKS. Tráfico síncrono este-oeste directo entre servicios (Kubernetes Services o mesh) y asíncrono vía Service Bus (topics para eventos de dominio, colas para comandos). Cada servicio con su propia base de datos (Cosmos o Azure SQL), identidad propia (Workload Identity), secretos en Key Vault, imágenes en ACR con geo-replicación, todo instrumentado con Application Insights y desplegado con GitOps.

### 📖 Respuesta detallada
**Capa de entrada.** Front Door Premium en el edge: WAF con reglas gestionadas, caching de respuestas cacheables y Private Link hacia el origen para que nada sea alcanzable directamente. Detrás, APIM (Premium con VNet injection, o Standard v2) como gateway: `validate-jwt` contra Entra ID, rate limiting por consumidor, versionado del contrato público y mapeo hacia los servicios internos. APIM solo media tráfico norte-sur; el tráfico interno entre microservicios no pasa por él (latencia y costo).

**Cómputo.** AKS con al menos dos node pools: `system` (tainted, solo componentes de sistema) y `user` para cargas, idealmente con Availability Zones y autoscaling (cluster autoscaler o Karpenter/NAP). Red con Azure CNI Overlay (evita agotar IPs de la VNet) y Network Policies (o Cilium) para microsegmentación. Ingress interno con NGINX/Application Gateway for Containers en un load balancer interno. Cada servicio define requests/limits realistas, PodDisruptionBudgets y probes liveness/readiness/startup diferenciadas.

**Comunicación asíncrona.** Service Bus Premium: *topics* para eventos de dominio (`pedido-creado` con una suscripción filtrada por consumidor interesado) y *colas* para comandos dirigidos. Sesiones donde se requiere orden por entidad (eventos del mismo pedido), duplicate detection y DLQ monitorizada con alertas. El autoscaling de consumidores se hace con KEDA usando la profundidad de cola como métrica — esto convierte los picos en backlog en lugar de en caídas. Regla arquitectónica: las operaciones entre servicios que pueden ser eventualmente consistentes van por mensajería; lo síncrono se reserva para lecturas y para lo que el usuario espera en línea.

**Datos.** Database-per-service estricto: nada de compartir esquema. Cosmos DB para servicios con acceso por clave y alta escala; Azure SQL para los que necesitan transacciones relacionales. La integración entre datos de servicios distintos se hace por eventos (con patrón outbox para publicar de forma atómica) o por APIs, nunca por queries cruzadas. Redis (Azure Cache / Azure Managed Redis) para caché distribuida y datos efímeros.

**Identidad y secretos.** Un user-assigned managed identity por microservicio, federada con su service account de Kubernetes (Workload Identity). Roles de plano de datos con scope al recurso concreto: el servicio de pedidos lee su Cosmos y su cola, nada más. Secretos inevitables (APIs de terceros) en Key Vault vía CSI driver o External Secrets Operator.

**Observabilidad y despliegue.** Application Insights (OpenTelemetry) en todos los servicios con trazas correlacionadas por W3C Trace Context, métricas de contenedor con Container Insights/Managed Prometheus y Grafana. Despliegue con GitOps (Flux o ArgoCD): el clúster converge al estado del repo, lo que además es la base del DR (recrear clúster = apuntar Flux al repo). CI construye imágenes hacia ACR con escaneo de vulnerabilidades y firma.

**Errores comunes que se detectan en la entrevista:** exponer los servicios directamente sin APIM "temporalmente"; usar un solo namespace y una sola identidad para todo; llamadas síncronas en cadena de 4–5 servicios para una operación de escritura (acoplamiento temporal: la disponibilidad compuesta se hunde); y no diseñar la idempotencia de los consumidores desde el día uno — Service Bus es at-least-once, los duplicados no son un caso raro, son el contrato.

## 2. Durable Functions para implementar Sagas
**Categoría:** Patrones distribuidos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una saga descompone una transacción distribuida en pasos locales con compensaciones. Durable Functions la implementa como *saga orquestada*: una orchestrator function invoca activity functions (reserva stock → cobra pago → crea envío) y, si un paso falla, ejecuta las compensaciones en orden inverso. El estado del workflow se persiste automáticamente (event sourcing sobre Azure Storage o SQL/MSSQL provider), sobrevive a reinicios y soporta timers, eventos externos y reintentos declarativos. La restricción crítica: el código del orquestador debe ser determinista.

### 📖 Respuesta detallada
**Por qué sagas.** En microservicios no hay transacciones ACID entre bases de datos de servicios distintos (two-phase commit no escala y acopla disponibilidad). La saga acepta consistencia eventual: cada paso commitea localmente y publica el siguiente; ante fallo, se ejecutan **compensaciones** (reembolsar, liberar stock) — que no son rollbacks: son acciones de negocio nuevas, y algunas cosas no se compensan (un email enviado), por lo que el orden de pasos importa (lo irreversible al final).

**Coreografía vs orquestación.** Coreografía: cada servicio reacciona a eventos del anterior; simple con 2–3 pasos, pero el flujo global queda implícito y el debugging de "¿en qué estado está el pedido 4711?" se vuelve arqueología de logs. Orquestación: un componente dirige el flujo y conoce el estado; es explícito, testeable y monitorizable, a cambio de introducir un punto de coordinación. Durable Functions es la implementación natural de orquestación en Azure (la alternativa low-code es Logic Apps; en AKS puro, temporal.io o una máquina de estados propia).

**Cómo funciona Durable Functions.** El orchestrator no ejecuta trabajo: lo delega en *activities* y en *sub-orchestrations*. Su ejecución usa **event sourcing con replay**: cada vez que despierta, re-ejecuta el código desde el inicio y las llamadas ya completadas se resuelven desde el historial persistido (tabla History en Azure Storage, o el provider MSSQL/Netherite para más throughput). De ahí la regla de oro: **código determinista** — nada de `DateTime.Now`, `Guid.NewGuid()`, random, I/O ni llamadas HTTP directas en el orquestador; todo eso va en activities o mediante las APIs deterministas (`context.CurrentUtcDateTime`, `context.NewGuid()`). Violar el determinismo produce errores de "non-deterministic workflow" o, peor, comportamientos silenciosamente corruptos tras un replay.

**Primitivas útiles para sagas reales:** reintentos declarativos por activity (`CallActivityWithRetryAsync` con backoff), **durable timers** para timeouts de negocio ("si el pago no confirma en 30 min, compensar"), `WaitForExternalEvent` para pasos con intervención humana o callbacks de terceros (patrón human interaction), sub-orquestaciones para composición, y `ContinueAsNew` para flujos eternos sin historial infinito. El patrón de saga queda: try/catch alrededor de la secuencia de activities; en el catch, ejecutar la pila de compensaciones registrada hasta el punto de fallo, también con reintentos, y si una compensación falla persistentemente → cola de intervención manual + alerta.

**Consideraciones operativas y límites.** Idempotencia obligatoria en activities: la garantía es at-least-once (un crash tras ejecutar la activity pero antes de persistir el resultado provoca re-ejecución). Los payloads entre orquestador y activities se serializan al historial: pasar objetos grandes infla el storage y la latencia (pasa IDs, no documentos). Con el backend de Storage por defecto, el throughput de orquestaciones tiene techo por las colas de control (particiones, por defecto 4); para miles de sagas/segundo, considerar el provider Netherite o MSSQL. Monitorización: Durable Functions emite trazas a App Insights con el instance ID; expón el estado vía las management APIs (`statusQueryGetUri`) para soporte. Versionado: cambiar el código de un orquestador con instancias en vuelo rompe el replay — se versiona el nombre del orquestador o se drena antes de desplegar.

## 3. Dapr sobre Container Apps: qué aporta a microservicios
**Categoría:** Plataformas y runtime · **Tipo:** Conceptual

### 📝 Respuesta resumen
Dapr es un runtime de "building blocks" distribuidos expuesto como sidecar: service invocation con mTLS y reintentos, pub/sub, state store, bindings, secrets y actors — todos consumidos por HTTP/gRPC local y configurados por componentes intercambiables (hoy Service Bus, mañana Kafka, sin tocar código). Container Apps lo trae gestionado: se habilita con `--enable-dapr` por app, sin instalar nada. Aporta desacoplamiento de la infraestructura y resiliencia estándar; cuesta un hop extra de latencia y una capa más que depurar.

### 📖 Respuesta detallada
**Modelo.** Cada réplica de la app recibe un sidecar Dapr (`daprd`). La app habla con `localhost:3500` (HTTP) o gRPC y el sidecar resuelve el destino: otro servicio (`invoke/pedidos/method/crear`), un broker (`publish/pubsub/pedido-creado`) o un state store (`state/statestore/clave`). La infraestructura concreta se define en *components* (YAML/Bicep en ACA): un componente `pubsub` puede apuntar a Service Bus, Event Hubs, Kafka o Redis — el código no cambia. Esto es oro para portabilidad y para tests locales (Redis en local, Service Bus en cloud).

**Building blocks relevantes para backend:**
- **Service invocation:** descubrimiento por app-id, mTLS automático entre sidecars, reintentos y access policies declarativas (qué app puede llamar a cuál). Evita implementar service discovery y asegura el tráfico este-oeste sin un mesh completo.
- **Pub/sub:** entrega at-least-once con topics, suscripciones declarativas o programáticas, dead-letter topics, y CloudEvents como envelope por defecto. El sidecar gestiona la conexión al broker, el checkpointing y el backpressure básico.
- **State management:** API clave-valor con concurrencia optimista por ETag, opciones de consistencia y TTL, sobre Cosmos, Redis, Postgres… Útil para estado de servicio; no reemplaza el modelo de datos rico de cada servicio.
- **Resiliency policies:** timeouts, reintentos con backoff y circuit breakers definidos declarativamente por componente o destino — sacas Polly del código y lo estandarizas entre lenguajes.
- **Secrets y bindings:** lectura de Key Vault uniforme; bindings de entrada/salida (cron, storage, SMTP) sin SDKs específicos.
- **Actors:** entidades con estado y concurrencia de un solo hilo (patrón virtual actor), útiles para "una instancia lógica por entidad" (dispositivo IoT, carrito).

**Por qué ACA + Dapr encaja.** En Container Apps, Dapr es una feature de plataforma: versión gestionada, componentes con scoping por app, integración con Managed Identity para que los componentes accedan a Service Bus/Cosmos sin secretos, y KEDA al lado para escalar por la profundidad del broker. Obtienes el 80% del valor de un service mesh + SDKs de mensajería sin operar Istio ni escribir plumbing por lenguaje — especialmente valioso en equipos políglotas (.NET + Node + Python con el mismo contrato de resiliencia).

**Trade-offs y errores comunes.** El sidecar añade ~1–2 ms por hop y consumo de memoria por réplica; para rutas ultra-calientes puede importar. Debugging: un fallo puede estar en tu código, en el sidecar o en el componente — hay que aprender a leer los logs de `daprd` y las trazas (Dapr emite OpenTelemetry, intégralo con App Insights). Abstracción con fugas: los brokers no son intercambiables en semántica (orden, sesiones de Service Bus, particiones de Kafka) aunque la API lo sugiera; si dependes de sesiones o de orden por partición, valida el componente concreto. Y no uses Dapr para todo por dogma: si solo necesitas exponer una API REST sin dependencias, el sidecar es peso muerto.

## 4. Observabilidad con Application Insights: distributed tracing y sampling
**Categoría:** Observabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Application Insights correlaciona telemetría (requests, dependencies, exceptions, traces, custom events/metrics) mediante W3C Trace Context: cada request lleva `traceparent`, y los SDK/OpenTelemetry propagan operation_id entre servicios y a través de Service Bus, lo que habilita el Application Map y la transaction search de extremo a extremo. Como el volumen factura por GB ingerido en Log Analytics, el sampling (adaptativo, de porcentaje fijo o por ingestión) es imprescindible a escala; debe ser coherente entre servicios para no romper trazas.

### 📖 Respuesta detallada
**Modelo de datos.** Todo va a un workspace de Log Analytics en tablas: `requests` (operaciones entrantes), `dependencies` (salientes: HTTP, SQL, Cosmos, Service Bus), `exceptions`, `traces` (logs), `customEvents`/`customMetrics`, `availabilityResults`. La correlación se apoya en `operation_Id` (toda la transacción distribuida) y `operation_ParentId` (la llamada inmediata superior). El estándar de propagación es **W3C Trace Context** (header `traceparent: version-traceid-spanid-flags`); los SDK modernos y las distros de OpenTelemetry de Azure Monitor lo propagan automáticamente en HTTP y lo embeben en mensajes de Service Bus (`Diagnostic-Id`), de modo que una traza cruza también los hops asíncronos.

**Lo que te da la correlación bien hecha:** Application Map (topología con tasas de error y latencia por arista — el primer sitio donde mirar en un incidente), end-to-end transaction details (waterfall de spans de una operación concreta), y KQL sobre las tablas: `requests | where operation_Id == '...'` une todo lo de una transacción. Para microservicios, decisión importante: **un solo workspace/App Insights compartido** con `cloud_RoleName` distinto por servicio (el rol es lo que separa nodos en el mapa) suele ganar a un recurso por servicio, porque las queries cross-servicio y el mapa funcionan sin uniones entre workspaces.

**Sampling — el tema que separa niveles.** La telemetría se factura por GB ingerido (~2,3–2,8 USD/GB en pay-as-you-go); un clúster mediano sin sampling genera cientos de GB/mes. Tipos:
- **Adaptive sampling** (default en .NET): ajusta la tasa dinámicamente para no superar N items/segundo. Cómodo, pero la tasa varía por instancia y complica contar con precisión.
- **Fixed-rate sampling:** porcentaje fijo (p. ej. 10%). La clave es que **todos los servicios usen el mismo porcentaje**: la decisión de muestreo se basa en el operation_id (head-based, consistente), así que con tasas iguales las trazas se conservan completas o se descartan completas; con tasas distintas obtienes trazas rotas (aparece el hop 2 sin el hop 1).
- **Ingestion sampling:** recorta en el endpoint de Azure, después de enviar — ahorra factura pero no ancho de banda ni CPU, y pisa cualquier lógica del SDK. Último recurso.
Los items muestreados llevan `itemCount` para que las agregaciones (`sum(itemCount)`) sigan siendo estadísticamente correctas. Las métricas pre-agregadas y los availability tests no se muestrean. Con OpenTelemetry puro, el equivalente es el sampler `ApplicationInsightsSampler` (consistente por trace-id) y, si necesitas "guardar todos los errores, muestrear los éxitos", tail-based sampling vía Collector.

**Prácticas senior.** Instrumentar custom dimensions de negocio (tenantId, orderId) para poder filtrar incidentes por cliente; usar Live Metrics para despliegues (latencia y errores en tiempo real sin costo de ingestión); availability tests sintéticos multi-región contra los endpoints públicos; alertas sobre KQL (percentil 95 de latencia por operación, tasa de excepciones nuevas) y smart detection de anomalías. Controlar el costo con: sampling coherente, `LogLevel` de logs a Warning en producción (los `traces` de nivel Information son el 80% del GB típico), daily cap como airbag (con alerta, porque al alcanzarlo pierdes telemetría) y retención interactiva ajustada (90 días default de App Insights) con archive tier para lo demás.

## 5. Despliegues blue/green y canary en AKS
**Categoría:** Entrega continua · **Tipo:** Conceptual

### 📝 Respuesta resumen
Blue/green mantiene dos entornos completos y conmuta el tráfico de golpe (con rollback instantáneo = volver a apuntar al azul); canary desplaza tráfico gradualmente (1% → 10% → 50% → 100%) validando métricas en cada paso. En AKS se implementan con: rolling updates nativos (lo mínimo), Argo Rollouts o Flagger para análisis automático de métricas y promoción/rollback automáticos, y el reparto de tráfico real lo hace el ingress (NGINX canary annotations), un mesh (Istio/Linkerd) o Application Gateway. La pieza que falta siempre: compatibilidad de esquema de datos entre versiones.

### 📖 Respuesta detallada
**Rolling update (la base).** El Deployment nativo reemplaza pods gradualmente (`maxSurge`/`maxUnavailable`) con readiness probes como puerta. Sirve para cambios de bajo riesgo, pero no controla el *porcentaje de tráfico* (un pod nuevo entre nueve viejos recibe ~10% por azar de balanceo, sin control ni análisis) y el rollback implica otro rollout completo. Requisito absoluto: probes honestas y `preStop` + graceful shutdown para no cortar requests en vuelo.

**Blue/green.** Dos Deployments completos (`app-blue`, `app-green`); el Service o el ingress apunta a uno. Se despliega green, se ejecutan smoke tests contra su endpoint interno, y se conmuta el selector o la ruta — el cambio es atómico y el rollback es re-conmutar (segundos). Costos y trampas: duplicas capacidad durante la ventana (en clústeres justos de recursos, el autoscaler tiene que poder crecer); las conexiones largas (websockets, gRPC streams) no migran solas con el switch — hay que drenar; y el estado compartido (base de datos) debe ser compatible con ambas versiones durante toda la ventana. Herramienta: Argo Rollouts con estrategia `blueGreen` (con `previewService`, `activeService` y auto-promotion opcional tras análisis).

**Canary.** El objetivo es limitar el blast radius y decidir con métricas, no con fe. Implementaciones:
- **NGINX Ingress:** un segundo ingress con `nginx.ingress.kubernetes.io/canary: "true"` y `canary-weight: "10"` (o canary por header/cookie para dark launch a testers internos). Simple, suficiente para empezar.
- **Service mesh (Istio/Linkerd) o Gateway API:** pesos exactos por VirtualService/HTTPRoute independientes del número de réplicas, mirroring de tráfico (shadow: la v2 recibe copia del tráfico real sin responder al usuario — la validación más barata que existe) y corte por atributos.
- **Argo Rollouts / Flagger:** automatizan la progresión: pasos de peso con pausas, y en cada paso un *análisis* contra Prometheus/App Insights (tasa de errores 5xx, p99 de latencia, métricas de negocio como tasa de conversión). Si el análisis falla → rollback automático al peso 0. Esto convierte el canary de proceso manual heroico a pipeline repetible.

**Lo que hace fallar los canaries en la práctica:** (1) *Esquema de datos:* la v2 migra una columna y la v1, que aún sirve el 90%, explota — regla expand/contract: primero cambios aditivos compatibles, migrar código, luego limpiar; nunca breaking changes de esquema dentro de un despliegue de tráfico mixto. (2) *Afinidad:* usuarios saltando entre v1 y v2 en requests sucesivas rompen flujos con estado — usar session affinity o canary por usuario (hash del user-id), no por request. (3) *Métricas insuficientes:* si solo miras 5xx, un bug que devuelve 200 con datos erróneos pasa el análisis — incluir métricas de negocio. (4) *Eventos y mensajería:* los consumidores de Service Bus no reciben "10% del tráfico" — el canary de consumidores se hace por colas/topics paralelos o feature flags, no por pesos de ingress. (5) Feature flags (Azure App Configuration) complementan: separan *deploy* de *release* y permiten apagar una funcionalidad sin redesplegar.

## 6. Idempotencia, outbox y exactly-once práctico en mensajería Azure
**Categoría:** Patrones distribuidos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Service Bus y Event Hubs entregan at-least-once: los duplicados y reordenamientos son parte del contrato. "Exactly-once" real no existe extremo a extremo; se aproxima con: publicación atómica mediante transactional outbox (el evento se guarda en la misma transacción local que el dato y un dispatcher lo publica), consumidores idempotentes (clave de idempotencia + almacenamiento del resultado), duplicate detection de Service Bus como red de apoyo, y diseño de reintentos con backoff + DLQ. Quien dice "uso exactly-once del broker" sin matices, suspende.

### 📖 Respuesta detallada
**El problema de la doble escritura.** Un servicio que guarda en su base de datos y luego publica a Service Bus tiene una ventana fatal: si el proceso muere entre ambas operaciones, hay dato sin evento (o evento sin dato si inviertes el orden). No hay transacción distribuida entre SQL/Cosmos y Service Bus. Solución canónica: **transactional outbox** — en la misma transacción local se inserta el registro de negocio y una fila en la tabla `outbox`; un dispatcher (proceso en background, o Debezium/CDC, o el change feed de Cosmos que actúa de outbox natural) lee la outbox y publica, marcando lo enviado. El dispatcher puede publicar dos veces si muere tras publicar y antes de marcar → el sistema pasa de "puede perder eventos" a "puede duplicar eventos", que es el problema bueno, porque se resuelve aguas abajo.

**Consumidores idempotentes.** Tres técnicas por orden de robustez: (1) *Idempotencia natural:* operaciones que son seguras de repetir (`SET estado = 'pagado'` sí; `SET saldo = saldo - 100` no). (2) *Clave de idempotencia:* el mensaje lleva `MessageId`/clave de negocio; el consumidor registra las claves procesadas (tabla con unique constraint, o el propio agregado guarda el último eventId aplicado) y descarta repetidos — el registro debe escribirse **en la misma transacción** que el efecto, o reintroduces la ventana. (3) *Versionado optimista:* el evento lleva la versión esperada del agregado y el consumidor rechaza versiones ya aplicadas — además protege contra reordenamiento.

**Qué te da la plataforma y qué no.**
- Service Bus **duplicate detection**: descarta mensajes con el mismo `MessageId` dentro de una ventana (hasta 7 días; con costo de rendimiento en ventanas grandes). Cubre reintentos del *publicador*, no re-entregas al consumidor (un `Abandon` o un lock expirado re-entrega el mismo mensaje con el mismo id — y eso duplicate detection no lo filtra). Por eso es red de apoyo, no solución.
- Service Bus transactions: permiten atomizar "completar el mensaje entrante + enviar los salientes" vía transferencia (`EnableCrossEntityTransactions`), útil para pipelines broker-a-broker, pero no incluye tu base de datos.
- El lock de PeekLock expira (default 30 s): un handler lento re-entrega aunque "todo fuera bien" — renovar lock (los SDK modernos auto-renuevan) y mantener handlers cortos.
- Event Hubs: no hay ni locks ni dedup; la idempotencia del consumidor es obligatoria porque el rebalanceo de particiones re-procesa desde el último checkpoint.

**Reintentos y DLQ como parte del diseño.** Reintento inmediato para fallos transitorios (con backoff exponencial y jitter), distinción explícita entre errores *transitorios* (timeout de dependencia → reintentar) y *permanentes* (payload inválido → DLQ directa sin quemar los 10 delivery counts), y una DLQ con proceso: alerta por profundidad, herramienta de inspección y re-envío, y métrica de edad del mensaje más viejo. Para reintentos diferidos (retry en 5 min), Service Bus permite scheduled messages: se re-encola una copia con `ScheduledEnqueueTime` y se completa la original. Cerrar con esta idea gana entrevistas: la fiabilidad no está en el broker, está en el diseño transaccional de los bordes — outbox al publicar, idempotencia al consumir, y el broker solo transporta.

## 7. [CASO] Cosmos DB devuelve 429: RU exhaustion y hot partition
**Categoría:** Datos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Los 429 significan que se excedió el presupuesto de RU/s en algún segundo — a nivel de contenedor o, más frecuente y traicionero, en una sola partición física (hot partition), porque el throughput se reparte uniformemente entre particiones. Diagnóstico: métrica Total Request Units con split por PartitionKeyRangeId, Normalized RU Consumption, y Diagnostic Logs con KQL para identificar operaciones caras. Solución según causa: reintentos correctos, más RU/autoscale, optimizar queries/índices, o —si es hot partition— rediseñar la partition key.

### 📖 Respuesta detallada
**Escenario.** El servicio de pedidos empieza a lanzar `CosmosException` con status 429 en horas pico; la latencia p99 sube porque el SDK reintenta. La métrica de RU/s del contenedor marca 60% de uso promedio — y aún así hay 429s. Ese "60% pero throttling" es la pista clave.

**Diagnóstico paso a paso.**
1. **Azure Monitor → métrica `Total Request Units`** con filtro por StatusCode=429 y split por `PartitionKeyRangeId`: confirma si el throttling se concentra en un rango de particiones. Complementar con **`Normalized RU Consumption`** (máximo por partición física): si el normalizado está al 100% mientras el promedio del contenedor está al 60%, tienes **hot partition** de manual — una partición física recibe más tráfico del que le toca en el reparto uniforme (con 30.000 RU/s y 6 particiones físicas, cada una tiene 5.000; la caliente pide 9.000).
2. **Diagnostic settings → Log Analytics**, tabla `CDBDataPlaneRequests`: `where statusCode_s == 429 | summarize count() by operationName_s, requestResourceType_s` para saber si el throttling viene de queries, escrituras o del change feed. `CDBPartitionKeyRUConsumption` da el consumo por clave de partición lógica — identifica *qué* clave es la caliente (¿un tenant enorme? ¿la fecha de hoy como clave?).
3. **Revisar el patrón de las operaciones caras:** queries cross-partition (`CDBQueryRuntimeStatistics`), RU charge por operación (el SDK lo expone en `RequestCharge`), y el índice: una query que filtra por campo no indexado escanea y dispara el costo; una escritura con indexing policy por defecto indexa todos los campos (documentos grandes = escrituras de 50+ RU).

**Causas típicas y soluciones.**
- **Provisioning insuficiente real:** si el consumo es uniforme y roza el 100%, subir RU/s o pasar a autoscale (escala 10%–100% del máximo al instante; cuesta 1,5× por RU pero absorbe picos). Serverless si la carga es baja e intermitente.
- **Hot partition:** ninguna cantidad de RU/s razonable lo arregla (el máximo por partición física es 10.000 RU/s). Rediseñar la clave: mayor cardinalidad, clave sintética (`tenantId_hashmod`), hierarchical partition keys (`/tenantId/orderId`) para tenants desbalanceados, o write sharding con sufijo aleatorio para cargas append por fecha. Cambiar la partition key exige migrar el contenedor (copiar con change feed o container copy jobs) — por eso es la decisión de diseño más cara de revertir en Cosmos.
- **Queries ineficientes:** ajustar indexing policy (incluir solo rutas usadas — también abarata escrituras), reescribir queries para incluir la partition key en el filtro, paginar con continuation tokens, y cachear lecturas repetidas (integrated cache con dedicated gateway para cargas read-heavy, o Redis).
- **Reintentos:** el SDK reintenta 429 automáticamente (`MaxRetryAttemptsOnRateLimitedRequests`, respetando `x-ms-retry-after-ms`); verificar que la app no tenga *otra* capa de retry encima que amplifique la tormenta, y que los 429 "absorbidos" no estén ocultando el problema inflando latencia.

**Prevención.** Alertas sobre Normalized RU Consumption >85% por partición y sobre tasa de 429; test de carga con distribución realista de claves (el bug clásico: en test todas las claves uniformes, en producción el tenant grande es el 40%); revisar `RequestCharge` en code review para operaciones nuevas; y dimensionar con la regla de oro: la partition key se elige por el patrón de acceso dominante, no por elegancia del modelo.

## 8. [CASO] La DLQ de Service Bus crece sin parar
**Categoría:** Mensajería · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Primero, leer los mensajes muertos: `DeadLetterReason` (`MaxDeliveryCountExceeded`, `TTLExpiredException`, filtros) y `DeadLetterErrorDescription` dicen por qué murieron. Las causas raíz típicas: un poison message (payload que rompe el handler), una dependencia caída que hace fallar todo, locks que expiran por handlers lentos, o TTL demasiado corto con consumidores insuficientes. La solución combina arreglar la causa, reprocesar la DLQ de forma controlada, y prevenir: validación temprana, distinción transitorio/permanente, auto-renovación de locks y alertas de profundidad y edad.

### 📖 Respuesta detallada
**Escenario.** Alerta: la suscripción `facturacion` del topic `pedidos` acumula 40.000 mensajes en DLQ y sigue creciendo; el negocio reporta facturas que no salen.

**Diagnóstico paso a paso.**
1. **Clasificar los muertos.** Con Service Bus Explorer (portal o herramienta) hacer *peek* de la DLQ y agrupar por `DeadLetterReason`:
   - `MaxDeliveryCountExceeded` (lo más común): el handler falló N veces (default 10). Ver la excepción en App Insights correlacionando por `MessageId`/`operation_Id` en la tabla `exceptions`.
   - `TTLExpiredException`: nadie consumió a tiempo → problema de throughput de consumidores o TTL mal configurado.
   - Errores de sesión o filtro: mensajes sin `SessionId` en entidad con sesiones, o headers que rompen la suscripción.
2. **Distinguir patrón:** ¿todos los muertos son el mismo tipo de mensaje/payload (poison message, bug de deserialización, un productor que cambió el contrato)? ¿O son heterogéneos y empezaron a una hora concreta (dependencia caída: la base de datos de facturación, un tercero)? El timestamp `EnqueuedTime` vs hora de muerte dibuja la historia.
3. **Revisar locks:** si App Insights muestra `MessageLockLostException`, el handler tarda más que el lock (30 s default). Eso cuenta como delivery fallido y quema los 10 intentos con un handler que "funcionaba, pero lento" (p. ej., la dependencia degradada a 40 s de respuesta).
4. **KQL útil:** `dependencies | where type == "Azure Service Bus" | summarize percentile(duration, 95) by name` para la latencia del procesamiento, y `exceptions | summarize count() by type, outerMessage | order by count_` para el top de errores.

**Solución.**
- Arreglar la causa: bug del handler, contrato del productor (desplegar tolerancia a campos nuevos), o la dependencia caída.
- **Reprocesar la DLQ:** un job que lee de la DLQ (path `<entidad>/$DeadLetterQueue`) y re-envía a la cola principal — con throttling (no inyectar 40.000 de golpe contra la dependencia recién recuperada), con límite de re-muertes (si vuelve a morir, aparcarlo en storage para análisis) y preservando el payload y las propiedades. Los mensajes irreparables se exportan y se completan.
- Si el problema fue de throughput: escalar consumidores (KEDA sobre profundidad de cola), subir `MaxConcurrentCalls`/prefetch con cuidado (prefetch grande + handler lento = locks que expiran en el buffer).

**Prevención.**
- Validar y deserializar **al principio** del handler; payload inválido → dead-letter explícito inmediato (`DeadLetterAsync` con razón) sin quemar 10 reintentos.
- Clasificar excepciones: transitorias → reintento/abandono; permanentes → DLQ directa. Reintentos diferidos con scheduled messages para dependencias caídas (evita el martilleo).
- Auto-renovación de lock (`MaxAutoLockRenewalDuration`) y handlers cortos: el trabajo pesado se delega (guardar y responder, procesar aparte).
- **Alertas:** métrica `DeadletteredMessages` (umbral y tendencia) y edad del mensaje activo más viejo; dashboard de DLQ por entidad. Una DLQ sin alerta es un agujero negro de negocio: los mensajes muertos son casi siempre dinero (pedidos, facturas) y el peor incidente es descubrirlos semanas después.
- Runbook de reprocesamiento escrito y probado antes del incidente, con el tooling listo (no improvisar un script a las 3 AM).

## 9. [CASO] App Service con memory leak y reinicios continuos
**Categoría:** Cómputo / rendimiento · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Síntoma: memoria creciendo linealmente hasta reinicio (por límite del plan o health check), con latencia degradándose antes de cada caída por presión de GC. Diagnóstico: métricas de memoria por instancia, Diagnose and Solve Problems, y sobre todo memory dumps comparados (App Service Diagnostics/Kudu) analizados con dotnet-dump/PerfView para ver qué retiene el heap. Causas típicas .NET: caches sin límite, event handlers no des-suscritos, HttpClient mal usado, captura de contextos en estáticos. Mitigar con auto-heal mientras se arregla la raíz.

### 📖 Respuesta detallada
**Escenario.** Una API .NET en App Service P1v3 (8 GB) se reinicia cada ~6 horas. App Insights muestra latencia p95 subiendo progresivamente hasta cada reinicio; en `exceptions` aparecen algunos `OutOfMemoryException` y los reinicios constan como "proactive auto heal" o recycles del contenedor.

**Diagnóstico paso a paso.**
1. **Confirmar el patrón:** Azure Monitor → métricas `Memory working set` / `Private Bytes` por instancia (no promediadas: el leak puede ser de una instancia). El dibujo de sierra (subida lineal + caída vertical en el reinicio) confirma leak; una meseta alta estable sería simplemente under-provisioning.
2. **Descartar causas de plataforma:** Diagnose and Solve Problems → Memory Analysis; revisar si hay múltiples apps en el mismo App Service Plan compitiendo (la memoria es del plan, no de la app) y si hubo despliegue correlacionado con el inicio del patrón (Activity Log + release pipeline).
3. **Capturar evidencia real:** dos memory dumps de la misma instancia con 30–60 min de separación (App Service Diagnostics → Collect Memory Dump, o Kudu). Analizar con `dotnet-dump analyze`: `dumpheap -stat` y comparar — el tipo cuyo count/size crece entre dumps es el sospechoso; `gcroot` sobre instancias concretas revela quién las retiene.
4. **Sospechosos habituales en .NET:** `MemoryCache`/diccionarios estáticos sin límite ni expiración (cachear por request-key con cardinalidad infinita); suscripciones a eventos de objetos long-lived que retienen a los short-lived; `HttpClient` creado por request (agota sockets y memoria — usar `IHttpClientFactory`); closures capturadas en timers/estáticos; buffers grandes (>85 KB) que van al Large Object Heap y lo fragmentan; y en contenedores, límites de cgroup que el GC no conocía (configurar `DOTNET_GCHeapHardLimit` o usar Server GC consciente del límite).
5. **App Insights ayuda a acotar:** `performanceCounters | where name == "Private Bytes"` correlacionado con deployment markers; si el leak arrancó con una release concreta, el diff del código es el mapa.

**Solución.** Corregir la causa (poner límites y expiración a caches con `MemoryCacheOptions.SizeLimit`, arreglar suscripciones con weak references o dispose correcto, `IHttpClientFactory`). Mientras tanto, **mitigación honesta**: Auto-heal (Diagnose and Solve → Auto-Heal) con regla de reciclaje por umbral de memoria privada — un reinicio controlado y escalonado es mejor que un OOM en hora pico; asegurarse de tener ≥2 instancias para que el reciclaje no cause downtime, y health check endpoint habilitado para que el balanceador saque a la instancia enferma antes del reinicio.

**Prevención.** Presupuesto de memoria como métrica de release (comparar working set pre/post despliegue en el canary); pruebas de soak (carga sostenida horas, no solo picos) en el pipeline para leaks lentos; alerta de tendencia (memoria creciendo >X%/hora, no solo umbral absoluto — el umbral avisa tarde); dumps automáticos con auto-heal en umbral alto para tener evidencia sin intervención; y revisar en code review todo estado estático y toda suscripción a eventos. Nota de arquitectura: si el servicio es sano pero simplemente necesita más memoria, escalar el plan; escalar para tapar un leak solo compra tiempo y duplica el costo.

## 10. [CASO] AKS: pods evicted y nodos bajo presión
**Categoría:** Kubernetes / operación · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Evictions con razón `MemoryPressure`/`DiskPressure` significan que el kubelet expulsa pods para salvar el nodo. Casi siempre la raíz es requests/limits mal definidos: pods sin memory request se programan de más (overcommit) y son los primeros expulsados. Diagnóstico: `kubectl describe node` (conditions, allocated resources), events de eviction, Container Insights para memoria real vs requests. Solución: requests honestos basados en consumo real, limits de memoria = requests para cargas críticas, PriorityClasses, y dimensionar nodos contando las reservas del sistema.

### 📖 Respuesta detallada
**Escenario.** Alertas de pods en estado `Evicted`; `kubectl get pods` muestra decenas de pods muertos con `The node was low on resource: memory`, y algunos servicios pierden réplicas en hora pico.

**Diagnóstico paso a paso.**
1. **El nodo:** `kubectl describe node <n>` → Conditions (`MemoryPressure=True`), y la sección Allocated resources: si los memory requests suman el 60% pero el uso real es el 95%, hay **overcommit**: contenedores que usan mucho más de lo que declararon (o no declararon nada). El kubelet en AKS expulsa cuando `memory.available` cae bajo el umbral (típicamente 750Mi como eviction threshold configurado por AKS).
2. **Quién consume:** Container Insights (o Managed Prometheus/Grafana): memoria working set por pod vs sus requests. KQL: `Perf | where ObjectName == "K8SContainer" and CounterName == "memoryWorkingSetBytes" | summarize max(CounterValue) by InstanceName` contra los requests declarados. Los pods sin request (`BestEffort`) y los que exceden su request (`Burstable` por encima) son los primeros candidatos a eviction, en ese orden.
3. **Events:** `kubectl get events --field-selector reason=Evicted -A` y los logs del kubelet vía diagnósticos de AKS. Si es `DiskPressure`: imágenes acumuladas, logs de contenedor sin rotar o `emptyDir` desbocados (`df` en el nodo vía `kubectl debug node`).
4. **Matemática del nodo:** en un nodo de 8 GB no hay 8 GB para pods: restar kube-reserved/system-reserved (AKS reserva una fracción decreciente por escalones de memoria, más el eviction threshold) — quedan ~6,5 GB asignables. Planificar como si hubiera 8 explica "nodos que expulsan con el dashboard al 80%".

**Solución.**
- **Requests honestos:** fijar memory requests al p95 del consumo real observado (dos semanas de datos), y para servicios críticos **limits = requests** en memoria (clase `Guaranteed`): no pueden ser expulsados por presión salvo que ellos mismos excedan su límite (entonces OOMKill, que es diagnóstico más claro y localizado que una eviction).
- **PriorityClasses:** los servicios de negocio con prioridad alta; jobs batch con prioridad baja y tolerancia a preemption. Sin esto, el scheduler y el eviction manager tratan igual al checkout y al cronjob de informes.
- **Capacidad:** cluster autoscaler con headroom (o Karpenter/Node Auto Provisioning); revisar el tamaño de nodo — muchos pods pequeños en nodos grandes concentra el blast radius; el límite de ~250 pods por nodo y el CIDR también cuentan.
- Si es disco: rotación de logs, `imageGCHighThreshold`, y ephemeral-storage requests/limits.

**Prevención.** Gobernanza: LimitRanges (defaults por namespace para que nada entre sin requests) y ResourceQuotas por equipo; policy (Gatekeeper/Kyverno) que rechaza Deployments sin requests; alertas sobre `kube_node_status_condition{condition="MemoryPressure"}` y sobre el ratio uso real/requests por namespace (detecta la deriva antes de la eviction); VPA en modo recomendación para recalibrar requests periódicamente; y PodDisruptionBudgets — no evitan evictions por presión (solo las voluntarias), pero protegen en drains y upgrades, que suelen mezclarse en el mismo incidente. Punto senior: las evictions casi nunca son "falta de infraestructura"; son un contrato de recursos mal declarado — la solución cultural (requests como parte del definition of done) importa más que añadir nodos.

## 11. [CASO] Latencia alta entre servicios en AKS: DNS, conntrack y kube-proxy
**Categoría:** Kubernetes / redes · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Latencia intermitente servicio-a-servicio en AKS con la app "sana" suele ser infraestructura de red del clúster: resolución DNS lenta (CoreDNS saturado, o el clásico ndots:5 que multiplica queries), agotamiento de conntrack/SNAT, o desbalanceo por conexiones keep-alive largas. Diagnóstico: separar en la traza de App Insights el tiempo de DNS/conexión del tiempo de servidor, medir CoreDNS (métricas y ndots), y revisar drops de conntrack. Soluciones: node local DNS cache, FQDN con punto final o ndots ajustado, keep-alive bien configurado y, según el caso, migrar a Cilium/eBPF.

### 📖 Respuesta detallada
**Escenario.** El servicio A llama al B dentro del clúster; App Insights muestra p50 de 8 ms pero p95 de 300+ ms y picos de 1–5 s, sin correlación con CPU de B. El tiempo de servidor de B (su `requests.duration`) es bajo: la latencia está *entre* los servicios.

**Diagnóstico paso a paso.**
1. **Aislar la capa.** Comparar `dependencies.duration` en A contra `requests.duration` en B para las mismas operation_Id: si B procesó en 10 ms pero A midió 900 ms, el tiempo se fue en DNS + TCP connect + espera de cola local. Confirmar con un curl con `--write-out` de tiempos por fase desde un pod de A.
2. **DNS, el sospechoso número uno.** Kubernetes configura los pods con `ndots:5`: un nombre como `servicio-b.otro-ns.svc.cluster.local` resuelto como `servicio-b.otro-ns` genera hasta 5 búsquedas con sufijos (`.<ns>.svc.cluster.local`, `.svc.cluster.local`, …) y varias fallan antes de acertar — multiplicado por A/AAAA en paralelo. Si CoreDNS está saturado (pocos réplicas, picos de QPS) o hay pérdida de paquetes UDP, aparecen timeouts de 1 o 5 s exactos (el timeout clásico de resolv.conf) — ese patrón de "picos en valores redondos" es la firma de DNS. Medir: métricas de CoreDNS (latencia, cache hits) y `kubectl top` de los pods coredns.
3. **Conntrack/SNAT.** Con mucho tráfico este-oeste o hacia fuera, la tabla conntrack del nodo se agota (`node_nf_conntrack_entries` cerca del límite) y los paquetes se descartan → retransmisiones TCP → latencias de cientos de ms. El equivalente de salida: SNAT port exhaustion hacia servicios externos si la salida va por Load Balancer con pocos puertos por nodo.
4. **Balanceo y keep-alive.** kube-proxy (iptables) balancea *conexiones*, no requests: con HTTP/1.1 keep-alive o gRPC (una conexión HTTP/2 multiplexada), un cliente puede clavar todas sus requests en un solo pod de B mientras otros están ociosos — B "en promedio" está bien pero un pod concreto se satura. Ver la distribución de requests por pod en Container Insights.

**Soluciones.**
- **DNS:** habilitar node-local DNS cache en AKS (caché en cada nodo, convierte la mayoría de resoluciones en locales y usa TCP hacia CoreDNS); usar FQDN completos con punto final (`servicio-b.ns.svc.cluster.local.`) o `dnsConfig` con `ndots:2` en los pods chatty; escalar CoreDNS (HPA por QPS) y cachear resoluciones en la app (los HttpClient pools ayudan de por sí).
- **Conntrack/SNAT:** subir límites de conntrack si procede, NAT Gateway para la salida (64k puertos por IP, sin el juego de asignación por nodo del LB), y reducir churn de conexiones (keep-alive, pools).
- **Balanceo:** para gRPC, balanceo client-side por DNS headless service o un mesh (Istio/Linkerd hacen balanceo por request en L7); para HTTP/1.1, limitar la vida de conexiones (`MaxConnectionLifetime` / `PooledConnectionLifetime` en .NET) para re-balancear periódicamente — también es el fix de "sigue llamando a pods muertos tras un rollout".
- Si el clúster es grande y el equipo lo domina: dataplane Cilium/eBPF (sin iptables por servicio, observabilidad Hubble).

**Prevención.** SLO de latencia con percentiles por arista del Application Map; dashboards de CoreDNS y conntrack como parte del monitoring base del clúster; pruebas de carga que incluyan el patrón real de conexiones (los tests con una conexión por request esconden el problema de keep-alive); y en el postmortem, documentar la firma "picos de 1/5 s = DNS" — reduce el próximo diagnóstico de días a minutos.

## 12. [CASO] Azure Functions con cold starts y timeouts
**Categoría:** Serverless · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
En plan Consumption, una Function sin tráfico se desprovisiona; la siguiente invocación paga el cold start (asignar worker + arrancar runtime + dependencias de la app: de cientos de ms a >10 s con DI pesada) y además el timeout por defecto es 5 min (máx. 10). Diagnóstico: App Insights distingue duración de ejecución vs latencia percibida, y los timeouts aparecen como `FunctionTimeoutException`. Soluciones por orden: optimizar arranque de la app, Flex Consumption con always-ready instances, plan Premium con pre-warmed, o rediseñar (trabajo largo → colas + Durable Functions, no HTTP síncrono).

### 📖 Respuesta detallada
**Escenario.** Una API HTTP en Functions Consumption (.NET isolated) muestra p50 de 120 ms pero p99 de 8 s, concentrado tras periodos de inactividad y en escalado durante picos; además, un endpoint de generación de informes falla esporádicamente con timeout a los 5 minutos.

**Diagnóstico paso a paso.**
1. **Confirmar cold starts:** en App Insights, `requests | summarize percentiles(duration, 50, 95, 99) by bin(timestamp, 5m)` cruzado con `traces | where message contains "Host started"` o con el conteo de instancias (`cloud_RoleInstance` nuevos): si las latencias extremas coinciden con instancias recién nacidas, es cold start. La dependencia interna también delata: la primera request de una instancia incluye conexiones nuevas a SQL/Key Vault (handshakes TLS, autenticación MI) visibles en `dependencies`.
2. **Medir qué parte del arranque pesa:** ¿runtime + plataforma (~1–3 s típicos) o la app (DI que construye 40 servicios, EF Core que compila el modelo, lectura síncrona de Key Vault al inicio)? Los logs de startup con timestamps lo desglosan.
3. **Timeouts:** `exceptions | where type contains "FunctionTimeout"`. Consumption: default 5 min, máximo 10 (functionTimeout en host.json). El endpoint de informes que tarda 6–12 min no cabe en el plan, y además un HTTP síncrono de minutos es frágil por diseño (el cliente, APIM y Front Door también tienen sus timeouts, generalmente menores).

**Soluciones.**
- **Optimizar el arranque:** recortar dependencias del startup (lazy donde sea posible), evitar I/O síncrona al arrancar (Key Vault references en app settings en lugar de leer el vault en el constructor), ReadyToRun/AOT para .NET, empaquetado ligero (deployment package pequeño; en Python/Node, menos dependencias = menos tiempo de import).
- **Plataforma:** **Flex Consumption** — escalado por instancias más rápido, VNet y *always-ready instances* (N instancias calientes por función crítica, pagadas aparte); o **Premium (EP1+)** con pre-warmed instances y sin límite práctico de duración. Regla de costos: Premium es un costo fijo (~150+ USD/mes por EP1) — si el tráfico es constante, compensa; si es esporádico pero sensible a latencia, Flex con 1 always-ready suele ser el óptimo.
- **Rediseño del trabajo largo:** el informe de 10 min no debe ser un request HTTP: patrón async request-reply — el endpoint encola (Service Bus/Storage Queue) y devuelve 202 con status URL; un worker (queue trigger, o Durable Functions con su `statusQueryGetUri` ya resuelto) procesa sin límite de interacción HTTP. En Durable, las activities largas se trocean y el estado sobrevive a reciclajes.
- **Detalles que agravan timeouts:** consumo de mensajes con lotes grandes y `maxConcurrentCalls` alto en instancias frías; conexiones SNAT agotadas hacia dependencias externas (usar NAT Gateway con VNet integration); y singleton locks mal usados que serializan invocaciones.

**Prevención.** SLO de latencia por percentil separando frío/caliente; availability test sintético que mantiene tráfico mínimo (mitigación parcial y barata del idle en Consumption clásico); presupuesto de startup como métrica de build (si una release sube el arranque de 2 a 6 s, se ve en el pipeline, no en producción); y elegir el plan por requisitos: Consumption para glue tolerante a latencia, Flex/Premium para APIs de cara al usuario, y contenedores (ACA) cuando la carga es sostenida y el modelo FaaS ya no aporta.

## 13. [CASO] El costo de Cosmos DB y Log Analytics se disparó
**Categoría:** FinOps / costos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Cost Management (análisis por recurso/meter diario) identifica cuál de los dos y desde cuándo. En Cosmos, los sospechosos: RU/s provisionadas de más (o autoscale con máximos generosos multiplicado por contenedores), queries cross-partition, indexación total con documentos grandes y regiones añadidas. En Log Analytics: ingestión — casi siempre logs de nivel Information/Debug en producción, Container Insights sin filtrar, o diagnósticos verbosos; se ve con `Usage` por DataType y se ataca con sampling, niveles de log, Basic Logs, DCR transformations y commitment tiers.

### 📖 Respuesta detallada
**Escenario.** La factura mensual sube un 60%. Cost Management → Cost analysis, agrupado por servicio y día: Cosmos pasó de 2.000 a 3.500 USD y Log Analytics de 800 a 2.600, con el salto el día 14 — que coincide con una release.

**Diagnóstico Cosmos.**
1. **¿Provisionado o consumido?** Cosmos factura por RU/s *provisionadas* (o pico por hora en autoscale), no usadas. Métrica `Provisioned Throughput` vs `Normalized RU Consumption`: si hay 100.000 RU/s provisionadas con consumo normalizado del 15%, el problema es sobreaprovisionamiento — frecuente tras un incidente de 429 en el que alguien subió "por si acaso" y nadie bajó.
2. **Autoscale multiplicador:** autoscale factura el máximo alcanzado en cada hora a 1,5×; muchos contenedores con max alto que pican una vez por hora suman. Considerar shared throughput a nivel de database para contenedores pequeños (con el límite de 25 contenedores que comparten).
3. **Consumo real caro:** `CDBQueryRuntimeStatistics`/`CDBPartitionKeyRUConsumption` para el top de operaciones por RU. Sospechosos: una query nueva cross-partition en el hot path (la release del día 14), indexing policy por defecto con documentos que crecieron, y el change feed re-leído por un consumidor con bug de checkpoint.
4. **Regiones y backup:** cada región réplica multiplica el costo de throughput y storage; continuous backup (PITR) cobra aparte.

**Diagnóstico Log Analytics.**
1. **Qué ingiere:** `Usage | where TimeGenerated > ago(31d) | summarize IngestedGB = sum(Quantity)/1000 by DataType | order by IngestedGB desc`. Top habituales: `AppTraces`/`traces` (logs de aplicación), `ContainerLogV2` (stdout de todos los pods), `AppDependencies` (una fila por llamada HTTP/SQL — servicios chatty generan millones), y diagnósticos de plataforma verbosos (Azure Firewall, AppGW access logs).
2. **Quién:** `AppTraces | summarize count() by AppRoleName, SeverityLevel` — el clásico: la release activó `LogLevel: Information` (o un logger en un loop) en un servicio de alto tráfico.

**Solución y prevención.**
- **Cosmos:** right-size de RU/s con datos de 2 semanas; autoscale solo donde el patrón es picudo; indexing policy explícita (excluir `/*`, incluir rutas usadas — abarata cada escritura); arreglar la query del hot path; y revisar TTL de datos (documentos que ya nadie lee pagando storage y RU de indexación). Reserved capacity (1–3 años) para la base estable: 20–65% de descuento.
- **Log Analytics:** niveles de log a Warning en producción (Information bajo feature flag para diagnóstico puntual); sampling de App Insights coherente (10% recorta ~90% de `AppDependencies`); **DCR transformations** para filtrar/proyectar en la ingestión (quitar columnas gordas, excluir namespaces ruidosos de ContainerLogV2); **Basic Logs** (~10× más barato de ingerir, con KQL limitado y retención corta) para logs de auditoría de alto volumen y baja consulta; commitment tiers (100 GB/día ≈ 15–30% de descuento); daily cap como airbag con alerta; y retención: interactiva corta + archive para compliance.
- **Gobernanza:** budget con alerta al 80% por resource group, anomaly detection de Cost Management, revisión de costos en el ritual mensual del equipo, y policy de tagging para imputar. La lección organizativa del caso: el costo se movió por una release — el costo es un output del sistema y se testea como el rendimiento: presupuesto de ingestión por servicio y alerta de desviación, no descubrimiento en la factura 30 días después.

## 14. [CASO] Throttling de Entra ID en la autenticación entre servicios
**Categoría:** Identidad · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Errores 429/AADSTS90056-style intermitentes al pedir tokens bajo carga delatan un antipatrón: pedir un token por request en lugar de cachearlos. Los tokens de Entra duran ~60–90 min y MSAL/Azure.Identity los cachean en memoria automáticamente — si cada instancia (o cada request) crea su propio `ConfidentialClientApplication`/credential, el caché no se comparte y el volumen hacia el endpoint de token explota. Diagnóstico: dependencias hacia login.microsoftonline.com en App Insights. Solución: credenciales singleton, caché distribuida donde aplique, Managed Identity (IMDS cachea), y backoff respetando Retry-After.

### 📖 Respuesta detallada
**Escenario.** Durante los picos, varios microservicios fallan con `MsalServiceException` / HTTP 429 al adquirir tokens client-credentials para llamarse entre sí (scopes de APIs protegidas) y para acceder a recursos. El pico coincide con un escalado de 10 a 60 pods.

**Diagnóstico paso a paso.**
1. **Cuantificar las peticiones de token:** en App Insights, `dependencies | where target contains "login.microsoftonline.com" | summarize count() by cloud_RoleName, bin(timestamp, 1m)`. Un servicio sano pide un token por scope por instancia por ~hora; si ves miles por minuto, hay token-per-request.
2. **Buscar la causa en el código:** los patrones culpables — crear `ConfidentialClientApplication` (o `ClientSecretCredential`) dentro del handler/por request (cada instancia nueva = caché vacío = round-trip a Entra); deshabilitar el caché; pedir scopes distintos innecesariamente (el caché es por scope/tenant/cliente); o un retry loop que martillea tras el primer 429 sin backoff (amplificación: el throttling genera más peticiones que generan más throttling).
3. **Confirmar el multiplicador del escalado:** 60 pods × N scopes × arranque simultáneo produce una estampida de tokens en cada scale-out o rollout (thundering herd), que es exactamente cuando el sistema está más frágil.
4. **Revisar límites:** Entra aplica throttling por aplicación, por tenant y global (los umbrales exactos no son públicos y varían); los 429 llevan `Retry-After`. El Microsoft Entra sign-in log (ServicePrincipalSignInLogs) permite auditar el volumen por service principal.

**Solución.**
- **Singleton y caché:** una única instancia de credential/CCA por proceso (inyectada como singleton en DI); MSAL y `TokenCredential` de Azure.Identity cachean y renuevan proactivamente. Con eso, N pods piden N tokens por hora, no N×RPS.
- **Managed Identity donde sea posible:** el endpoint IMDS local cachea tokens (~24 h de vigencia para MI) y elimina el secreto; para service-to-service dentro del clúster, evaluar si de verdad hace falta un token de Entra por llamada o si el perímetro (mTLS de mesh/Dapr + validación en el borde con APIM) cubre el requisito con tokens solo en los bordes.
- **Backoff con Retry-After:** los SDKs modernos lo respetan; los HttpClient artesanales, no — arreglarlo y añadir jitter para des-sincronizar la estampida de arranque.
- **Repartir el arranque:** maxSurge moderado en rollouts y arranque escalonado reducen el pico sincronizado.

**Prevención.** Test de carga que incluya el flujo de autenticación (los tests que reutilizan un token pre-generado esconden este problema por diseño); alerta sobre la tasa de dependencias hacia login.microsoftonline.com por servicio (una subida de 10× es un bug, no un pico de negocio); revisión de arquitectura de identidad: un app registration por servicio (el throttling por app aísla el blast radius — con una app compartida, el servicio bugueado throttlea a todos); y en el postmortem, dejar la regla escrita: los tokens se cachean por diseño, adquirirlos es una operación de una vez por hora, no parte del hot path.

## 15. [CASO] Pérdida de mensajes en Event Hubs por mal checkpointing
**Categoría:** Streaming · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
"Perdimos eventos" en Event Hubs casi nunca es el broker: es el consumidor que hizo checkpoint de offsets que no había procesado (checkpoint antes de procesar, o batch checkpointeado con ítems fallidos), o eventos que expiraron por retención antes de ser leídos (consumer group parado más tiempo que la retención). Diagnóstico: comparar offsets de checkpoint (blobs) contra la marca de agua del hub, medir el lag por partición, y auditar el orden procesar→checkpoint en el código. Solución: checkpoint solo tras procesar, manejo de poison events con salida lateral, monitoring de lag y retención dimensionada al peor backlog.

### 📖 Respuesta detallada
**Escenario.** Finanzas reporta que faltan transacciones de un día concreto en el sistema derivado. El productor confirma envíos con éxito a Event Hubs; el consumidor (EventProcessorClient sobre AKS, checkpoints en Blob Storage) no muestra errores llamativos.

**Diagnóstico paso a paso.**
1. **Descartar al productor:** métricas del namespace `Incoming Messages` por hora del día afectado — si los eventos entraron, el problema es de consumo. De paso revisar si el productor usa particionado explícito y alguna partición recibió y otras no (partition key desbalanceada no pierde mensajes, pero orienta).
2. **Estado de los checkpoints:** los checkpoints viven como blobs (metadata offset/sequenceNumber por partición y consumer group). Compararlos con `LastEnqueuedSequenceNumber` de cada partición: (a) checkpoint *por delante* de lo procesado realmente = se saltaron eventos; (b) checkpoint muy *por detrás* + retención vencida = eventos expirados sin leer (retención Standard 1–7 días: un consumidor parado un fin de semana largo con retención de 1 día pierde datos silenciosamente).
3. **Auditar el código del consumidor — los tres bugs canónicos:**
   - **Checkpoint antes de procesar** (o en un `finally` que se ejecuta también en el fallo): el crash entre checkpoint y proceso pierde el evento para siempre, sin error en ningún log.
   - **Batch parcial:** se procesan 100 eventos, fallan 3, y se checkpointea el último offset del batch — los 3 fallidos desaparecen. Sin equivalente de DLQ nativo, los fallidos deben ir a una salida lateral explícita (cola/blob de poison events) antes del checkpoint.
   - **Rebalanceo mal manejado:** al escalar consumidores, las particiones cambian de dueño; si un procesador viejo sigue escribiendo checkpoints tras perder la partición (ownership no respetado, o dos deployments distintos compartiendo el mismo consumer group y storage container por error de configuración) se corrompen los offsets. Revisar en los logs los eventos de partition ownership.
4. **KQL/telemetría:** si el consumidor emite métricas de lag (sequenceNumber procesado vs last enqueued — el SDK lo expone en `LastEnqueuedEventProperties`), la gráfica del día muestra el hueco; si no las emite, este incidente es la razón para añadirlas.

**Solución.** Corregir el orden (procesar → efecto durable confirmado → checkpoint), checkpoint por intervalos (cada N eventos o T segundos, balanceando costo de re-proceso vs escrituras a storage), salida lateral de poison events con alerta, e idempotencia aguas abajo (tras el fix, el re-proceso desde el último checkpoint válido re-entregará miles de eventos — sin idempotencia, el fix crea un incidente de duplicados). Para el hueco ya perdido: reprocesar desde el productor o desde una fuente de verdad (si los eventos venían de una base, re-emitir con un backfill job); si la retención aún cubre el rango, reiniciar el consumer group a un offset/timestamp anterior (`EventPosition.FromEnqueuedTime`).

**Prevención.** Alerta de lag por partición y consumer group (el lag creciente es el humo antes del fuego de la retención); alerta de "checkpoint sin avance" (consumidor zombie); retención dimensionada al peor backlog imaginable + margen (subir de 1 a 7 días cuesta poco frente al valor de los datos; Premium/Dedicated llega a 90); tests de caos del consumidor (matar el pod a mitad de batch y verificar que no se pierde ni se duplica sin control); y separación estricta de consumer groups y storage containers por aplicación y entorno, con naming convention que haga imposible el cruce.

## 16. [CASO] Incidente por expiración de secretos/certificados en Key Vault
**Categoría:** Seguridad / operación · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Un certificado o client secret expirado tumba la autenticación de golpe (401/403 o fallos TLS) y suele descubrirse en producción a las 00:00 UTC del día de expiración. Respuesta inmediata: identificar el objeto expirado (App Insights + Key Vault AuditEvent), emitir/rotar y propagar teniendo en cuenta los cachés (Key Vault references ~24 h, pods que necesitan reinicio). Prevención sistémica: eventos de near-expiry de Event Grid hacia rotación automatizada o al menos alertas con dueño, doble credencial activa para rotación sin downtime, y eliminar secretos expirables donde se pueda (Managed Identity, federación OIDC).

### 📖 Respuesta detallada
**Escenario.** A las 02:00, todos los requests del servicio de pagos hacia un PSP externo fallan; a la vez, otro equipo reporta 401 de su API interna. Causa compartida: un certificado mTLS y un client secret de Entra creados el mismo día hace 2 años, expirados a la vez.

**Diagnóstico paso a paso.**
1. **Confirmar la causa exacta:** en App Insights, `dependencies | where success == false` — un fallo TLS handshake (certificado) se ve distinto de un 401 con cuerpo `invalid_client` / `AADSTS7000222` (secret expirado). En Key Vault, los diagnósticos `AuditEvent` muestran qué versión del secreto/certificado leen las apps y desde cuándo.
2. **Mapear el blast radius:** ¿qué servicios usan el mismo objeto? (Aquí duele no tener inventario: la query de AuditEvent por objectName da los callers reales de los últimos días.)
3. **Ojo a los cachés al remediar:** rotar el secreto en el vault **no** repara nada hasta que los consumidores lo recargan: las Key Vault references de App Service/Functions refrescan ~cada 24 h (forzar con restart o tocando el app setting), el CSI driver de AKS según su intervalo de polling (y la app debe releer el archivo o reiniciarse), y los SDK cachean en memoria. El paso "reiniciar consumidores en orden" va en el runbook.

**Remediación del incidente.** Emitir el certificado nuevo / crear el secret nuevo en Entra (los app registrations permiten **dos secrets/certificados simultáneos** — clave para el futuro), publicarlo como nueva versión en Key Vault (nunca borrar la versión vieja durante la transición), reiniciar/refrescar consumidores, verificar con un canario, y solo después retirar la credencial vieja.

**Prevención sistémica — lo que de verdad evalúa la pregunta:**
- **Visibilidad:** Key Vault emite a Event Grid `SecretNearExpiry` / `CertificateNearExpiry` (~30 días antes). Mínimo viable: Event Grid → Function/Logic App → ticket con dueño asignado y SLA. Complemento: un job semanal que lista todos los objetos con `expires < 45d` en todos los vaults (Azure Resource Graph + data plane) y lo publica en un dashboard — los objetos creados sin política de notificación también cuentan.
- **Rotación automatizada:** para certificados con CA integrada (DigiCert/GlobalSign) Key Vault renueva solo según la política de emisión; para secretos de sistemas propios, el patrón Event Grid → Function que crea la nueva credencial en el origen y versiona el secreto. Rotar debe ser un no-evento mensual, no una ceremonia anual.
- **Doble credencial:** todo consumidor debe tolerar la rotación: dos secrets activos en Entra, dos API keys válidas en el tercero (si lo soporta), y el consumidor leyendo "latest" del vault con refresco. Así la rotación es: añadir nueva → propagar → retirar vieja, sin ventana de fallo.
- **Eliminar la clase de problema:** cada secret expirable que se sustituye por Managed Identity o Workload Identity Federation (OIDC para CI/CD y AKS) es un incidente futuro que desaparece. La métrica de madurez: número de credenciales con expiración gestionadas a mano, tendiendo a cero.
- **Higiene organizativa:** no crear credenciales "el mismo día para todo" (expiran juntas — el multi-incidente del escenario), caducidades escalonadas, dueño explícito por credencial, y game day anual de rotación de la credencial más crítica.

## 17. [CASO] Migración de on-premise a Azure: evaluación y estrategia
**Categoría:** Migración / arquitectura · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Primero descubrimiento y evaluación (Azure Migrate: inventario, dependencias, sizing y costo estimado), luego clasificación por las R: retire, retain, rehost (lift-and-shift a VMs), replatform (a PaaS: App Service, SQL MI), refactor/rearchitect (contenedores, microservicios), y priorización por valor/riesgo — nunca big bang. Las bases de datos se evalúan con Database Migration Assessment y se migran con DMS con CDC para cutover corto. El error clásico: rehost de todo sin plan de modernización posterior — pagas la nube como si fuera un datacenter caro.

### 📖 Respuesta detallada
**Escenario.** Empresa con ~120 VMs on-premises (apps .NET Framework y Java, SQL Server 2016, un ERP de terceros, file shares) quiere salir del datacenter en 12 meses por fin de contrato. Te piden el plan.

**Fase 1 — Descubrimiento y evaluación (semanas 1–6).**
- **Azure Migrate** con appliance de descubrimiento: inventario de VMs, uso real de CPU/RAM/disco (clave para right-size: los servidores on-prem suelen estar al 15% — mapear specs nominales a la nube duplica el costo), y **dependency analysis** (qué habla con qué): sin el mapa de dependencias, mover la app A sin su servicio B da latencia app-a-datacenter que mata el rendimiento en la fase híbrida.
- **Datos:** SQL assessment (Azure Migrate/Data Migration Assistant) detecta incompatibilidades y recomienda destino: Azure SQL Database (menos compatible: sin cross-db queries, SQL Agent limitado), **SQL Managed Instance** (compatibilidad casi total — el destino por defecto para SQL Server legado) o SQL en VM (último recurso, para SSRS/features exóticas).
- **Clasificación por las R:** *Retire* (5–20% típico: servidores que nadie usa — la ganancia más barata), *Retain* (el ERP del vendor sin soporte cloud, latencia crítica local), *Rehost* (lift-and-shift), *Replatform* (web apps .NET → App Service; SQL → MI; jobs → Functions/Container Apps Jobs), *Refactor/Rearchitect* (el core de negocio con roadmap activo → contenedores/microservicios), *Repurchase* (mover a SaaS). Criterio senior: replatform como default cuando el esfuerzo es moderado — el rehost puro traslada el problema y el costo; el refactor total de todo no cabe en 12 meses.

**Fase 2 — Fundaciones (paralelo, semanas 2–8).** Landing zone antes que la primera VM: management groups y policies, hub-spoke o Virtual WAN, ExpressRoute/VPN para la fase híbrida, identidad (Entra Connect para sincronizar AD, y plan para los servidores con dependencia de AD clásico: Entra Domain Services o DCs en Azure), Log Analytics, y la seguridad base (Defender for Cloud, Key Vault, bastion en lugar de RDP expuesto).

**Fase 3 — Oleadas de migración.** Priorizar: primera oleada de bajo riesgo y alto aprendizaje (apps internas sin picos), después por grupos de dependencia (una app y sus servicios se mueven juntos o sufren la latencia híbrida). Por carga: VMs con Azure Migrate (replicación y cutover ensayado con test failover); SQL con **Database Migration Service** en modo online (CDC: réplica continua y cutover de minutos) — el backup/restore con downtime de horas solo para lo tolerante; file shares a Azure Files con File Sync. Cada oleada con: ventana acordada, plan de rollback, criterios de éxito medibles (latencia comparada con baseline pre-migración — sin baseline no puedes distinguir "la nube va lenta" de "siempre fue así") y periodo de hypercare.

**Errores que separan al senior:** subestimar la fase híbrida (meses con la mitad de las apps a cada lado del ExpressRoute — el análisis de dependencias decide qué puede convivir); olvidar licenciamiento (Azure Hybrid Benefit para Windows/SQL ahorra hasta 40–55%; y las licencias del vendor que no permiten cloud); no reservar capacidad de equipo para operar lo migrado (la nube no se opera sola); migrar los backups como pensamiento tardío (Azure Backup y DR con ASR se diseñan en la landing zone); y el antipatrón estrella: declarar victoria tras el rehost — sin la fase 4 de modernización con presupuesto y fechas, las VMs lift-and-shift se quedan una década pagando 24/7 lo que era un servidor amortizado.

## 18. [CASO] Degradación tras un failover de región
**Categoría:** Resiliencia / DR · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
El failover "funcionó" — el tráfico llegó a la región secundaria — pero la aplicación va degradada: latencias altas, errores intermitentes, colas creciendo. Las causas típicas: dependencias que siguen apuntando a la primaria (connection strings hardcodeadas, DNS cacheado), capacidad insuficiente en la secundaria (réplicas mínimas, cold caches), datos incompletos (RPO asíncrono: se perdieron los últimos segundos/minutos) y cross-region latency de servicios que no hicieron failover juntos. El diagnóstico va por capas con Application Map y KQL; la lección estructural: el failover se ensaya completo, con carga, y por grupos de dependencia.

### 📖 Respuesta detallada
**Escenario.** Cae West Europe; Front Door conmuta a North Europe en un minuto. Pero: p95 pasa de 200 ms a 2,5 s, un 8% de errores 500, y el equipo de pedidos reporta "faltan los últimos pedidos de antes de la caída".

**Diagnóstico paso a paso.**
1. **Application Map en la secundaria:** identifica las aristas rojas/lentas. Patrón revelador: si una dependencia muestra latencias de ~20–25 ms extra constantes por llamada, alguien está cruzando regiones — un servicio en North Europe llamando a un recurso que sigue en West Europe (o su endpoint aún resuelve allí). Con `dependencies | summarize percentile(duration,95) by target, cloud_RoleName` se localiza el cruce en minutos. Causas: connection string con el endpoint regional explícito en lugar del listener del failover group de SQL, un Redis que no existe en la secundaria, DNS con TTL largo aún apuntando a la primaria, o el Service Bus alias que alguien no conmutó (el geo-DR de Service Bus requiere iniciar el failover del alias — no es automático).
2. **Errores:** `requests | where success == false | summarize count() by resultCode, cloud_RoleName`. Los 500 con excepciones de autorización delatan identidades/roles no replicados (la managed identity de la secundaria sin las asignaciones RBAC que alguien creó a mano en la primaria); los timeouts delatan la dependencia cruzada o capacidad.
3. **Capacidad:** la secundaria corría en warm standby con réplicas mínimas; el autoscaler está escalando pero: ¿hay cuota de vCPUs en la región? ¿stock de la SKU? Los eventos de `cluster-autoscaler` y el Activity Log (errores de allocation) lo dicen. Además, **cold caches**: Redis vacío y connection pools nuevos amplifican la carga sobre la base de datos justo en el peor momento — la degradación inicial es parcialmente inherente y debe estar en el runbook como esperada, con precalentamiento si es crítico.
4. **Datos (RPO):** los "pedidos perdidos" son la replicación asíncrona: SQL failover group forzado con pérdida de los últimos segundos, o Cosmos en single-region write con lag. Cuantificar la ventana (última transacción replicada vs hora de la caída), y activar el proceso de reconciliación: contra los eventos de Service Bus/Event Hubs si sobrevivieron, contra el sistema de pagos externo, o marcando el rango horario para revisión manual. Prometer RPO=0 con réplicas asíncronas era el error original de expectativas.

**Solución inmediata:** corregir los endpoints cruzados (por eso las connection strings deben ser configuración por entorno/región, no literales), conmutar los alias pendientes, pedir quota increase de emergencia si bloquea el escalado, y comunicar el estado de los datos (qué ventana se perdió y cómo se reconcilia) — la gestión del incidente es también gestión de la verdad sobre los datos.

**Prevención — donde se gana la pregunta:**
- **Game days con carga real:** el failover de este escenario "se había probado", pero sin tráfico y sin verificar los datos. El ensayo válido conmuta producción (o un entorno idéntico con carga sintética representativa), mide contra RTO/RPO objetivo y incluye el failback.
- **Paridad por diseño:** IaC única para ambas regiones (la deriva manual es la fuente de las identidades/roles que faltan), GitOps que reconstruye AKS desde el repo, y verificación continua de paridad (un job que compara recursos/roles/configuración entre regiones y alerta la deriva).
- **Failover por grupos de dependencia:** una app y sus datos/colas/cachés conmutan juntos; documentar el orden (datos → mensajería → cómputo → tráfico) en un runbook ejecutable (Automation/pipelines), no en una wiki.
- **Capacidad garantizada:** on-demand capacity reservations o activo-activo real para lo crítico; los picos de failover masivo regional son exactamente cuando la capacidad on-demand escasea.
- **Métricas de DR como SLO:** RTO/RPO medidos en cada ensayo, reportados a negocio, y presupuesto de reconciliación de datos definido antes del incidente (quién decide qué hacer con la ventana perdida y con qué herramienta).
