# Microfrontends — Casos y Problemas

Casos reales de análisis de problemas para entrevistas senior. Todas las preguntas son de tipo [CASO]: el entrevistador plantea una situación y evalúa el diagnóstico, las hipótesis y el plan de acción.

---

## 1. Dos MFEs cargan versiones incompatibles de React y la app crashea
**Categoría:** Module Federation · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Síntoma típico: `Invalid hook call` o `Cannot read properties of null (reading 'useState')` al montar un remote. Diagnóstico: hay dos instancias de React en la página (o una versión singleton que no satisface a algún consumidor). Verifico en runtime cuántos Reacts hay y qué negoció el shared scope; la solución es `singleton: true` en react/react-dom en TODOS los builds, rangos `requiredVersion` que intersecten, y `strictVersion` en staging para que el conflicto falle ruidosamente antes de producción.

### 📖 Respuesta detallada
**Paso 1 — confirmar la hipótesis, no adivinar.** En la consola del navegador:

```js
// ¿Cuántas copias de React se cargaron?
performance.getEntriesByType('resource')
  .filter(r => r.name.includes('react')).map(r => r.name);

// ¿Qué hay en el shared scope? (webpack MF)
console.log(__webpack_share_scopes__.default.react);
// → { '18.2.0': {...}, '17.0.2': {...} }  ← dos versiones registradas: bandera roja
```

Si el remote renderiza componentes dentro del árbol del host con *otro* React, los hooks del remote usan un dispatcher distinto al del renderer que los está ejecutando → `Invalid hook call`. Otra variante del mismo problema: un solo React pero **dos react-dom**, o React como singleton pero una versión que viola el `requiredVersion` de un consumidor (webpack lo deja pasar con un warning en consola que nadie lee — buscar `Unsatisfied version` en la consola es parte del diagnóstico).

**Paso 2 — causas raíz habituales:**
1. Un equipo no declaró `shared` para react (o lo declaró sin `singleton: true`): su remote empaqueta React propio.
2. Rangos que no intersectan: shell con `^17.0.0`, remote nuevo con `^18.2.0`. Con singleton, webpack elige una y el otro consumidor corre sobre una versión no soportada — funciona hasta que usa una API que cambió.
3. Carga manual del container sin `__webpack_init_sharing__`/`container.init()`: el remote nunca ve el shared scope y usa su copia local (bug silencioso típico de implementaciones caseras de remotes dinámicos).
4. Un `import()` del remote ejecutado antes del bootstrap asíncrono del host: la negociación de shared no había ocurrido.

**Paso 3 — solución y prevención:**

```js
// política común, idealmente generada desde un preset compartido @acme/mf-preset
shared: {
  react:      { singleton: true, requiredVersion: '^18.2.0', strictVersion: isStaging },
  'react-dom': { singleton: true, requiredVersion: '^18.2.0', strictVersion: isStaging },
}
```

- **Preset de configuración compartido** para que ningún equipo escriba su `shared` a mano: la config de MF es contrato, no preferencia personal.
- **`strictVersion: true` en staging/CI**: convierte el warning en error donde no duele. En producción se puede preferir el warning + telemetría para no tumbar la app por un rango.
- **Check en CI del pipeline de cada remote**: script que lee el `mf-manifest.json` (MF 2.0) o el stats de webpack de todos los MFEs desplegados y falla si los rangos de singletons no intersectan con lo activo en producción.
- **Plan de upgrade coordinado para majors**: ampliar rangos a `>=17 <19` donde sea posible, desplegar remotes compatibles con ambas, subir el shell al final, estrechar rangos después.

**Qué espera oír el entrevistador:** que no parcheas el síntoma sino que inspeccionas el shared scope; las 3-4 causas raíz concretas; la diferencia entre "dos copias" y "singleton con versión insatisfecha"; y prevención sistémica (preset común + verificación en CI), porque en una organización con N equipos esto vuelve a pasar si depende de disciplina manual.

---

## 2. Un deploy de un remote rompió producción para todos los equipos
**Categoría:** Delivery / Gobernanza · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Primero contener: rollback por manifest al build anterior del remote (segundos, sin rebuild) y verificar recuperación con el smoke sintético. Después diagnosticar: ¿qué rompió — contrato de montaje, evento renombrado, singleton actualizado, chunk 404 por caching? Y por último corregir el sistema: el incidente casi siempre revela que faltaba un gate (contract test, smoke E2E pre-promoción, canary) o que el rollback no estaba ensayado. Un solo deploy no debería poder romper a todos: si pudo, el problema es del sistema de delivery, no del equipo que desplegó.

### 📖 Respuesta detallada
**Fase 1 — Contención (minutos).**
- Identificar el remote culpable: correlacionar el inicio de errores con el vector de versiones (¿qué manifest cambió y cuándo?). Si el shell reporta `checkout@3.4.21` en las sesiones con error y `3.4.20` en las sanas, listo.
- **Rollback = mover el puntero del manifest** a `builds/3420`. Esto presupone lo que hay que tener: builds inmutables conservados y manifest con TTL corto. Si el equipo sobreescribió `remoteEntry.js` en un path fijo con cache largo, el rollback se complica (purga de CDN + esperar TTLs) — y esa es una lección del postmortem.
- Verificar recuperación con el smoke sintético y las métricas de error por versión, no con "a mí ya me carga".

