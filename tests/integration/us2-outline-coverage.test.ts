// Historia 2, de extremo a extremo por las rutas reales (specs/002-boe-scorm-
// export: T047 y T048; escenarios de aceptación 1 a 9; FR-009 a FR-015,
// FR-021, FR-058, FR-059, FR-063, FR-065 y FR-070; SC-001, SC-002, SC-006,
// SC-007, SC-026 a SC-029, SC-033 y SC-041).
//
// Usa las páginas y las acciones de `src/pages`, el tratamiento real del PDF
// con un documento sintético y el adaptador determinista con una unidad
// sintética. Necesita `npm run tools:install`. No hay red ni proveedor. Las
// aprobaciones de estas pruebas las hace una cuenta de prueba: ensayan el
// recorrido, no son decisiones de ninguna persona.
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as passwordPage from "@/pages/account/password";
import * as passwordAction from "@/pages/api/account/password";
import * as uploadAction from "@/pages/api/documents/upload";
import * as correctAction from "@/pages/api/interpretations/correct";
import * as interpretationRequestAction from "@/pages/api/interpretations/request";
import * as validateAction from "@/pages/api/interpretations/validate";
import * as approveAction from "@/pages/api/outlines/approve";
import * as editAction from "@/pages/api/outlines/edit";
import * as rejectAction from "@/pages/api/outlines/reject";
import * as requestAction from "@/pages/api/outlines/request";
import * as resubmitAction from "@/pages/api/outlines/resubmit";
import * as signInAction from "@/pages/api/session/sign-in";
import * as interpretationPage from "@/pages/interpretations/[id]/index";
import * as loginPage from "@/pages/login";
import * as entryPage from "@/pages/outlines/[id]/entries/[eid]";
import * as newEntryPage from "@/pages/outlines/[id]/entries/new";
import * as outlinePage from "@/pages/outlines/[id]/index";
import * as previewPage from "@/pages/outlines/[id]/preview";
import { RECORDINGS_DIRECTORY } from "@/platform/web";
import { createWebClient } from "../support/web-client.ts";
import type { Reply, WebClient } from "../support/web-client.ts";

vi.setConfig({ testTimeout: 180_000 });

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const RECORDINGS = path.join(repoRoot, "tests/fixtures/generation");
const RUN = randomUUID();
const PASSWORD = `inicial-${RUN}`;
const NEW_PASSWORD = `nueva-${RUN}`;
const ID = "[0-9a-f]{32}";

interface Recording {
  readonly output: { entries: unknown[]; coverageComplete?: boolean };
}

let client: WebClient;
let recordings: string;

beforeEach(() => {
  client = createWebClient();
  recordings = path.join(client.dataDir, RECORDINGS_DIRECTORY);
  mkdirSync(recordings);
  copyFileSync(
    path.join(RECORDINGS, "interpretation-synthetic-unit.json"),
    path.join(recordings, "interpretacion.json"),
  );
  // Por defecto, la propuesta grabada del repositorio.
  recordOutline((recording) => recording);
});

afterEach(() => {
  client.dispose();
});

// Deja como respuesta a la petición del índice la grabación del repositorio,
// transformada.
function recordOutline(change: (recording: Recording) => Recording): void {
  const recording = JSON.parse(
    readFileSync(path.join(RECORDINGS, "outline-synthetic-unit.json"), "utf8"),
  ) as Recording;
  writeFileSync(
    path.join(recordings, "indice.json"),
    JSON.stringify(change(recording)),
  );
}

async function enter(
  username: string,
  roles: readonly string[],
): Promise<void> {
  if (
    !client.runtime.identity
      .listUsers()
      .some((user) => user.username === username)
  ) {
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
    return;
  }
  client.cookies.clear();
  const form = await client.get(loginPage);
  await client.post(signInAction, {
    csrf: client.csrfOf(form),
    username,
    password: NEW_PASSWORD,
  });
}

async function csrf(): Promise<string> {
  return client.csrfOf(await client.get(passwordPage));
}

function flat(reply: Reply): string {
  return reply.body.replace(/\s+/g, " ");
}

const viewInterpretation = (id: string): Promise<Reply> =>
  client.get(interpretationPage, { params: { id } });
const viewOutline = (id: string): Promise<Reply> =>
  client.get(outlinePage, { params: { id } });

function revisionOf(reply: Reply): string {
  return /name="revision"\s+value="(\d+)"/.exec(reply.body)?.[1] ?? "";
}

// Sube el documento sintético, obtiene su interpretación y la valida.
async function validatedInterpretation(): Promise<string> {
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
  const id = requested.location?.split("/").pop() ?? "";
  await validate(id);
  return id;
}

