# Módulo 4 · Arquitecturas event-driven: del patrón al sistema

> **Curso 10 · Mensajería y streaming** · 150 min · Requiere [curso 00 módulo 3](../00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md) y [Módulo 2](02-kafka-por-dentro.md)

## Por qué esto importa en la entrevista

Ya sabes hacer outbox, dedupe, sagas y DLQ (curso 00) y conoces Kafka por dentro (módulo 2). Ese es el nivel *patrón*. Este módulo es el nivel *sistema*: cuando el entrevistador dice "diseña la plataforma de pedidos de un marketplace con 15 equipos", la pregunta real es:

- ¿Qué **pones dentro** del evento y qué pasa aguas abajo con esa decisión dos años después?
- ¿Cómo **evolucionas un esquema** con 12 consumidores vivos que no controlas y no puedes parar?
- ¿Cuándo CQRS/event sourcing **te salvan** y cuándo son un monolito distribuido con extra pasos?
- ¿Cómo respondes "¿dónde está el pedido 123?" cuando el flujo cruza 6 servicios por eventos?

Un mid responde con nombres de patrones. Un senior responde con **consecuencias**: acoplamiento, coste de replay, gobernanza entre equipos, y sabe decir "aquí eventos no; aquí una llamada síncrona y a dormir tranquilo". Ese criterio es lo que se evalúa.

## Los tres estilos de eventos (mismo dominio, tres sistemas distintos)

La palabra "evento" esconde tres diseños con consecuencias radicalmente diferentes. Vamos a modelar **el mismo hecho** — "el pedido A-123 fue pagado" — de las tres formas.

### 1. Event notification: "pasó algo, pregunta si te interesa"

```json
{
  "event_id": "9f1c...",
  "type": "pedido.pagado",
  "occurred_at": "2026-08-28T14:02:11Z",
  "data": { "pedido_id": "A-123" }
}
```

El evento es un **timbre**. El consumidor que quiera detalles hace `GET /pedidos/A-123` al servicio de pedidos.

- **Pro:** payload mínimo, nunca envías datos desactualizados, el productor no promete casi nada (contrato pequeño = evolución fácil).
- **Contra:** cada evento genera una **tormenta de callbacks** — N consumidores × 1 GET — y reintroduce acoplamiento temporal: si Pedidos está caído, nadie procesa. Además el GET devuelve el estado *actual*, no el del momento del evento: si el pedido ya se canceló cuando Facturación pregunta, ve un mundo distinto al que disparó el evento (**race de lectura**).

### 2. Event-carried state transfer: "pasó algo, y aquí va todo lo que necesitas"

```json
{
  "event_id": "9f1c...",
  "type": "pedido.pagado",
  "version": 3,
  "occurred_at": "2026-08-28T14:02:11Z",
  "data": {
    "pedido_id": "A-123",
    "cliente": { "id": "C-9", "segmento": "premium" },
    "lineas": [ { "sku": "X1", "cantidad": 2, "precio_unit": 45.00 } ],
    "total": 90.00,
    "moneda": "PEN",
    "metodo_pago": "tarjeta",
    "estado": "PAGADO"
  }
}
```

El consumidor guarda su **réplica local** de lo que le importa y nunca vuelve a preguntar.

- **Pro:** autonomía real — Facturación factura aunque Pedidos esté caído; cero tormenta de GETs; cada consumidor lee su copia local.
- **Contra:** el contrato es **gordo** y cada campo publicado es un campo que ya no puedes quitar (ver gobernanza). Datos duplicados por todo el sistema, eventualmente consistentes. Y la trampa clásica: eventos aplicados fuera de orden corrompen la réplica → la `version` monótona del agregado y `UPDATE ... WHERE version < :nueva` aquí son obligatorios, no opcionales.

### 3. Event sourcing: "los eventos SON el estado"

Aquí cambia todo: los dos estilos anteriores son **eventos como integración** (la BD del servicio sigue siendo la fuente de verdad; el evento es un subproducto vía outbox). En event sourcing **no hay tabla `pedidos`**: hay un stream de eventos por agregado, y el estado se calcula plegándolos (fold):

```
stream pedido-A-123:
  seq 1  PedidoCreado      { lineas: [...], total: 90.00 }
  seq 2  PagoAutorizado    { metodo: "tarjeta", auth_ref: "au_7x" }
  seq 3  PedidoPagado      { pagado_en: "...", total_cobrado: 90.00 }

estado_actual = fold(aplicar, estado_vacio, eventos)   // "PAGADO, 90.00, ..."
```

