# Módulo 2 · Cómputo: contenedores y serverless

> **Curso 04 · Cloud** · 150 min

## Por qué esto importa en la entrevista

"¿Lambda o contenedores?" es una pregunta de criterio, no de tecnología. La respuesta mediocre es "depende"; la respuesta senior enumera **los ejes que hacen que dependa** y decide con números.

## El espectro de cómputo

```
VM ──► Contenedor en orquestador ──► Contenedor sin servidor ──► Función
más control                                                    menos operación
arranque: minutos      segundos            ~1 s (o cero si hay warm)   ms–s (cold start)
factura: por hora      por instancia       por request/CPU-s           por invocación+GB-s
```

- **VM (EC2/GCE/Azure VM):** cuando necesitas control del SO, hardware específico (GPU), licencias, o software que no se contenedoriza. Tú parcheas.
- **Contenedores en orquestador (EKS/GKE/AKS, ECS):** el estándar para plataformas con muchos servicios; máxima flexibilidad, máxima carga operativa. Justificado cuando hay equipo de plataforma.
- **Contenedores serverless (Fargate, Cloud Run, Container Apps):** te olvidas de nodos, escalas por concurrencia o CPU, escalas a cero (Cloud Run/ACA sí; Fargate no). Es el punto dulce para la mayoría de las empresas medianas.
- **Funciones (Lambda/Functions):** eventos, glue code, cargas muy intermitentes, ETL ligero.

## Criterios de decisión (los que debes recitar)

1. **Perfil de tráfico.** Constante → contenedores (más barato por unidad). Muy variable o casi nulo → serverless (pagas por uso, escala a cero).
2. **Latencia tolerable.** ¿Te afecta un cold start de 200 ms–2 s? En un endpoint de checkout, sí; en un webhook nocturno, no.
3. **Duración y recursos.** Las funciones tienen límites duros (p. ej. 15 min en Lambda, tamaño de payload, memoria/CPU acopladas). Un job de 2 horas no va ahí.
4. **Estado y conexiones.** Las funciones no mantienen pools de conexiones bien (de ahí RDS Proxy o pgBouncer); WebSockets y streaming largos encajan mejor en contenedores.
5. **Portabilidad y lock-in.** Un contenedor se mueve; una arquitectura de funciones + eventos propietarios, mucho menos.
6. **Modelo de coste.** Haz el cruce: por debajo de X rps, serverless gana; por encima, contenedores. Calcúlalo de verdad y menciona el punto de cruce: eso impresiona.

## Cold starts: qué son y cómo se atacan

Causas: aprovisionar el sandbox, descargar el paquete/imagen, inicializar el runtime, y **tu propia inicialización** (frameworks pesados, conexiones, carga de configuración).

Mitigaciones que debes conocer: concurrencia aprovisionada / instancias mínimas (Lambda provisioned concurrency, Cloud Run `min-instances`, ACA `minReplicas`); imágenes/paquetes pequeños; inicialización perezosa fuera del camino crítico; runtimes ligeros; y en la JVM, arranque nativo (GraalVM, Quarkus, SnapStart en Lambda).

**Matiz que suma:** el cold start no solo depende de la plataforma, también de **tu** código. Una Lambda que abre conexión a la BD y carga un modelo de 200 MB en el handler es tu problema, no del proveedor. Y **provisioned concurrency cuesta dinero incluso ociosa**: si acabas pagando por instancias siempre calientes, la pregunta correcta es si serverless seguía siendo la elección adecuada.

## Contenedores: lo que se evalúa de tu imagen

```dockerfile
# Multi-stage: compilar en una imagen gorda, ejecutar en una mínima
FROM golang:1.22 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download                    # capa cacheada: no se invalida al cambiar código
COPY . .
RUN CGO_ENABLED=0 go build -o /app ./cmd/api

FROM gcr.io/distroless/static:nonroot  # sin shell, sin paquetes, sin CVEs de sistema
COPY --from=build /app /app
USER nonroot:nonroot                   # jamás root
EXPOSE 8080
ENTRYPOINT ["/app"]
```

Puntos que suman: orden de capas por frecuencia de cambio, `.dockerignore`, imagen base mínima (distroless/alpine con cuidado por musl), **usuario no root**, filesystem de solo lectura, referenciar por **digest** y no por tag mutable (`:latest` es una vulnerabilidad de cadena de suministro), escaneo de vulnerabilidades en CI, firma con cosign, y **healthcheck y señales**: el proceso debe recibir `SIGTERM` (ojo con arrancar vía shell, que se traga la señal: usa la forma exec de `ENTRYPOINT`).

