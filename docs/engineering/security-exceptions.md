# Excepciones de seguridad

Registro de las excepciones a los controles de seguridad (FR-020). Una excepción documenta un
hallazgo concreto dentro de un control; nunca desactiva el control completo ni es una excepción
constitucional.

## Cuándo se admite una excepción

- **Secretos**: solo para un falso positivo o un contenido demostrado como no secreto. Un
  secreto real nunca se exceptúa: se revoca de inmediato.
- **Dependencias**: para una vulnerabilidad alta o crítica concreta, con su justificación.

Cada excepción se añade en un pull request, que la hace revisable. Con un único mantenedor, la
aprueba el mantenedor en ese pull request y la aprobación queda registrada en su lista de
comprobación constitucional.

## Fechas

Las dos listas usan instantes UTC completos con el formato `YYYY-MM-DDTHH:mm:ss.sssZ`, por
ejemplo `2026-10-01T00:00:00.000Z`. Una fecha imposible, como el 30 de febrero, no es válida.

- `approvedAt`, el instante de aprobación, no puede estar en el futuro.
- `reviewBy`, el instante límite de revisión, está entre `approvedAt` y `approvedAt` más 90 días
  de 24 horas, ambos incluidos.
- La excepción caduca cuando el instante de la ejecución supera `reviewBy`. Cada control toma
  ese instante una sola vez al empezar.

Una excepción caducada, incompleta, con campos inesperados, con una cadena vacía o con fechas
que incumplan estas reglas hace fallar el control. Una excepción que caduca se renueva, se
retira o se corrige el hallazgo mediante un pull request.

## Secretos (`npm run check:secrets`)

Cada excepción tiene dos partes que deben corresponderse una a una:

- la huella en `.gitleaksignore`, que es lo que hace que Gitleaks omita el hallazgo;
- una entrada en el registro de abajo con esa misma huella.

Una huella que solo aparece en uno de los dos, o que se repite, hace fallar el control. No hay
otra forma de omitir un hallazgo: el control ignora los comentarios `gitleaks:allow` y no admite
una configuración propia de Gitleaks.

La huella es la que muestra `npm run check:secrets` para cada hallazgo, y depende del análisis
que lo encuentra:

- historial alcanzable desde `HEAD`: `commit:fichero:regla:línea`;
- índice de Git y árbol de trabajo: `fichero:regla:línea`.

Un falso positivo en un fichero versionado necesita la huella de cada análisis que lo encuentre.

Campos de cada entrada, todos obligatorios y sin otros adicionales:

| Campo           | Contenido                                               |
| --------------- | ------------------------------------------------------- |
| `fingerprint`   | Huella del hallazgo, idéntica a la de `.gitleaksignore` |
| `owner`         | Responsable de la excepción                             |
| `justification` | Por qué el hallazgo no es un secreto                    |
| `approvedAt`    | Instante UTC de aprobación                              |
| `reviewBy`      | Instante UTC límite de revisión                         |

El registro es el único bloque `json` de este documento. `npm run check:secrets` lo lee y lo
valida en cada ejecución.

```json
{ "schemaVersion": 1, "exceptions": [] }
```

## Dependencias (`npm run check:deps`)

Las excepciones de dependencias están en `security/audit-exceptions.json`, con la misma
estructura `{ "schemaVersion": 1, "exceptions": [...] }` y las mismas reglas de fechas. Cada
entrada corresponde a la pareja exacta de aviso y paquete, que no puede repetirse:

| Campo           | Contenido                                                   |
| --------------- | ----------------------------------------------------------- |
| `advisory`      | Identificador del aviso, con la forma `GHSA-xxxx-xxxx-xxxx` |
| `package`       | Paquete afectado por el aviso                               |
| `justification` | Por qué se acepta temporalmente la vulnerabilidad           |
| `owner`         | Responsable de la excepción                                 |
| `approvedAt`    | Instante UTC de aprobación                                  |
| `reviewBy`      | Instante UTC límite de revisión                             |

Una vulnerabilidad alta o crítica sin identificador `GHSA` no puede exceptuarse.
