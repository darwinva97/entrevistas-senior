# Spring y Microservicios — Preguntas de Entrevista Senior

## 1. ¿Cómo funciona la auto-configuración de Spring Boot por dentro?
**Categoría:** Spring Boot internals · **Tipo:** Conceptual

### 📝 Respuesta resumen
`@SpringBootApplication` incluye `@EnableAutoConfiguration`, que importa clases de auto-configuración listadas en `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` (antes `spring.factories`). Cada auto-configuración es una `@Configuration` guardada por condicionales (`@ConditionalOnClass`, `@ConditionalOnMissingBean`, `@ConditionalOnProperty`) que solo crea beans si se cumplen: la clase está en el classpath, el usuario no definió el suyo, la property lo habilita. Así "convención sobre configuración" con posibilidad total de override.

### 📖 Respuesta detallada
**El mecanismo paso a paso:**
1. `@EnableAutoConfiguration` registra `AutoConfigurationImportSelector`, un `DeferredImportSelector` — "deferred" es clave: se procesa DESPUÉS de las configuraciones del usuario, para que `@ConditionalOnMissingBean` vea primero tus beans.
2. El selector lee los ficheros `AutoConfiguration.imports` de todos los JARs del classpath y obtiene ~150 clases candidatas.
3. Filtra rápido con `@ConditionalOnClass` evaluado sobre metadatos ASM (sin cargar las clases — por eso una autoconfiguración de Kafka no rompe si Kafka no está en el classpath).
4. Ordena con `@AutoConfigureBefore/After/Order` y evalúa el resto de condiciones al registrar bean definitions.

**Las condicionales que hay que conocer:**
```java
@AutoConfiguration
@ConditionalOnClass(DataSource.class)                    // solo si hay JDBC en classpath
@EnableConfigurationProperties(DataSourceProperties.class)
public class DataSourceAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean                            // el usuario siempre gana
    @ConditionalOnProperty(prefix = "app.datasource", name = "enabled",
                           havingValue = "true", matchIfMissing = true)
    public DataSource dataSource(DataSourceProperties props) {
        return props.initializeDataSourceBuilder().build();
    }
}
```
`@ConditionalOnMissingBean` es el corazón del modelo: Boot propone, tú dispones. Si defines tu propio `ObjectMapper`, el de Boot se retira — y con él sus customizaciones (módulos JSR-310, etc.), un pitfall clásico: mejor usar `Jackson2ObjectMapperBuilderCustomizer` que reemplazar el bean entero.

**Herramientas de diagnóstico que espera oír el entrevistador:**
- `--debug` o `debug=true` → `ConditionEvaluationReport`: informe de qué autoconfiguraciones matchearon y por qué no las demás ("Negative matches").
- Actuator `/actuator/conditions`.
- Excluir: `@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)` o `spring.autoconfigure.exclude`.

**Escribir la tuya (para librerías internas / platform teams):** crear un starter con `AutoConfiguration.imports`, condicionales conservadoras, `@ConfigurationProperties` con metadata (autocompletado en IDE) y tests con `ApplicationContextRunner`:
```java
new ApplicationContextRunner()
    .withConfiguration(AutoConfigurations.of(MiAutoConfiguration.class))
    .withPropertyValues("mi.feature.enabled=true")
    .run(ctx -> assertThat(ctx).hasSingleBean(MiCliente.class));
```

**Errores comunes:** creer que la auto-configuración es "magia de reflection en runtime caro" (es evaluación de condiciones al arranque, y con AOT/native image se resuelve en build time); poner `@ComponentScan` sobre paquetes de otra librería en vez de usar el mecanismo de imports; y no saber responder "¿por qué mi bean no se creó?" — la respuesta profesional siempre es el condition report, no prueba y error.

---

## 2. @Transactional: propagación, rollback y los pitfalls del proxy
**Categoría:** Spring / Transacciones · **Tipo:** Conceptual

### 📝 Respuesta resumen
`@Transactional` funciona mediante un proxy AOP que abre/commitea la transacción alrededor del método. Consecuencias: la **auto-invocación no pasa por el proxy** (llamar a un método `@Transactional` desde la misma clase no abre transacción), solo métodos públicos son interceptados por defecto, y el rollback automático solo ocurre con unchecked exceptions. La propagación define cómo se relaciona con una transacción existente: `REQUIRED` (default, se une), `REQUIRES_NEW` (suspende y abre otra), `NESTED` (savepoint), `MANDATORY`, `NOT_SUPPORTED`, etc.

### 📖 Respuesta detallada
**El modelo de proxy y sus tres trampas:**

```java
@Service
public class OrderService {

    @Transactional
    public void processBatch(List<Order> orders) {
        for (Order o : orders) {
            processOne(o);   // ¡NO abre transacción nueva! this.processOne
        }                    // no atraviesa el proxy → REQUIRES_NEW se ignora
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void processOne(Order o) { ... }
}
```
Soluciones: extraer `processOne` a otro bean, autoinyectarse (`ObjectProvider<OrderService>`), o usar `TransactionTemplate` programático. Mencionar que con AspectJ weaving el problema desaparece (nadie lo usa en la práctica) demuestra entender la causa, no el síntoma.

Trampa 2: **métodos no públicos** — el proxy JDK/CGLIB solo intercepta públicos (Spring 6 permite protected/package en algunos casos, pero la regla segura sigue siendo público). Trampa 3: **campos `final`/clases final** — CGLIB no puede subclasificar.

**Reglas de rollback (fuente de bugs de datos):**
- Default: rollback en `RuntimeException` y `Error`; **commit** en checked exceptions. Un `throws IOException` dentro de la transacción → los cambios previos se COMMITEAN.
- Ajustar: `@Transactional(rollbackFor = Exception.class)`.
- **Capturar y tragar la excepción dentro del método transaccional NO evita el rollback si un método interno ya marcó rollback-only** → el commit lanza `UnexpectedRollbackException`. Escenario típico: método `REQUIRED` interno lanza, el externo la captura "para manejar el error", y al salir explota igual. La transacción es una: el flag rollback-only es global a ella.

**Propagación con casos de uso reales:**
- `REQUIRED`: default correcto para casi todo.
- `REQUIRES_NEW`: auditoría/outbox que debe persistir aunque la transacción de negocio haga rollback. Ojo: suspende la transacción actual y **toma una segunda conexión del pool** → con pool pequeño y anidamiento, deadlock de pool (todas las conexiones esperando a que se libere una conexión que espera al pool).
- `NESTED`: savepoint JDBC — rollback parcial dentro de la misma transacción (no soportado por JPA/Hibernate como tal; funciona con JdbcTemplate).
- `MANDATORY`: contratos internos ("este DAO exige transacción externa").

**Otros puntos que suman:**
- `readOnly = true`: hint que permite a Hibernate saltarse dirty checking (menos CPU/memoria) y a algunos drivers/replicas enrutar a réplica de lectura. No es una garantía de seguridad.
- Timeout: `@Transactional(timeout = 5)` — sin él, una query lenta retiene la conexión y bloquea locks minutos.
- **La transacción retiene una conexión del pool todo el método**: nunca hacer llamadas HTTP/Kafka dentro de `@Transactional` — es la causa número uno de agotamiento de HikariCP en microservicios.

**Qué espera el entrevistador:** self-invocation con su porqué (proxy), reglas de rollback exactas, `UnexpectedRollbackException`, y la disciplina de transacciones cortas sin I/O externo dentro.

---

## 3. ¿Cómo implementarías circuit breakers con Resilience4j y qué configuración importa de verdad?
**Categoría:** Resiliencia · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un circuit breaker corta las llamadas a una dependencia que está fallando para no gastar recursos en peticiones condenadas y darle aire para recuperarse. Resilience4j implementa la máquina CLOSED → OPEN (al superar el umbral de fallos en una ventana deslizante) → HALF_OPEN (deja pasar N llamadas de prueba) → CLOSED/OPEN. La configuración crítica: tipo y tamaño de ventana, `failureRateThreshold`, `slowCallDurationThreshold` (las llamadas lentas también deben contar), `waitDurationInOpenState` y qué excepciones cuentan como fallo. Se combina con TimeLimiter, Retry y Bulkhead en orden correcto.

