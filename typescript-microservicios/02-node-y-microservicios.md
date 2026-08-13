# Node.js y Microservicios — Preguntas de Entrevista Senior

Colección de preguntas de nivel Senior sobre el runtime de Node.js, NestJS, comunicación entre servicios, mensajería, patrones de resiliencia y observabilidad, con respuestas resumidas para la entrevista y explicaciones profundas con código TypeScript realista.

## 1. Explica las fases del event loop de Node.js y qué se ejecuta en cada una
**Categoría:** Runtime de Node.js · **Tipo:** Conceptual

### 📝 Respuesta resumen
El event loop de libuv itera por fases: **timers** (callbacks de `setTimeout`/`setInterval` vencidos), **pending callbacks** (callbacks de I/O diferidos, p. ej. errores TCP), **idle/prepare** (interno), **poll** (espera y procesa I/O nuevo; aquí vive la mayor parte del tiempo), **check** (`setImmediate`) y **close callbacks** (`'close'` de sockets). Entre cada callback (no solo entre fases) se drenan las microtasks: primero la cola de `process.nextTick` y luego la de promesas/`queueMicrotask`. JavaScript sigue siendo single-threaded; la concurrencia viene de delegar I/O al sistema operativo y al thread pool de libuv.

### 📖 Respuesta detallada
Node.js ejecuta JavaScript en un solo hilo, pero el event loop —implementado en libuv— orquesta la concurrencia. Cada iteración («tick» del loop) recorre fases con colas FIFO propias:

1. **Timers**: ejecuta callbacks de `setTimeout`/`setInterval` cuyo umbral venció. Importante: el tiempo es un *mínimo*, no una garantía; si el loop está ocupado, un `setTimeout(fn, 100)` puede ejecutarse a los 500 ms.
2. **Pending callbacks**: callbacks de operaciones del sistema diferidos de la iteración anterior (p. ej. errores `ECONNREFUSED` de TCP).
3. **Idle/prepare**: uso interno de libuv.
4. **Poll**: la fase central. Calcula cuánto puede bloquearse esperando I/O (según el timer más próximo), procesa eventos de red/archivos y ejecuta sus callbacks. Si no hay timers pendientes ni `setImmediate` programados, el loop se queda aquí esperando.
5. **Check**: ejecuta callbacks de `setImmediate`. Por eso dentro de un callback de I/O, `setImmediate` siempre corre antes que `setTimeout(fn, 0)`: al salir de poll se pasa directamente a check.
6. **Close callbacks**: eventos `'close'` (`socket.on('close', ...)`).

Las **microtasks** no pertenecen a ninguna fase: Node drena la cola de `process.nextTick` y después la de promesas *después de cada callback de macrotask*, no solo entre fases. Esto significa que un `await` reanuda antes que cualquier timer o I/O pendiente.

```typescript
import { setImmediate } from 'node:timers';
import * as fs from 'node:fs';

fs.readFile('./pedido.json', () => {
  // Estamos en la fase poll (callback de I/O)
  setTimeout(() => console.log('timeout'), 0);   // fase timers (próxima iteración)
  setImmediate(() => console.log('immediate'));  // fase check (esta iteración)
  process.nextTick(() => console.log('nextTick')); // antes de continuar el loop
  Promise.resolve().then(() => console.log('promise'));
});
// Orden garantizado: nextTick → promise → immediate → timeout
```

Fuera de un callback de I/O (en el script principal), el orden `setTimeout(0)` vs `setImmediate` es **no determinista**: depende de si el loop arranca antes o después de que venza el timer de ~1 ms. Es un clásico de entrevista.

**Errores comunes**: creer que "async" implica otro hilo (solo el I/O y algunas operaciones de crypto/zlib/fs usan el thread pool de libuv, por defecto 4 hilos vía `UV_THREADPOOL_SIZE`); creer que las microtasks se drenan "entre fases" en lugar de entre callbacks; y bloquear la fase poll con CPU intensiva, retrasando timers y sockets de *todas* las peticiones concurrentes.

**Qué espera oír el entrevistador**: los nombres de las fases y el rol central de poll, la distinción macrotask/microtask con el orden `nextTick → promesas`, que `setImmediate` gana a `setTimeout(0)` dentro de I/O pero no en el main script, la existencia del thread pool de libuv, y la consecuencia práctica: una tarea de CPU larga degrada la latencia de todas las conexiones porque solo hay un hilo de JS.

## 2. [CASO] Un servicio deja de responder a health checks aunque el proceso sigue vivo: sospechas de starvation de microtasks. ¿Qué está pasando y cómo lo diagnosticas?
**Categoría:** Runtime de Node.js · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Si el código encola microtasks (`process.nextTick`, promesas que se resuelven síncronamente en bucle) sin ceder al event loop, éste nunca avanza a las fases de timers/poll: el servidor no acepta sockets nuevos ni responde health checks, aunque la CPU esté al 100 % "trabajando". Se diagnostica con `perf_hooks.monitorEventLoopDelay()`, `--prof`/clinic doctor, o un log del event loop delay. La solución es trocear el trabajo cediendo con `setImmediate` (macrotask) o moverlo a un worker thread.

### 📖 Respuesta detallada
La cola de microtasks se drena **completamente** después de cada macrotask, y las microtasks pueden encolar más microtasks. Un bucle recursivo con `process.nextTick` o con promesas resueltas de forma inmediata produce *starvation*: el loop nunca vuelve a poll y el proceso queda vivo pero sordo.

```typescript
// ❌ Procesamiento "asíncrono" que mata el servicio
async function procesarPedidos(pedidos: Pedido[]): Promise<void> {
  for (const pedido of pedidos) {
    // validarPedido devuelve una promesa YA resuelta (todo su trabajo es síncrono).
    // El await encola una microtask, que se ejecuta inmediatamente:
    // con 2 millones de pedidos, el event loop no toca poll en segundos/minutos.
    await validarPedido(pedido);
  }
}

// ✅ Ceder al event loop cada N elementos con una macrotask real
import { setImmediate as setImmediateP } from 'node:timers/promises';

async function procesarPedidosSeguro(pedidos: Pedido[]): Promise<void> {
  let i = 0;
  for (const pedido of pedidos) {
    await validarPedido(pedido);
    if (++i % 500 === 0) await setImmediateP(); // deja pasar I/O, timers y health checks
  }
}
```

Punto sutil que distingue a un senior: `await` sobre una promesa resuelta **no** cede al event loop; solo encola una microtask. Ceder de verdad requiere una macrotask (`setImmediate`, `setTimeout`). Y `process.nextTick` es aún más agresivo: su cola se drena antes que la de promesas, por lo que un `nextTick` recursivo bloquea incluso a las promesas.

**Diagnóstico**:

```typescript
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  const elu = performance.eventLoopUtilization();
  console.log({ p99Ms: h.percentile(99) / 1e6, elu: elu.utilization });
  h.reset();
}, 5000).unref();
```

Un `p99` de cientos de milisegundos con ELU (event loop utilization) cercana a 1.0 indica que el hilo está ocupado en JS, no esperando I/O. Con `clinic doctor`/`clinic flame` o `node --cpu-prof` se localiza la función culpable. En Kubernetes, el síntoma típico es que la liveness probe falla y el pod entra en crash-loop justo bajo carga: reiniciar no arregla nada porque el problema es algorítmico.

**Errores comunes**: intentar "arreglarlo" subiendo el timeout de la probe; usar `setTimeout(fn, 0)` en Node pensando que es equivalente a `setImmediate` (funciona, pero con overhead de timer); o repartir con `Promise.all` creyendo que paraleliza CPU (no lo hace: sigue siendo un hilo).

**Qué espera oír el entrevistador**: la explicación mecánica de por qué microtasks recursivas bloquean el loop, la diferencia entre "await cede" (falso con promesas resueltas) y ceder con macrotasks, herramientas concretas (`monitorEventLoopDelay`, ELU, clinic, CPU profiles) y la decisión arquitectónica: si el trabajo es CPU-bound de forma sostenida, no se trocea, se mueve a worker threads o a otro servicio.

## 3. Worker threads vs cluster vs child_process: ¿cuándo usarías cada uno?
**Categoría:** Runtime de Node.js · **Tipo:** Conceptual

### 📝 Respuesta resumen
`worker_threads` para CPU-bound dentro del mismo proceso: hilos con su propio event loop y heap de V8, memoria compartible vía `SharedArrayBuffer` y transferencia de `ArrayBuffer` sin copia. `cluster` para escalar un servidor HTTP en todos los cores compartiendo el puerto (aunque en Kubernetes suele sustituirse por réplicas de pods). `child_process` para ejecutar binarios externos (`ffmpeg`, `git`) o aislar código inestable en otro proceso con IPC. Para cargas repetidas, siempre con un *pool* (p. ej. `piscina`), nunca creando workers por petición.

### 📖 Respuesta detallada
Los tres mecanismos responden a problemas distintos y confundirlos es una señal de alarma en una entrevista senior.

