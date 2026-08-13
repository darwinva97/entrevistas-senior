# Casos e Incidentes de Seguridad

> Todas las preguntas son de tipo [CASO] con enfoque de respuesta a incidentes. Estructura mental recomendada: contener → erradicar → recuperar → aprender, sin perder de vista la evidencia y la comunicación.

---

## 1. Encuentran una API key commiteada en el repositorio

**Categoría:** Respuesta a incidentes / Secretos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Asumir el secreto comprometido desde el instante en que tocó el remoto. El orden correcto es: rotar/revocar primero, auditar su uso después, y limpiar la historia al final (es higiene, no mitigación). Limpiar el repo sin rotar es el error clásico: el secreto ya fue copiado. Cerrar con causa raíz: pre-commit hooks y push protection para toda la organización.

### 📖 Respuesta detallada
**Triage inicial (minutos).** Determinar qué es la key, qué permite y su alcance: ¿es de producción?, ¿da acceso a datos o a dinero?, ¿repo público o privado?, ¿desde cuándo está (git blame/log del commit)? El repo público es una emergencia — hay bots que escanean GitHub y explotan keys en segundos; el privado también se considera comprometido (clones, forks, personas con acceso, y la historia es permanente).

**Contención: rotar y revocar (lo primero, siempre).** Generar credencial nueva, desplegarla por el canal correcto (secret manager) y **revocar la antigua**. El orden importa: si limpias la historia antes de rotar, pierdes tiempo mientras el secreto sigue vivo. Si rotar da miedo por posible downtime, ese es un problema aparte a resolver — pero la exposición no espera. Para credenciales cloud, revocar también sesiones/tokens temporales derivados.

**Investigación: auditar el uso.** Con los logs del proveedor (CloudTrail, logs de la API), revisar si la key se usó desde orígenes desconocidos durante la ventana de exposición: IPs, geografías, patrones de acceso anómalos, volúmenes inusuales. Esto determina si esto es "casi-incidente" (rotado a tiempo, sin uso malicioso) o incidente real (hubo acceso) que escala a respuesta completa: alcance de datos, notificación, forense.

**Erradicación: limpiar la historia (al final, sabiendo que es higiene).** `git filter-repo` (o BFG) para purgar el secreto del histórico y force-push coordinado con el equipo (rompe clones; comunicar). Importante: esto **no** deshace la exposición — copias, forks, caches y la memoria de quien lo vio permanecen. Por eso la rotación fue lo primero. En repos con forks públicos, la limpieza es casi simbólica.

**Causa raíz y prevención.** El incidente real no es "se filtró una key", es "era posible filtrarla sin que nadie lo notara". Implantar: pre-commit hooks (gitleaks) para que nunca llegue al remoto, push protection a nivel de organización (bloquea el push con patrones de secreto conocidos), escaneo del histórico de todos los repos (hay más secretos viejos ahí), y migración a workload identity/secret manager para reducir la cantidad de secretos estáticos que pueden filtrarse. Postmortem sin culpas: el objetivo es un sistema donde este error sea difícil de cometer, no reprender al autor del commit.

---

## 2. Anuncian un CVE crítico en una librería usada en 40 servicios

**Categoría:** Respuesta a incidentes / Supply chain · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Triage a escala: primero inventario con SBOM/SCA (qué servicios, qué versiones, cuáles expuestos), luego mitigación temporal en los de mayor exposición mientras se parchea, después parcheo en oleadas priorizado por riesgo, y finalmente caza retrospectiva de explotación previa (el CVE existía antes del anuncio). La capacidad de responder rápido es en sí un control de seguridad.

### 📖 Respuesta detallada
**Movilización y triage (primeras horas).** Convocar a un incident lead. La primera pregunta es "¿dónde exactamente lo usamos?", y responderla con grep a las 2 AM no escala a 40 servicios: aquí paga tener **SBOM por servicio y versión**. Consultar SCA/SBOMs para el inventario: qué servicios incluyen la librería (incluidas dependencias *transitivas* y productos de terceros que la embeben), qué versiones, y —clave para priorizar— cuáles están internet-facing o procesan entrada no confiable. No todos los 40 tienen el mismo riesgo.

**Priorización.** Ordenar por exposición real: internet-facing + procesa entrada externa + datos sensibles primero; batch internos sin red, al final. Cruzar la severidad del CVE con si hay explotación pública conocida (KEV) y si la ruta vulnerable es alcanzable en tu uso (algunos SCA hacen reachability y descartan servicios que incluyen la librería pero no llaman a la función afectada).

**Mitigación temporal (mientras se parchea).** Para los de mayor exposición, aplicar de inmediato las mitigaciones que el aviso oficial ofrezca (flags de configuración, eliminar la clase afectada), reglas WAF virtuales (asumiendo que son bypasseables — ganan tiempo, no cierran), y **egress filtering**: bloquear salidas arbitrarias neutraliza muchos RCE que necesitan descargar el payload. Estas medidas compran horas para un parcheo ordenado.

