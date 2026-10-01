# Capa: interpretación estructurada (`structured-interpretation`)

**Responsabilidad**: representación validada del certificado.

Es la segunda de las cuatro capas del principio II de la constitución. Consume la fuente
normativa solo a través de su contrato público y registra aquí, como anotaciones trazables, las
correcciones de interpretación.

## Estado

Vacía en esta funcionalidad. `index.ts` solo contiene `export {};`: no hay lógica de producto ni
datos de ningún certificado.

## Dependencias permitidas

- `platform`, a través de su API pública (`@/platform/<área>`).
- `normative-source`, a través de su API pública (`@/modules/normative-source`).

## API pública

El único punto de acceso a esta capa es su `index.ts` (`@/modules/structured-interpretation`).
Importar sus rutas internas (`@/modules/structured-interpretation/<interno>`) está prohibido.
Según la matriz de dependencias, solo `didactic-content` puede importarla; ni `platform` ni la
entrega HTTP (`server.mjs` y `src/pages/api/health.ts`) pueden hacerlo.

## Cómo se imponen los límites

Con `no-restricted-imports` de ESLint (`eslint.config.mjs`), comprobado por `npm run check:lint`,
y con `tests/architecture/import-boundaries.test.ts`, comprobado por `npm run check:test`. La
matriz completa y el resto de reglas están en
[`docs/engineering/architecture.md`](../../../docs/engineering/architecture.md).
