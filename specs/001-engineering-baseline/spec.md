# Feature Specification: Base de ingeniería de AulaNorma

**Feature Branch**: `001-engineering-baseline`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Crear la primera especificación de AulaNorma: una base de ingeniería profesional, segura, verificable y reutilizable que debe estar operativa antes de implementar la primera funcionalidad del producto."

## Clarifications

### Session 2026-09-25

- Q: ¿Qué debe incluir exactamente la aplicación mínima de la línea base, más allá de la comprobación de estado? → A: Solo un servicio con comprobación de estado consultable por máquina; sin interfaz visible, sin persistencia y sin llamadas a servicios externos.
- Q: ¿Qué debe significar exactamente "operativa" en la comprobación de estado, y qué información puede exponer sin autenticación? → A: Que el servicio arrancó con configuración válida y responde; devuelve un resultado de éxito inequívoco con solo estado y versión, sin autenticación y sin detalles internos; la prueba verifica el formato y la ausencia de información adicional.
- Q: ¿Qué entornos de desarrollo deben estar oficialmente soportados y verificados en la aceptación, y cuál será el entorno de referencia para medir SC-001 y SC-002? → A: macOS y Linux soportados y verificados; Windows solo mediante subsistema Linux, sin verificación oficial; entorno de referencia: el macOS del mantenedor, con características documentadas.
- Q: ¿Cuándo y con qué reglas debe activarse la protección de `main`, teniendo en cuenta que ahora hay un único mantenedor? → A: La protección básica de `main` ya está activa y se mantiene. Tras integrar esta funcionalidad y pasar los controles obligatorios una vez en `main`, se añaden inmediatamente como requeridos, antes de cualquier otro cambio. Sin pushes directos ni forzados y sin elusión para nadie, incluidos los administradores. Sin aprobación de otra persona mientras haya un único mantenedor (revisión documentada con la lista de comprobación constitucional). No se permite desactivar ni eludir la protección por emergencia: ante una incidencia se espera a resolverla o se modifica formalmente la gobernanza antes de continuar.
- Q: ¿Cómo deben ejecutarse y dejar evidencia las pruebas negativas para que sean reproducibles sin llegar nunca a `main`? → A: En local, un procedimiento automatizado aplica cada alteración sobre una copia temporal, comprueba el fallo y restaura el estado sin modificar ficheros versionados. En integración continua, una rama y un pull request en borrador por categoría, identificados como pruebas negativas, se cierran sin integrar y sus ramas se eliminan tras registrar los enlaces a las ejecuciones. Solo datos sintéticos; nunca secretos reales ni dependencias maliciosas no controladas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preparar y ejecutar el proyecto desde cero (Priority: P1)

Un desarrollador autorizado que nunca ha trabajado en AulaNorma clona el repositorio, sigue
únicamente la documentación incluida, prepara la configuración local a partir de una plantilla
sin secretos reales y arranca una aplicación mínima que confirma que está operativa.

**Why this priority**: sin un arranque reproducible nadie puede contribuir ni verificar nada;
es el requisito previo de todas las demás historias.

**Independent Test**: en una máquina o entorno limpio que cumpla los requisitos previos
documentados, una persona sin conocimiento previo del proyecto sigue la documentación y obtiene
la confirmación de estado operativo de la aplicación sin ayuda externa.

**Acceptance Scenarios**:

1. **Given** un clon limpio del repositorio y los requisitos previos documentados instalados,
   **When** el desarrollador sigue las instrucciones de instalación, configuración y ejecución,
   **Then** la aplicación mínima arranca y su comprobación de estado indica que está operativa.
2. **Given** la plantilla de configuración documentada, **When** el desarrollador crea su
   configuración local a partir de ella sin introducir credenciales reales, **Then** la
   aplicación arranca y las pruebas se ejecutan correctamente.
3. **Given** una configuración local a la que le falta un valor obligatorio o contiene un valor
   inválido, **When** el desarrollador arranca la aplicación, **Then** esta no arranca y muestra
   un mensaje claro que indica qué valor falta o es inválido, sin revelar ningún valor recibido,
   rutas absolutas, nombres de ficheros de configuración ni trazas (FR-005).

---

### User Story 2 - Verificar la calidad localmente con un conjunto único de comandos (Priority: P1)

Un desarrollador ejecuta, antes de abrir un pull request, los comandos documentados que
comprueban formato, análisis estático, tipos, pruebas y construcción, y obtiene un resultado
inequívoco de éxito o fallo por categoría.

**Why this priority**: los controles locales permiten detectar problemas antes de la revisión y
son la referencia que la integración continua debe reproducir.

**Independent Test**: en un repositorio válido, ejecutar el conjunto de comandos documentado
termina con éxito; introducir una alteración controlada que incumpla una categoría hace fallar
el comando correspondiente con un mensaje que identifica la causa.

**Acceptance Scenarios**:

1. **Given** un repositorio válido, **When** el desarrollador ejecuta cada comando de calidad
   documentado y el comando agregado que los ejecuta todos, **Then** todos finalizan con éxito.
2. **Given** una alteración controlada que incumple el formato, el análisis estático, los
   tipos, las pruebas o la construcción, **When** se ejecuta el comando de esa categoría,
   **Then** el comando falla, indica la categoría y señala la ubicación del problema.
3. **Given** un entorno sin acceso a proveedores de IA, Moodle ni otros servicios externos,
   **When** se ejecutan las pruebas, **Then** se completan con el mismo resultado que con acceso.

---

### User Story 3 - Ejecutar automáticamente los mismos controles en cada pull request (Priority: P1)

Un revisor abre un pull request dirigido a `main` y ve el resultado de los controles
automáticos, que coinciden con los controles locales e incluyen detección de secretos y
seguridad de dependencias. Un control obligatorio fallido invalida el cambio.

**Why this priority**: la constitución exige que la línea base de integración continua exista
antes de implementar la primera funcionalidad y que ningún PR con controles requeridos fallidos
pueda integrarse.

**Independent Test**: abrir un PR de prueba con el repositorio válido muestra todos los
controles en verde; abrir un PR con una alteración controlada por categoría muestra el control
correspondiente en rojo.

**Acceptance Scenarios**:

1. **Given** un PR dirigido a `main`, también en estado de borrador, **When** se abre o se
   actualiza, **Then** se ejecutan automáticamente todos los controles obligatorios y su
   resultado es visible en el PR.
2. **Given** una actualización de `main`, **When** se integra un cambio, **Then** los mismos
   controles se ejecutan sobre `main`.
3. **Given** un PR que introduce un valor con forma de secreto o credencial, **When** se
   ejecutan los controles, **Then** el control de detección de secretos falla.
4. **Given** un PR que introduce una dependencia con una vulnerabilidad conocida de gravedad
   alta o crítica, **When** se ejecutan los controles, **Then** el control de seguridad de
   dependencias falla.
