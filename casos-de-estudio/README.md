# Casos de estudio para entrevistas senior

Colección de casos de **system design** e **incidentes en producción** al estilo de entrevistas senior/staff. Cada caso sigue el mismo formato: enunciado del entrevistador, respuesta resumen (el "elevator pitch" de la solución) y respuesta detallada con aclaración de requisitos, estimaciones, arquitectura con diagramas, trade-offs razonados y "qué espera oír el entrevistador". Los incidentes incluyen además cronología de diagnóstico, hipótesis descartadas, root cause, fix inmediato vs definitivo y postmortem.


> 🎓 **¿Te faltan bases para responder esto?** El curso [System design e incidentes](../cursos/08-system-design/) enseña exactamente lo necesario, con laboratorios y autoevaluación.
> Ver también: [índice completo](../INDICE.md) · [plan de estudio](../PLAN-DE-ESTUDIO.md) · [glosario](../GLOSARIO.md) · [inicio](../README.md)

## Archivos

| Archivo | Contenido | Casos |
|---|---|---|
| [01-system-design.md](01-system-design.md) | Diseño de sistemas | 10 |
| [02-incidentes-en-produccion.md](02-incidentes-en-produccion.md) | Incidentes en producción | 10 |

## Índice de casos

### [01 — System Design](01-system-design.md)

1. **Sistema de pagos idempotente multi-proveedor** — idempotency keys end-to-end, máquina de estados, timeouts como estado desconocido, failover entre pasarelas, outbox y conciliación.
2. **Rate limiter distribuido** — comparación de algoritmos, Redis + Lua atómico, caché local de presupuesto para p99 < 2 ms, fail-open, multi-datacenter y hot keys.
3. **Sistema de notificaciones (push/email/SMS) a 50M usuarios** — colas separadas por prioridad y canal, pacing de campañas, dedupe, rate limits de proveedores, DLQ y feedback loops.
4. **Carrito de compras con inventario en tiempo real (overselling)** — reserva con TTL al iniciar checkout, update condicional atómico, SKU caliente con Redis/Lua o serialización, waiting room.
5. **Plataforma de pedidos tipo delivery con tracking en tiempo real** — separación plano de pedidos (garantizado) vs plano de ubicación (best-effort), matching geoespacial, WebSockets con coalescing.
6. **Autenticación/autorización para 100 microservicios** — OIDC, JWT validado localmente (el problema de los 5 hops), revocación con TTL corto + denylist, authZ en dos capas, mTLS servicio-a-servicio.
7. **Feed de actividad** — híbrido fan-out on write / on read, el umbral de celebridad, bandejas como caché reconstruible, paginación por cursor, separación candidatos/ranking.
8. **Sistema de reservas con alta concurrencia (asientos/citas)** — hold temporal con TTL, operación atómica anti doble-venta, waiting room justa, el caso borde pago-vs-expiración.
9. **API pública con tiers de rate limiting y facturación por uso** — rate limiting aproximado vs metering exacto, pipeline de uso con dedupe y reproceso auditable, aislamiento entre tiers.
10. **Migración de un monolito de e-commerce a microservicios** — strangler fig por fases, qué extraer primero y por qué, CDC y shadow traffic, la transacción de checkout como saga, la BD como la migración real.

### [02 — Incidentes en producción](02-incidentes-en-produccion.md)

1. **El checkout cae cada día a las 12:00 exactas** — la periodicidad como firma de scheduler, correlación con trabajo programado, aislamiento de cargas analíticas.
2. **La latencia p99 se degrada tras cada deploy, pero p50 está bien** — pods fríos (JIT, caches, pools), segmentación por edad de pod, slow start y readiness-como-warmup.
3. **Un retry storm tumbó la plataforma completa** — amplificación de retries en capas, fallo metaestable, por qué el rollback no basta, retry budgets, jitter, circuit breakers y load shedding.
4. **Datos inconsistentes entre pedidos e inventario (saga rota)** — dual write, consumidores no idempotentes, compensaciones que fallan en silencio, outbox + dedupe + DLQ + conciliación.
5. **La caché se cayó y la base de datos no aguantó** — el ×50 del hit-rate invertido, cache stampede y dogpiling, single-flight, stale-while-revalidate, warmup antes de readmitir tráfico.
6. **Un canary pasó todas las métricas pero rompió a un cliente enterprise** — enmascaramiento en agregados, cobertura del canary, métricas segmentadas, contract tests desde tráfico real.
7. **Duplicación de cobros a clientes** — idempotencia end-to-end, el alcance de la key (intención vs request), timeout como resultado desconocido, conciliación con la pasarela.
8. **Funciona en staging pero degrada en producción** — taxonomía datos/concurrencia/entorno/estado acumulado, EXPLAIN comparado, deriva de memoria, qué valida cada entorno.
9. **Una pasarela de pagos lenta arrastra todo el sistema** — "lento es peor que caído", ley de Little, contagio por pools compartidos y health checks, bulkheads, timeouts y fallbacks.
10. **Pérdida de mensajes detectada por conciliación** — bisección productor/broker/consumidor, dual write y auto-commit como fugas clásicas, re-emisión idempotente, conciliación como control continuo.

## Cómo usar este material

- **Como entrevistado:** lee solo el enunciado, resuelve en voz alta 30-40 minutos (requisitos → estimaciones → diseño → trade-offs, o síntoma → hipótesis → diagnóstico → root cause), y compara después con la respuesta detallada, en especial con la sección "qué espera oír el entrevistador".
- **Como entrevistador:** el enunciado es el guion inicial; las secciones de trade-offs e hipótesis descartadas sirven como banco de repreguntas ("¿y si te exijo exactitud estricta?", "¿por qué no reservas al añadir al carrito?").
