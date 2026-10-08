# Feature Specification: Del PDF oficial del BOE al paquete SCORM (piloto UF0517)

**Feature Branch**: `002-boe-scorm-export`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "La aplicación recibirá un PDF oficial del BOE, propondrá un índice basado en su contenido y desarrollará el temario. El docente revisará y aprobará el índice y el contenido antes de exportarlo. La entrega será un paquete SCORM 1.2 descargable, acompañado de instrucciones para que el usuario lo incorpore manualmente a Moodle. La publicación automática mediante servicios web de Moodle, MCP o un plugin queda fuera del alcance. UF0517 es el primer recorrido completo. Sin evaluación calificable en esta entrega."

## Alcance

**Dentro del alcance**:

- Recibir un PDF oficial del BOE, con texto extraíble, con la normativa de un certificado
  profesional y registrar su procedencia.
- Obtener una interpretación estructurada de la unidad formativa del piloto, que el docente
  revisa y valida.
- Proponer un índice del temario basado en el contenido del documento, que el docente revisa y
  aprueba.
- Desarrollar el temario a partir del índice aprobado, y que el docente apruebe su versión.
- Exportar un paquete SCORM 1.2 descargable, con instrucciones para incorporarlo manualmente a
  Moodle.
- UF0517, del certificado ADGG0408, como primer recorrido completo.

**Fuera del alcance**:

- Publicación automática en Moodle: servicios web, MCP o plugin.
- Cualquier conexión de AulaNorma con Moodle y cualquier credencial de Moodle.
- Evaluación calificable dentro del paquete.
- Evaluación pedagógica independiente del temario: no forma parte de esta entrega y no se
  declara realizada.
- El certificado ADGG0408 completo, hasta validar el recorrido de UF0517.
- Actualizar desde AulaNorma un curso ya incorporado a Moodle, y retirar o modificar
  paquetes ya descargados o importados.
- Reconocimiento óptico de caracteres y transcripción manual de páginas sin texto extraíble.
- Edición colaborativa en tiempo real.
- Control del tiempo de conexión del alumnado y cualquier acreditación de la formación o de
  la competencia.
- Cobertura obligatoria del resto del certificado o de la norma, más allá de UF0517.
- Política de retención y borrado para una explotación en producción, y borrado desde la
  interfaz durante el piloto.

## Clarifications

### Session 2026-10-07

Solo la primera entrada responde a una pregunta formal. Las demás son decisiones expresas
del mantenedor, recibidas ese mismo día sin pregunta previa.

- Q: ¿Qué hace el sistema cuando quedan requisitos obligatorios sin cubrir? → A: Permite
  guardar, editar y previsualizar el borrador; impide aprobar el índice y exportar o descargar
  una versión entregable; muestra los requisitos pendientes con su referencia normativa. En
  este piloto no existe ninguna opción de «aprobar de todos modos». La cobertura se contrasta
  con la interpretación normativa revisada y validada; una afirmación del servicio de
  generación de que todo está cubierto no basta.
- Decisión del mantenedor (recorrido completo, SC-024): lo ejecuta un usuario autorizado, que
  puede ser el mantenedor dejando constancia de su rol, con aprobaciones humanas reales del
  índice y del temario. Es una comprobación funcional obligatoria, distinta de una evaluación
  pedagógica independiente, que no se declara realizada.
- Decisión del mantenedor (requisitos obligatorios): son las capacidades, los criterios de
  evaluación y todos los contenidos y subapartados de UF0517 presentes en el documento
  seleccionado, con su jerarquía y sus referencias. No se extienden al resto del certificado
  ni del decreto. La duración normativa es un metadato y una referencia para dimensionar el
  temario; no exige tiempo de conexión ni permite afirmar que completar el paquete acredita
  la formación o la competencia.
- Decisión del mantenedor (validación y cobertura del temario): la validación es una acción
  humana explícita e incluye revisar el inventario contra la sección original de UF0517,
  accesible desde el producto. La cobertura se comprueba también al aprobar el temario: cada
  requisito obligatorio debe estar vinculado a su referencia normativa y a contenido didáctico
  que lo desarrolle; la cita sola no acredita el desarrollo, y su suficiencia la decide el
  docente. La cobertura automática no garantiza que la extracción haya identificado todo lo
  que contiene el BOE. Una omisión conocida se corrige en la interpretación e invalida lo que
  dependa de ella.
- Decisión del mantenedor (edición de un índice aprobado): cualquier edición, incluido
  reordenar o renombrar, invalida su aprobación, todas las aprobaciones de temas y la de la
  versión del temario. Los textos se conservan como borradores, sin borrarse ni volver a
  generarse. La exportación y la descarga quedan bloqueadas hasta completar las nuevas
  aprobaciones.
- Decisión del mantenedor (paquetes anteriores): se conservan con sus registros como
  evidencia, pero no se ofrece su descarga mientras la versión esté invalidada, tampoco
  mediante un enlace antiguo. AulaNorma no puede retirar ficheros descargados ni modificar
  paquetes importados en Moodle; sustituirlos corresponde al usuario y las instrucciones lo
  explican.
- Decisión del mantenedor (límite de coste): al alcanzarlo se detienen las nuevas operaciones
  de generación, los temas terminados se conservan como borradores, se identifican los
  pendientes o fallidos y la generación se muestra incompleta. Una versión incompleta no se
  aprueba ni se exporta. Reanudar exige una acción explícita de un usuario autorizado y
  presupuesto disponible; el límite no se amplía ni se repiten temas terminados de forma
  automática. El mecanismo de control corresponde al plan.
- Decisión del mantenedor (edición simultánea): no hay sobrescrituras silenciosas. Si la
  versión cambió desde que se abrió, el guardado se rechaza, se muestra el conflicto y se
  conservan las modificaciones del usuario para conciliarlas. Sin edición colaborativa en
  tiempo real.
- Decisión del mantenedor (páginas sin texto extraíble): el piloto admite documentos con
  texto extraíble y deja fuera el reconocimiento óptico. Esas páginas se identifican y no se
  descartan en silencio. Si contienen información necesaria de UF0517, la validación se
  bloquea hasta disponer de una fuente legible y procesable. No bloquean si el revisor
  confirma expresamente, con registro, que no contienen información necesaria. No hay
  transcripción manual.
- Decisión del mantenedor (cobertura por jerarquía): cada requisito del inventario necesita
  un vínculo explícito con el índice y con el contenido didáctico correspondiente. Cubrir el
  padre no cubre a sus hijos, ni al revés. Un mismo tema o bloque puede desarrollar varios
  requisitos, sin duplicar textos ni crear un tema por requisito. La jerarquía organiza y
  muestra la cobertura; no la concede por herencia.
- Decisión del mantenedor (administración del presupuesto): el administrador fija y modifica
  el límite de coste del proyecto. El docente autorizado consulta el presupuesto y lanza o
  reanuda generaciones dentro del límite disponible, sin poder aumentarlo. Cada modificación
  registra actor, fecha, valor anterior y valor nuevo, y no inicia ni reanuda ninguna
  generación. Una reducción no cancela operaciones ya enviadas al proveedor; el plan define
  cómo contabilizar y reservar su coste.
- Decisión del mantenedor (documento sustituto): la fuente legible se registra como un
  documento nuevo e inmutable, vinculado al anterior por una relación de sustitución. El
  anterior, su interpretación y sus registros se conservan como histórico. La nueva
  interpretación se obtiene del sustituto y requiere nueva validación; no hereda
  aprobaciones. Los índices y textos anteriores pueden conservarse como borradores, pero sus
  referencias se comprueban contra la nueva fuente antes de volver a aprobarlos. No se
  mezclan páginas de ambos documentos, no se reasignan referencias en silencio y no se inicia
  ninguna generación de pago de forma automática.
- Decisión del mantenedor (conservación durante el piloto): se conservan documentos,
  versiones, paquetes y registros, y no se ofrece borrado desde la interfaz. No establece una
  conservación indefinida para una futura explotación: al cerrar el piloto se decidirá qué
  conservar, exportar o eliminar. La política de retención y borrado para producción queda
  fuera de esta entrega y consta como limitación.
- Decisión del mantenedor (despliegue y acceso): el piloto es una aplicación web en un
  servidor, accesible desde otros equipos con navegador y HTTPS. El formulario y las
  operaciones estrictamente necesarias para iniciar sesión no exigen autenticación previa y
  no conceden acceso a nada más.
- Decisión del mantenedor (periodo del presupuesto y proveedor): el periodo es el ciclo
  completo del proyecto piloto, sin reinicios automáticos, con un límite acumulado y un
  máximo por operación. Una operación de resultado incierto no se trata como si no hubiera
  costado nada. El proveedor real de generación no está seleccionado todavía; la aceptación
  real no se declara con respuestas simuladas.
- Decisión del mantenedor (sesiones y acceso): acceso por HTTPS; las sesiones caducan tras 30
  minutos de inactividad y 12 horas de duración máxima, valores iniciales configurables, y se
  revocan al desactivar una cuenta o cambiar sus permisos.
- Decisión del mantenedor (rechazo): rechazar una interpretación, un índice o un tema conserva
  su contenido como borrador, registra quién lo rechazó y el motivo, y permite corregirlo y
  presentarlo de nuevo a revisión. Lo rechazado no cuenta como aprobado y no se borra ni se
  vuelve a generar de forma automática.
- Decisión del mantenedor (estimación de coste): la estimación y el presupuesto disponible se
  muestran antes de cada solicitud de generación de pago. La estimación se distingue del
  coste máximo reservado; sin una reserva que respete los límites, la operación no se envía.
