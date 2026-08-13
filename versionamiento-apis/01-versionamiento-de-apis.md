# Versionamiento de APIs

Guía de preguntas de entrevista senior sobre versionamiento y evolución de APIs: REST, gRPC/protobuf, eventos con Schema Registry, GraphQL, SemVer, contratos OpenAPI, deprecación y compatibilidad.

## 1. ¿Qué estrategias existen para versionar una API REST y cuáles son los trade-offs reales de cada una?
**Categoría:** REST / Diseño de APIs · **Tipo:** Conceptual

### 📝 Respuesta resumen
Hay cuatro estrategias principales: versión en la URI (`/v1/orders`), versión en un header custom (`X-API-Version` o `Accept-Version`), versión en el media type vía content negotiation (`Accept: application/vnd.empresa.v2+json`) y versión como query param (`?version=2`). La URI es la más visible, cacheable y compatible con herramientas, por eso domina en la práctica; los headers son más "puros" REST pero complican caching, debugging y documentación. Stripe usa versiones por fecha fijadas por cuenta y enviables por header, GitHub usa media type + header `X-GitHub-Api-Version`, y AWS usa query/header con fecha (`?Version=2016-11-15`).

### 📖 Respuesta detallada
**1. Versión en URI** (`GET /v2/orders/123`): es la más usada porque la versión es explícita en logs, navegador, curl, Postman y documentación; el routing en gateways y load balancers es trivial (prefijo de path); y las caches HTTP (CDN, Varnish) funcionan sin configuración extra porque la URL ya es la cache key. El coste: puristas argumentan que rompe el principio de que una URI identifica un recurso, no una representación — `/v1/orders/123` y `/v2/orders/123` son "dos recursos" para el mismo pedido, lo que complica hypermedia y puede duplicar bookmarks/links. En la práctica, ese coste teórico casi nunca pesa más que la operabilidad.

**2. Header custom** (`Accept-Version: 2` o `X-API-Version: 2024-06-01`): mantiene URIs limpias y estables. Problemas reales: las caches intermedias necesitan `Vary: Accept-Version` correctamente configurado o servirán la versión equivocada; no se puede probar desde un navegador sin extensiones; los logs de acceso estándar no muestran la versión (hay que loguear headers); y muchos clientes olvidan enviarlo, obligando a definir un default (¿la más vieja? ¿la más nueva? — la más nueva rompe clientes silenciosamente, la más vieja congela el default para siempre; lo correcto es fijar la versión por cliente en el registro, como Stripe).

**3. Media type / content negotiation** (`Accept: application/vnd.github.v3+json`): es la opción "REST correcta" — versiona la representación, no el recurso. GitHub la popularizó, pero incluso GitHub añadió después el header `X-GitHub-Api-Version: 2022-11-28` con fechas porque los media types custom resultaron opacos para los usuarios. Mismos problemas de caching (`Vary: Accept`) y tooling que los headers, más la complejidad de parsear media types con parámetros (`application/vnd.empresa+json; version=2`).

**4. Query param** (`GET /orders?api-version=2.0`): visible y cacheable (la query forma parte de la cache key), fácil de probar. Azure lo usa (`api-version=2023-05-01`) y AWS en sus APIs query (`Version=2016-11-15`). Desventajas: se mezcla con parámetros de negocio, puede perderse en redirects, y semánticamente es raro que un parámetro cambie el contrato entero.

**Casos reales que conviene citar:**
- **Stripe**: versiones por fecha (`2024-06-20`), cada cuenta queda *pinned* a la versión vigente en su primera petición; se puede sobreescribir por request con `Stripe-Version`. Internamente mantienen una sola implementación actual y capas de transformación hacia atrás por versión.
- **GitHub**: media type + `X-GitHub-Api-Version` por fecha.
- **AWS**: fecha de versión por servicio en query/header; el SDK la fija automáticamente.

```http
GET /v1/customers/cus_123 HTTP/1.1
Host: api.stripe.com
Stripe-Version: 2024-06-20
Authorization: Bearer sk_test_...
```

**Qué espera oír el entrevistador:** que no hay opción "correcta" universal; que la URI gana por operabilidad (caching, routing, visibilidad) y por eso domina; que los headers/media types exigen `Vary` y disciplina de defaults; y que conoces el modelo de Stripe (version pinning por cuenta + fechas) como estado del arte para APIs públicas. Punto extra: decir que la mejor estrategia es necesitar versiones nuevas lo menos posible mediante cambios aditivos.

## 2. ¿Qué es exactamente un breaking change en una API? Da una lista exhaustiva, incluyendo casos no obvios
**Categoría:** Compatibilidad / Contratos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un breaking change es cualquier cambio que hace fallar —o comportarse incorrectamente— a un cliente existente que cumplía el contrato anterior. No solo es quitar o renombrar campos: también cambiar tipos, cambiar la semántica o el formato de un valor (fechas, unidades, monedas), añadir campos requeridos en el request, endurecer validaciones, cambiar defaults, cambiar la estructura de errores o los códigos HTTP, cambiar el orden/paginación por defecto, o cambiar requisitos de autenticación. La clave senior: el contrato incluye comportamiento observable, no solo el esquema.

### 📖 Respuesta detallada
**Lista exhaustiva de breaking changes:**

1. **Quitar o renombrar un campo del response.** Renombrar `customerName` → `customer_name` es eliminar un campo desde la óptica del cliente. Un deserializador estricto falla; uno tolerante devuelve `null` y el bug aparece aguas abajo, que es peor.
2. **Cambiar el tipo de un campo.** `"amount": 100` (number) → `"amount": "100.00"` (string); o un campo que era objeto y pasa a array. Incluye cambios sutiles: int → long que desborda un `int32` en el cliente, o un id numérico que pasa a UUID string.
3. **Cambiar la semántica o el formato sin cambiar el tipo** — el más traicionero porque ningún validador de esquema lo detecta:
   - `date`: de `"03/04/2024"` (¿dd/mm o mm/dd?) a ISO-8601, o de hora local a UTC.
   - Unidades: `amount` de centavos a unidades (`1000` = $10.00 → $1000.00). Un cambio así en una API de pagos es un incidente de severidad 1.
   - `distance` de km a millas, `timeout` de segundos a milisegundos.
4. **Añadir un campo requerido al request.** Los clientes existentes no lo envían → 400 en cada llamada. Los campos nuevos en request deben ser opcionales con default sensato.
5. **Cambios en errores.** Cambiar `{"error": "..."}` por `{"errors": [...]}`, cambiar códigos internos (`"INSUFFICIENT_FUNDS"` → `"ERR_4021"`), o cambiar un 404 por un 400: los clientes hacen branching sobre eso. La estructura de error **es parte del contrato** (por eso conviene RFC 9457 / Problem Details desde el día uno).
6. **Validación más estricta.** Antes se aceptaba `phone` con espacios y ahora se rechaza; antes un string de 500 chars, ahora máximo 255. Aunque "arregle" datos sucios, rompe a quien enviaba payloads que antes pasaban. Lo inverso (relajar validación) generalmente no es breaking para el que llama, pero puede serlo para consumidores del dato aguas abajo.
7. **Cambiar defaults.** `?limit` por defecto de 100 → 20: clientes que paginaban asumiendo 100 pierden datos silenciosamente. Cambiar el orden por defecto de `created_at DESC` a `ASC` rompe cualquier lógica de "los primeros N".
8. **Cambiar paginación.** Pasar de offset/limit a cursor, o cambiar el nombre/estructura del token de página.
9. **Cambios de autenticación/autorización.** Exigir un scope nuevo, pasar de API key a OAuth, acortar TTL de tokens de forma incompatible, exigir mTLS.
10. **Cambios de comportamiento no funcional observable:** convertir una operación síncrona en asíncrona (200 con body → 202 con `Location`), cambiar garantías de idempotencia, bajar rate limits drásticamente.

**Qué NO es breaking (con matices):**
- **Campos nuevos opcionales en el response** — si los clientes son tolerant readers. Matiz: clientes con `FAIL_ON_UNKNOWN_PROPERTIES` activado o validación estricta de esquema sí rompen; contractualmente es su bug, pero el incidente es real igualmente.
- **Endpoints o verbos nuevos.**
- **Parámetros opcionales nuevos en el request.**
- **Valores nuevos en un enum del response** — el gran matiz: si el cliente hace `switch` exhaustivo sin rama default, o deserializa a un enum Java cerrado, explota. Por eso APIs maduras documentan "trata los enums como abiertos" y protobuf/Avro obligan a manejar valores desconocidos.
- Mensajes de error *humanos* (no los códigos), cambios de orden de claves JSON, whitespace.

**Qué espera oír el entrevistador:** la definición operativa (rompe a un cliente que cumplía el contrato), varios ejemplos no obvios (formato de fechas, unidades, defaults, estructura de errores, validación más estricta) y los matices de enums y unknown fields. Un senior distingue "breaking según el contrato" de "breaking en la práctica por cómo están escritos los clientes reales" — y diseña para lo segundo.