**Parcheo en oleadas.** Actualizar la dependencia y redesplegar, primero los expuestos, luego internos. Con un pipeline maduro y actualización automatizada previa (Renovate), esto es cuestión de horas. Verificar en cada oleada que el servicio sigue sano (por eso importa la suite de tests). La lección que un senior enfatiza: "poder redesplegar los 40 hoy" es una capacidad de seguridad que se construye antes del incidente.

**Caza retrospectiva.** El CVE existía antes del anuncio: pudo explotarse como 0-day. Buscar indicadores en logs previos (patrones conocidos del exploit, conexiones salientes anómalas, procesos inesperados, cambios de ficheros). Si hay indicios de explotación real, escalar a respuesta a incidentes completa para ese servicio: aislar, rotar secretos alcanzables, forense, evaluar datos accedidos.

**Cierre.** Comunicar estado a stakeholders con datos (X/40 parcheados, ventana estimada). Contactar a proveedores de productos que embeben la librería y exigir fechas. Postmortem que mida el tiempo real de inventario y parcheo, y convierta cada hueco (SBOM incompleto, servicio sin pipeline, dependencia sin lockfile) en trabajo priorizado — el próximo Log4Shell llega sin avisar.

---

## 3. Detectas tráfico anómalo que sugiere una cuenta de servicio comprometida

**Categoría:** Respuesta a incidentes / Identidad M2M · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Confirmar y caracterizar la anomalía (origen nuevo, horario inusual, acceso a recursos fuera de patrón), contener revocando/rotando las credenciales de la cuenta de servicio y acotando sus permisos, investigar qué hizo esa identidad en toda la ventana con los logs de auditoría, y determinar cómo se comprometió (secreto filtrado, servicio host explotado). Cerrar reduciendo el radio: mínimo privilegio y credenciales de corta duración.

### 📖 Respuesta detallada
**Confirmación y caracterización.** Antes de reaccionar, verificar que es real y no un cambio legítimo (nuevo despliegue, cambio de región). Señales que apuntan a compromiso: uso de la credencial desde una IP/ASN nuevo o externo, en horarios fuera del patrón del servicio, accediendo a recursos que ese servicio nunca toca (el servicio de informes leyendo la tabla de credenciales), volúmenes anómalos (exfiltración = muchas lecturas), o llamadas a APIs de administración/IAM (intento de escalar o persistir). GuardDuty y detecciones equivalentes alertan justo sobre esto (credenciales de instancia usadas desde fuera).

**Contención.** Revocar/rotar la credencial de la cuenta de servicio de inmediato. Si es un rol cloud, revocar sesiones activas (deny policy temporal / revocación de sesiones STS). Si sospechas que el host/pod que usa esa identidad está comprometido (y no solo la credencial filtrada), aislar también ese workload (cuarentena de red) — porque rotar la credencial no sirve si el atacante sigue dentro del servicio que la genera. Equilibrio: cortar el acceso del atacante sin tumbar un servicio crítico legítimo; a veces se acotan permisos (quitar los abusados) antes de revocar del todo, para investigar.

**Investigación.** Con los logs de auditoría, reconstruir todo lo que esa identidad hizo durante la ventana completa (no solo lo que disparó la alerta): qué leyó, qué modificó, si creó nuevas credenciales/usuarios (persistencia), si se movió lateralmente usando los permisos de la cuenta. Aquí es donde **una identidad por servicio** paga: la atribución es inmediata. Determinar el vector: ¿secreto estático filtrado (repo, log, imagen)?, ¿el servicio host fue explotado (RCE) y el atacante robó su token de workload identity?, ¿SSRF hacia metadata?

**Erradicación y recuperación.** Cerrar el vector (parchear el servicio, limpiar el secreto, forzar IMDSv2). Eliminar cualquier persistencia creada. Rotar credenciales secundarias que el atacante pudo alcanzar. Restaurar/verificar integridad de datos modificados.

**Lecciones (reducir el radio).** Casi siempre el postmortem revela permisos excesivos ("¿por qué esa cuenta podía leer eso?"). Endurecer: mínimo privilegio real en la identidad, migrar de secretos estáticos a workload identity con credenciales de minutos (reduce la ventana de un robo), scopes acotados, y mejorar la detección (la alerta que funcionó, extenderla; los accesos que no se auditaban, instrumentarlos).

---

## 4. Un pentest reporta un IDOR en tu API

**Categoría:** Respuesta a incidentes / Broken Access Control · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Verificar y reproducir el IDOR, evaluar si fue explotado en producción con los logs de acceso, corregir aplicando verificación de propiedad del recurso en el servidor, y —lo más importante en un IDOR— buscar el mismo patrón en toda la API porque raramente hay uno solo. Cerrar con tests de autorización automatizados que impidan la regresión.

### 📖 Respuesta detallada
**Verificación.** Reproducir el hallazgo del pentest: con dos usuarios, confirmar que el usuario A accede a un recurso del usuario B cambiando un identificador (`/api/invoices/1002`). Clasificar severidad por el dato expuesto (¿PII?, ¿financiero?) y por si permite escritura además de lectura (modificar/borrar recursos ajenos es peor que leerlos).

