# 🗺️ Plan de estudio

Tres rutas según el tiempo que tengas. Todas combinan [cursos](cursos/) (entender) con el [banco de preguntas](INDICE.md) (practicar). Marca tu avance en [`PROGRESO.md`](PROGRESO.md).

> **Regla que atraviesa las tres rutas:** por cada hora de lectura, media hora respondiendo **en voz alta y cronometrado**. La entrevista no evalúa lo que sabes, evalúa lo que consigues decir en 60 segundos.

---

## 🏃 Ruta express — 10 días

Para cuando ya tienes la entrevista agendada. Unas 3 horas al día.

| Día | Estudio | Práctica |
|:-:|---|---|
| 1 | [Curso 00](cursos/00-fundamentos-distribuidos/), módulos 1–3 | Laboratorio de idempotencia (módulo 3) |
| 2 | [Curso 00](cursos/00-fundamentos-distribuidos/), módulos 4–6 | Laboratorio de cascada (módulo 4) |
| 3 | [Curso 08](cursos/08-system-design/), módulos 1–2 | 2 casos de [system design](casos-de-estudio/01-system-design.md) cronometrados |
| 4 | Tu curso de lenguaje ([01](cursos/01-java-senior/) / [02](cursos/02-typescript-node-senior/) / [03](cursos/03-go-senior/)), primera mitad | Preguntas del área, respuestas resumen |
| 5 | Tu curso de lenguaje, segunda mitad + laboratorio de diagnóstico | Los **[CASO]** de tu lenguaje |
| 6 | [Curso 04](cursos/04-cloud-y-kubernetes/): tu nube + módulo 4 (Kubernetes) | Preguntas de esa nube |
| 7 | [Curso 06](cursos/06-seguridad/) mód. 1–2 · [Curso 07](cursos/07-apis-y-versionado/) mód. 1–2 | Preguntas de seguridad y de versionado |
| 8 | [Curso 08](cursos/08-system-design/), módulos 3 y 5 | 3 [incidentes](casos-de-estudio/02-incidentes-en-produccion.md) en voz alta |
| 9 | [Curso 09](cursos/09-tecnica-de-entrevista/) completo | Escribe tus 6 historias STAR y grábalas |
| 10 | Repaso de resúmenes | [Simulacro completo](cursos/09-tecnica-de-entrevista/02-simulacros.md) con rúbrica |

**Si solo tuvieras 3 días:** curso 00 (días 1–2) + curso 08 módulos 1, 2 y 5 + tus historias STAR. Es el 20% que da el 80%.

---

## 🧗 Ruta completa — 8 semanas

Para cambiar de liga, no para aprobar un examen. Unas 8 horas por semana.

| Semana | Curso | Banco | Entregable propio |
|:-:|---|---|---|
| 1 | [00 · Fundamentos](cursos/00-fundamentos-distribuidos/) | casos 1, 3, 7 de [incidentes](casos-de-estudio/02-incidentes-en-produccion.md) | Servicio con idempotencia real + outbox |
| 2 | Tu lenguaje ([01](cursos/01-java-senior/)/[02](cursos/02-typescript-node-senior/)/[03](cursos/03-go-senior/)) | área completa del lenguaje | Un leak reproducido y diagnosticado con el profiler |
| 3 | [07 · APIs y versionado](cursos/07-apis-y-versionado/) | [versionamiento-apis](versionamiento-apis/) | v1 y v2 conviviendo + contract tests en CI |
| 4 | [04 · Cloud y Kubernetes](cursos/04-cloud-y-kubernetes/) | tu nube + Kubernetes | Despliegue con cero 502 en rollout |
| 5 | [06 · Seguridad](cursos/06-seguridad/) | [seguridad-vulnerabilidades](seguridad-vulnerabilidades/) | Modelo de amenazas + 3 vulnerabilidades corregidas |
| 6 | [05 · Microfrontends](cursos/05-microfrontends/) *(si aplica)* o repaso | [microfrontends](microfrontends/) | Shell + 2 remotes con deploy independiente |
| 7 | [08 · System design](cursos/08-system-design/) | los 10 [casos de diseño](casos-de-estudio/01-system-design.md) | 5 diseños escritos y cronometrados |
| 8 | [09 · Técnica de entrevista](cursos/09-tecnica-de-entrevista/) | repaso de resúmenes | 3 simulacros con otra persona |

---

## 🎯 Ruta por perfil de vacante

| Perfil | Orden recomendado | Dónde te van a apretar |
|---|---|---|
| **Backend Java** | 00 → 01 → 07 → 04 → 08 → 06 | JVM, `@Transactional`, Kafka, casos de producción |
| **Backend Node/TS** | 00 → 02 → 07 → 04 → 08 → 06 | Event loop, tipos en la frontera, shutdown, memoria |
| **Backend Go / plataforma** | 00 → 03 → 04 → 08 → 07 → 06 | Goroutines y fugas, `context`, pprof, Kubernetes |
| **Fullstack con peso frontend** | 00 → 05 → 02 → 07 → 08 | Microfrontends, contratos, performance |
| **Staff / arquitecto** | 00 → 08 → 07 → 06 → 04 | Trade-offs, migraciones, coste, organización |
| **SRE / DevOps** | 00 → 04 → 08 → 06 → tu lenguaje | Incidentes, observabilidad, fiabilidad, costes |

---

## 📅 Rutina diaria recomendada (90 minutos)

```
15 min · Repaso en voz alta de 10 respuestas resumen de días anteriores (repetición espaciada)
45 min · Módulo nuevo de un curso
20 min · Laboratorio o práctica del módulo
10 min · Escribir en PROGRESO.md qué aprendiste y qué te quedó flojo
```

La primera línea es la que más rinde y la que todo el mundo se salta: **la memoria se construye recuperando, no releyendo**.

## 🔁 Los 7 días previos a la entrevista

| Cuándo | Qué |
|---|---|
| −7 | Investiga la empresa: producto, escala, stack, blog de ingeniería. Ajusta qué áreas repasas |
| −5 | Simulacro de diseño completo, grabado |
| −3 | Simulacro de tu lenguaje + los **[CASO]** de tu área |
| −2 | Historias STAR en voz alta, cronometradas |
| −1 | Solo resúmenes y tus preguntas al equipo. **Nada nuevo.** Dormir |
| Día | Repaso de 20 min, agua, y llega 10 min antes a la videollamada |

**No estudies nada nuevo el día anterior.** El material nuevo desplaza al consolidado y genera inseguridad justo cuando necesitas fluidez.
