# 🎯 Entrevistas Técnicas Nivel Senior — Microservicios, Cloud y Frontend

Repositorio de preguntas y respuestas para preparación de entrevistas técnicas **nivel senior**, con énfasis en **análisis de problemas y casos reales**.

Cada pregunta incluye:

- **📝 Respuesta resumen** — lo que dirías en 30–60 segundos en la entrevista.
- **📖 Respuesta detallada** — explicación profunda con código, trade-offs, diagramas y errores comunes.

## 📚 Contenido — 389 preguntas en total

| Área | Carpeta | Preguntas | Descripción |
|------|---------|:---------:|-------------|
| ☕ Java Senior + Microservicios | [`java-microservicios/`](java-microservicios/) | 46 | JVM, concurrencia, Spring Boot/Cloud, resiliencia, casos de producción |
| 🟦 TypeScript Senior + Microservicios | [`typescript-microservicios/`](typescript-microservicios/) | 48 | Node.js, NestJS, tipado avanzado, event loop, casos de producción |
| 🐹 Golang Senior + Microservicios | [`golang-microservicios/`](golang-microservicios/) | 55 | Goroutines, channels, gRPC, memoria, casos de producción |
| ☁️ AWS | [`cloud/aws/`](cloud/aws/) | 47 | Arquitectura, serverless, contenedores, redes, casos y troubleshooting |
| ☁️ Azure | [`cloud/azure/`](cloud/azure/) | 30 | AKS, Functions, Service Bus, identidad, casos |
| ☁️ GCP | [`cloud/gcp/`](cloud/gcp/) | 31 | GKE, Cloud Run, Pub/Sub, BigQuery, casos |
| 🧩 Microfrontends | [`microfrontends/`](microfrontends/) | 30 | Module Federation, single-spa, integración, casos |
| 🔐 Seguridad y Vulnerabilidades | [`seguridad-vulnerabilidades/`](seguridad-vulnerabilidades/) | 42 | OWASP, qué hacer ante cada vulnerabilidad, respuesta a incidentes |
| 🔄 Versionamiento de APIs | [`versionamiento-apis/`](versionamiento-apis/) | 40 | Versionado REST/gRPC/eventos, compatibilidad, migraciones, SemVer |
| 🧠 Casos de Estudio Transversales | [`casos-de-estudio/`](casos-de-estudio/) | 20 | Diseño de sistemas y análisis de incidentes end-to-end |

Más de un tercio de las preguntas son de tipo **[CASO]** (análisis de problemas, troubleshooting en producción y system design).

## 🧭 Cómo usar este repositorio

1. **Primera pasada:** lee solo las *respuestas resumen* de cada área para mapear tus huecos.
2. **Segunda pasada:** estudia las *respuestas detalladas* de tus áreas débiles.
3. **Simulacro:** tapa las respuestas e intenta responder en voz alta; en las preguntas de caso, dibuja la arquitectura antes de leer la solución.
4. Las preguntas marcadas como **[CASO]** son de análisis de problemas: en la entrevista importa más tu *proceso de razonamiento* (aclarar requisitos → hipótesis → medir → decidir trade-offs) que la respuesta exacta.

## 📐 Formato de cada pregunta

```markdown
## N. [Título de la pregunta]
**Categoría:** ... · **Tipo:** Conceptual | [CASO] Análisis de problema

### 📝 Respuesta resumen
3–6 líneas: lo esencial.

### 📖 Respuesta detallada
Explicación profunda, código, trade-offs, errores comunes, qué espera oír el entrevistador.
```
