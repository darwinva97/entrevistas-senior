# 📊 Entrevista funcional · Las mismas preguntas, evaluadas por nivel

> La entrevista funcional (o de comportamiento) no cambia mucho de preguntas entre un junior y un staff. **Lo que cambia es el listón.** Aquí verás la misma pregunta con lo que se espera en cada nivel, para que calibres tu respuesta al puesto al que aspiras.

## Cómo se calibra cada nivel

| Nivel | Alcance esperado en tus respuestas |
|---|---|
| **Junior** | Tú y tu tarea: aprendes, preguntas, entregas |
| **Semi-senior** | Tú y tu equipo: resuelves solo, ayudas, anticipas problemas |
| **Senior** | Tu equipo y el producto: decides con trade-offs y asumes consecuencias |
| **Staff / Lead** | Varios equipos y la organización: influyes sin autoridad, cambias sistemas |

Regla general: **si tus historias solo hablan de código, estás respondiendo un nivel por debajo del que crees.**

---

## P1. Háblame de ti

**Qué evalúan:** si sabes priorizar información y conectar con el puesto. Es la pregunta más subestimada de todas.

**❌ Lo que NO debes decir**

> "Nací en… estudié… mi primer trabajo fue… luego estuve tres años en… después me cambié a… y ahora estoy en…"

**Por qué está mal:** es un recorrido cronológico completo que dura cinco minutos, obliga al entrevistador a filtrar por ti y no dice nada de por qué encajas. Empezar por la carrera universitaria cuando llevas ocho años trabajando indica que no sabes qué es relevante.

**⚠️ Respuesta aceptable**

> "Soy desarrollador con seis años de experiencia, sobre todo en backend con Java y Spring. Ahora estoy en una empresa de logística trabajando en microservicios, y busco un reto donde pueda seguir creciendo."

**Qué le falta:** el gancho. Es correcta y olvidable: no hay ni un logro concreto ni una conexión con *esta* vacante.

**✅ Respuesta ideal — según el nivel**

*Semi-senior:*
> "Backend con cuatro años, sobre todo Node y Postgres. Lo que mejor sé hacer es coger una funcionalidad ambigua y llevarla end-to-end: en mi equipo actual me encargué del módulo de facturación, desde el diseño de la API hasta el monitoreo. Vengo aquí porque vuestro producto tiene un volumen que yo aún no he tocado y quiero justamente eso."

*Senior:*
> "Llevo ocho años en backend, los últimos cuatro en sistemas distribuidos con bastante tráfico. Mi punto fuerte es la fiabilidad: en mi empresa actual lideré el rediseño del flujo de pagos, que pasó de tener dos incidentes al mes a ninguno en el último semestre, y de paso bajamos la latencia p99 a la mitad. Me interesa esta vacante porque estáis en la fase de escalar la plataforma y ese es exactamente el problema que más me gusta."

*Staff / Lead:*
> "Ocho años como ingeniero y tres liderando técnicamente equipos de entre cinco y ocho personas. Lo que aporto es criterio de arquitectura y capacidad de que las decisiones se ejecuten: mi último proyecto fue migrar el núcleo de pedidos sin downtime, coordinando a tres equipos, y el impacto medible fue reducir el tiempo de entrega de un cambio de tres semanas a dos días. Me atrae este puesto porque implica esa mezcla, no solo diseñar sino acompañar la ejecución."

**Por qué funciona:** 60–90 segundos, un logro con número, y un cierre que conecta con la vacante. Además el alcance del ejemplo sube con el nivel, que es exactamente lo que se está calibrando.

**🔁 Repregunta probable:** *"¿Por qué te quieres ir de tu empresa actual?"* → Hacia dónde vas, nunca de qué huyes: "he aprendido mucho ahí, y ahora busco un problema de escala/producto/liderazgo que allí no existe".

📚 [Curso 09 · Comportamiento y cierre](../../cursos/09-tecnica-de-entrevista/03-comportamiento-y-cierre.md)

---

## P2. Cuéntame un error que hayas cometido

**Qué evalúan:** autocrítica real y capacidad de aprender. Y, con nivel, cuánto asumes.

**❌ Lo que NO debes decir**

> "Mi mayor defecto es que soy demasiado perfeccionista y me involucro demasiado en los proyectos."

**Por qué está mal:** es la respuesta de manual, y todos los entrevistadores la han oído cientos de veces. Transmite que no quieres exponerte, y a partir de ahí interpretan tus otras respuestas con más escepticismo. Un error que en realidad es una virtud disfrazada es peor que no responder.

**⚠️ Respuesta aceptable**

> "Una vez subí a producción un cambio sin probarlo bien y rompí una funcionalidad. Aprendí a probar mejor antes de desplegar."

**Qué le falta:** impacto, qué hiciste en el momento y qué cambió de forma duradera. Tal como está, el aprendizaje es un tópico.

