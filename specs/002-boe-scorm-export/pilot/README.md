# Piloto: tratamiento del documento oficial y de su unidad

**Tarea**: T042 | **Procedencia del documento**: [../pilot-source.md](../pilot-source.md) |
**Comprobación de la historia**: [../us1-check.md](../us1-check.md)

Resultados esperados y obtenidos al tratar el PDF real del piloto con los módulos del
producto. El fichero **no está en el repositorio**: se localizó por su ruta y se comprobó
contra la huella de `pilot-source.md`. Esta comprobación no forma parte de la integración
continua, que solo usa documentos sintéticos.

Fecha: 2026-10-07. Equipo: macOS, Node.js 24.21.0, qpdf 12.4.2 instalado con
`npm run tools:install`.

## Qué se ejecutó

Un script desechable, fuera del repositorio, que usa las mismas operaciones que las rutas:
`registerDocument` de la fuente normativa, con el tratamiento completo del PDF, y `request`
de la interpretación estructurada, con el adaptador determinista y la respuesta grabada de
este directorio. El mismo recorrido se hizo después desde el navegador, con el mismo
resultado.

## Documento

| Comprobación                                  | Esperado                                   | Obtenido                                   |
| --------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Huella SHA-256 antes de tratarlo              | `e0b5d295…925df4`, la de `pilot-source.md` | La misma                                   |
| Validación del fichero                        | Aceptado: es un PDF de 18 955 231 bytes    | Aceptado; 18 955 231 bytes                 |
| Inspección estructural                        | Aceptado, con su campo de firma digital    | Aceptado; campo de firma: sí               |
| Páginas                                       | 335                                        | 335, las mismas para qpdf y la extracción  |
| Páginas sin texto extraíble                   | 0                                          | 0                                          |
| Páginas con imágenes                          | 0                                          | 0                                          |
| Caracteres, sin espacios, de las páginas 27 a 29 | 1910, 3070 y 1578                       | 1910, 3070 y 1578                          |
| Huella registrada                             | La del fichero                             | La misma                                   |
| Original en el almacén                        | Idéntico, byte a byte                      | Idéntico                                   |
| Huella del fichero después de tratarlo        | Sin cambios                                | Sin cambios                                |
| Tiempo del tratamiento completo               | Dentro del límite de 60 s por paso         | ≈ 2,9 s en total                           |

El campo de firma se admite por su estructura. **La firma no se ha comprobado.**

## Unidad

Sección de la unidad: páginas 27 a 29 del PDF.

| Comprobación                               | Esperado, según la sección del documento | Obtenido                                |
| ------------------------------------------ | ---------------------------------------- | --------------------------------------- |
| Código y denominación                      | UF0517, «Organización empresarial y de recursos humanos» | Los mismos               |
| Duración, como metadato                    | 30 horas, en la página 27                | 30 horas, página 27                     |
| Capacidades                                | 2 (C1 y C2)                              | 2                                       |
| Criterios de evaluación                    | 16 (CE1.1 a CE1.8 y CE2.1 a CE2.8)       | 16                                      |
| Contenidos                                 | 2                                        | 2                                       |
| Subapartados                               | 51: 15 de primer nivel y 36 de segundo   | 51                                      |
| Páginas referidas por los requisitos       | Solo 27, 28 y 29                         | 27, 28 y 29                             |
| Citas que aparecen en el texto de su página | Todas                                   | Las 71 y la de la duración              |
| Estado de la interpretación                | En revisión, versión 1, sin validaciones | En revisión, versión 1, sin validaciones |
| Llamada de generación registrada           | Adaptador determinista, prompt `v1`, válida, coste 0 | La misma                    |
| La misma unidad con otra sección (27 a 28) | Sin respuesta: no se guarda nada         | Rechazada como error del proveedor      |

Los recuentos esperados salen de leer la sección en el texto extraído: las líneas que empiezan
por `C1:` y `C2:`, por `CE`, por un número y un punto, por un guion y por un cuadrado.

## La respuesta grabada

[`interpretation-recording.json`](./interpretation-recording.json) es la respuesta que el
adaptador determinista da a la entrada exacta de esta unidad: su código y el texto de las
páginas 27 a 29 tal como lo extrae el producto, identificados por la huella `inputSha256`.

