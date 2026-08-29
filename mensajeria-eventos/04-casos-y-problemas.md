# Mensajería: Casos y Problemas de Producción — Preguntas de Entrevista Senior

Casos de troubleshooting y análisis sobre sistemas de mensajería y event-driven (Kafka, RabbitMQ, outbox, sagas), planteados como en una entrevista senior: el entrevistador da síntomas con números concretos y espera un diagnóstico sistemático —hipótesis ordenadas, comandos y métricas concretas, root cause, fix inmediato vs definitivo y prevención—, no una adivinanza afortunada.

---

## 1. Rebalance storm: el consumer group entra en bucle de rebalanceos
**Categoría:** Kafka / Consumer groups · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Ayer subimos el tamaño de lote de procesamiento del consumidor de `orders-events` de 100 a 2.000 mensajes por poll para 'mejorar el throughput'. Desde entonces, el consumer group (12 instancias, 24 particiones) rebalancea cada 4-6 minutos sin parar: en los logs se ve `Attempt to heartbeat failed since group is rebalancing` y `consumer poll timeout has expired` en bucle. El lag pasó de ~2K estable a 1.4M y sigue subiendo. Nadie ha tocado el broker. Diagnostica y arregla."

### 📝 Respuesta resumen
Firma de libro de **`max.poll.interval.ms` excedido**: al multiplicar ×20 el lote, procesar un poll pasó a tardar más que el intervalo máximo permitido entre polls (default 5 min); el coordinator considera muerto al consumidor, lo expulsa, rebalancea, las particiones caen en otro consumidor que también tarda demasiado… y el grupo entra en un bucle donde **nadie comitea progreso y todo se reprocesa**, disparando el lag. Confirmación: aritmética lote×latencia vs `max.poll.interval.ms` y el mensaje de log, que lo dice literalmente. Fix inmediato: revertir `max.poll.records`. Definitivo: dimensionar lote vs tiempo con margen, cooperative rebalancing, static membership y alertas de tasa de rebalanceos.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **Leer el log antes de teorizar.** El cliente moderno es explícito: `consumer poll timeout has expired ... the time between subsequent calls to poll() was longer than the configured max.poll.interval.ms`. Es el diagnóstico servido; muchos equipos lo tienen delante días mientras "miran el broker".
2. **Correlacionar con el cambio:** el ajuste de `max.poll.records` de 100 a 2.000 coincide al minuto con el primer rebalanceo. Cambio reciente + síntoma nuevo = primer sospechoso.
3. **Hacer la aritmética.** Con ~200 ms por mensaje (BD + side effects), 100 mensajes son ~20 s por poll: cómodo dentro de los 300.000 ms del default. 2.000 mensajes son ~400 s = 6,6 min > 5 min → expulsión garantizada en cada ciclo. No es intermitente: es determinista, por eso el bucle es perpetuo.
4. **Verificar el estado del grupo:** `kafka-consumer-groups.sh --describe` muestra al grupo alternando `PreparingRebalance`/`Stable`; métricas del cliente: `rebalance-rate-per-hour` disparada, `commit-rate` ≈ 0, `records-consumed-rate` en diente de sierra.
5. **Por qué el lag explota tanto:** con rebalanceo *eager* (default histórico), cada ciclo revoca **todas** las particiones de **todos** los miembros (stop-the-world). Peor: el consumidor es expulsado **antes de comitear**, así que cada lote procesado se reprocesa tras la reasignación — trabajo desperdiciado y **duplicados aguas abajo** si los side effects no son idempotentes (vale decirlo aunque no lo pregunten).

**Hipótesis descartadas:**
- *Red o `session.timeout.ms`/heartbeats:* los heartbeats van en hilo aparte (KIP-62); un problema de red daría expulsiones erráticas por session timeout sin correlación con el deploy. El mensaje es de *poll interval*: mide el hilo de procesamiento, no la red.
- *GC pauses:* darían expulsiones intermitentes por session timeout; las métricas de GC lo descartan y no explican la correlación con el cambio de lote.
- *Churn de miembros por despliegue/crash-loop:* daría un patrón parecido (siempre vale un `kubectl get pods`), pero los procesos viven; son expulsados lógicamente.

**Root cause:** el lote se dimensionó por throughput ignorando el contrato temporal del grupo: `max.poll.records × latencia_por_mensaje` debe ser muy inferior a `max.poll.interval.ms`. Al violarlo de forma determinista, cada miembro es expulsado en cada ciclo, no se comitea ningún offset y el lag crece con todo el tráfico entrante.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* revertir `max.poll.records` a 100 (o subir `max.poll.interval.ms` como parche). El grupo se estabiliza en un rebalanceo final y el lag drena; si urge, escalar temporalmente hasta 24 consumidores (techo = particiones).
- *Definitivo:* (1) dimensionar con margen (`max.poll.records × p99_latencia × 3 < max.poll.interval.ms`) y, para throughput, atacar la latencia por mensaje (batch a BD, pipelining) en vez de inflar el poll; (2) **`CooperativeStickyAssignor`**: rebalanceo incremental, solo se mueven las particiones que cambian de dueño — convierte futuros rebalanceos de catástrofe en molestia; (3) **static membership** (`group.instance.id` por pod) para que un restart no dispare rebalanceo; (4) si el procesamiento es intrínsecamente lento, `consumer.pause()` + procesamiento en background manteniendo polls de viveza.
- *Guardarraíl:* alertas sobre `rebalance-rate-per-hour` y sobre lag con pendiente sostenida; "tiempo de proceso por poll vs max.poll.interval" como métrica de primera clase.

**Prevención:** todo cambio de configuración de consumo pasa por una tabla de dimensionamiento y se prueba en staging con latencias realistas. Lección citable: *el throughput del consumidor tiene un contrato de viveza; subir el lote sin mirar el reloj es firmar la expulsión*.

**Qué espera oír el entrevistador:** identificar `max.poll.interval.ms` en el primer minuto a partir del log; la aritmética lote×latencia; la distinción session timeout (red) vs poll interval (procesamiento); por qué el bucle no comitea y reprocesa (y el riesgo de duplicados downstream); cooperative rebalancing y static membership como mejoras estructurales, no solo "revertir el número".

---

## 2. Partición caliente: una de 24 concentra el 40% del tráfico
**Categoría:** Kafka / Particionado · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Desde que lanzamos una campaña con un marketplace grande, el lag del topic `purchase-events` (24 particiones, 24 consumidores) crece sin parar, pero solo en una partición: la 7 acumula 2.1M de lag mientras las otras 23 están a cero y sus consumidores ociosos al 5% de CPU. El consumidor de la 7 está al 100% y no da abasto. Escalamos de 24 a 32 consumidores y no cambió nada. ¿Qué pasa y qué haces, hoy y a medio plazo?"

### 📝 Respuesta resumen
**Hot partition por clave sesgada**: la clave de partición es `customer_id` y la campaña metió a un cliente gigante cuyo tráfico —40% del total— cae entero, por `hash(key) % 24`, en la partición 7. Escalar consumidores no hace nada porque **una partición la consume exactamente un consumidor del grupo**: los 8 nuevos quedan idle. Diagnóstico: distribución de mensajes por partición + top de claves en la caliente. Fix inmediato: paralelizar dentro del consumidor de la 7 (si el orden real lo permite). Definitivo: re-keying (clave más granular), salting de claves calientes o particionador custom que aísla a las "ballenas", asumiendo el coste en garantías de orden.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **Confirmar la asimetría con datos.** `kafka-consumer-groups.sh --describe`: LAG por partición → 2.1M en la 7, ~0 en el resto. Rate de entrada por partición (métricas de broker o dos lecturas de `GetOffsetShell`): la 7 ingiere ~40% del total. Esto separa las dos hipótesis de entrada: ¿la 7 **recibe** más (productor/clave) o **consume** más lento (consumidor/datos)? Aquí recibe más.
2. **Identificar la clave culpable.** Muestrear la partición 7 (`kafka-console-consumer --partition 7` + agregación por key): el 95% lleva `customer_id = <marketplace>`. La campaña convirtió a un cliente en el 40% del tráfico y el hash lo concentra donde toca por definición.
3. **Explicar por qué escalar no ayudó** (el entrevistador lo puso a propósito): el paralelismo máximo de un grupo = nº de particiones, y el de una clave = 1 partición = 1 consumidor. Los consumidores 25-32 están `assigned: none`. Es el error conceptual que el caso destapa.
4. **Cuantificar el techo:** si el consumidor procesa 800 msg/s y entran 2.500 msg/s de ese cliente, el lag crece a 1.700/s y **nunca** drenará sin un cambio estructural. Decirlo con números demuestra pensamiento de capacidad.

**Hipótesis descartadas:**
- *Consumidor de la 7 defectuoso (nodo lento, GC):* el rate de entrada es el anómalo; y tras forzar un rebalanceo, la 7 sigue caliente en cualquier consumidor.
- *Skew por pocas particiones:* con claves bien distribuidas el reparto sería ±10-15%; un 40% en una sola es sesgo de clave.
- *Mensajes de la 7 más caros de procesar:* posible agravante (pedidos con más líneas); se mide con latencia por mensaje segmentada; aquí es secundario frente al volumen.

**Root cause:** clave de partición (`customer_id`) correcta para el caso medio pero sin plan para la cola de la distribución: los sistemas multi-tenant siempre acaban con "ballenas", y `hash(customer_id)` garantiza que toda la ballena cae en una partición. El diseño acoplaba orden por cliente (que quizá ni se necesita a esa granularidad) con capacidad por cliente.

