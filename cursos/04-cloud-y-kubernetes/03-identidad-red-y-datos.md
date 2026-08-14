# Módulo 3 · Identidad, red y datos

> **Curso 04 · Cloud** · 180 min

## Por qué esto importa en la entrevista

Estos tres bloques concentran los incidentes caros: **IAM** produce las brechas, **la red** produce los "no conecta y nadie sabe por qué", y **la elección de base de datos** produce las migraciones de dos años. Un senior tiene opinión fundada en los tres.

---

## Parte 1 · Identidad y acceso

### El principio que ordena todo: nada de credenciales estáticas

La pregunta clásica es *"¿cómo accede tu servicio a la base de datos / al bucket sin secretos en el código?"*. La respuesta es **identidad de carga de trabajo**: la plataforma le da al proceso credenciales temporales, rotadas automáticamente.

| Nube | Mecanismo | Cómo funciona |
|---|---|---|
| AWS | **IRSA** (EKS) / roles de tarea (ECS) | la ServiceAccount se anota con un rol; el SDK obtiene credenciales temporales vía OIDC + STS |
| GCP | **Workload Identity** | la KSA se vincula a una service account de GCP; el metadata server entrega tokens |
| Azure | **Managed Identity** (+ Workload Identity en AKS) | identidad asignada al recurso; el SDK la usa sin secretos |

**💬 Cómo lo dices:** *"No guardo credenciales: uso IRSA/Workload Identity para que el pod asuma un rol con permisos mínimos. Si necesito un secreto de verdad (una API de terceros), va al gestor de secretos con rotación, montado en tiempo de ejecución, nunca en la imagen."*

### Diseño de permisos

- **Mínimo privilegio y por recurso:** `s3:GetObject` sobre `arn:aws:s3:::mi-bucket/prefijo/*`, no `s3:*` sobre `*`.
- **Roles, no usuarios.** Los usuarios con claves de acceso de larga vida son deuda de seguridad; si existen, rotación obligatoria y auditoría.
- **Frontera de cuenta/proyecto/suscripción** como aislamiento fuerte: producción separada de desarrollo a nivel de cuenta, no de tags.
- **Confused deputy:** al dar acceso a un tercero, exige `ExternalId` (AWS) o condiciones equivalentes.
- **Política de sesión, condiciones y límites** (`aws:SourceIp`, MFA, `PermissionBoundary`, Organizations SCP) — mencionar SCP/Policy como barrera preventiva es señal de haber trabajado en organizaciones grandes.
- **Auditoría:** CloudTrail / Cloud Audit Logs / Activity Log. Y la pregunta que sigue: *¿alguien mira esas alertas?*

---

## Parte 2 · Red

### Lo mínimo que hay que saber dibujar

```
VPC 10.0.0.0/16
├── Subred pública   10.0.1.0/24   → Internet Gateway (LB, NAT)
├── Subred privada   10.0.10.0/24  → servicios (salida por NAT)
└── Subred de datos  10.0.20.0/24  → BD, sin ruta a Internet
     Security Groups (stateful, a nivel de recurso) + NACL (stateless, a nivel de subred)
```

Puntos que preguntan y que debes tener claros:

- **Nada con IP pública que no sea el balanceador.** Las bases de datos, en subred sin salida.
- **Endpoints privados** (VPC Endpoints / Private Service Connect / Private Endpoint) para hablar con servicios gestionados sin pasar por Internet: mejora seguridad **y** ahorra costes de NAT (el ahorro suele ser el argumento que convence al negocio).
- **NAT Gateway** es caro y es un punto de concentración: si tu tráfico de salida es alto, mira endpoints y caché.
- **DNS** es la causa de la mitad de los misterios: TTL, resolutores privados, split-horizon.
- **Security Group vs NACL:** el primero es *stateful* (la respuesta vuelve sola) y se aplica al recurso; la NACL es *stateless* (necesitas reglas de ida y de vuelta) y se aplica a la subred. Confundirlos es un clásico.
- **Balanceadores:** L4 (NLB) para TCP/gRPC con conexiones largas, L7 (ALB/App Gateway/HTTPS LB) para enrutamiento por ruta/host, terminación TLS y WAF.
- **Service mesh** (Istio/Linkerd): mTLS automático, políticas de autorización, reintentos y observabilidad uniformes. Coste: complejidad real. Recomiéndalo cuando hay muchos servicios y equipos, no por defecto.

### El guion para "el servicio A no conecta con B"

1. ¿Resuelve el DNS? (`dig`, `nslookup` desde el pod)
2. ¿Hay ruta? (tabla de rutas, peering, subred correcta)
3. ¿Lo permite el firewall? (SG/NSG/reglas de firewall, NACL en ambos sentidos)
4. ¿Escucha el destino en ese puerto? (`nc -zv`, `ss -ltn` en el destino)
5. ¿TLS/certificado válido? (`openssl s_client`)
6. ¿Autorización de aplicación? (IAM, política de mesh, token)

Recitar esos seis pasos ordenados vale más que cualquier detalle memorizado.

---

## Parte 3 · Datos

### Elegir base de datos por patrón de acceso

