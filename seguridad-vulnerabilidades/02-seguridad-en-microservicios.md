# Seguridad en Microservicios

> Seguridad de arquitecturas distribuidas: identidad entre servicios, enforcement, aislamiento y pipelines. Enfoque defensivo para entrevistas senior backend.

---

## 1. ¿Qué significa Zero Trust aplicado a la comunicación entre microservicios?

**Categoría:** Arquitectura / Zero Trust · **Tipo:** Conceptual

### 📝 Respuesta resumen
Zero Trust elimina la asunción de que "la red interna es confiable": ningún servicio confía en otro solo por estar en la misma VPC o cluster. Cada request entre servicios se autentica (identidad criptográfica del llamante), se autoriza (¿este servicio puede invocar esta operación?) y se cifra, independientemente de la ubicación de red. El perímetro deja de ser la defensa principal; la identidad y la política por request lo sustituyen.

### 📖 Respuesta detallada
**El problema que resuelve.** El modelo tradicional de "castillo y foso" (firewall fuerte fuera, confianza total dentro) falla en cuanto un atacante cruza el perímetro: un solo pod comprometido vía RCE o una dependencia maliciosa obtiene acceso lateral a todo — bases de datos sin autenticación "porque son internas", APIs administrativas abiertas, tráfico en claro esnifable. En microservicios el problema se multiplica: decenas de servicios, cientos de rutas de comunicación, infraestructura efímera y compartida (nodos multi-tenant), y superficies de entrada múltiples (colas, webhooks, jobs).

**Principios concretos.**
1. **Identidad por workload, no por red**: cada servicio tiene una identidad verificable criptográficamente (certificado SPIFFE/mTLS, token de workload identity), no "la IP 10.x". Las IPs son efímeras y falsificables dentro de un cluster; la identidad criptográfica no.
2. **Autenticar y autorizar cada request**: no basta "quién eres", sino "¿puedes hacer *esto*?": el servicio de pagos acepta llamadas del checkout, pero solo al endpoint de cobro, no al de reembolsos masivos.
3. **Cifrado en todas partes**: TLS/mTLS también en tráfico este-oeste; la red se asume hostil (alguien puede estar escuchando en el nodo, el CNI o un middlebox).
4. **Mínimo privilegio y segmentación**: NetworkPolicies y políticas de servicio que reflejan el grafo real de dependencias; todo lo no declarado, denegado.
5. **Observabilidad como control**: si toda llamada lleva identidad, el tráfico anómalo (el servicio de informes llamando a la API de usuarios) se vuelve detectable y alertable.

**Cómo implementarlo pragmáticamente.** No es un big bang: (1) empezar con mTLS transparente vía service mesh o librerías comunes (identidad + cifrado sin tocar código de negocio); (2) modo "audit" primero: registrar qué hablaría con qué antes de imponer políticas, para descubrir el grafo real; (3) imponer políticas de autorización empezando por los servicios de mayor valor (datos personales, pagos); (4) eliminar los "bypasses históricos" (bases de datos con contraseña compartida, endpoints internos sin auth) de forma incremental.

**Cómo detectar su ausencia/fallos.** Preguntas de auditoría: si despliego un pod arbitrario en el cluster, ¿qué alcanzo sin credenciales? (test de penetración interno "assumed breach"); ¿el tráfico entre servicios va cifrado?; ¿los logs permiten decir qué servicio hizo cada llamada?

**Qué hacer si ya ocurrió** (movimiento lateral confirmado desde un servicio comprometido): contener el workload (aislamiento de red), mapear con los logs de identidad qué alcanzó realmente (aquí Zero Trust paga: sin identidad por llamada, este análisis es casi imposible), rotar credenciales alcanzables, y usar el incidente para priorizar el cierre de las rutas de confianza implícita que el atacante usó. El postmortem típico revela que el daño fue proporcional a la confianza implícita existente.

---

## 2. mTLS y service mesh: ¿qué aportan y qué problemas no resuelven?

**Categoría:** Comunicación segura / Service mesh · **Tipo:** Conceptual

### 📝 Respuesta resumen
mTLS autentica a *ambos* extremos de la conexión con certificados y cifra el canal: cada servicio prueba su identidad criptográficamente. Un service mesh (Istio, Linkerd) lo automatiza a escala: emisión y rotación de certificados por workload, mTLS transparente vía sidecar/nodo, y políticas de autorización basadas en identidad. No resuelve: autorización a nivel de negocio, identidad del usuario final, vulnerabilidades del propio servicio, ni la seguridad de los datos en reposo.

### 📖 Respuesta detallada
**mTLS conceptualmente.** En TLS estándar solo el servidor presenta certificado; el cliente es anónimo a nivel de transporte. En mTLS ambos presentan certificados verificados contra una CA de confianza: el servidor sabe criptográficamente qué cliente le habla. Entre microservicios esto da tres propiedades: **autenticación mutua** (nadie se hace pasar por el servicio de pagos con solo estar en la red), **cifrado** del canal y **integridad** del tráfico. El reto operacional histórico era la gestión de certificados: emitir, distribuir, rotar y revocar certificados por cada instancia efímera es inviable manualmente.

**Qué automatiza el mesh.** (1) Una CA interna (o integrada con la corporativa) emite certificados de vida corta (horas) por workload, con identidad SPIFFE (`spiffe://cluster/ns/pagos/sa/pagos-api`) ligada a la service account — la rotación frecuente convierte el robo de un certificado en un problema acotado; (2) sidecars (o modo ambient/nodo) interceptan el tráfico y aplican mTLS sin cambiar el código de las aplicaciones; (3) **AuthorizationPolicies** declarativas sobre esas identidades:

```yaml
# Istio: solo el checkout puede invocar POST /charge en pagos
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: pagos-authz
  namespace: pagos
spec:
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/checkout/sa/checkout-api"]
      to:
        - operation:
            methods: ["POST"]
            paths: ["/charge"]
```
(4) Telemetría uniforme: quién habla con quién, con qué resultado — base para detección de anomalías.

**Qué NO resuelve (respuesta que distingue a un senior).**
- **Autorización de negocio**: el mesh sabe que "checkout llama a pagos", no si *este usuario* puede reembolsar *esta orden*. Eso sigue siendo lógica de aplicación.
- **Identidad del usuario final**: mTLS autentica servicios; la identidad del usuario debe propagarse aparte (JWT, token exchange).
- **Compromiso del propio servicio**: si el checkout es comprometido, el atacante hereda su identidad mTLS y sus permisos legítimos; por eso las políticas deben ser de mínimo privilegio.
- Vulnerabilidades de aplicación (inyección, IDOR), datos en reposo, y seguridad del plano de control del propio mesh (que se convierte en componente crítico a proteger: quien controla la CA del mesh controla todas las identidades).
- Coste operacional: el mesh es infraestructura compleja; para pocos servicios, mTLS gestionado con librerías o el LB interno puede ser más razonable.

**Detección y respuesta.** Monitorizar: fallos de handshake mTLS (¿algo sin certificado válido intentando conectar?), tráfico denegado por políticas (intentos de acceso fuera del grafo esperado), y la salud de la CA. Si se sospecha compromiso de la CA del mesh: rotar la CA raíz (los meshes soportan rotación con solapamiento), reemitir todas las identidades y auditar conexiones aceptadas durante la ventana. Si un workload comprometido abusó de su identidad: las políticas y la telemetría del mesh son precisamente la herramienta para acotar qué pudo alcanzar.

---

## 3. Autenticación servicio-a-servicio: client credentials, workload identity y sus trade-offs

**Categoría:** Autenticación M2M · **Tipo:** Conceptual

### 📝 Respuesta resumen
Para llamadas máquina-a-máquina hay tres patrones principales: client credentials de OAuth2 (cada servicio tiene client_id/secret y obtiene access tokens del IdP), workload identity (la plataforma atestigua la identidad del workload y emite credenciales de corta duración sin secretos estáticos: IRSA, GKE WI, SPIFFE) y mTLS puro. La dirección correcta es eliminar secretos estáticos: la plataforma prueba quién es el workload y las credenciales duran minutos.

### 📖 Respuesta detallada
**Client credentials (OAuth2).** El servicio A se autentica ante el authorization server con sus credenciales de cliente y recibe un access token (JWT con `sub` = servicio, scopes = permisos) que presenta al servicio B; B valida firma, emisor, audiencia y scopes. Ventajas: estándar, granularidad por scopes, tokens auditables y de corta vida, funciona entre clusters y proveedores. Debilidad clave: **sigue existiendo un secreto estático** (el client secret) que hay que almacenar, distribuir y rotar — vuelve el problema de gestión de secretos que queríamos evitar.

**Workload identity (el patrón moderno).** La plataforma de ejecución *atestigua* la identidad: el workload no guarda ningún secreto; demuestra "soy el pod X con la service account Y" mediante mecanismos de la plataforma, y con eso obtiene credenciales de corta duración:
- **IRSA / EKS Pod Identity (AWS)**: el pod recibe un token OIDC de su service account proyectado por Kubernetes; STS lo cambia por credenciales IAM temporales. Cero keys estáticas de AWS.
- **GKE Workload Identity / Azure Workload Identity**: mismo modelo.
- **SPIFFE/SPIRE**: estándar agnóstico; SPIRE verifica atributos del workload (nodo, namespace, service account, hash de imagen) y emite un SVID (certificado X.509 o JWT) de vida corta.
- **CI federado**: GitHub Actions/GitLab obtienen tokens OIDC que cloud IAM acepta por federación: se acabaron las cloud keys guardadas en secretos de CI, históricamente uno de los botines más golosos.

```yaml
# EKS + IRSA: la service account se anota con el rol; el SDK de AWS
# obtiene credenciales temporales automáticamente. Ningún secreto que rotar.
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pagos-api
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/pagos-api-role
```

**Cómo elegir (respuesta senior).** Dentro de una plataforma con soporte nativo: workload identity siempre que se pueda — elimina la clase entera de incidentes "secreto filtrado". Entre organizaciones o hacia SaaS externos: client credentials (o mejor, federación OIDC si el tercero la soporta), con secretos en un secret manager y rotación automatizada. mTLS/SPIFFE brilla para identidad uniforme dentro del mesh; los JWT viajan mejor a través de gateways y fronteras. En la práctica se combinan: mTLS para el canal, token para la autorización fina.

**Errores comunes.** Compartir una credencial entre varios servicios (imposible atribuir ni rotar sin romper todo); tokens de servicio con scopes universales; validar solo la firma del token y no la audiencia (un token para el servicio B reutilizado contra C); credenciales de larga duración en variables de entorno.

**Detección y respuesta.** Alertar sobre uso de credenciales de servicio desde orígenes inesperados (IPs externas, otros namespaces) y sobre patrones de llamada anómalos. Si se compromete una credencial de servicio: revocarla/rotarla, auditar todo lo que esa identidad hizo en la ventana (por eso una identidad por servicio es crítica: la atribución es inmediata), y revisar los permisos que tenía para dimensionar el impacto — con credenciales de minutos y scopes mínimos, la ventana y el radio de daño se reducen drásticamente.

---

## 4. Propagación de la identidad del usuario entre servicios: JWT passthrough vs token exchange

**Categoría:** Identidad distribuida · **Tipo:** Conceptual