## 3. Define backward compatibility y forward compatibility con precisión, desde la perspectiva productor/consumidor
**Categoría:** Compatibilidad / Fundamentos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Backward compatibility: el código **nuevo** puede procesar datos/peticiones producidos por el esquema **viejo** (lector nuevo, escritor viejo). Forward compatibility: el código **viejo** puede procesar datos producidos por el esquema **nuevo** (lector viejo, escritor nuevo). En sistemas distribuidos necesitas normalmente ambas durante los despliegues, porque nunca actualizas productores y consumidores atómicamente: en un rolling deploy conviven versiones viejas y nuevas leyendo y escribiendo a la vez.

### 📖 Respuesta detallada
La confusión clásica es definir estas propiedades sin decir *quién* es viejo y *quién* es nuevo. La formulación precisa (la de Kleppmann en *Designing Data-Intensive Applications*):

- **Backward compatibility** = *newer reader, older writer*. El esquema nuevo puede leer datos escritos con el esquema viejo. Ejemplo: despliegas la versión 2 de tu servicio de pedidos y sigue habiendo mensajes v1 en la cola de Kafka, filas en la base de datos serializadas con v1, y clientes v1 llamándote. Tu código nuevo debe entenderlos.
- **Forward compatibility** = *older reader, newer writer*. El esquema viejo puede leer datos escritos con el esquema nuevo. Ejemplo: el productor ya publica eventos v2, pero la mitad de los consumidores siguen en v1 (rolling deploy, o equipos que migran a su ritmo). El consumidor v1 debe poder procesar el evento v2, típicamente ignorando lo que no conoce.

**Ejemplo concreto con un evento JSON:**

Esquema v1: `{"orderId": "o-1", "amount": 100}`
Esquema v2 añade `"currency"` con default `"USD"` y elimina nada.

- *Lector nuevo (v2), escritor viejo (v1)* — backward: el lector v2 recibe un mensaje sin `currency`. Funciona **solo si** `currency` tiene default o es opcional. Si v2 hubiera declarado `currency` requerido sin default, rompería backward compatibility.
- *Lector viejo (v1), escritor nuevo (v2)* — forward: el lector v1 recibe `currency`, que no conoce. Funciona **solo si** ignora campos desconocidos (tolerant reader). Si v2 hubiera *eliminado* `amount`, el lector v1 rompería aunque ignore lo desconocido: le falta un campo que necesita.

De ahí las reglas simétricas:
- **Añadir campo**: no rompe forward (el viejo lo ignora); no rompe backward solo si es opcional/con default (el nuevo tolera su ausencia en datos viejos).
- **Quitar campo**: no rompe backward solo si el campo era opcional/con default para el lector nuevo (que ya no lo espera); rompe forward si el lector viejo lo necesitaba.

**Perspectiva request/response en REST:** en una API HTTP el servidor es lector del request y escritor del response, y el cliente al revés. "Evolución compatible" significa: el servidor nuevo acepta requests de clientes viejos (backward respecto al request) y produce responses que los clientes viejos entienden (forward respecto al response). Por eso las reglas prácticas son: en requests, todo campo nuevo es opcional; en responses, nunca quitar ni resemantizar campos, solo añadir.

**Por qué necesitas ambas:** en un despliegue rolling de N réplicas, durante minutos u horas conviven v1 y v2 tanto produciendo como consumiendo. Con event sourcing o colas con retención larga, "datos escritos por el esquema viejo" pueden tener meses: backward compatibility no es transitoria, es permanente mientras existan esos datos (o hasta que hagas upcasting/migración de eventos). Y forward compatibility es lo que permite desplegar el productor primero sin coordinar a todos los consumidores — la base del desacoplamiento entre equipos.

**Full compatibility** = ambas a la vez; en la práctica restringe los cambios a "añadir/quitar solo campos opcionales con default".

**Qué espera oír el entrevistador:** las definiciones con lector/escritor explícitos (no la versión vaga "lo nuevo funciona con lo viejo"), un ejemplo en cada dirección, la conexión con rolling deploys y colas con retención, y la regla derivada: campos opcionales con default son la moneda de la evolución segura.

## 4. Explica el patrón tolerant reader y la ley de Postel aplicada a APIs. ¿Cuáles son los riesgos de ser demasiado tolerante?
**Categoría:** Compatibilidad / Patrones de integración · **Tipo:** Conceptual

### 📝 Respuesta resumen
Tolerant reader (Martin Fowler) aplica la ley de Postel — "sé conservador en lo que envías, liberal en lo que aceptas" — al consumo de APIs: el cliente extrae solo los campos que necesita, ignora los desconocidos y no valida más estructura de la imprescindible. Así el productor puede añadir campos sin romper a nadie. En Jackson significa `FAIL_ON_UNKNOWN_PROPERTIES=false` (o `@JsonIgnoreProperties(ignoreUnknown=true)`). El riesgo de pasarse de tolerante: errores silenciosos — typos que se ignoran, campos ausentes que se vuelven `null`, y contratos que se erosionan sin que nadie lo note; se mitiga con contract testing.

### 📖 Respuesta detallada
**El patrón.** Un consumidor frágil deserializa el response completo contra una clase espejo del contrato y falla si algo no cuadra. Un tolerant reader hace lo mínimo: toma `order.id`, `order.status` y `order.total` aunque el payload traiga 40 campos, no le importa el orden, no le importan campos extra, y tolera la ausencia de lo que no es esencial para su caso de uso. El beneficio directo es que el productor puede evolucionar aditivamente (el 90% de la evolución real) sin coordinar despliegues con cada consumidor — es la condición que hace posible la forward compatibility de la pregunta anterior.

**En Jackson (el ejemplo canónico en Java):**

```java
// Global
ObjectMapper mapper = JsonMapper.builder()
    .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    .build();

// O por clase
@JsonIgnoreProperties(ignoreUnknown = true)
public record OrderResponse(String id, String status, BigDecimal total) {}
```

Ojo al detalle de versiones: en Jackson 2.x `FAIL_ON_UNKNOWN_PROPERTIES` está **activado por defecto** (estricto), así que un cliente Java "de fábrica" rompe en cuanto el proveedor añade un campo — bug clásico en producción tras un release ajeno. Spring Boot lo desactiva por defecto en su `ObjectMapper` autoconfigurado, lo cual salva a mucha gente sin que lo sepa. En Go, `encoding/json` ignora campos desconocidos por defecto; en serde (Rust) también, salvo `#[serde(deny_unknown_fields)]`.

**Los riesgos de la tolerancia excesiva:**

1. **Errores silenciosos por typo o rename.** Si el productor renombra `total` → `totalAmount`, un lector estricto falla ruidosamente en el deploy; el tolerante deserializa `total = null` y el bug aparece como un NPE tres capas más abajo, o peor, como un `0` que se contabiliza. Fallar tarde y lejos del origen es más caro que fallar pronto.
2. **Erosión del contrato.** Si nadie valida nada, el contrato real deja de ser el documento y pasa a ser "lo que los clientes toleran". El productor pierde la señal de qué puede cambiar con seguridad.
3. **Tolerancia en el productor (anti-patrón).** La ley de Postel dice liberal *al aceptar*, conservador *al enviar*. Un servidor que acepta requests malformados "por robustez" (campos con typos ignorados, tipos coaccionados) crea clientes que dependen de ese comportamiento accidental — después endurecer la validación es un breaking change (ver pregunta 2). También hay historial de vulnerabilidades por parsers demasiado liberales (request smuggling, JSON duplicado interpretado distinto por capas distintas); de hecho el RFC 9413 revisa críticamente la ley de Postel por esto.
4. **Campos requeridos de negocio.** Tolerante con lo desconocido ≠ tolerante con lo esencial: si `amount` falta en un cobro, hay que fallar, no defaultear.

**El equilibrio senior:** ignora lo desconocido, valida estrictamente lo que sí usas (presencia, tipo, rango de los campos críticos), y compensa la pérdida de detección temprana con **contract tests** (Pact, Spring Cloud Contract) o schema validation en CI: la rigidez se mueve del runtime de producción al pipeline.

**Qué espera oír el entrevistador:** la definición y su porqué (habilita evolución aditiva), el detalle concreto de Jackson y sus defaults, y sobre todo la parte crítica: tolerancia excesiva = fallos silenciosos + contratos erosionados, con contract testing como mitigación. Citar que Postel aplica al lector, no al escritor, distingue a un senior.

## 5. ¿Cómo se versionan mensajes y servicios en gRPC/protobuf? Reglas de field numbers, `reserved`, y por qué proto3 hizo todo opcional
**Categoría:** gRPC / Protobuf · **Tipo:** Conceptual

### 📝 Respuesta resumen
En protobuf la identidad de un campo en el wire es su **field number**, no su nombre: los números nunca se reutilizan ni se cambian; al eliminar un campo se marcan número y nombre como `reserved`. La evolución segura es aditiva: campos nuevos con números nuevos, deprecación con `[deprecated=true]`, y para cambios incompatibles se crea un paquete nuevo (`empresa.orders.v2`). proto3 hizo todos los campos escalares opcionales con defaults implícitos precisamente para garantizar backward/forward compatibility: un lector nunca falla por un campo ausente. Hay que distinguir wire compatibility (bytes interoperables) de source compatibility (el código generado compila).

