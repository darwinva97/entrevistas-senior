# Seguridad y Vulnerabilidades — Preparación para Entrevistas Senior

Banco de preguntas y respuestas de seguridad de aplicaciones (AppSec) orientado a entrevistas técnicas de perfiles **senior backend / microservicios**. Enfoque **100% defensivo y de respuesta a incidentes**: cómo funcionan las vulnerabilidades conceptualmente, cómo detectarlas, cómo prevenirlas y qué hacer cuando ya ocurrieron. No contiene exploits funcionales ni payloads operativos.

Cada pregunta incluye una **respuesta resumen** (lo que dirías en 30-60 segundos) y una **respuesta detallada** (explicación profunda con código de la versión segura y respuesta a incidentes).

---


> 🎓 **¿Te faltan bases para responder esto?** El curso [Seguridad aplicada](../cursos/06-seguridad/) enseña exactamente lo necesario, con laboratorios y autoevaluación.
> Ver también: [índice completo](../INDICE.md) · [plan de estudio](../PLAN-DE-ESTUDIO.md) · [glosario](../GLOSARIO.md) · [inicio](../README.md)

## Índice de archivos

| # | Archivo | Contenido | Nº de preguntas |
|---|---------|-----------|-----------------|
| 1 | [01-owasp-y-vulnerabilidades.md](./01-owasp-y-vulnerabilidades.md) | OWASP Top 10, XSS/CSP, CSRF, deserialización, JWT, OAuth2/OIDC, secretos, dependencias, contenedores/K8s | 18 |
| 2 | [02-seguridad-en-microservicios.md](./02-seguridad-en-microservicios.md) | Zero trust, mTLS/service mesh, identidad servicio-a-servicio, gateway, rate limiting, multi-tenancy, CI/CD, gestión de vulnerabilidades | 12 |
| 3 | [03-casos-e-incidentes.md](./03-casos-e-incidentes.md) | Casos prácticos de respuesta a incidentes: secretos, CVEs, IDOR, SSRF, JWT robado, credential stuffing, supply chain, S3, TLS, programa de seguridad | 12 |

**Total: 42 preguntas.**

---

## 1. OWASP Top 10 y Vulnerabilidades Comunes

1. ¿Qué es Broken Access Control (A01) y por qué encabeza el OWASP Top 10?
2. ¿Qué son los fallos criptográficos (A02) y cómo se evitan en un backend?
3. Explica las inyecciones (SQL, NoSQL, command) y cómo prevenirlas de forma sistemática
4. ¿Qué es Insecure Design (A04) y en qué se diferencia de un bug de implementación?
5. ¿Qué es Security Misconfiguration (A05) y cómo se gestiona a escala?
6. Componentes vulnerables y ataques de supply chain (A06): ¿cómo gestionas el riesgo de terceros?
7. Fallos de identificación y autenticación (A07): errores comunes y diseño robusto de login
8. Fallos de integridad de software y datos (A08): CI/CD, actualizaciones y deserialización
9. Logging y monitoring insuficiente (A09): ¿qué registrar, qué no, y cómo detectar ataques?
10. Server-Side Request Forgery (SSRF, A10): riesgo en la nube y defensas
11. XSS y Content Security Policy: modelo de amenaza y defensa en capas
12. CSRF y SameSite: ¿sigue siendo relevante y cómo se defiende hoy?
13. Deserialización insegura en Java y Node: ¿por qué es tan peligrosa y cómo se evita?
14. JWT: errores comunes (alg none, secretos débiles, audience/issuer, revocación) y uso correcto
15. OAuth2 y OIDC: flujos correctos, PKCE y errores comunes de implementación
16. Secrets management: ciclo de vida, rotación y detección de secretos en repositorios
17. Dependencias vulnerables: SCA, priorización con CVSS/EPSS y respuesta a un CVE crítico
18. Seguridad en contenedores y Kubernetes: imágenes, least privilege, network policies y pod security

## 2. Seguridad en Microservicios

1. ¿Qué significa Zero Trust aplicado a la comunicación entre microservicios?
2. mTLS y service mesh: ¿qué aportan y qué problemas no resuelven?
3. Autenticación servicio-a-servicio: client credentials, workload identity y sus trade-offs
4. Propagación de la identidad del usuario entre servicios: JWT passthrough vs token exchange
5. API Gateway como punto de enforcement: qué centralizar y qué no
6. Rate limiting y protección contra abuso en APIs distribuidas
7. Validación de entrada en cada servicio: ¿por qué no basta validar en el borde?
8. Cifrado en tránsito y en reposo en una plataforma de microservicios
9. Multi-tenancy: estrategias de aislamiento de datos y prevención de fugas entre tenants
10. Auditoría y trazabilidad en sistemas distribuidos: diseño de un audit trail confiable
11. Seguridad en pipelines CI/CD: firmado de artefactos, SLSA y protección de la cadena de despliegue
12. Gestión continua de vulnerabilidades en una plataforma de microservicios: escaneo y SLAs de remediación

## 3. Casos e Incidentes de Seguridad

1. [CASO] Encuentran una API key commiteada en el repositorio
2. [CASO] Anuncian un CVE crítico en una librería usada en 40 servicios
3. [CASO] Detectas tráfico anómalo que sugiere una cuenta de servicio comprometida
4. [CASO] Un pentest reporta un IDOR en tu API
5. [CASO] Encuentran datos sensibles en los logs
6. [CASO] Un tercero reporta que tu endpoint permite SSRF hacia la metadata del cloud
7. [CASO] Un token JWT robado está siendo usado en producción
8. [CASO] Ataque de credential stuffing en el login
9. [CASO] Una dependencia de npm resulta comprometida (supply chain)
10. [CASO] Datos de clientes expuestos por un bucket S3 mal configurado
11. [CASO] Certificado TLS expirado en producción
12. [CASO] Diseñar un programa de seguridad para un equipo que no tiene ninguno

---

## Cómo usar este material

- **Repaso rápido**: lee solo las *respuestas resumen* de cada pregunta para tener a mano el argumento de 30-60 segundos.
- **Preparación profunda**: estudia las *respuestas detalladas*, prestando atención a los ejemplos de código seguro y a los pasos de respuesta a incidentes.
- **Simulación**: practica en voz alta respondiendo con la estructura contener → erradicar → recuperar → aprender para los casos.

## Convenciones

- **Categoría · Tipo**: cada pregunta indica su área temática y si es *Conceptual* o de tipo *[CASO] Análisis de problema*.
- Los ejemplos de código son **mínimos e ilustrativos** de la versión segura; no hay payloads de ataque operativos.
- Terminología en español técnico, conservando los términos de industria en inglés cuando son el estándar (IDOR, SSRF, mTLS, etc.).
