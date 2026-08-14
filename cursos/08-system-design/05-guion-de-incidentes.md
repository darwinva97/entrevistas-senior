# Módulo 5 · Guion de incidentes

> **Curso 08 · System design** · 120 min · Cierra el curso 08

## Por qué esto importa en la entrevista

Más de un tercio del banco son preguntas **[CASO]**, y muchas son incidentes: *"el checkout falla cada día a las 12:00"*, *"la latencia se degrada tras cada deploy"*. Aquí no se evalúa conocimiento, se evalúa **método**. La buena noticia: el método es uno solo y se puede memorizar.

## El guion (el mismo del curso 00, ahora como herramienta de entrevista)

```
1. ACOTA        ¿desde cuándo? ¿qué % del tráfico? ¿qué endpoints, clientes, regiones?
2. ¿QUÉ CAMBIÓ? deploys, flags, config, datos, tráfico, proveedores, certificados, cuotas
3. DELIMITA     ¿todos los pods o unos pocos? ¿una AZ? ¿solo escrituras? ¿un tenant?
4. SIGUE EL TIEMPO   traza una petición lenta: red, cola, CPU, I/O, lock, GC
5. HIPÓTESIS FALSABLES  ordenadas por (probabilidad × facilidad de comprobación)
6. CONTÉN      rollback, flag, réplicas, cortar reintentos, tirar carga
7. RAÍZ + PREVENCIÓN   qué faltó: ¿detección? ¿barrera? ¿límite? ¿test?
```

**Empieza siempre igual, aunque el entrevistador te presione para que adivines:**

> *"Antes de teorizar necesito tres datos: desde cuándo ocurre, qué porcentaje del tráfico afecta y si coincide con algún cambio. Con eso descarto la mitad del espacio de búsqueda."*

Si te dicen "no tienes esa información", responde qué asumirías y sigue: *"asumo que empezó tras el despliegue de las 11:40 porque es el único cambio; si no fuera así, mi siguiente hipótesis sería..."*.

## Firmas: síntoma → causa probable

Esta tabla es el atajo que te da velocidad. Cada síntoma tiene una **firma** característica:

| Síntoma | Firma | Sospechas principales |
|---|---|---|
| Falla a la misma hora exacta | **periodicidad** | cron, batch, job de facturación, backup, renovación de token |
| Empeora tras cada deploy y se recupera | **correlación con rollout** | caché fría, JIT/warmup, pool vacío, migración |
| p99 malo, p50 bien | **cola de la distribución** | GC, contención, pool, un endpoint pesado, throttling |
| CPU baja y todo lento | **espera, no cómputo** | dependencia lenta, pool agotado, lock, I/O |
| Empeora gradualmente durante días | **acumulación** | memory leak, disco, tabla que creció sin índice, fds |
| Empezó "sin cambios" | **umbral cruzado** | límite/cuota alcanzada, tabla que superó la RAM, certificado, disco |
| Solo algunos usuarios | **segmentación** | un tenant grande, datos concretos, una AZ, una versión de cliente |
| Errores al 100% de golpe | **cambio binario** | config, credencial rotada, DNS, despliegue, dependencia caída |
| Todo se cae a la vez sin causa clara | **cascada / metaestable** | retries, pools compartidos, health checks, thundering herd |

**💬 Cómo lo dices:** *"La periodicidad exacta es la firma de un trabajo programado, no de la carga de usuarios; el tráfico real no es puntual a las 12:00:00. Así que buscaría un cron, un job de batch o una tarea de infraestructura."*

## Los cuatro casos que caen más y su resolución en tres frases

**1. Cobros duplicados.** Timeout → reintento sobre operación no idempotente. Contención: parar reintentos y conciliar con la pasarela. Fix: `Idempotency-Key` desde el cliente, restricción única en BD, y conciliación diaria.

**2. Retry storm / cascada.** Un servicio se ralentiza; los reintentos multiplican la carga y el sistema no vuelve solo. Contención: cortar reintentos, load shedding, drenar colas. Fix: retry budget, jitter, breaker por lentitud, bulkheads.

