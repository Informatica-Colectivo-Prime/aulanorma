// Historia 1, de extremo a extremo por las rutas reales (specs/002-boe-scorm-
// export: T038 a T041; escenarios de aceptación 1 a 10; FR-001 a FR-008,
// FR-057, FR-063 a FR-065, FR-067 y FR-070; SC-007, SC-009, SC-010, SC-033,
// SC-034, SC-036 y SC-038).
//
// Usa las páginas y las acciones de `src/pages`, el tratamiento real del PDF
// con documentos sintéticos y el adaptador determinista con una unidad
// sintética. Necesita `npm run tools:install`. No hay red ni proveedor.
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as passwordPage from "@/pages/account/password";
import * as passwordAction from "@/pages/api/account/password";
import * as resolveAction from "@/pages/api/documents/resolve-page";
import * as uploadAction from "@/pages/api/documents/upload";
import * as correctAction from "@/pages/api/interpretations/correct";
import * as rejectAction from "@/pages/api/interpretations/reject";
import * as requestAction from "@/pages/api/interpretations/request";
import * as resubmitAction from "@/pages/api/interpretations/resubmit";
import * as validateAction from "@/pages/api/interpretations/validate";
import * as signInAction from "@/pages/api/session/sign-in";
import * as filePage from "@/pages/documents/[id]/file";
import * as documentPage from "@/pages/documents/[id]/index";
import * as pagePage from "@/pages/documents/[id]/pages/[n]";
import * as documentsPage from "@/pages/documents/index";
import * as newDocumentPage from "@/pages/documents/new";
import * as interpretationPage from "@/pages/interpretations/[id]/index";
import * as editRequirementPage from "@/pages/interpretations/[id]/requirements/[rid]";
import * as newRequirementPage from "@/pages/interpretations/[id]/requirements/new";
import * as unitPage from "@/pages/interpretations/[id]/unit";
import * as loginPage from "@/pages/login";
import { inputDigest } from "@/platform/generation";
import { RECORDINGS_DIRECTORY } from "@/platform/web";
import { createWebClient } from "../support/web-client.ts";
import type { Reply, WebClient } from "../support/web-client.ts";

vi.setConfig({ testTimeout: 180_000 });

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixture = (name: string): Buffer =>
  readFileSync(path.join(repoRoot, "tests/fixtures/pdf/synthetic", name));
const sha256 = (data: Buffer): string =>
  createHash("sha256").update(data).digest("hex");

const RUN = randomUUID();
const PASSWORD = `inicial-${RUN}`;
const NEW_PASSWORD = `nueva-${RUN}`;
const UNIT = "UX9001";
const META = {
  title: "Documento sintético de prueba",
  issuer: "Organismo sintético",
  official_reference: "REF-0001",
  source: "Fichero sintético del repositorio",
  obtained_on: "2026-10-07",
  version: "Texto original",
};

let client: WebClient;

beforeEach(() => {
  client = createWebClient();
  const recordings = path.join(client.dataDir, RECORDINGS_DIRECTORY);
  mkdirSync(recordings);
  copyFileSync(
    path.join(
      repoRoot,
      "tests/fixtures/generation/interpretation-synthetic-unit.json",
    ),
    path.join(recordings, "unidad-sintetica.json"),
  );
});

afterEach(() => {
  client.dispose();
});

// Crea la cuenta, entra y cambia la contraseña inicial.
async function enter(
  username: string,
  roles: readonly string[],
): Promise<void> {
  expect(
    await client.runtime.identity.createUser({
      username,
      password: PASSWORD,
      roles,
      correlationId: "alta",
    }),
  ).toEqual({ ok: true });
  client.cookies.clear();
  const form = await client.get(loginPage);
  await client.post(signInAction, {
    csrf: client.csrfOf(form),
    username,
    password: PASSWORD,
  });
  const change = await client.get(passwordPage);
  await client.post(passwordAction, {
    csrf: client.csrfOf(change),
    current: PASSWORD,
    next: NEW_PASSWORD,
  });
}

async function csrf(): Promise<string> {
  return client.csrfOf(await client.get(documentsPage));
}

async function upload(
  name: string,
  fields: Readonly<Record<string, string>> = {},
): Promise<Reply> {
  return client.upload(
    uploadAction,
    fixture(name),
    { ...META, ...fields },
    { csrf: await csrf() },
  );
}

function locationOf(reply: Reply): string {
  return (JSON.parse(reply.body) as { location: string }).location;
}

async function registered(
  name: string,
  fields: Readonly<Record<string, string>> = {},
): Promise<string> {
  const reply = await upload(name, fields);
  expect(reply.status, reply.body).toBe(201);
  return locationOf(reply).split("/").pop() ?? "";
}

