# 🎓 Cursos — de cero al nivel que exigen estas preguntas

El banco de preguntas de este repositorio te dice **qué** te van a preguntar. Estos cursos te enseñan **por qué** cada respuesta es esa, para que puedas responder cuando el entrevistador se sale del guion.

Cada módulo está escrito para estudiarse en una sesión (60–120 min) y termina siempre igual:

- **🧪 Laboratorio** — algo que ejecutas o construyes; sin esto no se fija nada.
- **✅ Autoevaluación** — preguntas para responder *en voz alta*, que es como se responde en la entrevista.
- **🎯 Preguntas del banco que desbloquea** — el enlace directo a lo que ya puedes contestar.

---

## Mapa de cursos

| # | Curso | Módulos | Prepara para |
|:-:|---|:-:|---|
| 00 | [Fundamentos de sistemas distribuidos](00-fundamentos-distribuidos/) | 6 | **Todo el banco.** Es el prerrequisito real de los demás |
| 01 | [Java senior + Spring](01-java-senior/) | 6 | [`java-microservicios/`](../java-microservicios/) (62 preguntas) |
| 02 | [TypeScript / Node senior](02-typescript-node-senior/) | 4 | [`typescript-microservicios/`](../typescript-microservicios/) (48) |
| 03 | [Go senior](03-go-senior/) | 4 | [`golang-microservicios/`](../golang-microservicios/) (55) |
| 04 | [Cloud y Kubernetes (AWS · Azure · GCP)](04-cloud-y-kubernetes/) | 5 | [`cloud/`](../cloud/) (108) |
| 05 | [Microfrontends](05-microfrontends/) | 4 | [`microfrontends/`](../microfrontends/) (30) |
| 06 | [Seguridad aplicada](06-seguridad/) | 4 | [`seguridad-vulnerabilidades/`](../seguridad-vulnerabilidades/) (42) |
| 07 | [Diseño y versionado de APIs](07-apis-y-versionado/) | 4 | [`versionamiento-apis/`](../versionamiento-apis/) (40) |
| 08 | [System design y análisis de incidentes](08-system-design/) | 5 | [`casos-de-estudio/`](../casos-de-estudio/) (50) + todos los **[CASO]** |
| 09 | [Técnica de entrevista senior](09-tecnica-de-entrevista/) | 3 | La diferencia entre saberlo y que se note |
| 10 | [Mensajería y streaming (Kafka · RabbitMQ)](10-mensajeria-y-streaming/) | 5 | [`mensajeria-eventos/`](../mensajeria-eventos/) (59) |

**El curso 00 no es opcional.** El 70% de las preguntas de este repositorio —incluidas las de Java, Go o AWS— son en realidad preguntas de sistemas distribuidos disfrazadas de preguntas de tecnología. Si entiendes idempotencia, backpressure y fallos parciales, la mitad de las respuestas las deduces.

---

## Rutas de estudio

### 🏃 Ruta express — 10 días (tienes la entrevista la semana que viene)

| Día | Qué haces |
|:-:|---|
| 1 | Curso 00, módulos 1–3 |
| 2 | Curso 00, módulos 4–6 |
| 3 | Curso 08 módulos 1–2 + resolver 2 casos de [`casos-de-estudio/01-system-design.md`](../casos-de-estudio/01-system-design.md) en voz alta |
| 4–5 | Tu curso de lenguaje (01, 02 o 03) completo |
| 6 | Curso 04 (solo el cloud que usa la empresa) + módulo 4 (Kubernetes) |
| 7 | Curso 06 módulos 1–2 y curso 07 módulos 1–2 |
| 8 | Todos los **[CASO]** de tu lenguaje: leer el enunciado, responder, contrastar |
| 9 | Curso 09 completo + grabarte respondiendo 5 preguntas |
| 10 | Simulacro cronometrado completo + repaso de las "respuestas resumen" |

### 🧗 Ruta completa — 8 semanas (quieres cambiar de liga, no aprobar un examen)

| Semana | Curso | Entregable propio |
|:-:|---|---|
| 1 | 00 Fundamentos | Un servicio con idempotencia real y outbox |
| 2 | Tu lenguaje (01/02/03) | Reproducir un memory leak y diagnosticarlo con el profiler |
| 3 | 07 APIs y versionado | Publicar v1 y v2 de una API sin romper clientes |
| 4 | 04 Cloud + Kubernetes | Desplegar con health checks, HPA y límites bien puestos |
| 5 | 06 Seguridad | Modelo de amenazas + arreglar 3 vulnerabilidades reales |
| 6 | 10 Mensajería y streaming (o 05 Microfrontends, según el puesto) | Laboratorio integrador de mensajería (o shell + 2 remotes) |
| 7 | 08 System design | 5 diseños completos escritos y cronometrados |
| 8 | 09 Entrevista + repaso | 3 simulacros con otra persona |

### 🎯 Ruta por perfil de vacante

- **Backend Java/microservicios:** 00 → 01 → 07 → 04 → 08 → 06
- **Backend Node/TypeScript:** 00 → 02 → 07 → 04 → 08 → 06
- **Backend Go / plataforma:** 00 → 03 → 04 → 08 → 07 → 06
- **Fullstack con peso frontend:** 00 → 05 → 02 → 07 → 08
- **Staff / arquitecto:** 00 → 08 → 07 → 06 → 04 (y en las entrevistas te evaluarán sobre todo el 08 y el 09)

---

## Cómo estudiar esto (método, no fuerza bruta)

1. **Primero explica, luego lee.** Antes de abrir un módulo, escribe en 5 líneas lo que ya crees saber del tema. Al terminar, compara. Los huecos que descubras así son los que el entrevistador va a encontrar.
2. **Responde en voz alta y cronometrado.** Una respuesta correcta pero de cuatro minutos es una respuesta fallida. El formato del banco (resumen de 30–60 s + detalle) existe justo por eso: el resumen es lo que dices, el detalle es lo que sostiene las repreguntas.
3. **Haz los laboratorios.** No hay forma de sonar creíble hablando de `pprof`, de un `Full GC` o de un rebalanceo de Kafka si nunca has visto la salida real. Diez minutos de terminal valen más que una hora de lectura.
4. **Estudia los errores, no solo los aciertos.** Cada módulo tiene una sección de errores comunes: son exactamente las frases que hacen que un entrevistador te baje de nivel.
5. **Cierra el ciclo con el banco.** Un módulo no está terminado hasta que respondes sus preguntas asociadas sin mirar.

> **Regla de los tres niveles:** para cada tema deberías poder responder en 30 segundos (qué es), en 3 minutos (cómo funciona por dentro y sus trade-offs) y con una anécdota propia (cuándo lo usaste o lo rompiste). Si te falta el tercer nivel, invéntate el laboratorio que te lo dé.

---

## Convenciones

- Los bloques marcados como **⚠️ Trampa** son errores que suenan razonables y son falsos: los entrevistadores los usan como filtro.
- Los bloques **💬 Cómo lo dices** son formulaciones literales, calibradas para sonar senior sin sonar arrogante.
- El código es ilustrativo y va al grano del concepto; no es código listo para producción salvo que lo diga.
- Todo enlace a `../<área>/` apunta al banco de preguntas correspondiente.
