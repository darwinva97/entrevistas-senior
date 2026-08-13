# Microservicios en AWS — Entrevistas Senior

Preguntas sobre diseño, comunicación, resiliencia y operación de microservicios sobre servicios AWS.

---

## 1. Arquitectura de referencia de microservicios en AWS
**Categoría:** Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una referencia sólida: frontera con CloudFront + WAF + API Gateway (o ALB), servicios en ECS Fargate o EKS en subnets privadas, comunicación síncrona vía ALB interno/Service Connect y asíncrona vía EventBridge/SNS→SQS, datos con database-per-service (Aurora/DynamoDB según patrón de acceso), secretos en Secrets Manager, observabilidad con CloudWatch + X-Ray/ADOT, y todo desplegado por IaC con pipelines por servicio. La clave senior es qué comunicación es síncrona y cuál asíncrona, y cómo se aísla el blast radius.

### 📖 Respuesta detallada
**Frontera (edge)**: CloudFront para TLS, caching y absorción de picos; **AWS WAF** con managed rules (SQLi, XSS, bots, rate limiting por IP); API Gateway cuando necesitas gestión de API (auth, throttling por cliente, usage plans) o ALB directo cuando el volumen hace prohibitivo el pricing por request. Autenticación en el borde: Cognito o un IdP externo (Auth0/Okta) emitiendo JWTs validados por el gateway (JWT authorizer) para que los servicios internos reciban identidad ya verificada y solo autoricen a nivel de dominio.

**Cómputo**: cada microservicio como servicio ECS Fargate (o deployment en EKS) en subnets privadas, 3 AZs, auto scaling por CPU/memoria/RPS por target (target tracking sobre `ALBRequestCountPerTarget` suele funcionar mejor que CPU). Un ALB interno compartido con reglas por host/path, o ECS Service Connect para tráfico este-oeste con nombres lógicos. Task roles IAM **por servicio** con least privilege: el aislamiento de permisos es parte del diseño de microservicios, no un extra.

**Comunicación**: la decisión central. Síncrona (REST/gRPC vía ALB interno) solo cuando la respuesta se necesita en el request path, con timeouts cortos, retries acotados con jitter y circuit breakers. Todo lo demás asíncrono: eventos de dominio en **EventBridge** (bus central, reglas por consumidor, multi-cuenta si cada dominio tiene su cuenta) aterrizando en **SQS por consumidor** (buffer, retries, DLQ). Esto corta las cadenas de fallos en cascada, el mayor riesgo sistémico de los microservicios.

**Datos**: database-per-service estricto — nada de compartir esquemas. Aurora PostgreSQL para dominios relacionales/transaccionales; DynamoDB para patrones clave-valor de alta escala; consistencia entre servicios por eventos (outbox + eventual consistency), nunca por transacciones distribuidas. Cachés (ElastiCache/DAX) por servicio, no compartidas.

**Transversales**: Secrets Manager con rotación; configuración en Parameter Store/AppConfig (feature flags con rollout gradual); observabilidad con logs estructurados JSON a CloudWatch, trazas X-Ray/ADOT con propagación de contexto, métricas RED por servicio y dashboards + alarmas por SLO; CI/CD por servicio (un pipeline por repo/servicio, despliegue independiente — si dos servicios deben desplegarse juntos, son un monolito distribuido).

**Organización multi-cuenta**: cuentas separadas por entorno como mínimo; en organizaciones grandes, por dominio, unidas por Transit Gateway/VPC Lattice y un bus de eventos compartido. Errores comunes que señalo: microservicios que se llaman síncronamente en cadena de 5 saltos (latencia y disponibilidad multiplicativas: cinco servicios al 99.9% en serie dan 99.5%), datos compartidos "temporalmente", y empezar con 30 microservicios en un equipo de 6 personas — el número de servicios debe seguir a los límites de dominio y de equipo (ley de Conway), no a la moda.

---

## 2. Service discovery con Cloud Map y alternativas
**Categoría:** Networking / Integración · **Tipo:** Conceptual

### 📝 Respuesta resumen
Cloud Map es el registro de servicios de AWS: namespaces con descubrimiento por DNS (registros A/SRV en Route 53 privado) o por API, con health checks e integración nativa con ECS (service discovery y Service Connect la usan por debajo). Las alternativas prácticas: ALB interno con reglas (simple y con L7), ECS Service Connect (proxy con métricas y retries), y en EKS el DNS propio de Kubernetes. La elección depende de si necesitas balanceo L7, resiliencia integrada o solo resolución de nombres.

### 📖 Respuesta detallada
**El problema**: en microservicios con tasks/pods efímeros y auto scaling, las IPs cambian constantemente; los servicios necesitan encontrar instancias sanas de sus dependencias sin hardcodear endpoints.

**Cloud Map**: registras un namespace (p. ej. `interno.local`) y servicios con instancias (IP+puerto y atributos custom). Dos modos de descubrimiento: **DNS** (registros A o SRV en una hosted zone privada de Route 53 — cualquier cliente resuelve `pagos.interno.local`) y **API** (`DiscoverInstances`, que permite filtrar por atributos como versión o AZ y no sufre el caching de DNS). Con ECS, el "service discovery" clásico registra/desregistra tasks automáticamente al arrancar/morir. Costo bajo: ~$0.10/mes por instancia registrada más consultas. Limitaciones del modo DNS: TTLs y caching del cliente (una task muerta puede seguir resolviéndose segundos; los clientes con connection pools persistentes tardan en enterarse), balanceo solo round-robin/aleatorio sin pesos por carga, y sin retries ni circuit breaking — la resiliencia queda en el cliente.

**ECS Service Connect** (la opción moderna en ECS): agrega un sidecar proxy (Envoy gestionado, transparente) que da nombres lógicos (`http://pagos`), balanceo consciente de salud, **retries automáticos, timeouts y outlier detection**, y métricas de tráfico por servicio en CloudWatch sin instrumentar la app. Es Cloud Map + data plane gestionado, y hoy es mi default para tráfico este-oeste en ECS frente al service discovery DNS puro.

