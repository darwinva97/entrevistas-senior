# Módulo 5 · Fiabilidad, costos y operación

> **Curso 04 · Cloud** · 120 min

## Por qué esto importa en la entrevista

A partir de cierto nivel, las preguntas dejan de ser técnicas puras y pasan a ser de **criterio de negocio**: cuánto cuesta, cuánto tardamos en recuperarnos, qué pasa si se cae una zona. Un senior que solo habla de tecnología pierde frente a uno que traduce decisiones a dinero y a riesgo.

## Disponibilidad: qué significan los nueves

| SLA | Indisponibilidad al mes | Qué implica |
|---|---|---|
| 99% | 7,2 h | un servicio interno tolerante |
| 99,9% | 43 min | despliegues sin downtime, multi-AZ |
| 99,95% | 22 min | + failover automático probado |
| 99,99% | 4,3 min | multi-región activo/activo, sin intervención humana en el camino |

Dos ideas para exponer:

1. **La disponibilidad en serie se multiplica** (ver [curso 00 módulo 1](../00-fundamentos-distribuidos/01-modelo-mental.md)): tu SLA no puede superar el producto de tus dependencias críticas, incluidas las gestionadas.
2. **Cada nueve multiplica el coste y la complejidad.** La respuesta senior a "queremos 99,99%" es *"¿cuánto cuesta un minuto de caída? Con eso decidimos si compensa; y antes de multi-región, aprovechemos lo barato: multi-AZ, despliegues sin downtime, degradación funcional y buenos timeouts"*.

## Multi-AZ, multi-región y DR

- **Multi-AZ:** obligatorio y barato. Réplica síncrona de BD, réplicas repartidas por zonas, balanceador con health checks. Prueba real: apaga una zona (o simúlalo) y mira qué se rompe.
- **Multi-región activo/pasivo:** replicación asíncrona, DNS/Global LB para el failover, y **el problema difícil es el estado** (RPO > 0) y el *split brain* al volver.
- **Multi-región activo/activo:** requiere resolver escrituras concurrentes (particionar por región, CRDTs, o una BD global tipo Spanner/Cosmos con su coste). Solo con requisito de negocio serio.

**RTO/RPO son la conversación correcta:**

```
RPO = cuántos datos puedo perder    (define la estrategia de backup/replicación)
RTO = cuánto puedo tardar en volver (define la estrategia de failover)
```

Cuatro estrategias, de barata a cara: *backup & restore* (RTO horas) → *pilot light* (mínimo encendido) → *warm standby* (réplica reducida) → *hot standby / activo-activo* (RTO ~0).

**La frase que demuestra experiencia:** *"un plan de DR que no se ha ejecutado nunca no es un plan, es un documento. Nosotros hacíamos un simulacro trimestral y medíamos el RTO real."*

## Costos: dónde está el dinero de verdad

Los cinco sospechosos habituales, en orden de sorpresa:

1. **Egress y tráfico entre zonas/regiones.** Un patrón chatty entre AZ o un servicio que devuelve JSON gigantes puede costar más que el cómputo.
2. **NAT Gateway** (AWS): coste por hora + por GB procesado. Los VPC endpoints suelen pagarse solos.
3. **Recursos ociosos:** entornos de desarrollo encendidos 24/7, volúmenes huérfanos, snapshots viejos, IPs elásticas sin usar, clústeres de pruebas.
4. **Sobredimensionado:** instancias elegidas "por si acaso", requests de CPU inflados que impiden empaquetar pods.
5. **Logs y observabilidad:** ingestar todo a nivel DEBUG con retención de un año es una factura enorme; muestreo, niveles y retención por tipo.

**Palancas que debes nombrar:** compromiso de uso (Savings Plans / CUD / Reservas) para la base estable, spot/preemptible para trabajo tolerante a interrupciones (con `PodDisruptionBudget` y drenaje), autoescalado y apagado nocturno de no-productivos, clases de almacenamiento con ciclo de vida, right-sizing con datos reales, y **etiquetado (tagging) obligatorio** para poder atribuir el gasto por equipo/producto. Sin atribución no hay FinOps: es la primera medida, no la última.

