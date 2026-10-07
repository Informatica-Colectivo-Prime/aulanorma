# Controles de calidad y seguridad

Este documento describe las ocho categorías de control, los nueve controles requeridos de la
integración continua, los comandos locales equivalentes y el procedimiento local que demuestra
que cada categoría detecta su fallo. La integración continua ejecuta exactamente los mismos
comandos que se ejecutan en local.

## Ocho categorías

| #   | Categoría                   | Comando local             | Job de Linux   | Herramienta y alcance                                                                                                          |
| --- | --------------------------- | ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Formato                     | `npm run check:format`    | `format`       | Prettier (`prettier --check .`), con las exclusiones de `.prettierignore`                                                      |
| 2   | Análisis estático y límites | `npm run check:lint`      | `lint`         | ESLint con `typescript-eslint` tipado y los límites de importación entre capas, sin avisos (`--max-warnings=0`)                |
| 3   | Tipos                       | `npm run check:types`     | `types`        | `next typegen` y `tsc --noEmit`                                                                                                |
| 4   | Pruebas                     | `npm run check:test`      | `test`         | Vitest, sin red                                                                                                                |
| 5   | Construcción                | `npm run check:build`     | `build`        | `next build` y la prueba de humo del servidor real en `npm start` y `npm run dev`                                              |
| 6   | Secretos                    | `npm run check:secrets`   | `secrets`      | Gitleaks 8.30.1: historial alcanzable desde `HEAD`, índice de Git y árbol de trabajo no ignorado, como tres análisis separados |
| 7   | Dependencias                | `npm run check:deps`      | `dependencies` | `npm audit` del lockfile completo (falla con gravedad alta o crítica sin excepción vigente) y `npm audit signatures`           |
| 8   | Seguridad de workflows      | `npm run check:workflows` | `workflows`    | zizmor 1.30.1 sin red sobre los YAML de `.github/workflows`, con todas las auditorías de gravedad baja o superior              |

Cada comando termina con código 0 en un repositorio válido y con un código distinto de cero ante
un incumplimiento, indicando la causa (regla, código, aviso o prueba) y la ubicación (fichero y
línea, paquete o workflow).

## Nueve controles requeridos

Los controles requeridos son los jobs de dos workflows. El nombre del job es el nombre exacto
del control:

| Control         | Workflow   | Runner         | Comando                   |
| --------------- | ---------- | -------------- | ------------------------- |
| `format`        | `quality`  | `ubuntu-24.04` | `npm run check:format`    |
| `lint`          | `quality`  | `ubuntu-24.04` | `npm run check:lint`      |
| `types`         | `quality`  | `ubuntu-24.04` | `npm run check:types`     |
| `test`          | `quality`  | `ubuntu-24.04` | `npm run check:test`      |
| `build`         | `quality`  | `ubuntu-24.04` | `npm run check:build`     |
| `macos-quality` | `quality`  | `macos-26`     | `npm run check:quality`   |
| `secrets`       | `security` | `ubuntu-24.04` | `npm run check:secrets`   |
| `dependencies`  | `security` | `ubuntu-24.04` | `npm run check:deps`      |
| `workflows`     | `security` | `ubuntu-24.04` | `npm run check:workflows` |

`macos-quality` **no es una categoría**: verifica la plataforma macOS ejecutando el agregado
`check:quality`, es decir, las categorías 1 a 5 en un solo job. Por eso hay ocho categorías y
nueve controles requeridos.

Los dos workflows se ejecutan en cada pull request hacia `main`, también en borrador, y en cada
actualización de `main`. `security` se ejecuta además cada lunes a las 06:00 UTC; esa ejecución
programada no cuenta como actualización de `main`. Los workflows no reciben secretos del
proyecto ni pasan ningún token a los comandos.

## Agregados y herramientas

| Comando                  | Qué hace                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `npm run check:quality`  | Formato, lint, tipos, pruebas y construcción, en secuencia; se detiene en el primer fallo  |
| `npm run check:security` | Secretos, dependencias y workflows, en secuencia; se detiene en el primer fallo            |
| `npm run check`          | `check:quality` y después `check:security`: las ocho categorías                            |
| `npm run tools:install`  | Instala Gitleaks y zizmor en `.tools/bin`, y qpdf en `.tools/qpdf`, verificando su SHA-256 |

