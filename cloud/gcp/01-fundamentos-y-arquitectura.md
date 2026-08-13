# Fundamentos y Arquitectura en GCP — Entrevistas Senior

Preguntas de fundamentos de Google Cloud Platform orientadas a perfiles senior de backend/microservicios.

---

## 1. Explica la jerarquía de recursos de GCP (Organización, Folders, Projects) y por qué importa en una empresa grande

**Categoría:** Fundamentos / Gobernanza · **Tipo:** Conceptual

### 📝 Respuesta resumen
GCP organiza todo en un árbol: Organización → Folders → Projects → Recursos. Las políticas de IAM y las Organization Policies se **heredan hacia abajo** y son aditivas (en IAM no se puede "quitar" un permiso heredado con un rol más restrictivo abajo). El *project* es la unidad de facturación, cuotas, APIs habilitadas y aislamiento por defecto. En empresas grandes se usan folders por entorno o unidad de negocio, y projects por servicio+entorno, aplicando el principio de mínimo privilegio en el nivel más bajo posible.

### 📖 Respuesta detallada
La jerarquía tiene cuatro niveles:

1. **Organization**: raíz del árbol, ligada a una cuenta de Cloud Identity/Workspace. Aquí viven las **Organization Policies** (constraints como `constraints/iam.disableServiceAccountKeyCreation`, `constraints/compute.vmExternalIpAccess`, `constraints/gcp.resourceLocations`) que restringen *qué se puede hacer*, mientras IAM define *quién puede hacerlo*. Un error común es confundir ambas: IAM concede, Org Policy restringe.
2. **Folders**: agrupación lógica (por unidad de negocio, equipo o entorno: `prod/`, `nonprod/`). Permiten aplicar IAM y políticas a conjuntos de projects. Se admiten hasta 10 niveles de anidamiento.
3. **Projects**: la unidad operativa clave. Cada project tiene su propio `project_id` (inmutable, global), su facturación asociada, sus **cuotas** (p. ej., CPUs por región, requests a APIs), sus APIs habilitadas y sus service accounts. El aislamiento entre projects es la frontera de seguridad más fuerte y barata que existe en GCP.
4. **Recursos**: VMs, buckets, topics, clusters, etc.

**Herencia de IAM**: la política efectiva de un recurso es la **unión** de las políticas del recurso y todos sus ancestros. Esto tiene una consecuencia crítica: si alguien es `roles/editor` a nivel de organización, lo es en *todos* los projects, y no hay forma de denegarlo abajo (salvo **IAM Deny Policies**, relativamente recientes, o VPC Service Controls para el plano de datos). Por eso la práctica senior es conceder roles lo más abajo posible y evitar roles primitivos (`owner/editor/viewer`) por completo.

**Diseño típico enterprise** (alineado con el *Cloud Foundation Fabric* / Landing Zone de Google):
- Folders: `bootstrap`, `common` (logging centralizado, interconnect), `prod`, `nonprod`, `dev`.
- Projects por servicio y entorno: `pagos-prod`, `pagos-staging`. Esto da *blast radius* pequeño: una service account comprometida en staging no toca prod.
- Projects "host" de **Shared VPC** separados de los "service projects" de las aplicaciones.
- Un project dedicado a seguridad/auditoría donde se exportan los **Audit Logs** con sinks agregados a nivel de organización (los *Admin Activity logs* son gratuitos e imborrables; los *Data Access logs* hay que habilitarlos y tienen costo de ingesta en Cloud Logging, ~0.50 USD/GiB tras los 50 GiB gratuitos por project/mes).

**Errores comunes que menciono en entrevista**: (a) meter todos los entornos en un project "para simplificar", lo que mezcla cuotas y hace imposible el least privilege; (b) usar folders como si dieran aislamiento de red (no lo dan; la red vive en el project); (c) olvidar que las **cuotas son por project y región**, así que consolidar servicios en un mega-project hace que un servicio ruidoso agote la cuota de otro (p. ej., cuota de instancias de Cloud Run o de conexiones de Cloud SQL Admin API); (d) no fijar `essentialcontacts` ni etiquetas/labels de coste desde el inicio, lo que arruina el *chargeback* de facturación después.

---

## 2. IAM en GCP: roles, service accounts y mejores prácticas de mínimo privilegio

**Categoría:** Seguridad / IAM · **Tipo:** Conceptual

### 📝 Respuesta resumen
IAM en GCP une un *principal* (usuario, grupo, service account, workload identity) con un *rol* (colección de permisos) sobre un *recurso*, opcionalmente con *condiciones*. Hay roles básicos (evitarlos), predefinidos (preferirlos) y personalizados. Las service accounts son a la vez identidad y recurso: alguien con `roles/iam.serviceAccountUser` puede **actuar como** la SA, lo que permite escalado de privilegios si se concede a la ligera. La regla senior: nada de claves exportadas, impersonación con tokens de corta vida, y roles concedidos al recurso más específico posible.

### 📖 Respuesta detallada
**Modelo**: una *IAM policy* es una lista de *bindings* `{principal, rol, condición}` adjunta a un recurso de la jerarquía. Los permisos tienen forma `servicio.recurso.verbo` (p. ej., `pubsub.subscriptions.consume`). No existen permisos "sueltos": siempre se conceden vía roles.

**Tipos de roles**:
- **Básicos** (`owner`, `editor`, `viewer`): heredados de la era pre-IAM, dan miles de permisos. En producción son un hallazgo de auditoría automático. `editor` además puede actuar sobre casi todas las SAs del project.
- **Predefinidos**: mantenidos por Google, granulares (`roles/pubsub.publisher`, `roles/cloudsql.client`, `roles/run.invoker`). Son la opción por defecto.
- **Personalizados**: cuando un predefinido concede de más. Ojo: requieren mantenimiento cuando Google añade permisos nuevos a un servicio, y hay permisos no incluibles en roles custom.

**Service accounts (SA)** — los puntos que diferencian a un senior:
- Una SA es **identidad** (puede tener roles) y **recurso** (otros pueden tener roles *sobre* ella). `roles/iam.serviceAccountUser` permite adjuntarla/usarla; `roles/iam.serviceAccountTokenCreator` permite **impersonarla** (generar access tokens). Conceder `serviceAccountUser` a nivel de project sobre alguien es darle, en la práctica, los permisos de *todas* las SAs del project → escalada de privilegios clásica.
- **Claves JSON exportadas**: son credenciales de larga vida sin expiración; el vector nº1 de compromisos en GCP. Deben bloquearse con la org policy `iam.disableServiceAccountKeyCreation` y sustituirse por: identidad adjunta al workload (metadata server en GCE/GKE/Cloud Run), **Workload Identity** en GKE, o **Workload Identity Federation** para cargas externas y CI/CD.
- La SA **default de Compute** recibe históricamente `roles/editor` (mitigable con org policy `iam.automaticIamGrantsForDefaultServiceAccounts`). Siempre creo SAs dedicadas por servicio con permisos mínimos.
- **Impersonación** para humanos: en lugar de repartir roles potentes a personas, se les da `serviceAccountTokenCreator` sobre una SA concreta y usan `--impersonate-service-account`; queda auditado en logs quién generó el token.

