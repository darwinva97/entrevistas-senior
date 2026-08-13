# Fundamentos y Arquitectura en AWS — Entrevistas Senior

Preguntas de fundamentos de arquitectura cloud en AWS orientadas a perfiles senior de backend/microservicios.

---

## 1. Diseño de una VPC: subnets públicas/privadas, NAT e Internet Gateway
**Categoría:** Networking · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una VPC es una red virtual aislada con un rango CIDR (p. ej. /16). Se divide en subnets por AZ: públicas (con ruta al Internet Gateway) para load balancers y bastiones, y privadas (con ruta al NAT Gateway) para aplicaciones y bases de datos. El diseño típico son 3 AZ con al menos una subnet pública y una privada por AZ, NAT Gateway por AZ para resiliencia, y route tables separadas por tier.

### 📖 Respuesta detallada
Al diseñar una VPC lo primero es el **plan de direccionamiento CIDR**: un /16 (65,536 IPs) da margen para crecer; AWS reserva 5 IPs por subnet. Hay que evitar solapamientos con redes on-premises o con otras VPCs si habrá peering/Transit Gateway, porque el peering con CIDRs solapados es imposible. Un error común es crear subnets /24 pequeñas que se agotan con EKS (cada pod consume una IP con el VPC CNI); para EKS conviene subnets /19 o /20 privadas, o usar CIDR secundarios (100.64.0.0/10) para pods.

**Subnets públicas** son aquellas cuya route table tiene `0.0.0.0/0 → Internet Gateway (IGW)`. Ahí van ALBs públicos, NAT Gateways y poco más. **Subnets privadas** rutean `0.0.0.0/0 → NAT Gateway` para salida a internet sin ser alcanzables desde fuera. Un tercer tier "aislado" (sin salida a internet) es buena práctica para RDS/ElastiCache: solo tráfico interno y VPC endpoints.

El **NAT Gateway** es administrado, escala hasta 100 Gbps y ~10M de paquetes por segundo, pero cuesta ~$0.045/hora (~$32/mes) más **$0.045/GB procesado**, que es el costo silencioso más subestimado de AWS. Diseño senior: un NAT Gateway **por AZ**, con la route table de cada subnet privada apuntando al NAT de su propia AZ. Esto evita: (1) tráfico cross-AZ (que cuesta $0.01/GB por dirección) y (2) que la caída de una AZ deje sin salida a las demás. Para tráfico masivo hacia S3/DynamoDB, se añaden **Gateway Endpoints** (gratuitos) que eliminan ese tráfico del NAT.

**Route tables**: una por tier y por AZ. **NACLs**: normalmente se dejan por defecto (stateless, difíciles de mantener por el tema de puertos efímeros 1024-65535); la seguridad real se hace con **Security Groups** (stateful, referenciables entre sí: "el SG de la app permite 5432 desde el SG del backend", no por CIDR).

Errores comunes que menciono en entrevista: NAT Gateway único compartido entre AZs (single point of failure + costo cross-AZ), subnets sin IPs libres que bloquean el escalado del ALB (el ALB necesita ≥8 IPs libres por subnet), bases de datos en subnets públicas, y no habilitar **VPC Flow Logs** desde el día uno para diagnóstico. También hay que conocer los límites: 5 VPCs por región por defecto (soft), 200 subnets por VPC, 5 CIDRs por VPC (ampliable a 50).

---

## 2. VPC Endpoints: Gateway vs Interface, y cuándo usarlos
**Categoría:** Networking · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los VPC endpoints permiten llegar a servicios AWS sin salir a internet ni pasar por NAT. Los **Gateway endpoints** (solo S3 y DynamoDB) son gratuitos y funcionan por rutas; los **Interface endpoints** (PrivateLink, resto de servicios) crean ENIs con IP privada y cuestan ~$0.01/hora por AZ más $0.01/GB. Regla práctica: gateway endpoints siempre; interface endpoints cuando el ahorro de NAT o el requisito de seguridad lo justifique.

### 📖 Respuesta detallada
Sin endpoints, una Lambda o task en subnet privada que llama a S3, ECR o Secrets Manager sale por el **NAT Gateway** pagando $0.045/GB. Con tráfico alto (p. ej. pulls de imágenes de ECR en cada deploy, o backups a S3), esto genera facturas enormes.

**Gateway endpoints** existen solo para **S3 y DynamoDB**. Se implementan como una entrada en la route table (prefix list `pl-xxxx`) y son **gratuitos y sin límite de throughput**. No hay razón para no crearlos en toda VPC con subnets privadas. Limitación: solo funcionan desde dentro de la VPC (no desde on-premises vía VPN/Direct Connect, ni desde VPCs peered).

**Interface endpoints (PrivateLink)** crean una ENI con IP privada en cada subnet que elijas, con un DNS privado que resuelve el nombre público del servicio (`secretsmanager.us-east-1.amazonaws.com`) a esa IP. Cuestan **~$0.01/hora por AZ** (~$7.2/mes por AZ) más **$0.01/GB procesado**. Para un cluster ECS/EKS típico se suelen crear: `ecr.api`, `ecr.dkr`, `logs` (CloudWatch), `secretsmanager`, `ssm`, `sts`, `monitoring`. Con 7 endpoints × 3 AZ ≈ $150/mes fijos: hay que compararlo contra el gasto real en NAT. Si el tráfico a esos servicios supera ~300-400 GB/mes, el endpoint se paga solo; además el tráfico ECR/S3 de imágenes puede ser masivo.

Ventajas de seguridad: los interface endpoints soportan **endpoint policies** (limitar qué buckets/secretos son accesibles) y permiten VPCs completamente aisladas sin IGW/NAT, patrón común en banca y salud. Con S3 hay un matiz: existe también interface endpoint de S3 (para acceso desde on-premises), pero para workloads en la VPC el gateway endpoint es la opción correcta por costo.

**PrivateLink como producto**: además de consumir servicios AWS, puedes exponer tu propio servicio detrás de un **NLB** como "endpoint service" para que otras cuentas/VPCs lo consuman sin peering. Esto evita solapamiento de CIDRs y da acceso unidireccional de grano fino; es el patrón SaaS estándar (Datadog, Snowflake, MongoDB Atlas lo usan).

Errores comunes: olvidar habilitar **Private DNS** en el endpoint (las llamadas siguen yendo al endpoint público vía NAT sin que nadie lo note), no incluir `ecr.dkr` y `ecr.api` ambos (Fargate necesita los dos más el gateway de S3, porque las layers de las imágenes viven en S3), y no revisar los Security Groups del endpoint (deben permitir 443 desde las subnets consumidoras).

---

## 3. VPC Peering vs Transit Gateway: conectividad entre VPCs
**Categoría:** Networking · **Tipo:** Conceptual

### 📝 Respuesta resumen
Peering conecta dos VPCs punto a punto: gratis por la conexión (solo pagas transferencia), pero no es transitivo, y con N VPCs necesitas N(N-1)/2 conexiones. Transit Gateway es un hub regional que conecta cientos de VPCs, VPNs y Direct Connect con enrutamiento transitivo, a cambio de ~$0.05/hora por attachment más $0.02/GB. Regla: ≤3-4 VPCs → peering; más VPCs, múltiples cuentas o conectividad híbrida → TGW.

### 📖 Respuesta detallada
**VPC Peering** establece una relación 1:1 entre dos VPCs (misma o distinta cuenta/región). Características clave: **no es transitivo** (si A↔B y B↔C, A no llega a C), **no admite CIDRs solapados**, y requiere editar route tables en ambos lados. El costo es solo la transferencia de datos: gratis intra-AZ misma región (si usas la misma AZ ID), $0.01/GB cross-AZ, y tarifa inter-región si aplica. Límite: 125 peerings por VPC (hard limit). Con 10 VPCs full-mesh serían 45 conexiones y una pesadilla de route tables: no escala operacionalmente.

