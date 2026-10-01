# Aceptación: Base de ingeniería de AulaNorma

**Funcionalidad**: `001-engineering-baseline` | **Plan**: [plan.md](./plan.md) |
**Matriz**: [Matriz de aceptación](./plan.md#matriz-de-aceptación)

Evidencia de los procedimientos manuales de aceptación. Estas verificaciones **no son
controles**: ningún workflow las ejecuta, no se añaden a los controles requeridos y no se
repiten en cada pull request.

## Cabecera

- **SHA base de aceptación**: Pendiente. Se fija en T071; hasta entonces no hay commit evaluado.
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