Escribir = leer el stream, validar el comando contra el estado plegado, hacer append del evento nuevo con **concurrencia optimista** (`expected_seq = 3`; si otro escribió antes, reintenta el comando).

- **Pro:** auditoría perfecta gratis, debugging con viaje en el tiempo ("¿qué sabía el sistema a las 14:02?"), vistas nuevas derivables de datos históricos.
- **Contra:** el estilo más caro de operar (snapshots, upcasters, GDPR, reproyecciones — sección propia más abajo), y **los eventos internos del stream NO son tu contrato público** (ver inner/outer). Confundirlos es el error más común del entusiasta de event sourcing.

### Tabla de consecuencias (esto es lo que el entrevistador quiere oír)

```
                        Notification   Carried state    Event sourcing
Contrato del productor  mínimo         gordo            interno gordo + público aparte
Autonomía consumidor    baja (GET)     alta             alta
Carga sobre productor   alta (N GETs)  solo publicar    solo publicar
Estado histórico        se pierde      foto por evento  completo, reproducible
Coste de evolución      bajo           medio            alto (upcasters de por vida)
Coste operacional       bajo           medio            alto
Cuándo                  pocos consumi- integración      auditoría/legal, dominios
                        dores, dato    entre equipos,   donde el "cómo llegamos
                        muy volátil    read replicas    aquí" ES el negocio
```

Respuesta senior tipo: *"por defecto event-carried state para integración entre equipos, notification para señales de bajo valor con un consumidor, y event sourcing solo en el agregado donde el histórico es requisito de negocio — no en todo el sistema"*.

## Diseño de eventos: las decisiones que pagas durante años

### Hechos, no comandos; pasado, no imperativo

Un evento es **un hecho inmutable en pasado**: `PedidoPagado`, `StockReservado`. `EnviarEmailBienvenida` en un topic es un **comando disfrazado** — destinatario concreto, intención sobre el futuro. Los comandos van en colas punto a punto (o llamadas) con dueño claro; los eventos, en topics con N consumidores desconocidos. Un evento con un solo consumidor "obligado" es acoplamiento con sombrero de desacoplamiento (más en anti-patrones).

### Granularidad: evento gordo vs fino

- **Fino** (`DireccionEnvioCambiada`, `CuponAplicado`): máxima expresividad, cada consumidor reacciona a lo que le importa; pero quien necesita la foto completa debe plegar N tipos, y añades tipos constantemente (contrato ancho en número de tipos).
- **Gordo** (`PedidoActualizado` con el snapshot entero): consumidores triviales (upsert y listo); pero pierdes el *porqué* — "¿cambió la dirección o el cupón?" obliga a *diffear* snapshots — y todos despiertan con cada cambio aunque no les afecte.

Heurística senior: **granularidad = lenguaje del dominio**, no de las tablas. Si negocio dice "se pagó el pedido", el evento es `PedidoPagado`, no `FilaPedidoActualizada`. Patrón práctico muy defendible: eventos finos con nombre de negocio que **llevan además el snapshot resultante** (`data` = qué pasó, `state` = cómo quedó). Pagas bytes, compras consumidores simples sin perder semántica.

### Qué va en el payload

- **Lo que el productor puede prometer a largo plazo.** Cada campo publicado es una API. Si dudas de un campo, fuera.
- **Datos al momento del hecho**, no referencias que se resolverán "luego": el precio cobrado, no el `precio_id` (el precio de catálogo cambiará; el cobrado, no).
- **Ids de otras entidades, no sus objetos completos**, salvo la proyección mínima que el dominio necesita (en el ejemplo: `cliente.segmento` porque pricing lo usa; no el perfil entero del cliente — eso sería acoplar el esquema de Clientes a todos los consumidores de Pedidos).

### El sobre estándar (envelope)

Todo evento de la plataforma lleva los mismos metadatos, separados del payload de dominio:

```json
{
  "event_id": "0191c8a2-7c3e-7d90-b1f2-3ce8a1b2c3d4",
  "event_type": "pedido.pagado",
  "schema_version": 3,
  "occurred_at": "2026-08-28T14:02:11Z",
  "source": "servicio-pedidos",
  "subject": "A-123",
  "correlation_id": "req-7781",
  "causation_id": "0191c8a2-6b1d-...",
  "data": { }
}
```