**Fix inmediato vs fix definitivo:**
- *Inmediato (sin tocar particionado):* (1) paralelismo interno en el consumidor de la 7 con orden preservado **por sub-clave** (p. ej. `order_id`): normalmente el orden requerido real es por pedido, no por cliente, y eso desbloquea paralelismo ya; (2) priorizar eventos críticos del backlog y degradar los informativos; (3) verificar batching/linger del productor.
- *Definitivo (elegir según el requisito de orden real):*
  1. **Re-keying a clave más granular:** si el orden solo importa por pedido, `key = order_id` reparte a la ballena entre las 24 particiones. La opción limpia si el contrato de orden lo permite; ojo: cambiar la clave rompe orden y particionado durante la transición — coordinarlo con consumidores (técnicas del caso 12).
  2. **Salting solo de claves calientes:** `key = customer_id + (hash(order_id) % N)` para clientes marcados "hot" (lista dinámica por métricas). Los consumidores asumen que el orden por cliente pasa a ser por bucket.
  3. **Particionador custom** que enruta ballenas a particiones reservadas o a un topic dedicado (`purchase-events-bulk`) con su propio grupo y SLA: aísla el blast radius del noisy neighbor.
  4. **Aumentar particiones** solo como último recurso: aquí no arregla nada (la clave seguiría cayendo en una) — error común que conviene descartar explícitamente.
- *Drenaje:* con el fix aplicado, medir ETA del backlog con el rate neto y comunicarlo.

**Prevención:** métrica y alerta de **skew por partición** (max/mediana de bytes-in > 3 → warning); en el diseño de cada topic, la pregunta "¿qué pasa cuando un tenant sea el 40% del tráfico?"; detección de hot keys en el productor; y capacity review del pipeline de eventos en onboarding de clientes grandes.

**Qué espera oír el entrevistador:** por qué escalar consumidores no sirve (paralelismo acotado por partición y por clave); el método entrada-vs-velocidad; la pregunta "¿qué orden necesitas de verdad?" antes de elegir entre re-keying, salting y particionador custom, con sus trade-offs; y el enfoque multi-tenant (ballenas, noisy neighbor, aislamiento).

---

## 3. Duplicados masivos tras un incidente: cobros repetidos downstream
**Categoría:** Kafka / Idempotencia y offsets · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"El viernes desplegamos el consumidor de `billing-events` y entró en crash-loop durante 40 minutos (OOM por un cambio de configuración) hasta el rollback. Hoy lunes, finanzas reporta ~9.000 cargos duplicados a clientes generados en esa ventana. El equipo dice: 'imposible, comiteamos offsets y además nuestro consumer es idempotente'. Los cargos duplicados existen. Reconstruye qué pasó y qué cambiarías."

### 📝 Respuesta resumen
Anatomía del clásico **at-least-once + side effects no idempotentes de verdad**: el consumidor ejecutaba cargos y **moría antes de comitear el offset**; al reiniciar, Kafka reentrega desde el último offset comiteado y el lote se ejecuta otra vez — cada iteración del crash-loop recargó el mismo tramo. La "idempotencia" era supuesta: dedupe en memoria (se pierde con el crash), alcance/ventana equivocados, o el ID de dedupe generado en el handler (nuevo por ejecución). Diagnóstico: correlacionar offsets comiteados vs cargos ejecutados con timestamps. Fix: dedupe **transaccional y persistente** por event_id, reembolsos proactivos, y test de caos "kill -9 entre proceso y commit" en CI.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **Reconstruir la mecánica con offsets.** `kafka-consumer-groups.sh --describe`: durante la ventana, el committed offset apenas avanzó (el proceso moría antes del commit) mientras billing muestra cargos ejecutándose. Trazar 20 duplicados: el mismo `event_id` procesado 4-7 veces, con timestamps separados ~una iteración del crash-loop. Offset-estancado + side-effects-repetidos es la prueba del mecanismo.
2. **Auditar la "idempotencia" declarada.** ¿Dónde vive el registro de "ya procesado"? Hallazgos típicos, cualquiera rompe la garantía: (a) **caché en memoria** de event_ids — se evapora con el crash, justo cuando más se necesita; (b) dedupe con TTL corto o en un Redis best-effort; (c) el idempotency key hacia billing **se genera dentro del handler** (UUID nuevo por ejecución → dos claves = dos cargos legales); (d) dedupe en BD en **transacción separada** del side effect; (e) check-then-act sin atomicidad.
3. **Reentrega, no doble emisión:** los duplicados comparten `event_id` y offset — es reentrega del broker (comportamiento normal de at-least-once), lo que exculpa al productor y centra el fix en el consumidor.
4. **Cuantificar el daño:** conciliación contra billing (cargos con mismo event_id/order_id en la ventana) → lista exacta de afectados y montos antes de que lleguen contracargos.

**Hipótesis descartadas:**
- *"Kafka entregó de más":* Kafka cumplió su contrato — en at-least-once la reentrega tras fallo es la norma. Culpar al broker es la señal de junior que este caso detecta.
- *`enable.auto.commit` como causa raíz:* relevante de auditar (auto-commit puede incluso causar **pérdida**, lo contrario), pero ningún régimen de commit elimina la ventana proceso↔commit; el commit manual post-proceso la *maximiza* por diseño. La solución nunca es "comitear mejor": es idempotencia.
- *Duplicados de origen / doble click:* mismos event_ids, concentrados exactamente en la ventana del crash-loop.

**Root cause (dos niveles):** el trigger fue el OOM del deploy, pero el root cause es ejecutar **side effects con dinero bajo semántica at-least-once sin idempotencia real**: el estado de dedupe no era persistente ni atómico con el efecto. "Somos idempotentes" era una creencia no verificada — nunca se probó matando el proceso entre side effect y commit. Un crash-loop es esa prueba, ejecutada en producción 40 minutos seguidos.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* (1) conciliación completa y **reembolso proactivo** de los 9.000 duplicados con comunicación (cada contracargo evitado ahorra fee y reputación); (2) parche defensivo: antes de cargar, consultar si existe cargo para ese `event_id` (imperfecto pero corta la hemorragia); (3) revisar si otros consumidores del mismo template comparten el patrón — casi seguro que sí.
- *Definitivo:*
  1. **Dedupe store transaccional:** tabla `processed_events(event_id PK)` insertada **en la misma transacción** que el efecto local; si el efecto es externo (pasarela), idempotency key **extraída del evento** (nunca generada en el handler) y estado `IN_PROGRESS/DONE` persistido alrededor de la llamada.
  2. **Orden canónico:** procesar → persistir efecto+dedupe atómicamente → commit offset; verificar que un crash en cualquier flecha deja el sistema correcto (a lo sumo reproceso inocuo).
  3. Donde se pueda, **efectos naturalmente idempotentes** (upsert de estado absoluto, no deltas).
  4. Si el pipeline es Kafka→Kafka, evaluar **transacciones de Kafka / EOS** — con su límite: cubre read-process-write dentro de Kafka; en cuanto el efecto sale a un sistema externo, la idempotencia end-to-end vuelve a ser responsabilidad del diseño.
  5. **Test de caos en CI:** matar el consumidor (kill -9) entre proceso y commit con asserts de cero duplicados. Barato, y habría encontrado esto a la primera.
- *Detector permanente:* conciliación diaria billing↔eventos con alerta en duplicados > 0.

**Prevención:** política escrita: *ningún consumidor con side effects entra a producción sin dedupe persistente-transaccional (o efecto idempotente demostrado) y el test de caos del crash-loop en verde*. En el postmortem, separar el incidente del deploy (OOM → límites de memoria, canary) del de diseño (duplicados), latente para cualquier crash.

**Qué espera oír el entrevistador:** la mecánica offset-no-comiteado + side-effect-ejecutado amplificada por el crash-loop; el interrogatorio a la idempotencia supuesta (dónde vive el estado, quién genera la key, atomicidad); at-least-once como contrato normal que el diseño absorbe; reembolso proactivo; EOS con sus límites reales; y el test de caos como verificación permanente.

---

## 4. Mensajes fuera de orden tras escalar de 1 a 8 consumidores
**Categoría:** Kafka / Ordering · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Para bajar el lag de `order-status-events` escalamos el consumidor de 1 a 8 instancias. Desde entonces, soporte reporta pedidos con estados imposibles: pedidos `SHIPPED` que vuelven a `PAID`, o emails de 'entregado' antes que el de 'enviado'. Con 1 consumidor jamás pasó. El topic tiene 16 particiones. El equipo propone volver a 1 consumidor y aceptar el lag. Diagnostica y da una solución que escale."