**Herramientas de mínimo privilegio**: **IAM Recommender** (Policy Intelligence) analiza el uso real de permisos en ~90 días y sugiere reducir roles; **Policy Analyzer** responde "¿quién puede X sobre Y?"; **Policy Troubleshooter** explica por qué un acceso fue denegado. **IAM Conditions** permite bindings con expresiones CEL (por ejemplo, acceso solo en horario laboral o solo a recursos con cierto prefijo de nombre). **IAM Deny Policies** y **Principal Access Boundaries** permiten denegaciones explícitas, algo que el modelo aditivo clásico no tenía.

**Errores comunes**: usar la misma SA para diez microservicios (imposible auditar ni acotar el blast radius); dar `roles/owner` a la SA de CI/CD; guardar claves JSON en repos (GitHub las detecta y Google las revoca, pero el daño de ventana existe); ignorar que los bindings a nivel de organización tardan en propagarse (hasta ~7 minutos) y hacer debugging a ciegas; y no distinguir *authentication* (quién eres: tokens OIDC/OAuth) de *authorization* (qué puedes: IAM), que en Cloud Run se materializa en `roles/run.invoker` + verificación del token en el LB o el servicio.

---

## 3. ¿Qué es Workload Identity Federation y por qué elimina las claves de service account?

**Categoría:** Seguridad / IAM · **Tipo:** Conceptual

### 📝 Respuesta resumen
Workload Identity Federation (WIF) permite que cargas externas a GCP (GitHub Actions, AWS, Azure, un datacenter con OIDC) intercambien su token nativo por credenciales de GCP de corta vida vía el Security Token Service, sin exportar claves JSON. Se configura un *Workload Identity Pool* con un *provider* OIDC/SAML/AWS, se mapean atributos del token externo a atributos de GCP y se autoriza a esa identidad federada a impersonar una SA (o a recibir roles directamente). Resultado: cero secretos de larga vida que rotar o filtrar.

### 📖 Respuesta detallada
**El problema**: una clave JSON de SA es un par RSA sin expiración. Quien la tenga *es* la SA, desde cualquier red, para siempre, hasta que alguien la rote. En CI/CD externo (GitHub Actions, GitLab) era el patrón habitual y también la causa habitual de incidentes.

**Cómo funciona WIF**:
1. Se crea un **Workload Identity Pool** (contenedor de identidades externas) y dentro un **Provider** que describe al emisor externo: para GitHub Actions, el issuer OIDC `https://token.actions.githubusercontent.com`; para AWS, la cuenta; para Azure, el tenant.
2. Se define un **attribute mapping** (CEL) que traduce claims del token externo a atributos de Google: `google.subject = assertion.sub`, `attribute.repository = assertion.repository`. Y opcionalmente una **attribute condition** que restringe qué tokens se aceptan: `assertion.repository_owner == 'mi-org'` — sin esto, *cualquier* repo de GitHub podría intentar autenticarse contra tu pool si el binding fuese laxo (error grave y real).
3. En runtime, la carga externa presenta su token OIDC al **Security Token Service** (`sts.googleapis.com`), que lo valida contra el JWKS del emisor y devuelve un *federated token*.
4. Con ese token se llama a `iamcredentials.googleapis.com:generateAccessToken` para impersonar una SA (requiere que el principal federado, p. ej. `principalSet://iam.googleapis.com/projects/N/locations/global/workloadIdentityPools/POOL/attribute.repository/mi-org/mi-repo`, tenga `roles/iam.workloadIdentityUser` sobre la SA). También existe el modo *direct resource access* sin SA intermedia, concediendo roles directamente al principal federado, soportado ya por la mayoría de servicios.

**Ventajas**: tokens de ~1 hora, sin secretos que almacenar, auditoría completa (el token de STS y la impersonación quedan en Cloud Audit Logs con los claims relevantes), revocación instantánea quitando el binding, y condiciones finas por repo/branch/environment (`assertion.ref == 'refs/heads/main'` para que solo main pueda desplegar a prod).

**Matices y errores comunes**:
- No confundir con **Workload Identity de GKE** (mapea Kubernetes Service Accounts a identidades de GCP dentro del cluster): comparten filosofía pero son mecanismos distintos; WIF es para identidades *externas* a GCP.
- El *subject* mapeado tiene límite de 127 caracteres; en GitHub el `sub` incluye repo+ref y puede truncarse — por eso se usan atributos custom.
- Condición de atributos demasiado laxa = "pool abierto al mundo": siempre anclar a `repository_owner` u organización.
- Para poder depurar, activar Data Access logs de STS.
- En GitHub Actions se usa `google-github-actions/auth` con `workload_identity_provider` + `service_account`; el job necesita `permissions: id-token: write`.
- WIF no aplica a *usuarios* humanos externos; para eso está **Workforce Identity Federation** (pools de workforce, acceso a consola incluida).

En una entrevista cierro con: la combinación org policy `iam.disableServiceAccountKeyCreation` + WIF + Workload Identity en GKE deja el parque sin una sola clave exportada, que es el estado objetivo.

---

## 4. VPC en GCP: Shared VPC vs VPC Peering vs Private Service Connect

**Categoría:** Redes · **Tipo:** Conceptual

### 📝 Respuesta resumen
Las VPC de GCP son **globales** (las subredes son regionales), a diferencia de AWS. Para conectar organizaciones internas hay tres patrones: **Shared VPC** (un host project comparte subredes con service projects; una sola red, administración central), **VPC Peering** (dos redes se conectan; no transitivo, con límites de peers y riesgo de solapamiento de CIDR) y **Private Service Connect** (expone un *servicio* como endpoint privado sin compartir la red; ideal producer/consumer, sin problemas de IPs solapadas). La elección senior por defecto: Shared VPC para el interior de la organización, PSC para consumir servicios entre dominios o SaaS.

### 📖 Respuesta detallada
**Fundamentos**: una VPC de GCP es un recurso global; sus subredes son regionales y el enrutamiento entre regiones es automático por la red de Google (con costo de egress inter-región). Los firewalls son *stateful*, se aplican a nivel de red usando tags o service accounts como selectores — usar **service accounts como target** de reglas es más robusto que tags (los tags los puede cambiar quien edite la VM; la SA no).