### 📖 Respuesta detallada
```yaml
resilience4j:
  circuitbreaker:
    instances:
      paymentService:
        slidingWindowType: COUNT_BASED
        slidingWindowSize: 50
        minimumNumberOfCalls: 20          # no abrir con 3 llamadas tras el deploy
        failureRateThreshold: 50          # % de fallos para abrir
        slowCallDurationThreshold: 2s     # lenta == fallo a efectos del breaker
        slowCallRateThreshold: 80
        waitDurationInOpenState: 10s
        permittedNumberOfCallsInHalfOpenState: 5
        automaticTransitionFromOpenToHalfOpenEnabled: true
        recordExceptions: [java.io.IOException, java.util.concurrent.TimeoutException]
        ignoreExceptions: [com.acme.BusinessException]   # un 404 de negocio NO es fallo
  timelimiter:
    instances:
      paymentService:
        timeoutDuration: 2s
```

```java
@Service
public class PaymentClient {

    @CircuitBreaker(name = "paymentService", fallbackMethod = "fallback")
    @TimeLimiter(name = "paymentService")
    @Retry(name = "paymentService")
    public CompletableFuture<PaymentStatus> charge(ChargeRequest req) {
        return CompletableFuture.supplyAsync(() -> restClient.post()
                .uri("/charges").body(req).retrieve().body(PaymentStatus.class),
            ioExecutor);
    }

    // Misma firma + Throwable al final. Fallback ≠ "devolver algo inventado":
    private CompletableFuture<PaymentStatus> fallback(ChargeRequest req, Throwable t) {
        return CompletableFuture.completedFuture(PaymentStatus.unknownPending(req.id()));
    }
}
```

**Puntos que separan a un senior:**
1. **`ignoreExceptions` para errores de negocio:** un 400/404 significa que la dependencia FUNCIONA. Si cuentan como fallo, un cliente enviando requests inválidos te abre el breaker y provocas un outage autoinfligido.
2. **Slow calls:** la mayoría de los incidentes no son errores sino latencia. Un breaker que solo mira excepciones no se abre mientras la dependencia responde en 30 s y agota tus thread pools. `slowCallDurationThreshold` + `TimeLimiter` son obligatorios.
3. **Orden de aspectos:** por defecto Resilience4j aplica Retry(CircuitBreaker(TimeLimiter(llamada))). Cada retry cuenta individualmente en el breaker (lo razonable). Hay que poder razonar el orden: ¿quiero reintentar cuando el breaker está abierto? Normalmente no — `CallNotPermittedException` no debe reintentarse (se configura en `retryExceptions`/`ignoreExceptions` del Retry).
4. **Fallbacks honestos:** cache stale, valor por defecto degradado, respuesta "pending" con reconciliación posterior, o fallo rápido con error claro. Un fallback que llama a otra dependencia también necesita su breaker.
5. **minimumNumberOfCalls:** sin él, tras un deploy con 2 llamadas y 1 fallo → 50% → breaker abierto. Clásico.
6. **Observabilidad:** Resilience4j publica métricas Micrometer (`resilience4j_circuitbreaker_state`, tasa de fallos) y eventos; hay que alertar sobre transiciones a OPEN — un breaker abierto es un incidente, el breaker solo ha contenido el daño.
7. **Bulkhead complementario:** el breaker limita *si* llamas; el bulkhead (semáforo o thread pool) limita *cuántas* llamadas concurrentes — protege tus hilos aunque el breaker esté cerrado.

**Error común:** breaker por servicio en vez de por *instancia de dependencia + operación*: mezclar en un mismo breaker el endpoint crítico y uno secundario hace que un fallo del secundario corte el crítico.

---

## 4. Comunicación síncrona vs asíncrona entre microservicios: ¿cómo decides?
**Categoría:** Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
Síncrono (REST/gRPC) cuando el llamador necesita la respuesta para continuar (validaciones, lecturas, orquestación con respuesta inmediata al usuario): simple y con consistencia inmediata, pero acopla disponibilidad y latencia (la disponibilidad compuesta es el producto de las individuales). Asíncrono (Kafka/colas) para hechos consumables por otros ("OrderPlaced"), trabajo diferible y desacoplar picos: resiliencia y escalado independiente a cambio de consistencia eventual, idempotencia obligatoria y más complejidad operativa. La pregunta guía: ¿el llamador necesita el resultado AHORA, o está comunicando un hecho?

### 📖 Respuesta detallada
**Los costes reales del síncrono que hay que verbalizar:**
- **Acoplamiento temporal:** ambos servicios deben estar vivos a la vez. Cadena de 5 servicios al 99.9% → 99.5% compuesto (~3.6 h/mes de error budget extra).
- **Acoplamiento de latencia:** tu p99 incluye el p99 de toda la cadena; los picos se suman.
- **Fallos en cascada:** sin timeouts+breakers+bulkheads, la lentitud downstream agota tus thread pools y te tumba (ver caso en el archivo 3).
- **Backpressure implícito:** un pico tuyo golpea al downstream sin amortiguador.

**Los costes reales del asíncrono:**
- **Consistencia eventual** que el negocio debe aceptar (¿puede la UI mostrar "pedido en proceso"?).
- **Duplicados y desorden**: at-least-once obliga a consumidores idempotentes; el orden solo se garantiza por partición.
- **Publicación atómica:** el problema dual-write (BD + broker) exige Outbox o listeners transaccionales — no basta con "publico después del commit".
- **Operación:** lag, DLQs, replays, evolución de esquemas (Schema Registry, compatibilidad backward).
- **Trazabilidad:** el flujo se fragmenta; sin OpenTelemetry con propagación por headers de Kafka, depurar es arqueología.

**Patrones híbridos que espera oír el entrevistador:**
1. **Síncrono para queries, asíncrono para efectos colaterales:** `POST /orders` valida y persiste síncronamente, responde 202/201, y emite `OrderPlaced` para que facturación, stock y notificaciones reaccionen.
2. **Request-reply sobre mensajería** (correlationId + cola de respuesta): raro, útil cuando necesitas las garantías del broker con semántica de petición.
3. **CQRS ligero:** escrituras síncronas al servicio dueño; lecturas desde vistas materializadas alimentadas por eventos, eliminando el fan-out síncrono de lecturas (el agregador que llama a 6 servicios para pintar una pantalla).
4. **Sagas** para flujos multi-servicio con compensaciones (pregunta 11).

```java
// Anti-patrón frecuente: "asíncrono" que en realidad es síncrono encubierto
kafkaTemplate.send("orders", event).get(5, TimeUnit.SECONDS); // bloquea el request
// y el opuesto: fire-and-forget sin callback → pérdidas silenciosas
kafkaTemplate.send("orders", event); // sin whenComplete ni manejo de error
```

**Criterios de decisión resumidos (la checklist que cierra la respuesta):** ¿necesita respuesta inmediata? ¿tolera el negocio segundos de inconsistencia? ¿la operación es naturalmente un hecho/evento? ¿los picos de carga deben amortiguarse? ¿cuántos consumidores tiene la información (1 → quizá llamada; N → evento)? Y el meta-criterio senior: empezar síncrono simple con resiliencia bien hecha, e introducir eventos donde el dominio los pida — no "todo eventos" por moda, que produce sistemas imposibles de razonar.

---

