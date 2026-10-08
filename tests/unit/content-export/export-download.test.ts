// Exportar y descargar (specs/002-boe-scorm-export: T060 y T066; escenarios
// 1, 3, 4, 7 y 8 de la historia 4; FR-030, FR-031, FR-035 a FR-039 y FR-062;
// SC-025 y SC-031).
//
// La vigencia y la cobertura se comprueban en cada petición; cada intento se
// registra; un fallo no deja fichero; y el paquete de una versión invalidada
// se conserva sin poder descargarse. Las aprobaciones del montaje son de una
// cuenta de prueba y el contenido, respuestas simuladas.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { checkPackage, NOT_VERIFIED } from "@/modules/content-export";
import type { ExportResult } from "@/modules/content-export";
import type { Syllabus, SyllabusReview } from "@/modules/didactic-content";
import {
  createExportFixture,
  PRESENTATION,
} from "../../support/export-fixture";
import type { ExportFixture } from "../../support/export-fixture";
import { OTHER_TEACHER, TEACHER } from "../../support/outline-fixture";

let fixture: ExportFixture;

beforeEach(async () => {
  fixture = await createExportFixture();
});

afterEach(() => {
  fixture.dispose();
});

const exportNow = (versionId = fixture.versionId): ExportResult =>
  fixture.exports.export({ ...TEACHER, ...PRESENTATION, versionId });

function succeeded(result: ExportResult) {
  if (!result.ok) {
    throw new Error(`La exportación debía completarse: ${result.reason}.`);
  }
  return result.record;
}

function refused(result: ExportResult) {
  if (result.ok) {
    throw new Error("La exportación debía rechazarse.");
  }
  return result;
}

const storedFiles = (): string[] =>
  existsSync(path.join(fixture.dataDir, "exports"))
    ? readdirSync(path.join(fixture.dataDir, "exports"))
    : [];

const count = (table: string): number =>
  Number(
    fixture.outline.db.prepare(`SELECT count(*) AS total FROM ${table}`).get()
      ?.total,
  );

const auditOf = (action: string): unknown[] =>
  fixture.outline.audit
    .list()
    .filter((event) => event.action === action)
    .map(({ result, details }) => ({ result, ...details }));

// Invalida la versión editando un tema ya aprobado.
function editTopic(): void {
  const topic = fixture.helpers.review().topics[0];
  const block = topic?.topic?.blocks.find(
    (item) => item.kind === "development" && !item.removed,
  );
  const result = fixture.outline.syllabus.editBlock({
    ...fixture.helpers.target(topic?.entry.title ?? ""),
    blockId: block?.id ?? "",
    block: {
      text: "Texto cambiado después de aprobar.",
      requirementIds: block?.requirementIds ?? [],
    },
  });
  expect(result.ok).toBe(true);
}

describe("exportar una versión vigente", () => {
  test("genera un paquete comprobado, con su huella, y registra el intento", () => {
    const record = succeeded(exportNow());
    expect(record.status).toBe("succeeded");
    expect(record.versionId).toBe(fixture.versionId);
    expect(record.exportedBy).toBe(TEACHER.actorId);
    expect(record.problems).toEqual([]);
    expect(storedFiles()).toEqual([`${record.id}.zip`]);
    const stored = readFileSync(
      path.join(fixture.dataDir, "exports", `${record.id}.zip`),
    );
    // La huella registrada es la del fichero guardado (FR-035).
    expect(createHash("sha256").update(stored).digest("hex")).toBe(
      record.sha256,
    );
    expect(record.sizeBytes).toBe(stored.length);
    expect(
      checkPackage(stored, {
        delivery: true,
        manifestIdentifier: `aulanorma-${fixture.versionId}`,
        versionId: fixture.versionId,
        forbidden: [TEACHER.actorId],
      }).problems,
    ).toEqual([]);
    expect(auditOf("export.create")).toEqual([
      { result: "ok", version: fixture.versionId, sha256: record.sha256 },
    ]);
    expect(
      fixture.exports
        .overview(fixture.outlineId)
        ?.exports.map((item) => item.id),
    ).toEqual([record.id]);
  });

  test("el paquete lleva todos los temas aprobados y no dice quién aprobó ni quién exporta", () => {
    const record = succeeded(exportNow());
    const files = unzipSync(
      readFileSync(path.join(fixture.dataDir, "exports", `${record.id}.zip`)),
    );
    const html = strFromU8(files["index.html"] ?? new Uint8Array());
    for (const item of fixture.helpers.review().topics) {
      expect(html).toContain(item.entry.title);
    }
    expect(html).toContain(fixture.versionId);
    const all = Object.values(files)
      .map((file) => strFromU8(file))
      .join("\n");
    expect(all).not.toContain(TEACHER.actorId);
    expect(all).not.toContain(OTHER_TEACHER.actorId);
  });

  test("el contenido de respuestas simuladas se exporta identificado como ensayo", () => {
    const record = succeeded(exportNow());
    expect(record.trial).toBe(true);
    const files = unzipSync(
      readFileSync(path.join(fixture.dataDir, "exports", `${record.id}.zip`)),
    );
    expect(strFromU8(files["index.html"] ?? new Uint8Array())).toContain(
      "Paquete de ensayo",
    );
  });

  test("exportar dos veces la misma versión da el mismo fichero y dos registros (SC-014)", () => {
    const first = succeeded(exportNow());
    const second = succeeded(
      fixture.exports.export({
        ...OTHER_TEACHER,
        ...PRESENTATION,
        versionId: fixture.versionId,
      }),
    );
    expect(second.id).not.toBe(first.id);
    expect(second.sha256).toBe(first.sha256);
    expect(count("package_export")).toBe(2);
  });
});

