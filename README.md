# 🎯 Entrevistas Técnicas Nivel Senior — Microservicios, Cloud y Frontend

Preparación completa para entrevistas técnicas **senior**: un banco de **494 preguntas con respuestas**, **11 cursos** que enseñan lo necesario para responderlas y **simulacros de entrevista por rol y nivel** con respuestas graduadas.

🌐 **Sitio web (español e inglés):** <https://entrevistas.bezenti.com>

| | |
|---|---|
| 🎤 **[Simulacros de entrevista](entrevistas/)** | Por rol (QA, backend, frontend, fullstack, DevOps, arquitecto, tech lead) y nivel |
| 📚 **[Banco de preguntas](INDICE.md)** | 494 preguntas, 209 de ellas de análisis de casos reales |
| 🎓 **[Cursos](cursos/)** | 11 cursos · 50 módulos con teoría, laboratorios y autoevaluación |
| 🗺️ **[Plan de estudio](PLAN-DE-ESTUDIO.md)** | Rutas de 10 días y de 8 semanas, y por perfil de vacante |
| 📖 **[Glosario](GLOSARIO.md)** | Los términos que debes poder definir en 20 segundos |
| ✅ **[Seguimiento](PROGRESO.md)** | Checklist para marcar lo que ya dominas |

---

## 🎤 Simulacros de entrevista — por rol y nivel

Entrevistas completas escritas como las plantea un entrevistador real. Para cada pregunta:

- **❌ Lo que NO debes decir** — la respuesta plausible que te baja de nivel, y **por qué** está mal.
- **⚠️ Respuesta aceptable** — la que aprueba pero no destaca, y qué le falta exactamente.
- **✅ Respuesta ideal** — la que te sube de banda: mecanismo, trade-off y número.
- **🔁 Repregunta probable** — lo que preguntan después y cómo lo respondes.

| Técnicas por rol | Funcionales |
|---|---|
| [🧪 QA / Automatización](entrevistas/tecnicas/qa.md) · [⚙️ Backend](entrevistas/tecnicas/backend.md) · [🎨 Frontend](entrevistas/tecnicas/frontend.md) · [🧩 Fullstack](entrevistas/tecnicas/fullstack.md) · [🛠️ DevOps/SRE](entrevistas/tecnicas/devops-sre.md) · [🏛️ Arquitecto](entrevistas/tecnicas/arquitecto.md) · [🧭 Tech Lead](entrevistas/tecnicas/tech-lead.md) | [Por nivel: junior → staff](entrevistas/funcionales/por-nivel.md) · [Liderazgo y conflictos](entrevistas/funcionales/liderazgo-y-conflictos.md) · [RRHH, motivación y cierre](entrevistas/funcionales/rrhh-y-cierre.md) |

Todas están disponibles también [en inglés](entrevistas/en/).

---

## 📚 Banco de preguntas — 494 en total

Cada pregunta incluye:

- **📝 Respuesta resumen** — lo que dirías en 30–60 segundos en la entrevista.
- **📖 Respuesta detallada** — explicación profunda con código, trade-offs, diagramas y errores comunes.

| Área | Carpeta | Preguntas | Curso que la prepara |
|------|---------|:---------:|---|
| ☕ Java Senior + Microservicios | [`java-microservicios/`](java-microservicios/) | 62 | [01 · Java senior](cursos/01-java-senior/) |
| 🟦 TypeScript Senior + Microservicios | [`typescript-microservicios/`](typescript-microservicios/) | 48 | [02 · TypeScript/Node](cursos/02-typescript-node-senior/) |
| 🐹 Golang Senior + Microservicios | [`golang-microservicios/`](golang-microservicios/) | 55 | [03 · Go senior](cursos/03-go-senior/) |
| ☁️ AWS | [`cloud/aws/`](cloud/aws/) | 47 | [04 · Cloud y Kubernetes](cursos/04-cloud-y-kubernetes/) |
| ☁️ Azure | [`cloud/azure/`](cloud/azure/) | 30 | [04 · Cloud y Kubernetes](cursos/04-cloud-y-kubernetes/) |
| ☁️ GCP | [`cloud/gcp/`](cloud/gcp/) | 31 | [04 · Cloud y Kubernetes](cursos/04-cloud-y-kubernetes/) |
| 🧩 Microfrontends | [`microfrontends/`](microfrontends/) | 30 | [05 · Microfrontends](cursos/05-microfrontends/) |
| 🔐 Seguridad y Vulnerabilidades | [`seguridad-vulnerabilidades/`](seguridad-vulnerabilidades/) | 42 | [06 · Seguridad](cursos/06-seguridad/) |
| 🔄 Versionamiento de APIs | [`versionamiento-apis/`](versionamiento-apis/) | 40 | [07 · APIs y versionado](cursos/07-apis-y-versionado/) |
| 📨 Mensajería y Event-Driven (Kafka · RabbitMQ · Colas) | [`mensajeria-eventos/`](mensajeria-eventos/) | 59 | [10 · Mensajería y streaming](cursos/10-mensajeria-y-streaming/) |
| 🧠 Casos de Estudio Transversales | [`casos-de-estudio/`](casos-de-estudio/) | 50 | [08 · System design](cursos/08-system-design/) |