### 📝 Respuesta resumen
Con 1 consumidor había **orden global accidental** (un solo lector serializa todo); al escalar quedó expuesto el orden real: Kafka solo garantiza orden **dentro de una partición**, así que si los eventos de un pedido caen en particiones distintas (clave ausente o `key = event_id`), 8 consumidores los cruzan. Segundo sospechoso: la clave es correcta pero el consumidor paraleliza **internamente** sin afinidad por clave. Diagnóstico: mirar la key real y las particiones de los eventos de un pedido afectado. Fix: `key = order_id` (orden por agregado), paralelismo interno con afinidad, y consumidores que validan transiciones con versión/máquina de estados como red de seguridad. Volver a 1 consumidor es rendirse, no una solución.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **Mirar los mensajes en el broker, no en los logs del consumidor**, para 10 pedidos afectados: `kafka-console-consumer` con `print.key=true`, `print.partition=true`, `print.timestamp=true` (o kcat -f). Dos hallazgos posibles que bifurcan el caso:
   - Los eventos del pedido X están en **particiones distintas** (`PAID` en la 3, `SHIPPED` en la 11): la clave no es el pedido. La key impresa será `null` (round-robin/sticky) o `event_id` (única por evento → reparto uniforme, cero afinidad). Es el caso común: alguien eligió la key pensando en "distribuir bien la carga" — objetivo correcto, consecuencia fatal.
   - Los eventos están en la **misma partición y en orden** en el log: el desorden lo introduce el consumidor. Sospechosos: thread pool que despacha mensajes consecutivos de la misma partición sin afinidad; procesamiento async donde el mensaje 2 termina antes que el 1; retries internos que reordenan.
2. **Por qué con 1 consumidor "funcionaba":** un único consumidor procesa de uno en uno; la serialización total ocultaba tanto el desorden entre particiones como el bug del pool. El sistema nunca tuvo la garantía; tenía suerte y poco paralelismo. Frase para el entrevistador: *escalar no rompió el orden; reveló que nunca lo hubo*.
3. **Mención breve al productor:** con `max.in.flight > 1` sin idempotencia, un retry puede reordenar *dentro* de la partición; `enable.idempotence=true` (default moderno) lo cubre — se comprueba en la config.

**Hipótesis descartadas:**
- *Relojes desincronizados que solo aparentan desorden:* los estados imposibles son de máquina de estados (SHIPPED→PAID), y el orden de offsets en la partición es la fuente de verdad, no el reloj.
- *Bug nuevo de lógica:* el código de transición no cambió; cambió la concurrencia.
- *Duplicados que parecen retrocesos:* darían el mismo síntoma (y el fix los cubre igual), pero los traces muestran eventos distintos cruzados, no el mismo dos veces.

**Root cause:** el contrato de orden de Kafka es **por partición, y la partición la decide la key**; se publicaban eventos de un agregado (pedido) sin clave de agregado —o con ella, pero rompiendo la afinidad dentro del consumidor—, de modo que el orden por pedido no estaba garantizado por diseño. El consumidor único lo enmascaraba a costa de renunciar a todo el paralelismo.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* (1) si la key es incorrecta: productor a `key = order_id` — los eventos nuevos de cada pedido quedan ordenados; ventana de gracia con validación defensiva mientras conviven eventos viejos mal particionados; (2) si es el pool interno: activar afinidad por key del framework o procesar secuencialmente por partición mientras tanto; (3) backfill que recalcula el estado de los pedidos imposibles desde la secuencia completa.
- *Definitivo:*
  1. **Orden por agregado como decisión explícita:** key = id del agregado cuyo orden importa. El paralelismo escala por número de pedidos concurrentes — exactamente lo deseado.
  2. **Paralelismo interno con afinidad:** workers particionados por key (mismo pedido → mismo worker; pedidos distintos → paralelo). 8 instancias × N workers escalan sin romper nada.
  3. **Consumidor defensivamente ordenado:** el handler valida transiciones (máquina de estados: `SHIPPED→PAID` se ignora) y/o usa **versionado por agregado** (se aplican solo versiones > actual). Convierte el orden de "esperanza en el transporte" a "propiedad verificada en el destino", y de paso absorbe duplicados.
  4. Notificaciones disparadas desde el **estado consolidado**, no desde eventos individuales, para que un rezagado no envíe un email retrocedido.
- *Si alguien propone "una sola partición para orden global":* orden global = paralelismo 1 = el lag que nos trajo aquí; casi nadie necesita orden global, casi todos orden por agregado.

**Prevención:** checklist por topic: *¿cuál es la unidad de orden? ¿la key la refleja? ¿el consumidor preserva afinidad interna? ¿qué hace el handler ante desorden o duplicado?* Tests de integración que publican secuencias desordenadas/duplicadas y verifican el estado final; revisión de los topics existentes contra la checklist — este error nunca vive solo.

**Qué espera oír el entrevistador:** "orden solo por partición, la key decide" en los primeros segundos; mirar keys y particiones reales en el broker; la doble hipótesis clave-incorrecta vs paralelismo-interno; por qué 1 consumidor era orden accidental; validación/versionado por agregado en el destino; y el rechazo razonado tanto de "volver a 1 consumidor" como de "una sola partición".

---

## 5. El outbox se atasca: eventos que llegan horas tarde
**Categoría:** Outbox pattern / CDC · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Usamos transactional outbox en pedidos: los eventos se insertan en la tabla `outbox` en la transacción del pedido y un relay los publica a Kafka. En horas valle todo bien, pero en los picos el relay se queda atrás: ayer los eventos salieron con 3 horas de retraso y el negocio se enteró por soporte de que las confirmaciones no llegaban. La tabla tiene 40M de filas. El relay hace `SELECT * FROM outbox WHERE published = false ORDER BY created_at LIMIT 100` cada segundo, publica uno a uno y marca `published = true`. Diagnostica y arregla."

### 📝 Respuesta resumen
El patrón es correcto; la implementación del relay no escala: (1) la query barre una tabla de 40M donde lo publicado nunca se borra (sin índice parcial útil; en Postgres, además, bloat y dead tuples por los updates masivos); (2) publica **uno a uno, síncrono** (~100 msg/s de techo); (3) `LIMIT 100` × 1 poll/s es un techo duro. Diagnóstico: medir `outbox_oldest_unpublished_age` (la métrica que faltaba), `EXPLAIN ANALYZE` del poll y rate entrada vs salida. Fix inmediato: índice parcial, lotes grandes, publish en batch, borrar/archivar publicados. Definitivo: relay con paralelismo por clave y `SKIP LOCKED`, o migrar a **CDC (Debezium)** sobre el WAL, con la edad del outbox como SLO alertado.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **Cuantificar el desequilibrio.** Rate de inserción en pico (p. ej. 600 eventos/s) vs capacidad del relay: `LIMIT 100` × 1 poll/s con publicación secuencial (10 ms/publish) ⇒ techo ~100/s. Con 600/s entrantes durante 2 h, el backlog crece a ~1.8M que luego drenan a 100/s = horas de cola. Las 3 h de retraso no son un misterio: son aritmética de colas (λ > μ ⇒ la cola crece linealmente).
2. **Medir el coste del poll.** `EXPLAIN (ANALYZE, BUFFERS)`: sin índice parcial, el poll paga el peso muerto de 39.9M de filas publicadas; en Postgres, los updates masivos generan además dead tuples → bloat → polls aún más lentos justo cuando más falta hacen (bucle).
3. **Confirmar la falta de observabilidad:** no existía `age(oldest unpublished)`. Es LA métrica del outbox (equivalente al consumer lag) y su ausencia explica que el detector fuera soporte. Un SELECT de una línea la produce; exportarla cada 30 s.
4. **Revisar orden y concurrencia:** ¿una sola instancia de relay? ¿puede paralelizar por `aggregate_id` sin romper el orden que importa? ¿qué pasa si muere a mitad de lote? (Reenvía: at-least-once es el contrato del outbox; los consumidores idempotentes lo absorben.)

**Hipótesis descartadas:**
- *Kafka como cuello:* el broker acepta decenas de miles de msg/s; las métricas del productor (`record-send-rate`, `request-latency`) muestran al productor ocioso esperando al relay.
- *La BD saturada por el pico:* el poll es lento también en valle si se mide; y el retraso persiste horas después del pico (es backlog, no latencia instantánea).
- *"El outbox no escala, quitémoslo":* la respuesta prohibida — volver al dual write reintroduce pérdida de eventos. El patrón escala; esta implementación no.

**Root cause:** relay implementado como prototipo — polling secuencial de lote pequeño, sin índice adaptado, sin retención (la tabla como log infinito), sin métrica de edad ni alerta — con throughput máximo inferior al rate de picos y backlog invisible hasta que el negocio lo notó.

**Fix inmediato vs fix definitivo:**
- *Inmediato (día 1):*
  1. **Índice parcial:** `CREATE INDEX CONCURRENTLY ON outbox (id) WHERE published = false` (cola por PK creciente). El poll pasa a tocar solo lo pendiente.
  2. **Lotes grandes + batch:** `LIMIT 2000`, productor de Kafka en modo async/batching (linger + callbacks) y marcado en un solo `UPDATE ... WHERE id = ANY(...)`; el techo pasa a varios miles/s.
  3. **Retención:** borrar o archivar publicados > 7 días, por lotes, con vacuum/mantenimiento; la tabla vuelve a tamaño de cola, no de historial.
  4. **Métrica de edad + alerta** (edad > 60 s sostenida = page). Se instala en una hora y evita el próximo "nos enteramos por soporte".
- *Definitivo:*
  1. **Relay industrializado:** múltiples workers particionados por `aggregate_id` (paralelismo sin romper orden por agregado), `FOR UPDATE SKIP LOCKED` para repartir trabajo entre instancias, poll adaptativo (drena continuo con backlog, duerme en valle).
  2. O **CDC con Debezium**: tail del WAL de la tabla outbox → publicación con latencia de milisegundos, sin polling ni coste proporcional al historial y con orden por transacción. A cambio, operar Connect/Debezium — y el nuevo modo de fallo que hay que contar: un conector caído retiene el replication slot y el WAL crece hasta llenar el disco (`pg_replication_slots` vigilado).
  3. Decisión explícita entre ambas: polling bien hecho llega lejos y es simple; CDC quita el techo, con más piezas operativas.
