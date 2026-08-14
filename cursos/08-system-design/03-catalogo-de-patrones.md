# Módulo 3 · Catálogo de patrones

> **Curso 08 · System design** · 180 min

## Por qué esto importa en la entrevista

Diseñar es **reconocer**. Casi ningún problema de entrevista es nuevo: es una recombinación de veinte piezas. Si las tienes catalogadas con su *cuándo* y su *coste*, puedes atacar un problema que no has visto nunca sin improvisar desde cero.

Usa este módulo como referencia: para cada patrón, una frase de qué resuelve, cuándo aplicarlo y qué cuesta.

---

## Bloque 1 · Entrada y tráfico

**API Gateway / BFF.** Punto único de entrada: TLS, authN, rate limiting, enrutado, agregación. Un **BFF** por tipo de cliente (web, móvil) evita que la API pública sea el mínimo común denominador. *Coste:* un salto más y un componente que puede ser cuello de botella y punto único de fallo si no se replica.

**CDN y caché de borde.** Contenido estático y respuestas cacheables cerca del usuario. *Cuándo:* siempre que haya usuarios distribuidos o assets. *Coste:* invalidación, y cuidado con cachear respuestas personalizadas (`Vary`, cookies).

**Rate limiting.** Token bucket (permite ráfagas) o sliding window (más justo). Distribuido con Redis + Lua para atomicidad, con caché local de presupuesto para no pagar un round-trip por petición. *Decisión clave:* fail-open (disponibilidad) vs fail-closed (protección) cuando Redis cae.

**Load shedding y colas de admisión.** Rechazar rápido en sobrecarga, priorizando tráfico valioso ([curso 00 módulo 4](../00-fundamentos-distribuidos/04-resiliencia.md)).

---

## Bloque 2 · Comunicación

**Síncrono (HTTP/gRPC)** cuando el llamante necesita el resultado; **asíncrono (cola/evento)** para todo lo demás. Cada dependencia síncrona te resta disponibilidad ([curso 00 módulo 1](../00-fundamentos-distribuidos/01-modelo-mental.md)).

**Cola de trabajo** (SQS, RabbitMQ, BullMQ): reparto de tareas con reintentos, un consumidor lógico por mensaje. **Log de eventos** (Kafka, Kinesis, Pub/Sub): historial reproducible, varios consumidores independientes, orden por partición. *La pregunta que decide:* ¿necesitas releer el pasado?

**Pub/Sub y fan-out.** Un evento, N interesados, sin que el productor los conozca. *Coste:* nadie sabe quién consume qué (necesitas catálogo y contratos — [curso 07 módulo 3](../07-apis-y-versionado/03-evolucion-de-datos-y-eventos.md)).

**Webhooks.** Notificar a terceros. Necesitan firma HMAC, reintentos con backoff, idempotencia del receptor y una cola de reintentos con DLQ.

**Long polling / SSE / WebSocket.** Tiempo real: SSE para flujo servidor→cliente (simple, sobre HTTP), WebSocket para bidireccional. *Coste:* conexiones persistentes = estado en el servidor, balanceo pegajoso y despliegues que cortan conexiones.

---

## Bloque 3 · Consistencia y transacciones

**Idempotencia** (clave + tabla de deduplicación): la pieza más reutilizada de todo el catálogo.

**Outbox + CDC:** publicar eventos atómicamente con la transacción.

**Saga** (orquestada o coreografiada) con compensaciones para flujos multi-servicio.

**Reserva con TTL** (hold): para inventario, asientos, citas. Reservar al iniciar el checkout, confirmar al pagar, liberar por expiración. Resuelve el overselling sin bloquear stock indefinidamente. *Detalle fino:* qué pasa si el pago llega justo cuando expira la reserva (respuesta: la confirmación debe ser una operación atómica que valide el estado de la reserva).

**Bloqueo optimista** (`version`) por defecto; **pesimista** (`FOR UPDATE`) para recursos escasos con alta contención.

**Reconciliación:** proceso periódico que compara dos fuentes y corrige. Imprescindible con dinero.

---

## Bloque 4 · Lectura y escritura a escala

**Réplicas de lectura:** escalan lecturas, introducen retraso. Combínalas con *read-your-writes* para el propio usuario.

**Sharding / particionado:** por hash (reparto uniforme, rangos imposibles), por rango (consultas por rango, riesgo de hot spot), o por tenant (aislamiento natural). *La decisión más difícil de revertir:* elige la clave pensando en el patrón de acceso dominante, y ten plan de re-sharding (hash consistente reduce el movimiento de datos al añadir nodos).