**ALB interno**: registro implícito vía target groups (ECS/EKS registran targets automáticamente). Aporta L7 real (routing por path/host, pesos para canary, health checks activos con drenaje), a costa de un hop extra, ~$16/mes + LCUs, y de multiplicar target groups en organizaciones grandes. Para pocos servicios con tráfico REST, "un ALB interno con reglas por host" es la solución más simple y robusta.

**En EKS**: el discovery nativo es CoreDNS + Services de Kubernetes (ClusterIP) — suficiente casi siempre; ExternalDNS publica hacia Route 53 para consumidores fuera del cluster, y el AWS Load Balancer Controller expone servicios vía ALB/NLB. Cloud Map aparece si hay que descubrir servicios **entre** ECS, EKS, EC2 y Lambda de forma homogénea.

**Criterio**: solo resolución de nombres → Cloud Map DNS; tráfico este-oeste en ECS con resiliencia sin tocar código → Service Connect; necesidades L7 (canary, routing avanzado) → ALB interno o service mesh; abstracción total sobre computes heterogéneos y cross-account → VPC Lattice (siguiente pregunta). Error común: confiar en DNS con TTL 60 s y pools de conexiones keep-alive eternos — el cliente sigue enviando tráfico a IPs muertas; hay que limitar la vida de las conexiones o usar un data plane que haga health checking activo.

---

## 3. Service mesh en AWS: App Mesh vs VPC Lattice
**Categoría:** Networking / Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un service mesh saca del código la resiliencia (retries, timeouts, circuit breaking), el mTLS y la telemetría, moviéndolos a proxies. App Mesh (Envoy sidecar) fue la apuesta clásica de AWS y está **deprecado (EOL septiembre 2026)**; el reemplazo nativo es **VPC Lattice**, que hace networking de servicios a nivel de plataforma, sin sidecars, cross-VPC y cross-cuenta, con auth IAM por request. En EKS, la alternativa real es Istio/Linkerd o Cilium. La pregunta senior previa: ¿de verdad necesitas mesh, o te basta ALB/Service Connect?

### 📖 Respuesta detallada
**Qué resuelve un mesh**: en decenas de servicios políglotas, implementar en cada uno mTLS, retries con budgets, timeouts coherentes, circuit breaking, telemetría uniforme y control de tráfico (canary por porcentaje, mirroring) es inviable como código de aplicación. El mesh lo uniformiza en la capa de red con un data plane (proxies) y un control plane (configuración).

**App Mesh**: control plane gestionado para sidecars Envoy en ECS/EKS/EC2 (virtual nodes, virtual routers, rutas con pesos). AWS anunció su **fin de vida para el 30 de septiembre de 2026**: no aceptar nuevos diseños sobre él; los existentes deben migrar (a VPC Lattice, Service Connect o Istio). Sus problemas eran los de todo sidecar (consumo por task, complejidad operativa, versionado de Envoy) sin la riqueza de features de Istio.

**VPC Lattice**: reimaginación sin sidecars — la red de AWS es el data plane. Defines un **service network** al que se asocian VPCs y servicios (targets: instancias, IPs, Lambdas, ALBs, y clusters EKS/ECS); Lattice da un DNS por servicio, enrutamiento L7 (HTTP/HTTPS/gRPC, pesos por target group), health checks, y —su feature diferencial— **autenticación y autorización IAM por request** (auth policies estilo resource policy sobre el servicio: "el rol del servicio A puede llamar POST /pagos del servicio B"), con conectividad **cross-VPC y cross-account sin peering ni TGW y tolerante a CIDRs solapados**. Trade-offs: costo por servicio-hora (~$0.025/h ≈ $18/mes por servicio) más $0.025/GB procesado y por request, latencia extra de un hop gestionado, y menos features que Istio (sin mirroring ni fault injection nativos). Encaja como "malla de plataforma" para organizaciones multi-cuenta que quieren gobernanza y auth uniformes sin operar Envoy.

**Istio/Linkerd/Cilium en EKS**: cuando se necesita el catálogo completo (traffic mirroring, fault injection, retries por ruta con budgets, authz L7 fina, ambient mesh sin sidecars en Istio). Costo: operarlo tú, upgrades delicados, y en organizaciones sin plataforma dedicada suele acabar mal.

**Mi posición en entrevista**: el mesh es la última milla, no el punto de partida. Escalera de adopción: (1) ALB interno + retries en SDK bien configurados; (2) ECS Service Connect / VPC Lattice para resiliencia y auth gestionadas; (3) Istio solo con equipo de plataforma y requisitos concretos (mTLS obligatorio por compliance, canary sofisticado, authz L7). Adoptar mesh "porque es lo moderno" añade un sistema distribuido más a operar encima del que ya tienes.

---

## 4. API Gateway + Lambda vs contenedores para APIs
**Categoría:** Cómputo / Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
API Gateway + Lambda brilla con tráfico irregular o bajo, time-to-market, y equipos pequeños: cero gestión de servidores, escalado instantáneo y pago por uso. Contenedores (ECS/EKS + ALB) ganan con tráfico alto y sostenido (costo por request mucho menor), latencias p99 estrictas (sin cold starts), ejecuciones largas, WebSockets/streaming pesado o dependencias del runtime. El punto de cruce económico suele estar en decenas de millones de requests/mes con uso sostenido; muchas organizaciones acaban en un modelo híbrido.

### 📖 Respuesta detallada
**Economía**: Lambda cobra por request ($0.20/M) y GB-s (~$0.0000167); API Gateway HTTP API $1.00/M. Una API con 1M requests/mes de 100 ms a 512 MB cuesta centavos: imbatible. Pero a 500 RPS sostenidos (≈1,300M requests/mes), solo API Gateway son ~$1,300/mes y Lambda otros ~$1,100 (100 ms/512 MB), mientras un servicio en Fargate con 4-6 tasks detrás de un ALB hace lo mismo por ~$200-350/mes. Regla mental: Lambda cobra por uso con prima; los contenedores cobran por capacidad. Con utilización alta y estable, la capacidad gana; con valles profundos y picos, el pago por uso gana porque no pagas el valle.

