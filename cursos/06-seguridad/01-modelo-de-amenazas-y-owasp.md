# Módulo 1 · Modelo de amenazas y OWASP en la práctica

> **Curso 06 · Seguridad** · 150 min

## Por qué esto importa en la entrevista

Porque recitar el Top 10 lo hace cualquiera. Lo que distingue a un senior es **el orden de razonamiento**: qué protejo, de quién, con qué control y a qué coste. Y saber que la mayoría de las vulnerabilidades reales no son exóticas: son control de acceso roto y configuración descuidada.

## Modelo mental: modelar amenazas en 15 minutos

Cuatro preguntas (Adam Shostack), aplicables a cualquier funcionalidad:

1. **¿Qué estamos construyendo?** Dibuja el flujo de datos: actores, procesos, almacenes y **fronteras de confianza** (donde el dato cambia de dueño: navegador→API, servicio→BD, tu sistema→proveedor).
2. **¿Qué puede salir mal?** Recorre las fronteras con **STRIDE**: Spoofing (suplantar), Tampering (alterar), Repudiation (negar), Information disclosure (filtrar), Denial of service, Elevation of privilege.
3. **¿Qué hacemos al respecto?** Un control por amenaza relevante, proporcionado al riesgo.
4. **¿Lo hicimos bien?** Test, revisión, monitorización.

**💬 Cómo lo dices:** *"Antes de proponer controles, dibujo las fronteras de confianza. La mayoría de los bugs de seguridad ocurren donde un dato cambia de dominio de confianza y alguien asumió que ya venía validado."*

## Las vulnerabilidades que sí vas a ver (y su arreglo de raíz)

### 1. Control de acceso roto (el nº1 real)

**IDOR / BOLA:** `GET /api/pedidos/1234` devuelve el pedido de otro usuario porque nadie comprobó la propiedad. Es la vulnerabilidad más común y más cara en APIs.

```js
// ❌ autentica pero no autoriza
const pedido = await repo.findById(req.params.id);

// ✅ la autorización forma parte de la consulta, no de un if
const pedido = await repo.findByIdAndOwner(req.params.id, req.user.id);
if (!pedido) return res.status(404).end();   // 404, no 403: no reveles existencia
```

Arreglo estructural: autorización **por defecto denegada**, comprobada en la capa de datos o en un middleware que no se pueda olvidar, y tests automáticos que intenten acceder a recursos ajenos (el "test de horizontal privilege escalation" es fácil de escribir y casi nadie lo tiene).

### 2. Inyección (SQL, NoSQL, comandos, LDAP)

La respuesta correcta no es "sanitizo la entrada", es **separar código de datos**: consultas parametrizadas siempre; ORM sin concatenar; para lo dinámico inevitable (nombre de columna en un `ORDER BY`), lista blanca. En comandos del sistema, evitar la shell y pasar argumentos como array.

```js
db.query('SELECT * FROM users WHERE email = $1', [email]);   // parametrizado
execFile('convert', [entrada, salida]);                      // sin shell
```

### 3. XSS

Tres tipos (reflejado, almacenado, DOM) y **una regla**: escapar en el momento de renderizar, según el contexto (HTML, atributo, URL, JS, CSS). Los frameworks modernos escapan por defecto; los agujeros están en `dangerouslySetInnerHTML`, `v-html`, `innerHTML` y en URLs (`javascript:`).

Defensa en profundidad: **CSP** (`script-src 'self'` con nonces, sin `unsafe-inline`), `HttpOnly` en las cookies de sesión (si un XSS no puede leer el token, el impacto baja drásticamente), sanitizado con DOMPurify cuando debas aceptar HTML, y `Trusted Types` en navegadores compatibles.

### 4. SSRF

Tu servidor hace una petición a una URL que controla el usuario (webhooks, "importar desde URL", previsualizadores) y acaba llamando a `169.254.169.254` (metadatos de la nube) o a servicios internos. Fue la causa de brechas famosas.

Defensas: lista blanca de destinos, resolver el DNS y **validar la IP resuelta** (bloquear rangos privados, loopback, link-local) volviendo a comprobar tras redirecciones (evita el TOCTOU del rebinding), deshabilitar redirecciones, salida por un proxy dedicado y —en AWS— exigir IMDSv2.

### 5. Deserialización insegura y RCE

No deserialices formatos que instancien clases arbitrarias con datos no confiables (Java nativo, `pickle`, YAML inseguro). Usa JSON con esquema. Y ojo con las plantillas: SSTI en motores que evalúan expresiones.

### 6. Configuración insegura y exposición

