# Capa: fuente normativa (`normative-source`)

**Responsabilidad**: PDF original inmutable y texto extraído por página.

Es la primera de las cuatro capas del principio II de la constitución. La fuente normativa no se
modifica: las correcciones de interpretación se registran como anotaciones trazables en la capa
de interpretación estructurada.

## Estado

Implementada con la historia 1 de `002-boe-scorm-export`. Registra el PDF oficial con su
procedencia y su huella, conserva el original en el almacén de ficheros y el texto de cada
página, y registra la resolución de las páginas sin texto y la relación de sustitución entre
documentos. El documento y sus páginas son inmutables: no hay ninguna operación que los
modifique ni los borre.

El tratamiento del PDF está en `pdf/`: `analyze.ts` valida el fichero y coordina la inspección
estructural con qpdf y la extracción con `pdfjs-dist`; `policy.ts` es la política propia sobre
la estructura; `policy-child.ts` y `extract-child.ts` son los procesos hijos. No contiene datos
de ningún certificado.

## Dependencias permitidas

- `platform`, a través de su API pública (`@/platform/<área>`).
- Ninguna capa de dominio.

## API pública

El único punto de acceso a esta capa es su `index.ts` (`@/modules/normative-source`). Importar
sus rutas internas (`@/modules/normative-source/<interno>`) está prohibido. Según la matriz de
dependencias, pueden importarla `structured-interpretation`, las rutas de producto de
`src/pages` y las vistas de `src/views`; ni `platform`, ni `server.mjs`, ni la comprobación de
estado (`src/pages/api/health.ts`) pueden hacerlo.

## Cómo se imponen los límites

Con `no-restricted-imports` de ESLint (`eslint.config.mjs`), comprobado por `npm run check:lint`,
y con `tests/architecture/import-boundaries.test.ts`, comprobado por `npm run check:test`. La
matriz completa y el resto de reglas están en
[`docs/engineering/architecture.md`](../../../docs/engineering/architecture.md).
