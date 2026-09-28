# Quickstart: Base de ingeniería de AulaNorma

**Funcionalidad**: `001-engineering-baseline` | **Plan**: [plan.md](./plan.md)

Recorrido reproducible desde un clon limpio para validar la base de ingeniería de principio a
fin. Los **perfiles verificados** son exactamente dos: **macOS arm64** del mantenedor y
**Linux x64** de la integración continua y de la aceptación. Otras arquitecturas pueden
funcionar, pero no se declaran verificadas. Es la base de los procedimientos de aceptación de
SC-001 a SC-009; el apartado 10 resume cómo se recoge la evidencia, y el detalle está en la
[matriz de aceptación](./plan.md#matriz-de-aceptación). La documentación permanente del
repositorio (`README.md` y `docs/engineering/`) reproducirá estos pasos durante la
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
# En aceptación: fijar el SHA base (`git checkout <SHA>`). No clonar una rama mutable.
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
`server.mjs` en modo desarrollo, que escucha en `127.0.0.1:3000`. El script fija
`NODE_ENV=development` para los dos procesos, así que un `NODE_ENV` definido en la terminal no
cambia el modo. La dirección y el puerto son
fijos.

`npm run dev` y `npm start` son los **únicos puntos de entrada**: ambos ejecutan el preflight y
`server.mjs`. No uses `npx next dev`, `next dev`, `npx next start` ni `next start`: eluden la
frontera HTTP y no están admitidos. `node server.mjs` directo tampoco es una entrada admitida:
se salta el preflight, y la validación defensiva interna de `server.mjs` no lo convierte en un
punto de entrada soportado. Usa solo `npm run dev` o `npm start`.

En otra terminal:

```bash
curl -i http://127.0.0.1:3000/api/health
```

**Resultado esperado** (según el [contrato](./contracts/health.openapi.yaml)):

- `HTTP/1.1 200 OK`, `content-type: application/json` y `cache-control: no-store`;
- `vary: Accept-Encoding` puede aparecer; es la única `vary` admitida;
- cuerpo **exacto**: `{"status":"ok","version":"0.1.0"}` (con la versión de `package.json`);
- sin cabeceras `x-powered-by`, `server`, `etag` ni `x-nextjs-*`.

En desarrollo, la primera consulta puede tardar algo más, porque la ruta se compila en ese
momento.

Comprueba también los rechazos cerrados de la frontera HTTP:

```bash
curl -i http://127.0.0.1:3000/api/health/                 # destino no exacto
curl -i -X POST http://127.0.0.1:3000/api/health          # método no admitido
curl -i -X GET --data 'x' http://127.0.0.1:3000/api/health  # cuerpo no permitido
node -e 'const s=require("node:net").connect(3000,"127.0.0.1",()=>s.end("GET /api/health HTTP/2.0\r\nHost: 127.0.0.1:3000\r\n\r\n"));s.pipe(process.stdout)'
```

**Resultado esperado**, en ese orden:

- `404` **sin redirección**: sin `location` ni `refresh`;
- `405` con `allow: GET, HEAD, OPTIONS`;
- `400`;
- `505`, porque la versión no es HTTP/1.0 ni HTTP/1.1.

Los cuatro tienen `content-length: 0`, `cache-control: no-store` y `connection: close`, ningún
cuerpo y ningún `content-type` (contrato, `x-aulanorma-rejection-contract`). Cualquier otra ruta,
como `/`, `/404` o `/_next/…`, responde el mismo `404` cerrado: ninguna página HTML se sirve.

Detén el servidor con `Ctrl+C`.

Los cambios de `.env.development.local` **requieren reiniciar** `npm run dev`, que vuelve a
pasar el preflight. No se promete la recarga en caliente de la configuración.

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
- `server.mjs` no llega a arrancar, así que ningún proceso queda escuchando y `/api/health`
  nunca responde.

El comportamiento del preflight se verificó con Next.js 16.3.6 en los dos modos (research.md,
R8). `npm run check:build` lo comprueba automáticamente en ambos modos, con los casos de
variable ausente, vacía, inválida y desconocida.

## 5. Ejecutar todos los controles

```bash
npm run tools:install   # descarga gitleaks y zizmor fijados y verifica su SHA-256 en .tools/bin
npm run check           # las ocho categorías: formato, lint, tipos, pruebas, build + humo, secretos, dependencias, workflows
```

**Resultado esperado**: cada control informa de su éxito y el comando termina con código 0. En
el entorno de referencia (`docs/engineering/reference-environment.md`), `npm run check` tarda
menos de 10 minutos (SC-002).

`npm run check:secrets` ejecuta tres análisis separados: (1) todo el historial alcanzable
desde `HEAD`, (2) el contenido del índice de Git y (3) los ficheros versionados modificados y
los ficheros nuevos no ignorados del árbol de trabajo. Nunca examina lo que ignora `.gitignore`
(`node_modules/`, `.env.*`, `.next/`, `.tools/`) ni sigue enlaces simbólicos. Falla cerrado si
falta la herramienta, si su SHA-256 no coincide o si el análisis no puede completarse. Trabaja
sobre una copia temporal y no modifica el repositorio.

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

En un clon limpio y completo propio fijado al SHA base, independiente de cualquier ejecución
de SC-001, repite los pasos locales aplicables 1 a 6 en una máquina o máquina virtual Linux
x64, con los mismos requisitos previos y Node.js 24.21.0.

La evidencia de Linux registra expresamente, con sus códigos de salida y salidas relevantes:

- instalación de dependencias y herramientas (`npm ci` y `npm run tools:install`);
- configuración local sin secretos y su comprobación;
- arranque del servicio;
- respuesta exacta de la consulta de estado;
- controles positivos de las ocho categorías;
- pruebas negativas mediante `npm run verify:negative`;
- commit, sistema operativo, arquitectura y versiones usadas.

**Resultado esperado**: instalación, configuración, arranque, estado y todos los controles
aplicables producen los mismos resultados que en macOS. Esta evidencia pertenece al
procedimiento local de SC-003 y no presupone que SC-001 se haya ejecutado o superado.

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
  request sigue en borrador, no se integra y debe mostrar el control fallido. Esta
  autorización es puntual de un dato de prueba: no es una excepción a FR-020. Si no puede
  autorizarse, SC-003 queda sin superar. Cualquier alerta se cierra como dato sintético usado
  en una prueba; su permanencia en las referencias del pull request cerrado es un riesgo
  aceptado.

### Secuencia tras integrar en `main`

1. Cada integración produce una ejecución de los nueve controles en `main`.
2. Si una ejecución falla, la corrección se prepara e integra mediante un pull request normal,
   con los nueve controles en verde. Pueden existir las integraciones correctivas necesarias
   hasta obtener la primera ejecución satisfactoria en `main`.
3. La congelación absoluta comienza al concluir esa primera ejecución satisfactoria de los nueve
   controles, no antes. Desde ese momento y hasta que los nueve queden configurados como
   requeridos no se integra ningún cambio.
4. SC-009 registra exactamente ese intervalo: SHA y final de la primera ejecución satisfactoria,
   hora de activación y ausencia de commits intermedios. Las correcciones anteriores son parte de
   la secuencia normal de pull requests previa a la congelación.
5. El primer pull request posterior, ya sujeto a los nueve controles requeridos, incorpora el
   registro de activación, la evidencia posterior y el cambio de los ADR 0001 y 0002, junto
   con `docs/adr/README.md`, de Propuesto a Aceptado.

## 10. Recogida de evidencias de aceptación

La aceptación se hace una vez sobre el **SHA base de aceptación** (código, dependencias,
workflows y documentación de procedimiento). El **HEAD de evidencia** puede añadir solamente
`acceptance.md`: ese commit no obliga a repetir mediciones, pero vuelve a ejecutar los
controles automáticos. Cualquier otro cambio crea una nueva base y obliga a repetir lo
afectado. Todas las mediciones usan Node.js **24.21.0**. No son controles: ningún workflow las
ejecuta y no se repiten en cada pull request. Toda la evidencia se guarda en
`specs/001-engineering-baseline/acceptance.md`, con el estado **Superado**, **No superado** o
**Pendiente** por criterio. Los enlaces a GitHub son admisibles; no se copian nombres de
personas, rutas locales ni salidas sin redactar. Las personas externas se identifican con un
seudónimo no reidentificable. Cada procedimiento local usa su propio clon completo, limpio y
fijado al SHA evaluado; no se clona una rama mutable. Ninguno depende del clon ni del estado
de SC-001. SC-001 y SC-008 DEBEN estar Superado antes de integrar.

| Criterio | Cómo se recoge la evidencia | Cuándo |
|----------|-----------------------------|--------|
| SC-001 | Pasos 1 a 3 cronometrados desde un clon limpio fijado al SHA base en el macOS arm64 de referencia, por una persona sin conocimiento previo al comenzar el primer recorrido y sin ayuda (menos de 30 minutos), y el mismo recorrido propio repetido en Linux x64, sin límite de 30 minutos. No reutiliza el clon ni la evidencia del paso 8. El mantenedor puede preparar requisitos previos, observar y registrar; cualquier explicación o corrección invalida el intento. Superado solo con ambos recorridos y evidencia registrada. Sin esa persona, queda **Pendiente**, el pull request permanece abierto y no se integra | Antes de integrar |
| SC-002 | En un clon limpio y completo propio del SHA base, independiente de SC-001: preparación, cada comando de categoría (incluidos `check:secrets`, `check:deps` y `check:workflows`) y `time npm run check` (paso 5) en el macOS de referencia; todos con código 0 y el agregado en menos de 10 minutos | Antes de integrar, aunque SC-001 esté Pendiente |
| SC-003 | En clones limpios y completos propios fijados al SHA: `verify:negative` con causa y ubicación esperadas (paso 6) en macOS; en Linux x64, evidencia explícita de instalación, configuración, arranque, estado, controles positivos y negativos (paso 8). Enlaces a los ocho pull requests negativos; fallos colaterales registrados; controles no afectados en verde; ningún commit de esas ramas alcanzable desde `main` | Antes de integrar |
| SC-004 | En el pull request, la ejecución inicial y dos reejecuciones completas sobre el mismo SHA, con los dos workflows del mismo SHA; cada uno de los nueve jobs concluye con éxito en menos de 15 minutos. Un timeout o un fallo no excluido reinicia la serie. Una cancelación por `concurrency` no cuenta. En `main`, la primera ejecución satisfactoria del par sobre el mismo SHA. Una indisponibilidad excluida requiere enlace a la incidencia pública del proveedor | Pull request antes de integrar; `main` antes de activar los controles requeridos |
| SC-005 | Diez ejecuciones de `check:test` en una misma máquina y clon propio: cinco con red y cinco con conectividad externa desactivada y comprobada (paso 7). Equivalencia de código de salida y recuentos de Vitest | Antes de integrar |
| SC-006 | En un clon limpio y completo propio del SHA base, independiente de SC-001: `diff` sin diferencias, `.env.example` sin secretos, ningún token pasado en los workflows y revisión visual de otras formas de pasar el contexto | Antes de integrar, aunque SC-001 esté Pendiente |
| SC-007 | En un clon limpio y completo propio del SHA base: `check:secrets` con los tres análisis sobre el historial alcanzable desde el commit evaluado, sin hallazgos no justificados; enlaces a los jobs `secrets` del pull request y de la primera ejecución satisfactoria de `main` | Antes de integrar, aunque SC-001 esté Pendiente, y confirmación en `main` |
| SC-008 | Una persona que no ha participado en la implementación, y que si también ejecuta SC-001 lo hace después, identifica trece resultados: cuatro elementos compuestos de capa (ubicación y responsabilidad) y los nueve nombres exactos. Seudónimo no reidentificable. Sin esa persona, queda **Pendiente** y no se integra | Cuando la documentación está completa y, si aplica, después de SC-001 |
| SC-009 | Desde la primera ejecución satisfactoria de los nueve controles en `main`: SHA y hora final, respuesta de la API con los nueve controles requeridos, hora de activación y lista de commits que demuestra que no se integró nada durante ese intervalo. Evidencia y aceptación de los ADR en el primer pull request posterior | Activación inmediatamente después de la primera ejecución satisfactoria; evidencia en el primer pull request posterior |

Si SC-001 o SC-008 están **Pendiente**, el pull request permanece abierto, no se integra y no
comienza la primera funcionalidad de producto. No existe cierre posterior.

## Resolución de problemas

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| `npm ci` rechaza la versión de Node.js | Node.js fuera del rango `>=24.21.0 <25` (por ejemplo, 24.13.0 o 26.x) | Instalar la versión de `.node-version` (24.21.0), obligatoria en la aceptación |
| `npm start` termina con `missing` | `npm start` no carga `.env.development.local` | Es lo esperado: en producción la configuración viene del entorno; para desarrollo, usar `npm run dev` |
| El preflight termina con `NODE_ENV` y `mode_mismatch` | Se ejecutó `scripts/preflight.mjs` a mano con un `NODE_ENV` distinto del modo | Usar solo `npm run dev` o `npm start`, que fijan `NODE_ENV` en los dos procesos |
| El arranque termina con `environment` y `env_load_failed` | Un fichero `.env*` del modo no se puede leer o analizar; por diseño, el mensaje no muestra el fichero ni el error (FR-005) | Revisar los permisos y la sintaxis de los ficheros `.env*` del modo |
| `npm run dev` termina con `missing` o `invalid_value` aunque `.env.development.local` es correcto | La terminal tiene definida la variable, quizá vacía, y prevalece sobre el fichero | Ejecutar `unset AULANORMA_LOG_LEVEL AULANORMA_ENVIRONMENT` y repetir |
| `/api/health` responde `500` sin cuerpo | Fallo propio de la ruta de estado, por ejemplo una configuración que dejó de ser válida con el servidor en marcha | Corregir la configuración y reiniciar `npm run dev` o `npm start`; los cambios de `.env*` siempre exigen reinicio |
| Un cambio de `.env.development.local` no se aplica | La configuración solo se valida al arrancar | Reiniciar `npm run dev` |
| El arranque falla porque la dirección está en uso | Otro proceso usa `127.0.0.1:3000`, por ejemplo otro `npm run dev` | Detener ese proceso; la dirección y el puerto son fijos |
| `/api/health/` u otra variante responde `404` | La frontera solo admite el destino exacto `/api/health` y no redirige | Usar exactamente `/api/health` |
| Alguien sugiere `next dev`, `next start` o `node server.mjs` directo | Eluden la frontera HTTP o el preflight y no son entradas admitidas | Usar solo `npm run dev` o `npm start` |
| La prueba de humo se niega a ejecutarse | Existe `.env`, `.env.local` o `.env.production*` | Eliminarlos o renombrarlos a `.env.development.local` |
| `check:secrets` informa de un fichero que aún no está en Git | Contiene un valor con forma de secreto y no está ignorado | Quitar el valor; si es un secreto real, revocarlo de inmediato (`SECURITY.md`). Añadir una ruta a `.gitignore` solo si el fichero no debe versionarse (configuración local); ese cambio es revisable y tiene impacto de seguridad (FR-003). No es una excepción a FR-020 ni sirve para conservar una credencial expuesta |
| `check:secrets` o `check:workflows` no encuentran la herramienta | Falta `npm run tools:install` | Ejecutarlo; necesita acceso a GitHub |
| `check:deps` falla sin cambios de código | Se ha publicado un aviso nuevo de gravedad alta o crítica | Actualizar la dependencia o registrar una excepción justificada (FR-020) |
