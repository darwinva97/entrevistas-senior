# 🧪 Entrevista técnica · QA / Automatización

> Simulacro por niveles. Lee **solo la pregunta**, responde en voz alta y cronometrada. Formato explicado en [cómo funcionan los simulacros](../README.md).

## Qué evalúan en cada nivel

| Nivel | Lo que buscan | Lo que te descarta |
|---|---|---|
| **Junior** | Criterio para diseñar casos, curiosidad, reporte claro de bugs | "Probar" sin estrategia; reportes sin pasos de reproducción |
| **Semi-senior** | Automatización mantenible, dónde poner cada prueba, datos de prueba | Automatizar todo por la interfaz |
| **Senior** | Estrategia de calidad, riesgo, flakiness, calidad en el proceso | Ser el cuello de botella al final del sprint |
| **Staff / QA Lead** | Calidad como propiedad del equipo, métricas, calidad en producción | Medir por número de casos ejecutados |

## Guion típico (60 minutos)

```
 5 min · tu experiencia y tipo de producto que has probado
15 min · diseño de casos sobre una funcionalidad concreta
15 min · automatización: qué, dónde y cómo
15 min · caso real: un bug escapó a producción
10 min · calidad de proceso y tus preguntas
```

---

## Nivel junior

### P1. Te dan un campo de "edad" en un formulario. ¿Qué casos de prueba diseñas?

**Qué evalúan:** técnica de diseño de casos. Es la pregunta más común y la que más se responde por intuición.

**❌ Lo que NO debes decir**

> "Probaría con 18, con 30 y con 50 a ver si funciona, y también con letras."

**Por qué está mal:** son ejemplos, no técnica. Tres valores válidos del mismo grupo aportan la misma información que uno solo, y no cubren los bordes, que es donde están los bugs. Un entrevistador espera oír *clases de equivalencia* y *valores límite*, aunque no uses esos nombres.

**⚠️ Respuesta aceptable**

> "Usaría clases de equivalencia y valores límite: un valor válido, uno por debajo del mínimo, uno por encima del máximo, los límites exactos, vacío, letras y símbolos."

**Qué le falta:** las preguntas previas (¿cuáles son las reglas de negocio?) y los casos no obvios: negativos, decimales, espacios, unicode, longitud extrema, y qué pasa en el backend si alguien salta la validación del navegador.

**✅ Respuesta ideal**

> "Antes de escribir casos pregunto las reglas: ¿rango permitido, es obligatorio, qué pasa con un menor de edad en este flujo? Con eso aplico clases de equivalencia y valores límite: si el rango es 18–120, pruebo 17, 18, 19, 119, 120, 121, y un valor central. Añado los casos de formato: vacío, espacios, letras, decimales, negativos, número enorme, y unicode. Y sobre todo pruebo **en el backend**, saltándome el formulario con una petición directa, porque la validación del cliente es experiencia de usuario y la del servidor es la que protege los datos. Por último, los casos de estado: qué se guarda, qué se ve al recargar, y si el mensaje de error dice al usuario cómo corregirlo."

**Por qué funciona:** pregunta antes de probar, aplica técnica con nombre y salta al backend, que es donde está el riesgo real.

**🔁 Repregunta probable:** *"¿Cuántos casos automatizarías de esos?"* → "Los de validación, a nivel de unidad o de API, que son rápidos y estables. Por la interfaz solo dejaría uno o dos de flujo feliz."

📚 [Curso 06 · Modelo de amenazas y OWASP](../../cursos/06-seguridad/01-modelo-de-amenazas-y-owasp.md)

---

### P2. Encuentras un bug. ¿Cómo lo reportas?

**Qué evalúan:** comunicación. Un bug mal reportado cuesta horas de ida y vuelta.

**❌ Lo que NO debes decir**

> "Pongo un ticket con una captura y le escribo al desarrollador por chat que no funciona el checkout."

**Por qué está mal:** "no funciona" no es información. Sin pasos, entorno, datos usados, resultado esperado frente al obtenido, ni evidencia técnica, el desarrollador va a gastar su tiempo en reproducirlo o, peor, va a cerrarlo como "no reproducible".