### 📖 Respuesta detallada
**Field numbers son el contrato.** En el wire format, cada campo se codifica como `(field_number, wire_type, valor)`; los nombres no viajan. Consecuencias:
- **Renombrar un campo no rompe el wire** (sí rompe source compatibility y JSON mapping).
- **Cambiar el número de un campo es breaking total**: el lector interpretará bytes de un campo como otro.
- **Reutilizar el número de un campo eliminado es el peor bug posible**: mensajes viejos persistidos (Kafka, event store, caches) traen ese número con la semántica antigua; el lector nuevo lo deserializa con la nueva. Si además el wire type coincide, no hay error — solo datos corruptos silenciosos.

Por eso existe `reserved`:

```protobuf
syntax = "proto3";
package empresa.orders.v1;

message Order {
  reserved 4, 9 to 11;                 // números que tuvieron campos eliminados
  reserved "discount_pct", "legacy_id"; // nombres, para evitar reuso confuso y en JSON

  string order_id = 1;
  int64 amount_cents = 2;
  string currency = 3;
  // 4 era discount_pct: eliminado, jamás reutilizar
  OrderStatus status = 5 [deprecated = true]; // deprecado, aún servido
}
```

**Evolución segura de mensajes:**
- Añadir campos con números nuevos: los lectores viejos los ignoran (van a *unknown fields*, que proto3 desde la versión 3.5 vuelve a preservar y reserializar), los nuevos leen defaults en mensajes viejos. Backward y forward compatible.
- `oneof`: útil para variantes, pero mover campos existentes dentro o fuera de un `oneof` es breaking, y añadir variantes nuevas exige que los lectores viejos manejen "ninguno de los que conozco".
- Cambios de tipo: solo algunos son wire-compatible (`int32`/`int64`/`uint32`/`bool` comparten varint; `string`/`bytes` si el contenido es UTF-8). `int32` → `sint32` **no** es compatible (zigzag). Regla senior: no jugar a esto, añadir campo nuevo y deprecar el viejo.
- Enums: proto3 exige valor 0 como default/`UNSPECIFIED`; valores desconocidos se preservan como enteros — el consumidor debe tener rama default.

**Por qué proto3 quitó `required`.** En proto2, `required` resultó tóxico: un campo required no puede quitarse jamás sin romper a todos los lectores/escritores viejos, y un mensaje válido para negocio podía fallar en un middlebox que validaba. El equipo de Google concluyó que "required is forever" y en proto3 todo campo es opcional con default implícito (0, "", false), moviendo la validación de requeridos a la capa de aplicación. proto3.15 reintrodujo `optional` explícito solo para *field presence* (distinguir "ausente" de "valor cero"), no como requerido.

**Wire vs source compatibility.** Renombrar `amount_cents` → `amount` no rompe el wire pero rompe la compilación de todo el que dependa del stub generado (source compatibility) — relevante si publicas los `.proto` o los stubs como librería con SemVer. Al revés, cambiar un número mantiene el código compilando y rompe los bytes: el peor caso porque nada lo detecta en compile time (por eso se usa `buf breaking` en CI).

**Versionado de servicios y paquetes.** Para breaking changes reales, la convención (Google AIP-185, estilo de Google Cloud) es versionar el paquete: `empresa.orders.v1` → `empresa.orders.v2`, sirviendo ambos servicios en paralelo en el mismo binario o detrás del mismo gateway, con migración y sunset. Añadir RPCs a un servicio es seguro; cambiar la firma de un RPC (request/response type) no lo es — se añade un RPC nuevo.

**Qué espera oír el entrevistador:** field numbers como identidad, nunca reutilizar + `reserved` con el escenario de corrupción silenciosa, la historia de `required` en proto2, package versioning para breaking changes, y herramientas (`buf breaking`) para automatizar la detección.

## 6. Versionado de schemas de eventos: modos de compatibilidad del Schema Registry (BACKWARD, FORWARD, FULL, TRANSITIVE) y quién migra primero
**Categoría:** Eventos / Kafka / Schema Registry · **Tipo:** Conceptual

### 📝 Respuesta resumen
En Kafka con Confluent Schema Registry, cada subject tiene un modo de compatibilidad que el registry aplica al registrar un schema nuevo. BACKWARD: los consumidores con el schema nuevo leen datos escritos con el anterior → puedes borrar campos y añadir campos con default, y **los consumidores migran primero**. FORWARD: los consumidores con el schema viejo leen datos nuevos → puedes añadir campos y borrar solo campos con default, y **los productores migran primero**. FULL exige ambas (solo añadir/quitar campos con default). Las variantes TRANSITIVE validan contra **todas** las versiones anteriores, no solo la última — imprescindible con retención larga o topics compactados.

### 📖 Respuesta detallada
**El mecanismo.** El productor serializa con un schema registrado (el mensaje lleva el schema id); al registrar una versión nueva de un subject, el registry la valida contra la(s) anterior(es) según el modo configurado y rechaza el registro si viola la regla — es un guardrail en el momento de publicar el schema, no en cada mensaje.

**Los modos, con precisión (semántica Avro):**

| Modo | Permite | Quién migra primero |
|---|---|---|
| BACKWARD (default) | Borrar campos; añadir campos **con default** | Consumidores |
| FORWARD | Añadir campos; borrar solo campos **con default** | Productores |
| FULL | Añadir/borrar solo campos **con default** | Cualquiera |
| *_TRANSITIVE | Lo mismo, pero contra todas las versiones previas | Igual |

*Por qué el orden de migración:* con BACKWARD, el schema nuevo (N) lee datos escritos con N-1; entonces actualizas primero los consumidores a N (siguen leyendo datos N-1 sin problema) y después los productores empiezan a escribir N. Si el productor escribiera N antes, un consumidor en N-1 podría no entender los datos — eso solo lo garantiza FORWARD. Con FORWARD es el espejo: el productor publica N primero; los consumidores en N-1 siguen leyendo datos N, y migran cuando quieran.

**Ejemplo Avro** — con BACKWARD, añadir `currency` exige default:

```json
{
  "type": "record",
  "name": "OrderCreated",
  "namespace": "com.empresa.orders",
  "fields": [
    {"name": "order_id", "type": "string"},
    {"name": "amount_cents", "type": "long"},
    {"name": "currency", "type": "string", "default": "USD"},
    {"name": "coupon", "type": ["null", "string"], "default": null}
  ]
}
```

Sin `"default": "USD"`, el registro falla con `409 Conflict` (incompatible). El union `["null","string"]` con default `null` es el idioma estándar para "campo opcional".

**Por qué TRANSITIVE importa.** BACKWARD a secas solo compara con la última versión. Secuencia legal sin transitive: v1 tiene `email`; v2 borra `email` (backward OK); v3 re-añade `email` sin default... v3 es backward-compatible con v2, pero **no** puede leer datos v1 persistidos si hubo cambios encadenados incompatibles con versiones más viejas. Con topics de retención infinita, compactados, o event sourcing, los consumidores leerán datos escritos con *cualquier* versión histórica: ahí necesitas BACKWARD_TRANSITIVE (o FULL_TRANSITIVE), porque la compatibilidad "contra la última versión" no cubre el replay desde el offset 0.

**Avro vs Protobuf vs JSON Schema en eventos:**
- **Avro**: resolución de schemas lector/escritor de primera clase (el lector resuelve contra el writer schema exacto), defaults explícitos, compacto; el estándar de facto en Kafka. Contra: necesita el writer schema para deserializar (de ahí el registry) y su manejo de defaults/uniones tiene aristas.
- **Protobuf**: no necesita el writer schema (los field numbers autodescriben), excelente para gRPC + eventos con un solo IDL; la noción de "default" es implícita, y el registry aplica reglas propias de proto (p. ej., no cambiar field numbers).
- **JSON Schema**: legible y ubicuo, pero la compatibilidad es más difusa (open vs closed content model: un schema con `additionalProperties: false` hace casi imposible la evolución) y el payload es verboso.

**Errores comunes:** dejar el default (BACKWARD) sin pensar quién puede migrar primero en tu organización; usar NONE "temporalmente" y descubrirlo en un incidente; olvidar que compatibilidad de schema ≠ compatibilidad semántica (cambiar centavos por unidades pasa cualquier validador).

**Qué espera oír el entrevistador:** qué permite exactamente cada modo (añadir/quitar con/sin default), la regla de quién migra primero en cada uno con su porqué, y el caso de TRANSITIVE ligado a retención larga/replay. Mencionar el 409 del registry en CI/CD como gate automático suma.

