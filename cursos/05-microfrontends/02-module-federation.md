# Módulo 2 · Module Federation a fondo

> **Curso 05 · Microfrontends** · 150 min

## Por qué esto importa en la entrevista

Module Federation es el estándar de facto, y las preguntas se vuelven muy concretas muy rápido: *"¿cómo evitas dos Reacts en la página?"*, *"¿qué pasa si el host tiene React 18 y el remote pide 17?"*. Para responderlas hay que saber **qué hace el runtime**, no solo copiar la configuración.

## Modelo mental: un módulo que se resuelve por red en tiempo de ejecución

```
host (shell)                              remote (equipo checkout)
─────────────                             ────────────────────────
import('checkout/Carrito')
   │ 1. carga remoteEntry.js  ───────────► expone un "container"
   │ 2. container.init(sharedScope)  ◄──── negocia dependencias compartidas
   │ 3. container.get('./Carrito')   ◄──── devuelve una factory
   └─ 4. ejecuta la factory y renderiza
```

Las tres piezas de la configuración:

```js
new ModuleFederationPlugin({
  name: 'checkout',
  filename: 'remoteEntry.js',
  exposes: { './Carrito': './src/Carrito' },          // lo que este remote publica
  remotes: { catalogo: 'catalogo@https://cdn/x/remoteEntry.js' },  // lo que consume
  shared: {
    react:       { singleton: true, requiredVersion: '^18.2.0', eager: false },
    'react-dom': { singleton: true, requiredVersion: '^18.2.0' },
    '@empresa/design-system': { singleton: true, requiredVersion: '^3.0.0' },
  },
})
```

## `shared`, `singleton` y la negociación de versiones

Al iniciarse, cada container registra en el **scope compartido** las versiones que trae y pide las que necesita. El runtime elige, para cada paquete, **la versión más alta que satisfaga los rangos**; si un remote pide algo incompatible:

- **Sin `singleton`:** carga *su propia copia*. Funciona, pero duplicas bytes y —lo importante— rompes todo lo que dependa de una única instancia (el estado interno de React, los contextos, los hooks).
- **Con `singleton: true`:** solo hay una instancia. Si la versión cargada no cumple `requiredVersion`, verás el aviso *"Unsatisfied version"* en consola; con `strictVersion: true` se convierte en error.

**La causa real de "dos Reacts en la página":** un remote que no declara React como `shared`, o que lo declara sin `singleton`, o rangos incompatibles (host `^18`, remote `^17`). El síntoma clásico es *"Invalid hook call"* o contextos que aparecen vacíos.

**Reglas prácticas que debes recitar:**
1. `singleton: true` para React, ReactDOM, el router y el design system (todo lo que tenga estado global o contexto).
2. Rangos amplios y coordinados (`^18.2.0`), y una política de actualización acordada entre equipos.
3. `eager: true` **solo** en el host y solo si sabes lo que haces: mete la dependencia en el bundle inicial y anula la carga asíncrona.
4. Verifica en producción: un test que falle si hay más de una instancia de React en la página.

## Remotes dinámicos

El problema de `remotes: { x: 'x@https://...' }` es que la URL queda **en el build**: cambiarla obliga a reconstruir el host, y eso mata el despliegue independiente. Solución: resolver la URL en runtime desde un *manifest*.

```js
async function cargarRemoto(url, scope, modulo) {
  await __webpack_init_sharing__('default');       // prepara el scope compartido
  await import(/* webpackIgnore: true */ url);     // carga remoteEntry.js
  const container = window[scope];
  await container.init(__webpack_share_scopes__.default);
  const factory = await container.get(modulo);
  return factory();
}
// el manifest (JSON en la CDN) mapea nombre → URL versionada; se cachea con TTL corto
```

Este patrón es el que permite versionar remotes por entorno, hacer rollback cambiando un JSON y desplegar sin tocar el host. **Module Federation 2.0** (y su implementación en Rspack) trae esto de serie: manifest, tipos compartidos entre remotes, mejores errores en tiempo de ejecución y hooks de runtime. Si te preguntan por MF 2.0, esos cuatro puntos son la respuesta.

## Alternativas y cuándo elegirlas

- **single-spa:** orquesta aplicaciones completas con un ciclo de vida explícito (`bootstrap`, `mount`, `unmount`). Es agnóstico del bundler y encaja bien cuando integras frameworks distintos o aplicaciones ya existentes. Module Federation comparte *módulos*; single-spa orquesta *aplicaciones*. Se combinan a menudo.
- **Import maps nativos + web components:** sin lock-in de bundler, estándar del navegador. Aislamiento con Shadow DOM. Más simple conceptualmente, menos ergonómico para React y con menos tooling.
- **iframes:** aislamiento total, ver [módulo 1](01-por-que-y-cuando.md).
- **Multi-zone (Next.js):** cada zona es una app completa que sirve un prefijo de ruta. Muy simple, pero la navegación entre zonas es una navegación completa (pierdes estado del cliente).

**💬 Cómo lo dices:** *"Elijo Module Federation cuando comparto dependencias pesadas y quiero una SPA fluida; single-spa cuando integro aplicaciones heterogéneas ya existentes; import maps si quiero apoyarme en el estándar y no en un bundler."*

## Errores comunes que delatan a un no-senior

- No declarar `singleton` en React/router/design system.
- URLs de remotes fijadas en el build del host.
- `eager: true` copiado de un ejemplo sin entenderlo.
- Exponer componentes de grano fino (un botón) en vez de fragmentos de dominio.
- No tener plan para cuando un remote no carga (ver [módulo 4](04-operacion-y-performance.md)).
- Confundir Module Federation con single-spa.

## 🧪 Laboratorio

1. **Monta shell + 2 remotes** con webpack 5 o Rspack. Renderiza un componente remoto en el shell.
2. **Provoca los dos Reacts:** quita `singleton` y pon versiones distintas; observa el error de hooks y confirma en DevTools que hay dos instancias. Arréglalo y verifica con un chequeo en runtime.
3. **Remote dinámico:** implementa el cargador de arriba con un manifest JSON. Cambia la versión de un remote **sin reconstruir el host** y demuestra el rollback editando el manifest.
4. **Versión incompatible:** host `^18`, remote `^17` con `strictVersion`. Observa el fallo y diseña la política de actualización entre equipos.
5. **Compara con single-spa:** integra el mismo remote con single-spa y anota diferencias de ciclo de vida y de esfuerzo.

## ✅ Autoevaluación

1. Describe los cuatro pasos que ejecuta el runtime al cargar un remote.
2. ¿Cómo se negocia la versión de una dependencia compartida y qué hace `singleton`?
3. Causas y síntomas de "dos Reacts en la página".
4. ¿Por qué las URLs de remotes no deben estar en el build y cómo lo resuelves?
5. ¿Qué aporta Module Federation 2.0?
6. Module Federation vs single-spa vs import maps: criterio de elección.

## 🎯 Preguntas del banco que ya puedes responder

- [`microfrontends/01-fundamentos-y-arquitectura.md`](../../microfrontends/01-fundamentos-y-arquitectura.md) — 3, 4, 5, 6, 7, 8
- [`microfrontends/02-casos-y-problemas.md`](../../microfrontends/02-casos-y-problemas.md) — 1 (dos Reacts), 3 (bundle gigante)

---

**Anterior:** [Módulo 1](01-por-que-y-cuando.md) · **Siguiente:** [Módulo 3 · Integración en runtime](03-integracion-runtime.md)
