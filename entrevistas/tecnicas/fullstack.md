# 🧩 Entrevista técnica · Fullstack

> Simulacro por niveles. Lee **solo la pregunta**, responde en voz alta y cronometrada. Formato explicado en [cómo funcionan los simulacros](../README.md).

En fullstack casi nunca te evalúan la profundidad máxima en cada capa: te evalúan **las costuras**. Dónde pones la validación, quién es dueño del estado, cómo evoluciona el contrato entre tu frontend y tu backend, y si sabes dónde *no* llegas.

## Qué evalúan en cada nivel

| Nivel | Lo que buscan | Lo que te descarta |
|---|---|---|
| **Junior** | Que entiendas el recorrido completo de una petición | Saber solo la mitad y disimular |
| **Semi-senior** | Autonomía de punta a punta y criterio en las costuras | Duplicar lógica de negocio en las dos capas |
| **Senior** | Diseño de contratos, rendimiento percibido, producción | "Sé de todo" sin profundidad demostrable en nada |
| **Staff** | Coherencia del producto completo y del equipo | Ignorar el coste de mantener dos mundos |

## Guion típico (60–75 minutos)

```
 5 min · tu experiencia y en qué capa te sientes más fuerte
15 min · una funcionalidad end-to-end en pizarra
15 min · profundidad en tu capa fuerte
15 min · profundidad en la otra capa (aquí se ve el nivel real)
10 min · caso de producción cruzado
 5 min · tus preguntas
```

---

## Nivel junior

### P1. Escribes una URL en el navegador y pulsas Enter. ¿Qué pasa?

**Qué evalúan:** el clásico. No buscan exhaustividad, buscan que conozcas el recorrido y que sepas dónde profundizar.

**❌ Lo que NO debes decir**

> "El navegador hace una petición al servidor, el servidor responde con el HTML y se muestra la página."

**Por qué está mal:** no es incorrecto, es vacío: cabe en una sola frase y no demuestra nada. Para una pregunta que existe precisamente para ver hasta dónde llegas, contestar el mínimo es desaprovecharla.

**⚠️ Respuesta aceptable**

> "Se resuelve el DNS, se abre una conexión TCP, si es HTTPS se hace el handshake TLS, se manda la petición HTTP, el servidor responde y el navegador parsea el HTML, pide los recursos y renderiza."

**Qué le falta:** las capas intermedias reales (caché, CDN, balanceador) y la parte del render, que es donde se nota el frontend.

**✅ Respuesta ideal**

> "Lo cuento en tres tramos y me paro donde te interese. Resolución y conexión: caché del navegador y del sistema, DNS, TCP y handshake TLS —ahí ya hay round-trips que en móvil se notan—. Camino hasta el origen: normalmente hay una CDN que puede responder sin llegar al servidor, y si llega, pasa por un balanceador que enruta a una instancia. Y la parte del navegador, que es la que más afecta a lo que percibe el usuario: parseo del HTML, construcción del DOM y el CSSOM, descarga de recursos —donde los scripts bloqueantes retrasan el pintado—, layout, paint y luego la hidratación si es una app con JavaScript. Si quieres, profundizo en cualquiera de los tres: el que más problemas me ha dado en la práctica es el tercero."

**Por qué funciona:** estructura en tramos, menciona lo que existe de verdad en producción (CDN, balanceador) y ofrece profundizar en vez de recitar todo.

**🔁 Repregunta probable:** *"¿Qué haría más rápido ese primer render?"* → "Reducir round-trips: CDN cerca del usuario, HTTP/2 o 3, no bloquear con scripts, y enviar HTML útil desde el principio en vez de un div vacío que se rellena con JavaScript."

📚 [Curso 00 · Latencia y colas](../../cursos/00-fundamentos-distribuidos/05-latencia-y-colas.md)

---

### P2. ¿Dónde validas los datos de un formulario: en el frontend o en el backend?

**Qué evalúan:** si entiendes la frontera de confianza. Es la pregunta fullstack por excelencia.

**❌ Lo que NO debes decir**

> "En el frontend, que es donde está el formulario; así el usuario ve el error al momento y no cargamos el servidor."

**Por qué está mal:** el cliente es territorio del atacante. Cualquiera puede saltarse tu formulario con `curl`, con las DevTools o con un cliente propio. Validar solo en el cliente no es una optimización, es no validar. Este error, dicho con seguridad, hunde una entrevista fullstack aunque el resto vaya bien.

**⚠️ Respuesta aceptable**

> "En los dos: en el frontend para dar feedback rápido al usuario y en el backend porque es donde realmente hay que garantizar los datos."

**Qué le falta:** el matiz de qué se valida en cada sitio, cómo evitar duplicar reglas y qué pasa con la validación de negocio.

