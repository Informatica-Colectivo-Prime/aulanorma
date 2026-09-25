# ADR 0002: Estrategia de calidad, integración continua y seguridad

**Estado**: Propuesto (se acepta al integrar `001-engineering-baseline`)

**Fecha**: 2026-09-25

**Contexto de origen**: [`specs/001-engineering-baseline/plan.md`](../../specs/001-engineering-baseline/plan.md)
y [`research.md`](../../specs/001-engineering-baseline/research.md) (R5 a R7 y R10 a R15).
Incluye la revisión correctiva del 2026-09-25 (ocho categorías y nueve controles, cobertura
local de secretos y copias temporales) y la corrección documental posterior (regla del token
efímero de FR-021 y protección de push en la prueba negativa de secretos), ambas anteriores a
su aceptación.

## Contexto

La constitución exige que la línea base de integración continua exista antes de la primera
funcionalidad y que ningún pull request con controles requeridos fallidos pueda integrarse
después. La especificación `001-engineering-baseline` pide:

- comandos locales y de integración continua equivalentes;
- detección de secretos y seguridad de dependencias, con bloqueo en gravedad alta o crítica y
  visibilidad del resto;
- excepciones explícitas y revisables;
- integración continua con permisos mínimos y componentes externos fijados de forma inmutable,
  en la que las contribuciones no confiables no reciben secretos del proyecto, credenciales de
  larga duración ni credenciales con escritura, y solo se admite la credencial efímera de
  lectura que genera la plataforma (FR-021);
- pruebas deterministas sin red;
- pruebas negativas reproducibles.

El repositorio es público y pertenece a una organización de GitHub.

## Decisión

1. **Categorías, controles y comandos**: hay **ocho categorías de control**:
   1. formato;
   2. análisis estático y límites;
   3. tipos;
   4. pruebas;
   5. construcción;
   6. secretos;
   7. dependencias;
   8. seguridad de workflows.

   Cada una tiene un script npm (`check:format`, `check:lint`, `check:types`, `check:test`,
   `check:build`, `check:secrets`, `check:deps` y `check:workflows`), un job de Linux con nombre
   estable, una prueba negativa local y un pull request negativo de aceptación. Además existen
   los agregados `check:quality` (categorías 1 a 5), `check:security` (6 a 8) y `check`. La
   integración continua ejecuta exactamente esos scripts.
2. **Herramientas de calidad**:
   - Prettier 3.9.9;
   - ESLint 10.11.0 plano con `typescript-eslint` 8.70.1 (`strictTypeChecked`), límites de capas
     y prohibición de red y de `console` en `src/` con reglas del núcleo;
   - `next typegen && tsc --noEmit` para los tipos;
   - Vitest 5.0.2, con Vite 8.3.1 explícito y bloqueo de red en la preparación;
   - `next build` seguido de una prueba de humo del servidor real, en `npm start` y en
     `npm run dev` (ADR 0001).
3. **Secretos**: la **CLI de Gitleaks 8.30.1**, fijada por SHA-256 por plataforma e instalada con
   `scripts/tools/install-tools.mjs` en local y en la integración continua. `check:secrets`
   ejecuta el envoltorio `scripts/check-secrets.mjs`, igual en local y en la integración
   continua, con dos análisis:
   - **historial**: `gitleaks git --log-opts="--full-history HEAD"`, es decir, todo el historial
     alcanzable desde el commit evaluado, incluido el contenido borrado después. No usa el valor
     por defecto (`--all`), que también examina otras ramas y haría que el resultado dependiera
     de ellas;
   - **árbol de trabajo**: `gitleaks dir` sobre una copia temporal de los ficheros que devuelve
     `git ls-files --cached --others --exclude-standard`. Así examina los ficheros versionados
     con sus cambios sin commit y los **ficheros nuevos sin seguimiento no ignorados**, y nunca
     lo que ignora `.gitignore` (`node_modules/`, `.env.*`, `.next/`, `.tools/`). No sigue
     enlaces simbólicos, elimina la copia al terminar y comprueba que el repositorio real no ha
     cambiado.

   Las excepciones se registran por huella en `.gitleaksignore`, con las dos formas de huella
   (historial y árbol de trabajo), y con registro justificado en
   `docs/engineering/security-exceptions.md`. Se recomienda activar además la detección de
   secretos y la protección de push de GitHub, gratuitas en repositorios públicos; su
   interacción con la prueba negativa de secretos se describe en la decisión 8.