### 📝 Respuesta resumen
Cuando la request del usuario atraviesa varios servicios, cada uno necesita saber en nombre de quién actúa. JWT passthrough (reenviar el token original del usuario) es simple pero viola mínimo privilegio: todo servicio intermedio posee un token con todos los permisos del usuario, válido contra cualquier servicio. Token exchange (RFC 8693) canjea el token por otro de audiencia y scopes reducidos por salto. La alternativa pragmática: token del usuario validado en el edge + identidad de servicio mTLS + contexto de usuario firmado.

### 📖 Respuesta detallada
**El problema.** El usuario llama a la API de pedidos; pedidos llama a inventario y a pagos. Si pagos autoriza "reembolso de la orden 123", necesita la identidad del usuario final, no solo saber que "pedidos" le llama. Propagar mal esta identidad crea dos riesgos opuestos: servicios interiores que confían ciegamente en una cabecera `X-User-Id` falsificable (cualquier workload interno puede suplantarla), o tokens todopoderosos circulando por media plataforma.

**Opción A: JWT passthrough.** Cada servicio reenvía el access token del usuario aguas abajo. Pros: simple, cada servicio valida firma y claims de forma autónoma. Contras serios: (1) **confused deputy / exceso de alcance**: inventario recibe un token que también sirve contra pagos y perfil — si inventario es comprometido, el atacante puede impersonar a cada usuario que pase por ahí contra toda la plataforma; (2) la audiencia se vuelve genérica (`aud: api`), debilitando la validación; (3) la expiración del token del usuario no encaja con flujos asíncronos largos; (4) el token acaba en logs y colas.

**Opción B: Token exchange (RFC 8693).** El servicio intermedio presenta el token recibido al IdP y obtiene uno nuevo: mismo `sub` (el usuario), pero `aud` = el siguiente servicio y scopes mínimos para esa operación, además de registrar la cadena de delegación (`act` claim: "pedidos actuando por el usuario"). Un token robado en inventario solo sirve contra inventario. Coste: latencia y dependencia del IdP por salto (mitigable con caché), y complejidad de configuración por cada relación.

**Opción C (patrón muy común en la práctica).** Autenticar el token del usuario **una vez en el edge/gateway**; dentro del perímetro, el canal se autentica con **identidad de servicio (mTLS)** y la identidad del usuario viaja como un **contexto firmado por el gateway o el propio emisor** (un JWT interno de vida muy corta, audiencia interna, con user id, roles y tenant). Los servicios verifican la firma del contexto (no confían en cabeceras planas) y la identidad mTLS del llamante. Equilibra seguridad y operación sin un exchange por salto.

**Reglas transversales.**
- Nunca confiar en cabeceras de identidad sin firma; siempre material verificable criptográficamente.
- Cada servicio re-valida: firma, expiración, audiencia, y aplica su propia autorización (zero trust: el gateway no es el único guardián).
- Para trabajos asíncronos (colas): no persistir el token del usuario en el mensaje; guardar la identidad como dato firmado y re-derivar permisos al procesar, o usar tokens de delegación específicos de larga vida controlada.
- Trazar la cadena: logs con user id + servicio llamante + trace id permiten reconstruir "quién hizo qué a través de qué".

**Qué hacer si ya ocurrió** (token de usuario robado desde un servicio intermedio comprometido): con passthrough, hay que asumir impersonación posible contra toda la plataforma → invalidar sesiones de los usuarios que atravesaron el servicio en la ventana, revisar acciones de esas identidades en todos los servicios. Con exchange/audiencias estrechas, el análisis se acota al servicio de la audiencia — exactamente la razón de diseñar así.

---

## 5. API Gateway como punto de enforcement: qué centralizar y qué no

**Categoría:** Arquitectura / Gateway · **Tipo:** Conceptual

### 📝 Respuesta resumen
El gateway es el punto natural para políticas transversales de borde: terminación TLS, autenticación de tokens, rate limiting, validación gruesa de requests, cabeceras de seguridad, y bloqueo de tráfico abusivo. Lo que no debe centralizar: la autorización de negocio fina (propiedad de recursos) ni ser la única línea de defensa — los servicios internos deben seguir validando (defensa en profundidad), porque el tráfico que no pasa por el gateway (interno, colas, jobs) existe siempre.

### 📖 Respuesta detallada
**Qué centralizar en el gateway (y por qué).**
1. **Autenticación de borde**: validar el JWT/sesión (firma, expiración, emisor, audiencia) y rechazar tráfico anónimo antes de que toque servicios internos. Beneficio: una implementación correcta y auditada en vez de N copias divergentes.
2. **Rate limiting y protección anti-abuso**: límites por API key/usuario/IP, protección de endpoints sensibles (login, búsqueda), circuit breaking hacia atrás. El borde es el único lugar con visión del tráfico agregado.
3. **Políticas de transporte**: TLS moderno, HSTS, cabeceras de seguridad, tamaños máximos de request, timeouts.
4. **Validación gruesa**: esquema del contrato público (OpenAPI enforcement), tipos de contenido permitidos, rechazo de rutas no publicadas — reduce la superficie que llega a los servicios.
5. **Gestión de exposición**: el gateway define QUÉ es público; todo lo demás es inaccesible desde fuera por diseño de red. Un servicio nuevo no es alcanzable desde internet por accidente.
6. **Observabilidad de borde**: log estructurado por request con identidad, origen y resultado — la primera fuente en cualquier investigación.

