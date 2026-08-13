# Casos y Problemas de Versionamiento

Escenarios reales de evolución de APIs, esquemas y contratos que un entrevistador plantea para evaluar cómo un perfil senior diseña planes de migración seguros, gestiona incidentes y previene breaking changes.

## 1. Renombrar un campo usado por 15 consumidores (expand/contract end-to-end)
**Categoría:** Evolución de contratos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Nunca renombro en un solo paso: aplico expand/contract. Fase expand: añado `legal_name` en API, BD y eventos manteniendo `customer_name` como alias sincronizado. Fase migrate: instrumento telemetría por consumidor para medir quién sigue leyendo/escribiendo el campo viejo y coordino la migración con deadline. Fase contract: solo elimino `customer_name` cuando la telemetría muestra 0 usos durante un período de gracia, con header `Deprecation` y comunicación previa. La BD y los eventos siguen el mismo patrón: columna/campo nuevo, doble escritura, backfill, y borrado al final.

### 📖 Respuesta detallada
El error clásico es tratar un rename como un cambio atómico. Con 15 consumidores (algunos que quizá ni conozco), un rename es un breaking change en tres capas: API, base de datos y eventos. El plan:

**Fase 1 — Expand (añadir sin quitar):**
- **BD:** `ALTER TABLE customers ADD COLUMN legal_name TEXT;` (nullable, sin default costoso). Backfill por lotes y luego doble escritura:

```sql
ALTER TABLE customers ADD COLUMN legal_name TEXT;

-- Backfill por lotes para no bloquear
UPDATE customers SET legal_name = customer_name
WHERE id BETWEEN :lo AND :hi AND legal_name IS NULL;

-- Opcional: trigger de sincronización mientras conviven ambas
CREATE OR REPLACE FUNCTION sync_legal_name() RETURNS trigger AS $$
BEGIN
  NEW.legal_name := COALESCE(NEW.legal_name, NEW.customer_name);
  NEW.customer_name := COALESCE(NEW.customer_name, NEW.legal_name);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

- **API:** el response expone ambos campos; el request acepta ambos (si llegan los dos y difieren, gana el nuevo y logueo la discrepancia). En OpenAPI marco el viejo como deprecated:

```yaml
properties:
  legal_name:
    type: string
  customer_name:
    type: string
    deprecated: true
    description: "DEPRECATED: usar legal_name. Se elimina el 2026-12-01."
```

- **Eventos:** en Avro/Protobuf añado el campo nuevo con default (compatible hacia atrás) y publico ambos. En Protobuf jamás reutilizo el número de campo: `reserved 3; reserved "customer_name";` al final.

**Fase 2 — Migrate (medir y empujar):**
- Instrumento telemetría de adopción: en el gateway o middleware, logueo qué API keys/client-ids envían o parsean `customer_name` (para requests es directo; para responses, uso versión de SDK o encuestas + logs de campos solicitados si hay sparse fieldsets/GraphQL). Un dashboard "consumidores del campo viejo" por client-id es el artefacto clave.
- Comunico: changelog, correo a owners, header `Deprecation: true` y `Sunset: <fecha>` en respuestas que contengan el campo viejo.
- Persigo a los rezagados con datos, no con opiniones: "quedan 3 de 15, estos son, este es su volumen".

**Fase 3 — Contract (retirar):**
- Cuando la telemetría marca 0 usos sostenidos (p. ej. 30 días), elimino el campo del contrato en una versión menor si era opt-in, o lo dejo para la siguiente major si el contrato lo exige. En BD: dejo de escribir `customer_name`, espero un ciclo de rollback seguro, y luego `ALTER TABLE ... DROP COLUMN` (que en PostgreSQL es barato, solo marca la columna).
- El drop de columna va en un deploy separado del código que dejó de usarla, para que un rollback del código no reviva lecturas a una columna inexistente.

**Riesgos y mitigaciones:** consumidores "fantasma" no identificados (mitigo con telemetría en gateway, no con la lista de Confluence); divergencia entre ambos campos durante la convivencia (trigger/única fuente de escritura + job de reconciliación que compara y alerta); rollback a mitad de camino (cada fase es independiente y reversible por diseño).

**Errores comunes:** hacer el rename "rápido" con un `ALTER ... RENAME COLUMN` y un alias en el serializer (rompe consumidores de eventos y réplicas de datos); poner deadline sin telemetría; borrar la columna en el mismo deploy que deja de usarla.

**Qué espera oír el entrevistador:** el patrón expand/contract nombrado explícitamente, que el rename atraviesa tres capas (API, BD, eventos), telemetría real de adopción antes de contraer, y la disciplina de separar drop de columna del deploy de código. Un plus: mencionar que el "período de gracia" es política escrita, no improvisación.

## 2. Un equipo rompió a 3 servicios en producción con un breaking change sin avisar
**Categoría:** Gestión de incidentes y prevención · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Primero estabilizo: si el rollback del servicio ofensor es seguro (sin migraciones de datos irreversibles), rollback inmediato; si ya escribió datos con el esquema nuevo, evalúo fix-forward. Comunico por el canal de incidentes con updates periódicos. Después, post-mortem blameless centrado en el sistema: el problema no es "el equipo avisó mal", es que nada impidió mecánicamente el breaking change. La prevención es contract testing (Pact) y diff de OpenAPI en CI como gate de despliegue, no más reuniones ni más avisos por Slack.

### 📖 Respuesta detallada
**Fase 1 — Respuesta inmediata (minutos):**
1. Declarar incidente con severidad según impacto de negocio, asignar incident commander y abrir canal dedicado. Los 3 servicios afectados y el equipo ofensor entran al canal.
2. Decisión rollback vs fix-forward, con un criterio claro: **rollback** si el deploy no incluyó migraciones destructivas de datos ni otros cambios acoplados imposibles de revertir; **fix-forward** si el rollback reintroduciría otro problema, si ya hay datos escritos en el formato nuevo que la versión anterior no tolera, o si el fix es trivial (p. ej. re-exponer un campo eliminado). Por defecto, rollback: es la opción de menor incertidumbre y no exige diagnóstico completo.
3. Mitigaciones puente si ni rollback ni fix rápido son viables: adapter temporal en el gateway que reconstruya el contrato viejo (p. ej. mapear el campo renombrado), o feature flag que desactive el path roto en los consumidores.
4. Comunicación: updates cada 15–30 min a stakeholders, status page si hay impacto externo. Nada de debates de culpa en el canal del incidente.

**Fase 2 — Post-mortem blameless (días):**
- Timeline factual, impacto cuantificado (requests fallidos, clientes afectados, dinero), y análisis de causa sistémica. La conclusión "el equipo X debió avisar" es inaceptable en un post-mortem serio: los procesos basados en que humanos se acuerden de avisar fallan siempre. La causa raíz real es: *no existe ningún control automático que detecte un breaking change antes de producción*.
- Action items concretos, con owner y fecha, priorizando controles mecánicos sobre "mejorar la comunicación".

**Fase 3 — Prevención mecánica (semanas):**
- **Diff de contratos en CI:** cada PR que toca la especificación pasa por un diff automático que clasifica cambios como breaking o no:

```yaml
# CI: falla el build si hay breaking changes
- name: OpenAPI breaking-change check
  run: oasdiff breaking baseline/openapi.yaml ./openapi.yaml --fail-on ERR
