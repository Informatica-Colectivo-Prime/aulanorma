// Orden de publicación de un fichero (specs/002-boe-scorm-export: research.md,
// R11, reglas de escritura; FR-069).
//
// Un fichero debe estar publicado del todo antes de que se confirme la fila
// que lo referencia: escrito y sincronizado a disco, renombrado a su nombre
// definitivo, y con su directorio sincronizado, incluidos los directorios que
// haya habido que crear. Aquí se observa esa secuencia de llamadas al sistema
// de ficheros y, en cada una, que la fila aún no existe.
//
// Comprueba el orden de las llamadas. No comprueba qué queda en el disco tras
// una caída completa de la máquina: eso depende del sistema de ficheros y del
// equipo, y no se ha probado.
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { openDatabase, putBlob } from "@/platform/persistence";
import type { Database } from "@/platform/persistence";
import { createExportFixture, PRESENTATION } from "../support/export-fixture";
import type { ExportFixture } from "../support/export-fixture";
import { TEACHER } from "../support/outline-fixture";

interface Step {
  readonly call: "mkdir" | "sync" | "rename";
  readonly target: string;
  // Filas de exportación confirmadas en ese momento.
  readonly rows: number;
}

const observed = vi.hoisted(() => ({
  steps: [] as { call: string; target: string }[],
  descriptors: new Map<number, string>(),
  onStep: undefined as (() => void) | undefined,
}));

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const note = (call: string, target: string): void => {
    observed.steps.push({ call, target });
    observed.onStep?.();
  };
  const mocked = {
    ...fs,
    openSync: ((...args: Parameters<typeof fs.openSync>) => {
      const descriptor = fs.openSync(...args);
      observed.descriptors.set(descriptor, String(args[0]));
      return descriptor;
    }) as typeof fs.openSync,
    fsyncSync: ((descriptor: number) => {
      fs.fsyncSync(descriptor);
      note("sync", observed.descriptors.get(descriptor) ?? "?");
    }) as typeof fs.fsyncSync,
    renameSync: ((from: string, to: string) => {
      fs.renameSync(from, to);
      note("rename", to);
    }) as typeof fs.renameSync,
    mkdirSync: ((...args: Parameters<typeof fs.mkdirSync>) => {
      const result = fs.mkdirSync(...args);
      note("mkdir", String(args[0]));
      return result;
    }) as typeof fs.mkdirSync,
  };
  return { ...mocked, default: mocked };
});

let root: string;
let dataDir: string;
let db: Database;
let fixture: ExportFixture;
let rows: number[];

// Rutas relativas al directorio de datos; un temporal se anota como tal.
function steps(): Step[] {
  return observed.steps.map(({ call, target }, index) => {
    const relative = path.relative(dataDir, target) || ".";
    return {
      call: call as Step["call"],
      target: relative
        .replace(/\.tmp-[0-9a-f]{16}$/, "<temporal>")
        .replace(/[0-9a-f]{32}\.zip\.[0-9a-f]{12}\.tmp$/, "<temporal>")
        .replace(/[0-9a-f]{32}\.zip$/, "<paquete>")
        .replace(/[0-9a-f]{64}$/, "<huella>")
        .replace(/blobs\/[0-9a-f]{2}/, "blobs/<xx>"),
      rows: rows[index] ?? -1,
    };
  });
}

function exportRows(): number {
  return Number(
    db.prepare("SELECT count(*) AS n FROM package_export").get()?.n ?? -1,
  );
}

function watch(): void {
  observed.steps.length = 0;
  rows = [];
  observed.onStep = () => {
    rows.push(exportRows());
  };
}

beforeEach(async () => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "aulanorma-orden-")));
  dataDir = path.join(root, "datos");
  db = openDatabase(dataDir);
  fixture = await createExportFixture({ db, dataDir });
});

afterEach(() => {
  observed.onStep = undefined;
  db.close();
  rmSync(root, { recursive: true, force: true });
});

describe("publicación antes de la referencia", () => {
  test("un documento nuevo: directorios, fichero, nombre definitivo y directorio, en ese orden", () => {
    watch();
    const sha256 = putBlob(dataDir, Buffer.from("contenido de prueba"));

    expect(steps().map(({ call, target }) => `${call} ${target}`)).toEqual([
      "mkdir blobs",
      "sync .",
      "mkdir blobs/<xx>",
      "sync blobs",
      "sync blobs/<xx>/<temporal>",
      "rename blobs/<xx>/<huella>",
      "sync blobs/<xx>",
    ]);

    // Otro documento en el mismo directorio no crea nada.
    for (let index = 0; index < 5000; index += 1) {
      watch();
      const other = putBlob(dataDir, Buffer.from(`otro ${String(index)}`));
      if (other.slice(0, 2) === sha256.slice(0, 2)) {
        break;
      }
    }
    expect(steps().map(({ call, target }) => `${call} ${target}`)).toEqual([
      "sync blobs/<xx>/<temporal>",
      "rename blobs/<xx>/<huella>",
      "sync blobs/<xx>",
    ]);
  });

  test("un documento que ya estaba: se sincroniza de nuevo, sin reescribirlo", () => {
    const content = Buffer.from("contenido repetido");
    putBlob(dataDir, content);
    watch();
    putBlob(dataDir, content);

    expect(steps().map(({ call, target }) => `${call} ${target}`)).toEqual([
      "sync blobs/<xx>/<huella>",
      "sync blobs/<xx>",
    ]);
  });

  test("un paquete exportado: publicado del todo antes de confirmar su fila", () => {
    expect(exportRows()).toBe(0);
    watch();
    const result = fixture.exports.export({
      ...TEACHER,
      ...PRESENTATION,
      versionId: fixture.versionId,
    });
    observed.onStep = undefined;

    expect(result.ok).toBe(true);
    // Ningún paso de la publicación ve todavía la fila.
    expect(steps()).toEqual([
      { call: "mkdir", target: "exports", rows: 0 },
      { call: "sync", target: ".", rows: 0 },
      { call: "sync", target: "exports/<temporal>", rows: 0 },
      { call: "rename", target: "exports/<paquete>", rows: 0 },
      { call: "sync", target: "exports", rows: 0 },
    ]);
    expect(exportRows()).toBe(1);
  });

  test("si la sincronización del paquete falla, no se confirma ninguna fila ni queda fichero", () => {
    watch();
    observed.onStep = () => {
      if (observed.steps.at(-1)?.call === "rename") {
        // El directorio desaparece antes de poder sincronizarlo.
        rmSync(path.join(dataDir, "exports"), { recursive: true, force: true });
      }
    };
    const result = fixture.exports.export({
      ...TEACHER,
      ...PRESENTATION,
      versionId: fixture.versionId,
    });
    observed.onStep = undefined;

    expect(result).toMatchObject({ ok: false, reason: "storage_error" });
    expect(
      db
        .prepare("SELECT status, package_sha256 FROM package_export")
        .all()
        .map((row) => ({ ...row })),
    ).toEqual([{ status: "failed", package_sha256: null }]);
  });
});