**Qué NO centralizar (los errores clásicos).**
- **Autorización de negocio fina**: "¿puede este usuario ver esta orden?" requiere contexto de dominio (propiedad, estado, tenant) que el gateway no tiene ni debe tener; intentarlo crea un acoplamiento monstruoso. El gateway hace autenticación y autorización gruesa (¿scope válido para esta ruta?); el servicio hace la fina.
- **El antipatrón "perímetro nuevo"**: si los servicios internos aceptan cualquier request "porque ya lo validó el gateway", se ha reconstruido el castillo y foso un nivel más adentro. Todo tráfico interno directo (servicio a servicio, un pod comprometido, un desarrollador con port-forward) se salta el gateway. Regla: **el gateway filtra, los servicios verifican**. Los servicios exigen identidad (mTLS/token interno) y validan la del usuario.
- Lógica de negocio en general (transformaciones complejas, orquestación): el gateway engorda hasta ser un monolito frágil y un cuello de botella de despliegue.

**Endurecimiento del propio gateway.** Es un componente crítico e internet-facing: mantenerlo parcheado (los CVEs de gateways/proxies populares se explotan rápido), configuración como código revisada, mínimo privilegio hacia el backend, y protección de su plano de administración (nunca expuesto a internet, autenticación fuerte). Cuidado con inconsistencias de parsing entre gateway y backends (request smuggling): normalizar y usar HTTP/2 end-to-end o configuraciones estrictas.

**Detección y respuesta.** El gateway es el mejor sensor: picos de 401/403/429, patrones de scraping, user agents anómalos, rutas inexistentes (escaneo). Ante un ataque activo (scraping masivo, stuffing): activar reglas de bloqueo temporales en el borde (por ASN, fingerprint, patrón), bajar límites de rate, y en paralelo investigar sin degradar el servicio a usuarios legítimos. Si un atacante logró alcanzar servicios internos saltándose el gateway, el postmortem debe responder por qué la red lo permitió y por qué el servicio interno no exigió identidad.

---

## 6. Rate limiting y protección contra abuso en APIs distribuidas

**Categoría:** Anti-abuso · **Tipo:** Conceptual

### 📝 Respuesta resumen
El rate limiting protege contra fuerza bruta, scraping, DoS de aplicación y control de costes. Diseño serio: límites por múltiples dimensiones (identidad, IP, endpoint, global), algoritmos tipo token bucket / sliding window con estado compartido (Redis) o límites locales aproximados, respuestas 429 con `Retry-After`, y diferenciación entre límites de protección (seguridad) y de negocio (cuotas). El abuso sofisticado requiere además detección de comportamiento, no solo contadores.

### 📖 Respuesta detallada
**Amenazas que mitiga.** Fuerza bruta y credential stuffing en login, enumeración (de usuarios, de IDs, de cupones), scraping masivo de datos, DoS de capa 7 (endpoints caros: búsquedas, exports, generación de PDFs), amplificación de costes en servicios pay-per-use, y abuso de lógica (reenvío masivo de SMS/emails que cuesta dinero y reputación).

**Diseño por capas y dimensiones.**
- **Dimensiones**: por usuario/API key (la principal: identidad estable), por IP (para tráfico anónimo, con cuidado: NATs corporativos comparten IP y los atacantes rotan IPs con proxies residenciales), por endpoint (el login y el reset de contraseña tienen límites propios y estrictos), por tenant, y global (protección de capacidad).
- **Algoritmos**: *token bucket* (permite ráfagas controladas, suave para UX) o *sliding window* (más preciso contra picos en el borde de ventana). El contador vive en un almacén compartido (Redis) para coherencia entre réplicas; si Redis cae, decidir explícitamente fail-open (disponibilidad) vs fail-closed (endpoints de seguridad como login deberían fail-closed o degradar a límites locales).
- **Dónde**: primera línea en el edge/CDN (absorbe volumen barato), segunda en el gateway (por identidad), y límites específicos en servicios críticos (defensa en profundidad: el tráfico interno también puede abusar).

```yaml
# Envoy/gateway: límite estricto y específico para login
rate_limits:
  - actions:
      - request_headers: { header_name: "x-real-ip", descriptor_key: "ip" }
    # p.ej. 5/min por IP en /auth/login, 429 + Retry-After
```

**Más allá de contadores (abuso sofisticado).** Los ataques distribuidos (miles de IPs, cada una bajo el límite) requieren: señales de comportamiento (velocidad de navegación imposible, secuencias idénticas, fingerprint de cliente), desafíos progresivos (CAPTCHA/proof-of-work solo ante riesgo, no a todos), reputación de IP/ASN, y para credential stuffing, detección por tasa global de fallos de login más que por IP individual. Importante para UX y seguridad: responder 429 con `Retry-After`, documentar límites para integradores legítimos, y no filtrar en el mensaje qué límite exacto se golpeó (información útil para calibrar el ataque).

**Errores comunes.** Limitar solo por IP (inútil contra botnets, dañino para NATs); límites solo en el gateway con servicios internos ilimitados; contadores en memoria local con 20 réplicas (límite real = 20× el configurado); no limitar endpoints no autenticados "porque no tienen identidad" (justo los más abusables); y olvidar los costes asimétricos (una request barata para el cliente pero cara para ti — regex catastróficos, queries sin paginar — merece límites por coste, no por cantidad).

**Qué hacer si ya ocurrió** (abuso en curso que superó los límites): (1) contención en el borde: reglas temporales por patrón (ASN, fingerprint, cabeceras), endurecer límites del endpoint atacado; (2) si es stuffing: ver el caso dedicado — proteger a los usuarios es prioritario; (3) medir el impacto (¿qué datos se scrapearon?, ¿qué costes se generaron?); (4) postmortem: ¿qué dimensión de límite faltó?, ¿por qué la detección tardó? — y convertir la regla temporal en control permanente si procede.

---

## 7. Validación de entrada en cada servicio: ¿por qué no basta validar en el borde?

**Categoría:** Defensa en profundidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Cada servicio debe validar su propia entrada porque no controla a todos sus llamantes: el tráfico llega también desde otros servicios (potencialmente comprometidos o con bugs), colas, jobs y herramientas internas, no solo desde el gateway. La validación correcta es por allowlist contra un esquema/contrato explícito (tipos, rangos, formatos, tamaños), en la frontera de deserialización, con contratos versionados (OpenAPI/protobuf) como fuente de verdad.

