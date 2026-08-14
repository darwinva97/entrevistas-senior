# Módulo 4 · Almacenamiento y modelado de datos

> **Curso 08 · System design** · 150 min

## Por qué esto importa en la entrevista

Porque la elección de almacenamiento es **la decisión más difícil de revertir** de un diseño, y el entrevistador lo sabe. Cambiar un framework cuesta semanas; cambiar el modelo de datos de un sistema en producción cuesta trimestres. Por eso te van a presionar aquí.

## El árbol de decisión

```
¿Necesito transacciones y consultas variadas?
   Sí → RELACIONAL (default). ¿Escala? réplicas → particionado → ¿de verdad no cabe?
   No ↓
¿Acceso siempre por clave conocida, latencia predecible, escala masiva?
   Sí → KEY-VALUE / WIDE-COLUMN (DynamoDB, Bigtable, Cassandra)
   No ↓
¿Documentos con forma variable consultados por sus campos?
   Sí → DOCUMENTAL (Mongo, Firestore, Cosmos)
   No ↓
¿Agregaciones sobre grandes volúmenes históricos?
   Sí → COLUMNAR / OLAP (BigQuery, Redshift, ClickHouse)
   ¿Búsqueda de texto o facetas? → MOTOR DE BÚSQUEDA
   ¿Series temporales? → TSDB (Timescale, Prometheus, Influx)
   ¿Relaciones profundas (grafos)? → GRAFOS (Neo4j) — raro, pero existe
```

**La frase que debes decir:** *"empiezo por Postgres salvo que el patrón de acceso demuestre que no sirve. Postgres hace JSON, búsqueda de texto, series temporales con extensiones y colas sencillas; salir de él tiene que estar justificado por un requisito concreto, no por una preferencia."*

Y su contrapeso, para no sonar dogmático: *"si el patrón es puramente clave-valor a 100.000 escrituras/s, forzarlo en relacional es peor: ahí DynamoDB o Cassandra es la respuesta correcta."*

## Modelar según el motor

**Relacional:** normaliza primero, desnormaliza con motivo. Índices según las consultas reales (`EXPLAIN ANALYZE`, `pg_stat_statements`), no "por si acaso" — cada índice cuesta en cada escritura. Índices compuestos con el orden correcto (el prefijo importa). Cuidado con los índices que no se usan y con las consultas que no pueden usarlos (funciones sobre la columna, `LIKE '%x'`).

**Key-value / wide-column:** el modelo lo dicta la consulta. En DynamoDB: PK/SK diseñadas para tus patrones, índices secundarios para los demás, y el **single-table design** (que no hay que proponer sin entender: agrupa entidades relacionadas bajo la misma partición para leerlas de un golpe). Vigila las **particiones calientes** y los límites por partición.

**Documental:** embebe lo que se lee junto, referencia lo que crece sin límite o se comparte. Recuerda que sin transacciones multi-documento (o con ellas, pero caras) las invariantes entre documentos son tu responsabilidad.

**Columnar:** particiona por fecha, ordena por la columna de filtro dominante, y **cobra por datos escaneados** (en BigQuery, `SELECT *` sobre una tabla grande es una factura). Nunca lo uses para OLTP.

## Separar OLTP de OLAP

Es una respuesta que casi siempre suma: **las consultas analíticas no deben tocar la BD transaccional**. El analista que lanza un `GROUP BY` sobre un año de pedidos puede tumbar el checkout (es literalmente el caso 1 de [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md)).

Solución: réplica dedicada para lecturas pesadas, o **CDC hacia un almacén analítico**. Menciona que el pipeline (CDC → almacén → transformaciones) es asíncrono y que el negocio debe saber que ve datos con minutos de retraso.

## Particionado: la decisión irreversible