**Latencia**: Lambda añade cold starts (100 ms–1 s+ según runtime; ver pregunta 12) que golpean el p99, mitigables con provisioned concurrency (que reintroduce costo fijo y erosiona la ventaja económica). API Gateway añade ~10-30 ms por request. Un contenedor caliente detrás de ALB da p99 más predecibles. Para SLOs de p99 < 100 ms consistentes, contenedores.

**Restricciones técnicas de la vía serverless**: timeout de API Gateway 29 s (Lambda hasta 15 min, pero no detrás de API Gateway síncrono sin colas), payload 10 MB (API GW) / 6 MB (Lambda síncrono), conexiones a BD relacionales que exigen RDS Proxy, y streaming de respuesta limitado (Lambda response streaming ayuda, hasta 20 MB soft). WebSockets existen en API Gateway pero con modelo de programación propio. En contenedores nada de esto aplica: gRPC bidireccional, SSE, jobs largos, sidecar de lo que sea.

**Operación y organización**: Lambda elimina patching, AMIs y bin-packing, y su unidad de despliegue pequeña acelera equipos que hacen features event-driven. Pero cientos de Lambdas sin gobernanza degeneran en un monolito distribuido inobservable; los contenedores concentran el dominio en servicios más gruesos y trasladan bien código existente (frameworks estándar: Spring Boot, Express, FastAPI) sin reescritura. Lambda con frameworks web enteros dentro (adaptadores tipo "todo el monolito en una Lambda") funciona como puente, pero paga cold starts grandes.

**Mi framework**: (1) tráfico irregular, glue de eventos, APIs internas de bajo volumen, MVPs → API Gateway + Lambda. (2) APIs de negocio con tráfico sostenido, SLOs estrictos o equipos con código existente → contenedores tras ALB. (3) Híbrido frecuente: núcleo transaccional en ECS/EKS, periferia event-driven (webhooks, procesamiento de colas, cron) en Lambda — cada patrón de carga en el compute que lo sirve mejor. La respuesta "todo serverless" o "todo Kubernetes" sin analizar el perfil de tráfico y el costo por millón de requests es el red flag que un entrevistador senior busca.

---

## 5. Colas y DLQs: retries, backoff y poison messages
**Categoría:** Integración / Resiliencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
En SQS, un mensaje que falla vuelve a ser visible al expirar el visibility timeout; tras `maxReceiveCount` recepciones pasa a la DLQ. El diseño correcto: visibility timeout ≥ 6× el timeout de procesamiento (o extenderlo por heartbeat), maxReceiveCount 3-5, DLQ con alarma sobre `ApproximateNumberOfMessagesVisible` > 0, consumidores idempotentes, y distinción entre errores transitorios (reintentar con backoff) y permanentes (a DLQ directo, sin quemar reintentos). El redrive de la DLQ permite reprocesar tras corregir el bug.

### 📖 Respuesta detallada
**Mecánica**: SQS no borra mensajes al entregarlos: el consumidor los recibe, quedan invisibles durante el **visibility timeout** (default 30 s, máx 12 h) y el consumidor debe llamar `DeleteMessage` al terminar. Si falla o tarda de más, el mensaje reaparece — así se obtiene at-least-once. Cada reaparición incrementa `ApproximateReceiveCount`; cuando supera el **maxReceiveCount** de la redrive policy, SQS lo mueve a la **DLQ** (una cola normal designada). Detalle clave: el "retraso" entre reintentos de SQS es el propio visibility timeout — no hay backoff exponencial nativo; si necesitas backoff real por mensaje, el consumidor puede llamar `ChangeMessageVisibility` con un delay creciente en función del receive count antes de soltar el mensaje.

**Dimensionado**: visibility timeout ≥ 6× el tiempo máximo de procesamiento (recomendación AWS con consumidores Lambda: 6× el timeout de la función), o **heartbeat** extendiéndolo periódicamente en jobs largos. `maxReceiveCount`: 3-5 para cargas normales (1 esconde fallos transitorios en la DLQ; 100 martillea un poison message durante horas). La DLQ debe tener retención máxima (14 días) — es tu ventana para reaccionar antes de perder los mensajes.

**Poison messages**: mensajes que fallan siempre (payload malformado, bug del consumidor, entidad referenciada inexistente). Sin DLQ, un poison message rota indefinidamente consumiendo capacidad y, en FIFO, **bloquea todo su message group** (head-of-line blocking: nadie avanza detrás de él). Buena práctica: en el consumidor, capturar errores de validación/deserialización (no recuperables) y enviarlos directamente a una cola de rechazo o a la DLQ sin agotar reintentos, reservando el ciclo de retries para errores transitorios (timeouts, throttling, 5xx de dependencias).

**Operación de la DLQ**: alarma inmediata sobre mensajes visibles en DLQ (>0 durante 5 min = alguien mira); métrica de edad del mensaje más antiguo (`ApproximateAgeOfOldestMessage`) en la cola principal para detectar consumidores atascados; y **DLQ redrive** (nativo en consola/API) para devolver mensajes a la cola origen tras desplegar el fix, con velocidad controlada. Los mensajes en DLQ deben inspeccionarse (¿mismo error? ¿mismo tipo de payload?) — son un tesoro de debugging.

**Con Lambda como consumidor**: el event source mapping tiene sus propios controles: `maxReceiveCount` en la cola sigue mandando, pero además `ReportBatchItemFailures` permite fallar items individuales de un batch (sin él, un item malo hace reprocesar el batch entero, multiplicando duplicados); y para invocaciones asíncronas (SNS→Lambda) existen los "on-failure destinations" (mejores que la DLQ de Lambda clásica porque incluyen contexto del error).

**Idempotencia** transversal: como todo es at-least-once, cada consumidor debe tolerar duplicados — clave de idempotencia (messageId o clave de negocio) en DynamoDB con TTL y escritura condicional, o upserts naturales. Un consumidor no idempotente con retries es una fábrica de datos corruptos.

---