**`worker_threads`**: hilos reales del SO dentro del mismo proceso. Cada worker tiene su propio isolate de V8 (heap y event loop propios), por lo que *no* comparten objetos JS: se comunican por `postMessage` con structured clone (copia), transfiriendo `ArrayBuffer`/`MessagePort` (movimiento sin copia) o compartiendo memoria real con `SharedArrayBuffer` + `Atomics` para sincronización. Úsalos para CPU-bound: firmar/verificar JWT en masa, comprimir, parsear payloads enormes, scoring de fraude sobre pedidos. Crear un worker cuesta milisegundos y ~MBs de memoria, así que en producción se usa un pool:

```typescript
import Piscina from 'piscina';
import { resolve } from 'node:path';

const pool = new Piscina({
  filename: resolve(__dirname, 'workers/calcular-riesgo.js'),
  maxThreads: 4,           // ≈ cores disponibles; más no ayuda en CPU-bound
  idleTimeout: 30_000,
});

export async function evaluarRiesgoPago(pago: PagoDto): Promise<RiesgoResultado> {
  // Se serializa con structured clone; el event loop principal queda libre
  return pool.run(pago, { name: 'evaluarRiesgo' });
}
```

**`cluster`**: hace fork de N procesos (no hilos) que comparten el socket de escucha; el proceso primario reparte conexiones (round-robin por defecto en Linux). Sirve para saturar todos los cores con un servidor HTTP sin balanceador externo. Trade-off moderno: en Kubernetes se prefiere 1 proceso por pod y escalar con réplicas — el scheduler, las métricas por pod y los límites de memoria funcionan mejor; `cluster` sigue teniendo sentido en VMs o bare metal (o vía PM2).

**`child_process`**: procesos totalmente independientes. `spawn` para streams de binarios externos (`ffmpeg`, generación de PDFs), `execFile` para comandos cortos (evitando `exec` con strings interpolados por riesgo de inyección de shell), `fork` para procesos Node con canal IPC. Aporta máximo aislamiento: si el hijo hace segfault o se come la memoria, el padre sobrevive. Coste: la comunicación serializa por pipe y arrancar un proceso es mucho más caro que un hilo.

**Errores comunes**: usar workers para I/O-bound (no aportan nada: el event loop ya es eficiente para I/O y añaden coste de serialización); pasar objetos gigantes por `postMessage` sin transferirlos (la copia puede costar más que el propio cálculo); usar `SharedArrayBuffer` sin `Atomics` y sufrir data races; y dimensionar el pool muy por encima del número de cores, provocando context switching sin ganancia.

**Qué espera oír el entrevistador**: la regla "I/O-bound → event loop; CPU-bound → workers; binarios/aislamiento → child_process; multi-core HTTP → cluster o réplicas"; que los workers no comparten heap salvo `SharedArrayBuffer`; el concepto de transferables vs copia; la necesidad de un pool (piscina) con tamaño ligado a cores; y la reflexión de plataforma: en Kubernetes, `cluster` compite con el horizontal pod autoscaler y suele perder.

## 4. Streams y backpressure: ¿cómo procesarías un archivo de 10 GB de pedidos sin tumbar el servicio?
**Categoría:** Runtime de Node.js · **Tipo:** Conceptual

### 📝 Respuesta resumen
Con streams: leen y escriben en chunks acotados por `highWaterMark`, y el **backpressure** propaga la presión hacia atrás: cuando `write()` devuelve `false`, el productor debe pausar hasta el evento `'drain'`. Nunca encadeno con `.pipe()` a mano en producción: uso `pipeline()` (o `stream/promises`), que propaga errores y destruye todos los streams ante fallo. Para transformar, un `Transform`; para consumir con lógica async, iteradores asíncronos (`for await`), que gestionan el backpressure automáticamente.

### 📖 Respuesta detallada
Cargar 10 GB con `fs.readFile` revienta el heap (límite por defecto ~4 GB en 64 bits, y mucho antes el pod por su memory limit). Los streams procesan en chunks (16 KB por defecto en streams binarios, 64 KB en `fs`), manteniendo memoria constante.

El mecanismo clave es el **backpressure**: cada `Writable` tiene un buffer interno limitado por `highWaterMark`. `write()` devuelve `false` cuando el buffer se llena; un productor bien educado deja de escribir hasta `'drain'`. Si lo ignoras, el buffer crece sin límite y el proceso muere por OOM — el síntoma clásico es "el streaming funciona en local y explota en producción con un consumidor lento" (p. ej. subir a S3 leyendo de disco rápido).

`pipeline()` encapsula todo esto correctamente:

```typescript
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Transform, type TransformCallback } from 'node:stream';
import split2 from 'split2';

class ValidarPedido extends Transform {
  constructor() { super({ objectMode: true }); }
  _transform(linea: string, _enc: BufferEncoding, cb: TransformCallback) {
    try {
      const pedido = JSON.parse(linea) as Pedido;
      if (pedido.total > 0) this.push(pedido);
      cb();
    } catch (err) { cb(err as Error); } // el error destruye TODO el pipeline
  }
}

await pipeline(
  createReadStream('/data/pedidos.ndjson.gz', { highWaterMark: 1 << 20 }),
  createGunzip(),
  split2(),                 // una línea NDJSON por chunk
  new ValidarPedido(),
  async function* (pedidos: AsyncIterable<Pedido>) {  // consumidor async con backpressure
    let lote: Pedido[] = [];
    for await (const p of pedidos) {
      lote.push(p);
      if (lote.length === 500) { await repositorio.insertarLote(lote); lote = []; }
    }
    if (lote.length) await repositorio.insertarLote(lote);
  },
);
```

Puntos senior de este código: `pipeline` (a diferencia de `.pipe()`) propaga errores y llama a `destroy()` en todos los streams, evitando fugas de file descriptors; los generadores async como último eslabón consumen con `for await`, que solo pide el siguiente chunk cuando el `await` interno terminó — backpressure gratis incluso con I/O a base de datos; y `objectMode` cambia la semántica de `highWaterMark` de bytes a número de objetos (por defecto 16).

**Trade-offs y errores comunes**: subir `highWaterMark` mejora el throughput a costa de memoria y de latencia de cancelación — no es un "turbo" gratuito. Mezclar `data` events con `pause()`/`resume()` manual es propenso a bugs; los iteradores async son casi siempre preferibles. Olvidar `await` en el consumidor de un `for await` rompe el backpressure. Y usar `.pipe()` sin manejar `'error'` en *cada* stream deja streams zombis: `.pipe()` solo desconecta, no destruye.

**Qué espera oír el entrevistador**: la explicación mecánica de backpressure (`write() === false` → `'drain'`), por qué `pipeline` > `.pipe()`, el rol de `highWaterMark` en bytes vs objectMode, iteradores async como forma moderna y segura de consumir, y la conexión con producción: memoria constante, manejo de errores centralizado y cleanup garantizado.

## 5. Inyección de dependencias en NestJS: providers, scopes y su coste
**Categoría:** NestJS · **Tipo:** Conceptual

### 📝 Respuesta resumen
NestJS construye un grafo de dependencias por módulos: los providers se registran con tokens (clase, string o símbolo) y se inyectan por constructor. Hay tres scopes: `DEFAULT` (singleton, una instancia por aplicación), `REQUEST` (una instancia por petición) y `TRANSIENT` (una instancia por consumidor). `REQUEST` y `TRANSIENT` tienen coste real: instanciación por petición y "scope bubbling" — todo lo que inyecta un provider request-scoped se vuelve request-scoped —, lo que puede degradar el rendimiento de forma silenciosa. Para configuración asíncrona se usan factory providers y `forRootAsync`.

### 📖 Respuesta detallada
El contenedor de NestJS resuelve dependencias en base a metadata de TypeScript (`emitDecoratorMetadata`): el tipo del parámetro del constructor actúa como token. Cuando el token no es una clase (config, conexiones, valores), se usan tokens explícitos con `@Inject()` y providers no estándar: `useValue`, `useClass`, `useFactory`, `useExisting`.

```typescript
import { Injectable, Inject, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Kafka, type Producer } from 'kafkajs';

export const KAFKA_PRODUCER = Symbol('KAFKA_PRODUCER');

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KAFKA_PRODUCER,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<Producer> => {
        const kafka = new Kafka({ brokers: config.getOrThrow<string>('KAFKA_BROKERS').split(',') });
        const producer = kafka.producer({ idempotent: true });
        await producer.connect();   // Nest espera la promesa antes de inyectar
        return producer;
      },
    },
    PedidosService,
  ],
  exports: [KAFKA_PRODUCER],
})
export class MensajeriaModule {}

@Injectable()
export class PedidosService {
  constructor(@Inject(KAFKA_PRODUCER) private readonly producer: Producer) {}
}
```

Ese mismo patrón de `useFactory` + `inject` es exactamente lo que los módulos dinámicos exponen como `forRootAsync`/`registerAsync` (`TypeOrmModule.forRootAsync`, `BullModule.forRootAsync`): permite configurar un módulo con dependencias resueltas en runtime (ConfigService, secretos de Vault) en lugar de valores estáticos en tiempo de import. Un senior debe saber explicar que `forRoot` configura y provee los servicios core (se importa una vez en `AppModule`) mientras `forFeature` registra recursos concretos por módulo (entidades, colas).