async function validate(interpretationId: string): Promise<void> {
  const page = await viewInterpretation(interpretationId);
  const reply = await client.post(validateAction, {
    csrf: client.csrfOf(page),
    interpretation: interpretationId,
    revision: revisionOf(page),
    inventory_reviewed: "yes",
  });
  expect(reply.status).toBe(303);
}

// Pide el índice con el formulario de la página de la interpretación, que
// lleva las cifras mostradas; si la página no lo ofrece, lo envía sin ellas.
async function requestOutline(interpretationId: string): Promise<Reply> {
  const page = await viewInterpretation(interpretationId);
  return client.post(
    requestAction,
    page.body.includes('action="/api/outlines/request"')
      ? client.hiddenFields(page, "/api/outlines/request")
      : { csrf: await csrf(), interpretation: interpretationId },
  );
}

// Deja un índice propuesto y devuelve su identificador.
async function proposed(): Promise<{
  readonly interpretationId: string;
  readonly outlineId: string;
}> {
  const interpretationId = await validatedInterpretation();
  const reply = await requestOutline(interpretationId);
  expect(reply.status).toBe(303);
  expect(reply.location).toMatch(new RegExp(`^/outlines/${ID}$`));
  return {
    interpretationId,
    outlineId: reply.location?.split("/").pop() ?? "",
  };
}

function review(outlineId: string) {
  const loaded = client.runtime.db
    .prepare("SELECT status, revision FROM outline WHERE id = ?")
    .get(outlineId);
  return { status: loaded?.status, revision: Number(loaded?.revision) };
}

function entryId(outlineId: string, title: string): string {
  const row = client.runtime.db
    .prepare("SELECT id FROM outline_entry WHERE outline_id = ? AND title = ?")
    .get(outlineId, title);
  return typeof row?.id === "string" ? row.id : "";
}

function requirementId(code: string, text?: string): string {
  const row =
    text === undefined
      ? client.runtime.db
          .prepare("SELECT id FROM requirement WHERE code = ?")
          .get(code)
      : client.runtime.db
          .prepare("SELECT id FROM requirement WHERE text = ?")
          .get(text);
  return typeof row?.id === "string" ? row.id : "";
}

async function edit(
  outlineId: string,
  fields: Readonly<Record<string, string>>,
  revision?: string,
): Promise<Reply> {
  const page = await viewOutline(outlineId);
  return client.post(editAction, {
    csrf: client.csrfOf(page),
    outline: outlineId,
    revision: revision ?? revisionOf(page),
    ...fields,
  });
}

