# Entrevistas Senior — TypeScript / Node.js / Microservicios

Guía de preparación para entrevistas técnicas de nivel Senior. Cada pregunta incluye una **respuesta resumen** (lo que dirías en 30–60 segundos) y una **respuesta detallada** con código TypeScript realista, trade-offs, errores comunes y qué espera oír el entrevistador. Los [CASO] son análisis de problemas de producción con escenario, diagnóstico paso a paso, herramientas, solución y prevención.


> 🎓 **¿Te faltan bases para responder esto?** El curso [TypeScript / Node senior](../cursos/02-typescript-node-senior/) enseña exactamente lo necesario, con laboratorios y autoevaluación.
> Ver también: [índice completo](../INDICE.md) · [plan de estudio](../PLAN-DE-ESTUDIO.md) · [glosario](../GLOSARIO.md) · [inicio](../README.md)

## Índice

| Archivo | Contenido | Preguntas |
|---|---|---|
| [01-typescript-avanzado.md](./01-typescript-avanzado.md) | Sistema de tipos avanzado, tsconfig, monorepos, validación runtime | 16 |
| [02-node-y-microservicios.md](./02-node-y-microservicios.md) | Event loop, NestJS, mensajería, patrones de resiliencia, observabilidad | 16 |
| [03-casos-y-problemas.md](./03-casos-y-problemas.md) | Casos reales de producción (todos [CASO]) | 16 |

**Total: 48 preguntas.**

---

## [01 — TypeScript Avanzado](./01-typescript-avanzado.md)

1. ¿Qué son los conditional types y cómo funciona `infer`?
2. Distributividad de conditional types: ¿por qué `Exclude` funciona y cuándo hay que desactivarla?
3. Mapped types: key remapping con `as` y modificadores `+/-`
4. Template literal types: rutas y eventos tipados
5. Varianza: covarianza, contravarianza, `strictFunctionTypes` y bivarianza de métodos
6. Type narrowing: type guards con `is`, discriminated unions, `asserts` y exhaustividad con `never`
7. Branded types: tipado nominal sobre un sistema estructural
8. `satisfies` vs anotación de tipo vs `as`: ¿cuándo usar cada uno?
9. Generics avanzados: constraints, defaults, inferencia parcial y sobre-genericidad
10. Structural typing: excess property checks y compatibilidad accidental
11. `unknown` vs `any` vs `never`: fronteras de API y manejo de errores
12. Declaration merging y module augmentation: extender Express Request y tipos globales
13. tsconfig estricto para servicios Node modernos: qué flags activar y por qué
14. Monorepos TypeScript: project references, builds incrementales y Turborepo/Nx
15. Decoradores: legacy (`experimentalDecorators`) vs estándar TC39 — y por qué NestJS sigue en legacy
16. Validación runtime con Zod: los tipos se borran, las fronteras no se defienden solas

## [02 — Node.js y Microservicios](./02-node-y-microservicios.md)

1. Explica las fases del event loop de Node.js y qué se ejecuta en cada una
2. [CASO] Un servicio deja de responder a health checks aunque el proceso sigue vivo: starvation de microtasks
3. Worker threads vs cluster vs child_process: ¿cuándo usarías cada uno?
4. Streams y backpressure: ¿cómo procesarías un archivo de 10 GB de pedidos sin tumbar el servicio?
5. Inyección de dependencias en NestJS: providers, scopes y su coste
6. Guards, interceptors, pipes y exception filters en NestJS: orden de ejecución y casos de uso
7. REST vs gRPC entre microservicios con TypeScript: ¿cuándo eliges cada uno?
8. Kafka vs RabbitMQ vs BullMQ: ¿cómo eliges la tecnología de mensajería?
9. Patrón Saga: coreografía vs orquestación en un flujo de pedidos y pagos
10. Patrón Outbox e idempotencia: ¿cómo consigues "exactly-once efectivo" entre base de datos y broker?
11. [CASO] Al desplegar en Kubernetes se pierden peticiones y quedan jobs a medias: diseña el graceful shutdown
12. Manejo de errores async en Node: unhandled rejections, captureRejections y por qué no "tragar" errores
13. Observabilidad con OpenTelemetry en Node: trazas distribuidas, propagación de contexto y correlación
14. Estrategia de testing en microservicios: unit, integración con Testcontainers y contract testing
15. [CASO] La latencia p99 de tu API se dispara con ciertos payloads: ¿cómo detectas y evitas el bloqueo del event loop?
16. Manejo de JSON grande en Node: streaming parsers, NDJSON y alternativas binarias

## [03 — Casos y Problemas Reales](./03-casos-y-problemas.md) (todos [CASO])

1. Memory leak: el heap crece hasta OOM
2. Event loop bloqueado: p99 disparado por código CPU-bound
3. OOM procesando archivos grandes: readFile vs streams
4. Unhandled promise rejection tumbando pods en cascada
5. Fuga de conexiones a Postgres: pool agotado
6. Cola con lag creciente: consumidores que no dan abasto
7. Race condition: doble descuento de stock en operaciones concurrentes
8. Hot reload de configuración sin reiniciar el servicio
9. Migración JS→TS incremental en un servicio grande
10. Timeout en cascada entre servicios: A→B→C
11. DNS y keep-alive con axios/undici en alta concurrencia
12. Degradación por GC: pausas largas y sawtooth agresivo
13. Pérdida de eventos: mensajes que "desaparecen"
14. Duplicación de jobs/mensajes: el mismo evento procesado dos veces
15. Hot path degradado: CPU throttling en Kubernetes distorsionando latencias
16. Graceful shutdown roto: 502s en cada deploy

---

Herramientas de diagnóstico recurrentes en los casos: clinic.js (doctor/flame/heapprofiler), heap snapshots en Chrome DevTools (`node --inspect`), flamegraphs (0x), `perf_hooks.monitorEventLoopDelay`, `process.memoryUsage()`, `--trace-gc`, y métricas/trazas con OpenTelemetry y Prometheus.