**Shared VPC**: un **host project** define la red y las subredes; los **service projects** se adjuntan y sus recursos (GKE, Cloud SQL con PSA, VMs, conectores) consumen subredes del host. IAM fino: `roles/compute.networkUser` sobre subredes concretas por equipo. Ventajas: administración de red centralizada (equipo de networking controla rutas, firewall, Cloud NAT, interconnects) mientras los equipos de producto operan sus projects; una sola red = comunicación con IP interna sin peering. Límites relevantes: número de service projects por host (por defecto ~100, ampliable), y que el host project se convierte en recurso crítico compartido (planificar cuotas y cambios con cuidado).

**VPC Peering**: conecta dos VPCs intercambiando rutas de subred. Sus tres problemas clásicos: (1) **no es transitivo** — si A-B y B-C, A no ve C, lo que hace inviable el hub-and-spoke puro con peering (para eso hoy está **Network Connectivity Center**); (2) los **CIDR no pueden solaparse**; (3) límites de grupo de peering (rutas, instancias totales). Además, servicios gestionados como Cloud SQL con **Private Services Access** viven en una VPC de Google *peered* con la tuya, y esa ruta *no se exporta* transitivamente: una VM en una red peered con la tuya no llega al Cloud SQL — dolor real muy preguntado.

**Private Service Connect (PSC)**: cambia el modelo de "conectar redes" a "publicar servicios". El *producer* expone un servicio detrás de un **service attachment** (respaldado por un ILB); el *consumer* crea un **endpoint PSC** (una IP interna de SU red) que apunta a ese attachment. Ventajas decisivas: no se intercambian rutas (cero superficie lateral), los CIDR pueden solaparse tranquilamente, hay control de conexiones por project consumidor (allowlist), y escala a cientos de consumidores. Se usa para: acceder a APIs de Google de forma privada (endpoints PSC para `googleapis.com`), consumir Cloud SQL/AlloyDB (la variante moderna que sustituye a Private Services Access), servicios de terceros (SaaS estilo MongoDB Atlas, Confluent) y servicios internos entre dominios de una misma empresa. Costos: hay cargo por endpoint PSC y por GB procesado, mientras el peering no cobra por sí mismo (solo egress) — irrelevante frente al costo operativo de gestionar solapamientos.

**Complementos que menciono**: **Cloud NAT** para salida a internet sin IPs públicas (regional, cuidado con el agotamiento de puertos: puertos por VM configurables), **Private Google Access** para que subredes sin IP pública lleguen a APIs de Google, y **VPC Service Controls** como perímetro contra exfiltración de datos en el plano de datos de servicios como GCS/BigQuery (independiente de IAM: aunque tengas permiso, si estás fuera del perímetro, no accedes).

---

## 5. GKE vs Cloud Run vs Cloud Functions vs App Engine: ¿cuándo eliges cada uno?

**Categoría:** Cómputo / Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
La decisión es un gradiente de control vs operación: **Cloud Run** es el default moderno para microservicios HTTP/eventos en contenedores (escala a cero, pago por uso, sin cluster). **GKE** cuando necesitas orquestación real: daemonsets, GPUs con topologías concretas, stateful sets, service mesh, workloads no-HTTP arbitrarios, control fino de red o multi-tenancy. **Cloud Functions** (hoy Cloud Run functions) para glue code dirigido por eventos de una sola función. **App Engine** solo lo mantendría en sistemas legacy; para greenfield está superado por Cloud Run.

### 📖 Respuesta detallada
**Cloud Run**: contenedores serverless sobre Knative-like API. Modelo request-driven: instancias que atienden hasta `concurrency` requests (default 80, máx 1000), escalado por concurrencia/CPU, **escala a cero**. Soporta CPU always-on para trabajo en background, jobs para batch, sidecars, montaje de volúmenes (GCS FUSE, NFS), hasta 8 vCPU/32 GiB por instancia, timeouts de hasta 60 min, HTTP/2, gRPC y WebSockets. Precio por uso con granularidad de 100 ms (o por instancia con CPU always-on, que suele ser más barato con tráfico sostenido). Es mi default para APIs y workers porque elimina gestión de nodos, y su integración con IAM (`run.invoker`), Pub/Sub push y Eventarc cubre el 80% de arquitecturas de microservicios.

**GKE**: elijo Kubernetes cuando aparece al menos uno de estos requisitos: (1) workloads no request/response — consumidores de Kafka con rebalanceo, procesos de larga vida, cron complejos, colas propias; (2) necesidad de primitivas de K8s — StatefulSets, DaemonSets, operators (bases de datos, Kafka, Elastic), CRDs; (3) service mesh (Istio/Cloud Service Mesh) con mTLS y traffic management avanzado; (4) GPUs/TPUs con scheduling fino, bin-packing agresivo o nodos spot para optimizar costo a gran escala; (5) portabilidad multi-cloud/on-prem real; (6) redes exóticas (multi-NIC, IPs fijas por pod). El costo de GKE no es solo el management fee (~0.10 USD/h por cluster, con crédito de la free tier para uno zonal) sino el equipo: upgrades, seguridad de nodos, capacity planning, PodDisruptionBudgets... Kubernetes es un producto que hay que *operar*.

**Cloud Functions / Cloud Run functions (2ª gen)**: la 2ª generación ejecuta *sobre* infraestructura de Cloud Run, así que la diferencia real con Cloud Run es el modelo de despliegue (subes una función, no un contenedor) y los triggers integrados vía Eventarc (GCS, Pub/Sub, Firestore, Audit Logs). Lo uso para glue: reaccionar a un archivo en GCS, transformar un evento, webhooks simples. Cuando la "función" crece a un servicio con dependencias, framework y varios endpoints, es señal de migrar a Cloud Run con contenedor propio.

**App Engine**: Standard (sandbox por runtime, escala rápida, clase F) y Flexible (VMs con Docker). Fue el PaaS original, pero hoy: menos flexibilidad de runtime que un contenedor, `app.yaml` y servicios acoplados al project (un App Engine por project, región inmovible tras crearlo — trampa clásica), y Google claramente invierte en Cloud Run. Recomendación honesta en entrevista: mantener lo existente si funciona (Standard sigue siendo barato y sólido para ciertas cargas), no empezar nada nuevo ahí.

**Errores comunes**: elegir GKE "porque sabemos Kubernetes" para tres APIs HTTP (sobre-ingeniería con costo fijo alto); elegir Cloud Run para un consumidor de Kafka pull de larga vida sin CPU always-on (throttling de CPU fuera de request rompe el consumer); ignorar que Cloud Run tiene límites de instancias por defecto (100 por servicio, ampliable) que muerden en picos; y no considerar **GKE Autopilot** como punto medio antes de saltar a Standard.