5. **Given** un PR que introduce una dependencia con una vulnerabilidad conocida de gravedad
   media o baja, **When** se ejecutan los controles, **Then** el hallazgo aparece de forma
   visible y revisable en el resultado, aunque inicialmente no haga fallar el control.
6. **Given** cualquier control obligatorio fallido, **When** el revisor evalúa el PR, **Then**
   el cambio no se considera válido y, una vez añadidos los controles como requeridos en
   `main` (FR-026), no puede integrarse.

---

### User Story 4 - Comprender la estructura y activar la protección de `main` (Priority: P2)

Un mantenedor o futuro colaborador consulta la documentación para entender cómo se organiza el
proyecto en las cuatro capas de la constitución, qué controles existen y cuáles deben
configurarse como requeridos en la protección de `main`.

**Why this priority**: permite que la base sea reutilizable y que la protección de `main` se
active antes de la primera funcionalidad, pero depende de que existan los controles (P1).

**Independent Test**: una persona que solo lee la documentación puede identificar dónde irá el
código de cada capa y enumerar los controles que deben ser obligatorios en `main`.

**Acceptance Scenarios**:

1. **Given** la documentación del repositorio, **When** un colaborador busca dónde ubicar el
   código de una capa, **Then** encuentra una ubicación diferenciada para fuente normativa,
   interpretación estructurada, contenido didáctico y publicación en Moodle, con su
   responsabilidad descrita.
2. **Given** la documentación de controles, **When** un mantenedor configura la protección de
   `main`, **Then** dispone de la lista exacta de controles a marcar como requeridos, con el
   mismo nombre con el que aparecen en los PR.

---

### Edge Cases

- **Configuración incompleta o inválida**: la aplicación no arranca y lo explica con un mensaje
  claro, sin mostrar ningún valor recibido, rutas absolutas, nombres de ficheros de
  configuración ni trazas (Escenario 1.3 y FR-005).
- **Validación imposible de ejecutar** (por ejemplo, el código de validación no puede
  cargarse): la aplicación no arranca; el fallo es cerrado (FR-005).
- **Versión no soportada de los requisitos previos**: la documentación indica las versiones
  soportadas y el proceso de instalación o arranque advierte de forma clara si no se cumplen.
- **Secreto real introducido accidentalmente**: la detección de secretos falla en local, si se
  ejecuta, y en integración continua. El secreto se revoca inmediatamente, antes de cualquier
  otra acción; la revocación es la corrección. Una excepción nunca sirve para conservar una
  credencial expuesta. No se reescribe el historial de `main` ni se fuerza un push: hacerlo
  exigiría modificar antes formalmente la gobernanza (FR-026).
- **Falso positivo en la detección de secretos**: solo puede excluirse mediante una excepción
  que cumpla FR-020 y únicamente para un falso positivo o un contenido demostrado como no
  secreto; nunca desactivando el control.
- **Vulnerabilidad alta o crítica sin corrección disponible**: solo puede aceptarse mediante
  una excepción que cumpla FR-020; en otro caso el control falla. Si el aviso aparece en una
  ejecución programada de `main` sin cambios de código, el control falla igualmente en los PR
  siguientes y solo se integra la corrección: actualizar o retirar la dependencia, o registrar
  una excepción que cumpla FR-020. Si ninguna es posible, se espera sin eludir la protección.
- **Excepción caducada**: hace fallar el control, también en una ejecución programada sin PR
  abierto. Se renueva con una aprobación nueva, se retira o se corrige el hallazgo mediante un
  PR (FR-020).
- **Vulnerabilidad media o baja**: no hace fallar el control, pero queda visible y revisable en
  el resultado de la ejecución (FR-017).
- **Servicios externos no disponibles**: las pruebas no se ven afectadas porque no dependen de
  ellos; cualquier intento de las pruebas de contactar con un servicio externo real se trata
  como fallo. Los controles de seguridad que necesitan consultar una fuente externa (base de
  avisos, descarga verificada de herramientas) fallan cerrado si no pueden hacerlo (FR-014 y
  FR-017).
- **PR desde una bifurcación o sin acceso a secretos de CI**: los controles obligatorios se
  ejecutan igualmente, porque no requieren secretos. Si la plataforma retiene la ejecución de
  un colaborador nuevo hasta una aprobación manual, los controles requeridos no informan y el PR
  no puede integrarse hasta que se aprueba la ejecución y los controles terminan en verde.
- **Prueba no determinista**: repetir los controles sobre el mismo commit produce el mismo
  resultado; una prueba con resultado variable se considera defecto de la línea base. El
  control de dependencias queda fuera de esta regla porque su resultado depende, por diseño, de
  la base de avisos vigente en cada ejecución (FR-017).
- **Prueba negativa de secretos o dependencias**: se usa un dato sintético y una dependencia
  controlada según las definiciones de FR-012; nunca un secreto real ni una dependencia
  maliciosa no controlada.
- **Cambio en las exclusiones del repositorio**: añadir o quitar rutas de `.gitignore` o de la
  lista de exclusiones de formato es un cambio revisable en el PR. Un cambio en `.gitignore`
  tiene además impacto de seguridad, porque altera lo que examina la detección de secretos
  (FR-003).
- **Incidencia que bloquea la integración en `main`** (por ejemplo, un control requerido que
  falla por causas ajenas al cambio): la protección no se desactiva ni se elude; se espera a
  resolver la incidencia o se modifica formalmente la gobernanza antes de continuar. La
  enmienda también llega mediante un PR sujeto a los controles requeridos; si el bloqueo afecta
  a todos los PR, incluida la enmienda, solo queda esperar a que se resuelva (FR-026).
- **Documentos binarios o normativos**: el repositorio no incluye documentos normativos; si en
  el futuro se añade alguno, debe llevar su registro de procedencia (constitución).
- **Petición HTTP malformada, no admitida o encadenada**: la frontera de transporte responde con
  el contrato cerrado de rechazo y cierra la conexión; nunca responde dos veces a la misma
  petición, no delega ninguna petición posterior de esa conexión y, si había respuestas
  legítimas pendientes, difiere el error hasta que terminan o lo descarta si la conexión se
  cierra antes (FR-009).
- **Arranque que elude la frontera**: cualquier forma de atender peticiones sin pasar por la
  frontera de transporte no está admitida y una comprobación automática la detecta (FR-006 y
  FR-009).

## Requirements *(mandatory)*

### Functional Requirements

**Preparación y ejecución local**

