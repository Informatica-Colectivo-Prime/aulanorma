# Research: Del PDF oficial del BOE al paquete SCORM (piloto UF0517)

**Fecha**: 2026-10-07 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Cada decisión indica lo elegido, por qué y qué se descartó. El criterio común es el del
mantenedor: la solución más pequeña que permita completar UF0517, sin funcionalidades fuera del
piloto. Las decisiones marcadas **[por verificar]** dependen de una comprobación de viabilidad
temprana, que es una tarea propia; ninguna bloquea el diseño.

Las comprobaciones manuales en Moodle no son decisiones técnicas y están aparte, en la
sección final.

## R1. Persistencia

> **Resultado de la viabilidad (2026-10-07)**, en [feasibility.md](./feasibility.md): modo
> WAL, transacciones, exclusión entre escritores, disparadores de solo inserción,
> recuperación tras la caída del proceso y copia en línea, observados en Node.js 24.21.0. La
> documentación de esa versión declara `node:sqlite` como *release candidate* (1.2).

**Decisión**: una base de datos SQLite en un único fichero, con el módulo `node:sqlite`
incluido en Node.js, en modo WAL, más un almacén de ficheros direccionado por huella SHA-256
para los PDF y los paquetes exportados. Migraciones como ficheros SQL numerados, aplicados por
un ejecutor propio al arrancar. Todo el acceso pasa por `src/platform/persistence`.

**Justificación**:

- No añade ningún servicio ni dependencia. `node:sqlite` funciona sin indicadores en Node.js
  24.21.0 (comprobado en local: abre una base en memoria con SQLite 3.53.4 y expone la
  operación de copia en línea, `backup`).
- El repositorio instala con `ignore-scripts=true`; un controlador nativo que compile al
  instalar no funcionaría sin abrir una excepción.
- Las transacciones bastan para las reservas de presupuesto (R6) y para el guardado con
  control de revisión (R5).
- El registro de auditoría de solo inserción se impone con disparadores que rechazan
  `UPDATE` y `DELETE`.

**Límites, aceptados para el piloto**:

- **Un único servidor y una única instancia de la aplicación.** SQLite admite un solo
  escritor a la vez y el fichero debe estar en un disco local, no en un sistema de ficheros
  de red. No hay réplicas ni alta disponibilidad: si el servidor cae, el servicio cae.
- **`node:sqlite` está en estado *release candidate* en Node.js 24.21.0.** Su API puede
  cambiar antes de declararse estable. Se mitiga con la versión de Node.js fijada, con el
  encapsulado en un único módulo y con pruebas de integración que se ejecutan en esa versión.
  Actualizar Node.js exige repetirlas.
- **La copia de seguridad es responsabilidad del despliegue** (R11); el fichero no se copia
  en caliente con herramientas del sistema.
- Pasar a varias instancias o a un volumen mayor exigiría otra base de datos y un ADR.

**Alternativas consideradas**:

- **PostgreSQL**: sin esos límites, pero exige operar otro servicio y un contenedor en la
  integración continua. Sin necesidad medida, contradice el principio XII.
- **`better-sqlite3`**: estable, pero es un complemento nativo que necesita scripts de
  instalación o binarios precompilados.
- **Ficheros JSON**: sin transacciones ni restricciones.
- **Un ORM**: dependencia y generación de código para un modelo pequeño.

## R2. Identidad, sesión y autorización

> **Resultado de la implementación (2026-10-07)**, en
> [foundations-check.md](./foundations-check.md). Implementado como se describe, con tres
> precisiones: el prefijo `__Host-` y `Secure` se emiten siempre salvo en modo desarrollo
> (`npm run dev`) con el origen local por HTTP, único caso en que la configuración admite un
> origen que no sea HTTPS; la política de referencia es
> `same-origin`, porque con `no-referrer` el navegador envía `Origin: null` en los formularios;
> y los fallos de una cuenta se acumulan mientras no pasen 30 minutos sin ninguno, para que el
> bloqueo máximo de 15 minutos se mantenga ante quien insiste.

**Decisión**: cuentas locales y sesiones en el servidor, solo con primitivas existentes de
`node:crypto`. No se usa autenticación básica.

**Contraseñas**:

- Derivación con `scrypt`, con sal aleatoria de 16 bytes por cuenta y parámetros de coste
  guardados junto a cada huella, para poder subirlos sin invalidar cuentas. Parámetros de
  partida: N = 2^17, r = 8, p = 1, que se confirman midiendo en el servidor de destino.
- Comparación con `timingSafeEqual`. Ante un usuario inexistente se calcula igualmente una
  derivación, para no revelar qué cuentas existen.
- Longitud mínima de 12 caracteres, sin reglas de composición. La contraseña inicial la fija
  quien administra con el script de altas y se cambia en el primer acceso.
- Las contraseñas y sus huellas no aparecen en registros, auditoría ni mensajes de error.

**Sesiones**:

- Identificador aleatorio de 256 bits (`randomBytes`); en la base se guarda solo su SHA-256.
- Cookie con prefijo `__Host-`, `Secure`, `HttpOnly`, `SameSite=Strict` y `Path=/`.
- **Caducidad**: 30 minutos de inactividad y 12 horas de duración máxima; ambos valores son
  configuración.
- **Revocación**: al cerrar sesión; al cambiar la contraseña, los perfiles o el estado de la
  cuenta, se revocan todas sus sesiones; un script de administración revoca las de una cuenta
  o todas. Los perfiles se leen de la base en cada petición, no de la sesión.
- El identificador se renueva al iniciar sesión, para impedir la fijación de sesión.

**Intentos repetidos**: retraso creciente y bloqueo temporal por cuenta, más un límite
global de intentos por unidad de tiempo, con contadores en la base. El mensaje de error es el
mismo para cualquier fallo. Cada intento se audita, sin la contraseña.

**CSRF**: toda petición que cambia estado exige a la vez una comprobación de origen
(`Origin` y `Sec-Fetch-Site` contra el origen público configurado) y un testigo aleatorio
ligado a la sesión, enviado en el formulario. **También la entrada**: el formulario de inicio
de sesión crea una sesión previa anónima, sin ningún permiso, con su propio testigo; el envío
lo exige. Al autenticar se descarta y se crea una sesión nueva.

**Superficie sin autenticación**: el formulario de entrada y su envío, y nada más. No
conceden acceso a documentos, proyectos, generación, aprobaciones ni descargas. La página de
entrada se sirve sin depender de recursos que requieran sesión. Lo ampara la aclaración del
principio V en la enmienda 2.0.0.

**Perfiles**, cada uno justificado por requisitos:

| Perfil    | Puede                                                                                   | Requisitos                        |
| --------- | --------------------------------------------------------------------------------------- | --------------------------------- |
| `admin`   | Fijar y modificar el límite de coste; conciliar operaciones inciertas; ver registros    | FR-027, FR-028, FR-021            |
| `teacher` | Registrar documentos, revisar, validar, aprobar, generar dentro del límite, exportar, descargar y consultar el historial | FR-026, FR-027, FR-054 |

No hay un perfil de solo lectura: ningún requisito lo pide. Una cuenta sin perfiles puede
iniciar sesión y nada más; existe porque FR-054 exige distinguir a quien no tiene esas
capacidades y SC-007 exige probar su denegación. Una persona puede tener los dos perfiles.

**Justificación**: sin servicio externo ni dependencias; pocos usuarios; identificadores
seudónimos, sin correo ni nombre real.

**Alternativas consideradas**:

- **OIDC con un proveedor externo** o **una biblioteca de autenticación**: resuelven casos
  que el piloto no tiene y añaden un servicio o una dependencia.
- **Autenticación HTTP básica**: descartada por el mantenedor; no se adopta para esquivar una
  cuestión de redacción.
- **Delegar en el proxy inverso**: saca del producto la identidad que deben registrar las
  aprobaciones.
- **Testigos firmados sin estado (JWT)**: complican la revocación, que aquí es un requisito.

**[por verificar]**: coste de `scrypt` con esos parámetros en el servidor de destino, y que
la página de entrada puede servirse sin recursos estáticos protegidos.

## R3. Superficie de entrega

> **Resultado de la implementación (2026-10-07)**. Las páginas escriben su respuesta completa
> desde `getServerSideProps`, con una plantilla propia que escapa todo valor interpolado, en
> lugar de dejar que Next.js renderice el componente. Así el HTML no carga scripts ni recursos
> del framework, es idéntico en desarrollo y en producción, y la frontera no necesita delegar
> ninguna ruta de recursos estáticos. No se ha añadido ninguna dependencia.

**Decisión**: páginas del Pages Router renderizadas en el servidor para la interfaz docente y
API Routes para las mutaciones, todas detrás de la frontera HTTP de `server.mjs`, ampliada con
una lista cerrada de rutas de producto. Formularios HTML que funcionan sin JavaScript de
cliente salvo donde la accesibilidad lo requiera. La subida del PDF es un cuerpo
`application/pdf` sin `multipart`.

**Justificación**:

- Es lo que ADR 0001 previó: "la primera porción vertical de producto definirá sus puntos de
  entrada y ampliará esta regla".
- Reutiliza Next.js y React, ya presentes.
- El cuerpo sin `multipart` evita un analizador de formularios y permite limitar el tamaño en
  la frontera.

**Consecuencias que exigen ADR**: cambian tres puntos de la decisión 8 del ADR 0001 y uno de
la decisión 5. Se registran en el [ADR 0004](../../docs/adr/0004-product-surface-persistence-identity-and-generation.md),
Propuesto. `/api/health` conserva sin cambios su contrato y su excepción.

**Alternativas consideradas**: HTML generado a mano desde API Routes (reimplementa
renderizado y escapado); App Router (descartado en ADR 0001); aplicación de una sola página
con API JSON (más código de cliente y peor accesibilidad de partida).

## R4. PDF: extracción, contenido activo y aislamiento

