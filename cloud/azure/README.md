# Entrevistas Senior — Arquitectura Cloud en Azure (Backend / Microservicios)

Banco de preguntas de entrevista técnica para perfiles senior de backend y microservicios en Azure. Cada pregunta incluye una **respuesta resumen** (lo que dirías en 30–60 segundos) y una **respuesta detallada** (servicios concretos, límites, costos, trade-offs y errores comunes). Las preguntas marcadas como **[CASO]** son análisis de problemas con escenario, diagnóstico paso a paso (Azure Monitor, Application Insights, Log Analytics/KQL), solución y prevención.

## Archivos

| Archivo | Contenido | Preguntas |
|---|---|---|
| [01-fundamentos-y-arquitectura.md](01-fundamentos-y-arquitectura.md) | Gobernanza, redes, identidad, cómputo, datos, mensajería, entrega, seguridad, DR y Well-Architected | 12 |
| [02-microservicios-y-casos.md](02-microservicios-y-casos.md) | Arquitectura de microservicios, patrones distribuidos, observabilidad, despliegues y 12 casos de troubleshooting | 18 (12 casos) |

## Índice de preguntas

### 01 — Fundamentos y arquitectura

1. [¿Cómo organizas suscripciones, Management Groups y Resource Groups en una organización grande?](01-fundamentos-y-arquitectura.md#1-cómo-organizas-suscripciones-management-groups-y-resource-groups-en-una-organización-grande) — Gobernanza y organización
2. [Diseño de redes: VNets, subnets, NSGs, Private Endpoints y peering](01-fundamentos-y-arquitectura.md#2-diseño-de-redes-vnets-subnets-nsgs-private-endpoints-y-peering) — Redes
3. [Identidad: Entra ID, Service Principals, Managed Identities y RBAC](01-fundamentos-y-arquitectura.md#3-identidad-entra-id-service-principals-managed-identities-y-rbac) — Identidad y seguridad
4. [Cómputo: ¿cuándo elegir AKS, Container Apps, App Service o Functions?](01-fundamentos-y-arquitectura.md#4-cómputo-cuándo-elegir-aks-container-apps-app-service-o-functions) — Cómputo y arquitectura
5. [Azure SQL vs Cosmos DB: consistencia, particionado y RUs](01-fundamentos-y-arquitectura.md#5-azure-sql-vs-cosmos-db-consistencia-particionado-y-rus) — Datos
6. [Mensajería: Service Bus vs Event Grid vs Event Hubs](01-fundamentos-y-arquitectura.md#6-mensajería-service-bus-vs-event-grid-vs-event-hubs) — Mensajería e integración
7. [API Management: rol en una arquitectura de microservicios](01-fundamentos-y-arquitectura.md#7-api-management-rol-en-una-arquitectura-de-microservicios) — Integración y APIs
8. [Front Door vs Application Gateway vs Load Balancer vs Traffic Manager](01-fundamentos-y-arquitectura.md#8-front-door-vs-application-gateway-vs-load-balancer-vs-traffic-manager) — Redes y entrega
9. [Key Vault: gestión de secretos, claves y certificados](01-fundamentos-y-arquitectura.md#9-key-vault-gestión-de-secretos-claves-y-certificados) — Seguridad
10. [Almacenamiento: Blob Storage, tiers y ciclo de vida](01-fundamentos-y-arquitectura.md#10-almacenamiento-blob-storage-tiers-y-ciclo-de-vida) — Datos y almacenamiento
11. [Multi-región y Disaster Recovery: cómo se diseña](01-fundamentos-y-arquitectura.md#11-multi-región-y-disaster-recovery-cómo-se-diseña) — Resiliencia y DR
12. [Well-Architected Framework aplicado a un diseño en Azure](01-fundamentos-y-arquitectura.md#12-well-architected-framework-aplicado-a-un-diseño-en-azure) — Arquitectura y buenas prácticas

### 02 — Microservicios y casos prácticos

1. [Arquitectura de referencia de microservicios en Azure (AKS + Service Bus + APIM)](02-microservicios-y-casos.md#1-arquitectura-de-referencia-de-microservicios-en-azure-aks--service-bus--apim) — Conceptual
2. [Durable Functions para implementar Sagas](02-microservicios-y-casos.md#2-durable-functions-para-implementar-sagas) — Conceptual
3. [Dapr sobre Container Apps: qué aporta a microservicios](02-microservicios-y-casos.md#3-dapr-sobre-container-apps-qué-aporta-a-microservicios) — Conceptual
4. [Observabilidad con Application Insights: distributed tracing y sampling](02-microservicios-y-casos.md#4-observabilidad-con-application-insights-distributed-tracing-y-sampling) — Conceptual
5. [Despliegues blue/green y canary en AKS](02-microservicios-y-casos.md#5-despliegues-bluegreen-y-canary-en-aks) — Conceptual
6. [Idempotencia, outbox y exactly-once práctico en mensajería Azure](02-microservicios-y-casos.md#6-idempotencia-outbox-y-exactly-once-práctico-en-mensajería-azure) — Conceptual
7. [[CASO] Cosmos DB devuelve 429: RU exhaustion y hot partition](02-microservicios-y-casos.md#7-caso-cosmos-db-devuelve-429-ru-exhaustion-y-hot-partition)
8. [[CASO] La DLQ de Service Bus crece sin parar](02-microservicios-y-casos.md#8-caso-la-dlq-de-service-bus-crece-sin-parar)
9. [[CASO] App Service con memory leak y reinicios continuos](02-microservicios-y-casos.md#9-caso-app-service-con-memory-leak-y-reinicios-continuos)
10. [[CASO] AKS: pods evicted y nodos bajo presión](02-microservicios-y-casos.md#10-caso-aks-pods-evicted-y-nodos-bajo-presión)
11. [[CASO] Latencia alta entre servicios en AKS: DNS, conntrack y kube-proxy](02-microservicios-y-casos.md#11-caso-latencia-alta-entre-servicios-en-aks-dns-conntrack-y-kube-proxy)
12. [[CASO] Azure Functions con cold starts y timeouts](02-microservicios-y-casos.md#12-caso-azure-functions-con-cold-starts-y-timeouts)
13. [[CASO] El costo de Cosmos DB y Log Analytics se disparó](02-microservicios-y-casos.md#13-caso-el-costo-de-cosmos-db-y-log-analytics-se-disparó)
14. [[CASO] Throttling de Entra ID en la autenticación entre servicios](02-microservicios-y-casos.md#14-caso-throttling-de-entra-id-en-la-autenticación-entre-servicios)
15. [[CASO] Pérdida de mensajes en Event Hubs por mal checkpointing](02-microservicios-y-casos.md#15-caso-pérdida-de-mensajes-en-event-hubs-por-mal-checkpointing)
16. [[CASO] Incidente por expiración de secretos/certificados en Key Vault](02-microservicios-y-casos.md#16-caso-incidente-por-expiración-de-secretoscertificados-en-key-vault)
17. [[CASO] Migración de on-premise a Azure: evaluación y estrategia](02-microservicios-y-casos.md#17-caso-migración-de-on-premise-a-azure-evaluación-y-estrategia)
18. [[CASO] Degradación tras un failover de región](02-microservicios-y-casos.md#18-caso-degradación-tras-un-failover-de-región)

## Cómo usar este material

- **Preparación rápida:** lee solo las respuestas resumen (📝) de todas las preguntas — es el guion de 30–60 segundos por tema.
- **Preparación profunda:** trabaja las respuestas detalladas (📖) y, en los [CASO], practica narrar el diagnóstico paso a paso en voz alta: la secuencia herramienta → hallazgo → hipótesis → acción es lo que evalúa el entrevistador.
- **Simulacro:** elige 3 conceptuales y 2 casos al azar y respóndelos sin mirar; contrasta después con el detalle.
