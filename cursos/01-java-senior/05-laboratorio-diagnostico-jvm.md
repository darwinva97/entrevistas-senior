# Módulo 5 · Laboratorio de diagnóstico JVM

> **Curso 01 · Java senior** · 180 min · Práctica pura. Este módulo *es* la preparación para [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md)

## Cómo usar este módulo

No se lee: se ejecuta. Cada escenario sigue el mismo ciclo:

```
reproducir el síntoma → medir → hipótesis → confirmar → arreglar → verificar → escribir 5 líneas
```

Las "5 líneas" son tu material de entrevista. Cuando te pregunten *"cuéntame un problema difícil que resolviste"*, no querrás improvisar.

## Runbook: los comandos, en orden de uso

```bash
# 0. Antes de tocar nada: ¿qué proceso, qué versión, qué flags?
jcmd -l                                   # PIDs de JVMs
jcmd <pid> VM.flags                       # flags efectivas (no las que crees)
jcmd <pid> VM.system_properties
jcmd <pid> VM.uptime

# 1. Salud general
jstat -gcutil <pid> 1000 20               # E S O M CCS YGC YGCT FGC FGCT
jcmd <pid> GC.heap_info
top -H -p <pid>                           # hilos por CPU (convierte el TID a hex para el dump)

# 2. Evidencia (¡ANTES de reiniciar!)
jcmd <pid> Thread.print > threads.txt     # thread dump; toma 3 con 10s de separación
jcmd <pid> GC.heap_dump /dumps/h.hprof    # heap dump (pausa el proceso: saca el pod del LB)
jcmd <pid> JFR.start duration=120s filename=/dumps/r.jfr settings=profile

# 3. Perfilado en caliente (sin safepoint bias)
./profiler.sh -d 60 -e cpu   -f cpu.html   <pid>     # async-profiler
./profiler.sh -d 60 -e alloc -f alloc.html <pid>     # quién asigna memoria
./profiler.sh -d 60 -e lock  -f lock.html  <pid>     # contención de locks
./profiler.sh -d 60 -e wall  -t -f wall.html <pid>   # dónde se espera (I/O)

# 4. Red y conexiones (cuando el problema no está en la JVM)
ss -tanp | awk '{print $1}' | sort | uniq -c         # ESTABLISHED / CLOSE-WAIT / TIME-WAIT
```

**Regla de oro:** el `-e wall` de async-profiler es el que resuelve los casos de "CPU baja, latencia alta": muestra dónde se *espera*, no dónde se consume CPU. Poca gente lo menciona en entrevistas.

---

## Escenario 1 · Memory leak: el heap crece hasta OOM cada 3 días

**Monta:** servicio Spring con un `static Map<String, byte[]> cache` sin límite, alimentado por petición. Carga con `hey -z 10m -c 20`.

**Diagnóstico esperado:**
1. `jstat -gcutil`: Old sube monótonamente; los Full GC recuperan cada vez menos → **memoria viva creciente, no basura**.
2. Heap dump → Eclipse MAT → *Leak Suspects* → *dominator tree* → `path to GC roots (excluding weak refs)`.
3. Confirmación: el mapa retiene el 80% del heap.

**Arreglo y verificación:** caché con límite y TTL (Caffeine con `maximumSize` y `expireAfterWrite`), o mover a Redis. Verifica: 30 min de carga con el Old estable en sierra.

**Variantes que debes probar:** `ThreadLocal` sin `remove()` en un pool; listener no desregistrado; `ClassLoader` retenido (OOM de Metaspace).

---

## Escenario 2 · p99 alto con p50 normal

**Monta:** endpoint normal + 5% de peticiones que hacen una consulta sin índice sobre 5M de filas. Añade heap pequeño para que el GC haga ruido.

**Diagnóstico esperado:**
1. Histograma de latencia por endpoint: ¿el p99 es de *todos* los endpoints o de uno?
2. Cruza con GC (`-Xlog:gc*` y pausas) → si las pausas explican los picos, es GC; si no, sigue.
3. Traza distribuida → el tiempo se va en la BD.
4. `EXPLAIN (ANALYZE, BUFFERS)` de la consulta lenta.
5. Si nada de eso: `-e wall` para ver esperas, y `-e lock` para contención.

**Sospechosos habituales (memorízalos):** pausas de GC, contención de lock, pool agotado, consulta sin índice, TLS handshake por conexión (falta keep-alive), DNS sin caché, warmup del JIT tras el deploy, vecino ruidoso/CPU throttling en el contenedor.

**Extra de alto valor:** comprueba `container_cpu_cfs_throttled_seconds_total`. Un límite de CPU bajo produce *throttling* que se ve como picos de latencia inexplicables, con la CPU "al 40%".