describe("exportar sin aprobación vigente o sin cobertura", () => {
  test("una versión que no existe se deniega y se audita, sin registro de exportación", () => {
    for (const versionId of ["f".repeat(32), "no-es-un-identificador", ""]) {
      expect(refused(exportNow(versionId)).reason).toBe("not_found");
    }
    expect(count("package_export")).toBe(0);
    expect(auditOf("export.create")).toHaveLength(3);
    expect(storedFiles()).toEqual([]);
  });

  test.each([
    [
      "se edita un tema aprobado",
      () => {
        editTopic();
      },
    ],
    [
      "se reordena el índice",
      () => {
        const result = fixture.outline.outlines.moveEntry({
          ...TEACHER,
          outlineId: fixture.outlineId,
          revision: 1,
          entryId: fixture.helpers.review().topics[0]?.entry.id ?? "",
          direction: "down",
        });
        expect(result.ok).toBe(true);
      },
    ],
    [
      "el documento tiene un sustituto",
      () => {
        fixture.outline.supersede();
      },
    ],
  ])(
    "si %s, la versión deja de estar vigente y no se exporta",
    (_name, change) => {
      change();
      const result = refused(exportNow());
      expect(result.reason).toBe("not_current");
      expect(result.record?.status).toBe("failed");
      expect(result.record?.failure).toBe("not_current");
      expect(result.record?.sha256).toBeNull();
      expect(storedFiles()).toEqual([]);
      expect(auditOf("export.create")).toEqual([
        { result: "failed", version: fixture.versionId, reason: "not_current" },
      ]);
      expect(
        fixture.exports.overview(fixture.outlineId)?.deliverability,
      ).toMatchObject({ deliverable: false, reason: "not_current" });
    },
  );

  test("una versión anterior, sustituida por otra edición, tampoco se exporta", () => {
    editTopic();
    // Solo el tema editado necesita aprobarse de nuevo.
    expect(
      fixture.helpers.approveTopic(
        fixture.helpers.review().topics[0]?.entry.title ?? "",
      ).ok,
    ).toBe(true);
    const second = fixture.helpers.approveVersion();
    expect(second.ok).toBe(true);
    expect(refused(exportNow(fixture.versionId)).reason).toBe("not_current");
    expect(
      succeeded(exportNow(second.ok ? second.versionId : "")).versionId,
    ).not.toBe(fixture.versionId);
  });

  test("con un requisito sin cubrir en ese momento se deniega con lo pendiente, aunque la versión figure vigente (SC-025)", () => {
    // Defensa en profundidad: se fuerza un estado que el temario no debería
    // producir, para comprobar que exportar no confía solo en la vigencia.
    const real = fixture.outline.syllabus;
    const pending = (review: SyllabusReview): SyllabusReview => {
      const item = review.development.items[0];
      return item === undefined
        ? review
        : {
            ...review,
            development: {
              ...review.development,
              pending: [item],
              complete: false,
            },
            blockers: { ...review.blockers, development: [item] },
          };
    };
    const syllabus: Syllabus = {
      ...real,
      review: (outlineId) => {
        const review = real.review(outlineId);
        return review === undefined ? undefined : pending(review);
      },
    };
    const service = fixture.service({ syllabus });
    const result = service.export({
      ...TEACHER,
      ...PRESENTATION,
      versionId: fixture.versionId,
    });
    expect(refused(result).reason).toBe("incomplete");
    expect(storedFiles()).toEqual([]);
    const deliverability = service.overview(fixture.outlineId)?.deliverability;
    expect(deliverability?.reason).toBe("incomplete");
    expect(deliverability?.requirements).toHaveLength(1);
    // Tampoco se descarga un paquete exportado antes.
    const earlier = succeeded(exportNow());
    expect(
      service.download({ ...TEACHER, exportId: earlier.id, item: "package" }),
    ).toMatchObject({ ok: false, reason: "incomplete" });
  });
});