**✅ Respuesta ideal**

> "En los dos, pero con propósitos distintos, y eso es lo importante. En el cliente valido por experiencia de usuario: formato, campos obligatorios, feedback inmediato. En el servidor valido por seguridad e integridad, porque el cliente es territorio del atacante y cualquiera puede mandar una petición directa. Para no mantener dos verdades que se desincronizan, comparto el esquema: defino las reglas una vez —con Zod, por ejemplo— y las uso en ambos lados, derivando además los tipos del esquema. Lo que no comparto es la validación de negocio: comprobar stock, permisos o límites de crédito solo tiene sentido en el servidor, porque necesita datos que el cliente no tiene y que no debe tener. Y el mensaje de error debe ser útil en el cliente y neutro hacia fuera: no filtrar detalles internos."

**Por qué funciona:** distingue propósito, resuelve la duplicación con una solución concreta y separa validación de formato de validación de negocio.

**🔁 Repregunta probable:** *"¿Y si el mismo dato lo valida también la base de datos?"* → "Mejor: la restricción única o el `CHECK` es la última red de seguridad, la que sigue funcionando cuando hay dos servicios escribiendo o una condición de carrera."

📚 [Curso 02 · Sistema de tipos](../../cursos/02-typescript-node-senior/01-sistema-de-tipos.md) · [Curso 06 · OWASP](../../cursos/06-seguridad/01-modelo-de-amenazas-y-owasp.md)

---

## Nivel semi-senior

### P3. Tu pantalla necesita datos de tres endpoints y va lenta. ¿Qué haces?

**Qué evalúan:** si ves el problema como un todo o solo desde tu capa preferida.

**❌ Lo que NO debes decir**

> "Creo un endpoint nuevo que devuelva todo junto y así solo hago una petición."

**Por qué está mal:** puede ser la respuesta correcta, pero darla de inmediato salta el diagnóstico y crea un endpoint acoplado a *esa* pantalla, que es deuda futura. Además, si las tres llamadas ya son paralelas y el problema es que una tarda 2 segundos, agregarlas no arregla nada: la más lenta manda.

**⚠️ Respuesta aceptable**

> "Miraría si las peticiones son secuenciales para paralelizarlas, y si aun así va lenta, valoraría un endpoint agregado o cachear las partes que cambian poco."

**Qué le falta:** medir dónde está el tiempo y considerar el render progresivo, que suele ser la mejora más grande sin tocar el backend.

**✅ Respuesta ideal**

> "Primero miro dónde se va el tiempo: si es red, si es una de las tres que tarda mucho, o si es el render. En la pestaña de red veo si hay cascada, que es el error más común: tres peticiones encadenadas porque la segunda necesita un id de la primera. Si son independientes, van en paralelo. Si una es intrínsecamente lenta, la separo y renderizo progresivamente: pinto lo que ya tengo y esa sección con su propio esqueleto, porque la percepción del usuario mejora aunque el tiempo total sea el mismo. Un endpoint agregado o un BFF es una buena solución cuando el fan-out es alto o el cliente es móvil con latencia mala, asumiendo que ahora tengo un endpoint acoplado a una pantalla y que alguien lo tiene que mantener. Y cacheo lo que cambia poco: catálogos, configuración, perfil."

**Por qué funciona:** mide, distingue cascada de lentitud, y aporta el render progresivo, que casi nadie menciona y es lo que más mueve la percepción.

**🔁 Repregunta probable:** *"¿Y GraphQL no resolvería esto?"* → "Resuelve el over-fetching y el fan-out, sí, pero trae su propio coste: caché HTTP más difícil, autorización campo a campo y consultas caras que hay que limitar. Para tres endpoints no lo justificaría."

📚 [Curso 07 · Diseño de contratos](../../cursos/07-apis-y-versionado/01-diseno-de-contratos.md)

---

### P4. ¿Cómo evolucionas la API sin romper el frontend que ya está desplegado?

**Qué evalúan:** si entiendes que frontend y backend se despliegan por separado. Es la costura fullstack más importante.

**❌ Lo que NO debes decir**

> "Como somos el mismo equipo y desplegamos a la vez, cambio el campo en el backend y en el frontend en el mismo PR."

**Por qué está mal:** asume atomicidad que no existe. Aunque despliegues los dos a la vez, hay usuarios con la versión anterior del frontend cargada en el navegador —y en móvil, con la app vieja durante semanas—. Ese hueco produce errores silenciosos justo después de cada despliegue.

**⚠️ Respuesta aceptable**

> "Hago cambios compatibles: añado el campo nuevo sin quitar el viejo, actualizo el frontend y luego elimino el antiguo cuando ya nadie lo use."

**Qué le falta:** cómo sabes que ya nadie lo usa, y qué cambios que parecen compatibles no lo son.