**⚠️ Respuesta aceptable**

> "Escribo el título, los pasos para reproducir, el resultado esperado y el obtenido, el entorno y adjunto una captura o un vídeo."

**Qué le falta:** severidad frente a prioridad, alcance (¿a cuántos usuarios afecta?, ¿es siempre o intermitente?) y evidencia técnica que acelere el diagnóstico.

**✅ Respuesta ideal**

> "Con lo mínimo para que otro lo reproduzca sin preguntarme nada: título que describa el efecto, pasos numerados con los datos exactos que usé, resultado esperado y obtenido, entorno y versión, y evidencia. Añado dos cosas que ahorran mucho tiempo: el alcance —si pasa siempre o una de cada diez veces, en qué navegadores, si afecta solo a un tipo de cuenta— y la evidencia técnica: petición y respuesta de red, el error de consola y el identificador de traza si lo tenemos, porque con eso el desarrollador va directo al log. Y separo severidad de prioridad: puede ser un fallo grave en una pantalla que usan tres personas al mes, y esa conversación la tiene el producto, no yo solo."

**Por qué funciona:** piensa en el receptor, aporta datos que reducen el tiempo de diagnóstico y distingue severidad de prioridad, que es criterio de producto.

**🔁 Repregunta probable:** *"¿Y si no puedes reproducirlo?"* → "Lo reporto igual, marcándolo como intermitente, con toda la evidencia que tenga y la frecuencia observada; y busco correlación: usuario, datos, hora, versión. Los bugs intermitentes suelen ser concurrencia o estado acumulado."

📚 [Curso 00 · Observabilidad y diagnóstico](../../cursos/00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)

---

## Nivel semi-senior

### P3. ¿Qué automatizas y a qué nivel?

**Qué evalúan:** si conoces el coste de mantenimiento de cada tipo de prueba.

**❌ Lo que NO debes decir**

> "Automatizo todos los casos de regresión con Selenium o Cypress para tener cobertura completa por la interfaz."

**Por qué está mal:** es la receta del *ice cream cone*: una suite lenta, cara e inestable que acaba desactivada. Las pruebas de interfaz son las que más tardan, más se rompen por cambios cosméticos y peor localizan la causa. "Cobertura completa por la UI" es una promesa que nunca sobrevive a un año de producto.

**⚠️ Respuesta aceptable**

> "Sigo la pirámide de pruebas: muchas unitarias, algunas de integración y pocas end-to-end, automatizando por la interfaz solo los flujos críticos."

**Qué le falta:** el criterio para decidir *qué* flujos y el nivel intermedio de API, que es donde más retorno hay.

**✅ Respuesta ideal**

> "Automatizo por riesgo y por coste de mantenimiento, no por cobertura. La mayor parte del valor está en el nivel de API: es rápido, estable y prueba la lógica de verdad, así que ahí llevo las validaciones, los permisos y los casos borde. Por la interfaz dejo solo los recorridos que dan dinero o bloquean al usuario: registro, login, compra. Como regla, una prueba de UI tiene que justificar su existencia porque cuesta mantenerla; si un caso se puede cubrir un nivel más abajo, ahí va. También automatizo lo que no es funcional pero se rompe callado: contratos entre servicios, accesibilidad básica y algún chequeo de rendimiento. Y lo manual no desaparece: lo reservo para exploratorio, que es donde encuentro los bugs que nadie escribió como caso."

**Por qué funciona:** decide por riesgo y coste, coloca el peso en API, defiende lo exploratorio y menciona contract testing.

**🔁 Repregunta probable:** *"¿Cómo eliges los flujos críticos?"* → "Con datos: analítica de uso, ingresos por flujo e historial de incidentes. Y lo valido con producto y soporte, que saben qué duele cuando se rompe."

📚 [Curso 07 · Estrategias de versionado](../../cursos/07-apis-y-versionado/02-estrategias-de-versionado.md)

---

### P4. Tienes pruebas que fallan de forma intermitente. ¿Qué haces?

**Qué evalúan:** flakiness. Es *el* problema de QA senior y muchos lo tratan como una molestia.

**❌ Lo que NO debes decir**

