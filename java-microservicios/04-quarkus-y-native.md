# Quarkus, MicroProfile y Native Image — Preguntas de Entrevista Senior

Banco de preguntas sobre Quarkus y su ecosistema: build-time processing, ArC (CDI), GraalVM Native Image, Mutiny/Vert.x, Panache, MicroProfile (Config, Fault Tolerance, REST Client), Reactive Messaging con Kafka, dev mode, testing y transacciones. Cada pregunta incluye el mecanismo interno, configuración realista, números de referencia (arranque, RSS), errores comunes y lo que un entrevistador senior espera oír.

---

## 1. ¿Qué hace diferente a Quarkus de Spring Boot por dentro? Build-time processing
**Categoría:** Quarkus internals · **Tipo:** Conceptual

### 📝 Respuesta resumen
Quarkus mueve al **build** trabajo que los frameworks clásicos hacen en cada arranque: escaneo de classpath y anotaciones (índice Jandex), resolución del grafo de inyección (ArC genera bytecode con el wiring resuelto), parseo de configuración, generación de proxies y metamodelos (Hibernate, RESTEasy). El artefacto no es "app + framework que se auto-descubre" sino una app **pre-cableada**: en runtime solo se ejecutan los pasos de init grabados. Números orientativos (REST+CRUD): Spring Boot JVM ~4–10 s de arranque y 300–500 MB RSS; Quarkus JVM ~1–2 s y 130–180 MB; Quarkus native ~0.03–0.05 s y 30–50 MB.

### 📖 Respuesta detallada
**El problema que ataca:** un framework tradicional repite en cada arranque un trabajo cuyo resultado depende solo del código y la config de build: escanear miles de clases, parsear anotaciones por reflection, construir el contexto de DI, generar proxies, inicializar metamodelos. Es **cacheable en build time**, y además deja residentes clases y cachés usados solo durante el bootstrap → RSS alto.

**Cómo lo hace Quarkus — la fase de *augmentation*:**
1. **Índice Jandex:** clases y anotaciones se indexan en build (libs sin índice: `quarkus.index-dependency.*`). Todo "escaneo" posterior es una consulta al índice, no reflection.
2. **Extensiones con dos mitades:** cada extensión tiene un artefacto `-deployment` (solo build: los `@BuildStep` que procesan anotaciones y generan bytecode) y uno runtime. El deployment classpath **no existe en producción** — el framework "desaparece".
3. **Bytecode recording:** los build steps graban invocaciones sobre `@Recorder`s y Quarkus las serializa como bytecode. Arrancar es ejecutar ese bytecode lineal: registrar rutas ya conocidas, crear beans ya resueltos. Nada de descubrimiento.
4. **DI resuelta en build:** ArC valida el grafo y genera factorías y client proxies como `.class` (pregunta 2). Un `UnsatisfiedResolution` es un **error de build**, no una excepción al arrancar en producción.
5. **Config parseada en build:** las propiedades *build-time fixed* (`db-kind`, extensiones activas…) quedan "horneadas" (pregunta 8).

**Números de referencia** (orden de magnitud; los publica el propio proyecto):

| Stack (REST + CRUD/JPA) | Time-to-first-request | RSS |
|---|---|---|
| Stack tradicional (Spring Boot JVM) | 4–10 s | 300–500 MB |
| Quarkus JVM | ~1–2 s | 130–180 MB |
| Quarkus native | ~35–50 ms | 30–50 MB |

Un REST puro sin JPA en native baja a ~15–20 ms y ~12–25 MB. Punto senior: **la mejora de RSS en modo JVM ya es notable sin native**.

**Trade-offs del modelo:** lo que en Spring es "cambio una property y reinicio" puede requerir **rebuild** si es build-time (pregunta 8); no hay `BeanPostProcessor`-style magia en runtime — la extensibilidad profunda es escribir una extensión con `@BuildStep`; y el classpath cerrado en build es justo lo que Native Image necesita: Quarkus genera la metadata de reflection/resources por ti, por eso "Quarkus + native" es fiable donde "app JVM arbitraria + native" duele. Spring Boot 3 converge con AOT + GraalVM, pero como capa posterior, no como principio de diseño.

**Qué espera oír el entrevistador:** "mueve trabajo de runtime a build time" con **mecanismo** (Jandex, deployment vs runtime, bytecode recording, DI en build), números de arranque/RSS con y sin native, y el trade-off de flexibilidad.

---

## 2. ArC: el CDI de Quarkus — qué implementa, qué no, y el error del "bean eliminado"
**Categoría:** Quarkus / CDI · **Tipo:** Conceptual

### 📝 Respuesta resumen
ArC implementa el subconjunto **CDI Lite** (build-compatible) más extras propios, no CDI Full. Todo se resuelve en build: descubrimiento vía Jandex, validación del grafo, y generación de bytecode para factorías, interceptores y **client proxies** — no hay proxies dinámicos (`java.lang.reflect.Proxy`/CGLIB) en runtime, lo que lo hace native-friendly. Además ArC **elimina beans no referenciados** en build; el error clásico es un bean obtenido programáticamente (`CDI.current().select(...)`) que "desaparece" → `@Unremovable` o `quarkus.arc.unremovable-types`.

### 📖 Respuesta detallada
**Qué implementa y qué no:**
- Sí: `@ApplicationScoped`, `@Singleton`, `@RequestScoped`, `@Dependent`, qualifiers, producers, interceptores, decoradores, eventos (`@Observes`), `Instance<T>`.
- No (CDI Full): **portable extensions** — su lugar lo ocupan los `@BuildStep`; descubrimiento dinámico en runtime; `beans.xml` como activador; `@ConversationScoped`.
- Extras: `@DefaultBean` (equivalente moral de `@ConditionalOnMissingBean`), `@IfBuildProfile`/`@IfBuildProperty` (condicionales **de build**, no de runtime — diferencia clave frente a `@ConditionalOnProperty`), `@LookupIfProperty` para runtime.

**Por qué no hay proxies dinámicos:** un `@ApplicationScoped` necesita un *client proxy* (lazy init, scoping). ArC **genera la clase del proxy en build** (`MiServicio_ClientProxy.class`). Consecuencias: compatible con Native Image sin registrar nada; los beans normal-scoped **no pueden ser `final`** (el proxy subclasifica — Quarkus falla el build con mensaje claro, mejor que el fallo runtime de CGLIB); `@Singleton` no lleva client proxy (inyección directa: más rápido, sin lazy init, y `@InjectMock` no funciona sin más — por eso los tests prefieren `@ApplicationScoped`).

**Eliminación de beans no usados:** en build, ArC calcula qué beans son alcanzables por inyección; el resto se elimina (log: `Removed unused beans...`). Menos clases, arranque y RSS. El **error clásico**:

```java
// Nadie lo @Inject-a; solo lookup programático:
MiHandler h = CDI.current().select(MiHandler.class).get();
// runtime → UnsatisfiedResolutionException
// pero "¡la clase está ahí y tiene @ApplicationScoped!"
```
ArC no ve lookups programáticos ni reflection en build → considera el bean muerto. Soluciones, de mejor a peor:
1. Inyectarlo normalmente (o `Instance<MiHandler>` inyectado — sí crea dependencia visible).
2. `@Unremovable` en el bean.
3. `quarkus.arc.unremovable-types=com.acme.handlers.*` para libs de terceros.
4. `quarkus.arc.remove-unused-beans=none` — martillo global, solo para diagnosticar.

**Diagnóstico:** Dev UI → sección ArC muestra beans activos, **beans eliminados y por qué**, interceptores y el grafo. Saberlo resuelve el 90 % de estos tickets.

**Otros gotchas:** interceptores se ordenan en build (`@Priority`), nada se añade "al vuelo"; y `@Startup` fuerza init eager — "mi `@PostConstruct` nunca se ejecutó" suele ser el lazy por proxy.

**Qué espera oír el entrevistador:** CDI Lite vs Full, proxies generados en build (y su relación con native y `final`), bean removal con el error de lookup programático y sus fixes, y que las condicionales de ArC son de build-time.

---

## 3. GraalVM Native Image: closed-world assumption — qué se rompe y cómo se registra
**Categoría:** Native Image · **Tipo:** Conceptual

### 📝 Respuesta resumen
Native Image compila AOT bajo la **closed-world assumption**: análisis estático de alcanzabilidad desde los entry points; lo no alcanzable **no existe en el binario**. Se rompe lo dinámico: reflection (`Class.forName`, `getMethod`), recursos del classpath, proxies dinámicos, JNI, `MethodHandles` no constantes y serialización Java. Se arregla **registrando** por adelantado: `@RegisterForReflection` (Quarkus), ficheros `reflect-config.json`/`resource-config.json`/`proxy-config.json`/`serialization-config.json`, el **tracing agent** para generarlos ejecutando la app en JVM, o — la vía Quarkus — extensiones que registran automáticamente lo que sus libs necesitan.

### 📖 Respuesta detallada
**El análisis:** `native-image` parte de `main()`, construye el grafo de llamadas, incluye solo lo alcanzable, inicializa en build las clases marcadas para ello (snapshot del heap inicial dentro del binario — por eso arranca en milisegundos: el bootstrap ya está ejecutado y serializado) y elimina el resto. Sin classloading dinámico ni JIT: lo que no entró en build, no existe.

