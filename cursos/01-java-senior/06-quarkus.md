# Módulo 6 · Quarkus y compilación nativa

> **Curso 01 · Java senior** · 120 min · Requiere [Módulo 3](03-spring-por-dentro-y-transacciones.md)

## Por qué esto importa en la entrevista

Quarkus aparece cada vez más en vacantes corporativas (banca, telco, seguros) junto a Kafka y microservicios en Kubernetes, y suele venir con la pregunta trampa: *"¿en qué se diferencia de Spring Boot de verdad?"*. La respuesta floja es "es más rápido". La respuesta senior es explicar **qué trabajo se mueve del arranque al build** y qué consecuencias tiene eso: en CDI, en la compilación nativa, en el modelo reactivo y en el ciclo de desarrollo. Saber articular *build-time vs runtime* y cuándo compensa native te diferencia inmediatamente de quien "solo ha visto Spring". Y como bonus: casi todo lo que sabes de Spring tiene un equivalente directo — la entrevista se gana enseñando ese mapa mental.

## La idea central: mover trabajo del arranque al build

Un arranque clásico de Spring Boot hace, **cada vez que arranca**: escanear el classpath, leer metadatos de anotaciones, evaluar condiciones de autoconfiguración, construir el grafo de beans, generar proxies CGLIB, parsear `persistence.xml`/entidades, construir el `EntityManagerFactory`… Todo eso es CPU, memoria y tiempo repetidos en cada pod, en cada despliegue, en cada escalado.

La apuesta de Quarkus: **ese trabajo es idéntico en cada arranque, así que hazlo una sola vez, en el build**. Las extensiones de Quarkus procesan anotaciones, resuelven la inyección de dependencias, parsean la configuración estática y generan bytecode con el resultado ya "cocinado". Lo que arranca en producción es la salida de ese proceso: clases ya generadas que solo tienen que ejecutarse.

```text
Spring Boot:   [ jar ] ──arranque──> escaneo + reflexión + wiring + proxies ──> app lista
Quarkus:       [ build: escaneo + wiring + generación de bytecode ] ──> [ jar ] ──arranque──> app lista
```

Números típicos para un microservicio REST + JPA + Kafka razonable (orden de magnitud, no benchmark de laboratorio — en la entrevista los órdenes de magnitud son lo que importa):

| | Arranque | RSS tras arrancar | First response |
|---|---|---|---|
| Spring Boot (JVM) | 4–10 s | 350–500 MB | +1–2 s (JIT frío) |
| Quarkus (JVM) | 1–2 s | 120–200 MB | rápida (menos que calentar) |
| Quarkus (native) | 0,02–0,05 s | 30–80 MB | inmediata |

**Por qué esto importa de verdad** (y es lo que hay que decir cuando pregunten "¿y para qué quiero arrancar en 20 ms?"):

- **Densidad en Kubernetes.** El coste de un cluster se paga en memoria. Si cada pod pasa de 450 MB a 150 MB, metes el triple de servicios en los mismos nodos. Los `requests`/`limits` de memoria bajan, el bin packing mejora, la factura baja.
- **Serverless y scale-to-zero.** Con cold start de 20–50 ms puedes permitirte Knative/Lambda escalando a cero sin que el primer usuario pague 8 segundos. Con Spring clásico, no.
- **Escalado reactivo.** HPA que añade pods bajo un pico de tráfico: un pod que tarda 10 s en estar `ready` llega tarde al pico; uno que tarda 1 s (o 50 ms) absorbe la ola.
- **Ojo, matiz senior:** Quarkus **en JVM** ya te da la mayor parte del beneficio (arranque ~1 s, la mitad o un tercio de RSS) sin ninguno de los costes de native. Native es un paso *adicional* y opcional — mucha gente en la entrevista cree que Quarkus = native, y no.

## ArC: CDI resuelto en build-time

Quarkus no usa Weld (la implementación de referencia de CDI) en runtime: usa **ArC**, su propio contenedor que hace la resolución **en el build**:

1. En el build, ArC indexa todas las clases (con Jandex, un índice de anotaciones, no reflection), resuelve cada punto de inyección, valida el grafo completo y **genera bytecode** con el wiring ya hecho.
2. Los beans que nadie usa se **podan** (*unused bean removal*): si ningún punto de inyección los referencia, ni siquiera se instancian los metadatos. Menos clases, menos memoria, y native lo agradece.
3. En runtime **no hay reflection ni proxies dinámicos para la DI**: los "client proxies" de CDI (para scopes como `@ApplicationScoped`, que son lazy) son clases generadas en build, no CGLIB.

