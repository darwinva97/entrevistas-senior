# Módulo 1 · JVM: memoria, GC y qué mirar cuando duele

> **Curso 01 · Java senior** · 150 min

## Por qué esto importa en la entrevista

Porque es el filtro clásico. Todos saben usar `List`; pocos saben explicar por qué su servicio hace pausas de 3 segundos, por qué el pod consume 2 GB si `-Xmx` es 1 GB, o qué diferencia hay entre un `OutOfMemoryError: Java heap space` y uno de `Metaspace`. Estas preguntas separan a quien ha operado JVMs de quien solo las ha programado.

## Modelo mental: el proceso no es solo el heap

```
Proceso Java (RSS que ve Kubernetes)
├── Heap (-Xmx)                 ← objetos; lo que gestiona el GC
├── Metaspace                   ← metadatos de clases (fuera del heap, nativo)
├── Code cache                  ← código compilado por el JIT
├── Stacks de hilos (-Xss × N)  ← 1 MB por hilo por defecto ⇒ 500 hilos = 500 MB
├── Buffers directos / mapeados ← ByteBuffer.allocateDirect, Netty, mmap
├── GC overhead                 ← RSets, marking bitmaps, estructuras internas
└── Malloc del runtime / JNI
```

**Consecuencia práctica:** poner `-Xmx=limit_del_contenedor` garantiza un OOMKill (código 137) porque falta todo lo demás. Regla: heap ≈ 50–70% del límite del contenedor, o usa `-XX:MaxRAMPercentage=70`. Y verifica siempre con `-XX:NativeMemoryTracking=summary` + `jcmd <pid> VM.native_memory summary` cuando el RSS no cuadre.

> **⚠️ Trampa:** *"el contenedor tiene 2 GB, así que la JVM ve 2 GB"*. Solo desde JDK 10+ con soporte de cgroups activo (`UseContainerSupport`, por defecto). En JDK 8 antiguo la JVM veía la memoria del host y dimensionaba mal el heap: causa clásica de OOMKill inexplicable.

## Generaciones y ciclo de vida de un objeto

```
      asignación
          │
      ┌───▼───┐  copia    ┌──────────┐  copia×N   ┌────────┐
      │ Eden  ├──────────►│ Survivor ├───────────►│  Old   │
      └───────┘           └──────────┘ (tenuring) └────────┘
       barato: TLAB       young GC = STW corto     mixed/full GC = caro
```

- La **hipótesis generacional** (la mayoría de los objetos mueren jóvenes) es la razón de todo este diseño. Un objeto que muere en Eden es *gratis*: no se copia, simplemente no se marca vivo.
- **TLAB** (Thread Local Allocation Buffer): cada hilo asigna en su propio trozo de Eden sin sincronización — asignar en Java cuesta un incremento de puntero.
- **Promoción prematura:** si Eden/Survivor son pequeños o la carga es intensa, objetos que iban a morir acaban en Old y disparan GCs caros. Se ve en los logs como promoción alta y en `jstat -gcutil` como Old creciendo sin parar.
- Los objetos **humongous** (≥ 50% de una región G1) van directos a Old.

## Los colectores, en una tabla que puedes recitar

| Colector | Cuándo | Pausa típica | Coste |
|---|---|---|---|
| **Serial** | contenedores diminutos, 1 CPU | alta | mínimo |
| **Parallel** | batch, throughput puro | alta (segundos con heaps grandes) | mínimo |
| **G1** *(default desde 9)* | 90% de los microservicios | 50–200 ms configurable | write barriers, RSets |
| **ZGC generacional** (21+) | latencia estricta, heaps grandes | < 1 ms | +CPU, +headroom (20–30%) |
| **Shenandoah** | igual que ZGC | < 10 ms | similar |

**Tuning de G1 que suena a experiencia real:**

```bash
java -Xms4g -Xmx4g \                       # iguales: evita resize y sorpresas de RSS
     -XX:MaxGCPauseMillis=150 \            # objetivo, no garantía
     -XX:InitiatingHeapOccupancyPercent=40 \
     -Xlog:gc*,gc+heap=info:file=/var/log/gc.log:time,uptime,level,tags:filecount=5,filesize=20M \
     -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps \
     -jar app.jar
```

Cosas que debes poder justificar: por qué `-Xms = -Xmx` (evita resizes y hace el RSS predecible), por qué bajar `MaxGCPauseMillis` a 10 ms es contraproducente (G1 encoge la young gen → más GCs → menos throughput y a veces peor p99), y por qué el heap dump automático debe estar configurado **antes** del incidente.

## Diagnóstico de GC: qué mirar y en qué orden

1. **¿Cuánto tiempo total en GC?** > 5% ya es señal; > 20% es un servicio enfermo.
2. **¿Pausas largas o frecuentes?** Frecuentes → tasa de asignación alta (mira `alloc` con async-profiler). Largas → live set grande, promoción, o *Full GC*.
3. **¿Aparece "to-space exhausted" / "Evacuation Failure"?** G1 no encontró dónde evacuar: sube el heap, baja el IHOP o revisa picos de asignación.
4. **¿"Humongous allocation" frecuente?** Alguien crea arrays enormes (leer un fichero entero, respuestas gigantes, caché mal diseñada).
5. **¿El Old crece monótonamente entre Full GCs?** Eso es un **leak**, no un problema de tuning. Deja de tocar flags y saca un heap dump.