> **Decisión tras la viabilidad (2026-10-07)**, en [feasibility.md](./feasibility.md). Lo
> que sigue describe el plan original de detección; **queda sustituido** por el apartado
> "Inspección estructural" de más abajo. La extracción de texto no cambia.

> **Resultado de la implementación (2026-10-07)**, en [us1-check.md](./us1-check.md).
> Implementado como describe "Inspección estructural", con cuatro precisiones: qpdf se
> instala como herramienta verificada de varios ficheros, para las cuatro plataformas; el
> cifrado lo declara qpdf a partir de la estructura, antes de pedirle el resto, sin depender
> de su proveedor criptográfico; el número de páginas que ve qpdf debe coincidir con el que ve
> `pdfjs-dist`, o el documento se rechaza; y una página se considera sin texto extraíble sin
> ningún umbral, como fija FR-064.

Son tres problemas distintos. Resolver uno no acredita los otros.

**Extracción de texto**. `pdfjs-dist` obtiene el texto página a página y el número de
páginas. Una página se considera sin texto extraíble cuando su texto normalizado queda por
debajo de un umbral configurable. Que la extracción sea fiel al documento no lo garantiza la
biblioteca: lo comprueban las citas contra el texto de su página (SC-004) y la revisión
humana del inventario contra la sección original (FR-057).

**Detección de contenido activo**. Antes de extraer, se rechaza el documento si está
cifrado, si no se puede analizar, o si declara JavaScript, acciones automáticas (de apertura
o adicionales), acciones de lanzamiento, ficheros incrustados, formularios XFA o contenido
multimedia enriquecido. Se usan las consultas de `pdfjs-dist` sobre el catálogo y las
anotaciones, y se rechaza también cuando no se puede determinar. **Límite declarado**: esto
reduce el riesgo, pero no demuestra que un PDF sea inofensivo; un documento manipulado puede
ocultar contenido a un analizador concreto.

**Inspección estructural (sustituye a la detección anterior)**. La estructura del documento
se obtiene con **qpdf**, en su salida JSON versión 2, que entrega cada objeto ya interpretado
y sus referencias: resuelve los flujos de objetos, las actualizaciones incrementales y los
nombres escapados. `pdfjs-dist` se mantiene solo para extraer el texto. La política es código
propio que se aplica sobre esa estructura, no sobre los bytes del fichero:

- rechaza las claves y acciones de JavaScript, XFA, acciones automáticas, lanzamientos y
  ficheros incrustados, siguiendo las referencias indirectas;
- admite un formulario solo si todos sus campos son de firma digital y ninguno tiene
  acciones; cualquier otro formulario se rechaza;
- distingue los atributos del árbol de estructura de los PDF etiquetados, que usan la misma
  clave que las acciones;
- rechaza el documento si qpdf termina con error o con avisos, si se excede un límite o si
  una referencia no se puede resolver.

Probado con 26 casos sintéticos y dos documentos oficiales, con el mismo resultado usando el
binario oficial de qpdf 12.4.2 y su biblioteca. **Límites**: qpdf no es un antivirus y su
éxito no garantiza un PDF seguro; lo que qpdf interpreta puede diferir de lo que interprete
un visor; los bytes de objetos liberados por una actualización no se examinan; la política
es una lista finita; y no se valida criptográficamente ninguna firma.

**Alternativas descartadas**: las consultas de `pdfjs-dist` (no detectan cuatro de seis
clases y dan un falso positivo con el documento oficial); buscar marcas en los bytes (falsos
positivos y negativos); un analizador propio de la sintaxis del fichero (descartado por el
mantenedor como detector definitivo).

**Aislamiento**. Lo anterior se ejecuta en un proceso hijo sin acceso a la base de datos, a
la configuración ni a los secretos, con límite de tiempo, de memoria y de tamaño de entrada y
de salida, y con el modelo de permisos de Node.js limitando el sistema de ficheros al
documento. Su salida se valida con un esquema antes de usarse. **Límite declarado**: un
proceso hijo contiene bloqueos y consumo excesivo, y reduce lo que un fallo del analizador
puede alcanzar; no es un entorno estanco frente a una vulnerabilidad del propio Node.js.

**Defensas que no dependen de la detección**: el PDF nunca se ejecuta ni se convierte; se
sirve solo a usuarios autorizados, con su tipo exacto, `X-Content-Type-Options: nosniff` y
una política de contenido restrictiva; su texto se trata siempre como dato (FR-004).

**Acceso a la página de origen**: se abre el PDF registrado en la página exacta, junto al
texto extraído de esa página.

**Comprobación de viabilidad temprana** (tarea propia, antes de construir la historia 1):