### 📖 Respuesta detallada
**Por qué en cada servicio.** El argumento "ya valida el gateway/el frontend" falla por tres vías: (1) **rutas alternativas**: mensajes de cola, llamadas internas directas, backfills, herramientas de soporte — nada de eso pasa por el gateway; (2) **el llamante puede estar comprometido o tener bugs**: si el servicio A es explotado, todo lo que envíe a B es entrada atacante-controlada; un B que confía ciegamente convierte un compromiso puntual en uno en cadena; (3) **la validación del borde es genérica**, no conoce las invariantes del dominio de cada servicio (que un `amount` sea positivo y menor que el saldo solo lo sabe pagos). Es el corolario de zero trust aplicado a los datos: *toda* entrada es no confiable hasta validarse localmente.

**Cómo validar bien.**
- **Allowlist, no blocklist**: definir qué es válido (tipo, rango, longitud, formato, valores enumerados) y rechazar lo demás. Las blocklists de "caracteres peligrosos" siempre se quedan cortas y rompen datos legítimos.
- **En la frontera, con tipos**: validar al deserializar, hacia DTOs/tipos estrictos, de modo que el resto del código maneje datos ya garantizados:

```java
// Bean Validation en el DTO: la request inválida nunca entra al dominio
public record CreateOrderRequest(
    @NotNull @Size(min = 1, max = 100) List<@Valid OrderItem> items,
    @NotNull @Pattern(regexp = "[A-Z]{3}") String currency,
    @NotNull @Positive @DecimalMax("100000") BigDecimal amount
) {}
```
```javascript
// Node: esquema explícito con zod; unknown keys fuera
const CreateOrder = z.object({
  items: z.array(OrderItem).min(1).max(100),
  currency: z.string().length(3).regex(/^[A-Z]+$/),
  amount: z.number().positive().max(100000),
}).strict();
```
- **Contrato como fuente de verdad**: OpenAPI/protobuf versionado del que se genera la validación — evita la deriva entre lo documentado y lo aplicado. En eventos: schema registry con validación en producción y consumo.
- **Validación semántica además de sintáctica**: el `orderId` existe, pertenece al tenant del llamante, está en un estado que permite la operación. (Aquí la validación se encuentra con la autorización.)
- **Límites físicos**: tamaño máximo de payload, profundidad de JSON, número de elementos — protegen contra DoS de parsing (zip bombs, mil niveles de anidamiento, arrays gigantes).
- Los rechazos devuelven errores genéricos al cliente y detalle a logs/métricas.

**Cómo detectar carencias.** Fuzzing de contratos (enviar tipos incorrectos, límites, campos extra a cada endpoint interno), revisar handlers de colas (los grandes olvidados), y monitorizar en producción errores de deserialización tardíos (un `ClassCastException` en capa de dominio delata que algo cruzó sin validar).

**Qué hacer si ya ocurrió** (datos malformados/adversariales cruzaron y causaron daño — corrupción de datos, caída por payload gigante): contener (bloquear el patrón en el borde, pausar el consumer afectado), sanear los datos corruptos identificándolos por la ventana temporal y el patrón, añadir la validación que faltó en el servicio (no solo el parche en el borde), y buscar el mismo gap en los demás consumidores del mismo tipo de mensaje.

---

## 8. Cifrado en tránsito y en reposo en una plataforma de microservicios

**Categoría:** Protección de datos · **Tipo:** Conceptual

### 📝 Respuesta resumen
En tránsito: TLS 1.2+/1.3 en todo tráfico, incluido el este-oeste interno (idealmente mTLS), sin excepciones "porque es interno". En reposo: cifrado de plataforma (discos, buckets, bases de datos con KMS) como base obligatoria, y cifrado a nivel de aplicación/campo para los datos más sensibles, con claves gestionadas en KMS, envelope encryption, rotación y auditoría de uso. El diseño de la gestión de claves importa más que el algoritmo.

### 📖 Respuesta detallada
**En tránsito.**
- **Norte-sur** (cliente↔plataforma): TLS 1.3/1.2 con suites modernas, HSTS, certificados automatizados (ACME/cert-manager) — la automatización es un control de seguridad: elimina los incidentes de certificados expirados y los "apagones de renovación manual".
- **Este-oeste** (servicio↔servicio): también cifrado. La red interna no es confiable (nodos compartidos, CNI, capturas en tránsito); mTLS vía mesh o TLS terminado en la aplicación. Incluir las conexiones a bases de datos, colas y cachés (`sslmode=verify-full` en Postgres: cifra *y* verifica la identidad del servidor; Kafka con TLS+SASL; Redis con TLS).
- Errores comunes: TLS solo hasta el load balancer y HTTP plano detrás; verificación de certificado deshabilitada en clientes internos ("temporalmente"); y olvidar el tráfico de réplicas/backups entre zonas.

**En reposo, en capas.**
1. **Cifrado de plataforma** (base, no negociable, coste casi cero): EBS/discos cifrados, S3 con SSE-KMS, RDS encriptado, etcd de Kubernetes con KMS provider. Protege contra robo físico y contra accesos por debajo de la aplicación (snapshots, discos reciclados). No protege contra un atacante que compromete la aplicación: ella descifra transparentemente.
2. **Cifrado a nivel de aplicación/campo** para lo verdaderamente sensible (datos de salud, tokens de pago, identificadores nacionales): la aplicación cifra el campo antes de persistir, con **envelope encryption** — una data key por registro/lote cifra los datos, y el KMS cifra las data keys con una master key que nunca sale del KMS. Ventajas: el DBA o un dump de la BD no exponen los campos; el acceso a claves queda auditado por el KMS por operación; y la revocación es efectiva (sin acceso al KMS, los datos son ilegibles).
3. **Tokenización** cuando ni siquiera quieres el dato (tarjetas → token del PSP: reduce el alcance PCI drásticamente).

