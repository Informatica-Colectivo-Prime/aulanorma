# Aceptación: Base de ingeniería de AulaNorma

**Funcionalidad**: `001-engineering-baseline` | **Plan**: [plan.md](./plan.md) |
**Matriz**: [Matriz de aceptación](./plan.md#matriz-de-aceptación)

Evidencia de los procedimientos manuales de aceptación. Estas verificaciones **no son
controles**: ningún workflow las ejecuta, no se añaden a los controles requeridos y no se
repiten en cada pull request.

## Cabecera

- **SHA base de aceptación**: `f809b03262d9acc68e72f86f9da6807d4256649a`, fijado en T071 el
  2026-10-06. Incorpora la actualización de `source-map-js` descrita en «Transición por el
  aviso de `source-map-js`». Su validación de T071:
  - los nueve controles (`format`, `lint`, `types`, `test`, `build`, `macos-quality`, `secrets`,
    `dependencies` y `workflows`, todos de la aplicación GitHub Actions) concluyeron en success
    en la primera ejecución del evento `pull_request` (intento 1) sobre ese commit;
  - commit analizado por la integración continua: el merge provisional
    `8ed7732b25fb991b2b4cbf8ba64ce8541128777d`, que no es el SHA base. Sus padres son `main`
    en `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544` y el SHA base;
  - ejecuciones: [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/attempts/1)
    y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/attempts/1);
  - resumen de los registros: `test` y `macos-quality`, 840 pruebas superadas de 840; `build`
    y `macos-quality`, "Prueba de humo superada: 21 casos."; `dependencies`, 221 dependencias
    auditadas y ninguna vulnerabilidad alta o crítica sin excepción, con firmas y
    atestaciones verificadas; `secrets`, 0 excepciones vigentes y sin hallazgos;
    `workflows`, sin hallazgos.

  Esa ejecución es el primer intento de la serie de SC-004 sobre el SHA base. La casilla de
  T071 en `tasks.md` se marca en el primer pull request posterior a la activación.
- **Commits entre la base anterior y el SHA base**: `4b142285451e259146b7dc88ccb4559274fea83d`
  (solo este fichero, con la evidencia obtenida sobre `28c58da`),
  `bd740016c10a301760efef51ee7325d6c2f51ef4` (solo `package-lock.json`) y el SHA base (solo
  este fichero, con la transición). `git diff --name-only 28c58da f809b03` lista únicamente
  `package-lock.json` y este fichero.
- **Base anterior**: `28c58da1bcbf11df33fae5e26b77e1a8f9ea3966`, fijada en T071 el 2026-10-05
  y sustituida por un cambio de dependencias. Es el commit que incorpora el cambio de alcance
  del 2026-10-04 (SC-001 y SC-008 como validaciones empíricas aplazadas). Su validación de
  T071:
  - los nueve controles (`format`, `lint`, `types`, `test`, `build`, `macos-quality`, `secrets`,
    `dependencies` y `workflows`, todos de la aplicación GitHub Actions) concluyeron en success
    en la primera ejecución del evento `pull_request` (intento 1) sobre ese commit;
  - merge provisional analizado por la integración continua:
    `199d312b49852a98f67bf4e2ad55968aee184d99`, que no es el SHA base;
  - `main` utilizado: `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544`;
  - ejecuciones: [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/attempts/1)
    y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/attempts/1).

  Esa ejecución es el primer intento de la serie de SC-004 sobre `28c58da`. La casilla
  de T071 en `tasks.md` seguía entonces sin marcar.
- **Base de las mediciones conservadas**: `1fd6da9b8e6b02405987025507443d468192bada`. Fue el SHA
  base hasta el cambio de alcance y es el commit sobre el que se obtuvo la evidencia técnica
  local anterior a ese cambio. Su validación de T071:
  - los nueve controles concluyeron en success en la primera ejecución del evento
    `pull_request` (intento 1) sobre ese commit;
  - merge provisional analizado por la integración continua:
    `98649f0771e3b6b996f4965b9d8ae3b5a7087e38`, que no es ese SHA;
  - `main` utilizado: `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544`;
  - ejecuciones: [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387)
    y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381).

  Esa ejecución fue el primer intento de la serie de SC-004 registrada en T079 sobre
  `1fd6da9`. La casilla de T071 en `tasks.md` seguía entonces sin marcar.