- *SLO:* "edad p99 del outbox < 30 s" con presupuesto, revisado como cualquier SLO.

**Prevención:** test de carga del relay al pico ×3 antes de campañas; la edad del outbox junto al consumer lag en el dashboard (el retraso end-to-end es la suma); runbook de drenaje (escalar workers, priorizar eventos críticos); y tratar el relay como camino crítico de datos — con capacidad, SLO y dueño — no como un cron auxiliar.

**Qué espera oír el entrevistador:** la aritmética entrada-vs-techo; los tres pecados (scan sobre historial infinito, publicación secuencial, lote/frecuencia fijos) con sus fixes; la métrica de edad como equivalente del lag; `SKIP LOCKED` y paralelismo por agregado; CDC/Debezium con sus nuevos modos de fallo; y la defensa del patrón outbox frente a volver al dual write.

---

## 6. DLQ desbordada un lunes: 200.000 mensajes y nadie sabe cuáles reprocesar
**Categoría:** Operación / Dead-letter queues · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Lunes 9:00. La DLQ del dominio de pedidos tiene 214.000 mensajes acumulados desde el viernes. Nadie recibió alerta (la DLQ 'siempre tiene algo'). Hay de todo mezclado: no sabemos cuántos son de un bug ya arreglado el viernes, cuántos de la caída de la API de un partner el sábado, cuántos son veneno real. Negocio pregunta cuántos pedidos están afectados y para cuándo. ¿Cómo atacas la mañana, y cómo rediseñas para que no vuelva a pasar?"

### 📝 Respuesta resumen
Primero **triage por clasificación, no replay a ciegas**: muestrear y agrupar por (excepción, origen, franja temporal) — típicamente 2-4 clusters explican el 95% (bug ya arreglado → reprocesable ya; caída del partner → reprocesable con throttle; un resto pequeño de veneno → manual). Después **replay selectivo y ordenado**: por cluster, en lotes con rate limit, respetando orden por agregado y apoyado en idempotencia. El rediseño: DLQ con **metadatos de error obligatorios**, distinción retriable vs no-retriable en el consumidor (retry-queues con backoff), alertas por tasa de llegada (no por tamaño), y tooling+runbook de replay como ciudadano de primera clase.

### 📖 Respuesta detallada

**Cronología de la mañana (método bajo presión):**
1. **Parar la hemorragia antes de drenar el charco:** ¿sigue entrando? Medir el rate de llegada *ahora*. Si es alto, hay causa activa que arreglar primero; si es ~0 (bug arreglado, partner recuperado), es un problema de drenaje, no un incendio.
2. **Responder a negocio con una muestra:** extraer 1.000 mensajes aleatorios y agregar por metadatos (excepción, timestamp, tipo de evento). Resultado típico: 78% `NullPointerException en PricingHandler` viernes 16:00-20:00 (el bug revertido); 19% `HTTP 503 partner-api` sábado 02:00-09:00; 3% cola heterogénea. Extrapolando: ~167K, ~41K y ~6K. Con `order_id` en los mensajes, un `COUNT(DISTINCT)` da los pedidos afectados en la primera hora.
3. **Replay por cluster, del más seguro al menos:**
   - *Bug-arreglado:* el fix está en prod; reprocesar es seguro. Lotes con throttle (p. ej. 500/s vigilando error-rate y BD: el replay es carga extra sobre producción). **Orden:** agrupar por `order_id` en orden temporal; un replay que mezcla estados antiguos con el presente es donde la idempotencia y la validación de transiciones dejan de ser teoría — si los consumidores no son idempotentes, decirlo: el replay masivo exige dedupe previo consultando el estado.
   - *Partner:* reprocesable contra una API con rate limits: throttle específico y prueba previa con 100 mensajes.
   - *Cola heterogénea (6K):* inspección manual; aquí vive el veneno real → corregir datos, descartar con registro auditado, o abrir bugs.
4. **Cierre:** conciliación de los pedidos afectados y DLQ a ~0 con fecha comunicada a negocio.

**Hipótesis y errores descartados:**
- *"Redrive todo y que se apañe":* mezcla veneno con reprocesables, machaca al partner recuperado, desordena agregados y puede re-tumbar al consumidor con los mismos venenos (bucle DLQ→main→DLQ). Es el anti-patrón que el caso quiere que rechaces con argumentos.
- *"Purgar y seguir":* pedidos reales; pérdida de datos con impacto de negocio y auditoría.
- *"La DLQ está rota":* funcionó perfectamente como amortiguador — capturó 214K fallos sin perder nada. Lo roto es la **operación** alrededor.

**Root cause (operacional):** la DLQ tratada como vertedero y no como cola operativa con SLO: (1) sin alerta por **tasa** de llegada (el tamaño absoluto se normalizó; la alarma útil es rate sobre baseline o edad del más viejo); (2) mensajes sin **metadatos de error** estructurados → cada triage es arqueología; (3) sin tooling ni runbook de replay selectivo; (4) el consumidor no distinguía errores **retriables** (503 del partner: backoff, pausar) de **no-retriables** (NPE, veneno: DLQ directa), así que 7 horas de caída del partner mandaron 41K mensajes a la DLQ en vez de esperar.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* el triage y replay descritos; alerta provisional sobre rate de llegada ese mismo día.
- *Definitivo:*
  1. **Contrato de DLQ:** headers obligatorios (`x-exception-class`, `x-exception-hash`, `x-first-failure-ts`, `x-retry-count`, `x-origin-topic/partition/offset`, `x-consumer-version`). El triage del futuro es un `GROUP BY`.
  2. **Clasificación en el consumidor:** retriable (dependencia caída → retry con backoff+jitter y, si persiste, pausar consumo o derivar a retry-queues con delay escalonado — patrón de retry topics con TTL creciente) vs no-retriable (deserialización, validación, bug → DLQ al primer intento, sin quemar reintentos).
  3. **Alertas correctas:** tasa sobre baseline, edad del más viejo y tamaño con umbral — las tres, con dueño de guardia. Una DLQ con dueño es una cola; sin dueño es un agujero.
  4. **Tooling de replay** mantenido: filtro por header/cluster, rate limit, orden por agregado, dry-run, y registro auditable de qué se reprocesó/descartó y por quién.
  5. **Idempotencia y validación de transiciones** en consumidores como prerrequisito documentado del replay.

**Prevención:** revisión mensual de la DLQ como ritual (clusters recurrentes = bugs a arreglar, no a reprocesar eternamente); gameday "partner caído 6 h" verificando que los retriables esperan en retry-queue; y métrica de negocio (pedidos afectados/semana) para sostener la atención.

**Qué espera oír el entrevistador:** triage por clasificación con muestra antes de tocar nada; respuesta temprana a negocio con números extrapolados; replay selectivo con throttle, orden e idempotencia como condiciones explícitas; el rechazo argumentado del redrive masivo; retriable/no-retriable y retry-queues con backoff; alerta por tasa; y la lectura de que el fallo es operacional — la DLQ hizo su trabajo, nadie hacía el suyo con ella.

---

## 7. Kafka "pierde" mensajes de auditoría: la conciliación mensual detecta huecos
**Categoría:** Kafka / Durabilidad · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"La conciliación mensual de auditoría (regulatoria) compara el sistema origen con lo que llegó al data lake vía el topic `audit-events` y este mes faltan 18.400 eventos de ~90M: huecos concentrados en dos días concretos. Plataforma dice que 'Kafka no pierde mensajes'. El productor loguea 'sent' para todos. El consumidor es un batch nocturno. Demuestra dónde se perdieron y arregla el pipeline para un contexto donde perder no es aceptable."

### 📝 Respuesta resumen
"Kafka no pierde mensajes" es cierto solo con la configuración pagada para ello; hay cuatro puntos de pérdida legales con configs laxas: (1) **productor**: `acks=1` + failover del líder antes de replicar, o fire-and-forget sin comprobar el callback ("sent" en el log solo prueba que salió del cliente); (2) **broker**: `unclean.leader.election.enable=true` promoviendo una réplica desincronizada; (3) **retención**: el batch nocturno se retrasó más que `retention.ms` y los segmentos se borraron antes de leerse — salto silencioso; (4) **consumidor**: commit antes de procesar. El diagnóstico es forense: correlacionar los dos días con failovers y retrasos del batch, y usar offsets+timestamps para demostrar si los mensajes llegaron al log o no. Fix: `acks=all` + `min.insync.replicas=2` + unclean off + retención >> peor retraso + monitoreo lag-vs-retención + conciliación continua.

### 📖 Respuesta detallada

