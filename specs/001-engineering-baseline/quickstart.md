# Quickstart: Base de ingeniería de AulaNorma

**Funcionalidad**: `001-engineering-baseline` | **Plan**: [plan.md](./plan.md)

Recorrido reproducible desde un clon limpio para validar la base de ingeniería de principio a
fin en **macOS** (arm64 o x64) y **Linux** (x64 o arm64). Es la base de los procedimientos de
aceptación de SC-001 a SC-009; el apartado 10 resume cómo se recoge la evidencia, y el detalle
está en la [matriz de aceptación](./plan.md#matriz-de-aceptación). La documentación permanente
del repositorio (`README.md` y `docs/engineering/`) reproducirá estos pasos durante la
implementación.

## Requisitos previos

| Herramienta | Versión | Comprobación |
|-------------|---------|--------------|
| Git | 2.40 o superior | `git --version` |
| Node.js | Rango soportado `>=24.21.0 <25` (incluye npm 11). **24.21.0** para reproducir el entorno de referencia y, obligatoriamente, en la aceptación | `node --version`: `v24.21.0` en la aceptación; cualquier `v24.x` igual o posterior a `v24.21.0` para desarrollar |
| curl | Cualquiera reciente | `curl --version` |
| Acceso a Internet | Para `npm ci` y `npm run tools:install` | — |

Node.js 24.21.0 es la versión fijada en `.node-version`, la misma que usa la integración
continua. Se instala con el instalador oficial de [nodejs.org](https://nodejs.org/) o con un
gestor de versiones que lea `.node-version`. Una versión posterior de la línea 24 sirve para
desarrollar, pero las mediciones de aceptación se hacen siempre con 24.21.0. El tiempo de
instalación de los requisitos previos no cuenta en SC-001. En Windows solo se admite WSL, sin
verificación oficial.

## 1. Clonar e instalar

```bash
git clone https://github.com/Informatica-Colectivo-Prime/aulanorma.git
cd aulanorma
node --version          # v24.21.0 en la aceptación
npm ci                  # instala desde package-lock.json; no ejecuta scripts de instalación
```

**Resultado esperado**: `npm ci` termina sin errores. Con una versión de Node.js fuera del
rango `>=24.21.0 <25`, por ejemplo 24.13.0 o 26.x, termina con un error que indica el rango
requerido (`devEngines`). Una 24.x posterior a 24.21.0 se acepta.

## 2. Configurar sin secretos

```bash
cp .env.example .env.development.local
```

`.env.example` documenta cada variable (`AULANORMA_LOG_LEVEL` y `AULANORMA_ENVIRONMENT`) con
valores ficticios válidos. Ninguna es un secreto. `.env.development.local` está excluido de Git
y solo lo carga `npm run dev`. Una variable definida en el entorno de la terminal prevalece sobre
el fichero, aunque esté vacía.

## 3. Ejecutar y comprobar el estado

```bash
npm run dev
```

`npm run dev` ejecuta primero el preflight (`scripts/preflight.mjs dev`), que carga
`.env.development.local` igual que Next.js y valida la configuración. Solo si es válida arranca
`next dev`.

En otra terminal:

```bash
curl -i http://127.0.0.1:3000/api/health
```

**Resultado esperado** (según el [contrato](./contracts/health.openapi.yaml)):

- `HTTP/1.1 200 OK`, `content-type: application/json` y `cache-control: no-store`;
- cuerpo **exacto**: `{"status":"ok","version":"0.1.0"}` (con la versión de `package.json`);
- sin cabecera `x-powered-by`.

Comprueba también que no hay ninguna página:

```bash
curl -i http://127.0.0.1:3000/
curl -i http://127.0.0.1:3000/404
curl -i http://127.0.0.1:3000/_not-found
```

**Resultado esperado**: las tres responden `404`, **sin cuerpo** (`content-length: 0` o sin
contenido) y sin `content-type: text/html` (contrato, `x-aulanorma-not-found`).

Detén el servidor con `Ctrl+C`.

Si cambias `.env.development.local` con el servidor en marcha, Next.js recarga el fichero y
vuelve a evaluar las rutas. Si los valores nuevos son inválidos, `/api/health` responde `500` sin
cuerpo y nunca "ok". Para aplicar cualquier cambio de configuración, reinicia `npm run dev`: es
el único procedimiento soportado, y el preflight volverá a validar los valores.

## 4. Comprobar el rechazo de una configuración inválida en ambos modos

En desarrollo, con un valor inválido en la terminal, que prevalece sobre
`.env.development.local`:

```bash
AULANORMA_LOG_LEVEL=loud npm run dev ; echo "exit=$?"
```

En producción:

```bash
npm run build
AULANORMA_LOG_LEVEL=loud AULANORMA_ENVIRONMENT=development npm start ; echo "exit=$?"
AULANORMA_ENVIRONMENT=development npm start ; echo "exit=$?"
```

**Resultado esperado** en los tres casos:

- el proceso termina enseguida con un código distinto de 0 (`exit=1`);
- se muestra un registro `fatal` `startup.config_invalid` que nombra la clave
  (`AULANORMA_LOG_LEVEL`) y el problema (`invalid_value` o `missing`), **sin** mostrar el valor
  `loud`;
- Next.js no llega a arrancar, así que ningún proceso queda escuchando y `/api/health` nunca
  responde.

Este comportamiento se verificó con Next.js 16.3.6 en los dos modos (research.md, R8).
`npm run check:build` lo comprueba automáticamente en ambos modos, con los casos de variable
ausente, vacía, inválida y desconocida.

## 5. Ejecutar todos los controles

```bash
npm run tools:install   # descarga gitleaks y zizmor fijados y verifica su SHA-256 en .tools/bin
npm run check           # las ocho categorías: formato, lint, tipos, pruebas, build + humo, secretos, dependencias, workflows
```

**Resultado esperado**: cada control informa de su éxito y el comando termina con código 0. En
el entorno de referencia (`docs/engineering/reference-environment.md`), `npm run check` tarda
menos de 10 minutos (SC-002).

`npm run check:secrets` examina todo el historial Git alcanzable desde `HEAD` y además el árbol
de trabajo: los ficheros versionados, con sus cambios sin commit, y los **ficheros nuevos sin
seguimiento que no estén ignorados**. Nunca examina lo que ignora `.gitignore` (`node_modules/`,
`.env.*`, `.next/`, `.tools/`). Trabaja sobre una copia temporal y no modifica el repositorio.

Para cronometrarlo:

```bash
time npm run check
```

Cada categoría también puede ejecutarse por separado: `npm run check:format`, `check:lint`,
`check:types`, `check:test`, `check:build`, `check:secrets`, `check:deps` y `check:workflows`.
Ver [plan.md](./plan.md#comandos-npm).

## 6. Comprobar que cada control detecta su fallo (aceptación)

Este paso forma parte de la aceptación de la línea base. `verify:negative` **no es un control
obligatorio** y no se ejecuta en los pull requests.

```bash
npm run verify:negative
git status --porcelain   # debe quedar vacío (o igual que antes de ejecutar)
```

**Resultado esperado**: para cada una de las ocho categorías (formato, análisis estático y
límites, tipos, pruebas, construcción, secretos, dependencias y seguridad de workflows) se
informa de que el control falló como se esperaba. En secretos, además, se informa de que un
token en un fichero nuevo sin seguimiento se detecta y de que un token en un fichero ignorado no
se examina. El procedimiento termina con código 0 y el repositorio real no cambia. Cada categoría
trabaja en una copia temporal con sus propias dependencias instaladas desde la caché de npm, y la
categoría de dependencias necesita acceso al registro de npm. Las alteraciones se describen en
[plan.md](./plan.md#diseño-de-las-pruebas-negativas).

## 7. Comprobar el determinismo (aceptación de SC-005)

```bash
for i in 1 2 3 4 5; do npm run check:test > "${TMPDIR:-/tmp}/sc005-online-$i.log" 2>&1; echo "online run $i exit=$?"; done
```

Desactiva la red (Wi-Fi apagado o cable desconectado), comprueba que no hay acceso y repite el
bucle:

```bash
curl -sS --max-time 5 https://registry.npmjs.org/ -o /dev/null ; echo "network exit=$?"   # debe ser distinto de 0
for i in 1 2 3 4 5; do npm run check:test > "${TMPDIR:-/tmp}/sc005-offline-$i.log" 2>&1; echo "offline run $i exit=$?"; done
```

**Resultado esperado**: las diez ejecuciones terminan con `exit=0` y el resumen de Vitest de
cada fichero de registro muestra los mismos recuentos de ficheros y pruebas.

## 8. Verificación en Linux

Repite los pasos 1 a 6 en una máquina o máquina virtual Linux (x64 o arm64) con los mismos
requisitos previos, también con Node.js 24.21.0. **Resultado esperado**: los mismos resultados
que en macOS (FR-001 y SC-001).

## 9. Qué hace la integración continua y qué se hace solo en la aceptación

- **En cada pull request hacia `main` y en cada actualización de `main`**: se ejecutan los nueve
  controles requeridos, es decir, los ocho de categoría en `ubuntu-24.04` y `macos-quality`
  (formato, lint, tipos, pruebas y construcción) en `macos-26`. Son los mismos comandos del
  paso 5.
- **Solo en local, durante la aceptación**: `npm run verify:negative` (paso 6). No es un control
  obligatorio y ningún workflow lo ejecuta.
- **Una sola vez, durante la aceptación**: ocho pull requests negativos en borrador, uno por
  categoría, con el título `[NEGATIVE TEST] <identificador> — do not merge`. Se registra el
  enlace a cada ejecución fallida en `specs/001-engineering-baseline/acceptance.md`, se cierran
  sin integrar y se eliminan sus ramas (plan.md, "Aceptación en la integración continua").
- **Protección de push en el pull request negativo de secretos**: GitHub puede bloquear el push
  del token sintético, por la protección personal de la cuenta o por la del repositorio. Nunca
  se usa un secreto real: antes del push se revisa que el valor procede del generador
  sintético. Si el push se bloquea, se autoriza **solo** con el motivo "It's used in tests"
  ("usado en pruebas"), se registra la autorización en `acceptance.md` sin copiar el valor, se
  vuelve a enviar la rama, se comprueba que el control `secrets` falla, se cierra el pull
  request sin integrar y se elimina la rama. Esto no elude la protección de `main`: el pull
  request sigue en borrador, no se integra y debe mostrar el control fallido.

## 10. Recogida de evidencias de aceptación

La aceptación se hace una vez, sobre el último commit del pull request de la funcionalidad (y
se repite lo afectado si ese commit cambia), con Node.js **24.21.0** en todas las mediciones.
No son controles: ningún workflow las ejecuta y no se repiten en cada pull request. Toda la
evidencia se guarda en `specs/001-engineering-baseline/acceptance.md`, con el estado
**Superado**, **No superado** o **Pendiente** por criterio, y nunca incluye secretos, valores
de tokens ni datos personales reales.

| Criterio | Cómo se recoge la evidencia | Cuándo |
|----------|-----------------------------|--------|
| SC-001 | Pasos 1 a 3 cronometrados desde un clon limpio en el macOS de referencia, por una persona sin conocimiento previo y sin ayuda (menos de 30 minutos), y repetidos en Linux (paso 8). El mantenedor puede preparar el entorno y observar o registrar la prueba, pero no sustituir a esa persona. Se anotan inicio, fin, duración, versiones y salida de `curl`. Solo es Superado cuando esa persona completa el recorrido dentro del límite y la evidencia queda registrada. Sin esa persona, queda **Pendiente**, nunca Superado, como en SC-008, aunque cada criterio tiene su propio procedimiento | Antes de integrar |
| SC-002 | Cada comando de categoría y `time npm run check` (paso 5) en el macOS de referencia: todos con código 0 y el agregado en menos de 10 minutos | Antes de integrar |
| SC-003 | Salida de `npm run verify:negative` con el estado de Git antes y después (paso 6), y enlaces a los ocho pull requests negativos y a sus ejecuciones fallidas (apartado 9), con la autorización de push si la hubo. Al final no queda ninguna rama `negative-test/*` | Antes de integrar |
| SC-004 | En el pull request de la funcionalidad, la ejecución inicial y dos reejecuciones completas sobre el mismo commit, esperando a que termine cada una; después, la ejecución de `main` tras integrar. De cada una se anotan identificador, número de intento, inicio, final y duración de los nueve jobs (cada uno en menos de 15 minutos) | Pull request antes de integrar; `main` justo después |
| SC-005 | Cinco ejecuciones de `npm run check:test` con red y cinco sin red (paso 7), con código de salida y recuentos de cada una | Antes de integrar |
| SC-006 | `diff .env.example .env.development.local` sin diferencias, `.env.example` sin secretos y ningún `secrets.*` ni token pasado explícitamente en `.github/workflows` | Antes de integrar |
| SC-007 | `npm run check:secrets` sobre un clon completo (no superficial), que recorre todo el historial alcanzable desde `HEAD`, sin hallazgos no justificados, y enlaces a los jobs `secrets` del pull request y de `main` | Antes de integrar y confirmación en `main` |
| SC-008 | Una persona que no ha participado en la implementación lee solo la documentación e identifica las cuatro capas y los nueve controles. Se anotan un identificador no personal, sus respuestas y el resultado. Sin esa persona, queda **Pendiente**, nunca Superado | Cuando la documentación está completa |
| SC-009 | Tras la ejecución de `main`, respuesta de la API de GitHub con los nueve controles requeridos y lista de commits de `main` que muestra que no se integró nada antes de activarlos | Justo después de la ejecución de `main`; se registra en el primer pull request posterior |

## Resolución de problemas

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| `npm ci` rechaza la versión de Node.js | Node.js fuera del rango `>=24.21.0 <25` (por ejemplo, 24.13.0 o 26.x) | Instalar la versión de `.node-version` (24.21.0), obligatoria en la aceptación |
| `npm start` termina con `missing` | `npm start` no carga `.env.development.local` | Es lo esperado: en producción la configuración viene del entorno; para desarrollo, usar `npm run dev` |
| `npm run dev` termina con `missing` o `invalid_value` aunque `.env.development.local` es correcto | La terminal tiene definida la variable, quizá vacía, y prevalece sobre el fichero | Ejecutar `unset AULANORMA_LOG_LEVEL AULANORMA_ENVIRONMENT` y repetir |
| `/api/health` responde `500` con `npm run dev` en marcha | Se ha cambiado `.env.development.local` a un valor inválido y Next.js lo ha recargado | Corregir el fichero y reiniciar `npm run dev` |
| La prueba de humo se niega a ejecutarse | Existe `.env`, `.env.local` o `.env.production*` | Eliminarlos o renombrarlos a `.env.development.local` |
| `check:secrets` informa de un fichero que aún no está en Git | Contiene un valor con forma de secreto y no está ignorado | Quitar el valor; si es un secreto real, revocarlo (`SECURITY.md`). Si el fichero debe quedar fuera de Git, añadirlo a `.gitignore` |
| `check:secrets` o `check:workflows` no encuentran la herramienta | Falta `npm run tools:install` | Ejecutarlo; necesita acceso a GitHub |
| `check:deps` falla sin cambios de código | Se ha publicado un aviso nuevo de gravedad alta o crítica | Actualizar la dependencia o registrar una excepción justificada (FR-020) |
