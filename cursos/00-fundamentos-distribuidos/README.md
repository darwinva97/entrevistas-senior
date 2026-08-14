# Curso 00 · Fundamentos de sistemas distribuidos

> **El curso que hace que los demás sean fáciles.** Duración: ~10 horas. Prerrequisito: haber escrito y desplegado al menos un servicio en producción.

Casi ninguna pregunta senior es realmente sobre el lenguaje. "¿Por qué se duplicaron los cobros?" no es una pregunta de Java: es idempotencia. "¿Por qué la latencia p99 se dispara si el p50 está bien?" no es una pregunta de Node: es teoría de colas. Este curso te da los seis modelos mentales de los que cuelga todo lo demás.

## Módulos

| # | Módulo | Qué te enseña | Duración |
|:-:|---|---|:-:|
| 1 | [Modelo mental de un sistema distribuido](01-modelo-mental.md) | Fallos parciales, las 8 falacias, por qué "lo llamé y no sé qué pasó" es el problema central | 90 min |
| 2 | [Consistencia, CAP y el mundo real](02-consistencia-y-cap.md) | Consistencia fuerte vs eventual, aislamiento en BD, cuándo cada una, qué es realmente CAP | 120 min |
| 3 | [Mensajería, entrega e idempotencia](03-mensajeria-e-idempotencia.md) | At-least-once, outbox, dedupe, sagas, DLQ, orden y particiones | 120 min |
| 4 | [Resiliencia: timeouts, reintentos y fallos metaestables](04-resiliencia.md) | Timeouts en cascada, retry storms, circuit breakers, bulkheads, load shedding | 120 min |
| 5 | [Latencia, colas y capacidad](05-latencia-y-colas.md) | Ley de Little, por qué el p99 explota al 80% de utilización, dimensionar pools | 90 min |
| 6 | [Observabilidad y método de diagnóstico](06-observabilidad-y-diagnostico.md) | Métricas/logs/trazas, USE y RED, cómo se investiga un incidente sin adivinar | 90 min |

## Al terminar deberías poder…

- Explicar por qué un timeout **no** significa que la operación falló, y qué haces al respecto.
- Diseñar una operación de escritura idempotente end-to-end y defender dónde pones la clave.
- Justificar consistencia eventual ante un stakeholder que pide "que sea inmediato".
- Explicar por qué añadir reintentos puede tumbar un sistema que solo estaba lento.
- Calcular cuántas conexiones/hilos necesita un servicio a partir de su throughput y latencia.
- Dirigir el diagnóstico de un incidente por hipótesis medibles en lugar de por corazonadas.

## Preguntas del banco que este curso desbloquea

Prácticamente todos los **[CASO]** del repositorio, y en particular:

- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — los 10 casos
- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — los 10 incidentes
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — preguntas 5–7, 10, 14, 15
- [`typescript-microservicios/03-casos-y-problemas.md`](../../typescript-microservicios/03-casos-y-problemas.md) — casos de colas, backpressure y consistencia
- [`golang-microservicios/03-casos-y-problemas.md`](../../golang-microservicios/03-casos-y-problemas.md) — casos de context, goroutine leaks y cascadas
