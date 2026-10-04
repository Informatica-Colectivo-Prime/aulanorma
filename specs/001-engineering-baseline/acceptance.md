# Aceptación: Base de ingeniería de AulaNorma

**Funcionalidad**: `001-engineering-baseline` | **Plan**: [plan.md](./plan.md) |
**Matriz**: [Matriz de aceptación](./plan.md#matriz-de-aceptación)

Evidencia de los procedimientos manuales de aceptación. Estas verificaciones **no son
controles**: ningún workflow las ejecuta, no se añaden a los controles requeridos y no se
repiten en cada pull request.

## Cabecera

- **SHA base de aceptación**: Pendiente. Se fija en T071; hasta entonces no hay commit evaluado.
  La base deberá incluir conjuntamente la corrección del compilador de desarrollo, la
  documentación alineada con ella y la transición de este documento.
- **Base anterior**: `3101bd5fc4bfbbb07e6465c125e2730f2dbdd216`, sustituida. Su evidencia se
  conserva en [Evidencia histórica](#evidencia-histórica-sobre-3101bd5-base-sustituida) y no
  acredita la nueva base.
- **HEAD de evidencia**: todavía no existe. Será un commit posterior al SHA base que solo
  modifique este fichero.
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
- **SC-001 y SC-008** DEBEN estar Superado antes de integrar. Si alguno queda Pendiente, el pull
  request permanece abierto y no se integra. No existe cierre posterior.
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
**Momento**: antes de integrar, sobre el SHA base de aceptación. Si falta la persona externa,
SC-001 queda Pendiente, el pull request permanece abierto y no se integra.

**Superado** solo cuando esa persona completa el recorrido en macOS en menos de 30 minutos,
Linux x64 termina con éxito, ambos sin desviaciones, y la evidencia queda registrada.

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

**Estado**: Pendiente

**Entorno**: macOS arm64 de referencia con Node.js 24.21.0.
**Momento**: antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente.

**Superado** si todos terminan con código 0 y el agregado tarda menos de 10 minutos.

- SHA:
- Confirmación de clon completo:
- `node --version`:
- Código de salida de la preparación (`npm ci` y `npm run tools:install`):

| Comando | Código de salida |
|---------|------------------|
| `npm run check:format` | |
| `npm run check:lint` | |
| `npm run check:types` | |
| `npm run check:test` | |
| `npm run check:build` | |
| `npm run check:secrets` | |
| `npm run check:deps` | |
| `npm run check:workflows` | |
| `npm run check` (agregado) | |

- Tiempo real (`real`) de `time npm run check`:
- Resumen de su salida:

---

## SC-003 Pruebas negativas

**Estado**: Pendiente

**Entorno**: local en el macOS arm64 de referencia y en Linux x64, ambos con Node.js 24.21.0.
Integración continua: los runners de los workflows.
**Momento**: antes de integrar, cuando los workflows ya se ejecutan en el pull request de la
funcionalidad; las ramas negativas parten del SHA base.

Cada categoría debe fallar por la causa esperada y en la ubicación esperada. El subcaso de
secretos en un fichero ignorado es una prueba de exclusión positiva, no una novena prueba
negativa. En la integración continua, los controles no afectados deben pasar.

### Local en macOS

- SHA:
- Salida de `npm run verify:negative` con las ocho categorías, causa y ubicación de cada fallo:
- Subcaso de exclusión positiva:
- Código de salida:
- Estado de Git idéntico antes y después (`git status --porcelain` y `git rev-parse HEAD`):

### Local en Linux x64

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

### Integración continua

| Categoría | Pull request cerrado sin integrar | Ejecución | Causa y ubicación | Controles colaterales | Controles no afectados en verde | `macos-quality` (categorías 1 a 5) |
|-----------|-----------------------------------|-----------|-------------------|-----------------------|---------------------------------|------------------------------------|
| `format` | | | | | | |
| `lint` | | | | | | |
| `types` | | | | | | |
| `test` | | | | | | |
| `build` | | | | | | |
| `secrets` | | | | | | No aplica |
| `dependencies` | | | | | | No aplica |
| `workflows` | | | | | | No aplica |

- Secretos: autorización de la protección de push, si la hubo, sin el valor del token:
- Secretos: cierre de cualquier alerta como dato sintético:
- Salida vacía de `git ls-remote --heads origin 'negative-test/*'`:
- Comprobación de que esos commits no son alcanzables desde `main`:

---

## SC-004 Activación y duración de los controles

**Estado**: Pendiente

**Entorno**: runners `ubuntu-24.04` (Linux x64) y `macos-26` (arm64), con Node.js 24.21.0 desde
`.node-version`.
**Momento**: pull request, antes de integrar. `main`, tras las integraciones correctivas que
resulten necesarias y antes de activar los controles requeridos.

**Superado** si en los cuatro casos computables los nueve jobs concluyen con éxito y cada uno
dura menos de 15 minutos. Una indisponibilidad general del proveedor solo se excluye con enlace
a su incidencia pública.

### Pull request: intento 1 (ejecución inicial)

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | | | |
| `security` | | | |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| `format` | | | | |
| `lint` | | | | |
| `types` | | | | |
| `test` | | | | |
| `build` | | | | |
| `macos-quality` | | | | |
| `secrets` | | | | |
| `dependencies` | | | | |
| `workflows` | | | | |

### Pull request: intento 2 (reejecución completa)

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | | | |
| `security` | | | |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| `format` | | | | |
| `lint` | | | | |
| `types` | | | | |
| `test` | | | | |
| `build` | | | | |
| `macos-quality` | | | | |
| `secrets` | | | | |
| `dependencies` | | | | |
| `workflows` | | | | |

### Pull request: intento 3 (reejecución completa)

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | | | |
| `security` | | | |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| `format` | | | | |
| `lint` | | | | |
| `types` | | | | |
| `test` | | | | |
| `build` | | | | |
| `macos-quality` | | | | |
| `secrets` | | | | |
| `dependencies` | | | | |
| `workflows` | | | | |

### `main`: primera ejecución satisfactoria

| Workflow | Identificador de la ejecución | Número de intento | SHA |
|----------|-------------------------------|-------------------|-----|
| `quality` | | | |
| `security` | | | |

| Job | `started_at` | `completed_at` | Duración | Conclusión |
|-----|--------------|----------------|----------|------------|
| `format` | | | | |
| `lint` | | | | |
| `types` | | | | |
| `test` | | | | |
| `build` | | | | |
| `macos-quality` | | | | |
| `secrets` | | | | |
| `dependencies` | | | | |
| `workflows` | | | | |

### Otras ejecuciones

- Ejecuciones fallidas previas:
- Ejecuciones canceladas por `concurrency`:
- Pull requests correctivos:

---

## SC-005 Determinismo con y sin red

**Estado**: Pendiente

**Entorno**: macOS arm64 de referencia con Node.js 24.21.0, tras `npm ci`.
**Momento**: antes de integrar, sobre el SHA base.

**Superado** si las diez terminan con el mismo código de salida y los mismos recuentos.

- SHA:
- Resultado de la comprobación de red:

| Ejecución | Modo | Código de salida | Ficheros | Pruebas superadas | Pruebas fallidas |
|-----------|------|------------------|----------|-------------------|------------------|
| 1 | Con red | | | | |
| 2 | Con red | | | | |
| 3 | Con red | | | | |
| 4 | Con red | | | | |
| 5 | Con red | | | | |
| 6 | Sin red | | | | |
| 7 | Sin red | | | | |
| 8 | Sin red | | | | |
| 9 | Sin red | | | | |
| 10 | Sin red | | | | |

---

## SC-006 Cero secretos reales

**Estado**: Pendiente

**Entorno**: macOS arm64 de referencia y workflows del SHA base.
**Momento**: antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente.

**Superado** si ninguna comprobación muestra un secreto real ni una credencial pasada a código
del repositorio.

- SHA:
- Confirmación de clon completo:
- Salida de `diff .env.example .env.development.local`:
- Salida de `grep -rnE 'secrets\.|github\.token|GITHUB_TOKEN|GH_TOKEN' .github/workflows`:
- Nota de la revisión visual:
- Contenido de las claves de `.env.example`:
- Enlaces a las ejecuciones de SC-004:

---

## SC-007 Historial sin secretos

**Estado**: Pendiente

**Entorno**: macOS arm64 de referencia con Node.js 24.21.0 y job `secrets` en `ubuntu-24.04`.
**Momento**: antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente, y confirmación
con la primera ejecución satisfactoria de `main`.

**Superado** si hay cero hallazgos no justificados.

- SHA:
- Confirmación de clon completo:
- `git rev-list --count HEAD`:
- Número de commits que Gitleaks informa haber examinado:
- Resultado sin hallazgos, o lista de hallazgos exceptuados con su entrada en el registro
  estructurado:
- Enlace al job `secrets` del pull request:
- Enlace al job `secrets` de la primera ejecución satisfactoria de `main`:

---

## SC-008 Comprensión de la documentación

**Estado**: Pendiente

**Entorno**: cualquier equipo; no hace falta ejecutar nada.
**Momento**: cuando la documentación del SHA base está completa y, si la misma persona ejecuta
ambos, después de SC-001. Si falta la persona, SC-008 queda Pendiente, el pull request
permanece abierto y no se integra.

**Superado** solo con los trece correctos y sin ayuda.

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

- SHA de la primera ejecución satisfactoria:
- Fecha y hora final de la primera ejecución satisfactoria:
- Fecha y hora de activación (y `updated_at` si es un ruleset):
- Enlace a esa ejecución:
- Extracto de la respuesta que muestra los nueve nombres exactos como requeridos, sin actores
  con permiso de elusión y con los administradores sujetos a la regla:
- Lista de commits de `main` que demuestra que no hubo integraciones desde esa primera ejecución
  satisfactoria hasta la activación:
- Integraciones correctivas anteriores, registradas como antecedentes y no como excepciones a
  la congelación:

---

## Evidencia de FR-006 C6 y FR-009 sobre la implementación real

**Estado**: Pendiente

No es un criterio SC adicional, pero forma parte de la aceptación de la puerta 5. Se obtiene en
el clon de SC-002, con Node.js 24.21.0, las dependencias aprobadas, el preflight y la
configuración real: `npm run check:build` ejecuta la matriz negativa por TCP crudo, la
equivalencia entre desarrollo y producción y la auditoría de registros sobre el SHA base.

- SHA:
- `node --version`:

### Matriz negativa

- Número de casos:
- Número de peticiones:
- Respuestas HTML servidas (debe ser 0):
- Cabeceras del framework (debe ser 0):
- Redirecciones (debe ser 0):
- Errores 500 inesperados (debe ser 0):

### Equivalencia entre modos

- Resultado de la equivalencia entre desarrollo y producción:

### Auditoría de registros

- Resultado de la auditoría:

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