- **FR-001**: El repositorio DEBE incluir documentación que permita, desde un clon limpio,
  instalar dependencias, configurar el entorno y ejecutar la aplicación mínima, indicando los
  requisitos previos y sus versiones soportadas. Los sistemas operativos oficialmente
  soportados son macOS y Linux, y ambos DEBEN verificarse durante la aceptación. Los **perfiles
  verificados** son exactamente dos: macOS arm64, en el equipo de referencia del mantenedor, y
  Linux x64, en la integración continua y en la aceptación. Otras arquitecturas de esos sistemas
  pueden funcionar, pero la documentación NO DEBE declararlas verificadas mientras no se
  ejecuten. Windows solo se admite mediante un subsistema Linux, sin verificación oficial, y la
  documentación DEBE indicarlo así. La verificación de Linux en la aceptación consiste en el
  recorrido de SC-001 en Linux x64 y en el procedimiento local de SC-003 en Linux x64, además de
  los controles de integración continua; cada uno conserva su propia evidencia.
- **FR-001a**: La documentación DEBE describir el entorno de desarrollo de referencia: el macOS
  arm64 del mantenedor, con su versión del sistema, arquitectura, recursos (procesador y
  memoria) y versiones de los requisitos previos. Es el entorno en el que se miden SC-001 y
  SC-002.
- **FR-002**: El repositorio DEBE incluir una plantilla de configuración local documentada,
  con cada parámetro descrito, sin credenciales ni secretos reales, y con valores de ejemplo
  claramente ficticios cuando sean necesarios.
- **FR-003**: Los ficheros de configuración local con valores reales DEBEN quedar excluidos del
  control de versiones por defecto. Todo cambio en las reglas de exclusión de Git (`.gitignore`)
  DEBE revisarse en el PR como cambio con impacto de seguridad, porque la detección de secretos
  no examina los ficheros ignorados (FR-014). Ampliar esas reglas nunca es una forma de ocultar
  un secreto real, que se revoca (casos límite).
- **FR-004**: La aplicación mínima DEBE poder ejecutarse localmente y ejecutar sus pruebas sin
  ningún secreto real.
- **FR-005**: La aplicación mínima DEBE validar su configuración al arrancar y, ante un valor
  obligatorio ausente o inválido, NO DEBE arrancar y DEBE mostrar un mensaje claro que indique
  la clave afectada y el tipo de problema. Ningún mensaje o registro de configuración o de
  arranque DEBE mostrar **ningún valor recibido**, aunque no sea secreto, ni rutas absolutas,
  nombres de los ficheros de entorno cargados ni trazas de pila. Si la validación no puede
  completarse por cualquier causa, incluida la imposibilidad de cargar el código que la
  realiza, la aplicación NO DEBE arrancar (fallo cerrado) y DEBE terminar con un código de
  salida distinto de cero y un mensaje con las mismas restricciones. La configuración se valida
  al arrancar: aplicar cualquier cambio de la configuración local exige reiniciar la
  aplicación, que vuelve a validarla. No se promete la recarga en caliente de la configuración.
- **FR-006**: La aplicación mínima DEBE ser un servicio que ofrezca una comprobación de estado
  consultable por máquina. "Operativa" significa que el servicio arrancó con una configuración
  válida y responde. `/api/health` es expresamente la excepción cerrada al control de acceso
  definida por el principio V de la constitución 1.1.0. Su alcance son **exclusivamente** los
  métodos `GET` y `HEAD` sobre `/api/health`. No se extiende por analogía a ninguna otra
  operación, método o endpoint y cumple simultáneamente las siete condiciones constitucionales:
  - **C1**: es de solo lectura;
  - **C2**: la **operación de estado** no accede a datos de negocio ni personales y no consume
    ningún dato de la petición (dirección IP, cabeceras, `User-Agent`, cookies, consulta ni
    cuerpo). La **frontera de transporte** que precede a toda petición (FR-009) puede
    inspeccionar **exclusivamente** la versión HTTP, el destino crudo, el método, `Host`,
    `Content-Length`, `Transfer-Encoding` y `Expect`. El entorno HTTP subyacente puede además
    procesar metadatos estrictamente protocolarios de la petición atendida, como
    `Accept-Encoding`. Ni la frontera ni el entorno HTTP conservan, persisten, registran,
    reflejan en la respuesta, incluyen en el cuerpo, entregan a la lógica de estado ni usan con
    fines de negocio esos valores. En el comportamiento aprobado, `Accept-Encoding` solo puede
    provocar la presencia de la cabecera `Vary: Accept-Encoding`; la respuesta se entrega sin
    `Content-Encoding`. Esa `Vary` refleja el comportamiento observado y cerrado del entorno
    HTTP, no una promesa de compresión ni de variación efectiva del cuerpo;
  - **C3**: no usa persistencia ni servicios externos;
  - **C4**: no cambia el estado del sistema. La consulta **no emite ningún registro** ni genera
    identificadores por consulta. El **estado de conexión** que mantiene la frontera de
    transporte (FR-009) es transitorio: vive solo en memoria mientras dura la conexión, no se
    persiste, no es estado de negocio y no altera el estado del sistema;
  - **C5**: devuelve un contrato mínimo, explícito y cerrado: un resultado de éxito inequívoco
    que contiene únicamente el estado y la versión, con un conjunto cerrado de cabeceras
    permitidas. La única cabecera `Vary` admitida es `Vary: Accept-Encoding`, en las respuestas
    satisfactorias de `GET` y `HEAD`;
  - **C6**: no revela configuración, entorno, rutas, commits, tiempos internos, dependencias,
    infraestructura ni ninguna otra información sensible. Ninguna respuesta contiene una
    cabecera `Vary` distinta de `Vary: Accept-Encoding`, cabeceras o valores propios de un
    framework, ni `ETag`, `Server`, `X-Powered-By`, `Location` o `Refresh`;
  - **C7**: la excepción está declarada en esta especificación y se comprueba mediante pruebas.

  Además:
  - NO DEBE requerir autenticación.
  - La **versión** es información pública del contrato. Procede exclusivamente del campo
    `version` del manifiesto del paquete de la aplicación y tiene la forma SemVer básica
    `X.Y.Z`, sin sufijo de versión preliminar ni metadatos `+…`. Las versiones de las
    dependencias no son información pública y NO DEBEN revelarse por ningún medio, incluidos
    nombres o identificadores propios de un framework en cabeceras, redirecciones o cuerpos.
  - "**Tiempos internos**" son la hora de arranque, las duraciones, los contadores, las métricas,
    la duración del procesamiento y cualquier marca temporal o temporización generada por la
    aplicación. No incluyen los **metadatos de transporte** HTTP, que son exactamente tres:
    - `Date`, que expresa la fecha de la respuesta según el protocolo;
    - `Connection`, que indica si la conexión se mantiene o se cierra;
    - `Keep-Alive: timeout=5`, admitida solo con ese valor exacto y solo cuando el servidor HTTP
      la emite en una respuesta satisfactoria sobre una conexión persistente. Anuncia el tiempo
      de espera de la conexión inactiva, un parámetro fijo del protocolo, y no mide nada del
      proceso ni de la petición.
  - "**Rutas**" son rutas del sistema de ficheros, del código fuente o internas del servidor. El
    servicio no redirige: ninguna respuesta contiene `Location` ni `Refresh`, y ninguna
    reproduce el destino solicitado.
  - Cada una de las siete condiciones DEBE tener al menos una prueba objetiva y trazable que
    **falle** si la condición deja de cumplirse (por ejemplo, un campo o cabecera añadidos, un
    registro emitido por la consulta, una importación de persistencia o de red, o un método
    nuevo exportado). La trazabilidad condición → prueba se mantiene en el plan.
  - Una comprobación automática DEBE detectar cualquier segunda ruta pública y cualquier
    ampliación de la excepción por analogía: rutas, métodos, puntos de entrada o
    configuraciones de enrutado nuevos, incluido cualquier modo de arranque que atienda
    peticiones sin pasar por la frontera de transporte de FR-009.
  - Cualquier otra operación sin autenticación necesitaría su propia declaración expresa en la
    especificación de su funcionalidad y cumplir por sí misma las siete condiciones; no hereda
    esta excepción. Esta especificación no autoriza ninguna.
  - Una enmienda constitucional que afecte al principio V obliga a revisar, dentro de la propia
    enmienda, este requisito, el contrato de estado y el ADR que lo aplica.
