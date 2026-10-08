# Comprobación de la historia 4: exportación y descarga

**Tareas**: T060 a T069 (T065, parcial) | **Fecha**: 2026-10-08 | **Datos del piloto**:
[pilot/README.md](./pilot/README.md) | **Historia anterior**: [us3-check.md](./us3-check.md) |
**Qué se comprueba**: [package-validation.md](./package-validation.md)

Registro de cómo se comprobó la fase 7 de `tasks.md`: de una versión aprobada del temario al
paquete SCORM 1.2 descargable, con su vista previa, su comprobación, su huella, sus
instrucciones y su historial.

## Qué puede hacer ya un docente

1. Ver qué se puede exportar ahora: la versión vigente o, si no la hay, lo que falta.
2. Previsualizar el contenido con el mismo renderizador que el paquete. Un borrador se
   muestra como no entregable y de la vista previa nunca sale un fichero.
3. Exportar la versión vigente como un paquete SCORM 1.2 con un único contenido.
4. Ver la huella SHA-256 del paquete y descargarlo junto con sus instrucciones.
5. Consultar cada exportación y cada descarga, también las fallidas y las denegadas.

Y un alumno, dentro del paquete: recorrer el índice y los temas, marcar los recorridos,
retomar donde lo dejó y, con todos marcados, finalizar.

## Lo que este registro no acredita

- **Ninguna compatibilidad con Moodle.** El paquete no se ha importado en ninguna
  instalación. Las instrucciones y la página de exportación lo dicen. Es T079, bloqueada.
- **Ninguna equivalencia con los XSD ni conformidad completa con SCORM 1.2.** La validación
  con XSD se sustituyó por la lectura del manifiesto con un analizador ajeno, las reglas del
  perfil exportado y referencias ajenas. Qué cubre y qué deja fuera está en
  [package-validation.md](./package-validation.md).
- **La aceptación.** La importación, el seguimiento, la reanudación y la finalización en un
  Moodle real son su condición obligatoria, y siguen pendientes.
- **Ningún temario real.** El contenido exportado en los ensayos son respuestas grabadas con
  un texto de relleno. El paquete, la vista previa, el historial y las instrucciones lo
  identifican como paquete de ensayo.
- **Ninguna aprobación de una persona.** Las versiones de los ensayos las aprobó una cuenta
  desechable.
- **SC-024.** El recorrido de aceptación exige el proveedor real, HTTPS y una persona
  autorizada.
- **El seguimiento en una plataforma real.** Se ha probado contra un doble de la API de
  SCORM 1.2, que comprueba lo que el paquete pide, no lo que Moodle hace con ello.

## Reglas que se imponen

| Regla                                                             | Cómo se impone                                                                                 | Dónde se prueba                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Exportar exige una versión vigente y cobertura completa            | Se comprueba en cada petición, sobre el estado actual; no hay parámetro ni perfil que lo evite | `export-download`, escenarios 1 y 7 por las rutas |
| Descargar exige lo mismo, también con un enlace antiguo            | Cada descarga vuelve a comprobarlo y queda registrada, concedida o denegada                    | `export-download`, escenario 8 por las rutas     |
| Un fallo no deja fichero                                           | Se escribe aparte, se relee, se compara su huella y solo entonces se registra como correcto     | `export-download`, escenario 4 por las rutas     |
| El paquete se valida antes de ofrecerse                            | Se relee el ZIP generado y se le aplican las reglas de conformidad propias                     | `scorm-package`                                  |
| El paquete es autónomo                                             | Ninguna dirección externa en ningún fichero; se abre desde el disco sin ninguna petición ajena | `scorm-package` y navegador                      |
| Sin datos de usuarios                                              | El generador no los recibe; al releer se buscan los identificadores de las cuentas             | `scorm-package`, `export-download`               |
| Solo se dice «guardado» si la plataforma lo confirma               | Cada escritura y `LMSCommit` deben devolver `true`; si no, se indica al alumno                  | `scorm-runtime` y navegador                      |
| Sin plataforma, nunca se afirma un guardado                        | Aviso permanente de que el recorrido no se guardará; «Finalizar», no disponible                | `scorm-runtime` y navegador                      |
| Nunca puntuación ni superación                                     | El script no escribe esos elementos; el manifiesto no declara puntuación de dominio            | `scorm-runtime`, `scorm-package`                 |
| Nada se borra                                                      | Tablas de solo inserción; ninguna ruta ni operación de borrado                                  | `export-download`, `us4-export-download`         |