**✅ Respuesta ideal**

> "Parto de que el frontend desplegado y el backend son dos sistemas con versiones independientes, incluso siendo el mismo equipo: siempre hay pestañas abiertas con la versión vieja y, en móvil, versiones antiguas durante semanas. Así que solo hago cambios aditivos: añado el campo nuevo, mantengo el viejo, actualizo el cliente y solo después retiro. Y tengo cuidado con los cambios que parecen inocuos y no lo son: añadir un valor nuevo a un enum rompe a cualquier cliente que haga un `switch` sin caso por defecto, endurecer una validación rompe peticiones que antes pasaban, y cambiar el significado de un campo sin cambiar su forma es el peor de todos porque no lo detecta ningún test. Para saber cuándo puedo retirar algo, mido el uso por versión de cliente; si no lo mido, la retirada es un acto de fe. Y en el cliente aplico la ley de Postel: ignoro campos desconocidos y tengo un valor por defecto para lo que no entiendo."

**Por qué funciona:** parte de la premisa correcta, enumera cambios traicioneros y exige medición antes de retirar.

**🔁 Repregunta probable:** *"¿Cómo fuerzas a los usuarios con app vieja a actualizar?"* → "Con una versión mínima soportada que el backend comunica, avisando en la app y con un periodo de gracia; y si toca cortar, con fecha anunciada y no de golpe."

📚 [Curso 07 · Estrategias de versionado](../../cursos/07-apis-y-versionado/02-estrategias-de-versionado.md)

---

## Nivel senior

### P5. Diseña un carrito de compras que funcione con el usuario sin sesión iniciada y al iniciar sesión.

**Qué evalúan:** decisiones de estado repartido entre cliente y servidor, y los casos borde que aparecen al fusionar.

**❌ Lo que NO debes decir**

> "Lo guardo en `localStorage` mientras no haya sesión y, al iniciar sesión, lo subo al servidor reemplazando lo que hubiera."

**Por qué está mal:** el "reemplazando" destruye datos del usuario sin preguntar: si tenía tres artículos guardados en su cuenta desde el móvil, desaparecen. Además `localStorage` sin fecha ni validación acumula precios y disponibilidad obsoletos, y muestra al usuario un carrito con productos que ya no existen o con el precio de hace tres meses.

**⚠️ Respuesta aceptable**

> "Carrito local mientras es anónimo, y al autenticarse lo fusiono con el del servidor sumando cantidades, revalidando precios y stock contra el backend."

**Qué le falta:** los conflictos de la fusión, la caducidad y la fuente de verdad de precio y stock.

**✅ Respuesta ideal**

> "Decido primero la fuente de verdad de cada cosa: el contenido del carrito puede vivir en el cliente mientras es anónimo, pero el precio y la disponibilidad los manda siempre el servidor, y se revalidan al mostrar y otra vez al pagar. El carrito anónimo lo guardo con un identificador propio y caducidad; si es solo en el cliente, con esa marca de tiempo puedo ignorar lo que sea muy viejo. Al iniciar sesión, fusiono en lugar de reemplazar, y defino explícitamente los conflictos: mismo producto en ambos, me quedo con la cantidad mayor, no la suma, porque sumar suele sorprender al usuario; producto ya no disponible, lo muestro marcado y no lo elimino en silencio; precio cambiado, lo aviso antes de pagar. Todo eso lo hago visible: un mensaje de 'hemos unido tu carrito' evita el ticket de soporte. Y la operación de fusión la hago idempotente, porque un doble clic o un reintento no puede duplicar líneas."

**Por qué funciona:** decide la fuente de verdad por dato, define las reglas de conflicto explícitamente y piensa en lo que ve el usuario.

**🔁 Repregunta probable:** *"¿Y si el usuario tiene dos pestañas abiertas?"* → "Sincronizo entre pestañas —evento de storage o un canal— y hago que el servidor sea el árbitro en cuanto hay sesión; si no, el usuario ve dos carritos distintos y no entiende nada."

📚 [Curso 00 · Consistencia y CAP](../../cursos/00-fundamentos-distribuidos/02-consistencia-y-cap.md) · [Banco: carrito e inventario](../../casos-de-estudio/01-system-design.md)

---

### P6. ¿Dónde pones la lógica de negocio en una app fullstack?

**Qué evalúan:** criterio de arquitectura y si sabes lo que cuesta duplicar.

**❌ Lo que NO debes decir**

> "En el frontend, que así la app va más rápida y no hay que ir al servidor para cada cosa."

**Por qué está mal:** cualquier regla que afecte al dinero, a los permisos o a la integridad y viva solo en el cliente es una vulnerabilidad, no una optimización. Y aunque la dupliques, tener dos implementaciones de la misma regla garantiza que en seis meses no coinciden.

