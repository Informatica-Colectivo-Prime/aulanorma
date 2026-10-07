# Informe de viabilidad: PDF, SQLite y validación XSD

**Fecha**: 2026-10-07, en dos rondas | **Tareas**: T007 a T012 | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

Resultado de las comprobaciones de la fase 2. Cada apartado separa **lo observado** de **lo que
sigue siendo una hipótesis**. Los experimentos se hicieron con código desechable en un
directorio temporal, fuera del repositorio; aquí queda su resultado. No se ha cambiado ninguna
dependencia de la aplicación ni se ha hecho ninguna llamada a un servicio de generación.

## Resumen

| Punto                                  | Resultado                                                                  | Decisión propuesta                |
| -------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| SQLite con `node:sqlite`               | Cumple todo lo previsto                                                    | Seguir                            |
| Extracción de texto por página         | Cumple; el PDF del piloto se extrae completo y sin páginas vacías          | Seguir                            |
| Detección de contenido activo          | El método planificado no cumple; la inspección estructural con qpdf, sí    | Cambiar a qpdf y política propia  |
| Aislamiento del tratamiento del PDF    | Cumple en parte: contiene bloqueos y consumo; no es un entorno estanco     | Ajustar                           |
| Validación XSD del manifiesto          | Cumple, sin red                                                            | Seguir; origen de los XSD pendiente |
| PDF real del piloto                    | Contiene UF0517 completa; procedencia registrada                           | Seguir                            |

La primera ronda dejó abierta la detección de contenido activo. La segunda, tras las
decisiones del mantenedor, evaluó qpdf (apartado 2.6) y amplió los casos. Con ello T012 queda
cerrada: cada punto tiene una decisión respaldada por un resultado, y lo que sigue pendiente
está asignado a una fase posterior (ver "Pendiente").

## Entorno

| Elemento        | Valor                                                          |
| --------------- | -------------------------------------------------------------- |
| Sistema         | macOS (Darwin, arm64)                                          |
| Node.js         | 24.21.0                                                        |
| SQLite          | 3.53.4, el incluido en `node:sqlite`                           |
| `pdfjs-dist`    | 6.4.299, instalado solo en el directorio de los experimentos   |
| `xmllint-wasm`  | 5.3.0 (licencia MIT), instalado solo allí                      |
| qpdf            | 12.4.2: binario oficial y, aparte, su biblioteca (ver 2.6)     |

Las dos bibliotecas se instalaron con `npm install --ignore-scripts` en un directorio
desechable. `package.json` y `package-lock.json` de la aplicación no han cambiado. Las versiones
exactas que se añadan más adelante se fijarán entonces; estas son las probadas.

## 1. SQLite (`node:sqlite`) — T010

**Estado declarado**. La documentación de Node.js 24.21.0 indica para `node:sqlite`
"Stability: 1.2", que es *release candidate*. Al cargar el módulo no se emitió ningún aviso.

| Caso                                                         | Esperado                            | Observado                                                                |
| ------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------ |
| Modo WAL                                                     | `wal`                               | `wal`                                                                    |
| Persistencia tras cerrar y reabrir                           | El dato sigue                       | Sigue                                                                    |
| Transacción con `ROLLBACK`                                   | No queda nada                       | No queda nada                                                            |
| `UPDATE` y `DELETE` sobre una tabla con disparadores         | Rechazados                          | Rechazados con el mensaje del disparador; la fila sigue                  |
| Segundo escritor con una transacción de escritura abierta    | No entra                            | Rechazado tras agotar su espera (`database is locked`)                   |
| Lectura mientras otro escribe                                | Permitida                           | Permitida                                                                |
| Reservas desde 4 procesos contra un límite común             | Nunca se supera el límite           | 300 reservas concedidas, total exactamente igual al límite, 500 denegadas |
| Proceso terminado con `SIGKILL` en mitad de una transacción  | Lo confirmado sigue; lo demás, no   | 1 fila confirmada presente, 0 sin confirmar; `integrity_check`: `ok`     |
| Copia en línea (`backup`) mientras otro proceso escribe      | Copia coherente de un instante      | Copia con 2919 filas (origen: 2916 antes, 2928 después); íntegra         |

