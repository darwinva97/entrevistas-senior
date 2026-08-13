# Casos de estudio: Incidentes en producción (nivel senior)

Incidentes transversales y lenguaje-agnósticos en arquitecturas de microservicios, planteados como en una entrevista de troubleshooting/incident review: el entrevistador da síntomas y espera un diagnóstico sistemático, no una adivinanza afortunada.

---

## 1. El checkout cae cada día a las 12:00 exactas
**Categoría:** Diagnóstico sistemático · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Desde hace una semana, el servicio de checkout empieza a devolver errores 5xx y timeouts todos los días entre las 12:00:00 y las 12:04 aproximadamente, y luego se recupera solo. No hay deploys a esa hora. El equipo lleva tres días 'mirando dashboards' sin conclusión. ¿Cómo lo diagnosticas y qué esperas encontrar?"

### 📝 Respuesta resumen
Una degradación **periódica y puntual a una hora exacta** es casi siempre trabajo programado: cron jobs (propios o de otro equipo), batch de BD, rotación/expiración masiva de caché o TTLs sincronizados, renovación de certificados/tokens, o un job externo (partner que descarga un feed a mediodía). El método: correlacionar el minuto exacto del inicio con cualquier cosa programada en toda la plataforma (no solo en checkout), mirar qué recurso se satura primero (pool de conexiones, CPU de la BD, colas) y seguir la cadena hacia arriba. Root cause típico: un job pesado a las 12:00 (reporte, sincronización de inventario) que satura la BD compartida o invalida una caché en masa, y el checkout —que comparte el recurso— paga el pato. Fix: sacar el job de la ruta compartida, escalonarlo con jitter, y aislar recursos.

### 📖 Respuesta detallada

**Cronología de diagnóstico (el proceso importa más que la respuesta):**
1. **Caracterizar el patrón antes de tocar nada.** "A las 12:00 exactas, todos los días, ~4 minutos, se recupera solo" ya descarta la mayoría de hipótesis: no es tráfico orgánico (los picos de usuarios no empiezan en el segundo :00), no es un deploy (no los hay), no es fuga de memoria (sería progresivo, no puntual). La forma del incidente grita **scheduler**.
2. **Ver el minuto exacto y el orden de caída.** En métricas: ¿qué señal se degrada primero a las 12:00:00? ¿Latencia de BD? ¿Espera de pool de conexiones? ¿CPU? El orden de degradación apunta al recurso raíz. Si checkout falla porque su llamada a `inventory` tarda, y `inventory` tarda porque su BD tiene la CPU al 100%, el problema no es de checkout.
3. **Inventariar todo lo programado a las 12:00 en la plataforma**, no solo en el servicio afectado: crontabs, Kubernetes CronJobs, jobs de BD (vacuums programados, backups, refresh de vistas materializadas), ETLs, tareas de otros equipos, integraciones de partners (un cliente enterprise que lanza su sincronización diaria a las 12:00 es un clásico), expiraciones de caché con TTL fijo calculado a medianoche+12h, renovaciones de tokens con expiración redonda.
4. **Confirmar con correlación temporal fina:** logs del job sospechoso vs inicio de la degradación con precisión de segundos, y métricas del recurso compartido (locks de BD, IOPS, saturación de red).
5. **Prueba controlada:** adelantar o retrasar el job sospechoso 30 minutos un día. Si la degradación se mueve con él, caso cerrado. Es la validación más barata y concluyente.

**Hipótesis descartadas y por qué (esto es lo que evalúa el entrevistador):**
- *Pico de tráfico de mediodía:* el tráfico humano crece en rampa (11:45→12:15), no en escalón en el segundo :00. Las gráficas de RPS lo confirman en 1 minuto.
- *Deploy/config change:* no hay deploys a esa hora; el registro de cambios lo confirma.
- *Fuga de recursos con OOM cíclico:* produciría periodicidad relativa al arranque del proceso, no anclada al reloj de pared.
- *Ataque/scraper programado:* posible (los bots sí usan cron), se descarta mirando el origen del tráfico — si el RPS entrante no cambia a las 12:00, el problema es interno.

**Root cause (escenario típico que se espera que construyas):** un job de generación de reportes de ventas (u otra sincronización) corre a las 12:00 contra la **misma base de datos** (o una réplica que comparte IO) que usa el flujo de checkout. El job lanza queries pesadas sin límite, satura CPU/IO o toma locks sobre tablas de pedidos; las queries del checkout pasan de 10 ms a 2 s; el pool de conexiones del checkout se agota (todas las conexiones ocupadas esperando); los requests hacen cola, saltan timeouts, los health checks fallan y los 5xx se propagan. A los ~4 minutos el job termina y todo vuelve. Variante frecuente: invalidación masiva de caché a hora fija → mini-stampede diaria contra la BD.

**Fix inmediato vs fix definitivo:**
- *Inmediato (hoy):* mover el job a las 03:00 o trocearlo; si no se puede tocar, limitar su concurrencia/prioridad (throttle, `statement_timeout` propio, correr contra una réplica dedicada).
- *Definitivo:* (1) aislar cargas analíticas de cargas transaccionales — réplica o warehouse para reportes, nunca la BD del checkout; (2) jitter y escalonado en todo lo programado (política de plataforma: nada corre "a en punto"); (3) presupuestos de recursos por consumidor en la BD si el motor lo permite; (4) timeouts y fallback en checkout para degradar con gracia en vez de colapsar el pool (fail fast + shed load).

**Postmortem y prevención:** el postmortem debe destacar por qué se tardó 3 días: nadie miró *fuera* del servicio afectado. Acciones: inventario centralizado y visible de todos los jobs programados (un calendario de cron de la plataforma); alerta de correlación ("degradación que coincide con job X"); revisión de qué servicios comparten BD/recursos (mapa de blast radius); y como regla cultural, ante un patrón temporal exacto, la primera pregunta del runbook es "¿qué se ejecuta a esa hora en CUALQUIER parte?".

**Qué espera oír el entrevistador:** que la periodicidad exacta se reconoce como firma de scheduler en los primeros 30 segundos; método de correlación y orden-de-caída (encontrar el recurso raíz, no el síntoma); la prueba de mover el job; distinción job-culpable vs arquitectura-culpable (el fix definitivo es el aislamiento de recursos, no solo mover el cron); y las acciones de postmortem sobre visibilidad de trabajo programado.

---

## 2. La latencia p99 se degrada tras cada deploy, pero p50 está bien
**Categoría:** Performance / Deploys · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Después de cada deploy de nuestro servicio principal (JVM/Go/lo que sea, corre en Kubernetes con autoscaling), la latencia p99 sube 3-5× durante 10-20 minutos y luego baja sola. La p50 apenas se mueve. El equipo lo ha normalizado ('es el warmup') pero el SLO de p99 se incumple a diario porque deployamos varias veces al día. Diagnostica y propón soluciones."

### 📝 Respuesta resumen
p99 mal con p50 bien = **una minoría de requests sufre mucho**: exactamente lo que produce una flota donde una fracción de instancias está fría. Tras el deploy, los pods nuevos arrancan sin JIT calentado, con caches locales vacías y pools de conexiones desde cero; el load balancer les manda tráfico de inmediato y cada request que les toca se lleva el p99. Diagnóstico: segmentar latencia **por instancia/pod y por edad del pod** — la correlación p99↔pods jóvenes lo confirma en minutos. Fixes: readiness que no admita tráfico hasta estar caliente + **warmup real** (tráfico sintético o replay antes de entrar al LB), **slow start** en el balanceador (rampa de peso), rolling más gradual, y caches que se precargan en el arranque. "Es el warmup" no es una explicación, es el nombre del bug.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **Formular qué significa la firma.** p50 estable + p99 degradada = la mayoría de requests va bien y una cola minoritaria va muy mal. Las causas de cola son una lista corta: instancias frías, GC pauses, contención puntual (locks, pool agotado), hedging ausente ante una dependencia bimodal, o un subconjunto de requests intrínsecamente caros. Que ocurra **solo tras deploys y se cure solo** apunta a estado transitorio de instancias nuevas.
2. **Segmentar la latencia por pod** (o por versión durante el rollout). Es el paso decisivo y el que muchos equipos no dan porque sus dashboards solo muestran agregados. Se espera encontrar: pods con >15-20 min de vida sirviendo p99 normal; pods de <10 min sirviendo p99 10× peor. Con eso, el "misterio" queda resuelto y empieza el "por qué exactamente están fríos".
3. **Descomponer el frío:** ¿JIT sin compilar (JVM: primeras decenas de miles de invocaciones van interpretadas)? ¿Cache local (in-memory / near-cache) vacía → misses que van a la BD? ¿Pools de conexión creándose bajo demanda (handshakes TLS, aperturas de conexión a BD)? ¿Autoscaler reaccionando al deploy matando/creando pods extra? Métricas por pod: hit-rate de caché local, tamaño del pool, tiempo de compilación JIT, GC.
4. **Confirmar el mecanismo de exposición:** ¿el readiness probe pasa en cuanto el proceso responde `/healthz`, aunque esté frío? ¿El LB reparte uniforme desde el segundo cero? Casi siempre sí: el pod es "ready" técnicamente pero no operacionalmente.