**Transit Gateway (TGW)** actúa como un router central regional: cada VPC se conecta con un "attachment" y el TGW enruta entre todas. Soporta hasta **5,000 attachments** por TGW, route tables propias (permitiendo segmentación: prod no ve dev), propagación automática de rutas, conectividad con **VPN site-to-site y Direct Connect**, peering inter-región entre TGWs, y multicast. Costo: **~$0.05/hora por attachment** (~$36/mes por VPC) más **~$0.02/GB procesado**. Punto de examen senior: con TGW pagas $0.02/GB **además** de la transferencia cross-AZ que aplique, así que para dos VPCs con tráfico muy alto entre ellas, peering directo puede ahorrar miles de dólares al mes.

Trade-offs para la decisión:
- **Escala organizacional**: en una organización multi-cuenta (landing zone con Control Tower), el TGW se comparte vía **RAM (Resource Access Manager)** y centraliza la inspección de tráfico (patrón hub-and-spoke con una VPC de inspección con firewalls/Gateway Load Balancer). Esto es imposible con peering.
- **Latencia**: peering es un hop directo; TGW añade un hop (latencia sub-milisegundo adicional, raramente relevante).
- **Ancho de banda**: TGW soporta hasta 100 Gbps por attachment por AZ; peering no tiene límite documentado agregado.
- **Solapamiento de CIDRs**: ninguno de los dos lo soporta; si hay CIDRs solapados (fusiones de empresas), la salida es **PrivateLink** o NAT privado.

Alternativa moderna: **VPC Lattice** para conectividad a nivel de servicio (capa 7) sin gestionar rutas de red, y **Cloud WAN** para redes globales multi-región como evolución del TGW.

Errores comunes: intentar usar peering transitivo a través de una VPC intermedia (no funciona, el tráfico se descarta), olvidar las rutas de retorno, no asociar los attachments a la route table correcta del TGW, y subestimar el costo por GB del TGW en workloads de streaming/replicación (un pipeline de 50 TB/mes cuesta ~$1,000/mes solo en procesamiento TGW).

---

## 4. IAM avanzado: evaluación de policies, roles y STS
**Categoría:** Seguridad · **Tipo:** Conceptual

### 📝 Respuesta resumen
La evaluación IAM sigue: deny explícito gana siempre; luego debe existir un allow en identity-based o resource-based policy, filtrado por permission boundaries, SCPs y session policies. Los roles se asumen vía STS (`AssumeRole`) obteniendo credenciales temporales; es el mecanismo correcto para workloads (nunca access keys estáticas). Un senior debe dominar condiciones, `iam:PassRole` y el confused deputy problem.

### 📖 Respuesta detallada
**Lógica de evaluación**: para cada request, AWS evalúa todas las policies aplicables. El orden lógico es: (1) por defecto todo es **implicit deny**; (2) un **explicit deny** en cualquier policy gana sobre todo; (3) si hay **SCP** (Service Control Policy de Organizations), debe permitir la acción; (4) si hay **permission boundary**, debe permitirla; (5) si hay **session policy** (pasada en AssumeRole), debe permitirla; (6) finalmente debe existir un **allow** en la identity-based policy o, para acceso mismo-cuenta, en la resource-based policy (bucket policy, queue policy, etc.). Matiz importante cross-account: se necesita allow en **ambos lados** (la identity policy del caller Y la resource policy del recurso), mientras que same-account basta con uno de los dos.

**Roles y STS**: un rol tiene dos policies: la **trust policy** (quién puede asumirlo: un servicio como `ecs-tasks.amazonaws.com`, otra cuenta, un IdP OIDC/SAML) y las **permission policies** (qué puede hacer). `sts:AssumeRole` devuelve credenciales temporales (15 min a 12 h, default 1 h; encadenamiento de roles limita a 1 h). Variantes: `AssumeRoleWithWebIdentity` (base de IRSA en EKS y de GitHub Actions OIDC) y `AssumeRoleWithSAML` (federación corporativa). Para workloads: **task roles** en ECS, **IRSA/Pod Identity** en EKS, **execution role** en Lambda, **instance profile** en EC2. Access keys estáticas en una app son un red flag inmediato en entrevista.

**Condiciones** que un senior debe manejar: `aws:SourceIp`, `aws:PrincipalOrgID` (permitir a toda la organización sin listar cuentas), `aws:PrincipalTag`/`aws:ResourceTag` (ABAC, escala mejor que RBAC puro con cientos de microservicios), `sts:ExternalId` (mitiga el **confused deputy problem** cuando un tercero asume roles en tu cuenta), y `aws:SecureTransport` (forzar TLS en buckets).

**`iam:PassRole`** es el permiso más peligroso y menos entendido: controla qué roles puede un principal "entregar" a un servicio (p. ej. lanzar una task ECS con cierto task role). Sin restricción (`Resource: *`), un usuario con PassRole y `lambda:CreateFunction` puede escalar privilegios creando una Lambda con un rol de admin. Siempre se acota con `Resource` específico y condición `iam:PassedToService`.

Límites relevantes: managed policies de hasta 6,144 caracteres, inline en roles 10,240; 10 managed policies por rol; 5,000 roles por cuenta (ampliable); 1 hora default de sesión. Herramientas de auditoría: **IAM Access Analyzer** (detecta acceso externo y genera policies desde CloudTrail), **credential reports** y la vista de "last accessed" para aplicar least privilege iterativamente.

---

## 5. Permission boundaries, SCPs y acceso cross-account
**Categoría:** Seguridad · **Tipo:** Conceptual

### 📝 Respuesta resumen
SCPs (Organizations) fijan el techo de permisos de cuentas enteras; permission boundaries fijan el techo de un rol/usuario concreto y sirven para delegar creación de roles sin escalada de privilegios; el permiso efectivo es la intersección de ambos con la identity policy. Cross-account se resuelve con AssumeRole sobre una trust policy con `ExternalId`, o con resource-based policies cuando el servicio las soporta.

### 📖 Respuesta detallada
**SCPs (Service Control Policies)** se aplican a nivel de AWS Organizations sobre OUs o cuentas. No otorgan permisos: solo definen el máximo posible. Casos típicos: denegar regiones no aprobadas (`aws:RequestedRegion`), impedir desactivar CloudTrail/GuardDuty, denegar `iam:CreateUser` (forzando federación), bloquear salida de datos (`s3:PutBucketPolicy` con principals externos). Importante: las SCPs **no afectan a la cuenta management** y no aplican a service-linked roles. Límite: 5 SCPs por nivel, 5,120 caracteres cada una. Complemento moderno: **RCPs (Resource Control Policies)** para poner techo a las resource-based policies de la organización.

**Permission boundaries** resuelven el problema de la **delegación segura**: quieres que los equipos creen sus propios roles (para sus Lambdas, pipelines) sin poder crear un rol de admin. La solución: una policy que exige que todo rol creado lleve un boundary concreto (condición `iam:PermissionsBoundary` en `iam:CreateRole`), y ese boundary define el techo (p. ej. "solo servicios X en región Y, nunca IAM ni Organizations"). El permiso efectivo = **intersección** de identity policy ∩ boundary ∩ SCP. El boundary por sí solo no da ningún permiso. Error común: olvidar denegar `iam:DeleteRolePermissionsBoundary` y `iam:PutRolePermissionsBoundary`, con lo que el delegado se quita el boundary a sí mismo.

**Cross-account**, tres patrones:
1. **AssumeRole (hub-and-spoke)**: la cuenta B crea un rol con trust policy hacia la cuenta A (`"Principal": {"AWS": "arn:aws:iam::111111111111:root"}` + condición sobre el principal concreto). A llama `sts:AssumeRole` y opera con credenciales temporales de B. Es el patrón de CI/CD multi-cuenta y de acceso de administración. Con terceros (un SaaS que accede a tu cuenta) es **obligatorio** `sts:ExternalId` para evitar el confused deputy: sin él, un atacante que conozca el ARN del rol podría pedirle al SaaS que actúe sobre tu cuenta.
2. **Resource-based policies**: S3, SQS, SNS, Lambda, Secrets Manager, KMS, EventBridge las soportan. Permiten acceso directo sin cambiar de identidad (útil: una Lambda de A leyendo una cola de B conserva su propia identidad en CloudTrail). Con KMS es doblemente crítico: la key policy debe permitir explícitamente a la cuenta externa, no basta la identity policy.
3. **IAM Identity Center (SSO)**: para humanos, permission sets que se materializan como roles en cada cuenta; elimina usuarios IAM.