4. **Dependencias**: `scripts/check-dependencies.mjs` sobre `npm audit --json`. Falla con
   vulnerabilidades altas o críticas sin excepción vigente y con excepciones caducadas; muestra
   las medias y bajas sin fallar; y ejecuta `npm audit signatures`. Las excepciones están en
   `security/audit-exceptions.json`. Dependabot se configura para `npm` y `github-actions`, con
   `next` y `@next/env` en el mismo grupo.
5. **Seguridad de los workflows**: **zizmor 1.30.1** con `--offline`, instalado igual que
   Gitleaks.
6. **Integración continua (GitHub Actions)**:
   - workflows `quality` y `security`, disparados por `pull_request` y `push` a `main` (y un
     `schedule` semanal para `security`);
   - `permissions: {}` global y `contents: read` por job;
   - sin `pull_request_target` ni `workflow_run`;
   - **credenciales** (FR-021), igual en todos los jobs y también desde bifurcaciones:
     - ningún secreto del proyecto: no hay `secrets.*` en ningún workflow;
     - ninguna credencial de larga duración ni ningún token con permisos de escritura;
     - solo el token efímero `GITHUB_TOKEN` que la plataforma genera para cada job, con el
       permiso mínimo `contents: read`. Lo usa `actions/checkout` para obtener el código, y
       `actions/setup-node` lo recibe implícitamente por el valor predeterminado de su entrada
       `token`, solo para descargar Node.js;
     - `persist-credentials: false`, para que el token no quede en `.git/config`;
     - el token no se pasa explícitamente a scripts npm, a variables de la aplicación ni a
       comandos que ejecuten código del repositorio;
   - `actions/checkout` v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`) con
     `persist-credentials: false`, y `actions/setup-node` v7.0.0
     (`820762786026740c76f36085b0efc47a31fe5020`) con Node.js 24.21.0 desde `.node-version` y
     la caché de npm indexada por el lockfile;
   - runners `ubuntu-24.04` y `macos-26`;
   - `timeout-minutes: 15` por job.
7. **Controles requeridos**: **nueve**, con nombres estables de job. Son los ocho de categoría
   (`format`, `lint`, `types`, `test`, `build`, `secrets`, `dependencies` y `workflows`) y
   `macos-quality`, que verifica la plataforma macOS ejecutando `check:quality` y **no es una
   categoría**. Se añaden a la protección existente de `main` inmediatamente después de su
   primera ejecución satisfactoria en `main`, antes de cualquier otro cambio. Sin elusión para
   nadie y sin desactivación de emergencia.
8. **Pruebas negativas**: una por cada una de las **ocho categorías**:
   - **En local**: `scripts/negative-checks.mjs` (`npm run verify:negative`) aplica una
     alteración sintética por categoría sobre una copia temporal sin ficheros ignorados.
     Instala las dependencias en la copia con `npm ci --ignore-scripts --prefer-offline`, porque
     Turbopack rechaza un `node_modules` enlazado fuera de la copia. Verifica que el repositorio
     real no cambia. En secretos incluye un fichero nuevo sin seguimiento, que debe detectarse,
     y un fichero ignorado, que no debe examinarse.
   - **En la integración continua**: una sola vez, en la aceptación, ocho ramas
     `negative-test/<identificador>` con pull requests en borrador que se cierran sin integrar,
     se eliminan y dejan como evidencia enlaces a sus ejecuciones.
   - **Protección de push en el caso de secretos**: la protección de push de GitHub, personal
     o del repositorio, puede bloquear el token sintético antes de que llegue al repositorio.
     Nunca se usa un secreto real, y antes del push se revisa que el valor procede del
     generador sintético. Si el push se bloquea, se autoriza exclusivamente con el motivo
     "It's used in tests" ("usado en pruebas") y la autorización se registra como evidencia de
     aceptación, sin copiar el valor. Después se vuelve a enviar la rama, se comprueba que el
     control `secrets` falla, se cierra el pull request sin integrar y se elimina la rama.
     Esta autorización no elude la protección de `main`: el pull request sigue en borrador, no
     se integra y debe mostrar el control fallido.

   `verify:negative` no es un control requerido y ningún workflow lo ejecuta.

## Alternativas consideradas

- **`gitleaks/gitleaks-action`**: exige `GITLEAKS_LICENSE` como secreto en organizaciones, lo que
  incumple FR-019.
- **`gitleaks git --pre-commit` para los cambios locales**: verificado que no detecta los
  ficheros nuevos sin seguimiento, un caso habitual de secreto accidental.
- **`gitleaks dir .` sobre el repositorio real**: examinaría ficheros ignorados como
  `node_modules/` y `.env.*`.
- **`gitleaks git` con el valor por defecto (`--all`)**: el resultado dependería de otras ramas,
  como las de las pruebas negativas.
- **Enlazar `node_modules` en las copias temporales**: Turbopack lo rechaza al compilar.
- **TruffleHog**: verifica los secretos contactando con sus proveedores (llamadas externas).
- **`actions/dependency-review-action` u OSV-Scanner**: duplican `npm audit` y no tienen un
  equivalente local idéntico.
- **`npm audit --audit-level=high` sin envoltorio**: no admite excepciones justificadas ni
  separa la visibilidad de las gravedades medias y bajas.
- **Biome**: no tiene reglas con información de tipos equivalentes ni límites de importación
  expresables del mismo modo.
- **`eslint-plugin-boundaries`, `eslint-plugin-import` o dependency-cruiser**: dependencias
  adicionales; `eslint-plugin-import` no admite ESLint 10.
- **`eslint-config-next`**: sus complementos no admiten ESLint 10 y sus reglas son de interfaz.
- **Un job por categoría también en macOS**: multiplica los jobs sin mejorar la detección; macOS
  ejecuta el agregado de calidad.
- **`ubuntu-latest` y `macos-latest`**: cambian de imagen sin aviso.
- **`step-security/harden-runner`**: otra acción privilegiada, innecesaria sin secretos.
- **Homebrew o Docker para las herramientas binarias**: sin versiones exactas o con un requisito
  previo pesado.

## Consecuencias

**Positivas**:

- Cada categoría tiene un control local y remoto idéntico, con nombre estable y visible en el
  pull request.
- La integración continua no maneja secretos del proyecto ni credenciales de larga duración o
  de escritura: solo el token efímero de lectura, sin persistirlo. Los permisos mínimos se
  verifican automáticamente con zizmor.
- Las versiones de las herramientas binarias son exactas y su integridad está verificada en
  todas las plataformas.
- La cadena de suministro se endurece: sin scripts de instalación, con firmas verificadas,
  acciones fijadas por SHA y actualizaciones de Dependabot.

**Negativas y riesgos aceptados**:

- `check:deps` y `tools:install` necesitan red, y el resultado de la auditoría depende de la base
  de avisos del momento. Se mitiga con la auditoría semanal y las excepciones con caducidad.
- Dos binarios externos (Gitleaks y zizmor) son requisitos del conjunto de seguridad. Los
  binarios de zizmor son "best-effort"; la alternativa es `uv tool install zizmor==1.30.1`.
- Mantener los SHA-256 de `scripts/tools/tools.lock.json` es una tarea manual en cada
  actualización de esas herramientas.
- `check:secrets` hace una copia temporal de los ficheros no ignorados en cada ejecución, un
  coste pequeño en un repositorio de este tamaño.
- Las copias temporales de la prueba de humo del modo desarrollo y de `verify:negative` instalan
  desde la caché local de npm. Si falta algún paquete en la caché, y siempre en la categoría de
  dependencias, necesitan acceso al registro.
- La prueba negativa de secretos en la integración continua puede requerir una autorización
  manual de la protección de push, con el motivo "usado en pruebas". Deja una evidencia más que
  registrar y, si GitHub la genera, una alerta de detección de secretos asociada al valor
  sintético.

**Revisiones planificadas**:

- En la primera funcionalidad con interfaz: `@next/eslint-plugin-next`,
  `eslint-plugin-react-hooks` y reglas de accesibilidad (principio X), ajustando la versión de
  ESLint si hace falta.
- Si en el futuro la integración continua necesita secretos o permisos de escritura: ADR nuevo
  y evaluación de `harden-runner` y de entornos protegidos.