**Fase 2 — Diagnóstico (horas).** Causas típicas, de más a menos frecuente:
1. **Breaking del contrato no anunciado:** cambió la firma de `mount`, renombró un evento, movió un módulo expuesto (`./CheckoutApp` → `./App`). El shell viejo + remote nuevo = combinación nunca testeada.
2. **Caching/artefactos:** subió assets nuevos pero el HTML/manifest cacheado apuntaba a chunks borrados → 404 de chunks; o publicó remoteEntry nuevo con chunks a medio subir (deploy no atómico: siempre subir chunks primero, remoteEntry/manifest al final).
3. **Singleton envenenado:** el remote subió la versión de una dependencia singleton (design system, router) y, por la negociación "gana la más alta", **todos los demás MFEs pasaron a correr esa versión nueva** sin haber desplegado nada. Este es el caso más traicionero: el deploy de un equipo cambia el runtime de todos.
4. **Error de runtime del propio remote** que escapa del error boundary (p. ej. lanza durante la carga del módulo, antes de montar) y tumba el shell si este no aísla la fase de import.

**Fase 3 — Corrección sistémica (el postmortem).**
- **Gates de promoción:** contract tests del provider en su CI + smoke E2E "shell de prod + remote candidato" antes de mover el puntero de prod.
- **Canary por manifest:** el 5% primero, con auto-rollback si la tasa de error por versión sube. Un breaking así rompe al 5%, no al 100%.
- **Aislamiento de fallos en el shell:** error boundary alrededor de cada remote **incluida la fase de `import()`** (timeout + fallback), para que "checkout caído" sea una sección degradada y no una pantalla blanca global.
- **Ensayar el rollback:** si el rollback se prueba por primera vez durante el incidente, tarda 40 minutos; ensayado, 2.

**Qué espera oír el entrevistador:** contención antes que diagnóstico; rollback por puntero como reflejo inmediato; el catálogo de causas (contrato, caching/atomicidad, singleton que afecta a todos, error en fase de carga); y la conclusión de sistema: blameless postmortem cuyo resultado son gates automáticos, canary y aislamiento — no "el equipo X tendrá más cuidado".

---

## 3. El bundle total de la aplicación es gigante por dependencias duplicadas
**Categoría:** Performance · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Primero medir de verdad: no el bundle de cada MFE aislado, sino lo que descarga una sesión real (waterfall de red + coverage). Con `webpack-bundle-analyzer` por remote y un diff de módulos entre builds, identifico qué se duplica y por qué: falta de `shared`, rangos semver que no intersectan, versiones distintas de transitive deps, o polyfills/design system repetidos. La solución combina `shared` bien configurado, alineación de rangos entre equipos, y un guardián en CI que impida regresiones — más presupuestos de tamaño por remote.

### 📖 Respuesta detallada
**Paso 1 — Medición honesta.** Tres fuentes:
- **Red real:** DevTools/WebPageTest sobre un journey típico: cuántos KB de JS baja la sesión, cuántos son la misma librería repetida (buscar `react`, `moment`, `lodash` en múltiples chunks de distintos orígenes).
- **Por build:** `webpack-bundle-analyzer` (o `rsdoctor` con Rspack) en cada remote; exportar el JSON de stats.
- **Diff cruzado:** script que une los stats de todos los remotes y agrupa por paquete/versión:

```text
react-dom  18.2.0  → shell (shared) ✓
lodash     4.17.21 → catalog (bundled, 71KB)
lodash     4.17.20 → checkout (bundled, 71KB)   ← duplicado
moment     2.29.x  → checkout (289KB con locales) ← candidato a eliminar, no a compartir
@acme/ds   4.9.0   → catalog | 5.1.2 → checkout  ← doble design system + doble CSS
```

**Paso 2 — Clasificar cada duplicado, porque la solución difiere:**
1. **Falta `shared`:** añadirlo (sin singleton si no hay estado: lodash puede ser shared no-singleton; con él, webpack reutiliza si los rangos intersectan).
2. **Rangos que no intersectan** (`^4.17.20` vs `~4.16.0`): alinear versiones entre equipos — trabajo organizacional; Renovate con un "version group" común ayuda a mantener la convergencia.
3. **Transitive deps:** dos librerías arrastran versiones distintas de la misma dependencia; a veces se resuelve con `overrides`/`resolutions` en cada MFE, a veces no vale la pena.
4. **Peso muerto, no duplicado:** moment con todos los locales, lodash entero en vez de `lodash-es` tree-shakeado, polyfills para navegadores que ya no soportas. Eliminar > compartir.
5. **Design system duplicado:** caso especial porque duplica también CSS y puede romper theming — candidato fuerte a singleton (ver archivo de fundamentos).

**Paso 3 — Guardianes para no recaer:**
- **Presupuesto por remote en CI** (`size-limit`): checkout ≤ 180 KB gz excluyendo shared; el PR que lo excede falla.
- **Check cruzado programado:** job diario que rehace el diff de módulos sobre los builds *desplegados* y abre alerta si aparece un duplicado nuevo por encima de un umbral.
- **Preset de MF compartido** para que la lista de `shared` sea consistente por defecto.

**Trade-off que hay que verbalizar:** compartir todo tampoco es gratis — cada shared singleton es acoplamiento de versiones entre equipos, y las dependencias pequeñas (< 20 KB) suelen ser más baratas duplicadas que coordinadas. El objetivo no es cero duplicación: es duplicación elegida y presupuestada.

**Qué espera oír el entrevistador:** medir sesión real antes de optimizar; la taxonomía de duplicados con solución distinta por tipo; que compartir tiene costo organizacional y no siempre gana; y mecanismos de CI para que la mejora no se erosione en tres sprints.

---

## 4. Migración incremental de un monolito Angular a microfrontends con React (strangler fig)
**Categoría:** Migración / Arquitectura · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Estrategia strangler: el monolito sigue vivo mientras rutas completas se extraen una a una hacia MFEs React, con un orquestador (single-spa o un shell con routing por prefijos) decidiendo qué stack sirve cada ruta. Claves: empezar por una ruta de riesgo medio y valor alto, resolver primero las capas transversales (auth, navegación, design tokens) porque son lo que de verdad bloquea, mantener contratos finos entre mundo viejo y nuevo, y definir criterio de fin — el peor resultado es quedarse a vivir con ambos stacks para siempre.

