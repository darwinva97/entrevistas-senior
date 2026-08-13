# TypeScript Avanzado — Preguntas de Entrevista Senior

Colección de preguntas de nivel senior sobre el type system de TypeScript, tooling y patrones aplicados a microservicios, con respuestas resumidas y desarrollo profundo.

## 1. ¿Qué son los conditional types y cómo funciona `infer`?

**Categoría:** Type System · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un conditional type tiene la forma `T extends U ? X : Y`: elige un tipo según si `T` es asignable a `U`. `infer` permite "capturar" una parte de la estructura de `T` en una variable de tipo dentro de la rama `extends`, y usarla en la rama verdadera. Es la base de utilidades como `ReturnType`, `Awaited` o `Parameters`, y de cualquier utilidad propia que necesite desestructurar tipos (extraer el payload de un evento, el tipo de retorno de un handler, etc.).

### 📖 Respuesta detallada
Los conditional types se evalúan en tiempo de compilación y son el mecanismo de "control de flujo" del type system. La condición no es igualdad, es **asignabilidad**: `T extends U` pregunta "¿todo valor de `T` es válido donde se espera `U`?". Eso explica comportamientos que sorprenden: `"pending" extends string` es verdadero, pero `string extends "pending"` no.

`infer` solo puede aparecer en la cláusula `extends`, y declara una variable de tipo que el compilador rellena por unificación estructural. Ejemplo realista: en un gateway de pagos queremos derivar el tipo de resultado de cada handler sin duplicar declaraciones.

```typescript
type PaymentHandler = (req: { orderId: string; amount: number }) => Promise<{
  status: "approved" | "declined";
  transactionId: string;
}>;

// Versión propia de ReturnType + desempaquetado de Promise
type HandlerResult<T> = T extends (...args: any[]) => infer R
  ? R extends Promise<infer Inner>
    ? Inner
    : R
  : never;

type PaymentResult = HandlerResult<PaymentHandler>;
// { status: "approved" | "declined"; transactionId: string }
```

Puntos que un senior debe dominar:

- **`infer` con múltiples posiciones**: si `infer R` aparece en varias posiciones covariantes, el compilador infiere la **unión**; en posiciones contravariantes (parámetros de función), infiere la **intersección**. Esto es la base del truco `UnionToIntersection`.
- **Constraints sobre `infer`** (TS 4.7+): `T extends { id: infer Id extends string } ? Id : never` evita un segundo conditional para restringir lo inferido.
- **Recursión**: los conditional types pueden ser recursivos (`Awaited` desempaqueta promesas anidadas). Hay un límite de profundidad del compilador (~50 niveles en instantiation depth para recursión no tail); abusar de ello degrada el rendimiento de `tsc` y del IDE, algo muy relevante en monorepos grandes.
- **`Awaited<T>` ya existe**: reimplementarlo en producción es un smell; en entrevista se pide para demostrar la mecánica.

Errores comunes: usar `any` en la firma inferida y perder seguridad aguas abajo; olvidar la rama `: never` y devolver algo demasiado laxo; intentar usar `infer` fuera de `extends` (no compila); y no darse cuenta de que `T extends U ? X : Y` con `T` genérico y "naked" se **distribuye** sobre uniones (tema aparte, pregunta 2).

**Qué espera oír el entrevistador:** que la condición es asignabilidad y no igualdad, que `infer` unifica estructuralmente y su comportamiento unión/intersección según la varianza de la posición, un ejemplo real (extraer resultado de un handler/promesa), y conciencia de costes: recursión limitada, impacto en tiempos de compilación y preferir utilidades estándar (`ReturnType`, `Awaited`, `Parameters`) antes que reinventarlas.

## 2. Distributividad de conditional types: ¿por qué `Exclude` funciona y cuándo hay que desactivarla?

**Categoría:** Type System · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Cuando un conditional type se aplica sobre un parámetro de tipo "desnudo" (naked type parameter) y ese parámetro es una unión, el conditional se evalúa **por cada miembro** de la unión y los resultados se unen. Así funcionan `Exclude`, `Extract` o `NonNullable`. A veces es indeseable (quieres tratar la unión como un todo) y se desactiva envolviendo ambos lados en tuplas: `[T] extends [U]`.

### 📖 Respuesta detallada
Caso típico de entrevista: te muestran este código y preguntan por qué el resultado no es el esperado.

```typescript
type OrderStatus = "created" | "paid" | "shipped" | "cancelled";

// Queremos los estados "activos" (no terminales)
type ActiveStatus = Exclude<OrderStatus, "cancelled">;
// "created" | "paid" | "shipped"  ✅ gracias a la distributividad

// Implementación de Exclude en lib.d.ts:
// type Exclude<T, U> = T extends U ? never : T;
```

`Exclude` funciona porque `T` es naked: la unión se descompone, cada miembro se compara con `"cancelled"`, los que coinciden colapsan a `never`, y `never` desaparece de las uniones (`A | never = A`). Esa "absorción" de `never` es lo que hace el patrón tan potente.

Ahora el caso contrario, donde la distributividad rompe la intención:

```typescript
type IsExactlyString<T> = T extends string ? true : false;

type A = IsExactlyString<"paid" | 42>;
// boolean (true | false) — se distribuyó: "paid" → true, 42 → false

// Desactivando la distribución con tuplas:
type IsStringUnion<T> = [T] extends [string] ? true : false;
type B = IsStringUnion<"paid" | 42>; // false — la unión se evalúa entera
```

El truco `[T] extends [U]` funciona porque `[T]` ya no es un parámetro desnudo; el compilador compara las tuplas completas sin distribuir. Alternativas equivalentes: `T[] extends U[]` o intersecar con algo neutro, pero la tupla es la convención idiomática.

Detalles finos que marcan nivel:

- **Solo se distribuye sobre el parámetro naked evaluado**: `T extends U ? ... : ...` distribuye sobre `T`, no sobre `U`.
- **`never` como entrada**: como `never` es la unión vacía, `Distributivo<never>` es `never` sin evaluar ninguna rama. Si necesitas detectar `never` explícitamente, es obligatorio el patrón no distributivo: `[T] extends [never] ? true : false`. Es una pregunta trampa clásica.
- **`boolean` se distribuye** como `true | false`, lo que a veces produce resultados duplicados o ramas inesperadas.
- Caso real en microservicios: dado un tipo unión de eventos de dominio, `Extract<DomainEvent, { type: "order.paid" }>` selecciona la variante concreta para tipar un consumer sin duplicar interfaces. Ese patrón (filtrar discriminated unions con `Extract`) aparece constantemente en buses de eventos tipados.

Errores comunes: asumir que el conditional ve "la unión completa" y depurar durante horas un `boolean` inesperado; usar `T extends never` (siempre da `never` por distribución sobre la unión vacía) en lugar de `[T] extends [never]`; y abusar de conditional types distribuidos sobre uniones enormes (cada miembro es una instanciación: coste de compilación).

**Qué espera oír el entrevistador:** la definición precisa (naked type parameter + unión ⇒ evaluación miembro a miembro), cómo `Exclude`/`Extract` dependen de ello y de la absorción de `never`, el patrón `[T] extends [U]` para desactivarla, y las trampas de `never` y `boolean`. Un plus: mencionar `Extract` para seleccionar variantes de un discriminated union de eventos.

## 3. Mapped types: key remapping con `as` y modificadores `+/-`

**Categoría:** Type System · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un mapped type itera sobre las claves de un tipo (`[K in keyof T]`) y produce un tipo nuevo transformando valores, claves o modificadores. Con `as` puedes renombrar o filtrar claves (key remapping), y con `+`/`-` añades o quitas `readonly` y `?`. Es cómo están implementados `Partial`, `Required`, `Readonly` y `Pick`, y permite derivar DTOs, getters o versiones inmutables de modelos sin duplicación.

### 📖 Respuesta detallada
La sintaxis completa es `{ [K in Keys as NewKey]±readonly±?: Tipo }`. Los modificadores por defecto **copian** lo que había en el tipo origen; `+` los fuerza y `-` los elimina:

```typescript
interface User {
  readonly id: string;
  email: string;
  phone?: string;
}

// Quita readonly y opcionalidad: forma "editable y completa"
type Draft<T> = {
  -readonly [K in keyof T]-?: T[K];
};
// Draft<User> = { id: string; email: string; phone: string }
```

El key remapping con `as` (TS 4.1+) habilita dos patrones fundamentales:

**1. Renombrado con template literal types** — generar APIs derivadas:

```typescript
interface OrderState {
  status: "pending" | "paid";
  total: number;
}

type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};
// { getStatus: () => "pending" | "paid"; getTotal: () => number }
```

El `string & K` es necesario porque `keyof T` incluye potencialmente `symbol` y `number`, y los template literals solo aceptan tipos "stringificables". Detalle que un senior debe saber explicar.

**2. Filtrado de claves** — mapear a `never` elimina la propiedad:

```typescript
// Quedarse solo con los métodos de un servicio (p. ej., para un proxy RPC)
type OnlyMethods<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any ? K : never]: T[K];
};

// O eliminar campos sensibles antes de serializar:
type PublicUser = {
  [K in keyof User as K extends "passwordHash" | "internalNotes" ? never : K]: User[K];
};
// (equivalente a Omit, pero el mecanismo es este)
```

Puntos avanzados:

- **Homomorfismo**: un mapped type sobre `keyof T` ("homomórfico") preserva modificadores y, crucialmente, se distribuye sobre uniones y preserva tuplas/arrays (`Partial<[string, number]>` sigue siendo una tupla). Si mapeas sobre un conjunto arbitrario de claves (`[K in "a" | "b"]`), pierdes esas propiedades.
- **`as` con uniones de claves**: puedes duplicar claves mapeando una clave a varias (`as K | `\`${K}Changed\``), útil para generar tipos de eventos.
- **Mapped types sobre uniones vía `in`**: `{ [E in DomainEvent as E["type"]]: (e: E) => void }` genera un mapa handler-por-evento a partir de un discriminated union: patrón oro para consumers de mensajería tipados.

Errores comunes: intentar `Partial` profundo con el `Partial` estándar (es shallow; el deep requiere recursión y tiene coste); olvidar `string & K`; usar interfaces cuando se necesita transformar (las interfaces no pueden ser mapped types); y romper el homomorfismo sin darse cuenta, perdiendo `readonly`/`?` originales.

**Qué espera oír el entrevistador:** la sintaxis de modificadores con `+/-` y que por defecto se copian, key remapping con `as` incluyendo el filtrado vía `never`, el detalle de `string & K`, y al menos un uso real: derivar DTOs públicos, mapas de handlers de eventos, o getters. Un plus fuerte: explicar qué es un mapped type homomórfico y sus implicaciones.

## 4. Template literal types: rutas y eventos tipados

**Categoría:** Type System · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Los template literal types construyen y descomponen tipos string a nivel de tipos: `` `order.${OrderAction}` `` produce la unión de todas las combinaciones. Combinados con `infer` permiten *parsear* strings en tiempo de compilación: extraer parámetros de una ruta (`/orders/:id`), tipar nombres de eventos de un bus, o claves de configuración. Convierten convenciones de strings —la mayor fuente de bugs silenciosos en microservicios— en contratos verificados por el compilador.

### 📖 Respuesta detallada
Caso real: un event bus donde los topics siguen la convención `entidad.acción` y cada topic tiene su payload. Sin tipos, un typo en el nombre del topic se descubre en producción; con template literals, no compila.

```typescript
type Entity = "order" | "payment" | "user";
type Action = "created" | "updated" | "cancelled";

type Topic = `${Entity}.${Action}`;
// "order.created" | "order.updated" | ... (9 combinaciones)

interface Payloads {
  "order.created": { orderId: string; total: number };
  "payment.updated": { paymentId: string; status: string };
  // ...
}

function publish<T extends keyof Payloads>(topic: T, payload: Payloads[T]) { /* ... */ }

publish("order.created", { orderId: "o-1", total: 99 }); // ✅
// publish("order.craeted", ...) — error de compilación, typo detectado
```

El segundo superpoder es el **parsing con `infer`**. Ejemplo canónico: extraer los parámetros de una ruta HTTP al estilo Express:

```typescript
type PathParams<Path extends string> =
  Path extends `${infer _Start}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof PathParams<`/${Rest}`>]: string }
    : Path extends `${infer _Start}:${infer Param}`
      ? { [K in Param]: string }
      : {};

type P = PathParams<"/orders/:orderId/items/:itemId">;
// { orderId: string; itemId: string }

declare function get<Path extends string>(
  path: Path,
  handler: (params: PathParams<Path>) => void
): void;

get("/orders/:orderId/items/:itemId", (params) => {
  params.orderId; // ✅ string
  // params.orderid — error: no existe
});
```

La recursión avanza segmento a segmento; el compilador unifica cada `infer` con la porción de string correspondiente. Este es exactamente el mecanismo que usan Hono, tRPC o los routers tipados modernos.

Herramientas asociadas que conviene citar:

- **Intrinsics**: `Uppercase`, `Lowercase`, `Capitalize`, `Uncapitalize` son tipos intrínsecos del compilador, combinables con key remapping (`getStatus`, `onOrderCreated`).
- **Inferencia de literales**: para que `get("/orders/:id", ...)` funcione, el parámetro debe ser genérico `Path extends string`; si lo anotas como `string`, el literal se ensancha (widening) y pierdes toda la información.
- **Límites**: TS expande las combinaciones; con uniones grandes el producto cartesiano explota (hay un tope y el error "expression produces a union type that is too complex"). No modeles IDs dinámicos con template literals: son para **convenciones finitas**, no para datos.

Errores comunes: intentar validar formatos abiertos (emails, UUIDs) con template literals —para eso está la validación runtime o branded types—; olvidarse del widening y perder los literales; y crear parsers recursivos innecesariamente complejos que castigan el rendimiento del IDE.

**Qué espera oír el entrevistador:** que generan uniones por producto cartesiano, el patrón de parsing con `infer` recursivo aplicado a rutas o topics, la necesidad de genéricos para preservar literales, y los límites prácticos (explosión combinatoria, no sirven para datos dinámicos). El caso del event bus tipado con mapa topic→payload es la respuesta estrella en un contexto de microservicios.

## 5. Varianza: covarianza, contravarianza, `strictFunctionTypes` y bivarianza de métodos

**Categoría:** Type System · **Tipo:** Conceptual

### 📝 Respuesta resumen
La varianza describe cómo se relaciona la asignabilidad de tipos compuestos con la de sus componentes. Las posiciones de salida (retornos, propiedades de lectura) son **covariantes**: `Handler<OrderPaid>` produce algo más específico sin romper a nadie. Los parámetros de función son **contravariantes** con `strictFunctionTypes`: una función que acepta `Event` sirve donde se espera una que acepta `OrderPaid`, no al revés. Los **métodos** declarados con sintaxis de método se comparan bivariantemente (excepción deliberada), y los arrays mutables son covariantes de forma insegura por diseño pragmático.

### 📖 Respuesta detallada
La intuición: es seguro **devolver algo más específico** y **aceptar algo más general**. Formalizado sobre un caso de mensajería:

```typescript
interface Event { id: string }
interface OrderPaid extends Event { orderId: string; amount: number }

type Handler<E> = (event: E) => void;

declare function subscribeToOrderPaid(h: Handler<OrderPaid>): void;
declare function subscribeToAny(h: Handler<Event>): void;

const generic: Handler<Event> = (e) => console.log(e.id);
const specific: Handler<OrderPaid> = (e) => console.log(e.amount);

subscribeToOrderPaid(generic);  // ✅ contravarianza: acepta más de lo necesario
// subscribeToAny(specific);    // ❌ con strictFunctionTypes: leería .amount
                                //    en eventos que no lo tienen