Consecuencias prácticas que delatan a quien ha trabajado con ambos:

```java
@ApplicationScoped
public class FacturaService {

    @Inject
    MotorImpuestos motor;   // inyección por campo package-private: idiomático en Quarkus
                            // (no hace falta constructor ni public: no hay reflection,
                            //  el bytecode generado accede directamente)

    public Factura emitir(Pedido p) { ... }
}
```

- **El error clásico:** `UnsatisfiedResolutionException` **en el build** por un bean que "en Spring funcionaría". Ejemplo típico: registras un bean por un mecanismo dinámico (un `@Produces` dentro de una clase que quedó fuera del índice de Jandex porque está en un jar sin `beans.xml` ni extensión), o esperas resolverlo perezosamente en runtime. En Spring, el contexto es dinámico hasta el final; en ArC, **lo que no se resolvió en el build no existe**. La parte buena: te enteras al compilar, no en producción a las 3 a.m.
- Beans de jars externos "normales" no se indexan solos: o el jar trae `META-INF/beans.xml`/índice Jandex, o lo declaras con `quarkus.index-dependency.*`.
- `@ApplicationScoped` es lazy (proxy de cliente, se instancia al primer uso); `@Singleton` es eager-por-referencia y **sin proxy** — más ligero, pero no interceptable y sin poder inyectarlo antes de que exista. Saber elegir entre ambos es un buen detalle en entrevista.
- La interceptación (`@Transactional`, `@Retry`…) también se genera en build: nada de "la anotación no funciona porque el método es final y CGLIB no puede subclasear" — pero la **autoinvocación sigue sin pasar por el interceptor** si el scope no usa client proxy. La lección del módulo 3 no desaparece, cambia de forma.

## El modelo reactivo: Vert.x debajo, Mutiny encima

Quarkus corre sobre **Vert.x**: un número pequeño de **event loops** (I/O threads, ~1–2 por core) atiende todas las conexiones de forma no bloqueante, y un **worker pool** ejecuta lo bloqueante. Incluso el código imperativo "de toda la vida" pasa por Vert.x — RESTEasy Reactive despacha al worker pool cuando toca.

La API reactiva es **Mutiny**, con dos tipos: `Uni<T>` (0..1 resultado, ≈ `Mono`) y `Multi<T>` (stream, ≈ `Flux`):

```java
@Path("/pedidos")
public class PedidoResource {

    @Inject PedidoRepositorioReactivo repo;

    @GET
    @Path("/{id}")
    public Uni<Pedido> porId(Long id) {          // devuelve Uni => corre en el event loop
        return repo.buscar(id)                    // driver reactivo: no bloquea
            .onItem().ifNull().failWith(NotFoundException::new)
            .onFailure(TimeoutException.class).retry().atMost(2);
    }

    @GET
    @Blocking                                     // "esto bloquea": despacha al worker pool
    public List<Pedido> listar() {                // JDBC clásico, Thread.sleep, lo que sea
        return repo.listarBloqueante();
    }
}
```

Reglas de juego:

- **Nunca bloquees el event loop.** JDBC, `Thread.sleep`, un HTTP client síncrono en un método que devuelve `Uni` sin `@Blocking` → Vert.x te lo grita en el log (`Thread blocked`) y bajo carga se cae todo, porque esos pocos hilos atienden a *todas* las conexiones.
- El tipo de retorno es el contrato: devolver `Uni`/`Multi` ⇒ event loop; tipo plano ⇒ worker. `@Blocking`/`@NonBlocking` lo fuerzan explícitamente.
- **Cuándo imperativo está perfectamente bien** (respuesta madura, no "reactivo siempre"): CRUD con una BD que aguanta, concurrencia moderada, equipo que no domina reactive. El modelo imperativo de Quarkus ya es eficiente, y con **virtual threads** (`@RunOnVirtualThread`, Java 21+) tienes escalado de I/O con código secuencial. Reactivo compensa con muy alta concurrencia, streaming, o composición de muchas llamadas remotas. Mezclar ambos en la misma app es normal y soportado.

## Panache: Hibernate sin ceremonia