**Intento anterior conservado**. La primera versión de la prueba de reservas arrancaba los
procesos sin sincronizar y un solo proceso obtuvo todas las reservas: no demostraba
concurrencia. Se repitió con un instante de arranque común; aun así solo dos de los cuatro
procesos llegaron a escribir. El límite se respetó en ambos intentos.

**Observado**: transacciones, exclusión entre escritores, disparadores de solo inserción,
recuperación tras una caída del proceso y copia en línea funcionan como necesita el diseño.

**Hipótesis**:

- Que el comportamiento sea el mismo en el servidor Linux de destino. La integración continua
  ejecutará las pruebas en Linux cuando existan.
- Que la recuperación resista una caída de la máquina, no solo del proceso. `SIGKILL` no
  prueba la pérdida de alimentación; depende del modo de sincronización y del disco.
- Que la carga real no produzca esperas apreciables por el escritor único.

**Decisión**: seguir con SQLite y `node:sqlite`, con sus límites documentados (research R1).

## 2. PDF — T007, T008 y T009

### 2.1 Documento real

Procedencia completa en [pilot-source.md](./pilot-source.md). El fichero tiene 335 páginas y
18 955 231 bytes. La sección de UF0517 ocupa las páginas 27 a 29 del PDF y está completa.

Esta comprobación trata sobre el contenido del fichero. **No es una validación de la vigencia
jurídica de la norma.**

### 2.2 Extracción de texto

| Documento                                   | Páginas | Tiempo  | Memoria residente | Páginas sin texto | Páginas con imágenes |
| ------------------------------------------- | ------- | ------- | ----------------- | ----------------- | -------------------- |
| PDF del piloto (19,0 MB)                    | 335     | ≈ 1 s   | ≈ 295 MB          | 0                 | 0                    |
| Otra disposición del mismo boletín (53,4 MB) | 569     | ≈ 1,3 s | ≈ 444 MB          | 0                 | 0                    |

En el PDF del piloto, cada página tiene entre 315 y 3501 caracteres sin contar espacios
(mediana, 2373). Las páginas 27, 28 y 29 tienen 1910, 3070 y 1578.

**Observado**: `pdfjs-dist` devuelve el texto página a página y el número de páginas. El texto
de las páginas de UF0517 contiene su denominación, código, duración, capacidades, criterios y
contenidos.

**Hipótesis**: que el texto extraído sea **todo** el contenido de la página y esté en el orden
de lectura. No se ha comparado carácter a carácter con el original. Lo cubren, por diseño, la
comprobación de cada cita contra el texto de su página (SC-004) y la revisión humana del
inventario contra la sección original (FR-057).

### 2.3 Criterio para «página sin texto extraíble» (CHK016)

Hay que distinguir dos cosas que un umbral de caracteres confundiría:

- **Texto extraíble vacío**: la extracción no devuelve ningún carácter que no sea espacio. Es
  un hecho comprobable. Observado: la página en blanco y la página solo con una imagen dan 0
  caracteres; todas las demás, más de 0.
- **Texto extraído insuficiente**: la página tiene texto, pero no todo su contenido es texto.
  Ningún número de caracteres lo detecta: la página con menos texto del PDF real tiene 315
  caracteres y está completa.

Criterio propuesto, que pasa a FR-064:

1. Una página es **sin texto extraíble** solo si su extracción da 0 caracteres distintos de
   espacio. No hay umbral.
2. Además, se señala toda página que **contiene imágenes**, tenga texto o no. Es también un
   hecho comprobable: observado en la página solo con imagen (1 operación de imagen) y ausente
   en las 335 páginas del PDF real.
3. Ninguna de las dos señales garantiza que el contenido esté completo. Esa garantía sigue
   siendo la revisión humana del inventario contra la sección original.

### 2.4 Validación previa y documentos problemáticos

Con límites de prueba de 50 MB y 4 páginas para los casos sintéticos:

