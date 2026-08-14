# Curso 04 · Cloud y Kubernetes (AWS · Azure · GCP)

> Duración: ~12 horas. Prerrequisito: [curso 00](../00-fundamentos-distribuidos/).

Prepara las **108 preguntas** de [`cloud/`](../../cloud/). La estrategia aquí es distinta a la de los otros cursos: **no memorices tres catálogos de servicios**. Aprende los *conceptos* (cómputo, identidad, red, datos, eventos) y las *equivalencias*; con eso respondes en cualquiera de las tres nubes y suenas como alguien que ha migrado entre ellas, que es justo lo que buscan.

## Módulos

| # | Módulo | Qué te enseña | Duración |
|:-:|---|---|:-:|
| 1 | [Modelo mental multicloud y equivalencias](01-modelo-mental-multicloud.md) | Los 8 bloques de construcción y su nombre en cada nube | 120 min |
| 2 | [Cómputo: contenedores y serverless](02-computo-contenedores-y-serverless.md) | ECS/EKS/Fargate, Cloud Run/GKE, ACA/AKS, Lambda y cold starts | 150 min |
| 3 | [Identidad, red y datos](03-identidad-red-y-datos.md) | IAM y roles, VPC/subredes/endpoints, elección de base de datos, mensajería | 180 min |
| 4 | [Kubernetes para entrevistas](04-kubernetes.md) | Qué pasa al hacer `kubectl apply`, probes, recursos, HPA, rollouts, red | 180 min |
| 5 | [Fiabilidad, costos y operación](05-fiabilidad-y-costos.md) | Multi-AZ/región, DR (RTO/RPO), FinOps, límites y cuotas | 120 min |

## Al terminar deberías poder…

- Traducir cualquier arquitectura entre AWS, Azure y GCP y explicar en qué **no** son equivalentes.
- Justificar contenedores vs serverless con criterios de costo, latencia y operación, no de moda.
- Explicar cómo un pod obtiene credenciales sin secretos (IRSA / Workload Identity / Managed Identity).
- Diagnosticar un `CrashLoopBackOff`, un pod `Pending` y un OOMKill sin buscar en Google.
- Estimar la factura de una arquitectura y decir qué la domina (casi siempre: egress, NAT y bases de datos ociosas).

## Cómo estudiar este curso

Si la vacante es de una nube concreta, **estudia el módulo entero y luego lee solo esa columna** de las tablas de equivalencias; pero prepárate una frase para "¿y en las otras?", porque es una repregunta habitual y responderla bien te posiciona por encima del resto.

## Laboratorio transversal

Monta el **mismo servicio** (una API con BD y una cola) en dos de las tres nubes, con Terraform, y compara: líneas de IaC, tiempo de despliegue, coste mensual estimado y qué te costó más. Ese ejercicio vale más que cien tarjetas de memoria y da respuestas concretas para toda la entrevista.