**209 preguntas (42%) son de tipo [CASO]:** análisis de problemas, troubleshooting en producción y system design. El [índice completo](INDICE.md) las lista todas con enlace directo.

---

## 🎓 Cursos — de cero al nivel que exigen estas preguntas

El banco te dice **qué** te van a preguntar; los cursos te enseñan **por qué** la respuesta es esa, para que aguantes las repreguntas. Cada módulo termina con un **laboratorio** (algo que ejecutas), una **autoevaluación** y el enlace a las preguntas que desbloquea.

| # | Curso | Módulos | Para qué |
|:-:|---|:-:|---|
| 00 | [Fundamentos de sistemas distribuidos](cursos/00-fundamentos-distribuidos/) | 6 | **Prerrequisito real de todo lo demás** |
| 01 | [Java senior + Spring](cursos/01-java-senior/) | 6 | JVM, concurrencia, Spring, Kafka, Quarkus, diagnóstico |
| 02 | [TypeScript / Node senior](cursos/02-typescript-node-senior/) | 4 | Tipos avanzados, event loop, arquitectura, diagnóstico |
| 03 | [Go senior](cursos/03-go-senior/) | 4 | Concurrencia, runtime, servicios de producción, pprof |
| 04 | [Cloud y Kubernetes](cursos/04-cloud-y-kubernetes/) | 5 | AWS/Azure/GCP, K8s, identidad, red, costos |
| 05 | [Microfrontends](cursos/05-microfrontends/) | 4 | Module Federation, integración, operación |
| 06 | [Seguridad aplicada](cursos/06-seguridad/) | 4 | Amenazas, OWASP, authN/authZ, incidentes |
| 07 | [Diseño y versionado de APIs](cursos/07-apis-y-versionado/) | 4 | Contratos, breaking changes, migraciones sin downtime |
| 08 | [System design e incidentes](cursos/08-system-design/) | 5 | Framework de 45 min, estimaciones, patrones |
| 09 | [Técnica de entrevista](cursos/09-tecnica-de-entrevista/) | 3 | Comunicar, simulacros, comportamiento y oferta |
| 10 | [Mensajería y streaming](cursos/10-mensajeria-y-streaming/) | 5 | Kafka, RabbitMQ, colas, event-driven, laboratorio de operación |

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

## 🌐 El sitio web

Todo este contenido se publica como sitio estático multiidioma (**español e inglés**) con buscador:

<https://entrevistas.bezenti.com>

- Construido con **Astro + Starlight**; el código vive en [`web/`](web/).
- El contenido **no se duplica**: un script sincroniza el markdown del repositorio y reescribe los enlaces a rutas del sitio, así que la fuente de verdad sigue siendo el markdown que ves aquí.
- Los simulacros de entrevista, la portada y las guías están traducidos al inglés; el banco y los cursos se sirven en español con aviso, y se traducen de forma incremental.

```bash
cd web
pnpm install
pnpm dev        # sincroniza el contenido y levanta el sitio en local
pnpm build      # build de producción (incluye el índice de búsqueda)
```

El despliegue es automático por CI/CD en cada push a `master`.

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
