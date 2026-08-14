# 🏛️ Entrevista técnica · Arquitecto de software

> Simulacro por niveles (senior → principal). Lee **solo la pregunta**, responde en voz alta y cronometrada. Formato explicado en [cómo funcionan los simulacros](../README.md).

En arquitectura te evalúan una sola cosa por debajo de todas las preguntas: **si decides con criterio explícito o con preferencias**. La respuesta correcta casi nunca es una tecnología; es un razonamiento con restricciones, coste y una forma de comprobar si te equivocaste.

## Qué evalúan en cada nivel

| Nivel | Lo que buscan | Lo que te descarta |
|---|---|---|
| **Arquitecto (senior)** | Trade-offs con datos, diseño que sobrevive al cambio | Recomendar la arquitectura de moda |
| **Arquitecto principal / staff** | Estrategia técnica, migraciones, gobierno sin burocracia | Torre de marfil: decidir sin construir ni escuchar |

## Guion típico (75–90 minutos)

```
10 min · tu trayectoria y una decisión de la que te arrepientes
30 min · diseño de un sistema con restricciones cambiantes
20 min · migración o modernización de algo existente
15 min · gobierno técnico, estándares y cómo trabajas con equipos
 5 min · tus preguntas
```

---

## P1. ¿Cuándo microservicios y cuándo un monolito?

**Qué evalúan:** si tienes criterio o dogma. Es la pregunta de calentamiento y ya define la mitad de tu nota.

**❌ Lo que NO debes decir**

> "Microservicios, porque escalan mejor, permiten usar la tecnología adecuada para cada problema y evitan el monolito, que siempre se convierte en un desastre."

**Por qué está mal:** tres eslóganes seguidos. "Escalan mejor" ignora que la escalabilidad casi siempre se limita en la base de datos, no en el proceso; "cada tecnología para cada problema" es un coste operativo que se paga durante años; y llamar desastre al monolito confunde una arquitectura con la falta de disciplina. Además, propone la opción con más complejidad operativa sin ninguna restricción sobre la mesa.

**⚠️ Respuesta aceptable**

> "Depende del tamaño del equipo y del dominio. Con un equipo pequeño empezaría con un monolito bien modularizado y extraería servicios cuando haga falta escalar partes concretas o cuando los equipos se bloqueen."

**Qué le falta:** los criterios medibles y los costes concretos que se asumen al separar.

**✅ Respuesta ideal**

> "Lo trato como una decisión organizativa con consecuencias técnicas, no al revés. Separo un servicio cuando hay una razón concreta: dos equipos se bloquean en el mismo ciclo de release, una parte tiene un perfil de escalado radicalmente distinto, o hay una frontera de cumplimiento o de datos que justifica aislarla. Si la razón es 'para escalar' pido el número: en la mayoría de sistemas el límite está en la base de datos, y partir el proceso sin partir los datos no cambia nada. El coste que asumo al separar es explícito: llamadas de red que fallan, consistencia eventual, despliegues coordinados si el contrato no está bien pensado, y una infraestructura que alguien tiene que operar a las 3 de la mañana. Por eso mi punto de partida por defecto es un monolito modular con fronteras internas de verdad —módulos con dueño, sin acceso cruzado a las tablas de otro— porque eso me deja extraer un servicio cuando aparezca la razón, y me ahorra pagar la complejidad antes de necesitarla."

**Por qué funciona:** criterio explícito, pide datos, enumera costes concretos y da una estrategia que mantiene abiertas las dos puertas.

**🔁 Repregunta probable:** *"¿Y si la dirección ya decidió microservicios?"* → "Entonces defino primero las fronteras por dominio y la propiedad de los datos, porque el error caro no es tener microservicios, es tener un monolito distribuido donde varios servicios escriben las mismas tablas."

📚 [Curso 08 · Catálogo de patrones](../../cursos/08-system-design/03-catalogo-de-patrones.md) · [Banco: migración de monolito](../../casos-de-estudio/01-system-design.md)

---

## P2. Diseña la integración entre un ERP heredado y una nueva plataforma de comercio.

**Qué evalúan:** integración con sistemas que no controlas, que es el 80% del trabajo real de arquitectura.

**❌ Lo que NO debes decir**

> "Conecto la plataforma directamente a la base de datos del ERP para leer stock y precios, así evitamos intermediarios."