**Cronología de diagnóstico (forense con offsets y timestamps):**
1. **Convertir "faltan 18.400" en casos:** tomar 50 eventos ausentes con ID y timestamp. La pregunta binaria que ordena todo: **¿llegaron al log de Kafka o no?** Si el topic aún retiene esos días, buscar por rango (`--offsets-for-times`, kcat -o s@timestamp) y filtrar por ID; si no, contadores: ¿el delta de offsets de esos días cuadra con lo que el origen dice haber enviado? Delta menor = nunca entraron (productor/broker); delta correcto con datos ausentes en el lake = se perdieron después (retención/consumidor).
2. **Correlacionar los dos días con la operación del cluster:** ¿failovers, restarts, mantenimiento? `UncleanLeaderElectionsPerSec > 0` esos días es una pistola humeante; `UnderReplicatedPartitions` sostenido antes del failover indica ISR encogido — con `acks=1`, todo lo aceptado solo por el líder en ese estado muere con él.
3. **Auditar la config real:** `kafka-configs --describe`: `min.insync.replicas`, `replication.factor`, `unclean.leader.election.enable`, `retention.ms`; y en el cliente, `acks` y la pregunta letal: ¿alguien **comprueba el resultado del send**? Un `producer.send(record)` que ignora el Future/callback loguea "sent" y pierde en silencio (batch expirado por `delivery.timeout.ms`, buffer lleno, líder no disponible). El callback con offset asignado es evidencia de durabilidad; el log "sent", no.
4. **Auditar la carrera retención-vs-batch:** historia típica: el batch falló el viernes, nadie miró el fin de semana, corrió el lunes con 72+ h de retraso; con retención de 72 h, los segmentos viejos se borraron y el consumidor empezó donde pudo, **sin error alguno**. Se demuestra comparando el earliest offset disponible en la corrida vs el último comiteado previo.
5. **Cerrar con el mapa:** típicamente mixto — un día por unclean election en un failover (pérdida en broker con `acks=1`), otro por la carrera de retención. Presentarlo con offsets convierte "creemos" en "demostramos".

**Hipótesis descartadas:**
- *"El origen no los envió":* para los que entraron al log (delta de offsets), exculpado; para los que no, distinguir "no enviados" de "enviados y expirados en el cliente" — el callback no comprobado impide distinguirlo, y eso mismo es un hallazgo.
- *"El data lake los perdió":* verificable con offsets comiteados + logs del sink; si el consumidor comitea después de escribir con éxito, este eslabón se descarta rápido.
- *Bug de la conciliación:* auditarla primero (¿ID estable? ¿ventanas bien cerradas?) — 20 minutos que evitan perseguir fantasmas.

**Root cause:** pipeline de auditoría **regulatoria** montado con defaults de pipeline de métricas: `acks=1`, send sin comprobar, unclean election habilitada, retención sin margen sobre el peor retraso realista del batch, y detección con granularidad mensual — un mes de ceguera entre pérdida y descubrimiento.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* (1) reparar los 18.400 re-extrayendo del origen y backfilleando el lake (por eso el origen de auditoría debe ser re-consultable); (2) configs del día: `acks=all`, `min.insync.replicas=2` con RF=3, `unclean.leader.election.enable=false`, `enable.idempotence=true`, retención a 7-14 días; (3) productor que trata el send fallido como error de negocio (retry + alerta + fallback a disco si el buffer se agota).
- *Definitivo:*
  1. **Contrato de durabilidad por tier de topic:** tier "no perder jamás" (auditoría, dinero) = acks=all + min.insync=2 + RF3 + unclean off + confirmación obligatoria; tier "best effort" (métricas) puede relajar. El error fue una sola config para todo.
  2. **Monitoreo de la carrera retención-consumo:** alerta cuando el lag en tiempo supere el 50% de `retention.ms` — el consumidor no vuelve a acercarse al borde sin que suene. Y alerta con guardia para el fallo del batch nocturno (que fallara un viernes y se supiera el lunes es parte del root cause).
  3. **Conciliación continua** (horaria/diaria) con presupuesto cero: counts por ventana origen vs lake; la mensual regulatoria pasa a ser formalidad, no detector.
  4. Retención larga (o tiered storage) para auditoría, y el batch convertido en streaming o con checkpoint frecuente para achicar la ventana de exposición.

**Prevención:** test de caos que mata líderes con tráfico y verifica cero pérdida con la config del tier; revisión de todos los topics contra la matriz de tiers. Lección citable: *Kafka no pierde mensajes… con acks=all, min.insync bien puesto, unclean election deshabilitada, retención con margen y un productor que mira el resultado; cada palabra que falte de esa frase es un modo de pérdida*.

**Qué espera oír el entrevistador:** los cuatro puntos de pérdida con sus configs exactas; el método forense (¿entró al log o no? con deltas y offsets-for-times); "sent" en el log ≠ ack del broker; la carrera retención-vs-retraso como pérdida silenciosa; tiers de durabilidad; y conciliación continua como detector con latencia de horas, no de mes.

---

## 8. RabbitMQ: la cola que crece hasta tirar el nodo cada Black Friday
**Categoría:** RabbitMQ / Capacidad y backpressure · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Dos Black Fridays seguidos, la misma película: la cola `order-processing` crece de ~1K estable a 8M en tres horas; el nodo entra en alarma de memoria, activa flow control y bloquea a TODOS los productores (incluidos los de colas sanas del cluster); la latencia de publicación se dispara, los upstream agotan timeouts y el checkout cae — en pleno pico de ventas. El año pasado 'lo arreglamos' añadiendo RAM. Este año la proyección es ×2. Diseña la solución de verdad."

### 📝 Respuesta resumen
Problema de **capacidad sin backpressure diseñado**: los consumidores procesan ~700 msg/s y el pico publica ~1.500/s; el excedente se acumula, RabbitMQ —que sufre con colas profundas— consume memoria hasta la alarma, y el flow control (su backpressure de último recurso, brutal e indiscriminado) bloquea productores del vhost entero: la cola enferma tira el cluster. Añadir RAM solo mueve el precipicio. Solución: consumidores dimensionados para el pico y elásticos por profundidad, **cola acotada** (`max-length` + `overflow` como decisión de negocio explícita), separación de tráfico crítico y diferible, load shedding de baja prioridad en el productor, y aceptar que si el pico sostenido > capacidad, alguien decide qué se degrada — mejor en diseño que a las 18:00 del viernes.

### 📖 Respuesta detallada

**Cronología reconstruida (la mecánica que hay que narrar):**
1. *T+0:* publicación 1.500/s, consumo 700/s → la cola crece a 800/s neto. Nadie mira la derivada, solo el valor absoluto ("8M" asusta a las 3 h; la pendiente era visible en el minuto 5).
2. *T+45 min:* la profundidad empieza a costar: RabbitMQ rinde mejor con colas cercanas a vacías; millones de mensajes presionan memoria y el throughput de consumo **empeora** justo cuando más se necesita.
3. *T+2 h:* `memory_alarm` (vm_memory_high_watermark): RabbitMQ activa **flow control: bloquea todas las conexiones que publican** — el blast radius salta de una cola a la plataforma. Los productores no reciben error: se quedan colgados en publish, sus threads se agotan, timeouts hacia arriba, cae el checkout.
4. *El "fix" de RAM:* subir el watermark solo retrasa la alarma; con ×2 llegará antes. Y la cola de 8M tarda ~3 h en drenar tras el pico — retraso para pedidos ya cobrados.

**Observabilidad que faltó:** `rabbitmqctl list_queues name messages` + rates del management API/Prometheus: **publish_rate − deliver_rate** era la única métrica que importaba, con alerta en positiva-sostenida. Más: `consumer_utilisation` (<1 = los consumidores son el cuello; =1 con cola creciendo = faltan consumidores), memoria por cola y estado de alarmas.

**Hipótesis descartadas:**
- *"RabbitMQ no aguanta, migremos a Kafka":* conversación válida a largo plazo (Kafka desacopla con retención en disco barata), pero como respuesta al incidente es escapismo: consumo < producción sin plan reaparecería en Kafka como lag infinito. Primero el balance de capacidad y el shedding; el broker es ortogonal.
- *"Fue la RAM":* síntoma; cualquier cantidad se llena con un desequilibrio sostenido.
- *"Los consumidores tenían un bug":* las métricas históricas muestran que siempre fueron de 700/s; el pico superó la capacidad instalada.

**Root cause:** arquitectura sin decisión de sobrecarga: consumidores dimensionados para el día medio sin elasticidad; cola sin límites (crecimiento infinito hasta la alarma física); tráfico crítico (pedidos) y diferible (emails, analytics) compartiendo cluster y por tanto el destino del flow control; y el backpressure delegado por omisión al mecanismo de emergencia del broker, indiscriminado por diseño.

**Fix inmediato vs fix definitivo:**
- *Preparación para este Black Friday:*
  1. **Consumidores elásticos:** autoscaling por profundidad y rate (KEDA o equivalente) con techo probado ×3 del pico; verificar que el downstream (BD) escala con ellos, y prefetch (QoS) ajustado — ni 1 (mata throughput) ni infinito (acumula sin ack y agrava la memoria).
  2. **Cotas en la cola:** `x-max-length` con `overflow` decidido conscientemente: `reject-publish` (el productor recibe el rechazo y aplica fallback — lo sano para pedidos: persistir en outbox y reintentar) vs `drop-head` (solo datos desechables). La cota convierte "el nodo muere" en "el productor gestiona un rechazo": un contrato manejable.
  3. **Separación por criticidad:** colas y vhosts/clusters distintos para crítico vs diferible; el flow control de la cola de emails no puede volver a tocar el checkout. Los diferibles llevan TTL o se **shed** en el productor bajo feature flag "modo pico".
  4. **Tipo de cola correcto:** quorum queues para lo crítico (con `delivery-limit` y su consumo vigilado con backlogs) y lazy/paginado a disco para colas que legítimamente acumulan, para que profundidad no signifique RAM.
- *Estructural:*
  5. **Backpressure de extremo a extremo:** publisher confirms con timeout y bulkhead en productores (si el broker tarda, el productor degrada él — cola local acotada, shedding — en vez de colgarse); presupuesto de capacidad revisado antes de cada pico con la proyección de negocio (3.000/s proyectados → probado a 4.500/s).
  6. **Load test anual del pico** como gate (replay del año anterior ×2) y gameday del modo degradado.