```

Herramientas: `oasdiff`, `openapi-diff`; para gRPC/eventos, `buf breaking` o las reglas de compatibilidad del Schema Registry.
- **Consumer-driven contract testing (Pact):** los consumidores publican sus expectativas al Pact Broker; el provider las verifica en su pipeline. La pieza clave es `can-i-deploy`:

```bash
pact-broker can-i-deploy \
  --pacticipant orders-service --version $GIT_SHA \
  --to-environment production
```

Si algún consumidor desplegado depende de lo que voy a romper, el deploy se bloquea. Esto convierte "avisar" en un gate objetivo.
- **Gates de despliegue adicionales:** canary con métricas de error de los consumidores (no solo del propio servicio), y política de que todo contrato público vive en un repo/registry versionado con CODEOWNERS.

**Trade-offs:** Pact tiene coste de mantenimiento y funciona mejor para APIs internas con pocos consumidores conocidos; para APIs con muchos consumidores anónimos, el diff de spec + política de versionado pesa más. No hay que implantar todo: el diff de OpenAPI en CI da el 80 % del valor con el 20 % del esfuerzo.

**Errores comunes:** convertir el post-mortem en juicio (mata la transparencia futura); responder con proceso burocrático (comité de aprobación de cambios) en vez de automatización; hacer rollback sin verificar si el deploy incluía migración de datos, causando un segundo incidente.

**Qué espera oír el entrevistador:** criterio explícito rollback vs fix-forward, cultura blameless con causa sistémica, y sobre todo que la prevención propuesta sea *mecánica* (contract tests, diff en CI, can-i-deploy) y no "mejorar la comunicación entre equipos".

## 3. Migrar una columna VARCHAR a JSONB en una tabla de 500M filas sin downtime
**Categoría:** Migraciones de esquema de BD · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Jamás un `ALTER COLUMN ... TYPE` directo: sobre 500M filas reescribe la tabla entera bajo lock. Aplico expand/contract a nivel de columna: añado `payload_jsonb JSONB`, activo doble escritura (desde la app o con trigger), hago backfill por lotes con pausas y control de lag de replicación, valido la equivalencia de datos, creo el índice GIN con `CONCURRENTLY`, cambio las lecturas a la columna nueva y solo al final elimino la vieja. Cada paso es reversible y va en deploys separados.

### 📖 Respuesta detallada
**Por qué no el camino directo:** `ALTER TABLE t ALTER COLUMN payload TYPE JSONB USING payload::jsonb` toma un `ACCESS EXCLUSIVE` lock y reescribe 500M filas: horas de tabla bloqueada, WAL masivo, réplicas atrasadas. Descartado.

**Fase 1 — Expand:**
```sql
ALTER TABLE events ADD COLUMN payload_jsonb JSONB;  -- instantáneo, sin rewrite
```
Sin `NOT NULL` ni default todavía (un default volátil forzaría rewrite en versiones antiguas de PG; constante es barato desde PG 11, pero aquí no aplica aún).

**Fase 2 — Doble escritura:** dos opciones con trade-offs:
- **Desde la app** (preferida): el código escribe ambas columnas. Visible, testeable, se despliega con feature flag. Requiere que *todas* las rutas de escritura pasen por la app.
- **Trigger en BD:** garantiza cobertura total (incluye scripts y jobs que escriben directo), a costa de lógica oculta y overhead por fila:

```sql
CREATE OR REPLACE FUNCTION events_sync_payload() RETURNS trigger AS $$
BEGIN
  NEW.payload_jsonb := NEW.payload::jsonb;
  RETURN NEW;
EXCEPTION WHEN others THEN
  NEW.payload_jsonb := NULL;  -- registrar aparte los no parseables
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_payload BEFORE INSERT OR UPDATE
ON events FOR EACH ROW EXECUTE FUNCTION events_sync_payload();
```

**Fase 3 — Backfill por lotes con control de carga:** nunca un `UPDATE` masivo (generaría bloat gigante y un lock largo). Lotes por rango de PK, con pausa entre lotes y monitorización:

```sql
UPDATE events
SET payload_jsonb = payload::jsonb
WHERE id > :last_id AND id <= :last_id + 10000
  AND payload_jsonb IS NULL;