## 6. Exactly-once vs at-least-once en SQS y Kinesis
**Categoría:** Integración / Consistencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
En sistemas distribuidos el exactly-once de extremo a extremo no existe como garantía de transporte: SQS estándar y Kinesis entregan at-least-once, y SQS FIFO ofrece "exactly-once processing" que en realidad es deduplicación de publicación (5 minutos) más entrega ordenada — el consumidor puede seguir viendo duplicados si falla tras procesar y antes de borrar. La solución real es siempre la misma: efectos idempotentes en el consumidor, con claves de idempotencia y escrituras condicionales.

### 📖 Respuesta detallada
**Por qué no hay exactly-once de transporte**: el fallo puede ocurrir después de ejecutar el efecto y antes de confirmar (borrar el mensaje, avanzar el checkpoint). El sistema de mensajería no puede saber si el efecto se aplicó, así que debe reentregar (at-least-once) o arriesgarse a perder (at-most-once). "Exactly-once" solo se logra acoplando el procesamiento y la confirmación en una transacción (como hace Kafka con transacciones productor-consumidor dentro de su ecosistema) o haciendo el efecto **idempotente**, que es lo práctico en AWS.

**SQS Standard**: at-least-once, duplicados posibles incluso sin fallos del consumidor (la propia infraestructura puede reentregar), orden best-effort. **SQS FIFO**: (1) deduplicación en publicación por `MessageDeduplicationId` (o hash del contenido) en ventana de **5 minutos** — protege contra reintentos del productor, no contra duplicados de consumo; (2) orden estricto por `MessageGroupId`; (3) entrega "exactly-once processing" significa que mientras un batch está en vuelo no se entrega otra vez dentro del visibility timeout — pero si tu consumidor procesa y crashea antes del delete, lo verás de nuevo. Conclusión: FIFO reduce duplicados, no los elimina en el extremo consumidor.

**Kinesis**: cada consumidor mantiene un **checkpoint** por shard (KCL lo guarda en DynamoDB; Lambda lo gestiona el event source mapping). Si el proceso muere tras procesar N records y antes de checkpointear, el siguiente worker relee desde el último checkpoint: duplicados. Además, los **productores** generan duplicados con reintentos (el KPL con agregación puede duplicar records enteros). Kinesis no tiene deduplicación nativa: la guía oficial es incluir un ID único en cada record y deduplicar en destino.

**Implementación de idempotencia** (lo que espero que un senior detalle): (1) **clave de idempotencia**: messageId del transporte si el productor no reintenta con IDs nuevos, o mejor una clave de negocio determinista (`pago-{orderId}-{intento}`); (2) **registro condicional**: `PutItem` en DynamoDB con `attribute_not_exists(pk)` antes o junto al efecto — si falla la condición, es duplicado y se descarta (con TTL para limpiar, típicamente > ventana máxima de reentrega); (3) idealmente, efecto y registro **en la misma transacción** (transacción DynamoDB, o misma transacción SQL si el efecto es sobre RDS — la "transactional inbox"); si el efecto es externo (cobrar en Stripe), usar la idempotency key del proveedor. Librerías: AWS Lambda Powertools trae `idempotency` sobre DynamoDB listo para usar. (4) Alternativa: efectos naturalmente idempotentes (upsert con estado absoluto en vez de incrementos).

**Errores comunes**: confiar en la dedup de 5 min de FIFO como si cubriera el consumo; deduplicar en memoria del consumidor (se pierde al escalar o reiniciar); usar incrementos (`ADD 1`) en consumidores at-least-once; y checkpointear en Kinesis **antes** de procesar (convierte duplicados en pérdidas: at-most-once accidental). Cierro siempre con la regla: el transporte da at-least-once; exactly-once es una propiedad que construye el consumidor.

---

## 7. El patrón Saga con Step Functions
**Categoría:** Arquitectura / Consistencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una Saga descompone una transacción de negocio que cruza varios servicios en pasos locales, cada uno con una acción compensatoria que revierte su efecto si un paso posterior falla. Step Functions es el orquestador natural: cada paso es un Task con Retry, y los Catch encadenan las compensaciones en orden inverso. Frente a la coreografía por eventos, la orquestación da visibilidad del estado y compensaciones explícitas, a costa de acoplar el flujo a un componente central.

### 📖 Respuesta detallada
**El problema**: "reservar viaje" toca el servicio de vuelos, hoteles y pagos, cada uno con su base de datos. Sin transacciones distribuidas (2PC no existe de forma práctica entre microservicios y no escala), la consistencia se logra con una secuencia de **transacciones locales** + **compensaciones**: si el pago falla tras reservar vuelo y hotel, se cancelan ambas reservas. Importante: una compensación no es un rollback ACID — es una acción de negocio nueva (cancelar, reembolsar, liberar stock) que puede a su vez fallar y debe reintentarse hasta lograrse (por eso las compensaciones deben ser **idempotentes y de éxito eventual garantizado**, sin validaciones que puedan rechazarlas).

**Orquestación con Step Functions**: una máquina Standard modela el flujo: `ReservarVuelo → ReservarHotel → CobrarPago → Confirmar`. Cada Task lleva `Retry` para errores transitorios (backoff exponencial con jitter, distinguiendo por tipo de error) y `Catch` hacia la rama de compensación: si `CobrarPago` agota reintentos, el Catch dirige a `CancelarHotel → CancelarVuelo → MarcarFallida`. Ventajas concretas: el estado de cada saga es visible y auditable (la consola muestra en qué paso está cada ejecución — oro operativo), las compensaciones están en un solo lugar y el flujo se versiona como código. Los servicios se invocan vía Lambda, ECS `.sync`, o directamente con las integraciones SDK; para pasos con confirmación humana o asíncrona, `waitForTaskToken`. Timeouts por Task (`TimeoutSeconds`) son obligatorios: un paso colgado sin timeout congela la saga.

**Coreografía como alternativa**: cada servicio emite eventos (EventBridge) y los demás reaccionan; no hay coordinador. Escala organizativamente mejor (equipos desacoplados, añadir un consumidor no toca a nadie) pero el flujo global es implícito: nadie puede responder "¿dónde está la orden 123?" sin correlacionar eventos, y las compensaciones se dispersan. Mi criterio: **coreografía para propagación de hechos** (proyecciones, notificaciones, side-effects), **orquestación para procesos de negocio con compensaciones y SLA** (pagos, fulfillment, onboarding). Híbrido habitual: la saga orquestada emite eventos de dominio al completar hitos.

