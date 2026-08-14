# Módulo 3 · Mensajería, entrega e idempotencia

> **Curso 00 · Fundamentos** · 120 min · Requiere módulos [1](01-modelo-mental.md) y [2](02-consistencia-y-cap.md)

## Por qué esto importa en la entrevista

Si trabajas con microservicios, **la mitad de tus incidentes reales serán de mensajería**: duplicados, mensajes perdidos, orden roto, lag creciente, DLQ llena a las 3 a.m. Y en la entrevista es el terreno donde más rápido se distingue quien ha operado un sistema de quien ha leído sobre uno.

La frase que quieres poder decir con naturalidad: *"asumo entrega at-least-once, así que todos mis consumidores son idempotentes"*.

## Modelo mental: solo existen dos garantías reales

- **At-most-once:** entregas y no reintentas. Puedes perder mensajes. Válido para telemetría de baja importancia.
- **At-least-once:** reintentas hasta confirmar. **Nunca pierdes, pero duplicas.** Es el default sensato de todo broker.
- **Exactly-once:** no existe a nivel de red. Lo que existe es *procesamiento efectivamente-una-vez*, y se consigue de dos formas: (a) at-least-once + **idempotencia** del consumidor, o (b) transacciones dentro de un mismo sistema (Kafka transactions: consumir→procesar→producir + offsets en la misma transacción, válido solo mientras no salgas de Kafka).

> **⚠️ Trampa:** decir "activo `enable.idempotence=true` y ya tengo exactly-once". Ese flag da idempotencia **del productor frente a reintentos de red** (deduplica por `producerId`+secuencia dentro de una sesión). No protege del duplicado que ocurre cuando tu consumidor procesa, muere antes de commitear el offset y otro consumidor reprocesa.

## Idempotencia: la herramienta central

Una operación es idempotente si ejecutarla N veces deja el mismo estado que ejecutarla una vez. HTTP ya lo modela: `GET`, `PUT` y `DELETE` son idempotentes por definición; `POST` no.

**Las cuatro formas de hacerlo, de mejor a peor:**

1. **Naturalmente idempotente:** `SET estado = 'PAGADO'` es idempotente; `saldo = saldo - 100` no lo es. Reformular la operación como *asignación de un estado deseado* resuelve muchos casos sin infraestructura.
2. **Clave de idempotencia + tabla de deduplicación** (el patrón general):

```sql
CREATE TABLE idempotencia (
  clave        TEXT PRIMARY KEY,      -- generada por el CLIENTE, una por intención
  huella       TEXT NOT NULL,         -- hash del payload: detecta reutilización con otro cuerpo
  estado       TEXT NOT NULL,         -- EN_CURSO | COMPLETADO
  respuesta    JSONB,                 -- para devolver exactamente lo mismo
  creado_en    TIMESTAMPTZ DEFAULT now()
);
```

El flujo correcto, todo dentro de **la misma transacción** que el efecto de negocio:

```
BEGIN
  INSERT INTO idempotencia(clave, huella, estado) VALUES (?, ?, 'EN_CURSO')
     -- ON CONFLICT: si existe y está COMPLETADO → devolver respuesta guardada (200)
     --              si existe con otra huella   → 422 (misma clave, cuerpo distinto)
     --              si existe y está EN_CURSO   → 409 "en proceso, reintenta"
  ...efecto de negocio (crear cobro, reservar stock)...
  UPDATE idempotencia SET estado='COMPLETADO', respuesta=? WHERE clave=?
COMMIT
```

3. **Dedupe por id de mensaje en el consumidor:** tabla `mensajes_procesados(id, procesado_en)` con `INSERT` que falla por clave primaria si ya se procesó. Necesita TTL/purga.
4. **Detección por estado de negocio:** "¿ya existe un cobro para el pedido A1 en estado PAGADO?". Funciona, pero es frágil ante concurrencia si no tienes un índice único que lo garantice. **Regla: si tu idempotencia no está respaldada por una restricción única en la BD, no es idempotencia, es una carrera.**

**Dónde vive la clave importa:** debe representar la *intención del usuario*, no el request HTTP. Si el usuario pulsa "Pagar" una vez y el frontend reintenta 3 veces, las 3 llevan la misma clave. Si el usuario pulsa "Pagar" dos veces a propósito (dos pedidos), son claves distintas. Generarla en el servidor no sirve para nada.

