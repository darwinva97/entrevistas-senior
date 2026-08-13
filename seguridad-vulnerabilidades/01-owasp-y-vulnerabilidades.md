# OWASP Top 10 y Vulnerabilidades Comunes

> Enfoque 100% defensivo: cómo funcionan conceptualmente las vulnerabilidades, cómo detectarlas, cómo prevenirlas y qué hacer si ya ocurrieron. Orientado a entrevistas técnicas de perfiles senior backend/microservicios.

---

## 1. ¿Qué es Broken Access Control (A01) y por qué encabeza el OWASP Top 10?

**Categoría:** OWASP Top 10 · **Tipo:** Conceptual

### 📝 Respuesta resumen
Broken Access Control ocurre cuando un usuario autenticado (o no) puede realizar acciones o acceder a datos fuera de sus permisos: IDOR, escalada horizontal/vertical de privilegios, manipulación de rutas o parámetros. Encabeza el Top 10 porque es la vulnerabilidad más frecuente en aplicaciones reales y no la resuelve ningún framework por defecto: la autorización es lógica de negocio. La defensa es *deny by default*, autorización centralizada verificada en el servidor en cada request, y tests automatizados de autorización.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** La autenticación responde "¿quién eres?"; la autorización responde "¿qué puedes hacer?". Broken Access Control es cualquier fallo en la segunda pregunta. Los patrones más comunes son: **IDOR** (Insecure Direct Object Reference: `GET /api/orders/12345` devuelve la orden de otro usuario porque solo se valida que el token sea válido, no que la orden pertenezca al usuario), **escalada vertical** (un usuario normal invoca endpoints de admin porque la UI oculta el botón pero el backend no valida el rol), **escalada horizontal** (acceder a recursos de otro usuario del mismo nivel), manipulación de metadatos (modificar un claim de rol en un JWT mal firmado, alterar cookies) y fallos de CORS demasiado permisivos que permiten a orígenes no confiables consumir APIs autenticadas.

**Cómo detectarla.** (1) Revisión de código buscando endpoints que reciben IDs y no verifican propiedad del recurso; (2) tests de autorización automatizados: para cada endpoint, matriz de roles × acciones esperando 403 donde corresponde; (3) DAST y pentesting con dos sesiones de usuarios distintos intercambiando IDs; (4) en producción, alertas sobre tasas anómalas de 403/404 secuenciales (enumeración de IDs) y sobre accesos de un usuario a volúmenes inusuales de recursos.

**Cómo prevenirla.**
- *Deny by default*: todo endpoint requiere autorización explícita; nada queda "abierto por olvido".
- Centralizar la decisión: un middleware/policy engine (Spring Security con `@PreAuthorize`, OPA, Casbin) en vez de `if` dispersos.
- Validar **propiedad del recurso**, no solo el rol:

```java
// Inseguro: solo valida autenticación
Order getOrder(Long id) { return repo.findById(id); }

// Seguro: valida propiedad en la query
Order getOrder(Long id, String userId) {
    return repo.findByIdAndOwnerId(id, userId)
        .orElseThrow(ResourceNotFoundException::new); // 404, no 403, para no revelar existencia
}
```
- Usar identificadores no adivinables (UUID) como defensa en profundidad, nunca como única defensa.
- Deshabilitar listado de directorios, limitar CORS a orígenes explícitos, rate limiting para frenar enumeración.

**Qué hacer si ya ocurrió.** Tratarlo como incidente de exposición de datos: (1) contener cerrando o parchando el endpoint; (2) determinar el alcance con logs de acceso (qué IDs consultó quién y cuándo); (3) identificar si hubo explotación real (patrones de enumeración) y qué datos se expusieron; (4) evaluar obligaciones de notificación (GDPR/leyes locales) si hubo datos personales; (5) buscar el mismo patrón en todos los endpoints similares (raramente hay un solo IDOR); (6) añadir tests de regresión de autorización al pipeline para que no reaparezca.

---

## 2. ¿Qué son los fallos criptográficos (A02) y cómo se evitan en un backend?

**Categoría:** OWASP Top 10 · **Tipo:** Conceptual

### 📝 Respuesta resumen
Son fallos en la protección de datos en tránsito y en reposo: usar algoritmos rotos (MD5, SHA1 para passwords, DES), claves débiles o hardcodeadas, no cifrar datos sensibles, TLS mal configurado o cifrado casero. La defensa: clasificar los datos, TLS 1.2+ en todo, hashing de contraseñas con algoritmos de coste (bcrypt/argon2), cifrado autenticado (AES-GCM) con gestión de claves en un KMS, y nunca diseñar criptografía propia.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** No es "un ataque" sino una familia de debilidades: datos sensibles viajando en claro (HTTP, conexiones internas sin TLS), contraseñas con hash rápido y sin salt (MD5/SHA-256 puro permite cracking masivo con GPUs y rainbow tables), cifrado con modos inseguros (AES-ECB revela patrones), claves embebidas en el código o repositorio, IVs reutilizados, generación de aleatoriedad con `Math.random()` en vez de CSPRNG, y validación de certificados deshabilitada "para que funcione en dev" que llega a producción.

**Cómo detectarla.** (1) SAST con reglas criptográficas (Semgrep, SonarQube detectan MD5, ECB, `TrustAllCerts`); (2) escaneo de configuración TLS (testssl.sh, SSL Labs) sobre endpoints propios; (3) inventario de datos: mapear dónde viven datos sensibles y verificar si están cifrados en reposo; (4) revisar cómo se almacenan contraseñas y tokens en la base de datos; (5) detección de secretos en repos (gitleaks, trufflehog).

**Cómo prevenirla.**
- **Clasificar datos** primero: no todo requiere el mismo nivel; PII, credenciales y datos financieros exigen cifrado en reposo y en tránsito.
- **Contraseñas**: nunca cifradas ni con hash simple; usar funciones de derivación con coste:

```java
// Seguro: bcrypt con factor de coste adecuado
PasswordEncoder encoder = new BCryptPasswordEncoder(12);
String hash = encoder.encode(rawPassword);
// Alternativa moderna: Argon2id vía Spring Security
```
- **Cifrado simétrico**: AES-256-GCM (cifrado autenticado, protege confidencialidad e integridad); IV único por operación; nunca ECB.
- **Gestión de claves**: KMS (AWS KMS, Vault, Azure Key Vault) con rotación, envelope encryption y claves nunca en código ni variables versionadas.
- **TLS**: 1.2 mínimo (idealmente 1.3), HSTS, certificados válidos también entre servicios internos; prohibir por revisión de código cualquier `verify=false`.
- No inventar esquemas: usar librerías de alto nivel (Tink, libsodium) que hacen difícil equivocarse.

**Qué hacer si ya ocurrió.** Si se filtraron hashes débiles de contraseñas: forzar reset masivo, invalidar sesiones, migrar a bcrypt/argon2 con re-hash transparente en el siguiente login, monitorizar credential stuffing y notificar a usuarios. Si se expuso una clave de cifrado: rotarla en el KMS, re-cifrar los datos afectados con la clave nueva, revocar la comprometida y auditar con CloudTrail/logs qué se descifró durante la ventana de exposición. Si el fallo fue TLS ausente en tráfico interno: asumir que el segmento pudo ser observado, rotar credenciales que viajaron por él y desplegar mTLS.

---

## 3. Explica las inyecciones (SQL, NoSQL, command) y cómo prevenirlas de forma sistemática

**Categoría:** OWASP Top 10 · **Tipo:** Conceptual

### 📝 Respuesta resumen
Una inyección ocurre cuando datos no confiables se concatenan dentro de un intérprete (SQL, shell, query de MongoDB, LDAP) y cambian la estructura del comando, no solo su valor. La defensa canónica es separar código de datos: consultas parametrizadas/prepared statements, ORMs bien usados, evitar invocar shell y validar entrada con allowlists. Se detecta con SAST, revisiones de código y tests; el WAF es solo una capa extra.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** El intérprete no distingue entre "estructura del comando" y "datos" cuando ambos llegan concatenados en el mismo string. En SQL, un valor manipulado puede convertir un filtro en una condición siempre verdadera o encadenar sentencias adicionales; en NoSQL (MongoDB), enviar un objeto en lugar de un string (`{"$ne": null}`) altera la semántica de la query; en command injection, metacaracteres del shell (`;`, `|`, `&&`) permiten ejecutar comandos adicionales cuando la aplicación construye llamadas a `Runtime.exec` o `child_process.exec` con entrada del usuario.

