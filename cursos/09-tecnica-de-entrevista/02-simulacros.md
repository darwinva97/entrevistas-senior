# Módulo 2 · Simulacros cronometrados

> **Curso 09 · Técnica de entrevista** · 180 min · Se hace, no se lee

## Cómo usar este módulo

Cada simulacro está escrito **como lo diría un entrevistador**. Necesitas: un cronómetro, una grabadora (el móvil basta) y, si puedes, otra persona que haga de entrevistador leyendo el guion y las repreguntas.

Después de cada simulacro, puntúate con la rúbrica del final. **Sé duro**: es el único momento en que un suspenso no cuesta dinero.

---

## Simulacro 1 · Cribado técnico (30 min)

*El formato de la primera llamada: preguntas rápidas y variadas para descartar.*

1. Cuéntame en dos minutos tu experiencia y por qué encajas con este puesto.
2. ¿Qué es lo más complejo que has construido? ¿Cuál fue tu papel exacto?
3. Explícame la diferencia entre comunicación síncrona y asíncrona entre servicios, y cómo decides.
4. Tienes un endpoint que tarda 3 segundos. ¿Cómo averiguas por qué?
5. ¿Qué es la idempotencia y dónde la has implementado?
6. ¿Cómo despliegas sin downtime?
7. ¿Cómo pruebas un servicio que depende de una base de datos y de una cola?
8. ¿Qué harías si un compañero rechaza tu PR por motivos que consideras equivocados?

**Criterio de aprobado:** ninguna respuesta pasa de 90 segundos; todas tienen estructura; al menos tres incluyen un número real.

---

## Simulacro 2 · Profundidad técnica del lenguaje (45 min)

*Elige tu lenguaje. El entrevistador va a ir bajando de nivel hasta que dejes de saber; eso es normal y esperado.*

**Java:** GC y elección de colector → qué es happens-before → por qué `@Transactional` no funciona en autoinvocación → cómo diagnosticas un p99 alto con CPU baja → configuras un consumidor Kafka sin perder mensajes.

**Node/TypeScript:** fases del event loop → por qué el proceso vive pero no responde → tipar la frontera de una API → backpressure en streams → graceful shutdown en Kubernetes.

**Go:** GMP y qué pasa en una syscall → tres causas de fuga de goroutines → reglas de `context` → por qué el RSS crece con heap pequeño → servidor HTTP de producción con sus timeouts.

**Repreguntas que va a hacer** (prepáralas): *"¿y cómo lo medirías?"*, *"¿qué pasa si el volumen se multiplica por 10?"*, *"¿lo has hecho en producción o lo has leído?"*.

**Criterio de aprobado:** llegas a dos niveles de profundidad en al menos tres temas y dices un "no lo sé" bien formulado sin desmoronarte.

---

## Simulacro 3 · System design (45 min)

*Elige un caso de [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) sin leer la respuesta. Aplica el [framework del curso 08](../08-system-design/01-framework-de-45-minutos.md).*

Guion del entrevistador (que te lo lea otra persona, o simúlalo):

```
min  0 · "Diseña <sistema>."
min  8 · "Asume 10 veces más tráfico. ¿Qué cambia?"
min 20 · "¿Qué pasa si esta base de datos se cae?"
min 28 · "El producto exige que el usuario vea su cambio inmediatamente. ¿Cómo lo haces?"
min 35 · "¿Cuál es el cuello de botella y cómo lo sabrías?"
min 42 · "Si tuvieras la mitad de presupuesto, ¿qué quitarías?"
```

**Criterio de aprobado:** dedicaste 5 minutos a requisitos, diste al menos cinco números, justificaste cada componente, hablaste de al menos dos modos de fallo y cerraste con simplificación.

---

## Simulacro 4 · Incidente en producción (30 min)

*El entrevistador te da información solo cuando la pides. Es una prueba de método.*

> **Enunciado:** "Son las 10:15. El equipo de soporte reporta que algunos usuarios no pueden completar el pago. No hay alertas disparadas. ¿Qué haces?"

Datos que el entrevistador soltará **solo si preguntas** (esta es la parte importante del ejercicio):

- Empezó hacia las 09:50 · afecta al 8% de los intentos · solo tarjetas de un banco concreto.
- Hubo un despliegue del servicio de pagos a las 09:30 y un cambio de configuración del proveedor a las 09:45.
- El p99 del servicio de pagos subió de 400 ms a 9 s; el p50 no cambió.
- Los logs muestran timeouts hacia el proveedor; el proveedor dice que "todo está bien".
- La tasa de reintentos se triplicó.

**Criterio de aprobado:** acotaste antes de teorizar, preguntaste por cambios, propusiste contención (rollback/flag/cortar reintentos) antes de tener la causa, y terminaste con prevención (alerta segmentada por emisor de tarjeta, timeout y breaker hacia el proveedor).

---

## Simulacro 5 · Comportamiento y arquitectura organizativa (45 min)

*Suele hacerlo el manager o un staff. Formato STAR (ver [módulo 3](03-comportamiento-y-cierre.md)).*

1. Cuéntame un incidente grave en el que estuviste involucrado. ¿Qué hiciste tú?
2. Una decisión técnica tuya que salió mal. ¿Qué aprendiste?
3. Un desacuerdo técnico serio con un compañero o con tu jefe. ¿Cómo terminó?
4. ¿Cómo convenciste a negocio de invertir en algo que no era una feature?
5. ¿Cómo has hecho crecer a alguien del equipo?
6. Un proyecto que heredaste en mal estado: ¿por dónde empezaste?
7. ¿Qué harías en tus primeros 30/60/90 días aquí?

**Criterio de aprobado:** cada historia dura 2–3 minutos, tiene situación-tarea-acción-resultado, incluye un número, y en ninguna hablas mal de nadie.

---

## Rúbrica de autoevaluación

Puntúa de 1 a 5 después de cada simulacro (grábate: la percepción propia en caliente es poco fiable).

| Dimensión | 1 | 3 | 5 |
|---|---|---|---|
| **Estructura** | divago | tengo orden a veces | titular → razón → trade-off, siempre |
| **Concisión** | 3+ min por respuesta | 90 s | 45 s y ofrezco profundizar |
| **Trade-offs** | digo "mejor" | menciono alguno | cada decisión lleva su coste |
| **Números** | ninguno | alguno vago | estimaciones y métricas reales |
| **Método (casos)** | adivino | pregunto algo | acoto, descarto, contengo, prevengo |
| **Honestidad** | invento | dudo | calibro lo que sé y sé decir "no lo sé" |
| **Impacto** | tareas | resultados vagos | resultado + negocio + número |
| **Escucha** | atropello | respondo | recojo las pistas de las repreguntas |

**Menos de 3 en cualquier fila = eso es lo que practicas esta semana.**

## Plan de simulacros para dos semanas

| Día | Qué |
|---|---|
| 1 | Simulacro 1, grabado y puntuado |
| 3 | Simulacro 2 de tu lenguaje |
| 5 | Simulacro 3 (caso 1 del banco) |
| 7 | Simulacro 4 |
| 9 | Simulacro 5, con las historias escritas antes |
| 11 | Repite el 3 con otro caso; compara puntuación |
| 13 | Simulacro completo (2+3 seguidos, 90 min) con otra persona |

Busca a alguien real para al menos dos: la presión social cambia todo, y es justo lo que estás entrenando.

---

**Anterior:** [Módulo 1](01-como-comunicar.md) · **Siguiente:** [Módulo 3 · Comportamiento, cierre y negociación](03-comportamiento-y-cierre.md)
