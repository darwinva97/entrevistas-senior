# Versionamiento de Servicios y Datos

Guía de preguntas de entrevista senior sobre evolución de esquemas de base de datos, mensajes, artefactos e infraestructura en arquitecturas de microservicios, con foco en despliegues sin downtime y compatibilidad entre versiones.

## 1. Explica el patrón expand/contract (parallel change) para evolucionar una base de datos sin downtime

**Categoría:** Bases de datos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Expand/contract divide un cambio de esquema breaking en tres fases: **expand** (añadir la estructura nueva sin tocar la vieja), **migrate** (el código escribe en ambas y se hace backfill de datos históricos) y **contract** (eliminar la estructura vieja cuando nadie la usa). La clave es que en todo momento el esquema es compatible tanto con la versión N como con la N-1 del código, porque durante un rolling deploy —y en un rollback— ambas versiones conviven contra la misma base de datos.

### 📖 Respuesta detallada
El problema de fondo: un `ALTER TABLE ... RENAME COLUMN` o un `DROP COLUMN` aplicado de golpe rompe la versión del código que aún está desplegada. Durante un rolling update conviven pods con código viejo y nuevo; si el esquema solo es compatible con uno de los dos, alguno falla. Expand/contract resuelve esto haciendo que **cada paso individual sea backward-compatible**.

Ejemplo realista: renombrar `customer.fullname` a dos columnas `first_name` / `last_name`.

**Fase 1 — Expand** (desplegada antes que cualquier código nuevo):

```sql
-- V12__expand_customer_name.sql
ALTER TABLE customer ADD COLUMN first_name VARCHAR(100) NULL;
ALTER TABLE customer ADD COLUMN last_name  VARCHAR(100) NULL;
```

Las columnas nuevas son `NULL`able: el código N-1 no las conoce y sus `INSERT` seguirían fallando si fueran `NOT NULL` sin default. El código viejo sigue funcionando intacto.

**Fase 2 — Migrate**. Se despliega código que hace **doble escritura** (escribe `fullname` y también `first_name`/`last_name`) pero sigue **leyendo** de `fullname`. Después se ejecuta un backfill por lotes de los datos históricos:

```sql
-- Backfill idempotente, por lotes para no bloquear
UPDATE customer
SET first_name = split_part(fullname, ' ', 1),
    last_name  = substring(fullname FROM position(' ' IN fullname) + 1)
WHERE id IN (
    SELECT id FROM customer
    WHERE first_name IS NULL AND fullname IS NOT NULL
    LIMIT 10000
);
-- se repite hasta que afecte 0 filas
```

Cuando el backfill termina y se verifica consistencia (un job de reconciliación que compara ambas representaciones), se despliega una versión que **lee** de las columnas nuevas pero mantiene la doble escritura. Este orden importa: primero cambiar la lectura, luego dejar de escribir lo viejo; así siempre hay una fuente completa.

**Fase 3 — Contract** (solo cuando ninguna versión desplegada ni rollback posible usa `fullname`):

```sql
-- V15__contract_drop_fullname.sql
ALTER TABLE customer ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE customer DROP COLUMN fullname;
```

**Trade-offs y errores comunes:**
- El coste es real: tres o más despliegues, código temporalmente duplicado, y disciplina para no olvidar el contract (muchas bases de producción acumulan columnas zombis porque nadie completó la fase 3).
- Error típico: hacer expand y contract en la misma release "porque el rolling update es rápido". El rollback rompe todo: si vuelves a N-1 después del `DROP COLUMN`, el código viejo lee una columna inexistente.
- Otro error: doble escritura sin reconciliación. Si un bug escribe solo en una representación, el switch de lectura expone datos corruptos semanas después.
- La regla mental: **el esquema debe soportar simultáneamente la versión N y N-1 del código en todo momento**, porque N-1 no es solo "los pods que faltan por actualizar", es también tu plan de rollback.

**Qué espera oír el entrevistador:** las tres fases con el orden correcto de switches (escritura dual → lectura nueva → drop), la justificación N/N-1 ligada a rolling deploys *y* rollbacks, y la honestidad sobre el coste operativo (múltiples releases, deuda si no se contrae).

## 2. ¿Cómo estructuras migraciones de esquema con Flyway o Liquibase para despliegues sin downtime?

**Categoría:** Bases de datos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Uso migraciones versionadas para cambios de esquema (inmutables, checksum validado) y repeatables para objetos re-ejecutables como vistas o funciones. Cada migración debe ser backward-compatible por sí sola: columnas nuevas nullable o con default seguro, índices creados con `CONCURRENTLY`, y nunca DDL que tome locks largos en el path del deploy. Las migraciones corren antes del rollout del código, y los backfills pesados van fuera del pipeline de migración, como jobs por lotes.

### 📖 Respuesta detallada
**Versionadas vs repeatables.** En Flyway, `V7__add_status_to_orders.sql` corre exactamente una vez y su checksum queda registrado en `flyway_schema_history`; editarla después rompe la validación (y debe romperla: el historial es inmutable). Las repeatables (`R__orders_summary_view.sql`) se re-ejecutan cada vez que cambia su checksum — ideales para vistas, funciones y grants, que son idempotentes por naturaleza (`CREATE OR REPLACE`). En Liquibase el equivalente es `runOnChange: true`:

```yaml
databaseChangeLog:
  - changeSet:
      id: add-status-to-orders
      author: darwin
      changes:
        - addColumn:
            tableName: orders
            columns:
              - column: { name: status, type: varchar(20) }
      rollback:
        - dropColumn: { tableName: orders, columnName: status }
  - changeSet:
      id: orders-summary-view
      author: darwin
      runOnChange: true
      changes:
        - createView:
            viewName: orders_summary
            replaceIfExists: true
            selectQuery: SELECT status, count(*) FROM orders GROUP BY status
```

**Columnas nuevas: nullable o default, con matices por motor.** La opción segura universal es `NULL`able. Con `DEFAULT` hay que conocer el motor: en PostgreSQL < 11, `ADD COLUMN ... DEFAULT 'x' NOT NULL` **reescribía la tabla entera** bajo `ACCESS EXCLUSIVE` lock — minutos de bloqueo en una tabla de millones de filas. Desde PG 11 el default se guarda como metadato y es instantáneo (para defaults no volátiles; `DEFAULT now()` volátil sigue sin ese atajo en el catálogo, aunque tampoco reescribe). En MySQL 5.6/5.7 con InnoDB, `ADD COLUMN` era una operación de copia de tabla salvo con `ALGORITHM=INPLACE`; desde MySQL 8.0 existe `ALGORITHM=INSTANT` para añadir columnas al final. Un senior verifica la versión del motor antes de asumir que un `ALTER` es barato.

**Locks peligrosos.** El patrón de incidente clásico en Postgres: el `ALTER TABLE` necesita `ACCESS EXCLUSIVE`, queda encolado detrás de una transacción larga, y **todas** las queries posteriores (incluso `SELECT`) se encolan detrás del `ALTER`. Mitigación:

```sql
SET lock_timeout = '3s';        -- aborta el ALTER en vez de encolar al mundo
ALTER TABLE orders ADD COLUMN status VARCHAR(20);
-- Índices: nunca CREATE INDEX a secas en tablas grandes
CREATE INDEX CONCURRENTLY idx_orders_status ON orders(status);
```

`CREATE INDEX CONCURRENTLY` no puede ir dentro de una transacción, así que en Flyway la migración necesita `-- flyway:executeInTransaction=false` (o configuración equivalente), y hay que manejar el caso de índice inválido si falla a medias (`DROP INDEX` y reintentar). Lo mismo aplica a `VALIDATE CONSTRAINT`: añade el `CHECK`/`FK` como `NOT VALID` (lock breve) y valida después (lock ligero, escaneo largo).

