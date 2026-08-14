# Módulo 2 · Estrategias de versionado

> **Curso 07 · APIs** · 150 min

## Por qué esto importa en la entrevista

Porque "¿cómo versionas tus APIs?" es una pregunta de dos minutos que revela todo tu criterio de arquitectura. La respuesta floja es "pongo `/v2`". La respuesta senior empieza por: **"lo primero es no necesitar una v2"**.

## Qué es exactamente un breaking change

Memoriza esta tabla; es la base de todo el curso.

| Cambio | ¿Rompe? | Matiz |
|---|:-:|---|
| Añadir un campo **opcional** a la respuesta | ❌ | salvo clientes con validación estricta (¡existen!) |
| Añadir un campo **obligatorio** a la petición | ✅ | los clientes viejos no lo envían |
| Eliminar o renombrar un campo | ✅ | renombrar = eliminar + añadir |
| Cambiar el tipo (`string` → `number`) | ✅ | incluido `"123"` → `123` |
| Añadir un valor a un `enum` de respuesta | ✅ ⚠️ | rompe a clientes que no toleran lo desconocido |
| Hacer opcional un campo antes obligatorio en la respuesta | ✅ | el cliente asumía que siempre venía |
| Cambiar el formato de un id | ✅ | y el tamaño del campo también cuenta |
| Endurecer una validación | ✅ | peticiones que antes pasaban ahora fallan |
| Cambiar el código de estado de un caso | ✅ | el cliente ramifica por código |
| Cambiar el orden por defecto o la paginación | ✅ | aunque "solo" sea el default |
| Cambiar la **semántica** sin cambiar la forma | ✅✅ | el peor de todos: nadie lo detecta hasta que hay daño |

**💬 Cómo lo dices:** *"Mi regla es que solo son seguras las adiciones opcionales, y aun así verifico que los consumidores toleren campos y valores desconocidos. Los cambios semánticos son los más peligrosos porque ningún test de contrato los detecta."*

**Ley de Postel aplicada:** sé estricto con lo que emites y tolerante con lo que recibes. Los clientes deben ignorar campos desconocidos y tener un `default` para valores de enum que no conocen. Si tú controlas los clientes, esta disciplina te ahorra la mitad de las versiones.

## Dónde poner la versión

| Estrategia | Ejemplo | Pros | Contras |
|---|---|---|---|
| **URI** | `/v1/pedidos` | visible, cacheable, trivial de enrutar | duplica rutas; "no es RESTful" (discusión estéril) |
| **Cabecera** | `Accept: application/vnd.api.v2+json` | URLs limpias, negociación de contenido | invisible, difícil de probar con curl, caché por `Vary` |
| **Query param** | `?version=2` | simple | se pierde en enlaces, ensucia el caché |
| **Por fecha** | `Stripe-Version: 2024-06-20` | evolución continua, sin saltos mayores | el servidor debe transformar entre versiones |

Recomendación defendible: **versión mayor en la URI** para APIs públicas (claridad gana), **versión por fecha** si vas a evolucionar constantemente con muchos clientes (el modelo de Stripe: cada cliente queda anclado a la versión con la que se integró, y el servidor aplica transformaciones encadenadas). Menciona la segunda: demuestra que conoces cómo lo hacen las APIs que mejor envejecen.

**Lo que no debes hacer:** versionar cada endpoint por separado (caos), o crear una `v2` porque cambiaste un campo (una versión mayor debería ser un rediseño, no un parche).

## SemVer y su matiz

`MAJOR.MINOR.PATCH`: mayor = incompatible, menor = funcionalidad compatible, parche = arreglo compatible. Aplica limpiamente a **librerías y SDKs**; en APIs HTTP, la versión visible suele ser solo la mayor y las menores se despliegan de forma continua.

Puntos que suman: `0.x` significa "sin garantías"; la versión la determina **el impacto en el consumidor**, no el esfuerzo del cambio; y para eventos, el esquema tiene su propio versionado ([módulo 3](03-evolucion-de-datos-y-eventos.md)).

## Convivencia de versiones: cómo se implementa de verdad

Tres opciones, de menos a más coste:

1. **Una implementación, adaptadores por versión** (el modelo Stripe). El núcleo trabaja con el modelo más nuevo y hay transformadores de entrada/salida por versión. **Es la mejor opción cuando hay muchas versiones vivas** porque no duplicas lógica de negocio.
2. **Ramas de código en el mismo servicio** (`/v1/*` y `/v2/*` llamando al mismo dominio): sencillo con dos versiones, insostenible con cinco.
3. **Servicios separados por versión:** aísla riesgos y despliegues, duplica operación y complica los datos compartidos. Solo si la v2 es un rediseño profundo.