`check:secrets` y `check:workflows` necesitan `npm run tools:install`. Ambos controles leen el
binario de `.tools/bin` sin seguir enlaces simbólicos, comprueban su SHA-256 contra
`scripts/tools/tools.lock.json` y ejecutan una copia de esos mismos bytes. Fallan cerrado si
falta la herramienta, si su SHA-256 no coincide o si el análisis no puede completarse.

`check:test` necesita también `npm run tools:install`: las pruebas del tratamiento de los PDF
ejecutan qpdf, y sin él fallan en lugar de omitirse. qpdf es un `.zip` con el ejecutable y sus
bibliotecas; `tools.lock.json` fija la huella de cada fichero, el instalador extrae solo esos y
los publica juntos, y la aplicación y las pruebas comprueban esas huellas antes de cada uso.
Los controles `test` y `macos-quality` de la integración continua lo instalan antes de probar.

`check:workflows` no admite excepciones: falla si existe una configuración de zizmor
(`zizmor.yml` o `.github/zizmor.yml`, con extensión `.yml` o `.yaml`) o si un workflow contiene
una directiva `zizmor: ignore`, y ejecuta zizmor con `--no-config` y `--no-ignores`. Las
excepciones de secretos y de dependencias siguen el registro de
[`security-exceptions.md`](security-exceptions.md) y `security/audit-exceptions.json`.

## Qué comandos necesitan red

- `npm run check:deps`: consulta la base de avisos y el registro de npm.
- `npm run tools:install`: descarga las herramientas de sus releases oficiales en GitHub.
- `npm run verify:negative`, en la categoría de dependencias: añade la dependencia controlada al
  lockfile de la copia y la audita.

El resto no usa la red: `check:secrets` y `check:workflows` analizan sin conexión, y las pruebas
bloquean cualquier conexión externa. `verify:negative` y la prueba de humo instalan las
dependencias de sus copias desde la caché local de npm (`--prefer-offline`), que llena el
`npm ci` del repositorio.

## Pruebas negativas locales (`verify:negative`)

`npm run verify:negative [categoría…]` es un **procedimiento de aceptación local, no un
control**: ningún workflow lo ejecuta y no es un control requerido. Sin argumentos verifica las
ocho categorías en orden (`format`, `lint`, `types`, `test`, `build`, `secrets`, `dependencies`
y `workflows`).

Para cada categoría crea una copia temporal con los ficheros regulares que Git no ignora, sin
enlaces simbólicos. Después:

1. inicializa en ella un repositorio Git con un commit base, una identidad sintética y una
   configuración aislada, sin hooks ni firma;
2. instala las dependencias con `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`;
3. aplica una única alteración sintética y ejecuta solo el comando de esa categoría;
4. comprueba que falla por la causa y en la ubicación esperadas.

Un código distinto de cero sin esa causa hace fallar el procedimiento; los fallos colaterales se
muestran, pero nunca sustituyen a la causa. La copia se elimina siempre.

Al terminar comprueba que el repositorio original conserva `HEAD`, su `git status` y la firma de
las rutas ignoradas (`.env.development.local`, `.next`, `node_modules` y `.tools`). Códigos de
salida:

- **0**: todas las categorías se comportan como se esperaba;
- **1**: alguna no se comporta así, o el original cambió;
- **2**: una categoría desconocida o repetida, antes de crear ninguna copia;
- **130 o 143**: interrumpido por SIGINT o SIGTERM, tras detener el proceso en curso y eliminar
  las copias.

