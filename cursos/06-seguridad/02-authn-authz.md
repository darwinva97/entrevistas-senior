# Módulo 2 · Autenticación y autorización

> **Curso 06 · Seguridad** · 180 min

## Por qué esto importa en la entrevista

Es el tema donde más gente habla con seguridad y menos precisión. "Uso JWT" no es una arquitectura de autenticación. Las preguntas concretas —¿dónde guardas el token?, ¿cómo revocas?, ¿quién valida?— separan inmediatamente al que ha implementado un IdP del que ha copiado un tutorial.

## Vocabulario que hay que usar bien

- **Autenticación (AuthN):** quién eres. **Autorización (AuthZ):** qué puedes hacer. Confundirlas en una entrevista es caro.
- **OAuth 2.0** es un protocolo de **autorización delegada** (dar acceso a un recurso a una app en nombre del usuario). **No** es de autenticación.
- **OpenID Connect (OIDC)** es la capa de **autenticación** encima de OAuth2: añade el `id_token` (un JWT con claims del usuario) y el endpoint `userinfo`.
- **SAML** sigue vivo en el mundo corporativo; menciónalo si la vacante es enterprise.

## Flujos OAuth2/OIDC: cuál y por qué

| Flujo | Para qué | Nota |
|---|---|---|
| **Authorization Code + PKCE** | apps web, SPA y móviles | **el default para todo lo interactivo**, incluso con client secret |
| **Client Credentials** | máquina a máquina | el que usas entre microservicios |
| **Device Code** | TVs, CLI | |
| ~~Implicit~~ | — | **obsoleto**: exponía el token en la URL |
| ~~Password (ROPC)~~ | — | **obsoleto**: la app ve la contraseña |

**PKCE** (`code_verifier`/`code_challenge`) evita que un atacante que intercepte el `code` pueda canjearlo. Saber explicarlo en dos frases es un buen indicador.

**Validación obligatoria del `id_token`:** firma (con la JWK del emisor, respetando el `kid`), `iss`, `aud`, `exp`/`nbf`, `nonce` (contra replay) y `state` en el flujo (contra CSRF). Omitir `aud` o `iss` es un fallo real y explotable.

## JWT: lo que hay que saber y lo que hay que temer

```
header.payload.signature   ← firmado, NO cifrado: cualquiera lee el payload
```

**Los errores clásicos (todos han causado brechas reales):**

1. **`alg: none`** o aceptar el algoritmo que dice el token. Fija el algoritmo esperado en el verificador.
2. **Confusión RS256/HS256:** si aceptas HS256 y usas la clave pública como secreto, el atacante firma tokens. Fija el algoritmo *y* el tipo de clave.
3. **No validar `exp`, `aud`, `iss`.**
4. **Datos sensibles en el payload** (es legible en base64).
5. **Guardarlo en `localStorage`:** cualquier XSS lo roba. Preferible cookie `HttpOnly; Secure; SameSite` (+ CSRF token), o mantenerlo solo en memoria con refresh en cookie.
6. **No poder revocarlo.** Este es el grande.

### El problema de la revocación

Un JWT es válido hasta que expira: si un usuario cierra sesión, si le quitas permisos o si el token se filtra, **el token sigue funcionando**. Las salidas, en orden de preferencia:

- **TTL corto** (5–15 min) + **refresh token** revocable y de un solo uso (con detección de reutilización → revocar toda la familia). Es el diseño estándar.
- **Denylist** de `jti` en Redis con TTL igual al del token: exacto, pero introduce estado compartido (y una dependencia en el camino crítico).
- **Tokens opacos + introspección** (RFC 7662): revocación inmediata, coste de una llamada por petición (mitigable con caché muy corta).
- **`auth_time` / versión de sesión** en el token, comparada contra un contador del usuario: invalida todos los tokens al cambiar la contraseña.

**💬 Cómo lo dices:** *"JWT con TTL corto y refresh rotatorio; validación local en cada servicio para no crear un cuello de botella; y una denylist solo para revocación de emergencia. Asumo explícitamente una ventana de hasta 15 minutos, y si el negocio no la acepta, entonces necesitamos tokens opacos con introspección."*

## Sesiones clásicas: siguen siendo buena idea

Para una aplicación web con backend propio, **una cookie de sesión sigue siendo más simple y más segura** que JWT: revocación inmediata, sin token en el cliente, rotación al elevar privilegios. La respuesta madura a "¿JWT o sesión?" es: *sesiones para tus usuarios en tu web; JWT/OIDC para federación, APIs de terceros y comunicación entre servicios*.

Buenas prácticas de sesión: identificador aleatorio de ≥128 bits, **rotación al iniciar sesión** (contra fijación), expiración absoluta y por inactividad, `HttpOnly; Secure; SameSite`, y almacenamiento del lado servidor.

## Autorización: modelos y dónde se aplica