**¿Fue explotado antes del pentest?** Pregunta crítica que distingue un bug de un incidente. Con los logs de acceso, buscar señales de explotación real previa: un mismo usuario/token accediendo a un rango amplio de IDs, secuencias de IDs consecutivos (enumeración), respuestas exitosas donde debería haber 403/404. Si hay evidencia de explotación real → es un incidente de exposición de datos: determinar qué se accedió, qué usuarios se vieron afectados, y evaluar notificación regulatoria. Si no hay evidencia y el pentest fue el descubridor → es una vulnerabilidad a corregir sin brecha.

**Corrección.** El fix correcto es verificar la **propiedad del recurso en el servidor**, no ocultar el botón en la UI ni usar IDs difíciles de adivinar (eso es defensa en profundidad, no la solución):

```java
// La autorización va en la consulta: no se puede leer lo que no es tuyo
Invoice getInvoice(Long id, AuthContext ctx) {
    return repo.findByIdAndOwnerId(id, ctx.userId())   // o tenantId
        .orElseThrow(NotFoundException::new);          // 404, no revela existencia
}
```
Devolver 404 (no 403) para no confirmar que el recurso existe. Centralizar la decisión en una capa de autorización, no en `if` dispersos.

**Buscar patrones similares (lo esencial de un IDOR).** Un IDOR casi nunca viene solo: refleja una asunción de diseño ("si tienes el ID, puedes verlo") que probablemente se repite. Auditar **todos** los endpoints que reciben identificadores de recurso y verificar que cada uno comprueba propiedad/tenant. Grep dirigido por `findById` sin scoping, revisión de cada controlador. Este barrido suele encontrar varios más.

**Prevención duradera.** Añadir **tests de autorización automatizados** al pipeline: para cada endpoint, casos con un segundo usuario esperando 403/404 sobre recursos ajenos — el mejor seguro contra regresiones. Considerar un patrón arquitectónico que haga el scoping obligatorio (repositorios que exigen el owner en su firma, RLS en la BD). Postmortem: ¿por qué el diseño permitió omitir la verificación?, ¿cómo lo hacemos imposible en vez de improbable?

---

## 5. Encuentran datos sensibles en los logs

**Categoría:** Respuesta a incidentes / Fuga de datos · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Determinar qué datos sensibles (PII, credenciales, tarjetas, tokens) y dónde llegaron (logs locales, plataforma central, SIEM, backups, terceros de logging), contener parando la fuente y purgando/restringiendo donde estén, tratar credenciales expuestas como comprometidas (rotarlas), evaluar obligaciones de notificación, y prevenir con redacción centralizada en la librería de logging y clasificación de datos.

### 📖 Respuesta detallada
**Caracterización.** ¿Qué se está logueando y qué es? No es lo mismo un email (PII, molesto) que un número de tarjeta (PCI, grave), una contraseña o un token de sesión/API (comprometidos por el hecho de estar ahí). ¿Desde cuándo (cuántos meses de logs)? ¿Y hasta dónde se propagó?: logs locales del pod, plataforma central (ELK/Loki), SIEM, backups de logs, y —a menudo el peor— **proveedores externos de logging/APM** (Datadog, Splunk cloud) donde los datos salieron de tu perímetro y pueden estar en múltiples regiones y retenidos largo tiempo.

**Contención.** (1) Parar la fuente: parchear el código que loguea el dato (desplegar el fix es lo que detiene el crecimiento del problema). (2) Purgar o restringir el acceso donde ya está: borrar/redactar índices afectados si la plataforma lo permite, restringir acceso mientras tanto, y gestionar la purga en el proveedor externo (puede requerir soporte). Los backups de logs también cuentan. (3) Si se expusieron **credenciales/tokens**, tratarlos como comprometidos: rotar keys, invalidar sesiones/tokens — la exposición en logs es un vector real de robo (mucha gente tiene acceso de lectura a los logs).

**Investigación de alcance.** ¿Quién tuvo acceso a esos logs durante la ventana? (desarrolladores, soporte, terceros). Cuanta más gente y más externo el destino, mayor el riesgo asumible. Esto alimenta la decisión de notificación: bajo GDPR y regulaciones similares, PII expuesta a partes no autorizadas puede constituir una brecha notificable con plazos concretos; consultar a legal/privacidad con los hechos.

**Prevención (la parte de fondo).** El problema estructural es que la protección dependía de la disciplina de cada desarrollador. Solución sistémica:
- **Redacción centralizada** en la librería de logging común: filtros que enmascaran patrones sensibles (tokens, tarjetas, campos marcados) automáticamente, de modo que ni un log accidental los deje pasar.
- **Tipos que no se serializan**: marcar campos sensibles en los DTOs para que su `toString`/serialización los oculte por defecto (`@ToString.Exclude`, wrappers `SensitiveString`).
- **Clasificación de datos** conocida por el equipo: saber qué es sensible para decidir qué nunca se loguea.
- **Detección continua**: escanear logs (o el pipeline de ingestión) en busca de patrones de datos sensibles y alertar — así el próximo caso se detecta en horas, no por casualidad.
- Minimización: no loguear cuerpos de request/response completos en producción "por si acaso".

