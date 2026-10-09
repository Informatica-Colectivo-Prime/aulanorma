# Implementation Plan: Del PDF oficial del BOE al paquete SCORM (piloto UF0517)

**Branch**: `002-boe-scorm-export` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-boe-scorm-export/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Un docente autorizado registra el PDF oficial del BOE, revisa y valida la interpretación de
UF0517, aprueba un índice con cobertura completa, aprueba el temario desarrollado y descarga
un paquete SCORM 1.2 con instrucciones para incorporarlo a mano a Moodle.

El piloto es una aplicación web en un servidor, accesible desde otros equipos con navegador y
HTTPS. El enfoque técnico es el más pequeño que completa el recorrido sobre la base de
ingeniería existente: el mismo monolito Next.js con Pages Router, que escucha en local detrás
de un proxy inverso; SQLite incluido en Node.js y un almacén de ficheros por huella; cuentas
locales con sesión en el servidor; una interfaz propia de generación con un adaptador
determinista, con el proveedor real todavía sin seleccionar; y un generador propio de un SCO
único, cuyo manifiesto se relee con un analizador ajeno y se comprueba con las reglas de su
perfil; la validación contra los esquemas oficiales, prevista al principio, se sustituyó el
2026-10-08 (research R8). Las decisiones y sus
alternativas están en [research.md](./research.md); las que cambian la arquitectura
aceptada, en el [ADR 0004](../../docs/adr/0004-product-surface-persistence-identity-and-generation.md),
Propuesto.

Tres ideas sostienen el diseño:

- **La vigencia se deriva**: cada aprobación guarda las revisiones exactas en las que se
  apoya y solo vale mientras sigan siendo las actuales. Invalidar no exige escribir nada, y
  exportar o descargar lo comprueban en cada petición.
- **La cobertura se calcula** a partir de vínculos explícitos entre requisitos, entradas del
  índice y bloques del temario. La generación nunca la declara.
- **El presupuesto se reserva antes de enviar** cada operación, y lo incierto sigue contando.

## Technical Context

**Language/Version**: TypeScript 6.0.3 en modo estricto sobre Node.js 24.21.0 (rango
`>=24.21.0 <25`), sin cambios respecto a la base.

**Primary Dependencies**: las existentes (Next.js 16.3.6 con Pages Router, React 19.3.0, Zod
4.6.5, Pino 10.3.1). Nuevas de producción: `pdfjs-dist`, `fflate` y `libxml2-wasm` (esta última sustituye desde
el 2026-10-08 a `xmllint-wasm`, que no llegó a instalarse). Nueva de
desarrollo: `jsdom`. Herramienta externa nueva: `qpdf`, para la inspección estructural de los
PDF, instalada como binario verificado y no como paquete de npm. Desde el 2026-10-09, el SDK `openai`, solo para el adaptador del proveedor real (research R6 y R10). Versiones exactas por
fijar al añadirlas (research R10).

**Storage**: SQLite en un fichero, con `node:sqlite` (en estado *release candidate* en Node.js
24.21.0), y un almacén de ficheros direccionado por SHA-256, ambos en un directorio de datos
persistente y configurable, en disco local del servidor. Límites en research R1.

**Testing**: Vitest, como en la base. Unitarias, de contrato (superficie HTTP, generación,
paquete SCORM contra un doble de la API y contra las reglas de su perfil, con referencias ajenas), de integración con
SQLite en un directorio temporal, y de arquitectura. Sin red en la integración continua.

**Target Platform**: un servidor Linux con un único proceso de la aplicación, que escucha en
`127.0.0.1:3000` (ADR 0001) detrás de un proxy inverso con TLS; desarrollo en macOS y Linux.
Los usuarios acceden con navegador por HTTPS. El paquete exportado se ejecuta en el navegador
del alumnado, dentro de Moodle. Dominio y destino, por concretar.

**Project Type**: aplicación web monolítica modular (una unidad desplegable).

