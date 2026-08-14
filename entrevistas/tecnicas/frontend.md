# 🎨 Entrevista técnica · Frontend

> Simulacro por niveles. Lee **solo la pregunta**, responde en voz alta y cronometrada, y compárate después. Formato explicado en [cómo funcionan los simulacros](../README.md).

## Qué evalúan en cada nivel

| Nivel | Lo que buscan | Lo que te descarta |
|---|---|---|
| **Junior** | Fundamentos de la plataforma (no solo del framework), semántica y CSS | Saber React pero no saber qué es el DOM |
| **Semi-senior** | Estado, rendimiento percibido, accesibilidad, pruebas | Optimizar sin medir |
| **Senior** | Arquitectura de UI, datos, métricas de usuario real, criterio de producto | Hablar solo de librerías de moda |
| **Staff** | Sistemas de diseño, plataforma frontend, coste organizativo | Ignorar al equipo y al negocio |

## Guion típico (60 minutos)

```
 5 min · tu experiencia y decisiones que has tomado
15 min · fundamentos de la plataforma (JS, CSS, navegador)
20 min · componente o pantalla en vivo / diseño de UI
15 min · rendimiento o accesibilidad con un caso real
 5 min · tus preguntas
```

---

## Nivel junior

### P1. ¿Qué diferencia hay entre `localStorage`, `sessionStorage` y las cookies?

**Qué evalúan:** si conoces la plataforma o solo el framework. Y, de paso, si piensas en seguridad.

**❌ Lo que NO debes decir**

> "Son lo mismo, pero `localStorage` guarda más y no caduca. Yo guardo ahí el token del usuario."

**Por qué está mal:** la segunda frase es la que te hunde. Un token en `localStorage` es legible por **cualquier** script de la página, así que una sola vulnerabilidad XSS —o una dependencia comprometida— entrega la sesión completa. Es una decisión de seguridad, no de comodidad, y decirla con naturalidad indica que nadie te ha revisado ese código.

**⚠️ Respuesta aceptable**

> "`localStorage` persiste hasta que se borra y `sessionStorage` dura lo que la pestaña; las cookies se envían automáticamente al servidor en cada petición y pueden tener fecha de expiración."

**Qué le falta:** las implicaciones. Está correcto como definición de manual, pero no dice cuándo usar cada uno ni menciona `HttpOnly`.

**✅ Respuesta ideal**

> "La diferencia funcional es el alcance y la caducidad: `localStorage` persiste entre sesiones, `sessionStorage` muere con la pestaña, y las cookies viajan al servidor en cada petición del mismo dominio. Pero la diferencia que más pesa es de seguridad: los dos primeros son accesibles desde JavaScript, así que no guardo ahí nada sensible. Para la sesión prefiero una cookie `HttpOnly; Secure; SameSite`, porque un XSS no puede leerla. Uso `localStorage` para preferencias de UI, como el tema o el idioma, y `sessionStorage` para estado temporal de un formulario largo."

**Por qué funciona:** define, decide y justifica con un criterio de seguridad concreto. En un junior, mencionar `HttpOnly` sin que te lo pregunten destaca muchísimo.

**🔁 Repregunta probable:** *"Si la cookie es `HttpOnly`, ¿ya estás protegido?"* → "De robo por XSS sí, pero no de CSRF: para eso necesito `SameSite` y, según el caso, un token anti-CSRF."

📚 [Curso 06 · Autenticación y autorización](../../cursos/06-seguridad/02-authn-authz.md)

---

### P2. ¿Por qué React pide una `key` al renderizar listas?

**Qué evalúan:** si entiendes el modelo de reconciliación o repites lo que dice el warning.

**❌ Lo que NO debes decir**

> "Porque React lo pide para evitar el warning de la consola. Yo suelo poner el índice del array."

**Por qué está mal:** el índice como key produce bugs reales y difíciles de ver: al insertar, borrar u ordenar elementos, React reutiliza el nodo equivocado y el estado interno (un input a medio escribir, un checkbox marcado) se queda en la fila que no es. Tratarlo como "callar un warning" indica que no sabes qué hace el algoritmo.