### 📖 Respuesta detallada
**Plan por fases:**

**Fase 0 — Preparación (lo que la gente se salta y luego paga):**
- **Auth compartida:** el monolito Angular ya tiene sesión; los MFEs nuevos deben verla. Extraer el flujo a un módulo de auth único (o BFF con cookie de sesión) ANTES de la primera pantalla React, o cada pantalla migrada duplicará login.
- **Shell y routing:** decidir el orquestador. single-spa es el candidato natural por su soporte multi-framework: AngularJS/Angular como una aplicación registrada, cada MFE React como otra, `activeWhen` por prefijos. Alternativa más simple si el corte es por páginas completas: routing en servidor/proxy (nginx: `/reports/*` → app nueva, resto → monolito) con full page load entre mundos — menos elegante, muchísimo menos riesgo.
- **Design tokens compartidos** (CSS custom properties) para que las pantallas nuevas no se vean "de otra app"; y un contrato de navegación (el monolito enlaza a rutas nuevas y viceversa sin imports cruzados).

**Fase 1 — Primera ruta (probar el sistema, no la pantalla).** Elegir una ruta **autocontenida, de valor visible y riesgo medio** — ni el checkout (riesgo alto) ni una pantalla que nadie usa (no valida nada). El objetivo real de la fase es validar la maquinaria: pipeline del MFE, deploy independiente, auth compartida, navegación entre mundos, observabilidad separada. La pantalla es la excusa.

**Fase 2 — Industrializar y extraer en cadena.** Con la maquinaria probada: template de MFE (create-mfe con build, CI, contrato de montaje, telemetría preconfigurados), y las rutas salen en orden guiado por: (a) dominios cohesivos con pocas dependencias hacia el monolito, (b) dónde va a invertir producto (migrar lo que va a evolucionar; lo congelado puede esperar o morir en el monolito), (c) qué desbloquea equipos.

**Fase 3 — Estrangular de verdad.** Cada ruta migrada debe **borrarse del monolito** (feature flag → 100% → borrar código). Métrica pública de progreso (rutas migradas, LOC del monolito) y fecha objetivo. Sin presión explícita de cierre, el 20% final —siempre lo más feo: admin, configuración, esa pantalla que nadie entiende— se queda para siempre y pagas doble stack, doble CI y doble carga cognitiva indefinidamente.

**Errores comunes que citar:** reescritura big-bang disfrazada ("migramos todo y hacemos switch"); migrar por capa técnica (todos los servicios primero) en vez de rutas verticales que entregan valor; no resolver auth/estilos al inicio; dos fuentes de verdad de datos de sesión entre mundos; y subestimar el coste de mantener el puente (el equipo de plataforma necesita capacidad dedicada durante toda la migración).

**Qué espera oír el entrevistador:** strangler por rutas verticales; las transversales (auth, routing, tokens) como fase 0; primera ruta como validación de maquinaria; presión explícita para terminar; y juicio sobre alternativas (proxy con full reload vs single-spa) según tolerancia a complejidad.

---

## 5. Los estilos de un MFE pisan a otro en producción
**Categoría:** Estilos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Reproduzco la combinación (los conflictos de CSS entre MFEs dependen del orden de carga, por eso "en mi máquina funciona"), identifico la regla agresora con DevTools (computed styles → qué stylesheet gana y de qué origen llegó), y clasifico: ¿selector global sin scope, reset duplicado, doble versión del design system, guerra de z-index? El fix inmediato suele ser acotar el selector agresor; el fix real es sistémico: scoping obligatorio, stylelint que prohíba selectores globales fuera del shell, y dueño único del CSS base.

### 📖 Respuesta detallada
**Diagnóstico.** En el elemento afectado: DevTools → Computed → ver qué regla gana y su stylesheet de origen; el origen (URL del CSS/chunk) delata al MFE agresor. Los patrones que aparecen una y otra vez:

1. **Selector de elemento global:** el MFE B trae `h2 { margin: 0; font-family: X }` o `button { border: none }` de su propio CSS o —muy común— de una librería de terceros que importó (un datepicker, un editor). Se monta B y "se rompe" A.
2. **Reset/normalize duplicado:** B importa su propio normalize.css; al cargarse, cambia `box-sizing` o `line-height` globales que A asumía.
3. **Dos versiones del design system:** A trae DS v4, B trae DS v5; ambas definen `.acme-btn` con estilos distintos y gana la última hoja en cargarse — y el orden de carga entre MFEs es **no determinista** (depende de la navegación del usuario), de ahí la irreproducibilidad.
4. **Z-index:** el modal de A (z-index 999) queda debajo del header sticky de B (9999).
5. **Keyframes/custom properties con el mismo nombre:** `@keyframes spin` definida dos veces con animaciones diferentes; gana una y el spinner del otro se mueve raro.

**Contención:** acotar el selector agresor (scope bajo la clase raíz del MFE: `.chk-root h2 {...}`), o subir especificidad de la víctima como parche temporal documentado. Si el agresor es un tercero, envolver su import en un scope (con `postcss-prefix-selector` en el build, que reescribe todo el CSS de la librería bajo `.chk-root`).

**Solución sistémica (lo que importa en la entrevista):**
- **Scoping por defecto en build:** CSS Modules o CSS-in-JS obligatorio en el template de MFE; el CSS "suelto" requiere excepción justificada.
- **Stylelint compartido en el CI de todos** con reglas: prohibido selector de elemento sin ancestro con scope, prohibido `:root`/`body`/`html` fuera del shell, z-index solo desde tokens del DS.
- **Dueño del CSS global:** el shell carga reset, fuentes y tokens exactamente una vez; los MFEs tienen prohibido traer resets (regla lintada buscando imports de normalize/sanitize).
- **Design system como singleton** o, si conviven versiones, con clases versionadas (v5 usa `.acme5-btn`) para que la convivencia no colisione.
- **Test de integración visual** de las páginas con varios MFEs (Playwright screenshots) que atrape "B rompió a A" antes de producción — es la única red de seguridad que ve el problema de composición, porque cada MFE aislado se ve perfecto.
- **Opción nuclear si reincide:** shadow DOM para los MFEs conflictivos, aceptando sus costos (portales, fuentes, theming).

