# Comprobación del paquete exportado: qué se comprueba y qué no

**Fecha**: 2026-10-08 | **Decisión**: [research.md](./research.md) (R8, revisión del 2026-10-08) |
**Contrato**: [contracts/scorm-package.md](./contracts/scorm-package.md) | **Tareas**: T064, T065 y T079

Estrategia del piloto para decidir si un paquete se ofrece para su descarga. Sustituye a la
validación del manifiesto contra los XSD de SCORM 1.2, que no se hace. El motivo está en
[scorm-schemas.md](./scorm-schemas.md).

## Lo que esta estrategia no es

- **No equivale a validar contra los XSD de SCORM 1.2.** Hay manifiestos que los esquemas
  rechazarían y que esta comprobación acepta, y al revés.
- **No acredita conformidad con SCORM 1.2**, ni completa ni parcial.
- **No es un validador de paquetes SCORM en general.** Comprueba el perfil que exporta
  AulaNorma. Las reglas de estructura que también se aplican a un manifiesto ajeno existen
  solo para detectar una comprobación que acepte únicamente lo que AulaNorma genera.
- **No acredita que una plataforma importe el paquete ni que guarde el recorrido.**

## Los cuatro mecanismos

| Mecanismo                                   | Dónde                                                      | Cuándo se ejecuta                      |
| ------------------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| 1. Lectura del XML con un analizador ajeno  | `src/modules/content-export/xml.ts`, con `libxml2-wasm`    | En cada exportación y en las pruebas   |
| 2. Reglas del perfil SCORM 1.2 de AulaNorma | `src/modules/content-export/conformance.ts`                | En cada exportación y en las pruebas   |
| 3. Pruebas negativas y referencias ajenas   | `tests/contract/`, `tests/unit/content-export/`            | En las pruebas                         |
| 4. Verificación en un Moodle real           | Parte 3 de [quickstart.md](./quickstart.md); T079          | A mano. **Pendiente**                  |

Los tres primeros deciden si un paquete se guarda y se ofrece. El cuarto decide si el
paquete se acepta: **es condición obligatoria de aceptación** y ninguno de los otros lo
sustituye (SC-018 a SC-023).

## 1. Lectura del XML

El manifiesto se relee del ZIP ya generado y lo analiza libxml2, a través de `libxml2-wasm`:
un analizador estricto, mantenido y ajeno al generador, que escribe el manifiesto con una
plantilla de texto. El código propio configura el analizador, adapta su resultado y libera
sus recursos. No interpreta XML ni añade comprobaciones léxicas.

**Configuración**

- Sin modo de recuperación: un documento mal formado no se repara, se rechaza.
- Sin sustitución de entidades, sin carga de DTD, sin validación con DTD y sin XInclude.
- Sin entidades ni recursos externos, sin red y sin catálogo del sistema.
- Cualquier error del analizador es un rechazo. Cualquier aviso, también.
- Un documento con DTD no se lee, aunque esté bien formado: sus entidades podrían expandirse
  al consultar el texto.
- El documento se libera siempre, también si la lectura falla.

**Qué comprueba**

- Que el documento es XML 1.0 bien formado y correcto en sus espacios de nombres.
- En particular, rechaza los errores que el analizador anterior dejaba pasar: un «&» sin
  escapar, una referencia a un carácter no admitido, caracteres de control, la secuencia
  `]]>` en el texto, el prefijo `xml` enlazado a otro espacio de nombres y un atributo
  repetido con dos prefijos del mismo espacio.
- Resuelve los espacios de nombres: un elemento o un atributo se identifica por su espacio y
  su nombre local, no por su prefijo.
- Descodifica las referencias predefinidas y las numéricas, y la codificación declarada.
- Conserva íntegro el texto válido; se prueba con escapes, referencias, otros alfabetos y
  secciones CDATA.
- Limita el anidamiento a 64 niveles.

La lectura ocurre **antes** de cualquier regla del formato, igual para un manifiesto propio
que para uno ajeno: si el analizador rechaza el documento, no se aplica ninguna regla.

