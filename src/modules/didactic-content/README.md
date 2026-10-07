# Capa: contenido didáctico (`didactic-content`)

**Responsabilidad**: materiales, actividades y evaluaciones generados.

Es la tercera de las cuatro capas del principio II de la constitución. Consume la interpretación
estructurada solo a través de su contrato público.

## Estado

Contiene el **índice del temario** (historia 2 de `specs/002-boe-scorm-export`):

- la propuesta de índice a partir de una interpretación validada y vigente, a través de la
  interfaz de generación, con su esquema y la comprobación de que cada entrada se apoya en
  requisitos que existen o va marcada «sin respaldo normativo»;
- la edición con control de revisión: añadir, renombrar, cambiar vínculos, reordenar y quitar
  entradas, sin borrar nada;
- la cobertura (`coverage.ts`), calculada por vínculos explícitos y sin herencia;
- la aprobación, que exige cobertura completa, y el rechazo, con motivo obligatorio;
- la vigencia derivada de cada aprobación.

Y el **temario** (historia 3):

- el contenido estructurado de un tema y su renderizador, que escapa todo el texto
  (`render/`);
- la generación tema a tema, con temas fallidos, sin reintentos automáticos y con reanudación
  explícita (`syllabus.ts`);
- la edición de bloques con control de revisión, y la aprobación y el rechazo de cada tema;
- el desarrollo de cada requisito: su cita y, además, contenido que lo desarrolle;
- la aprobación de una versión, con su instantánea inmutable;
- la comprobación de referencias heredadas tras un documento sustituto (`references.ts`).

No hay datos de ningún certificado: el código de la unidad es un dato.

## Dependencias permitidas

- `platform`, a través de su API pública (`@/platform/<área>`).
- `structured-interpretation`, a través de su API pública
  (`@/modules/structured-interpretation`).

## API pública

El único punto de acceso a esta capa es su `index.ts` (`@/modules/didactic-content`). Importar
sus rutas internas (`@/modules/didactic-content/<interno>`) está prohibido. Según la matriz de
dependencias, pueden importarla `content-export`, las rutas de producto de `src/pages` y las
vistas de `src/views`; ni `platform`, ni `server.mjs`, ni la comprobación de estado
(`src/pages/api/health.ts`) pueden hacerlo.

## Cómo se imponen los límites

Con `no-restricted-imports` de ESLint (`eslint.config.mjs`), comprobado por `npm run check:lint`,
y con `tests/architecture/import-boundaries.test.ts`, comprobado por `npm run check:test`. La
matriz completa y el resto de reglas están en
[`docs/engineering/architecture.md`](../../../docs/engineering/architecture.md).