- `event_id`: UUIDv7 (ordenable por tiempo) — clave de dedupe universal.
- `occurred_at` (hecho de negocio) ≠ momento de publicación ≠ timestamp del broker. Las proyecciones y analítica ordenan por `occurred_at`; el retraso entre ambos es tu métrica de frescura.
- `correlation_id`: constante en todo el flujo (viene del request original) — es tu hilo para tracing.
- `causation_id`: el `event_id` del mensaje que causó este. `correlation` te da el *grafo completo* del flujo; `causation` te da las *aristas*. Con ambos reconstruyes "¿por qué se emitió esto?" en un incidente sin adivinar.
- `subject` + `schema_version`: clave de partición natural y versión del contrato (no del agregado).

El sobre se impone por plataforma (librería común + validación en CI), no por buena voluntad. CloudEvents estandariza exactamente esto; usarlo o clonarlo da igual, tener *uno solo* es lo importante.

### Eventos privados vs públicos (inner/outer)

El patrón que separa a quien ha vivido esto:

```
   ┌──────────────── Servicio Pedidos ────────────────┐
   │  eventos INTERNOS (finos, cambian a menudo,      │
   │  atados a mi modelo; en ES: el stream mismo)     │
   │        │                                         │
   │        ▼  traductor / ACL de salida              │
   │  eventos PÚBLICOS (contrato estable, versionado, │
   │  documentado, con SLA de compatibilidad)         │
   └──────────────────┬───────────────────────────────┘
                      ▼
              topic público  ──►  otros equipos
```

Los internos son tu implementación: refactorízalos cuando quieras. Los públicos son tu API: cada cambio es una negociación. Publicar los internos directamente ("total, ya están en Kafka") congela **tu modelo de dominio por consumidores que no conoces** — la versión event-driven de dar acceso de lectura a tu BD. El traductor de salida (un stream processor pequeño o el propio relay de outbox) es barato; recuperar la libertad de refactorizar después, no.

## Schema evolution en serio

En el curso 00 quedó la idea de "evolucionar esquemas con cuidado". Aquí está el mecanismo completo, porque en un sistema event-driven **el esquema del evento es la interfaz más acoplante que tienes**: no puedes desplegar productor y consumidores a la vez, y con retención larga o event sourcing, *los datos viejos nunca desaparecen*.

### Los tres contratos de compatibilidad

- **Backward:** consumidor **nuevo** lee datos **viejos**. Puedes añadir campos con default o quitar campos. Despliegue: **consumidores primero**. Default sensato cuando controlas mejor a los consumidores que la historia retenida.
- **Forward:** consumidor **viejo** lee datos **nuevos**. Puedes añadir campos (el viejo los ignora), quitar solo opcionales. Despliegue: **productores primero**. Útil cuando no coordinas a los consumidores de otros equipos.
- **Full:** ambas; solo añades/quitas campos opcionales con default. La única opción honesta para **topics públicos entre equipos** y para event sourcing ("datos viejos" = "para siempre").

El schema registry (módulo 2) es quien **hace cumplir** esto en el `POST` de registro del esquema: sin registry, la compatibilidad es una promesa verbal. Regla de plata: modo `FULL_TRANSITIVE` en topics públicos (compatible con *todas* las versiones históricas, no solo la última — con retención larga los consumidores nuevos leerán datos de hace dos años).

En Avro se ve así — v3 → v4 full-compatible:

```json
{ "name": "metodo_pago", "type": "string" }                          // v3
{ "name": "metodo_pago", "type": ["null","string"], "default": null },// v4: relajado con default
{ "name": "canal_venta", "type": "string", "default": "web" }         // v4: nuevo, con default
```

### Expand–contract aplicado a eventos

Los cambios *incompatibles* (renombrar campo, cambiar tipo, partir un campo) no se hacen nunca en un paso. El mismo expand–contract que usas en BD, con una fase extra porque hay historia retenida:

```
Objetivo: renombrar "total" (float) → "importe" {monto, moneda} en pedido.pagado

1. EXPAND     productor emite AMBOS: total (legacy) + importe (nuevo).
              Esquema sigue siendo compatible. Nadie se entera.
2. MIGRATE    consumidores migran a "importe" a su ritmo. Tú mides:
              ¿quién sigue leyendo "total"? (contract testing / consumer
              groups / encuesta en el catálogo de eventos).
3. DRAIN      espera a que la retención expire o los consumidores hayan
              re-consumido: mientras haya mensajes viejos legibles en el
              topic, "total" viejo sigue existiendo aunque dejes de emitirlo.
4. CONTRACT   deja de emitir "total"; márcalo deprecated en el esquema;
              elimínalo en la siguiente major cuando el registry confirme
              que ningún esquema histórico relevante lo requiere.
```

El paso 3 es el que olvida todo el mundo: en HTTP, cuando dejas de enviar un campo, desapareció; en un log retenido, **lo que emitiste sigue ahí** y un consumidor nuevo haciendo replay desde el offset 0 lo va a leer.

