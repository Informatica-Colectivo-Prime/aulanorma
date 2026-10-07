# Protección de `main`

Este documento recoge la protección de `main`: la que está activa hoy, los nueve controles
requeridos, la secuencia con la que se activaron y las reglas que no cambian (FR-026).
Distingue tres cosas:

- la **protección actual verificada**, con los nueve controles ya requeridos;
- la **protección observada antes de la activación**, que se conserva como histórico;
- el **procedimiento de activación**, que se aplicó el 2026-10-06 y queda como referencia.

**Los nueve controles son requeridos en `main` desde el 2026-10-06.** Se ejecutan en cada pull
request y en cada actualización de `main`, y ningún pull request puede integrarse sin que los
nueve terminen con éxito sobre una rama al día. Los datos de la activación están en el
[Registro de activación](#registro-de-activación).

## Protección actual verificada

Consultada en lectura el 2026-10-06 con la API de GitHub (`gh api`), después de la activación:

- **Mecanismo**: la misma **regla clásica de protección de rama** sobre `main`. Sigue sin haber
  rulesets del repositorio ni heredados que se apliquen a `main`.
- **Controles de estado requeridos**: `format`, `lint`, `types`, `test`, `build`,
  `macos-quality`, `secrets`, `dependencies` y `workflows`, cada uno vinculado a la aplicación
  GitHub Actions (identificador 15368).
- **Ramas al día** exigidas antes de integrar (`strict` activado).
- **Sin cambios respecto a la protección anterior**: pull request obligatorio con 0
  aprobaciones requeridas, administradores sujetos a la regla, pushes forzados y borrado de la
  rama no permitidos, historial lineal y resolución de conversaciones obligatorios, sin listas
  de elusión ni restricciones de push.
- La integración automática sigue desactivada en el repositorio (`allow_auto_merge: false`).

## Protección observada antes de la activación (histórico)

Consultada en lectura el 2026-09-30 con la API de GitHub (`gh api`). Describe el estado
anterior a la activación y se conserva para trazabilidad:

- **Mecanismo**: una **regla clásica de protección de rama** sobre `main`. No hay rulesets del
  repositorio ni heredados de la organización que se apliquen a `main`: `…/rulesets` y
  `…/rules/branches/main` devuelven listas vacías.
- **Pull request obligatorio**, con 0 aprobaciones requeridas: los cambios solo llegan a `main`
  mediante pull request.
- **Administradores sujetos a la regla** (`enforce_admins` activado).
- **Pushes forzados no permitidos** y **borrado de la rama no permitido**.
- **Historial lineal** obligatorio y **resolución de conversaciones** obligatoria.
- **Sin listas de elusión**: la respuesta no incluye `bypass_pull_request_allowances` ni
  restricciones de push.
- **Sin controles de estado requeridos**: `required_status_checks` no estaba configurado.
- La integración automática estaba desactivada en el repositorio (`allow_auto_merge: false`).

Esa protección básica se mantuvo durante toda la funcionalidad y no se desactivó. La activación
solo le añadió los controles requeridos y la exigencia de ramas al día.

## Los nueve controles requeridos

Los nombres son exactamente los identificadores de job de los workflows y los nombres con los
que aparecen en los pull requests (FR-022). Hay ocho categorías y un control de plataforma,
`macos-quality`, que no es una categoría (ver [`quality-controls.md`](quality-controls.md)).

| Control         | Workflow   | Runner         |
| --------------- | ---------- | -------------- |
| `format`        | `quality`  | `ubuntu-24.04` |
| `lint`          | `quality`  | `ubuntu-24.04` |
| `types`         | `quality`  | `ubuntu-24.04` |
| `test`          | `quality`  | `ubuntu-24.04` |
| `build`         | `quality`  | `ubuntu-24.04` |
| `macos-quality` | `quality`  | `macos-26`     |
| `secrets`       | `security` | `ubuntu-24.04` |
| `dependencies`  | `security` | `ubuntu-24.04` |
| `workflows`     | `security` | `ubuntu-24.04` |

**Fuente**: la aplicación **GitHub Actions** de este repositorio (`github-actions`, con
identificador de aplicación 15368 en la API). Cada control tiene fijada esa fuente, para que
ninguna otra integración pueda satisfacer un control con el mismo nombre.

**Comprobaciones que no son controles requeridos**. Dependabot informa comprobaciones propias
en los commits y en sus pull requests: los jobs `Dependabot` de sus actualizaciones y la
validación de `.github/dependabot.yml`. No forman parte de los nueve controles, no están
requeridas y no sustituyen a ninguno. Los pull requests de Dependabot están sujetos a los
mismos nueve controles que cualquier otro.

Renombrar, añadir o retirar un control requerido exige un ADR y una transición que nunca deje
`main` con un control requerido que no informa ni sin un control equivalente (FR-022 y FR-027).

## Secuencia de integración y activación

Esta secuencia se siguió para `001-engineering-baseline` entre el 2026-10-06T20:44:11Z
(integración) y el 2026-10-06T20:51:36Z (activación verificada). Se conserva como
procedimiento de referencia.

1. **Antes de integrar**: la protección básica de `main` se mantiene. El pull request de la
   funcionalidad registra en su descripción las comprobaciones manuales reproducibles y debe
   superar los nueve controles, que ya se ejecutan en él.
2. **Integración inicial**: el pull request solo se integra si SC-002, SC-003, la parte de pull
   request de SC-004, SC-005, SC-006 y la parte local de SC-007 están **Superado**, y los nueve
   controles están en verde. SC-001 y SC-008 son validaciones empíricas aplazadas: pueden
   quedar Pendiente, sin evidencia y sin bloquear la integración, pero no se dan por superados.
   La integración **no** inicia la congelación.
3. **Ejecuciones en `main` hasta el primer éxito**: se comprueba el par de workflows (`quality`
   y `security`) disparado por la actualización de `main` sobre el **mismo SHA**. Si algún
   control falla, la corrección se prepara y se integra mediante un pull request normal. Pueden
   existir tantas integraciones correctivas como sean necesarias; este tramo todavía no está
   sujeto a la congelación. La ejecución semanal programada de `security` no cuenta.
4. **Primera ejecución satisfactoria y congelación**: cuando los nueve controles terminan con
   éxito por primera vez en el mismo SHA de `main`, comienza la **congelación**. Desde ese
   momento y hasta completar la activación no se integra ningún cambio, tampoco las
   actualizaciones de Dependabot.
5. **Activación inmediata**: el mantenedor añade los nueve nombres como controles de estado
   requeridos en la regla existente de `main`, en la misma sesión administrativa y sin commits
   intermedios en `main`. Se registran la hora de fin de la primera ejecución satisfactoria y
   la hora de activación. Si la activación falla, la congelación continúa hasta completarla.
6. **Registro**: el primer pull request posterior, ya sujeto a los controles requeridos,
   completa la sección "Registro de activación" de este documento con la fecha de activación,
   el enlace a la ejecución de `main` y la lista de los nueve controles activados. También
   completa en `acceptance.md` la evidencia de `main` de SC-004, SC-007 y SC-009, y cambia los
   ADR 0001 y 0002, junto con `docs/adr/README.md`, de Propuesto a Aceptado. La primera
   funcionalidad de producto no comienza hasta integrar ese pull request.

## Configuración exigida para la activación

La activación añade los controles a la **regla existente**; no cambia de mecanismo. Los pasos
siguientes son las instrucciones del paso 5. El 2026-10-06 se aplicó la configuración
equivalente de la regla clásica mediante la API de GitHub, en una única actualización que
reprodujo las propiedades existentes y añadió los controles requeridos; no hizo falta el
procedimiento de ruleset.

### Regla clásica de protección de rama (mecanismo observado)

En **Settings → Branches**, editar la regla de `main`:

1. Activar **Require status checks to pass before merging**.
2. Activar **Require branches to be up to date before merging**.
3. Buscar y seleccionar los nueve controles con su nombre exacto y elegir **GitHub Actions**
   como fuente esperada. GitHub permite seleccionar como fuente una aplicación que haya
   informado recientemente ese control. Durante la activación, si algún control no puede
   seleccionarse con esa fuente, la activación no está completa y la congelación continúa.
4. Mantener sin cambios el resto de la regla: pull request obligatorio, administradores sujetos
   (**Do not allow bypassing the above settings**), sin pushes forzados y sin borrado.
5. Guardar los cambios.

### Ruleset (no observado; solo si la regla fuera un ruleset)

Si en el momento de la activación `main` estuviera protegida por un ruleset, en **Settings →
Rules → Rulesets**, editar el ruleset que se aplica a `main`:

1. Activar **Require status checks to pass before merging**.
2. Activar **Require branches to be up to date before merging**.
3. Añadir los nueve controles con su nombre exacto y la fuente **GitHub Actions**.
4. Comprobar que la **lista de elusión** (_bypass list_) está vacía, sin administradores ni
   otros actores, y que siguen activos el pull request obligatorio, **Block force pushes** y
   **Restrict deletions**.
5. Guardar los cambios con el ruleset en estado **Active**.

### Verificación con `gh api`

Consultas de solo lectura:

```bash
# Regla clásica: controles requeridos, ramas al día, administradores y pushes forzados
gh api repos/Informatica-Colectivo-Prime/aulanorma/branches/main/protection \
  --jq '{strict: .required_status_checks.strict, checks: .required_status_checks.checks, enforce_admins: .enforce_admins.enabled, force_pushes: .allow_force_pushes.enabled, bypass: .required_pull_request_reviews.bypass_pull_request_allowances}'

# Ruleset: reglas efectivas sobre main y rulesets del repositorio
gh api repos/Informatica-Colectivo-Prime/aulanorma/rules/branches/main
gh api repos/Informatica-Colectivo-Prime/aulanorma/rulesets

# Ausencia de integraciones durante la congelación
git log --first-parent --format='%H %cI %s' origin/main
```

La activación está completa cuando la respuesta muestra los nueve nombres exactos como
requeridos, cada uno con la fuente GitHub Actions, las ramas al día exigidas, los administradores
sujetos a la regla y ningún actor con permiso de elusión. El registro de commits de `main` debe
demostrar que no hubo integraciones entre la primera ejecución satisfactoria y la activación.

## Reglas que no cambian

- **Sin pushes directos ni forzados** a `main`: todo cambio llega mediante pull request.
- **Nadie puede eludir la protección**, tampoco los administradores.
- **Sin aprobación de otra persona** mientras haya un único mantenedor. La revisión se documenta
  en la descripción de cada pull request con la lista de comprobación constitucional, que
  responde las doce puertas con su evidencia.
- **Sin desactivación de emergencia**: ante una incidencia se espera a resolverla o se modifica
  formalmente la gobernanza antes de continuar. La enmienda también se integra mediante un pull
  request sujeto a los controles requeridos; si el bloqueo afecta también a ella, se espera.
- **Sin integración automática**: tampoco para los pull requests de Dependabot.

## Registro de activación

- **Commit de `main`**: `5ca3b16c10f0df943453f8e696cd521642608213`, la integración por squash
  del pull request #3 (2026-10-06T20:44:11Z).
- **Primera ejecución satisfactoria en `main`**: evento `push`, intento 1, sobre ese commit, con
  los nueve controles en success:
  [`quality` 37528698987](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698987)
  y
  [`security` 37528698946](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698946).
  No hubo integraciones correctivas anteriores.
- **Inicio de la congelación**: 2026-10-06T20:46:26Z, fin de esa ejecución (`security` había
  terminado a las 20:45:22Z).
- **Activación verificada y fin de la congelación**: 2026-10-06T20:51:36Z, hora en la que se
  releyó la protección desde la API después de aplicarla.
- **Controles activados**, con su nombre exacto y la aplicación GitHub Actions como fuente
  (identificador 15368): `format`, `lint`, `types`, `test`, `build`, `macos-quality`,
  `secrets`, `dependencies` y `workflows`.
- **Ramas al día** exigidas (`strict` activado).
- **Resto de la regla**: sin cambios. La configuración anterior y la posterior, comparadas
  campo a campo sin el bloque de controles requeridos, son idénticas: pull request
  obligatorio, administradores sujetos, historial lineal, resolución de conversaciones, sin
  pushes forzados ni borrado, sin listas de elusión.
- **Sin integraciones durante la congelación**: entre el inicio y la activación, `main` siguió
  en `5ca3b16c10f0df943453f8e696cd521642608213`, y ningún pull request se integró en ese
  intervalo. Los pull requests que Dependabot abrió al recibir `main` su configuración
  quedaron abiertos y sin integrar.
- **Comprobación en el primer pull request posterior**: que los nueve controles aparecen como
  requeridos y bloquean la integración mientras no estén en verde se comprueba en ese pull
  request (T089) y se registra en `acceptance.md` (SC-009).