| Documento de prueba                               | Resultado esperado                                         |
| ------------------------------------------------- | ---------------------------------------------------------- |
| PDF real del piloto                               | Aceptado; texto por página; sección de UF0517 localizable  |
| Otro PDF oficial del BOE, de otra disposición     | Aceptado; texto por página                                 |
| PDF con una página solo imagen                    | Aceptado; esa página, identificada sin texto               |
| PDF con una página en blanco                      | Aceptado; esa página, identificada sin texto               |
| PDF cifrado                                       | Rechazado, con motivo                                      |
| PDF truncado o dañado                             | Rechazado, con motivo                                      |
| PDF con JavaScript                                | Rechazado, con motivo                                      |
| PDF con acción de apertura o de lanzamiento       | Rechazado, con motivo                                      |
| PDF con fichero incrustado                        | Rechazado, con motivo                                      |
| Fichero que no es PDF, con extensión `.pdf`       | Rechazado, con motivo                                      |
| PDF por encima del tamaño o de las páginas máximas | Rechazado antes de analizarlo                             |
| PDF que agota el tiempo o la memoria del proceso  | Rechazado; el servidor sigue respondiendo                  |

Los documentos sintéticos se generan con un script del repositorio. La comprobación fija los
límites de partida (tamaño, páginas, tiempo y memoria) y registra el resultado de cada caso.
Si la detección de algún tipo de contenido activo no resulta fiable, se decide entonces entre
un análisis propio de la estructura del fichero o rechazar por defecto esa clase de
documentos; no se acepta en silencio.

**Alternativas consideradas**: `pdftotext` (dependencia del sistema, distinta entre macOS y
Linux); `pdf-parse` (envoltorio poco mantenido); enviar el PDF al modelo (sin texto por
página verificable y con coste); OCR (fuera del alcance); un contenedor por documento
(aislamiento mayor, pero infraestructura que el piloto no justifica todavía).

## R5. Vigencia de validaciones y aprobaciones, y edición simultánea

**Decisión**: la vigencia se **deriva**, no se propaga. Cada elemento editable tiene un número
de revisión. Cada validación o aprobación guarda las revisiones exactas de lo que aprueba y de
aquello en lo que se apoya. Una aprobación está vigente solo si todas esas revisiones siguen
siendo las actuales. Guardar exige indicar la revisión que se abrió; si no coincide con la
actual, se rechaza con conflicto y se devuelve el contenido enviado junto al actual.

**Justificación**:

- Invalidar no requiere escribir nada: editar el índice cambia su revisión y, con ello, dejan
  de estar vigentes su aprobación, las de todos los temas y la de la versión (FR-059), sin
  cascadas que puedan olvidarse.
- Las aprobaciones invalidadas permanecen en el registro tal como se hicieron.
- La descarga comprueba la vigencia en cada petición (FR-062); un enlace antiguo no tiene
  nada que eludir.
- El mismo número de revisión resuelve la edición simultánea (FR-063) sin bloqueos.

**Alternativas consideradas**: marcar como invalidadas en cascada (un olvido deja una
aprobación vigente por error); bloqueo pesimista (bloqueos huérfanos); fusión automática o
edición en tiempo real (fuera del alcance).

## R6. Generación, salidas estructuradas y presupuesto

**Decisión**: una interfaz propia, `GenerationProvider`, y un adaptador determinista para
las pruebas y la integración continua. **El proveedor real no está seleccionado**: Anthropic
es candidato. No se instala ningún SDK, no se contrata nada y no se hacen llamadas de pago
hasta que el mantenedor concrete proveedor, modelo, moneda y presupuesto. El adaptador real
es una tarea posterior, bloqueada por ese dato. Toda salida se pide con un esquema y se
valida con Zod antes de guardarse; una salida inválida se rechaza y se registra. En el
piloto no hay reintentos automáticos (FR-019): otro intento es una acción explícita. Los prompts son ficheros versionados del repositorio.

**Lo que acredita cada adaptador**: el determinista acredita los contratos, los bloqueos y
el presupuesto. No acredita la calidad de la generación ni el coste real. La aceptación del
recorrido (SC-024) exige el proveedor real.

**Presupuesto**: un límite acumulado del proyecto, sin reinicios, y un máximo por operación.
El periodo es el ciclo completo del proyecto piloto, como aclara la enmienda 2.0.0 en el
principio IX. Se lleva como un libro de asientos:

1. **Reserva**. Antes de enviar, en una transacción que bloquea la escritura, se comprueba
   que el coste máximo de la operación cabe en el máximo por operación y en lo disponible, y
   se anota la reserva. Si no cabe, la operación no se envía.
2. **Envío**. Se anota que la operación se ha enviado antes de llamar al proveedor.
3. **Liquidación**. Con el consumo confirmado por el proveedor, la reserva se sustituye por
   el coste real.

Disponible = límite − liquidado − reservado − incierto.

**Concurrencia**: la reserva es atómica; dos operaciones simultáneas no pueden reservar el
mismo saldo. Con una única instancia y un único escritor, la transacción basta.

**Resultados inciertos**: una reserva solo se **libera** cuando consta que la operación no
llegó a enviarse. Si se envió y no hay consumo confirmado (tiempo agotado, conexión cortada,
respuesta sin datos de uso), pasa a **incierta** y sigue contando por su importe máximo. No
se trata como si no hubiera costado nada. Una operación incierta solo se cierra cuando un
administrador la **concilia** con el importe que conste en el proveedor, y la conciliación
queda registrada con actor, fecha e importe.