```

Sin `strictFunctionTypes` (incluido en `strict`), la segunda asignación compilaría: los parámetros se compararían **bivariantemente** (en ambos sentidos), un agujero de seguridad histórico.

**La excepción de los métodos**: aun con `strictFunctionTypes`, las firmas declaradas con *method syntax* (`handle(e: E): void` dentro de interface/clase) siguen siendo bivariantes. Es deliberado: sin ello, patrones idiomáticos como `Array<OrderPaid>` asignable a `Array<Event>` serían imposibles, porque `push(item: T)` haría a `Array` invariante. La consecuencia práctica: si quieres chequeo estricto, declara las propiedades como *function properties*:

```typescript
interface StrictConsumer<E> {
  handle: (event: E) => void;  // property syntax -> contravariante estricta
}
interface LooseConsumer<E> {
  handle(event: E): void;      // method syntax -> bivariante
}
```

**Arrays mutables**: TS trata `OrderPaid[]` como asignable a `Event[]` (covarianza), lo cual es incorrecto para escritura:

```typescript
const paidEvents: OrderPaid[] = [];
const events: Event[] = paidEvents;      // ✅ compila (unsound por diseño)
events.push({ id: "e-1" });              // 💥 mete un Event pelado en OrderPaid[]
paidEvents[0].amount.toFixed(2);         // runtime error: amount undefined
```

La mitigación idiomática es `readonly Event[]` / `ReadonlyArray`: al eliminar la escritura, la covarianza vuelve a ser segura. Regla práctica senior: **acepta `readonly T[]` en las firmas públicas** de tus servicios.

Desde TS 4.7 existen las anotaciones explícitas `in`/`out` en parámetros genéricos (`interface Producer<out T>`), útiles para documentar intención y acelerar el chequeo en tipos recursivos, aunque el compilador normalmente la infiere.

Errores comunes: creer que "más específico siempre es asignable" (cierto en salidas, falso en entradas); desactivar `strict` y heredar bivarianza silenciosa; exponer arrays mutables en contratos compartidos entre servicios; y no saber explicar por qué un `Handler<OrderPaid>` no puede suscribirse a un topic genérico.

**Qué espera oír el entrevistador:** las definiciones con un ejemplo direccional claro, qué activa exactamente `strictFunctionTypes` y que **no** cubre method syntax, el porqué pragmático de la bivarianza de métodos (arrays), la covarianza insegura de los arrays mutables y su mitigación con `readonly`. Mencionar `in`/`out` es un extra que distingue.

## 6. Type narrowing: type guards con `is`, discriminated unions, `asserts` y exhaustividad con `never`

**Categoría:** Type System · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Narrowing es cómo el compilador refina un tipo dentro de un bloque según evidencia runtime: `typeof`, `instanceof`, `in`, comparación de discriminantes. Los user-defined type guards (`arg is T`) y las assertion functions (`asserts arg is T`) permiten encapsular esa evidencia en funciones reutilizables. Con discriminated unions + `switch` sobre el discriminante + un default que exige `never`, obtienes **exhaustividad verificada**: añadir una variante nueva rompe la compilación en todos los sitios que no la manejan.

### 📖 Respuesta detallada
El patrón central en microservicios es el discriminated union para modelar eventos o estados:

```typescript
type PaymentEvent =
  | { type: "payment.authorized"; paymentId: string; amount: number }
  | { type: "payment.captured"; paymentId: string; capturedAt: string }
  | { type: "payment.failed"; paymentId: string; reason: string };

function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
}

function handle(event: PaymentEvent): string {
  switch (event.type) {
    case "payment.authorized":
      return `auth ${event.amount}`;      // narrowed a la variante exacta
    case "payment.captured":
      return `captured ${event.capturedAt}`;
    case "payment.failed":
      return `failed: ${event.reason}`;
    default:
      return assertNever(event);          // event es never si cubrimos todo
  }
}
```

Si mañana se añade `"payment.refunded"` a la unión, `assertNever(event)` deja de compilar porque `event` ya no es `never`. Ese error de compilación distribuido por todo el código es exactamente lo que quieres al evolucionar contratos de eventos. Alternativa moderna: `event satisfies never` en el default, sin función auxiliar.

**Type guards con predicado `is`** encapsulan checks que el compilador no puede inferir solo:

```typescript
function isPaymentEvent(msg: unknown): msg is PaymentEvent {
  return (
    typeof msg === "object" && msg !== null &&
    "type" in msg && typeof (msg as any).type === "string" &&
    (msg as any).type.startsWith("payment.")
  );
}
```

Peligro clave: el predicado es **una promesa no verificada en su totalidad**. Si el cuerpo valida mal (aquí solo miramos `type`, no `amount`), el compilador te creerá igualmente y el bug se traslada aguas abajo con un tipo "seguro". Por eso en fronteras de red la validación seria se delega a Zod (pregunta 16) y los guards manuales se reservan para refinamientos internos baratos.

**Assertion functions** (`asserts x is T` o `asserts condition`) lanzan en vez de devolver boolean, y estrechan el tipo en el resto del scope:

```typescript
function assertDefined<T>(value: T | null | undefined, name: string): asserts value is T {
  if (value == null) throw new Error(`${name} is required`);
}

const order = await repo.findById(id); // Order | null
assertDefined(order, "order");
order.total; // ✅ Order a partir de aquí
```

Detalle sutil: las assertion functions requieren **anotación explícita de tipo** en la variable que las contiene (no se infieren desde una arrow function sin tipo declarado).

Otros mecanismos que conviene citar: narrowing por `in` (`"capturedAt" in event`), por `instanceof` (útil con jerarquías de errores propios), y el análisis de aliased conditions (TS 4.4: guardar el check en una `const` y usarla después conserva el narrowing).

Errores comunes: discriminantes no literales (`type: string` en vez de literal) que rompen el narrowing; guards mentirosos; olvidar el default exhaustivo y enterarse en producción de la variante nueva; y mutar la variable después del check (el narrowing se invalida ante asignaciones o closures).

**Qué espera oír el entrevistador:** el trío discriminated union + switch + `never` exhaustivo con el argumento de evolución de contratos, la diferencia entre `is` y `asserts`, y —lo más senior— la advertencia de que los predicados son promesas sin verificar y que la frontera de red exige validación runtime real.

## 7. Branded types: tipado nominal sobre un sistema estructural

**Categoría:** Type System / Diseño de dominio · **Tipo:** Conceptual

### 📝 Respuesta resumen
TypeScript es estructural: dos tipos con la misma forma son intercambiables. Eso hace que `UserId` y `OrderId` definidos como alias de `string` sean idénticos para el compilador, y pasar uno donde va el otro compila y falla en producción. Un branded (o nominal) type añade una marca fantasma —una propiedad que solo existe a nivel de tipos— para que el compilador los distinga sin coste runtime. Se crean solo mediante funciones constructoras/validadoras, convirtiendo invariantes de dominio en garantías de compilación.

### 📖 Respuesta detallada
El bug que motiva el patrón es tan simple como letal en un sistema de pedidos:

```typescript
type UserId = string;
type OrderId = string;

declare function refundOrder(orderId: OrderId, userId: UserId): void;

declare const userId: UserId;
declare const orderId: OrderId;
refundOrder(userId, orderId); // ✅ compila... argumentos intercambiados 💥
```

Con branding:

```typescript
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

// Único punto de entrada: smart constructor que valida
function toOrderId(raw: string): OrderId {
  if (!/^ord_[a-z0-9]{12}$/.test(raw)) throw new Error(`Invalid OrderId: ${raw}`);
  return raw as OrderId; // el único "as" permitido, encapsulado aquí
}