**Hipótesis descartadas:**
- *Regresión de código en cada deploy:* improbable que todos los deploys introduzcan la misma regresión que además se cura en 20 min; el patrón es del proceso de deploy, no del contenido. Se confirma deployando la **misma versión** (no-op deploy): si el p99 se degrada igual, el contenido es inocente.
- *GC como causa primaria:* las pausas GC darían picos también en régimen estable; aquí el patrón está anclado al deploy. (El GC sí puede ser amplificador durante el warmup: heap creciendo, más allocation rate por compilación.)
- *Dependencia externa lenta:* afectaría a todos los pods por igual, viejos y nuevos.

**Root cause:** los pods nuevos se marcan `ready` y reciben cuota completa de tráfico estando fríos: JIT sin calentar, caches locales vacías (cada miss = viaje a Redis/BD que los pods calientes no hacen), pools de conexiones vacíos (cada primera conexión paga TCP+TLS+auth). Con un rolling del 25% de la flota, ~25% de requests aterriza en pods fríos → exactamente la cola p99 con p50 casi intacta. La organización lo normalizó porque "se cura solo", pero con N deploys/día el SLO se viola N × 15 min al día.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* (1) **slow start** en el balanceador/mesh (Envoy lo trae: rampa de peso de 0→100% en varios minutos para endpoints nuevos); (2) rolling más gradual (`maxSurge` pequeño, pausas entre lotes) para que la fracción fría instantánea sea ≤5%; (3) subir el `initialDelay`/exigencia del readiness.
- *Definitivo:* (1) **warmup activo antes de admitir tráfico**: el pod ejecuta self-calls sintéticos sobre sus endpoints calientes (o replay de tráfico shadow) hasta cumplir un umbral de latencia local, y solo entonces pasa el readiness — readiness como "estoy caliente", no "estoy vivo"; (2) precarga de caches locales críticas en el arranque (snapshot desde el pod que muere o desde el store central); (3) pre-establecimiento de pools (min-idle > 0, conexiones abiertas en arranque); (4) en JVM: CDS/AOT, o tecnologías tipo CRaC si el caso lo amerita; (5) SLO burn-rate como guardarraíl del pipeline: si el deploy quema presupuesto de error, el rollout se pausa solo.

**Postmortem y prevención:** la lección organizacional es doble. Técnica: "ready" debe significar "listo para servir con la latencia prometida". Cultural: una degradación que "se cura sola" y ocurre en cada deploy es un bug con cadencia de deploy, y normalizarla es deuda de SLO. Prevención: dashboards de latencia segmentados por versión y edad de pod por defecto (para que la próxima firma de este tipo sea obvia), y un test de rendimiento post-deploy en el pipeline que compare p99 de pods nuevos vs viejos antes de continuar el rollout.

**Qué espera oír el entrevistador:** lectura correcta de la firma p50/p99 (cola minoritaria, no lentitud general); segmentación por pod/edad como paso decisivo; el experimento del no-op deploy; comprensión de qué hace "frío" a un pod (JIT, caches, pools); slow start + readiness-como-warmup como pareja de fixes; y el punto de proceso: normalizar degradaciones recurrentes es aceptar violar el SLO por diseño.

---

## 3. Un retry storm tumbó la plataforma completa
**Categoría:** Resiliencia / Fallos en cascada · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Ayer, un despliegue del servicio de perfiles introdujo una regresión que elevó su latencia de 50 ms a 2 s durante 10 minutos. Ese servicio recibe llamadas de 15 servicios. Lo que debió ser una degradación menor terminó tumbando la plataforma entera durante 2 horas, incluso después de revertir el deploy: los servicios se recuperaban y volvían a caer en oleadas. Reconstruye qué pasó, por qué el rollback no bastó, y qué cambiarías."

### 📝 Respuesta resumen
Anatomía de un **retry storm con thundering herd**: perfiles se ralentiza → sus 15 llamantes agotan timeouts y **reintentan** (3 intentos cada uno, algunos en dos capas: cliente y librería) → el tráfico efectivo sobre perfiles se multiplica ×3-×9 justo cuando menos capacidad tiene → colas llenas, pools agotados, y los llamantes también se saturan esperando → la caída se propaga hacia arriba. El rollback no bastó porque el sistema entró en un **estado metaestable**: la tormenta de reintentos acumulados + caches frías + herds sincronizados mantenían la sobrecarga autoalimentada; cada recuperación parcial era aplastada por la ola de tráfico retenido. Salida: shed load agresivo (rechazar la mayoría del tráfico y readmitir gradualmente). Prevención: presupuestos de retry (retry budget ~10%, no 3× por llamada), backoff exponencial **con jitter**, circuit breakers, timeouts en cascada coherentes y load shedding por defecto.

### 📖 Respuesta detallada

**Cronología reconstruida (lo que el entrevistador quiere que narres):**
- *T+0:* deploy de perfiles; p99 pasa de 50 ms a 2 s. Con timeouts de cliente a 500 ms, la mayoría de llamadas empieza a "fallar" por timeout — aunque perfiles sigue procesándolas (trabajo desperdiciado: el cliente ya colgó, el servidor sigue computando).
- *T+2 min:* cada llamante reintenta 3 veces. Peor: hay retries en **capas apiladas** — la librería HTTP reintenta 3×, y el servicio llamante reintenta 2× la operación completa = hasta 6 requests por request original. El RPS sobre perfiles se multiplica ×4-×6 con la capacidad reducida. Sus colas de threads/conexiones se llenan; ahora **todo** responde lento o se rechaza, incluidos los requests que habrían ido bien.
- *T+5 min:* la saturación sube un nivel: los llamantes tienen sus propios threads bloqueados esperando a perfiles, sus pools se agotan y empiezan a fallar para *sus* llamantes, que también reintentan. El fallo se propaga por el grafo de dependencias como sobrecarga, no como error limpio.
- *T+10 min:* rollback de perfiles desplegado. **Y no se recupera.** Motivos: (a) los pods nuevos del rollback arrancan fríos y reciben instantáneamente todo el tráfico retenido+reintentos → mueren por sobrecarga antes de calentarse (herd sincronizado); (b) las caches (locales y compartidas) de datos de perfil expiraron durante la caída → cada request va a la BD → la BD se convierte en el nuevo cuello; (c) colas intermedias acumularon trabajo que ahora se drena de golpe. El sistema está en un **fallo metaestable**: la sobrecarga sostiene la sobrecarga; el trigger original ya no existe.
- *T+40 min:* intentos de "escalar más pods" mejoran poco (los pods nuevos también nacen fríos bajo fuego). Lo que finalmente funciona: **load shedding brutal** — rechazar en el edge el 80% del tráfico hacia los flujos afectados (fail fast con 503+Retry-After), dejar que el núcleo se estabilice y caliente caches, y readmitir tráfico en escalones de 10-20%.

**Hipótesis descartadas durante el incidente:** "es la BD" (era víctima, no causa: su carga era inducida por los misses de caché); "el rollback no se aplicó bien" (sí se aplicó; el trigger ya no importaba); "necesitamos más réplicas" (añadir capacidad fría a un herd la devora sin resolver el bucle).

**Root cause (multi-nivel, como debe ser):** el trigger fue la regresión de latencia, pero el **root cause sistémico** es una arquitectura sin control de sobrecarga: retries multiplicativos sin presupuesto ni jitter, sin circuit breakers, timeouts incoherentes (el llamante esperaba 500 ms pero reintentaba hasta 6×: presión total de 3 s por request), servidores sin shedding (aceptaban trabajo que ya no podían cumplir, incluso trabajo cuyo cliente ya había abandonado) y ninguna palanca de admisión para salir del estado metaestable.