- Decisión del mantenedor (copia de seguridad): la copia debe ser recuperable y coherente
  entre los datos y los ficheros que referencian, y comprobarse con una restauración que
  verifique referencias y huellas.
- Decisión del mantenedor (contenido activo y firma digital): se rechazan JavaScript, XFA,
  acciones automáticas, lanzamientos y ficheros incrustados. Se admite un campo de firma
  digital pasivo, sin acciones prohibidas, por su estructura y no por el nombre, el origen o
  la huella del documento. Admitirlo no acredita la validez criptográfica de la firma. Ante
  un error, un límite excedido o una estructura que no pueda comprobarse, el resultado es el
  rechazo.
- Decisión del mantenedor (datos del piloto): la procedencia y los resultados específicos de
  UF0517 se mantienen en `specs/002-boe-scorm-export/`. Las pruebas genéricas usan casos
  sintéticos. El documento real se conserva por su huella y su procedencia.
- Decisión del mantenedor (registro de auditoría): ninguna operación del producto, incluidas
  las del administrador, permite modificar ni borrar eventos ya registrados; las correcciones
  son eventos nuevos. Eso no protege frente a quien administre el servidor y modifique los
  ficheros directamente.
- Decisión del mantenedor (datos de usuarios): son los identificadores de cuenta, los
  nombres, los correos si existen, los perfiles y las atribuciones de revisión o aprobación.
  Las contraseñas, las claves y las sesiones son además secretos de autenticación. Es una
  definición operativa, no una evaluación jurídica de protección de datos.
- Decisión del mantenedor (conflicto de edición): ante un conflicto se conserva el cambio del
  usuario, se le muestra que existe una versión más reciente y se le permite revisarla y
  reenviar su cambio de forma explícita contra esa versión. Nada se sobrescribe ni se fusiona
  en silencio.
- Decisión del mantenedor (criterios de éxito pendientes): el saneamiento (FR-020), el cambio
  de proveedor y el registro de cada generación (FR-055) y la ausencia de comportamiento
  específico del piloto (FR-056) reciben un criterio de éxito propio; el envío de datos de
  usuarios al servicio de generación (FR-029) queda cubierto por SC-015, que ya lo incluye.
- Decisión del mantenedor (tema fallido): un tema es fallido cuando la operación termina con
  error o la propuesta no supera el esquema y las comprobaciones obligatorias. El resultado
  inválido no sustituye un borrador válido ni puede aprobarse. En el piloto no hay
  reintentos automáticos: un usuario autorizado puede pedir expresamente otro intento, para
  el que se comprueba y se reserva presupuesto de nuevo; los temas terminados no se repiten
  por sí solos, y una operación incierta conserva su reserva, no se reenvía automáticamente
  y sigue el procedimiento de conciliación.

### Session 2026-10-08

Decisiones expresas del mantenedor sobre los límites de tiempo de la sesión, tomadas al
revisar la accesibilidad (WCAG 2.2.1). No responden a una pregunta formal.

- Decisión del mantenedor (caducidad por inactividad): antes de que una sesión caduque por
  inactividad, la página lo avisa de forma accesible, dos minutos antes, con una acción
  expresa para continuar. La ampliación la decide el servidor, con sesión vigente y
  comprobación de petición falsificada, y admite al menos diez ampliaciones. Ni una consulta
  automática ni una pestaña abierta mantienen la sesión.
- Decisión del mantenedor (duración máxima): se mantiene el máximo de 12 horas por sesión.
  Para seguir trabajando al alcanzarlo, la autenticación se renueva en la propia página con
  la contraseña actual: se crea una sesión nueva y se revoca la anterior. No se prolonga
  ninguna sesión. Se descartan subir el máximo por encima de 20 horas y guardar borradores
  en el navegador.
- Decisión del mantenedor (actividad): una acción rechazada por su origen o por su testigo
  no cuenta como actividad ni se anuncia a otras pestañas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Incorporar el documento oficial y revisar su interpretación (Priority: P1)

Como docente autorizado, subo el PDF oficial del BOE del certificado, veo qué documento ha
quedado registrado y con qué procedencia, y reviso la interpretación de la unidad formativa:
sus capacidades, criterios de evaluación, contenidos y duración, cada uno con su página de
origen. Corrijo lo que esté mal, reviso el inventario de requisitos contra la sección original
de la unidad en el documento y valido la interpretación antes de seguir.

**Why this priority**: todo lo demás se apoya en la fuente y en su interpretación. Sin una
base normativa revisada, ni el índice ni el temario pueden tener procedencia verificable.

**Independent Test**: con el PDF de referencia del piloto, un docente obtiene la
interpretación de UF0517 y comprueba, para una muestra de elementos, que la página y la cita
indicadas coinciden con el documento.

**Acceptance Scenarios**:

1. **Given** un docente autorizado y el PDF oficial del piloto, **When** lo sube, **Then** el
   sistema registra el documento con su procedencia y su huella, y muestra ese registro.
2. **Given** un fichero que no es un PDF válido, o que está cifrado, dañado o contiene
   contenido activo, **When** se sube, **Then** el sistema lo rechaza con un mensaje que
   explica el motivo y no registra nada.
3. **Given** un documento registrado, **When** el docente abre la interpretación de la unidad
   formativa, **Then** cada elemento muestra documento, sección y página, y un acceso directo
   a esa página.
4. **Given** un elemento interpretado de forma incorrecta, **When** el docente lo corrige,
   **Then** la corrección queda registrada y el documento original no cambia.
5. **Given** una interpretación revisada, **When** el docente confirma que ha revisado el
   inventario contra la sección original de la unidad y la valida, **Then** quedan registrados
   el docente, la fecha, la hora, la versión validada y esa confirmación, y la versión fija
   los requisitos obligatorios con los que se contrasta la cobertura.
6. **Given** una interpretación validada, **When** alguien la corrige, **Then** la validación
   deja de ser vigente y, con ella, las aprobaciones del índice, de los temas y de la versión
   del temario que se apoyaban en esa interpretación.
7. **Given** un documento con páginas sin texto extraíble, **When** el docente abre la
   interpretación, **Then** esas páginas aparecen identificadas y la validación está bloqueada
   mientras alguna siga sin resolver.
8. **Given** una página sin texto extraíble que está en blanco o es ajena a la unidad,
   **When** el revisor confirma expresamente que no contiene información necesaria, **Then**
   la decisión queda registrada y esa página deja de bloquear la validación.
9. **Given** el inventario de la unidad, **When** el docente lo consulta, **Then** ve las
   capacidades, los criterios de evaluación y todos los contenidos y subapartados con su
   jerarquía, y la duración normativa aparte, como metadato.
10. **Given** un documento bloqueado por una página necesaria sin texto extraíble, **When**
    se registra una fuente legible como documento sustituto, **Then** el documento anterior,
    su interpretación y sus registros quedan como histórico, la interpretación se obtiene de
    nuevo del sustituto, sin heredar validación ni aprobaciones, y no se inicia ninguna
    generación de forma automática.

---

### User Story 2 - Revisar y aprobar el índice propuesto (Priority: P1)

Como docente autorizado, recibo un índice del temario propuesto a partir del documento. Cada
entrada indica en qué requisito de la norma se apoya, y veo qué requisitos obligatorios quedan
cubiertos y cuáles no. Puedo reordenar, renombrar, añadir y quitar entradas, y apruebo o
rechazo el índice. Mientras quede algún requisito obligatorio sin cubrir puedo seguir
trabajando en el borrador, pero no aprobarlo.

**Why this priority**: el índice decide qué se va a desarrollar. Aprobarlo antes evita generar
y revisar un temario con una estructura que el docente no acepta.

**Independent Test**: a partir de una interpretación validada, el docente obtiene un índice,
comprueba la cobertura de los requisitos obligatorios, lo edita y lo aprueba; el sistema
registra la aprobación.

**Acceptance Scenarios**:

1. **Given** una interpretación validada, **When** el docente pide un índice, **Then** el
   sistema propone uno en el que cada entrada declara los requisitos normativos en los que se
   apoya, con su página, o aparece marcada como «sin respaldo normativo».
2. **Given** un índice propuesto, **When** el docente lo consulta, **Then** ve la lista de
   requisitos obligatorios de la unidad formativa y, para cada uno, si está cubierto o no.
3. **Given** un requisito obligatorio sin cubrir, **When** existen entradas marcadas «sin
   respaldo normativo», **Then** el requisito sigue apareciendo como no cubierto.
4. **Given** un índice en revisión, **When** el docente lo aprueba, **Then** quedan
   registrados el docente, la fecha, la hora y la versión aprobada.
5. **Given** un índice aprobado, **When** alguien lo modifica de cualquier forma, incluido
   reordenar o renombrar, **Then** el índice vuelve a revisión, dejan de ser vigentes su
   aprobación, todas las aprobaciones de temas y la de la versión del temario, los textos se
   conservan como borradores y no se puede exportar ni descargar hasta completar las nuevas
   aprobaciones.
6. **Given** un índice con algún requisito obligatorio sin cubrir, **When** el docente intenta
   aprobarlo, **Then** el sistema lo impide y muestra los requisitos pendientes, cada uno con
   su referencia normativa.
7. **Given** un índice con algún requisito obligatorio sin cubrir, **When** el docente lo
   guarda, lo edita o lo previsualiza, **Then** el sistema lo permite y la vista previa se
   identifica como borrador no entregable.
8. **Given** un índice con algún requisito obligatorio sin cubrir, **When** cualquier usuario
   busca una forma de aprobarlo de todos modos, **Then** no existe ninguna.
