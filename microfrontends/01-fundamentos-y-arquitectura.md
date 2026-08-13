# Microfrontends — Fundamentos y Arquitectura

Preguntas de entrevista para nivel senior sobre arquitectura de microfrontends.

---

## 1. ¿Qué son los microfrontends y cuándo NO deberías usarlos?
**Categoría:** Fundamentos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los microfrontends extienden la filosofía de microservicios al frontend: dividir una aplicación web en piezas desplegables de forma independiente, cada una propiedad de un equipo autónomo de punta a punta (UI, API, deploy). El beneficio principal es organizacional, no técnico: reducir el acoplamiento entre equipos. NO deberías usarlos si tienes un solo equipo, un producto pequeño, o si el "problema" que intentas resolver es de código y no de coordinación entre equipos: el costo en tooling, performance y consistencia es alto.

### 📖 Respuesta detallada
Un microfrontend (MFE) es una porción vertical de la aplicación —por ejemplo `checkout`, `catalog`, `account`— que un equipo puede desarrollar, testear y **desplegar sin coordinarse** con los demás. La palabra clave es *deploy independiente*: si dos "microfrontends" siempre se despliegan juntos desde el mismo pipeline, en realidad tienes un monolito modular con pasos extra.

**El driver real es la Ley de Conway**: la arquitectura del sistema refleja la estructura de comunicación de la organización. Los MFEs tienen sentido cuando:

- Hay **múltiples equipos** (regla práctica: 3+ equipos, 15+ frontends devs) pisándose en el mismo repo: merge conflicts constantes, trenes de release bloqueados, un bug de un equipo frena el deploy de todos.
- Los dominios de negocio son **separables verticalmente** (búsqueda vs. checkout vs. cuenta), con poca UI compartida más allá del design system.
- Necesitas **migración incremental** de un stack legacy (strangler fig) o convivencia de frameworks durante una transición.

**Cuándo NO usarlos** (esto es lo que más pesa en una entrevista senior):

1. **Un solo equipo o un equipo pequeño.** Pagas el costo (orquestación, versionado de contratos, duplicación de dependencias, pipelines múltiples, testing cross-MFE) sin cobrar el beneficio (autonomía de equipos). Un monolito modular con buenas fronteras internas (Nx, Turborepo, módulos con boundaries lintados) da el 80% del valor con el 20% del costo.
- 2. **La app es altamente cohesiva.** Si cada pantalla mezcla datos de todos los dominios (p. ej. un editor colaborativo tipo Figma), cortar por dominios genera más comunicación cross-MFE que aislamiento.
3. **Problemas de rendimiento estrictos.** Los MFEs client-side añaden overhead: runtime de orquestación, posible duplicación de framework, waterfalls de carga. En una web pública donde LCP/INP son críticos, cada decisión de composición debe justificarse.
4. **Como solución a "código legacy feo".** Los MFEs no arreglan mala calidad de código; la distribuyen. Si el problema es deuda técnica y no fricción organizacional, refactoriza el monolito.

**Errores comunes** que el entrevistador quiere oír que conoces: crear MFEs "horizontales" por capa técnica (header-MFE, footer-MFE) en vez de por dominio de negocio; compartir estado global mutable entre MFEs (recrea el acoplamiento que querías eliminar); y tratar el shell como un vertedero de lógica compartida que todos los equipos deben tocar.

**Qué espera oír el entrevistador:** que empieces por el problema organizacional antes que por la tecnología, que menciones deploy independiente como criterio definitorio, que cites el monolito modular como alternativa seria, y que puedas enumerar costos concretos (bundle, complejidad operacional, consistencia UX) sin vender los MFEs como bala de plata.

---

## 2. Patrones de composición: build-time, server-side, edge-side y client-side
**Categoría:** Fundamentos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Hay cuatro momentos donde componer MFEs: en build (paquetes npm), en servidor (SSR composition, p. ej. fragmentos o multi-zones), en el edge (ESI/edge workers que ensamblan HTML), y en cliente (Module Federation, single-spa, import maps). Build-time es el más simple pero rompe el deploy independiente; client-side es el más flexible pero el más costoso en performance; server/edge-side dan mejor primera carga a cambio de infraestructura más compleja. La elección depende de si la app es pública (SEO/LCP) o interna, y del grado de autonomía real que necesitan los equipos.

### 📖 Respuesta detallada
**1. Build-time composition (paquetes npm).** Cada "MFE" se publica como paquete y el host lo instala:

```json
{ "dependencies": { "@acme/checkout": "^2.3.1", "@acme/catalog": "^1.8.0" } }
```

Ventajas: tree-shaking, type-safety end-to-end, tooling estándar, cero overhead de runtime. Desventaja letal: **no hay deploy independiente** — para lanzar `checkout@2.3.2` hay que rebuildear y redesplegar el host. Es una excelente opción de *transición* o cuando la autonomía de release no es requisito; muchos equipos que "hacen microfrontends" con npm packages en realidad tienen un monolito distribuido en el build. En entrevista, señalar esto explícitamente suma.

**2. Server-side composition.** Un servicio de composición (o un framework como Next.js con multi-zones) ensambla fragmentos HTML producidos por servicios independientes:

```nginx
# nginx como compositor trivial por rutas
location /checkout { proxy_pass http://checkout-app; }
location /catalog  { proxy_pass http://catalog-app; }
```

Para composición *dentro* de una página existen soluciones de fragmentos (Podium, Tailor/Mosaic de Zalando, Ara Framework). Ventajas: HTML completo al primer byte, SEO, buen LCP, cada fragmento puede tener SSR propio. Desventajas: necesitas contrato de fragmentos (¿quién inyecta los assets?, ¿cómo se hidrata cada uno?), gestión de fallos parciales (¿qué pasa si el fragmento de recomendaciones tarda 3s?) y un tier de infraestructura que alguien debe operar.

**3. Edge-side composition.** Variante del anterior ejecutada en CDN: ESI clásico (`<esi:include src="https://checkout.acme.com/fragment"/>` en Varnish/Akamai) o edge workers modernos (Cloudflare Workers con `HTMLRewriter`) que hacen streaming del layout e insertan fragmentos cacheados por separado. Brilla cuando los fragmentos tienen TTLs distintos (header casi estático con TTL alto, precio dinámico con TTL bajo). El costo: debugging duro, tooling local pobre para simular el edge, y lock-in del proveedor CDN.

**4. Client-side composition.** El navegador carga un shell que orquesta los MFEs: Module Federation, single-spa, import maps + módulos ES nativos, o web components. Es el patrón dominante en apps internas/dashboards porque maximiza autonomía y permite composición dinámica por página. Costos: JS de orquestación en el crítico, riesgo de duplicar dependencias, waterfall shell→remoteEntry→chunks, y estados de carga parciales que hay que diseñar.

**Cómo decidir (lo que espera el entrevistador):** primero clasificar la app. Pública con SEO y presupuesto de performance → server/edge-side, o al menos SSR del primer MFE de la ruta. Interna tipo dashboard con login → client-side es razonable. Y recordar que **son combinables**: server-side routing entre páginas + Module Federation dentro de página es un híbrido muy común. Error común: elegir client-side "porque es lo que hace Module Federation famoso" sin evaluar el impacto en primera carga.

---

## 3. Module Federation en webpack 5: ¿cómo funciona y cómo se configura?
**Categoría:** Module Federation · **Tipo:** Conceptual

### 📝 Respuesta resumen
Module Federation permite que un build de webpack (host) consuma en runtime módulos expuestos por otro build (remote) desplegado por separado, negociando dependencias compartidas entre ambos. El remote publica un `remoteEntry.js` que actúa de manifiesto; el host lo carga, negocia versiones de `shared` y pide los chunks del módulo expuesto. Es la base técnica más usada para MFEs client-side con deploy independiente.

### 📖 Respuesta detallada
Configuración realista de un remote:

```js
// checkout/webpack.config.js
const { ModuleFederationPlugin } = require('webpack').container;

module.exports = {
  output: {
    publicPath: 'auto', // clave: resuelve la URL base en runtime
    uniqueName: 'checkout', // evita colisiones de webpack runtime en el mismo página
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'checkout',
      filename: 'remoteEntry.js',
      exposes: {
        './CheckoutApp': './src/bootstrap-checkout',
        './MiniCart': './src/components/MiniCart',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.2.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.2.0' },
      },
    }),
  ],
};
```

