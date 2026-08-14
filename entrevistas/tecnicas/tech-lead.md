# 🧭 Entrevista técnica · Tech Lead

> Simulacro para roles de liderazgo técnico con equipo. Lee **solo la pregunta**, responde en voz alta. Formato explicado en [cómo funcionan los simulacros](../README.md).

Un tech lead se evalúa en la intersección: **decisiones técnicas + entrega + personas**. La trampa más frecuente es responder como si siguieras siendo el mejor programador del equipo; el trabajo ya no es ese.

## Qué evalúan

| Dimensión | Qué buscan | Señal de alarma |
|---|---|---|
| **Técnica** | Criterio, no dominio absoluto | Ser el único que puede tocar el código crítico |
| **Entrega** | Predecibilidad, priorización, gestión del riesgo | "Se retrasó porque el equipo no rindió" |
| **Personas** | Crecimiento del equipo, feedback, conflictos | Tratar a la gente como recursos asignables |
| **Alineación** | Traducir negocio ↔ técnica en ambos sentidos | Aislar al equipo de todo contexto |

## Guion típico (60–75 minutos)

```
10 min · tu experiencia liderando y cómo llegaste al rol
20 min · situaciones de entrega y priorización
20 min · situaciones de personas y conflictos
15 min · una decisión técnica que lideraste
10 min · tus preguntas
```

---

## P1. ¿Cuánto código escribes como tech lead?

**Qué evalúan:** si entiendes el cambio de rol. Es una pregunta de calibración, no hay una cifra correcta.

**❌ Lo que NO debes decir**

> "Sigo siendo el que más código escribe del equipo: me encargo de las partes críticas porque soy quien mejor conoce el sistema."

**Por qué está mal:** describes un cuello de botella y un riesgo de continuidad. Si las partes críticas solo las toca una persona, el equipo no crece, las vacaciones son un problema y tu salida sería un incidente. Además, si escribes el grueso del código, no estás haciendo el trabajo por el que te pagan: desbloquear a otros.

**⚠️ Respuesta aceptable**

> "Escribo menos que antes, quizá un 30% del tiempo, y lo combino con revisiones, diseño y coordinación. Intento no ser el camino crítico de ninguna entrega."

**Qué le falta:** qué código eliges escribir, que es lo que revela criterio.

**✅ Respuesta ideal**

> "Menos de la mitad de mi tiempo, y lo importante no es la cantidad sino qué elijo. Escribo cosas que no bloquean a nadie: prototipos para reducir incertidumbre de una decisión, herramientas internas, el andamiaje de una integración nueva, corrección de bugs de producción cuando toca guardia. Lo que evito es ponerme en el camino crítico de una entrega, porque mi calendario está lleno de interrupciones y convertirme en dependencia retrasa al equipo. También me obligo a mantener contacto real con el código —revisiones y algún cambio propio— porque un líder técnico que lleva un año sin tocar el sistema empieza a decidir sobre un mapa desactualizado y el equipo lo nota enseguida. Y en las partes críticas hago justo lo contrario de acapararlas: emparejo a alguien conmigo hasta que haya al menos dos personas que puedan tocarlas."

**Por qué funciona:** explica el criterio de selección, evita ser bloqueante, mantiene credibilidad técnica y reparte conocimiento.

**🔁 Repregunta probable:** *"¿Y si el equipo va mal de tiempo?"* → "Ayudo, pero primero miro si el problema es capacidad o alcance; meterme a programar con prisa suele ser un parche que además me quita la vista de lo que causó el retraso."

📚 [Curso 09 · Cómo comunicar](../../cursos/09-tecnica-de-entrevista/01-como-comunicar.md)

---

## P2. Producto pide una funcionalidad para el viernes y tu equipo dice que necesita dos semanas. ¿Qué haces?

**Qué evalúan:** negociación y gestión de alcance. Es la situación más común del rol.