**Qué espera oír el entrevistador:** el insight de que el orden de carga no determinista hace estos bugs irreproducibles y por qué; la taxonomía de causas; y que la respuesta madura no es "más especificidad" sino reglas lintadas + dueño del global + verificación visual de la composición.

---

## 6. Memory leak al montar y desmontar MFEs repetidamente
**Categoría:** Runtime / Ciclo de vida · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Síntoma: la SPA va bien al inicio y se degrada tras navegar un rato entre secciones; heap y detached DOM nodes crecen con cada ciclo mount/unmount. Diagnóstico con DevTools Memory: tres snapshots (antes de montar, tras desmontar, tras GC) y buscar qué retiene los objetos del MFE desmontado — casi siempre listeners en `window`/`document` no removidos, timers/observers vivos, suscripciones a stores o websockets, o caches globales. El fix: unmount como contrato estricto con patrón de "disposables", y un test automático de mount/unmount/mount.

### 📖 Respuesta detallada
**Diagnóstico riguroso:**
1. DevTools → Memory: snapshot con el MFE montado (A), navegar fuera (unmount), forzar GC, snapshot (B). Comparar: si componentes/DOM del MFE persisten en B, hay retención.
2. En el snapshot, buscar los objetos retenidos y seguir su **retainer chain**: te lleva textualmente al culpable (p. ej. `Window > eventListeners > handler > closure > CheckoutRoot`).
3. `getEventListeners(window)` en la consola antes/después de un ciclo: si la cuenta crece monotónicamente con cada visita, hay listeners huérfanos (además de leak, causan **handlers duplicados**: al volver a montar, cada evento se procesa N veces — doble submit, doble tracking).

**Culpables clásicos en MFEs, por frecuencia:**
1. **Listeners en objetos globales** (`window.addEventListener('acme.cart.item-added', ...)`) sin `removeEventListener` en unmount. En MFEs es endémico porque la comunicación por custom events invita a suscribirse a `window`.
2. **Timers y observers:** `setInterval` de polling, `ResizeObserver`/`IntersectionObserver` sin `disconnect()`.
3. **Suscripciones externas:** store compartido, `BroadcastChannel`, websocket, cliente de auth — la suscripción retiene el callback, el callback retiene el closure, el closure retiene el árbol entero del MFE.
4. **Caches y singletons del propio MFE a nivel de módulo:** un module-scope `Map` que acumula datos por sesión; el módulo federado vive aunque el componente muera.
5. **Unmount incorrecto de raíz:** no llamar `root.unmount()` de React (o el `destroy()` de Angular/Vue) y solo hacer `innerHTML = ''`: el árbol de componentes queda vivo y su DOM, detached.

**Solución — el patrón disposables:**

```ts
export function mount(el: HTMLElement, props: MfeMountProps) {
  const disposables: Array<() => void> = [];
  const on = (t: EventTarget, ev: string, h: EventListener) => {
    t.addEventListener(ev, h);
    disposables.push(() => t.removeEventListener(ev, h));
  };

  on(window, 'acme.cart.item-added', onItemAdded);
  const poll = setInterval(refresh, 30_000);
  disposables.push(() => clearInterval(poll));
  disposables.push(props.authClient.subscribe(onAuthEvent)); // subscribe devuelve unsubscribe

  const root = createRoot(el);
  root.render(<App />);
  disposables.push(() => root.unmount());

  return () => disposables.reverse().forEach(d => d()); // unmount = ejecutar todo
}
```

Toda adquisición de recurso registra su liberación en el mismo lugar — imposible olvidar "el remove de aquel listener". Con `AbortController` queda aún más compacto para listeners (`addEventListener(ev, h, { signal })` y un único `abort()`).

**Prevención:** test de CI que hace mount→unmount→GC y falla si crecen listeners o nodos retenidos (con `FinalizationRegistry` o contadores de listeners parcheados en el harness); lint rule para `addEventListener` sin cleanup en efectos; y monitoreo RUM de memoria en sesiones largas (`performance.measureUserAgentSpecificMemory()` donde esté disponible) porque estos leaks solo duelen en las sesiones de horas que ningún dev reproduce.

**Qué espera oír el entrevistador:** metodología de snapshots + retainer chain (no "revisaría el código a ojo"); el top de culpables con los listeners globales a la cabeza y su doble síntoma (leak + handlers duplicados); el patrón disposables/AbortController como contrato de unmount; y verificación automática del ciclo de vida.

---

## 7. Estado de autenticación desincronizado entre MFEs
**Categoría:** Seguridad / Estado · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Síntomas: el usuario cierra sesión en un MFE pero otro sigue mostrando sus datos; o requests con 401 intermitentes porque cada MFE refresca tokens por su cuenta y se pisan los refresh tokens rotativos. Causa raíz: la auth está multiplicada — varios SDKs OIDC, varios estados "user", varios refresh loops. La solución es estructural: una sola fuente de verdad de sesión (servicio de auth del shell o BFF con cookie), MFEs como consumidores suscritos, refresh single-flight, y propagación de logout vía suscripción + BroadcastChannel para otras pestañas.

### 📖 Respuesta detallada
**Cómo se llega a este estado (diagnóstico organizacional):** cada equipo integró "su" auth porque era lo más rápido: catalog instancia su `oidc-client`, checkout copia el token a su store de Redux al montar, account lo lee de `localStorage`. Resultado: cuatro copias del estado de sesión que solo coinciden al inicio.

