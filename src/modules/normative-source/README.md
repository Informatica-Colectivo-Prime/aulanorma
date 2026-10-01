# Capa: fuente normativa (`normative-source`)

**Responsabilidad**: PDF original inmutable y texto extraído por página.

Es la primera de las cuatro capas del principio II de la constitución. La fuente normativa no se
modifica: las correcciones de interpretación se registran como anotaciones trazables en la capa
de interpretación estructurada.

## Estado

Vacía en esta funcionalidad. `index.ts` solo contiene `export {};`: no hay lógica de producto ni
datos de ningún certificado.

## Dependencias permitidas

- `platform`, a través de su API pública (`@/platform/<área>`).
- Ninguna capa de dominio.

## API pública

El único punto de acceso a esta capa es su `index.ts` (`@/modules/normative-source`). Importar
sus rutas internas (`@/modules/normative-source/<interno>`) está prohibido. Según la matriz de
dependencias, solo `structured-interpretation` puede importarla; ni `platform` ni la entrega
HTTP (`server.mjs` y `src/pages/api/health.ts`) pueden hacerlo.

## Cómo se imponen los límites

Con `no-restricted-imports` de ESLint (`eslint.config.mjs`), comprobado por `npm run check:lint`,
y con `tests/architecture/import-boundaries.test.ts`, comprobado por `npm run check:test`. La
matriz completa y el resto de reglas están en
[`docs/engineering/architecture.md`](../../../docs/engineering/architecture.md).
