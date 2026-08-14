# 🤝 Contribuir

Gracias por querer mejorar este repositorio. Se aceptan tres tipos de aportación:

1. **Preguntas nuevas** al banco.
2. **Correcciones** de contenido (algo desactualizado, impreciso o mal explicado).
3. **Mejoras de los cursos** (explicaciones, laboratorios, ejemplos).

## Antes de empezar

```bash
npm run validar     # formato, conteos y enlaces
npm run indice      # regenera INDICE.md
```

No hacen falta dependencias: solo Node 18+.

## Formato de una pregunta

Las preguntas viven en `<área>/NN-nombre.md` y **el formato se valida en CI**:

```markdown
## 12. ¿Título de la pregunta, tal como la haría un entrevistador?
**Categoría:** Tema / Subtema · **Tipo:** Conceptual

### 📝 Respuesta resumen
3–6 líneas. Lo que dirías en 30–60 segundos. Debe poder leerse en voz alta.

### 📖 Respuesta detallada
Explicación con mecanismo (no eslogan), código realista, trade-offs,
errores comunes y "qué espera oír el entrevistador".

---
```

Reglas:

- La numeración es **consecutiva dentro del fichero** y empieza en 1.
- Para preguntas de análisis de problemas: `**Tipo:** [CASO] Análisis de problema` y el título redactado como lo plantearía el entrevistador ("El checkout falla cada día a las 12:00").
- Actualiza el índice del README del área y ejecuta `npm run indice`.
- Si el área cambia de total, ajusta la tabla del [README raíz](README.md) (el validador te avisará si no cuadra).

## Formato de un módulo de curso

Los cursos viven en `cursos/NN-nombre/`, con un `README.md` de índice y módulos `NN-tema.md`. Estructura esperada de un módulo:

```markdown
# Módulo N · Título
> **Curso XX · Nombre** · duración

## Por qué esto importa en la entrevista
## Modelo mental
## (secciones de contenido)
## Errores comunes que delatan a un no-senior
## 🧪 Laboratorio
## ✅ Autoevaluación
## 🎯 Preguntas del banco que ya puedes responder
```

El **laboratorio no es opcional**: cada módulo debe pedir algo ejecutable o escribible, no solo lectura.

## Criterios de calidad

Una aportación se acepta si cumple:

- **Precisión técnica.** Nada de afirmaciones sin matiz ("X siempre es mejor"). Si hay versiones implicadas, dilas (JDK 21, Go 1.22, Node 22…).
- **Trade-offs explícitos.** Toda recomendación lleva su coste.
- **Nivel senior.** Si la respuesta se encuentra en el primer resultado de una búsqueda, probablemente no aporta.
- **Español neutro**, tuteo, y términos técnicos en inglés cuando es lo habitual en la industria (*backpressure*, *breaking change*), no traducciones forzadas.
- **Sin contenido generado sin revisar.** Puedes usar herramientas, pero verifica cada dato.

## Estilo

- Encabezados de pregunta con `##`, secciones internas con `###`.
- Bloques de código con lenguaje declarado y **cortos**: lo justo para el concepto.
- Tablas para comparaciones; diagramas ASCII para flujos.
- Enlaces relativos entre ficheros (el validador comprueba que resuelven, ancla incluida).

## Proceso

1. Haz un fork y una rama descriptiva (`preguntas/kafka-transacciones`, `fix/gc-zgc-jdk23`).
2. Ejecuta `npm run indice && npm run validar`.
3. Abre el PR explicando **qué añade** y, si es una corrección, **la fuente**.
4. Un PR por tema: es más fácil de revisar y de aceptar.

## Qué NO encaja aquí

- Preguntas de nivel junior o de trivia (`¿qué imprime este código?` sin valor conceptual).
- Volcados de documentación oficial.
- Contenido de otros repositorios o libros sin reescribir y sin atribución.
- Material ofensivo o descalificaciones a empresas o personas.
