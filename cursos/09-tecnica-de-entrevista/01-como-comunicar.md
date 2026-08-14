# Módulo 1 · Cómo comunicar como senior

> **Curso 09 · Técnica de entrevista** · 120 min

## Por qué esto importa

Porque el entrevistador no puede leerte la mente: **solo evalúa lo que sale por tu boca**. Dos candidatos con el mismo conocimiento reciben notas muy distintas según cómo lo organicen. Y a diferencia del conocimiento técnico, esto se mejora en una semana.

## La estructura de una respuesta técnica

```
1. TITULAR        una frase con la respuesta directa
2. RAZÓN          por qué, en 2–3 frases (el mecanismo, no el eslogan)
3. TRADE-OFF      qué cuesta / cuándo NO
4. GANCHO         "puedo entrar en detalle en X si quieres"
```

**Ejemplo — "¿Cuándo usarías Kafka en vez de RabbitMQ?"**

> *(titular)* "Kafka cuando necesito un log persistente que varios consumidores puedan leer de forma independiente y reprocesar; RabbitMQ cuando necesito reparto de trabajo con enrutamiento fino.
> *(razón)* La diferencia estructural es que Kafka retiene los mensajes y cada consumidor lleva su offset, así que puedo añadir un consumidor nuevo y leer el historial; en una cola, el mensaje consumido desaparece.
> *(trade-off)* A cambio, Kafka es más pesado de operar, el orden solo existe dentro de la partición y el paralelismo está limitado por el número de particiones.
> *(gancho)* Si quieres, entro en cómo elegiría la clave de partición para evitar hot spots."

Compáralo con la respuesta habitual: *"Kafka es para grandes volúmenes y RabbitMQ para colas"*. Misma idea, diez veces menos señal.

## Piensa en voz alta (pero con estructura)

El silencio de más de 10 segundos es información negativa: el entrevistador no sabe si estás razonando o bloqueado. Frases que compran tiempo **y** suman puntos:

- *"Déjame estructurarlo: hay tres formas de resolver esto..."*
- *"Antes de responder, quiero aclarar un supuesto: ¿estamos hablando de tráfico interno o público?"*
- *"Mi primera intuición es X, pero déjame comprobar el caso borde de Y."*
- *"Voy a descartar primero lo más barato de comprobar."*

Lo que **no** debes hacer: rellenar con muletillas, empezar a hablar sin saber a dónde vas, o responder a una pregunta distinta de la que te hicieron porque esa te la sabes.

## Cómo decir "no lo sé" (y ganar puntos)

Nunca inventes: un entrevistador senior lo detecta y a partir de ahí **duda de todo lo demás que has dicho**. La fórmula que funciona:

> *"No he trabajado con eso directamente. Lo que sí sé de la familia de problemas es X, y si me lo encontrara, empezaría por Y y comprobaría Z. ¿Es por ahí?"*

Tres cosas ocurren: reconoces el límite (honestidad), demuestras razonamiento transferible (competencia) y mantienes la conversación viva (colaboración). Marca también los grados: *"esto lo he usado en producción"* / *"lo he probado"* / *"lo he leído pero no lo he tocado"*. Esa calibración es una señal de seniority en sí misma.

## Habla de trade-offs, no de verdades

Prohíbete decir "mejor" sin complemento. Fórmulas útiles:

- *"X es mejor **para** Y **a costa de** Z."*
- *"Con menos de N usuarios elegiría A; por encima, B, porque el cuello pasa a ser C."*
- *"Yo aquí aceptaría consistencia eventual, y se lo explicaría al negocio así: ..."*

Y cuando el entrevistador cuestione tu decisión, **no te pongas a la defensiva**: su repregunta suele ser una pista. *"Buen punto — si el requisito es ese, mi decisión cambia: haría..."*. Cambiar de opinión ante un argumento nuevo es exactamente lo que hace un buen arquitecto.

## Habla de impacto, no de tareas

| En vez de… | Di… |
|---|---|
| "Migré el servicio a Go" | "Migramos el servicio crítico a Go y el p99 bajó de 800 a 120 ms, lo que nos permitió quitar dos instancias y ahorrar ~$400/mes" |
| "Usé Kafka" | "Introduje un log de eventos para desacoplar facturación, con lo que dejamos de perder pedidos cuando el proveedor se caía" |
| "Hice code reviews" | "Establecí un checklist de revisión que redujo los bugs en producción de ~6 a ~2 por sprint" |

Números aunque sean aproximados, y **siempre el porqué de negocio**. Si no tienes métricas, di el efecto observable: "dejamos de tener incidentes semanales por esa causa".

## Adapta el nivel a tu interlocutor

- **Con el ingeniero:** detalle técnico, mecanismos, herramientas.
- **Con el manager:** impacto, riesgo, plazos, cómo trabajas con otros.
- **Con el director/negocio:** dinero, riesgo, cliente. Nada de jerga: "esto evita que el checkout se caiga en Black Friday" en vez de "implementé bulkheads".

Preguntar *"¿te interesa más el detalle técnico o el impacto?"* al inicio de una respuesta larga es una jugada excelente.

## Errores de comunicación que hunden candidaturas

- Responder cuatro minutos a una pregunta de treinta segundos.
- Recitar definiciones de libro sin criterio propio.
- Criticar con desprecio a empleadores o compañeros anteriores (**el descarte más rápido que existe**).
- Decir "siempre" y "nunca" sobre decisiones técnicas.
- Fingir experiencia.
- No hacer ninguna pregunta al final.
- Hablar solo en "yo" cuando el trabajo fue de equipo — o solo en "nosotros" y no dejar claro tu papel.

## 🧪 Laboratorio

1. **Graba 10 respuestas** del banco (📝 resumen) y cronométralas. Objetivo: 45 segundos, con titular-razón-trade-off-gancho. Escúchate: ¿se entiende sin ver el texto?
2. **Ejercicio de trade-offs:** coge 10 preguntas de "¿X o Y?" y responde cada una en una sola frase con la fórmula "X es mejor para... a costa de...".
3. **Practica el "no lo sé":** pide a alguien que te pregunte sobre tecnologías que no conoces y responde con la fórmula. Repite hasta que salga natural.
4. **Reescribe tu CV en impacto:** convierte cada viñeta de tarea en una de resultado con número. Te servirá para el CV *y* para las respuestas.
5. **Explica un tema técnico a alguien no técnico** (pareja, amigo). Si no lo entiende, no lo dominas lo suficiente para explicárselo a un director.

## ✅ Autoevaluación

1. Recita la estructura de cuatro partes de una respuesta.
2. Responde "¿REST o gRPC?" en 45 segundos con esa estructura.
3. Formula un "no lo sé" que sume puntos.
4. Convierte tres viñetas de tu CV a formato impacto.
5. ¿Qué haces cuando el entrevistador cuestiona tu decisión?
6. ¿Cuánto debe durar tu primera respuesta y por qué?

---

**Siguiente:** [Módulo 2 · Simulacros cronometrados](02-simulacros.md)