**Qué se rompe exactamente:**
1. **Reflection:** `Class.forName("com.acme.Dto")` → `ClassNotFoundException`; o la clase entró pero sin miembros registrados → `NoSuchMethodException`/listas vacías. El fallo número uno con Jackson/mappers.
2. **Resources:** `getResourceAsStream("templates/mail.html")` → `null` si no se registró el pattern.
3. **Proxies dinámicos:** `Proxy.newProxyInstance` exige declarar la **combinación de interfaces** para generar la clase en build.
4. **JNI** / `System.loadLibrary`: config propia (`jni-config.json`).
5. **Serialización Java** (`ObjectInputStream`): cada clase serializable dinámica va en `serialization-config.json`.
6. Finos: `MethodHandle` solo si constante; agentes/instrumentation no existen.

**Cómo se registra, de más a menos recomendable en Quarkus:**

```java
// 1) Anotación Quarkus: clase + métodos + campos (y targets de terceros)
@RegisterForReflection(targets = { com.terceros.LegacyDto.class })
public class PayloadDto { ... }
```

```json
// 2) reflect-config.json (META-INF/native-image/...): para libs ajenas
[{ "name": "com.terceros.LegacyDto",
   "allDeclaredConstructors": true, "allDeclaredMethods": true, "allDeclaredFields": true }]
```

```bash
# 3) Tracing agent: ejercitar la app en JVM; el agente escribe la config observada
java -agentlib:native-image-agent=config-output-dir=src/main/resources/META-INF/native-image/app -jar app.jar
```

4) **Extensiones Quarkus** (la razón por la que Quarkus doma a Graal): la extensión de Jackson registra los DTOs alcanzables desde endpoints (los ve vía Jandex), Hibernate registra entidades y proxies… Los `@BuildStep` producen `ReflectiveClassBuildItem`, `NativeImageResourceBuildItem`, etc. Con extensión oficial no registras casi nada a mano; el trabajo manual aparece con libs sin extensión o rutas que Jandex no puede ver (payloads polimórficos, `Class.forName` con string calculado).

**Límites de cada vía (lo que distingue al senior):**
- `@RegisterForReflection` es preciso y versionado con el código: preferible.
- El **tracing agent solo ve lo que ejecutas**: es un perfil, no un análisis. Si el flujo de "reembolso parcial" no se ejercitó, su DTO no está y peta en producción (base del caso 15). Sirve como bootstrap, no como garantía.
- `allDeclared*`/jerarquías completas engordan binario y build: cada clase reflectiva retenida es código que el análisis ya no puede podar.
- Trampa extra: inicialización en build que captura estado (un `SecureRandom` seedado en build) → errores `Classes that should be initialized at run time got initialized during image building` al añadir libs raras.

**Qué espera oír el entrevistador:** closed-world + alcanzabilidad, la lista concreta de roturas, las cuatro vías de registro con sus límites (especialmente "el agente solo cubre lo ejecutado"), y que en Quarkus el grueso lo hacen las extensiones en build.

---

## 4. JVM vs native: ¿cuándo compensa de verdad compilar a native?
**Categoría:** Native Image / Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
Native gana en **arranque** (decenas de ms vs segundos → serverless, scale-to-zero) y **footprint** (30–50 MB RSS vs 150–400 MB → densidad, coste). La JVM con JIT gana en **peak throughput sostenido** (típicamente 20–50 % más req/s tras warmup: JIT con perfiles, mejores GCs). Native cobra además: builds de 2–10 min con 4–8 GB de RAM, debugging/observabilidad más pobres y la fricción del closed-world con cada lib. Regla: serverless/CLI/sidecars/alta densidad → native; servicios de throughput alto y vida larga → JVM (donde Quarkus ya da gran parte del beneficio de memoria por su diseño build-time).

### 📖 Respuesta detallada
**Dónde native es claramente superior:**
- **Cold start:** arrancar en 40 ms vs 4 s hace viable el scale-to-zero en Lambda/Cloud Run; con JVM además los primeros cientos de requests van lentos (intérprete/C1).
- **Densidad y coste:** 40 microservicios a 350 MB RSS vs 60 MB son ~11.6 GB de diferencia por réplica del conjunto — dinero directo en nodos (los requests de memoria dimensionan el cluster). El RSS native es además **estable**: sin metaspace ni code cache creciendo.
- **Operación:** rolling updates rápidos, HPA que añade pods útiles en segundos, jobs/CronJobs baratos.

**Dónde la JVM gana:**
- **Peak throughput:** el JIT compila con perfiles reales, inlinea y especula; G1/ZGC superan al Serial GC default de native (Graal community). Bajo carga sostenida, JVM suele rendir 20–50 % más req/s y mejores latencias con allocation alta. Native recorta con **PGO** (Oracle GraalVM: ejecutar instrumentado → perfil → rebuild) y G1 para native, a costa de pipeline más complejo.
- **Build:** `mvn package -Dnative` = 2–10 min y 4–8 GB RAM por servicio. Con 40 servicios, factura de CI y fricción de feedback reales. Patrón sano: PRs en JVM; native en release + nightly de tests nativos.
- **Debugging/observabilidad:** sin attach de debugger estándar (hay gdb con `-Dquarkus.native.debug.enabled`), sin jmap/jstack clásicos, JFR parcial; leaks y profiling sensiblemente más duros. Agentes APM por instrumentation no funcionan: observabilidad vía OpenTelemetry/Micrometer integrados en build.
- **Ecosistema:** cada lib con reflection exótica es un riesgo de runtime (pregunta 15).

**El matiz senior:** el dilema no es "Spring JVM vs Quarkus native". Quarkus **JVM mode** ya arranca en ~1 s con la mitad de memoria; y en el lado JVM existen CRaC y AppCDS/Leyden para el cold start sin renunciar al JIT. Se decide por perfil de servicio:

| Perfil | Recomendación |
|---|---|
| Serverless / scale-to-zero / jobs | Native |
| API de tráfico sostenido alto, p99 exigente | JVM (JIT + ZGC/G1), medir antes de nativizar |
| Long tail de servicios pequeños | Native por densidad |
| CLIs / operadores K8s / sidecars | Native |
| Servicio con lib problemática en native | JVM y no pelearse |

**Errores comunes:** vender native como "más rápido" a secas (lo es *arrancando*, no necesariamente *sirviendo*); nativizar el servicio de throughput crítico y descubrir la regresión de p99 en producción; compilar native en cada PR.

**Qué espera oír el entrevistador:** trade-off cold start/footprint vs peak throughput con números, coste de build y debugging, PGO como mitigación, matriz de decisión por tipo de servicio, y que Quarkus JVM ya captura mucho del beneficio.

---

## 5. Mutiny y el modelo reactivo de Quarkus: Uni, Multi, event loop y @Blocking
**Categoría:** Reactivo / Mutiny · **Tipo:** Conceptual

### 📝 Respuesta resumen
Quarkus corre sobre **Vert.x**: pocos event loop threads (≈ 2×cores) sirven todo el I/O no bloqueante, y un worker pool ejecuta lo bloqueante. **Mutiny** es la API reactiva: `Uni<T>` (0..1 resultado, lazy — nada ocurre hasta la suscripción) y `Multi<T>` (stream con backpressure, Reactive Streams). Regla de oro: **nunca bloquear un event loop thread** (JDBC, `Thread.sleep`, HTTP síncrono); lo bloqueante se anota `@Blocking` (despacha a worker). Cuando se viola, el `BlockedThreadChecker` de Vert.x lo delata: `Thread vertx-eventloop-thread-3 has been blocked for 2543 ms`.

### 📖 Respuesta detallada
**Threading:** N event loops (Netty; cada conexión fijada a un loop) + worker pool. Con 8 cores, ~16 loops sirven miles de conexiones; si uno se bloquea 2 s, **todas** sus conexiones se congelan 2 s — por eso el síntoma típico es "latencias erráticas en endpoints que no tienen nada que ver entre sí".

**Mutiny:**
```java
Uni<Order> uni = orderClient.find(id)              // lazy: aún no salió nada por la red
    .onItem().transform(o -> enrich(o))            // map
    .onItem().transformToUni(o -> stockClient.reserve(o)) // flatMap
    .onFailure(TimeoutException.class).recoverWithItem(Order::pendingOf)
    .ifNoItem().after(Duration.ofSeconds(2)).fail();

Multi<Tick> ticks = Multi.createFrom().ticks().every(Duration.ofSeconds(1))
    .onOverflow().drop();                          // backpressure explícita
```
Puntos finos: la **laziness** (un `Uni` es una receta; devolverlo desde el endpoint es lo que suscribe — construir un Uni y no retornarlo es un no-op silencioso, bug clásico); API legible como frases frente a los cientos de operadores de Reactor; interop directa con Reactive Streams y `CompletionStage`.

**@Blocking y el dispatch:**
```java
@GET @Path("/report")
@Blocking                       // worker thread: JDBC permitido
public Report reportePesado() { return jdbcRepo.aggregate(); }

@GET @Path("/orders/{id}")      // devuelve Uni → event loop
public Uni<Order> find(Long id) { return Order.<Order>findById(id); }
```
En RESTEasy Reactive la decisión es por firma (pregunta 6); en Reactive Messaging, `@Blocking` sobre el `@Incoming` juega el mismo rol.

