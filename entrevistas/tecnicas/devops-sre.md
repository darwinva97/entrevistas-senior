# 🛠️ Entrevista técnica · DevOps / SRE

> Simulacro por niveles. Lee **solo la pregunta**, responde en voz alta y cronometrada. Formato explicado en [cómo funcionan los simulacros](../README.md).

## Qué evalúan en cada nivel

| Nivel | Lo que buscan | Lo que te descarta |
|---|---|---|
| **Junior** | Linux, redes y Git de verdad; scripting; curiosidad operativa | Saber `kubectl apply` sin entender qué pasa debajo |
| **Semi-senior** | CI/CD, contenedores, IaC, diagnóstico con método | Cambiar cosas en producción a mano |
| **Senior / SRE** | Fiabilidad medible, incidentes, capacidad, coste | Hablar de herramientas y no de SLO |
| **Staff** | Plataforma como producto, autonomía de los equipos, riesgo | Convertirse en el cuello de botella de todos los despliegues |

## Guion típico (60 minutos)

```
 5 min · tu experiencia y qué operas hoy
15 min · fundamentos: Linux, red, contenedores
15 min · pipeline y despliegue
20 min · incidente en vivo (troubleshooting guiado)
 5 min · tus preguntas
```

---

## Nivel junior

### P1. Un servidor responde lento. Tienes SSH. ¿Qué miras?

**Qué evalúan:** si tienes método de diagnóstico o vas dando palos.

**❌ Lo que NO debes decir**

> "Reinicio el servicio y, si sigue igual, reinicio la máquina."

**Por qué está mal:** destruyes la evidencia sin haber recogido nada, y si el problema vuelve no tienes con qué diagnosticarlo. Además, "reiniciar" como primer reflejo indica que no distingues entre mitigar y entender: a veces reiniciar es lo correcto, pero se decide *después* de capturar el estado.

**⚠️ Respuesta aceptable**

> "Miro CPU y memoria con `top`, el espacio en disco con `df -h` y los logs del servicio con `journalctl`."

**Qué le falta:** las cuatro dimensiones (CPU, memoria, disco, red) y, sobre todo, la saturación: la cola de trabajo pendiente, que es la que avisa antes que la utilización.

**✅ Respuesta ideal**

> "Voy por recursos, de forma ordenada, siguiendo utilización, saturación y errores. CPU: `top` o `mpstat`, mirando también el *load average* frente al número de núcleos y el `%iowait`, porque una CPU al 20% con iowait alto significa que estamos esperando disco, no calculando. Memoria: `free -m`, si hay swap activo y si el kernel ha matado algo por OOM (`dmesg | grep -i oom`). Disco: `df -h` y `df -i` —los inodos agotados dan errores rarísimos con espacio libre— más `iostat`. Red: `ss -s` para ver el estado de las conexiones, y si veo muchas en `CLOSE-WAIT` sé que la aplicación no está cerrando sockets. Y en paralelo, la pregunta más rentable: qué cambió, porque casi todo empieza en un despliegue, un cambio de configuración o un dato que creció. Capturo evidencia antes de tocar nada."

**Por qué funciona:** cubre las cuatro dimensiones, aporta detalles que solo conoce quien ha depurado (iowait, inodos, CLOSE-WAIT) y prioriza la pregunta de "qué cambió".

**🔁 Repregunta probable:** *"CPU al 100% en un proceso, ¿ahora qué?"* → "Identifico el proceso y el hilo (`top -H`), miro qué está haciendo con un perfilador o un volcado de pila, y compruebo si coincide con un despliegue o con un cambio de carga."

📚 [Curso 00 · Observabilidad y diagnóstico](../../cursos/00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md)

---

### P2. ¿Qué diferencia hay entre una imagen y un contenedor, y por qué importa?

**Qué evalúan:** fundamentos de contenedores más allá de copiar un Dockerfile.

**❌ Lo que NO debes decir**

> "El contenedor es como una máquina virtual ligera con su propio sistema operativo."

**Por qué está mal:** es el malentendido que causa errores reales. Un contenedor **comparte el kernel del host**: no arranca un sistema operativo, es un proceso aislado con namespaces y cgroups. Creerlo una VM lleva a esperar aislamiento de seguridad que no existe, a no entender por qué un `limits.memory` mata el proceso, y a meter `systemd` dentro de una imagen.

