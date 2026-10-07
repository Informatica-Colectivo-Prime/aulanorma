# Capa: exportación (`content-export`)

**Responsabilidad**: transformar el índice y el contenido aprobados en un paquete descargable
en el formato de exportación vigente, SCORM 1.2.

Es la cuarta de las cuatro capas del principio II de la constitución. No genera ni altera
contenido didáctico: solo transforma contenido aprobado al formato de exportación.

**Origen**. Esta capa era la publicación automática en Moodle hasta la versión 1.1.0 de la
constitución, con el nombre `moodle-publication`. El
[ADR 0003](../../../docs/adr/0003-scorm-export-instead-of-automatic-moodle-publication.md) la
sustituye por la exportación y fija esta ubicación, `src/modules/content-export`.

## Estado

Vacía en esta funcionalidad. `index.ts` solo contiene `export {};`: no hay lógica de producto,
datos de ningún certificado ni exportación.

## Dependencias permitidas

- `platform`, a través de su API pública (`@/platform/<área>`).
- `didactic-content`, a través de su API pública (`@/modules/didactic-content`).

## API pública

El único punto de acceso a esta capa es su `index.ts` (`@/modules/content-export`). Importar
sus rutas internas (`@/modules/content-export/<interno>`) está prohibido. Según la matriz de
dependencias, ninguna otra capa puede importarla, y tampoco `platform` ni la entrega HTTP
(`server.mjs` y `src/pages/api/health.ts`).

## Cómo se imponen los límites

Con `no-restricted-imports` de ESLint (`eslint.config.mjs`), comprobado por `npm run check:lint`,
y con `tests/architecture/import-boundaries.test.ts`, comprobado por `npm run check:test`. La
matriz completa y el resto de reglas están en
[`docs/engineering/architecture.md`](../../../docs/engineering/architecture.md).
