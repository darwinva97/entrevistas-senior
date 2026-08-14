# Módulo 4 · Kafka y patrones distribuidos en Java

> **Curso 01 · Java senior** · 150 min · Requiere [curso 00 módulo 3](../00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

## Por qué esto importa en la entrevista

El curso 00 te dio la teoría (at-least-once, idempotencia, outbox). Aquí bajas a los **parámetros concretos** que un entrevistador espera oír de alguien que ha operado Kafka desde Spring: `acks`, `min.insync.replicas`, `max.poll.interval.ms`, `enable.auto.commit`. Decir los nombres correctos con el razonamiento detrás es una señal fortísima.

## Productor: la configuración que evita perder datos

```yaml
spring.kafka.producer:
  acks: all                          # espera a todas las réplicas en ISR
  enable-idempotence: true           # dedupe por (producerId, secuencia): sin duplicados por reintento
  retries: 2147483647                # con idempotencia activada es seguro
  max-in-flight-requests-per-connection: 5   # ≤5 mantiene el orden con idempotencia
  compression-type: zstd             # menos red y disco; CPU barata a cambio
  linger-ms: 10                      # micro-batching: mucho más throughput
  batch-size: 65536
```

Lo que hay que saber explicar:

- **`acks=all` no basta.** La garantía real la define `min.insync.replicas` **en el broker/topic**: con RF=3 y `min.insync.replicas=2` toleras la caída de una réplica y sigues sin perder datos. Con `min.insync.replicas=1`, `acks=all` no te salva de nada.
- **`enable.idempotence`** evita duplicados *del productor por reintento de red*, no los del consumidor que reprocesa. (Ver la trampa del [curso 00 módulo 3](../00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)).
- **La clave determina la partición** → determina el orden y los hot spots.
- **El envío es asíncrono:** `send()` devuelve un futuro. Un `send()` sin callback ni manejo de error es una pérdida de mensajes silenciosa; y `.get()` inmediato mata el throughput (batch de 1).

## Consumidor: commit, lag y rebalanceos

```yaml
spring.kafka.consumer:
  enable-auto-commit: false          # ¡siempre!
  isolation-level: read_committed    # ignora mensajes de transacciones abortadas
  max-poll-records: 100              # tamaño de lote acorde a lo que tardas
  max-poll-interval-ms: 300000       # > tiempo de procesar un lote completo
listener:
  ack-mode: manual_immediate         # o RECORD/BATCH según el caso
```

- **Auto-commit = pérdida de mensajes** si procesas asíncronamente o si mueres tras el commit. Commit **después** del efecto persistido.
- **Rebalanceo:** cuando entra/sale un consumidor o alguien tarda más de `max.poll.interval.ms`, el grupo redistribuye particiones. Síntoma clásico: procesamiento lento → expulsión del grupo → rebalanceo → el siguiente tarda más → bucle. Arreglos: bajar `max-poll-records`, subir el intervalo, procesar en un pool con `pause()`/`resume()`, o usar `CooperativeStickyAssignor` (rebalanceo incremental, sin parar a todo el grupo).
- **Reintentos y DLQ en Spring Kafka:**

```java
@Bean
DefaultErrorHandler errorHandler(KafkaTemplate<Object, Object> template) {
    var recoverer = new DeadLetterPublishingRecoverer(template);   // topic-dlt
    var backoff = new ExponentialBackOffWithMaxRetries(3);
    backoff.setInitialInterval(500); backoff.setMultiplier(2.0);
    var handler = new DefaultErrorHandler(recoverer, backoff);
    handler.addNotRetryableExceptions(ValidationException.class);   // no reintentar lo que no cambiará
    return handler;
}
```

Distingue **errores transitorios** (reintentar con backoff) de **errores de datos** (a DLQ directamente): reintentar 1.000 veces un JSON inválido bloquea la partición. Eso es un *poison pill*, y saber nombrarlo puntúa.

- **`@RetryableTopic`** (Spring Kafka 2.7+) implementa reintentos no bloqueantes con topics escalonados (`-retry-0`, `-retry-1`, `-dlt`): no bloquea la partición, pero **rompe el orden**. Trade-off que debes verbalizar.

## Outbox en Spring, concreto

```java
@Transactional
public Pedido crear(CrearPedido cmd) {
    var pedido = pedidoRepo.save(Pedido.desde(cmd));
    outboxRepo.save(new OutboxEvent(                    // MISMA transacción
        UUID.randomUUID(), "Pedido", pedido.getId(),
        "PedidoCreado", json.write(PedidoCreado.desde(pedido))));
    return pedido;                                      // nada de kafkaTemplate.send() aquí
}
```

El relay: Debezium leyendo el WAL (sin polling, sin carga extra sobre la BD, y con la tabla outbox como *append-only* que se purga), o un poller `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 100` cada N ms si no puedes montar CDC. `SKIP LOCKED` es el detalle que demuestra que lo has implementado de verdad: permite varios pollers sin pisarse.

Consumidor idempotente en el otro extremo:

```java
@KafkaListener(topics = "pedidos")
@Transactional
public void onPedidoCreado(ConsumerRecord<String, PedidoCreado> rec, Acknowledgment ack) {
    if (!procesados.registrar(rec.key(), messageId(rec))) return;  // INSERT que falla si ya existe
    facturacion.crearFactura(rec.value());                          // efecto de negocio
    ack.acknowledge();                                              // commit del offset al final
}
```

## Saga con orquestador: cómo se ve en Java

```java
// Máquina de estados persistida: sin esto no puedes reanudar tras un reinicio
enum EstadoSaga { INICIADA, PAGO_OK, STOCK_RESERVADO, COMPLETADA, COMPENSANDO, FALLIDA }
```

Puntos a mencionar: cada paso con timeout propio y reintentos; compensaciones idempotentes; persistir el estado tras cada transición; un job que reanuda sagas atascadas (*stuck sagas*); y métricas por estado (una saga que lleva 10 minutos en `PAGO_OK` es un incidente). Frameworks: Axon, Camunda/Zeebe, Temporal, o una máquina de estados propia — di cuál elegirías y por qué (la propia si son 3 pasos; un motor si hay decenas de flujos y necesitas visibilidad de negocio).

## Resiliencia con Resilience4j

```yaml
resilience4j.circuitbreaker.instances.pagos:
  sliding-window-type: TIME_BASED
  sliding-window-size: 60           # 60 segundos
  minimum-number-of-calls: 20       # sin volumen, no se abre por ruido
  failure-rate-threshold: 50
  slow-call-duration-threshold: 2s
  slow-call-rate-threshold: 50      # ← el fallo gris también abre el circuito
  wait-duration-in-open-state: 10s
  permitted-number-of-calls-in-half-open-state: 5
resilience4j.bulkhead.instances.pagos:
  max-concurrent-calls: 20          # bulkhead: aísla el pool
resilience4j.retry.instances.pagos:
  max-attempts: 3
  wait-duration: 200ms
  enable-exponential-backoff: true
  enable-randomized-wait: true      # jitter
```

**El orden de los decoradores importa** y es una pregunta favorita: en Spring Cloud Circuit Breaker el orden por defecto es `Retry( CircuitBreaker( RateLimiter( TimeLimiter( Bulkhead( llamada )))))` — es decir, **el retry envuelve al breaker**: los reintentos ocurren fuera y el breaker cuenta cada intento. Si lo inviertes, el breaker abierto no evita los reintentos. Verbalizarlo demuestra que has leído más allá del README.

Y la regla del [curso 00 módulo 4](../00-fundamentos-distribuidos/04-resiliencia.md): reintentar **solo** operaciones idempotentes, en una sola capa, con jitter y presupuesto.

## Errores comunes que delatan a un no-senior

- `acks=all` sin mencionar `min.insync.replicas`.
- Auto-commit activado.
- Publicar a Kafka dentro de un `@Transactional` de BD creyendo que es atómico.
- Reintentar indefinidamente un mensaje envenenado.
- `@RetryableTopic` sin mencionar que rompe el orden.
- Circuit breaker que solo cuenta errores y no llamadas lentas.
- No tener idea de cuánto lag es normal en su propio sistema.

## 🧪 Laboratorio

1. **Pérdida de mensajes:** productor con `acks=1` y topic con RF=3; mata el líder durante la carga y cuenta los mensajes perdidos. Repite con `acks=all` + `min.insync.replicas=2`.
2. **Duplicados:** consumidor con auto-commit que muere tras procesar; cuenta duplicados. Arregla con dedupe transaccional.
3. **Rebalanceo infinito:** `max.poll.interval.ms=10000` y procesamiento de 15 s. Observa los logs, mide el lag, arréglalo de dos formas distintas.
4. **Outbox completo:** implementa la tabla, el poller con `SKIP LOCKED` y el consumidor idempotente. Mata procesos en cada punto intermedio y demuestra que el sistema converge.
5. **Breaker y bulkhead:** provoca latencia en un proveedor simulado y observa la apertura por `slowCallRate`; compara p99 del resto de endpoints con y sin bulkhead.

**Entregable:** un servicio de ejemplo con outbox + consumidor idempotente + DLQ que puedas enseñar en una entrevista.

## ✅ Autoevaluación

1. ¿Qué configuras exactamente para no perder mensajes y por qué `acks=all` no basta?
2. ¿Por qué `enable.idempotence=true` no te da exactly-once end-to-end?
3. Consumer lag creciente: enumera 5 causas posibles y cómo las distingues.
4. ¿Qué es un poison pill y cómo lo manejas sin bloquear la partición?
5. Explica el orden de decoradores de Resilience4j y qué cambia si retry envuelve al breaker o al revés.
6. Implementa outbox en pizarra: tabla, transacción, relay, garantías.

## 🎯 Preguntas del banco que ya puedes responder

- [`java-microservicios/02-spring-y-microservicios.md`](../../java-microservicios/02-spring-y-microservicios.md) — 3 (Resilience4j), 4 (sync vs async), 5, 6 (Kafka), 7 (saga), 8 (outbox), 11 (gateway), 13 (service discovery)
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 5, 6, 7, 10, 14, 15

---

**Anterior:** [Módulo 3](03-spring-por-dentro-y-transacciones.md) · **Siguiente:** [Módulo 5 · Laboratorio de diagnóstico JVM](05-laboratorio-diagnostico-jvm.md)