**Por qué está mal:** acoplarte al esquema interno de un sistema que no controlas es la peor decisión posible: cualquier actualización del ERP te rompe, no hay contrato, no hay control de acceso y probablemente estés poniendo carga transaccional sobre una base de datos que no está dimensionada para tu tráfico. Es rápido de montar y carísimo de mantener.

**⚠️ Respuesta aceptable**

> "Pondría una capa de integración con una API propia delante del ERP, y sincronizaría datos con procesos programados o eventos, con reintentos y monitorización."

**Qué le falta:** la dirección del flujo por dato, la tolerancia de desfase acordada con negocio y qué pasa cuando el ERP está caído o lento.

**✅ Respuesta ideal**

> "Primero acuerdo con negocio la pregunta que decide el diseño: cuánto puede envejecer cada dato. El precio y el stock no toleran lo mismo que la ficha del producto. Después decido dirección y dueño por dato: el ERP es dueño del stock y del precio, la plataforma es dueña del pedido y del cliente, y nadie escribe en el terreno del otro. Entre medias pongo una capa anticorrupción: un servicio de integración que traduce el modelo del ERP al mío, para que su vocabulario y sus cambios no se filtren a todo mi sistema. El transporte lo elijo por lo que soporte el ERP: si publica eventos o puedo leer su log de cambios, mejor; si solo tiene una API o ficheros, un proceso de sincronización con marca de agua y reproceso. Asumo dos cosas y las diseño: que el ERP se va a caer y a ir lento —así que caché con TTL, degradación explícita, y nunca en el camino crítico del checkout si puedo evitarlo—, y que va a haber discrepancias, así que conciliación periódica y un panel donde se vean. Y si el ERP no aguanta mi tráfico, hago réplica de lectura de lo que necesito, con su desfase documentado."

**Por qué funciona:** empieza por el requisito de negocio, define propiedad de datos, nombra el patrón anticorrupción y diseña para el fallo del sistema ajeno.

**🔁 Repregunta probable:** *"El ERP tarda 4 segundos en responder el stock. ¿Qué haces?"* → "No lo llamo en tiempo real durante la navegación: sirvo stock cacheado con su antigüedad visible, y valido contra el ERP solo en el momento de confirmar el pedido, con timeout y un comportamiento definido si no responde."

📚 [Curso 00 · Resiliencia](../../cursos/00-fundamentos-distribuidos/04-resiliencia.md) · [Curso 07 · Diseño de contratos](../../cursos/07-apis-y-versionado/01-diseno-de-contratos.md)

---

## P3. ¿Cómo justificas una decisión de arquitectura ante negocio?

**Qué evalúan:** si sabes traducir. Un arquitecto que solo convence a ingenieros no es un arquitecto.

**❌ Lo que NO debes decir**

> "Les explico los beneficios técnicos: desacoplamiento, escalabilidad, mantenibilidad. Si no lo entienden, es porque no son técnicos."

**Por qué está mal:** culpa al receptor. Esas tres palabras no significan nada para quien decide el presupuesto, y la última frase revela una actitud que en un rol de influencia es descalificante: tu trabajo *es* que se entienda.

**⚠️ Respuesta aceptable**

> "Lo traduzco a impacto de negocio: tiempo de entrega, riesgo de caída, coste. Y presento opciones con sus ventajas e inconvenientes para que decidan con información."

**Qué le falta:** el formato concreto y el registro de la decisión, que es lo que la hace sostenible.

**✅ Respuesta ideal**

> "Presento tres cosas: opciones, consecuencias y una recomendación. Nunca una sola opción, porque eso no es una decisión, es un anuncio; y nunca tres sin recomendación, porque entonces les traslado a ellos un trabajo que es mío. Las consecuencias van en su idioma: tiempo hasta tener valor en producción, riesgo —'si esto falla, el checkout se cae y son X pedidos por hora'—, coste de infraestructura y de personas, y qué puertas cierra. Ese último punto es el que más valoran cuando lo entienden: una decisión reversible se toma rápido y una irreversible merece dos semanas de análisis. Y lo dejo escrito en un ADR de una página con el contexto, las alternativas y la decisión, porque dentro de dos años alguien va a preguntar por qué está esto así, y la respuesta 'no sabemos' es la que genera reescrituras innecesarias. Cuando puedo, además, propongo un experimento acotado en vez de una apuesta: dos semanas de prototipo dan más información que dos semanas de reuniones."

**Por qué funciona:** formato concreto, traducción a riesgo y dinero, reversibilidad como criterio, ADR y experimento. Es la respuesta de alguien que ha tenido que convencer de verdad.