## 5. Kafka: consumer groups y rebalancing — ¿qué pasa exactamente y cómo lo controlas?
**Categoría:** Kafka · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un consumer group reparte las particiones de los topics entre sus miembros: cada partición la lee exactamente un consumer del grupo (paralelismo máximo = número de particiones). Cuando un miembro entra, sale o se considera muerto (falla el heartbeat en `session.timeout.ms`, o excede `max.poll.interval.ms` entre polls), el group coordinator dispara un rebalance que reasigna particiones. Con el protocolo eager clásico, todos sueltan todo (stop-the-world); con `CooperativeStickyAssignor` solo se mueven las particiones necesarias. Los rebalances frecuentes son la causa típica de lag y duplicados.

### 📖 Respuesta detallada
**Mecánica:** cada grupo tiene un *group coordinator* (un broker). Los miembros envían heartbeats desde un hilo aparte; el procesamiento del poll loop se vigila con `max.poll.interval.ms` (default 5 min) — si tu `poll()` tarda más (procesamiento lento de un batch), el consumer es expulsado aunque los heartbeats sigan llegando. Esto produce el bucle infernal clásico: procesas lento → expulsión → rebalance → otro consumer relee el mismo batch → también tarda → rebalance perpetuo, lag creciendo y duplicados masivos.

**Parámetros que hay que dominar:**
```properties
max.poll.records=100              # menos records por poll => polls más frecuentes
max.poll.interval.ms=300000       # techo de tiempo de procesamiento por batch
session.timeout.ms=45000          # detección de muerte (heartbeats)
heartbeat.interval.ms=15000       # ~1/3 del session timeout
partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor
group.instance.id=pod-orders-0    # static membership: reinicios sin rebalance
```
- **`max.poll.records` × tiempo-por-record < `max.poll.interval.ms`** con margen: la cuenta que todo senior debe hacer.
- **Static membership** (`group.instance.id` único por pod): un reinicio de pod (deploy, OOM) dentro de `session.timeout.ms` NO dispara rebalance — el miembro vuelve y recupera sus particiones. Esencial en Kubernetes con rolling restarts.
- **Cooperative rebalancing:** `CooperativeStickyAssignor` hace el rebalance incremental — los consumers conservan lo que no cambia y siguen procesando. Desde Kafka 4 el nuevo protocolo de grupos (KIP-848) mueve la lógica al broker y lo hace aún más suave.

**Efectos secundarios que hay que mencionar:**
1. **Duplicados:** tras un rebalance, el nuevo dueño de la partición empieza en el último offset COMMITEADO. Todo lo procesado sin commitear se reprocesa → consumidores idempotentes obligatorios.
2. **Pérdida (peor):** con `enable.auto.commit=true`, el auto-commit puede confirmar offsets de mensajes aún no procesados si procesas asíncronamente → tras crash, esos mensajes se saltan. En Spring Kafka la respuesta es dejar el commit al listener container (`AckMode.RECORD` o `MANUAL`), no el auto-commit del cliente.
3. **Listeners de rebalance:** `ConsumerRebalanceListener.onPartitionsRevoked` es el sitio para commitear offsets pendientes y drenar trabajo en vuelo antes de ceder la partición.

```java
@KafkaListener(topics = "orders", groupId = "billing",
               concurrency = "3")   // 3 hilos => hasta 3 particiones en este pod
public void onOrder(ConsumerRecord<String, OrderEvent> rec, Acknowledgment ack) {
    process(rec.value());
    ack.acknowledge();              // commit manual tras procesar
}
```

**Qué espera el entrevistador:** distinguir `session.timeout` (muerte del proceso) de `max.poll.interval` (procesamiento lento), el bucle de rebalances por batches lentos, static membership para Kubernetes, cooperative assignor, y la relación rebalance ↔ duplicados ↔ idempotencia.

---

## 6. Kafka: ¿qué significa exactly-once realmente y cómo se consigue con Java?
**Categoría:** Kafka · **Tipo:** Conceptual

### 📝 Respuesta resumen
Kafka ofrece tres piezas: **producer idempotente** (deduplica reintentos del producer por PID+sequence, por partición y sesión), **transacciones** (escrituras atómicas a varias particiones + commit de offsets del consumer en la misma transacción, habilitando exactly-once en pipelines consume-transform-produce dentro de Kafka, p. ej. Kafka Streams con `processing.guarantee=exactly_once_v2`) y consumers `read_committed`. Pero nada de eso cubre efectos externos (BD, HTTP): ahí el "exactly-once" real es **at-least-once + idempotencia del consumidor** o commit atómico de datos y offsets en la MISMA base de datos.

### 📖 Respuesta detallada
**Pieza 1 — Producer idempotente** (`enable.idempotence=true`, default desde Kafka 3): el broker asigna un Producer ID y cada batch lleva un sequence number por partición; los reintentos duplicados se descartan. Elimina duplicados causados por retries de red del producer. Límites: por partición y por sesión del producer — si el *proceso* reenvía el mensaje (p. ej. tu servicio reintenta a nivel de aplicación tras un timeout), eso son dos mensajes distintos.

**Pieza 2 — Transacciones Kafka:**
```java
props.put("transactional.id", "order-processor-0"); // estable por instancia
producer.initTransactions();
try {
    producer.beginTransaction();
    for (ConsumerRecord<String, String> rec : records) {
        producer.send(new ProducerRecord<>("enriched-orders", transform(rec)));
    }
    // offsets del consumer DENTRO de la transacción: o todo o nada
    producer.sendOffsetsToTransaction(currentOffsets(records), consumer.groupMetadata());
    producer.commitTransaction();
} catch (ProducerFencedException e) {
    producer.close(); // otra instancia con el mismo transactional.id nos ha "vallado"
} catch (KafkaException e) {
    producer.abortTransaction();
}
```
El `transactional.id` estable permite el *fencing*: si el proceso zombi resucita tras un rebalance, sus escrituras se rechazan (epoch antiguo). Los consumers downstream con `isolation.level=read_committed` no ven mensajes de transacciones abortadas. Kafka Streams empaqueta todo esto con `exactly_once_v2`. Coste: latencia extra (markers de transacción, commits por intervalo) y más complejidad en el broker.

**Pieza 3 — La frontera que define la seniority:** las transacciones Kafka NO abarcan tu base de datos ni llamadas HTTP. Para "consumo el evento y actualizo Postgres exactamente una vez" hay dos estrategias honestas:

1. **Idempotencia del consumidor** (la práctica estándar):
```java
@Transactional
public void handle(OrderEvent e) {
    // tabla processed_events(event_id PK): el duplicado viola la PK y se ignora
    if (!processedEventRepo.markProcessed(e.eventId())) return;
    orderRepository.applyChange(e);
}   // ambas escrituras en la MISMA transacción de BD
```
2. **Offsets en la BD:** guardar offset procesado junto a los datos en la misma transacción y hacer seek al arrancar — convierte el par (datos, progreso) en atómico.

**Errores comunes:** decir "activo exactly-once y ya" sin distinguir el ámbito (dentro de Kafka vs efectos externos); usar transactional.id aleatorio por arranque (rompe el fencing); ignorar que idempotence solo cubre retries del producer; y diseñar deduplicación por contenido del mensaje en vez de por un `eventId` estable generado en el origen.

**Qué espera el entrevistador:** las tres piezas con sus límites exactos, el patrón consume-transform-produce, fencing con transactional.id, y la conclusión: "en microservicios con BD, diseño para at-least-once + idempotencia; exactly-once de Kafka lo uso en pipelines Kafka→Kafka".

---

## 7. Patrón Saga: orquestación vs coreografía para transacciones distribuidas
**Categoría:** Patrones · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una saga descompone una transacción de negocio multi-servicio en pasos locales, cada uno con su transacción ACID local y una **compensación** que deshace su efecto si un paso posterior falla. En **coreografía**, cada servicio reacciona a eventos y emite los suyos (sin coordinador; simple para 2–3 pasos, difícil de razonar al crecer). En **orquestación**, un orquestador con máquina de estados persistente comanda cada paso y ejecuta compensaciones (flujo explícito y testeable; el orquestador es un punto de acoplamiento). No hay aislamiento: los efectos intermedios son visibles y las compensaciones son semánticas, no rollbacks.

