# Casos de estudio: Análisis de Nuevos Requerimientos (nivel senior)

Casos centrados en el trabajo real de un senior cuando le cae un requerimiento nuevo: aclarar lo que de verdad se pide, descomponerlo, estimarlo con honestidad, diseñar de forma incremental, negociar alcance y gestionar riesgo. Aquí el proceso importa más que la solución técnica: el entrevistador evalúa cómo piensas antes de escribir la primera línea de código.

---

## 1. "Necesitamos que los usuarios puedan pagar en cuotas"
**Categoría:** Descubrimiento / Pagos · **Tipo:** [CASO] Análisis de requerimiento

### 🎯 Enunciado
"El PO llega y te dice: 'Marketing cerró un acuerdo y necesitamos que los usuarios puedan pagar en cuotas. Es prioridad número uno del trimestre. ¿Cuánto te tomaría? El CEO ya lo anunció internamente.' No hay documento, no hay diseño, no hay más contexto. Tienes una reunión de 30 minutos con el PO mañana."

### 📝 Respuesta resumen
No estimo nada todavía: "pagar en cuotas" puede significar desde un botón que delega todo en un BNPL (buy now, pay later) del proveedor hasta construir un motor de crédito propio con riesgo, cobranza y contabilidad — hay dos órdenes de magnitud de diferencia entre ambos. Uso la reunión para descubrir el alcance real con preguntas que separan **quién asume el riesgo de crédito**, **quién ejecuta los cobros recurrentes** y **qué obligaciones legales/contables aparecen**. Propongo un discovery timeboxeado (3-5 días) que termine en opciones con coste y un MVP por fases donde la fase 1 casi seguro es "integrar un proveedor que ya hace esto", no construirlo.

### 📖 Respuesta detallada

**Preguntas de aclaración y por qué cada una importa:**
- **"¿Quién presta el dinero: nosotros o un tercero?"** Es LA pregunta. Si un proveedor BNPL (Mercado Pago Cuotas, Kueski, Addi, o cuotas de tarjeta vía el adquirente) asume el crédito, nosotros cobramos el total al contado y el proyecto es una integración. Si lo asumimos nosotros, entramos en scoring de riesgo, morosidad, cobranza, provisiones contables y probablemente regulación financiera — otro negocio, no una feature.
- **"¿Cuotas de tarjeta de crédito (las procesa el banco emisor) o plan de pagos nuestro con cargos recurrentes?"** Las cuotas de tarjeta son casi transparentes para nosotros: un parámetro `installments` en la pasarela. Un plan de pagos propio implica tokenizar la tarjeta, ejecutar cargos mensuales, manejar tarjetas que expiran o rebotan, dunning, y decidir qué pasa con el pedido ya entregado cuando la cuota 3 falla.
- **"¿Qué anunció exactamente el CEO y a quién?"** A veces lo anunciado es "habrá cuotas" (cualquier opción lo cumple) y a veces "cuotas sin intereses asumidas por nosotros" (la opción cara). Renegociar contra un anuncio público es distinto que contra uno interno.
- **"¿Qué acuerdo cerró Marketing?"** Si ya hay un proveedor firmado, medio problema resuelto y el otro medio también: mi trabajo es integrar ESE proveedor, y quiero ver su documentación y su sandbox antes de estimar.
- **"¿En qué países/monedas? ¿Qué porcentaje del ticket esperamos en cuotas?"** Regulación de crédito al consumo, tasas máximas legales y disclosure de intereses cambian por país. El volumen esperado decide cuánta robustez necesita la v1.
- **"¿Cómo se contabiliza?"** Pregunta para Finanzas, no para el PO, pero la levanto yo: ingreso reconocido al contado vs devengado por cuota, comisiones del proveedor, conciliación. Si no lo pregunto ahora, aparece en el cierre contable del primer mes como incidente.
- **"¿Qué pasa con reembolsos y devoluciones de una compra en cuotas?"** El flujo inverso (cancelar un plan a mitad, reembolsar 2 de 6 cuotas) suele costar tanto como el directo y nadie lo menciona en el pitch.

**Descomposición (una vez aclarado):** asumiendo el escenario más probable (proveedor externo asume el crédito): (1) integración con el proveedor (checkout, webhooks, sandbox); (2) modelo de pedido/pago (método nuevo, estados como `pending_approval` porque el BNPL puede rechazar al cliente); (3) UX de checkout (simulador de cuotas, elegibilidad); (4) reembolsos/cancelaciones vía API del proveedor; (5) conciliación y reporting para Finanzas; (6) soporte: qué ve atención al cliente cuando alguien pregunta por su plan.

**Diseño incremental con fases entregables:**
- **Fase 0 (3-5 días, timeboxeada):** discovery — reunión con Finanzas y Legal, evaluación de 2-3 proveedores (comisiones, cobertura, calidad de API), spike contra el sandbox del favorito. Entregable: una página con opciones, costes y recomendación. No es "parálisis por análisis": es lo que evita construir tres meses lo equivocado.
- **Fase 1 (MVP):** un solo proveedor, solo en el checkout web, solo para tickets dentro del rango que el proveedor acepta, sin reembolsos automatizados (proceso manual documentado para soporte, con volumen bajo es asumible). Feature flag por porcentaje de usuarios.
- **Fase 2:** reembolsos/cancelaciones automatizados, app móvil, simulador de cuotas en la página de producto (marketing lo va a pedir).
- **Fase 3 (solo si los datos lo justifican):** segundo proveedor con routing, u optimización de aprobación.

**Riesgos y mitigación:** dependencia del proveedor (capa de abstracción fina — una interfaz, no un framework); tasa de aprobación del BNPL menor a la esperada (medir el funnel de aprobación desde el día 1 y comunicar el rechazo con gracia en la UX); sorpresa contable (Finanzas en la fase 0, no en el go-live).

**Qué NO haría:** construir un motor de crédito propio "porque los proveedores cobran comisión" — la comisión es el precio de no estar en el negocio de cobranza; estimar en la primera reunión; empezar por una abstracción multi-proveedor "para el futuro".

**Estimación y cómo comunicarla:** después de la fase 0, en rangos y por fases: "Fase 1: 4-6 semanas con 2 personas, con la incertidumbre principal en la calidad del sandbox del proveedor; lo sabré con precisión tras el spike. Fase 2: 3-4 semanas más." Nunca un número único a la pregunta "¿cuánto tomaría?" del primer día; la respuesta correcta ese día es "te doy opciones con números en una semana, y eso incluye saber qué firmó Marketing".

**Qué espera oír el entrevistador:** que la primera reacción es descubrir quién asume el crédito, no diseñar tablas; la diferencia entre cuotas de tarjeta, BNPL de terceros y financiamiento propio; involucrar Finanzas/Legal temprano; discovery timeboxeado con entregable; MVP que delega el problema difícil en quien ya lo resolvió; reembolsos y conciliación como alcance de primera clase, no como sorpresa.

---

## 2. "Es solo añadir un campo al formulario"
**Categoría:** Análisis de impacto / Contratos · **Tipo:** [CASO] Análisis de requerimiento

### 🎯 Enunciado
"El PO te dice: 'Compliance necesita que capturemos el tipo de documento fiscal del cliente en el registro. Es añadir un campo más al formulario, un select con 4 opciones. Lo puse como story de 1 punto para este sprint.' Al mirar el código descubres que el dato de cliente lo escribe el servicio de onboarding, lo leen otros 3 microservicios a través de dos APIs versionadas con clientes externos, y el evento `CustomerUpdated` tiene 6 consumidores, dos de ellos de otros equipos."

### 📝 Respuesta resumen
El campo en el formulario es la punta del iceberg: el coste real está en propagar el dato por contratos que otros dependen de. Hago un **análisis de impacto sistemático** (esquema de BD, contratos de API, esquema del evento, consumidores, datos históricos sin el campo) antes de aceptar la estimación. La estrategia técnica es **expand-contract**: añadir el campo como opcional en todas las capas, poblar, y solo al final endurecer a obligatorio. Re-estimo (1 punto → probablemente 1-2 semanas incluyendo coordinación), aviso al PO con el mapa de impacto, y coordino con los equipos consumidores ANTES de tocar el esquema del evento.