**Los fallos concretos que produce:**
1. **Logout parcial:** account llama `logout()` de SU SDK; su estado local se limpia, pero el Redux de checkout conserva `user` y sigue renderizando el carrito del usuario "deslogueado". Gravedad alta en equipos compartidos/kioscos: es un problema de privacidad, no solo de UX.
2. **Estampida de refresh:** expira el access token; tres MFEs detectan el 401 a la vez y disparan tres refresh en paralelo. Con refresh token rotation (el estándar hoy), el primero en llegar invalida el token que los otros dos están usando → el IdP detecta reuse → revoca la sesión entera → logout aleatorio "fantasma" que nadie puede reproducir.
3. **Token stale por props:** un MFE recibió el token como prop al montar y lo usa 40 minutos después, ya expirado.
4. **Carreras al montar:** un MFE monta antes de que el auth esté resuelto y decide "no hay usuario" → flash de UI de anónimo o redirect indebido al login.

**La solución estructural:**

```ts
// El shell posee la sesión; los MFEs la consumen
export interface AuthClient {
  getState(): { status: 'loading' | 'authenticated' | 'anonymous'; user: UserSnapshot | null };
  getAccessToken(): Promise<string>;      // single-flight: refresca una vez para todos
  subscribe(cb: (s: AuthState) => void): () => void;
  logout(): Promise<void>;                // limpia, notifica y redirige — para todos
}
```

- **`getAccessToken()` asíncrono y single-flight:** si hay un refresh en vuelo, todos los llamadores esperan la misma promesa. Elimina la estampida por diseño.
- **Estado con `loading` explícito:** los MFEs distinguen "aún no sé" de "anónimo" — mata las carreras del montaje.
- **Logout como broadcast:** `logout()` limpia el estado central, notifica a los suscriptores (cada MFE limpia SUS caches: react-query, stores locales — el shell no conoce sus interiores, por eso es suscripción y no imperativo), y `BroadcastChannel('acme-auth')` propaga a otras pestañas.
- **Regla organizacional lintada:** prohibido importar SDKs de OIDC en MFEs (ESLint `no-restricted-imports` para `oidc-client`, `@auth0/*`, etc. fuera del módulo de auth). Sin esta regla, la entropía reintroduce el problema en dos trimestres.
- **Alternativa BFF:** cookie de sesión `HttpOnly` y cero tokens en el navegador — la desincronización de tokens desaparece como categoría; queda solo sincronizar el *snapshot* de usuario para render, que es más benigno.

**Migración desde el estado actual:** inventario de integraciones de auth por MFE; introducir el `AuthClient` en el contrato de mount; migrar MFE por MFE (el servicio central puede coexistir leyendo la sesión legada mientras tanto); activar el lint al final para sellar.

**Qué espera oír el entrevistador:** el reconocimiento de que es un problema de *ownership* (múltiples dueños de la sesión), la explicación de la estampida con refresh rotation —detalle que distingue a quien lo ha sufrido—, single-flight y estado `loading` como piezas de diseño, y logout por suscripción + BroadcastChannel. Bonus: proponer BFF como eliminación de la clase de problema.

---

## 8. Latencia de carga inicial alta por waterfall de remotes
**Categoría:** Performance · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Con un waterfall de red delante (WebPageTest/DevTools con throttling), el patrón es evidente: cada recurso espera al anterior — shell, luego manifest, luego remoteEntry, luego chunks, luego datos. La solución es paralelizar y anticipar: inlinear el manifest en el HTML, preload del remote de la ruta actual desde el server, arrancar código y datos en paralelo, prefetch selectivo de rutas probables, y presupuesto de profundidad de cadena en CI. Objetivo: pasar de 5-6 round-trips secuenciales a 2-3.

### 📖 Respuesta detallada
**Paso 1 — Visualizar la cadena.** Con throttling "Fast 3G" el problema deja de ser abstracto. Cadena típica que encuentro en un shell mal optimizado (números ilustrativos de RTT ~150 ms):

```text
1. HTML                         (0.3s)
2. shell.js                     (+0.5s)  ← descubierto al parsear HTML
3. GET /mfe-manifest            (+0.3s)  ← descubierto al ejecutar shell
4. remoteEntry.js de checkout   (+0.3s)  ← descubierto al leer manifest
5. chunks del MFE (2 niveles)   (+0.7s)  ← descubierto al ejecutar remoteEntry
6. GET /api/cart                (+0.5s)  ← descubierto al renderizar
   ≈ 2.6s hasta contenido útil, casi todo latencia secuencial
```

**Paso 2 — Atacar cada eslabón:**
- **(3) Manifest → inline.** El server que sirve el HTML inyecta `<script>window.__MFE_MANIFEST__ = {...}</script>`. Un salto menos y el shell resuelve URLs sin red. (Trade-off: el HTML deja de ser 100% estático; si eso no es opción, manifest en cache del SW con revalidación en background.)
- **(4) remoteEntry → preload desde el HTML.** El server conoce la ruta pedida: para `/checkout` emite `<link rel="preload" as="script" href=".../checkout/builds/3421/remoteEntry.js">` (la URL exacta sale del manifest que ya tiene). El fetch corre en paralelo con el parse/exec del shell.
- **(5) Chunks → aplanar y adelantar.** Revisar el splitting del remote: si `remoteEntry` → `bootstrap` → `App` → `vendors` son 3 niveles de import dinámico anidado, son 3 RTTs; consolidar a 1 nivel. MF 2.0 con manifest permite conocer los chunks del expose y preloadearlos junto al remoteEntry.
- **(6) Datos → en paralelo con el código.** El anti-patrón es "renderiza, descubre que necesita datos, fetchea". Route-level data loading: el shell (o el entry del remote) dispara `fetch('/api/cart')` en cuanto sabe la ruta, en paralelo con la descarga del código; el componente consume la promesa ya en vuelo.
- **Prefetch de lo siguiente:** con la ruta actual renderizada, prefetch (`rel="prefetch"` o `import()` en idle) de los remotes con mayor probabilidad de navegación según analytics; disparo en hover/focus del link como refinamiento. Guardas: no prefetch con `saveData`, ni en RTT alto.