async function decide(
  action: typeof approveAction,
  outlineId: string,
  fields: Readonly<Record<string, string>> = {},
  revision?: string,
): Promise<Reply> {
  const page = await viewOutline(outlineId);
  return client.post(action, {
    csrf: client.csrfOf(page),
    outline: outlineId,
    revision: revision ?? revisionOf(page),
    ...fields,
  });
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

const TITLES = [
  "Tema 1. La capacidad sintética y su criterio",
  "Tema 2. El contenido sintético",
  "Tema 3. El detalle del subapartado",
  "Presentación del curso",
] as const;

describe("escenario 1: pedir el índice", () => {
  test("antes de pedirlo se muestran la estimación, el máximo reservado y el presupuesto disponible, y se dice que no son precios reales", async () => {
    await enter("docente1", ["teacher"]);
    const interpretationId = await validatedInterpretation();
    const page = flat(await viewInterpretation(interpretationId));
    expect(page).toContain("Pedir una propuesta de índice");
    expect(page).toContain("Estimación del coste (orientativa)");
    expect(page).toContain("Coste máximo que se reserva para la operación");
    expect(page).toContain("Presupuesto disponible");
    expect(page).toContain("0,00 unidades (moneda sin fijar)");
    expect(page).toContain("No son precios de ningún proveedor.");
    expect(page).toContain("Coste simulado");
  });

  test("si las cifras mostradas ya no son las actuales, no se envía nada y se dice", async () => {
    await enter("docente1", ["teacher"]);
    const interpretationId = await validatedInterpretation();
    const page = await viewInterpretation(interpretationId);
    const reply = await client.post(requestAction, {
      ...client.hiddenFields(page, "/api/outlines/request"),
      shown_max: "5",
    });
    expect(reply.location).toBe(`/interpretations/${interpretationId}`);
    expect(flat(await viewInterpretation(interpretationId))).toContain(
      "La estimación o el coste máximo han cambiado desde que los viste",
    );
    expect(auditOf("outline.request")).toEqual([
      { result: "failed", reason: "estimate_changed" },
    ]);
    expect(count("outline")).toBe(0);
    expect(
      client.runtime.db
        .prepare(
          "SELECT count(*) AS n FROM generation_run WHERE kind = 'outline'",
        )
        .get()?.n,
    ).toBe(0);
  });

  test("propone un índice en el que cada entrada declara sus requisitos, con su página, o está marcada sin respaldo normativo", async () => {
    await enter("docente1", ["teacher"]);
    const { interpretationId, outlineId } = await proposed();
    const page = await viewOutline(outlineId);
    expect(page.status).toBe(200);
    const body = flat(page);
    expect(body).toContain("La propuesta de índice se ha guardado.");
    expect(body).toContain("Propuesto");
    expect(body).toContain(
      "Respuesta grabada del adaptador determinista. No es una generación real",
    );
    for (const title of TITLES) {
      expect(body).toContain(title);
    }
    // La entrada apoyada en varios requisitos los muestra todos, con página.
    const first = body.slice(body.indexOf(TITLES[0]), body.indexOf(TITLES[1]));
    expect(first).toContain("Capacidad sintética uno.");
    expect(first).toContain("Criterio sintético uno.");
    // En el orden del inventario.
    expect(first.indexOf("Capacidad sintética uno.")).toBeLessThan(
      first.indexOf("Criterio sintético uno."),
    );
    expect(first).toMatch(/href="\/documents\/[0-9a-f]{32}\/pages\/1"/);
    expect(first).not.toContain("Sin respaldo normativo");
    const last = body.slice(
      body.indexOf(TITLES[3]),
      body.indexOf("Cobertura de los requisitos obligatorios"),
    );
    expect(last).toContain("Sin respaldo normativo");
    expect(last).toContain("no cuenta para la cobertura");
    expect(auditOf("outline.request")).toEqual([
      { result: "ok", entries: 4, provider: "deterministic" },
    ]);
    // La interpretación enlaza con su índice y ya no ofrece pedirlo.
    const interpretation = flat(await viewInterpretation(interpretationId));
    expect(interpretation).toContain(`href="/outlines/${outlineId}"`);
    expect(interpretation).not.toContain("Pedir una propuesta de índice");
  });

  test("sin interpretación validada no se ofrece ni se acepta pedirlo", async () => {
    await enter("docente1", ["teacher"]);
    const interpretationId = await validatedInterpretation();
    const page = await viewInterpretation(interpretationId);
    await client.post(correctAction, {
      csrf: client.csrfOf(page),
      interpretation: interpretationId,
      revision: revisionOf(page),
      mode: "unit",
      unit_title: "Unidad corregida",
      duration_hours: "",
      duration_section: "",
      duration_page: "",
      duration_quote: "",
    });
    const after = flat(await viewInterpretation(interpretationId));
    expect(after).not.toContain("Pedir una propuesta de índice");
    expect(after).toContain(
      "El índice se propone a partir de una interpretación validada y vigente.",
    );
    const reply = await requestOutline(interpretationId);
    expect(reply.location).toBe(`/interpretations/${interpretationId}`);
    expect(flat(await viewInterpretation(interpretationId))).toContain(
      "El índice solo se propone a partir de una interpretación validada y vigente.",
    );
    expect(count("outline")).toBe(0);
    expect(auditOf("outline.request")).toEqual([
      { result: "failed", reason: "not_validated" },
    ]);
  });

  test("una propuesta que no cumple el formato o se apoya en requisitos inexistentes se rechaza, se registra y no guarda nada", async () => {
    await enter("docente1", ["teacher"]);
    const interpretationId = await validatedInterpretation();
    recordOutline((recording) => ({ ...recording, output: { entries: [] } }));
    await requestOutline(interpretationId);
    expect(flat(await viewInterpretation(interpretationId))).toContain(
      "La propuesta del servicio de generación no cumple el formato exigido.",
    );
    recordOutline((recording) => ({
      ...recording,
      output: {
        entries: [
          { title: "Tema", unsupported: false, requirementRefs: ["r9"] },
        ],
      },
    }));
    await requestOutline(interpretationId);
    expect(flat(await viewInterpretation(interpretationId))).toContain(
      "se apoya en requisitos que no existen en el inventario",
    );
    expect(count("outline")).toBe(0);
    expect(count("outline_entry")).toBe(0);
    expect(auditOf("outline.request")).toEqual([
      { result: "failed", reason: "invalid_output" },
      { result: "failed", reason: "rejected_by_domain" },
    ]);
  });
});

describe("escenarios 2 y 3: cobertura", () => {
  test("2. muestra cada requisito obligatorio con su referencia normativa y si está cubierto, y declara el límite de la cobertura", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    const body = flat(await viewOutline(outlineId));
    expect(body).toContain("5 de 5 requisitos cubiertos.");
    expect(body).toContain("Cobertura completa");
    expect(body).toContain(
      "No garantiza que el inventario recoja todo lo que contiene el documento oficial.",
    );
    expect(body).toContain(
      "cubrir un elemento no cubre los que dependen de él ni aquel del que depende",
    );
    const table = body.slice(body.indexOf("<tbody>"), body.indexOf("</tbody>"));
    expect(table.match(/<tr>/g)).toHaveLength(5);
    for (const text of [
      "Capacidad sintética uno.",
      "Criterio sintético uno.",
      "Contenido sintético uno",
      "Subapartado sintético",
    ]) {
      expect(table).toContain(text);
    }
    // Documento, sección y página de cada requisito.
    expect(table).toContain("Documento sintético de prueba, Contenidos,");
    expect(table).toContain("Capacidades y criterios,");
    expect(table).not.toContain("No cubierto");
  });

  test("3. un requisito sin cubrir sigue apareciendo como no cubierto aunque haya entradas sin respaldo normativo", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    expect(
      (
        await edit(outlineId, {
          mode: "remove",
          entry: entryId(outlineId, TITLES[0]),
        })
      ).status,
    ).toBe(303);
    for (const title of ["Anexo A", "Anexo B"]) {
      expect((await edit(outlineId, { mode: "add", title })).location).toBe(
        `/outlines/${outlineId}`,
      );
    }
    const body = flat(await viewOutline(outlineId));
    expect(body).toContain("3 de 5 requisitos cubiertos.");
    expect(body).toContain("Cobertura incompleta");
    expect(body.match(/Sin respaldo normativo/g)?.length).toBe(3);
    const table = body.slice(body.indexOf("<tbody>"), body.indexOf("</tbody>"));
    expect(table.match(/No cubierto/g)).toHaveLength(2);
  });
});