**Gestión de claves (lo que de verdad pregunta un entrevistador).** Claves por servicio/tenant/clasificación (una master key universal = radio de explosión universal); rotación automática (con envelope encryption, rotar la master key no obliga a re-cifrar todos los datos, solo las data keys nuevas la usan); políticas de acceso a claves por identidad de workload (el servicio de informes no puede usar la clave de pagos); y auditoría de cada operación de descifrado — un pico de descifrados es un indicador de exfiltración en curso. Considerar el borrado criptográfico: destruir la clave equivale a borrar los datos (útil para retención y GDPR).

**Qué hacer si ya ocurrió.** Robo de un disco/snapshot/backup cifrado con plataforma y sin la clave: incidente contenido (documentarlo, verificar que la clave no acompañaba al backup). Exposición de datos cifrados por campo + sospecha de acceso a claves: auditar el KMS (quién descifró qué durante la ventana), rotar claves y revocar los accesos comprometidos. Datos sensibles encontrados sin cifrar donde debían estarlo: tratarlo como exposición potencial, cifrar retroactivamente, y revisar la clasificación de datos que permitió el gap.

---

## 9. Multi-tenancy: estrategias de aislamiento de datos y prevención de fugas entre tenants

**Categoría:** Multi-tenancy / Aislamiento · **Tipo:** Conceptual

### 📝 Respuesta resumen
La fuga entre tenants es el incidente más grave de un SaaS B2B. Estrategias de aislamiento, de menor a mayor: filas compartidas con `tenant_id` (barato, frágil: un WHERE olvidado es una brecha), esquema o base de datos por tenant, e infraestructura dedicada. La defensa real es sistémica: el tenant context derivado siempre del token (nunca de parámetros), enforcement automático en la capa de datos (RLS, scoping obligatorio del ORM) y tests continuos de aislamiento cruzado.

### 📖 Respuesta detallada
**Modelos y trade-offs.**
1. **Pool (filas compartidas, columna `tenant_id`)**: máxima eficiencia de costes y operación; máximo riesgo — cada query de cada desarrollador debe filtrar por tenant, para siempre. Una omisión = datos de un cliente servidos a otro.
2. **Esquema/BD por tenant**: aislamiento estructural (la conexión ya está limitada), coste operativo mayor (migraciones × N, límites de conexiones), buen punto medio para B2B con cientos de tenants.
3. **Stack dedicado por tenant** (cluster/cuenta cloud): para clientes enterprise/regulados; el aislamiento lo da la infraestructura.
Los híbridos son la norma: pool para la masa, dedicado para quien lo paga o lo exige. La decisión es de negocio *y* de seguridad: cuantificar qué vale una fuga cruzada.

**Cómo prevenir fugas (independiente del modelo).**
- **El tenant sale del token, jamás del request**: `tenant_id` como claim verificado criptográficamente; cualquier `?tenantId=` en la URL o el body es un IDOR de tenant esperando ocurrir. El contexto se establece en el middleware de autenticación y fluye implícitamente.
- **Enforcement en la capa de datos, no en la disciplina**: que olvidar el filtro sea imposible, no improbable:

```sql
-- Postgres Row-Level Security: la BD aplica el filtro aunque la query lo omita
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- La aplicación fija app.tenant_id por transacción desde el claim del token.
```
  Equivalentes: filtros globales del ORM (Hibernate `@Filter`, scopes obligatorios), repositorios base que exigen tenant en su firma, y linters/tests que fallan ante queries sin scoping.
- **Aislamiento más allá de la BD**: cachés (la clave incluye el tenant — un caché compartido sin tenant en la clave es una fuga clásica), índices de búsqueda, buckets/prefijos de ficheros con políticas por tenant, colas y, con cifrado por tenant (clave KMS por tenant), incluso los backups quedan segregados.
- **Tests de aislamiento continuos**: suite que, con credenciales del tenant A, intenta acceder a recursos conocidos del tenant B por cada endpoint — el equivalente multi-tenant de los tests de autorización. Es de las suites con mejor retorno de toda la plataforma.
- Cuotas por tenant (noisy neighbor es también un problema de disponibilidad/seguridad) y datos de plataforma (logs, métricas, analytics) etiquetados por tenant para poder investigar.

**Cómo detectarlo.** Además de los tests: alertas sobre respuestas con mezcla de tenant ids (validación de invariantes en el edge o en tests de contrato), revisión de código con foco en queries nuevas, y peticiones de soporte del tipo "veo datos que no son míos" tratadas como incidente de seguridad, no como bug funcional.

**Qué hacer si ya ocurrió** (fuga cruzada confirmada): (1) contener: deshabilitar el endpoint/feature; (2) alcance exacto: qué datos de qué tenants vio quién y cuándo (logs con tenant en cada línea lo hacen posible); (3) legal/contractual: los contratos B2B suelen exigir notificación en plazos concretos, además de GDPR si hay datos personales; (4) comunicación transparente a los clientes afectados con hechos y remediación; (5) causa raíz sistémica: no "se olvidó un WHERE" sino "era posible olvidarlo" → implantar RLS/scoping obligatorio y los tests cruzados en todo el parque.

---

## 10. Auditoría y trazabilidad en sistemas distribuidos: diseño de un audit trail confiable

**Categoría:** Auditoría / Observabilidad · **Tipo:** Conceptual