- **No es la salida de ningún modelo ni de ningún proveedor.** Se preparó con un script
  desechable que transcribe de forma mecánica la sección a partir del texto extraído: cada
  línea de capacidad, criterio, contenido o subapartado pasa a ser un requisito, con su texto,
  su página y, como cita, su primera línea. No resume, no reformula y no decide nada.
- El producto la trata como a cualquier respuesta: comprueba su esquema, que cada página
  existe y que cada cita aparece en el texto de su página.
- Sirve para **ensayar** el recorrido de la historia 1 con el documento real. No acredita la
  calidad de una generación real ni el recorrido de aceptación, que exige el proveedor real
  (SC-024).
- Si cambia el texto extraído, el prompt o la unidad pedida, la huella deja de coincidir y el
  adaptador no responde.

Para usarla, se copia en el directorio `generation-recordings` del directorio de datos; ver
las instrucciones del [README](../../../README.md).

## La propuesta de índice grabada

[`outline-recording.json`](./outline-recording.json) es la respuesta que el adaptador
determinista da a la petición del índice de esta unidad, identificada por la huella del
inventario que produce la respuesta anterior sin corregir (71 requisitos).

- **Tampoco es la salida de ningún modelo.** Se preparó con un script desechable que agrupa
  el inventario de forma mecánica: una entrada por cada capacidad, apoyada en ella y en sus
  criterios, y una por cada contenido, apoyada en él y en todos sus subapartados. Son 4
  entradas, que vinculan los 71 requisitos; los títulos son el texto de la capacidad o del
  contenido, recortado a 200 caracteres. No es una propuesta didáctica.
- El producto la trata como a cualquier propuesta: comprueba su esquema y que cada requisito
  referido existe en el inventario, y calcula la cobertura por su cuenta.
- Si la interpretación se corrige antes de pedir el índice, el inventario cambia, la huella
  deja de coincidir y el adaptador no responde.

Comprobado desde el navegador el 2026-10-07 con el PDF real: 4 entradas, 71 de 71 requisitos
cubiertos; al quitar la entrada de la segunda capacidad, 62 de 71 y la aprobación bloqueada
con sus 9 pendientes. Ver [../us2-check.md](../us2-check.md).

## Las respuestas de ensayo de los temas

`topic-recording-1.json` a `topic-recording-4.json` son las respuestas que el adaptador
determinista da al desarrollo de cada entrada de la propuesta de índice anterior, sin editar.

- **No son contenido didáctico ni la salida de ningún modelo.** Cada una cita los requisitos
  de su entrada y añade un único bloque de desarrollo, vinculado a todos ellos, con un texto
  de relleno que dice expresamente que lo es.
- Sirven para **ensayar** la separación entre norma y desarrollo, los vínculos, las
  aprobaciones y la invalidación. No acreditan que ningún requisito esté desarrollado de
  verdad, ni la calidad pedagógica de nada.
- Dependen del inventario y del índice exactos: con una interpretación corregida o una
  entrada cambiada, el tema no tiene respuesta y queda como fallido.

Comprobado desde el navegador el 2026-10-07 con el PDF real: cuatro temas, 71 de 71
requisitos citados y vinculados a un bloque de desarrollo. Ver
[../us3-check.md](../us3-check.md).

**La interpretación del piloto sigue pendiente de la revisión del mantenedor.** Las
validaciones y aprobaciones de esos ensayos se hicieron con cuentas y datos desechables, que
no se conservan: no son la validación ni la aprobación de ninguna persona.

## Qué acredita y qué no

- **Acredita** que el documento real se admite, se registra con su huella sin modificarlo y
  se extrae página a página; que la sección de la unidad es legible y está completa; y que
  una interpretación con esa estructura supera las comprobaciones del producto.
- **No acredita** la revisión humana: nadie ha validado esta interpretación, y validarla
  exige revisar el inventario contra la sección original. El ensayo en el navegador validó,
  corrigió y rechazó para comprobar el funcionamiento, sobre datos desechables.
- **No acredita** la vigencia jurídica de la norma, que el texto extraído coincida carácter a
  carácter con el original, ni nada sobre un proveedor de generación.