**⚠️ Respuesta aceptable**

> "La `key` sirve para que React identifique cada elemento entre renders y sepa cuáles cambiaron, así no vuelve a crear todo el listado. Debe ser un identificador único y estable, como el id."

**Qué le falta:** por qué el índice falla, que es la pregunta real detrás.

**✅ Respuesta ideal**

> "Porque la reconciliación compara el árbol nuevo con el anterior y necesita saber qué elemento es cuál. Sin key estable, React empareja por posición: si inserto un elemento al principio, cree que todos cambiaron de contenido en lugar de que hay uno nuevo. Eso no solo es ineficiente, sino que produce bugs de estado, porque el estado interno del componente y del DOM —el foco, el texto de un input— se queda asociado a la posición y no al dato. Por eso uso el id del dominio; el índice solo es aceptable en listas que nunca se reordenan ni cambian de tamaño, y aun así prefiero no acostumbrarme."

**Por qué funciona:** explica el mecanismo y el síntoma observable, que es lo que demuestra haberlo sufrido.

**🔁 Repregunta probable:** *"¿Y usar `Math.random()` como key?"* → "Peor: cambia en cada render, así que React desmonta y vuelve a montar todo, pierdes estado y foco, y el rendimiento empeora."

📚 [Curso 05 · Integración en runtime](../../cursos/05-microfrontends/03-integracion-runtime.md)

---

## Nivel semi-senior

### P3. La aplicación va lenta al escribir en un formulario grande. ¿Qué haces?

**Qué evalúan:** si mides o si aplicas optimizaciones por reflejo.

**❌ Lo que NO debes decir**

> "Envuelvo todo en `React.memo`, `useMemo` y `useCallback`. Eso siempre mejora el rendimiento."

**Por qué está mal:** memoizar no es gratis: cada `useMemo` añade comparación de dependencias y memoria, y aplicado a ciegas suele empeorar el resultado y ensucia el código. Además, si la causa es que un cambio de estado en el nivel superior re-renderiza todo el árbol, `memo` sin resolver el origen no arregla nada. "Siempre mejora" es la palabra que te delata.

**⚠️ Respuesta aceptable**

> "Perfilaría con React DevTools para ver qué componentes se están renderizando de más y memoizaría los que sean caros, o subiría el estado a un componente más cercano al input."

**Qué le falta:** la jerarquía de soluciones (arquitectura de estado antes que memoización) y la distinción entre "renderiza mucho" y "renderiza caro".

**✅ Respuesta ideal**

> "Primero mido con el Profiler para saber si el problema es que renderizo demasiadas veces o que un render concreto es caro; son problemas distintos. Lo más frecuente en formularios es lo primero: el estado del input vive muy arriba y cada tecla re-renderiza medio árbol. La solución barata es colocar el estado lo más cerca posible del campo, o usar componentes no controlados con una librería de formularios que solo suscriba lo que cambia. Si de verdad hay un componente caro —una tabla de miles de filas, un gráfico— ahí sí memoizo, o virtualizo la lista. Y mido antes y después, porque si no puedo demostrar la mejora es que no la he hecho."

**Por qué funciona:** ordena las soluciones por coste, distingue las dos causas y exige evidencia.

**🔁 Repregunta probable:** *"¿Cuándo usarías `useMemo` sin dudarlo?"* → "Cuando el cálculo es realmente caro y sus dependencias cambian poco, o cuando el valor se pasa como prop a un componente memoizado y necesito preservar la identidad referencial."

📚 [Curso 08 · Estimaciones y números](../../cursos/08-system-design/02-estimaciones-y-numeros.md)

---

### P4. ¿Cómo manejas los estados de carga y error al pedir datos?

**Qué evalúan:** madurez de producto. Es una pregunta sencilla donde casi todos se quedan cortos.

**❌ Lo que NO debes decir**

> "Pongo un `loading` con un spinner y, si falla, un `alert` con el error."

