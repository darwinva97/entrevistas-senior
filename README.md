# 🎯 Entrevistas Técnicas Nivel Senior — Microservicios, Cloud y Frontend

Preparación completa para entrevistas técnicas **senior**: un banco de **389 preguntas con respuestas** y **10 cursos** que enseñan lo necesario para responderlas.

| | |
|---|---|
| 📚 **[Banco de preguntas](INDICE.md)** | 389 preguntas, 160 de ellas de análisis de casos reales |
| 🎓 **[Cursos](cursos/)** | 10 cursos · 44 módulos con teoría, laboratorios y autoevaluación |
| 🗺️ **[Plan de estudio](PLAN-DE-ESTUDIO.md)** | Rutas de 10 días y de 8 semanas, y por perfil de vacante |
| 📖 **[Glosario](GLOSARIO.md)** | Los términos que debes poder definir en 20 segundos |
| ✅ **[Seguimiento](PROGRESO.md)** | Checklist para marcar lo que ya dominas |

---

## 📚 Banco de preguntas — 389 en total

Cada pregunta incluye:

- **📝 Respuesta resumen** — lo que dirías en 30–60 segundos en la entrevista.
- **📖 Respuesta detallada** — explicación profunda con código, trade-offs, diagramas y errores comunes.

| Área | Carpeta | Preguntas | Curso que la prepara |
|------|---------|:---------:|---|
| ☕ Java Senior + Microservicios | [`java-microservicios/`](java-microservicios/) | 46 | [01 · Java senior](cursos/01-java-senior/) |
| 🟦 TypeScript Senior + Microservicios | [`typescript-microservicios/`](typescript-microservicios/) | 48 | [02 · TypeScript/Node](cursos/02-typescript-node-senior/) |
| 🐹 Golang Senior + Microservicios | [`golang-microservicios/`](golang-microservicios/) | 55 | [03 · Go senior](cursos/03-go-senior/) |
| ☁️ AWS | [`cloud/aws/`](cloud/aws/) | 47 | [04 · Cloud y Kubernetes](cursos/04-cloud-y-kubernetes/) |
| ☁️ Azure | [`cloud/azure/`](cloud/azure/) | 30 | [04 · Cloud y Kubernetes](cursos/04-cloud-y-kubernetes/) |
| ☁️ GCP | [`cloud/gcp/`](cloud/gcp/) | 31 | [04 · Cloud y Kubernetes](cursos/04-cloud-y-kubernetes/) |
| 🧩 Microfrontends | [`microfrontends/`](microfrontends/) | 30 | [05 · Microfrontends](cursos/05-microfrontends/) |
| 🔐 Seguridad y Vulnerabilidades | [`seguridad-vulnerabilidades/`](seguridad-vulnerabilidades/) | 42 | [06 · Seguridad](cursos/06-seguridad/) |
| 🔄 Versionamiento de APIs | [`versionamiento-apis/`](versionamiento-apis/) | 40 | [07 · APIs y versionado](cursos/07-apis-y-versionado/) |
| 🧠 Casos de Estudio Transversales | [`casos-de-estudio/`](casos-de-estudio/) | 20 | [08 · System design](cursos/08-system-design/) |

**160 preguntas (41%) son de tipo [CASO]:** análisis de problemas, troubleshooting en producción y system design. El [índice completo](INDICE.md) las lista todas con enlace directo.

---

## 🎓 Cursos — de cero al nivel que exigen estas preguntas

El banco te dice **qué** te van a preguntar; los cursos te enseñan **por qué** la respuesta es esa, para que aguantes las repreguntas. Cada módulo termina con un **laboratorio** (algo que ejecutas), una **autoevaluación** y el enlace a las preguntas que desbloquea.

