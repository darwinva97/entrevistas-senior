# Módulo 3 · Integración: routing, estado, estilos y sesión

> **Curso 05 · Microfrontends** · 150 min

## Por qué esto importa en la entrevista

Montar un remote es fácil; **hacer que varios equipos convivan en la misma página sin pisarse** es lo difícil. Aquí están los casos que aparecen en producción y en el banco: estilos que se pisan, sesión desincronizada, fugas al desmontar, acoplamiento accidental entre equipos.

## El contrato: la pieza central

El contrato de un microfrontend tiene **cinco partes**, y saber enumerarlas es la respuesta a "¿qué es exactamente el contrato de un MFE?":

1. **Punto de montaje:** cómo se monta y desmonta (`mount(el, props)` / `unmount(el)`), o el componente expuesto.
2. **Props de entrada:** datos que el shell provee (usuario, locale, tema, feature flags, callbacks de navegación).
3. **Eventos de salida:** lo que el remote comunica hacia arriba (navegar, cambio de carrito, error).
4. **Dependencias compartidas:** versiones de React/router/design system que espera.
5. **Requisitos de entorno:** rutas que reclama, permisos, endpoints que consume.

**Versiona el contrato como versionarías una API** (ver [curso 07](../07-apis-y-versionado/)): añadir props opcionales es compatible; cambiar el significado de una prop o eliminarla es breaking. Y comprueba el contrato en CI con tests de integración o *contract tests* de UI.

## Routing: quién es dueño de la URL

El patrón sano: **el shell posee el enrutado de primer nivel** y delega el resto.

```
/            → shell (home)
/catalogo/*  → remote catálogo (posee todo lo que hay debajo)
/checkout/*  → remote checkout
```

Reglas: una única instancia del router (`singleton`), el shell decide qué remote monta para cada prefijo, y los remotes **nunca** manipulan `window.history` directamente — usan la API de navegación que el shell les pasa. Si dos routers escuchan `popstate`, aparecen dobles renderizados y navegaciones fantasma: es un bug clásico y difícil de depurar.

Enlaces entre microfrontends: por URL (no por importación directa de otro remote), para no acoplar equipos.

## Comunicación entre microfrontends: minimízala

Jerarquía, de mejor a peor:

1. **Props y callbacks desde el shell.** Explícito, tipado, testeable.
2. **La URL como estado compartido.** Filtros, ids, pestañas: es la opción más subestimada y la que mejor sobrevive a recargas.
3. **Eventos del navegador o un bus mínimo** (`CustomEvent` sobre un canal con nombre y payload versionado) para notificaciones puntuales: "carrito actualizado".
4. **Estado global compartido** (un store común): úsalo solo para datos verdaderamente transversales (sesión, tema, flags). Es acoplamiento fuerte: si el equipo A cambia la forma del estado, rompe al equipo B.

> **⚠️ Trampa:** un store global compartido "para que todo sea más fácil" convierte tus microfrontends en un monolito distribuido con peor depuración. La comunicación excesiva es la señal de que las fronteras están mal trazadas: si dos remotes hablan todo el rato, probablemente deberían ser uno.

## Sesión y autenticación

Lo que preguntan: *"¿dónde vives el token si cada MFE hace llamadas?"*.

- **El shell es dueño de la sesión.** Autentica (OIDC), guarda el token y lo provee: o pasándolo por props/contexto, o —mejor— exponiendo un **cliente HTTP compartido** que ya inyecta el token, lo refresca y maneja el 401. Así ningún remote toca el token.
- **Cookies `HttpOnly` + `SameSite`** si todos los MFE viven bajo el mismo dominio: el navegador lo hace por ti y evitas guardar tokens en `localStorage` (donde cualquier XSS los roba — ver [curso 06](../06-seguridad/)).
- **Refresco de token:** una sola entidad debe refrescar (el shell), con coalescing para que N peticiones simultáneas no disparen N refrescos.
- **Cierre de sesión y expiración:** hay que propagarlo a todos los remotes montados (evento global) o quedan mostrando datos de un usuario que ya no está. Ese es el caso 7 del banco.

