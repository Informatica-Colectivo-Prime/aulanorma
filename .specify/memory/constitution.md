# Constitución de ingeniería de AulaNorma

AulaNorma es una plataforma con inteligencia artificial que transforma el PDF oficial de la
normativa de certificados profesionales en un curso completo, revisable por docentes y
publicable en Moodle. Esa normativa incluye los antiguos certificados de profesionalidad que
continúen vigentes o en régimen transitorio. El piloto es ADGG0408. Esta constitución fija las
reglas de ingeniería no negociables del proyecto. Las palabras
DEBE, NO DEBE y DEBERÍA se interpretan como obligación, prohibición y recomendación fuerte
(con justificación documentada para apartarse), respectivamente.

## Principios fundamentales

### I. Trazabilidad normativa completa (NO NEGOCIABLE)

- Cada documento oficial incorporado DEBE registrarse con: identificador interno, título,
  organismo emisor, referencia oficial (p. ej., norma y boletín de publicación), URL o
  procedencia de obtención, fecha de obtención, versión y huella SHA-256 del fichero.
- Todo elemento derivado (módulo, unidad formativa, capacidad, criterio de evaluación,
  contenido, material didáctico, actividad, pregunta de evaluación, elemento publicado en
  Moodle) DEBE conservar referencias de procedencia que indiquen documento, sección
  (código normativo cuando exista: MF, UF, capacidad, criterio) y página o rango de páginas.
- Cuando sea técnicamente posible, la referencia DEBE incluir el fragmento literal citado para
  permitir su verificación sin abrir el PDF.
- El contenido didáctico que amplíe o desarrolle la norma DEBE distinguirse explícitamente del
  contenido normativo y declarar el elemento normativo en el que se apoya.
- Un elemento sin procedencia verificable NO DEBE avanzar a revisión ni a publicación; se marca
  como "sin respaldo normativo" y se muestra así al docente.
- Las referencias DEBEN sobrevivir a ediciones, regeneraciones y publicaciones, y apuntar a la
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
4. **Publicación en Moodle**: la correspondencia entre contenido aprobado y cursos, secciones,
   recursos y actividades de Moodle.

- La fuente normativa NO DEBE modificarse; las correcciones de interpretación se registran como
  anotaciones trazables en la capa de interpretación.
- Cada capa solo consume la capa anterior a través de su contrato público; NO DEBE acceder al
  almacenamiento interno de otra capa.
- La capa de publicación NO DEBE generar ni alterar contenido didáctico: solo transforma
  contenido aprobado al formato de Moodle.
- La estructura de módulos del código DEBE reflejar estas capas.

**Justificación**: separar fuente, interpretación, generación y publicación permite revisar,
regenerar o republicar cada nivel de forma independiente y localizar el origen de un error.

### III. Human-in-the-loop obligatorio (NO NEGOCIABLE)

- Ningún contenido DEBE publicarse en Moodle sin revisión y aprobación explícita de un docente
  autorizado.
- Todo elemento publicable DEBE seguir un ciclo de estados explícito, como mínimo: borrador
  generado → en revisión → aprobado o rechazado → publicado. Solo los elementos en estado
  "aprobado" son publicables.
- Cada aprobación DEBE registrar la identidad del docente, la fecha y hora, y la versión exacta
  del contenido aprobado.
- Cualquier modificación posterior a la aprobación, humana o automática, DEBE invalidar la
  aprobación y devolver el elemento a revisión.
- La interpretación estructurada DEBE ser revisable y corregible por el docente, y sus
  correcciones quedan registradas.
- NO DEBEN existir rutas, parámetros, scripts, tareas programadas ni modos por lotes que omitan
  la aprobación. Las pruebas automatizadas ejercitan el flujo de aprobación con usuarios
  sintéticos contra un Moodle de pruebas o un doble de prueba, nunca contra producción.
- La IA propone; el docente decide.

**Justificación**: la responsabilidad pedagógica y normativa del curso recae en el docente. La
IA puede cometer errores o inventar contenido, y la publicación tiene efecto sobre alumnado real.

### IV. Salidas estructuradas y validadas por esquema (NO NEGOCIABLE)

