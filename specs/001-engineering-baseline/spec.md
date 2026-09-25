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
   un mensaje claro que indica qué valor falta o es inválido, sin revelar valores sensibles.

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

1. **Given** un PR dirigido a `main`, **When** se abre o se actualiza, **Then** se ejecutan
   automáticamente todos los controles obligatorios y su resultado es visible en el PR.
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
  claro, sin mostrar valores sensibles (Escenario 1.3).
- **Versión no soportada de los requisitos previos**: la documentación indica las versiones
  soportadas y el proceso de instalación o arranque advierte de forma clara si no se cumplen.
- **Secreto introducido accidentalmente**: la detección de secretos falla en local, si se
  ejecuta, y en integración continua; la documentación indica cómo proceder, incluida la
  revocación del secreto expuesto.
- **Falso positivo en la detección de secretos**: solo puede excluirse mediante una excepción
  explícita, versionada, justificada y revisable en el PR; nunca desactivando el control.
- **Vulnerabilidad alta o crítica sin corrección disponible**: solo puede aceptarse mediante
  una excepción que cumpla FR-020, con justificación, responsable y fecha de revisión; en otro
  caso el control falla.
- **Vulnerabilidad media o baja**: no hace fallar inicialmente el control, pero queda visible y
  revisable en el resultado de la ejecución.
- **Servicios externos no disponibles**: las pruebas no se ven afectadas porque no dependen de
  ellos; cualquier intento de las pruebas de contactar con un servicio externo real se trata
  como fallo.
- **PR desde una bifurcación o sin acceso a secretos de CI**: los controles obligatorios se
  ejecutan igualmente, porque no requieren secretos.
- **Prueba no determinista**: repetir los controles sobre el mismo commit produce el mismo
  resultado; una prueba con resultado variable se considera defecto de la línea base.
- **Prueba negativa de secretos o dependencias**: se usa un valor sintético con forma de
  secreto y una dependencia controlada con una vulnerabilidad conocida; nunca un secreto real ni
  una dependencia maliciosa no controlada (FR-012).
- **Incidencia que bloquea la integración en `main`** (por ejemplo, un control requerido que
  falla por causas ajenas al cambio): la protección no se desactiva ni se elude; se espera a
  resolver la incidencia o se modifica formalmente la gobernanza antes de continuar.
- **Documentos binarios o normativos**: el repositorio no incluye documentos normativos; si en
  el futuro se añade alguno, debe llevar su registro de procedencia (constitución).

## Requirements *(mandatory)*

### Functional Requirements

**Preparación y ejecución local**

- **FR-001**: El repositorio DEBE incluir documentación que permita, desde un clon limpio,
  instalar dependencias, configurar el entorno y ejecutar la aplicación mínima, indicando los
  requisitos previos y sus versiones soportadas. Los sistemas operativos oficialmente
  soportados son macOS y Linux, y ambos DEBEN verificarse durante la aceptación. Windows solo
  se admite mediante un subsistema Linux, sin verificación oficial, y la documentación DEBE
  indicarlo así.
- **FR-001a**: La documentación DEBE describir el entorno de desarrollo de referencia: el macOS
  del mantenedor, con su versión del sistema, arquitectura, recursos (procesador y memoria) y
  versiones de los requisitos previos. Es el entorno en el que se miden SC-001 y SC-002.
- **FR-002**: El repositorio DEBE incluir una plantilla de configuración local documentada,
  con cada parámetro descrito, sin credenciales ni secretos reales, y con valores de ejemplo
  claramente ficticios cuando sean necesarios.
- **FR-003**: Los ficheros de configuración local con valores reales DEBEN quedar excluidos del
  control de versiones por defecto.
- **FR-004**: La aplicación mínima DEBE poder ejecutarse localmente y ejecutar sus pruebas sin
  ningún secreto real.
- **FR-005**: La aplicación mínima DEBE validar su configuración al arrancar y, ante un valor
  obligatorio ausente o inválido, NO DEBE arrancar y DEBE mostrar un mensaje claro que no
  revele valores sensibles.
- **FR-006**: La aplicación mínima DEBE ser un servicio que ofrezca una comprobación de estado
  consultable por máquina. "Operativa" significa que el servicio arrancó con una configuración
  válida y responde. La comprobación:
  - DEBE devolver un resultado de éxito inequívoco que contenga únicamente el estado y la
    versión;
  - NO DEBE requerir autenticación;
  - NO DEBE exponer detalles internos (rutas, configuración, entorno ni dependencias);
  - DEBE contar con una prueba que verifique el formato de la respuesta y la ausencia de
    cualquier otra información.