**💬 Cómo lo dices:** *"Antes de optimizar, atribuyo: etiquetas por servicio y equipo, y un informe semanal. Casi siempre el 80% del gasto está en 3 líneas, y suelen ser datos, egress y entornos ociosos, no el cómputo del que todos hablan."*

## Límites y cuotas: el incidente que nadie ve venir

Cada servicio gestionado tiene límites (concurrencia de funciones, throughput de una partición, conexiones de una BD, rate de la API del proveedor, IPs por subred). Los incidentes por cuota son especialmente traicioneros porque **aparecen justo cuando el negocio va bien**.

Qué debes decir: inventariar los límites relevantes, **monitorizarlos como métricas** (uso vs cuota, con alerta al 70–80%), pedir aumentos con antelación (tienen tiempo de tramitación), y diseñar con *backoff* ante `429/ThrottlingException` en lugar de reintentar en bucle.

## Operación: lo que hace que un equipo duerma

- **Despliegues progresivos** (canary con métricas automáticas) y **rollback en un clic**; el mejor plan de recuperación es volver atrás rápido.
- **Feature flags** para separar despliegue de activación: permite apagar sin desplegar (y es la respuesta correcta a muchos incidentes).
- **Runbooks** por alerta: qué significa, qué mirar, qué hacer. Una alerta sin runbook es una alerta que alguien va a ignorar.
- **Guardias sostenibles:** si el equipo recibe 20 alertas por noche, el problema no es el equipo.
- **Postmortems sin culpa** con acciones concretas y dueño (ver [curso 00 módulo 6](../00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)).
- **Presupuesto de error** como criterio para frenar features cuando la fiabilidad se degrada.

## Errores comunes que delatan a un no-senior

- Prometer 99,99% sin analizar dependencias ni coste.
- Plan de DR nunca ensayado.
- Hablar de ahorro sin haber medido de dónde viene el gasto.
- Ignorar cuotas y límites hasta que explotan.
- Alertas sobre causas y sin runbook.
- No tener rollback probado.

## 🧪 Laboratorio

1. **Calcula tu SLA compuesto:** lista las dependencias críticas de un servicio real (BD, cola, proveedor de pagos, DNS, auth) con su SLA publicado, multiplícalos y compáralo con lo que prometéis.
2. **Simulacro de DR:** en un entorno de pruebas, borra la base de datos y restaura desde backup. Cronometra: ese es tu RTO real. Anota qué faltó en el procedimiento.
3. **Auditoría de coste:** exporta la factura del último mes por servicio y etiqueta. Identifica el 20% que causa el 80% y escribe tres acciones con ahorro estimado.
4. **Prueba de zona caída:** cordonea todos los nodos de una AZ (o apaga las instancias de una zona en pruebas) y observa qué se rompe. Anota cuánto tardó en recuperarse solo.
5. **Cuotas:** inventaria 5 límites que te afectan, monitorízalos y ponles alerta al 75%.

## ✅ Autoevaluación

1. ¿Qué significa 99,9% en minutos y qué exige de tu arquitectura?
2. Explica RTO y RPO y las cuatro estrategias de DR con su coste relativo.
3. ¿Cuáles son los cinco sumideros de gasto habituales?
4. ¿Cómo justificas ante negocio no ir a multi-región?
5. ¿Cómo evitas un incidente por cuota del proveedor?
6. ¿Qué contiene un buen runbook y por qué toda alerta necesita uno?

## 🎯 Preguntas del banco que ya puedes responder

- [`cloud/aws/03-casos-y-problemas.md`](../../cloud/aws/03-casos-y-problemas.md) — casos de coste, límites y fiabilidad
- [`cloud/azure/02-microservicios-y-casos.md`](../../cloud/azure/02-microservicios-y-casos.md) y [`cloud/gcp/02-microservicios-y-casos.md`](../../cloud/gcp/02-microservicios-y-casos.md) — FinOps y operación
- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — todos, desde la perspectiva de operación

---

**Anterior:** [Módulo 4](04-kubernetes.md) · **Fin del curso 04.**