-- commit; sleep 100-500ms; medir pg_stat_replication.replay_lag
-- si replay_lag > umbral (p.ej. 5s), pausar el backfill
```
Puntos críticos: el tamaño de lote se ajusta empíricamente (10k–50k); pausar si el lag de réplicas o la latencia p99 de la app suben; el backfill es reanudable (guarda `last_id` en una tabla de progreso); registrar en una tabla de errores las filas cuyo VARCHAR no parsea a JSON válido — siempre las hay, y hay que decidir política (corregir, NULL, o cuarentena).

**Fase 4 — Validación:** job que muestrea y compara `payload::jsonb = payload_jsonb` (más un count de `payload_jsonb IS NULL` donde no debería). No se avanza sin números: "99.998 % equivalente, 812 filas en cuarentena documentadas".

**Fase 5 — Índices y swap de lecturas:**
```sql
CREATE INDEX CONCURRENTLY idx_events_payload_gin
  ON events USING GIN (payload_jsonb jsonb_path_ops);
```
`CONCURRENTLY` no bloquea escrituras pero puede fallar dejando un índice `INVALID` (hay que detectarlo y rehacerlo). Luego, feature flag para que las lecturas usen la columna nueva, con rollback instantáneo al flag viejo.

**Fase 6 — Contract:** tras un período estable, dejar de escribir la vieja, quitar el trigger, y en un deploy posterior `ALTER TABLE events DROP COLUMN payload;`. Opcional: renombrar `payload_jsonb` → `payload` (rename es barato) solo si el código ya referencia el nombre final vía alias, para no encadenar otro rename arriesgado.

**Riesgos y mitigaciones:** *bloat* por los updates del backfill (monitorizar con `pg_stat_user_tables`, contar con autovacuum agresivo en esa tabla o `pg_repack` al final); *lag de replicación* (throttling del backfill guiado por `replay_lag`); *long-running transactions* que impiden a vacuum limpiar (lotes con commit frecuente); *disco*: la tabla crecerá temporalmente casi al doble.

**Errores comunes:** el ALTER directo "porque es una sola sentencia"; backfill en una sola transacción; crear el índice GIN sin `CONCURRENTLY`; olvidar las filas no parseables; hacer swap de lecturas y drop en el mismo deploy.

**Qué espera oír el entrevistador:** que reconozca el rewrite bajo lock del ALTER directo, backfill por lotes con throttling medido (lag, bloat, vacuum), doble escritura con opciones app vs trigger razonadas, `CREATE INDEX CONCURRENTLY` con su modo de fallo, y fases desacopladas y reversibles.

## 4. Deprecar /v1 con clientes móviles antiguos que no actualizan
**Categoría:** Deprecación y ciclo de vida · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Primero datos: telemetría de tráfico de /v1 por versión de app, OS y volumen de usuarios activos, porque la decisión es de negocio, no técnica. Luego un plan escalonado: anunciar con headers `Deprecation`/`Sunset` y comunicación in-app, brownouts programados para despertar a los rezagados, forced update para las versiones que podamos obligar, y para la cola larga que no actualizará nunca, un adapter en el gateway que traduce v1→v2 y me permite apagar el código v1 aunque el tráfico v1 siga existiendo un tiempo.

### 📖 Respuesta detallada
El problema de fondo con móviles: no controlas el despliegue del cliente. Siempre habrá una cola larga de apps de hace 3 años. El plan:

**Fase 1 — Telemetría y segmentación:** dashboard de tráfico /v1 por `app_version`, plataforma y usuarios únicos (no solo requests: 1M requests pueden ser 500 usuarios con retry agresivo). Distinguir: (a) versiones que soportan forced update, (b) versiones actualizables pero no forzables, (c) versiones muertas/abandonos. La política de sunset se decide con negocio mirando cuántos usuarios activos y cuánto revenue hay en cada segmento.

**Fase 2 — Anuncio y señalización:** fecha de sunset pública (típico: 6–12 meses para móvil), y señalización mecánica en las respuestas:

```http
HTTP/1.1 200 OK
Deprecation: @1767225600
Sunset: Mon, 01 Jun 2026 00:00:00 GMT
Link: <https://developers.example.com/migration/v2>; rel="sunset"
```
Comunicación in-app (banner "actualiza tu app"), email a usuarios identificables, changelog. Los headers solos no bastan con móviles — casi ningún cliente móvil los lee — pero documentan el contrato y sirven a integradores externos.

**Fase 3 — Forced update vs graceful degradation:** si la app tiene mecanismo de versión mínima (endpoint de config al arrancar), subir la versión mínima progresivamente. Trade-off: forced update es hostil (usuario bloqueado hasta actualizar) y solo funciona si el mecanismo ya existía; graceful degradation (la app vieja pierde features no críticas pero conserva el core) retiene usuarios pero prolonga la vida de /v1. Decisión por segmento y criticidad.

**Fase 4 — Brownouts:** apagones programados y anunciados de /v1 (p. ej. 5 minutos, luego 1 hora, luego un día, semanas antes del sunset) devolviendo `503` con `Retry-After`. Objetivo: que los equipos/usuarios que ignoraron los avisos sientan el fallo en un momento controlado y reversible, no el día del apagado definitivo. Métrica de éxito: caída del tráfico v1 tras cada brownout.

**Fase 5 — Adapter v1→v2 en el gateway:** para la cola larga irreducible, un translation layer delante de v2:

```
App v1 ──> API Gateway ──[adapter: v1 request → v2 request,
                          v2 response → v1 shape]──> Servicio (solo v2)
