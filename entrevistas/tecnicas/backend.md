# ⚙️ Entrevista técnica · Backend

> Simulacro por niveles. Lee **solo la pregunta**, responde en voz alta y cronometrada, y después compárate con las tres capas. Formato explicado en [cómo funcionan los simulacros](../README.md).

## Qué evalúan en cada nivel

| Nivel | Lo que buscan | Lo que te descarta |
|---|---|---|
| **Junior** | Fundamentos correctos, honestidad, criterio básico de calidad | Inventar, no saber depurar nada |
| **Semi-senior** | Autonomía y conocimiento de los errores clásicos | Responder solo con nombres de librerías |
| **Senior** | Trade-offs, datos, comportamiento en producción | "Depende" sin desarrollar; cero números |
| **Staff** | Impacto más allá del equipo: coste, riesgo, migraciones, estándares | Diseñar sin restricciones de negocio |

## Guion típico (60 minutos)

```
 5 min · presentación y contexto de tu experiencia
15 min · fundamentos del lenguaje y de datos
20 min · diseño de una funcionalidad o API
15 min · caso de producción (troubleshooting)
 5 min · tus preguntas
```

---

## Nivel junior

### P1. ¿Qué diferencia hay entre `PUT` y `POST`, y por qué importa?

**Qué evalúan:** si entiendes HTTP como contrato y no como "el verbo que puse en el framework".

**❌ Lo que NO debes decir**

> "POST es para crear y PUT para actualizar."

**Por qué está mal:** es la regla memorizada, y es incompleta hasta el punto de ser falsa. `PUT` puede crear (si el cliente decide el identificador) y `POST` puede modificar. La distinción real es **idempotencia**: repetir un `PUT` deja el mismo estado; repetir un `POST` crea otro recurso. Quien no menciona la idempotencia no puede razonar sobre reintentos, que es el problema real.

**⚠️ Respuesta aceptable**

> "`POST` no es idempotente y suele crear un recurso nuevo; `PUT` reemplaza un recurso en una URL conocida y es idempotente, así que repetirlo no cambia el resultado."

**Qué le falta:** la consecuencia práctica. Está bien memorizado, pero no dice *para qué* sirve saberlo.

**✅ Respuesta ideal**

> "La diferencia que importa es la idempotencia: repetir un `PUT` sobre `/pedidos/123` deja el mismo estado, mientras que repetir un `POST /pedidos` crea dos pedidos. Eso decide qué puedo reintentar con seguridad cuando hay un timeout, que es lo que pasa a menudo en producción. Por eso, cuando necesito un `POST` seguro ante reintentos, añado una cabecera `Idempotency-Key` que el servidor guarda con el resultado; si llega repetida, devuelve la misma respuesta en vez de duplicar."

**Por qué funciona:** conecta la teoría con un problema real (timeouts y reintentos) y aporta una solución concreta. En un junior, esto sube expectativas de inmediato.

**🔁 Repregunta probable:** *"¿Y `PATCH`?"* → "No es idempotente por definición: depende de la operación. `{"stock": 5}` sí lo es; `{"stock": {"incrementar": 1}}` no."

📚 [Curso 07 · Diseño de contratos](../../cursos/07-apis-y-versionado/01-diseno-de-contratos.md)

---

### P2. Tienes una consulta que tarda 3 segundos. ¿Cómo la investigas?

**Qué evalúan:** si tienes método o si "pruebas cosas".

**❌ Lo que NO debes decir**

> "Le agrego un índice a las columnas del `WHERE` y listo."

**Por qué está mal:** es una solución antes del diagnóstico. Puede que ya haya un índice y no se use (por una función sobre la columna, por tipos distintos o porque el planificador estima mal), puede que el problema sea que traes 200.000 filas, o un `N+1` desde la aplicación. Además, añadir índices tiene coste en cada escritura: proponerlo a ciegas indica que no piensas en trade-offs.

**⚠️ Respuesta aceptable**

> "Ejecutaría un `EXPLAIN` para ver si hace *sequential scan* y, según eso, crearía el índice que falte o reescribiría la consulta."

**Qué le falta:** medir antes que suponer (`EXPLAIN ANALYZE` da tiempos reales, no estimaciones), mirar cuántas filas devuelve, y comprobar si el problema está en la consulta o en cómo la usa la aplicación.