| Documento de prueba                         | Esperado                         | Observado                                             |
| ------------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| Dos páginas de texto                        | Aceptado                         | Aceptado; 45 caracteres por página                    |
| Página solo imagen                          | Aceptado; página sin texto       | Aceptado; 0 caracteres y 1 operación de imagen        |
| Página en blanco                            | Aceptado; página sin texto       | Aceptado; 0 caracteres y 0 operaciones                |
| Cifrado                                     | Rechazado                        | Rechazado: `PasswordException`                        |
| Truncado                                    | Rechazado                        | Rechazado: `InvalidPDFException`                      |
| No es un PDF, con extensión `.pdf`          | Rechazado                        | Rechazado por la firma del fichero, sin analizarlo    |
| Cinco páginas, con límite de cuatro         | Rechazado                        | Rechazado por el límite de páginas                    |
| Por encima del tamaño máximo                | Rechazado antes de analizarlo    | Rechazado por tamaño (la disposición de 53,4 MB, con el límite en 50 MB) |

### 2.5 Detección de contenido activo: primera ronda

**Este es el punto que no cumple lo planificado.** research R4 preveía usar las consultas de
`pdfjs-dist` y rechazar cuando no se pudiera determinar. Se probaron tres métodos:

| Documento                           | Consultas de `pdfjs-dist` | Búsqueda de marcas en el fichero | Examen de diccionarios (prototipo) |
| ----------------------------------- | ------------------------- | -------------------------------- | ---------------------------------- |
| JavaScript en el árbol de nombres   | Detectado                 | Detectado                        | Detectado                          |
| Acción de apertura con JavaScript   | Detectado                 | Detectado                        | Detectado                          |
| Acción de apertura de lanzamiento   | **No detectado**          | Detectado                        | Detectado                          |
| Acción adicional en una página      | **No detectado**          | Detectado                        | Detectado                          |
| Fichero incrustado                  | **No detectado**          | Detectado                        | Detectado                          |
| Formulario XFA                      | **No detectado**          | Detectado                        | Detectado                          |
| Lanzamiento con el nombre escapado  | **No detectado**          | Detectado solo por otra marca    | Detectado                          |
| Documentos sin contenido activo     | Sin señales               | Sin señales                      | Sin señales                        |
| **PDF real del piloto**             | **Falso positivo**        | **Falso positivo**               | Sin señales                        |
| Otra disposición del mismo boletín  | **Falso positivo**        | **Falso positivo**               | Sin señales                        |

**Observado**:

- Las consultas de `pdfjs-dist` no detectan cuatro de las seis clases de contenido activo
  probadas.
- `hasJSActions()` devuelve verdadero para los dos documentos oficiales, que no contienen
  JavaScript. Lo que contienen es un formulario con un único campo de **firma digital**. La
  causa exacta dentro de la biblioteca es una hipótesis; el falso positivo está observado.
- La búsqueda de marcas en el fichero completo encuentra `/AA` en los dos documentos
  oficiales, dentro de datos codificados de un flujo, no en un diccionario: otro falso
  positivo. Tampoco reconoce un nombre escrito con escapes (`/L#61unch`).
- Un examen que descarta el cuerpo de los flujos, descodifica los escapes de los nombres y
  busca las claves solo en los diccionarios clasifica bien los 14 documentos probados.

**Consecuencia para el piloto**: con el método planificado, el documento oficial del piloto se
rechazaría. Con la búsqueda de marcas, también.

Las dos cuestiones que esta ronda dejó al mantenedor (el campo de firma y el método de
detección) están decididas; el resultado está en el apartado siguiente. El examen de
diccionarios de la tabla era un analizador propio de la sintaxis del fichero: **no se adopta**
como detector.

### 2.6 Inspección estructural con qpdf: segunda ronda

**Decisiones del mantenedor aplicadas**: admitir un campo de firma pasivo por su estructura,
nunca por el nombre, el origen o la huella del documento; mantener el rechazo de JavaScript,
XFA, acciones automáticas, lanzamientos y ficheros incrustados; no adoptar el analizador
propio; evaluar qpdf con su salida JSON versión 2 y aplicar la política sobre la estructura
interpretada; y rechazar ante cualquier error, límite excedido o estructura no comprobable.

**Herramienta y procedencia**