**Scopes y su coste**. `DEFAULT` es singleton: se instancia en el bootstrap y se comparte — es lo deseable en el 99 % de los casos porque los servicios deberían ser stateless. `Scope.REQUEST` crea el provider (y su subárbol) en cada petición: útil para multi-tenancy (inyectar el tenant desde el `REQUEST`) o para contexto por petición, pero caro. Lo peligroso es el **scope bubbling**: si un controller inyecta un servicio request-scoped, el controller entero se vuelve request-scoped, y así hacia arriba; una dependencia inocente puede convertir media aplicación en "instanciar todo por request", multiplicando latencia y presión de GC. Además, los providers request-scoped no están disponibles en consumidores fuera del ciclo request (cron jobs, consumidores Kafka) sin `ModuleRef.resolve()` con un `ContextId`. `TRANSIENT` crea una instancia por cada punto de inyección — típico para loggers con contexto del consumidor.

La alternativa moderna al scope REQUEST para propagar contexto (requestId, usuario, tenant) es `AsyncLocalStorage` (o `nestjs-cls`): mantiene singletons y evita el bubbling, con coste casi nulo.

**Errores comunes**: dependencias circulares "resueltas" con `forwardRef` en lugar de repensar el diseño; guardar estado mutable en singletons (race conditions entre peticiones); no exportar un provider del módulo y sorprenderse de que no se resuelva; y usar `REQUEST` scope para logging cuando ALS lo hace gratis.

**Qué espera oír el entrevistador**: tokens y providers no estándar, `useFactory` async como base de `forRootAsync`, la semántica exacta de los tres scopes, el problema del scope bubbling con números en mente (instanciación + GC por petición), y `AsyncLocalStorage` como alternativa idiomática.

## 6. Guards, interceptors, pipes y exception filters en NestJS: orden de ejecución y casos de uso
**Categoría:** NestJS · **Tipo:** Conceptual

### 📝 Respuesta resumen
Orden de entrada: middleware → guards → interceptors (parte "pre") → pipes → handler; a la vuelta: interceptors (parte "post", sobre el observable) → exception filters si algo lanzó. Guards deciden acceso (authz: roles, ownership); pipes validan y transforman la entrada (`ValidationPipe` + class-validator); interceptors envuelven la ejecución (logging, timeouts, caching, mapeo de respuesta); filters traducen excepciones a respuestas HTTP consistentes. Dentro de cada tipo, el orden es global → controller → handler (en interceptors, la vuelta es inversa, como una cebolla).

### 📖 Respuesta detallada
Entender el pipeline es lo que permite decidir *dónde* poner cada responsabilidad, y es pregunta obligada de NestJS senior.

**Guards** implementan `canActivate` y corren antes que interceptors y pipes: si devuelven `false` o lanzan, nada más se ejecuta. Caso real: `JwtAuthGuard` global + `RolesGuard` que lee metadata de `@Roles('admin')` vía `Reflector`. Error común: hacer validación de payload en un guard — para eso están los pipes; el guard no debería tocar el body.

**Interceptors** implementan `intercept(context, next)` y son los únicos que ven *ambos lados* de la ejecución, porque `next.handle()` devuelve un `Observable` que pueden transformar:

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, RequestTimeoutException } from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, tap, timeout } from 'rxjs/operators';

@Injectable()
export class TimeoutLoggingInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const inicio = Date.now();
    const req = ctx.switchToHttp().getRequest<{ url: string }>();
    return next.handle().pipe(          // "pre": todo lo anterior a esta línea
      timeout(5_000),
      tap(() => console.log(`${req.url} → ${Date.now() - inicio}ms`)),  // "post"
      catchError((err) =>
        throwError(() => (err instanceof TimeoutError ? new RequestTimeoutException() : err)),
      ),
    );
  }
}
```

Casos reales: timeouts por endpoint, cache (devolver `of(cached)` sin llamar a `next.handle()`), serialización (`ClassSerializerInterceptor` para no filtrar campos sensibles del `PagoEntity`), y envolver respuestas en un formato estándar.

**Pipes** corren justo antes del handler, sobre cada argumento. `ValidationPipe` global con `whitelist: true, forbidNonWhitelisted: true, transform: true` es el estándar: convierte el body en instancia del DTO, valida con class-validator y rechaza propiedades desconocidas (defensa contra mass assignment). También pipes de parámetro: `ParseUUIDPipe` en `@Param('pedidoId')`.

**Exception filters** capturan cualquier excepción no manejada del pipeline y construyen la respuesta. Un `@Catch()` global suele mapear errores de dominio (`PedidoNoEncontradoError` → 404, `SaldoInsuficienteError` → 422) y ocultar detalles internos en 500, logueando con el requestId. Matiz importante: lo que un interceptor re-lanza en `catchError` sí pasa por los filters; pero los filters no capturan errores lanzados *dentro de otro filter*.

**Orden fino**: con varios interceptors, el "pre" corre global → controller → método, y el "post" al revés (modelo cebolla). Los guards y pipes también van de global a método. Middleware (Express-style) corre antes que todo pero fuera del contexto de Nest (sin DI de `ExecutionContext`), por eso authn con Passport se modela como guard y no como middleware.

**Errores comunes**: lógica de negocio en interceptors; devolver respuestas desde guards (deben lanzar `ForbiddenException`); olvidar que un interceptor con `map` sobre el observable no se aplica si el guard rechazó; y duplicar validación en pipe y en servicio.

**Qué espera oír el entrevistador**: el orden exacto middleware → guards → interceptors → pipes → handler → interceptors(post) → filters, el modelo de observable en interceptors, casos de uso concretos por pieza, la configuración estándar de `ValidationPipe`, y el criterio de diseño: authz en guards, shape de datos en pipes, cross-cutting en interceptors, traducción de errores en filters.

## 7. REST vs gRPC entre microservicios con TypeScript: ¿cuándo eliges cada uno?
**Categoría:** Comunicación entre servicios · **Tipo:** Conceptual

### 📝 Respuesta resumen
REST/JSON para APIs públicas o consumidas por frontends: universal, cacheable, debuggable con curl, tooling maduro (OpenAPI). gRPC para tráfico interno servicio-a-servicio con alto volumen: contrato fuerte en `.proto`, serialización binaria Protobuf (menor payload y CPU), HTTP/2 con multiplexación, streaming bidireccional y **deadlines propagables**. En TypeScript, `ts-proto` (o Buf) genera tipos e interfaces desde el proto, dando type-safety real entre equipos. El trade-off: gRPC complica debugging, browsers (necesita grpc-web) y balanceo L7 (conexiones HTTP/2 persistentes en Kubernetes).

### 📖 Respuesta detallada
La decisión no es "cuál es mejor" sino dónde corta cada uno. REST gana en el borde: cache HTTP, herramientas ubicuas, curl/Postman, semántica de verbos y códigos entendida por todos, y evolución tolerante (JSON ignora campos desconocidos). Su debilidad interna: contratos débiles (OpenAPI se desincroniza si no se genera del código o viceversa), overhead de JSON en payloads grandes y sin streaming bidireccional nativo.

gRPC invierte esas propiedades. El `.proto` es la fuente de verdad del contrato:

```protobuf
// pagos.proto
syntax = "proto3";
package pagos.v1;

service PagosService {
  rpc AutorizarPago(AutorizarPagoRequest) returns (AutorizarPagoResponse);
  rpc StreamEventosPago(StreamEventosRequest) returns (stream EventoPago); // server streaming
}

message AutorizarPagoRequest {
  string pedido_id = 1;
  int64 monto_centavos = 2;   // dinero en enteros, nunca float
  string moneda = 3;
}
```

Con `ts-proto` (`protoc --plugin=ts_proto --ts_proto_opt=outputServices=nice-grpc`) se generan interfaces TypeScript puras, y con `nice-grpc` el servidor/cliente quedan tipados de extremo a extremo:

```typescript
import { createChannel, createClient } from 'nice-grpc';
import { PagosServiceDefinition, type PagosServiceClient } from './gen/pagos/v1/pagos';

const channel = createChannel('pagos.internal:50051');
const pagos: PagosServiceClient = createClient(PagosServiceDefinition, channel);