### 📖 Respuesta detallada

**Preguntas de aclaración y por qué:**
- **"¿El campo es obligatorio para clientes nuevos, o también para los 2M existentes?"** Cambia el proyecto: si Compliance necesita el dato de TODOS, hay una campaña de backfill (¿se lo pedimos en el próximo login? ¿lo inferimos? ¿campaña de email?) que es más trabajo que todo lo demás junto.
- **"¿Desde cuándo lo exige Compliance y qué pasa si un cliente no lo tiene?"** Si hay fecha regulatoria dura, ordena las fases. Si un cliente sin el dato debe bloquearse, eso es lógica de negocio nueva en varios flujos, no un campo.
- **"¿Quién consume este dato y para qué?"** Se lo pregunto a Compliance directamente: a veces piden "capturarlo en el registro" pero lo que necesitan es un reporte mensual — y eso admite soluciones más baratas o distintos plazos por pieza.
- **"¿Las 4 opciones son estables o van a crecer por país?"** Decide si es un enum cerrado en el contrato o un código extensible. Los enums en eventos con 6 consumidores son minas: un valor nuevo rompe deserializadores estrictos.

**Análisis de impacto sistemático (el método, no la improvisación):** recorro las capas en orden: (1) UI + validación; (2) API del onboarding; (3) esquema de BD; (4) contratos de lectura — ¿añadir un campo de respuesta es breaking para algún cliente externo con parsers estrictos? Reviso la política de versionado publicada; (5) el evento `CustomerUpdated`: ¿schema registry con reglas de compatibilidad? ¿Los 6 consumidores toleran campos desconocidos?; (6) datos históricos: lo ya existente no tiene el campo — cada consumidor debe tolerar `null` para siempre o hasta el backfill; (7) analítica/warehouse, que siempre se olvida y siempre se rompe. Para los consumidores no me fío del registry: hablo con los dos equipos externos y hago grep de los internos.

**Estrategia técnica — expand-contract:**
- **Expand:** campo *opcional* (nullable) en BD, APIs y evento. Backward-compatible por construcción: nadie que no lo conozca se rompe. Deploy sin coordinación fina.
- **Migrate:** el formulario empieza a capturarlo; backfill de históricos si se decidió; los consumidores que lo necesitan se actualizan a su propio ritmo.
- **Contract:** solo cuando la cobertura del dato lo permite y Compliance lo exige, se vuelve obligatorio en la validación de escritura. Puede que en los contratos de lectura sea nullable para siempre — y está bien; endurecer contratos publicados rara vez paga el precio.

**Fases entregables:** Fase 1 (el sprint actual): campo en BD + formulario + API de escritura, opcional, con el dato fluyendo. Compliance ya ve datos entrando — valor real entregado. Fase 2: propagación al evento y APIs de lectura, coordinada con consumidores. Fase 3: backfill/obligatoriedad según decisión de negocio. Esto además le da al PO una historia honesta: "el 20% visible sale esta semana; el 80% invisible tiene dependencias de otros equipos con este plan".

**Riesgos y mitigación:** consumidor con deserialización estricta → verificar compatibilidad del schema registry y avisar antes de publicar; cliente externo con contract testing débil → release notes + campo documentado como opcional; el enum crece el mes siguiente → string/código validado en el borde, no enum cerrado en el contrato.

**Qué NO haría:** no publicaría el campo como requerido en el evento desde el día 1 (obliga a un big-bang de 6 consumidores); no haría una versión nueva de las APIs solo para esto (añadir campo opcional no lo amerita); no aceptaría el punto de story sin re-estimar, ni tampoco inflaría la parte visible — la transparencia del desglose es lo que me da credibilidad.

**Estimación y comunicación:** "El formulario es efectivamente 1 punto. La propagación completa son ~1-2 semanas de trabajo nuestro más coordinación con los equipos X e Y cuyo calendario no controlo. Te lo desgloso en 3 stories para que el burndown refleje la realidad." Al PO le muestro el diagrama de impacto de una página — es la herramienta de negociación más eficaz contra el "pero si es un campito".

**Qué espera oír el entrevistador:** instinto de iceberg (campo visible vs propagación invisible); un método de análisis de impacto por capas, recorrido en orden; expand-contract nombrado y aplicado; la pregunta por los datos históricos y el backfill; coordinación proactiva con consumidores antes de publicar; re-estimación comunicada con desglose, no con un "es más complejo de lo que crees".

---

## 3. Feature nueva sobre un monolito legacy sin tests
**Categoría:** Legacy / Estrategia técnica · **Tipo:** [CASO] Análisis de requerimiento

### 🎯 Enunciado
"'Hay que añadir cálculo de descuentos por volumen al módulo de facturación. El módulo tiene 9 años, 12.000 líneas en tres clases, cero tests, y el último que lo entendía se fue hace dos años. Negocio lo quiere en tres semanas. Ya lo intentamos tocar el año pasado y rompimos la facturación de un país durante dos días.' ¿Cómo lo abordas y qué le dices a negocio?"

### 📝 Respuesta resumen
El riesgo aquí no es escribir la feature, es tocar código que nadie entiende sin red de seguridad. Antes de la feature construyo la red: **characterization tests** que capturan el comportamiento actual (correcto o no) del cálculo de facturas con datos reales anonimizados, identifico o creo un **seam** donde enchufar el nuevo cálculo, y escribo el código nuevo FUERA del barro (clase/módulo nuevo, testeado, invocado desde un punto único). Doy una estimación honesta en dos partes: coste de la red de seguridad + coste de la feature, con la incertidumbre explícita, y presupuesto ~20-30% de refactor DENTRO de la estimación, no como proyecto aparte que nunca se aprobará.

### 📖 Respuesta detallada

**Preguntas de aclaración y por qué:**
- **"¿Descuentos por volumen exactamente cómo: por línea, por factura, por acumulado mensual del cliente?"** El acumulado mensual necesita estado histórico que quizá el módulo no tiene a mano; por línea es local y mucho más simple. La diferencia es semanas.
- **"¿Aplica retroactivamente o solo a facturas nuevas?"** Retroactivo = refacturación/notas de crédito = otro proyecto.
- **"¿Qué pasó exactamente el año pasado cuando se rompió?"** El postmortem (si existe) me dice dónde está el dragón: qué parte del módulo es más traicionera, qué señales faltaron, si el problema fue el código o el despliegue.
- **"¿Las tres semanas vienen de algo real (cierre de trimestre, contrato firmado) o es una fecha deseada?"** Determina cuánto margen de negociación existe y contra qué negocio comparo el riesgo.
- **"¿Existe entorno donde pueda re-ejecutar facturación con datos de producción anonimizados?"** Si no existe, crearlo es mi primera tarea, porque es la base de toda la red de seguridad.

**La estrategia técnica, en orden:**
1. **Characterization tests primero.** No tests "de lo que debería hacer" sino de **lo que hace**: 200-500 facturas reales representativas (por país, tipo de cliente, casos raros) pasan por el módulo actual y congelo las salidas como golden master. Cualquier cambio que altere una factura existente grita. Es la mejor inversión coste/riesgo del proyecto: 2-4 días que convierten "tocar el módulo es ruleta rusa" en "tocar el módulo es medible".
2. **Encontrar el seam.** Busco el punto donde el total de la factura se calcula y donde una nueva regla puede inyectarse con el mínimo de cirugía: idealmente un solo call site. Si no existe, lo creo con un refactor mínimo y mecánico (extract method) protegido por el golden master.
3. **La feature vive fuera del barro.** `VolumeDiscountCalculator` como código nuevo, con unit tests de verdad, sin dependencias del monolito más allá de sus inputs (líneas de factura, cliente, histórico). El monolito solo gana una llamada en el seam. Es un strangler a escala micro: no rescato el módulo, dejo de hacerlo crecer.
4. **Salida protegida:** feature flag por país/cliente + shadow mode si el riesgo lo amerita (calcular el descuento, loguearlo sin aplicarlo, comparar una semana contra expectativas de negocio antes de activar).