9. **Given** una propuesta del servicio de generación que afirma que todos los requisitos
   están cubiertos, **When** falta la entrada que cubre un requisito obligatorio, **Then** la
   cobertura muestra ese requisito como no cubierto y el índice no se puede aprobar.

---

### User Story 3 - Revisar y aprobar el temario desarrollado (Priority: P1)

Como docente autorizado, obtengo el temario desarrollado a partir del índice aprobado. En cada
tema distingo sin esfuerzo lo que exige la norma, con su cita y su página, de lo que se ha
desarrollado como material didáctico. Edito, rechazo o apruebo, y al final apruebo una versión
del temario.

**Why this priority**: es el control humano sobre el contenido. Sin él no puede exportarse
nada.

**Independent Test**: con un índice aprobado, el docente obtiene el temario, comprueba en una
muestra de temas la distinción entre requisito y desarrollo y el acceso a la página de origen,
y aprueba una versión.

**Acceptance Scenarios**:

1. **Given** un índice sin aprobar o con la aprobación invalidada, **When** se intenta
   desarrollar el temario, **Then** el sistema no lo permite e indica por qué.
2. **Given** un tema desarrollado, **When** el docente lo abre, **Then** cada bloque aparece
   identificado como requisito extraído del BOE o como desarrollo didáctico generado.
3. **Given** un bloque identificado como requisito del BOE, **When** el docente usa su acceso
   a la fuente, **Then** llega directamente a la página de origen.
4. **Given** un bloque de desarrollo didáctico, **When** el docente lo consulta, **Then** ve
   en qué requisito de la norma se apoya, o que no tiene respaldo normativo.
5. **Given** un temario completo, con todos sus temas aprobados y cada requisito obligatorio
   vinculado a su referencia normativa y a contenido didáctico que lo desarrolla, **When** el
   docente lo aprueba, **Then** queda registrada una versión aprobada, con docente, fecha y
   hora.
6. **Given** una versión aprobada, **When** se modifica cualquier tema, **Then** la
   aprobación de ese tema y la de la versión dejan de ser válidas para exportar.
7. **Given** un temario en el que un requisito obligatorio aparece citado pero sin contenido
   didáctico vinculado que lo desarrolle, **When** el docente intenta aprobar la versión,
   **Then** el sistema lo impide y muestra el requisito pendiente con su referencia normativa.
8. **Given** una generación que alcanza el límite de coste a mitad del temario, **When** el
   docente consulta el temario, **Then** los temas terminados están como borradores, los
   pendientes o fallidos están identificados, la generación figura como incompleta y la
   versión no se puede aprobar ni exportar.
9. **Given** una generación incompleta, **When** un usuario autorizado la reanuda de forma
   explícita y hay presupuesto disponible, **Then** solo se generan los temas pendientes o
   fallidos.
10. **Given** un tema que otra sesión ha modificado desde que el docente lo abrió, **When** el
    docente intenta guardar, **Then** el guardado se rechaza, se muestra el conflicto y sus
    modificaciones se conservan para conciliarlas.

---

### User Story 4 - Exportar y descargar el paquete con sus instrucciones (Priority: P1)

Como docente autorizado, previsualizo lo que se va a exportar, genero el paquete a partir de
la versión aprobada, lo descargo y recibo las instrucciones para incorporarlo manualmente a
Moodle.

**Why this priority**: el paquete es la entrega. Sin él, el trabajo anterior no llega al
alumnado.

**Independent Test**: con una versión aprobada, el docente descarga el paquete, comprueba su
integridad con la huella mostrada y lo abre sin conexión para ver el temario completo.

**Acceptance Scenarios**:

1. **Given** un índice o un temario sin aprobación vigente, **When** un usuario intenta
   exportar o descargar, por cualquier vía, **Then** el sistema lo deniega.
2. **Given** un usuario sin autorización para exportar, **When** lo intenta, **Then** el
   sistema lo deniega y registra el intento.
3. **Given** una versión aprobada, **When** el docente exporta, **Then** obtiene un paquete
   que identifica esa versión y cuya huella puede comprobar sobre el fichero descargado.
4. **Given** un fallo durante la generación, **When** el docente consulta sus exportaciones,
   **Then** no hay ningún paquete descargable de ese intento y el fallo está registrado.
5. **Given** un paquete descargado, **When** se abre sin conexión a red, **Then** el temario
   se muestra completo, con todos sus recursos.
6. **Given** una descarga, **When** el docente la recibe, **Then** tiene también las
   instrucciones de incorporación manual, que indican en qué versión de Moodle se han
   comprobado, o que todavía no se han comprobado en ninguna.
7. **Given** algún requisito obligatorio sin cubrir en el momento de exportar, **When** un
   usuario intenta exportar o descargar, por cualquier vía, **Then** el sistema lo deniega y
   muestra los requisitos pendientes con su referencia normativa.
8. **Given** un paquete exportado de una versión cuya aprobación se ha invalidado después,
   **When** un usuario intenta descargarlo, también con un enlace obtenido antes, **Then** el
   sistema lo deniega, y el paquete y sus registros siguen consultables como evidencia.

---

### User Story 5 - Recorrer el temario dentro de Moodle (Priority: P2)

Como alumno, abro el temario dentro de Moodle, navego entre los temas, marco los que voy
recorriendo y, si salgo, al volver continúo en el último tema con mi recorrido conservado.
Cuando he marcado todos los temas, pulso «Finalizar» y Moodle registra la actividad como
finalizada.

**Why this priority**: es la comprobación de que el paquete sirve en su destino. Depende de
que existan las historias anteriores y de un Moodle de pruebas.

**Independent Test**: un paquete del piloto, incorporado a un Moodle de pruebas siguiendo solo
las instrucciones, se recorre con un alumno de prueba, se abandona, se reanuda y se finaliza.

**Acceptance Scenarios**:

1. **Given** el paquete incorporado a un Moodle de pruebas, **When** un alumno lo abre,
   **Then** ve el índice y puede navegar entre todos los temas.
2. **Given** un alumno que ha marcado algunos temas y sale, **When** vuelve a entrar en el
   mismo intento, **Then** continúa en el último tema y conserva los temas marcados.
3. **Given** un alumno que no ha marcado todos los temas, **When** busca finalizar, **Then**
   la acción «Finalizar» no está disponible y se le indica qué temas faltan.
4. **Given** un alumno que ha marcado todos los temas, **When** pulsa «Finalizar», **Then**
   Moodle muestra la actividad como finalizada.
5. **Given** la actividad finalizada, **When** el alumno o el docente ven el resultado,
   **Then** no aparece ninguna calificación ni ningún mensaje que presente la finalización
   como prueba de aprendizaje o como acreditación de la formación o de la competencia.

---

### Edge Cases

- El PDF es oficial pero no contiene la unidad formativa del piloto: la interpretación queda
  sin inventario y no puede validarse. Si la contiene repartida en páginas no consecutivas,
  cada requisito conserva su propia página.
- El texto de una página no se puede extraer, por ejemplo por ser una imagen: la página se
  identifica y no se descarta en silencio. Si contiene información necesaria de la unidad, la
  validación queda bloqueada hasta registrar una fuente legible y procesable; si está en
  blanco o es ajena a la unidad, el revisor puede confirmarlo expresamente y queda registrado.
- El documento contiene texto que parece una instrucción para el sistema: se trata como dato y
  no se ejecuta.
- La propuesta de índice o de temario no cumple el formato exigido: se rechaza y se registra,
  sin guardar un resultado parcial.
- El docente quita del índice una entrada que cubría un requisito obligatorio: la cobertura se
  recalcula, el requisito pasa a no cubierto y el índice no puede aprobarse hasta cubrirlo.
- El docente edita un índice ya aprobado sin cambiar la cobertura, por ejemplo reordenando
  entradas: se invalidan igualmente su aprobación, todas las de temas y la de la versión.
- El docente corrige la interpretación después de validarla y aparece un requisito
  obligatorio nuevo: la validación deja de ser vigente y las aprobaciones que se apoyaban en
  ella se invalidan.
- La interpretación validada omite un requisito que sí figura en el documento oficial: el
  sistema no puede detectarlo por sí solo; la revisión del inventario contra la sección
  original es el control que lo evita. Cuando la omisión se conoce, se corrige la
  interpretación; no puede aceptarse como cobertura completa.
- Una entrada del índice cubre un contenido pero no sus subapartados, o al revés: cada
  elemento sin vínculo propio sigue apareciendo como no cubierto.
- Un mismo tema desarrolla varios requisitos: cada uno queda cubierto por su vínculo con ese
  tema, sin duplicar el texto.
- Tras registrar un documento sustituto, un índice o un tema anterior conserva referencias al
  documento sustituido: no puede aprobarse hasta comprobar cada referencia contra la nueva
  fuente.
- El administrador reduce el límite de coste por debajo de lo ya gastado o comprometido: las
  operaciones ya enviadas no se cancelan y no se inicia ninguna nueva.
- Se alcanza el límite de coste de generación a mitad del temario: se detienen las nuevas
  operaciones, se conserva lo terminado como borrador y la versión queda incompleta, sin
  poder aprobarse ni exportarse.
- Dos sesiones, del mismo usuario o de usuarios distintos, editan a la vez el mismo elemento:
  el segundo guardado se rechaza, se muestra el conflicto y no se pierde ninguna de las dos
  modificaciones.
- Se aprueba, se exporta y después se edita: los paquetes ya descargados siguen identificando
  la versión de la que proceden y AulaNorma no puede retirarlos; deja de ofrecer nuevas
  exportaciones y la descarga de los paquetes anteriores, también por enlaces antiguos, hasta
  una nueva aprobación.