**Fix inmediato vs fix definitivo:**
- *Inmediato (runbook de salida):* palanca de shed load en el edge por flujo; congelar retries (feature flag que los pone a 0 durante incidentes); recuperación por escalones con warmup.
- *Definitivo:* (1) **retry budget por servicio** (p. ej. retries ≤10% del tráfico; si se excede, se dejan de reintentar — Envoy/mallas lo soportan) y política de una sola capa de retries, con deadline propagation (el deadline del request original viaja en la llamada y nadie trabaja pasado el deadline); (2) **backoff exponencial con jitter** en todos los clientes (sin jitter, los reintentos se sincronizan en oleadas — la forma "olas de recuperación y recaída" del enunciado es la firma del no-jitter); (3) **circuit breakers** por dependencia: ante error-rate alto, abrir y fallar rápido con fallback (perfil por defecto/caché stale) en vez de esperar timeouts; (4) **load shedding en servidores** por profundidad de cola/utilización, priorizando por criticidad; (5) caches que sirven stale-while-revalidate para que una degradación no vacíe el escudo de la BD.

**Postmortem y prevención:** blameless, centrado en el sistema: "una regresión de 10 minutos no debe poder costar 2 horas". Acciones verificables: presupuestos de retry y jitter como configuración obligatoria del service template; test de caos que reproduce este escenario (inyectar 2 s de latencia en un servicio central y verificar que el blast radius queda contenido); palanca de shedding ensayada en gamedays; y una gráfica de "tráfico ofrecido vs tráfico útil" por servicio para ver la amplificación de retries en tiempo real.

**Qué espera oír el entrevistador:** la matemática de amplificación de retries en capas; trabajo desperdiciado tras el timeout del cliente; por qué el rollback no basta (metaestabilidad, caches frías, herds sincronizados); el shed-load como única salida y la readmisión gradual; y el paquete completo de prevención — budgets, jitter, breakers, deadline propagation, shedding — como propiedades del sistema, no parches del servicio culpable.

---
## 4. Datos inconsistentes entre el servicio de pedidos y el de inventario (saga rota)
**Categoría:** Consistencia distribuida · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Soporte reporta un goteo de casos raros: pedidos confirmados cuyo stock nunca se descontó (luego hay oversell), y al revés, stock descontado de pedidos que aparecen como cancelados. Son ~30 casos/día sobre 80K pedidos. Pedidos e inventario son servicios separados que se coordinan con eventos. No hay errores llamativos en los logs. Investiga y arregla."

### 📝 Respuesta resumen
Firma clásica de **saga rota**: la coordinación pedidos↔inventario por eventos tiene pasos que pueden fallar o duplicarse sin compensación fiable. Sospechosos habituales: publicar el evento **fuera de la transacción** de BD (dual write: se confirma el pedido pero el evento nunca sale, o sale y el commit falla), consumidores **no idempotentes** ante reentregas, compensaciones que también pueden fallar sin reintento, y eventos consumidos fuera de orden. Diagnóstico: construir una **conciliación** que compare pedidos vs movimientos de inventario y clasifique los casos; con la clasificación, cada tipo de divergencia delata su bug. Fix definitivo: **transactional outbox** en ambos lados, consumidores idempotentes (dedupe por event_id / clave natural), compensaciones con reintento+DLQ, y la conciliación se queda como detector permanente.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **Cuantificar y clasificar antes de teorizar.** Query de conciliación cruzando ambos servicios: para cada pedido confirmado en las últimas 48 h, ¿existe su decremento en inventario, exactamente uno? Y a la inversa: cada decremento, ¿tiene pedido confirmado vivo? Resultado esperado: tres poblaciones — (A) pedido confirmado sin decremento; (B) decremento sin pedido vivo (pedido cancelado); (C) decrementos duplicados. Cada población es un bug distinto; mezclarlos en una sola investigación es lo que ha tenido al equipo a ciegas ("no hay errores llamativos" porque son goteos de casos borde, no fallos masivos).
2. **Trazar 5-10 casos de cada tipo end-to-end** (trace id / order id a través de logs de ambos servicios y del broker): ¿se publicó el evento? ¿se consumió? ¿cuántas veces? ¿en qué orden relativo a otros eventos del mismo pedido?
3. **Confirmar mecanismos.** Hallazgos típicos que se esperan reconstruir:
   - *Población A (pedido sin decremento):* el order service hace `commit` del pedido y **después** publica `OrderConfirmed` al broker. Si el proceso muere o el broker falla entre commit y publish (deploys, OOM kills — correlacionar los casos con horas de deploy suele ser revelador), el evento se pierde para siempre. Dual write, el pecado original.
   - *Población B (decremento huérfano):* el flujo de cancelación publica `OrderCancelled` y el inventario debe compensar (reponer stock). La compensación falló (timeout, bug de deserialización con cierto payload) y el mensaje acabó descartado tras N reintentos **sin DLQ ni alerta** — o la cancelación llegó y se procesó **antes** que la confirmación (out-of-order: el pedido quedó cancelado, pero el `OrderConfirmed` rezagado descontó stock después).
   - *Población C (duplicados):* el broker reentregó (rebalanceo de consumer group, timeout de ack) y el consumidor de inventario no es idempotente: dos decrementos del mismo evento.

**Hipótesis descartadas:** *bug de UI/doble click* (los duplicados tienen el mismo event_id — es reentrega, no doble emisión); *corrupción de datos en BD* (los datos son internamente consistentes en cada servicio; la inconsistencia es solo *entre* servicios — eso apunta a la coordinación, no al almacenamiento); *carrera en el stock por concurrencia de compra* (eso daría oversell bajo carga, no el patrón bidireccional observado).

**Root cause:** la saga pedidos↔inventario está construida sobre tres supuestos falsos: que publicar tras el commit es atómico (no lo es), que el broker entrega exactamente una vez y en orden (entrega al-menos-una-vez y el orden solo se garantiza por partición/clave, y los eventos del pedido no comparten clave de partición), y que las compensaciones no fallan (fallan, y en silencio). Con 80K pedidos/día, incluso probabilidades del 0.01% por paso producen exactamente el goteo observado de ~30 casos/día.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* (1) script de conciliación + reparación semiautomática (repone/descuenta con revisión humana) para drenar el backlog de soporte; (2) añadir dedupe rápido en el consumidor de inventario (tabla `processed_events(event_id)` consultada/insertada en la misma transacción que el decremento); (3) DLQ con alerta para toda compensación fallida — deja de haber fallos silenciosos desde el día uno.
- *Definitivo:* (1) **transactional outbox** en ambos servicios: el evento se inserta en la tabla outbox en la misma transacción que el cambio de estado; un relay (o CDC/Debezium) lo publica con at-least-once — se elimina el dual write; (2) **idempotencia por diseño**: consumidores con dedupe transaccional por `event_id`, y operaciones naturalmente idempotentes donde se pueda (estado absoluto o versión, no solo deltas); (3) **orden por clave**: todos los eventos de un pedido a la misma partición (key = order_id), y el consumidor valida transiciones (un `OrderConfirmed` sobre un pedido `CANCELLED` no aplica el decremento: máquina de estados también en el consumidor); (4) decidir explícitamente orquestación (un saga orchestrator con timeouts y estados visibles) vs coreografía reforzada — con más de dos servicios en la saga, la orquestación gana en depurabilidad; (5) la **conciliación pasa de herramienta de incidente a control permanente** (job horario, métrica de divergencias con alerta en >0 sostenido).

**Postmortem y prevención:** la lección estructural: **at-least-once + idempotencia + outbox + conciliación** es el kit mínimo de cualquier pareja de servicios que se coordinan por eventos; ninguno de los cuatro es opcional. Prevención: checklist de diseño para nuevos flujos event-driven (¿outbox? ¿dedupe? ¿DLQ con alerta? ¿qué pasa out-of-order? ¿quién concilia?), tests de integración que matan el proceso entre commit y publish y verifican la recuperación, y chaos testing de reentregas/desorden en staging.

**Qué espera oír el entrevistador:** clasificación de las divergencias como primer paso (cada población = un bug); identificar el dual write como pecado capital; reentrega y out-of-order como propiedades normales del broker que el diseño debe absorber; compensaciones que fallan en silencio como agujero de la saga; el kit outbox+idempotencia+DLQ+conciliación; y que la conciliación se institucionaliza como detector permanente.

---

