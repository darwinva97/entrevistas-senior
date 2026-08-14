# ✅ Seguimiento de tu preparación

Copia este fichero (o edítalo en tu fork) y ve marcando. La honestidad aquí es la que decide si apruebas la entrevista: **marca solo lo que puedes explicar en voz alta sin mirar**.

Leyenda: `[ ]` no lo domino · `[~]` lo entiendo pero no lo explicaría fluido · `[x]` lo explico en 60 s con trade-offs

---

## Cursos

### 00 · Fundamentos de sistemas distribuidos
- [ ] 1 · Modelo mental (fallos parciales, falacias, disponibilidad en serie)
- [ ] 2 · Consistencia y CAP/PACELC, aislamiento y anomalías
- [ ] 3 · Mensajería, idempotencia, outbox, orden y sagas
- [ ] 4 · Resiliencia: timeouts, reintentos, breakers, bulkheads, shedding
- [ ] 5 · Latencia, ley de Little, percentiles y capacidad
- [ ] 6 · Observabilidad y método de diagnóstico (7 pasos)
- [ ] 🧪 Laboratorio: endpoint idempotente probado con 100 reintentos
- [ ] 🧪 Laboratorio: cascada provocada y contenida (tabla de p50/p99)

### Tu lenguaje (marca el que apliques)
- [ ] 01 · Java: JVM y GC · concurrencia/JMM · Spring y transacciones · Kafka · laboratorio de diagnóstico
- [ ] 02 · TypeScript/Node: tipos · event loop y memoria · arquitectura de servicios · laboratorio
- [ ] 03 · Go: concurrencia y context · runtime y GC · servicios de producción · pprof
- [ ] 🧪 Laboratorio: un memory leak reproducido y diagnosticado con el profiler
- [ ] 🧪 Laboratorio: apagado ordenado con cero errores en un rollout

### 04 · Cloud y Kubernetes
- [ ] 1 · Equivalencias multicloud y criterios de elección
- [ ] 2 · Contenedores vs serverless, cold starts, imágenes
- [ ] 3 · Identidad sin secretos, red y elección de base de datos
- [ ] 4 · Kubernetes: ciclo de vida, probes, recursos, rollouts
- [ ] 5 · Fiabilidad, RTO/RPO, costes y cuotas

### 05 · Microfrontends *(si aplica al puesto)*
- [ ] 1 · Cuándo NO usarlos y alternativas
- [ ] 2 · Module Federation y dependencias compartidas
- [ ] 3 · Contratos, routing, sesión y estilos
- [ ] 4 · Deploy independiente, performance y observabilidad

### 06 · Seguridad
- [ ] 1 · Modelo de amenazas y OWASP aplicado
- [ ] 2 · OAuth2/OIDC, JWT y revocación
- [ ] 3 · Zero trust, secretos y cadena de suministro
- [ ] 4 · Respuesta a incidentes (los 4 escenarios)

### 07 · APIs y versionado
- [ ] 1 · Diseño de contratos (errores, paginación, idempotencia)
- [ ] 2 · Breaking changes, estrategias y deprecación
- [ ] 3 · Compatibilidad de esquemas y eventos
- [ ] 4 · Migraciones sin downtime (expand/contract)

### 08 · System design
- [ ] 1 · Framework de 45 minutos interiorizado
- [ ] 2 · Estimaciones en voz alta sin calculadora
- [ ] 3 · Catálogo de patrones
- [ ] 4 · Almacenamiento y particionado
- [ ] 5 · Guion de incidentes y firmas de síntomas

### 09 · Técnica de entrevista
- [ ] 1 · Estructura de respuesta (titular → razón → trade-off → gancho)
- [ ] 2 · Los 5 simulacros hechos y puntuados con rúbrica
- [ ] 3 · Seis historias STAR escritas y grabadas

---

## Banco de preguntas

Marca cuando puedas responder **todas** las de ese fichero sin mirar. Consulta el [índice completo](INDICE.md).