### 📖 Respuesta detallada
**Ejemplo canónico — pedido:** reservar stock → cobrar → crear envío. Si el cobro falla, compensar liberando stock. Si el envío falla, compensar reembolsando y liberando.

**Orquestación (recomendable cuando el flujo tiene 3+ pasos o lógica condicional):**
```java
public sealed interface SagaState permits AwaitingStock, AwaitingPayment, AwaitingShipment, Completed, Compensating, Failed {}

@Component
public class OrderSagaOrchestrator {

    @KafkaListener(topics = "saga-replies")
    @Transactional
    public void onReply(SagaReply reply) {
        SagaInstance saga = sagaRepo.lockById(reply.sagaId());  // estado PERSISTENTE
        switch (saga.state()) {
            case AwaitingStock s -> {
                if (reply.success()) { saga.to(new AwaitingPayment()); commands.chargePayment(saga); }
                else saga.fail("sin stock");                     // nada que compensar aún
            }
            case AwaitingPayment p -> {
                if (reply.success()) { saga.to(new AwaitingShipment()); commands.createShipment(saga); }
                else { saga.to(new Compensating()); commands.releaseStock(saga); } // compensar hacia atrás
            }
            // ...
        }
    }
}
```
Puntos críticos: el estado de la saga se persiste (sobrevive reinicios), los comandos/eventos salen por **Outbox** (atómicos con el cambio de estado), cada paso es idempotente (las réplicas pueden duplicarse) y hay **timeouts por paso** (¿y si payments nunca responde? → scheduler que dispara compensación o alerta). Frameworks: Axon, Temporal, Camunda; o "a mano" con una tabla de estado + Kafka, que es lo que la mayoría hace y el entrevistador quiere ver que sabes construir.

**Coreografía:** OrderService emite `OrderCreated` → StockService reserva y emite `StockReserved` → PaymentService cobra y emite `PaymentCompleted` / `PaymentFailed` → StockService escucha `PaymentFailed` y libera. Ventaja: cero acoplamiento central, cada equipo autónomo. Desventajas: el flujo global no está escrito en ningún sitio (se descubre leyendo N servicios), riesgo de ciclos de eventos, y añadir un paso implica tocar varios servicios. Para verlo: tracing distribuido y documentación del flujo son imprescindibles.

**Lo que define la respuesta senior — las garantías perdidas:**
1. **Sin aislamiento (la I de ACID):** entre pasos, otros ven el estado intermedio (stock reservado de un pedido que se cancelará). Mitigaciones: *semantic locks* (estado PENDING con el recurso marcado), diseño de pasos conmutativo, o versiones/reservas con expiración.
2. **Compensación ≠ rollback:** un email enviado no se des-envía; un cobro se compensa con un reembolso (operación de negocio nueva, con sus propios fallos). Hay pasos **no compensables** (pivot transactions): se ordenan al final — primero los pasos compensables, luego el pivote, luego pasos "retriables" que deben acabar teniendo éxito.
3. **Fallos de la compensación:** reintentos con backoff + DLQ + alerta a operación humana. Un saga runner sin camino de escalado humano está incompleto.

**Cuándo evitar sagas:** si puedes rediseñar límites de servicios para que la invariante viva en UN servicio (la mejor transacción distribuida es la que no existe), o si una consistencia eventual simple con reconciliación batch basta.

---

## 8. Patrón Outbox: ¿cómo publicas eventos de forma atómica con tu transacción de BD?
**Categoría:** Patrones / Kafka · **Tipo:** Conceptual

### 📝 Respuesta resumen
El problema dual-write: si guardas en la BD y luego publicas a Kafka (o al revés), un crash entre ambas deja los sistemas inconsistentes — y no existe transacción que abarque BD y broker. Outbox lo resuelve escribiendo el evento en una tabla `outbox` **dentro de la misma transacción local** que el cambio de negocio; un proceso aparte (Debezium leyendo el WAL, o un poller) lo publica a Kafka después. Garantiza at-least-once con orden por agregado; los consumidores deben ser idempotentes.

### 📖 Respuesta detallada
**Por qué las alternativas ingenuas fallan:**
```java
// Opción A: publicar tras commit
orderRepo.save(order);          // commit OK
kafkaTemplate.send(...);        // crash aquí → evento perdido para siempre

// Opción B: publicar dentro de la transacción
kafkaTemplate.send(...).get();  // enviado
orderRepo.save(order);          // rollback → evento fantasma de algo que no ocurrió
```
`@TransactionalEventListener(phase = AFTER_COMMIT)` tiene el mismo agujero que A (crash post-commit y pre-envío) — sirve para efectos "best effort", no para eventos de integración con garantías.

**Implementación:**
```sql
CREATE TABLE outbox (
  id            UUID PRIMARY KEY,          -- eventId para dedupe downstream
  aggregate_type VARCHAR(64)  NOT NULL,    -- "Order"
  aggregate_id   VARCHAR(64)  NOT NULL,    -- clave de partición Kafka → orden por agregado
  event_type     VARCHAR(128) NOT NULL,
  payload        JSONB        NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```
```java
@Transactional
public void placeOrder(PlaceOrderCmd cmd) {
    Order order = Order.create(cmd);
    orderRepo.save(order);
    outboxRepo.save(OutboxEvent.of("Order", order.id(),
        "OrderPlaced", json(new OrderPlaced(order))));   // MISMA transacción → atómico
}
```

**El relay — dos variantes:**
1. **CDC con Debezium (preferida):** Debezium lee el WAL de Postgres (logical replication) y publica cada INSERT de `outbox` a Kafka con el SMT `EventRouter` (rutea por `aggregate_type`, usa `aggregate_id` como key). Ventajas: latencia baja (ms), sin carga de polling, orden de commit preservado. Operativa a vigilar: slot de replicación (un slot huérfano retiene WAL y llena el disco), y limpieza de la tabla (Debezium permite insertar+delete en la misma transacción: el DELETE se ignora y la tabla no crece).
2. **Polling publisher:** un scheduler lee `outbox` ordenado, publica y borra/marca. Más simple, sin infraestructura CDC; latencia = intervalo de poll, y con múltiples instancias necesitas `SELECT ... FOR UPDATE SKIP LOCKED` para no publicar duplicado (aunque duplicar es "solo" at-least-once, que ya asumes).

**Garantías y matices que debe verbalizar un senior:**
- Resultado: **at-least-once** (el relay puede publicar y morir antes de marcar) → el `id` del outbox viaja como header/campo `eventId` para deduplicación en consumidores.
- **Orden:** por `aggregate_id` (misma key → misma partición). Orden global no existe ni suele necesitarse.
- El payload debe ser el **contrato público** (event schema versionado), no un volcado de la entidad interna — outbox también es una frontera de API.
- Alternativa emergente: **listen-to-yourself** y, en Postgres puro, `LISTEN/NOTIFY` como trigger del poller. Y si ya hay Event Sourcing, el event store ES el outbox.

**Qué espera el entrevistador:** articular el dual-write con sus dos órdenes de fallo, atomicidad por transacción local, Debezium vs polling con trade-offs, y la cadena completa: outbox → at-least-once → idempotencia del consumidor.

---

## 9. Proxies en Spring (JDK vs CGLIB) y ciclo de vida de beans: ¿qué errores reales causan?
**Categoría:** Spring internals · **Tipo:** Conceptual

### 📝 Respuesta resumen
Spring implementa AOP (`@Transactional`, `@Cacheable`, `@Async`, `@PreAuthorize`) con proxies dinámicos: JDK proxies si el bean implementa interfaces (por interfaz), CGLIB (subclase generada) en caso contrario — Boot fuerza CGLIB por defecto (`proxyTargetClass=true`). Errores derivados: self-invocation que ignora aspectos, métodos finales/privados no interceptados, inyección de campo en el proxy vs target, y `@Configuration` con `proxyBeanMethods`. Del ciclo de vida: orden de `@PostConstruct`, `BeanPostProcessor`s, dependencias circulares y beans `prototype` inyectados en singletons.

