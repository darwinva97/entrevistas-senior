# Módulo 3 · Evolución de datos y eventos

> **Curso 07 · APIs** · 150 min

## Por qué esto importa en la entrevista

Porque un evento es una API con dos diferencias que lo hacen **más difícil**: no sabes quién lo consume, y **los eventos ya emitidos son inmutables**. Un mensaje publicado hace seis meses seguirá ahí cuando alguien reprocese el topic. Quien entiende esto diseña esquemas con cuidado; quien no, provoca el incidente clásico del consumidor que revienta al reprocesar el histórico.

## Modelo mental: tres compatibilidades

```
BACKWARD  el consumidor NUEVO puede leer datos VIEJOS   → primero actualizas consumidores
FORWARD   el consumidor VIEJO puede leer datos NUEVOS   → primero actualizas productores
FULL      ambas                                          → orden libre (lo que quieres)
```

Esa tabla decide **el orden de despliegue**, y es exactamente lo que se te va a preguntar. Con compatibilidad *backward* (la política por defecto en Confluent Schema Registry) actualizas primero a todos los consumidores; con *forward*, primero al productor. Con *full*, no dependes del orden — que es lo que hace posible el despliegue independiente de verdad.

Reglas concretas por formato:

- **Avro:** añadir un campo **con valor por defecto** es compatible en ambos sentidos; sin default, no. Eliminar un campo que tenía default es *backward*.
- **Protobuf:** ver [módulo 1](01-diseno-de-contratos.md) — números de campo, `reserved`, enums con `UNSPECIFIED`.
- **JSON:** sin registry, la compatibilidad depende de la disciplina de los consumidores (que deben ignorar lo desconocido). JSON Schema + validación en CI es el sustituto razonable.

## Schema registry: el contrato de los eventos

Qué aporta y por qué debes pedirlo: valida la compatibilidad **antes** de publicar (en CI, no en runtime), versiona los esquemas, permite que el consumidor deserialice con el esquema correcto (el id del esquema viaja en el mensaje), y da un catálogo de qué eventos existen.

Punto fino que suma: define la **política de compatibilidad por topic**, no global — un topic de auditoría con consumidores desconocidos merece `FULL_TRANSITIVE`, mientras que un topic interno de un solo equipo puede vivir con `BACKWARD`.

## Diseño de eventos que envejecen bien

```json
{
  "eventId": "0f0e...",                  // idempotencia del consumidor
  "eventType": "pedido.pagado",
  "eventVersion": 2,                     // versión del esquema, explícita
  "occurredAt": "2026-08-14T10:00:00Z",  // cuándo pasó, no cuándo se publicó
  "traceId": "4bf92f...",                // correlación end-to-end
  "producer": "servicio-pagos@1.14.2",
  "data": { "pedidoId": "A1", "monto": {"valor": 1000, "moneda": "PEN"} }
}
```

Decisiones que debes poder justificar:

- **Sobre del evento separado de los datos** (metadatos estables, payload evolutivo).
- **Nombre en pasado** (`pedido.pagado`): un evento es un hecho ocurrido, no una orden. Si lo que quieres es ordenar a alguien que haga algo, eso es un *comando*, va dirigido a un destinatario y se modela distinto.
- **Dinero como entero + moneda**, nunca `float`. Fechas en UTC ISO-8601.
- **Ids de negocio**, no claves internas de tu BD.
- **Event-carried state transfer vs notificación:** un evento "gordo" (con los datos) evita que N consumidores te llamen de vuelta (evitas el efecto martillo), pero acopla a tu modelo y crece; uno "delgado" (solo ids) obliga a una llamada síncrona que reintroduce acoplamiento temporal. Un término medio habitual: los campos que el 90% de consumidores necesitan, más el id para el resto. **Saber exponer este trade-off es una respuesta de nivel arquitecto.**

## Versionar eventos: las cuatro estrategias

1. **Evolución compatible en el mismo topic** (lo normal): campos opcionales con default, nunca eliminar. El 90% de los casos.
2. **Nuevo topic por versión mayor** (`pedidos.v2`): productor publica en ambos durante la transición; los consumidores migran a su ritmo; se retira el v1 con el proceso de deprecación del [módulo 2](02-estrategias-de-versionado.md).
3. **Upcasting en el consumidor:** transformar eventos viejos al modelo nuevo al leerlos. Imprescindible en event sourcing, donde **el histórico completo se reproduce**.
4. **Doble publicación temporal** con el mismo `eventId` para que los consumidores deduzcan y no dupliquen.

