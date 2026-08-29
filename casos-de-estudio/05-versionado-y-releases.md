# Casos de estudio: Versionado, Releases y Gestión del Cambio (nivel senior)

Casos sobre estrategia de branching, release management, hotfixes, rollbacks, versionado de servicios/eventos/BD y organización de repositorios en empresas con muchos equipos. Cada caso incluye el enunciado del entrevistador, una respuesta resumen y una respuesta detallada con opciones, trade-offs, comandos concretos y lo que un entrevistador senior espera oír.

---

## 1. Diseña la estrategia de branching para 10 equipos sobre 40 microservicios
**Categoría:** Branching / Delivery · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"Acabas de entrar como staff engineer en una empresa con 10 equipos y ~40 microservicios. Hoy cada equipo hace lo que quiere: tres usan GitFlow completo con ramas `develop`, `release/*` y `hotfix/*`, otros usan GitHub Flow, y dos tienen ramas de feature que llevan seis semanas abiertas. Los merges son dolorosos, los releases se retrasan y nadie sabe qué hay en producción. Te piden proponer **una** estrategia de branching para toda la organización. ¿Qué propones y cómo la justificas?"

### 📝 Respuesta resumen
**Trunk-based development** como estándar organizacional: ramas de vida corta (< 2-3 días) que se integran a `main` vía PR con CI obligatoria, `main` siempre desplegable, y **feature flags** para desacoplar *deploy* de *release* en trabajo incompleto. GitFlow se descarta explícitamente: su rama `develop` y sus ramas de release largas están diseñadas para software con versiones empaquetadas, no para servicios con continuous delivery, y en 40 microservicios multiplica el coste de integración por 40. Ramas `release/*` solo en el caso excepcional de artefactos con versiones soportadas en paralelo (SDKs, agentes on-prem). El éxito se mide con **métricas DORA** (deployment frequency, lead time, change failure rate, MTTR), no con opiniones.

### 📖 Respuesta detallada

**Aclaración de requisitos (preguntas que haría):**
- ¿Todos los artefactos son servicios desplegados por nosotros, o hay librerías/SDKs/agentes que los clientes instalan? La respuesta cambia si necesitamos ramas de release en algún repo.
- ¿Hay continuous deployment real (merge → prod automático) o hay aprobaciones manuales/ventanas? Trunk-based funciona en ambos, pero el diseño de flags cambia.
- ¿Cuál es la madurez de tests? Trunk-based sin una CI en la que confíes es integrar basura más rápido.
- ¿Cuánta fricción política hay? Estandarizar branching es 20% técnica y 80% gestión del cambio.

**Las tres opciones sobre la mesa:**

*GitFlow.* Diseñado (Driessen, 2010) para software con releases versionados y varias versiones en soporte. Con CD introduce: (1) una rama `develop` que es un entorno de integración fantasma — lo que pruebas en `develop` no es lo que va a prod hasta un merge grande y arriesgado a `main`; (2) ramas de release de días/semanas con doble merge (`release → main` y `release → develop`), conflictos y olvidos sistemáticos; (3) hotfixes con coreografía de tres merges. El propio Driessen recomendó en 2020 **no** usarlo para aplicaciones web con delivery continuo. Con 40 repos, ese overhead se paga 40 veces. Descartado como estándar.

*GitHub Flow.* Ramas cortas desde `main`, PR, merge, deploy. Es esencialmente trunk-based con PRs; válido, pero no dice nada sobre trabajo incompleto (de ahí las ramas de 6 semanas que ya tienen) ni sobre versiones soportadas.

*Trunk-based development.* Todo el mundo integra a `main` con frecuencia (idealmente a diario), `main` siempre verde y desplegable, y el trabajo que no está listo para usuarios se **despliega apagado tras un feature flag**. Es la práctica correlacionada con alto rendimiento en los informes DORA/Accelerate año tras año. Elegido.

**Por qué las ramas largas son el enemigo (el argumento central):** el coste de un merge crece de forma superlineal con la divergencia. Una rama de 6 semanas no es "una feature grande", es una **integración diferida**: todos los conflictos y sorpresas que evitaste te esperan juntos al final, cuando el contexto se ha perdido; y mientras tanto el trabajo es invisible para los demás. La alternativa no es "features más pequeñas" (a veces no se puede), es **integración continua de trabajo incompleto**: branch by abstraction, keystone interfaces (la UI que activa la feature se añade al final) y feature flags. El flag sustituye a la rama larga: el código está en `main` y en producción, pero apagado.

**Reglas concretas que propondría (la política, en una página):**
1. Una rama por cambio, creada desde `main`, vida objetivo < 2-3 días: `git switch -c feat/checkout-express main`.
2. PR con CI obligatoria (tests + build + lint) y al menos una revisión; merge con squash o rebase para historia lineal — elegir uno y estandarizarlo:
   ```bash
   git fetch origin && git rebase origin/main   # el autor resuelve conflictos, no el que mergea
   ```
3. `main` protegida: sin pushes directos, sin merge con CI en rojo (`branch protection rules` + `required status checks`).
4. Todo deploy sale de `main` y se etiqueta: `git tag -a v2026.08.28-1 -m "deploy" && git push origin --tags` (o el SHA como identidad del release, ver caso 10).
5. Trabajo > 3 días → feature flag o branch by abstraction, no rama larga. El flag tiene dueño y fecha de borrado (los flags zombis son deuda, ver riesgos).
6. Rollback = redeploy del tag anterior o `git revert` (merge commit: `git revert -m 1 <sha>`), nunca `push --force` a `main`.

**¿Y las ramas de release?** Solo si un repo produce artefactos con **versiones soportadas en paralelo** (un SDK público, un agente que los clientes actualizan cuando quieren). Ahí sí: se corta `release/2.x` desde `main` al liberar, y los fixes se hacen **en `main` primero y se cherry-pickean hacia atrás** (`git cherry-pick -x <sha>`), nunca al revés — "fix forward, port backward" evita que un fix viva solo en una rama vieja y se pierda en la 3.0. Para los ~38 servicios web, ramas de release = cero.

**Cómo la implanto (gestión del cambio):** no por decreto. (1) Medir la línea base DORA por equipo. (2) Pilotar con 2 equipos voluntarios, uno de los que sufren GitFlow. (3) Publicar la política + tooling común (plantillas de CI, un sistema de flags compartido — LaunchDarkly, Unleash, ConfigCat; no que cada equipo se haga el suyo). (4) Revisar métricas a los 2-3 meses y extender. La conversación "GitFlow vs trunk" se gana con la gráfica de lead time, no con el blog de Driessen.

**Riesgos y mitigaciones:**
- *CI lenta o flaky* → trunk-based colapsa. Invertir primero en CI < 10-15 min y en cuarentena de tests flaky.
- *Flags que nunca se borran* → registro central de flags con owner y expiry; alerta/lint cuando un flag supera su fecha.
- *Equipos que "no pueden" trocear* → pairing con un equipo que ya lo hace; casi siempre es un problema de diseño (falta de seams), no del dominio.
- *Cargo cult:* prohibir ramas largas sin dar flags ni branch-by-abstraction solo genera ramas largas clandestinas.

**Qué espera oír el entrevistador:** GitFlow descartado con argumentos (develop como entorno fantasma, doble merge, otro modelo de release), no por moda; flags como el mecanismo que hace posible el trunk-based (deploy ≠ release); la excepción honesta de ramas de release para artefactos versionados con cherry-pick hacia atrás; DORA como criterio medible; y que implantar la política es un problema socio-técnico con pilotos y métricas, no un email.

---

## 2. Hotfix urgente con main 30 commits por delante
**Categoría:** Hotfix / Incident response · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"Producción tiene un bug crítico: el checkout falla para usuarios con cupones. El fix es una línea. El problema: producción corre un deploy de hace 9 días y `main` está **30 commits por delante**, incluyendo dos features a medias que no queremos soltar todavía y un cambio de esquema sin probar. Son las 15:00 de un viernes. ¿Cómo sacas el fix a producción, qué opciones tienes y qué haces la semana siguiente para que esto no vuelva a pasar?"