**Diagnóstico de un event loop bloqueado:**
1. **Log del BlockedThreadChecker** (activo por defecto, warning a 2 s, stacktrace a 5 s) con stack apuntando al culpable (un `ResultSet.next()`, un HTTP síncrono, un `synchronized` contended, BCrypt…).
2. Métricas: p99 en diente de sierra en endpoints no relacionados, throughput plano con CPU baja (los loops *esperan*, no computan).
3. Thread dump: event loop RUNNABLE en `SocketInputStream.read` o WAITING en un lock.
4. En dev/CI: bajar `quarkus.vertx.max-event-loop-execute-time` y tratar el warning como error.

**Culpables no obvios:** DNS bloqueante (`InetAddress.getByName`), hashing caro (BCrypt es CPU: también a worker), lazy loading de Hibernate disparado al serializar la respuesta, libs "reactivas" que bloquean por dentro.

**Errores comunes:** JDBC en endpoint reactivo "porque compila"; `.subscribe().with(...)` dentro del endpoint (fire-and-forget accidental, errores tragados) en vez de **retornar** el Uni; `await().indefinitely()` en el loop (Mutiny al menos lanza `IllegalStateException`); y reactivo por moda en CRUD de 50 req/s donde `@Blocking` o `@RunOnVirtualThread` es más simple y suficiente.

**Qué espera oír el entrevistador:** event loop + worker con números, laziness de Uni, la regla de no bloquear con violaciones sutiles, `@Blocking` como válvula, y el BlockedThreadChecker citado casi textualmente — quien lo ha sufrido se acuerda del mensaje.

---

## 6. RESTEasy Reactive: imperativo y reactivo en el mismo stack — ¿cómo decide el dispatch?
**Categoría:** REST / Quarkus · **Tipo:** Conceptual

### 📝 Respuesta resumen
RESTEasy Reactive (hoy "Quarkus REST") es la capa JAX-RS sobre Vert.x que sirve **ambos** estilos: un endpoint que devuelve `Uni`/`Multi`/`CompletionStage` corre en el **event loop**; uno con firma síncrona va por defecto a un **worker thread** — decisión tomada **en build** por la firma, ajustable con `@Blocking`/`@NonBlocking`/`@RunOnVirtualThread`. A diferencia del modelo servlet (RESTEasy Classic: thread-per-request, providers resueltos por reflection en runtime), el pipeline de handlers se genera en build, sin reflection por request ni hilo dedicado por conexión.

### 📖 Respuesta detallada
**La decisión de dispatch:**
1. Retorno reactivo (`Uni`, `Multi`, `CompletionStage`…) → **event loop** (el mismo que lee del socket): cero context switch, prohibido bloquear.
2. Firma síncrona (`Order`, `Response`) → **worker pool** por defecto. Decisión de seguridad deliberada: el código imperativo típico (JDBC) no debe caer en el loop por accidente.
3. Overrides: `@Blocking` (fuerza worker aunque devuelvas Uni — si lo construyes con algo bloqueante), `@NonBlocking` (fuerza loop con firma síncrona — solo cómputo trivial o caché en memoria), `@RunOnVirtualThread` (un virtual thread por request: bloqueante "barato", con los caveats de pinning).

```java
@Path("/orders")
public class OrderResource {

    @GET @Path("/{id}")
    public Uni<Order> find(Long id) {              // event loop: Hibernate Reactive
        return Order.findById(id);
    }

    @GET @Path("/{id}/invoice-pdf")
    @RunOnVirtualThread
    public byte[] pdf(Long id) {                   // bloqueante sin comerse un platform thread
        return pdfService.render(jdbcRepo.load(id));
    }

    @GET @Path("/ping")
    @NonBlocking
    public String ping() { return "ok"; }          // loop: sin salto de hilo
}
```

**Qué se hace en build (vs servlet):** el scanning de `@Path`, la resolución de `MessageBodyReader/Writer`, el árbol de rutas y la extracción de parámetros se compilan a handlers concretos: sin `Method.invoke` por request ni descubrimiento de providers en runtime. Resultado: menos CPU y allocations por request, arranque instantáneo y compatibilidad native gratis. Los benchmarks del proyecto dan del orden de 2× throughput frente a RESTEasy Classic sobre servlet.

**Contraste con servlet:** thread-per-request de un pool acotado (Tomcat 200): cada request *retiene* su hilo durante el I/O downstream; 200 requests lentos = pool agotado = 503 en cascada. En el modelo Vert.x, el I/O no bloqueante libera el loop entre eventos: la concurrencia la limita la memoria por conexión, no el número de hilos. El worker pool de Quarkus sí se parece a servlet, pero solo lo consumen los endpoints bloqueantes.

**Detalles que suman:**
- Filtros con `@ServerRequestFilter`/`@ServerResponseFilter` (métodos sueltos, pueden devolver `Uni<Void>`), además de los `ContainerRequestFilter` estándar.
- `Multi<T>` + `@RestStreamElementType` para SSE/streaming JSON con backpressure hasta el socket.
- El error típico: endpoint reactivo que llama a un repositorio **bloqueante** — compila, funciona en dev, y en producción aparece el BlockedThreadChecker (pregunta 5). El dispatch protege por firma; no adivina lo que haces dentro de un `Uni.createFrom().item(() -> jdbc…)`.
- Elegir por servicio: CRUD interno → imperativo (worker o virtual threads); gateway/fan-out/streaming → reactivo. El valor del stack unificado es no cambiar de framework para cambiar de modelo.

**Qué espera oír el entrevistador:** la regla de dispatch por firma con sus tres overrides, qué se pre-computa en build, la diferencia estructural thread-per-request vs event loop, y el pitfall del "bloqueante disfrazado de Uni".

---

## 7. Panache: active record vs repository, límites y Panache reactive
**Categoría:** Persistencia / Panache · **Tipo:** Conceptual

### 📝 Respuesta resumen
Panache elimina el boilerplate de JPA con dos estilos: **active record** (`extends PanacheEntity` → `Order.findById(id)`, `order.persist()`, campos públicos reescritos a accessors en build) y **repository** (`implements PanacheRepository<Order>`, misma API, entidad limpia). Añade queries abreviadas (`find("status = ?1", …)`), paginación y proyecciones. Límites: el HQL abreviado no cubre queries complejas (se cae a `EntityManager`/criteria), el active record acopla persistencia al dominio y complica el mocking (estáticos → `PanacheMock`). La variante reactiva (Hibernate Reactive) devuelve `Uni`/`Multi` y exige `@WithTransaction`.

### 📖 Respuesta detallada
**Active record:**
```java
@Entity
public class Order extends PanacheEntity {          // id Long autogenerado incluido
    public String status;                            // público: Panache genera el accessor
    public BigDecimal total;

    public static List<Order> pendientesCaras(BigDecimal min) {
        return list("status = ?1 and total > ?2", "PENDING", min);
    }
}
// Order.findById(id); order.persist(); Order.count("status", "PENDING");
// Order.find("status", "PENDING").page(Page.of(0, 20)).list();
```
El truco de los campos públicos: en build Panache **reescribe el bytecode** — cada acceso externo a `order.status` se sustituye por el getter/setter generado, así que el lazy loading e interceptación de Hibernate funcionan; no es un `public` naïf. `PanacheEntityBase` si quieres tu propia `@Id`.

**Repository:**
```java
@ApplicationScoped
public class OrderRepository implements PanacheRepositoryBase<Order, Long> {
    public List<Order> pendientesCaras(BigDecimal min) {
        return list("status = ?1 and total > ?2", "PENDING", min);
    }
}
```
Criterio honesto: active record brilla en servicios pequeños/CRUD (menos capas, queries junto a la entidad); repository cuando el equipo quiere entidades sin lógica de persistencia, DI clásica y mocking trivial (`@InjectMock OrderRepository`). No es guerra religiosa: es coste de testing y acoplamiento vs concisión.

**Límites y críticas a verbalizar:**
1. **Testabilidad del active record:** los estáticos no se inyectan; `PanacheMock.mock(Order.class)` (Mockito sobre estáticos) funciona pero es más frágil que mockear un repositorio. En `@QuarkusTest` con Dev Services (Postgres real, pregunta 11) el problema se disuelve: se testea contra BD real y se mockea mucho menos.
2. **Queries complejas:** el HQL abreviado es para el 80 % simple. Joins elaborados, window functions, bulk updates → HQL completo (`find("from Order o join fetch o.lines where …")`), `getEntityManager()`, criteria o SQL nativo. El error es forzar el azúcar donde no llega o sufrir N+1 por no hacer `join fetch` "porque Panache lo esconde".
3. Sigue siendo Hibernate: dirty checking, flush, `LazyInitializationException` — Panache exime de escribir JPA, no de entenderlo.

**Panache reactive (Hibernate Reactive):**
```java
@WithTransaction                                    // transacción reactiva (pregunta 13)
public Uni<Order> confirmar(Long id) {
    return Order.<Order>findById(id)
        .onItem().ifNull().failWith(NotFoundException::new)
        .invoke(o -> o.status = "CONFIRMED");       // dirty checking; flush al commit
}
```
Claves: misma API con `Uni`/`Multi`; requiere el driver SQL reactivo de Vert.x (`quarkus-reactive-pg-client`), **no** JDBC; la sesión va ligada al contexto Vert.x, no a un thread — de ahí los errores al mezclar mundos (pregunta 13). Elegir persistencia reactiva solo si todo el camino es reactivo; imperativo con Hibernate clásico + virtual threads suele ser la opción sobria.

