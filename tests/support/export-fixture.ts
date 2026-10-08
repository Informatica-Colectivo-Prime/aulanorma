// Montaje de las pruebas de exportación: un temario con una versión aprobada
// sobre el montaje del índice, y el servicio de exportación con un directorio
// de datos temporal. Las aprobaciones son de una cuenta de prueba.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createContentExport } from "@/modules/content-export";
import type {
  ContentExport,
  ContentExportOptions,
  PackageAssets,
} from "@/modules/content-export";
import type { Database } from "@/platform/persistence";
import { createOutlineFixture, TEACHER } from "./outline-fixture";
import type { OutlineFixture } from "./outline-fixture";
import { syllabusHelpers } from "./syllabus-helpers";
import type { SyllabusHelpers } from "./syllabus-helpers";

const ASSETS = fileURLToPath(
  new URL("../../src/modules/content-export/package/assets/", import.meta.url),
);

export const PACKAGE_ASSETS: PackageAssets = {
  script: readFileSync(path.join(ASSETS, "app.js"), "utf8"),
  style: readFileSync(path.join(ASSETS, "style.css"), "utf8"),
};

export const PRESENTATION = {
  documentTitle: "Documento sintético",
  kindNames: {
    capacity: "Capacidad",
    criterion: "Criterio de evaluación",
    content: "Contenido",
  },
} as const;

export interface ExportFixture {
  readonly outline: OutlineFixture;
  readonly helpers: SyllabusHelpers;
  readonly outlineId: string;
  readonly versionId: string;
  readonly dataDir: string;
  exports: ContentExport;
  // Otro servicio sobre los mismos datos, con opciones distintas.
  service(overrides: Partial<ContentExportOptions>): ContentExport;
  clock: number;
  dispose(): void;
}

// Por defecto, con la base de datos en memoria y un directorio de datos
// temporal. Una prueba de copia y restauración indica los suyos.
export async function createExportFixture(
  store: { readonly db?: Database; readonly dataDir?: string } = {},
): Promise<ExportFixture> {
  const outline = await createOutlineFixture(store.db);
  const outlineId = await outline.approvedOutline();
  await outline.syllabus.generate({ ...TEACHER, outlineId });
  const helpers = syllabusHelpers(outline, outlineId);
  helpers.approveAllTopics();
  const approved = helpers.approveVersion();
  if (!approved.ok) {
    throw new Error(`La versión debía aprobarse: ${approved.reason}.`);
  }
  const dataDir =
    store.dataDir ?? mkdtempSync(path.join(tmpdir(), "aulanorma-export-"));
  const fixture: ExportFixture = {
    outline,
    helpers,
    outlineId,
    versionId: approved.versionId,
    dataDir,
    clock: 1_800_000_000_000,
    service(overrides) {
      return createContentExport({
        db: outline.db,
        audit: outline.audit,
        syllabus: outline.syllabus,
        dataDir,
        assets: PACKAGE_ASSETS,
        deterministicProvider: false,
        userData: () => [TEACHER.actorId],
        now: () => {
          fixture.clock += 1000;
          return fixture.clock;
        },
        ...overrides,
      });
    },
    exports: undefined as unknown as ContentExport,
    dispose() {
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
  fixture.exports = fixture.service({});
  return fixture;
}