- **FR-007**: La aplicación mínima NO DEBE implementar comportamiento funcional de AulaNorma
  (procesamiento de PDF, interpretación normativa, generación con IA, gestión de usuarios o
  permisos, integración con Moodle), NO DEBE incluir persistencia de datos y NO DEBE realizar
  llamadas a servicios externos.
- **FR-008**: La aplicación mínima DEBE emitir registros estructurados **solo** de su arranque:
  el arranque completado y los errores de configuración o de arranque. El arranque completado
  se registra **exactamente una vez** por arranque satisfactorio, después de validar la
  configuración y de empezar a escuchar; la validación previa al arranque nunca lo registra. NO DEBE emitir ningún
  registro como efecto de una consulta a `/api/health` (FR-006, C4) ni de ninguna otra
  petición, rechazo o respuesta de transporte (FR-009), en ninguno de los dos modos de
  ejecución (desarrollo y producción). Los registros automáticos de peticiones que ofrezca el
  entorno de ejecución DEBEN quedar desactivados para la única ruta que se delega. Cada
  registro contiene como mínimo nivel, marca de tiempo, servicio, entorno y nombre del evento.
  NO DEBE contener
  secretos, valores de configuración, datos personales, datos de ninguna petición (dirección
  IP, cabeceras, `User-Agent` o cookies), rutas absolutas ni trazas de pila. La censura de
  campos sensibles es una defensa adicional con una lista mínima y ampliable.
- **FR-009**: La línea base NO DEBE incluir interfaz visible para personas. La accesibilidad
  (WCAG 2.2 AA y español claro, principio X) se verificará en la primera funcionalidad que
  incorpore una interfaz. Ninguna página HTML se sirve en la superficie HTTP.

  Toda petición pasa primero por una **frontera de transporte** que decide, antes de cualquier
  código de la aplicación, si se atiende o se rechaza. Evalúa en este orden de precedencia:
  **versión → `Host` → destino → método → cuerpo**, y la primera regla incumplida determina la
  respuesta:
  1. **Versión**: se admiten exactamente HTTP/1.0 y HTTP/1.1. Una versión analizada pero no
     admitida recibe 505. Una línea de petición o una versión malformadas que el analizador
     HTTP rechace antes reciben el 400 cerrado de error de análisis.
  2. **`Host`**: en HTTP/1.1 DEBE existir exactamente una cabecera `Host`, no vacía, sin comas y
     sin caracteres de control. En HTTP/1.0 es opcional; si existe, cumple las mismas reglas.
     Los duplicados se detectan sobre las cabeceras tal como llegaron, sin combinar. Cualquier
     incumplimiento recibe 400. Las entradas que el analizador HTTP rechace antes pueden
     recibir el 400 cerrado de error de análisis.
  3. **Destino**: el destino crudo de la petición DEBE ser exactamente `/api/health`, byte a
     byte, sin normalizar ni decodificar. Cualquier otro destino (con barra final, barras
     repetidas, codificación, consulta, sufijo, mayúsculas distintas, forma absoluta o
     asterisco) recibe 404, sin redirección.
  4. **Método**: sobre el destino exacto, `GET` y `HEAD` ejecutan la consulta de estado de
     FR-006 y `OPTIONS` recibe la respuesta técnica de transporte (204, cuerpo vacío,
     `Allow: GET, HEAD, OPTIONS` y `Cache-Control: no-store`). Cualquier otro método recibe 405
     con `Allow: GET, HEAD, OPTIONS`.
  5. **Cuerpo**: solo se admite una petición sin `Transfer-Encoding` y con `Content-Length`
     ausente o igual a 0 tras el análisis del protocolo. Cualquier `Transfer-Encoding` o una
     longitud distinta de cero recibe 400. Las entradas malformadas pueden ser rechazadas antes
     por el analizador HTTP con el 400 cerrado de error de análisis. La frontera no promete
     distinguir diferencias de bytes que el analizador normaliza antes de entregar la petición.

  Además:
  - `CONNECT` y las peticiones de cambio de protocolo (`Upgrade`) se rechazan de forma cerrada:
    404 si el destino no es `/api/health` y 405 si lo es. Nunca se delegan.
  - Las peticiones con `Expect` pasan por la misma frontera, sin respuestas automáticas
    `100 Continue` ni `417`.
  - **Alcance del 500 cerrado**: la respuesta 500 cerrada cubre exactamente estos casos, y
    nunca responde "ok":
    - el manejador de la consulta de estado captura los fallos que ocurran dentro de él y,
      mientras no haya iniciado una respuesta, emite el 500 cerrado;
    - si la delegación al manejador falla antes de enviar cabeceras, la frontera de transporte
      emite ese mismo 500 cerrado;
    - si una respuesta ya empezó, no se intenta escribir un segundo estado: la conexión se
      destruye.

    Los errores internos del entorno de ejecución anteriores a la entrada en el manejador (por
    ejemplo, un fallo al cargar o compilar su módulo) no pueden transformarse retrospectivamente
    en esa respuesta cerrada y no se presentan como cubiertos por ella. Por eso un commit
    candidato solo es aceptable tras superar la construcción, la validación de configuración
    previa al arranque y las pruebas negativas correspondientes.
  - **Contrato cerrado de rechazo**: toda respuesta 400, 404, 405, 500 o 505 tiene cuerpo vacío,
    `Cache-Control: no-store`, `Content-Length: 0` y `Connection: close`, y la conexión se
    cierra después. `Allow` solo aparece en 405. `Date` puede acompañarlas como metadato de
    transporte (FR-006).
  - **Estado de conexión** (transitorio, FR-006 C4):
    - después de un rechazo no se delega ni se responde ninguna otra petición de la misma
      conexión;
    - un error de análisis de la conexión nunca genera una segunda respuesta a una petición ya
      respondida;
    - si hay respuestas legítimas pendientes en la conexión, el error de análisis se difiere;
    - cuando termina la última respuesta pendiente, el error diferido se emite como 400 cerrado;
      si la conexión se cierra antes, se descarta sin escribir nada;
    - las respuestas de peticiones encadenadas en la misma conexión se entregan en el orden de
      las peticiones, como máximo una por petición.
  - La aplicación escucha exclusivamente en la interfaz local de bucle `127.0.0.1` y en el
    puerto 3000, ambos fijos. No se configuran mediante el entorno ni mediante claves nuevas.
    Una futura necesidad de exposición o despliegue exige una decisión nueva (FR-027).
  - Los dos modos de ejecución (desarrollo y producción) DEBEN presentar el mismo contrato
    observable: mismos estados, cuerpos, conjunto cerrado de cabeceras y cierres de conexión.

  Las respuestas que el servicio da fuera de la excepción de FR-006 (400, 404, 405, 500, 505 y
  la respuesta a `OPTIONS`) son respuestas de **rechazo o de transporte**:
  - no ejecutan ninguna operación de producto ni acceden a datos;
  - no constituyen un modelo de autorización: la ausencia de rutas no equivale a "público por
    defecto", y la primera operación de producto DEBE aplicar autenticación y autorización con
    denegación por defecto (principio V);
  - no amplían la excepción de FR-006: `OPTIONS` es una respuesta técnica de transporte de esa
    misma ruta, no una operación de producto. Su 204 es de solo lectura, no accede a datos de
    negocio ni personales, no usa persistencia ni servicios externos, no cambia el estado de
    negocio, tiene un contrato cerrado, no revela información interna y está declarado y
    probado: cumple por sí mismo C1 a C7 como transporte de la misma excepción y no crea una
    operación de producto;
  - NO DEBEN contener HTML ni revelar la información que FR-006 prohíbe revelar, y tienen un
    contrato de cuerpo y cabeceras tan cerrado como el de la respuesta de éxito.