**Fases entregables:** Semana 1: harness de datos + golden master + seam identificado (entregable interno: "ya podemos tocar el módulo sin rezar", y una estimación ya precisa del resto). Semana 2-3: calculadora + integración + shadow mode en un país piloto. Semana 4: rollout gradual. Sí: son cuatro semanas, no tres — y lo digo en la semana 0, no en la 3.

**Riesgos y mitigación:** bugs actuales que los clientes ya asumen como contrato (el golden master los preserva a propósito — cambiarlos es decisión de negocio aparte); casos raros fuera de la muestra (muestra elegida por variedad estructural + shadow mode); que el dato necesario no exista (la pregunta 1 lo destapa antes).

**Qué NO haría:** no reescribiría el módulo ("ya que estamos") — el rewrite del módulo de facturación es un proyecto de trimestres disfrazado de buena intención; no tocaría el código sin el golden master aunque la presión apriete, porque el incidente del año pasado es exactamente el precio de esa prisa; no pediría "primero 2 meses de refactor y luego la feature" — esa propuesta muere en la primera reunión y con razón: el refactor se financia dentro de la feature y a su servicio.

**Estimación y cómo comunicarla:** "Son ~4 semanas: 1 de red de seguridad y 3 de feature con salida controlada. La alternativa de ir directo en 3 tiene una probabilidad material de repetir el incidente del año pasado, que costó 2 días de facturación de un país. La semana extra es el seguro, y de paso deja el módulo en un estado donde la SIGUIENTE feature costará menos." Nótese la forma: opciones con riesgo explícito en términos de negocio, no "el código está horrible".

**Qué espera oír el entrevistador:** characterization/golden master tests como primera inversión y saber que capturan el comportamiento real, bugs incluidos; el concepto de seam; código nuevo fuera del legacy con el monolito como cliente; refactor presupuestado dentro de la feature; estimación en dos partes con la incertidumbre delante; shadow mode/flag como gestión de riesgo; y la comparación del coste del seguro contra el coste del incidente.

---

## 4. "Para el viernes"
**Categoría:** Negociación / Deuda técnica · **Tipo:** [CASO] Análisis de requerimiento

### 🎯 Enunciado
"Martes por la mañana. El PO: 'Ventas cerró un cliente grande con la condición de que el viernes podamos exportar sus reportes en Excel con su formato corporativo. Sé que el módulo de reportes está en la lista de deuda técnica, pero es solo un export, ¿no?' Sabes que el módulo de reportes genera los datos con queries acopladas a la UI, que ya hay dos hacks encima de él, y que 'el formato corporativo' incluye logos, subtotales agrupados y celdas combinadas."

### 📝 Respuesta resumen
No respondo sí/no: construyo **opciones con coste y riesgo explícitos** y dejo que negocio elija con información. Opción A: hack consciente (tercer hack sobre el módulo) con fecha de caducidad escrita, ticket de pago de deuda creado y acordado ANTES de empezar. Opción B: versión reducida para el viernes (CSV/Excel plano con los datos correctos) y el formato corporativo completo la semana siguiente. Opción C: renegociar la fecha con el cliente. Mi recomendación suele ser B: descubrir qué necesita el cliente DE VERDAD el viernes — casi siempre es "ver sus datos", no las celdas combinadas. Todo comunicado en lenguaje de negocio: riesgo, coste futuro y compromiso, sin tecnicismos.

### 📖 Respuesta detallada

**Preguntas de aclaración y por qué:**
- **"¿Qué pasa exactamente el viernes?"** ¿Demo? ¿Go-live? ¿Cláusula contractual? Una demo tolera datos semi-reales y un formato al 80%; un contrato no. La mitad de los "para el viernes" son fechas internas con margen real.
- **"¿Quién definió 'su formato corporativo' y existe un ejemplo?"** Pido el Excel de muestra HOY. Sin el artefacto concreto, el alcance es infinito; con él, puedo separar lo esencial (columnas, agrupación) de lo cosmético (logos, celdas combinadas).
- **"¿El cliente vería aceptable una primera versión simplificada?"** Pregunta para que el PO se la haga a Ventas y Ventas al cliente. Sorprendentemente pocas veces alguien la ha hecho antes de comprometer la fecha.
- **"¿Es un export para este cliente o el inicio de 'exports personalizados por cliente'?"** Si Ventas lo va a vender a los próximos diez clientes, el hack de esta semana define la arquitectura por accidente. Necesito saberlo para decidir cuánta porquería es tolerable.

**Las opciones, con costes explícitos (lo que presento el martes al mediodía):**
- **Opción A — hack con fecha de caducidad:** export encima de las queries acopladas, código marcado, y dos condiciones no negociables por escrito (un mensaje en el hilo basta): (1) ticket de remediación creado ya, estimado y agendado en uno de los dos próximos sprints; (2) si aparece el segundo cliente pidiendo formato propio, se paga la deuda antes — no se apila el cuarto hack. Coste: viernes se llega; el módulo queda más frágil; riesgo medio de bugs el jueves por la noche. La fecha de caducidad y el ticket separan un hack profesional de la deuda silenciosa: la deuda consciente y registrada es una herramienta legítima.
- **Opción B — alcance reducido:** el viernes, Excel con los datos correctos, columnas y agrupación del cliente, sin celdas combinadas ni logo. Formato completo el miércoles siguiente. Coste: conversación de Ventas con el cliente; riesgo bajo; sin deuda nueva significativa.
- **Opción C — renegociar fecha:** completo y bien para el martes siguiente. Coste: político; a veces es la correcta y nadie la puso sobre la mesa porque nadie preguntó.

**Cómo lo comunico (la parte que más evalúa el entrevistador):** nada de "las queries están acopladas a la UI". Traducción a negocio: "Puedo llegar al viernes de dos maneras. La rápida deja el módulo de reportes más frágil — es el tercer parche, y cada parche encarece y arriesga el siguiente cambio; si la tomamos, reservamos X días en las próximas dos semanas para dejarlo sano, y te lo dejo creado como ticket ahora mismo. La segunda: el viernes una versión con todos sus datos, y el formato fino la semana que viene — si el cliente lo acepta, es la de menor riesgo para su primera impresión. ¿Cuál prefieres?" Doy mi recomendación (B) pero la decisión de negocio es de negocio.

**Riesgos y mitigación:** que el hack se quede para siempre → ticket con dueño y sprint antes de la primera línea, y yo mismo lo persigo; bugs de formato el jueves por la noche → el Excel de muestra como caso de prueba desde el martes y demo interna el jueves a mediodía; que "un export" se convierta en producto → la pregunta 4 lo destapa.

**Qué NO haría:** decir "no se puede" a secas (falso y me quita el asiento en la mesa); decir "sí" a secas y reventarme el jueves (le quita a negocio la oportunidad de elegir la opción B, que quizá prefería); usar la urgencia para colar el refactor completo del módulo ("ya que tocamos reportes, lo arreglo todo" — no: eso es secuestrar una fecha de negocio para una agenda técnica); aceptar el hack sin el ticket — sin registro, la deuda consciente se vuelve deuda invisible, que es la cara.

**Estimación:** para el viernes las estimaciones son en horas y con margen: "formato completo por la vía rápida: 2.5 días de trabajo con medio día de margen — justo pero posible si el Excel de muestra llega hoy; cada día que tarde la muestra corre la fecha". Condicionar la estimación a las dependencias externas explícitamente es parte de comunicarla bien.

**Qué espera oír el entrevistador:** opciones con trade-offs en vez de sí/no; deuda técnica tomada conscientemente = con ticket, fecha de caducidad y acuerdo explícito; la pregunta "¿qué necesita el cliente de verdad el viernes?"; traducción de riesgo técnico a lenguaje de negocio sin condescendencia; recomendación propia pero decisión compartida; y madurez para no aprovechar la crisis para agendas técnicas propias.

---

## 5. Integración con un tercero mal documentado
**Categoría:** Integraciones / Riesgo · **Tipo:** [CASO] Análisis de requerimiento