**Detalles de implementación senior**: semántica de aislamiento — las sagas no aíslan (otro proceso puede ver el hotel reservado antes de que la saga se confirme); se mitiga con estados de negocio explícitos (`PENDING`/`CONFIRMED`) y "semantic locks". Diseño de pasos: ordenar poniendo primero los pasos más propensos a fallar y los no compensables al final (cobrar antes de emitir el billete no reembolsable). Idempotencia en cada paso (la saga puede reintentar). Y observabilidad: correlacionar el `executionArn` con las trazas X-Ray y logs de los servicios participantes. Errores comunes: compensaciones que pueden fallar por validación (deben ser incondicionales), sagas Express (at-least-once re-ejecuta pasos: usar Standard para sagas), y payloads >256 KB entre pasos (claim-check en S3/DynamoDB).

---

## 8. El patrón Outbox con DynamoDB Streams (y CDC en general)
**Categoría:** Arquitectura / Consistencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
El problema del dual-write: guardar en la base de datos y publicar un evento son dos operaciones sin transacción común; si una falla, el sistema queda inconsistente. El patrón Outbox lo resuelve escribiendo el evento en la misma transacción que el dato (tabla outbox) y publicándolo después desde un proceso que lee el log de cambios. En DynamoDB es natural: escribes item de negocio + item outbox en una `TransactWriteItems`, y DynamoDB Streams + Lambda (o EventBridge Pipes) publica con at-least-once garantizado.

### 📖 Respuesta detallada
**El anti-patrón**: `saveOrder(); publishEvent();` — si el publish falla (o el proceso muere entre ambas), el pedido existe pero el evento no salió: los consumidores nunca se enteran. Al revés (publicar primero) es peor: anuncias algo que quizá no se persista. Retries ingenuos no arreglan la ventana de fallo; la única solución correcta es que **dato y evento se persistan atómicamente** y la publicación sea asíncrona y garantizada desde ahí.

**Outbox con DynamoDB**: en una **`TransactWriteItems`** (hasta 100 items, consume 2× capacidad) escribes el item de negocio y un item-evento (mismo table single-table o tabla outbox aparte). **DynamoDB Streams** captura todo cambio en orden por partition key con retención de 24 h, y un **event source mapping de Lambda** (o **EventBridge Pipes**, que además filtra y enriquece sin código) consume el stream y publica a EventBridge/SNS/Kafka. Garantías: at-least-once (el consumidor de eventos debe deduplicar), orden por clave de partición, y cero eventos perdidos porque el stream es el log de la propia base. Refinamientos: filtrar en el event source mapping (`eventName: INSERT` y prefijo de SK del evento) para no procesar todos los cambios; TTL en los items outbox para autolimpiarse (ojo: el borrado por TTL también aparece en el stream y hay que filtrarlo); y ante fallos de la Lambda, configurar `bisectBatchOnFunctionError`, retries acotados y destino on-failure para no bloquear el shard (un stream atascado 24 h pierde eventos).

**Variante simplificada**: si el único efecto es publicar el cambio de la entidad (sin "evento de dominio" elaborado), el propio stream de la tabla de negocio ya es el outbox — CDC puro. La tabla outbox explícita aporta control del **contrato**: publicas un evento de negocio versionado y estable, no la forma interna del item (que cambia con refactors). Para eventos de integración entre dominios, siempre outbox explícito con esquema versionado.

**Con bases relacionales**: mismo patrón con tabla `outbox` en la transacción SQL, y publicación vía (a) Debezium/DMS CDC leyendo el WAL/binlog hacia MSK o Kinesis — robusto, sin polling; o (b) un poller (transactional outbox relay) que lee filas pendientes con `SELECT ... FOR UPDATE SKIP LOCKED`, publica y marca — simple pero con latencia y carga de polling. Aurora también integra con Lambda, pero el estándar de industria es Debezium.

**Errores comunes**: creer que el problema no existe "porque SQS es fiable" (la ventana está entre tu commit y tu publish, no en el transporte); publicar dentro de la transacción (alarga la transacción y el broker caído tumba las escrituras de negocio); no versionar los eventos del outbox (acoplamiento estructural de todos los consumidores al esquema interno); y olvidar la deduplicación en consumidores (el relay reentrega). Este patrón, combinado con idempotencia en consumo, es la base de la consistencia eventual bien hecha entre microservicios.

---

## 9. Secrets Manager vs Parameter Store: gestión de secretos y configuración
**Categoría:** Seguridad / Configuración · **Tipo:** Conceptual

### 📝 Respuesta resumen
Parameter Store (SSM) es el almacén de configuración: parámetros estándar gratuitos (hasta 10,000, 4 KB), SecureString cifrado con KMS, jerarquías por path. Secrets Manager cuesta $0.40/secreto-mes pero añade rotación automática gestionada (integrada con RDS/Aurora/Redshift), replicación cross-región, políticas de recurso para cross-account y generación de secretos. Regla práctica: secretos con rotación o compartidos entre cuentas → Secrets Manager; configuración y secretos estáticos de bajo riesgo → Parameter Store. En ambos casos: caché en el cliente y nunca secretos en variables de entorno visibles.

### 📖 Respuesta detallada
**Parameter Store**: parámetros String/StringList/SecureString organizados por jerarquía (`/app/pagos/prod/db-url`), con `GetParametersByPath` para cargar toda la config de un servicio. Tier estándar: **gratis**, 4 KB, 10,000 parámetros; tier avanzado: $0.05/parámetro-mes, 8 KB, 100,000 parámetros y policies (expiración, notificación). SecureString cifra con KMS (la key que elijas: el acceso efectivo = permiso SSM + permiso KMS, doble control). Throughput: 40 TPS default, hasta 10,000 TPS activando higher throughput (con costo por llamada: $0.05/10,000 — el "gratis" desaparece a alto volumen sin caché).