- **FR-007**: La aplicación mínima NO DEBE implementar comportamiento funcional de AulaNorma
  (procesamiento de PDF, interpretación normativa, generación con IA, gestión de usuarios o
  permisos, integración con Moodle), NO DEBE incluir persistencia de datos y NO DEBE realizar
  llamadas a servicios externos.
- **FR-008**: La aplicación mínima DEBE emitir registros estructurados de su arranque y de las
  consultas de estado, sin secretos ni datos personales.
- **FR-009**: La línea base NO DEBE incluir interfaz visible para personas. La accesibilidad
  (WCAG 2.2 AA y español claro, principio X) se verificará en la primera funcionalidad que
  incorpore una interfaz.

**Controles de calidad locales**

- **FR-010**: El repositorio DEBE ofrecer un conjunto único y documentado de comandos para
  comprobar, por separado, formato, análisis estático, tipos, pruebas y construcción, y un
  comando agregado que los ejecute todos.
- **FR-011**: Cada comando DEBE terminar con resultado de éxito en un repositorio válido y con
  resultado de fallo ante un incumplimiento de su categoría, indicando la causa y su ubicación.
- **FR-012**: El repositorio DEBE documentar, para cada categoría de calidad, una alteración
  controlada reproducible que demuestre que el control correspondiente falla, con estas reglas:
  - en local, un procedimiento automatizado DEBE aplicar cada alteración sobre una copia
    temporal, comprobar que el control falla y restaurar el estado, sin modificar ficheros
    versionados;
  - en integración continua, la verificación DEBE hacerse con una rama y un pull request en
    borrador por categoría, identificados como pruebas negativas, que se cierran sin integrar;
    sus ramas se eliminan después de registrar los enlaces a las ejecuciones como evidencia;
  - las alteraciones DEBEN usar exclusivamente datos sintéticos y NUNCA secretos reales ni
    dependencias maliciosas no controladas.
- **FR-013**: Las pruebas de la línea base DEBEN ser deterministas y NO DEBEN depender de
  proveedores reales de IA, de Moodle ni de otros servicios externos; las dependencias externas
  futuras se sustituirán por dobles de prueba.
- **FR-014**: La detección de secretos y la comprobación de seguridad de dependencias DEBEN
  poder ejecutarse también en local mediante comandos documentados.

**Integración continua**

- **FR-015**: Los controles obligatorios DEBEN ejecutarse automáticamente en cada PR dirigido a
  `main`, en cada actualización de ese PR y en cada actualización de `main`.
- **FR-016**: La integración continua DEBE ejecutar los mismos controles fundamentales que el
  entorno local (formato, análisis estático, tipos, pruebas y construcción), invocando los
  mismos comandos documentados.
- **FR-017**: La integración continua DEBE incluir detección de secretos y comprobación de
  seguridad de dependencias aplicables. Las vulnerabilidades de gravedad alta o crítica DEBEN
  hacer fallar el control. Las vulnerabilidades de gravedad media o baja DEBEN seguir siendo
  visibles y revisables en el resultado de la ejecución, aunque inicialmente no lo hagan fallar.
  Cualquier excepción DEBE cumplir FR-020.
- **FR-018**: El fallo de cualquier control obligatorio DEBE marcar la ejecución como fallida
  y hacer visible en el PR qué control ha fallado.
- **FR-019**: Los controles obligatorios NO DEBEN requerir secretos para ejecutarse.
- **FR-020**: Las excepciones a la detección de secretos o a la seguridad de dependencias
  DEBEN ser explícitas, versionadas, justificadas y revisables en el PR; NO DEBEN desactivar el
  control completo.
- **FR-021**: La integración continua DEBE ejecutarse con seguridad propia:
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
  - los componentes externos que use la automatización DEBEN estar versionados de forma
    inmutable o trazable;
  - la automatización NO DEBE obtener permisos de escritura, salvo necesidad expresamente
    justificada y documentada.