refundOrder(userId, orderId);   // ❌ ahora no compila: brands incompatibles
refundOrder(orderId, userId);   // ✅
```

Claves del diseño:

- **Coste cero en runtime**: la propiedad `[brand]` no existe en el objeto real; es puramente un artefacto del type system. `OrderId` sigue siendo un `string` serializable, comparable, usable como clave.
- **`unique symbol` vs string literal**: `{ __brand: "OrderId" }` funciona, pero cualquiera puede fabricar el tipo estructuralmente; con un `unique symbol` no exportado, la única vía de creación es tu constructor. Es la diferencia entre "nominal por convención" y "nominal de verdad".
- **El `as` se encapsula**: el cast vive solo dentro del smart constructor, junto a la validación. Fuera de ese módulo, nadie castea. Esto conecta con "parse, don't validate": una vez que tienes un `OrderId`, ya no re-validas; el tipo **es** la prueba.
- **Dónde brandear**: IDs (`UserId`, `OrderId`, `PaymentId`), unidades (`Cents` vs `Euros` — el clásico bug de multiplicar por 100 dos veces), strings peligrosos (`SanitizedHtml`, `SqlFragment`), y valores validados (`Email`, `PositiveAmount`).
- **Integración con Zod**: `z.string().uuid().brand<"OrderId">()` genera el branded type y la validación de una vez, ideal en fronteras HTTP/mensajería.

Trade-offs honestos: fricción en tests y fixtures (necesitas los constructores o helpers `unsafeCoerce` de test), los brands desaparecen al serializar (al deserializar en otro servicio hay que re-validar: el brand no viaja por la red), y sobre-brandear todo genera ruido — se aplica donde la confusión es plausible y cara (dinero, IDs, seguridad).

Errores comunes: exportar el símbolo o permitir `as OrderId` por todo el codebase (mata la garantía); brandear con interfaces vacías que cualquier objeto satisface; y creer que el brand aporta algo en runtime.

**Qué espera oír el entrevistador:** el porqué (structural typing hace indistinguibles los alias), la mecánica de la intersección con propiedad fantasma y `unique symbol`, el patrón smart constructor con el `as` encapsulado, ejemplos de dinero/IDs, y los trade-offs (serialización, tests). Citar "parse, don't validate" y el brand de Zod señala experiencia real.

## 8. `satisfies` vs anotación de tipo vs `as`: ¿cuándo usar cada uno?

**Categoría:** Type System · **Tipo:** Conceptual

### 📝 Respuesta resumen
Anotar (`const x: T`) valida contra `T` pero **ensancha** el tipo de la variable a `T`, perdiendo literales e inferencia fina. `as` no valida: **impone** un tipo y solo protesta si los tipos son totalmente incompatibles; es la herramienta más peligrosa. `satisfies` (TS 4.9) valida contra `T` **sin cambiar el tipo inferido**: obtienes chequeo + autocompletado exacto. Regla práctica: `satisfies` para configuraciones y mapas constantes, anotación para contratos públicos de funciones, `as` casi nunca fuera de fronteras controladas (`as const` aparte, que es otra cosa).

### 📖 Respuesta detallada
El ejemplo canónico es un mapa de configuración de rutas o feature flags:

```typescript
type RouteConfig = Record<string, { method: "GET" | "POST"; auth: boolean }>;

// ── Con anotación: valida, pero pierde las claves concretas
const routesAnnotated: RouteConfig = {
  createOrder: { method: "POST", auth: true },
  getOrder: { method: "GET", auth: true },
};
routesAnnotated.createOrder.method; // tipo: "GET" | "POST" (perdió "POST")
// routesAnnotated.nonExistent — ✅ compila: Record acepta cualquier string 😱

// ── Con satisfies: valida Y conserva la inferencia
const routes = {
  createOrder: { method: "POST", auth: true },
  getOrder: { method: "GET", auth: true },
} satisfies RouteConfig;

routes.createOrder.method; // tipo: "POST" — literal preservado
// routes.nonExistent      — ❌ error: la clave no existe
```

Con la anotación, la variable **adopta** `RouteConfig`: el acceso a claves inexistentes compila (es un `Record<string, ...>`) y los literales se diluyen. Con `satisfies`, el compilador comprueba compatibilidad y luego **olvida** el tipo objetivo, quedándose con lo inferido, que es más preciso. Es "chequea, no ensanches".

**`as` es otra categoría**: no comprueba la forma, la afirma. Solo rechaza casts entre tipos sin solapamiento (y `as unknown as T` salta incluso eso). Cada `as` es un punto ciego del compilador:

```typescript
const cfg = { method: "GET", auth: true } as { method: "GET" | "POST" };
// compila aunque falte o sobre información — as no dispara excess property checks
```

Usos legítimos y acotados de `as`: el interior de un type guard o smart constructor (donde la validación runtime respalda la afirmación), interoperar con APIs mal tipadas, y `as const` — que no es un cast sino una petición de inferencia literal/readonly, perfectamente segura y combinable: `[...] as const satisfies readonly Topic[]`.

Matices que suman puntos:

- **Excess property checks**: la anotación y `satisfies` disparan el chequeo de propiedades sobrantes en literales; `as` lo esquiva. `satisfies` es la forma de mantener ese chequeo sin sacrificar inferencia.
- **Dónde sí anotar**: firmas públicas de funciones y valores exportados de librerías. Ahí quieres el contrato estable, no la inferencia más fina; la anotación documenta y aísla de cambios internos.
- **`satisfies` + `as const`**: el combo para catálogos inmutables (lista de topics, tabla de errores) donde quieres literales exactos, readonly y verificación contra el contrato, todo a la vez.
- **Límite de `satisfies`**: no crea un tipo reutilizable ni convierte nada; si necesitas exponer exactamente `RouteConfig` hacia fuera, anota o re-tipa en la frontera.

Errores comunes: resolver errores de tipos con `as` en vez de arreglar el modelo ("cast-driven development"); anotar mapas con `Record<string, T>` y perder la detección de claves inexistentes; y desconocer que `as unknown as T` desactiva por completo cualquier chequeo.

**Qué espera oír el entrevistador:** la distinción de tres mecanismos (validar y ensanchar / validar y preservar / afirmar sin validar), el ejemplo del `Record` con claves perdidas, cuándo cada uno es apropiado, y una postura clara de higiene: `as` es deuda salvo en fronteras validadas. Mencionar `as const satisfies` y los excess property checks demuestra uso real de TS moderno.


## 9. Generics avanzados: constraints, defaults, inferencia parcial y sobre-genericidad

**Categoría:** Type System / Diseño de API · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los generics capturan relaciones entre entradas y salidas. Las constraints (`T extends ...`) acotan lo aceptable y habilitan operar sobre `T` dentro de la función; los defaults (`T = ...`) dan ergonomía cuando no hay nada que inferir. TypeScript no soporta inferencia parcial de argumentos de tipo (todo o nada), lo que se sortea con currying o builders. El error senior más común es la sobre-genericidad: un parámetro de tipo que aparece una sola vez en la firma no relaciona nada y debería ser un tipo concreto o `unknown`.

### 📖 Respuesta detallada
Un genérico bien diseñado expresa una **relación**. Ejemplo: un repositorio genérico donde la clave devuelta depende de la entidad:

```typescript
interface Entity { id: string }

interface Repository<T extends Entity> {
  findById(id: T["id"]): Promise<T | null>;
  save(entity: T): Promise<T>;
  findBy<K extends keyof T>(field: K, value: T[K]): Promise<T[]>;
}

interface Order extends Entity { total: number; status: "pending" | "paid" }
declare const orders: Repository<Order>;

orders.findBy("status", "paid");   // ✅ value chequeado contra T["status"]
// orders.findBy("status", 42);    // ❌ 42 no es "pending" | "paid"
// orders.findBy("totall", 10);    // ❌ clave inexistente
```

`K extends keyof T` es la constraint estrella: liga el nombre del campo con el tipo del valor. Sin ella, `findBy(field: string, value: unknown)` compila cualquier cosa.

**Defaults** (`<T = DefaultType>`): útiles en tipos de librería (`ApiResponse<TData = unknown>`) para no obligar a parametrizar siempre. Ojo: el default no participa en inferencia; solo aplica cuando el parámetro ni se pasa ni se puede inferir.

**Inferencia parcial y currying**: si pasas un argumento de tipo explícito, debes pasarlos todos. Caso real: un factory de clientes HTTP tipados donde quieres fijar el tipo de respuesta pero inferir la ruta:

```typescript
// ❌ deseo imposible: fetchJson<OrderDto>(url) infiriendo el resto
// ✅ patrón currying: separar en dos llamadas
function createFetcher<TResponse>() {
  return <TPath extends string>(path: TPath, params: PathParams<TPath>) =>
    fetch(path).then((r) => r.json() as Promise<TResponse>);
}