### Upcasters: la alternativa cuando la historia es eterna

En event sourcing (retención infinita) no puedes esperar al drain. La solución es el **upcaster**: una función pura en la ruta de deserialización que traduce eventos viejos al esquema actual al vuelo:

```
leer evento crudo (v1) ──► upcast v1→v2 ──► upcast v2→v3 ──► código de dominio
                             (cadena: cada versión solo conoce la siguiente)

fun upcast_v2_to_v3(e):
    e.data["importe"] = { "monto": e.data.pop("total"), "moneda": "PEN" }  // default histórico documentado
    e.schema_version = 3
    return e
```

El dominio solo conoce la última versión; los upcasters se acumulan de por vida (parte del coste real de event sourcing). Alternativa agresiva: **copy-transform** — reescribir el stream entero a uno nuevo ya migrado y mover los lectores. Válido para limpiezas mayores, pero rompe `event_id`s referenciados y exige coordinar el corte.

### ¿Versionar el tipo o el canal?

Tres estrategias cuando llega la major incompatible:

1. **Versión en el tipo** (`pedido.pagado.v2` conviviendo con `.v1` en el mismo topic): los consumidores filtran por tipo; el productor emite ambos durante la transición (double-publish, que debe salir del **mismo outbox** para no divergir). Simple, pero ensucia el topic.
2. **Versión en el canal** (`pedidos.pagado.v2` como topic nuevo): migración limpia, cada consumidor cambia cuando está listo, y el topic viejo muere con "cero consumidores" como prueba. La opción preferida para topics públicos. Coste: el orden entre v1 y v2 no está garantizado entre topics — por eso se corta por *productor* (desde el instante T, todo sale por v2), no por mezcla.
3. **Upcasting en el lado consumidor** con esquema único siempre-compatible: evita las majors por completo; es lo que hacen las plataformas maduras — las majors son tan caras que el diseño gira en torno a no necesitarlas.

### Migración con consumidores vivos, paso a paso (guion de entrevista)

*"Tienes `pedido.pagado` con 12 consumidores de 5 equipos y debes cambiar `total` de forma incompatible. No puedes parar nada."*

1. Registrar v-nueva en el registry en modo `FULL_TRANSITIVE` con expand (ambos campos). Si el registry la rechaza, el cambio no era el que creías.
2. Desplegar productor emitiendo ambos campos **desde el mismo outbox/transacción**.
3. Anunciar deprecation en el catálogo de eventos con fecha; los contract tests de los consumidores (ver gobernanza) empiezan a avisar en *sus* CI.
4. Medir adopción: dashboards de qué consumer groups corren versiones de esquema viejas (el deserializador lo reporta como métrica).
5. Cumplida la fecha + expirada la retención del topic, contract: dejar de emitir el campo viejo.
6. Caso especial replay: si alguien puede reprocesar desde offset 0 (o hay tiering a S3), el deserializador del consumidor conserva el upcaster aunque el productor ya no emita v-vieja. "Dejé de emitirlo" ≠ "nadie volverá a leerlo".

Mencionar el paso 6 sin que te lo pregunten es la diferencia entre estudiado y vivido.

## CQRS y proyecciones: separar el escribir del leer

CQRS = el modelo que **valida comandos** (write model, normalizado, consistente) y los modelos que **responden queries** (read models, desnormalizados, uno por caso de uso) son distintos y se sincronizan por eventos. No requiere event sourcing; la mayoría de CQRS del mundo real corre sobre una BD normal + outbox.

```
 comando ──► write model (BD del servicio) ──► outbox ──► topic
                                                            │
              ┌─────────────────────────────────────────────┼──────────────┐
              ▼                                             ▼              ▼
   proyección "mis pedidos"                     proyección búsqueda   proyección BI
   (Postgres desnormalizado,                    (Elasticsearch)       (warehouse)
    1 fila por pedido-vista)
```

### Proyecciones como cachés reconstruibles

El cambio mental clave: una proyección **no es una BD, es una caché derivada del log**. Consecuencias operativas:

- **Es descartable.** ¿Bug en el proyector que corrompió filas? No parcheas datos a mano: arreglas el código, `DROP`, y reconstruyes desde el log. Solo funciona si el proyector es **determinista** (nada de `now()` ni HTTP dentro del fold) e idempotente (upserts por clave + versión, no inserts).
- **Rebuild sin downtime = blue/green de proyecciones:** levantas la v2 con un consumer group nuevo desde el principio del log, esperas lag ~0, cambias el read path con un flag y borras la v1. Nadie se enteró.
- **Cada query difícil = una proyección más**, no un `JOIN` heroico. "Top clientes por segmento" no se calcula: se mantiene.