### 🎯 Enunciado
"'Firmamos con PagoYa, una pasarela local, porque tiene las mejores comisiones del país. Hay que integrarla este mes. La documentación es un PDF de 2019, el sandbox devuelve respuestas que no coinciden con el PDF, el soporte tarda días en responder, y el equipo de otro país que la integró nos dijo: el sandbox no se parece a producción.' ¿Cómo planificas esta integración?"

### 📝 Respuesta resumen
Trato al tercero como territorio hostil: la incertidumbre no se estima, se **reduce con un spike timeboxeado** (3-5 días) cuyo objetivo es mapear el comportamiento REAL — del sandbox y, cuanto antes, de producción con transacciones de céntimos. Aíslo toda la rareza detrás de un **anti-corruption layer** para que sus conceptos no contaminen mi dominio, congelo lo aprendido como **contract tests contra grabaciones** de respuestas reales, y diseño desde el día 1 el **modo degradado**: qué hace mi checkout cuando PagoYa se cae o responde cosas nuevas. La estimación va después del spike, no antes, y lo digo así de claro.

### 📖 Respuesta detallada

**Preguntas de aclaración y por qué:**
- **"¿PagoYa reemplaza a la pasarela actual o se suma?"** Si se suma, tengo failover natural y el riesgo baja muchísimo: puedo enrutar tráfico gradualmente y volver atrás. Si reemplaza (por exclusividad contractual), el modo degradado se vuelve crítico y lo negocio: ¿puedo mantener la anterior como fallback aunque cueste comisión?
- **"¿Qué operaciones necesitamos: solo cargo, o también refund, void, conciliación, webhooks?"** Cada operación es un frente de reverse-engineering. Quizá la v1 vive con cargo + refund manual desde el panel de PagoYa.
- **"¿Podemos hablar con el equipo del otro país?"** Una hora con quien ya pisó las minas vale más que el PDF entero: qué difiere entre sandbox y prod, qué códigos de error existen de verdad, cuánto tarda el settlement. Lo agendo antes que nada.
- **"¿Hay contacto técnico en PagoYa con SLA, o solo soporte genérico?"** Si el contrato no incluyó canal técnico, pido que se negocie YA — más barato que descubrir en producción que nadie contesta.
- **"¿Qué volumen y desde cuándo?"** Decide la robustez de la v1 y si el rollout puede ser por porcentaje.

**El spike timeboxeado (la herramienta central):** 3-5 días, con preguntas concretas que responder, no "explorar": (1) ejecutar cada operación contra el sandbox y **grabar** cada request/response real; (2) provocar los errores: tarjeta rechazada, timeout, monto inválido, webhook duplicado — el catálogo real de errores nunca está en el PDF; (3) transacciones reales de céntimos en producción con tarjeta propia, porque me dijeron que el sandbox miente — la única fuente de verdad; (4) medir latencias y comportamiento de webhooks (¿reintentan? ¿en orden? ¿firmados?). Entregable: doc "comportamiento observado de PagoYa" + librería de grabaciones + la estimación por fin fundada. El timebox es sagrado: si en 5 días no hay respuestas suficientes, eso ES un resultado — escala como riesgo al sponsor del contrato ("las comisiones baratas incluyen este coste de integración").

**Anti-corruption layer (y por qué no es sobre-ingeniería aquí):** un módulo `pagoya-gateway` que expone MI lenguaje (`authorize`, `capture`, `refund`, estados míos) y por dentro traduce las rarezas: códigos numéricos sin documentar, fechas en formato local, el webhook que llega dos veces. Todo mapeo tipo "código 47 = fondos insuficientes (observado el 12/3)" vive ahí, comentado con su evidencia. Si PagoYa cambia algo —o la reemplazamos—, el daño queda contenido en un módulo; el resto del sistema no sabe que PagoYa existe.

**Contract tests contra grabaciones:** las respuestas grabadas en el spike se vuelven fixtures de una suite que corre en CI contra mi adapter (¿parseo bien cada variante real?) y, en versión reducida, periódicamente contra el sandbox real (smoke). Cuando producción devuelva algo nunca visto, el adapter lo loguea completo como error desconocido → la grabación nueva se vuelve test. La suite crece con cada sorpresa: es la documentación que PagoYa no escribió.

**Plan de contingencia y modo degradado (diseñado antes del go-live, no después del primer incidente):** circuit breaker con umbrales; si PagoYa no responde → encolar el intento y ofrecer "te avisamos cuando se procese" o failover a la pasarela anterior si existe; webhooks tratados como at-least-once (idempotencia por id de transacción) y con **polling de respaldo** — si el webhook no llegó en X minutos, pregunto yo; alertas sobre la tasa de errores desconocidos, mi detector de "PagoYa cambió algo sin avisar".

**Fases:** Semana 1: spike + charla con el otro equipo + doc de comportamiento + estimación real. Semanas 2-3: adapter + ACL + contract tests + flujo de cargo end-to-end en staging. Semana 4: producción al 1-5% del tráfico con la pasarela vieja como fallback, subiendo por escalones con métricas de tasa de éxito comparadas contra la pasarela actual. Refunds automatizados y conciliación: fase 2 explícita.

**Qué NO haría:** no estimaría la integración completa antes del spike ("¿cuánto se tarda en integrar algo que se comporta distinto de su documentación? — no se sabe, por eso hago el spike"); no confiaría en el sandbox como representación de producción (me lo han dicho explícitamente); no dejaría que los conceptos de PagoYa (sus estados, sus códigos) se filtren a mi modelo de dominio; no lanzaría al 100% del tráfico por fe.

**Qué espera oír el entrevistador:** spike timeboxeado con preguntas concretas y entregable, no "investigar"; grabar comportamiento real y convertirlo en contract tests; producción con céntimos como fuente de verdad cuando el sandbox miente; ACL con justificación (contener la rareza), no como patrón recitado; webhooks con idempotencia y polling de respaldo; rollout por porcentaje con fallback; y escalar el coste oculto del proveedor barato a quien firmó el contrato.

---

## 6. "Quiero un dashboard en tiempo real"
**Categoría:** Producto / Datos · **Tipo:** [CASO] Análisis de requerimiento

### 🎯 Enunciado
"La VP de Operaciones: 'Necesito un dashboard en tiempo real de las ventas: por región, por producto, con comparativa contra ayer y contra la semana pasada. Lo quiero en pantalla grande en la oficina y en el móvil. En tiempo real, ¿eh?, no como el reporte actual que va con un día de retraso.' El 'reporte actual' es un batch nocturno sobre el warehouse."

### 📝 Respuesta resumen
"Tiempo real" es la frase más cara y peor definida del software: mi primer trabajo es convertirla en un número con coste asociado. Para un dashboard de gestión que hoy corre con 24 h de retraso, casi siempre "cada pocos minutos" cumple el 100% de la necesidad por el 10% del coste de sub-segundo. Presento la **escalera de frescura** (24 h → 15 min → 1 min → segundos) con el coste de cada peldaño, y propongo entregar por fases: primero el mismo dato con frecuencia de minutos (micro-batch sobre lo que ya existe), y solo subir de peldaño si el uso real lo pide. La decisión de frescura es de negocio; el precio de cada opción lo pongo yo.

### 📖 Respuesta detallada

