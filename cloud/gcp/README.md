# Entrevistas Senior — Arquitectura Cloud en GCP

Banco de preguntas para entrevistas técnicas de arquitectura cloud en Google Cloud Platform, orientado a perfiles senior de backend y microservicios. Cada pregunta incluye una **respuesta resumen** (30–60 segundos) y una **respuesta detallada** con servicios concretos, límites, costos, trade-offs y errores comunes. Los casos ([CASO]) siguen el formato: escenario → diagnóstico paso a paso (Cloud Monitoring, Cloud Trace, Cloud Logging) → solución → prevención.


> 🎓 **¿Te faltan bases para responder esto?** El curso [Cloud y Kubernetes](../../cursos/04-cloud-y-kubernetes/) enseña exactamente lo necesario, con laboratorios y autoevaluación.
> Ver también: [índice completo](../../INDICE.md) · [plan de estudio](../../PLAN-DE-ESTUDIO.md) · [glosario](../../GLOSARIO.md) · [inicio](../../README.md)

## Archivos

| Archivo | Contenido | Preguntas |
|---|---|---|
| [01-fundamentos-y-arquitectura.md](./01-fundamentos-y-arquitectura.md) | Fundamentos de GCP: jerarquía, IAM, redes, cómputo, datos, mensajería, resiliencia | 13 (todas conceptuales) |
| [02-microservicios-y-casos.md](./02-microservicios-y-casos.md) | Microservicios en GCP y casos de producción | 18 (6 conceptuales + 12 [CASO]) |

---

## Índice de preguntas

### 01 — Fundamentos y arquitectura

