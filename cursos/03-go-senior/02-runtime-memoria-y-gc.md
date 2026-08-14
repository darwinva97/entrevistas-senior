# Módulo 2 · Runtime: memoria, escape analysis y GC

> **Curso 03 · Go senior** · 150 min

## Por qué esto importa en la entrevista

Porque Go parece simple hasta que tu pod es OOM-killed con un heap de 200 MB, o un `append` inocente corrompe datos de otra parte del programa. Las preguntas de este módulo son las que distinguen a quien escribe Go de quien lo *entiende*.

## Stack vs heap: lo decide el compilador, no `new`

En Go no eliges dónde vive un objeto: lo decide el **escape analysis**. Si el compilador demuestra que un valor no sobrevive a la función, va al stack (gratis, sin GC).

```bash
go build -gcflags='-m -m' ./... 2>&1 | grep -E 'escapes|does not escape|moved to heap'
```

Motivos habituales de escape: devolver un puntero a una variable local; guardar en una estructura que vive más; **pasar a una interfaz** (`fmt.Println(x)` hace escapar a `x`); closures que capturan por referencia; slices cuyo tamaño no se conoce en compilación.

El stack de una goroutine empieza en ~2 KB y **crece copiándose** (stack growth): por eso las goroutines son baratas y por eso una recursión profunda tiene un coste oculto de copias.

**Reducir asignaciones en el hot path** (solo cuando el profiler lo justifique):

```go
buf := make([]byte, 0, 1024)          // prealoca capacidad: evita reallocs de append
s := make([]Item, 0, len(origen))     // idem
var pool = sync.Pool{New: func() any { return new(bytes.Buffer) }}  // reutiliza objetos grandes
```

`sync.Pool` se vacía en cada ciclo de GC y solo compensa para objetos grandes y muy frecuentes; usarlo por defecto es una pesimización que además esconde bugs (objetos sucios reutilizados). Menciónalo con esa cautela.

## El GC de Go

- **Concurrente, tricolor, con write barrier, no compactante.** Las pausas son de decenas de microsegundos: casi nunca son el problema. Lo que sí lo es: **la tasa de asignación** (más asignaciones → más ciclos de GC → más CPU) y la **fragmentación** por no compactar.
- **`GOGC` (default 100):** lanza el siguiente ciclo cuando el heap vivo se ha duplicado respecto al final del anterior. Subirlo (`GOGC=200`) reduce ciclos y usa más memoria; bajarlo, al revés.
- **`GOMEMLIMIT` (Go 1.19+):** límite *soft* de memoria total; el GC se vuelve más agresivo al acercarse. **Es la respuesta correcta para contenedores**: `GOMEMLIMIT=450MiB` en un pod de 512 Mi evita el OOMKill que `GOGC` solo no evita. Combinación típica en producción: `GOGC=100` + `GOMEMLIMIT` al ~80–90% del límite del pod (y si quieres que mande solo el límite, `GOGC=off` + `GOMEMLIMIT`).

```bash
GODEBUG=gctrace=1 ./app     # gc 12 @3.2s 1%: 0.02+1.5+0.01 ms clock, ... 45->46->23 MB
                            #                   ^pausas          ^heap antes->pico->vivo
```

## Por qué el RSS crece aunque el heap se vea pequeño

Pregunta estrella del banco (caso 2 de [`golang-microservicios/03-casos-y-problemas.md`](../../golang-microservicios/03-casos-y-problemas.md)). Las causas, todas legítimas:

1. **El runtime devuelve memoria al SO de forma perezosa** (`MADV_FREE` en Linux por defecto en versiones antiguas: las páginas siguen contando en el RSS hasta que hay presión). `GODEBUG=madvdontneed=1` fuerza devolución inmediata en runtimes antiguos.
2. **Fragmentación:** el heap no se compacta; picos pasados dejan huecos.
3. **Stacks de goroutines:** 100.000 goroutines × 8 KB = 800 MB que **no aparecen en el perfil de heap**.
4. **Memoria fuera del heap de Go:** cgo, mmap, buffers de librerías nativas.
5. Un **`sync.Pool`** o cachés reteniendo objetos vivos.

**Cómo se diagnostica bien:** `runtime.ReadMemStats` / `runtime/metrics` (`/memory/classes/...`) desglosa heap vivo, libre, devuelto al SO y stacks. Comparar `HeapAlloc` (vivo), `HeapIdle - HeapReleased` (retenido pero libre) y `StackSys` responde a la pregunta en 30 segundos.

## Slices: el gotcha que causa datos corruptos

```go
a := []int{1, 2, 3, 4, 5}
b := a[1:3]                  // len=2, cap=4  ← ¡comparte el array subyacente!
b = append(b, 99)            // escribe en a[3]: a == [1 2 3 99 5]  💥

c := a[1:3:3]                // full slice expression: cap=2 → el próximo append copia
```

Reglas: `append` puede o no reasignar (si `cap` alcanza, escribe en el array compartido); un slice de un slice grande **retiene todo el array** (fuga de memoria al quedarte con 10 bytes de un buffer de 10 MB: copia explícitamente); pasar un slice a una función copia la cabecera, no los datos.

**Maps:** el orden de iteración es aleatorio *a propósito*; no son seguros para concurrencia (escritura concurrente = `fatal error: concurrent map writes`, que **no es un panic recuperable**); no se puede tomar la dirección de un elemento; y un map que creció no libera memoria al borrar claves (hay que recrearlo).