describe("escenarios 4 y 5: aprobar y modificar después", () => {
  test("4. aprobar registra el docente, la fecha, la hora y la versión aprobada", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    const reply = await decide(approveAction, outlineId);
    expect(reply.status).toBe(303);
    expect(reply.location).toBe(`/outlines/${outlineId}`);
    const body = flat(await viewOutline(outlineId));
    expect(body).toContain("Has aprobado el índice.");
    expect(body).toMatch(
      /Aprobación de la versión 1 por docente1, el \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\. <span class="tag good">Vigente<\/span>/,
    );
    expect(body).not.toContain('action="/api/outlines/approve"');
    expect(auditOf("outline.approve")).toEqual([{ result: "ok", revision: 1 }]);
    expect(review(outlineId)).toEqual({ status: "approved", revision: 1 });
  });

  test.each([
    [
      "reordenar",
      (id: string) => ({ mode: "down", entry: entryId(id, TITLES[0]) }),
    ],
    [
      "renombrar",
      (id: string) => ({
        mode: "edit",
        entry: entryId(id, TITLES[3]),
        title: "Bienvenida",
      }),
    ],
    ["añadir", () => ({ mode: "add", title: "Anexo" })],
    [
      "quitar",
      (id: string) => ({ mode: "remove", entry: entryId(id, TITLES[3]) }),
    ],
    [
      "cambiar los requisitos de una entrada",
      (id: string) => ({
        mode: "edit",
        entry: entryId(id, TITLES[3]),
        title: TITLES[3],
        [`req_${requirementId("C1")}`]: "yes",
      }),
    ],
  ])(
    "5. %s en un índice aprobado lo devuelve a revisión e invalida su aprobación, sin borrar nada",
    async (_name, fields) => {
      await enter("docente1", ["teacher"]);
      const { outlineId } = await proposed();
      await decide(approveAction, outlineId);
      const entries = count("outline_entry");
      const reply = await edit(outlineId, fields(outlineId));
      expect(reply.status).toBe(303);
      expect(review(outlineId)).toEqual({ status: "in_review", revision: 2 });
      const body = flat(await viewOutline(outlineId));
      expect(body).toContain("El cambio queda registrado.");
      expect(body).toContain("En revisión");
      expect(body).toMatch(
        /Aprobación de la versión 1 por docente1, el [^<]+<span class="tag">Sin vigencia<\/span>/,
      );
      expect(body).toContain("da lugar a la versión 2.");
      // Se conservan los textos y el historial; no se genera nada.
      expect(count("outline_entry")).toBeGreaterThanOrEqual(entries);
      expect(count("outline_approval")).toBe(1);
      expect(count("generation_run")).toBe(2);
      // La vista previa vuelve a ser un borrador.
      expect(
        flat(await client.get(previewPage, { params: { id: outlineId } })),
      ).toContain("Borrador no entregable.");
    },
  );
});

