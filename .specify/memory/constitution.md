# Constitución de ingeniería de AulaNorma

AulaNorma es una plataforma con inteligencia artificial que recibe el PDF oficial de la
normativa de certificados profesionales publicado en el BOE, propone un índice basado en su
contenido y desarrolla el temario. El docente revisa y aprueba el índice y el contenido, y la
plataforma entrega un paquete SCORM descargable, con instrucciones para que el propio usuario
lo incorpore manualmente a Moodle. Esa normativa incluye los antiguos certificados de
profesionalidad que continúen vigentes o en régimen transitorio. El piloto es ADGG0408. La
publicación automática en Moodle queda fuera del alcance vigente (ver "Restricciones técnicas,
de datos y de contenido"). Esta constitución fija las reglas de ingeniería no negociables del
proyecto. Las palabras
DEBE, NO DEBE y DEBERÍA se interpretan como obligación, prohibición y recomendación fuerte
(con justificación documentada para apartarse), respectivamente.

## Principios fundamentales

### I. Trazabilidad normativa completa (NO NEGOCIABLE)

- Cada documento oficial incorporado DEBE registrarse con: identificador interno, título,
  organismo emisor, referencia oficial (p. ej., norma y boletín de publicación), URL o
  procedencia de obtención, fecha de obtención, versión y huella SHA-256 del fichero.
- Todo elemento derivado (módulo, unidad formativa, capacidad, criterio de evaluación,
  contenido, entrada del índice propuesto, material didáctico, actividad, pregunta de
  evaluación, elemento incluido en un paquete exportado) DEBE conservar referencias de
  procedencia que indiquen documento, sección
  (código normativo cuando exista: MF, UF, capacidad, criterio) y página o rango de páginas.
- Cuando sea técnicamente posible, la referencia DEBE incluir el fragmento literal citado para
  permitir su verificación sin abrir el PDF.
- El contenido didáctico que amplíe o desarrolle la norma DEBE distinguirse explícitamente del
  contenido normativo y declarar el elemento normativo en el que se apoya. Esa distinción
  entre requisitos extraídos del documento oficial y desarrollo didáctico generado DEBE ser
  visible para el docente durante la revisión y conservarse en el paquete exportado.
- Un elemento sin procedencia verificable NO DEBE avanzar a revisión ni a exportación como
  requisito normativo; se marca como "sin respaldo normativo" y se muestra así al docente.
- La cobertura de los requisitos obligatorios del documento oficial DEBE calcularse y
  mostrarse. Un elemento marcado como "sin respaldo normativo" no cuenta como cobertura, y esa
  etiqueta NO DEBE usarse para ocultar, compensar ni dar por atendido un requisito obligatorio
  sin cubrir.
- Las referencias DEBEN sobrevivir a ediciones, regeneraciones y exportaciones, y apuntar a la
  versión concreta del documento fuente utilizada.
- El docente DEBE poder navegar desde cualquier elemento hasta la sección y página de origen.

**Justificación**: el valor de AulaNorma depende de que el curso sea fiel al certificado
oficial. Sin trazabilidad no es posible revisar, auditar ni defender el contenido generado.

### II. Separación estricta de capas (NO NEGOCIABLE)

El sistema DEBE mantener cuatro capas diferenciadas, cada una con su propio modelo de datos
versionado y contratos explícitos con la capa anterior:

1. **Fuente normativa**: el PDF original, inmutable, y su texto extraído por página.
2. **Interpretación estructurada**: la representación del certificado (módulos, unidades
   formativas, capacidades, criterios, contenidos, duraciones) validada por esquema.
3. **Contenido didáctico generado**: materiales, actividades y evaluaciones derivados de la
   interpretación.
4. **Exportación**: la transformación del índice y del contenido aprobados en un paquete
   descargable en el formato de exportación vigente (ver "Restricciones técnicas, de datos y
   de contenido").

- La fuente normativa NO DEBE modificarse; las correcciones de interpretación se registran como
  anotaciones trazables en la capa de interpretación.
- Cada capa solo consume la capa anterior a través de su contrato público; NO DEBE acceder al
  almacenamiento interno de otra capa.
- La capa de exportación NO DEBE generar ni alterar contenido didáctico: solo transforma
  contenido aprobado al formato de exportación.
- La estructura de módulos del código DEBE reflejar estas capas.

**Justificación**: separar fuente, interpretación, generación y exportación permite revisar,
regenerar o volver a exportar cada nivel de forma independiente y localizar el origen de un
error.

### III. Human-in-the-loop obligatorio (NO NEGOCIABLE)

- Ningún contenido DEBE exportarse ni ofrecerse para su descarga sin revisión y aprobación
  explícita de un docente autorizado.
- El índice propuesto DEBE revisarse y aprobarse como elemento propio. Un paquete solo puede
  generarse a partir de un índice aprobado y vigente, y solo con contenido aprobado.
- Todo elemento exportable DEBE seguir un ciclo de estados explícito, como mínimo: borrador
  generado → en revisión → aprobado o rechazado → exportado. Solo los elementos en estado
  "aprobado" son exportables.
- Cada aprobación DEBE registrar la identidad del docente, la fecha y hora, y la versión exacta
  del contenido aprobado.
- Cualquier modificación posterior a la aprobación, humana o automática, DEBE invalidar la
  aprobación y devolver el elemento a revisión.
- La interpretación estructurada DEBE ser revisable y corregible por el docente, y sus
  correcciones quedan registradas.
- NO DEBEN existir rutas, parámetros, scripts, tareas programadas ni modos por lotes que omitan
  la aprobación. Las pruebas automatizadas ejercitan el flujo de aprobación con usuarios
  sintéticos; la importación de paquetes se comprueba en un Moodle de pruebas, nunca en
  producción.
- La incorporación del paquete a Moodle la realiza el usuario, fuera de AulaNorma. La
  aprobación docente cubre el contenido del paquete, no lo que ocurra después en Moodle.
- La IA propone; el docente decide.

**Justificación**: la responsabilidad pedagógica y normativa del curso recae en el docente. La
IA puede cometer errores o inventar contenido, y un paquete exportado acaba ante alumnado real.

### IV. Salidas estructuradas y validadas por esquema (NO NEGOCIABLE)

- Toda salida de IA utilizada en un proceso crítico (extracción normativa, interpretación
  estructurada, índice propuesto, estructura del curso, evaluaciones, referencias de
  procedencia, estructura del paquete de exportación) DEBE producirse en formato estructurado
  conforme a un esquema versionado (p. ej., JSON Schema) y validarse antes de persistirse o
  usarse.
- Una salida inválida DEBE rechazarse o reintentarse un número acotado de veces; NO DEBE
  repararse con heurísticas silenciosas. Cada fallo de validación queda registrado.
- Las expresiones regulares, heurísticas o modelos de IA pueden utilizarse para proponer
  candidatos de extracción, pero ningún dato normativo crítico obtenido mediante ellos puede
  considerarse válido sin esquema, procedencia verificable y revisión o comprobación explícita.
  Queda prohibida la corrección o aceptación silenciosa de resultados ambiguos.
- El texto libre solo se admite dentro de campos declarados en el esquema (p. ej., el cuerpo de
  un material) y DEBE validarse igualmente (longitud, formato, saneamiento de HTML).
- Los esquemas son contratos versionados, cubiertos por pruebas; un cambio incompatible DEBE ir
  acompañado de migración de los datos existentes.

**Justificación**: los procesos críticos necesitan datos verificables por máquina. Depender de
texto libre hace frágil la trazabilidad, la revisión y la exportación.

### V. Seguridad y privacidad por defecto (NO NEGOCIABLE)

- **Mínimo privilegio**: cada rol de usuario y credencial de servicio DEBE tener solo los
  permisos imprescindibles. AulaNorma NO DEBE solicitar, almacenar ni usar credenciales ni
  tokens de Moodle.
- **Secretos**: las claves, tokens y contraseñas NO DEBEN incluirse en el repositorio, en logs
  ni en mensajes de error. Se gestionan mediante variables de entorno o un gestor de secretos;
  el repositorio solo contiene plantillas sin valores (p. ej., `.env.example`). La integración
  continua DEBE incluir detección de secretos.
- **Validación de archivos**: todo fichero subido DEBE validarse por tipo real (firma del
  fichero, no solo la extensión), tamaño máximo, número de páginas y estructura; los PDF
  cifrados, corruptos o con contenido activo se rechazan. Los nombres de fichero se sanean y el
  procesamiento se realiza de forma aislada del resto del sistema.
- **Control de acceso**: toda operación que acceda, modifique o exponga información de negocio,
  datos personales, contenido protegido o acciones privilegiadas DEBE requerir autenticación y
  autorización comprobadas en el servidor, con denegación por defecto. Cualquier otra operación
  está sujeta a la misma exigencia, salvo la excepción y el inicio de sesión de los apartados
  siguientes.
- **Excepción: comprobación técnica pública de estado**: puede existir excepcionalmente una
  comprobación técnica de disponibilidad o estado accesible sin autenticación, únicamente si
  cumple simultáneamente todas estas condiciones:
  - es de solo lectura;
  - no accede a datos de negocio ni a datos personales;
  - no usa persistencia ni servicios externos;
  - no cambia el estado del sistema;
  - devuelve un contrato mínimo, explícito y cerrado;
  - no revela configuración, entorno, rutas, commits, tiempos internos, dependencias,
    infraestructura ni ninguna otra información sensible;
  - la excepción está declarada expresamente en la especificación de la funcionalidad y se
    comprueba mediante pruebas.

  Toda operación que no cumpla todas estas condiciones sigue sujeta a autenticación y
  autorización. Esta excepción NO DEBE extenderse por analogía a operaciones ni endpoints de
  producto.
- **Inicio de sesión**: el formulario de entrada y las operaciones estrictamente necesarias
  para iniciar sesión pueden ser accesibles sin autenticación previa, porque son el propio
  mecanismo de autenticación. NO DEBEN conceder acceso a documentos, proyectos, generación,
  aprobaciones ni descargas, ni a ningún otro dato u operación de producto. DEBEN protegerse
  frente a intentos repetidos y frente a la falsificación de peticiones, y NO DEBEN extenderse
  por analogía a otras operaciones.
- **Auditoría**: los eventos sensibles (inicio de sesión, cambios de permisos, subida de
  documentos, aprobaciones, rechazos, exportaciones y descargas) DEBEN registrarse en un registro de
  auditoría de solo inserción.
- **Privacidad**: se aplican minimización de datos y la normativa de protección de datos
  aplicable (RGPD). NO DEBEN enviarse datos personales al proveedor de IA.
- **Contenido no confiable**: el texto de los PDF y las salidas de la IA se tratan como datos no
  confiables; las instrucciones contenidas en ellos NO DEBEN ejecutarse (defensa frente a
  inyección de instrucciones) y el HTML generado DEBE sanearse antes de mostrarse o exportarse.
- **Paquete exportado**: un paquete exportado se ejecuta en un entorno ajeno, ante alumnado.
  NO DEBE contener secretos, credenciales ni datos personales de usuarios, y NO DEBE
  comunicarse con AulaNorma ni con ningún servicio externo. Su único intercambio de datos es
  con la plataforma que lo ejecuta, a través de la interfaz del formato de exportación; ese
  intercambio está permitido y es necesario para guardar el seguimiento. El código que incluya
  DEBE limitarse al necesario para la navegación y para esa interfaz. Los registros internos
  de aprobación de AulaNorma y el seguimiento que guarde la plataforma que ejecuta el paquete
  tienen un alcance distinto y no forman parte del paquete.

**Justificación**: la plataforma maneja documentos subidos y cuentas de docentes, y sus
paquetes se ejecutan en plataformas de terceros; una brecha afectaría a centros formativos y
alumnado. La única excepción al control de
acceso se limita a una comprobación técnica sin datos ni efectos, necesaria para verificar de
forma automática que el servicio está operativo.

### VI. Exportación reproducible, autónoma y verificable (NO NEGOCIABLE)

- Cada paquete exportado DEBE identificar la versión aprobada de la que procede y el formato
  de exportación, de modo que esa versión pueda reconocerse desde el propio paquete.
- El fichero entregado DEBE ser íntegro: su huella SHA-256 se registra al generarlo y DEBE
  poder comprobarse sobre el fichero descargado.
- Exportar de nuevo la misma versión aprobada DEBE producir un paquete con el mismo contenido
  aprobado y una estructura equivalente. No se exige identidad binaria entre dos ficheros
  generados por separado.
- Un paquete DEBE ser **autónomo**: incluye todos los recursos de su contenido y, una vez
  importado, funciona sin depender de AulaNorma ni hacer peticiones a servicios externos. La
  comunicación con la plataforma que lo ejecuta, a través de la interfaz del formato, no es
  una dependencia externa.
- El paquete DEBE validarse contra las reglas del formato de exportación antes de ofrecerse
  para su descarga. Un paquete inválido o incompleto NO DEBE poder descargarse.
- Un fallo durante la generación DEBE detectarse y registrarse, y NO DEBE dejar disponible un
  paquete parcial. La generación DEBE poder repetirse sin efectos acumulados.
- El docente DEBE poder previsualizar lo que se va a exportar. Una vista previa fuera de una
  plataforma que ejecute el formato muestra el contenido, pero NO acredita que el seguimiento
  se guarde.
- NO DEBE declararse la compatibilidad con una plataforma o una versión concreta sin haber
  verificado la importación y el funcionamiento del paquete en una instancia real de pruebas
  de esa plataforma, mediante un procedimiento reproducible. La evidencia DEBE registrar la
  versión exacta y la configuración verificadas. La comprobación puede hacerla el mantenedor.
- La exportación DEBE cumplir las reglas de la sección "Restricciones técnicas, de datos y de
  contenido".

**Justificación**: el paquete sale del control de AulaNorma en cuanto se descarga. Debe poder
demostrarse qué versión aprobada contiene, que funciona por sí solo y dónde se ha comprobado.

### VII. Desarrollo incremental por porciones verticales (NO NEGOCIABLE)

- Cada funcionalidad DEBE entregarse como una porción vertical pequeña que atraviese las capas
  necesarias y produzca un resultado verificable por un docente.
- El primer alcance DEBE ser la unidad formativa UF0517 del certificado de profesionalidad
  ADGG0408. NO DEBE ampliarse al certificado ADGG0408 completo hasta que el flujo extremo a
  extremo de UF0517 (ingesta, interpretación, índice propuesto, generación, revisión,
  exportación del paquete e importación manual verificada en un Moodle de pruebas) funcione y
  haya sido validado por un docente.
- El código NO DEBE contener lógica específica de UF0517 ni de ADGG0408: la especificidad reside
  en los datos y en las pruebas, no en el código.
- Cada pull request DEBERÍA ser revisable en una sola sesión; se evitan las ramas de larga
  duración.

**Justificación**: validar pronto el flujo completo con un caso real reduce el riesgo y ofrece
retroalimentación docente temprana antes de escalar.

### VIII. Pruebas obligatorias (NO NEGOCIABLE)

- Son obligatorias las pruebas automatizadas de:
  - lógica normativa: extracción, interpretación, duraciones y referencias de procedencia;
  - transformaciones entre capas y validación de esquemas;
  - permisos y autorización, incluidos los casos denegados;
  - exportación: validez y estructura del paquete, equivalencia entre exportaciones de una
    misma versión, autonomía (ausencia de peticiones externas), fallos de generación, y el
    contrato de seguimiento y reanudación contra un doble de la interfaz del formato;
  - flujo de aprobación, del índice y del contenido, incluida la invalidación tras una
    modificación.
- Las pruebas DEBEN combinar, según corresponda, pruebas unitarias, de contrato (esquemas,
  formato de exportación, adaptadores de IA), de integración y extremo a extremo de cada porción
  vertical.
- La importación y el funcionamiento del paquete en un Moodle de pruebas se comprueban con un
  procedimiento manual reproducible y su evidencia se registra. Esa comprobación no forma parte
  de la integración continua, que NO DEBE depender de una instancia de Moodle.
- Las pruebas de integración continua NO DEBEN depender de respuestas no deterministas de un
  proveedor de IA: se usan dobles deterministas o respuestas grabadas. La evaluación de calidad
  de la IA se realiza en conjuntos de evaluación separados y versionados.
- El PDF oficial del certificado, con su procedencia registrada, DEBERÍA usarse como fixture de
  referencia con resultados esperados verificados.
- Todo defecto corregido DEBE incluir una prueba de regresión.
- Un pull request con pruebas fallidas NO DEBE integrarse en `main`.

**Justificación**: los errores en normativa, permisos o exportación tienen consecuencias
externas; las pruebas son la única garantía repetible.

### IX. Independencia del proveedor de IA (NO NEGOCIABLE)

- Todo acceso a modelos de IA DEBE realizarse a través de una interfaz propia del dominio, con
  un adaptador por proveedor. El código de dominio NO DEBE importar SDK de proveedores.
- Los prompts DEBEN versionarse como artefactos del repositorio, separados de la lógica, y cada
  generación DEBE registrar la versión de prompt utilizada.
- Cada llamada DEBE registrar proveedor, modelo, versión de prompt, tokens de entrada y salida,
  coste estimado, latencia, resultado de validación y entidad asociada.
- DEBEN existir límites de coste configurables por operación y por periodo; al alcanzarse, el
  sistema detiene la generación y lo notifica. Las generaciones masivas DEBEN mostrar una
  estimación de coste previa. Mientras no se defina otro periodo, el periodo es el ciclo
  completo de cada proyecto, desde su creación hasta su cierre, sin reinicios automáticos: el
  límite por periodo es entonces un límite acumulado del proyecto, que se suma al máximo por
  operación.
- Cambiar de proveedor o de modelo NO DEBE requerir cambios en el dominio; los adaptadores se
  verifican con pruebas de contrato comunes.

**Justificación**: los modelos, precios y condiciones cambian con rapidez; el proyecto no puede
quedar atado a un proveedor ni sufrir costes imprevistos.

### X. Accesibilidad, usabilidad y lenguaje claro (NO NEGOCIABLE)

- La interfaz DEBE cumplir WCAG 2.2 nivel AA (referencia europea EN 301 549).
- El contenido exportado DEBE ser accesible: jerarquía de encabezados, texto alternativo en
  imágenes, contraste suficiente, información que no dependa solo del color y navegación
  utilizable con teclado.
- Las instrucciones para incorporar el paquete a Moodle DEBEN estar escritas para un docente,
  paso a paso, e indicar en qué versión de Moodle se han comprobado.
- Textos de interfaz, mensajes y ayudas DEBEN redactarse en español claro para docentes, sin
  jerga técnica; los mensajes de error DEBEN indicar qué ocurrió y qué puede hacer el usuario.
- La revisión DEBE permitir ver cada elemento junto a su fuente normativa, comparar versiones y
  aprobar, rechazar o editar con acciones explícitas.
- Cada porción vertical con interfaz DEBERÍA validarse con docentes (sin utilizar datos
  personales reales en los registros de la validación).

**Justificación**: el usuario principal es un docente, no un técnico; si revisar es costoso,
el control humano se degrada.

### XI. Observabilidad y registro de decisiones (NO NEGOCIABLE)

- El sistema DEBE emitir logs estructurados con un identificador de correlación que siga cada
  elemento a través de ingesta, interpretación, generación, revisión y exportación.
- DEBEN registrarse de forma consultable:
  - generaciones: entrada, versión de prompt, modelo, salida y resultado de validación;
  - revisiones: docente, fecha, decisión, comentario y versión revisada;
  - exportaciones: elemento, versión aprobada, formato, huella del paquete, docente,
    resultado de la validación y descargas;
  - decisiones arquitectónicas: mediante ADR.
- Los registros NO DEBEN contener secretos ni datos personales innecesarios.
- DEBEN existir métricas mínimas de errores, latencia, coste de IA y estado de exportaciones.
- Docentes y administradores DEBEN poder consultar el historial de cada elemento.

**Justificación**: sin registros no es posible explicar por qué un contenido es como es,
diagnosticar fallos ni rendir cuentas de lo exportado.

### XII. Simplicidad arquitectónica (NO NEGOCIABLE)

- La arquitectura inicial DEBE ser un monolito modular: una única unidad desplegable con
  módulos de límites claros, alineados con las capas del principio II, que se comunican mediante
  interfaces internas.
- Añadir servicios separados, colas, bases de datos adicionales, orquestadores u otra
  infraestructura DEBE justificarse con un ADR que recoja la necesidad medida, las alternativas
  más simples descartadas y el coste de mantenimiento.
- Cada dependencia nueva DEBE justificarse en el plan de la funcionalidad.
- No se construye para necesidades hipotéticas (YAGNI).
- Toda desviación DEBE registrarse en la sección "Complexity Tracking" del plan.

**Justificación**: un TFM y un equipo reducido necesitan una arquitectura comprensible y
fácil de operar; la complejidad solo se añade cuando está justificada.

## Restricciones técnicas, de datos y de contenido

- **Idioma**: el código, los identificadores técnicos, los nombres de ficheros de código, los
  esquemas y los mensajes de commit se escriben en inglés. La documentación funcional, las
  especificaciones, los ADR, los textos de interfaz y la documentación del TFM se escriben en
  español.
- **Contenido prohibido en el repositorio**: secretos o credenciales; datos personales reales;
  documentos normativos sin registro de procedencia (organismo emisor, referencia oficial, URL o
  fuente, fecha de obtención y huella SHA-256).
- **Datos de prueba**: los usuarios, centros y alumnado de prueba DEBEN ser sintéticos.
- **Entornos**: la importación de paquetes se comprueba en una instancia de Moodle de pruebas,
  separada de cualquier instancia de producción y sin datos personales reales.
- **Formato de exportación**:
  - El formato de exportación vigente es **SCORM 1.2**. Cambiar de formato o añadir otro exige
    un ADR.
  - El paquete DEBE incluir un temario navegable y comunicar a la plataforma que lo ejecuta,
    como mínimo, el estado de finalización y el punto de reanudación, usando solo el modelo de
    datos del formato y dentro de sus límites.
  - El seguimiento que comunica el paquete NO DEBE presentarse como evaluación, calificación
    ni prueba de aprendizaje mientras el paquete no incluya una evaluación revisada y
    aprobada.
  - El paquete DEBE ir acompañado de instrucciones para incorporarlo manualmente a Moodle.
- **Relación con Moodle**:
  - En el alcance vigente, AulaNorma NO DEBE conectarse a Moodle: no usa sus servicios web, no
    emplea MCP (Model Context Protocol) como transporte hacia ellos y no incluye ningún plugin
    de Moodle. La incorporación del paquete es manual y la realiza el usuario.
  - Reintroducir cualquier forma de publicación automática en Moodle exige enmendar antes esta
    constitución y registrar la decisión en un ADR. Esa enmienda DEBE restablecer reglas
    equivalentes a las de la versión 1.1.0 sobre frontera de integración, mínimo privilegio,
    idempotencia y recuperación.
  - Queda prohibida sin excepción la escritura directa en la base de datos de Moodle.

## Flujo de desarrollo y puertas de calidad

- **Flujo oficial**: GitHub Spec Kit es el flujo oficial de desarrollo.
- **Funcionalidades críticas**: se consideran críticas las que afectan a trazabilidad
  normativa, interpretación estructurada, aprobación docente, exportación, esquemas,
  seguridad o permisos, o integración con IA. Para ellas es obligatoria la secuencia completa:
  `specify` → `clarify` → `plan` → `checklist` → `tasks` → `analyze` → `implement` → `converge`.
- **Funcionalidades no críticas**: requieren como mínimo `specify` → `plan` → `tasks` →
  `implement` → `converge`; en caso de duda, se tratan como críticas.
- **Converge**: `converge` es obligatorio para todas las funcionalidades, críticas o no.
- **Ramas y pull requests**: cada cambio se desarrolla en una rama propia y llega a `main`
  exclusivamente mediante pull request. NO DEBEN hacerse pushes directos a `main`. Todo pull
  request DEBE superar los controles automáticos disponibles y aplicables, además de una
  revisión que verifique el cumplimiento de esta constitución; si hay un único autor, la
  revisión se documenta con la lista de comprobación constitucional. La línea base de
  integración continua DEBE estar creada antes de comenzar la implementación de la primera
  funcionalidad. Desde ese momento, ningún pull request con controles requeridos fallidos puede
  integrarse en `main`. Mientras se prepara esa línea base, los pull requests exclusivamente
  documentales DEBEN registrar las comprobaciones manuales reproducibles realizadas.
- **Criterios de aceptación**: DEBEN ser verificables mediante una prueba automatizada o un
  procedimiento manual reproducible, con resultado observable y, cuando proceda, medible.
- **Definition of Done**: un cambio está terminado solo si cumple todo lo siguiente:
  - criterios de aceptación verificados;
  - pruebas obligatorias (principio VIII) escritas y superadas;
  - documentación funcional y técnica actualizada;
  - ADR creado o actualizado si hubo una decisión arquitectónica relevante;
  - sin secretos, datos personales reales ni normativa sin procedencia;
  - trazabilidad normativa preservada en todo contenido afectado;
  - accesibilidad verificada en los cambios de interfaz.
- **ADR**: las decisiones arquitectónicas relevantes (tecnologías, límites entre módulos,
  infraestructura, proveedores, esquemas de contrato, desviaciones del principio XII) se
  registran en `docs/adr/` con numeración secuencial, incluyendo contexto, decisión,
  alternativas consideradas y consecuencias.
- **Puertas de verificación constitucional** (base del apartado "Constitution Check" de cada
  plan; todas DEBEN responderse con evidencia):
  1. ¿Todo elemento nuevo o modificado conserva documento, sección y página de origen, y se
     muestra la cobertura de los requisitos obligatorios sin ocultar los no cubiertos? (I)
  2. ¿Se respetan las cuatro capas y sus contratos? (II)
  3. ¿Es imposible exportar o descargar sin aprobación docente explícita y vigente, del índice
     y del contenido? (III)
  4. ¿Las salidas críticas se validan contra esquemas versionados? (IV)
  5. ¿Se aplican mínimo privilegio, gestión de secretos, validación de archivos, control de
     acceso y auditoría? Si existe una comprobación técnica pública de estado, ¿cumple todas las
     condiciones de la excepción? (V)
  6. ¿El paquete es autónomo, íntegro, identifica su versión aprobada y se valida antes de la
     descarga, y no se declara ninguna compatibilidad sin verificar? (VI)
  7. ¿Es una porción vertical pequeña dentro del alcance vigente (UF0517 primero)? (VII)
  8. ¿Están planificadas las pruebas obligatorias? (VIII)
  9. ¿El acceso a IA pasa por adaptadores, con límites de coste y registro de uso? (IX)
  10. ¿Se cumplen accesibilidad y lenguaje claro? (X)
  11. ¿Se registran generaciones, revisiones, exportaciones y decisiones? (XI)
  12. ¿Se evita complejidad no justificada o está documentada en un ADR? (XII)

## Gobernanza

- **Supremacía**: esta constitución prevalece sobre especificaciones, planes, tareas y
  cualquier práctica posterior. En caso de conflicto, el artefacto posterior DEBE corregirse
  para ajustarse a ella; `analyze` DEBE clasificar como CRÍTICO cualquier conflicto detectado.
- **Excepciones**: los principios no admiten excepciones puntuales. Solo se admiten las
  excepciones que el propio texto de un principio define con condiciones cerradas, como la
  comprobación técnica pública de estado del principio V. La complejidad adicional se
  justifica mediante el mecanismo del principio XII (ADR y "Complexity Tracking"); cualquier otra
  desviación exige enmendar antes la constitución.
- **Procedimiento de enmienda**: toda enmienda se realiza con `/speckit-constitution` en una rama
  propia y se integra mediante pull request que incluya la justificación del cambio, el informe
  de impacto de sincronización, el incremento de versión y la revisión de los artefactos
  dependientes (plantillas, especificaciones y planes en curso). Las enmiendas relevantes
  DEBERÍAN acompañarse de un ADR.
- **Versionado**: la constitución sigue versionado semántico:
  - MAJOR: eliminación o redefinición incompatible de principios o reglas de gobernanza;
  - MINOR: nuevo principio o sección, o ampliación material de las reglas;
  - PATCH: aclaraciones, redacción o correcciones sin cambio semántico.
- **Revisión de cumplimiento**: cada plan DEBE superar las puertas de verificación
  constitucional antes de la fase de investigación y de nuevo tras el diseño; cada pull request
  DEBE verificar el cumplimiento; al cerrar cada porción vertical DEBE revisarse si la
  constitución sigue siendo adecuada.

**Version**: 2.0.0 | **Ratified**: 2026-09-24 | **Last Amended**: 2026-10-07