**Postmortem.** ¿Por qué se logueó?, ¿por qué no lo detectamos?, ¿la redacción central habría prevenido esta clase entera? Priorizar el control sistémico sobre el parche puntual.

---

## 6. Un tercero reporta que tu endpoint permite SSRF hacia la metadata del cloud

**Categoría:** Respuesta a incidentes / SSRF · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Es potencialmente grave: SSRF hacia metadata puede robar las credenciales del rol de la instancia. Verificar el alcance (¿llega a 169.254.169.254?, ¿IMDSv1 o v2?), asumir robo de credenciales si es explotable, rotar/revocar el rol y auditar qué hizo con CloudTrail, mitigar con IMDSv2 obligatorio + validación de destino + egress control, y revisar todos los endpoints con funcionalidad de fetch de URLs.

### 📖 Respuesta detallada
**Verificación y alcance.** Confirmar el SSRF de forma controlada: ¿el endpoint permite realmente que el servidor haga requests a destinos que elige el atacante?, ¿alcanza el endpoint de metadata (169.254.169.254) u otros servicios internos? Determinante: **¿IMDSv1 o IMDSv2?** IMDSv1 responde a un simple GET, así que un SSRF básico extrae las credenciales del rol; IMDSv2 exige un PUT previo con token y limita hops, lo que rompe el SSRF simple. Este dato define la gravedad.

**Contención inmediata.** Si es explotable hacia metadata con IMDSv1, **asumir que las credenciales del rol de la instancia ya fueron robadas** (un tercero benévolo lo reportó, pero un atacante real pudo llegar antes). (1) Parchear/deshabilitar el endpoint vulnerable o su capacidad de fetch. (2) **Rotar/revocar las credenciales del rol**: en AWS, revocar sesiones activas del rol (política que niega sesiones anteriores a un timestamp) y rotar lo necesario. (3) Forzar **IMDSv2** y hop limit en la instancia/flota de inmediato — mitigación de plataforma que corta la clase de ataque.

**Investigación forense.** Con **CloudTrail**, auditar qué hizo el rol de la instancia durante la ventana de exposición: ¿listó/leyó buckets S3?, ¿accedió a bases de datos?, ¿intentó escalar en IAM?, ¿se usó desde IPs externas? (GuardDuty alerta específicamente sobre credenciales de instancia usadas fuera de la VPC). Esto determina si hubo exfiltración real de datos y qué se vio afectado, alimentando la evaluación de notificación.

**Mitigación completa (defensa en capas).**
- **Plataforma**: IMDSv2 obligatorio en toda la flota; mejor aún, eliminar la necesidad de metadata con roles proyectados (IRSA). Hop limit a 1.
- **Aplicación**: validar el destino de todo fetch — resolver la IP y **rechazar rangos privados, loopback y link-local** (bloquear 169.254.169.254 explícitamente), validar en el momento de conectar (anti DNS-rebinding), deshabilitar/revalidar redirects, permitir solo http/https, y usar allowlist de destinos cuando el caso lo permita.
- **Red**: egress control (NetworkPolicy/proxy de salida) para que el servicio no pueda conectar a destinos internos aunque el código falle.
- No devolver la respuesta cruda al usuario (reduce SSRF completo a blind).

**Cierre.** Revisar **todos** los endpoints con funcionalidad de descarga/fetch de URLs (webhooks, importadores, previews) — el patrón suele repetirse. Agradecer y recompensar el reporte responsable (programa de disclosure). Postmortem: la lección senior es que la defensa más robusta fue de plataforma (IMDSv2/egress), no solo de código — capas.

---

## 7. Un token JWT robado está siendo usado en producción

**Categoría:** Respuesta a incidentes / JWT · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Revocar el token concreto (denylist de su `jti` en el punto de validación), revocar el refresh token asociado e invalidar la sesión, investigar cómo se robó (XSS, log, MITM, dispositivo) y qué hizo la sesión atacante, y decidir si el alcance exige medidas más amplias (rotación de la clave de firma si hay dudas sobre su integridad). Prevenir con tokens de vida corta, cookies HttpOnly y binding de token.

### 📖 Respuesta detallada
**El reto de fondo.** Los JWT son deliberadamente autovalidables (stateless): cualquier servicio verifica la firma sin consultar un estado central, lo que los hace escalables pero **difíciles de revocar** antes de que expiren. La respuesta a un token robado depende de cuánta capacidad de revocación construiste de antemano.

