# Casos de estudio para entrevistas senior

Colección de casos al estilo de entrevistas senior/staff: **system design**, **incidentes en producción**, **análisis de nuevos requerimientos**, **diagnóstico entre entornos (QA · staging · producción)** y **versionado y gestión de releases**. Cada caso sigue el mismo formato: enunciado del entrevistador, respuesta resumen (el "elevator pitch" de la solución) y respuesta detallada con aclaración de requisitos, estimaciones, arquitectura con diagramas, trade-offs razonados y "qué espera oír el entrevistador". Los incidentes incluyen además cronología de diagnóstico, hipótesis descartadas, root cause, fix inmediato vs definitivo y postmortem.


> 🎓 **¿Te faltan bases para responder esto?** El curso [System design e incidentes](../cursos/08-system-design/) enseña exactamente lo necesario, con laboratorios y autoevaluación.
> Ver también: [índice completo](../INDICE.md) · [plan de estudio](../PLAN-DE-ESTUDIO.md) · [glosario](../GLOSARIO.md) · [inicio](../README.md)

## Archivos

| Archivo | Contenido | Casos |
|---|---|---|
| [01-system-design.md](01-system-design.md) | Diseño de sistemas | 10 |
| [02-incidentes-en-produccion.md](02-incidentes-en-produccion.md) | Incidentes en producción | 10 |
| [03-nuevos-requerimientos.md](03-nuevos-requerimientos.md) | Análisis de nuevos requerimientos: aclarar, descomponer, estimar, negociar alcance | 10 |
| [04-diagnostico-multientorno.md](04-diagnostico-multientorno.md) | Diagnóstico entre entornos: QA, staging y producción | 10 |
| [05-versionado-y-releases.md](05-versionado-y-releases.md) | Versionado, branching, releases y gestión del cambio | 10 |

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

### [03 — Análisis de nuevos requerimientos](03-nuevos-requerimientos.md)

1. **"Necesitamos que los usuarios puedan pagar en cuotas"** — el requerimiento de negocio ambiguo: descubrir el alcance real, proveedores vs riesgo propio, legal y contabilidad, MVP por fases.
2. **"Es solo añadir un campo al formulario"** — análisis de impacto sistemático cuando el campo cruza 4 servicios, 2 contratos y un evento con 6 consumidores; expand-contract y coordinación entre equipos.
3. **Feature nueva sobre un monolito legacy sin tests** — characterization tests, seams, refactor presupuestado dentro de la feature y estimación honesta con incertidumbre.
4. **"Para el viernes"** — urgencia contra deuda técnica: opciones con costes explícitos, el hack con fecha de caducidad y cómo se comunica a negocio.
5. **Integración con un tercero mal documentado** — spike timeboxeado, anti-corruption layer, contract tests contra grabaciones y modo degradado.
6. **"Quiero un dashboard en tiempo real"** — qué significa "tiempo real" de verdad, coste por nivel de frescura y entrega de valor por fases.
7. **Romper un contrato público con clientes activos** — versionado, telemetría por cliente, deprecation policy, migración asistida y el cliente que no migra.
8. **Multi-tenancy sobrevenida** — niveles de aislamiento, impacto transversal (authz, backups, métricas, costes) y por qué es de lo peor para retro-encajar.
9. **"Hazlo configurable": el motor de reglas prematuro** — YAGNI vs extensibilidad, la regla de tres, diseñar el seam sin construir la plataforma.
10. **Herencia de un requerimiento a medio hacer** — arqueología de código y tickets, continuar/reescribir/descartar con criterios, re-estimación y comunicación.

### [04 — Diagnóstico entre entornos](04-diagnostico-multientorno.md)

1. **El bug que solo se reproduce en QA** — el entorno compartido y contaminado: datos mutados, versiones mezcladas, mocks desactualizados; entornos efímeros como fix estructural.
2. **Todo verde en staging, cae en producción en hora pico** — lo que staging no valida: volumen, estadísticas de la BD, concurrencia; EXPLAIN comparado y shadow traffic.
3. **Config drift: el hotfix manual de hace 6 meses** — detectar deriva con IaC diff, todo por el pipeline, reconciliación automática y auditoría de accesos.
4. **"Funciona en mi máquina"** — contenedor vs cluster: límites de memoria/CPU, OOMKilled, usuario no-root, DNS, timezone; reproducir el runtime real en local.
5. **Certificados y DNS solo rotos en producción** — truststores, cadenas incompletas, SNI, proxys corporativos; metodología con openssl s_client.
6. **La migración de BD que revienta en prod** — locks largos con datos reales, migraciones online (expand-contract, backfill por lotes) y ensayo con dataset realista.
7. **Feature flags divergentes** — los flags como parte del estado: registrar evaluaciones en logs/traces, paridad de flags e higiene con caducidad.
8. **El mismo commit produce artefactos diferentes** — builds no reproducibles: rangos abiertos, :latest, mirrors; build once & promote y digests inmutables.
9. **Datos de prueba vs datos reales** — datos sintéticos que mienten (distribuciones, nulls, unicode) y anonimización que destruye la señal.
10. **Estrategia de entornos desde cero para 15 microservicios** — cada entorno responde una pregunta; efímeros por PR, staging estricto y testing en producción con guardarraíles.

### [05 — Versionado, releases y gestión del cambio](05-versionado-y-releases.md)

1. **Branching para 10 equipos y 40 microservicios** — trunk-based vs GitFlow vs GitHub Flow, flags en vez de ramas largas y métricas DORA como criterio.
2. **Hotfix urgente con main 30 commits por delante** — cherry-pick a rama de release, revert o kill-switch; por qué congelar main es la peor opción.
3. **El rollback imposible: la migración de BD ya corrió** — migraciones backward-compatible siempre, separar deploy de migración, roll-forward como plan real.
4. **Release train vs continuous deployment en B2B** — trains con ventanas, rings, flags por tenant; cuándo el miedo al cambio es un problema de calidad.
5. **¿Semver de microservicios sirve de algo?** — se versiona el contrato, no el binario; compat N-1 en rolling deploys y el anti-patrón del lockstep release.
6. **Monorepo vs multirepo** — atomic changes vs tooling, librerías compartidas en cada modelo y el coste real de migrar; criterios, no dogma.
7. **La librería `commons` infernal** — reverse dependency testing, deprecations con plazo, reducir superficie compartida y ownership claro.
8. **Dos features que deben salir juntas** — el acoplamiento de release como smell: contratos primero, flags coordinadas y despliegue en cualquier orden.
9. **Deprecar la v1 con 200 integraciones activas** — telemetría por versión/cliente, headers Deprecation/Sunset, brownouts programados y excepciones con contrato.
10. **"¿Qué corría en producción el 3 de marzo?"** — trazabilidad build→deploy: SHA en el artefacto, endpoint /version, registro de deploys, SBOM y SLSA.

## Cómo usar este material

- **Como entrevistado:** lee solo el enunciado, resuelve en voz alta 30-40 minutos (requisitos → estimaciones → diseño → trade-offs, o síntoma → hipótesis → diagnóstico → root cause), y compara después con la respuesta detallada, en especial con la sección "qué espera oír el entrevistador".
- **Como entrevistador:** el enunciado es el guion inicial; las secciones de trade-offs e hipótesis descartadas sirven como banco de repreguntas ("¿y si te exijo exactitud estricta?", "¿por qué no reservas al añadir al carrito?").