| #   | Categoría      | Alteración en la copia                                                                                        | Causa esperada                                                     | Ubicación esperada                                                                                           |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1   | `format`       | Añade `const  sample={a:1}` al final de `src/platform/version/index.ts`                                       | Prettier: `Code style issues found`                                | `[warn] src/platform/version/index.ts`                                                                       |
| 2   | `lint`         | Crea `src/modules/normative-source/violation.ts`, que importa `@/modules/content-export`                      | ESLint: `no-restricted-imports`                                    | `src/modules/normative-source/violation.ts`, 1:1                                                             |
| 3   | `types`        | Añade `export const sample: number = "text";` al final de `src/platform/version/index.ts`                     | TypeScript: `TS2322`                                               | `src/platform/version/index.ts` (línea y columna)                                                            |
| 4   | `test`         | Crea `tests/unit/negative.test.ts` con `expect(1).toBe(2)`                                                    | Vitest: `AssertionError: expected 1 to be 2`                       | `tests/unit/negative.test.ts > prueba negativa sintética`                                                    |
| 4b  | `test`         | Crea `src/pages/negative-route.ts`, una página que no está en la lista cerrada de rutas                       | Vitest: la ruta no está en la lista cerrada                        | `tests/architecture/public-routes.test.ts`, prueba «src/pages contiene exactamente los ficheros de la lista» |
| 5   | `build`        | Crea la página `src/pages/negative-build.tsx`, cuyo `getStaticProps` lanza un error con un marcador aleatorio | `next build`: `Error occurred prerendering page "/negative-build"` | `src/pages/negative-build.tsx` (ruta `/negative-build`)                                                      |
| 6a  | `secrets`      | Token sintético en `negative-secret.txt`, en un commit de la copia                                            | Gitleaks: regla `github-pat` en el historial alcanzable            | `negative-secret.txt`, línea 1                                                                               |
| 6b  | `secrets`      | Token sintético en `negative-secret.txt`, nuevo, sin seguimiento y no ignorado                                | Gitleaks: regla `github-pat` en el árbol de trabajo                | `negative-secret.txt`, línea 1                                                                               |
| 6c  | `secrets`      | Token sintético solo en `.env.development.local`, ignorado                                                    | Exclusión positiva: `check:secrets` **termina con éxito**          | El árbol de trabajo analizado no incluye el fichero                                                          |
| 7   | `dependencies` | `npm install --package-lock-only --ignore-scripts lodash@4.17.20`: solo cambia los manifiestos de la copia    | `npm audit`: gravedad alta sin excepción                           | Paquete `lodash` y sus avisos GHSA                                                                           |
| 8   | `workflows`    | Crea `.github/workflows/negative-test.yml` con `${{ github.event.pull_request.title }}` dentro de `run:`      | zizmor: `template-injection`, gravedad High                        | `.github/workflows/negative-test.yml`, línea 12                                                              |

Los tokens tienen el formato de un token personal de GitHub. Se generan en cada ejecución con un
generador criptográfico, nunca han sido credenciales y no aparecen en ningún fichero versionado
ni en la salida. El subcaso 6c es una prueba de exclusión positiva, no una novena prueba negativa.
La dependencia `lodash@4.17.20` es benigna, con avisos públicos, y nunca se instala ni se
ejecuta.

### Construcción: datos fijados por la sonda

La alteración de construcción se fijó después de comprobarla en una copia desechable el
2026-09-30, con Next.js 16.3.6 y Node.js 24.21.0 en macOS arm64. La página compiló sin añadir
JSX ni configuración adicional:

- **Causa**: el `getStaticProps` de la página lanza un error durante la generación estática, así
  que `next build` termina con código 1 y la prueba de humo no llega a ejecutarse.
- **Ruta lógica del fichero temporal**: `src/pages/negative-build.tsx` dentro de la copia, que
  corresponde a la ruta `/negative-build`.
- **Marcador**: `negative-build-` seguido de 12 caracteres hexadecimales aleatorios, distinto en
  cada ejecución. Es el mensaje del error que lanza la página.
- **Salida observable**: se exige a la vez `Error occurred prerendering page "/negative-build"`,
  `Error: <marcador>` y la ruta `src/pages/negative-build.tsx`. En la sonda aparecieron además
  `Export encountered an error on /negative-build, exiting the build.` y la traza
  `src/pages/negative-build.tsx:4:9`, que no se usan como criterio. Tampoco se usan duraciones ni
  el número de procesos de Next.js.
- **Restauración**: la página solo existe en la copia, que se elimina en `finally`, también si el
  procedimiento se interrumpe.
- **Integridad del original**: al terminar se comprueba que `HEAD` y `git status` no han cambiado.
  `git status` detectaría un `src/pages/negative-build.tsx` en el original. También se comprueba
  que no ha cambiado la firma de `.next`, que Git ignora.

## Pruebas negativas en la integración continua

Durante la aceptación, cada categoría se comprueba también una vez en la integración continua,
con un pull request en borrador por categoría que se cierra sin integrar. El procedimiento está
en `specs/001-engineering-baseline/plan.md` ("Aceptación en la integración continua").