**Cómo detectarla.** (1) SAST: cualquier concatenación de entrada externa en queries o comandos es un finding; (2) grep dirigido en el código por `createQuery("... " +`, `exec(`, template strings dentro de llamadas a base de datos; (3) DAST y pentesting; (4) en runtime, errores de sintaxis SQL en logs de producción son un fuerte indicador de intentos de inyección; (5) monitorizar queries lentas o con formas anómalas (database activity monitoring).

**Cómo prevenirla.**
- **Prepared statements siempre**, en todos los lenguajes:

```java
// Inseguro: la estructura de la query depende de la entrada
String q = "SELECT * FROM users WHERE email = '" + email + "'";

// Seguro: el driver envía la query y los datos por separado
PreparedStatement ps = conn.prepareStatement(
    "SELECT * FROM users WHERE email = ?");
ps.setString(1, email);
```
```javascript
// Node + MongoDB: validar tipo antes de usar en la query
if (typeof req.body.username !== 'string') return res.sendStatus(400);
const user = await User.findOne({ username: req.body.username });
```
- **Command injection**: evitar el shell; usar APIs con argumentos como array (`execFile('convert', [input])` en Node, `ProcessBuilder` con lista en Java) y allowlist de valores permitidos. Idealmente sustituir el comando por una librería nativa.
- **Validación de entrada** con allowlists (formato, tipo, longitud) como defensa en profundidad; para campos dinámicos no parametrizables (nombre de columna en un ORDER BY), mapear contra una lista cerrada de valores permitidos.
- **Mínimo privilegio en la BD**: el usuario de la aplicación no necesita DROP ni acceso a otras bases; limita el impacto de una inyección exitosa.
- ORMs ayudan pero no son inmunes: las APIs de "native query" o `$where` reabren el problema.

**Qué hacer si ya ocurrió.** (1) Contener: parchear el endpoint o bloquear el patrón en el WAF como medida temporal; (2) análisis forense con logs de la aplicación y de la base de datos: qué queries se ejecutaron, qué tablas se leyeron o modificaron; (3) si hubo lectura de credenciales o PII, rotar secretos, forzar resets y evaluar notificación regulatoria; (4) verificar integridad de los datos (una inyección puede escribir, no solo leer); (5) revisar todo el código en busca del mismo antipatrón y añadir la regla al SAST como quality gate obligatorio.

---

## 4. ¿Qué es Insecure Design (A04) y en qué se diferencia de un bug de implementación?

**Categoría:** OWASP Top 10 · **Tipo:** Conceptual

### 📝 Respuesta resumen
Insecure Design son fallos en la arquitectura y la lógica de negocio: el sistema hace exactamente lo que se diseñó, pero el diseño no contempló abuso. Ejemplos: un flujo de recuperación de contraseña adivinable, ausencia de límites en operaciones costosas, confiar en validaciones del cliente. No se arregla con un parche: se previene con threat modeling, requisitos de seguridad explícitos y patrones de diseño seguros desde el inicio ("shift left").

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** Un bug de implementación es código que no cumple el diseño (una query concatenada). Insecure design es un diseño que, implementado perfectamente, sigue siendo abusable: un e-commerce que permite reservar stock ilimitado sin pago (denegación de inventario), preguntas de seguridad como único factor de recuperación, un endpoint de invitaciones sin límite que permite spam masivo, lógica de descuentos apilables que nadie modeló como riesgo, o confiar en que "el frontend valida" el precio que llega en el request. La ausencia de controles es la vulnerabilidad.

**Cómo detectarlo.** No lo detecta un escáner. Se necesita: (1) **threat modeling** de cada feature relevante (STRIDE o simplemente las cuatro preguntas: ¿qué construimos?, ¿qué puede salir mal?, ¿qué hacemos al respecto?, ¿lo hicimos bien?); (2) revisión de diseño con foco en abuso de lógica de negocio ("abuser stories" junto a user stories); (3) pentest orientado a lógica de negocio, no solo a vulnerabilidades técnicas; (4) métricas de producto anómalas en producción (cupones canjeados de forma imposible, cuentas creadas en ráfaga).

**Cómo prevenirlo.**
- Integrar seguridad en el ciclo de diseño: threat modeling ligero en el refinamiento de cada épica sensible (auth, pagos, datos personales, todo lo que mueva dinero o identidad).
- Escribir **requisitos de seguridad** verificables: "el endpoint de reset tolera máximo N intentos por hora", "toda operación de escritura valida propiedad del recurso".
- Patrones defensivos por defecto: límites y cuotas en toda operación (rate limits, tamaños máximos, paginación obligatoria), idempotencia en pagos, verificación server-side de todo valor con impacto económico, segregación de funciones para operaciones críticas.
- Usar una librería de "secure design patterns" del equipo: flujos de referencia ya revisados para login, reset, invitaciones, uploads.
- Tests de lógica de negocio adversarial: "¿qué pasa si llamo a /confirm dos veces?", "¿y si el precio llega negativo?".

**Qué hacer si ya ocurrió.** Un abuso de diseño suele descubrirse por impacto de negocio (fraude, costes). Pasos: (1) cuantificar el abuso con datos (cuántas transacciones anómalas, desde cuándo); (2) mitigación táctica inmediata: límites, feature flag para apagar el flujo, bloqueo de cuentas abusadoras; (3) rediseño del flujo con threat modeling formal antes de reabrirlo; (4) postmortem sin culpas que responda por qué el riesgo no se identificó en diseño, y ajuste del proceso (checklist de riesgos en refinamiento) para que las próximas features pasen por esa revisión. La lección senior: los bugs de diseño son los más caros de arreglar tarde, por eso el retorno de invertir en threat modeling temprano es tan alto.

---

## 5. ¿Qué es Security Misconfiguration (A05) y cómo se gestiona a escala?

**Categoría:** OWASP Top 10 · **Tipo:** Conceptual

### 📝 Respuesta resumen
Es cualquier configuración insegura o por defecto: consolas de administración expuestas, credenciales default, mensajes de error con stack traces, features innecesarias habilitadas, cabeceras de seguridad ausentes, buckets públicos, permisos cloud excesivos. A escala se gestiona con infraestructura como código revisada, hardening automatizado, escaneo continuo de configuración (CSPM) y entornos reproducibles donde la configuración segura es la base, no un ajuste manual.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** Los sistemas modernos tienen cientos de superficies configurables: servidor de aplicaciones, framework, contenedor, orquestador, cloud, base de datos. Cada una viene con defaults pensados para facilidad de uso, no para seguridad: endpoints de actuator/debug expuestos (`/actuator/env` de Spring Boot puede filtrar secretos), listado de directorios, CORS con `*`, S3 público, dashboards de Kubernetes sin autenticación, usuarios `admin/admin`. El atacante no necesita una vulnerabilidad de código: la puerta ya está abierta. Además, la deriva de configuración (cambios manuales "temporales") degrada entornos que empezaron bien.

**Cómo detectarla.** (1) **CSPM** (Cloud Security Posture Management: AWS Config, Wiz, Prowler) escaneando continuamente contra benchmarks CIS; (2) escaneo de superficie externa (qué puertos y endpoints son visibles desde internet, con herramientas tipo Shodan sobre tus propios rangos); (3) revisión de manifiestos IaC en el pipeline (tfsec/Checkov para Terraform, Kubesec para K8s); (4) DAST detecta cabeceras faltantes, stack traces y endpoints de debug; (5) auditorías periódicas de diferencias entre configuración declarada y real (drift detection).

**Cómo prevenirla.**
- **Todo como código**: Terraform/Helm revisado por PR; prohibir cambios manuales en producción (o detectarlos y revertirlos).
- **Imágenes y plantillas endurecidas**: base images mínimas, plantillas de servicio con cabeceras de seguridad, TLS y actuators restringidos ya configurados; el equipo hereda seguridad por defecto.