describe("escenarios 6, 7 y 8: cobertura incompleta", () => {
  async function incomplete(): Promise<string> {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    await edit(outlineId, {
      mode: "remove",
      entry: entryId(outlineId, TITLES[2]),
    });
    return outlineId;
  }

  test("6. intentar aprobarlo se impide y muestra los requisitos pendientes con su referencia normativa", async () => {
    const outlineId = await incomplete();
    const reply = await decide(approveAction, outlineId);
    expect(reply.status).toBe(422);
    const body = flat(reply);
    expect(body).toContain(
      "No se puede aprobar: quedan requisitos obligatorios sin cubrir.",
    );
    const alert = body.slice(
      body.indexOf("Requisitos pendientes de cubrir:"),
      body.indexOf("<dl>"),
    );
    expect(alert).toContain(
      "Subapartado de segundo nivel &lt;b&gt;con marcado&lt;/b&gt;",
    );
    expect(alert).toContain("Documento sintético de prueba, Contenidos,");
    expect(alert).toMatch(/href="\/documents\/[0-9a-f]{32}\/pages\/3"/);
    expect(review(outlineId)).toEqual({ status: "in_review", revision: 2 });
    expect(count("outline_approval")).toBe(0);
    expect(auditOf("outline.approve")).toEqual([
      {
        result: "failed",
        reason: "incomplete_coverage",
        revision: 2,
        pending: 1,
      },
    ]);
  });

  test("7. se puede guardar, editar y previsualizar, y la vista previa se identifica como borrador no entregable", async () => {
    const outlineId = await incomplete();
    const saved = await edit(outlineId, { mode: "add", title: "Anexo" });
    expect(saved.status).toBe(303);
    const renamed = await edit(outlineId, {
      mode: "edit",
      entry: entryId(outlineId, "Anexo"),
      title: "Anexo final",
    });
    expect(renamed.status).toBe(303);
    const preview = await client.get(previewPage, {
      params: { id: outlineId },
    });
    expect(preview.status).toBe(200);
    const body = flat(preview);
    expect(body).toContain("Borrador no entregable.");
    expect(body).toContain("Quedan 1 requisitos obligatorios sin cubrir.");
    expect(body).toContain("Anexo final");
    expect(body).not.toContain(TITLES[2]);
    // La vista previa no genera ningún fichero ni ofrece descargas.
    expect(preview.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(body).not.toMatch(/download|\.zip/i);
  });

  test("8. no existe ninguna forma de aprobarlo de todos modos, para ningún perfil (SC-026)", async () => {
    const outlineId = await incomplete();
    const page = flat(await viewOutline(outlineId));
    expect(page).toContain("pero no aprobarlo");
    expect(page).not.toMatch(/de todos modos|forzar|excepci/i);
    // Campos de más en el envío no cambian nada.
    for (const extra of [
      { force: "yes" },
      { override: "1", skip_coverage: "yes", coverage: "complete" },
      { status: "approved" },
    ]) {
      expect((await decide(approveAction, outlineId, extra)).status).toBe(422);
    }
    // Tampoco una cuenta con los dos perfiles.
    await enter("jefa", ["admin", "teacher"]);
    expect((await decide(approveAction, outlineId)).status).toBe(422);
    // Ni las demás acciones del índice aprueban.
    for (const [action, fields] of [
      [resubmitAction, {}],
      [editAction, { mode: "approve" }],
      [editAction, { mode: "add", title: "X", status: "approved" }],
    ] as const) {
      await decide(action, outlineId, fields);
      expect(review(outlineId).status).not.toBe("approved");
    }
    expect(count("outline_approval")).toBe(0);
  });
});

describe("escenario 9: una propuesta que afirma que todo está cubierto", () => {
  test("si falta la entrada de un requisito, la cobertura lo muestra sin cubrir y el índice no se puede aprobar (SC-027)", async () => {
    await enter("docente1", ["teacher"]);
    const interpretationId = await validatedInterpretation();
    recordOutline((recording) => ({
      ...recording,
      output: {
        entries: recording.output.entries.slice(0, 2),
        coverageComplete: true,
      },
    }));
    const requested = await requestOutline(interpretationId);
    const outlineId = requested.location?.split("/").pop() ?? "";
    const body = flat(await viewOutline(outlineId));
    expect(body).toContain("4 de 5 requisitos cubiertos.");
    expect(body).toContain("Cobertura incompleta");
    const table = body.slice(body.indexOf("<tbody>"), body.indexOf("</tbody>"));
    expect(table.match(/No cubierto/g)).toHaveLength(1);
    expect((await decide(approveAction, outlineId)).status).toBe(422);
    expect(review(outlineId).status).toBe("proposed");
  });
});

describe("edición por formulario", () => {
  test("el formulario de una entrada ofrece cada requisito del inventario y guarda los marcados", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    const form = await client.get(newEntryPage, { params: { id: outlineId } });
    expect(form.status).toBe(200);
    expect(form.body.match(/type="checkbox"/g)).toHaveLength(5);
    const detail = requirementId(
      "",
      "Subapartado de segundo nivel <b>con marcado</b>",
    );
    const reply = await edit(outlineId, {
      mode: "add",
      title: "Repaso",
      [`req_${requirementId("C1")}`]: "yes",
      [`req_${detail}`]: "yes",
      // Un campo que no corresponde a ningún requisito se ignora.
      [`req_${"f".repeat(32)}`]: "yes",
    });
    expect(reply.status).toBe(303);
    const id = entryId(outlineId, "Repaso");
    const editForm = await client.get(entryPage, {
      params: { id: outlineId, eid: id },
    });
    expect(editForm.status).toBe(200);
    expect(editForm.body.match(/checked/g)).toHaveLength(2);
    expect(flat(editForm)).toContain('value="Repaso"');
  });

  test("un título inválido responde 422 con el formulario y lo enviado, sin guardar nada", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    const reply = await edit(outlineId, {
      mode: "add",
      title: "   ",
      [`req_${requirementId("C1")}`]: "yes",
    });
    expect(reply.status).toBe(422);
    expect(flat(reply)).toContain("El título no es válido.");
    expect(reply.body.match(/checked/g)).toHaveLength(1);
    expect(review(outlineId)).toEqual({ status: "proposed", revision: 1 });
  });

  test("una entrada quitada o de otro índice no tiene formulario", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    const removed = entryId(outlineId, TITLES[3]);
    await edit(outlineId, { mode: "remove", entry: removed });
    for (const eid of [removed, "f".repeat(32)]) {
      expect(
        (await client.get(entryPage, { params: { id: outlineId, eid } }))
          .status,
      ).toBe(404);
    }
    expect((await viewOutline("f".repeat(32))).status).toBe(404);
    expect(
      (await client.get(previewPage, { params: { id: "f".repeat(32) } }))
        .status,
    ).toBe(404);
  });
});