**Controles de calidad locales**

- **FR-010**: El repositorio DEBE ofrecer un conjunto único y documentado de comandos para
  comprobar, por separado, cada una de las ocho categorías de control (FR-022), y un comando
  agregado que las ejecute todas y termine con fallo si falla cualquiera. El agregado las
  ejecuta en secuencia y se detiene en el primer fallo: "todas" significa que el conjunto
  incluye las ocho categorías, no que continúe tras un fallo. El comando de formato es
  `prettier --check .` y cubre el código, la configuración, los scripts, los workflows y la
  documentación operativa mantenida por la aplicación. Quedan excluidos de ese comando,
  mediante `.prettierignore`, `.next/`, `coverage/`, `.tools/`, `package-lock.json`,
  `next-env.d.ts`, `.specify/`, `.cursor/`, `.claude/`, `.agents/`, `.opencode/`, `specs/` y
  `docs/adr/`. Esa exclusión:
  - NO autoriza a ignorar errores de Markdown;
  - NO amplía `.gitignore`;
  - no exime a `specs/` ni a `docs/adr/` de revisión: se revisan mediante su flujo documental
    y con `git diff --check`;
  - es un cambio revisable en el PR. Cualquier cambio en `.prettierignore` o en `.gitignore`
    es revisable; un cambio en `.gitignore` tiene además impacto de seguridad (FR-003).
- **FR-011**: Cada comando DEBE terminar con resultado de éxito en un repositorio válido y con
  resultado de fallo ante un incumplimiento de su categoría, indicando la causa y su ubicación.
  La causa y la ubicación se consideran indicadas cuando la salida nombra la regla, el código,
  el aviso o la prueba incumplidos y el elemento afectado: fichero (y línea cuando la categoría
  la tenga), paquete o workflow.
- **FR-012**: El repositorio DEBE documentar, para cada categoría de control, una alteración
  controlada reproducible que demuestre que el control correspondiente falla, con estas reglas:
  - en local, un procedimiento automatizado DEBE aplicar cada alteración sobre una copia
    temporal, comprobar que el control falla **por la causa esperada y en la ubicación
    esperada** y restaurar el estado, sin modificar ficheros versionados. Un fallo por otra
    causa, o un código distinto de cero sin la causa esperada, hace fallar el procedimiento;
  - en integración continua, la verificación DEBE hacerse con una rama y un pull request en
    borrador por categoría, identificados como pruebas negativas, que se cierran sin integrar;
    sus ramas se eliminan después de registrar los enlaces a las ejecuciones como evidencia. El
    control objetivo DEBE fallar por la causa y en la ubicación esperadas; los fallos
    colaterales causados por la misma alteración se registran, y los controles no afectados
    DEBEN pasar;
  - la autorización de push del token sintético es una autorización puntual de un dato de
    prueba, no una excepción a FR-020 ni una excepción constitucional. Si no puede
    autorizarse, SC-003 queda sin superar. Cualquier alerta que genere se cierra como dato
    sintético usado en una prueba; su permanencia en las referencias del pull request cerrado
    es un riesgo aceptado y no incumple FR-028, porque no es un secreto real;
  - las alteraciones DEBEN usar exclusivamente datos sintéticos y NUNCA secretos reales ni
    dependencias maliciosas no controladas:
    - un **dato sintético con forma de secreto** se genera en el momento de la prueba con un
      generador aleatorio criptográfico, tiene solo el formato de una credencial, no aparece
      como literal en ningún fichero versionado, no procede de ninguna cuenta ni servicio real
      y nunca ha sido una credencial válida;
    - una **dependencia controlada** es un paquete publicado, benigno, con avisos de
      vulnerabilidad conocidos y públicos, fijado a una versión exacta, añadido solo al fichero
      de bloqueo de una copia temporal o de una rama negativa, sin instalarse ni ejecutarse y
      sin integrarse nunca;
  - la verificación de que los ficheros ignorados no se examinan (FR-014) es una **prueba de
    exclusión positiva**: el control debe terminar con éxito. No es una prueba negativa más;
    - si cambia el SHA base de aceptación, solo se repiten los pull requests negativos cuyas
      alteraciones o controles resulten afectados;
    - tras cerrar las ramas negativas se verifica que ninguno de sus commits es alcanzable
      desde `main`;
    - los procedimientos de aceptación, incluido el procedimiento local de pruebas negativas, NO
      son controles: no se ejecutan en la integración continua ni se configuran como requeridos.
- **FR-013**: Las pruebas de la línea base DEBEN ser deterministas y NO DEBEN depender de
  proveedores reales de IA, de Moodle ni de otros servicios externos; las dependencias externas
  futuras se sustituirán por dobles de prueba. El bloqueo de red de las pruebas DEBE contar con
  una autoprueba que demuestre que un intento de conexión externa falla. La necesidad de red de
  los controles de dependencias y de la instalación verificada de herramientas no es una
  excepción a este requisito: no son pruebas, y consultar una fuente externa es su función
  (FR-017).