**Qué espera oír el entrevistador:** los dos estilos con criterio real de elección (testing, acoplamiento), el bytecode rewriting de los campos públicos, los límites (PanacheMock, queries complejas → EntityManager, JPA sigue debajo) y no mezclar Panache bloqueante en pipelines reactivos.

---

## 8. Configuración en Quarkus: MicroProfile Config, @ConfigMapping, perfiles y la trampa build-time
**Categoría:** Configuración · **Tipo:** Conceptual

### 📝 Respuesta resumen
Quarkus implementa MicroProfile Config (SmallRye): fuentes ordenadas por ordinal — system properties (400) > env vars (300) > `.env` (295) > `config/application.properties` externo (260) > `application.properties` del JAR (250) — con mapeo de env vars (`QUARKUS_HTTP_PORT` → `quarkus.http.port`). Config tipada con `@ConfigMapping` (interfaces, validación al arranque). Perfiles con prefijo `%dev`, `%test`, `%prod`. La trampa: muchas propiedades `quarkus.*` son **build-time fixed** (db-kind, extensiones, endpoints generados) — cambiarlas por env var en despliegue **no tiene efecto** (warning al arranque: *"Build time property cannot be changed at runtime"*): hay que rebuildar la imagen.

### 📖 Respuesta detallada
**Fuentes y precedencia:** system properties → env vars → `.env` → fichero externo junto al JAR → el empaquetado → defaults de extensiones; más fuentes vía extensiones (ConfigMaps/Secrets de Kubernetes, Vault, Consul). Conversión de nombres para env: no alfanumérico → `_`, mayúsculas.

**Config tipada — `@ConfigMapping`:**
```java
@ConfigMapping(prefix = "app.pagos")
public interface PagosConfig {
    String endpoint();
    @WithDefault("2s") Duration timeout();
    @WithName("api-key") Optional<String> apiKey();
    Retries retries();
    interface Retries { @WithDefault("3") int max(); }
}
// app.pagos.endpoint=https://pagos.internal
// app.pagos.retries.max=5
```
Ventajas sobre `@ConfigProperty` suelto: agrupación, conversión de tipos (Duration, listas, mapas), **validación al arranque** (falta `endpoint` → falla el boot, no un NPE en uso; se integra con Bean Validation) e inyección como bean. Es el análogo de `@ConfigurationProperties`, resuelto en build.

**Perfiles:**
```properties
quarkus.datasource.jdbc.url=${DB_URL}            # prod: del entorno
%dev.quarkus.datasource.devservices.enabled=true # dev: Dev Services levanta el Postgres
%test.quarkus.http.test-port=0
%dev.quarkus.log.category."com.acme".level=DEBUG
```
`dev` y `test` se activan solos en `quarkus dev` y en tests; en producción, `prod`. Perfiles propios (`%staging.…`, `quarkus.profile=staging`), ficheros `application-staging.properties` y herencia (`quarkus.config.profile.parent`). Diferencia con Spring: un perfil principal activo con herencia, no lista combinatoria de `@Profile` — la condicionalidad de beans por perfil es `@IfBuildProfile` (¡de build!) o `@LookupIfProperty`.

**La trampa build-time vs runtime (la parte senior):** cada propiedad de extensión está clasificada en la doc con un candado:
1. **Build-time fixed:** consumidas en la augmentation y horneadas: `quarkus.datasource.db-kind`, activar extensiones y endpoints (`quarkus.smallrye-openapi.path`), `quarkus.native.*`. Cambiarlas vía env var en el pod → **ignoradas** con warning al arranque (y en native ni existe el código alternativo: si construiste con `db-kind=postgresql`, el driver de MySQL no está en el binario).
2. **Runtime:** URLs, credenciales, pools, timeouts, log levels — por entorno como siempre.
3. Mixtas (build-time con default de runtime).

Incidente típico: la imagen se construyó con config de staging horneada, ops intenta "arreglarlo con una env var" en prod y no pasa nada. Respuesta profesional: **una sola imagen para todos los entornos** con lo específico de entorno en propiedades runtime; vigilar los warnings de `Build time property…` en el arranque; y si algo build-time debe variar por entorno, son artefactos distintos y el pipeline lo trata como tales (raro y a evitar).

**Extras:** `quarkus.config.locations` para ficheros adicionales, expresiones `${…}`, y el Dev UI muestra la config efectiva con su fuente (equivalente moral de `/actuator/env`).

**Qué espera oír el entrevistador:** orden de fuentes, `@ConfigMapping` con validación al arranque, perfiles `%`, y sobre todo la distinción build-time/runtime contada como incidente de despliegue con su warning y su regla de higiene (imagen única, config runtime).

---

## 9. SmallRye Fault Tolerance: semántica exacta de @Retry, @Timeout, @CircuitBreaker, @Bulkhead y @Fallback
**Categoría:** Resiliencia / MicroProfile · **Tipo:** Conceptual

### 📝 Respuesta resumen
MicroProfile Fault Tolerance (SmallRye) aplica resiliencia por interceptores CDI con **orden fijo de anidamiento**: `Fallback(Retry(CircuitBreaker(Timeout(Bulkhead(método)))))`. Cada reintento atraviesa de nuevo el breaker y corre con su propio timeout; el breaker cuenta cada intento; el fallback solo se dispara cuando todo se agotó. `@Timeout` interrumpe (o abandona si el hilo no es interrumpible), `@Bulkhead` limita concurrencia (semáforo; pool+cola con `@Asynchronous`), `@CircuitBreaker` usa rolling window por número de requests con `failureRatio`, y todo emite métricas `ft_*` vía Micrometer/OTel.

### 📖 Respuesta detallada
```java
@ApplicationScoped
public class PaymentClient {

    @Fallback(fallbackMethod = "fallbackCharge", skipOn = BusinessException.class)
    @Retry(maxRetries = 3, delay = 200, jitter = 100,
           retryOn = IOException.class, abortOn = CircuitBreakerOpenException.class)
    @CircuitBreaker(requestVolumeThreshold = 20, failureRatio = 0.5,
                    delay = 10_000, successThreshold = 2, skipOn = BusinessException.class)
    @Timeout(2000)
    @Bulkhead(10)
    public PaymentStatus charge(ChargeRequest req) { ... }

    PaymentStatus fallbackCharge(ChargeRequest req) {
        return PaymentStatus.unknownPending(req.id());   // honesto: pendiente, no inventado
    }
}
```

**El orden, razonado (esto separa nota alta de media):**
- `Bulkhead` es lo más interno: sin hueco → `BulkheadException`, que cuenta para el breaker y puede reintentarse.
- `Timeout` envuelve cada ejecución: cada retry tiene sus 2 s completos → el peor caso es ~(maxRetries+1)×(timeout+delay), y ese número hay que **decírselo al caller** (su timeout debe ser mayor o cortar antes).
- `CircuitBreaker` ve cada intento como muestra: 1 llamada con 3 retries fallidos = 4 muestras negativas. Con el breaker OPEN, los intentos fallan al instante con `CircuitBreakerOpenException` — de ahí el `abortOn` en `@Retry`: reintentar contra un breaker abierto es martillear en vano.
- `Retry` por defecto reintenta cualquier excepción — **peligroso**: reintentar un POST no idempotente tras timeout puede duplicar el cobro. Regla: retry solo idempotente o con idempotency key.
- `Fallback` es lo más externo; `skipOn` deja pasar errores de negocio (un 422 se propaga, no se "fallbackea").

**Semánticas finas:**
- `@Timeout`: interrumpe el hilo; si el código no responde a interrupción (JDBC sin socket timeout), el caller recibe `TimeoutException` pero el hilo sigue ocupado — el timeout de FT **no sustituye** los timeouts de socket del cliente.
- `@Bulkhead` síncrono = semáforo (rechazo inmediato); con `@Asynchronous` = pool con `waitingTaskQueue`. Complementa al breaker: limita *cuánto* en vuelo aunque todo vaya "bien pero lento".
- `@CircuitBreaker`: ventana rolling de `requestVolumeThreshold` requests (por conteo), `failureRatio` para abrir, `delay` en OPEN, `successThreshold` pruebas en HALF_OPEN. `failOn`/`skipOn` para que los errores de negocio no lo abran (un 404 significa que el servicio funciona).
- Extras SmallRye más allá del spec: rate limit, guards programáticos (`FaultTolerance.create()`), `@ApplyGuard` para **compartir** estado entre métodos — el estado del breaker es por método salvo que se comparta, lo que evita el clásico "creí que era un breaker por servicio".

**Métricas:** automáticas con Micrometer/OTel: `ft_invocations_total{result,fallback}`, `ft_retry_retries_total`, `ft_circuitbreaker_state`, `ft_timeout_executionDuration`… Alerta obligada: transición a OPEN (el breaker abierto ES el incidente, solo que contenido) y ratio de fallbacks.

**Errores comunes:** retry por defecto sobre todo (duplicados); no dimensionar el timeout del caller vs el peor caso de retries; breaker sin `skipOn` de negocio; asumir que funcionan en self-invocation (interceptor CDI: misma trampa de proxy que `@Transactional`); y en reactivo, olvidar que sobre `Uni` FT aplica a la **suscripción**, no a la construcción.