describe("conflicto entre dos sesiones (SC-033)", () => {
  test("el segundo guardado responde 409 con la versión más reciente junto al cambio enviado, y se guarda solo al reenviarlo de forma explícita", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    const target = entryId(outlineId, TITLES[1]);
    // Las dos sesiones abren la versión 1.
    const opened = revisionOf(await viewOutline(outlineId));
    expect(
      (
        await edit(
          outlineId,
          { mode: "edit", entry: target, title: "Título de la otra sesión" },
          opened,
        )
      ).status,
    ).toBe(303);
    const mine = {
      mode: "edit",
      entry: target,
      title: "Mi título",
      [`req_${requirementId("C1")}`]: "yes",
    };
    const conflict = await edit(outlineId, mine, opened);
    expect(conflict.status).toBe(409);
    const body = flat(conflict);
    expect(body).toContain(
      "Otra persona u otra sesión ha cambiado este índice desde que lo abriste. No se ha guardado nada.",
    );
    expect(body).toContain("Versión más reciente (2)");
    expect(body).toContain("Título de la otra sesión");
    expect(body).toContain("Tu cambio, sin guardar");
    expect(body).toContain('value="Mi título"');
    expect(conflict.body.match(/checked/g)).toHaveLength(1);
    expect(body).toContain("Guardar mi cambio sobre la versión 2");
    expect(body).toContain("Descartar mi cambio y volver");
    expect(body).toContain("Nada se ha fusionado");
    // No se guardó nada del segundo envío.
    expect(review(outlineId)).toEqual({ status: "in_review", revision: 2 });
    expect(entryId(outlineId, "Mi título")).toBe("");
    // El reenvío explícito contra la versión más reciente sí se guarda.
    expect(revisionOf(conflict)).toBe("2");
    const resent = await client.post(editAction, {
      csrf: client.csrfOf(conflict),
      outline: outlineId,
      revision: revisionOf(conflict),
      ...mine,
    });
    expect(resent.status).toBe(303);
    expect(review(outlineId).revision).toBe(3);
    expect(entryId(outlineId, "Mi título")).toBe(target);
  });

  test("aprobar, rechazar, reordenar o quitar sobre una versión anterior responde 409 con la más reciente, sin registrar nada", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    const opened = revisionOf(await viewOutline(outlineId));
    await edit(outlineId, { mode: "add", title: "De la otra sesión" });
    const attempts: Reply[] = [
      await decide(approveAction, outlineId, {}, opened),
      await decide(rejectAction, outlineId, { reason: "Mi motivo" }, opened),
      await edit(
        outlineId,
        { mode: "down", entry: entryId(outlineId, TITLES[0]) },
        opened,
      ),
      await edit(
        outlineId,
        { mode: "remove", entry: entryId(outlineId, TITLES[0]) },
        opened,
      ),
    ];
    for (const reply of attempts) {
      expect(reply.status).toBe(409);
      expect(flat(reply)).toContain("Esta es la versión más reciente");
      expect(flat(reply)).toContain("De la otra sesión");
      expect(revisionOf(reply)).toBe("2");
    }
    // El motivo escrito se conserva en el formulario.
    expect(attempts[1]?.body).toContain("Mi motivo");
    expect(review(outlineId)).toEqual({ status: "in_review", revision: 2 });
    expect(count("outline_approval")).toBe(0);
    expect(count("rejection")).toBe(0);
  });
});

