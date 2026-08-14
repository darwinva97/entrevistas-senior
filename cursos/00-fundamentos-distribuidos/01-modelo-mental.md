# Módulo 1 · Modelo mental de un sistema distribuido

> **Curso 00 · Fundamentos** · 90 min · Sin prerrequisitos

## Por qué esto importa en la entrevista

Hay una frase que separa a un mid de un senior en los primeros cinco minutos de una entrevista de casos:

> *"Llamé al servicio de pagos y me dio timeout, así que devuelvo error al usuario."*

Un senior no puede decir eso sin más, porque sabe que **un timeout no te dice si la operación ocurrió**. El cobro pudo hacerse. Toda la disciplina de sistemas distribuidos nace de esa incertidumbre: en un sistema de un solo proceso, una llamada devuelve o lanza; en un sistema distribuido, existe un tercer resultado —*no sé*— y hay que diseñar para él.

## Modelo mental: la diferencia es el fallo parcial

En un monolito, cuando algo falla, falla todo junto: el proceso muere y no queda estado a medias entre componentes. En un sistema distribuido, **una parte falla mientras el resto sigue funcionando y creyendo cosas distintas sobre el mundo**.

```
Monolito                          Distribuido
────────                          ───────────
llamada → retorna | excepción     llamada → retorna | excepción | ??? (timeout)
estado: uno                       estado: N copias que pueden discrepar
tiempo: un reloj                  tiempo: N relojes que derivan
fallo: total                      fallo: parcial (lo peor de todo)
```

Las tres consecuencias que debes tener siempre en la cabeza:

1. **El resultado desconocido existe.** Ante un timeout hay tres mundos posibles: la petición no llegó, llegó y falló, o llegó y tuvo éxito pero se perdió la respuesta. Solo puedes resolverlo **preguntando** (consulta de estado por id) o **repitiendo de forma segura** (idempotencia).
2. **No hay "ahora" global.** Dos servicios no comparten reloj. `updated_at` de dos máquinas no es comparable con confianza (NTP deriva decenas de ms, y en VMs puede saltar). Por eso se usan números de secuencia, versiones y relojes lógicos, no timestamps, para decidir *qué pasó antes*.
3. **La red es un participante del diseño, no una tubería.** Añade latencia variable, reordena, duplica y particiona.

### Las 8 falacias de la computación distribuida (Peter Deutsch)

Cítalas cuando te pregunten "¿qué es lo primero que revisas al diseñar esto?". Son suposiciones falsas que todos hacemos:

| Falacia | Cómo te muerde en producción |
|---|---|
| La red es fiable | El 0,01% de peticiones fallidas × 10 saltos = 0,1% de operaciones rotas |
| La latencia es cero | Un bucle que llama a otro servicio N veces (N+1 distribuido) |
| El ancho de banda es infinito | Devolver 5 MB de JSON porque "el cliente ya filtrará" |
| La red es segura | Tráfico interno sin mTLS ni autorización servicio-a-servicio |
| La topología no cambia | IPs hardcodeadas, pods que se reprograman, escalados |
| Hay un solo administrador | Cambios de red/IAM de otro equipo que te tiran el servicio |
| El transporte no cuesta | Costos de egress entre AZ/regiones (una sorpresa clásica en la factura) |
| La red es homogénea | Un cliente móvil en 3G peruana no es tu laptop en fibra |

**💬 Cómo lo dices:** *"Diseño asumiendo que cualquier llamada remota puede tardar, fallar o duplicarse, y que no me voy a enterar de cuál de las tres fue. Eso me lleva siempre a tres decisiones: timeout explícito, operación idempotente y una forma de reconciliar."*

## Los cuatro tipos de fallo, ordenados por dificultad

1. **Crash-stop:** el proceso muere. Es el fallo *amable*: el balanceador lo saca y ya está.
2. **Crash-recovery:** el proceso muere y vuelve, quizá con estado viejo en memoria o caché caliente perdida.
3. **Omisión / red particionada:** los mensajes se pierden en una dirección. Dos mitades del sistema se creen ambas "las buenas" (split brain).
4. **Bizantino:** el nodo responde, pero mal (bug, corrupción, reloj desfasado). En sistemas internos casi no se modela; se protege con validación y checksums.

El caso realmente peligroso —el que aparece en los incidentes de este repositorio— es el **fallo gris**: el servicio no está caído, está *lento*. No dispara alertas de disponibilidad, pasa el health check, y satura los pools de todos sus clientes. Ver [módulo 4](04-resiliencia.md) y el caso "una pasarela de pagos lenta arrastra todo el sistema" en [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md).

> **⚠️ Trampa:** "un health check que devuelve 200 significa que el servicio está sano". Un health check que solo comprueba que el proceso responde no detecta el fallo gris; y uno que comprueba todas las dependencias provoca fallos en cascada (si la BD parpadea, Kubernetes reinicia todos tus pods sanos a la vez). La respuesta senior: **liveness superficial, readiness con dependencias críticas y sin efecto dominó, y métricas para lo demás**.

## Sincronía vs asincronía: la decisión que más pesa

| | Síncrono (HTTP/gRPC) | Asíncrono (evento/cola) |
|---|---|---|
| Acoplamiento temporal | Ambos deben estar vivos | El receptor puede estar caído |
| Latencia percibida | Suma de todos los saltos | Respuesta inmediata, trabajo diferido |
| Manejo de fallos | El cliente lo sufre ahora | Reintentos y DLQ, sin usuario esperando |
| Consistencia | Más fácil de razonar | Eventual, requiere idempotencia |
| Depuración | Traza lineal | Necesitas correlación explícita |