- **Reutilización de la evidencia de `1fd6da9` en `28c58da`** (transición del 2026-10-04,
  sustituida por la del 2026-10-06 en lo que esta indica). El cambio de alcance modifica solo
  documentación normativa y de procedimiento. Las únicas rutas que cambian son, todas bajo
  `specs/001-engineering-baseline/` salvo la última: `spec.md`, `plan.md`, `tasks.md`,
  `quickstart.md`, `checklists/requirements.md`, `checklists/ci-acceptance.md`, este fichero
  y `docs/engineering/branch-protection.md`. No cambia código, pruebas, scripts, dependencias,
  workflows, configuración, `README.md` ni el resto de `docs/engineering/`. Es verificable con
  `git diff --name-only 1fd6da9 28c58da`, que lista únicamente esas ocho rutas.
  Según la regla de la base ("cualquier otro cambio crea una nueva base y obliga a repetir lo
  afectado"):
  - **se conserva**, con su SHA original, la evidencia de SC-002, SC-005, FR-006 C6 y FR-009,
    la evidencia local de SC-006, y la de SC-003 en macOS y en la integración continua. Ninguno
    de los ficheros que esas mediciones ejecutan o revisan cambia. Para los pull requests
    negativos, el plan solo exige repetir aquellos cuyas alteraciones o controles resulten
    afectados, y no hay ninguno;
  - **se repite sobre la nueva base**: T071 (primera ejecución de los nueve controles) y la
    serie de tres intentos de SC-004, de la que dependen los enlaces de SC-006, ambas
    repetidas el 2026-10-05 sobre `28c58da`; y la parte local de SC-007, repetida ese mismo
    día sobre `28c58da` porque el historial alcanzable cambia;
  - **se ejecuta por primera vez sobre la nueva base**: la parte local de SC-003 en Linux x64
    nativo.
- **Transición por el aviso de `source-map-js`** (2026-10-06).
  - **Aviso**: GHSA-68fv-2mgg-jv7q (CVE-2026-93749), denegación de servicio en
    `source-map-js`. Según la GitHub Advisory Database, consultada el 2026-10-06: aviso
    revisado y no retirado, gravedad alta, con puntuaciones CVSS 3.1 de 7,5 y CVSS 4.0 de 8,7
    publicadas por esa misma base de datos; versiones afectadas `>= 1.0.0, < 1.2.2`; primera
    versión corregida, 1.2.2; publicado el 2026-09-18 y revisado por GitHub el
    2026-10-05T23:31:22Z, después de las ejecuciones en verde del control `dependencies`
    sobre `28c58da` (2026-10-05, entre las 06:59 y las 07:06 UTC).
  - **Dónde se observó**: en el intento 2 de la parte local de SC-003 en Linux, donde
    `check:deps` falló por este aviso (dato del mantenedor). Después del aviso no se ha
    ejecutado `check:deps` sobre `28c58da` en macOS ni en la integración continua.
  - **Alcance en el lockfile de `28c58da`**: una única copia, `source-map-js` 1.2.1, que
    comparten dos cadenas: `next` 16.3.6 → `postcss` 8.5.23 y `vite` 8.3.1 → `postcss`
    8.5.28. Las dos piden `^1.2.1`, que admite 1.2.2.
  - **Cambio**: solo `package-lock.json`, y en él solo la entrada de `source-map-js`
    (versión, URL e integridad), de 1.2.1 a 1.2.2. No cambian `package.json`, `next`, `vite`
    ni `postcss`. Sin `npm audit fix`, excepciones ni supresiones.
  - **Validación de la candidata** (2026-10-06, macOS arm64 de referencia, Node.js 24.21.0 y
    npm 11.19.0, con caché, registros y `TMPDIR` aislados): en un clon nuevo de `28c58da` con
    ese único cambio sin confirmar, `npm ci`, `npm run tools:install`, `npm run check:deps` y
    `npm run check` terminaron con código 0, cada uno ejecutado una vez. `check:deps` informó
    221 dependencias auditadas y ninguna vulnerabilidad alta o crítica; el agregado, 840
    pruebas superadas y la prueba de humo con 21 casos. No se ejecutó
    `npm run verify:negative`. Es la validación previa de una candidata, sobre un árbol sin
    commit: **no es evidencia de aceptación** de ningún criterio.
  - **Regla aplicada**: un cambio de dependencias crea una nueva base y obliga a repetir lo
    afectado. Entre `28c58da` y el SHA base solo cambian `package-lock.json` y este fichero.
  - **En la evidencia conservada**, «SHA base» designa la base vigente cuando se obtuvo cada
    resultado, identificada siempre por su hash. Ningún resultado anterior cambia de SHA ni
    de fecha.
  - **Se repite sobre la nueva base**. Todo lo que sigue se completó el 2026-10-06 sobre
    `f809b03`; el resultado y la procedencia de cada medición están en su apartado:
    - T071 y la serie de tres intentos completos de SC-004;
    - SC-002, SC-005, y FR-006 C6 y FR-009, porque ejecutan las dependencias instaladas y
      las dos cadenas afectadas pasan por `next` y por `vite`. SC-002 y FR-006 C6/FR-009 se
      midieron en un mismo clon; SC-005, con cinco ejecuciones con red y cinco sin red,
      estas últimas lanzadas por el mantenedor;
    - la parte local de SC-003 en macOS y en Linux x64. La de Linux no llegó a completarse
      sobre `28c58da` (dos intentos fallidos) y se completó en el tercer intento, en el
      contenedor aceptado como desviación, con datos comunicados por el operador;
    - la parte local de SC-007, porque el historial alcanzable cambia;
    - en la integración continua de SC-003, los pull requests negativos de `dependencies`,
      `test`, `build` y `types` (#15 a #18). El de `dependencies` altera el propio lockfile; los de
      `test` y `build` tienen como control objetivo Vitest y `next build`, que cargan las
      cadenas afectadas; el de `types` se repite por decisión del mantenedor (2026-10-06),
      porque sus dos fallos colaterales registrados son `build` y `test`, aunque su
      alteración y su control objetivo (TypeScript) no estén afectados.
  - **Se reutiliza**:
    - la comprobación local de SC-006, hecha sobre `1fd6da9`: revisa `quality.yml`,
      `security.yml` y `.env.example`, que son idénticos en `1fd6da9`, en `28c58da` y en la
      candidata, y no ejecuta dependencias. Sus enlaces a la serie de SC-004 son nuevos y
      se añadieron el 2026-10-06;
    - en la integración continua de SC-003, los pull requests negativos de `format`, `lint`,
      `secrets` y `workflows` (#7, #8, #12 y #14), sobre `1fd6da9`. Sus alteraciones tocan
      un fichero de código, un fichero de módulo, un fichero de texto y un workflow, ninguno
      de los cuales cambia; y sus controles objetivo (Prettier, ESLint, Gitleaks y zizmor) no
      cargan `source-map-js`, que en el lockfile solo llega por `next` y por `vite`. El
      colateral previsto de `format` es `lint`, tampoco afectado. En `format` y `lint`,
      `macos-quality` se detiene antes de las pruebas y de la compilación.
  - **Límite de los pull requests reutilizados**: conservan su SHA original y acreditan lo
    que midieron sobre `1fd6da9`. Su columna «controles no afectados en verde» incluye
    `test`, `build` y `dependencies`, y en `secrets` y `workflows` también `macos-quality`,
    ejecutados con el lockfile anterior; esa parte no se traslada a la nueva base. La serie
    de SC-004 ejecuta los nueve controles sobre la nueva base sin ninguna alteración: no es
    una ejecución de esos pull requests negativos ni sustituye su evidencia.
  - **Sin cambios**: la decisión de alcance sobre SC-001 y SC-008, que siguen aplazadas y
    sin evidencia, y la desviación aceptada del contenedor para SC-003 en Linux.
- **Base histórica**: `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216`, sustituida por un cambio de
  código. Su evidencia se
  conserva en [Evidencia histórica](#evidencia-histórica-sobre-3101bd5-base-sustituida) y no
  acredita la nueva base.
- **HEAD de evidencia previa a integrar**: `2d8c7f5cd018fb6a895b2832b1c6b9d841f63157`, último
  commit del pull request de la funcionalidad (#3) y posterior al SHA base. Entre el SHA base
  y él solo cambia este fichero. Sus nueve controles terminaron en success en la primera
  ejecución; el detalle consta en la descripción de ese pull request.
- **Integración en `main`**: `5ca3b16c10f0df943453f8e696cd521642608213`, el squash del pull request
  #3 (2026-10-06T20:44:11Z), con padre único `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544`. Su
  árbol es idéntico al del HEAD de evidencia previa a integrar
  (`969e2bcee9475458da0742fb442976e83cb56fc6`), así que contiene exactamente el contenido
  evaluado más la evidencia. Es un commit distinto del SHA base y del HEAD de evidencia: las
  mediciones no se reasignan a él, y solo le corresponden las ejecuciones de `main`
  registradas en SC-004, SC-007 y SC-009.
- **Registro posterior a la integración**: la evidencia de `main` de SC-004, SC-007 y SC-009 se
  añade en el primer pull request posterior a la activación de los controles requeridos. Los
  commits de ese pull request son posteriores a la integración; no son la base de aceptación
  ni el HEAD de evidencia previa a integrar, y su identificador no consta en este fichero.
- **Versión de Node.js**: 24.21.0 en todas las mediciones locales.
- **Entorno de referencia**: macOS arm64 descrito en
  [`docs/engineering/reference-environment.md`](../../docs/engineering/reference-environment.md).
  Linux de aceptación: x64.

**SHA base y HEAD de evidencia**:

- **SHA base de aceptación**: código, dependencias, workflows y documentación de procedimiento
  evaluados. Cada procedimiento local usa su propio clon completo, limpio y fijado a ese SHA;
  no se clona una rama mutable.
- **HEAD de evidencia**: puede añadir solamente este fichero, `acceptance.md`. Ese commit no
  obliga a repetir mediciones, pero vuelve a ejecutar los controles automáticos. Cualquier otro
  cambio crea una nueva base y obliga a repetir lo afectado.

## Reglas comunes

- **Estados**: **Superado**, **No superado** o **Pendiente**.
- **SC-001 y SC-008** son validaciones empíricas aplazadas, fuera de la aceptación obligatoria
  de esta entrega (spec.md, aclaración del 2026-10-04). Quedan Pendiente y sin evidencia, no se
  dan por superadas y no bloquean la integración. No las sustituyen el mantenedor ni un agente.
- **Política de las validaciones aplazadas** (spec.md, FR-026): no tienen plazo obligatorio en
  esta entrega y se ejecutan cuando exista un participante que cumpla sus condiciones. Hasta
  obtener un resultado satisfactorio no puede afirmarse que la incorporación o la comprensión
  por terceros estén validadas. Un resultado No superado se registra tal cual y da lugar a
  correcciones mediante pull requests normales. No borra ni invalida por sí solo las
  comprobaciones técnicas anteriores; si revela un defecto que afecta a otro criterio
  obligatorio, ese criterio se revisa y su corrección se valida. No restablece automáticamente
  el bloqueo de integración.
- **Aceptación obligatoria antes de integrar**: SC-002, SC-003, la parte de pull request de
  SC-004, SC-005, SC-006 y la parte local de SC-007.
- **Evidencia**: fechas, commits, enlaces y cifras. Los enlaces a GitHub son admisibles.
- **Nunca** se registran secretos, valores de tokens (tampoco sintéticos), nombres de personas,
  rutas locales ni salidas sin redactar.
- **Personas externas**: se identifican con un seudónimo no reidentificable.
- **Misma persona para SC-001 y SC-008**: solo en este orden, primero SC-001 y después SC-008.
- **Evidencia histórica**: los resultados obtenidos sobre una base sustituida se conservan,
  pero no cuentan para ningún estado activo. Cada criterio se acredita de nuevo sobre el SHA
  base vigente.

---

## SC-001 Arranque desde un clon limpio

**Estado**: Pendiente

**Entorno**: macOS arm64 de referencia y Linux x64, ambas con Node.js 24.21.0.
**Alcance**: validación empírica aplazada, fuera de la aceptación obligatoria de esta entrega.
**Momento**: cuando exista una persona externa, sobre el SHA base vigente. Hasta entonces
SC-001 queda Pendiente y sin evidencia, y no bloquea la integración.

**Superado** solo cuando esa persona completa el recorrido en macOS en menos de 30 minutos,
Linux x64 termina con éxito, ambos sin desviaciones, y la evidencia queda registrada.

**Comprobación no realizada** (decisión del mantenedor, 2026-10-04):

- No hay participante externo disponible para T078. El recorrido no se ha realizado, ni en
  macOS ni en Linux x64.
- El mantenedor ha decidido continuar la entrega sin esta comprobación y aplazarla. Esa
  decisión no equivale a que el criterio esté superado: SC-001 sigue Pendiente.
- **No existe evidencia empírica** de que una persona sin conocimiento previo consiga poner en
  marcha el proyecto siguiendo la documentación, ni del tiempo que tardaría.
- Ni el autor ni un agente se han usado como sustitutos del participante. Los campos siguientes
  quedan vacíos: no se registran resultados, tiempos ni salidas que no se han obtenido.

### macOS arm64

- Fecha:
- SHA fijado:
- Sistema operativo y arquitectura:
- `node --version` y `npm --version`:
- Seudónimo no reidentificable del ejecutor:
- Confirmación de que al comenzar el primer recorrido no tenía conocimiento previo ni recibió
  ayuda:
- Hora de inicio:
- Hora de fin:
- Duración:
- Salida de `curl` redactada:
- Desviaciones respecto a la documentación:

### Linux x64

- Fecha:
- SHA fijado:
- Sistema operativo y arquitectura:
- `node --version` y `npm --version`:
- Seudónimo no reidentificable del ejecutor:
- Confirmación de que al comenzar el primer recorrido no tenía conocimiento previo ni recibió
  ayuda:
- Hora de inicio:
- Hora de fin:
- Duración:
- Salida de `curl` redactada:
- Desviaciones respecto a la documentación:

---

## SC-002 Comandos de calidad locales

**Estado**: Superado

> **Transición del 2026-10-06** (ver la cabecera): repetido sobre el SHA base `f809b03` el
> 2026-10-06 (T073). La medición anterior, sobre `1fd6da9`, se conserva al final del apartado
> y no acredita la base vigente.

**Entorno**: macOS arm64 de referencia con Node.js 24.21.0.
**Momento**: antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente.

**Superado** si todos terminan con código 0 y el agregado tarda menos de 10 minutos.

- SHA: `f809b03262d9acc68e72f86f9da6807d4256649a` (SHA base). Ejecución del 2026-10-06 en el
  macOS arm64 de referencia (Apple M3, 8 núcleos, 16 GB, nativo), con macOS 27.0.1 (26A434).
  `reference-environment.md` describe macOS 27.0 (26A428); el equipo y el resto de versiones
  coinciden. Es una ejecución de aceptación nueva: no se reutiliza la validación previa de la
  candidata descrita en la cabecera, hecha sobre un árbol sin commit.
- Confirmación de clon completo: clon nuevo del repositorio remoto, sin `--depth`, filtros
  parciales ni alternates, fijado al SHA base, con `--is-shallow-repository` en `false` y
  `git status --porcelain` vacío antes y después. Sin `node_modules`, `.next` ni `.tools`
  previos; caché de npm nueva y vacía, y registros de npm y `TMPDIR` aislados fuera del clon.
- `node --version`: `v24.21.0` (npm 11.19.0).
- Código de salida de la preparación (`npm ci` y `npm run tools:install`): 0 y 0 (3 s y 2 s).
  Configuración de ejemplo copiada a `.env.development.local` (quickstart, paso 2), sin
  diferencias con `.env.example`.

Cada comando se ejecutó una sola vez, con la salida y el código capturados sin tuberías. Los
tiempos de los ocho comandos son segundos enteros de reloj; no forman parte del criterio.

| Comando | Código de salida | Tiempo |
|---------|------------------|--------|
| `npm run check:format` | 0 | 1 s |
| `npm run check:lint` | 0 | 3 s |
| `npm run check:types` | 0 | 2 s |
| `npm run check:test` | 0 | 13 s |
| `npm run check:build` | 0 | 16 s |
| `npm run check:secrets` | 0 | 1 s |
| `npm run check:deps` | 0 | 4 s |
| `npm run check:workflows` | 0 | menos de 1 s |
| `npm run check` (agregado) | 0 | 39,776 s |

- Tiempo real (`real`) de `time npm run check`: 39,776 s, menos de 10 minutos. La medición es
  la de `time` de zsh, que lo informa como `total` (42,20 s de usuario y 13,81 s de sistema).
- Resumen de su salida, leído de la salida del agregado: formato correcto; lint sin errores ni
  avisos; tipos generados y `tsc` sin errores; Vitest con 18 de 18 ficheros y 840 de 840
  pruebas superadas; compilación correcta y "Prueba de humo superada: 21 casos.", sin ninguna
  línea `ERR`; secretos sin hallazgos en historial, índice y árbol de trabajo, con 0
  excepciones vigentes; 221 dependencias auditadas, 0 vulnerabilidades altas o críticas sin
  excepción, ninguna media ni baja, firmas y atestaciones verificadas; 2 workflows analizados
  sin hallazgos. Sin líneas `npm warn`, `npm error`, `⚠` ni `⨯` en ninguna de las salidas
  capturadas, incluidas las de la preparación. La compilación de `check:build` partió sin
  `.next` (compilación inicial de 993 ms) y el agregado reutilizó esa compilación (71 ms),
  como establece el procedimiento.
- Al terminar, HEAD seguía en el SHA base, el clon estaba limpio y el puerto 3000, libre.

### Medición anterior sobre `1fd6da9`

Se conserva como evidencia de esa base; no acredita la vigente.

- SHA: `1fd6da9b8e6b02405987025507443d468192bada` (entonces SHA base). Ejecución del 2026-10-04 en el
  macOS arm64 de referencia (Apple M3, 8 núcleos, 16 GB, nativo), con macOS 27.0.1 (26A434).
  `reference-environment.md` describe macOS 27.0 (26A428); el equipo y el resto de versiones
  coinciden.
- Confirmación de clon completo: clon nuevo del repositorio, sin `--depth`, filtros parciales ni
  alternates, fijado al SHA base, con `--is-shallow-repository` en `false` y
  `git status --porcelain` vacío antes y después. Sin `node_modules`, `.next` ni `.tools`
  previos; caché, registros de npm y `TMPDIR` aislados fuera del clon.
- `node --version`: `v24.21.0` (npm 11.19.0).
- Código de salida de la preparación (`npm ci` y `npm run tools:install`): 0 y 0 (Gitleaks 8.30.1
  y zizmor 1.30.1 instalados y verificados). Configuración de ejemplo copiada a
  `.env.development.local` (quickstart, paso 2).

Cada comando se ejecutó una sola vez, con la salida y el código capturados sin tuberías.

| Comando | Código de salida |
|---------|------------------|
| `npm run check:format` | 0 |
| `npm run check:lint` | 0 |
| `npm run check:types` | 0 |
| `npm run check:test` | 0 |
| `npm run check:build` | 0 |
| `npm run check:secrets` | 0 |
| `npm run check:deps` | 0 |
| `npm run check:workflows` | 0 |
| `npm run check` (agregado) | 0 |

- Tiempo real (`real`) de `time npm run check`: 38,768 s. La medición es la de `time` de zsh,
  que lo informa como `total` (42,26 s de usuario y 13,95 s de sistema).
- Resumen de su salida: formato correcto; lint sin errores ni avisos; tipos generados y `tsc`
  sin errores; Vitest con 18 de 18 ficheros y 840 de 840 pruebas superadas; compilación correcta
  y "Prueba de humo superada: 21 casos."; secretos sin hallazgos en historial, índice y árbol de
  trabajo, con 0 excepciones vigentes; 221 dependencias auditadas, 0 vulnerabilidades altas o
  críticas sin excepción, ninguna media ni baja, firmas y atestaciones verificadas; 2 workflows
  analizados sin hallazgos. Sin líneas `npm warn`, `npm error`, `⚠` ni `⨯` en ninguna de las
  salidas capturadas. La compilación de `check:build` partió sin `.next` (compilación inicial
  de 1034 ms) y el agregado reutilizó esa compilación (70 ms), como establece el procedimiento.

---

## SC-003 Pruebas negativas

**Estado**: Superado

> **Transición del 2026-10-06** (ver la cabecera): la evidencia de este apartado se obtuvo sobre
> una base anterior, identificada en cada entrada por su hash, y se conserva. No acredita la
> base vigente, `f809b03`. Sobre ella se completaron el 2026-10-06 la parte local en macOS y
> en Linux x64 (T075) y los pull requests negativos de `types`, `test`, `build` y
> `dependencies` (T077). Los de `format`, `lint`, `secrets` y `workflows` se reutilizan con
> su SHA original, `1fd6da9`: no se han ejecutado sobre la base vigente.

**Entorno**: local en el macOS arm64 de referencia y en Linux x64, ambos con Node.js 24.21.0.
Integración continua: los runners de los workflows.
**Momento**: antes de integrar, cuando los workflows ya se ejecutan en el pull request de la
funcionalidad; las ramas negativas parten del SHA base.

Cada categoría debe fallar por la causa esperada y en la ubicación esperada. El subcaso de
secretos en un fichero ignorado es una prueba de exclusión positiva, no una novena prueba
negativa. En la integración continua, los controles no afectados deben pasar.

### Local en macOS

- SHA: `f809b03262d9acc68e72f86f9da6807d4256649a` (SHA base). Ejecución del 2026-10-06 en el
  macOS arm64 de referencia (macOS 27.0.1, 26A434, arm64 nativo), con Node.js `v24.21.0` y
  npm 11.19.0.
  - Clon nuevo del repositorio remoto, distinto del de SC-002, completo
    (`--is-shallow-repository` en `false`) y limpio, sin `--depth`, filtros parciales ni
    alternates.
  - Caché, registros de npm y `TMPDIR` aislados fuera del clon.
  - Preparación: `npm ci` con código 0 y `npm run tools:install` con código 0 (Gitleaks 8.30.1
    y zizmor 1.30.1 verificados); configuración de ejemplo copiada a `.env.development.local`.
  - `npm run verify:negative` se ejecutó una sola vez.
- Salida de `npm run verify:negative` con las ocho categorías, causa y ubicación de cada fallo:

| Categoría | Resultado | Causa | Ubicación | Fallos colaterales |
|-----------|-----------|-------|-----------|--------------------|
| `format` | Falla por la causa esperada | Prettier: `Code style issues found` | `src/platform/version/index.ts` | Ninguno |
| `lint` | Falla por la causa esperada | ESLint: `no-restricted-imports` (`normative-source` importa `@/modules/moodle-publication`) | `src/modules/normative-source/violation.ts:1:1` | Ninguno |
| `types` | Falla por la causa esperada | TypeScript: `TS2322` | `src/platform/version/index.ts:21:14` | Ninguno |
| `test` | Falla por la causa esperada | Vitest: `AssertionError: expected 1 to be 2` | `tests/unit/negative.test.ts > prueba negativa sintética` | Ninguno |
| `build` | Falla por la causa esperada | `next build`: `Error occurred prerendering page "/negative-build"`, con la excepción de su `getStaticProps` | `src/pages/negative-build.tsx` (ruta `/negative-build`) | Ninguno |
| `secrets` (a), historial | Falla por la causa esperada | Gitleaks: regla `github-pat` en el historial alcanzable | `negative-secret.txt:1` (commit de la copia) | Ninguno |
| `secrets` (b), fichero nuevo sin seguimiento | Falla por la causa esperada | Gitleaks: regla `github-pat` en el árbol de trabajo | `negative-secret.txt:1` (sin seguimiento) | Ninguno |
| `secrets` (c), fichero ignorado | Termina con éxito, como se esperaba | Exclusión positiva: el fichero ignorado no se examina | `.env.development.local` (ignorado por `.gitignore`) | Ninguno |
| `dependencies` | Falla por la causa esperada | `npm audit`: gravedad alta sin excepción (GHSA-35jh-r3h4-6jhm y GHSA-r5fr-rjxr-66jc) | Paquete `lodash` 4.17.20, solo en el lockfile de la copia | Ninguno |
| `workflows` | Falla por la causa esperada | zizmor: `template-injection`, gravedad High | `.github/workflows/negative-test.yml:12` | Ninguno |

  Las alteraciones se aplicaron solo en las copias temporales del procedimiento y los tokens
  fueron sintéticos; su valor no aparece en la salida. La columna de fallos colaterales es la
  que informa el propio procedimiento, que en local ejecuta solo el control de cada categoría.
- Subcaso de exclusión positiva: (c) `check:secrets` termina con éxito porque
  `.env.development.local` está ignorado y no se examina. No es una novena prueba negativa.
- Código de salida: 0, con el mensaje "verify:negative: todas las categorías se comportan como
  se esperaba." (66 s).
- Estado de Git idéntico antes y después (`git status --porcelain` y `git rev-parse HEAD`): sí.
  - `git rev-parse HEAD` devolvió `f809b03262d9acc68e72f86f9da6807d4256649a` antes y después.
  - `git status --porcelain` estaba vacío antes y después.
  - El propio procedimiento informó "Repositorio original sin cambios: HEAD, git status y rutas
    ignoradas".
  - Al terminar no quedaron procesos y el puerto 3000 estaba libre.

Parte local en macOS completada sobre el SHA base `f809b03` (T075, 2026-10-06). La parte
local en Linux x64, requisito de la aceptación obligatoria e independiente del aplazamiento
de SC-001 y SC-008, se completó el mismo día (ver abajo), igual que los cuatro pull requests
negativos repetidos.

#### Medición anterior en macOS sobre `1fd6da9`

Se conserva como evidencia de esa base; no acredita la vigente.

- SHA: `1fd6da9b8e6b02405987025507443d468192bada` (entonces SHA base). Ejecución del 2026-10-04 en el
  macOS arm64 de referencia (macOS 27.0.1, 26A434, arm64 nativo), con Node.js `v24.21.0` y
  npm 11.19.0.
  - Clon nuevo, completo (`--is-shallow-repository` en `false`) y limpio, sin `--depth`,
    filtros parciales ni alternates.
  - Caché, registros de npm y `TMPDIR` aislados fuera del clon.
  - Preparación: `npm ci` con código 0 y `npm run tools:install` con código 0 (Gitleaks 8.30.1
    y zizmor 1.30.1 verificados); configuración de ejemplo copiada a `.env.development.local`.
  - `npm run verify:negative` se ejecutó una sola vez.
- Salida de `npm run verify:negative` con las ocho categorías, causa y ubicación de cada fallo:

| Categoría | Resultado | Causa | Ubicación | Fallos colaterales |
|-----------|-----------|-------|-----------|--------------------|
| `format` | Falla por la causa esperada | Prettier: `Code style issues found` | `src/platform/version/index.ts` | Ninguno |
| `lint` | Falla por la causa esperada | ESLint: `no-restricted-imports` (`normative-source` importa `@/modules/moodle-publication`) | `src/modules/normative-source/violation.ts:1:1` | Ninguno |
| `types` | Falla por la causa esperada | TypeScript: `TS2322` | `src/platform/version/index.ts:21:14` | Ninguno |
| `test` | Falla por la causa esperada | Vitest: `AssertionError: expected 1 to be 2` | `tests/unit/negative.test.ts > prueba negativa sintética` | Ninguno |
| `build` | Falla por la causa esperada | `next build`: `Error occurred prerendering page "/negative-build"`, con la excepción de su `getStaticProps` | `src/pages/negative-build.tsx` (ruta `/negative-build`) | Ninguno |
| `secrets` (a), historial | Falla por la causa esperada | Gitleaks: regla `github-pat` en el historial alcanzable | `negative-secret.txt:1` (commit de la copia) | Ninguno |
| `secrets` (b), fichero nuevo sin seguimiento | Falla por la causa esperada | Gitleaks: regla `github-pat` en el árbol de trabajo | `negative-secret.txt:1` (sin seguimiento) | Ninguno |
| `secrets` (c), fichero ignorado | Termina con éxito, como se esperaba | Exclusión positiva: el fichero ignorado no se examina | `.env.development.local` (ignorado por `.gitignore`) | Ninguno |
| `dependencies` | Falla por la causa esperada | `npm audit`: gravedad alta sin excepción (GHSA-35jh-r3h4-6jhm y GHSA-r5fr-rjxr-66jc) | Paquete `lodash` 4.17.20, solo en el lockfile de la copia | Ninguno |
| `workflows` | Falla por la causa esperada | zizmor: `template-injection`, gravedad High | `.github/workflows/negative-test.yml:12` | Ninguno |

  Las alteraciones se aplicaron solo en las copias temporales del procedimiento y los tokens
  fueron sintéticos; su valor no aparece en la salida.
- Subcaso de exclusión positiva: (c) `check:secrets` termina con éxito porque
  `.env.development.local` está ignorado y no se examina. No es una novena prueba negativa.
- Código de salida: 0, con el mensaje "verify:negative: todas las categorías se comportan como
  se esperaba." (66 s).
- Estado de Git idéntico antes y después (`git status --porcelain` y `git rev-parse HEAD`): sí.
  - `git rev-parse HEAD` devolvió `1fd6da9b8e6b02405987025507443d468192bada` antes y después.
  - `git status --porcelain` estaba vacío antes y después.
  - El propio procedimiento informó "Repositorio original sin cambios: HEAD, git status y rutas
    ignoradas".
  - Al terminar no quedaron procesos y el puerto 3000 estaba libre.

### Local en Linux x64

**Entorno y desviación aceptada** (decisión del mantenedor, 2026-10-05). Esta parte se ejecuta
en un contenedor Linux x64, no en una máquina ni en una máquina virtual:

- **Desviación**: el paso 8 de `quickstart.md` y de `README.md` pide «una máquina o máquina
  virtual Linux x64». Un contenedor no es literalmente ninguna de las dos, y ningún artefacto
  menciona los contenedores para admitirlos ni para excluirlos. El mantenedor acepta el
  contenedor como entorno de T075 para esta entrega. Los requisitos no cambian: `spec.md`
  (FR-001), `plan.md` y `tasks.md` exigen «Linux x64» y siguen igual.
- **Servidor**: Linux x86_64, kernel 5.4.0-216-generic, con Docker Engine 28.1.1.
- **Contenedor**: Ubuntu 24.04.5 LTS; `uname` devuelve x86_64. Límites configurados: 2 CPU y
  6 GiB de memoria. Sin puertos publicados ni carpetas del servidor montadas. Las herramientas
  se instalan solo dentro del contenedor.
- **Arquitectura**: x86_64 en el servidor y en el contenedor, sin emulación de arquitectura.
  Los binarios x64 se ejecutan sobre el kernel del servidor, que el contenedor comparte.
- **Qué no es**: no es una máquina virtual, porque no tiene kernel propio, ni una ejecución
  directa sobre el servidor, porque el sistema de usuario es el de la imagen del contenedor.
  «Nativo» se refiere aquí solo a la arquitectura.
- **Procedencia de los datos**: los facilitó el mantenedor antes de la ejecución. Los que el
  procedimiento observe dentro del contenedor se registran abajo con el resto de la evidencia.
- Los dos primeros intentos fallaron y el tercero se completó (ver abajo).

**Intento 1: fallido, sin completar** (comunicado por el mantenedor el 2026-10-05; datos
facilitados por él, no observados de forma independiente). Sobre el SHA base
`28c58da1bcbf11df33fae5e26b77e1a8f9ea3966`, en el contenedor descrito arriba, arrancado sin
`--init` y con `sleep` como proceso inicial (PID 1).

- `npm run check` terminó con código 1. `npm run verify:negative` no se ejecutó.
- Dentro de `npm run check`: 840 pruebas superadas y compilación correcta. Todos los casos
  funcionales de la prueba de humo terminaron en `ok`.
- La limpieza final de la prueba de humo informó dos errores: "ERR quedaban 8 grupos de procesos
  vivos" y "ERR siguen vivos 8 grupos de procesos". Son el único fallo comunicado.
- Observaciones con `docker top`: durante la espera mostraba el arnés y sus procesos de npm,
  sin servidores hijos visibles; al terminar, solo `sleep`, sin procesos zombi visibles.
- **Causa: no determinada.** El arnés considera vivo un grupo mientras
  `kill(-pid, 0)` no falle con un error distinto de `EPERM`, de modo que no distingue un
  proceso activo de uno zombi ni de una falta de permisos. La hipótesis de procesos zombi
  no recogidos por el PID 1 no está confirmada ni descartada.
- El intento no acredita ninguna parte de SC-003 en Linux. No se ha repetido ni corregido
  nada: ni código, ni requisitos, ni entorno.

**Intento 2: fallido, sin completar** (comunicado por el mantenedor el 2026-10-06; datos
facilitados por él, no observados de forma independiente). Sobre el mismo SHA base, en un
segundo contenedor con las mismas características, arrancado esta vez con `--init`, de modo
que el PID 1 es `docker-init`. Es un cambio de entorno respecto al intento 1.

- `npm run check` terminó con código 1. `npm run verify:negative` no se ejecutó.
- Dentro de `npm run check`: 840 pruebas superadas, compilación correcta y prueba de humo
  superada con 21 casos, sin los errores de grupos de procesos del intento 1.
- `check:secrets`: sin hallazgos.
- `check:deps`: **falla**. `npm audit` informa una vulnerabilidad de gravedad alta sin
  excepción en el paquete `source-map-js`, aviso GHSA-68fv-2mgg-jv7q.
- Al terminar, el puerto 3000 del contenedor estaba libre.
- El fallo no depende de Linux ni del contenedor: `check:deps` consulta los avisos publicados
  para las versiones del lockfile, que es el mismo en todos los entornos. El aviso es
  posterior a las ejecuciones en verde de este control sobre la base.
- El intento no acredita ninguna parte de SC-003 en Linux. Que el humo terminara sin los
  errores del intento 1 es compatible con la hipótesis de procesos no recogidos por el PID 1,
  pero un solo intento no la confirma.

**Intento 3: completado** (2026-10-06, sobre el SHA base). Los dos intentos anteriores se
conservan y no se reutilizan.

**Procedencia**: todos los datos de este intento proceden del resumen de salida que facilitó
el operador (el mantenedor), que ejecutó el procedimiento en el contenedor. No se han
observado de forma independiente ni el servidor ni el contenedor, y no se ha repetido nada.
No se registran tiempos, porque el resumen facilitado no los incluye.

- SHA: `f809b03262d9acc68e72f86f9da6807d4256649a` (SHA base).
- Entorno: contenedor `aulanorma-t075-28c58da-init` (el nombre conserva el hash de la base
  anterior; el clon se fijó al SHA base), con `Init=true` y `docker-init` como PID 1.
  Ubuntu 24.04.5 LTS, x86_64, sobre el kernel compartido del servidor, 5.4.0-216-generic.
  Mismos límites de 2 CPU y 6 GiB, sin puertos publicados ni carpetas montadas. Node.js
  24.21.0, npm 11.19.0 y Git 2.43.0. Sigue aplicándose la desviación aceptada: es un
  contenedor, no una máquina virtual ni una ejecución directa sobre el servidor.
- Instalación: clon y `git checkout` del SHA base, código 0; `npm ci`, código 0;
  `npm run tools:install`, código 0.
- Configuración aplicada: copia de `.env.example` a `.env.development.local`, código 0, y
  `diff` entre ambos, código 0 (sin diferencias).
- Arranque: `npm run dev` en el contenedor, con el servicio atendiendo la consulta de estado.
- Respuesta de estado: HTTP 200 y cuerpo exacto `{"status":"ok","version":"0.1.0"}`.
- Resultado de los controles aplicables: `npm run check`, código 0.
  - Pruebas: 18 ficheros y 840 pruebas superadas.
  - Prueba de humo: 21 casos superados, sin los errores de grupos de procesos del intento 1.
  - Secretos: 0 excepciones vigentes.
  - Dependencias: 221 auditadas, 0 vulnerabilidades altas o críticas sin excepción y firmas
    verificadas.
  - Workflows: 2 analizados, sin hallazgos.
- Salida de `npm run verify:negative` con las ocho categorías, causa y ubicación de cada fallo:
  datos del resumen original de la ejecución en el contenedor, comunicados por el operador.

| Categoría | Resultado | Causa | Ubicación | Fallos colaterales |
|-----------|-----------|-------|-----------|--------------------|
| `format` | Falla, como se esperaba | Prettier: `Code style issues found` | `src/platform/version/index.ts` | Ninguno |
| `lint` | Falla, como se esperaba | ESLint: `no-restricted-imports`; `normative-source` importa `@/modules/moodle-publication` | `src/modules/normative-source/violation.ts:1:1` | Ninguno |
| `types` | Falla, como se esperaba | TypeScript: `TS2322`; `string` no es asignable a `number` | `src/platform/version/index.ts:21:14` | Ninguno |
| `test` | Falla, como se esperaba | Vitest: `AssertionError: expected 1 to be 2` | `tests/unit/negative.test.ts > prueba negativa sintética` | Ninguno |
| `build` | Falla, como se esperaba | `next build`: `Error occurred prerendering page "/negative-build"`, con la excepción de `getStaticProps` y el marcador de la ejecución | `src/pages/negative-build.tsx`, ruta `/negative-build` | Ninguno |
| `secrets` (a), historial | Falla, como se esperaba | Gitleaks: regla `github-pat` en el historial alcanzable | `negative-secret.txt:1`, commit de la copia | Ninguno |
| `secrets` (b), fichero sin seguimiento | Falla, como se esperaba | Gitleaks: regla `github-pat` en el árbol de trabajo | `negative-secret.txt:1`, sin seguimiento | Ninguno |
| `secrets` (c), fichero ignorado | Termina con éxito, como se esperaba | Exclusión positiva: `.env.development.local` está ignorado y no se examina | `.env.development.local` | Ninguno |
| `dependencies` | Falla, como se esperaba | `npm audit`: gravedad alta sin excepción; GHSA-35jh-r3h4-6jhm y GHSA-r5fr-rjxr-66jc | `lodash` 4.17.20, solo en el lockfile de la copia | Ninguno |
| `workflows` | Falla, como se esperaba | zizmor: `template-injection`, gravedad High | `.github/workflows/negative-test.yml:12` | Ninguno |

  - **«Fallos colaterales: ninguno»** es lo que informó el arnés en todas las entradas. El
    arnés local ejecuta solo el control objetivo de cada categoría: no significa que se
    hayan ejecutado los nueve controles sobre cada alteración ni acredita los demás
    controles; eso corresponde a los pull requests negativos.
  - Cierre literal de la salida: «Repositorio original sin cambios: HEAD, git status y rutas
    ignoradas.» y «verify:negative: todas las categorías se comportan como se esperaba.»
- Subcaso de exclusión positiva: el subcaso (c) de secretos, fichero ignorado, terminó con
  éxito, como se esperaba. No es una novena prueba negativa.
- Código de salida: 0.
- Estado de Git idéntico antes y después (`git status --porcelain` y `git rev-parse HEAD`): sí,
  según el resumen del operador.
- Al terminar, el puerto 3000 del contenedor no tenía ningún proceso a la escucha.

Parte local en Linux x64 completada sobre el SHA base `f809b03` (T075, 2026-10-06), en el
contenedor aceptado como desviación. Que el humo terminara sin errores de grupos de procesos
en los dos intentos con `--init` es compatible con la hipótesis del PID 1 del intento 1, sin
demostrarla.

### Integración continua

**Composición de la evidencia para el SHA base `f809b03`**:

- **Repetidos sobre el SHA base** (2026-10-06): `types`, `test`, `build` y `dependencies`,
  pull requests #15 a #18. Son los de la tabla siguiente.
- **Reutilizados, con su SHA original**: `format`, `lint`, `secrets` y `workflows`, pull
  requests #7, #8, #12 y #14, ejecutados sobre `1fd6da9` el 2026-10-04. **No se han ejecutado
  sobre el SHA base.** La justificación y sus límites están en la cabecera («Transición por
  el aviso de `source-map-js`»): sus alteraciones y sus controles objetivo no cambian ni
  cargan `source-map-js`; sus controles no afectados en verde se midieron con el lockfile
  anterior y esa parte no se traslada.
- Los pull requests #9, #10, #11 y #13, sobre `1fd6da9`, se conservan como evidencia de esa
  base y quedan sustituidos por las repeticiones.

#### Repeticiones sobre `f809b03` (2026-10-06)

| Categoría | Pull request cerrado sin integrar | Ejecución | Causa y ubicación | Controles colaterales | Controles no afectados en verde | `macos-quality` (categorías 1 a 5) |
|-----------|-----------------------------------|-----------|-------------------|-----------------------|---------------------------------|------------------------------------|
| `types` | [#15](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/15), cerrado sin integrar el 2026-10-06 | [`quality` 37497988050](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37497988050) y [`security` 37497988098](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37497988098), intento 1 | [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37497988050/job/112387365444): TypeScript `TS2322`, `src/platform/version/index.ts(21,14)` | Previstos: [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37497988050/job/112387365504), misma `TS2322` en la comprobación de tipos de `next build` ("Failed to type check"); [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37497988050/job/112387365666), solo por la exportación adicional `sample` (ver abajo). Ninguno no previsto | `format`, `lint`, `secrets`, `dependencies` y `workflows` en success | [Falla](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37497988050/job/112387365746) en `check:types`, tras superar `check:format` y `check:lint`, con la misma causa y ubicación; no llega a `check:test` |
| `test` | [#16](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/16), cerrado sin integrar el 2026-10-06 | [`quality` 37498304968](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498304968) y [`security` 37498304834](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498304834), intento 1 | [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498304968/job/112388434400): Vitest `AssertionError: expected 1 to be 2`, `tests/unit/negative.test.ts > prueba negativa sintética` (1 prueba fallida y 840 superadas, de 841) | Ninguno | `format`, `lint`, `types`, `build`, `secrets`, `dependencies` y `workflows` en success | [Falla](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498304968/job/112388434393) en `check:test`, tras superar formato, lint y tipos, con la misma causa y ubicación |
| `build` | [#17](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/17), cerrado sin integrar el 2026-10-06 | [`quality` 37498629724](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498629724) y [`security` 37498629622](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498629622), intento 1 | [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498629724/job/112389559706): `next build`, `Error occurred prerendering page "/negative-build"`, con la excepción de su `getStaticProps` y el marcador de la alteración, en `src/pages/negative-build.tsx:4:9` | Previstos: [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498629724/job/112389559786), `Parsing error: Unexpected token {` en `src/pages/negative-build.tsx:1:13`; [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498629724/job/112389559365), dos pruebas de arquitectura sobre las rutas públicas (ver abajo). Ninguno no previsto | `format`, `types`, `secrets`, `dependencies` y `workflows` en success | [Falla](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498629724/job/112389559635) en `check:lint`, con el mismo error de análisis; no llega a su etapa de compilación y no la acredita |
| `dependencies` | [#18](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/18), cerrado sin integrar el 2026-10-06 | [`quality` 37498914068](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498914068) y [`security` 37498913456](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498913456), intento 1 | [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37498913456/job/112390533182): `npm audit`, 2 vulnerabilidades de gravedad alta sin excepción (GHSA-35jh-r3h4-6jhm y GHSA-r5fr-rjxr-66jc), paquete `lodash` | Ninguno | `format`, `lint`, `types`, `test`, `build`, `macos-quality`, `secrets` y `workflows` en success | No aplica |

**Datos comunes de las cuatro ejecuciones**:

- Se ejecutaron una tras otra, en el orden `types`, `test`, `build` y `dependencies`; cada
  pull request se cerró y su rama se eliminó antes de abrir el siguiente.
- Cada rama `negative-test/<categoría>` tiene un único commit, `test: negative-test <categoría>`,
  con padre único el SHA base y solo la alteración de `scripts/negative-checks.mjs` de esta
  base. En `types`, `test` y `dependencies` el parche es idéntico al del pull request
  anterior de la misma categoría; en `build` solo cambia el marcador sintético.
- Evento `pull_request`, intento 1, sin relanzamientos. En cada commit constan exactamente nueve
  check runs, todos de la aplicación GitHub Actions: 36 jobs en total.
- `main` utilizado en los cuatro merges provisionales: `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544`.
  Cada merge tiene como padres ese commit y el commit de origen, y es el que analizaron los
  nueve jobs, comprobado en el registro de cada job.
- Las cuatro coincidieron con la matriz prevista, sin fallos adicionales ni causas distintas.

| Categoría | Commit de origen | Merge provisional analizado |
|-----------|------------------|-----------------------------|
| `types` | `b5ed8c7c3bf8c314f4cacd4c100f4d1194963677` | `e7ffbc431f83c270c9ace1b18a14ed6f2c998a17` |
| `test` | `192f709d2fd8c3e6f91c35b7868851f16fa95e1c` | `20ebd89a9a0bdf09c669b4d61362728205c68c51` |
| `build` | `d8ff3704e7a7c44ccdb2ba9e8337f30cff6fe86b` | `65bf4c1aabaa400c1be9147a5589708db2049cbb` |
| `dependencies` | `6ff063b90f68d5e08e24a5d18d387661e17fe0c6` | `0ab2c95ca6748a5909b36615a301ebe08c61c336` |

- **`types`, colateral de `test`**: 1 prueba fallida y 839 superadas, de 840 (1 fichero
  fallido y 17 superados). Vitest, `AssertionError: expected [ 'getVersion', 'sample' ] to
  deeply equal [ 'getVersion' ]`, en `tests/unit/platform/health.test.ts`, prueba
  "src/platform/version > exporta únicamente getVersion, síncrona". Falla solo por la
  exportación adicional `sample` de la alteración.
- **`build`, colateral de `test`**: 2 pruebas fallidas y 838 superadas, de 840.
  `tests/architecture/entry-points.test.ts`, "src/pages no contiene otra ruta que la API Route
  de estado", y `tests/architecture/public-routes.test.ts`, "src/pages contiene exactamente
  src/pages/api/health.ts". Las dos fallan por la presencia de `src/pages/negative-build.tsx`.
- **`dependencies`**: la alteración añade solo `lodash` 4.17.20 a `package.json` y al lockfile
  (8 líneas añadidas, ninguna eliminada); `source-map-js` sigue en 1.2.2. El control informó
  222 dependencias auditadas y, como bloqueantes, únicamente los dos avisos de `lodash`; el
  aviso corregido de `source-map-js` no reaparece. Informó además 3 avisos de gravedad media
  de `lodash`, que no bloquean.
- En `test` y `dependencies`, el job `build` terminó en success con "Prueba de humo superada:
  21 casos."; en `dependencies`, `test` y `macos-quality` terminaron con 840 pruebas superadas
  de 840.
- **Cierre**: los cuatro pull requests están cerrados sin integrar (sin fecha de integración)
  y siguen en borrador. Tras eliminar cada rama,
  `git ls-remote --heads origin 'negative-test/*'` quedó vacío, también según la API de
  referencias. Ninguno de los cuatro commits de origen es antecesor de `main`
  (`git merge-base --is-ancestor` devuelve 1) y, tras actualizar y podar las referencias,
  ninguna rama remota los contiene. `main` y la rama de la funcionalidad no cambiaron.
- En este lote no se generó ningún token sintético: `secrets` no se repite.

Con estas cuatro repeticiones y las cuatro categorías reutilizadas, la parte de integración
continua de SC-003 queda completa para el SHA base. Estos pull requests no forman parte de la
serie de SC-004.

#### Ejecuciones sobre `1fd6da9` (2026-10-04)

Las ocho categorías, sobre `1fd6da9`, entonces SHA base. De esta tabla se reutilizan para el
SHA base las filas de `format`, `lint`, `secrets` y `workflows`; las otras cuatro se conservan
como evidencia de `1fd6da9`.

| Categoría | Pull request cerrado sin integrar | Ejecución | Causa y ubicación | Controles colaterales | Controles no afectados en verde | `macos-quality` (categorías 1 a 5) |
|-----------|-----------------------------------|-----------|-------------------|-----------------------|---------------------------------|------------------------------------|
| `format` | [#7](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/7), cerrado sin integrar el 2026-10-04 | [`quality` 37182212271](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182212271) y [`security` 37182212272](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182212272), intento 1 | [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182212271/job/111376885118): Prettier `Code style issues found`, `[warn] src/platform/version/index.ts` | Previsto: [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182212271/job/111376885103), `@typescript-eslint/no-unused-vars` sobre `sample` en `src/platform/version/index.ts:21:8`. Ninguno no previsto | `types`, `test`, `build`, `secrets`, `dependencies` y `workflows` en success | [Falla](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182212271/job/111376884975) en `check:format`, con la misma causa y ubicación |
| `lint` | [#8](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/8), cerrado sin integrar el 2026-10-04 | [`quality` 37182306789](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182306789) y [`security` 37182306794](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182306794), intento 1 | [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182306789/job/111377159926): ESLint `no-restricted-imports` (`normative-source` importa `@/modules/moodle-publication`), `src/modules/normative-source/violation.ts:1:1` | Ninguno | `format`, `types`, `test`, `build`, `secrets`, `dependencies` y `workflows` en success | [Falla](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182306789/job/111377159885) en `check:lint`, tras superar `check:format`, con la misma causa y ubicación |
| `types` | [#9](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/9), cerrado sin integrar el 2026-10-04 | [`quality` 37182401360](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182401360) y [`security` 37182401343](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182401343), intento 1 | [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182401360/job/111377434926): TypeScript `TS2322`, `src/platform/version/index.ts(21,14)` | Previsto: [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182401360/job/111377434936), misma `TS2322` en la comprobación de tipos de `next build` ("Failed to type check"). **No previsto**: [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182401360/job/111377434940) (ver abajo) | `format`, `lint`, `secrets`, `dependencies` y `workflows` en success; `test` falló | [Falla](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182401360/job/111377434832) en `check:types`, tras superar `check:format` y `check:lint`, con la misma causa y ubicación |
| `test` | [#10](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/10), cerrado sin integrar el 2026-10-04 | [`quality` 37182710841](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182710841) y [`security` 37182710823](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182710823), intento 1 | [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182710841/job/111378326093): Vitest `AssertionError: expected 1 to be 2`, `tests/unit/negative.test.ts > prueba negativa sintética` (1 prueba fallida y 840 superadas, de 841) | Ninguno | `format`, `lint`, `types`, `build`, `secrets`, `dependencies` y `workflows` en success | [Falla](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182710841/job/111378326123) en `check:test`, tras superar formato, lint y tipos, con la misma causa y ubicación |
| `build` | [#11](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/11), cerrado sin integrar el 2026-10-04 | [`quality` 37182803901](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182803901) y [`security` 37182803898](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182803898), intento 1 | [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182803901/job/111378584904): `next build`, `Error occurred prerendering page "/negative-build"`, con la excepción de su `getStaticProps` en `src/pages/negative-build.tsx:4:9` | Previstos: [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182803901/job/111378584771), `Parsing error: Unexpected token {` en `src/pages/negative-build.tsx:1:13`; [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182803901/job/111378584940), dos pruebas de arquitectura sobre las rutas públicas (ver abajo). Ninguno no previsto | `format`, `types`, `secrets`, `dependencies` y `workflows` en success | [Falla](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182803901/job/111378584918) en `check:lint`, con el mismo error de análisis; no llega a su etapa de compilación y no la acredita |
| `secrets` | [#12](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/12), cerrado sin integrar el 2026-10-04 | [`quality` 37182878707](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182878707) y [`security` 37182878761](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182878761), intento 1 | [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182878761/job/111378799138): Gitleaks, regla `github-pat` en el historial alcanzable, `negative-secret.txt:1` | Ninguno | `format`, `lint`, `types`, `test`, `build`, `macos-quality`, `dependencies` y `workflows` en success | No aplica |
| `dependencies` | [#13](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/13), cerrado sin integrar el 2026-10-04 | [`quality` 37182989264](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182989264) y [`security` 37182989226](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182989226), intento 1 | [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37182989226/job/111379120261): `npm audit`, 2 vulnerabilidades de gravedad alta sin excepción (GHSA-35jh-r3h4-6jhm y GHSA-r5fr-rjxr-66jc), paquete `lodash` | Ninguno | `format`, `lint`, `types`, `test`, `build`, `macos-quality`, `secrets` y `workflows` en success | No aplica |
| `workflows` | [#14](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/14), cerrado sin integrar el 2026-10-04 | [`quality` 37183137627](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37183137627) y [`security` 37183137672](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37183137672), intento 1; además [`negative-test` 37183137682](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37183137682) | [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37183137672/job/111379545039): zizmor `template-injection`, gravedad High, `.github/workflows/negative-test.yml:12` | Ninguno | `format`, `lint`, `types`, `test`, `build`, `macos-quality`, `secrets` y `dependencies` en success | No aplica |

**Datos comunes de las tres ejecuciones**:

- Cada rama `negative-test/<categoría>` tiene un único commit, `test: negative-test <categoría>`,
  con padre único el SHA base y la alteración de `scripts/negative-checks.mjs` de esta base.
- Evento `pull_request`, intento 1, sin relanzamientos. En cada commit constan exactamente nueve
  check runs, todos de la aplicación GitHub Actions.
- `main` utilizado en los tres merges provisionales: `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544`.

| Categoría | Commit de origen | Merge provisional analizado |
|-----------|------------------|-----------------------------|
| `format` | `b499de5aae5bcc268653009824652f5a1337d90e` | `66b48ae84f92cc9a593559ce46f7240d905e86d4` |
| `lint` | `833fca75df02c4af8c68d1bed259c0f455810ddd` | `e42b99af0f60a67ed3b6e5651855ccd83e977eae` |
| `types` | `a9d4d1cd2d900199777113f341b5013bfd46a9c7` | `1a8b450af7ab0c5203bde2a9282ff3ee293afd3e` |

En `format` y `lint`, el job `build` terminó en success con "Prueba de humo superada: 21
casos." y sin líneas de diagnóstico.

**`types`, fallo no previsto del job `test`**:

- **Causa**: Vitest, `AssertionError: expected [ 'getVersion', 'sample' ] to deeply equal
  [ 'getVersion' ]`, en `tests/unit/platform/health.test.ts:239`, prueba "src/platform/version >
  exporta únicamente getVersion, síncrona". Resultado: 1 fichero fallido y 17 superados; 1
  prueba fallida y 839 superadas, de 840.
- **Relación con la alteración**: la alteración documentada de `types` añade la exportación
  `sample` a `src/platform/version/index.ts`, y esa prueba exige que el módulo exporte solo
  `getVersion`. Es un colateral de la propia alteración, no un fallo ajeno a ella ni una
  recurrencia de la incidencia de la prueba de humo.
- **Por qué no estaba previsto**: `npm run verify:negative` ejecuta en local solo `check:types`
  para esta categoría, así que no observa `check:test`, y la matriz de colaterales esperados
  solo preveía `build`.
- **`macos-quality`** se detuvo en `check:types` y no llegó a `check:test`.

Como el resultado no estaba previsto, el lote de T077 se detuvo después de cerrar el pull
request de `types`; las otras cinco categorías no se ejecutaron entonces. No se corrigió ni se
repitió nada.

**Decisión posterior sobre el pull request #9** (2026-10-04):

- El fallo de `test` no estaba previsto en la matriz inicial de colaterales. Se identificó
  después de la ejecución, por lectura, como consecuencia directa de la alteración documentada.
- Comprobado por lectura sobre el SHA base, sin repetir pruebas: la alteración de `types` es
  `export const sample: number = "text";` al final del módulo de versión; la prueba citada exige
  que ese módulo exporte solo `getVersion`; el commit del pull request #9 contiene únicamente
  esa alteración (un fichero, dos líneas añadidas, padre único el SHA base); `types` falló por
  `TS2322` en la ubicación prevista; `test` falló solo por la exportación adicional; y los
  controles ajenos a la alteración (`format`, `lint`, `secrets`, `dependencies` y `workflows`)
  terminaron en success.
- Se acepta el resultado del pull request #9 para T077, sin repetirlo.
- Matriz corregida de `types`: fallos esperados en `types`, `macos-quality`, `build` y `test`.
- No cambian el arnés, la documentación, las tareas ni el SHA base. El lote se reanudó desde
  `test`.

**Reanudación desde `test`** (2026-10-04). Las cinco categorías restantes se ejecutaron con las
mismas condiciones que las tres primeras: un único commit por rama, con padre único el SHA
base y solo la alteración documentada; evento `pull_request`, intento 1, sin relanzamientos;
`main` en `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544`. Las cinco coincidieron con la matriz
prevista, sin colaterales no previstos.

| Categoría | Commit de origen | Merge provisional analizado |
|-----------|------------------|-----------------------------|
| `test` | `299dced008dfa8dc9ed57be7934c389165bba7d8` | `72dac5ec27823fbb4df3912009aacd0979912e86` |
| `build` | `f424efe99d601bdd06d5a11ef8ff2d5583b9a551` | `48dd0c5f6c8ee158859f914dd8588c0a399a8acf` |
| `secrets` | `bc5afdf0c6a1ba9a0191abf9d1a3982246158361` | `5ed25b17209329865837a34e8ab051b53d8517ce` |
| `dependencies` | `459196fa51e5dcc4bf85a32abd601681a08b20d7` | `15067659e98421d2d689afd9e51ba13030bfb372` |
| `workflows` | `6b51e3267c1485dec1618418e074031b5e93280f` | `928f881d8bb73560debe7a81e1c8b6c9f96ec11e` |

- **Check runs**: nueve en cada commit, todos de la aplicación GitHub Actions. En `workflows`
  constan diez: los nueve controles y el job del workflow negativo.
- **`build`, colateral de `test`**: 2 pruebas fallidas y 838 superadas, de 840.
  `tests/architecture/entry-points.test.ts`, "src/pages no contiene otra ruta que la API Route
  de estado", y `tests/architecture/public-routes.test.ts`, "src/pages contiene exactamente
  src/pages/api/health.ts". Las dos fallan por la presencia de `src/pages/negative-build.tsx`.
- **`workflows`, job adicional**: el workflow añadido ejecutó su propio job,
  [`negative-test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37183137682/job/111379544777),
  que terminó en success. No es uno de los nueve controles. Su único paso imprimió el título
  del pull request, un texto constante sin caracteres con significado para el shell. zizmor
  analizó 3 workflows.
- En `test`, `secrets`, `dependencies` y `workflows`, el job `build` terminó en success con
  "Prueba de humo superada: 21 casos.".

Las ocho categorías quedan ejecutadas sobre `1fd6da9`. Sobre el SHA base se repitieron
`dependencies`, `test`, `build` y `types` el 2026-10-06 (ver arriba); las otras cuatro se
reutilizan. Estos pull requests no forman parte de la serie de SC-004.

- Secretos: autorización de la protección de push, si la hubo, sin el valor del token: no hizo
  falta. El push de `negative-test/secrets` terminó con código 0 y sin bloqueo. El token se
  generó en el momento con el formato del arnés y solo estuvo en el fichero de la alteración.
- Secretos: cierre de cualquier alerta como dato sintético: no hubo alerta. La API de GitHub
  indica que el análisis de secretos está desactivado en este repositorio; no se cambió
  ningún ajuste. El valor no aparece en los registros de los jobs.
- Salida vacía de `git ls-remote --heads origin 'negative-test/*'`: vacía tras eliminar la
  octava rama (2026-10-04). Además se comprobó con la API de referencias después de cada
  cierre.
- Comprobación de que esos commits no son alcanzables desde `main`: ninguno de los ocho
  (`b499de5`, `833fca7`, `a9d4d1c`, `299dced`, `f424efe`, `bc5afdf`, `459196f` y `6b51e32`) es
  antecesor de `main` (`git merge-base --is-ancestor` devuelve 1). Tras actualizar y podar las
  referencias, ninguna rama remota los contiene.

---

## SC-004 Activación y duración de los controles

**Estado**: Superado

**Entorno**: runners `ubuntu-24.04` (Linux x64) y `macos-26` (arm64), con Node.js 24.21.0 desde
`.node-version`.
**Momento**: pull request, antes de integrar. `main`, tras las integraciones correctivas que
resulten necesarias y antes de activar los controles requeridos.

**Superado** si en los cuatro casos computables los nueve jobs concluyen con éxito y cada uno
dura menos de 15 minutos. Una indisponibilidad general del proveedor solo se excluye con enlace
a su incidencia pública.

**Parte de pull request: completada sobre el SHA base `f809b03`** (T079, 2026-10-06). Tres
intentos consecutivos sobre `f809b03262d9acc68e72f86f9da6807d4256649a`, en el pull request de
la funcionalidad:

- **Mismo SHA**: los dos workflows de cada intento corresponden al SHA base como commit de
  origen. Los 27 jobs analizaron el mismo merge provisional,
  `8ed7732b25fb991b2b4cbf8ba64ce8541128777d`, cuyos padres son `main` en
  `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544` y el SHA base, comprobado en el registro de cada
  job.
- **Jobs realmente ejecutados**: 27 identificadores de job distintos. En cada intento los
  nueve jobs tienen horas propias, su número de intento coincide con el de la ejecución y
  ninguno de sus pasos figura como omitido. Ningún resultado se trasladó de un intento
  anterior.
- **Nombres y fuente**: `format`, `lint`, `types`, `test`, `build`, `macos-quality`, `secrets`,
  `dependencies` y `workflows`, todos de la aplicación GitHub Actions.
- **Resultado**: 27 de 27 jobs en success; la duración máxima fue de 134 s (`macos-quality`,
  intento 1), muy por debajo de los 15 minutos. Las duraciones son la diferencia entre
  `completed_at` y `started_at` de cada job.
- **Reejecuciones**: los intentos 2 y 3 se lanzaron relanzando todos los jobs de los dos
  workflows, sin `--failed` ni jobs individuales, cada uno después de terminar y verificar el
  anterior.
- **Sin cambios entre intentos**: no se añadieron commits, y el SHA del pull request y `main`
  eran los mismos antes de cada lanzamiento, sin ejecuciones activas.
- **Registros**, en los tres intentos: `test` y `macos-quality`, 840 pruebas superadas de 840;
  `build` y `macos-quality`, "Prueba de humo superada: 21 casos.", sin el aviso de sistema de
  ficheros lento; `dependencies`, 221 dependencias auditadas, ninguna vulnerabilidad alta o
  crítica sin excepción y firmas y atestaciones verificadas; `secrets`, 0 excepciones
  vigentes y sin hallazgos; `workflows`, sin hallazgos.
- Esta serie ejecuta los nueve controles sobre el SHA base sin ninguna alteración. No es una
  ejecución de los pull requests negativos de SC-003.

**Serie anterior, sobre `28c58da`** (base anterior; T079 del 2026-10-05). Se conserva como
evidencia de esa base y no acredita la vigente. Tres intentos consecutivos sobre
`28c58da1bcbf11df33fae5e26b77e1a8f9ea3966`, en el pull request de la funcionalidad:

- **Mismo SHA**: los dos workflows de cada intento corresponden al SHA base como commit de
  origen. Los 27 jobs analizaron el mismo merge provisional,
  `199d312b49852a98f67bf4e2ad55968aee184d99` (el SHA base sobre `main` en
  `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544`), comprobado en el registro de cada job.
- **Jobs realmente ejecutados**: en cada intento los nueve jobs tienen identificadores y horas
  propios, su número de intento coincide con el de la ejecución y ninguno de sus pasos figura
  como omitido. Ningún resultado se trasladó de un intento anterior.
- **Nombres y fuente**: `format`, `lint`, `types`, `test`, `build`, `macos-quality`, `secrets`,
  `dependencies` y `workflows`, todos de la aplicación GitHub Actions.
- **Resultado**: 27 de 27 jobs en success; la duración máxima fue de 104 s (`macos-quality`,
  intentos 1 y 3), muy por debajo de los 15 minutos. Las duraciones son la diferencia entre
  `completed_at` y `started_at` de cada job.
- **Reejecuciones**: los intentos 2 y 3 se lanzaron relanzando todos los jobs de los dos
  workflows, sin `--failed` ni jobs individuales, cada uno después de terminar y verificar el
  anterior. Cada intento terminó dentro del límite de observación de 30 minutos.
- **Sin cambios entre intentos**: no se añadieron commits, y el SHA del pull request y `main`
  eran los mismos antes de cada lanzamiento, sin ejecuciones activas.
- En los tres intentos, `test` y `macos-quality` terminaron con 840 pruebas superadas de 840, y
  `build` y `macos-quality` con "Prueba de humo superada: 21 casos.", sin el aviso de sistema
  de ficheros lento.

**Serie anterior, sobre `1fd6da9`** (base anterior de las mediciones). Se conserva como
evidencia de esa base y no acredita la vigente.

Serie registrada en T079 (2026-10-04): tres intentos consecutivos sobre
`1fd6da9b8e6b02405987025507443d468192bada`, en el pull request de la funcionalidad:

- **Mismo SHA**: los dos workflows de cada intento corresponden al SHA base como commit de
  origen. Los 27 jobs analizaron el mismo merge provisional,
  `98649f0771e3b6b996f4965b9d8ae3b5a7087e38` (el SHA base sobre `main` en
  `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544`), comprobado en el registro de cada job.
- **Jobs realmente ejecutados**: en cada intento los nueve jobs tienen identificadores y horas
  propios y su número de intento coincide con el de la ejecución. Ningún resultado se trasladó
  de un intento anterior.
- **Nombres y fuente**: `format`, `lint`, `types`, `test`, `build`, `macos-quality`, `secrets`,
  `dependencies` y `workflows`, todos de la aplicación GitHub Actions.
- **Resultado**: 27 de 27 jobs en success; la duración máxima fue de 100 s (`macos-quality`,
  intento 1), muy por debajo de los 15 minutos. Las duraciones son la diferencia entre
  `completed_at` y `started_at` de cada job.
- **Sin cambios entre intentos**: no se añadieron commits, y el SHA del pull request y `main`
  eran los mismos antes de cada lanzamiento, sin ejecuciones activas.
- En los tres intentos, `test` terminó con 840 pruebas superadas y `build` y `macos-quality`
  con "Prueba de humo superada: 21 casos.", sin líneas de diagnóstico.

**Parte de `main`: completada** (T083, 2026-10-06). La primera ejecución de `quality` y
`security` disparada por la actualización de `main` terminó con los nueve jobs en success
sobre `5ca3b16c10f0df943453f8e696cd521642608213`, el commit de la integración. Fue la
primera ejecución en `main` y no hubo integraciones correctivas. El detalle está en
«`main`: primera ejecución satisfactoria».

**Los cuatro casos computables** (los tres intentos de pull request sobre el SHA base y la
primera ejecución satisfactoria de `main`) suman 36 jobs, todos en success y todos por debajo
de 15 minutos; el más largo duró 134 s. Ninguna ejecución se excluye por indisponibilidad del
proveedor.

### Pull request sobre `f809b03`: intento 1 (ejecución inicial)

Ejecución inicial del evento `pull_request` tras publicar el SHA base (la misma de T071).

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | [37421218233](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/attempts/1) | 1 | `f809b03262d9acc68e72f86f9da6807d4256649a` |
| `security` | [37421218270](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/attempts/1) | 1 | `f809b03262d9acc68e72f86f9da6807d4256649a` |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112130775144) | 2026-10-06T05:58:22Z | 2026-10-06T05:58:39Z | 17 s | success |
| [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112130775058) | 2026-10-06T05:58:22Z | 2026-10-06T05:58:40Z | 18 s | success |
| [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112130775247) | 2026-10-06T05:58:22Z | 2026-10-06T05:58:44Z | 22 s | success |
| [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112130774908) | 2026-10-06T05:58:22Z | 2026-10-06T05:58:44Z | 22 s | success |
| [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112130775217) | 2026-10-06T05:58:23Z | 2026-10-06T05:59:11Z | 48 s | success |
| [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112130775118) | 2026-10-06T05:58:32Z | 2026-10-06T06:00:46Z | 134 s | success |
| [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/job/112130779136) | 2026-10-06T05:58:24Z | 2026-10-06T05:58:36Z | 12 s | success |
| [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/job/112130779148) | 2026-10-06T05:58:23Z | 2026-10-06T05:58:50Z | 27 s | success |
| [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/job/112130778899) | 2026-10-06T05:58:23Z | 2026-10-06T05:58:33Z | 10 s | success |

Job más largo: `macos-quality`, 134 s. Los nueve concluyen en success y duran menos de 15 minutos.

### Pull request sobre `f809b03`: intento 2 (reejecución completa)

Reejecución completa de los dos workflows (`gh run rerun <id>`, sin `--failed`), lanzada cuando
el intento 1 había terminado y estaba verificado.

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | [37421218233](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/attempts/2) | 2 | `f809b03262d9acc68e72f86f9da6807d4256649a` |
| `security` | [37421218270](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/attempts/2) | 2 | `f809b03262d9acc68e72f86f9da6807d4256649a` |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112131780983) | 2026-10-06T06:02:02Z | 2026-10-06T06:02:26Z | 24 s | success |
| [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112131780495) | 2026-10-06T06:02:03Z | 2026-10-06T06:02:25Z | 22 s | success |
| [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112131780533) | 2026-10-06T06:02:02Z | 2026-10-06T06:02:23Z | 21 s | success |
| [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112131780518) | 2026-10-06T06:02:02Z | 2026-10-06T06:02:35Z | 33 s | success |
| [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112131780360) | 2026-10-06T06:02:02Z | 2026-10-06T06:02:37Z | 35 s | success |
| [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112131780528) | 2026-10-06T06:02:09Z | 2026-10-06T06:03:58Z | 109 s | success |
| [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/job/112131787305) | 2026-10-06T06:02:05Z | 2026-10-06T06:02:15Z | 10 s | success |
| [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/job/112131787379) | 2026-10-06T06:02:03Z | 2026-10-06T06:02:18Z | 15 s | success |
| [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/job/112131787160) | 2026-10-06T06:02:04Z | 2026-10-06T06:02:13Z | 9 s | success |

Job más largo: `macos-quality`, 109 s. Los nueve concluyen en success y duran menos de 15 minutos.

### Pull request sobre `f809b03`: intento 3 (reejecución completa)

Reejecución completa de los dos workflows (`gh run rerun <id>`, sin `--failed`), lanzada cuando
el intento 2 había terminado y estaba verificado.

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | [37421218233](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/attempts/3) | 3 | `f809b03262d9acc68e72f86f9da6807d4256649a` |
| `security` | [37421218270](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/attempts/3) | 3 | `f809b03262d9acc68e72f86f9da6807d4256649a` |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112132725780) | 2026-10-06T06:05:27Z | 2026-10-06T06:05:46Z | 19 s | success |
| [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112132725926) | 2026-10-06T06:05:27Z | 2026-10-06T06:05:48Z | 21 s | success |
| [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112132725693) | 2026-10-06T06:05:26Z | 2026-10-06T06:05:45Z | 19 s | success |
| [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112132725589) | 2026-10-06T06:05:27Z | 2026-10-06T06:05:56Z | 29 s | success |
| [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112132725824) | 2026-10-06T06:05:26Z | 2026-10-06T06:06:13Z | 47 s | success |
| [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/job/112132725842) | 2026-10-06T06:05:33Z | 2026-10-06T06:07:32Z | 119 s | success |
| [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/job/112132731603) | 2026-10-06T06:05:28Z | 2026-10-06T06:05:38Z | 10 s | success |
| [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/job/112132731592) | 2026-10-06T06:05:28Z | 2026-10-06T06:05:50Z | 22 s | success |
| [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/job/112132731448) | 2026-10-06T06:05:28Z | 2026-10-06T06:05:34Z | 6 s | success |

Job más largo: `macos-quality`, 119 s. Los nueve concluyen en success y duran menos de 15 minutos.

### Serie anterior sobre `28c58da`: intento 1 (ejecución inicial)

Ejecución inicial del evento `pull_request` tras publicar `28c58da`, entonces SHA base (la
misma de su T071).

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | [37275255817](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/attempts/1) | 1 | `28c58da1bcbf11df33fae5e26b77e1a8f9ea3966` |
| `security` | [37275255796](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/attempts/1) | 1 | `28c58da1bcbf11df33fae5e26b77e1a8f9ea3966` |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111650756393) | 2026-10-05T06:59:37Z | 2026-10-05T06:59:58Z | 21 s | success |
| [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111650756404) | 2026-10-05T07:00:13Z | 2026-10-05T07:00:34Z | 21 s | success |
| [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111650756484) | 2026-10-05T06:59:37Z | 2026-10-05T06:59:51Z | 14 s | success |
| [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111650756500) | 2026-10-05T07:00:13Z | 2026-10-05T07:00:42Z | 29 s | success |
| [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111650756442) | 2026-10-05T06:59:37Z | 2026-10-05T07:00:22Z | 45 s | success |
| [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111650756273) | 2026-10-05T06:59:45Z | 2026-10-05T07:01:29Z | 104 s | success |
| [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/job/111650756073) | 2026-10-05T06:59:37Z | 2026-10-05T06:59:47Z | 10 s | success |
| [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/job/111650756239) | 2026-10-05T06:59:37Z | 2026-10-05T06:59:56Z | 19 s | success |
| [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/job/111650756333) | 2026-10-05T06:59:37Z | 2026-10-05T06:59:45Z | 8 s | success |

Job más largo: `macos-quality`, 104 s. Los nueve concluyen en success y duran menos de 15 minutos.

### Serie anterior sobre `28c58da`: intento 2 (reejecución completa)

Reejecución completa de los dos workflows (`gh run rerun <id>`, sin `--failed`), lanzada cuando
el intento 1 había terminado y estaba verificado.

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | [37275255817](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/attempts/2) | 2 | `28c58da1bcbf11df33fae5e26b77e1a8f9ea3966` |
| `security` | [37275255796](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/attempts/2) | 2 | `28c58da1bcbf11df33fae5e26b77e1a8f9ea3966` |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111651570873) | 2026-10-05T07:02:32Z | 2026-10-05T07:02:45Z | 13 s | success |
| [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111651570914) | 2026-10-05T07:02:32Z | 2026-10-05T07:02:53Z | 21 s | success |
| [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111651570620) | 2026-10-05T07:02:32Z | 2026-10-05T07:02:44Z | 12 s | success |
| [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111651570735) | 2026-10-05T07:02:32Z | 2026-10-05T07:02:56Z | 24 s | success |
| [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111651570782) | 2026-10-05T07:02:33Z | 2026-10-05T07:03:18Z | 45 s | success |
| [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111651570871) | 2026-10-05T07:02:38Z | 2026-10-05T07:04:19Z | 101 s | success |
| [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/job/111651576974) | 2026-10-05T07:02:33Z | 2026-10-05T07:02:42Z | 9 s | success |
| [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/job/111651577125) | 2026-10-05T07:02:33Z | 2026-10-05T07:02:54Z | 21 s | success |
| [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/job/111651577175) | 2026-10-05T07:02:34Z | 2026-10-05T07:02:40Z | 6 s | success |

Job más largo: `macos-quality`, 101 s. Los nueve concluyen en success y duran menos de 15 minutos.

### Serie anterior sobre `28c58da`: intento 3 (reejecución completa)

Reejecución completa de los dos workflows (`gh run rerun <id>`, sin `--failed`), lanzada cuando
el intento 2 había terminado y estaba verificado.

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | [37275255817](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/attempts/3) | 3 | `28c58da1bcbf11df33fae5e26b77e1a8f9ea3966` |
| `security` | [37275255796](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/attempts/3) | 3 | `28c58da1bcbf11df33fae5e26b77e1a8f9ea3966` |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111652261270) | 2026-10-05T07:05:05Z | 2026-10-05T07:05:18Z | 13 s | success |
| [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111652261098) | 2026-10-05T07:05:05Z | 2026-10-05T07:05:30Z | 25 s | success |
| [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111652261003) | 2026-10-05T07:05:05Z | 2026-10-05T07:05:23Z | 18 s | success |
| [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111652261189) | 2026-10-05T07:05:06Z | 2026-10-05T07:05:34Z | 28 s | success |
| [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111652261093) | 2026-10-05T07:05:05Z | 2026-10-05T07:05:39Z | 34 s | success |
| [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/job/111652260874) | 2026-10-05T07:05:11Z | 2026-10-05T07:06:55Z | 104 s | success |
| [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/job/111652268901) | 2026-10-05T07:05:07Z | 2026-10-05T07:05:16Z | 9 s | success |
| [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/job/111652269138) | 2026-10-05T07:05:07Z | 2026-10-05T07:05:29Z | 22 s | success |
| [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/job/111652268820) | 2026-10-05T07:05:08Z | 2026-10-05T07:05:19Z | 11 s | success |

Job más largo: `macos-quality`, 104 s. Los nueve concluyen en success y duran menos de 15 minutos.

### Serie anterior sobre `1fd6da9`: intento 1 (ejecución inicial)

Ejecución inicial del evento `pull_request` tras publicar `1fd6da9`, entonces SHA base (la misma de su T071).

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | [37180028387](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/attempts/1) | 1 | `1fd6da9b8e6b02405987025507443d468192bada` |
| `security` | [37180028381](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/attempts/1) | 1 | `1fd6da9b8e6b02405987025507443d468192bada` |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111370545008) | 2026-10-04T05:29:20Z | 2026-10-04T05:29:36Z | 16 s | success |
| [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111370545135) | 2026-10-04T05:29:21Z | 2026-10-04T05:29:38Z | 17 s | success |
| [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111370545161) | 2026-10-04T05:29:20Z | 2026-10-04T05:29:39Z | 19 s | success |
| [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111370545106) | 2026-10-04T05:29:20Z | 2026-10-04T05:29:45Z | 25 s | success |
| [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111370545159) | 2026-10-04T05:29:21Z | 2026-10-04T05:30:09Z | 48 s | success |
| [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111370545157) | 2026-10-04T05:29:28Z | 2026-10-04T05:31:08Z | 100 s | success |
| [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/job/111370544887) | 2026-10-04T05:29:24Z | 2026-10-04T05:29:33Z | 9 s | success |
| [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/job/111370544859) | 2026-10-04T05:29:20Z | 2026-10-04T05:29:42Z | 22 s | success |
| [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/job/111370544875) | 2026-10-04T05:29:20Z | 2026-10-04T05:29:30Z | 10 s | success |

Job más largo: `macos-quality`, 100 s. Los nueve concluyen en success y duran menos de 15 minutos.

### Serie anterior sobre `1fd6da9`: intento 2 (reejecución completa)

Reejecución completa de los dos workflows (`gh run rerun <id>`, sin `--failed`), lanzada cuando
el intento 1 había terminado.

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | [37180028387](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/attempts/2) | 2 | `1fd6da9b8e6b02405987025507443d468192bada` |
| `security` | [37180028381](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/attempts/2) | 2 | `1fd6da9b8e6b02405987025507443d468192bada` |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381168448) | 2026-10-04T06:44:45Z | 2026-10-04T06:45:02Z | 17 s | success |
| [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381168408) | 2026-10-04T06:44:47Z | 2026-10-04T06:45:13Z | 26 s | success |
| [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381168367) | 2026-10-04T06:44:46Z | 2026-10-04T06:45:07Z | 21 s | success |
| [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381168406) | 2026-10-04T06:44:45Z | 2026-10-04T06:45:18Z | 33 s | success |
| [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381168252) | 2026-10-04T06:44:45Z | 2026-10-04T06:45:38Z | 53 s | success |
| [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381168388) | 2026-10-04T06:44:51Z | 2026-10-04T06:46:18Z | 87 s | success |
| [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/job/111381170373) | 2026-10-04T06:44:46Z | 2026-10-04T06:44:54Z | 8 s | success |
| [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/job/111381170445) | 2026-10-04T06:44:46Z | 2026-10-04T06:45:06Z | 20 s | success |
| [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/job/111381170505) | 2026-10-04T06:44:46Z | 2026-10-04T06:44:52Z | 6 s | success |

Job más largo: `macos-quality`, 87 s. Los nueve concluyen en success y duran menos de 15 minutos.

### Serie anterior sobre `1fd6da9`: intento 3 (reejecución completa)

Reejecución completa de los dos workflows (`gh run rerun <id>`, sin `--failed`), lanzada cuando
el intento 2 había terminado y cumplía los requisitos.

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | [37180028387](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/attempts/3) | 3 | `1fd6da9b8e6b02405987025507443d468192bada` |
| `security` | [37180028381](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/attempts/3) | 3 | `1fd6da9b8e6b02405987025507443d468192bada` |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381580713) | 2026-10-04T06:47:38Z | 2026-10-04T06:47:59Z | 21 s | success |
| [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381580781) | 2026-10-04T06:47:37Z | 2026-10-04T06:47:57Z | 20 s | success |
| [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381580798) | 2026-10-04T06:47:37Z | 2026-10-04T06:47:56Z | 19 s | success |
| [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381580754) | 2026-10-04T06:47:38Z | 2026-10-04T06:48:06Z | 28 s | success |
| [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381580765) | 2026-10-04T06:47:39Z | 2026-10-04T06:48:34Z | 55 s | success |
| [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/job/111381580774) | 2026-10-04T06:47:42Z | 2026-10-04T06:48:58Z | 76 s | success |
| [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/job/111381583178) | 2026-10-04T06:47:39Z | 2026-10-04T06:47:49Z | 10 s | success |
| [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/job/111381583116) | 2026-10-04T06:47:38Z | 2026-10-04T06:47:55Z | 17 s | success |
| [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/job/111381583323) | 2026-10-04T06:47:38Z | 2026-10-04T06:47:47Z | 9 s | success |

Job más largo: `macos-quality`, 76 s. Los nueve concluyen en success y duran menos de 15 minutos.

### `main`: primera ejecución satisfactoria

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | [37528698987](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698987/attempts/1) | 1 | `5ca3b16c10f0df943453f8e696cd521642608213` |
| `security` | [37528698946](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698946/attempts/1) | 1 | `5ca3b16c10f0df943453f8e696cd521642608213` |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698987/job/112492205540) | 2026-10-06T20:44:36Z | 2026-10-06T20:44:57Z | 21 s | success |
| [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698987/job/112492205356) | 2026-10-06T20:44:17Z | 2026-10-06T20:44:39Z | 22 s | success |
| [`types`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698987/job/112492205503) | 2026-10-06T20:44:16Z | 2026-10-06T20:44:34Z | 18 s | success |
| [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698987/job/112492205513) | 2026-10-06T20:44:17Z | 2026-10-06T20:44:46Z | 29 s | success |
| [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698987/job/112492205636) | 2026-10-06T20:44:18Z | 2026-10-06T20:45:05Z | 47 s | success |
| [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698987/job/112492205647) | 2026-10-06T20:44:23Z | 2026-10-06T20:46:26Z | 123 s | success |
| [`secrets`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698946/job/112492206388) | 2026-10-06T20:44:17Z | 2026-10-06T20:44:26Z | 9 s | success |
| [`dependencies`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698946/job/112492206035) | 2026-10-06T20:44:16Z | 2026-10-06T20:45:20Z | 64 s | success |
| [`workflows`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698946/job/112492206368) | 2026-10-06T20:44:17Z | 2026-10-06T20:44:23Z | 6 s | success |

- Evento `push` a `main`, intento 1, sin relanzamientos. Los dos workflows corresponden al
  mismo SHA.
- **Commit realmente analizado**: `5ca3b16c10f0df943453f8e696cd521642608213` directamente, no un
  merge provisional; comprobado en el registro de los nueve jobs. No es el SHA base
  (`f809b03`) ni el HEAD de evidencia previa a integrar (`2d8c7f5`), aunque su árbol es
  idéntico al de este último.
- Los nueve jobs son de la aplicación GitHub Actions y ninguno tiene pasos omitidos. Job más
  largo: `macos-quality`, 123 s. La ejecución terminó a las 2026-10-06T20:46:26Z (`security`,
  a las 20:45:22Z).
- Registros: `test` y `macos-quality`, 18 ficheros y 840 pruebas superadas de 840; `build` y
  `macos-quality`, "Prueba de humo superada: 21 casos.", sin el aviso de sistema de ficheros
  lento; `dependencies`, 221 dependencias auditadas, ninguna vulnerabilidad alta o crítica sin
  excepción y firmas y atestaciones verificadas; `secrets`, 0 excepciones vigentes y sin
  hallazgos; `workflows`, 2 workflows analizados sin hallazgos.
- En ese commit constan además comprobaciones de Dependabot, que no son controles de esta
  funcionalidad ni se cuentan aquí.

### Otras ejecuciones

- Ejecuciones fallidas previas: ninguna sobre el SHA base, `28c58da` ni `1fd6da9` en el pull
  request de la funcionalidad. Los fallos del job `build` sobre commits anteriores constan en el registro de
  la incidencia de la prueba de humo. Las ejecuciones de los ocho pull requests negativos de
  SC-003 fallan por diseño, corresponden a otros commits y no son intentos de esta serie.
- Ejecuciones canceladas por `concurrency`: ninguna en las tres series.
- Pull requests correctivos: ninguno. La primera ejecución de `main` fue satisfactoria.

---

## SC-005 Determinismo con y sin red

**Estado**: Superado

> **Transición del 2026-10-06** (ver la cabecera): repetido sobre el SHA base `f809b03` el
> 2026-10-06 (T074), con cinco ejecuciones con red y cinco sin red. La medición anterior,
> sobre `1fd6da9`, se conserva al final del apartado y no acredita la base vigente.

**Entorno**: macOS arm64 de referencia con Node.js 24.21.0, tras `npm ci`.
**Momento**: antes de integrar, sobre el SHA base.

**Superado** si las diez terminan con el mismo código de salida y los mismos recuentos.

- SHA: `f809b03262d9acc68e72f86f9da6807d4256649a` (SHA base). Clon nuevo del repositorio
  remoto, completo y limpio (`--is-shallow-repository` en `false`, sin `--depth`, filtros
  parciales ni alternates), en el macOS arm64 de referencia (macOS 27.0.1), con Node.js
  `v24.21.0`, npm 11.19.0 y `npm ci` ejecutado una vez, con código 0. Caché, registros de npm
  y `TMPDIR` aislados fuera del clon. Las diez ejecuciones son del 2026-10-06, en el mismo clon y
  con el mismo entorno, cada una ejecutada una sola vez: las 1 a 5 hacia las 09:17 UTC y las
  6 a 10 entre las 16:15 y las 16:17 UTC. Antes de las ejecuciones sin red se comprobó de
  nuevo el SHA, el clon limpio y no superficial, las versiones, las dependencias instaladas
  y que la referencia con red estaba completa.
- Resultado de la comprobación de red:
  - con red: `curl -sS --max-time 5 https://registry.npmjs.org/ -o /dev/null` terminó con
    código 0 antes de las ejecuciones 1 a 5;
  - sin red: el mantenedor confirmó expresamente que había desactivado la conectividad externa
    del equipo, escribiendo «SIN RED» a las 16:15:41 UTC, antes de las ejecuciones 6 a 10. El
    mismo comando terminó después con código 6 (curl no pudo resolver el nombre del servidor),
    y de nuevo con código 6 al acabar la ejecución 10, antes de reactivar la conectividad. Las
    dos evidencias son distintas: la confirmación física acredita la desconexión, y los
    códigos de curl solo acreditan que no se pudo acceder al registro, sin demostrar por sí
    solos la desconexión.

| Ejecución | Modo | Código de salida | Ficheros | Pruebas superadas | Pruebas fallidas |
|-----------|------|------------------|----------|-------------------|------------------|
| 1 | Con red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 2 | Con red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 3 | Con red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 4 | Con red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 5 | Con red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 6 | Sin red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 7 | Sin red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 8 | Sin red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 9 | Sin red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 10 | Sin red | 0 | 18 superados de 18 | 840 de 840 | 0 |

Las diez ejecuciones coinciden en código de salida (0) y en los recuentos de Vitest: 18 ficheros
y 840 pruebas superadas, 0 fallidas; cada una tardó 14 s. El clon conservó el SHA base y
siguió limpio después de cada una. Los datos de las ejecuciones 6 a 10 los comunicó el
mantenedor, que las lanzó, y se contrastaron con el resumen y los registros conservados de
la ejecución, sin repetir ninguna.

### Medición anterior sobre `1fd6da9`

Se conserva como evidencia de esa base; no acredita la vigente.

- SHA: `1fd6da9b8e6b02405987025507443d468192bada` (entonces SHA base). Clon nuevo, completo y limpio
  (`--is-shallow-repository` en `false`, sin `--depth`, filtros parciales ni alternates), en el
  macOS arm64 de referencia, con Node.js `v24.21.0`, npm 11.19.0 y `npm ci` terminado con
  código 0. Caché, registros de npm y `TMPDIR` aislados fuera del clon. Las diez ejecuciones
  son del 2026-10-04, en el mismo clon y con el mismo entorno; antes de las ejecuciones sin red
  se comprobó de nuevo el SHA, el clon limpio y no superficial, las versiones y las
  dependencias instaladas.
- Resultado de la comprobación de red:
  - con red: `curl -sS --max-time 5 https://registry.npmjs.org/ -o /dev/null` terminó con
    código 0 antes de las ejecuciones 1 a 5;
  - sin red: el mantenedor confirmó expresamente que había desactivado la conectividad externa
    del equipo antes de las ejecuciones 6 a 10. Después, el mismo comando terminó con código 6
    (curl no pudo resolver el nombre del servidor). Las dos evidencias son distintas: la
    confirmación física acredita la desactivación, y el código de curl solo comprueba que no
    había acceso al registro, sin demostrar por sí solo la desconexión.

| Ejecución | Modo | Código de salida | Ficheros | Pruebas superadas | Pruebas fallidas |
|-----------|------|------------------|----------|-------------------|------------------|
| 1 | Con red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 2 | Con red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 3 | Con red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 4 | Con red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 5 | Con red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 6 | Sin red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 7 | Sin red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 8 | Sin red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 9 | Sin red | 0 | 18 superados de 18 | 840 de 840 | 0 |
| 10 | Sin red | 0 | 18 superados de 18 | 840 de 840 | 0 |

Las diez ejecuciones coinciden en código de salida (0) y en los recuentos de Vitest: 18 ficheros
y 840 pruebas superadas, 0 fallidas. El clon conservó el SHA base y siguió limpio después de
cada una.

---

## SC-006 Cero secretos reales

**Estado**: Superado

> **Transición del 2026-10-06** (ver la cabecera): la comprobación local de este apartado se
> hizo sobre `1fd6da9` y se reutiliza para el SHA base `f809b03`, porque `quality.yml`,
> `security.yml` y `.env.example` son idénticos en `1fd6da9`, `28c58da` y `f809b03`
> (`git diff 1fd6da9 f809b03 -- .github .env.example` no muestra diferencias) y la
> comprobación no ejecuta dependencias. Los enlaces a la serie de SC-004 son los del SHA
> base. No se ha repetido la comprobación local.

**Entorno**: macOS arm64 de referencia y workflows del SHA base.
**Momento**: antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente.

**Superado** si ninguna comprobación muestra un secreto real ni una credencial pasada a código
del repositorio.

- SHA de la comprobación local: `1fd6da9b8e6b02405987025507443d468192bada`, base de las
  mediciones conservadas, el 2026-10-04 en el macOS arm64 de referencia. Se reutilizó para
  `28c58da1bcbf11df33fae5e26b77e1a8f9ea3966`, entonces SHA base, según la regla de la cabecera:
  entre ambos commits solo cambian ocho rutas documentales, y ninguno de los ficheros que esta
  comprobación ejecuta o revisa.
- Confirmación de clon completo: clon nuevo del repositorio, distinto del de SC-002, sin
  `--depth`, filtros parciales ni alternates, fijado al SHA base. `git rev-parse
  --is-shallow-repository` devuelve `false` y `git status --porcelain` está vacío antes y
  después de las comprobaciones (el fichero copiado está ignorado por Git).
- Salida de `diff .env.example .env.development.local`: vacía, código de salida 0, tras
  `cp .env.example .env.development.local` (código 0).
- Salida de `grep -rnE 'secrets\.|github\.token|GITHUB_TOKEN|GH_TOKEN' .github/workflows`: vacía,
  código de salida 1 (sin coincidencias; no es el código 2 de error).
- Nota de la revisión visual: leídos completos `quality.yml` y `security.yml` del SHA base.
  - **Expresiones**: las únicas `${{ }}` están en `concurrency` y usan `github.workflow`,
    `github.event_name`, el número del pull request y `github.run_id`. Ningún `run`, `env` ni
    `with` contiene expresiones. No hay `toJSON(github)` ni accesos indexados al contexto.
  - **Credenciales**: no hay `secrets.*`, entradas `token` ni variables de token. Los nueve jobs
    solo definen `NEXT_TELEMETRY_DISABLED`, `AULANORMA_LOG_LEVEL` y `AULANORMA_ENVIRONMENT`,
    con valores sintéticos. Los pasos `run` son `npm ci`, `npm run tools:install` y los
    `npm run check:*`; ninguno recibe una credencial.
  - **Permisos**: `permissions: {}` global y solo `contents: read` en cada job.
  - **`persist-credentials`**: `false` en los nueve `actions/checkout`. Las 18 referencias a
    acciones están fijadas por SHA completo.
  - Disparadores: `pull_request` y `push` hacia `main`, y `schedule` semanal en `security`; no
    hay `pull_request_target` ni `workflow_run`.
  - Los dos workflows y `.env.example` no cambian respecto a la base anterior; la revisión se
    hizo de nuevo sobre esta base.
- Contenido de las claves de `.env.example`: solo `AULANORMA_LOG_LEVEL` y
  `AULANORMA_ENVIRONMENT`, con valores de ejemplo ficticios, válidos y que no son secretos.
- Enlaces a las ejecuciones de SC-004 sobre el SHA base,
  `f809b03262d9acc68e72f86f9da6807d4256649a`, con los nueve jobs en success en cada una (T079,
  2026-10-06):
  - intento 1, [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/attempts/1) y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/attempts/1);
  - intento 2, [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/attempts/2) y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/attempts/2);
  - intento 3, [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218233/attempts/3) y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/attempts/3).

  Son ejecuciones de los workflows revisados.
- Enlaces a las ejecuciones de SC-004 sobre la base anterior,
  `28c58da1bcbf11df33fae5e26b77e1a8f9ea3966`, con los nueve jobs en success en cada una (T079,
  2026-10-05):
  - intento 1, [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/attempts/1) y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/attempts/1);
  - intento 2, [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/attempts/2) y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/attempts/2);
  - intento 3, [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255817/attempts/3) y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/attempts/3).

  Son ejecuciones de los workflows revisados: `quality.yml`, `security.yml` y `.env.example`
  son idénticos en `1fd6da9` y en `28c58da`.
- Enlaces de la serie anterior, sobre `1fd6da9b8e6b02405987025507443d468192bada`, con los nueve
  jobs en success en cada uno (T079, 2026-10-04):
  - intento 1, [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/attempts/1) y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/attempts/1);
  - intento 2, [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/attempts/2) y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/attempts/2);
  - intento 3, [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028387/attempts/3) y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/attempts/3).

  La primera ejecución satisfactoria de `main` pertenece a SC-004, donde consta; no es un
  requisito de este criterio, que se evaluó antes de integrar.

---

## SC-007 Historial sin secretos

**Estado**: Superado

**Entorno**: macOS arm64 de referencia con Node.js 24.21.0 y job `secrets` en `ubuntu-24.04`.
**Momento**: antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente, y confirmación
con la primera ejecución satisfactoria de `main`.

**Superado** si hay cero hallazgos no justificados.

- SHA: `f809b03262d9acc68e72f86f9da6807d4256649a` (SHA base). Ejecución local del 2026-10-06 en
  el macOS arm64 de referencia (macOS 27.0.1, arm64 nativo), con Node.js `v24.21.0` y npm
  11.19.0; caché, registros de npm y `TMPDIR` aislados fuera del clon.
  - `npm run check:secrets` se ejecutó una vez y terminó con código 0, en 1 s.
  - Preparación: solo `npm run tools:install` (código 0, 2 s), que instaló y verificó Gitleaks
    8.30.1 (instala también zizmor, que este control no usa). El SHA-256 del binario instalado
    figura en `scripts/tools/tools.lock.json`.
  - No se ejecutó `npm ci`: el envoltorio solo importa módulos de Node.js, igual que en el job
    de CI. El clon no tuvo `node_modules` en ningún momento.
- Confirmación de clon completo: clon nuevo del repositorio remoto, distinto de los de SC-002 y
  SC-003, sin `--depth`, filtros parciales ni alternates. `git rev-parse
  --is-shallow-repository` devuelve `false`, y `git status --porcelain` está vacío antes y
  después de cada ejecución, con HEAD sin cambios.
- Los tres resultados siguientes se obtuvieron por separado; ninguna cifra se ha deducido de
  otra:
  - **Envoltorio** (`npm run check:secrets`): código 0. No imprime N: solo lee de Gitleaks la
    línea "N commits scanned." y falla si N no está entre 1 y el número de commits
    alcanzables. Su salida: "Excepciones de secretos vigentes: 0." y los tres análisis:
    - historial alcanzable desde HEAD: sin hallazgos;
    - índice de Git: sin hallazgos (índice sin cambios preparados, en un clon limpio);
    - árbol de trabajo: 0 ficheros modificados o nuevos, sin hallazgos.
  - **Medición adicional de Gitleaks** (2026-10-06, mismo clon, una única ejecución): 38 commits
    examinados.
    - El mismo binario de Gitleaks 8.30.1 que instaló y verificó `npm run tools:install`,
      ejecutado desde una copia externa al clon con el mismo SHA-256.
    - Los argumentos del envoltorio para el análisis de historial:
      `git --log-opts="--full-history HEAD" .`, informe redactado y en JSON en un temporal
      externo, nivel de registro `info`, sin color ni cabecera, sin comentarios
      `gitleaks:allow` y con el código 10 reservado para hallazgos.
    - La configuración del envoltorio: una copia del `.gitleaksignore` del SHA base y ningún
      `.gitleaks.toml` en el repositorio.
    - El tratamiento del entorno del envoltorio: el entorno de la sesión sin variables
      `GITLEAKS_*` ni de ubicación de Git.
    - Resultado: código 0, en 1 s, la línea "38 commits scanned.", ninguna línea de error en
      el registro y ningún hallazgo en el informe.
    - No se repitieron el envoltorio ni los análisis del índice y del árbol de trabajo.
  - **Recuento de Git** (`git rev-list --count HEAD`): 38 commits alcanzables desde el SHA base.
  - Las dos cifras coinciden en esta medición.
- Resultado sin hallazgos, o lista de hallazgos exceptuados con su entrada en el registro
  estructurado: sin hallazgos y sin excepciones vigentes.
- Enlace al job `secrets` del pull request: evidencia de integración continua de T071, distinta
  de la ejecución local:
  [secrets 112130779136](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37421218270/job/112130779136),
  ejecución `security` 37421218270, intento 1, sobre el SHA base, con conclusión success.
- Enlace al job `secrets` de la primera ejecución satisfactoria de `main`:
  [secrets 112492206388](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698946/job/112492206388),
  ejecución `security` 37528698946, evento `push`, intento 1, sobre
  `5ca3b16c10f0df943453f8e696cd521642608213`, con conclusión success en 9 s.
  - Su registro muestra "Excepciones de secretos vigentes: 0." y "check:secrets: sin hallazgos
    no exceptuados.".
  - El registro no imprime cuántos commits examinó Gitleaks, así que aquí no se registra
    ninguna cifra. El envoltorio falla si ese número no está entre 1 y los commits
    alcanzables, y el job terminó con éxito.
  - El historial que analiza es el de `main`, distinto del de la rama de la funcionalidad:
    la integración fue un squash, y los commits de la rama no son alcanzables desde `main`.
    Los 38 commits de la medición local corresponden al SHA base, no a `main`.

Parte local completada sobre el SHA base `f809b03` (T076, 2026-10-06) y confirmación en
`main` obtenida en la primera ejecución satisfactoria (T083, 2026-10-06), las dos sin
hallazgos.

### Medición anterior sobre `28c58da`

Se conserva como evidencia de esa base; no acredita la vigente, cuyo historial alcanzable
tiene tres commits más.

- SHA: `28c58da1bcbf11df33fae5e26b77e1a8f9ea3966` (entonces SHA base). Ejecución local del
  2026-10-05 en
  el macOS arm64 de referencia (macOS 27.0.1, arm64 nativo), con Node.js `v24.21.0` y npm
  11.19.0; caché, registros de npm y `TMPDIR` aislados fuera del clon.
  - `npm run check:secrets` se ejecutó una vez y terminó con código 0, en 1 s.
  - Preparación: solo `npm run tools:install` (código 0, 2 s), que instaló y verificó Gitleaks
    8.30.1 (instala también zizmor, que este control no usa). El SHA-256 del binario instalado
    figura en `scripts/tools/tools.lock.json`.
  - No se ejecutó `npm ci`: el envoltorio solo importa módulos de Node.js, igual que en el job
    de CI. El clon no tuvo `node_modules` en ningún momento.
- Confirmación de clon completo: clon nuevo del repositorio remoto, sin reutilizar ningún otro
  clon, sin `--depth`, filtros parciales ni alternates. `git rev-parse
  --is-shallow-repository` devuelve `false`, y `git status --porcelain` está vacío antes y
  después de cada ejecución, con HEAD sin cambios.
- Los tres resultados siguientes se obtuvieron por separado; ninguna cifra se ha deducido de
  otra:
  - **Envoltorio** (`npm run check:secrets`): código 0. No imprime N: solo lee de Gitleaks la
    línea "N commits scanned." y falla si N no está entre 1 y el número de commits
    alcanzables. Su salida: "Excepciones de secretos vigentes: 0." y los tres análisis:
    - historial alcanzable desde HEAD: sin hallazgos;
    - índice de Git: sin hallazgos (índice sin cambios preparados, en un clon limpio);
    - árbol de trabajo: 0 ficheros modificados o nuevos, sin hallazgos.
  - **Medición adicional de Gitleaks** (2026-10-05, mismo clon, una única ejecución): 35 commits
    examinados.
    - El mismo binario de Gitleaks 8.30.1 que instaló y verificó `npm run tools:install`,
      ejecutado desde una copia externa al clon con el mismo SHA-256.
    - Los argumentos del envoltorio para el análisis de historial:
      `git --log-opts="--full-history HEAD" .`, informe redactado y en JSON en un temporal
      externo, nivel de registro `info`, sin color ni cabecera, sin comentarios
      `gitleaks:allow` y con el código 10 reservado para hallazgos.
    - La configuración del envoltorio: una copia del `.gitleaksignore` del SHA base y ningún
      `.gitleaks.toml` en el repositorio.
    - El tratamiento del entorno del envoltorio: el entorno de la sesión sin variables
      `GITLEAKS_*` ni de ubicación de Git.
    - Resultado: código 0, en menos de 1 s, la línea "35 commits scanned.", ninguna línea de
      error en el registro y ningún hallazgo en el informe.
    - No se repitieron el envoltorio ni los análisis del índice y del árbol de trabajo.
  - **Recuento de Git** (`git rev-list --count HEAD`): 35 commits alcanzables desde el SHA base.
  - Las dos cifras coinciden en esta medición.
- Resultado sin hallazgos, o lista de hallazgos exceptuados con su entrada en el registro
  estructurado: sin hallazgos y sin excepciones vigentes.
- Enlace al job `secrets` del pull request: evidencia de integración continua de T071, distinta
  de la ejecución local:
  [secrets 111650756073](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37275255796/job/111650756073),
  ejecución `security` 37275255796, intento 1, sobre `28c58da`, con conclusión success.

### Medición anterior sobre `1fd6da9`

Se conserva como evidencia de la base anterior de las mediciones; no acredita `28c58da`,
cuyo historial alcanzable tiene dos commits más, ni la nueva base.

- SHA: `1fd6da9b8e6b02405987025507443d468192bada` (entonces SHA base). Ejecución local del
  2026-10-04 en el macOS arm64 de referencia (macOS 27.0.1, arm64 nativo), con Node.js
  `v24.21.0`; caché,
  registros de npm y `TMPDIR` aislados fuera del clon.
  - `npm run check:secrets` se ejecutó una vez y terminó con código 0.
  - Preparación: solo `npm run tools:install` (código 0), que instaló y verificó Gitleaks 8.30.1
    (instala también zizmor, que este control no usa).
  - No se ejecutó `npm ci`: el envoltorio solo importa módulos de Node.js, igual que en el job
    de CI.
- Confirmación de clon completo: clon nuevo del repositorio, distinto de los demás
  procedimientos, sin `--depth`, filtros parciales ni alternates. `git rev-parse
  --is-shallow-repository` devuelve `false`, y `git status --porcelain` está vacío antes y
  después de la ejecución, con HEAD sin cambios.
- `git rev-list --count HEAD`: 33 commits alcanzables desde el SHA base.
- Número de commits que Gitleaks informa haber examinado: 33, obtenido en una medición adicional,
  no en la ejecución original.
  - Ejecución original del envoltorio: no imprimió N. Solo lee de Gitleaks la línea "N commits
    scanned." y falla si N no está entre 1 y el número de commits alcanzables; terminó con
    código 0.
  - Medición adicional del 2026-10-04, en el mismo clon:
    - El mismo binario de Gitleaks 8.30.1 que instaló y verificó `npm run tools:install`.
    - Una única ejecución directa del análisis de historial, con el alcance del envoltorio:
      `git --log-opts="--full-history HEAD" .`, informe redactado y en JSON, nivel de registro
      `info`, sin comentarios `gitleaks:allow`, con una copia del `.gitleaksignore` del SHA
      base y sin `.gitleaks.toml`.
    - Diferencias respecto al envoltorio: el código reservado para hallazgos fue 1 en lugar
      de 10, y el entorno se redujo a `PATH`, `HOME` y `TMPDIR`, sin variables `GITLEAKS_*` ni
      de ubicación de Git. Ninguna cambia el alcance del análisis.
    - Resultado: código 0, la línea "33 commits scanned." y ningún hallazgo en el informe.
    - No se repitieron el envoltorio ni los análisis del índice y del árbol de trabajo.
  - Los 33 commits examinados que informa Gitleaks y los 33 commits alcanzables de
    `git rev-list --count HEAD` se obtuvieron por separado. Coinciden en esta medición, pero no
    se ha deducido una cifra de la otra.
- Resultado sin hallazgos, o lista de hallazgos exceptuados con su entrada en el registro
  estructurado: sin hallazgos. "Excepciones de secretos vigentes: 0." Los tres análisis:
  - historial alcanzable desde HEAD: sin hallazgos;
  - índice de Git: sin hallazgos (índice sin cambios preparados, en un clon limpio);
  - árbol de trabajo: 0 ficheros modificados o nuevos, sin hallazgos.
- Enlace al job `secrets` del pull request: evidencia de integración continua de T071, distinta
  de la ejecución local:
  [secrets 111370544887](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37180028381/job/111370544887),
  ejecución `security` 37180028381, intento 1, sobre `1fd6da9`, con conclusión success.

---

## SC-008 Comprensión de la documentación

**Estado**: Pendiente

**Entorno**: cualquier equipo; no hace falta ejecutar nada.
**Alcance**: validación empírica aplazada, fuera de la aceptación obligatoria de esta entrega.
**Momento**: cuando exista una persona externa y, si la misma persona ejecuta ambos, después de
SC-001. Hasta entonces SC-008 queda Pendiente y sin evidencia, y no bloquea la integración.

**Superado** solo con los trece correctos y sin ayuda.

**Comprobación no realizada** (decisión del mantenedor, 2026-10-04):

- No hay participante externo disponible para T080. Nadie ajeno a la implementación ha
  respondido el cuestionario.
- El mantenedor ha decidido continuar la entrega sin esta comprobación y aplazarla. Esa
  decisión no equivale a que el criterio esté superado: SC-008 sigue Pendiente.
- **No existe evidencia empírica** de que un tercero identifique las cuatro capas y los nueve
  controles leyendo solo la documentación.
- Ni el autor ni un agente se han usado como sustitutos del participante. Los campos y la tabla
  siguientes quedan vacíos: no se registran respuestas ni valoraciones que no se han obtenido.

- Seudónimo no reidentificable:
- Declaración de que no participó en la implementación:
- Fecha:
- SHA de la documentación leída:

| Elemento | Respuesta literal | Resultado |
|----------|-------------------|-----------|
| Capa 1 (ubicación y responsabilidad) | | |
| Capa 2 (ubicación y responsabilidad) | | |
| Capa 3 (ubicación y responsabilidad) | | |
| Capa 4 (ubicación y responsabilidad) | | |
| Control 1 (nombre exacto) | | |
| Control 2 (nombre exacto) | | |
| Control 3 (nombre exacto) | | |
| Control 4 (nombre exacto) | | |
| Control 5 (nombre exacto) | | |
| Control 6 (nombre exacto) | | |
| Control 7 (nombre exacto) | | |
| Control 8 (nombre exacto) | | |
| Control 9 (nombre exacto) | | |

---

## SC-009 Controles requeridos en `main`

**Estado**: Pendiente

**Entorno**: configuración del repositorio en GitHub, con un mantenedor con permisos.
**Momento**: inmediatamente después de la primera ejecución satisfactoria de `main`. La
congelación termina al quedar activados los nueve controles; la evidencia se registra en el
primer pull request posterior.

- SHA de la primera ejecución satisfactoria: `5ca3b16c10f0df943453f8e696cd521642608213`.
- Fecha y hora final de la primera ejecución satisfactoria: 2026-10-06T20:46:26Z. Es el inicio
  de la congelación.
- Fecha y hora de activación (y `updated_at` si es un ruleset): 2026-10-06T20:51:36Z, hora en
  la que se releyó la protección desde la API justo después de aplicarla (T084). Es el fin
  de la congelación. La regla es una regla clásica de protección de rama, no un ruleset.
- Enlace a esa ejecución:
  [`quality` 37528698987](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698987)
  y
  [`security` 37528698946](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37528698946).
- Extracto de la respuesta que muestra los nueve nombres exactos como requeridos, sin actores
  con permiso de elusión y con los administradores sujetos a la regla. Resultado de la
  consulta de verificación de `docs/engineering/branch-protection.md`:

  ```json
  {"bypass":null,"checks":[{"app_id":15368,"context":"format"},{"app_id":15368,"context":"lint"},
  {"app_id":15368,"context":"types"},{"app_id":15368,"context":"test"},
  {"app_id":15368,"context":"build"},{"app_id":15368,"context":"macos-quality"},
  {"app_id":15368,"context":"secrets"},{"app_id":15368,"context":"dependencies"},
  {"app_id":15368,"context":"workflows"}],"enforce_admins":true,"force_pushes":false,"strict":true}
  ```

  - El identificador 15368 es el de la aplicación GitHub Actions, el mismo que informó los
    nueve controles en la primera ejecución satisfactoria.
  - El resto de la regla no cambió: comparadas campo a campo, la configuración anterior y la
    posterior son idénticas salvo el bloque de controles requeridos. Siguen el pull request
    obligatorio con 0 aprobaciones, el historial lineal, la resolución de conversaciones y
    la prohibición de borrar la rama; no hay restricciones de push ni rulesets.
  - No se añadieron controles de Dependabot ni excepciones.
- Lista de commits de `main` que demuestra que no hubo integraciones desde esa primera ejecución
  satisfactoria hasta la activación. Salida de
  `git log --first-parent --format='%H %cI %s' origin/main` después de la activación, en sus
  dos primeras líneas:

  ```text
  5ca3b16c10f0df943453f8e696cd521642608213 2026-10-06T22:44:10+02:00 feat: establish engineering baseline (#3)
  c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544 2026-09-26T10:42:54+02:00 docs: amend constitution to v1.1.0 (#2)
  ```

  El commit más reciente es el de la integración, anterior al inicio de la congelación.
  Ningún pull request se integró entre las 20:46:26Z y las 20:51:36Z.
- Integraciones correctivas anteriores, registradas como antecedentes y no como excepciones a
  la congelación: ninguna.
- Al recibir `main` su configuración, Dependabot abrió cuatro pull requests (#19 a #22). No
  se integró ninguno durante la congelación.

Activación completada y verificada. **SC-009 sigue Pendiente** hasta comprobar en el primer
pull request posterior a la activación (T089) que los nueve controles aparecen como
requeridos y que la integración queda bloqueada mientras no estén en verde.

---

## Evidencia de FR-006 C6 y FR-009 sobre la implementación real

**Estado**: Superado

> **Transición del 2026-10-06** (ver la cabecera): repetido sobre el SHA base `f809b03` el
> 2026-10-06, en el clon de SC-002 (T073). La entrada anterior, sobre `1fd6da9`, se conserva
> debajo de la nueva y no acredita la base vigente.

No es un criterio SC adicional, pero forma parte de la aceptación de la puerta 5. Se obtiene en
el clon de SC-002, con Node.js 24.21.0, las dependencias aprobadas, el preflight y la
configuración real: `npm run check:build` ejecuta la matriz negativa por TCP crudo, la
equivalencia entre desarrollo y producción y la auditoría de registros sobre el SHA base.

- SHA: `f809b03262d9acc68e72f86f9da6807d4256649a` (SHA base), en el clon de SC-002, ejecución del
  2026-10-06, con `node --version` en `v24.21.0`. `npm run check:build` terminó con código 0
  dos veces: una como categoría y otra dentro del agregado. Son ejecuciones nuevas sobre esta
  base; no se reutiliza ninguna anterior ni la validación previa de la candidata.
  - **Resultados observados**: cada salida mostró "Prueba de humo superada: 21 casos.", sin
    ninguna línea `ERR` ni de diagnóstico de la salida capturada, y con `ok` en "npm start:
    matriz negativa por TCP crudo", "npm run dev válido: calentamiento, contrato, destinos y
    Upgrade" y "npm run dev: matriz y equivalencia contractual con npm start". La salida
    identifica la compilación como "Next.js 16.3.6 (Turbopack)".
  - **Recuentos estáticos**: `scripts/smoke-test.mjs` es en esta base el mismo blob de Git que
    en `1fd6da9` (`591a1776d54a36201bd80cb9b4decc9f9aec306f`), comprobado en el clon. Por eso
    valen sin cambios la revisión estática, los números de línea y las tablas que siguen,
    hechos sobre `1fd6da9`. Sobre esta base no se ha vuelto a analizar el fichero ni a contar.
  - **Ceros por aserción**: igual que en la entrada anterior, se establecen mediante las
    aserciones del arnés sobre las respuestas evaluadas, no mediante cifras impresas.
  - Donde las subsecciones siguientes dicen «T073» y «SHA base» al contar ejecuciones, se
    aplican por igual a las dos ejecuciones de `check:build` de esta base.
- **Entrada anterior.** SHA: `1fd6da9b8e6b02405987025507443d468192bada` (entonces SHA base), en
  el clon de SC-002, ejecución del
  2026-10-04. `npm run check:build` terminó con código 0 dos veces: una como categoría y otra
  dentro del agregado. Son ejecuciones nuevas sobre esta base; no se reutiliza ninguna anterior.
- `node --version`: `v24.21.0`.

**Fundamento de Superado**. Se distinguen tres tipos de evidencia:

- **Resultados observados en las ejecuciones nuevas**: `check:build` terminó con código 0 en
  sus dos ejecuciones. Cada salida mostró "Prueba de humo superada: 21 casos." y `ok` en los 21
  casos, entre ellos "npm start: matriz negativa por TCP crudo", "npm run dev válido:
  calentamiento, contrato, destinos y Upgrade" y "npm run dev: matriz y equivalencia contractual
  con npm start". No apareció ninguna línea de diagnóstico de la salida capturada.
- **Recuentos estáticos revisados**: la salida no imprime recuentos. Proceden de la revisión
  del arnés, `scripts/smoke-test.mjs`, contrastada con esta base:
  - el fichero es idéntico al de la base anterior (mismo blob de Git,
    `591a1776d54a36201bd80cb9b4decc9f9aec306f`), así que la matriz no cambió;
  - sobre esta base se volvió a comprobar, analizando el fichero, que `WIRE_CASES` ocupa las
    líneas 1404–1864 y tiene 55 entradas literales, 11 destinos generados y las 21 entradas de
    `FRAMEWORK_CASES` (líneas 1345–1367): 87 casos;
  - `runWireMatrix` (líneas 1923–1941) recorre toda la lista sin saltos condicionales y añade
    un problema si se registra algo durante la matriz; `wireStart` (línea 2177) y
    `developmentEquivalence` (línea 2534) informan de un problema si el servidor no arranca; una
    interrupción o un error inesperado impiden el mensaje "superada" (`main`, línea 2815);
  - los totales de peticiones, conexiones y respuestas evaluadas son los de la revisión
    estática del mismo fichero; sobre esta base no se han vuelto a contar una a una.
- **Ceros por aserción**: los cuatro ceros se establecen mediante las aserciones aplicadas a
  las respuestas evaluadas, no mediante cifras impresas.

En esta base `npm run dev` compila con Webpack y `next build` conserva su compilador por
defecto; la salida de `check:build` identifica la compilación como "Next.js 16.3.6
(Turbopack)". El compilador de desarrollo no aparece en la salida: lo fija el código de la base.

### Matriz negativa

Recuento estático de `scripts/smoke-test.mjs` en el SHA base. Un caso es una entrada de
`WIRE_CASES` (líneas 1404–1864). Una petición es cada petición HTTP enviada, incluidas las
canalizadas y las mal formadas.

| Grupo | Líneas | Casos | Peticiones | Respuestas evaluadas |
|-------|--------|-------|------------|----------------------|
| Versión | 1405–1476 | 11 | 11 | 11 |
| `Host` | 1477–1550 | 10 | 10 | 10 |
| Cuerpo y framing | 1551–1626 | 9 | 9 | 9 |
| `Expect` | 1627–1670 | 5 | 5 | 5 |
| `CONNECT` | 1671–1718 | 2 | 2 | 2 |
| `Upgrade` | 1671–1718 | 4 | 4 | 4 |
| Destino (11 generados y `OPTIONS *`) | 1719–1747 | 12 | 12 | 12 |
| Método | 1748–1794 | 6 | 6 | 6 |
| Cabeceras de control del framework (`FRAMEWORK_CASES`, líneas 1345–1367, y `frameworkCase`, línea 1369) | 1795–1796 | 21 | 21 | 21 |
| Canalización (4, 3, 3, 2, 2 y 3 peticiones) | 1797–1856 | 6 | 17 | 14 |
| Canalización: descarte con reinicio del cliente | 1857–1863 | 1 | 3 | 1 |
| **Total por modo** | | **87** | **100** | **95** |

- **Número de casos**: 87 por modo. Cada ejecución de `check:build` recorre la matriz en
  producción (`npm start`) y en desarrollo (`npm run dev`): 174 casos. En T073, `check:build`
  se ejecutó dos veces (como categoría y dentro del agregado): dos repeticiones de la misma
  matriz, 348 casos en total.
- **Número de peticiones**: 100 peticiones HTTP por modo, en 88 conexiones TCP, con 95
  respuestas evaluadas. Son 200 peticiones por ejecución de `check:build` y 400 en las dos de
  T073.
  - **Peticiones sin respuesta esperada**: 5 de las 100. Son las que siguen a un rechazo en una
    canalización, en las que el arnés exige que no haya respuesta, y las 2 de la conexión que
    el cliente reinicia.
  - **Caso de descarte** (línea 1867, `runWireCase`): envía una petición válida y bytes mal
    formados, reinicia la conexión y comprueba el servicio con un `GET` en una conexión nueva.
    La conexión reiniciada no se lee, por diseño, y solo se evalúa la respuesta del `GET`.
- **Fuera de este recuento**:
  - las otras 38 peticiones de la prueba de humo por ejecución de `check:build`: contrato,
    métodos y destinos de `npm start`; destinos y `Upgrade` de desarrollo; los cuatro casos de
    `NODE_ENV` heredado y los cuatro calentamientos de desarrollo;
  - las sondas de puerto, que abren conexiones TCP sin enviar HTTP y cuyo número depende de la
    temporización.
- Respuestas HTML servidas (debe ser 0): 0 entre las 95 respuestas evaluadas por modo, por
  aserción. Cada respuesta de la matriz se rechaza si contiene HTML (`wireResponseProblems`,
  línea 1209), y la del `GET` del caso de descarte debe ser el JSON exacto del contrato
  (`getProblems`, línea 980).
- Cabeceras del framework (debe ser 0): 0 entre las 95 respuestas evaluadas por modo, por
  aserción. Cada una se compara con un conjunto cerrado de cabeceras que excluye las del
  framework, `ETag`, `Server`, `X-Powered-By` y cualquier `Vary` distinta de `Accept-Encoding`.
- Redirecciones (debe ser 0): 0 entre las 95 respuestas evaluadas por modo, por aserción. Los
  estados admitidos son 200, 204, 400, 404, 405 y 505, y `Location` y `Refresh` quedan fuera del
  conjunto cerrado de cabeceras.
- Errores 500 inesperados (debe ser 0): 0 entre las 95 respuestas evaluadas por modo, por
  aserción: cualquier 500 es un fallo.
- No se afirma nada sobre las respuestas que no se leen: las de la conexión reiniciada.

### Equivalencia entre modos

- Resultado de la equivalencia entre desarrollo y producción: superada en las dos ejecuciones.
  El caso "npm run dev: matriz y equivalencia contractual con npm start" compara, caso a caso,
  los estados, las cabeceras (salvo `Date`), los cuerpos y el cierre de cada respuesta con los
  de producción, y terminó en `ok`. Los 87 casos tienen claves únicas, así que se comparan
  todos; si a uno le faltara su resultado de producción, el caso fallaría.

### Auditoría de registros

- Resultado de la auditoría: superada en las dos ejecuciones. Los casos de arranque válido y de
  matriz terminaron en `ok`; fallan si se registra algo durante la matriz o por las consultas,
  si los registros de arranque no son exactamente los esperados o si la salida contiene rutas o
  valores filtrados. No apareció ninguna línea de diagnóstico de la salida capturada.

---

## Registro de la incidencia de la prueba de humo

No es un criterio de aceptación ni acredita ningún estado. Reúne los antecedentes del fallo
intermitente del job `build` y de su corrección, para que la nueva base no dependa de la memoria
de quienes lo investigaron.

### Apariciones sin firma

Son anteriores a la identificación por firmas. No se atribuyen al mensaje identificado después.

- **Commit `a77f53ce3c07b6af829996c3509dc6a65f8341c9`** (2026-09-30): el job
  [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/36781118221/job/110111330216)
  de la ejecución `quality` 36781118221, intento 1, falló en el caso 20 de la prueba de humo.
  Los otros cinco jobs de `quality` y la ejecución `security` 36781118300 terminaron en success.
  La instrumentación de diagnóstico todavía no existía: no hay datos de las líneas rechazadas.
- **Commit `d71497b`** (2026-10-01), que añadió el diagnóstico seguro de la salida: el job
  `build` terminó en success en los cinco intentos de la ejecución
  [`quality` 36850185368](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/36850185368).
  El fallo no reapareció.
- **Commit `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216`** (2026-10-02): los nueve controles
  terminaron en success en la ejecución que fijó la base anterior (ver la cabecera histórica).
- **Pull request [#4](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/4)**
  (2026-10-03, rama `negative-test/format`): fallo no previsto del job `build` en el caso 21,
  con dos líneas de stderr no admitidas, de categorías `next-aviso` (con ruta absoluta) y
  `texto-desconocido`, recibidas antes de `startup.completed`. El diagnóstico aún no incluía
  firmas. Los datos completos están en la sección histórica de SC-003.

### Identificación en el pull request #5

Pull request [#5](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/5), de
diagnóstico, cerrado sin integrar el 2026-10-03. Rama `diagnostic/smoke-signatures`, eliminada.

- **Commit de origen**: `90d4fc1174dde38dcb929bba60be1243b6d58356`, con padre único
  `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216`. Añade al diagnóstico las firmas `slow-filesystem` y
  `slow-filesystem-ver-mas`; no cambia las líneas admitidas ni las aserciones.
- **Merge provisional analizado**: `23ff66795d18bcb9679e0d836ae4912cde4ebf2b`, con padres
  `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544` (`main`) y el commit de origen.
- **Ejecuciones**: [`quality` 37102638093](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37102638093),
  intentos 1 a 5, y [`security` 37102638198](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37102638198),
  intento 1. En el intento 1 los nueve controles terminaron en success. En los intentos 2 a 5
  solo se ejecutó `build`; los demás jobs de `quality` conservaron el resultado del intento 1.

| Intento | Job `build` | Conclusión | Prueba de humo |
|---------|-------------|------------|----------------|
| 1 | [111145037987](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37102638093/job/111145037987) | success | 21 casos superados |
| 2 | [111145439554](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37102638093/job/111145439554) | success | 21 casos superados |
| 3 | [111145652266](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37102638093/job/111145652266) | success | 21 casos superados |
| 4 | [111145862060](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37102638093/job/111145862060) | success | 21 casos superados |
| 5 | [111146072572](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37102638093/job/111146072572) | failure | 1 fallo, en el caso 18 |

- **Caso fallido**: el 18, "npm run dev válido: calentamiento, contrato, destinos y Upgrade".
  Los otros 20 casos y la integridad del repositorio original terminaron en `ok`. Problemas de
  la auditoría de registros: hay líneas después de `startup.completed` y la salida contiene
  una ruta absoluta.
- **Diagnóstico seguro del caso 18**:
  - stdout: 6 líneas en 3 fragmentos; stderr: 2 líneas en 1 fragmento; `startup.completed` en
    stdout:6; 2 líneas no admitidas y ninguna omitida;
  - stderr, línea 1: categoría `next-aviso`, con ruta absoluta, firma `slow-filesystem`,
    recibida después de `startup.completed`;
  - stderr, línea 2: categoría `texto-desconocido`, sin ruta absoluta, firma
    `slow-filesystem-ver-mas`, recibida después de `startup.completed`;
  - ninguna línea truncada, sin salto final ni empalmada; el orden de emisión entre flujos no
    es determinable.
- **Qué identifica**: las dos firmas corresponden al aviso de sistema de archivos lento que
  Turbopack emite en el arranque de desarrollo. Identifican el mensaje; no demuestran la causa
  de la lentitud ni una relación con la persistencia de la caché.

### Candidata validada en el pull request #6

Pull request [#6](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/6), de
diagnóstico, cerrado sin integrar el 2026-10-03. Rama `diagnostic/smoke-webpack`, eliminada.

- **Commit de origen**: `63482f3b1daae9deefb0bf562797c3311fc624eb`, con padre único
  `90d4fc1174dde38dcb929bba60be1243b6d58356`.
- **Corrección**: `npm run dev` usa Webpack. `server.mjs` pasa `webpack: true` a `next()` solo
  en desarrollo y el script `dev` fija vacías `TURBOPACK`, `IS_TURBOPACK_TEST` y `NEXT_RSPACK`
  en el preflight y en el servidor. `npm start`, `next build` y la prueba de humo no cambian
  (research.md, R8).
- **Validación local** (2026-10-03, macOS arm64, Node.js 24.21.0, npm 11.19.0): con los tres
  selectores vacíos y `webpack: true` se cargó el compilador de Webpack, y no Turbopack ni
  Rspack, con los selectores ausentes, heredados con un valor activador y definidos en
  `.env.development.local`. Una ejecución de `npm run check` terminó con código 0, 18 ficheros
  y 840 pruebas superadas y "Prueba de humo superada: 21 casos.".
- **Merge provisional analizado**: `77599524b17cf718a4c6646d4b486ce8d243ded6`, con padres
  `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544` (`main`) y el commit de origen.
- **Ejecuciones**: [`quality` 37141145208](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37141145208)
  y [`security` 37141145241](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37141145241),
  evento `pull_request`, intento 1, sin relanzamientos. Los nueve controles terminaron en
  success.
  - [`test`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37141145208/job/111255664805)
    (`ubuntu-24.04`): 18 ficheros y 840 pruebas superadas.
  - [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37141145208/job/111255664802)
    (`ubuntu-24.04`): "Prueba de humo superada: 21 casos.".
  - [`macos-quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37141145208/job/111255664806)
    (`macos-26`): 18 ficheros y 840 pruebas superadas y "Prueba de humo superada: 21 casos.".
  - Ninguna línea de diagnóstico ni aparición del aviso en esos tres registros.

### Límites de este registro

- Las apariciones sin firma no se atribuyen retrospectivamente al mensaje identificado en el
  pull request #5. La de `a77f53c` no tiene diagnóstico, y la del pull request #4 comparte
  las categorías de las dos líneas, pero no lleva firma.
- El fallo apareció en los casos 20, 21 y 18, y las líneas se recibieron antes de
  `startup.completed` en el pull request #4 y después en el #5.
- La validación del pull request #6 es una sola ejecución: no mide la frecuencia del fallo
  anterior, no forma parte de la serie de SC-004 y no acredita la nueva base.
- `node server.mjs` directo no es un punto de entrada admitido y no queda cubierto por la
  corrección.

---

## Evidencia histórica sobre `3101bd5` (base sustituida)

Todo lo que sigue se obtuvo sobre la base anterior,
`3101bd5fc4bfbbb07e6465c125e2730f2dbdd216`, antes de incorporar la corrección del compilador
de desarrollo. Se conserva íntegro como antecedente.
**No acredita la nueva base**: ningún resultado de esta sección cuenta para los diez estados
activos, y cada comprobación debe repetirse sobre el SHA base vigente.

El texto literal de este documento tal como estaba sobre la base anterior se conserva en el
commit `docs: preserve acceptance evidence for 3101bd5`. Aquí solo cambian los encabezados, que
llevan la marca "(histórico)", y la etiqueta de estado, que pasa a "Resultado histórico".

### Cabecera (histórico)

- **SHA base de aceptación anterior**: `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216`.


  **Validación de T071**: los nueve controles concluyeron en success en la primera ejecución del
  evento `pull_request` (intento 1) sobre este commit:
  - commit de origen: el SHA base, `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216`;
  - merge provisional analizado por la integración continua:
    `f73a350c8653f5aa931e054a87daa39b2149fdac`, que no es el SHA base;
  - `main` utilizado: `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544`;
  - ejecuciones: [`quality`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/36895265694)
    y [`security`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/36895264833).

  Esta fijación completa T071. Su casilla en `tasks.md` se marca más adelante, porque cambiar
  ese fichero ahora crearía una nueva base. Esta ejecución se incorporará a la serie de SC-004
  en T079; hasta entonces SC-004 sigue Pendiente.
- **HEAD de evidencia anterior**: no llegó a existir. El texto de entonces decía: "todavía no
  existe. Será un commit posterior que solo modifique este fichero."
- Al sustituirse la base, T071 debe volver a fijarse sobre la nueva; la validación anterior
  queda como antecedente.

### SC-002 Comandos de calidad locales (histórico)

**Resultado histórico sobre `3101bd5`**: Superado. No acredita la nueva base.

**Entorno**: macOS arm64 de referencia con Node.js 24.21.0.
**Momento**: antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente.

**Superado** si todos terminan con código 0 y el agregado tarda menos de 10 minutos.

- SHA: `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216` (SHA base). Ejecución del 2026-10-02 en el
  macOS arm64 de referencia (Apple M3, 8 núcleos, 16 GB, nativo), con macOS 27.0.1 (26A434).
  `reference-environment.md` describe macOS 27.0 (26A428); el equipo y el resto de versiones
  coinciden.
- Confirmación de clon completo: clon nuevo del repositorio, sin `--depth`, filtros parciales ni
  alternates, fijado al SHA base, con `--is-shallow-repository` en `false` y
  `git status --porcelain` vacío antes y después. Sin `node_modules`, `.next` ni `.tools`
  previos; caché, registros de npm y `TMPDIR` aislados fuera del clon.
- `node --version`: `v24.21.0` (npm 11.19.0).
- Código de salida de la preparación (`npm ci` y `npm run tools:install`): 0 y 0. Configuración
  de ejemplo copiada a `.env.development.local` (quickstart, paso 2).

| Comando | Código de salida |
|---------|------------------|
| `npm run check:format` | 0 |
| `npm run check:lint` | 0 |
| `npm run check:types` | 0 |
| `npm run check:test` | 0 |
| `npm run check:build` | 0 |
| `npm run check:secrets` | 0 |
| `npm run check:deps` | 0 |
| `npm run check:workflows` | 0 |
| `npm run check` (agregado) | 0 |

- Tiempo real (`real`) de `time npm run check`: 35,074 s (`0m35.074s`).
- Resumen de su salida: formato correcto; lint sin errores ni avisos; tipos generados y `tsc`
  sin errores; Vitest con 18 de 18 ficheros y 819 de 819 pruebas superadas; compilación correcta
  y "Prueba de humo superada: 21 casos."; secretos sin hallazgos en historial, índice y árbol de
  trabajo; 221 dependencias auditadas, 0 vulnerabilidades altas o críticas sin excepción,
  ninguna media ni baja, firmas y atestaciones verificadas; workflows sin hallazgos. Sin líneas
  `npm warn`, `npm error`, `⚠` ni `⨯`. La compilación de `check:build` partió sin `.next`
  (compilación inicial de 955 ms) y el agregado reutilizó esa compilación (152 ms), como
  establece el procedimiento.

### SC-003 Pruebas negativas (histórico)

**Resultado histórico sobre `3101bd5`**: Pendiente. No acredita la nueva base.

**Entorno**: local en el macOS arm64 de referencia y en Linux x64, ambos con Node.js 24.21.0.
Integración continua: los runners de los workflows.
**Momento**: antes de integrar, cuando los workflows ya se ejecutan en el pull request de la
funcionalidad; las ramas negativas parten del SHA base.

Cada categoría debe fallar por la causa esperada y en la ubicación esperada. El subcaso de
secretos en un fichero ignorado es una prueba de exclusión positiva, no una novena prueba
negativa. En la integración continua, los controles no afectados deben pasar.

#### Local en macOS (histórico)

- SHA: `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216` (SHA base). Ejecución del 2026-10-02 en el
  macOS arm64 de referencia (macOS 27.0.1, 26A434, arm64 nativo), con Node.js `v24.21.0` y
  npm 11.19.0.
  - Clon nuevo, completo (`--is-shallow-repository` en `false`) y limpio, sin `--depth`,
    filtros parciales ni alternates.
  - Caché, registros de npm y `TMPDIR` aislados fuera del clon.
  - Preparación: `npm ci` con código 0 y `npm run tools:install` con código 0 (Gitleaks 8.30.1
    y zizmor 1.30.1 verificados); configuración de ejemplo copiada a `.env.development.local`.
- Salida de `npm run verify:negative` con las ocho categorías, causa y ubicación de cada fallo:

| Categoría | Resultado | Causa | Ubicación | Fallos colaterales |
|-----------|-----------|-------|-----------|--------------------|
| `format` | Falla por la causa esperada | Prettier: `Code style issues found` | `src/platform/version/index.ts` | Ninguno |
| `lint` | Falla por la causa esperada | ESLint: `no-restricted-imports` (`normative-source` importa `@/modules/moodle-publication`) | `src/modules/normative-source/violation.ts:1:1` | Ninguno |
| `types` | Falla por la causa esperada | TypeScript: `TS2322` | `src/platform/version/index.ts:21:14` | Ninguno |
| `test` | Falla por la causa esperada | Vitest: `AssertionError: expected 1 to be 2` | `tests/unit/negative.test.ts > prueba negativa sintética` | Ninguno |
| `build` | Falla por la causa esperada | `next build`: `Error occurred prerendering page "/negative-build"`, con la excepción de su `getStaticProps` | `src/pages/negative-build.tsx` (ruta `/negative-build`) | Ninguno |
| `secrets` (a), historial | Falla por la causa esperada | Gitleaks: regla `github-pat` en el historial alcanzable | `negative-secret.txt:1` (commit de la copia) | Ninguno |
| `secrets` (b), fichero nuevo sin seguimiento | Falla por la causa esperada | Gitleaks: regla `github-pat` en el árbol de trabajo | `negative-secret.txt:1` (sin seguimiento) | Ninguno |
| `secrets` (c), fichero ignorado | Termina con éxito, como se esperaba | Exclusión positiva: el fichero ignorado no se examina | `.env.development.local` (ignorado por `.gitignore`) | Ninguno |
| `dependencies` | Falla por la causa esperada | `npm audit`: gravedad alta sin excepción (GHSA-35jh-r3h4-6jhm y GHSA-r5fr-rjxr-66jc) | Paquete `lodash` 4.17.20, solo en el lockfile de la copia | Ninguno |
| `workflows` | Falla por la causa esperada | zizmor: `template-injection`, gravedad High | `.github/workflows/negative-test.yml:12` | Ninguno |

  Todas las causas y ubicaciones coinciden con las previstas en
  `docs/engineering/quality-controls.md`. Las alteraciones se aplicaron solo en las copias
  temporales del procedimiento y los tokens fueron sintéticos; su valor no aparece en la
  salida.
- Subcaso de exclusión positiva: (c) `check:secrets` termina con éxito porque
  `.env.development.local` está ignorado y no se examina. No es una novena prueba negativa.
- Código de salida: 0, con el mensaje "verify:negative: todas las categorías se comportan como
  se esperaba." (67 s).
- Estado de Git idéntico antes y después (`git status --porcelain` y `git rev-parse HEAD`): sí.
  - `git rev-parse HEAD` devolvió `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216` antes y después.
  - `git status --porcelain` estaba vacío antes y después.
  - El propio procedimiento informó "Repositorio original sin cambios: HEAD, git status y rutas
    ignoradas".
  - Al terminar no quedaron procesos y el puerto 3000 estaba libre.

Parte local en macOS completada. SC-003 sigue Pendiente: falta la parte local en Linux x64
nativo, que no se ha ejecutado, y la de integración continua (T077).

#### Local en Linux x64 (histórico)

- SHA:
- Instalación:
- Configuración aplicada:
- Arranque:
- Respuesta de estado:
- Resultado de los controles aplicables:
- Salida de `npm run verify:negative` con las ocho categorías, causa y ubicación de cada fallo:
- Subcaso de exclusión positiva:
- Código de salida:
- Estado de Git idéntico antes y después (`git status --porcelain` y `git rev-parse HEAD`):

#### Integración continua (histórico)

| Categoría | Pull request cerrado sin integrar | Ejecución | Causa y ubicación | Controles colaterales | Controles no afectados en verde | `macos-quality` (categorías 1 a 5) |
|-----------|-----------------------------------|-----------|-------------------|-----------------------|---------------------------------|------------------------------------|
| `format` | [#4](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/4), cerrado sin integrar el 2026-10-03 | [`quality` 37098642937](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37098642937) y [`security` 37098642942](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37098642942), intento 1 | [`format`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37098642937/job/111133621176): Prettier `Code style issues found`, `[warn] src/platform/version/index.ts` | Previsto: [`lint`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37098642937/job/111133621185), `@typescript-eslint/no-unused-vars` sobre `sample` en `src/platform/version/index.ts:21:8`. **No previsto**: [`build`](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37098642937/job/111133621194), auditoría de registros de la prueba de humo (ver abajo) | `types`, `test`, `secrets`, `dependencies` y `workflows` en success; `build` falló | [Falla](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/37098642937/job/111133621271) en `check:format`, con la misma causa y ubicación |
| `lint` | No ejecutada: lote detenido tras `format` | | | | | |
| `types` | No ejecutada: lote detenido tras `format` | | | | | |
| `test` | No ejecutada: lote detenido tras `format` | | | | | |
| `build` | No ejecutada: lote detenido tras `format` | | | | | |
| `secrets` | No ejecutada: lote detenido tras `format` | | | | | No aplica |
| `dependencies` | No ejecutada: lote detenido tras `format` | | | | | No aplica |
| `workflows` | No ejecutada: lote detenido tras `format` | | | | | No aplica |

**`format`, datos de la ejecución**:

- **Rama y commit**: rama `negative-test/format`, commit `18d9331134c464303b4ea11d9c49d68b21701b5c` con
  padre único el SHA base, mensaje `test: negative-test format` y la alteración documentada.
- **Commit analizado**: merge provisional `611b8e0`, que fusiona ese commit con `main`
  `c2ad0e7de2de5434cd1be7a1d4af4c5e51ce1544`.
- **Fallo no previsto del job `build`**: compilación correcta y "Prueba de humo fallida: 1
  fallos.". El caso fallido es el 21, "npm run dev: matriz y equivalencia contractual con npm
  start"; los otros 20 casos y la integridad del repositorio original terminaron en `ok`. Problemas
  de la auditoría de registros:
  - la salida contiene líneas distintas de la cabecera de npm, la línea informativa de Next.js y
    `startup.completed`;
  - la línea informativa de Next.js no está entre la cabecera de npm y `startup.completed`;
  - la salida contiene una ruta absoluta.
- **Diagnóstico seguro del caso 21**:
  - stdout: 6 líneas; stderr: 2 líneas; `startup.completed` en stdout:6; 2 líneas no admitidas y
    ninguna omitida;
  - stderr, línea 1: categoría `next-aviso`, con ruta absoluta, recibida antes de
    `startup.completed`;
  - stderr, línea 2: categoría `texto-desconocido`, sin ruta absoluta, recibida antes de
    `startup.completed`;
  - ninguna línea truncada, sin salto final ni empalmada; el orden de emisión entre flujos no es
    determinable.
  - Ninguna línea se clasificó como `turbopack-persistencia`.
- **Atribución**: no se atribuye la causa al runner ni a H1 o H2. Es una recurrencia de la
  incidencia abierta de la prueba de humo, que ahora aporta diagnóstico.

Como el fallo no estaba previsto, el lote de T077 se detuvo después de cerrar el pull request de
`format`; las otras siete categorías no se ejecutaron.

- Secretos: autorización de la protección de push, si la hubo, sin el valor del token: no
  aplica todavía (categoría no ejecutada).
- Secretos: cierre de cualquier alerta como dato sintético: no aplica todavía (categoría no
  ejecutada).
- Salida vacía de `git ls-remote --heads origin 'negative-test/*'`: vacía tras eliminar
  `negative-test/format` (2026-10-03).
- Comprobación de que esos commits no son alcanzables desde `main`: `18d9331` no es antecesor
  de `main` (`git merge-base --is-ancestor` devuelve 1). Tras actualizar y podar las referencias,
  ninguna rama remota lo contiene.

### SC-005 Determinismo con y sin red (histórico)

**Resultado histórico sobre `3101bd5`**: Superado. No acredita la nueva base.

**Entorno**: macOS arm64 de referencia con Node.js 24.21.0, tras `npm ci`.
**Momento**: antes de integrar, sobre el SHA base.

**Superado** si las diez terminan con el mismo código de salida y los mismos recuentos.

- SHA: `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216` (SHA base). Clon nuevo, completo y limpio
  (`--is-shallow-repository` en `false`), en el macOS arm64 de referencia, con Node.js
  `v24.21.0`, npm 11.19.0 y `npm ci` terminado con código 0. Las diez ejecuciones son del
  2026-10-02, en el mismo clon y con el mismo entorno; antes de las ejecuciones sin red se
  comprobó de nuevo el SHA, el clon limpio y las versiones.
- Resultado de la comprobación de red:
  - con red: `curl -sS --max-time 5 https://registry.npmjs.org/ -o /dev/null` terminó con
    código 0 antes de las ejecuciones 1 a 5;
  - sin red: el mantenedor confirmó expresamente que había desactivado la conectividad externa
    del equipo antes de las ejecuciones 6 a 10. Después, el mismo comando terminó con código 6
    (curl no pudo resolver el nombre del servidor). Las dos evidencias son distintas: la
    confirmación física acredita la desactivación, y el código de curl solo comprueba que no
    había acceso al registro, sin demostrar por sí solo la desconexión.

| Ejecución | Modo | Código de salida | Ficheros | Pruebas superadas | Pruebas fallidas |
|-----------|------|------------------|----------|-------------------|------------------|
| 1 | Con red | 0 | 18 superados de 18 | 819 de 819 | 0 |
| 2 | Con red | 0 | 18 superados de 18 | 819 de 819 | 0 |
| 3 | Con red | 0 | 18 superados de 18 | 819 de 819 | 0 |
| 4 | Con red | 0 | 18 superados de 18 | 819 de 819 | 0 |
| 5 | Con red | 0 | 18 superados de 18 | 819 de 819 | 0 |
| 6 | Sin red | 0 | 18 superados de 18 | 819 de 819 | 0 |
| 7 | Sin red | 0 | 18 superados de 18 | 819 de 819 | 0 |
| 8 | Sin red | 0 | 18 superados de 18 | 819 de 819 | 0 |
| 9 | Sin red | 0 | 18 superados de 18 | 819 de 819 | 0 |
| 10 | Sin red | 0 | 18 superados de 18 | 819 de 819 | 0 |

Las diez ejecuciones coinciden en código de salida (0) y en los recuentos de Vitest: 18 ficheros
y 819 pruebas superadas, 0 fallidas. El clon conservó el SHA base y siguió limpio durante todas
ellas.

### SC-006 Cero secretos reales (histórico)

**Resultado histórico sobre `3101bd5`**: Pendiente. No acredita la nueva base.

**Entorno**: macOS arm64 de referencia y workflows del SHA base.
**Momento**: antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente.

**Superado** si ninguna comprobación muestra un secreto real ni una credencial pasada a código
del repositorio.

- SHA: `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216` (SHA base). Comprobación local del
  2026-10-02 en el macOS arm64 de referencia.
- Confirmación de clon completo: clon nuevo del repositorio, sin `--depth`, filtros parciales ni
  alternates, fijado al SHA base. `git rev-parse --is-shallow-repository` devuelve `false` y
  `git status --porcelain` está vacío antes y después de las comprobaciones (el fichero copiado
  está ignorado por Git).
- Salida de `diff .env.example .env.development.local`: vacía, código de salida 0.
- Salida de `grep -rnE 'secrets\.|github\.token|GITHUB_TOKEN|GH_TOKEN' .github/workflows`: vacía,
  código de salida 1 (sin coincidencias; no es el código 2 de error).
- Nota de la revisión visual: revisados completos `quality.yml` y `security.yml`. No hay
  `toJSON(github)`, accesos indexados al contexto, `secrets.*` ni entradas `token`. Las únicas
  expresiones `${{ }}` están en `concurrency` y usan `github.workflow`, `github.event_name`, el
  número del pull request y `github.run_id`; ningún `run`, `env` ni `with` contiene expresiones.
  Los nueve jobs solo definen `NEXT_TELEMETRY_DISABLED`, `AULANORMA_LOG_LEVEL` y
  `AULANORMA_ENVIRONMENT`, con valores sintéticos; todos los `actions/checkout` usan
  `persist-credentials: false`, con `permissions: {}` global y `contents: read` por job. No se
  pasa ninguna credencial a código del repositorio.
- Contenido de las claves de `.env.example`: solo `AULANORMA_LOG_LEVEL` y
  `AULANORMA_ENVIRONMENT`, con valores de ejemplo ficticios, válidos y que no son secretos.
- Enlaces a las ejecuciones de SC-004: pendientes; se completan en T079.

Evidencia local completada; SC-006 sigue Pendiente hasta incorporar los enlaces de SC-004.

### SC-007 Historial sin secretos (histórico)

**Resultado histórico sobre `3101bd5`**: Pendiente. No acredita la nueva base.

**Entorno**: macOS arm64 de referencia con Node.js 24.21.0 y job `secrets` en `ubuntu-24.04`.
**Momento**: antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente, y confirmación
con la primera ejecución satisfactoria de `main`.

**Superado** si hay cero hallazgos no justificados.

- SHA: `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216` (SHA base). Ejecución local del 2026-10-02 en
  el macOS arm64 de referencia (macOS 27.0.1, arm64 nativo), con Node.js `v24.21.0`; caché,
  registros de npm y `TMPDIR` aislados fuera del clon.
  - `npm run check:secrets` se ejecutó una vez y terminó con código 0.
  - Preparación: solo `npm run tools:install` (código 0), que instaló y verificó Gitleaks 8.30.1
    por SHA-256 (instala también zizmor, que este control no usa).
  - No se ejecutó `npm ci`: el envoltorio no tiene dependencias, igual que en el job de CI.
- Confirmación de clon completo: clon nuevo del repositorio, sin `--depth`, filtros parciales ni
  alternates. `git rev-parse --is-shallow-repository` devuelve `false`, y `git status
  --porcelain` está vacío antes y después de la ejecución, con HEAD sin cambios.
- `git rev-list --count HEAD`: 29 commits alcanzables desde el SHA base.
- Número de commits que Gitleaks informa haber examinado: 29, obtenido en una medición adicional,
  no en la ejecución original.
  - Ejecución original del envoltorio: no imprimió N. Solo lee de Gitleaks la línea "N commits
    scanned." y falla si N no está entre 1 y el número de commits alcanzables; terminó con
    código 0.
  - Medición adicional del 2026-10-02:
    - Clon nuevo y completo del SHA base `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216`, no
      superficial y limpio antes y después.
    - Gitleaks 8.30.1, obtenido con `npm run tools:install` y comprobado contra el SHA-256 de
      `scripts/tools/tools.lock.json`.
    - Una única ejecución directa del análisis de historial, con los mismos argumentos que el
      envoltorio: `git --log-opts="--full-history HEAD" .`, informe redactado y en JSON, nivel
      de registro `info`, sin comentarios `gitleaks:allow`, con la copia del `.gitleaksignore`
      del SHA base, sin `.gitleaks.toml` y sin variables `GITLEAKS_*` ni de ubicación de Git.
    - Resultado: código 0, la línea "29 commits scanned." y ningún hallazgo en el informe.
  - Los 29 commits examinados que informa Gitleaks y los 29 commits alcanzables de
    `git rev-list --count HEAD` se obtuvieron por separado. Coinciden en esta medición, pero no
    se ha deducido una cifra de la otra.
- Resultado sin hallazgos, o lista de hallazgos exceptuados con su entrada en el registro
  estructurado: sin hallazgos. "Excepciones de secretos vigentes: 0." Los tres análisis:
  - historial alcanzable desde HEAD: sin hallazgos;
  - índice de Git: sin hallazgos (índice sin cambios preparados, en un clon limpio);
  - árbol de trabajo: 0 ficheros modificados o nuevos, sin hallazgos.
- Enlace al job `secrets` del pull request: evidencia de integración continua de T071, distinta
  de la ejecución local:
  [secrets 110480540983](https://github.com/Informatica-Colectivo-Prime/aulanorma/actions/runs/36895264833/job/110480540983),
  ejecución `security` 36895264833, intento 1, sobre el SHA base, con conclusión success.
- Enlace al job `secrets` de la primera ejecución satisfactoria de `main`: pendiente; se obtiene
  en T083 y se registra en T087.

Parte local completada. SC-007 sigue Pendiente hasta la confirmación en `main`.

### Evidencia de FR-006 C6 y FR-009 sobre la implementación real (histórico)

**Resultado histórico sobre `3101bd5`**: Superado. No acredita la nueva base.

No es un criterio SC adicional, pero forma parte de la aceptación de la puerta 5. Se obtiene en
el clon de SC-002, con Node.js 24.21.0, las dependencias aprobadas, el preflight y la
configuración real: `npm run check:build` ejecuta la matriz negativa por TCP crudo, la
equivalencia entre desarrollo y producción y la auditoría de registros sobre el SHA base.

- SHA: `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216` (SHA base), en el clon de SC-002, ejecución del
  2026-10-02. `npm run check:build` terminó con código 0, una vez como categoría y otra dentro
  del agregado.
- `node --version`: `v24.21.0`.

**Fundamento de Superado**:

- **Ejecución sobre el SHA base**: `check:build` terminó con código 0 en sus dos ejecuciones.
- **Recorrido completo**: la salida mostró "Prueba de humo superada: 21 casos." y `ok` en
  "npm start: matriz negativa por TCP crudo" y en "npm run dev: matriz y equivalencia
  contractual con npm start". En el flujo revisado del arnés, ambos casos solo pasan si la
  matriz se recorre completa:
  - `wireStart` (línea 2177) y `developmentEquivalence` (línea 2534) informan de un problema si
    el servidor no arranca;
  - `runWireMatrix` (línea 1923) recorre toda la lista sin saltos condicionales;
  - una interrupción o un error inesperado impiden el mensaje "superada" (`main`, línea 2815).
- **Recuentos**: proceden de una revisión estática del código en el SHA base, porque la salida
  no los imprime.
- **Los cuatro ceros**: se establecen mediante las aserciones aplicadas a las respuestas
  evaluadas, no mediante cifras impresas.

#### Matriz negativa (histórico)

Recuento estático de `scripts/smoke-test.mjs` en el SHA base. Un caso es una entrada de
`WIRE_CASES` (líneas 1404–1864). Una petición es cada petición HTTP enviada, incluidas las
canalizadas y las mal formadas.

| Grupo | Líneas | Casos | Peticiones | Respuestas evaluadas |
|-------|--------|-------|------------|----------------------|
| Versión | 1405–1476 | 11 | 11 | 11 |
| `Host` | 1477–1550 | 10 | 10 | 10 |
| Cuerpo y framing | 1551–1626 | 9 | 9 | 9 |
| `Expect` | 1627–1670 | 5 | 5 | 5 |
| `CONNECT` | 1671–1718 | 2 | 2 | 2 |
| `Upgrade` | 1671–1718 | 4 | 4 | 4 |
| Destino (11 generados y `OPTIONS *`) | 1719–1747 | 12 | 12 | 12 |
| Método | 1748–1794 | 6 | 6 | 6 |
| Cabeceras de control del framework (`FRAMEWORK_CASES`, líneas 1345–1367, y `frameworkCase`, línea 1369) | 1795–1796 | 21 | 21 | 21 |
| Canalización (4, 3, 3, 2, 2 y 3 peticiones) | 1797–1856 | 6 | 17 | 14 |
| Canalización: descarte con reinicio del cliente | 1857–1863 | 1 | 3 | 1 |
| **Total por modo** | | **87** | **100** | **95** |

- **Número de casos**: 87 por modo. Cada ejecución de `check:build` recorre la matriz en
  producción (`npm start`) y en desarrollo (`npm run dev`): 174 casos. En T073, `check:build`
  se ejecutó dos veces (como categoría y dentro del agregado): dos repeticiones de la misma
  matriz, 348 casos en total.
- **Número de peticiones**: 100 peticiones HTTP por modo, en 88 conexiones TCP, con 95
  respuestas evaluadas. Son 200 peticiones por ejecución de `check:build` y 400 en las dos de
  T073.
  - **Peticiones sin respuesta esperada**: 5 de las 100. Son las que siguen a un rechazo en una
    canalización, en las que el arnés exige que no haya respuesta, y las 2 de la conexión que
    el cliente reinicia.
  - **Caso de descarte** (línea 1867, `runWireCase`): envía una petición válida y bytes mal
    formados, reinicia la conexión y comprueba el servicio con un `GET` en una conexión nueva.
    La conexión reiniciada no se lee, por diseño, y solo se evalúa la respuesta del `GET`.
- **Fuera de este recuento**:
  - las otras 38 peticiones de la prueba de humo por ejecución de `check:build`: contrato,
    métodos y destinos de `npm start`; destinos y `Upgrade` de desarrollo; los cuatro casos de
    `NODE_ENV` heredado y los cuatro calentamientos de desarrollo;
  - las sondas de puerto, que abren conexiones TCP sin enviar HTTP y cuyo número depende de la
    temporización.
- Respuestas HTML servidas (debe ser 0): 0 entre las 95 respuestas evaluadas por modo, por
  aserción. Cada respuesta de la matriz se rechaza si contiene HTML (`wireResponseProblems`,
  línea 1209), y la del `GET` del caso de descarte debe ser el JSON exacto del contrato
  (`getProblems`, línea 980).
- Cabeceras del framework (debe ser 0): 0 entre las 95 respuestas evaluadas por modo, por
  aserción. Cada una se compara con un conjunto cerrado de cabeceras que excluye las del
  framework, `ETag`, `Server`, `X-Powered-By` y cualquier `Vary` distinta de `Accept-Encoding`.
- Redirecciones (debe ser 0): 0 entre las 95 respuestas evaluadas por modo, por aserción. Los
  estados admitidos son 200, 204, 400, 404, 405 y 505, y `Location` y `Refresh` quedan fuera del
  conjunto cerrado de cabeceras.
- Errores 500 inesperados (debe ser 0): 0 entre las 95 respuestas evaluadas por modo, por
  aserción: cualquier 500 es un fallo.
- No se afirma nada sobre las respuestas que no se leen: las de la conexión reiniciada.

#### Equivalencia entre modos (histórico)

- Resultado de la equivalencia entre desarrollo y producción: superada. El caso "npm run dev:
  matriz y equivalencia contractual con npm start" compara, caso a caso, los estados, las
  cabeceras (salvo `Date`), los cuerpos y el cierre de cada respuesta con los de producción, y
  terminó en `ok`. Los 87 casos tienen claves únicas, así que se comparan todos; si a uno le
  faltara su resultado de producción, el caso fallaría.

#### Auditoría de registros (histórico)

- Resultado de la auditoría: superada. Los casos de arranque válido y de matriz terminaron en
  `ok`; fallan si se registra algo durante la matriz o por las consultas, si los registros de
  arranque no son exactamente los esperados o si la salida contiene rutas o valores filtrados.
  No apareció ninguna línea de diagnóstico de la salida capturada.

### Criterios sin evidencia sobre la base anterior (histórico)

Sus plantillas estaban vacías y en Pendiente; no hay datos que conservar:

- SC-001 Arranque desde un clon limpio.
- SC-004 Activación y duración de los controles.
- SC-008 Comprensión de la documentación.
- SC-009 Controles requeridos en `main`.