---

## 6. GKE Autopilot vs Standard: trade-offs reales en producción

**Categoría:** Cómputo / Kubernetes · **Tipo:** Conceptual

### 📝 Respuesta resumen
Autopilot gestiona los nodos por ti: pagas por los **requests de los pods** (vCPU/memoria/disco), Google opera el node pool, aplica hardening y elimina el bin-packing como problema tuyo. Standard te da control total de node pools (tipos de máquina, DaemonSets privilegiados, GPUs específicas, spot con estrategia propia) pagando por **nodos** aprovisionados, usados o no. Autopilot es el default recomendado hoy; Standard cuando necesitas acceso a nodo, kernel tuning, o tienes bin-packing propio que bate el precio por-pod de Autopilot.

### 📖 Respuesta detallada
**Modelo de facturación — el trade-off central**: en Standard pagas las VMs de los node pools completas; si tu utilización real es del 40% (muy típico), pagas el 60% de aire. En Autopilot pagas exactamente los *resource requests* de cada pod (con mínimos por pod y ratios CPU:memoria permitidos), más un premium por vCPU respecto al precio crudo de la VM. La aritmética senior: si tu plataforma logra >60–70% de utilización sostenida con bin-packing propio, spot instances y CUDs sobre máquinas concretas, Standard sale más barato; si no tienes ese músculo de FinOps/platform engineering, Autopilot casi siempre gana en costo *total* (incluida la gente). Autopilot también soporta Spot Pods y descuentos por compromiso.

**Operación**: en Autopilot, Google gestiona provisión, upgrades, reparación y seguridad de nodos; no hay `nodes` que administrar ni que dimensionar, y el cluster autoscaler está integrado con **Node Auto-Provisioning**: defines pods, aparecen nodos. Aplica hardening por defecto: Workload Identity obligatorio, Shielded Nodes, sin SSH a nodos, bloqueo de contenedores privilegiados y de hostPath (con excepciones para partners permitidos). Esto es una *ventaja* de seguridad y una *limitación*: agentes de observabilidad o seguridad que requieren DaemonSets privilegiados solo funcionan si están en la lista de partners de Autopilot.

**Limitaciones de Autopilot que hay que saber**: no eliges tipo de máquina exacto (eliges *compute classes*: general, balanced, scale-out, y clases con GPU); no hay acceso SSH ni modificación de kernel/sysctls no permitidos; los mínimos de requests por pod y el redondeo pueden encarecer pods muy pequeños y numerosos; los **pods sin `requests` bien puestos** se ajustan automáticamente, lo que puede sorprender; y el escalado ante picos súbitos depende de aprovisionar nodos nuevos (mitigable con *balloon pods* de baja prioridad para mantener headroom caliente — patrón que vale la pena mencionar en entrevista).

**Cuándo Standard sigue ganando**: GPUs/TPUs con topologías y drivers específicos; DaemonSets de terceros no soportados; sysctls y kernel tuning (redes de alto rendimiento, hugepages); node pools con máquinas custom o local SSD con configuraciones concretas; clusters enormes donde el equipo de plataforma ya optimiza ocupación >70% y usa CUDs de Compute; y workloads que necesitan `hostNetwork` o privilegios.

**Errores comunes**: comparar Autopilot vs Standard mirando solo el precio por vCPU (ignorando la utilización real y el costo de ingeniería de plataforma); llegar a Autopilot con manifests sin `resources.requests` afinados y sorprenderse de la factura (en Autopilot los requests *son* la factura — Recommender y VPA ayudan a ajustarlos); asumir que Autopilot no escala rápido sin diseñar headroom; y olvidar que se puede **convertir la decisión en reversible**: ambos modos son GKE, la API de Kubernetes es la misma, y hoy incluso existen capacidades de Autopilot habilitables en clusters Standard, así que empezar en Autopilot y salir después es un camino razonable.

---

## 7. Cloud SQL vs Spanner vs Firestore vs Bigtable: criterios de elección, consistencia y particionado

**Categoría:** Datos / Bases de datos · **Tipo:** Conceptual

### 📝 Respuesta resumen
**Cloud SQL**: Postgres/MySQL gestionado, relacional clásico, escala vertical (+ réplicas de lectura), regional; el default para OLTP < unos pocos TB. **Spanner**: relacional distribuido, SQL, consistencia externa global y escalado horizontal casi ilimitado; para OLTP global o que supera Cloud SQL, a cambio de costo y de diseñar claves sin hotspots. **Firestore**: documental serverless con consistencia fuerte, ideal para backends de apps y modelos jerárquicos, con límites de escritura por documento. **Bigtable**: wide-column NoSQL para series temporales/telemetría a millones de QPS y latencia de milisegundos de un dígito, sin SQL transaccional ni índices secundarios nativos.

### 📖 Respuesta detallada
**Cloud SQL (MySQL/Postgres/SQL Server)**: instancia gestionada con HA regional (failover a standby síncrono en otra zona, RPO≈0, failover ~60s), réplicas de lectura (asíncronas — lecturas *eventualmente* consistentes, hay que decirlo), PITR, y hasta ~64 TB de disco y 96+ vCPUs según edición (Enterprise Plus sube límites y añade *data cache*). Su techo real: escritura en un solo primario, número de **conexiones** (gestión con PgBouncer obligatoria a escala), y mantenimiento con ventanas. Es la elección por defecto salvo que haya un motivo para no usarla: el 80% de los sistemas cabe aquí.

**Spanner**: base relacional distribuida con **consistencia externa** (más fuerte que la serializabilidad, gracias a TrueTime), SQL (GoogleSQL y dialecto PostgreSQL), transacciones ACID multi-región y escalado horizontal por *splits*. Se paga por **nodos o processing units** (100 PUs = 1/10 nodo; ~1000 PUs ≈ 1 nodo que orienta a ~10k QPS de lectura / ~2k de escritura como orden de magnitud, y ~10 TB por nodo) más almacenamiento. **Particionado**: automático por rangos de clave primaria; el diseño de claves es EL tema — claves secuenciales (timestamps, autoincrementales) concentran escrituras en un split (hotspot); se resuelve con UUIDv4, hash-prefix o bit-reversal de la secuencia. Las *interleaved tables* co-localizan hijos con padres para evitar joins distribuidos. Elegirlo cuando: necesitas >99.999% SLA multi-región, escrituras globales consistentes, o superaste el techo de Cloud SQL y no quieres shardear a mano. No elegirlo para una app CRUD regional pequeña: el mínimo de entrada y la disciplina de diseño no compensan.