| Elemento                    | Valor                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------- |
| qpdf, binario oficial       | 12.4.2, `qpdf-12.4.2-bin-macos-arm64.zip`, de las publicaciones del proyecto en GitHub  |
| Obtenido                    | 2026-10-07T12:53:52Z                                                                    |
| SHA-256 del fichero         | `62e46987a30ea167cbc530ccb22690aec3d8c812ed09979a941bcee92e504b79`                      |
| Verificación                | Coincide con el fichero de huellas publicado junto a la versión                         |
| qpdf, biblioteca            | 12.4.2, incluida en `pikepdf` 10.16.0, en un entorno virtual de Python 3.14.3           |
| Orden usada                 | `qpdf --json=2 --json-stream-data=none <fichero>`                                       |

Las dos vías se instalaron en un directorio desechable. Nada se ha instalado en el sistema ni
se ha añadido a la aplicación. La misma publicación ofrece un binario para Linux x86_64, con
su huella en el mismo fichero; **no se ha probado**.

**Qué entrega qpdf**. Un documento JSON con cada objeto ya interpretado: los nombres sin
escapes, las referencias como `"7 0 R"`, los objetos de los flujos de objetos como objetos
normales y, tras una actualización incremental, el estado vigente. La política recorre esa
estructura; no lee los bytes del PDF.

**Política aplicada en el experimento**

1. Rechazo si qpdf termina con error, con avisos o con un código distinto de 0, si se le
   interrumpe o si su salida no se puede leer.
2. Rechazo si cualquier objeto contiene las claves de JavaScript, acción automática o de
   apertura, ficheros incrustados, XFA o contenido multimedia enriquecido.
3. Rechazo si el tipo de una acción, **resuelto a través de sus referencias**, es
   JavaScript, lanzamiento, envío o importación de formulario, salto a otro documento u
   otra acción de la lista prohibida.
4. Una acción en una anotación solo se admite si es un salto dentro del documento o un
   enlace. Los atributos del árbol de estructura de un PDF etiquetado usan la misma clave y
   se distinguen recorriendo ese árbol, no por su aspecto.
5. Un formulario solo se admite si **todos** sus campos son de firma y ninguno tiene
   acciones. Cualquier otro formulario se rechaza.
6. Rechazo si una referencia no se puede resolver.

**Casos y resultados** (26 sintéticos y 2 oficiales; mismo veredicto con el binario y con la
biblioteca)

| Documento                                                          | Estructura que contiene                       | Esperado  | Observado |
| ------------------------------------------------------------------ | --------------------------------------------- | --------- | --------- |
| Texto, página en blanco, página solo imagen, cinco páginas         | —                                             | Aceptado  | Aceptado  |
| JavaScript en el árbol de nombres                                  | —                                             | Rechazado | Rechazado |
| Acción de apertura con JavaScript                                  | Referencia indirecta                          | Rechazado | Rechazado |
| Acción de apertura de lanzamiento                                  | Referencia indirecta                          | Rechazado | Rechazado |
| La misma, con el nombre escrito con escapes                        | Nombre escapado                               | Rechazado | Rechazado |
| Acción adicional en una página                                     | —                                             | Rechazado | Rechazado |
| Fichero incrustado                                                 | —                                             | Rechazado | Rechazado |
| Formulario XFA                                                     | —                                             | Rechazado | Rechazado |
| Cifrado                                                            | —                                             | Rechazado | Rechazado |
| Truncado                                                           | —                                             | Rechazado | Rechazado, por avisos de qpdf |
| No es un PDF                                                       | —                                             | Rechazado | Rechazado |
| **Campo de firma pasivo**                                          | Formulario con un campo de firma              | Aceptado  | Aceptado  |
| Campo de firma con una acción                                      | Formulario con un campo de firma              | Rechazado | Rechazado |
| Campo de firma, y una actualización añade una acción de apertura   | Actualización incremental                     | Rechazado | Rechazado |
| Formulario con un campo de texto                                   | Formulario que no es de firma                 | Rechazado | Rechazado |
| Sin contenido activo, con flujo de objetos                         | Flujo de objetos y tabla en flujo             | Aceptado  | Aceptado  |
| Lanzamiento dentro de un flujo de objetos                          | Flujo de objetos comprimido                   | Rechazado | Rechazado |
| Lanzamiento cuyo tipo es una referencia a otro objeto              | Referencia indirecta y flujo de objetos       | Rechazado | Rechazado |
| Valores inocuos tras referencias indirectas                        | Referencia indirecta y flujo de objetos       | Aceptado  | Aceptado  |
| Actualización que añade el idioma                                  | Actualización incremental                     | Aceptado  | Aceptado  |
| Actualización que añade una acción de apertura                     | Actualización incremental                     | Rechazado | Rechazado |
| Actualización que retira la acción, pero deja su objeto            | Actualización incremental, objeto huérfano    | —         | Rechazado |
| Actualización que retira la acción y libera su objeto              | Actualización incremental, objeto liberado    | —         | Aceptado  |
| **PDF real del piloto**                                            | Firma, 27 807 objetos, PDF etiquetado         | Aceptado  | Aceptado  |
| Otra disposición del mismo boletín                                 | Firma, 51 712 objetos, PDF etiquetado         | Aceptado  | Aceptado  |