const fetchOrder = createFetcher<{ orderId: string; total: number }>();
fetchOrder("/orders/:orderId", { orderId: "o-1" }); // TPath inferido, TResponse fijado
```

Este patrón (dos funciones anidadas: la externa recibe el tipo explícito, la interna infiere) es cómo lo resuelven Zod, tRPC o React Query internamente. La propuesta de inferencia parcial (`fetchJson<OrderDto, _>`) lleva años abierta; hay que saber el workaround.

**Sobre-genericidad**, el anti-patrón que delata inexperiencia:

```typescript
// ❌ T aparece una vez: no relaciona nada, solo estorba
function logPayload<T>(payload: T): void { console.log(payload); }
// ✅ equivalente y más honesto
function logPayload(payload: unknown): void { console.log(payload); }
```

Regla de oro (de las guidelines oficiales de TS): un type parameter debe aparecer **al menos dos veces** (relacionar dos entradas, o una entrada con la salida). Otros errores comunes: constraints que repiten lo que la función no necesita (`T extends { id: string; name: string }` cuando solo usas `id`), devolver `T` cuando en realidad devuelves algo construido (cast oculto), y el clásico malentendido de que `T extends Entity` "convierte" T en Entity — dentro de la función solo puedes asumir la constraint, y los literales del caller se preservan fuera.

También vale mencionar `NoInfer<T>` (TS 5.4), que marca una posición para que **no** contribuya a la inferencia — útil cuando dos parámetros compiten y uno debe mandar (p. ej., lista de opciones vs valor por defecto).

**Qué espera oír el entrevistador:** que los generics expresan relaciones y no "flexibilidad", el patrón `K extends keyof T`, la limitación todo-o-nada de los argumentos de tipo y el workaround por currying, la regla "si aparece una vez, sobra", y idealmente `NoInfer` o el detalle de que los defaults no participan en inferencia.

## 10. Structural typing: excess property checks y compatibilidad accidental

**Categoría:** Type System · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
En TypeScript la compatibilidad es por forma, no por nombre. Ventaja: flexibilidad y tipado de código JS real. Riesgos: dos tipos de dominio distintos con la misma forma son intercambiables (un `CancelOrderCommand` donde iba un `RefundCommand`), y un objeto "más ancho" pasa como el tipo estrecho perdiendo campos silenciosamente. Los excess property checks mitigan esto pero **solo con literales frescos**: asignar a través de una variable intermedia los desactiva. Las defensas: branded types, discriminantes explícitos y validación en fronteras.

### 📖 Respuesta detallada
Caso de análisis típico: ¿por qué esto compila y provoca un incidente?

```typescript
interface CancelOrder { orderId: string; reason: string }
interface RefundOrder { orderId: string; reason: string }

declare function executeRefund(cmd: RefundOrder): void;

const cancel: CancelOrder = { orderId: "o-9", reason: "customer request" };
executeRefund(cancel); // ✅ compila: misma forma ⇒ mismo tipo a efectos prácticos
```

Para el compilador `CancelOrder` y `RefundOrder` son **idénticos**. El nombre de la interface es documentación, no identidad. En un dominio donde cancelar y reembolsar son operaciones distintas, esto es una bomba. Soluciones: discriminante literal (`kind: "cancel-order"` / `kind: "refund-order"`), que además habilita narrowing, o branded types si el payload debe seguir siendo plano.

El segundo riesgo es el **estrechamiento silencioso**. Cualquier objeto con *al menos* las propiedades requeridas es asignable:

```typescript
interface OrderSummary { orderId: string; total: number }

const fullOrder = {
  orderId: "o-1",
  total: 99,
  customerEmail: "ana@example.com", // PII
  internalNotes: "VIP, no cobrar envío",
};

function publishSummary(summary: OrderSummary) {
  broker.publish("order.summary", JSON.stringify(summary)); // 💥 serializa TODO
}
publishSummary(fullOrder); // ✅ compila: fullOrder ⊇ OrderSummary
```

El tipo dice `OrderSummary`, pero el **valor** sigue llevando el email y las notas internas: `JSON.stringify` filtra PII a un topic compartido. El tipo estático no recorta el objeto. La defensa es mapear explícitamente (`{ orderId: o.orderId, total: o.total }`) o `pick` en la frontera de salida.

**Excess property checks**: la excepción que confunde. Con un **objeto literal fresco** asignado directamente a un tipo, TS sí rechaza propiedades sobrantes:

```typescript
declare function createUser(input: { email: string; name?: string }): void;

createUser({ email: "a@b.com", nmae: "Ana" }); // ❌ "nmae" no existe: typo cazado
const input = { email: "a@b.com", nmae: "Ana" };
createUser(input);                              // ✅ compila: ya no es literal fresco
```

El chequeo existe precisamente porque en un literal recién escrito una propiedad extra es casi seguro un typo (letal con propiedades opcionales: sin el check, `nmae` simplemente "no estaría" y `name` quedaría `undefined`). Pero es un chequeo de conveniencia, no una garantía del type system: cualquier indirection (variable, spread desde otro tipo, `as`) lo apaga. Un senior no debe confundir "TS a veces rechaza propiedades extra" con "los tipos son exactos" — TS no tiene exact types.

Implicaciones arquitecturales en microservicios: los contratos compartidos por forma (paquete `@company/contracts`) funcionan bien justamente por el structural typing (dos servicios no necesitan la misma clase, solo la misma forma), pero exigen disciplina: discriminantes en comandos/eventos, mapeo explícito en salidas, branded types para IDs, y validación runtime en entradas porque la forma en compile-time no dice nada sobre lo que llega por la red.

**Qué espera oír el entrevistador:** la definición (compatibilidad por forma), los dos fallos concretos —tipos de dominio intercambiables y objetos anchos que filtran datos al serializar—, la semántica exacta de los excess property checks (solo literales frescos) y las mitigaciones: discriminantes, branded types, mapeo explícito en fronteras. El ejemplo de PII filtrada por `JSON.stringify` demuestra criterio de producción.

## 11. `unknown` vs `any` vs `never`: fronteras de API y manejo de errores

**Categoría:** Type System / Robustez · **Tipo:** Conceptual

### 📝 Respuesta resumen
`any` desactiva el type checking en ambas direcciones y es contagioso: todo lo que toca queda sin verificar. `unknown` es el top type seguro: acepta cualquier valor pero no permite usarlo sin narrowing previo — es el tipo correcto para entradas no confiables (red, colas, `JSON.parse`, `catch`). `never` es el bottom type: no tiene valores, señala código inalcanzable, ramas imposibles y exhaustividad. Regla: `unknown` en las fronteras, tipos precisos dentro, `never` como centinela, `any` prácticamente prohibido por lint.

### 📖 Respuesta detallada
La diferencia formal: `any` es asignable a todo y todo es asignable a `any` (rompe la relación de subtipado en ambos sentidos); `unknown` solo cumple la mitad segura (todo es asignable a `unknown`, pero `unknown` no es asignable a nada salvo `unknown`/`any`); `never` es lo inverso (`never` es asignable a todo, nada es asignable a `never`).

El caso práctico central es el **manejo de errores en `catch`**. Con `useUnknownInCatchVariables` (incluido en `strict` desde TS 4.4), la variable de catch es `unknown`, porque en JS se puede lanzar cualquier cosa:

```typescript
class PaymentDeclinedError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PaymentDeclinedError";
  }
}