En entrevista destaco `aws:PrincipalOrgID` como condición en resource policies: permite "cualquier principal de mi organización" sin mantener listas de cuentas, y **Access Analyzer** para detectar cualquier resource policy que abra acceso fuera de la zona de confianza.

---

## 6. ECS vs EKS vs Lambda vs Fargate: criterios de elección de cómputo
**Categoría:** Cómputo · **Tipo:** Conceptual

### 📝 Respuesta resumen
Fargate no compite con ECS/EKS: es el modo serverless de ejecutar sus contenedores. La decisión real es: **Lambda** para cargas event-driven, picos irregulares y ejecuciones <15 min; **ECS (idealmente con Fargate)** para microservicios contenedorizados con mínima carga operativa; **EKS** cuando necesitas el ecosistema Kubernetes (operators, Helm, portabilidad, equipos con expertise K8s). El costo, el patrón de tráfico y la madurez del equipo deciden.

### 📖 Respuesta detallada
**Lambda**: facturación por ms de ejecución (GB-segundo, ~$0.0000167/GB-s más $0.20 por millón de requests), escalado automático a miles de ejecuciones concurrentes (1,000 de límite soft por cuenta, ampliable a decenas de miles; burst de 1,000/10s por función desde 2023), timeout máximo **15 minutos**, memoria 128 MB–10 GB (la CPU escala proporcionalmente: ~1 vCPU a 1,769 MB), payload síncrono de 6 MB, /tmp hasta 10 GB. Ideal: APIs con tráfico irregular, procesamiento de eventos (S3, SQS, DynamoDB Streams), glue code. Contras: cold starts (ver archivo 2), coste elevado a alta utilización sostenida (una Lambda al 100% de uso constante cuesta varias veces más que Fargate equivalente), límite de 15 min, y el modelo de conexiones a bases relacionales exige RDS Proxy.

**ECS**: orquestador propietario de AWS, sin costo de control plane, integración nativa con ALB, Cloud Map, IAM (task roles con granularidad por task). Operativamente muy simple: task definitions JSON, services con auto scaling por CPU/memoria/métricas custom. Es mi default para equipos que "solo quieren correr contenedores".

**EKS**: Kubernetes gestionado; el control plane cuesta **$0.10/hora (~$73/mes)** por cluster. Lo eliges cuando necesitas: CRDs y operators (Kafka, bases de datos, ArgoCD, Istio), estandarización multi-cloud/on-prem, workloads que asumen K8s (Airflow en KubernetesExecutor, Spark on K8s), o una plataforma interna sobre K8s. El costo real de EKS no es el control plane sino la **operación**: upgrades de versión cada ~12 meses (soporte estándar de 14 meses por versión, luego soporte extendido con recargo a $0.60/h), gestión del VPC CNI y agotamiento de IPs, add-ons, RBAC. Sin un equipo de plataforma, EKS es sobre-ingeniería para 5 microservicios.

**Fargate** (para ECS o EKS): elimina la gestión de EC2 (AMIs, patching, bin-packing). Precio ~$0.04048/vCPU-hora y ~$0.004445/GB-hora (~$36/mes por 1 vCPU/2 GB); un ~20% más caro que EC2 equivalente bien utilizado, pero suele salir más barato en la práctica porque los clusters EC2 rara vez superan 50-60% de utilización. Limitaciones de Fargate: sin GPUs (en ECS), sin DaemonSets (en EKS), sin privileged containers, tamaño máximo 16 vCPU/120 GB, y almacenamiento efímero de 20 GB (ampliable a 200 GB).

Mi framework de decisión en entrevista: (1) ¿ejecución <15 min y event-driven o tráfico con valles profundos? → Lambda. (2) ¿Contenedores y equipo pequeño? → ECS Fargate. (3) ¿Necesidad demostrable del ecosistema K8s o equipo de plataforma existente? → EKS (Fargate para cargas spiky, managed node groups + Karpenter para el resto). (4) Cargas sostenidas y predecibles → EC2/nodos con Savings Plans (hasta 72% de descuento) o Graviton (~20% mejor precio/rendimiento).

---

## 7. ALB vs NLB vs API Gateway: exposición de servicios
**Categoría:** Networking / Integración · **Tipo:** Conceptual

### 📝 Respuesta resumen
ALB opera en capa 7: routing por path/host/headers, WebSockets, gRPC, integración con ECS/EKS y autenticación OIDC; ideal como frontera de microservicios y webs. NLB opera en capa 4: millones de RPS, latencia ultra baja (~100 µs), IPs estáticas, preservación de IP origen y TLS passthrough; ideal para TCP/UDP, PrivateLink y tráfico extremo. API Gateway añade gestión de API: auth (Cognito/JWT/Lambda authorizers), throttling por API key, caché y modelo pay-per-request; ideal para APIs públicas serverless.

### 📖 Respuesta detallada
**ALB (Application Load Balancer)**: balanceo L7 con reglas por host, path, headers, query strings y métodos; pesos por target group (base de los despliegues canary); soporte HTTP/2, gRPC y WebSockets; autenticación integrada con Cognito/OIDC (descarga a la app de validar tokens); target groups de tipo instance, IP (imprescindible para Fargate y pods de EKS con el AWS Load Balancer Controller) y Lambda. Costo: ~$0.0225/hora (~$16/mes) + LCUs (~$0.008/LCU-hora; una LCU = 25 conexiones nuevas/s, 3,000 activas, 1 GB/h a targets EC2, 1,000 evaluaciones de reglas/s). Detalles senior: los targets se registran por IP en cada AZ, cross-zone viene incluido gratis en ALB, los health checks matan tasks lentas en arrancar si no ajustas `healthCheckGracePeriod`, y el idle timeout default de 60 s corta long-polling si no se sube.

**NLB (Network Load Balancer)**: balanceo L4 (TCP/UDP/TLS) con latencia de microsegundos, escalado a millones de RPS sin pre-warming, **IP estática o Elastic IP por AZ** (clave para whitelisting de clientes), preservación de la IP de origen, y es el único soporte para **PrivateLink endpoint services**. Soporta TLS termination con ACM o passthrough (cuando la app necesita mTLS de extremo a extremo). No tiene reglas L7 ni WAF. Cross-zone está deshabilitado por defecto (y activarlo cobra transferencia cross-AZ). Casos típicos: brokers (Kafka, MQTT), bases de datos expuestas, gaming, y fachada de PrivateLink.

**API Gateway** (REST y HTTP APIs): gestión completa de APIs con throttling (default 10,000 RPS por cuenta/región, burst 5,000 — límite compartido que sorprende en incidentes), API keys y usage plans, validación de requests, transformaciones (VTL en REST), caché integrado (0.5–237 GB), authorizers Lambda/Cognito/JWT/IAM, y timeout máximo de **29 segundos** (ampliable bajo petición desde 2024, a cambio de reducir cuota de RPS). Precio: HTTP APIs ~$1.00/millón de requests; REST APIs ~$3.50/millón. HTTP APIs son ~70% más baratas y suficientes casi siempre; REST APIs aportan caché, WAF directo, request validation, API keys y endpoints privados.

Patrones de combinación: API Gateway → VPC Link → ALB/NLB interno para exponer contenedores con gestión de API; ALB público directo cuando el volumen es alto y no necesitas usage plans (a >100M requests/mes el ALB es mucho más barato que API Gateway); NLB delante de ALB ya no es necesario para IP estática, existe Global Accelerator. Error común: elegir API Gateway "por defecto" para tráfico interno servicio-a-servicio de alto volumen, pagando por millón de requests algo que un ALB interno hace por una fracción del costo.

---

## 8. RDS vs Aurora: cuándo pagar la prima de Aurora
**Categoría:** Bases de datos · **Tipo:** Conceptual