**Paso 3 — Institucionalizar.** Presupuesto en CI: profundidad máxima de cadena crítica (medible con Lighthouse "critical request chains"), tamaño del remoteEntry (solo manifiesto, sin vendor), y LCP por ruta en el RUM con alertas por regresión — porque el waterfall vuelve a crecer con cada feature si nadie lo vigila.

**Trade-off honesto:** si tras esto la primera carga sigue sin cumplir el presupuesto (página pública, SEO), la respuesta correcta puede ser cambiar de patrón de composición para esa ruta: SSR del primer render (multi-zone / composición en servidor) y MFEs client-side solo tras la hidratación.

**Qué espera oír el entrevistador:** el waterfall dibujado eslabón por eslabón con su causa ("descubierto al ejecutar X"); soluciones específicas por eslabón y no un genérico "usar lazy loading"; paralelizar código+datos; prefetch con guardas; y el reconocimiento de que a veces la solución es composición server-side, no más optimización client-side.

---

## 9. Un equipo necesita releases independientes pero el design system introduce breaking changes
**Categoría:** Design system / Gobernanza · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Conflicto clásico autonomía vs consistencia: el DS publica v6 con breaking changes; checkout quiere features de v6 ya, catalog no puede migrar este trimestre. Si el DS es singleton federado, hay bloqueo mutuo; si es npm por MFE, conviven versiones con inconsistencia visual y doble peso. La salida es una política de compatibilidad del DS: majors poco frecuentes, deprecación con solapamiento (v5 mantenida mientras los consumidores migran), codemods, tokens estables entre majors, y decidir conscientemente el modo de convivencia — no descubrirlo en producción.

### 📖 Respuesta detallada
**Entender el bloqueo según el modo de compartición:**
- **Singleton federado (`'@acme/ds': { singleton: true }`):** una sola versión en runtime para todos. Checkout no puede subir a v6 hasta que TODOS puedan — la autonomía de release murió. Peor: por la negociación "gana la más alta", si checkout despliega con v6, catalog pasa a correr sobre v6 sin haber migrado → roturas en producción de un equipo que no desplegó nada.
- **npm por MFE:** checkout empaqueta v6, catalog v5. Conviven… con costos: doble bundle del DS, posible colisión de CSS (v5 y v6 estilan `.acme-btn` distinto — necesitan clases/prefijos versionados), dos ThemeProviders y, visible al usuario, botones sutilmente diferentes entre secciones.

**Resolución a corto plazo (desbloquear sin romper):**
1. Si es singleton: **romper el singleton temporalmente y con plan** — `singleton: false` con `shareScope` o scopes separados para que convivan v5 y v6 aisladas, aceptando el doble peso como costo temporal explícito y verificando que el CSS de ambas está versionado (si no lo está, primero eso).
2. Preguntar qué necesita checkout de v6 realmente: a veces se puede backportear el componente concreto a una v5.x como release aditiva, y nadie rompe nada.

**Resolución estructural (la parte importante):**
- **Política de compatibilidad del DS escrita:** majors como máximo 1/año; cada major con **ventana de soporte solapado** (v5 recibe fixes durante 6 meses tras salir v6); deprecations marcadas ≥1 minor antes con warnings en dev.
- **Codemods de migración** (`npx @acme/ds-migrate v5-v6`) — la diferencia entre una migración de 2 días y una de 2 sprints; sin codemod, los equipos no migran y la ventana de convivencia se eterniza.
- **Arquitectura del DS que minimice breaking:** tokens (custom properties) estables entre majors — el rebrand no debe requerir major de componentes; separar paquetes (`@acme/ds-core`, `@acme/ds-charts`) para que un breaking en charts no fuerce major a todos.
- **CSS con namespace por versión** (`.acme6-*` o cascade layers por versión) para que la convivencia sea segura por diseño y no un accidente afortunado.
- **Renovate + dashboard de adopción:** visibilidad de qué MFE está en qué versión del DS; la migración pendiente es deuda visible con fecha, no un backlog invisible.

**El ángulo organizacional (lo que evalúan de verdad):** este conflicto no se arbitra en un PR; requiere acordar el SLA del DS entre equipos —una RFC de política de versionado con los tech leads— y capacidad del equipo DS asignada a mantener la ventana de solapamiento. Un DS sin presupuesto para mantener v5 mientras empuja v6 está eligiendo, de facto, romper la autonomía de los consumidores.

**Qué espera oír el entrevistador:** el análisis del bloqueo distinto según singleton vs npm (y el peligro de "gana la más alta"); desbloqueo táctico + arreglo de política; codemods y tokens estables como reductores estructurales de breaking; y que lo enmarques como problema de gobernanza con solución escrita y con presupuesto, no como pelea técnica puntual.

---

## 10. SSR con microfrontends: Next.js multi-zone y sus límites
**Categoría:** SSR / Arquitectura · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Caso: e-commerce con SEO y LCP críticos quiere MFEs; el client-side puro penaliza la primera carga. Next.js multi-zones da MFEs con SSR cortando por rutas: cada zona es una app Next.js independiente detrás de un proxy/rewrites, con deploy autónomo. El costo: la navegación entre zonas es full page load (no hay transición SPA cross-zona), y compartir estado/DS entre zonas vuelve a ser trabajo de contratos. Para composición SSR dentro de una misma página hay que ir a fragmentos server-side o federación con SSR — significativamente más complejo.