| Estrategia | Bueno para | Riesgo |
|---|---|---|
| **Hash de la clave** | reparto uniforme | consultas por rango imposibles |
| **Rango** (fecha, id) | consultas por rango, purga barata | **hot spot** en la partición actual |
| **Por tenant** | aislamiento, cumplimiento | tenants gigantes desbalancean |
| **Compuesta** (tenant + hash) | lo mejor de dos mundos | complejidad |

Puntos que suman: **hash consistente** para minimizar el movimiento al añadir nodos; el problema de las **transacciones y joins entre particiones** (evítalos: si tu patrón los exige constantemente, la clave está mal elegida); y el plan de **re-sharding** — cómo lo harías en caliente (doble escritura, backfill, cambio de lectura, igual que en el [curso 07 módulo 4](../07-apis-y-versionado/04-migraciones-sin-downtime.md)).

## Datos calientes, tibios y fríos

Diseña el ciclo de vida explícitamente: lo caliente en BD rápida y caché; lo tibio en almacenamiento barato consultable; lo frío en objetos/archivo con recuperación lenta. Es una respuesta que reduce coste y latencia a la vez, y que casi nadie ofrece espontáneamente: *"solo el 5% de los pedidos consultados tienen más de 90 días; los muevo a almacenamiento frío y la BD principal baja a una décima parte."*

## Consistencia en el diseño de datos

Retoma el [curso 00 módulo 2](../00-fundamentos-distribuidos/02-consistencia-y-cap.md) y aplícalo por operación: el saldo y el stock, fuertes; el contador de vistas y el feed, eventuales. Si el entrevistador insiste en "todo consistente", cuantifica el coste: coordinación, latencia y disponibilidad reducida en particiones.

## Errores comunes que delatan a un no-senior

- Elegir NoSQL "porque escala" sin conocer el patrón de acceso.
- Índices por todas partes sin medir su efecto en escrituras.
- Analítica sobre la BD de producción.
- No tener plan de particionado ni de re-sharding.
- Ignorar el coste de los datos históricos.
- Proponer event sourcing por defecto.
- No mencionar backups ni su restauración probada.

## 🧪 Laboratorio

1. **Modela el mismo dominio** (pedidos con líneas, clientes, pagos) en Postgres y en DynamoDB. Escribe las 5 consultas principales en ambos y compara esfuerzo, coste y flexibilidad.
2. **Índices con datos reales:** carga 5M de filas, ejecuta `EXPLAIN ANALYZE` de tus consultas, añade índices y mide lectura *y* escritura antes/después.
3. **Hot partition:** en DynamoDB (o simulado con Postgres particionado), envía el 80% del tráfico a una clave y observa el throttling. Aplica una estrategia de reparto.
4. **OLTP vs OLAP:** lanza un `GROUP BY` pesado contra tu BD mientras hay carga transaccional; mide el impacto en el p99. Muévelo a una réplica y repite.
5. **Ciclo de vida:** implementa el archivado de datos con más de N meses y mide la reducción de tamaño e índices.

## ✅ Autoevaluación

1. Recorre el árbol de decisión para: catálogo de productos, mensajes de chat, métricas de IoT, historial de pagos.
2. ¿Por qué "empiezo por Postgres" es una respuesta defendible y cuándo deja de serlo?
3. ¿Qué cuesta un índice y cómo decides cuáles crear?
4. Compara las cuatro estrategias de particionado.
5. ¿Cómo evitas que la analítica afecte a producción?
6. ¿Cómo harías un re-sharding en caliente?
7. ¿Qué datos harías eventualmente consistentes en un e-commerce y cuáles no?

## 🎯 Preguntas del banco que ya puedes responder

- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — la fase de datos de los 10 casos
- [`cloud/`](../../cloud/) — preguntas de elección de base de datos en cada nube
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 8 (N+1 y acceso a datos)

---

**Anterior:** [Módulo 3](03-catalogo-de-patrones.md) · **Siguiente:** [Módulo 5 · Guion de incidentes](05-guion-de-incidentes.md)