### 📝 Respuesta resumen
Primero **diagnóstico de la brecha**: identificar el commit exacto en prod (tag/SHA del deploy) y listar qué hay entre medias (`git log --oneline PROD_SHA..main`). Opciones por orden de preferencia según contexto: (1) si el bug lo introdujo un commit reciente y prod lo contiene, quizá basta un **kill-switch/flag** o un **revert**; (2) si hay que sacar código nuevo, **rama de hotfix cortada desde el SHA de producción** + cherry-pick o commit del fix + deploy de esa rama + merge del fix de vuelta a `main`. "Congelar main y deployar main entero" es la peor opción: convierte un fix de una línea en un release de 30 commits no validados un viernes. La prevención real es cerrar la brecha: deploys pequeños y frecuentes para que prod y `main` nunca estén a 9 días de distancia.

### 📖 Respuesta detallada

**Paso 0 — saber qué corre en prod y qué hay en medio.** Sin esto, todo es adivinar:
```bash
# ¿Qué SHA corre en prod? (endpoint /version, tag del deploy, o el registry de imágenes)
git fetch --tags
git log --oneline --no-merges v2026.08.19-3..main     # los 30 commits de la brecha
git log --oneline v2026.08.19-3..main -- db/migrations/   # ¿hay migraciones en medio? CRÍTICO
git branch -a --contains <sha_del_fix_si_ya_existe>
```
La pregunta de las migraciones es la que separa un hotfix trivial de uno peligroso: si entre prod y el fix hay cambios de esquema, cualquier estrategia que arrastre esos commits arrastra la migración (ver caso 3).

**Opción A — ¿de verdad hace falta deployar? Flag o revert primero.** Si el cambio culpable está en prod tras un flag → **apagar el flag** (segundos, sin deploy, reversible). Si no hay flag pero el commit culpable es identificable y autocontenido → `git revert <sha>` sobre la rama de prod y deployar el revert: riesgo mínimo. El mejor hotfix es el que no requiere deploy. Aquí el fix es código nuevo, así que:

**Opción B (la recomendada aquí) — rama de hotfix desde el SHA de producción:**
```bash
git switch -c hotfix/coupon-checkout v2026.08.19-3   # cortar EXACTAMENTE desde lo que corre en prod
# aplicar el fix: o bien escribirlo directamente, o si ya está commiteado en main:
git cherry-pick -x <sha_del_fix>                     # -x deja rastro del origen
# CI completa sobre la rama (no saltarse tests "porque es una línea")
git tag -a v2026.08.19-3-hotfix.1 -m "fix cupones checkout"
git push origin hotfix/coupon-checkout --tags
# deploy del tag → verificar en prod con el caso que fallaba
```
Lo que se despliega es *prod + una línea*: delta mínimo y auditable. Después, **el fix vuelve a `main` inmediatamente** (si nació en `main` y se cherry-pickeó, ya está; si nació en la rama, `git switch main && git cherry-pick -x <sha>`). El error clásico es olvidar este paso: el siguiente deploy normal de `main` **reintroduce el bug**. Un test que cubra el bug, commiteado junto al fix, es el cinturón de seguridad.

**Opción C — deployar `main` entero.** Solo si la brecha es pequeña, sin migraciones, y las features a medias están tras flags apagados. Con dos features *sin* flags y un esquema sin probar, un viernes a las 15:00, es apostar la tarde a que 30 commits ajenos no rompen nada. Descartada aquí — pero es la respuesta correcta en una organización sana, y ese es justamente el punto de la prevención.

**Opción D — "congelar main hasta que saquemos el fix".** La peor: castiga a 10 equipos por un problema de proceso, incentiva ramas locales largas (el trabajo no se detiene, solo se esconde) y no acelera nada — el fix no sale más rápido porque otros no mergeen. Los code freezes generalizados son casi siempre teatro de control.

**Riesgos del camino elegido:**
- El cherry-pick aplica limpio pero **el contexto cambió**: la línea compila contra prod pero su suposición puede vivir en los 30 commits. Por eso CI completa + verificación manual del caso real en prod.
- El tag de hotfix debe registrarse como "lo que corre en prod" (deploy tracking, caso 10).
- Doble deploy en vuelo: pausar el auto-deploy de ese servicio durante la ventana para que un merge a `main` no pise el hotfix — no "congelar main".

**La semana siguiente — prevención (esto distingue al senior):** el incidente real no es el bug, es la **brecha de 9 días y 30 commits**. Acciones: (1) subir la frecuencia de deploy — con deploys diarios la brecha máxima es ~3 commits, "deployar main" es la opción por defecto y el caso entero desaparece; (2) features a medias siempre tras flags → la opción A se vuelve viable; (3) visibilidad automática de la brecha: dashboard "prod vs main: N commits, M días, migraciones: sí/no"; (4) postmortem sin culpas sobre por qué se acumularon 9 días (¿miedo a deployar? ¿CI lenta? ¿ventanas?). Tratar la causa, no ensayar mejores hotfixes.

**Qué espera oír el entrevistador:** diagnosticar la brecha con `git log` y tags antes de decidir; la escalera flag → revert → hotfix branch → main entero con criterios; cortar la rama **desde el SHA de prod**; el cherry-pick de vuelta y el test de regresión; "congelar main" como anti-patrón; y que la solución de fondo es cadencia de deploy, no destreza haciendo hotfixes.

---

## 3. El rollback que no se puede hacer: la migración de BD ya corrió
**Categoría:** Migraciones / Rollback · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"Desplegasteis la versión 47 del servicio de pedidos. El deploy incluía una migración que **renombró la columna `status` a `order_status`** y el código nuevo la usa. A los 20 minutos, el error rate se dispara por un bug sin relación con la migración. El runbook dice 'rollback a v46', pero v46 lee `status`, que **ya no existe**. El rollback rompería más de lo que arregla. Son las 2 AM. ¿Qué haces ahora y cómo rediseñas el proceso para que un rollback nunca vuelva a estar bloqueado por el esquema?"

### 📝 Respuesta resumen
Ahora mismo: **roll-forward** — no existe rollback seguro, así que se estabiliza (¿flag? ¿revert del commit del bug sobre v47 y deploy de v47.1?) en lugar de forzar un rollback que causaría un segundo incidente. Alternativa de emergencia si v47 es insostenible: restaurar la compatibilidad del esquema (recrear `status` como columna generada/vista o deshacer el rename) y entonces bajar a v46. El rediseño: **toda migración debe ser backward-compatible con la versión N-1 del código** — patrón **expand–contract** (añadir columna nueva, doble escritura/lectura, backfill, y solo contraer releases después), **separar el deploy de la migración** (la migración se despliega y corre antes, como paso propio), y tratar "v46 debe poder correr contra el esquema de v47" como invariante verificado en CI, con ensayos de rollback reales.

### 📖 Respuesta detallada

**Las 2 AM — árbol de decisión:**
1. ¿El bug tiene kill-switch/flag? → apagarlo. Fin del incidente, el resto es para mañana.
2. ¿El commit del bug es identificable? → `git revert <sha>` sobre v47, tag `v47.1`, deploy. Esto es roll-forward con riesgo mínimo: es v47 (que ya corre contra el esquema nuevo) menos el bug. Casi siempre la mejor jugada aquí.
3. ¿V47 es insostenible y el fix no es obvio? → reparar el esquema para reabrir el rollback: `ALTER TABLE orders RENAME COLUMN order_status TO status` deshace el rename (solo metadata en PostgreSQL)… pero **rompe v47 que sigue corriendo** → coordinar: escalar v46 a la vez, o compatibilidad bidireccional temporal (vista o columna generada `status` reflejando `order_status`). Cirugía a las 2 AM: posible, pero exactamente lo que el proceso debe evitar.
4. Lo que **no** se hace: `migrate down` a ciegas. Los down-scripts casi nunca se prueban, y un down que toca datos (no solo esquema) puede destruir lo escrito en los últimos 20 minutos. Un down-script no ensayado es un generador de segundo incidente.

Nota honesta: aquí el rename fue "afortunado" — reversible sin pérdida. Con una migración destructiva (drop, cambio de tipo con pérdida) la opción 3 no existiría y roll-forward sería el único camino. Por eso el proceso importa más que la heroicidad.

**El rediseño — tres reglas y su porqué:**