async function capturePayment(paymentId: string) {
  try {
    return await gateway.capture(paymentId);
  } catch (err) {           // err: unknown — no err.message directo
    if (err instanceof PaymentDeclinedError) {
      metrics.increment("payment.declined", { code: err.code });
      throw err;            // narrowed: acceso seguro a .code
    }
    if (err instanceof Error) {
      logger.error({ message: err.message, stack: err.stack });
    } else {
      logger.error({ raw: String(err) }); // alguien lanzó un string/objeto
    }
    throw err;
  }
}
```

Con `any` en el catch, `err.mesage` (typo) compila y devuelve `undefined` en producción. Con `unknown`, cada acceso exige demostrar primero qué es — el compilador te obliga a considerar que las librerías lanzan cosas raras.

Segunda frontera clave: **deserialización**. `JSON.parse` devuelve `any` (herencia histórica); el primer movimiento senior es re-tiparlo:

```typescript
const raw: unknown = JSON.parse(message.value);
// A partir de aquí: type guard o schema Zod para materializar el tipo
const event = PaymentEventSchema.parse(raw);
```

**El contagio de `any`** es su verdadero peligro: un `any` que entra por una librería mal tipada se propaga por inferencia (`const x = anyValue.foo.bar` — todo `any`), apagando el chequeo en cadena sin ningún aviso visual. Defensas: `noImplicitAny` (en `strict`), la regla de lint `@typescript-eslint/no-explicit-any`, y `no-unsafe-*` para cortar la propagación. `any` queda justificado casi únicamente en generics internos de utilidades (`(...args: any[]) => any` como constraint de "cualquier función", donde `unknown[]` a veces no unifica bien) y en migraciones con fecha de caducidad.

**`never` en la práctica**: exhaustividad de discriminated unions (pregunta 6), tipo de retorno de funciones que siempre lanzan (`function fail(msg: string): never`), y como señal de diagnóstico — si una variable aparece como `never` inesperadamente, el compilador dedujo que ese código es inalcanzable o que una intersección es imposible (`"a" & "b"`), lo que suele revelar un bug en tus tipos. También su rol algebraico: identidad de la unión (`T | never = T`) y aniquilador de la intersección (`T & never = never`), que es lo que hace funcionar el filtrado en mapped y conditional types.

Errores comunes: "arreglar" errores de compilación con `any`; usar `{}` u `object` creyendo que son el top type seguro (aceptan casi todo pero permiten demasiado poco/demasiado según el caso; `unknown` es el correcto); y no distinguir `unknown` (no sé qué es, debo comprobar) de `never` (no puede existir).

**Qué espera oír el entrevistador:** la asimetría de asignabilidad entre los tres, `useUnknownInCatchVariables` y el patrón `instanceof` en catch, `unknown` como tipo de toda entrada externa con narrowing/Zod para materializarlo, el contagio de `any` y su control con lint, y los usos reales de `never` (exhaustividad, funciones que lanzan, señal de tipos imposibles).

## 12. Declaration merging y module augmentation: extender Express Request y tipos globales

**Categoría:** Módulos / Interop · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Declaration merging: varias declaraciones con el mismo nombre (interfaces, namespaces) se fusionan en una sola. Module augmentation lo aplica a módulos de terceros: con `declare module "express-serve-static-core"` puedes añadir campos a `Request` (p. ej., `req.user` que inyecta tu middleware de auth) sin tocar la librería. Requiere que el fichero sea un módulo, que las declaraciones vivan donde el compilador las vea (`include`/`types`) y disciplina: es un mecanismo global e invisible que hay que centralizar en un `.d.ts` conocido.

### 📖 Respuesta detallada
Caso clásico: un middleware de autenticación adjunta el usuario al request y TypeScript protesta con `Property 'user' does not exist on type 'Request'`. La solución incorrecta es castear en cada handler (`(req as any).user`); la correcta es aumentar la interface una sola vez:

```typescript
// src/types/express.d.ts
import type { AuthenticatedUser } from "../auth/types";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;      // opcional: no todos los requests pasan por auth
    correlationId: string;         // inyectado por el middleware de tracing
  }
}
```

Detalles que separan al que lo ha hecho del que lo ha leído:

- **El módulo correcto**: para Express, `Request` vive en `express-serve-static-core`; aumentar `"express"` funciona en algunas configuraciones y falla en otras según cómo re-exporta los tipos. Saber que hay que mirar dónde está *declarada* la interface es el detalle práctico.
- **El fichero debe ser un módulo**: la presencia del `import` de arriba lo garantiza. Un `.d.ts` sin imports/exports es un *script* global y `declare module` se comporta distinto (y un `import` dentro del bloque aumentado cambia el significado). Es la causa nº 1 de "mi augmentation no aplica".
- **Visibilidad**: el `.d.ts` debe estar dentro de `include` del tsconfig. En monorepos, cada servicio que use el middleware necesita ver la augmentation — por eso conviene empaquetarla junto al middleware (el paquete `@company/http-auth` exporta el middleware **y** aporta la augmentation).
- **Merging de interfaces vs type aliases**: solo las interfaces mergean; los `type` chocan. Es la razón técnica por la que las librerías extensibles exponen interfaces (y un buen argumento en el eterno debate interface vs type: usa interface cuando *quieres* permitir augmentation, type cuando quieres cerrarla).

Otro uso legítimo: **interfaces globales**, como tipar `process.env`:

```typescript
// src/types/env.d.ts
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL: string;
      PAYMENT_GATEWAY_API_KEY: string;
      NODE_ENV: "development" | "production" | "test";
    }
  }
}
export {}; // fuerza que el fichero sea módulo
```

Con esto `process.env.DATABASE_URL` es `string` y un typo en el nombre no compila. Advertencia senior: esto **miente** — declara `string` para variables que en runtime pueden faltar (`undefined`). Lo honesto es combinarlo con validación al arranque (Zod sobre `process.env`, fail-fast) y que la augmentation refleje solo lo validado, o directamente exportar un objeto `config` tipado y validado en lugar de tocar el global.

Trade-offs y peligros: las augmentations son **acción a distancia** — modifican tipos para todo el compilation unit, sin import visible en el punto de uso; dos augmentations en conflicto producen errores confusos; y abusar de ellas para "colar" estado en `Request` degenera en un god-object no trazable (mejor `AsyncLocalStorage` o pasar contexto explícito para todo lo que no sea transversal como auth/tracing). También hay que recordar que solo afectan a compile-time: nada garantiza que `req.user` exista si el middleware no corrió — de ahí el `?`.

**Qué espera oír el entrevistador:** la mecánica (merging de interfaces, `declare module` contra el módulo donde vive el tipo real), los gotchas de módulo-vs-script y de visibilidad en tsconfig, el caso `process.env` con la advertencia de que la augmentation no valida nada en runtime, y la posición crítica: centralizado y con moderación, porque es global e invisible.


## 13. tsconfig estricto para servicios Node modernos: qué flags activar y por qué

**Categoría:** Tooling / Configuración · **Tipo:** Conceptual

### 📝 Respuesta resumen
`strict: true` es el punto de partida, no la meta: activa `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `useUnknownInCatchVariables` y compañía. Encima de eso, un servicio serio añade `noUncheckedIndexedAccess` (los accesos por índice devuelven `T | undefined`), `exactOptionalPropertyTypes` (distingue "ausente" de "presente con undefined"), `verbatimModuleSyntax` + `isolatedModules` (imports/exports predecibles para transpilers por-fichero) y, para Node moderno, `module: "nodenext"` con `target` acorde a la versión de Node (ES2022/ES2023 para Node 18/20+).

### 📖 Respuesta detallada
Configuración base defendible para un microservicio en Node 20+:

```typescript
// tsconfig.json (comentarios permitidos: es JSONC)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "module": "nodenext",          // implica moduleResolution: "nodenext"
    "target": "es2022",
    "noEmit": true,                // emite tsx/esbuild/swc; tsc solo chequea
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Los flags que más conversación dan en entrevista:

**`noUncheckedIndexedAccess`** — sin él, `ordersByld[id]` tipa `Order` aunque la clave no exista; con él, tipa `Order | undefined` y te obliga a manejar el miss:

```typescript
const handlers: Record<string, (e: unknown) => void> = { /* ... */ };
const h = handlers[topic];   // (e: unknown) => void | undefined
h?.(event);                  // el compilador te forzó a considerar el miss
// también aplica a arrays: items[0] es T | undefined
```

Es el flag que más bugs reales caza en servicios (lookups por topic, por header, por env) y el más costoso de adoptar tarde: actívalo el día uno. Trade-off honesto: en bucles `for (let i = 0; i < arr.length; i++)` genera fricción que se resuelve con `for...of`, `.at()`, o asserts puntuales.

**`exactOptionalPropertyTypes`** — con `interface Props { retries?: number }`, prohíbe `obj.retries = undefined` explícito: `?` significa "puede faltar la clave", no "puede valer undefined". Importa cuando la diferencia es observable: `"retries" in obj`, `Object.keys`, spreads que hacen merge de configuraciones (un `undefined` explícito machaca el default; una clave ausente no), o un PATCH donde "campo ausente" = no tocar y "campo null/undefined" = borrar. Es el flag más pedante y el que más señala rigor.

**`verbatimModuleSyntax` + `isolatedModules`** — los transpilers por-fichero (esbuild, swc, tsx, el modo transpile de bundlers) no ven el programa completo, así que no saben si un import es un tipo (debe borrarse) o un valor (debe quedarse). `verbatimModuleSyntax` te obliga a escribir `import type { Order } from "./order"` para tipos, haciendo el emit puramente sintáctico y eliminando una clase entera de bugs (imports de tipos que quedan en runtime y arrastran side effects o ciclos). `isolatedModules` marca error en lo que un transpiler aislado no puede compilar (p. ej., `const enum` re-exportado). En 2025+, con casi todo el mundo compilando con esbuild/swc y usando `tsc --noEmit` solo como type checker, ambos son de facto obligatorios.

**`module: "nodenext"`** — hace que TS siga las reglas reales de Node: respeta `"type": "module"` del package.json, exige extensiones en imports relativos ESM (`./order.js` aunque el fuente sea `.ts`), y resuelve `exports` maps de los paquetes. Configurarlo mal es la fuente de los infames `ERR_REQUIRE_ESM`. `target` debe reflejar la versión mínima de Node soportada (ES2022 para Node 18, ES2023 para Node 20+): transpilar de menos infla el output y pierde stack traces naturales de `async`.

Matices finales: `skipLibCheck` es pragmatismo (no chequeas los `.d.ts` de terceros; sin él, un paquete mal tipado te rompe la build), y en monorepos estas opciones viven en un `tsconfig.base.json` compartido para que ningún servicio "relaje" flags en silencio — un tsconfig divergente es deuda invisible.

**Qué espera oír el entrevistador:** que `strict` es baseline y sabe qué contiene, la semántica precisa de `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` con un caso donde importan (lookups, PATCH/merge de config), por qué `verbatimModuleSyntax`/`isolatedModules` existen (transpilación por-fichero), y `nodenext` + target correcto para Node moderno. La postura "estricto desde el día uno porque retrofit es carísimo" es la respuesta senior.

## 14. Monorepos TypeScript: project references, builds incrementales y Turborepo/Nx

**Categoría:** Tooling / Arquitectura · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
En un monorepo con varios servicios y paquetes compartidos (`contracts`, `db`, `logger`), el problema es doble: que el type checking escale y que los builds no se repitan. Project references dividen el repo en unidades compilables con dependencias explícitas: `tsc --build` compila en orden topológico, usa `.tsbuildinfo` para recompilar solo lo cambiado y consume los `.d.ts` de los paquetes dependidos en vez de re-chequear su fuente. Turborepo/Nx orquestan por encima: grafo de tareas, caché por hash de inputs (local y remota) y ejecución paralela — un build ya hecho por CI o por un compañero no se repite.

### 📖 Respuesta detallada
Estructura típica: `packages/contracts` (tipos y schemas de eventos/DTOs), `packages/telemetry`, y `services/orders`, `services/payments` que dependen de ellos.

**Capa 1 — Project references (`tsc`)**. Cada paquete tiene su tsconfig con `composite: true`, y quien depende lo declara:

```typescript
// services/orders/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "references": [
    { "path": "../../packages/contracts" },
    { "path": "../../packages/telemetry" }
  ],
  "include": ["src"]
}
// packages/contracts/tsconfig.json → "composite": true, "declaration": true
```

`composite` fuerza `declaration: true` y habilita que otros proyectos consuman el paquete **por sus `.d.ts` emitidos**, no re-chequeando su fuente — ahí está la ganancia de escala: cambiar un servicio no re-analiza los paquetes estables. `tsc --build` (modo build) resuelve el grafo, compila en orden, y con los `.tsbuildinfo` (`incremental`) decide qué está al día comparando hashes de ficheros y versiones — un `tsc -b` sin cambios es casi instantáneo. Beneficio extra: las fronteras se vuelven reales — un servicio no puede importar internals de otro paquete no referenciado; el compilador lo rechaza, lo que convierte la arquitectura declarada en arquitectura verificada.

Fricciones que hay que conocer: los editores usan su propio server (no `tsc -b`), así que a veces "en el IDE compila, en CI no" hasta rebuildeár referencias; hay que decidir si los imports entre paquetes van contra `dist` con `exports` del package.json o con aliases a `src` (lo primero es más fiel a producción, lo segundo más cómodo en dev); y mantener `references` sincronizadas con las dependencias reales pide automatización (generadores de Nx, `syncpack`, scripts).

**Capa 2 — Orquestación (Turborepo/Nx)**. `tsc -b` sabe de TypeScript, pero un build real incluye bundling, tests, lint, codegen. Turborepo modela el grafo de tareas:

```typescript
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],              // primero el build de las dependencias
      "outputs": ["dist/**", "*.tsbuildinfo"]
    },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["build"], "outputs": ["coverage/**"] }
  }
}
```

`^build` significa "el build de mis dependencias del workspace primero": el grafo de paquetes dirige el pipeline. La clave es el **caché por contenido**: cada tarea se hashea (fuentes, deps, env vars declaradas, config) y si el hash ya existe, se restauran los outputs sin ejecutar nada. Con **caché remota**, el build que hizo CI en `main` lo reutiliza cada developer: el onboarding pasa de "40 minutos compilando" a segundos. Nx añade grafo más rico, generadores, enforcement de fronteras por tags y `affected` (ejecutar solo lo tocado por el diff — crítico para que el CI de un monorepo de 30 servicios no compile los 30 en cada PR).

Peligros reales del caché: outputs no declarados (el caché restaura de menos y "funciona en mi máquina"), env vars no declaradas en el hash (builds envenenados que se sirven cacheados), y tareas no determinísticas. La regla: toda entrada que afecte al output debe estar en el hash.

Decisión de diseño frecuente en entrevista: ¿los paquetes internos publican JS compilado o los servicios los transpilan al vuelo ("internal packages" con `tsx`/bundler)? Compilado escala y aísla; al vuelo simplifica DX en repos pequeños. Con project references + caché remota, compilado suele ganar a partir de unas decenas de paquetes.

**Qué espera oír el entrevistador:** qué aporta exactamente `composite`/`tsc -b` (consumo por `.d.t.s`, orden topológico, `.tsbuildinfo`), que las references convierten fronteras en errores de compilación, cómo cachea Turborepo/Nx (hash de inputs → restauración de outputs, caché remota compartida, `affected`), y las fallas típicas del caché. Distinguir la capa `tsc` de la capa orquestador es lo que separa al que lo montó del que lo usó.

## 15. Decoradores: legacy (`experimentalDecorators`) vs estándar TC39 — y por qué NestJS sigue en legacy

**Categoría:** Lenguaje / Frameworks · **Tipo:** Conceptual

### 📝 Respuesta resumen
Conviven dos sistemas incompatibles. Los decoradores *legacy* (`experimentalDecorators: true`) implementan una propuesta antigua; con `emitDecoratorMetadata` y `reflect-metadata` emiten los tipos de parámetros como metadata runtime (`design:paramtypes`), que es lo que usa NestJS para inyección de dependencias por tipo. Los decoradores *estándar* (TC39 stage 3, default en TS 5.x sin flags) tienen otra firma (`context` con `addInitializer`, `access`, `metadata`) y **no** emiten type metadata, por lo que la DI "por tipo" no funciona con ellos. En backend con Nest/TypeORM sigues en legacy; el estándar es el futuro pero la migración de los frameworks es lenta.

### 📖 Respuesta detallada
Lo que hace NestJS por debajo — el motivo de ambos flags:

```typescript
// tsconfig: { "experimentalDecorators": true, "emitDecoratorMetadata": true }
import "reflect-metadata";

@Injectable()
class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,   // ← tipos usados como tokens de DI
    private readonly payments: PaymentsClient,
  ) {}
}