| Área | Fichero | Preguntas | Estado |
|---|---|:-:|:-:|
| Java | [01 Core avanzado](java-microservicios/01-java-core-avanzado.md) | 15 | [ ] |
| Java | [02 Spring y microservicios](java-microservicios/02-spring-y-microservicios.md) | 16 | [ ] |
| Java | [03 Casos y problemas](java-microservicios/03-casos-y-problemas.md) | 15 | [ ] |
| TypeScript | [01 TypeScript avanzado](typescript-microservicios/01-typescript-avanzado.md) | 16 | [ ] |
| TypeScript | [02 Node y microservicios](typescript-microservicios/02-node-y-microservicios.md) | 16 | [ ] |
| TypeScript | [03 Casos y problemas](typescript-microservicios/03-casos-y-problemas.md) | 16 | [ ] |
| Go | [01 Go core avanzado](golang-microservicios/01-go-core-avanzado.md) | 21 | [ ] |
| Go | [02 Microservicios en Go](golang-microservicios/02-microservicios-en-go.md) | 18 | [ ] |
| Go | [03 Casos y problemas](golang-microservicios/03-casos-y-problemas.md) | 16 | [ ] |
| AWS | [01 Fundamentos](cloud/aws/01-fundamentos-y-arquitectura.md) | 18 | [ ] |
| AWS | [02 Microservicios](cloud/aws/02-microservicios-en-aws.md) | 13 | [ ] |
| AWS | [03 Casos](cloud/aws/03-casos-y-problemas.md) | 16 | [ ] |
| Azure | [01 Fundamentos](cloud/azure/01-fundamentos-y-arquitectura.md) | 12 | [ ] |
| Azure | [02 Microservicios y casos](cloud/azure/02-microservicios-y-casos.md) | 18 | [ ] |
| GCP | [01 Fundamentos](cloud/gcp/01-fundamentos-y-arquitectura.md) | 13 | [ ] |
| GCP | [02 Microservicios y casos](cloud/gcp/02-microservicios-y-casos.md) | 18 | [ ] |
| Microfrontends | [01 Fundamentos](microfrontends/01-fundamentos-y-arquitectura.md) | 18 | [ ] |
| Microfrontends | [02 Casos](microfrontends/02-casos-y-problemas.md) | 12 | [ ] |
| Seguridad | [01 OWASP](seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md) | 18 | [ ] |
| Seguridad | [02 Microservicios](seguridad-vulnerabilidades/02-seguridad-en-microservicios.md) | 12 | [ ] |
| Seguridad | [03 Casos e incidentes](seguridad-vulnerabilidades/03-casos-e-incidentes.md) | 12 | [ ] |
| APIs | [01 Versionamiento](versionamiento-apis/01-versionamiento-de-apis.md) | 16 | [ ] |
| APIs | [02 Servicios y datos](versionamiento-apis/02-versionamiento-de-servicios-y-datos.md) | 14 | [ ] |
| APIs | [03 Casos](versionamiento-apis/03-casos-y-problemas.md) | 10 | [ ] |
| Casos | [01 System design](casos-de-estudio/01-system-design.md) | 10 | [ ] |
| Casos | [02 Incidentes](casos-de-estudio/02-incidentes-en-produccion.md) | 10 | [ ] |

---

## Preparación personal

- [ ] Seis historias STAR escritas, con números
- [ ] "Háblame de ti" de 90 segundos ensayado
- [ ] CV reescrito en formato impacto (resultado + número + negocio)
- [ ] Cinco preguntas preparadas para el entrevistador
- [ ] Rango salarial investigado y justificado
- [ ] Al menos dos simulacros hechos **con otra persona**
- [ ] Entorno de videollamada probado (cámara, audio, luz, pizarra digital)

---

## Diario de estudio

| Fecha | Qué estudié | Qué me quedó flojo |
|---|---|---|
| | | |