Endpoints de administración expuestos (actuator, `/debug/pprof`, paneles), buckets públicos, mensajes de error con stacktrace, CORS con `*` y credenciales, cabeceras de seguridad ausentes, contraseñas por defecto. Es aburrido y es la causa de una parte enorme de los incidentes.

### 7. Fallos criptográficos

Contraseñas con **argon2id** (o bcrypt/scrypt), nunca SHA-256 a secas. TLS en todas partes, incluido tráfico interno. Nada de crypto propia. IVs aleatorios, AEAD (AES-GCM/ChaCha20-Poly1305). Comparaciones de secretos en tiempo constante. Y datos sensibles cifrados en reposo con claves gestionadas (KMS) y rotadas.

### 8. Lógica de negocio

La categoría que las herramientas **no** detectan y que más impresiona mencionar: cupones acumulables, precios negativos, condiciones de carrera en saldos, flujos que se pueden saltar pasos, refunds duplicados. Se previenen con invariantes en el dominio, operaciones atómicas (ver [curso 00 módulo 2](../00-fundamentos-distribuidos/02-consistencia-y-cap.md)) y tests de abuso.

## Validación: dónde y cómo

- **Nunca confíes en el cliente.** La validación del frontend es UX; la del servidor es seguridad.
- **Lista blanca sobre lista negra.** Define lo permitido; enumerar lo prohibido siempre deja huecos.
- **Valida en la frontera y tipa dentro** ([curso 02 módulo 1](../02-typescript-node-senior/01-sistema-de-tipos.md)): esquema estricto, rechazo de campos desconocidos, límites de tamaño y profundidad (defensa contra JSON bombs y ReDoS).
- **Canonicaliza antes de validar** (unicode, rutas, URLs): la mayoría de los bypass viven ahí.

## Cabeceras y defensas del navegador

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-...'; object-src 'none'; frame-ancestors 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=()
```

Y las cookies de sesión: `HttpOnly; Secure; SameSite=Lax` (o `Strict`), con `__Host-` como prefijo cuando aplique. `SameSite=Lax` mitiga buena parte del CSRF, pero **no lo sustituye** en peticiones no seguras entre sitios: mantén tokens anti-CSRF (patrón double submit o token por sesión) si tu autenticación va por cookie.

## Errores comunes que delatan a un no-senior

- "Sanitizo la entrada" como respuesta universal.
- Confundir autenticación con autorización.
- Validar solo en el frontend.
- CORS con `*` y `credentials: true` (el navegador ni siquiera lo permite, y quien lo propone se delata).
- Hash de contraseñas con SHA-256.
- Devolver 403 en vez de 404 y filtrar existencia de recursos.
- No pensar en la lógica de negocio como superficie de ataque.

## 🧪 Laboratorio

1. **Modelo de amenazas** de una funcionalidad real tuya (login, checkout, subida de ficheros): diagrama de flujo con fronteras, STRIDE por frontera, controles y coste. Una página.
2. **OWASP Juice Shop** (`docker run -p 3000:3000 bkimminich/juice-shop`): resuelve al menos IDOR, XSS almacenado, inyección SQL en login y una de lógica de negocio. Escribe cómo lo habrías prevenido en el código.
3. **Test de autorización automatizado:** escribe en tu proyecto un test que, con el usuario A, intente leer/modificar recursos de B en todos los endpoints. Cuenta cuántos fallan.
4. **CSP real:** aplícala a una app tuya en modo `report-only`, recoge las violaciones, y luego endurécela hasta `script-src 'self' 'nonce-...'`.
5. **SSRF:** monta un endpoint que descargue una URL; explótalo contra `169.254.169.254` en un entorno de pruebas y luego implementa la validación de IP resuelta.

## ✅ Autoevaluación

1. Modela amenazas de "subir una foto de perfil" en 5 minutos.
2. ¿Por qué "sanitizar" no es la defensa correcta contra SQLi? ¿Y contra XSS?
3. ¿Qué es IDOR y cómo lo previenes estructuralmente?
4. Explica SSRF y tres defensas, incluida la del rebinding.
5. ¿Cómo almacenas contraseñas y por qué no con SHA-256?
6. ¿Qué hace `SameSite=Lax` y por qué no sustituye al token CSRF?
7. Da tres ejemplos de vulnerabilidad de lógica de negocio.

## 🎯 Preguntas del banco que ya puedes responder

- [`seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md`](../../seguridad-vulnerabilidades/01-owasp-y-vulnerabilidades.md) — las 18
- [`seguridad-vulnerabilidades/03-casos-e-incidentes.md`](../../seguridad-vulnerabilidades/03-casos-e-incidentes.md) — los casos de explotación de aplicación

---

**Siguiente:** [Módulo 2 · Autenticación y autorización](02-authn-authz.md)