```yaml
# Spring Boot: exponer solo lo necesario del actuator
management:
  endpoints:
    web:
      exposure:
        include: health,prometheus
  endpoint:
    health:
      show-details: never
```
- Deshabilitar/desinstalar lo que no se usa (samples, consolas, puertos).
- Errores genéricos al cliente, detalle solo en logs internos.
- Separación estricta de entornos y de sus credenciales; dev nunca alcanza datos de producción.
- Guardrails preventivos en cloud: SCPs/policies que impiden crear recursos públicos aunque alguien lo intente.

**Qué hacer si ya ocurrió.** Ejemplo típico: un endpoint de administración quedó expuesto. (1) Cerrarlo de inmediato (red, autenticación); (2) determinar la ventana de exposición y revisar logs de acceso: ¿hubo requests externos?, ¿qué devolvió?; (3) si pudo filtrar secretos (caso `/actuator/env` o `/heapdump`), rotar todos los secretos potencialmente visibles; (4) buscar la misma configuración en el resto de servicios (el error suele estar en la plantilla común); (5) convertir el hallazgo en una regla automática del CSPM/pipeline para que sea imposible repetirlo silenciosamente. La respuesta madura no es "lo cerramos", es "ya no se puede desplegar así".

---

## 6. Componentes vulnerables y ataques de supply chain (A06): ¿cómo gestionas el riesgo de terceros?

**Categoría:** OWASP Top 10 / Supply chain · **Tipo:** Conceptual

### 📝 Respuesta resumen
El 80-90% del código que despliegas no lo escribió tu equipo: dependencias directas y transitivas, imágenes base, plugins de CI. El riesgo es doble: componentes con CVEs conocidos sin parchear y componentes comprometidos deliberadamente (paquetes maliciosos, typosquatting, mantenedores comprometidos). La defensa: inventario (SBOM), SCA continuo en el pipeline, actualización automatizada (Dependabot/Renovate), lockfiles, verificación de integridad y un proceso de respuesta rápido para CVEs críticos.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** Hay dos vectores distintos. El primero, **componentes desactualizados**: una librería con CVE público es explotable por cualquiera que escanee versiones (Log4Shell demostró que un CVE en una dependencia transitiva omnipresente compromete a media industria en horas). El segundo, **compromiso deliberado del supply chain**: paquetes con nombres parecidos (typosquatting), toma de control de cuentas de mantenedores para publicar versiones maliciosas (event-stream, ua-parser-js), dependencias que ejecutan código en `postinstall`, y compromisos del propio pipeline (SolarWinds: el build system inyectaba backdoors en artefactos firmados).

**Cómo detectarlo.** (1) **SBOM** (CycloneDX/SPDX) generado en cada build: no puedes proteger lo que no inventarías; (2) **SCA** (OWASP Dependency-Check, Snyk, Trivy) en el pipeline y también escaneando continuamente lo ya desplegado (un build "limpio" de hace 3 meses puede tener CVEs nuevos hoy); (3) monitorizar avisos de seguridad de tus ecosistemas (GitHub Advisories, listas de npm/Maven); (4) para paquetes maliciosos: análisis de comportamiento en la instalación (¿por qué una librería de colores hace llamadas de red en postinstall?) y herramientas tipo Socket.dev.

**Cómo prevenirlo.**
- **Lockfiles siempre** (`package-lock.json`, `poetry.lock`, versiones exactas en Maven/Gradle con verificación de checksums) para builds reproducibles.
- **Actualización continua y pequeña**: Dependabot/Renovate con PRs automáticos y buena suite de tests; actualizar poco y a menudo es más seguro y barato que grandes saltos anuales.
- **Cuarentena de novedades**: no adoptar versiones publicadas hace minutos; un delay de días habría evitado la mayoría de paquetes maliciosos conocidos.
- Repositorio proxy interno (Artifactory/Nexus) con allowlist y bloqueo de paquetes señalados.
- Reducir dependencias: cada `npm install` es una decisión de confianza; preferir stdlib para lo trivial.
- En CI: `npm ci --ignore-scripts` cuando sea viable, permisos mínimos de los runners, y firmar artefactos propios (Sigstore/cosign) con provenance (SLSA).

**Qué hacer si ya ocurrió.** Ante un componente comprometido en tu build: (1) identificar con el SBOM qué servicios y versiones lo incluyen; (2) congelar despliegues y bloquear la versión en el proxy interno; (3) determinar qué hace el código malicioso (¿exfiltra variables de entorno? → rotar todos los secretos del entorno de build y runtime); (4) reconstruir desde una versión limpia y redesplegar; (5) buscar indicadores de compromiso en los sistemas que ejecutaron el código; (6) postmortem: ¿por qué entró y cómo lo detectamos antes la próxima vez?

---

## 7. Fallos de identificación y autenticación (A07): errores comunes y diseño robusto de login

**Categoría:** OWASP Top 10 / Autenticación · **Tipo:** Conceptual

### 📝 Respuesta resumen
Incluye credential stuffing sin protección, contraseñas débiles permitidas, recuperación de cuenta insegura, sesiones que no expiran ni se invalidan, ausencia de MFA y session fixation. Un login robusto combina: hashing fuerte de contraseñas, MFA (idealmente resistente a phishing), rate limiting inteligente, detección de credenciales filtradas, gestión de sesión correcta (rotación de ID, expiración, revocación) y mensajes que no revelan si una cuenta existe.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** La identidad es la nueva superficie de ataque principal: es más barato robar o adivinar credenciales que explotar memoria. Vectores: **credential stuffing** (probar millones de pares usuario/contraseña filtrados de otros sitios; funciona porque la gente reutiliza contraseñas), **fuerza bruta y password spraying** (pocas contraseñas comunes contra muchas cuentas para evadir bloqueos por cuenta), **session fixation/hijacking** (fijar o robar el identificador de sesión), flujos de recuperación débiles (tokens adivinables, preguntas de seguridad) y enumeración de usuarios vía mensajes de error o tiempos de respuesta distintos.

**Cómo detectarlo.** (1) Métricas de login: ratio de fallos, distribución de IPs/ASNs, velocidad de intentos por cuenta y global (stuffing se ve como picos de fallos distribuidos); (2) revisar el flujo de sesión: ¿se regenera el ID al autenticar?, ¿el logout invalida server-side?; (3) probar la recuperación de cuenta como atacante interno (¿el token es de un solo uso, corto, aleatorio?); (4) contrastar contraseñas de usuarios contra corpus de filtraciones (haveibeenpwned k-anonymity API) en registro y cambio.

**Cómo prevenirlo.**
- **Contraseñas**: bcrypt/argon2id; política NIST moderna (longitud sobre complejidad arbitraria, bloquear contraseñas filtradas, no forzar rotación periódica sin motivo).
- **MFA**: TOTP como mínimo; para cuentas de alto valor, WebAuthn/passkeys (resistentes a phishing porque el navegador vincula la credencial al origen).
- **Anti-automatización por capas**: rate limiting por cuenta + por IP + global, desafíos progresivos (CAPTCHA solo ante señales de riesgo), device fingerprinting y bloqueos suaves que no faciliten DoS contra usuarios legítimos.
- **Sesiones**: regenerar ID tras login (anti-fixation), expiración absoluta e inactividad, invalidación server-side en logout y cambio de contraseña, y posibilidad de "cerrar todas las sesiones".
- **No revelar existencia de cuentas**: mismo mensaje y tiempo de respuesta para usuario inexistente y contraseña errónea; en registro/reset, responder siempre "si la cuenta existe, enviamos un email".
- Recuperación: token aleatorio criptográfico, corto TTL, un solo uso, y notificar al usuario todo cambio sensible por un canal separado.

**Qué hacer si ya ocurrió.** Ante una oleada de account takeover: (1) identificar cuentas comprometidas por señales (login desde infra nueva + cambio inmediato de email/contraseña); (2) forzar reset e invalidar sesiones y tokens de las afectadas; (3) activar defensas elevadas temporalmente (MFA obligatorio, verificación por email en logins nuevos); (4) notificar a los usuarios con instrucciones claras; (5) revisar qué acciones realizaron las cuentas comprometidas (fraude, exfiltración de datos personales) para dimensionar el incidente; (6) endurecer permanentemente lo que permitió el ataque.

