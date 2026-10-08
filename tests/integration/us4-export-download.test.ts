// Historia 4, de extremo a extremo por las rutas reales (specs/002-boe-scorm-
// export: T068 y T069; escenarios de aceptación 1 a 8; FR-030 a FR-041 y
// FR-062; SC-007, SC-012, SC-014, SC-025 y SC-031).
//
// Usa las páginas y las acciones de `src/pages`, el tratamiento real del PDF
// con un documento sintético y el adaptador determinista con una unidad
// sintética. Necesita `npm run tools:install`. Las aprobaciones las hace una
// cuenta de prueba y el contenido son respuestas grabadas: es un ensayo del
// recorrido. No acredita la importación en Moodle ni la validación contra
// los esquemas oficiales, que no se ejecuta todavía.
import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { checkPackage } from "@/modules/content-export";
import { openSyllabus } from "@/modules/didactic-content";
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import * as passwordPage from "@/pages/account/password";
import * as passwordAction from "@/pages/api/account/password";
import * as uploadAction from "@/pages/api/documents/upload";
import * as exportAction from "@/pages/api/export/create";
import * as interpretationRequestAction from "@/pages/api/interpretations/request";
import * as validateAction from "@/pages/api/interpretations/validate";
import * as outlineApproveAction from "@/pages/api/outlines/approve";
import * as outlineRequestAction from "@/pages/api/outlines/request";
import * as signInAction from "@/pages/api/session/sign-in";
import * as versionAction from "@/pages/api/syllabus/approve";
import * as generateAction from "@/pages/api/syllabus/generate";
import * as topicApproveAction from "@/pages/api/topics/approve";
import * as topicEditAction from "@/pages/api/topics/edit";
import * as exportPage from "@/pages/export/[id]/index";
import * as previewPage from "@/pages/export/[id]/preview";
import * as packagePage from "@/pages/export/packages/[id]/index";
import * as instructionsPage from "@/pages/export/packages/[id]/instructions";
import * as interpretationPage from "@/pages/interpretations/[id]/index";
import * as loginPage from "@/pages/login";
import * as outlinePage from "@/pages/outlines/[id]/index";
import * as syllabusPage from "@/pages/syllabus/[id]";
import * as blockPage from "@/pages/topics/[id]/blocks/[bid]";
import * as topicPage from "@/pages/topics/[id]/index";
import { inputDigest } from "@/platform/generation";
import { ROUTES } from "@/platform/http-boundary";
import { RECORDINGS_DIRECTORY } from "@/platform/web";
import { createWebClient } from "../support/web-client.ts";
import type { Reply, WebClient } from "../support/web-client.ts";

vi.setConfig({ testTimeout: 180_000 });

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const RECORDINGS = path.join(repoRoot, "tests/fixtures/generation");
const RUN = randomUUID();
const PASSWORD = `inicial-${RUN}`;
const NEW_PASSWORD = `nueva-${RUN}`;
const HOSTILE = '<script>alert("x")</script><b>negrita</b>';
const TITLES = [
  "Tema 1. La capacidad sintética y su criterio",
  "Tema 2. El contenido sintético",
  "Tema 3. El detalle del subapartado",
  "Presentación del curso",
] as const;

let client: WebClient;
let recordings: string;
let interpretationId = "";
let outlineId = "";

beforeEach(() => {
  client = createWebClient();
  recordings = path.join(client.dataDir, RECORDINGS_DIRECTORY);
  mkdirSync(recordings);
  for (const name of ["interpretation", "outline"]) {
    copyFileSync(
      path.join(RECORDINGS, `${name}-synthetic-unit.json`),
      path.join(recordings, `${name}.json`),
    );
  }
});

afterEach(() => {
  client.dispose();
});

async function enter(
  username: string,
  roles: readonly string[],
): Promise<void> {
  const exists = client.runtime.identity
    .listUsers()
    .some((user) => user.username === username);
  if (!exists) {
    expect(
      await client.runtime.identity.createUser({
        username,
        password: PASSWORD,
        roles,
        correlationId: "alta",
      }),
    ).toEqual({ ok: true });
  }
  client.cookies.clear();
  const form = await client.get(loginPage);
  await client.post(signInAction, {
    csrf: client.csrfOf(form),
    username,
    password: exists ? NEW_PASSWORD : PASSWORD,
  });
  if (!exists) {
    const change = await client.get(passwordPage);
    await client.post(passwordAction, {
      csrf: client.csrfOf(change),
      current: PASSWORD,
      next: NEW_PASSWORD,
    });
  }
}

