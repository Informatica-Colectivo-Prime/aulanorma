# Modelo de datos (Fase 1): Base de ingeniería de AulaNorma

**Funcionalidad**: `001-engineering-baseline` | **Fecha**: 2026-09-25 | **Plan**: [plan.md](./plan.md)

## Declaración de alcance

**Esta funcionalidad no tiene entidades persistentes.** No hay base de datos, tablas, ficheros de
datos de ejecución ni almacenamiento de ningún tipo (FR-007 y aclaración 1). No se define ningún
esquema de almacenamiento.

Las entidades clave de la especificación son **artefactos versionados en el repositorio** o
**valores en memoria** durante la ejecución. Se describen para fijar sus campos y reglas de
validación, no para persistirlas.

## Entidades

### Configuración de la aplicación (en memoria)

Resultado de validar `process.env` al arrancar (`src/platform/config`). La plantilla versionada
que describe cada parámetro es `.env.example` (FR-002). El mismo esquema se aplica en el
preflight, antes de arrancar Next.js, en `instrumentation` y en la ruta de estado
([research.md](./research.md#r8-validación-de-configuración-zod-4-con-preflight-común-y-defensa-en-profundidad)).

| Campo | Variable de entorno | Obligatorio | Valores válidos | Uso |
|-------|---------------------|-------------|-----------------|-----|
| `logLevel` | `AULANORMA_LOG_LEVEL` | Sí | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | Nivel del logger |
| `environment` | `AULANORMA_ENVIRONMENT` | Sí | `development`, `test`, `ci` | Campo `environment` de los registros |

**Origen de los valores**: el preflight y Next.js los cargan con la misma función de
`@next/env`. En `npm run dev`, desde el entorno del proceso y, para las variables que no estén
definidas allí, desde `.env.development.local` (y, si existieran, `.env.local`,
`.env.development` y `.env`). En `npm start`, desde el entorno del proceso; los ficheros de
producción (`.env.production.local`, `.env.local`, `.env.production` y `.env`) no se usan en
esta funcionalidad, y la prueba de humo se niega a ejecutarse si existen. Una variable
definida en el entorno del proceso prevalece siempre, aunque esté vacía.

**Reglas**:

- Una variable ausente, vacía o fuera de la lista hace que el preflight termine con código 1,
  antes de que Next.js arranque y abra el puerto (FR-005).
- El error se registra como una lista de `{ key, problem }`, donde `problem` es uno de los
  códigos propios `missing` o `invalid_value`. El valor recibido **nunca** aparece en la salida.
- Las variables desconocidas con el prefijo `AULANORMA_` se rechazan como `unknown_key` para
  detectar erratas.
- Ninguna variable es un secreto. `.env.example` solo contiene valores de ejemplo válidos y
  ficticios.
- La configuración validada es una instantánea inmutable. El único procedimiento soportado para
  cambiar valores es reiniciar el proceso, que vuelve a pasar el preflight. Si `next dev`
  recarga un fichero con valores inválidos y vuelve a evaluar la ruta de estado, esta responde
  500 sin cuerpo y nunca "ok".

### Estado de la aplicación (en memoria, expuesto)

Respuesta pública de la comprobación de estado. El contrato normativo está en
[`contracts/health.openapi.yaml`](./contracts/health.openapi.yaml).

| Campo | Tipo | Regla |
|-------|------|-------|
| `status` | cadena | Siempre `"ok"` cuando el servicio responde |
| `version` | cadena | Versión semántica de `package.json` (por ejemplo, `0.1.0`) |

No admite ningún otro campo (`additionalProperties: false`). No incluye configuración, entorno,
rutas, commit, hora de arranque ni dependencias (aclaración 2). Cualquier otra ruta responde
404 sin cuerpo; el contrato completo está en
[`contracts/health.openapi.yaml`](./contracts/health.openapi.yaml).

### Capa (estructura versionada)

Directorio de `src/modules/` con un punto de entrada público `index.ts` y un `README.md` que
describe su responsabilidad (FR-023).

| Capa | Directorio | Responsabilidad (principio II) |
|------|------------|--------------------------------|
| Fuente normativa | `src/modules/normative-source` | PDF original inmutable y texto extraído por página |
| Interpretación estructurada | `src/modules/structured-interpretation` | Representación validada del certificado |
| Contenido didáctico | `src/modules/didactic-content` | Materiales, actividades y evaluaciones generados |
| Publicación en Moodle | `src/modules/moodle-publication` | Correspondencia entre el contenido aprobado y Moodle |

En esta funcionalidad, cada `index.ts` está vacío (`export {};`). No hay lógica de producto ni
nada específico de ningún certificado (FR-024).

#### Matriz de dependencias entre capas

Se fuerza con `no-restricted-imports` en ESLint y se verifica con pruebas de arquitectura. Cada
celda indica si el módulo de la fila puede importar al de la columna, y siempre solo a través de
su API pública (`index.ts`).

| Importa → | `platform` | `normative-source` | `structured-interpretation` | `didactic-content` | `moodle-publication` |
|-----------|:----------:|:------------------:|:---------------------------:|:------------------:|:--------------------:|
| `platform` | — | No | No | No | No |
| `normative-source` | Sí | — | No | No | No |
| `structured-interpretation` | Sí | Sí | — | No | No |
| `didactic-content` | Sí | No | Sí | — | No |
| `moodle-publication` | Sí | No | No | Sí | — |
| Entrega: `src/app`, `src/instrumentation.ts` y `src/instrumentation-node.ts` | **Sí, solo API pública** | **No** | **No** | **No** | **No** |

Reglas adicionales:

- **Entrega limitada a `platform`**: en esta funcionalidad, la capa de entrega de Next.js solo
  puede importar `@/platform/<área>`, es decir, el `index.ts` de `config`, `logging`, `health` o
  `version`. No importa ninguna capa de dominio, porque `/api/health` no las necesita. La
  primera porción vertical de producto definirá explícitamente sus puntos de entrada y ampliará
  esta fila solo para las capas que justifique, con su propia prueba de arquitectura.
- Las cuatro capas de dominio están vacías y solo pueden depender de `platform` y de la capa
  inmediatamente anterior, en la dirección que fija la constitución (principio II).
- Queda prohibido importar rutas internas de otra capa (`@/modules/<capa>/<interno>`) o de
  `platform` (`@/platform/<área>/<interno>`); solo se permite la API pública.
- `src/platform` agrupa las utilidades transversales (configuración, registros, estado y
  versión) y no depende de ninguna capa.
- `src/platform/config/index.ts` y `src/platform/logging/index.ts` son módulos portables: solo
  importan paquetes npm, porque el preflight los carga directamente con Node.js.
- Solo `src/platform/config` y los ficheros `instrumentation` pueden leer `process.env`.

### Control de calidad (catálogo versionado)

Catálogo en `docs/engineering/quality-controls.md`. Cada control tiene un nombre estable, que es
el nombre del job en la integración continua (FR-022).

Hay **ocho categorías** y **nueve controles requeridos**:

| Control (job) | Categoría | Comando local | Prueba negativa |
|---------------|-----------|---------------|-----------------|
| `format` | 1. Formato | `check:format` | Sí |
| `lint` | 2. Análisis estático y límites | `check:lint` | Sí |
| `types` | 3. Tipos | `check:types` | Sí |
| `test` | 4. Pruebas | `check:test` | Sí |
| `build` | 5. Construcción | `check:build` | Sí |
| `secrets` | 6. Secretos | `check:secrets` | Sí (subcasos de historial, fichero sin seguimiento y exclusión de ignorados) |
| `dependencies` | 7. Dependencias | `check:deps` | Sí |
| `workflows` | 8. Seguridad de workflows | `check:workflows` | Sí |
| `macos-quality` | Ninguna: verificación de plataforma | `check:quality` (categorías 1 a 5) | No propia; falla con las de las categorías 1 a 5 |

| Campo | Descripción |
|-------|-------------|
| `name` | Nombre estable del job: `format`, `lint`, `types`, `test`, `build`, `macos-quality`, `secrets`, `dependencies` o `workflows` |
| `category` | Formato, análisis estático y límites, tipos, pruebas, construcción, secretos, dependencias o seguridad de workflows; vacía en `macos-quality`, que es una verificación de plataforma |
| `localCommand` | Script npm equivalente (ver [plan.md](./plan.md#comandos-npm)) |
| `required` | Siempre `true` en esta funcionalidad |
| `negativeCase` | Alteración sintética que lo hace fallar (ver [plan.md](./plan.md#diseño-de-las-pruebas-negativas)); solo en los ocho controles de categoría |

### Ejecución de controles (externa)

Es cada ejecución de un workflow en GitHub Actions: la guarda GitHub y no el repositorio. La
evidencia de aceptación (enlaces a las ejecuciones) se registra en
`specs/001-engineering-baseline/acceptance.md` durante la implementación, según la
[matriz de aceptación](./plan.md#matriz-de-aceptación).

### Excepción de seguridad (ficheros versionados)

| Tipo | Fichero | Campos obligatorios |
|------|---------|---------------------|
| Secretos | `.gitleaksignore` (huella) y `docs/engineering/security-exceptions.md` (registro) | Huellas (historial: `commit:fichero:regla:línea`; árbol de trabajo: `fichero:regla:línea`), justificación, responsable, fecha de revisión |
| Dependencias | `security/audit-exceptions.json` | `advisory` (GHSA), `package`, `justification`, `owner`, `reviewBy` (ISO 8601) |

**Reglas**: una excepción caducada (`reviewBy` anterior a hoy) hace fallar el control. Ninguna
excepción puede desactivar un control completo (FR-020). Ambos ficheros empiezan vacíos.

## Transiciones de estado

No hay entidades con ciclo de vida. El único proceso con estados es el arranque del servicio,
igual en `npm run dev` y en `npm start`:

```text
preflight → configuración válida → Next.js arranca → atendiendo (status "ok")
preflight → configuración inválida → termina con código 1 (Next.js no arranca; el puerto nunca se abre)
next dev/start directo → instrumentation: configuración inválida → termina con código 1 (nunca atiende "ok")
atendiendo (next dev) → recarga de .env con valores inválidos → /api/health responde 500 sin cuerpo
```