**Por qué está mal:** ignora los estados que de verdad existen (vacío, parcial, revalidando, sin conexión), no distingue entre errores que el usuario puede resolver y fallos del sistema, y un `alert` bloquea la interfaz y no dice qué hacer. Además no menciona reintentos ni el efecto de las peticiones que llegan fuera de orden.

**⚠️ Respuesta aceptable**

> "Manejo tres estados: cargando, error y datos. Uso una librería como TanStack Query que ya trae caché, reintentos y revalidación, y muestro un mensaje de error con un botón de reintentar."

**Qué le falta:** el estado vacío, la accesibilidad del cambio de estado y qué mensaje se muestra según el tipo de error.

**✅ Respuesta ideal**

> "Modelo los estados de forma explícita, y son más de tres: cargando inicial, con datos, revalidando en segundo plano, vacío, error recuperable y error del sistema. El vacío se olvida siempre y es el que peor experiencia da si aparece un spinner infinito. Uso una librería de datos —TanStack Query o similar— porque me da caché, deduplicación y reintentos con backoff sin escribirlos yo, y porque evita el bug clásico de las respuestas que llegan fuera de orden. En el error distingo: si es 4xx por algo que el usuario puede corregir, se lo digo en el campo correspondiente; si es 5xx, mensaje neutro, botón de reintentar y registro con el trace id para poder rastrearlo. Y me aseguro de anunciar los cambios de estado a lectores de pantalla con una región `aria-live`, porque si no, para alguien que no ve el spinner la aplicación simplemente no responde."

**Por qué funciona:** enumera estados reales, evita reinventar la rueda con criterio, y mete accesibilidad de forma natural. Eso último casi nadie lo dice.

**🔁 Repregunta probable:** *"¿Reintentas automáticamente siempre?"* → "No: solo peticiones idempotentes. Un `POST` que crea un pedido no lo reintento en silencio; ofrezco el botón y, si el backend lo soporta, mando una clave de idempotencia."

📚 [Curso 07 · Diseño de contratos](../../cursos/07-apis-y-versionado/01-diseno-de-contratos.md)

---

## Nivel senior

### P5. El equipo de negocio dice que la web "va lenta", pero el backend responde en 80 ms. ¿Cómo lo abordas?

**Qué evalúan:** si sabes que el rendimiento percibido no es el tiempo de respuesta del servidor.

**❌ Lo que NO debes decir**

> "Paso Lighthouse y aplico lo que diga: comprimo imágenes, hago *lazy loading* y subo la nota a 90."

**Por qué está mal:** Lighthouse es una medición sintética en una máquina y una red que no son las del usuario. Optimizar la nota puede no mover la experiencia real ni un milisegundo, y a veces se optimiza justo lo que el usuario no sufre. La nota no es el objetivo: es un proxy.

**⚠️ Respuesta aceptable**

> "Mediría con Lighthouse y con datos de campo (Core Web Vitals), y atacaría el LCP y el INP, que son las métricas que más afectan a la percepción."

**Qué le falta:** segmentar. La media esconde el problema: probablemente es lento para un dispositivo, una región o una pantalla concreta.

**✅ Respuesta ideal**

> "Empiezo por convertir 'va lenta' en algo medible: qué pantalla, qué dispositivos, qué red y qué percentil. Uso datos de usuarios reales, no solo laboratorio, porque el p75 de LCP en un móvil de gama media con 4G en provincia no se parece a mi laptop con fibra. Casi siempre el problema está segmentado: una ruta concreta, un dispositivo o una región. Después miro dónde se va el tiempo: si es LCP, suele ser una cascada de peticiones o una imagen enorme; si es INP, es JavaScript bloqueando el hilo principal; si es CLS, son elementos que llegan tarde sin reservar espacio. Y cuento el tiempo total de la página, no el del backend: 80 ms de servidor con cinco saltos encadenados de red, TLS y bundle son dos segundos para el usuario. Cierro con un presupuesto de rendimiento en CI para que no se degrade otra vez, porque esto se arregla una vez y se rompe cada sprint."