const viewDocument = (id: string): Promise<Reply> =>
  client.get(documentPage, { params: { id } });
const viewInterpretation = (id: string): Promise<Reply> =>
  client.get(interpretationPage, { params: { id } });

async function interpreted(documentId: string, pageTo = "3"): Promise<string> {
  const reply = await client.post(requestAction, {
    csrf: await csrf(),
    document: documentId,
    unit_code: UNIT,
    page_from: "1",
    page_to: pageTo,
  });
  expect(reply.status).toBe(303);
  expect(reply.location).toMatch(/^\/interpretations\/[0-9a-f]{32}$/);
  return reply.location?.split("/").pop() ?? "";
}

function revisionOf(reply: Reply): string {
  return /name="revision"\s+value="(\d+)"/.exec(reply.body)?.[1] ?? "";
}

function auditOf(action: string): unknown[] {
  return client.runtime.audit
    .list()
    .filter((event) => event.action === action)
    .map(({ result, details }) => ({ result, ...details }));
}

const count = (table: string): number =>
  Number(
    client.runtime.db.prepare(`SELECT count(*) AS total FROM ${table}`).get()
      ?.total,
  );

describe("escenarios 1 y 2: subir el documento", () => {
  test("1. registra el documento con su procedencia y su huella, y muestra ese registro", async () => {
    await enter("docente1", ["teacher"]);
    const form = await client.get(newDocumentPage);
    expect(form.status).toBe(200);
    expect(form.body).toContain("Como máximo 32 MB y 600 páginas");
    expect(form.body).toMatch(/<form[^>]*data-upload/s);

    const reply = await upload("five-pages.pdf");
    expect(reply.status).toBe(201);
    expect(reply.headers["content-type"]).toBe(
      "application/json; charset=utf-8",
    );
    const id = locationOf(reply).split("/").pop() ?? "";
    expect(locationOf(reply)).toBe(`/documents/${id}`);

    const record = await viewDocument(id);
    expect(record.status).toBe(200);
    expect(record.body).toContain("El documento se ha registrado.");
    for (const value of [
      META.title,
      META.issuer,
      META.official_reference,
      META.source,
      META.obtained_on,
      META.version,
      sha256(fixture("five-pages.pdf")),
      id,
      "5 páginas",
      "por\n          docente1",
    ]) {
      expect(record.body.replace(/\s+/g, " ")).toContain(
        value.replace(/\s+/g, " "),
      );
    }
    expect((await client.get(documentsPage)).body).toContain(
      `href="/documents/${id}"`,
    );
    expect(auditOf("document.register")).toMatchObject([
      { result: "ok", pages: 5 },
    ]);
  });

  test.each([
    ["not-a-pdf.pdf", "El fichero no es un PDF"],
    ["encrypted.pdf", "El PDF está cifrado"],
    ["truncated.pdf", "El PDF está dañado o incompleto"],
    ["javascript.pdf", "contenido activo, que no se admite: JavaScript"],
    ["xfa-form.pdf", "contenido activo, que no se admite: un formulario XFA"],
    ["open-action-launch.pdf", "una acción de lanzamiento"],
    ["embedded-file.pdf", "un fichero incrustado"],
    ["form-text-field.pdf", "El PDF contiene un formulario"],
  ])(
    "2. %s se rechaza con un mensaje que explica el motivo, y no registra nada",
    async (name, message) => {
      await enter("docente1", ["teacher"]);
      const reply = await upload(name);
      expect(reply.status).toBe(422);
      expect(locationOf(reply)).toBe("/documents/new");
      const form = await client.get(newDocumentPage);
      expect(form.body).toContain("No se ha registrado nada.");
      expect(form.body.replace(/\s+/g, " ")).toContain(message);
      expect(form.body).toMatch(/class="notice bad" role="alert"/);
      expect(count("document")).toBe(0);
      expect(count("document_page")).toBe(0);
      expect((await client.get(documentsPage)).body).toContain(
        "Todavía no hay ningún documento registrado.",
      );
      expect(auditOf("document.register")).toMatchObject([
        { result: "failed" },
      ]);
    },
  );

  test("2. por encima del tamaño máximo se rechaza, y el mensaje dice el límite", async () => {
    await enter("docente1", ["teacher"]);
    const big = Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      Buffer.alloc(32 * 1024 * 1024),
    ]);
    const reply = await client.upload(uploadAction, big, META, {
      csrf: await csrf(),
    });
    expect(reply.status).toBe(422);
    expect((await client.get(newDocumentPage)).body).toContain(
      "supera el tamaño máximo admitido, que es de 32 MB",
    );
    expect(count("document")).toBe(0);
  });

  test("2. sin los datos de procedencia no se registra", async () => {
    await enter("docente1", ["teacher"]);
    const reply = await upload("five-pages.pdf", { title: "  " });
    expect(reply.status).toBe(422);
    expect((await client.get(newDocumentPage)).body).toContain(
      "Faltan datos del documento",
    );
    expect(count("document")).toBe(0);
  });
});

