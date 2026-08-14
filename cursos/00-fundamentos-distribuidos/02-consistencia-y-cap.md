# Módulo 2 · Consistencia, CAP y el mundo real

> **Curso 00 · Fundamentos** · 120 min · Requiere [módulo 1](01-modelo-mental.md)

## Por qué esto importa en la entrevista

"Consistencia" es la palabra más sobrecargada de nuestro oficio: significa una cosa en ACID (la C de *consistency*: se respetan las invariantes) y otra distinta en CAP (todas las lecturas ven la última escritura). Un candidato que las mezcla pierde credibilidad al instante; uno que las distingue y sabe elegir el nivel adecuado para cada operación demuestra criterio de arquitecto.

Además, casi todo caso de diseño acaba en la misma pregunta del entrevistador: *"¿y si el usuario no ve su cambio inmediatamente?"*. Tu respuesta define si el sistema es simple o carísimo.

## Modelo mental: consistencia es un contrato sobre lo que puedes leer

Piensa en un eje, de más caro a más barato:

```
Linealizable ──► Secuencial ──► Causal ──► Read-your-writes ──► Eventual
   (parece                                                        (converge
  un solo dato)                                                  algún día)
     $$$$                                                           $
```

- **Linealizable (consistencia fuerte):** existe un orden único y global; toda lectura ve la última escritura confirmada. Es lo que da una BD relacional monolítica, o `etcd`/Spanner. Cuesta coordinación (consenso, quórums, relojes) y por tanto **latencia**.
- **Causal:** si A causó B, todos ven A antes que B; operaciones concurrentes pueden verse en distinto orden. Suficiente para la mayoría de UIs.
- **Read-your-writes:** *tú* ves tus cambios, aunque otros tarden. Es lo que en la práctica exige el usuario, y a menudo se resuelve con un truco barato: enrutar tus lecturas al primario durante N segundos, o pintar en el cliente lo que acabas de enviar.
- **Eventual:** sin más escrituras, todas las réplicas convergen. Barato y disponible; obliga a diseñar para lecturas obsoletas.

**💬 Cómo lo dices:** *"No elijo un nivel de consistencia para el sistema, lo elijo por operación. El saldo disponible al confirmar un pago lo quiero fuerte; el contador de 'me gusta' y el listado de pedidos pueden ser eventuales con read-your-writes para el propio usuario."*

## CAP, bien contado

El teorema (Brewer, formalizado por Gilbert y Lynch) dice: **cuando hay una partición de red (P), tienes que elegir entre responder con datos posiblemente obsoletos (AP) o no responder (CP)**. No es un menú de tres: la P no se elige, la red se parte. Por eso "somos CA" no significa nada en un sistema distribuido real.

Lo que sí diferencia a un senior es citar **PACELC**: *si hay Partición, eliges Availability o Consistency; Else (operación normal), eliges Latencia o Consistencia*. Esa segunda mitad es la que gobierna tu día a día: incluso sin fallos, la consistencia fuerte cuesta latencia porque exige coordinar réplicas.

| Sistema | Partición | Normal |
|---|---|---|
| PostgreSQL primario/réplica | CP (el primario manda) | EC o EL según leas de réplica |
| DynamoDB | AP por defecto (lectura eventual) | EL, con opción de lectura fuerte más cara |
| Cassandra | AP ajustable con quórums | EL |
| Spanner / etcd / ZooKeeper | CP | EC (paga latencia por consenso) |
| Kafka | CP para escritura con `acks=all` + `min.insync.replicas` | — |

> **⚠️ Trampa:** decir "MongoDB es AP" o "Cassandra es AP" como si fuera fijo. En ambos el nivel es **configurable por operación** (write/read concern, `QUORUM`, `LOCAL_ONE`). La regla de quórum: con N réplicas, si `R + W > N` obtienes lecturas consistentes; con N=3, W=2, R=2 lo cumples y toleras la caída de una réplica.

## Consistencia dentro de una sola base de datos: aislamiento