const res = await pagos.autorizarPago(
  { pedidoId: pedido.id, montoCentavos: 15990n, moneda: 'EUR' },
  { deadline: new Date(Date.now() + 2_000) },   // deadline explícito, propagable aguas abajo
);
```

Los **deadlines** son el detalle que separa a un senior: en gRPC el cliente fija un plazo absoluto que viaja en metadata; cada servicio intermedio puede consultarlo y abortar trabajo inútil si ya expiró (deadline propagation), evitando que una cadena A→B→C siga computando para una petición que A ya abandonó. En REST esto se improvisa con `AbortSignal.timeout()` y headers ad-hoc, casi nunca bien.

El **streaming** (server, client y bidireccional) permite casos que REST no cubre: seguir eventos de un pago en curso, subir lotes grandes sin bufferizar, o sincronización continua. En Node se consume idiomáticamente como `AsyncIterable`, encajando con `for await`.

**Trade-offs y errores comunes**: gRPC sobre Kubernetes con Service estándar balancea *conexiones*, no peticiones — HTTP/2 mantiene una conexión viva y todas las RPC van al mismo pod; se necesita balanceo L7 (Envoy/Linkerd) o client-side LB. Protobuf es binario: sin `grpcurl`/reflection el debugging duele. Versionado: los field numbers son sagrados — nunca reutilizarlos, campos nuevos siempre opcionales, y paquetes `v1`/`v2` para breaking changes. Y no exponer gRPC directo a browsers sin grpc-web/Connect.

**Qué espera oír el entrevistador**: criterio de frontera (público → REST, interno de alto volumen o streaming → gRPC), proto como contrato compartido con codegen (`ts-proto`/Buf) y su impacto en coordinación entre equipos, deadlines y su propagación, el problema real de balanceo HTTP/2 en Kubernetes, y las reglas de evolución de Protobuf. Bonus: mencionar que muchas organizaciones reducen la pregunta usando mensajería asíncrona para todo lo que no necesite respuesta síncrona.

## 8. Kafka vs RabbitMQ vs BullMQ: ¿cómo eliges la tecnología de mensajería?
**Categoría:** Mensajería · **Tipo:** Conceptual

### 📝 Respuesta resumen
**Kafka** es un log distribuido: topics particionados, consumer groups que reparten particiones, offsets que gestiona el consumidor, retención por tiempo — ideal para event streaming, alto throughput, replay y múltiples consumidores independientes; el orden solo se garantiza por partición (clave de particionado = p. ej. `pedidoId`). **RabbitMQ** es un broker de colas con routing rico (exchanges direct/topic/fanout), acks por mensaje, requeues y DLQ nativas — ideal para task queues y comandos con routing complejo. **BullMQ** son colas de jobs sobre Redis: reintentos con backoff, prioridades, jobs retrasados/repetibles, concurrencia por worker — ideal para background jobs dentro de tu propio sistema, no como bus entre equipos.

### 📖 Respuesta detallada
La pregunta de fondo es qué semántica necesitas: *stream de eventos* (hechos que varios sistemas consumen a su ritmo), *distribución de tareas con routing* o *jobs internos*.

**Kafka**: un topic se divide en particiones; cada partición es un log append-only ordenado e inmutable. Los productores eligen partición por hash de la key — con `key = pedidoId`, todos los eventos de un pedido caen en la misma partición y conservan orden entre sí (no hay orden global del topic, y un senior lo dice sin que se lo pregunten). Un **consumer group** reparte particiones entre instancias: máximo un consumidor activo por partición dentro del grupo, así que el paralelismo máximo = número de particiones (decisión de capacidad difícil de cambiar después: reparticionar rompe la afinidad de keys). Cada grupo mantiene sus **offsets**: los mensajes no se borran al consumirse (retención por tiempo/tamaño), lo que habilita replay, nuevos consumidores que leen el histórico y desacople real entre equipos.

```typescript
import { Kafka } from 'kafkajs';

const kafka = new Kafka({ clientId: 'facturacion', brokers: ['kafka:9092'] });
const consumer = kafka.consumer({ groupId: 'facturacion-pedidos' });

await consumer.subscribe({ topic: 'pedidos.eventos', fromBeginning: false });
await consumer.run({
  eachMessage: async ({ partition, message }) => {
    const evento = JSON.parse(message.value!.toString()) as PedidoEvento;
    await facturar(evento);      // si lanza, kafkajs no commitea el offset → reintento
  },
});
```

El offset se commitea *después* de procesar → semántica at-least-once → el consumidor debe ser idempotente (ver pregunta de outbox/idempotencia).

**RabbitMQ**: el productor publica a un **exchange**; los bindings enrutan a colas según el tipo (direct por routing key exacta, topic con comodines `pedidos.*.creado`, fanout a todas, headers). El consumidor hace `ack` por mensaje; `nack`/`reject` con `requeue: false` envía a la **dead-letter exchange** (DLQ), donde se inspeccionan o reprocesan mensajes venenosos. `prefetch` limita mensajes sin ack por consumidor (backpressure). Los mensajes se destruyen al consumirse: no hay replay. Brilla cuando necesitas routing expresivo, colas por prioridad, TTLs por mensaje y latencias bajas con throughput moderado.

**BullMQ**: no es un broker entre servicios sino un sistema de jobs sobre Redis: `Queue.add('enviar-email', datos, { attempts: 5, backoff: { type: 'exponential', delay: 1000 } })` y un `Worker` con `concurrency: 20`. Aporta lo que Kafka/Rabbit no dan out-of-the-box para jobs: reintentos con backoff por job, jobs retrasados y repetibles (cron), prioridades, rate limiting y UI (Bull Board). Sus límites: Redis como single point (persistencia AOF/replicación a configurar), sin routing entre equipos, y todo consumidor debe conocer la cola concreta.

**Criterio práctico en un dominio de pedidos**: eventos de dominio que consumen facturación, analítica y notificaciones → Kafka; comandos con routing (enviar a la pasarela X según país, con DLQ) → RabbitMQ; "reenviar email de confirmación con 5 reintentos y backoff" → BullMQ. **Errores comunes**: elegir Kafka "por moda" y sufrir su operación para 100 msg/s que Rabbit o BullMQ resuelven trivialmente; asumir orden global en Kafka; olvidar configurar DLQ en Rabbit y perder mensajes venenosos en un bucle infinito de requeue.

**Qué espera oír el entrevistador**: los modelos mentales (log vs broker vs job queue), particiones/keys/consumer groups y sus implicaciones de orden y paralelismo, acks/prefetch/DLQ en Rabbit, reintentos y concurrencia en BullMQ, at-least-once como default universal, y un criterio de elección anclado a casos, no a hype.

## 9. Patrón Saga: coreografía vs orquestación en un flujo de pedidos y pagos
**Categoría:** Patrones de microservicios · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una saga descompone una transacción de negocio distribuida (crear pedido → reservar stock → cobrar → confirmar) en pasos locales, cada uno con su **compensación** (liberar stock, reembolsar). En **coreografía**, cada servicio reacciona a eventos y emite los suyos: sin acoplamiento central, pero el flujo global queda implícito y difícil de razonar. En **orquestación**, un orquestador (máquina de estados persistida) manda comandos y decide compensaciones: flujo explícito y testeable, a costa de un componente más. Las compensaciones son semánticas, no rollbacks: el email enviado no se "des-envía", se envía otro de cancelación.

### 📖 Respuesta detallada
Sin transacciones ACID entre servicios (2PC no escala y acopla disponibilidad), la saga acepta **consistencia eventual**: cada paso commitea localmente, y si un paso posterior falla, se ejecutan compensaciones de los pasos ya commiteados en orden inverso.

**Coreografía**: `pedidos` publica `PedidoCreado`; `inventario` escucha, reserva y publica `StockReservado`; `pagos` escucha, cobra y publica `PagoCompletado` o `PagoRechazado`; ante `PagoRechazado`, `inventario` libera la reserva y `pedidos` cancela. Ventajas: desacoplamiento máximo, sin single point. Desventajas serias a escala: el flujo vive repartido en N servicios (nadie puede responder "¿en qué estado está la saga del pedido X?"), riesgo de ciclos de eventos, y añadir un paso obliga a tocar varios servicios.

**Orquestación**: un componente dirige el flujo con una máquina de estados **persistida** (imprescindible: el orquestador puede morir a mitad de saga y debe retomar donde iba):

```typescript
type SagaEstado = 'INICIADA' | 'STOCK_RESERVADO' | 'PAGO_COMPLETADO' | 'CONFIRMADA' | 'COMPENSANDO' | 'CANCELADA';

export class CrearPedidoSaga {
  constructor(
    private readonly inventario: InventarioClient,
    private readonly pagos: PagosClient,
    private readonly repo: SagaRepository,   // persiste estado en cada transición
  ) {}

  async ejecutar(pedido: Pedido): Promise<void> {
    const saga = await this.repo.crear(pedido.id, 'INICIADA');
    try {
      await this.inventario.reservar(pedido.id, pedido.items);
      await this.repo.transicion(saga.id, 'STOCK_RESERVADO');

      await this.pagos.cobrar({ pedidoId: pedido.id, montoCentavos: pedido.totalCentavos });
      await this.repo.transicion(saga.id, 'PAGO_COMPLETADO');

      await this.repo.transicion(saga.id, 'CONFIRMADA');
    } catch (err) {
      await this.repo.transicion(saga.id, 'COMPENSANDO');
      await this.compensar(saga, pedido, err as Error);   // orden inverso, cada paso reintentable
    }
  }

