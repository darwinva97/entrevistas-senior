# Módulo 4 · Migraciones sin downtime

> **Curso 07 · APIs** · 150 min · El módulo más práctico del curso

## Por qué esto importa en la entrevista

Porque es una pregunta de ejecución, no de teoría: *"tienes que renombrar una columna que usan tres servicios y no puedes parar el sistema. Cuéntame los pasos."* Quien responde con las fases correctas ha hecho esto de verdad; quien dice "pongo la aplicación en mantenimiento" acaba de definir su nivel.

## El patrón: expand / migrate / contract

```
FASE 1 · EXPAND     añadir lo nuevo, sin tocar lo viejo   (compatible con todo el código desplegado)
FASE 2 · MIGRATE    escribir en ambos + backfill + verificar
FASE 3 · SWITCH     leer de lo nuevo (con flag, reversible)
FASE 4 · CONTRACT   dejar de escribir lo viejo y, tras un periodo de gracia, eliminarlo
```

La clave conceptual: **en ningún momento el esquema y el código desplegado son incompatibles**. Por eso puedes desplegar y hacer rollback en cualquier punto, que es exactamente lo que te van a preguntar ("¿y si tienes que revertir a mitad?").

## Caso completo: renombrar `email` a `correo_electronico`

```sql
-- FASE 1 · EXPAND (despliegue 1: solo BD, nadie la usa aún)
ALTER TABLE usuarios ADD COLUMN correo_electronico TEXT;   -- nullable, sin default costoso
CREATE INDEX CONCURRENTLY idx_usuarios_correo ON usuarios(correo_electronico);
```

```sql
-- FASE 2 · MIGRATE
-- 2a. Despliegue 2: el código escribe en AMBAS columnas y sigue leyendo la vieja.
-- 2b. Backfill por lotes, con pausas para no saturar (nada de un UPDATE de 50M de filas):
UPDATE usuarios SET correo_electronico = email
 WHERE correo_electronico IS NULL AND id IN (
   SELECT id FROM usuarios WHERE correo_electronico IS NULL ORDER BY id LIMIT 5000);
-- repetir hasta 0 filas; monitorizar replicación, locks y latencia de la aplicación
-- 2c. Verificar: SELECT count(*) FROM usuarios WHERE correo_electronico IS DISTINCT FROM email;
```

```
-- FASE 3 · SWITCH (despliegue 3): leer de la nueva, detrás de un feature flag.
-- Si algo va mal: apagar el flag. Sin redeploy, sin migración inversa.
-- Deja pasar días, no minutos: los errores raros aparecen en los flujos poco frecuentes.
```

```sql
-- FASE 4 · CONTRACT (despliegue 4 + N días)
-- 4a. Dejar de escribir en 'email' (código).
-- 4b. Periodo de gracia con la columna vieja intacta (por si hay que volver).
-- 4c. ALTER TABLE usuarios DROP COLUMN email;   ← el último paso, semanas después
```

**Lo que hay que verbalizar:** cada fase es un despliegue independiente y reversible; el backfill es por lotes y observado; el cambio de lectura va tras un flag; y el `DROP` ocurre semanas después, cuando ya nadie puede necesitarlo. Añade que **antes de la fase 4 conviene buscar usos olvidados** (logs de consultas, grep en todos los repos, `pg_stat_statements`).

## Variantes que también preguntan

**Cambiar el tipo de una columna:** misma técnica, con columna nueva del tipo correcto. Nunca un `ALTER TYPE` directo sobre una tabla grande (reescribe y bloquea).

**Partir una tabla en dos servicios (descomponer un monolito):**
1. Nueva tabla/servicio con su esquema propio.
2. **CDC** (Debezium) o doble escritura para mantenerlas sincronizadas.
3. **Shadow reads:** el servicio nuevo responde en paralelo y comparas resultados sin servirlos (mide la tasa de discrepancia).
4. Cambio de lectura por porcentaje de tráfico.
5. Cambio de escritura al nuevo dueño.
6. Retirada de la tabla vieja.

La fase 3 (comparación en la sombra) es la que casi nadie menciona y la que hace que la migración sea segura: **te da evidencia en lugar de fe**.

**Migrar de una base de datos a otra motor:** igual, con doble escritura y reconciliación continua; añade una comparación periódica de checksums por rangos de clave, y un plan de rollback que contemple qué pasa con los datos escritos solo en el destino.

**Cambiar la clave de partición de un topic:** no se puede "renombrar"; se crea un topic nuevo con la nueva clave, se publica en ambos, los consumidores migran, y se retira el viejo ([módulo 3](03-evolucion-de-datos-y-eventos.md)).

## Doble escritura: hazla con cuidado

Escribir en dos sitios **no es atómico** ([curso 00 módulo 3](../00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)). Si ambos destinos están en la misma BD, una transacción lo resuelve. Si no:

- Prefiere **CDC** sobre doble escritura en la aplicación: un solo origen de verdad y el flujo lo mantiene la infraestructura.
- Si haces doble escritura, decide cuál es la **fuente de verdad**, tolera que el secundario falle (sin abortar la operación principal, pero registrando) y **añade reconciliación periódica** que corrija las diferencias.
- Mide la deriva: un contador de discrepancias en el dashboard es tu criterio para avanzar de fase.

## Riesgos operativos de una migración

- **Locks:** conoce qué operaciones bloquean en tu motor. Usa `lock_timeout` (Postgres) para que un `ALTER` que no consigue el lock falle rápido en lugar de encolar a todo el mundo detrás (el fallo que convierte una migración en un apagón).
- **Retraso de replicación:** un backfill agresivo hace que las réplicas se queden atrás y los lectores vean datos viejos. Ve por lotes, mide el lag y pausa.
- **Índices:** `CONCURRENTLY` para no bloquear escrituras; verifica que no quedó inválido.
- **Rollback del código con el esquema ya migrado:** por eso las fases son aditivas — el código viejo debe seguir funcionando con el esquema nuevo.
- **Migraciones en el arranque de la aplicación:** peligroso con varias réplicas (varias intentan a la vez) — usa un job de migración previo con bloqueo, no el `entrypoint` de todos los pods.
- **Datos de gran volumen:** estima la duración del backfill *antes*; una migración de 20 horas necesita ser reanudable e idempotente.

## Cómo lo cuentas en una entrevista (guion de 90 segundos)

> "Uso expand/contract para que el esquema y el código nunca sean incompatibles. Primero añado la columna nueva sin tocar nada. Luego despliego código que escribe en ambas y hago backfill por lotes vigilando locks y lag de replicación, verificando que ambas columnas coinciden. Después cambio la lectura detrás de un feature flag, que me permite revertir en segundos sin desplegar. Dejo pasar unos días, dejo de escribir la vieja, y solo semanas después la elimino, tras comprobar en logs y en los repos que nadie la usa. Cada fase es un despliegue independiente y reversible."

## Errores comunes que delatan a un no-senior

- Ventana de mantenimiento como primera opción.
- Renombrar la columna y desplegar el código a la vez.
- Backfill con un solo `UPDATE` masivo.
- No tener feature flag en el cambio de lectura.
- Eliminar lo viejo en el mismo despliegue "para no dejarlo a medias".
- Ejecutar migraciones desde el arranque de N réplicas.
- No medir la discrepancia entre origen y destino.

## 🧪 Laboratorio

1. **Renombrado completo:** con una tabla de 2M de filas y tráfico constante (pgbench o un script), ejecuta las cuatro fases sin errores en la aplicación. Grafica latencia y errores durante todo el proceso.
2. **Provoca el desastre:** haz un `ALTER TABLE` bloqueante con tráfico activo y observa la cola de conexiones esperando. Repite con `lock_timeout` y compara.
3. **Backfill con presión:** haz un `UPDATE` masivo y mide el lag de la réplica; luego por lotes con pausa, y compara.
4. **Shadow reads:** implementa la comparación en paralelo entre el camino viejo y el nuevo, con métrica de discrepancias. Introduce un bug sutil en el nuevo y comprueba que la métrica lo detecta.
5. **Rollback a mitad:** en la fase 3, apaga el flag bajo carga y verifica que no hay pérdida de datos ni errores.

## ✅ Autoevaluación

1. Explica expand/contract y por qué permite rollback en cualquier fase.
2. Renombra una columna usada por 3 servicios sin downtime: pasos y despliegues.
3. ¿Por qué el backfill va por lotes y qué métricas vigilas?
4. ¿Por qué el cambio de lectura va tras un feature flag?
5. Descompón una tabla en un servicio nuevo: fases, y qué son las shadow reads.
6. Riesgos de la doble escritura y cómo los mitigas.
7. ¿Por qué no ejecutar migraciones en el arranque de los pods?

## 🎯 Preguntas del banco que ya puedes responder

- [`versionamiento-apis/02-versionamiento-de-servicios-y-datos.md`](../../versionamiento-apis/02-versionamiento-de-servicios-y-datos.md) — migraciones y expand/contract
- [`versionamiento-apis/03-casos-y-problemas.md`](../../versionamiento-apis/03-casos-y-problemas.md) — los 10 casos
- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — 10 (migración de monolito)
- [`java-microservicios/03-casos-y-problemas.md`](../../java-microservicios/03-casos-y-problemas.md) — 11 (monolito a microservicios)

---

**Anterior:** [Módulo 3](03-evolucion-de-datos-y-eventos.md) · **Fin del curso 07.**