**Preguntas de aclaración y por qué:**
- **"¿Qué decisión tomas con este dato, y cada cuánto la tomas?"** LA pregunta. Si la respuesta es "ver cómo va el día y reaccionar en la mañana" → frescura de 5-15 min sobra. Si es "detectar en minutos que una región dejó de vender por un fallo del checkout" → eso no es un dashboard, es **alerting**, y se resuelve distinto (y mejor) que con una persona mirando una pantalla.
- **"Del reporte actual, ¿qué molesta: el retraso, el contenido o el acceso?"** A veces el dolor real es que el reporte llega por email en PDF y quiere verlo en el móvil. Modernizar el acceso con el mismo batch nocturno quizá resuelve el 80% del dolor en una semana.
- **"¿'Ventas' según qué definición?"** ¿Pedido creado, pagado, neto de cancelaciones? La comparativa contra ayer exige la MISMA definición que el warehouse, o el dashboard "en tiempo real" contradirá al reporte oficial y perderá toda credibilidad — el riesgo número uno de este proyecto no es técnico, es que Operaciones deje de confiar en los números.
- **"¿Cuánta exactitud necesita el número intra-día?"** Si un ±2% que se corrige a la medianoche es aceptable (casi siempre lo es para gestión), se abre la puerta a agregados aproximados baratos. Si tiene que cuadrar al céntimo con contabilidad, el coste sube un orden de magnitud.
- **"¿Quién más lo va a querer?"** Si esto es el primer dashboard de una futura familia, la elección de infraestructura pesa más; si es uno solo, gana lo simple.

**La escalera de frescura con costes (lo que llevo a la segunda reunión):**
1. **24 h (statu quo) con mejor presentación:** días de trabajo. Solo cambia el acceso.
2. **5-15 min — micro-batch:** el mismo query de agregación del warehouse (o sobre una réplica de lectura del transaccional) cada N minutos, resultados a una tabla de agregados, frontend con polling cada 60 s. Sin infraestructura nueva. **1-2 semanas.** Mi apuesta de que aquí termina la necesidad real.
3. **~1 min:** agregación incremental — o micro-batch más agresivo si el volumen lo tolera, o empezar a consumir eventos. Aparece la pregunta de definiciones consistentes con el warehouse. **Semanas.**
4. **Segundos — streaming:** pipeline de eventos (CDC/Kafka) con agregados materializados (ksqlDB/Flink/Materialize) y push al frontend vía **SSE** (elegiría SSE sobre WebSocket: unidireccional, más simple, reconexión gratis; WebSocket solo si algún día hay interacción bidireccional). Infraestructura nueva que hay que operar, definiciones duplicadas que mantener sincronizadas con el warehouse, y on-call para cuando el pipeline se atasque un sábado. **Meses, y coste permanente.**

La conversación con la VP: "el peldaño 2 te lo doy este mes y cuesta X; el 4 cuesta 10X y un equipo manteniéndolo. ¿Qué decisión tuya cambia entre verlo con 10 minutos y con 10 segundos?" — formulado así, casi todo el mundo elige el 2.

**Fases entregables:** Fase 1 (1-2 semanas): dashboard web responsive con agregados cada 10-15 min, mismas definiciones que el warehouse (reuso sus queries o sus dbt models como fuente de verdad de la lógica), comparativas contra ayer/semana desde el warehouse. Modo pantalla-grande: la misma página con auto-refresh. Fase 2 (según feedback de uso REAL): bajar a 1-5 min donde duela, y alertas automáticas si el patrón de uso revela que están vigilando anomalías. Fase 3 (solo con evidencia): streaming para las métricas que lo justifiquen.

**Riesgos y mitigación:** números que no cuadran con el reporte oficial → una sola fuente de lógica (compartir la definición, no reimplementarla) y leyenda visible "dato provisional intra-día"; el query de agregación castigando la BD transaccional → réplica de lectura; scope creep de métricas → cada métrica nueva pasa por la misma pregunta de decisión-que-habilita.

**Qué NO haría:** no montaría Kafka + Flink porque el requerimiento dice "tiempo real" — es la trampa del enunciado y la sobre-ingeniería más común de la década; no discutiría con la VP sobre la palabra "real" — le pongo precios a la frescura y dejo que elija; no construiría el dashboard con una definición de "ventas" propia "mientras tanto".

**Estimación y comunicación:** por peldaño, con la recomendación explícita: "Peldaño 2: 1-2 semanas, y propongo empezar ahí porque cubre la decisión que me describiste; si tras dos semanas de uso necesitas más frescura, subimos con datos de uso en la mano y te digo el precio del siguiente". Comprometerse al peldaño barato con la puerta abierta al caro es mucho más fácil de aceptar que vender el caro de entrada.

**Qué espera oír el entrevistador:** convertir "tiempo real" en un requisito medible preguntando por la decisión que habilita; la escalera de frescura con coste por peldaño; detectar que a veces lo pedido es alerting y no dashboard; la consistencia de definiciones con el reporte oficial como riesgo principal; polling humilde antes que streaming; SSE vs WebSocket razonado; y entregar en dos semanas algo que responda el 80% antes de discutir el 20% caro.

---

## 7. Romper un contrato público con clientes externos activos
**Categoría:** APIs públicas / Versionado · **Tipo:** [CASO] Análisis de requerimiento

### 🎯 Enunciado
"'Vamos a rehacer el modelo de permisos, y la API pública de `/v1/orders` no puede seguir devolviendo el objeto `owner` como hasta ahora: cambia la forma y la semántica. Tenemos ~400 integraciones externas activas contra v1, desde scripts de una tienda pequeña hasta el ERP de nuestro cliente más grande. Producto quiere el modelo nuevo en producción en un trimestre. ¿Cómo lo haces sin quemar a los clientes?'"

### 📝 Respuesta resumen
Un contrato público con 400 consumidores no se rompe: se **versiona y se retira con proceso**. Primero verifico si el cambio es evitable (¿puede v1 emular la semántica vieja sobre el modelo nuevo? — a menudo sí, con una capa de traducción). Si no: v2 con el modelo nuevo, v1 congelada sirviendo la traducción, **telemetría por versión y por cliente** para saber quién consume qué, deprecation policy pública con plazos realistas (6-12 meses, no un trimestre), migración asistida (guía, changelog, sandbox, avisos activos por canales que la gente lea), y sunset escalonado con brownouts. El trimestre de Producto aplica al modelo nuevo interno y a v2 — no al apagado de v1, y esa distinción es la clave de la negociación.

### 📖 Respuesta detallada

**Preguntas de aclaración y por qué:**
- **"¿La semántica vieja puede EMULARSE sobre el modelo nuevo?"** La pregunta que puede ahorrar el 80% del proyecto. Si el nuevo modelo de permisos puede proyectarse al `owner` viejo (aunque sea con pérdida — p. ej. "el primer admin" como `owner`), v1 sigue funcionando para siempre sobre una vista de compatibilidad y el sunset se vuelve opcional. Rompo el contrato solo si es genuinamente imposible mentir con elegancia.
- **"¿Qué exige el trimestre de Producto exactamente?"** Casi siempre necesitan el modelo nuevo funcionando internamente y para clientes nuevos — no que las 400 integraciones hayan migrado. Separar esos dos objetivos disuelve la mitad del conflicto de plazos.
- **"¿Qué dicen nuestros términos de servicio sobre deprecación?"** Si prometimos 12 meses de aviso, eso es un límite duro. Si no prometimos nada, es el momento de escribir la política — este proyecto la necesita y los siguientes la agradecerán.
- **"¿Tenemos telemetría por versión, endpoint y API key?"** Sin ella estoy ciego. Si no existe, instrumentarla es la tarea 1: necesito saber cuántos de los 400 usan realmente el campo `owner`, con qué frecuencia, y quiénes son. A menudo el 30% de las integraciones están muertas y el problema real son 40 clientes activos, no 400.
- **"¿Quién es dueño de la relación con los clientes grandes?"** El ERP del cliente más grande no migra por un email automático: migra porque su account manager lo agenda. Necesito a Customer Success en el plan desde el día 1.