```
Esto separa dos cosas que suelen confundirse: *retirar el código v1* (objetivo de ingeniería: un solo code path que mantener) vs *retirar el contrato v1* (objetivo de negocio). El adapter logra lo primero de inmediato; lo segundo sigue su calendario. Trade-off: el adapter tiene coste de mantenimiento y no puede emular semánticas imposibles (si v2 eliminó un concepto, hay que decidir un degradado); debe ser congelado — no evoluciona, solo existe hasta el sunset real.

**Fase 6 — Apagado:** en la fecha, /v1 devuelve `410 Gone` con cuerpo explicativo y link de migración (no `404`, que parece un bug). Mantener el 410 mucho tiempo: es barato y es documentación.

**Riesgos:** subestimar usuarios enterprise con MDM que congelan versiones (detectarlos por telemetría y tratarlos aparte); brownout que coincide con pico de negocio (calendario coordinado); soporte inundado el día del sunset (preparar macros y avisos previos).

**Errores comunes:** fijar fecha de sunset sin telemetría por versión de app; confiar en headers que los móviles no leen; mantener el código v1 "por si acaso" durante años en lugar de encapsularlo en un adapter; apagar de golpe sin brownouts.

**Qué espera oír el entrevistador:** que reconozca que móvil implica cola larga incontrolable, decisión con datos de usuarios activos (no requests), brownouts como técnica explícita, la distinción código-v1 vs contrato-v1 resuelta con adapter en gateway, y `410 Gone` como final limpio.

## 5. Evolucionar un evento de Kafka con 8 consumidores en distintos equipos
**Categoría:** Evolución de eventos y esquemas · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
La primera pregunta es si el cambio es compatible según el modo del Schema Registry. Si es compatible (añadir campo con default, quitar campo opcional según el modo), despliego en el orden que dicta la compatibilidad: con BACKWARD migran primero los consumidores; con FORWARD migra primero el productor. Si es incompatible, no fuerzo el registry: publico en un topic nuevo versionado (`orders.v2`) con dual publish, migro consumidores a su ritmo monitorizando consumer groups y lag del topic viejo, y apago el topic v1 cuando el tráfico consumido llega a cero.

### 📖 Respuesta detallada
**Fase 1 — Clasificar el cambio contra el modo de compatibilidad:** el Schema Registry (Confluent u otro) impone un modo por subject. Las reglas que gobiernan quién migra primero:

- **BACKWARD** (default de Confluent): el esquema nuevo lee datos escritos con el viejo. Permite *eliminar campos* y *añadir campos con default*. Orden de migración: **consumidores primero** — un consumidor con el esquema nuevo puede seguir leyendo eventos viejos que aún estén en el topic (clave: en Kafka los mensajes viejos persisten según retention, no desaparecen con el deploy).
- **FORWARD**: datos escritos con el esquema nuevo pueden leerse con el viejo. Permite *añadir campos* y *eliminar campos con default*. Orden: **productor primero**, los consumidores viejos ignoran lo nuevo.
- **FULL**: ambas; solo añadir/quitar campos opcionales con default. Orden libre. Con 8 consumidores en equipos distintos que no puedo coordinar, **FULL_TRANSITIVE es la política sana** (transitive = compatible contra *todas* las versiones previas, no solo la última, esencial porque hay eventos antiguos retenidos y consumidores rezagados).

Ejemplo de cambio compatible en Avro:
```json
{"name": "discount_code", "type": ["null", "string"], "default": null}
```
En Protobuf: añadir campo con número nuevo; jamás reutilizar números (`reserved 7; reserved "old_field";`).

**Fase 2 — Cambio compatible:** registrar el esquema (el registry lo valida en CI con `mvn schema-registry:test-compatibility` o `buf breaking`), desplegar en el orden correcto, comunicar en el canal del topic. Con FULL_TRANSITIVE, cada equipo migra a su ritmo.

**Fase 3 — Cambio incompatible (renombrar campo, cambiar tipo, reestructurar):** dos estrategias:

- **Mismo topic con "upcasting"**: solo viable si el cambio se puede expresar como expand/contract dentro del esquema (campo nuevo + viejo conviviendo, como el caso 1). Preferible cuando el orden relativo de eventos importa (un topic nuevo rompe el ordering entre v1 y v2 para la misma key).
- **Topic nuevo versionado** (`orders.events.v2`) con **dual publish**: el productor emite ambos formatos a ambos topics durante la migración. Ventajas: cero riesgo para consumidores actuales, cada equipo migra cuando quiere. Costes: doble throughput/almacenamiento, riesgo de divergencia (mitigar generando ambos eventos desde el mismo punto — idealmente vía outbox transaccional para que v1 y v2 sean atómicos respecto al estado), y el problema de ordering/duplicados para un consumidor que corta de v1 a v2 (definir un punto de corte: p. ej. el consumidor drena v1 hasta un offset/timestamp marcado y arranca v2 desde ahí).

**Fase 4 — Tracking de rezagados:** esto es lo que separa un plan real de uno teórico. Los consumer groups suscritos a v1 son visibles:

```bash
kafka-consumer-groups --bootstrap-server ... --list
kafka-consumer-groups --bootstrap-server ... \
  --describe --group payments-consumer   # lag por partición