*Regla 1: expand–contract (parallel change) para todo cambio de esquema.* Un rename se convierte en una secuencia de pasos, cada uno compatible con el código anterior y el siguiente:
1. **Expand** (migración 1): `ALTER TABLE orders ADD COLUMN order_status ...`. v46 la ignora; inocuo.
2. Release v47: **escribe en ambas** columnas, lee de la vieja (o de la nueva con fallback).
3. **Backfill** por lotes de las filas antiguas (job aparte, throttled, no un `UPDATE` gigante que tome locks).
4. Release v48: lee y escribe solo `order_status` (la vieja aún existe, ignorada).
5. **Contract** (migración 2, releases después, sin prisa): `ALTER TABLE orders DROP COLUMN status`.
En cada punto, la versión N-1 del código funciona contra el esquema actual → **el rollback de código siempre es posible**. El coste es real: un rename pasa de 1 paso a 5 repartidos en semanas. Es el precio de tener rollback, y se paga con gusto a las 2 AM.

*Regla 2: separar deploy de migración.* La migración no corre "dentro" del deploy del binario: es un paso previo y explícito del pipeline. Si falla, no hay binario a medio desplegar; durante un rolling deploy conviven v46 y v47 contra el mismo esquema (con la regla 1, ambas funcionan); y el rollback de código deja de implicar rollback de esquema. Corolario: **el esquema solo avanza** (roll-forward de BD); los down-scripts son para desarrollo local, no un plan de producción.

*Regla 3: el invariante N-1, verificado, no declarado.* "La versión anterior debe funcionar contra el esquema nuevo" se comprueba en CI: un job aplica las migraciones nuevas y ejecuta la suite de tests **del tag actualmente en producción** contra ese esquema. Añadir un linter de migraciones que bloquee operaciones prohibidas en un solo paso (`DROP COLUMN`, `RENAME`, `NOT NULL` sin default, cambios de tipo) — squawk o reglas propias. Y **ensayos**: un game day trimestral con rollback real en staging; un rollback que nunca se ha ejecutado es un rumor, no un plan.

**Riesgos del nuevo proceso:** la doble escritura puede divergir → checks de consistencia durante la transición; los contracts se olvidan → registrar cada expand con su contract pendiente y fecha (deuda con vencimiento, como los flags); los backfills masivos saturan la BD → lotes, `statement_timeout` bajo, y en tablas gigantes técnicas online (`gh-ost`/`pt-online-schema-change` en MySQL; en PostgreSQL cuidar locks de `ALTER` y `CONCURRENTLY` para índices).

**Qué espera oír el entrevistador:** a las 2 AM no forzar el rollback roto sino evaluar roll-forward (revert del bug sobre v47) primero; desconfianza en down-scripts no ensayados; expand–contract paso a paso con la convivencia N/N-1 en rolling deploys como motivación; migración separada del deploy; el invariante N-1 verificado en CI y ensayado; y la madurez de decir que roll-forward es el plan *real*, con el rollback como opción que hay que **ganarse** con disciplina de esquema.

---

## 4. Release train vs continuous deployment para una plataforma B2B
**Categoría:** Release management / Cadencia · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"Vendemos una plataforma SaaS B2B a bancos y aseguradoras. Ingeniería quiere continuous deployment; los clientes grandes exigen lo contrario: 'no queremos cambios sin avisar', algunos piden ventanas de cambio trimestrales y uno amenaza con exigir contractualmente aprobar cada release. Hoy la solución es deployar poco (una vez al mes) y aún así cada release genera tickets. ¿Cómo diseñas la estrategia de releases que satisfaga a ambos mundos?"

### 📝 Respuesta resumen
Separar las tres cosas que el cliente confunde: **deploy** (mover binarios), **release** (activar comportamiento) y **cambio percibido** (lo que altera su operación). Ingeniería hace continuous deployment del binario; el comportamiento nuevo se activa con **flags por tenant**, agrupado para clientes conservadores en un **release train** con calendario público (p. ej. mensual) y despliegue por **anillos** (interno → early adopters → general → conservadores). Changelogs por tenant generados desde los flags que se le activaron. Y la lectura senior: si cada release genera tickets, el miedo del cliente es un **problema de calidad**, no de cadencia — deployar menos lo empeora (lotes más grandes, más riesgo por release); la solución es lotes pequeños más flags, no trimestres.

### 📖 Respuesta detallada

**El diagnóstico primero (esto es lo que el entrevistador puntúa):** "una vez al mes y aún así cada release genera tickets" es el dato clave. La frecuencia baja no protege a los clientes; *concentra* el riesgo: releases de un mes son grandes, difíciles de probar, imposibles de bisecar, con rollbacks que arrastran 30 features. La evidencia DORA es la contraria a la intuición del cliente: quien despliega más a menudo tiene **menor** change failure rate, porque el tamaño del lote es el driver del riesgo. Ceder a "trimestral" multiplicaría el problema por tres. Pero decirle eso al banco no basta: hay que darle lo que de verdad pide, que no es "pocos deploys" sino **previsibilidad, aviso y control sobre su operación**.

**El diseño — tres capas:**

*Capa 1: continuous deployment técnico, invisible.* El binario se despliega a diario/semanal con cambios apagados por defecto para tenants conservadores. Los deploys internos (refactors, seguridad, performance, bugfixes) fluyen para todos: un banco no quiere aprobar tu upgrade de OpenSSL, quiere que esté hecho. Exige la disciplina del caso 3 (expand–contract) y flags con targeting por tenant.

*Capa 2: release trains para el comportamiento visible.* Un tren con calendario fijo y público — "release funcional el primer martes de cada mes" — que agrupa la **activación** de features por anillo. La metáfora se comunica al cliente: el tren **sale siempre en su fecha; lo que no está listo espera al siguiente** — nunca se retrasa por una feature, porque un tren que espera acumula presión para meter cosas a medias. Anillos (rings):
  - Anillo 0: entornos internos y dogfooding (continuo).
  - Anillo 1: tenants early-adopter (a menudo con descuento o cláusula beta) — 1-2 semanas antes del tren general.
  - Anillo 2: general.
  - Anillo 3: conservadores/regulados — reciben el tren N cuando el anillo 2 lleva 2-4 semanas con él sin incidencias.
La progresión entre anillos tiene criterios de salida objetivos (error rate, tickets, métricas de la feature), no solo calendario.

*Capa 3: comunicación como producto.* Release notes **por tenant**, generadas desde el registro de flags: "en su entorno, el 2026-09-01 se activan X e Y" — no un changelog global donde el 80% no le aplica. Aviso con antelación contractual (30 días para cambios visibles; los de seguridad urgentes tienen otra vía). Un portal donde el cliente ve qué versión funcional tiene y qué viene en el próximo tren. Buena parte de los tickets post-release B2B no son bugs: son sorpresa ("¿por qué cambió esta pantalla?"), y la sorpresa se cura con comunicación, no con cadencia.

**El cliente que exige aprobar cada release:** ni ceder ("aprobación de cada deploy" es inviable y contamina a toda la base de clientes) ni el "no" seco. Se le ofrece el anillo conservador + ventana de activación acordada + compromiso de estabilidad ("cuando llega a su anillo, lleva N semanas en producción con M tenants"). Si contractualmente exige más, el precio es explícito: entorno dedicado (single-tenant) con su propio calendario, a coste premium. Eso convierte una exigencia vaga en una decisión económica — casi siempre elige el anillo.

**Trade-offs que reconozco:**
- Flags por tenant × features en vuelo = matriz que QA no puede cubrir exhaustivamente → limitar features simultáneas por área, testear con los perfiles de flags de cada anillo (no combinaciones arbitrarias), y expirar flags agresivamente tras el tren.
- Dos "versiones funcionales" conviviendo (anillo 2 vs 3) = soportar dos comportamientos → acotar a máx. un tren de distancia entre anillos.
- El tren añade latencia para clientes conservadores → correcto y deseado; es la mercancía que compran.
- Coste de tooling (flags con targeting, changelogs, portal): se justifica frente al coste actual — tickets, el release mensual doloroso, la amenaza contractual.

**Riesgos:** mezclar release flags con entitlements de facturación (separarlos: ciclos de vida distintos); el anillo 1 sin volumen para detectar problemas (reclutar early adopters con incentivos); y el orgullo de "CD puro" — el tren no es una derrota, es CD con activación gestionada.

