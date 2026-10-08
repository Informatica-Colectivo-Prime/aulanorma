# Procedencia de los esquemas de SCORM 1.2

**Fecha**: 2026-10-08 | **Tareas**: T011 y T064 | **Research**: [research.md](./research.md) (R8) |
**Viabilidad**: [feasibility.md](./feasibility.md), apartado 3

Qué se sabe, fichero a fichero, de los XSD con los que se validaría el manifiesto, y qué
falta para poder incorporarlos. **Ningún XSD está en el repositorio ni se distribuye con el
producto**, y la validación contra ellos **no se ejecuta todavía**.

## Resultado

| Fichero                 | Editor                         | Origen comprobado                                  | Condiciones de uso y redistribución | Estado       |
| ----------------------- | ------------------------------ | -------------------------------------------------- | ----------------------------------- | ------------ |
| `adlcp_rootv1p2.xsd`    | ADL (Advanced Distributed Learning) | **Ninguno.** Su dirección original no responde | **Sin acreditar**                   | **Bloquea**  |
| `imscp_rootv1p1p2.xsd`  | IMS Global, hoy 1EdTech        | Sitio del editor, descargado el 2026-10-08         | Uso acreditado; redistribución no   | Utilizable descargándolo |
| `imsmd_rootv1p2p1.xsd`  | IMS Global, hoy 1EdTech        | Sitio del editor, descargado el 2026-10-08         | Uso acreditado; redistribución no   | Utilizable descargándolo |
| `ims_xml.xsd`           | IMS Global, hoy 1EdTech        | Sitio del editor, descargado el 2026-10-08         | Uso acreditado; redistribución no   | Utilizable descargándolo |

El esquema de ADL es el punto de entrada: define `adlcp:scormtype` e importa el de
empaquetado de IMS. Sin él no hay validación de un manifiesto de SCORM 1.2, así que los tres
de IMS, por sí solos, no bastan.

## Fichero a fichero

### `adlcp_rootv1p2.xsd` (extensión de ADL para SCORM 1.2)

- **Origen**: su dirección original, `http://www.adlnet.org/xsd/adlcp_rootv1p2.xsd`,
  responde hoy con un error 500. El sitio actual de ADL, `adlnet.gov`, no respondió desde el
  entorno de trabajo (conexión rechazada o agotada en varios intentos). Tampoco se obtuvo una
  copia fechada de un archivo web: la consulta fue rechazada por exceso de peticiones. **No hay ninguna copia cuyo origen sea el editor.**
- **Versión**: el propio fichero se declara «ADL Version 1.2», según las copias de terceros.
- **Huella**: no se fija ninguna. Las copias disponibles están en paquetes de ejemplo y en
  servidores de terceros, y T011 comprobó que las copias de los esquemas de IMS que
  acompañan a esos paquetes no son idénticas a las del editor. No hay base para elegir una.
- **Dependencias**: importa `imscp_rootv1p1p2.xsd`.
- **Condiciones**: no se ha podido leer ningún texto de licencia de ADL aplicable a los
  ficheros de SCORM 1.2. Lo único hallado son referencias indirectas a que la documentación
  de SCORM 2004 se publica con una licencia Creative Commons no comercial, que es otra
  edición y no se puede extender a esta sin leerla.
- **Pendiente, en concreto**: obtener el fichero del editor (o de la distribución oficial de
  SCORM 1.2) y el texto de sus condiciones.

### `imscp_rootv1p1p2.xsd` (empaquetado de contenidos de IMS, 1.1.2)

- **Origen**: `https://www.imsglobal.org/xsd/imscp_rootv1p1p2.xsd`, respuesta 200.
- **Versión**: `version="IMS CP 1.1.2"`. Su documentación interna lo describe como borrador.
- **Huella SHA-256**: `029cd01047bc90371fc0d3156f97bc2cf0c2d84cdf908f7c6576fc707ef76783`
  (13 601 bytes).
- **Dependencias**: importa `ims_xml.xsd` por ruta relativa.
- **Avisos que lleva**: «Copyright (c) 2001 IMS GLC, Inc.» y «Copyright (2) 2001 IMS Global
  Learning Consortium, Inc.». Ningún texto de licencia dentro del fichero.