**Contención.**
- **Revocar el token concreto**: si emites tokens con `jti` (identificador único) y el gateway/servicios consultan una **denylist** (en Redis, con TTL igual a la expiración del token), añadir el `jti` robado la corta de inmediato. Es la razón por la que un diseño maduro incluye este mecanismo aunque "rompa" la pureza stateless — para exactamente este caso.
- **Revocar el refresh token asociado** (este sí es stateful): sin él, el atacante no puede renovar; su access token robado morirá pronto si es de vida corta.
- **Invalidar la sesión** del usuario y forzar re-login.
- Si **no** tienes mecanismo de denylist y los tokens son de larga vida, la contención es más drástica: rotar la clave de firma (invalida *todos* los tokens, ver caso de clave comprometida) o esperar la expiración mitigando por otras vías (bloquear al usuario/IP en el gateway). Este dolor es el argumento para tokens cortos.

**Investigación.** Dos frentes: (1) **cómo se robó** — XSS (token en localStorage accesible por JS), fuga en logs, MITM por TLS mal configurado, malware en el dispositivo del usuario, o un intermediario que hizo passthrough del token. El vector cambia la remediación (si fue XSS, hay que arreglar el XSS o seguirán robando tokens). (2) **qué hizo la sesión atacante** — con los logs (correlacionando por el `jti`/sub del token y el trace id), reconstruir las acciones: accesos a datos, cambios, transacciones. Revertir lo fraudulento y dimensionar el impacto.

**¿Escalar el alcance?** Si el robo sugiere un problema sistémico (no un token aislado sino un patrón —muchos tokens robados vía un XSS almacenado o un log expuesto), tratarlo como incidente mayor: invalidar sesiones de todos los usuarios potencialmente afectados. Si hay cualquier duda sobre la integridad de la **clave de firma** (no solo el token), rotarla.

**Prevención.**
- **Access tokens cortos** (5–15 min) + refresh revocable con rotación y detección de reuso (si un refresh ya usado reaparece → toda la cadena se revoca, delatando el robo).
- **`HttpOnly` + `Secure` + `SameSite`** en cookies de sesión: JavaScript no puede leer el token, neutralizando el robo vía XSS.
- **Token binding** (DPoP / mTLS-bound tokens): ligar el token a una clave del cliente para que uno robado no sirva desde otro dispositivo — la defensa más fuerte.
- `jti` + denylist como capacidad de revocación de emergencia. Validación completa de claims (aud/iss/exp) en todos los servicios.

---

## 8. Ataque de credential stuffing en el login

**Categoría:** Respuesta a incidentes / Autenticación · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Confirmar el patrón (alta tasa de fallos de login distribuida desde muchas IPs con credenciales variadas), contener con rate limiting global, desafíos progresivos y bloqueo de fuentes, identificar y proteger las cuentas efectivamente comprometidas (reset forzado, invalidación de sesiones), y prevenir con MFA, detección de contraseñas filtradas y defensas anti-automatización. Priorizar proteger a los usuarios sin bloquear a los legítimos.

### 📖 Respuesta detallada
**Confirmación.** Credential stuffing = probar credenciales robadas de *otras* brechas contra tu login, apostando a la reutilización de contraseñas. Se distingue de la fuerza bruta clásica por su firma: alta tasa de **fallos** de login, distribuida entre **muchas IPs** (proxies residenciales, botnets), con pares usuario/contraseña **variados** (no muchas contraseñas contra una cuenta, sino una credencial distinta por intento), a menudo con user-agents y patrones automatizados. Métrica clave: pico en la tasa global de fallos y aparición de logins exitosos desde orígenes inusuales.

**Contención (sin dañar a usuarios legítimos).** El reto es frenar los bots sin bloquear a clientes reales:
- **Rate limiting global y por credencial**, no solo por IP (inútil contra miles de IPs). Limitar por cuenta objetivo y de forma agregada.
- **Desafíos progresivos**: CAPTCHA/proof-of-work solo ante señales de riesgo (IP de mala reputación, comportamiento automatizado), no a todos los usuarios.
- **Bloqueo por reputación**: ASNs/IPs de datacenters, fingerprints de automatización.
- **Feature de emergencia**: elevar temporalmente los requisitos (verificación por email en logins nuevos, MFA forzado). 
- Evitar el bloqueo de cuenta por fallos como única defensa: el atacante lo convierte en un DoS masivo contra tus usuarios legítimos.

**Proteger a los comprometidos.** El stuffing *tiene* éxito parcial (por eso es rentable). Identificar las cuentas con login exitoso desde el patrón de ataque (IP sospechosa + éxito) y para ellas: forzar reset de contraseña, invalidar todas las sesiones y tokens, notificar al usuario, y revisar si hubo acciones fraudulentas (cambios de email, transacciones) que revertir. Estas cuentas usaban una contraseña reutilizada y filtrada — están efectivamente comprometidas.

**Prevención (fondo).**
- **MFA**: la defensa definitiva contra stuffing — la contraseña correcta no basta. Empujar su adopción, obligatoria para cuentas de alto valor.
- **Comprobar contraseñas filtradas** en registro y cambio (API k-anonymity de HaveIBeenPwned): impedir que los usuarios usen credenciales ya en corpus públicos.
- **Detección de bots** dedicada (device fingerprinting, análisis de comportamiento) integrada en el login.
- No revelar si un usuario existe (mensajes y tiempos uniformes) para no facilitar la validación de listas.
- Monitorización permanente de la tasa de fallos como alerta temprana.