Y el host:

```js
new ModuleFederationPlugin({
  name: 'shell',
  remotes: {
    checkout: 'checkout@https://cdn.acme.com/checkout/remoteEntry.js',
  },
  shared: {
    react: { singleton: true, eager: true, requiredVersion: '^18.2.0' },
    'react-dom': { singleton: true, eager: true, requiredVersion: '^18.2.0' },
  },
});
```

Consumo con code-splitting:

```jsx
const CheckoutApp = React.lazy(() => import('checkout/CheckoutApp'));
```

**Qué pasa por debajo (esto distingue a un senior):**
1. El host descarga `remoteEntry.js`, un archivo pequeño que registra el *container* del remote: expone `init(sharedScope)` y `get(module)`.
2. El host llama a `init` pasando el **shared scope**: un registro global `{ react: { '18.2.0': factory } }` donde cada build declara qué versiones puede aportar.
3. Al pedir `get('./CheckoutApp')`, el remote resuelve sus `shared` contra ese scope (si el host ya aporta un React compatible con `requiredVersion`, lo reutiliza; si no, carga el suyo) y después descarga solo los chunks del módulo expuesto.

**Detalles que suelen romper proyectos reales:**
- **Bootstrap asíncrono obligatorio.** El entry del host debe ser `import('./bootstrap')` dentro de `index.js`. Sin esa frontera asíncrona, webpack no puede esperar la negociación de shared y verás `Shared module is not available for eager consumption`. La alternativa es `eager: true` en el host (empaqueta React en el entry), habitual en el shell.
- **`publicPath: 'auto'`**: si lo dejas fijo, el remote calcula mal las URLs de sus chunks cuando lo sirves desde un CDN distinto al previsto.
- **`uniqueName`**: sin él, dos builds con el mismo nombre de package pueden colisionar en `window.webpackChunk...`.
- **Exponer el componente, no el `ReactDOM.render`**: lo expuesto debe ser montable por el host (componente o funciones `mount/unmount`), no una app que se automonta.

**Trade-offs:** acoplamiento al ecosistema webpack (mitigado hoy por Rspack/Module Federation 2.0), errores de runtime en vez de errores de build (un remote caído = fallo en producción → necesitas error boundaries y fallbacks), y la negociación de shared como nueva superficie de bugs. **El entrevistador espera** que puedas narrar el flujo remoteEntry→init→get, que menciones el bootstrap asíncrono y que no confundas Module Federation (mecanismo de carga) con la arquitectura de MFEs (decisión organizacional).

---

## 4. `shared`, `singleton` y la negociación de versiones: ¿cómo evitas dos Reacts en la página?
**Categoría:** Module Federation · **Tipo:** Conceptual

### 📝 Respuesta resumen
`shared` declara dependencias que host y remotes intentan reutilizar en runtime mediante un shared scope común. `singleton: true` fuerza una única instancia (imprescindible para React, react-dom, routers y librerías con estado global); `requiredVersion` define el rango aceptable, y `strictVersion` convierte una incompatibilidad en error en vez de warning. La negociación elige, por semver, la versión más alta disponible que satisfaga a cada consumidor; con singleton, gana una sola para todos.

### 📖 Respuesta detallada
Configuración con los matices que importan:

```js
shared: {
  react: {
    singleton: true,          // una sola instancia en toda la página
    requiredVersion: '^18.2.0',
    strictVersion: false,     // true => throw si no hay versión compatible
  },
  'react-dom': { singleton: true, requiredVersion: '^18.2.0' },
  '@acme/design-system': { singleton: true, requiredVersion: '^5.0.0' },
  lodash: { requiredVersion: '^4.17.0' }, // NO singleton: puede haber varias copias
  'date-fns': {},              // shared "best effort"
}
```

**Por qué React exige singleton:** React usa estado interno por instancia (dispatcher de hooks, contextos, scheduler). Dos copias de React en la misma página significan que un componente del remote renderizado dentro del árbol del host lanza `Invalid hook call` o que los `Context.Provider` del host no son visibles para el remote (el contexto se crea con la identidad del módulo). Lo mismo aplica a react-router (su contexto), a librerías de estado (Redux store compartido) y a runtimes de design system con theming por contexto.

**Cómo decide versión el runtime:** cada build registra en el shared scope las versiones que trae. Para cada consumo, webpack elige la **versión más alta registrada que satisfaga `requiredVersion`** del consumidor. Con `singleton: true`, se elige una única versión para todos; si algún consumidor declara un `requiredVersion` que esa versión no cumple, webpack emite un **warning en consola y usa la singleton igualmente** (comportamiento sorprendente: no falla, funciona "a veces"). Con `strictVersion: true` lanza error explícito — preferible en CI/entornos de staging para detectar el conflicto pronto en vez de debuggear un hook roto.

**Errores comunes que el entrevistador quiere oír:**
- **Olvidar `requiredVersion`**: webpack lo infiere del `package.json`, pero con workspaces/monorepos a veces infiere `*` y acepta cualquier cosa.
- **Marcar todo como singleton**: para utilidades sin estado (lodash, date-fns) el singleton crea un punto de coordinación innecesario entre equipos; duplicar 20 KB es más barato que sincronizar upgrades de 6 equipos.
- **Confundir `eager` con singleton**: `eager: true` empaqueta la dependencia en el entry síncrono (evita el bootstrap asíncrono) pero renuncia a cargarla bajo demanda; suele ponerse solo en el host.
- **No tener política de upgrade**: singleton implica que el rango `^18.x` es un **contrato entre equipos**. Un upgrade mayor (React 18→19) exige campaña coordinada: ampliar rangos, desplegar remotes tolerantes a ambas, luego subir el host. Sin ese plan, singleton se convierte en el acoplamiento que querías evitar.

**Qué espera oír el entrevistador:** la mecánica del shared scope, la lista corta de qué debe ser singleton (react, react-dom, router, design system con contexto, librería de estado) y qué no, el comportamiento de warning-pero-continúa sin `strictVersion`, y que un singleton compartido es un contrato organizacional, no solo una línea de config.

---

## 5. Remotes dinámicos: cargar microfrontends cuya URL no se conoce en build
**Categoría:** Module Federation · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un remote estático (`checkout@https://cdn...`) fija la URL en el build del host, lo que acopla deploys y complica entornos (dev/staging/prod) y canary releases. Los remotes dinámicos resuelven la URL en runtime: o con promesas en la config (`promise new Promise(...)`) o, mejor, cargando el container manualmente desde un manifest servido por un servicio de configuración. Es la pieza que hace posible "el equipo checkout despliega y el shell lo recoge sin rebuild".

### 📖 Respuesta detallada
**Opción 1 — promise-based remotes en la config del host:**

```js
remotes: {
  checkout: `promise new Promise(resolve => {
    fetch('/api/mfe-manifest')
      .then(r => r.json())
      .then(manifest => {
        const url = manifest.checkout.remoteEntryUrl;
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve({
          get: (m) => window.checkout.get(m),
          init: (scope) => window.checkout.init(scope),
        });
        document.head.appendChild(script);
      });
  })`,
}
```

Funciona, pero es string-code dentro de la config: difícil de testear y de tipar.

**Opción 2 — carga programática del container (la que recomendaría):**

```ts
async function loadRemote(scope: string, module: string, url: string) {
  await loadScript(url);                       // inyecta remoteEntry.js
  await __webpack_init_sharing__('default');   // inicializa el shared scope
  const container = (window as any)[scope];
  await container.init(__webpack_share_scopes__.default);
  const factory = await container.get(module);
  return factory();
}

const { mount } = await loadRemote('checkout', './CheckoutApp', manifest.checkout.url);
```

La URL viene de un **manifest** — un JSON pequeño, cacheado con TTL corto o invalidado en cada deploy:

```json
{
  "checkout": { "url": "https://cdn.acme.com/checkout/3421/remoteEntry.js", "version": "3.4.21" },
  "catalog":  { "url": "https://cdn.acme.com/catalog/1187/remoteEntry.js",  "version": "1.18.7" }
}
```

El pipeline de cada equipo sube sus assets inmutables (carpeta por build) y actualiza su entrada del manifest. Esto habilita: **rollback instantáneo** (apuntar el manifest a la versión anterior, sin rebuilds), **canary/A-B** (el servicio de manifest devuelve URLs distintas por cohorte de usuarios), y **entornos** (un manifest por entorno con el mismo build del shell).

**Errores comunes:**
- Servir `remoteEntry.js` con cache agresivo del CDN: el host carga un manifiesto viejo con hashes de chunks que ya no existen y aparecen 404 de chunks en producción. Regla: `remoteEntry.js` (o el manifest) con `no-cache`/TTL corto y revalidación; los chunks con hash, inmutables, `max-age` de un año.
- No manejar el fallo de carga: un remote caído no debe tumbar el shell. Envuelve `loadRemote` con timeout, reintento y fallback UI (error boundary con "este módulo no está disponible").
- Olvidar `__webpack_init_sharing__` en la carga manual: el remote no ve el shared scope y carga su propio React, generando doble instancia.

**Qué espera oír el entrevistador:** que los remotes dinámicos existen para desacoplar el *release* del host del de los remotes; el patrón manifest + assets inmutables + rollback por puntero; y el detalle del caching del remoteEntry, que es la causa número uno de incidentes en producción con Module Federation.

---

## 6. Module Federation 2.0 y Rspack: ¿qué cambia respecto a MF clásico?
**Categoría:** Module Federation · **Tipo:** Conceptual

### 📝 Respuesta resumen
Module Federation 2.0 (`@module-federation/enhanced`, impulsado por el equipo de ByteDance/Rspack) desacopla MF de webpack: mismo runtime para webpack 5, Rspack y (vía plugins) otros bundlers. Añade lo que faltaba en MF 1.0: manifest estándar (`mf-manifest.json`), tipos TypeScript federados generados y sincronizados automáticamente, runtime plugins para interceptar la carga (fallbacks, telemetría), y mejores diagnósticos de errores. Rspack además reduce los tiempos de build drásticamente, lo que importa cuando tienes 10 pipelines de MFEs.

### 📖 Respuesta detallada
Los dolores de MF 1.0 que 2.0 ataca:

1. **Sin contrato de tipos.** En MF 1.0, `import('checkout/CheckoutApp')` es `any`: los equipos compartían tipos a mano (paquete npm de tipos, duplicando el problema del deploy acoplado). MF 2.0 genera un `@mf-types.zip` en el build del remote y el host lo descarga y descomprime en dev, de modo que el IDE tiene tipos reales del remote **desplegado**, con hot-reload de tipos. Esto convierte el contrato implícito en uno verificable.

2. **Sin manifiesto estándar.** MF 2.0 emite `mf-manifest.json` describiendo exposes, shared, versiones y assets. Sobre él se construyen herramientas (Chrome DevTools de MF, dashboards de dependencias entre MFEs) y la carga de remotes por manifest deja de ser un patrón artesanal.

3. **Runtime cerrado.** MF 2.0 expone un runtime con **plugins**: hooks como `beforeRequest`, `loadShare`, `errorLoadRemote` permiten implementar fallback a una versión anterior, circuit breakers, o telemetría de qué remote/versión cargó cada usuario:

```ts
import { init, loadRemote } from '@module-federation/enhanced/runtime';

init({
  name: 'shell',
  remotes: [{ name: 'checkout', entry: 'https://cdn.acme.com/checkout/mf-manifest.json' }],
  plugins: [{
    name: 'fallback-plugin',
    errorLoadRemote({ id }) {
      reportError('remote failed: ' + id);
      return () => FallbackComponent; // degradación controlada
    },
  }],
});

const { mount } = await loadRemote<{ mount: Mount }>('checkout/CheckoutApp');
```

4. **Bundler-agnóstico.** El runtime es un paquete independiente del bundler; Rspack lo implementa de forma nativa (`ModuleFederationPlugin` de Rspack), y la paridad de config con webpack hace la migración casi mecánica. Para una organización con muchos MFEs, migrar a Rspack suele reducir builds de minutos a segundos — relevante porque el costo operativo de MFEs es proporcional al número de pipelines.

**Trade-offs y madurez:** MF 2.0 añade su propia capa (runtime, manifest, tipos) que hay que versionar y entender; los runtime plugins son poderosos pero pueden esconder lógica crítica de carga fuera de la vista de los equipos. Y sigue siendo composición client-side: no resuelve por sí mismo SSR (aunque tiene soporte experimental) ni los problemas de performance de la carga en cascada.

**Qué espera oír el entrevistador:** que identifiques los tres aportes clave (tipos federados, manifest, runtime plugins), que sepas que ya no es "cosa de webpack", y una opinión práctica: los tipos federados eliminan la clase entera de bugs "el remote cambió la firma y el host compiló igual", que en MF 1.0 solo se detectaba en runtime o con contract tests.

---

## 7. single-spa: arquitectura, ciclo de vida y cuándo elegirlo sobre Module Federation
**Categoría:** Frameworks de orquestación · **Tipo:** Conceptual

### 📝 Respuesta resumen
single-spa es un orquestador de aplicaciones en el navegador: registra aplicaciones con una función de actividad basada en la URL y gestiona su ciclo de vida (`bootstrap`, `mount`, `unmount`). No carga código por sí mismo — delega en SystemJS/import maps o en Module Federation. Es agnóstico de framework, por lo que brilla en migraciones (Angular + React conviviendo). single-spa y Module Federation no compiten: uno orquesta ciclo de vida, el otro resuelve módulos y dependencias compartidas; se pueden combinar.

### 📖 Respuesta detallada
El shell (root config) registra aplicaciones:

```js
// root-config.js
import { registerApplication, start } from 'single-spa';

registerApplication({
  name: '@acme/catalog',
  app: () => System.import('@acme/catalog'), // resuelto vía import map
  activeWhen: ['/catalog'],
});

registerApplication({
  name: '@acme/checkout',
  app: () => System.import('@acme/checkout'),
  activeWhen: (location) => location.pathname.startsWith('/checkout'),
  customProps: { authClient },
});

start({ urlRerouteOnly: true });
```

Cada MFE exporta el contrato de ciclo de vida:

```js
// checkout/src/acme-checkout.js (con single-spa-react)
import singleSpaReact from 'single-spa-react';

const lifecycles = singleSpaReact({ React, ReactDOM, rootComponent: CheckoutRoot });
export const { bootstrap, mount, unmount } = lifecycles;
```

**Ciclo de vida:** single-spa escucha los cambios de URL (parchea `pushState`/`replaceState`), evalúa cada `activeWhen` y transiciona apps entre estados: `NOT_LOADED → LOADED → BOOTSTRAPPED → MOUNTED` y de vuelta con `unmount`. La disciplina de `unmount` es el corazón del modelo: cada app debe limpiar TODO lo que creó (render, listeners, timers, websockets), porque el usuario navegará ida y vuelta muchas veces en la misma pestaña. La mayoría de memory leaks en single-spa vienen de unmounts incompletos.

**Distribución de código:** clásicamente con SystemJS + import maps (cada MFE es un bundle System/ESM en un CDN y el import map se actualiza en cada deploy — mismo patrón de manifest que en MF). También existe single-spa sobre Module Federation, usando MF para compartir dependencias y single-spa solo para el ciclo de vida.

**single-spa vs Module Federation "a pelo":**
- **Multi-framework:** single-spa fue diseñado para ello (adaptadores single-spa-react/vue/angular). MF puede, pero no aporta el ciclo de vida estandarizado.
- **Compartir dependencias:** MF lo hace con negociación semver; con single-spa/SystemJS compartes poniendo la dependencia en el import map (una sola versión global, coordinación manual).
- **Granularidad:** single-spa piensa en "aplicaciones por ruta" (y `parcels` para piezas dentro de página); MF piensa en "módulos", más flexible para componer componentes sueltos.