**Qué queda fuera**

- Un documento con DTD se rechaza entero, aunque XML lo permita. Es una restricción
  deliberada, no una comprobación de buena formación.
- Los avisos que libxml2 no emite. Por ejemplo, un espacio de nombres con una dirección
  relativa se acepta sin aviso.
- La validez del documento respecto de cualquier esquema o DTD: solo se comprueba que está
  bien formado.

**El analizador, tal como se comprobó el 2026-10-08**

| Dato            | Valor                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| Paquete         | `libxml2-wasm` 0.7.2, publicado el 2026-09-07; 17 versiones desde 2023                        |
| Mantenimiento   | Repositorio activo, no archivado; último commit, el 2026-10-05                                |
| Contiene        | libxml2 2.15.1 compilado a WebAssembly, de una bifurcación del autor del paquete con 12 commits propios |
| Licencias       | MIT el envoltorio; la licencia MIT de libxml2 para la biblioteca, en `LICENSE.libxml2`        |
| Dependencias    | Ninguna                                                                                       |
| Instalación     | Sin scripts: funciona con `ignore-scripts=true`. El binario va dentro de un módulo JavaScript |
| Entorno         | Node.js 24.21.0; también dentro de `npm run dev` y de `npm run build`                         |
| Vulnerabilidades | `npm audit`: ninguna. Firma y atestación del registro, verificadas                           |

Dos límites de esta comprobación: `npm audit` no conoce las vulnerabilidades de la libxml2
que va **dentro** del paquete, y esa libxml2 es una bifurcación, no la versión publicada por
su proyecto. En el producto, el analizador solo lee manifiestos que acaba de escribir el
propio generador.

**Alternativas evaluadas**: `@xmldom/xmldom`, mantenido pero tolerante, fue el analizador de
la versión anterior de esta estrategia y se retiró por eso. `saxes`, estricto, tiene el
repositorio archivado.

## 2. Reglas del perfil

Son reglas del formato, separadas del análisis sintáctico.

### Reglas de estructura, que también debe superar un manifiesto ajeno

- El fichero es un ZIP legible, con un máximo de 2000 entradas y 64 MiB descomprimidos.
- Ninguna entrada tiene una ruta absoluta, con `..`, con barra invertida o con letra de
  unidad, y no hay dos que solo se distingan por mayúsculas.
- `imsmanifest.xml` está en la raíz.
- No lleva instrucciones de procesamiento. (Un `DOCTYPE` lo rechaza ya la lectura.)
- La raíz es `manifest` en el espacio de nombres de empaquetado de contenidos de SCORM 1.2,
  con identificador.
- Los metadatos declaran `ADL SCORM`, versión `1.2`.
- Los identificadores no se repiten.
- Hay al menos una organización, y la organización por defecto, si se declara, existe.
- Cada ítem con `identifierref` remite a un recurso que existe, con dirección de inicio y con
  `adlcp:scormtype` igual a `sco` o `asset`, en su espacio de nombres. Al menos un ítem lanza
  un recurso.
- Cada dependencia remite a un recurso que existe.
- Cada dirección de un recurso o de un fichero es una ruta local dentro del paquete, y ese
  fichero está en el ZIP. La dirección de inicio figura entre los ficheros del recurso.
- Ningún fichero del ZIP queda sin declarar.
- No se usa `xml:base`: esta comprobación no lo resuelve, así que lo rechaza.

### Reglas propias de lo que exporta AulaNorma

- Un único ítem que lanza un único recurso, de tipo `sco`.
- El identificador del manifiesto es el de la versión aprobada, y el título del ítem la
  nombra.
- Ningún elemento de puntuación ni de límites (`masteryscore`, `maxtimeallowed`,
  `timelimitaction`).
- Solo ficheros HTML, JavaScript, CSS y XML.
- Ninguna dirección externa: en el HTML, ningún atributo que cargue o enlace algo con esquema
  o servidor, ni `base`, `iframe`, `object`, `embed`, `form` o `meta http-equiv`; en el CSS,
  ningún `url()` ni `@import`; en el JavaScript, ninguna dirección ni interfaz de red.
