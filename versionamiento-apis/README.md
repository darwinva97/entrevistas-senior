# Versionamiento de APIs, Servicios y Datos — Preparación para Entrevistas Senior

Guía de estudio en español para entrevistas técnicas de perfiles **senior backend / microservicios**, centrada en diseño y evolución de APIs, compatibilidad, migraciones sin downtime y coordinación de breaking changes entre equipos.

Cada pregunta incluye una **📝 Respuesta resumen** (lo que dirías en 30–60 segundos) y una **📖 Respuesta detallada** con ejemplos concretos (OpenAPI, protobuf, Avro, SQL, Terraform, etc.), trade-offs, errores comunes y qué espera oír el entrevistador.

## Contenido

| Archivo | Tema | Preguntas |
|---|---|---|
| [01-versionamiento-de-apis.md](01-versionamiento-de-apis.md) | Versionamiento de APIs (REST, gRPC, eventos, GraphQL, OpenAPI, deprecación) | 16 |
| [02-versionamiento-de-servicios-y-datos.md](02-versionamiento-de-servicios-y-datos.md) | Versionamiento de servicios y datos (expand/contract, migraciones, deploys, contratos) | 14 |
| [03-casos-y-problemas.md](03-casos-y-problemas.md) | Casos y problemas reales (todos tipo [CASO]) | 10 |
| **Total** | | **40** |

---

## 01 — Versionamiento de APIs (16 preguntas)

1. ¿Qué estrategias existen para versionar una API REST y cuáles son los trade-offs reales de cada una?
2. ¿Qué es exactamente un breaking change en una API? Da una lista exhaustiva, incluyendo casos no obvios
3. Define backward compatibility y forward compatibility con precisión, desde la perspectiva productor/consumidor
4. Explica el patrón tolerant reader y la ley de Postel aplicada a APIs. ¿Cuáles son los riesgos de ser demasiado tolerante?
5. ¿Cómo se versionan mensajes y servicios en gRPC/protobuf? Reglas de field numbers, `reserved`, y por qué proto3 hizo todo opcional
6. Versionado de schemas de eventos: modos de compatibilidad del Schema Registry (BACKWARD, FORWARD, FULL, TRANSITIVE) y quién migra primero
7. [CASO] Un equipo añade un campo a un evento Avro y los consumidores de otro equipo empiezan a fallar en producción. Diagnostica y propone la solución
8. ¿Por qué GraphQL "no se versiona"? ¿Cómo se evoluciona un schema GraphQL y qué riesgos tiene ese modelo?
9. ¿Cómo se aplica SemVer a APIs HTTP y a librerías internas? ¿Qué significa cada número y por qué 0.x es peligroso?
10. Contract-first con OpenAPI: ¿cómo se usa el contrato para generar código y detectar breaking changes automáticamente en CI?
11. ¿Cómo se depreca formalmente una versión de API? Headers `Deprecation` y `Sunset`, comunicación, métricas y brownouts
12. ¿Qué papel juega un API Gateway en el versionado? Routing por versión y transformaciones para mantener versiones viejas sin duplicar backend
13. Hypermedia/HATEOAS: ¿qué aporta realmente a la evolución de una API y por qué casi nadie lo usa?
14. Idempotencia y versionado de comportamiento: ¿por qué cambiar la semántica de una operación es un breaking change aunque el esquema no cambie?
15. Versionado de SDKs cliente: relación entre versión del SDK y versión de la API, generación automática y el modelo de pinning de Stripe
16. [CASO] Tras un release, un endpoint empieza a devolver 400 a un subconjunto de clientes que "no cambiaron nada". El equipo solo endureció la validación de un campo. Analiza el incidente y define cómo prevenirlo

## 02 — Versionamiento de Servicios y Datos (14 preguntas)

1. Explica el patrón expand/contract (parallel change) para evolucionar una base de datos sin downtime
2. ¿Cómo estructuras migraciones de esquema con Flyway o Liquibase para despliegues sin downtime?
3. [CASO] Debes hacer backfill de 200M de filas y migrar la lectura a una tabla nueva sin ventana de mantenimiento. ¿Cómo secuencias dual write, backfill y dual read?
4. ¿Cómo versionas mensajes en Kafka/RabbitMQ/SQS cuando conviven consumidores con distintas versiones?
5. [CASO] Publicas eventos en un topic Kafka consumido por 8 equipos, algunos externos a tu organización, y necesitas un breaking change. ¿Qué haces?
6. ¿Por qué un rolling deployment exige compatibilidad N/N-1 y qué superficies de contrato afecta?
7. [CASO] Vas a hacer un despliegue blue/green (y luego canary) de un servicio que incluye un cambio de esquema. ¿Cómo lo secuencias y qué NO se duplica?
8. ¿Cuándo usarías feature flags en lugar de (o además de) versionar, y qué deuda generan?
9. ¿Cómo funcionan los consumer-driven contracts con Pact en CI y qué detectan que los tests E2E no?
10. ¿Cómo versionas imágenes de contenedor y artefactos para que los despliegues sean reproducibles?
11. Monorepo vs multirepo: ¿cómo cambia el versionado de servicios y librerías internas en cada modelo?
12. [CASO] Tu plataforma interna debe retirar una API usada por 15 equipos. "Que todos migren el mismo sprint" ha fracasado dos veces. Diseña el proceso de coordinación del breaking change
13. ¿Cómo versionas configuración e infraestructura (Terraform, config de aplicación) y por qué el pinning importa?
14. En event sourcing los eventos almacenados son inmutables y viven para siempre. ¿Cómo evolucionas sus esquemas?

## 03 — Casos y Problemas (10 preguntas, todas [CASO])

1. Renombrar un campo usado por 15 consumidores (expand/contract end-to-end)
2. Un equipo rompió a 3 servicios en producción con un breaking change sin avisar
3. Migrar una columna VARCHAR a JSONB en una tabla de 500M filas sin downtime
4. Deprecar /v1 con clientes móviles antiguos que no actualizan
5. Evolucionar un evento de Kafka con 8 consumidores en distintos equipos
6. Rollback de un deploy cuyo nuevo esquema ya escribió datos
7. Unificar dos APIs duplicadas que divergieron entre equipos
8. Un cliente externo se integró a un campo interno no documentado (ley de Hyrum)
9. Versionar una librería interna compartida por 30 servicios
10. Diseñar el proceso de governance de APIs para 50 equipos

---

## Cómo usar esta guía

- **Primera pasada:** lee solo las respuestas resumen de los 3 archivos para tener el mapa mental completo.
- **Profundización:** estudia las respuestas detalladas, reproduce los ejemplos (SQL, protobuf, OpenAPI) y practica explicarlos en voz alta.
- **Simulación de entrevista:** responde los casos del archivo 03 en voz alta con un plan por fases antes de leer la respuesta; en entrevistas senior lo que se evalúa es el proceso (fases, riesgos, mitigaciones, coordinación entre equipos), no solo el resultado.