**Errores comunes:** montar varias apps que asumen ser dueñas del `<head>` (conflictos de estilos globales); usar `customProps` como bus de estado mutable; y no testear la secuencia mount→unmount→mount, donde aparecen los leaks.

**Qué espera oír el entrevistador:** que single-spa es orquestación de ciclo de vida y no carga de módulos; el contrato bootstrap/mount/unmount y su relación con memory leaks; y un criterio claro: migración multi-framework por rutas, usar single-spa; ecosistema homogéneo React con composición fina y shared deps, usar Module Federation.

---

## 8. Import maps nativos y web components como base de microfrontends sin lock-in de bundler
**Categoría:** Estándares web · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los import maps (soportados por todos los navegadores modernos) permiten mapear especificadores (`@acme/checkout`) a URLs en runtime, dando deploy independiente con ES modules nativos y sin acoplarse a un bundler. Combinados con web components (custom elements) como formato de entrega, definen un contrato basado en estándares: atributos/propiedades como entrada, custom events como salida. El costo: no hay negociación de versiones tipo `shared` (una versión por especificador) y la interop de frameworks con custom elements tiene fricciones.

### 📖 Respuesta detallada
**Import maps:** el shell publica un mapa que se actualiza en cada deploy de un MFE:

```html
<script type="importmap">
{
  "imports": {
    "react": "https://cdn.acme.com/vendor/react@18.2.0/index.mjs",
    "react-dom/client": "https://cdn.acme.com/vendor/react-dom@18.2.0/client.mjs",
    "@acme/checkout": "https://cdn.acme.com/checkout/3421/entry.mjs",
    "@acme/catalog": "https://cdn.acme.com/catalog/1187/entry.mjs"
  }
}
</script>
<script type="module">
  const { mount } = await import('@acme/checkout');
  mount(document.getElementById('checkout-root'), { basePath: '/checkout' });
</script>
```

Cada MFE se buildea como ESM con `react` marcado como `external`: todos consumen la copia única del import map. Esto es el equivalente "de estándares" a `shared: { react: { singleton: true } }`, con una diferencia clave: **no hay negociación semver en runtime** — hay exactamente la versión que dice el mapa, y subir React es editar el mapa y verificar que todos los MFEs son compatibles (contrato organizacional explícito). Limitación práctica: el import map debe estar presente antes de resolver módulos (el soporte de mapas múltiples/dinámicos es reciente), así que el shell suele generarlo server-side a partir del manifest de deploys.

**Web components como contrato de entrega:**

```js
class AcmeMiniCart extends HTMLElement {
  static observedAttributes = ['locale'];
  connectedCallback() {
    this.root = createRoot(this); // o shadow DOM para aislar CSS
    this.render();
  }
  disconnectedCallback() { this.root.unmount(); }
  attributeChangedCallback() { this.render(); }
  addItem(item) { /* propiedad/método imperativo para datos ricos */ }
}
customElements.define('acme-mini-cart', AcmeMiniCart);
```

El host lo usa como HTML: `<acme-mini-cart locale="es-PE"></acme-mini-cart>`, y escucha `element.addEventListener('acme:item-added', ...)`. El framework interno del MFE es un detalle de implementación — el contrato es DOM estándar. Ventajas: interoperabilidad total, ciclo de vida (`connected/disconnectedCallback`) gratis, aislamiento de CSS opcional con shadow DOM. Fricciones reales: pasar objetos complejos exige propiedades (no atributos, que son strings); React trata bien propiedades y eventos de custom elements recién desde React 19; el shadow DOM complica theming global, formularios (necesitas `ElementInternals`) y testing con herramientas que no atraviesan shadow roots.

**Cuándo elegir esta vía:** organizaciones con stacks muy heterogéneos o con horizonte largo que priorizan estándares sobre features (nada de shared negotiation, pero cero lock-in de bundler); widgets embebibles en sitios de terceros; o como capa de contrato encima de cualquier mecanismo de carga.

**Qué espera oír el entrevistador:** que los import maps son el mecanismo estándar de indirección en deploy-time; el trade-off "una versión por mapa vs negociación de MF"; y las fricciones concretas de custom elements (atributos vs propiedades, formularios, theming) — citarlas demuestra experiencia real y no solo entusiasmo por los estándares.

---

## 9. iframes para microfrontends: ¿cuándo son la respuesta correcta?
**Categoría:** Composición · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los iframes son la forma de composición con mayor aislamiento: JS, CSS, DOM y contexto de seguridad completamente separados, incluso entre orígenes distintos. Ese aislamiento tiene precio: UX (scroll, focus, modales, resize), performance (un documento completo por frame) e integración (todo pasa por `postMessage`). Son la opción correcta cuando el aislamiento es un requisito duro: integrar aplicaciones de terceros o no confiables, contenido legacy intocable, sandboxing de seguridad (pagos, plugins), o productos embebidos en sitios de clientes.

### 📖 Respuesta detallada
Un senior no descarta iframes por "viejos": los evalúa por requisitos. **Casos donde son la mejor herramienta:**

1. **Código de confianza distinta.** Un marketplace de plugins de terceros dentro de tu SaaS (tipo Salesforce/Shopify apps): no puedes permitir que JS ajeno toque tu DOM o lea tu sesión. `<iframe sandbox="allow-scripts" src="https://plugin.vendor.com">` con un origen distinto te da la única frontera de seguridad real del navegador — nada de Module Federation te protege de código malicioso.
2. **Cumplimiento/pagos.** Los campos de tarjeta de Stripe/Braintree van en iframes precisamente para sacar los datos sensibles de tu origen y reducir el alcance PCI.
3. **Legacy intocable.** Una app AngularJS de 2014 que nadie va a portar: enmarcarla mientras el strangler avanza es más barato y seguro que intentar convivir en el mismo documento.
4. **Aislamiento de fallos extremo:** un widget inestable que no debe poder romper el resto de la página (un `while(true)` en un iframe con `sandbox` no congela necesariamente tu app si está en otro proceso del navegador).

**Los costos, con detalle:**
- **UX:** los modales/tooltips del iframe no pueden dibujarse sobre el resto de la página; el scroll interno y el resize exigen coordinación (`ResizeObserver` dentro + `postMessage` fuera para ajustar la altura); la gestión de foco y los atajos de teclado se fragmentan; la URL interna no se refleja en la barra de direcciones sin sincronización manual.
- **Performance:** cada iframe es un documento completo: parse de HTML, su propio bundle de framework, sin posibilidad de compartir dependencias. Diez widgets iframe = diez runtimes.
- **Integración:** la comunicación es solo por mensajes serializables:

```js
// host
iframe.contentWindow.postMessage({ type: 'AUTH_TOKEN', token }, 'https://plugin.vendor.com');
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://plugin.vendor.com') return; // SIEMPRE validar origen
  if (e.data.type === 'RESIZE') iframe.style.height = e.data.height + 'px';
});
```

- **SEO y accesibilidad**: contenido en iframes indexa mal y los lectores de pantalla lo navegan como documento aparte.

**Errores comunes:** olvidar validar `event.origin` en el listener de mensajes (agujero de seguridad clásico); pasar el token de sesión del host a un iframe de confianza menor; usar iframes "porque el aislamiento de CSS era difícil" cuando shadow DOM o CSS modules bastaban; y no configurar `sandbox`/`allow` explícitos, heredando permisos que no querías dar.

**Qué espera oír el entrevistador:** el criterio "iframe = frontera de seguridad, no solo de estilos"; los tres o cuatro casos legítimos (terceros, pagos/PCI, legacy, embebidos); el protocolo postMessage con validación de origen; y honestidad sobre los costos de UX que hacen que casi nunca sean la elección para MFEs propios de la misma organización.

---

## 10. Routing en una arquitectura shell/container: ¿quién es dueño de la URL?
**Categoría:** Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
El patrón estándar es routing en dos niveles: el shell es dueño del primer segmento de la ruta (`/checkout/*` → MFE checkout) y cada MFE gestiona su routing interno bajo ese prefijo. Las reglas críticas: una sola instancia de history/navegación coordinada (o eventos de navegación estándar), basename inyectado por el shell, y navegación cross-MFE a través de una API del shell — nunca con imports directos entre MFEs. Los deep links y el botón atrás son los casos de prueba que delatan una mala implementación.