**Backfill fuera del pipeline.** Una migración Flyway que actualiza 50M de filas mantiene el deploy colgado y una transacción gigante abierta (bloat, réplicas retrasadas). El backfill va como job aparte (o repeatable controlada) en lotes de 1k–10k filas con commit por lote y pausas, monitorizando replication lag.

**Errores comunes:** editar migraciones ya aplicadas en vez de crear una nueva; confiar en el `rollback` automático de Liquibase para DDL destructivo (un `DROP COLUMN` no se "des-borra": el rollback real es roll-forward); ejecutar migraciones en paralelo desde múltiples réplicas sin lock (Flyway lo maneja, pero un init container por pod puede provocar carreras de arranque).

**Qué espera oír el entrevistador:** distinción versionada/repeatable, el detalle del default que reescribe la tabla según versión del motor, `lock_timeout` + `CONCURRENTLY`, y backfill desacoplado del deploy. El detalle de versiones concretas de Postgres/MySQL separa a quien lo ha sufrido de quien lo ha leído.

## 3. [CASO] Debes hacer backfill de 200M de filas y migrar la lectura a una tabla nueva sin ventana de mantenimiento. ¿Cómo secuencias dual write, backfill y dual read?

**Categoría:** Bases de datos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Secuencia: (1) crear la tabla nueva; (2) activar **dual write** detrás de un flag — toda escritura va a ambas tablas; (3) **backfill por lotes** de lo histórico, idempotente y limitado por replication lag; (4) reconciliación continua comparando ambas fuentes; (5) cambiar la **lectura** a la tabla nueva (idealmente con dual read y comparación en sombra antes); (6) apagar la escritura vieja y, tras el periodo de rollback, eliminar la tabla. Cada paso es reversible hasta el drop final.

### 📖 Respuesta detallada
El orden importa porque define qué fuente está completa en cada momento. La invariante: **nunca leas de una fuente que aún no recibe el 100% de las escrituras y el 100% del histórico**.

**Paso 1–2: dual write antes del backfill.** Si haces backfill primero, las filas escritas durante el backfill en la tabla vieja se pierden. Activando dual write primero, el backfill solo necesita cubrir lo anterior al instante de activación (con margen de solape: mejor re-copiar filas que perderlas — por eso el backfill debe ser idempotente, `INSERT ... ON CONFLICT DO UPDATE`).

```sql
INSERT INTO orders_v2 (id, customer_id, status, total_cents, updated_at)
SELECT id, customer_id, status, (total * 100)::bigint, updated_at
FROM orders
WHERE id > :last_processed_id
ORDER BY id
LIMIT 5000
ON CONFLICT (id) DO UPDATE
  SET status = EXCLUDED.status,
      total_cents = EXCLUDED.total_cents,
      updated_at = EXCLUDED.updated_at
  WHERE orders_v2.updated_at <= EXCLUDED.updated_at;  -- no pisar escrituras dual-write más recientes
```

El guard de `updated_at` evita la carrera clásica: el backfill lee una fila, el usuario la actualiza (dual write la escribe en v2), y el backfill pisa v2 con el valor viejo. Alternativas: bloquear la fila durante la copia (caro) o comparar versión/timestamp como arriba.

**Dual write: ¿transaccional o best-effort?** Si ambas tablas están en la misma base de datos, escribe en la misma transacción — consistencia gratis. Si la tabla nueva está en otra base (el caso típico de migración a otro motor), no hay transacción distribuida razonable: escribes en la vieja (fuente de verdad), y propagas a la nueva vía outbox/CDC (Debezium) o escritura síncrona best-effort con reconciliación detrás. Un senior menciona que dual write no transaccional **garantiza** divergencias y por eso la reconciliación no es opcional.

**Paso 3: throttling del backfill.** Lotes de 1k–10k, commit por lote, pausa entre lotes, y freno automático si `pg_stat_replication` muestra lag o si la latencia p99 del servicio sube. Un backfill de 200M de filas puede tardar días; está bien, no compite con nada.

**Paso 4: reconciliación.** Job que muestrea rangos de ids y compara hashes de ambas tablas (`md5(row_to_json(t)::text)` por chunks). Las discrepancias alimentan métricas; el switch de lectura se bloquea hasta que la divergencia sea ~0.

**Paso 5: dual read / shadow read.** Antes del switch, un porcentaje de lecturas consulta ambas tablas, sirve la vieja y compara en background, logueando diffs. Es la única validación que cubre bugs de serialización/mapeo que la reconciliación a nivel SQL no ve. Después, el switch de lectura va detrás de un feature flag por porcentaje de tráfico — rollback en segundos, sin redeploy.

**Paso 6: contract.** Se apaga la escritura a la vieja (flag), se espera el periodo de retención de rollback (días, no horas) y se dropea.

**Errores comunes:** backfill antes de dual write (pérdida de escrituras concurrentes); switch de lectura y escritura en el mismo deploy (rollback imposible de razonar); borrar la tabla vieja el mismo día del switch; olvidar los consumidores "invisibles" de la tabla vieja (reports, ETLs, otro equipo con acceso directo a la BD).

**Qué espera oír el entrevistador:** el orden dual write → backfill → verificación → switch de lectura → contract, la carrera backfill-vs-escritura-concurrente y su guard, throttling por lag, y flags para que cada switch sea reversible sin deploy.

## 4. ¿Cómo versionas mensajes en Kafka/RabbitMQ/SQS cuando conviven consumidores con distintas versiones?

**Categoría:** Mensajería · **Tipo:** Conceptual

### 📝 Respuesta resumen
Tres estrategias principales: campo de versión en el payload con upcasting en el consumidor (simple, pero cada consumidor carga con la lógica), topic/cola nueva por versión mayor (aislamiento total, coste de migración de consumidores), y Schema Registry con Avro/Protobuf y reglas de compatibilidad (la opción más robusta en Kafka: el registro rechaza en el productor esquemas incompatibles). Para cambios compatibles evoluciono el esquema en el mismo topic; el topic nuevo lo reservo para breaking changes reales.

### 📖 Respuesta detallada
El dato clave que condiciona todo: **los mensajes ya publicados son inmutables y los consumidores no se actualizan a la vez que el productor**. Un topic de Kafka con retención de 7 días contendrá mensajes v1 y v2 mezclados durante días; los consumidores deben poder leer ambos.

**Estrategia 1: campo de versión + upcasting.** El payload lleva `"schemaVersion": 2` (o un header `content-type: application/vnd.orders.v2+json`, mejor porque permite decidir sin parsear el body). El consumidor deserializa según versión y "upcastea" las viejas al modelo actual:

```java
OrderEvent deserialize(byte[] payload, int version) {
    return switch (version) {
        case 1 -> upcastV1toV2(parseV1(payload)); // p.ej. derivar totalCents desde total
        case 2 -> parseV2(payload);
        default -> throw new UnknownSchemaVersionException(version);
    };
}
```

Funciona, pero cada consumidor de cada equipo debe implementar (y mantener) los upcasters. Escala mal con muchos consumidores; bien si publicas una librería cliente compartida con los upcasters incluidos.

**Estrategia 2: topic nuevo (`orders.v2`).** Aislamiento limpio para breaking changes: el productor publica en ambos topics durante la transición (dual publish), los consumidores migran a su ritmo, y se apaga `orders.v1` cuando las métricas de consumo llegan a cero. Trade-offs: duplicas throughput y almacenamiento durante la transición, pierdes el orden global entre v1 y v2 (un consumidor que migra puede reprocesar o saltarse mensajes si no coordina offsets), y necesitas gobernanza para que los topics viejos mueran de verdad.

**Estrategia 3: Schema Registry (Confluent/Apicurio) con Avro o Protobuf.** El esquema se registra por subject y el registro **rechaza en tiempo de publicación** cualquier esquema que viole la regla de compatibilidad configurada:

```protobuf
message OrderCreated {
  string order_id = 1;
  string customer_id = 2;
  int64 total_cents = 3;
  // Campo nuevo: opcional y con tag nuevo => forward y backward compatible
  optional string currency = 4;
  // reserved 5; reserved "discount"; // nunca reutilizar tags eliminados
}
```

Con Avro, la compatibilidad `BACKWARD` significa que el esquema nuevo lee datos escritos con el viejo (puedes actualizar consumidores después que productores); `FORWARD`, que consumidores viejos leen datos nuevos (actualizas productores primero); `FULL` exige ambas. Para consumidores mixtos quieres al menos `FORWARD_TRANSITIVE` en la práctica: los consumidores N-1 deben tolerar mensajes N. Reglas prácticas: campos nuevos siempre con default (Avro) u `optional` (Protobuf), nunca renumerar tags, nunca cambiar el tipo de un campo — se añade campo nuevo y se depreca el viejo.

**Errores comunes:** confundir backward y forward compatibility (y configurar la regla equivocada en el registry); asumir que JSON "sin esquema" te libra del problema (solo lo hace invisible hasta el `NullPointerException` en producción); reutilizar un tag de Protobuf eliminado; hacer breaking change en el mismo topic confiando en que "ya todos migraron" sin métricas por versión de mensaje.

**Qué espera oír el entrevistador:** que los mensajes en vuelo/retenidos hacen inevitable la coexistencia de versiones, las tres estrategias con sus costes, la distinción backward/forward ligada al orden de despliegue productor/consumidor, y las reglas concretas de evolución de Avro/Protobuf.

## 5. [CASO] Publicas eventos en un topic Kafka consumido por 8 equipos, algunos externos a tu organización, y necesitas un breaking change. ¿Qué haces?

**Categoría:** Mensajería · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Primero cuestiono si el breaking change es evitable: casi siempre se puede modelar como cambio aditivo (campo nuevo opcional, deprecando el viejo). Si es inevitable, no puedo forzar la actualización de consumidores que no controlo, así que hago dual publish en un topic nuevo versionado, publico un calendario de deprecación, mido la adopción con métricas de consumo por consumer group, y mantengo el topic viejo hasta cumplir la ventana anunciada — con upcasting/downcasting en el productor para no duplicar lógica de negocio.

### 📖 Respuesta detallada
**Paso 0: evitar el breaking change.** La mayoría de "breaking changes" en eventos son evitables: en vez de cambiar el tipo de `total` de float a entero de céntimos, añado `total_cents` opcional y depreco `total`, publicando ambos durante la transición. El evento engorda temporalmente; es un precio bajísimo comparado con coordinar 8 equipos. Un senior agota esta vía antes de aceptar el breaking change. Si hay Schema Registry con `FORWARD_TRANSITIVE`, el propio registry me impide publicar la ruptura por accidente — esa es la primera red de seguridad.

**Si es inevitable (p. ej. cambio semántico: el evento pasa de "por línea de pedido" a "por pedido"):**

1. **Topic nuevo con dual publish.** `orders.order-placed.v2` junto al v1. El productor emite ambos desde el mismo hecho de negocio. Importante: la conversión v2→v1 (downcast) vive en el productor, en un solo sitio, no esparcida en 8 consumidores:

```java
void publishOrderPlaced(Order order) {
    var v2 = toV2Event(order);
    kafka.send("orders.order-placed.v2", order.id(), v2);
    kafka.send("orders.order-placed", order.id(), downcastToV1(v2)); // hasta EOL
}
```

2. **Comunicación como producto, no como cortesía.** Anuncio con RFC/changelog: qué cambia, por qué, guía de migración con ejemplos de antes/después, fecha de EOL del topic viejo (realista: meses, no semanas, con consumidores externos), y canal de soporte. Para externos, esto es contractual: si hay SLA o acuerdo de integración, la ventana de deprecación puede estar pactada.

3. **Métricas de adopción.** En Kafka es medible sin preguntar: lag y throughput por consumer group en el topic viejo (`kafka-consumer-groups --describe`, o métricas de broker exportadas a Prometheus). Sé exactamente qué grupos siguen leyendo v1 y puedo perseguir a equipos concretos en vez de mandar recordatorios genéricos. Con consumidores verdaderamente anónimos (raro en Kafka con ACLs, común en webhooks), la telemetría por versión es la única brújula — otra razón para exigir autenticación por consumidor.

4. **EOL con degradación progresiva.** Al llegar la fecha: primero se corta el dual publish (el topic v1 deja de recibir mensajes nuevos pero los retenidos siguen legibles hasta expirar la retención), se observa quién grita, y solo después se borra el topic. Nunca borrar el topic como primer acto: la retención de Kafka te da un periodo de gracia natural.

**Trade-offs:** dual publish duplica volumen y coste; mantener el downcast limita cuánto puede divergir v2 (si v1 no puede derivarse de v2, el downcast necesita datos extra y se vuelve frágil — señal de que quizá son dos eventos distintos, no dos versiones). Con RabbitMQ/SQS el patrón es igual pero sin la visibilidad de consumer groups: exchange/cola nueva y métricas propias por cola.

**Errores comunes:** anunciar EOL sin medir adopción (y descubrir en el corte que finanzas tenía un consumidor batch mensual que nadie vio en las métricas de la semana); poner el upcasting en los consumidores cuando controlas el productor; tratar la fecha de EOL como aspiracional y extenderla indefinidamente — eso enseña a los equipos a ignorar deprecaciones.

**Qué espera oír el entrevistador:** el reflejo de evitar el breaking change primero, dual publish con la conversión centralizada en el productor, adopción medida con datos de consumer groups en lugar de fe, y una política de deprecación con dientes pero con periodo de gracia.

## 6. ¿Por qué un rolling deployment exige compatibilidad N/N-1 y qué superficies de contrato afecta?

**Categoría:** Despliegue · **Tipo:** Conceptual

### 📝 Respuesta resumen
En un rolling update, Kubernetes reemplaza pods gradualmente: durante minutos (u horas, si el rollout se pausa) conviven réplicas N y N-1 sirviendo tráfico contra la misma BD, el mismo cache y los mismos topics. Y un rollback reintroduce N-1 después de que N haya escrito datos. Por eso todo contrato compartido —API interna, esquema de BD, formato serializado en cache/sesiones, mensajes en vuelo— debe ser compatible en ambas direcciones entre versiones consecutivas.

### 📖 Respuesta detallada
Con `maxSurge: 1, maxUnavailable: 0`, un Deployment de 10 réplicas pasa por estados intermedios con mezcla de versiones; un `Service` balancea entre todas sin distinguirlas. La ventana de convivencia no es teórica: rollouts pausados por probes, HPA escalando en medio del rollout, o un canary del 5% durante días. Y la dirección inversa importa igual: **rollback significa que N-1 volverá a ejecutarse sobre el estado que N dejó escrito**. La compatibilidad N/N-1 es por tanto bidireccional en los datos.

Superficies afectadas:

**1. API interna servicio-a-servicio.** Si el servicio A llama al B, y B despliega, A hablará con réplicas B:N y B:N-1 indistintamente (request a request, con retries cruzando versiones). Regla: B solo puede *añadir* campos opcionales en respuestas y aceptar requests viejos; A no puede depender de un campo nuevo de B hasta que el rollout de B esté completo y estable — en la práctica, una release después. Los retries agravan esto: un POST que falla en un pod N puede reintentarse contra un pod N-1.

**2. Esquema de BD.** Cubierto por expand/contract (pregunta 1): el esquema publicado debe funcionar con ambas versiones del ORM/queries. Caso traicionero: enums. Si N escribe `status = 'PARTIALLY_SHIPPED'` y N-1 tiene un `enum` Java sin ese valor, N-1 explota al *leer* filas que N escribió — el breaking change fue de datos, no de DDL. Mitigación: deserialización tolerante (valor desconocido → `UNKNOWN`) desplegada una versión *antes* de empezar a escribir el valor nuevo.

