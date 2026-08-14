# Módulo 1 · Diseño de contratos

> **Curso 07 · APIs** · 150 min

## Por qué esto importa en la entrevista

Porque una API mal diseñada se paga durante años, y porque el entrevistador puede evaluar tu criterio en 5 minutos con una pizarra. Aquí no se trata de "REST vs GraphQL": se trata de si tus decisiones aguantan la evolución, la escala y el fallo.

## Modelo mental: la API es una promesa, no una función

Una vez publicada, **la forma de la respuesta es un contrato con gente que no controlas**. De ahí las tres reglas que gobiernan todo el curso:

1. Diseña para poder **añadir** sin romper.
2. Nunca reveles detalles internos que te aten (ids de base de datos secuenciales, nombres de tablas, estructura de tu ORM).
3. Todo lo que expones, lo mantendrás. Expón lo mínimo.

## REST bien hecho

**Recursos, no acciones:** `POST /pedidos/123/cancelaciones` mejor que `POST /cancelarPedido?id=123`. Cuando la acción no es un recurso natural, un sub-recurso o un verbo explícito es aceptable; lo que no es aceptable es una API RPC disfrazada de REST sin admitirlo.

**Códigos de estado con significado:**

| Código | Cuándo | Error clásico |
|---|---|---|
| 200 / 201 / 202 | OK / creado (con `Location`) / aceptado (asíncrono) | devolver 200 con `{"error": ...}` dentro |
| 400 | petición malformada | usarlo para errores de negocio |
| 401 / 403 | no autenticado / autenticado sin permiso | confundirlos |
| 404 | no existe (o no debes saber que existe) | filtrar existencia con 403 |
| 409 | conflicto de estado (versión, duplicado) | devolver 400 genérico |
| 422 | semánticamente inválido | opcional, pero sé coherente |
| 429 | rate limit — **con `Retry-After`** | omitir la cabecera |
| 5xx | fallo tuyo | devolver 500 por un error de validación |

**Errores con formato único.** Usa **RFC 9457 (Problem Details)** y quedas muy por encima de la media:

```json
{ "type": "https://api.ej.com/errors/stock-insuficiente",
  "title": "Stock insuficiente",
  "status": 409,
  "detail": "Quedan 2 unidades del SKU A-1",
  "instance": "/pedidos/123",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736" }
```

Incluye siempre un **código estable y legible por máquina** (`type` o `code`) —el `title` cambia, el código no— y el `traceId` para que el cliente pueda reportar. Nunca stacktraces ni mensajes internos.

**Paginación:** por **cursor** (`?cursor=...&limit=50`) para datos que cambian, porque el offset duplica y salta elementos cuando se insertan filas; offset solo para conjuntos estables y pequeños. Devuelve el cursor siguiente, no el total (contar es caro).

**Filtrado, orden y campos:** parámetros explícitos y **lista blanca**; nunca construyas SQL a partir de lo que llegue.

**Idempotencia en escrituras:** cabecera `Idempotency-Key` en `POST` ([curso 00 módulo 3](../00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)). Es la marca de una API pensada para un mundo con reintentos.

**Concurrencia:** `ETag` + `If-Match` para actualizaciones condicionales (bloqueo optimista sobre HTTP) → `412 Precondition Failed` si alguien se te adelantó.

**Operaciones largas:** `202 Accepted` + `Location: /operaciones/{id}` para consultar el estado, o webhook al terminar. Nunca dejes una petición HTTP abierta minutos.

**Cacheabilidad:** `Cache-Control`, `ETag`, `Last-Modified`. Una API pública sin política de caché desperdicia la mejor optimización disponible.

## Contract-first y OpenAPI

Escribe (o genera) el **contrato antes que el código** y trátalo como fuente de verdad:

- Genera clientes y stubs del servidor a partir de él (o valida que el código lo cumple).
- **Lint del contrato en CI** con Spectral (reglas propias: naming, errores, paginación obligatoria, ejemplos).
- **Detección automática de breaking changes** entre la versión del contrato en `main` y la de la rama (`oasdiff`, `openapi-diff`): que el pipeline falle es lo que convierte la teoría en práctica.
- Publica el contrato con ejemplos reales; un portal de documentación con "pruébalo" reduce el soporte a la mitad.