**Caídas**: al arrancar, toda reserva que figure como enviada y sin liquidar pasa a incierta;
las que no llegaron a enviarse se liberan. Ninguna generación se reanuda sola (FR-066).

**Reducción del límite**: no toca reservas ni operaciones en curso; solo impide las nuevas
(FR-021).

**Precios**: por modelo, en configuración, con su moneda. Se fijan al elegir proveedor.

**Alternativas consideradas**:

- **Elegir ya un proveedor**: no hay cuenta con facturación; decidirlo ahora no desbloquea
  nada, porque la interfaz y el adaptador determinista bastan para construir y probar.
- **Modelo local**: sin coste por uso, pero con calidad y requisitos de máquina inciertos.
- **Contar el gasto después, sin reserva**: permite superar el límite con operaciones
  simultáneas.
- **Liberar las reservas inciertas pasado un tiempo**: subestima el gasto justo cuando no se
  conoce.

## R7. Modelo de contenido y saneamiento

**Decisión**: el contenido de un tema no se guarda como HTML, sino como una lista de bloques
estructurados validados por esquema (`requirement` y `development`, con párrafos, listas y
encabezados de texto plano). El HTML lo produce siempre un renderizador propio que escapa todo
el texto, tanto en la revisión como en el paquete.

**Justificación**: sin HTML de entrada no hay nada que sanear con heurísticas; la distinción
entre norma y desarrollo didáctico es un dato del modelo, no un estilo; y el mismo
renderizador garantiza que la vista previa y el paquete muestran lo mismo.

**Alternativas consideradas**: HTML saneado con una biblioteca; Markdown.

## R8. Generación y conformidad del paquete SCORM 1.2

> **Resultado de la viabilidad (2026-10-07)**, en [feasibility.md](./feasibility.md).
> `xmllint-wasm` valida contra los esquemas de SCORM 1.2 sin red y acepta manifiestos ajenos.
> Los esquemas no restringen `masteryscore`, así que esa regla va en la comprobación propia.
> Quedan por decidir el origen de referencia de los esquemas y si pueden redistribuirse.

> **Revisión del 2026-10-08 (decisión del mantenedor)**. La validación contra los XSD se
> **sustituye** por una estrategia explícita, descrita más abajo en «Conformidad del
> manifiesto». La decisión anterior se conserva en ese apartado, con el motivo de la
> sustitución.

**Decisión**: SCORM 1.2, un único SCO y generador propio. El manifiesto `imsmanifest.xml` se
produce desde una plantilla con escapado, con una organización, un ítem y un recurso `sco`.
El contenido es una página `index.html` con todos los temas, una hoja de estilos y un script,
sin recursos externos. El ZIP se crea con `fflate`, con entradas ordenadas y fechas fijas. El
envoltorio de la API de SCORM es propio y mínimo.

**Estado de seguimiento**:

- `cmi.core.lesson_location`: identificador del último tema visitado.
- `cmi.suspend_data`: versión del formato, identificador de la versión aprobada y un mapa de
  bits de temas marcados, dentro de los 4096 caracteres del formato.
- `cmi.core.lesson_status`: `incomplete` al iniciar; `completed` solo al pulsar «Finalizar».
- `cmi.core.exit`: `suspend` al salir sin finalizar.
- Nunca se escribe `cmi.core.score.*`, ni `passed` o `failed`, y el manifiesto no declara
  puntuación de dominio.

**Tamaño máximo de temario**: 200 temas por paquete, comprobado al exportar (FR-048).

**Conformidad del manifiesto (decisión vigente desde el 2026-10-08)**. Una validación escrita
por quien escribe el generador solo repite sus suposiciones. La estrategia del piloto tiene
cuatro mecanismos:

1. **Lectura del XML con un analizador mantenido y ajeno al generador.** El generador escribe
   el manifiesto con una plantilla de texto; al releerlo lo analiza libxml2, con
   `libxml2-wasm`, sin recuperación ni recursos externos, y cualquier error o aviso del
   analizador es un rechazo.
2. **Reglas del perfil SCORM 1.2 que exporta AulaNorma**, separadas del análisis sintáctico:
   estructura del manifiesto y del ZIP, un único SCO, versión aprobada, ninguna dirección
   externa, ningún dato de usuarios y una forma restringida del manifiesto.
3. **Pruebas negativas y referencias ajenas**: paquetes incorrectos hechos a mano que deben
   rechazarse, y manifiestos no producidos por el generador que deben aceptarse.
4. **Verificación real en Moodle** de la importación, el seguimiento, la reanudación y la
   finalización, **como condición obligatoria de aceptación**.

Esta estrategia **no equivale a validar contra los XSD** y **no acredita conformidad completa
con SCORM**. No es un validador de paquetes SCORM en general. Qué comprueba exactamente cada
mecanismo y qué deja fuera está en [package-validation.md](./package-validation.md).

