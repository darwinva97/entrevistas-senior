# Curso 10 · Mensajería y streaming (Kafka · RabbitMQ · event-driven)

> **El curso de la columna vertebral de los microservicios corporativos.** Duración: ~12 horas. Prerrequisito: [curso 00](../00-fundamentos-distribuidos/), en especial el [módulo 3](../00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md).

En una entrevista senior de microservicios, la conversación termina en el broker: "¿y si el consumidor se cae a mitad?", "¿por qué se duplicó el cobro?", "¿Kafka o RabbitMQ y por qué?". El curso 00 te dio los fundamentos (idempotencia, outbox, sagas); este curso baja al metal de los brokers que se usan en entornos corporativos y sube hasta las arquitecturas event-driven completas, con un laboratorio final donde **operas y rompes tu propio clúster** para fabricar las anécdotas que se cuentan en la entrevista.

## Módulos

| # | Módulo | Qué te enseña | Duración |
|:-:|---|---|:-:|
| 1 | [Colas y mensajería: el modelo que lo explica todo](01-colas-y-mensajeria.md) | Cola vs log, semánticas de entrega tramo a tramo, contratos, dimensionar con Little, DLQ y patrones | 120 min |
| 2 | [Kafka por dentro: del log a producción](02-kafka-por-dentro.md) | Réplicas e ISR, particiones y claves, consumer groups y rebalanceos, transacciones/EOS, operación | 150 min |
| 3 | [RabbitMQ en producción (y cuándo elegir otro broker)](03-rabbitmq-en-produccion.md) | AMQP y routing, confirms/acks, quorum queues, prefetch, alarmas, retry con TTL+DLX, Kafka vs Rabbit vs SQS vs NATS | 120 min |
| 4 | [Arquitecturas event-driven: del patrón al sistema](04-patrones-event-driven.md) | Estilos de evento, diseño y evolución de esquemas, CQRS y proyecciones, orquestación, gobernanza y anti-patrones | 150 min |
| 5 | [Laboratorio integrador: opera tu clúster](05-laboratorio-mensajeria.md) | 8 ejercicios: perder mensajes a propósito, rebalance loops, hot partitions, outbox e2e, alarmas de Rabbit, caos final | 180 min |

## Al terminar deberías poder…

- Explicar dónde exactamente se puede perder o duplicar un mensaje en cada tramo (productor → broker → consumidor) y qué configuración cierra cada agujero.
- Elegir broker (Kafka, RabbitMQ, SQS/SNS, NATS) para un caso concreto y defender la elección por criterios, no por moda.
- Diagnosticar los incidentes clásicos: lag creciente, rebalance loop, hot partition, mensaje envenenado, memory alarm.
- Diseñar los eventos de un dominio (granularidad, payload, metadatos, versionado) y evolucionarlos sin romper consumidores vivos.
- Contar una anécdota de operación real —del laboratorio— con síntoma, hipótesis, evidencia y fix.

## Preguntas del banco que este curso desbloquea

- [`mensajeria-eventos/01-fundamentos-de-mensajeria.md`](../../mensajeria-eventos/01-fundamentos-de-mensajeria.md) — fundamentos y patrones event-driven
- [`mensajeria-eventos/02-kafka.md`](../../mensajeria-eventos/02-kafka.md) — Kafka a fondo
- [`mensajeria-eventos/03-rabbitmq-y-otros-brokers.md`](../../mensajeria-eventos/03-rabbitmq-y-otros-brokers.md) — RabbitMQ, SQS/SNS, NATS, Pulsar
- [`mensajeria-eventos/04-casos-y-problemas.md`](../../mensajeria-eventos/04-casos-y-problemas.md) — los 12 casos de producción
- Y refuerza los **[CASO]** de mensajería de [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) y [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md)