### Consistencia eventual en la UI: read-your-writes con versión

El problema famoso: el usuario paga, la UI redirige al listado, y la proyección aún no aplicó el evento → "tu pedido no existe". Soluciones en orden de preferencia:

1. **Versión en la respuesta del comando:** el write model responde `{pedido_id, version: 7}`. La UI pide `GET /pedidos?min_version=7`; la proyección sabe la última versión aplicada por agregado y **espera (long-poll corto) o responde 202** si va por detrás. Read-your-writes real con costes honestos.
2. **UI optimista:** pinta el resultado con los datos que ya tiene y reconcilia cuando la proyección alcanza. Ideal para UX, exige disciplina de frontend.
3. **Leer del write model solo el flujo post-comando** ("tu pedido A-123 está confirmado" sale de la respuesta del comando). El listado general sí es eventual — y casi siempre aceptable.

Lo que no es aceptable: "ponemos un `sleep(500)`". Eso es la versión distribuida de arreglar carreras con suerte.

### Cuándo CQRS es overkill

Con un solo modelo de lectura y un equipo, un `SELECT` con dos `JOIN`s no necesita un pipeline de proyección con su lag, su rebuild y su on-call: CQRS se paga con **una pieza móvil más por query pattern**. La señal de que sí lo necesitas: modelos de lectura que pelean entre sí (búsqueda facetada + listado transaccional + agregados BI sobre la misma tabla), o lecturas 100× las escrituras con shapes incompatibles. La respuesta senior incluye siempre el "cuándo no".

## Event sourcing operable (lo que falta en las charlas)

### Snapshots

Plegar 40.000 eventos para validar un comando no escala. **Snapshot** = foto materializada del estado cada N eventos (o por tamaño/tiempo):

```
cargar agregado = último snapshot (seq 39.000) + eventos 39.001..40.000
```

Los snapshots son **caché, no verdad**: se pueden borrar todos y regenerar; jamás se migran a mano (se invalidan cuando cambia la lógica del fold). Guardarlos versionados por "versión del fold" evita leer un snapshot calculado con lógica vieja.

### GDPR y el derecho al olvido: crypto-shredding

"Los eventos son inmutables" choca con "borra mis datos". La solución estándar es **crypto-shredding**: los campos personales de cada sujeto se cifran con una clave *por sujeto* guardada en un keystore aparte; olvidar = borrar la clave. Los eventos siguen en el log, íntegros para hashes y auditoría, pero los campos personales son ruido indescifrable:

```json
{ "event_type": "cliente.registrado",
  "data": {
    "cliente_id": "C-9",
    "pii": { "enc_key_id": "k-C-9", "blob": "aGVsbG8...==" },
    "segmento": "premium" }   // lo no-personal queda en claro y proyectable
}
```

Costes a decir en voz alta: gestionar miles de claves, re-proyectar las vistas tras el borrado (o leer PII solo vía el keystore), y decidir *en el diseño del evento* qué es PII — retrofitearlo es reescribir la historia. Alternativa pragmática sin event sourcing estricto: PII en una tabla mutable, y el evento lleva solo el id.

### Replays selectivos

Replay total (todo el log, todas las proyecciones) es la opción nuclear. En la práctica quieres replays **selectivos**, y eso se diseña:

- **Por proyección:** consumer group nuevo → solo esa vista se reconstruye.
- **Por rango temporal:** reprocesar desde el offset correspondiente a T (índice offset↔timestamp del broker) para reparar la ventana de un bug.
- **Por entidad:** releer solo el stream `pedido-A-123` (trivial en un event store por agregado; en Kafka requiere filtrar la partición).
- La **regla de oro del replay:** los efectos secundarios (emails, cobros, terceros) van detrás de un gate consciente del modo replay o aislados en consumidores separados de las proyecciones. Un replay que reenvía 200.000 emails es el incidente clásico — y una anécdota que los entrevistadores adoran escuchar bien resuelta.

### Por qué casi nadie lo necesita completo — y el híbrido real

Event sourcing total = upcasters de por vida + snapshots + crypto-shredding + disciplina de replay + un modelo mental caro para cada dev nuevo. Los sistemas maduros convergen en un **híbrido**:

- **Estado actual en BD relacional** como fuente de verdad operativa (el 90% de los agregados).
- **Outbox + eventos públicos carried-state** para integración.
- **Event sourcing solo en los agregados donde el histórico es el negocio:** ledger de pagos, pólizas, apuestas, historias clínicas.
- **El log de Kafka con retención larga como "event sourcing de los pobres"** para reconstruir proyecciones — sin asumir el coste de comandos validados contra streams.

Decir "usaría event sourcing en el ledger y CRUD+outbox en el resto" demuestra más seniority que defender el dogma en cualquier dirección.

## Coreografía vs orquestación a escala

El módulo de fundamentos dio la regla local (≤3 pasos → coreografía). A escala de sistema la pregunta cambia: **¿quién es dueño del proceso de negocio?**

```
COREOGRAFÍA                          ORQUESTACIÓN
pedidos ─► pago ─► stock ─► envío    ┌─── Orquestador "Fulfillment" ───┐
(cada uno reacciona al anterior)     │ máquina de estados persistida    │
                                     │ paso → comando → espera evento   │
el proceso "existe" solo como        └──────────────────────────────────┘
suma de suscripciones                el proceso es un artefacto con dueño
```

- **Coreografía escala en equipos, no en complejidad.** Añadir un consumidor no toca a nadie (gran virtud). Pero el flujo completo no está escrito en ningún sitio: vive en las suscripciones de N repos. Con 6+ pasos, ramas y timeouts, nadie sabe qué pasa si el paso 4 falla — lo descubres en producción. Y aparece el **ciclo accidental**: A reacciona a B que reacciona a A.
- **Orquestación concentra el conocimiento del proceso** — y su acoplamiento — en un componente con dueño, tests y visibilidad. Riesgo simétrico: el orquestador que acaba conociendo los internos de todos (god-service). El orquestador manda **comandos** y escucha **eventos**; en cuanto lee BDs ajenas, perdiste.
- **"¿Dónde está el pedido 123?"** es la pregunta que decide. En orquestación: `SELECT estado FROM sagas WHERE pedido_id='123'` — fin. En coreografía necesitas un **process tracker**: un consumidor pasivo que escucha todos los eventos del flujo y proyecta el estado del proceso (correlation_id como clave). Factible y a veces lo mejor — pero es un componente más, y en la entrevista debes ofrecerlo tú, no que te lo saquen.

### La tercera vía: el workflow engine

Temporal, Camunda/Zeebe, AWS Step Functions: el proceso se escribe como **código secuencial aparentemente normal** y el engine persiste el progreso, reintenta pasos, gestiona timers de días y sobrevive reinicios (durable execution — en Temporal, vía event sourcing del propio workflow y replay determinista):

```
workflow fulfillment(pedido):
    pago = activity(cobrar, pedido)           # reintentos/backoff declarativos
    try:
        activity(reservar_stock, pedido)
    except StockInsuficiente:
        activity(reembolsar, pago)            # compensación explícita, testeable
        return CANCELADO
    activity(programar_envio, pedido)
    await timer(days=30); activity(pedir_review, pedido)   # sí, 30 días
```

Frente a la saga artesanal: visibilidad de serie (UI con cada ejecución y su historial), timeouts por paso triviales, y la máquina de estados deja de ser tablas + ifs a mano. Costes: una pieza más de infraestructura, y la exigencia de **determinismo** en el código del workflow (versionar workflows en vuelo es su propio tema). Posición defendible: *"≤3 pasos lineales, coreografía; procesos serios con compensaciones y timers largos, workflow engine antes que saga a mano — el engine es la saga orquestada bien hecha"*.

## Gobernanza: eventos como producto entre equipos

A partir de ~5 equipos, el problema deja de ser técnico. Sin gobernanza, el sistema event-driven degenera en una BD compartida con extra latencia.

### Catálogo de eventos y AsyncAPI

Cada topic público se documenta con **AsyncAPI** (el OpenAPI de lo asíncrono) en el repo del productor, publicado a un catálogo central navegable (p. ej. EventCatalog, Backstage):

```yaml
asyncapi: 3.0.0
info: { title: Pedidos - eventos públicos, version: 3.1.0 }
channels:
  pedidos.pagado.v3:
    address: pedidos.pagado.v3
    messages:
      PedidoPagado:
        payload: { $ref: '#/components/schemas/PedidoPagadoV3' }  # Avro/JSON Schema
operations:
  onPedidoPagado:
    action: receive
    channel: { $ref: '#/channels/pedidos.pagado.v3' }
```

El catálogo responde las tres preguntas de descubrimiento: *¿existe ya un evento con lo que necesito?*, *¿quién lo emite y con qué SLA de compatibilidad?*, *¿quién lo consume?* (imprescindible para deprecar). Si se genera desde el registry + CI, se mantiene; si es un wiki manual, muere en tres meses.