| # | Curso | Módulos | Para qué |
|:-:|---|:-:|---|
| 00 | [Fundamentos de sistemas distribuidos](cursos/00-fundamentos-distribuidos/) | 6 | **Prerrequisito real de todo lo demás** |
| 01 | [Java senior + Spring](cursos/01-java-senior/) | 5 | JVM, concurrencia, Spring, Kafka, diagnóstico |
| 02 | [TypeScript / Node senior](cursos/02-typescript-node-senior/) | 4 | Tipos avanzados, event loop, arquitectura, diagnóstico |
| 03 | [Go senior](cursos/03-go-senior/) | 4 | Concurrencia, runtime, servicios de producción, pprof |
| 04 | [Cloud y Kubernetes](cursos/04-cloud-y-kubernetes/) | 5 | AWS/Azure/GCP, K8s, identidad, red, costos |
| 05 | [Microfrontends](cursos/05-microfrontends/) | 4 | Module Federation, integración, operación |
| 06 | [Seguridad aplicada](cursos/06-seguridad/) | 4 | Amenazas, OWASP, authN/authZ, incidentes |
| 07 | [Diseño y versionado de APIs](cursos/07-apis-y-versionado/) | 4 | Contratos, breaking changes, migraciones sin downtime |
| 08 | [System design e incidentes](cursos/08-system-design/) | 5 | Framework de 45 min, estimaciones, patrones |
| 09 | [Técnica de entrevista](cursos/09-tecnica-de-entrevista/) | 3 | Comunicar, simulacros, comportamiento y oferta |

> **Si solo lees un curso, que sea el [00](cursos/00-fundamentos-distribuidos/).** La mayoría de las preguntas de Java, Go o AWS son preguntas de sistemas distribuidos disfrazadas de preguntas de tecnología.

---

## 🧭 Cómo usar este repositorio

1. **Diagnóstico (1 hora).** Recorre las *respuestas resumen* de tu área y marca en [`PROGRESO.md`](PROGRESO.md) lo que ya responderías sin dudar. Lo que quede en blanco es tu plan de estudio.
2. **Estudio.** Haz el curso correspondiente, con sus laboratorios. Sin ejecutar nada no se fija nada.
3. **Cierre del ciclo.** Vuelve al banco y responde **en voz alta y cronometrado**: 30–60 segundos por pregunta. Si tardas más, sobra la mitad.
4. **Casos.** En las preguntas **[CASO]**, dibuja antes de leer. Importa más tu proceso (aclarar → medir → hipótesis → contener → prevenir) que la respuesta exacta.
5. **Simulacro.** Cierra con los [simulacros cronometrados](cursos/09-tecnica-de-entrevista/02-simulacros.md) y su rúbrica.

¿Poco tiempo? El [plan de estudio](PLAN-DE-ESTUDIO.md) tiene una ruta express de 10 días.

---

## 📐 Formato de cada pregunta

```markdown
## N. [Título de la pregunta]
**Categoría:** ... · **Tipo:** Conceptual | [CASO] Análisis de problema

### 📝 Respuesta resumen
3–6 líneas: lo esencial.

### 📖 Respuesta detallada
Explicación profunda, código, trade-offs, errores comunes, qué espera oír el entrevistador.
```

Este formato se valida automáticamente (ver abajo), así que cualquier aportación lo mantiene.

## 🛠️ Herramientas del repositorio

```bash
npm run indice     # regenera INDICE.md a partir de las preguntas
npm run validar    # formato de preguntas, conteos del README y enlaces/anclas rotos
```

Ambos se ejecutan en CI en cada push y pull request. Si añades preguntas, `npm run indice` y listo.

## 🤝 Contribuir

Las aportaciones son bienvenidas: nuevas preguntas, correcciones o mejoras de los cursos. Lee [`CONTRIBUTING.md`](CONTRIBUTING.md) para el formato y el checklist.

## 📄 Licencia

[MIT](LICENSE). Úsalo, adáptalo y compártelo; si te sirvió para conseguir el puesto, cuéntalo.