**✅ Respuesta ideal — según el nivel**

*Junior / semi-senior:*
> "Desplegué un cambio en el servicio de notificaciones sin comprobar el efecto sobre las plantillas antiguas, y unos 500 correos salieron con el nombre mal. Lo vi por los tickets de soporte, avisé enseguida, revertimos en 20 minutos y redactamos la disculpa con soporte. Lo que cambié: escribí una prueba que cubre las plantillas antiguas, y desde entonces mi rutina antes de desplegar incluye preguntarme explícitamente a qué usuarios *existentes* afecta el cambio, no solo si funciona lo nuevo."

*Senior:*
> "Decidí introducir una caché para bajar la latencia sin diseñar bien la invalidación. Bajó la latencia, sí, pero durante dos semanas algunos usuarios vieron precios desactualizados, y lo peor es que tardamos en detectarlo porque no teníamos ninguna métrica de frescura. Lo asumí en el postmortem: fue mi decisión y me la salté sin revisión de diseño porque parecía sencillo. Lo arreglamos con invalidación por evento y una métrica de antigüedad del dato con alerta. Lo que cambió en mí es que ahora, cuando introduzco algo que 'parece sencillo', me obligo a escribir cómo lo voy a detectar cuando falle antes de implementarlo."

*Staff / Lead:*
> "Empujé una migración a una arquitectura de eventos que el equipo no estaba preparado para operar. Técnicamente defendible, organizativamente un error: tardamos meses en estabilizarla y dos entregas importantes se retrasaron. Reconocerlo delante del equipo fue incómodo, pero necesario, y revertimos parcialmente. Lo que aprendí no fue sobre la tecnología: fue que una decisión de arquitectura sin la capacidad del equipo para sostenerla es una decisión mala, por buena que sea sobre el papel. Desde entonces, cualquier pieza nueva de infraestructura tiene que pasar dos filtros: qué número mejora y quién la va a operar a las 3 de la mañana."

**Por qué funciona:** impacto real, tu papel sin diluir, corrección concreta y un cambio de criterio duradero. Fíjate en cómo el error crece en alcance con el nivel: eso es lo que se evalúa.

**🔁 Repregunta probable:** *"¿Y cómo reaccionó tu equipo?"* → Cuenta la conversación real, sin heroísmos. Reconocer un error delante del equipo es lo que da credibilidad al resto.

📚 [Curso 09 · Comportamiento y cierre](../../cursos/09-tecnica-de-entrevista/03-comportamiento-y-cierre.md)

---

## P3. Cuéntame un desacuerdo técnico que hayas tenido

**Qué evalúan:** cómo discutes: con argumentos o con ego. Y si sabes ceder.

**❌ Lo que NO debes decir**

> "Un compañero se empeñaba en usar una tecnología que claramente no servía. Al final el tiempo me dio la razón y tuvimos que rehacerlo como yo decía."

**Por qué está mal:** te presentas como ganador de una guerra, no como alguien que colabora. "Claramente" descarta el punto de vista del otro sin argumentarlo, y "el tiempo me dio la razón" suena a rencor. El entrevistador se pregunta cómo será trabajar contigo cuando no estés de acuerdo *con él*.

**⚠️ Respuesta aceptable**

> "Discutimos sobre si usar una base de datos relacional o NoSQL. Expusimos los pros y contras, lo hablamos con el equipo y al final elegimos la relacional, que era mi propuesta."

**Qué le falta:** cómo se resolvió el desacuerdo (el proceso, no el resultado) y qué aprendiste del otro.

**✅ Respuesta ideal — según el nivel**

*Semi-senior:*
> "Yo quería introducir un ORM y un compañero prefería SQL a mano. Estábamos discutiendo en abstracto, así que propuse algo concreto: implementamos el mismo caso de las dos formas en un par de horas y lo miramos con el equipo. Vimos que sus dudas sobre las consultas complejas eran reales, y acabamos con un enfoque mixto: ORM para lo simple, SQL para los informes. Lo que me llevé es que discutir con código sobre la mesa dura veinte minutos y discutir con opiniones dura semanas."

*Senior:*
> "Un arquitecto quería que introdujéramos un service mesh y yo pensaba que el coste operativo no compensaba para nuestro tamaño. En vez de debatirlo por principios, acordamos qué problema queríamos resolver —mTLS y observabilidad uniforme— y qué alternativas lo cubrían. Salió que el 80% lo resolvíamos con librerías compartidas y un proxy sencillo. Él tenía razón en el problema y yo en el coste, y la decisión final fue posponer el mesh con un disparador acordado: si superábamos cierto número de servicios, se retomaba. Trabajar contra un criterio común, y no contra la otra persona, es lo que desbloqueó eso."