**Performance Goals**: no son un objetivo del piloto. Referencias de uso razonable: las
páginas de revisión responden sin espera apreciable con un temario de hasta 200 temas, y la
exportación de UF0517 termina en segundos. El coste de la derivación de contraseñas se mide
en el servidor de destino.

**Constraints**: un único servidor y una única instancia; sin servicios adicionales;
integración continua sin red ni Moodle; paquete autónomo y sin datos de usuarios; estado de
seguimiento dentro de los límites de SCORM 1.2; ningún borrado en el piloto; nada específico
de UF0517 en el código; ninguna llamada de pago hasta seleccionar proveedor.

**Scale/Scope**: un proyecto, una unidad formativa, un documento (más sus sustitutos), menos
de diez usuarios y un máximo de 200 temas por paquete. Límites de tamaño y páginas del PDF,
por fijar en la comprobación de viabilidad (research R4).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra la constitución 2.0.0, integrada en `main` el 2026-10-07, que incluye las dos
aclaraciones decididas por el mantenedor ese día (inicio de sesión en el principio V y
periodo del límite de coste en el principio IX).

| #   | Puerta                                           | Resultado | Evidencia                                                                                                                                                 |
| --- | ------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Procedencia y cobertura visibles (I)             | Pasa      | Referencia normativa en cada requisito y bloque; cobertura calculada por vínculos, sin herencia; FR-013 bloquea la aprobación (data-model).              |
| 2   | Cuatro capas y contratos (II)                    | Pasa      | Una tabla, un módulo; cada capa usa solo la API pública de la anterior; reglas de importación y pruebas de arquitectura ampliadas.                       |
| 3   | Sin exportar ni descargar sin aprobación (III)   | Pasa      | Vigencia derivada comprobada en cada exportación y descarga; ninguna operación la omite (contracts/http-surface).                                        |
| 4   | Salidas validadas por esquema (IV)               | Pasa      | Esquemas Zod versionados para interpretación, índice y temas; manifiesto releído con un analizador ajeno y comprobado con las reglas de su perfil (no contra los XSD, desde el 2026-10-08); lo inválido se rechaza y se registra.        |
| 5   | Seguridad y privacidad (V)                       | Pasa      | Dos perfiles justificados; solo la entrada es accesible sin sesión y no concede nada más; contraseñas, sesiones, intentos y CSRF en research R2; PDF en R4. |
| 6   | Paquete autónomo, íntegro y verificado (VI)      | Pasa      | Conformidad del manifiesto con tres comprobaciones independientes; huella del fichero final; ninguna compatibilidad sin la parte 3 del quickstart.       |
| 7   | Porción vertical, UF0517 primero (VII)           | Pasa      | Solo UF0517; entrega por historias; prueba de arquitectura sin literales del certificado.                                                                |
| 8   | Pruebas obligatorias (VIII)                      | Pasa      | Previstas en cada contrato; Moodle fuera de la integración continua; adaptador determinista.                                                             |
| 9   | IA tras adaptadores, con límites y registro (IX) | Pasa      | Interfaz propia; prompts versionados; registro por llamada; límite acumulado del proyecto y máximo por operación; reserva previa e inciertos (R6).       |
| 10  | Accesibilidad y lenguaje claro (X)               | Pasa      | HTML semántico renderizado en el servidor; lista de comprobación WCAG 2.2 AA manual y reproducible para la interfaz y el paquete.                        |
| 11  | Registro de decisiones y actividad (XI)          | Pasa      | Auditoría, registro de generaciones, exportaciones y descargas; identificador de correlación por petición; ADR 0004.                                     |
| 12  | Simplicidad (XII)                                | Pasa      | Un proceso y un servidor, sin servicios nuevos; cuatro dependencias justificadas; ver "Complexity Tracking".                                             |

**Puertas 5 y 9**. Pasan con el texto de la constitución 2.0.0 sobre la entrada sin
autenticación previa y sobre el periodo del límite de coste.