**Firestore**: documental serverless (documentos/colecciones), **fuertemente consistente** en queries e índices (a diferencia del viejo Datastore eventual en algunos modos), transacciones ACID, listeners en tiempo real y modo Native u compatible con Datastore. Límites que definen el diseño: **~1 escritura sostenida/segundo por documento** (contención en documentos calientes → contadores fragmentados), tamaño máximo de documento 1 MiB, y las queries solo funcionan sobre índices (los compuestos hay que declararlos). Precio por operación (lecturas/escrituras/borrados) + almacenamiento + egress: excelente para tráfico modesto, caro si haces *fan-out* de lecturas masivas. Ideal para: backends móviles/web, catálogos, perfiles, estado jerárquico. Malo para: analítica, agregaciones ad-hoc, escrituras concentradas.

**Bigtable**: wide-column (familia HBase; también expone API compatible con Cassandra), diseñado para throughput masivo: telemetría, time series, features de ML, mensajería a escala. Latencia p99 de milisegundos de un dígito, escalado lineal añadiendo nodos, replicación multi-cluster con **consistencia eventual** entre clusters (fuerte solo con single-cluster routing). Sin joins, sin transacciones multi-fila (sí atomicidad por fila), índices secundarios limitados → el **row key design** lo es todo: claves con prefijo de campo de alta cardinalidad, evitar timestamps al inicio (hotspot), usar *field promotion* o *salting*. Entrada de costo relativamente alta (nodos mínimos por cluster) — tiene sentido a partir de decenas de miles de QPS o TBs con SLA de latencia estricto.

**Marco de decisión que doy**: ¿relacional y cabe en una región/una caja grande? Cloud SQL (o AlloyDB si Postgres exigente). ¿Relacional, global o sin techo? Spanner. ¿Documentos con sincronización a clientes y consistencia fuerte? Firestore. ¿Millones de escrituras/s con acceso por clave? Bigtable. ¿Analítica? Ninguna de estas: BigQuery.

---

## 8. Pub/Sub en profundidad: at-least-once, ordering keys, exactly-once y dead letter queues

**Categoría:** Mensajería / Integración · **Tipo:** Conceptual

### 📝 Respuesta resumen
Pub/Sub es un bus global serverless con entrega **at-least-once** por defecto: los duplicados y el desorden son la norma, así que los consumidores deben ser idempotentes. Ofrece **ordering keys** (orden por clave dentro de una región, a costa de throughput por clave), **exactly-once delivery** (por suscripción, regional, elimina redeliveries de mensajes ya ack-eados) y **dead-letter topics** tras N intentos fallidos. Las decisiones senior: idempotencia siempre (aunque uses EOD), DLQ con alertas en toda suscripción de producción, y elegir push/pull/StreamingPull según el runtime.

### 📖 Respuesta detallada
**Modelo**: topics globales, suscripciones independientes (cada una recibe copia completa — fan-out), retención de mensajes hasta 31 días (7 por defecto; configurable, y con `retain_acked_messages` + `seek` puedes reprocesar el pasado). Publicar cuesta por volumen (~40 USD/TiB de throughput en el modelo clásico), con mínimo de 1 KB facturable por mensaje/entrega — miles de mensajes diminutos pagan como si fueran de 1 KB.

**At-least-once y ack deadlines**: el suscriptor recibe el mensaje y debe hacer *ack* antes del `ackDeadline` (10–600 s; las client libraries lo extienden automáticamente con *lease management*). Si no llega el ack (proceso lento, crash, deadline corto), Pub/Sub **reenvía**. De ahí los duplicados: la idempotencia del consumidor no es opcional. Técnicas: clave de idempotencia de negocio (no confiar en `messageId` como única defensa si el *publisher* puede publicar dos veces), tabla de dedupe con TTL, o upserts naturales.

**Ordering keys**: al publicar con `ordering_key` y suscripción con `enable_message_ordering`, Pub/Sub entrega en orden de publicación *por clave*. Restricciones importantes: la publicación con la misma clave debe ir a la **misma región**; el throughput por ordering key está limitado (~1 MB/s por clave); un fallo de publicación bloquea las siguientes de esa clave hasta que hagas *resume*; y un mensaje nack-eado provoca redelivery de él y los posteriores de su clave (amplifica reprocesos). Además, ordering + DLQ tienen interacción delicada: sacar un mensaje a DLQ rompe el orden de esa clave por definición. Alternativa cuando el orden importa mucho de extremo a extremo: repensar el diseño (versionado/last-write-wins) o usar un log particionado (Kafka/Managed Kafka de GCP).

**Exactly-once delivery (EOD)**: propiedad de la *suscripción* (pull/StreamingPull, regional). Garantiza que no habrá redelivery de un mensaje una vez ack-eado con éxito, y expone acks con confirmación (`AckWithResponse`). Coste: más latencia y menor throughput. Lo crucial en entrevista: EOD ≠ *exactly-once processing* end-to-end — si tu handler escribe en una base de datos y luego el ack falla, ya procesaste dos veces; la transaccionalidad real requiere idempotencia o patrón outbox/inbox en el consumidor. EOD reduce duplicados de infraestructura; no elimina los de aplicación.

**Dead letter topics**: la suscripción se configura con `max_delivery_attempts` (5–100) y un topic DLQ. Detalles operativos que fallan en producción: la **service account de Pub/Sub** del project necesita `publisher` sobre el topic DLQ y `subscriber` sobre la suscripción original (sin esos permisos, el DLQ silenciosamente no funciona); el contador de intentos es *best effort*; el mensaje llega al DLQ con atributos (`CloudPubSubDeadLetterSourceSubscription`, etc.) pero **sin la causa del fallo** — hay que loggearla en el consumidor; y un DLQ sin suscripción, alerta y proceso de *replay* es un agujero negro. Yo siempre monto: suscripción sobre el DLQ, alerta en Cloud Monitoring sobre `dead_letter_message_count`, y un runbook de reproceso.

**Push vs pull**: push (POST a un endpoint, con OIDC token — perfecto para Cloud Run, el flow control lo hace Pub/Sub adaptándose a las respuestas) vs StreamingPull (máximo throughput y control, para consumidores de larga vida en GKE). Errores comunes: `ackDeadline` menor que el tiempo real de proceso (tormenta de redeliveries), no limitar `max_outstanding_messages` en pull (OOM del consumidor), y tratar Pub/Sub como cola FIFO global (no lo es).

---

## 9. BigQuery: arquitectura, particionado/clustering y control de costos

**Categoría:** Datos / Analítica · **Tipo:** Conceptual