**3. Cache y sesiones serializadas.** Redis con sesiones u objetos cacheados: N cambia la clase serializada, N-1 lee esa entrada y falla la deserialización (o peor con serialización nativa de Java: `InvalidClassException` y usuarios deslogueados en masa durante el rollout). Mitigaciones concretas: serializar a JSON tolerante (`FAIL_ON_UNKNOWN_PROPERTIES=false` en Jackson) en vez de binario frágil; versionar la clave de cache cuando el formato cambia de verdad:

```java
// El bump de versión en la clave hace que N y N-1 usen entradas separadas:
// cache miss + recomputación en vez de error de deserialización.
String cacheKey = "product:v3:" + productId;
```

El coste es un cold cache parcial durante el rollout — casi siempre preferible a errores. Para sesiones, mejor aún: tokens autocontenidos o esquema de sesión estable y aditivo.

**4. Mensajes en vuelo.** Un mensaje encolado por N puede consumirlo un pod N-1 (colas competitivas con consumidores mixtos durante el rollout), y los mensajes retenidos de N-1 los leerá N. Mismas reglas forward/backward de la pregunta 4, pero aplicadas *dentro* del propio servicio — la gente lo olvida porque productor y consumidor son "el mismo código", justo hasta el minuto en que no lo son.

**Errores comunes:** probar solo "N contra N" en staging (la mezcla nunca se ejercita); asumir que `maxUnavailable: 100%` o un recreate te salva (te da downtime y no te salva del rollback sobre datos nuevos); olvidar los jobs/CronJobs, que pueden correr con la imagen vieja mientras el Deployment ya va por la nueva.

**Qué espera oír el entrevistador:** que enumere las cuatro superficies (API, BD, cache/sesión, mensajes), el argumento del rollback como N-1 obligatorio sobre datos de N, y al menos un mecanismo concreto por superficie (deserialización tolerante, claves de cache versionadas, enums con fallback).

## 7. [CASO] Vas a hacer un despliegue blue/green (y luego canary) de un servicio que incluye un cambio de esquema. ¿Cómo lo secuencias y qué NO se duplica?

**Categoría:** Despliegue · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Lo que no se duplica es la base de datos: blue y green comparten el mismo esquema y los mismos datos, así que blue/green no te exime de expand/contract — el esquema debe soportar ambas versiones igual que en un rolling update. Secuencia: aplicar la migración expand (compatible con blue) primero, levantar green contra el esquema ya migrado, validar, cortar tráfico, y solo ejecutar el contract cuando blue deja de ser el plan de rollback. En canary aplica lo mismo con convivencia aún más larga: el esquema y los datos deben ser forward-compatible durante toda la ventana del canary.

### 📖 Respuesta detallada
El malentendido clásico con blue/green: "tengo dos entornos completos, así que green puede llevar el esquema nuevo". Falso salvo que dupliques la base de datos — y duplicarla implica sincronización bidireccional de escrituras entre dos esquemas distintos durante el corte, un problema mucho más difícil que el que intentabas resolver (conflictos, lag, corte no atómico de clientes). En la práctica real, blue y green son dos versiones de la **aplicación** apuntando a **una** base de datos. Consecuencia directa: la compatibilidad de esquema N/N-1 es idéntica a la de un rolling deploy; blue/green solo cambia la forma del corte de tráfico, no el problema de datos.

**Secuenciación con blue/green:**

1. **Migración expand, antes de green.** Se aplica sobre la BD compartida mientras blue sirve el 100%. Por definición de expand, blue no se entera (columnas nuevas nullable, tablas nuevas, índices `CONCURRENTLY`). Este es el gate: si la migración no es invisible para blue, no está lista para ejecutarse en este modelo.
2. **Levantar green** con el código nuevo contra el esquema ya expandido. Smoke tests con tráfico sintético o espejado.
3. **Switch de tráfico** (weights del load balancer o `Service` selector). Punto crítico: aunque el corte de tráfico HTTP sea "instantáneo", blue sigue terminando requests en curso y sus consumidores de Kafka siguen procesando hasta el drain — hay convivencia real de minutos. Y los datos que green escribe deben poder leerlos blue, porque…
4. **…blue es el plan de rollback.** Si a las 2 horas del switch aparece un bug y vuelves a blue, blue leerá filas que green escribió (valores nuevos de enum, columnas nuevas pobladas, dual writes). El rollback barato es *la* ventaja de blue/green; la pierdes en el momento en que green escribe datos que blue no tolera.
5. **Contract en una release posterior**, cuando blue ya no es candidato a rollback (decisión explícita, con plazo, no "cuando nos acordemos").

**Con canary la ventana se estira.** Un canary al 5% durante tres días significa tres días de escrituras mezcladas de ambas versiones sobre las mismas tablas. Todo lo que el canary escribe debe ser legible por el 95% estable: **el esquema y los formatos de datos deben ser forward-compatible durante toda la ventana de análisis**. Ejemplo de configuración con Argo Rollouts:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
spec:
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: { duration: 24h }   # 24h de escrituras mixtas sobre la misma BD
        - setWeight: 50
        - pause: { duration: 2h }
        - analysis:
            templates: [{ templateName: error-rate-check }]
```

Detalle operativo: la migración de esquema **no** va acoplada al rollout del canary (un init container que migra en el pod canary es una carrera con el resto de réplicas). La migración corre como paso previo del pipeline — Job de Kubernetes o stage de CD — y el rollout del código solo empieza cuando `flyway migrate` terminó en verde.

**Errores comunes:** creer que green tiene "su" BD; ejecutar expand y contract en la misma ventana de blue/green porque "el switch fue bien" (mata el rollback); no drenar consumidores de colas de blue tras el corte (procesan con código viejo mucho después del "switch"); canaries que escriben formatos que la versión estable no lee, corrompiendo la experiencia del 95%.

**Qué espera oír el entrevistador:** la frase "la base de datos es compartida" dicha pronto y con seguridad, la secuencia expand → green → switch → (esperar) → contract, el argumento de blue-como-rollback leyendo datos de green, y la extensión natural al canary con su ventana larga de escrituras mixtas.

## 8. ¿Cuándo usarías feature flags en lugar de (o además de) versionar, y qué deuda generan?

**Categoría:** Estrategia de release · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los flags desacoplan deploy de release: el código llega a producción apagado y se activa gradualmente por porcentaje, tenant o usuario, con rollback en segundos y sin redeploy. Son el mecanismo natural para orquestar las fases de expand/contract (activar dual write, cambiar la lectura) y para cambios de comportamiento interno. No sustituyen a las versiones de API: un flag lo controlo yo globalmente; una versión la elige cada consumidor. Y son deuda técnica con intereses: cada flag es un branch en producción que hay que retirar con la misma disciplina que la fase contract.

### 📖 Respuesta detallada
**Deploy ≠ release.** Desplegar es mover binarios; release es exponer comportamiento. Los flags separan ambos: puedes desplegar el viernes con el flag apagado y hacer release el lunes al 1% de usuarios. Esto reduce el tamaño del blast radius y convierte el rollback de "revertir deploy" (minutos, arriesgado) a "apagar flag" (segundos, trivial). Para trunk-based development son casi obligatorios: el código incompleto se mergea apagado en vez de vivir semanas en una rama.

**Flags como orquestador de migraciones.** Las fases de las preguntas 1 y 3 se activan idealmente por flag, no por deploy:

```yaml
# config del servicio (config server / ConfigMap / LaunchDarkly)
orders:
  dual-write-enabled: true      # fase migrate: escribir en tabla vieja y nueva
  read-from-v2: false           # switch de lectura, activable por % de tráfico
  read-from-v2-rollout-percent: 0