Panache es la capa de Quarkus sobre Hibernate ORM con dos estilos:

```java
// Estilo active record: la entidad ES el repositorio
@Entity
public class Pedido extends PanacheEntity {   // PanacheEntity aporta el id Long autogenerado
    public String estado;                      // campos públicos: Quarkus los reescribe a
    public BigDecimal total;                   // getters/setters en bytecode durante el build

    public static List<Pedido> pendientes() {  // queries como métodos estáticos de la entidad
        return list("estado", "PENDIENTE");    // HQL abreviado: "from Pedido where estado = ?1"
    }
}

// Estilo repository: como Spring Data, para quien quiere la entidad limpia
@ApplicationScoped
public class PedidoRepository implements PanacheRepository<Pedido> {
    public List<Pedido> pendientes() { return list("estado", "PENDIENTE"); }
}
```

**Qué simplifica:** elimina el boilerplate (id, getters, `EntityManager` explícito), queries abreviadas, paginación (`.page(Page.of(0, 20))`), y proyecciones. `persistence.xml` desaparece: todo va por `application.properties`.

**Qué esconde (y hay que decir en voz alta):** debajo sigue habiendo **Hibernate con todas sus físicas** — sesión, dirty checking, lazy loading, N+1, `LazyInitializationException`. `Pedido.pendientes()` estático es cómodo pero acopla la entidad a la persistencia y es más incómodo de mockear (Quarkus lo resuelve con `@InjectMock`/`PanacheMock`, pero es un truco, no un diseño). Un senior dice: *active record para servicios pequeños y CRUD; repository cuando el dominio crece o el equipo viene de DDD*. Y el N+1 se arregla igual que en el módulo 3: `join fetch`, entity graphs o proyecciones — Panache no te salva de saber Hibernate.

## MicroProfile / SmallRye: el mapa mental desde Spring

Quarkus implementa las specs de **MicroProfile** vía **SmallRye**. Para la entrevista, lo rentable es el mapa "esto es el equivalente de X en Spring":

| Necesidad | Spring | Quarkus (MicroProfile/SmallRye) |
|---|---|---|
| Config | `@Value`, `@ConfigurationProperties` | `@ConfigProperty`, `@ConfigMapping` |
| Perfiles | `application-{profile}.yml` | `%dev.`, `%test.`, `%prod.` en el mismo fichero |
| REST declarativo | `WebClient` / Feign / HTTP Interface | MicroProfile REST Client |
| Resiliencia | Resilience4j | SmallRye Fault Tolerance (`@Retry`, `@CircuitBreaker`, `@Timeout`, `@Fallback`, `@Bulkhead`) |
| Health checks | Actuator `/actuator/health` | SmallRye Health `/q/health` (`/live`, `/ready`, `/started`) |
| Métricas | Micrometer + Actuator | **Micrometer también** (recomendado) en `/q/metrics` |
| Tracing | Micrometer Tracing / OTel | OpenTelemetry de serie |
| Seguridad | Spring Security | Quarkus Security + SmallRye JWT / OIDC |

Config con perfiles — la sintaxis `%profile.` es peculiar de Quarkus y cae en entrevistas:

```properties
# application.properties — un solo fichero, prefijos por perfil
quarkus.datasource.db-kind=postgresql
quarkus.hibernate-orm.schema-management.strategy=validate

%dev.quarkus.hibernate-orm.schema-management.strategy=drop-and-create
%dev.quarkus.log.category."org.hibernate.SQL".level=DEBUG
%prod.quarkus.datasource.jdbc.url=${DB_URL}       # en prod, de variable de entorno
```

Detalle importante para native: la config marcada como *build-time* (extensiones activas, `db-kind`, features de Hibernate…) queda **congelada en el binario**; solo la config *runtime* (URLs, credenciales, pools) se puede cambiar con variables de entorno al desplegar. Cambiar una propiedad build-time exige recompilar — sorpresa clásica del primer despliegue native.

Fault tolerance y REST Client en diez líneas:

```java
@RegisterRestClient(configKey = "impuestos-api")     // URL en properties: impuestos-api.url=...
public interface ImpuestosClient {
    @GET @Path("/tasa/{pais}")
    Uni<Tasa> tasa(@PathParam("pais") String pais);
}

@ApplicationScoped
public class CalculadoraService {
    @Inject @RestClient ImpuestosClient impuestos;

    @Timeout(500)                                     // ms: no esperes más
    @Retry(maxRetries = 2, delay = 100)               // reintenta transitorios
    @CircuitBreaker(requestVolumeThreshold = 10,      // abre tras 50% de fallos en 10 llamadas
                    failureRatio = 0.5, delay = 5000)
    @Fallback(fallbackMethod = "tasaPorDefecto")      // degradación elegante
    public Uni<Tasa> tasaDe(String pais) { return impuestos.tasa(pais); }

    Uni<Tasa> tasaPorDefecto(String pais) { return Uni.createFrom().item(Tasa.GENERAL); }
}
```

Los endpoints de plataforma viven bajo `/q/` (health, metrics, dev UI, openapi) — el equivalente del actuator.

## Reactive Messaging con Kafka

SmallRye Reactive Messaging modela Kafka como **canales** conectados por anotaciones — el equivalente declarativo de `@KafkaListener` + `KafkaTemplate`:

```java
@ApplicationScoped
public class PedidosProcessor {

    @Incoming("pedidos-in")                 // canal de entrada (topic mapeado en properties)
    @Outgoing("facturas-out")               // lo que devuelvas se publica en el canal de salida
    @Blocking                               // el proceso usa JDBC => worker pool
    public Factura procesar(Pedido pedido) {
        return facturar(pedido);            // ack automático al completar sin excepción
    }

    @Incoming("auditoria-in")
    public CompletionStage<Void> auditar(Message<String> msg) {   // control manual
        return guardar(msg.getPayload())
            .thenCompose(v -> msg.ack());   // ack explícito: solo tras persistir
            // msg.nack(throwable) para rechazar y disparar la failure-strategy
    }
}
```

```properties
mp.messaging.incoming.pedidos-in.connector=smallrye-kafka
mp.messaging.incoming.pedidos-in.topic=pedidos
mp.messaging.incoming.pedidos-in.failure-strategy=dead-letter-queue   # o: fail (default), ignore
mp.messaging.outgoing.facturas-out.connector=smallrye-kafka
```

Lo que hay que saber contar: el **ack encadena hacia atrás** (el mensaje de entrada se ack-ea cuando el de salida se confirma en el broker — procesamiento at-least-once sin esfuerzo); las estrategias de commit (`throttled` por defecto: trackea posiciones y commitea el offset más alto *contiguo* procesado, no bloquea por mensaje); y las *failure strategies* (`fail` para el consumer, `ignore`, `dead-letter-queue`). Los patrones del módulo 4 —idempotencia del consumer, outbox, reintentos con DLQ— aplican exactamente igual: la anotación no te exime del diseño.

## Native image: el mundo cerrado

GraalVM `native-image` compila **ahead-of-time** la aplicación a un ejecutable nativo bajo la hipótesis de **closed-world**: *todo lo alcanzable se decide en el build; lo que el análisis estático no ve, no existe en el binario*. Clases no alcanzadas se eliminan, no hay classloading dinámico, no hay JIT.

**Qué se rompe** (porque es invisible al análisis estático):

- **Reflection:** `Class.forName("com.x.Foo")`, `getDeclaredFields()`… en runtime → `ClassNotFoundException` o campos "desaparecidos". Víctimas típicas: Jackson serializando un DTO que ninguna extensión registró, JDBC drivers exóticos, librerías legacy.
- **Resources:** ficheros del classpath (`plantilla.xml`, certificados) no se incluyen salvo que se declaren.
- **Proxies dinámicos y serialización:** `Proxy.newProxyInstance` sobre interfaces no registradas, serialización Java.
- **Inicialización de clases:** los static initializers pueden ejecutarse **en build** y congelar su estado en el binario (el clásico: un `SecureRandom` o un timestamp capturado en build).

**Las tres herramientas para arreglarlo**, en orden de preferencia:

```java
// 1) Anotación: registra la clase (campos, métodos, constructores) para reflection
@RegisterForReflection
public class FacturaDTO { ... }

// también sobre clases de terceros que no puedes tocar:
@RegisterForReflection(targets = { com.legacy.RespuestaSoap.class })
public class NativeConfig { }
```

```json
// 2) Config JSON (reflect-config.json / resource-config.json) para lo no anotable
[ { "name": "com.legacy.RespuestaSoap", "allDeclaredFields": true,
    "allDeclaredConstructors": true } ]
```