**Qué espera oír el entrevistador:** la separación deploy/release/cambio percibido; que "release mensual con tickets" indica que la baja frecuencia *causa* parte del problema (batch size); trains con fecha fija y features que esperan; anillos con criterios de salida; changelog por tenant desde los flags; el manejo comercial del cliente intransigente; y la honestidad sobre el coste de la matriz de flags.

---

## 5. Versionar microservicios: ¿semver de servicios sirve de algo?
**Categoría:** Versionado / Contratos · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"En la última retro alguien propuso: 'deberíamos versionar todos los microservicios con semver, y que el servicio de pedidos declare que necesita `usuarios >= 3.2.0`, como npm'. Otro respondió que eso es absurdo para servicios que se despliegan continuamente. Un tercero dijo que entonces cómo sabemos qué es compatible con qué. Arbitra la discusión: ¿qué se versiona en una arquitectura de microservicios, qué significa 'compatible' y cómo se gestiona en la práctica?"

### 📝 Respuesta resumen
Semver **del servicio como unidad desplegable** no sirve: un servicio no se "instala" como dependencia, se despliega, y en cada momento hay exactamente una versión (o dos, durante el rolling deploy). Lo que se versiona es **el contrato**: la API (OpenAPI/proto) y los eventos que publica (schema registry). El binario se identifica por SHA/build number (identidad, no promesa de compatibilidad); el contrato evoluciona con reglas de compatibilidad — cambios aditivos libres, breaking changes = versión nueva del contrato conviviendo con la vieja. El invariante operativo es **compatibilidad N±1 durante rolling deploys** (versión nueva y vieja del mismo servicio conviven contra los mismos vecinos). Y "pedidos requiere usuarios >= 3.2.0" con releases sincronizados es el anti-patrón que delata un **monolito distribuido**: si dos servicios deben desplegarse juntos, la frontera está mal puesta.

### 📖 Respuesta detallada

**Por qué semver-de-servicio es una categoría equivocada:** semver resuelve el problema de un **consumidor que elige qué versión instalar** (una librería en su lockfile). Un microservicio no ofrece esa elección: sus consumidores hablan con *la instancia que está corriendo*. Declarar "requiero usuarios >= 3.2.0" implica o (a) desplegar grafos de versiones coordinados — lockstep, ver abajo — o (b) que la declaración es decorativa. Además, ¿qué es un "major" de un servicio que se despliega 5 veces al día? La versión útil de un *deployable* es su **identidad**: `orders@a3f8c21` (SHA), suficiente para trazabilidad (caso 10). La versión útil de cara a *otros* es la de su **contrato**.

**Qué significa compatible — las reglas del contrato:**
- *API síncrona (REST/gRPC):* el contrato es el spec (OpenAPI, `.proto`). Cambios **aditivos** (campos opcionales nuevos, endpoints nuevos, enums nuevos si los clientes toleran desconocidos) no rompen ni requieren ceremonia. Cambios **breaking** (quitar/renombrar campo, cambiar tipos o semántica, hacer obligatorio lo opcional) no se hacen "in place": versión nueva del contrato (`/v2`) **conviviendo con la vieja** hasta migrar consumidores (la retirada es el caso 9). Regla simétrica: consumidores tolerantes (tolerant reader), productores conservadores.
- *Eventos:* igual pero más grave: los consumidores son invisibles (no hay caller en el stack trace) y los eventos viejos **persisten** en el log/broker — un consumidor puede leer hoy un evento serializado hace meses. Un **schema registry** (Avro/Protobuf/JSON Schema) con compatibilidad enforced (`BACKWARD` o `FULL_TRANSITIVE`) convierte "no rompas el evento" de norma social en check automático: publicar un esquema incompatible falla el build.

**El invariante N±1 (donde la teoría toca el suelo):** durante cualquier rolling deploy conviven versión vieja y nueva del mismo servicio, minutos u horas (días con canary). Por tanto **todo cambio debe ser compatible con su propio N-1** hacia los dos lados: los consumidores ven respuestas de ambas versiones intercaladas; los eventos en cola los escribió la vieja y los leerá la nueva (y viceversa si hay rollback). Es el expand–contract del caso 3 aplicado a mensajes: añadir primero, doble-soportar, retirar después. Quien pide "usuarios >= 3.2.0" suele intentar escapar de este invariante; la respuesta correcta es cumplirlo, no coordinar deploys.

**Cómo se verifica en la práctica (mecanismos, no confianza):**
1. **Contract tests consumer-driven** (Pact o similar): cada consumidor publica qué usa del contrato; el CI del proveedor verifica contra los pacts de *todos* antes de mergear. Responde "¿a quién rompo si quito este campo?" con datos, y `can-i-deploy` responde "¿puedo desplegar esta versión ahora?" contra lo verificado en cada entorno.
2. **Diff de spec en CI:** `oasdiff`/`buf breaking` sobre el OpenAPI/proto en cada PR; un breaking change no anunciado ni versionado no pasa el build.
3. **Schema registry** con compatibilidad enforced para eventos.
4. La "**matriz de compatibilidad**" explícita es el plan B sin contract tests — y una señal de alarma: si la consultas a menudo, hay demasiado acoplamiento. Con contratos aditivos + N±1, la matriz degenera en "todo con todo dentro de la ventana de deprecación", que es el objetivo.

**Lockstep releases — el anti-patrón que delata un monolito distribuido:** si pedidos y usuarios deben salir juntos, tienes los costes del monolito (release coordinado, testing conjunto) **más** los de distribuido (red, fallos parciales, dos pipelines) y ninguna ventaja: deploy independiente era *el* motivo de separar. Causas típicas: contratos rotos in place, modelos de datos compartidos (dos servicios sobre la misma tabla), o una frontera de dominio mal trazada. El remedio no es mejor coordinación de releases, es arreglar la causa: evolución aditiva de contratos, datos propios por servicio, o —perfectamente legítimo— **fusionar los dos servicios**: si siempre cambian juntos, son un servicio.

**Excepción honesta:** semver sí aplica a lo que **se instala**: SDKs/clientes generados del contrato (`orders-client 2.1.0` en npm/Maven), librerías compartidas (caso 7), CLIs, agentes. Ahí el consumidor elige versión y semver comunica lo que debe. La confusión de la retro es mezclar el artefacto instalable con el servicio desplegado.

**Qué espera oír el entrevistador:** la distinción tajante contrato vs binario (se versiona la promesa, no el ejecutable); SHA como identidad del deployable; qué es aditivo y qué breaking en APIs y eventos, con la asimetría de los eventos (consumidores invisibles + mensajes persistidos); N±1 bidireccional como consecuencia del rolling deploy; contract tests y schema registry como enforcement; por qué lockstep = monolito distribuido y que fusionar servicios es salida válida; y la excepción de los SDKs, donde semver sí es la herramienta correcta.

---

## 6. Monorepo vs multirepo para 40 servicios y 10 equipos
**Categoría:** Repositorios / Tooling · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"Tenemos 40 servicios en 40 repos y duele: cambiar una librería compartida son 15 PRs, los refactors cross-service no se hacen nunca, y cada repo tiene su CI ligeramente distinta. Un grupo propone migrar todo a un monorepo 'como Google'. Otro grupo dice que el monorepo nos hará lentos: CI eterna, merges en cola, y 10 equipos pisándose. Danos una recomendación fundada: ¿monorepo, multirepo, o qué?"

### 📝 Respuesta resumen
No es un debate de dogma sino de **dónde pones el coste**: el multirepo cobra en cada cambio cross-repo (N PRs, versionado y propagación de librerías internas, drift de tooling); el monorepo cobra en **infraestructura** (build selectivo por grafo de dependencias, CI incremental, CODEOWNERS, merge queue) que hay que construir o adoptar y operar. Con 40 servicios y 10 equipos ambos funcionan si se paga su factura; los síntomas descritos (15 PRs por cambio de librería, refactors que no se hacen, drift de CI) son exactamente los que el monorepo elimina, así que la recomendación es **monorepo con tooling desde el día uno** (Bazel/Nx/Turborepo/Pants según stack, CI por paths afectados, merge queue, CODEOWNERS) — o, si la organización no puede invertir en ese tooling, quedarse en multirepo y atacar los síntomas (plantillas de CI, automatización de bumps estilo Renovate). La migración tiene coste real y se hace incremental, no big-bang.