## 5. La caché se cayó y la base de datos no aguantó
**Categoría:** Resiliencia / Caching · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Nuestro cluster de Redis (caché de lecturas del catálogo y sesiones) sufrió un fallo de red de 90 segundos. En cuanto volvió, la plataforma entera cayó durante 40 minutos: la base de datos se saturó, los servicios agotaron timeouts y hubo que apagar tráfico para recuperar. La caché tenía un hit-rate del 98%. Explica la mecánica exacta de la caída, por qué duró 40 minutos si Redis solo estuvo caído 90 segundos, y cómo se diseña para que esto no pase."

### 📝 Respuesta resumen
Con 98% de hit-rate, la BD estaba dimensionada para el **2%** del tráfico de lectura: la caída de Redis multiplicó su carga **×50 instantáneamente** — no hay BD que absorba eso. Mecánica: misses masivos → BD saturada → queries lentas → pools y threads agotados → timeouts y retries que amplifican → colapso. Duró 40 minutos porque al volver Redis estaba **vacío**: el hit-rate no vuelve al 98% hasta repoblarse, y repoblarse exige exactamente las lecturas a BD que la están matando (**cache stampede** sostenido + dogpiling: miles de requests concurrentes recomputando las mismas keys). Diseño resiliente: request coalescing (una sola recomputación por key), TTL con jitter, stale-while-revalidate, warmup previo a readmitir tráfico, réplicas de caché, y una BD/plan de shedding dimensionados asumiendo que la caché **va a fallar**.

### 📖 Respuesta detallada

**La mecánica exacta (se espera narración causal precisa):**
1. *T+0 (Redis inaccesible):* el 100% de lecturas va a la BD, que operaba cómoda al ~30% sirviendo el 2% del tráfico. Ahora recibe ×50: la cola de queries crece, la latencia pasa de 5 ms a segundos.
2. *T+10 s:* los servicios tienen N conexiones/threads; con queries de segundos, todos quedan ocupados. Nuevas peticiones esperan el pool → timeouts hacia arriba → clientes y servicios reintentan → más carga aún (amplificación). Las sesiones también estaban en Redis: cada request además intenta revalidar sesión → logout masivo o más queries.
3. *T+90 s (Redis vuelve, vacío):* aquí está la clave del enunciado. El sistema no se recupera porque el hit-rate es ~0%: **cada** key popular provoca un miss, y no uno — **miles simultáneos** de la misma key (dogpiling): 5.000 requests concurrentes de la misma ficha de producto lanzan 5.000 queries idénticas a la BD, la primera aún no ha terminado cuando llegan las otras 4.999. La BD sigue igual de saturada que sin caché, así que las recomputaciones tardan, así que la caché se puebla lentísimo, así que el hit-rate sube a paso de tortuga: **bucle metaestable**. Los reintentos y el tráfico retenido lo realimentan.
4. *T+40 min:* la salida real fue apagar tráfico (shedding involuntario y tardío): con poco tráfico, la BD respira, las keys calientes se pueblan, el hit-rate sube, y se readmite carga. Eso es exactamente lo que un diseño resiliente hace de forma automática y ordenada.

**Hipótesis descartadas en el análisis:** *"la BD está mal dimensionada, hay que agrandarla"* — dimensionar la BD para el 100% del tráfico haría inútil la caché económicamente; el problema no es el tamaño sino la ausencia de amortiguadores en la transición. *"Redis necesita más nodos"* — más nodos no evitan un fallo de red ni el problema del arranque en frío. *"Fue el fallo de red"* — el trigger, no la causa; 90 s de trigger produjeron 40 min de caída: la diferencia es toda del diseño.

**Root cause:** arquitectura con la caché como **single point of failure implícito**: ningún mecanismo limitaba la concurrencia de recomputación (sin coalescing ni locks por key), sin capacidad de servir stale, sin warmup, con retries amplificando y sin load shedding automático. El hit-rate del 98% —celebrado como éxito— era la medida exacta de la dependencia: cuanto mejor la caché, más letal su ausencia si no se diseña la transición.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* (1) runbook de recuperación con warmup: tras una caída de caché, **no** readmitir tráfico completo hasta precargar el top-N de keys calientes (se conocen por las métricas de acceso) con scripts de precarga; (2) palanca de shedding por porcentaje en el edge; (3) `statement_timeout` agresivo en BD y colas de conexión acotadas para que la BD falle rápido en vez de arrastrarse.
- *Definitivo:*
  1. **Request coalescing / single-flight:** ante miss de una key, solo una petición recomputa (lock por key o patrón singleflight); el resto espera el resultado o recibe stale. Convierte 5.000 queries idénticas en 1. Es la contramedida más rentable de toda la lista.
  2. **Stale-while-revalidate + servir stale ante error:** las entradas expiradas se sirven mientras se refrescan en background; si la BD sufre, mejor catálogo de hace 5 minutos que catálogo caído.
  3. **TTL con jitter** para que las expiraciones no se sincronicen (stampedes programadas en miniatura).
  4. **Redundancia de la caché:** réplicas/multi-AZ para que "Redis caído del todo" sea raro, y caché local L1 pequeña en cada servicio (los top-100 items absorben una fracción enorme del tráfico y sobreviven a la caída del L2).
  5. **Circuit breaker hacia la BD + shedding automático:** cuando la BD supera umbrales, los servicios degradan (stale, respuestas parciales, 503 selectivo) en vez de encolar; las sesiones ganan un fallback (token firmado stateless o re-login suave) para no acoplar auth a la caché.
  6. **Gameday que apaga Redis en producción controladamente** — la única prueba real de todo lo anterior.

**Postmortem y prevención:** métrica nueva de riesgo: "factor de amplificación si la caché falla" (tráfico total / tráfico que hoy llega a BD) con umbral y revisión; presupuesto de capacidad de BD para sobrevivir en modo degradado (con coalescing + stale, no se necesita ×50, quizá ×3); y el warmup como paso obligatorio del runbook de recuperación de caché. Lección citable del postmortem: *una caché con 98% de hit-rate no es un optimizador, es una dependencia crítica, y las dependencias críticas se diseñan con plan de fallo.*

**Qué espera oír el entrevistador:** el cálculo ×50 del hit-rate invertido; por qué 90 s se convierten en 40 min (frío + stampede + metaestabilidad); dogpiling y su solución exacta (single-flight); stale como herramienta de resiliencia y no como defecto; warmup antes de readmitir; y la reflexión de que el éxito de la caché es la medida del riesgo.

---

## 6. El canary pasó todas las métricas pero rompió a un cliente enterprise
**Categoría:** Deploys / Observabilidad segmentada · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Desplegamos una versión nueva del API de pedidos con canary al 5% durante 2 horas: error-rate, latencia p50/p99 y métricas de negocio globales, todo verde. Promovimos al 100%. Seis horas después, nuestro mayor cliente enterprise (8% de la facturación) escala por su TAM: sus integraciones llevan horas fallando. Ninguna alerta saltó. ¿Qué falló en el proceso de canary y cómo lo rediseñas?"

### 📝 Respuesta resumen
Falló el **análisis agregado**: el cliente enterprise usa el API de forma minoritaria pero distinta (un endpoint concreto, un campo legacy, un patrón batch), y su tráfico es un % tan pequeño del total que su 100% de errores queda enterrado en el agregado global (0.3% de subida de error-rate no dispara nada) — o directamente el canary al 5% **nunca recibió su tráfico** (afinidad de sesión, ventana de 2 h fuera de su horario de batch). Rediseño: métricas de canary **segmentadas** por cliente-clave/endpoint/versión de API (el error-rate de cada segmento crítico se evalúa por separado), duración y enrutado del canary que garanticen exposición representativa, contract tests con los consumos reales de los top clientes, y alertas por segmento, no solo globales. El agregado es la media; los incidentes viven en las colas de la distribución.

### 📖 Respuesta detallada