**Requisitos y mecanismos**. Lo que debe cumplirse sobre sesiones, acceso por HTTPS,
persistencia y recuperación está en la especificación (FR-026, FR-052, FR-068 y FR-069, con
SC-039 y SC-040). Este plan y research.md solo describen los mecanismos.

**Límites declarados, que no son violaciones**: la detección de contenido activo en PDF
reduce el riesgo, pero no demuestra que un documento sea inofensivo (R4); la aceptación real
del recorrido queda pendiente hasta disponer de un proveedor de generación (R6).

**Revisión tras el diseño (fase 1)**: sin cambios. El modelo de datos y los contratos no
introducen ninguna vía que eluda la aprobación, ninguna dependencia entre capas fuera de su
orden ni infraestructura nueva.

## Project Structure

### Documentation (this feature)

```text
specs/002-boe-scorm-export/
├── plan.md              # Este fichero
├── research.md          # Fase 0: decisiones y alternativas
├── data-model.md        # Fase 1: entidades, reglas y vigencia
├── quickstart.md        # Fase 1: validación automática, funcional y manual en Moodle
├── contracts/
│   ├── http-surface.md          # Operaciones y autorización
│   ├── generation-provider.md   # Interfaz de generación y presupuesto
│   └── scorm-package.md         # Estructura, comportamiento y conformidad del paquete
├── checklists/
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
server.mjs                     # Frontera HTTP: lista cerrada de rutas de producto
scripts/
├── preflight.mjs
├── admin/                     # Altas, perfiles y revocación de sesiones
├── ops/                       # Copia de seguridad y comprobación de restauración
└── fixtures/                  # Generación de los PDF sintéticos de prueba
prompts/                       # Prompts versionados (interpretation, outline, topic)
src/
├── pages/                     # Entrega: interfaz docente y API Routes
├── platform/
│   ├── config/  logging/  http-boundary/  health/  version/    # Existentes
│   ├── persistence/           # SQLite, migraciones, almacén de ficheros, copia en línea
│   ├── identity/              # Cuentas, sesiones, intentos, CSRF, autorización
│   ├── audit/                 # Registro de solo inserción
│   └── generation/            # Interfaz, adaptador determinista, registro de uso, presupuesto
└── modules/
    ├── normative-source/          # Documentos, páginas, sustitución, tratamiento del PDF
    ├── structured-interpretation/ # Inventario, correcciones, validación
    ├── didactic-content/          # Índice, cobertura, temas, aprobaciones, versiones
    └── content-export/            # Paquete SCORM, conformidad, exportaciones, descargas
tests/
├── architecture/  contract/  integration/  unit/
└── fixtures/                  # PDF sintéticos, referencias SCORM, respuestas grabadas
docs/engineering/
└── deployment.md              # Despliegue aislado, copia y restauración
```

**Datos del piloto**: la procedencia del documento real y los resultados específicos de la
unidad viven en `specs/002-boe-scorm-export/`, no en `tests/` ni en `src/`. Las pruebas
automáticas usan casos sintéticos. El PDF real no se guarda en el repositorio: se identifica
por su huella y su procedencia.

**Structure Decision**: se mantiene la estructura de ADR 0001. El dominio vive en las cuatro
capas; lo transversal, en cuatro áreas nuevas de `src/platform`. La capa de entrega pasa a
poder importar la API pública de las cuatro capas (ADR 0004). Cada capa sigue dependiendo
solo de la anterior y de `platform`.

## Entrega por pasos

Cada paso es un PR revisable en una sesión, con los nueve controles en verde. El orden busca
ver pronto una interfaz y recorrer el flujo con el adaptador determinista. Los pasos 2 a 11
corresponden, en ese orden, a las fases 1 a 10 de [tasks.md](./tasks.md); la fase 11 es el
cierre.