- **FR-014**: La detección de secretos, la comprobación de seguridad de dependencias y la
  comprobación de seguridad de workflows (`check:workflows`) DEBEN poder ejecutarse también
  en local mediante comandos documentados y forman parte de la equivalencia local/CI
  (FR-016). La detección de secretos DEBE cubrir, como análisis separados:
  1. todo el historial alcanzable desde el commit evaluado, incluido el contenido añadido y
     borrado después, sin depender de otras ramas;
  2. el contenido del índice de Git (cambios preparados), aunque difiera del árbol de trabajo;
  3. los ficheros versionados modificados y los ficheros nuevos no ignorados del árbol de
     trabajo.

  No examina los ficheros ignorados por Git: no forman parte del repositorio, contienen por
  diseño la configuración local (FR-003) y las dependencias instaladas, y examinarlos
  produciría hallazgos ajenos al repositorio. El riesgo residual (un secreto en un fichero
  ignorado por una regla indebida) se controla revisando todo cambio de `.gitignore` como
  cambio de seguridad (FR-003). Los enlaces simbólicos no se siguen: no incorporan al
  repositorio el contenido de su destino. Los controles de secretos y de workflows fallan
  cerrado si falta su herramienta, si su huella SHA-256 no coincide con la fijada o si el
  análisis no puede completarse.

**Integración continua**

- **FR-015**: Los controles obligatorios DEBEN ejecutarse automáticamente en cada PR dirigido a
  `main`, **también en estado de borrador**, en cada actualización de ese PR y en cada
  actualización de `main`, sin exclusiones por rutas ni por tipo de cambio. Reglas:
  - una ejecución de un PR que la plataforma cancela automáticamente porque ha llegado una
    actualización más reciente del mismo PR no es una cancelación manual; la ejecución de la
    actualización más reciente sustituye a la cancelada;
  - una ejecución cancelada no cuenta para SC-004, ni como éxito ni como intento;
  - una ejecución programada periódica de los controles de seguridad sobre `main` no es una
    "actualización de `main`", no puede ser la primera ejecución satisfactoria de FR-026 y no es
    un intento de SC-004.
- **FR-016**: La integración continua DEBE ejecutar las mismas ocho categorías que el entorno
  local, incluidas las tres de seguridad (secretos, dependencias y seguridad de workflows),
  invocando los mismos comandos documentados. Las diferencias de entorno admitidas entre local
  y la integración continua se documentan en el plan con su justificación.
- **FR-017**: La integración continua DEBE incluir detección de secretos y comprobación de
  seguridad de dependencias. Reglas:
  - **dependencias auditadas**: las directas de ejecución, las de desarrollo y todas las
    transitivas presentes en el fichero de bloqueo;
  - **gravedad**: la que asigna la base pública de avisos que consulta el control;
  - las vulnerabilidades de gravedad alta o crítica DEBEN hacer fallar el control;
  - las de gravedad media o baja no hacen fallar el control, pero DEBEN aparecer en la salida
    del comando y en el resumen de la ejecución de integración continua con paquete,
    identificador del aviso, gravedad y enlace al aviso, y seguir disponibles durante el
    periodo de retención de la ejecución;
  - la verificación de integridad y procedencia de las dependencias en el registro DEBE hacer
    fallar el control si termina con error;
  - el control DEBE fallar cerrado si no puede consultar la base de avisos o el registro;
  - cambiar el umbral de gravedad que hace fallar el control exige actualizar esta
    especificación y el ADR correspondiente;
  - cualquier excepción DEBE cumplir FR-020.
- **FR-018**: El fallo de cualquier control obligatorio DEBE marcar la ejecución como fallida
  y hacer visible en el PR qué control ha fallado.
- **FR-019**: Los controles obligatorios NO DEBEN requerir secretos para ejecutarse, en ningún
  evento que los dispare.
- **FR-020**: Las excepciones a la detección de secretos o a la seguridad de dependencias
  DEBEN ser explícitas, versionadas, justificadas y revisables en el PR; NO DEBEN desactivar el
  control completo. Reglas:
  - cada excepción es una entrada de un registro estructurado y verificable automáticamente,
    con el identificador del hallazgo (huella del hallazgo de secretos, o aviso y paquete),
    responsable, justificación, fecha de aprobación y fecha límite de revisión (`reviewBy`);
  - la fecha límite de revisión es como máximo 90 días posterior a la fecha de aprobación;
  - las fechas se interpretan en UTC y una excepción caduca cuando la fecha UTC de la ejecución
    es posterior a su `reviewBy`;
  - una excepción caducada, incompleta o con una fecha que incumpla estas reglas hace fallar el
    control;
  - en secretos, cada huella de la lista de exclusión de la herramienta DEBE tener exactamente
    una entrada en el registro, y viceversa; una huella huérfana en cualquiera de los dos hace
    fallar el control;
  - una excepción de secretos solo se admite para un falso positivo o un contenido demostrado
    como no secreto; nunca para conservar una credencial expuesta, que se revoca;
  - con un único mantenedor, la aprueba el mantenedor en el PR que la añade, y la aprobación
    queda registrada en la lista de comprobación constitucional de ese PR;
  - estas excepciones por hallazgo no son excepciones constitucionales: no apartan ningún
    principio, solo documentan un hallazgo concreto dentro del control.
- **FR-021**: La integración continua DEBE ejecutarse con seguridad propia, igual en todos los
  eventos que la disparan:
  - con permisos mínimos y denegación por defecto;
  - los controles que se ejecuten sobre contribuciones no confiables NO DEBEN recibir ningún
    secreto del proyecto, ninguna credencial de larga duración ni ninguna credencial con
    permisos de escritura;
  - solo se admite la credencial efímera que la plataforma de integración continua genera
    automáticamente para cada ejecución, limitada al permiso mínimo de lectura del contenido
    del repositorio y usada únicamente por los componentes de la automatización que obtienen
    el código y preparan el entorno. Esa credencial NO DEBE quedar guardada en el espacio de
    trabajo ni pasarse explícitamente a los comandos de calidad, a la configuración de la
    aplicación ni a ningún comando que ejecute código del repositorio;
  - los componentes externos que use la automatización DEBEN fijarse por un identificador
    inmutable de su contenido (hash completo o huella criptográfica). Solo cuando la plataforma
    no lo permite, como en las imágenes de los ejecutores, se admite un nombre de versión
    explícito, sin alias móviles, documentado como no inmutable. Las actualizaciones de esos
    identificadores DEBEN corresponder a versiones oficiales publicadas y revisarse como
    cambios de seguridad;
  - la automatización NO DEBE obtener permisos de escritura, salvo necesidad expresamente
    justificada en un ADR.