async function csrf(): Promise<string> {
  return client.csrfOf(await client.get(passwordPage));
}

function flat(reply: Reply): string {
  return reply.body.replace(/\s+/g, " ");
}

function revisionOf(reply: Reply): string {
  return /name="revision"\s+value="(\d+)"/.exec(reply.body)?.[1] ?? "";
}

const viewSyllabus = (): Promise<Reply> =>
  client.get(syllabusPage, { params: { id: outlineId } });
const viewExport = (): Promise<Reply> =>
  client.get(exportPage, { params: { id: outlineId } });
const viewPreview = (): Promise<Reply> =>
  client.get(previewPage, { params: { id: outlineId } });
const downloadPackage = (id: string): Promise<Reply> =>
  client.get(packagePage, { params: { id } });
const downloadInstructions = (id: string): Promise<Reply> =>
  client.get(instructionsPage, { params: { id } });

const count = (table: string): number =>
  Number(
    client.runtime.db.prepare(`SELECT count(*) AS total FROM ${table}`).get()
      ?.total,
  );

function auditOf(action: string): unknown[] {
  return client.runtime.audit
    .list()
    .filter((event) => event.action === action)
    .map(({ result, details }) => ({ result, ...details }));
}

function idOf(sql: string, ...values: string[]): string {
  const row = client.runtime.db.prepare(sql).get(...values);
  return typeof row?.id === "string" ? row.id : "";
}

const entryId = (title: string): string =>
  idOf(
    "SELECT id FROM outline_entry WHERE outline_id = ? AND title = ?",
    outlineId,
    title,
  );
const topicId = (title: string): string =>
  idOf("SELECT id FROM topic WHERE outline_entry_id = ?", entryId(title));

const storedPackages = (): string[] =>
  existsSync(path.join(client.dataDir, "exports"))
    ? readdirSync(path.join(client.dataDir, "exports"))
    : [];

// Entrada exacta que el producto envía para desarrollar un tema.
function topicInput(title: string): { requirements: { ref: string }[] } {
  const interpretation = openStructuredInterpretation(client.runtime).get(
    interpretationId,
  );
  const linked = client.runtime.db
    .prepare(
      "SELECT requirement_id FROM entry_requirement WHERE outline_entry_id = ?",
    )
    .all(entryId(title))
    .map((row) => String(row.requirement_id));
  return {
    unitCode: interpretation?.unitCode,
    unitTitle: interpretation?.unitTitle,
    entryTitle: title,
    requirements: (interpretation?.requirements ?? [])
      .filter((item) => !item.withdrawn && linked.includes(item.id))
      .map((item, index) => ({
        ref: `r${String(index + 1)}`,
        kind: item.kind,
        code: item.code,
        text: item.text,
      })),
  } as { requirements: { ref: string }[] };
}

function recordTopic(title: string, index: number): void {
  const input = topicInput(title);
  const refs = input.requirements.map((item) => item.ref);
  writeFileSync(
    path.join(recordings, `tema-${String(index)}.json`),
    JSON.stringify({
      task: "topic",
      promptVersion: "v1",
      inputSha256: inputDigest(input),
      output: {
        blocks: [
          ...refs.map((ref) => ({ kind: "requirement", requirementRef: ref })),
          {
            kind: "development",
            requirementRefs: refs,
            content: [
              { type: "heading", text: `Desarrollo de ${title}` },
              { type: "paragraph", text: `Texto con marcado: ${HOSTILE}` },
            ],
          },
        ],
      },
    }),
  );
}