**Comprobación de que las variantes contienen lo que dicen**. Se verificó sobre los bytes de
cada fichero: los cuatro casos con flujo de objetos son PDF 1.5, tienen un flujo de objetos y
una tabla en flujo, y **no contienen como texto** ni la acción ni su tipo; los casos
incrementales tienen dos secciones finales y una referencia a la tabla anterior; el caso del
nombre escapado contiene el nombre con escapes y no su forma literal. qpdf informa de la
versión 1.5 y resuelve los objetos comprimidos.

**La excepción de la firma es estructural**. El mismo documento con campo de firma se acepta;
se rechaza al añadir una acción al campo y también cuando una actualización posterior añade
una acción de apertura. Los dos documentos oficiales se aceptan por tener esa estructura, sin
ninguna regla que mire su nombre, su origen o su huella. **Admitir el campo no comprueba la
firma**: no se valida criptográficamente y el experimento usa una firma sintética no válida.

**Error o comprobación incompleta acaba en rechazo**. Observado: fichero truncado (qpdf lo
repara con avisos; se rechaza por los avisos), fichero que no es PDF, fichero cifrado e
inspección interrumpida a los 50 ms. En ningún caso el resultado fue "sin contenido activo".

**Primer intento conservado**. La primera versión de la política rechazaba los dos documentos
oficiales: tomaba por acción el atributo de los elementos del árbol de estructura. Se corrigió
recorriendo ese árbol desde el catálogo. Otro caso, el del nombre escapado, se había hecho
alterando bytes de un fichero y qpdf lo rechazaba por dañado, no por su contenido; se
sustituyó por un caso generado correctamente.

**Coste observado con el PDF del piloto** (19,0 MB)

| Paso                              | Tiempo                         | Memoria residente |
| --------------------------------- | ------------------------------ | ----------------- |
| qpdf, con la biblioteca           | ≈ 0,6 s                        | ≈ 68 MB           |
| qpdf, con el binario              | ≈ 3 s                          | ≈ 40 MB           |
| Leer el JSON y aplicar la política | ≈ 0,15 s                       | ≈ 237 MB          |

La salida JSON del documento del piloto ocupa 53 MB, casi el triple que el PDF. Leerla entera
es lo que más memoria consume.

**Coste operativo**

- Es un binario nativo que interpreta ficheros no confiables: hay que mantenerlo al día y
  ejecutarlo como proceso hijo con entorno vacío y límites, igual que la extracción.
- Hay que instalarlo en tres sitios: desarrollo, integración continua (Linux y macOS) y
  servidor de destino. El proyecto ya instala así sus herramientas de seguridad, con la
  huella fijada y verificada; qpdf publica binarios y huellas para esas plataformas.
- Añade un segundo intérprete del PDF junto a `pdfjs-dist`. Los dos pueden entender de forma
  distinta un fichero malformado.

**Límites del enfoque**

- qpdf **no es un antivirus** y que termine sin avisos **no garantiza un PDF seguro**. Dice
  qué estructura tiene el documento según su propia interpretación.