```
Dashboard: qué groups siguen en v1, su lag y su último commit. Un group con lag creciente o commits parados probablemente ya migró (o murió) — confirmar con el equipo antes del apagado. Deadline comunicado + revisión semanal de la lista.

**Fase 5 — Decomiso:** cuando no quedan groups activos en v1, parar el dual publish, reducir retention del topic v1 y borrarlo tras un período de gracia.

**Errores comunes:** creer que basta con desplegar "a la vez" productor y consumidores (los eventos viejos retenidos siguen ahí); usar compatibilidad no transitiva; reutilizar field numbers en Protobuf; dual publish sin atomicidad (eventos v1 y v2 divergentes); apagar v1 mirando solo "días transcurridos" y no consumer groups reales.

**Qué espera oír el entrevistador:** la relación modo de compatibilidad ↔ quién migra primero (BACKWARD→consumidores, FORWARD→productor), FULL_TRANSITIVE para equipos descoordinados, el trade-off mismo-topic vs topic-nuevo (ordering vs independencia), dual publish con outbox, y tracking por consumer groups/lag en vez de fechas arbitrarias.

## 6. Rollback de un deploy cuyo nuevo esquema ya escribió datos
**Categoría:** Despliegue y compatibilidad de datos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
El escenario: desplegamos N, escribió datos con el esquema nuevo, y ahora necesitamos volver a N-1. Si diseñamos bien, N-1 tolera los datos de N (rollback forward-compatible) y el rollback es trivial. Si no lo tolera, el rollback ciego causará un segundo incidente: entonces evalúo fix-forward, o rollback más script de reconciliación que normalice los datos nuevos a un formato que N-1 entienda. La lección preventiva es la regla de oro: migraciones desacopladas del deploy, esquema siempre un paso por delante del código, y cada versión debe poder leer lo que escribe la siguiente.

### 📖 Respuesta detallada
**Por qué N-1 debe tolerar datos de N:** el rollback es el mecanismo de seguridad universal — se ejecuta a las 3 AM, bajo presión, a menudo automatizado por el sistema de deploy ante un health check fallido. Si N escribió filas con un estado nuevo (`status = 'PENDING_REVIEW'` que N-1 no conoce), un enum serializado nuevo, o JSON con estructura distinta, N-1 puede lanzar excepciones al leerlas, corromper datos al reescribirlas (deserializa parcial, pierde campos, vuelve a guardar) o tomar decisiones de negocio erróneas. El rollback "seguro" se convierte en el segundo incidente. Por eso la política madura es: **todo deploy debe ser rollback-safe respecto a datos**, y eso se verifica antes, no se descubre después.

**Fase 1 — Diagnóstico inmediato (durante el incidente):** antes de pulsar rollback, responder: ¿N escribió datos que N-1 no tolera? Checklist rápido: ¿hubo migración de esquema en este deploy? ¿nuevos valores de enum/estado? ¿cambio de formato de serialización (JSON/Avro) en columnas o eventos? ¿escrituras a columnas nuevas que N-1 ignorará (aceptable) o dejará inconsistentes (no aceptable)?

**Fase 2 — Decisión:**
- **N-1 tolera los datos** (caso ideal: solo columnas nuevas que N-1 ignora, campos opcionales): rollback directo. Nota: los datos escritos por N quedan "congelados" (N-1 no mantiene la columna nueva); al re-desplegar N habrá un gap que el backfill debe cubrir.
- **N-1 no tolera:** opciones en orden de preferencia:
  1. **Fix-forward:** si el bug de N es acotado, parchear N (N') suele ser más rápido y menos arriesgado que revertir datos. Requiere pipeline de deploy rápido — otra razón para invertir en él.
  2. **Rollback + script de reconciliación:** transformar los datos de N a formato N-1 *antes* de reactivar N-1:
```sql
-- Identificar filas escritas por N (por timestamp de deploy o versión)
UPDATE orders SET status = 'PENDING'
WHERE status = 'PENDING_REVIEW' AND updated_at >= '2026-08-11 14:02:00';
-- Guardar aparte lo que se pierde, para re-aplicar al re-desplegar N
```
     Riesgos: pérdida semántica (el estado nuevo existía por algo), carreras si el tráfico sigue escribiendo. Idealmente con el servicio en modo degradado/read-only durante la reconciliación.
  3. **Rollback parcial:** feature flag que desactiva el code path nuevo en N sin revertir el binario — por esto los cambios arriesgados van detrás de flags: "rollback" en milisegundos y sin tocar datos.

**Fase 3 — Diseño preventivo (la parte que más pesa en la entrevista):**
- **Migraciones desacopladas del deploy:** el cambio de esquema se despliega *antes* y por separado del código que lo usa. El esquema va siempre un paso por delante: primero la migración aditiva (compatible con N-1 y N), luego el código N, y la parte destructiva (drop, NOT NULL) solo cuando N está estable y ya nadie hará rollback a N-1.
- **Regla de compatibilidad de datos:** la versión N solo escribe datos que N-1 pueda leer. Los valores de enum nuevos, formatos nuevos, etc., se introducen en dos releases: N los *lee* (tolera), N+1 los *escribe*. Es la misma lógica que la compatibilidad de esquemas de Kafka aplicada a la BD.
- **Verificación en CI:** test que arranca la versión N-1 del servicio contra una BD poblada por N (o al menos contra el esquema post-migración) — el "rollback test".

**Errores comunes:** acoplar migración y deploy en el mismo paso "por atomicidad"; introducir un valor de enum y escribirlo en el mismo release; asumir que rollback siempre es seguro; reconciliar datos con el tráfico activo.

**Qué espera oír el entrevistador:** el concepto de rollback forward-compatible dicho con claridad (N-1 lee lo que N escribe), el árbol de decisión rollback/fix-forward/reconciliación, y el diseño preventivo: migraciones separadas del deploy, esquema un paso por delante, valores nuevos en dos releases, feature flags como rollback instantáneo.

## 7. Unificar dos APIs duplicadas que divergieron entre equipos
**Categoría:** Consolidación y arquitectura · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Dos equipos construyeron endpoints similares (p. ej. dos APIs de "clientes") con semánticas distintas. No unifico código primero: primero inventarío consumidores y documento las diferencias *semánticas* (no solo de forma), que son el verdadero riesgo. Diseño la API unificada como contrato nuevo — no como "la ganadora" —, la pongo detrás de una fachada (strangler fig) que inicialmente delega en las dos existentes, migro consumidores gradualmente con telemetría, y decomisiono las viejas cuando el tráfico llega a cero. El trabajo duro es reconciliar semántica y ownership, no escribir código.

### 📖 Respuesta detallada
**Fase 1 — Inventario y análisis de diferencias:**
- Mapear consumidores de ambas APIs vía gateway logs / API keys / service mesh: quién llama qué endpoint, con qué volumen y criticidad. Los consumidores desconocidos son el mayor riesgo del proyecto.
- Documentar diferencias en tres niveles: **sintácticas** (nombres de campos, paginación, formatos de fecha — fáciles), **semánticas** (¿"customer" incluye prospects en la API A pero no en la B? ¿`status=active` significa lo mismo? ¿una borra en soft-delete y la otra hard? — aquí viven los bugs de migración) y **no funcionales** (SLA, latencia, autorización: la API A quizá expone campos que los consumidores de B no deben ver).
- Entregable: matriz de diferencias con decisión por cada una. Sin esto, la "unificación" es una tercera API divergente.

**Fase 2 — Diseño del contrato unificado:** decidir con criterios explícitos qué semántica gana en cada punto (dominio correcto según el negocio, no según qué equipo grita más). A veces la respuesta es exponer ambas semánticas explícitamente (`include_prospects=true`) en lugar de elegir. Definir ownership: un solo equipo dueño de la API unificada — sin owner único, la divergencia se repetirá. El contrato se escribe en OpenAPI y se revisa con *todos* los equipos consumidores antes de implementar.

**Fase 3 — Fachada / strangler fig:** publicar la API unificada como fachada que enruta a las implementaciones existentes:

```
                 ┌────────────► API A (legacy)