- Un paquete ya importado en Moodle procede de una versión después invalidada: AulaNorma no
  puede modificarlo; sustituirlo corresponde al usuario, y las instrucciones lo explican.
- El paquete se abre fuera de una plataforma que guarde el seguimiento: muestra el contenido y
  avisa de que el recorrido no se guardará.
- El recorrido del alumno no cabe en el espacio de seguimiento disponible: el paquete está
  diseñado para que no ocurra con el tamaño máximo de temario admitido.
- El alumno cierra el navegador sin salir de forma ordenada: el paquete guarda el recorrido en
  cada cambio de tema y en cada marca, así que se conserva lo último que la plataforma haya
  aceptado. No se promete más, y lo observado en Moodle se anota en la comprobación manual.
- Se rechaza un tema de un temario ya aprobado en parte: el tema queda como borrador con su
  motivo, y la versión no puede aprobarse hasta que vuelva a revisión y se apruebe.
- Una sesión alcanza su duración máxima mientras el docente edita un tema: unos minutos
  antes la página se lo avisa y le pide la contraseña; al darla, sigue trabajando en la misma
  página, con lo escrito intacto. Si no la da a tiempo, la sesión termina y lo no enviado no
  se guarda.
- El docente renueva la sesión en una pestaña con otra abierta: la otra continúa con la
  sesión nueva sin pedirle la contraseña, y un formulario suyo enviado justo en ese momento
  ni se ejecuta con la sesión anterior ni se pierde.
- Se revoca la sesión, o se desactiva la cuenta, mientras se comprueba la contraseña de una
  renovación: no se renueva nada.
- Se hace una copia de seguridad mientras hay una generación en curso: tras restaurarla, esa
  operación figura como de resultado incierto y sigue contando contra el presupuesto.
- El alumno inicia un intento nuevo en Moodle: el recorrido del intento anterior no se
  traslada.
- Moodle está configurado de un modo distinto del verificado.

## Requirements *(mandatory)*

### Functional Requirements

**Fuente normativa e interpretación**

- **FR-001**: El sistema DEBE aceptar la subida de un PDF oficial y registrarlo con
  identificador interno, título, organismo emisor, referencia oficial, procedencia de
  obtención, fecha de obtención, versión y huella del fichero.
- **FR-002**: El sistema DEBE validar el fichero por su tipo real, su tamaño, su número de
  páginas y su estructura, y rechazar los PDF cifrados, dañados o con contenido activo, con un
  mensaje que explique el motivo. Los límites de tamaño y de páginas son valores configurados
  y se muestran en ese mensaje. Es contenido activo el JavaScript, un formulario XFA, una
  acción automática, una acción de lanzamiento y un fichero incrustado. La comprobación se
  hace sobre la estructura interpretada del documento. Se admite un formulario cuyos campos
  sean todos de firma digital y no tengan acciones; se admite por esa estructura, nunca por
  el nombre, el origen o la huella del documento, y admitirlo NO acredita que la firma sea
  válida. Si la comprobación falla, excede un límite o no puede completarse, el documento
  DEBE rechazarse.
- **FR-003**: El documento registrado NO DEBE modificarse. Las correcciones se registran sobre
  la interpretación. Una fuente que sustituya a otra se registra como un documento nuevo e
  inmutable, vinculado al anterior por una relación de sustitución; el documento anterior, su
  interpretación y sus registros se conservan como histórico.
- **FR-067**: La interpretación de un documento sustituto DEBE obtenerse de ese documento y
  requiere una nueva validación; NO DEBE heredar la validación ni las aprobaciones del
  anterior. El sistema NO DEBE mezclar páginas de ambos documentos ni reasignar en silencio
  las referencias anteriores. Los índices y temas anteriores pueden conservarse como
  borradores, pero NO DEBEN poder aprobarse mientras alguna de sus referencias no se haya
  comprobado contra la nueva fuente. Registrar un documento sustituto NO DEBE iniciar ninguna
  generación. La comprobación la hace un docente autorizado, referencia a referencia, y queda
  registrada.
- **FR-004**: El sistema DEBE obtener el texto del documento página a página y tratarlo como
  dato no confiable: las instrucciones que contenga NO DEBEN ejecutarse.
- **FR-064**: El sistema DEBE identificar y mostrar las páginas sin texto extraíble, y NO DEBE
  descartarlas en silencio. Una página es «sin texto extraíble» cuando su extracción no
  devuelve ningún carácter distinto de espacio; no se aplica ningún umbral de caracteres. El
  sistema DEBE señalar además las páginas que contienen imágenes, tengan texto o no, porque
  pueden llevar contenido que no es texto. Ninguna de las dos señales acredita que el texto
  extraído sea todo el contenido de la página: eso lo cubre la revisión del inventario contra
  la sección original (FR-057). La validación de la interpretación DEBE quedar bloqueada mientras
  alguna de esas páginas siga sin resolver. Una página se resuelve solo cuando el revisor
  confirma expresamente que está en blanco o es ajena a la unidad formativa y que no contiene
  información necesaria para ella; la confirmación registra revisor, fecha, hora y página. Si
  la página contiene información necesaria, el bloqueo se mantiene hasta registrar una fuente
  legible y procesable. El sistema NO DEBE ofrecer reconocimiento óptico ni transcripción
  manual.
- **FR-005**: El sistema DEBE producir una interpretación estructurada de la unidad formativa
  (capacidades, criterios de evaluación, contenidos y duración), en la que cada elemento
  conserve su lugar en la jerarquía, documento, sección y página, y la cita literal cuando
  sea posible.
- **FR-006**: El sistema DEBE construir el **inventario de requisitos obligatorios** de la
  unidad formativa seleccionada: sus capacidades, sus criterios de evaluación y todos sus
  contenidos y subapartados presentes en el documento seleccionado, con su jerarquía. El
  inventario NO DEBE extenderse al resto del certificado ni de la norma.
- **FR-061**: La duración normativa DEBE conservarse como metadato de la unidad formativa, con
  su referencia, y servir de referencia para dimensionar el temario. NO es un requisito de
  cobertura, y ni el producto ni el paquete DEBEN exigir ni medir un tiempo de conexión.
- **FR-007**: El docente DEBE poder revisar y corregir la interpretación; cada corrección
  queda registrada con su autor y su fecha.
- **FR-008**: Desde cualquier elemento, el docente DEBE disponer de un acceso directo y
  verificable a su página de origen.
- **FR-057**: El docente DEBE poder validar la interpretación con una acción explícita, que
  registra docente, fecha, hora y versión validada. La validación DEBE incluir la revisión
  del inventario contra la sección original de la unidad formativa en el documento, accesible
  desde el producto, y DEBE registrar la confirmación expresa de esa revisión. La
  interpretación validada fija el inventario de requisitos obligatorios.
- **FR-065**: Corregir una interpretación validada DEBE dejar sin vigencia esa validación y,
  con ella, las aprobaciones del índice, de los temas y de la versión del temario que se
  apoyen en ella, hasta una nueva validación y nuevas aprobaciones. Una omisión conocida
  respecto al documento oficial NO DEBE poder aceptarse como cobertura completa: se resuelve
  corrigiendo la interpretación, con ese mismo efecto.

**Índice propuesto**

- **FR-009**: El sistema DEBE proponer un índice del temario a partir de la interpretación
  validada y vigente.
- **FR-010**: Cada entrada del índice DEBE declarar el requisito o los requisitos normativos
  en los que se apoya, con su procedencia, o mostrarse marcada como «sin respaldo normativo».
- **FR-011**: El sistema DEBE calcular y mostrar la cobertura de los requisitos obligatorios:
  para cada uno, si alguna entrada del índice lo cubre.
- **FR-012**: Una entrada «sin respaldo normativo» NO DEBE contar como cobertura de ningún
  requisito, y la existencia de esas entradas NO DEBE ocultar ni compensar un requisito
  obligatorio sin cubrir.
- **FR-058**: La cobertura DEBE calcularse contrastando las entradas del índice con el
  inventario de la interpretación validada y vigente, requisito a requisito y mediante
  vínculos explícitos: cubrir un elemento NO cubre los que dependen de él en la jerarquía, ni
  aquel del que depende. Una afirmación del servicio de generación sobre la cobertura NO DEBE
  considerarse evidencia de cobertura ni alterar su resultado. La cobertura NO garantiza que
  la extracción haya identificado todo lo que contiene el documento oficial, y el producto
  DEBE declarar ese límite allí donde la muestre.
  La jerarquía sirve para organizar y mostrar la cobertura; NO la concede por herencia.
- **FR-013**: Mientras quede algún requisito obligatorio sin cubrir, el sistema DEBE permitir
  guardar, editar y previsualizar el borrador, y DEBE impedir aprobar el índice y exportar o
  descargar una versión entregable. DEBE mostrar los requisitos pendientes, cada uno con su
  referencia normativa: documento, sección y página. En este piloto NO DEBE existir ninguna
  opción para aprobar o exportar pese a una cobertura incompleta, para ningún usuario ni por
  ninguna vía.
- **FR-014**: El docente DEBE poder reordenar, renombrar, añadir y quitar entradas del índice,
  y cambiar los requisitos en los que se apoya una entrada; la cobertura se recalcula con cada
  cambio.
- **FR-015**: El índice DEBE tener un ciclo de estados propio (propuesto, en revisión, aprobado
  o rechazado) y una aprobación propia. El rechazo se rige por FR-070.