> "Les pongo reintentos automáticos, y si una falla mucho la marco como *skip* para no bloquear el pipeline."

**Por qué está mal:** el reintento esconde el síntoma y a veces esconde un bug real de concurrencia del producto, no de la prueba. Y una prueba en *skip* es una prueba muerta que da falsa sensación de cobertura. Además, la consecuencia cultural es peor: el equipo aprende a ignorar el rojo, y el día que el rojo es de verdad nadie lo mira.

**⚠️ Respuesta aceptable**

> "Investigo la causa: suelen ser esperas fijas, dependencia del orden de ejecución o datos compartidos entre pruebas. Cambio los `sleep` por esperas por condición y aíslo los datos."

**Qué le falta:** el proceso alrededor (cuarentena con dueño y fecha) y la posibilidad de que la inestabilidad sea del producto.

**✅ Respuesta ideal**

> "Trato la inestabilidad como un bug de prioridad alta, porque su coste real es que el equipo deje de confiar en la suite. Primero mido: qué pruebas fallan, con qué frecuencia y desde cuándo, porque sin ese ranking se arregla por percepción. Las causas típicas son cuatro: esperas fijas en vez de esperas por condición, dependencia del orden o de datos compartidos, entorno inestable, y —la importante— una condición de carrera real del producto, en cuyo caso la prueba está haciendo su trabajo y hay que investigar el código. Mientras se arregla, cuarentena con dueño y fecha, no `skip` indefinido, y visible en un panel para que no se olvide. Los reintentos los permito solo como red de seguridad temporal y con métrica, nunca como solución, porque un reintento silencioso es una forma de mentir sobre la calidad."

**Por qué funciona:** mide, clasifica causas, contempla que el bug sea real y propone un proceso con dueño, que es lo que hace que se arregle.

**🔁 Repregunta probable:** *"¿Cuál es un objetivo razonable?"* → "Que el porcentaje de ejecuciones rojas por inestabilidad esté por debajo del 1%, y que una prueba con más de X fallos intermitentes por semana entre en cuarentena automáticamente."

📚 [Curso 09 · Simulacros](../../cursos/09-tecnica-de-entrevista/02-simulacros.md)

---

## Nivel senior

### P5. Un bug crítico llegó a producción pasando por tu proceso de QA. ¿Qué haces?

**Qué evalúan:** cultura de calidad. Y si buscas culpables o barreras.

**❌ Lo que NO debes decir**

> "Ese caso no estaba en el plan de pruebas, así que no lo cubrimos. Habría que pedir requisitos más completos."

**Por qué está mal:** es una defensa, no un análisis. Aunque sea cierto que faltaban requisitos, la respuesta traslada la responsabilidad y no aporta ninguna mejora. En un rol senior esperan que asumas el sistema completo, no tu casilla.

**⚠️ Respuesta aceptable**

> "Analizo cómo se escapó, añado el caso a la suite de regresión automatizada y reviso si hay casos similares sin cubrir."

**Qué le falta:** las otras barreras que fallaron. Añadir el caso evita *ese* bug; no evita la clase de bug.

**✅ Respuesta ideal**

> "Lo trato como un fallo del sistema de calidad, no de una persona. Primero contengo con el equipo: qué impacto tiene, se revierte o se apaga con un flag. Después, el análisis: no solo por qué no lo detectamos en pruebas, sino por qué no lo detectó nada más. Normalmente fallaron varias barreras: no había caso, ni validación en el código, ni alerta que lo hubiera hecho evidente en producción. Y una pregunta que me parece más importante que la primera: ¿cuánto tardamos en enterarnos? Si lo reportó un cliente, mi problema no es solo de pruebas, es de observabilidad. Las acciones que salen de ahí son tres: el caso concreto automatizado al nivel más barato posible, una barrera que cubra la familia entera —una validación, un contrato, un tipo— y una alerta que detecte el síntoma en producción. Y lo escribo sin nombres propios, porque si el postmortem busca culpables, el próximo bug me llega tarde y por rumores."

**Por qué funciona:** contiene, analiza el sistema completo, pregunta por el tiempo de detección y genera acciones de tres tipos distintos.