- La política es una lista finita de construcciones rechazadas, más dos reglas de admisión
  cerradas (formularios y acciones de anotación). Lo que no esté en la lista no se rechaza.
- **Objetos liberados**: cuando una actualización libera un objeto, sus bytes siguen en el
  fichero pero qpdf no lo incluye, y el documento se acepta. Un visor conforme tampoco lo
  usa. Si el objeto queda huérfano sin liberarse, sí aparece y el documento se rechaza.
- No se inspecciona el contenido de los flujos de página. Un fichero pensado para agotar
  recursos se acepta en la inspección estructural y cae después en los límites de la
  extracción (apartado 2.7).
- Rechazar ante cualquier aviso puede dejar fuera un documento legítimo con un defecto leve.
  Es el precio de no aceptar lo que no se ha podido comprobar.
- **Resuelto en la fase 4** (T032): el cifrado lo declara ahora qpdf a partir de la estructura,
  sin intentar descifrar nada, y el rechazo ya no depende de ese componente. Ver
  [us1-check.md](./us1-check.md). Lo observado entonces fue lo siguiente.
- Con el binario, el fichero cifrado se rechaza por un error de qpdf al cargar un componente
  criptográfico antiguo, no con un motivo específico de cifrado. El veredicto es el mismo; el
  mensaje al usuario tendrá que tratarlo.

**Decisión**: qpdf con JSON versión 2 es viable. Se adopta como fuente de la estructura, con
`pdfjs-dist` solo para el texto y la política como código propio. No hace falta volver al
analizador propio.

### 2.7 Límites de recursos y aislamiento

Son tres cosas distintas y se midieron por separado.

**Límite de tiempo**

| Caso                                              | Observado                                                  |
| ------------------------------------------------- | ---------------------------------------------------------- |
| PDF del piloto con 150 ms de límite               | Proceso hijo terminado a los 157 ms; el proceso padre sigue |

**Límite de memoria**

| Caso                                                        | Observado                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Página que se descomprime a 256 MiB, con 128 MiB de montón  | El hijo aborta por falta de memoria a los 1,9 s; el padre sigue  |
| La misma, con 2048 MiB de montón y 20 s de límite           | El hijo aborta por falta de memoria a los 19 s; el padre sigue   |
| PDF del piloto con 64 MiB de montón                         | Termina bien en 1,5 s, con ≈ 295 MB de memoria residente         |

**Observado**: el límite de montón de V8 no limita la memoria total del proceso. El PDF del
piloto termina con un montón de 64 MiB mientras ocupa unos 295 MB. Un fichero de 0,8 MB puede
llevar a un proceso al límite de memoria en segundos.

**Hipótesis**: que un límite de memoria total, impuesto por el sistema operativo o por el
servicio, sea suficiente en el servidor de destino. No se ha probado; depende del despliegue.

**Modelo de permisos de Node.js** (`--permission`, con lectura limitada a un directorio)

| Intento desde el proceso hijo              | Sin `--permission` | Con `--permission` |
| ------------------------------------------ | ------------------ | ------------------ |
| Leer el fichero permitido                  | Permitido          | Permitido          |
| Leer un fichero del sistema                | Permitido          | Denegado           |
| Leer un fichero del directorio superior    | Permitido          | Denegado           |
| Escribir un fichero                        | Permitido          | Denegado           |
| Lanzar otro proceso                        | Permitido          | Denegado           |
| Crear un hilo de trabajo                   | Permitido          | Denegado           |
| Leer las variables de entorno              | Permitido          | **Permitido**      |
| Abrir una conexión de red                  | Permitido          | **Permitido**      |
| Hacer una petición HTTPS                   | Permitido          | **Permitido**      |

El análisis del PDF funciona con `--permission` y solo lectura de su directorio.

**Observado**: el modelo de permisos corta el acceso a ficheros, a procesos y a hilos, pero
**no** la red ni las variables de entorno. La documentación de Node.js 24.21.0 dice además
que esta función "no protege frente a código malicioso".