- *Runbook del día:* palancas ensayadas — modo pico (shed de diferibles), escalar consumidores, y la decisión de negocio preescrita de qué flujo se para primero.

**Prevención:** alerta por **derivada** (publish − deliver > 0 sostenido 5 min) y por `consumer_utilisation`; dashboard de capacidad (rate actual vs techo probado). Lección: *una cola sin límite no es un amortiguador infinito, es una promesa de caída con fecha; los límites con overflow explícito son la diferencia entre degradar por diseño y morir por sorpresa*.

**Qué espera oír el entrevistador:** la mecánica cola-profunda → memoria → flow control indiscriminado → blast radius de cluster; por qué la RAM solo mueve el precipicio; la alerta por derivada; max-length + overflow como decisión de negocio; separación por criticidad y shedding de diferibles; quorum/lazy con matices; publisher confirms y backpressure end-to-end; y el rechazo razonado del "migremos a Kafka" como respuesta a un problema de capacidad.

---

## 9. Schema roto en cascada: cinco consumidores muertos a la vez
**Categoría:** Contratos de eventos / Schema evolution · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"A las 11:40, catálogo desplegó una versión que cambió el evento `ProductUpdated`: renombró `price` a `basePrice` y añadió un campo obligatorio `taxClass`. A las 11:42, cinco consumidores de cuatro equipos (pricing, search, recomendaciones, feeds y el BFF de la app) empezaron a morir: dos en crash-loop por deserialización, tres mandando a DLQ a 2.000/min. El productor 'avisó por Slack la semana pasada'. Reconstruye el incidente, resuélvelo, y diseña el sistema de contratos para que esto sea imposible, no improbable."

### 📝 Respuesta resumen
Ruptura de **compatibilidad backward** distribuida por un canal de gobernanza inexistente (Slack no es un contrato): renombrar un campo es un breaking change puro (los consumidores leen `price` ausente) y un campo required nuevo rompe deserializadores estrictos. Resolución: rollback del productor (un despliegue vs cinco equipos parcheando bajo fuego), gestión de los mensajes venenosos ya publicados, replay de DLQs. Diseño definitivo: **schema registry con enforcement de compatibilidad en el pipeline del productor** (un breaking change no llega a desplegarse), evolución **expand-contract** (añadir `basePrice` opcional junto a `price`, migrar consumidores con telemetría de uso, retirar `price` con uso cero verificado), contract testing consumer-driven y ownership explícito de cada evento.

### 📖 Respuesta detallada

**Cronología de diagnóstico y resolución (el incidente es fácil; se evalúa la ejecución y el rediseño):**
1. **Correlación inmediata:** cinco consumidores independientes fallando a la vez sobre el mismo topic = cambió el mensaje, no cinco bugs simultáneos. El deploy de las 11:40 cierra la causa en minutos; confirmar con un mensaje de muestra: payload sin `price`, con `basePrice` y `taxClass`.
2. **Clasificar el daño por modo de fallo:** (a) los dos en crash-loop (deserialización estricta): no procesan nada, su lag crece — los eventos esperan, no se pierden; (b) los tres de DLQ: procesan el resto y acumulan `ProductUpdated` muertos — recuperables por replay; (c) el que hay que **buscar proactivamente**: ¿algún consumidor con deserialización laxa está leyendo `price = null` y **procesando con precio nulo/cero**? Ese es el peligro real (corrupción publicada — precios a 0 en la web). Barrido de consumidores del topic y verificación de datos aguas abajo.
3. **Rollback vs fix-forward, con criterio:** rollback restaura el contrato al instante para los cinco; fix-forward exigiría coordinar cinco parches en cuatro equipos bajo fuego. Rollback, salvo estado nuevo irreversible. Punto senior: tras el rollback quedan **mensajes venenosos en el topic** (los publicados entre 11:40 y el rollback): los consumidores en crash-loop seguirán muriendo en esos offsets → tolerar/saltar ese rango, y los de DLQ, replay una vez restaurado el contrato (transformando o re-derivando del estado de catálogo).
4. **Comunicación:** un incident channel con los cuatro equipos y un solo hilo de decisión — la mitad del coste es coordinación.

**Hipótesis descartadas:** apenas hay técnicas (el caso es transparente); por eso evalúa **proceso**: quien dedica la respuesta a debuggear deserialización pierde el punto; quien dice "rollback, y hablemos de por qué esto fue posible" lo gana.

**Root cause (tres capas):**
1. *Técnica:* renombrar un campo y añadir uno required son breaking changes de manual; para los consumidores, `price` desapareció (renombrar = eliminar + añadir).
2. *De tooling:* nada lo impedía — sin schema registry con checks, el contrato es una convención oral; el pipeline desplegó un breaking change sin fricción.
3. *De gobernanza:* "avisamos por Slack" — un evento con 5 consumidores de 4 equipos es una **API pública** (versionado, deprecación con plazos, verificación de no-uso antes de retirar) y se gestionó como detalle interno.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* rollback; gestión del rango venenoso; replay de DLQs; barrido del consumidor silencioso y reparación de datos si procesó nulls; congelar cambios de schema hasta tener lo siguiente.
- *Definitivo:*
  1. **Schema registry con enforcement:** eventos con schema (Avro/Protobuf/JSON Schema) y compatibilidad `BACKWARD` (o `FULL`) exigida **en CI y en el registry** — un schema incompatible ni se mergea ni se registra; los serializers integrados hacen imposible publicar algo que no valide.
  2. **Expand-contract como único procedimiento de cambio:** *expand* (publicar `basePrice` **además de** `price`; `taxClass` opcional con default) → *migrate* (consumidores adoptan a su ritmo; telemetría de quién sigue usando el campo viejo, inferida por versiones de schema por grupo) → *contract* (retirar `price` solo con uso cero **verificado**, no anunciado). Para renombres es la única vía: "renombrar" como operación atómica no existe en contratos publicados.
  3. **Consumer-driven contract tests:** cada consumidor registra los campos que usa; el CI del productor los ejecuta contra el schema candidato — sabe *antes de mergear* a quién rompe, en vez de descubrirlo a las 11:42.
  4. **Catálogo de eventos con ownership:** cada topic con dueño, consumidores registrados, política de compatibilidad y canal de deprecación formal.
  5. Para un breaking real inevitable: **topic versionado nuevo** (`product-updated.v2`) con doble publicación durante la migración — nunca mutar el contrato bajo los pies de los consumidores (caso 12).

**Prevención:** game-day de "schema incompatible" verificando que el gate bloquea, y la métrica "cambios bloqueados por el gate" para demostrar que el sistema trabaja. Lección citable: *un evento con N consumidores es una API pública con N clientes; Slack no es versionado, y la compatibilidad no se promete: se verifica en el pipeline*.

**Qué espera oír el entrevistador:** correlación multi-consumidor → cambio de contrato en segundos; la caza del consumidor silencioso que procesa nulls (corrupción > crash); rollback con gestión del rango venenoso; las tres capas de root cause; registry con enforcement como gate (no diccionario decorativo); expand-contract con retirada verificada por telemetría; contract testing consumer-driven; y el marco mental "eventos = API pública".

---

## 10. Consumidor lento por dependencia: cada mensaje llama a una API con p99 de 3 s
**Categoría:** Consumidores / Throughput y dependencias · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"El consumidor de `shipment-events` enriquece cada mensaje llamando a la API de un proveedor logístico y guarda el resultado. La API tiene p50 de 400 ms y p99 de 3 s (y así será: es un tercero). Entran ~120 msg/s en punta; el consumidor procesa secuencialmente ~2.5 msg/s por instancia. Con 8 instancias sobre 8 particiones, el lag crece todo el día y se ha propuesto 'subir a 64 particiones y 64 consumidores'. Evalúa la propuesta y da una solución mejor."

### 📝 Respuesta resumen
El cuello es **I/O-bound**: cada instancia pasa >95% del tiempo esperando a la API; el throughput por instancia es 1/latencia media (~2.5/s), y multiplicar instancias es pagar 64 máquinas para tenerlas esperando — funciona en p50 (64 × 2.5 = 160/s) pero es lo más caro y rígido, y colapsa cuando el proveedor se degrada. La solución correcta es **concurrencia interna**: N llamadas en vuelo por instancia (async/pool con afinidad por clave para preservar orden por agregado): 8 instancias × 20 concurrentes ≈ 400 msg/s. Alrededor: límite de concurrencia acordado con el proveedor, timeout+bulkhead+circuit breaker, cache si hay repetición, batch API si existe, y commit de offsets solo tras completar contiguamente. Aumentar particiones, último recurso.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **Perfilar dónde muere el tiempo:** métricas del handler: `time_total ≈ time_api (390 ms) + time_db (8 ms) + time_cpu (2 ms)`. El 97% es espera de red. Throughput secuencial = 1/0.4 s ≈ 2.5 msg/s — cuadra exacto con lo observado. El diagnóstico es una división; el caso evalúa qué haces con ella.
2. **Desmontar la propuesta de 64 particiones con números:** (a) capacidad: 160/s, apenas 1.33× el pico, sin margen; y **cuando la API se degrada a 3 s sostenidos** el throughput cae a 0.33/s por instancia → 64 × 0.33 = 21/s ≪ 120/s: el lag explota justo cuando el proveedor sufre — la propuesta ni siquiera cubre el peor caso; (b) coste ×8 en instancias al 3% de CPU; (c) **las particiones no se pueden reducir**: 64 es una decisión permanente sobre el topic para esquivar un `async` en el consumidor; (d) re-particionar cambia el mapeo de claves (orden en la transición).
3. **Dimensionar la concurrencia interna:** por Little's Law, 120/s × 0.4 s ≈ 48 llamadas en vuelo en total; con margen para p99 y picos, ~100-150 en vuelo = 15-20 por instancia. Nada exótico.

