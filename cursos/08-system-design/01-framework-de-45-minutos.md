# Módulo 1 · El framework de 45 minutos

> **Curso 08 · System design** · 120 min

## Por qué esto importa en la entrevista

Porque la entrevista de diseño no tiene respuesta correcta, y sin estructura te pierdes. El entrevistador quiere ver **cómo piensas bajo ambigüedad**: si empiezas a dibujar cajas en el minuto 2, has fallado; si sigues aclarando requisitos en el minuto 20, también.

## El reparto del tiempo (memorízalo)

```
 0–5   min · REQUISITOS      qué construimos, para quién, qué NO entra
 5–10  min · ESTIMACIONES    escala, lecturas/escrituras, datos
10–15  min · API Y DATOS     interfaz pública y modelo de datos
15–30  min · DISEÑO          arquitectura de alto nivel, camino feliz
30–40  min · PROFUNDIZAR     el componente que el entrevistador elija (o el más interesante)
40–45  min · CIERRE          cuellos de botella, fallos, qué mejoraría con más tiempo
```

Dilo en voz alta al empezar: *"Voy a dedicar unos cinco minutos a requisitos, luego estimaciones, después el diseño de alto nivel, y dejo quince minutos para profundizar donde te interese. ¿Te parece?"*. **Esa frase sola ya te sitúa como senior**: demuestra que has hecho esto antes y le das el control al entrevistador sobre lo que quiere ver.

## Fase 1 · Requisitos (0–5 min)

Tres bloques, en este orden:

**Funcionales.** ¿Qué debe hacer? Acota agresivamente: *"Voy a centrarme en publicar y leer; búsqueda y moderación quedan fuera salvo que quieras verlas"*. Reducir el alcance no es hacer trampa, es priorizar — y el entrevistador lo valora.

**No funcionales.** Es aquí donde se define la arquitectura:
- Escala: usuarios, rps, crecimiento.
- Latencia objetivo (p99, no promedio).
- Disponibilidad: ¿99,9%? ¿qué pasa si cae 5 minutos?
- **Consistencia:** ¿el usuario puede ver datos con 2 segundos de retraso? *(La pregunta más rentable de toda la entrevista.)*
- Durabilidad: ¿podemos perder un evento?
- Multi-región, residencia de datos, cumplimiento.

**Fuera de alcance.** Dilo explícitamente y escríbelo en la pizarra.

> **⚠️ Trampa:** aceptar el enunciado tal cual. "Diseña Twitter" no es un requisito; "500M de usuarios, timeline en menos de 200 ms, se tolera 1 minuto de retraso en la propagación" sí lo es. Si no preguntas, el entrevistador asume que no sabes que importa.

## Fase 2 · Estimaciones (5–10 min)

Números redondos, supuestos en voz alta ([módulo 2](02-estimaciones-y-numeros.md)):

```
50M DAU × 20 acciones/día = 1.000M/día ÷ 86.400 ≈ 12.000 rps medio
Pico ×5 ≈ 60.000 rps        (digo el factor y por qué)
Ratio lectura:escritura 100:1 → 600 escrituras/s, 60k lecturas/s
   ⇒ el sistema es de lectura: caché y réplicas dominan el diseño
Almacenamiento: 600/s × 86.400 × 1 KB ≈ 52 GB/día ≈ 19 TB/año (×3 réplicas ≈ 57 TB)
   ⇒ no cabe en una instancia: hay que particionar
```

**La estimación no es aritmética, es una herramienta de decisión.** Cada número debe llevar a una conclusión: "es de lectura", "no cabe en un nodo", "necesito CDN". Si calculas y no concluyes nada, has perdido cinco minutos.

## Fase 3 · API y modelo de datos (10–15 min)

Define **3–5 endpoints** (o mensajes) con su firma. Es lo que fija el alcance y evita malentendidos:

```
POST /pedidos            Idempotency-Key: <uuid>   → 201 {pedidoId, estado}
GET  /pedidos?cursor=&limit=                        → 200 {items[], nextCursor}
POST /pedidos/{id}/pagos                            → 202 {operacionId}
```

Y el modelo: entidades, claves, **clave de partición** y los índices que exige el patrón de acceso. Elegir bien la clave de partición aquí evita el 80% de los problemas que aparecerán en la fase de profundización.

## Fase 4 · Diseño de alto nivel (15–30 min)

Dibuja el camino feliz de una escritura y de una lectura, y **narra mientras dibujas**:

```
Cliente → CDN → API Gateway (authN, rate limit) → Servicio → BD primaria
                                                      ├→ Caché (lecturas)
                                                      └→ Outbox → Broker → Workers → ...
```

Reglas de oro:
- **Empieza simple y añade complejidad solo cuando la justifiques.** Un diseño que empieza con 12 componentes y no explica por qué es peor que uno de 5 que crece cuando aparece un requisito.
- **Justifica cada caja:** "pongo una caché porque el ratio es 100:1 y la BD no aguanta 60k lecturas/s".
- **Sigue el dato:** cuenta qué pasa con una petición desde que sale del móvil hasta que se persiste.
- **Habla de fallos mientras diseñas**, no solo al final: "si el broker está caído aquí, la escritura sigue funcionando porque el outbox está en la misma transacción".

## Fase 5 · Profundizar (30–40 min)

El entrevistador elegirá un punto; si no lo hace, elige tú el más interesante y dilo: *"la parte difícil aquí es el fan-out del feed; ¿profundizo ahí?"*.

Los sitios donde suele estar la chicha: la clave de partición y los hot spots; la consistencia de una operación crítica (pago, stock); el fan-out (escritura vs lectura); la caché (invalidación, stampede); las operaciones largas; y el manejo de picos.

**Aquí es donde se aplican los cursos anteriores**: idempotencia, outbox, sagas, backpressure, ley de Little, límites de la BD. Nombrarlos con propiedad es lo que produce la valoración "senior sólido".

## Fase 6 · Cierre (40–45 min)

Cuatro frases que dejan buen sabor:

1. **Cuellos de botella:** *"El primero que reventaría es la BD de escrituras; lo sabría por la latencia de commit y el lag de replicación."*
2. **Modos de fallo:** *"Si cae la caché, la BD recibe 50 veces más carga; por eso pondría single-flight y un límite de concurrencia hacia la BD."*
3. **Qué haría con más tiempo:** multi-región, analítica, cuotas por cliente.
4. **Qué simplificaría:** *"Si en realidad son 500 rps y no 60.000, quito el broker y la caché, y esto es un servicio con Postgres. Diseñar para una escala que no tienes es el error más caro."*

Ese último punto es oro: demuestra criterio de coste y madurez, y muy poca gente lo dice.

## Errores que hunden una entrevista de diseño

- Dibujar antes de preguntar.
- Silencio largo mientras piensas (**narra tu razonamiento**: "estoy dudando entre A y B, y decido por B porque...").
- Nombrar tecnologías en vez de propiedades ("uso Kafka" sin decir por qué necesitas un log particionado).
- No dar un solo número.
- Sobre-diseñar: microservicios, Kubernetes y Kafka para 100 usuarios.
- Ponerse a la defensiva cuando el entrevistador cuestiona algo. Su repregunta suele ser una **pista**, no una trampa: escúchala.
- No terminar. Mejor un diseño completo y simple que uno perfecto a medias.

## 🧪 Laboratorio

1. **Cronometra las fases:** coge tres casos del banco y practica solo las fases 1–2 (10 minutos por caso). Repite hasta que las hagas sin pensar.
2. **Grábate resolviendo** un caso completo. Escúchalo con esta lista: ¿preguntaste?, ¿estimaste?, ¿justificaste cada caja?, ¿hablaste de fallos?, ¿cerraste?
3. **Practica el "simplifica":** toma un diseño tuyo y reescríbelo para 1/100 del tráfico. ¿Qué desaparece?
4. **Simulacro con otra persona** (aunque no sea técnica): que te interrumpa con "¿por qué?" cada dos minutos. Entrena a justificar.
5. **Dibuja rápido:** practica hasta que puedas dibujar el diagrama base (cliente, gateway, servicio, BD, caché, cola, worker) en 60 segundos.

## ✅ Autoevaluación

1. Recita el reparto de los 45 minutos y qué produces en cada fase.
2. ¿Cuáles son las cinco preguntas no funcionales que siempre haces?
3. ¿Por qué la pregunta sobre consistencia es la más rentable?
4. ¿Qué haces si el entrevistador no elige dónde profundizar?
5. Enumera cuatro cosas que dices en el cierre.
6. ¿Cómo reaccionas cuando cuestionan una decisión tuya?

## 🎯 Preguntas del banco que ya puedes responder

- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — los 10 casos (con los módulos 2–4 de este curso)

---

**Siguiente:** [Módulo 2 · Estimaciones y números](02-estimaciones-y-numeros.md)