### 📝 Respuesta resumen
RDS es el motor community (MySQL, PostgreSQL, etc.) gestionado sobre EBS con réplicas por replicación nativa. Aurora reimplementa el storage: capa distribuida con 6 copias en 3 AZ, hasta 15 réplicas con ~10-20 ms de lag, failover en ~30 s, storage autoescalable hasta 128 TiB y features únicos (Serverless v2, Global Database, cloning). Aurora cuesta ~20% más por instancia más $0.20/millón de I/O; se justifica con alta disponibilidad exigente, muchas réplicas de lectura o necesidad de sus features.

### 📖 Respuesta detallada
**Arquitectura**: en RDS clásico, cada instancia tiene su volumen EBS; Multi-AZ replica síncronamente a una standby (no legible en el modo clásico; el modo **Multi-AZ DB Cluster** moderno da 2 standbys legibles y failover en ~35 s). Las read replicas usan replicación lógica/binlog asíncrona con lag potencialmente de segundos o minutos bajo carga. En **Aurora**, cómputo y storage están desacoplados: el storage es un servicio distribuido que mantiene **6 copias en 3 AZs** (quórum 4/6 para escritura, 3/6 para lectura), solo se envían redo log records por red (no páginas completas), y las réplicas leen del mismo storage compartido, por eso su lag es de ~10-20 ms y el failover promociona una réplica en ~30 segundos (o casi transparente con RDS Proxy manteniendo conexiones).

**Capacidades diferenciales de Aurora**: hasta **15 read replicas** con endpoint de lectura balanceado (RDS: 5-15 según motor, con lag mayor); **Global Database** (réplica física a otras regiones con lag <1 s y RPO ~1 s, promoción de región secundaria en ~1 min — argumento decisivo para DR agresivo); **Serverless v2** (escala en incrementos de 0.5 ACU en segundos, ideal para cargas variables; desde 2024 puede escalar a 0, y 0.5 ACU encendido 24/7 cuesta ~$43/mes); **fast cloning** copy-on-write (clonar una BD de 10 TB en minutos para testing); **backtrack** en MySQL (rebobinar sin restore); storage que crece automáticamente hasta 128 TiB y se reduce al liberar espacio.

**Costos**: Aurora cobra instancia (~20-25% más cara que RDS equivalente), storage $0.10/GB-mes y **$0.20 por millón de I/Os** — este último es impredecible y puede dominar la factura en cargas write-heavy; para eso existe **Aurora I/O-Optimized** (~30% más de precio de instancia y storage, cero costo de I/O; conviene cuando el I/O supera ~25% de la factura Aurora). RDS con gp3 tiene costos totalmente predecibles: es la elección para cargas modestas y estables.

**Cuándo elijo RDS**: bases pequeñas/medianas con presupuesto ajustado, motores no soportados por Aurora (SQL Server, Oracle, MariaDB), compatibilidad exacta con una versión concreta, o entornos dev/test simples. **Cuándo Aurora**: necesidad de >2-3 réplicas, failover rápido demostrable, DR multi-región, cargas variables (Serverless v2), o equipos que sufren con el lag de réplicas.

Errores comunes: creer que Multi-AZ de RDS da réplicas de lectura (el standby clásico no es legible); no usar **RDS Proxy** con Lambda (agotamiento de `max_connections`, que en PostgreSQL depende de la memoria de la instancia); dimensionar por CPU ignorando que muchas cargas mueren antes por IOPS o conexiones; y no activar **Performance Insights** (gratis con 7 días de retención) desde el día uno.

---

## 9. DynamoDB: modelado single-table y particiones calientes
**Categoría:** Bases de datos · **Tipo:** Conceptual

### 📝 Respuesta resumen
DynamoDB exige modelar por patrones de acceso, no por entidades: en single-table design, varias entidades comparten tabla usando claves genéricas (PK/SK) y se recuperan relaciones completas con un solo Query. Cada partición física soporta 3,000 RCU y 1,000 WCU; una partition key con tráfico concentrado crea una hot partition y throttling aunque la capacidad agregada sobre. Se mitiga con claves de alta cardinalidad, write sharding y caché.

### 📖 Respuesta detallada
**Fundamentos**: DynamoDB particiona por hash de la partition key. Límites duros por partición física: **3,000 RCU y 1,000 WCU por segundo**. Un item ≤400 KB; particiones lógicas de 10 GB cuando hay LSIs. Una RCU = lectura fuertemente consistente de 4 KB/s (eventual: el doble); una WCU = escritura de 1 KB/s. Con adaptive capacity e "instant adaptive capacity", DynamoDB aísla items calientes en particiones propias, pero **nunca** por encima de 3,000/1,000 por clave: si una sola PK recibe 5,000 escrituras/s, hay throttling sí o sí.

**Single-table design**: la motivación es que DynamoDB no tiene joins y cada Query toca una sola clave. Se definen atributos genéricos `PK` y `SK` y se sobrecargan: `PK=USER#123, SK=PROFILE`; `PK=USER#123, SK=ORDER#2026-08-01#o-789`; `PK=ORDER#o-789, SK=ITEM#1`. Un Query con `PK=USER#123` y `begins_with(SK, "ORDER#")` trae los pedidos del usuario en una sola llamada, pre-joined. Los **GSIs** (hasta 20 por tabla) dan patrones de acceso adicionales recombinando claves (`GSI1PK=STATUS#pending, GSI1SK=fecha` para "pedidos pendientes por fecha"). Técnicas asociadas: índices sparse (solo items con el atributo aparecen en el GSI) y KSUIDs/ULIDs para orden temporal. El costo del single-table: rigidez ante patrones de acceso nuevos, curva de aprendizaje, y fricción con analytics (se exporta a S3 y se consulta con Athena). Con muchos patrones de acceso inciertos o equipos junior, multi-table es defendible; el propio equipo de DynamoDB hoy recomienda pragmatismo.

**Hot partitions**: causas típicas — PK de baja cardinalidad (`PK=fecha` en un sistema de logging: todo el tráfico del día en una partición), items célebres (el producto viral, el tenant gigante en multi-tenancy) y contadores globales. Diagnóstico: **CloudWatch Contributor Insights** para DynamoDB (muestra las claves más accedidas), métricas `ThrottledRequests` y `WriteThrottleEvents` por tabla y por GSI. Cuidado: **un GSI con throttling contrapresiona las escrituras de la tabla base**, un clásico olvidado. Mitigaciones: (1) rediseñar la clave añadiendo cardinalidad (`fecha#shardId` con shard aleatorio 0-9, "write sharding", leyendo con N queries en paralelo); (2) **DAX** o ElastiCache para lecturas calientes (DAX da microsegundos y absorbe las lecturas del item viral); (3) desacoplar escrituras con SQS delante; (4) para contadores, sharded counters.

**Capacidad y costo**: On-demand (~$0.625/millón de escrituras y $0.125/millón de lecturas tras la bajada de precios de nov 2024) vs provisioned con auto scaling (más barato a tráfico estable, con riesgo de throttling en picos porque el auto scaling tarda ~2 min en reaccionar). En entrevista cierro con: modela primero los access patterns, valida la cardinalidad de cada PK contra el límite de 1,000 WCU, y monitoriza Contributor Insights desde el día uno.

---

## 10. SQS vs SNS vs EventBridge: mensajería y eventos
**Categoría:** Integración · **Tipo:** Conceptual

### 📝 Respuesta resumen
SQS es una cola punto a punto: buffer con polling, retries y DLQ; desacopla productor de un único tipo de consumidor. SNS es pub/sub push con fan-out a muchos suscriptores (colas, Lambda, HTTP, móvil). EventBridge es un bus de eventos con filtrado por contenido, 100+ integraciones SaaS/AWS, schema registry, archive/replay y scheduler. Patrón estándar: EventBridge o SNS para fan-out → SQS por consumidor para buffering y resiliencia.

