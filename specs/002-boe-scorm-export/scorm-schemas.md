# Procedencia de los esquemas de SCORM 1.2

**Fecha**: 2026-10-08 | **Tareas**: T011 y T064 | **Research**: [research.md](./research.md) (R8) |
**Viabilidad**: [feasibility.md](./feasibility.md), apartado 3

Qué se sabe, fichero a fichero, de los XSD con los que se validaría el manifiesto, y qué
falta para poder usarlos. **Ningún XSD está en el repositorio ni en ningún paquete
exportado, la validación contra ellos no se ejecuta y T064 sigue abierta.** Nada de este
documento es un dictamen jurídico.

## Resultado

Tres usos distintos, que no tienen por qué compartir permisos:

| Uso                                                         | Esquemas de IMS (1EdTech)                        | Esquema de ADL                         |
| ----------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| **A. Descargarlos y usarlos para validar**, sin distribuirlos | Concedido por su licencia, con atribución        | **Sin acreditar**: ningún texto lo concede |
| **B. Incorporarlos al repositorio**                         | No concedido de forma expresa                    | **Sin acreditar**                      |
| **C. Incluirlos en el ZIP que descarga el docente**         | No concedido de forma expresa                    | **Sin acreditar**                      |

**Punto concreto pendiente**: las condiciones de uso de `adlcp_rootv1p2.xsd`. El fichero no
lleva ningún aviso, y el documento de la especificación al que pertenece dice «All Rights
Reserved» sin conceder ningún permiso. Sin ese fichero no hay validación de un manifiesto de
SCORM 1.2, porque es el que define `adlcp:scormtype` e importa el esquema de IMS.

Sobre **C** no hay nada que decidir: el diseño ya no incluye los XSD en el paquete y el
manifiesto no lleva `xsi:schemaLocation`.

## Esquema de ADL: `adlcp_rootv1p2.xsd`

### Origen

- **Del editor, ninguno.** Su dirección original, `http://www.adlnet.org/xsd/adlcp_rootv1p2.xsd`,
  responde con un error 500. `adlnet.gov` no respondió desde el entorno de trabajo en dos
  tandas de intentos el mismo día (conexión rechazada o agotada). La organización de ADL en
  GitHub no contiene el fichero en ninguno de sus cuatro repositorios de SCORM revisados.
- **Copias de terceros.** Una búsqueda en GitHub devuelve más de dos mil copias. Se
  descargaron seis de repositorios sin relación entre sí:

  | Copia | Repositorio                         | SHA-256 (inicio)   | Tamaño | Fin de línea |
  | ----- | ----------------------------------- | ------------------ | ------ | ------------ |
  | c1    | `cybercussion/SCOBot`               | `e1e807986d60ac9f` | 3 926  | CRLF         |
  | c2    | `atutor/ATutor`                     | `166397a1f52585ca` | 4 398  | LF           |
  | c3    | `tylershumaker/s1000d-scorm`        | `166397a1f52585ca` | 4 398  | LF           |
  | c4    | `adaptlearning/adapt-test-package`  | `166397a1f52585ca` | 4 398  | LF           |
  | c5    | `naturalis/markdown2scorm`          | `166397a1f52585ca` | 4 398  | LF           |
  | c6    | `beeznest/chamilo-lms-icpna`        | `1b70d294902f42c8` | 4 506  | CRLF         |

  Cuatro son idénticas byte a byte. Las otras dos difieren en el sangrado y en los fines de
  línea, no solo en estos: no se ha comprobado que sean equivalentes como esquema.

### Copia candidata

- **Fichero**: el de las cuatro copias coincidentes.
- **SHA-256**: `166397a1f52585caac857228cf2b10085a5d07c0612a3d55cb3ed108ce8b028a` (4 398 bytes).
- **Dirección fijada**, para poder repetir la descarga: `tylershumaker/s1000d-scorm`, commit
  `9e8be4a829f11b5b0b25ffdf85604aca891cc17b`, ruta `xsd_12/adlcp_rootv1p2.xsd`.