*Staff / Lead:*
> "Dirección quería una reescritura completa de un sistema y yo estaba en contra. Mi error inicial fue argumentar solo con riesgos técnicos, que a ellos no les movía nada. Cambié de estrategia: llevé datos —dónde estaba el tiempo de entrega realmente, cuántos incidentes venían de qué módulo— y propuse una alternativa incremental con hitos visibles cada seis semanas. Se aprobó eso. Y me guardé una lección: cuando alguien pide una reescritura, casi nunca está pidiendo tecnología nueva, está pidiendo dejar de sentir dolor; si le das una forma creíble de que el dolor baje pronto, la conversación cambia."

**Por qué funciona:** hay proceso, reconocimiento del punto válido del otro, y una lección transferible. El resultado importa menos que cómo se llegó.

**🔁 Repregunta probable:** *"¿Y alguna vez cediste en algo en lo que seguías pensando que tenías razón?"* → Ten preparada esta: ceder con elegancia y comprometerte de verdad con la decisión ajena es una señal muy fuerte de madurez.

📚 [Curso 09 · Cómo comunicar](../../cursos/09-tecnica-de-entrevista/01-como-comunicar.md)

---

## P4. ¿Cómo priorizas cuando tienes más trabajo del que cabe?

**Qué evalúan:** criterio y comunicación. Y, según el nivel, si priorizas tus tareas o las del equipo.

**❌ Lo que NO debes decir**

> "Trabajo más horas si hace falta; siempre saco todo adelante."

**Por qué está mal:** no es priorizar, es no priorizar. Además señala que aceptas cualquier carga sin negociar, lo que garantiza que se te asigne más de lo que cabe indefinidamente, y termina en trabajo de mala calidad o en abandono.

**⚠️ Respuesta aceptable**

> "Priorizo por urgencia e importancia, hablo con mi responsable si hay conflicto y avisa cuanto antes si algo no va a llegar."

**Qué le falta:** el criterio concreto —¿qué hace algo importante?— y qué haces con lo que se queda fuera.

**✅ Respuesta ideal — según el nivel**

*Junior / semi-senior:*
> "Ordeno por impacto en el usuario y por si bloqueo a alguien: lo que tiene a otra persona esperando va primero, aunque sea pequeño. Luego lo que tiene fecha externa real. Y avisa pronto: si veo el jueves que el viernes no llega, lo digo el jueves, no el viernes por la tarde. Lo que no cabe lo dejo explícito en el tablero para que no se pierda y para que quien prioriza lo vea."

*Senior:*
> "Con dos preguntas: qué pasa si no lo hacemos, y qué se rompe si lo hacemos mal. Eso separa lo urgente de lo ruidoso. Priorizo lo que desbloquea a otros y lo que reduce riesgo antes que lo que suma funcionalidad, y negocio el alcance en vez del plazo cuando puedo, porque recortar alcance es reversible y recortar calidad no. Lo que no cabe lo digo de forma explícita y con consecuencias: 'esto se puede posponer y el coste es X'; dejar cosas en un limbo silencioso es lo que rompe la confianza."

*Staff / Lead:*
> "A mi nivel priorizar es sobre todo decidir qué *no* hacemos, y eso hay que hacerlo con quien tiene el contexto de negocio, no en soledad. Uso impacto contra esfuerzo pero añado un tercer eje: reversibilidad, porque lo caro de deshacer merece más análisis. Y protejo capacidad de forma estable para fiabilidad y para el crecimiento del equipo, porque si eso compite sprint a sprint con features, siempre pierde. Cuando hay que decir que no, doy alternativas y el coste de cada una; un 'no' sin opciones es una pelea, un 'no, pero' es una negociación."

**Por qué funciona:** criterio explícito, comunicación proactiva y —en los niveles altos— la idea de proteger capacidad y decidir qué no se hace.

**🔁 Repregunta probable:** *"¿Y si tu jefe te dice que todo es prioritario?"* → "Le pido que elija el orden con las consecuencias sobre la mesa: 'si hacemos A primero, B se va dos semanas; ¿te parece?'. Casi siempre eso desbloquea, porque nadie quiere decidir en abstracto pero sí entre dos opciones concretas."

📚 [Curso 09 · Comportamiento y cierre](../../cursos/09-tecnica-de-entrevista/03-comportamiento-y-cierre.md)

---

## P5. ¿Qué haces cuando no sabes algo?

**Qué evalúan:** autonomía y honestidad. Parece inocente y discrimina muchísimo.

**❌ Lo que NO debes decir**

> "Busco en Google o le pregunto a la IA y lo resuelvo; la verdad es que casi nunca me quedo atascado."

**Por qué está mal:** la última frase es la que hace daño: sugiere que no distingues entre resolver y entender, y que copias soluciones sin criterio. Además, en un puesto senior, "casi nunca me atasco" significa que no estás trabajando en problemas difíciles.