### 📖 Respuesta detallada
**SQS Standard**: throughput prácticamente ilimitado, at-least-once, orden best-effort. Mensajes hasta 256 KB (1 MB desde 2025; más grande vía patrón claim-check en S3), retención hasta 14 días (default 4), visibility timeout hasta 12 h, long polling de 20 s (activarlo siempre: reduce llamadas vacías y costo). **SQS FIFO**: orden estricto y deduplicación por `MessageDeduplicationId` en ventana de 5 minutos, agrupación por `MessageGroupId` (el paralelismo efectivo = número de group IDs); límite 300 TPS sin batching, 3,000 con batching, y modo high-throughput hasta ~70,000 TPS particionando por group ID. Precio ~$0.40/millón de requests (FIFO $0.50). Pieza clave: **DLQ con maxReceiveCount** para poison messages y redrive para reprocesar.

**SNS**: pub/sub con hasta 12.5M de suscripciones por topic, fan-out a SQS, Lambda, HTTP/S, email, SMS y push móvil. Entrega at-least-once, sin retención para consumidores caídos (por eso el patrón SNS→SQS: la cola aporta buffer, retries y DLQ por consumidor). Soporta **message filtering** por atributos y por payload, evitando que cada consumidor descarte lo que no le interesa. SNS FIFO encadena con SQS FIFO para fan-out ordenado. Precio ~$0.50/millón de publicaciones.

**EventBridge**: bus de eventos (default, custom y partner) con **reglas de filtrado por contenido del evento** (pattern matching sobre cualquier campo JSON: prefijos, rangos numéricos, anything-but), transformación de input, decenas de destinos incluyendo API destinations (HTTP con auth y rate limiting), **archive & replay** (reprocesar eventos históricos tras un bug), **schema registry** con descubrimiento automático, **Pipes** (point-to-point con filtrado y enriquecimiento, p. ej. DynamoDB Streams → filtro → Step Functions) y **Scheduler** (millones de schedules cron o puntuales, sustituto serio de cron jobs). Trade-offs: latencia media mayor que SNS (~cientos de ms vs decenas), throughput por defecto 10,000 eventos/s por región en PutEvents (soft), precio $1.00/millón de eventos custom, y **sin garantía de orden**. Es además la base de arquitecturas event-driven entre dominios: cada dominio publica eventos de negocio en un bus central (a menudo compartido entre cuentas) con reglas por consumidor.

**Cómo elijo**: comando dirigido a un único procesador con buffering → SQS. Fan-out simple de alta escala/baja latencia → SNS (+SQS). Eventos de dominio con enrutamiento por contenido, integración multi-cuenta o SaaS, replay y schemas → EventBridge. Error común: usar EventBridge como cola (no hace backpressure: si el target falla, reintenta hasta 24 h/185 intentos y luego descarta o manda a DLQ) o SNS sin SQS detrás para consumidores que pueden caerse.

---

## 11. Kinesis Data Streams vs MSK (Kafka): streaming de datos
**Categoría:** Integración / Streaming · **Tipo:** Conceptual

### 📝 Respuesta resumen
Kinesis Data Streams es streaming serverless nativo de AWS: shards con 1 MB/s de escritura y 2 MB/s de lectura, retención hasta 365 días, integración directa con Lambda y Firehose; operación mínima. MSK es Kafka gestionado: ecosistema completo (Kafka Connect, Streams, exactly-once transaccional, compactación), throughput superior y portabilidad, a cambio de gestionar brokers, particiones y tuning. Kinesis para simplicidad AWS-native; MSK cuando ya hay ecosistema Kafka o se necesitan sus semánticas.

### 📖 Respuesta detallada
**Kinesis Data Streams**: la unidad es el **shard**: 1 MB/s o 1,000 records/s de ingesta y 2 MB/s de lectura compartida entre consumidores (con polling, límite de 5 GetRecords/s por shard → varios consumidores se reparten throughput y sube la latencia). **Enhanced Fan-Out** da 2 MB/s dedicados por consumidor con push HTTP/2 y ~70 ms de latencia, a ~$0.015/consumer-shard-hora más retrieval. Retención 24 h por defecto, extensible a 7 días y hasta 365 (con costo extra). Records de hasta 1 MB. Orden garantizado **por partition key dentro del shard**. Dos modos: provisioned (~$0.015/shard-hora; el resharding —split/merge— es responsabilidad tuya) y **on-demand** (tarifa por stream-hora más ~$0.08/GB ingerido; escala automáticamente hasta el doble del pico previo). Integraciones nativas: Lambda con event source mapping (batching, ventanas de tumbling, parallelization factor hasta 10 por shard, bisect on error), Firehose para aterrizar en S3/Redshift, Managed Flink para procesamiento con estado.

**MSK**: Kafka real gestionado (aprovisionado por brokers, o **MSK Serverless** con límites de 200 MB/s in / 400 MB/s out por cluster). Aporta lo que Kinesis no tiene: **transacciones exactly-once** entre topics, **log compaction** (estado tipo changelog), Kafka Connect (cientos de conectores), Kafka Streams/ksqlDB, consumer groups con rebalanceo maduro, miles de particiones, retención larga barata con tiered storage, y compatibilidad total con clientes y herramientas Kafka existentes. Costos: brokers desde ~$0.21/hora (kafka.m5.large): un cluster mínimo de producción de 3 brokers ronda $450-500/mes más storage; y hay que dimensionar particiones, replication factor y vigilar consumer lag, under-replicated partitions y disco.

**Decisión**: elijo **Kinesis** cuando el equipo es pequeño, el ecosistema es AWS-first (Lambda como consumidor, Firehose a S3), el throughput es moderado y no se necesitan transacciones ni compactación: el costo operativo casi nulo gana. Elijo **MSK** cuando hay inversión previa en Kafka (apps, conectores, conocimiento), se requiere exactly-once transaccional o compactación, throughput muy alto sostenido (Kafka escala más barato por MB a gran volumen), retención larga como source of truth, o portabilidad multi-cloud.

Errores comunes: en Kinesis, partition keys de baja cardinalidad (hot shards con `ProvisionedThroughputExceededException`, diagnosticable con métricas enhanced a nivel de shard), ignorar que los consumidores comparten los 2 MB/s, y olvidar que el resharding no rebalancea datos históricos; en MSK, subestimar el tuning (un número insuficiente de particiones limita el paralelismo de consumo para siempre sin repartición manual).

---

## 12. Step Functions: orquestación de workflows
**Categoría:** Integración / Orquestación · **Tipo:** Conceptual

### 📝 Respuesta resumen
Step Functions orquesta workflows como máquinas de estados (ASL): pasos con retries y backoff configurables por estado, catch de errores, paralelismo (Parallel y Map distribuido sobre millones de items), esperas de hasta un año y callbacks con task tokens. Standard workflows para procesos largos y auditables (exactly-once por transición, hasta 1 año); Express para alto volumen y corta duración (at-least-once, 5 min, mucho más barato por volumen). Es la pieza clave para Sagas y procesos de negocio multi-servicio.

### 📖 Respuesta detallada
**Modelo**: defines una máquina de estados en Amazon States Language (JSON) con estados Task (llamar Lambda, ECS, o 220+ servicios vía integraciones SDK directas — sin Lambda intermedia para un `dynamodb:PutItem` o `sns:Publish`), Choice, Parallel, Map, Wait, Pass y Succeed/Fail. Cada Task define `Retry` (por tipo de error, con `IntervalSeconds`, `BackoffRate`, `MaxAttempts` y jitter) y `Catch` para rutas de compensación: esto externaliza la lógica de resiliencia del código de negocio, que es el argumento central frente a "orquestar con código dentro de una Lambda".

**Standard vs Express**: **Standard** — duración hasta **1 año**, semántica exactly-once por transición, historial completo de ejecución auditable en consola, precio **$25 por millón de transiciones de estado** (workflow de 10 pasos × 1M ejecuciones ≈ $250: caro a volumen). Soporta **callbacks con task token** (`waitForTaskToken`): el workflow se pausa hasta que un humano o sistema externo llama `SendTaskSuccess` (ideal para aprobaciones), y `.sync` para esperar jobs (ECS RunTask, Batch, otro Step Function). **Express** — máximo **5 minutos**, at-least-once (los pasos pueden re-ejecutarse: exige idempotencia), sin historial persistente (logs a CloudWatch), precio por ejecuciones y GB-s (~$1 por millón de ejecuciones cortas): órdenes de magnitud más barato para event processing de alto volumen. Patrón mixto: Standard como orquestador padre que invoca workflows Express anidados para las partes de alto volumen.

