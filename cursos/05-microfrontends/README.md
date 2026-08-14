# Curso 05 · Microfrontends

> Duración: ~8 horas. Prerrequisito: experiencia con SPAs y bundlers modernos.

Prepara las **30 preguntas** de [`microfrontends/`](../../microfrontends/). Una advertencia que el propio curso repite: **la pregunta más importante sobre microfrontends es si deberías tenerlos**. Un candidato que los defiende sin condiciones suspende; uno que explica cuándo son la solución correcta a un problema *organizativo* aprueba.

## Módulos

| # | Módulo | Qué te enseña | Duración |
|:-:|---|---|:-:|
| 1 | [Por qué, cuándo y cuándo no](01-por-que-y-cuando.md) | El problema real (organización), patrones de composición, ley de Conway, alternativas | 90 min |
| 2 | [Module Federation a fondo](02-module-federation.md) | Cómo funciona, `shared`/`singleton`, remotes dinámicos, MF 2.0, single-spa e import maps | 150 min |
| 3 | [Integración: routing, estado, estilos, sesión](03-integracion-runtime.md) | Contratos entre equipos, comunicación, aislamiento de CSS, auth compartida | 150 min |
| 4 | [Operación: deploy, performance y observabilidad](04-operacion-y-performance.md) | Versionado de remotes, releases independientes, waterfalls, errores por equipo | 120 min |

## Al terminar deberías poder…

- Argumentar en contra de los microfrontends con más solvencia que quien los propone, y aun así implementarlos bien cuando corresponde.
- Explicar qué hace exactamente el runtime de Module Federation al cargar un remote.
- Diseñar el contrato entre shell y remote de forma que un equipo pueda desplegar sin coordinar.
- Diagnosticar dos Reacts en la página, estilos pisados, fugas al desmontar y waterfalls de carga.

## Laboratorio transversal del curso

Construye un **shell + 2 remotes** (uno React, otro con otro framework si te atreves) con:
deploy independiente, manifest de versiones, sesión compartida, error boundary por remote y trazas con `team` como atributo. Es un proyecto de un fin de semana y responde, él solo, a la mitad del banco.