## Interfaces y el "typed nil"

```go
type MiError struct{}
func (e *MiError) Error() string { return "boom" }

func hacer() error {
    var e *MiError = nil      // puntero nil
    return e                  // ⚠️ interfaz con tipo (*MiError) y valor nil
}
if err := hacer(); err != nil {   // ¡TRUE! la interfaz no es nil: tiene tipo
    log.Fatal(err)                 // y aquí, panic al llamar a Error()... o no
}
```

Una interfaz es un par `(tipo, valor)`: solo es `nil` si **ambos** lo son. De ahí la regla: **devuelve `nil` literal**, no una variable de tipo puntero concreto. Es la pregunta trampa favorita en Go y aparece de verdad en producción con errores personalizados.

## Errores: idiomática que se evalúa

```go
if err := hacer(); err != nil {
    return fmt.Errorf("procesando pedido %s: %w", id, err)   // %w envuelve y conserva la cadena
}
errors.Is(err, sql.ErrNoRows)          // comparación por identidad a través de la cadena
var pgErr *pgconn.PgError
errors.As(err, &pgErr)                 // extracción por tipo
```

- **Sentinel errors** (`var ErrNoEncontrado = errors.New(...)`) para condiciones que el llamador debe distinguir; **typed errors** cuando hay que llevar datos.
- Añade contexto en cada nivel, **sin repetir** ("failed to" en cada capa produce mensajes ilegibles).
- No uses `panic` para control de flujo; sí `recover` en el borde (middleware HTTP, worker) para no tumbar el proceso, y registra el stack.
- `defer` se evalúa en el momento de la declaración para sus argumentos, pero se ejecuta al retornar (LIFO), y puede modificar valores de retorno nombrados — eso es lo que permite el patrón `defer func(){ if r:=recover(); r!=nil { err = ... } }()`.

## Genéricos: cuándo sí

Útiles para estructuras de datos y utilidades sobre colecciones (`Map`, `Filter`, `Keys`), o para evitar duplicar código idéntico con tipos distintos. **No** los uses para abstraer comportamiento: eso son interfaces. Y recuerda el coste: peor legibilidad y, con GC shape stenciling, no siempre son más rápidos que una interfaz.

## Errores comunes que delatan a un no-senior

- Creer que el GC de Go causa las pausas del problema (casi nunca; mira la tasa de asignación).
- Optimizar asignaciones sin perfil previo.
- No conocer el aliasing de slices.
- Devolver un puntero tipado nil como `error`.
- Usar `sync.Pool` por defecto.
- No fijar `GOMEMLIMIT` en contenedores y culpar a Kubernetes del OOMKill.
- Ignorar que escribir en un map concurrentemente mata el proceso sin remedio.

## 🧪 Laboratorio

1. **Escape analysis:** escribe cinco funciones y predice antes de compilar cuáles escapan; verifica con `-gcflags='-m -m'`. Anota los aciertos.
2. **Benchmark de asignaciones:** `go test -bench . -benchmem` sobre una función que concatena strings con `+`, con `strings.Builder` y con `[]byte` preasignado.
3. **Aliasing:** reproduce la corrupción del ejemplo de slices y arréglala con `a[1:3:3]` y con `copy`.
4. **Retención:** función que devuelve `datos[:10]` de un buffer de 10 MB; mide con pprof cómo el heap no baja. Arregla copiando.
5. **RSS vs heap:** lanza 200.000 goroutines dormidas; compara `HeapAlloc` con el RSS del proceso y explica la diferencia con `runtime/metrics`.
6. **GOMEMLIMIT:** ejecuta en un contenedor de 256 Mi con y sin `GOMEMLIMIT`; provoca el OOMKill y luego evítalo.
7. **Typed nil:** reproduce el bug y escribe el test que lo detecta.

**Entregable:** una nota de 1 página "cómo dimensiono memoria en Go para Kubernetes" con tus números.

## ✅ Autoevaluación

1. ¿Quién decide si un valor va al stack o al heap y cómo lo compruebas?
2. ¿Qué hace `GOMEMLIMIT` y por qué es mejor que solo `GOGC` en contenedores?
3. RSS 900 MB, heap de pprof 120 MB: da cuatro explicaciones posibles.
4. Explica el aliasing de slices con un ejemplo y dos arreglos.
5. ¿Por qué `err != nil` puede ser cierto con un error nil dentro?
6. ¿Cuándo `sync.Pool` sí, y qué riesgo tiene?
7. ¿Qué pasa si dos goroutines escriben en el mismo map?

## 🎯 Preguntas del banco que ya puedes responder

- [`golang-microservicios/01-go-core-avanzado.md`](../../golang-microservicios/01-go-core-avanzado.md) — 10–16, 19
- [`golang-microservicios/03-casos-y-problemas.md`](../../golang-microservicios/03-casos-y-problemas.md) — 2 (RSS vs heap), 5 (p99: GC o contención), 8 (aliasing), 13 (archivo de 20 GB), 15 (CPU al 100%)

---

**Anterior:** [Módulo 1](01-concurrencia-y-context.md) · **Siguiente:** [Módulo 3 · Servicios de producción en Go](03-servicios-de-produccion.md)