**❌ Lo que NO debes decir**

> "Le digo al equipo que hay que hacer el esfuerzo y sacarlo el viernes; si hace falta, echamos horas extra."

**Por qué está mal:** sacrificas al equipo y la calidad para no tener una conversación incómoda. Las horas extra como herramienta de planificación producen bugs, deuda y rotación, y funcionan una vez: la siguiente vez que estimen, el equipo inflará por defensa.

**⚠️ Respuesta aceptable**

> "Hablo con producto para entender la urgencia real y busco un alcance reducido que podamos entregar el viernes, dejando el resto para después."

**Qué le falta:** el porqué de la fecha, las opciones concretas con su coste y qué hace si aun así insisten.

**✅ Respuesta ideal**

> "Empiezo por entender la fecha, porque no todos los viernes son iguales: si hay una campaña de marketing comprada o un compromiso con un cliente, el problema es real y cambia mi respuesta; si es una fecha aspiracional, hay margen. Después pongo opciones sobre la mesa en vez de un sí o un no: qué subconjunto entrega valor de verdad el viernes —muchas veces el 20% de la funcionalidad cubre el 80% del caso—, qué se puede lanzar detrás de un flag para un grupo reducido, y qué pasa si movemos la fecha una semana. Cada opción con su coste explícito, incluida la deuda que asumimos si recortamos calidad, con fecha de pago. Y una cosa que hago siempre: hablo con producto en su terreno —riesgo e impacto— y no con 'es que técnicamente es complejo', que no significa nada para ellos. Si aun así deciden ir con el alcance completo el viernes, dejo claro por escrito qué se cae —normalmente pruebas o el rollback seguro— y quién asume ese riesgo; y después lo apoyo, sin resentimiento."

**Por qué funciona:** entiende antes de negociar, ofrece opciones con coste, habla el idioma de producto y deja el riesgo registrado sin dramatizar.

**🔁 Repregunta probable:** *"¿Y si tu equipo se siente presionado igualmente?"* → "Ahí mi trabajo es absorber presión, no transmitirla: el equipo debe recibir el alcance acordado, no la angustia de la negociación."

📚 [Curso 09 · Comportamiento y cierre](../../cursos/09-tecnica-de-entrevista/03-comportamiento-y-cierre.md)

---

## P3. Un miembro del equipo tiene un rendimiento por debajo del resto. ¿Cómo lo manejas?

**Qué evalúan:** si diagnosticas antes de juzgar y si hablas de personas con respeto.

**❌ Lo que NO debes decir**

> "Lo hablo con su manager para que lo gestione o lo cambie de equipo; yo no puedo estar arrastrando a alguien que no rinde."

**Por qué está mal:** delegas la parte difícil de tu trabajo y le pones etiqueta a la persona antes de haber investigado. Además la frase "arrastrando" revela una actitud que en una entrevista de liderazgo pesa muchísimo: si hablas así de un compañero delante de un desconocido, imagina en el equipo.

**⚠️ Respuesta aceptable**

> "Hablo con la persona en privado para entender qué le está pasando, le doy feedback concreto y acordamos un plan de mejora con seguimiento."

**Qué le falta:** las causas posibles, que casi nunca son "no rinde", y qué hago yo distinto.

**✅ Respuesta ideal**

> "Primero compruebo si el problema es real o es mi percepción: busco hechos concretos —tareas que se alargan, retrabajo, calidad— en vez de una sensación, porque las percepciones se contaminan fácil. Después hablo en privado, y empiezo preguntando en lugar de diagnosticando, porque en mi experiencia las causas más frecuentes no son de capacidad: falta de contexto, tareas mal definidas, bloqueos que no se atreve a levantar, un problema personal, o simplemente que le hemos puesto en un terreno donde no tiene experiencia y nadie le ha acompañado. Según lo que salga, cambio yo algo: reparto distinto, emparejo con alguien, doy contexto o ajusto expectativas. Acordamos objetivos concretos y observables, con seguimiento frecuente y corto, no una revisión dentro de seis meses. Y soy honesto: si tras un tiempo razonable con apoyo real no funciona, lo digo con claridad y lo escalo con el manager, pero con evidencia, con la persona informada en cada paso y sin sorpresas. Lo que no hago es dejarlo correr: es injusto para el equipo y sobre todo para esa persona, que merece saber dónde está."