  private async compensar(saga: SagaInstance, pedido: Pedido, causa: Error): Promise<void> {
    if (saga.alcanzo('PAGO_COMPLETADO')) await this.pagos.reembolsar(pedido.id);      // idempotente
    if (saga.alcanzo('STOCK_RESERVADO')) await this.inventario.liberar(pedido.id);    // idempotente
    await this.repo.transicion(saga.id, 'CANCELADA', { causa: causa.message });
  }
}
```

Puntos que un senior debe verbalizar: (1) **las compensaciones también fallan** — deben ser idempotentes y reintentarse (típicamente vía cola con backoff); si una compensación no puede completarse, la saga queda en un estado "requiere intervención" con alerta, no en silencio. (2) Hay pasos **no compensables** (email enviado, dinero capturado en pasarelas sin refund automático): se ordena la saga para dejar los pasos irreversibles al final (pattern *pivot transaction*). (3) Durante la saga el sistema es visiblemente inconsistente (pedido "PENDIENTE_PAGO"): el modelo de dominio debe representar estados intermedios en lugar de fingir atomicidad. (4) Los comandos/eventos de la saga deben viajar con outbox e idempotencia (siguiente pregunta), o la saga misma introduce duplicados.

**Criterio de elección**: coreografía para flujos cortos (2-3 pasos) y equipos que quieren autonomía; orquestación cuando el flujo tiene ramas, timeouts de negocio ("cancelar si no se paga en 30 min") o necesita visibilidad operacional. Frameworks como Temporal llevan la orquestación al extremo (workflows duraderos con replay determinista) y vale la pena mencionarlos.

**Errores comunes**: creer que compensar es rollback exacto; orquestador sin persistencia (muere y deja sagas zombis); coreografía con 8 pasos que nadie sabe dibujar; y no diseñar timeouts (la saga espera `PagoCompletado` para siempre).

**Qué espera oír el entrevistador**: por qué no 2PC, la definición de compensación semántica, el contraste coreografía/orquestación con criterios (visibilidad, acoplamiento, evolución), persistencia de la máquina de estados, pasos no compensables/pivot, y la conexión con idempotencia y entrega at-least-once.

## 10. Patrón Outbox e idempotencia: ¿cómo consigues "exactly-once efectivo" entre base de datos y broker?
**Categoría:** Patrones de microservicios · **Tipo:** Conceptual

### 📝 Respuesta resumen
El problema del doble escrito: si guardo el pedido en Postgres y luego publico a Kafka (o al revés), una caída entre ambas operaciones deja los sistemas inconsistentes. **Outbox**: escribo la entidad y el evento en la misma transacción local (tabla `outbox`), y un proceso aparte (polling o CDC con Debezium) publica los eventos pendientes. Eso garantiza publicación at-least-once; el "exactly-once" se completa en el consumidor con **idempotencia**: claves de idempotencia y deduplicación persistente. Exactly-once real no existe extremo a extremo; existe *efecto* exactly-once = at-least-once + consumidores idempotentes.

### 📖 Respuesta detallada
El antipatrón que el entrevistador quiere ver que reconoces:

```typescript
// ❌ Doble escrito: si el proceso muere entre las dos líneas, hay pedido sin evento
await pedidoRepo.save(pedido);
await kafkaProducer.send({ topic: 'pedidos.eventos', messages: [{ value: JSON.stringify(evento) }] });
```

Invertir el orden solo cambia el modo de fallo (evento sin pedido). Envolverlo en try/catch no ayuda: no hay transacción que abarque Postgres y Kafka.

**Outbox**: el evento se persiste atómicamente con el cambio de estado, porque ambos van a la misma base de datos:

```typescript
import { DataSource } from 'typeorm';

export class PedidosService {
  constructor(private readonly ds: DataSource) {}

  async crearPedido(dto: CrearPedidoDto): Promise<Pedido> {
    return this.ds.transaction(async (em) => {
      const pedido = await em.save(Pedido.crear(dto));
      await em.save(OutboxEvent.of({
        id: crypto.randomUUID(),          // eventId = clave de deduplicación aguas abajo
        aggregateId: pedido.id,
        tipo: 'PedidoCreado',
        payload: pedido.toEvento(),
      }));
      return pedido;                      // commit atómico de entidad + evento
    });
  }
}

// Relay (proceso/cron): publica pendientes y marca como enviados.
// Alternativa superior en volumen: CDC con Debezium leyendo el WAL de Postgres.
async function publicarPendientes(ds: DataSource, producer: Producer): Promise<void> {
  const eventos = await ds.getRepository(OutboxEvent)
    .createQueryBuilder('e').setLock('pessimistic_write').setOnLocked('skip_locked') // varias réplicas sin pisarse
    .where('e.publishedAt IS NULL').orderBy('e.createdAt').take(100).getMany();
  for (const e of eventos) {
    await producer.send({
      topic: 'pedidos.eventos',
      messages: [{ key: e.aggregateId, value: JSON.stringify(e.payload), headers: { eventId: e.id } }],
    });
    await ds.getRepository(OutboxEvent).update(e.id, { publishedAt: new Date() });
  }
}
```

El relay puede morir tras publicar y antes de marcar → el evento sale dos veces. Es decir: outbox da **at-least-once garantizado**, nunca exactly-once. La otra mitad es el consumidor idempotente. Dos técnicas complementarias: (1) **idempotencia natural** — diseñar operaciones que aplicadas dos veces den el mismo resultado (`UPDATE pedidos SET estado='FACTURADO' WHERE id=$1 AND estado='CONFIRMADO'`); (2) **deduplicación explícita** — registrar el `eventId` procesado en la misma transacción que el efecto:

```typescript
await ds.transaction(async (em) => {
  const insert = await em.query(
    'INSERT INTO eventos_procesados (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [eventId],
  );
  if (insert.rowCount === 0) return;   // duplicado: ya procesado, salir sin efectos
  await aplicarEfecto(em, evento);     // efecto + dedup commitean juntos
});
```

El matiz crítico: el registro de deduplicación y el efecto deben commitear **en la misma transacción**; si la dedup va en Redis y el efecto en Postgres, reaparece el doble escrito. Para APIs HTTP, el mismo principio se expone como **Idempotency-Key** (estilo Stripe): el cliente manda una clave por operación de negocio; el servidor guarda clave → respuesta y devuelve la respuesta cacheada ante reintentos.

**Trade-offs y errores comunes**: el outbox añade latencia de publicación (polling) o infraestructura (Debezium); la tabla outbox crece y necesita purga; deduplicar "en memoria" no sobrevive reinicios ni réplicas; confiar en el `idempotent: true` del producer Kafka como si fuera end-to-end (solo cubre reintentos producer→broker, no tu aplicación); y usar timestamp como clave de idempotencia en lugar de un ID de negocio o UUID del evento.

**Qué espera oír el entrevistador**: el problema del dual-write formulado con precisión, outbox como atomicidad local + relay (polling vs CDC), la frase "exactly-once end-to-end no existe: es at-least-once + idempotencia", dedup transaccional con el efecto, `Idempotency-Key` para HTTP, y las claves correctas (eventId/businessId, no timestamps).

## 11. [CASO] Al desplegar en Kubernetes se pierden peticiones y quedan jobs a medias: diseña el graceful shutdown
**Categoría:** Operación / Kubernetes · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
En cada rollout, Kubernetes manda `SIGTERM` al contenedor y, tras `terminationGracePeriodSeconds` (30 s por defecto), `SIGKILL`. Si el proceso no maneja `SIGTERM`, muere en seco: sockets cortados (502 en el LB), mensajes a medio procesar, transacciones abiertas. El shutdown correcto: (1) marcar readiness como no-listo para dejar de recibir tráfico nuevo, (2) esperar unos segundos a que los proxies actualicen endpoints, (3) `server.close()` para drenar conexiones en curso, (4) parar consumidores/workers dejando terminar el job actual, (5) cerrar pools de DB y flush de telemetría, (6) `process.exit(0)`. Con timeout global menor que el grace period.

### 📖 Respuesta detallada
El detalle que muchos ignoran y que causa los 502: en Kubernetes, el `SIGTERM` y la retirada del pod de los Endpoints ocurren **en paralelo**, no en orden. Durante 1-5 segundos después del SIGTERM, kube-proxy/ingress pueden seguir mandando peticiones nuevas al pod. Por eso el primer paso es fallar la readiness probe (o esperar un `preStop` sleep) *antes* de cerrar el servidor. Liveness y readiness cumplen roles distintos: liveness = "reinicia este proceso"; readiness = "no le mandes tráfico" — el shutdown solo debe tocar readiness.

```typescript
import { createServer } from 'node:http';
import type { Server } from 'node:http';

export class GracefulShutdown {
  private cerrando = false;

  constructor(
    private readonly server: Server,
    private readonly kafkaConsumer: { disconnect(): Promise<void> },
    private readonly bullWorker: { close(): Promise<void> },   // espera al job en curso
    private readonly db: { destroy(): Promise<void> },
    private readonly otelSdk: { shutdown(): Promise<void> },
  ) {
    process.on('SIGTERM', () => void this.apagar());
    process.on('SIGINT', () => void this.apagar());
  }

