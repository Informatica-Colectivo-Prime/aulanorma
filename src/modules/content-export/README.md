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

Implementada en la fase 7 de `specs/002-boe-scorm-export`:

- `package/`: el documento único del paquete, con el renderizador de `didactic-content`, y
  sus dos recursos, `assets/style.css` y `assets/app.js` (navegación y seguimiento con la API
  de SCORM 1.2).
- `build.ts`: manifiesto y ZIP, con entradas en orden y fecha fijos.
- `conformance.ts` y `xml.ts`: comprobación del paquete al releerlo, con las reglas que los
  esquemas no expresan. **No valida contra los XSD oficiales**: su procedencia no está
  acreditada ([`scorm-schemas.md`](../../../specs/002-boe-scorm-export/scorm-schemas.md)).
- `instructions/`: instrucciones de incorporación manual. No nombran ninguna versión de
  Moodle, porque no se ha comprobado ninguna.
- `index.ts`: exportar, descargar, vista previa e historial. La vigencia de la versión y la
  cobertura se comprueban en cada exportación y en cada descarga.

No hay ningún dato de ningún certificado: el contenido llega de la versión aprobada.

## Dependencias permitidas

- `platform`, a través de su API pública (`@/platform/<área>`).
- `didactic-content`, a través de su API pública (`@/modules/didactic-content`).

## API pública

El único punto de acceso a esta capa es su `index.ts` (`@/modules/content-export`). Importar
sus rutas internas (`@/modules/content-export/<interno>`) está prohibido. Según la matriz de
dependencias, ninguna otra capa puede importarla, y tampoco `platform`, `server.mjs` ni la
comprobación de estado. La importan las páginas de producto y sus vistas.

## Cómo se imponen los límites

Con `no-restricted-imports` de ESLint (`eslint.config.mjs`), comprobado por `npm run check:lint`,
y con `tests/architecture/import-boundaries.test.ts`, comprobado por `npm run check:test`. La
matriz completa y el resto de reglas están en
[`docs/engineering/architecture.md`](../../../docs/engineering/architecture.md).