**Postmortem.** ¿Teníamos visibilidad de la tasa de fallos?, ¿MFA habría neutralizado esto? El caso suele acelerar la adopción de MFA y de comprobación de contraseñas filtradas.

---

## 9. Una dependencia de npm resulta comprometida (supply chain)

**Categoría:** Respuesta a incidentes / Supply chain · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Determinar qué versiones comprometidas usas y dónde (SBOM/lockfiles), entender qué hace el código malicioso (típicamente robo de variables de entorno/secretos o inyección en el build), asumir comprometidos todos los secretos accesibles en los entornos que ejecutaron el paquete y rotarlos, revertir a una versión limpia y reconstruir, y prevenir con pinning, cuarentena de versiones nuevas y escaneo de comportamiento.

### 📖 Respuesta detallada
**Caracterización.** Los compromisos de npm siguen patrones conocidos: toma de control de la cuenta de un mantenedor que publica una versión maliciosa, typosquatting, o una dependencia transitiva comprometida. El payload suele: robar variables de entorno y secretos (exfiltrar a un servidor externo), inyectar código en artefactos durante el build, o instalar un backdoor. A menudo se ejecuta en `postinstall`, es decir, **en tu máquina de CI o de desarrollo con solo `npm install`**, antes de que tu aplicación corra.

**Alcance.** Con lockfiles (`package-lock.json`) y SBOM, determinar exactamente qué versiones exactas usas y en qué proyectos/servicios — incluyendo dependencias **transitivas** (rara vez instalas el paquete malicioso directamente; llega dentro de otro). Verificar contra la versión concreta señalada como comprometida en el aviso.

**Contención.** (1) Congelar despliegues de los servicios afectados. (2) Bloquear la versión maliciosa en el proxy de artefactos interno (Nexus/Artifactory) para que ningún build la vuelva a tirar. (3) Si el paquete se ejecutó en CI o en dev, esos entornos deben considerarse contaminados.

**Investigación crítica: ¿qué robó?** Analizar el comportamiento del paquete malicioso (hay análisis públicos rápidos para incidentes conocidos). Si exfiltra secretos/entorno —el caso más común— **asumir comprometidos todos los secretos accesibles en los entornos donde se ejecutó**: variables de CI (credenciales cloud, tokens de registro, keys de firma), y el entorno de runtime si llegó a producción. Esta es la parte que se subestima: el daño no es "una librería mala en el bundle", es "nuestras credenciales de CI están en manos de alguien".

**Erradicación y recuperación.** (1) **Rotar todos los secretos comprometidos** (por eso importa poder rotar rápido): credenciales cloud, tokens, claves de firma. (2) Revertir a la última versión limpia conocida del paquete (pinned) y reconstruir desde un entorno limpio. (3) Buscar indicadores de compromiso en los sistemas que ejecutaron el código (conexiones salientes anómalas, artefactos modificados, persistencia). (4) Si se inyectó en artefactos de build, comparar contra rebuilds limpios y redesplegar.

**Prevención.**
- **Pinning con hashes** (lockfile con integridad) y builds reproducibles.
- **Cuarentena de versiones nuevas**: no adoptar publicaciones de hace minutos/horas; un delay de días evita la mayoría de estos incidentes (se detectan y despublican rápido).
- **`npm ci --ignore-scripts`** donde sea viable, y runners de CI con permisos mínimos y sin acceso a secretos que no necesiten (mínimo privilegio limita el botín).
- **Análisis de comportamiento** de dependencias (Socket.dev: alerta si una librería empieza a hacer red/filesystem/postinstall inesperados).
- Proxy interno con allowlist; reducir el número de dependencias.
- Postmortem: OIDC federado en CI (credenciales efímeras en vez de estáticas) reduce drásticamente el valor de robar el entorno de CI.

---

## 10. Datos de clientes expuestos por un bucket S3 mal configurado

**Categoría:** Respuesta a incidentes / Misconfiguration · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Cerrar el acceso público inmediatamente, determinar qué datos y de cuántos clientes se expusieron y durante cuánto tiempo, investigar con los access logs si alguien no autorizado los descargó, activar el proceso legal de notificación de brecha (GDPR y equivalentes tienen plazos), comunicar a los afectados, y prevenir con guardrails de plataforma que impidan buckets públicos por diseño.

### 📖 Respuesta detallada
**Contención inmediata.** Cerrar el acceso público del bucket ya: activar S3 Block Public Access (a nivel de cuenta si es posible), corregir la ACL/bucket policy. Preservar los **access logs** antes de cualquier cambio que pueda rotarlos — son la evidencia central para saber si hubo acceso real. No borrar ni modificar el bucket más allá de cerrar el acceso (integridad forense).

**Determinar el alcance.** ¿Qué había expuesto? (contenido y clasificación: ¿PII?, ¿documentos de identidad?, ¿datos financieros o de salud?), ¿de cuántos clientes?, ¿desde cuándo estuvo público? (crear el bucket vs. cambio de política — CloudTrail lo data). El alcance temporal y de datos determina la gravedad legal.