**✅ Respuesta ideal**

> "Primero acoto: ¿siempre tarda o solo con ciertos parámetros? Luego `EXPLAIN (ANALYZE, BUFFERS)` para ver el plan real, cuántas filas estima frente a las que devuelve y si lee de disco o de caché. Si hay *seq scan* sobre una tabla grande, miro por qué no usa el índice: a veces existe pero no se puede usar porque hay una función sobre la columna o un tipo distinto. También compruebo cuántas filas estoy trayendo, porque muchas veces el problema no es la consulta sino que pido 50.000 registros para mostrar 20. Y si la consulta suelta es rápida pero el endpoint es lento, sospecho de un N+1 desde el ORM."

**Por qué funciona:** hay método (acotar → medir → hipótesis), muestra que conoce las causas de que un índice no se use, y menciona el N+1, que es el problema real más frecuente.

**🔁 Repregunta probable:** *"¿Cómo detectas el N+1?"* → "Contando las sentencias que lanza una petición: activando el log de SQL o con las estadísticas del ORM. Un listado de 200 elementos que lanza 201 consultas es la firma."

📚 [Curso 01 · Spring y transacciones](../../cursos/01-java-senior/03-spring-por-dentro-y-transacciones.md) · [Banco: N+1 con JPA](../../java-microservicios/03-casos-y-problemas.md)

---

## Nivel semi-senior

### P3. Dos peticiones simultáneas compran la última unidad de stock. ¿Cómo lo evitas?

**Qué evalúan:** si entiendes concurrencia sobre datos compartidos. Es *la* pregunta de semi-senior.

**❌ Lo que NO debes decir**

> "Leo el stock, verifico que sea mayor que cero y lo actualizo. Con eso ya no se puede vender de más."

**Por qué está mal:** es exactamente el bug (*lost update*). Entre tu lectura y tu escritura, otra transacción hace lo mismo: ambas leen 1, ambas creen que hay stock, ambas venden. El nivel de aislamiento por defecto de PostgreSQL (*Read Committed*) **no** te protege de esto. Decirlo con seguridad es peor que dudar.

**⚠️ Respuesta aceptable**

> "Usaría una transacción con un `SELECT ... FOR UPDATE` para bloquear la fila mientras la actualizo, así la segunda petición espera."

**Qué le falta:** está bien y funciona, pero no menciona la alternativa más barata (una actualización condicional atómica), ni el coste del bloqueo pesimista bajo alta concurrencia, ni qué pasa con las reservas que nunca se confirman.

**✅ Respuesta ideal**

> "El error clásico es leer, comprobar y escribir en la aplicación: eso pierde actualizaciones porque entre la lectura y la escritura se cuela otra transacción, y Read Committed no lo impide. Lo más simple es hacer la comprobación atómica en la base de datos: `UPDATE productos SET stock = stock - 1 WHERE id = ? AND stock >= 1`, y si afecta a cero filas, no había stock. Si necesito bloquear más lógica alrededor, uso `SELECT ... FOR UPDATE`, asumiendo que serializo el acceso a esa fila y eso limita el throughput del SKU caliente. Y si el flujo es un checkout, en vez de descontar al añadir al carrito prefiero una reserva con TTL: reservo al iniciar el pago, confirmo al cobrar y libero por expiración."

**Por qué funciona:** nombra el fallo (*lost update*), da la solución barata primero, la cara después con su coste, y sube un nivel al proponer el patrón de reserva. Eso ya suena a senior.

**🔁 Repregunta probable:** *"¿Y si el stock está en Redis por rendimiento?"* → "Entonces necesito una operación atómica ahí (`DECR` o un script Lua) y aceptar que la fuente de verdad se reparte: hay que reconciliar con la base de datos y decidir qué pasa si Redis cae."

📚 [Curso 00 · Consistencia y CAP](../../cursos/00-fundamentos-distribuidos/02-consistencia-y-cap.md) · [Banco: carrito con inventario](../../casos-de-estudio/01-system-design.md)

---

### P4. ¿Cómo comunicas dos microservicios: HTTP o mensajería?

**Qué evalúan:** criterio de acoplamiento. Es una pregunta de diseño disfrazada de pregunta de tecnología.

**❌ Lo que NO debes decir**