Aquí es donde se cae mucha gente, porque el 90% de los bugs de concurrencia ocurren en una única BD.

| Nivel | Previene | Permite todavía |
|---|---|---|
| Read Uncommitted | nada | dirty reads |
| Read Committed *(default en Postgres)* | dirty reads | non-repeatable reads, phantoms, **lost update** |
| Repeatable Read *(default en MySQL/InnoDB)* | non-repeatable reads | phantoms (en el estándar), write skew |
| Serializable | todo | nada, pero cuesta (abortos o locks) |

**Los tres fenómenos que debes saber explicar con un ejemplo:**

1. **Lost update:** dos transacciones leen `stock = 10`, restan 1 y escriben 9. Se vendieron 2 unidades, el stock dice 9. Solución: `UPDATE ... SET stock = stock - 1 WHERE id = ? AND stock > 0` (atómico en la BD), `SELECT ... FOR UPDATE`, o bloqueo optimista con columna `version`.
2. **Write skew:** dos médicos de guardia; cada transacción comprueba "queda al menos otro de guardia" y ambos se dan de baja. Ninguna escribió la misma fila, así que Repeatable Read no lo detecta. Solución: Serializable (SSI en Postgres) o materializar el conflicto.
3. **Phantom read:** una consulta agregada cambia porque otra transacción insertó filas que cumplen el filtro.

```sql
-- ❌ Read-modify-write en la aplicación: pierde actualizaciones
SELECT stock FROM productos WHERE id = 7;      -- 10
-- ... lógica en tu servicio ...
UPDATE productos SET stock = 9 WHERE id = 7;

-- ✅ Condición atómica en la BD: 0 filas afectadas = no había stock
UPDATE productos SET stock = stock - 1
 WHERE id = 7 AND stock >= 1;

-- ✅ Bloqueo optimista: falla explícitamente si alguien se te adelantó
UPDATE pedidos SET estado = 'PAGADO', version = version + 1
 WHERE id = 7 AND version = 3;
```

**Bloqueo optimista vs pesimista:** optimista (versión + reintento) cuando la contención es baja —la mayoría de los casos— porque no mantiene locks abiertos ni bloquea a nadie; pesimista (`FOR UPDATE`) cuando la contención sobre la misma fila es alta y reintentar sería peor, o cuando necesitas serializar un recurso escaso (el asiento 4B del vuelo).

## Transacciones distribuidas: lo que sí existe

**2PC (two-phase commit)** existe y funciona, pero bloquea: si el coordinador cae entre `prepare` y `commit`, los participantes quedan con locks abiertos. En microservicios modernos casi nunca se usa; lo que se usa es:

- **Saga:** una secuencia de transacciones locales, cada una con su compensación. Coreografía (por eventos) para flujos simples; orquestación (un coordinador explícito) cuando hay más de 3–4 pasos y necesitas ver el estado del flujo. Detalle en el [módulo 3](03-mensajeria-e-idempotencia.md).
- **Outbox + consumidores idempotentes:** la forma real de "publicar y persistir atómicamente".
- **Reconciliación:** un proceso periódico que compara ambos lados y corrige. Poco glamuroso, imprescindible: cualquier sistema de dinero serio tiene conciliación.

> **💬 Cómo lo dices ante "¿y si hace falta que sea transaccional entre servicios?":** *"Primero cuestiono la frontera: si dos datos deben cambiar atómicamente siempre, probablemente pertenecen al mismo servicio. Si de verdad están separados, uso saga con compensaciones e idempotencia, y añado conciliación porque las compensaciones también fallan."*

## Consistencia eventual sin que el usuario lo note

Trucos concretos que puedes proponer en una entrevista de diseño:

- **Read-your-writes por enrutamiento:** tras una escritura, marca la sesión y lee del primario durante N segundos.
- **Actualización optimista de UI:** el frontend pinta el resultado esperado y reconcilia con el servidor.
- **Token de versión:** la escritura devuelve una versión; el cliente la manda en la siguiente lectura y el servidor espera a que la réplica alcance esa versión (read-after-write con *consistent prefix*).
- **Estado explícito en la UI:** "procesando" es una respuesta legítima y honesta; convierte una limitación técnica en información útil.

