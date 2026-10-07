# Capa: contenido didáctico (`didactic-content`)

**Responsabilidad**: materiales, actividades y evaluaciones generados.

Es la tercera de las cuatro capas del principio II de la constitución. Consume la interpretación
estructurada solo a través de su contrato público.

## Estado

Vacía en esta funcionalidad. `index.ts` solo contiene `export {};`: no hay lógica de producto ni
datos de ningún certificado.

## Dependencias permitidas

- `platform`, a través de su API pública (`@/platform/<área>`).
- `structured-interpretation`, a través de su API pública
  (`@/modules/structured-interpretation`).

## API pública

El único punto de acceso a esta capa es su `index.ts` (`@/modules/didactic-content`). Importar
sus rutas internas (`@/modules/didactic-content/<interno>`) está prohibido. Según la matriz de
dependencias, solo `content-export` puede importarla; ni `platform` ni la entrega HTTP
(`server.mjs` y `src/pages/api/health.ts`) pueden hacerlo.

## Cómo se imponen los límites

Con `no-restricted-imports` de ESLint (`eslint.config.mjs`), comprobado por `npm run check:lint`,
y con `tests/architecture/import-boundaries.test.ts`, comprobado por `npm run check:test`. La
matriz completa y el resto de reglas están en
[`docs/engineering/architecture.md`](../../../docs/engineering/architecture.md).