describe("rechazo (SC-041)", () => {
  test("exige un motivo, conserva el contenido y permite devolverlo a revisión", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    const missing = await decide(rejectAction, outlineId, { reason: "  " });
    expect(missing.status).toBe(422);
    expect(flat(missing)).toContain(
      "Para rechazar tienes que escribir el motivo.",
    );
    expect(review(outlineId).status).toBe("proposed");

    const entries = count("outline_entry");
    const rejected = await decide(rejectAction, outlineId, {
      reason: "Falta un tema de repaso.",
    });
    expect(rejected.status).toBe(303);
    const body = flat(await viewOutline(outlineId));
    expect(body).toContain("Has rechazado el índice.");
    expect(body).toMatch(
      /Rechazo de la versión 1 por docente1, el [^.]+\. Motivo: Falta un tema de repaso\./,
    );
    expect(body).not.toContain('action="/api/outlines/approve"');
    expect(count("outline_entry")).toBe(entries);
    expect(count("generation_run")).toBe(2);
    // Un índice rechazado no se aprueba.
    expect((await decide(approveAction, outlineId)).status).toBe(422);

    const resubmitted = await decide(resubmitAction, outlineId);
    expect(resubmitted.status).toBe(303);
    expect(review(outlineId)).toEqual({ status: "in_review", revision: 1 });
    expect((await decide(approveAction, outlineId)).status).toBe(303);
  });
});

describe("invalidación al corregir la interpretación (SC-029)", () => {
  test("la aprobación del índice deja de estar vigente, el requisito nuevo aparece sin cubrir y hay que validar, cubrir y aprobar de nuevo", async () => {
    await enter("docente1", ["teacher"]);
    const { interpretationId, outlineId } = await proposed();
    await decide(approveAction, outlineId);

    const page = await viewInterpretation(interpretationId);
    const corrected = await client.post(correctAction, {
      csrf: client.csrfOf(page),
      interpretation: interpretationId,
      revision: revisionOf(page),
      mode: "add",
      kind: "content",
      parent: "",
      code: "2.",
      text: "Contenido añadido en la revisión",
      section: "Contenidos",
      page_from: "2",
      page_to: "2",
      quote: "",
    });
    expect(corrected.status).toBe(303);

    // La interpretación tampoco lo presenta como aprobado.
    const interpretation = flat(await viewInterpretation(interpretationId));
    expect(interpretation).toContain("Aprobación sin vigencia");
    expect(interpretation).not.toContain('<span class="tag">Aprobado</span>');

    let body = flat(await viewOutline(outlineId));
    expect(body).toContain("Aprobación sin vigencia");
    expect(body).toContain("Sin validación vigente");
    expect(body).toContain("5 de 6 requisitos cubiertos.");
    expect(body).toMatch(
      /Aprobación de la versión 1[^<]+<span class="tag">Sin vigencia/,
    );
    // El índice no ha cambiado: mismos textos y misma versión.
    expect(review(outlineId)).toEqual({ status: "approved", revision: 1 });
    for (const title of TITLES) {
      expect(body).toContain(title);
    }
    // Sin validación vigente no se aprueba.
    const blocked = await decide(approveAction, outlineId);
    expect(blocked.status).toBe(422);
    expect(flat(blocked)).toContain(
      "La interpretación en la que se apoya este índice no está validada y vigente.",
    );

    // Validar de nuevo no devuelve la vigencia ni cubre el requisito nuevo.
    await validate(interpretationId);
    body = flat(await viewOutline(outlineId));
    expect(body).toContain("Aprobación sin vigencia");
    expect(body).toContain("Validada y vigente");
    const incomplete = await decide(approveAction, outlineId);
    expect(incomplete.status).toBe(422);
    expect(flat(incomplete)).toContain("Contenido añadido en la revisión");

    await edit(outlineId, {
      mode: "add",
      title: "Tema 4",
      [`req_${requirementId("2.")}`]: "yes",
    });
    expect((await decide(approveAction, outlineId)).status).toBe(303);
    body = flat(await viewOutline(outlineId));
    expect(body).toMatch(
      /Aprobación de la versión 2[^<]+<span class="tag good">Vigente/,
    );
    expect(count("outline_approval")).toBe(2);
  });
});