describe("fallos de generación", () => {
  test("si no se puede guardar el fichero, queda registrado el fallo y ningún fichero", () => {
    const service = fixture.service({
      writeFile: () => {
        throw new Error("disco lleno");
      },
    });
    const result = refused(
      service.export({
        ...TEACHER,
        ...PRESENTATION,
        versionId: fixture.versionId,
      }),
    );
    expect(result.reason).toBe("storage_error");
    expect(storedFiles()).toEqual([]);
    const [record] = service.overview(fixture.outlineId)?.exports ?? [];
    expect(record).toMatchObject({
      status: "failed",
      failure: "storage_error",
      sha256: null,
      sizeBytes: null,
    });
    // No hay nada que descargar de ese intento.
    expect(
      service.download({
        ...TEACHER,
        exportId: record?.id ?? "",
        item: "package",
      }),
    ).toMatchObject({ ok: false, reason: "unavailable" });
  });

  test("si el fichero se escribe truncado, se detecta al releerlo y no queda nada", () => {
    const service = fixture.service({
      writeFile: (file, data) => {
        writeFileSync(file, data.slice(0, data.length - 10));
      },
    });
    expect(
      refused(
        service.export({
          ...TEACHER,
          ...PRESENTATION,
          versionId: fixture.versionId,
        }),
      ).reason,
    ).toBe("storage_error");
    expect(storedFiles()).toEqual([]);
  });

  test("un paquete que no supera la comprobación no se guarda, y el registro dice por qué", () => {
    const service = fixture.service({
      assets: {
        script: 'fetch("https://example.invalid/seguimiento");',
        style: "",
      },
    });
    const result = refused(
      service.export({
        ...TEACHER,
        ...PRESENTATION,
        versionId: fixture.versionId,
      }),
    );
    expect(result.reason).toBe("invalid_package");
    expect(result.record?.problems.join("\n")).toMatch(/dirección externa/);
    expect(storedFiles()).toEqual([]);
  });

  test("un paquete con un dato de usuario no se guarda (FR-033)", () => {
    const service = fixture.service({ userData: () => ["Tema 1"] });
    expect(
      refused(
        service.export({
          ...TEACHER,
          ...PRESENTATION,
          versionId: fixture.versionId,
        }),
      ).reason,
    ).toBe("invalid_package");
    expect(storedFiles()).toEqual([]);
  });
});