**Secrets Manager**: $0.40/secreto-mes + $0.05/10,000 llamadas. Aporta: (1) **rotación automática** — para RDS/Aurora/DocumentDB/Redshift con rotación gestionada sin escribir código (multi-user rotation con dos usuarios alternantes para cero downtime), y para lo demás con una Lambda de rotación custom; (2) **resource policies** (compartir un secreto con otra cuenta sin duplicarlo); (3) **replicación cross-región** (DR: la región secundaria tiene el secreto sincronizado); (4) generación de contraseñas y binarios hasta 64 KB; (5) integraciones directas (ECS `secrets` en task definitions, RDS master password gestionado, CSI driver en EKS).

**Decisión**: credenciales de BD y API keys de terceros que deben rotar → Secrets Manager (la rotación automática es la feature que lo paga: una credencial que no rota es una fuga esperando fecha). Config no sensible, feature flags simples, endpoints, y secretos estáticos de bajo riesgo en proyectos con presupuesto mínimo → Parameter Store. Muchos equipos usan ambos: Secrets Manager para credenciales, Parameter Store para configuración (que además puede **referenciar** secretos de Secrets Manager vía `/aws/reference/secretsmanager/`).

**Patrones de consumo correctos**: (1) **cachear** en el proceso (AWS Parameters and Secrets Lambda Extension con TTL, o los caching clients oficiales): pedir el secreto en cada request dispara latencia y costo, y el límite de TPS; (2) inyectar en **arranque** vía integración de plataforma (ECS task definition `secrets:` — el agente lo inyecta como env var al crear la task; mejor que hornearlo en la imagen, aunque las env vars son visibles en `DescribeTasks`... para máxima higiene, leer en runtime desde el SDK); (3) en EKS, **Secrets Store CSI Driver** o External Secrets Operator sincronizando a Secrets de Kubernetes; (4) reaccionar a rotaciones: las conexiones con credenciales viejas fallarán — los clientes deben releer el secreto ante auth failure (o usar RDS Proxy/IAM database authentication que elimina contraseñas).

**Errores comunes**: secretos en variables de entorno de Lambda en texto plano visibles en la consola (cifradas at-rest, pero expuestas a cualquiera con `GetFunctionConfiguration`), secretos en el código o en imágenes Docker, un solo secreto gigante JSON compartido por 10 servicios (blast radius y rotación imposible), no borrar con ventana de recuperación (Secrets Manager retiene 7-30 días — bien — pero también permite `ForceDeleteWithoutRecovery`, cuidado), y olvidar la key policy de KMS en acceso cross-account (falla aunque la resource policy del secreto esté bien).

---

## 10. CI/CD en AWS: blue/green y canary con CodeDeploy
**Categoría:** DevOps / Despliegue · **Tipo:** Conceptual

### 📝 Respuesta resumen
Blue/green levanta la versión nueva en paralelo (green), cambia el tráfico de golpe o por etapas y permite rollback instantáneo devolviendo el tráfico a blue. Canary desplaza un porcentaje pequeño (p. ej. 10%) y monitoriza antes de completar. CodeDeploy implementa ambos en ECS (dos target groups del ALB), Lambda (alias con pesos) y EC2, con rollback automático disparado por alarmas de CloudWatch. La pieza que separa a un equipo senior no es el mecanismo sino las alarmas que definen "está mal" y la compatibilidad de esquemas entre versiones.

### 📖 Respuesta detallada
**Blue/green en ECS con CodeDeploy**: el service ECS se configura con deployment controller CODE_DEPLOY y dos target groups tras el ALB (más un listener de test opcional en otro puerto). CodeDeploy crea el task set green con la nueva task definition, opcionalmente ejecuta **hooks de validación** (Lambdas: `AfterAllowTestTraffic` para smoke tests contra el listener de test antes de tráfico real), y desplaza el tráfico según la configuración: `AllAtOnce`, `Linear10PercentEvery1Minute`, o `Canary10Percent5Minutes` (10% durante 5 min, luego el resto). Durante la ventana, las **alarmas de CloudWatch** asociadas (5xx del target group green, latencia p99, errores de negocio) disparan **rollback automático**: el tráfico vuelve a blue en segundos porque blue sigue corriendo hasta el final del bake time. Costo: capacidad doble durante el despliegue. Alternativa nativa: ECS estrenó blue/green integrado (2025) sin CodeDeploy; y el rolling update clásico (minimumHealthyPercent/maximumPercent) sigue siendo válido cuando el rollback rápido no es crítico.

**Canary en Lambda**: CodeDeploy gestiona **alias con pesos**: el alias `live` apunta 90% a la versión N y 10% a la N+1; tras el intervalo sin alarmas, completa. Configs `Canary10Percent10Minutes`, `Linear10PercentEvery10Minutes`, etc. Con SAM es una línea (`AutoPublishAlias` + `DeploymentPreference`). Hooks `PreTraffic`/`PostTraffic` para validación sintética. Matiz: el peso se aplica por invocación, no por sesión — clientes con afinidad verán versiones mezcladas; el diseño debe tolerarlo.

**Lo que hace funcionar un canary de verdad**: (1) **alarmas correctas** — no solo 5xx del ALB sino métricas de negocio (tasa de pagos fallidos, errores de dominio) con suficiente señal en el 10% del tráfico (si el 10% son 3 requests/min, el canary no detecta nada: alargar la ventana o usar linear); (2) **compatibilidad N/N+1** — durante el shift conviven dos versiones contra la misma base de datos: los cambios de esquema deben ser expand/contract (añadir columna nullable → desplegar código que la usa → limpiar), nunca breaking en un paso; lo mismo con contratos de eventos y APIs; (3) **feature flags** (AppConfig) para separar despliegue de release: el código llega apagado y se activa gradualmente por segmento, con kill switch sin redeploy.

**Pipeline completo**: CodePipeline (o GitHub Actions/GitLab) → build y tests → push a ECR con tag inmutable por commit → despliegue a staging → pruebas → aprobación o promoción automática → CodeDeploy canary en prod → bake → done. Multi-cuenta: el pipeline asume roles cross-account por entorno. Errores comunes: rollback que no revierte migraciones de BD (por eso expand/contract), alarmas de rollback tan sensibles que revierten por ruido (o tan laxas que nunca disparan), desplegar viernes a las 18h sin bake time, tags de imagen `latest` (irreproducible), y canary sin tráfico suficiente para significancia estadística.