### 📖 Respuesta detallada

**Encuadre (lo primero que diría):** monorepo/multirepo no cambia la arquitectura — los servicios siguen desplegándose por separado con sus contratos (caso 5); cambia la **unidad de cambio atómico y de tooling**. Y ojo con "como Google": Google dedica miles de ingenieros a la infraestructura de su monorepo (Blaze, TAP, Piper). La pregunta útil es qué necesitan 10 equipos.

**Lo que compra el monorepo:**
- **Cambios atómicos cross-service:** cambiar la firma de una librería compartida y sus 30 consumidores en **un PR** que compila y testea junto. En multirepo son 15 PRs coordinados en orden de dependencia — por eso "los refactors no se hacen nunca" y el sistema se osifica.
- **Una sola versión de la verdad:** las librerías internas se consumen **por source, en HEAD** — desaparece el versionado interno, el diamante de dependencias (`A` quiere `commons 2.x`, `B` quiere `1.x`) y la fase de "propagar el bump" (el purgatorio del caso 7).
- **Tooling homogéneo por construcción:** una config de CI, un linter, un formato de repo. El drift desaparece porque no hay 40 sitios donde divergir.
- Visibilidad: grep sobre todo el sistema, dependencias reales visibles en el grafo de build.

**Lo que cobra el monorepo (la factura, en concreto):**
- **Build/CI selectivo o muerte:** con CI naïve, cada PR construye y testea 40 servicios → horas. Hace falta grafo de dependencias y caché/afectados: Bazel/Pants (poliglota, curva dura), Nx/Turborepo (JS/TS, adopción suave), o `paths:`-filters como versión pobre. Regla: solo se construye/testea lo afectado por el diff (`nx affected`, `bazel query rdeps`), con caché remota.
- **Merge queue:** con decenas de merges/día a un solo `main`, "mi PR pasó CI pero contra un main viejo" se vuelve cotidiano → merge queue (GitHub merge queue, o bors-style) que testea los PRs contra main + los PRs en cola antes de mergear.
- **Ownership explícito:** CODEOWNERS por directorio para que un cambio en `services/payments/` requiera revisión del equipo de payments; sin esto, 10 equipos en un repo es ruido y fricción de permisos.
- Escala de Git: 40 servicios están **lejos** del límite (esto no es Windows en un repo); `git sparse-checkout` y shallow clones si el repo engorda, pero no es el problema real a este tamaño.
- Radio de impacto: un `main` roto bloquea a todos → la merge queue y la cultura de revert rápido (`git revert` sin debate, se discute después) son parte del paquete, no opcionales.

**Lo que cobra el multirepo (la factura que ya pagan):** los tres síntomas del enunciado, más los invisibles: versiones internas de librerías con su matriz de quién-consume-qué, incentivo a copiar código antes que tocar lo compartido, y descubribilidad pobre. Se puede mitigar sin migrar: plantillas de CI centralizadas (reusable workflows), Renovate/Dependabot para propagar bumps internos, un repo "platform" con tooling común. Si la organización no va a invertir en el tooling del monorepo, esta es la recomendación honesta — un monorepo sin build selectivo ni merge queue es peor que 40 repos.

**Los servicios siguen desplegándose solos:** monorepo **no** implica release conjunto. Cada servicio conserva su pipeline de deploy, disparado cuando el grafo dice que fue afectado; su identidad sigue siendo SHA (del monorepo) + path. El acoplamiento de release sería un anti-patrón igual que en multirepo (caso 5). Y al consumirse las librerías en HEAD, un cambio en `libs/commons` dispara los tests de **todos** sus consumidores en el mismo PR — el "reverse dependency testing" del caso 7 gratis: el mayor argumento técnico a favor.

**Recomendación y plan de migración:** monorepo, condicionado a financiar el tooling (1-2 personas de plataforma varios meses para la base, y dedicación continua). Migración **incremental, no big-bang**:
1. Crear el monorepo con el esqueleto de tooling (build system, CI de afectados, merge queue, CODEOWNERS) y **2-3 servicios piloto** de un equipo voluntario + la librería compartida más dolorosa.
2. Importar cada repo **preservando historia**: `git subtree add --prefix=services/orders orders-repo main` (o `git filter-repo --to-subdirectory-filter`). Congelar el repo viejo (archive + redirect), nunca convivencia larga de espejos.
3. Migrar por oleadas, midiendo (tiempo de CI, lead time, nº de PRs por cambio cross-service) antes/después.
4. Criterio de parada explícito: si tras los pilotos la CI no baja de X minutos o la merge queue se atasca, se detiene con 3 servicios dentro, no con 40.

**Riesgos:** subestimar el tooling (el nº 1, con diferencia); acoplamiento accidental — al ser *fácil* importar cualquier cosa, el grafo se enmaraña → reglas del build system (`visibility` en Bazel, boundaries en Nx) para imponer las fronteras que en multirepo imponía la distancia; y la migración eterna a medias (mitad dentro, mitad fuera = pagar las dos facturas) → oleadas con calendario y final.

**Qué espera oír el entrevistador:** reformular el debate como asignación de costes, no religión; el tooling concreto que el monorepo exige (build por grafo afectado, caché remota, merge queue, CODEOWNERS) y qué pasa sin él; consumo de librerías por source en HEAD como diferencia estructural clave; monorepo ≠ deploy conjunto; la alternativa honesta del multirepo mejorado si no hay inversión; y migración incremental con historia preservada, métricas y criterio de abandono.

---

## 7. La librería compartida infernal: `commons` usada por 30 servicios
**Categoría:** Librerías internas / Dependencias · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"Tenemos una librería interna, `commons`, que empezó siendo helpers de logging y hoy tiene de todo: clientes HTTP, modelos de dominio, validadores, hasta lógica de pricing. La usan 30 servicios. Cada release de `commons` rompe a alguien: la 4.2 rompió a tres servicios que nadie sabía que usaban una clase 'interna'. Los equipos han empezado a pinnear versiones viejas y hay servicios en la 2.x, la 3.x y la 4.x. Nadie quiere ser el owner. ¿Cómo sales de este agujero?"

### 📝 Respuesta resumen
Tres frentes. **Proceso:** semver disciplinado con enforcement — CI de la librería que compila y testea contra sus consumidores reales (**reverse dependency testing**) antes de publicar, API pública explícita y lo demás inaccesible, deprecations con plazo y avisos en compile-time. **Estructura:** `commons` es un cajón de sastre; trocearlo por tasa de cambio y dominio (`logging` estable ≠ `pricing` de negocio), sacar la lógica de dominio de ahí (pricing pertenece a un servicio, no a una librería), y aceptar que **para código pequeño y estable copiar es más barato que compartir** — una dependencia es un acoplamiento con coste perpetuo. **Ownership:** un equipo dueño nombrado (plataforma) con presupuesto, o la librería se congela y desmantela; "de todos" = de nadie, y este caso lo demuestra.

### 📖 Respuesta detallada

**Diagnóstico — tres fallos que se refuerzan:**
1. *Superficie sin frontera:* sin distinción enforced entre API pública e internals, **toda** clase es API de facto (ley de Hyrum: todo comportamiento observable será dependido por alguien). Por eso la 4.2 "rompió sin romper": rompió contratos que nadie declaró pero tres servicios usaban.
2. *Cohesión nula:* logging (infraestructura, estable) convive con pricing (dominio, volátil). Cada release mezcla ambos mundos, así que cada release es arriesgada para todos, incluso para quien solo quería el logger.
3. *Sin owner ni feedback:* nadie corre los tests de los consumidores antes de publicar; la primera noticia de un breaking change es un build roto ajeno. Respuesta racional: pinnear → fragmentación 2.x/3.x/4.x → cada upgrade pendiente es más grande y aterrador → más pinneo. La espiral de la deuda de dependencias.