// Documento sintético, interpretación validada, índice aprobado y temario
// generado con respuestas grabadas. Todo con una cuenta de prueba.
async function developed(): Promise<void> {
  const uploaded = await client.upload(
    uploadAction,
    readFileSync(
      path.join(repoRoot, "tests/fixtures/pdf/synthetic/five-pages.pdf"),
    ),
    {
      title: "Documento sintético de prueba",
      issuer: "Organismo sintético",
      official_reference: "REF-0001",
      source: "Fichero sintético del repositorio",
      obtained_on: "2026-10-07",
      version: "Texto original",
    },
    { csrf: await csrf() },
  );
  expect(uploaded.status, uploaded.body).toBe(201);
  const documentId =
    (JSON.parse(uploaded.body) as { location: string }).location
      .split("/")
      .pop() ?? "";
  const estimate = await client.post(interpretationRequestAction, {
    csrf: await csrf(),
    document: documentId,
    unit_code: "UX9001",
    page_from: "1",
    page_to: "3",
  });
  const requested = await client.post(
    interpretationRequestAction,
    client.hiddenFields(estimate, "/api/interpretations/request"),
  );
  interpretationId = requested.location?.split("/").pop() ?? "";
  const page = await client.get(interpretationPage, {
    params: { id: interpretationId },
  });
  await client.post(validateAction, {
    csrf: client.csrfOf(page),
    interpretation: interpretationId,
    revision: revisionOf(page),
    inventory_reviewed: "yes",
  });
  const validated = await client.get(interpretationPage, {
    params: { id: interpretationId },
  });
  const outline = await client.post(
    outlineRequestAction,
    client.hiddenFields(validated, "/api/outlines/request"),
  );
  outlineId = outline.location?.split("/").pop() ?? "";
  expect(outlineId).toMatch(/^[0-9a-f]{32}$/);
  const outlineView = await client.get(outlinePage, {
    params: { id: outlineId },
  });
  expect(
    (
      await client.post(outlineApproveAction, {
        csrf: client.csrfOf(outlineView),
        outline: outlineId,
        revision: revisionOf(outlineView),
      })
    ).status,
  ).toBe(303);
  TITLES.forEach(recordTopic);
  const syllabus = await viewSyllabus();
  expect(
    (
      await client.post(
        generateAction,
        client.hiddenFields(syllabus, "/api/syllabus/generate"),
      )
    ).status,
  ).toBe(303);
}

async function approveTopic(title: string): Promise<void> {
  const page = await client.get(topicPage, { params: { id: topicId(title) } });
  expect(
    (
      await client.post(topicApproveAction, {
        csrf: client.csrfOf(page),
        topic: topicId(title),
        revision: revisionOf(page),
      })
    ).status,
  ).toBe(303);
}

async function approveVersion(): Promise<string> {
  const page = await viewSyllabus();
  expect(
    (
      await client.post(
        versionAction,
        client.hiddenFields(page, "/api/syllabus/approve"),
      )
    ).status,
  ).toBe(303);
  return (
    openSyllabus(client.runtime)
      .review(outlineId)
      ?.versions.find((item) => item.current)?.id ?? ""
  );
}

// Versión aprobada y vigente; devuelve su identificador.
async function approvedVersion(): Promise<string> {
  await developed();
  for (const title of TITLES) {
    await approveTopic(title);
  }
  return approveVersion();
}

async function exportVersion(version: string): Promise<Reply> {
  return client.post(exportAction, { csrf: await csrf(), version });
}

const exportIds = (): string[] =>
  client.runtime.db
    .prepare("SELECT id FROM package_export ORDER BY exported_at, rowid")
    .all()
    .map((row) => String(row.id));

// Edita el bloque de desarrollo de un tema; sin requisitos, deja uno sin
// desarrollar.
async function editDevelopment(
  title: string,
  keepRequirements: boolean,
): Promise<void> {
  const block = idOf(
    "SELECT id FROM topic_block WHERE topic_id = ? AND " +
      "kind = 'development' AND removed = 0",
    topicId(title),
  );
  const form = await client.get(blockPage, {
    params: { id: topicId(title), bid: block },
  });
  const linked = keepRequirements
    ? client.runtime.db
        .prepare(
          "SELECT requirement_id FROM block_requirement WHERE topic_block_id = ?",
        )
        .all(block)
        .map((row) => String(row.requirement_id))
    : [];
  const reply = await client.post(topicEditAction, {
    csrf: client.csrfOf(form),
    topic: topicId(title),
    revision: revisionOf(form),
    mode: "edit",
    block,
    text: "Texto cambiado después de aprobar.",
    ...Object.fromEntries(linked.map((id) => [`req_${id}`, "yes"])),
  });
  expect(reply.status, reply.body).toBe(303);
}