**🔁 Repregunta probable:** *"¿Y cuándo negocio decide lo contrario de lo que recomiendas?"* → "Lo registro con el riesgo que asumimos y hago que la decisión sea revisable con un disparador: 'si en tres meses pasa esto, lo revisamos'. Y después lo apoyo de verdad, porque una decisión ejecutada a medias por resentimiento es peor que cualquiera de las dos opciones."

📚 [Curso 09 · Comportamiento y cierre](../../cursos/09-tecnica-de-entrevista/03-comportamiento-y-cierre.md)

---

## P4. La empresa quiere reescribir el sistema desde cero. ¿Qué dices?

**Qué evalúan:** madurez. Es una trampa clásica y muy discriminante.

**❌ Lo que NO debes decir**

> "Perfecto, con las tecnologías actuales lo hacemos mucho mejor y más rápido; en seis meses tenemos la versión nueva."

**Por qué está mal:** las reescrituras completas son el fracaso más documentado de la industria, y la estimación de seis meses ignora que el sistema viejo contiene años de reglas de negocio no escritas —casos borde, integraciones, parches por incidentes— que nadie recuerda hasta que faltan. Además, durante la reescritura hay que mantener los dos, y el negocio no deja de pedir cambios.

**⚠️ Respuesta aceptable**

> "Recomendaría una migración incremental con el patrón strangler fig, en lugar de una reescritura de golpe, para ir moviendo funcionalidad y reducir el riesgo."

**Qué le falta:** entender *por qué* piden la reescritura, que casi nunca es lo que dicen.

**✅ Respuesta ideal**

> "Primero pregunto qué problema quieren resolver, porque 'reescribir' es una solución, no un problema. Si lo que duele es que tardan tres meses en sacar una funcionalidad, o que hay incidentes cada semana, o que nadie entiende el código, cada una lleva a un plan distinto y ninguna requiere necesariamente empezar de cero. Lo que sé seguro es que el sistema viejo tiene años de reglas de negocio que no están escritas en ningún sitio, y que se descubren en producción cuando faltan. Así que planteo migración incremental: identifico las fronteras, pongo una capa que enruta, y muevo un dominio cada vez, empezando por uno con valor real pero riesgo acotado. Comparo en la sombra los resultados de lo viejo y lo nuevo antes de cambiar el tráfico, porque eso me da evidencia en vez de fe. Y soy explícito con el coste: durante la migración se mantienen dos sistemas, y eso hay que presupuestarlo. Si aun así deciden reescribir, mi condición mínima es que se haga por fases con el sistema viejo en producción y sin fecha de apagado hasta que la nueva demuestre paridad medida, no percibida."

**Por qué funciona:** cuestiona la premisa, nombra el riesgo real (reglas no escritas), da el mecanismo (comparación en la sombra) y pone una condición mínima si le llevan la contraria.

**🔁 Repregunta probable:** *"¿Y si la tecnología vieja ya no tiene soporte ni gente que la sepa?"* → "Eso sí cambia el cálculo, porque el riesgo pasa a ser de seguridad y de personal. Aun así, migro por fases: primero aislo lo que más riesgo tiene, no todo a la vez."

📚 [Curso 07 · Migraciones sin downtime](../../cursos/07-apis-y-versionado/04-migraciones-sin-downtime.md) · [Banco: monolito a microservicios](../../java-microservicios/03-casos-y-problemas.md)

---

## P5. ¿Cómo estableces estándares técnicos sin frenar a los equipos?

**Qué evalúan:** gobierno técnico. Aquí se ve si eres un facilitador o un obstáculo.

**❌ Lo que NO debes decir**

> "Creo un comité de arquitectura donde se revisan y aprueban todos los diseños antes de implementarlos."

**Por qué está mal:** un comité de aprobación previa es una cola: cuanto más crece la empresa, más se espera, y el resultado predecible es que los equipos aprendan a esquivarlo o a pedir perdón en vez de permiso. Además concentra el conocimiento en un grupo que no sufre las consecuencias de sus decisiones.

**⚠️ Respuesta aceptable**

> "Definiría guías y buenas prácticas documentadas, y participaría en las revisiones de diseño de los cambios importantes, sin bloquear el día a día."

**Qué le falta:** cómo consigues adopción real, que es el problema de verdad de cualquier estándar.

**✅ Respuesta ideal**