## gRPC y protobuf

Cuando el consumidor es interno y el volumen alto, protobuf aporta un contrato fuerte y **compatibilidad evolutiva por diseño**:

- Los campos se identifican por **número**, no por nombre: renombrar es compatible, **cambiar el número no**.
- Añadir un campo opcional es compatible; eliminarlo exige `reserved` para que nadie reutilice ese número (el fallo más caro y más silencioso).
- Cambiar el tipo de un campo rompe (salvo casos compatibles a nivel de wire).
- Los `enum` deben tener un valor cero `UNSPECIFIED` y los desconocidos deben tolerarse.

```protobuf
message Pedido {
  string id = 1;
  reserved 4;                 // campo eliminado: nunca reutilizar el número
  reserved "descuento_viejo";
  optional string cupon = 7;  // añadir es compatible
}
```

## GraphQL, en una diapositiva

Ventajas: el cliente pide lo que necesita (fin del over/under-fetching), un solo endpoint, esquema tipado y evolución **por deprecación de campos en lugar de versiones**. Costes: N+1 en resolvers (se resuelve con DataLoader/batching), caché HTTP mucho más difícil, autorización campo a campo, y consultas maliciosamente caras (defensa: límite de profundidad y complejidad, consultas persistidas).

Criterio: GraphQL brilla con muchos clientes distintos y necesidades de datos heterogéneas (BFF de varias apps); REST/gRPC para servicio a servicio y APIs públicas simples.

## Errores comunes que delatan a un no-senior

- 200 con un error dentro.
- Exponer ids autoincrementales y estructuras internas.
- Paginación por offset en listados grandes y cambiantes.
- Errores sin código estable ni formato común.
- No pensar en la idempotencia de las escrituras.
- Documentación escrita a mano y desincronizada del código.
- Reutilizar el número de un campo protobuf eliminado.

## 🧪 Laboratorio

1. **Rediseña una API real** tuya aplicando: Problem Details, cursor, `Idempotency-Key`, `ETag`/`If-Match` y `202` para lo largo. Documenta qué cambia para los clientes.
2. **Contract-first:** escribe el OpenAPI primero, genera el cliente TypeScript y el stub del servidor, e implementa. Anota cuántos malentendidos te ahorró.
3. **CI de contrato:** añade Spectral con 5 reglas propias y `oasdiff` para bloquear breaking changes. Rompe el contrato a propósito y comprueba que el pipeline falla.
4. **Protobuf:** elimina un campo sin `reserved`, reutiliza su número desde otro servicio y observa la corrupción silenciosa de datos. Luego hazlo bien.
5. **Carga con paginación:** compara offset vs cursor sobre una tabla de 5M de filas mientras insertas datos; mide duplicados/saltos y latencia.

## ✅ Autoevaluación

1. ¿Qué código devuelves para: sin permiso, conflicto de versión, rate limit, error de validación de negocio?
2. ¿Qué es RFC 9457 y qué campos incluyes siempre en un error?
3. ¿Por qué cursor en vez de offset?
4. ¿Cómo diseñas una escritura segura ante reintentos?
5. ¿Para qué sirven `ETag` e `If-Match`?
6. ¿Qué cambios en protobuf son compatibles y cuáles no?
7. ¿Cuándo GraphQL y qué problemas te trae?

## 🎯 Preguntas del banco que ya puedes responder

- [`versionamiento-apis/01-versionamiento-de-apis.md`](../../versionamiento-apis/01-versionamiento-de-apis.md) — diseño, errores, contract-first
- [`typescript-microservicios/02-node-y-microservicios.md`](../../typescript-microservicios/02-node-y-microservicios.md) — 7 (REST vs gRPC)
- [`golang-microservicios/02-microservicios-en-go.md`](../../golang-microservicios/02-microservicios-en-go.md) — 3, 4, 17

---

**Siguiente:** [Módulo 2 · Estrategias de versionado](02-estrategias-de-versionado.md)