**Por qué se sustituyó la validación con XSD.** No se pudieron acreditar las condiciones de
uso de los esquemas ([scorm-schemas.md](./scorm-schemas.md)): el de ADL no se obtuvo de su
editor, no lleva ningún aviso y su especificación dice «All Rights Reserved» sin conceder
permisos; los de IMS pueden descargarse y usarse, pero su licencia no concede de forma
expresa redistribuirlos. Sin el esquema de ADL no hay validación de un manifiesto de SCORM
1.2. El mantenedor decidió no depender de ellos en el piloto.

**Qué se pierde con el cambio.** Un criterio externo y completo sobre la forma del
manifiesto: el orden y la cardinalidad de los elementos, los tipos de los valores y los
atributos de cada elemento. Lo compensan, sin igualarlo, el analizador ajeno, las
referencias de terceros y, sobre todo, la prueba en Moodle, que deja de ser solo una
comprobación de compatibilidad y pasa a ser la que decide la aceptación.

**Sobre el analizador elegido.** `libxml2-wasm` 0.7.2: libxml2 compilado a WebAssembly,
estricto, mantenido, sin dependencias ni scripts de instalación. Sustituye desde el
2026-10-08 a `@xmldom/xmldom`, que fue la primera elección de esta estrategia: está mantenido,
pero es tolerante y aceptaba sin avisar cinco errores de buena formación. Cubrirlos con
reglas léxicas propias era volver a analizar XML a mano, así que se cambió de analizador.
`saxes`, también estricto, tiene el repositorio archivado desde 2025. La comprobación del
candidato está en [package-validation.md](./package-validation.md).

**Decisión anterior, sustituida (2026-10-07)**. Se conserva como historial. Preveía tres
comprobaciones independientes entre sí:

1. **Esquemas oficiales**. El manifiesto se valida contra los XSD publicados de SCORM 1.2
   (empaquetado de contenidos de IMS y extensión de ADL), guardados en el repositorio con su
   procedencia. Se usa `xmllint-wasm`, que es `libxml2` compilado a WebAssembly: valida XSD
   sin código nativo ni scripts de instalación. Se ejecuta en cada exportación, antes de
   ofrecer la descarga, y en las pruebas.
2. **Reglas que los esquemas no expresan**, escritas a partir de la especificación del
   formato y no del generador: manifiesto en la raíz; cada fichero declarado existe y no
   sobra ninguno; el recurso lanzable es un SCO; ninguna URL externa; identificador de
   versión correcto; ningún dato de usuarios. Se prueban con manifiestos y paquetes
   incorrectos hechos a mano, que deben rechazarse.
3. **Un paquete de referencia ajeno**. Un paquete SCORM 1.2 mínimo no producido por el
   generador pasa las dos comprobaciones anteriores, para detectar un validador que solo
   acepte lo que AulaNorma genera.

Ninguna de las tres acreditaba la compatibilidad con Moodle: la importación y el seguimiento
en una instancia real ya eran obligatorios. De esta decisión se mantienen la segunda y la
tercera comprobación; la primera es la que se sustituye.

**Justificación**: el principio V limita el código del paquete al necesario; un SCO único no
necesita un empaquetador genérico; los esquemas oficiales son un criterio externo al
generador.

**Alternativas consideradas**:

- **Solo validación estructural propia**: se descartó por circular. La estrategia vigente no
  vuelve a ella: añade un analizador ajeno, referencias de terceros y la prueba en Moodle
  como condición de aceptación.
- **Validación con XSD** (decisión anterior): sustituida el 2026-10-08, por lo dicho arriba.
- **Obtener los esquemas en la preparación del entorno**, sin redistribuirlos: resolvía la
  redistribución, pero seguía necesitando usar el esquema de ADL sin permiso acreditado.
- **`saxes`**: analizador estricto, con el repositorio archivado.
- **`@xmldom/xmldom`**: mantenido, pero tolerante con errores de buena formación.
- **Validador XSD con código nativo**: incompatible con `ignore-scripts=true`.
- **Banco de pruebas de conformidad de ADL**: pensado para ejecución manual en entornos
  antiguos; no es automatizable aquí.
- **Empaquetadores de terceros** y **`pipwerks`**: código ajeno poco mantenido, dentro del
  paquete o de la generación, para algo pequeño.
- **`archiver`, `jszip`, `yazl`**: más dependencias transitivas que `fflate`.

**Prueba de contrato del seguimiento**: el script del paquete se ejecuta en `jsdom`
(dependencia solo de desarrollo) contra un doble de la API de SCORM 1.2 que registra las
llamadas y aplica los límites del formato (SC-017).

**[por verificar] (de la decisión anterior)**: que `xmllint-wasm` valida esos esquemas sin acceso a la red, resolviendo
en local sus importaciones; y las condiciones de redistribución de los XSD, para guardarlos
en el repositorio o, si no se pudiera, obtenerlos con procedencia en la preparación.

