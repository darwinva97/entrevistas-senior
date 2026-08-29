# 📖 Glosario

Los términos que debes poder definir **en 20 segundos** durante una entrevista. Si alguno te hace dudar, tienes al lado el módulo del curso que lo explica.

---

## Sistemas distribuidos

**At-least-once / at-most-once / exactly-once** — Garantías de entrega. La primera nunca pierde pero duplica; la segunda pierde pero no duplica; la tercera no existe a nivel de red: lo que existe es *procesamiento efectivamente una vez* = at-least-once + idempotencia. → [00·3](cursos/00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

**Backpressure** — Propagar hacia atrás la señal de "no puedo con más", en vez de acumular trabajo hasta reventar. → [00·4](cursos/00-fundamentos-distribuidos/04-resiliencia.md)

**Bulkhead (mamparo)** — Aislar recursos (pools) por dependencia para que la lentitud de una no consuma la capacidad de todas. → [00·4](cursos/00-fundamentos-distribuidos/04-resiliencia.md)

**CAP / PACELC** — Ante una partición eliges disponibilidad o consistencia; y *en operación normal* (Else) eliges latencia o consistencia. PACELC es la versión útil. → [00·2](cursos/00-fundamentos-distribuidos/02-consistencia-y-cap.md)

**Circuit breaker** — Deja de llamar a una dependencia que falla o va lenta y falla rápido, con estados cerrado/abierto/semiabierto. → [00·4](cursos/00-fundamentos-distribuidos/04-resiliencia.md)

**Consistencia eventual** — Sin nuevas escrituras, las réplicas convergen. Barata y disponible; obliga a diseñar para lecturas obsoletas. → [00·2](cursos/00-fundamentos-distribuidos/02-consistencia-y-cap.md)

**Dual write** — Escribir en dos sistemas sin atomicidad (BD + broker). Es un bug estructural; se resuelve con outbox. → [00·3](cursos/00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

**Fallo gris** — El servicio no está caído, está lento. Pasa los health checks y satura a todos sus clientes. Peor que una caída. → [00·1](cursos/00-fundamentos-distribuidos/01-modelo-mental.md)

**Fallo metaestable** — El sistema no se recupera aunque desaparezca la causa original, porque el bucle de reintentos y colas se sostiene solo. → [00·4](cursos/00-fundamentos-distribuidos/04-resiliencia.md)

**Idempotencia** — Ejecutar N veces deja el mismo estado que ejecutar una. Se implementa con clave de idempotencia + restricción única. → [00·3](cursos/00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

**Ley de Little** — `L = λ × W`: concurrencia = rps × latencia. Sirve para dimensionar pools, hilos y consumidores. → [00·5](cursos/00-fundamentos-distribuidos/05-latencia-y-colas.md)

**Load shedding** — Rechazar tráfico rápido en sobrecarga, priorizando lo importante, en vez de aceptarlo todo y degradarlo todo. → [00·4](cursos/00-fundamentos-distribuidos/04-resiliencia.md)

**Outbox** — Escribir el evento en una tabla dentro de la misma transacción del negocio; un relay (CDC o poller) lo publica después. → [00·3](cursos/00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

**Retry budget** — Límite global al porcentaje de tráfico que puede ser reintento. Lo que evita de verdad un retry storm. → [00·4](cursos/00-fundamentos-distribuidos/04-resiliencia.md)

**Saga** — Secuencia de transacciones locales con compensaciones, orquestada o coreografiada, en lugar de una transacción distribuida. → [00·3](cursos/00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

**Shuffle sharding** — Repartir clientes entre subconjuntos de recursos para que un cliente tóxico afecte solo a una fracción. → [00·4](cursos/00-fundamentos-distribuidos/04-resiliencia.md)

**Tail amplification** — Con N llamadas paralelas, la latencia percibida es el máximo, no el promedio: el p99 individual se convierte en el caso común. → [00·5](cursos/00-fundamentos-distribuidos/05-latencia-y-colas.md)

**Thundering herd / cache stampede** — Muchos clientes reaccionando a la vez (expiración de una clave, reinicio, reintento sincronizado). Se mitiga con jitter y single-flight. → [00·5](cursos/00-fundamentos-distribuidos/05-latencia-y-colas.md)

---

## Datos y consistencia

**Bloqueo optimista / pesimista** — Versión + reintento (baja contención) frente a lock explícito (`FOR UPDATE`, alta contención sobre el mismo recurso). → [00·2](cursos/00-fundamentos-distribuidos/02-consistencia-y-cap.md)

**CDC (Change Data Capture)** — Leer el log de transacciones de la BD para publicar cambios (Debezium). El relay natural del outbox. → [07·4](cursos/07-apis-y-versionado/04-migraciones-sin-downtime.md)

**CQRS / Event sourcing** — Separar el modelo de lectura del de escritura / guardar los hechos en vez del estado. Potentes y caros: no son el default. → [08·3](cursos/08-system-design/03-catalogo-de-patrones.md)

**Expand / contract** — Patrón de migración: añadir lo nuevo, migrar, cambiar la lectura, y solo mucho después eliminar lo viejo. → [07·4](cursos/07-apis-y-versionado/04-migraciones-sin-downtime.md)

**Fan-out on write / on read** — Precalcular la bandeja de cada seguidor o calcularla al leer. La respuesta real suele ser híbrida. → [08·3](cursos/08-system-design/03-catalogo-de-patrones.md)

**Hot partition** — Una partición concentra el tráfico por una clave mal elegida; el resto duerme. → [00·3](cursos/00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

**Lost update / write skew / phantom read** — Anomalías de concurrencia. La primera la permite Read Committed; la segunda solo la evita Serializable. → [00·2](cursos/00-fundamentos-distribuidos/02-consistencia-y-cap.md)

**Read-your-writes** — Garantía de que *tú* ves tus propios cambios, aunque otros tarden. Suele resolverse enrutando tus lecturas al primario. → [00·2](cursos/00-fundamentos-distribuidos/02-consistencia-y-cap.md)

**Quórum (R + W > N)** — Con N réplicas, leer y escribir en mayorías solapadas garantiza lecturas consistentes. → [00·2](cursos/00-fundamentos-distribuidos/02-consistencia-y-cap.md)

**Single-flight** — Que solo una petición recalcule una clave caché caliente mientras las demás esperan el resultado. → [00·5](cursos/00-fundamentos-distribuidos/05-latencia-y-colas.md)

---

## Mensajería y streaming (Kafka · RabbitMQ)

**Acks / min.insync.replicas** — El productor decide cuántas réplicas confirman (`acks=all`) y el broker cuántas son obligatorias. La durabilidad real la da la combinación de ambos: `acks=all` con `min.insync.replicas=1` no garantiza nada. → [10·2](cursos/10-mensajeria-y-streaming/02-kafka-por-dentro.md)

**Cola vs log** — RabbitMQ borra el mensaje al consumirlo (cola); Kafka lo conserva y cada consumidor lleva su posición (log). De ahí salen replay, fan-out barato y casi todas las demás diferencias. → [10·1](cursos/10-mensajeria-y-streaming/01-colas-y-mensajeria.md)

**Compaction** — Retención por clave: Kafka conserva el último valor de cada clave (con tombstones para borrar). Convierte un topic en un changelog/snapshot reconstruible. → [10·2](cursos/10-mensajeria-y-streaming/02-kafka-por-dentro.md)

**Consumer group / rebalanceo** — Los consumidores de un grupo se reparten las particiones; cuando entra/sale uno (o tarda más de `max.poll.interval.ms`) se redistribuyen. Un rebalanceo en bucle es un incidente clásico. → [10·2](cursos/10-mensajeria-y-streaming/02-kafka-por-dentro.md)

**Consumer lag** — Distancia entre el último offset producido y el último consumido. Es *la* métrica de salud de un consumidor: lag creciendo = no das abasto o estás caído. → [10·2](cursos/10-mensajeria-y-streaming/02-kafka-por-dentro.md)

**DLQ (dead letter queue)** — A donde va un mensaje tras agotar los reintentos, con metadatos de la causa. Sin DLQ, un mensaje envenenado bloquea la partición o gira para siempre. → [10·1](cursos/10-mensajeria-y-streaming/01-colas-y-mensajeria.md)

**Event-carried state transfer** — El evento lleva el estado necesario para que el consumidor no tenga que volver a preguntar. Más autonomía a cambio de eventos más gordos y duplicidad de datos. → [10·4](cursos/10-mensajeria-y-streaming/04-patrones-event-driven.md)

**Exactly-once (Kafka EOS)** — Transacciones de Kafka: escribir en varios topics + offsets atómicamente, con `read_committed` y fencing de zombis. Cubre el ecosistema Kafka; los side effects externos siguen necesitando idempotencia. → [10·2](cursos/10-mensajeria-y-streaming/02-kafka-por-dentro.md)

**Exchange / binding / routing key** — El modelo de enrutado de RabbitMQ: el productor publica a un exchange y las colas se suscriben con bindings (direct, topic, fanout, headers). Routing rico que Kafka no tiene. → [10·3](cursos/10-mensajeria-y-streaming/03-rabbitmq-en-produccion.md)

**ISR (in-sync replicas)** — Réplicas al día con el líder de la partición. Los mensajes se confirman contra el ISR; si cae por debajo de `min.insync.replicas`, el topic deja de aceptar escrituras (durabilidad antes que disponibilidad). → [10·2](cursos/10-mensajeria-y-streaming/02-kafka-por-dentro.md)

**Prefetch (basic.qos)** — Cuántos mensajes sin ack puede tener en vuelo un consumidor de RabbitMQ. Bajo = fairness y menos redelivery; alto = throughput. Mal puesto explica la mitad de los problemas de consumo. → [10·3](cursos/10-mensajeria-y-streaming/03-rabbitmq-en-produccion.md)

**Publisher confirms** — El "acks" de RabbitMQ: el broker confirma al productor que persistió el mensaje. Sin confirms + colas durables + mensajes persistentes, hay pérdida silenciosa. → [10·3](cursos/10-mensajeria-y-streaming/03-rabbitmq-en-produccion.md)

**Quorum queue** — Cola replicada por Raft en RabbitMQ (sustituye a las mirrored). Mayoría de nodos para confirmar; trae `x-delivery-count` nativo para mensajes envenenados. → [10·3](cursos/10-mensajeria-y-streaming/03-rabbitmq-en-produccion.md)

**Schema registry** — Registro central de esquemas (Avro/Protobuf/JSON Schema) que rechaza en el productor los cambios incompatibles, según el modo de compatibilidad del subject. El contract testing de los eventos. → [10·4](cursos/10-mensajeria-y-streaming/04-patrones-event-driven.md)

**TTL + DLX** — El patrón de retry con backoff en RabbitMQ: el mensaje muere en una cola de espera por TTL y el dead-letter exchange lo devuelve a trabajo. Ojo al head-of-line blocking del TTL per-message. → [10·3](cursos/10-mensajeria-y-streaming/03-rabbitmq-en-produccion.md)

---

## APIs y contratos

**Breaking change** — Cambio que rompe a un consumidor existente. Solo son seguras las adiciones opcionales — y aun así, si el cliente tolera lo desconocido. → [07·2](cursos/07-apis-y-versionado/02-estrategias-de-versionado.md)

**Compatibilidad backward / forward / full** — Si el consumidor nuevo lee datos viejos / el viejo lee datos nuevos / ambas. Determina el orden de despliegue. → [07·3](cursos/07-apis-y-versionado/03-evolucion-de-datos-y-eventos.md)

**Contract testing** — El consumidor declara sus expectativas y el proveedor las verifica en CI (Pact), con `can-i-deploy` como puerta. → [07·2](cursos/07-apis-y-versionado/02-estrategias-de-versionado.md)

**Problem Details (RFC 9457)** — Formato estándar de error HTTP: `type`, `title`, `status`, `detail`, `instance`. → [07·1](cursos/07-apis-y-versionado/01-diseno-de-contratos.md)

**Sunset / brownout** — Cabecera que anuncia la retirada de una versión / cortes breves y programados para forzar la migración de los rezagados. → [07·2](cursos/07-apis-y-versionado/02-estrategias-de-versionado.md)

---

## Operación y fiabilidad

**Error budget** — Lo que te queda de incumplimiento permitido según tu SLO. Se usa para decidir si se paran las features. → [00·6](cursos/00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)

**Liveness / readiness / startup probe** — ¿Está roto sin remedio? / ¿puede atender ahora? / ¿terminó de arrancar? Confundirlas causa reinicios masivos. → [04·4](cursos/04-cloud-y-kubernetes/04-kubernetes.md)

**RED / USE** — Rate, Errors, Duration para servicios; Utilization, Saturation, Errors para recursos. → [00·6](cursos/00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)

**RTO / RPO** — Cuánto tardas en volver / cuántos datos puedes perder. Definen la estrategia de recuperación ante desastres. → [04·5](cursos/04-cloud-y-kubernetes/05-fiabilidad-y-costos.md)

**SLI / SLO / SLA** — La medida / el objetivo interno / el compromiso contractual. → [00·6](cursos/00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)

**Muestreo head-based / tail-based** — Decidir qué traza guardar al principio (barato) o al final, quedándote con las lentas y erróneas (útil). → [00·6](cursos/00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)

**Throttling de CPU (CFS)** — El contenedor supera su límite de CPU y el kernel lo frena: latencia con la CPU "baja". → [04·4](cursos/04-cloud-y-kubernetes/04-kubernetes.md)

---

## Seguridad

**BOLA / IDOR** — Acceder a un objeto de otro usuario cambiando el id. La vulnerabilidad nº1 de las APIs. → [06·1](cursos/06-seguridad/01-modelo-de-amenazas-y-owasp.md)

**Crypto-shredding** — Borrar los datos de un usuario destruyendo su clave de cifrado; útil con eventos inmutables. → [06·3](cursos/06-seguridad/03-microservicios-y-supply-chain.md)

**Dependency confusion** — Un paquete público con el nombre de uno interno se instala en su lugar. → [06·3](cursos/06-seguridad/03-microservicios-y-supply-chain.md)

**mTLS** — TLS con autenticación de ambos extremos: identidad de servicio a servicio, normalmente automatizada por un service mesh. → [06·3](cursos/06-seguridad/03-microservicios-y-supply-chain.md)

**PKCE** — Extensión de OAuth2 que impide canjear un `code` interceptado. Obligatorio en apps públicas y recomendable en todas. → [06·2](cursos/06-seguridad/02-authn-authz.md)

**SBOM** — Inventario de dependencias de un artefacto. Responde a "¿usamos esa librería vulnerable y dónde?". → [06·3](cursos/06-seguridad/03-microservicios-y-supply-chain.md)

**SSRF** — Tu servidor hace peticiones a URLs controladas por el atacante y alcanza servicios internos o metadatos de la nube. → [06·1](cursos/06-seguridad/01-modelo-de-amenazas-y-owasp.md)

**STRIDE** — Taxonomía de amenazas: suplantación, alteración, repudio, filtración, denegación y elevación de privilegios. → [06·1](cursos/06-seguridad/01-modelo-de-amenazas-y-owasp.md)

**Workload identity (IRSA / Managed Identity)** — El proceso obtiene credenciales temporales por su identidad, sin secretos estáticos. → [04·3](cursos/04-cloud-y-kubernetes/03-identidad-red-y-datos.md)

---

## Lenguajes

**Escape analysis** (Go, JVM) — El compilador decide si un valor vive en el stack (gratis) o en el heap (lo recoge el GC). → [03·2](cursos/03-go-senior/02-runtime-memoria-y-gc.md)

**GMP** (Go) — Goroutines, hilos del SO y procesadores lógicos: el modelo del scheduler. → [03·1](cursos/03-go-senior/01-concurrencia-y-context.md)

**GOMEMLIMIT** (Go) — Límite soft de memoria; la forma correcta de evitar OOMKill en contenedores. → [03·2](cursos/03-go-senior/02-runtime-memoria-y-gc.md)

**Happens-before** (Java) — Relación que garantiza visibilidad y orden entre hilos. Sin ella hay data race, aunque "funcione". → [01·2](cursos/01-java-senior/02-concurrencia-y-jmm.md)

**Pinning** (Java, Loom) — Un virtual thread que bloquea dentro de `synchronized` no puede desmontarse y ocupa su carrier. → [01·2](cursos/01-java-senior/02-concurrencia-y-jmm.md)

**Starvation de microtasks** (Node) — Las promesas se vacían enteras antes de volver al bucle: un ciclo recursivo deja al servidor sin atender. → [02·2](cursos/02-typescript-node-senior/02-event-loop-y-rendimiento.md)

**Typed nil** (Go) — Una interfaz con tipo y valor nil no es `nil`: `err != nil` se cumple con un error "vacío". → [03·2](cursos/03-go-senior/02-runtime-memoria-y-gc.md)

**Distributividad de conditional types** (TypeScript) — El condicional se aplica a cada miembro de la unión; es lo que hace funcionar `Exclude`. → [02·1](cursos/02-typescript-node-senior/01-sistema-de-tipos.md)

---

## Frontend

**Module Federation** — Cargar módulos de otra aplicación en tiempo de ejecución, con negociación de dependencias compartidas. → [05·2](cursos/05-microfrontends/02-module-federation.md)

**Singleton (shared)** — Marca una dependencia para que exista una sola instancia; sin ella acabas con dos Reacts en la página. → [05·2](cursos/05-microfrontends/02-module-federation.md)

**Waterfall de carga** — Cadena secuencial de peticiones (manifest → remoteEntry → chunk → datos) que suma latencias. → [05·4](cursos/05-microfrontends/04-operacion-y-performance.md)

**Ley de Conway** — Las organizaciones producen sistemas con la forma de su estructura de comunicación. → [05·1](cursos/05-microfrontends/01-por-que-y-cuando.md)
