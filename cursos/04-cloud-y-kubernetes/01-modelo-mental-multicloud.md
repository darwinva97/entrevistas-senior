# Módulo 1 · Modelo mental multicloud y equivalencias

> **Curso 04 · Cloud** · 120 min

## Por qué esto importa en la entrevista

Porque la pregunta real nunca es "¿qué es SQS?", sino **"¿cómo comunicarías estos dos servicios y por qué?"**. Quien piensa en bloques de construcción responde igual de bien en las tres nubes; quien memorizó nombres se queda mudo cuando le cambian el proveedor.

## Los 8 bloques y sus equivalencias

| Bloque | AWS | Azure | GCP |
|---|---|---|---|
| **Cómputo VM** | EC2 | Virtual Machines | Compute Engine |
| **Contenedores gestionados** | ECS / EKS / Fargate | ACA / AKS | Cloud Run / GKE |
| **Funciones** | Lambda | Functions | Cloud Functions / Run jobs |
| **Objetos** | S3 | Blob Storage | Cloud Storage |
| **SQL gestionado** | RDS / Aurora | SQL Database / Flexible Server | Cloud SQL / AlloyDB / Spanner |
| **NoSQL** | DynamoDB | Cosmos DB | Firestore / Bigtable |
| **Cola / eventos** | SQS + SNS / EventBridge / MSK / Kinesis | Service Bus / Event Grid / Event Hubs | Pub/Sub |
| **Identidad de carga** | IAM + IRSA | Entra ID + Managed Identity | IAM + Workload Identity |

Complementos que también preguntan: balanceo (ALB/NLB · App Gateway/Load Balancer · Cloud Load Balancing), secretos (Secrets Manager · Key Vault · Secret Manager), CDN (CloudFront · Front Door · Cloud CDN), observabilidad (CloudWatch/X-Ray · Monitor/App Insights · Cloud Monitoring/Trace), y analítica (Redshift/Athena · Synapse · BigQuery).

> **⚠️ Trampa:** decir "son equivalentes" sin matizar. Diferencias que suman puntos: **Cloud Run escala a cero y factura por request**, mientras que ECS/Fargate factura por tarea corriendo; **Pub/Sub no tiene orden global** (solo por clave de ordenación en la misma región) mientras que **SQS FIFO sí, con menor throughput**; **DynamoDB es key-value con límites de partición muy explícitos** frente a Cosmos DB, que ofrece cinco niveles de consistencia configurables; y **BigQuery no tiene equivalente exacto** en AWS (Athena + Redshift cubren partes).

## Los cuatro ejes de decisión

Cuando te pregunten "¿qué servicio usarías?", responde por ejes, no por nombre:

1. **Modelo de ejecución:** ¿trabajo continuo o a ráfagas? ¿Tolera arranque en frío? ¿Necesita estado en memoria o conexiones persistentes?
2. **Modelo de datos:** ¿accedes por clave o por consultas complejas? ¿Necesitas transacciones multi-entidad? ¿Qué patrón de acceso domina?
3. **Acoplamiento:** ¿síncrono (HTTP/gRPC) o asíncrono (cola/evento)? ¿Un consumidor o varios? ¿Necesitas reproducir el historial?
4. **Operación y costo:** ¿quién lo mantiene a las 3 a.m.? ¿Cuánto cuesta el mínimo (idle) y cuánto el pico?

**💬 Cómo lo dices:** *"Para este flujo necesito desacople y reproceso, así que quiero un log de eventos: en AWS sería MSK o Kinesis, en GCP Pub/Sub con suscripciones, en Azure Event Hubs. Si solo necesitara reparto de trabajo con reintentos, una cola simple (SQS/Service Bus) sería más barata y más fácil de operar."*

## Regiones, zonas y el mapa mental de la latencia