- **FR-059**: En este piloto, cualquier modificación de un índice aprobado, incluido
  reordenar o renombrar entradas, DEBE devolverlo a revisión e invalidar su aprobación, todas
  las aprobaciones de temas y la aprobación de la versión del temario. Invalidar NO DEBE
  borrar ni volver a generar contenido: los textos se conservan como borradores y las
  aprobaciones invalidadas permanecen en el registro. La exportación y la descarga entregable
  DEBEN quedar bloqueadas hasta completar las nuevas aprobaciones.

**Desarrollo del temario**

- **FR-016**: El temario solo DEBE poder desarrollarse a partir de un índice aprobado y
  vigente.
- **FR-017**: Cada tema DEBE separar de forma explícita los **requisitos extraídos del BOE**,
  con su cita y su página, del **desarrollo didáctico generado**.
- **FR-018**: Cada bloque de desarrollo didáctico DEBE declarar el requisito o los requisitos
  normativos que desarrolla, o mostrarse como «sin respaldo normativo». Un mismo tema o bloque
  puede desarrollar varios requisitos; NO se exige duplicar textos ni un tema por requisito.
- **FR-019**: Toda propuesta de índice o de temario DEBE cumplir un formato definido y
  validarse antes de guardarse. Una propuesta que no lo cumpla se rechaza y se registra; no se
  corrige en silencio. Un tema es **fallido** cuando la operación que lo genera termina con
  error, o cuando su propuesta no supera el esquema o alguna de las comprobaciones
  obligatorias sobre sus referencias. El resultado inválido NO DEBE guardarse como contenido
  del tema, NO DEBE sustituir un borrador válido que el tema ya tuviera y NO DEBE poder
  aprobarse. El docente DEBE ver qué temas son fallidos, distinguidos de los pendientes, y
  el motivo: error de la operación, formato inválido o referencias no admitidas. En este
  piloto NO DEBE haber reintentos automáticos de generación.
- **FR-020**: El contenido de cada tema DEBE sanearse antes de mostrarse o exportarse.
- **FR-021**: Antes de cada solicitud de generación de pago, incluidas la reanudación y
  cualquier nueva generación de un elemento ya generado, el sistema DEBE mostrar la
  estimación de su coste y el presupuesto disponible. La estimación es orientativa y DEBE
  distinguirse del coste máximo que se reserva para la operación; si no puede calcularse una
  reserva que respete el máximo por operación y lo disponible, la operación NO DEBE enviarse.
  Al alcanzar el límite de coste del proyecto, DEBE detener las nuevas operaciones de
  generación, conservar los temas terminados como borradores, identificar los temas pendientes
  o fallidos y mostrar que la generación está incompleta. NO DEBE iniciarse ninguna operación
  sin presupuesto disponible. Una reducción del límite NO cancela las operaciones ya enviadas
  al servicio de generación. El límite del proyecto es acumulado durante todo el piloto, sin
  reinicios automáticos, y existe además un máximo por operación. Una operación cuyo consumo
  no pueda confirmarse DEBE seguir contando contra el presupuesto hasta que el administrador
  la concilie.
- **FR-066**: Reanudar una generación incompleta DEBE exigir una acción explícita de un
  usuario autorizado y presupuesto disponible, y DEBE generar solo los temas pendientes o
  fallidos. El sistema NO DEBE ampliar el límite ni repetir temas terminados por sí solo, y
  modificar el límite NO DEBE iniciar ni reanudar ninguna generación. Un nuevo intento de un
  tema fallido es esa misma acción explícita: para cada operación nueva se comprueba y se
  reserva presupuesto, como para la primera. Una operación de resultado incierto conserva su
  reserva, NO DEBE reenviarse automáticamente y se resuelve por el procedimiento de
  conciliación; su tema queda como fallido mientras tanto.

**Revisión y aprobación**

- **FR-022**: El docente DEBE poder editar, rechazar y aprobar cada tema con acciones
  explícitas, viéndolo junto a su fuente normativa. Un tema solo DEBE poder aprobarse con el
  índice aprobado y vigente.
- **FR-070**: El docente DEBE poder rechazar una interpretación, un índice o un tema. El
  rechazo conserva el contenido como borrador, registra quién lo rechazó, cuándo y el motivo,
  y permite corregirlo y presentarlo de nuevo a revisión. Un elemento rechazado NO cuenta como
  validado ni aprobado, y rechazar NO DEBE borrar contenido ni iniciar ninguna generación.
- **FR-023**: El docente DEBE poder aprobar una **versión del temario**. La aprobación
  registra docente, fecha, hora y la versión exacta aprobada.
- **FR-060**: Una versión del temario solo DEBE poder aprobarse cuando el índice esté aprobado
  y vigente, el temario esté completo, con todos los temas del índice desarrollados y
  aprobados, y cada requisito obligatorio del inventario validado esté vinculado en el
  temario a su referencia normativa y a contenido didáctico que lo desarrolle. La cita
  identifica el requisito; por sí sola NO acredita que esté desarrollado. Si falta algún
  vínculo, el sistema DEBE impedir la aprobación y mostrar los requisitos pendientes con su
  referencia normativa. La suficiencia del desarrollo didáctico la decide el docente tras
  revisarlo.
- **FR-024**: Cualquier modificación posterior de un tema, humana o automática, DEBE invalidar
  la aprobación de ese tema y la de la versión del temario. Las modificaciones del índice y de
  la interpretación se rigen por FR-059 y FR-065.
- **FR-063**: El sistema NO DEBE permitir sobrescrituras silenciosas. Si otro usuario u otra
  sesión ha modificado un elemento desde que se abrió, DEBE rechazar el guardado sobre esa
  versión, mostrar el conflicto y conservar las modificaciones del usuario para que las
  concilie de forma explícita. Ante un conflicto, el sistema DEBE:
  - no guardar nada y decir que existe una versión más reciente del elemento;
  - mostrar esa versión más reciente junto al cambio que el usuario intentó guardar, que
    sigue en el formulario tal como lo envió;
  - permitir al usuario revisarla y reenviar su cambio de forma explícita contra esa versión,
    o descartarlo.

  El sistema NO DEBE fusionar los dos cambios ni reenviar el del usuario por su cuenta. Lo
  mismo se aplica a validar, aprobar o rechazar: si el elemento cambió desde que se abrió, la
  decisión se rechaza y el usuario debe revisar la versión más reciente antes de repetirla.
- **FR-025**: NO DEBE existir ninguna vía que permita aprobar, exportar o descargar sin los
  pasos anteriores.

**Acceso y autorización**

- **FR-026**: Subir documentos, revisar, aprobar, exportar y descargar DEBEN exigir un usuario
  identificado y autorizado para esa acción, comprobado por el sistema y con denegación por
  defecto. El piloto se usa desde un navegador y solo por HTTPS. Solo el formulario de
  entrada y su envío son accesibles sin sesión, y no conceden acceso a nada más.
- **FR-068**: Una sesión DEBE caducar tras un periodo de inactividad y tras una duración
  máxima, ambos configurables, con 30 minutos y 12 horas como valores iniciales. DEBE
  revocarse al cerrar sesión, al cambiar la contraseña, al desactivar la cuenta y al cambiar
  sus permisos; un cambio de permisos se aplica desde la siguiente petición. La entrada DEBE
  protegerse frente a intentos repetidos y frente a peticiones falsificadas, y su mensaje de
  error NO DEBE revelar si una cuenta existe.
- **FR-071**: Antes de que una sesión caduque por inactividad, cada página con sesión DEBE
  avisarlo de forma accesible, al menos dos minutos antes o a la mitad del periodo si este es
  más corto, y ofrecer una acción expresa para continuar. La ampliación DEBE decidirla el
  servidor, exigir origen propio, una sesión vigente y su testigo, y poder repetirse al menos
  diez veces mientras lo permita la duración máxima. NO DEBE revivir una sesión caducada o
  revocada ni retrasar la duración máxima. Ninguna consulta automática ni la mera presencia
  de una pestaña abierta DEBEN mantener viva una sesión. Una acción rechazada por su origen
  o por su testigo NO DEBE contar como actividad.
- **FR-072**: Al acercarse la duración máxima, la página DEBE ofrecer renovar la
  autenticación sin salir de ella. La renovación DEBE exigir origen propio, una sesión
  todavía vigente, su testigo y la contraseña actual, con el mismo control de intentos que
  la entrada. Si es correcta, DEBE crear una sesión nueva, con otro identificador, otro
  testigo y su propia duración máxima, y revocar la anterior, las dos cosas o ninguna. NO
  DEBE renovarse una sesión caducada, revocada, de una cuenta desactivada o cuya contraseña
  o permisos hayan cambiado, tampoco si eso ocurre mientras se comprueba la contraseña. La
  sesión anterior NO DEBE volver a servir por ninguna vía. El resultado DEBE registrarse sin
  contraseñas, identificadores de sesión ni testigos.
- **FR-073**: Tras una renovación, los formularios abiertos, también en otras pestañas,
  DEBEN poder continuar con la sesión nueva sin recargar la página ni perder lo escrito, y
  sin que el navegador guarde contraseñas, identificadores de sesión ni testigos fuera de la
  memoria de la página. Una petición que llegue con la sesión o el testigo anteriores a la
  renovación NO DEBE ejecutarse ni hacer perder la sesión nueva, y lo enviado DEBE poder
  repetirse con ella. La caducidad del formulario de entrada NO DEBE obligar a repetir lo
  escrito. Lo que de esto dependa de la ejecución de scripts en el navegador DEBE estar
  documentado.