```

```java
Order findOrder(String id) {
    if (flags.isEnabled("read-from-v2", context(id))) {
        return v2Repository.find(id);
    }
    return legacyRepository.find(id);
}
```

Ventaja decisiva: cada switch es independiente del ciclo de deploy y reversible al instante. Si el switch de lectura a v2 revela un bug de mapeo, lo apagas sin tocar el pipeline. El targeting por porcentaje/tenant convierte cualquier cambio interno en un canary sin necesitar infraestructura de canary a nivel de tráfico.

**Flags vs versiones de API — la distinción que hay que articular.** Una versión de API es un contrato que el **consumidor** elige (`/v2/orders`, header de versión): coexisten indefinidamente y la migración la decide el cliente. Un flag es un interruptor que el **proveedor** controla: el consumidor no elige y en general ni sabe que existe. Por eso los flags sirven para cambios que deben ser transparentes (misma respuesta, distinta implementación) y las versiones para cambios de contrato visible. El antipatrón: exponer un flag como sustituto de versionar un breaking change de API — acabas con un contrato cuya forma cambia bajo los pies del cliente según un toggle que no controla. Sí es legítimo usar un flag *internamente* para encender la ruta de código de la v2 de la API de forma gradual.

**La deuda.** Cada flag duplica caminos de ejecución: con n flags interactuando hay hasta 2^n combinaciones, y solo pruebas un puñado. Flags viejos son código muerto disfrazado de opcionalidad; el incidente de Knight Capital (2012, 460M$) involucró código viejo reactivado por la reutilización de un flag. Prácticas mínimas de higiene: distinguir flags de release (vida corta, se retiran tras el rollout — son la analogía exacta de la fase contract) de flags operacionales/kill-switches (vida larga, documentados); fecha de expiración y owner en cada flag al crearlo; alerta o lint cuando un flag de release supera los 30–90 días; y retirar el flag *y* el código del camino viejo, no solo dejarlo hardcodeado a `true`.

**Errores comunes:** evaluar el flag en múltiples puntos del código con posible inconsistencia dentro de una misma request (evalúa una vez por request y propaga la decisión); flags que dependen de un servicio externo de flags sin default seguro cuando ese servicio cae; usar flags para variantes de negocio permanentes (eso es configuración por tenant, otro ciclo de vida y otro tratamiento).

**Qué espera oír el entrevistador:** deploy vs release como concepto central, flags orquestando dual write/switch de lectura con rollback instantáneo, la frontera nítida flag-del-proveedor vs versión-del-consumidor, y un plan explícito de retirada de flags — mencionar Knight Capital o el problema 2^n señala experiencia real con la deuda.

## 9. ¿Cómo funcionan los consumer-driven contracts con Pact en CI y qué detectan que los tests E2E no?

**Categoría:** Testing de contratos · **Tipo:** Conceptual

### 📝 Respuesta resumen
En Pact, cada consumidor define en sus tests las interacciones que realmente usa (request esperado, campos de la respuesta que necesita); eso genera un pact que se publica en el Pact Broker; el provider lo verifica en su CI contra su implementación real, y `can-i-deploy` bloquea despliegues incompatibles consultando la matriz de verificaciones. Detecta breaking changes por consumidor concreto, antes del deploy, sin levantar entornos integrados. No cubre semántica de negocio, performance ni el comportamiento en runtime — es complemento, no sustituto, de otros tests.

### 📖 Respuesta detallada
**El flujo completo.** (1) El test del consumidor arranca un mock de Pact y declara la interacción: "cuando pido `GET /orders/42` espero 200 con `status` string y `total_cents` number". El test ejercita el cliente HTTP real del consumidor contra ese mock y, si pasa, se serializa un archivo pact (JSON) con esas expectativas. (2) El pact se publica en el **Pact Broker** (o Pactflow) etiquetado con versión y rama del consumidor. (3) El CI del provider descarga los pacts de todos sus consumidores y los **verifica** contra el servicio real levantado localmente, usando *provider states* ("given: existe el pedido 42") para preparar datos. El resultado de cada verificación vuelve al broker. (4) Antes de desplegar, `can-i-deploy` consulta la matriz:

```bash
pact-broker can-i-deploy \
  --pacticipant order-service --version $GIT_SHA \
  --to-environment production
# Falla el pipeline si alguna verificación contra los consumidores
# desplegados en production está roja o pendiente
```

Y el broker dispara webhooks: cuando un consumidor publica un pact cambiado, se lanza automáticamente la verificación del provider — el feedback llega en minutos, no en la siguiente regresión E2E.

**Qué detecta que los E2E no.** Primero, la **atribución por consumidor**: un E2E te dice "algo se rompió"; Pact te dice "eliminar `legacy_id` rompe exactamente a `billing-service` versión 3.2, y a nadie más". Eso convierte la pregunta "¿puedo borrar este campo?" de arqueología en una query al broker. Segundo, la dirección *consumer-driven* documenta qué partes de la respuesta se usan de verdad: los campos que ningún pact menciona son candidatos seguros a eliminación (el problema inverso — saber qué es seguro cambiar — que los E2E jamás responden). Tercero, el momento: la incompatibilidad se detecta en el CI del provider antes de mergear, con consumidor y provider probados de forma independiente, sin el entorno integrado compartido que hace a los E2E lentos, frágiles y con datos de prueba en descomposición. Cuarto, cubre versiones desplegadas, no solo HEAD: `can-i-deploy --to-environment production` verifica contra lo que *está* en producción, que es contra lo que convivirás durante el rollout.

**Límites, que hay que decir sin que pregunten.** Pact valida forma y presencia, no **semántica**: si `total_cents` pasa de incluir a excluir impuestos, el contrato sigue verde y facturación factura mal. No cubre **performance** ni resiliencia (timeouts, degradación bajo carga). No cubre flujos de negocio multi-paso extremo a extremo. Y tiene coste organizativo real: los provider states requieren mantenimiento, y si los consumidores escriben pacts sobre-específicos (aserciones sobre valores exactos en vez de matchers de tipo), el provider no puede cambiar nada sin romper contratos — el broker se convierte en fricción en lugar de red de seguridad.

**Spring Cloud Contract** es la alternativa provider-driven del ecosistema Spring: el contrato se define en el repo del **provider** (Groovy/YAML), y de él se generan tests para el provider y stubs (vía stub runner/WireMock) que los consumidores usan en sus tests. Encaja mejor cuando el provider tiene muchos consumidores homogéneos o públicos y quiere un contrato canónico; pierde la propiedad clave de Pact de saber qué usa cada consumidor concreto.

**Errores comunes:** tratar los pacts como specs completas de la API (solo cubren lo que los consumidores declaran); saltarse `can-i-deploy` y usar Pact "informativamente" (entonces no bloquea nada y muere por abandono); provider states acoplados a datos frágiles de una BD compartida de test.

**Qué espera oír el entrevistador:** el ciclo consumidor→broker→verificación→can-i-deploy con webhooks, el argumento de atribución por consumidor y del "qué es seguro eliminar", los límites de semántica/performance dichos proactivamente, y el contraste con Spring Cloud Contract (consumer-driven vs provider-driven).

## 10. ¿Cómo versionas imágenes de contenedor y artefactos para que los despliegues sean reproducibles?

**Categoría:** Artefactos y build · **Tipo:** Conceptual

### 📝 Respuesta resumen
Tags inmutables siempre: la imagen se etiqueta con SemVer y/o SHA de commit, nunca se re-publica un tag existente, y `:latest` en producción es un antipatrón porque hace irreproducible el deploy y el rollback. Para garantía total se despliega por digest SHA256. Las librerías internas compartidas siguen SemVer disciplinado, gobernadas con un BOM en Maven o lockfiles en npm. Y el mismo artefacto construido una vez se promueve entre entornos — build once, deploy many — en lugar de reconstruir por entorno.

### 📖 Respuesta detallada
**Tags mutables: por qué `:latest` (y `:v2` re-publicado) rompe producción.** Un tag es un puntero mutable; `myapp:latest` hoy y mañana pueden ser bytes distintos. Consecuencias concretas: un pod que crashea y se reprograma en otro nodo hace pull de una imagen distinta a la de sus réplicas (con `imagePullPolicy: Always`, o `IfNotPresent` con caches de nodo divergentes — ambos modos fallan de forma distinta); "rollback" a `:latest` no significa nada; y el incidente es inauditable porque nadie sabe qué corría. Lo mismo aplica a re-taggear `:1.4.2` con otra build "porque era un hotfix pequeño": el tag dice lo mismo, el contenido no. Regla: tags **inmutables** (los registries serios lo imponen: ECR con `imageTagMutability: IMMUTABLE`, GitLab/Harbor con reglas equivalentes) con esquema `1.4.2` y/o `1.4.2-a1b2c3d` (SemVer + git SHA), de modo que de cualquier imagen en producción se llega al commit exacto.

**Digests: la inmutabilidad criptográfica.** El digest identifica el contenido, no un puntero:

```yaml
# El tag es para humanos; el digest es la garantía
image: registry.internal/orders-service@sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

