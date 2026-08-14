# Entrevistas Senior — Golang y Microservicios

Banco de preguntas y casos de producción para entrevistas técnicas de nivel **senior** en Go con arquitectura de microservicios. Cada pregunta incluye una **respuesta resumen** (lo que dirías en 30–60 segundos) y una **respuesta detallada** (código realista, trade-offs, errores comunes y qué espera oír el entrevistador).


> 🎓 **¿Te faltan bases para responder esto?** El curso [Go senior](../cursos/03-go-senior/) enseña exactamente lo necesario, con laboratorios y autoevaluación.
> Ver también: [índice completo](../INDICE.md) · [plan de estudio](../PLAN-DE-ESTUDIO.md) · [glosario](../GLOSARIO.md) · [inicio](../README.md)

## Archivos

| Archivo | Contenido | Preguntas |
|---|---|---|
| [01-go-core-avanzado.md](./01-go-core-avanzado.md) | Runtime, concurrencia, memoria y lenguaje en profundidad | 21 |
| [02-microservicios-en-go.md](./02-microservicios-en-go.md) | HTTP, gRPC, mensajería, patrones distribuidos, testing y operación | 18 |
| [03-casos-y-problemas.md](./03-casos-y-problemas.md) | Casos de producción: diagnóstico paso a paso con pprof, trace y race detector | 16 |

**Total: 55 preguntas** (16 de ellas de tipo [CASO] en el archivo 3, más 2 [CASO] adicionales en el archivo 1).

---

## Índice de preguntas

### 01 — Go Core Avanzado

1. Explica el modelo GMP del scheduler de Go
2. ¿Por qué las goroutines son más baratas que los threads del OS?
3. Channels buffered vs unbuffered: semántica y cuándo usar cada uno
4. `select`: semántica, patrones y trampas
5. Patrones de concurrencia: pipeline, fan-out y fan-in
6. El paquete `sync`: Mutex, RWMutex, WaitGroup, Once — usos y trampas
7. `errgroup`: qué aporta sobre WaitGroup y cómo usarlo bien
8. `sync/atomic` vs Mutex: cuándo y por qué
9. `context.Context`: cancelación, deadlines y valores — reglas de uso
10. Escape analysis, stack vs heap, y cómo reducir allocaciones
11. El GC de Go: cómo funciona, GOGC y GOMEMLIMIT
12. Slices internals: capacidad, aliasing, append y sus gotchas
13. Maps internals: buckets, iteración aleatoria y concurrencia
14. Interfaces internals: iface/eface y el gotcha del "typed nil"
15. Generics en Go: type parameters, constraints y cuándo usarlos
16. Error handling idiomático: wrapping, errors.Is/As, sentinel vs typed errors
17. `defer`: semántica precisa y sus gotchas
18. `for range`, closures y goroutines: el bug clásico de captura de variables
19. Stack growth, `sync.Pool` y presión de GC en hot paths
20. [CASO] `-race` en CI reporta una data race en un map de caché
21. [CASO] Procesar 10M de registros contra una API externa con límite de 100 concurrentes

### 02 — Microservicios en Go

1. Diseño de un servidor HTTP de producción con `net/http`: timeouts y configuración
2. Middleware en Go: patrón, orden y ejemplos reales
3. gRPC en Go: unary vs streaming, deadlines y manejo de errores
4. Interceptors de gRPC: para qué y cómo implementarlos
5. Graceful shutdown completo de un microservicio en Go
6. Worker pools y control de concurrencia en servicios
7. Rate limiting en Go: algoritmos e implementación
8. Circuit breakers: por qué, cómo funcionan y su implementación en Go
9. Kafka en Go: consumer groups, rebalancing y elección de librería
10. Patrón Outbox e idempotencia: publicar eventos sin perder ni duplicar
11. Patrón Saga: transacciones distribuidas sin 2PC
12. Estructura de proyecto en Go: `internal/`, hexagonal y organización de paquetes
13. Inyección de dependencias en Go: manual, wire, fx — criterio
14. Observabilidad en Go: OpenTelemetry, métricas y pprof en producción
15. Testing en microservicios Go: table-driven, testcontainers, mocks y race detector
16. Timeouts, retries y hedging entre servicios: presupuesto de latencia end-to-end
17. Versionado y evolución de APIs y eventos en microservicios Go
18. Configuración y secretos en microservicios Go

### 03 — Casos y Problemas de Producción (todos [CASO])

1. Goroutine leak en producción: goroutines y memoria crecen sin parar
2. La memoria RSS crece y el pod es OOM-killed, pero el heap de pprof se ve pequeño
3. Deadlock: el servicio se congela por completo bajo carga
4. El race detector señala una race que "nunca ha dado problemas"
5. p99 degradado con p50 normal: ¿GC o contención?
6. El servidor HTTP agota file descriptors: "too many open files"
7. Contexto cancelado que no se propaga: trabajo huérfano y efectos fantasma
8. Datos corruptos intermitentes por aliasing de slices
9. Un panic en una goroutine tumba todo el proceso
10. Consumer de Kafka con lag creciente
11. Timeouts en cascada entre servicios gRPC: incidente pequeño → outage general
12. Connection pool de `database/sql` agotado
13. Procesar un archivo de 20GB tumba el servicio: diseño de streaming
14. Migración de un servicio Java/Node a Go: qué evaluar y cómo ejecutarla
15. El servicio consume 100% CPU con tráfico normal
16. Tras un deploy, errores 502/connection reset intermitentes solo durante los rollouts

---

## Cómo usar este material

- **Preparación rápida:** lee solo las *respuestas resumen* de los tres archivos (≈1 hora) para refrescar antes de una entrevista.
- **Preparación profunda:** trabaja las *respuestas detalladas* escribiendo el código de memoria y explicándolo en voz alta.
- **Simulacro de casos:** para el archivo 03, lee solo el título del caso, resuelve el diagnóstico por tu cuenta (herramientas, hipótesis, pasos) y compara con la respuesta.

## Herramientas que aparecen recurrentemente

`pprof` (CPU, heap, goroutine, mutex, block) · `go tool trace` · race detector (`-race`) · `GODEBUG` (gctrace, schedtrace) · `runtime/metrics` · `errgroup` · `x/time/rate` · `testcontainers-go` · OpenTelemetry · `GOMEMLIMIT`/`GOGC`