**Qué espera oír el entrevistador:** el orden de anidamiento exacto y sus consecuencias (retries × timeout, breaker contando intentos), retry solo idempotente, `skipOn` de negocio, métricas `ft_*` con alerta en OPEN y la trampa de self-invocation.

---

## 10. Reactive Messaging con Kafka: channels, ack, commit strategies y concurrencia
**Categoría:** Mensajería / Kafka · **Tipo:** Conceptual

### 📝 Respuesta resumen
SmallRye Reactive Messaging modela la mensajería como **channels** conectados a métodos con `@Incoming`/`@Outgoing`; el connector Kafka los mapea a topics vía `mp.messaging.incoming.<canal>.*`. La pieza crítica es el **ack**: procesar `Payload` hace ack automático post-proceso; procesar `Message<T>` obliga a `ack()`/`nack()` manual. El ack se traduce en **commit strategy**: `throttled` (default: commitea el mayor offset contiguo procesado — at-least-once real), `latest` (commit inmediato — riesgo de pérdida con desorden) o `checkpoint` (estado en store externo). Los fallos van a la **failure strategy**: `fail` (default), `ignore` o `dead-letter-queue`. Concurrencia: orden por partición por defecto; `@Blocking(ordered=false)` o más particiones para paralelizar.

### 📖 Respuesta detallada
```java
@ApplicationScoped
public class OrderProcessor {

    @Incoming("orders-in")
    @Outgoing("orders-enriched")                 // procesador: consume, transforma, produce
    public Uni<Message<EnrichedOrder>> process(Message<Order> msg) {
        return enricher.enrich(msg.getPayload())
            .map(e -> msg.withPayload(e));       // withPayload PRESERVA la cadena de ack
    }

    @Incoming("audit-in")
    @Blocking                                    // JDBC permitido: worker
    public void audit(Order o) { auditRepo.save(o); }  // payload → ack automático al retornar
}
```
```properties
mp.messaging.incoming.orders-in.connector=smallrye-kafka
mp.messaging.incoming.orders-in.topic=orders
mp.messaging.incoming.orders-in.group.id=order-processor
mp.messaging.incoming.orders-in.commit-strategy=throttled
mp.messaging.incoming.orders-in.failure-strategy=dead-letter-queue
mp.messaging.incoming.orders-in.dead-letter-queue.topic=orders-dlq
mp.messaging.outgoing.orders-enriched.connector=smallrye-kafka
mp.messaging.outgoing.orders-enriched.topic=orders-enriched
```

**Ack — semántica exacta:**
- Firma con **payload**: ack **post-procesamiento** (al retornar o completar el Uni) → at-least-once. Excepción → nack → failure strategy.
- Firma con **`Message<T>`**: tú llamas `msg.ack()`/`msg.nack(t)`; olvidarlo = offsets que nunca avanzan (lag creciendo con consumo aparentemente "funcionando") — bug clásico. En cadenas `@Incoming`+`@Outgoing`, usar `msg.withPayload(…)`; crear un `Message.of(payload)` nuevo **rompe la cadena de ack**.
- `@Acknowledgment(PRE_PROCESSING)`: ack antes de procesar → at-most-once (telemetría descartable).

**Commit strategies (dónde se decide la garantía real):**
1. **`throttled`** (default, con `enable.auto.commit=false`): trackea offsets recibidos vs ack-eados y commitea periódicamente **el mayor offset contiguo procesado** — tolera procesamiento desordenado dentro de la partición sin perder mensajes → at-least-once correcto. Si un mensaje nunca se ack-ea, el commit se atasca y a los `throttled.unprocessed-record-max-age.ms` (default 60 s) el consumer se marca **unhealthy** (falla el health check) — señal de un ack olvidado.
2. **`latest`**: commit síncrono del offset de cada mensaje al ack. Simple pero: más carga y, con procesamiento concurrente, puede commitear el 105 cuando el 103 no terminó → crash = 103 perdido (at-most-once de facto).
3. **`checkpoint`**: offsets + estado en store externo (p. ej. la BD) — la base de "offsets en la BD" y exactly-once casero respecto a un almacén.

**Failure strategies:** `fail` para el consumo entero (sano: un veneno detiene y alerta), `ignore` (pérdida consciente), `dead-letter-queue` (publica en el topic DLQ con headers de causa y continúa — diseñando el replay y la deduplicación desde el día uno).

**Concurrencia y orden:** por defecto, procesamiento secuencial por partición (respeta el orden de Kafka). Paralelizar: más particiones + `mp.messaging.incoming.<c>.partitions=N`, o `@Blocking(ordered = false)` (varios workers, **sacrificando orden** — solo con procesamiento conmutativo/idempotente). La garantía global sigue siendo la de Kafka: orden solo por partición, duplicados tras rebalance → **idempotencia del consumidor obligatoria**.

**Extras:** `Emitter<T>`/`MutinyEmitter<T>` para publicar desde código imperativo (con `@OnOverflow(BUFFER)`); Schema Registry por canal; Dev Services levanta Kafka en dev/test; health checks del connector por canal.

**Errores comunes:** olvidar el ack con `Message<T>`; romper la cadena con `Message.of`; `latest` + `ordered=false` (pérdidas); tragarse excepciones dentro del Uni (nunca hay nack → atasco silencioso); sin DLQ ni alertas de lag.

**Qué espera oír el entrevistador:** payload-ack vs Message-ack, `throttled` explicado con el "mayor offset contiguo" y su detección de atascos, las tres failure strategies, el trade-off orden vs concurrencia, y el cierre: at-least-once + idempotencia — las garantías las define la commit strategy, no la anotación.

---

## 11. Dev mode y Dev Services: live reload, testcontainers automáticos y continuous testing
**Categoría:** Developer Experience · **Tipo:** Conceptual

### 📝 Respuesta resumen
`quarkus dev` arranca la app con **live reload real**: al recibir una request tras un cambio, recompila lo tocado y reinicia vía swap de classloader en cientos de ms — incluidos cambios en `application.properties`, entidades o endpoints. **Dev Services** detecta extensiones que necesitan infraestructura sin configurar (datasource sin URL, canal Kafka sin broker) y levanta contenedores automáticamente (Postgres, Kafka/Redpanda, Redis, Keycloak…) con la config inyectada — cero docker-compose. **Continuous testing** ejecuta en background los tests afectados por cada cambio. Con el **Dev UI** (`/q/dev-ui`), reduce el ciclo editar→ver de minutos a segundos y estandariza el onboarding: `git clone && quarkus dev`.

### 📖 Respuesta detallada
**Mecanismo del live reload:** dev mode mantiene dos classloaders: uno base (dependencias estables) y uno de aplicación desechable. Ante una request (o evento de FS), compara timestamps, recompila con el compilador embebido, tira el classloader de aplicación, re-ejecuta la augmentation afectada y atiende la request con la app nueva — típicamente < 1–2 s. No es HotSwap de JVM (limitado a cuerpos de método) ni spring-devtools (restart de contexto más pesado): aquí cambia hasta la config o el modelo de entidades. Límites honestos: cambios de dependencias (pom) piden reinicio; el estado en memoria se pierde.

**Dev Services — el contrato:** "si una extensión necesita un servicio y no lo configuraste, te lo levanto".
```properties
# SIN url de datasource ni broker:
quarkus.datasource.db-kind=postgresql
# dev/test → Dev Services arranca un postgres y setea jdbc.url solo
mp.messaging.incoming.orders-in.connector=smallrye-kafka
# → arranca Redpanda y configura kafka.bootstrap.servers
%prod.quarkus.datasource.jdbc.url=${DB_URL}      # prod: config real; Dev Services ni se activa
```
Detalles operativos: requiere Docker/Podman; los contenedores se **comparten entre dev y tests** y entre reinicios (label `quarkus-dev-service`, `…devservices.reuse`); imagen configurable (`quarkus.datasource.devservices.image-name=postgres:16`); cobertura amplia (SQL, Mongo, Redis, Kafka, RabbitMQ, Keycloak con realm importado, Vault…). En CI funcionan igual; conviene fijar imágenes y cachear el registry.

**Continuous testing:** en `quarkus dev`, pulsando `r`, corre en background **solo los tests afectados** por las clases cambiadas (análisis de cobertura inversa), con salida en terminal y Dev UI: el "rompí algo" llega en segundos sin salir del editor.

**Dev UI:** `/q/dev-ui` expone por extensión: beans ArC (incluidos **los eliminados y por qué** — pregunta 2), config efectiva con procedencia, endpoints y su prueba, consola de la BD de Dev Services, migraciones Flyway a demanda… Solo existe en dev, no en el build de prod.

**Por qué importa para un equipo (lo que el entrevistador quiere oír de un senior):**
1. **Onboarding:** el día uno pasa de instalar 5 servicios locales a `quarkus dev`; el entorno local deja de divergir por máquina.
2. **Paridad dev–test:** tests contra los mismos Dev Services (Postgres real, Kafka real) → menos mocks y el clásico bug de dialecto H2-vs-Postgres desaparece porque nadie usa H2.
3. **Ciclo corto = más iteraciones:** segundos por ciclo editar→probar × cientos de ciclos/día/dev — la mejora de productividad más medible del stack, más que cualquier benchmark de runtime.
4. Higiene de config: separa limpio `%prod` de dev/test autoconfigurado (refuerza la pregunta 8).