**Frente 1 — proceso y enforcement (lo urgente):**
- **API pública explícita:** definir qué es público y hacer los internals inaccesibles con el mecanismo del lenguaje (module-info/`internal` en JVM/Kotlin, `internal/` en Go, `exports` en package.json, convención + linter en Python). Lo que no se puede importar no se puede romper.
- **Reverse dependency testing:** el CI de `commons`, en cada PR, compila y ejecuta los tests de sus consumidores principales (los 30, o un top-10 representativo) con la lib parcheada al SHA candidato. Un breaking change se descubre **antes de publicar**, en el PR que lo causa — el único momento barato. Es lo que un monorepo da gratis (caso 6); en multirepo se construye con un pipeline que consume un manifiesto de consumidores.
- **Semver con verificación mecánica:** diff de API en CI (japicmp/revapi en JVM, `api-extractor` en TS, `cargo-semver-checks` en Rust): si el diff es breaking y la versión no es major, el build falla. El humano decide qué romper; la máquina impide romper *por accidente*.
- **Deprecations con plazo:** nada se elimina sin ≥ N releases marcado `@Deprecated` con el reemplazo indicado, aviso en compile-time y changelog. Los majors se agrupan (máx. uno/semestre) y llegan con guía de migración y, cuando el cambio es mecánico, **codemods** (OpenRewrite, jscodeshift): si obligas a 30 equipos a migrar, el owner paga parte del coste — el incentivo de romper queda bien puesto.
- **Propagación automatizada:** Renovate/Dependabot abriendo PRs de bump en los 30 servicios al publicar; con CI verde, automerge donde lo acepten. Ataca la fragmentación por inercia (la fragmentación por miedo se ataca con todo lo anterior).

**Frente 2 — reducir la superficie (lo estructural):**
- **Trocear por tasa de cambio y dominio:** `commons-logging`, `commons-http` (infraestructura estable, releases raros y aburridos) separadas de cualquier cosa de dominio. La estabilidad de una librería la marca su pieza más volátil; separar aísla el riesgo.
- **La lógica de dominio sale de la librería:** pricing en una librería significa que *desplegar un cambio de pricing* = release de lib + 30 bumps + 30 deploys, y mientras tanto conviven servicios calculando precios distintos (con la fragmentación actual, seguro que ya pasa). Pricing pertenece a **un servicio**: un deploy, una verdad. Regla general: las librerías compartidas contienen código *estable y genérico*; lo *volátil o de negocio* va detrás de un servicio.
- **Copiar como opción legítima:** para 30 líneas de helpers, la dependencia cuesta más que la duplicación — el consumidor queda acoplado al ciclo de release de la lib para siempre a cambio de no reescribir media pantalla. "Un poco de copia es más barato que un poco de dependencia" (proverbio Go). Criterio: tamaño × tasa de cambio × necesidad de consistencia. Firmas criptográficas: compartir siempre. Un helper de fechas: copiar y en paz.

**Frente 3 — ownership:** que la posea el equipo de plataforma con esto en su roadmap (no "en los ratos libres"), con SLO de respuesta y presupuesto para las migraciones que impone. Si la organización no puede pagarlo, la alternativa honesta es **congelar y desmantelar**: `commons` en modo mantenimiento (solo security fixes), y cada pieza o se extrae a una lib pequeña con dueño, o se inlinea en sus consumidores, o muere. Una librería sin dueño es un riesgo, no un activo.

**Plan de salida ordenado (30 servicios en 3 majors):** (1) publicar la 4.x con internals cerrados y deprecations marcando el camino; (2) montar el reverse-dependency CI antes de cualquier otro release; (3) trocear, publicando libs pequeñas y convirtiendo `commons` en fachada que reexporta (los consumidores migran sin cambiar código, luego cambian imports a su ritmo); (4) campaña de convergencia: todos a la última 4.x con PRs automatizados + soporte del owner a los 3 servicios más difíciles; (5) recién entonces, el próximo major, agrupado y con codemod. Medir: nº de versiones en producción (objetivo ≤ 2) y tiempo mediano release → adopción completa.

**Qué espera oír el entrevistador:** la espiral pinneo→fragmentación→miedo; ley de Hyrum y el cierre mecánico de internals; reverse dependency testing como la pieza que convierte "no rompas a nadie" en un check de CI; infraestructura-estable vs dominio-volátil y por qué pricing debe ser un servicio; la defensa razonada de copiar; deprecations con plazo y codemods (el que rompe, paga); y sobre ownership: dueño con presupuesto o desmantelamiento, sin tercera vía.

---

## 8. Dos features de dos equipos deben salir juntas
**Categoría:** Coordinación / Acoplamiento de release · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"El equipo A está construyendo 'wallet' en el servicio de pagos y el equipo B la pantalla que la usa en la app. B dice: 'mi feature no funciona sin la tuya, tenemos que desplegar el mismo día'. Han acordado un 'release conjunto' el día 15, con una rama de integración compartida donde ambos van mergeando. Ya llevan dos slips de fecha porque cuando uno está listo el otro no. Además: el deploy de la app pasa por revisión de las stores (1-3 días impredecibles), así que 'el mismo día' ni siquiera es técnicamente posible con precisión. Te piden ayuda como tech lead. ¿Qué está mal y cómo lo arreglas, ahora y para la próxima vez?"

### 📝 Respuesta resumen
El "release conjunto" es el error: **acopla la fecha de dos equipos al máximo de sus retrasos** (dos slips lo demuestran) y la revisión de las stores lo hace literalmente imposible de sincronizar. La solución: **contract first** — congelar el contrato de la API wallet ya, con mock/stub para que B desarrolle sin esperar a A; **desplegar en cualquier orden, apagado**: A despliega el backend tras un flag (o simplemente sin tráfico: un endpoint nuevo sin consumidores es inofensivo), B publica la app con la pantalla tras un flag; cuando ambos están en producción verificados, **el release es encender el flag**, un acto de minutos, coordinado pero trivial. Contract tests garantizan que cualquier orden de deploy es seguro. La rama de integración compartida se elimina. Para la próxima vez: regla de la casa — *backend primero expone, frontend después consume, el flag decide cuándo lo ve el usuario*.

### 📖 Respuesta detallada

**Qué está mal, con precisión:** han fusionado tres cosas que deben estar separadas — *integración* (que el código de ambos funcione junto), *deploy* (cada artefacto a producción) y *release* (usuarios ven la feature). Al fusionarlas: la fecha conjunta acopla cronogramas (probabilidad de cumplir = P(A listo) × P(B listo); dos slips no son mala suerte, son la matemática); la rama de integración compartida es una bomba de integración diferida (caso 1) con conflictos *entre equipos*; y las stores meten un delay aleatorio de 1-3 días que hace la sincronización imposible por construcción — con el agravante de que **las versiones viejas de la app siguen vivas** en dispositivos durante meses: el backend convivirá con clientes antiguos sí o sí.

**El rediseño, paso a paso:**

*1. Contrato primero, hoy.* A y B congelan en una tarde el contrato de la API wallet (OpenAPI/proto): endpoints, formas, errores, semántica. El contrato es el punto de sincronización — **el único**. Desde ahí los equipos se desacoplan: A lo implementa; B desarrolla contra un mock generado del spec (Prism, WireMock, MSW). Si A descubre que el contrato debe cambiar, se renegocia explícitamente (un PR al spec que B revisa), no se cambia en silencio.

*2. Contract tests para desplegar en cualquier orden.* B publica sus expectativas como consumer-driven contract (Pact); la CI de A verifica cada build contra ellas, y `can-i-deploy` responde mecánicamente si una versión de A satisface a los consumidores en producción. "¿Puedo desplegar antes que el otro?" deja de ser una reunión y pasa a ser un check.

*3. Desplegar pronto, apagado, en el orden natural.* El orden de despliegue **existe** y se documenta, pero es trivial: *provider primero* — A despliega en cuanto está (un endpoint que nadie llama es riesgo cero, y en producción real se validan performance, auth y edge cases; B puede probar contra prod con un flag interno). B publica la app con la pantalla oculta tras un flag remoto **sin esperar al día 15**: pasa la revisión de stores cuando toque, y la incertidumbre de 1-3 días deja de importar porque publicar la app ya no libera la feature.

