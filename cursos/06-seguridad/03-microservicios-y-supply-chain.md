# Módulo 3 · Seguridad en microservicios y cadena de suministro

> **Curso 06 · Seguridad** · 150 min

## Por qué esto importa en la entrevista

Porque en una arquitectura distribuida la superficie de ataque deja de ser "mi aplicación" y pasa a ser **la red interna, los secretos, las dependencias y el pipeline**. Los incidentes más graves de los últimos años (SolarWinds, Codecov, paquetes npm comprometidos, xz) no explotaron una vulnerabilidad de código: explotaron la cadena de suministro.

## Zero trust dentro del clúster

El modelo antiguo —"dentro de la red somos de confianza"— falla en cuanto un pod se compromete. Zero trust en la práctica:

1. **Identidad para cada carga de trabajo** (SPIFFE/SPIRE, o la identidad nativa del clúster), no una IP.
2. **mTLS entre servicios**, idealmente automático vía service mesh: cifra y autentica ambos extremos, con rotación de certificados corta.
3. **Autorización servicio a servicio explícita:** "solo `checkout` puede llamar a `POST /charge` de `pagos`". En Istio, `AuthorizationPolicy`; sin mesh, tokens con scope.
4. **NetworkPolicy de denegación por defecto** en el namespace, con permisos explícitos. Es la medida más rentable del clúster y casi nadie la aplica.
5. **Segmentación:** producción separada de desarrollo a nivel de cuenta/proyecto, no de etiqueta.

## Secretos

Reglas, en orden:

1. **Nada de secretos en el repositorio.** Detección en CI (gitleaks, trufflehog) **y** en pre-commit. Y recuerda: un secreto que estuvo en un commit **está comprometido para siempre** aunque reescribas la historia — hay que rotarlo.
2. **Gestor de secretos** (Vault, Secrets Manager, Key Vault, Secret Manager) con acceso por identidad de carga y **auditoría de accesos**.
3. **Rotación automática** y TTL corto. Lo ideal es que ni siquiera exista un secreto estático: credenciales dinámicas generadas por petición (Vault database secrets engine).
4. **Inyección en runtime** (fichero montado o variable de entorno del orquestador), **nunca en la imagen** ni en el `Dockerfile` (queda en las capas).
5. En Kubernetes, `Secret` es base64: activa cifrado en reposo de etcd, RBAC estricto y usa External Secrets/CSI.

## Cadena de suministro: el ataque moderno

```
código → dependencias → build → artefacto → registro → despliegue → runtime
   ↑          ↑           ↑         ↑          ↑           ↑
 commit    typosquat   runner    firma      pull      admisión
 firmado   / paquete   comprometido        del tag    de imágenes
           malicioso                       mutable
```

**Dependencias:**
- Lockfiles siempre; instalación reproducible (`npm ci`, `go mod verify`, `mvn -o` con checksums).
- **SCA** (Dependabot/Renovate + escáner) con política: parchear críticas en X días. Automatiza la actualización o no ocurrirá.
- Ojo con *typosquatting*, *dependency confusion* (un paquete interno con el mismo nombre en el registro público gana prioridad: configura scopes y registros correctamente) y *slopsquatting* (paquetes inventados por asistentes de IA).
- **SBOM** (CycloneDX/SPDX) generado en el build: cuando salga la próxima vulnerabilidad crítica, la pregunta será *"¿la usamos y dónde?"*, y sin SBOM la respuesta tarda días.

**Build y artefactos:**
- Builds reproducibles y **aislados** (runners efímeros, sin credenciales de producción).
- **Firma con Sigstore/cosign** (keyless, ligada a la identidad OIDC del workflow) y **verificación en admisión** (Kyverno/policy-controller): solo se despliega lo firmado por tu pipeline.
- **Referencia por digest**, no por tag: `imagen@sha256:...`. Un tag es mutable; el digest es la garantía.
- Niveles **SLSA** como marco para hablar de madurez: menciónalo si la vacante es de plataforma.

**CI/CD:**
- Permisos mínimos del token del pipeline; nada de secretos de producción en PRs de forks.
- Acciones/plugins fijados por SHA, no por tag.
- Aprobación humana para despliegues a producción y registro auditable de quién desplegó qué.
- Protección de rama y **commits firmados** en repos críticos.

## Contenedores y runtime