---

## 8. Fallos de integridad de software y datos (A08): CI/CD, actualizaciones y deserialización

**Categoría:** OWASP Top 10 / Integridad · **Tipo:** Conceptual

### 📝 Respuesta resumen
A08 agrupa las situaciones donde el sistema confía en software o datos sin verificar su integridad: pipelines de CI/CD que cualquiera puede alterar, actualizaciones sin firma, dependencias desde fuentes no confiables, deserialización de datos no confiables y plugins con auto-update sin verificación. La defensa: firmar y verificar artefactos, proteger el pipeline como sistema crítico de producción, verificación de integridad de dependencias y nunca deserializar datos externos con formatos que permiten instanciar objetos arbitrarios.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** El hilo conductor es la **confianza sin verificación**. Ejemplos: un runner de CI con permisos de producción ejecuta código de cualquier PR (incluidos forks externos) — quien controla el pipeline controla lo que se despliega; una aplicación descarga actualizaciones o modelos por HTTP sin verificar firma, permitiendo sustitución en tránsito; datos serializados (cookies, mensajes de cola, cachés) se deserializan confiando en que nadie los alteró, cuando formatos como la serialización nativa de Java permiten que los datos *dicten qué clases instanciar*, derivando en ejecución de código. SolarWinds es el caso canónico: el compromiso del build system convirtió actualizaciones legítimas y firmadas en el vector de ataque.

**Cómo detectarlo.** (1) Auditar el pipeline: ¿quién puede modificar workflows?, ¿los secretos de producción son accesibles desde PRs de forks?, ¿hay revisión obligatoria para cambios en CI?; (2) SAST detecta usos de deserialización nativa peligrosa (`ObjectInputStream`, `pickle`, `Marshal`); (3) verificar si los artefactos que se despliegan son exactamente los que construyó el pipeline (digests inmutables vs tags mutables); (4) revisar todo punto donde el sistema ingiere código o configuración ejecutable de fuera (plugins, webhooks que disparan acciones, IaC aplicado automáticamente).

**Cómo prevenirlo.**
- **Pipeline como sistema crítico**: runners efímeros con mínimo privilegio, secretos por entorno con OIDC federado en lugar de credenciales estáticas, protección de ramas, revisión obligatoria de cambios en workflows, y ningún job de forks con acceso a secretos.
- **Firmar y verificar**: firmar imágenes y artefactos (cosign), desplegar por digest, y exigir la firma en admisión (policy controller en Kubernetes). Generar provenance del build (SLSA) que ate el artefacto a su fuente y pipeline.
- **Integridad de dependencias**: lockfiles con hashes, Subresource Integrity para scripts de terceros en el frontend.

```yaml
# Kubernetes: admitir solo imágenes firmadas, referenciadas por digest
# (Kyverno / Sigstore policy-controller)
verifyImages:
  - imageReferences: ["registro.interno/*"]
    attestors:
      - entries:
          - keyless:
              subject: "https://github.com/mi-org/*"
              issuer: "https://token.actions.githubusercontent.com"
```
- **Datos serializados**: preferir formatos de datos puros (JSON con validación de esquema); si se necesita integridad, firmar (HMAC) lo que sale y verificar al volver (cookies, estados de flujo).

**Qué hacer si ya ocurrió.** Si se detecta manipulación del pipeline o de artefactos: tratarlo como compromiso total del entorno de build. (1) Congelar despliegues; (2) rotar todas las credenciales accesibles desde CI; (3) reconstruir runners desde imágenes limpias; (4) comparar artefactos desplegados contra builds reproducibles limpios para identificar los comprometidos; (5) redesplegar todo desde fuente verificada; (6) análisis forense de cómo entró el atacante y desde cuándo, porque cada despliegue en ese periodo es sospechoso.

---

## 9. Logging y monitoring insuficiente (A09): ¿qué registrar, qué no, y cómo detectar ataques?

**Categoría:** OWASP Top 10 / Detección · **Tipo:** Conceptual

### 📝 Respuesta resumen
Sin logging y alertas adecuadas, los ataques no se detectan (la media de detección de brechas se mide en semanas o meses) y la respuesta a incidentes se queda sin evidencia. Hay que registrar eventos de seguridad relevantes (logins, fallos de autorización, cambios sensibles) con contexto correlacionable, protegerlos de manipulación, NO registrar secretos ni PII innecesaria, y construir alertas sobre patrones de ataque, no solo sobre errores técnicos.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** No es una vulnerabilidad explotable directamente: es el multiplicador de daño de todas las demás. Un IDOR explotado durante meses sin que nadie lo note, un credential stuffing invisible porque nadie mira la tasa de fallos de login, o un incidente imposible de investigar porque los logs rotaron a los 3 días o nunca registraron quién hizo qué. También incluye el fallo inverso: registrar demasiado (contraseñas, tokens, PII en logs) convierte el sistema de logging en el objetivo.

**Qué registrar.** Eventos de seguridad con valor: autenticación (éxitos y fallos, con origen), fallos de autorización (403s: son intentos de hacer algo prohibido), cambios en datos sensibles y configuración, uso de privilegios administrativos, validaciones de entrada fallidas significativas, y operaciones de negocio críticas (pagos, exportaciones de datos). Cada evento con: timestamp preciso (NTP sincronizado), identidad (usuario, servicio), origen (IP), recurso afectado, resultado y un correlation/trace ID que permita seguir la request a través de microservicios.

**Qué NO registrar.** Contraseñas (ni siquiera fallidas: suelen ser la contraseña real con un typo), tokens y API keys completos, datos de tarjetas, y PII más allá de lo necesario (usar IDs internos, enmascarar). Implementar redacción automática en la librería de logging común para que no dependa de la disciplina individual:

```java
// Filtro de redacción centralizado en la librería de logging del equipo
String sanitize(String msg) {
    return msg.replaceAll("(?i)(authorization|password|token)\\s*[=:]\\s*\\S+",
                          "$1=[REDACTED]");
}
```

**Cómo detectar ataques con ello.** Centralizar en un SIEM/plataforma de logs con retención suficiente (90 días "calientes", más en frío, según regulación). Alertas útiles: ráfagas de 401/403 por usuario o IP (fuerza bruta, enumeración), 403s secuenciales sobre IDs consecutivos (IDOR scanning), logins imposibles (dos países en una hora), picos de exportación de datos, uso de credenciales de servicio desde orígenes nuevos, y errores de sintaxis SQL (intentos de inyección). Clave senior: cada alerta necesita un runbook y un dueño; una alerta sin acción definida es ruido que entrena al equipo a ignorar el sistema.

**Protección de los logs.** Enviarlos fuera del host inmediatamente (un atacante con acceso borra logs locales), write-only para las aplicaciones, acceso de lectura restringido y auditado, e idealmente almacenamiento inmutable (object lock) para la evidencia forense.

**Qué hacer si ya ocurrió** (descubres que no tienes visibilidad durante un incidente): documentar las lagunas como parte del postmortem, priorizar instrumentar los eventos que faltaron, y ejecutar un ejercicio de tabletop posterior verificando que la próxima vez las preguntas "¿quién accedió a qué y cuándo?" tienen respuesta en minutos, no en días.

---

## 10. Server-Side Request Forgery (SSRF, A10): riesgo en la nube y defensas

**Categoría:** OWASP Top 10 / SSRF · **Tipo:** Conceptual