**Conclusión**: un proceso hijo con límites de tiempo y con el modelo de permisos contiene
bloqueos, agotamiento de memoria y accesos accidentales a ficheros. **No es un aislamiento de
seguridad.** Lo mismo vale para el proceso que ejecute qpdf. Para acercarse hace falta, como mínimo: lanzar el hijo con un entorno vacío, sin
secretos; un límite de memoria total impuesto desde fuera; y cortar la red del hijo en el
despliegue. Las dos últimas dependen del servidor de destino y quedan para la fase de
despliegue.

### 2.8 Límites de partida

Valores iniciales, configurables, para el PDF del piloto (19,0 MB, 335 páginas, ≈ 1 s):

| Límite                 | Valor de partida | Motivo                                                       |
| ---------------------- | ---------------- | ------------------------------------------------------------ |
| Tamaño del fichero     | 32 MiB           | Margen sobre el documento del piloto                         |
| Páginas                | 600              | Margen sobre el documento del piloto                         |
| Tiempo de análisis     | 30 s             | Treinta veces lo observado                                   |
| Montón del proceso hijo | 256 MiB          | Suficiente en lo observado; no limita la memoria total       |

Con estos valores, la otra disposición probada (53,4 MB) se rechazaría por tamaño. No forma
parte del piloto; el dato queda anotado para cuando se amplíe el alcance.

### 2.9 Otros datos observados

- `pdfjs-dist` avisa por la salida de errores de que no puede cargar un paquete opcional de
  dibujo con código nativo. No hace falta para extraer texto. El aviso se conserva en la
  salida del proceso hijo; no se ha suprimido.
- El generador de casos sintéticos es determinista: dos ejecuciones dan ficheros idénticos.

## 3. Validación XSD del manifiesto SCORM 1.2 — T011

**Esquemas usados**: `adlcp_rootv1p2.xsd`, `imscp_rootv1p1p2.xsd`, `imsmd_rootv1p2p1.xsd` e
`ims_xml.xsd`, tomados de un paquete SCORM 1.2 de ejemplo publicado por un tercero. Se valida
contra el esquema de ADL, que importa el de empaquetado de IMS.

| Manifiesto                                          | Esperado  | Observado                                                 |
| --------------------------------------------------- | --------- | --------------------------------------------------------- |
| De un paquete de referencia ajeno (dos paquetes)    | Válido    | Válidos                                                   |
| Propio mínimo, escrito a mano                       | Válido    | Válido                                                    |
| Sin `organizations`                                 | Inválido  | Inválido: elemento no esperado                            |
| Sin `resources`                                     | Inválido  | Inválido: falta un elemento hijo                          |
| `resource` sin `identifier`                         | Inválido  | Inválido: atributo obligatorio ausente                    |
| `resource` sin `type`                               | Inválido  | Inválido: atributo obligatorio ausente                    |
| `adlcp:scormtype` con un valor no admitido          | Inválido  | Inválido: valor fuera de la enumeración                   |
| Elemento desconocido en el espacio de nombres       | Inválido  | Inválido: elemento no esperado                            |
| Orden incorrecto de los elementos                   | Inválido  | Inválido: elemento no esperado                            |
| Atributo `adlcp` inexistente                        | Inválido  | Inválido: atributo no declarado                           |
| XML mal formado                                     | Inválido  | Inválido: error del analizador                            |
| `adlcp:masteryscore` no numérico                    | Inválido  | **Válido**: el esquema lo define como texto               |
| `identifierref` a un recurso que no existe          | —         | Válido: el esquema no lo expresa                          |
| `href` a un fichero que no está en el paquete       | —         | Válido: el esquema no lo expresa                          |
| `href` a una URL externa                            | —         | Válido: el esquema no lo expresa                          |

Cada validación tarda unos 25 ms. Repetidas con la red bloqueada por el sistema operativo,
dan los mismos resultados.

**Observado**:

- `xmllint-wasm` valida contra los esquemas de SCORM 1.2 sin red, resolviendo en local sus
  importaciones, y cada manifiesto incorrecto falla por su causa, no por otra.
- Acepta manifiestos que no produjo AulaNorma: es un criterio externo al generador.
- Los esquemas no cubren las reglas que research R8 ya reservaba a una comprobación propia:
  referencias entre elementos, ficheros realmente presentes y ausencia de URL externas. Y
  tampoco restringen `masteryscore`, así que la regla de no declarar puntuación debe estar
  también en esa comprobación.