describe("escenario 1: sin aprobación vigente", () => {
  test("con el temario sin aprobar no se ofrece exportar y la vista previa es un borrador sin fichero", async () => {
    await enter("docente1", ["teacher"]);
    await developed();
    const page = flat(await viewExport());
    expect(page).toContain("Borrador no entregable");
    expect(page).toContain("Pendiente para poder exportar:");
    expect(page).not.toContain('action="/api/export/create"');
    expect(page).not.toContain("/export/packages/");
    const preview = flat(await viewPreview());
    expect(preview).toContain("Borrador no entregable");
    expect(preview).toContain("de esta vista no sale ningún fichero");
    expect(preview).toContain("No ejecuta el seguimiento del paquete");
    expect(preview).toContain(TITLES[0]);
    // El texto con marcado se muestra literal, como en la revisión.
    expect(preview).toContain("&lt;script&gt;");
    expect(preview).not.toContain("<script>alert");
    expect(count("package_export")).toBe(0);
    expect(storedPackages()).toEqual([]);
  });

  test("exportar una versión invalidada se deniega por la acción, y queda registrado", async () => {
    await enter("docente1", ["teacher"]);
    const version = await approvedVersion();
    await editDevelopment(TITLES[0], true);
    const reply = await exportVersion(version);
    expect(reply.status).toBe(422);
    expect(flat(reply)).toContain("No se ha exportado nada.");
    expect(flat(reply)).toContain("no tiene una aprobación vigente");
    expect(storedPackages()).toEqual([]);
    expect(auditOf("export.create")).toEqual([
      { result: "failed", version, reason: "not_current" },
    ]);
    // Tampoco una versión inventada o mal formada.
    for (const invented of ["f".repeat(32), "../../etc/passwd", ""]) {
      expect((await exportVersion(invented)).status).toBe(404);
    }
    expect(storedPackages()).toEqual([]);
  });
});

describe("escenario 2: sin autorización", () => {
  test("sin sesión, sin perfil o solo con administración, todo se deniega y se audita (SC-007)", async () => {
    await enter("docente1", ["teacher"]);
    const version = await approvedVersion();
    expect((await exportVersion(version)).status).toBe(303);
    const [exported = ""] = exportIds();
    const before = count("package_export");
    const downloads = count("package_download");

    for (const [username, roles] of [
      ["sinperfil", []],
      ["admin1", ["admin"]],
    ] as const) {
      await enter(username, roles);
      expect((await viewExport()).status).toBe(403);
      expect((await viewPreview()).status).toBe(403);
      expect((await downloadPackage(exported)).status).toBe(403);
      expect((await downloadInstructions(exported)).status).toBe(403);
      expect((await exportVersion(version)).status).toBe(403);
    }
    client.cookies.clear();
    for (const reply of [
      await viewExport(),
      await viewPreview(),
      await downloadPackage(exported),
      await downloadInstructions(exported),
    ]) {
      expect(reply.location).toBe("/login");
      expect(reply.raw.includes(Buffer.from("PK"))).toBe(false);
    }
    expect(count("package_export")).toBe(before);
    expect(count("package_download")).toBe(downloads);
    const denied = client.runtime.audit
      .list()
      .filter((event) => event.result === "denied")
      .map((event) => event.details.operation);
    for (const operation of [
      "export.view",
      "export.preview",
      "export.download",
      "export.create",
    ]) {
      expect(denied).toContain(operation);
    }
  });
});