**Estado (2026-10-08)**: esa verificación queda sin objeto. No se incorporó ningún XSD ni se
instaló `xmllint-wasm`; la decisión vigente está al principio de «Conformidad del
manifiesto».

## R9. Estructura de módulos y migración a `content-export`

**Decisión**: las cuatro capas contienen el dominio; `src/platform` gana cuatro áreas
transversales (`persistence`, `identity`, `audit` y `generation`). La migración de
`moodle-publication` a `content-export` es el primer cambio de código, en un PR propio, sin
lógica nueva, que actualiza a la vez todo lo que enumera el ADR 0003.

**Justificación**: hacerla antes de escribir código de exportación evita renombrar un módulo
con contenido; hacerla sola mantiene el PR revisable.

**Alternativas consideradas**: migrar junto con la primera lógica de exportación; posponerla
al final.

## R10. Dependencias nuevas

| Dependencia    | Tipo       | Para qué                                   | Sin ella                        |
| -------------- | ---------- | ------------------------------------------ | ------------------------------- |
| `pdfjs-dist`   | producción | Texto por página y análisis del PDF        | Herramienta del sistema         |
| `fflate`       | producción | Crear y releer el ZIP del paquete          | Escritor ZIP propio             |
| `libxml2-wasm` | producción | Leer el manifiesto con un analizador ajeno | Lector de XML propio          |
| `jsdom`        | desarrollo | Prueba de contrato del seguimiento         | Navegador automatizado          |

`xmllint-wasm` figuraba aquí como dependencia de producción para validar contra los XSD. Se
retiró el 2026-10-08 sin llegar a instalarse, y la sustituye `libxml2-wasm` (MIT, sin
dependencias propias), con otro cometido: leer el manifiesto, no validarlo contra esquemas.
Entre medias se usó `@xmldom/xmldom`, retirado por tolerante.

Además, una **herramienta externa**, que no es un paquete de npm: **qpdf** (12.4.2 en la
viabilidad), para la inspección estructural de los PDF. Se instalaría como las herramientas
de seguridad ya existentes: binario oficial con su huella fijada y verificada. Su coste
operativo está en [feasibility.md](./feasibility.md).

El SDK de un proveedor de generación **no se añade todavía**: se decidirá con el proveedor.
Persistencia, identidad, sesiones y criptografía no añaden ninguna dependencia. Las versiones
se fijan exactas al añadirlas y pasan por el control `dependencies` existente.

## R11. Despliegue del piloto y copia de seguridad

**Decisión**: el piloto es una aplicación web en un servidor, accesible desde otros equipos
con navegador y HTTPS. El proceso de la aplicación sigue escuchando en `127.0.0.1:3000` (ADR
0001) detrás de un proxy inverso que termina TLS. Dominio y destino quedan por concretar; el
plan no toca el servidor ni sus servicios, y entrega un procedimiento de despliegue y otro de
copia y restauración.

**Despliegue aislado**:

- Cuenta de sistema propia y sin privilegios, directorio de instalación de solo lectura para
  esa cuenta y un único directorio de datos con permisos restringidos.
- Un servicio propio, que no comparte proceso, usuario ni datos con otros servicios del
  servidor.
- El proxy solo reenvía al puerto local; redirige HTTP a HTTPS y envía `Strict-Transport-Security`.
- Secretos y configuración en un fichero de entorno fuera del repositorio, legible solo por
  esa cuenta.

**Consecuencias en la aplicación**:

- Una clave de configuración nueva con el **origen público** (`https://…`), contra la que se
  comprueban `Origin` y `Host`. La aplicación no confía en cabeceras `X-Forwarded-*`.
- Las cookies exigen `Secure`; en desarrollo local, `127.0.0.1` cuenta como contexto seguro.
- Límites de tamaño de petición coherentes en el proxy y en la frontera.

**Almacenamiento persistente**: el directorio de datos contiene la base de datos y el
almacén de ficheros, en disco local del servidor.

**Copia de seguridad coordinada**. Copiar la base y los ficheros por separado no basta por
sí solo: la coherencia depende de tres reglas de escritura y de una verificación.

*Reglas de escritura (las cumple la aplicación)*:

1. **El fichero se publica antes de referenciarlo.** Se escribe en un fichero temporal del
   mismo directorio, se sincroniza a disco, se renombra a su nombre definitivo (su huella) y
   se sincroniza el directorio. Solo entonces se confirma la transacción que lo referencia.
2. **Un fichero publicado no cambia ni se borra.** Su nombre es su huella; si ya existe, no
   se reescribe.
3. **Ninguna fila referencia un fichero que no esté publicado.** Un fallo entre el paso 1 y
   la transacción deja, como mucho, un fichero sin referencia, que es inocuo.

*Procedimiento de copia*:

1. Copia en línea de la base con la operación `backup` de SQLite, que da una instantánea
   coherente de un instante, sin detener el servicio.
2. **Después**, copia de los ficheros. Por las reglas anteriores, todo lo que la instantánea
   referencia ya estaba publicado antes de ese instante; lo publicado después sobra, pero no
   falta nada.