| Paso | Contenido                                                                                                                                 | Se puede ver o probar                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 0    | **Enmienda** 2.0.0, ADR 0003 (Propuesto) y documentos de alcance. Integrada.                                                              | —                                                             |
| 1    | **Especificación y plan 002**, con el ADR 0004 (Propuesto). PR propio.                                                                    | —                                                             |
| 2    | **Migración a `content-export`**: renombrado mecánico y coordinado.                                                                       | Los nueve controles, sin cambios de comportamiento            |
| 3    | **Viabilidad**: tratamiento de PDF, `node:sqlite` y validación del manifiesto con XSD.                                                    | Informe con resultados por caso                               |
| 4    | **Cimientos con interfaz**: persistencia, auditoría, frontera ampliada, entrada, sesión y una página de inicio autenticada.               | Entrar, ver la página de inicio, salir                        |
| 5    | **Historia 1**: documento, páginas, interpretación (determinista), correcciones, validación y documento sustituto.                        | Subir un PDF y validar su interpretación                      |
| 6    | **Historia 2**: índice, vínculos, cobertura y aprobación.                                                                                 | Aprobar un índice; ver el bloqueo por cobertura               |
| 7    | **Historia 3**: presupuesto, generación (determinista), temas, edición con control de revisión, aprobaciones y versión.                   | Aprobar una versión; ver límite, reanudación e invalidación   |
| 8    | **Historia 4**: vista previa, exportación, conformidad, descarga e instrucciones.                                                         | Descargar un paquete y abrirlo sin conexión                   |
| 9    | **Despliegue del piloto** y copia de seguridad con restauración probada.                                                                  | Acceso por HTTPS desde otro equipo                            |
| 10   | **Proveedor real** de generación.                                                                                                         | Generación real dentro del presupuesto                        |
| 11   | **Historia 5 y aceptación**: Moodle real, recorrido funcional con el proveedor real y evidencia.                                          | SC-018 a SC-024                                               |

Los pasos 2 a 8 no dependen de ningún dato externo, salvo el PDF real del piloto para la
última parte de los pasos 3 y 5. Los pasos 9, 10 y 11 sí (ver la sección final).

### Migración coordinada a `content-export` (paso 2)

Un único PR sin lógica nueva, que cambia a la vez:

- el directorio `src/modules/moodle-publication` → `src/modules/content-export`, con su
  `index.ts` y su `README.md`;
- las reglas `no-restricted-imports` de `eslint.config.mjs`;
- `tests/architecture/import-boundaries.test.ts` y cualquier otra prueba que nombre el módulo;
- la alteración de `lint` de `scripts/negative-checks.mjs` y su descripción en
  `docs/engineering/quality-controls.md`;
- `docs/engineering/architecture.md` y los `README.md` de las demás capas.

Comprobación: `npm run check` y `npm run verify:negative` en verde, y ninguna aparición de
`moodle-publication` fuera de `specs/001-engineering-baseline/` y del historial de los ADR.
La evidencia de 001 no se modifica. Por decisión del mantenedor, este mismo cambio acepta el
ADR 0003 y añade al ADR 0001 la nota de su sustitución parcial. La aceptación registra la
decisión arquitectónica; no indica que la exportación esté implementada.

### ADR 0004

Está preparado como **Propuesto** y no acepta ni modifica ningún otro ADR. Indica
exactamente qué sustituye del ADR 0001: de la decisión 8, la ausencia de HTML, la delegación
de un único destino, el cuerpo vacío y la prueba de la ruta única; de la decisión 1, la
existencia de una sola API Route; de la decisión 5, las importaciones de la capa de entrega;
y de la decisión 7, los eventos de registro. Todo lo demás sigue vigente.

Su fila en el índice de `docs/adr/README.md` se añade junto con esta especificación.

## Despliegue y operación (paso 9)

Detalle en research R11. En resumen:

- **Aislado**: cuenta de sistema propia sin privilegios, servicio propio y un único
  directorio de datos; no comparte proceso, usuario ni datos con otros servicios.