### 📖 Respuesta detallada
**Cómo funciona:** un `BeanPostProcessor` (p. ej. `AbstractAutoProxyCreator`) envuelve el bean tras su creación si algún advisor aplica. Lo que se inyecta en los demás beans es el **proxy**; `this` dentro del bean es el **target**. De ahí todos los bugs:

```java
@Service
public class ReportService {
    @Cacheable("reports")
    public Report heavy(String id) { ... }

    public Report entry(String id) {
        return heavy(id);   // BUG: this.heavy → sin caché (no pasa por el proxy)
    }
}
```
Mismo patrón con `@Async` (se ejecuta síncrono al auto-invocarse), `@Transactional`, `@Retryable`. Soluciones: separar en dos beans (la correcta), o inyectar el propio proxy (`ObjectProvider<ReportService>` / `AopContext.currentProxy()` como último recurso).

**CGLIB — limitaciones concretas:** no puede proxear clases/métodos `final` (los aspectos se ignoran EN SILENCIO en el método final — Spring solo loguea un warning), necesita constructor accesible, y los campos del proxy no están inicializados (por eso `getField()` directo sobre un proxy inyectado da null — acceder siempre por métodos).

**`@Configuration(proxyBeanMethods = false)`:** por defecto, las clases `@Configuration` se proxean con CGLIB para que llamar `otroBean()` dentro de la clase devuelva el singleton del contexto y no una instancia nueva. Con `proxyBeanMethods = false` (lite mode, usado por todas las autoconfiguraciones de Boot) ese inter-bean call crea instancias nuevas — se gana arranque más rápido a cambio de disciplina: pasar dependencias como parámetros del método `@Bean`.

**Ciclo de vida — lo que hay que saber ordenado:** instanciación → inyección de dependencias → `Aware`s → `BeanPostProcessor.postProcessBeforeInitialization` → `@PostConstruct`/`InitializingBean` → `postProcessAfterInitialization` (aquí nace el proxy) → listo. Consecuencia sutil: **en `@PostConstruct` los aspectos AÚN no aplican si alguien te llama por `this`**, y llamar a un método `@Transactional` propio desde `@PostConstruct` no abre transacción. Para lógica de arranque con el contexto completo: `ApplicationRunner` o `@EventListener(ApplicationReadyEvent.class)`.

**Dependencias circulares:** Spring las resuelve para singletons con inyección por campo/setter usando *early references* (three-level cache), pero fallan con constructor injection — y Boot 2.6+ las prohíbe por defecto (`spring.main.allow-circular-references=false`). La respuesta senior: una circular es un defecto de diseño; se rompe extrayendo un tercer componente, no reactivando el flag. Matiz extra: si un bean en el ciclo necesita proxy, puedes acabar con la versión sin proxear inyectada en un lado (`BeanCurrentlyInCreationException` o aspectos perdidos).

**Prototype en singleton:** inyectar un bean `prototype` en un singleton congela UNA instancia. Si se necesita una nueva por uso: `ObjectProvider<T>.getObject()` o `@Lookup`.

**Qué espera el entrevistador:** que expliques los bugs por el mecanismo (proxy vs target), el silencio peligroso de los métodos final, y el orden del ciclo de vida con sus implicaciones prácticas — es la pregunta que separa a quien usa Spring de quien lo entiende.

---

## 10. Spring Cloud Config y configuración dinámica: ¿cómo refrescas configuración sin redeploy y qué riesgos tiene?
**Categoría:** Spring Cloud · **Tipo:** Conceptual

### 📝 Respuesta resumen
Spring Cloud Config Server centraliza configuración (backend Git/Vault) y la sirve por perfiles y labels; los clientes la cargan al arranque. El refresco en caliente usa `@RefreshScope`: al disparar `/actuator/refresh` (o Spring Cloud Bus con Kafka/RabbitMQ para difundirlo a toda la flota), los beans anotados se destruyen y recrean con las nuevas properties. Riesgos: beans con estado que se recrean en medio de una petición, properties no-refrescables (pools, puertos), config drift entre instancias, y el Config Server como dependencia crítica de arranque. En Kubernetes, ConfigMaps + reload o herramientas como Vault Agent compiten con esta pieza.

### 📖 Respuesta detallada
**Arquitectura:** el cliente pide al server `/{app}/{profile}/{label}` durante el bootstrap (hoy vía `spring.config.import=configserver:`), y las property sources remotas se insertan con mayor precedencia que las locales. El server compone: `application.yml` global + `app.yml` + `app-{profile}.yml` del repo Git, o secretos desde Vault.

**El mecanismo de refresh que hay que saber explicar:**
1. `POST /actuator/refresh` en una instancia → `ContextRefresher` recarga las property sources remotas, calcula el diff de claves y publica `EnvironmentChangeEvent`.
2. Los `@ConfigurationProperties` se rebindean automáticamente (sin `@RefreshScope`).
3. Los beans `@RefreshScope` no se recrean en ese momento: se invalida su caché y se reconstruyen perezosamente **en el siguiente acceso** — el proxy del scope resuelve el target en cada llamada.
4. Para toda la flota: Spring Cloud Bus (`/actuator/busrefresh`) propaga el evento por Kafka/RabbitMQ, típicamente disparado por un webhook de Git (`/monitor`).

```java
@RefreshScope
@Component
public class PricingClient {
    private final RestClient client;
    public PricingClient(@Value("${pricing.base-url}") String baseUrl) {
        this.client = RestClient.create(baseUrl);   // se reconstruye al refrescar
    }
}
```

**Riesgos y pitfalls (el corazón de la respuesta senior):**
1. **Estado perdido:** un bean `@RefreshScope` con caches internas, contadores o conexiones se destruye y recrea; si media petición lo está usando, la petición en curso termina con la instancia vieja (el proxy mantiene la referencia), pero cualquier estado acumulado se pierde. No anotar beans con estado caro sin pensarlo.
2. **No todo es refrescable:** `server.port`, tamaños de pools ya creados, cualquier cosa leída una vez en un `@PostConstruct` de un bean no-refresh. Ilusión de "cambié la property" sin efecto → config drift mental.
3. **Drift real entre instancias:** si el bus falla en una instancia, la flota queda mixta. Mitigación: exponer la versión de config como métrica/label (`/actuator/env` restringido, o info endpoint) y alertar sobre divergencia.
4. **Config Server caído:** por defecto el cliente arranca igual sin config remota (¡con defaults quizá peligrosos!) — configurar `spring.cloud.config.fail-fast=true` + retry en servicios donde la config remota es crítica.
5. **Secretos:** el repo Git NO es sitio para secretos; se integra Vault (backend compuesto) o {cipher} con claves gestionadas. Auditoría de cambios = historia de Git, una de las grandes ventajas del modelo.
6. **Alternativa Kubernetes:** ConfigMaps/Secrets montados + `spring-cloud-kubernetes-config` con reload, o simplemente rolling restart por deployment (config inmutable, GitOps con ArgoCD). La respuesta madura: en K8s con GitOps, Config Server aporta menos; su nicho es flotas mixtas, refresh sin restart y composición con Vault.

**Qué espera el entrevistador:** el flujo bootstrap → refresh → bus completo, la semántica perezosa de `@RefreshScope`, los límites de lo refrescable y una opinión formada sobre Config Server vs configuración nativa de Kubernetes.

---

## 11. Spring Cloud Gateway: ¿qué papel juega y cómo implementarías rate limiting y resiliencia en el borde?
**Categoría:** Spring Cloud · **Tipo:** Conceptual