3. **Verificación de la propia copia**, antes de darla por buena: se recorre cada referencia
   de la instantánea y se comprueba que su fichero está en la copia y que su huella coincide.
   Si falta uno o no coincide, la copia se marca como fallida.
4. Registro con fecha, tamaño y huella, y traslado fuera del servidor. La copia contiene
   huellas de contraseñas y documentos: se guarda con acceso restringido.

*Operaciones en curso al copiar*: la instantánea las recoge tal como estaban. Al restaurar,
el arranque aplica las mismas reglas que tras una caída: toda generación enviada y sin
liquidar pasa a incierta y sigue contando (R6); todas las sesiones se revocan; una
exportación sin terminar no existe en la base, porque su fila solo se escribe con el paquete
ya publicado y validado.

*Prueba de restauración*: en un directorio limpio, la aplicación arranca, la verificación de
integridad de SQLite pasa, se repite la comprobación de referencias y huellas, y se
confirma el estado de las operaciones en curso. Una copia cuya restauración no se ha probado
no cuenta como copia.

*Proporción*: una copia completa periódica basta para el volumen del piloto. No se plantean
copias incrementales, réplica ni recuperación a un instante.

> **Resultado de la implementación (2026-10-08)**. La copia y su verificación están en
> `src/platform/persistence` y se ejecutan con `scripts/ops/backup.mjs`; la restauración
> comprobada, con `scripts/ops/verify-restore.mjs`. Tres precisiones sobre lo decidido arriba:
>
> - **Los paquetes exportados no se nombran por su huella**, sino por el identificador de su
>   exportación (`exports/<id>.zip`), con la huella en su fila. Las tres reglas de escritura
>   se cumplen igual: el paquete se sincroniza a disco, se renombra y se sincroniza su
>   directorio antes de confirmar la fila, y nunca se reescribe. La sincronización a disco
>   del paquete faltaba y se añadió con esta entrega.
> - **Revocar las sesiones es un paso de la restauración, no del arranque.** Un reinicio
>   normal conserva las sesiones abiertas; el arranque solo aplica la regla de las
>   generaciones. Por eso un directorio restaurado se pone en servicio únicamente a través
>   del script, que revoca las sesiones y aplica esa misma regla.
> - **La copia lleva un registro con su inventario y sus huellas**, y una restauración
>   rechaza una copia fallida, alterada, incompleta o con ficheros de más. La huella no es
>   una firma.
>
> - **Una restauración trabaja en un directorio interno del destino** y solo le pasa el
>   contenido, con la base de datos al final, si todas las comprobaciones y las reglas de las
>   operaciones en curso pasan. Si algo falla no queda nada, y un directorio de trabajo
>   abandonado impide abrir la base de datos.
> - **Los directorios que se crean al publicar también se sincronizan**, y un fichero que ya
>   existía se sincroniza de nuevo antes de darlo por publicado.
> - **`AULANORMA_ENVIRONMENT` admite `production`** para el piloto desplegado. Solo se anota
>   en los registros y exige un origen HTTPS también en modo desarrollo.
>
> La resistencia a una caída completa de la máquina no está probada: las pruebas comprueban
> el orden de las llamadas, no el estado del disco tras un corte de corriente.
>
> Comprobado con pruebas automáticas y con un ensayo local; nada en un servidor
> ([`deploy-check.md`](./deploy-check.md)).

**Alternativas consideradas**: uso exclusivamente local (descartado por el mantenedor);
contenedor (aísla más, pero depende de lo que haya en el destino, aún por concretar; el
procedimiento se escribe de modo que pueda adoptarse); TLS en la propia aplicación (duplica
lo que el proxy hace mejor).

**Dato del mantenedor**: dominio y servidor de destino. Solo bloquea el despliegue real, no
la implementación ni las pruebas.

## Comprobaciones manuales en Moodle (no son decisiones técnicas)

Estas preguntas solo las responde una instancia real y no se resuelven en el diseño. Se
ejecutan con el procedimiento de [quickstart.md](./quickstart.md) y su evidencia registra la
versión y la configuración exactas (SC-018 a SC-023).

- ¿Moodle importa el paquete sin errores ni avisos siguiendo solo las instrucciones?
- ¿Conserva los temas marcados y el último tema al salir y volver en el mismo intento, con la
  configuración de intentos elegida?
- ¿Muestra la actividad como finalizada tras «Finalizar», sin calificación, con el método de
  calificación y la finalización de actividad configurados como indiquen las instrucciones?
- ¿Qué ocurre al cerrar el navegador sin salir de forma ordenada?
- ¿Hay alguna petición a un servidor distinto del propio Moodle durante el recorrido?
- ¿Funciona igual en ventana nueva y en la misma ventana?

Hasta superarlas no se nombra ninguna versión de Moodle como compatible. Un resultado
negativo vuelve al diseño como defecto; no se corrige en las instrucciones.

**Dato del mantenedor**: versión de Moodle de la instancia de pruebas y quién la administra.