### `imsmd_rootv1p2p1.xsd` (metadatos de IMS, 1.2.1)

- **Origen**: `https://www.imsglobal.org/xsd/imsmd_rootv1p2p1.xsd`, respuesta 200.
- **Versión**: `version="1.2:1.1 IMS:MD1.2"`.
- **Huella SHA-256**: `bbe146eb770b14435c47fc95ea261b3b57c45aeeeba139b9a1d6b16d83490b52`
  (20 253 bytes).
- **Dependencias**: importa `ims_xml.xsd` por ruta relativa.
- **Avisos que lleva**: ninguno de derechos de autor; solo su historial de cambios.
- **Uso previsto**: solo si el manifiesto incluyera metadatos de IMS, que el de AulaNorma no
  incluye.

### `ims_xml.xsd` (atributos del espacio de nombres `xml`)

- **Origen**: `https://www.imsglobal.org/xsd/ims_xml.xsd`, respuesta 200.
- **Huella SHA-256**: `d5ee21b60f118e42f70837e66ef99f9b9977b7d9cf2bb321346371f2fa22a6b2`
  (1 104 bytes).
- **Dependencias**: ninguna.
- **Avisos que lleva**: «edited by Thomas Wason IMS Global Learning Consortium, Inc.».

## Condiciones de los esquemas de IMS

La página de licencia de las especificaciones de 1EdTech
(`https://www.1edtech.org/standards/specification-license`, consultada el 2026-10-08) concede
una licencia mundial, perpetua, gratuita, **no transferible y no sublicenciable** para
descargar y utilizar las especificaciones con el fin de desarrollar y distribuir productos
que las implementen. Exige conservar los avisos de derechos de autor y la atribución, y no
concede derecho a modificarlas ni a crear obras derivadas.

Lectura para este proyecto, que **no es un dictamen jurídico**:

- **Descargarlos y usarlos para validar** encaja en lo que la licencia concede.
- **Guardarlos en un repositorio público o distribuirlos con el producto** es redistribuir a
  terceros. La licencia no lo concede de forma expresa y se declara no sublicenciable: **no
  está acreditado**.
- La consulta se hizo a través de un resumen automático de la página, no de su texto íntegro.
  Antes de decidir, el mantenedor debe leer el original.

No se atribuye a estos ficheros la licencia de ningún repositorio o paquete de terceros que
los incluya: quien los copia no puede conceder más derechos que los que tiene.

## Qué se ha hecho en consecuencia

- **No se incorpora ningún XSD**: ni en `tests/fixtures/scorm/xsd/`, ni como recurso de
  ejecución. Tampoco se ha instalado `xmllint-wasm`.
- **T064 queda abierta.** Está hecha la parte que no depende de los esquemas: las reglas que
  estos no expresan, aplicadas al releer el ZIP, con un lector de XML propio y estricto.
- Cada exportación registra que la validación contra los esquemas no se ejecutó
  (`schema: not_run`), y la página de exportación lo dice. Ningún texto del producto afirma
  conformidad con los esquemas.
- La comprobación propia **no sustituye** a los esquemas: research R8 la considera circular
  si es la única.

## Opciones para el mantenedor

1. **Obtener los esquemas en la preparación del entorno**, con su dirección y su huella
   fijadas, como ya se hace con gitleaks, zizmor y qpdf, sin guardarlos en el repositorio.
   Resuelve la redistribución de los de IMS. **Sigue necesitando una fuente acreditada del
   esquema de ADL.**
2. **Pedir a ADL** la distribución de SCORM 1.2 y sus condiciones, o localizarlas desde una
   red que alcance `adlnet.gov`.
3. **Aceptar una copia de terceros del esquema de ADL**, registrando de dónde sale y su
   huella. Es una decisión de riesgo que solo puede tomar el mantenedor.
4. **Renunciar a los XSD** y dejar la conformidad en la comprobación propia y la prueba en un
   Moodle real, corrigiendo research R8 con esa decisión.