// El compilador emite (aprox):
// Reflect.metadata("design:paramtypes", [OrdersRepository, PaymentsClient])
// aplicado a OrdersService. El contenedor lee esa metadata:
const paramTypes = Reflect.getMetadata("design:paramtypes", OrdersService);
// → [OrdersRepository, PaymentsClient]: el contenedor sabe qué instanciar e inyectar
```

Esto explica varios comportamientos "mágicos" de Nest que un senior debe poder razonar: (1) sin `emitDecoratorMetadata` la DI por tipo muere — de ahí que Nest exija ambos flags; (2) la metadata solo se emite en clases **decoradas** (por eso `@Injectable()` es necesario aunque "no haga nada" visible: dispara la emisión); (3) los tipos que son interfaces o alias se emiten como `Object` — las interfaces no existen en runtime — y por eso inyectar por interface requiere `@Inject(TOKEN)` explícito; (4) `emitDecoratorMetadata` requiere que el **compilador vea los tipos**, así que los transpilers puramente sintácticos (esbuild) no pueden emitirla correctamente — de ahí que los proyectos Nest usen `tsc`/swc con plugin específico, un condicionante real de tooling.

**Los decoradores estándar (TC39)**, activos por defecto en TS 5.x cuando `experimentalDecorators` está apagado, son otra API:

```typescript
// Decorador estándar: sin reflect-metadata, sin design:paramtypes
function logged<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This>
) {
  return function (this: This, ...args: Args): Return {
    console.log(`→ ${String(context.name)}`);
    return target.call(this, ...args);
  };
}

class PaymentsClient {
  @logged
  capture(paymentId: string) { /* ... */ }
}
```

Diferencias de fondo: la firma recibe `(target, context)` en lugar de `(target, key, descriptor)`; `context` aporta `kind`, `name`, `private`, `static`, `addInitializer` (registrar lógica de inicialización por instancia) y `context.metadata` (TS 5.2+, propuesta de metadata estándar vía `Symbol.metadata` — pero metadata **que tú escribes**, no tipos emitidos por el compilador). No existen decoradores de parámetros en el estándar (stage separado), otro bloqueo directo para el estilo `@Body()`, `@Param()` de Nest. Ambos mundos son **incompatibles**: una librería escrita para uno no funciona en el otro, y el flag decide qué semántica compila.

Implicaciones prácticas para decidir: si tu stack es NestJS/TypeORM/typedi, activas los dos flags legacy y aceptas el lock-in (incluido el coste de tooling y el acoplamiento a `reflect-metadata` como side-effect import global). Si construyes librerías nuevas sin DI por tipo, los decoradores estándar son preferibles: son espec real de JS (los motores los implementarán), tipables con precisión y sin dependencias runtime. Alternativa creciente: frameworks que abandonan los decoradores por registro explícito o funciones (Fastify con plugins tipados, tsyringe→inyección manual, Effect), evitando el problema de raíz.

Errores comunes: mezclar semánticas (activar `experimentalDecorators` en un proyecto que usa librerías estándar o viceversa), olvidar `import "reflect-metadata"` en el entrypoint (fallos de DI crípticos), asumir que la metadata funciona con interfaces, y no saber que el orden de evaluación de decoradores es bottom-up en la aplicación.

**Qué espera oír el entrevistador:** que hay dos sistemas incompatibles y qué flag activa cada uno, la mecánica concreta `emitDecoratorMetadata` → `design:paramtypes` → contenedor de DI (con la limitación de las interfaces), por qué Nest no puede migrar aún (firma distinta, sin param decorators, sin type metadata), y una opinión práctica sobre cuándo aceptar el lock-in legacy.

## 16. Validación runtime con Zod: los tipos se borran, las fronteras no se defienden solas

**Categoría:** Robustez / Fronteras del sistema · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
TypeScript se borra al compilar: en runtime no queda nada que compruebe que el JSON de una request o de un mensaje de Kafka tiene la forma que el tipo promete. Anotar `body as CreateOrderDto` es fe, no seguridad. Zod invierte la dirección: defines el schema (que sí existe en runtime), validas en la frontera con `parse`/`safeParse`, y derivas el tipo estático con `z.infer` — una sola fuente de verdad. Regla arquitectural: validar en cada punto donde entran datos no controlados (HTTP, colas, env, DB semi-estructurada); dentro del sistema, los tipos ya son confiables.

### 📖 Respuesta detallada
El bug que motiva todo: un servicio consume `POST /orders` tipando el body por aserción. Un cliente envía `total` como string (`"99.90"`), el código hace `total * 1.21` → `NaN` → se persiste un pedido corrupto que revienta tres servicios más abajo, lejos del origen. El compilador nunca pudo ayudarte: **type erasure** — los tipos no existen donde ocurre el problema.

```typescript
import { z } from "zod";

export const CreateOrderSchema = z.object({
  customerId: z.string().uuid().brand<"UserId">(),
  currency: z.enum(["EUR", "USD"]),
  items: z.array(z.object({
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative(),
  })).min(1),
  couponCode: z.string().optional(),
});

// Una sola fuente de verdad: el tipo se deriva del schema, jamás al revés
export type CreateOrder = z.infer<typeof CreateOrderSchema>;

// Frontera HTTP
app.post("/orders", (req, res) => {
  const result = CreateOrderSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.flatten().fieldErrors });
  }
  const order: CreateOrder = result.data; // validado Y tipado; branded UserId incluido
  return ordersService.create(order);
});
```

**`parse` vs `safeParse`** es una decisión de manejo de errores, no de gusto: `parse` lanza `ZodError` — adecuado cuando un fallo es excepcional y un middleware global lo traduce (config al arranque: fail-fast; datos internos que "no pueden" ser inválidos). `safeParse` devuelve `{ success: true, data } | { success: false, error }` — un discriminated union que te obliga a manejar la rama de error en el sitio, lo correcto en fronteras donde el input inválido es un caso *esperado* (requests de clientes, mensajes de terceros). En consumers de colas, `safeParse` + envío a DLQ evita que un mensaje envenenado tumbe el consumer en bucle.

Detalle senior: `parse` **devuelve un objeto nuevo** con solo las claves declaradas (strip por defecto). Eso convierte al schema en allowlist: las propiedades extra —incluyendo intentos de mass assignment como `{"role": "admin"}`— se descartan. `strict()` las rechaza con error, `passthrough()` las deja pasar (casi nunca lo que quieres en una API). Además, los tipos quedan honestos frente a los excess property checks que el structural typing no garantiza con variables (pregunta 10).

**Dónde validar** — el mapa de fronteras de un microservicio: (1) HTTP entrante; (2) mensajes de colas/eventos — aunque el productor sea "nuestro", su versión puede divergir de la tuya: el schema es tu contrato defensivo ante deploys desincronizados; (3) respuestas de APIs de terceros — su documentación no es un contrato; (4) `process.env` al arranque con `z.object({...}).parse(process.env)` (fail-fast en el boot, no a las 3 AM en el primer request); (5) datos semi-estructurados de DB (JSONB). Dentro del núcleo, re-validar es ruido: "parse, don't validate" — se cruza la frontera una vez y el tipo resultante es la prueba de validez.

Trade-offs a nombrar: coste de CPU en hot paths (validar payloads enormes por mensaje tiene precio; se mitiga validando solo el envelope, o con discriminated unions de Zod que despachan por `type` antes de validar el payload completo); los tipos inferidos por Zod son a veces más feos en errores del IDE; y schemas compartidos entre servicios via paquete `@company/contracts` — versionados, porque el schema **es** el contrato del evento. Alternativas que conviene conocer para el contraste: TypeBox (JSON Schema nativo, integra con Fastify y su validación compilada, mucho más rápido), Valibot (tree-shakeable), o class-validator en el mundo Nest (basado en decoradores, acoplado a clases). El criterio de elección: ¿necesitas JSON Schema/OpenAPI? ¿rendimiento extremo? ¿DX de composición?

Errores comunes: definir la interface a mano y el schema aparte (divergen silenciosamente — siempre `z.infer`); validar y luego seguir usando `req.body` crudo en vez de `result.data`; `as` después de un `safeParse` fallido "porque casi siempre es válido"; y validar en todas partes por miedo, señal de que las fronteras no están claras.

**Qué espera oír el entrevistador:** type erasure como causa raíz, `z.infer` como single source of truth, la elección razonada `parse` vs `safeParse` según si el fallo es esperado, el stripping como defensa contra mass assignment, el mapa completo de fronteras (HTTP, colas, terceros, env, JSONB) con "parse, don't validate", y conciencia de coste/alternativas (TypeBox, Valibot). Ese mapa de fronteras es lo que distingue una respuesta de arquitecto de una de usuario de librería.