### 📖 Respuesta detallada
**Multi-zones — el corte por rutas:**

```js
// next.config.js de la zona "home" (actúa de entrada)
module.exports = {
  async rewrites() {
    return [
      { source: '/checkout', destination: 'https://checkout.internal.acme.com/checkout' },
      { source: '/checkout/:path*', destination: 'https://checkout.internal.acme.com/checkout/:path*' },
    ];
  },
};
// La zona checkout usa basePath: '/checkout' y assetPrefix propios
```

Cada zona: repo, pipeline y deploy propios; SSR/ISR/streaming completos de Next.js dentro de su territorio. El usuario ve un solo dominio; el proxy (rewrites de la zona principal, o un edge/CDN delante) enruta por prefijo.

**Los límites que hay que conocer antes de comprometerse:**
1. **Navegación cross-zona = full page load.** `<Link>` de Next.js no prefetchea ni transiciona entre zonas: catalog → checkout recarga el documento. Para un e-commerce suele ser aceptable (son fronteras de contexto naturales) si las zonas están bien cortadas; si el corte pone una frontera dentro de un flujo de alta frecuencia, la UX lo paga. El diseño de los prefijos ES el diseño de la UX de navegación.
2. **Nada se comparte en runtime entre zonas:** ni React, ni el estado, ni el ThemeProvider. El DS se comparte como paquete npm (con la disciplina de versionado de siempre); la sesión, por cookie del dominio común (`SameSite`, mismo top-level domain) — auth basada en cookies + BFF encaja naturalmente aquí.
3. **Componer MFEs de equipos distintos DENTRO de una página con SSR** no lo resuelve multi-zones. Opciones reales, todas con costo: composición de fragmentos server-side (el server de la página pide HTML a los fragment services y lo ensambla, con hidratación por fragmento — el modelo Podium/Tailor/OpenComponents); Module Federation con SSR (federación de node runtimes — posible, notablemente complejo de operar); o replantear si esa página de verdad necesita piezas de varios equipos o basta con datos de varios equipos (API composition, mucho más barato: un solo equipo posee la página y consume APIs de otros).
4. **Detalles operativos que muerden:** `assetPrefix` por zona para no colisionar `/_next/*` (los assets de cada zona deben servirse bajo su prefijo); 404/error pages por zona coherentes; preview/staging de una zona contra prod de las demás (mismo patrón de override que en client-side); y el proxy como nueva pieza crítica con su latencia y su config versionada.

**El árbol de decisión que espera el entrevistador:** ¿los dominios cortan limpio por rutas y las transiciones cross-zona son poco frecuentes? → multi-zones, la opción más simple con SSR y deploy independiente. ¿Necesitas composición intra-página multi-equipo con SSR? → fragmentos server-side, aceptando construir/operar la plataforma de composición e hidratación. ¿O en realidad la "composición multi-equipo" es de datos, no de UI? → API composition con un solo dueño de la página. Enumerar los tres y elegir por requisitos, no por moda, es la respuesta senior.

---

## 11. ¿Monorepo con módulos o microfrontends reales? Análisis organizacional y ley de Conway
**Categoría:** Arquitectura / Organización · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Caso: una organización con 4 equipos frontend debate entre monorepo modular (Nx/Turborepo, una app, boundaries internos) y microfrontends con deploy independiente. Mi análisis parte de la fricción real, no de la arquitectura deseada: ¿los equipos se bloquean en releases?, ¿pisan el mismo código?, ¿necesitan cadencias distintas? El monolito modular da el 80% del aislamiento con una fracción del costo; los MFEs se justifican cuando el deploy acoplado es el cuello de botella demostrable. Y por Conway: la arquitectura que elijas cementará la estructura de equipos — elige la estructura primero.

### 📖 Respuesta detallada
**El marco de análisis (preguntas, en orden):**

1. **¿Dónde duele hoy, con evidencia?** Métricas antes que opiniones: frecuencia de deploys bloqueados por otro equipo, tiempo de un cambio desde merge a producción, merge conflicts cross-equipo por semana, incidentes por "el release llevaba cambios de tres equipos". Si el dolor es "el build tarda" o "el código está enredado", eso lo arregla un monorepo con buenas fronteras — no necesitas deploy independiente para eso.
2. **¿Las cadencias de release son realmente distintas?** Un equipo que necesita 10 deploys/día conviviendo con uno que libera cada dos semanas bajo change-control regulatorio: señal fuerte pro-MFE. Todos liberando juntos cada sprint sin quejarse: señal fuerte pro-monorepo.
3. **¿Los dominios cortan limpio?** Si el 70% de las features tocan un solo dominio, hay fronteras reales. Si cada feature cruza 3 "dominios", los MFEs convertirán cada feature en un proyecto multi-equipo con contratos — peor que hoy.
4. **¿Hay capacidad de plataforma?** MFEs reales exigen equipo/tiempo de plataforma: shell, manifests, observabilidad, presets, contratos. Sin ese presupuesto (regla gruesa: ~10-15% de la capacidad total), los MFEs degeneran en cuatro apps inconsistentes y nadie mantiene el pegamento.

**Lo que da cada opción:**

- **Monorepo modular (Nx/Turborepo):** boundaries lintados (`enforce-module-boundaries`: checkout no importa internals de catalog), builds incrementales con cache y `affected` (solo se testea/buildea lo tocado), ownership por CODEOWNERS, refactors cross-módulo atómicos en un PR, una sola versión de cada dependencia (se acabó la negociación de singletons), types end-to-end. Lo que NO da: deploy independiente (un artefacto — aunque el trunk-based con feature flags y deploys frecuentes mitiga mucho) ni aislamiento de fallos en runtime.
- **MFEs reales:** autonomía de release y de stack, aislamiento de fallos, escalado organizacional a 10+ equipos. A cambio: toda la complejidad de este documento — contratos, versiones en runtime, performance, testing de costuras, plataforma.