Pinnear por digest elimina toda ambigüedad (y es prerrequisito para verificación de firmas con cosign/sigstore en supply-chain security). El coste es legibilidad; la práctica común es que el pipeline de CD resuelva tag→digest en el momento de la promoción y despliegue el digest. Igual de importante: pinnear la imagen **base** del Dockerfile, porque `FROM eclipse-temurin:21-jre` es un tag mutable que cambia debajo de ti:

```dockerfile
FROM eclipse-temurin:21-jre@sha256:1a94d... # base reproducible
COPY target/orders-service.jar /app/app.jar
ENTRYPOINT ["java","-jar","/app/app.jar"]
```

**SemVer en librerías internas.** Una librería compartida (`commons-events`, clientes generados) rompe a sus consumidores igual que una API: MAJOR para breaking, MINOR aditivo, PATCH para fixes — y el breaking real es contra el contrato observable, no contra tu intención (ley de Hyrum). En Maven, un **BOM** centraliza el conjunto de versiones compatibles que cada servicio importa (`<scope>import</scope>` en `dependencyManagement`), evitando la matriz de "el servicio A usa commons 2.1 y B usa 3.0 y ambos dependen transitivamente de C". En npm, los ranges (`^1.2.0`) delegan en SemVer ajeno — imprescindible commitear el lockfile (`package-lock.json`) para que dos builds del mismo commit resuelvan idéntico; para librerías internas críticas, versiones exactas o un catálogo tipo syncpack/changesets. Nunca `-SNAPSHOT` ni ranges abiertos en un artefacto que se promociona: la resolución cambia con el tiempo y mata la reproducibilidad.

**Build once, deploy many.** El artefacto se construye **una vez** en CI, se publica al registry, y ese mismo digest se promueve dev→staging→prod (retag/copia de registry o metadata de promoción, sin rebuild). Reconstruir por entorno invalida lo probado: distinta base image resuelta, distintas dependencias transitivas, distinto timestamp — lo que llega a prod no es lo que pasó staging. Corolario: la configuración por entorno vive **fuera** de la imagen (env vars, ConfigMaps, config server), porque hornearla dentro obliga a rebuilds por entorno.

**Errores comunes:** `:latest` en manifests de prod "temporalmente"; hotfix re-publicando un tag existente; `SNAPSHOT`s de Maven desplegados a producción; imagen base sin pinnear que introduce un CVE o un cambio de glibc un martes cualquiera; pipeline que rebuildea en la promoción a prod.

**Qué espera oír el entrevistador:** tags inmutables con trazabilidad al commit, digests como garantía fuerte (y para la base image), BOM/lockfiles para el grafo de dependencias internas, y build-once-deploy-many enunciado como principio con su corolario de config externalizada.

## 11. Monorepo vs multirepo: ¿cómo cambia el versionado de servicios y librerías internas en cada modelo?

**Categoría:** Organización de código · **Tipo:** Conceptual

### 📝 Respuesta resumen
En multirepo cada servicio y librería versiona y publica de forma independiente: contratos explícitos, SemVer y consumidores que actualizan a su ritmo — con el coste de la matriz de versiones y librerías internas eternamente desactualizadas. En monorepo todo vive en HEAD: un commit puede cambiar librería y todos sus consumidores a la vez, sin publicar versiones intermedias, con tooling (Nx, Bazel, Gradle) que construye solo lo afectado. Pero el "cambio atómico" es un mito en runtime: el deploy nunca es atómico, así que la compatibilidad N/N-1 en las fronteras de red sigue siendo obligatoria en ambos modelos.

### 📖 Respuesta detallada
**Multirepo: versiones como frontera.** Cada repo publica artefactos versionados (jars al Nexus/Artifactory, paquetes npm, imágenes). Un cambio en `commons-auth` sigue el ciclo: PR → release 2.4.0 → cada consumidor sube la dependencia cuando quiere/puede. Ventajas: ownership nítido, el consumidor controla cuándo absorber cambios, CI pequeño y rápido por repo. Costes reales: la **matriz de versiones** (20 servicios usando 6 versiones distintas de la librería, y el fix de seguridad hay que backportearlo o perseguir 20 upgrades); el cambio cross-cutting (renombrar un campo del contrato compartido) requiere una danza de N PRs coordinados con releases intermedias backward-compatible; y el descubrimiento tardío — el consumidor que no actualiza en meses descubre 5 breaking changes acumulados de golpe. Herramientas como Renovate/Dependabot automatizan los PRs de upgrade y son casi obligatorias para que el modelo no degenere.

**Monorepo: HEAD como única versión.** Las librerías internas no se publican: se consumen por path/target en el mismo árbol de código. Un solo commit cambia la firma de `commons-auth` **y** sus 20 consumidores, con el CI validando todo junto — desaparecen la publicación intermedia, la matriz de versiones y el drift. El precio se paga en tooling: a partir de cierto tamaño necesitas grafo de dependencias y builds incrementales — **Nx** (`nx affected` construye/testea solo lo alcanzable desde el diff, con cache remota), **Bazel** (grafo explícito por target, cache y ejecución remota hermética, el modelo Google), o **Gradle** multi-proyecto/composite builds con build cache en la JVM. También necesitas CODEOWNERS y merge queues, porque cientos de personas en un repo colisionan. Nota: monorepo no implica versionado en HEAD para lo *externo* — librerías publicadas a terceros siguen necesitando SemVer aunque vivan en el monorepo (changesets, release-please).

**El mito del cambio atómico.** El commit es atómico; **el deploy no lo es nunca**. Si un commit del monorepo cambia el contrato entre `orders-service` y `billing-service`, ambos se desplegarán en momentos distintos (pipelines distintos, aprobaciones, un rollback independiente), y durante esa ventana la versión nueva de uno habla con la vieja del otro — exactamente el problema N/N-1 de la pregunta 6. El monorepo da atomicidad de *compilación y test* dentro del proceso, lo cual es valiosísimo para librerías linkadas; no da atomicidad en ninguna frontera de **red** (API, mensajes, BD). El error señalado: equipos que migran a monorepo y empiezan a hacer breaking changes de API "en un solo commit", rompiendo producción en cada ventana de despliegue. La disciplina expand/contract y los contract tests (pregunta 9) son igual de necesarios; el monorepo solo elimina la coordinación de *publicación*, no la de *despliegue*.

**Cómo decidir.** Señales pro-monorepo: mucho código compartido de evolución rápida, equipos que pisan los mismos contratos, dolor real de matriz de versiones. Señales pro-multirepo: equipos muy autónomos con contratos estables, límites de compliance/acceso por repo, o falta de capacidad para invertir en tooling de monorepo (un monorepo sin Nx/Bazel/cache a cierta escala es un CI de horas y merges en cola — lo peor de ambos mundos).