### 📖 Respuesta detallada
**Nivel 1 — el shell** mapea prefijos de ruta a MFEs (con lazy loading):

```jsx
// shell: React Router como router de nivel superior
<Routes>
  <Route path="/catalog/*" element={<RemoteApp scope="catalog" module="./App" />} />
  <Route path="/checkout/*" element={<RemoteApp scope="checkout" module="./App" />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

**Nivel 2 — cada MFE** enruta bajo su prefijo. El shell inyecta el `basename` para que el MFE no hardcodee dónde vive:

```jsx
// checkout/src/bootstrap-checkout.tsx (expuesto por MF)
export function mount(el: HTMLElement, { basePath, onNavigate }: MountProps) {
  const root = createRoot(el);
  root.render(
    <BrowserRouter basename={basePath}>
      <CheckoutRoutes />
    </BrowserRouter>
  );
  return () => root.unmount();
}
```

**Los problemas reales que hay que saber explicar:**

1. **Dos routers escuchando la misma history.** Si el shell y el MFE usan instancias distintas de `history` (o versiones distintas de react-router no-singleton), un `pushState` del MFE puede no notificar al shell y viceversa: URLs que cambian sin re-render, o el shell desmonta el MFE en una navegación interna. Soluciones: compartir react-router como singleton y usar `basename`; o usar `MemoryRouter` en el MFE sincronizado a mano con la URL real; o apoyarse en eventos (`popstate` + eventos custom de navegación como hace single-spa con `single-spa:routing-event`).
2. **Navegación cross-MFE.** Un botón en catalog que lleva a `/checkout/cart` no debe importar nada de checkout. Opciones: `window.history.pushState` + evento (funciona pero débilmente tipado), o una API de navegación inyectada por el shell (`onNavigate('/checkout/cart')`) que centraliza la lógica — preferible porque el shell puede interceptar (guards de auth, confirmaciones de "tienes cambios sin guardar").
3. **Deep links y refresh.** `https://app.acme.com/checkout/payment/3ds-callback` debe funcionar en frío: el servidor/CDN debe servir el shell para cualquier ruta (SPA fallback), el shell debe cargar el MFE correcto y el MFE debe restaurar su estado interno desde la URL. Si el estado del wizard vive solo en memoria, el deep link rompe — el estado navegable va en la URL.
4. **Botón atrás entre MFEs.** El unmount del MFE saliente debe ser limpio (ver memory leaks) y el MFE entrante debe montar restaurando scroll. El shell suele encargarse del scroll restoration porque los MFEs no saben del layout global.

**Errores comunes:** MFEs que hacen `window.location.href = ...` (full reload, matando el modelo SPA); acoplar el shell a las rutas *internas* de cada MFE (el contrato debe ser solo el prefijo); y no definir quién renderiza el 404 de rutas internas (regla práctica: el MFE dentro de su prefijo, el shell fuera).

**Qué espera oír el entrevistador:** routing en dos niveles con basename inyectado, el problema de las múltiples instancias de history y su mitigación, navegación cross-MFE vía API del shell, y los deep links como test de calidad de la arquitectura.

---

## 11. Comunicación entre microfrontends: custom events, pub/sub y por qué minimizarla
**Categoría:** Arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
La regla de oro: cuanta más comunicación necesitan dos MFEs, más evidencia de que el corte de dominios está mal hecho. Para lo inevitable, el orden de preferencia es: URL (estado navegable), props del shell al montar (configuración), custom events / pub-sub tipado (notificaciones puntuales, fire-and-forget), y solo como último recurso estado compartido observable (auth, carrito). Nunca un store global mutable compartido: recrea el monolito con peor debugging.

### 📖 Respuesta detallada
**Jerarquía de mecanismos, del más al menos deseable:**

1. **La URL.** Filtros, ids de recurso, paso del wizard: si otro MFE (o un refresh) necesita ese estado, pertenece a la URL. Es el canal de comunicación con mejor contrato del mundo: visible, bookmarkeable, testeable.
2. **Props/customProps al montar.** El shell inyecta configuración y dependencias (locale, tema, cliente de auth, función de navegación) en el `mount`. Flujo unidireccional, contrato explícito en la firma de `mount`.
3. **Custom events (pub/sub).** Para hechos de negocio que otros pueden querer conocer, sin acoplarse a quién escucha:

```ts
// contrato de eventos versionado en un paquete liviano @acme/mfe-events
export interface CartItemAdded {
  type: 'acme.cart.item-added';
  version: 1;
  payload: { sku: string; qty: number };
}

// emisor (catalog)
window.dispatchEvent(new CustomEvent('acme.cart.item-added', {
  detail: { version: 1, payload: { sku, qty } },
}));

// receptor (mini-cart) — con cleanup disciplinado
useEffect(() => {
  const handler = (e: Event) => updateBadge((e as CustomEvent).detail.payload);
  window.addEventListener('acme.cart.item-added', handler);
  return () => window.removeEventListener('acme.cart.item-added', handler);
}, []);
```

Claves: nombres con namespace (`acme.dominio.evento`), payloads serializables y versionados, semántica de **notificación de hechos pasados** ("item-added") y no de comandos RPC ("add-item-to-cart-please"). Si necesitas respuesta, estás haciendo RPC disfrazado — reconsidera el corte.

4. **Estado compartido mínimo y observable.** Auth y poco más (quizá carrito en e-commerce). Un módulo pequeño propiedad del shell, expuesto como servicio con API de suscripción (`getSnapshot`/`subscribe`, consumible con `useSyncExternalStore`), no un Redux store global donde todos leen y escriben de todo.

**Por qué minimizar (el punto que diferencia a un senior):** cada mensaje entre MFEs es un **contrato no tipado por defecto, invisible en el grafo de dependencias y sin verificación en build**. Un rename de evento no rompe ninguna compilación: rompe producción. Además, la comunicación intensiva crea acoplamiento temporal (¿el listener ya estaba montado cuando se emitió el evento? — los eventos se pierden si nadie escucha, de ahí patrones de replay/last-value cuando de verdad hacen falta) y hace el debugging arqueológico: seguir un flujo por tres MFEs vía eventos es mucho peor que un call stack.

**Errores comunes:** usar eventos como transporte de datos masivo (sincronizar listas enteras); estado global mutable "temporal" que se vuelve permanente; olvidar el `removeEventListener` en unmount (memory leaks y handlers dobles al remontar); y no documentar los eventos — deben tratarse como API pública con changelog.

**Qué espera oír el entrevistador:** la jerarquía URL → props → eventos → estado compartido, eventos como hechos y no comandos, tipado/versionado del contrato de eventos, y el argumento de fondo: comunicación excesiva = fronteras de dominio mal trazadas.

---

## 12. Diseño de contratos entre equipos: ¿qué es exactamente "el contrato" de un MFE?
**Categoría:** Organización y arquitectura · **Tipo:** Conceptual

### 📝 Respuesta resumen
El contrato de un MFE es todo aquello que, si cambia, puede romper a otro equipo: la firma de `mount/unmount`, los módulos que expone y sus props, los eventos que emite y escucha, las dependencias singleton y sus rangos de versión, el prefijo de rutas, y las garantías no funcionales (presupuesto de bundle, soporte de navegadores). Un contrato serio está escrito, versionado con semver, tipado (TypeScript compartido o federado) y verificado automáticamente (contract tests en CI), con política explícita de deprecación.

### 📖 Respuesta detallada
Lo primero es enumerar las superficies de contrato, porque la mayoría de los equipos solo ven la primera:

1. **Interfaz de montaje.** La firma que el shell invoca. Conviene estandarizarla para *todos* los MFEs de la organización:

```ts
// @acme/mfe-contract (paquete liviano, muy estable)
export interface MfeMountProps {
  basePath: string;
  locale: string;
  user: Readonly<UserSnapshot> | null;
  onNavigate: (path: string) => void;
  onError: (err: Error, context?: Record<string, string>) => void;
}
export type MfeModule = {
  mount: (el: HTMLElement, props: MfeMountProps) => () => void; // devuelve unmount
};
```