- Imagen base mínima (distroless), **usuario no root**, filesystem raíz de solo lectura, sin capacidades extra, `seccomp`/AppArmor por defecto.
- Nada de `hostPath`, `hostNetwork` ni `privileged` salvo justificación escrita.
- Escaneo de imagen en CI **y** en el registro (aparecen CVEs nuevas para imágenes viejas).
- Detección en runtime (Falco) para lo que se escapa: shell inesperada en un contenedor, escritura en directorios sensibles, conexiones anómalas.

## API gateway y borde

Qué resuelve el borde: terminación TLS, WAF (con reglas afinadas para no romper tráfico legítimo), rate limiting por cliente/IP/usuario, tamaño máximo de petición, autenticación gruesa, y bloqueo geográfico si aplica. Qué **no** resuelve: la autorización fina y la lógica de negocio.

Rate limiting bien planteado: límites distintos por endpoint (el de login más estricto), por identidad además de por IP (una IP puede ser un NAT corporativo), y respuesta `429` con `Retry-After` para que los clientes se comporten (ver [curso 00 módulo 4](../00-fundamentos-distribuidos/04-resiliencia.md)).

## Datos y privacidad

- Clasifica los datos (público / interno / PII / financiero) y aplica controles proporcionales.
- **Nunca PII ni secretos en logs.** Filtrado en el logger, revisión de payloads de error, y cuidado con las trazas (los atributos de span acaban en un SaaS).
- Cifrado en tránsito y en reposo, con claves gestionadas y rotadas; cifrado a nivel de campo para lo más sensible.
- Minimización y retención: no guardes lo que no necesitas; borra lo que caducó. Y ten preparado el flujo de **borrado a petición** (GDPR/LOPD): en una arquitectura de eventos, esto es un problema de diseño real (los eventos son inmutables — solución: guardar referencias y borrar el dato del almacén, o cifrado por usuario y destrucción de la clave, la técnica llamada *crypto-shredding*).

## Errores comunes que delatan a un no-senior

- Confiar en la red interna.
- Secretos en variables de entorno del repositorio o en la imagen.
- Reescribir la historia de git y creer que el secreto ya está a salvo (hay que rotar).
- Imágenes por tag mutable.
- No tener SBOM ni saber qué dependencias hay.
- WAF como sustituto de código seguro.
- PII en logs "solo en desarrollo" (que acaba en producción).

## 🧪 Laboratorio

1. **NetworkPolicy de denegación por defecto** en un namespace de pruebas; descubre qué se rompe y habilita solo lo necesario. Documenta la matriz de comunicación resultante.
2. **mTLS con Linkerd o Istio** entre dos servicios; verifica el certificado y aplica una política que permita solo un endpoint concreto desde un servicio concreto.
3. **Fuga simulada:** commitea una clave falsa, detéctala con `gitleaks`, y ejecuta el procedimiento completo de rotación (ver [módulo 4](04-respuesta-a-incidentes.md)).
4. **Firma y verifica:** firma una imagen con `cosign` keyless desde GitHub Actions y bloquea con Kyverno el despliegue de imágenes no firmadas. Intenta desplegar una sin firmar.
5. **SBOM:** genera uno con `syft`, escanéalo con `grype`, y responde en menos de un minuto: "¿usamos la versión X de la librería Y y en qué servicios?"
6. **Endurece un Dockerfile:** no root, distroless, read-only, y comprueba con `trivy` la reducción de CVEs.

## ✅ Autoevaluación

1. ¿Qué significa zero trust dentro de un clúster? Enumera cinco controles.
2. Se filtró una clave en un commit de hace 6 meses. ¿Qué haces?
3. ¿Qué es dependency confusion y cómo te proteges?
4. ¿Por qué referenciar imágenes por digest y no por tag?
5. ¿Qué es un SBOM y qué pregunta te permite responder?
6. ¿Qué resuelve y qué no resuelve un WAF?
7. ¿Cómo borras los datos de un usuario en una arquitectura de eventos inmutables?

## 🎯 Preguntas del banco que ya puedes responder

- [`seguridad-vulnerabilidades/02-seguridad-en-microservicios.md`](../../seguridad-vulnerabilidades/02-seguridad-en-microservicios.md) — las 12
- [`seguridad-vulnerabilidades/03-casos-e-incidentes.md`](../../seguridad-vulnerabilidades/03-casos-e-incidentes.md) — casos de cadena de suministro y secretos
- [`cloud/`](../../cloud/) — preguntas de IAM, red y políticas

---

**Anterior:** [Módulo 2](02-authn-authz.md) · **Siguiente:** [Módulo 4 · Respuesta a incidentes](04-respuesta-a-incidentes.md)