**Por qué funciona:** verifica, pregunta antes de concluir, asume su parte, actúa con plazos y admite que a veces no funciona, sin crueldad ni evasión.

**🔁 Repregunta probable:** *"¿Y si el resto del equipo se queja?"* → "Escucho y no comparto detalles de una conversación privada. Puedo decir que soy consciente y que lo estoy trabajando; la confianza del equipo se pierde igual si no hago nada que si lo cuento todo."

📚 [Curso 09 · Comportamiento y cierre](../../cursos/09-tecnica-de-entrevista/03-comportamiento-y-cierre.md)

---

## P4. Dos personas del equipo discuten sobre una decisión técnica y el debate se ha estancado. ¿Qué haces?

**Qué evalúan:** cómo desbloqueas sin imponer y sin dejar que el ruido siga.

**❌ Lo que NO debes decir**

> "Como tech lead, decido yo y se acabó la discusión. Alguien tiene que cortar."

**Por qué está mal:** cortar es a veces necesario, pero como *primera* medida enseña al equipo que el debate es inútil y que gana quien tiene el cargo. A partir de ahí dejan de traerte problemas y las decisiones se toman a tus espaldas o no se toman.

**⚠️ Respuesta aceptable**

> "Les pido que pongan por escrito los pros y contras de cada opción, hacemos una reunión corta y decidimos con criterios objetivos."

**Qué le falta:** el criterio de decisión previo y la gestión de la parte emocional, que suele ser el verdadero bloqueo.

**✅ Respuesta ideal**

> "Casi siempre el estancamiento no es por falta de argumentos, sino porque están discutiendo con criterios distintos sin saberlo. Así que lo primero es acordar contra qué decidimos: coste de operación, tiempo de entrega, reversibilidad, quién lo va a mantener. Con el criterio claro, muchas discusiones se resuelven solas. Si sigue empatado, miro cuánto cuesta equivocarse: si la decisión es barata de revertir, elegimos una y seguimos, porque el coste de seguir debatiendo ya supera al de equivocarse, y lo digo así explícitamente. Si es cara, hacemos un experimento acotado con una fecha, y decide el dato. Solo si nada de eso desbloquea, decido yo, explico por qué y me hago responsable del resultado; y me aseguro de que quien no ganó sepa que su argumento se entendió, porque si no la discusión sigue en los pasillos. Y hay un matiz que vigilo: si esto pasa a menudo entre las dos mismas personas, el problema probablemente no es técnico y esa conversación la tengo por separado."

**Por qué funciona:** ataca la causa (criterios distintos), usa la reversibilidad como palanca, decide como último recurso y detecta el patrón interpersonal.

**🔁 Repregunta probable:** *"¿Y si la opción que eliges no es la que tú preferías?"* → "Pasa a menudo y es sano: si el criterio acordado favorece la otra, defenderla es lo que da credibilidad al criterio."

📚 [Curso 08 · Framework de 45 minutos](../../cursos/08-system-design/01-framework-de-45-minutos.md)

---

## P5. Tu equipo acumula deuda técnica y producto no quiere parar para arreglarla. ¿Cómo lo gestionas?

**Qué evalúan:** si sabes vender fiabilidad en lenguaje de negocio.

**❌ Lo que NO debes decir**

> "Paramos dos sprints para refactorizar; si no, esto no hay quien lo mantenga."

