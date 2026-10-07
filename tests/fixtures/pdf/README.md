# PDF de prueba

`synthetic/` contiene los PDF sintéticos de la comprobación de viabilidad del tratamiento de
PDF. Los genera `scripts/fixtures/make-pdf-fixtures.mjs`, sin dependencias y de forma
determinista: volver a ejecutarlo produce ficheros idénticos.

```bash
node scripts/fixtures/make-pdf-fixtures.mjs
```

No contienen datos reales. El contenido "activo" es inerte: el JavaScript es un comentario y
la acción de lanzamiento nombra un fichero que no existe. La firma digital es sintética y no
es válida.

| Fichero                                   | Caso                                                   | Resultado esperado          |
| ----------------------------------------- | ------------------------------------------------------ | --------------------------- |
| `text-two-pages.pdf`                      | Dos páginas de texto                                   | Aceptado                    |
| `five-pages.pdf`                          | Cinco páginas, para probar el límite de páginas        | Según el límite configurado |
| `image-only-page.pdf`                     | La segunda página solo tiene una imagen                | Aceptado; página sin texto  |
| `blank-page.pdf`                          | La segunda página está en blanco                       | Aceptado; página sin texto  |
| `signature-field.pdf`                     | Formulario con un campo de firma pasivo                | Aceptado                    |
| `object-streams-allowed.pdf`              | Flujo de objetos, sin contenido activo                 | Aceptado                    |
| `indirect-allowed.pdf`                    | Valores inocuos tras referencias indirectas            | Aceptado                    |
| `incremental-allowed.pdf`                 | Actualización incremental que añade el idioma          | Aceptado                    |
| `incremental-freed-action.pdf`            | Actualización que retira una acción y libera su objeto | Aceptado; límite declarado  |
| `encrypted.pdf`                           | Declara cifrado                                        | Rechazado                   |
| `truncated.pdf`                           | Cortado antes del final                                | Rechazado                   |
| `not-a-pdf.pdf`                           | No es un PDF                                           | Rechazado                   |
| `javascript.pdf`                          | JavaScript en el árbol de nombres                      | Rechazado                   |
| `open-action-javascript.pdf`              | Acción de apertura con JavaScript                      | Rechazado                   |
| `open-action-launch.pdf`                  | Acción de apertura de lanzamiento                      | Rechazado                   |
| `open-action-launch-escaped-name.pdf`     | La misma, con el nombre escrito con escapes            | Rechazado                   |
| `page-additional-action.pdf`              | Acción adicional en una página                         | Rechazado                   |
| `embedded-file.pdf`                       | Fichero incrustado                                     | Rechazado                   |
| `xfa-form.pdf`                            | Formulario XFA                                         | Rechazado                   |
| `form-text-field.pdf`                     | Formulario con un campo que no es de firma             | Rechazado                   |
| `signature-field-with-action.pdf`         | Campo de firma con una acción                          | Rechazado                   |
| `signature-field-updated-open-action.pdf` | Campo de firma y actualización que añade una acción    | Rechazado                   |
| `object-streams-launch.pdf`               | Lanzamiento dentro de un flujo de objetos              | Rechazado                   |
| `indirect-action-type.pdf`                | Lanzamiento cuyo tipo es una referencia indirecta      | Rechazado                   |
| `incremental-open-action.pdf`             | Actualización que añade una acción de apertura         | Rechazado                   |
| `incremental-removed-action.pdf`          | Actualización que retira la acción y deja su objeto    | Rechazado                   |

Con `--heavy-mb=N`, el generador añade `heavy-stream.pdf`, cuya página se descomprime a N MiB.
Sirve para probar los límites de tiempo y de memoria y no se guarda en el repositorio.

Los resultados esperados son los de la política decidida tras la comprobación de viabilidad
(`specs/002-boe-scorm-export/feasibility.md`). Estos ficheros todavía no los usa ninguna
prueba automática: las pruebas del tratamiento de PDF llegan con la historia 1.