  estaListo(): boolean { return !this.cerrando; }   // la readiness probe consulta esto

  private async apagar(): Promise<void> {
    if (this.cerrando) return;          // SIGTERM duplicado
    this.cerrando = true;

    const timeoutFinal = setTimeout(() => process.exit(1), 25_000); // < grace period de 30 s
    timeoutFinal.unref();

    // 1) readiness → 503; 2) margen para que LB/kube-proxy dejen de enrutar aquí
    await new Promise((r) => setTimeout(r, 5_000));

    // 3) dejar de aceptar conexiones y esperar a que terminen las vivas
    await new Promise<void>((res, rej) => this.server.close((e) => (e ? rej(e) : res())));

    // 4) parar consumo de mensajes/jobs SIN matar el trabajo en curso
    await Promise.allSettled([this.kafkaConsumer.disconnect(), this.bullWorker.close()]);

    // 5) recursos y telemetría al final: los pasos anteriores aún los usan
    await this.db.destroy();
    await this.otelSdk.shutdown();      // flush de spans/métricas pendientes

    process.exit(0);
  }
}
```

Matices senior: `server.close()` deja de aceptar conexiones pero espera a las peticiones en curso; las conexiones **keep-alive ociosas** no se cierran solas en Node < 18.2 — hoy `server.closeIdleConnections()` resuelve, y `closeAllConnections()` es el martillo final antes del timeout. Los consumidores Kafka deben desconectar *después* de terminar el mensaje actual — kafkajs lo hace en `disconnect()`, y el rebalanceo reasigna las particiones a otros pods. En BullMQ, `worker.close()` espera el job activo; si el job puede tardar más que el grace period, hay que subir `terminationGracePeriodSeconds` o diseñar jobs re-tomables (checkpointing) — recordando que con at-least-once el job puede reejecutarse igualmente, así que la idempotencia sigue siendo la red de seguridad.

En NestJS esto se integra con `app.enableShutdownHooks()` y los lifecycle hooks (`onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown`), que Nest ejecuta en orden inverso al grafo de dependencias — pero hay que verificar que cada provider (pools, consumers) implemente su cierre.

**Errores comunes**: hacer `process.exit()` directamente en el handler de SIGTERM (aborta todo en vuelo); cerrar la DB antes de drenar el HTTP (las peticiones vivas fallan); no poner timeout global y quedar colgado hasta el SIGKILL (que es igual de abrupto que no manejar nada); y olvidar el caso de SIGTERM repetido.

**Qué espera oír el entrevistador**: la secuencia readiness → drain → consumers → recursos → exit, el race de endpoints en Kubernetes (por eso el sleep/preStop), la diferencia liveness/readiness, `server.close()` + `closeIdleConnections()`, el timeout global < `terminationGracePeriodSeconds`, y la relación con idempotencia: el graceful shutdown reduce el daño, la idempotencia lo hace inocuo.

## 12. Manejo de errores async en Node: unhandled rejections, captureRejections y por qué no "tragar" errores
**Categoría:** Runtime de Node.js · **Tipo:** Conceptual

### 📝 Respuesta resumen
Desde Node 15, una promesa rechazada sin handler **mata el proceso** (`--unhandled-rejections=throw` por defecto): es un bug de programación, no una condición recuperable. Los orígenes típicos: fire-and-forget sin `.catch()`, `async` callbacks pasados a APIs que no esperan promesas, y `Promise.all` que deja rechazos "huérfanos". Los `EventEmitter` son otro frente: un `'error'` sin listener crashea, y los listeners `async` que lanzan generan unhandled rejections salvo que se active `captureRejections`. `process.on('unhandledRejection')` sirve para loguear y hacer shutdown ordenado — nunca para silenciar y seguir, porque el proceso queda en estado indeterminado.

### 📖 Respuesta detallada
La historia importa para explicar el porqué: en Node ≤ 14 los unhandled rejections solo imprimían un warning, y los servicios seguían corriendo con estado potencialmente corrupto (transacciones a medias, locks sin liberar, contadores desincronizados). Node 15+ los promueve a fatales, alineándolos con las excepciones síncronas no capturadas: si nadie pudo manejar el error, nadie sabe qué invariantes quedaron rotas, y lo más seguro es morir y dejar que el supervisor (Kubernetes, systemd) reinicie desde un estado limpio — *crash-only software*.

Fuentes típicas en un servicio real:

```typescript
// ❌ 1) Fire-and-forget sin catch: si falla, crash del proceso
notificacionesService.enviarEmail(pedido);   // devuelve Promise ignorada

// ✅ fire-and-forget consciente: el error se maneja, no se ignora
notificacionesService.enviarEmail(pedido)
  .catch((err) => logger.error({ err, pedidoId: pedido.id }, 'fallo email no crítico'));

// ❌ 2) async callback en API basada en callbacks/eventos
setInterval(async () => { await sincronizarStock(); }, 60_000);
// si sincronizarStock rechaza, nadie captura: unhandled rejection

// ❌ 3) Promise.all con fallos múltiples: rechaza con el primero,
// pero los demás rechazos también deben tener handler adjunto en ese tick
// (Promise.allSettled cuando quieres todos los resultados sin cortocircuito)
```

Los **EventEmitter** merecen mención aparte. Regla uno: un evento `'error'` emitido sin listener lanza y tumba el proceso — todo stream/socket/consumer necesita su handler de `'error'`. Regla dos: los listeners `async` que rechazan no son capturados por el emitter... salvo con `captureRejections`:

```typescript
import { EventEmitter } from 'node:events';

const bus = new EventEmitter({ captureRejections: true });

bus.on('pedido.creado', async (pedido: Pedido) => {
  await proyectarEnElasticsearch(pedido);   // si rechaza…
});

bus[Symbol.for('nodejs.rejection')] = (err: Error) => {
  // …llega aquí (o al listener de 'error') en lugar de ser unhandled rejection
  logger.error({ err }, 'listener async falló');
};
```

Sobre el handler global: `process.on('unhandledRejection')` **desactiva el crash automático**, y ahí está la trampa. Usarlo para "que no se caiga producción" convierte bugs ruidosos en corrupción silenciosa: la petición que causó el error jamás responde (timeout para el cliente), los recursos asociados no se liberan y los errores se acumulan invisibles. El uso legítimo es observabilidad + salida ordenada:

```typescript
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection: iniciando shutdown');
  void gracefulShutdown().finally(() => process.exit(1));  // flush de logs/spans y morir
});
```

Lo mismo aplica a `uncaughtException` (con aún más motivo: el estado tras una excepción síncrona arbitraria es indeterminado). La defensa real no es el handler global sino la estructura: manejar errores en la frontera de cada unidad de trabajo (request handler con exception filter, mensaje de Kafka con try/catch + DLQ, job de BullMQ con su mecanismo de reintentos), y linting con `@typescript-eslint/no-floating-promises`, que convierte el 90 % de estos bugs en errores de compilación de CI.

**Errores comunes**: el catch global "para estabilizar producción"; `.catch(() => {})` vacíos; olvidar el handler de `'error'` en streams creados manualmente; y no distinguir errores operacionales (red, timeouts — se reintentan/degradan) de errores de programador (undefined is not a function — se crashea y corrige).

**Qué espera oír el entrevistador**: el comportamiento por defecto de Node moderno y su justificación (estado indeterminado → crash-only + supervisor), los orígenes concretos de rejections huérfanas, `captureRejections` y el evento `'error'` en emitters, el uso correcto del handler global (log + shutdown, jamás tragar), la distinción operational vs programmer errors y `no-floating-promises` como prevención.

## 13. Observabilidad con OpenTelemetry en Node: trazas distribuidas, propagación de contexto y correlación
**Categoría:** Observabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
OpenTelemetry es el estándar vendor-neutral para las tres señales: trazas, métricas y logs. En Node, el SDK con auto-instrumentaciones parchea http, Express/Nest, pg, ioredis o kafkajs y genera spans sin tocar código de negocio; el contexto (traceId/spanId) se propaga entre servicios con el header W3C `traceparent` (y por headers de mensaje en Kafka), apoyándose en `AsyncLocalStorage` para sobrevivir al salto entre callbacks. La clave operativa: inicializar el SDK **antes** de cualquier import instrumentado, exportar por OTLP a un Collector, muestrear en base al head/tail sampling, y correlacionar logs inyectando `trace_id` en cada línea.

### 📖 Respuesta detallada
En microservicios, un "pago lento" puede ser culpa del gateway, de `pedidos`, de `pagos` o de la pasarela externa; sin trazas distribuidas solo hay logs desconectados. OTel resuelve tres problemas: instrumentar (SDK + auto-instrumentations), propagar contexto y exportar a cualquier backend (Jaeger, Tempo, Datadog) vía OTLP.

```typescript
// tracing.ts — DEBE cargarse antes que el resto (node --import ./tracing.js, o primer import del main)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export const otelSdk = new NodeSDK({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: 'pagos-service' }),
  traceExporter: new OTLPTraceExporter({ url: 'http://otel-collector:4317' }),
  metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },  // demasiado ruido
  })],
});
otelSdk.start();
```

El error de setup número uno: importar `express`/`pg` antes de arrancar el SDK — el monkey-patching llega tarde y los spans no aparecen. Por eso se usa `--import`/`--require` o un archivo de bootstrap separado.

**Propagación**: dentro del proceso, OTel usa `AsyncLocalStorage` para que el span activo "viaje" a través de awaits y callbacks. Entre procesos, el propagador W3C Trace Context inyecta `traceparent: 00-{traceId}-{spanId}-{flags}` en las peticiones HTTP salientes y lo extrae en las entrantes, encadenando padre-hijo. Para mensajería no hay header HTTP: la instrumentación de kafkajs inyecta el contexto en los **headers del mensaje**, de modo que el span del consumidor enlaza con el del productor — imprescindible para depurar sagas. Cuando algo no está auto-instrumentado, spans manuales:

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pagos');

export async function autorizarConPasarela(pago: Pago): Promise<Autorizacion> {
  return tracer.startActiveSpan('pasarela.autorizar', async (span) => {
    span.setAttribute('pago.moneda', pago.moneda);       // atributos de baja cardinalidad
    try {
      return await pasarela.autorizar(pago);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally { span.end(); }
  });
}
```