### 📝 Respuesta resumen
BigQuery separa almacenamiento (Colossus, formato columnar Capacitor) de cómputo (slots de Dremel), comunicados por la red Jitter/Borg de Google: escalan independientemente y no administras nada. Se paga por almacenamiento (~0.02/0.04 USD/GiB lógico, mitad si es *long-term*) y por cómputo: **on-demand** (~6.25 USD/TiB escaneado) o **capacity/editions** (slots reservados con autoscaling). Las claves de costo/rendimiento: particionar (por fecha/entero), clusterizar por columnas de filtro, nunca `SELECT *`, y exigir `require_partition_filter` + límites de bytes facturables.

### 📖 Respuesta detallada
**Arquitectura**: el almacenamiento vive en Colossus en formato columnar (Capacitor), replicado; el cómputo son **slots** (unidades de CPU/RAM) que ejecuta Dremel como un árbol de etapas con *shuffle* distribuido en memoria. Esta separación explica sus propiedades: consultar no interfiere con ingestar, el storage es barato y compartible entre projects (datasets autorizados, Analytics Hub), y la escala de una query depende de slots disponibles, no de un "cluster" tuyo. La ingesta streaming moderna va por la **Storage Write API** (más barata y con semántica exactly-once por stream que la vieja `insertAll`), y la lectura masiva externa por la Storage Read API.

**Particionado**: divide la tabla físicamente por una columna de fecha/timestamp (por día/hora/mes/año), por entero con rangos, o por *ingestion time* (`_PARTITIONTIME`). Límite: 10 000 particiones por tabla. Beneficio doble: *pruning* (una query con `WHERE fecha = ...` solo escanea esas particiones → paga solo eso) y operaciones por partición (expiración automática con `partition_expiration_days`, recarga idempotente de un día). La opción `require_partition_filter=true` rechaza queries sin filtro de partición — la primera línea de defensa de costos y debería ser estándar en tablas grandes.

**Clustering**: ordena los datos dentro de cada partición por hasta 4 columnas (el orden importa: primero la de filtro más frecuente). Da *block pruning* en filtros y mejora joins/agrupaciones por esas columnas. A diferencia del particionado, el ahorro no se refleja en la estimación previa (el dry run muestra el peor caso), pero sí en lo facturado. Regla práctica: particiona por tiempo, clusteriza por las 2–4 columnas de filtro habitual (tenant_id, user_id, evento). Para tablas <1 GiB nada de esto importa (overhead de metadatos).

**Modelo de costos y sus trampas**:
- **On-demand** (~6.25 USD/TiB escaneado, 1 TiB/mes gratis): simple, peligroso sin límites. Trampas clásicas: `SELECT *` en tabla ancha (columnar: pagas por columnas leídas); `LIMIT 10` **no** reduce lo escaneado; previews con la UI sí son gratis (`Preview`), igual que los metadatos.
- **Editions/capacity**: slots con autoscaling (Standard/Enterprise/Enterprise Plus), pago por slot-hora con baselines y compromisos de 1/3 años. Conviene cuando el gasto on-demand mensual sostenido supera el equivalente en slots, o cuando necesitas aislamiento de workloads (reservations + assignments por project/folder: ETL no compite con dashboards).
- Controles imprescindibles: `maximum_bytes_billed` por query/usuario, custom quotas por project/usuario/día, alertas de billing, y revisar `INFORMATION_SCHEMA.JOBS` para encontrar a los ofensores (query, usuario, bytes facturados).

**Detalles senior**: los resultados se cachean 24 h (repetir query idéntica es gratis si la tabla no cambió); las **materialized views** aceleran agregaciones con refresco incremental; los datos con >90 días sin modificar pasan a *long-term storage* a mitad de precio automáticamente; el *time travel* permite consultar hasta 7 días atrás (`FOR SYSTEM_TIME AS OF`); y los joins con *skew* (claves calientes tipo NULL o un tenant gigante) inflan el shuffle — se diagnostican en el *execution graph* mirando etapas con máximos muy alejados de la media.

---

## 10. Cloud Load Balancing global: anatomía del External Application Load Balancer

**Categoría:** Redes / Tráfico · **Tipo:** Conceptual

### 📝 Respuesta resumen
El **Global External Application LB** de GCP es un proxy L7 basado en GFE/Envoy que vive en el edge de Google: una sola IP anycast global, TLS terminado cerca del usuario, y enrutamiento al backend más cercano con capacidad (algoritmo por *balancing mode*). Se compone de forwarding rule → target proxy → URL map → backend services → NEGs/MIGs. Diferenciadores frente a AWS: IP única global sin DNS geo, integración nativa con Cloud CDN, Cloud Armor (WAF) y serverless NEGs para Cloud Run. Para microservicios, el URL map permite ruteo por host/path/headers con traffic splitting.

### 📖 Respuesta detallada
**Cadena de recursos**: (1) **Forwarding rule** con la IP anycast global y puerto; (2) **Target HTTPS proxy** con los certificados (Google-managed con renovación automática, o Certificate Manager con wildcard/DNS-auth); (3) **URL map**: enrutamiento por host y path, con *route rules* avanzadas (match por headers/query, rewrites, redirects, mirroring, **traffic splitting** por pesos — útil para canary a nivel de LB); (4) **Backend services** con política de balanceo, health checks, timeouts, y capacidades adjuntas: Cloud CDN, Cloud Armor, IAP, logging; (5) **Backends**: MIGs (VMs), **NEGs zonales** (pods de GKE vía container-native load balancing — el LB habla directo a IPs de pod, saltándose kube-proxy y el doble salto), **serverless NEGs** (Cloud Run, App Engine, Functions), **internet NEGs** (backends externos) y **PSC NEGs**.

**Anycast y enrutamiento**: la IP se anuncia desde todos los POPs de Google; el usuario entra por el POP más cercano (TLS y TCP terminan ahí → menos RTTs de handshake) y viaja por la red privada de Google hasta el backend (Premium Tier; Standard Tier usa internet pública y pierde la globalidad). La selección de backend considera proximidad y **capacidad**: cada backend declara `max-rate-per-instance`/`max-utilization`; si la región cercana está llena, el tráfico *desborda* a la siguiente — failover regional automático sin tocar DNS, uno de los argumentos más fuertes de GCP para multi-región.

**Health checks**: vienen de rangos propios de Google (`35.191.0.0/16`, `130.211.0.0/22`) que hay que permitir en firewall — el clásico "todos los backends unhealthy" es casi siempre esa regla ausente. Con NEGs de GKE, los health checks del LB son independientes de los readiness probes: alinear ambos evita mandar tráfico a pods no listos.

**Cloud Armor**: WAF adjunto al backend service: reglas preconfiguradas OWASP (SQLi/XSS con niveles de sensibilidad), rate limiting por IP o header, bot management con reCAPTCHA, y Adaptive Protection (ML contra L7 DDoS). Se evalúa en el edge: el ataque no llega a tu VPC.

