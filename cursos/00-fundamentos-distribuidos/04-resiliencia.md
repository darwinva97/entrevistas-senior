# Módulo 4 · Resiliencia: timeouts, reintentos y fallos metaestables

> **Curso 00 · Fundamentos** · 120 min · Requiere [módulo 1](01-modelo-mental.md)

## Por qué esto importa en la entrevista

Este módulo responde a la pregunta que más veces aparece disfrazada en el banco: **"un servicio se degradó y se cayó toda la plataforma, ¿por qué?"**. La respuesta que buscan no es "porque falló X", sino que entiendas la **amplificación**: cómo un problema local se convierte en global por culpa de las defensas mal puestas (reintentos, health checks, pools compartidos).

## Modelo mental: la carga se conserva, la capacidad no

Cuando un servicio se ralentiza, sus clientes no desaparecen: **se acumulan**. Cada cliente bloqueado ocupa un hilo, una conexión, memoria. Y si además reintenta, *multiplica* la carga sobre el servicio que ya estaba ahogado. Ese bucle de realimentación positiva es un **fallo metaestable**: el sistema no vuelve solo aunque desaparezca la causa original, porque ahora la causa es la propia cola de trabajo pendiente.

```
Causa original (pico, deploy, GC)
        │
        ▼
Latencia ↑ ──► clientes bloqueados ──► reintentos ──► más carga
        ▲                                                  │
        └──────────────────────────────────────────────────┘
              (el bucle sobrevive a la causa original)
```

**💬 Cómo lo dices:** *"Ante una cascada, mi primer objetivo no es encontrar la causa raíz sino romper el bucle de realimentación: cortar reintentos, tirar carga (load shedding) y drenar colas. Sin eso, aunque arregles la causa, el sistema no se recupera solo."*

## Timeouts: el parámetro más importante que nadie configura

Reglas duras:

1. **Todo cliente remoto lleva timeout explícito.** Los defaults suelen ser infinito o absurdos (el pool de conexiones espera para siempre).
2. **El timeout se deriva del percentil observado, no del deseo:** una regla útil es `timeout ≈ p99.9 de la operación × 1.5`, revisado con datos reales.
3. **Los timeouts deben decrecer hacia dentro.** Si el gateway espera 3 s, el servicio A no puede dar 5 s a B: es tiempo gastado en trabajo que nadie recogerá. Propaga el presupuesto (`deadline`) en la llamada: gRPC lo lleva nativo, en HTTP se hace con una cabecera tipo `X-Deadline-Ms` o `grpc-timeout`.
4. **Distingue timeouts:** conexión (rápido, 100–500 ms), lectura/respuesta (el del negocio), total de la operación con reintentos incluidos, y el de adquisición del pool (a menudo el olvidado, y el que produce "connection is not available").

```
Presupuesto de 1000 ms en el borde
 gateway  1000 ms
   └── servicio A  800 ms  (deja 200 ms de margen para red y serialización)
         └── servicio B  500 ms
               └── consulta BD  300 ms + statement_timeout en el servidor
```

> **⚠️ Trampa:** cancelar del lado del cliente **no** para el trabajo del servidor salvo que este lo respete (context/deadline propagado, `statement_timeout` en Postgres). Un timeout sin cancelación real solo libera al cliente; el servidor sigue quemando CPU en trabajo inútil, que es exactamente lo peor cuando está saturado.

## Reintentos: útiles y peligrosos a partes iguales

Un reintento correcto tiene **cinco** propiedades:

1. **Solo sobre errores transitorios e idempotentes.** Reintentar un `POST` no idempotente duplica; reintentar un `400` es absurdo.
2. **Backoff exponencial con jitter.** Sin jitter, todos los clientes reintentan a la vez y crean un *thundering herd* sincronizado. El jitter completo (`sleep = random(0, base·2^intento)`) es el que mejor se comporta.
3. **Límite bajo:** 2–3 intentos. Más no mejora la tasa de éxito, solo empeora la avalancha.
4. **Sin anidar capas.** Si reintenta el SDK, el cliente HTTP, la librería de resiliencia y el gateway: 3⁴ = 81 peticiones por una del usuario. **Regla: reintenta en una sola capa, preferiblemente la más cercana al usuario que aún sabe si la operación es segura.**
5. **Retry budget:** limita los reintentos a un % del tráfico normal (p. ej. 10%). Si se supera, se dejan de reintentar. Es lo que hacen Envoy/Istio y los service mesh; es la defensa que evita el retry storm de verdad.

```python
# Reintento con backoff exponencial y jitter completo, con presupuesto
for intento in range(3):
    if not budget.allow():        # retry budget global
        raise Exhausted()
    try:
        return llamar(deadline_restante())
    except TransitorioError:
        time.sleep(random.uniform(0, BASE * 2**intento))
```

## Circuit breaker: dejar de llamar a quien está caído

Estados: **cerrado** (pasa todo) → **abierto** (falla rápido, sin llamar) → **semiabierto** (deja pasar unas pocas de prueba). Lo que hay que saber configurar y explicar:

- Se dispara por **tasa de fallo o de lentitud sobre una ventana con volumen mínimo** — no por "5 fallos seguidos": con poco tráfico eso abre el circuito por ruido.
- El breaker debe incluir **llamadas lentas** (`slowCallRateThreshold`), no solo errores: el fallo gris es el caso real.
- Debe ser **por dependencia**, no global, y a veces por endpoint (un endpoint pesado no debe abrir el circuito del resto).
- Necesita un **fallback** definido: valor por defecto, dato cacheado, degradación funcional o error claro. "Fallback" no significa esconder el problema; significa decidir conscientemente qué se degrada.

**Bulkhead (mamparo):** limita concurrencia por dependencia con pools separados. Es lo que impide que la lentitud del servicio de recomendaciones consuma todos los hilos que necesita el checkout. Sin bulkheads, un breaker llega tarde: cuando abre, ya te quedaste sin hilos.

## Load shedding y backpressure: decir que no a tiempo

- **Backpressure:** propagar hacia atrás la señal de "no puedo con más" (una cola limitada, `pause()` en un consumidor, TCP window, `Retry-After`). Un sistema sin backpressure sustituye la caída controlada por un OOM.
- **Load shedding:** rechazar tráfico *rápido* cuando estás saturado, priorizando lo importante. Rechazar el 20% en 5 ms es infinitamente mejor que aceptar el 100% y responder todo en 30 s (donde el cliente ya se fue y todo el trabajo fue desperdiciado).
- **Cola limitada + LIFO en sobrecarga:** contraintuitivo pero eficaz — en sobrecarga, atender primero lo más reciente evita gastar CPU en peticiones cuyo cliente ya abandonó.
- **Prioridad:** tráfico de usuario > batch > analítica. Debe existir una forma de tirar lo segundo y tercero primero.

## Aislamiento: reducir el radio de explosión

- **Pools separados** por dependencia (bulkhead) y por tipo de tráfico.
- **Celdas / shuffle sharding:** repartir clientes entre celdas para que un cliente tóxico afecte solo a una fracción. Con 8 workers y 2 por cliente, el solapamiento entre dos clientes cualesquiera es bajísimo: un cliente que envenena su pareja no tumba a todos.
- **Zonas y regiones:** evitar dependencias cruzadas de AZ en el camino crítico (además de la latencia, cuestan en la factura).
- **Degradación funcional planificada:** lista explícita de qué se apaga primero (recomendaciones, personalización, tracking) para que el checkout siga vivo. Ten *feature flags* para hacerlo en caliente.

## Health checks que no empeoran las cosas

| Check | Qué debe comprobar | Error clásico |
|---|---|---|
| Liveness | "¿este proceso está roto sin remedio?" | Incluir dependencias → reinicios masivos cuando la BD parpadea |
| Readiness | "¿puedo atender tráfico ahora?" | No incluir nada → recibir tráfico antes de calentar caché/pool |
| Startup | Arranques lentos (JVM) | Su ausencia hace que liveness mate el pod durante el arranque |

