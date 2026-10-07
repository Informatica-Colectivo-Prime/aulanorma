# Capa: interpretación estructurada (`structured-interpretation`)

**Responsabilidad**: representación validada del certificado.

Es la segunda de las cuatro capas del principio II de la constitución. Consume la fuente
normativa solo a través de su contrato público y registra aquí, como anotaciones trazables, las
correcciones de interpretación.

## Estado

Implementada con la historia 1 de `002-boe-scorm-export`. Obtiene la interpretación de una
unidad formativa a través de la interfaz de generación, y solo la guarda si cumple su esquema,
cada página existe y cada cita aparece en el texto de su página. Registra correcciones,
validaciones y rechazos, con control de revisión: una validación solo está vigente mientras su
revisión es la actual. Validar es siempre una acción humana explícita. No contiene datos de
ningún certificado.

## Dependencias permitidas

- `platform`, a través de su API pública (`@/platform/<área>`).
- `normative-source`, a través de su API pública (`@/modules/normative-source`).

## API pública

El único punto de acceso a esta capa es su `index.ts` (`@/modules/structured-interpretation`).
Importar sus rutas internas (`@/modules/structured-interpretation/<interno>`) está prohibido.
Según la matriz de dependencias, pueden importarla `didactic-content`, las rutas de producto
de `src/pages` y las vistas de `src/views`; ni `platform`, ni `server.mjs`, ni la comprobación
de estado (`src/pages/api/health.ts`) pueden hacerlo.

## Cómo se imponen los límites

Con `no-restricted-imports` de ESLint (`eslint.config.mjs`), comprobado por `npm run check:lint`,
y con `tests/architecture/import-boundaries.test.ts`, comprobado por `npm run check:test`. La
matriz completa y el resto de reglas están en
[`docs/engineering/architecture.md`](../../../docs/engineering/architecture.md).