**Errores comunes:** monorepo sin builds incrementales ni cache; multirepo con una librería "commons" gigante que cambia a diario (el peor artefacto en el peor modelo); confundir monorepo con monolito de despliegue; asumir que el commit atómico exime de compatibilidad en runtime.

**Qué espera oír el entrevistador:** el contraste versiones-publicadas vs HEAD, herramientas concretas con su porqué (affected/cache en Nx, hermeticidad en Bazel), y sobre todo la demolición argumentada del mito del cambio atómico: la frase "el deploy nunca es atómico, N/N-1 sigue aplicando" es la que separa el nivel senior.

## 12. [CASO] Tu plataforma interna debe retirar una API usada por 15 equipos. "Que todos migren el mismo sprint" ha fracasado dos veces. Diseña el proceso de coordinación del breaking change

**Categoría:** Organización y procesos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
"Todos migran a la vez" no escala porque exige alinear las prioridades de 15 equipos en la misma ventana — la probabilidad de que ninguno tenga un incendio ese sprint es ~cero, y un solo rezagado bloquea a todos. El proceso que funciona: RFC con feedback previo, versión nueva disponible antes de deprecar la vieja, política de deprecación con ventana estándar, coexistencia de ambas versiones durante la migración (cada equipo migra en su propio ciclo), telemetría de adopción por consumidor, migración asistida (guías, codemods, soporte del equipo plataforma), y escalado gradual al final para los rezagados.

### 📖 Respuesta detallada
**Por qué el big-bang fracasa estructuralmente.** Coordinar N equipos en una ventana requiere que las N planificaciones cedan a la vez; con 15 equipos siempre hay uno con un incidente, un lanzamiento o una baja. Y el modelo acopla: si uno no llega, o se rompe a ese equipo o se replanifica para todos — y cada replanificación erosiona la credibilidad de la siguiente fecha (que es exactamente lo que ya pasó dos veces). La solución no es "coordinar mejor": es **eliminar la necesidad de simultaneidad** haciendo coexistir v1 y v2 y dejando que cada equipo migre dentro de una ventana amplia en su propio ciclo de planificación.

**El proceso, por fases:**

1. **RFC antes de construir.** Documento con motivación, diseño de la v2, guía de migración borrador y fecha tentativa de EOL, circulado a los 15 equipos con periodo de comentarios. Doble función: mejora el diseño con casos de uso que desconoces, y crea compromiso — un equipo que revisó el RFC no puede alegar sorpresa. Aquí se cazan los blockers reales ("usamos ese endpoint de una forma que v2 no cubre") cuando aún son baratos.

2. **Deprecation policy escrita y estándar**, no negociada por incidente: p. ej. "toda API interna deprecada se mantiene 2 ciclos de planificación (6 meses) desde que su reemplazo está GA; la deprecación se anuncia en el changelog, con `Deprecation`/`Sunset` headers en las respuestas y warning en los clientes generados". Una política uniforme convierte cada retirada en rutina en lugar de negociación.

3. **v2 GA + coexistencia.** El reloj de deprecación solo arranca cuando la v2 está completa, documentada y con guía de migración probada por un equipo piloto (elige de piloto a un equipo colaborador y representativo: su migración valida la guía y produce el ejemplo de referencia).

4. **Reducir el coste de migrar — incentivos en la dirección correcta.** El equipo plataforma asume trabajo para abaratar la migración: clientes generados donde el cambio es transparente, codemods o PRs semiautomáticos a los repos consumidores, oficina de soporte. Cada hora invertida aquí se multiplica por 15. La versión avanzada: si plataforma puede hacer el PR de migración mecánico para cada equipo y el equipo solo revisa y mergea, la adopción deja de depender de la priorización ajena.

5. **Telemetría de adopción, no encuestas.** Con autenticación por servicio (mTLS/OAuth client credentials), el dashboard muestra llamadas a v1 por equipo consumidor y su tendencia. La conversación cambia de "recordad migrar" a "quedan 3 equipos: A (400 rps), B (12 rps), C (un cron mensual)" — y con C hablas del cron concreto.

6. **Final con escalada gradual, no acantilado.** Al acercarse el EOL con rezagados: primero brownouts programados y anunciados (v1 responde 503 durante 5 minutos, luego una hora — los brownouts encuentran a los consumidores que la telemetría no identificó y hacen tangible la urgencia sin romper nada permanentemente), después degradación (latencia añadida, rate limits), y solo al final el apagado. La escalada a management es el último recurso, con datos: "este equipo bloquea la retirada; el coste de mantener v1 es X".

**Errores comunes:** deprecar sin que v2 esté completa (obliga a los consumidores a migrar dos veces); ventanas de cortesía que se extienden indefinidamente sin consecuencias (entrena a la organización a ignorar deprecaciones — la credibilidad de la política vale más que cualquier retirada individual); medir adopción por confirmaciones en Slack en vez de tráfico; tratar la migración como coste exclusivo de los consumidores cuando el beneficio es de plataforma.

**Qué espera oír el entrevistador:** el diagnóstico estructural de por qué el big-bang no escala (acoplamiento de planificaciones), coexistencia + ventana como alternativa, telemetría por consumidor, la inversión de plataforma para abaratar la migración, y brownouts como mecanismo de presión proporcional. Mencionar la asimetría de incentivos (quien migra no es quien se beneficia) demuestra madurez organizativa.

## 13. ¿Cómo versionas configuración e infraestructura (Terraform, config de aplicación) y por qué el pinning importa?

**Categoría:** Infraestructura y configuración · **Tipo:** Conceptual

### 📝 Respuesta resumen
La infraestructura se versiona como el código: módulos de Terraform publicados con SemVer y consumidos con constraints o refs de git tag, providers y versión de Terraform pinneados en cada root module, y state por entorno con backend remoto y locking. Los cambios se promueven dev→staging→prod subiendo la versión del módulo por entorno, nunca editando prod a mano. La configuración de aplicación también se versiona (repo de config con config server, o ConfigMaps gestionados por GitOps), porque un cambio de config rompe producción igual que un deploy — y necesita el mismo rollback trazable.

### 📖 Respuesta detallada
**Módulos versionados.** Un módulo compartido (`vpc`, `rds`, `eks-cluster`) es una librería: sus consumidores necesitan absorber cambios cuando eligen, no cuando el autor mergea. Dos mecanismos:

```hcl
# 1) Source git con ref a tag inmutable
module "vpc" {
  source = "git::https://github.internal/platform/terraform-aws-vpc.git?ref=v2.3.1"
  # nunca ?ref=main: main es un puntero mutable — el mismo plan
  # da resultados distintos según el día
}

# 2) Registry (privado o Terraform Cloud) con version constraints
module "rds" {
  source  = "app.terraform.io/acme/rds/aws"
  version = "~> 3.1"   # pessimistic constraint: acepta 3.1.x, no 3.2
}
```

Con SemVer del módulo: MAJOR cuando el cambio destruye/reemplaza recursos o cambia variables incompatiblemente, MINOR aditivo, PATCH para fixes. Un MAJOR de módulo merece guía de upgrade, porque "breaking" en Terraform puede significar `forces replacement` de una base de datos.

**Providers y binario pinneados.** Los providers introducen breaking changes y bugs; sin pinning, dos ejecuciones del mismo código usan providers distintos:

```hcl
terraform {
  required_version = "~> 1.9.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}
```

El `.terraform.lock.hcl` se commitea siempre: registra versiones exactas y hashes de los providers resueltos — es el lockfile de la infraestructura, mismo principio que `package-lock.json`. El **state** va en backend remoto (S3+DynamoDB lock, o Terraform Cloud) y por entorno: states separados (workspaces o roots distintos) para que un `apply` roto en staging no pueda tocar el state de prod. El state además está acoplado a la versión de Terraform que lo escribió (una versión nueva puede migrar el formato del state y complicar el retorno atrás) — otra razón para el pinning de `required_version` y para subir de versión de Terraform entorno a entorno.

