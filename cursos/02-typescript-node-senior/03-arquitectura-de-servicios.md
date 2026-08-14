# Módulo 3 · Arquitectura de servicios en Node / NestJS

> **Curso 02 · TypeScript/Node** · 150 min

## Por qué esto importa en la entrevista

Aquí se comprueba si sabes llevar un servicio Node **a producción**: apagado ordenado, errores async, configuración, límites, mensajería y testing. Node es fácil de arrancar y difícil de operar bien; el entrevistador busca las cicatrices.

## NestJS: DI, scopes y orden de ejecución

**Inyección de dependencias:** los providers son **singleton por defecto** dentro de un módulo (compartidos entre peticiones). Los scopes `REQUEST` y `TRANSIENT` existen, pero tienen un coste real: un provider `REQUEST`-scoped **contamina hacia arriba** toda su cadena de dependientes, que también pasan a instanciarse por petición. En un servicio con tráfico alto eso se nota. Alternativa: `AsyncLocalStorage` para contexto por petición (trace id, usuario, tenant) sin tocar los scopes.

```ts
// Contexto por petición sin scopes: barato y explícito
const als = new AsyncLocalStorage<{ traceId: string; userId?: string }>();
app.use((req, _res, next) => als.run({ traceId: req.headers['traceparent'] ?? crypto.randomUUID() }, next));
```

**Orden de ejecución** (pregunta clásica, hay que recitarlo):

```
petición
  → middleware
  → guards                      (authN/authZ: ¿puede pasar?)
  → interceptors (antes)        (logging, timeout, cache, mapeo)
  → pipes                       (validación y transformación de args)
  → handler del controlador
  → interceptors (después)      (transformar respuesta)
  → exception filters           (si algo lanzó, en cualquier punto)
```

Puntos finos que suman: los guards se ejecutan antes que los pipes (validas permisos antes de gastar en validar el body); un interceptor puede envolver con RxJS (`timeout()`, `catchError`); los exception filters son el único lugar donde debe construirse la respuesta de error (formato único, sin filtrar detalles internos: ver [curso 06](../06-seguridad/)).

**Arquitectura interna:** puertos y adaptadores (hexagonal) con el dominio sin dependencias de Nest ni del ORM. La prueba de fuego: ¿puedes testear tu caso de uso sin arrancar el framework? Si no, tienes lógica atrapada en controladores.

## Errores async: el fallo que tumba pods

```ts
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandled rejection');
  // Node 15+ ya termina el proceso por defecto: NO lo silencies, arregla el origen
  shutdown(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  shutdown(1);   // el estado ya no es fiable: hay que salir, ordenadamente
});
```

Reglas: nunca dejes una promesa sin `await` ni `.catch()` (el linter con `no-floating-promises` te lo caza); en `EventEmitter` usa `{ captureRejections: true }` o maneja el evento `error` (un `error` sin listener **lanza**); y no conviertas un fallo de negocio en una excepción no controlada — distingue error esperado (respuesta 4xx) de fallo (5xx + alerta).

## Graceful shutdown: la diferencia entre un deploy limpio y 502s

El caso real: Kubernetes manda `SIGTERM`, tu proceso muere al instante, y las peticiones en vuelo —y los mensajes a medio procesar— se pierden. Además, el endpoint sigue recibiendo tráfico unos segundos porque **la eliminación del endpoint del Service y el envío de SIGTERM son concurrentes**, no secuenciales.

```ts
let cerrando = false;
app.get('/readyz', (_, res) => res.status(cerrando ? 503 : 200).send());

process.on('SIGTERM', async () => {
  cerrando = true;                       // 1) readiness en rojo
  await sleep(5000);                     //    espera a que el LB/kube-proxy deje de enviar
  server.closeIdleConnections?.();
  await promisify(server.close)();       // 2) no aceptar nuevas, terminar en vuelo
  await consumidorKafka.disconnect();    // 3) commitear offsets y parar de consumir
  await colaBull.close();                //    dejar terminar los jobs activos
  await pool.end();                      // 4) cerrar conexiones a BD
  process.exit(0);
});
```

Y en el manifiesto: `terminationGracePeriodSeconds` mayor que la suma de esperas, y `preStop: sleep 5` como cinturón adicional. Explicar la carrera del readiness es exactamente lo que distingue a quien ha depurado 502s en rollouts de quien ha leído un tutorial.

## Mensajería en el ecosistema Node

| Tecnología | Cuándo | Ojo con |
|---|---|---|
| **BullMQ (Redis)** | jobs, reintentos, cron, prioridades; latencia baja; simple de operar | durabilidad limitada por la persistencia de Redis; no es un log de eventos |
| **RabbitMQ** | enrutamiento complejo, colas por consumidor, prefetch fino, DLX nativas | no reprocesas el pasado: el mensaje consumido se va |
| **Kafka** | log de eventos, alto volumen, varios consumidores del mismo flujo, reproceso | operación más pesada; el orden solo por partición |
| **SQS/SNS, Pub/Sub** | gestionado, escalado automático | límites de tamaño, orden (FIFO con coste), visibilidad |