- **Versión**: se declara `version="ADL Version 1.2"` y `filename=adlcp_rootv1p2.xsd`.
- **Dependencias**: importa `imscp_rootv1p1p2.xsd` por ruta relativa.
- **Avisos que lleva**: **ninguno**. Ni derechos de autor, ni licencia, ni autor.
- **Qué acredita la coincidencia**: que es la copia más difundida. **No acredita que sea la
  que publicó ADL**: no hay ninguna copia del editor con la que compararla.

### Condiciones

- El fichero no dice nada.
- El documento «SCORM Version 1.2, The SCORM Content Aggregation Model» (1 de octubre de
  2001, 180 páginas) se leyó entero en dos copias de terceros idénticas entre sí (SHA-256
  `312c0fdfa69d4dfd…`). Cada página lleva «© 2001 Advanced Distributed Learning. All Rights
  Reserved.». No contiene ninguna cláusula de permiso, licencia, reproducción ni
  redistribución. Tampoco se pudo leer desde el editor.
- La licencia de los repositorios que alojan las copias **no se aplica al fichero**: quien
  lo copia no puede conceder derechos que no tiene. El repositorio de la copia fijada, por
  ejemplo, ofrece su propio código bajo LGPL, EPL o Apache, y eso no alcanza a un esquema
  de ADL.
- Otras ediciones de SCORM se publican con otras condiciones (la documentación de SCORM
  2004, con una licencia Creative Commons no comercial, según referencias indirectas). No
  se extienden a esta sin leerlas.

**Conclusión**: para ninguno de los tres usos hay un permiso acreditado. Que sea práctica
habitual distribuir este fichero dentro de los paquetes no es un permiso.

## Esquemas de IMS (1EdTech)

### Copias del editor

Descargadas el 2026-10-08 de `https://www.imsglobal.org/xsd/`, con respuesta 200.

| Fichero                | Versión declarada            | SHA-256                                                            | Bytes  | Importa        |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------ | ------ | -------------- |
| `imscp_rootv1p1p2.xsd` | `IMS CP 1.1.2`               | `029cd01047bc90371fc0d3156f97bc2cf0c2d84cdf908f7c6576fc707ef76783` | 13 601 | `ims_xml.xsd`  |
| `imsmd_rootv1p2p1.xsd` | `1.2:1.1 IMS:MD1.2`          | `bbe146eb770b14435c47fc95ea261b3b57c45aeeeba139b9a1d6b16d83490b52` | 20 253 | `ims_xml.xsd`  |
| `ims_xml.xsd`          | —                            | `d5ee21b60f118e42f70837e66ef99f9b9977b7d9cf2bb321346371f2fa22a6b2` | 1 104  | —              |

### Avisos originales, leídos en los ficheros

- `imscp_rootv1p1p2.xsd`: «Copyright (2) 2001 IMS Global Learning Consortium, Inc.» en un
  comentario y «Copyright (c) 2001 IMS GLC, Inc.» en su documentación. Se describe a sí
  mismo como «DRAFT XSD for IMS Content Packaging version 1.1 DRAFT».
- `imsmd_rootv1p2p1.xsd`: ningún aviso de derechos de autor; solo «edited by Thomas Wason» y
  su historial de cambios.
- `ims_xml.xsd`: «edited by Thomas Wason IMS Global Learning Consortium, Inc.».
- Ninguno incluye un texto de licencia ni un enlace a una.

### Las copias que acompañan al esquema de ADL no son las del editor

Los cuatro repositorios con la copia coincidente del esquema de ADL llevan también una misma
copia de `imscp_rootv1p1p2.xsd` (`e45606348d7f5178…`, 14 560 bytes) y de
`imsmd_rootv1p2p1.xsd` (`83879be70d6bdff1…`, 22 196 bytes). **No coinciden con las del
editor**: difieren en cientos de líneas incluso tras normalizar espacios y fines de línea, y
llevan otra cabecera de edición. Sus copias de `ims_xml.xsd` no coinciden ni entre sí.
T011 validó con un juego de terceros; no se ha comprobado qué juego acepta y rechaza lo
mismo.

