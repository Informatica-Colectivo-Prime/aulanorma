# Protección de `main`

Este documento recoge la protección de `main`: la que está activa hoy, los nueve controles que
deben pasar a ser requeridos, la secuencia exacta para activarlos y las reglas que no cambian
(FR-026). Distingue dos cosas:

- la **protección actual observada**, que ya existe y se mantiene;
- la **configuración exigida para la activación posterior**, que todavía no se ha aplicado.

**Los nueve controles todavía no son requeridos en `main`.** Se ejecutan en cada pull request y
en cada actualización de `main`, pero solo se añadirán como requeridos tras la primera ejecución
satisfactoria en `main`, según la secuencia de este documento.

## Protección actual observada

Consultada en lectura el 2026-09-30 con la API de GitHub (`gh api`):

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
- **Sin controles de estado requeridos**: `required_status_checks` no está configurado.
- La integración automática está desactivada en el repositorio (`allow_auto_merge: false`).

Esta protección básica se mantiene durante toda la funcionalidad y no se desactiva.

## Los nueve controles que se añadirán como requeridos

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

**Fuente esperada**: la aplicación **GitHub Actions** de este repositorio (`github-actions`, con
identificador de aplicación 15368 en la API). Al configurar cada control se fija esa fuente,
para que ninguna otra integración pueda satisfacer un control con el mismo nombre.

Renombrar, añadir o retirar un control requerido exige un ADR y una transición que nunca deje
`main` con un control requerido que no informa ni sin un control equivalente (FR-022 y FR-027).

## Secuencia de integración y activación

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
siguientes son instrucciones para el paso 5 y solo se ejecutan entonces.

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