- **Acceso**: el proxy inverso termina TLS y reenvía al puerto local. La aplicación conoce su
  origen público por configuración y no confía en cabeceras reenviadas.
- **Persistencia**: base de datos y almacén de ficheros en disco local.
- **Copia coordinada**: los ficheros se publican antes de referenciarse y no cambian; copia
  en línea de la base y, después, de los ficheros; verificación de referencias y huellas en
  la propia copia; restauración probada en un directorio limpio, con las operaciones en curso
  en un estado definido (FR-069).

Este plan no modifica el servidor ni sus servicios. Entrega el procedimiento y los scripts;
ejecutarlos en el destino es una tarea posterior, que necesita el dominio y el servidor.

## Decisiones técnicas y comprobaciones manuales

| Decisiones técnicas (diseño y pruebas automáticas)                         | Comprobaciones manuales en Moodle (solo una instancia real)              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Estructura del paquete y reglas del perfil exportado (sin XSD)             | Que Moodle lo importe sin errores: **condición de aceptación**            |
| Codificación del estado y máximo de temas                                  | Que conserve el recorrido al salir y volver en el mismo intento           |
| Llamadas a la API y su orden, probadas contra un doble                     | Que muestre la actividad finalizada y sin calificación                    |
| Ausencia de URL externas en el paquete                                     | Que no haya peticiones a otros servidores durante el recorrido            |
| Texto de las instrucciones                                                 | Que las instrucciones basten y qué versión y configuración se nombran     |

Un resultado negativo de la columna derecha es un defecto que vuelve al diseño. Ninguna
decisión de la columna izquierda acredita compatibilidad.

## Fuera de este plan

OCR, edición en tiempo real, evaluación calificable, publicación automática en Moodle, el
certificado completo, borrado y retención para producción, registro libre de usuarios,
recuperación de contraseñas por correo, varias instancias o alta disponibilidad, un perfil de
solo lectura y más de un proveedor real de generación.

## Complexity Tracking

No hay violaciones de la constitución que justificar. Se anotan las adiciones, como exige el
principio XII.

| Adición                                 | Por qué hace falta                                                | Alternativa más simple descartada porque                           |
| --------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Frontera HTTP con rutas y cuerpos       | El producto necesita interfaz, formularios y subida de PDF        | No hay producto con una única ruta; se registra en el ADR 0004     |
| Cuatro áreas nuevas en `src/platform`   | Persistencia, identidad, auditoría y generación son transversales | Ponerlas en una capa rompería el orden de dependencias             |
| Proxy inverso con TLS                   | El piloto se usa desde otros equipos                              | TLS en la aplicación duplicaría lo que el proxy hace               |
| `qpdf` (herramienta externa)            | Estructura interpretada del PDF para aplicar la política          | Las consultas de `pdfjs-dist` y la búsqueda en bytes fallaron      |
| `pdfjs-dist`                            | Texto por página del PDF                                          | Una herramienta del sistema difiere entre macOS y Linux            |
| `fflate`                                | Crear y releer el ZIP                                             | Un escritor propio solo fallaría al importar                       |
| `libxml2-wasm`                        | Leer el manifiesto con un analizador mantenido, ajeno al generador | Un lector propio repite las suposiciones del generador; sustituye a `xmllint-wasm` |
| `jsdom` (desarrollo)                    | Probar el seguimiento del paquete contra un doble                 | Un navegador automatizado es desproporcionado                      |

## Datos externos que bloquean tareas concretas

Nada de esto bloquea los pasos 2 a 8 con el adaptador determinista.

| Dato                                                                           | Tarea que bloquea                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Dominio y servidor de destino                                                  | Despliegue real y copia de seguridad en el destino (paso 9)              |
| Proveedor, modelo, moneda, precios y presupuesto real, con cuenta de API       | Adaptador real y cualquier generación de pago (paso 10)                  |
| Instancia de Moodle de pruebas y su versión                                    | Comprobación manual y texto final de las instrucciones (paso 11)         |