*4. El release es encender flags.* Con ambos artefactos en producción y verificados: activar el flag del backend y luego el de la app, con rollout gradual (1% → 10% → 100%) mirando métricas. "El día 15" se convierte en una decisión de producto ejecutable en minutos y reversible en segundos — kill-switch sin re-pasar por revisión de stores, la joya de este diseño en mobile. La única coordinación restante: quién enciende qué y en qué orden, escrito en el plan de release (dos líneas).

*5. Matar la rama de integración compartida.* Ambos trabajan en trunk con su flujo normal. La "integración" ocurre continuamente vía contrato + mocks + contract tests + staging donde ambos despliegan a diario, no en una rama-evento.

**Si el acoplamiento fuera real (matiz senior):** a veces "deben salir juntas" esconde un cambio *breaking* a un contrato existente. Ahí la respuesta no es coordinar el big bang, sino convertirlo en aditivo: endpoint nuevo conviviendo con el viejo (caso 5), migrar al consumidor, retirar después (caso 9 en miniatura). Y si dos "servicios" necesitan releases coordinados *crónicamente*, la frontera está mal puesta (caso 5, lockstep) — pero app y backend son fronteras reales e inevitables.

**Riesgos del rediseño:** el flag remoto en la app exige buen comportamiento offline (default seguro: apagado); la ventana desplegada-pero-apagada debe ser corta y vigilada; el mock puede divergir de la implementación si el contrato se cambia informalmente — por eso renegociación explícita y contract tests; y el rollout gradual necesita métricas definidas *antes* (qué miramos en el 1%: errores del endpoint, crashes, funnel).

**Qué espera oír el entrevistador:** el "release conjunto" y la rama de integración compartida como smells centrales, con el argumento probabilístico de los slips; la tríada integración/deploy/release desacoplada; contract-first con mocks; contract tests → desplegar en cualquier orden, verificable mecánicamente; provider-first documentado; el flag como momento de release, con rollout gradual y kill-switch que evita la re-revisión de stores; las app versions viejas conviviendo meses; y que el acoplamiento crónico se arregla en la frontera, no en el calendario.

---

## 9. Deprecar la v1 de una API pública con 200 integraciones activas
**Categoría:** API pública / Deprecation · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"Nuestra API pública v1 tiene un diseño que nos impide avanzar (paginación rota, errores inconsistentes, un modelo de datos que ya no refleja el producto). La v2 lleva un año disponible, pero solo el 30% del tráfico la usa: 200 integraciones siguen en v1, desde scripts de un cliente pequeño hasta la integración del cliente más grande de la compañía, que representa el 15% del revenue y no tiene la migración en su roadmap. Mantener las dos versiones nos cuesta un equipo entero. Diseña el plan para apagar la v1."

### 📝 Respuesta resumen
Un apagado de API es un **programa de migración**, no un anuncio. Fases: (1) **telemetría por versión × cliente × endpoint** para saber exactamente quién usa qué de v1 (los 200 no son iguales: habrá scripts muertos, integraciones triviales y 5 casos duros); (2) **política de deprecation formal y comunicada**: headers `Deprecation` y `Sunset` en cada respuesta v1, emails dirigidos con datos de *su* uso, changelog, plazo realista (12-18 meses para API pública) y fecha de sunset que solo se mueve una vez como mucho; (3) **reducir el coste de migrar**: guías por caso de uso, herramientas, sandbox, soporte activo a los top consumers — el proveedor paga parte del peaje; (4) **brownouts programados** (apagones de minutos anunciados) que convierten el "algún día" en tickets internos en casa del cliente; (5) el cliente del 15%: **excepción con contrato** — v1 extendida solo para él, con precio, alcance congelado y fecha final — nunca una excepción tácita que mantenga viva la v1 para todos.

### 📖 Respuesta detallada

**Fase 0 — datos antes que política.** Instrumentar ya: tráfico por versión, endpoint y API key/cliente, con dashboard. Debe responder: ¿cuántas de las 200 integraciones tienen tráfico real vs residual (un cron olvidado)? ¿Qué endpoints usa cada una — las 5 llamadas con equivalente directo en v2, o las esquinas raras? ¿Qué 20 clientes concentran el 80% del tráfico v1? El mapa dicta la estrategia: típicamente ⅓ es tráfico zombi que muere con un email, la mitad son migraciones mecánicas, y queda un puñado de casos duros que merecen atención individual. Sin el mapa, tratas a los 200 igual y dimensionas mal todo.

**Fase 1 — la política, formal y aburrida.** Publicar una deprecation policy (si no existe, este es el momento de crearla para siempre): qué significa deprecated, cuánto dura el periodo (12-18 meses para API pública con integraciones de terceros; menos es hostil, más diluye la urgencia), qué soporte hay durante la ventana (security fixes sí, features no), y la fecha de **sunset** exacta. Mecanismos técnicos:
- Headers estándar en toda respuesta v1: `Deprecation: @1767225600` y `Sunset: Sat, 27 Jun 2027 00:00:00 GMT` + `Link: <https://docs...>; rel="sunset"` (RFC 8594). Los toolings de los clientes pueden alertar automáticamente.
- Comunicación dirigida, no genérica: email a cada owner técnico con **sus** datos ("tu key X hizo 40K llamadas a estos 3 endpoints v1 el mes pasado; aquí está tu guía para esos 3"). El email genérico se archiva; el personalizado genera un ticket.
- Cadencia: anuncio → recordatorios trimestrales → mensuales → semanales el último mes, con la lista de afectados actualizada. Y congelar v1 de verdad (solo security): cada mejora que recibe es un argumento para no migrar.

**Fase 2 — abaratar la migración (la palanca más subestimada).** Cada hora de fricción × 200 integraciones es la resistencia total del sistema. Invertir en: guías **por caso de uso** ("si hoy haces esto en v1, en v2 se hace así", no un diff de la API), spec OpenAPI/colección Postman de v2, sandbox, y para patrones comunes, SDKs que abstraen la diferencia. Para los top-20: oficina de migración — sesiones 1:1, revisión de su plan, canal directo. Es caro; se compara contra el statu quo de "un equipo entero mantiene v1 para siempre". Incentivos: features nuevas solo-v2 (zanahoria), y si hay pricing por llamadas, recargo v1 en el último tramo (palo; con cuidado y aviso).

**Fase 3 — brownouts: hacer el futuro tangible.** El patrón que desbloquea a los rezagados: **apagones programados y anunciados** de v1 — 10 minutos devolviendo `410 Gone` (o `503` con `Retry-After`) un martes a las 10:00, anunciado con semanas; luego una hora; luego un día. El objetivo no es castigar: es que la integración **falle en horario laboral con causa conocida**, creando un incidente pequeño y barato en casa del cliente que convierte "migrar algún día" en un ticket con prioridad. Mucho más amable que el sunset como primera interrupción real. Los que sobreviven al brownout de 24 h son los que de verdad necesitan atención individual (o están muertos).

**Fase 4 — el cliente del 15%.** Primero entender: ¿"no está en el roadmap" es sin capacidad, sin incentivo o sin enterarse? Escalarlo a conversación comercial (CSM/ventas + ingeniería), con opciones honestas:
- *Plan A:* migración asistida — nuestro equipo hace o acompaña el grueso. Suele ser lo más barato.
- *Plan B:* **soporte extendido con contrato**: v1 viva *solo para sus keys* (enforcement por API key; el resto recibe sunset), alcance congelado, precio que refleje el coste real, fecha final firmada. La excepción existe — negar el poder de negociación de un 15% del revenue es fantasía — pero con **precio, perímetro y caducidad**. Lo letal es la excepción tácita ("mantenemos v1 porque BigCorp la usa"), que en la práctica mantiene v1 para los 200 y sine die.
- Lo que no se hace: mover la fecha de sunset global por él — castiga a los que migraron y enseña que las fechas son decorativas.

**El final:** en la fecha de sunset, v1 devuelve `410 Gone` con Link a la guía, y el código de v1 se borra (código muerto accesible es superficie de ataque y tentación de revivirlo). Lección hacia atrás: la próxima API pública nace con política de deprecation, evolución aditiva (caso 5) y telemetría por cliente desde el día uno — el coste de este caso se fijó el día que v1 se diseñó sin plan de retirada.