Consumers ──► Facade /customers
                 └────────────► API B (legacy)
```
La fachada traduce contrato unificado ↔ contratos legacy. Ventaja: los consumidores pueden empezar a migrar de inmediato, sin esperar a la reimplementación; la lógica de negocio se "estrangula" después, endpoint a endpoint, moviéndola detrás de la fachada. Alternativa (elegir una API como base y extenderla) es válida si una de las dos es claramente superior y su equipo asume el ownership; el trade-off es que hereda sus deudas y sesga la semántica.

**Fase 4 — Migración gradual:**
- Por consumidor y por endpoint, no big bang. Ofrecer al equipo consumidor un diff claro de qué cambia para él (idealmente generado de la matriz de la fase 1).
- Telemetría: dashboard de tráfico por API (unificada vs A vs B) y por consumidor; deadlines acordados; headers `Deprecation`/`Sunset` en las viejas.
- Shadow traffic para validar equivalencia: duplicar una muestra de llamadas reales contra la fachada y comparar respuestas con la API original (con tolerancia a diferencias esperadas de la matriz). Esto caza discrepancias semánticas no documentadas antes de que muerdan.

**Fase 5 — Decomiso:** cuando el tráfico de A y B llega a cero (verificado, no asumido), apagar con brownout previo, devolver `410 Gone`, borrar código y datos duplicados. Si A y B tenían *bases de datos* separadas con datos solapados, hay un subproyecto de consolidación de datos (deduplicación, master data) que debe planificarse aparte — frecuentemente es más grande que el de la API.

**Riesgos:** discrepancias semánticas descubiertas tarde (mitigadas por la matriz + shadow traffic); el proyecto se eterniza con tres APIs vivas (mitigación: deadlines con sponsor ejecutivo, y que la fachada sea el único camino para features nuevas — las viejas se congelan desde el día uno); guerra política entre equipos (decisión de ownership explícita al inicio).

**Errores comunes:** empezar por el código en vez de por la semántica; "unificar" creando una tercera API sin plan de decomiso de las otras dos; big bang; no congelar las APIs viejas (siguen evolucionando y la migración persigue un blanco móvil).

**Qué espera oír el entrevistador:** la distinción sintáctico vs semántico, strangler fig con fachada nombrado y justificado, congelar las APIs legacy desde el día uno, shadow traffic para validar equivalencia, ownership único, y que el candidato reconozca la dimensión organizacional (dos equipos, una decisión) como parte del problema técnico.

## 8. Un cliente externo se integró a un campo interno no documentado (ley de Hyrum)
**Categoría:** Contratos implícitos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
La ley de Hyrum: con suficientes usuarios, todo comportamiento observable de tu API será dependido por alguien, esté documentado o no. Descubrimos que un cliente externo importante parsea un campo `_internal_score` que se filtró en el response. Opciones: mantenerlo (si el coste es bajo), formalizarlo en el contrato (si tiene valor legítimo), o negociar una deprecación con plazo. Nunca romperlo de golpe "porque no estaba documentado" si el cliente importa al negocio. Prevención: response filtering con allowlist derivada del contrato, para que lo no documentado sea también no observable.

### 📖 Respuesta detallada
**Qué es la ley de Hyrum:** "With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody." No aplica solo a campos: orden de elementos en listas, formato exacto de mensajes de error, timing, códigos de estado no especificados. El contrato *de facto* es todo lo observable; el contrato *escrito* es solo lo que prometes mantener. La gestión madura consiste en acercar ambos.

**Fase 1 — Evaluar la situación concreta:**
- ¿Cuántos clientes dependen del campo? (Telemetría si es posible; a veces solo sabes de uno porque abrió ticket al notar un cambio.)
- ¿Qué valor de negocio tiene ese cliente y qué usa exactamente del campo? Quizá solo necesita un derivado que sí podemos prometer.
- ¿Qué coste tiene mantener el campo? Si expone información sensible o acopla el exterior a un detalle de implementación que necesitamos cambiar (p. ej. un score de un modelo que vamos a reemplazar), el coste es alto.

**Fase 2 — Elegir entre tres opciones:**
1. **Mantenerlo tácitamente:** solo si el coste es ~cero y estable. Peligroso a largo plazo: la dependencia crece en silencio.
2. **Formalizarlo:** si el dato tiene valor legítimo, promoverlo al contrato con nombre y semántica bien diseñados (p. ej. exponer `risk_tier: "low|medium|high"` en lugar del float interno `_internal_score`), documentarlo, versionarlo, y deprecar la forma accidental. Es la opción ganadora cuando la necesidad del cliente es razonable: convierte deuda en producto.
3. **Deprecación negociada:** contactar al cliente, explicar que el campo es interno, ofrecer alternativa (la versión formalizada, u otro endpoint) y un plazo realista de migración con `Deprecation`/`Sunset`. Con clientes de pago, esto pasa por account management, no solo por un header. Romperlo unilateralmente "porque el contrato no lo incluía" es técnicamente defendible y comercialmente estúpido si el cliente es relevante.

**Fase 3 — Prevención (la parte sistémica):**
- **Response filtering por allowlist:** serializar *desde el contrato*, no desde el modelo interno. Un DTO explícito o un filtro que solo deja pasar campos declarados en el OpenAPI:

```java
// Anti-patrón: serializar la entidad JPA directamente (filtra todo)
return ResponseEntity.ok(customerEntity);
// Correcto: DTO explícito == contrato
return ResponseEntity.ok(CustomerResponse.from(customerEntity));
```
  Test de CI que compara las respuestas reales contra el schema con `additionalProperties: false` y falla si aparece un campo no declarado.
- **Hacer lo no prometido inobservable o inestable a propósito:** es la técnica de Go con `GODEBUG` y la aleatorización deliberada (Go randomiza el orden de iteración de maps, y ha llegado a aleatorizar detalles como el orden de headers precisamente para que nadie dependa de él). gRPC/Protobuf preserva campos *unknown* pero los mantiene fuera del API tipado, dejando claro qué es contrato y qué no. En REST puedo aplicar la misma idea: no garantizar orden de claves JSON, y no exponer jamás IDs internos secuenciales (la gente infiere volumen de negocio de ellos — también es ley de Hyrum).
- **Contratos explícitos con `additionalProperties` y campos `x-internal`** filtrados por el gateway antes de salir.

**Errores comunes:** romper el campo de golpe y escudarse en "no estaba documentado"; formalizar el campo tal cual (float interno) en vez de diseñar la abstracción correcta; no cerrar el grifo — resolver este caso y seguir serializando entidades internas en el resto de endpoints.

**Qué espera oír el entrevistador:** la ley de Hyrum enunciada correctamente y su implicación (contrato de facto = todo lo observable), las tres opciones con criterio de negocio, y prevención estructural: DTOs/allowlist desde el contrato, verificación en CI, y la idea de introducir variabilidad deliberada en lo no prometido, citando los ejemplos de Go o de los unknown fields de Protobuf.

## 9. Versionar una librería interna compartida por 30 servicios
**Categoría:** Dependencias y librerías compartidas · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
SemVer estricto y automatizado: los breaking changes solo en majors, releases generados por CI a partir de conventional commits, y una deprecation policy escrita (lo viejo convive marcado como deprecated al menos una major). El problema real no es publicar versiones sino que 30 servicios las adopten: Renovate/Dependabot para que los upgrades lleguen solos como PRs, política de "no quedarse más de N versiones atrás", y un BOM/platform para alinear versiones transitivas y evitar el diamond dependency. Y la pregunta incómoda que un senior debe hacer: ¿esto debería ser una librería, o es acoplamiento disfrazado?

### 📖 Respuesta detallada
**Fase 1 — Contrato de versionado (SemVer estricto):**
- MAJOR = breaking (firma eliminada, comportamiento cambiado, dependencia transitiva con breaking propio — esto último se olvida siempre: subir la major de Jackson dentro de mi librería *es* mi breaking change). MINOR = funcionalidad compatible. PATCH = fixes.
- Hacerlo verificable, no aspiracional: herramientas de API-diff en CI (`japicmp`/Revapi en JVM, `api-extractor` en TS, `cargo-semver-checks` en Rust) que fallan el build si el diff no coincide con el bump declarado.

**Fase 2 — Releases automatizados:** conventional commits (`feat:`, `fix:`, `feat!:`) + semantic-release o release-please: el CI calcula el bump, genera changelog y publica al registry interno. Elimina tanto el "big release trimestral" (que agrupa 5 breaking changes y hace el upgrade aterrador) como el olvido de publicar. Releases pequeños y frecuentes hacen upgrades pequeños y frecuentes.

**Fase 3 — Deprecation policy escrita:** un breaking change se introduce en dos tiempos: en la major N se añade la alternativa y se marca lo viejo con `@Deprecated(since="3.2", forRemoval=true)` + warning con instrucción de migración; se elimina como pronto en N+1. Publicar guías de migración por major. Regla de soporte: se soportan (fixes de seguridad) las últimas 2 majors — esto acota cuántas versiones viven en la flota.

**Fase 4 — Cadencia de adopción (el problema de verdad):**
- **Renovate/Dependabot** en los 30 repos: cada release llega como PR automático con changelog; con buena suite de tests, los patches/minors pueden auto-mergearse.
- Dashboard de dispersión: qué servicio usa qué versión. Política corporativa: nadie más de 2 minors o 1 major por detrás; el equipo owner de la librería puede reforzarlo (p. ej. las versiones fuera de soporte emiten warnings ruidosos o fallan un check de plataforma).
- Para majors dolorosos: el equipo de la librería ayuda activamente (codemods, scripts de migración, PRs preparados a los consumidores). El coste del upgrade lo paga en parte quien introduce el breaking — incentivo correcto para no romper a la ligera.

**Fase 5 — Diamond dependency y BOM:** el diamante clásico: el servicio S depende de `lib-common` y de `lib-auth`, y `lib-auth` depende de otra versión de `lib-common`; en JVM una gana silenciosamente y aparece `NoSuchMethodError` en runtime. Mitigaciones:
- **BOM/platform** (Maven BOM, Gradle platform, un lockfile centralizado) que fija versiones coherentes del ecosistema interno:

```xml
<dependencyManagement>
  <dependency>
    <groupId>com.acme</groupId>
    <artifactId>acme-bom</artifactId>
    <version>2026.08.1</version>
    <type>pom</type>
    <scope>import</scope>
  </dependency>