- **FR-022**: Cada control obligatorio DEBE tener un nombre estable que permita configurarlo
  como requerido en la protección de `main`.

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
  - tras integrar esta funcionalidad y superar los controles obligatorios una vez en `main`,
    DEBEN añadirse inmediatamente como controles requeridos, antes de integrar cualquier otro
    cambio;
  - NO DEBEN permitirse pushes directos ni forzados a `main`, y nadie, incluidos los
    administradores, DEBE poder eludir la protección;
  - mientras haya un único mantenedor, NO se exige la aprobación de otra persona; la revisión
    se documenta con la lista de comprobación constitucional;
  - la protección NO DEBE desactivarse ni eludirse por emergencia: ante una incidencia se
    espera a resolverla o se modifica formalmente la gobernanza antes de continuar.
- **FR-027**: Las decisiones arquitectónicas relevantes DEBEN registrarse mediante ADR: stack
  principal, límites modulares, infraestructura, integración continua, proveedores y
  herramientas de seguridad con consecuencias operativas. No se requiere un ADR por cada
  dependencia o herramienta menor, pero toda dependencia nueva DEBE justificarse en el plan
  conforme a la constitución.
- **FR-028**: El repositorio NO DEBE contener secretos, credenciales, datos personales ni
  documentos normativos sin registro de procedencia.

### Key Entities

- **Plantilla de configuración**: descripción versionada de todos los parámetros de
  configuración local, su propósito, si son obligatorios y un valor de ejemplo ficticio.
- **Control de calidad**: comprobación con nombre estable, categoría, comando local asociado,
  carácter obligatorio u opcional y alteración controlada que lo hace fallar. Hay ocho
  categorías: formato, análisis estático y límites, tipos, pruebas, construcción, secretos,
  dependencias y seguridad de workflows. Puede existir además un control obligatorio de
  verificación de plataforma, que repite controles de categoría en otro sistema operativo sin
  constituir una categoría propia ni requerir una alteración propia.
- **Ejecución de controles**: resultado de ejecutar los controles sobre un commit concreto,
  con el estado de cada control y la causa de cada fallo.
- **Excepción de seguridad**: exclusión explícita de un hallazgo de secretos o dependencias,
  con justificación, responsable y fecha de revisión.
- **Capa**: ubicación del proyecto destinada a una de las cuatro capas de la constitución,
  con su responsabilidad y dependencias permitidas.
- **Estado de la aplicación**: información pública consultable por máquina que confirma que la
  aplicación mínima está operativa; contiene únicamente su estado y su versión.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona sin conocimiento previo del proyecto, partiendo de un clon limpio y
  con los requisitos previos instalados, consigue la confirmación de estado operativo en menos
  de 30 minutos siguiendo solo la documentación, sin ayuda externa, en el entorno de referencia
  (FR-001a); el mismo procedimiento DEBE completarse con éxito también en Linux.
- **SC-002**: En un repositorio válido, el 100 % de los comandos de calidad locales finalizan
  con éxito, y el comando agregado lo hace en menos de 10 minutos en el entorno de desarrollo
  de referencia descrito en FR-001a.
- **SC-003**: Para el 100 % de las ocho categorías de calidad (formato, análisis estático y
  límites, tipos, pruebas, construcción, secretos, dependencias y seguridad de workflows), la
  alteración controlada documentada hace fallar el control correspondiente tanto en local como
  en integración continua. Las alteraciones son temporales y controladas, se aplican solo para
  la verificación y nunca se integran en `main`. Queda registrado un enlace a la ejecución
  fallida de integración continua por cada categoría, y ninguna rama de prueba negativa
  permanece tras la verificación (FR-012).
- **SC-004**: Durante la aceptación, en tres ejecuciones consecutivas de pull request y en una
  ejecución sobre `main`, se activa el 100 % de los controles obligatorios y el resultado está
  disponible en menos de 15 minutos desde que se inicia el ejecutor. Se excluyen de la medición
  las indisponibilidades generales del proveedor de integración continua y las cancelaciones
  manuales. La activación de los controles en todos los PR y actualizaciones de `main` sigue
  garantizada por FR-015.
- **SC-005**: Diez ejecuciones consecutivas de las pruebas sobre el mismo commit, con y sin
  acceso a red externa, producen el mismo resultado.
- **SC-006**: La ejecución local y las pruebas se completan con cero secretos reales
  configurados.
- **SC-007**: La detección de secretos sobre todo el historial del repositorio reporta cero
  hallazgos no justificados en el momento de integrar esta funcionalidad.
- **SC-008**: Un colaborador que solo lee la documentación identifica correctamente la
  ubicación de las cuatro capas y enumera los controles requeridos para `main` sin errores.
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
  se muestran sin bloquear inicialmente (FR-017). Hacer más estricto este criterio en el futuro
  no requiere modificar esta especificación.
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