**Investigación: ¿se accedió realmente?** Con los **S3 access logs / CloudTrail data events**, buscar accesos desde fuera de tu infraestructura: IPs desconocidas, patrones de listado y descarga masiva (`GetObject` en volumen), user-agents de herramientas de scraping. Distinguir tres escenarios: (a) público pero sin evidencia de acceso externo (mejor caso, aún notificable según jurisdicción); (b) acceso confirmado por terceros (brecha real); (c) los logs no existían o no capturaban lecturas — en cuyo caso, ante la incertidumbre, se suele asumir lo peor para la notificación. Nota: la ausencia de logs de acceso es en sí un hallazgo del postmortem.

**Obligaciones legales y notificación.** Esto es donde el caso trasciende lo técnico. Involucrar a legal/privacidad y al DPO de inmediato: GDPR exige notificar a la autoridad de control en 72 horas desde el conocimiento si hay riesgo para los afectados, y a los individuos si el riesgo es alto; otras jurisdicciones (leyes estatales de EE. UU., etc.) tienen sus propios plazos y umbrales. La decisión de notificar y a quién se toma con hechos (alcance, evidencia de acceso, sensibilidad) y asesoría legal, no unilateralmente por ingeniería.

**Comunicación.** Si procede notificar, hacerlo con transparencia y utilidad: qué pasó, qué datos, qué riesgo concreto para el cliente, qué hacer (cambiar contraseñas si aplica, vigilar fraude), y qué estás haciendo tú. Preparar respuesta a prensa/soporte si el volumen lo amerita. La reputación se daña más por ocultar que por el incidente.

**Prevención (sistémica).** El fallo no es "alguien marcó un bucket público", es "era posible hacerlo". Guardrails de plataforma:
- **S3 Block Public Access a nivel de organización** y **SCPs** que impidan crear buckets públicos, aunque un usuario/servicio lo intente — control preventivo, no detectivo.
- **CSPM** (AWS Config, Prowler) que detecta y alerta/remedia cualquier bucket público en minutos.
- Cifrado por defecto, y para datos muy sensibles, cifrado por campo/tokenización para que "público" no signifique "legible".
- IaC revisado (Checkov bloquea el bucket público en el PR).
- Postmortem: revisar TODOS los buckets y almacenes por el mismo patrón; los datos sensibles no deberían estar accesibles por una sola línea de configuración.

---

## 11. Certificado TLS expirado en producción

**Categoría:** Respuesta a incidentes / Disponibilidad · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Es un incidente de disponibilidad, no de compromiso: restaurar el servicio renovando/desplegando el certificado por el camino más rápido y seguro (nunca deshabilitando la validación), verificar toda la cadena y los servicios dependientes, y —lo importante— prevenir la recurrencia con emisión y renovación automatizadas (ACME/cert-manager) y monitorización de expiración con alertas tempranas.

### 📖 Respuesta detallada
**Naturaleza del incidente.** Un certificado expirado rompe el TLS: los clientes rechazan la conexión (navegadores muestran error, clientes API fallan la validación). Es una **caída de disponibilidad autoinfligida**, no una brecha de seguridad — pero con impacto de negocio directo e inmediato. La tentación peligrosa a resistir: "arreglarlo rápido" deshabilitando la verificación de certificados en los clientes. Eso convierte un problema de disponibilidad en uno de seguridad (MITM) y esos parches "temporales" sobreviven años. Nunca.

**Restauración.** (1) Emitir/renovar el certificado por el canal habitual (idealmente ya automatizado; si el proceso es manual, ejecutarlo con urgencia). (2) Desplegarlo donde termina el TLS: load balancer, ingress, gateway, o el servicio. (3) Verificar la **cadena completa** (no solo el leaf: intermediates correctos — una cadena incompleta es otra causa común de fallo) con herramientas de validación (openssl, SSL Labs). (4) Recargar/reiniciar lo necesario para que tome el certificado nuevo. (5) Confirmar desde el exterior que el servicio responde correctamente.

**Alcance completo.** ¿Solo era el certificado público norte-sur, o también certificados internos (mTLS entre servicios, certificados de cliente, certificados de firma)? Los certificados internos expirados causan fallos en cascada más difíciles de diagnosticar. Verificar servicios dependientes: clientes que cachearon el certificado, integraciones de terceros que lo tenían fijado (pinning), colas y conexiones de larga vida que no renegocian.

**Prevención (el verdadero valor del caso).** Un certificado expirado en producción es, en 2026, un fallo de proceso evitable por completo:
- **Automatización de emisión y renovación**: ACME/Let's Encrypt con cert-manager en Kubernetes, o el gestor de certificados del cloud (ACM), que renuevan sin intervención humana. La automatización es un control: elimina la clase entera de incidentes. Los certificados que no se pueden automatizar (algunos internos, pinning con terceros) son los que hay que vigilar de cerca.
- **Monitorización de expiración con alertas escalonadas**: alertar a 30, 14 y 7 días de la expiración de *todos* los certificados (públicos e internos), con un dueño claro. La alerta debe llegar a alguien que actúe, no a un buzón.
- **Inventario de certificados**: no puedes vigilar lo que no conoces; descubrimiento continuo de certificados en uso.
- **Certificados de vida corta por diseño** (como hace el mTLS de un mesh: horas): fuerzan la automatización y hacen impensable la expiración manual.