```bash
jcmd <pid> GC.heap_info          # foto rápida
jstat -gcutil <pid> 1000         # evolución por segundo (E, S, O, M, YGC, FGC)
jcmd <pid> Thread.print          # thread dump (deadlocks, hilos bloqueados)
jcmd <pid> GC.heap_dump /dumps/heap.hprof   # ¡antes de reiniciar!
jcmd <pid> JFR.start duration=120s filename=/dumps/rec.jfr settings=profile
```

## Los cinco `OutOfMemoryError` y qué significa cada uno

| Mensaje | Causa real | Primer paso |
|---|---|---|
| `Java heap space` | leak o heap insuficiente para la carga | heap dump → dominadores en MAT |
| `GC overhead limit exceeded` | >98% del tiempo en GC recuperando <2% | igual que el anterior; casi siempre leak |
| `Metaspace` | fuga de classloaders (redeploys en caliente, proxies, reflection, generación dinámica de clases) | `-XX:MaxMetaspaceSize` + análisis de classloaders |
| `unable to create native thread` | demasiados hilos (pools sin límite) | contar hilos por pool; `jcmd Thread.print` |
| `Direct buffer memory` | buffers nativos no liberados (Netty, NIO) | `-XX:MaxDirectMemorySize`, revisar liberación |

**Anatomía de un leak típico en un servicio Spring:** un `static Map` de caché sin TTL ni límite, listeners nunca desregistrados, `ThreadLocal` no limpiado en un pool de hilos (el hilo vive para siempre, el valor también), o una colección de "métricas" acumuladas en memoria. En MAT: *Leak Suspects*, luego *dominator tree*, y busca el camino GC-root → objeto.

## Referencias, finalizers y `ThreadLocal`

- `SoftReference` para cachés que pueden desaparecer bajo presión (ojo: el GC las limpia tarde, justo antes del OOM, lo que da picos raros); `WeakReference` para asociaciones que no deben impedir la recolección (`WeakHashMap`); `PhantomReference` + `Cleaner` para liberar recursos nativos. `finalize()` está deprecado: nunca lo propongas.
- `ThreadLocal` en un pool de hilos **es una fuga por diseño** si no haces `remove()` en un `finally`. Y con virtual threads, un `ThreadLocal` por tarea deja de tener sentido de caché: usa `ScopedValue` (JDK 21+, preview) para propagar contexto.

## Escape analysis, JIT y por qué tus microbenchmarks mienten

- El JIT (C1/C2) compila en caliente, hace *inlining*, *escape analysis* (puede eliminar la asignación de objetos que no escapan) y elimina código muerto. Un bucle que "mide" algo cuyo resultado no usas puede desaparecer entero.
- **Warmup:** los primeros miles de invocaciones van interpretadas. Por eso el p99 empeora tras cada deploy (ver caso 2 en [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md)) y por eso hay que medir con **JMH**, nunca con `System.nanoTime()` a pelo.
- **Deoptimización:** el JIT asume cosas (un solo tipo implementando una interfaz) y revierte si cambian: causa de latencias raras y no reproducibles.

## Errores comunes que delatan a un no-senior

- Copiar flags de un blog de 2014 (`-XX:+UseParNewGC`, `-XX:+UseConcMarkSweepGC`).
- Poner `-Xmx` igual al límite del contenedor.
- "Llamo a `System.gc()`" — ignórable, y si no lo es, provoca un Full GC.
- Reiniciar el pod ante un OOM sin capturar el heap dump.
- Confundir memoria del heap con RSS.
- Tunear GC cuando el problema es un leak (el GC no arregla objetos vivos).

## 🧪 Laboratorio

1. **Provoca cada OOM.** Escribe cuatro clases minúsculas que revienten por heap, Metaspace (genera clases con ByteBuddy en bucle), hilos y buffers directos. Captura el mensaje exacto de cada una.
2. **Diagnostica el leak:** servicio Spring con un `static List<byte[]>` que crece por petición. Cárgalo con `hey`, observa `jstat -gcutil` hasta el Full GC continuo, saca heap dump y encuentra al culpable en MAT (dominator tree).
3. **Compara colectores:** el mismo servicio con G1 y con ZGC generacional a 4 GB, bajo carga constante. Grafica pausas (del log de GC) y throughput. Escribe en 5 líneas cuál elegirías y por qué.
4. **Rompe el contenedor:** despliega con `-Xmx` = límite del pod y observa el OOMKill 137; arréglalo con `MaxRAMPercentage`.
5. **JFR:** graba 2 minutos bajo carga y responde con la grabación: ¿qué método asigna más memoria? ¿Cuál es el p99 de las pausas?

**Entregable:** tu "runbook de JVM": 10 comandos y qué te dice cada uno.

## ✅ Autoevaluación

1. Tu pod tiene 2 GB de límite y muere con 137 aunque `-Xmx1500m`. ¿Qué está pasando?
2. Explica G1 en 60 segundos: regiones, RSets, marcado concurrente, mixed GC.
3. ¿Cuándo ZGC en vez de G1 y qué sacrificas exactamente?
4. Diferencia entre `Java heap space` y `GC overhead limit exceeded`.
5. ¿Por qué un `ThreadLocal` puede ser un memory leak?
6. ¿Cuál es el primer comando que ejecutas ante un servicio con Full GC continuo y por qué no reinicias?

## 🎯 Preguntas del banco que ya puedes responder

- [`java-microservicios/01-java-core-avanzado.md`](../../java-microservicios/01-java-core-avanzado.md) — 1, 2 (GC), y el trasfondo de 10–11
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 1 (memory leak), 9 (Metaspace), 12 (Full GC y health checks)

---

**Siguiente:** [Módulo 2 · Concurrencia y el Java Memory Model](02-concurrencia-y-jmm.md)