- Ningún identificador de una cuenta de usuario en ningún fichero.
- **Forma restringida del manifiesto**: ningún comentario ni sección CDATA, que el generador
  no escribe.
- Máximo de 200 temas, comprobado al generar.

### Qué queda fuera de las reglas

- **Todo lo que los XSD expresan y aquí no está**: el orden de los elementos, su
  cardinalidad, los tipos de los valores, los atributos obligatorios u opcionales de cada
  elemento, los elementos permitidos en cada lugar y los metadatos LOM.
- Las longitudes máximas y los vocabularios de SCORM 1.2 para el manifiesto.
- Los submanifiestos, `adlcp:location`, `prerequisites` y `datafromlms`: ni se generan ni se
  comprueban.
- `xml:base`, que se rechaza en lugar de interpretarse.
- El contenido de los ficheros más allá de las direcciones externas: que el HTML sea válido,
  accesible o correcto.
- La detección de direcciones externas es léxica. Una dirección construida en tiempo de
  ejecución por un script no se detectaría; el script del paquete no construye ninguna.

## 3. Pruebas negativas y referencias ajenas

**Qué comprueban**

- **Análisis sintáctico** (`tests/unit/content-export/xml.test.ts`): la configuración del
  analizador, XML mal formado, espacios de nombres, texto conservado, DTD y recursos
  externos (con un fichero local que no debe leerse) y liberación de recursos tras fallos.
- **Paquetes incorrectos hechos a mano** (`tests/contract/scorm-package.contract.test.ts`):
  más de cincuenta, cada uno rechazado por su motivo: estructura, espacios de nombres,
  referencias, rutas, recursos, forma del manifiesto y direcciones externas. Los errores de
  buena formación se introducen tanto en el manifiesto propio como en una copia en memoria
  del ajeno, y en los dos casos los rechaza la lectura, sin llegar a ninguna regla.
- **Ida y vuelta**: el título que el generador escribe, con caracteres conflictivos, es el
  que el analizador ajeno lee.
- **Fixture interno**: un paquete escrito a mano con otra estructura, que supera las reglas
  de estructura.
- **Manifiesto de un tercero**: el de `adapt-contrib-spoor`, sin modificar, que el analizador
  lee y que supera las reglas de estructura.
- **Seguimiento** (`tests/contract/scorm-runtime.contract.test.ts`): el script del paquete
  contra un doble de la API de SCORM 1.2.

**Qué queda fuera**

- **Ningún paquete completo de un tercero ha sido aceptado.** Lo que se usa de Adapt es la
  plantilla de su manifiesto y su página de inicio, no un paquete construido y publicado.
  T065 sigue parcial por eso.
- Las referencias ajenas prueban que la comprobación no rechaza estructuras legítimas
  distintas de la propia. No prueban que acepte todo paquete SCORM 1.2 válido ni que rechace
  todo paquete inválido.
- El doble de la API comprueba lo que el paquete pide, no lo que una plataforma hace con
  ello.

## 4. Verificación en Moodle

Condición obligatoria de aceptación. Sin ella el paquete no se da por válido, pase lo que
pase en los tres mecanismos anteriores.

**Qué debe comprobar**, en una instancia real y con su versión exacta registrada:

- que el paquete se importa siguiendo solo las instrucciones entregadas (SC-018);
- que un alumno de prueba navega por todos los temas (SC-019);
- que al salir y volver en el mismo intento se reanuda y se conservan las marcas (SC-020);
- que tras «Finalizar» Moodle muestra la actividad como finalizada (SC-021);
- que no hay comunicación con otros servidores (SC-022);
- y que la evidencia queda registrada (SC-023).

**Estado**: pendiente. Está bloqueada por no disponer de un Moodle de pruebas (T079). Ningún
texto del producto declara compatibilidad con Moodle.
