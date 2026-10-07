# PDF de prueba

`synthetic/` contiene los PDF sintéticos de la comprobación de viabilidad del tratamiento de
PDF. Los genera `scripts/fixtures/make-pdf-fixtures.mjs`, sin dependencias y de forma
determinista: volver a ejecutarlo produce ficheros idénticos.

```bash
node scripts/fixtures/make-pdf-fixtures.mjs
```

No contienen datos reales. El contenido "activo" es inerte: el JavaScript es un comentario y
la acción de lanzamiento nombra un fichero que no existe.

| Fichero                      | Caso                                            | Resultado esperado          |
| ---------------------------- | ----------------------------------------------- | --------------------------- |
| `text-two-pages.pdf`         | Dos páginas de texto                            | Aceptado                    |
| `five-pages.pdf`             | Cinco páginas, para probar el límite de páginas | Según el límite configurado |
| `image-only-page.pdf`        | La segunda página solo tiene una imagen         | Aceptado; página sin texto  |
| `blank-page.pdf`             | La segunda página está en blanco                | Aceptado; página sin texto  |
| `encrypted.pdf`              | Declara cifrado                                 | Rechazado                   |
| `truncated.pdf`              | Cortado antes del final                         | Rechazado                   |
| `javascript.pdf`             | JavaScript en el árbol de nombres               | Rechazado                   |
| `open-action-javascript.pdf` | Acción de apertura con JavaScript               | Rechazado                   |
| `open-action-launch.pdf`     | Acción de apertura de lanzamiento               | Rechazado                   |
| `page-additional-action.pdf` | Acción adicional en una página                  | Rechazado                   |
| `embedded-file.pdf`          | Fichero incrustado                              | Rechazado                   |
| `xfa-form.pdf`               | Formulario XFA                                  | Rechazado                   |
| `not-a-pdf.pdf`              | No es un PDF                                    | Rechazado                   |

Con `--heavy-mb=N`, el generador añade `heavy-stream.pdf`, cuya página se descomprime a N MiB.
Sirve para probar los límites de tiempo y de memoria y no se guarda en el repositorio.

Estos ficheros todavía no los usa ninguna prueba automática: las pruebas del tratamiento de
PDF llegan con la historia 1.
