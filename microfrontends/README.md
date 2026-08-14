# Entrevistas Senior — Microfrontends

Guía de preparación para entrevistas técnicas de arquitectura frontend senior, especializada en microfrontends. Cada pregunta incluye una **respuesta resumen** (lo que dirías en 30–60 segundos) y una **respuesta detallada** (código realista, trade-offs, errores comunes y qué espera oír el entrevistador).


> 🎓 **¿Te faltan bases para responder esto?** El curso [Microfrontends](../cursos/05-microfrontends/) enseña exactamente lo necesario, con laboratorios y autoevaluación.
> Ver también: [índice completo](../INDICE.md) · [plan de estudio](../PLAN-DE-ESTUDIO.md) · [glosario](../GLOSARIO.md) · [inicio](../README.md)

## Archivos

| Archivo | Contenido | Preguntas |
|---|---|---|
| [01-fundamentos-y-arquitectura.md](./01-fundamentos-y-arquitectura.md) | Conceptos, patrones y decisiones de arquitectura | 18 |
| [02-casos-y-problemas.md](./02-casos-y-problemas.md) | Casos de análisis de problemas reales [CASO] | 12 |

---

## 01 — Fundamentos y arquitectura

1. [¿Qué son los microfrontends y cuándo NO deberías usarlos?](./01-fundamentos-y-arquitectura.md#1-qué-son-los-microfrontends-y-cuándo-no-deberías-usarlos)
2. [Patrones de composición: build-time, server-side, edge-side y client-side](./01-fundamentos-y-arquitectura.md#2-patrones-de-composición-build-time-server-side-edge-side-y-client-side)
3. [Module Federation en webpack 5: ¿cómo funciona y cómo se configura?](./01-fundamentos-y-arquitectura.md#3-module-federation-en-webpack-5-cómo-funciona-y-cómo-se-configura)
4. [`shared`, `singleton` y la negociación de versiones: ¿cómo evitas dos Reacts en la página?](./01-fundamentos-y-arquitectura.md#4-shared-singleton-y-la-negociación-de-versiones-cómo-evitas-dos-reacts-en-la-página)
5. [Remotes dinámicos: cargar microfrontends cuya URL no se conoce en build](./01-fundamentos-y-arquitectura.md#5-remotes-dinámicos-cargar-microfrontends-cuya-url-no-se-conoce-en-build)
6. [Module Federation 2.0 y Rspack: ¿qué cambia respecto a MF clásico?](./01-fundamentos-y-arquitectura.md#6-module-federation-20-y-rspack-qué-cambia-respecto-a-mf-clásico)
7. [single-spa: arquitectura, ciclo de vida y cuándo elegirlo sobre Module Federation](./01-fundamentos-y-arquitectura.md#7-single-spa-arquitectura-ciclo-de-vida-y-cuándo-elegirlo-sobre-module-federation)
8. [Import maps nativos y web components como base de microfrontends sin lock-in de bundler](./01-fundamentos-y-arquitectura.md#8-import-maps-nativos-y-web-components-como-base-de-microfrontends-sin-lock-in-de-bundler)
9. [iframes para microfrontends: ¿cuándo son la respuesta correcta?](./01-fundamentos-y-arquitectura.md#9-iframes-para-microfrontends-cuándo-son-la-respuesta-correcta)
10. [Routing en una arquitectura shell/container: ¿quién es dueño de la URL?](./01-fundamentos-y-arquitectura.md#10-routing-en-una-arquitectura-shellcontainer-quién-es-dueño-de-la-url)
11. [Comunicación entre microfrontends: custom events, pub/sub y por qué minimizarla](./01-fundamentos-y-arquitectura.md#11-comunicación-entre-microfrontends-custom-events-pubsub-y-por-qué-minimizarla)
12. [Diseño de contratos entre equipos: ¿qué es exactamente "el contrato" de un MFE?](./01-fundamentos-y-arquitectura.md#12-diseño-de-contratos-entre-equipos-qué-es-exactamente-el-contrato-de-un-mfe)
13. [Design system compartido: versionado de la librería UI entre equipos autónomos](./01-fundamentos-y-arquitectura.md#13-design-system-compartido-versionado-de-la-librería-ui-entre-equipos-autónomos)
14. [Autenticación y sesión compartida entre microfrontends](./01-fundamentos-y-arquitectura.md#14-autenticación-y-sesión-compartida-entre-microfrontends)
15. [Aislamiento de CSS entre microfrontends: shadow DOM, CSS modules, prefijos](./01-fundamentos-y-arquitectura.md#15-aislamiento-de-css-entre-microfrontends-shadow-dom-css-modules-prefijos)
16. [Deployment independiente: versionado de remotes, manifests y estrategias de release](./01-fundamentos-y-arquitectura.md#16-deployment-independiente-versionado-de-remotes-manifests-y-estrategias-de-release)
17. [Estrategias de testing en microfrontends: E2E cross-MFE y contract testing](./01-fundamentos-y-arquitectura.md#17-estrategias-de-testing-en-microfrontends-e2e-cross-mfe-y-contract-testing)
18. [Performance en microfrontends: duplicación, waterfall de carga y prefetch](./01-fundamentos-y-arquitectura.md#18-performance-en-microfrontends-duplicación-waterfall-de-carga-y-prefetch)

## 02 — Casos y problemas [CASO]

1. [Dos MFEs cargan versiones incompatibles de React y la app crashea](./02-casos-y-problemas.md#1-dos-mfes-cargan-versiones-incompatibles-de-react-y-la-app-crashea)
2. [Un deploy de un remote rompió producción para todos los equipos](./02-casos-y-problemas.md#2-un-deploy-de-un-remote-rompió-producción-para-todos-los-equipos)
3. [El bundle total de la aplicación es gigante por dependencias duplicadas](./02-casos-y-problemas.md#3-el-bundle-total-de-la-aplicación-es-gigante-por-dependencias-duplicadas)
4. [Migración incremental de un monolito Angular a microfrontends con React (strangler fig)](./02-casos-y-problemas.md#4-migración-incremental-de-un-monolito-angular-a-microfrontends-con-react-strangler-fig)
5. [Los estilos de un MFE pisan a otro en producción](./02-casos-y-problemas.md#5-los-estilos-de-un-mfe-pisan-a-otro-en-producción)
6. [Memory leak al montar y desmontar MFEs repetidamente](./02-casos-y-problemas.md#6-memory-leak-al-montar-y-desmontar-mfes-repetidamente)
7. [Estado de autenticación desincronizado entre MFEs](./02-casos-y-problemas.md#7-estado-de-autenticación-desincronizado-entre-mfes)
8. [Latencia de carga inicial alta por waterfall de remotes](./02-casos-y-problemas.md#8-latencia-de-carga-inicial-alta-por-waterfall-de-remotes)
9. [Un equipo necesita releases independientes pero el design system introduce breaking changes](./02-casos-y-problemas.md#9-un-equipo-necesita-releases-independientes-pero-el-design-system-introduce-breaking-changes)
10. [SSR con microfrontends: Next.js multi-zone y sus límites](./02-casos-y-problemas.md#10-ssr-con-microfrontends-nextjs-multi-zone-y-sus-límites)
11. [¿Monorepo con módulos o microfrontends reales? Análisis organizacional y ley de Conway](./02-casos-y-problemas.md#11-monorepo-con-módulos-o-microfrontends-reales-análisis-organizacional-y-ley-de-conway)
12. [Observabilidad y error tracking por equipo: ¿de quién es este error en producción?](./02-casos-y-problemas.md#12-observabilidad-y-error-tracking-por-equipo-de-quién-es-este-error-en-producción)

---

## Cómo usar esta guía

- **Repaso rápido (1–2 días antes):** lee solo las respuestas resumen de ambos archivos.
- **Preparación profunda:** por cada pregunta, intenta responder en voz alta antes de leer; contrasta con la respuesta detallada y anota los huecos.
- **Simulacro de casos:** los [CASO] están escritos como los plantea un entrevistador; practica estructurando en voz alta: diagnóstico → hipótesis → contención → solución estructural → prevención.