### Ownership

- **Todo topic tiene exactamente un productor-dueño** (el servicio dueño del agregado). Dos servicios escribiendo `pedido.*` = ninguno es dueño del contrato.
- El dueño responde del esquema, la compatibilidad, la deprecación y la calidad del dato (un evento con `total: null` en producción es un bug del productor, no "problema del consumidor").
- Los consumidores se **registran** (aunque sea con ACLs + naming de consumer groups): consumidor anónimo = consumidor que no puedes avisar = deprecación imposible.

### Contract testing de eventos

El equivalente asíncrono de Pact HTTP, y la red que permite evolucionar sin miedo:

- **Lado consumidor:** cada consumidor declara en *su* repo qué campos usa de qué evento (el contrato es *lo que uso*, no *todo el esquema*) y lo publica a un broker de contratos.
- **Lado productor:** su CI verifica cada cambio de esquema contra **todos los contratos registrados**. Quitar `metodo_pago` rompe el build con "el equipo Fraude lo usa" — en CI, no en producción a las 3 a.m.
- El registry valida *forma* (tipos, defaults); el contract testing valida *uso real* (qué campos importan a quién). Se complementan: el primero es barato y automático, el segundo te dice a quién llamar.

## Anti-patrones con nombre

Nómbralos en la entrevista; demuestra cicatrices:

- **El monolito distribuido por eventos.** Cada acción del usuario dispara una cadena síncrona-en-espíritu de 8 eventos donde todos los servicios deben estar vivos y desplegarse coordinados. Test: *¿puedes desplegar un servicio solo, y sobrevive el sistema a que uno esté 1 h caído?* Si no, tienes un monolito con latencia de red y debugging distribuido — lo peor de ambos mundos.
- **La BD compartida disfrazada de topic.** CDC crudo de las tablas internas (`fila_pedido_updated` con las columnas de la tabla) publicado como "eventos". Todo consumidor queda acoplado al esquema físico: un `ALTER TABLE` rompe a media empresa. CDC es un *mecanismo* excelente (relay de outbox); el *contrato* deben ser eventos de dominio traducidos (inner/outer), nunca el binlog con sombrero.
- **El event sourcing como dogma.** "Todo el sistema será event sourced" → seis meses después el CRUD de configuración tiene upcasters y el onboarding dura semanas. El histórico perfecto del catálogo de países no le importa a nadie. Es una herramienta por-agregado, no una identidad arquitectónica.
- **Comandos disfrazados de eventos ("PleaseDoX").** `EnviarEmailBienvenida` en un topic "para desacoplar". Falso desacoplamiento: hay un destinatario obligado, pero ahora sin respuesta, sin timeout y sin saber si alguien lo hizo. Si necesitas que *alguien concreto haga algo*, es un comando: cola punto a punto o llamada, con dueño y resultado observable. Test del nombre: si no puedes escribirlo como hecho en pasado sin mentir, no es un evento.
- **(Bonus) El evento-agenda:** `PedidoPagado` cuyo payload incluye `siguiente_paso: "facturar"`. El productor dirigiendo el proceso desde dentro del evento = orquestación de contrabando sin orquestador: acoplamiento de coreografía con opacidad extra.

## Errores comunes que delatan a un no-senior

- Decir "publicamos eventos" sin poder responder cuál de los tres estilos y por qué — y qué GET-storm o qué contrato gordo aceptaron a cambio.
- Publicar los eventos internos (o el CDC de las tablas) como contrato público y descubrir el acoplamiento al primer refactor.
- No distinguir `occurred_at` del timestamp del broker, ni llevar `correlation_id`/`causation_id` — y por tanto no poder reconstruir un flujo en un incidente.
- Tratar la evolución de esquemas como "añado el campo y aviso por Slack": sin registry con modo de compatibilidad, sin expand–contract, sin plan para la historia retenida y los replays.
- Proponer CQRS/event sourcing para un CRUD con 100 usuarios — o negarlos en un ledger de pagos. El error es el mismo: no razonar el coste.
- Proyecciones "reconstruibles" con efectos secundarios dentro del proyector: el primer replay manda 200.000 emails.
- Coreografía de 8 pasos sin process tracker: nadie sabe dónde está el pedido 123 hasta que un cliente llama.
- Cero gobernanza: sin catálogo, sin dueño por topic, sin contract tests — y deprecar un campo requiere arqueología y valor.

## 🧪 Laboratorio — mini-plataforma event-driven de 3 servicios