### 📝 Respuesta resumen
Spring Cloud Gateway es un API gateway reactivo (Netty/WebFlux) que enruta por predicados (path, host, header) y aplica filtros (globales o por ruta): autenticación, rate limiting, circuit breaking, reescritura, CORS. Centraliza preocupaciones transversales del borde: un solo punto para AuthN/AuthZ inicial, límites de tráfico por cliente, canary/weight routing y observabilidad de entrada. Al ser reactivo aguanta mucha concurrencia con pocos hilos, pero cualquier código bloqueante en un filtro lo degrada gravemente.

### 📖 Respuesta detallada
```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: orders
          uri: lb://orders-service            # integración con service discovery
          predicates:
            - Path=/api/orders/**
          filters:
            - StripPrefix=1
            - name: RequestRateLimiter
              args:
                redis-rate-limiter.replenishRate: 50    # tokens/seg sostenidos
                redis-rate-limiter.burstCapacity: 100   # pico permitido
                key-resolver: "#{@apiKeyResolver}"      # límite POR cliente
            - name: CircuitBreaker
              args:
                name: ordersCb
                fallbackUri: forward:/fallback/orders
            - name: Retry
              args:
                retries: 2
                methods: GET                  # solo idempotentes ¡nunca POST!
                backoff: { firstBackoff: 50ms, maxBackoff: 200ms, factor: 2 }
```
```java
@Bean
KeyResolver apiKeyResolver() {
    return exchange -> Mono.just(
        Optional.ofNullable(exchange.getRequest().getHeaders().getFirst("X-Api-Key"))
                .orElse("anonymous"));
}
```

**Puntos de profundidad que espera el entrevistador:**
1. **Rate limiting distribuido:** el `RedisRateLimiter` implementa token bucket con un script Lua atómico en Redis — necesario porque hay N réplicas del gateway y el límite debe ser global. Decisiones: la clave (por API key, por usuario, por IP — cuidado con NAT corporativos), qué responder (429 + `Retry-After`), y si Redis cae: por defecto deja pasar (fail-open) — hay que decidir conscientemente fail-open vs fail-closed según el caso (protección de infraestructura → open; facturación por uso → closed).
2. **No bloquear el event loop:** un filtro que llama a JDBC, o un `block()`, congela workers de Netty y colapsa TODO el gateway. Cualquier lookup (auth, config) debe ser reactivo o cacheado. Es la causa #1 de incidentes con gateways custom.
3. **Retry solo idempotente:** reintentar POST duplica pedidos. Y retry en el gateway se multiplica con retries del cliente y del servicio → tormentas de reintentos (3×3×3 = 27 requests). Presupuesto de retries en UNA capa.
4. **Qué NO meter en el gateway:** lógica de negocio, agregación compleja de respuestas, transformaciones pesadas. El gateway engorda hasta volverse un mini-monolito frente a todos — la disciplina de mantenerlo tonto es una señal de madurez arquitectónica. Autorización fina (¿puede este usuario ver ESTE pedido?) pertenece al servicio; el gateway hace AuthN y autorización gruesa (scopes/roles).
5. **Alternativas y contexto:** en Kubernetes compite con Ingress/Envoy/Kong/service mesh. Criterio: si el equipo es Java y necesita filtros programables con lógica propia (p. ej. canary por header con estado en Redis), SCG encaja; si solo es routing+TLS+límites estándar, un gateway de infraestructura da menos que mantener. Mencionar que el modo **Server MVC** (spring-cloud-gateway-mvc, no reactivo con virtual threads) existe desde Spring Cloud 2023.x añade actualidad.
6. **Observabilidad de borde:** el gateway es el sitio natural para generar/propagar `traceparent`, medir latencia por ruta y devolver `X-Request-Id` — el punto de partida de cualquier investigación de incidentes.

---

## 12. CQRS y Event Sourcing: ¿qué resuelven, cómo se implementan y cuándo son una mala idea?
**Categoría:** Patrones · **Tipo:** Conceptual

### 📝 Respuesta resumen
CQRS separa el modelo de escritura (comandos, invariantes) del de lectura (queries, vistas desnormalizadas optimizadas por pantalla), sincronizados normalmente por eventos — resuelve el conflicto entre un modelo de dominio rico y lecturas rápidas/escalables. Event Sourcing va más allá: la fuente de verdad no es el estado actual sino la secuencia inmutable de eventos; el estado se reconstruye reproduciéndolos (con snapshots como optimización). Aportan auditoría perfecta, replay y modelos temporales, a cambio de complejidad seria: consistencia eventual en lecturas, versionado de eventos eterno y operación no trivial. La mayoría de los sistemas necesitan como mucho CQRS ligero, no ES.

### 📖 Respuesta detallada
**CQRS pragmático (el nivel que casi toda empresa usa):** el servicio de pedidos escribe en su Postgres normalizado; emite eventos (vía outbox); un proyector construye vistas de lectura — un índice Elasticsearch para búsqueda, una tabla desnormalizada `order_summary` para el listado, Redis para el detalle caliente. Las lecturas no compiten con las escrituras, cada vista se optimiza a su consulta, y se escala cada lado por separado.

```java
// Lado escritura: el agregado protege invariantes
@Transactional
public void handle(CancelOrder cmd) {
    Order order = orderRepo.findById(cmd.orderId()).orElseThrow();
    order.cancel(cmd.reason());              // valida estado, lanza si no procede
    outbox.publish(new OrderCancelled(order.id(), cmd.reason(), Instant.now()));
}

// Lado lectura: proyector idempotente
@KafkaListener(topics = "orders")
public void project(OrderEvent e) {
    switch (e) {
        case OrderCancelled c -> summaryRepo.markCancelled(c.orderId(), c.at());
        case OrderPlaced p -> summaryRepo.insertSummary(SummaryRow.from(p));
        // upserts por clave → reprocesar es inocuo
        default -> { }
    }
}
```
**El coste a verbalizar:** la vista va *detrás* de la escritura (read-your-writes roto: el usuario cancela y el listado aún lo muestra activo). Mitigaciones: UI optimista, leer del modelo de escritura las pantallas propias post-acción, o esperar la proyección con un token de versión.

**Event Sourcing:** se persisten eventos (`OrderPlaced`, `ItemAdded`, `OrderCancelled`) en un event store (tabla append-only con `(aggregate_id, seq)` único y optimistic locking por versión esperada; o EventStoreDB/Axon). Cargar un agregado = leer sus eventos + `apply` cada uno (con snapshot cada N para acotar). Ventajas reales: auditoría total y a prueba de bugs (el "por qué" está en los datos), depurar reproduciendo la historia exacta, proyecciones nuevas con replay retroactivo, y modelar el tiempo (¿qué sabíamos el día X?).

**Los costes que hacen de ES una decisión seria:**
1. **Versionado eterno de eventos:** los eventos de hace 3 años deben poder leerse siempre → upcasters/migraciones de esquema acumulativas. El evento es un contrato para siempre.
2. **Rediseños dolorosos:** cambiar límites de agregados con años de eventos requiere migraciones de streams.
3. **Queries solo por proyecciones:** hasta el "dame el pedido 42" pasa por reconstrucción o proyección.
4. **Disciplina de equipo:** todos deben pensar en eventos e idempotencia; el onboarding se encarece.
5. **GDPR/borrado:** eventos inmutables vs derecho al olvido → crypto-shredding o payloads referenciados.

**Cuándo sí ES:** dominios donde la historia ES el negocio (ledger financiero, trading, apuestas, auditoría regulatoria) o colaboración con conflictos (detectar y resolver con la secuencia). **Cuándo no:** CRUDs, catálogos, equipos sin experiencia previa en el patrón. Respuesta senior tipo: "CQRS a nivel de vistas lo aplico con frecuencia; Event Sourcing solo lo he defendido para el subdominio de ledger, y con un framework probado, no artesanal".

---

## 13. Service discovery: ¿Eureka, DNS de Kubernetes o service mesh? ¿Client-side o server-side?
**Categoría:** Infraestructura de microservicios · **Tipo:** Conceptual