**⚠️ Respuesta aceptable**

> "La lógica de negocio va en el backend; el frontend solo presenta y valida formatos para dar feedback rápido."

**Qué le falta:** los matices reales, que son donde vive el trabajo: cálculos que el usuario necesita ver al instante y reglas que se comparten.

**✅ Respuesta ideal**

> "La regla que uso: la lógica que decide algo con consecuencias —precio final, permisos, stock, descuentos— vive en el servidor y es la única verdad. El cliente puede *anticipar* el resultado para que la experiencia sea instantánea, pero lo que se confirma es lo que dice el servidor; si difieren, manda el servidor y se lo digo al usuario. Cuando la regla es de presentación pura —formatear, ordenar, mostrar u ocultar— va en el cliente sin dudarlo. Y cuando de verdad hay que compartir una regla, la extraigo a un paquete común con sus tests, en vez de reimplementarla dos veces: la duplicación no falla el día uno, falla el día que alguien cambia una y no la otra, y ese bug es carísimo de encontrar porque cada capa 'funciona bien'. En la práctica, la mayoría de estos conflictos desaparecen si el backend devuelve el resultado calculado —el total, los permisos efectivos— en vez de los ingredientes para que el cliente calcule."

**Por qué funciona:** da una regla clara, admite el matiz de UX optimista, y aporta la solución más elegante (que el servidor devuelva el resultado, no los ingredientes).

**🔁 Repregunta probable:** *"¿Y si el cálculo es caro y lo piden mil veces?"* → "Lo cacheo en el servidor con una clave que incluya lo que afecta al resultado, y devuelvo el valor con su versión. Mover el cálculo al cliente por ahorrar CPU del servidor es cambiar un problema de coste por uno de correctitud."

📚 [Curso 08 · Catálogo de patrones](../../cursos/08-system-design/03-catalogo-de-patrones.md)

---

### P7. ¿Cómo respondes cuando te preguntan por una capa que dominas menos?

**Qué evalúan:** honestidad calibrada. En fullstack **siempre** llega esta situación.

**❌ Lo que NO debes decir**

> "Sé de todo, backend, frontend, infraestructura y bases de datos, no tengo problema con ninguna capa."

**Por qué está mal:** nadie lo cree, y a la tercera repregunta se demuestra falso. Peor: cuando te pillan inventando en un tema, el entrevistador empieza a dudar de todo lo que dijiste antes, incluso de lo que era cierto.

**⚠️ Respuesta aceptable**

> "Me defiendo en las dos capas, aunque me siento más cómodo en backend; en frontend he trabajado con React a nivel de aplicación."

**Qué le falta:** convertir la limitación en evidencia de criterio: qué haces cuando llegas a tu límite.

**✅ Respuesta ideal**

> "Soy más fuerte en backend y lo digo abiertamente: ahí es donde he depurado problemas de concurrencia y de datos en producción. En frontend soy autónomo para construir una aplicación completa —estado, rendimiento, accesibilidad básica— pero no me pondría a diseñar el sistema de diseño de una organización grande sin apoyo de alguien especialista. Cuando llego a mi límite hago dos cosas: lo digo antes de que se convierta en un problema, y busco a quien sabe en vez de improvisar. Por ejemplo, en el último proyecto el rendimiento del render no lo resolví por intuición: medí, pedí revisión a una compañera con más experiencia en frontend, y de paso aprendí. Prefiero que sepas exactamente dónde estoy en cada capa a que te lleves una sorpresa en el primer sprint."

**Por qué funciona:** calibra el nivel por capa, muestra qué hace ante el límite y cierra con una razón de negocio (cero sorpresas). La honestidad, bien contada, suma.

**🔁 Repregunta probable:** *"¿Y si el puesto exige más frontend del que tienes?"* → "Entonces prefiero saberlo ahora: puedo cubrirlo con apoyo y aprendo rápido, pero si necesitáis a alguien que lidere frontend desde el día uno, no soy el perfil, y decirlo hoy nos ahorra a los dos tres meses."

📚 [Curso 09 · Cómo comunicar](../../cursos/09-tecnica-de-entrevista/01-como-comunicar.md)

---

## Rúbrica rápida

| Dimensión | Qué mirar |
|---|---|
| **Costuras** | ¿Hablé de la frontera entre capas, no solo de cada capa? |
| **Fuente de verdad** | ¿Dije quién manda en cada dato? |
| **Despliegue** | ¿Asumí que cliente y servidor se despliegan por separado? |
| **Honestidad** | ¿Calibré mi nivel en cada capa sin inventar? |
| **Usuario** | ¿Mencioné qué percibe el usuario, no solo qué hace el sistema? |
