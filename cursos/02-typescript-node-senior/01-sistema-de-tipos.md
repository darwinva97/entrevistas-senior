# Módulo 1 · El sistema de tipos como herramienta de diseño

> **Curso 02 · TypeScript/Node** · 180 min

## Por qué esto importa en la entrevista

Porque separa a quien *anota* tipos de quien *diseña con* tipos. La pregunta de fondo siempre es la misma: **¿puedes hacer que el código incorrecto no compile?** Si tu respuesta a "¿cómo evitas que alguien pase un `userId` donde va un `orderId`?" es "con code review", no eres senior en TypeScript.

## Modelo mental: TypeScript es estructural y se borra en runtime

Dos hechos que explican casi todo:

1. **Tipado estructural (duck typing):** dos tipos son compatibles si su *forma* lo es, no por su nombre. Por eso `type UserId = string` no protege de nada, y por eso existen los *branded types*.
2. **Los tipos se borran al compilar.** En runtime no hay tipos. Todo dato que entra de fuera (HTTP, cola, BD, `process.env`) es `unknown` hasta que **tú** lo validas. `as MiTipo` sobre un `JSON.parse` es una mentira que se paga en producción.

```ts
// ❌ Mentira: el tipo no valida nada
const body = JSON.parse(raw) as CrearPedido;

// ✅ Validación en la frontera; el tipo se deriva del esquema
const CrearPedido = z.object({ clienteId: z.string().uuid(), total: z.number().positive() });
type CrearPedido = z.infer<typeof CrearPedido>;
const body = CrearPedido.parse(raw);   // lanza si no cumple: el tipo ya es verdad
```

**💬 Cómo lo dices:** *"Valido en la frontera con Zod y derivo el tipo del esquema, para que no puedan divergir. Dentro del dominio confío en los tipos; fuera, en nada."*

## Narrowing y estados imposibles

La técnica más rentable del lenguaje: **uniones discriminadas + chequeo exhaustivo con `never`**.

```ts
type Pago =
  | { estado: 'pendiente'; intentos: number }
  | { estado: 'completado'; comprobante: string }
  | { estado: 'fallido'; motivo: string; reintentable: boolean };

function describir(p: Pago): string {
  switch (p.estado) {
    case 'pendiente':  return `en curso (${p.intentos})`;
    case 'completado': return p.comprobante;          // solo aquí existe comprobante
    case 'fallido':    return p.motivo;
    default: {
      const _exhaustivo: never = p;                   // ← si añades un estado, ROMPE el build
      throw new Error(`estado no manejado: ${JSON.stringify(_exhaustivo)}`);
    }
  }
}
```

Compáralo con el antipatrón habitual: `{ estado: string; comprobante?: string; motivo?: string }`, que permite `{estado:'completado'}` sin comprobante y obliga a `!` por todas partes. **Modelar con uniones elimina clases enteras de bugs y de tests.**

Otras herramientas de narrowing que debes nombrar: type guards con `x is T`, funciones `asserts x is T`, `in`, `instanceof`, y el hecho de que TS estrecha por control de flujo (pero lo pierde tras un `await` o un callback si la variable es mutable — usa `const`).

## Branded types: nominalidad cuando la necesitas

```ts
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

type UserId  = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;

const userId = (s: string): UserId => s as UserId;    // única puerta de entrada

function cargarUsuario(id: UserId) {/* ... */}
cargarUsuario('abc' as OrderId);   // ❌ error de compilación
```

Coste cero en runtime, y elimina la familia de bugs "pasé el id equivocado". Úsalo también para valores validados: `type Email = Brand<string,'Email'>` producido solo por tu validador.

## Conditional types, `infer` y distributividad

```ts
type ElementoDe<T> = T extends (infer U)[] ? U : never;
type Desenvuelto<T> = T extends Promise<infer U> ? U : T;
```

**Distributividad:** cuando el tipo comprobado es un parámetro genérico *desnudo*, el condicional se aplica a cada miembro de la unión por separado. Eso es lo que hace funcionar `Exclude`:

```ts
type Exclude<T, U> = T extends U ? never : T;
// Exclude<'a'|'b'|'c', 'a'>  →  ('a'extends'a'?never:'a') | ... = 'b'|'c'
```

Y cuando *no* la quieres, la desactivas envolviendo en tuplas:

```ts
type EsUnion<T> = [T] extends [infer _] ? ... ;      // [T] impide la distribución
type EsNunca<T> = [T] extends [never] ? true : false; // el chequeo correcto de never
```

Saber *por qué* `T extends never ? true : false` con `T = never` devuelve `never` en lugar de `true` (porque distribuye sobre una unión vacía) es de las cosas que hacen sonreír a un entrevistador.

## Mapped types y template literals

```ts
// key remapping + modificadores: opcionalidad y readonly con +/-
type Mutable<T>   = { -readonly [K in keyof T]: T[K] };
type Obligatorio<T> = { [K in keyof T]-?: T[K] };
type Getters<T>   = { [K in keyof T & string as `get${Capitalize<K>}`]: () => T[K] };

// rutas tipadas con template literal types
type Ruta = `/pedidos/${string}` | `/clientes/${string}/pagos`;
type Evento = `pedido.${'creado'|'pagado'|'cancelado'}`;
```