## El dual write y el patrón Outbox

El bug estructural más frecuente:

```java
// ❌ Dos sistemas, ninguna atomicidad
pedidoRepo.save(pedido);          // commit en la BD
kafka.send("pedidos", evento);    // si el proceso muere aquí, el evento no existe jamás
```

**Outbox:** escribe el evento en una tabla de la misma BD, dentro de la misma transacción. Un proceso aparte (relay CDC con Debezium, o un poller) lee la tabla y publica al broker, marcando lo publicado.

```
┌──────────── transacción ─────────────┐
│ INSERT INTO pedidos ...              │
│ INSERT INTO outbox(id, tipo, payload)│
└──────────────────────────────────────┘
        │
        ▼  relay (CDC o poll)
    Kafka ──► consumidores idempotentes  (at-least-once garantizado)
```

El relay publica **at-least-once** (puede morir tras publicar y antes de marcar). De ahí la regla de oro: *outbox garantiza que el evento sale; idempotencia garantiza que procesarlo dos veces no duele*. Van siempre juntos.

El simétrico es la **inbox**: el consumidor guarda el id del mensaje procesado en su propia BD, en la misma transacción que su efecto.

## Orden: el requisito que casi nunca necesitas globalmente

En Kafka el orden solo se garantiza **dentro de una partición**. Por tanto: si necesitas orden para una entidad, esa entidad debe ir siempre a la misma partición → **clave de partición = id de la entidad** (`pedido_id`, `cliente_id`).

Consecuencias que debes anticipar:

- **Hot partition:** si eliges una clave mal distribuida (`pais`, o un cliente enorme), una partición concentra el tráfico y un consumidor va ahogado mientras el resto duerme. Mitigaciones: clave más granular, salting (`cliente_id#bucket`) sacrificando orden global del cliente, o proceso dedicado para el tenant caliente.
- **Paralelismo máximo = nº de particiones.** Añadir consumidores por encima de eso no sirve: quedan idle.
- **Reintentos rompen el orden.** Si mandas el mensaje fallido a una cola de reintento, ese mensaje llegará después que los siguientes. Si el orden importa de verdad, debes bloquear la partición o versionar el estado para descartar lo viejo.

**Alternativa: idempotencia + versión monótona.** En vez de exigir orden, incluye `version` en el evento y haz `UPDATE ... WHERE version < :nueva`. Un evento antiguo que llega tarde simplemente no aplica. Esto es mucho más barato que garantizar orden global y es la respuesta que impresiona.

## Consumo, offsets y lag

- **Commit después de procesar, nunca antes.** Auto-commit + procesamiento asíncrono = mensajes perdidos silenciosamente (el offset avanza sin que el trabajo termine).
- **Lag** = último offset producido − último committeado. Es *la* métrica de salud de un consumidor: alertar sobre lag creciente sostenido, no sobre lag > X puntual.
- **Rebalancing:** al entrar/salir un consumidor, el grupo redistribuye particiones y (en el protocolo eager) todos paran. Causas típicas de rebalanceos infinitos: procesar un lote tarda más que `max.poll.interval.ms`, o `session.timeout.ms` mal ajustado con pausas de GC. Solución: lotes más pequeños, procesamiento fuera del hilo del poll con pausa/reanudación, o `CooperativeStickyAssignor`.
- **DLQ (dead letter queue):** después de N reintentos, aparta el mensaje con su causa y contexto. Una DLQ sin alerta ni herramienta de reproceso es un cementerio: define quién la vigila y cómo se reinyecta.

## Sagas: transacciones largas con compensación

```
Coreografía:  pedido→(evento)→pago→(evento)→inventario→(evento)→envío
              simple, sin punto central, pero nadie sabe el estado global

Orquestación: un Orquestador de Pedido llama/escucha a cada paso y guarda
              una máquina de estados persistida: sabe dónde está y qué compensar
```

Elige coreografía con ≤3 pasos y acoplamiento bajo; orquestación cuando hay ramas, timeouts por paso o necesitas responder "¿en qué punto está el pedido 123?". En ambos casos:

- Cada paso debe ser idempotente (se reintentará).
- Cada compensación debe ser idempotente **y** tolerar que el paso original nunca se aplicara.
- Hay estados no compensables (email enviado, dinero movido a un tercero): diséñalos al final del flujo, o usa reserva → confirmación en dos fases de negocio.
- Registra la saga: sin persistir la máquina de estados no puedes reanudar tras un reinicio.

## Errores comunes que delatan a un no-senior

- "Uso exactly-once, lo activa Kafka" (ver trampa arriba).
- Generar la clave de idempotencia en el servidor.
- Idempotencia comprobada con `SELECT ... IF NOT EXISTS` sin restricción única (carrera bajo concurrencia).
- Publicar el evento fuera de la transacción y decir "es que uso try/catch".
- Pedir orden global de mensajes sin justificarlo, y no saber que eso implica una sola partición.
- No tener plan para la DLQ.
- Reintentar indefinidamente un mensaje envenenado (bloquea la partición para siempre).

## 🧪 Laboratorio — construye el trío outbox + dedupe + DLQ

Con Docker Compose (Kafka + Postgres) o RabbitMQ si lo prefieres:

1. **Reproduce el duplicado:** consumidor que procesa un pago, y `kill -9` al proceso justo después de escribir en BD y antes de commitear el offset. Al reiniciar, verás el cobro doble. Anota el saldo resultante.
2. **Arregla con dedupe:** tabla `mensajes_procesados(message_id PK)` insertada en la misma transacción que el pago. Repite el `kill -9`: ahora el reproceso es inofensivo.
3. **Implementa outbox:** transacción que inserta pedido + evento; un poller que publica y marca `publicado_en`. Mata el poller entre publicar y marcar: verifica que el duplicado resultante tampoco duele.
4. **Provoca un rebalanceo:** pon `max.poll.interval.ms=10000` y haz que el procesamiento tarde 15 s. Observa en los logs el ciclo de rebalanceo infinito. Arréglalo.
5. **Hot partition:** produce 100.000 mensajes con `key = "PERU"` para el 90% y observa el lag por partición (`kafka-consumer-groups --describe`). Aplica salting y compara.
6. **DLQ:** manda a `pedidos.DLQ` tras 3 reintentos con cabeceras de causa y stacktrace; escribe el script de reinyección.

**Entregable:** un README propio con las 6 gráficas/salidas y una frase de qué aprendiste en cada paso. Esto es material de anécdota para la entrevista.

## ✅ Autoevaluación

1. ¿Por qué exactly-once no existe y qué es lo que sí puedes conseguir?
2. Diseña la clave de idempotencia para "pagar un pedido" y justifica quién la genera y cuánto vive.
3. ¿Qué es un dual write y por qué el outbox lo resuelve si el relay también puede duplicar?
4. Necesitas orden por cliente pero un cliente genera el 40% del tráfico. ¿Qué haces?
5. El consumer lag crece sin parar pero el consumidor procesa a ritmo normal. Da tres hipótesis.
6. ¿Cuándo orquestación en vez de coreografía? ¿Qué haces si una compensación falla?

## 🎯 Preguntas del banco que ya puedes responder

- [`java-microservicios/02-spring-y-microservicios.md`](../../java-microservicios/02-spring-y-microservicios.md) — 5, 6, 7, 8 (Kafka, exactly-once, saga, outbox)
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 5 (lag), 6 (duplicados), 14 (pérdida), 15 (hot partition)
- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — 4 (saga rota), 7 (cobros duplicados), 10 (pérdida de mensajes)
- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — 1 (pagos), 3 (notificaciones)
- [`versionamiento-apis/02-versionamiento-de-servicios-y-datos.md`](../../versionamiento-apis/02-versionamiento-de-servicios-y-datos.md) — evolución de esquemas de eventos

## Para profundizar

- Chris Richardson, *Microservices Patterns* — capítulos de saga y outbox.
- Documentación de Debezium (CDC como relay de outbox).
- "Delivering billions of messages exactly once" (Segment) — buen ejemplo de dedupe a escala.

---

**Anterior:** [Módulo 2](02-consistencia-y-cap.md) · **Siguiente:** [Módulo 4 · Resiliencia](04-resiliencia.md)