</dependencyManagement>
```
- Minimizar dependencias entre librerías internas (grafo plano, no árbol profundo); mantener compatibilidad binaria dentro de una major para que la resolución "gana la más nueva" sea segura.

**Fase 6 — Cuándo NO usar librería compartida:** una librería compartida es acoplamiento en tiempo de build: si contiene *lógica de negocio* que cambia a menudo, cada cambio exige redeploy de 30 servicios — has construido un monolito distribuido. Criterio: librerías para código estable y transversal (clientes HTTP generados, observabilidad, auth, serialización); para lógica de negocio compartida, mejor un servicio (se actualiza en un deploy) o duplicación asumida. Y modelos de dominio compartidos en librería suelen violar los bounded contexts.

**Errores comunes:** SemVer "de palabra" sin verificación; agrupar breaking changes en mega-releases; deprecar sin fecha ni alternativa; ignorar la dispersión de versiones hasta que un CVE obliga a actualizar 30 servicios atrasados de golpe; meter lógica de negocio caliente en la librería.

**Qué espera oír el entrevistador:** SemVer verificado con tooling (no prometido), releases automatizados, deprecation policy en dos majors, Renovate + política de frescura como mecanismo de adopción, diagnóstico del diamond dependency con BOM como respuesta, y el juicio arquitectónico de cuándo una librería compartida es el problema y no la solución.

## 10. Diseñar el proceso de governance de APIs para 50 equipos
**Categoría:** Governance y plataforma · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Governance que escala a 50 equipos es automatización con escape hatches, no un comité. Cuatro piezas: (1) API design guidelines escritas y versionadas, con decisiones cerradas (naming, paginación, errores RFC 9457, versionado); (2) enforcement automático en CI con linting (Spectral) y diff de contratos obligatorio que bloquea breaking changes no declarados; (3) catálogo central (Backstage) donde toda API tiene owner, spec, estado de ciclo de vida y consumidores; (4) revisión humana ligera solo para lo que el linter no ve (semántica, diseño de recursos), como consultoría temprana y no como gate final. Más deprecation policy corporativa y métricas para saber si funciona.

### 📖 Respuesta detallada
**Fase 1 — Guidelines:** un documento vivo en un repo (estilo las guías de Zalando o Google AIP), con decisiones *cerradas* para que los equipos no re-litiguen lo mismo: convenciones de naming y pluralización, paginación por cursor, formato de errores (RFC 9457 Problem Details), esquema de versionado (p. ej. versión en URL solo para majors, con expand/contract como vía preferente), autenticación, idempotencia. Cada regla con su porqué y ejemplos correcto/incorrecto. Gobernado por un grupo de API guild con RFCs abiertos a todos — las guidelines evolucionan, pero por proceso.

**Fase 2 — Enforcement automático (el corazón):**
- **Linting con Spectral en CI**, con ruleset propio que codifica las guidelines:

```yaml
# .spectral.yaml
extends: ["spectral:oas"]
rules:
  paths-kebab-case:
    given: "$.paths[*]~"
    then: { function: pattern, functionOptions: { match: "^(/[a-z0-9-{}]+)+$" } }
  error-uses-problem-json:
    given: "$.paths[*][*].responses[?(@property >= '400')].content"
    then: { field: "application/problem+json", function: truthy }
