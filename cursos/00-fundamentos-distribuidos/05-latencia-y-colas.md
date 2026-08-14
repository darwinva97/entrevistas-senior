# Módulo 5 · Latencia, colas y capacidad

> **Curso 00 · Fundamentos** · 90 min · Requiere [módulo 4](04-resiliencia.md)

## Por qué esto importa en la entrevista

Dos preguntas casi garantizadas en cualquier entrevista senior:

- *"¿Cuántas instancias/hilos/conexiones necesita este servicio?"*
- *"El p50 está bien pero el p99 se dispara. ¿Por qué?"*

Ambas se responden con teoría de colas básica. No necesitas matemáticas avanzadas: necesitas la ley de Little, entender por qué la latencia explota cerca de la saturación, y saber que **los promedios mienten**.

## Ley de Little: la única fórmula que debes memorizar

```
L = λ × W

L = trabajos en el sistema (concurrencia)
λ = tasa de llegada (rps)
W = tiempo en el sistema (latencia, en segundos)
```

Sirve para dimensionar cualquier cosa:

- **Hilos/conexiones necesarias:** 500 rps × 0,2 s de latencia = **100 en vuelo**. Si tu pool tiene 50, la mitad espera: la latencia sube y con ella la concurrencia requerida (bucle vicioso).
- **Tamaño del pool de BD:** 200 rps × 20 ms de consulta = 4 conexiones activas. Con 100 conexiones configuradas no vas más rápido: creas contención en la BD. *(La guía de HikariCP dice exactamente esto: pools pequeños suelen rendir más.)*
- **Consumidores de una cola:** para drenar 10.000 mensajes/s con 50 ms por mensaje hacen falta 500 en paralelo — y como máximo tantos como particiones tengas.

**💬 Cómo lo dices:** *"Con la ley de Little: a 500 rps y 200 ms, tengo 100 peticiones en vuelo. Dimensiono el pool para eso más margen, y pongo una cola limitada delante para que el exceso se rechace rápido en vez de acumularse."*

## Por qué el p99 explota: utilización y varianza

Para una cola simple (M/M/1), el tiempo de espera crece con `1/(1-ρ)` donde `ρ` es la utilización:

| Utilización ρ | Factor de espera 1/(1−ρ) |
|:-:|:-:|
| 50% | 2× |
| 70% | 3,3× |
| 80% | 5× |
| 90% | **10×** |
| 95% | **20×** |

Es decir: **entre el 70% y el 90% de utilización no pierdes un 20% de rendimiento, multiplicas la latencia por 3**. Por eso los servicios se planifican con la CPU al 50–70%, no al 95%, y por eso un autoescalado que reacciona al 90% llega tarde.

Dos matices que suman puntos:

- **La varianza empeora todo.** Si el tiempo de servicio es muy variable (algunas peticiones 10 ms, otras 2 s), las colas se forman antes. Separar el tráfico pesado del ligero (colas o pools distintos) baja el p99 sin comprar hardware.
- **Los recursos con concurrencia > 1 se comportan mejor** (M/M/c): 4 servidores al 80% sufren menos que 1 servidor al 80%.

## Percentiles: los promedios mienten

- El promedio esconde la cola de la distribución; **nadie experimenta el promedio**.
- **No puedes promediar percentiles.** El p99 de tres pods no es la media de sus p99. Hay que agregar histogramas (por eso Prometheus usa `histogram_quantile` sobre buckets, no `avg`).
- **Latencia percibida por el usuario ≠ p99 del servicio.** Si una página hace 10 llamadas en paralelo, la latencia de la página es el **máximo** de las 10: con p99=1 s por llamada, la probabilidad de que *alguna* se vaya a 1 s es ~10%. Esa es la **amplificación de cola** (*tail amplification*), y es la respuesta correcta a "mi backend está bien pero los usuarios se quejan".
- Mide siempre **del lado del cliente** además del servidor: el servidor no ve el tiempo de cola en el balanceador, el TLS handshake ni la red del móvil.

Técnicas contra la cola larga: **hedged requests** (lanzar una segunda petición si la primera supera el p95 y quedarse con la primera respuesta), timeouts agresivos con reintento a otra réplica, y reducir el fan-out.

## Dónde se va el tiempo: números que hay que tener en la cabeza

| Operación | Orden de magnitud |
|---|---|
| Referencia a caché L1 | 1 ns |
| Acceso a RAM | 100 ns |
| Lectura secuencial 1 MB de RAM | ~30 µs |
| SSD NVMe, lectura aleatoria 4 KB | ~100 µs |
| Round-trip dentro del mismo datacenter | 0,5 ms |
| Round-trip entre AZ | 1–2 ms |
| Consulta simple a Postgres con índice | 1–5 ms |
| Round-trip intercontinental (Lima–Frankfurt) | ~180 ms |
| Handshake TLS completo (1-RTT extra) | 1 RTT adicional |

Consecuencias directas para diseñar: **N+1 de red mata** (100 llamadas de 1 ms = 100 ms de puro round-trip), el batching es la optimización más rentable, y una caché en memoria del proceso es ~1.000× más rápida que Redis remoto (que a su vez es ~100× más rápido que la BD en disco).