Regla práctica: **como máximo dos versiones mayores vivas**, con fecha de retirada anunciada desde el día del lanzamiento de la nueva.

## Deprecación y sunset: el proceso completo

```
1. Anuncio      → changelog, correo, banner en el portal, y en el propio contrato
2. Cabeceras    → Deprecation: true
                  Sunset: Wed, 30 Jun 2027 23:59:59 GMT      (RFC 8594)
                  Link: <https://docs/migracion>; rel="deprecation"
3. Medición     → ¿QUIÉN sigue usando la v1? métricas por versión, cliente y endpoint
4. Contacto directo a los que quedan (los correos masivos no funcionan)
5. Brownouts    → cortes programados y anunciados: 1 min, luego 5, luego 1 hora
                  (obligan a notar la dependencia sin causar daño permanente)
6. Retirada     → 410 Gone con enlace a la guía de migración
```

**Los brownouts son la técnica que convence en una entrevista**: es lo que hacen las plataformas grandes para que los rezagados reaccionen antes del corte definitivo, y demuestra que has vivido el "nadie migra hasta que duele".

Sin el paso 3 (medición por consumidor) el resto es fe. Instrumenta desde el día uno: etiqueta de versión en las métricas y un identificador de cliente en cada petición.

## Contract testing: que romper falle en CI

```
Consumidor escribe expectativas → publica el "pacto" al broker
Proveedor las verifica en su pipeline → si rompe a alguien, el build falla
Gate de despliegue: "can-i-deploy" consulta si tu versión es compatible
   con las versiones de los consumidores DESPLEGADAS en producción
```

Ese último punto (`pact-broker can-i-deploy`) es lo que convierte el contract testing en una barrera real y no en un test más. Es la respuesta a "¿cómo evitas romper consumidores sin tests E2E?".

Complementos: **consumer-driven contracts** para APIs internas; para APIs públicas, donde no conoces a tus consumidores, la barrera es la detección de breaking changes en el contrato (`oasdiff`) + tests de compatibilidad contra grabaciones de tráfico real.

## Errores comunes que delatan a un no-senior

- Creer que añadir un valor a un enum es siempre compatible.
- Versionar por cada cambio pequeño.
- Mantener cinco versiones vivas "por si acaso".
- Deprecar sin medir quién usa qué.
- Anunciar retirada por correo y confiar en que la gente lea.
- Confiar en E2E para detectar rupturas de contrato.
- No versionar los eventos con el mismo rigor que las APIs.

## 🧪 Laboratorio

1. **Clasifica 15 cambios** de un changelog real tuyo como compatibles o breaking, y contrasta con `oasdiff`. Los desacuerdos son lo que aprendes.
2. **Implementa el modelo de adaptadores:** un endpoint con dos versiones servidas por el mismo núcleo, con transformadores de entrada y salida. Añade una tercera y comprueba que no tocas la lógica de negocio.
3. **Cabeceras de deprecación:** añade `Deprecation`/`Sunset`/`Link` a una v1, y un dashboard de uso por versión y cliente.
4. **Brownout:** programa un corte de 60 segundos de la v1 en un entorno de pruebas y documenta el procedimiento de comunicación.
5. **Pact end-to-end:** consumidor y proveedor, con `can-i-deploy` como puerta en el pipeline. Rompe el contrato y comprueba que el despliegue se bloquea.

## ✅ Autoevaluación

1. Enumera seis cambios que rompen y dos que no, con su matiz.
2. ¿Por qué añadir un valor a un enum puede romper?
3. Compara versionado en URI, cabecera y por fecha; ¿cuál eliges y por qué?
4. ¿Cómo mantienes tres versiones vivas sin triplicar el código?
5. Describe el proceso completo de deprecación, incluidos los brownouts.
6. ¿Cómo evitas romper a un consumidor sin tests E2E?
7. ¿Qué es el cambio semántico y por qué es el más peligroso?

## 🎯 Preguntas del banco que ya puedes responder

- [`versionamiento-apis/01-versionamiento-de-apis.md`](../../versionamiento-apis/01-versionamiento-de-apis.md) — las 16
- [`versionamiento-apis/03-casos-y-problemas.md`](../../versionamiento-apis/03-casos-y-problemas.md) — casos de ruptura y retirada
- [`java-microservicios/02-spring-y-microservicios.md`](../../java-microservicios/02-spring-y-microservicios.md) — 16 (Pact)

---

**Anterior:** [Módulo 1](01-diseno-de-contratos.md) · **Siguiente:** [Módulo 3 · Evolución de datos y eventos](03-evolucion-de-datos-y-eventos.md)