## Aislamiento de estilos

| Técnica | Aislamiento | Coste |
|---|---|---|
| CSS Modules / CSS-in-JS con hash | alto en la práctica | requiere disciplina de build |
| Prefijos por equipo (`.chk-`) | medio, por convención | fácil de violar |
| Shadow DOM | **total** | difícil con librerías que inyectan estilos en `head`, portales, y accesibilidad |
| iframe | total | ver módulo 1 |

Los que fallan siempre: estilos globales (`body`, `*`, resets duplicados), z-index sin escala acordada, y variables CSS con el mismo nombre y distinto significado. **Un design system con tokens (custom properties) y una escala de z-index documentada resuelve el 90%** de los conflictos.

## Fugas de memoria al montar/desmontar

Cuando el shell monta y desmonta remotes al navegar, todo lo que el remote registre y no limpie se acumula:

- Listeners globales (`window.addEventListener`) sin `removeEventListener`.
- Timers e intervalos.
- Suscripciones a stores o WebSockets.
- Observadores (`IntersectionObserver`, `MutationObserver`, `ResizeObserver`).
- Nodos DOM retenidos por closures.

**Diagnóstico:** navega 20 veces entre dos MFEs, fuerza GC en DevTools y compara heap snapshots (*Comparison*); mira también el contador de listeners y de nodos DOM separados (*Detached*). El contrato debe exigir un `unmount` que limpie todo, y el shell debe llamarlo siempre.

## Errores comunes que delatan a un no-senior

- Cada remote gestionando su propio token.
- Bus de eventos sin versionar el payload (acoplamiento invisible).
- Dos routers manipulando el historial.
- Estilos globales sin aislamiento y sin tokens.
- No definir `unmount` ni limpiar suscripciones.
- Importar directamente código de otro remote en vez de navegar por URL.

## 🧪 Laboratorio

1. **Define el contrato** de tus dos remotes en un documento y en tipos TypeScript compartidos (paquete versionado). Rompe una prop a propósito y comprueba que CI lo detecta.
2. **Sesión compartida:** implementa el cliente HTTP del shell con inyección de token y refresco coalescido; simula un token expirado con 3 llamadas simultáneas y verifica que solo hay un refresco.
3. **Logout global:** propaga el cierre de sesión a los remotes montados y comprueba que ninguno sigue mostrando datos privados.
4. **Colisión de estilos:** provoca que un remote pise al otro; arréglalo con CSS Modules y luego con Shadow DOM; anota qué se rompe con Shadow DOM (portales, librerías de UI).
5. **Fuga al desmontar:** añade un `setInterval` y un listener global sin limpiar; reprodúcelo con 20 navegaciones y encuéntralo en los snapshots. Arréglalo.

## ✅ Autoevaluación

1. Enumera las cinco partes del contrato de un MFE.
2. ¿Quién es dueño de la URL y por qué no debe haber dos routers?
3. Ordena las cuatro formas de comunicación entre MFEs y di cuándo cada una.
4. ¿Dónde vive el token y cómo se refresca sin condiciones de carrera?
5. Tres formas de aislar CSS con sus trade-offs.
6. ¿Cómo diagnosticas una fuga de memoria al navegar entre microfrontends?

## 🎯 Preguntas del banco que ya puedes responder

- [`microfrontends/01-fundamentos-y-arquitectura.md`](../../microfrontends/01-fundamentos-y-arquitectura.md) — 10, 11, 12, 13, 14, 15
- [`microfrontends/02-casos-y-problemas.md`](../../microfrontends/02-casos-y-problemas.md) — 5 (estilos), 6 (memory leak), 7 (auth desincronizada), 9 (design system)

---

**Anterior:** [Módulo 2](02-module-federation.md) · **Siguiente:** [Módulo 4 · Operación y performance](04-operacion-y-performance.md)