**El plan por fases:**
- **Fase 0 (semanas 1-2):** telemetría por versión/cliente/campo si no existe; análisis de uso real; decisión emular-vs-versionar con una prueba de concepto de la capa de traducción; borrador de deprecation policy si no hay.
- **Fase 1 (el trimestre):** modelo de permisos nuevo interno; `/v2/orders` con la semántica nueva; v1 intacta sirviendo sobre la capa de compatibilidad. Objetivo de Producto: cumplido. Nadie externo se ha enterado todavía y eso es exactamente lo correcto.
- **Fase 2 (anuncio y migración asistida):** changelog + guía de migración con ejemplos de diff request/response; sandbox donde probar v2; anuncio con fecha de sunset de v1 (mínimo 6-12 meses según lo que usen los términos); avisos ACTIVOS: header `Deprecation`/`Sunset` en las respuestas de v1, emails al contacto técnico de cada API key que sigue llamando (la telemetría me dice a quién), dashboard de migración interno para Customer Success con semáforo por cliente.
- **Fase 3 (sunset escalonado):** cuando el tráfico de v1 cae por debajo de un umbral: **brownouts programados** (v1 apagada 5 minutos, luego una hora, en ventanas anunciadas) — es el único mecanismo que despierta a los rezagados que no leen emails, y les da un fallo recuperable en vez de uno terminal. Después, apagado, con el código de la capa de compatibilidad eliminado (el sunset no está completo hasta que el código muere).

**"¿Y si un cliente enorme no migra?"** Respuesta de negocio, no técnica, y la digo así: (a) extensión de plazo pactada con fecha firme y quizá coste contractual, (b) mantener la capa de compatibilidad SOLO para sus API keys (viable si es una traducción barata), (c) ayuda de ingeniería nuestra para su migración — una semana de nuestro tiempo puede ser más barata que un año de mantener v1. Lo que NO es opción: apagarle la integración al cliente que sostiene el revenue por una fecha interna, ni mantener v1 eternamente gratis por miedo a la conversación. Decide negocio con los costes que yo pongo sobre la mesa.

**Riesgos y mitigación:** drift entre v1-emulada y v2 (misma lógica interna, traducción en el borde, contract tests para ambas en CI); clientes "migrados" con un cron olvidado en v1 (la telemetría por key los delata; los brownouts los despiertan); mantener dos versiones más de lo previsto (v1 en modo mantenimiento con dueño asignado, no huérfana).

**Qué NO haría:** cambiar la semántica DENTRO de v1 "porque el JSON sigue teniendo la misma forma" — romper semántica sin romper sintaxis es la peor traición a un consumidor, porque nada falla ruidosamente: los datos simplemente empiezan a significar otra cosa; anunciar sunset sin telemetría (no sabría ni a quién estoy rompiendo); prometer el apagado de v1 dentro del trimestre; versionar TODO el API a v2 si el cambio afecta solo a un recurso — la granularidad de versionado también se decide, y migrar 400 clientes de todo el API por un campo es coste inútil.

**Estimación y comunicación:** al PO: "El modelo nuevo y v2: dentro del trimestre. El ciclo de vida de v1 es un proyecto paralelo de 9-12 meses de duración calendario con poco esfuerzo continuo, y su coste real es de relación con clientes más que de código. Te separo los dos en el roadmap para que el trimestre no cargue con lo que no puede cumplir."

**Qué espera oír el entrevistador:** buscar primero la emulación antes de aceptar el breaking change; separar "modelo nuevo en producción" de "clientes migrados" como objetivos con plazos distintos; telemetría por versión/cliente como prerequisito de todo; deprecation policy, avisos activos y brownouts; el cliente enorme tratado como decisión de negocio con opciones costeadas; y la sensibilidad a romper semántica sin romper sintaxis.

---

## 8. Multi-tenancy sobrevenida
**Categoría:** Arquitectura / B2B · **Tipo:** [CASO] Análisis de requerimiento

### 🎯 Enunciado
"El CEO en el all-hands: 'Vamos a vender a empresas. Cada empresa quiere sus datos completamente aislados de las demás, algunas piden su propia base de datos por contrato, y la primera firma en seis semanas.' Vuestra app se construyó para consumidores individuales: `user_id` por todas partes, una BD, sin concepto de organización."

### 📝 Respuesta resumen
Multi-tenancy retro-encajada es de los cambios más invasivos que existen, porque el tenant no es una feature sino una **dimensión transversal** que atraviesa datos, authz, queries, caches, jobs, backups, métricas y facturación — y cada sitio que la olvide es una fuga de datos entre empresas. Mi plan: aclarar qué significa "aislados" en cada contrato (aislamiento lógico por fila suele bastar; BD dedicada es un tier premium, no el default), introducir `tenant_id` como concepto de primera clase con **defensa en profundidad** (scoping en el ORM + RLS en Postgres), y una fase 1 en seis semanas que aísle correctamente a los primeros clientes B2B en el camino que usan — no toda la app. La promesa comercial de "su propia BD" se renegocia o se cobra como enterprise.

### 📖 Respuesta detallada

**Preguntas de aclaración y por qué:**
- **"¿Qué está firmado o prometido EXACTAMENTE sobre el aislamiento?"** "Aislados" en boca de un comprador suele significar "mis empleados no ven datos de otra empresa y viceversa" — aislamiento lógico. "Propia base de datos" a veces es un checkbox de un cuestionario de seguridad que se satisface con RLS + cifrado + un buen pen-test report. Necesito ver el texto real de los contratos antes de elegir arquitectura, porque la diferencia es meses.
- **"¿Cuántos tenants esperamos y de qué tamaño?"** 10 empresas grandes vs 10.000 pequeñas llevan a arquitecturas opuestas: BD-por-tenant escala operacionalmente hasta decenas, no miles (migraciones × N, backups × N, conexiones × N).
- **"¿Los usuarios B2B usan las MISMAS features que los consumidores, o un subconjunto?"** Si compran un subconjunto (p. ej. el dashboard y los reportes), la fase 1 solo necesita tenantizar ese camino — reduce el frente de seis-semanas dramáticamente.
- **"¿Un usuario puede pertenecer a varias organizaciones? ¿Y los consumidores actuales?"** Define el modelo: `membership(user, org, role)` versus `user.org_id`. Elegir mal aquí es carísimo de revertir; membership es apenas más caro hoy y evita la migración inevitable de mañana. Los consumidores existentes pasan a un "tenant personal" implícito o conviven como caso especial — decisión estructural de la semana 1.
- **"¿Quién administra los usuarios de cada empresa?"** Multi-tenancy B2B arrastra siempre a sus amigos: roles por organización, admin del tenant, invitaciones, y pronto SSO/SAML. No los construyo todos ahora, pero el modelo debe dejarles sitio.

**Los niveles de aislamiento (el mapa que presento):**
1. **Fila compartida (`tenant_id` en cada tabla + Row-Level Security):** un esquema, una BD. Barato de operar, escala a miles de tenants; el riesgo es el bug de scoping — mitigable con defensa en profundidad. El default correcto para casi todos.
2. **Esquema por tenant:** aislamiento más tangible, migraciones × N, ruido operacional; útil como punto medio, rara vez el óptimo.
3. **BD por tenant:** aislamiento real (backups/restore individuales, blast radius contenido, residencia de datos), coste operacional alto y por-tenant. Correcto como **tier enterprise cobrado**, provisionado con automatización, para los pocos que lo pagan.
La arquitectura madura es 1 + 3: pool compartido con RLS para el común, dedicado para quien lo paga. Y lo crucial: el CÓDIGO es el mismo en ambos — la elección de aislamiento es de despliegue/datos, no dos codebases.

**Por qué retro-encajar esto es tan difícil (lo digo explícitamente):** cada query existente asume "todos los datos son del mismo mundo". El tenant hay que inyectarlo en: cada query (el 99% vía ORM scoping; el 1% de SQL crudo es donde vivirá la fuga), claves de cache (cache sin tenant en la clave = datos de la empresa A servidos a la B, clásico), jobs y colas (el mensaje lleva tenant y el worker lo restaura), búsqueda/índices, métricas de producto, exports, logs (¡y su acceso!), y el backfill de históricos. Es una propiedad transversal, como la seguridad: no se añade, se teje.

**Defensa en profundidad (la decisión técnica central):** una sola línea de defensa fallará. Combino: (1) `tenant_id NOT NULL` + FK en cada tabla tenantizada; (2) scoping automático en la capa de datos (default scope por request-context; el query SIN tenant es el que requiere código explícito y review, no al revés); (3) **RLS en Postgres** con `SET app.tenant_id` por conexión — aunque el código tenga un bug, la BD no devuelve filas ajenas; (4) tests de aislamiento: una suite que siembra dos tenants y verifica que ningún endpoint filtra; (5) alarma sobre queries a tablas tenantizadas sin predicado de tenant (detectable en el ORM).