Lo importante no es la lista, es el criterio: **¿necesitas reproducir el historial? → log (Kafka). ¿Trabajo con reintentos y prioridad? → cola de jobs. ¿Enrutamiento por reglas? → RabbitMQ.** Y en los tres, las reglas del [curso 00 módulo 3](../00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md): at-least-once, idempotencia, DLQ.

Detalle específico de BullMQ que da credibilidad: los jobs deben ser idempotentes porque un worker que muere deja el job en `active` y el *stalled check* lo devuelve a la cola; `jobId` estable es tu deduplicación.

## gRPC vs REST entre servicios

- **REST/JSON:** universal, depurable con curl, cacheable por HTTP, ideal hacia fuera.
- **gRPC:** contrato fuerte (protobuf), HTTP/2 multiplexado, streaming bidireccional, deadlines nativos, código generado. Mejor para tráfico interno de alto volumen y para propagar presupuesto de latencia. Coste: tooling, balanceo L7 obligatorio (HTTP/2 mantiene conexiones: un LB L4 reparte mal), y menos amigable desde el navegador (grpc-web).

Elige gRPC hacia dentro y REST hacia fuera es una respuesta segura *si* justificas por qué; y menciona que el contrato protobuf te da evolución compatible (ver [curso 07](../07-apis-y-versionado/)).

## Configuración, secretos y arranque

- Valida el entorno **al arrancar** y falla rápido (Zod). Un servicio que arranca sin `DATABASE_URL` y falla en la primera petición es peor que uno que no arranca.
- Nada de secretos en imágenes ni en `.env` commiteados; secret manager o secretos del orquestador montados como ficheros/env.
- **Recarga en caliente** solo para lo que tenga sentido (feature flags, umbrales), con validación y valor por defecto seguro; nunca para cadenas de conexión.
- Distingue configuración por entorno (URLs, credenciales) de decisiones de negocio (flags), y no compiles ninguna de las dos.

## Testing que se nota

- **Unitario del dominio sin framework** (rápido, la mayoría).
- **Integración con Testcontainers** (Postgres, Redis, Kafka reales). Evita mocks del ORM: prueban tus mocks, no tu SQL.
- **Contract testing (Pact)** con los consumidores para no romperlos sin E2E.
- **De carga**, aunque sea 5 minutos con `autocannon`: es la única forma de encontrar bloqueos del event loop antes que el cliente.
- Nada de tests que dependan de `sleep` fijos: relojes falsos (`vi.useFakeTimers`) y esperas por condición.

## Errores comunes que delatan a un no-senior

- No implementar graceful shutdown (o hacerlo sin la espera del readiness).
- Silenciar `unhandledRejection` para "que no se caiga".
- Usar `REQUEST` scope en NestJS sin conocer su propagación.
- `Promise.all` sobre 10.000 elementos contra un servicio externo (fan-out sin límite).
- Mockear el ORM en tests de integración.
- No validar la configuración al arrancar.

## 🧪 Laboratorio

1. **502s en rollout:** despliega en kind/minikube, lanza carga con `autocannon` y haz `kubectl rollout restart`. Cuenta los errores. Implementa el apagado completo (readiness → espera → close → consumidores → pool) y repite hasta llegar a cero.
2. **Orden de ejecución:** en un proyecto Nest, añade logs en middleware, guard, pipe, interceptor y filter, y confirma el orden real. Provoca una excepción en cada etapa y observa qué la captura.
3. **Fan-out controlado:** procesa 10.000 ids contra una API con `Promise.all` (observa el colapso) y luego con `p-limit(20)`. Compara latencia, errores y uso de sockets.
4. **BullMQ:** job que muere a mitad; demuestra el reintento y hazlo idempotente con `jobId` estable.
5. **Contract test:** monta un Pact entre dos servicios tuyos y rompe el contrato a propósito para ver el fallo en CI.

**Entregable:** el servicio con shutdown limpio (cero 502 en rollout) y su manifiesto Kubernetes.

## ✅ Autoevaluación

1. Recita el orden guards/pipes/interceptors/filters y di por qué guards van primero.
2. ¿Qué problema real tiene un provider `REQUEST`-scoped?
3. Diseña el graceful shutdown de un servicio con HTTP + consumidor Kafka + jobs. ¿Por qué esperas antes de cerrar?
4. ¿Cómo eliges entre BullMQ, RabbitMQ y Kafka?
5. ¿Por qué gRPC necesita balanceo L7 y qué pasa con un LB L4?
6. ¿Qué haces ante un `unhandledRejection` y por qué no basta con loguearlo?

## 🎯 Preguntas del banco que ya puedes responder

- [`typescript-microservicios/02-node-y-microservicios.md`](../../typescript-microservicios/02-node-y-microservicios.md) — 5–14
- [`typescript-microservicios/03-casos-y-problemas.md`](../../typescript-microservicios/03-casos-y-problemas.md) — 4, 5, 6, 8, 10, 13, 14, 16

---

**Anterior:** [Módulo 2](02-event-loop-y-rendimiento.md) · **Siguiente:** [Módulo 4 · Laboratorio de diagnóstico Node](04-laboratorio-diagnostico-node.md)
