# Módulo 4 · Respuesta a incidentes de seguridad

> **Curso 06 · Seguridad** · 120 min

## Por qué esto importa en la entrevista

Porque las preguntas de [`seguridad-vulnerabilidades/03-casos-e-incidentes.md`](../../seguridad-vulnerabilidades/03-casos-e-incidentes.md) no son "¿qué es X?", sino **"son las 3 a.m. y pasa esto: ¿qué haces?"**. Lo que evalúan es el orden de tus acciones y si sabes que hay decisiones que no son técnicas (comunicación, legal, clientes).

## El marco: seis fases (NIST)

```
Preparación → Detección → Contención → Erradicación → Recuperación → Lecciones
```

- **Preparación** es la fase que gana los incidentes: logs útiles, accesos de emergencia, contactos, runbooks, capacidad de rotar secretos rápido.
- **Contención** primero, entender después. Igual que en fiabilidad ([curso 00 módulo 6](../00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)): mitigar y diagnosticar son actividades distintas.
- **Erradicación** es quitar el acceso del atacante *de verdad* (todas las puertas traseras, no solo la que encontraste).
- **Lecciones** con acciones concretas y dueño, sin buscar culpables.

**La regla de oro de la primera hora:** *preserva la evidencia antes de limpiar*. Un pod comprometido: haz snapshot del disco, captura la memoria si puedes, exporta los logs — **y luego** aísla. Si borras el pod, destruyes la única prueba de cómo entraron.

## Los cuatro incidentes que te van a plantear

### 1. Se filtró una credencial (API key, token, clave privada)

```
1. ROTAR YA. Genera nueva credencial y despliega; revoca la vieja.
   (Rotar primero, investigar después: cada minuto es acceso ajeno.)
2. Determina el alcance: ¿a qué daba acceso, desde cuándo, quién la vio?
   El repositorio es público → asume compromiso inmediato (los bots escanean en segundos).
3. Busca uso indebido en los logs de acceso del proveedor (CloudTrail, audit logs):
   llamadas desde IPs desconocidas, en horarios raros, acciones inusuales.
4. Erradica: revisa si crearon otras credenciales, usuarios, reglas o recursos.
5. Previene: gitleaks en pre-commit y CI, gestor de secretos, credenciales de corta vida.
```

> **⚠️ Trampa:** "reescribo la historia de git con `filter-repo` y listo". No: la credencial ya salió, puede estar en clones, forks, caché de GitHub y en índices de terceros. **Reescribir la historia es limpieza, no remediación. La remediación es rotar.**

### 2. Dependencia comprometida / CVE crítica

```
1. ¿La usamos? → SBOM. ¿En qué servicios y versiones? ¿Es alcanzable el código vulnerable?
2. ¿Estamos expuestos? Ruta desde entrada no confiable hasta la función vulnerable.
3. Mitiga si no puedes parchear ya: WAF, feature flag, desactivar la funcionalidad, aislar.
4. Parchea, despliega y verifica (escaneo + comprobación de versión en runtime).
5. Busca indicadores de compromiso previos: ¿ya la explotaron?
```

La respuesta que impresiona: **distinguir "vulnerable" de "explotable"**. No todas las CVE críticas te afectan; priorizar por alcanzabilidad y exposición evita quemar al equipo con parches innecesarios — pero hay que poder demostrarlo, no suponerlo.

### 3. Acceso no autorizado a datos (posible brecha)

```
1. Contén: revoca sesiones y tokens, corta el acceso, aísla el sistema afectado.
2. Preserva evidencia. Registra una cronología desde el minuto uno.
3. Determina el alcance: qué datos, de cuántas personas, en qué periodo.
4. Activa a las personas correctas: seguridad, legal, dirección, comunicación.
5. Notificación: hay plazos legales (72 h en GDPR desde el conocimiento; en Perú, la
   Ley 29733 y su reglamento también exigen comunicación a la autoridad y a los afectados).
   Esto NO lo decide el equipo técnico solo.
6. Recupera: rotar todo lo que pudo verse, forzar cambio de contraseñas, revisar integridad.
```

Lo importante es que digas: **"a partir de aquí no es solo una decisión técnica"**. Un senior sabe cuándo escalar.

### 4. Ataque en curso (DDoS, credential stuffing, scraping)