**⚠️ Respuesta aceptable**

> "La imagen es la plantilla inmutable con capas y el contenedor es una instancia en ejecución de esa imagen, con una capa de escritura encima."

**Qué le falta:** el mecanismo (namespaces, cgroups) y las consecuencias prácticas.

**✅ Respuesta ideal**

> "La imagen es un artefacto inmutable, un conjunto de capas de solo lectura identificadas por digest; el contenedor es un proceso del host ejecutándose con esa imagen montada, aislado con namespaces —PID, red, montajes— y limitado con cgroups. La consecuencia importante es que comparte kernel: no es una frontera de seguridad tan fuerte como una VM, por eso importan el usuario no root, quitar capacidades y no montar el socket de Docker. Y las capas explican dos cosas del día a día: por qué el orden de instrucciones del Dockerfile cambia el tiempo de build, y por qué un secreto escrito en una capa sigue ahí aunque lo borres en la siguiente. Por eso referencio imágenes por digest y no por tag: el tag es mutable y no me garantiza que despliegue lo mismo que probé."

**Por qué funciona:** mecanismo, seguridad y dos consecuencias prácticas verificables.

**🔁 Repregunta probable:** *"¿Por qué un proceso dentro del contenedor ve toda la RAM del host?"* → "Porque muchas herramientas leen `/proc` del host; el límite está en el cgroup. Por eso los runtimes hay que configurarlos con el límite del contenedor, o el GC dimensiona mal y acabas con OOMKill."

📚 [Curso 04 · Cómputo, contenedores y serverless](../../cursos/04-cloud-y-kubernetes/02-computo-contenedores-y-serverless.md)

---

## Nivel semi-senior

### P3. Un pod está en `CrashLoopBackOff`. ¿Cómo lo diagnosticas?

**Qué evalúan:** si sabes leer Kubernetes o solo aplicar manifiestos.

**❌ Lo que NO debes decir**

> "Borro el pod para que se cree de nuevo, y si sigue igual escalo el deployment."

**Por qué está mal:** `CrashLoopBackOff` significa que el contenedor **arranca y muere** repetidamente: recrearlo reproduce el mismo fallo, y escalar multiplica el problema. Además pierdes los logs del contenedor anterior, que son justo donde está la respuesta.

**⚠️ Respuesta aceptable**

> "Miro los logs con `kubectl logs` y describo el pod con `kubectl describe` para ver los eventos."

**Qué le falta:** `--previous` (los logs del contenedor que murió), el código de salida y la lista de causas típicas.

**✅ Respuesta ideal**

> "`kubectl describe pod` primero, porque los eventos y el `Last State` me dan el código de salida: un 137 es OOMKilled y me lleva a memoria; un 1 con la aplicación arrancando es configuración o dependencia; un 127 es comando inexistente. Después `kubectl logs --previous`, que es la parte que se olvida: el contenedor actual puede que ni haya llegado a escribir, y lo que necesito son los logs del que murió. Las causas típicas que compruebo en orden: variable de entorno o secreto que falta, dependencia no disponible al arrancar, permisos de sistema de ficheros al correr como no root, límite de memoria demasiado bajo para el runtime, y probes mal configuradas —un liveness sin `startupProbe` mata aplicaciones que tardan en arrancar—. Si necesito mirar dentro, `kubectl debug` con un contenedor efímero en vez de cambiar la imagen."

**Por qué funciona:** ordena las herramientas, usa los códigos de salida como discriminador y lista causas concretas.

**🔁 Repregunta probable:** *"¿Y si el pod está en `Pending`?"* → "Es otro problema: no está fallando, es que no se ha podido programar. Miro los eventos del scheduler: recursos insuficientes, taints sin tolerancia, afinidades imposibles o un PVC que no enlaza."

📚 [Curso 04 · Kubernetes](../../cursos/04-cloud-y-kubernetes/04-kubernetes.md)

---

### P4. Cada despliegue produce errores 502 durante unos segundos. ¿Por qué y cómo lo arreglas?

**Qué evalúan:** si entiendes el ciclo de vida de un pod. Es la pregunta que separa a quien ha operado de quien ha leído.

**❌ Lo que NO debes decir**

> "Es normal en un rolling update, son solo unos segundos. Se puede desplegar de madrugada para que no afecte."