**Fases contra las seis semanas:** Fase 1 (las 6 semanas): modelo `organization` + `membership`, tenantización SOLO del camino que los clientes firmados usan, RLS en esas tablas, admin básico de miembros, tests de aislamiento. Entregable honesto: "estas features, correctamente aisladas". Fase 2: tenantización del resto de la app, backfill de históricos al tenant personal, claves de cache, jobs. Fase 3: tier dedicado automatizado (si algún contrato lo paga), roles finos, SSO. A negocio: "en 6 semanas la primera empresa entra con aislamiento real en lo que compró; 'propia base de datos' es tier enterprise con precio y fecha propios — no lo prometáis gratis en la próxima venta".

**Riesgos y mitigación:** fuga entre tenants (defensa en profundidad + pen-test antes del go-live grande); rendimiento de RLS en queries calientes (medir; los índices empiezan por `tenant_id`); el backfill de históricos corrompiendo a los consumidores actuales (idempotente, por lotes, verificado); ventas prometiendo aislamientos a la carta (matriz publicada de tiers).

**Qué NO haría:** BD-por-tenant como arquitectura general "porque suena más aislado" (muerte operacional a escala); tenantizar las 200 tablas en la fase 1; poner `tenant_id` "solo en el código" sin RLS (una sola defensa = una fuga eventual); ni aceptar que "aislados" signifique lo que cada uno imaginó — lo escribo, lo circulo y lo firmo con Producto y Ventas.

**Qué espera oír el entrevistador:** que interrogue la palabra "aislados" contra los contratos reales; los tres niveles con sus costes operacionales y BD-dedicada como tier cobrado; la naturaleza transversal (caches, jobs, logs, métricas — no solo queries); defensa en profundidad con RLS; el modelo membership decidido bien desde el día 1; una fase 1 honesta de alcance reducido; y el reconocimiento explícito de que esto es de lo peor para retro-encajar, dicho sin drama y con plan.

---

## 9. "Hazlo configurable": el motor de reglas prematuro
**Categoría:** Diseño / Alcance · **Tipo:** [CASO] Análisis de requerimiento

### 🎯 Enunciado
"El PO: 'Necesitamos que el cálculo de comisiones sea configurable. Hoy tenemos tres esquemas (porcentaje fijo, escalonado por volumen, y el especial de los partners), pero mañana pueden venir más, así que mejor hacemos un motor de reglas genérico donde yo mismo pueda definir cualquier fórmula sin depender de ustedes. Así nunca más les pido cambios de comisiones.' Te enseña una captura de un competidor con un editor de fórmulas."

### 📝 Respuesta resumen
El PO pide una plataforma para resolver tres casos: es la trampa clásica de la generalización prematura. Un motor de reglas genérico es un producto entero (editor, validación, versionado de reglas, testing para el PO, debugging de "¿por qué esta comisión salió así?") cuyo coste real aparece después de construirlo. Mi contrapropuesta: resolver los tres esquemas con un **seam bien diseñado** — una interfaz `CommissionScheme` con implementaciones en código y **parámetros** (no lógica) configurables por el PO desde un admin. Eso le da el 80% de su autonomía (cambiar tasas, tramos, fechas sin deploy) al 10% del coste, y deja la puerta abierta: si llegan el cuarto y quinto esquema y son variaciones de los mismos, la **regla de tres** dirá qué abstracción merece existir — con evidencia, no con imaginación.

### 📖 Respuesta detallada

**Preguntas de aclaración y por qué:**
- **"¿Qué cambio de comisiones pediste en los últimos 12 meses?"** Los datos históricos deciden el diseño. Si los cambios reales fueron "subir el 5% al 7%" y "añadir un tramo", lo que necesita es **parámetros editables**, no fórmulas editables. Casi siempre es esto.
- **"¿Qué te duele: esperar a un deploy, o depender de nosotros?"** Si el dolor es el lead time (dos sprints para cambiar un número), la solución es parámetros en admin + auditoría — un motor genérico no ataca ese dolor mejor que eso.
- **"Del editor del competidor: ¿lo has usado o lo has visto en una demo?"** Los editores de fórmulas genéricos demuestran precioso y operan horrible: alguien escribe una regla con un caso borde sin cubrir, comisiona mal un mes y el "sin depender de ustedes" termina en nosotros debuggeando reglas ajenas en producción. Quiero que el PO vea ese coste, no negárselo por decreto.
- **"¿Quién valida y quién audita un cambio de comisión?"** Las comisiones son dinero: cambiarlas necesita four-eyes, vigencia con fechas, versionado y reproducibilidad ("¿con qué regla se calculó esta comisión de marzo?"). Esto es necesario CON o SIN motor — y en el motor genérico es diez veces más difícil.
- **"¿Los esquemas futuros son variaciones de estos tres o categorías nuevas?"** Si Ventas ya negocia un esquema radicalmente distinto, quiero conocerlo: una cuarta instancia real informa la abstracción mejor que cualquier especulación.

**El análisis YAGNI vs extensibilidad (el corazón del caso):** la disyuntiva no es "flexible vs rígido", es **dónde pones la flexibilidad**. Tres niveles: (1) lógica y valores hardcodeados — de ahí venimos, mal; (2) **lógica en código, parámetros en datos** — cada esquema es una estrategia testeada; sus tasas, tramos, topes y vigencias viven en BD y las edita el PO con validación y auditoría; (3) lógica en datos (motor de reglas) — el PO define comportamiento arbitrario. El salto de (2) a (3) multiplica el coste por diez y solo paga si de verdad aparecen esquemas estructuralmente nuevos cada mes. La evidencia (tres esquemas en años) dice nivel 2. La regla de tres aplica con matices: tenemos tres esquemas reales que riman — la interfaz `CommissionScheme` ya está justificada; lo que NO tenemos es tres instancias de "el PO necesitó una fórmula imprevisible", que es lo que justificaría el motor.

**El seam sin el motor (diseño concreto):** interfaz `CommissionScheme.calculate(context) -> Commission`; tres implementaciones (`FlatPercentage`, `TieredVolume`, `PartnerSpecial`); tabla `commission_configs` con esquema asignado, parámetros JSON validados contra el schema de cada estrategia, `valid_from/valid_to` y trazabilidad de quién cambió qué; cada comisión calculada guarda referencia a la config y versión con que se calculó (reproducibilidad — imprescindible con dinero). El día que el motor genérico se justifique con evidencia, es UNA implementación más detrás de la MISMA interfaz: el seam es la póliza de seguro barata que hace reversible mi "no".

**Cómo decir no con alternativas (la habilidad evaluada):** nunca "no, YAGNI". La estructura: reconocer el objetivo legítimo ("quieres dejar de esperar deploys para cambiar comisiones: eso lo arreglamos"), mostrar el coste oculto de su solución ("un editor de fórmulas te hace responsable de que la fórmula esté bien; cuando una comisión salga mal a fin de mes, el debugging vuelve a nosotros pero con tu regla en medio"), y ofrecer la alternativa con el mismo beneficio visible ("cambias tasas, tramos y vigencias tú mismo, hoy, con validación; y si los esquemas nuevos desbordan esto, el diseño ya tiene el enchufe para crecer"). Cierro con un criterio objetivo pactado: "si en N meses hay X esquemas que no encajan como parámetros, reabrimos el motor con datos".

**Fases:** Fase 1 (1-2 semanas): interfaz + tres estrategias + configs en BD con vigencias, migrando el comportamiento actual sin cambios visibles (protegido con tests de regresión sobre comisiones históricas). Fase 2 (1-2 semanas): admin UI con validación, four-eyes y auditoría — aquí el PO recibe su autonomía. Fase 3 (condicional a evidencia): lo que los datos pidan.

**Riesgos y mitigación:** parámetros mal validados que rompen cálculos (JSON Schema por estrategia + preview del impacto sobre casos de ejemplo antes de confirmar); el "especial de partners" que resulta ser diez especiales encubiertos (lo descubro en fase 1 leyendo el código actual); presión futura por el motor (el criterio pactado y el seam existente abaratan esa conversación).