- Al informar de un manifiesto inválido, la biblioteca añade un mensaje de espacio de nombres
  procedente del propio esquema de ADL. No aparece con manifiestos válidos y no cambia el
  resultado, pero el código que lea los errores debe contar con él.

**Primer intento conservado**: la primera lectura de los resultados mostraba ese mensaje como
única causa de todos los rechazos. Se repitió mostrando la salida completa para confirmar la
causa real de cada uno.

**Pendiente, sin resolver**:

- **Origen de los esquemas**. La dirección original del esquema de ADL ya no responde (errores
  404 y 500). Los tres esquemas de IMS se descargan de su sitio, pero no son idénticos a las
  copias incluidas en los paquetes de ejemplo. Hay que decidir qué copia se toma como
  referencia y registrar su procedencia y sus huellas.
- **Redistribución**. Los esquemas de IMS llevan un aviso de derechos de autor y ningún texto
  de licencia. No se ha determinado si pueden guardarse en el repositorio. La alternativa es
  obtenerlos en la preparación del entorno, verificando sus huellas, como ya se hace con las
  herramientas de seguridad.

**Decisión**: seguir con `xmllint-wasm`. El origen y la redistribución de los esquemas deben
resolverse antes de la fase 7.

## 4. Hallazgo sobre la ubicación de los datos del piloto

`tests/architecture/no-domain-specifics.test.ts` falla si los códigos del certificado o de la
unidad aparecen en cualquier fichero de `src/`, `tests/` o `scripts/`, incluidos los Markdown
y los binarios. El plan situaba el PDF real, su procedencia y sus resultados esperados en
`tests/fixtures/pdf/`. Las dos cosas son incompatibles.

**Decisión del mantenedor**: la procedencia y los resultados específicos de la unidad se
mantienen en `specs/002-boe-scorm-export/`; las pruebas genéricas usan casos sintéticos; la
prueba de arquitectura no se relaja; y el documento real no se guarda en el repositorio, se
conserva por su huella y su procedencia. La tarea T042 queda redactada así y deja de estar
bloqueada.

## Pendiente

| Asunto                                                                     | Quién o qué lo cierra                 | Antes de |
| -------------------------------------------------------------------------- | ------------------------------------- | -------- |
| Instalar qpdf como herramienta verificada y probar el binario de Linux     | Hecho en T032; ver `us1-check.md`     | Fase 4   |
| Instalar qpdf en el servidor de destino                                    | Despliegue (T074)                     | Fase 8   |
| Límite de memoria total y corte de red de los procesos de análisis         | Despliegue en el servidor de destino  | Fase 8   |
| Origen y redistribución de los esquemas de SCORM 1.2                       | Decisión del mantenedor               | Fase 7   |

Nada de lo anterior afecta a la fase 3: persistencia, auditoría, identidad y frontera HTTP no
dependen del tratamiento del PDF ni de los esquemas.

## Método

Cada experimento es un script de Node.js ejecutado desde un directorio desechable:

- **SQLite**: un script que crea una base en modo WAL y lanza procesos hijos para las
  reservas simultáneas, la caída con `SIGKILL` y la escritura durante la copia.
- **PDF**: un analizador que valida la firma y los límites, abre el documento con
  `pdfjs-dist`, recorre sus páginas y consulta sus acciones; un examen de diccionarios,
  descartado; la inspección con qpdf y la política sobre su salida JSON; un lanzador que
  impone tiempo y montón al proceso hijo; y una sonda que intenta leer, escribir, lanzar
  procesos y usar la red con y sin `--permission`.
- **XSD**: un script que valida cada manifiesto con `xmllint-wasm`, repetido con la red
  bloqueada mediante el aislamiento del sistema operativo.

Los casos sintéticos se generan con `scripts/fixtures/make-pdf-fixtures.mjs` y están en
`tests/fixtures/pdf/synthetic/`. Los documentos oficiales y los paquetes de referencia se
descargaron, se conservaron sin modificar y no se han añadido al repositorio.
