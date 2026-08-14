# Módulo 4 · Kubernetes para entrevistas

> **Curso 04 · Cloud** · 180 min

## Por qué esto importa en la entrevista

Kubernetes aparece en casi todas las vacantes senior, pero **no te van a preguntar por `kubectl`**: te van a preguntar por qué se reinicia tu pod, por qué el rollout tira 502s y cómo dimensionas recursos. Este módulo cubre exactamente eso.

## Modelo mental: bucles de reconciliación

Kubernetes no "ejecuta" tu despliegue: **compara el estado deseado con el real y actúa, para siempre**. Todo lo demás se deduce de ahí (por eso los cambios son eventualmente consistentes y por eso borrar un pod no sirve de nada si su Deployment sigue vivo).

**Qué pasa exactamente al hacer `kubectl apply -f deploy.yaml`** (pregunta clásica):

1. `kubectl` manda el YAML al **API server**, que autentica, autoriza (RBAC), pasa por **admission controllers** (mutantes y validantes: defaults, políticas, sidecars) y persiste en **etcd**.
2. El **Deployment controller** ve el nuevo estado y crea/actualiza un **ReplicaSet**.
3. El ReplicaSet controller crea los **Pods** (sin nodo asignado).
4. El **scheduler** elige nodo por: requests que caben, taints/tolerations, afinidades, topology spread.
5. El **kubelet** del nodo arranca los contenedores vía CRI, monta volúmenes, ejecuta las probes.
6. Al pasar readiness, el **endpoint controller** añade la IP del pod al **Endpoints/EndpointSlice** del Service, y **kube-proxy** (o el CNI) actualiza las reglas de red.

Contar esta cadena con soltura es una respuesta de 90 segundos que impresiona.

## Probes: la fuente de más incidentes autoinfligidos

| Probe | Si falla | Debe comprobar |
|---|---|---|
| `startupProbe` | reinicia (protege durante el arranque) | que el proceso terminó de arrancar (JVM lentas) |
| `livenessProbe` | **reinicia el contenedor** | solo estado irrecuperable del proceso |
| `readinessProbe` | lo saca del Service (no reinicia) | si puede atender ahora (dependencias críticas) |

Los dos errores clásicos: **liveness que comprueba la BD** (si la BD parpadea, Kubernetes reinicia todos tus pods a la vez y conviertes una degradación en un apagón) y **timeouts demasiado ajustados** (una pausa de GC de 2 s dispara el reinicio; ver [curso 01](../01-java-senior/01-jvm-memoria-y-gc.md)).

## Recursos: requests, limits y las dos muertes

```yaml
resources:
  requests: { cpu: "200m", memory: "256Mi" }   # lo que el scheduler reserva
  limits:   { memory: "512Mi" }                # tope duro de memoria
```

- **CPU es comprimible:** superar el límite produce **throttling** (latencia, no muerte). Se ve en `container_cpu_cfs_throttled_seconds_total`. Por eso muchos equipos **no ponen límite de CPU** en servicios sensibles a latencia, manteniendo requests correctos — es una postura defendible que conviene saber argumentar en ambos sentidos.
- **Memoria no es comprimible:** superar el límite = **OOMKilled (137)**, inmediato y sin piedad.
- **QoS:** `Guaranteed` (requests == limits) > `Burstable` > `BestEffort` (sin requests). Bajo presión del nodo, se desalojan primero los BestEffort. Si tu servicio es crítico, no lo dejes sin requests.
- Runtimes con GC necesitan que el heap se configure **por debajo** del límite: `MaxRAMPercentage` (JVM), `GOMEMLIMIT` (Go), `--max-old-space-size` (Node). Conectar esto con el módulo de tu lenguaje es exactamente lo que buscan.

## Los cinco estados que debes diagnosticar sin buscar

| Estado | Causas típicas | Qué miras |
|---|---|---|
| `Pending` | no cabe (requests), no hay nodo con las taints toleradas, PVC sin enlazar | `kubectl describe pod` → eventos del scheduler |
| `CrashLoopBackOff` | el proceso muere al arrancar: config, permisos, dependencia caída, comando mal | `kubectl logs --previous` |
| `OOMKilled` (137) | límite de memoria < uso real; heap mal configurado | `describe` → `Last State`, métricas de memoria |
| `ImagePullBackOff` | tag inexistente, credenciales de registro, red | eventos del pod |
| `Error`/`Completed` inesperado | señal no manejada, exit code | `logs`, código de salida |

```bash
kubectl describe pod <p>                 # eventos: el 80% de las respuestas están aquí
kubectl logs <p> --previous              # logs del contenedor que murió
kubectl get events --sort-by=.lastTimestamp
kubectl top pod / kubectl top node
kubectl debug -it <p> --image=nicolaka/netshoot --target=<contenedor>
```

## Rollouts sin perder peticiones

```yaml
strategy:
  rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }   # nunca por debajo de la capacidad
terminationGracePeriodSeconds: 45
lifecycle:
  preStop: { exec: { command: ["sh","-c","sleep 5"] } }   # margen para que dejen de enviarte tráfico
```