Un patrón sensato: readiness que falla si el pool de BD está agotado *y* el servicio no puede degradar, con **histéresis** (no oscilar) y sin propagar dependencias transitivas.

## Errores comunes que delatan a un no-senior

- Reintentar en todas las capas "por si acaso".
- Circuit breaker sin fallback ni criterio de apertura por lentitud.
- Timeout del cliente sin cancelación en el servidor.
- Health check profundo en liveness.
- "Escalamos horizontalmente" como respuesta universal: si el cuello es la BD o un lock, añadir pods empeora el problema.
- No distinguir *causa* de *bucle*: en un fallo metaestable, revertir el deploy no basta.

## 🧪 Laboratorio — provoca y detén una cascada

1. Monta 3 servicios en cadena `A → B → C`, con pools de 20 conexiones y **sin** timeouts.
2. Introduce 2 s de latencia en C (`tc netem` o un `sleep`). Carga A con `k6`/`hey` a 50 rps.
3. Observa: A y B agotan pools, la latencia se dispara y el error se propaga aunque *nada esté caído*. Captura las métricas.
4. Añade **timeouts decrecientes** (A 900 ms, B 600 ms) y repite. La latencia se acota y aparecen errores rápidos: mejor.
5. Añade **reintentos ingenuos** (3, sin jitter, en A y en B). Mide el tráfico que llega a C: verás la amplificación ×9.
6. Sustituye por: reintento en una capa, jitter, retry budget del 10%, **bulkhead** de 5 conexiones para C y **circuit breaker** por lentitud. Repite la prueba y compara p50/p99, tasa de error y rps que llega a C.
7. Añade **load shedding**: rechaza con `503 + Retry-After` cuando la cola supere N. Comprueba que el p99 de lo aceptado se mantiene plano.

**Entregable:** una tabla con p50/p99/errores/rps-a-C en las 4 configuraciones. Es la mejor respuesta posible a "cuéntame de un problema de rendimiento que hayas resuelto".

## ✅ Autoevaluación

1. ¿Por qué un sistema puede no recuperarse aunque elimines la causa original?
2. ¿Cómo eliges el valor de un timeout y por qué deben decrecer hacia dentro?
3. Enumera las 5 propiedades de un reintento correcto.
4. ¿Qué diferencia hay entre circuit breaker y bulkhead? ¿Cuál actúa antes?
5. Tu servicio está saturado. ¿Por qué rechazar el 20% del tráfico puede ser mejor que aceptarlo todo?
6. ¿Por qué un liveness probe que comprueba la BD es peligroso?

## 🎯 Preguntas del banco que ya puedes responder

- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — 3 (retry storm), 5 (caída de caché), 9 (pasarela lenta)
- [`java-microservicios/02-spring-y-microservicios.md`](../../java-microservicios/02-spring-y-microservicios.md) — 3 (Resilience4j), 11 (gateway)
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 3 (thread pool exhaustion), 10 (cascada), 13 (HikariCP)
- [`golang-microservicios/`](../../golang-microservicios/) — casos de `context`, cancelación y goroutine leaks
- [`cloud/aws/03-casos-y-problemas.md`](../../cloud/aws/03-casos-y-problemas.md) — throttling, límites y colas

## Para profundizar

- AWS Builders' Library: *Timeouts, retries and backoff with jitter*, *Using load shedding to avoid overload*, *Workload isolation using shuffle sharding*.
- "Metastable Failures in Distributed Systems" (Bronson et al., HotOS 2021) — corto y revelador.
- Google SRE Book, capítulos *Handling Overload* y *Addressing Cascading Failures*.

---

**Anterior:** [Módulo 3](03-mensajeria-e-idempotencia.md) · **Siguiente:** [Módulo 5 · Latencia, colas y capacidad](05-latencia-y-colas.md)