**⚠️ Respuesta aceptable**

> "Investigo por mi cuenta: documentación, código fuente, y si en un rato no avanzo, pregunto a alguien del equipo para no perder el día."

**Qué le falta:** el criterio de cuándo parar y qué haces para que no vuelva a pasar.

**✅ Respuesta ideal**

> "Me doy un tiempo acotado para investigar solo —una hora, dos como mucho, según la urgencia— porque el atasco silencioso de tres días es el peor resultado posible para todos. En ese rato voy a la fuente: documentación oficial y, si hace falta, el código de la librería, que suele responder más rápido que buscar por ahí. Cuando pregunto, llego con trabajo hecho: qué quiero conseguir, qué probé, qué esperaba y qué pasó; eso convierte una interrupción de media hora en una de cinco minutos. Y si es algo que voy a necesitar otra vez o que le pasará a otro, lo dejo escrito. En entrevistas y en el trabajo aplico la misma regla: prefiero decir 'no lo sé, esto es lo que haría para averiguarlo' que inventar, porque inventar se detecta y cuesta la credibilidad de todo lo demás."

**Por qué funciona:** tiempo acotado, ir a la fuente, preguntar con contexto, documentar y honestidad explícita.

**🔁 Repregunta probable:** *"¿Y si nadie del equipo lo sabe tampoco?"* → "Entonces lo acoto y lo pruebo: un experimento pequeño con una hipótesis clara. Y si sigue sin salir, lo hago visible pronto como riesgo, en vez de quemarme una semana en silencio."

📚 [Curso 09 · Cómo comunicar](../../cursos/09-tecnica-de-entrevista/01-como-comunicar.md)

---

## P6. ¿Dónde te ves en tres años?

**Qué evalúan:** si tu trayectoria encaja con lo que la empresa puede ofrecer. No hay respuesta correcta, hay respuestas coherentes.

**❌ Lo que NO debes decir**

> "Sinceramente, me gustaría montar mi propia empresa." *(o)* "En tu puesto." *(o)* "No lo sé, no pienso tanto a futuro."

**Por qué está mal:** la primera anuncia que te vas; la segunda es una broma que casi nunca cae bien; la tercera transmite falta de dirección justo cuando te evalúan para un rol con autonomía. Puedes tener cualquiera de esas metas: el problema es enunciarlas sin conectar con lo que aportarías mientras tanto.

**⚠️ Respuesta aceptable**

> "Me gustaría seguir creciendo técnicamente y llegar a un rol senior o de liderazgo, dependiendo de cómo evolucione."

**Qué le falta:** especificidad y conexión con la empresa. Es una respuesta que sirve para cualquier vacante, y por eso no aporta nada.

**✅ Respuesta ideal**

> "Me veo con más alcance del que tengo hoy: quiero pasar de ser responsable de mi área a que las decisiones que tomo afecten a varios equipos, ya sea por la vía técnica o liderando. Lo que tengo claro es la dirección: sistemas de mucho tráfico y decisiones de fiabilidad, porque es donde más disfruto y donde tengo la mayor parte de mis cicatrices. Por eso me interesa especialmente vuestro contexto, que va justo por ahí. Y te lo pregunto también en el otro sentido: ¿cómo es aquí el recorrido de alguien que entra en este puesto? Prefiero saberlo ahora, porque si el camino que ofrecéis es solo de gestión y yo quiero profundidad técnica, es mejor descubrirlo hoy que en un año."

**Por qué funciona:** da dirección sin cerrarse, la conecta con la empresa, y devuelve la pregunta, que demuestra que estás evaluando tú también.

**🔁 Repregunta probable:** *"¿Y si no hay posibilidad de promoción a corto plazo?"* → "Depende de si hay crecimiento real de alcance aunque el título no cambie; el título me importa menos que el problema. Pero si en dos años el trabajo va a ser el mismo, sí sería un factor."

📚 [Curso 09 · Comportamiento y cierre](../../cursos/09-tecnica-de-entrevista/03-comportamiento-y-cierre.md)

---

## Checklist antes de una entrevista funcional

- [ ] Tengo **seis historias** en formato STAR, con número de impacto y mi papel claro.
- [ ] Cada historia tiene versión de **30 segundos** y de **2 minutos**.
- [ ] Mi "háblame de ti" dura **90 segundos** y termina conectando con esta vacante.
- [ ] Tengo preparada una historia de **fracaso** que asume responsabilidad de verdad.
- [ ] Tengo una historia de **desacuerdo** donde cedí, no solo donde gané.
- [ ] Sé **por qué esta empresa**, con algo concreto de su producto o su ingeniería.
- [ ] Tengo **cinco preguntas** para ellos, y al menos una incómoda (guardias, rotación, deuda).
- [ ] No voy a hablar mal de nadie, pase lo que pase.
