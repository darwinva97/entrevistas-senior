# Módulo 3 · Spring Boot por dentro y transacciones

> **Curso 01 · Java senior** · 150 min

## Por qué esto importa en la entrevista

Spring es "magia" hasta que falla, y entonces necesitas saber **qué genera y cuándo**. Las tres preguntas que más se repiten —auto-configuración, proxies y `@Transactional`— comparten una misma raíz: *Spring envuelve tus beans en proxies y decide cosas en el arranque*. Quien entiende eso responde a las tres.

## Auto-configuración: qué pasa realmente en el arranque

1. `@SpringBootApplication` incluye `@EnableAutoConfiguration`.
2. Spring lee `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` de cada jar del classpath (en Boot 2.7− era `spring.factories`).
3. Cada clase de autoconfiguración se activa o no según sus **condiciones**: `@ConditionalOnClass` (¿está la librería?), `@ConditionalOnMissingBean` (¿el usuario ya lo definió?), `@ConditionalOnProperty`, `@ConditionalOnWebApplication`.
4. `@ConditionalOnMissingBean` es la clave de la filosofía: *"te doy un default razonable salvo que tú definas el tuyo"*, y por eso el orden de evaluación importa (`@AutoConfigureAfter/Before`).

**Herramienta que debes citar:** `--debug` o el endpoint de actuator `/actuator/conditions` te da el **informe de condiciones**: qué se aplicó (*positive matches*) y qué no y por qué (*negative matches*). Responder "miro el condition evaluation report" a un problema de configuración es señal de experiencia real.

Orden de precedencia de propiedades (de mayor a menor, resumido): argumentos de línea de comandos → variables de entorno → `application-{profile}.yml` externo → interno → defaults. En Kubernetes, esto es lo que explica el 90% de los "en mi máquina sí funciona".

## Proxies: la causa de los bugs "no me funciona la anotación"

Spring implementa AOP (transacciones, caché, `@Async`, seguridad de métodos) **envolviendo el bean en un proxy**:

- **Proxy JDK dinámico:** si el bean implementa interfaces; el proxy implementa la misma interfaz.
- **CGLIB:** subclase generada en tiempo de ejecución (default en Boot cuando no hay interfaz). Requiere clase no `final`, método no `final` ni `private`, y un constructor accesible.

De ahí las tres reglas que hay que recitar:

1. **La autoinvocación no pasa por el proxy.** Si `metodoA()` llama a `this.metodoB()` con `@Transactional`, **no hay transacción**: la llamada no sale del objeto. Soluciones: separar en otro bean (lo correcto), autoinyectarse, o `AopContext.currentProxy()` (feo).
2. **`@Transactional` en métodos `private`, `final` o `static` no hace nada.**
3. **Excepciones comprobadas no hacen rollback por defecto.** Solo `RuntimeException` y `Error`. Si lanzas una checked y esperas rollback: `@Transactional(rollbackFor = Exception.class)`.

Y el clásico de ciclo de vida: **inyectar un bean con scope `prototype`/`request` en un singleton** te da siempre la misma instancia salvo que uses `ObjectProvider`/`@Lookup`/proxy de scope.

## `@Transactional` a fondo

```java
@Transactional(propagation = REQUIRED,     // default: se une a la existente o crea
               isolation   = READ_COMMITTED,
               timeout     = 3,
               readOnly    = false,
               rollbackFor = Exception.class)
```

**Propagaciones que importan:**

| Propagación | Comportamiento | Uso típico |
|---|---|---|
| `REQUIRED` | se une o crea | default |
| `REQUIRES_NEW` | suspende la actual, abre otra (¡otra conexión!) | auditoría que debe persistir aunque la principal falle |
| `NESTED` | savepoint dentro de la misma transacción | rollback parcial (solo JDBC) |
| `SUPPORTS`/`NOT_SUPPORTED`/`NEVER` | matices | poco frecuentes |

**`REQUIRES_NEW` consume una segunda conexión del pool mientras la primera sigue abierta.** Si el pool tiene 10 y todos los hilos hacen esto, deadlock de pool. Es una pregunta trampa preciosa.

**Errores de diseño que debes saber señalar:**

- **Transacción larga que incluye llamadas HTTP.** Mantienes locks y una conexión mientras esperas a un tercero: la vía rápida a agotar HikariCP. Regla: *nada de I/O remoto dentro de una transacción de BD*.
- **`readOnly = true`** no es decorativo: evita dirty checking de Hibernate (menos memoria y CPU) y puede enrutar a réplicas.
- **Rollback silencioso:** capturar la excepción dentro del método transaccional y no relanzarla marca la transacción `rollback-only` si ocurrió en un método anidado, y luego revienta con `UnexpectedRollbackException` al commitear.
- **Publicar eventos dentro de la transacción:** usa `@TransactionalEventListener(phase = AFTER_COMMIT)` para no notificar cosas que luego se deshacen (y, mejor aún, outbox — ver [módulo 4](04-kafka-y-patrones-distribuidos.md)).

## JPA/Hibernate: lo que rompe en producción

**N+1 queries.** Un listado de 200 pedidos que accede a `pedido.getCliente()` lanza 201 consultas. Detección: `spring.jpa.properties.hibernate.generate_statistics=true`, o mejor, un test que cuente sentencias. Soluciones por orden:

```java
// 1) JOIN FETCH cuando necesitas la relación
@Query("select p from Pedido p join fetch p.cliente where p.estado = :e")

// 2) @EntityGraph, declarativo y reutilizable
@EntityGraph(attributePaths = {"cliente", "lineas"})
List<Pedido> findByEstado(String estado);

// 3) batch fetching para colecciones (evita el producto cartesiano)
// application.yml: spring.jpa.properties.hibernate.default_batch_fetch_size: 50

// 4) proyección DTO: lo más rápido para lecturas
@Query("select new com.x.PedidoResumen(p.id, c.nombre) from Pedido p join p.cliente c")
```

> **⚠️ Trampa:** poner `FetchType.EAGER` "para arreglar el N+1". Cambia el problema de sitio: ahora *toda* consulta arrastra la relación, y con dos colecciones EAGER obtienes `MultipleBagFetchException` o un producto cartesiano. **`LAZY` siempre por defecto; el fetch se decide por caso de uso.**

Otros puntos de alto valor: `LazyInitializationException` fuera de la sesión (y por qué `open-in-view` —activo por defecto en Boot— la esconde a costa de mantener la conexión durante el renderizado: desactívalo); `equals/hashCode` en entidades con id generado (rompe `Set` antes de persistir); el caché de primer nivel y por qué un `flush` inesperado reordena tus consultas; y bloqueo optimista con `@Version` como forma correcta de evitar lost updates.

**HikariCP:** el pool pequeño rinde más (ver ley de Little). `maximumPoolSize` típico: 10–20 por instancia; `connectionTimeout` (el famoso "Connection is not available, request timed out after 30000ms" significa que *todos* los hilos esperan) y `leakDetectionThreshold` para cazar conexiones no devueltas. Y recuerda: `max_connections` de Postgres es un recurso global — 20 instancias × 20 conexiones = 400, probablemente más de lo que tu BD aguanta (ahí entra PgBouncer).

## Testing que se nota

- **Pirámide realista:** muchos tests unitarios de dominio (sin Spring), unos cuantos `@DataJpaTest`/`@WebMvcTest` (slices, arrancan poco contexto), pocos de integración completos.
- **Testcontainers** para BD, Kafka y Redis reales: elimina el "en H2 pasa y en Postgres no" (dialectos, tipos, `ON CONFLICT`). Reutiliza contenedores (`withReuse`) y usa `@ServiceConnection` (Boot 3.1+) para que la configuración se inyecte sola.
- **Contract testing (Pact / Spring Cloud Contract)** para no romper consumidores sin montar E2E. Ver [curso 07](../07-apis-y-versionado/).
- El **caché de contexto** de Spring Test: cada combinación distinta de configuración crea un contexto nuevo; suites lentas casi siempre son eso.

## Errores comunes que delatan a un no-senior

- No saber explicar por qué `@Transactional` no funciona en autoinvocación.
- `EAGER` como solución al N+1.
- Llamadas HTTP dentro de transacciones.
- Pool de conexiones enorme "para aguantar más".
- Usar H2 en tests de integración de algo que en producción es Postgres.
- No conocer `/actuator/conditions` ni el informe de condiciones.

## 🧪 Laboratorio

1. **Autoinvocación:** crea un servicio con `@Transactional` llamado desde otro método de la misma clase; provoca una excepción y comprueba que **no** hay rollback. Arréglalo separando el bean y demuéstralo con un test.
2. **N+1 en vivo:** 200 pedidos con cliente `LAZY`; activa `generate_statistics` y cuenta las queries. Aplica `@EntityGraph` y vuelve a medir. Añade un test que falle si el número de sentencias supera N (con `hibernate.query.plan_cache` o un `StatementInspector`).
3. **Agota HikariCP:** `maximumPoolSize=5`, un endpoint transaccional con `Thread.sleep(5000)` (simulando la llamada HTTP dentro de la transacción) y 50 rps. Captura el error exacto y arréglalo sacando la llamada fuera de la transacción.
4. **`REQUIRES_NEW` peligroso:** pool de 2, método externo transaccional que invoca uno con `REQUIRES_NEW`. Provoca el deadlock de pool y explícalo.
5. **Testcontainers:** migra un test de H2 a Postgres real y encuentra al menos una diferencia de comportamiento.

**Entregable:** un repo pequeño con los 5 experimentos y un README con las conclusiones.

## ✅ Autoevaluación

1. Explica el arranque de Spring Boot: ¿cómo decide qué beans crear?
2. Llamo a `this.guardar()` anotado con `@Transactional` desde otro método del mismo bean. ¿Qué pasa y por qué?
3. ¿Qué excepciones hacen rollback por defecto?
4. ¿Por qué `REQUIRES_NEW` puede agotar el pool?
5. Detecta y arregla un N+1 sin usar EAGER; da tres estrategias.
6. ¿Por qué un pool de 100 conexiones puede ser peor que uno de 15?
7. ¿Qué es `open-in-view` y por qué lo desactivarías?

## 🎯 Preguntas del banco que ya puedes responder

- [`java-microservicios/02-spring-y-microservicios.md`](../../java-microservicios/02-spring-y-microservicios.md) — 1 (auto-config), 2 (@Transactional), 9 (proxies y ciclo de vida), 10 (config dinámica), 15 (Testcontainers), 16 (Pact)
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 8 (N+1), 13 (HikariCP)

---

**Anterior:** [Módulo 2](02-concurrencia-y-jmm.md) · **Siguiente:** [Módulo 4 · Kafka y patrones distribuidos](04-kafka-y-patrones-distribuidos.md)