```bash
# 3) Tracing agent: ejecuta la app en JVM con el agente, que OBSERVA qué reflection/
# resources/proxies se usan de verdad y genera los JSON por ti
java -agentlib:native-image-agent=config-output-dir=src/main/resources/META-INF/native-image ...
```

La gracia de Quarkus es que **sus extensiones hacen este registro por ti** para todo lo que integran (Hibernate registra tus entidades, RESTEasy tus DTOs de endpoints…). Los problemas aparecen con librerías fuera del ecosistema de extensiones — y ahí entran las tres herramientas.

**JVM vs native, la tabla honesta** (esto, dicho sin fanatismo, es lo que suena a senior):

| | Quarkus JVM | Quarkus native |
|---|---|---|
| Arranque | ~1 s | ~0,02–0,05 s |
| RSS | 120–200 MB | 30–80 MB |
| **Peak throughput** | **mayor** (el JIT optimiza con profiling real) | menor (AOT, sin recompilación adaptativa)* |
| Latencia en frío | peor los primeros minutos (warmup) | plena desde el primer request |
| Tiempo de build | segundos | **2–10 min y 4–8 GB de RAM** por build |
| Debugging/tooling | todo el ecosistema (JFR, jcmd, agentes) | limitado (mejorando, pero limitado) |
| Riesgo runtime | conocido | sorpresas de closed-world con libs no cubiertas |

\* PGO (profile-guided optimization) en GraalVM Enterprise/Oracle acorta la distancia, pero el default sigue siendo: JIT gana en throughput sostenido.

**Regla de decisión:** servicio de larga vida con tráfico alto y constante → JVM (el warmup se amortiza, el throughput manda). Serverless, CLIs, jobs, scale-to-zero, muchos servicios pequeños donde la memoria es el coste dominante → native. Y el flujo de trabajo sensato: **desarrollas y testeas en JVM; native se compila y verifica en la CI** (`./mvnw verify -Dnative`, con los tests de integración `@QuarkusIntegrationTest` corriendo contra el binario), no en tu portátil a cada cambio.

## Dev mode, Dev Services y continuous testing

El tercer argumento de venta de Quarkus (tras arranque y footprint) es el ciclo de desarrollo, y en entrevista funciona muy bien contarlo como experiencia vivida:

- **Dev mode** (`./mvnw quarkus:dev`): live reload real — editas una clase, guardas, el siguiente request recompila y recarga en caliente (típicamente < 1–2 s), incluida la config. Sin plugins, sin reiniciar.
- **Dev Services:** si declaras la extensión de Postgres/Kafka/Redis y **no configuras URL**, Quarkus levanta solo un contenedor (vía Testcontainers) para dev y test, lo cablea y lo destruye al salir. Cero `docker-compose.yml` para empezar, y los tests corren contra Postgres real, no H2 — la lección de Testcontainers del módulo 3, pero automática.
- **Continuous testing:** en dev mode, pulsa `r` y Quarkus ejecuta en background los tests afectados por cada cambio (detecta qué tests tocan el código que editaste). Feedback de segundos sin salir del editor.
- **Dev UI** (`/q/dev-ui`): consola con los beans de ArC, la config efectiva, los contenedores de Dev Services y los endpoints — el "condition report" de Quarkus.

## Errores comunes que delatan a un no-senior

- Creer que Quarkus = native, e ignorar que en JVM ya arranca en ~1 s con un tercio del RSS.
- Vender native como "más rápido" a secas, sin distinguir cold start/footprint (gana native) de peak throughput (gana JIT).
- No poder explicar qué significa *closed-world* ni por qué la reflection rompe el binario.
- Bloquear el event loop: JDBC o `Thread.sleep` en un método que devuelve `Uni` sin `@Blocking`.
- "En Spring este bean funcionaba": no entender que ArC resuelve y valida la DI en el build, y que un jar sin índice Jandex es invisible.
- Compilar native en cada iteración de desarrollo en lugar de JVM + native solo en CI.
- Tratar Panache como si aboliera Hibernate: el N+1 y el `LazyInitializationException` siguen ahí.
- No saber que la config build-time queda congelada en el binario y no se cambia con variables de entorno.

## 🧪 Laboratorio — del `create` al binario roto (y arreglado)