- **FR-022**: Hay exactamente **ocho categorías de control** (formato, análisis estático y
  límites, tipos, pruebas, construcción, secretos, dependencias y seguridad de workflows) y
  exactamente **nueve controles requeridos**: uno por categoría y uno de verificación de la
  plataforma macOS, que ejecuta las categorías 1 a 5 y no es una categoría.   Cada control
  obligatorio DEBE tener un nombre estable, único entre todos los workflows, que coincide con
  el identificador del job, con el nombre con el que aparece en el PR y con el contexto de
  estado configurado como requerido. La fuente esperada de esos controles es la aplicación
  GitHub Actions de este repositorio. Renombrar, añadir o retirar un control requerido es una
  decisión con consecuencias operativas (FR-027) que DEBE definir su transición sin dejar
  `main` con un control requerido que nunca informa ni sin un control equivalente.

**Estructura y documentación**

- **FR-023**: La organización inicial del proyecto DEBE distinguir cuatro ubicaciones para las
  capas de la constitución (fuente normativa, interpretación estructurada, contenido didáctico
  y publicación en Moodle), cada una con su responsabilidad documentada, y las reglas de
  dependencia permitidas entre ellas.
- **FR-024**: La base NO DEBE contener lógica, datos, configuración ni nombres específicos de
  UF0517 ni de ADGG0408.
- **FR-025**: El repositorio DEBE documentar cómo ejecutar el proyecto, cómo ejecutar cada
  comprobación, cómo se organiza su estructura y cómo contribuir (ramas, PR y flujo Spec Kit).
- **FR-026**: El repositorio DEBE documentar qué controles deben configurarse como requeridos
  en la protección de `main`, los pasos para añadirlos y las reglas de la protección:
  - la protección básica de `main`, ya activa, DEBE mantenerse durante toda la funcionalidad;
  - la funcionalidad solo se integra cuando todos los criterios verificables antes de integrar
    están Superado: SC-001, SC-002, SC-003, la parte de pull request de SC-004, SC-005,
    SC-006, la parte local de SC-007 y SC-008. SC-001 y SC-008 no admiten cierre posterior:
    si falta la persona externa, el pull request permanece abierto, el criterio queda
    Pendiente, no se integra y no comienza la primera funcionalidad de producto;
  - la integración **no** inicia la congelación. Hasta obtener la **primera ejecución
    satisfactoria en `main`** se admiten PR correctivos normales. Esa ejecución es el primer
    par formado por los dos workflows de controles, disparados por una actualización de `main`
    sobre el **mismo SHA**, en el que los nueve controles terminan con éxito;
  - la **congelación** comienza cuando termina esa primera ejecución satisfactoria y termina
    cuando los nueve controles quedan configurados como requeridos. Durante ese intervalo no se
    integra ningún cambio, tampoco actualizaciones automáticas de dependencias;
  - los nueve controles DEBEN añadirse **inmediatamente** como requeridos: en la misma sesión
    administrativa y sin commits intermedios en `main`, registrando la hora de fin de la
    primera ejecución satisfactoria y la hora de activación. Si la activación falla, la
    congelación continúa hasta completarla;
  - NO DEBEN permitirse pushes directos ni forzados a `main`, y nadie, incluidos los
    administradores, DEBE poder eludir la protección;
  - mientras haya un único mantenedor, NO se exige la aprobación de otra persona; la revisión
    se documenta en la descripción de cada PR con la lista de comprobación constitucional, que
    responde las doce puertas con su evidencia;
  - la protección NO DEBE desactivarse ni eludirse por emergencia: ante una incidencia se
    espera a resolverla o se modifica formalmente la gobernanza antes de continuar. La enmienda
    también se integra mediante un PR sujeto a los controles requeridos;
  - la primera funcionalidad de producto no comienza hasta que se integra el primer PR
    posterior a la activación, que completa la evidencia de SC-004, SC-007 y SC-009, acepta
    los ADR de esta funcionalidad y registra la activación.
- **FR-027**: Las decisiones arquitectónicas relevantes DEBEN registrarse mediante ADR. Una
  decisión es relevante, y requiere ADR, si cumple cualquiera de estos criterios:
  - elige o cambia el runtime, el lenguaje, el framework o el gestor de paquetes;
  - cambia los límites modulares o las reglas de dependencia entre capas;
  - añade infraestructura, servicios o proveedores externos;
  - añade, sustituye, renombra o retira un control requerido o la herramienta que lo
    implementa;
  - cambia los permisos o credenciales de la integración continua;
  - cambia un umbral o una regla de seguridad de esta especificación.

  El resto de dependencias y herramientas no requieren ADR, pero toda dependencia nueva DEBE
  justificarse en el plan conforme a la constitución. Los ADR siguen el ciclo de vida definido
  en `docs/adr/README.md` (Propuesto → Aceptado → Sustituido). Los ADR de esta funcionalidad
  permanecen en estado Propuesto durante todo su PR de implementación. Mientras están
  Propuesto pueden corregirse si la implementación o esta revisión descubren que la decisión
  no es viable; no se obliga a cambiar la implementación para conservar una decisión propuesta
  incorrecta. Se cambian a Aceptado, junto con `docs/adr/README.md`, en el primer PR posterior
  a la integración y a la activación de los nueve controles requeridos. Ese PR contiene también
  el registro de activación y la evidencia posterior.
- **FR-028**: El repositorio NO DEBE contener secretos, credenciales, datos personales ni
  documentos normativos sin registro de procedencia.

### Key Entities

- **Plantilla de configuración**: descripción versionada de todos los parámetros de
  configuración local, su propósito, si son obligatorios y un valor de ejemplo ficticio.
- **Control de calidad**: comprobación con nombre estable, categoría, comando local asociado,
  carácter obligatorio y alteración controlada que lo hace fallar. Hay exactamente ocho
  categorías: formato, análisis estático y límites, tipos, pruebas, construcción, secretos,
  dependencias y seguridad de workflows. Hay exactamente nueve controles requeridos: uno por
  categoría y uno de verificación de plataforma, que repite las categorías 1 a 5 en otro
  sistema operativo sin constituir una categoría propia ni requerir una alteración propia.
- **Ejecución de controles**: resultado de ejecutar los controles sobre un commit concreto,
  con el estado de cada control y la causa de cada fallo.
- **Excepción de seguridad**: exclusión explícita de un hallazgo de secretos o dependencias,
  con identificador del hallazgo, responsable, justificación, fecha de aprobación y fecha
  límite de revisión (`reviewBy`) en UTC, como máximo 90 días después de la aprobación.
- **Capa**: ubicación del proyecto destinada a una de las cuatro capas de la constitución,
  con su responsabilidad y dependencias permitidas.
- **Estado de la aplicación**: información pública consultable por máquina que confirma que la
  aplicación mínima está operativa; contiene únicamente su estado y su versión.
- **Estado de conexión**: información transitoria en memoria que la frontera de transporte
  mantiene por conexión (respuestas pendientes, rechazo emitido y error de análisis diferido).
  Desaparece al cerrarse la conexión; no se persiste, no se registra y no es estado de negocio
  (FR-006 C4 y FR-009).