## Decisiones tomadas al implementar

- **El manifiesto se lee con `@xmldom/xmldom`**, un analizador mantenido y ajeno al
  generador. La primera versión de esta fase usaba un lector escrito a mano, que se retiró:
  repetía las suposiciones de quien escribe el generador. El analizador es tolerante con
  algunos errores de buena formación; están listados como pruebas y los que afectan al
  manifiesto propio los rechazan reglas léxicas del perfil.
- **El análisis sintáctico y las reglas del formato están en ficheros distintos**: `xml.ts`
  no sabe nada de SCORM y `conformance.ts` no interpreta XML.
- **El manifiesto no lleva `xsi:schemaLocation`** ni el paquete incluye ningún XSD.
- **Exportaciones idénticas byte a byte** para una misma versión, aunque FR-036 solo exige
  contenido y estructura equivalentes.
- **Paquete de ensayo**: lo es si alguno de sus temas salió del adaptador determinista o si
  ese es el proveedor configurado.
- **La descarga es una petición GET que deja registro**, para que un enlace guardado se
  compruebe igual que uno nuevo.
- **Un paquete por exportación**, guardado con el identificador de su exportación. Dos
  exportaciones de la misma versión guardan dos ficheros iguales.
- **Los datos de usuarios que se buscan al releer son los identificadores de las cuentas**,
  no sus nombres: un nombre corto podría coincidir con una palabra del contenido.
- **Si no se puede leer el recorrido anterior**, el paquete avisa y no escribe nada hasta que
  el alumno actúa, para no sustituir un recorrido que quizá existe.
- **La vista previa** está en una página aparte, con la misma jerarquía de encabezados que
  el paquete. No ejecuta el script del paquete.

## Pruebas automáticas

| Fichero                                             | Casos | Qué cubre                                                                                   |
| --------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------- |
| `tests/contract/scorm-runtime.contract.test.ts`     | 43    | Inicio, navegación, marcas, salida, reanudación, finalización, ausencia, fallos y retornos   |
| `tests/contract/scorm-package.contract.test.ts`     | 71    | Generador, 52 paquetes incorrectos, ida y vuelta, fixture interno y manifiesto de un tercero |
| `tests/unit/content-export/xml.test.ts`             | 41    | XML mal formado, espacios de nombres, referencias y tolerancias conocidas del analizador     |
| `tests/unit/content-export/export-download.test.ts` | 24    | Vigencia y cobertura al exportar y descargar, fallos sin fichero, registros y conservación   |
| `tests/integration/us4-export-download.test.ts`     | 10    | Escenarios 1 a 8 por las rutas reales, permisos, SC-014, SC-025 y SC-031                     |

Además se adaptaron las listas cerradas de rutas, tablas y capas de la entrega, y la prueba
de humo. El script del paquete se ejecuta en `jsdom`. Se comprobó con una mutación que las
pruebas detectan un «guardado» falso: forzando ese mensaje, seis de ellas fallan.

**Retornos de la API.** SCORM 1.2 responde con las cadenas `"true"` y `"false"`, y `"false"`
es una cadena no vacía. El paquete solo da por buena una escritura o un guardado si el
resultado es exactamente `"true"` (o el booleano `true`, que devuelven algunas plataformas)
y además `LMSGetLastError` devuelve `"0"`. Se prueba con `"false"`, `"TRUE"`, `"1"`, `1`,
una cadena cualquiera, una vacía, un objeto, `null`, nada y `false`; con un error pendiente
tras un `"true"`; y con una excepción. Con una mutación que decide por la veracidad del
valor, nueve pruebas fallan. Si la finalización se guarda pero la plataforma no confirma el
cierre de la sesión, el paquete dice exactamente eso.

