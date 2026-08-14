# Curso 06 · Seguridad aplicada para desarrolladores senior

> Duración: ~9 horas. Prerrequisito: [curso 00](../00-fundamentos-distribuidos/).

Prepara las **42 preguntas** de [`seguridad-vulnerabilidades/`](../../seguridad-vulnerabilidades/). El objetivo no es convertirte en pentester: es que puedas **diseñar sistemas que no se rompan por lo obvio** y responder con criterio cuando aparece un incidente.

La diferencia entre un candidato y otro casi siempre es la misma: uno recita el OWASP Top 10, el otro explica **qué controla cada capa** y qué haría a las 3 a.m. con un token filtrado.

## Módulos

| # | Módulo | Qué te enseña | Duración |
|:-:|---|---|:-:|
| 1 | [Modelo de amenazas y OWASP en la práctica](01-modelo-de-amenazas-y-owasp.md) | Pensar como atacante, las vulnerabilidades que sí verás y cómo se corrigen de raíz | 150 min |
| 2 | [Autenticación y autorización](02-authn-authz.md) | OAuth2/OIDC, JWT y sus errores, sesiones, autorización a múltiples niveles | 180 min |
| 3 | [Seguridad en microservicios y cadena de suministro](03-microservicios-y-supply-chain.md) | mTLS, secretos, red, dependencias, imágenes, CI/CD | 150 min |
| 4 | [Respuesta a incidentes](04-respuesta-a-incidentes.md) | Qué haces en la primera hora: contener, rotar, evaluar, comunicar | 120 min |

## Al terminar deberías poder…

- Hacer un modelo de amenazas de una funcionalidad en 15 minutos y proponer controles proporcionados.
- Explicar por qué "sanitizar la entrada" es una respuesta incompleta a SQLi y XSS.
- Diseñar autenticación entre 100 microservicios y explicar el problema de la revocación de JWT.
- Responder a "se filtró una API key en un commit" con un plan ordenado.
- Argumentar la seguridad ante negocio en términos de riesgo, no de miedo.

## Nota ética

Todo el contenido está orientado a **defensa**: entender el ataque lo justo para prevenirlo. Los laboratorios se hacen sobre entornos propios y deliberadamente vulnerables (Juice Shop, WebGoat, DVWA), nunca sobre sistemas de terceros.