**Errores comunes:** no fijar `image-name` y sufrir un upgrade sorpresa de Postgres; CI sin caché de imágenes; y confiar en que "en prod también arranca solo" (no se activan: la config ausente falla — mejor explícita en `%prod`).

---

## 12. Testing en Quarkus: @QuarkusTest, @QuarkusIntegrationTest, @InjectMock y test profiles
**Categoría:** Testing · **Tipo:** Conceptual

### 📝 Respuesta resumen
`@QuarkusTest` arranca la app real **en la misma JVM del test**: puedes `@Inject` beans, mockear con `@InjectMock` y golpear HTTP con RestAssured; la app arranca una vez y se reutiliza entre clases, reiniciando solo al cambiar el `@TestProfile`. `@QuarkusIntegrationTest` testea el **artefacto empaquetado** (JAR, contenedor o **binario native**) como caja negra: solo HTTP, sin inyección ni mocks — es la única forma de testear el native real (`mvn verify -Dnative` reutiliza los mismos tests). La diferencia cultural con Spring: menos slices y mocks, más tests contra servicios reales de Dev Services.

### 📖 Respuesta detallada
**@QuarkusTest — el caballo de batalla:**
```java
@QuarkusTest
class OrderResourceTest {

    @Inject OrderService service;               // bean real
    @InjectMock PaymentClient paymentClient;    // reemplaza el bean CDI por un mock Mockito

    @Test
    void confirma_pedido() {
        Mockito.when(paymentClient.charge(any())).thenReturn(PaymentStatus.ok());
        given().contentType(JSON).body(new OrderRequest("A-1", 2))
            .when().post("/orders")
            .then().statusCode(201).body("status", is("CONFIRMED"));
    }
}
```
Mecánica relevante: la app arranca con la augmentation de test y **persiste entre clases** (no un contexto por clase, como es fácil provocar en Spring con `@MockBean` fragmentando el context cache). `@InjectMock` sustituye el bean en el CDI de esa app compartida (se resetea entre tests); cambiar el *conjunto* de config/mocks estructurales pide `@TestProfile`, que sí reinicia. `@QuarkusTest` + Dev Services = integración real por defecto: Postgres en contenedor y Redpanda sin escribir config (pregunta 11).

**@TestProfile:**
```java
public class StripeDisabledProfile implements QuarkusTestProfile {
    @Override public Map<String, String> getConfigOverrides() {
        return Map.of("app.pagos.provider", "fake");
    }
    @Override public Set<Class<?>> getEnabledAlternatives() { return Set.of(FakePayments.class); }
}
@QuarkusTest @TestProfile(StripeDisabledProfile.class)
class OrdersWithFakePaymentsTest { ... }
```
Cada perfil = un arranque distinto; agrupar tests por perfil minimiza reinicios (la disciplina del context caching, versión Quarkus).

**@QuarkusIntegrationTest — testear lo que despliegas:**
```java
@QuarkusIntegrationTest              // patrón habitual: los *IT extienden los tests black-box
class OrderResourceIT extends OrderResourceTest { }
```
Ejecuta el **artefacto empaquetado** (fast-jar, imagen o binario native si el build fue `-Dnative`) en otro proceso: **no hay `@Inject` ni `@InjectMock`** — todo por HTTP; las dependencias las dan Dev Services o `QuarkusTestResourceLifecycleManager` (WireMock, etc.). Es la respuesta a "¿cómo testeo native?": los mismos tests black-box corren contra el binario y cazan los fallos de closed-world (reflection no registrada, recursos ausentes) **antes** de producción — el eslabón que faltó en el caso 15. Coste: el build native previo (minutos) → viven en release/nightly, no en cada PR.

**Qué se testea distinto respecto a Spring (síntesis):**
1. **Menos slices:** no hay culto a `@WebMvcTest`/`@DataJpaTest`; el arranque completo es tan barato (~1–3 s, una vez) que el default es integración completa. Los unit tests puros siguen siendo JUnit sin Quarkus.
2. **Menos mocks de infraestructura:** BD/broker reales vía Dev Services en vez de H2 y mocks de KafkaTemplate → se valida SQL real, serialización real, transacciones reales.
3. **La pirámide gana una capa:** unit → `@QuarkusTest` → `@QuarkusIntegrationTest` JVM → `@QuarkusIntegrationTest` native (release). En Spring el escalón "binario real" no existe como concepto.
4. Equivalencias: `@QuarkusTestResource` ≈ `@Testcontainers` manual; estáticos de Panache → `PanacheMock` (pregunta 7); Mutiny en unit → `UniAssertSubscriber`; `@TestTransaction` para rollback por test.

**Errores comunes:** `@InjectMock` en un `@QuarkusIntegrationTest` (otro proceso: no puede funcionar); un `@TestProfile` por test individual y quejarse de la lentitud; asumir que los tests JVM garantizan native; y mockear el repositorio contra un Postgres que Dev Services ya daba gratis.

**Qué espera oír el entrevistador:** same-JVM vs artefacto empaquetado, `@InjectMock` y su límite, `@TestProfile` = reinicio, native testeado con los mismos tests black-box en release, y el cambio cultural: integración real por defecto gracias a Dev Services.

---

## 13. Transacciones en Quarkus: Narayana, propagación y el choque bloqueante/reactivo
**Categoría:** Transacciones · **Tipo:** Conceptual

### 📝 Respuesta resumen
En imperativo, Quarkus usa **Narayana** (JTA): `@Transactional` es un interceptor CDI con propagación `REQUIRED` (default), `REQUIRES_NEW`, `MANDATORY`, `SUPPORTS`, `NOT_SUPPORTED`, `NEVER`; rollback en unchecked (ajustable con `rollbackOn`), y la transacción ligada al **hilo**. En reactivo (Hibernate Reactive), la transacción va ligada al **contexto Vert.x**: se abre con `@WithTransaction` o `Panache.withTransaction(...)` y el commit se encadena a la completion del `Uni`. Mezclar mundos es el error clásico: `@Transactional` JTA sobre un método que devuelve `Uni` no funciona (la transacción se cierra al retornar el Uni, antes de que el trabajo ocurra), y Hibernate bloqueante dentro de un pipeline reactivo bloquea el event loop o falla por no haber sesión en contexto.

### 📖 Respuesta detallada
**Imperativo (Narayana + Hibernate ORM):**
```java
@ApplicationScoped
public class OrderService {

    @Transactional                                   // REQUIRED: se une o crea
    public void confirmar(Long id) {
        Order o = Order.findById(id);
        o.status = "CONFIRMED";                      // dirty checking; flush+commit al salir
        auditService.registrar(o);                   // misma tx
    }

    @Transactional(value = TxType.REQUIRES_NEW,
                   rollbackOn = Exception.class)     // checked también revierte
    public void registrarIntentoFallido(Long id) { ... }  // persiste aunque la tx externa muera
}
```
Las mismas verdades que en Spring, y decirlas suma: interceptor CDI → **self-invocation no abre transacción**; default rollback solo unchecked; `REQUIRES_NEW` suspende y toma **segunda conexión** del pool (riesgo de pool deadlock anidando); no meter HTTP/Kafka dentro (retiene conexión). Extras Quarkus: `QuarkusTransaction.requiringNew().run(...)` programático y `@TransactionConfiguration(timeout=…)`. Narayana trae JTA completo (XA/2PC — que en microservicios casi siempre se sustituye por outbox/sagas).

**Reactivo (Hibernate Reactive + Panache):**
```java
@ApplicationScoped
public class ReactiveOrderService {

    @WithTransaction                                  // tx reactiva ligada al contexto Vert.x
    public Uni<Order> confirmar(Long id) {
        return Order.<Order>findById(id)
            .onItem().ifNull().failWith(NotFoundException::new)
            .invoke(o -> o.status = "CONFIRMED");     // flush/commit cuando el Uni completa OK
    }
    // programático: Panache.withTransaction(() -> Order.findById(id).invoke(...))
}
```
Mecanismo: sesión y transacción viajan en el **duplicated context** de Vert.x que acompaña al pipeline; commit al éxito del `Uni` devuelto, rollback a su fallo. Consecuencia: todo lo transaccional debe estar **dentro del pipeline retornado**. Un `Uni` fugado (`subscribe()` suelto) queda fuera de la transacción — y a veces "funciona" en pruebas por timing, el peor tipo de bug.

**Los errores de mezcla, catalogados:**
1. **`@Transactional` (JTA) sobre método que devuelve `Uni`:** el interceptor abre/cierra la transacción alrededor de la *llamada*, que solo construye el Uni; cuando el pipeline se ejecuta, la transacción ya se cerró. Síntomas: escrituras perdidas o sesión cerrada. Fix: `@WithTransaction`.
2. **Hibernate ORM bloqueante dentro de pipeline reactivo:** en el mejor caso el BlockedThreadChecker delata el event loop bloqueado en JDBC; en el peor: `Cannot use the EntityManager/Session because neither a transaction nor a CDI request context is active`, o dos unidades de trabajo (JDBC y reactiva) escribiendo sin verse — inconsistencias serias. Regla: **un vertical elige un mundo**; no existe transacción que abarque una sesión JDBC y una reactiva.
3. **Hibernate Reactive desde código imperativo:** la sesión reactiva exige contexto Vert.x; desde un worker sin contexto → `No current Vertx context found`. Hay puentes (`VertxContextSupport.subscribeAndAwait`) pero son señal de arquitectura confusa.
4. Ambas extensiones (`quarkus-hibernate-orm` + `quarkus-hibernate-reactive`) en el mismo servicio: posible pero desaconsejado salvo migraciones — dos session factories, dos pools, cero atomicidad entre ellos.