**Referencia ajena.** El paquete de `tests/fixtures/scorm/reference/` lo escribí para las
pruebas: es un fixture interno. Como referencia de un tercero se usa el manifiesto SCORM 1.2
y la página de inicio de `adapt-contrib-spoor` (GPL-3.0), copiados sin modificar, con su
commit, sus huellas y su licencia. El lector y las reglas del formato los aceptan tal cual.
Es la plantilla de ese proyecto, **no un paquete publicado completo**: los paquetes
construidos que se han encontrado incluyen los XSD, cuyas condiciones no están acreditadas.

`npm run check` y `npm run verify:negative` terminaron con código 0. La primera versión de
esta fase no superaba `check:deps` por un aviso de gravedad alta contra `next`
(GHSA-cjq9-62q9-8jv4); se resolvió en `main` con la actualización a 16.3.8, sin excepción.

## Recorrido en un navegador

Chrome 154 sin interfaz gráfica, contra `npm run dev`, con un directorio de datos exclusivo
y el PDF real del piloto. **Es un ensayo**, con cuentas desechables y respuestas grabadas.
Los datos no se conservan.

| Paso                                                  | Resultado                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Exportación con el temario sin aprobar                | «Borrador no entregable», con lo pendiente; sin formulario; el envío directo responde 404          |
| Vista previa de un borrador                           | Marcada como no entregable; 4 temas con sus dos tipos de bloque; ningún script; ningún fichero     |
| Exportación con la versión vigente                    | «Entregable»; dice que los esquemas no se han validado y que Moodle no está comprobado             |
| Vista previa entregable                               | Contenido de la versión; aviso de que no guarda ni acredita seguimiento; aviso de ensayo           |
| Exportar                                              | «Generado y comprobado», «Paquete de ensayo», huella y tamaño; enlaces de descarga                 |
| Descargar el paquete                                  | `application/zip`, como adjunto; su huella coincide con la mostrada                                |
| Descargar las instrucciones                           | Texto con la huella, el aviso de ensayo y que Moodle no está comprobado                            |
| Abrir el paquete desde el disco, sin red              | Avisa de que el recorrido no se guardará; ninguna petición fuera del paquete; sin errores          |
| Navegar y marcar sin plataforma                       | Funciona; el aviso no cambia; «Finalizar», no disponible                                           |
| Con un doble de la API en el navegador                | Inicia, lee, pasa a «incomplete» y guarda; «La plataforma ha confirmado…»                          |
| La plataforma falla al guardar                        | «Recorrido sin guardar.» y una alerta; el siguiente guardado lo repara                             |
| Salir y volver                                        | Pide suspender, guarda y termina; al volver, mismo tema y mismas marcas                            |
| Finalizar con un fallo de la plataforma               | No consta como finalizada; se puede reintentar                                                     |
| Finalizar                                             | «completed»; ninguna puntuación ni superación                                                      |
| Editar un tema y abrir el enlace antiguo              | 422, página con el motivo; el paquete se conserva y figura como no descargable                     |
| Cuenta de administración sin perfil de docente        | 403 en la página y en la descarga                                                                  |

El doble de la API del recorrido es una página local escrita para el ensayo. No es Moodle.

La primera captura del historial mostró que la huella desbordaba la tabla y dejaba los
enlaces de descarga fuera de la página. Se corrigió y se comprobó con otra captura.

## Limitaciones

- **Sin validación contra los XSD**, por decisión: la comprobación no equivale a ella.
- **T065 parcial**: ningún paquete completo de un tercero ha sido aceptado todavía.
- **Moodle sin comprobar**: importación, seguimiento, reanudación y finalización reales.
- **Accesibilidad**: el paquete usa encabezados jerárquicos, etiquetas de texto para la
  norma, el desarrollo y las marcas, foco visible y controles nativos. No se ha hecho una
  evaluación de WCAG 2.2 AA con lectores de pantalla ni una medición de contraste.
- **Navegadores**: solo se ha ejecutado en Chrome y en `jsdom`.
- **Aviso al salir**: si la plataforma falla mientras la página se cierra, no hay a quién
  avisar.
- **Estado de otra versión**: se descarta entero; el alumno empieza de nuevo.
- **Sin límite de espacio**: cada exportación guarda su fichero y ninguno se borra.
- **Generación dentro de la petición**: sigue como limitación, registrada en
  [us3-check.md](./us3-check.md).