## Escalado: por qué métrica

- **Por CPU** es el default y suele ser incorrecto: un servicio I/O-bound se satura con CPU baja.
- **Por concurrencia/peticiones en vuelo** es lo correcto para servicios web (Cloud Run lo hace nativamente; en Kubernetes con KEDA o métricas custom).
- **Por profundidad de cola** para consumidores: es la métrica que refleja el trabajo pendiente real (KEDA con lag de Kafka/SQS).
- **Escalado ≠ instantáneo:** hay latencia de decisión + arranque. Por eso hay que escalar con margen y por eso el autoescalado no salva de un pico brusco (para eso, load shedding — [curso 00 módulo 4](../00-fundamentos-distribuidos/04-resiliencia.md)).

## Un patrón que preguntan mucho: función + cola + contenedor

La arquitectura sensata en la mayoría de casos reales:

```
API (contenedor, latencia predecible)
   └─► cola (SQS/Pub-Sub/Service Bus)
          └─► worker (contenedor o función según duración y frecuencia)
                 └─► DLQ + alerta
```

Justificación: el camino síncrono es corto y controlado; el trabajo pesado va asíncrono, con reintentos y aislamiento. **Es la respuesta por defecto para "el endpoint tarda mucho porque hace X".**

## Errores comunes que delatan a un no-senior

- "Serverless siempre es más barato" (falso a partir de cierto tráfico sostenido).
- Ignorar los cold starts, o creer que solo dependen del proveedor.
- Conectar cientos de funciones directamente a una BD relacional sin proxy de conexiones.
- Imágenes con `latest`, root y 900 MB.
- Autoescalar por CPU un servicio I/O-bound.
- No manejar `SIGTERM` en el contenedor (ver graceful shutdown en los cursos de lenguaje).

## 🧪 Laboratorio

1. **Mide cold starts:** despliega el mismo endpoint como función y como contenedor serverless. Mide p50/p99 en frío y en caliente. Añade `min-instances`/provisioned concurrency y vuelve a medir; calcula el coste extra.
2. **Punto de cruce de coste:** con la calculadora del proveedor, halla el rps donde el contenedor sale más barato que la función. Escríbelo como una frase defendible.
3. **Reduce una imagen:** toma un Dockerfile real y llévalo a multi-stage + distroless + no root. Compara tamaño, tiempo de build y CVEs (`trivy image`).
4. **Escalado por cola:** con KEDA, escala un worker por el lag de una cola; genera un pico y grafica réplicas vs lag.
5. **SIGTERM:** demuestra con una prueba de carga que tu contenedor no pierde peticiones en un despliegue.

## ✅ Autoevaluación

1. Da cuatro criterios para elegir entre función y contenedor, con un ejemplo donde cada uno gana.
2. ¿Qué es un cold start y cuáles son las tres mitigaciones? ¿Cuál es su coste?
3. ¿Por qué las funciones y las bases de datos relacionales se llevan mal?
4. ¿Por qué escalar por CPU puede ser un error? ¿Qué métrica usarías?
5. Enumera 6 cosas que revisas en un Dockerfile de producción.
6. Un endpoint tarda 8 s porque genera un PDF. ¿Cómo lo rediseñas?

## 🎯 Preguntas del banco que ya puedes responder

- [`cloud/aws/01-fundamentos-y-arquitectura.md`](../../cloud/aws/01-fundamentos-y-arquitectura.md) y [`cloud/aws/02-microservicios-en-aws.md`](../../cloud/aws/02-microservicios-en-aws.md) — cómputo, Lambda, ECS/EKS
- [`cloud/gcp/01-fundamentos-y-arquitectura.md`](../../cloud/gcp/01-fundamentos-y-arquitectura.md) — Cloud Run y GKE
- [`cloud/azure/01-fundamentos-y-arquitectura.md`](../../cloud/azure/01-fundamentos-y-arquitectura.md) — ACA, AKS y Functions

---

**Anterior:** [Módulo 1](01-modelo-mental-multicloud.md) · **Siguiente:** [Módulo 3 · Identidad, red y datos](03-identidad-red-y-datos.md)
