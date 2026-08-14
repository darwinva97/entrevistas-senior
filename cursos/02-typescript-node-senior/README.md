# Curso 02 · TypeScript / Node senior en microservicios

> Duración: ~10 horas. Prerrequisito: [curso 00](../00-fundamentos-distribuidos/) y experiencia escribiendo servicios en Node.

Prepara las **48 preguntas** de [`typescript-microservicios/`](../../typescript-microservicios/). Dos ejes que el entrevistador va a atacar sin piedad:

1. **El sistema de tipos como herramienta de diseño** — no "sé poner `interface`", sino modelar de forma que los estados imposibles no compilen.
2. **Un solo hilo con un event loop** — todo lo bueno y todo lo malo de Node sale de ahí: bloqueo, backpressure, graceful shutdown, memoria.

## Módulos

| # | Módulo | Qué te enseña | Duración |
|:-:|---|---|:-:|
| 1 | [El sistema de tipos como herramienta](01-sistema-de-tipos.md) | Conditional/mapped/template types, narrowing, branded types, `satisfies`, varianza, validación en la frontera | 180 min |
| 2 | [Event loop, memoria y rendimiento](02-event-loop-y-rendimiento.md) | Fases, microtasks, bloqueo, streams y backpressure, GC de V8, diagnóstico | 180 min |
| 3 | [Arquitectura de servicios en Node/NestJS](03-arquitectura-de-servicios.md) | DI y scopes, orden de guards/pipes/interceptors, errores async, graceful shutdown, config | 150 min |
| 4 | [Laboratorio de diagnóstico Node](04-laboratorio-diagnostico-node.md) | Reproducir y resolver los 16 casos del banco | 180 min |

## Al terminar deberías poder…

- Explicar por qué `Exclude<T, U>` funciona, y desactivar la distributividad cuando estorba.
- Diseñar una API donde un estado inválido sea un error de compilación.
- Explicar qué ocurre entre dos ticks del event loop y por qué `await` no libera la CPU.
- Procesar un fichero de 10 GB en un servicio con 512 MB de memoria.
- Implementar un apagado ordenado que no pierda ni una petición durante un rollout.
- Diagnosticar CPU al 100%, un leak y un pool agotado con las herramientas del propio Node.

## Herramientas

```bash
fnm install 22 && fnm use 22             # o nvm; conoce las diferencias entre LTS
node --cpu-prof --cpu-prof-dir=./prof app.js    # perfil de CPU nativo
node --heapsnapshot-signal=SIGUSR2 app.js       # snapshot bajo demanda
npx clinic doctor -- node app.js                # diagnóstico guiado (clinic.js)
npx autocannon -c 50 -d 30 http://localhost:3000/   # carga
# Chrome DevTools → chrome://inspect para .cpuprofile y .heapsnapshot
```
