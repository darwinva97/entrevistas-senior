# Curso 03 · Go senior en microservicios

> Duración: ~10 horas. Prerrequisito: [curso 00](../00-fundamentos-distribuidos/) y saber escribir Go idiomático.

Prepara las **55 preguntas** de [`golang-microservicios/`](../../golang-microservicios/), el área más grande del repositorio. En Go, las entrevistas senior giran casi siempre en torno a tres ejes:

1. **Concurrencia**: goroutines, channels, `context` — y sus fugas.
2. **Runtime**: scheduler, escape analysis, GC, memoria.
3. **Servicios de producción**: timeouts, apagado ordenado, gRPC, observabilidad con `pprof`.

## Módulos

| # | Módulo | Qué te enseña | Duración |
|:-:|---|---|:-:|
| 1 | [Concurrencia: scheduler, channels y context](01-concurrencia-y-context.md) | GMP, channels, `select`, patrones, `sync`, `errgroup`, cancelación | 180 min |
| 2 | [Runtime: memoria, escape analysis y GC](02-runtime-memoria-y-gc.md) | Stack vs heap, GOGC/GOMEMLIMIT, slices/maps/interfaces por dentro | 150 min |
| 3 | [Servicios de producción en Go](03-servicios-de-produccion.md) | `net/http` con timeouts, middleware, gRPC, shutdown, resiliencia, estructura | 150 min |
| 4 | [Laboratorio: pprof y los casos del banco](04-laboratorio-pprof.md) | Goroutine leak, RSS vs heap, deadlock, races, fds, CPU al 100% | 180 min |

## Al terminar deberías poder…

- Explicar qué hace el scheduler cuando una goroutine bloquea en una syscall.
- Encontrar una fuga de goroutines en producción en menos de cinco minutos.
- Explicar por qué el RSS de tu pod crece aunque `pprof` muestre poco heap.
- Escribir un servidor HTTP con los cinco timeouts correctos y apagado ordenado.
- Explicar el "typed nil" y por qué `err != nil` puede ser verdadero con un error nulo dentro.

## Herramientas

```bash
go version                                   # 1.22+ para el nuevo for-range
go test -race ./...                          # el detector de carreras: en CI, siempre
go build -gcflags='-m -m' ./...              # decisiones de escape analysis
go tool pprof http://host:6060/debug/pprof/heap
go tool pprof -http=:8080 profile.pb.gz      # UI web con flamegraph
GODEBUG=gctrace=1 ./app                      # traza de GC por ciclo
go tool trace trace.out                      # trazado del scheduler
```