**Cronología de diagnóstico (post-escalado del TAM):**
1. **Confirmar y acotar:** logs del cliente concreto (por api_key/client_id): sus llamadas a `POST /orders/bulk` con el campo `legacy_reference` devuelven 422 desde las 14:03 — exactamente la promoción al 100%. El resto de clientes: cero cambios. Con esto la causa está clara en minutos; lo interesante del caso es el porqué del silencio.
2. **¿Por qué ninguna alerta?** Matemática del enmascaramiento: el cliente hace ~2K req/h de 600K/h totales (0.3%). Su fallo total mueve el error-rate global del 0.20% al 0.53% — por debajo del umbral de alerta (1%) y del análisis de canary. **Un segmento puede estar 100% roto y ser invisible en el agregado.**
3. **¿Por qué el canary no lo vio?** Dos posibilidades a verificar (ambas valiosas en la respuesta): (a) el 5% del canary era aleatorio por request y el cliente sí pasó por él, pero su tasa era tan baja que las ~100 requests fallidas no alcanzaron significancia en el análisis automático; o (b) su integración corre en batch nocturno / usa conexiones persistentes con afinidad, y en la ventana de 2 h de la tarde el canary **no vio ni una request suya**: cobertura cero del caso que iba a romper.
4. **Root cause del bug en sí:** la versión nueva endureció la validación (o eliminó un campo deprecado) rompiendo un contrato que ese cliente aún usaba — deprecación anunciada quizá, pero sin telemetría de "quién sigue usando esto".

**Hipótesis descartadas:** *problema en el lado del cliente* (su tráfico no cambió; los 422 empezaron con la promoción); *incidente de infraestructura* (solo un endpoint+patrón afectado, correlación exacta con el deploy); *el canary estuvo mal implementado técnicamente* (funcionó como se diseñó — el diseño era el problema).

**Root cause (proceso, en tres capas):** (1) **observabilidad no segmentada**: ninguna métrica por cliente-clave ni por endpoint con umbrales propios; (2) **canary sin representatividad garantizada**: ni el enrutado ni la duración aseguraban exponer los patrones de tráfico críticos (batch nocturnos, clientes con afinidad); (3) **contrato sin verificación**: se cambió comportamiento del API sin contract tests derivados del uso real de los clientes importantes ni telemetría de uso de campos deprecados.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* rollback (o feature flag que restaura la validación anterior para ese cliente); disculpa con detalle técnico al cliente; barrido proactivo: ¿algún otro cliente usa el patrón roto y no ha escalado aún? (los logs lo dicen — encontrarlos antes de que llamen vale oro).
- *Definitivo:*
  1. **Métricas segmentadas de serie:** error-rate y latencia etiquetados por `client_tier`/`client_id` (top-N clientes), `endpoint` y `api_version`. Alertas por segmento: "cliente enterprise con error-rate >5% durante 10 min" pita aunque el global esté perfecto. El análisis de canary compara **cada segmento** contra su línea base, no el agregado.
  2. **Canary representativo:** duración que cubra los ciclos de tráfico relevantes (si hay batches nocturnos, el canary vive una noche); verificación de cobertura ("¿el canary recibió tráfico de los top-20 clientes y de todos los endpoints?" — si no, el veredicto es "sin datos", que no es "verde"); para clientes ultra-críticos, anillos de despliegue donde entran al final (ring 0: internos → ring 1: general → ring 2: enterprise).
  3. **Contratos como artefacto:** consumer-driven contract tests generados del tráfico real (los patrones de los top clientes se graban y se reproducen contra cada candidata en CI); telemetría de uso por campo/parámetro para que "deprecado" signifique "verificado sin uso", no "anunciado hace 6 meses".
  4. **Proceso:** cambios de contrato del API requieren revisión con checklist propia (¿quién usa esto hoy? — respondida con datos).

**Postmortem y prevención:** la frase que debe quedar escrita: **"verde global no implica verde para cada cliente; el canary valida lo que ve, y hay que garantizar que ve lo que importa"**. Acciones con dueño: dashboard segmentado por top clientes (semana 1), cobertura de canary como gate automático (mes 1), contract tests de los 20 mayores clientes (trimestre). Métrica de seguimiento: incidentes detectados por clientes vs por alertas — el objetivo es que este tipo de fallo lo encuentre una alerta segmentada antes que un TAM.

**Qué espera oír el entrevistador:** la matemática del enmascaramiento (100% de un segmento = ruido en el agregado); las dos formas de fallo del canary (sin exposición vs sin significancia) y que "sin datos ≠ verde"; segmentación por cliente/endpoint como requisito de observabilidad, no lujo; anillos y duración representativa; contract testing alimentado por tráfico real; y sensibilidad de negocio (8% de facturación merece telemetría propia).

---
## 7. Duplicación de cobros a clientes
**Categoría:** Pagos / Idempotencia · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Finanzas detecta un pico de contracargos y soporte recibe quejas: a ~400 clientes se les cobró dos veces el mismo pedido durante la tarde de ayer. Ayer hubo una degradación de red de 20 minutos entre nuestros servicios y la pasarela de pagos. El equipo de pagos jura que 'usamos idempotency keys'. Investiga la cadena completa, encuentra dónde se rompió la idempotencia y propón el arreglo end-to-end."

### 📝 Respuesta resumen
"Usamos idempotency keys" casi siempre significa "en un tramo de la cadena". El doble cobro requiere que **algún eslabón reintente con una key distinta** o fuera del alcance de la key. Sospechosos ordenados: el frontend genera nueva key por reintento/re-render (dos intentos = dos keys = dos cobros "correctos" para el backend); un consumidor de cola reprocesa el mensaje de cobro tras la reentrega y la key se genera **dentro** del handler (nueva por ejecución); timeout hacia la pasarela tratado como fallo → se reintenta como **cargo nuevo** en vez de consultar el estado del primero; o el failover a un segundo proveedor sin resolver el estado en el primero. Fix end-to-end: key generada **una sola vez en el origen** (por intención de compra), persistida y propagada por toda la cadena; timeout = estado desconocido → consultar antes de reintentar; y conciliación diaria con la pasarela como detector.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **Tomar 20 casos y reconstruir la cadena de cada cobro duplicado** con trace ids: ¿los dos cargos de la pasarela tienen la misma idempotency key o distinta? Esta única pregunta bifurca todo el diagnóstico:
   - **Keys distintas** → alguien generó dos intenciones donde había una. Buscar hacia arriba: ¿el cliente/web envió dos requests con keys distintas? ¿un consumidor procesó dos veces el mensaje generando key nueva cada vez?
   - **Key igual, dos cargos** → la pasarela falló en deduplicar (raro pero posible: ventana de dedupe expirada, o el "mismo" cargo difería en amount/params y la pasarela lo trató como operación distinta) o hubo dos proveedores implicados.
2. **Correlacionar con la degradación de red.** El patrón esperado: durante los 20 minutos, las llamadas a la pasarela sufrían timeouts. Trace típico del duplicado: `POST /charge` (key A) → timeout a los 3 s → **el cargo sí se completó en la pasarela** (el timeout fue nuestro, no suyo) → nuestro código lo marcó `FAILED` → reintento (automático o del usuario al ver "error, intenta de nuevo") → nuevo `POST /charge` con **key B** → segundo cargo. La degradación de red no causó el bug: lo **reveló**. El bug (reintento con key nueva tras timeout) estaba latente.
3. **Auditar dónde nace y muere la key en el código:** ¿quién la genera (frontend, backend, handler de cola)? ¿con qué alcance (por intención de compra o por request HTTP)? ¿se persiste antes del primer intento? ¿se propaga en los reintentos de *todas* las capas (cliente HTTP con retry automático incluido)? Hallazgo típico: el backend genera la key al recibir la petición de checkout — así que cuando el frontend reintenta su llamada al backend, el backend genera **otra** key. La idempotencia existía... con el alcance equivocado.

**Hipótesis descartadas:** *fraude/ataque* (los duplicados son del mismo usuario, mismo pedido, con segundos de diferencia, concentrados en la ventana de degradación); *bug de la pasarela* (sus logs muestran dos requests con keys distintas: hizo exactamente lo que se le pidió); *doble click de usuarios* (existe como fuente menor, pero la concentración temporal apunta a los reintentos por timeout — y de todos modos el doble click también debe ser inocuo por diseño).

**Root cause:** la idempotencia estaba implementada **por tramo y no por intención**: keys generadas en el backend por request (no en el origen por intención de compra), timeouts hacia la pasarela tratados como fallo definitivo (cuando son resultado desconocido), y reintentos —humanos y automáticos— que legítimamente creaban "operaciones nuevas". En cadenas de pago, la idempotencia es una propiedad **end-to-end**: la key debe nacer con la intención (un checkout del usuario), persistirse, y ser la misma en cada reintento de cualquier capa hasta la pasarela. Un solo eslabón que regenere la key rompe toda la cadena.

