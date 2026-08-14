# Módulo 1 · Por qué, cuándo y cuándo no

> **Curso 05 · Microfrontends** · 90 min

## Por qué esto importa en la entrevista

Porque la primera pregunta suele ser una trampa amable: *"¿qué son los microfrontends y cuándo NO deberías usarlos?"*. Quien solo sabe la primera mitad se delata. La respuesta senior empieza reconociendo que **el problema que resuelven es organizativo, no técnico**.

## Modelo mental: es un problema de equipos

Los microfrontends existen para que **varios equipos puedan desplegar de forma independiente** la misma aplicación de cara al usuario. Ese es el beneficio. Todo lo demás —autonomía tecnológica, aislamiento de fallos— es secundario y frecuentemente exagerado.

El coste, en cambio, es inmediato y permanente:

- Duplicación de dependencias y bundles mayores.
- Complejidad de build, deploy y versionado.
- Depuración a través de fronteras (un error de un remote en el shell de otro equipo).
- Consistencia visual y de UX que ya no garantiza el código, sino un design system y disciplina.
- Testing end-to-end que cruza propiedad de varios equipos.

**💬 Cómo lo dices:** *"Los microfrontends son una solución organizativa: valen la pena cuando varios equipos se bloquean entre sí en el mismo repositorio y en el mismo tren de release. Con dos equipos y un despliegue semanal coordinado, un monorepo modular da casi todos los beneficios con una fracción del coste."*

## Cuándo NO usarlos (memorízalo)

- Un solo equipo, o dos equipos que se coordinan bien.
- La motivación es "usar varios frameworks" (eso es un coste, no un beneficio).
- No hay design system ni contratos claros: los microfrontends amplificarán la inconsistencia.
- La aplicación es pequeña o el tiempo de build no es el cuello de botella.
- No hay madurez de CI/CD: sin despliegue independiente automatizado, no obtienes el beneficio y sí todos los costes.

**Alternativas honestas que debes ofrecer:** monorepo con paquetes y `CODEOWNERS`; división por rutas con aplicaciones separadas (multi-zone en Next.js, subdominios); o build-time composition con librerías versionadas. La progresión natural es *monolito modular → paquetes → build-time → runtime*, y solo se avanza cuando duele.

## Ley de Conway y su inversa

*"Las organizaciones diseñan sistemas que replican su estructura de comunicación"*. Aplicado aquí: si tus equipos están organizados por capa técnica (frontend, backend, QA), los microfrontends serán una fricción constante. Si están organizados por **dominio vertical** (checkout, catálogo, cuenta), la arquitectura encaja.

La *maniobra inversa de Conway* consiste en reorganizar los equipos para obtener la arquitectura que quieres. Mencionarla en una entrevista de arquitectura senior o staff demuestra que piensas en sistemas sociotécnicos, no solo en código.

## Patrones de composición

| Patrón | Cuándo | Coste |
|---|---|---|
| **Build-time** (paquetes npm) | equipos que toleran redeploy del contenedor | no hay despliegue independiente real |
| **Server-side** (SSI/ESI, fragmentos) | SEO y first paint críticos; e-commerce | infraestructura de composición; caché por fragmento |
| **Edge-side** (worker/CDN) | como el anterior, con latencia global | límites del entorno edge |
| **Client-side** (Module Federation, single-spa, import maps) | apps tipo dashboard, mucho estado en cliente | bundle mayor, waterfalls, complejidad de runtime |
| **iframes** | aislamiento fuerte, código de terceros, apps legadas | UX pobre, comunicación limitada, accesibilidad |

**Los iframes merecen una defensa honesta:** son la única técnica que da aislamiento *real* de CSS, JS y errores. Si integras una aplicación de un tercero o algo que no controlas, son la respuesta correcta, y decirlo demuestra pragmatismo por encima de la moda.

## Qué se decide antes de escribir código

1. **Fronteras:** por dominio de negocio, no por componente. Un microfrontend "botones" es un antipatrón; uno "checkout" tiene sentido.
2. **Quién es dueño de la URL** (routing del shell vs de los remotes).
3. **Contrato del remote:** qué expone, qué props recibe, qué eventos emite, qué versión de las dependencias compartidas necesita.
4. **Design system:** una librería compartida, versionada, con política de breaking changes.
5. **Autenticación:** dónde vive el token y cómo se comparte ([módulo 3](03-integracion-runtime.md)).
6. **Estrategia de despliegue y rollback** por remote ([módulo 4](04-operacion-y-performance.md)).

Sin estas seis decisiones tomadas, cualquier implementación acabará en el caso 2 del banco: *"un deploy de un remote rompió producción para todos"*.

## Errores comunes que delatan a un no-senior

- Vender autonomía tecnológica ("cada equipo su framework") como beneficio.
- Fronteras por tipo de componente en vez de por dominio.
- No tener design system y esperar consistencia.
- Ignorar el coste de bundle y de first paint.
- Proponerlos sin CI/CD maduro.
- Descartar los iframes por prejuicio.

## 🧪 Laboratorio

1. **Escribe el ADR:** un documento de una página que decida si tu aplicación actual debería usar microfrontends. Incluye contexto organizativo, alternativas, decisión y consecuencias. Es el artefacto que se te va a pedir en una entrevista de arquitectura.
2. **Mide el dolor real:** cuántos despliegues por semana, cuánta espera por coordinación, cuánto dura el build. Sin esos números, la decisión es ideología.
3. **Prototipa el mismo caso** con dos enfoques (monorepo modular vs shell + remotes) y compara: tiempo de build, tamaño del bundle, pasos para desplegar un cambio pequeño.

## ✅ Autoevaluación

1. ¿Qué problema resuelven los microfrontends y cuál es su coste principal?
2. Da tres situaciones donde recomendarías NO usarlos y qué propondrías en su lugar.
3. Explica la ley de Conway aplicada a esta decisión.
4. Compara los cinco patrones de composición y di cuándo cada uno.
5. ¿Cuándo un iframe es la respuesta correcta?
6. ¿Qué seis decisiones tomas antes de escribir código?

## 🎯 Preguntas del banco que ya puedes responder

- [`microfrontends/01-fundamentos-y-arquitectura.md`](../../microfrontends/01-fundamentos-y-arquitectura.md) — 1, 2, 9, 12
- [`microfrontends/02-casos-y-problemas.md`](../../microfrontends/02-casos-y-problemas.md) — 11 (monorepo vs MFE y Conway), 4 (migración incremental)

---

**Siguiente:** [Módulo 2 · Module Federation a fondo](02-module-federation.md)