describe("escenarios 3, 4 y 9: revisar y corregir la interpretación", () => {
  test("3 y 9. cada elemento muestra documento, sección y página, con acceso directo; la jerarquía y la duración, aparte", async () => {
    await enter("docente1", ["teacher"]);
    const documentId = await registered("five-pages.pdf");
    const id = await interpreted(documentId);
    const view = await viewInterpretation(id);
    const body = view.body.replace(/\s+/g, " ");
    expect(view.status).toBe(200);
    expect(body).toContain(`${UNIT} · Unidad sintética de prueba`);
    expect(body).toContain(META.title);
    // Jerarquía: capacidad, su criterio, contenido y dos niveles de subapartado.
    expect(
      [
        ...view.body.matchAll(
          /<li class="d(\d)">\s*<span class="tag"\s*>([^<]+)</g,
        ),
      ].map((match) => `${match[1] ?? ""}:${match[2] ?? ""}`),
    ).toEqual([
      "0:Capacidad",
      "1:Criterio de evaluación",
      "0:Contenido",
      "1:Subapartado",
      "2:Subapartado",
    ]);
    expect(body).toContain(
      "1 capacidades, 1 criterios de evaluación, 1 contenidos y 2 subapartados.",
    );
    // Acceso directo a la página de origen de cada elemento (SC-009).
    for (const page of [1, 2, 3]) {
      expect(view.body).toContain(
        `href="/documents/${documentId}/pages/${String(page)}"`,
      );
    }
    expect(body).toContain("Capacidades y criterios,");
    // La duración, aparte, como metadato y no como requisito.
    expect(body).toMatch(/<h2>Duración normativa<\/h2> <p> 30 horas/);
    expect(body).toContain("no un requisito de cobertura");
    // El texto del documento y de la propuesta se muestra como texto.
    expect(view.body).toContain("&lt;b&gt;con marcado&lt;/b&gt;");
    expect(view.body).not.toContain("<b>con marcado</b>");
    // Se dice de dónde sale la propuesta.
    expect(body).toContain("Respuesta grabada del adaptador determinista");

    // La página: su texto extraído y el acceso a esa página del original.
    const page = await client.get(pagePage, {
      params: { id: documentId, n: "2" },
    });
    expect(page.status).toBe(200);
    expect(page.body).toContain("Synthetic fixture, page 2.");
    expect(page.body).toContain(`href="/documents/${documentId}/file#page=2"`);
    expect(
      (await client.get(pagePage, { params: { id: documentId, n: "6" } }))
        .status,
    ).toBe(404);

    // El original, idéntico, con su tipo exacto y sin caché.
    const file = await client.get(filePage, { params: { id: documentId } });
    expect(file.status).toBe(200);
    expect(file.raw.equals(fixture("five-pages.pdf"))).toBe(true);
    expect(file.headers).toMatchObject({
      "content-type": "application/pdf",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
    });
    expect(file.headers["content-security-policy"]).toContain(
      "default-src 'none'",
    );
  });

  test("4. una corrección queda registrada y el documento original no cambia", async () => {
    await enter("docente1", ["teacher"]);
    const documentId = await registered("five-pages.pdf");
    const id = await interpreted(documentId);
    const interpretation = client.runtime.db
      .prepare("SELECT id FROM requirement WHERE code = 'C1'")
      .get();
    const rid = String(interpretation?.id);
    const form = await client.get(editRequirementPage, {
      params: { id, rid },
    });
    expect(form.status).toBe(200);
    expect(form.body).toContain("Capacidad sintética uno.");

    const saved = await client.post(correctAction, {
      csrf: client.csrfOf(form),
      interpretation: id,
      revision: revisionOf(form),
      mode: "edit",
      requirement: rid,
      kind: "capability",
      parent: "",
      code: "C1",
      text: "Capacidad sintética uno, corregida.",
      section: "Capacidades y criterios",
      page_from: "1",
      page_to: "1",
      quote: "Synthetic fixture, page 1.",
    });
    expect(saved.status).toBe(303);
    expect(saved.location).toBe(`/interpretations/${id}`);
    const view = await viewInterpretation(id);
    expect(view.body).toContain("La corrección queda registrada.");
    expect(view.body).toContain("Capacidad sintética uno, corregida.");
    expect(view.body.replace(/\s+/g, " ")).toMatch(
      /Corrección \(requisito modificado\) por docente1, el \d{4}-\d\d-\d\d \d\d:\d\d UTC: da lugar a la versión 2\./,
    );
    expect(view.body).toContain("versión 2");
    // El documento y su texto son los mismos.
    expect(
      (await client.get(filePage, { params: { id: documentId } })).raw.equals(
        fixture("five-pages.pdf"),
      ),
    ).toBe(true);
    expect(
      (await client.get(pagePage, { params: { id: documentId, n: "1" } })).body,
    ).toContain("Synthetic fixture, page 1.");
    expect(auditOf("interpretation.correct")).toEqual([
      { result: "ok", revision: 2 },
    ]);
  });

  test("4. una corrección con una cita que no está en la página no se guarda, y conserva lo escrito", async () => {
    await enter("docente1", ["teacher"]);
    const id = await interpreted(await registered("five-pages.pdf"));
    const form = await client.get(newRequirementPage, { params: { id } });
    const reply = await client.post(correctAction, {
      csrf: client.csrfOf(form),
      interpretation: id,
      revision: revisionOf(form),
      mode: "add",
      requirement: "",
      kind: "content",
      parent: "",
      code: "2.",
      text: "Contenido que <i>faltaba</i>",
      section: "Contenidos",
      page_from: "2",
      page_to: "2",
      quote: "Esta cita no figura",
    });
    expect(reply.status).toBe(422);
    expect(reply.body).toContain("La cita no aparece en el texto extraído");
    expect(reply.body).toContain("Contenido que &lt;i&gt;faltaba&lt;/i&gt;");
    expect(reply.body).toContain("Esta cita no figura");
    expect(count("correction")).toBe(0);
  });

  test("4. también se corrigen los datos de la unidad y se retira un requisito", async () => {
    await enter("docente1", ["teacher"]);
    const id = await interpreted(await registered("five-pages.pdf"));
    const unit = await client.get(unitPage, { params: { id } });
    expect(
      (
        await client.post(correctAction, {
          csrf: client.csrfOf(unit),
          interpretation: id,
          revision: "1",
          mode: "unit",
          unit_title: "Unidad sintética corregida",
          duration_hours: "40",
          duration_section: "Unidad formativa",
          duration_page: "1",
          duration_quote: "",
        })
      ).status,
    ).toBe(303);
    const leaf = String(
      client.runtime.db
        .prepare(
          "SELECT id FROM requirement WHERE text LIKE 'Subapartado de segundo%'",
        )
        .get()?.id,
    );
    expect(
      (
        await client.post(correctAction, {
          csrf: client.csrfOf(unit),
          interpretation: id,
          revision: "2",
          mode: "withdraw",
          requirement: leaf,
        })
      ).status,
    ).toBe(303);
    const view = await viewInterpretation(id);
    const body = view.body.replace(/\s+/g, " ");
    expect(body).toContain("Unidad sintética corregida");
    expect(body).toContain("40 horas");
    expect(body).toContain('<span class="tag bad">Retirado</span>');
    expect(body).toContain("1 contenidos y 1 subapartados.");
    expect(body).toContain("versión 3");
  });
});

