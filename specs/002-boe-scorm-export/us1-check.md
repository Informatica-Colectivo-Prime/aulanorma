# Comprobación de la historia 1: documento e interpretación

**Tareas**: T031 a T042 | **Fecha**: 2026-10-07 | **Datos del piloto**:
[pilot/README.md](./pilot/README.md)

Registro de cómo se comprobó la fase 4 de `tasks.md`. Subir el PDF, conservar su procedencia y
su original, inspeccionarlo, extraer su texto por página, y revisar y validar la
interpretación.

## Qué puede hacer ya un docente

1. Subir un PDF oficial con sus datos de procedencia.
2. Ver el registro: procedencia, huella, páginas sin texto y páginas con imágenes.
3. Abrir cada página con su texto extraído, y esa misma página en el PDF original.
4. Resolver, con su confirmación expresa, una página sin texto que esté en blanco o sea ajena
   a la unidad.
5. Pedir la interpretación de una unidad formativa, indicando las páginas de su sección.
6. Revisar el inventario, con su jerarquía y la página de origen de cada elemento.
7. Corregir un requisito, añadir uno que falte, retirar uno que sobre y corregir los datos de
   la unidad.
8. Validar la versión que tiene delante, tras confirmar que ha revisado el inventario contra
   la sección original; o rechazarla, con un motivo.
9. Registrar una fuente legible como documento sustituto.

La interpretación sale de **respuestas grabadas**: no hay ningún proveedor de generación
conectado, y la interfaz lo dice. Validar es siempre una acción de una persona; ninguna
operación valida por su cuenta.

## Tres pasos separados

| Paso                    | Quién lo hace                                  | Qué decide                                            | Qué no acredita                              |
| ----------------------- | ---------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| Inspección estructural  | qpdf y la política propia, en procesos hijos   | Si el fichero se admite                               | Que el PDF sea seguro, ni que la firma valga |
| Extracción              | `pdfjs-dist`, en un proceso hijo               | Nada: obtiene el texto y cuenta imágenes              | Que el texto sea todo el contenido           |
| Revisión humana         | Un docente, con acciones explícitas y auditadas | Corregir, resolver páginas, validar o rechazar        | La vigencia jurídica de la norma             |

Los tres procesos hijos se ejecutan con el entorno vacío, sin acceso a la base de datos ni a
la configuración, con límite de tiempo (60 s por paso) y de salida. Los de Node.js llevan
además límite de montón y el modelo de permisos de Node.js, que solo les deja leer su código y
el fichero. Esto contiene bloqueos y consumo excesivo; **no es un aislamiento de seguridad**.
El límite de memoria total y el corte de red dependen del servidor de destino (fase 8).

## qpdf como herramienta verificada

| Elemento                 | Valor                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Versión                  | qpdf 12.4.2, binarios oficiales de las publicaciones del proyecto en GitHub             |
| Plataformas fijadas      | macOS arm64 y x86_64, Linux x86_64 y aarch64                                            |
| Huella de cada archivo   | La del fichero de sumas que publica el proyecto junto a la versión                      |
| Huella de cada fichero   | Fijada en `scripts/tools/tools.lock.json`: el ejecutable y cada biblioteca que carga    |
| Instalación              | `npm run tools:install`, en `.tools/qpdf`, sin `unzip` ni ninguna dependencia           |
| Comprobación al usarlo   | Antes de cada análisis: exactamente esos ficheros, regulares y con su huella            |
| Sin herramienta          | Todo documento se rechaza como no comprobable                                           |

La firma del fichero de sumas no se ha verificado criptográficamente. El instalador no extrae
enlaces simbólicos: instala cada biblioteca directamente con el nombre que carga el
ejecutable.

| Plataforma                   | Cómo se comprueba                                                          | Resultado                                         |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| macOS arm64                  | Instalación y pruebas en el equipo de desarrollo                           | Correcto: los 26 ficheros y el PDF del piloto     |
| macOS arm64                  | Control `macos-quality` de la integración continua, que lo instala y prueba | El de cada cambio consta en su pull request       |
| Linux x86_64                 | Control `test` de la integración continua, que lo instala y prueba         | El de cada cambio consta en su pull request       |
| macOS x86_64 y Linux aarch64 | Huellas fijadas a partir de sus archivos oficiales                         | **No ejecutados**                                 |

En Linux, qpdf no se ha ejecutado fuera de la integración continua: no hay otro entorno Linux
en este trabajo. Sus pruebas son las mismas que en macOS y fallan, no se omiten, si la
herramienta no funciona.

### El componente criptográfico y el rechazo del cifrado

En la viabilidad, el binario oficial de macOS rechazaba un PDF cifrado con un error propio,
`unable to load openssl legacy provider`, y no por estar cifrado: el veredicto era correcto,
pero la herramienta estaba fallando.