**Map distribuido**: procesa hasta millones de items (p. ej. objetos de un bucket S3 o filas de un CSV) con hasta 10,000 ejecuciones hijas en paralelo y control de tolerancia a fallos por porcentaje. Sustituye a "Lambda que hace fan-out a SQS" para batch masivo.

**Límites relevantes**: payload entre estados de **256 KB** (el clásico error: pasar datos grandes entre pasos; la solución es claim-check: guardar en S3 y pasar la referencia), historial de 25,000 eventos por ejecución Standard (workflows con bucles largos deben arrancar una nueva ejecución, patrón continue-as-new) y 1,000,000 de ejecuciones abiertas.

**Casos de uso senior**: **Sagas** con compensaciones (ver archivo 2), pipelines de ETL/ML, provisioning multi-paso, human-in-the-loop, y procesos donde la visibilidad operativa de "en qué paso está cada pedido" tiene valor directo. **Cuándo no usarlo**: coreografía simple entre dos servicios (un evento de EventBridge basta y no acopla), flujos de latencia crítica en el request path síncrono (añade decenas de ms y costo), o lógica que cambia tan rápido que el ciclo de despliegue del ASL estorba. Error común: meter lógica de negocio compleja en Choice states con JSONPath ilegible en vez de en código; la máquina debe orquestar, no computar.

---

## 13. ElastiCache: Redis vs Memcached y patrones de caching
**Categoría:** Bases de datos / Performance · **Tipo:** Conceptual

### 📝 Respuesta resumen
ElastiCache ofrece Redis/Valkey (estructuras de datos ricas, replicación, cluster mode, persistencia, pub/sub, Lua) y Memcached (cache pura multihilo, más simple, sin replicación). Para casi todo caso moderno la respuesta es Redis/Valkey, en cluster mode para escalar escrituras. Los patrones clave son cache-aside con TTL + jitter, write-through para consistencia, y protección contra thundering herd. Los riesgos senior: hot keys, ausencia de plan de invalidación y tratar la caché como fuente de verdad.

### 📖 Respuesta detallada
**Redis/Valkey vs Memcached**: Redis aporta estructuras (hashes, sorted sets para rankings, streams, sets, HyperLogLog), replicación con hasta 5 réplicas y failover automático Multi-AZ (~15-30 s; DNS del primary endpoint se actualiza), **cluster mode** (hasta 500 shards, particionando el keyspace en 16,384 slots — necesario cuando las escrituras o la memoria superan un nodo), persistencia (RDB/AOF), transacciones, Lua scripting y pub/sub. Memcached es multihilo (aprovecha mejor instancias grandes para cache pura), pero sin replicación ni failover: perder un nodo pierde su caché. Hoy el default razonable es **Valkey** (fork open-source de Redis, ~20-30% más barato en ElastiCache). También existe **ElastiCache Serverless** (~$0.125/GB-hora más ECPUs, escala en segundos, mínimo ~$90/mes por el GB mínimo): útil para cargas variables sin capacity planning.

**Patrones**: (1) **Cache-aside** (lazy loading): la app lee de caché; en miss, lee de BD y puebla con TTL. Simple y robusto, pero permite datos stale y el primer acceso paga la latencia. Siempre añadir **jitter al TTL** (TTL ± aleatorio) para evitar expiración masiva sincronizada (cache stampede). (2) **Write-through**: cada escritura actualiza BD y caché; datos frescos a cambio de escrituras dobles y datos cacheados que quizá nunca se lean. (3) **Protección thundering herd**: ante un miss de una clave muy caliente, usar un lock distribuido (SET NX EX) para que solo un proceso regenere, o servir stale mientras se refresca en background. (4) **Invalidación por eventos**: publicar cambios de la BD (CDC/DynamoDB Streams) y borrar claves afectadas, en lugar de confiar solo en TTLs largos.

**Casos de uso más allá de cache**: rate limiting (INCR + EXPIRE o sliding window con sorted sets), sesiones, leaderboards, locks distribuidos (con las salvedades de Redlock), colas ligeras y pub/sub efímero.

**Dimensionamiento y límites**: nodos hasta cientos de GB (r7g); vigilar `DatabaseMemoryUsagePercentage`, `Evictions` (si crece, faltan memoria o TTLs), `EngineCPUUtilization` (Redis es single-threaded para comandos: un nodo al 90% de engine CPU está saturado aunque la CPU total parezca baja), `CurrConnections` y latencia por comando. **Hot keys**: una clave muy caliente satura un shard concreto en cluster mode; se mitiga con réplicas de lectura, client-side caching o replicando la clave con sufijos. Errores comunes: no usar connection pooling (Redis sufre con conexiones efímeras masivas de Lambda: usar multiplexing o ElastiCache Serverless), claves sin TTL que crecen hasta OOM y provocan evictions erráticas, comandos O(N) (`KEYS`, `SMEMBERS` de sets gigantes) en producción, y tratar Redis como store durable sin AOF ni estrategia de reconstrucción: la caché debe poder perderse sin incidente, solo con degradación.

Costo de referencia: cache.r7g.large (~13 GB) ≈ $0.22/hora ≈ $160/mes por nodo; un cluster con réplica en 2 AZ duplica eso. Comparar siempre contra DAX si el origen es DynamoDB (DAX es transparente para el código, con caché de items y de queries).

---

## 14. S3: consistencia, clases de almacenamiento y performance
**Categoría:** Almacenamiento · **Tipo:** Conceptual

### 📝 Respuesta resumen
S3 es fuertemente consistente (read-after-write para todas las operaciones, incluidas sobrescrituras y listados) desde diciembre de 2020. Ofrece 11 nueves de durabilidad y clases desde Standard hasta Glacier Deep Archive, con Intelligent-Tiering como default sensato para acceso impredecible. En performance: 3,500 PUT/5,500 GET por segundo por prefijo, escalando con prefijos paralelos; multipart upload y byte-range fetches para objetos grandes. Los errores clásicos: ignorar costos de request y de lifecycle en objetos pequeños, y listados masivos sin inventario.

### 📖 Respuesta detallada
**Consistencia**: desde dic-2020, S3 es **fuertemente consistente**: tras un PUT (nuevo o sobrescritura) o DELETE, cualquier GET o LIST posterior refleja el cambio. Esto eliminó los workarounds históricos (EMRFS consistent view, reintentos tras PUT). Lo que S3 **no** da: atomicidad multi-objeto ni locking — dos PUTs concurrentes al mismo key: gana el último timestamp; para control de concurrencia se usan conditional writes (`If-None-Match`, `If-Match` con ETag, disponibles desde 2024) o una capa transaccional (S3 Tables/Iceberg, DynamoDB como lock).

**Durabilidad y clases**: 99.999999999% (11 nueves) de durabilidad en todas las clases (réplica en ≥3 AZs, salvo One Zone). Clases y precios aproximados us-east-1: **Standard** $0.023/GB-mes; **Standard-IA** $0.0125 (mínimo 30 días, retrieval $0.01/GB); **One Zone-IA** $0.01; **Glacier Instant Retrieval** $0.004 (mínimo 90 días, acceso en ms); **Glacier Flexible** $0.0036 (minutos-horas); **Deep Archive** $0.00099 (12-48 h, mínimo 180 días); **Intelligent-Tiering**: mueve objetos automáticamente entre tiers según acceso ($0.0025/1,000 objetos-mes de monitoreo, sin cargos de retrieval ni de cambio de tier) — mi default para datos de acceso impredecible; no monitoriza objetos <128 KB. **Express One Zone**: clase de alto rendimiento single-AZ con latencia de milisegundo único y cientos de miles de RPS, ~$0.11/GB-mes, para ML training y datos calientes intensivos.