describe("escenarios 5 y 6: validar, y corregir después", () => {
  test("5. validar exige la confirmación expresa y registra docente, fecha, hora, versión y confirmación", async () => {
    await enter("docente1", ["teacher"]);
    const id = await interpreted(await registered("five-pages.pdf"));
    const view = await viewInterpretation(id);
    expect(view.body).toMatch(
      /<input[^>]*name="inventory_reviewed"[^>]*type="checkbox"[^>]*required/s,
    );

    // Sin la confirmación no se valida.
    const refused = await client.post(validateAction, {
      csrf: client.csrfOf(view),
      interpretation: id,
      revision: "1",
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toContain(
      "Para validar tienes que confirmar que has revisado el inventario",
    );
    expect(count("interpretation_validation")).toBe(0);

    const validated = await client.post(validateAction, {
      csrf: client.csrfOf(view),
      interpretation: id,
      revision: "1",
      inventory_reviewed: "yes",
    });
    expect(validated.status).toBe(303);
    const after = (await viewInterpretation(id)).body.replace(/\s+/g, " ");
    expect(after).toMatch(/class="tag good"\s*>Validada</);
    // SC-010 y SC-036.
    expect(after).toMatch(
      /Validación de la versión 1 por docente1, el \d{4}-\d\d-\d\d \d\d:\d\d UTC\. <span class="tag good">Vigente<\/span> «Confirmo que he revisado el inventario de requisitos contra la sección original de la unidad formativa en el documento\.»/,
    );
    expect(auditOf("interpretation.validate")).toEqual([
      { result: "failed", reason: "not_confirmed", revision: 1 },
      { result: "ok", revision: 1 },
    ]);
  });

  test("6. corregir una interpretación validada deja la validación sin vigencia", async () => {
    await enter("docente1", ["teacher"]);
    const id = await interpreted(await registered("five-pages.pdf"));
    const view = await viewInterpretation(id);
    await client.post(validateAction, {
      csrf: client.csrfOf(view),
      interpretation: id,
      revision: "1",
      inventory_reviewed: "yes",
    });
    await client.post(correctAction, {
      csrf: client.csrfOf(view),
      interpretation: id,
      revision: "1",
      mode: "unit",
      unit_title: "Unidad sintética revisada",
      duration_hours: "30",
      duration_section: "Unidad formativa",
      duration_page: "1",
      duration_quote: "",
    });
    const after = (await viewInterpretation(id)).body.replace(/\s+/g, " ");
    expect(after).toMatch(/class="tag "\s*>En revisión</);
    expect(after).toContain("Validación de la versión 1 por docente1");
    expect(after).toContain('<span class="tag">Sin vigencia</span>');
    expect(after).not.toContain('<span class="tag good">Vigente</span>');
    // La validación anterior sigue en el registro.
    expect(count("interpretation_validation")).toBe(1);
  });

  test("rechazar exige un motivo, conserva el contenido y permite volver a revisión", async () => {
    await enter("docente1", ["teacher"]);
    const id = await interpreted(await registered("five-pages.pdf"));
    const view = await viewInterpretation(id);
    const token = client.csrfOf(view);
    const empty = await client.post(rejectAction, {
      csrf: token,
      interpretation: id,
      revision: "1",
      reason: " ",
    });
    expect(empty.status).toBe(422);
    expect(empty.body).toContain(
      "Para rechazar tienes que escribir el motivo.",
    );
    const runs = count("generation_run");
    expect(
      (
        await client.post(rejectAction, {
          csrf: token,
          interpretation: id,
          revision: "1",
          reason: "Falta revisar <la> página 2.",
        })
      ).status,
    ).toBe(303);
    const rejected = (await viewInterpretation(id)).body.replace(/\s+/g, " ");
    expect(rejected).toMatch(/class="tag bad"\s*>Rechazada</);
    expect(rejected).toContain("Motivo: Falta revisar &lt;la&gt; página 2.");
    expect(rejected).toContain("Capacidad sintética uno.");
    expect(count("generation_run")).toBe(runs);
    expect(
      (
        await client.post(resubmitAction, {
          csrf: token,
          interpretation: id,
          revision: "1",
        })
      ).status,
    ).toBe(303);
    expect((await viewInterpretation(id)).body).toContain("En revisión");
  });
});

describe("edición simultánea por las rutas (FR-063, SC-033)", () => {
  test("el segundo guardado recibe 409 con la versión más reciente junto a su cambio, y solo se guarda al reenviarlo", async () => {
    await enter("docente1", ["teacher"]);
    const id = await interpreted(await registered("five-pages.pdf"));
    const rid = String(
      client.runtime.db
        .prepare("SELECT id FROM requirement WHERE code = 'C1'")
        .get()?.id,
    );
    const first = new Map(client.cookies);
    const opened = await client.get(editRequirementPage, {
      params: { id, rid },
    });
    const change = (token: string, revision: string, text: string) => ({
      csrf: token,
      interpretation: id,
      revision,
      mode: "edit",
      requirement: rid,
      kind: "capability",
      parent: "",
      code: "C1",
      text,
      section: "Capacidades y criterios",
      page_from: "1",
      page_to: "1",
      quote: "",
    });

    // Otra persona, en otra sesión, guarda antes.
    await enter("docente2", ["teacher"]);
    const other = await client.get(editRequirementPage, {
      params: { id, rid },
    });
    expect(
      (
        await client.post(
          correctAction,
          change(client.csrfOf(other), "1", "Cambio de la otra sesión"),
        )
      ).status,
    ).toBe(303);

    // La primera sesión guarda sobre la revisión que abrió.
    client.cookies.clear();
    for (const [name, value] of first) {
      client.cookies.set(name, value);
    }
    const conflict = await client.post(
      correctAction,
      change(client.csrfOf(opened), "1", "Mi cambio, que no debe perderse"),
    );
    expect(conflict.status).toBe(409);
    const body = conflict.body.replace(/\s+/g, " ");
    expect(body).toContain(
      "Otra persona u otra sesión ha cambiado esta interpretación desde que la abriste. No se ha guardado nada.",
    );
    expect(body).toContain("Versión más reciente (2)");
    expect(body).toContain("Cambio de la otra sesión");
    expect(body).toContain("Tu cambio, sin guardar");
    expect(body).toContain("Mi cambio, que no debe perderse");
    expect(body).toContain("Guardar mi cambio sobre la versión 2");
    expect(body).toContain("Descartar mi cambio y volver");
    expect(body).toContain("Nada se ha fusionado");
    expect(revisionOf(conflict)).toBe("2");
    // No se ha guardado nada.
    expect(count("correction")).toBe(1);
    expect((await viewInterpretation(id)).body).not.toContain(
      "Mi cambio, que no debe perderse",
    );

    // Reenvío explícito contra la versión más reciente.
    expect(
      (
        await client.post(
          correctAction,
          change(
            client.csrfOf(conflict),
            revisionOf(conflict),
            "Mi cambio, que no debe perderse",
          ),
        )
      ).status,
    ).toBe(303);
    const after = (await viewInterpretation(id)).body.replace(/\s+/g, " ");
    expect(after).toContain("Mi cambio, que no debe perderse");
    expect(after).toContain("por docente2");
    expect(after).toContain("da lugar a la versión 3");
  });

  test("validar sobre una versión anterior recibe 409 y muestra la más reciente, sin validar", async () => {
    await enter("docente1", ["teacher"]);
    const id = await interpreted(await registered("five-pages.pdf"));
    const view = await viewInterpretation(id);
    const token = client.csrfOf(view);
    await client.post(correctAction, {
      csrf: token,
      interpretation: id,
      revision: "1",
      mode: "unit",
      unit_title: "Unidad cambiada por otra sesión",
      duration_hours: "",
      duration_section: "",
      duration_page: "",
      duration_quote: "",
    });
    const reply = await client.post(validateAction, {
      csrf: token,
      interpretation: id,
      revision: "1",
      inventory_reviewed: "yes",
    });
    expect(reply.status).toBe(409);
    expect(reply.body).toContain("Unidad cambiada por otra sesión");
    expect(reply.body.replace(/\s+/g, " ")).toContain(
      "Esta es la versión más reciente: revísala antes de validarla.",
    );
    expect(revisionOf(reply)).toBe("2");
    expect(count("interpretation_validation")).toBe(0);
  });
});

describe("escenarios 7 y 8: páginas sin texto extraíble", () => {
  // La unidad sintética, sobre un documento cuya página 2 es solo una imagen.
  async function withImagePage(): Promise<{ documentId: string; id: string }> {
    const input = {
      unitCode: UNIT,
      pages: [
        {
          number: 1,
          text: "Synthetic fixture, page 1.\nThis text is extractable.",
        },
      ],
    };
    writeFileSync(
      path.join(client.dataDir, RECORDINGS_DIRECTORY, "una-pagina.json"),
      JSON.stringify({
        task: "interpretation",
        promptVersion: "v1",
        inputSha256: inputDigest(input),
        output: {
          unit: {
            code: UNIT,
            title: "Unidad sintética de una página",
            durationHours: null,
            durationSection: "",
            durationPage: null,
            durationQuote: null,
          },
          requirements: [
            {
              ref: "C1",
              parentRef: null,
              kind: "capability",
              code: "C1",
              text: "Capacidad sintética.",
              section: "Capacidades",
              pageFrom: 1,
              pageTo: 1,
              quote: null,
            },
          ],
        },
      }),
    );
    const documentId = await registered("image-only-page.pdf");
    return { documentId, id: await interpreted(documentId, "1") };
  }

  test("7. las páginas sin texto aparecen identificadas y la validación está bloqueada mientras sigan sin resolver", async () => {
    await enter("docente1", ["teacher"]);
    const { documentId, id } = await withImagePage();
    const record = (await viewDocument(documentId)).body.replace(/\s+/g, " ");
    expect(record).toContain(
      "1 páginas no tienen texto extraíble; 1 siguen sin resolver",
    );
    expect(record).toContain('<span class="tag bad">Sin resolver</span>');
    expect(record).toContain("Estas páginas contienen imágenes");

    const view = await viewInterpretation(id);
    expect(view.body.replace(/\s+/g, " ")).toContain(
      "La validación está bloqueada: estas páginas del documento no tienen texto extraíble y siguen sin resolver:",
    );
    expect(view.body).toContain(`href="/documents/${documentId}/pages/2"`);
    const refused = await client.post(validateAction, {
      csrf: client.csrfOf(view),
      interpretation: id,
      revision: "1",
      inventory_reviewed: "yes",
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toContain(
      "Hay páginas sin texto extraíble pendientes de resolver.",
    );
    expect(count("interpretation_validation")).toBe(0);
  });

  test("8. con la confirmación expresa del revisor, la página queda resuelta y deja de bloquear", async () => {
    await enter("docente1", ["teacher"]);
    const { documentId, id } = await withImagePage();
    const page = await client.get(pagePage, {
      params: { id: documentId, n: "2" },
    });
    expect(page.body).toContain("Esta página no tiene texto extraíble.");
    expect(page.body).toContain(
      "Confirmo que esta página está en blanco o es ajena a la unidad formativa",
    );
    const token = client.csrfOf(page);

    // Sin la confirmación no se resuelve.
    const refused = await client.post(resolveAction, {
      csrf: token,
      document: documentId,
      page: "2",
    });
    expect(refused.location).toBe(`/documents/${documentId}/pages/2`);
    expect(count("page_resolution")).toBe(0);
    expect(
      (await client.get(pagePage, { params: { id: documentId, n: "2" } })).body,
    ).toContain("La página no se ha resuelto");

    expect(
      (
        await client.post(resolveAction, {
          csrf: token,
          document: documentId,
          page: "2",
          confirmed: "yes",
        })
      ).location,
    ).toBe(`/documents/${documentId}/pages/2`);
    const resolved = (
      await client.get(pagePage, { params: { id: documentId, n: "2" } })
    ).body.replace(/\s+/g, " ");
    expect(resolved).toMatch(
      /<span class="tag good">Resuelta<\/span> por docente1, el \d{4}-\d\d-\d\d \d\d:\d\d UTC: «Confirmo que esta página/,
    );
    expect(auditOf("document.page.resolve")).toMatchObject([
      { result: "failed", reason: "not_confirmed", page: 2 },
      { result: "ok", page: 2 },
    ]);

    const view = await viewInterpretation(id);
    expect(view.body).not.toContain("La validación está bloqueada");
    expect(
      (
        await client.post(validateAction, {
          csrf: client.csrfOf(view),
          interpretation: id,
          revision: "1",
          inventory_reviewed: "yes",
        })
      ).status,
    ).toBe(303);
    expect(count("interpretation_validation")).toBe(1);
  });
});

describe("pedir la interpretación", () => {
  test("sin una respuesta para esa entrada no se guarda nada, y se dice", async () => {
    await enter("docente1", ["teacher"]);
    const documentId = await registered("five-pages.pdf");
    const reply = await client.post(requestAction, {
      csrf: await csrf(),
      document: documentId,
      unit_code: "UX9002",
      page_from: "1",
      page_to: "3",
    });
    expect(reply.location).toBe(`/documents/${documentId}`);
    expect((await viewDocument(documentId)).body).toContain(
      "El servicio de generación no ha devuelto ninguna respuesta",
    );
    expect(count("interpretation")).toBe(0);
    expect(
      client.runtime.db
        .prepare("SELECT provider, validation_result FROM generation_call")
        .all(),
    ).toEqual([
      { provider: "deterministic", validation_result: "provider_error" },
    ]);
  });

  test.each([
    [{ unit_code: "ux 1" }, "El código de la unidad no es válido"],
    [{ page_to: "9" }, "Las páginas de la sección no son válidas"],
    [{ page_from: "x" }, "Las páginas de la sección no son válidas"],
  ])("con %j no se envía nada", async (fields, message) => {
    await enter("docente1", ["teacher"]);
    const documentId = await registered("five-pages.pdf");
    await client.post(requestAction, {
      csrf: await csrf(),
      document: documentId,
      unit_code: UNIT,
      page_from: "1",
      page_to: "3",
      ...fields,
    });
    expect((await viewDocument(documentId)).body).toContain(message);
    expect(count("generation_run")).toBe(0);
  });
});

describe("acceso (FR-026, SC-007)", () => {
  const ID = "0123456789abcdef0123456789abcdef";
  const PAGES = [
    ["documentos", documentsPage, {}],
    ["subida", newDocumentPage, {}],
    ["documento", documentPage, { id: ID }],
    ["fichero original", filePage, { id: ID }],
    ["página", pagePage, { id: ID, n: "1" }],
    ["interpretación", interpretationPage, { id: ID }],
    ["unidad", unitPage, { id: ID }],
    ["requisito nuevo", newRequirementPage, { id: ID }],
    ["requisito", editRequirementPage, { id: ID, rid: ID }],
  ] as const;
  const ACTIONS = [
    ["resolver página", resolveAction],
    ["pedir interpretación", requestAction],
    ["corregir", correctAction],
    ["validar", validateAction],
    ["rechazar", rejectAction],
    ["devolver a revisión", resubmitAction],
  ] as const;

  test.each(PAGES)(
    "sin sesión, la página de %s lleva a la entrada sin devolver nada",
    async (_name, page, params) => {
      const reply = await client.get(page, { params });
      expect(reply.status).toBe(303);
      expect(reply.location).toBe("/login");
      expect(reply.body).toBe("");
    },
  );

  test.each(ACTIONS)(
    "sin sesión, %s lleva a la entrada",
    async (_name, action) => {
      const reply = await client.post(action, { csrf: "x" });
      expect(reply.status).toBe(303);
      expect(reply.location).toBe("/login");
    },
  );

  test("sin sesión, la subida se rechaza sin cuerpo y no guarda el fichero", async () => {
    const reply = await client.upload(
      uploadAction,
      fixture("five-pages.pdf"),
      META,
      {
        csrf: "x",
      },
    );
    expect(reply.status).toBe(401);
    expect(reply.body).toBe("");
    expect(count("document")).toBe(0);
  });

  describe.each([
    ["una cuenta sin perfiles", [] as string[]],
    ["solo administración", ["admin"]],
  ])("con %s", (_name, roles) => {
    test.each(PAGES)(
      "la página de %s responde 403 y se audita",
      async (_page, page, params) => {
        await enter("cuenta1", roles);
        const reply = await client.get(page, { params });
        expect(reply.status).toBe(403);
        expect(reply.body).toContain("No tienes permiso para ver esta página");
        expect(reply.body).not.toContain("Synthetic");
        expect(auditOf("access.denied")).toHaveLength(1);
      },
    );

    test.each(ACTIONS)(
      "%s responde 403 sin ejecutarse",
      async (_action, action) => {
        await enter("cuenta1", roles);
        const token = client.csrfOf(await client.get(passwordPage));
        const reply = await client.post(action, {
          csrf: token,
          interpretation: ID,
          document: ID,
          revision: "1",
        });
        expect(reply.status).toBe(403);
        expect(reply.body).toBe("");
        expect(auditOf("access.denied")).toHaveLength(1);
        expect(count("correction") + count("interpretation_validation")).toBe(
          0,
        );
      },
    );

    test("la subida responde 403 y no registra nada", async () => {
      await enter("cuenta1", roles);
      const token = client.csrfOf(await client.get(passwordPage));
      const reply = await client.upload(
        uploadAction,
        fixture("five-pages.pdf"),
        META,
        { csrf: token },
      );
      expect(reply.status).toBe(403);
      expect(reply.body).toBe("");
      expect(count("document")).toBe(0);
    });
  });

  test("la subida exige el origen, el testigo de la sesión y el tipo application/pdf", async () => {
    await enter("docente1", ["teacher"]);
    const token = await csrf();
    const file = fixture("five-pages.pdf");
    for (const [options, status] of [
      [{ csrf: token, origin: "https://atacante.example" }, 403],
      [{ csrf: token, origin: null }, 403],
      [{ csrf: "inventado" }, 403],
      [{}, 403],
      [{ csrf: token, contentType: "application/octet-stream" }, 400],
      [{ csrf: token, method: "GET" }, 405],
    ] as const) {
      const reply = await client.upload(uploadAction, file, META, options);
      expect(reply.status, JSON.stringify(options)).toBe(status);
      expect(reply.body).toBe("");
    }
    expect(count("document")).toBe(0);
  });

  test("un identificador que no existe responde 404, sin revelar nada", async () => {
    await enter("docente1", ["teacher"]);
    for (const [, page, params] of PAGES.slice(2)) {
      const reply = await client.get(page, { params });
      expect(reply.status).toBe(404);
      expect(reply.body).toContain("No encontramos lo que buscas");
    }
  });

  test("ni las respuestas ni la auditoría contienen el texto del documento fuera de sus páginas", async () => {
    await enter("docente1", ["teacher"]);
    const documentId = await registered("five-pages.pdf");
    await interpreted(documentId);
    expect(JSON.stringify(client.runtime.audit.list())).not.toContain(
      "Synthetic fixture",
    );
    expect((await client.get(documentsPage)).body).not.toContain(
      "Synthetic fixture",
    );
  });
});