## Aceptación: commit evaluado y evidencia

Se distinguen dos commits:

- **SHA base de aceptación**: código, dependencias, workflows y documentación de procedimiento
  evaluados;
- **HEAD de evidencia**: puede añadir solamente `acceptance.md`.

Un commit que solo modifica `acceptance.md` no obliga a repetir mediciones, pero vuelve a
ejecutar los controles automáticos. Cualquier otro cambio crea una nueva base y obliga a
repetir lo afectado.

Cada procedimiento local de aceptación usa su propio clon completo, limpio y fijado mediante
el SHA evaluado; no se clona una rama mutable.

Los enlaces a GitHub son admisibles como evidencia. No se copian nombres de personas, rutas
locales ni salidas sin redactar. Las personas externas se identifican mediante un seudónimo no
reidentificable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona que, al comenzar el primer recorrido, carece de conocimiento previo
  del proyecto, partiendo de un clon limpio fijado al SHA base de aceptación y con los
  requisitos previos instalados, consigue la confirmación de estado operativo en menos de 30
  minutos en el entorno de referencia (FR-001a). El cronómetro empieza tras comprobar
  `node --version` igual a `v24.21.0` y se detiene cuando `curl` recibe 200 con el cuerpo del
  contrato; `npm ci` y el resto del recorrido cuentan en el tiempo. Durante ambos recorridos
  solo puede usar `README.md` y la documentación enlazada del repositorio; la documentación
  oficial de Node.js u otras fuentes externas no se consulta durante el recorrido, porque los
  requisitos previos ya están instalados. El mantenedor puede preparar los requisitos previos,
  observar y registrar; cualquier explicación o corrección del recorrido invalida el intento.
  Realiza primero el recorrido cronometrado en macOS y después verifica el mismo procedimiento
  en Linux x64, sin límite de 30 minutos. El requisito de conocimiento previo nulo se evalúa
  al comenzar el primer recorrido, no de nuevo en Linux. Este criterio DEBE estar Superado
  antes de integrar. Si falta la persona externa, el criterio queda Pendiente, el pull request
  permanece abierto y no se integra.
- **SC-002**: En un repositorio válido, el 100 % de los comandos de calidad locales finalizan
  con éxito, y el comando agregado lo hace en menos de 10 minutos en el entorno de desarrollo
  de referencia descrito en FR-001a.
- **SC-003**: Para el 100 % de las ocho categorías de calidad (formato, análisis estático y
  límites, tipos, pruebas, construcción, secretos, dependencias y seguridad de workflows), la
  alteración controlada documentada hace fallar el control correspondiente, por la causa
  esperada y en la ubicación esperada, tanto en local como en integración continua. Las
  alteraciones son temporales y controladas, se aplican solo para la verificación y nunca se
  integran en `main`. Queda registrado un enlace a la ejecución fallida de integración continua
  por cada categoría; ningún commit de esas ramas es alcanzable desde `main`; y ninguna rama
  de prueba negativa permanece tras la verificación (FR-012). Si la autorización puntual del
  token sintético no puede concederse, este criterio queda sin superar. El subcaso de secretos
  en un fichero ignorado es una prueba de exclusión positiva, no una novena prueba negativa.
- **SC-004**: Durante la aceptación, en tres intentos consecutivos de pull request sobre el
  mismo SHA y en un par de workflows sobre el mismo SHA de `main`, cada uno de los nueve jobs
  concluye con éxito y dura menos de 15 minutos desde que el ejecutor inicia el job. Un
  timeout o un fallo no excluido reinicia la serie de tres intentos. Una ejecución cancelada
  por `concurrency` no cuenta, ni como éxito ni como intento. Se excluye una
  indisponibilidad general del proveedor solo con enlace a su incidencia pública. Los dos
  workflows de una misma medición DEBEN corresponder al mismo SHA. La ejecución semanal de
  seguridad no es intento de este criterio (FR-015).
- **SC-005**: Diez ejecuciones de `check:test` en una misma máquina, sobre el mismo SHA base
  de aceptación: cinco con red y cinco con la conectividad externa realmente desactivada y
  comprobada. El resultado equivalente comprende el código de salida y los recuentos de
  Vitest. No se exige equivalencia entre macOS y Linux ni se mide `check:build`.
- **SC-006**: La ejecución local y las pruebas se completan con cero secretos reales
  configurados.
- **SC-007**: La detección de secretos sobre todo el historial alcanzable desde el commit
  evaluado reporta cero hallazgos no justificados en el momento de integrar esta
  funcionalidad.
- **SC-008**: Una persona que no ha participado en la implementación, leyendo solo la
  documentación, identifica sin errores trece resultados: cuatro elementos compuestos de capa
  —cada uno exige ubicación y responsabilidad correctas— y los nueve nombres exactos de los
  controles requeridos. La misma persona puede ejecutar SC-001 y SC-008 únicamente en este
  orden: primero SC-001 y después SC-008. Este criterio DEBE estar Superado antes de
  integrar. No se exige conocimiento previo nulo: basta con no haber participado en la
  implementación.
- **SC-009**: Tras la primera ejecución satisfactoria de los controles obligatorios en `main`
  después de integrar esta funcionalidad, el 100 % de ellos queda configurado como requerido en
  la protección de `main` antes de integrar cualquier otro cambio y, en todo caso, antes de
  iniciar la implementación de la primera funcionalidad de producto.

## Assumptions

- El repositorio se aloja en una plataforma que admite pull requests, ejecución automática de
  controles y protección de ramas con controles requeridos. La protección básica de `main` ya
  está activa; añadir los controles requeridos lo realiza un mantenedor con permisos y queda
  fuera del código del repositorio.
- "Requisitos previos" son herramientas de desarrollo de uso general que la documentación
  enumera con sus versiones; su instalación desde cero no cuenta en el tiempo de SC-001.
- Las vulnerabilidades de dependencias de gravedad alta o crítica bloquean; las medias o bajas
  se muestran sin bloquear (FR-017). Cambiar el umbral de gravedad que hace fallar el control
  exige actualizar esta especificación y el ADR correspondiente.
- Esta funcionalidad es la que crea la línea base de integración continua; mientras no exista,
  su propio PR registra las comprobaciones manuales reproducibles realizadas, y en cuanto los
  controles estén disponibles en el PR, DEBE superarlos.
- Se considera funcionalidad crítica según la constitución (seguridad y controles de calidad),
  por lo que sigue el flujo completo de Spec Kit.
- La elección de lenguajes, frameworks, herramientas de calidad y proveedores de integración
  continua corresponde a `/speckit-plan`; las decisiones relevantes se registrarán mediante ADR
  según FR-027.
- Quedan fuera de alcance: carga o procesamiento de PDF, interpretación de normativa,
  generación con IA, gestión de docentes, usuarios o permisos, integración o publicación en
  Moodle, diseño visual definitivo y despliegue en producción.