2. **Módulos expuestos** (los `exposes` de MF) y las props de cada componente compartido. Quitar un módulo o cambiar props es breaking change.
3. **Eventos**: nombre, payload, versión, semántica (ver pregunta 11).
4. **Dependencias compartidas**: si `react` es singleton `^18.2.0`, ese rango es parte del contrato de *todos*. Subir de mayor exige coordinar.
5. **Rutas**: el prefijo asignado (`/checkout/*`) y las URLs públicas que otros enlazan (`/checkout/cart` sí es contrato; `/checkout/internal/step-2` no debería serlo).
6. **No funcionales**: presupuesto de KB del remote, tiempo de mount, navegadores soportados, accesibilidad. Sin esto, un equipo puede "cumplir el contrato" y degradar la app entera.

**Cómo se gobierna:** semver sobre el contrato (no sobre el código): cambios aditivos y compatibles = minor, breaking = major con **periodo de convivencia** (el MFE soporta contrato v1 y v2 durante N semanas, los consumidores migran, luego se retira v1). Nunca "big bang" coordinado: si necesitas desplegar shell y tres MFEs el mismo día, el contrato falló.

**Cómo se verifica:** tipos federados (MF 2.0) o paquete de tipos para atrapar breaking en compile-time; **contract tests** en CI del remote: un test que importa el módulo expuesto y verifica que `mount` existe, monta en un DOM falso con props v1 y no lanza; y smoke E2E del shell contra el remote recién desplegado en staging antes de promover el manifest.

**Errores comunes:** contratos implícitos ("todos sabemos cómo se monta"); usar el shell como contrato (todo el mundo importa utilidades del shell → el shell se vuelve el nuevo monolito); breaking changes anunciados en Slack en vez de versionados; y contratos gigantes — un buen contrato de MFE cabe en una página; si necesita veinte, los dominios están mal cortados.

**Qué espera oír el entrevistador:** la enumeración amplia de superficies (montaje, exposes, eventos, singletons, rutas, no funcionales), semver + convivencia de versiones en lugar de deploys coordinados, y verificación automática — un contrato no verificado en CI es una promesa, no un contrato.

---

## 13. Design system compartido: versionado de la librería UI entre equipos autónomos
**Categoría:** Design system · **Tipo:** Conceptual

### 📝 Respuesta resumen
El design system es el punto donde la autonomía choca con la consistencia. Las opciones principales: paquete npm versionado con semver (cada MFE elige cuándo subir — consistencia eventual, posible duplicación), o singleton federado (una versión en runtime — consistencia total, coordinación obligatoria). La práctica recomendada: tokens y CSS base como singleton/global estable, componentes como paquete npm con semver estricto, rangos amplios y política de deprecación; y separar los tokens de los componentes para que un rebrand no exija tocar código.

### 📖 Respuesta detallada
**Modelo A — paquete npm (`@acme/design-system` en cada MFE):**
- Cada equipo actualiza a su ritmo; un breaking change del DS no bloquea a nadie de inmediato.
- Costos: en una misma página pueden convivir Button v4 y Button v5 (inconsistencia visual sutil, doble CSS), y la librería se duplica en cada bundle salvo que además se comparta vía MF sin singleton.

**Modelo B — singleton federado:**

```js
shared: { '@acme/design-system': { singleton: true, requiredVersion: '^5.0.0' } }
```

- Una sola copia y versión en runtime: consistencia garantizada, imprescindible si el DS usa React Context (ThemeProvider) — dos copias del DS = dos contextos de tema y componentes sin estilos.
- Costo: cada major del DS es una campaña organizacional; el equipo de DS se convierte en cuello de botella si rompe a menudo.

**La respuesta senior es híbrida y por capas:**
1. **Design tokens** (colores, espaciado, tipografía) como CSS custom properties globales, versionadas aparte y ultra-estables: `--acme-color-primary`, `--acme-space-2`. Los componentes leen tokens; un rebrand cambia tokens sin release de componentes.
2. **CSS base/reset y fuentes**: una sola vez, cargados por el shell.
3. **Componentes**: npm package con semver disciplinado. Si además va como shared singleton, el equipo de DS debe comprometerse a majors muy poco frecuentes y con codemods.

**Prácticas de versionado que marcan la diferencia:**
- **Deprecar antes de eliminar:** `@deprecated` en el tipo + warning en dev durante ≥1 minor; el breaking llega anunciado y con codemod (`npx @acme/ds-codemod v4-to-v5`).
- **Changesets/changelog automatizado** y publicación continua; los consumidores usan Renovate para PRs de actualización automáticas — el problema de los DS no suele ser publicar, sino que nadie actualiza.
- **Visual regression tests** (Chromatic/Playwright screenshots) en el DS: su contrato es también visual, no solo de props.
- **Regla de dependencia:** el DS no conoce a los MFEs ni contiene lógica de negocio. Cuando un "componente de negocio" (p. ej. `ProductCard` con precios) quiere entrar al DS, la respuesta es no: eso pertenece al dominio (catalog puede exponerlo vía MF).

**Errores comunes:** DS con estado global o llamadas HTTP dentro (imposible de compartir limpiamente); permitir estilos "por fuera" del DS que se rompen al actualizarlo; tratar el DS como proyecto secundario sin owner (muere por falta de mantenimiento y cada equipo se hace su fork); y usar singleton sin `strictVersion` ni plan de upgrade, encontrando el conflicto de versiones en producción.

**Qué espera oír el entrevistador:** el trade-off npm-semver vs singleton-runtime explicado con sus fallos típicos (dos temas/contextos, doble CSS), la separación tokens/componentes, y prácticas de gobierno (deprecación, codemods, visual regression, Renovate) — el problema del DS es 30% técnica y 70% gobierno.

---

## 14. Autenticación y sesión compartida entre microfrontends
**Categoría:** Seguridad · **Tipo:** Conceptual

### 📝 Respuesta resumen
La autenticación debe ser responsabilidad del shell (o de un módulo de auth único): un solo login OIDC, un solo refresh de tokens, y los MFEs consumen un servicio de auth inyectado — nunca N copias del SDK de OIDC cada una con su propio refresh. Las opciones de transporte: cookie de sesión `HttpOnly` + BFF (la más segura, los MFEs ni ven el token) o access token en memoria expuesto vía `getAccessToken()` asíncrono. Los puntos duros: sincronizar expiración/logout entre MFEs y pestañas, y no persistir tokens en `localStorage`.

### 📖 Respuesta detallada
**Arquitectura recomendada — auth como servicio del shell:**

```ts
// contrato inyectado a cada MFE en mount()
export interface AuthClient {
  getUser(): Readonly<UserSnapshot> | null;
  getAccessToken(): Promise<string>;   // asíncrono: puede refrescar por debajo
  subscribe(cb: (evt: 'login' | 'logout' | 'expired') => void): () => void;
  login(returnTo?: string): void;
  logout(): void;
}
```

El shell implementa OIDC (Authorization Code + PKCE), guarda el access token **en memoria**, y programa el refresh (refresh token en cookie `HttpOnly` o silent renew). Cada MFE llama `await auth.getAccessToken()` en su capa HTTP; si el token está por expirar, el servicio refresca una sola vez para todos (single-flight) — el error clásico de "cada MFE con su SDK" es una estampida de refresh simultáneos que puede invalidar los refresh tokens de un solo uso (refresh token rotation) y desloguear al usuario.

**Variante BFF (mejor aún si puedes):** un backend-for-frontend en el mismo dominio termina el OIDC y da al navegador solo una cookie de sesión `HttpOnly; Secure; SameSite=Lax`. Los MFEs hacen `fetch('/api/...', { credentials: 'include' })` y jamás tocan un token: elimina el robo de token por XSS como clase de ataque. Requiere que todas las APIs pasen por el BFF o que este haga token exchange hacia los microservicios.