**Por qué funciona:** cuestiona el enunciado, segmenta, sabe qué causa cada métrica y termina con prevención.

**🔁 Repregunta probable:** *"¿Y si la lentitud es solo en Perú y el servidor está en Virginia?"* → "Entonces es latencia de red: CDN para estáticos, y si el HTML es dinámico, render en el borde o caché con revalidación. Cada round-trip intercontinental son ~150 ms que se multiplican por el número de peticiones encadenadas."

📚 [Curso 00 · Latencia y colas](../../cursos/00-fundamentos-distribuidos/05-latencia-y-colas.md) · [Curso 05 · Operación y performance](../../cursos/05-microfrontends/04-operacion-y-performance.md)

---

### P6. ¿Cómo decides entre renderizado en cliente, en servidor o estático?

**Qué evalúan:** criterio arquitectónico, no preferencias.

**❌ Lo que NO debes decir**

> "Siempre SSR, porque es mejor para SEO y para el primer pintado."

**Por qué está mal:** "siempre" descalifica cualquier respuesta de arquitectura. El SSR añade servidor que operar, coste por petición, complejidad de caché e hidratación, y para un panel de administración detrás de login no aporta absolutamente nada de SEO.

**⚠️ Respuesta aceptable**

> "Depende del caso: SSG para contenido que no cambia, SSR cuando necesito SEO y datos frescos, y CSR para aplicaciones internas o muy interactivas."

**Qué le falta:** los costes de cada opción y las mezclas, que es lo que se usa en la práctica.

**✅ Respuesta ideal**

> "Lo decido con tres preguntas: ¿lo tiene que indexar un buscador?, ¿cuánto puede envejecer el contenido? y ¿quién paga el coste, el servidor o el dispositivo del usuario? Para contenido público que cambia poco, estático con revalidación: es lo más rápido y lo más barato de operar. Para contenido público personalizado o muy fresco, SSR, asumiendo que ahora tengo un servidor con su latencia, su caché y su capacidad que dimensionar. Para una aplicación tras login con mucha interacción, cliente, porque el SEO no aplica y me ahorro complejidad. En la práctica casi siempre es una mezcla por ruta: la landing estática, el catálogo con revalidación y el panel en cliente. Y no me olvido de la parte que suele doler: la hidratación, que es donde se va el INP en muchas webs con SSR."

**Por qué funciona:** da criterios reproducibles, menciona el coste operativo y la trampa de la hidratación.

**🔁 Repregunta probable:** *"¿Y las islas o los server components?"* → "Van justo a ese problema: enviar HTML y solo el JavaScript de lo interactivo. Lo que gano es INP y peso; lo que pago es un modelo mental más complejo y menos gente en el equipo que lo domine."

📚 [Curso 05 · Por qué y cuándo](../../cursos/05-microfrontends/01-por-que-y-cuando.md)

---

## Nivel staff / principal

### P7. Cinco equipos comparten la misma web y se bloquean entre ellos. ¿Qué propones?

**Qué evalúan:** si diagnosticas el problema organizativo antes de proponer tecnología.

**❌ Lo que NO debes decir**

> "Microfrontends con Module Federation: cada equipo despliega lo suyo y se acabó el bloqueo."

**Por qué está mal:** salta a la solución más cara sin haber diagnosticado, e ignora que los microfrontends transfieren el problema a otro sitio: duplicación de dependencias, consistencia visual, depuración entre fronteras y una plataforma que alguien tiene que mantener. Si el equipo no tiene CI/CD maduro ni sistema de diseño, obtendrás todos los costes y ninguno de los beneficios.

**⚠️ Respuesta aceptable**

> "Evaluaría microfrontends, pero antes miraría si un monorepo con paquetes bien separados y `CODEOWNERS` resuelve el problema con menos coste."

**Qué le falta:** los datos que sustentan la decisión y el orden de las medidas.

**✅ Respuesta ideal**