### 📝 Respuesta resumen
SSRF ocurre cuando la aplicación realiza peticiones HTTP a URLs influenciadas por el usuario, permitiendo alcanzar destinos internos: servicios de la red privada y, críticamente en cloud, el endpoint de metadata (169.254.169.254) que entrega credenciales del rol de la instancia. Defensas: allowlist de destinos, validación de la IP resuelta bloqueando rangos privados, IMDSv2 obligatorio, egress restringido por red y no devolver la respuesta cruda al usuario.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** Toda funcionalidad tipo "descarga esta URL" (webhooks, importar desde URL, previews de enlaces, conversores) convierte tu servidor en un proxy. El servidor tiene una posición de red privilegiada: alcanza servicios internos sin autenticación ("la red interna es segura"), bases de datos, paneles de administración y el servicio de metadata del cloud, cuyo robo de credenciales fue el vector central de la brecha de Capital One. Los bypasses típicos que hay que conocer para defenderse: redirects (la URL validada redirige a una interna), DNS rebinding (el dominio resuelve a IP pública al validar y privada al conectar), representaciones alternativas de IPs y esquemas alternativos (`file://`, `gopher://`).

**Cómo detectarla.** (1) Inventariar todo código que hace requests salientes con entrada del usuario (buscar usos de clientes HTTP alimentados por parámetros); (2) DAST con detección out-of-band (la aplicación llama a un dominio de canario controlado); (3) en producción: monitorizar conexiones salientes hacia 169.254.169.254 o rangos internos desde pods/servicios que no deberían hacerlas (network flow logs), y alertar sobre uso de credenciales de instancia desde IPs externas (GuardDuty hace exactamente esto).

**Cómo prevenirla.**
- **Allowlist de destinos** cuando el caso de uso lo permite (webhooks solo hacia dominios verificados por el cliente).
- **Validar la IP resuelta, no el hostname**, y hacerlo en el momento de conectar (evita rebinding); bloquear rangos privados, loopback y link-local:

```javascript
const net = require('net');
const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./,
                 /^127\./, /^169\.254\./, /^0\./];
function isAllowed(ip) {
  return net.isIP(ip) && !PRIVATE.some(r => r.test(ip));
}
// Usar un agente HTTP que valide la IP en cada conexión,
// deshabilitar redirects automáticos o revalidar cada salto,
// permitir solo http/https, timeouts cortos.
```
- **Defensa de plataforma** (la más robusta): forzar **IMDSv2** en AWS (requiere PUT con token y hop limit 1, lo que rompe el acceso vía proxy SSRF simple), o mejor aún, workload identity sin metadata accesible; egress control por red (NetworkPolicies de Kubernetes, proxy de salida con allowlist) para que el servicio literalmente no pueda conectar a destinos internos.
- Aislar los fetchers: el componente que descarga URLs corre en una red segregada sin acceso a nada interno.
- No devolver la respuesta cruda al usuario (convierte SSRF completo en "blind", reduciendo el valor para el atacante).

**Qué hacer si ya ocurrió.** Si se confirma SSRF explotado contra metadata: asumir robo de credenciales del rol. (1) Rotar/revocar las credenciales de la instancia (revocar sesiones activas del rol en IAM); (2) auditar con CloudTrail qué hizo ese rol durante la ventana (¿listó buckets?, ¿leyó datos?); (3) parchear el endpoint y forzar IMDSv2 en toda la flota; (4) tratar los datos accedidos según su clasificación (posible notificación); (5) revisar todos los demás servicios con funcionalidad de fetch de URLs.

---

## 11. XSS y Content Security Policy: modelo de amenaza y defensa en capas

**Categoría:** Web / XSS · **Tipo:** Conceptual

### 📝 Respuesta resumen
XSS permite que un atacante ejecute JavaScript en el navegador de la víctima dentro del origen de tu aplicación, con acceso a su sesión, DOM y acciones. Se previene con codificación de salida contextual (que los frameworks modernos hacen por defecto si no los puenteas), sanitización de HTML permitido, cookies HttpOnly y una CSP estricta basada en nonces como red de seguridad. CSP no sustituye la corrección del código: mitiga el impacto cuando algo se escapa.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** El navegador no distingue entre el script legítimo de tu aplicación y uno inyectado: ambos corren con los privilegios del origen. Tres variantes: **almacenado** (el payload persiste en la base de datos —un comentario, un nombre de perfil— y se ejecuta en cada víctima que lo ve), **reflejado** (el payload viaja en la URL y se refleja en la respuesta) y **DOM-based** (JavaScript del cliente inserta datos no confiables en sinks peligrosos como `innerHTML` sin pasar por el servidor). El impacto real: robo de sesión, acciones en nombre de la víctima, keylogging, defacement, y pivotar hacia administradores (un XSS almacenado en un panel interno es crítico).

**Cómo detectarlo.** (1) SAST y revisión buscando sinks peligrosos: `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `document.write`, plantillas server-side con escape deshabilitado (`| safe`, `<%- %>`); (2) DAST; (3) en producción, los **CSP violation reports** (`report-to`) son un detector gratuito: violaciones inesperadas indican inyecciones o dependencias comprometidas.

**Cómo prevenirlo (capas).**
1. **Codificación de salida contextual**: la defensa principal. React/Vue/Angular escapan por defecto; el riesgo son los escapes deliberados. Regla de equipo: todo uso de `dangerouslySetInnerHTML`/`v-html` requiere justificación y sanitización.
2. **Sanitización** cuando se permite HTML del usuario (editores ricos): DOMPurify con allowlist estricta, nunca regex casero.
3. **Cookies de sesión** con `HttpOnly` (JavaScript no puede leerlas), `Secure` y `SameSite`.
4. **CSP estricta** como mitigación: la recomendación moderna es nonces + `strict-dynamic` en vez de allowlists de dominios (casi siempre bypasseables por endpoints JSONP/librerías en dominios permitidos):

```
Content-Security-Policy:
  script-src 'nonce-{aleatorio-por-request}' 'strict-dynamic';
  object-src 'none';
  base-uri 'none';
  report-to csp-endpoint;
```
El nonce se genera por request y solo los `<script>` que lo llevan se ejecutan; un script inyectado no lo conoce. Desplegar primero en `Content-Security-Policy-Report-Only` para medir roturas antes de bloquear.
5. **Trusted Types** en navegadores compatibles para eliminar sinks DOM inseguros por política.

**Qué hacer si ya ocurrió.** Ante un XSS almacenado explotado: (1) eliminar/neutralizar el payload almacenado y parchear el punto de inyección; (2) identificar a las víctimas: quién visualizó el contenido durante la ventana (logs de acceso); (3) invalidar las sesiones de los usuarios expuestos y forzar re-login (asumir robo de sesión si las cookies no eran HttpOnly); (4) revisar qué acciones realizaron esas sesiones (posible actividad del atacante); (5) buscar el mismo antipatrón de renderizado en el resto del código y desplegar/endurecer CSP para que la clase entera de ataque quede mitigada.

---

## 12. CSRF y SameSite: ¿sigue siendo relevante y cómo se defiende hoy?

**Categoría:** Web / CSRF · **Tipo:** Conceptual

### 📝 Respuesta resumen
CSRF explota que el navegador adjunta cookies automáticamente: una página maliciosa hace que el navegador de la víctima envíe requests autenticados a tu aplicación sin su intención. Hoy el riesgo está reducido por cookies `SameSite=Lax` por defecto, pero no eliminado: aplica a APIs con cookies, configuraciones `SameSite=None` y gaps del propio Lax. Defensa: tokens anti-CSRF sincronizados para apps con sesión de cookie, SameSite correcto, verificación de cabeceras de origen, y no usar GET para mutaciones.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** El navegador envía las cookies de `tuapp.com` en cualquier request hacia `tuapp.com`, sin importar qué página lo originó. Una web maliciosa puede incluir un formulario auto-enviado hacia `POST tuapp.com/transfer`; el navegador de la víctima logueada adjunta su cookie de sesión y la aplicación ejecuta la acción creyendo que es legítima. El atacante no lee la respuesta (lo impide same-origin policy): CSRF es un ataque de *escritura ciega*. Solo afecta a autenticación que el navegador adjunta automáticamente (cookies, Basic auth); un `Authorization: Bearer` que el JS añade explícitamente no es forjable así.

**Cómo detectarlo.** (1) Revisar si los endpoints mutadores exigen algo más que la cookie de sesión; (2) verificar la configuración SameSite de las cookies de sesión; (3) buscar mutaciones vía GET (rompen las asunciones de SameSite=Lax, que sí envía cookies en navegaciones top-level GET); (4) DAST y pentest lo cubren de forma estándar.

**Cómo prevenirlo (capas).**
- **SameSite**: `Lax` como mínimo (default moderno de Chrome), que bloquea cookies en POST cross-site; `Strict` para cookies de acciones sensibles. Cuidado con `SameSite=None` (necesario para contextos embebidos legítimos): reintroduce el riesgo completo y exige token anti-CSRF sí o sí.
- **Token anti-CSRF (synchronizer pattern)**: un token aleatorio por sesión que el servidor exige en cada mutación, enviado en un campo/cabecera que una página externa no puede conocer:

```java
// Spring Security lo trae por defecto para apps con sesión:
http.csrf(csrf -> csrf
    .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()));