**🔁 Repregunta probable:** *"¿Cómo evitas que la suite crezca sin control añadiendo un caso por cada bug?"* → "Añadiendo al nivel más barato y revisando periódicamente: casos que nunca han fallado en dos años y cubren código estable son candidatos a borrarse. Una suite es código y también tiene deuda."

📚 [Curso 06 · Respuesta a incidentes](../../cursos/06-seguridad/04-respuesta-a-incidentes.md) · [Curso 08 · Guion de incidentes](../../cursos/08-system-design/05-guion-de-incidentes.md)

---

### P6. El equipo quiere desplegar a diario y tu ciclo de regresión dura dos días. ¿Qué propones?

**Qué evalúan:** si sabes que QA no puede ser una puerta al final.

**❌ Lo que NO debes decir**

> "Entonces no podemos desplegar a diario: necesitamos el tiempo de regresión para garantizar la calidad."

**Por qué está mal:** convierte a QA en el freno oficial de la empresa, y parte de una premisa falsa: que la calidad depende de un ciclo largo al final. Es también la respuesta que hace que la organización acabe saltándose a QA.

**⚠️ Respuesta aceptable**

> "Automatizaría la regresión para reducir el tiempo, y dejaría solo lo manual imprescindible antes de cada despliegue."

**Qué le falta:** el cambio de modelo. Automatizar la misma pirámide invertida solo la hace algo más rápida; sigue siendo una puerta.

**✅ Respuesta ideal**

> "Cambio el modelo: la calidad deja de ser una fase y pasa a estar repartida. En el pipeline de cada cambio solo va lo rápido y estable —unitarias, de API, contratos y un puñado de recorridos críticos— con un objetivo claro, por ejemplo diez minutos. Lo lento y valioso pasa a ejecutarse fuera del camino crítico: por la noche o en paralelo, y lo que encuentre entra como bug, no como bloqueo del despliegue. Y me apoyo en producción: si desplegamos con feature flags y canary, puedo lanzar a un 5% de usuarios y observar métricas antes de abrir a todos, lo que reduce el riesgo mucho más que un día extra de pruebas manuales. A cambio pido dos cosas: rollback rápido y observabilidad decente, porque sin ellas mover la calidad hacia producción es imprudente. Y sigo haciendo exploratorio, pero sobre lo nuevo, no repitiendo regresión que la máquina hace mejor."

**Por qué funciona:** propone un modelo completo (shift-left y shift-right), pone objetivos numéricos y negocia condiciones en vez de bloquear.

**🔁 Repregunta probable:** *"¿Y si no hay feature flags ni observabilidad?"* → "Entonces esa es la inversión previa, y lo digo con datos: hoy la única red de seguridad son dos días de pruebas manuales, y eso no escala ni detecta lo que solo se ve con tráfico real."

📚 [Curso 04 · Kubernetes](../../cursos/04-cloud-y-kubernetes/04-kubernetes.md) · [Curso 04 · Fiabilidad y costes](../../cursos/04-cloud-y-kubernetes/05-fiabilidad-y-costos.md)

---

## Nivel staff / QA Lead

### P7. ¿Cómo mides la calidad de un producto?

**Qué evalúan:** si mides trabajo de QA o resultados de negocio.

**❌ Lo que NO debes decir**

> "Con el número de casos ejecutados, los bugs encontrados y el porcentaje de cobertura de código."

**Por qué está mal:** son métricas de actividad, no de calidad, y todas se pueden manipular: más casos triviales, más bugs cosméticos, más cobertura de getters. Peor: incentivan lo contrario de lo que quieres, porque premian encontrar bugs tarde en vez de evitarlos.

**⚠️ Respuesta aceptable**

> "Miraría bugs escapados a producción, tiempo de resolución y estabilidad de la suite, más que número de casos."

**Qué le falta:** la voz del usuario y la conexión con el negocio.

**✅ Respuesta ideal**