**Métricas**: histogramas de latencia HTTP, contadores de negocio (`pagos_rechazados_total`), y las de runtime (event loop delay/utilization, heap). Regla de oro: cardinalidad acotada — jamás `pedidoId` como label. **Correlación de logs**: el appender de pino/winston para OTel (o un mixin que lea `trace.getActiveSpan()`) añade `trace_id`/`span_id` a cada línea; en el backend, del log saltas a la traza completa y viceversa. Es la pieza que convierte "tres señales" en una experiencia de debugging real.

**Trade-offs**: instrumentar todo al 100 % es caro (CPU del proceso, red, almacenamiento del backend); se usa head sampling (`ParentBasedSampler` + ratio) o, mejor, tail sampling en el Collector (guardar el 100 % de trazas con error o lentas, y una fracción del resto). El Collector como intermediario desacopla el servicio del vendor y centraliza sampling/enriquecido/reintentos.

**Errores comunes**: SDK inicializado tarde; romper la cadena de contexto con colas propias sin propagar headers; labels de alta cardinalidad; olvidar `otelSdk.shutdown()` en el graceful shutdown y perder los últimos spans; y confundir "tengo Grafana" con observabilidad sin correlación entre señales.

**Qué espera oír el entrevistador**: el orden de inicialización, cómo funciona la propagación (W3C `traceparent`, `AsyncLocalStorage`, headers en Kafka), spans manuales con estado de error, sampling head vs tail y su motivación económica, el rol del Collector y la correlación logs↔trazas con `trace_id`.

## 14. Estrategia de testing en microservicios: unit, integración con Testcontainers y contract testing
**Categoría:** Testing · **Tipo:** Conceptual

### 📝 Respuesta resumen
Pirámide adaptada a microservicios: unit tests rápidos (vitest/jest con mocking de módulos y fake timers) para lógica de dominio; tests de integración por servicio contra dependencias reales efímeras (Testcontainers levanta Postgres/Kafka/Redis en Docker por suite) en lugar de mocks de infraestructura; y **contract testing** (Pact) para las fronteras entre servicios, porque los E2E multi-servicio no escalan entre equipos: entornos compartidos frágiles, ejecución lenta, fallos no atribuibles y acoplamiento de calendarios de deploy. El contrato consumer-driven verifica en CI de cada lado que consumidor y proveedor siguen siendo compatibles sin levantar los dos sistemas juntos.

### 📖 Respuesta detallada
**Unit tests**: con vitest, `vi.mock` reemplaza módulos completos y `vi.useFakeTimers()` controla el reloj — esencial para lógica de reintentos/backoff sin esperar de verdad:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReintentadorPagos } from './reintentador-pagos';

vi.mock('./pasarela-client');   // hoisted: reemplaza el módulo entero

describe('ReintentadorPagos', () => {
  beforeEach(() => vi.useFakeTimers());

  it('reintenta con backoff exponencial hasta 3 veces', async () => {
    const pasarela = { autorizar: vi.fn().mockRejectedValueOnce(new Error('503')).mockRejectedValueOnce(new Error('503')).mockResolvedValue({ ok: true }) };
    const sut = new ReintentadorPagos(pasarela, { baseMs: 1000 });

    const promesa = sut.autorizarConReintentos(pago);
    await vi.advanceTimersByTimeAsync(1000 + 2000);   // avanza los dos backoffs virtualmente

    await expect(promesa).resolves.toEqual({ ok: true });
    expect(pasarela.autorizar).toHaveBeenCalledTimes(3);
  });
});
```

Matices que delatan experiencia: `vi.mock` se *hoistea* al inicio del archivo (no es un reemplazo en línea); con fake timers hay que usar `advanceTimersByTimeAsync` (no la variante síncrona) cuando los timers encadenan promesas; y mockear el repositorio está bien para lógica de dominio, pero mockear el SQL es autoengaño — la mayoría de bugs de persistencia viven en la query real.

**Integración con Testcontainers**: dependencias reales, efímeras y por suite:

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { beforeAll, afterAll, it, expect } from 'vitest';

let pg: StartedPostgreSqlContainer;

beforeAll(async () => {
  pg = await new PostgreSqlContainer('postgres:16-alpine').start();
  await ejecutarMigraciones(pg.getConnectionUri());     // el mismo esquema que producción
}, 60_000);

afterAll(async () => { await pg.stop(); });

it('outbox: evento y pedido commitean atómicamente', async () => {
  const ds = crearDataSource(pg.getConnectionUri());
  await new PedidosService(ds).crearPedido(dtoValido());
  const eventos = await ds.query('SELECT * FROM outbox WHERE published_at IS NULL');
  expect(eventos).toHaveLength(1);
});
```

Esto prueba lo que los mocks no pueden: constraints, transacciones, locks, serialización de tipos. Coste: arranque de contenedores (mitigable con reuse y suites agrupadas) y necesidad de Docker en CI.

**Contract testing**: el hueco restante es "¿mi consumidor sigue entendiendo a su proveedor?". Los E2E que levantan pedidos+pagos+notificaciones responden eso, pero no escalan entre equipos: cada test atraviesa N servicios (un fallo puede ser de cualquiera → debugging lento y flakiness), exigen un entorno integrado siempre verde, y acoplan los deploys ("no despliegues hasta que pase la suite común"). Con **Pact**, el consumidor escribe sus expectativas (peticiones que hace, respuestas mínimas que necesita) contra un mock que las graba como contrato; el contrato se publica en el Pact Broker; el CI del proveedor reproduce esas peticiones contra su servicio real y verifica las respuestas. `can-i-deploy` responde mecánicamente si una versión es compatible con lo desplegado. Ventajas estructurales: cada test corre aislado en el CI de un solo equipo, el proveedor sabe exactamente *qué campos usa cada consumidor* (puede eliminar lo demás sin miedo) y los breaking changes se detectan antes del deploy, no en staging. Límite honesto: Pact verifica compatibilidad de contrato, no comportamiento de negocio end-to-end; un flujo crítico (checkout completo) aún merece unos pocos smoke E2E.

**Errores comunes**: pirámide invertida (todo E2E); mocks de infraestructura que "pasan" con SQL inválido; fake timers con timers reales mezclados (leaks entre tests); contratos Pact sobreespecificados (matchers exactos donde bastan matchers de tipo, generando falsos rojos).

**Qué espera oír el entrevistador**: mocking y fake timers con sus trampas (`hoisting`, variantes async), Testcontainers como estándar para integración realista, el argumento estructurado de por qué E2E no escala entre equipos, el flujo consumer-driven de Pact (broker, verificación del proveedor, `can-i-deploy`) y el matiz de que contract testing no sustituye a todos los E2E, los reduce a smoke tests.

## 15. [CASO] La latencia p99 de tu API se dispara con ciertos payloads: ¿cómo detectas y evitas el bloqueo del event loop?
**Categoría:** Performance · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Con un solo hilo de JS, cualquier operación síncrona larga (parsear un JSON de 50 MB, `pbkdf2Sync`, una regex catastrófica, un `sort` de millones de elementos) congela a *todas* las peticiones concurrentes: el p50 parece sano y el p99 explota. Se mide con `monitorEventLoopDelay` y `eventLoopUtilization` (ambos de `perf_hooks`) exportados como métricas, y se localiza el culpable con CPU profiling (`--cpu-prof`, clinic flame, 0x). Las soluciones por caso: mover CPU a worker threads, usar variantes async de crypto/zlib, streaming para JSON grande, limitar tamaños de entrada y sanear regexes (o usar RE2).

### 📖 Respuesta detallada
El síntoma clásico: métricas de infra normales (CPU media 40 %, memoria estable), pero el p99 pasa de 80 ms a 4 s en ráfagas. La pista es que la degradación afecta a endpoints *no relacionados* simultáneamente: es la firma del event loop bloqueado, porque todas las peticiones comparten el hilo. Sospechosos habituales en un backend de pedidos:

- **`JSON.parse`/`JSON.stringify` de payloads grandes**: son síncronos y O(n); un import de catálogo de 80 MB bloquea cientos de ms. Además `express.json()` los parsea antes de que tu handler pueda opinar.
- **Crypto síncrono**: `crypto.pbkdf2Sync`/`scryptSync` en el login (decenas/cientos de ms por diseño — es su función), `randomBytesSync` en bucle.
- **Regex catastróficas (ReDoS)**: backtracking exponencial con patrones tipo `(a+)+$` sobre input hostil — un atacante congela el servicio con una sola petición.
- **Trabajo accidental**: `Array.prototype.sort` de millones de filas, clones profundos con `JSON.parse(JSON.stringify(x))`, serializar entidades enormes en logs.

**Medición continua** (no solo debugging puntual):

```typescript
import { monitorEventLoopDelay, performance, type EventLoopUtilization } from 'node:perf_hooks';

const histograma = monitorEventLoopDelay({ resolution: 20 });
histograma.enable();
let eluPrevio: EventLoopUtilization = performance.eventLoopUtilization();

setInterval(() => {
  const eluActual = performance.eventLoopUtilization();
  const delta = performance.eventLoopUtilization(eluActual, eluPrevio);
  eluPrevio = eluActual;
  metrics.gauge('event_loop_delay_p99_ms', histograma.percentile(99) / 1e6);
  metrics.gauge('event_loop_utilization', delta.utilization);   // 0..1
  histograma.reset();
}, 10_000).unref();
```

Interpretación senior: **delay** alto = hay tareas que tardan en ceder el hilo (bloqueos puntuales); **utilization** cercana a 1 = el hilo pasa el tiempo ejecutando JS, no esperando I/O (saturación de CPU sostenida). Delay alto con ELU baja apunta a bloqueos esporádicos grandes (el payload maldito); ELU alta sostenida apunta a que el servicio necesita más réplicas o workers. Para atribuir: capturar un CPU profile en producción bajo el síntoma (`node --cpu-prof`, o el inspector on-demand) y leer el flame graph — la función culpable domina el ancho.

**Remedios por causa**:

```typescript
import { pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';

// ✅ crypto async: usa el thread pool de libuv, el event loop sigue libre
const pbkdf2Async = promisify(pbkdf2);
const hash = await pbkdf2Async(password, salt, 310_000, 32, 'sha256');
```

Para JSON grande: límites de body (`express.json({ limit: '1mb' })`) como primera línea, y streaming o workers para los casos legítimamente grandes (siguiente pregunta). Para regex: nunca interpolar input en patrones, testear con herramientas anti-ReDoS (eslint-plugin-regexp, `safe-regex2`) o usar RE2 (sin backtracking) para patrones sobre input externo. Para CPU legítima recurrente: worker pool (piscina) dimensionado a cores. Y subir `UV_THREADPOOL_SIZE` si el cuello es el pool de libuv (crypto/zlib/fs compiten por 4 hilos por defecto).

**Errores comunes**: escalar horizontalmente para "resolver" un bloqueo (cada réplica sigue congelándose; mejora poco y cuesta mucho); medir solo latencia HTTP sin métricas de event loop (no distingues DB lenta de loop bloqueado); usar `setTimeout` para "trocear" crypto (no lo hace async); y confiar en que "TypeScript es rápido" sin presupuesto de milisegundos por handler.

**Qué espera oír el entrevistador**: el razonamiento p99-vs-p50 y por qué el bloqueo contamina endpoints ajenos, el catálogo de bloqueadores (JSON, crypto sync, ReDoS), delay vs utilization y cómo se interpretan juntos, CPU profiling como herramienta de atribución, y remedios específicos por causa en lugar de un genérico "usar workers para todo".

## 16. Manejo de JSON grande en Node: streaming parsers, NDJSON y alternativas binarias
**Categoría:** Performance / Datos · **Tipo:** Conceptual

### 📝 Respuesta resumen
`JSON.parse` exige el documento completo en memoria y bloquea el event loop de forma proporcional al tamaño: inviable para archivos/respuestas de cientos de MB. Las estrategias, por orden de preferencia: (1) rediseñar el formato a **NDJSON** (un objeto JSON por línea), que se procesa en streaming trivialmente y permite paralelizar y reanudar; (2) **streaming parsers** (stream-json) cuando el JSON gigante viene impuesto de fuera; (3) parsear en un **worker thread** si el documento debe materializarse entero; (4) **límites de body** estrictos en las APIs para que nadie te mande 100 MB por accidente o ataque; (5) considerar formatos **binarios** (Protobuf, Avro, MessagePack) para tráfico interno de alto volumen.

### 📖 Respuesta detallada
El doble problema de `JSON.parse(bigString)`: memoria (el string + el árbol de objetos resultante pueden multiplicar por varias veces el tamaño del archivo, contra el memory limit del pod) y CPU síncrona (bloqueo del event loop — ver pregunta anterior). Un endpoint que acepta "el catálogo completo" en un body JSON es una bomba de relojería operacional y un vector de DoS.

**NDJSON primero**: si controlas el formato (exports, ingestas batch, comunicación entre tus servicios), newline-delimited JSON convierte el problema en trivial:

```typescript
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import split2 from 'split2';

// Ingesta de un export de 2 GB de pedidos con memoria constante
await pipeline(
  createReadStream('/data/pedidos-export.ndjson'),
  split2(JSON.parse),                    // parsea línea a línea, objetos pequeños
  async function* (pedidos: AsyncIterable<Pedido>) {
    let lote: Pedido[] = [];
    for await (const pedido of pedidos) {
      lote.push(pedido);
      if (lote.length === 1000) { await repo.upsertLote(lote); lote = []; }
    }
    if (lote.length) await repo.upsertLote(lote);
  },
);
```

Cada `JSON.parse` individual es de KBs (rápido, no bloquea de forma apreciable), el backpressure del pipeline regula la memoria, y un fallo en la línea 1.400.000 no invalida lo anterior — se puede loguear la línea mala y continuar, o reanudar por offset. Por eso NDJSON es el formato de facto de logs, exports y bulk APIs (Elasticsearch `_bulk`).

**Streaming parser cuando el JSON viene impuesto**: para un proveedor que responde `{"metadata": {...}, "items": [ ...500k objetos... ]}`, `stream-json` emite los elementos del array sin materializar el documento:

```typescript
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { pipeline } from 'node:stream/promises';

const res = await fetch('https://proveedor.example.com/catalogo');  // body es un ReadableStream
await pipeline(
  res.body as unknown as NodeJS.ReadableStream,
  parser(),
  new (require('stream-json/filters/Pick'))({ filter: 'items' }),
  streamArray(),                                    // emite { key, value } por elemento
  async function* (chunks: AsyncIterable<{ value: ProductoExterno }>) {
    for await (const { value } of chunks) await procesarProducto(value);
  },
);
```

Trade-off: el parseo streaming en JS es más lento por byte que `JSON.parse` nativo (que está muy optimizado en C++); ganas memoria acotada y no bloquear, pierdes throughput bruto. Si de verdad necesitas el objeto entero (no puedes procesarlo incrementalmente), la opción correcta es parsear en un **worker thread** y devolver el resultado — o mejor, cuestionar el requisito.

**Defensa en las APIs**: `express.json({ limit: '1mb' })` / `bodyLimit` en Fastify, y HTTP 413 con mensaje claro; los payloads legítimamente grandes van por otra puerta (upload a S3 + evento con la referencia, o NDJSON en streaming con `Transfer-Encoding: chunked`). Es tanto una decisión de performance como de seguridad.

**Alternativas binarias** para tráfico interno de alto volumen: Protobuf (con gRPC, schema y codegen ya resueltos), Avro (estándar en Kafka con Schema Registry, evolución de esquemas versionada), MessagePack (drop-in sin esquema). Reducen tamaño (números y estructuras compactas, sin nombres de campo repetidos) y CPU de serialización, a cambio de perder legibilidad y debuggability con herramientas genéricas. La frontera práctica: JSON/NDJSON hacia fuera y para volúmenes moderados; binario con schema para el firehose interno (eventos de Kafka de alto volumen, gRPC entre servicios calientes).

**Errores comunes**: aceptar bodies sin límite; "optimizar" partiendo el string y parseando por trozos a mano (JSON no es divisible arbitrariamente); usar streaming parsers para payloads de 100 KB (complejidad sin beneficio); y elegir binario "por performance" sin medir, pagando el coste de tooling donde JSON era suficiente.

**Qué espera oír el entrevistador**: el doble coste (memoria + bloqueo síncrono), NDJSON como rediseño preferente con sus propiedades operacionales (reanudación, paralelismo, backpressure), stream-json para formatos impuestos con su trade-off de CPU, límites de body como control de seguridad, y un criterio medido para saltar a Protobuf/Avro/MessagePack en tráfico interno.
