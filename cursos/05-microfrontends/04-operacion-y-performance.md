# Módulo 4 · Operación: deploy, performance y observabilidad

> **Curso 05 · Microfrontends** · 120 min

## Por qué esto importa en la entrevista

Aquí es donde se comprueba si has *operado* microfrontends o solo los has montado. Las tres preguntas que definen el nivel: cómo despliegas un remote sin romper a nadie, cómo evitas que la página tarde 6 segundos en pintar, y cómo sabes de quién es un error en producción.

## Despliegue independiente sin romper a los demás

El error del banco (*"un deploy de un remote rompió producción para todos"*) tiene una causa estructural: **el host cargaba `latest`**. Si el remote es mutable, cada deploy es un despliegue global sin control.

El patrón correcto:

```
1. Build del remote  →  artefactos con hash inmutable
                        /checkout/1.4.2/remoteEntry.js
2. Publicar en CDN   →  inmutable, cache-control: max-age=31536000
3. Actualizar el manifest (JSON pequeño, TTL corto: 30–60 s)
      { "checkout": "https://cdn/checkout/1.4.2/remoteEntry.js" }
4. El host lee el manifest en runtime  →  rollback = editar el manifest
```

Ventajas que debes verbalizar: rollback en segundos sin build, canary por porcentaje o por cohorte (el manifest puede servir versiones distintas según usuario), y **cachés coherentes** (artefactos inmutables cacheados para siempre; solo el manifest es dinámico).

Y las reglas de compatibilidad: el shell y los remotes evolucionan por separado, así que **el contrato manda** — cambios aditivos, periodo de convivencia de versiones y tests de integración que ejecuten la matriz shell × remote antes de publicar.

## Resiliencia: qué pasa si un remote no carga

Un remote es una dependencia de red: **fallará**. El shell debe:

```jsx
<ErrorBoundary fallback={<TarjetaDegradada equipo="checkout" />}>
  <Suspense fallback={<Skeleton />}>
    <RemotoCheckout />          {/* import() con timeout y reintento único */}
  </Suspense>
</ErrorBoundary>
```

- **Error boundary por remote**, nunca uno global: un fallo del widget de recomendaciones no puede tumbar el checkout.
- **Timeout** en la carga del remote y fallback definido (contenido estático, versión anterior cacheada, o simplemente ocultar la sección).
- **Fallback de versión:** si `1.4.2` no carga, intentar la última buena conocida.
- **Aviso de degradación** al usuario solo si afecta a lo que estaba haciendo.

## Performance: los dos enemigos

### 1. Duplicación de dependencias

Síntoma: el bundle total es enorme aunque cada equipo "optimizó el suyo". Causas: dependencias no compartidas, versiones divergentes, o cada remote empaquetando el design system.

Herramientas y acciones: `webpack-bundle-analyzer` por remote **y** un análisis agregado de lo que carga la página real; presupuesto de bytes por remote acordado entre equipos y comprobado en CI; `shared` bien configurado ([módulo 2](02-module-federation.md)); y sacar las librerías pesadas comunes a `singleton`.

### 2. Waterfall de carga

```
shell.js → manifest.json → remoteEntry.js → chunk del componente → datos (API)
   200ms  →    50ms       →     150ms      →      200ms          →   300ms   = ~900 ms encadenados
```

Cada flecha es un round-trip **secuencial**. Mitigaciones:

- `<link rel="preload">` / `modulepreload` del `remoteEntry` de los remotes de la ruta actual, y `dns-prefetch`/`preconnect` a la CDN.
- **Prefetch en interacción:** al pasar el ratón o al hacer foco en el enlace, empieza a cargar el remote.
- Manifest **inline** en el HTML del shell (evita un round-trip completo).
- Cargar en paralelo lo que no dependa entre sí, y no bloquear el primer render con remotes secundarios.
- SSR o pintar el esqueleto del shell primero para que el LCP no dependa de la red de terceros.

**Métricas que debes citar:** LCP, INP y CLS (Core Web Vitals), más el tiempo hasta que cada remote es interactivo, medido en **usuarios reales** (RUM), no solo en Lighthouse. Y segmentado por remote: solo así puedes decir qué equipo está degradando la página.