**Sincronización — lo que suele fallar:**
- **Logout global:** debe propagarse a todos los MFEs montados (via `subscribe`) y a otras pestañas (`BroadcastChannel('acme-auth')` o evento `storage`). Cada MFE decide qué hacer: limpiar caches propias (react-query), abortar requests en vuelo, mostrar pantalla de login.
- **Expiración durante uso:** si el refresh falla (sesión revocada), el servicio emite `expired` y el shell muestra re-login preservando la ruta (`returnTo`), no cada MFE su propio modal.
- **Autorización ≠ autenticación:** los permisos por MFE (feature flags, roles) viajan en el `UserSnapshot` o los resuelve cada dominio contra su API; el shell no debe convertirse en el policy engine de todos.

**Errores comunes:** tokens en `localStorage` (legible por cualquier XSS de cualquier MFE — y en MFEs la superficie XSS es la unión de todos los equipos); pasar el token como prop estática al montar (expira y el MFE se queda con un token muerto — por eso `getAccessToken()` es función asíncrona); cada MFE redirigiendo al IdP por su cuenta (guerras de redirect); y CORS mal pensado cuando cada dominio tiene su API.

**Qué espera oír el entrevistador:** un solo dueño del flujo OIDC, token en memoria o BFF con cookie HttpOnly, `getAccessToken()` asíncrono con single-flight refresh, y sincronización de logout entre MFEs y pestañas. Mencionar que la superficie XSS agregada de N equipos hace el `localStorage` aún más inaceptable que en una SPA normal es un plus.

---

## 15. Aislamiento de CSS entre microfrontends: shadow DOM, CSS modules, prefijos
**Categoría:** Estilos · **Tipo:** Conceptual

### 📝 Respuesta resumen
CSS es global por defecto, así que sin estrategia, los MFEs se pisan estilos. Las capas de defensa: scoping en build (CSS Modules, CSS-in-JS con hashes) para las clases propias; convención de prefijos para lo que deba ser global; shadow DOM cuando se necesita aislamiento duro (widgets embebidos, multi-framework); y reglas organizacionales: prohibido estilar elementos globales (`body`, `h1`, `*`) fuera del shell, y los estilos base/reset son del shell. El enemigo número uno no son las clases, sino los estilos globales "inocentes" y los z-index.

### 📖 Respuesta detallada
**1. Scoping en build — la base:** CSS Modules (`.button_x7f3a`), CSS-in-JS (styled-components/emotion con hashes) o el scoping de Vue/Svelte/Angular (ViewEncapsulation.Emulated) garantizan que las clases del MFE no colisionen. Cubre el 90% del problema con costo casi nulo. Lo que NO cubre: selectores de elemento (`h2 { margin: 0 }`), resets, keyframes con nombres genéricos y CSS custom properties globales.

**2. Convenciones para lo global:** prefijo por equipo para clases/keyframes/custom properties que escapen del scoping (`.chk-`, `--cat-`), y una regla lintada (stylelint) que prohíba selectores de elemento sin scope y `!important` fuera de utilidades. También definir el **dueño del layout global**: solo el shell estila `body`, fuentes y reset (normalize). Un MFE que trae su propio reset rompe a los demás al montarse — bug clásico y difícil de rastrear porque aparece "cuando navegas a X".

**3. Shadow DOM — aislamiento duro:**

```js
class CheckoutWidget extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(checkoutCss);          // constructable stylesheets
    shadow.adoptedStyleSheets = [sheet];
    createRoot(shadow.getElementById('root')).render(<App />);
  }
}
```

Nada entra (salvo propiedades heredables como `font-family`, `color` y las custom properties — que atraviesan el shadow boundary a propósito: es el mecanismo de theming) y nada sale. Costos: los portales/modales de librerías React que renderizan en `document.body` quedan fuera del shadow root y pierden los estilos; `@font-face` debe declararse en el documento; herramientas de testing/analytics que no atraviesan shadow roots; y FOUC si los estilos llegan tarde. Úsalo cuando el aislamiento es requisito (widget en página de terceros, MFEs multi-framework con resets contradictorios), no por defecto.

**4. Z-index y capas:** los overlays de dos MFEs compiten. Solución organizacional: escala de z-index del design system (tokens `--acme-z-modal: 1000`) y idealmente un solo "overlay manager" del shell donde los MFEs piden montar modales/toasts. CSS `@layer` también ayuda a ordenar la precedencia entre shell, DS y MFEs sin guerras de especificidad.

**Errores comunes:** confiar solo en "usamos styled-components" e ignorar los estilos globales de librerías de terceros que cada MFE importa (un datepicker que estila `.calendar` global); dos MFEs cargando versiones distintas del CSS del design system (gana el último en llegar); y depender del orden de carga de los `<style>` — que en MFEs es no determinista por definición.

**Qué espera oír el entrevistador:** defensa en capas (build scoping + convenciones lintadas + shadow DOM selectivo), quién es dueño de reset/body/tipografía, los agujeros de cada técnica (portales fuera del shadow root, herencia de custom properties como feature de theming), y que el orden de carga de CSS en MFEs es no determinista — cualquier diseño que dependa de él está roto.

---

## 16. Deployment independiente: versionado de remotes, manifests y estrategias de release
**Categoría:** Delivery · **Tipo:** Conceptual

### 📝 Respuesta resumen
El deploy independiente se implementa con assets inmutables versionados por build + una capa de indirección mutable (manifest o import map) que dice qué versión está "activa". Desplegar = subir assets nuevos y mover el puntero; rollback = mover el puntero atrás (segundos, sin rebuild). Sobre esa base se montan canary por porcentaje, entornos con el mismo artefacto y trazabilidad de qué versión de cada MFE vio cada usuario. El caching es el detalle que lo hace funcionar o arder: puntero con TTL corto, assets con cache infinito.

### 📖 Respuesta detallada
**Estructura en el CDN — inmutabilidad por build:**

```text
cdn.acme.com/checkout/
  builds/3421/remoteEntry.js     Cache-Control: public, max-age=31536000, immutable
  builds/3421/chunk-abc123.js    (hash en nombre, nunca se sobreescribe)
  builds/3420/...                (builds anteriores se conservan para rollback)
```

**La capa de indirección (manifest):**

```json
// GET https://config.acme.com/mfe-manifest?env=prod  (Cache-Control: no-cache o TTL 30-60s)
{
  "checkout": { "version": "3.4.21", "url": ".../checkout/builds/3421/remoteEntry.js" },
  "catalog":  { "version": "1.18.7", "url": ".../catalog/builds/1187/remoteEntry.js" }
}
```

El shell resuelve remotes dinámicos contra este manifest (pregunta 5). El pipeline de cada equipo: build → tests → subir `builds/N/` → smoke test contra staging → actualizar su entrada del manifest de prod. **Nadie rebuildeó el shell ni a los demás.**

**Lo que esta base habilita:**
- **Rollback en segundos:** revertir el puntero a `builds/3420`. Por eso jamás se borran ni sobreescriben builds anteriores; y por eso "sobreescribir remoteEntry.js en el mismo path" es un antipatrón: usuarios con el HTML/manifest viejo cacheado pedirían chunks que ya no existen (los 404 de chunks post-deploy son el síntoma canónico).
- **Canary / release progresivo:** el servicio de manifest decide por usuario/cohorte: 5% recibe `3.4.21`, el resto `3.4.20`; se observa la tasa de errores por versión y se promueve o revierte automáticamente.
- **Promoción entre entornos del mismo artefacto:** el build `3421` es idéntico en staging y prod; solo cambia el manifest. Configuración por entorno en runtime (endpoint de config), nunca horneada en el bundle.
- **Trazabilidad:** el shell registra en cada sesión el vector de versiones (`checkout@3.4.21, catalog@1.18.7`) y lo adjunta a errores/analytics — sin esto, debuggear "producción" es debuggear una combinación desconocida (ver observabilidad, archivo de casos).

**Versionado y compatibilidad:** cada release de remote debe ser compatible con el contrato vigente (pregunta 12), porque el shell y los demás MFEs no se redespliegan a la vez. Los breaking del contrato requieren convivencia de versiones, no deploy sincronizado. Un smoke E2E post-deploy (shell de prod + remote nuevo en staging) antes de mover el puntero de prod atrapa la mayoría de roturas de integración.

