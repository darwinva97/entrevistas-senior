# Entrevistas Técnicas — Java Senior con Microservicios

Banco de preguntas de entrevista para posiciones **Java Senior** con arquitectura de **microservicios**. Cada pregunta incluye una respuesta resumen (30–60 segundos) y una respuesta detallada con código realista, trade-offs, errores comunes y lo que el entrevistador espera oír.


> 🎓 **¿Te faltan bases para responder esto?** El curso [Java senior + Spring](../cursos/01-java-senior/) enseña exactamente lo necesario, con laboratorios y autoevaluación.
> Ver también: [índice completo](../INDICE.md) · [plan de estudio](../PLAN-DE-ESTUDIO.md) · [glosario](../GLOSARIO.md) · [inicio](../README.md)

## Archivos

| Archivo | Contenido | Preguntas |
|---|---|---|
| [01-java-core-avanzado.md](01-java-core-avanzado.md) | JVM internals, GC, JMM, concurrencia avanzada, Loom, colecciones, Java moderno, Streams | 15 |
| [02-spring-y-microservicios.md](02-spring-y-microservicios.md) | Spring Boot/Cloud internals, transacciones, resiliencia, Kafka, patrones distribuidos, observabilidad, testing | 16 |
| [03-casos-y-problemas.md](03-casos-y-problemas.md) | Casos de producción [CASO]: diagnóstico paso a paso, herramientas, solución y prevención | 15 |

**Total: 46 preguntas.**

---

## Índice de preguntas

### 01 — Java Core Avanzado

1. ¿Cómo funciona G1 GC internamente y qué parámetros clave usarías para hacer tuning?
2. ¿Cuándo elegirías ZGC o Shenandoah en lugar de G1? ¿Qué sacrificas?
3. Explica el Java Memory Model: ¿qué es happens-before y por qué importa?
4. `volatile` vs `synchronized` vs `AtomicLong`/VarHandle: ¿cuándo usar cada uno?
5. ¿Qué garantías especiales dan los campos `final` y qué es la publicación segura (safe publication)?
6. `CompletableFuture`: composición, manejo de errores y sus pitfalls principales
7. ForkJoinPool y work-stealing: ¿cómo funciona y qué problemas causa el commonPool?
8. Virtual threads (Project Loom): ¿cómo funcionan, cuándo usarlos y qué es el pinning?
9. Structured concurrency: ¿qué problema resuelve frente a ExecutorService y CompletableFuture?
10. HashMap por dentro: hashing, resize, treeification y por qué es peligroso en concurrencia
11. ConcurrentHashMap: ¿cómo logra thread-safety sin un lock global y qué garantías da?
12. Records: ¿qué aportan realmente, qué limitaciones tienen y cuándo NO usarlos?
13. Sealed classes + pattern matching: ¿cómo cambian el diseño de dominio en Java moderno?
14. Streams paralelos: ¿cuándo ayudan, cuándo perjudican y cuáles son sus pitfalls?
15. Streams secuenciales: pitfalls avanzados que delatan a un desarrollador junior

### 02 — Spring y Microservicios

1. ¿Cómo funciona la auto-configuración de Spring Boot por dentro?
2. @Transactional: propagación, rollback y los pitfalls del proxy
3. ¿Cómo implementarías circuit breakers con Resilience4j y qué configuración importa de verdad?
4. Comunicación síncrona vs asíncrona entre microservicios: ¿cómo decides?
5. Kafka: consumer groups y rebalancing — ¿qué pasa exactamente y cómo lo controlas?
6. Kafka: ¿qué significa exactly-once realmente y cómo se consigue con Java?
7. Patrón Saga: orquestación vs coreografía para transacciones distribuidas
8. Patrón Outbox: ¿cómo publicas eventos de forma atómica con tu transacción de BD?
9. Proxies en Spring (JDK vs CGLIB) y ciclo de vida de beans: ¿qué errores reales causan?
10. Spring Cloud Config y configuración dinámica: ¿cómo refrescas configuración sin redeploy y qué riesgos tiene?
11. Spring Cloud Gateway: ¿qué papel juega y cómo implementarías rate limiting y resiliencia en el borde?
12. CQRS y Event Sourcing: ¿qué resuelven, cómo se implementan y cuándo son una mala idea?
13. Service discovery: ¿Eureka, DNS de Kubernetes o service mesh? ¿Client-side o server-side?
14. Observabilidad en microservicios Java: Micrometer, OpenTelemetry y qué instrumentar
15. Testcontainers: ¿cómo testeas integración real (BD, Kafka) sin mocks y sin flakiness?
16. Contract testing con Pact: ¿cómo evitas romper consumidores sin tests E2E?

### 03 — Casos y Problemas de Producción (todos [CASO])

1. Memory leak en producción: el heap crece hasta OOM cada 3 días
2. Latencia p99 alta en un servicio Spring Boot con p50 normal: ¿cómo lo investigas?
3. Thread pool exhaustion: Tomcat deja de responder pero la CPU está al 10%
4. Deadlock en producción: dos funcionalidades se congelan a la vez de forma intermitente
5. Consumer lag creciente en Kafka: el consumidor procesa pero cada vez va más atrás
6. Mensajes duplicados: facturación cobró dos veces el mismo pedido
7. Transacción distribuida que deja datos inconsistentes: pedido pagado sin stock reservado
8. N+1 queries con JPA/Hibernate: un listado que hace 400 queries
9. OutOfMemoryError: Metaspace tras varios redeploys o en un servicio con mucha reflection
10. Un servicio degradado tumba en cascada a toda la plataforma: anatomía y defensa
11. Migrar un monolito a microservicios: ¿por dónde empiezas y cómo evitas el desastre?
12. Full GC pauses de varios segundos: los health checks fallan y los pods se reinician
13. HikariCP agotado: "Connection is not available, request timed out after 30000ms"
14. Pérdida de mensajes: un evento de pedido nunca llegó a facturación
15. Hot partition en Kafka: una partición concentra el tráfico y un consumer va ahogado

---

## Cómo usar este material

- **Repaso rápido antes de la entrevista:** leer solo las secciones "📝 Respuesta resumen" — están calibradas para responderse en 30–60 segundos.
- **Estudio profundo:** las secciones "📖 Respuesta detallada" incluyen el código, los trade-offs y los matices que distinguen una respuesta senior.
- **Práctica de casos:** en el archivo 03, tapar la respuesta y practicar el diagnóstico en voz alta: hipótesis → herramientas (jstack, jmap, async-profiler, MAT, GC logs, métricas) → solución → prevención.