**Por qué está mal:** normaliza un fallo evitable. Un rolling update bien hecho no pierde ni una petición, y "desplegar de madrugada" es renunciar a desplegar cuando haga falta, que es justo lo contrario de lo que se busca en este rol.

**⚠️ Respuesta aceptable**

> "Falta configurar bien las probes: con un readiness correcto Kubernetes no manda tráfico hasta que el pod está listo, y con `maxUnavailable: 0` mantenemos capacidad."

**Qué le falta:** la causa principal de los 502 no es el pod que entra, sino el que **sale**.

**✅ Respuesta ideal**

> "Hay dos mitades. La del pod que entra se arregla con readiness bien hecho y `maxUnavailable: 0`. La del pod que sale es la que produce casi todos los 502 y es más sutil: cuando se elimina un pod, Kubernetes manda `SIGTERM` y retira el endpoint **en paralelo**, y la propagación a kube-proxy y al ingress tarda; durante esa ventana sigue llegando tráfico a un proceso que ya está cerrando. Por eso necesito dos cosas juntas: un `preStop` que espere unos segundos —o poner readiness en rojo y esperar— para dar tiempo a que dejen de enviarme tráfico, y un apagado ordenado en la aplicación que deje de aceptar conexiones nuevas, termine las que tiene en vuelo, cierre consumidores y pools, y solo entonces salga. Y el `terminationGracePeriodSeconds` tiene que ser mayor que toda esa suma o el `SIGKILL` te corta a la mitad. La forma de comprobarlo es medirlo: carga constante, `rollout restart`, y contar errores hasta llegar a cero."

**Por qué funciona:** identifica la causa real, da las dos piezas necesarias y termina con la verificación empírica.

**🔁 Repregunta probable:** *"¿Y con WebSockets?"* → "Ahí el apagado ordenado no basta: hay que avisar al cliente para que reconecte, porque `Shutdown` no cierra conexiones *hijacked*. Se suele hacer con un cierre progresivo y reconexión con jitter para no provocar una avalancha."

📚 [Curso 04 · Kubernetes](../../cursos/04-cloud-y-kubernetes/04-kubernetes.md) · [Banco: 502 en rollouts](../../golang-microservicios/03-casos-y-problemas.md)

---

## Nivel senior / SRE

### P5. ¿Cómo defines los SLO de un servicio y qué haces con ellos?

**Qué evalúan:** si la fiabilidad es medible para ti o es una sensación.

**❌ Lo que NO debes decir**

> "Ponemos el objetivo en 99,99% de disponibilidad, que es el estándar de la industria."

**Por qué está mal:** no hay estándar: hay coste. Cada nueve multiplica la inversión y la complejidad, y además tu SLO no puede superar el producto de tus dependencias. Prometer 99,99% sin analizar el negocio ni las dependencias es una promesa que alguien va a incumplir.

**⚠️ Respuesta aceptable**

> "Defino un SLI que represente la experiencia del usuario —por ejemplo, porcentaje de peticiones sin error y por debajo de 300 ms— y fijo un objetivo mensual, con alertas si nos desviamos."

**Qué le falta:** el error budget como herramienta de decisión y la alerta por *burn rate*.

**✅ Respuesta ideal**

> "Empiezo por el usuario, no por la infraestructura: elijo un SLI que represente su experiencia, normalmente disponibilidad y latencia del recorrido crítico, medido lo más cerca posible del cliente. El objetivo lo negocio con negocio con una pregunta concreta: cuánto cuesta un minuto de caída, porque de ahí sale si 99,9% es suficiente o hace falta más. Y lo contrasto con las dependencias: si mi proveedor de pagos ofrece 99,9%, prometer más en un flujo que depende de él es mentir. Lo importante viene después: el presupuesto de error se convierte en herramienta de decisión, no en un panel bonito. Si nos queda budget, se puede arriesgar y desplegar rápido; si nos lo hemos gastado, se congelan features y se trabaja en fiabilidad, y eso está acordado *antes* del incidente, no discutido durante. Las alertas van por velocidad de consumo del budget: una quema rápida despierta a alguien, una lenta abre un ticket. Así se acaban las alertas de 'CPU al 90%' que nadie sabe si son un problema."

**Por qué funciona:** conecta con el negocio, con las dependencias y convierte el SLO en política de trabajo.