**Riesgos:** un brownout que tumba algo crítico de verdad (sanidad, pagos) → revisar la lista de afectados antes de cada uno y exceptuar casos sensibles contactándolos; deprecation percibida como hostilidad que erosiona la confianza en la plataforma (→ tono, plazos generosos, ayudar de verdad); y la fecha que se mueve dos veces — a la segunda nadie vuelve a creer una fecha tuya; mover como mucho una vez, con causa pública.

**Qué espera oír el entrevistador:** telemetría por cliente/endpoint como paso 0 y la segmentación de los 200 (zombis/mecánicos/duros); headers `Deprecation`/`Sunset` y comunicación personalizada; abaratar la migración como palanca principal; brownouts como forzado amable y gradual; el cliente grande como negociación comercial con excepción **contractual, acotada y con precio**, nunca tácita; borrar v1 al final; y la lección: las APIs nacen con su plan de retirada.

---

## 10. Auditoría: "¿qué versión exacta de qué corría en producción el 3 de marzo?"
**Categoría:** Trazabilidad / Compliance · **Tipo:** [CASO] Análisis de problema

### 🎯 Enunciado
"Estamos en una auditoría (SOC 2 / incidente de seguridad, elige tu veneno) y nos preguntan: '¿qué versión exacta de cada uno de vuestros 40 servicios corría en producción el 3 de marzo a las 14:00, quién la desplegó, qué cambios contenía respecto a la anterior y qué dependencias incluía?'. Hoy la respuesta honesta es: 'más o menos podemos reconstruirlo para algunos servicios mirando logs de CI y mensajes de Slack'. Varios servicios se despliegan como `latest`. Diseña el sistema para que esa pregunta se responda en minutos, siempre."

### 📝 Respuesta resumen
La respuesta se construye con una cadena **build → artefacto → deploy** sin eslabones inferidos: cada build produce un artefacto **inmutable identificado por el commit SHA** (tag de imagen = SHA, jamás `latest`, que queda prohibido y bloqueado por policy) con el SHA también incrustado dentro y expuesto en un endpoint **`/version`**; cada deploy escribe un evento en un **registro de deploys** append-only (servicio, entorno, SHA/digest, quién, cuándo, cómo, resultado); cada build genera y archiva su **SBOM** (dependencias exactas) y una attestation de **provenance** (SLSA: qué pipeline construyó qué fuente) que se verifica en el admission del cluster. Con eso, "el 3 de marzo a las 14:00" es una query al registro de deploys, `git log` entre los SHAs responde "qué cambió", y el SBOM archivado responde "qué contenía" — minutos, con evidencia verificable en vez de arqueología de Slack.

### 📖 Respuesta detallada

**Por qué `latest` está prohibido (el primer fuego a apagar):** `latest` es un puntero mutable — la misma etiqueta apunta a bytes distintos según el día, así que "corríamos latest" no identifica *nada*. Peor: dos réplicas del mismo deployment pueden correr imágenes diferentes (cada nodo resolvió `latest` en un pull distinto), y un rollback "a latest" no va a ningún sitio definido. Regla: **el tag de la imagen es el commit SHA** (`registry/orders:a3f8c21e`, + build number si un SHA se construye más de una vez) y el deploy referencia el **digest** (`@sha256:...`), content-addressed e inmutable por construcción. Enforcement, no convención: admission policy en el cluster (Kyverno/OPA Gatekeeper rechazando pods con `latest` o sin digest) y registry con tag immutability activada.

**Eslabón 1 — el build sella la identidad:**
- CI construye desde un checkout limpio y etiqueta con el SHA, que queda también **dentro** del artefacto: inyectado en build-time (`--build-arg GIT_SHA=$(git rev-parse HEAD)`; en Go, `-ldflags "-X main.gitSHA=..."`; label OCI `org.opencontainers.image.revision`).
- El servicio lo expone en **`/version`**: `{"service":"orders","git_sha":"a3f8c21e","image_digest":"sha256:…"}`. Permite verificar la realidad en runtime, no solo lo que el sistema de deploy *cree* que puso — la discrepancia entre ambos es en sí una alerta valiosa.
- Tags de git inmutables para releases (`git tag -a`, push protegido, signing opcional). Regla cultural: nunca `push --force` sobre ramas/tags de release — la historia que audita no se reescribe.

**Eslabón 2 — el registro de deploys (la pieza que casi nadie tiene):** una tabla append-only donde **el pipeline** (no humanos) escribe cada despliegue: `service, environment, artifact (sha + digest), deployed_by, triggered_by, started_at, finished_at, status (success/failed/rolled_back), previous_artifact`. Los rollbacks son eventos, no borrados. Con esto, la pregunta de la auditoría es literalmente:
```sql
SELECT service, artifact_sha, deployed_by, finished_at
FROM deploys
WHERE environment = 'prod' AND finished_at <= '2026-03-03 14:00'
  AND (superseded_at IS NULL OR superseded_at > '2026-03-03 14:00');
```
Implementaciones válidas: un servicio propio alimentado por un paso obligatorio del pipeline, los deployment events de GitHub/GitLab, o —la opción elegante— **GitOps**: si todo deploy es un commit en un repo de manifiestos (Argo CD/Flux), el historial de ese repo **es** el registro (`git log --until="2026-03-03 14:00" -1 -- prod/orders/`), con autoría, timestamps y diffs gratis. La propiedad clave en cualquier variante: el registro se alimenta del único camino por el que se puede desplegar — si existen deploys manuales por fuera (`kubectl set image`), el registro miente; cerrar ese camino con RBAC es parte del diseño.

**Eslabón 3 — qué cambió y qué contenía:**
- *Qué cambió:* con los dos SHAs (el del 3 de marzo y el anterior, ambos en el registro): `git log --oneline sha_prev..sha_actual` por servicio. Si los PRs referencian tickets, la lista es legible para el auditor tal cual.
- *Qué contenía (dependencias):* **SBOM por build** (syft/trivy generando CycloneDX o SPDX en CI), archivado junto al artefacto (attestation OCI o almacén indexado por digest). Responde la pregunta estrella del incidente de seguridad — "¿qué corría con log4j 2.14 el día X?" — con una búsqueda sobre los SBOMs de los deploys activos ese día, en minutos, sin re-escanear nada.
- *Procedencia (SLSA):* la CI firma una **provenance attestation** (SLSA vía cosign/GitHub artifact attestations): "este digest fue construido por este workflow desde este repo@SHA". El admission controller **verifica firma y procedencia antes de admitir el pod**: nada corre en prod sin demostrar de qué fuente y pipeline salió. Convierte la trazabilidad de "registros que decimos que son verdad" en cadena criptográficamente verificable — la diferencia entre contárselo al auditor y demostrárselo — y cierra el vector de "alguien pusheó una imagen al registry a mano".

**Orden de implantación pragmático (sin big bang):** (1) prohibir `latest` + tag=SHA + `/version` — días de trabajo vía plantilla de CI compartida; (2) registro de deploys como paso obligatorio del pipeline (o adoptar GitOps); (3) SBOM en CI y archivado — syft es una línea; (4) firma + provenance + verificación en admission — el tramo caro, priorizado según presión regulatoria. Con (1)+(2) la pregunta ya se responde; (3)+(4) la hacen demostrable y cubren la variante de seguridad.

**Riesgos y detalles finos:** drift entre registro y realidad (deploys fuera del pipeline) → RBAC + reconciliación periódica que compara `/version` real vs registro y alerta; el registro como dependencia crítica → simple, disponible, y su caída no bloquea un hotfix (cola local + backfill); retención larga y barata (object storage) porque los auditores preguntan por fechas de hace un año; y builds no reproducibles donde "el mismo SHA" produce artefactos distintos → por eso el **digest** manda sobre el tag en todo lo forense.

**Qué espera oír el entrevistador:** por qué `latest` es inauditable (puntero mutable, réplicas divergentes) y su prohibición *enforced*; SHA/digest como identidad de extremo a extremo con `/version` para verificar la realidad; el registro de deploys append-only alimentado por el único camino de despliegue — o GitOps como registro gratis; SBOM archivado respondiendo al caso log4j en minutos; SLSA/firmas como salto de "confía en mí" a "verifícalo"; y un plan incremental que empieza por lo barato que ya responde la pregunta.