## Caché: el arma de doble filo

- **Hit rate y el efecto ×50:** si el 98% de lecturas van a caché, perder la caché multiplica por 50 la carga de la BD. Toda arquitectura con caché necesita responder: *¿aguanto sin ella?* Si no, la caché no es una optimización, es una dependencia crítica y debe tratarse como tal.
- **Cache stampede / dogpiling:** al expirar una clave caliente, mil peticiones van a la BD a la vez. Soluciones: *single-flight* (una sola recalcula, el resto espera), TTL con jitter, y *stale-while-revalidate* (servir lo viejo mientras se refresca).
- **Invalidación:** las dos estrategias sanas son TTL corto (simple, tolerante) o invalidación por evento (precisa, más compleja). Escribir en caché y BD "a la vez" reintroduce el dual write.
- **Warmup:** un pod nuevo con caché fría no debe recibir el 100% del tráfico de golpe: readiness + slow start. Ese es el motivo real de "el p99 empeora tras cada deploy".

## Capacidad: cómo se calcula en una entrevista

Guion de 2 minutos que puedes reutilizar:

1. **Tráfico:** usuarios activos diarios × acciones por usuario ÷ 86.400 = rps medio. **Pico ≈ 3–10× la media** (di el factor y justifícalo).
2. **Lecturas vs escrituras:** ratio típico 10:1 o 100:1; determina si necesitas réplicas o sharding.
3. **Datos:** bytes por registro × registros/día × retención. Añade índices (×1,5–2) y réplicas (×3).
4. **Ancho de banda:** rps × tamaño de respuesta.
5. **Cómputo:** por Little, `concurrencia = rps × latencia`; instancias = concurrencia ÷ concurrencia por instancia, con la utilización objetivo al 60–70%.
6. **Margen:** headroom para pico, para pérdida de una AZ y para el tiempo de reacción del autoescalado (que no es instantáneo: 1–3 min típicos).

## Errores comunes que delatan a un no-senior

- Dimensionar el pool de BD "grande por si acaso".
- Optimizar el promedio en vez del percentil que sufre el usuario.
- Promediar percentiles entre instancias.
- Ignorar la amplificación de cola en fan-outs.
- Tratar la caché como opcional cuando el sistema no sobrevive sin ella.
- Autoescalar por CPU cuando el cuello es I/O o un lock (la CPU estará baja mientras el servicio agoniza).

## 🧪 Laboratorio — mide la curva de saturación

1. Levanta un servicio con un endpoint que consulte la BD (latencia ~20 ms) y expón métricas con histograma.
2. Con `k6` o `wrk`, ejecuta escalones: 50, 100, 200, 400, 800 rps, 2 minutos cada uno.
3. Grafica **rps vs p50 y p99** y localiza el codo. Compara con la tabla `1/(1−ρ)`: ¿a qué utilización aparece?
4. Repite con el pool de BD en 5, 20 y 100 conexiones. Verifica que el pool grande **no** mejora el throughput y sí empeora el p99.
5. Introduce el 5% de peticiones "pesadas" (200 ms) mezcladas con las ligeras. Mide el p99 de las ligeras. Después sepáralas en otro pool/cola y vuelve a medir: esa mejora es gratis y es una gran anécdota de entrevista.
6. Simula fan-out: un endpoint que llama 10 veces en paralelo a otro con p99 conocido. Mide el p99 resultante y compáralo con la teoría.

**Entregable:** una gráfica de la curva de saturación de *tu* servicio y el número de instancias que recomendarías para 1.000 rps, con el razonamiento escrito.

## ✅ Autoevaluación

1. 800 rps con 150 ms de latencia: ¿cuántas peticiones hay en vuelo? ¿Qué tamaño de pool eliges?
2. ¿Por qué la latencia se dispara al pasar del 70% al 90% de utilización?
3. ¿Por qué no se pueden promediar los p99 de varias instancias?
4. Una página hace 8 llamadas paralelas con p99 = 300 ms cada una. ¿Qué latencia percibe el usuario y qué harías?
5. Se cae Redis y con él el 97% de hit rate. Estima el impacto en la BD y di dos mitigaciones.
6. ¿Por qué autoescalar por CPU puede no detectar una saturación real?

## 🎯 Preguntas del banco que ya puedes responder

- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 2 (p99 alto con p50 normal), 3 (thread pool), 13 (HikariCP)
- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — 2 (p99 tras deploy), 5 (caché caída), 9 (ley de Little explícita)
- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — todos: la fase de estimaciones
- [`typescript-microservicios/02-node-y-microservicios.md`](../../typescript-microservicios/02-node-y-microservicios.md) — event loop, concurrencia y backpressure

## Para profundizar

- Gil Tene, *"How NOT to Measure Latency"* — charla obligatoria; explica el *coordinated omission*.
- Brendan Gregg, *Systems Performance* — método USE y capacidad.
- "Latency Numbers Every Programmer Should Know" (Jeff Dean), actualizado.

---

**Anterior:** [Módulo 4](04-resiliencia.md) · **Siguiente:** [Módulo 6 · Observabilidad y método de diagnóstico](06-observabilidad-y-diagnostico.md)