## Errores comunes que delatan a un no-senior

- Confundir la C de ACID con la C de CAP.
- "Elegimos CA" / "CAP dice que elijas dos de tres".
- Asumir que Read Committed evita lost updates.
- Usar `SELECT` + `UPDATE` en la aplicación para decrementar stock o saldo.
- Proponer 2PC entre microservicios sin mencionar el bloqueo del coordinador.
- No distinguir *consistencia* de *durabilidad* (que la escritura sobreviva a un corte) ni de *aislamiento*.

## 🧪 Laboratorio — rompe una invariante con tus manos

Con PostgreSQL local (`docker run -e POSTGRES_PASSWORD=x -p 5432:5432 postgres:16`):

1. Crea `productos(id, stock)` con `stock = 1`.
2. Abre **dos** sesiones `psql`. En ambas: `BEGIN; SELECT stock FROM productos WHERE id=1;` → ambas ven 1.
3. En ambas: `UPDATE productos SET stock = 0 WHERE id = 1; COMMIT;` → vendiste dos veces la última unidad. **Lost update reproducido.**
4. Repite con `UPDATE productos SET stock = stock - 1 WHERE id = 1 AND stock >= 1;` y observa que la segunda devuelve `UPDATE 0`.
5. Repite el experimento del *write skew* (tabla `guardias(medico, activo)`, invariante "al menos 1 activa") con `BEGIN ISOLATION LEVEL REPEATABLE READ` y luego con `SERIALIZABLE`; en el segundo caso una transacción debe abortar con `could not serialize access`. **Anota el SQLSTATE `40001`: tu código debe reintentar ante ese error.**
6. Mide: ejecuta 1.000 decrementos concurrentes con `pgbench` en las tres estrategias (aplicación, condicional, `SERIALIZABLE`) y compara throughput y errores.

**Entregable:** una tabla comparando las tres estrategias con números tuyos, y una frase de una línea sobre cuándo usarías cada una.

## ✅ Autoevaluación

1. Diferencia entre la C de ACID y la C de CAP, con un ejemplo de cada una.
2. ¿Qué significa PACELC y por qué es más útil que CAP en el día a día?
3. Tu servicio decrementa saldo con `SELECT` y luego `UPDATE`. ¿Qué falla y en qué nivel de aislamiento?
4. Explica write skew y por qué Repeatable Read no lo evita.
5. El producto exige "el usuario debe ver su pedido inmediatamente" y tú lees de réplica. Da tres soluciones con distinto costo.
6. N=3 réplicas, W=1, R=1: ¿qué garantías tienes? ¿Y con W=2, R=2?

## 🎯 Preguntas del banco que ya puedes responder

- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — casos 4 (overselling) y 8 (reservas)
- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — caso 4 (saga rota)
- [`java-microservicios/02-spring-y-microservicios.md`](../../java-microservicios/02-spring-y-microservicios.md) — 2 (@Transactional), 7 (saga), 12 (CQRS/ES)
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 7 (datos inconsistentes)
- [`versionamiento-apis/02-versionamiento-de-servicios-y-datos.md`](../../versionamiento-apis/02-versionamiento-de-servicios-y-datos.md) — migraciones y expand/contract

## Para profundizar

- Kleppmann, *DDIA*, capítulo 7 (transacciones) — el mejor texto sobre aislamiento que existe.
- Peter Bailis, "Highly Available Transactions" y su artículo sobre niveles de aislamiento reales de los proveedores cloud.
- Documentación de Postgres sobre SSI (Serializable Snapshot Isolation).

---

**Anterior:** [Módulo 1](01-modelo-mental.md) · **Siguiente:** [Módulo 3 · Mensajería, entrega e idempotencia](03-mensajeria-e-idempotencia.md)