**Fix inmediato vs fix definitivo:**
- *Inmediato (horas):* (1) identificar todos los afectados con una conciliación contra la pasarela (cargos con mismo `order_id`/tarjeta/importe en <30 min) y **reembolsar proactivamente antes de que lleguen más contracargos** (cada contracargo cuesta fee + reputación con el adquirente); comunicación a los afectados; (2) parche defensivo: verificación pre-cargo ("¿existe ya un cargo exitoso para este order_id?") aunque sea con una ventana corta — imperfecto pero corta la hemorragia; (3) desactivar reintentos automáticos hacia la pasarela hasta que traten el timeout correctamente.
- *Definitivo:*
  1. **Key con alcance de intención, generada en el origen:** el cliente (o el primer backend que materializa la intención) genera la key al crear la sesión de checkout, se persiste con el pedido, y **todos** los reintentos —click del usuario, retry del cliente HTTP, reproceso de cola— reutilizan la misma. En consumidores de cola: la key viaja **dentro del mensaje**, jamás se genera en el handler.
  2. **Timeout = desconocido:** tras timeout, prohibido reintentar a ciegas; primero `GET` del estado del cargo por key/referencia (las pasarelas lo ofrecen). Máquina de estados con `PENDING_UNKNOWN` como estado real y un job que lo resuelve.
  3. **Idempotencia también en nuestro lado:** el endpoint de cobro registra la key con constraint de unicidad **antes** de llamar a la pasarela; un segundo request con la misma key espera/devuelve el resultado del primero (nunca ejecuta en paralelo: lock o estado `IN_PROGRESS`).
  4. **Conciliación diaria automática** con los reportes de la pasarela (nuestros cargos vs los suyos, por key y por importe): detecta duplicados, huérfanos y discrepancias en horas en vez de esperar contracargos (que tardan días y cuestan dinero).
  5. Test de caos en CI/staging: inyectar timeouts en el cliente de la pasarela y verificar cero duplicados con reintentos agresivos.

**Postmortem y prevención:** el pico de contracargos fue el detector — el más caro y lento posible; la conciliación diaria pasa a ser el detector primario con métrica propia (duplicados detectados = alerta, objetivo 0). Documento de arquitectura de pagos con las tres reglas grabadas: *la key nace con la intención, el timeout no es un fallo, y la conciliación no es opcional*. Revisión de todos los flujos de dinero (refunds, payouts, suscripciones) contra la misma checklist, porque el patrón raramente está roto en un solo sitio.

**Qué espera oír el entrevistador:** la pregunta bisagra "¿mismas keys o distintas en la pasarela?"; que el timeout es resultado desconocido y el incidente solo reveló un bug latente; el concepto de alcance de la key (intención vs request vs ejecución de handler); reembolso proactivo como decisión de negocio correcta; conciliación como detector estructural; y la generalización a todos los flujos de dinero.

---

## 8. Funciona en staging pero degrada en producción
**Categoría:** Entornos / Metodología · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Una feature nueva del servicio de búsqueda+listado pasó QA y staging sin problemas: latencias de ~80 ms. En producción, el mismo código responde en 900 ms p95 y empeora con las horas, hasta requerir reinicios periódicos. 'En staging funciona' es la frase de la semana. Staging corre en instancias más pequeñas con una BD del 2% del tamaño de producción y sin tráfico concurrente real. Estructura el diagnóstico: ¿qué clases de diferencias entorno-a-entorno pueden explicar esto y cómo confirmas cuál es?"

### 📝 Respuesta resumen
"Funciona en staging" solo demuestra que el código es correcto **a escala de staging**. Las diferencias que explican degradación solo-en-producción caen en cuatro clases: **datos** (volumen: un query plan que era index scan con 100K filas se vuelve otro con 50M; distribución: skew y clientes-ballena que no existen en staging), **concurrencia** (contención de locks, pools, N+1 amplificado que solo duele con tráfico real), **entorno** (config distinta, límites de memoria/CPU, versiones o parámetros de BD diferentes) y **estado acumulado** (caches, fragmentación, conexiones — coherente con el "empeora con las horas y se cura reiniciando"). Método: comparar el plan de ejecución de las queries clave en ambos entornos con `EXPLAIN ANALYZE`, perfilar en producción el desglose de los 900 ms, y buscar la deriva temporal (¿qué recurso crece con las horas?). Root cause típico: query nueva sin índice adecuado que la BD pequeña perdonaba + N+1 + memoria que crece. Fix definitivo: staging jamás validará rendimiento — validarlo donde están la escala y los datos: canary con métricas y datasets realistas.

### 📖 Respuesta detallada

**Estructura de diagnóstico (el entrevistador evalúa el método):**

*Paso 1 — Descomponer los 900 ms.* Con tracing distribuido (o a falta de él, logs de timing por capa): ¿dónde viven los 820 ms de diferencia? ¿Query a BD (lo más probable con una BD 50× mayor)? ¿Llamadas a otros servicios? ¿CPU propio (serialización de respuestas enormes)? ¿Espera de pool? Sin este desglose todo lo demás es adivinar. Supongamos el hallazgo típico: 700 ms en BD, y sube con las horas.

*Paso 2 — La sospecha nº1 con BD 50× más grande: el plan de ejecución.* `EXPLAIN ANALYZE` de las queries de la feature **en ambos entornos**. Clásico: en staging (100K filas) el optimizador hace un scan que es barato; en producción (50M filas, otras estadísticas) elige un plan distinto —o el mismo plan se vuelve O(n) doloroso— porque **falta el índice que la query nueva necesita**, o hay skew (el 20% de las filas son de un cliente-ballena y el plan promedio es pésimo para él). La feature "funcionaba" porque a 100K filas *todo* funciona.

*Paso 3 — El factor concurrencia.* Staging se probó con requests secuenciales. En producción, la query lenta × 200 concurrentes = pool de conexiones agotado (espera de pool que se suma a la latencia), buffers de BD presionados, y locks si la feature también escribe (p. ej. contadores de vistas: 200 updates concurrentes a filas calientes que en secuencial jamás contienden). Revisar también el patrón N+1: 1+3 queries con datos de staging pueden ser 1+300 con entidades reales (colecciones más pobladas) — invisible en pruebas pequeñas, mortal a escala.

*Paso 4 — La deriva temporal ("empeora con las horas, se cura reiniciando").* Esto acusa a **estado acumulado en el proceso**: fuga de memoria (heap/RSS creciendo → GC cada vez más agresivo → latencia; confirmar con métricas de GC y memoria por pod), caché local sin límite de tamaño creciendo hasta presionar memoria, conexiones/file descriptors goteando, o fragmentación. Correlacionar la curva de latencia con la curva de memoria/GC del proceso: si van juntas, confirmado. Nada de esto aparece en staging porque staging ni tiene el tráfico que llena la caché ni corre el tiempo suficiente.

*Paso 5 — Diferencias frías de entorno (verificación rápida en paralelo):* diff de config efectiva (flags, tamaños de pool, límites de contenedor — un límite de memoria menor en producción con la misma configuración de heap produce OOM-throttling), versión y parámetros de la BD, presencia de sidecars/proxies. Barato de comprobar, elimina una clase entera de hipótesis.

**Hipótesis descartadas (con su porqué):** *"producción tiene hardware peor"* — al revés, es mayor; el problema escala con datos/tráfico, no con CPU base. *"Es la red de producción"* — la latencia extra vive dentro de la BD según el tracing. *"Otro servicio degrada el nuestro"* — los tiempos de llamadas salientes a servicios no cambiaron.

**Root cause (compuesto, como suele ser):** (1) query de la feature sin índice compuesto adecuado — el plan era aceptable con el dataset de staging e insostenible con el de producción; (2) N+1 en la capa de acceso a datos amplificado por el tamaño real de las colecciones; (3) caché local introducida por la feature **sin límite de entradas**, creciendo indefinidamente con la cardinalidad real de producción (que staging nunca alcanza) → presión de memoria → GC → deriva. Tres bugs, ninguno visible a escala 2%.

**Fix inmediato vs fix definitivo:**
- *Inmediato:* crear el índice (online/`CONCURRENTLY`); acotar la caché (max entries + TTL); si hace falta esta noche: feature flag off o reinicios programados mientras llega el fix (con honestidad de que es un parche).
- *Definitivo:* (1) resolver el N+1 (batch/join); (2) revisar planes de las queries nuevas contra datos a escala **antes** de producción; (3) política de caches locales siempre acotadas.