## 7. [CASO] Un equipo añade un campo a un evento Avro y los consumidores de otro equipo empiezan a fallar en producción. Diagnostica y propone la solución
**Categoría:** Eventos / Kafka / Schema Registry · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Hipótesis ordenadas: (1) el campo se añadió **sin default** con compatibilidad BACKWARD, y los consumidores fallan al resolver el schema o al re-leer datos viejos; (2) el subject estaba en NONE y nadie validó nada; (3) los consumidores no usan el registry (schema embebido/hardcodeado) y deserializan con un schema local desactualizado; (4) es forward incompatibility: consumidores viejos leyendo datos nuevos con un deserializador estricto (SpecificRecord regenerado, o JSON sin tolerant reader). Solución inmediata: revertir el schema o desplegar consumidores actualizados; solución estructural: modo de compatibilidad correcto (con TRANSITIVE), validación de schemas en CI y orden de migración documentado.

### 📖 Respuesta detallada
**Paso 1 — acotar el fallo.** ¿Qué excepción ven los consumidores? Las tres firmas típicas:
- `SerializationException: Error retrieving Avro schema` / `Schema not found`: el consumidor no puede resolver el schema id nuevo contra el registry (ACLs, registry caído, o subject naming strategy distinta entre productor y consumidor — `TopicNameStrategy` vs `RecordNameStrategy` es un clásico).
- `AvroTypeException: missing required field`: alguien deserializa datos **viejos** con un schema **nuevo** donde el campo añadido no tiene default — violación backward pura.
- `ClassCastException` / campos corridos: el consumidor usa `SpecificRecord` generado de un `.avsc` local que no coincide con el writer schema y la resolución falla o resuelve mal.

**Paso 2 — reconstruir la línea de tiempo.** Consultar el registry:

```http
GET /subjects/orders.order-created-value/versions        → [1, 2, 3]
GET /subjects/orders.order-created-value/versions/3      → schema con el campo nuevo
GET /config/orders.order-created-value                   → {"compatibilityLevel": "NONE"}
```

Si el modo era NONE (o el subject nuevo heredó un default global mal puesto), el registro del schema incompatible pasó sin resistencia. Si era BACKWARD y el registro pasó, entonces el schema **es** backward-compatible y el problema está en los consumidores: por ejemplo, regeneraron clases con el schema v3 (lector nuevo) pero un servicio quedó a medias en el rolling deploy; o el fallo es forward (consumidor v2 leyendo datos v3) — que BACKWARD **no garantiza**: BACKWARD solo promete lector nuevo/datos viejos. Este es el malentendido central del caso: el equipo productor dijo "el registry lo aceptó, es compatible", pero el modo configurado no protegía la dirección en la que la organización realmente despliega (productores primero).

**Paso 3 — mitigación inmediata.** Opciones por orden de preferencia:
1. Si el campo nuevo puede llevar default: registrar v4 = v3 + default, y que el productor siga publicando (los datos v3 ya escritos siguen siendo legibles por lectores v4).
2. Desplegar los consumidores con el schema nuevo (si el fallo era de lector desactualizado y la semántica lo permite).
3. Rollback del productor a v2 — cuidado: los mensajes v3 ya en el topic seguirán rompiendo a los consumidores al reprocesar; puede requerir skip de offsets o un parche de deserialización tolerante en el consumidor (dead letter queue para los mensajes problemáticos mientras tanto).

**Paso 4 — solución estructural:**
- Fijar el modo por subject de forma deliberada: FORWARD_TRANSITIVE si los productores despliegan primero (lo habitual cuando el productor es dueño del schema), FULL_TRANSITIVE si nadie coordina con nadie.
- Gate en CI: `mvn schema-registry:test-compatibility` o `POST /compatibility/subjects/{subject}/versions/latest` contra el registry antes del merge — el 409 debe ocurrir en el pipeline, no en producción.
- Contratos de propiedad: el schema vive en un repo del productor, los consumidores lo consumen versionado; cambios pasan por PR visible para los equipos consumidores.
- DLQ y alertas de deserialización en todos los consumidores: un schema malo no debe parar el stream entero.

**Qué espera oír el entrevistador:** diagnóstico sistemático (excepción → registry → modo → dirección de la incompatibilidad), la distinción fina de que BACKWARD no protege el despliegue productor-primero, y mitigaciones que consideran los mensajes ya escritos en el topic (no basta el rollback del productor). El candidato senior habla de prevención en CI, no solo del fix.

## 8. ¿Por qué GraphQL "no se versiona"? ¿Cómo se evoluciona un schema GraphQL y qué riesgos tiene ese modelo?
**Categoría:** GraphQL · **Tipo:** Conceptual

### 📝 Respuesta resumen
GraphQL apuesta por una única versión del schema en evolución continua: como cada cliente declara exactamente los campos que pide, añadir campos nunca afecta a queries existentes, y los campos obsoletos se marcan con `@deprecated` en vez de crear `/v2`. El modelo funciona porque hay observabilidad por campo: sabes qué clientes usan qué campo y puedes retirar lo que ya nadie pide. Los riesgos: los campos son casi imposibles de borrar si no controlas los clientes, el schema acumula deuda (campos zombie), y los breaking changes semánticos (cambiar el significado de un campo) siguen siendo tan peligrosos como en REST.

### 📖 Respuesta detallada
**Por qué el modelo aditivo funciona mejor en GraphQL que en REST.** En REST el servidor decide la representación: si el response engorda o cambia, todos lo reciben. En GraphQL el cliente pide campos explícitos (`{ order { id total } }`), así que añadir `totalWithTax` al tipo `Order` es invisible para cualquier query existente — no hay over-fetching que romper ni tolerant reader que exigir: la tolerancia está incorporada en el protocolo. Por eso la recomendación oficial es "versionless API": evolución continua, sin `/v2`.

**Las herramientas de evolución:**

```graphql
type Order {
  id: ID!
  total: Float! @deprecated(reason: "Usa totalAmount (Money) — precisión decimal. Sunset: 2026-01-01")
  totalAmount: Money!
  status: OrderStatus!
}
```

- `@deprecated` aparece en introspección: GraphiQL/Playground lo tachan, los linters de clientes avisan, y codegen puede emitir warnings. Es documentación ejecutable, no solo un changelog.
- Patrón de reemplazo: añadir el campo nuevo (`totalAmount`), deprecar el viejo, migrar clientes, borrar. El paso 4 es el difícil.
- Enums y uniones: añadir valores a un enum o miembros a una union **sí** puede romper clientes con switch exhaustivo — mismo matiz que en REST/protobuf; los clientes deben tratar enums como abiertos.
- Cambios verdaderamente breaking (quitar campo, cambiar tipo de `Float!` a `Money!` en el mismo campo, hacer nullable un `!`): no hay magia — o campo nuevo con nombre nuevo, o coordinación de clientes. Nota fina: pasar `Float!` → `Float` (hacerlo nullable) rompe a los clientes tipados; pasar un argumento de opcional a requerido, también.

**La condición necesaria: field-level analytics.** El contrato social de "no versionamos" solo se sostiene si puedes responder "¿quién usa `Order.total`?" con datos: Apollo GraphOS / router registran uso por campo, por operación y por cliente (header `apollographql-client-name`). Con eso defines una política tipo "un campo deprecado sin tráfico durante 90 días se elimina". Sin esa telemetría, deprecar es rezar.

**Los riesgos reales del modelo:**
1. **Campos inmortales.** Con clientes que no controlas (apps móviles con versiones viejas instaladas durante años, partners externos), el uso nunca llega a cero. El schema acumula campos zombie con su coste: cada campo deprecado sigue necesitando resolver, tests, datos y seguridad. Un schema de 5 años sin disciplina es un museo.
2. **Breaking semántico invisible.** Cambiar `total` de "sin impuestos" a "con impuestos" no lo detecta ni la introspección ni el diff de schema. GraphQL no te salva de la pregunta 2.
3. **Coste de resolver campos legacy.** Mantener `total` y `totalAmount` puede duplicar lógica o esconder deuda en resolvers.
4. **Herramienta necesaria en CI:** `graphql-inspector` / Apollo schema checks hacen diff del schema y cruzan con el tráfico real ("este cambio rompe 3 operaciones de 2 clientes activos") — el equivalente a oasdiff pero con datos de uso, que es más fuerte.

**Qué espera oír el entrevistador:** el porqué estructural (selección explícita de campos ⇒ aditivo seguro), `@deprecated` + telemetría por campo como el mecanismo completo (no solo la directiva), y una visión crítica: GraphQL elimina la *necesidad* de versiones globales pero no elimina los breaking changes semánticos ni el problema de los clientes que no migran nunca.

## 9. ¿Cómo se aplica SemVer a APIs HTTP y a librerías internas? ¿Qué significa cada número y por qué 0.x es peligroso?
**Categoría:** SemVer / Gestión de dependencias · **Tipo:** Conceptual

### 📝 Respuesta resumen
SemVer (`MAJOR.MINOR.PATCH`): MAJOR = breaking change, MINOR = funcionalidad nueva backward-compatible, PATCH = bugfix compatible. Para una librería (Java/npm) la unidad de compatibilidad es la API pública del código (firmas, tipos, comportamiento); para una API HTTP, el contrato observable — y por eso las APIs HTTP no exponen MINOR/PATCH al cliente: solo importa la MAJOR (`/v1`, `/v2`); el resto es changelog. Los rangos (`^1.4.0`, `[1.4,2.0)`) delegan en el proveedor la promesa de compatibilidad. `0.x` es peligroso porque SemVer explícitamente no garantiza nada entre 0.y y 0.z: cualquier release puede romper, y los resolutores de dependencias lo tratan distinto (npm `^0.4.0` ≈ `~0.4.0`).