- **Mitiga en el borde:** CDN/WAF, rate limiting agresivo, reto (captcha) para tráfico sospechoso, listas de bloqueo temporales.
- **Protege el núcleo:** load shedding y prioridad para usuarios autenticados ([curso 00 módulo 4](../00-fundamentos-distribuidos/04-resiliencia.md)); no dejes que el ataque te tire la BD.
- **Distingue el tipo:** volumétrico (capa 3/4, lo mitiga el proveedor), aplicación (capa 7, peticiones caras: cachea, limita y encarece el ataque), o lógica (credential stuffing: MFA, detección de patrones, bloqueo progresivo).
- **No prometas** que el atacante se irá; asegúrate de que el servicio degrada de forma controlada.

## Comunicación durante un incidente

- **Un rol de coordinador** (incident commander) que no es quien teclea. Separa investigación de comunicación.
- **Actualizaciones periódicas** aunque no haya novedades ("seguimos investigando, próxima actualización en 30 min") — el silencio genera más ruido que las malas noticias.
- **Hechos, no especulaciones**, sobre todo hacia fuera.
- **Cronología en un canal dedicado**, con marcas de tiempo: será la base del postmortem y, si hay implicaciones legales, de la evidencia.

## Postmortem sin culpa

Estructura que puedes recitar:

1. **Impacto** (usuarios, datos, dinero, duración) — con números.
2. **Cronología** (detección, contención, resolución) — incluye cuánto tardaste en *enterarte*: suele ser el peor número.
3. **Causa raíz** — técnica y organizativa ("faltaba una alerta" y "nadie era dueño de ese servicio").
4. **Qué funcionó** — importante: consolida lo que hay que mantener.
5. **Acciones** con dueño y fecha, priorizadas por reducción de riesgo.

**💬 Cómo lo dices:** *"Nuestro objetivo no es que no vuelva a pasar un error humano —eso es imposible— sino que el sistema tolere ese error: una barrera automática, una alerta más temprana o un radio de explosión menor."*

## Errores comunes que delatan a un no-senior

- Borrar el sistema comprometido antes de recoger evidencia.
- Reescribir la historia de git en lugar de rotar.
- No saber a quién escalar ni que existen plazos legales.
- Buscar culpables en el postmortem.
- Declarar "resuelto" sin verificar que el atacante perdió todos los accesos.
- No medir el tiempo de detección.

## 🧪 Laboratorio

1. **Simulacro de credencial filtrada:** commitea una clave de pruebas real (de una cuenta desechable), detéctala, rótala y documenta la cronología. Cronometra el proceso completo — ese es tu tiempo real de respuesta.
2. **Escribe tu runbook** de los cuatro incidentes de este módulo, adaptado a tu stack: comandos concretos, dónde están los logs, a quién llamar.
3. **Tabletop exercise:** reúne al equipo 45 minutos y recorred un escenario ("un desarrollador reporta que su portátil fue robado sin cifrar y tenía credenciales"). Anotad qué no sabíais.
4. **Practica el postmortem:** escribe uno completo de un incidente real (o del laboratorio del [curso 00 módulo 6](../00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)) y compártelo. Llévalo mentalmente a la entrevista.

## ✅ Autoevaluación

1. Se filtró una API key en un repositorio público hace 3 días. Enumera tus acciones en orden.
2. ¿Por qué reescribir la historia de git no remedia una filtración?
3. Sale una CVE crítica en una librería que usas. ¿Cómo priorizas?
4. Sospechas acceso no autorizado a la BD de clientes. ¿Cuáles son los primeros 5 pasos y cuándo escalas?
5. ¿Qué preservas antes de limpiar un sistema comprometido?
6. ¿Qué contiene un buen postmortem y qué no debe contener?

## 🎯 Preguntas del banco que ya puedes responder

- [`seguridad-vulnerabilidades/03-casos-e-incidentes.md`](../../seguridad-vulnerabilidades/03-casos-e-incidentes.md) — los 12 casos
- [`casos-de-estudio/02-incidentes-en-produccion.md`](../../casos-de-estudio/02-incidentes-en-produccion.md) — el método de respuesta es el mismo

---

**Anterior:** [Módulo 3](03-microservicios-y-supply-chain.md) · **Fin del curso 06.**