**Postmortem y prevención (la parte de proceso, que aquí es el corazón):** la conclusión estructural no es "arreglar staging" a base de clonarlo todo (carísimo y aun así nunca idéntico), sino **reasignar qué valida cada entorno**: staging valida corrección funcional; el **rendimiento se valida donde está la escala** — (a) canary en producción con análisis automático de latencia (que aquí habría atrapado los 900 ms al 5% de exposición), (b) pruebas de las queries nuevas contra un dataset clonado/anonimizado de tamaño real (aunque sea solo la BD, no todo el entorno), (c) load tests con concurrencia realista para features de ruta caliente, y (d) soak test de horas para deriva de memoria antes de promover. Además: presupuesto de queries por endpoint (alerta si un endpoint pasa de 3 a 300 queries) y revisión de `EXPLAIN` como parte del checklist de PR para queries nuevas.

**Qué espera oír el entrevistador:** la taxonomía de diferencias (datos/concurrencia/entorno/estado) en vez de hipótesis sueltas; descomponer la latencia antes de teorizar; `EXPLAIN` comparado entre entornos y el rol de las estadísticas/cardinalidad; la deriva temporal como firma de estado acumulado; y la conclusión madura de proceso: staging no puede validar rendimiento — canary, datasets reales y soak tests sí.

---
## 9. Una dependencia externa (pasarela de pagos) está lenta y arrastra todo el sistema
**Categoría:** Resiliencia / Aislamiento de fallos · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Nuestra pasarela de pagos principal está sufriendo una degradación: responde, pero en 8-15 segundos en vez de 300 ms. No está caída, así que ningún health check falla. En una hora, no solo el checkout está afectado: el catálogo, la búsqueda y hasta el login van lentos o dan errores, y varios servicios están reiniciándose por health checks fallidos. ¿Cómo es posible que una dependencia lenta de UN flujo degrade TODO, cómo estabilizas ahora mismo, y cómo rediseñas para que no vuelva a pasar?"

### 📝 Respuesta resumen
**Una dependencia lenta es más peligrosa que una caída**: el fallo rápido libera recursos; la lentitud los **retiene**. Mecánica del contagio: las llamadas a la pasarela pasan de 300 ms a 12 s → los threads/conexiones del servicio de checkout quedan ocupados 40× más tiempo → sus pools se agotan → los servicios que comparten runtime, pools o instancias con ese tráfico (o que llaman a checkout) empiezan a encolar → el event loop/threadpool común se bloquea y hasta el endpoint de health responde tarde → Kubernetes mata pods sanos-pero-atascados → menos capacidad → peor. Estabilización inmediata: timeouts agresivos hacia la pasarela + circuit breaker (fail fast) + degradar el checkout (cola de pagos diferidos o mensaje honesto) para liberar recursos. Rediseño: **bulkheads** (pools y capacidad dedicados por dependencia), timeouts con deadline en toda llamada externa, breakers con half-open, fallbacks por flujo y health checks que distinguen "vivo" de "atascado en una dependencia".

### 📖 Respuesta detallada

**La mecánica del contagio (núcleo de la respuesta — hay que saber narrarla):**
1. *El recurso retenido.* Cada request de checkout mantiene ocupado un thread (o conexión, o slot de concurrencia) durante la llamada a la pasarela. A 300 ms y 50 req/s, hay ~15 llamadas en vuelo. A 12 s, se necesitan **600 slots concurrentes** para el mismo tráfico (ley de Little: L = λ×W): ningún pool está dimensionado para eso. El pool (p. ej. 100 threads) se agota en segundos.
2. *El desbordamiento lateral.* El servicio de checkout no solo procesa pagos: sirve otros endpoints (consultar pedido, aplicar cupón) **desde el mismo pool**. Con el pool secuestrado por llamadas de 12 s, *todos* sus endpoints hacen cola. Primer salto del contagio: de "la pasarela" a "todo el servicio".
3. *La propagación por el grafo.* Los servicios que llaman a checkout (frontend BFF, carrito) también retienen sus threads esperando las respuestas lentas → sus pools se agotan → sus *otros* endpoints (catálogo, búsqueda si comparten BFF) degradan. Cada nivel del grafo repite el patrón. Con retries por timeout, además se multiplica el tráfico.
4. *El golpe de gracia: los health checks.* El endpoint `/health` corre en el mismo runtime saturado → responde en 6 s → liveness probe falla → Kubernetes reinicia pods que estaban sanos pero atascados → los pods nuevos arrancan fríos, heredan el mismo tráfico envenenado y vuelven a atascarse → oleadas de reinicios que reducen capacidad neta. La plataforma se está matando a sí misma por diagnóstico erróneo automatizado.

**Por qué ningún monitor lo vio venir:** los health checks median "responde/no responde" (respondía), y las alertas de la pasarela median error-rate (no daba errores: daba lentitud). La latencia de dependencias externas o no se median o no tenían umbral de alerta. *Lento es el nuevo caído, y es más difícil de detectar.*

**Estabilización inmediata (orden de acciones en el incidente):**
1. **Timeout agresivo ya:** bajar el timeout hacia la pasarela a 2-3 s (vía config dinámica idealmente). Efecto inmediato: los threads se liberan 5× antes; el fallo se vuelve barato.
2. **Circuit breaker / kill switch del flujo:** abrir el circuito hacia la pasarela — fail fast sin consumir slot. El checkout pasa a modo degradado explícito: *(a)* encolar la orden con pago diferido ("te confirmaremos el cobro en unos minutos" — el pedido se acepta, el cargo se procesa async cuando la pasarela mejore, con idempotencia), o *(b)* failover al proveedor secundario si existe, o *(c)* mensaje honesto de indisponibilidad **solo en el paso de pago**, con el resto de la plataforma intacta.
3. **Parar la auto-destrucción:** relajar temporalmente los liveness probes (o subir sus timeouts) para frenar las oleadas de reinicios mientras dura la saturación.
4. Con los recursos liberados, catálogo/búsqueda/login se recuperan solos en minutos: eran víctimas del secuestro de recursos, no del problema de pagos.

**Hipótesis descartadas al inicio del incidente:** "nos atacan" (el tráfico entrante es normal); "problema de BD" (la BD está tranquila — las esperas están en llamadas HTTP salientes, visible en los traces/thread dumps: decenas de threads en la misma llamada externa); "bug del último deploy" (no hubo; la correlación es con la latencia de la pasarela, visible en el dashboard del proveedor o en nuestras métricas de cliente HTTP).

**Root cause sistémico:** ausencia total de **aislamiento de fallos entre flujos**: recursos compartidos sin compartimentar (un solo pool para todos los endpoints), timeouts por defecto de las librerías (30-60 s o infinitos), sin circuit breakers, sin fallback definido para el flujo de pago, y health checks que confunden "proceso vivo" con "dependencias sanas". El barco no tenía mamparos: una vía de agua en la sala de pagos inundó todas las cubiertas.

**Fix definitivo (el rediseño):**
1. **Bulkheads:** pool de conexiones/concurrencia **dedicado y acotado por dependencia externa** (máx. N llamadas concurrentes a la pasarela; la N+1 falla rápido o encola con límite). Si la pasarela se degrada, se lleva su compartimento, no el barco. En plataformas grandes: deployments separados para flujos críticos (los pods de checkout no sirven catálogo).
2. **Timeouts y deadlines en toda llamada externa:** presupuesto por request end-to-end propagado (deadline propagation); timeout por dependencia coherente con el presupuesto (si el usuario espera 3 s, la pasarela no puede tener timeout de 10 s). Ningún cliente HTTP con default infinito — regla lintada en el service template.
3. **Circuit breakers con half-open** en toda dependencia externa, con métricas y alertas del estado del circuito (un breaker que se abre es un evento de operación).
4. **Fallbacks diseñados por flujo, decididos con producto**: pago diferido asíncrono (la joya de este caso: convierte "no vendemos" en "cobramos luego"), proveedor secundario, o degradación honesta y localizada.
5. **Health checks de dos niveles:** liveness barato y sin dependencias (¿el proceso responde?) vs readiness que sí considera dependencias (¿debo recibir tráfico?). Nunca reiniciar por lentitud de una dependencia externa.
6. **Alertas de latencia (no solo error-rate) por dependencia externa**, con líneas base; y gamedays inyectando latencia (no caída: latencia) a dependencias de prueba — este incidente exacto es el escenario de chaos engineering más rentable que existe.

