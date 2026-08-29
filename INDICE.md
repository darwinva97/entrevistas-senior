# 📑 Índice completo del banco de preguntas

> Fichero generado por `scripts/generar-indice.mjs`. **No lo edites a mano:** ejecuta `npm run indice`.

**494 preguntas** en 11 áreas · **209** marcadas como `[CASO]` (análisis de problemas).

¿No sabes por dónde empezar? Los [cursos](cursos/) enseñan lo necesario para responderlas.

| Área | Preguntas | [CASO] |
|---|:-:|:-:|
| ☕ [Java Senior + Microservicios](#java-senior-microservicios) | 62 | 17 |
| 🟦 [TypeScript Senior + Microservicios](#typescript-senior-microservicios) | 48 | 26 |
| 🐹 [Golang Senior + Microservicios](#golang-senior-microservicios) | 55 | 18 |
| ☁️ [AWS](#aws) | 47 | 16 |
| ☁️ [Azure](#azure) | 30 | 12 |
| ☁️ [GCP](#gcp) | 31 | 12 |
| 🧩 [Microfrontends](#microfrontends) | 30 | 12 |
| 🔐 [Seguridad y Vulnerabilidades](#seguridad-y-vulnerabilidades) | 42 | 13 |
| 🔄 [Versionamiento de APIs](#versionamiento-de-apis) | 40 | 16 |
| 📨 [Mensajería y Event-Driven (Kafka · RabbitMQ · Colas)](#mensajería-y-event-driven-kafka-rabbitmq-colas) | 59 | 17 |
| 🧠 [Casos de Estudio Transversales](#casos-de-estudio-transversales) | 50 | 50 |
| **Total** | **494** | **209** |

---

## ☕ Java Senior + Microservicios

Carpeta: [`java-microservicios/`](java-microservicios/) · 62 preguntas

### Java Core Avanzado — Preguntas de Entrevista Senior

[`01-java-core-avanzado.md`](java-microservicios/01-java-core-avanzado.md) · 15 preguntas

1. [¿Cómo funciona G1 GC internamente y qué parámetros clave usarías para hacer tuning?](java-microservicios/01-java-core-avanzado.md#1-cómo-funciona-g1-gc-internamente-y-qué-parámetros-clave-usarías-para-hacer-tuning) — <sub>JVM / Garbage Collection</sub>
2. [¿Cuándo elegirías ZGC o Shenandoah en lugar de G1? ¿Qué sacrificas?](java-microservicios/01-java-core-avanzado.md#2-cuándo-elegirías-zgc-o-shenandoah-en-lugar-de-g1-qué-sacrificas) — <sub>JVM / Garbage Collection</sub>
3. [Explica el Java Memory Model: ¿qué es happens-before y por qué importa?](java-microservicios/01-java-core-avanzado.md#3-explica-el-java-memory-model-qué-es-happens-before-y-por-qué-importa) — <sub>Concurrencia / JMM</sub>
4. [`volatile` vs `synchronized` vs `AtomicLong`/VarHandle: ¿cuándo usar cada uno?](java-microservicios/01-java-core-avanzado.md#4-volatile-vs-synchronized-vs-atomiclongvarhandle-cuándo-usar-cada-uno) — <sub>Concurrencia / JMM</sub>
5. [¿Qué garantías especiales dan los campos `final` y qué es la publicación segura (safe publication)?](java-microservicios/01-java-core-avanzado.md#5-qué-garantías-especiales-dan-los-campos-final-y-qué-es-la-publicación-segura-safe-publication) — <sub>Concurrencia / JMM</sub>
6. [`CompletableFuture`: composición, manejo de errores y sus pitfalls principales](java-microservicios/01-java-core-avanzado.md#6-completablefuture-composición-manejo-de-errores-y-sus-pitfalls-principales) — <sub>Concurrencia</sub>
7. [ForkJoinPool y work-stealing: ¿cómo funciona y qué problemas causa el commonPool?](java-microservicios/01-java-core-avanzado.md#7-forkjoinpool-y-work-stealing-cómo-funciona-y-qué-problemas-causa-el-commonpool) — <sub>Concurrencia</sub>
8. [Virtual threads (Project Loom): ¿cómo funcionan, cuándo usarlos y qué es el pinning?](java-microservicios/01-java-core-avanzado.md#8-virtual-threads-project-loom-cómo-funcionan-cuándo-usarlos-y-qué-es-el-pinning) — <sub>Concurrencia / Loom</sub>
9. [Structured concurrency: ¿qué problema resuelve frente a ExecutorService y CompletableFuture?](java-microservicios/01-java-core-avanzado.md#9-structured-concurrency-qué-problema-resuelve-frente-a-executorservice-y-completablefuture) — <sub>Concurrencia / Loom</sub>
10. [HashMap por dentro: hashing, resize, treeification y por qué es peligroso en concurrencia](java-microservicios/01-java-core-avanzado.md#10-hashmap-por-dentro-hashing-resize-treeification-y-por-qué-es-peligroso-en-concurrencia) — <sub>Colecciones</sub>
11. [ConcurrentHashMap: ¿cómo logra thread-safety sin un lock global y qué garantías da?](java-microservicios/01-java-core-avanzado.md#11-concurrenthashmap-cómo-logra-thread-safety-sin-un-lock-global-y-qué-garantías-da) — <sub>Colecciones / Concurrencia</sub>
12. [Records: ¿qué aportan realmente, qué limitaciones tienen y cuándo NO usarlos?](java-microservicios/01-java-core-avanzado.md#12-records-qué-aportan-realmente-qué-limitaciones-tienen-y-cuándo-no-usarlos) — <sub>Lenguaje moderno</sub>
13. [Sealed classes + pattern matching: ¿cómo cambian el diseño de dominio en Java moderno?](java-microservicios/01-java-core-avanzado.md#13-sealed-classes--pattern-matching-cómo-cambian-el-diseño-de-dominio-en-java-moderno) — <sub>Lenguaje moderno</sub>
14. [Streams paralelos: ¿cuándo ayudan, cuándo perjudican y cuáles son sus pitfalls?](java-microservicios/01-java-core-avanzado.md#14-streams-paralelos-cuándo-ayudan-cuándo-perjudican-y-cuáles-son-sus-pitfalls) — <sub>Streams / Concurrencia</sub>
15. [Streams secuenciales: pitfalls avanzados que delatan a un desarrollador junior](java-microservicios/01-java-core-avanzado.md#15-streams-secuenciales-pitfalls-avanzados-que-delatan-a-un-desarrollador-junior) — <sub>Streams</sub>

### Spring y Microservicios — Preguntas de Entrevista Senior

[`02-spring-y-microservicios.md`](java-microservicios/02-spring-y-microservicios.md) · 16 preguntas

1. [¿Cómo funciona la auto-configuración de Spring Boot por dentro?](java-microservicios/02-spring-y-microservicios.md#1-cómo-funciona-la-auto-configuración-de-spring-boot-por-dentro) — <sub>Spring Boot internals</sub>
2. [@Transactional: propagación, rollback y los pitfalls del proxy](java-microservicios/02-spring-y-microservicios.md#2-transactional-propagación-rollback-y-los-pitfalls-del-proxy) — <sub>Spring / Transacciones</sub>
3. [¿Cómo implementarías circuit breakers con Resilience4j y qué configuración importa de verdad?](java-microservicios/02-spring-y-microservicios.md#3-cómo-implementarías-circuit-breakers-con-resilience4j-y-qué-configuración-importa-de-verdad) — <sub>Resiliencia</sub>
4. [Comunicación síncrona vs asíncrona entre microservicios: ¿cómo decides?](java-microservicios/02-spring-y-microservicios.md#4-comunicación-síncrona-vs-asíncrona-entre-microservicios-cómo-decides) — <sub>Arquitectura</sub>
5. [Kafka: consumer groups y rebalancing — ¿qué pasa exactamente y cómo lo controlas?](java-microservicios/02-spring-y-microservicios.md#5-kafka-consumer-groups-y-rebalancing--qué-pasa-exactamente-y-cómo-lo-controlas) — <sub>Kafka</sub>
6. [Kafka: ¿qué significa exactly-once realmente y cómo se consigue con Java?](java-microservicios/02-spring-y-microservicios.md#6-kafka-qué-significa-exactly-once-realmente-y-cómo-se-consigue-con-java) — <sub>Kafka</sub>
7. [Patrón Saga: orquestación vs coreografía para transacciones distribuidas](java-microservicios/02-spring-y-microservicios.md#7-patrón-saga-orquestación-vs-coreografía-para-transacciones-distribuidas) — <sub>Patrones</sub>
8. [Patrón Outbox: ¿cómo publicas eventos de forma atómica con tu transacción de BD?](java-microservicios/02-spring-y-microservicios.md#8-patrón-outbox-cómo-publicas-eventos-de-forma-atómica-con-tu-transacción-de-bd) — <sub>Patrones / Kafka</sub>
9. [Proxies en Spring (JDK vs CGLIB) y ciclo de vida de beans: ¿qué errores reales causan?](java-microservicios/02-spring-y-microservicios.md#9-proxies-en-spring-jdk-vs-cglib-y-ciclo-de-vida-de-beans-qué-errores-reales-causan) — <sub>Spring internals</sub>
10. [Spring Cloud Config y configuración dinámica: ¿cómo refrescas configuración sin redeploy y qué riesgos tiene?](java-microservicios/02-spring-y-microservicios.md#10-spring-cloud-config-y-configuración-dinámica-cómo-refrescas-configuración-sin-redeploy-y-qué-riesgos-tiene) — <sub>Spring Cloud</sub>
11. [Spring Cloud Gateway: ¿qué papel juega y cómo implementarías rate limiting y resiliencia en el borde?](java-microservicios/02-spring-y-microservicios.md#11-spring-cloud-gateway-qué-papel-juega-y-cómo-implementarías-rate-limiting-y-resiliencia-en-el-borde) — <sub>Spring Cloud</sub>
12. [CQRS y Event Sourcing: ¿qué resuelven, cómo se implementan y cuándo son una mala idea?](java-microservicios/02-spring-y-microservicios.md#12-cqrs-y-event-sourcing-qué-resuelven-cómo-se-implementan-y-cuándo-son-una-mala-idea) — <sub>Patrones</sub>
13. [Service discovery: ¿Eureka, DNS de Kubernetes o service mesh? ¿Client-side o server-side?](java-microservicios/02-spring-y-microservicios.md#13-service-discovery-eureka-dns-de-kubernetes-o-service-mesh-client-side-o-server-side) — <sub>Infraestructura de microservicios</sub>
14. [Observabilidad en microservicios Java: Micrometer, OpenTelemetry y qué instrumentar](java-microservicios/02-spring-y-microservicios.md#14-observabilidad-en-microservicios-java-micrometer-opentelemetry-y-qué-instrumentar) — <sub>Observabilidad</sub>
15. [Testcontainers: ¿cómo testeas integración real (BD, Kafka) sin mocks y sin flakiness?](java-microservicios/02-spring-y-microservicios.md#15-testcontainers-cómo-testeas-integración-real-bd-kafka-sin-mocks-y-sin-flakiness) — <sub>Testing</sub>
16. [Contract testing con Pact: ¿cómo evitas romper consumidores sin tests E2E?](java-microservicios/02-spring-y-microservicios.md#16-contract-testing-con-pact-cómo-evitas-romper-consumidores-sin-tests-e2e) — <sub>Testing</sub>

### Casos y Problemas de Producción — Preguntas de Entrevista Senior

[`03-casos-y-problemas.md`](java-microservicios/03-casos-y-problemas.md) · 15 preguntas

1. [Memory leak en producción: el heap crece hasta OOM cada 3 días](java-microservicios/03-casos-y-problemas.md#1-memory-leak-en-producción-el-heap-crece-hasta-oom-cada-3-días) `[CASO]` — <sub>JVM / Troubleshooting</sub>
2. [Latencia p99 alta en un servicio Spring Boot con p50 normal: ¿cómo lo investigas?](java-microservicios/03-casos-y-problemas.md#2-latencia-p99-alta-en-un-servicio-spring-boot-con-p50-normal-cómo-lo-investigas) `[CASO]` — <sub>Performance</sub>
3. [Thread pool exhaustion: Tomcat deja de responder pero la CPU está al 10%](java-microservicios/03-casos-y-problemas.md#3-thread-pool-exhaustion-tomcat-deja-de-responder-pero-la-cpu-está-al-10) `[CASO]` — <sub>Concurrencia / Spring</sub>
4. [Deadlock en producción: dos funcionalidades se congelan a la vez de forma intermitente](java-microservicios/03-casos-y-problemas.md#4-deadlock-en-producción-dos-funcionalidades-se-congelan-a-la-vez-de-forma-intermitente) `[CASO]` — <sub>Concurrencia</sub>
5. [Consumer lag creciente en Kafka: el consumidor procesa pero cada vez va más atrás](java-microservicios/03-casos-y-problemas.md#5-consumer-lag-creciente-en-kafka-el-consumidor-procesa-pero-cada-vez-va-más-atrás) `[CASO]` — <sub>Kafka</sub>
6. [Mensajes duplicados: facturación cobró dos veces el mismo pedido](java-microservicios/03-casos-y-problemas.md#6-mensajes-duplicados-facturación-cobró-dos-veces-el-mismo-pedido) `[CASO]` — <sub>Kafka / Patrones</sub>
7. [Transacción distribuida que deja datos inconsistentes: pedido pagado sin stock reservado](java-microservicios/03-casos-y-problemas.md#7-transacción-distribuida-que-deja-datos-inconsistentes-pedido-pagado-sin-stock-reservado) `[CASO]` — <sub>Patrones / Datos distribuidos</sub>
8. [N+1 queries con JPA/Hibernate: un listado que hace 400 queries](java-microservicios/03-casos-y-problemas.md#8-n1-queries-con-jpahibernate-un-listado-que-hace-400-queries) `[CASO]` — <sub>JPA / Performance</sub>
9. [OutOfMemoryError: Metaspace tras varios redeploys o en un servicio con mucha reflection](java-microservicios/03-casos-y-problemas.md#9-outofmemoryerror-metaspace-tras-varios-redeploys-o-en-un-servicio-con-mucha-reflection) `[CASO]` — <sub>JVM / Troubleshooting</sub>
10. [Un servicio degradado tumba en cascada a toda la plataforma: anatomía y defensa](java-microservicios/03-casos-y-problemas.md#10-un-servicio-degradado-tumba-en-cascada-a-toda-la-plataforma-anatomía-y-defensa) `[CASO]` — <sub>Resiliencia / Arquitectura</sub>
11. [Migrar un monolito a microservicios: ¿por dónde empiezas y cómo evitas el desastre?](java-microservicios/03-casos-y-problemas.md#11-migrar-un-monolito-a-microservicios-por-dónde-empiezas-y-cómo-evitas-el-desastre) `[CASO]` — <sub>Arquitectura / Migración</sub>
12. [Full GC pauses de varios segundos: los health checks fallan y los pods se reinician](java-microservicios/03-casos-y-problemas.md#12-full-gc-pauses-de-varios-segundos-los-health-checks-fallan-y-los-pods-se-reinician) `[CASO]` — <sub>JVM / GC</sub>
13. [HikariCP agotado: "Connection is not available, request timed out after 30000ms"](java-microservicios/03-casos-y-problemas.md#13-hikaricp-agotado-connection-is-not-available-request-timed-out-after-30000ms) `[CASO]` — <sub>Base de datos / Spring</sub>
14. [Pérdida de mensajes: un evento de pedido nunca llegó a facturación](java-microservicios/03-casos-y-problemas.md#14-pérdida-de-mensajes-un-evento-de-pedido-nunca-llegó-a-facturación) `[CASO]` — <sub>Kafka</sub>
15. [Hot partition en Kafka: una partición concentra el tráfico y un consumer va ahogado](java-microservicios/03-casos-y-problemas.md#15-hot-partition-en-kafka-una-partición-concentra-el-tráfico-y-un-consumer-va-ahogado) `[CASO]` — <sub>Kafka</sub>

### Quarkus, MicroProfile y Native Image — Preguntas de Entrevista Senior

[`04-quarkus-y-native.md`](java-microservicios/04-quarkus-y-native.md) · 16 preguntas

1. [¿Qué hace diferente a Quarkus de Spring Boot por dentro? Build-time processing](java-microservicios/04-quarkus-y-native.md#1-qué-hace-diferente-a-quarkus-de-spring-boot-por-dentro-build-time-processing) — <sub>Quarkus internals</sub>
2. [ArC: el CDI de Quarkus — qué implementa, qué no, y el error del "bean eliminado"](java-microservicios/04-quarkus-y-native.md#2-arc-el-cdi-de-quarkus--qué-implementa-qué-no-y-el-error-del-bean-eliminado) — <sub>Quarkus / CDI</sub>
3. [GraalVM Native Image: closed-world assumption — qué se rompe y cómo se registra](java-microservicios/04-quarkus-y-native.md#3-graalvm-native-image-closed-world-assumption--qué-se-rompe-y-cómo-se-registra) — <sub>Native Image</sub>
4. [JVM vs native: ¿cuándo compensa de verdad compilar a native?](java-microservicios/04-quarkus-y-native.md#4-jvm-vs-native-cuándo-compensa-de-verdad-compilar-a-native) — <sub>Native Image / Arquitectura</sub>
5. [Mutiny y el modelo reactivo de Quarkus: Uni, Multi, event loop y @Blocking](java-microservicios/04-quarkus-y-native.md#5-mutiny-y-el-modelo-reactivo-de-quarkus-uni-multi-event-loop-y-blocking) — <sub>Reactivo / Mutiny</sub>
6. [RESTEasy Reactive: imperativo y reactivo en el mismo stack — ¿cómo decide el dispatch?](java-microservicios/04-quarkus-y-native.md#6-resteasy-reactive-imperativo-y-reactivo-en-el-mismo-stack--cómo-decide-el-dispatch) — <sub>REST / Quarkus</sub>
7. [Panache: active record vs repository, límites y Panache reactive](java-microservicios/04-quarkus-y-native.md#7-panache-active-record-vs-repository-límites-y-panache-reactive) — <sub>Persistencia / Panache</sub>
8. [Configuración en Quarkus: MicroProfile Config, @ConfigMapping, perfiles y la trampa build-time](java-microservicios/04-quarkus-y-native.md#8-configuración-en-quarkus-microprofile-config-configmapping-perfiles-y-la-trampa-build-time) — <sub>Configuración</sub>
9. [SmallRye Fault Tolerance: semántica exacta de @Retry, @Timeout, @CircuitBreaker, @Bulkhead y @Fallback](java-microservicios/04-quarkus-y-native.md#9-smallrye-fault-tolerance-semántica-exacta-de-retry-timeout-circuitbreaker-bulkhead-y-fallback) — <sub>Resiliencia / MicroProfile</sub>
10. [Reactive Messaging con Kafka: channels, ack, commit strategies y concurrencia](java-microservicios/04-quarkus-y-native.md#10-reactive-messaging-con-kafka-channels-ack-commit-strategies-y-concurrencia) — <sub>Mensajería / Kafka</sub>
11. [Dev mode y Dev Services: live reload, testcontainers automáticos y continuous testing](java-microservicios/04-quarkus-y-native.md#11-dev-mode-y-dev-services-live-reload-testcontainers-automáticos-y-continuous-testing) — <sub>Developer Experience</sub>
12. [Testing en Quarkus: @QuarkusTest, @QuarkusIntegrationTest, @InjectMock y test profiles](java-microservicios/04-quarkus-y-native.md#12-testing-en-quarkus-quarkustest-quarkusintegrationtest-injectmock-y-test-profiles) — <sub>Testing</sub>
13. [Transacciones en Quarkus: Narayana, propagación y el choque bloqueante/reactivo](java-microservicios/04-quarkus-y-native.md#13-transacciones-en-quarkus-narayana-propagación-y-el-choque-bloqueantereactivo) — <sub>Transacciones</sub>
14. [MicroProfile REST Client: interfaces tipadas, fault tolerance y propagación de contexto](java-microservicios/04-quarkus-y-native.md#14-microprofile-rest-client-interfaces-tipadas-fault-tolerance-y-propagación-de-contexto) — <sub>Integración / MicroProfile</sub>
15. [\[CASO\] En JVM funciona, el binario native peta en producción al deserializar un payload](java-microservicios/04-quarkus-y-native.md#15-caso-en-jvm-funciona-el-binario-native-peta-en-producción-al-deserializar-un-payload) `[CASO]` — <sub>Native Image / Troubleshooting</sub>
16. [\[CASO\] Migrar 40 microservicios Spring Boot a Quarkus: ¿tiene sentido? Plan y criterios](java-microservicios/04-quarkus-y-native.md#16-caso-migrar-40-microservicios-spring-boot-a-quarkus-tiene-sentido-plan-y-criterios) `[CASO]` — <sub>Arquitectura / Migración</sub>

---

## 🟦 TypeScript Senior + Microservicios

Carpeta: [`typescript-microservicios/`](typescript-microservicios/) · 48 preguntas

### TypeScript Avanzado — Preguntas de Entrevista Senior

[`01-typescript-avanzado.md`](typescript-microservicios/01-typescript-avanzado.md) · 16 preguntas

1. [¿Qué son los conditional types y cómo funciona `infer`?](typescript-microservicios/01-typescript-avanzado.md#1-qué-son-los-conditional-types-y-cómo-funciona-infer) — <sub>Type System</sub>
2. [Distributividad de conditional types: ¿por qué `Exclude` funciona y cuándo hay que desactivarla?](typescript-microservicios/01-typescript-avanzado.md#2-distributividad-de-conditional-types-por-qué-exclude-funciona-y-cuándo-hay-que-desactivarla) `[CASO]` — <sub>Type System</sub>
3. [Mapped types: key remapping con `as` y modificadores `+/-`](typescript-microservicios/01-typescript-avanzado.md#3-mapped-types-key-remapping-con-as-y-modificadores--) — <sub>Type System</sub>
4. [Template literal types: rutas y eventos tipados](typescript-microservicios/01-typescript-avanzado.md#4-template-literal-types-rutas-y-eventos-tipados) `[CASO]` — <sub>Type System</sub>
5. [Varianza: covarianza, contravarianza, `strictFunctionTypes` y bivarianza de métodos](typescript-microservicios/01-typescript-avanzado.md#5-varianza-covarianza-contravarianza-strictfunctiontypes-y-bivarianza-de-métodos) — <sub>Type System</sub>
6. [Type narrowing: type guards con `is`, discriminated unions, `asserts` y exhaustividad con `never`](typescript-microservicios/01-typescript-avanzado.md#6-type-narrowing-type-guards-con-is-discriminated-unions-asserts-y-exhaustividad-con-never) `[CASO]` — <sub>Type System</sub>
7. [Branded types: tipado nominal sobre un sistema estructural](typescript-microservicios/01-typescript-avanzado.md#7-branded-types-tipado-nominal-sobre-un-sistema-estructural) — <sub>Type System / Diseño de dominio</sub>
8. [`satisfies` vs anotación de tipo vs `as`: ¿cuándo usar cada uno?](typescript-microservicios/01-typescript-avanzado.md#8-satisfies-vs-anotación-de-tipo-vs-as-cuándo-usar-cada-uno) — <sub>Type System</sub>
9. [Generics avanzados: constraints, defaults, inferencia parcial y sobre-genericidad](typescript-microservicios/01-typescript-avanzado.md#9-generics-avanzados-constraints-defaults-inferencia-parcial-y-sobre-genericidad) — <sub>Type System / Diseño de API</sub>
10. [Structural typing: excess property checks y compatibilidad accidental](typescript-microservicios/01-typescript-avanzado.md#10-structural-typing-excess-property-checks-y-compatibilidad-accidental) `[CASO]` — <sub>Type System</sub>
11. [`unknown` vs `any` vs `never`: fronteras de API y manejo de errores](typescript-microservicios/01-typescript-avanzado.md#11-unknown-vs-any-vs-never-fronteras-de-api-y-manejo-de-errores) — <sub>Type System / Robustez</sub>
12. [Declaration merging y module augmentation: extender Express Request y tipos globales](typescript-microservicios/01-typescript-avanzado.md#12-declaration-merging-y-module-augmentation-extender-express-request-y-tipos-globales) `[CASO]` — <sub>Módulos / Interop</sub>
13. [tsconfig estricto para servicios Node modernos: qué flags activar y por qué](typescript-microservicios/01-typescript-avanzado.md#13-tsconfig-estricto-para-servicios-node-modernos-qué-flags-activar-y-por-qué) — <sub>Tooling / Configuración</sub>
14. [Monorepos TypeScript: project references, builds incrementales y Turborepo/Nx](typescript-microservicios/01-typescript-avanzado.md#14-monorepos-typescript-project-references-builds-incrementales-y-turboreponx) `[CASO]` — <sub>Tooling / Arquitectura</sub>
15. [Decoradores: legacy (`experimentalDecorators`) vs estándar TC39 — y por qué NestJS sigue en legacy](typescript-microservicios/01-typescript-avanzado.md#15-decoradores-legacy-experimentaldecorators-vs-estándar-tc39--y-por-qué-nestjs-sigue-en-legacy) — <sub>Lenguaje / Frameworks</sub>
16. [Validación runtime con Zod: los tipos se borran, las fronteras no se defienden solas](typescript-microservicios/01-typescript-avanzado.md#16-validación-runtime-con-zod-los-tipos-se-borran-las-fronteras-no-se-defienden-solas) `[CASO]` — <sub>Robustez / Fronteras del sistema</sub>

### Node.js y Microservicios — Preguntas de Entrevista Senior

[`02-node-y-microservicios.md`](typescript-microservicios/02-node-y-microservicios.md) · 16 preguntas

1. [Explica las fases del event loop de Node.js y qué se ejecuta en cada una](typescript-microservicios/02-node-y-microservicios.md#1-explica-las-fases-del-event-loop-de-nodejs-y-qué-se-ejecuta-en-cada-una) — <sub>Runtime de Node.js</sub>
2. [\[CASO\] Un servicio deja de responder a health checks aunque el proceso sigue vivo: sospechas de starvation de microtasks. ¿Qué está pasando y cómo lo diagnosticas?](typescript-microservicios/02-node-y-microservicios.md#2-caso-un-servicio-deja-de-responder-a-health-checks-aunque-el-proceso-sigue-vivo-sospechas-de-starvation-de-microtasks-qué-está-pasando-y-cómo-lo-diagnosticas) `[CASO]` — <sub>Runtime de Node.js</sub>
3. [Worker threads vs cluster vs child_process: ¿cuándo usarías cada uno?](typescript-microservicios/02-node-y-microservicios.md#3-worker-threads-vs-cluster-vs-child_process-cuándo-usarías-cada-uno) — <sub>Runtime de Node.js</sub>
4. [Streams y backpressure: ¿cómo procesarías un archivo de 10 GB de pedidos sin tumbar el servicio?](typescript-microservicios/02-node-y-microservicios.md#4-streams-y-backpressure-cómo-procesarías-un-archivo-de-10-gb-de-pedidos-sin-tumbar-el-servicio) — <sub>Runtime de Node.js</sub>
5. [Inyección de dependencias en NestJS: providers, scopes y su coste](typescript-microservicios/02-node-y-microservicios.md#5-inyección-de-dependencias-en-nestjs-providers-scopes-y-su-coste) — <sub>NestJS</sub>
6. [Guards, interceptors, pipes y exception filters en NestJS: orden de ejecución y casos de uso](typescript-microservicios/02-node-y-microservicios.md#6-guards-interceptors-pipes-y-exception-filters-en-nestjs-orden-de-ejecución-y-casos-de-uso) — <sub>NestJS</sub>
7. [REST vs gRPC entre microservicios con TypeScript: ¿cuándo eliges cada uno?](typescript-microservicios/02-node-y-microservicios.md#7-rest-vs-grpc-entre-microservicios-con-typescript-cuándo-eliges-cada-uno) — <sub>Comunicación entre servicios</sub>
8. [Kafka vs RabbitMQ vs BullMQ: ¿cómo eliges la tecnología de mensajería?](typescript-microservicios/02-node-y-microservicios.md#8-kafka-vs-rabbitmq-vs-bullmq-cómo-eliges-la-tecnología-de-mensajería) — <sub>Mensajería</sub>
9. [Patrón Saga: coreografía vs orquestación en un flujo de pedidos y pagos](typescript-microservicios/02-node-y-microservicios.md#9-patrón-saga-coreografía-vs-orquestación-en-un-flujo-de-pedidos-y-pagos) — <sub>Patrones de microservicios</sub>
10. [Patrón Outbox e idempotencia: ¿cómo consigues "exactly-once efectivo" entre base de datos y broker?](typescript-microservicios/02-node-y-microservicios.md#10-patrón-outbox-e-idempotencia-cómo-consigues-exactly-once-efectivo-entre-base-de-datos-y-broker) — <sub>Patrones de microservicios</sub>
11. [\[CASO\] Al desplegar en Kubernetes se pierden peticiones y quedan jobs a medias: diseña el graceful shutdown](typescript-microservicios/02-node-y-microservicios.md#11-caso-al-desplegar-en-kubernetes-se-pierden-peticiones-y-quedan-jobs-a-medias-diseña-el-graceful-shutdown) `[CASO]` — <sub>Operación / Kubernetes</sub>
12. [Manejo de errores async en Node: unhandled rejections, captureRejections y por qué no "tragar" errores](typescript-microservicios/02-node-y-microservicios.md#12-manejo-de-errores-async-en-node-unhandled-rejections-capturerejections-y-por-qué-no-tragar-errores) — <sub>Runtime de Node.js</sub>
13. [Observabilidad con OpenTelemetry en Node: trazas distribuidas, propagación de contexto y correlación](typescript-microservicios/02-node-y-microservicios.md#13-observabilidad-con-opentelemetry-en-node-trazas-distribuidas-propagación-de-contexto-y-correlación) — <sub>Observabilidad</sub>
14. [Estrategia de testing en microservicios: unit, integración con Testcontainers y contract testing](typescript-microservicios/02-node-y-microservicios.md#14-estrategia-de-testing-en-microservicios-unit-integración-con-testcontainers-y-contract-testing) — <sub>Testing</sub>
15. [\[CASO\] La latencia p99 de tu API se dispara con ciertos payloads: ¿cómo detectas y evitas el bloqueo del event loop?](typescript-microservicios/02-node-y-microservicios.md#15-caso-la-latencia-p99-de-tu-api-se-dispara-con-ciertos-payloads-cómo-detectas-y-evitas-el-bloqueo-del-event-loop) `[CASO]` — <sub>Performance</sub>
16. [Manejo de JSON grande en Node: streaming parsers, NDJSON y alternativas binarias](typescript-microservicios/02-node-y-microservicios.md#16-manejo-de-json-grande-en-node-streaming-parsers-ndjson-y-alternativas-binarias) — <sub>Performance / Datos</sub>

### Casos y Problemas Reales — Entrevista Senior

[`03-casos-y-problemas.md`](typescript-microservicios/03-casos-y-problemas.md) · 16 preguntas

1. [Memory leak: el heap crece hasta OOM](typescript-microservicios/03-casos-y-problemas.md#1-memory-leak-el-heap-crece-hasta-oom) `[CASO]` — <sub>Node.js internals / Observabilidad</sub>
2. [Event loop bloqueado: p99 disparado por código CPU-bound](typescript-microservicios/03-casos-y-problemas.md#2-event-loop-bloqueado-p99-disparado-por-código-cpu-bound) `[CASO]` — <sub>Performance / Event loop</sub>
3. [OOM procesando archivos grandes: readFile vs streams](typescript-microservicios/03-casos-y-problemas.md#3-oom-procesando-archivos-grandes-readfile-vs-streams) `[CASO]` — <sub>Streams / Backpressure</sub>
4. [Unhandled promise rejection tumbando pods en cascada](typescript-microservicios/03-casos-y-problemas.md#4-unhandled-promise-rejection-tumbando-pods-en-cascada) `[CASO]` — <sub>Async / Resiliencia</sub>
5. [Fuga de conexiones a Postgres: pool agotado](typescript-microservicios/03-casos-y-problemas.md#5-fuga-de-conexiones-a-postgres-pool-agotado) `[CASO]` — <sub>Bases de datos / Recursos</sub>
6. [Cola con lag creciente: consumidores que no dan abasto](typescript-microservicios/03-casos-y-problemas.md#6-cola-con-lag-creciente-consumidores-que-no-dan-abasto) `[CASO]` — <sub>Mensajería / Kafka / BullMQ</sub>
7. [Race condition: doble descuento de stock en operaciones concurrentes](typescript-microservicios/03-casos-y-problemas.md#7-race-condition-doble-descuento-de-stock-en-operaciones-concurrentes) `[CASO]` — <sub>Concurrencia / Consistencia de datos</sub>
8. [Hot reload de configuración sin reiniciar el servicio](typescript-microservicios/03-casos-y-problemas.md#8-hot-reload-de-configuración-sin-reiniciar-el-servicio) `[CASO]` — <sub>Configuración / Operabilidad</sub>
9. [Migración JS→TS incremental en un servicio grande](typescript-microservicios/03-casos-y-problemas.md#9-migración-jsts-incremental-en-un-servicio-grande) `[CASO]` — <sub>TypeScript / Deuda técnica</sub>
10. [Timeout en cascada entre servicios: A→B→C](typescript-microservicios/03-casos-y-problemas.md#10-timeout-en-cascada-entre-servicios-abc) `[CASO]` — <sub>Sistemas distribuidos / Resiliencia</sub>
11. [DNS y keep-alive con axios/undici en alta concurrencia](typescript-microservicios/03-casos-y-problemas.md#11-dns-y-keep-alive-con-axiosundici-en-alta-concurrencia) `[CASO]` — <sub>Redes / HTTP clients</sub>
12. [Degradación por GC: pausas largas y sawtooth agresivo](typescript-microservicios/03-casos-y-problemas.md#12-degradación-por-gc-pausas-largas-y-sawtooth-agresivo) `[CASO]` — <sub>Node.js internals / Memoria</sub>
13. [Pérdida de eventos: mensajes que "desaparecen"](typescript-microservicios/03-casos-y-problemas.md#13-pérdida-de-eventos-mensajes-que-desaparecen) `[CASO]` — <sub>Mensajería / Consistencia</sub>
14. [Duplicación de jobs/mensajes: el mismo evento procesado dos veces](typescript-microservicios/03-casos-y-problemas.md#14-duplicación-de-jobsmensajes-el-mismo-evento-procesado-dos-veces) `[CASO]` — <sub>Mensajería / Idempotencia</sub>
15. [Hot path degradado: CPU throttling en Kubernetes distorsionando latencias](typescript-microservicios/03-casos-y-problemas.md#15-hot-path-degradado-cpu-throttling-en-kubernetes-distorsionando-latencias) `[CASO]` — <sub>Kubernetes / Runtime</sub>
16. [Graceful shutdown roto: 502s en cada deploy](typescript-microservicios/03-casos-y-problemas.md#16-graceful-shutdown-roto-502s-en-cada-deploy) `[CASO]` — <sub>Kubernetes / Ciclo de vida</sub>

---

## 🐹 Golang Senior + Microservicios

Carpeta: [`golang-microservicios/`](golang-microservicios/) · 55 preguntas

### Go Core Avanzado — Preguntas de Entrevista Senior

[`01-go-core-avanzado.md`](golang-microservicios/01-go-core-avanzado.md) · 21 preguntas

1. [Explica el modelo GMP del scheduler de Go](golang-microservicios/01-go-core-avanzado.md#1-explica-el-modelo-gmp-del-scheduler-de-go) — <sub>Runtime / Scheduler</sub>
2. [¿Por qué las goroutines son más baratas que los threads del OS?](golang-microservicios/01-go-core-avanzado.md#2-por-qué-las-goroutines-son-más-baratas-que-los-threads-del-os) — <sub>Runtime / Concurrencia</sub>
3. [Channels buffered vs unbuffered: semántica y cuándo usar cada uno](golang-microservicios/01-go-core-avanzado.md#3-channels-buffered-vs-unbuffered-semántica-y-cuándo-usar-cada-uno) — <sub>Concurrencia / Channels</sub>
4. [`select`: semántica, patrones y trampas](golang-microservicios/01-go-core-avanzado.md#4-select-semántica-patrones-y-trampas) — <sub>Concurrencia / Channels</sub>
5. [Patrones de concurrencia: pipeline, fan-out y fan-in](golang-microservicios/01-go-core-avanzado.md#5-patrones-de-concurrencia-pipeline-fan-out-y-fan-in) — <sub>Concurrencia / Patrones</sub>
6. [El paquete `sync`: Mutex, RWMutex, WaitGroup, Once — usos y trampas](golang-microservicios/01-go-core-avanzado.md#6-el-paquete-sync-mutex-rwmutex-waitgroup-once--usos-y-trampas) — <sub>Concurrencia / Sincronización</sub>
7. [`errgroup`: qué aporta sobre WaitGroup y cómo usarlo bien](golang-microservicios/01-go-core-avanzado.md#7-errgroup-qué-aporta-sobre-waitgroup-y-cómo-usarlo-bien) — <sub>Concurrencia / Sincronización</sub>
8. [`sync/atomic` vs Mutex: cuándo y por qué](golang-microservicios/01-go-core-avanzado.md#8-syncatomic-vs-mutex-cuándo-y-por-qué) — <sub>Concurrencia / Sincronización</sub>
9. [`context.Context`: cancelación, deadlines y valores — reglas de uso](golang-microservicios/01-go-core-avanzado.md#9-contextcontext-cancelación-deadlines-y-valores--reglas-de-uso) — <sub>Context / Diseño de APIs</sub>
10. [Escape analysis, stack vs heap, y cómo reducir allocaciones](golang-microservicios/01-go-core-avanzado.md#10-escape-analysis-stack-vs-heap-y-cómo-reducir-allocaciones) — <sub>Memoria / Performance</sub>
11. [El GC de Go: cómo funciona, GOGC y GOMEMLIMIT](golang-microservicios/01-go-core-avanzado.md#11-el-gc-de-go-cómo-funciona-gogc-y-gomemlimit) — <sub>Memoria / GC</sub>
12. [Slices internals: capacidad, aliasing, append y sus gotchas](golang-microservicios/01-go-core-avanzado.md#12-slices-internals-capacidad-aliasing-append-y-sus-gotchas) — <sub>Estructuras de datos</sub>
13. [Maps internals: buckets, iteración aleatoria y concurrencia](golang-microservicios/01-go-core-avanzado.md#13-maps-internals-buckets-iteración-aleatoria-y-concurrencia) — <sub>Estructuras de datos</sub>
14. [Interfaces internals: iface/eface y el gotcha del "typed nil"](golang-microservicios/01-go-core-avanzado.md#14-interfaces-internals-ifaceeface-y-el-gotcha-del-typed-nil) — <sub>Tipos / Interfaces</sub>
15. [Generics en Go: type parameters, constraints y cuándo usarlos](golang-microservicios/01-go-core-avanzado.md#15-generics-en-go-type-parameters-constraints-y-cuándo-usarlos) — <sub>Tipos / Generics</sub>
16. [Error handling idiomático: wrapping, errors.Is/As, sentinel vs typed errors](golang-microservicios/01-go-core-avanzado.md#16-error-handling-idiomático-wrapping-errorsisas-sentinel-vs-typed-errors) — <sub>Errores / Diseño de APIs</sub>
17. [`defer`: semántica precisa y sus gotchas](golang-microservicios/01-go-core-avanzado.md#17-defer-semántica-precisa-y-sus-gotchas) — <sub>Lenguaje / Control de flujo</sub>
18. [`for range`, closures y goroutines: el bug clásico de captura de variables](golang-microservicios/01-go-core-avanzado.md#18-for-range-closures-y-goroutines-el-bug-clásico-de-captura-de-variables) — <sub>Lenguaje / Concurrencia</sub>
19. [Stack growth, `sync.Pool` y presión de GC en hot paths](golang-microservicios/01-go-core-avanzado.md#19-stack-growth-syncpool-y-presión-de-gc-en-hot-paths) — <sub>Memoria / Performance</sub>
20. [\[CASO\] Un servicio funciona en tests pero `-race` en CI reporta una data race en un map de caché. Analiza](golang-microservicios/01-go-core-avanzado.md#20-caso-un-servicio-funciona-en-tests-pero--race-en-ci-reporta-una-data-race-en-un-map-de-caché-analiza) `[CASO]` — <sub>Concurrencia / Debugging</sub>
21. [\[CASO\] Necesitas procesar 10M de registros llamando a una API externa con límite de 100 concurrentes. Diseña la solución](golang-microservicios/01-go-core-avanzado.md#21-caso-necesitas-procesar-10m-de-registros-llamando-a-una-api-externa-con-límite-de-100-concurrentes-diseña-la-solución) `[CASO]` — <sub>Concurrencia / Diseño</sub>

### Microservicios en Go — Preguntas de Entrevista Senior

[`02-microservicios-en-go.md`](golang-microservicios/02-microservicios-en-go.md) · 18 preguntas

1. [Diseño de un servidor HTTP de producción con `net/http`: timeouts y configuración](golang-microservicios/02-microservicios-en-go.md#1-diseño-de-un-servidor-http-de-producción-con-nethttp-timeouts-y-configuración) — <sub>HTTP / Servicios</sub>
2. [Middleware en Go: patrón, orden y ejemplos reales](golang-microservicios/02-microservicios-en-go.md#2-middleware-en-go-patrón-orden-y-ejemplos-reales) — <sub>HTTP / Servicios</sub>
3. [gRPC en Go: unary vs streaming, deadlines y manejo de errores](golang-microservicios/02-microservicios-en-go.md#3-grpc-en-go-unary-vs-streaming-deadlines-y-manejo-de-errores) — <sub>gRPC</sub>
4. [Interceptors de gRPC: para qué y cómo implementarlos](golang-microservicios/02-microservicios-en-go.md#4-interceptors-de-grpc-para-qué-y-cómo-implementarlos) — <sub>gRPC</sub>
5. [Graceful shutdown completo de un microservicio en Go](golang-microservicios/02-microservicios-en-go.md#5-graceful-shutdown-completo-de-un-microservicio-en-go) — <sub>Ciclo de vida / Operación</sub>
6. [Worker pools y control de concurrencia en servicios](golang-microservicios/02-microservicios-en-go.md#6-worker-pools-y-control-de-concurrencia-en-servicios) — <sub>Concurrencia aplicada</sub>
7. [Rate limiting en Go: algoritmos e implementación](golang-microservicios/02-microservicios-en-go.md#7-rate-limiting-en-go-algoritmos-e-implementación) — <sub>Resiliencia</sub>
8. [Circuit breakers: por qué, cómo funcionan y su implementación en Go](golang-microservicios/02-microservicios-en-go.md#8-circuit-breakers-por-qué-cómo-funcionan-y-su-implementación-en-go) — <sub>Resiliencia</sub>
9. [Kafka en Go: consumer groups, rebalancing y elección de librería](golang-microservicios/02-microservicios-en-go.md#9-kafka-en-go-consumer-groups-rebalancing-y-elección-de-librería) — <sub>Mensajería / Kafka</sub>
10. [Patrón Outbox e idempotencia: publicar eventos sin perder ni duplicar](golang-microservicios/02-microservicios-en-go.md#10-patrón-outbox-e-idempotencia-publicar-eventos-sin-perder-ni-duplicar) — <sub>Mensajería / Consistencia</sub>
11. [Patrón Saga: transacciones distribuidas sin 2PC](golang-microservicios/02-microservicios-en-go.md#11-patrón-saga-transacciones-distribuidas-sin-2pc) — <sub>Patrones distribuidos</sub>
12. [Estructura de proyecto en Go: `internal/`, hexagonal y organización de paquetes](golang-microservicios/02-microservicios-en-go.md#12-estructura-de-proyecto-en-go-internal-hexagonal-y-organización-de-paquetes) — <sub>Arquitectura / Proyecto</sub>
13. [Inyección de dependencias en Go: manual, wire, fx — criterio](golang-microservicios/02-microservicios-en-go.md#13-inyección-de-dependencias-en-go-manual-wire-fx--criterio) — <sub>Arquitectura / Proyecto</sub>
14. [Observabilidad en Go: OpenTelemetry, métricas y pprof en producción](golang-microservicios/02-microservicios-en-go.md#14-observabilidad-en-go-opentelemetry-métricas-y-pprof-en-producción) — <sub>Observabilidad</sub>
15. [Testing en microservicios Go: table-driven, testcontainers, mocks y race detector](golang-microservicios/02-microservicios-en-go.md#15-testing-en-microservicios-go-table-driven-testcontainers-mocks-y-race-detector) — <sub>Testing</sub>
16. [Timeouts, retries y hedging entre servicios: presupuesto de latencia end-to-end](golang-microservicios/02-microservicios-en-go.md#16-timeouts-retries-y-hedging-entre-servicios-presupuesto-de-latencia-end-to-end) — <sub>Resiliencia / Comunicación</sub>
17. [Versionado y evolución de APIs y eventos en microservicios Go](golang-microservicios/02-microservicios-en-go.md#17-versionado-y-evolución-de-apis-y-eventos-en-microservicios-go) — <sub>Contratos / Evolución</sub>
18. [Configuración y secretos en microservicios Go](golang-microservicios/02-microservicios-en-go.md#18-configuración-y-secretos-en-microservicios-go) — <sub>Operación / Configuración</sub>

### Casos y Problemas de Producción — Go y Microservicios

[`03-casos-y-problemas.md`](golang-microservicios/03-casos-y-problemas.md) · 16 preguntas

1. [\[CASO\] Goroutine leak en producción: la memoria y el número de goroutines crecen sin parar](golang-microservicios/03-casos-y-problemas.md#1-caso-goroutine-leak-en-producción-la-memoria-y-el-número-de-goroutines-crecen-sin-parar) `[CASO]` — <sub>Concurrencia / Debugging</sub>
2. [\[CASO\] La memoria RSS crece y el pod es OOM-killed, pero el heap de pprof se ve pequeño](golang-microservicios/03-casos-y-problemas.md#2-caso-la-memoria-rss-crece-y-el-pod-es-oom-killed-pero-el-heap-de-pprof-se-ve-pequeño) `[CASO]` — <sub>Memoria / GC</sub>
3. [\[CASO\] Deadlock: el servicio se congela por completo bajo carga y no responde ni el health check](golang-microservicios/03-casos-y-problemas.md#3-caso-deadlock-el-servicio-se-congela-por-completo-bajo-carga-y-no-responde-ni-el-health-check) `[CASO]` — <sub>Concurrencia / Debugging</sub>
4. [\[CASO\] El race detector señala una race en producción... que "nunca ha dado problemas". Convence al equipo y arréglala](golang-microservicios/03-casos-y-problemas.md#4-caso-el-race-detector-señala-una-race-en-producción-que-nunca-ha-dado-problemas-convence-al-equipo-y-arréglala) `[CASO]` — <sub>Concurrencia / Debugging</sub>
5. [\[CASO\] p99 degradado con p50 normal: ¿GC o contención? Diagnostica y arregla](golang-microservicios/03-casos-y-problemas.md#5-caso-p99-degradado-con-p50-normal-gc-o-contención-diagnostica-y-arregla) `[CASO]` — <sub>Performance / Latencia</sub>
6. [\[CASO\] El servidor HTTP agota file descriptors: "too many open files"](golang-microservicios/03-casos-y-problemas.md#6-caso-el-servidor-http-agota-file-descriptors-too-many-open-files) `[CASO]` — <sub>HTTP / Recursos</sub>
7. [\[CASO\] Contexto cancelado que no se propaga: el caller recibe timeout pero el trabajo sigue ejecutándose (trabajo huérfano)](golang-microservicios/03-casos-y-problemas.md#7-caso-contexto-cancelado-que-no-se-propaga-el-caller-recibe-timeout-pero-el-trabajo-sigue-ejecutándose-trabajo-huérfano) `[CASO]` — <sub>Context / Consistencia</sub>
8. [\[CASO\] Datos corruptos intermitentes: dos features pisan los mismos bytes por aliasing de slices](golang-microservicios/03-casos-y-problemas.md#8-caso-datos-corruptos-intermitentes-dos-features-pisan-los-mismos-bytes-por-aliasing-de-slices) `[CASO]` — <sub>Slices / Memoria</sub>
9. [\[CASO\] Un panic en una goroutine tumba todo el proceso cada pocas horas](golang-microservicios/03-casos-y-problemas.md#9-caso-un-panic-en-una-goroutine-tumba-todo-el-proceso-cada-pocas-horas) `[CASO]` — <sub>Errores / Runtime</sub>
10. [\[CASO\] Consumer de Kafka con lag creciente: los mensajes se acumulan más rápido de lo que se procesan](golang-microservicios/03-casos-y-problemas.md#10-caso-consumer-de-kafka-con-lag-creciente-los-mensajes-se-acumulan-más-rápido-de-lo-que-se-procesan) `[CASO]` — <sub>Kafka / Throughput</sub>
11. [\[CASO\] Timeouts en cascada entre servicios gRPC: un incidente pequeño se convierte en outage general](golang-microservicios/03-casos-y-problemas.md#11-caso-timeouts-en-cascada-entre-servicios-grpc-un-incidente-pequeño-se-convierte-en-outage-general) `[CASO]` — <sub>gRPC / Resiliencia</sub>
12. [\[CASO\] Connection pool de `database/sql` agotado: requests esperando conexión y timeouts en la capa de datos](golang-microservicios/03-casos-y-problemas.md#12-caso-connection-pool-de-databasesql-agotado-requests-esperando-conexión-y-timeouts-en-la-capa-de-datos) `[CASO]` — <sub>Base de datos / Recursos</sub>
13. [\[CASO\] Procesar un archivo de 20GB tumba el servicio por memoria: diseño de streaming](golang-microservicios/03-casos-y-problemas.md#13-caso-procesar-un-archivo-de-20gb-tumba-el-servicio-por-memoria-diseño-de-streaming) `[CASO]` — <sub>I/O / Memoria</sub>
14. [\[CASO\] Migración de un servicio Java/Node a Go: qué evaluar, cómo ejecutarla y qué trampas esperan](golang-microservicios/03-casos-y-problemas.md#14-caso-migración-de-un-servicio-javanode-a-go-qué-evaluar-cómo-ejecutarla-y-qué-trampas-esperan) `[CASO]` — <sub>Arquitectura / Migración</sub>
15. [\[CASO\] El servicio consume 100% CPU con tráfico normal: busy loop, serialización o algo peor](golang-microservicios/03-casos-y-problemas.md#15-caso-el-servicio-consume-100-cpu-con-tráfico-normal-busy-loop-serialización-o-algo-peor) `[CASO]` — <sub>Performance / CPU</sub>
16. [\[CASO\] Tras un deploy, errores 502/connection reset intermitentes solo durante los rollouts](golang-microservicios/03-casos-y-problemas.md#16-caso-tras-un-deploy-errores-502connection-reset-intermitentes-solo-durante-los-rollouts) `[CASO]` — <sub>Ciclo de vida / Kubernetes</sub>

---

## ☁️ AWS

Carpeta: [`cloud/aws/`](cloud/aws/) · 47 preguntas

### Fundamentos y Arquitectura en AWS — Entrevistas Senior

[`01-fundamentos-y-arquitectura.md`](cloud/aws/01-fundamentos-y-arquitectura.md) · 18 preguntas

1. [Diseño de una VPC: subnets públicas/privadas, NAT e Internet Gateway](cloud/aws/01-fundamentos-y-arquitectura.md#1-diseño-de-una-vpc-subnets-públicasprivadas-nat-e-internet-gateway) — <sub>Networking</sub>
2. [VPC Endpoints: Gateway vs Interface, y cuándo usarlos](cloud/aws/01-fundamentos-y-arquitectura.md#2-vpc-endpoints-gateway-vs-interface-y-cuándo-usarlos) — <sub>Networking</sub>
3. [VPC Peering vs Transit Gateway: conectividad entre VPCs](cloud/aws/01-fundamentos-y-arquitectura.md#3-vpc-peering-vs-transit-gateway-conectividad-entre-vpcs) — <sub>Networking</sub>
4. [IAM avanzado: evaluación de policies, roles y STS](cloud/aws/01-fundamentos-y-arquitectura.md#4-iam-avanzado-evaluación-de-policies-roles-y-sts) — <sub>Seguridad</sub>
5. [Permission boundaries, SCPs y acceso cross-account](cloud/aws/01-fundamentos-y-arquitectura.md#5-permission-boundaries-scps-y-acceso-cross-account) — <sub>Seguridad</sub>
6. [ECS vs EKS vs Lambda vs Fargate: criterios de elección de cómputo](cloud/aws/01-fundamentos-y-arquitectura.md#6-ecs-vs-eks-vs-lambda-vs-fargate-criterios-de-elección-de-cómputo) — <sub>Cómputo</sub>
7. [ALB vs NLB vs API Gateway: exposición de servicios](cloud/aws/01-fundamentos-y-arquitectura.md#7-alb-vs-nlb-vs-api-gateway-exposición-de-servicios) — <sub>Networking / Integración</sub>
8. [RDS vs Aurora: cuándo pagar la prima de Aurora](cloud/aws/01-fundamentos-y-arquitectura.md#8-rds-vs-aurora-cuándo-pagar-la-prima-de-aurora) — <sub>Bases de datos</sub>
9. [DynamoDB: modelado single-table y particiones calientes](cloud/aws/01-fundamentos-y-arquitectura.md#9-dynamodb-modelado-single-table-y-particiones-calientes) — <sub>Bases de datos</sub>
10. [SQS vs SNS vs EventBridge: mensajería y eventos](cloud/aws/01-fundamentos-y-arquitectura.md#10-sqs-vs-sns-vs-eventbridge-mensajería-y-eventos) — <sub>Integración</sub>
11. [Kinesis Data Streams vs MSK (Kafka): streaming de datos](cloud/aws/01-fundamentos-y-arquitectura.md#11-kinesis-data-streams-vs-msk-kafka-streaming-de-datos) — <sub>Integración / Streaming</sub>
12. [Step Functions: orquestación de workflows](cloud/aws/01-fundamentos-y-arquitectura.md#12-step-functions-orquestación-de-workflows) — <sub>Integración / Orquestación</sub>
13. [ElastiCache: Redis vs Memcached y patrones de caching](cloud/aws/01-fundamentos-y-arquitectura.md#13-elasticache-redis-vs-memcached-y-patrones-de-caching) — <sub>Bases de datos / Performance</sub>
14. [S3: consistencia, clases de almacenamiento y performance](cloud/aws/01-fundamentos-y-arquitectura.md#14-s3-consistencia-clases-de-almacenamiento-y-performance) — <sub>Almacenamiento</sub>
15. [Multi-AZ vs multi-región: alta disponibilidad real](cloud/aws/01-fundamentos-y-arquitectura.md#15-multi-az-vs-multi-región-alta-disponibilidad-real) — <sub>Arquitectura / Resiliencia</sub>
16. [Disaster Recovery: RTO/RPO y las cuatro estrategias](cloud/aws/01-fundamentos-y-arquitectura.md#16-disaster-recovery-rtorpo-y-las-cuatro-estrategias) — <sub>Arquitectura / Resiliencia</sub>
17. [Well-Architected Framework: los seis pilares aplicados](cloud/aws/01-fundamentos-y-arquitectura.md#17-well-architected-framework-los-seis-pilares-aplicados) — <sub>Arquitectura / Gobernanza</sub>
18. [Control de costos en AWS: de la visibilidad a la optimización](cloud/aws/01-fundamentos-y-arquitectura.md#18-control-de-costos-en-aws-de-la-visibilidad-a-la-optimización) — <sub>FinOps</sub>

### Microservicios en AWS — Entrevistas Senior

[`02-microservicios-en-aws.md`](cloud/aws/02-microservicios-en-aws.md) · 13 preguntas

1. [Arquitectura de referencia de microservicios en AWS](cloud/aws/02-microservicios-en-aws.md#1-arquitectura-de-referencia-de-microservicios-en-aws) — <sub>Arquitectura</sub>
2. [Service discovery con Cloud Map y alternativas](cloud/aws/02-microservicios-en-aws.md#2-service-discovery-con-cloud-map-y-alternativas) — <sub>Networking / Integración</sub>
3. [Service mesh en AWS: App Mesh vs VPC Lattice](cloud/aws/02-microservicios-en-aws.md#3-service-mesh-en-aws-app-mesh-vs-vpc-lattice) — <sub>Networking / Arquitectura</sub>
4. [API Gateway + Lambda vs contenedores para APIs](cloud/aws/02-microservicios-en-aws.md#4-api-gateway--lambda-vs-contenedores-para-apis) — <sub>Cómputo / Arquitectura</sub>
5. [Colas y DLQs: retries, backoff y poison messages](cloud/aws/02-microservicios-en-aws.md#5-colas-y-dlqs-retries-backoff-y-poison-messages) — <sub>Integración / Resiliencia</sub>
6. [Exactly-once vs at-least-once en SQS y Kinesis](cloud/aws/02-microservicios-en-aws.md#6-exactly-once-vs-at-least-once-en-sqs-y-kinesis) — <sub>Integración / Consistencia</sub>
7. [El patrón Saga con Step Functions](cloud/aws/02-microservicios-en-aws.md#7-el-patrón-saga-con-step-functions) — <sub>Arquitectura / Consistencia</sub>
8. [El patrón Outbox con DynamoDB Streams (y CDC en general)](cloud/aws/02-microservicios-en-aws.md#8-el-patrón-outbox-con-dynamodb-streams-y-cdc-en-general) — <sub>Arquitectura / Consistencia</sub>
9. [Secrets Manager vs Parameter Store: gestión de secretos y configuración](cloud/aws/02-microservicios-en-aws.md#9-secrets-manager-vs-parameter-store-gestión-de-secretos-y-configuración) — <sub>Seguridad / Configuración</sub>
10. [CI/CD en AWS: blue/green y canary con CodeDeploy](cloud/aws/02-microservicios-en-aws.md#10-cicd-en-aws-bluegreen-y-canary-con-codedeploy) — <sub>DevOps / Despliegue</sub>
11. [Observabilidad: CloudWatch, X-Ray y ADOT](cloud/aws/02-microservicios-en-aws.md#11-observabilidad-cloudwatch-x-ray-y-adot) — <sub>Observabilidad</sub>
12. [Lambda internals: cold starts, concurrencia y provisioned concurrency](cloud/aws/02-microservicios-en-aws.md#12-lambda-internals-cold-starts-concurrencia-y-provisioned-concurrency) — <sub>Cómputo / Performance</sub>
13. [Versionado de APIs y contratos entre microservicios](cloud/aws/02-microservicios-en-aws.md#13-versionado-de-apis-y-contratos-entre-microservicios) — <sub>Arquitectura / Integración</sub>

### Casos y Problemas en AWS — Entrevistas Senior

[`03-casos-y-problemas.md`](cloud/aws/03-casos-y-problemas.md) · 16 preguntas

1. [Lambda con cold starts inaceptables en una API de pagos](cloud/aws/03-casos-y-problemas.md#1-lambda-con-cold-starts-inaceptables-en-una-api-de-pagos) `[CASO]` — <sub>Cómputo / Performance</sub>
2. [DynamoDB con throttling por hot partition en un multi-tenant](cloud/aws/03-casos-y-problemas.md#2-dynamodb-con-throttling-por-hot-partition-en-un-multi-tenant) `[CASO]` — <sub>Bases de datos</sub>
3. [La factura de AWS se triplicó este mes: análisis](cloud/aws/03-casos-y-problemas.md#3-la-factura-de-aws-se-triplicó-este-mes-análisis) `[CASO]` — <sub>FinOps</sub>
4. [Pods de EKS en CrashLoopBackOff tras un deploy](cloud/aws/03-casos-y-problemas.md#4-pods-de-eks-en-crashloopbackoff-tras-un-deploy) `[CASO]` — <sub>Contenedores / EKS</sub>
5. [Latencia intermitente entre servicios en distintas AZ](cloud/aws/03-casos-y-problemas.md#5-latencia-intermitente-entre-servicios-en-distintas-az) `[CASO]` — <sub>Networking / Performance</sub>
6. [Mensajes de SQS que "reaparecen" y se procesan varias veces](cloud/aws/03-casos-y-problemas.md#6-mensajes-de-sqs-que-reaparecen-y-se-procesan-varias-veces) `[CASO]` — <sub>Integración</sub>
7. [La DLQ se está llenando: triage y reproceso](cloud/aws/03-casos-y-problemas.md#7-la-dlq-se-está-llenando-triage-y-reproceso) `[CASO]` — <sub>Integración / Operación</sub>
8. [RDS PostgreSQL con CPU al 100%: análisis con Performance Insights](cloud/aws/03-casos-y-problemas.md#8-rds-postgresql-con-cpu-al-100-análisis-con-performance-insights) `[CASO]` — <sub>Bases de datos</sub>
9. [API Gateway devolviendo 429 y 504: throttling y timeouts](cloud/aws/03-casos-y-problemas.md#9-api-gateway-devolviendo-429-y-504-throttling-y-timeouts) `[CASO]` — <sub>Integración / Performance</sub>
10. [Caída de una AZ: comportamiento del sistema y diseño de resiliencia](cloud/aws/03-casos-y-problemas.md#10-caída-de-una-az-comportamiento-del-sistema-y-diseño-de-resiliencia) `[CASO]` — <sub>Arquitectura / Resiliencia</sub>
11. [Fuga de credenciales IAM: respuesta al incidente](cloud/aws/03-casos-y-problemas.md#11-fuga-de-credenciales-iam-respuesta-al-incidente) `[CASO]` — <sub>Seguridad</sub>
12. [S3 lento en listados masivos y cargas con millones de objetos](cloud/aws/03-casos-y-problemas.md#12-s3-lento-en-listados-masivos-y-cargas-con-millones-de-objetos) `[CASO]` — <sub>Almacenamiento / Performance</sub>
13. [Kinesis con shards saturados y consumidores con lag creciente](cloud/aws/03-casos-y-problemas.md#13-kinesis-con-shards-saturados-y-consumidores-con-lag-creciente) `[CASO]` — <sub>Streaming / Performance</sub>
14. [Migración a AWS: lift-and-shift vs re-architect](cloud/aws/03-casos-y-problemas.md#14-migración-a-aws-lift-and-shift-vs-re-architect) `[CASO]` — <sub>Arquitectura / Estrategia</sub>
15. [ECS tasks que mueren por memoria (OOM) de forma intermitente](cloud/aws/03-casos-y-problemas.md#15-ecs-tasks-que-mueren-por-memoria-oom-de-forma-intermitente) `[CASO]` — <sub>Contenedores / ECS</sub>
16. [NAT Gateway con costos disparados: análisis y rediseño](cloud/aws/03-casos-y-problemas.md#16-nat-gateway-con-costos-disparados-análisis-y-rediseño) `[CASO]` — <sub>Networking / FinOps</sub>

---

## ☁️ Azure

Carpeta: [`cloud/azure/`](cloud/azure/) · 30 preguntas

### Azure — Fundamentos y Arquitectura (Perfil Senior Backend/Microservicios)

[`01-fundamentos-y-arquitectura.md`](cloud/azure/01-fundamentos-y-arquitectura.md) · 12 preguntas

1. [¿Cómo organizas suscripciones, Management Groups y Resource Groups en una organización grande?](cloud/azure/01-fundamentos-y-arquitectura.md#1-cómo-organizas-suscripciones-management-groups-y-resource-groups-en-una-organización-grande) — <sub>Gobernanza y organización</sub>
2. [Diseño de redes: VNets, subnets, NSGs, Private Endpoints y peering](cloud/azure/01-fundamentos-y-arquitectura.md#2-diseño-de-redes-vnets-subnets-nsgs-private-endpoints-y-peering) — <sub>Redes</sub>
3. [Identidad: Entra ID, Service Principals, Managed Identities y RBAC](cloud/azure/01-fundamentos-y-arquitectura.md#3-identidad-entra-id-service-principals-managed-identities-y-rbac) — <sub>Identidad y seguridad</sub>
4. [Cómputo: ¿cuándo elegir AKS, Container Apps, App Service o Functions?](cloud/azure/01-fundamentos-y-arquitectura.md#4-cómputo-cuándo-elegir-aks-container-apps-app-service-o-functions) — <sub>Cómputo y arquitectura</sub>
5. [Azure SQL vs Cosmos DB: consistencia, particionado y RUs](cloud/azure/01-fundamentos-y-arquitectura.md#5-azure-sql-vs-cosmos-db-consistencia-particionado-y-rus) — <sub>Datos</sub>
6. [Mensajería: Service Bus vs Event Grid vs Event Hubs](cloud/azure/01-fundamentos-y-arquitectura.md#6-mensajería-service-bus-vs-event-grid-vs-event-hubs) — <sub>Mensajería e integración</sub>
7. [API Management: rol en una arquitectura de microservicios](cloud/azure/01-fundamentos-y-arquitectura.md#7-api-management-rol-en-una-arquitectura-de-microservicios) — <sub>Integración y APIs</sub>
8. [Front Door vs Application Gateway vs Load Balancer vs Traffic Manager](cloud/azure/01-fundamentos-y-arquitectura.md#8-front-door-vs-application-gateway-vs-load-balancer-vs-traffic-manager) — <sub>Redes y entrega</sub>
9. [Key Vault: gestión de secretos, claves y certificados](cloud/azure/01-fundamentos-y-arquitectura.md#9-key-vault-gestión-de-secretos-claves-y-certificados) — <sub>Seguridad</sub>
10. [Almacenamiento: Blob Storage, tiers y ciclo de vida](cloud/azure/01-fundamentos-y-arquitectura.md#10-almacenamiento-blob-storage-tiers-y-ciclo-de-vida) — <sub>Datos y almacenamiento</sub>
11. [Multi-región y Disaster Recovery: cómo se diseña](cloud/azure/01-fundamentos-y-arquitectura.md#11-multi-región-y-disaster-recovery-cómo-se-diseña) — <sub>Resiliencia y DR</sub>
12. [Well-Architected Framework aplicado a un diseño en Azure](cloud/azure/01-fundamentos-y-arquitectura.md#12-well-architected-framework-aplicado-a-un-diseño-en-azure) — <sub>Arquitectura y buenas prácticas</sub>

### Azure — Microservicios y Casos Prácticos (Perfil Senior Backend/Microservicios)

[`02-microservicios-y-casos.md`](cloud/azure/02-microservicios-y-casos.md) · 18 preguntas

1. [Arquitectura de referencia de microservicios en Azure (AKS + Service Bus + APIM)](cloud/azure/02-microservicios-y-casos.md#1-arquitectura-de-referencia-de-microservicios-en-azure-aks--service-bus--apim) — <sub>Arquitectura de microservicios</sub>
2. [Durable Functions para implementar Sagas](cloud/azure/02-microservicios-y-casos.md#2-durable-functions-para-implementar-sagas) — <sub>Patrones distribuidos</sub>
3. [Dapr sobre Container Apps: qué aporta a microservicios](cloud/azure/02-microservicios-y-casos.md#3-dapr-sobre-container-apps-qué-aporta-a-microservicios) — <sub>Plataformas y runtime</sub>
4. [Observabilidad con Application Insights: distributed tracing y sampling](cloud/azure/02-microservicios-y-casos.md#4-observabilidad-con-application-insights-distributed-tracing-y-sampling) — <sub>Observabilidad</sub>
5. [Despliegues blue/green y canary en AKS](cloud/azure/02-microservicios-y-casos.md#5-despliegues-bluegreen-y-canary-en-aks) — <sub>Entrega continua</sub>
6. [Idempotencia, outbox y exactly-once práctico en mensajería Azure](cloud/azure/02-microservicios-y-casos.md#6-idempotencia-outbox-y-exactly-once-práctico-en-mensajería-azure) — <sub>Patrones distribuidos</sub>
7. [\[CASO\] Cosmos DB devuelve 429: RU exhaustion y hot partition](cloud/azure/02-microservicios-y-casos.md#7-caso-cosmos-db-devuelve-429-ru-exhaustion-y-hot-partition) `[CASO]` — <sub>Datos</sub>
8. [\[CASO\] La DLQ de Service Bus crece sin parar](cloud/azure/02-microservicios-y-casos.md#8-caso-la-dlq-de-service-bus-crece-sin-parar) `[CASO]` — <sub>Mensajería</sub>
9. [\[CASO\] App Service con memory leak y reinicios continuos](cloud/azure/02-microservicios-y-casos.md#9-caso-app-service-con-memory-leak-y-reinicios-continuos) `[CASO]` — <sub>Cómputo / rendimiento</sub>
10. [\[CASO\] AKS: pods evicted y nodos bajo presión](cloud/azure/02-microservicios-y-casos.md#10-caso-aks-pods-evicted-y-nodos-bajo-presión) `[CASO]` — <sub>Kubernetes / operación</sub>
11. [\[CASO\] Latencia alta entre servicios en AKS: DNS, conntrack y kube-proxy](cloud/azure/02-microservicios-y-casos.md#11-caso-latencia-alta-entre-servicios-en-aks-dns-conntrack-y-kube-proxy) `[CASO]` — <sub>Kubernetes / redes</sub>
12. [\[CASO\] Azure Functions con cold starts y timeouts](cloud/azure/02-microservicios-y-casos.md#12-caso-azure-functions-con-cold-starts-y-timeouts) `[CASO]` — <sub>Serverless</sub>
13. [\[CASO\] El costo de Cosmos DB y Log Analytics se disparó](cloud/azure/02-microservicios-y-casos.md#13-caso-el-costo-de-cosmos-db-y-log-analytics-se-disparó) `[CASO]` — <sub>FinOps / costos</sub>
14. [\[CASO\] Throttling de Entra ID en la autenticación entre servicios](cloud/azure/02-microservicios-y-casos.md#14-caso-throttling-de-entra-id-en-la-autenticación-entre-servicios) `[CASO]` — <sub>Identidad</sub>
15. [\[CASO\] Pérdida de mensajes en Event Hubs por mal checkpointing](cloud/azure/02-microservicios-y-casos.md#15-caso-pérdida-de-mensajes-en-event-hubs-por-mal-checkpointing) `[CASO]` — <sub>Streaming</sub>
16. [\[CASO\] Incidente por expiración de secretos/certificados en Key Vault](cloud/azure/02-microservicios-y-casos.md#16-caso-incidente-por-expiración-de-secretoscertificados-en-key-vault) `[CASO]` — <sub>Seguridad / operación</sub>
17. [\[CASO\] Migración de on-premise a Azure: evaluación y estrategia](cloud/azure/02-microservicios-y-casos.md#17-caso-migración-de-on-premise-a-azure-evaluación-y-estrategia) `[CASO]` — <sub>Migración / arquitectura</sub>
18. [\[CASO\] Degradación tras un failover de región](cloud/azure/02-microservicios-y-casos.md#18-caso-degradación-tras-un-failover-de-región) `[CASO]` — <sub>Resiliencia / DR</sub>

---

## ☁️ GCP

Carpeta: [`cloud/gcp/`](cloud/gcp/) · 31 preguntas

### Fundamentos y Arquitectura en GCP — Entrevistas Senior

[`01-fundamentos-y-arquitectura.md`](cloud/gcp/01-fundamentos-y-arquitectura.md) · 13 preguntas

1. [Explica la jerarquía de recursos de GCP (Organización, Folders, Projects) y por qué importa en una empresa grande](cloud/gcp/01-fundamentos-y-arquitectura.md#1-explica-la-jerarquía-de-recursos-de-gcp-organización-folders-projects-y-por-qué-importa-en-una-empresa-grande) — <sub>Fundamentos / Gobernanza</sub>
2. [IAM en GCP: roles, service accounts y mejores prácticas de mínimo privilegio](cloud/gcp/01-fundamentos-y-arquitectura.md#2-iam-en-gcp-roles-service-accounts-y-mejores-prácticas-de-mínimo-privilegio) — <sub>Seguridad / IAM</sub>
3. [¿Qué es Workload Identity Federation y por qué elimina las claves de service account?](cloud/gcp/01-fundamentos-y-arquitectura.md#3-qué-es-workload-identity-federation-y-por-qué-elimina-las-claves-de-service-account) — <sub>Seguridad / IAM</sub>
4. [VPC en GCP: Shared VPC vs VPC Peering vs Private Service Connect](cloud/gcp/01-fundamentos-y-arquitectura.md#4-vpc-en-gcp-shared-vpc-vs-vpc-peering-vs-private-service-connect) — <sub>Redes</sub>
5. [GKE vs Cloud Run vs Cloud Functions vs App Engine: ¿cuándo eliges cada uno?](cloud/gcp/01-fundamentos-y-arquitectura.md#5-gke-vs-cloud-run-vs-cloud-functions-vs-app-engine-cuándo-eliges-cada-uno) — <sub>Cómputo / Arquitectura</sub>
6. [GKE Autopilot vs Standard: trade-offs reales en producción](cloud/gcp/01-fundamentos-y-arquitectura.md#6-gke-autopilot-vs-standard-trade-offs-reales-en-producción) — <sub>Cómputo / Kubernetes</sub>
7. [Cloud SQL vs Spanner vs Firestore vs Bigtable: criterios de elección, consistencia y particionado](cloud/gcp/01-fundamentos-y-arquitectura.md#7-cloud-sql-vs-spanner-vs-firestore-vs-bigtable-criterios-de-elección-consistencia-y-particionado) — <sub>Datos / Bases de datos</sub>
8. [Pub/Sub en profundidad: at-least-once, ordering keys, exactly-once y dead letter queues](cloud/gcp/01-fundamentos-y-arquitectura.md#8-pubsub-en-profundidad-at-least-once-ordering-keys-exactly-once-y-dead-letter-queues) — <sub>Mensajería / Integración</sub>
9. [BigQuery: arquitectura, particionado/clustering y control de costos](cloud/gcp/01-fundamentos-y-arquitectura.md#9-bigquery-arquitectura-particionadoclustering-y-control-de-costos) — <sub>Datos / Analítica</sub>
10. [Cloud Load Balancing global: anatomía del External Application Load Balancer](cloud/gcp/01-fundamentos-y-arquitectura.md#10-cloud-load-balancing-global-anatomía-del-external-application-load-balancer) — <sub>Redes / Tráfico</sub>
11. [Memorystore (Redis) en arquitecturas de microservicios: patrones, límites y alta disponibilidad](cloud/gcp/01-fundamentos-y-arquitectura.md#11-memorystore-redis-en-arquitecturas-de-microservicios-patrones-límites-y-alta-disponibilidad) — <sub>Datos / Caching</sub>
12. [Diseño multi-región y Disaster Recovery en GCP: RTO/RPO y qué servicio da qué](cloud/gcp/01-fundamentos-y-arquitectura.md#12-diseño-multi-región-y-disaster-recovery-en-gcp-rtorpo-y-qué-servicio-da-qué) — <sub>Arquitectura / Resiliencia</sub>
13. [Anthos / GKE Enterprise y service mesh: ¿cuándo justifica su complejidad?](cloud/gcp/01-fundamentos-y-arquitectura.md#13-anthos--gke-enterprise-y-service-mesh-cuándo-justifica-su-complejidad) — <sub>Plataforma / Service Mesh</sub>

### Microservicios en GCP y Casos de Producción — Entrevistas Senior

[`02-microservicios-y-casos.md`](cloud/gcp/02-microservicios-y-casos.md) · 18 preguntas

1. [Arquitectura de referencia de microservicios en GCP: GKE/Cloud Run + Pub/Sub](cloud/gcp/02-microservicios-y-casos.md#1-arquitectura-de-referencia-de-microservicios-en-gcp-gkecloud-run--pubsub) — <sub>Arquitectura de microservicios</sub>
2. [Cloud Run internals: concurrencia por instancia, cold starts y CPU throttling fuera de request](cloud/gcp/02-microservicios-y-casos.md#2-cloud-run-internals-concurrencia-por-instancia-cold-starts-y-cpu-throttling-fuera-de-request) — <sub>Cómputo / Serverless</sub>
3. [Sagas y patrón Outbox con Pub/Sub: consistencia entre microservicios sin 2PC](cloud/gcp/02-microservicios-y-casos.md#3-sagas-y-patrón-outbox-con-pubsub-consistencia-entre-microservicios-sin-2pc) — <sub>Patrones distribuidos</sub>
4. [Observabilidad de microservicios con OpenTelemetry en GCP](cloud/gcp/02-microservicios-y-casos.md#4-observabilidad-de-microservicios-con-opentelemetry-en-gcp) — <sub>Observabilidad</sub>
5. [Despliegues canary con Cloud Deploy: pipeline de entrega progresiva en GCP](cloud/gcp/02-microservicios-y-casos.md#5-despliegues-canary-con-cloud-deploy-pipeline-de-entrega-progresiva-en-gcp) — <sub>CI/CD / Entrega</sub>
6. [Resiliencia entre microservicios: timeouts, retries, circuit breakers y load shedding en GCP](cloud/gcp/02-microservicios-y-casos.md#6-resiliencia-entre-microservicios-timeouts-retries-circuit-breakers-y-load-shedding-en-gcp) — <sub>Arquitectura / Resiliencia</sub>
7. [\[CASO\] El backlog de una suscripción de Pub/Sub crece sin parar y los mensajes se reentregan varias veces](cloud/gcp/02-microservicios-y-casos.md#7-caso-el-backlog-de-una-suscripción-de-pubsub-crece-sin-parar-y-los-mensajes-se-reentregan-varias-veces) `[CASO]` — <sub>Mensajería / Operación</sub>
8. [\[CASO\] Cloud Run con latencia p99 alta: diagnóstico de cold starts y contención](cloud/gcp/02-microservicios-y-casos.md#8-caso-cloud-run-con-latencia-p99-alta-diagnóstico-de-cold-starts-y-contención) `[CASO]` — <sub>Serverless / Rendimiento</sub>
9. [\[CASO\] GKE: pods OOMKilled intermitentes y el autoscaler de nodos tarda en absorber picos](cloud/gcp/02-microservicios-y-casos.md#9-caso-gke-pods-oomkilled-intermitentes-y-el-autoscaler-de-nodos-tarda-en-absorber-picos) `[CASO]` — <sub>Kubernetes / Operación</sub>
10. [\[CASO\] Cloud SQL (Postgres) agota las conexiones: `FATAL: remaining connection slots are reserved`](cloud/gcp/02-microservicios-y-casos.md#10-caso-cloud-sql-postgres-agota-las-conexiones-fatal-remaining-connection-slots-are-reserved) `[CASO]` — <sub>Bases de datos / Operación</sub>
11. [\[CASO\] La factura de BigQuery se triplica en un mes: queries sin particionar y dashboards descontrolados](cloud/gcp/02-microservicios-y-casos.md#11-caso-la-factura-de-bigquery-se-triplica-en-un-mes-queries-sin-particionar-y-dashboards-descontrolados) `[CASO]` — <sub>Datos / FinOps</sub>
12. [\[CASO\] Spanner con latencias de escritura degradadas: hotspotting por claves secuenciales](cloud/gcp/02-microservicios-y-casos.md#12-caso-spanner-con-latencias-de-escritura-degradadas-hotspotting-por-claves-secuenciales) `[CASO]` — <sub>Bases de datos distribuidas</sub>
13. [\[CASO\] Firestore con errores ABORTED y latencia: contención en documentos calientes](cloud/gcp/02-microservicios-y-casos.md#13-caso-firestore-con-errores-aborted-y-latencia-contención-en-documentos-calientes) `[CASO]` — <sub>Bases de datos NoSQL</sub>
14. [\[CASO\] Se ha filtrado una clave JSON de service account en un repositorio público: respuesta al incidente](cloud/gcp/02-microservicios-y-casos.md#14-caso-se-ha-filtrado-una-clave-json-de-service-account-en-un-repositorio-público-respuesta-al-incidente) `[CASO]` — <sub>Seguridad / Respuesta a incidentes</sub>
15. [\[CASO\] Latencia elevada entre servicios desplegados en regiones distintas](cloud/gcp/02-microservicios-y-casos.md#15-caso-latencia-elevada-entre-servicios-desplegados-en-regiones-distintas) `[CASO]` — <sub>Redes / Rendimiento</sub>
16. [\[CASO\] Errores 429 `RESOURCE_EXHAUSTED` en producción: cuotas de GCP alcanzadas](cloud/gcp/02-microservicios-y-casos.md#16-caso-errores-429-resource_exhausted-en-producción-cuotas-de-gcp-alcanzadas) `[CASO]` — <sub>Operación / Cuotas</sub>
17. [\[CASO\] Migración de AWS a GCP de una plataforma de microservicios: estrategia y mapeo de servicios](cloud/gcp/02-microservicios-y-casos.md#17-caso-migración-de-aws-a-gcp-de-una-plataforma-de-microservicios-estrategia-y-mapeo-de-servicios) `[CASO]` — <sub>Arquitectura / Migración</sub>
18. [\[CASO\] Incidente: Cloud Run devuelve errores porque alcanzó su límite de instancias](cloud/gcp/02-microservicios-y-casos.md#18-caso-incidente-cloud-run-devuelve-errores-porque-alcanzó-su-límite-de-instancias) `[CASO]` — <sub>Serverless / Operación</sub>

---

## 🧩 Microfrontends

Carpeta: [`microfrontends/`](microfrontends/) · 30 preguntas

### Microfrontends — Fundamentos y Arquitectura

[`01-fundamentos-y-arquitectura.md`](microfrontends/01-fundamentos-y-arquitectura.md) · 18 preguntas

1. [¿Qué son los microfrontends y cuándo NO deberías usarlos?](microfrontends/01-fundamentos-y-arquitectura.md#1-qué-son-los-microfrontends-y-cuándo-no-deberías-usarlos) — <sub>Fundamentos</sub>
2. [Patrones de composición: build-time, server-side, edge-side y client-side](microfrontends/01-fundamentos-y-arquitectura.md#2-patrones-de-composición-build-time-server-side-edge-side-y-client-side) — <sub>Fundamentos</sub>
3. [Module Federation en webpack 5: ¿cómo funciona y cómo se configura?](microfrontends/01-fundamentos-y-arquitectura.md#3-module-federation-en-webpack-5-cómo-funciona-y-cómo-se-configura) — <sub>Module Federation</sub>
4. [`shared`, `singleton` y la negociación de versiones: ¿cómo evitas dos Reacts en la página?](microfrontends/01-fundamentos-y-arquitectura.md#4-shared-singleton-y-la-negociación-de-versiones-cómo-evitas-dos-reacts-en-la-página) — <sub>Module Federation</sub>
5. [Remotes dinámicos: cargar microfrontends cuya URL no se conoce en build](microfrontends/01-fundamentos-y-arquitectura.md#5-remotes-dinámicos-cargar-microfrontends-cuya-url-no-se-conoce-en-build) — <sub>Module Federation</sub>
6. [Module Federation 2.0 y Rspack: ¿qué cambia respecto a MF clásico?](microfrontends/01-fundamentos-y-arquitectura.md#6-module-federation-20-y-rspack-qué-cambia-respecto-a-mf-clásico) — <sub>Module Federation</sub>
7. [single-spa: arquitectura, ciclo de vida y cuándo elegirlo sobre Module Federation](microfrontends/01-fundamentos-y-arquitectura.md#7-single-spa-arquitectura-ciclo-de-vida-y-cuándo-elegirlo-sobre-module-federation) — <sub>Frameworks de orquestación</sub>
8. [Import maps nativos y web components como base de microfrontends sin lock-in de bundler](microfrontends/01-fundamentos-y-arquitectura.md#8-import-maps-nativos-y-web-components-como-base-de-microfrontends-sin-lock-in-de-bundler) — <sub>Estándares web</sub>
9. [iframes para microfrontends: ¿cuándo son la respuesta correcta?](microfrontends/01-fundamentos-y-arquitectura.md#9-iframes-para-microfrontends-cuándo-son-la-respuesta-correcta) — <sub>Composición</sub>
10. [Routing en una arquitectura shell/container: ¿quién es dueño de la URL?](microfrontends/01-fundamentos-y-arquitectura.md#10-routing-en-una-arquitectura-shellcontainer-quién-es-dueño-de-la-url) — <sub>Arquitectura</sub>
11. [Comunicación entre microfrontends: custom events, pub/sub y por qué minimizarla](microfrontends/01-fundamentos-y-arquitectura.md#11-comunicación-entre-microfrontends-custom-events-pubsub-y-por-qué-minimizarla) — <sub>Arquitectura</sub>
12. [Diseño de contratos entre equipos: ¿qué es exactamente "el contrato" de un MFE?](microfrontends/01-fundamentos-y-arquitectura.md#12-diseño-de-contratos-entre-equipos-qué-es-exactamente-el-contrato-de-un-mfe) — <sub>Organización y arquitectura</sub>
13. [Design system compartido: versionado de la librería UI entre equipos autónomos](microfrontends/01-fundamentos-y-arquitectura.md#13-design-system-compartido-versionado-de-la-librería-ui-entre-equipos-autónomos) — <sub>Design system</sub>
14. [Autenticación y sesión compartida entre microfrontends](microfrontends/01-fundamentos-y-arquitectura.md#14-autenticación-y-sesión-compartida-entre-microfrontends) — <sub>Seguridad</sub>
15. [Aislamiento de CSS entre microfrontends: shadow DOM, CSS modules, prefijos](microfrontends/01-fundamentos-y-arquitectura.md#15-aislamiento-de-css-entre-microfrontends-shadow-dom-css-modules-prefijos) — <sub>Estilos</sub>
16. [Deployment independiente: versionado de remotes, manifests y estrategias de release](microfrontends/01-fundamentos-y-arquitectura.md#16-deployment-independiente-versionado-de-remotes-manifests-y-estrategias-de-release) — <sub>Delivery</sub>
17. [Estrategias de testing en microfrontends: E2E cross-MFE y contract testing](microfrontends/01-fundamentos-y-arquitectura.md#17-estrategias-de-testing-en-microfrontends-e2e-cross-mfe-y-contract-testing) — <sub>Testing</sub>
18. [Performance en microfrontends: duplicación, waterfall de carga y prefetch](microfrontends/01-fundamentos-y-arquitectura.md#18-performance-en-microfrontends-duplicación-waterfall-de-carga-y-prefetch) — <sub>Performance</sub>

### Microfrontends — Casos y Problemas

[`02-casos-y-problemas.md`](microfrontends/02-casos-y-problemas.md) · 12 preguntas

1. [Dos MFEs cargan versiones incompatibles de React y la app crashea](microfrontends/02-casos-y-problemas.md#1-dos-mfes-cargan-versiones-incompatibles-de-react-y-la-app-crashea) `[CASO]` — <sub>Module Federation</sub>
2. [Un deploy de un remote rompió producción para todos los equipos](microfrontends/02-casos-y-problemas.md#2-un-deploy-de-un-remote-rompió-producción-para-todos-los-equipos) `[CASO]` — <sub>Delivery / Gobernanza</sub>
3. [El bundle total de la aplicación es gigante por dependencias duplicadas](microfrontends/02-casos-y-problemas.md#3-el-bundle-total-de-la-aplicación-es-gigante-por-dependencias-duplicadas) `[CASO]` — <sub>Performance</sub>
4. [Migración incremental de un monolito Angular a microfrontends con React (strangler fig)](microfrontends/02-casos-y-problemas.md#4-migración-incremental-de-un-monolito-angular-a-microfrontends-con-react-strangler-fig) `[CASO]` — <sub>Migración / Arquitectura</sub>
5. [Los estilos de un MFE pisan a otro en producción](microfrontends/02-casos-y-problemas.md#5-los-estilos-de-un-mfe-pisan-a-otro-en-producción) `[CASO]` — <sub>Estilos</sub>
6. [Memory leak al montar y desmontar MFEs repetidamente](microfrontends/02-casos-y-problemas.md#6-memory-leak-al-montar-y-desmontar-mfes-repetidamente) `[CASO]` — <sub>Runtime / Ciclo de vida</sub>
7. [Estado de autenticación desincronizado entre MFEs](microfrontends/02-casos-y-problemas.md#7-estado-de-autenticación-desincronizado-entre-mfes) `[CASO]` — <sub>Seguridad / Estado</sub>
8. [Latencia de carga inicial alta por waterfall de remotes](microfrontends/02-casos-y-problemas.md#8-latencia-de-carga-inicial-alta-por-waterfall-de-remotes) `[CASO]` — <sub>Performance</sub>
9. [Un equipo necesita releases independientes pero el design system introduce breaking changes](microfrontends/02-casos-y-problemas.md#9-un-equipo-necesita-releases-independientes-pero-el-design-system-introduce-breaking-changes) `[CASO]` — <sub>Design system / Gobernanza</sub>
10. [SSR con microfrontends: Next.js multi-zone y sus límites](microfrontends/02-casos-y-problemas.md#10-ssr-con-microfrontends-nextjs-multi-zone-y-sus-límites) `[CASO]` — <sub>SSR / Arquitectura</sub>
11. [¿Monorepo con módulos o microfrontends reales? Análisis organizacional y ley de Conway](microfrontends/02-casos-y-problemas.md#11-monorepo-con-módulos-o-microfrontends-reales-análisis-organizacional-y-ley-de-conway) `[CASO]` — <sub>Arquitectura / Organización</sub>
12. [Observabilidad y error tracking por equipo: ¿de quién es este error en producción?](microfrontends/02-casos-y-problemas.md#12-observabilidad-y-error-tracking-por-equipo-de-quién-es-este-error-en-producción) `[CASO]` — <sub>Observabilidad</sub>

---

## 🔐 Seguridad y Vulnerabilidades

Carpeta: [`seguridad-vulnerabilidades/`](seguridad-vulnerabilidades/) · 42 preguntas

### OWASP Top 10 y Vulnerabilidades Comunes

[`01-owasp-y-vulnerabilidades.md`](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md) · 18 preguntas

1. [¿Qué es Broken Access Control (A01) y por qué encabeza el OWASP Top 10?](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#1-qué-es-broken-access-control-a01-y-por-qué-encabeza-el-owasp-top-10) — <sub>OWASP Top 10</sub>
2. [¿Qué son los fallos criptográficos (A02) y cómo se evitan en un backend?](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#2-qué-son-los-fallos-criptográficos-a02-y-cómo-se-evitan-en-un-backend) — <sub>OWASP Top 10</sub>
3. [Explica las inyecciones (SQL, NoSQL, command) y cómo prevenirlas de forma sistemática](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#3-explica-las-inyecciones-sql-nosql-command-y-cómo-prevenirlas-de-forma-sistemática) — <sub>OWASP Top 10</sub>
4. [¿Qué es Insecure Design (A04) y en qué se diferencia de un bug de implementación?](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#4-qué-es-insecure-design-a04-y-en-qué-se-diferencia-de-un-bug-de-implementación) — <sub>OWASP Top 10</sub>
5. [¿Qué es Security Misconfiguration (A05) y cómo se gestiona a escala?](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#5-qué-es-security-misconfiguration-a05-y-cómo-se-gestiona-a-escala) — <sub>OWASP Top 10</sub>
6. [Componentes vulnerables y ataques de supply chain (A06): ¿cómo gestionas el riesgo de terceros?](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#6-componentes-vulnerables-y-ataques-de-supply-chain-a06-cómo-gestionas-el-riesgo-de-terceros) — <sub>OWASP Top 10 / Supply chain</sub>
7. [Fallos de identificación y autenticación (A07): errores comunes y diseño robusto de login](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#7-fallos-de-identificación-y-autenticación-a07-errores-comunes-y-diseño-robusto-de-login) — <sub>OWASP Top 10 / Autenticación</sub>
8. [Fallos de integridad de software y datos (A08): CI/CD, actualizaciones y deserialización](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#8-fallos-de-integridad-de-software-y-datos-a08-cicd-actualizaciones-y-deserialización) — <sub>OWASP Top 10 / Integridad</sub>
9. [Logging y monitoring insuficiente (A09): ¿qué registrar, qué no, y cómo detectar ataques?](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#9-logging-y-monitoring-insuficiente-a09-qué-registrar-qué-no-y-cómo-detectar-ataques) — <sub>OWASP Top 10 / Detección</sub>
10. [Server-Side Request Forgery (SSRF, A10): riesgo en la nube y defensas](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#10-server-side-request-forgery-ssrf-a10-riesgo-en-la-nube-y-defensas) — <sub>OWASP Top 10 / SSRF</sub>
11. [XSS y Content Security Policy: modelo de amenaza y defensa en capas](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#11-xss-y-content-security-policy-modelo-de-amenaza-y-defensa-en-capas) — <sub>Web / XSS</sub>
12. [CSRF y SameSite: ¿sigue siendo relevante y cómo se defiende hoy?](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#12-csrf-y-samesite-sigue-siendo-relevante-y-cómo-se-defiende-hoy) — <sub>Web / CSRF</sub>
13. [Deserialización insegura en Java y Node: ¿por qué es tan peligrosa y cómo se evita?](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#13-deserialización-insegura-en-java-y-node-por-qué-es-tan-peligrosa-y-cómo-se-evita) — <sub>Deserialización</sub>
14. [JWT: errores comunes (alg none, secretos débiles, audience/issuer, revocación) y uso correcto](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#14-jwt-errores-comunes-alg-none-secretos-débiles-audienceissuer-revocación-y-uso-correcto) — <sub>Autenticación / JWT</sub>
15. [OAuth2 y OIDC: flujos correctos, PKCE y errores comunes de implementación](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#15-oauth2-y-oidc-flujos-correctos-pkce-y-errores-comunes-de-implementación) — <sub>Autenticación / OAuth2-OIDC</sub>
16. [Secrets management: ciclo de vida, rotación y detección de secretos en repositorios](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#16-secrets-management-ciclo-de-vida-rotación-y-detección-de-secretos-en-repositorios) — <sub>Gestión de secretos</sub>
17. [Dependencias vulnerables: SCA, priorización con CVSS/EPSS y respuesta a un CVE crítico](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#17-dependencias-vulnerables-sca-priorización-con-cvssepss-y-respuesta-a-un-cve-crítico) `[CASO]` — <sub>Supply chain / Gestión de vulnerabilidades</sub>
18. [Seguridad en contenedores y Kubernetes: imágenes, least privilege, network policies y pod security](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md#18-seguridad-en-contenedores-y-kubernetes-imágenes-least-privilege-network-policies-y-pod-security) — <sub>Contenedores / Kubernetes</sub>

### Seguridad en Microservicios

[`02-seguridad-en-microservicios.md`](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md) · 12 preguntas

1. [¿Qué significa Zero Trust aplicado a la comunicación entre microservicios?](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#1-qué-significa-zero-trust-aplicado-a-la-comunicación-entre-microservicios) — <sub>Arquitectura / Zero Trust</sub>
2. [mTLS y service mesh: ¿qué aportan y qué problemas no resuelven?](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#2-mtls-y-service-mesh-qué-aportan-y-qué-problemas-no-resuelven) — <sub>Comunicación segura / Service mesh</sub>
3. [Autenticación servicio-a-servicio: client credentials, workload identity y sus trade-offs](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#3-autenticación-servicio-a-servicio-client-credentials-workload-identity-y-sus-trade-offs) — <sub>Autenticación M2M</sub>
4. [Propagación de la identidad del usuario entre servicios: JWT passthrough vs token exchange](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#4-propagación-de-la-identidad-del-usuario-entre-servicios-jwt-passthrough-vs-token-exchange) — <sub>Identidad distribuida</sub>
5. [API Gateway como punto de enforcement: qué centralizar y qué no](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#5-api-gateway-como-punto-de-enforcement-qué-centralizar-y-qué-no) — <sub>Arquitectura / Gateway</sub>
6. [Rate limiting y protección contra abuso en APIs distribuidas](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#6-rate-limiting-y-protección-contra-abuso-en-apis-distribuidas) — <sub>Anti-abuso</sub>
7. [Validación de entrada en cada servicio: ¿por qué no basta validar en el borde?](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#7-validación-de-entrada-en-cada-servicio-por-qué-no-basta-validar-en-el-borde) — <sub>Defensa en profundidad</sub>
8. [Cifrado en tránsito y en reposo en una plataforma de microservicios](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#8-cifrado-en-tránsito-y-en-reposo-en-una-plataforma-de-microservicios) — <sub>Protección de datos</sub>
9. [Multi-tenancy: estrategias de aislamiento de datos y prevención de fugas entre tenants](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#9-multi-tenancy-estrategias-de-aislamiento-de-datos-y-prevención-de-fugas-entre-tenants) — <sub>Multi-tenancy / Aislamiento</sub>
10. [Auditoría y trazabilidad en sistemas distribuidos: diseño de un audit trail confiable](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#10-auditoría-y-trazabilidad-en-sistemas-distribuidos-diseño-de-un-audit-trail-confiable) — <sub>Auditoría / Observabilidad</sub>
11. [Seguridad en pipelines CI/CD: firmado de artefactos, SLSA y protección de la cadena de despliegue](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#11-seguridad-en-pipelines-cicd-firmado-de-artefactos-slsa-y-protección-de-la-cadena-de-despliegue) — <sub>CI/CD / Supply chain</sub>
12. [Gestión continua de vulnerabilidades en una plataforma de microservicios: escaneo y SLAs de remediación](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md#12-gestión-continua-de-vulnerabilidades-en-una-plataforma-de-microservicios-escaneo-y-slas-de-remediación) — <sub>Gestión de vulnerabilidades</sub>

### Casos e Incidentes de Seguridad

[`03-casos-e-incidentes.md`](seguridad-vulnerabilidades/03-casos-e-incidentes.md) · 12 preguntas

1. [Encuentran una API key commiteada en el repositorio](seguridad-vulnerabilidades/03-casos-e-incidentes.md#1-encuentran-una-api-key-commiteada-en-el-repositorio) `[CASO]` — <sub>Respuesta a incidentes / Secretos</sub>
2. [Anuncian un CVE crítico en una librería usada en 40 servicios](seguridad-vulnerabilidades/03-casos-e-incidentes.md#2-anuncian-un-cve-crítico-en-una-librería-usada-en-40-servicios) `[CASO]` — <sub>Respuesta a incidentes / Supply chain</sub>
3. [Detectas tráfico anómalo que sugiere una cuenta de servicio comprometida](seguridad-vulnerabilidades/03-casos-e-incidentes.md#3-detectas-tráfico-anómalo-que-sugiere-una-cuenta-de-servicio-comprometida) `[CASO]` — <sub>Respuesta a incidentes / Identidad M2M</sub>
4. [Un pentest reporta un IDOR en tu API](seguridad-vulnerabilidades/03-casos-e-incidentes.md#4-un-pentest-reporta-un-idor-en-tu-api) `[CASO]` — <sub>Respuesta a incidentes / Broken Access Control</sub>
5. [Encuentran datos sensibles en los logs](seguridad-vulnerabilidades/03-casos-e-incidentes.md#5-encuentran-datos-sensibles-en-los-logs) `[CASO]` — <sub>Respuesta a incidentes / Fuga de datos</sub>
6. [Un tercero reporta que tu endpoint permite SSRF hacia la metadata del cloud](seguridad-vulnerabilidades/03-casos-e-incidentes.md#6-un-tercero-reporta-que-tu-endpoint-permite-ssrf-hacia-la-metadata-del-cloud) `[CASO]` — <sub>Respuesta a incidentes / SSRF</sub>
7. [Un token JWT robado está siendo usado en producción](seguridad-vulnerabilidades/03-casos-e-incidentes.md#7-un-token-jwt-robado-está-siendo-usado-en-producción) `[CASO]` — <sub>Respuesta a incidentes / JWT</sub>
8. [Ataque de credential stuffing en el login](seguridad-vulnerabilidades/03-casos-e-incidentes.md#8-ataque-de-credential-stuffing-en-el-login) `[CASO]` — <sub>Respuesta a incidentes / Autenticación</sub>
9. [Una dependencia de npm resulta comprometida (supply chain)](seguridad-vulnerabilidades/03-casos-e-incidentes.md#9-una-dependencia-de-npm-resulta-comprometida-supply-chain) `[CASO]` — <sub>Respuesta a incidentes / Supply chain</sub>
10. [Datos de clientes expuestos por un bucket S3 mal configurado](seguridad-vulnerabilidades/03-casos-e-incidentes.md#10-datos-de-clientes-expuestos-por-un-bucket-s3-mal-configurado) `[CASO]` — <sub>Respuesta a incidentes / Misconfiguration</sub>
11. [Certificado TLS expirado en producción](seguridad-vulnerabilidades/03-casos-e-incidentes.md#11-certificado-tls-expirado-en-producción) `[CASO]` — <sub>Respuesta a incidentes / Disponibilidad</sub>
12. [Diseñar un programa de seguridad para un equipo que no tiene ninguno](seguridad-vulnerabilidades/03-casos-e-incidentes.md#12-diseñar-un-programa-de-seguridad-para-un-equipo-que-no-tiene-ninguno) `[CASO]` — <sub>Estrategia / Programa de seguridad</sub>

---

## 🔄 Versionamiento de APIs

Carpeta: [`versionamiento-apis/`](versionamiento-apis/) · 40 preguntas

### Versionamiento de APIs

[`01-versionamiento-de-apis.md`](versionamiento-apis/01-versionamiento-de-apis.md) · 16 preguntas

1. [¿Qué estrategias existen para versionar una API REST y cuáles son los trade-offs reales de cada una?](versionamiento-apis/01-versionamiento-de-apis.md#1-qué-estrategias-existen-para-versionar-una-api-rest-y-cuáles-son-los-trade-offs-reales-de-cada-una) — <sub>REST / Diseño de APIs</sub>
2. [¿Qué es exactamente un breaking change en una API? Da una lista exhaustiva, incluyendo casos no obvios](versionamiento-apis/01-versionamiento-de-apis.md#2-qué-es-exactamente-un-breaking-change-en-una-api-da-una-lista-exhaustiva-incluyendo-casos-no-obvios) — <sub>Compatibilidad / Contratos</sub>
3. [Define backward compatibility y forward compatibility con precisión, desde la perspectiva productor/consumidor](versionamiento-apis/01-versionamiento-de-apis.md#3-define-backward-compatibility-y-forward-compatibility-con-precisión-desde-la-perspectiva-productorconsumidor) — <sub>Compatibilidad / Fundamentos</sub>
4. [Explica el patrón tolerant reader y la ley de Postel aplicada a APIs. ¿Cuáles son los riesgos de ser demasiado tolerante?](versionamiento-apis/01-versionamiento-de-apis.md#4-explica-el-patrón-tolerant-reader-y-la-ley-de-postel-aplicada-a-apis-cuáles-son-los-riesgos-de-ser-demasiado-tolerante) — <sub>Compatibilidad / Patrones de integración</sub>
5. [¿Cómo se versionan mensajes y servicios en gRPC/protobuf? Reglas de field numbers, `reserved`, y por qué proto3 hizo todo opcional](versionamiento-apis/01-versionamiento-de-apis.md#5-cómo-se-versionan-mensajes-y-servicios-en-grpcprotobuf-reglas-de-field-numbers-reserved-y-por-qué-proto3-hizo-todo-opcional) — <sub>gRPC / Protobuf</sub>
6. [Versionado de schemas de eventos: modos de compatibilidad del Schema Registry (BACKWARD, FORWARD, FULL, TRANSITIVE) y quién migra primero](versionamiento-apis/01-versionamiento-de-apis.md#6-versionado-de-schemas-de-eventos-modos-de-compatibilidad-del-schema-registry-backward-forward-full-transitive-y-quién-migra-primero) — <sub>Eventos / Kafka / Schema Registry</sub>
7. [\[CASO\] Un equipo añade un campo a un evento Avro y los consumidores de otro equipo empiezan a fallar en producción. Diagnostica y propone la solución](versionamiento-apis/01-versionamiento-de-apis.md#7-caso-un-equipo-añade-un-campo-a-un-evento-avro-y-los-consumidores-de-otro-equipo-empiezan-a-fallar-en-producción-diagnostica-y-propone-la-solución) `[CASO]` — <sub>Eventos / Kafka / Schema Registry</sub>
8. [¿Por qué GraphQL "no se versiona"? ¿Cómo se evoluciona un schema GraphQL y qué riesgos tiene ese modelo?](versionamiento-apis/01-versionamiento-de-apis.md#8-por-qué-graphql-no-se-versiona-cómo-se-evoluciona-un-schema-graphql-y-qué-riesgos-tiene-ese-modelo) — <sub>GraphQL</sub>
9. [¿Cómo se aplica SemVer a APIs HTTP y a librerías internas? ¿Qué significa cada número y por qué 0.x es peligroso?](versionamiento-apis/01-versionamiento-de-apis.md#9-cómo-se-aplica-semver-a-apis-http-y-a-librerías-internas-qué-significa-cada-número-y-por-qué-0x-es-peligroso) — <sub>SemVer / Gestión de dependencias</sub>
10. [Contract-first con OpenAPI: ¿cómo se usa el contrato para generar código y detectar breaking changes automáticamente en CI?](versionamiento-apis/01-versionamiento-de-apis.md#10-contract-first-con-openapi-cómo-se-usa-el-contrato-para-generar-código-y-detectar-breaking-changes-automáticamente-en-ci) — <sub>API-first / OpenAPI / CI-CD</sub>
11. [¿Cómo se depreca formalmente una versión de API? Headers `Deprecation` y `Sunset`, comunicación, métricas y brownouts](versionamiento-apis/01-versionamiento-de-apis.md#11-cómo-se-depreca-formalmente-una-versión-de-api-headers-deprecation-y-sunset-comunicación-métricas-y-brownouts) — <sub>Ciclo de vida / Deprecación</sub>
12. [¿Qué papel juega un API Gateway en el versionado? Routing por versión y transformaciones para mantener versiones viejas sin duplicar backend](versionamiento-apis/01-versionamiento-de-apis.md#12-qué-papel-juega-un-api-gateway-en-el-versionado-routing-por-versión-y-transformaciones-para-mantener-versiones-viejas-sin-duplicar-backend) — <sub>API Gateway / Infraestructura</sub>
13. [Hypermedia/HATEOAS: ¿qué aporta realmente a la evolución de una API y por qué casi nadie lo usa?](versionamiento-apis/01-versionamiento-de-apis.md#13-hypermediahateoas-qué-aporta-realmente-a-la-evolución-de-una-api-y-por-qué-casi-nadie-lo-usa) — <sub>REST / Hypermedia</sub>
14. [Idempotencia y versionado de comportamiento: ¿por qué cambiar la semántica de una operación es un breaking change aunque el esquema no cambie?](versionamiento-apis/01-versionamiento-de-apis.md#14-idempotencia-y-versionado-de-comportamiento-por-qué-cambiar-la-semántica-de-una-operación-es-un-breaking-change-aunque-el-esquema-no-cambie) — <sub>Semántica de operaciones / Diseño</sub>
15. [Versionado de SDKs cliente: relación entre versión del SDK y versión de la API, generación automática y el modelo de pinning de Stripe](versionamiento-apis/01-versionamiento-de-apis.md#15-versionado-de-sdks-cliente-relación-entre-versión-del-sdk-y-versión-de-la-api-generación-automática-y-el-modelo-de-pinning-de-stripe) — <sub>SDKs / Developer Experience</sub>
16. [\[CASO\] Tras un release, un endpoint empieza a devolver 400 a un subconjunto de clientes que "no cambiaron nada". El equipo solo endureció la validación de un campo. Analiza el incidente y define cómo prevenirlo](versionamiento-apis/01-versionamiento-de-apis.md#16-caso-tras-un-release-un-endpoint-empieza-a-devolver-400-a-un-subconjunto-de-clientes-que-no-cambiaron-nada-el-equipo-solo-endureció-la-validación-de-un-campo-analiza-el-incidente-y-define-cómo-prevenirlo) `[CASO]` — <sub>Compatibilidad / Operación</sub>

### Versionamiento de Servicios y Datos

[`02-versionamiento-de-servicios-y-datos.md`](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md) · 14 preguntas

1. [Explica el patrón expand/contract (parallel change) para evolucionar una base de datos sin downtime](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#1-explica-el-patrón-expandcontract-parallel-change-para-evolucionar-una-base-de-datos-sin-downtime) — <sub>Bases de datos</sub>
2. [¿Cómo estructuras migraciones de esquema con Flyway o Liquibase para despliegues sin downtime?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#2-cómo-estructuras-migraciones-de-esquema-con-flyway-o-liquibase-para-despliegues-sin-downtime) — <sub>Bases de datos</sub>
3. [\[CASO\] Debes hacer backfill de 200M de filas y migrar la lectura a una tabla nueva sin ventana de mantenimiento. ¿Cómo secuencias dual write, backfill y dual read?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#3-caso-debes-hacer-backfill-de-200m-de-filas-y-migrar-la-lectura-a-una-tabla-nueva-sin-ventana-de-mantenimiento-cómo-secuencias-dual-write-backfill-y-dual-read) `[CASO]` — <sub>Bases de datos</sub>
4. [¿Cómo versionas mensajes en Kafka/RabbitMQ/SQS cuando conviven consumidores con distintas versiones?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#4-cómo-versionas-mensajes-en-kafkarabbitmqsqs-cuando-conviven-consumidores-con-distintas-versiones) — <sub>Mensajería</sub>
5. [\[CASO\] Publicas eventos en un topic Kafka consumido por 8 equipos, algunos externos a tu organización, y necesitas un breaking change. ¿Qué haces?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#5-caso-publicas-eventos-en-un-topic-kafka-consumido-por-8-equipos-algunos-externos-a-tu-organización-y-necesitas-un-breaking-change-qué-haces) `[CASO]` — <sub>Mensajería</sub>
6. [¿Por qué un rolling deployment exige compatibilidad N/N-1 y qué superficies de contrato afecta?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#6-por-qué-un-rolling-deployment-exige-compatibilidad-nn-1-y-qué-superficies-de-contrato-afecta) — <sub>Despliegue</sub>
7. [\[CASO\] Vas a hacer un despliegue blue/green (y luego canary) de un servicio que incluye un cambio de esquema. ¿Cómo lo secuencias y qué NO se duplica?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#7-caso-vas-a-hacer-un-despliegue-bluegreen-y-luego-canary-de-un-servicio-que-incluye-un-cambio-de-esquema-cómo-lo-secuencias-y-qué-no-se-duplica) `[CASO]` — <sub>Despliegue</sub>
8. [¿Cuándo usarías feature flags en lugar de (o además de) versionar, y qué deuda generan?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#8-cuándo-usarías-feature-flags-en-lugar-de-o-además-de-versionar-y-qué-deuda-generan) — <sub>Estrategia de release</sub>
9. [¿Cómo funcionan los consumer-driven contracts con Pact en CI y qué detectan que los tests E2E no?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#9-cómo-funcionan-los-consumer-driven-contracts-con-pact-en-ci-y-qué-detectan-que-los-tests-e2e-no) — <sub>Testing de contratos</sub>
10. [¿Cómo versionas imágenes de contenedor y artefactos para que los despliegues sean reproducibles?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#10-cómo-versionas-imágenes-de-contenedor-y-artefactos-para-que-los-despliegues-sean-reproducibles) — <sub>Artefactos y build</sub>
11. [Monorepo vs multirepo: ¿cómo cambia el versionado de servicios y librerías internas en cada modelo?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#11-monorepo-vs-multirepo-cómo-cambia-el-versionado-de-servicios-y-librerías-internas-en-cada-modelo) — <sub>Organización de código</sub>
12. [\[CASO\] Tu plataforma interna debe retirar una API usada por 15 equipos. "Que todos migren el mismo sprint" ha fracasado dos veces. Diseña el proceso de coordinación del breaking change](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#12-caso-tu-plataforma-interna-debe-retirar-una-api-usada-por-15-equipos-que-todos-migren-el-mismo-sprint-ha-fracasado-dos-veces-diseña-el-proceso-de-coordinación-del-breaking-change) `[CASO]` — <sub>Organización y procesos</sub>
13. [¿Cómo versionas configuración e infraestructura (Terraform, config de aplicación) y por qué el pinning importa?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#13-cómo-versionas-configuración-e-infraestructura-terraform-config-de-aplicación-y-por-qué-el-pinning-importa) — <sub>Infraestructura y configuración</sub>
14. [En event sourcing los eventos almacenados son inmutables y viven para siempre. ¿Cómo evolucionas sus esquemas?](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md#14-en-event-sourcing-los-eventos-almacenados-son-inmutables-y-viven-para-siempre-cómo-evolucionas-sus-esquemas) — <sub>Event sourcing</sub>

### Casos y Problemas de Versionamiento

[`03-casos-y-problemas.md`](versionamiento-apis/03-casos-y-problemas.md) · 10 preguntas

1. [Renombrar un campo usado por 15 consumidores (expand/contract end-to-end)](versionamiento-apis/03-casos-y-problemas.md#1-renombrar-un-campo-usado-por-15-consumidores-expandcontract-end-to-end) `[CASO]` — <sub>Evolución de contratos</sub>
2. [Un equipo rompió a 3 servicios en producción con un breaking change sin avisar](versionamiento-apis/03-casos-y-problemas.md#2-un-equipo-rompió-a-3-servicios-en-producción-con-un-breaking-change-sin-avisar) `[CASO]` — <sub>Gestión de incidentes y prevención</sub>
3. [Migrar una columna VARCHAR a JSONB en una tabla de 500M filas sin downtime](versionamiento-apis/03-casos-y-problemas.md#3-migrar-una-columna-varchar-a-jsonb-en-una-tabla-de-500m-filas-sin-downtime) `[CASO]` — <sub>Migraciones de esquema de BD</sub>
4. [Deprecar /v1 con clientes móviles antiguos que no actualizan](versionamiento-apis/03-casos-y-problemas.md#4-deprecar-v1-con-clientes-móviles-antiguos-que-no-actualizan) `[CASO]` — <sub>Deprecación y ciclo de vida</sub>
5. [Evolucionar un evento de Kafka con 8 consumidores en distintos equipos](versionamiento-apis/03-casos-y-problemas.md#5-evolucionar-un-evento-de-kafka-con-8-consumidores-en-distintos-equipos) `[CASO]` — <sub>Evolución de eventos y esquemas</sub>
6. [Rollback de un deploy cuyo nuevo esquema ya escribió datos](versionamiento-apis/03-casos-y-problemas.md#6-rollback-de-un-deploy-cuyo-nuevo-esquema-ya-escribió-datos) `[CASO]` — <sub>Despliegue y compatibilidad de datos</sub>
7. [Unificar dos APIs duplicadas que divergieron entre equipos](versionamiento-apis/03-casos-y-problemas.md#7-unificar-dos-apis-duplicadas-que-divergieron-entre-equipos) `[CASO]` — <sub>Consolidación y arquitectura</sub>
8. [Un cliente externo se integró a un campo interno no documentado (ley de Hyrum)](versionamiento-apis/03-casos-y-problemas.md#8-un-cliente-externo-se-integró-a-un-campo-interno-no-documentado-ley-de-hyrum) `[CASO]` — <sub>Contratos implícitos</sub>
9. [Versionar una librería interna compartida por 30 servicios](versionamiento-apis/03-casos-y-problemas.md#9-versionar-una-librería-interna-compartida-por-30-servicios) `[CASO]` — <sub>Dependencias y librerías compartidas</sub>
10. [Diseñar el proceso de governance de APIs para 50 equipos](versionamiento-apis/03-casos-y-problemas.md#10-diseñar-el-proceso-de-governance-de-apis-para-50-equipos) `[CASO]` — <sub>Governance y plataforma</sub>

---

## 📨 Mensajería y Event-Driven (Kafka · RabbitMQ · Colas)

Carpeta: [`mensajeria-eventos/`](mensajeria-eventos/) · 59 preguntas

### Fundamentos de Mensajería y Arquitecturas Event-Driven — Preguntas de Entrevista Senior

[`01-fundamentos-de-mensajeria.md`](mensajeria-eventos/01-fundamentos-de-mensajeria.md) · 15 preguntas

1. [¿Por qué meterías una cola entre dos servicios? ¿Qué compras y qué pagas?](mensajeria-eventos/01-fundamentos-de-mensajeria.md#1-por-qué-meterías-una-cola-entre-dos-servicios-qué-compras-y-qué-pagas) — <sub>Arquitectura</sub>
2. [Semánticas de entrega: at-most-once, at-least-once, exactly-once. ¿Por qué exactly-once end-to-end es un mito?](mensajeria-eventos/01-fundamentos-de-mensajeria.md#2-semánticas-de-entrega-at-most-once-at-least-once-exactly-once-por-qué-exactly-once-end-to-end-es-un-mito) — <sub>Semánticas de entrega</sub>
3. [¿Cómo haces un consumidor idempotente? Claves de idempotencia, tabla inbox, dedupe y TTL](mensajeria-eventos/01-fundamentos-de-mensajeria.md#3-cómo-haces-un-consumidor-idempotente-claves-de-idempotencia-tabla-inbox-dedupe-y-ttl) — <sub>Fiabilidad</sub>
4. [Patrón outbox transaccional: ¿por qué el dual write está prohibido y cómo lo implementa Debezium?](mensajeria-eventos/01-fundamentos-de-mensajeria.md#4-patrón-outbox-transaccional-por-qué-el-dual-write-está-prohibido-y-cómo-lo-implementa-debezium) — <sub>Patrones de integración</sub>
5. [Ordering: ¿qué garantiza realmente un broker y qué haces cuando el orden importa de verdad?](mensajeria-eventos/01-fundamentos-de-mensajeria.md#5-ordering-qué-garantiza-realmente-un-broker-y-qué-haces-cuando-el-orden-importa-de-verdad) — <sub>Ordering / Particionado</sub>
6. [Backpressure y colas: ley de Little, productor más rápido que el consumidor, límites y load shedding](mensajeria-eventos/01-fundamentos-de-mensajeria.md#6-backpressure-y-colas-ley-de-little-productor-más-rápido-que-el-consumidor-límites-y-load-shedding) — <sub>Capacidad / Performance</sub>
7. [Dead letter queues: ¿cuándo envías un mensaje, qué metadatos guardas y cómo reprocesas?](mensajeria-eventos/01-fundamentos-de-mensajeria.md#7-dead-letter-queues-cuándo-envías-un-mensaje-qué-metadatos-guardas-y-cómo-reprocesas) — <sub>Fiabilidad</sub>
8. [Event notification vs event-carried state transfer vs event sourcing: diferencias y cuándo usar cada uno](mensajeria-eventos/01-fundamentos-de-mensajeria.md#8-event-notification-vs-event-carried-state-transfer-vs-event-sourcing-diferencias-y-cuándo-usar-cada-uno) — <sub>Patrones event-driven</sub>
9. [Event sourcing en serio: qué resuelve, qué complica y cuándo NO usarlo](mensajeria-eventos/01-fundamentos-de-mensajeria.md#9-event-sourcing-en-serio-qué-resuelve-qué-complica-y-cuándo-no-usarlo) — <sub>Event Sourcing</sub>
10. [CQRS: ¿qué es de verdad, qué relación tiene con los eventos y cómo manejas la consistencia eventual en la UI?](mensajeria-eventos/01-fundamentos-de-mensajeria.md#10-cqrs-qué-es-de-verdad-qué-relación-tiene-con-los-eventos-y-cómo-manejas-la-consistencia-eventual-en-la-ui) — <sub>CQRS</sub>
11. [Sagas: coreografía vs orquestación, compensaciones, timeouts y dónde vive el estado](mensajeria-eventos/01-fundamentos-de-mensajeria.md#11-sagas-coreografía-vs-orquestación-compensaciones-timeouts-y-dónde-vive-el-estado) — <sub>Transacciones distribuidas</sub>
12. [Colas de comando vs topics de eventos: ¿qué diferencia semántica hay y quién es dueño del contrato?](mensajeria-eventos/01-fundamentos-de-mensajeria.md#12-colas-de-comando-vs-topics-de-eventos-qué-diferencia-semántica-hay-y-quién-es-dueño-del-contrato) — <sub>Contratos / Diseño</sub>
13. [Schema evolution en eventos: compatibilidad backward/forward/full, schema registry y cómo migrar consumidores](mensajeria-eventos/01-fundamentos-de-mensajeria.md#13-schema-evolution-en-eventos-compatibilidad-backwardforwardfull-schema-registry-y-cómo-migrar-consumidores) — <sub>Schema evolution</sub>
14. [Reintentos: backoff exponencial con jitter, retry topics, retry budget y cuándo NO reintentar](mensajeria-eventos/01-fundamentos-de-mensajeria.md#14-reintentos-backoff-exponencial-con-jitter-retry-topics-retry-budget-y-cuándo-no-reintentar) — <sub>Resiliencia</sub>
15. [\[CASO\] Comunicación entre el servicio de pedidos y 6 servicios downstream](mensajeria-eventos/01-fundamentos-de-mensajeria.md#15-caso-comunicación-entre-el-servicio-de-pedidos-y-6-servicios-downstream) `[CASO]` — <sub>Diseño de sistemas</sub>

### Apache Kafka — Preguntas de Entrevista Senior

[`02-kafka.md`](mensajeria-eventos/02-kafka.md) · 18 preguntas

1. [Arquitectura de Kafka: brokers, topics, particiones, réplicas e ISR. ¿Por qué decimos que es un log distribuido y no una cola?](mensajeria-eventos/02-kafka.md#1-arquitectura-de-kafka-brokers-topics-particiones-réplicas-e-isr-por-qué-decimos-que-es-un-log-distribuido-y-no-una-cola) — <sub>Arquitectura</sub>
2. [KRaft vs ZooKeeper: ¿qué cambió exactamente y por qué el proyecto migró?](mensajeria-eventos/02-kafka.md#2-kraft-vs-zookeeper-qué-cambió-exactamente-y-por-qué-el-proyecto-migró) — <sub>Arquitectura</sub>
3. [El productor por dentro: batching, `linger.ms`, compresión, particionador sticky, `acks` e idempotencia (PID + secuencias)](mensajeria-eventos/02-kafka.md#3-el-productor-por-dentro-batching-lingerms-compresión-particionador-sticky-acks-e-idempotencia-pid--secuencias) — <sub>Productor</sub>
4. [¿Cuándo se puede perder un mensaje en Kafka? Enumera todas las vías](mensajeria-eventos/02-kafka.md#4-cuándo-se-puede-perder-un-mensaje-en-kafka-enumera-todas-las-vías) — <sub>Fiabilidad</sub>
5. [Consumer groups y rebalancing: eager vs cooperative, static membership y los dos timeouts](mensajeria-eventos/02-kafka.md#5-consumer-groups-y-rebalancing-eager-vs-cooperative-static-membership-y-los-dos-timeouts) — <sub>Consumidor</sub>
6. [Gestión de offsets: auto-commit, commit manual, batch vs record, y qué pasa tras un crash](mensajeria-eventos/02-kafka.md#6-gestión-de-offsets-auto-commit-commit-manual-batch-vs-record-y-qué-pasa-tras-un-crash) — <sub>Consumidor</sub>
7. [Exactly-once en Kafka: transacciones, `read_committed`, `transactional.id` y zombie fencing. ¿Qué cubre y qué no?](mensajeria-eventos/02-kafka.md#7-exactly-once-en-kafka-transacciones-read_committed-transactionalid-y-zombie-fencing-qué-cubre-y-qué-no) — <sub>Fiabilidad</sub>
8. [¿Cómo eliges el número de particiones de un topic y qué cuesta cambiarlo después?](mensajeria-eventos/02-kafka.md#8-cómo-eliges-el-número-de-particiones-de-un-topic-y-qué-cuesta-cambiarlo-después) — <sub>Diseño</sub>
9. [Retención vs compactación: `delete`, `compact`, tombstones y casos de uso de compacted topics](mensajeria-eventos/02-kafka.md#9-retención-vs-compactación-delete-compact-tombstones-y-casos-de-uso-de-compacted-topics) — <sub>Almacenamiento</sub>
10. [Consumer lag: qué es exactamente, cómo se mide y cómo se ataca](mensajeria-eventos/02-kafka.md#10-consumer-lag-qué-es-exactamente-cómo-se-mide-y-cómo-se-ataca) — <sub>Operación</sub>
11. [Kafka Streams: topología, state stores, RocksDB, changelogs, ventanas y EOS. ¿Cuándo Streams y cuándo un consumidor plano?](mensajeria-eventos/02-kafka.md#11-kafka-streams-topología-state-stores-rocksdb-changelogs-ventanas-y-eos-cuándo-streams-y-cuándo-un-consumidor-plano) — <sub>Procesamiento</sub>
12. [Schema Registry: formatos, modos de compatibilidad, subject naming strategies y cómo se despliega un cambio de esquema](mensajeria-eventos/02-kafka.md#12-schema-registry-formatos-modos-de-compatibilidad-subject-naming-strategies-y-cómo-se-despliega-un-cambio-de-esquema) — <sub>Ecosistema</sub>
13. [Réplicas y durabilidad: `replication.factor`, `min.insync.replicas`, unclean election y rack awareness — el triángulo durabilidad/disponibilidad/latencia](mensajeria-eventos/02-kafka.md#13-réplicas-y-durabilidad-replicationfactor-mininsyncreplicas-unclean-election-y-rack-awareness--el-triángulo-durabilidaddisponibilidadlatencia) — <sub>Fiabilidad</sub>
14. [Kafka Connect: workers, source/sink, converters, DLQ y casos típicos (CDC, data lake)](mensajeria-eventos/02-kafka.md#14-kafka-connect-workers-sourcesink-converters-dlq-y-casos-típicos-cdc-data-lake) — <sub>Ecosistema</sub>
15. [Tuning de rendimiento: ¿por qué Kafka es rápido y dónde está normalmente el cuello de botella?](mensajeria-eventos/02-kafka.md#15-tuning-de-rendimiento-por-qué-kafka-es-rápido-y-dónde-está-normalmente-el-cuello-de-botella) — <sub>Rendimiento</sub>
16. [Multi-cluster y disaster recovery: MirrorMaker 2, Cluster Linking, active-passive vs active-active, offset translation y RPO/RTO](mensajeria-eventos/02-kafka.md#16-multi-cluster-y-disaster-recovery-mirrormaker-2-cluster-linking-active-passive-vs-active-active-offset-translation-y-rporto) — <sub>Operación / DR</sub>
17. [\[CASO\] El lag del consumer group de facturación crece sin parar desde ayer, pero el throughput de entrada no ha cambiado. Diagnostica](mensajeria-eventos/02-kafka.md#17-caso-el-lag-del-consumer-group-de-facturación-crece-sin-parar-desde-ayer-pero-el-throughput-de-entrada-no-ha-cambiado-diagnostica) `[CASO]` — <sub>Operación / Troubleshooting</sub>
18. [\[CASO\] Tras un failover de broker aparecieron miles de duplicados en downstream. ¿Por qué y cómo lo evitas?](mensajeria-eventos/02-kafka.md#18-caso-tras-un-failover-de-broker-aparecieron-miles-de-duplicados-en-downstream-por-qué-y-cómo-lo-evitas) `[CASO]` — <sub>Fiabilidad / Troubleshooting</sub>

### RabbitMQ y Otros Brokers (SQS · SNS · NATS · Pulsar) — Preguntas de Entrevista Senior

[`03-rabbitmq-y-otros-brokers.md`](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md) · 14 preguntas

1. [Explica el modelo AMQP 0-9-1: exchanges, bindings, routing keys y colas. ¿Cómo modelarías un routing complejo?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#1-explica-el-modelo-amqp-0-9-1-exchanges-bindings-routing-keys-y-colas-cómo-modelarías-un-routing-complejo) — <sub>RabbitMQ / AMQP</sub>
2. [Acks de consumidor y publisher confirms en RabbitMQ: ¿qué garantiza cada mecanismo y qué pierdes sin cada uno?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#2-acks-de-consumidor-y-publisher-confirms-en-rabbitmq-qué-garantiza-cada-mecanismo-y-qué-pierdes-sin-cada-uno) — <sub>RabbitMQ / Fiabilidad</sub>
3. [Quorum queues vs classic mirrored queues: ¿por qué las mirrored están deprecadas y qué límites tienen las quorum?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#3-quorum-queues-vs-classic-mirrored-queues-por-qué-las-mirrored-están-deprecadas-y-qué-límites-tienen-las-quorum) — <sub>RabbitMQ / Alta disponibilidad</sub>
4. [`basic.qos` / prefetch: ¿qué controla exactamente y cómo lo dimensionas?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#4-basicqos--prefetch-qué-controla-exactamente-y-cómo-lo-dimensionas) — <sub>RabbitMQ / Rendimiento</sub>
5. [TTL, dead-letter exchanges y colas de retraso: patrón de retry con backoff y sus trampas](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#5-ttl-dead-letter-exchanges-y-colas-de-retraso-patrón-de-retry-con-backoff-y-sus-trampas) — <sub>RabbitMQ / Patrones</sub>
6. [Flow control en RabbitMQ: memory/disk alarms y credit flow. ¿Qué ve el productor cuando el broker se defiende?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#6-flow-control-en-rabbitmq-memorydisk-alarms-y-credit-flow-qué-ve-el-productor-cuando-el-broker-se-defiende) — <sub>RabbitMQ / Operación</sub>
7. [Clustering y particiones de red en RabbitMQ: `pause_minority`, ¿por qué no cruzar regiones, y qué papel juegan federation y shovel?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#7-clustering-y-particiones-de-red-en-rabbitmq-pause_minority-por-qué-no-cruzar-regiones-y-qué-papel-juegan-federation-y-shovel) — <sub>RabbitMQ / Distribución</sub>
8. [RabbitMQ Streams: ¿qué añaden frente a las colas clásicas y cuándo los elegirías frente a Kafka?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#8-rabbitmq-streams-qué-añaden-frente-a-las-colas-clásicas-y-cuándo-los-elegirías-frente-a-kafka) — <sub>RabbitMQ / Streams</sub>
9. [Kafka vs RabbitMQ: criterio de elección de un senior](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#9-kafka-vs-rabbitmq-criterio-de-elección-de-un-senior) — <sub>Arquitectura / Comparativa</sub>
10. [SQS y SNS: standard vs FIFO, visibility timeout, DLQs y el patrón fan-out. ¿Qué límites y costes hay que conocer?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#10-sqs-y-sns-standard-vs-fifo-visibility-timeout-dlqs-y-el-patrón-fan-out-qué-límites-y-costes-hay-que-conocer) — <sub>AWS / Mensajería gestionada</sub>
11. [NATS y JetStream: ¿qué garantiza cada capa y dónde encajan frente a Kafka y RabbitMQ?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#11-nats-y-jetstream-qué-garantiza-cada-capa-y-dónde-encajan-frente-a-kafka-y-rabbitmq) — <sub>NATS</sub>
12. [Apache Pulsar: separación compute/storage, multi-tenancy y tipos de subscription. ¿Cuándo tendría sentido frente a Kafka?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#12-apache-pulsar-separación-computestorage-multi-tenancy-y-tipos-de-subscription-cuándo-tendría-sentido-frente-a-kafka) — <sub>Pulsar</sub>
13. [Producción: la memoria del nodo RabbitMQ sube hasta disparar la memory alarm y los publishers se quedan colgados. Las colas crecen. Diagnostica y resuelve.](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#13-producción-la-memoria-del-nodo-rabbitmq-sube-hasta-disparar-la-memory-alarm-y-los-publishers-se-quedan-colgados-las-colas-crecen-diagnostica-y-resuelve) `[CASO]` — <sub>RabbitMQ / Operación</sub>
14. [Un patrón de retry con `requeue=true` y un mensaje envenenado tiene a 4 consumidores al 100% de CPU en bucle. ¿Qué pasó y cómo se arregla bien?](mensajeria-eventos/03-rabbitmq-y-otros-brokers.md#14-un-patrón-de-retry-con-requeuetrue-y-un-mensaje-envenenado-tiene-a-4-consumidores-al-100-de-cpu-en-bucle-qué-pasó-y-cómo-se-arregla-bien) `[CASO]` — <sub>RabbitMQ / Patrones de error</sub>

### Mensajería: Casos y Problemas de Producción — Preguntas de Entrevista Senior

[`04-casos-y-problemas.md`](mensajeria-eventos/04-casos-y-problemas.md) · 12 preguntas

1. [Rebalance storm: el consumer group entra en bucle de rebalanceos](mensajeria-eventos/04-casos-y-problemas.md#1-rebalance-storm-el-consumer-group-entra-en-bucle-de-rebalanceos) `[CASO]` — <sub>Kafka / Consumer groups</sub>
2. [Partición caliente: una de 24 concentra el 40% del tráfico](mensajeria-eventos/04-casos-y-problemas.md#2-partición-caliente-una-de-24-concentra-el-40-del-tráfico) `[CASO]` — <sub>Kafka / Particionado</sub>
3. [Duplicados masivos tras un incidente: cobros repetidos downstream](mensajeria-eventos/04-casos-y-problemas.md#3-duplicados-masivos-tras-un-incidente-cobros-repetidos-downstream) `[CASO]` — <sub>Kafka / Idempotencia y offsets</sub>
4. [Mensajes fuera de orden tras escalar de 1 a 8 consumidores](mensajeria-eventos/04-casos-y-problemas.md#4-mensajes-fuera-de-orden-tras-escalar-de-1-a-8-consumidores) `[CASO]` — <sub>Kafka / Ordering</sub>
5. [El outbox se atasca: eventos que llegan horas tarde](mensajeria-eventos/04-casos-y-problemas.md#5-el-outbox-se-atasca-eventos-que-llegan-horas-tarde) `[CASO]` — <sub>Outbox pattern / CDC</sub>
6. [DLQ desbordada un lunes: 200.000 mensajes y nadie sabe cuáles reprocesar](mensajeria-eventos/04-casos-y-problemas.md#6-dlq-desbordada-un-lunes-200000-mensajes-y-nadie-sabe-cuáles-reprocesar) `[CASO]` — <sub>Operación / Dead-letter queues</sub>
7. [Kafka "pierde" mensajes de auditoría: la conciliación mensual detecta huecos](mensajeria-eventos/04-casos-y-problemas.md#7-kafka-pierde-mensajes-de-auditoría-la-conciliación-mensual-detecta-huecos) `[CASO]` — <sub>Kafka / Durabilidad</sub>
8. [RabbitMQ: la cola que crece hasta tirar el nodo cada Black Friday](mensajeria-eventos/04-casos-y-problemas.md#8-rabbitmq-la-cola-que-crece-hasta-tirar-el-nodo-cada-black-friday) `[CASO]` — <sub>RabbitMQ / Capacidad y backpressure</sub>
9. [Schema roto en cascada: cinco consumidores muertos a la vez](mensajeria-eventos/04-casos-y-problemas.md#9-schema-roto-en-cascada-cinco-consumidores-muertos-a-la-vez) `[CASO]` — <sub>Contratos de eventos / Schema evolution</sub>
10. [Consumidor lento por dependencia: cada mensaje llama a una API con p99 de 3 s](mensajeria-eventos/04-casos-y-problemas.md#10-consumidor-lento-por-dependencia-cada-mensaje-llama-a-una-api-con-p99-de-3-s) `[CASO]` — <sub>Consumidores / Throughput y dependencias</sub>
11. [Saga colgada: pedidos 6 horas en RESERVANDO_STOCK](mensajeria-eventos/04-casos-y-problemas.md#11-saga-colgada-pedidos-6-horas-en-reservando_stock) `[CASO]` — <sub>Sagas / Workflows distribuidos</sub>
12. [Migración de RabbitMQ a Kafka en caliente, sin parar producción](mensajeria-eventos/04-casos-y-problemas.md#12-migración-de-rabbitmq-a-kafka-en-caliente-sin-parar-producción) `[CASO]` — <sub>Migraciones / Arquitectura de mensajería</sub>

---

## 🧠 Casos de Estudio Transversales

Carpeta: [`casos-de-estudio/`](casos-de-estudio/) · 50 preguntas

### Casos de estudio: System Design (nivel senior)

[`01-system-design.md`](casos-de-estudio/01-system-design.md) · 10 preguntas

1. [Sistema de pagos idempotente multi-proveedor](casos-de-estudio/01-system-design.md#1-sistema-de-pagos-idempotente-multi-proveedor) `[CASO]` — <sub>Pagos / Consistencia</sub>
2. [Rate limiter distribuido](casos-de-estudio/01-system-design.md#2-rate-limiter-distribuido) `[CASO]` — <sub>Infraestructura / Tráfico</sub>
3. [Sistema de notificaciones (push/email/SMS) a 50M usuarios](casos-de-estudio/01-system-design.md#3-sistema-de-notificaciones-pushemailsms-a-50m-usuarios) `[CASO]` — <sub>Mensajería / Fan-out</sub>
4. [Carrito de compras con inventario en tiempo real (overselling)](casos-de-estudio/01-system-design.md#4-carrito-de-compras-con-inventario-en-tiempo-real-overselling) `[CASO]` — <sub>E-commerce / Concurrencia</sub>
5. [Plataforma de pedidos tipo delivery con tracking en tiempo real](casos-de-estudio/01-system-design.md#5-plataforma-de-pedidos-tipo-delivery-con-tracking-en-tiempo-real) `[CASO]` — <sub>Marketplace / Tiempo real</sub>
6. [Autenticación y autorización para 100 microservicios](casos-de-estudio/01-system-design.md#6-autenticación-y-autorización-para-100-microservicios) `[CASO]` — <sub>Seguridad / Plataforma</sub>
7. [Feed de actividad](casos-de-estudio/01-system-design.md#7-feed-de-actividad) `[CASO]` — <sub>Social / Lectura intensiva</sub>
8. [Sistema de reservas con alta concurrencia (asientos/citas)](casos-de-estudio/01-system-design.md#8-sistema-de-reservas-con-alta-concurrencia-asientoscitas) `[CASO]` — <sub>Reservas / Concurrencia</sub>
9. [API pública con tiers de rate limiting y facturación por uso](casos-de-estudio/01-system-design.md#9-api-pública-con-tiers-de-rate-limiting-y-facturación-por-uso) `[CASO]` — <sub>Plataforma / Monetización</sub>
10. [Migración de un monolito de e-commerce a microservicios (strangler fig)](casos-de-estudio/01-system-design.md#10-migración-de-un-monolito-de-e-commerce-a-microservicios-strangler-fig) `[CASO]` — <sub>Arquitectura evolutiva / Migración</sub>

### Casos de estudio: Incidentes en producción (nivel senior)

[`02-incidentes-en-produccion.md`](casos-de-estudio/02-incidentes-en-produccion.md) · 10 preguntas

1. [El checkout cae cada día a las 12:00 exactas](casos-de-estudio/02-incidentes-en-produccion.md#1-el-checkout-cae-cada-día-a-las-1200-exactas) `[CASO]` — <sub>Diagnóstico sistemático</sub>
2. [La latencia p99 se degrada tras cada deploy, pero p50 está bien](casos-de-estudio/02-incidentes-en-produccion.md#2-la-latencia-p99-se-degrada-tras-cada-deploy-pero-p50-está-bien) `[CASO]` — <sub>Performance / Deploys</sub>
3. [Un retry storm tumbó la plataforma completa](casos-de-estudio/02-incidentes-en-produccion.md#3-un-retry-storm-tumbó-la-plataforma-completa) `[CASO]` — <sub>Resiliencia / Fallos en cascada</sub>
4. [Datos inconsistentes entre el servicio de pedidos y el de inventario (saga rota)](casos-de-estudio/02-incidentes-en-produccion.md#4-datos-inconsistentes-entre-el-servicio-de-pedidos-y-el-de-inventario-saga-rota) `[CASO]` — <sub>Consistencia distribuida</sub>
5. [La caché se cayó y la base de datos no aguantó](casos-de-estudio/02-incidentes-en-produccion.md#5-la-caché-se-cayó-y-la-base-de-datos-no-aguantó) `[CASO]` — <sub>Resiliencia / Caching</sub>
6. [El canary pasó todas las métricas pero rompió a un cliente enterprise](casos-de-estudio/02-incidentes-en-produccion.md#6-el-canary-pasó-todas-las-métricas-pero-rompió-a-un-cliente-enterprise) `[CASO]` — <sub>Deploys / Observabilidad segmentada</sub>
7. [Duplicación de cobros a clientes](casos-de-estudio/02-incidentes-en-produccion.md#7-duplicación-de-cobros-a-clientes) `[CASO]` — <sub>Pagos / Idempotencia</sub>
8. [Funciona en staging pero degrada en producción](casos-de-estudio/02-incidentes-en-produccion.md#8-funciona-en-staging-pero-degrada-en-producción) `[CASO]` — <sub>Entornos / Metodología</sub>
9. [Una dependencia externa (pasarela de pagos) está lenta y arrastra todo el sistema](casos-de-estudio/02-incidentes-en-produccion.md#9-una-dependencia-externa-pasarela-de-pagos-está-lenta-y-arrastra-todo-el-sistema) `[CASO]` — <sub>Resiliencia / Aislamiento de fallos</sub>
10. [Pérdida de mensajes entre dos servicios detectada por conciliación](casos-de-estudio/02-incidentes-en-produccion.md#10-pérdida-de-mensajes-entre-dos-servicios-detectada-por-conciliación) `[CASO]` — <sub>Mensajería / Auditoría de datos</sub>

### Casos de estudio: Análisis de Nuevos Requerimientos (nivel senior)

[`03-nuevos-requerimientos.md`](casos-de-estudio/03-nuevos-requerimientos.md) · 10 preguntas

1. ["Necesitamos que los usuarios puedan pagar en cuotas"](casos-de-estudio/03-nuevos-requerimientos.md#1-necesitamos-que-los-usuarios-puedan-pagar-en-cuotas) `[CASO]` — <sub>Descubrimiento / Pagos</sub>
2. ["Es solo añadir un campo al formulario"](casos-de-estudio/03-nuevos-requerimientos.md#2-es-solo-añadir-un-campo-al-formulario) `[CASO]` — <sub>Análisis de impacto / Contratos</sub>
3. [Feature nueva sobre un monolito legacy sin tests](casos-de-estudio/03-nuevos-requerimientos.md#3-feature-nueva-sobre-un-monolito-legacy-sin-tests) `[CASO]` — <sub>Legacy / Estrategia técnica</sub>
4. ["Para el viernes"](casos-de-estudio/03-nuevos-requerimientos.md#4-para-el-viernes) `[CASO]` — <sub>Negociación / Deuda técnica</sub>
5. [Integración con un tercero mal documentado](casos-de-estudio/03-nuevos-requerimientos.md#5-integración-con-un-tercero-mal-documentado) `[CASO]` — <sub>Integraciones / Riesgo</sub>
6. ["Quiero un dashboard en tiempo real"](casos-de-estudio/03-nuevos-requerimientos.md#6-quiero-un-dashboard-en-tiempo-real) `[CASO]` — <sub>Producto / Datos</sub>
7. [Romper un contrato público con clientes externos activos](casos-de-estudio/03-nuevos-requerimientos.md#7-romper-un-contrato-público-con-clientes-externos-activos) `[CASO]` — <sub>APIs públicas / Versionado</sub>
8. [Multi-tenancy sobrevenida](casos-de-estudio/03-nuevos-requerimientos.md#8-multi-tenancy-sobrevenida) `[CASO]` — <sub>Arquitectura / B2B</sub>
9. ["Hazlo configurable": el motor de reglas prematuro](casos-de-estudio/03-nuevos-requerimientos.md#9-hazlo-configurable-el-motor-de-reglas-prematuro) `[CASO]` — <sub>Diseño / Alcance</sub>
10. [Herencia de un requerimiento a medio hacer](casos-de-estudio/03-nuevos-requerimientos.md#10-herencia-de-un-requerimiento-a-medio-hacer) `[CASO]` — <sub>Continuidad / Arqueología</sub>

### Casos de estudio: Diagnóstico entre Entornos — QA, Staging y Producción (nivel senior)

[`04-diagnostico-multientorno.md`](casos-de-estudio/04-diagnostico-multientorno.md) · 10 preguntas

1. [El bug que solo se reproduce en QA (nunca en local ni en prod)](casos-de-estudio/04-diagnostico-multientorno.md#1-el-bug-que-solo-se-reproduce-en-qa-nunca-en-local-ni-en-prod) `[CASO]` — <sub>Entornos de QA</sub>
2. [Todo verde en staging, cae en producción a la primera hora pico](casos-de-estudio/04-diagnostico-multientorno.md#2-todo-verde-en-staging-cae-en-producción-a-la-primera-hora-pico) `[CASO]` — <sub>Staging vs realidad</sub>
3. [Config drift: el hotfix manual de hace 6 meses](casos-de-estudio/04-diagnostico-multientorno.md#3-config-drift-el-hotfix-manual-de-hace-6-meses) `[CASO]` — <sub>Configuration drift</sub>
4. ["Funciona en mi máquina": el contenedor pasa CI pero falla en el cluster](casos-de-estudio/04-diagnostico-multientorno.md#4-funciona-en-mi-máquina-el-contenedor-pasa-ci-pero-falla-en-el-cluster) `[CASO]` — <sub>Contenedores / Runtime</sub>
5. [Certificados y DNS: SSLHandshakeException solo en producción](casos-de-estudio/04-diagnostico-multientorno.md#5-certificados-y-dns-sslhandshakeexception-solo-en-producción) `[CASO]` — <sub>TLS / Redes</sub>
6. [La migración de BD que pasó en staging y revienta en producción](casos-de-estudio/04-diagnostico-multientorno.md#6-la-migración-de-bd-que-pasó-en-staging-y-revienta-en-producción) `[CASO]` — <sub>Migraciones de BD</sub>
7. [Feature flags divergentes: el bug imposible de reproducir](casos-de-estudio/04-diagnostico-multientorno.md#7-feature-flags-divergentes-el-bug-imposible-de-reproducir) `[CASO]` — <sub>Feature flags</sub>
8. [Dependencias distintas por entorno: el mismo commit produce artefactos diferentes](casos-de-estudio/04-diagnostico-multientorno.md#8-dependencias-distintas-por-entorno-el-mismo-commit-produce-artefactos-diferentes) `[CASO]` — <sub>Builds reproducibles</sub>
9. [Datos de prueba vs datos reales: el buscador perfecto que enloquece en prod](casos-de-estudio/04-diagnostico-multientorno.md#9-datos-de-prueba-vs-datos-reales-el-buscador-perfecto-que-enloquece-en-prod) `[CASO]` — <sub>Datos de prueba</sub>
10. [Diseña la estrategia de entornos desde cero para 15 microservicios](casos-de-estudio/04-diagnostico-multientorno.md#10-diseña-la-estrategia-de-entornos-desde-cero-para-15-microservicios) `[CASO]` — <sub>Diseño de entornos</sub>

### Casos de estudio: Versionado, Releases y Gestión del Cambio (nivel senior)

[`05-versionado-y-releases.md`](casos-de-estudio/05-versionado-y-releases.md) · 10 preguntas

1. [Diseña la estrategia de branching para 10 equipos sobre 40 microservicios](casos-de-estudio/05-versionado-y-releases.md#1-diseña-la-estrategia-de-branching-para-10-equipos-sobre-40-microservicios) `[CASO]` — <sub>Branching / Delivery</sub>
2. [Hotfix urgente con main 30 commits por delante](casos-de-estudio/05-versionado-y-releases.md#2-hotfix-urgente-con-main-30-commits-por-delante) `[CASO]` — <sub>Hotfix / Incident response</sub>
3. [El rollback que no se puede hacer: la migración de BD ya corrió](casos-de-estudio/05-versionado-y-releases.md#3-el-rollback-que-no-se-puede-hacer-la-migración-de-bd-ya-corrió) `[CASO]` — <sub>Migraciones / Rollback</sub>
4. [Release train vs continuous deployment para una plataforma B2B](casos-de-estudio/05-versionado-y-releases.md#4-release-train-vs-continuous-deployment-para-una-plataforma-b2b) `[CASO]` — <sub>Release management / Cadencia</sub>
5. [Versionar microservicios: ¿semver de servicios sirve de algo?](casos-de-estudio/05-versionado-y-releases.md#5-versionar-microservicios-semver-de-servicios-sirve-de-algo) `[CASO]` — <sub>Versionado / Contratos</sub>
6. [Monorepo vs multirepo para 40 servicios y 10 equipos](casos-de-estudio/05-versionado-y-releases.md#6-monorepo-vs-multirepo-para-40-servicios-y-10-equipos) `[CASO]` — <sub>Repositorios / Tooling</sub>
7. [La librería compartida infernal: `commons` usada por 30 servicios](casos-de-estudio/05-versionado-y-releases.md#7-la-librería-compartida-infernal-commons-usada-por-30-servicios) `[CASO]` — <sub>Librerías internas / Dependencias</sub>
8. [Dos features de dos equipos deben salir juntas](casos-de-estudio/05-versionado-y-releases.md#8-dos-features-de-dos-equipos-deben-salir-juntas) `[CASO]` — <sub>Coordinación / Acoplamiento de release</sub>
9. [Deprecar la v1 de una API pública con 200 integraciones activas](casos-de-estudio/05-versionado-y-releases.md#9-deprecar-la-v1-de-una-api-pública-con-200-integraciones-activas) `[CASO]` — <sub>API pública / Deprecation</sub>
10. [Auditoría: "¿qué versión exacta de qué corría en producción el 3 de marzo?"](casos-de-estudio/05-versionado-y-releases.md#10-auditoría-qué-versión-exacta-de-qué-corría-en-producción-el-3-de-marzo) `[CASO]` — <sub>Trazabilidad / Compliance</sub>

---

[⬆ Volver al inicio](README.md)
