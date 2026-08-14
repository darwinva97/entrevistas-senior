# Módulo 2 · Estimaciones y números que debes saber

> **Curso 08 · System design** · 90 min

## Por qué esto importa en la entrevista

Porque las estimaciones son la parte más fácil de preparar y la que más candidatos hacen mal. No se trata de precisión: se trata de **demostrar que puedes convertir un requisito de negocio en una decisión técnica** delante de alguien, sin calculadora y sin bloquearte.

## Los atajos aritméticos

```
1 día  ≈ 86.400 s ≈ 10⁵ s        ← redondea a 100.000, es el truco que ahorra tiempo
1 mes  ≈ 2,5 × 10⁶ s
1 año  ≈ 3 × 10⁷ s

1 millón/día  ≈ 12 rps
1 millón/hora ≈ 280 rps
100 millones/día ≈ 1.200 rps
```

Redondea siempre y dilo: *"voy a usar 100.000 segundos por día para que salga redondo"*. Nadie te va a penalizar por un 15% de error; te penalizan por tardar tres minutos en dividir.

## Tamaños típicos

| Dato | Tamaño aproximado |
|---|---|
| Un id (UUID) | 16 B binario, 36 B texto |
| Un timestamp | 8 B |
| Un registro de metadatos (fila típica) | 100 B – 1 KB |
| Un tuit / mensaje corto | ~300 B |
| Un JSON de pedido con líneas | 1–5 KB |
| Una foto comprimida | 200 KB – 2 MB |
| Un minuto de vídeo 1080p | ~30 MB |
| Índice de una columna | ~2–5% de la tabla, y suma a la escritura |

Multiplicadores que hay que aplicar y decir en voz alta: **×1,5–2 por índices**, **×3 por réplicas**, **×1,3 por overhead del motor**, y el crecimiento anual del negocio.

## Números de latencia (ya vistos en el curso 00, aquí para recitar)

| Operación | Tiempo |
|---|---|
| Caché en memoria del proceso | ~100 ns |
| Redis en la misma región | 0,5–1 ms |
| Consulta indexada a Postgres | 1–5 ms |
| Round-trip entre AZ | 1–2 ms |
| Lectura de S3 | 20–100 ms |
| Round-trip Lima ↔ Virginia | ~70 ms |
| Round-trip intercontinental | 150–250 ms |

Y las capacidades de referencia (órdenes de magnitud, no verdades absolutas):

- Una instancia de Postgres bien dimensionada: **miles de escrituras/s**, decenas de miles de lecturas simples/s (con caché e índices adecuados).
- Redis: **>100.000 ops/s** por instancia.
- Un servicio web sencillo por núcleo: **1.000–5.000 rps** si no hace I/O pesado.
- Kafka: **cientos de MB/s** por broker; el paralelismo lo dan las particiones.
- Una NIC de 10 Gbps ≈ 1,25 GB/s: útil para descartar diseños que no caben en la red.

## El guion de estimación en 6 pasos

```
1. TRÁFICO     DAU × acciones/día ÷ 10⁵ = rps medio;  pico = ×3–10 (di el factor)
2. RATIO       lecturas : escrituras  → ¿el sistema es de lectura o de escritura?
3. DATOS       registros/día × tamaño × retención × (índices, réplicas)
4. ANCHO BANDA rps × tamaño de respuesta  → ¿necesito CDN?
5. CÓMPUTO     Little: concurrencia = rps × latencia; instancias con utilización 60–70%
6. MEMORIA     ¿cabe el working set en caché? (regla 80/20: el 20% de las claves = 80% del tráfico)
```

**Ejemplo completo, dicho como lo dirías en voz alta:**

> "20 millones de usuarios activos al día, cada uno abre el feed 10 veces: 200 millones de lecturas/día, que entre 100.000 segundos son unas 2.000 lecturas por segundo de media; con pico ×5, 10.000. Las escrituras son 100 veces menos: 20/s de media. Con eso ya sé que esto es un sistema de lectura, así que el diseño girará en torno a caché y réplicas, no a sharding de escrituras. Cada entrada son ~500 bytes; 2 millones de publicaciones al día son 1 GB/día, 365 GB al año, unos 1,5 TB con réplicas: cabe de sobra en una BD particionada por usuario. El working set —lo que se lee de verdad, digamos lo último de cada usuario activo— son unos pocos cientos de GB, así que una caché de 100–200 GB me da un hit rate alto. Para 10.000 rps con 20 ms de latencia son 200 peticiones en vuelo: con unas 10 instancias voy sobrado al 60% de utilización."

Fíjate: **cada número lleva a una decisión**. Eso es lo que se evalúa.

## Errores comunes que delatan a un no-senior

- Buscar precisión decimal en vez de orden de magnitud.
- Estimar y no concluir nada.
- Olvidar el factor de pico (y no justificarlo).
- Ignorar réplicas e índices en el almacenamiento.
- Dimensionar cómputo sin la ley de Little.
- No decir los supuestos en voz alta (el entrevistador no puede corregir lo que no oye).

## 🧪 Laboratorio

1. **Diez estimaciones rápidas**, 3 minutos cada una, en voz alta y sin calculadora:
   WhatsApp (mensajes/s), YouTube (almacenamiento/día), Uber (ubicaciones/s), un e-commerce mediano de Perú en Black Friday, una API pública con 10k clientes, un sistema de notificaciones push, un acortador de URLs, un sistema de logs corporativo, una plataforma de streaming en directo, un ERP con 5.000 empleados.
2. **Contrasta con la realidad:** busca cifras públicas de dos de ellos y compara. Ajusta tu intuición.
3. **Valida contra tu propio sistema:** calcula el rps y el almacenamiento esperados de un servicio tuyo y compáralo con las métricas reales. Este ejercicio arregla la intuición mejor que ningún otro.
4. **Tarjetas de memoria** con la tabla de latencias y capacidades; repásalas hasta recitarlas.

## ✅ Autoevaluación

1. ¿Cuántos segundos tiene un día y por qué redondeas?
2. 30M de DAU × 15 acciones: ¿rps medio y pico?
3. ¿Qué multiplicadores aplicas al estimar almacenamiento?
4. ¿Cuántas peticiones en vuelo hay con 5.000 rps y 40 ms?
5. ¿Cuánto rinde aproximadamente una instancia de Postgres y de Redis?
6. Da un ejemplo de número que cambie una decisión de arquitectura.

## 🎯 Preguntas del banco que ya puedes responder

- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — la fase de estimaciones de los 10 casos
- [`cloud/`](../../cloud/) — preguntas de dimensionado y costes

---

**Anterior:** [Módulo 1](01-framework-de-45-minutos.md) · **Siguiente:** [Módulo 3 · Catálogo de patrones](03-catalogo-de-patrones.md)