**La lectura de Conway (lo que distingue la respuesta senior):** la ley funciona en ambos sentidos. Si mantienes monorepo y deploy único, los equipos tenderán a coordinarse y sus fronteras se mantendrán blandas; si instauras MFEs, las fronteras se endurecen — los equipos dejarán de ver el código de los demás y la coordinación cross-equipo se encarecerá *a propósito*. Por eso la **inverse Conway maneuver** exige decidir primero cómo QUIERES que se comuniquen los equipos y luego elegir la arquitectura que lo induzca. Y las dos opciones no son excluyentes ni permanentes: monorepo modular con boundaries estrictos es la mejor *preparación* para MFEs — si el dolor de deploy acoplado se materializa, los módulos con fronteras limpias se extraen a remotes con esfuerzo acotado. Empezar por MFEs "por si acaso" es pagar por adelantado un seguro carísimo contra un riesgo no confirmado.

**Recomendación tipo para 4 equipos sin dolor agudo de release:** monorepo modular + boundaries lintados + trunk-based + feature flags + CODEOWNERS; revisar en 2 trimestres con las métricas de fricción en la mano; extraer a MFE el dominio concreto que demuestre necesitar cadencia propia (extracción selectiva, no big-bang).

**Qué espera oír el entrevistador:** decisión guiada por métricas de fricción organizacional; qué da y qué no da cada opción sin caricaturas; Conway en ambas direcciones y la maniobra inversa; y la vía evolutiva monorepo→extracción selectiva como camino de menor riesgo.

---

## 12. Observabilidad y error tracking por equipo: ¿de quién es este error en producción?
**Categoría:** Observabilidad · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Caso: producción con 6 MFEs, un stream de errores mezclados, guardias que pierden horas triando errores de otros. La solución tiene tres piezas: atribución (etiquetar cada error con MFE + versión, vía scopes/tags del SDK de errores y release por remote), legibilidad (source maps subidos por build de cada remote a la plataforma de errores), y enrutamiento (alertas del MFE X al canal del equipo X; lo no atribuible, al equipo de plataforma). Más el contexto transversal: el vector de versiones de la sesión en cada evento, porque en MFEs "producción" es una combinación, no una versión.

### 📖 Respuesta detallada
**1. Atribución — el problema central.** Un `TypeError` en `window.onerror` no dice de qué equipo es. Estrategias combinables:
- **Por stack/origen del script:** cada MFE se sirve de una ruta identificable (`cdn.acme.com/checkout/builds/3421/...`); un `beforeSend` del SDK inspecciona los frames del stack y etiqueta `mfe: checkout` según el origen del frame superior atribuible. Es la red de seguridad universal (funciona incluso para errores no capturados).
- **Por scope explícito:** cada MFE inicializa su telemetría dentro de su `mount` con tags propios — con Sentry, un client/Hub propio por MFE en lugar del global, o `withScope` + tags `{ mfe: 'checkout', release: 'checkout@3.4.21' }` en sus error boundaries. El error boundary por remote del shell también etiqueta: sabe qué remote estaba renderizando cuando explotó.
- **Errores de la costura:** fallo de carga de remote, contrato violado, evento malformado → van al equipo de plataforma con tag propio (`mfe: shell-integration`). Deben existir como categoría — si no, se pelotean entre equipos.

**2. Source maps por remote.** Cada pipeline sube los suyos en el build, asociados a su release:

```bash
# CI de checkout
sentry-cli releases new "checkout@3.4.21"
sentry-cli sourcemaps upload --release "checkout@3.4.21" ./dist --url-prefix "~/checkout/builds/3421"
sentry-cli releases finalize "checkout@3.4.21"
```

Claves: **releases separados por MFE** (no un release global de "la app", que impediría asociar el error del chunk de checkout a su source map correcto), `url-prefix` coincidiendo exactamente con la ruta de despliegue, y source maps NO públicos en el CDN (subidos a la plataforma, no servidos). Error común: el shell define el release global y los stacks de los remotes quedan sin symbolicar — todo error ajeno parece `a.b.c at chunk-abc123.js:1:48291`.

**3. El vector de versiones como contexto.** En MFEs no existe "la versión de producción": cada sesión corre una combinación (shell 2.1.0 + checkout 3.4.21 + catalog 1.18.7 — y durante un canary, combinaciones distintas por cohorte). El shell adjunta el vector completo como contexto en cada evento. Sin él no puedes responder la pregunta clave de un incidente: "¿este error ocurre solo con checkout 3.4.21 o también con 3.4.20?" — que es exactamente la query que decide un rollback.

**4. Enrutamiento y gobierno:** alertas por tag `mfe` al canal on-call de cada equipo; dashboard por equipo (error rate, crash-free sessions **por MFE y versión**, Web Vitals atribuidos por ruta/remote); presupuesto de errores por equipo. Y RUM con la misma dimensión `mfe` para performance: el long task también necesita dueño.

**Errores comunes:** un solo Sentry project/release para toda la app (todo mezclado, source maps rotos); MFEs importando y **reconfigurando el SDK global** (el último en montar pisa la config de todos — el SDK lo posee el shell, los MFEs reciben una fachada con su scope); no capturar los errores de la fase de carga del remote (quedan como unhandled rejections anónimas); y alertar a todos de todo, que equivale a no alertar a nadie.

**Qué espera oír el entrevistador:** las tres piezas (atribución multi-estrategia, source maps por release de remote, enrutamiento por equipo); el vector de versiones por sesión como requisito para decidir rollbacks; la categoría explícita de errores "de costura" con dueño; y el detalle operativo del SDK único del shell con fachadas por MFE.