## SSR con microfrontends

Es la parte difícil. Opciones honestas:

- **Multi-zone (Next.js):** cada zona hace su propio SSR; la navegación entre zonas es completa. Simple y sólido; el coste es la pérdida de estado del cliente al cruzar.
- **Composición en servidor/edge** de fragmentos HTML (SSI/ESI, workers): buen first paint y caché por fragmento; la hidratación coordinada es lo complicado.
- **MF con SSR:** posible, pero requiere resolver módulos también en el servidor, compartir el estado de hidratación y sincronizar versiones. Complejidad alta; recomiéndalo solo con equipo de plataforma dedicado.

Decir con claridad *"si necesitas SSR de verdad, empieza por multi-zone; MF con SSR solo si el equipo puede sostenerlo"* es una respuesta madura.

## Observabilidad: ¿de quién es este error?

- **Atributo de equipo/remote en cada señal:** errores, trazas y métricas etiquetados con `mfe: checkout`, `version: 1.4.2`. Sin eso, el error tracking es una lista de culpables anónimos.
- **Source maps por remote** subidos al sistema de errores (privados, no públicos).
- **Enrutado de alertas por dueño**: el error de un remote debe despertar a su equipo, no al del shell.
- **Trazado de front a back:** propaga `traceparent` desde el navegador para poder seguir una acción del usuario hasta el servicio backend ([curso 00 módulo 6](../00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)).
- **Dashboard por remote**: errores/min, tiempo de carga, tasa de fallo de carga del propio remote.

## Testing en microfrontends

Pirámide adaptada: unitarios dentro de cada remote (rápidos, propiedad del equipo); **contract tests** del contrato shell↔remote (props, eventos, versiones compartidas); E2E **críticos y pocos**, sobre el recorrido completo (login → catálogo → checkout), ejecutados contra las versiones que están en el manifest de producción; y tests visuales para detectar regresiones del design system.

Punto fino: los E2E cruzan propiedad de varios equipos, así que hay que decidir **quién los mantiene y quién responde cuando fallan**. Sin esa decisión, se abandonan en tres meses.

## Errores comunes que delatan a un no-senior

- Remotes servidos como `latest` sin versionado inmutable.
- Sin error boundary por remote.
- No medir el bundle agregado real de la página.
- Ignorar el waterfall y culpar a "la red".
- Errores sin atribución de equipo.
- E2E sin dueño.

## 🧪 Laboratorio

1. **Pipeline completo:** publica un remote versionado en una CDN (o un bucket) con manifest; despliega una versión rota y **haz rollback editando solo el manifest**. Cronometra.
2. **Caos de remote:** bloquea la URL de un remote (DevTools → Network → Block) y verifica que el resto de la página sigue funcionando y muestra el fallback.
3. **Waterfall:** mide el LCP con y sin `modulepreload` + manifest inline. Anota la mejora.
4. **Presupuesto de bundle:** añade a CI un chequeo que falle si el remote supera N KB gzip.
5. **Atribución de errores:** lanza un error a propósito desde un remote y comprueba que llega etiquetado con equipo y versión, y que la alerta va a quien debe.

## ✅ Autoevaluación

1. ¿Cómo despliegas un remote sin poder romper a los demás y cómo haces rollback?
2. ¿Qué pasa si un remote no carga? Diseña la degradación.
3. Explica el waterfall de carga y tres formas de reducirlo.
4. ¿Cómo mides quién degrada el rendimiento de la página?
5. SSR con microfrontends: opciones y cuál recomiendas por defecto.
6. ¿Cómo sabes de qué equipo es un error en producción?

## 🎯 Preguntas del banco que ya puedes responder

- [`microfrontends/01-fundamentos-y-arquitectura.md`](../../microfrontends/01-fundamentos-y-arquitectura.md) — 16, 17, 18
- [`microfrontends/02-casos-y-problemas.md`](../../microfrontends/02-casos-y-problemas.md) — 2 (deploy que rompió producción), 8 (waterfall), 10 (SSR multi-zone), 12 (observabilidad por equipo)

---

**Anterior:** [Módulo 3](03-integracion-runtime.md) · **Fin del curso 05.**