**Performance**: el límite es **por prefijo**: 3,500 PUT/COPY/POST/DELETE y 5,500 GET/HEAD por segundo, y escala automáticamente (con posibles 503 transitorios durante el escalado, que exigen retry con backoff). Para throughput extremo se paraleliza sobre múltiples prefijos (ya no importa la aleatorización de los primeros caracteres como antaño, pero sí repartir en prefijos distintos). Objetos hasta 5 TB; **multipart upload** obligatorio en la práctica >100 MB (partes de 5 MB-5 GB, paralelizables, con reintento por parte); **byte-range fetches** para descargas paralelas. Latencia de primera byte: decenas de ms; para contenido global, CloudFront delante (además abarata: el tráfico S3→CloudFront es gratis y CloudFront→internet es más barato que S3→internet, ~$0.085 vs $0.09/GB).

**Costos ocultos que menciono**: requests ($0.005/1,000 PUT, $0.0004/1,000 GET — millones de objetos pequeños hacen que el costo de requests y de transiciones de lifecycle supere al de storage; cada transición cuesta $0.01-0.05/1,000 objetos), mínimos de tamaño facturable (128 KB en IA), y transferencia de salida ($0.09/GB los primeros TB). **Listados masivos**: `ListObjectsV2` devuelve 1,000 keys por llamada; para inventariar millones de objetos usar **S3 Inventory** (reporte diario a Parquet/CSV) o el propio catálogo en una BD, nunca listados recursivos en el request path. Otras piezas senior: versioning + lifecycle de versiones no actuales (facturas sorpresa por versiones retenidas), Object Lock (WORM para compliance), replicación CRR/SRR (RTC con 15 min de SLA), S3 Batch Operations para operaciones masivas, y presigned URLs para upload/download directo del cliente sin pasar por el backend.

---

## 15. Multi-AZ vs multi-región: alta disponibilidad real
**Categoría:** Arquitectura / Resiliencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
Multi-AZ es el default no negociable: AZs son datacenters independientes con latencia submilisegundo, y los servicios gestionados (ALB, ASG, Aurora, SQS) lo hacen casi gratis en complejidad. Multi-región multiplica complejidad y costo: replicación de datos con conflictos o lag, duplicación de infraestructura y failover de DNS; solo se justifica por DR con RTO/RPO agresivos, latencia a usuarios globales o requisitos regulatorios de residencia de datos. La pregunta senior no es "¿multi-región?" sino "¿qué RTO/RPO paga el negocio?".

### 📖 Respuesta detallada
**Multi-AZ**: una región tiene ≥3 AZs, físicamente separadas (kilómetros), con redes y energía independientes y latencia entre ellas <1-2 ms. Diseño estándar: ALB en ≥2 AZs, Auto Scaling Group o servicios ECS repartidos en 3 AZs, Aurora/RDS Multi-AZ, y colas/buses (SQS, SNS, EventBridge, DynamoDB, S3) que ya son multi-AZ por diseño. Costos a vigilar: transferencia cross-AZ ($0.01/GB en cada dirección) — con data-heavy workloads conviene alinear el tráfico por AZ (p. ej. "zone-aware routing" en EKS con Topology Aware Hints, o consumidores Kafka con rack awareness). Práctica senior: **static stability** — dimensionar para sobrevivir la pérdida de una AZ sin necesidad de escalar en el momento (N+1 por AZ), porque durante una caída de AZ las APIs de control (EC2 RunInstances) están saturadas por todos los clientes intentando lo mismo.

**Multi-región** introduce tres problemas duros: (1) **datos**: replicación asíncrona (Aurora Global Database con RPO ~1 s; DynamoDB Global Tables activo-activo con last-writer-wins y posibilidad de pisar escrituras concurrentes; S3 CRR con RTC de 15 min) — activo-activo exige diseñar resolución de conflictos o particionar usuarios por región (home region); (2) **enrutamiento**: Route 53 (failover, latency o geolocation routing, con health checks) o Global Accelerator (anycast, failover en segundos sin TTLs de DNS cacheados); (3) **operación**: desplegar todo por IaC en N regiones, probar el failover regularmente (game days) y evitar dependencias ocultas de una sola región (¡incluida us-east-1 para IAM/CloudFront/certificados globales y muchos servicios de control!).

**Cuándo multi-región**: requisito regulatorio (residencia de datos UE, DR bancario), RTO < minutos ante caída regional completa (evento raro: caídas regionales totales son excepcionales, las parciales por servicio son más comunes), latencia a usuarios en varios continentes (aunque CloudFront + edge resuelve el caso de solo-lectura sin multi-región de backend), o compromisos de SLA extremos. La mayoría de negocios quedan bien servidos con multi-AZ + backups cross-región (aws backup copy) + un plan pilot-light.

**Costos**: multi-región activo-activo duplica cómputo y añade transferencia inter-región ($0.02/GB típico) y replicación. Activo-pasivo warm standby puede correr al 20-30% de capacidad. En entrevista siempre reconduzco a negocio: cada nueve adicional de disponibilidad multiplica el costo; 99.9% (8.7 h/año) vs 99.99% (52 min/año) vs 99.999% (5 min/año) son órdenes de magnitud distintos de inversión, y un sistema multi-región mal ensayado da menos disponibilidad que uno multi-AZ bien operado, porque el mecanismo de failover no probado es en sí mismo la mayor fuente de riesgo.

---

## 16. Disaster Recovery: RTO/RPO y las cuatro estrategias
**Categoría:** Arquitectura / Resiliencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
RTO es cuánto tiempo puedes estar caído; RPO cuántos datos puedes perder. Las cuatro estrategias AWS, de barata a cara: backup & restore (RTO horas, RPO horas), pilot light (RTO decenas de minutos, datos replicados y cómputo apagado), warm standby (RTO minutos, réplica a escala reducida) y multi-site activo-activo (RTO ~cero, costo ~2x). La elección es una decisión de negocio por workload, no una global; y una estrategia de DR no ensayada con game days no existe.

### 📖 Respuesta detallada
**Definiciones**: **RPO** (Recovery Point Objective): máxima pérdida de datos tolerable, determinada por la frecuencia de replicación/backup. **RTO** (Recovery Time Objective): tiempo máximo hasta restaurar servicio. Se definen **por workload** con el negocio (el checkout no tolera lo mismo que el data warehouse) y de ellos se deriva la estrategia y el presupuesto.

**1. Backup & Restore** (RPO: horas; RTO: 4-24 h): AWS Backup centraliza snapshots (EBS, RDS, DynamoDB, EFS, S3) con copia automática cross-región y cross-cuenta (esto último crítico: un atacante con acceso a la cuenta no debe poder borrar los backups — backup vault lock/WORM). Lo más barato (~storage de snapshots). El RTO real lo domina reconstruir infraestructura: sin IaC completo (CloudFormation/Terraform/CDK) el "restore" son días. Probar restores periódicamente: un backup no restaurado es una hipótesis.

**2. Pilot Light** (RPO: segundos-minutos; RTO: decenas de minutos-horas): los **datos** se replican continuamente a la región DR (read replica cross-región de RDS, Aurora Global Database, DynamoDB Global Tables, S3 CRR) pero el cómputo está apagado o a cero (ASGs con desired=0, imágenes en ECR replicadas, IaC listo para aplicar). En failover: promover la réplica, escalar cómputo, cambiar Route 53. Costo: ~storage + réplica de BD (quizá 10-15% del costo de prod).

**3. Warm Standby** (RPO: segundos; RTO: minutos): réplica funcional completa a escala mínima (p. ej. 10% de capacidad) que ya sirve tráfico sintético/health checks. Failover = escalar + repuntar DNS/Global Accelerator. Costo 25-40% de prod. Es el sweet spot para la mayoría de sistemas críticos.

**4. Multi-site activo-activo** (RPO ~0; RTO: segundos): ambas regiones sirven tráfico real. Exige resolver escrituras multi-región (Global Tables con reconciliación, particionamiento por home region, o CQRS con escrituras en una región y lecturas en todas). Costo ≥200% más complejidad de ingeniería permanente.