describe("autorización en el servidor (SC-007)", () => {
  const PAGES = [
    ["índice", outlinePage, {}],
    ["vista previa", previewPage, {}],
    ["entrada nueva", newEntryPage, {}],
    ["entrada", entryPage, { eid: "f".repeat(32) }],
  ] as const;
  const ACTIONS = [
    ["outlines.request", requestAction],
    ["outlines.edit", editAction],
    ["outlines.approve", approveAction],
    ["outlines.reject", rejectAction],
    ["outlines.resubmit", resubmitAction],
  ] as const;

  test("sin sesión, las páginas llevan a la entrada y las acciones no hacen nada", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    const token = await csrf();
    client.cookies.clear();
    for (const [, page, extra] of PAGES) {
      const reply = await client.get(page, {
        params: { id: outlineId, ...extra },
      });
      expect(reply.status).toBe(303);
      expect(reply.location).toBe("/login");
      expect(reply.body).toBe("");
    }
    for (const [, action] of ACTIONS) {
      const reply = await client.post(action, {
        csrf: token,
        outline: outlineId,
        revision: "1",
        mode: "add",
        title: "X",
        reason: "X",
      });
      expect(reply.status).toBe(303);
      expect(reply.location).toBe("/login");
    }
    expect(review(outlineId)).toEqual({ status: "proposed", revision: 1 });
  });

  test.each([
    ["una cuenta sin perfiles", [] as string[]],
    ["una cuenta solo de administración", ["admin"]],
  ])(
    "%s recibe 403 en cada página y en cada acción, y queda auditado",
    async (_name, roles) => {
      await enter("docente1", ["teacher"]);
      const { interpretationId, outlineId } = await proposed();
      await enter("otra", roles);
      for (const [, page, extra] of PAGES) {
        const reply = await client.get(page, {
          params: { id: outlineId, ...extra },
        });
        expect(reply.status).toBe(403);
        expect(reply.body).not.toContain("Tema 1");
      }
      const token = await csrf();
      for (const [, action] of ACTIONS) {
        const reply = await client.post(action, {
          csrf: token,
          outline: outlineId,
          interpretation: interpretationId,
          revision: "1",
          mode: "add",
          title: "X",
          reason: "X",
        });
        expect(reply.status).toBe(403);
        expect(reply.body).toBe("");
      }
      expect(review(outlineId)).toEqual({ status: "proposed", revision: 1 });
      const denied = client.runtime.audit
        .list()
        .filter((event) => event.result === "denied")
        .map((event) => event.details.operation);
      expect(denied).toEqual(
        expect.arrayContaining([
          "outlines.view",
          "outlines.preview",
          "outlines.edit.view",
          ...ACTIONS.map(([operation]) => operation),
        ]),
      );
    },
  );

  test("sin el testigo de la sesión o desde otro origen, ninguna acción hace nada", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    const token = await csrf();
    for (const [, action] of ACTIONS) {
      const fields = {
        outline: outlineId,
        revision: "1",
        mode: "add",
        title: "X",
        reason: "X",
      };
      expect(
        (await client.post(action, { ...fields, csrf: "otro" })).status,
      ).toBe(403);
      expect(
        (
          await client.post(
            action,
            { ...fields, csrf: token },
            { origin: "https://otro.example" },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await client.post(
            action,
            { ...fields, csrf: token },
            { method: "GET" },
          )
        ).status,
      ).toBe(405);
    }
    expect(review(outlineId)).toEqual({ status: "proposed", revision: 1 });
  });
});

describe("documento con sustituto", () => {
  test("el índice queda como histórico: se consulta, pero no se cambia ni se aprueba", async () => {
    await enter("docente1", ["teacher"]);
    const { outlineId } = await proposed();
    await decide(approveAction, outlineId);
    const original = client.runtime.db.prepare("SELECT id FROM document").get();
    const replaced = await client.upload(
      uploadAction,
      readFileSync(
        path.join(repoRoot, "tests/fixtures/pdf/synthetic/text-two-pages.pdf"),
      ),
      {
        title: "Documento sustituto",
        issuer: "Organismo sintético",
        official_reference: "REF-0002",
        source: "Fichero sintético del repositorio",
        obtained_on: "2026-10-07",
        version: "Texto consolidado",
        replaces: typeof original?.id === "string" ? original.id : "",
      },
      { csrf: await csrf() },
    );
    expect(replaced.status, replaced.body).toBe(201);
    const page = await viewOutline(outlineId);
    expect(page.status).toBe(200);
    const body = flat(page);
    expect(body).toContain("Se conserva como histórico");
    expect(body).toContain("Aprobación sin vigencia");
    expect(body).not.toContain('action="/api/outlines/');
    expect(body).not.toContain("Añadir una entrada");
    const token = await csrf();
    const attempt = await client.post(editAction, {
      csrf: token,
      outline: outlineId,
      revision: "1",
      mode: "add",
      title: "X",
    });
    expect(attempt.status).toBe(422);
    expect(flat(attempt)).toContain("ya no se puede cambiar ni aprobar");
    expect(
      (await client.get(newEntryPage, { params: { id: outlineId } })).status,
    ).toBe(404);
    expect(review(outlineId)).toEqual({ status: "approved", revision: 1 });
  });
});