- **FR-027**: La capacidad de aprobar y la de exportar DEBEN poder concederse solo a docentes
  autorizados, y un usuario sin esa capacidad NO DEBE poder ejercerla por ninguna vía. Solo el
  administrador DEBE poder fijar y modificar el límite de coste del proyecto; el docente
  autorizado puede consultar el presupuesto y lanzar o reanudar generaciones dentro del
  límite disponible, pero NO aumentarlo.
- **FR-028**: Las subidas, correcciones, aprobaciones, rechazos, exportaciones, descargas y los
  intentos denegados DEBEN quedar en un registro que no pueda alterarse, igual que los inicios
  de sesión, sus intentos fallidos y los cambios de permisos. Cada modificación del límite de
  coste DEBE registrarse con actor, fecha, valor anterior y valor nuevo. «Que no pueda
  alterarse» significa que ninguna operación del producto, con ningún perfil, incluido el
  administrador, modifica ni borra un evento ya registrado; una corrección se registra como
  un evento nuevo. Esta protección es de la aplicación: NO cubre a quien administre el
  servidor y modifique directamente los ficheros.
- **FR-029**: NO DEBEN enviarse datos de usuarios ni secretos de autenticación al servicio de
  generación. Las referencias y los metadatos publicados en el documento normativo no son
  datos de usuarios.

**Exportación y descarga**

- **FR-030**: El sistema DEBE exportar el temario aprobado como un paquete SCORM 1.2
  descargable.
- **FR-031**: Un paquete solo DEBE poder generarse y descargarse a partir de una
  interpretación validada, un índice aprobado y una versión aprobada del temario, todos
  vigentes, y con la cobertura de los requisitos obligatorios completa en el momento de
  exportar.
- **FR-032**: El paquete DEBE incluir todos los recursos de su contenido y NO DEBE depender de
  AulaNorma ni hacer peticiones a servicios externos. La comunicación con la plataforma que lo
  ejecuta, para guardar el seguimiento, está permitida y es necesaria.
- **FR-033**: El paquete NO DEBE contener datos de usuarios ni secretos de autenticación. Los
  registros internos conservan la identificación necesaria para la auditoría, con acceso
  autorizado, y no forman parte del paquete.
- **FR-034**: El paquete DEBE identificar la versión aprobada de la que procede.
- **FR-035**: El sistema DEBE registrar la huella del fichero entregado y mostrarla, para que
  pueda comprobarse su integridad tras la descarga.
- **FR-036**: Exportar de nuevo la misma versión aprobada DEBE producir un paquete con el
  mismo contenido aprobado y una estructura equivalente. No se exige que dos ficheros
  generados por separado sean idénticos byte a byte.
- **FR-037**: El paquete DEBE validarse antes de ofrecerse. Un paquete inválido o incompleto
  NO DEBE poder descargarse, y un fallo de generación NO DEBE dejar un paquete parcial.
- **FR-038**: El docente DEBE poder previsualizar lo que se va a exportar. La vista previa
  DEBE indicar que muestra el contenido, pero que no acredita que el seguimiento se guarde. La
  vista previa de un borrador sin aprobación vigente o con cobertura incompleta DEBE
  identificarse como borrador no entregable y NO DEBE producir un fichero descargable.
- **FR-039**: Cada exportación y cada descarga DEBEN registrarse con la versión aprobada, la
  huella, el docente y el resultado.
- **FR-062**: La vigencia de las aprobaciones DEBE comprobarse en cada descarga. Mientras la
  versión de un paquete esté invalidada, el sistema NO DEBE ofrecer ni permitir su descarga
  por ninguna vía, tampoco mediante un enlace obtenido antes de la invalidación.
- **FR-040**: Cada descarga DEBE ir acompañada de instrucciones para incorporar el paquete
  manualmente a Moodle, escritas para un docente y paso a paso. Las instrucciones DEBEN
  explicar que AulaNorma no puede retirar ficheros ya descargados ni modificar paquetes ya
  importados en Moodle, y que sustituirlos por una versión posterior corresponde al usuario.
- **FR-041**: Las instrucciones y cualquier otro texto del producto DEBEN nombrar como
  compatibles solo las versiones y configuraciones de Moodle verificadas, y decirlo
  expresamente mientras no se haya verificado ninguna.

**Comportamiento del paquete**

- **FR-042**: El paquete DEBE ser una única unidad de contenido, con navegación interna entre
  temas: índice, tema anterior y tema siguiente.
- **FR-043**: El paquete DEBE conservar y mostrar, en cada tema, la distinción entre
  requisitos extraídos del BOE y desarrollo didáctico, con la procedencia de cada requisito.
- **FR-044**: El alumno DEBE poder marcar cada tema como recorrido.
- **FR-045**: La acción «Finalizar» solo DEBE estar disponible cuando todos los temas estén
  marcados. Al pulsarla, el paquete comunica a la plataforma el estado de finalización.
- **FR-046**: El paquete NO DEBE comunicar puntuación ni superación, y ni el paquete ni la
  documentación DEBEN presentar la finalización como prueba de aprendizaje, como calificación
  ni como acreditación de la formación o de la competencia.
- **FR-047**: Al volver a entrar en el mismo intento, el paquete DEBE reanudar en el último
  tema visitado y conservar los temas marcados.
- **FR-048**: El estado de seguimiento DEBE ser compacto y caber en los límites de SCORM 1.2
  para el tamaño máximo de temario admitido, que DEBE estar definido y comprobarse al
  exportar.
- **FR-049**: Si el paquete se abre donde no puede guardar el seguimiento, DEBE mostrar el
  contenido y avisar de que el recorrido no se conservará.
- **FR-050**: El contenido exportado y la interfaz docente DEBEN cumplir WCAG 2.2 nivel AA; en
  particular, jerarquía de encabezados, texto alternativo, contraste, información que no
  dependa solo del color y navegación con teclado.
- **FR-051**: La documentación NO DEBE prometer porcentajes ni detalle por tema en los
  informes de Moodle: Moodle recibe el estado de finalización.

**Necesidades funcionales de persistencia, identidad y generación**

La base de ingeniería no tiene todavía almacenamiento, usuarios ni servicio de generación.
Esta funcionalidad los necesita; su elección técnica corresponde al plan.

- **FR-052**: El sistema DEBE conservar de forma duradera los documentos registrados, la
  interpretación y sus correcciones, los índices, los temas, sus versiones, las aprobaciones y
  los registros de exportación y descarga. Durante el piloto NO DEBE ofrecerse su borrado
  desde la interfaz.
- **FR-069**: DEBE poder obtenerse, sin detener el servicio, una copia de seguridad coherente
  de los datos y de todos los ficheros que referencian, y el servicio DEBE poder recuperarse
  a partir de ella. Una restauración DEBE comprobar que cada referencia tiene su fichero y
  que su huella coincide. Tras restaurar, toda operación que estuviera en curso al hacer la
  copia DEBE quedar en un estado definido: las generaciones enviadas, como de resultado
  incierto, y las sesiones, revocadas.
- **FR-053**: El sistema DEBE conservar las versiones aprobadas, los paquetes exportados y sus
  registros, también cuando la aprobación deje de ser vigente, como evidencia de lo exportado.
  Una versión solo DEBE poder exportarse de nuevo mientras su aprobación siga vigente.
- **FR-054**: El sistema DEBE identificar a cada usuario que actúa y distinguir, al menos, al
  administrador, al docente autorizado para aprobar y exportar y a quien no tiene esas
  capacidades.
- **FR-055**: La generación de propuestas DEBE poder cambiar de proveedor sin cambiar el
  comportamiento descrito aquí, y cada generación DEBE registrar con qué se hizo, su coste
  estimado y si su resultado fue válido.
- **FR-056**: Todo lo específico de UF0517 y de ADGG0408 DEBE residir en los datos y en las
  pruebas, no en el comportamiento del sistema, que DEBE servir para otra unidad formativa.

### Key Entities

- **Documento oficial**: el PDF del BOE, inmutable, con su procedencia y su huella. Puede
  sustituir a otro documento, que se conserva como histórico.
- **Presupuesto**: el límite de coste del proyecto, lo gastado y lo disponible, con el
  registro de sus modificaciones.
- **Requisito normativo**: un elemento de la interpretación (capacidad, criterio de
  evaluación, contenido o subapartado) con su lugar en la jerarquía, documento, sección,
  página y cita.
- **Interpretación**: el conjunto de requisitos de la unidad formativa, con las correcciones
  del docente y la duración normativa como metadato. Tiene una validación propia.
- **Inventario de requisitos obligatorios**: las capacidades, los criterios de evaluación y
  todos los contenidos y subapartados de la unidad formativa; lo fija la validación.
- **Página sin texto extraíble**: una página identificada como tal, con su resolución
  registrada cuando el revisor confirma que no es necesaria para la unidad.
- **Índice**: la estructura propuesta del temario; sus entradas se apoyan en requisitos o
  están marcadas «sin respaldo normativo». Tiene estados y aprobación propios.
- **Cobertura**: la relación entre cada requisito del inventario validado y las entradas del
  índice que lo cubren y, en el temario, el contenido didáctico que lo desarrolla. La calcula
  el sistema; no la declara el servicio de generación.
- **Generación**: una operación de desarrollo del temario, con su coste y su estado, que puede
  quedar incompleta, con temas pendientes o fallidos.
- **Tema**: una unidad del temario, formada por bloques de requisito y bloques de desarrollo
  didáctico. Antes de tener contenido está pendiente; es fallido si su generación terminó con
  error o con una propuesta inválida (FR-019).