**Por qué está mal:** "parar" es la propuesta que ningún producto acepta y que además rara vez funciona: un refactor grande sin entregar valor durante semanas es difícil de justificar, difícil de revisar y se queda a medias en cuanto llega una urgencia. Y presentarlo como ultimátum quema el capital político que necesitas para lo siguiente.

**⚠️ Respuesta aceptable**

> "Negocio un porcentaje fijo de capacidad por sprint para deuda técnica, por ejemplo un 20%, y priorizo dentro de ese espacio lo que más nos frena."

**Qué le falta:** los datos que justifican ese porcentaje y la conexión con lo que producto quiere conseguir.

**✅ Respuesta ideal**

> "Dejo de llamarlo deuda técnica cuando hablo con producto, porque esa etiqueta suena a capricho de ingeniería. Lo traduzco a lo que les importa: 'este módulo nos hace tardar el doble en cada cambio', 'esto ha causado tres incidentes este trimestre, con X horas de equipo y clientes afectados'. Para eso necesito datos, así que mido: tiempo de entrega por área, incidentes por componente, porcentaje de retrabajo. Con eso, la conversación deja de ser opinión contra opinión. Después no pido parar: pido un porcentaje constante de capacidad y lo ligo a la hoja de ruta, atacando primero la deuda que está en el camino de lo que producto quiere entregar los próximos meses, que es la que se justifica sola. Y prefiero el refactor oportunista dentro del trabajo normal antes que proyectos de limpieza aparte, porque entregan valor mientras mejoran. Lo único que sí escalo como riesgo formal es lo que puede tirar el sistema o bloquear una entrega grande: eso no es deuda, es riesgo operativo, y esa conversación es distinta."

**Por qué funciona:** traduce, mide, integra en la hoja de ruta y distingue deuda de riesgo, que es una distinción que muy poca gente hace.

**🔁 Repregunta probable:** *"¿Y si aun así te dicen que no?"* → "Registro el riesgo con su impacto estimado y sigo; y cuando ocurra el incidente, no digo 'te lo dije': uso ese momento para reabrir la conversación con datos frescos."

📚 [Curso 04 · Fiabilidad y costes](../../cursos/04-cloud-y-kubernetes/05-fiabilidad-y-costos.md)

---

## P6. ¿Cómo haces crecer a la gente de tu equipo?

**Qué evalúan:** si el crecimiento del equipo es un objetivo tuyo o algo que "pasa".

**❌ Lo que NO debes decir**

> "Les paso tareas difíciles y les recomiendo cursos; con el tiempo van cogiendo experiencia."

**Por qué está mal:** es delegar el desarrollo a la suerte. Ni hay diagnóstico de qué necesita cada persona, ni acompañamiento, ni forma de saber si funciona. Y "tareas difíciles" sin apoyo es la receta habitual para quemar a alguien y confirmar sus inseguridades.

**⚠️ Respuesta aceptable**

> "Tengo uno a uno regulares, hablamos de sus objetivos y les asigno trabajo que les rete, con revisiones y feedback frecuente."

**Qué le falta:** concreción sobre cómo se decide qué reto y cómo se acompaña.

**✅ Respuesta ideal**

> "Empiezo por saber dónde quiere ir cada uno, que no siempre coincide con lo que yo asumiría: hay quien quiere profundidad técnica, quien quiere liderar y quien está bien donde está y necesita estabilidad, y todas son respuestas legítimas. Con eso reparto el trabajo con intención, no solo por disponibilidad: uso las tareas reales como vehículo de crecimiento —liderar una funcionalidad end-to-end, ser el punto de contacto con otro equipo, llevar una guardia acompañada, presentar una decisión— y siempre con una red: alguien con quien emparejar, revisión y permiso explícito para equivocarse. El feedback lo doy pronto y concreto, tanto lo bueno como lo mejorable, y en el uno a uno hablamos también de lo que *yo* puedo hacer distinto. Dos cosas que cuido especialmente: que el trabajo visible se reparta —si siempre presenta la misma persona, estoy decidiendo quién promociona sin darme cuenta— y que el crecimiento se note fuera del equipo, porque si no queda en una conversación privada que no se traduce en nada."