> "Kafka, porque es asíncrono y escala mejor."

**Por qué está mal:** responde con una tecnología a una pregunta de diseño, y "escala mejor" es un eslogan. Además ignora el coste operativo real de Kafka y el hecho de que muchos flujos necesitan una respuesta inmediata. Un entrevistador leerá que has copiado la arquitectura de una charla.

**⚠️ Respuesta aceptable**

> "Depende: si necesito la respuesta al momento uso HTTP, y si no, una cola. Para eventos que interesan a varios servicios usaría un broker."

**Qué le falta:** es correcto pero genérico. No dice qué pierde con cada opción ni cómo lo decide con un caso concreto.

**✅ Respuesta ideal**

> "Lo decido por si el llamante necesita el resultado para continuar. Si el usuario está esperando una respuesta —¿tiene saldo?, ¿existe este cliente?— va síncrono. Todo lo que es efecto secundario —enviar el correo, actualizar analítica, notificar a facturación— va asíncrono, porque así el fallo del otro servicio no rompe mi operación. El coste que asumo es que cada dependencia síncrona me resta disponibilidad: cinco servicios al 99,9% en cadena dan 99,5%, que son horas al mes. Y el coste de lo asíncrono es que necesito consumidores idempotentes y una DLQ, porque la entrega es *at-least-once*. En una cosa soy estricto: nunca escribo en la base de datos y publico el evento en la misma función esperando atomicidad; eso es un *dual write* y uso el patrón outbox."

**Por qué funciona:** criterio explícito, número que respalda el argumento, y menciona idempotencia y outbox, que es lo que distingue a quien ha operado esto.

**🔁 Repregunta probable:** *"¿Cola o log de eventos?"* → "Si necesito releer el histórico o que varios consumidores lean el mismo flujo de forma independiente, log (Kafka). Si es reparto de trabajo con reintentos y prioridades, una cola normal es más simple de operar."