> **⚠️ Trampa clásica:** "cambio el esquema y reproceso el topic". Los eventos antiguos **siguen teniendo el esquema viejo**; si tu consumidor nuevo no lo tolera, el reproceso explota. En event sourcing esto es aún más crítico: el esquema viejo debe poder leerse *para siempre*, o mantienes upcasters versionados.

## Versionado del esquema de base de datos

Las reglas que hacen posible desplegar sin downtime (desarrolladas en el [módulo 4](04-migraciones-sin-downtime.md)):

- **Migraciones versionadas y en el repositorio** (Flyway, Liquibase, `migrate`, Prisma), aplicadas por el pipeline, **nunca a mano en producción**.
- **Solo aditivas en el mismo despliegue:** añadir columna *nullable* o con default, añadir tabla, añadir índice `CONCURRENTLY`.
- **Nunca renombrar ni eliminar en el mismo despliegue** que cambia el código: expand/contract.
- **Migraciones idempotentes y reversibles** cuando sea posible; si no lo son (un `DROP`), que estén separadas y tras un periodo de gracia.
- **Cuidado con los locks:** un `ALTER TABLE` con reescritura bloquea; en Postgres, `ADD COLUMN` con default es rápido desde la v11, pero `ALTER TYPE` reescribe la tabla. En MySQL, revisa qué operaciones son online. Un `lock_timeout` bajo evita convertir una migración en un incidente.
- **Índices sin bloquear:** `CREATE INDEX CONCURRENTLY` (Postgres), y ten en cuenta que puede fallar y dejar un índice inválido que hay que limpiar.

## Compatibilidad en el almacenamiento de documentos

Sin esquema en la BD, el esquema vive en el código: versiona cada documento (`schemaVersion`), migra perezosamente al leer (*lazy migration*) o con un job en segundo plano, y **nunca asumas que todos los documentos tienen la forma actual**. Es el error que produce `undefined is not a function` en producción tres meses después.

## Errores comunes que delatan a un no-senior

- Tratar los eventos con menos rigor que las APIs.
- No conocer la diferencia entre backward y forward, ni su efecto en el orden de despliegue.
- Publicar el modelo interno de la BD como evento.
- Eventos con nombre de comando (`crearPedido`) sin distinguir los conceptos.
- Usar `float` para dinero.
- Migraciones ejecutadas a mano en producción.
- Renombrar una columna y desplegar a la vez.

## 🧪 Laboratorio

1. **Registry en acción:** monta Kafka + Schema Registry; define un esquema Avro, intenta un cambio incompatible y observa el rechazo. Prueba las políticas `BACKWARD`, `FORWARD` y `FULL` con el mismo cambio y anota qué permite cada una.
2. **Reproceso con esquema viejo:** publica 1.000 eventos v1, evoluciona el consumidor y reprocesa desde el offset 0. Rompe el consumidor a propósito y luego arréglalo con upcasting.
3. **Nuevo topic por versión:** implementa la doble publicación y la migración de un consumidor; mide el periodo de convivencia.
4. **Migración con lock:** en una tabla de 5M de filas, ejecuta un `ALTER` que reescriba y otro que no; mide el bloqueo con `pg_locks` mientras hay tráfico. Repite con `lock_timeout`.
5. **Documentos versionados:** añade `schemaVersion` y migración perezosa a una colección; demuestra que conviven dos formas sin errores.

## ✅ Autoevaluación

1. Explica backward, forward y full, y qué implica cada una para el orden de despliegue.
2. ¿Qué cambios son compatibles en Avro? ¿Y en protobuf?
3. Diseña el sobre de un evento y justifica cada campo.
4. Evento "gordo" vs "delgado": trade-offs y cuál eliges.
5. Cuatro formas de versionar eventos y cuándo cada una.
6. ¿Por qué reprocesar un topic puede romper a un consumidor nuevo?
7. ¿Qué reglas sigues para migraciones de BD que no causen downtime?

## 🎯 Preguntas del banco que ya puedes responder

- [`versionamiento-apis/02-versionamiento-de-servicios-y-datos.md`](../../versionamiento-apis/02-versionamiento-de-servicios-y-datos.md) — las 14
- [`java-microservicios/02-spring-y-microservicios.md`](../../java-microservicios/02-spring-y-microservicios.md) — 12 (CQRS y event sourcing)
- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — 4 y 10

---

**Anterior:** [Módulo 2](02-estrategias-de-versionado.md) · **Siguiente:** [Módulo 4 · Migraciones sin downtime](04-migraciones-sin-downtime.md)