Uso real y defendible: tipar un emisor de eventos (`on('pedido.creado', handler)` con payload inferido), tipar rutas de un router, o derivar el DTO de una entidad sin repetirlo. **Límite que debes mencionar:** el tipado extremo cuesta tiempo de compilación y legibilidad; si el equipo no lo entiende, es deuda. Un senior sabe cuándo parar.

## `satisfies`, `as` y anotación: los tres no son lo mismo

```ts
const config = { puerto: 3000, host: 'localhost' } satisfies Config;
config.puerto.toFixed();     // ✅ sigue siendo number literal, no widened

const config2: Config = { puerto: 3000, host: 'localhost' };
// válido, pero pierdes los tipos literales concretos

const config3 = { puerto: '3000' } as Config;   // ⚠️ mentira: as no valida
```

Regla: **anotación** cuando quieres que el tipo mande; **`satisfies`** cuando quieres validar contra un contrato pero conservar la inferencia precisa; **`as`** solo cuando sabes algo que el compilador no puede saber (y merece un comentario que lo justifique).

## Varianza y `strictFunctionTypes`

- Los parámetros de función son **contravariantes** en modo estricto: una función que acepta `Animal` sirve donde se espera una que acepta `Perro`, no al revés.
- **Excepción histórica:** los métodos declarados con sintaxis de método (`metodo(x: T): void`) son **bivariantes** por compatibilidad — es un agujero real del sistema de tipos. Declararlos como propiedades (`metodo: (x: T) => void`) recupera la comprobación estricta.
- Los arrays son covariantes y por tanto inseguros al escribir (`Perro[]` donde se espera `Animal[]` permite meter un gato). Es el mismo problema clásico de Java.

## tsconfig de un servicio serio

```jsonc
{
  "compilerOptions": {
    "strict": true,                          // el mínimo innegociable
    "noUncheckedIndexedAccess": true,        // arr[0] es T | undefined ← el que más bugs evita
    "exactOptionalPropertyTypes": true,      // {a?: string} ≠ {a: string|undefined}
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,                 // compatible con esbuild/swc
    "target": "ES2023", "module": "NodeNext",
    "skipLibCheck": true                     // pragmático: no compiles los tipos de terceros
  }
}
```

Saber justificar `noUncheckedIndexedAccess` (y por qué mucha gente lo desactiva y luego tiene `undefined` en producción) es una buena señal. También lo es hablar de **project references** y builds incrementales en monorepos, y de por qué `tsc` como *type-checker* y esbuild/swc como *transpilador* es la combinación habitual (velocidad + seguridad).

## Errores comunes que delatan a un no-senior

- `as` para "arreglar" errores de tipos.
- `any` en fronteras en vez de `unknown` + validación.
- Interfaces con todos los campos opcionales en lugar de uniones discriminadas.
- No saber que los tipos desaparecen en runtime (y confiar en ellos para validar entrada).
- Sobre-ingeniería de tipos que nadie del equipo puede mantener.
- Enums de TS sin conocer sus rarezas (numéricos con reverse mapping, no borrables); a menudo es mejor `as const` + unión.

## 🧪 Laboratorio

1. **Refactor a unión discriminada:** toma un tipo real de tu trabajo con campos opcionales y conviértelo. Añade el chequeo exhaustivo `never` y comprueba que añadir un caso rompe el build.
2. **Implementa desde cero** (sin mirar `lib.d.ts`): `Exclude`, `Extract`, `Pick`, `Omit`, `ReturnType`, `Awaited`, `DeepPartial` y `DeepReadonly`. Escribe tests de tipos con `expectTypeOf` (vitest) o `tsd`.
3. **Emisor de eventos tipado:** `on(evento, handler)` donde el payload se infiere del nombre del evento vía template literal types.
4. **Branded types:** introduce `UserId`/`OrderId` en un módulo existente y cuenta cuántos errores reales aparecen.
5. **Frontera con Zod:** valida `process.env` al arrancar (fallo rápido si falta una variable) y el body de dos endpoints; deriva los tipos del esquema.
6. **Activa `noUncheckedIndexedAccess`** en un proyecto real y arregla los errores. Anota cuántos eran bugs de verdad.

**Entregable:** el módulo de tipos utilitarios con tests de tipos, y la validación de entorno.

## ✅ Autoevaluación

1. ¿Por qué `type Id = string` no evita confundir dos ids? ¿Cómo lo arreglas sin coste en runtime?
2. Explica la distributividad de conditional types con `Exclude` y cómo la desactivas.
3. Diferencia entre `satisfies`, anotación y `as`, con un ejemplo de cuándo cada uno.
4. ¿Por qué los métodos son bivariantes y qué haces para evitarlo?
5. Llega un JSON de una cola. ¿Cómo lo tipa un senior?
6. ¿Qué hace `noUncheckedIndexedAccess` y por qué lo activarías?
7. ¿Cuándo el tipado avanzado es deuda técnica?

## 🎯 Preguntas del banco que ya puedes responder

- [`typescript-microservicios/01-typescript-avanzado.md`](../../typescript-microservicios/01-typescript-avanzado.md) — las 16
- [`typescript-microservicios/03-casos-y-problemas.md`](../../typescript-microservicios/03-casos-y-problemas.md) — 9 (migración JS→TS)
- [`versionamiento-apis/`](../../versionamiento-apis/) — tipos generados desde OpenAPI y compatibilidad

---

**Siguiente:** [Módulo 2 · Event loop, memoria y rendimiento](02-event-loop-y-rendimiento.md)