### 📝 Respuesta resumen
El discovery resuelve "¿en qué IPs vive orders-service ahora mismo?" en un entorno donde las instancias nacen y mueren. Dos modelos: **client-side** (el cliente consulta un registry — Eureka/Consul — y balancea él mismo con Spring Cloud LoadBalancer) y **server-side** (el cliente llama a un nombre estable y una pieza intermedia balancea — Kubernetes Service/kube-proxy, o el sidecar de un mesh). En Kubernetes, el DNS + Services nativos hacen a Eureka redundante para la mayoría; el mesh (Istio/Linkerd) añade mTLS, retries y traffic shifting sin tocar código. La respuesta senior es contextual: Eureka fuera de K8s o en migraciones; nativo dentro de K8s; mesh cuando las políticas de red justifican su coste.

### 📖 Respuesta detallada
**Client-side con Eureka (el modelo Spring Cloud clásico):** cada instancia se registra (heartbeats cada 30 s, expulsión al fallar); los clientes cachean el registro y balancean localmente:
```java
@Bean @LoadBalanced
RestClient.Builder restClientBuilder() { return RestClient.builder(); }
// uso: restClientBuilder.build().get().uri("http://orders-service/api/orders/42")...
```
Detalles que hay que dominar: la **propagación es eventual** (registro nuevo tarda hasta ~30–60 s en ser visible por caches del server y cliente; una instancia muerta sigue recibiendo tráfico ese lapso → se compensa con retries a otra instancia + health checks); y la **self-preservation mode** de Eureka: si demasiados heartbeats fallan a la vez, asume partición de red y DEJA de expulsar instancias (prefiere stale a vacío — AP en términos CAP, frente a Consul/etcd que son CP). Preguntar esto es un clásico: Eureka prioriza disponibilidad del registro sobre exactitud.

**Kubernetes nativo:** un `Service` da un nombre DNS estable (`orders-service.ns.svc.cluster.local`) y kube-proxy/IPVS balancea a los endpoints listos (readiness probes deciden quién recibe tráfico). Ventajas: cero infraestructura extra, políticas de despliegue integradas (rolling con readiness), idéntico para cualquier lenguaje. Limitación: balanceo por conexión, no por request — con HTTP/2/gRPC (una conexión larga multiplexada) el balanceo L4 degenera en "todo a un pod"; se resuelve con balanceo client-side por DNS headless (`ClusterIP: None` + Spring Cloud LoadBalancer o gRPC client LB) o con un mesh que balancea L7.

**Service mesh:** sidecars (Envoy) o node proxies interceptan el tráfico: discovery + balanceo L7 + mTLS + retries/timeouts/outlier detection + traffic split (canary) por configuración, homogéneo para todos los lenguajes. Coste: complejidad operativa notable, latencia extra (~ms), y solapamiento con Resilience4j — hay que decidir DÓNDE viven los retries y breakers (regla práctica: red y seguridad en el mesh; fallbacks y lógica de degradación en la aplicación, porque requieren contexto de negocio).

**Errores comunes en la respuesta:** montar Eureka dentro de Kubernetes "porque el tutorial lo traía" (dos sistemas de discovery en desacuerdo, especialmente divertido durante rolling restarts); ignorar el problema gRPC/L4; y no mencionar readiness probes como la mitad del discovery (registrarse es fácil; lo difícil es NO recibir tráfico antes de estar listo y desregistrarse limpiamente en el shutdown — `preStop` hook + graceful shutdown de Spring: `server.shutdown=graceful`).

**Qué espera el entrevistador:** los dos modelos con ejemplos, CAP aplicado (self-preservation), el matiz de HTTP/2, y criterio de "no añadas registry donde la plataforma ya lo da".

---

## 14. Observabilidad en microservicios Java: Micrometer, OpenTelemetry y qué instrumentar
**Categoría:** Observabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Tres señales: métricas (agregados: RED — rate, errors, duration — por endpoint; recursos: pools, GC, lag), trazas distribuidas (el viaje de UNA petición entre servicios, con `traceparent` propagado por HTTP y Kafka) y logs estructurados correlacionados por traceId. En Spring Boot 3: Micrometer para métricas, Micrometer Tracing u OpenTelemetry SDK/agent para trazas, exportando a Prometheus/OTLP. La clave senior no es la herramienta sino qué instrumentar: SLIs por endpoint con percentiles reales (histogramas), métricas de saturación (HikariCP, thread pools, consumer lag) y sampling de trazas bien elegido.

### 📖 Respuesta detallada
**Métricas con Micrometer (fachada tipo SLF4J para métricas):**
```java
// Automático con Boot: http.server.requests, jvm.gc.pause, hikaricp.connections, etc.
// De negocio:
Timer.builder("checkout.duration")
     .tag("payment.method", method)         // CUIDADO: cardinalidad acotada
     .publishPercentileHistogram()          // histogramas => percentiles agregables
     .register(registry)
     .record(() -> checkoutService.process(cart));
```
Puntos que debe tocar la respuesta:
1. **Percentiles agregables:** un p99 pre-calculado por instancia NO se puede promediar entre pods (promedio de percentiles ≠ percentil global). Se exportan **histogramas** (`publishPercentileHistogram`) y el p99 se calcula en Prometheus con `histogram_quantile` sobre la suma de buckets.
2. **Cardinalidad:** un tag con userId u orderId crea series infinitas y tumba Prometheus (o dispara la factura de Datadog). IDs van en trazas y logs, jamás en tags de métricas.
3. **Saturación antes que síntomas:** `hikaricp.connections.pending`, `executor.queued`, `kafka.consumer.fetch.manager.records.lag`, `jvm.gc.pause` — estas métricas predicen el incidente; la latencia HTTP solo lo confirma.

**Trazas con OpenTelemetry:** el estándar de facto — API + SDK + OTLP + Collector. En Java: agente automático (`-javaagent:opentelemetry-javaagent.jar`, instrumenta HTTP/JDBC/Kafka sin tocar código) o Micrometer Tracing con bridge OTel en Boot 3. El contexto se propaga con W3C `traceparent` en headers HTTP y de Kafka; los ejecutores propios deben decorarse para no perder el contexto entre hilos (error clásico: spans huérfanos tras un `CompletableFuture.supplyAsync`).
```yaml
management:
  tracing:
    sampling.probability: 0.1        # muestrear: 100% en dev, 1-10% en prod...
  otlp.tracing.endpoint: http://otel-collector:4318/v1/traces
```
**Sampling — decisión con enjundia:** head-based (decides al inicio; barato pero pierdes justo las trazas de errores raros) vs **tail-based** (el Collector decide al final: guarda el 100% de trazas con error o >1s y una muestra del resto — lo que realmente quieres para depurar, a cambio de bufferizar en el Collector).

**Logs:** JSON estructurado con `traceId`/`spanId` inyectados en MDC (Boot 3.4: `logging.structured.format.console=ecs`). El flujo de oro de un incidente: alerta por métrica → dashboard → ejemplar/traza lenta → logs de esa traza exacta. Sin correlación traceId↔logs, ese flujo se rompe y la observabilidad son tres silos caros.

**Errores comunes:** dashboards con promedios (la latencia media es propaganda: p50 no representa a nadie con p99 malo), instrumentar todo al 100% en prod (coste y ruido), métricas de negocio ausentes (deploys se validan con "no hay 500", mientras conversión cae 30%), y alertar sobre causas internas en vez de síntomas de SLO (alert fatigue). Cierre senior: "instrumento contra SLOs: cada servicio define sus SLIs, y las alertas se basan en error budget burn rate, no en umbrales estáticos de CPU".

---

## 15. Testcontainers: ¿cómo testeas integración real (BD, Kafka) sin mocks y sin flakiness?
**Categoría:** Testing · **Tipo:** Conceptual