---

## 11. Observabilidad: CloudWatch, X-Ray y ADOT
**Categoría:** Observabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Tres pilares sobre servicios AWS: métricas y logs en CloudWatch (logs estructurados JSON, metric filters, EMF para métricas de alta cardinalidad embebidas en logs, alarmas sobre percentiles), trazas distribuidas con X-Ray o —mejor hoy— OpenTelemetry vía ADOT, que instrumenta una vez y exporta a X-Ray, Prometheus/AMP, Grafana o terceros. La clave en microservicios es la correlación: trace ID propagado en headers y presente en cada línea de log, métricas RED por servicio y alarmas basadas en SLOs, no en CPU.

### 📖 Respuesta detallada
**Logs**: estructurados JSON siempre (CloudWatch Logs Insights consulta campos: `filter service="pagos" and level="ERROR" | stats count() by errorType`), con `trace_id`, `request_id`, `service`, `version` en cada línea. Costos que hay que dominar: **$0.50/GB ingerido** (Standard) + $0.03/GB-mes almacenado; el tier Infrequent Access ($0.25/GB) para logs de volumen; retención explícita por log group (default: infinito). Un servicio verboso en DEBUG puede costar más en logs que en cómputo. Metric filters convierten patrones de log en métricas; **EMF (Embedded Metric Format)** publica métricas custom desde los propios logs sin llamadas a la API de CloudWatch (más barato y con detalle de alta cardinalidad consultable en Insights).

**Métricas**: estándar por servicio (ALB: `TargetResponseTime`, `HTTPCode_Target_5XX_Count`; ECS: CPU/memoria; Lambda: `Errors`, `Duration`, `Throttles`, `ConcurrentExecutions`; SQS: `ApproximateAgeOfOldestMessage` — la métrica reina de consumidores) más custom de negocio. Alarmas sobre **percentiles** (p99, no promedios: el promedio esconde el sufrimiento), composite alarms para reducir ruido, y **anomaly detection** donde los umbrales fijos no funcionan. Métricas custom cuestan $0.30/métrica-mes (cardinalidad alta por dimensiones se dispara: cada combinación de dimensiones es una métrica — EMF mitiga). Para Kubernetes, Container Insights o AMP (Prometheus gestionado) + AMG (Grafana).

**Trazas**: X-Ray colecta segmentos/subsegmentos con muestreo configurable (default: 1 req/s + 5%), service map automático, y análisis de latencia por dependencia. Integración nativa: API Gateway, Lambda (activar tracing), SDK AWS instrumentado (ve las llamadas a DynamoDB/S3 con latencias), y propagación por header `X-Amzn-Trace-Id`. **ADOT (AWS Distro for OpenTelemetry)** es la dirección estratégica: SDKs e instrumentación automática OTel (Java agent, Python, Node) + collector (sidecar/daemonset) que exporta a X-Ray, AMP, o cualquier backend OTLP (Datadog, Honeycomb) — instrumentas una vez con el estándar y decides backend después; imprescindible para no casarse con un vendor. CloudWatch **Application Signals** automatiza métricas SLO + trazas para APM en EKS/ECS/Lambda.

**Lo que define la seniority**: (1) **correlación total** — del dashboard a la alarma, de la alarma a las trazas ejemplares del percentil afectado, de la traza a los logs con ese trace_id: si ese camino requiere más de 3 clics, la observabilidad falla en el incidente; (2) **propagación de contexto en asíncrono** — el trace context debe viajar en atributos de mensaje SQS/EventBridge y reconstruirse en el consumidor (OTel lo soporta; sin ello, las trazas mueren en cada cola); (3) **SLOs y error budgets** como base del alertado: alarmar sobre síntomas que ve el usuario (disponibilidad, latencia del endpoint), no sobre causas (CPU alta no despierta a nadie a las 3 AM si el SLO está intacto); (4) sampling con cabeza: 100% de trazas en errores, muestreo en éxito. Error común: dashboards preciosos que nadie mira y cero alarmas accionables — la observabilidad se diseña desde los incidentes hacia atrás.

---

## 12. Lambda internals: cold starts, concurrencia y provisioned concurrency
**Categoría:** Cómputo / Performance · **Tipo:** Conceptual

### 📝 Respuesta resumen
Cada request concurrente exige un execution environment; si no hay uno libre, Lambda crea uno nuevo: descarga del código, arranque del runtime y del init del handler — el cold start (50-300 ms en Node/Python, 1-10 s en Java/Spring sin optimizar). La concurrencia de la cuenta (default 1,000) se reparte entre funciones; reserved concurrency acota y garantiza; provisioned concurrency mantiene N entornos pre-inicializados (elimina cold starts a costo fijo, ~$0.0000042/GB-s). SnapStart (JVM/.NET/Python) restaura snapshots del entorno inicializado y recorta los peores cold starts sin costo por hora en Java.

### 📖 Respuesta detallada
**Ciclo de vida**: una invocación llega → si existe un entorno "warm" libre, se reutiliza (solo corre el handler); si no, **cold start**: (1) crear el microVM Firecracker y descargar el paquete/imagen (los container images de 10 GB se montan lazy por chunks, sorprendentemente rápido), (2) init del runtime, (3) ejecutar el **código de inicialización** (imports, clientes SDK, conexiones, marcos DI) — la fase que domina en Java/Spring. El entorno queda caliente un tiempo indeterminado (minutos a ~horas) y se recicla cada ~14 h. Implicaciones: inicializar clientes **fuera del handler** (se reutilizan), y cuidado con estado global mutable (persiste entre invocaciones del mismo entorno).