### Licencia, leída en su texto original

«1EdTech Consortium, Inc. - Specification Document License», en
`https://www.1edtech.org/standards/specification-license`, descargada el 2026-10-08 (SHA-256
de la página `175d28e3c3ed492b…`) y leída íntegra, sin resumen automático.

- **Cláusula 3**: concede una licencia «worldwide, perpetual, royalty-free, nontransferable,
  nonexclusive, nonsublicenseable […] to download and utilize the Specification(s) for the
  purpose of developing, making, having made, using, marketing, importing, offering to sell
  or license, and selling or licensing, and to otherwise distribute, products that implement
  this Specification(s)».
- **Cláusula 2.c**: «Any use of the Specifications(s) or other Materials provided by 1EdTech
  must be accompanied by the copyright legends provided with full attribution given to
  1EdTech.»
- **Cláusula 4**: «No right to create modifications or derivatives of 1EdTech documents is
  granted pursuant to this license.»
- **Cláusula 5**: «This license pertains to the specification from which this statement is
  linked.»

Lectura para cada uso:

- **A. Validar**: descargar y utilizar para desarrollar un producto que implementa la
  especificación es lo que concede la cláusula 3. Exige la atribución de la 2.c.
- **B. Repositorio**: publicar los ficheros es distribuir la especificación misma. La
  cláusula 3 permite distribuir *productos que la implementan*, no la especificación, y la
  licencia no se puede sublicenciar. **No está concedido de forma expresa.**
- **C. ZIP**: lo mismo que B, y además quien recibe el paquete no recibe ninguna licencia.
- **Una duda previa**: la cláusula 5 limita la licencia a la especificación «desde la que se
  enlaza». Los ficheros de 2001 no enlazan a ninguna. Que esta licencia de hoy cubra
  aquellos ficheros es una interpretación razonable, no un hecho comprobado.

## Qué se ha hecho en consecuencia

- **No se incorpora ningún XSD**, ni se ha instalado `xmllint-wasm`.
- **T064 sigue abierta.** Está hecha la parte que no depende de los esquemas.
- Cada exportación registra que la validación contra los esquemas no se ejecutó, y la página
  de exportación lo dice. Ningún texto del producto afirma conformidad con ellos.
- La comprobación propia **no sustituye** a los esquemas: research R8 la considera circular
  si es la única. Como contraste independiente se ha añadido el manifiesto SCORM 1.2 de un
  tercero, sin modificar (véase `tests/fixtures/scorm/third-party/`).

## Alternativa de diseño que se propone

**Obtener los cuatro esquemas en la preparación del entorno y validar solo allí donde se
preparan**, sin incorporarlos al repositorio ni a ningún paquete.

- `npm run tools:install` los descargaría de direcciones fijadas y comprobaría sus huellas,
  como ya hace con gitleaks, zizmor y qpdf. Quedarían fuera del control de versiones.
- La validación con `xmllint-wasm` se ejecutaría en las pruebas y en la integración
  continua, sobre el manifiesto que produce el generador y sobre los manifiestos
  incorrectos. Al exportar se ejecutaría también si los esquemas están instalados en el
  servidor, y si no, el registro seguiría diciendo que no se validó.
- Los usos B y C desaparecen. Queda el uso A.

Lo que **el mantenedor tendría que decidir** para adoptarla:

1. **Aceptar el uso A del esquema de ADL sin permiso acreditado**, con la copia candidata y
   su huella. Es el único punto que este documento no puede resolver.
2. **Qué juego de IMS usar**: el del editor, con licencia para el uso A, o el que acompaña
   al esquema de ADL en las copias de terceros. Se recomienda el del editor, comprobando
   antes que el esquema de ADL valida igual con él.
3. Si no se acepta el punto 1: **pedir el permiso a ADL** y mantener T064 abierta, o
   **renunciar a los XSD** corrigiendo research R8.