// El frontend lee la cookie XSRF-TOKEN y la reenvía como cabecera X-XSRF-TOKEN.
// Funciona porque una página de otro origen no puede LEER esa cookie, solo enviarla.
```
- **Verificar cabeceras `Origin`/`Sec-Fetch-Site`**: rechazar mutaciones cuyo origen no sea el propio; barato y eficaz como capa adicional.
- **Semántica HTTP correcta**: GET nunca muta estado; es la asunción sobre la que descansa SameSite=Lax.
- Para acciones críticas: re-autenticación o confirmación explícita (step-up).
- **APIs puras con Bearer tokens**: CSRF no aplica, pero solo si de verdad no se acepta también la cookie como autenticación alternativa (error común en migraciones).

**Qué hacer si ya ocurrió.** Un CSRF explotado significa acciones no autorizadas con sesiones legítimas: (1) parchear (token + SameSite) y, si es viable, invalidar sesiones activas; (2) identificar las acciones forjadas: buscar en logs mutaciones con `Referer`/`Origin` externos o patrones idénticos en masa; (3) revertir los cambios fraudulentos (transferencias, cambios de email —vector típico para account takeover posterior); (4) notificar a los usuarios afectados, especialmente si el CSRF cambió credenciales de contacto; (5) auditar todos los endpoints mutadores para confirmar que la protección es global (filtro central) y no endpoint a endpoint.

---

## 13. Deserialización insegura en Java y Node: ¿por qué es tan peligrosa y cómo se evita?

**Categoría:** Deserialización · **Tipo:** Conceptual

### 📝 Respuesta resumen
Deserializar datos no confiables con formatos que codifican *tipos y objetos* (serialización nativa de Java, `pickle`, ciertos usos de YAML) permite que el atacante elija qué clases se instancian; con "gadget chains" presentes en el classpath eso escala a ejecución remota de código. En Node el equivalente son los prototype pollution y librerías que evalúan código al parsear. Defensa: nunca deserializar formatos de objetos desde fuentes no confiables; usar JSON con validación de esquema y binding a tipos explícitos.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** La serialización nativa de Java no transporta solo datos: transporta *qué clase instanciar*. Al deserializar, la JVM construye los objetos que el stream indica y ejecuta código de sus métodos (`readObject`, etc.) antes de que tu aplicación valide nada. Si el classpath contiene clases con efectos secundarios encadenables ("gadgets", famosas las de Commons Collections), un stream manipulado convierte la deserialización en ejecución de código arbitrario. El punto clave para la entrevista: **la vulnerabilidad se dispara al deserializar, antes de cualquier validación de negocio**. En Node/JS el riesgo análogo tiene dos formas: librerías de serialización que serializan funciones y las evalúan al deserializar, y **prototype pollution**: un merge recursivo de JSON con claves `__proto__` contamina `Object.prototype`, alterando el comportamiento de toda la aplicación (bypass de checks, y RCE si algo usa las propiedades contaminadas en contextos de ejecución).

**Cómo detectarla.** (1) Buscar en el código: `ObjectInputStream.readObject` sobre datos externos (HTTP, colas, caché compartida, cookies), `XMLDecoder`, XStream/SnakeYAML sin restricciones de tipos, `node-serialize`, merges profundos caseros; (2) SAST tiene reglas para todo esto; (3) inventariar dónde entran bytes serializados: RMI, JMX, sesiones persistidas, mensajes de Kafka con serializador de objetos Java; (4) en runtime, excepciones `InvalidClassException`/`ClassNotFoundException` con clases exóticas en logs sugieren intentos de explotación.

**Cómo prevenirla.**
- **Regla número uno**: no deserializar objetos nativos de fuentes no confiables. Punto. Migrar a JSON/protobuf con binding a DTOs explícitos:

```java
// Seguro: Jackson a un tipo concreto, sin tipos polimórficos por defecto
ObjectMapper mapper = new ObjectMapper();
OrderDto dto = mapper.readValue(json, OrderDto.class);
// Evitar enableDefaultTyping()/@JsonTypeInfo con Object:
// reintroducen la elección de clase por parte del dato.
```
- Si es imposible migrar de inmediato: `ObjectInputFilter` (JEP 290) con allowlist estricta de clases, y firma HMAC del blob para rechazar streams manipulados antes de tocarlos.
- En Node: validar esquema (ajv/zod) antes de usar datos, usar `Object.create(null)` o Maps para estructuras clave-valor de entrada, librerías de merge que ignoran `__proto__`/`constructor`, y `Object.freeze(Object.prototype)` como defensa adicional.
- Mantener dependencias al día: muchas cadenas de gadgets se neutralizan en versiones nuevas.

**Qué hacer si ya ocurrió.** Explotación de deserialización = asumir RCE y compromiso del host/pod: (1) aislar el workload (cordon del nodo, revocar credenciales del pod/instancia); (2) capturar evidencia (memoria, imagen del contenedor) antes de destruir; (3) rotar todos los secretos accesibles desde ese servicio; (4) buscar persistencia y movimiento lateral en la ventana del ataque; (5) parchear el punto de entrada y redeplegar desde imágenes limpias; (6) revisar el resto del parque en busca del mismo endpoint/patrón.

---

## 14. JWT: errores comunes (alg none, secretos débiles, audience/issuer, revocación) y uso correcto

**Categoría:** Autenticación / JWT · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los fallos típicos con JWT no son del formato sino de su uso: aceptar `alg: none` o dejar que el token dicte el algoritmo, secretos HMAC débiles o compartidos de más, no validar `aud`/`iss`/`exp`, confusión RS256→HS256 usando la clave pública como secreto, tokens eternos sin estrategia de revocación y meter datos sensibles en el payload (que solo va codificado en base64, no cifrado). Uso correcto: algoritmo fijado por el servidor, claves asimétricas con rotación vía JWKS, tokens cortos + refresh revocable, y validación completa de claims en cada servicio.

### 📖 Respuesta detallada
**Cómo funciona conceptualmente.** Un JWT es un JSON firmado cuya seguridad descansa por completo en que el receptor verifique la firma y los claims correctamente. Errores clásicos: (1) **`alg: none`**: implementaciones antiguas aceptaban tokens "firmados" con el algoritmo none, es decir, sin firma — el atacante edita el payload y quita la firma; (2) **confusión de algoritmo**: si el validador lee el `alg` del propio token, un token HS256 firmado usando la clave *pública* RSA (que es pública) como secreto HMAC pasa la validación en librerías que no fijan algoritmo; (3) **secretos HMAC débiles** ("secret", el nombre de la empresa): crackeables offline porque cualquier token emitido sirve como oráculo; (4) **no validar `aud`/`iss`**: un token legítimo emitido para el servicio A se reutiliza contra el servicio B que comparte el mismo emisor (token passing/confusión de audiencia); (5) **sin expiración corta ni revocación**: un token robado sirve durante horas o días; (6) **datos sensibles en el payload**: el payload es legible por cualquiera que tenga el token.

**Cómo detectarlo.** Revisar el código de validación: ¿fija el algoritmo esperado?, ¿valida `exp`, `nbf`, `iss`, `aud`? Auditar la fortaleza y el almacenamiento del secreto/clave. Probar en un entorno de test tokens sin firma, con algoritmo cambiado y expirados. Verificar que *todos* los servicios validan, no solo el gateway.

**Cómo usarlo correctamente.**

```javascript
// jsonwebtoken (Node): fijar algoritmo y validar claims siempre
jwt.verify(token, publicKeyOrJwksKey, {
  algorithms: ['RS256'],          // nunca derivado del token
  issuer: 'https://auth.miempresa.com',
  audience: 'api-pedidos',        // audiencia específica de ESTE servicio
  clockTolerance: 5
});
```
- **Asimétrico (RS256/ES256/EdDSA)** para que los servicios solo necesiten la clave pública, distribuida vía **JWKS** con `kid`, lo que habilita rotación de claves sin despliegues coordinados.
- **Access token corto** (5–15 min) + **refresh token** revocable server-side. La revocación de access tokens se resuelve con vida corta más una denylist de `jti` para casos de emergencia (logout forzoso, token comprometido), consultada en el gateway.
- Claims mínimos: identidad, audiencia, scopes; nada de PII innecesaria ni secretos.
- Transporte: solo por TLS; en navegador, preferir cookie `HttpOnly` frente a localStorage (robable vía XSS).

**Qué hacer si ya ocurrió.** Si se compromete la **clave de firma**: rotación inmediata (publicar clave nueva en JWKS, retirar la vieja), invalidar todos los tokens emitidos con la comprometida (los servicios rechazan su `kid`), forzar re-autenticación global y auditar accesos durante la ventana: cualquier token de esa clave pudo ser forjado, incluidos claims de admin. Si es un **token individual** robado: denylist de su `jti`, revocar el refresh asociado, invalidar la sesión y revisar la actividad de esa identidad.

---

## 15. OAuth2 y OIDC: flujos correctos, PKCE y errores comunes de implementación

**Categoría:** Autenticación / OAuth2-OIDC · **Tipo:** Conceptual

### 📝 Respuesta resumen
OAuth2 es delegación de autorización; OIDC añade la capa de identidad (ID token) encima. Hoy: Authorization Code + PKCE para todo cliente interactivo (SPA, móvil y también apps confidenciales), client credentials para servicio-a-servicio; implicit flow y ROPC están deprecados. Errores comunes: usar el access token como prueba de identidad, redirect URIs mal validadas, no usar/validar `state` y `nonce`, tokens en URLs y scopes excesivos.

### 📖 Respuesta detallada
**Conceptos.** OAuth2 responde "este cliente puede acceder a este recurso en nombre del usuario" (access token para la API); OIDC responde "quién es el usuario" (ID token, un JWT para el cliente, con `nonce` y `aud` del cliente). Confundirlos causa bugs reales: autenticar usuarios con un access token opaco ajeno ("login con X" casero) permite ataques de sustitución de token, porque el access token no está ligado a tu cliente como audiencia.

**Flujos correctos hoy (OAuth 2.1 consolidó esto).**
- **Authorization Code + PKCE** para todo cliente con usuario: el cliente genera un `code_verifier` aleatorio, envía su hash (`code_challenge`) al autorizar, y presenta el verifier al canjear el código. Así, un código de autorización interceptado (por redirect, logs o apps móviles con esquemas registrados) no sirve sin el verifier, que nunca viajó. PKCE también protege contra ataques de inyección de código en clientes confidenciales, por eso se recomienda siempre.
- **Client credentials** para máquina-a-máquina sin usuario.
- **Deprecados**: *implicit flow* (tokens en el fragmento de la URL: quedan en historial, logs, referrers, sin autenticación de cliente) y *ROPC/password grant* (el cliente ve la contraseña, rompe el propósito de la delegación e impide MFA).

**Errores comunes y su defensa.**
1. **Redirect URI laxa**: validación por prefijo o wildcard permite redirigir el código al atacante. Defensa: matching exacto de URIs registradas.
2. **Sin `state`**: habilita CSRF de login (la víctima queda logueada en la sesión del atacante). Defensa: `state` aleatorio ligado a la sesión, verificado al volver. **Sin `nonce`** en OIDC: permite replay de ID tokens.
3. **No validar el ID token** completo: firma, `iss`, `aud` (tu client_id), `exp`, `nonce`.
4. **Scopes excesivos**: pedir todo "por si acaso" amplía el daño de cualquier token robado. Mínimo privilegio también aquí.
5. **Tokens en el navegador mal almacenados**: preferir el patrón BFF (backend for frontend: los tokens viven en el servidor, el navegador solo lleva una cookie de sesión HttpOnly) frente a SPAs guardando tokens en localStorage.
6. **No rotar refresh tokens**: la rotación con detección de reuso (si un refresh ya usado vuelve a aparecer, revocar toda la cadena) convierte el robo de refresh token en detectable.

**Cómo detectarlo.** Revisar la configuración del cliente en el IdP (URIs, grants habilitados — deshabilitar implicit/ROPC explícitamente), el código de callback (¿valida state/nonce?), y los logs del IdP (canjes de código fallidos, reuso de refresh tokens).

**Qué hacer si ya ocurrió.** Ante un compromiso del flujo (p. ej. redirect URI abierta explotada): corregir la validación, revocar los tokens y consentimientos emitidos durante la ventana, forzar re-login de los usuarios afectados, revisar en logs del IdP qué autorizaciones se emitieron hacia la URI maliciosa y notificar según el alcance. Si se filtró el client secret: rotarlo en el IdP y en el cliente, y auditar emisiones de tokens con ese secreto.

---

## 16. Secrets management: ciclo de vida, rotación y detección de secretos en repositorios

**Categoría:** Gestión de secretos · **Tipo:** Conceptual

### 📝 Respuesta resumen
Los secretos (API keys, contraseñas de BD, claves privadas) requieren un ciclo de vida gestionado: generación, distribución, uso, rotación y revocación. Antipatrones: secretos en código o repos, en variables de entorno versionadas, compartidos entre entornos y eternos. La solución: un secret manager central (Vault, AWS Secrets Manager), identidades federadas de corta duración en lugar de secretos estáticos donde sea posible, rotación automática, y detección de secretos en pre-commit y en el pipeline.

### 📖 Respuesta detallada
**El problema.** Un secreto es valioso, longevo y silenciosamente copiable: una API key filtrada funciona igual para el atacante que para ti, y no hay señal de que fue copiada. Los secretos se filtran por rutas predecibles: commiteados al repo (y aunque se borren, permanecen en la historia de git), pegados en logs, en tickets, en variables de CI visibles, en imágenes de contenedor (capas intermedias incluidas), y compartidos por chat.

**Buenas prácticas de ciclo de vida.**
1. **Almacenamiento central**: Vault/AWS Secrets Manager/GCP Secret Manager con acceso auditado, control por identidad del workload y cifrado. La aplicación los obtiene en runtime (SDK, CSI driver en Kubernetes, inyección al arrancar), nunca los persiste.
2. **Eliminar secretos estáticos cuando sea posible**: la mejor gestión del secreto es que no exista. Workload identity (IRSA en EKS, Workload Identity en GKE, OIDC federation en CI: GitHub Actions obtiene credenciales AWS temporales sin ninguna key almacenada) reemplaza keys estáticas por credenciales de minutos ligadas a la identidad de la carga.
3. **Rotación**: automática y sin downtime, lo que exige que las aplicaciones toleren rotación (releer el secreto, soportar ventana con dos versiones válidas). Regla práctica: si rotar un secreto da miedo, ese es el primer problema a resolver — la rotación debe ser un no-evento ensayado, porque durante un incidente será urgente.
4. **Mínimo alcance**: un secreto por servicio y entorno; nunca la misma credencial en dev y prod; permisos mínimos asociados (una key de solo lectura no debe poder escribir).
5. **Auditoría**: todo acceso al secret manager queda registrado; alertas sobre lecturas anómalas.

**Detección de secretos en repos.**
- **Pre-commit**: gitleaks/trufflehog como hook local — la forma más barata: el secreto nunca llega al remoto.
- **Pipeline y escaneo del histórico**: escanear cada push y periódicamente toda la historia de todos los repos (los secretos viejos siguen ahí). GitHub secret scanning con push protection bloquea pushes con patrones de secretos conocidos y notifica a los proveedores.

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

**Qué hacer si ya ocurrió** (secreto commiteado): el orden importa — **rotar primero, limpiar después**. (1) Rotar/revocar el secreto inmediatamente: desde que tocó el remoto se asume comprometido (hay bots escaneando repos públicos en segundos; en privados, la historia queda para siempre); (2) auditar el uso del secreto durante la ventana de exposición (logs del proveedor: ¿llamadas desde IPs desconocidas?); (3) solo entonces limpiar la historia (`git filter-repo`, coordinando force-push con el equipo) sabiendo que la limpieza es higiene, no mitigación — clones y forks conservan la historia; (4) causa raíz: añadir el hook de pre-commit y push protection al repo afectado y a toda la organización.

---

## 17. Dependencias vulnerables: SCA, priorización con CVSS/EPSS y respuesta a un CVE crítico

**Categoría:** Supply chain / Gestión de vulnerabilidades · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Un backlog de cientos de CVEs no se resuelve "parcheando todo": se prioriza combinando severidad técnica (CVSS), probabilidad real de explotación (EPSS, KEV de CISA), alcance (¿el código vulnerable es alcanzable?) y exposición del servicio (¿internet-facing?, ¿procesa entrada externa?). Ante un CVE crítico tipo Log4Shell: inventario inmediato vía SBOM, mitigaciones temporales mientras se parchea, parcheo priorizado por exposición y verificación de explotación previa.

### 📖 Respuesta detallada
**Herramientas y proceso continuo.** SCA (Snyk, Trivy, Dependency-Check, Dependabot alerts) comparando tu grafo de dependencias contra bases de CVEs, ejecutándose (a) en cada build como gate, y (b) continuamente sobre lo desplegado, porque los CVEs se publican después de tus builds. Prerequisito: **SBOM por servicio y por versión desplegada**, porque la pregunta crítica en un incidente es "¿dónde exactamente usamos X?" y responderla con grep a las 2 AM no escala.

**Priorización (la parte senior).** CVSS mide severidad teórica, no riesgo real: la mayoría de CVEs nunca se explotan. Combinar señales:
- **CVSS**: impacto potencial (un 9.8 RCE ≠ un 5.3 DoS).
- **EPSS**: probabilidad estimada de explotación en 30 días; un CVSS 7 con EPSS alto merece más urgencia que un 9 con EPSS ínfimo.
- **KEV (CISA Known Exploited Vulnerabilities)**: explotación confirmada en el mundo real → prioridad automática.
- **Alcanzabilidad**: ¿tu código invoca la función vulnerable? (algunos SCA hacen reachability analysis, reduciendo ruido drásticamente).
- **Contexto del servicio**: internet-facing con datos sensibles ≠ batch interno.

Con esto se definen **SLAs de remediación** realistas: crítico explotado/internet-facing en 24-72h, alto en 1-2 semanas, medio en el ciclo normal. Y la mejor reducción del backlog es preventiva: actualización continua automatizada (Renovate) para que el delta ante cualquier CVE sea pequeño.

**[CASO] Respuesta a un Log4Shell.** Se anuncia RCE crítico, trivialmente explotable, en una librería omnipresente:
1. **Inventario (primeras horas)**: consultar SBOMs/SCA: qué servicios incluyen la librería (¡incluidas dependencias transitivas y vendors!), qué versiones, cuáles están expuestos a internet o procesan entrada externa. Priorizar por exposición.
2. **Mitigación temporal** mientras se parchea: las que el aviso oficial ofrezca (flags de configuración, eliminar la clase afectada del jar, en Log4Shell `log4j2.formatMsgNoLookups`), reglas WAF (asumiendo que son bypasseables — ganan tiempo, no resuelven) y **egress filtering**: bloquear conexiones salientes arbitrarias neutraliza muchos RCE que necesitan descargar el payload.
3. **Parcheo en oleadas**: primero expuestos a internet, después internos; con pipeline maduro esto son horas, no semanas — la capacidad de "redesplegar todo hoy" es en sí misma un control de seguridad.
4. **Caza retrospectiva**: el CVE existía antes del anuncio. Buscar indicadores de explotación en logs previos (patrones del exploit, conexiones salientes anómalas, procesos inesperados). Si hay indicios: activar respuesta a incidentes completa (aislar, rotar secretos del servicio, forense).
5. **Vendors**: inventariar productos de terceros que embeben la librería y exigir fechas de parche.
6. **Postmortem**: medir tiempo real de inventario y parcheo; cada hueco (SBOM incompleto, servicios sin pipeline) se convierte en trabajo priorizado.

---

## 18. Seguridad en contenedores y Kubernetes: imágenes, least privilege, network policies y pod security

**Categoría:** Contenedores / Kubernetes · **Tipo:** Conceptual

### 📝 Respuesta resumen
La seguridad de contenedores tiene cuatro capas: la imagen (mínima, escaneada, sin secretos, no-root), el runtime del pod (securityContext restrictivo: sin privilegios, filesystem de solo lectura, capabilities mínimas), la red (NetworkPolicies deny-by-default: un pod solo habla con quien necesita) y el plano de control (RBAC mínimo, secrets cifrados, admission policies que impiden desplegar configuraciones inseguras). El objetivo: que un contenedor comprometido sea un callejón sin salida, no una cabeza de puente.

### 📖 Respuesta detallada
**Imágenes.**
- Base mínima (distroless, alpine, chainguard): menos paquetes = menos CVEs y menos herramientas para el atacante (sin shell siquiera, idealmente).
- Multi-stage builds para no arrastrar toolchain de compilación; escaneo (Trivy/Grype) en el pipeline con gate sobre severidad; sin secretos en ninguna capa (las capas intermedias se inspeccionan); usuario no-root definido en la imagen; despliegue por **digest** (inmutable) y no por tag `latest` (mutable); firmar imágenes (cosign) y verificar en admisión.

**Runtime del pod (least privilege).** La configuración que debería ser la plantilla por defecto del equipo:

```yaml
securityContext:            # a nivel de contenedor
  runAsNonRoot: true
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
  seccompProfile:
    type: RuntimeDefault