- **Versión del temario**: el conjunto de temas y el índice en un momento dado; es lo que se
  aprueba y lo que se exporta.
- **Aprobación**: quién aprobó qué y cuándo. Hay aprobación del índice, de cada tema y de la
  versión del temario; se invalidan si cambia lo aprobado o aquello en lo que se apoya (la
  interpretación validada o el índice aprobado), y permanecen en el registro.
- **Exportación**: un paquete generado a partir de una versión aprobada, con su huella, y sus
  descargas. Se conserva como evidencia aunque deje de ofrecerse.
- **Datos de usuarios**: identificadores de cuenta, nombres, correos si existen, perfiles y
  atribuciones de revisión o aprobación. Las contraseñas, las claves y las sesiones son
  además **secretos de autenticación**. No lo son las referencias ni los metadatos publicados
  en el documento normativo. Es una definición operativa de esta especificación, no una
  evaluación jurídica de protección de datos.
- **Estado de seguimiento**: dentro del paquete y de la plataforma que lo ejecuta, los temas
  marcados, el último tema visitado y la finalización. No pertenece a AulaNorma.
- **Verificación de importación**: la evidencia de una comprobación manual en un Moodle de
  pruebas, con la versión y la configuración exactas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Generación**

- **SC-001**: Con el PDF de referencia del piloto, el 100 % de las entradas del índice
  propuesto declaran un requisito normativo con su página o están marcadas «sin respaldo
  normativo»; ninguna queda sin clasificar.
- **SC-002**: El 100 % de los requisitos del inventario validado de UF0517 (capacidades,
  criterios de evaluación, contenidos y subapartados) aparecen en la cobertura, cada uno por
  separado, como cubiertos o como no cubiertos, y ninguno figura como cubierto solo por
  entradas «sin respaldo normativo» ni por la cobertura de otro elemento de la jerarquía.
- **SC-003**: En el 100 % de los temas, cada bloque está identificado como requisito del BOE o
  como desarrollo didáctico.
- **SC-004**: En el 100 % de los bloques identificados como requisito del BOE, la página
  indicada existe y la cita coincide con el texto de esa página.
- **SC-005**: El 100 % de las propuestas que no cumplen el formato exigido se rechazan y
  quedan registradas, sin guardarse. En una prueba preparada con operaciones que terminan
  con error, con formato inválido y con referencias no admitidas, el 100 % de esos temas
  figuran como fallidos con su motivo, ninguno conserva el resultado inválido, ninguno puede
  aprobarse, un borrador válido anterior sigue intacto y el servicio de generación recibe
  exactamente una operación por tema: ningún reintento automático.
- **SC-044**: El 100 % de las generaciones registradas indican el proveedor, el modelo, la
  versión del prompt, el coste estimado y si el resultado fue válido. Todos los adaptadores
  de generación disponibles superan el mismo conjunto de pruebas de contrato, y sustituir
  uno por otro no exige cambiar ningún módulo de dominio.
- **SC-045**: Una comprobación automática no encuentra los códigos del certificado ni de la
  unidad formativa del piloto en el código del producto ni en sus pruebas genéricas, y las
  pruebas automáticas del recorrido se ejecutan con una unidad sintética distinta de la del
  piloto.
- **SC-046**: Con un tema de prueba cuyo texto contiene marcado HTML y código de script, el
  100 % de las vistas del producto y el paquete exportado lo muestran como texto literal:
  ninguna contiene un elemento activo procedente de ese texto.
- **SC-032**: Al alcanzar el límite de coste en una prueba preparada, no se inicia ninguna
  operación de generación más, los temas terminados siguen disponibles como borradores, los
  pendientes o fallidos están identificados y la versión no puede aprobarse ni exportarse. Al
  reanudar de forma explícita con presupuesto disponible, no se repite ningún tema terminado,
  cada operación nueva tiene su propia reserva y ninguna operación de resultado incierto se
  reenvía: sigue contando hasta su conciliación.
  Antes del 100 % de las solicitudes de generación se muestran la estimación y el presupuesto
  disponible, y ninguna operación se envía sin una reserva dentro de los límites.
- **SC-039**: Una sesión deja de servir en el 100 % de los casos tras el periodo de
  inactividad, tras la duración máxima, al cerrarla, al cambiar la contraseña, al desactivar
  la cuenta y al cambiar sus permisos. Sin sesión, solo responde la entrada, que no devuelve
  ningún dato de producto. En el piloto desplegado, ninguna operación responde sin HTTPS.
- **SC-047**: En una prueba con el reloj controlado, el aviso de inactividad aparece antes de
  la caducidad y recibe el foco; la sesión puede ampliarse más de diez veces seguidas sin
  otra actividad; sin ampliarla caduca a su hora en el 100 % de los casos, y ninguna petición
  sale de la página sin una acción del usuario. Una ampliación rechazada por su origen o su
  testigo no retrasa la caducidad.
- **SC-048**: Una renovación con la contraseña correcta sustituye la sesión y permite enviar,
  sin recargar, lo que estaba escrito, en esa pestaña y en otra. En el 100 % de los casos
  probados (contraseña incorrecta, bloqueo por intentos, caducidad o revocación durante la
  comprobación, cuenta desactivada, permisos cambiados, dos renovaciones a la vez y fallo
  interno) no queda más de una sesión nueva ni vuelve a servir la anterior, y ni el registro
  ni el almacenamiento del navegador contienen contraseñas, identificadores de sesión ni
  testigos.
- **SC-040**: Una copia de seguridad hecha con operaciones en curso se restaura en un entorno
  limpio: el servicio arranca, el 100 % de las referencias tienen su fichero con la huella
  correcta, las generaciones que estaban enviadas figuran como inciertas y ninguna sesión
  anterior sirve.
- **SC-042**: El 100 % de los documentos de prueba con JavaScript, XFA, acción automática,
  lanzamiento o fichero incrustado se rechazan, también cuando esa estructura está en un
  flujo de objetos, tras una referencia indirecta o en una actualización incremental. El
  documento con un campo de firma pasivo se acepta, y deja de aceptarse al añadirle una
  acción prohibida. Todo error, límite excedido o estructura no comprobable acaba en rechazo.
  Tras cualquier comprobación, el fichero original conserva su huella.
- **SC-043**: Tras ejercitar todas las operaciones del producto con todos los perfiles,
  incluido el administrador, el 100 % de los eventos registrados antes conservan su
  contenido y ninguno ha desaparecido; los intentos de modificar o borrar un evento se
  rechazan, y cada corrección aparece como un evento nuevo.
- **SC-041**: Tras rechazar una interpretación, un índice o un tema, en el 100 % de los casos
  el contenido sigue disponible como borrador, constan quién lo rechazó, cuándo y el motivo,
  no se ha iniciado ninguna generación, y la versión del temario no puede aprobarse ni
  exportarse hasta que el elemento vuelva a revisión y se apruebe.
- **SC-037**: El 100 % de los intentos de un docente de aumentar el límite de coste se
  deniegan; cada modificación hecha por el administrador muestra actor, fecha, valor anterior
  y valor nuevo, y ninguna inicia ni reanuda una generación.
- **SC-038**: Tras registrar un documento sustituto en una prueba preparada, el documento
  anterior y su interpretación siguen consultables como histórico, la nueva interpretación
  no tiene validación ni aprobaciones, ninguna referencia mezcla páginas de ambos documentos,
  ningún índice o tema anterior puede aprobarse con referencias sin comprobar y no se ha
  iniciado ninguna generación.
- **SC-034**: El 100 % de las páginas cuya extracción no devuelve ningún carácter distinto de
  espacio aparecen identificadas como sin texto extraíble, y el 100 % de las páginas con
  imágenes aparecen señaladas; la validación se deniega mientras alguna página sin texto siga
  sin resolver, y cada resolución consultable muestra revisor, fecha, hora y página.

**Revisión**

- **SC-006**: En el 100 % de los intentos de exportar o descargar sin una aprobación vigente
  del índice y del temario, por cualquier vía, el sistema lo deniega.
- **SC-007**: En el 100 % de los intentos de aprobar o exportar con un usuario no autorizado,
  el sistema lo deniega y lo registra.
- **SC-008**: Tras modificar un tema aprobado, en el 100 % de los casos la aprobación de ese
  tema y la de la versión del temario dejan de ser vigentes y la exportación se deniega hasta
  nuevas aprobaciones.
- **SC-025**: Con al menos un requisito obligatorio sin cubrir, el 100 % de los intentos de
  aprobar el índice, aprobar la versión del temario, exportar o descargar se deniegan, por
  cualquier vía y con cualquier usuario, y cada denegación muestra los requisitos pendientes
  con su documento, sección y página. En ese mismo estado, guardar, editar y previsualizar el
  borrador siguen disponibles.
- **SC-026**: Una revisión de todas las vías de aprobación y exportación no encuentra ninguna
  que acepte una cobertura incompleta.
- **SC-027**: Ante una propuesta de prueba que declara cubiertos todos los requisitos y omite
  la entrada de uno obligatorio, la cobertura muestra ese requisito como no cubierto y el
  índice no puede aprobarse.
- **SC-028**: Para cada tipo de modificación de un índice aprobado (reordenar, renombrar,
  añadir, quitar y cambiar los requisitos de una entrada), en el 100 % de los casos el índice
  vuelve a revisión, dejan de ser vigentes su aprobación, todas las aprobaciones de temas y
  la de la versión del temario, y la exportación y la descarga se deniegan hasta completar
  las nuevas aprobaciones. Ningún texto se borra ni se vuelve a generar, y las aprobaciones
  invalidadas siguen consultables en el registro.