| Necesidad | Elección | Por qué |
|---|---|---|
| Transacciones, consultas variadas, relaciones | **Relacional** (RDS/Aurora, Cloud SQL, Azure SQL) | el default sensato; no lo abandones sin motivo |
| Acceso por clave, escala masiva, latencia predecible | **Key-value** (DynamoDB, Bigtable, Cosmos) | pero debes conocer los patrones de acceso *antes* de diseñar |
| Documentos flexibles | Document (Mongo/Firestore/Cosmos) | esquema variable real, no pereza de modelar |
| Analítica sobre volúmenes grandes | **Columnar** (BigQuery, Redshift, Synapse) | separar OLTP de OLAP es la decisión clave |
| Caché / estructuras en memoria | Redis (ElastiCache, Memorystore) | ver el efecto ×50 del [curso 00 módulo 5](../00-fundamentos-distribuidos/05-latencia-y-colas.md) |
| Búsqueda de texto | OpenSearch/Elastic, o `tsvector` de Postgres | empieza por lo segundo si el volumen es moderado |

**La regla que debes decir:** *"empiezo con Postgres salvo que el patrón de acceso demuestre que no sirve"*. Es defendible, honesta y cierra la puerta a la sobre-ingeniería. En NoSQL, la clave es que **el modelo lo dicta la consulta**: en DynamoDB, diseñar PK/SK y GSI antes de escribir una línea, y tener claro qué pasa con una *hot partition*.

### Escalado de datos

- **Réplicas de lectura:** alivian lecturas, introducen retraso de replicación (y con él, los problemas de read-your-writes del [curso 00 módulo 2](../00-fundamentos-distribuidos/02-consistencia-y-cap.md)).
- **Particionado (sharding):** por tenant, por rango o por hash. Duro de deshacer: elige la clave con cuidado y ten un plan de re-sharding.
- **Pool de conexiones:** las BD relacionales tienen límite global de conexiones. Con muchos pods o funciones, usa RDS Proxy / pgBouncer, o te quedas sin conexiones antes que sin CPU.
- **Backups y restore:** el backup que nunca se ha restaurado no existe. RPO/RTO, point-in-time recovery, y **probar la restauración** periódicamente. Menciónalo: es la respuesta que separa a quien ha vivido una pérdida de datos.
- **Migraciones sin downtime:** expand/contract, doble escritura temporal, backfill y cambio de lectura — se detalla en el [curso 07 módulo 4](../07-apis-y-versionado/04-migraciones-sin-downtime.md).

### Almacenamiento de objetos

Clases de almacenamiento y ciclo de vida (caliente → infrecuente → archivo) es donde está el ahorro fácil; versionado y *object lock* para protegerte de borrados y ransomware; URLs prefirmadas para subir/bajar sin pasar por tu servicio (y sin exponer el bucket); y cifrado con claves gestionadas por ti (KMS) cuando el compliance lo exige.

## Errores comunes que delatan a un no-senior

- Credenciales estáticas en variables de entorno "porque es más fácil".
- Políticas con `*` "y luego lo afinamos".
- Base de datos accesible desde Internet (aunque tenga contraseña).
- Elegir NoSQL sin conocer los patrones de acceso.
- No tener plan de restauración probado.
- Confundir Security Group con NACL.
- Abrir cientos de conexiones a Postgres desde funciones sin proxy.

## 🧪 Laboratorio

1. **Sin secretos:** despliega un pod que lea un bucket usando IRSA/Workload Identity. Luego quita el permiso y confirma el 403: has probado el mínimo privilegio.
2. **Auditoría de permisos:** revisa las políticas de un proyecto real y reduce una de `*` a específica sin romper nada (usa los logs de acceso para saber qué se usa de verdad).
3. **Diagnóstico de red:** rompe a propósito la conectividad de tres formas (DNS, SG, ruta) y practica el guion de 6 pasos con un pod de depuración (`netshoot`).
4. **Réplica y retraso:** monta una réplica de lectura, genera carga de escritura y mide el *replication lag*; provoca un read-your-writes fallido y arréglalo.
5. **Restore real:** haz un backup, bórralo todo en un entorno de pruebas y restaura. Cronometra: ese número es tu RTO real.

## ✅ Autoevaluación

1. ¿Cómo accede tu servicio a un bucket sin secretos, en cada una de las tres nubes?
2. Diferencia entre Security Group y NACL con un ejemplo de cuándo importa.
3. Los seis pasos de "A no conecta con B".
4. ¿Cuándo NoSQL en vez de relacional y qué debes saber antes de decidir?
5. ¿Qué problemas trae una réplica de lectura y cómo los mitigas?
6. ¿Por qué las funciones necesitan un proxy de conexiones?
7. ¿Cuál es tu RTO y cómo lo sabes?

## 🎯 Preguntas del banco que ya puedes responder

- [`cloud/aws/01-fundamentos-y-arquitectura.md`](../../cloud/aws/01-fundamentos-y-arquitectura.md) — IAM, VPC, bases de datos
- [`cloud/aws/03-casos-y-problemas.md`](../../cloud/aws/03-casos-y-problemas.md) — casos de red, permisos y datos
- [`cloud/azure/02-microservicios-y-casos.md`](../../cloud/azure/02-microservicios-y-casos.md) y [`cloud/gcp/02-microservicios-y-casos.md`](../../cloud/gcp/02-microservicios-y-casos.md)
- [`seguridad-vulnerabilidades/02-seguridad-en-microservicios.md`](../../seguridad-vulnerabilidades/02-seguridad-en-microservicios.md) — identidad y mTLS

---

**Anterior:** [Módulo 2](02-computo-contenedores-y-serverless.md) · **Siguiente:** [Módulo 4 · Kubernetes para entrevistas](04-kubernetes.md)