describe("escenarios 3, 5 y 6: exportar, descargar y abrir sin conexión", () => {
  test("el docente obtiene un paquete que identifica la versión, con su huella y sus instrucciones", async () => {
    await enter("docente1", ["teacher"]);
    const version = await approvedVersion();
    const before = flat(await viewExport());
    expect(before).toContain("Entregable");
    expect(before).toContain(version);
    expect(before).toContain("validación no ejecutada");
    expect(before).toContain(
      "todavía no se ha comprobado en ninguna versión de Moodle",
    );
    const preview = flat(await viewPreview());
    expect(preview).toContain("tal como irá en el paquete");
    expect(preview).toContain("no guarda ningún recorrido");
    expect(preview).toContain("Paquete de ensayo");
    expect(preview).not.toMatch(/recorrido (?:está )?guardado/);

    const reply = await exportVersion(version);
    expect(reply.location).toBe(`/export/${outlineId}`);
    const [exported = ""] = exportIds();
    const page = flat(await viewExport());
    expect(page).toContain("Paquete generado y comprobado al releerlo");
    expect(page).toContain(`/export/packages/${exported}`);
    expect(page).toContain(`/export/packages/${exported}/instructions`);
    expect(page).toContain("Paquete de ensayo.");

    const download = await downloadPackage(exported);
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toBe("application/zip");
    expect(download.headers["content-disposition"]).toMatch(
      /^attachment; filename="aulanorma-[0-9a-f]{12}-scorm12\.zip"$/,
    );
    expect(download.headers["cache-control"]).toBe("no-store");
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
    // La huella mostrada es la del fichero descargado (FR-035).
    const sha256 = createHash("sha256").update(download.raw).digest("hex");
    expect(page).toContain(sha256);

    // Abierto sin conexión: todo lo que necesita está dentro (SC-012).
    const files = unzipSync(download.raw);
    expect(Object.keys(files)).toEqual([
      "imsmanifest.xml",
      "index.html",
      "assets/app.js",
      "assets/style.css",
    ]);
    expect(
      checkPackage(download.raw, {
        delivery: true,
        manifestIdentifier: `aulanorma-${version}`,
        versionId: version,
        forbidden: client.runtime.identity
          .listUsers()
          .flatMap((user) => [user.id, user.username]),
      }).problems,
    ).toEqual([]);
    const html = strFromU8(files["index.html"] ?? new Uint8Array());
    for (const title of TITLES) {
      expect(html).toContain(title);
    }
    expect(html).toContain("Requisito extraído del BOE");
    expect(html).toContain("Desarrollo didáctico generado");
    expect(html).toContain("Documento sintético de prueba");
    expect(html).toContain("Paquete de ensayo");
    expect(html).toContain("&lt;script&gt;alert");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("docente1");

    const instructions = await downloadInstructions(exported);
    expect(instructions.status).toBe(200);
    expect(instructions.headers["content-type"]).toBe(
      "text/plain; charset=utf-8",
    );
    expect(instructions.body).toContain(sha256);
    expect(instructions.body).toContain(
      "todavía no se ha comprobado en ninguna versión de Moodle",
    );
    expect(instructions.body).toContain("PAQUETE DE ENSAYO");

    const history = flat(await viewExport());
    expect(history).toContain("Paquete");
    expect(history).toContain("Instrucciones");
    expect(history.match(/Entregada/g)).toHaveLength(2);
    expect(auditOf("export.download")).toEqual([
      { result: "granted", item: "package" },
      { result: "granted", item: "instructions" },
    ]);
  });

  test("exportar de nuevo la misma versión da el mismo fichero (SC-014)", async () => {
    await enter("docente1", ["teacher"]);
    const version = await approvedVersion();
    await exportVersion(version);
    await exportVersion(version);
    const [first = "", second = ""] = exportIds();
    expect(second).not.toBe("");
    expect(
      (await downloadPackage(first)).raw.equals(
        (await downloadPackage(second)).raw,
      ),
    ).toBe(true);
  });
});

describe("escenario 4: fallo durante la generación", () => {
  test("no queda ningún paquete descargable de ese intento y el fallo está registrado", async () => {
    await enter("docente1", ["teacher"]);
    const version = await approvedVersion();
    // El almacén de paquetes no se puede crear: en su lugar hay un fichero.
    writeFileSync(path.join(client.dataDir, "exports"), "ocupado");
    const reply = await exportVersion(version);
    expect(reply.status).toBe(500);
    expect(flat(reply)).toContain("No ha quedado ningún fichero parcial.");
    const [failed = ""] = exportIds();
    const page = flat(await viewExport());
    expect(page).toContain("Fallido");
    expect(page).toContain("Sin fichero");
    expect(page).not.toContain(`/export/packages/${failed}`);
    expect((await downloadPackage(failed)).status).toBe(404);
    expect((await downloadInstructions(failed)).status).toBe(404);
    expect(auditOf("export.create")).toEqual([
      { result: "failed", version, reason: "storage_error" },
    ]);
  });
});