**Causa.** Ese binario lleva su biblioteca criptográfica enlazada de forma estática y busca
los algoritmos antiguos, que necesita para comprobar la contraseña de un PDF cifrado, en una
ruta del equipo donde se compiló. En un equipo que no tiene esa ruta, no los encuentra. La
publicación oficial no incluye ese módulo, así que no hay forma de aportarlo como fichero
verificado.

**Solución.** El producto ya no pide a qpdf que abra un documento cifrado. Antes de pedir la
estructura, le pregunta si el documento está cifrado dándole la clave en hexadecimal: con esa
opción qpdf no comprueba ninguna contraseña ni descifra nada, lee la estructura y responde.
Así:

- qpdf, **funcionando correctamente**, declara `encrypted: true`, y el documento se rechaza
  por estar cifrado, en todas las plataformas y sin depender de ningún módulo del sistema;
- solo si responde que no está cifrado se le pide la estructura completa, que tampoco necesita
  esos algoritmos;
- qpdf se ejecuta sin heredar nada del entorno y con las variables de su biblioteca
  criptográfica apuntando a rutas que no existen, de modo que nunca carga configuración ni
  módulos del equipo: solo se ejecuta código de la herramienta verificada.

**Comprobado**: con la misma herramienta y el mismo entorno, un PDF sin cifrar se admite, uno
truncado se rechaza como dañado y uno cifrado se rechaza como cifrado
(`tests/unit/normative-source/pdf.test.ts`). El fichero cifrado de prueba usa el cifrado
antiguo, justo el que antes provocaba el fallo.

## Pruebas automáticas

`npm run check`: los controles superados, con 1698 pruebas en 30 ficheros y la prueba de
humo de 24 casos. `npm run verify:negative`: todas las categorías se comportan como se
esperaba, sin fallos colaterales. Ejecutados en macOS, en el equipo de desarrollo.

| Qué se comprueba                                                                              | Dónde                                                     |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Los 26 ficheros sintéticos: 9 admitidos y 17 rechazados, cada uno con su motivo (SC-042)      | `tests/unit/normative-source/pdf.test.ts`                 |
| Cada fichero conserva su huella tras cualquier comprobación                                   | `tests/unit/normative-source/pdf.test.ts`                 |
| Límites de tamaño y de páginas, fichero vacío, y ningún temporal sobrante                     | `tests/unit/normative-source/pdf.test.ts`                 |
| Herramienta ausente, alterada o con ficheros de más: todo documento se rechaza                | `tests/unit/normative-source/pdf.test.ts`                 |
| Política: referencias sin resolver, árbol de estructura, acciones y formularios               | `tests/unit/normative-source/pdf.test.ts`                 |
| Instalación de qpdf: huellas, reparación, enlaces, miembros repetidos, cifrados o dañados     | `tests/unit/tools/install-tools.test.ts`                  |
| Documento inmutable; una fila por página; resolución de páginas; sustituto (SC-034)           | `tests/unit/normative-source/repository.test.ts`          |
| Proveedor de generación: mismo contrato para todo adaptador; salida inválida; nada del usuario en lo enviado (SC-005, SC-015, SC-044) | `tests/contract/generation-provider.contract.test.ts` |
| Interpretación: esquema, páginas y citas contra el texto; jerarquía; correcciones             | `tests/unit/structured-interpretation/interpretation.test.ts` |
| Edición simultánea: el segundo guardado no guarda nada y solo vale reenviado (SC-033)         | `tests/unit/structured-interpretation/interpretation.test.ts` |
| Validación con confirmación expresa, bloqueada por páginas sin resolver, y su vigencia (SC-029, SC-036) | `tests/unit/structured-interpretation/interpretation.test.ts` |
| Rechazo con motivo, que conserva el contenido y no inicia generación (SC-041)                 | `tests/unit/structured-interpretation/interpretation.test.ts` |
| Escenarios 1 a 10 por las rutas reales, y denegaciones sin sesión, sin perfil y con el perfil equivocado (SC-007) | `tests/integration/us1-document-interpretation.test.ts` |
| Documento sustituto: histórico, sin heredar validación y sin iniciar generación (SC-038, en lo que alcanza esta historia) | `tests/integration/substitute-document.test.ts` |
| Frontera: segmentos variables con forma cerrada y máximo de cuerpo de cada acción             | `tests/unit/platform/http-boundary.test.ts`               |
| Lista cerrada de rutas, cada una con su guarda; entrega abierta solo a dos capas              | `tests/architecture/`                                     |
| Rutas nuevas sin sesión, en `npm start` y en `npm run dev`                                    | `scripts/smoke-test.mjs`                                  |

Las pruebas usan documentos sintéticos y una unidad sintética. No ejercitan un navegador ni
ningún proveedor de generación.

## Verificación en el navegador