- **Región** = zona geográfica; **AZ** = datacenter (o grupo) independiente dentro de la región.
- Multi-AZ es **obligatorio y barato**: es la unidad de fallo real (un rack, un corte eléctrico, un incidente de red).
- Multi-región es **caro y complejo**: replicación asíncrona, conflictos de escritura, coste de egress, y una capa de enrutamiento. Solo con requisito real de RTO/RPO o de residencia de datos.
- **El egress se paga y el ingress no** (regla general): entre AZ, entre regiones y hacia Internet. Un patrón chatty entre AZ puede duplicar tu factura sin cambiar nada funcional. Lo mismo con el NAT Gateway: es uno de los mayores sumideros silenciosos de dinero en AWS.
- Latencias de referencia: intra-AZ < 1 ms; inter-AZ 1–2 ms; inter-región 20–200 ms según distancia. Para un usuario en Lima, `sa-east-1` (São Paulo) ronda los 30–40 ms y `us-east-1` unos 60–90 ms; llevar el frontend a una CDN cambia más la percepción que cualquier micro-optimización del backend.

## Modelo de responsabilidad compartida

El proveedor asegura *la nube*; tú aseguras *lo que pones en ella*. En la práctica, lo que te van a preguntar: quién parchea el sistema operativo (tú en EC2, el proveedor en Fargate/Cloud Run), quién cifra los datos (el proveedor da la herramienta; tú activas y gestionas las claves), quién configura la red y el IAM (tú, y ahí ocurren la mayoría de las brechas: buckets públicos, roles con `*`).

## Infraestructura como código

- **Terraform/OpenTofu** para multicloud; **CDK/Pulumi** si prefieres un lenguaje real; **CloudFormation/ARM-Bicep/Deployment Manager** para nativo.
- Lo que evalúan de verdad: **estado remoto con bloqueo**, separación por entornos, módulos versionados, `plan` en PR y `apply` en CI (nunca desde tu portátil), y **detección de drift**.
- Menciona la diferencia entre recursos inmutables (recrear) y mutables (actualizar in-place), y el peligro de `terraform destroy` sobre estado compartido. Un senior también habla de *quién puede aplicar qué* (permisos del pipeline, no del humano).

## Errores comunes que delatan a un no-senior

- Recitar nombres de servicios sin criterios de elección.
- Ignorar el costo del egress y del NAT.
- Proponer multi-región "para alta disponibilidad" sin RTO/RPO ni presupuesto.
- No saber que las funciones tienen límites duros (tiempo máximo, tamaño de payload, concurrencia).
- Guardar secretos en variables de entorno del repositorio en lugar del gestor de secretos.
- Hablar de IaC sin mencionar el estado y su bloqueo.

## 🧪 Laboratorio

1. **Tabla propia de equivalencias:** rellénala de memoria, luego corrígela. Añade una columna "en qué NO son equivalentes".
2. **Terraform mínimo:** despliega en dos nubes un servicio contenedorizado + una base de datos gestionada + una cola. Cuenta líneas y tiempo.
3. **Estima la factura** de ambos con las calculadoras oficiales para 1M de peticiones/día y 100 GB de egress. Identifica el componente dominante.
4. **Mide latencias reales** desde tu ubicación a 4 regiones distintas (`curl -w '%{time_connect}'`) y escribe qué región elegirías para usuarios en Perú/México y por qué.

## ✅ Autoevaluación

1. Traduce esta arquitectura de AWS a GCP y Azure: ALB → ECS Fargate → RDS + SQS + S3.
2. ¿En qué NO son equivalentes Cloud Run y Fargate?
3. ¿Cuándo cola simple y cuándo log de eventos?
4. ¿Qué costos suelen sorprender en la factura y por qué?
5. ¿Qué implica multi-región de verdad? ¿Cuándo lo recomendarías?
6. ¿Qué evalúas al revisar el Terraform de un equipo?

## 🎯 Preguntas del banco que ya puedes responder

- [`cloud/aws/01-fundamentos-y-arquitectura.md`](../../cloud/aws/01-fundamentos-y-arquitectura.md), [`cloud/azure/01-fundamentos-y-arquitectura.md`](../../cloud/azure/01-fundamentos-y-arquitectura.md), [`cloud/gcp/01-fundamentos-y-arquitectura.md`](../../cloud/gcp/01-fundamentos-y-arquitectura.md) — las preguntas de arquitectura general y elección de servicios

---

**Siguiente:** [Módulo 2 · Cómputo: contenedores y serverless](02-computo-contenedores-y-serverless.md)