**🔁 Repregunta probable:** *"¿Cómo evitas la fatiga de alertas?"* → "Alertando sobre síntomas del usuario y no sobre causas, con umbrales por burn rate, y exigiendo que toda alerta que despierte a alguien tenga runbook y sea accionable. Lo que no cumple eso, se convierte en panel o se borra."

📚 [Curso 00 · Observabilidad](../../cursos/00-fundamentos-distribuidos/06-observabilidad-y-diagnostico.md) · [Curso 04 · Fiabilidad y costes](../../cursos/04-cloud-y-kubernetes/05-fiabilidad-y-costos.md)

---

### P6. La factura de la nube subió un 40% este mes. ¿Cómo lo abordas?

**Qué evalúan:** si sabes dónde está el dinero de verdad.

**❌ Lo que NO debes decir**

> "Bajamos el tamaño de las instancias y apagamos lo que no se use."

**Por qué está mal:** actúa antes de medir, y ataca la partida de la que todo el mundo habla (cómputo) que rara vez es la que sube de golpe. Reducir instancias a ciegas puede degradar el servicio y ahorrar mucho menos que un solo cambio en tráfico o almacenamiento.

**⚠️ Respuesta aceptable**

> "Reviso el desglose de la factura por servicio para ver qué creció, y busco recursos ociosos o sobredimensionados."

**Qué le falta:** la atribución por equipo/producto, los sospechosos habituales y el cambio que lo provocó.

**✅ Respuesta ideal**

> "Primero atribuyo: desglose por servicio y por etiqueta de equipo o producto, y comparo contra el mes anterior para aislar *qué* creció y *cuándo*, porque un 40% de golpe casi siempre tiene un cambio detrás: un despliegue, un job nuevo, una retención de logs, un tráfico entre zonas que antes no existía. Los sospechosos habituales, por orden de sorpresa, son tráfico de salida y entre zonas, NAT, almacenamiento y snapshots que nadie borra, entornos no productivos encendidos las 24 horas, y logs con nivel debug y un año de retención. El cómputo suele ser lo que más se mira y lo que menos sube. Después de entender, actúo en dos tiempos: lo inmediato —apagar lo ocioso, ajustar retenciones, endpoints privados para no pagar NAT— y lo estructural: compromisos de uso para la base estable, autoescalado con datos reales y, sobre todo, hacer visible el gasto por equipo, porque lo que no se atribuye no se optimiza. Y pongo alertas de anomalía, para enterarme el día 3 y no el día 30."

**Por qué funciona:** mide antes de cortar, conoce los sumideros reales, separa lo táctico de lo estructural y añade prevención.

**🔁 Repregunta probable:** *"¿Cómo convences a los equipos de optimizar?"* → "Dándoles su número y una comparación con equipos similares, no una orden. Cuando un equipo ve que su entorno de pruebas cuesta más que producción, se arregla solo."

📚 [Curso 04 · Fiabilidad y costes](../../cursos/04-cloud-y-kubernetes/05-fiabilidad-y-costos.md)

---

## Nivel staff

### P7. Los equipos de producto se quejan de que desplegar es lento y dependen de ti para todo. ¿Qué haces?

**Qué evalúan:** si entiendes la plataforma como producto y no como control.

**❌ Lo que NO debes decir**

> "Es que si les damos acceso a producción, van a romper cosas. Mejor que sigan pidiéndonos los cambios por ticket."

**Por qué está mal:** convierte al equipo de plataforma en un cuello de botella permanente y traslada la responsabilidad de la fiabilidad lejos de quien escribe el código. Además no escala: cuantos más equipos, más cola. La alternativa no es "acceso libre", son barreras automatizadas.

**⚠️ Respuesta aceptable**

> "Automatizaría los pedidos más comunes con plantillas y pipelines, para que los equipos se autoabastezcan sin pedirnos nada."

**Qué le falta:** tratar la plataforma como producto (usuarios, feedback, adopción) y definir qué barreras sustituyen al control manual.

**✅ Respuesta ideal**