**Por qué funciona:** pregunta antes de asumir, usa el trabajo real como vehículo, incluye red de seguridad y menciona la equidad en la visibilidad, que es un detalle de líder maduro.

**🔁 Repregunta probable:** *"¿Y si alguien crece y se quiere ir?"* → "Es el resultado normal de hacerlo bien. Prefiero un equipo donde la gente crece y a veces se va, a uno donde nadie crece y todos se quedan; eso segundo se nota en la calidad enseguida."

📚 [Curso 09 · Técnica de entrevista](../../cursos/09-tecnica-de-entrevista/)

---

## P7. Estás en una guardia y hay un incidente grave. Como lead, ¿qué haces?

**Qué evalúan:** comportamiento bajo presión y si sabes que tu rol cambia durante un incidente.

**❌ Lo que NO debes decir**

> "Me pongo a depurar yo, que soy quien mejor conoce el sistema, y voy avisando por el chat según vaya avanzando."

**Por qué está mal:** te conviertes en investigador y comunicador a la vez, y ambas cosas se degradan: pierdes el hilo técnico cada vez que respondes a un directivo, y la comunicación externa se queda a medias. Además nadie coordina, así que puede haber dos personas tocando lo mismo o cambios simultáneos que impidan saber qué funcionó.

**⚠️ Respuesta aceptable**

> "Coordino: reparto quién investiga qué, mantengo informados a los interesados y evito que se hagan cambios sin control."

**Qué le falta:** la prioridad de mitigar sobre entender, y el cuidado de las personas durante y después.

**✅ Respuesta ideal**

> "Asumo el rol de coordinador y me quito de teclear, aunque sea lo que más me apetezca. Lo primero es acotar el impacto y decidir la mitigación más rápida disponible —revertir, apagar con un flag, degradar—, porque mitigar y diagnosticar son cosas distintas y en ese orden. Reparto: una persona investigando por hipótesis, otra preparando el rollback, y yo comunicando hacia fuera con actualizaciones periódicas aunque no haya novedades, porque el silencio genera más ruido que las malas noticias. Impongo una regla simple: un cambio a la vez y anunciado, para que sepamos qué funcionó. Cuido que se capture evidencia antes de limpiar y que quien lleva horas se releve. Y cuando pasa, dos cosas: postmortem sin culpables, centrado en qué barrera faltaba, y una conversación con la persona que estaba a los mandos, porque quien hizo el cambio que lo desencadenó suele pasarlo mal y necesita oír de mí que el fallo fue del sistema que lo permitió, no suyo."

**Por qué funciona:** cambia de rol conscientemente, prioriza la mitigación, ordena el trabajo, comunica y cierra cuidando a las personas.

**🔁 Repregunta probable:** *"¿Y si el que investiga se equivoca de camino?"* → "Le doy un tiempo acotado y pregunto qué descartaría cada hipótesis; si a los 15 minutos no avanza, cambiamos de enfoque sin que sea un juicio sobre él."

📚 [Curso 08 · Guion de incidentes](../../cursos/08-system-design/05-guion-de-incidentes.md) · [Curso 06 · Respuesta a incidentes](../../cursos/06-seguridad/04-respuesta-a-incidentes.md)

---

## Rúbrica rápida

| Dimensión | Qué mirar |
|---|---|
| **Rol** | ¿Respondí como líder o como el mejor programador del equipo? |
| **Datos** | ¿Usé números para negociar y priorizar? |
| **Personas** | ¿Hablé de mis compañeros con respeto y sin etiquetas? |
| **Mi parte** | ¿Asumí qué cambiaría yo, no solo los demás? |
| **Negocio** | ¿Traduje lo técnico a impacto y riesgo? |