**Postmortem y prevención:** mapa de dependencias externas con su criticidad, timeout, breaker y fallback documentados (una tabla; las celdas vacías son el backlog); la latencia de terceros entra en los SLO internos como riesgo explícito; y contrato/SLA con el proveedor revisado (créditos por degradación, no solo por downtime — los proveedores adoran esa asimetría).

**Qué espera oír el entrevistador:** la ley de Little aplicada (por qué 40× de latencia exige 40× de concurrencia); el contagio narrado por niveles incluyendo el fratricidio de los health checks; "lento es peor que caído" con la explicación de recursos retenidos; la secuencia de estabilización (timeout → breaker → degradar → frenar reinicios); bulkheads como concepto central del rediseño; y el fallback de pago diferido como solución de negocio, no solo técnica.

---

## 10. Pérdida de mensajes entre dos servicios detectada por conciliación
**Categoría:** Mensajería / Auditoría de datos · **Tipo:** [CASO] Incidente en producción

### 🎯 Enunciado
"Un analista detecta que el data warehouse reporta 1.2M envíos preparados este mes, pero el servicio de facturación solo registró 1.19M facturas: faltan ~10.000 (0.8%). El flujo es: `shipping-service` publica `ShipmentCompleted` a Kafka y `billing-service` consume y factura. No hay errores en los dashboards de ninguno de los dos y el lag del consumidor es ~0. Lleva meses pasando. Encuentra dónde se pierden los mensajes, recupera lo perdido y rediseña el pipeline para que la pérdida sea imposible de reintroducir en silencio."

### 📝 Respuesta resumen
Los mensajes pueden perderse en cuatro tramos: **antes de publicar** (el dual write: shipping comitea en su BD pero muere antes de publicar, o publica con `acks=0/1` y fire-and-forget sin comprobar el resultado), **en el broker** (retención vencida antes de consumir, pérdida de réplica con `acks=1`, unclean leader election), **en el consumo** (auto-commit de offset **antes** de procesar: el mensaje se marca leído y el proceso muere procesándolo; o excepciones tragadas por un catch silencioso), y **después** (procesado pero el commit de la factura falla sin retry). El método: conciliación con IDs concretos (no solo conteos) para obtener la **lista exacta** de mensajes perdidos, y luego rastrear una muestra por cada tramo para localizar la fuga. Recuperación: re-emisión idempotente desde la fuente. Rediseño: outbox en el productor, `acks=all`, commit de offset **después** de procesar, DLQ con alerta, y la conciliación productor-vs-consumidor como control continuo con presupuesto de discrepancia cero.

### 📖 Respuesta detallada

**Cronología de diagnóstico:**
1. **De conteos a identidades.** "Faltan 10.000" no es accionable; la primera tarea es la lista exacta: extraer los `shipment_id` de shipping (fuente) y hacer anti-join contra los facturados en billing. Con la lista: ¿los IDs perdidos siguen un patrón? ¿Uniformes en el tiempo o en ráfagas? ¿Correlacionan con deploys, rebalanceos del consumer group, picos de tráfico, un tipo de envío concreto? El patrón temporal es el mejor delator: **ráfagas coincidiendo con deploys/reinicios** apuntan al tramo productor (muerte entre commit y publish) o al consumidor (offsets comiteados sin procesar durante shutdowns no-graceful); **goteo uniforme** apunta a un catch silencioso con cierto tipo de payload; **un bloque contiguo antiguo** apunta a retención del broker vencida durante una pausa larga del consumidor.
2. **Rastrear una muestra por tramos.** Para 20 IDs perdidos: ¿está el evento en el log del broker? (consultar por timestamp+partición si la retención lo permite). Si **nunca llegó al broker** → tramo productor. Si está en el broker pero billing no lo tiene → tramo consumidor. Esta bisección simple evita semanas de especulación.
3. **Hallazgos típicos que componen el 0.8%** (en incidentes reales suele ser más de una fuga):
   - *Productor:* publica **después** del commit de BD, fire-and-forget (no espera confirmación del broker, no loguea fallos del callback) y con `acks=1`: los deploys de shipping (2-3/semana × meses) pierden los eventos en vuelo de cada shutdown; algún fallo de broker con `acks=1` perdió los no replicados.
   - *Consumidor:* auto-commit de offsets por intervalo: en cada rebalanceo/deploy, los mensajes leídos-pero-no-procesados quedan con offset comiteado = perdidos sin error. Además, un `catch` genérico que loguea a nivel `debug` y continúa (mensajes con un campo nulo de un caso borde de shipping): pérdida silenciosa continua. El lag ~0 es coherente con todo esto — **el lag mide lo no-leído, no lo no-procesado**; es la métrica que daba falsa tranquilidad.
4. **Confirmación:** reproducir en staging matando el productor entre commit y publish, y matando el consumidor entre poll y proceso con auto-commit activo. Ambos reproducen pérdida sin ningún error en dashboards.

**Hipótesis descartadas:** *"Kafka pierde mensajes"* — con `acks=all` y consumo correcto, Kafka prácticamente no pierde; la pérdida estaba en los dos extremos, que es donde casi siempre está; *"el warehouse cuenta mal"* — se validó su conteo contra la BD transaccional de shipping (coinciden: la fuente es shipping y el agujero está aguas abajo); *"duplicados en shipping inflan el conteo"* — el anti-join por ID único lo descarta.

**Root cause:** el pipeline se construyó asumiendo el camino feliz en cada tramo: publicación no atómica con el estado (dual write) y sin confirmación, consumo con auto-commit (at-most-once de facto donde el negocio exigía at-least-once), excepciones tragadas sin DLQ, y **ninguna verificación end-to-end**: cada equipo monitorizaba su servicio (verde) y nadie monitorizaba la propiedad del sistema ("todo envío completado genera exactamente una factura"). Por eso duró meses: la observabilidad por-servicio no detecta agujeros entre servicios.

**Recuperación de lo perdido:** re-emisión desde la fuente de verdad (la BD de shipping) de los 10.000 eventos con un job one-shot, hacia el mismo tópico con el mismo esquema. Requisito previo: asegurar que billing es **idempotente** (dedupe por `shipment_id`) para que re-emitir de más sea inocuo — de hecho, conviene re-emitir con margen. Cuantificar el impacto financiero (10K facturas × importe medio) para el negocio, y revisar si hay obligación de facturar con retroactividad limitada (plazo legal) — hay dinero irrecuperable que el postmortem debe reconocer.

**Fix definitivo (por tramo, cerrando cada fuga):**
1. *Productor:* **transactional outbox** — el evento se escribe en la tabla outbox en la misma transacción que el estado del envío; un relay/CDC publica con reintentos y `acks=all`, `enable.idempotence=true` en el productor Kafka. Ya no existe "comiteé pero no publiqué".
2. *Broker:* `replication.factor=3`, `min.insync.replicas=2`, `unclean.leader.election=false`; retención dimensionada para sobrevivir a la pausa de consumo más larga imaginable (días, no horas).
3. *Consumidor:* commit de offset **manual y después de procesar** (at-least-once real); dedupe transaccional por `shipment_id` (junto al insert de la factura) para absorber los duplicados que el at-least-once trae; toda excepción → retry con backoff → **DLQ con alerta y dueño** (prohibido el catch-and-continue por convención lintada).
4. *Sistema:* la **conciliación pasa a control continuo**: job diario que compara IDs fuente vs destino con ventana móvil, métrica `missing_count` con alerta en >0 sostenido, y dashboard end-to-end del flujo (emitidos vs facturados por hora). La propiedad de negocio tiene ahora un monitor con su nombre.

**Postmortem y prevención:** la lección exportable: **cada handoff asíncrono entre servicios necesita un dueño de la propiedad end-to-end y una conciliación que la verifique** — los dashboards por servicio son necesarios pero estructuralmente ciegos a los agujeros entre cajas. Auditar los demás flujos event-driven de la empresa con la misma checklist (outbox, acks, commit posterior, DLQ, conciliación): esta clase de bug nunca vive en un solo pipeline.

**Qué espera oír el entrevistador:** pasar de conteos a lista de IDs y leer los patrones temporales; la bisección productor/broker/consumidor con una muestra; que lag≈0 no significa nada sobre pérdida (mide lo no-leído); las dos fugas clásicas (dual write y auto-commit) y el catch silencioso; re-emisión idempotente como recuperación; y la conciliación institucionalizada como monitor de una propiedad de negocio, no como script de un incidente.