### 📝 Respuesta resumen
Testcontainers levanta dependencias reales (Postgres, Kafka, Redis) en contenedores Docker efímeros durante los tests: se testea contra el motor real — dialecto SQL, DDL, serialización Kafka, transacciones — en lugar de mocks o H2 que mienten. Con Spring Boot: `@ServiceConnection` (3.1+) conecta el contenedor automáticamente. Las claves para que sea rápido y estable: reutilizar contenedores por clase/suite (singleton pattern) en vez de por test, esperar readiness real (wait strategies) y no depender de sleeps.

### 📖 Respuesta detallada
**Por qué H2 "compatible" es una trampa:** H2 en modo Postgres no soporta JSONB, ni `ON CONFLICT` completo, ni los mismos locks, ni window functions idénticas; los tests pasan y producción falla. Igual con mocks de repositorios: testean tu suposición, no el comportamiento. La posición senior: unit tests con mocks para lógica de dominio; integración con Testcontainers para todo lo que toca infraestructura; y Flyway corriendo en los tests para validar también las migraciones.

```java
@SpringBootTest
@Testcontainers
class OrderRepositoryIT {

    @Container @ServiceConnection          // Boot 3.1+: configura datasource solo
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16-alpine");

    @Container @ServiceConnection
    static KafkaContainer kafka =
        new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.6.0"));

    @Autowired OrderRepository repo;
    @Autowired KafkaTemplate<String, OrderEvent> template;

    @Test
    void persistsAndPublishes() {
        repo.save(order());
        template.send("orders", event());
        // afirmar con Awaitility, jamás con Thread.sleep:
        await().atMost(Duration.ofSeconds(10))
               .untilAsserted(() -> assertThat(consumed()).hasSize(1));
    }
}
```
`static` en los `@Container` es deliberado: el contenedor arranca UNA vez por clase, no por método. Para compartir entre clases: el patrón singleton (contenedor en una clase base con bloque static, sin `@Container`) o `@ImportTestcontainers`. Alternativa: `.withReuse(true)` + `testcontainers.reuse.enable=true` en `~/.testcontainers.properties` mantiene el contenedor vivo ENTRE ejecuciones (oro para el ciclo local; en CI no suele aplicar).

**Fuentes de flakiness y sus curas (lo que el entrevistador quiere oír):**
1. **Esperas:** `Thread.sleep` es el origen del 80% de los tests intermitentes. Wait strategies de Testcontainers para el arranque (`Wait.forListeningPort()`, `forLogMessage(...)`) y **Awaitility** para condiciones asíncronas del test.
2. **Estado compartido entre tests:** contenedor por clase + `@BeforeEach` que trunca tablas (o `@Transactional` en el test con rollback — con la advertencia de que no sirve si el código bajo prueba abre sus propias transacciones o si afirmas efectos de otro hilo/consumer).
3. **Puertos:** Testcontainers asigna puertos aleatorios — nunca hardcodear `localhost:5432`; siempre `container.getJdbcUrl()` o `@ServiceConnection`/`@DynamicPropertySource`.
4. **Kafka async:** los asserts sobre consumo requieren esperar el rebalance inicial del consumer del test — Awaitility con timeout generoso, y `auto.offset.reset=earliest` en el consumer de verificación.
5. **CI:** requiere Docker (docker socket o Testcontainers Cloud); cachear imágenes; y presupuestar que la suite de integración corre en minutos, no segundos — pirámide: muchos unit, decenas de integración, pocos E2E.

**Extra que suma:** módulos específicos (`ToxiproxyContainer` para testear timeouts y particiones de red — cómo se comporta tu Resilience4j de verdad —, `LocalStackContainer` para AWS, `GenericContainer` con WireMock para terceros HTTP).

---

## 16. Contract testing con Pact: ¿cómo evitas romper consumidores sin tests E2E?
**Categoría:** Testing · **Tipo:** Conceptual

### 📝 Respuesta resumen
El contract testing verifica que proveedor y consumidor están de acuerdo en el contrato SIN levantar ambos a la vez. Con Pact (consumer-driven): el consumidor escribe tests contra un mock que graban sus expectativas reales (el *pact*); el pact se publica en un Pact Broker; el proveedor lo reproduce contra su servicio real en SU pipeline y verifica que cumple. `can-i-deploy` responde "¿es seguro desplegar esta versión en este entorno?" cruzando verificaciones. Sustituye a los entornos E2E frágiles para la pregunta "¿romperé a alguien?", y detecta el breaking change en el PR del proveedor, no en integración.

### 📖 Respuesta detallada
**Lado consumidor (define lo que USA, no todo el API):**
```java
@ExtendWith(PactConsumerTestExt.class)
@PactTestFor(providerName = "orders-service")
class OrdersClientPactTest {

    @Pact(consumer = "billing-service")
    V4Pact orderById(PactDslWithProvider builder) {
        return builder
            .given("order 42 exists")                    // provider state
            .uponReceiving("get order by id")
            .path("/api/orders/42").method("GET")
            .willRespondWith().status(200)
            .body(newJsonBody(o -> {
                o.stringType("id", "42");                // matchers por TIPO,
                o.numberType("totalCents", 12500);       // no por valor exacto
                o.stringMatcher("status", "PLACED|PAID|CANCELLED", "PAID");
            }).build())
            .toPact(V4Pact.class);
    }

    @Test
    void fetchesOrder(MockServer mockServer) {
        OrdersClient client = new OrdersClient(mockServer.getUrl());
        Order order = client.findById("42");
        assertThat(order.totalCents()).isPositive();
    }
}
```
Detalle crucial: **matchers de tipo, no valores literales** — un pact que exige `totalCents == 12500` exacto es frágil y falso; el contrato dice "un número", no "este número". Y el pact solo debe contener los campos que el consumidor LEE: eso permite al proveedor evolucionar todo lo demás libremente (la esencia de consumer-driven: el contrato es la unión de lo que los consumidores usan de verdad).

**Lado proveedor:**
```java
@Provider("orders-service")
@PactBroker(url = "${PACT_BROKER_URL}")
@SpringBootTest(webEnvironment = RANDOM_PORT)
class OrdersProviderPactVerificationTest {

    @State("order 42 exists")                 // prepara datos para ese pact
    void order42Exists() { orderRepo.save(orderWithId("42")); }

    @TestTemplate
    @ExtendWith(PactVerificationSpringProvider.class)
    void verifyPacts(PactVerificationContext context) { context.verifyInteraction(); }
}
```
Los `@State` son el punto delicado: montar el estado que cada interacción asume (con BD real vía Testcontainers, o con el repositorio mockeado — decisión de equipo: cuanto más real, más valor y más coste).

**El flujo completo que hay que saber contar:** el consumidor publica el pact versionado al **Broker** → el proveedor verifica en su CI (y con webhooks, se dispara verificación cuando llega un pact nuevo) → los resultados quedan en la matriz del Broker → **`pact-broker can-i-deploy --pacticipant orders-service --version $SHA --to-environment prod`** bloquea el deploy si alguna combinación desplegada no está verificada. Sin `can-i-deploy`, Pact es solo documentación.

**Trade-offs honestos:** funciona mejor cuando consumidor y proveedor son de la misma organización (consumer-driven exige colaboración; para APIs públicas encaja mejor provider-driven / verificación contra OpenAPI con herramientas tipo Spring Cloud Contract o validación de esquemas); mantener provider states tiene coste; y no reemplaza tests funcionales del proveedor — verifica el contrato, no la lógica. Para eventos: Pact soporta mensajería (verificar que el productor de Kafka genera payloads que el consumidor entiende), complementando al Schema Registry (compatibilidad estructural) con compatibilidad *semántica de uso*.

**Qué espera el entrevistador:** la mecánica bidireccional con Broker y can-i-deploy, matchers por tipo, provider states, y el argumento de fondo: contratos verificados en pipelines independientes escalan; un entorno E2E compartido con 30 servicios, no.