**Piezas transversales**: Route 53 Application Recovery Controller (readiness checks y routing controls con SLA de panel de control extremo), health checks profundos (no solo "el ALB responde" sino "una transacción sintética completa funciona"), **runbooks automatizados** (el failover manual a las 3 AM falla), y **game days** trimestrales que midan RTO/RPO reales contra los objetivos. Fallos comunes que cito: DR con réplica de datos pero sin réplicas de **secretos, parámetros, colas y configuración**; dependencias en servicios single-region no replicados (un Redis con estado de sesión); cuotas de servicio no elevadas en la región DR (llegas al failover y no puedes levantar 200 instancias porque la cuota es 20); y drift entre regiones por despliegues que solo van a la primaria.

---

## 17. Well-Architected Framework: los seis pilares aplicados
**Categoría:** Arquitectura / Gobernanza · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los seis pilares: excelencia operativa, seguridad, fiabilidad, eficiencia de rendimiento, optimización de costos y sostenibilidad. No es una checklist teórica sino una herramienta de revisión periódica (Well-Architected Tool) que descubre riesgos concretos: falta de runbooks, IAM sobredimensionado, sin pruebas de recuperación, recursos sobredimensionados. Un senior lo usa como lenguaje común para priorizar deuda de arquitectura con el negocio.

### 📖 Respuesta detallada
**1. Excelencia operativa**: operaciones como código (IaC en todo: CloudFormation/CDK/Terraform, nada por consola en prod), observabilidad orientada a métricas de negocio, despliegues pequeños, frecuentes y reversibles, runbooks y playbooks escritos, y post-mortems sin culpa (COE en jerga AWS). Pregunta que hago a mis equipos: "¿puedes reconstruir prod desde cero solo con el repo?".

**2. Seguridad**: identidad primero (federación, roles temporales, MFA, cero access keys estáticas), defensa en profundidad (SCPs → boundaries → SG/NACL → cifrado), trazabilidad total (CloudTrail organizacional inmutable, GuardDuty, Security Hub, Config), cifrado por defecto en tránsito y reposo (KMS con key policies revisadas), y automatización de respuesta (EventBridge → Lambda de remediación). 

**3. Fiabilidad**: diseñar asumiendo el fallo — multi-AZ, static stability, límites de servicio monitorizados (Service Quotas con alarmas: quedarse sin IPs o sin ENIs es un incidente autoinfligido), backpressure y throttling propios, circuit breakers, bulkheads, retries con backoff+jitter y presupuestos de reintentos, y **pruebas de caos** (Fault Injection Service para matar AZs/instancias en game days). RTO/RPO definidos y ensayados.

**4. Eficiencia de rendimiento**: elegir el servicio correcto para el patrón (no todo es EC2: serverless, managed, edge), medir antes de optimizar (X-Ray, Performance Insights, CloudWatch RUM), revisar instancias de nueva generación (Graviton ~20% mejor precio/rendimiento) y experimentar barato (el costo de probar dos tipos de instancia una semana es despreciable frente a acertar).

**5. Optimización de costos**: etiquetado obligatorio y cost allocation tags, Savings Plans/RIs para la base estable (hasta 72%), Spot para lo interrumpible (hasta 90%), apagar entornos no productivos fuera de horario (~70% del tiempo semanal es no laborable), right-sizing continuo (Compute Optimizer), y arquitectura consciente del costo de transferencia (el pilar donde más facturas he arreglado: NAT, cross-AZ, egress).

**6. Sostenibilidad**: maximizar utilización (menos servidores más llenos), regiones con energía renovable, Graviton, borrar datos que no se usan (lifecycle policies), y batch en horarios/regiones de menor intensidad de carbono.

**Cómo se usa de verdad**: revisiones Well-Architected por workload cada 6-12 meses con la **WA Tool** (gratuita), que genera lista de HRIs (high-risk issues) priorizables como backlog técnico. Lenses específicas (Serverless, SaaS, FTR para partners). En entrevista subrayo el uso político del framework: convierte "tenemos deuda técnica" (invisible para negocio) en "tenemos 7 riesgos altos de fiabilidad, estos 3 con probabilidad de causar un incidente con impacto de X horas de caída", que sí se prioriza.

---

## 18. Control de costos en AWS: de la visibilidad a la optimización
**Categoría:** FinOps · **Tipo:** Conceptual

### 📝 Respuesta resumen
El control de costos tiene tres capas: visibilidad (Cost Explorer, CUR/Data Exports con Athena, cost allocation tags por equipo/servicio), gobierno (Budgets con alertas y acciones, anomaly detection, políticas de tagging obligatorio) y optimización (Savings Plans para la base, Spot para lo interrumpible, right-sizing, storage lifecycle, y arquitectura: NAT/cross-AZ/egress). Los mayores ahorros suelen estar en compute sin compromiso de ahorro, entornos encendidos 24/7, transferencia de datos y storage sin lifecycle.

### 📖 Respuesta detallada
**Visibilidad primero**: sin atribución no hay optimización. **Cost allocation tags** activadas y forzadas (SCP o Config rule que impide crear recursos sin `team`/`service`/`env`), **Cost Categories** para agrupar, y **CUR 2.0/Data Exports** a S3 consultado con Athena/QuickSight para el detalle por recurso-hora que Cost Explorer no da. KPIs por equipo: costo por servicio, costo unitario (por pedido, por request, por tenant) — el costo absoluto sube con el éxito; el unitario es el que debe bajar.

**Gobierno**: **AWS Budgets** (alertas a 50/80/100% y forecast; budget actions pueden aplicar una SCP restrictiva o parar instancias), **Cost Anomaly Detection** (ML sobre patrones de gasto, alerta de desviaciones con root cause por servicio/cuenta — gratis y subvalorado), y límites estructurales: cuentas separadas por entorno/equipo (el aislamiento de cuentas es el mejor límite de blast radius de costos).

**Optimización de compute** (típicamente 50-70% de la factura): (1) **Savings Plans** — Compute SP (flexible entre EC2/Fargate/Lambda, hasta 66%) o EC2 Instance SP (hasta 72%) para la base estable; cubrir ~70-80% del uso estable, no el 100%. (2) **Spot** (hasta 90% de descuento) para batch, CI, workers idempotentes; con ASGs mixtos o Karpenter en EKS. (3) **Right-sizing** con Compute Optimizer (detecta infrautilización con datos reales; las instancias "por si acaso" al 5% de CPU son epidemia). (4) **Graviton**: ~20% mejor precio/rendimiento con esfuerzo de migración menor para JVM/Go/Python/Node. (5) Apagar dev/staging noches y fines de semana (Instance Scheduler): ~65-70% de ahorro en esos entornos.

**Transferencia de datos**, el rubro invisible: NAT Gateway $0.045/GB procesado (mitigar con VPC endpoints), cross-AZ $0.01/GB×2 (alinear consumidores por AZ), egress a internet $0.09/GB (CloudFront lo abarata y cachea), inter-región $0.02/GB (revisar replicaciones innecesarias). He visto facturas donde data transfer superaba al compute.

**Storage**: lifecycle policies en S3 (a IA/Glacier según acceso real medido con Storage Class Analysis o directamente Intelligent-Tiering), borrar snapshots EBS huérfanos y AMIs antiguas (snapshots incrementales se acumulan durante años), gp2→gp3 (~20% más barato con mejor baseline), y logs de CloudWatch con retención definida (default: infinita, $0.03/GB-mes ingerido + storage — logs de debug en prod a full volume son un clásico).

**Cultura**: revisión mensual de costos por equipo con su propia factura visible, unit economics en dashboards, y el principio FinOps de que el costo es un requisito no funcional más, presente en el diseño (elegir EventBridge vs Kinesis vs SQS también es una decisión de costo por millón de eventos). En entrevista cierro con un caso: la mayor reducción que he visto no vino de descuentos sino de arquitectura — eliminar polling agresivo, cachear, y borrar entornos zombis.
