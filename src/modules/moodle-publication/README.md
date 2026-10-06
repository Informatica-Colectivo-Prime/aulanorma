# Capa: publicación en Moodle (`moodle-publication`)

**Responsabilidad**: correspondencia entre el contenido aprobado y Moodle.

Es la cuarta de las cuatro capas del principio II de la constitución. No genera ni altera
contenido didáctico: solo transforma contenido aprobado al formato de Moodle.

## Estado

Vacía en esta funcionalidad. `index.ts` solo contiene `export {};`: no hay lógica de producto,
datos de ningún certificado ni integración con Moodle.

## Dependencias permitidas

- `platform`, a través de su API pública (`@/platform/<área>`).
- `didactic-content`, a través de su API pública (`@/modules/didactic-content`).

## API pública

El único punto de acceso a esta capa es su `index.ts` (`@/modules/moodle-publication`). Importar
sus rutas internas (`@/modules/moodle-publication/<interno>`) está prohibido. Según la matriz de
dependencias, ninguna otra capa puede importarla, y tampoco `platform` ni la entrega HTTP
(`server.mjs` y `src/pages/api/health.ts`).

## Cómo se imponen los límites

Con `no-restricted-imports` de ESLint (`eslint.config.mjs`), comprobado por `npm run check:lint`,
y con `tests/architecture/import-boundaries.test.ts`, comprobado por `npm run check:test`. La
matriz completa y el resto de reglas están en
[`docs/engineering/architecture.md`](../../../docs/engineering/architecture.md).