**Postmortem.** ¿Por qué no había alerta o por qué se ignoró?, ¿por qué la renovación era manual?, ¿cuántos otros certificados están en la misma situación? La acción de fondo casi siempre es "automatizar y monitorizar todo el inventario", no "poner un recordatorio en el calendario".

---

## 12. Diseñar un programa de seguridad para un equipo que no tiene ninguno

**Categoría:** Estrategia / Programa de seguridad · **Tipo:** [CASO] Análisis de problema

### 📝 Respuesta resumen
Empezar por entender el riesgo (inventario de activos y datos, threat modeling ligero) para priorizar, no intentar todo a la vez. Construir por capas de mayor retorno: quick wins de higiene (gestión de secretos, MFA, parcheo, backups), automatización en el pipeline (SCA, SAST, secret scanning, IaC scanning), luego DAST/pentest y un proceso de respuesta a incidentes, y sostenerlo con cultura (security champions, formación) y métricas. Pragmatismo sobre perfeccionismo.

### 📖 Respuesta detallada
**Principio rector.** No se puede "hacer toda la seguridad" de golpe, y un programa que intenta todo fracasa por sobrecarga. La estrategia senior es **basada en riesgo y en retorno**: entender qué proteges, priorizar lo que más reduce el riesgo por unidad de esfuerzo, automatizar para que escale, y construir cultura para que perdure. Encontrarás el equipo asustado o indiferente; el objetivo es progreso sostenible, no un checklist perfecto que nadie mantiene.

**Fase 0 — Entender el riesgo (semanas 1-2).** No puedes proteger lo que no conoces:
- **Inventario de activos y datos**: qué servicios existen, qué datos manejan y su clasificación (dónde está la PII, dónde el dinero), qué está expuesto a internet. Esto dirige todo lo demás.
- **Threat modeling ligero** de los sistemas críticos: las cuatro preguntas (qué construimos, qué puede salir mal, qué hacemos, lo hicimos bien). No hace falta STRIDE formal para empezar; sí identificar los riesgos top.
- Evaluación rápida del estado actual contra un marco (OWASP SAMM, o simplemente el Top 10) para saber dónde estás.

**Fase 1 — Higiene y quick wins (mes 1-2).** Alto impacto, esfuerzo moderado:
- **Gestión de secretos**: sacar secretos de repos (secret scanning + rotación), secret manager.
- **MFA** en todo acceso a sistemas críticos (cloud, repos, producción) — enorme reducción de riesgo de takeover.
- **Gestión de parches/dependencias**: Dependabot/Renovate activado.
- **Backups verificados** y probados (defensa contra ransomware y errores).
- **Mínimo privilegio básico**: revisar accesos cloud e IAM excesivos.
- **Logging y alertas** mínimas para poder detectar y responder.

**Fase 2 — Seguridad en el pipeline / shift left (mes 2-4).** Automatizar para que escale sin un ejército de seguridad:
- **SCA, SAST, secret scanning, IaC scanning** integrados en CI, empezando con reglas de alta señal para no generar fatiga.
- Gates que impidan *introducir* problemas nuevos de alta severidad.
- Golden paths: plantillas y librerías con la opción segura por defecto (el camino fácil = el camino seguro).

**Fase 3 — Validación y respuesta (mes 4-6).**
- **DAST y un pentest** de los sistemas críticos (la vista del atacante; validación externa).
- **Proceso de respuesta a incidentes**: runbooks, roles, un canal, y un tabletop para ensayarlo antes de necesitarlo de verdad.
- **Gestión de vulnerabilidades** con SLAs por severidad y ownership.

**Fase 4 — Cultura y sostenibilidad (continuo).** La seguridad no escala como función centralizada que dice "no":
- **Security champions**: un desarrollador por equipo con formación extra que difunde prácticas y es el puente con seguridad — multiplica el alcance sin contratar decenas de expertos.
- **Formación** práctica y contextual (no compliance aburrido): las clases de vulnerabilidad reales del equipo.
- **Threat modeling** incorporado al diseño de features sensibles.
- **Métricas** que hagan el riesgo visible (cobertura de escáneres, MTTR, cumplimiento de SLA, adopción de MFA) y muestren progreso a la dirección para sostener la inversión.

**Cierre.** Presentarlo como roadmap por fases con hitos, no como un big bang. Conseguir un sponsor ejecutivo (la seguridad sin apoyo de dirección muere en la priorización). Y medir: empezar por reducir el riesgo top identificado en la Fase 0 y demostrarlo con datos. El mejor programa es el que el equipo realmente adopta y mantiene, no el más completo sobre el papel.