**El punto fino** (y la pregunta que separa): cuando un pod se elimina, el `SIGTERM` y la retirada del endpoint ocurren **en paralelo**, y la propagación a kube-proxy/ingress tarda. Por eso hace falta el `preStop sleep` (o poner readiness en rojo y esperar) **y** que la aplicación cierre ordenadamente. Sin las dos cosas, hay 502s en cada deploy.

Complementos: `PodDisruptionBudget` para que un drenaje de nodo no te deje sin réplicas, `topologySpreadConstraints` para repartir entre zonas, y estrategias canary/blue-green con Argo Rollouts o Flagger cuando el cambio es arriesgado.

## Escalado

- **HPA:** por CPU (default, a menudo inadecuado) o por métricas custom/externas; con **KEDA** puedes escalar por lag de Kafka, longitud de cola SQS, etc. — que es lo correcto para consumidores.
- **VPA:** ajusta requests; útil para *descubrir* el dimensionado correcto (modo recomendación) más que para aplicarlo automáticamente en servicios con HPA.
- **Cluster Autoscaler / Karpenter:** añade nodos. Recuerda la latencia de arranque de nodo (1–3 min): el autoescalado de pods no sirve si no hay dónde ponerlos.

## Configuración, secretos y seguridad básica

- `ConfigMap` para configuración, `Secret` para credenciales — pero **los Secrets son base64, no cifrado**: activa cifrado en reposo en etcd, RBAC estricto y, mejor, External Secrets Operator o CSI driver del gestor de secretos de tu nube.
- **RBAC**: roles mínimos por ServiceAccount; nada de `cluster-admin` para aplicaciones.
- **Pod Security / políticas** (Kyverno, Gatekeeper): sin root, sin privilegios, sin `hostPath`, filesystem de solo lectura, imágenes firmadas y por digest.
- **NetworkPolicy**: por defecto todo pod habla con todos. Una política de denegación por defecto + permisos explícitos es la mejora de seguridad más rentable del clúster.

## Errores comunes que delatan a un no-senior

- Liveness con dependencias externas.
- `maxUnavailable` por defecto sin `PodDisruptionBudget` en servicios críticos.
- No configurar el heap del runtime respecto al límite del contenedor.
- Confundir `Pending` con `CrashLoopBackOff` a la hora de diagnosticar.
- Creer que los Secrets están cifrados.
- Escalar por CPU un consumidor de cola.
- No conocer `kubectl describe` como primera herramienta.

## 🧪 Laboratorio

Con `kind` o `minikube`:

1. **Provoca los cinco estados** de la tabla, uno por uno, y diagnostícalos solo con `describe`, `logs --previous` y eventos.
2. **OOMKilled a propósito:** un servicio con heap mal configurado; arréglalo con `MaxRAMPercentage`/`GOMEMLIMIT` y demuéstralo.
3. **Cero 502 en rollout:** carga con `vegeta`, `kubectl rollout restart`, cuenta errores; añade readiness + preStop + graceful shutdown hasta llegar a cero. **Este ejercicio, hecho de verdad, responde tres preguntas del banco.**
4. **Throttling:** pon `limits.cpu: 100m` a un servicio con carga y observa `nr_throttled` y el p99. Súbelo y compara.
5. **KEDA:** escala un consumidor por el lag de una cola y grafica réplicas vs lag.
6. **NetworkPolicy:** deniega todo por defecto en un namespace y habilita solo lo necesario; verifica con `netshoot` qué deja de funcionar.

## ✅ Autoevaluación

1. Cuenta qué pasa desde `kubectl apply` hasta que el pod recibe tráfico.
2. Diferencia entre liveness y readiness, y por qué liveness no debe tocar la BD.
3. ¿Qué ocurre al superar el límite de CPU? ¿Y el de memoria?
4. Pod en `Pending`: ¿qué miras y qué causas manejas?
5. ¿Por qué hay 502s durante un rollout y cómo se eliminan (dos mecanismos)?
6. ¿Por qué HPA por CPU es mala idea para un consumidor de Kafka?
7. ¿Están cifrados los Secrets? ¿Qué haces al respecto?

## 🎯 Preguntas del banco que ya puedes responder

- [`cloud/aws/02-microservicios-en-aws.md`](../../cloud/aws/02-microservicios-en-aws.md) — EKS y despliegues
- [`cloud/azure/02-microservicios-y-casos.md`](../../cloud/azure/02-microservicios-y-casos.md) — AKS y casos
- [`cloud/gcp/02-microservicios-y-casos.md`](../../cloud/gcp/02-microservicios-y-casos.md) — GKE, límites y casos
- [`golang-microservicios/03-casos-y-problemas.md`](../../golang-microservicios/03-casos-y-problemas.md) — 16 (502 en rollouts) · [`typescript-microservicios/03-casos-y-problemas.md`](../../typescript-microservicios/03-casos-y-problemas.md) — 15, 16

---

**Anterior:** [Módulo 3](03-identidad-red-y-datos.md) · **Siguiente:** [Módulo 5 · Fiabilidad y costos](05-fiabilidad-y-costos.md)