1. **Bootstrap:** crea el servicio con la CLI (`quarkus create app com.acme:pedidos -x rest-jackson,hibernate-orm-panache,jdbc-postgresql`) o el equivalente Maven (`mvn io.quarkus.platform:quarkus-maven-plugin:create`). Arranca `quarkus dev` **sin configurar ninguna URL de BD** y comprueba en el log y en `/q/dev-ui` que Dev Services levantó un Postgres solo.
2. **REST + Panache:** una entidad `Pedido` (active record) y un resource con `GET /pedidos`, `POST /pedidos` y un finder (`Pedido.pendientes()`). Semilla con `import.sql`. Verifica el live reload: cambia el finder con la app corriendo y repite el request sin reiniciar.
3. **Continuous testing:** escribe un `@QuarkusTest` del endpoint con RestAssured, activa los tests con `r` en dev mode, rompe el código a propósito y observa el fallo aparecer solo; arréglalo y míralo pasar.
4. **Medir JVM:** `./mvnw package` y arranca el jar (`java -jar target/quarkus-app/quarkus-run.jar`). Apunta el tiempo de arranque que reporta el log y el RSS (`ps -o rss= -p <pid>`). Anota ambos.
5. **Medir native:** compila (`./mvnw package -Dnative`, o `-Dquarkus.native.container-build=true` si no tienes GraalVM local — cronometra también el build), arranca el binario y repite las dos medidas. Construye tu propia tabla JVM vs native con tus números.
6. **Rómpelo con reflection:** añade un DTO que solo se serializa vía `ObjectMapper` obtenido a mano (o un `Class.forName` sobre una clase solo referenciada por string) y devuélvelo en un endpoint nuevo. En JVM funciona; en native debe fallar en runtime. Captura el error exacto.
7. **Arréglalo:** primero con `@RegisterForReflection`, recompila y verifica. Después borra la anotación y arréglalo de nuevo con `reflect-config.json` generado por el tracing agent. Cierra con `./mvnw verify -Dnative` para que los tests de integración validen el binario.

**Entregable:** el repo con el servicio, la tabla de medidas (arranque, RSS y tiempo de build en JVM vs native) y un README corto explicando el fallo de reflection y sus dos arreglos.

## ✅ Autoevaluación

1. Explica con tus palabras qué trabajo mueve Quarkus del arranque al build y qué tres beneficios operativos produce (piensa en Kubernetes y serverless).
2. ¿Qué hace ArC en el build que Spring hace en runtime, y por qué un bean "unsatisfied" en Quarkus puede ser un bean que en Spring funcionaría?
3. ¿Qué pasa si ejecutas JDBC en un método que devuelve `Uni` sin `@Blocking`? ¿Por qué es grave y cómo lo detecta Vert.x?
4. Active record vs repository en Panache: ventajas, costes y cuándo elegirías cada uno. ¿Qué problemas de Hibernate *no* resuelve Panache?
5. Enumera tres cosas que rompen un binario native y las tres herramientas para arreglarlas, en orden de preferencia.
6. Tu servicio tiene tráfico alto y sostenido 24/7 y no escala a cero: ¿JVM o native? Defiende la respuesta con la tabla de trade-offs (warmup, peak throughput, footprint, tiempo de build).

## 🎯 Preguntas del banco que ya puedes responder

- [`java-microservicios/04-quarkus-y-native.md`](../../java-microservicios/04-quarkus-y-native.md)

## Para profundizar

- [Quarkus — Getting Started](https://quarkus.io/guides/getting-started) y el índice de [guías oficiales](https://quarkus.io/guides/) (imprescindibles: *CDI reference*, *Writing native applications*, *Dev Services*, *Continuous testing*)
- [Quarkus — Native reference guide](https://quarkus.io/guides/native-reference) — la guía de "qué hago cuando native se rompe"
- [GraalVM — Native Image docs](https://www.graalvm.org/latest/reference-manual/native-image/) — closed-world assumption, reachability metadata y tracing agent de primera mano
- [SmallRye Mutiny docs](https://smallrye.io/smallrye-mutiny/) — el modelo `Uni`/`Multi` bien explicado
- [SmallRye Reactive Messaging — Kafka connector](https://smallrye.io/smallrye-reactive-messaging/) — estrategias de commit y de fallo en detalle

---

**Anterior:** [Módulo 5 · Laboratorio JVM](05-laboratorio-diagnostico-jvm.md) · **Volver al curso:** [Curso 01](README.md)