**Números típicos de cold start**: Node/Python con paquetes ligeros: 100-300 ms; Go/Rust: <100 ms; Java con frameworks pesados: 2-10 s (mitigable a cientos de ms con SnapStart, tiered compilation `-XX:+TieredCompilation -XX:TieredStopAtLevel=1`, o frameworks AOT como Quarkus/Micronaut/Spring Native); .NET: 0.5-2 s (ReadyToRun/AOT ayuda). Lambda **en VPC** ya no penaliza como antes (Hyperplane ENIs compartidas: ~decenas de ms). El tamaño del artefacto y el número de dependencias importan más que la memoria; y la memoria escala la CPU (hasta 10 GB / 6 vCPUs): funciones CPU-bound a 256 MB son lentas por falta de CPU, subir memoria puede *abaratar* (menos duración).

**Concurrencia**: `concurrencia ≈ RPS × duración media`. Límite regional por cuenta: **1,000 por defecto** (soft, ampliable a decenas de miles); burst: 1,000 nuevos entornos por función cada 10 s. Cuando se agota: throttling (429 en síncrono; en asíncrono reintenta; en streams, se atasca el shard). **Reserved concurrency**: aparta N para una función (garantía y a la vez techo — útil para acotar la presión sobre una BD descendente, y para que una función runaway no canibalice el pool de la cuenta: siempre reservo para las funciones críticas). **Provisioned concurrency**: N entornos pre-inicializados siempre listos — cero cold starts hasta N — a ~$0.0000042/GB-s (~$11/mes por entorno de 1 GB) más el uso; combinable con Application Auto Scaling por horario o utilización. Se aplica sobre una versión/alias concreto, encaja con los alias de CodeDeploy.

**SnapStart**: para Java (gratis), .NET y Python (con costo por caché y restauración): tras publicar la versión, Lambda ejecuta el init, congela un snapshot Firecracker y lo restaura en frío en ~200-500 ms en vez de re-inicializar. Trampas: unicidad (semillas aleatorias/UUIDs generados en init se clonan — re-sembrar en runtime hooks) y conexiones de red congeladas que hay que restablecer (`afterRestore`).

**Otros internals de examen**: cada entorno procesa **una** invocación a la vez (paralelismo interno del proceso no ayuda a la concurrencia, salvo el nuevo "Lambda concurrency" por entorno en runtimes que lo soporten), payload síncrono 6 MB / asíncrono 256 KB, timeout 15 min, /tmp 512 MB-10 GB, extensions (agentes de observabilidad/secretos) que también suman al cold start. Errores comunes: pool de conexiones SQL sin RDS Proxy (cada entorno abre las suyas: mil entornos = mil conexiones), provisioned concurrency sobre `$LATEST` (no se puede: versiones/alias), y "calentadores" caseros con pings (solo calientan un entorno; no escalan a concurrencia real).

---

## 13. Versionado de APIs y contratos entre microservicios
**Categoría:** Arquitectura / Integración · **Tipo:** Conceptual

### 📝 Respuesta resumen
Entre microservicios, el contrato (API o evento) es la interfaz pública: se evoluciona con cambios aditivos y tolerant reader (ignorar campos desconocidos), y solo se versiona en mayor (v1→v2) cuando el breaking change es inevitable, manteniendo ambas en paralelo durante la migración. En AWS: stages y de API Gateway, routing por path/header en ALB, schema registry de EventBridge para eventos, y consumer-driven contract testing en el pipeline para detectar rupturas antes de producción.

### 📖 Respuesta detallada
**Principio base**: en un sistema de despliegues independientes, productor y consumidor nunca se actualizan a la vez; todo cambio debe ser compatible hacia atrás (el productor nuevo sirve a consumidores viejos) y idealmente hacia adelante (consumidores nuevos toleran productores viejos). Cambios **seguros**: añadir campos opcionales, añadir endpoints, añadir valores a enums solo si los consumidores aplican tolerant reader (tratan valores desconocidos como "otro"). Cambios **breaking**: renombrar/eliminar campos, cambiar tipos o semántica, hacer obligatorio lo opcional, cambiar códigos de error contractuales.

**Estrategia con APIs**: (1) evolución aditiva por defecto — la mayoría de "versiones" se evitan con diseño aditivo y deprecación de campos (mantener el campo viejo poblado mientras existan consumidores, medir su uso con métricas antes de retirarlo); (2) cuando el breaking es inevitable, **versión mayor en el path** (`/v2/orders`) — explícita, cacheable, fácil de enrutar: en API Gateway con stages o APIs separadas, en ALB con reglas por path hacia target groups distintos, pudiendo servir v1 y v2 desde el mismo servicio (dos rutas) o servicios distintos durante la migración; (3) período de convivencia con telemetría por versión (¿quién sigue llamando v1? — logs con identidad del caller) y fecha de retirada comunicada. Los header-based versioning y content negotiation son elegantes pero complican caching y debugging; en microservicios internos el path gana por operabilidad.

**Contratos de eventos**: más delicados que las APIs porque los consumidores son invisibles para el productor. Reglas: envelope estable (metadata: `eventType`, `version`, `occurredAt`, `traceId`) + payload versionado; cambios aditivos; ante breaking, publicar **ambas versiones del evento** durante la transición o usar upcasters en consumidores. **EventBridge Schema Registry** descubre y versiona esquemas automáticamente del bus y genera bindings; para Kafka/MSK, Glue Schema Registry con reglas de compatibilidad (BACKWARD/FORWARD/FULL) que **rechazan en el registro** un esquema incompatible — el guardarraíl más efectivo porque falla en build, no en runtime.

**Contract testing**: la red de seguridad organizativa. Consumer-driven contracts (Pact o verificación por esquemas OpenAPI): cada consumidor publica las expectativas que realmente usa; el pipeline del productor verifica contra todas antes de desplegar. Esto convierte "¿romperé a alguien con este cambio?" de arqueología en un check automático. Complemento: linting de OpenAPI en CI (reglas de breaking-change con oasdiff o similar).

**Errores comunes**: versionar por costumbre creando v2 "porque toca" (cada versión viva duplica soporte y superficie de bugs; el objetivo es minimizar versiones simultáneas, no coleccionarlas); consumidores que validan con esquemas cerrados (`additionalProperties: false`) y explotan con cualquier campo nuevo — lo contrario del tolerant reader; reutilizar DTOs internos como contrato público (acopla el dominio interno a todos los consumidores); y retirar v1 por fecha sin telemetría de uso real.