**3. Caché caída.** El hit rate del 98% invertido multiplica por 50 la carga en la BD. Contención: limitar concurrencia hacia la BD y degradar funcionalidad. Fix: single-flight, TTL con jitter, stale-while-revalidate, warmup antes de admitir tráfico.

**4. Mensajes perdidos o duplicados.** Bisección: ¿los produjo el productor? ¿los tiene el broker? ¿los procesó el consumidor? Causas típicas: dual write, auto-commit, DLQ ignorada. Fix: outbox, commit tras procesar, dedupe, alerta sobre DLQ.

Ten estas cuatro respuestas afiladas: aparecen en casi todas las entrevistas de backend senior, en una forma u otra.

## Cómo narrar un incidente propio (te lo van a pedir)

Plantilla de 90 segundos, cronometrada:

> **Contexto** (una frase: qué servicio, qué escala, qué impacto de negocio) →
> **Síntoma con números** →
> **Qué medí primero y qué descartó** →
> **Hipótesis confirmada y cómo** →
> **Contención inmediata** →
> **Causa raíz** →
> **Fix estructural** →
> **Qué añadí para que no vuelva** (alerta, límite, test, barrera).

Errores al narrar: empezar por la causa (spoiler que elimina toda la tensión y toda la evidencia de método), no dar números, atribuirte todo el mérito (di "el equipo" cuando corresponda, pero deja claro qué hiciste tú), y no cerrar con la prevención.

Prepara **tres** historias distintas: una de rendimiento, una de corrección/datos y una de disponibilidad. Si no las tienes, créalas con los laboratorios de estos cursos — y sé honesto sobre su origen si te preguntan: *"lo reproduje en un entorno de pruebas para entenderlo a fondo"* es una respuesta que suma, no que resta.

## Postmortem sin culpa (por si te lo piden por escrito)

Impacto con números → cronología (incluye **cuánto tardaste en enterarte**) → causa raíz técnica **y** organizativa → qué funcionó bien → acciones con dueño y fecha. Nunca "el desarrollador se equivocó": la pregunta correcta es *qué barrera del sistema faltaba*.

## Errores comunes que delatan a un no-senior

- Saltar a la causa sin acotar.
- Cambiar dos cosas a la vez.
- Reiniciar y perder la evidencia.
- Confundir correlación con causalidad (el tráfico subió *porque* los clientes reintentaban).
- No separar contención de resolución.
- Terminar sin prevención.

## 🧪 Laboratorio

1. **Los 10 incidentes del banco**, cronometrados: lee solo el enunciado de [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md), responde en voz alta 10 minutos, contrasta con la respuesta detallada y anota qué paso del guion te saltaste.
2. **Juego de fallos a ciegas** (del [curso 00 módulo 6](../00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)): que alguien active un fallo y tú lo diagnostiques con el guion.
3. **Escribe tus tres historias** con la plantilla de 90 segundos y grábate contándolas. Cronometra: si pasas de dos minutos, sobra contexto.
4. **Postmortem completo** de una de ellas, listo para enseñar.

## ✅ Autoevaluación

1. Recita los 7 pasos del guion.
2. ¿Qué preguntas haces siempre al empezar un caso?
3. Firma de: falla a la misma hora / empeora tras deploy / p99 malo con p50 bien / empezó sin cambios.
4. Explica en tres frases el caso de los cobros duplicados.
5. ¿Por qué contener va antes que entender?
6. Cuenta una historia tuya en 90 segundos. Cronométrala.

## 🎯 Preguntas del banco que ya puedes responder

- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — los 10 incidentes
- Todos los **[CASO]** de los cursos de lenguaje, cloud y seguridad

---

**Anterior:** [Módulo 4](04-almacenamiento-y-datos.md) · **Fin del curso 08.** Continúa con [09 Técnica de entrevista](../09-tecnica-de-entrevista/).