Con Docker Compose (Kafka + Schema Registry + Postgres). Tres servicios pequeños en el lenguaje que quieras: **pedidos** (write model + outbox), **facturacion** (participante de la saga) y **vista-pedidos** (proyección CQRS + API de lectura).

1. **Base:** `pedidos` expone `POST /pedidos` y `POST /pedidos/{id}/pagar`; escribe agregado + evento `pedido.pagado.v1` (event-carried state, sobre estándar con `correlation_id`/`causation_id`) en su outbox; un relay publica al topic. Verifica el sobre con `kcat`.
2. **Proyección CQRS:** `vista-pedidos` consume y mantiene `pedidos_vista` desnormalizada (upsert idempotente por `pedido_id` + `version`). Implementa read-your-writes: el `POST` devuelve `version`, y `GET /pedidos?min_version=N` espera hasta que la proyección alcance o responde 202. Demuéstralo con un curl inmediato tras pagar.
3. **Saga orquestada:** un orquestador (tabla `sagas` con máquina de estados, o Temporal dev server si quieres la tercera vía) coordina pagar → facturar → confirmar. `facturacion` falla aleatoriamente el 20%: verifica compensación (anular pago) y que la saga responde "¿dónde está el pedido X?" con un `GET /sagas/{pedido_id}`.
4. **Replay:** rompe a propósito el proyector (p. ej. ignora `metodo_pago`), acumula 500 pedidos, arregla el código y reconstruye la proyección con un consumer group nuevo desde earliest, blue/green, sin parar la API de lectura. Bonus: pon un "envío de email" (log) en el proyector y observa el desastre del replay; muévelo a un consumidor separado y repite.
5. **Cambio de esquema compatible:** registra `pedido.pagado` v2 añadiendo `canal_venta` (default `"web"`) en modo `FULL`; despliega el productor emitiendo v2 con `vista-pedidos` aún compilado contra v1 y comprueba que sigue proyectando; después intenta registrar una v3 que elimina `total` sin default y observa al registry rechazarla. Documenta el plan expand–contract que habría hecho falta.
6. **Entregable:** README con el diagrama del sistema, la salida de cada paso y una línea por paso de "qué contaría en la entrevista". El paso 4 (replay con y sin efectos secundarios) es la mejor anécdota del lote.

## ✅ Autoevaluación

1. Modela "pedido pagado" en los tres estilos de evento y da, para cada uno, la consecuencia aguas abajo que lo descarta o lo justifica en un marketplace con 10 equipos.
2. ¿Qué campos lleva tu sobre estándar y para qué sirve exactamente `causation_id` que no cubra `correlation_id`?
3. Debes renombrar un campo de un evento público con 12 consumidores vivos y retención de 30 días. Da el plan completo, incluyendo qué cambia si alguien puede hacer replay desde offset 0.
4. Tu proyección CQRS muestra datos viejos justo después de un comando. Da dos soluciones reales y explica por qué `sleep(500)` no es una.
5. ¿Cómo cumples el derecho al olvido de GDPR en un log inmutable, y qué coste añade a las proyecciones?
6. Coreografía, saga orquestada a mano o workflow engine: elige para (a) 2 pasos de notificación, (b) fulfillment con compensaciones y un timer de 30 días, (c) 6 equipos que quieren reaccionar a `pedido.pagado` sin tocarse — y justifica cada una en una frase.

## 🎯 Preguntas del banco que ya puedes responder

- [`mensajeria-eventos/01-fundamentos-de-mensajeria.md`](../../mensajeria-eventos/01-fundamentos-de-mensajeria.md) — estilos de evento, diseño de payloads, comandos vs eventos
- [`mensajeria-eventos/04-casos-y-problemas.md`](../../mensajeria-eventos/04-casos-y-problemas.md) — evolución de esquemas, replays, proyecciones corruptas, sagas a escala
- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — diseños end-to-end donde eliges estilo, CQRS y orquestación con criterio

## Para profundizar

- Martin Kleppmann, *Designing Data-Intensive Applications* — cap. 11 (stream processing: eventos como logs, derivación de estado, reprocesamiento).
- Chris Richardson, *Microservices Patterns* — CQRS, sagas y el paso de patrón a arquitectura.
- Adam Bellemare, *Building Event-Driven Microservices* — eventos como contrato entre equipos, data liberation vs BD compartida disfrazada, gobernanza.

---

**Anterior:** [Módulo 3](03-rabbitmq-en-produccion.md) · **Siguiente:** [Módulo 5 · Laboratorio integrador](05-laboratorio-mensajeria.md)