> "Trato la plataforma como un producto interno con usuarios reales. Primero hablo con ellos y mido: qué piden por ticket, cuántas veces al mes y cuánto esperan. De ahí sale el catálogo de lo que hay que autoservir: crear un servicio nuevo con su pipeline, pedir una base de datos, publicar una ruta, rotar un secreto. Lo entrego como *golden paths*: plantillas donde lo correcto es lo fácil, con observabilidad, límites, seguridad y despliegue reversible ya incluidos. Y cambio el control manual por barreras automáticas: políticas en el clúster, escaneo de imágenes, revisión obligatoria en el código, presupuesto de error. No es dar acceso libre, es hacer que el camino seguro sea el más cómodo. Mido la adopción y el tiempo de espera, y lo que nadie usa lo retiro, porque una plataforma que no se adopta es un impuesto. Y dejo puertas de escape: si un equipo necesita algo fuera del camino, que pueda hacerlo hablando conmigo, no que se bloquee."

**Por qué funciona:** producto, medición, golden paths, barreras automáticas y puertas de escape. Es el discurso exacto de plataforma moderna.

**🔁 Repregunta probable:** *"¿Y quién responde cuando se rompe algo que ellos desplegaron?"* → "Ellos, con nosotros de apoyo. La guardia del servicio la lleva quien lo escribe; nosotros llevamos la de la plataforma. Sin eso, el incentivo de calidad desaparece."

📚 [Curso 04 · Cloud y Kubernetes](../../cursos/04-cloud-y-kubernetes/) · [Curso 09 · Cómo comunicar](../../cursos/09-tecnica-de-entrevista/01-como-comunicar.md)

---

### P8. Cuéntame el peor incidente que has vivido.

**Qué evalúan:** método, honestidad y aprendizaje. Es una pregunta técnica y de comportamiento a la vez.

**❌ Lo que NO debes decir**

> "Un compañero borró una base de datos en producción por error. Fue un desastre, pero al final lo resolvimos."

**Por qué está mal:** señala a una persona, no aporta tu papel ni el método, y no cierra con aprendizaje. Además deja una pregunta obvia sin responder: ¿por qué el sistema permitía que una persona sola borrara producción?

**⚠️ Respuesta aceptable**

> "Tuvimos una caída de varias horas por un problema en la base de datos. Investigamos, restauramos desde backup y luego mejoramos el monitoreo."

**Qué le falta:** números, cronología, decisiones bajo presión y acciones concretas de prevención.

**✅ Respuesta ideal**

> "El más duro fue una caída total de la API durante 40 minutos en hora punta, con unas 15.000 peticiones fallidas. Empezó tras un despliegue rutinario, aunque el despliegue no era la causa: había cambiado un valor de configuración que reducía el pool de conexiones, y la base de datos empezó a rechazar conexiones bajo carga. Yo coordinaba. Lo primero fue contener: revertimos el despliegue, que no arregló nada porque el sistema ya estaba en un bucle de reintentos que se sostenía solo; ahí cortamos reintentos y activamos rechazo de tráfico no crítico, y el servicio volvió en unos minutos. Después el diagnóstico, con la evidencia que habíamos capturado antes de tocar. Lo más incómodo del postmortem no fue la causa, fue que tardamos 12 minutos en enterarnos y nos avisó un cliente. Salieron tres acciones: alerta sobre saturación del pool, no solo sobre errores; límite de reintentos con presupuesto para que un problema local no se amplifique; y revisión de los valores de configuración que pueden cambiarse sin revisión. Lo escribimos sin nombres: quien cambió el valor no era el problema, el problema era que un cambio así no tenía ninguna barrera."

**Por qué funciona:** números, cronología, distingue contención de causa, admite el dato más doloroso (tiempo de detección) y termina en barreras, no en culpables.

**🔁 Repregunta probable:** *"¿Qué harías distinto?"* → "Capturar evidencia más rápido y comunicar antes hacia fuera; tardamos en avisar a soporte y eso multiplicó el ruido durante el incidente."

📚 [Curso 08 · Guion de incidentes](../../cursos/08-system-design/05-guion-de-incidentes.md)

---

## Rúbrica rápida

| Dimensión | Qué mirar |
|---|---|
| **Método** | ¿Acoté y medí antes de tocar? |
| **Evidencia** | ¿Capturé estado antes de reiniciar? |
| **Fiabilidad** | ¿Hablé de SLO y presupuesto de error, no solo de uptime? |
| **Coste** | ¿Mencioné el impacto económico de las decisiones? |
| **Autonomía** | ¿Mis soluciones dan autonomía a los equipos o crean dependencia de mí? |