describe("escenarios 7 y 8: cobertura incompleta y versión invalidada", () => {
  test("con un requisito sin cubrir, todas las vías se deniegan y muestran lo pendiente con su referencia (SC-025)", async () => {
    await enter("docente1", ["teacher"]);
    const version = await approvedVersion();
    expect((await exportVersion(version)).status).toBe(303);
    const [exported = ""] = exportIds();
    const kept = (await downloadPackage(exported)).raw;

    // Un desarrollo deja de apoyarse en sus requisitos.
    await editDevelopment(TITLES[0], false);

    const denied = [
      await exportVersion(version),
      await downloadPackage(exported),
      await downloadInstructions(exported),
    ];
    for (const reply of denied) {
      expect(reply.status).toBe(422);
      expect(reply.raw.subarray(0, 2).toString()).not.toBe("PK");
      const text = flat(reply);
      expect(text).toContain("Borrador no entregable");
      expect(text).toContain(
        "Requisitos sin cita o sin contenido que los desarrolle:",
      );
      // Con su referencia normativa: documento, sección y página.
      expect(text).toContain("Documento sintético de prueba");
      expect(text).toMatch(/citado, pero sin desarrollo/);
      expect(text).toMatch(/\/documents\/[0-9a-f]{32}\/pages\/\d+/);
      expect(text).not.toContain('action="/api/export/create"');
    }
    expect(flat(await downloadPackage(exported))).toContain(
      "El paquete y sus registros se conservan como evidencia.",
    );

    // Evidencia: el paquete y sus registros siguen consultables.
    expect(storedPackages()).toEqual([`${exported}.zip`]);
    expect(
      readFileSync(
        path.join(client.dataDir, "exports", `${exported}.zip`),
      ).equals(kept),
    ).toBe(true);
    const page = flat(await viewExport());
    expect(page).toContain("No descargable: su versión no está vigente.");
    expect(page).toContain(createHash("sha256").update(kept).digest("hex"));
    expect(page.match(/Denegada: versión sin vigencia/g)).toHaveLength(3);
    expect(page).not.toContain(`href="/export/packages/${exported}"`);
  });

  test("tras aprobar otra versión, el enlace antiguo sigue denegado y la nueva se exporta", async () => {
    await enter("docente1", ["teacher"]);
    const first = await approvedVersion();
    await exportVersion(first);
    const [old = ""] = exportIds();
    await editDevelopment(TITLES[0], true);
    await approveTopic(TITLES[0]);
    const second = await approveVersion();
    expect(second).not.toBe(first);

    expect((await downloadPackage(old)).status).toBe(422);
    expect((await exportVersion(first)).status).toBe(422);
    expect((await exportVersion(second)).status).toBe(303);
    const current = exportIds().at(-1) ?? "";
    const download = await downloadPackage(current);
    expect(download.status).toBe(200);
    const html = strFromU8(
      unzipSync(download.raw)["index.html"] ?? new Uint8Array(),
    );
    expect(html).toContain(second);
    expect(html).not.toContain(first);
    expect(html).toContain("Texto cambiado después de aprobar.");
  });
});

describe("conservación (SC-031)", () => {
  test("la exportación no tiene ninguna ruta ni método de borrado", () => {
    const routes = ROUTES.filter((route) => route.target.includes("export"));
    expect(routes.map((route) => [route.target, route.methods])).toEqual([
      ["/export/:id", ["GET"]],
      ["/export/:id/preview", ["GET"]],
      ["/export/packages/:id", ["GET"]],
      ["/export/packages/:id/instructions", ["GET"]],
      ["/api/export/create", ["POST"]],
    ]);
    expect(
      ROUTES.some(
        (route) =>
          route.methods.includes("DELETE") ||
          /delete|remove|borrar/.test(route.target),
      ),
    ).toBe(false);
  });

  test("una identificación mal formada en un enlace de descarga no llega a ningún fichero", async () => {
    await enter("docente1", ["teacher"]);
    await approvedVersion();
    for (const id of ["f".repeat(32), "..%2f..%2fetc", ""]) {
      expect((await downloadPackage(id)).status).toBe(404);
    }
    expect(count("package_download")).toBe(0);
  });
});
