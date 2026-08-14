# Módulo 4 · Laboratorio: pprof y los casos del banco

> **Curso 03 · Go senior** · 180 min · Práctica pura para [`golang-microservicios/03-casos-y-problemas.md`](../../golang-microservicios/03-casos-y-problemas.md)

## Runbook de diagnóstico

```bash
# Perfiles (con net/http/pprof en :6060)
go tool pprof -http=:8080 http://host:6060/debug/pprof/profile?seconds=30   # CPU
go tool pprof -http=:8080 http://host:6060/debug/pprof/heap                 # memoria viva
go tool pprof http://host:6060/debug/pprof/allocs                          # total asignado
curl -s 'http://host:6060/debug/pprof/goroutine?debug=2' | head -100        # stacks legibles
go tool pprof http://host:6060/debug/pprof/mutex                            # contención (activar antes)
go tool pprof http://host:6060/debug/pprof/block                            # bloqueos (activar antes)

# Activar los perfiles que no están por defecto
runtime.SetMutexProfileFraction(5)
runtime.SetBlockProfileRate(1000)   # ns; cuidado con el overhead

# Trazado del scheduler (el más potente y el menos usado)
curl -o trace.out 'http://host:6060/debug/pprof/trace?seconds=5' && go tool trace trace.out

# Runtime
GODEBUG=gctrace=1 ./app             # ciclos de GC
GODEBUG=schedtrace=1000 ./app       # estado del scheduler cada segundo
GODEBUG=madvdontneed=1 ./app        # devolver memoria al SO antes (runtimes antiguos)
```

**Cómo leer un perfil sin perderte:** en la UI web, `Top` ordenado por *cum* (acumulado) te dice **dónde está el tiempo/memoria**; *flat* te dice **qué función lo consume directamente**. El flamegraph es para ver el camino. En `heap`, `inuse_space` = lo vivo (para leaks), `alloc_space` = lo asignado en total (para presión de GC). Elegir el correcto es media respuesta.

---

## Escenario 1 · Goroutine leak

**Monta:** handler que lanza una goroutine escribiendo en un canal sin búfer, con el lector saliendo por timeout.

**Diagnóstico:** métrica `NumGoroutine` monótona creciente → `goroutine?debug=2` → miles de goroutines con **el mismo stack** en la línea del envío al canal. Esa agrupación es la prueba: no necesitas leer código, el perfil te da el fichero y la línea.

**Arreglo:** búfer 1 o propagación de `ctx`. **Verificación:** carga de 10 min con `NumGoroutine` estable + `goleak` en el test.

---

## Escenario 2 · RSS crece, heap pequeño

Reproduce lo del [módulo 2](02-runtime-memoria-y-gc.md): 200.000 goroutines, `sync.Pool` grande, o un pico pasado que dejó el heap fragmentado.

**Diagnóstico:** compara `inuse_space` del heap con el RSS; usa `runtime/metrics`: `/memory/classes/heap/objects` (vivo), `/heap/free`, `/heap/released`, `/os-stacks`. Si `StackSys` es enorme → goroutines. Si `HeapIdle - HeapReleased` es enorme → memoria retenida sin devolver.

**Arreglo:** `GOMEMLIMIT`, reducir goroutines, `debug.FreeOSMemory()` como parche puntual (nunca como solución).

---

## Escenario 3 · p99 degradado: ¿GC o contención?

**Diagnóstico en tres medidas:**
1. `GODEBUG=gctrace=1`: si el %CPU de GC es alto y los ciclos frecuentes → tasa de asignación (usa `allocs` para ver quién asigna).
2. Perfil de `mutex`/`block`: si domina una función, es contención.
3. `go tool trace`: la vista *Scheduler latency* muestra goroutines listas esperando P — señal de que `GOMAXPROCS` o el throttling del contenedor te están limitando.

Este escenario entrena la habilidad más valiosa: **descartar con datos** en vez de acumular hipótesis.

---

## Escenario 4 · Race detector

**Monta:** un map de caché escrito desde varios handlers.

**Diagnóstico:** `go test -race ./...` (o compila el binario con `-race` y ejecútalo en staging con carga: el detector solo ve lo que se ejecuta). Lee el informe: escritura en X, lectura previa en Y, con ambos stacks.