```
Cada línea neutraliza una técnica de post-explotación: sin root ni capabilities se dificulta el escape, sin escalada se bloquean setuid binaries, filesystem de solo lectura impide implantar herramientas o persistencia. Añadir: `automountServiceAccountToken: false` salvo que el pod hable con la API de Kubernetes (el token montado por defecto es un regalo para el atacante), y límites de recursos (un pod comprometido no debe poder hacer DoS del nodo ni minar cripto sin límite). Nunca `privileged: true` ni montar el socket de Docker.

**Red.** Por defecto en Kubernetes todo pod alcanza a todo pod: primer objetivo del movimiento lateral. **NetworkPolicies deny-by-default** por namespace y aperturas explícitas mínimas (el frontend habla con la API; la API con su base de datos; nadie más con la base de datos), incluyendo **egress** (limita exfiltración y descarga de payloads). En mallas con mTLS (Istio/Linkerd) se añade identidad criptográfica y AuthorizationPolicies por servicio.

**Plano de control y políticas.**
- **RBAC mínimo**: humanos y service accounts con lo justo; nada de cluster-admin para CI; auditar quién puede crear pods (crear un pod privilegiado ≈ root en el nodo) o leer secrets.
- **Pod Security Admission** (perfil `restricted` por namespace) más un policy engine (Kyverno/Gatekeeper) para reglas propias: bloquear imágenes de registros no aprobados, exigir firmas, prohibir `latest`. La clave es que sea *preventivo* (admission), no solo detectivo.
- **Secrets**: cifrado en etcd (KMS provider) o mejor, external secrets desde Vault/Secrets Manager; RBAC estricto sobre ellos.
- Nodos: actualizados, mínimos, sin SSH generalizado; audit logging del API server activado.

**Qué hacer si ya ocurrió** (pod comprometido): aislarlo con una NetworkPolicy de cuarentena (mejor que matarlo al instante: preserva evidencia), capturar estado (logs, procesos, imagen del contenedor), revocar el token de su service account y las credenciales cloud asociadas (IRSA), revisar audit logs de Kubernetes y del cloud por movimiento lateral, cordon del nodo si hay sospecha de escape, y redeplegar desde imagen limpia tras parchear el vector de entrada.