- Toda salida de IA utilizada en un proceso crítico (extracción normativa, interpretación
  estructurada, estructura del curso, evaluaciones, referencias de procedencia, correspondencia
  con Moodle) DEBE producirse en formato estructurado conforme a un esquema versionado
  (p. ej., JSON Schema) y validarse antes de persistirse o usarse.
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
texto libre hace frágil la trazabilidad, la revisión y la publicación.

### V. Seguridad y privacidad por defecto (NO NEGOCIABLE)

- **Mínimo privilegio**: cada rol de usuario, credencial de servicio y token de Moodle DEBE
  tener solo los permisos imprescindibles. El servicio web de Moodle DEBE limitarse a las
  funciones que AulaNorma usa.
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
  está sujeta a la misma exigencia, salvo la excepción del apartado siguiente.
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
- **Auditoría**: los eventos sensibles (inicio de sesión, cambios de permisos, subida de
  documentos, aprobaciones, rechazos, publicaciones) DEBEN registrarse en un registro de
  auditoría de solo inserción.
- **Privacidad**: se aplican minimización de datos y la normativa de protección de datos
  aplicable (RGPD). NO DEBEN enviarse datos personales al proveedor de IA.
- **Contenido no confiable**: el texto de los PDF y las salidas de la IA se tratan como datos no
  confiables; las instrucciones contenidas en ellos NO DEBEN ejecutarse (defensa frente a
  inyección de instrucciones) y el HTML generado DEBE sanearse antes de mostrarse o publicarse.

**Justificación**: la plataforma maneja credenciales de Moodle, documentos subidos y cuentas de
docentes; una brecha afectaría a centros formativos y alumnado. La única excepción al control de
acceso se limita a una comprobación técnica sin datos ni efectos, necesaria para verificar de
forma automática que el servicio está operativo.

### VI. Publicación idempotente y recuperable en Moodle (NO NEGOCIABLE)

- Cada operación de publicación DEBE identificarse con una clave de idempotencia derivada del
  elemento y de su versión aprobada.
- El sistema DEBE mantener una correspondencia persistente entre identificadores internos e
  identificadores de Moodle, y actualizar lo existente en lugar de crear duplicados.
- Ejecutar dos veces la misma publicación DEBE producir el mismo estado final en Moodle.
- La publicación DEBE ejecutarse por pasos con estado registrado, reanudable desde el último
  paso confirmado, con reintentos acotados y espera progresiva ante errores transitorios.
- Los fallos parciales DEBEN detectarse, registrarse y poder reconciliarse; NO DEBEN dejar
  estados inconsistentes silenciosos.
- DEBE existir un modo de simulación que muestre los cambios previstos en Moodle antes de
  aplicarlos.
- La integración con Moodle DEBE cumplir la regla de integración de la sección "Restricciones
  técnicas, de datos y de contenido".

**Justificación**: las redes y Moodle fallan; un reintento no debe duplicar cursos ni
actividades ni exigir limpieza manual.

### VII. Desarrollo incremental por porciones verticales (NO NEGOCIABLE)

- Cada funcionalidad DEBE entregarse como una porción vertical pequeña que atraviese las capas
  necesarias y produzca un resultado verificable por un docente.
- El primer alcance DEBE ser la unidad formativa UF0517 del certificado de profesionalidad
  ADGG0408. NO DEBE ampliarse al certificado ADGG0408 completo hasta que el flujo extremo a
  extremo de UF0517 (ingesta, interpretación, generación, revisión y publicación en un Moodle de
  pruebas) funcione y haya sido validado por un docente.
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
  - publicación en Moodle: idempotencia, reintentos, fallos parciales y reconciliación;
  - flujo de aprobación, incluida la invalidación tras una modificación.
- Las pruebas DEBEN combinar, según corresponda, pruebas unitarias, de contrato (esquemas,
  API de Moodle, adaptadores de IA), de integración y extremo a extremo de cada porción vertical.
- Las pruebas de integración continua NO DEBEN depender de respuestas no deterministas de un
  proveedor de IA: se usan dobles deterministas o respuestas grabadas. La evaluación de calidad
  de la IA se realiza en conjuntos de evaluación separados y versionados.
- El PDF oficial del certificado, con su procedencia registrada, DEBERÍA usarse como fixture de
  referencia con resultados esperados verificados.
- Todo defecto corregido DEBE incluir una prueba de regresión.
- Un pull request con pruebas fallidas NO DEBE integrarse en `main`.