### 📖 Respuesta detallada
**La regla y su letra pequeña.** SemVer 2.0.0 define: incrementa MAJOR ante cualquier cambio incompatible en la API pública, MINOR al añadir funcionalidad compatible (o deprecar algo), PATCH para correcciones compatibles. La letra pequeña que separa a un senior: "API pública" incluye **comportamiento**, no solo firmas. Un bugfix que cambia un resultado del que los clientes dependían (Hyrum's Law: con suficientes usuarios, todo comportamiento observable se convierte en contrato) es técnicamente PATCH y prácticamente breaking. Por eso los equipos maduros complementan SemVer con herramientas de verificación: `japicmp`/`revapi` en Java, `api-extractor` en TypeScript, que comparan la API pública entre versiones y fallan el build si detectan un breaking en un MINOR/PATCH.

**Librería vs API HTTP — diferencia clave de despliegue:** con una librería, cada consumidor elige cuándo subir de versión y pueden convivir consumidores en 1.x y 2.x sin coste para el proveedor (publica ambas en el repositorio de artefactos). Con una API HTTP, cada versión MAJOR viva es infraestructura corriendo: código, tests, monitoreo, seguridad. Por eso las APIs exponen solo la MAJOR en la URL/header y las mejoras compatibles se despliegan in-place sin que el cliente note el número. Anunciar `/v1.2` en la URI es un anti-patrón: si 1.2 es compatible con 1.1, no debería cambiar la URL (rompes links y caches sin motivo); si no es compatible, es una MAJOR mal etiquetada.

**Rangos de versiones y sus riesgos:**

```jsonc
// package.json
"dependencies": {
  "empresa-http-client": "^1.4.0",   // acepta >=1.4.0 <2.0.0 — confía en SemVer del proveedor
  "empresa-legacy-lib": "~0.4.2"     // >=0.4.2 <0.5.0
}
```

En Maven, `[1.4,2.0)` existe pero la cultura es fijar versión exacta y delegar en dependabot/renovate. El rango `^` es un contrato de confianza: si el proveedor rompe en un MINOR, todos los builds nuevos fallan de repente sin que nadie cambiara nada — el clásico "ayer compilaba". Mitigaciones: lockfiles (`package-lock.json`), repositorios internos con staging de versiones, y contract tests contra la librería.

**Por qué 0.x es peligroso.** SemVer §4: "Major version zero is for initial development. Anything MAY change at any time." Es decir, `0.5.0` → `0.6.0` puede romper legítimamente. Dos agravantes prácticos: (1) npm trata `^0.4.0` como `>=0.4.0 <0.5.0` (el caret se degrada a tilde), y `^0.0.3` como exactamente `0.0.3` — comportamiento que sorprende y produce builds inconsistentes entre librerías 0.x y 1.x; (2) muchas librerías se quedan en 0.x durante años con miles de usuarios en producción, disfrutando de la libertad de romper sin la responsabilidad de señalizarlo. Para librerías internas de plataforma la recomendación es llegar a 1.0.0 pronto y pagar el precio de las MAJOR honestas.

**Deprecación dentro de SemVer:** deprecar es MINOR (añades la anotación `@Deprecated`/`@deprecated` sin romper), eliminar es MAJOR. Una política sana: nada se elimina en la misma MAJOR en que se deprecó.

**Qué espera oír el entrevistador:** la definición exacta de los tres números, la asimetría librería (multi-versión gratis) vs API HTTP (cada versión viva cuesta), que solo la MAJOR pertenece a la URL, Hyrum's Law como límite de SemVer, y los detalles concretos de 0.x (la cláusula del spec y el comportamiento del caret en npm).

## 10. Contract-first con OpenAPI: ¿cómo se usa el contrato para generar código y detectar breaking changes automáticamente en CI?
**Categoría:** API-first / OpenAPI / CI-CD · **Tipo:** Conceptual

### 📝 Respuesta resumen
En contract-first el `openapi.yaml` es la fuente de verdad: se diseña y revisa antes de escribir código, se generan de él stubs de servidor y SDKs de cliente (openapi-generator), y el pipeline aplica dos gates: linting del contrato (Spectral, con reglas de estilo y de gobernanza) y diff contra la versión publicada (oasdiff / openapi-diff) que **falla el build si hay breaking changes** no acompañados de un bump de versión mayor. Code-first (generar el spec desde anotaciones) es cómodo pero convierte el contrato en un efecto secundario del código, lo que facilita romperlo sin darse cuenta — el diff en CI mitiga esto en ambos enfoques.

### 📖 Respuesta detallada
**Contract-first vs code-first.** Contract-first: el equipo escribe el spec, lo revisan API designers y consumidores (PR sobre el YAML), y solo entonces se implementa; el contrato puede publicarse y mockearse (Prism, Postman mock) antes de que exista backend, desbloqueando a los equipos frontend en paralelo. Code-first: anotaciones (`springdoc-openapi`, FastAPI) generan el spec del código; es más rápido al empezar y nunca se desincroniza del código, pero el contrato deja de ser una decisión deliberada — un refactor "inocente" (renombrar un DTO, cambiar un `Integer` a `Long`) cambia el spec publicado sin que ningún humano lo haya aprobado. La postura senior: cualquiera de los dos es defendible **si** el spec resultante se versiona en git y pasa por los mismos gates; contract-first para APIs públicas/entre equipos, code-first tolerable para APIs internas de un solo equipo.

**Generación de código:**

```bash
# Servidor (interfaces Spring que tu código implementa — el contrato manda)
openapi-generator-cli generate -i openapi.yaml -g spring \
  --additional-properties=interfaceOnly=true,useSpringBoot3=true -o server/

# Cliente TypeScript publicable como SDK
openapi-generator-cli generate -i openapi.yaml -g typescript-fetch -o sdk-ts/
```

El patrón `interfaceOnly` es clave en servidor: el build falla si la implementación diverge del contrato (drift imposible). Para clientes, el SDK generado se versiona con SemVer ligado al spec (ver pregunta 16).

**Detección de breaking changes en CI con oasdiff:**

```yaml
# GitHub Actions
- name: Detectar breaking changes en el contrato
  run: |
    oasdiff breaking origin/main:api/openapi.yaml api/openapi.yaml \
      --fail-on ERR --format githubactions
```

oasdiff clasifica cada cambio (hay ~250 checks): eliminar un endpoint/campo, hacer requerido un parámetro opcional, estrechar un enum del request, cambiar un tipo, añadir un valor de enum en response (warning, por el matiz de clientes con switch cerrado)... y distingue dirección: estrechar tipos en el **request** es breaking, estrecharlos en el **response** no (y viceversa) — exactamente la lógica de la pregunta 2 automatizada. `openapi-diff` (Java) hace lo propio con salida markdown/html para el changelog. El gate típico: breaking detectado ⇒ el build falla salvo que el PR también incremente la versión mayor del path/spec o lleve una etiqueta de aprobación explícita de gobernanza.

**Linting con Spectral:**

```yaml
# .spectral.yaml
extends: ["spectral:oas"]
rules:
  operation-operationId: error
  paths-kebab-case: error
  no-numeric-ids-without-format: warn
  empresa-error-model:
    description: Todas las respuestas de error usan Problem Details (RFC 9457)
    given: "$.paths[*][*].responses[?(@property >= '400')].content"
    then: { field: "application/problem+json", function: truthy }
```

Spectral codifica la guía de estilo de la organización (naming, paginación estándar, modelo de errores, seguridad declarada) como reglas ejecutables — la gobernanza deja de ser un documento en Confluence.

**Errores comunes:** generar el spec en runtime y no versionarlo (no hay contra qué diffear); lint sin diff (estilo perfecto, breaking silencioso); diff contra la rama en vez de contra la **última versión publicada/desplegada**; y tratar el spec como documentación en vez de como artefacto desplegable (debería publicarse al developer portal desde el mismo pipeline).

**Qué espera oír el entrevistador:** el flujo completo spec → revisión → generación → gates; nombres concretos de herramientas (openapi-generator, oasdiff/openapi-diff, Spectral, Prism); la asimetría request/response en la clasificación de breaking; y la idea de que el diff automático convierte la política de versionado en algo verificable, no aspiracional.

## 11. ¿Cómo se depreca formalmente una versión de API? Headers `Deprecation` y `Sunset`, comunicación, métricas y brownouts
**Categoría:** Ciclo de vida / Deprecación · **Tipo:** Conceptual

### 📝 Respuesta resumen
Deprecación formal = señal en banda + comunicación fuera de banda + datos + fecha dura. En banda: header `Deprecation` (RFC 9745) y `Sunset` (RFC 8594) con la fecha de apagado, más un `Link` a la guía de migración. Fuera de banda: changelog, emails dirigidos a los consumidores activos (identificados por API key/User-Agent), developer portal. Con métricas de uso por versión y por cliente persigues a los rezagados; los plazos típicos son 6–24 meses para APIs públicas; y antes del apagado se hacen brownouts programados (devolver errores durante ventanas cortas anunciadas) para despertar a los clientes que no leen emails.

### 📖 Respuesta detallada
**Señalización en banda.** Dos headers estandarizados:

```http
HTTP/1.1 200 OK
Deprecation: @1735689600
Sunset: Sat, 27 Jun 2026 23:59:59 GMT
Link: <https://developers.empresa.com/docs/migracion-v2>; rel="deprecation"
Content-Type: application/json
```

`Deprecation` (RFC 9745, 2025) indica que el recurso está deprecado y desde cuándo (timestamp IMF o `@epoch`); `Sunset` (RFC 8594) anuncia la fecha en que dejará de responder. La distinción importa: deprecado = sigue funcionando pero no lo uses; sunset = fecha de muerte. Emitirlos permite que middleware de los clientes (interceptores HTTP, APM) alerte automáticamente — hay librerías y gateways que loguean cualquier response con estos headers. En GraphQL el equivalente es `@deprecated`; en SDKs, `@Deprecated` con warnings de compilación.

**Identificar a los consumidores.** No puedes deprecar responsablemente lo que no puedes medir. Requisitos: métricas por versión × endpoint × cliente (dimensiones: API key / client id, `User-Agent`, versión de SDK). Con eso respondes: ¿cuánto tráfico queda en v1?, ¿qué 20 clientes generan el 95% de ese tráfico?, ¿alguno es un partner crítico? La campaña de migración es cirugía dirigida (account managers llamando a esos 20), no un email masivo. Las APIs sin autenticación son las más difíciles de deprecar precisamente por esto.

**Comunicación fuera de banda, en capas:** entrada en el changelog y developer portal el día del anuncio; emails al owner técnico de cada API key activa en la versión deprecada (no al billing contact); recordatorios a 90/30/7 días; banner en el dashboard del developer portal; y para clientes enterprise, el aviso en el canal de soporte. La documentación de v1 se marca visiblemente como deprecada con link a la guía de migración, que debe incluir mapping campo a campo y ejemplos antes/después.

**Plazos típicos:** APIs públicas con ecosistema grande: 12–24 meses (Google y Salesforce se mueven en ese rango; los términos de servicio de APIs serias suelen comprometer un mínimo de 6–12 meses de aviso). Internas entre equipos: semanas o pocos meses, con el tracking en el backlog del consumidor. El error clásico es anunciar sin fecha de sunset ("deprecated" eterno): sin deadline no hay migración; v1 vive 8 años y el equipo mantiene dos códigos base para siempre.

**Brownouts programados.** Los emails no funcionan del todo: siempre queda tráfico de servicios olvidados que "funcionan". Un brownout devuelve temporalmente errores (503 o el error que verán tras el sunset, con body explicativo y los headers anteriores) en ventanas cortas y anunciadas — p. ej., 5 minutos, luego 1 hora, luego 24 horas, semanas antes del apagado real. GitHub lo hizo así al retirar la autenticación por password en la API (brownouts anunciados en 2020) y es ya práctica estándar: convierte un incidente futuro de madrugada en un incidente controlado en horario laboral, con el mensaje de error apuntando a la guía de migración. Tras el sunset definitivo: 410 Gone con body útil durante un tiempo, mejor que un 404 seco o un DNS muerto.

**Qué espera oír el entrevistador:** los dos RFC con su diferencia semántica, la dependencia dura entre deprecar y tener métricas por cliente, plazos realistas según audiencia, y brownouts como técnica concreta (con el ejemplo de GitHub). Senior plus: mencionar 410 Gone post-sunset y que la política de deprecación debe estar escrita en los términos del API desde el día uno.

## 12. ¿Qué papel juega un API Gateway en el versionado? Routing por versión y transformaciones para mantener versiones viejas sin duplicar backend
**Categoría:** API Gateway / Infraestructura · **Tipo:** Conceptual

### 📝 Respuesta resumen
El gateway desacopla la versión pública del despliegue interno: enruta `/v1` y `/v2` (por path o header) a servicios o releases distintos, y —más potente— puede mantener viva una versión vieja como **fachada**: transformando requests/responses v1 ↔ v2 en el edge para que exista un solo backend (el actual). Kong (plugins de routing y request/response-transformer), Apigee (policies AssignMessage/JavaScript), AWS API Gateway (stages + mapping templates VTL) y Spring Cloud Gateway (predicates + filters) implementan variantes de esto. El límite: las transformaciones sirven para cambios sintácticos (renombrar, reestructurar, defaults); los cambios semánticos siguen necesitando código.

### 📖 Respuesta detallada
**Routing por versión.** Los dos patrones básicos:
- *Por path:* `/v1/**` → upstream `orders-v1` (o al mismo servicio, que internamente resuelve), `/v2/**` → `orders-v2`. Trivial en cualquier gateway; en Kong son dos Routes hacia dos Services; en AWS API Gateway se modela con stages o con resources separados.
- *Por header:* en Spring Cloud Gateway:

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: orders-v2
          uri: lb://orders-service-v2
          predicates:
            - Path=/orders/**
            - Header=X-API-Version, 2(\.\d+)?
        - id: orders-v1-default
          uri: lb://orders-service-v1
          predicates:
            - Path=/orders/**
```

Esto habilita además despliegues canary por versión (pesos de tráfico), pinning de clientes concretos a un backend (por API key), y sunset gradual: el gateway puede inyectar los headers `Deprecation`/`Sunset` en todas las respuestas v1 sin tocar el backend — y ejecutar los brownouts de la pregunta 11 con una regla temporal.

**Versión como fachada (transformaciones).** El coste real del versionado es mantener N implementaciones. La alternativa: un solo backend (contrato actual) y una capa de adaptación por versión vieja en el edge. Ejemplo: v2 renombró `customer_name` → `customer.name` y añadió `currency` requerido. La fachada v1 en el gateway: al request v1 le añade `"currency": "USD"` y reestructura el campo; al response v2 le aplana `customer.name` de vuelta a `customer_name` y elimina los campos que v1 no conocía. En Apigee eso son policies (AssignMessage o un callout JavaScript); en AWS API Gateway, mapping templates en VTL; en Kong, `request-transformer`/`response-transformer` o un plugin Lua/WASM para lógica no trivial.

Este es exactamente el modelo de Stripe llevado al edge: Stripe lo implementa en aplicación (una cadena de módulos de transformación por versión, aplicados como capas de cebolla desde la versión actual hacia la fijada por la cuenta), pero el principio es idéntico: **una sola lógica de negocio, N adaptadores de contrato**, y cada versión vieja es solo un conjunto de transformaciones declarativas, baratas de testear con golden files.

**Límites y errores comunes:**
1. **Solo cubre lo sintáctico.** Si v2 cambió semántica (montos en unidades en vez de centavos, operación que pasó a asíncrona), una transformación de payload en VTL no lo arregla — eso necesita lógica, y meter lógica de negocio en el gateway es el anti-patrón clásico (gateway como ESB: intesteable, sin dueño claro, cuello de botella organizacional). Regla: el gateway adapta forma; el dominio vive en los servicios.
2. **La fachada necesita contrato y tests propios.** Las transformaciones son código de producción: contract tests de v1 contra la fachada en CI, o los clientes v1 se rompen con cambios del backend v2 que nadie mapeó.
3. **Doble mantenimiento silencioso:** cada campo nuevo en v2 obliga a decidir qué ve v1 (¿se omite? ¿se traduce?). Sin ese checklist en el proceso de cambio, la fachada se pudre.
4. **Observabilidad:** etiquetar métricas y logs con la versión resuelta en el gateway es lo que alimenta las métricas de deprecación.

**Qué espera oír el entrevistador:** routing por path/header con un ejemplo concreto de configuración, la idea de fachada (un backend, N adaptadores) con nombres de mecanismos reales (VTL, policies Apigee, transformers de Kong), la conexión con Stripe, y el criterio de dónde parar: transformación sintáctica en el edge sí, lógica de negocio en el gateway no.

## 13. Hypermedia/HATEOAS: ¿qué aporta realmente a la evolución de una API y por qué casi nadie lo usa?
**Categoría:** REST / Hypermedia · **Tipo:** Conceptual

### 📝 Respuesta resumen
HATEOAS (Hypermedia As The Engine Of Application State) es el nivel 3 del modelo de madurez de Richardson: las respuestas incluyen links que indican qué puedes hacer a continuación, y el cliente los sigue en vez de hardcodear URLs y flujos. Para la evolución promete mucho: el servidor puede cambiar URLs, mover recursos y activar/desactivar transiciones sin romper clientes. En la práctica se usa poco porque exige clientes genéricos que casi nadie escribe (los clientes reales hardcodean igualmente), infla payloads, complica el tooling y la mayor parte del breaking real es de esquema y semántica, que los links no resuelven. Aporta valor selectivo: workflows con estados (los links como affordances) y paginación por cursor — que es HATEOAS encubierto y sí funciona.

### 📖 Respuesta detallada
**Qué es, concretamente:**

```json
{
  "orderId": "o-123",
  "status": "PENDING_PAYMENT",
  "total": {"amount": 4999, "currency": "EUR"},
  "_links": {
    "self":    {"href": "/orders/o-123"},
    "payment": {"href": "/orders/o-123/payment", "method": "POST"},
    "cancel":  {"href": "/orders/o-123/cancellation", "method": "POST"}
  }
}
```

(formato HAL; alternativas: JSON:API, Siren, Collection+JSON). El contrato pasa de "lista de URLs documentadas" a "media type + relaciones (`rel`)": el cliente entra por una URL raíz y navega por `rel`s, como un humano navega una web sin memorizar URLs.

**Qué aportaría a la evolución, en teoría:** (1) URLs libres de cambiar — el servidor puede mover `/orders/{id}/payment` a `/payments?order={id}` y los clientes que siguen el link `payment` ni se enteran; (2) lógica de negocio en el servidor — si el pedido no es cancelable, el link `cancel` no aparece: el cliente no duplica la regla "cancelable si status ∈ {…}", que es una de las duplicaciones que más rompe cuando la regla cambia; (3) descubrimiento de capacidades nuevas mediante `rel`s nuevos, aditivos por naturaleza.

**Por qué se usa poco (el coste real):**
1. **El cliente genérico no existe.** El beneficio exige clientes que de verdad naveguen por `rel` y decidan UI según los links presentes. Los clientes reales (una app móvil, un microservicio consumidor) tienen flujos fijos compilados: aunque sigan el link, si `cancel` desaparece el botón de cancelar tiene que hacer *algo*, y ese algo estaba programado. La flexibilidad del servidor la paga el cliente en generalidad que casi nunca escribe.
2. **No ataca el breaking dominante.** Renombrar el campo `total`, cambiar centavos por unidades o añadir un campo requerido rompe exactamente igual con o sin links. HATEOAS versiona la *navegación*, no el *esquema* — y el esquema es donde ocurre el 90% de los incidentes.
3. **Fricción con el ecosistema:** OpenAPI modela links pobremente (existe `links` en OAS pero el codegen apenas lo usa), los SDKs generados exponen métodos tipados (no navegación), y el caching/CDN no gana nada. Payloads notablemente más grandes en colecciones.
4. **Coste servidor:** construir links correctos (con gateway delante, ¿qué host/path pública?) y decidir affordances por estado añade lógica y tests.

**Dónde sí compensa:** (a) **paginación por cursor** — `"next": "https://api.empresa.com/orders?cursor=eyJv..."` es hypermedia puro y es práctica universal precisamente porque el cliente *debe* tratar el cursor como opaco, dándole al servidor libertad total para cambiar la implementación de paginación sin breaking; (b) **máquinas de estados con UI dinámica** (banca, aprobaciones, checkout): los links como affordances eliminan la duplicación de reglas de negocio en el cliente; (c) APIs de larguísima vida con clientes que el proveedor controla (donde puede imponer el cliente navegacional). GitHub incluye `*_url` en sus responses y links RFC 8288 de paginación; PayPal usa HAL — pero ninguno pretende que sus clientes no conozcan URLs.

**Qué espera oír el entrevistador:** definición correcta con ejemplo, el argumento de evolución (URLs y affordances) y su refutación honesta (clientes no genéricos, breaking de esquema intacto), y el criterio pragmático: adoptar las piezas que pagan su coste — cursors opacos y links de acción en workflows — sin comprar la doctrina completa. Reconocer el trade-off en ambas direcciones es la señal de seniority.

## 14. Idempotencia y versionado de comportamiento: ¿por qué cambiar la semántica de una operación es un breaking change aunque el esquema no cambie?
**Categoría:** Semántica de operaciones / Diseño · **Tipo:** Conceptual

### 📝 Respuesta resumen
El contrato de una operación incluye su comportamiento: idempotencia, sincronía, atomicidad, efectos secundarios. Cambiar un PUT (reemplazo total, idempotente) por semántica de PATCH (parcial), convertir una operación síncrona (200 con el recurso) en asíncrona (202 con polling), o alterar cómo se procesa un retry, rompe a los clientes con el esquema intacto — ningún diff de OpenAPI lo detecta. La `Idempotency-Key` es el ejemplo canónico de comportamiento contractual: los clientes reintentan confiando en que la clave deduplica; cambiar su TTL, su alcance o su respuesta en conflicto es breaking. Por eso se versiona comportamiento, no solo esquema.

### 📖 Respuesta detallada
**Idempotency-Key como contrato.** El patrón (Stripe lo popularizó; hoy es draft del IETF, `draft-ietf-httpapi-idempotency-key-header`):

```http
POST /v1/charges HTTP/1.1
Idempotency-Key: 3f2a9c1e-8d44-4b6f-9a10-77f1c2d0aa55
Content-Type: application/json

{"amount": 4999, "currency": "eur", "source": "tok_visa"}
```

Semántica: si el cliente reintenta (timeout, red) con la misma clave, el servidor no ejecuta dos cobros — devuelve la respuesta original almacenada. El contrato de comportamiento incluye detalles finos de los que los clientes dependen: **TTL** de la clave (Stripe: 24h — reducirlo a 1h rompe a quien reintenta desde una cola con backoff largo), **alcance** (¿por endpoint o global? ¿misma clave con body distinto ⇒ 409/422 o ejecuta de nuevo?), **qué se almacena** (¿también los errores 5xx, o esos permiten reintento real?), y **comportamiento en vuelo** (segunda petición con la misma clave mientras la primera procesa ⇒ 409 con `Retry-After`). Cambiar cualquiera de estos es un breaking change invisible para oasdiff: el esquema es idéntico, el comportamiento no.

**Sync → async es breaking.** v1: `POST /reports` bloquea 20 s y devuelve `200` con el informe. v2 "mejora" a asíncrono: `202 Accepted`, `Location: /operations/op-1`, y el cliente debe hacer polling. Todo cliente existente rompe: esperaba el recurso en el body y recibe un puntero. La forma correcta: es una operación *nueva* (o una versión nueva), u opt-in explícito (`Prefer: respond-async`, RFC 7240, donde el servidor solo responde 202 a quien lo pidió). Lo mismo aplica al revés y a variantes: cambiar de entrega at-least-once a at-most-once en webhooks, o hacer que una operación antes atómica ahora aplique efectos parciales.

**PUT vs PATCH.** Por RFC 9110, PUT reemplaza la representación completa (idempotente por definición: campos omitidos se borran o resetean); PATCH aplica un cambio parcial (y no es idempotente en general — sí lo es con JSON Merge Patch, RFC 7386; puede no serlo con JSON Patch, RFC 6902, p. ej. una operación `add` sobre un array). El breaking sigiloso clásico: un servidor cuyo PUT "por comodidad" ignoraba los campos omitidos (semántica merge) y que en una versión posterior implementa PUT correcto — los clientes que enviaban payloads parciales empiezan a **borrar datos** en producción. La semántica accidental también es contrato (Hyrum's Law otra vez); corregirla es breaking y requiere versión o migración coordinada.

**Cómo se versiona el comportamiento en la práctica:**
1. Documentarlo como parte del contrato: OpenAPI no tiene campos para idempotencia o sincronía, así que va en `description` estructurada, en extensiones (`x-idempotency`, `x-long-running`) y sobre todo en tests: contract tests que reintentan con la misma clave y afirman "un solo cargo", tests que afirman `200` vs `202`.
2. Cambios de comportamiento ⇒ mismo tratamiento que cambios de esquema: versión nueva (Stripe agrupa estos cambios en sus versiones por fecha), o negociación explícita (`Prefer`), nunca un cambio silencioso in-place.
3. En el registro de decisiones/changelog, los cambios de comportamiento se listan como breaking aunque el diff del spec esté vacío — el proceso debe forzar la pregunta "¿cambia algo observable?" y no solo "¿cambia el YAML?".

**Qué espera oír el entrevistador:** que el contrato = esquema + comportamiento observable; el funcionamiento fino de Idempotency-Key (TTL, conflicto de body, respuesta almacenada) con Stripe como referencia; sync→async y PUT/PATCH como ejemplos concretos de breaking sin cambio de esquema; y la conclusión operativa: las herramientas de diff no cubren esto, hacen falta contract tests de comportamiento y disciplina de changelog.

## 15. Versionado de SDKs cliente: relación entre versión del SDK y versión de la API, generación automática y el modelo de pinning de Stripe
**Categoría:** SDKs / Developer Experience · **Tipo:** Conceptual

### 📝 Respuesta resumen
El SDK y la API tienen ciclos de vida distintos y por eso versiones distintas: el SDK sigue SemVer propio (puede tener una MAJOR por un cambio interno sin que la API cambie, y viceversa), pero cada versión del SDK está compilada contra una versión concreta del contrato — con OpenAPI, el pipeline regenera y publica SDKs en cada cambio del spec, y un breaking de API fuerza MAJOR del SDK. Stripe es el modelo de referencia: cada cuenta queda fijada (pinned) a una versión de API por fecha; cada MAJOR del SDK fija (pin) la versión de API que envía en cada request, garantizando que SDK y respuestas siempre se corresponden. La política de soporte debe decir cuánto viven las MAJOR viejas (típicamente 12–24 meses de fixes de seguridad).

### 📖 Respuesta detallada
**Dos ejes de versión, no uno.** Versión de API = contrato del servidor. Versión de SDK = artefacto de software (npm/Maven/PyPI) con su propio SemVer: una MAJOR del SDK puede deberse a subir la versión mínima de Java, cambiar el HTTP client interno o renombrar métodos, sin ningún cambio del lado servidor; y una API puede añadir campos sin que el SDK necesite más que un MINOR. El acoplamiento real es unidireccional: **cada release del SDK apunta a exactamente una versión del contrato**, y esa correspondencia debe ser explícita (en el changelog del SDK: "generado desde openapi.yaml v2024-06-20").

**El modelo Stripe, la referencia del sector:**
1. La cuenta queda *pinned* a la versión de API vigente en su primera petición; el servidor responde con esa versión para siempre salvo upgrade explícito (dashboard) u override por request con `Stripe-Version`.
2. Cada MAJOR de `stripe-java`/`stripe-node` lleva **hardcodeada** la versión de API contra la que se generaron sus tipos, y la envía en el header en cada request:

```java
// stripe-java: la librería fija la versión de API de sus tipos
// (internamente: Stripe.API_VERSION = "2024-06-20")
Customer c = Customer.retrieve("cus_123"); // envía Stripe-Version: 2024-06-20
```

El efecto: los tipos del SDK y el JSON que responde el servidor nunca divergen, aunque la cuenta esté pinned a otra versión. Actualizar de MAJOR de SDK ⇒ upgrade consciente de versión de API, con changelog de ambos delante. Es la solución limpia al bug clásico "el SDK deserializa mal porque el servidor responde con otra forma".

**Generación automática desde OpenAPI.** El pipeline maduro: el spec versionado en git dispara la regeneración multi-lenguaje (openapi-generator, o motores comerciales como Fern/Speakeasy/Stainless — Stripe y OpenAI usan generación propia/Stainless), corre los tests del SDK contra un mock del contrato (Prism) y contra sandbox real, y publica a los registries con la versión calculada: cambios aditivos ⇒ MINOR automático; oasdiff detecta breaking ⇒ exige MAJOR y bloquea el release hasta que un humano confirme. Trade-off honesto de los SDKs generados: consistencia y cobertura total del API a cambio de idiomaticidad (por eso los motores modernos permiten overlays/custom code por lenguaje). Regla operativa: **nunca editar a mano el código generado** — todo ajuste va en templates/overlays o se pierde en la siguiente generación.

**Política de soporte de versiones viejas.** Hay que publicarla, no improvisarla: qué MAJOR reciben features (solo la última), cuáles reciben fixes de seguridad (últimas dos, o ventana de 12–24 meses), y fecha EOL por MAJOR. Herramientas: marcar los paquetes como deprecated en el registry (`npm deprecate`), telemetría de `User-Agent` del SDK (los SDKs serios envían `stripe-node/14.2.0`) para medir adopción por versión y dirigir la campaña de migración — exactamente las métricas de la pregunta 11 aplicadas a SDKs. El anti-patrón: mantener vivas 5 MAJOR "porque algún cliente las usa" sin EOL, que multiplica el coste de cada cambio de API por 5.

**Errores comunes:** SDK que no envía versión de API (queda a merced del default del servidor: el pinning por cuenta salva, pero sin él cada upgrade del servidor puede romper la deserialización); versionar el SDK con el número de la API (imposibilita MAJOR del SDK por razones propias); y no probar los SDKs viejos soportados contra el servidor nuevo en CI (la matriz de compatibilidad debe ser un job, no una esperanza).

**Qué espera oír el entrevistador:** la separación de ejes (SemVer del SDK ≠ versión de API) con la correspondencia explícita release→contrato, el mecanismo completo de Stripe (pin por cuenta + pin por SDK + override por header), el pipeline de generación con gate de breaking, y una política de soporte con EOL medible por telemetría de User-Agent.

## 16. [CASO] Tras un release, un endpoint empieza a devolver 400 a un subconjunto de clientes que "no cambiaron nada". El equipo solo endureció la validación de un campo. Analiza el incidente y define cómo prevenirlo
**Categoría:** Compatibilidad / Operación · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Endurecer validación es un breaking change de request (pregunta 2, caso 6): payloads que antes se aceptaban ahora se rechazan, aunque el "contrato documentado" siempre dijera otra cosa — el contrato efectivo es lo que el servidor aceptaba (Hyrum's Law). Respuesta al incidente: medir el blast radius con logs (qué clientes, qué patrones de payload fallan), revertir o convertir la validación en *log-only*, contactar a los afectados. Prevención: tratar todo endurecimiento como breaking (versión nueva o migración coordinada), y desplegarlo en modo sombra — validar sin rechazar, medir violaciones por cliente durante semanas, avisar, y solo entonces hacer enforcement, idealmente con feature flag por cliente.

### 📖 Respuesta detallada
**Por qué pasó.** El equipo ve "arreglamos la validación: `phone` ahora exige E.164, antes aceptábamos cualquier string". Desde el lado cliente: "enviamos el mismo payload de los últimos 3 años y ahora responde 400". Ambos tienen razón, y por eso el criterio correcto no es "¿el cambio corrige un error?" sino "¿rechaza requests que antes tenían éxito?". Si sí, es breaking, sin importar lo que dijera la documentación: los clientes integran contra el comportamiento, no contra el PDF. Variantes del mismo incidente: acortar un `maxLength`, exigir un enum donde se aceptaba texto libre, rechazar campos desconocidos (`additionalProperties: false` nuevo), dejar de trimear espacios, validar checksum de un identificador que antes se guardaba tal cual.

**Gestión del incidente:**
1. **Blast radius.** Query sobre logs/métricas: tasa de 400 en el endpoint por API key y por regla de validación violada (esto exige que el response de error incluya un código de regla — otra razón para Problem Details con `type` estable). Distinguir: ¿son 3 clientes con un typo real, o 200 clientes con un formato legítimo que nunca documentamos?
2. **Mitigar.** Si el impacto es amplio: rollback del enforcement (idealmente es un flag, no un redeploy). Si la validación nueva protege de algo grave (inyección, corrupción de datos), alternativa quirúrgica: allowlist temporal de los clientes afectados con la validación vieja, enforcement para el resto.
3. **Comunicar** a los afectados con ejemplos concretos de sus payloads rechazados y el formato esperado, y plazo para corregir.

**El patrón de prevención: validación en sombra (shadow/report-only).** Es el equivalente API de `Content-Security-Policy-Report-Only`:

```java
ValidationResult r = strictValidator.validate(request);
if (!r.isValid()) {
  metrics.increment("validation.shadow.violation",
      Tags.of("rule", r.ruleId(), "client", apiKeyId));
  log.warn("shadow-validation ruleId={} client={} field={}", ...);
  // No se rechaza: la petición continúa con la validación vigente
}
```

Fases: (1) desplegar la regla en modo sombra; (2) observar 2–6 semanas: dashboard de violaciones por regla × cliente; (3) si hay violaciones legítimas, decidir — relajar la regla, o campaña dirigida a esos clientes (con las herramientas de la pregunta 11: emails, warnings en response tipo header `Warning`/campo `warnings[]`, deadline); (4) enforcement gradual con flag por cliente (primero clientes internos, luego los que ya cumplen, al final los rezagados tras el deadline); (5) retirar el flag. Con este pipeline, "endurecer validación" deja de ser un release arriesgado y se convierte en una migración medible.

**¿Y cuándo amerita versión nueva en lugar de migración?** Si la validación nueva cambia el modelo de datos aceptado de forma sustancial (no "formato de teléfono" sino "ahora `address` es un objeto estructurado obligatorio"), es un cambio de contrato de pleno derecho: va a `/v2` o a la siguiente versión por fecha, y v1 mantiene el comportamiento anterior vía fachada (pregunta 12). La validación en sombra cubre el caso intermedio y frecuente: endurecimientos que el 95% de los clientes ya cumple.

**Prevención sistémica:** clasificar "validación más estricta" como breaking en la checklist de PR y en las reglas de oasdiff (estrechar `pattern`/`maxLength`/enum en request lo detecta si el spec cambia — pero muchas validaciones viven solo en código, otro argumento para contract-first); contract tests con payloads reales grabados (los golden payloads de los top clientes deben pasar en CI contra cada release); y errores con códigos estables desde el día uno para poder medir cualquier rechazo por regla.

**Qué espera oír el entrevistador:** el reconocimiento inmediato de que endurecer validación es breaking (con Hyrum's Law como marco), un manejo de incidente basado en datos por cliente, y sobre todo el patrón de shadow validation con enforcement gradual por flag — la diferencia entre un mid que dice "habría que avisar antes" y un senior que describe el mecanismo completo de despliegue seguro del cambio.