📚 [Curso 00 · Mensajería e idempotencia](../../cursos/00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

---

## Nivel senior

### P5. Un servicio empezó a responder lento y toda la plataforma se degradó. ¿Qué hacemos?

**Qué evalúan:** si sabes que el problema no es el servicio lento, sino la amplificación.

**❌ Lo que NO debes decir**

> "Escalamos horizontalmente el servicio lento y ponemos reintentos para que no fallen las llamadas."

**Por qué está mal:** los reintentos son precisamente lo que convierte un problema local en una caída global (*retry storm*): si cada cliente reintenta 3 veces, el servicio ahogado recibe el triple de carga. Y escalar no ayuda si el cuello es la base de datos, un lock o una dependencia externa: solo añades más clientes compitiendo por el mismo recurso.

**⚠️ Respuesta aceptable**

> "Miraría métricas y logs para encontrar el servicio culpable, y mientras tanto reiniciaría los pods afectados o haría rollback del último deploy."

**Qué le falta:** el rollback no basta cuando el sistema entró en un fallo metaestable: el bucle de reintentos y colas se sostiene solo aunque desaparezca la causa. Falta la idea de romper el bucle y de aislar.

**✅ Respuesta ideal**

> "Separo dos cosas: contener y entender. Para contener, lo primero es romper el bucle de realimentación: cortar o limitar los reintentos, activar *load shedding* para rechazar rápido lo que no puedo atender, y degradar funcionalidad no crítica con un feature flag. Un sistema en fallo metaestable no se recupera solo aunque revierta el deploy, porque ahora la causa es la cola de trabajo acumulada. Para entender, miro qué cambió a esa hora y sigo el tiempo con trazas: normalmente la firma es un servicio con p99 alto y CPU baja, es decir, espera. Después, lo estructural: timeouts explícitos y decrecientes hacia dentro, reintentos solo en una capa con jitter y presupuesto, breaker que abra también por lentitud —no solo por errores— y bulkheads para que la dependencia lenta no se coma todos los hilos del checkout."

**Por qué funciona:** distingue contención de diagnóstico, nombra el mecanismo (fallo metaestable, amplificación) y da defensas concretas con su porqué.

**🔁 Repregunta probable:** *"¿Por qué el breaker debe abrir por lentitud?"* → "Porque el fallo real casi nunca es una caída limpia: es un servicio que responde en 8 segundos. Si solo cuento errores, el breaker nunca abre mientras mis hilos se agotan."

📚 [Curso 00 · Resiliencia](../../cursos/00-fundamentos-distribuidos/04-resiliencia.md) · [Banco: retry storm](../../casos-de-estudio/02-incidentes-en-produccion.md)

---

### P6. Necesitas renombrar una columna que usan tres servicios, sin downtime. ¿Cómo?

**Qué evalúan:** ejecución real. Aquí se ve quién ha migrado datos en producción.

**❌ Lo que NO debes decir**

> "Programamos una ventana de mantenimiento de madrugada, hacemos el `ALTER` y desplegamos todo junto."

**Por qué está mal:** en un sistema con varios servicios y despliegues independientes, la ventana de mantenimiento es una confesión: significa que no sabes evolucionar el esquema sin parar. Además no es reversible: si el despliegue falla a las 3 a.m., estás con la base migrada y el código viejo.

**⚠️ Respuesta aceptable**

> "Creo la columna nueva, copio los datos, cambio el código para que use la nueva y luego borro la vieja."

**Qué le falta:** el orden y la reversibilidad. Faltan los despliegues intermedios (escribir en ambas), el backfill por lotes, el feature flag para el cambio de lectura y el periodo de gracia antes del `DROP`.

**✅ Respuesta ideal**

> "Expand/contract, de forma que el esquema y el código desplegado nunca sean incompatibles. Primero añado la columna nueva sin tocar nada, que es compatible con todo lo que ya está corriendo. Después despliego código que escribe en ambas y sigue leyendo la vieja, y hago el backfill por lotes vigilando locks y lag de replicación, verificando al final que ambas columnas coinciden. Luego cambio la lectura detrás de un feature flag, que me permite revertir en segundos sin desplegar, y lo dejo así unos días porque los flujos raros tardan en aparecer. Solo entonces dejo de escribir la vieja, y semanas más tarde la elimino, después de comprobar en los logs de consultas y en los repos que nadie la usa. Cada fase es un despliegue independiente y reversible."

**Por qué funciona:** es un procedimiento, no una idea; menciona los riesgos operativos (locks, replicación) y el criterio de reversibilidad, que es lo que realmente preguntan.

**🔁 Repregunta probable:** *"¿Y si el backfill son 200 millones de filas?"* → "Por lotes, reanudable e idempotente, con pausas medidas por el lag de replicación; y estimo la duración antes de empezar, porque una migración de 20 horas necesita poder pararse y continuar."

📚 [Curso 07 · Migraciones sin downtime](../../cursos/07-apis-y-versionado/04-migraciones-sin-downtime.md)

---

### P7. ¿Cómo garantizas que un cobro no se ejecute dos veces?

**Qué evalúan:** idempotencia end-to-end. Si hay una pregunta que define el nivel backend, es esta.

**❌ Lo que NO debes decir**

> "Antes de cobrar consulto si ya existe un cobro para ese pedido; si existe, no cobro."

**Por qué está mal:** es una condición de carrera con nombre propio. Dos peticiones simultáneas consultan a la vez, ninguna ve nada, y ambas cobran. Una comprobación que no está respaldada por una restricción única en la base de datos no es idempotencia: es una suposición.

**⚠️ Respuesta aceptable**

> "Uso una clave de idempotencia: el cliente manda un identificador único y yo guardo en una tabla qué claves ya procesé, para devolver el mismo resultado si se repite."

**Qué le falta:** que la clave y el efecto se persistan **en la misma transacción**, qué se hace si llega la misma clave con otro cuerpo, y —lo más importante— qué pasa cuando la pasarela externa da timeout y no sabes si cobró.

**✅ Respuesta ideal**

> "En tres capas. Primero, el cliente genera una clave de idempotencia por *intención* de pago, no por petición: si el frontend reintenta tres veces, las tres llevan la misma clave. Segundo, el servidor inserta esa clave en una tabla con restricción única **dentro de la misma transacción** que crea el cobro; si ya existía y está completada, devuelve el resultado guardado, y si llega con un cuerpo distinto respondo 422 para no pisar nada. Tercero, y esto es lo que se suele olvidar: hacia la pasarela, un timeout no significa que no haya cobrado. Así que propago mi propia referencia única al proveedor, y ante un timeout consulto el estado por esa referencia antes de reintentar. Encima de todo, conciliación diaria contra el extracto del proveedor, porque en dinero las compensaciones también fallan y quiero enterarme yo antes que el cliente."

**Por qué funciona:** cubre cliente, servidor y tercero; menciona la restricción única (la parte que hace que funcione de verdad) y termina con conciliación, que es la marca de quien ha trabajado con pagos.

**🔁 Repregunta probable:** *"¿Cuánto tiempo guardas las claves?"* → "Lo que dure la ventana de reintentos del cliente más margen; 24–72 horas es habitual, con purga programada. Guardarlas para siempre no aporta y hace crecer la tabla."

📚 [Curso 00 · Mensajería e idempotencia](../../cursos/00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md) · [Banco: sistema de pagos idempotente](../../casos-de-estudio/01-system-design.md)

---

## Nivel staff / principal

### P8. Heredas una plataforma con 40 microservicios y un equipo que despliega una vez al mes. ¿Qué haces?

**Qué evalúan:** si tu impacto va más allá del código. Aquí no buscan arquitectura, buscan criterio.

**❌ Lo que NO debes decir**

> "Lo primero es rehacer la arquitectura: 40 microservicios para ese equipo son demasiados, hay que consolidarlos."

**Por qué está mal:** decides antes de entender, y propones la intervención más cara y arriesgada posible como primer movimiento. Aunque la conclusión acabe siendo correcta, el proceso descalifica: nadie te va a confiar una plataforma si en la primera semana ya quieres reescribirla.

**⚠️ Respuesta aceptable**

> "Hablaría con el equipo para entender los problemas, revisaría el estado de los servicios y priorizaría las mejoras: CI/CD, tests, observabilidad."

**Qué le falta:** medir. Es una respuesta razonable pero sin instrumento: no dice qué mira, ni cómo demuestra el progreso, ni cómo convence al negocio de pagarlo.

**✅ Respuesta ideal**

> "Primero mido, porque 'desplegar una vez al mes' es un síntoma y quiero la causa. Miro cuatro cosas: cuánto tarda un cambio pequeño en llegar a producción, qué porcentaje de despliegues falla, cuánto se tarda en recuperarse y con qué frecuencia hay incidentes. Con esos números hablo con el equipo y casi siempre aparecen dos o tres cuellos concretos: una suite de tests lenta e inestable, despliegues manuales, o miedo porque no hay forma de revertir. Ataco primero el miedo —despliegue reversible y observabilidad decente— porque es lo que desbloquea todo lo demás, y elijo un servicio piloto para demostrarlo en semanas, no un plan de un año. Lo de consolidar servicios lo dejo para cuando tenga datos de qué servicios comparten dueño y cambian siempre juntos: ahí la fusión se justifica sola. Y todo esto lo traduzco a lenguaje de negocio: no vendo 'CI/CD', vendo 'de idea a producción en dos días en vez de un mes'."

**Por qué funciona:** mide antes de actuar, secuencia por desbloqueo, entrega valor pronto y traduce a negocio. Es exactamente el perfil staff.

**🔁 Repregunta probable:** *"¿Y si el equipo se resiste?"* → "Suele ser señal de que la propuesta no resuelve *su* dolor. Empiezo por lo que a ellos les duele —normalmente los tests inestables o las guardias— y me gano el permiso para lo demás."

📚 [Curso 04 · Fiabilidad y costes](../../cursos/04-cloud-y-kubernetes/05-fiabilidad-y-costos.md) · [Curso 09 · Comunicación](../../cursos/09-tecnica-de-entrevista/01-como-comunicar.md)

---

## Rúbrica rápida de autoevaluación

Después del simulacro, puntúa de 1 a 5:

| Dimensión | Qué mirar |
|---|---|
| **Mecanismo** | ¿Expliqué *por qué* funciona o solo *qué* haría? |
| **Trade-off** | ¿Dije el coste de cada decisión? |
| **Números** | ¿Aporté alguna cifra (latencia, rps, disponibilidad)? |
| **Producción** | ¿Mencioné cómo se comporta esto cuando falla? |
| **Concisión** | ¿Menos de 90 segundos por respuesta? |

Menos de 3 en *mecanismo* o *trade-off* significa que estás respondiendo como semi-senior aunque sepas más.