> "Primero mido el bloqueo real: cuántos despliegues por semana hace cada equipo, cuánto esperan por coordinación, cuánto tarda el build y cuántos conflictos vienen de tocar lo mismo. Sin esos números la discusión es ideológica. Muchas veces el bloqueo no es técnico sino de proceso: un tren de release semanal o una QA manual compartida. Si es así, arreglar el proceso cuesta semanas y no toca la arquitectura. Si el bloqueo es real y estructural —los equipos son dueños de dominios distintos y se pisan— entonces sí planteo separación en tiempo de ejecución, pero con tres condiciones previas: sistema de diseño versionado, contrato explícito entre shell y remotes, y despliegue independiente con rollback por versión. Y lo digo claro: si no cumplimos esas condiciones, los microfrontends nos van a doler más que el problema que resuelven."

**Por qué funciona:** mide, distingue problema de proceso de problema de arquitectura, y pone condiciones de entrada. Ese "si no cumplimos, no lo hacemos" es lo que separa a un staff.

**🔁 Repregunta probable:** *"¿Y si la dirección ya decidió que serán microfrontends?"* → "Entonces mi trabajo es que salga bien: negocio las condiciones mínimas, empiezo por un solo dominio como piloto y mido si de verdad reduce el tiempo de entrega antes de extenderlo."

📚 [Curso 05 · Microfrontends](../../cursos/05-microfrontends/) · [Banco: monorepo vs MFE](../../microfrontends/02-casos-y-problemas.md)

---

### P8. ¿Cómo garantizas accesibilidad en un producto grande sin frenar al equipo?

**Qué evalúan:** si la accesibilidad es para ti un proceso o una tarea de última hora.

**❌ Lo que NO debes decir**

> "Pasamos una auditoría antes de cada release grande y arreglamos lo que salga."

**Por qué está mal:** convierte la accesibilidad en deuda que se paga al final, cuando cambiar la estructura ya es caro. Además, una auditoría puntual detecta un porcentaje bajo de los problemas reales (los automatismos no ven el foco perdido, el orden de tabulación ni un texto alternativo inútil).

**⚠️ Respuesta aceptable**

> "Integraría comprobaciones automáticas en CI con axe y formaría al equipo en lo básico: contraste, etiquetas de formulario, navegación por teclado."

**Qué le falta:** que lo automático cubre poco, y que la palanca real es el sistema de diseño.

**✅ Respuesta ideal**

> "Lo muevo de tarea a propiedad del sistema. La palanca que más rinde es el sistema de diseño: si el componente de campo de formulario ya trae etiqueta asociada, estados de foco visibles y mensajes de error anunciados, el equipo hace lo correcto por defecto sin pensar. Encima pongo comprobaciones automáticas en CI, sabiendo que solo detectan una parte —contraste, atributos faltantes— y que el resto necesita revisión humana. Añado un paso barato al *definition of done*: navegar la funcionalidad solo con teclado, que encuentra casi todos los problemas graves en dos minutos. Y una vez al trimestre, una prueba con lector de pantalla sobre los flujos críticos. Lo que no hago es dejarlo para una auditoría final: ahí ya no es un ajuste de CSS, es rehacer la estructura."

**Por qué funciona:** ataca la raíz (el sistema), reconoce el límite de lo automático y propone un ritual barato con alto retorno.

**🔁 Repregunta probable:** *"¿Cómo lo justificas ante negocio?"* → "Como alcance de mercado y riesgo legal, no como buena voluntad: hay usuarios que hoy no pueden comprar, y en varios países hay normativa. Y de paso mejora SEO y usabilidad general."

📚 [Curso 09 · Cómo comunicar](../../cursos/09-tecnica-de-entrevista/01-como-comunicar.md)

---

## Rúbrica rápida

| Dimensión | Qué mirar |
|---|---|
| **Plataforma** | ¿Hablé del navegador y del usuario, o solo del framework? |
| **Medición** | ¿Dije con qué lo mediría antes de optimizar? |
| **Usuario real** | ¿Segmenté por dispositivo, red o región? |
| **Accesibilidad** | ¿Apareció sin que me la preguntaran? |
| **Concisión** | ¿Menos de 90 segundos por respuesta? |