**Criterio de diseño:** imperativo (worker/virtual threads) + Narayana para la mayoría de CRUD; reactivo end-to-end (REST reactivo + Hibernate Reactive + `@WithTransaction`) donde la concurrencia lo justifique. Y para atomicidad BD+mensajería, en ambos mundos, la respuesta es outbox — no estirar la transacción.

**Qué espera oír el entrevistador:** transacción ligada a hilo vs a contexto, `@Transactional` vs `@WithTransaction` con el porqué del fallo cruzado, los mensajes de error reconocibles, las trampas del interceptor (self-invocation, rollback de checked) y la regla de no mezclar mundos en la misma unidad de trabajo.

---

## 14. MicroProfile REST Client: interfaces tipadas, fault tolerance y propagación de contexto
**Categoría:** Integración / MicroProfile · **Tipo:** Conceptual

### 📝 Respuesta resumen
El REST Client de MicroProfile define el cliente HTTP como **interfaz JAX-RS anotada**: `@RegisterRestClient(configKey=…)` + `@Path/@GET`, inyección con `@RestClient`, y base URL/timeouts por config (`quarkus.rest-client.<key>.url=…`). En Quarkus la implementación es reactiva (HTTP client de Vert.x), soporta firmas síncronas y `Uni<T>`, y **se genera en build** (sin `Proxy` dinámico → native-friendly). Se compone con Fault Tolerance (las anotaciones van sobre la interfaz), propaga headers con `@ClientHeaderParam`/`ClientHeadersFactory`/`org.eclipse.microprofile.rest.client.propagateHeaders` y propaga OpenTelemetry automáticamente. Frente a Feign es el equivalente estándar (spec); frente a WebClient/RestClient de Spring, declarativo en vez de programático.

### 📖 Respuesta detallada
```java
@Path("/payments")
@RegisterRestClient(configKey = "payments-api")
@RegisterProvider(PaymentsErrorMapper.class)          // ResponseExceptionMapper: HTTP error → excepción tipada
public interface PaymentsClient {

    @POST @Path("/charges")
    @ClientHeaderParam(name = "X-Api-Version", value = "2")
    @Retry(maxRetries = 2, retryOn = IOException.class)
    @Timeout(2000)
    @CircuitBreaker(requestVolumeThreshold = 20, failureRatio = 0.5, delay = 10_000)
    Uni<PaymentStatus> charge(ChargeRequest req);      // o síncrono: PaymentStatus charge(...)
}
```
```properties
quarkus.rest-client.payments-api.url=${PAYMENTS_URL}
quarkus.rest-client.payments-api.connect-timeout=1000
quarkus.rest-client.payments-api.read-timeout=2500
```
```java
@ApplicationScoped
public class CheckoutService {
    @Inject @RestClient PaymentsClient payments;       // qualifier @RestClient obligatorio
}
```

**Mecánica interna que vale puntos:** en Quarkus la implementación se genera **en build** (bytecode, el mismo pipeline de RESTEasy Reactive) en lugar del `java.lang.reflect.Proxy` clásico → cero reflection en runtime, native sin registrar nada, y los DTOs de las firmas quedan registrados porque Jandex los ve. Con firma síncrona el client sigue siendo no bloqueante por debajo, pero la espera bloquea al llamante — en event loop hay que usar la variante `Uni`.

**Fault Tolerance:** la interfaz es un bean CDI, así que aplican los interceptores de la pregunta 9 (mismo orden, mismas métricas `ft_*`). Detalles de diseño: FT en la interfaz lo estandariza para todos los consumidores; pero `@Timeout` de FT **no sustituye** `connect-timeout`/`read-timeout` del client (el socket debe cortar por sí mismo; FT decide qué hacer con el resultado). Errores HTTP: por defecto ≥400 lanza `WebApplicationException`; un `ResponseExceptionMapper` los convierte a excepciones de dominio — imprescindible para que `retryOn`/`skipOn` distingan un 503 (reintentable) de un 422 (no).

**Propagación de headers y contexto:**
- `@ClientHeaderParam`: header estático o computado (método default/estático) por llamada.
- `ClientHeadersFactory` por client para headers dinámicos (service tokens). Con `@RegisterClientHeaders` sin argumentos, el factory default **reenvía** los headers entrantes listados en `org.eclipse.microprofile.rest.client.propagateHeaders=Authorization,X-Tenant` — la forma spec de propagar el bearer al downstream (lo que en Feign todo el mundo escribe a mano). En Quarkus además: `quarkus-rest-client-oidc-token-propagation`.
- **Trazas:** con `quarkus-opentelemetry`, el client inyecta `traceparent` solo — propagación W3C sin código.
- Caveat: los headers entrantes viven en el request context; desde un hilo/pipeline desligado del request (mensajería, schedulers) no existen — ahí el token se pasa explícitamente.

**Comparativa que espera el entrevistador:**
- **vs Feign:** mismo paradigma declarativo; REST Client es **spec estándar**, usa anotaciones JAX-RS (la interfaz puede compartirse como contrato con el server), y en Quarkus es build-time+reactivo mientras Feign es proxy dinámico (fricción en native).
- **vs WebClient/RestClient (Spring):** programáticos; el declarativo Spring moderno (`@HttpExchange`) converge al mismo modelo. Declarativo gana en contrato explícito; programático en casos dinámicos — en Quarkus ese rol lo cubre el Vert.x WebClient o `QuarkusRestClientBuilder`.

**Errores comunes:** olvidar el qualifier `@RestClient` (unsatisfied/ambiguous); no definir `read-timeout` (default alto) y fiarlo todo a `@Timeout`; reintentar POST no idempotentes; dejar cruzar `WebApplicationException` genérica sin mapear; y hardcodear `baseUri` en la anotación en lugar de `configKey` + property por entorno.

---

## 15. [CASO] En JVM funciona, el binario native peta en producción al deserializar un payload
**Categoría:** Native Image / Troubleshooting · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
Un servicio Quarkus lleva semanas estable en JVM. Se despliega la variante native y en producción aparecen errores intermitentes al procesar ciertos mensajes: `ClassNotFoundException: com.acme.billing.RefundDetail` (y en otros casos `InstantiationException`/campos que llegan a `null`) al deserializar un payload JSON polimórfico. Los `@QuarkusIntegrationTest` nativos del pipeline pasaron. ¿Por qué ocurre, por qué no lo vieron los tests, y cómo lo arreglas de raíz — no solo este caso?

### 📝 Respuesta resumen
Es el closed-world de Native Image: `RefundDetail` solo se alcanza por **reflection dinámica** (deserialización polimórfica decidida en runtime por un discriminador del JSON); el análisis estático no la vio y no está en el binario — o está sin constructores/campos registrados (de ahí `InstantiationException` y `null`s). Los tests nativos pasaron porque **no ejercitaron ese payload**: la cobertura del closed-world es por *rutas de datos*, no por endpoints. Fix inmediato: registrar la jerarquía (`@RegisterForReflection`). Fix de raíz: inventariar los puntos de reflection dinámica, registrarlos de forma versionada, y construir una suite nativa **representativa por catálogo de payloads** + validación en el arranque — sin confiar en el tracing agent como red de seguridad.

### 📖 Respuesta detallada
**Diagnóstico — por qué exactamente:**
1. El payload usa polimorfismo tipo `@JsonTypeInfo`/`@JsonSubTypes` (o un `readValue(json, Class.forName(header))`): la clase concreta se decide **en runtime con datos**. El análisis de `native-image` solo sigue referencias estáticas; la extensión de Jackson registra los DTOs alcanzables desde firmas vía Jandex, pero una subclase que solo aparece como string discriminador puede escapársele (típico: el subtipo vive en otro módulo sin índice, o el mapeo se registra programáticamente en un `ObjectMapper` custom que Jandex no puede interpretar).
2. Las tres firmas del mismo problema: `ClassNotFoundException` (clase podada del binario), `InstantiationException`/`MissingReflectionRegistrationError` (clase presente, constructor no registrado), y campos `null`/objeto vacío (campos/métodos no registrados — el más traicionero porque **no lanza**: corrompe datos en silencio).
3. **Por qué los tests nativos no lo cazaron:** cubrieron los flujos con payloads "normales"; `RefundDetail` solo aparece en reembolsos parciales, flujo no representado. Y si la config de reflection salió del **tracing agent**, hereda el mismo sesgo: el agente registra *lo ejecutado* — es un perfil, no un análisis (pregunta 3). Native convierte "cobertura incompleta" en "fallo de runtime" donde la JVM simplemente habría cargado la clase.

