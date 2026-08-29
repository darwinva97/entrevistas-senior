# Curso 01 · Java senior + Spring en microservicios

> Duración: ~14 horas. Prerrequisito: [curso 00](../00-fundamentos-distribuidos/) y 2+ años escribiendo Java.

Prepara las **46 preguntas** de [`java-microservicios/`](../../java-microservicios/). El foco no es "saber Java", es saber **qué hace la JVM por debajo de tu código** y **qué hace Spring por debajo de tus anotaciones**, que es exactamente donde aprieta un entrevistador senior.

## Módulos

| # | Módulo | Qué te enseña | Duración |
|:-:|---|---|:-:|
| 1 | [JVM: memoria, GC y qué mirar cuando duele](01-jvm-memoria-y-gc.md) | Estructura de memoria, G1/ZGC, tuning con datos, OOM y sus sabores | 150 min |
| 2 | [Concurrencia y el Java Memory Model](02-concurrencia-y-jmm.md) | happens-before, `volatile`/`synchronized`/atomics, pools, `CompletableFuture`, virtual threads | 180 min |
| 3 | [Spring Boot por dentro y transacciones](03-spring-por-dentro-y-transacciones.md) | Auto-configuración, proxies, `@Transactional`, JPA y el N+1 | 150 min |
| 4 | [Kafka y patrones distribuidos en Java](04-kafka-y-patrones-distribuidos.md) | Productor/consumidor bien configurados, outbox, saga, Resilience4j | 150 min |
| 5 | [Laboratorio de diagnóstico JVM](05-laboratorio-diagnostico-jvm.md) | Reproducir y diagnosticar leak, deadlock, pool agotado, GC largo | 180 min |
| 6 | [Quarkus y compilación nativa](06-quarkus.md) | Build-time vs runtime, ArC, Mutiny, Panache, native image y sus trampas | 120 min |

## Al terminar deberías poder…

- Leer un log de GC y decir si el problema es tamaño de heap, tasa de asignación, humongous objects o promoción.
- Explicar por qué un `HashMap` compartido puede colgar un servicio y qué usar en su lugar.
- Contar qué pasa exactamente cuando llamas a un método `@Transactional` desde otro método de la misma clase.
- Configurar un consumidor de Kafka que no pierda ni duplique sin decir "exactly-once".
- Sacar un thread dump y un heap dump en producción y explicarlos.

## Herramientas que debes tener instaladas

```bash
sdk install java 21.0.3-tem      # o 17; conoce las diferencias
# incluidas en el JDK: jcmd, jstack, jmap, jstat, jfr, jhsdb
# externas imprescindibles:
#   async-profiler   → perfilado de CPU/alloc sin safepoint bias
#   Eclipse MAT      → análisis de heap dumps
#   JDK Mission Control → lectura de grabaciones JFR
docker run -d -p 9092:9092 apache/kafka:3.7.0     # para el módulo 4
```