```
  Severidades: `error` bloquea el merge, `warn` educa. Las APIs existentes entran con baseline (solo se lintan los cambios) para no exigir big-bang.
- **Diff de contratos obligatorio:** todo cambio de spec pasa por `oasdiff` (y `buf breaking` para gRPC/eventos): un breaking change no declarado bloquea el pipeline; uno declarado exige el proceso de deprecación (nueva versión + plan de sunset). Esto convierte la regla más importante — no romper consumidores — en un check de CI, no en una esperanza.

**Fase 3 — Catálogo/registry (Backstage):** toda API registrada con: spec OpenAPI/proto, equipo owner (obligatorio — API sin owner es incidente esperando fecha), estado de ciclo de vida (experimental/stable/deprecated/retired), consumidores conocidos y docs. El catálogo se alimenta del CI (la spec publicada es la desplegada, no una copia manual desactualizada). Valor: descubrimiento (evita APIs duplicadas como las del caso 7), impacto de cambios (a quién aviso), y datos para la deprecación.

**Fase 4 — Revisión humana ligera, no comité:** un comité central que aprueba cada API con 50 equipos se convierte en cuello de botella de semanas y en teatro de governance. En su lugar: (a) revisión *temprana* opcional-pero-recomendada del diseño (30 min con un API coach de la guild cuando el equipo tiene el borrador de spec — barata de cambiar entonces, carísima después); (b) revisión obligatoria solo para APIs *públicas/partner* o cambios de deprecación; (c) el resto se confía al linter + peer review normal del equipo. Federar: cada tribu tiene 1–2 API champions formados por la guild.

**Fase 5 — Deprecation policy corporativa:** plazos mínimos por tipo de consumidor (interno 3 meses, partner 6–12), señalización estándar (`Deprecation`/`Sunset` headers, estado en el catálogo), proceso de excepción documentado. Sin política común, cada deprecación es una negociación desde cero.

**Fase 6 — Métricas del propio governance:** % de APIs en catálogo con owner y spec viva; % de pipelines con lint+diff activos; incidentes causados por breaking changes (la métrica de resultado); tiempo de review; distribución de severidades de lint (¿las reglas educan o solo molestan?); APIs deprecadas que superan su fecha de sunset. Si los equipos hacen bypass del proceso, el proceso es el bug: iterarlo.

**Errores comunes:** comité aprobador central (cuello de botella y resentimiento); guidelines sin enforcement (decoración); enforcement sin baseline que castiga a las APIs legacy y genera rechazo; catálogo alimentado a mano (muere en 3 meses); medir cumplimiento del proceso pero no resultados (incidentes evitados).

**Qué espera oír el entrevistador:** la tesis "automatiza lo objetivo, revisa humanamente solo lo semántico y hazlo temprano", Spectral y diff de contratos como gates concretos de CI, catálogo con ownership obligatorio alimentado desde CI, modelo federado con guild/champions en vez de comité, deprecation policy uniforme, y métricas de resultado para iterar el proceso.