**Cloud CDN**: se activa con un flag en el backend service; cachea según `Cache-Control` o modos forzados, con *negative caching* y invalidación. Trampa de costos habitual: `cache hit ratio` bajo por headers `Vary` o cookies que fragmentan la clave de caché.

**Familia de LBs — saber elegir**: Global External ALB (L7 global), Regional External ALB (L7 en una región, requerido por algunas features y proxy-only subnets), **Internal ALB** (L7 interno, Envoy, para este-oeste entre microservicios), Network LB (L4 passthrough, preserva IP de origen, para TCP/UDP no-HTTP), y Proxy NLB (L4 con terminación). Errores comunes: elegir Standard Tier para ahorrar y perder anycast global; olvidar la **proxy-only subnet** en LBs regionales/internos; timeouts por defecto de 30 s en backend service cortando llamadas largas o WebSockets (subirlo explícitamente); y no habilitar logging del LB (sampleado configurable), que es la primera fuente de verdad en incidentes de latencia.

---

## 11. Memorystore (Redis) en arquitecturas de microservicios: patrones, límites y alta disponibilidad

**Categoría:** Datos / Caching · **Tipo:** Conceptual

### 📝 Respuesta resumen
Memorystore ofrece Redis gestionado en dos sabores: **Redis básico/Standard** (una instancia hasta 300 GB, Standard con réplica y failover automático, hasta ~1000 clientes... escala vertical) y **Redis Cluster** (sharding OSS cluster protocol, escala horizontal a TBs y millones de ops/s, con PSC). Casos: caché de lecturas, sesiones, rate limiting, locks. Decisiones clave: política de evicción y TTLs, plan contra estampidas de caché, y tratar Redis como *cache* (efímero) salvo que uses la persistencia y HA del tier adecuado.

### 📖 Respuesta detallada
**Opciones**: (1) **Memorystore for Redis** clásico: Basic (sin réplica; el mantenimiento o un fallo de zona = pérdida de datos y downtime) y Standard (réplica en otra zona, failover automático ~30 s, SLA 99.9%; con read replicas para escalar lecturas). Tamaño 1–300 GB, conectividad por Private Services Access o Direct Peering. (2) **Memorystore for Redis Cluster**: protocolo cluster de OSS Redis, shards gestionados, escala in-place, conectividad **PSC**, SLA hasta 99.99% con réplicas; es la elección moderna para cargas serias. (3) **Memorystore for Valkey**: el fork abierto de Redis, mismo posicionamiento que Cluster. Hay soporte de persistencia (RDB/AOF según edición) pero el posicionamiento sano en entrevista es: si los datos no pueden perderse, no viven solo en Redis.

**Patrones en microservicios**:
- **Cache-aside**: leer caché → miss → leer DB → poblar con TTL. La variante con problemas es el *cache stampede*: cuando expira una clave caliente, N instancias van a la DB a la vez. Mitigaciones: TTL con *jitter*, *single-flight* (lock corto en Redis con SET NX para que solo uno regenere), o *stale-while-revalidate* (servir el valor viejo mientras uno lo refresca).
- **Rate limiting**: contadores con INCR+EXPIRE o sliding window con sorted sets; en Redis Cluster cuidado con operaciones multi-clave (deben compartir hash tag `{...}` para caer en el mismo slot).
- **Locks distribuidos**: SET NX PX con token aleatorio y liberación verificada por script Lua. Redlock multi-nodo es polémico; para exclusión crítica de negocio prefiero locks en la base de datos transaccional.
- **Sesiones / feature flags / colas ligeras**: válidos, pero recordar que Pub/Sub de Redis es at-most-once (no sustituye a Cloud Pub/Sub).

**Límites y operación**: latencia sub-milisegundo requiere cliente en la misma región (cross-region multiplica por la RTT); las conexiones importan (pool bien dimensionado; miles de conexiones sin pooling degradan); la **evicción** por `maxmemory-policy` (típico `allkeys-lru` para caché puro, `volatile-ttl` si mezclas datos con y sin TTL) debe elegirse conscientemente — el default `noeviction` convierte la memoria llena en errores de escritura; comandos O(N) (`KEYS`, `SMEMBERS` gigantes) bloquean el hilo único de Redis y disparan la p99 de todos: prohibir `KEYS` en prod (usar `SCAN`). Claves grandes (>100 KB) y *hot keys* (una clave que concentra el tráfico) son los dos asesinos silenciosos: se detectan con métricas por nodo desbalanceadas en Cloud Monitoring.

**Costos y alternativas**: se paga por GB-hora provisionado según tier; una instancia Standard de 32 GB ronda cientos de USD/mes — dimensionar por *working set* real, no por si acaso. Para cachés pequeñas por instancia, a veces basta caché en memoria local (Caffeine/LRU propio) con TTL corto + invalidación por Pub/Sub, ahorrando la pieza entera. En entrevista cierro señalando el trade-off: Memorystore no es accesible públicamente (solo IP privada), lo que obliga a pensar la conectividad desde serverless (Cloud Run necesita **Direct VPC egress** o Serverless VPC Access connector para llegar a él).

---

## 12. Diseño multi-región y Disaster Recovery en GCP: RTO/RPO y qué servicio da qué

**Categoría:** Arquitectura / Resiliencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
DR se diseña desde requisitos de negocio: **RPO** (datos que puedes perder) y **RTO** (tiempo que puedes estar caído), y cada 9 se paga. GCP facilita el nivel de infra: LB global con failover automático, storage multi-región/dual-región, Spanner y Firestore multi-región con RPO≈0. Los patrones clásicos: backup/restore (barato, RTO horas), pilot light, warm standby y activo-activo (RTO~0, costo ~2x y complejidad de datos). El cuello de botella real siempre es la **capa de datos** y el proceso humano (runbooks, game days), no el cómputo.

### 📖 Respuesta detallada
**Marco**: primero defino unidades de fallo: zona (frecuente, debe ser transparente), región (raro, el caso DR clásico), y proveedor/lógico (borrado accidental, ransomware — lo cubren *backups*, no la replicación: replicar corrupción es instantáneo). Alta disponibilidad ≠ DR: HA es resistir fallos sin intervención; DR es el plan cuando la HA no alcanza.