> "Con métricas de resultado, no de actividad. Las que uso: incidentes que llegan al usuario por severidad, tiempo hasta detectarlos —que suele ser el número más revelador—, tasa de fallos en despliegue y tiempo de recuperación, y el porcentaje de trabajo dedicado a retrabajo. Encima, la señal del usuario: tickets de soporte por área, abandono en los flujos críticos y errores que ve el cliente frente a los que ve el servidor. Vigilo también la salud del propio sistema de pruebas: duración del pipeline y porcentaje de inestabilidad, porque una suite lenta e inestable degrada la calidad aunque el panel esté verde. Y explícitamente no mido por número de casos ni por bugs encontrados, porque premian encontrar tarde en vez de prevenir; si mi trabajo va bien, los bugs encontrados en QA deberían *bajar* mientras los escapados también bajan."

**Por qué funciona:** métricas de resultado, incluye la voz del usuario, mide el propio proceso y explica por qué rechaza las métricas fáciles.

**🔁 Repregunta probable:** *"¿Y cómo justificas la inversión en calidad ante dirección?"* → "En tiempo y dinero: retrabajo, horas de incidentes, ventas perdidas en el flujo roto. 'Cada despliegue fallido nos cuesta X horas de equipo y Y pedidos' convence mucho más que un porcentaje de cobertura."

📚 [Curso 04 · Fiabilidad y costes](../../cursos/04-cloud-y-kubernetes/05-fiabilidad-y-costos.md)

---

### P8. ¿Cómo haces que la calidad sea responsabilidad de todo el equipo y no solo de QA?

**Qué evalúan:** influencia sin autoridad. Es la pregunta de liderazgo del rol.

**❌ Lo que NO debes decir**

> "Estableciendo una política: ningún ticket pasa a *done* sin la aprobación de QA."

**Por qué está mal:** refuerza justo lo contrario. Si QA es el sello final, el equipo delega en QA la responsabilidad y deja de pensar en calidad al escribir el código. Además te convierte en cuello de botella y en el "no" de la organización.

**⚠️ Respuesta aceptable**

> "Involucrando a QA desde el refinamiento, formando al equipo y promoviendo que los desarrolladores escriban sus propias pruebas."

**Qué le falta:** cómo se consigue en la práctica y qué cambia en los rituales.

**✅ Respuesta ideal**

> "Con tres movimientos. Primero, entrar antes: en el refinamiento, cuando aún se puede cambiar el diseño, haciendo las preguntas incómodas —qué pasa si esto falla a la mitad, qué ve el usuario, cómo lo sabremos en producción—. Ahí una hora vale por una semana de pruebas después. Segundo, dar herramientas en vez de veredictos: entornos y datos de prueba fáciles, utilidades para escribir pruebas de API sin sufrir, y ejemplos que se puedan copiar; la gente hace lo correcto cuando es lo más fácil. Tercero, cambiar el ritual: el *definition of done* incluye pruebas automatizadas y observabilidad de la funcionalidad, y en la demo se enseña también cómo se comporta cuando falla. Yo dejo de ser la puerta y paso a ser quien diseña la estrategia, acompaña el exploratorio y cuida las métricas. Es un cambio incómodo al principio porque parece que pierdes control, pero el control era ilusorio: lo que había era un cuello de botella."

**Por qué funciona:** tres palancas concretas, cambia rituales en vez de imponer política, y reconoce la parte incómoda con honestidad.

**🔁 Repregunta probable:** *"¿Y si los desarrolladores no quieren escribir pruebas?"* → "Suele ser porque escribir pruebas ahí duele: entorno frágil, datos imposibles, suite lenta. Arreglo eso primero y la resistencia baja sola; si persiste, lo hago visible con datos de retrabajo, no con reproches."

📚 [Curso 09 · Comportamiento y cierre](../../cursos/09-tecnica-de-entrevista/03-comportamiento-y-cierre.md)

---

## Rúbrica rápida

| Dimensión | Qué mirar |
|---|---|
| **Técnica** | ¿Nombré técnicas de diseño de casos o solo di ejemplos? |
| **Nivel correcto** | ¿Puse cada prueba en el nivel más barato que la cubre? |
| **Riesgo** | ¿Prioricé por impacto en el usuario y en el negocio? |
| **Proceso** | ¿Hablé de prevención además de detección? |
| **No-bloqueo** | ¿Propuse alternativas en vez de frenar la entrega? |