---

## Escenario 3 · Thread pool exhaustion: Tomcat no responde con CPU al 10%

**Monta:** `server.tomcat.threads.max=20`, un endpoint que llama a un servicio con 5 s de latencia.

**Diagnóstico:** tres thread dumps seguidos → casi todos los hilos `http-nio-*` en `WAITING`/`TIMED_WAITING` en el mismo `socketRead`. **Mismo stack en muchos hilos = una dependencia lenta.** La CPU baja es la firma: no hay trabajo, hay espera.

**Arreglo:** timeout en el cliente HTTP, bulkhead para esa dependencia, circuit breaker por lentitud y —si el modelo lo permite— pasar a virtual threads o a un cliente reactivo. Verifica que otros endpoints siguen respondiendo (ese es el objetivo real: aislamiento).

---

## Escenario 4 · Deadlock intermitente

**Monta:** dos servicios que toman `lockA`/`lockB` en orden inverso bajo carga.

**Diagnóstico:** `jcmd Thread.print` incluye la sección `Found one Java-level deadlock` con los dos hilos y los monitores. Si no aparece pero hay bloqueo, sospecha de deadlock de *recursos* (pool de conexiones, semáforo), que la JVM no detecta.

**Arreglo:** orden global de adquisición, `tryLock` con timeout, o rediseño para no necesitar dos locks. Prevención: no llamar a código ajeno con un lock tomado (*open calls*).

---

## Escenario 5 · Full GC de varios segundos y pods reiniciados

**Monta:** heap 512 MB, carga que asigna mucho, liveness probe con `timeoutSeconds: 1`.

**Diagnóstico:** el log de GC muestra Full GC de 3 s; justo ahí Kubernetes marca el liveness como fallido y reinicia. La firma es "reinicios sin OOM y sin errores en logs de aplicación".

**Arreglo:** más heap / menos asignación (mira `-e alloc`), colector adecuado, y **probes con margen** (`timeoutSeconds`, `failureThreshold` acordes al peor GC). Discute por qué liveness no debe ser sensible a una pausa transitoria.

---

## Escenario 6 · HikariCP agotado

**Monta:** pool de 5, transacción larga con I/O dentro (ver [módulo 3](03-spring-por-dentro-y-transacciones.md)).

**Diagnóstico:** `Connection is not available, request timed out after 30000ms` + métricas `hikaricp_connections_pending` altas. Cruza con `pg_stat_activity` para ver qué hacen las conexiones activas (`idle in transaction` es el veredicto: transacciones abiertas sin trabajo).

**Arreglo:** sacar el I/O de la transacción, `leakDetectionThreshold=20000` para cazar conexiones no devueltas, dimensionar por la ley de Little.

---

## Escenario 7 · Metaspace tras varios redeploys

**Monta:** genera clases dinámicamente en bucle (ByteBuddy/CGLIB) o redespliega un WAR en el mismo Tomcat varias veces.

**Diagnóstico:** `jstat -gcutil` columna M creciente; `jcmd <pid> VM.classloader_stats` y `GC.class_stats`; en MAT busca `ClassLoader` retenidos y quién los referencia (a menudo un `ThreadLocal` de un hilo del contenedor, un shutdown hook o un driver JDBC registrado).

---

## Cómo narrar un caso en la entrevista (plantilla)

> **Contexto** (1 frase: servicio, escala, impacto) → **Síntoma con números** → **Qué medí primero y qué descartó** → **Hipótesis y confirmación** → **Contención inmediata** → **Causa raíz** → **Fix estructural** → **Qué añadí para que no vuelva a pasar** (alerta, límite, test).

Dos minutos. Cronométrate. Si tardas cinco, sobra la mitad del contexto.

## ✅ Autoevaluación final del curso 01

1. Te dan acceso SSH a un pod con un servicio que "va lento". Enumera tus primeros 5 comandos y qué esperas de cada uno.
2. ¿Qué evidencia capturas antes de reiniciar un proceso enfermo y en qué orden?
3. Muchos hilos con el mismo stack en `socketRead`: ¿qué concluyes?
4. ¿Cómo distingues un problema de GC de uno de contención de locks?
5. ¿Por qué la CPU baja es un dato *positivo* para el diagnóstico y no una señal de salud?

## 🎯 Preguntas del banco que ya puedes responder

Los **15 casos** de [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md), y con ellos los casos equivalentes de [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md).

---

**Anterior:** [Módulo 4](04-kafka-y-patrones-distribuidos.md) · **Siguiente:** [Módulo 6 · Quarkus y compilación nativa](06-quarkus.md)