**CQRS:** separar el modelo de escritura del de lectura, con vistas materializadas para consultas caras. *Coste:* consistencia eventual entre ambos y más piezas. **Event sourcing** (guardar los hechos en vez del estado) da auditoría perfecta y reproducción, a cambio de complejidad alta y el problema de los esquemas eternos. **No los propongas por defecto**: propónlos cuando el caso lo pida (auditoría legal, temporalidad, lecturas muy divergentes de las escrituras).

**Fan-out on write vs on read** (el patrón del feed): escribir en la bandeja de cada seguidor (lectura barata, escritura cara, imposible para celebridades) o calcular al leer (escritura barata, lectura cara). **La respuesta real es híbrida**, con un umbral de celebridad. Es el ejemplo canónico de trade-off explicable en 60 segundos.

**Índices y desnormalización:** duplicar datos para servir una consulta concreta es legítimo si asumes el coste de mantenerlos sincronizados.

---

## Bloque 5 · Caché

**Cache-aside** (el 90% de los casos): la app consulta la caché, si falla va a la BD y rellena. **Write-through** (escribe en ambos, lectura siempre caliente) y **write-behind** (rápido, riesgo de pérdida).

**Problemas que debes nombrar sin que te pregunten:** *stampede* (single-flight, TTL con jitter, stale-while-revalidate), invalidación (TTL corto vs por evento), claves calientes (réplicas de la clave o caché local), y **arranque en frío** (warmup antes de recibir tráfico).

**Niveles:** cliente → CDN → caché local del proceso → caché distribuida → BD. Cada nivel multiplica capacidad y complica la invalidación.

---

## Bloque 6 · Fiabilidad

**Timeouts con presupuesto decreciente**, **reintentos con jitter y budget**, **circuit breaker** (por lentitud también), **bulkhead**, **degradación funcional planificada** — todo el [curso 00 módulo 4](../00-fundamentos-distribuidos/04-resiliencia.md).

**Cola de reintentos escalonada + DLQ** con herramienta de reinyección.

**Shuffle sharding / celdas:** limita el radio de explosión de un cliente tóxico.

**Health checks correctos** y despliegue progresivo con rollback rápido.

---

## Bloque 7 · Coordinación

**Elección de líder** (etcd, ZooKeeper, lease en la BD): para tareas que debe ejecutar una sola instancia (un scheduler). *Alternativa más simple y a menudo mejor:* que la tarea sea idempotente y no importe que se ejecute dos veces.

**Locks distribuidos:** con TTL y token de fencing (un lock sin fencing no es seguro: el dueño puede haber pausado y volver creyéndose dueño). **Menciona el fencing token**: es la señal de que has leído sobre esto en serio.

**Generación de ids:** UUIDv7 / Snowflake (ordenables por tiempo, sin coordinación) en vez de autoincrementales, que impiden particionar y filtran volumen de negocio.

**Scheduling y jobs:** cron distribuido con lock, idempotencia, y una alerta de "no se ejecutó" (los jobs que dejan de correr en silencio son un clásico).

---

## Cómo usar el catálogo en la entrevista

1. Identifica la **restricción dominante**: ¿lecturas? ¿escrituras? ¿consistencia? ¿latencia? ¿coste?
2. Elige **el patrón mínimo** que la resuelve.
3. Di el **coste** que acabas de aceptar. *"Meto una caché, y con ello asumo invalidación y un modo degradado si se cae."*
4. Solo entonces añade el siguiente.

## ✅ Autoevaluación

1. Cola de trabajo vs log de eventos: la pregunta que decide.
2. Explica fan-out on write vs on read y la solución híbrida.
3. ¿Cuándo CQRS y cuándo es sobre-ingeniería?
4. Diseña la reserva con TTL para asientos: ¿qué pasa si el pago llega tarde?
5. ¿Qué es un fencing token y por qué un lock con TTL no basta?
6. Tres problemas de las cachés y su solución.
7. Elige clave de partición para: pedidos, mensajes de chat, métricas de dispositivos.

## 🎯 Preguntas del banco que ya puedes responder

- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — los 10 casos
- [`java-microservicios/02-spring-y-microservicios.md`](../../java-microservicios/02-spring-y-microservicios.md) — patrones distribuidos
- [`typescript-microservicios/02-node-y-microservicios.md`](../../typescript-microservicios/02-node-y-microservicios.md) — 8, 9, 10

---

**Anterior:** [Módulo 2](02-estimaciones-y-numeros.md) · **Siguiente:** [Módulo 4 · Almacenamiento y datos](04-almacenamiento-y-datos.md)