**Fix inmediato (parar el sangrado):**
```java
@RegisterForReflection(targets = {
    RefundDetail.class, ChargeDetail.class, DisputeDetail.class  // TODA la jerarquía
})
public class BillingPayloadReflectionConfig {}
```
o `reflect-config.json` con `allDeclared*` si los tipos son de una lib de terceros. Verificar con un test nativo que reproduce el payload exacto del incidente (sacado del DLQ/logs) antes de redeplegar.

**Fix de raíz (la respuesta senior):**
1. **Eliminar la reflection evitable:** si la jerarquía es propia, hacerla `sealed` y estáticamente visible (con `@JsonSubTypes` en la base y los módulos indexados vía `quarkus.index-dependency`, la extensión la registra sola). Cada `Class.forName(stringCalculado)` convertible en un mapa explícito `discriminador → clase` es un riesgo menos y un binario más pequeño.
2. **Inventario sistemático de dinámica:** grep dirigido (`Class.forName`, `newInstance`, `@JsonTypeInfo`, `ServiceLoader`, `getResourceAsStream`) + libs sin extensión Quarkus. Cada hallazgo: o se registra en **código versionado junto al tipo** (`@RegisterForReflection`, no un JSON huérfano que nadie actualiza cuando se añada `ChargebackDetail`), o se elimina la dinámica.
3. **Tests nativos representativos por datos, no por endpoints:** un test parametrizado que (de)serializa un fixture por **cada tipo/subtipo del contrato** — idealmente generado desde el schema registry o los ejemplos OpenAPI/AsyncAPI. Añadir un subtipo sin registrarlo rompe el nightly native, no producción.
4. **Fallar pronto en runtime:** smoke check en arranque/readiness que instancie por reflection los tipos del catálogo — convierte el fallo intermitente-bajo-tráfico en fallo de despliegue visible en el rollout.
5. **Proceso:** el tracing agent queda como herramienta de descubrimiento, nunca fuente de verdad; checklist de PR para "¿este cambio añade tipos deserializables?"; y la suite nativa completa en release/nightly (asumiendo los minutos de build, pregunta 4).

**Errores comunes en la respuesta:** "añade @RegisterForReflection y ya" (arregla el síntoma, garantiza reincidencia); "re-ejecuta el agente con más tráfico" (mismo sesgo, sin garantía); o registrar paquetes enteros con `allDeclared*` (binario y build engordan, y sigue sin haber proceso que lo mantenga).

**Qué espera oír el entrevistador:** el mapeo síntoma→causa (las tres firmas del fallo), por qué los tests pasaron (cobertura por rutas de datos + límites del agente), y un plan en capas: registro versionado junto al código, reducción de dinámica, suite nativa dirigida por el catálogo de payloads y verificación en arranque.

---

## 16. [CASO] Migrar 40 microservicios Spring Boot a Quarkus: ¿tiene sentido? Plan y criterios
**Categoría:** Arquitectura / Migración · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
Tu empresa tiene ~40 microservicios Spring Boot (Java 17/21, mezcla de MVC y WebFlux, Spring Data JPA, Kafka, Resilience4j, Spring Security con OIDC) en Kubernetes. Dirección propone migrarlos a Quarkus "para ahorrar infraestructura y arrancar en serverless". Te piden evaluar si tiene sentido y, en su caso, el plan. ¿Qué analizas, qué esperas ganar, dónde va a doler y cuáles son tus criterios de no-go?

### 📝 Respuesta resumen
No se evalúa "Quarkus sí/no" sino **para qué subconjunto compensa**. Análisis: inventario de dependencias por servicio (qué tiene extensión Quarkus y qué no), perfil de cada servicio (tráfico, memoria, criticidad) y coste real (se reescribe la capa framework: DI, config, security, data — el dominio se conserva). Ganancia medible: RSS (de 300–500 a 130–180 MB en JVM, 30–60 MB native → menos nodos), cold start para scale-to-zero, y DX (Dev Services). Dolerá en: librerías Spring-específicas sin equivalente, Spring Data→Panache, Security custom, curva del equipo y el pipeline native. Plan: piloto de 2–3 servicios representativos con métricas antes/después y criterios de no-go explícitos; **"migrar solo el 30 % y dejar el resto" es un resultado perfectamente bueno**.

### 📖 Respuesta detallada
**1. Qué analizo primero (una semana de trabajo real, no opiniones):**
- **Inventario automatizado de dependencias** de los 40 poms, clasificando cada una: (a) con extensión Quarkus oficial (Kafka, JPA/Hibernate, OIDC, Redis, Flyway, OpenTelemetry: cobertura buena); (b) portable con esfuerzo (lib estándar con reflection: config native manual); (c) Spring-específica sin equivalente (starters internos de plataforma, Spring Integration/Batch, aspectos custom, `BeanPostProcessor`s corporativos). La categoría (c) dimensiona el dolor real. Sobre el **Spring compatibility layer** (`quarkus-spring-web/di/data`): útil para suavizar sintaxis (`@Autowired`, `@GetMapping`, repositorios básicos) en transición, pero es un subconjunto — no ejecuta auto-configuraciones ni starters; quedarse a vivir en él da lo peor de ambos mundos: andamio temporal, no estrategia.
- **Perfil de cada servicio:** RSS/CPU reales de los pods, tráfico (el long tail a <10 req/s vs los 4 críticos de throughput), frecuencia de cambio, cobertura de tests (migrar sin red de tests es donde mueren estas iniciativas) y ownership.
- **La motivación real:** si es coste de infra → medir la memoria: 40 servicios × 3 réplicas × ~300 MB de diferencia ≈ 36 GB ≈ varios nodos. Si es serverless → identificar qué servicios se beneficiarían del scale-to-zero de verdad. Si es moda, el análisis debe decirlo.

**2. Qué espero ganar (números defendibles):**
- **Memoria:** Quarkus JVM ~40–60 % menos RSS que Boot equivalente; native 80–90 % menos (pregunta 1). Es el beneficio más seguro porque no exige native.
- **Cold start:** solo native lo transforma (segundos → decenas de ms) y solo importa para el subconjunto serverless/jobs/long-tail.
- **DX:** dev mode + Dev Services + continuous testing (pregunta 11) — real pero difícil de vender; se mide en el piloto (lead time de cambios).
- Lo que **no** espero ganar: throughput pico (la JVM con JIT puede incluso ganar, pregunta 4). Y la alternativa **"optimizar lo que hay"** (Spring Boot 3 AOT/native, CRaC) debe estar en el análisis para que la comparación sea honesta.

**3. Dónde va a doler (decirlo antes de que duela):**
- **Spring Data JPA → Panache:** repositorios derivados (`findByStatusAndCreatedAtAfter…`), `Specification`s y auditing no se traducen mecánicamente; es reescritura de la capa de datos con re-test de queries (pregunta 7).
- **Security:** los flujos OIDC estándar migran bien a Quarkus OIDC + `@RolesAllowed`/policies; la customización profunda de Spring Security (filtros, voters, SpEL) no.
- **WebFlux:** Reactor → Mutiny es traducción de API (hay interop), pero el equipo re-aprende operadores y depuración (pregunta 5).
- **Equipo y plataforma:** formar N equipos en CDI/ArC (bean removal, config build-time — trampas de las preguntas 2 y 8) y montar el pipeline native (minutos de build, GB de RAM, metadata de reflection — preguntas 4 y 15) si se adopta native.
- **Coste de oportunidad:** cada sprint de migración no es producto. Con dominio bien separado del framework, la migración por servicio son días-semanas; con lógica acoplada a Spring (eventos de contexto, aspectos, SpEL) puede ser un mes por servicio — el inventario lo revela.

**4. El plan:**
1. **Piloto (4–6 semanas): 2–3 servicios representativos** — un CRUD simple, uno con Kafka+resiliencia, uno del long tail candidato a native. Métricas antes/después definidas por adelantado: RSS/pod, arranque, p99 bajo carga igual, coste de nodo proyectado, tiempo real de migración por servicio y encuesta de DX al equipo.
2. **Decisión con criterios de no-go explícitos:** dependencia de categoría (c) sin plan de sustitución en servicios críticos; regresión de p99 en el crítico; coste medido > X semanas/servicio; equipo sin capacidad de soporte. Cualquiera de estos para o reduce el alcance — y decirlo antes del piloto es lo que da credibilidad.
3. **Si el piloto paga: oleadas por valor, no big-bang.** Primera oleada: el long tail de bajo tráfico (máximo ahorro de densidad, mínimo riesgo) y los candidatos a scale-to-zero en native. Los 4–5 críticos de throughput, **al final o nunca** (y en JVM mode si migran). Convivencia prolongada Spring+Quarkus asumida como estado normal: los contratos (REST/Kafka/OTel) no cambian, la heterogeneidad es barata si la plataforma (CI, observabilidad, seguridad) soporta ambos.
4. **Reglas:** servicio a servicio completo (no half-migrated con compat layer permanente); tests de contrato antes de tocar nada; native solo donde su beneficio aplica, JVM mode como default de llegada; presupuesto explícito de plataforma (imágenes base, pipeline native en release/nightly, formación).

**Qué espera oír el entrevistador:** que no respondes "sí/no" sino que segmentas; inventario de dependencias como primer entregable; números de memoria/arranque y la honestidad de que el throughput no mejora; el compat layer como andamio y no como destino; piloto con métricas y criterios de no-go **antes** de empezar; y la madurez de que "migrar una parte y parar" es éxito, no fracaso.