### 📝 Respuesta resumen
Un audit trail responde "quién hizo qué, sobre qué, cuándo, desde dónde y con qué resultado" con calidad de evidencia: completo (todas las acciones sensibles), íntegro (no modificable ni borrable por quien audita), atribuible (identidad real incluso a través de servicios) y correlacionable (trace id de extremo a extremo). Se diseña como flujo de eventos de negocio separado del logging técnico, con almacenamiento inmutable y retención definida por regulación.

### 📖 Respuesta detallada
**Auditoría ≠ logging técnico.** Los logs de aplicación sirven para depurar y pueden rotar a los 30 días; el audit trail es un registro de negocio con posibles requisitos legales (SOX, PCI, HIPAA, ISO 27001) y forenses. Merece su propio diseño: eventos explícitos y estructurados ("el usuario X exportó el informe Y del tenant Z"), no líneas de log parseadas a posteriori.

**Qué registrar.** Autenticación y gestión de sesiones; cambios de permisos y roles (el evento más crítico: es como se detecta la escalada); operaciones CRUD sobre datos sensibles — especialmente lecturas masivas y exportaciones (la exfiltración son lecturas, no escrituras); acciones administrativas y de soporte (impersonación de usuarios por parte de soporte: siempre auditada y visible); cambios de configuración; y consentimientos. Cada evento: timestamp confiable, **identidad real** (si un servicio actúa por un usuario, ambos: `actor`, `on_behalf_of`), tenant, recurso, acción, resultado, origen (IP, servicio), y **trace id** que lo conecta con la petición distribuida completa.

**Trazabilidad distribuida.** El trace id (W3C Trace Context propagado por OpenTelemetry) une el clic del usuario con las 7 llamadas internas que causó. Para auditoría esto es oro: ante "¿quién borró este registro?", la cadena completa gateway → servicio A → servicio B con la misma correlación reconstruye el contexto en minutos. Requisito: la propagación debe cruzar también colas y jobs (el trace context viaja en las cabeceras del mensaje).

**Integridad (lo que lo hace "confiable").** El audit trail debe resistir al atacante con privilegios — precisamente quien más interés tiene en borrarlo:
- **Append-only y fuera del alcance**: los servicios emiten eventos (a un topic/stream dedicado) y no tienen permiso de modificación ni borrado sobre el almacén final.
- **Almacenamiento inmutable**: object lock / WORM en S3, o una cuenta cloud separada de seguridad a la que los eventos se replican y donde ni los admins de producción tienen escritura.
- Opcional para alta exigencia: encadenamiento de hashes o firmado por lotes para evidenciar manipulación.
- Retención por política (p. ej. 1-7 años según regulación) con acceso de lectura restringido y a su vez auditado (quién consulta la auditoría también queda registrado).

**Implementación pragmática.** Una librería/middleware común de auditoría (para uniformidad de esquema), emisión asíncrona con garantía de entrega (outbox pattern si la pérdida de eventos es inaceptable: el evento de auditoría se escribe en la misma transacción que el cambio), y cuidado con PII dentro de la propia auditoría (minimizar, o cifrar campos, porque la retención larga choca con GDPR).

**Qué hacer si ya ocurrió** (incidente que exige investigación): el audit trail es la herramienta, no la víctima — pero primero verificar su integridad (¿huecos temporales?, ¿eventos borrados?). Si el atacante alcanzó a manipular logs locales, la copia inmutable externa es la fuente de verdad. Si durante la investigación se descubre que faltan eventos clave ("no auditamos lecturas"), documentarlo y priorizar su instrumentación: es el hallazgo más común de los postmortems.

---

## 11. Seguridad en pipelines CI/CD: firmado de artefactos, SLSA y protección de la cadena de despliegue

**Categoría:** CI/CD / Supply chain · **Tipo:** Conceptual

### 📝 Respuesta resumen
El pipeline es un sistema con permisos de producción que ejecuta código semi-confiable: hay que tratarlo como infraestructura crítica. Controles clave: runners efímeros con mínimo privilegio, credenciales federadas OIDC en vez de secretos estáticos, protección de ramas y revisión de cambios en workflows, aislamiento de PRs de forks, firmado de artefactos e imágenes (Sigstore/cosign) con provenance verificable (SLSA), y verificación de firmas en el despliegue.

### 📖 Respuesta detallada
**El modelo de amenaza.** Quien controla el pipeline controla lo que llega a producción: puede inyectar código en el artefacto, robar los secretos del build o desplegar directamente. Vectores reales: PRs maliciosos que modifican el workflow o explotan triggers inseguros (`pull_request_target` con checkout del código del fork), dependencias del build comprometidas, secretos de CI robados (históricamente, credenciales cloud estáticas en variables de CI), runners persistentes contaminados, y compromiso de la plataforma de CI misma.

**Controles esenciales.**
1. **Identidad federada, no secretos estáticos**: el job obtiene un token OIDC de la plataforma de CI y cloud IAM lo acepta con condiciones (repo, rama, entorno). Sin keys que robar, credenciales de minutos, y política fina: solo el workflow de release en `main` puede asumir el rol de deploy a producción.
2. **Runners efímeros y mínimos**: cada job en un entorno limpio que se destruye; sin acceso de red innecesario; PRs de forks sin acceso a ningún secreto y con aprobación manual para ejecutar CI.
3. **Gobernanza del pipeline como código**: los workflows viven en el repo con revisión obligatoria; cambios en ficheros de CI requieren aprobación de code owners; acciones/plugins de terceros fijados por SHA (no por tag mutable) y provenientes de una allowlist.
4. **Firmado y provenance (SLSA)**: el pipeline firma el artefacto y genera una atestación de provenance — qué repo, commit, workflow y builder lo produjeron. SLSA define niveles de madurez: desde "hay build script" hasta "build hermético en plataforma endurecida con provenance no falsificable". El objetivo práctico: poder responder criptográficamente "¿este binario en producción salió de nuestro pipeline desde este commit revisado?".