**Hipótesis descartadas:**
- *"Optimicemos la API":* es un tercero con el p99 que tiene; se diseña alrededor, no se le reza.
- *"Subir max.poll.records":* no toca el cuello (la espera por mensaje sigue igual) y coquetea con `max.poll.interval.ms` (caso 1).
- *"Enriquecer después, asíncrono":* rediseño válido si el negocio tolera enriquecimiento eventual (guardar sin enriquecer + proceso posterior); mencionarlo como opción, pero no es necesario para resolver el cuello.

**Root cause:** consumidor con el modelo mental "un mensaje a la vez" que acopla el throughput del pipeline a la latencia de una dependencia externa; el paralelismo se buscó en la capa equivocada (topología del topic, la palanca visible) en vez de en la correcta (concurrencia de I/O del proceso).

**Fix inmediato vs fix definitivo:**
- *Inmediato (días):*
  1. **Pipeline concurrente:** poll de lotes → hasta N llamadas en vuelo (async HTTP/pool) → **afinidad por clave** (mensajes del mismo `shipment_id` en serie, distintos en paralelo — preserva el orden que importa, caso 4) → commit **solo hasta el último mensaje contiguamente completado** (gestión de out-of-order completion: un mensaje lento no puede dejar comitear a los de detrás, o su fallo tras crash se perdería; librerías tipo parallel-consumer resuelven exactamente esto).
  2. **Contornos de resiliencia el mismo día:** timeout por llamada, retry con backoff+jitter y presupuesto, **bulkhead** (el semáforo de N en vuelo es a la vez el límite de cortesía: acordar el rate con el proveedor, no descubrirle un DDoS), y **circuit breaker**: si el proveedor cae, abrir, derivar a retry-queue con delay y mantener el consumo vivo.
- *Definitivo:*
  3. **Cache** si hay localidad (mismo tracking/ruta consultado N veces): un hit-rate del 40% con TTL corto reduce la dependencia a la mitad; medirlo (top-K de parámetros), no asumirlo.
  4. **Batch API del proveedor** si existe (100 shipments por request cambia la aritmética un orden de magnitud) — preguntar cuesta un email y suele ser la mayor ganancia disponible.
  5. Ajuste fino: si el buffer interno se llena, **pausar particiones** (`consumer.pause()`/`resume()`) en vez de dejar de hacer poll; backpressure interno acotado entre poll y workers.
  6. Particiones: quizá 8→16 como margen operativo razonado — no como el fix.
- *Observabilidad:* en-vuelo, latencia real del proveedor (p50/p99 propios), hit-rate de cache, lag con pendiente; alerta cuando la concurrencia sature el límite sostenidamente (re-dimensionar o proveedor degradado).

**Prevención:** en el design review de consumidores, la pregunta "¿qué acota tu throughput: CPU, broker o una dependencia?" con Little's Law delante; test de carga con la latencia del proveedor simulada en p50 **y** p99 sostenido (el escenario que mata a la propuesta de 64); y contrato documentado con el proveedor (rate acordado, batch API, SLA).

**Qué espera oír el entrevistador:** identificar I/O-bound con la división 1/latencia; desmontar la propuesta con números (coste, permanencia de particiones y sobre todo el colapso en p99 sostenido); Little's Law para dimensionar; afinidad por clave y el detalle senior del commit con out-of-order completion; bulkhead como cortesía contractual; breaker+retry-queue para sobrevivir al proveedor caído; y cache/batch API como palancas baratas antes que topología.

---

## 11. Saga colgada: pedidos 6 horas en RESERVANDO_STOCK
**Categoría:** Sagas / Workflows distribuidos · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Soporte escala: 3.100 pedidos llevan entre 1 y 6 horas en `RESERVANDO_STOCK`. Ni avanzan a pago ni se cancelan: los clientes tienen el dinero retenido en autorización y el stock bloqueado. La saga de checkout es: crear pedido → reservar stock (inventory) → autorizar pago → confirmar. Empezó hacia las 03:00. Inventory tuvo un incidente de 02:50 a 03:20, ya recuperado hace horas. ¿Por qué siguen colgados si inventory está bien, y cómo arreglas el presente y el diseño?"

### 📝 Respuesta resumen
La recuperación de inventory no recupera las sagas porque **nadie re-conduce las que quedaron a medias**: durante la caída se perdieron comandos o respuestas (`StockReserved`/`StockReservationFailed`), y la saga no tiene **timeouts** (espera para siempre) ni un **reaper** de sagas estancadas. Fix inmediato: reconciliación — para cada pedido colgado, consultar el estado real en inventory y pagos, e inyectar el evento que falta o compensar (liberar autorización, cancelar con disculpa). Definitivo: timeout por paso con acción definida, reintentos idempotentes de comandos, reaper periódico de sagas zombis, estado de saga persistente y auditable, e idealmente un motor de workflow que dé todo esto de serie.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **Radiografía del atasco:** `SELECT estado, count(*), min(updated_at) ... GROUP BY estado` → 3.100 en `RESERVANDO_STOCK` con `updated_at` concentrado entre 02:50 y 03:20: son exactamente las sagas **en vuelo durante la caída**. Ningún pedido posterior a las 03:20 está colgado → el sistema funciona en régimen; lo roto es la **recuperación de lo que quedó a medias**. Esta distinción es la clave del caso.
2. **Trazar 10 sagas end-to-end** (logs de order, inventory y broker) para localizar dónde murió cada una. Tres sub-poblaciones típicas:
   - *Comando nunca procesado:* `ReserveStock` enviado a un servicio caído; si era HTTP falló sin reintento; si era mensaje, ¿la cola tuvo TTL/descartes durante el incidente? Verificar en inventory si existe la reserva.
   - *Respuesta perdida:* inventory procesó la reserva (¡el stock ESTÁ bloqueado!) pero `StockReserved` se perdió al publicarse durante su agonía (dual write, caso 5), o el consumidor del orquestador crasheó sin comitear.
   - *Compensación a medias:* cancelaciones automáticas que también fallaron contra inventory caído, sin reintento → ni reservado ni liberado.
   Hallazgo esperable: **el estado real está repartido** — a parte de los pedidos solo les falta el evento; parte no tienen nada. Por eso el fix debe consultar la fuente, no re-lanzar a ciegas.
3. **Confirmar la ausencia de mecanismos de recuperación:** ¿timeout en el paso de reserva? No: espera indefinida. ¿Job que busque sagas viejas? No. ¿El orquestador persiste "qué comando envié y qué espero"? A medias. Con eso, el "6 horas colgados" queda explicado: no hay ningún actor cuya responsabilidad sea mirar el reloj.

**Hipótesis descartadas:**
- *"Inventory sigue mal":* sano desde las 03:20 y las sagas nuevas fluyen; descartado en el paso 1.
- *"Deadlock/lock de BD":* los pedidos no están bloqueados por locks; esperan un mensaje que no llegará. Es un zombi lógico, no contención física.
- *"El broker perdió mensajes, culpa suya":* posible eslabón, pero perder mensajes puntualmente durante un incidente es un evento **esperado** en distribuido; el diseño que no lo tolera es el bug. La saga sin timeout convierte cualquier mensaje perdido en un zombi eterno.

**Root cause:** saga diseñada para el happy path y los fallos *explícitos* (recibir `StockReservationFailed` → compensar), sin tratar el fallo *silencioso* (no recibir nada): sin timeout por paso, sin reintento idempotente de comandos, sin reaper, sin conciliación entre el estado de la saga y el de los participantes. El incidente de inventory fue el trigger; 30 minutos de caída se volvieron 6+ horas de limbo porque la recuperación dependía de mensajes que ya no iban a llegar.

**Fix inmediato vs fix definitivo:**
- *Inmediato (esta mañana):*
  1. **Script de reconciliación:** por pedido colgado, consultar (a) inventory: ¿existe reserva?; (b) pagos: ¿hay autorización? Tres acciones según la matriz: reserva existe → inyectar el `StockReserved` que faltó y continuar; no existe y el pedido es fresco → reintentar la reserva; viejo → **compensar limpio**: liberar autorización y reservas huérfanas, cancelar con comunicación. Priorizar por importe.
  2. Auditar al revés: reservas en inventory sin saga viva, para liberar stock bloqueado invisible.
- *Definitivo:*
  1. **Timeout por paso** con acción definida: `RESERVANDO_STOCK` > 2 min → reintentar comando (idempotente, mismo command-id) N veces con backoff; agotado → compensar automáticamente. El estado "esperando" siempre tiene fecha de caducidad.
  2. **Reaper/watchdog:** job cada minuto que busca sagas con deadline vencido y las empuja (reintento o compensación). Red de seguridad aunque los timeouts fallen; su métrica (`sagas reaped/hora`) es además el detector de incidentes como este.
  3. **Persistencia completa del estado:** cada transición, comando enviado (con id) y evento esperado — el orquestador puede morir y retomar, y "qué sagas están en qué estado desde cuándo" es la herramienta de operación básica que hoy faltó.
  4. **Comandos y compensaciones con las mismas garantías que todo lo demás:** outbox al enviar, reintentos, idempotencia en los participantes (re-reservar con el mismo command-id no duplica), y DLQ con alerta para compensaciones fallidas — una compensación que falla en silencio es deuda directa con el cliente.
  5. **Considerar un motor de workflow** (Temporal o equivalente): timeouts, reintentos, persistencia y visibilidad de serie, mejor probados que el orquestador artesanal; la decisión build-vs-adopt merece mención explícita.
  6. **Conciliación permanente** saga↔participantes con alerta en divergencias sostenidas.