- **SC-029**: Tras corregir una interpretación validada, en el 100 % de los casos dejan de ser
  vigentes la validación y las aprobaciones del índice, de los temas y de la versión del
  temario que se apoyaban en ella, y la exportación y la descarga se deniegan.
- **SC-035**: Con un requisito obligatorio citado en el temario pero sin contenido didáctico
  vinculado que lo desarrolle, o con algún tema sin desarrollar o sin aprobar, el 100 % de
  los intentos de aprobar la versión se deniegan y muestran lo pendiente.
- **SC-036**: El 100 % de las validaciones registradas incluyen la confirmación de la revisión
  del inventario contra la sección original de la unidad, y no es posible validar sin ella.
- **SC-033**: En una prueba con dos sesiones que modifican el mismo elemento, el segundo
  guardado se rechaza en el 100 % de los casos, se muestra el conflicto y las modificaciones
  de ambas sesiones siguen disponibles: la primera, guardada como versión más reciente y
  mostrada al segundo usuario; la segunda, en su formulario, sin guardar. El cambio del
  segundo usuario solo se guarda si lo reenvía de forma explícita contra la versión más
  reciente, y en ningún caso el sistema fusiona los dos cambios.
- **SC-009**: Desde el 100 % de los requisitos mostrados, el acceso a la fuente lleva
  directamente a la página registrada.
- **SC-010**: Cada validación y cada aprobación consultables muestran docente, fecha, hora y
  versión validada o aprobada.

**Descarga**

- **SC-011**: El 100 % de los paquetes ofrecidos para descarga superan la validación de
  estructura del formato, y todos los recursos que declaran están dentro del paquete.
- **SC-012**: Abierto sin conexión a red, el paquete del piloto muestra el temario completo
  sin intentar ninguna comunicación externa.
- **SC-013**: La huella calculada sobre el fichero descargado coincide con la registrada en el
  100 % de las descargas comprobadas.
- **SC-014**: Dos exportaciones de la misma versión aprobada contienen el mismo contenido
  aprobado, con la misma estructura de temas, y ambas identifican esa versión.
- **SC-015**: Una revisión del paquete del piloto no encuentra ningún dato de usuarios
  (identificadores de cuenta, nombres, correos, perfiles ni atribuciones de revisión o
  aprobación) ni ningún secreto de autenticación, y una revisión de las entradas enviadas al
  servicio de generación tampoco.
- **SC-016**: Tras un fallo de generación provocado, no queda ningún paquete descargable de
  ese intento.
- **SC-031**: Tras invalidar la aprobación de una versión ya exportada, el 100 % de los
  intentos de descargar sus paquetes desde AulaNorma se deniegan, incluidos los que usan un
  enlace obtenido antes, y los paquetes y sus registros siguen consultables como evidencia.
  La interfaz del piloto no ofrece ninguna acción para borrar documentos, versiones, paquetes
  ni registros.
- **SC-030**: Una revisión del paquete del piloto, de las instrucciones y de los textos del
  producto no encuentra ninguna exigencia ni medición de tiempo de conexión, ni ninguna
  afirmación de que completar el paquete acredita la formación o la competencia. Las
  instrucciones explican que sustituir un paquete ya importado corresponde al usuario.
- **SC-017**: En una comprobación automática contra un sustituto de la plataforma, el paquete
  inicia la sesión, guarda los temas marcados y el último tema, los recupera al reanudar,
  comunica la finalización solo tras «Finalizar» y cierra la sesión.

**Importación en Moodle**

Comprobación manual, reproducible, en un Moodle real de pruebas. Puede hacerla el mantenedor.
Hasta superarla, no se declara ninguna compatibilidad.

- **SC-018**: Siguiendo solo las instrucciones entregadas, el paquete del piloto se incorpora
  a un Moodle de pruebas sin errores.
- **SC-019**: Un alumno de prueba navega por el 100 % de los temas y ve en ellos la distinción
  entre requisitos del BOE y desarrollo didáctico.
- **SC-020**: Tras marcar parte de los temas y salir, al volver a entrar en el mismo intento
  se reanuda en el último tema y se conservan los temas marcados.
- **SC-021**: Tras marcar todos los temas y pulsar «Finalizar», Moodle muestra la actividad
  como finalizada, sin calificación.
- **SC-022**: Durante el recorrido no se observa ninguna comunicación con servidores distintos
  del Moodle de pruebas.
- **SC-023**: La evidencia de la comprobación registra la versión exacta de Moodle, su
  configuración relevante, la fecha, la huella del paquete y el resultado de cada paso, y las
  instrucciones nombran únicamente lo verificado.

**Recorrido completo**

- **SC-024**: Un usuario autorizado completa el recorrido funcional de UF0517 de extremo a
  extremo (subir el PDF, revisar y validar la interpretación, aprobar el índice, aprobar la
  versión del temario, exportar y descargar el paquete) usando solo las funciones del producto
  y las instrucciones entregadas, sin modificar datos ni código al margen del producto durante
  el recorrido. Puede ejecutarlo el mantenedor como usuario autorizado; la evidencia registra
  quién lo ejecutó y con qué rol. Las aprobaciones del índice y del temario son decisiones
  humanas reales, tomadas tras revisar el contenido, no simuladas ni automatizadas. Este
  criterio es obligatorio y acredita el funcionamiento del recorrido, no una evaluación
  pedagógica independiente del temario. Se ejecuta con el proveedor real de generación: un
  recorrido con respuestas simuladas no lo acredita.

## Assumptions

- **Constitución**: esta especificación se redacta contra la versión 2.0.0 de la
  constitución, integrada en `main` el 2026-10-07.
- **Rama**: `002-boe-scorm-export`. El directorio de la especificación es
  `specs/002-boe-scorm-export`.
- **SCORM 1.2** figura aquí porque es el formato de entrega decidido por el mantenedor, no una
  elección de implementación: es lo que el usuario recibe e incorpora a Moodle.
- **Usuarios**: en el piloto hay un administrador, docentes autorizados y, al menos, una cuenta
  sin capacidad de aprobar ni exportar. Una misma persona puede tener más de un perfil. El
  alumnado no es usuario de AulaNorma: solo usa el paquete dentro de Moodle.
- **Despliegue**: el piloto se usa desde otros equipos, con navegador y HTTPS, en un único
  servidor y con una única instancia de la aplicación. El dominio y el destino se concretan
  antes del despliegue. Los mecanismos (proxy, almacenamiento, procedimiento de copia) son
  del plan; lo que debe cumplirse está en FR-026, FR-068 y FR-069.
- **Proveedor de generación**: no está seleccionado. Proveedor, modelo, moneda y presupuesto
  real se concretan antes de implementar y ejecutar la integración real.
- **Persistencia, identidad y generación**: la base de ingeniería no tiene almacenamiento,
  usuarios ni servicio de generación. Sus necesidades funcionales están en FR-052 a FR-055; la
  elección técnica y sus decisiones arquitectónicas corresponden al plan.
- **Documento del piloto**: el PDF oficial de ADGG0408 se incorpora con su procedencia
  registrada antes de usarse como referencia en las pruebas.
- **Tamaño del temario**: una unidad formativa cabe en un único paquete y su recorrido cabe en
  el espacio de seguimiento del formato; el máximo admitido se fija en el plan (FR-048).
- **Intentos**: el recorrido se conserva dentro de un mismo intento de Moodle. Qué ocurre
  entre intentos depende de la configuración de Moodle y no se promete.
- **Informes de Moodle**: Moodle recibe el estado de finalización. No se prometen porcentajes
  ni detalle por tema.
- **Verificación en Moodle**: es manual, la puede hacer el mantenedor y no forma parte de los
  controles automáticos. La versión y la configuración verificadas se registran cuando se haga
  la comprobación; hasta entonces no se nombra ninguna.
- **Comprobación funcional y evaluación pedagógica**: SC-024 es una comprobación funcional
  obligatoria. No exige una persona externa ni ajena a la implementación, y no se aplaza por
  analogía con las validaciones aplazadas de la base de ingeniería. Una evaluación pedagógica
  independiente del temario es otra cosa: queda fuera de esta entrega, no se ha realizado y ni
  el producto ni su documentación la declaran realizada.
- **Requisitos obligatorios**: los fija el inventario de la interpretación validada por el
  docente. El sistema no detecta por sí solo un requisito que ese inventario omita; por eso la
  validación incluye revisarlo contra la sección original (FR-057).
- **Documentos admitidos**: el piloto admite documentos con texto extraíble. Una fuente
  legible y procesable, cuando haga falta, se registra como documento sustituto (FR-003 y
  FR-067).
- **Control del presupuesto**: el mecanismo técnico que mide el coste, lo contabiliza y lo
  reserva para impedir operaciones sin presupuesto disponible corresponde al plan.
- **Conservación (limitación)**: conservar todo y no ofrecer borrado es una decisión del
  piloto, no una conservación indefinida para una futura explotación. Al cerrar el piloto se
  decidirá qué conservar, exportar o eliminar. La política de retención y borrado para
  producción queda fuera de esta entrega.
- **Edición**: cada usuario edita por separado; los conflictos se concilian de forma
  explícita (FR-063).
- **Excepciones de cobertura**: en este piloto no existe ninguna vía para aprobar o exportar
  con cobertura incompleta. Añadirla exige cambiar esta especificación.
- **Evaluación**: no hay evaluación calificable en esta entrega; añadirla exige una
  especificación propia.
- **Migración del módulo**: el cambio de `src/modules/moodle-publication` a
  `src/modules/content-export` (ADR 0003) se planifica con esta funcionalidad.