> "Con tres herramientas y ningún comité. La primera: hacer que lo correcto sea lo más fácil. Una plantilla de servicio que ya venga con observabilidad, seguridad, pipeline y despliegue reversible consigue más adopción que cualquier documento, porque el camino recomendado es también el camino cómodo. La segunda: automatizar lo que se pueda comprobar —lint, políticas en el clúster, escaneo de dependencias, detección de rupturas de contrato— para que el estándar lo aplique una máquina en el pull request y no una persona en una reunión. Y la tercera: escribir las decisiones como ADR con contexto, para que se puedan discutir y revisar con datos en vez de por autoridad. Yo participo en el diseño de lo que tiene riesgo alto o afecta a varios equipos, pero pronto, cuando todavía se puede cambiar, no como aprobador al final. Y algo que me parece clave: sigo escribiendo código, aunque sea poco, porque un estándar que su autor no sufre acaba siendo un impuesto que otros pagan."

**Por qué funciona:** convierte estándares en producto, automatiza en vez de vigilar y termina con una señal fuerte de credibilidad (seguir construyendo).

**🔁 Repregunta probable:** *"¿Y si un equipo quiere salirse del estándar?"* → "Pregunto por qué; a veces el estándar está mal o no cubre su caso, y eso es información. Si la razón es sólida, se documenta la excepción con su dueño; lo que no permito es que la excepción sea silenciosa."

📚 [Curso 09 · Cómo comunicar](../../cursos/09-tecnica-de-entrevista/01-como-comunicar.md)

---

## P6. Cuéntame una decisión de arquitectura tuya que salió mal.

**Qué evalúan:** honestidad y capacidad de aprender. Y es la pregunta donde más gente se protege y peor queda.

**❌ Lo que NO debes decir**

> "La verdad es que no se me ocurre ninguna; las decisiones que tomé funcionaron bien. Alguna vez hubo problemas por cosas que no dependían de mí."

**Por qué está mal:** o no has tomado decisiones importantes, o no has hecho seguimiento de sus consecuencias, o no eres honesto. Las tres lecturas son malas. Y la coletilla final sobre "cosas que no dependían de mí" confirma la peor.

**⚠️ Respuesta aceptable**

> "Una vez elegimos una tecnología que luego no encajó bien con el equipo y tuvimos que cambiarla. Aprendí a considerar más el contexto del equipo antes de decidir."

**Qué le falta:** concreción, impacto medido y qué cambiaste en tu forma de decidir, no solo en la conclusión.

**✅ Respuesta ideal**

> "Sí: introduje una arquitectura basada en eventos para un dominio que no la necesitaba. El argumento era desacoplar, y sobre el papel era correcto, pero el equipo eran cinco personas, el flujo era mayormente síncrono y nadie tenía experiencia operando un broker. Lo que pasó fue que la depuración se volvió lenta —seguir una operación entre cinco topics sin trazado maduro es un infierno— y aparecieron duplicados porque los primeros consumidores no eran idempotentes. Tardamos meses en estabilizarlo y varias funcionalidades salieron tarde. Lo revertimos parcialmente: mantuvimos eventos donde de verdad había desacoplamiento entre dominios y volvimos a llamadas síncronas donde el flujo era una transacción de negocio. Lo que cambió en mí no fue 'no usar eventos', fue que ahora exijo dos cosas antes de introducir una pieza de infraestructura nueva: una razón medible —qué número mejora— y una comprobación honesta de si el equipo puede operarla el día que falle a las 3 de la mañana. Y prefiero decisiones reversibles y probadas en un dominio antes de extenderlas."

**Por qué funciona:** es específico, admite el impacto real, cuenta la corrección y —lo más importante— explica qué cambió en su *criterio*, no solo en el resultado.

**🔁 Repregunta probable:** *"¿Cómo detectaste que iba mal?"* → "Tarde, y eso también fue un aprendizaje: ahora acompaño las decisiones grandes con un par de indicadores y una fecha de revisión explícita, para no depender de que alguien se atreva a decir que no funciona."

📚 [Curso 09 · Comportamiento y cierre](../../cursos/09-tecnica-de-entrevista/03-comportamiento-y-cierre.md)

---

## Rúbrica rápida

| Dimensión | Qué mirar |
|---|---|
| **Restricciones** | ¿Pregunté por requisitos y límites antes de diseñar? |
| **Coste explícito** | ¿Dije lo que se paga por cada decisión? |
| **Reversibilidad** | ¿Distinguí decisiones caras de revertir de las baratas? |
| **Evidencia** | ¿Propuse cómo comprobar si me equivoqué? |
| **Personas** | ¿Consideré al equipo que lo va a operar y mantener? |