describe("descargar", () => {
  test("entrega el fichero de la huella registrada y lo registra", () => {
    const record = succeeded(exportNow());
    const result = fixture.exports.download({
      ...OTHER_TEACHER,
      exportId: record.id,
      item: "package",
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(createHash("sha256").update(result.body).digest("hex")).toBe(
      record.sha256,
    );
    expect(result.filename).toMatch(/^aulanorma-[0-9a-f]{12}-scorm12\.zip$/);
    expect(
      fixture.exports.overview(fixture.outlineId)?.downloads,
    ).toMatchObject([
      {
        exportId: record.id,
        item: "package",
        result: "granted",
        downloadedBy: OTHER_TEACHER.actorId,
      },
    ]);
    expect(auditOf("export.download")).toEqual([
      { result: "granted", item: "package" },
    ]);
  });

  test("las instrucciones acompañan a la descarga y dicen que Moodle no está comprobado", () => {
    const record = succeeded(exportNow());
    const result = fixture.exports.download({
      ...TEACHER,
      exportId: record.id,
      item: "instructions",
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    const text = result.body.toString("utf8");
    expect(result.filename).toMatch(/-instrucciones\.txt$/);
    expect(text).toContain(NOT_VERIFIED);
    expect(text).toContain(record.sha256 ?? "");
    expect(text).toContain(fixture.versionId);
    expect(text).toContain("PAQUETE DE ENSAYO");
    expect(text).toMatch(/sustituir el paquete en cada curso te corresponde/);
    expect(text).toMatch(/no puede retirar un fichero que ya has descargado/);
    expect(text).toMatch(/no es\s+una prueba de aprendizaje/);
    // No nombra ninguna versión de Moodle ni promete detalle en sus informes.
    expect(text).not.toMatch(/Moodle \d/);
    expect(text).toMatch(/no recibe porcentajes ni detalle por tema/);
    expect(text).not.toMatch(/compatible con/i);
  });

  test("si la versión se invalida después, el mismo enlace se deniega y el paquete se conserva (FR-062)", () => {
    const record = succeeded(exportNow());
    editTopic();
    for (const item of ["package", "instructions"] as const) {
      expect(
        fixture.exports.download({ ...TEACHER, exportId: record.id, item }),
      ).toEqual({
        ok: false,
        reason: "not_current",
        outlineId: fixture.outlineId,
      });
    }
    // Evidencia: el fichero y sus registros siguen ahí.
    expect(storedFiles()).toEqual([`${record.id}.zip`]);
    const overview = fixture.exports.overview(fixture.outlineId);
    expect(overview?.exports[0]).toMatchObject({
      id: record.id,
      status: "succeeded",
      sha256: record.sha256,
    });
    expect(overview?.downloads.map((item) => item.result)).toEqual([
      "not_current",
      "not_current",
    ]);
    expect(
      auditOf("export.download").map(
        (event) => (event as { result: string }).result,
      ),
    ).toEqual(["not_current", "not_current"]);
  });

  test("una exportación que no existe se deniega y se audita", () => {
    expect(
      fixture.exports.download({
        ...TEACHER,
        exportId: "f".repeat(32),
        item: "package",
      }),
    ).toEqual({ ok: false, reason: "not_found", outlineId: undefined });
    expect(count("package_download")).toBe(0);
    expect(fixture.outline.audit.list().at(-1)).toMatchObject({
      action: "export.download",
      result: "failed",
    });
  });

  test("un fichero alterado en el almacén no se entrega", () => {
    const record = succeeded(exportNow());
    writeFileSync(
      path.join(fixture.dataDir, "exports", `${record.id}.zip`),
      "alterado",
    );
    expect(
      fixture.exports.download({
        ...TEACHER,
        exportId: record.id,
        item: "package",
      }),
    ).toMatchObject({ ok: false, reason: "unavailable" });
  });
});

describe("vista previa", () => {
  test("con una versión vigente muestra su contenido y es entregable", () => {
    const preview = fixture.exports.preview(fixture.outlineId, PRESENTATION);
    expect(preview?.deliverable).toBe(true);
    expect(preview?.source.versionId).toBe(fixture.versionId);
    expect(count("package_export")).toBe(0);
    expect(storedFiles()).toEqual([]);
  });

  test("un borrador se muestra como no entregable y no produce ningún fichero (FR-038)", () => {
    editTopic();
    const preview = fixture.exports.preview(fixture.outlineId, PRESENTATION);
    expect(preview?.deliverable).toBe(false);
    expect(preview?.source.versionId).toBe("borrador");
    expect(JSON.stringify(preview?.source.snapshot)).toContain(
      "Texto cambiado después de aprobar.",
    );
    expect(storedFiles()).toEqual([]);
    expect(count("package_export")).toBe(0);
  });
});

describe("conservación (SC-031)", () => {
  test("los registros de exportación y descarga no se pueden modificar ni borrar", () => {
    const record = succeeded(exportNow());
    fixture.exports.download({
      ...TEACHER,
      exportId: record.id,
      item: "package",
    });
    for (const statement of [
      "DELETE FROM package_export",
      "UPDATE package_export SET status = 'failed'",
      "DELETE FROM package_download",
      "UPDATE package_download SET result = 'granted'",
    ]) {
      expect(() => {
        fixture.outline.db.exec(statement);
      }).toThrow(/append-only/);
    }
  });

  test("un registro de exportación correcta exige huella y tamaño, y uno fallido no los admite", () => {
    const insert = (status: string, sha: string | null, size: number | null) =>
      fixture.outline.db
        .prepare(
          "INSERT INTO package_export (id, syllabus_version_id, format, " +
            "status, package_sha256, size_bytes, validation_result, " +
            "exported_by, exported_at) VALUES (?, ?, 'scorm-1.2', ?, ?, ?, '{}', 'x', 1)",
        )
        .run(
          `${status}-${String(sha)}-${String(size)}`,
          fixture.versionId,
          status,
          sha,
          size,
        );
    expect(() => insert("succeeded", null, null)).toThrow();
    expect(() => insert("failed", "a".repeat(64), 10)).toThrow();
    expect(() => insert("succeeded", "a".repeat(64), null)).toThrow();
    expect(() => insert("otro", null, null)).toThrow();
  });

  test("el servicio no ofrece ninguna operación de borrado", () => {
    expect(Object.keys(fixture.exports).sort()).toEqual([
      "download",
      "export",
      "outlineOfExport",
      "overview",
      "preview",
    ]);
  });
});