**Justificación**: los errores en normativa, permisos o publicación tienen consecuencias
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
  estimación de coste previa.
- Cambiar de proveedor o de modelo NO DEBE requerir cambios en el dominio; los adaptadores se
  verifican con pruebas de contrato comunes.

**Justificación**: los modelos, precios y condiciones cambian con rapidez; el proyecto no puede
quedar atado a un proveedor ni sufrir costes imprevistos.

### X. Accesibilidad, usabilidad y lenguaje claro (NO NEGOCIABLE)

- La interfaz DEBE cumplir WCAG 2.2 nivel AA (referencia europea EN 301 549).
- El contenido publicado en Moodle DEBE ser accesible: jerarquía de encabezados, texto
  alternativo en imágenes, contraste suficiente y información que no dependa solo del color.
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
  elemento a través de ingesta, interpretación, generación, revisión y publicación.
- DEBEN registrarse de forma consultable:
  - generaciones: entrada, versión de prompt, modelo, salida y resultado de validación;
  - revisiones: docente, fecha, decisión, comentario y versión revisada;
  - publicaciones: elemento, versión, destino, resultado e identificadores de Moodle;
  - decisiones arquitectónicas: mediante ADR.
- Los registros NO DEBEN contener secretos ni datos personales innecesarios.
- DEBEN existir métricas mínimas de errores, latencia, coste de IA y estado de publicaciones.
- Docentes y administradores DEBEN poder consultar el historial de cada elemento.

**Justificación**: sin registros no es posible explicar por qué un contenido es como es,
diagnosticar fallos ni rendir cuentas de lo publicado.

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
- **Entornos**: los entornos de desarrollo y pruebas DEBEN usar instancias de Moodle separadas
  de producción, con credenciales distintas.
- **Integración con Moodle**:
  - Los servicios web externos de Moodle son la única frontera de integración: toda lectura y
    escritura en Moodle DEBE pasar por funciones externas de su servicio web.
  - Se permite MCP (Model Context Protocol) como capa de transporte y orquestación hacia esas
    funciones externas; MCP NO DEBE eludir la frontera ni los controles de los principios III,
    V y VI.
  - Se permite un plugin local de Moodle, denominado provisionalmente `local_aulanorma`, para
    exponer como funciones externas las capacidades que Moodle no proporcione de serie.
  - Toda función utilizada para publicar, nativa o del plugin, DEBE estar expresamente
    autorizada en el servicio web de AulaNorma y exigir solo las capacidades mínimas necesarias.
  - Queda prohibida sin excepción la escritura directa en la base de datos de Moodle, tanto
    desde AulaNorma como desde `local_aulanorma`, que DEBE usar exclusivamente las API internas
    de Moodle.

## Flujo de desarrollo y puertas de calidad

- **Flujo oficial**: GitHub Spec Kit es el flujo oficial de desarrollo.
- **Funcionalidades críticas**: se consideran críticas las que afectan a trazabilidad
  normativa, interpretación estructurada, aprobación docente, publicación en Moodle, esquemas,
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
  1. ¿Todo elemento nuevo o modificado conserva documento, sección y página de origen? (I)
  2. ¿Se respetan las cuatro capas y sus contratos? (II)
  3. ¿Es imposible publicar sin aprobación docente explícita y vigente? (III)
  4. ¿Las salidas críticas se validan contra esquemas versionados? (IV)
  5. ¿Se aplican mínimo privilegio, gestión de secretos, validación de archivos, control de
     acceso y auditoría? Si existe una comprobación técnica pública de estado, ¿cumple todas las
     condiciones de la excepción? (V)
  6. ¿La publicación es idempotente, reanudable y sin duplicados? (VI)
  7. ¿Es una porción vertical pequeña dentro del alcance vigente (UF0517 primero)? (VII)
  8. ¿Están planificadas las pruebas obligatorias? (VIII)
  9. ¿El acceso a IA pasa por adaptadores, con límites de coste y registro de uso? (IX)
  10. ¿Se cumplen accesibilidad y lenguaje claro? (X)
  11. ¿Se registran generaciones, revisiones, publicaciones y decisiones? (XI)
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

**Version**: 1.1.0 | **Ratified**: 2026-09-24 | **Last Amended**: 2026-09-26