**Qué NO haría:** construir el motor genérico "ya que estamos" (el coste no es construirlo, es operarlo, versionarlo y debuggearlo para siempre); ni lo contrario — hardcodear el cuarto esquema cuando llegue, ignorando que la interfaz ya me pide extensión; ni burlarme del requerimiento: el deseo de autonomía del PO es legítimo y darle una versión segura de esa autonomía es exactamente el trabajo.

**Qué espera oír el entrevistador:** distinguir el objetivo (autonomía, lead time) de la solución pedida (motor); lógica-en-código/parámetros-en-datos como punto medio; regla de tres aplicada con matices (la interfaz sí, el motor no — evidencia distinta para cada uno); el seam como opción de compra barata sobre el futuro; auditoría/vigencias/reproducibilidad porque es dinero; y un "no" que es en realidad "sí a lo que necesitas, no a lo que pediste", con criterio objetivo de revisión.

---

## 10. Herencia de un requerimiento a medio hacer
**Categoría:** Continuidad / Arqueología · **Tipo:** [CASO] Análisis de requerimiento

### 🎯 Enunciado
"'El equipo de la plataforma de cupones se disolvió en la reorg. Te toca terminar la feature de cupones combinables que dejaron a medias: hay una rama con 60 commits sin mergear, otra parte ya está en producción detrás de un flag apagado, no hay specs escritas, el tech lead que lo diseñó está de baja larga y el PO original se fue. Negocio pregunta cuándo se entrega. ¿Qué haces las dos primeras semanas?'"

### 📝 Respuesta resumen
Lo primero que se hereda no es código: es una **decisión pendiente** — ¿continuar, reescribir o descartar? — y no puede tomarse sin información. Dedico un timebox (5-8 días) a **arqueología**: reconstruir la intención desde git, tickets, PRs, ADRs y las personas que quedan; evaluar el estado real del código (¿compila?, ¿qué cubre el flag?, ¿los tests pasan y prueban algo?); y re-validar que el requerimiento siga vigente con el negocio actual, porque quizá el mundo cambió desde que se diseñó. Con eso decido con criterios explícitos, re-estimo desde cero (la estimación heredada está muerta) y comunico el estado real aunque duela: "está al 70%" heredado casi siempre significa 40%.

### 📖 Respuesta detallada

**Preguntas de aclaración y por qué (aquí, dirigidas a reconstruir el contexto):**
- **A negocio: "¿Los cupones combinables siguen siendo prioridad, y con la misma definición?"** La pregunta incómoda que nadie hace: el requerimiento se diseñó en otro contexto. Si la respuesta es tibia, "descartar con dignidad" entra en la mesa y ahorra meses. No termino una feature por inercia.
- **"¿Qué significa 'combinables' exactamente: cualquier par, reglas por tipo, topes de descuento acumulado?"** Sin spec escrita, la definición vive en la cabeza del tech lead de baja y quizá en el código. Necesito re-derivarla y ESCRIBIRLA — la spec de una página que no existió es mi primer entregable.
- **Al equipo disuelto (los que sigan en la empresa): "¿Qué funcionaba, qué estaba a medias, y de qué estaban menos seguros?"** Media hora con cualquier ex-miembro, aunque fuera junior en el proyecto, vale más que dos días de leer código. Pregunto específicamente por lo que NO está en el código: decisiones descartadas, el motivo del flag apagado, si hubo algún intento de activarlo que salió mal.
- **"¿Contactar al tech lead de baja?"** Solo vía su manager, solo si él quiere, 30 minutos como mucho. Una baja se respeta; el plan no puede depender de esa conversación.

**La arqueología, sistemática (días 1-5):**
1. **Git como narrativa:** los 60 commits en orden cuentan la historia — dónde hubo avance lineal (confianza) y dónde vaivén y reverts (ahí dudaban; ahí dudaré yo). El último tramo dice si lo dejaron estable o a mitad de una idea.
2. **Tickets y PRs:** los comentarios de review son la spec fantasma — ahí se discuten los "¿y si A y B tienen restricciones incompatibles?". Reconstruyo el backlog: hecho / a medias / ni empezado.
3. **El código en producción tras el flag:** ¿qué cubre? ¿Se ejecuta parcialmente (p. ej. el modelo de datos ya escribe)? Un flag apagado no siempre es inerte — en staging lo enciendo y observo.
4. **La rama sin mergear:** ¿rebasea limpio contra main actual? ¿Compila, pasan sus tests, prueban comportamiento o son de humo? Tras meses, suele esconder conflictos semánticos con lo que main hizo mientras tanto — los mido, no los supongo.
5. **Salida:** spec de una página reconstruida + inventario honesto de estado + lista de incógnitas.

**La decisión continuar / reescribir / descartar, con criterios explícitos:**
- **Descartar** si negocio ya no lo sostiene con la prioridad de antes, o si el diseño resuelve un problema que la estrategia actual ya no tiene. Es la opción menos considerada y a veces la más rentable; el coste hundido de 60 commits no es un argumento — lo digo con esas palabras.
- **Continuar** si la arquitectura heredada es razonable (no idéntica a la que yo habría hecho: razonable), el código está sano y las incógnitas son acotadas. Sesgo por defecto hacia continuar: la reescritura siempre se subestima y el conocimiento embebido en código que funciona vale más de lo que parece.
- **Reescribir (parcialmente)** solo las partes donde la arqueología encontró vaivén, tests ausentes y conflicto semántico con main — no "todo, porque no es mi estilo". El criterio: ¿me costará más entender-y-completar que rehacer-con-lo-aprendido? Se responde pieza a pieza, no en bloque.
La decisión se documenta en un ADR corto: opciones, criterios, elección — el siguiente que herede esto (quizá yo mismo en la próxima reorg) merece lo que yo no tuve.

**Fases y re-estimación:** Semana 1: arqueología + spec reconstruida + decisión preliminar. Semana 2: validar la decisión con un incremento real — rama rebasada en un entorno, flag encendido en staging, UN caso de combinación end-to-end. Ese incremento es el mejor estimador que existe: calibra la fricción real del código heredado. Después re-estimo el resto contra la spec nueva y **desde cero**: la estimación del equipo anterior murió con su contexto, y el "70% hecho" que negocio recuerda es expectativa a gestionar, no dato — el último 30% de una feature contiene sistemáticamente más del 50% del trabajo, y en una heredada, más.

**Comunicación del estado real (la parte política):** a negocio, en la semana 1: "Estoy reconstruyendo el estado real; el viernes te doy diagnóstico y plan con fecha". En la semana 2: el semáforo honesto — hecho de verdad / a medias / ni empezado, y la fecha nueva con su base. Sin culpar al equipo anterior (trabajaron con un contexto que ya no existe) y sin heredar promesas que no puedo auditar: "la fecha anterior se hizo con información que ya no vale; esta es la mía y esto la sustenta".

**Riesgos y mitigación:** incógnitas que solo aparecen al encender el flag (por eso se enciende en staging en la semana 2, no en la 8); presión por mergear los 60 commits ya ("está casi listo") → el incremento end-to-end como puerta de calidad previa; conocimiento evaporándose con cada rotación → las entrevistas de arqueología van ANTES que la lectura de código.

**Qué NO haría:** empezar a codear el día 1 sobre la rama heredada; reescribir todo por comodidad estilística; comprometer fecha antes de la arqueología; asumir que el requerimiento sigue vigente sin preguntar; ni presentar el diagnóstico como auditoría del equipo anterior.

**Qué espera oír el entrevistador:** el timebox de arqueología con fuentes concretas (git como narrativa, PRs como spec fantasma, personas antes que código); re-validar la vigencia del requerimiento antes de terminarlo por inercia; la decisión triple con criterios y sin sesgo de coste hundido; el incremento end-to-end como calibrador de la re-estimación; estimación desde cero con el "70%" tratado como expectativa, no como dato; y una comunicación que restaura la confianza sin repartir culpas.