- **RBAC** (roles): simple, se degrada con la explosión de roles.
- **ABAC** (atributos): decide con atributos del usuario, del recurso y del contexto (hora, IP, tenant). Más flexible, más difícil de auditar.
- **ReBAC** (relaciones, estilo Google Zanzibar / OpenFGA): "puede editar si es miembro del equipo dueño del documento". Es lo adecuado para permisos con jerarquías y compartición.

**Las dos capas que debes mencionar siempre:**
1. **Autorización gruesa en el borde** (gateway/mesh): ¿este cliente puede llamar a este servicio/endpoint?
2. **Autorización fina en el servicio** (dueño del dato): ¿este usuario puede ver *este* pedido? El borde no puede saberlo.

Y el principio operativo: **denegar por defecto**, decisiones registradas (auditoría) y política como código (OPA/Cedar) cuando la lógica crece.

## Servicio a servicio

- **mTLS** para identidad de la carga (el service mesh lo automatiza) — ver [módulo 3](03-microservicios-y-supply-chain.md).
- **Client credentials** con scopes por servicio cuando hay un IdP central.
- **Propagación del usuario:** el problema de los "5 saltos" — si el JWT del usuario viaja por toda la cadena, cualquier servicio comprometido lo reutiliza. Alternativas: *token exchange* (RFC 8693) que reduce el alcance en cada salto, o un token interno firmado por el borde con solo lo necesario.

## MFA, contraseñas y recuperación

- Contraseñas: mínimo 8–12 caracteres, **sin reglas de composición absurdas ni caducidad forzada** (NIST 800-63B), comprobadas contra listas de filtradas, hasheadas con argon2id.
- **MFA:** TOTP o, mejor, **WebAuthn/passkeys** (resistente a phishing, que es el ataque real). SMS es el peor factor (SIM swapping) pero mejor que nada.
- **Recuperación de cuenta es el eslabón débil:** un flujo de "olvidé mi contraseña" mal hecho anula todo lo demás. Token de un solo uso, corto, ligado al usuario, invalidado al usarse, sin revelar si el correo existe, y con rate limiting.
- **Rate limiting y bloqueo progresivo** en login; y monitoriza *credential stuffing* (muchos usuarios distintos desde pocas IPs).

## Errores comunes que delatan a un no-senior

- "OAuth2 sirve para autenticar".
- JWT en `localStorage` sin evaluar el riesgo de XSS.
- No tener respuesta para la revocación.
- Autorizar solo en el gateway.
- Roles comprobados con `if (user.role === 'admin')` esparcidos por el código.
- Caducidad forzada de contraseñas como "buena práctica".
- Flujo de recuperación sin rate limiting.

## 🧪 Laboratorio

1. **Implementa Authorization Code + PKCE** contra Keycloak o Auth0 local. Inspecciona el `id_token` en jwt.io y valida manualmente firma, `iss`, `aud`, `exp`.
2. **Rompe un JWT mal validado:** monta un verificador que acepte `alg` del token y falsifica uno con `none` y otro con confusión HS/RS. Arréglalo y vuelve a intentarlo.
3. **Refresh rotatorio con detección de reutilización:** implementa la familia de tokens; reutiliza uno antiguo y comprueba que se revoca toda la familia.
4. **Revocación:** mide el tiempo real desde "el admin quita el permiso" hasta "el usuario deja de poder": con TTL de 15 min, con denylist y con introspección.
5. **Autorización fina:** implementa ReBAC básico (o OpenFGA) para "el dueño y los miembros del equipo pueden editar" y escribe los tests de acceso cruzado.

## ✅ Autoevaluación

1. Diferencia OAuth2, OIDC y SAML en tres frases.
2. ¿Qué resuelve PKCE y por qué también en apps con secreto?
3. Enumera seis errores clásicos de JWT.
4. ¿Cómo revocas un JWT? Da tres opciones con sus costes.
5. ¿Cuándo sesiones y cuándo JWT?
6. ¿Por qué la autorización del gateway no basta?
7. ¿Qué problema tiene propagar el JWT del usuario por cinco servicios?

## 🎯 Preguntas del banco que ya puedes responder

- [`seguridad-vulnerabilidades/02-seguridad-en-microservicios.md`](../../seguridad-vulnerabilidades/02-seguridad-en-microservicios.md) — autenticación, autorización y propagación de identidad
- [`casos-de-estudio/01-system-design.md`](../../casos-de-estudio/01-system-design.md) — caso 6 (authN/authZ para 100 microservicios)
- [`microfrontends/01-fundamentos-y-arquitectura.md`](../../microfrontends/01-fundamentos-y-arquitectura.md) — 14 (sesión compartida)

---

**Anterior:** [Módulo 1](01-modelo-de-amenazas-y-owasp.md) · **Siguiente:** [Módulo 3 · Microservicios y cadena de suministro](03-microservicios-y-supply-chain.md)