1. [Explica la jerarquía de recursos de GCP (Organización, Folders, Projects) y por qué importa en una empresa grande](./01-fundamentos-y-arquitectura.md#1-explica-la-jerarquía-de-recursos-de-gcp-organización-folders-projects-y-por-qué-importa-en-una-empresa-grande)
2. [IAM en GCP: roles, service accounts y mejores prácticas de mínimo privilegio](./01-fundamentos-y-arquitectura.md#2-iam-en-gcp-roles-service-accounts-y-mejores-prácticas-de-mínimo-privilegio)
3. [¿Qué es Workload Identity Federation y por qué elimina las claves de service account?](./01-fundamentos-y-arquitectura.md#3-qué-es-workload-identity-federation-y-por-qué-elimina-las-claves-de-service-account)
4. [VPC en GCP: Shared VPC vs VPC Peering vs Private Service Connect](./01-fundamentos-y-arquitectura.md#4-vpc-en-gcp-shared-vpc-vs-vpc-peering-vs-private-service-connect)
5. [GKE vs Cloud Run vs Cloud Functions vs App Engine: ¿cuándo eliges cada uno?](./01-fundamentos-y-arquitectura.md#5-gke-vs-cloud-run-vs-cloud-functions-vs-app-engine-cuándo-eliges-cada-uno)
6. [GKE Autopilot vs Standard: trade-offs reales en producción](./01-fundamentos-y-arquitectura.md#6-gke-autopilot-vs-standard-trade-offs-reales-en-producción)
7. [Cloud SQL vs Spanner vs Firestore vs Bigtable: criterios de elección, consistencia y particionado](./01-fundamentos-y-arquitectura.md#7-cloud-sql-vs-spanner-vs-firestore-vs-bigtable-criterios-de-elección-consistencia-y-particionado)
8. [Pub/Sub en profundidad: at-least-once, ordering keys, exactly-once y dead letter queues](./01-fundamentos-y-arquitectura.md#8-pubsub-en-profundidad-at-least-once-ordering-keys-exactly-once-y-dead-letter-queues)
9. [BigQuery: arquitectura, particionado/clustering y control de costos](./01-fundamentos-y-arquitectura.md#9-bigquery-arquitectura-particionadoclustering-y-control-de-costos)
10. [Cloud Load Balancing global: anatomía del External Application Load Balancer](./01-fundamentos-y-arquitectura.md#10-cloud-load-balancing-global-anatomía-del-external-application-load-balancer)
11. [Memorystore (Redis) en arquitecturas de microservicios: patrones, límites y alta disponibilidad](./01-fundamentos-y-arquitectura.md#11-memorystore-redis-en-arquitecturas-de-microservicios-patrones-límites-y-alta-disponibilidad)
12. [Diseño multi-región y Disaster Recovery en GCP: RTO/RPO y qué servicio da qué](./01-fundamentos-y-arquitectura.md#12-diseño-multi-región-y-disaster-recovery-en-gcp-rtorpo-y-qué-servicio-da-qué)
13. [Anthos / GKE Enterprise y service mesh: ¿cuándo justifica su complejidad?](./01-fundamentos-y-arquitectura.md#13-anthos--gke-enterprise-y-service-mesh-cuándo-justifica-su-complejidad)

### 02 — Microservicios y casos de producción

**Conceptuales:**

1. [Arquitectura de referencia de microservicios en GCP: GKE/Cloud Run + Pub/Sub](./02-microservicios-y-casos.md#1-arquitectura-de-referencia-de-microservicios-en-gcp-gkecloud-run--pubsub)
2. [Cloud Run internals: concurrencia por instancia, cold starts y CPU throttling fuera de request](./02-microservicios-y-casos.md#2-cloud-run-internals-concurrencia-por-instancia-cold-starts-y-cpu-throttling-fuera-de-request)
3. [Sagas y patrón Outbox con Pub/Sub: consistencia entre microservicios sin 2PC](./02-microservicios-y-casos.md#3-sagas-y-patrón-outbox-con-pubsub-consistencia-entre-microservicios-sin-2pc)
4. [Observabilidad de microservicios con OpenTelemetry en GCP](./02-microservicios-y-casos.md#4-observabilidad-de-microservicios-con-opentelemetry-en-gcp)
5. [Despliegues canary con Cloud Deploy: pipeline de entrega progresiva en GCP](./02-microservicios-y-casos.md#5-despliegues-canary-con-cloud-deploy-pipeline-de-entrega-progresiva-en-gcp)
6. [Resiliencia entre microservicios: timeouts, retries, circuit breakers y load shedding en GCP](./02-microservicios-y-casos.md#6-resiliencia-entre-microservicios-timeouts-retries-circuit-breakers-y-load-shedding-en-gcp)

**Casos de análisis de problemas [CASO]:**

7. [El backlog de una suscripción de Pub/Sub crece sin parar y los mensajes se reentregan varias veces](./02-microservicios-y-casos.md#7-caso-el-backlog-de-una-suscripción-de-pubsub-crece-sin-parar-y-los-mensajes-se-reentregan-varias-veces)
8. [Cloud Run con latencia p99 alta: diagnóstico de cold starts y contención](./02-microservicios-y-casos.md#8-caso-cloud-run-con-latencia-p99-alta-diagnóstico-de-cold-starts-y-contención)
9. [GKE: pods OOMKilled intermitentes y el autoscaler de nodos tarda en absorber picos](./02-microservicios-y-casos.md#9-caso-gke-pods-oomkilled-intermitentes-y-el-autoscaler-de-nodos-tarda-en-absorber-picos)
10. [Cloud SQL (Postgres) agota las conexiones: `FATAL: remaining connection slots are reserved`](./02-microservicios-y-casos.md#10-caso-cloud-sql-postgres-agota-las-conexiones-fatal-remaining-connection-slots-are-reserved)
11. [La factura de BigQuery se triplica en un mes: queries sin particionar y dashboards descontrolados](./02-microservicios-y-casos.md#11-caso-la-factura-de-bigquery-se-triplica-en-un-mes-queries-sin-particionar-y-dashboards-descontrolados)
12. [Spanner con latencias de escritura degradadas: hotspotting por claves secuenciales](./02-microservicios-y-casos.md#12-caso-spanner-con-latencias-de-escritura-degradadas-hotspotting-por-claves-secuenciales)
13. [Firestore con errores ABORTED y latencia: contención en documentos calientes](./02-microservicios-y-casos.md#13-caso-firestore-con-errores-aborted-y-latencia-contención-en-documentos-calientes)
14. [Se ha filtrado una clave JSON de service account en un repositorio público: respuesta al incidente](./02-microservicios-y-casos.md#14-caso-se-ha-filtrado-una-clave-json-de-service-account-en-un-repositorio-público-respuesta-al-incidente)
15. [Latencia elevada entre servicios desplegados en regiones distintas](./02-microservicios-y-casos.md#15-caso-latencia-elevada-entre-servicios-desplegados-en-regiones-distintas)
16. [Errores 429 `RESOURCE_EXHAUSTED` en producción: cuotas de GCP alcanzadas](./02-microservicios-y-casos.md#16-caso-errores-429-resource_exhausted-en-producción-cuotas-de-gcp-alcanzadas)
17. [Migración de AWS a GCP de una plataforma de microservicios: estrategia y mapeo de servicios](./02-microservicios-y-casos.md#17-caso-migración-de-aws-a-gcp-de-una-plataforma-de-microservicios-estrategia-y-mapeo-de-servicios)
18. [Incidente: Cloud Run devuelve errores porque alcanzó su límite de instancias](./02-microservicios-y-casos.md#18-caso-incidente-cloud-run-devuelve-errores-porque-alcanzó-su-límite-de-instancias)

---

## Temas cubiertos

- **Gobernanza y seguridad**: jerarquía org/folders/projects, IAM, service accounts, Workload Identity Federation, respuesta a incidentes de credenciales.
- **Redes**: VPC global, Shared VPC, Private Service Connect, Cloud Load Balancing global, Cloud Armor, latencia inter-región.
- **Cómputo**: GKE (Autopilot vs Standard), Cloud Run (internals, escalado, límites), Cloud Functions, App Engine.
- **Datos**: Cloud SQL, Spanner, Firestore, Bigtable, BigQuery, Memorystore — elección, consistencia, particionado, hotspots, contención y costos.
- **Mensajería y patrones**: Pub/Sub (at-least-once, ordering, exactly-once, DLQ), Sagas, Outbox, idempotencia.
- **Operación**: observabilidad con OpenTelemetry, SLOs, canary con Cloud Deploy, resiliencia, cuotas, multi-región y DR, migración desde AWS.