```yaml
# GitHub Actions: firma keyless con cosign (Sigstore) ligada a la identidad OIDC del workflow
- uses: sigstore/cosign-installer@v3
- run: |
    cosign sign --yes $IMAGE@$DIGEST
    # y en el cluster, el admission controller verifica firma + provenance
```
5. **Verificación en despliegue**: de nada sirve firmar si nadie verifica — policy controller en Kubernetes que solo admite imágenes firmadas por el pipeline oficial y referenciadas por digest; despliegues solo desde el sistema de CD (humanos sin `kubectl apply` a producción).
6. **Separación de entornos**: el pipeline de dev no tiene credenciales de prod; promoción de artefactos (el MISMO artefacto probado se promueve, no se reconstruye por entorno).

**Cómo detectar problemas.** Auditar permisos efectivos de los tokens de CI, alertar sobre ejecuciones de workflows modificados fuera de PR, monitorizar el uso de las credenciales de CI en el cloud (¿el rol de deploy usado a las 3 AM desde una IP nueva?), y ejercicios de red team sobre el pipeline.

**Qué hacer si ya ocurrió** (compromiso del pipeline): tratarlo como compromiso de producción potencial. Congelar despliegues; rotar todas las credenciales alcanzables desde CI; identificar la ventana y auditar cada build y despliegue en ella (comparar artefactos contra rebuilds limpios de los commits correspondientes — aquí los builds reproducibles y el provenance valen su peso en oro); reconstruir runners; y redesplegar los artefactos afectados desde el pipeline saneado.

---

## 12. Gestión continua de vulnerabilidades en una plataforma de microservicios: escaneo y SLAs de remediación

**Categoría:** Gestión de vulnerabilidades · **Tipo:** Conceptual

### 📝 Respuesta resumen
Con 40+ servicios, la gestión de vulnerabilidades debe ser un proceso continuo y automatizado, no auditorías anuales: escaneo en múltiples capas (SAST, SCA, imágenes, IaC, DAST, cloud) integrado en el pipeline y sobre lo desplegado, deduplicación y priorización por riesgo real (severidad × explotabilidad × exposición), SLAs de remediación por severidad con ownership claro por equipo, y métricas (MTTR, cumplimiento de SLA, edad del backlog) que hagan el riesgo visible y gestionable.

### 📖 Respuesta detallada
**Las capas de escaneo (cada una ve cosas distintas).**
- **SCA** (dependencias): en cada build y, crucialmente, re-escaneo continuo de lo desplegado — los CVEs nuevos afectan a builds viejos.
- **SAST** (código propio): en PRs, con reglas afinadas — un SAST ruidoso muere por fatiga de findings; empezar con reglas de alta precisión (inyección, crypto, secretos) y crecer.
- **Escaneo de imágenes**: en el registro y en el pipeline (base image + paquetes de sistema, no solo dependencias de aplicación).
- **IaC**: Checkov/tfsec sobre Terraform/Helm antes de aplicar (un bucket público se bloquea en el PR, no se descubre en producción).
- **DAST/pentest**: la vista del atacante sobre lo desplegado; pentest periódico para lógica de negocio que las herramientas no ven.
- **CSPM**: configuración cloud continua contra benchmarks.
- **Detección de secretos**: pre-commit, push protection y escaneo del histórico.

**Del ruido a la acción (el problema real).** Sumadas, estas capas generan miles de findings; sin gestión, se ignoran todos. Claves:
1. **Consolidación y deduplicación** en una plataforma (el mismo CVE en 30 imágenes = un problema con 30 instancias, resuelto una vez en la base image compartida).
2. **Priorización por riesgo contextual**: CVSS × EPSS/KEV × exposición del servicio (internet-facing, datos que maneja) × alcanzabilidad. Un findings de severidad media en el servicio de pagos expuesto puede importar más que un crítico en un batch interno sin red.
3. **Ownership inequívoco**: cada servicio tiene equipo dueño; los findings llegan a SU backlog (integración con Jira/GitHub Issues), no a una lista central que nadie mira. El equipo de seguridad gobierna el proceso y ayuda; no es el dueño de arreglar todo.
4. **Reducción sistémica**: la mejor gestión es generar menos vulnerabilidades — base images compartidas y actualizadas centralmente (un parche arregla 30 servicios), Renovate/Dependabot en todos los repos, y golden paths donde la opción por defecto es la segura.

**SLAs de remediación (ejemplo defendible en entrevista).**
- Crítico con explotación conocida (KEV) o internet-facing: 24–72 h (con mitigación temporal inmediata si el parche no es viable).
- Crítico resto / Alto expuesto: 7–14 días.
- Alto interno / Medio: 30–90 días, en el ciclo normal.
- Excepciones: formales, con dueño, mitigación compensatoria, fecha de caducidad y aprobación por riesgo — nunca silencio.
Gates del pipeline alineados: bloquear solo introducciones *nuevas* de severidad alta/crítica (bloquear todo el backlog de golpe paraliza; el gate evita empeorar mientras el backlog baja).

**Métricas que importan.** MTTR por severidad, % dentro de SLA, edad media del backlog, tendencia (¿entra más de lo que sale?), cobertura (¿qué % de repos/servicios tiene todos los escáneres?). Reportadas por equipo y visibles: el riesgo compartido y comparado se gestiona; el invisible, no.

**Qué hacer si ya ocurrió** (se explotó una vulnerabilidad que llevaba meses en el backlog dentro de "aceptado"): además de la respuesta al incidente en sí, el postmortem debe examinar el proceso: ¿la priorización infraestimó la exposición?, ¿la excepción caducó sin revisión?, ¿el SLA era papel mojado sin enforcement? Ajustar el modelo de priorización con el caso real y revisar todas las excepciones vigentes con los mismos criterios.