**Arreglo y comparación:** `sync.RWMutex`, `sync.Map` y sharding por hash. Haz benchmark de los tres con 8 goroutines: el resultado te dará una respuesta muy concreta para la entrevista.

> **Nota importante:** que `-race` no reporte nada no demuestra ausencia de carreras; solo que no ocurrieron en esa ejecución. Y una carrera "que nunca dio problemas" es un bug latente: en otra arquitectura o con otro scheduling, aparece.

---

## Escenario 5 · Deadlock y bloqueo parcial

Dos variantes que debes distinguir:
- **Todo el programa bloqueado:** el runtime lo detecta y aborta con `fatal error: all goroutines are asleep - deadlock!`.
- **Bloqueo parcial** (el caso real): unas goroutines atascadas y el resto vivo, así que el runtime no dice nada. Se diagnostica con el perfil `goroutine` (busca los stacks en `sync.(*Mutex).Lock` o `chan send`) y con `block`.

---

## Escenario 6 · "too many open files"

**Monta:** cliente que no cierra `resp.Body` bajo carga.

**Diagnóstico:** `lsof -p <pid> | wc -l` creciendo; `ss -tan | grep CLOSE-WAIT | wc -l` alto — **CLOSE_WAIT es la firma de "el otro extremo cerró y yo no"**. Comprueba también `ulimit -n` y el límite del contenedor.

**Arreglo:** `defer resp.Body.Close()` + drenar; límites de conexiones; `MaxIdleConnsPerHost`.

---

## Escenario 7 · Contexto cancelado que no se propaga

**Monta:** handler que crea una goroutine con `context.Background()` para "trabajo en segundo plano" y que sigue escribiendo en la BD tras cancelarse la petición.

**Diagnóstico:** efectos fantasma (escrituras de peticiones abortadas), trabajo huérfano, CPU consumida sin peticiones activas.

**Arreglo:** decide explícitamente qué debe sobrevivir; usa `context.WithoutCancel` + su propio timeout para lo que deba continuar, y propaga el ctx para lo demás. **La regla que debes verbalizar: "cancelar es cooperativo; si no compruebo `ctx.Done()` ni paso el ctx hacia abajo, cancelar no hace nada".**

---

## Escenario 8 · CPU al 100% con tráfico normal

Sospechosos: bucle apretado (regex, JSON, serialización), GC por asignaciones excesivas, contención de spin en mutex, o un `for` sin salida por un bug. Orden: perfil de CPU 30 s → `top` por *flat* → mirar el flamegraph → si el GC domina, ir a `allocs`.

---

## Plantilla para narrarlo

> "Un servicio Go en producción crecía en memoria hasta que Kubernetes lo mataba cada 6 horas. El perfil de heap mostraba solo 150 MB vivos con un RSS de 1,2 GB, así que descarté un leak clásico. `runtime/metrics` mostró `StackSys` en 700 MB: teníamos 90.000 goroutines, y el perfil las agrupaba todas en un envío a un canal sin búfer cuyo lector salía por timeout. Contención: `GOMEMLIMIT` para dejar de morir. Fix: búfer 1 y propagación de contexto. Prevención: alerta sobre `NumGoroutine` y `goleak` en los tests."

## ✅ Autoevaluación final del curso 03

1. ¿Qué perfil pides primero para: latencia alta, memoria creciente, CPU alta?
2. Diferencia entre `inuse_space` y `alloc_space` y cuándo usas cada uno.
3. ¿Cómo detectas una fuga de goroutines en un servicio que no puedes reiniciar?
4. `-race` limpio en CI: ¿puedes afirmar que no hay carreras?
5. ¿Qué mirarías en `go tool trace` que no verías en pprof?

## 🎯 Preguntas del banco que ya puedes responder

Los **16 casos** de [`golang-microservicios/03-casos-y-problemas.md`](../../golang-microservicios/03-casos-y-problemas.md), y las preguntas 20–21 de [`01-go-core-avanzado.md`](../../golang-microservicios/01-go-core-avanzado.md).

---

**Anterior:** [Módulo 3](03-servicios-de-produccion.md) · **Fin del curso 03.**