**Errores comunes:** cachear el manifest/remoteEntry agresivamente (deploys que "no salen" o salen a medias); builds no reproducibles que impiden saber qué hay desplegado; entornos que requieren rebuild (config horneada); y pipelines que actualizan el manifest sin gate de smoke tests — el deploy independiente sin verificación automática es ruleta rusa organizacional.

**Qué espera oír el entrevistador:** el patrón assets inmutables + puntero mutable, la política de caching bifurcada (TTL corto para el puntero, immutable para chunks), rollback como movimiento de puntero, canary por manifest, y trazabilidad del vector de versiones por sesión.

---

## 17. Estrategias de testing en microfrontends: E2E cross-MFE y contract testing
**Categoría:** Testing · **Tipo:** Conceptual

### 📝 Respuesta resumen
La pirámide se adapta: cada equipo cubre su MFE con tests unitarios/integración normales; la novedad son las costuras. Ahí van los contract tests (verificar en CI que el remote cumple la interfaz de montaje, props y eventos que el shell espera, sin levantar todo el sistema) y una capa fina de E2E cross-MFE sobre flujos críticos (login → catálogo → checkout) contra un entorno integrado, como gate de promoción y no como suite gigante. El antipatrón: una suite E2E monolítica de todo el sistema que ningún equipo posee y bloquea a todos.

### 📖 Respuesta detallada
**1. Tests dentro del MFE (responsabilidad del equipo):** unit + integración con el framework de siempre; el MFE se desarrolla standalone (modo dev donde se monta solo, con el shell simulado por un harness que le inyecta props falsas). Nada nuevo, salvo la disciplina de testear `mount`/`unmount` explícitamente:

```ts
test('mount/unmount no filtra listeners', () => {
  const el = document.createElement('div');
  const before = getEventListenerCount(window); // via harness/patch en test
  const unmount = mount(el, fakeProps());
  unmount();
  expect(getEventListenerCount(window)).toBe(before);
});
```

**2. Contract tests — la pieza clave.** Verifican las costuras sin integrar todo:
- **Del lado del remote (provider):** un test en el CI de checkout que carga su propio build federado y valida el contrato: expone `./CheckoutApp`, `mount` acepta `MfeMountProps` v1, emite `acme.cart.item-added` con el shape versionado. Puede ser tan simple como montar en jsdom/happy-dom con props mínimas y no lanzar.
- **Del lado del shell (consumer):** tests del shell contra un remote *falso* que implementa el contrato — verifican que el shell pasa las props correctas, maneja el fallo de carga (fallback UI) y escucha los eventos.
- Con esquemas de eventos versionados se puede aplicar la idea de Pact: el consumidor publica qué espera, el provider verifica en su CI que lo cumple; para MFEs suele bastar un paquete `@acme/mfe-contract` con tipos + tests que fallan si el tipo cambia de forma incompatible.

**3. E2E cross-MFE — poca y crítica.** Un repo de "journey tests" (Playwright/Cypress) con los 5-10 flujos que cruzan MFEs, corriendo: (a) nightly contra staging integrado, y (b) como gate al promover un remote (shell prod + remote candidato, vía manifest de staging u override: muchos equipos implementan `?mfe-override=checkout:3421` para apuntar un remote concreto en cualquier entorno — también utilísimo para debugging). Reglas: dueño explícito (equipo de plataforma), presupuesto de tiempo (<10 min), cero tolerancia a flaky.

**4. Otras capas que se olvidan:** visual regression del design system y de las páginas de integración (las roturas cross-MFE suelen ser visuales: CSS que se pisa); smoke test sintético en producción post-deploy (monta cada remote y verifica render básico); y tests de resiliencia — ¿qué renderiza el shell si un remote responde 500 o tarda 10 s? Eso también es comportamiento a testear, no solo a implementar.

**Errores comunes:** suite E2E gigante compartida que se vuelve flaky y sin dueño (los equipos la ignoran); testear solo el happy path de integración y descubrir en producción el fallo de carga de un remote; contract tests que testean implementación (snapshot del DOM del remote) en vez de interfaz; y no testear la matriz de versiones que realmente convive en producción durante un rollout progresivo.

**Qué espera oír el entrevistador:** desplazar el esfuerzo de E2E masivo hacia contract tests en las costuras; provider/consumer tests concretos; E2E mínima con dueño y presupuesto; el patrón de override de remotes para probar candidatos contra prod; y testing de resiliencia de carga como parte de la definición de "hecho".

---

## 18. Performance en microfrontends: duplicación, waterfall de carga y prefetch
**Categoría:** Performance · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los tres impuestos de performance de los MFEs client-side: duplicación de dependencias (N copias de framework/librerías si `shared` está mal), waterfall de carga (HTML → shell → manifest → remoteEntry → chunks → datos: cada flecha es un round-trip) y coste de orquestación en el hilo principal. Las armas: shared/singleton bien configurado y auditado con bundle analysis, aplanar el waterfall con preload/prefetch y carga en paralelo, presupuestos de bundle por MFE en CI, y SSR/edge para el contenido crítico si la página es pública.

### 📖 Respuesta detallada
**1. Duplicación de dependencias.** Sin `shared` correcto, cada remote trae su React, su lodash, su librería de fechas: 3 MFEs × 150 KB = payload y *parse/compile* triplicados (el coste de CPU en móviles importa tanto como los KB). Auditoría: `webpack-bundle-analyzer` sobre cada remote + un job de CI que compara los módulos de todos los builds y falla si una dependencia "compartible" aparece duplicada por encima de un umbral. Ojo con las duplicaciones invisibles: versiones distintas de una transitive dependency (dos `date-fns` por rangos incompatibles) no las resuelve `shared` si los rangos no intersectan.

**2. Waterfall de carga.** El peor caso client-side:

```text
HTML → shell.js → manifest.json → remoteEntry.js → chunk del MFE → llamada API → render
```

Seis round-trips secuenciales antes del primer contenido útil. Mitigaciones concretas:
- **Inlinear el manifest en el HTML** (el server lo inyecta al renderizar el shell): elimina un salto entero.
- **Preload de lo cierto:** si la URL es `/checkout`, el server/shell sabe qué remote hará falta: `<link rel="preload" as="script" href=".../remoteEntry.js">` para la ruta actual, y `import()` del remote **en paralelo** con el bootstrap del shell, no después.
- **Prefetch de lo probable:** `rel="prefetch"` (prioridad baja, en idle) de los remotes de las rutas más navegadas desde la actual — p. ej. al hover/viewport del link, prefetch de `remoteEntry` del destino. Con datos de navegación real se prefetcha lo que de verdad se usa; prefetchearlo todo compite con la ruta crítica y empeora las cosas en redes lentas (respetar `navigator.connection.saveData`).
- **Iniciar el fetch de datos junto con el código** (route-level data loading en el shell o en el entry del remote), en vez de esperar al render para descubrir qué datos pedir.

**3. Coste de orquestación y UX de carga.** Cada mount de remote pasa por negociación de shared y evaluación de chunks en el main thread; los estados de carga parciales (cuatro spinners independientes) degradan la percepción y provocan layout shift. Reservar dimensiones (skeletons con tamaño real) protege el CLS; agrupar la aparición de secciones evita el efecto "poltergeist". Medir INP/LCP **por MFE** con atribución (qué script/remote causó el long task) para que el presupuesto tenga dueño.

**4. Gobernanza:** presupuestos por remote en CI (`size-limit`/bundlesize: p. ej. checkout ≤ 180 KB gz sin contar shared), Lighthouse CI en los journeys principales, y revisión del vector completo: la performance de la página es la suma de equipos autónomos — sin presupuesto por equipo, es la tragedia de los comunes.

**Errores comunes:** `eager: true` generalizado "para simplificar" (todo el vendor en el entry del shell); prefetch indiscriminado de todos los remotes; medir performance solo del shell; y olvidar que `remoteEntry.js` con TTL corto se revalida a menudo — mantenerlo pequeño (solo manifiesto, sin vendor) es parte del diseño.

**Qué espera oír el entrevistador:** los tres impuestos con números plausibles, el waterfall dibujado paso a paso y cómo aplanarlo (inline manifest, preload por ruta, paralelizar código+datos), prefetch selectivo basado en navegación real, y presupuestos por equipo en CI como mecanismo de gobierno.
