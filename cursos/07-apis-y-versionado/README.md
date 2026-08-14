# Curso 07 · Diseño y versionado de APIs

> Duración: ~8 horas. Prerrequisito: [curso 00](../00-fundamentos-distribuidos/), especialmente los módulos 1 y 3.

Prepara las **40 preguntas** de [`versionamiento-apis/`](../../versionamiento-apis/). Es el curso más subestimado y uno de los más rentables: **la evolución de contratos es lo que hace posible —o imposible— desplegar servicios de forma independiente**, que es la razón entera de tener microservicios.

## Módulos

| # | Módulo | Qué te enseña | Duración |
|:-:|---|---|:-:|
| 1 | [Diseño de contratos](01-diseno-de-contratos.md) | REST correcto, errores, paginación, idempotencia, contract-first, gRPC y GraphQL | 150 min |
| 2 | [Estrategias de versionado](02-estrategias-de-versionado.md) | Qué es breaking, dónde va la versión, SemVer, deprecación y sunset | 150 min |
| 3 | [Evolución de datos y eventos](03-evolucion-de-datos-y-eventos.md) | Compatibilidad de esquemas, registry, versionado de eventos y de la BD | 150 min |
| 4 | [Migraciones sin downtime](04-migraciones-sin-downtime.md) | Expand/contract, doble escritura, backfill, cambio de consumidores, rollback | 150 min |

## Al terminar deberías poder…

- Clasificar cualquier cambio como compatible o breaking, en API, en evento y en base de datos.
- Diseñar una API que puedas evolucionar durante años sin `v2`.
- Migrar una columna, una tabla o un esquema de eventos en producción sin parar el servicio.
- Explicar cómo se retira una versión con clientes que no responden a los correos.
- Montar contract testing para que romper a un consumidor falle en CI, no en producción.

## La idea que atraviesa el curso

> **La compatibilidad hacia atrás no es una cortesía: es el mecanismo que permite desplegar dos servicios en momentos distintos.** Cada vez que rompes un contrato, obligas a un despliegue coordinado — y un despliegue coordinado es un monolito con más pasos.