**Regla práctica:** síncrono cuando el usuario necesita el resultado para continuar (¿tengo saldo?, ¿existe este usuario?); asíncrono para todo efecto secundario (enviar email, actualizar analítica, notificar a otro dominio). Si tu flujo síncrono tiene más de 2–3 saltos encadenados, la disponibilidad compuesta se hunde: cinco servicios al 99,9% dan 99,5%, es decir, pasas de 43 min a 3,6 h de indisponibilidad al mes.

```
Disponibilidad en serie:  A_total = A₁ × A₂ × ... × Aₙ
0.999⁵ = 0.995  →  cada dependencia síncrona que añades te cuesta un nueve
```

## Estado: dónde vive es la arquitectura

Casi todos los problemas difíciles vienen del estado compartido. Tres reglas que puedes verbalizar:

- **Servicios sin estado, estado en almacenes especializados.** Un servicio sin estado escala horizontalmente y se reinicia sin drama. El estado en memoria (caché local, sesiones, contadores) hace que dos instancias respondan distinto — origen clásico de bugs "solo pasa a veces".
- **Un dueño por dato.** Si dos servicios escriben la misma tabla, no tienes dos servicios: tienes un monolito distribuido con lo peor de ambos mundos.
- **Dual write = bug.** Escribir en la BD y publicar a Kafka en la misma función *no es atómico*: si el proceso muere entre ambas, el mundo queda inconsistente para siempre. Solución: patrón outbox ([módulo 3](03-mensajeria-e-idempotencia.md)).

## Errores comunes que delatan a un no-senior

- "Si falla, reintento" — sin decir cuántas veces, con qué espera, con qué jitter, y si la operación es idempotente.
- "El timeout por defecto está bien" — el default de muchos clientes HTTP es *infinito*; es la causa raíz de la mitad de los agotamientos de pool.
- "Uso timestamps para saber cuál es el más reciente" — relojes de máquinas distintas.
- "Lo hago transaccional entre los dos servicios" — no hay transacción distribuida gratis; hay saga, y hay compensaciones que también fallan.
- Hablar de CAP como si fuera un menú de tres opciones (ver [módulo 2](02-consistencia-y-cap.md)).

## 🧪 Laboratorio — provoca un fallo parcial y sufre el "no sé"

Necesitas Docker y `curl`. Objetivo: ver con tus ojos el resultado desconocido.

1. **Levanta un servicio lento y otro que lo llama.** Un endpoint `POST /cobro` que duerme 5 s y luego escribe en una tabla `cobros`; un cliente con timeout de 2 s.

```bash
# Servicio de pagos: tarda 5s pero SIEMPRE cobra
# (node, go, java, lo que uses; la clave es el sleep antes de responder)
curl -m 2 -X POST localhost:8080/cobro -d '{"pedido":"A1","monto":100}'
# → curl: (28) Operation timed out
```

2. **Consulta la tabla.** El cobro está hecho. Tu cliente cree que falló. **Ese es el bug de los cobros duplicados de toda la industria.**

3. **Arréglalo dos veces:**
   - *Con idempotencia:* añade `Idempotency-Key` (uuid generado por el cliente, único por intención de cobro). El servidor guarda la clave junto al resultado y devuelve el mismo resultado si la vuelve a ver.
   - *Con consulta:* añade `GET /cobro?pedido=A1` y haz que el cliente, ante timeout, pregunte antes de reintentar.

4. **Simula partición de red** (no solo lentitud) para ver la diferencia:

```bash
# Añadir 3s de latencia y 10% de pérdida al contenedor
docker run --rm --cap-add=NET_ADMIN --net container:<id> nicolaka/netshoot \
  tc qdisc add dev eth0 root netem delay 3000ms loss 10%
# quitarlo: tc qdisc del dev eth0 root
```

5. **Anota**: ¿cuántas peticiones acabaron en estado incierto? ¿Cuántos cobros duplicados generó tu reintento ingenuo?

**Entregable:** un endpoint que puedes llamar 100 veces con la misma `Idempotency-Key` y produce exactamente un cobro.

## ✅ Autoevaluación (en voz alta, 60 s cada una)

1. Te da timeout una llamada a un servicio de pagos. ¿Qué sabes exactamente y qué haces?
2. ¿Por qué no debo usar `updated_at` para resolver conflictos entre dos réplicas?
3. Tienes 6 servicios síncronos en cadena, cada uno con 99,95% de disponibilidad. ¿Qué SLA puedes prometer y cómo lo mejoras sin tocar los servicios?
4. Explica la diferencia entre un fallo total y un fallo gris, y por qué el segundo es peor.
5. ¿Por qué escribir en BD y publicar en Kafka en la misma función es un bug aunque tenga try/catch?

## 🎯 Preguntas del banco que ya puedes responder

- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — casos 3 (retry storm), 7 (duplicación de cobros), 9 (pasarela lenta)
- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — caso 1 (pagos idempotente)
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 6 (mensajes duplicados), 10 (cascada)
- [`versionamiento-apis/`](../../versionamiento-apis/) — todo el marco de compatibilidad se apoya en esto

## Para profundizar

- *Designing Data-Intensive Applications*, Martin Kleppmann — capítulos 8 y 9 son exactamente este módulo, con más rigor.
- "Fallacies of Distributed Computing Explained" (Rotem-Gal-Oz).
- AWS Builders' Library: *Timeouts, retries and backoff with jitter*.

---

**Siguiente:** [Módulo 2 · Consistencia, CAP y el mundo real](02-consistencia-y-cap.md)