**Cómo**: `npm run dev`, con el origen local por HTTP, y Chrome 154 sin interfaz gráfica,
manejado por su protocolo de depuración con un script desechable. El script navega, elige
ficheros, rellena y envía formularios, pulsa teclas, hace capturas y recoge la consola y las
peticiones. Las capturas se revisaron y no se guardan en el repositorio. Se usaron documentos
sintéticos y el PDF real del piloto, con cuentas desechables.

| Paso                                                         | Observado                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Cuenta sin perfiles abre `/documents`                        | 403, «No tienes permiso para ver esta página»                                             |
| Docente abre los documentos                                  | Lista vacía y enlace para subir                                                           |
| Enviar la subida sin fichero                                 | «Elige un fichero PDF.», con el foco en el mensaje                                        |
| Subir un PDF cifrado                                         | Rechazado: «El PDF está cifrado o protegido con contraseña.»                              |
| Subir un PDF con JavaScript, con XFA y con un formulario     | Rechazados, cada uno con su motivo                                                        |
| Subir un fichero que no es PDF y uno truncado                | Rechazados: «no es un PDF» y «dañado o incompleto»                                        |
| Subir un PDF con una página solo imagen                      | Registrado; la página 2, sin texto y con imágenes, sin resolver                           |
| Resolver esa página con la confirmación                      | «Resuelta», con quién y cuándo                                                            |
| Subir otra vez el mismo fichero                              | Rechazado: ya está registrado                                                             |
| Subir el PDF real del piloto                                 | Registrado en unos segundos; el botón muestra «Comprobando el documento…» mientras tanto  |
| Huella mostrada                                              | La de `pilot-source.md`                                                                   |
| Abrir el PDF original                                        | 200, `application/pdf`, `nosniff`, sin caché, 18 955 231 bytes                            |
| Abrir la página 27                                           | Su texto extraído y el enlace a esa página del original                                   |
| Pedir la interpretación de una unidad sin respuesta grabada  | «El servicio de generación no ha devuelto ninguna respuesta…»; no se guarda nada          |
| Pedir la interpretación de la unidad del piloto              | 71 elementos: 2 capacidades, 16 criterios, 2 contenidos y 51 subapartados, en revisión    |
| Corregir un requisito mientras otra sesión cambia la unidad  | 409: versión más reciente a un lado, mi cambio sin guardar al otro                        |
| Reenviar mi cambio sobre la versión más reciente             | Guardado; el registro muestra las dos correcciones                                        |
| Corregir con una cita que no está en la página               | No se guarda; el formulario conserva lo escrito y explica el motivo                       |
| Validar sin marcar la confirmación                           | No se valida; se explica el motivo                                                        |
| Validar con la confirmación                                  | «Validada», con docente, fecha, hora, versión y la confirmación                           |
| Corregir después de validar                                  | Vuelve a «En revisión»; la validación sigue en el registro, «Sin vigencia»                |
| Rechazar con un motivo, y devolver a revisión                | «Rechazada», con su motivo y su contenido; después, «En revisión»                         |
| Registrar un sustituto del documento con la página de imagen | El anterior queda como histórico, enlaza al nuevo y ya no ofrece pedir interpretaciones   |
| Orden de tabulación en la subida                             | Saltar al contenido, cabecera, fichero, y los campos en su orden                          |
| Cookies                                                      | No visibles para el código de la página                                                   |
| Consola                                                      | Sin errores de la política de contenido; solo los avisos de las respuestas 403, 409 y 422 |
| Red                                                          | Solo peticiones al propio origen, y un icono interno del navegador para un campo          |

Un defecto de presentación salió de las capturas y se corrigió: el texto de un criterio con
varias líneas se mostraba en una sola.

## Lo que no se ha comprobado

- **El visor de PDF del navegador.** Se comprobó que el original se sirve con su tipo y sus
  cabeceras, y que el enlace lleva el número de página. No se ha visto cómo lo muestra un
  navegador con interfaz ni si su visor respeta ese número.
- **HTTPS en un navegador**, otros navegadores y lectores de pantalla, como en la fase 3.
- **Un proveedor de generación real.** La interpretación sale de respuestas grabadas. La
  calidad de una interpretación generada y su coste no se han comprobado.
- **Límite de memoria total y corte de red** de los procesos de análisis: dependen del
  servidor de destino.
- **Un documento que agote el tiempo o la memoria** en el producto: se midió en la
  viabilidad, con los mismos mecanismos, pero no hay una prueba automática con un fichero así.
- **macOS x86_64 y Linux aarch64**: sus huellas están fijadas, pero no se han ejecutado.

## Límites conocidos

- Una acción que no puede guardar responde con una página en la dirección de la propia acción.
  Recargarla vuelve a enviar el formulario, como en cualquier envío.
- Subir un documento necesita JavaScript en el navegador: el cuerpo de la petición es el PDF.
- El presupuesto de generación todavía no existe (T049). Con el adaptador determinista, el
  coste estimado de cada llamada es cero, y así se registra.
- La comprobación de referencias heredadas tras un sustituto afecta a índices y temas, que
  todavía no existen (T058).