**Qué te da cada pieza de GCP**:
- **Cómputo**: los MIGs regionales y GKE regional sobreviven a zonas. Para multi-región: Cloud Run desplegado en N regiones o GKE por región, todos detrás del **Global External ALB**, que desborda tráfico automáticamente a la región sana (sin TTLs de DNS, la gran ventaja frente al patrón Route53). Con GKE existe además Multi-Cluster Ingress/Gateway.
- **Datos** (donde se decide el RPO): Cloud SQL — HA regional (RPO≈0 intra-región) y **réplicas cross-region asíncronas** (RPO segundos-minutos; el failover a réplica es *promoción* manual/orquestada y reconfigurar apps; cuidado: tras promover hay que reconstruir la topología). **Spanner** multi-región: RPO=0 y RTO≈0 con SLA 99.999% — pagas ~2-3x pero el problema DR de datos desaparece. **Firestore** multi-región (nam5/eur3): replicación síncrona transparente. **GCS**: multi-región o dual-región con *turbo replication* (RPO 15 min entre pares concretos). **Bigtable**: replicación multi-cluster eventual con failover por app profile. **Memorystore**: tratarlo como reconstruible (warm-up plan), no como dato a proteger. **Pub/Sub** es global de por sí (los mensajes se almacenan en la región de publicación; para DR estricto, publicar multi-región o aceptar la ventana).
- **Backups lógicos**: Backup and DR Service, exports programados (Cloud SQL a GCS, Firestore export, BigQuery snapshots/time-travel), con **retención bloqueada** (bucket lock/retention policy) contra ransomware y borrados con credenciales robadas.

**Patrones y su costo**:
1. **Backup & restore**: RTO horas–días, RPO = frecuencia de backup. Barato. Válido para sistemas internos.
2. **Pilot light**: datos replicados continuamente, cómputo apagado/mínimo (IaC listo para levantar). RTO ~decenas de minutos si está *probado*.
3. **Warm standby**: réplica funcional a escala reducida en la región secundaria; RTO minutos.
4. **Activo-activo**: tráfico en N regiones; exige datos multi-master (Spanner) o particionamiento por geografía (home region por usuario), y disciplina con la **latencia inter-región** (escrituras síncronas cross-region suman decenas de ms). RTO≈0, costo ≈2x + complejidad.

**Lo que separa a un senior**: (a) el DR **no probado no existe** — game days trimestrales, failover real de Cloud SQL en staging, y medir el RTO real (siempre peor que el teórico por DNS caches, secretos regionales, cuotas no pre-aprobadas en la región de destino — pedir cuotas en la región DR *antes* del desastre); (b) dependencias ocultas de una sola región: Cloud Build, Artifact Registry, Secret Manager (usar replicación automática), KMS keyrings regionales, VPC connectors; (c) decidir **quién y cómo declara el desastre** (runbook con criterios objetivos, no heroísmo a las 3 AM); (d) costo: presentar a negocio el menú RTO/RPO/precio y que ellos elijan — activo-activo global "porque sí" es la forma más cara de no necesitarlo.

---

## 13. Anthos / GKE Enterprise y service mesh: ¿cuándo justifica su complejidad?

**Categoría:** Plataforma / Service Mesh · **Tipo:** Conceptual

### 📝 Respuesta resumen
GKE Enterprise (antes Anthos) es la capa de gestión de flotas de clusters: **Fleets**, Config Management (GitOps con Config Sync), Policy Controller (OPA/Gatekeeper), Multi-Cluster Ingress/Gateway y **Cloud Service Mesh** (Istio gestionado). Un service mesh aporta mTLS automático, políticas de tráfico (retries, timeouts, circuit breaking, canary por pesos) y telemetría L7 uniforme sin tocar el código. Se justifica con *muchos* servicios y equipos, requisitos fuertes de zero-trust o multi-cluster/híbrido; para 5–10 microservicios en un cluster, es sobrecarga: empieza sin mesh.

### 📖 Respuesta detallada
**Qué es hoy**: la marca Anthos evolucionó a **GKE Enterprise**. Sus piezas relevantes para un arquitecto:
- **Fleet (flota)**: agrupación lógica de clusters (GKE en GCP, on-prem, incluso EKS/AKS con attached clusters) con conceptos de *sameness* (namespaces homónimos tratados como el mismo servicio lógico entre clusters).
- **Config Sync**: GitOps gestionado — el estado deseado (namespaces, RBAC, cuotas, políticas) vive en Git y se reconcilia continuamente en toda la flota. Alternativa gestionada a instalar ArgoCD/Flux por tu cuenta.
- **Policy Controller**: Gatekeeper/OPA gestionado con librería de constraints (prohibir `latest`, exigir requests/limits, restringir registries) y modo *dry-run* para adoptar sin romper.
- **Multi-Cluster Gateway/Ingress**: un LB global repartiendo entre clusters de varias regiones — la base del activo-activo en GKE.
- **Cloud Service Mesh**: Istio con control plane gestionado por Google (o data plane sidecar-less en evolución), integrado con Cloud Monitoring/Trace y con **managed CA** para las identidades mTLS (SPIFFE).

**Qué resuelve un mesh, concretamente**: (1) **mTLS automático** servicio-a-servicio con rotación de certificados — zero-trust interno sin tocar aplicaciones; (2) **AuthorizationPolicies**: "solo `checkout` puede llamar a `payments`" declarado en YAML, verificable y auditable; (3) **gestión de tráfico**: retries con presupuesto, timeouts, circuit breaking (outlier detection), mirroring, y splitting por pesos/headers → canary y A/B sin tocar el LB externo; (4) **telemetría uniforme**: golden signals L7 (RED) por servicio sin instrumentar código, y propagación de trazas (el mesh no sustituye a OpenTelemetry para spans internos, pero da la base).

**El costo real (por lo que digo "no siempre")**: sidecars Envoy suman CPU/memoria por pod (decenas de MB y ms de latencia por hop — p99 sensible lo nota), una pieza más que actualizar y depurar (los problemas de mesh son notoriamente difíciles: `503 UC/UF` de Envoy, mismatches de mTLS con servicios fuera del mesh, webhooks de inyección), y una curva de aprendizaje para *todos* los equipos, no solo plataforma. Regla práctica que defiendo: por debajo de ~15–20 servicios o sin requisito regulatorio de mTLS/authz fina, las alternativas más simples bastan — NetworkPolicies para segmentación L3/L4, mTLS en el borde + IAM (`run.invoker`) si es Cloud Run, y OpenTelemetry para telemetría. Cloud Run, de hecho, cubre "mesh-lite" con IAM entre servicios y traffic splitting nativo.

**Cuándo sí, sin dudarlo**: decenas/cientos de servicios y múltiples equipos donde la estandarización compensa; requisitos de compliance con cifrado y autorización servicio-a-servicio demostrables; topologías multi-cluster/multi-región con failover fino este-oeste; híbrido on-prem+cloud con identidad de workload unificada; o migraciones donde el mirroring y el traffic splitting reducen riesgo. Y siempre gestionado (Cloud Service Mesh) antes que Istio autogestionado: operar un control plane de Istio es un trabajo a tiempo completo que Google ya hace mejor.

---