- *Observabilidad:* **edad por estado de saga** (p99 de tiempo en cada estado) con alertas y dashboard de embudo. Con eso, esto se detecta a las 03:05, no por soporte a las 09:00.

**Prevención:** test de caos estándar para sagas: matar cada participante en cada paso (y perder cada mensaje) verificando que toda saga termina — completada o compensada — en tiempo acotado. Lección citable: *en una saga, "no recibí respuesta" es un estado normal que requiere diseño; esperar para siempre no es un estado, es un bug*.

**Qué espera oír el entrevistador:** la distinción "el servicio se recuperó pero nadie re-condujo lo que quedó en vuelo"; el trazado por sub-poblaciones y que el estado real está repartido (por eso se reconcilia consultando la fuente); timeout-por-paso + reaper + persistencia como trío mínimo; compensaciones con garantías de primera clase; la mención de motores de workflow; y la métrica de edad-por-estado como detector que faltó.

---

## 12. Migración de RabbitMQ a Kafka en caliente, sin parar producción
**Categoría:** Migraciones / Arquitectura de mensajería · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"Tenemos 40 colas de RabbitMQ conectando ~25 servicios; el flujo principal (`order-flow`) mueve 50M mensajes/día. La decisión de migrar a Kafka ya está tomada. La restricción: cero parada de producción y cero pérdida — es el flujo de pedidos. Te piden el plan detallado: fases, cómo validas que Kafka procesa igual que RabbitMQ antes de cortar, cómo manejas orden y duplicados durante la transición, y cuándo y cómo decides el corte final o el rollback."

### 📝 Respuesta resumen
Plan por **flujo, no big-bang**, con el patrón doble publicación + shadow consumption + conciliación + corte por lados: (1) los productores publican a ambos brokers tras feature flag (desde un punto único de emisión —outbox o bridge— para no divergir); (2) los consumidores de Kafka corren en **shadow** (sin side effects reales) mientras los de RabbitMQ son la verdad; (3) una **conciliación automática** compara ambos caminos (conteos, checksums, resultados) durante días incluyendo un pico; (4) el corte es **por consumidor y por flujo**, gradual y reversible: se promueve el consumidor Kafka y el de RabbitMQ pasa a shadow (rollback = invertir el flag); (5) se asume duplicación posible (idempotencia obligatoria previa) y se re-crea el orden con claves de partición equivalentes a la semántica de las colas. Criterios de corte y rollback definidos por adelantado con métricas.

### 📖 Respuesta detallada

**Fase 0 — Preparación (lo que decide el éxito):**
1. **Inventario y clasificación de las 40 colas:** semántica requerida (orden: ¿global, por entidad, ninguno?; entrega: at-least-once asumida, ¿o alguien cree tener exactly-once?) y patrones de RabbitMQ **sin** equivalente directo en Kafka que exigen rediseño: routing por topic exchange (→ topics + filtrado), **delayed messages/TTL+DLX** (→ no nativo: retry topics con delay o scheduler), prioridades (→ topics por prioridad), RPC sobre colas (→ replantear); el fanout encaja natural en consumer groups. El mapeo produce el orden de migración: primero flujos simples, al final los que requieren rediseño; `order-flow` en medio — crítico pero semánticamente estándar.
2. **Prerrequisito no negociable: idempotencia en los consumidores destino.** La transición produce duplicados por diseño (doble camino, replays, cortes). Sin dedupe por message-id persistente, se construye **antes** de migrar (y queda para siempre).
3. **Diseño Kafka del flujo:** particiones para el pico ×3 (no se reducen, y acotan el paralelismo futuro), **clave de partición = la unidad de orden real** (order_id: reproduce el orden que RabbitMQ daba donde lo daba), configs tier-crítico (acks=all, min.insync=2, RF3, unclean off) y message-id estable end-to-end para dedupe y conciliación.

**Fase 1 — Doble publicación (productores):**
- Cada productor publica a RabbitMQ (verdad) **y** a Kafka, tras feature flag por servicio y flujo. Punto fino que separa un plan senior de uno de blog: la doble publicación **no debe ser dos dual-writes** — si hay outbox, el relay publica a ambos destinos desde el mismo registro (mismo message-id, mismo orden); si no, la emisión a Kafka cuelga del mismo punto que la de RabbitMQ con tolerancia asimétrica: fallo de Kafka no rompe producción (se loguea; la conciliación lo detecta), fallo de RabbitMQ sigue siendo error real. Alternativa con menos tocado de productores: un **bridge/shovel** que consume de RabbitMQ y re-publica a Kafka — menos cambios, un salto más de latencia y un componente más que vigilar; elegir por flujo y decirlo.
- Métricas desde el día 1: conteo publicado a cada lado por flujo/ventana; divergencia > 0.01% sostenida = investigar antes de seguir.

**Fase 2 — Shadow consumption + conciliación (la fase que valida):**
- Los consumidores de Kafka corren con tráfico real **sin side effects hacia el mundo**: shadow puro (resultado a un sink de comparación) o efectos a un entorno espejo. Los de RabbitMQ siguen siendo la única verdad.
- **Conciliación de tres niveles:** (1) conteos por ventana; (2) contenido (checksum por message-id); (3) **resultado** — para una muestra grande, ¿el consumidor Kafka habría producido el mismo efecto (mismo estado final, mismo evento derivado)? El nivel 3 caza los bugs del consumidor nuevo: deserialización sutil, orden distinto, carreras nuevas con el paralelismo por partición.
- Duración: días, cubriendo **al menos un pico real** (los problemas de orden aparecen con concurrencia, no en valle) y un restart de brokers (¿el camino Kafka sobrevive a sus propios rebalanceos sin divergir?).
- Gate de salida escrito por adelantado: divergencia de conteo < 0.001%, cero divergencias de resultado sin explicar, lag estable en pico, y operación Kafka ensayada (alertas, dashboards, on-call formado — migrar la tecnología sin migrar la operación es media migración).

**Fase 3 — Corte gradual por consumidor:**
- El corte es **por grupo consumidor, no global**: flag `active-consumer = kafka` para un flujo; el consumidor Kafka ejecuta side effects y el de RabbitMQ pasa a shadow — ahora es el guardián del rollback. La doble publicación continúa.
- Secuencia sin huecos ni doble proceso: el consumidor RabbitMQ drena su backlog y para efectos en un punto marcado; el Kafka arranca desde su posición equivalente. Como la equivalencia exacta entre brokers no existe, se elige **solape en vez de hueco**: el Kafka retrocede un margen (minutos) y la idempotencia lo absorbe. *Con dedupe, el solape es gratis; el hueco es pérdida* — la frase que resume por qué la idempotencia era prerrequisito.
- Orden en la transición: dentro de cada camino está garantizado (FIFO / partición por key); el riesgo es el instante de corte, cubierto por solape + validación de transiciones por versión en consumidores.
- Rollback (criterios previos: divergencia de resultado, lag fuera de SLO, error-rate, incidente operativo): invertir el flag — RabbitMQ, que nunca dejó de recibir ni de consumir en shadow, vuelve a activo con el mismo solape. El rollback es barato **porque** la doble publicación no se apaga hasta el final; apagarla pronto para "ahorrar" es comprar un rollback imposible.
- Repetir flujo a flujo, de menor a mayor criticidad; `order-flow` cuando el equipo ya haya cortado tres flujos menores y la operación esté rodada.

**Fase 4 — Descomisionado:**
- Tras N semanas con Kafka activo y conciliación limpia (incluyendo cierre de mes/eventos de negocio): apagar el shadow de RabbitMQ, luego la publicación a RabbitMQ (por flujo, con el mismo flag), observar, y solo al final desmontar la infraestructura, archivando DLQs y mensajes históricos antes de borrar. La conciliación no se desmonta: se re-apunta como control permanente origen↔Kafka.

**Riesgos que el plan debe nombrar (y que el entrevistador buscará):** doble publicación como dual-write mal hecho (divergencia de origen — por eso outbox/punto único); coste ×2 de infra durante meses (presupuestarlo: es el precio de la reversibilidad); consumidores con estado local que no pueden correr en shadow sin contaminar (necesitan sink espejo); la tentación de "migrar y mejorar a la vez" (cambiar broker **y** contratos **y** lógica multiplica las variables — la migración debe ser semánticamente 1:1, las mejoras después); y fatiga de proyecto (por eso flujo a flujo, con victorias contables).

**Qué espera oír el entrevistador:** doble publicación con emisión desde un punto único (outbox/bridge, con trade-offs); shadow con conciliación de resultado y no solo de conteos; gates y criterios de rollback escritos por adelantado; el solape-mejor-que-hueco apoyado en idempotencia prerrequisito; corte por consumidor reversible manteniendo la doble publicación hasta el final; el mapeo honesto de semánticas RabbitMQ→Kafka (delays, prioridades, routing) con rediseños donde no hay equivalente; y la dimensión operativa: se migra también al equipo, no solo a los mensajes.