**Promoción por entornos.** El antipatrón es un solo root con `count`/vars por entorno donde cada `apply` toca todo. El patrón: cada entorno es un root module que consume módulos versionados, y "promover" es un PR que sube `v2.3.0 → v2.3.1` primero en dev, luego staging, luego prod — con `terraform plan` como artefacto de revisión en cada paso. Así prod nunca estrena una versión de módulo, igual que build-once-deploy-many para imágenes.

**Configuración de aplicación.** Un cambio de config causa outages igual que un deploy, así que exige el mismo tratamiento: versionado, revisión y rollback. Opciones: **Spring Cloud Config Server** respaldado por git (cada cambio es un commit revisable; el rollback es `git revert`; se puede pinnear una app a un label/rama de config); **ConfigMaps** gestionados por GitOps (Argo CD/Flux) — nunca `kubectl edit` a mano, porque ese cambio no existe en ningún historial y la próxima sincronización lo pisa. Matiz importante con ConfigMaps: actualizar un ConfigMap no reinicia los pods que lo montan; el patrón es incluir un hash del contenido como annotation del pod template (o usar ConfigMaps inmutables con nombre versionado, `app-config-v14`), de modo que el cambio de config produzca un rollout observable y con rollback — un cambio de config invisible y aplicado "cuando el kubelet refresque" es lo contrario de un release controlado. Y la config de secretos sigue su propio canal (Vault, sealed-secrets, SOPS), versionada en referencia pero nunca en claro en git.

**Errores comunes:** `ref=main` en módulos; providers sin constraint que un día hacen `plan` con un MAJOR nuevo y proponen recrear medio stack; lockfile sin commitear; un solo state para todos los entornos; drift por cambios manuales en la consola que el siguiente `apply` revierte por sorpresa; tratar la config como "no es un deploy" y cambiarla en caliente sin trazabilidad.

**Qué espera oír el entrevistador:** módulos con tags/constraints SemVer y el porqué de la inmutabilidad de refs, pinning de provider + lockfile commiteado, states aislados por entorno con locking, promoción de versiones de módulo entorno a entorno, y el paralelismo explícito "un cambio de config es un release" con el detalle del hash/ConfigMap inmutable para hacerlo observable.

## 14. En event sourcing los eventos almacenados son inmutables y viven para siempre. ¿Cómo evolucionas sus esquemas?

**Categoría:** Event sourcing · **Tipo:** Conceptual

### 📝 Respuesta resumen
El event store es append-only: un evento persistido hace cinco años debe poder deserializarse hoy, así que el código actual carga con toda la historia de esquemas. Estrategias por orden de coste: weak schema (formato tolerante con defaults) para cambios aditivos; upcasters en la deserialización que transforman v1→v2→…→vN antes de llegar al dominio; versioned event types (un tipo nuevo de evento) para cambios semánticos; y copy-transform del event store como último recurso. Los snapshots, en cambio, son desechables: ante un cambio incompatible se invalidan y se regeneran desde los eventos.

### 📖 Respuesta detallada
La diferencia con una base de datos relacional es brutal: en la relacional migras los datos al esquema nuevo (`UPDATE` masivo) y el esquema viejo desaparece; en event sourcing **no hay UPDATE** — el log es la fuente de verdad y su inmutabilidad es la propiedad que da auditabilidad y replay. Reescribir eventos destruye esa garantía (y las firmas/hashes si los hay). Por tanto, la evolución ocurre en la **lectura**.

**1. Weak schema.** Serialización tolerante (JSON con defaults, Avro con esquema de lector, Protobuf con optional): campos nuevos con default al leer eventos viejos, campos eliminados se ignoran. Cubre la mayoría de cambios aditivos sin tocar nada más. Su límite: no puede expresar cambios de significado, solo de forma.

**2. Upcasters en la deserialización.** Una cadena de transformaciones puras que convierten la representación intermedia del evento viejo en la del nuevo, *antes* de materializar el objeto de dominio. El agregado y las proyecciones solo conocen la última versión — toda la arqueología queda confinada en la capa de serialización. En Axon Framework:

```java
public class OrderPlacedEvent_1to2 extends SingleEventUpcaster {
    private static final SimpleSerializedType TARGET =
        new SimpleSerializedType("com.acme.OrderPlacedEvent", "1");

    @Override
    protected boolean canUpcast(IntermediateEventRepresentation ir) {
        return ir.getType().equals(TARGET);
    }

    @Override
    protected IntermediateEventRepresentation doUpcast(IntermediateEventRepresentation ir) {
        return ir.upcastPayload(
            new SimpleSerializedType(TARGET.getName(), "2"),
            JsonNode.class,
            json -> {
                // v1 tenía "amount" en euros float; v2 usa "amountCents" long
                ((ObjectNode) json).put("amountCents",
                    Math.round(json.get("amount").asDouble() * 100));
                ((ObjectNode) json).remove("amount");
                return json;
            });
    }
}
```

Los upcasters se encadenan (v1→v2→v3): cada versión nueva añade un eslabón y ninguno se borra mientras existan eventos antiguos — es deuda permanente y asumida. Deben ser funciones puras y estar cubiertos por tests con fixtures de eventos reales serializados de cada versión histórica (un upcaster con bug corrompe silenciosamente cada replay).

**3. Versioned event types.** Cuando el cambio es semántico (el evento v2 representa un hecho distinto o necesita datos que v1 no tiene), upcastear es mentir: se crea un tipo nuevo (`OrderPlacedV2` o mejor un nombre que capture el nuevo significado) y los handlers/proyecciones manejan ambos. Más ruido en el dominio, pero honesto: no inventas datos que el hecho original no registró.

**4. Copy-transform del event store.** Último recurso, cuando la cadena de upcasters se ha vuelto inmantenible o hay que expurgar datos (p. ej. GDPR, aunque para PII la alternativa habitual es crypto-shredding: cifrar los datos personales por sujeto y destruir la clave, sin tocar el log). Se crea un store nuevo aplicando las transformaciones a todo el histórico, con doble escritura durante la copia y un switch controlado — operacionalmente es la migración de la pregunta 3 aplicada al event store, con un agravante: los consumidores posicionados por número de secuencia/offset pueden perder su posición si la transformación altera el conteo de eventos. Es un proyecto, no una tarea.

**Snapshots.** Un snapshot es solo una optimización: estado del agregado cacheado en la secuencia k para no reproducir k eventos. Como es *derivado*, su versionado puede ser brutal y simple: cada snapshot lleva la versión del esquema del agregado, y si no coincide con la actual se descarta y se reconstruye por replay. Nunca migres snapshots con upcasters — regenéralos; su gracia es ser desechables. Único cuidado: invalidar todos los snapshots de agregados con streams enormes a la vez causa un pico de latencia de rehidratación; se regeneran perezosa o progresivamente.

**Errores comunes:** "arreglar" eventos históricos con UPDATE al store (rompe auditoría, hashes y a cualquier consumidor ya posicionado); lógica de compatibilidad esparcida por los handlers en vez de confinada en upcasters; upcasters sin tests con payloads históricos reales; tratar los snapshots como datos a migrar; y guardar PII en eventos sin crypto-shredding, descubriendo con GDPR que la inmutabilidad era un problema legal.

**Qué espera oír el entrevistador:** el principio "el log no se toca, la evolución vive en la lectura", la escalera de estrategias por coste (weak schema → upcasters → tipos nuevos → copy-transform), snapshots como derivado desechable, y las menciones de crypto-shredding y de testear upcasters contra fixtures históricas como señales de haberlo operado de verdad.
