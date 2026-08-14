# Entrevistas Técnicas Senior — Arquitectura Cloud en AWS

Banco de preguntas para entrevistas de arquitectura cloud en AWS orientado a perfiles senior de backend/microservicios. Cada pregunta incluye una **respuesta resumen** (lo que dirías en 30–60 segundos) y una **respuesta detallada** (servicios concretos, límites, costos, trade-offs y errores comunes). Los casos de tipo **[CASO]** incluyen escenario, diagnóstico paso a paso, solución y prevención.


> 🎓 **¿Te faltan bases para responder esto?** El curso [Cloud y Kubernetes](../../cursos/04-cloud-y-kubernetes/) enseña exactamente lo necesario, con laboratorios y autoevaluación.
> Ver también: [índice completo](../../INDICE.md) · [plan de estudio](../../PLAN-DE-ESTUDIO.md) · [glosario](../../GLOSARIO.md) · [inicio](../../README.md)

## Índice de archivos

| Archivo | Contenido | Preguntas |
|---|---|---|
| [01-fundamentos-y-arquitectura.md](./01-fundamentos-y-arquitectura.md) | VPC, IAM, cómputo, datos, mensajería, DR, Well-Architected, costos | 18 |
| [02-microservicios-en-aws.md](./02-microservicios-en-aws.md) | Arquitectura de microservicios, patrones de integración, CI/CD, observabilidad, Lambda internals | 13 |
| [03-casos-y-problemas.md](./03-casos-y-problemas.md) | Casos de análisis de problemas: diagnóstico, solución y prevención | 16 |

**Total: 47 preguntas**

---

## 01 — Fundamentos y Arquitectura (18 preguntas)

1. Diseño de una VPC: subnets públicas/privadas, NAT e Internet Gateway
2. VPC Endpoints: Gateway vs Interface, y cuándo usarlos
3. VPC Peering vs Transit Gateway: conectividad entre VPCs
4. IAM avanzado: evaluación de policies, roles y STS
5. Permission boundaries, SCPs y acceso cross-account
6. ECS vs EKS vs Lambda vs Fargate: criterios de elección de cómputo
7. ALB vs NLB vs API Gateway: exposición de servicios
8. RDS vs Aurora: cuándo pagar la prima de Aurora
9. DynamoDB: modelado single-table y particiones calientes
10. SQS vs SNS vs EventBridge: mensajería y eventos
11. Kinesis Data Streams vs MSK (Kafka): streaming de datos
12. Step Functions: orquestación de workflows
13. ElastiCache: Redis vs Memcached y patrones de caching
14. S3: consistencia, clases de almacenamiento y performance
15. Multi-AZ vs multi-región: alta disponibilidad real
16. Disaster Recovery: RTO/RPO y las cuatro estrategias
17. Well-Architected Framework: los seis pilares aplicados
18. Control de costos en AWS: de la visibilidad a la optimización

## 02 — Microservicios en AWS (13 preguntas)

1. Arquitectura de referencia de microservicios en AWS
2. Service discovery con Cloud Map y alternativas
3. Service mesh en AWS: App Mesh vs VPC Lattice
4. API Gateway + Lambda vs contenedores para APIs
5. Colas y DLQs: retries, backoff y poison messages
6. Exactly-once vs at-least-once en SQS y Kinesis
7. El patrón Saga con Step Functions
8. El patrón Outbox con DynamoDB Streams (y CDC en general)
9. Secrets Manager vs Parameter Store: gestión de secretos y configuración
10. CI/CD en AWS: blue/green y canary con CodeDeploy
11. Observabilidad: CloudWatch, X-Ray y ADOT
12. Lambda internals: cold starts, concurrencia y provisioned concurrency
13. Versionado de APIs y contratos entre microservicios

## 03 — Casos y Problemas (16 preguntas, todas [CASO])

1. Lambda con cold starts inaceptables en una API de pagos
2. DynamoDB con throttling por hot partition en un multi-tenant
3. La factura de AWS se triplicó este mes: análisis
4. Pods de EKS en CrashLoopBackOff tras un deploy
5. Latencia intermitente entre servicios en distintas AZ
6. Mensajes de SQS que "reaparecen" y se procesan varias veces
7. La DLQ se está llenando: triage y reproceso
8. RDS PostgreSQL con CPU al 100%: análisis con Performance Insights
9. API Gateway devolviendo 429 y 504: throttling y timeouts
10. Caída de una AZ: comportamiento del sistema y diseño de resiliencia
11. Fuga de credenciales IAM: respuesta al incidente
12. S3 lento en listados masivos y cargas con millones de objetos
13. Kinesis con shards saturados y consumidores con lag creciente
14. Migración a AWS: lift-and-shift vs re-architect
15. ECS tasks que mueren por memoria (OOM) de forma intermitente
16. NAT Gateway con costos disparados: análisis y rediseño

---

## Cómo usar este material

- **Preparación rápida**: lee solo las respuestas resumen de cada archivo (≈30–60 s por pregunta).
- **Preparación profunda**: estudia las respuestas detalladas, prestando atención a límites/quotas, precios aproximados y trade-offs — es lo que separa una respuesta senior de una genérica.
- **Simulación de entrevista**: para los [CASO], practica verbalizar el diagnóstico paso a paso (qué métrica miras primero, qué herramienta usas, cómo bifurcas por causa) antes de leer la solución.

> Nota: los precios y límites citados son aproximados (referencia us-east-1) y cambian con el tiempo; verifica los valores actuales en la documentación oficial de AWS antes de una entrevista.
