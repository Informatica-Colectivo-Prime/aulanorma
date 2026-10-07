// Historia 3, de extremo a extremo por las rutas reales (specs/002-boe-scorm-
// export: T056, T057 y T059; escenarios de aceptación 1 a 10; FR-016 a
// FR-024, FR-027, FR-060, FR-063, FR-066 y FR-070; SC-005, SC-007, SC-028,
// SC-032, SC-033, SC-035, SC-037, SC-041 y SC-046).
//
// Usa las páginas y las acciones de `src/pages`, el tratamiento real del PDF
// con un documento sintético y el adaptador determinista con una unidad
// sintética, cuyas respuestas se graban aquí para la entrada exacta de cada
// tema. Necesita `npm run tools:install`. No hay red ni proveedor: el
// adaptador no cuesta nada, así que el consumo se simula con una reserva
// preparada. Las aprobaciones las hace una cuenta de prueba: ensayan el
// recorrido, no son decisiones de ninguna persona.
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import * as passwordPage from "@/pages/account/password";
import * as passwordAction from "@/pages/api/account/password";
import * as limitAction from "@/pages/api/budget/limit";
import * as reconcileAction from "@/pages/api/budget/reconcile";
import * as uploadAction from "@/pages/api/documents/upload";
import * as interpretationRejectAction from "@/pages/api/interpretations/reject";
import * as interpretationRequestAction from "@/pages/api/interpretations/request";
import * as validateAction from "@/pages/api/interpretations/validate";
import * as outlineApproveAction from "@/pages/api/outlines/approve";
import * as outlineEditAction from "@/pages/api/outlines/edit";
import * as outlineRejectAction from "@/pages/api/outlines/reject";
import * as outlineRequestAction from "@/pages/api/outlines/request";
import * as signInAction from "@/pages/api/session/sign-in";
import * as versionAction from "@/pages/api/syllabus/approve";
import * as generateAction from "@/pages/api/syllabus/generate";
import * as topicApproveAction from "@/pages/api/topics/approve";
import * as topicEditAction from "@/pages/api/topics/edit";
import * as topicRejectAction from "@/pages/api/topics/reject";
import * as topicResubmitAction from "@/pages/api/topics/resubmit";
import * as budgetPage from "@/pages/budget/index";
import * as homePage from "@/pages/index";
import * as interpretationPage from "@/pages/interpretations/[id]/index";
import * as loginPage from "@/pages/login";
import * as outlinePage from "@/pages/outlines/[id]/index";
import * as syllabusPage from "@/pages/syllabus/[id]";
import * as blockPage from "@/pages/topics/[id]/blocks/[bid]";
import * as newBlockPage from "@/pages/topics/[id]/blocks/new";
import * as topicPage from "@/pages/topics/[id]/index";
import { inputDigest } from "@/platform/generation";
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
const viewTopic = (id: string): Promise<Reply> =>
  client.get(topicPage, { params: { id } });
const viewOutline = (): Promise<Reply> =>
  client.get(outlinePage, { params: { id: outlineId } });

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

function entryId(title: string): string {
  const row = client.runtime.db
    .prepare("SELECT id FROM outline_entry WHERE outline_id = ? AND title = ?")
    .get(outlineId, title);
  return typeof row?.id === "string" ? row.id : "";
}

function topicId(title: string): string {
  const row = client.runtime.db
    .prepare("SELECT id FROM topic WHERE outline_entry_id = ?")
    .get(entryId(title));
  return typeof row?.id === "string" ? row.id : "";
}

function topicStates(): Record<string, string> {
  return Object.fromEntries(
    TITLES.map((title) => [
      title.slice(0, 6),
      String(
        client.runtime.db
          .prepare("SELECT status FROM topic WHERE outline_entry_id = ?")
          .get(entryId(title))?.status ?? "sin tema",
      ),
    ]),
  );
}

// Sube el documento sintético, valida su interpretación y deja su índice
// propuesto. Las aprueba una cuenta de prueba.
async function proposedOutline(): Promise<void> {
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
}

async function approveOutline(): Promise<Reply> {
  const page = await viewOutline();
  return client.post(outlineApproveAction, {
    csrf: client.csrfOf(page),
    outline: outlineId,
    revision: revisionOf(page),
  });
}

// Entrada exacta que el producto envía para desarrollar un tema.
function topicInput(title: string): unknown {
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
  };
}

// Respuesta completa para un tema: cita cada requisito y los desarrolla.
function fullOutput(title: string): unknown {
  const { requirements } = topicInput(title) as {
    requirements: { ref: string }[];
  };
  const refs = requirements.map((item) => item.ref);
  return {
    blocks: [
      ...refs.map((ref) => ({ kind: "requirement", requirementRef: ref })),
      {
        kind: "development",
        requirementRefs: refs,
        content: [
          { type: "heading", text: `Desarrollo de ${title}` },
          { type: "paragraph", text: `Texto con marcado: ${HOSTILE}` },
          { type: "list", items: ["Primera idea", "Segunda idea"] },
        ],
      },
    ],
  };
}

// Graba la respuesta del adaptador para un tema; `undefined` la retira.
function recordTopic(title: string, output: unknown = fullOutput(title)): void {
  const file = path.join(
    recordings,
    `tema-${String(TITLES.indexOf(title as (typeof TITLES)[number]))}.json`,
  );
  if (output === undefined) {
    rmSync(file, { force: true });
    return;
  }
  writeFileSync(
    file,
    JSON.stringify({
      task: "topic",
      promptVersion: "v1",
      inputSha256: inputDigest(topicInput(title)),
      output,
    }),
  );
}

async function generate(): Promise<Reply> {
  const page = await viewSyllabus();
  return client.post(
    generateAction,
    client.hiddenFields(page, "/api/syllabus/generate"),
  );
}

// Índice aprobado y temario generado con las cuatro respuestas grabadas.
async function developed(): Promise<void> {
  await proposedOutline();
  expect((await approveOutline()).status).toBe(303);
  for (const title of TITLES) {
    recordTopic(title);
  }
  expect((await generate()).status).toBe(303);
}

async function topicAction(
  action: typeof topicApproveAction,
  title: string,
  fields: Readonly<Record<string, string>> = {},
  revision?: string,
): Promise<Reply> {
  const page = await viewTopic(topicId(title));
  return client.post(action, {
    csrf: client.csrfOf(page),
    topic: topicId(title),
    revision: revision ?? revisionOf(page),
    ...fields,
  });
}

async function approveTopics(
  titles: readonly string[] = TITLES,
): Promise<void> {
  for (const title of titles) {
    expect((await topicAction(topicApproveAction, title)).status).toBe(303);
  }
}

async function approveVersion(): Promise<Reply> {
  const page = await viewSyllabus();
  return client.post(
    versionAction,
    client.hiddenFields(page, "/api/syllabus/approve"),
  );
}

function developmentBlock(title: string): string {
  const row = client.runtime.db
    .prepare(
      "SELECT id FROM topic_block WHERE topic_id = ? AND " +
        "kind = 'development' AND removed = 0",
    )
    .get(topicId(title));
  return typeof row?.id === "string" ? row.id : "";
}

function requirementId(code: string): string {
  const row = client.runtime.db
    .prepare("SELECT id FROM requirement WHERE code = ?")
    .get(code);
  return typeof row?.id === "string" ? row.id : "";
}

describe("escenario 1: sin índice aprobado y vigente", () => {
  test("no se ofrece ni se acepta desarrollar el temario, y se dice por qué", async () => {
    await enter("docente1", ["teacher"]);
    await proposedOutline();
    const page = flat(await viewSyllabus());
    expect(page).toContain(
      "El temario solo se desarrolla a partir de un índice aprobado y vigente.",
    );
    expect(page).not.toContain('action="/api/syllabus/generate"');
    const reply = await client.post(generateAction, {
      csrf: await csrf(),
      outline: outlineId,
      shown_estimate: "0",
      shown_max: "0",
    });
    expect(reply.location).toBe(`/syllabus/${outlineId}`);
    expect(flat(await viewSyllabus())).toContain("Aprueba el índice primero.");
    expect(count("topic")).toBe(0);
    expect(auditOf("syllabus.generate")).toEqual([
      { result: "failed", reason: "outline_not_approved" },
    ]);
    // Con la aprobación invalidada por una edición, tampoco.
    await approveOutline();
    const outline = await viewOutline();
    await client.post(outlineEditAction, {
      csrf: client.csrfOf(outline),
      outline: outlineId,
      revision: revisionOf(outline),
      mode: "add",
      title: "Anexo",
    });
    expect(flat(await viewSyllabus())).not.toContain(
      'action="/api/syllabus/generate"',
    );
    // El índice enlaza con su temario.
    expect(flat(await viewOutline())).toContain(
      `href="/syllabus/${outlineId}"`,
    );
  });
});

describe("generación: estimación, temas fallidos y reanudación", () => {
  test("antes de lanzarla se muestran la estimación, el máximo reservado y lo disponible, como coste simulado", async () => {
    await enter("docente1", ["teacher"]);
    await proposedOutline();
    await approveOutline();
    const page = flat(await viewSyllabus());
    expect(page).toContain("Desarrollar el temario");
    expect(page).toContain("reserva de presupuesto: 4.");
    expect(page).toContain("Estimación del coste (orientativa)");
    expect(page).toContain("Coste máximo que se reserva para la operación");
    expect(page).toContain("Presupuesto disponible");
    expect(page).toContain("Coste simulado");
    expect(page).toContain("No hay reintentos automáticos");
    expect(page).toContain("No son una generación real");
    // Con cifras que no son las mostradas no se envía nada.
    const stale = await client.post(generateAction, {
      ...client.hiddenFields(await viewSyllabus(), "/api/syllabus/generate"),
      shown_max: "9",
    });
    expect(stale.location).toBe(`/syllabus/${outlineId}`);
    expect(flat(await viewSyllabus())).toContain(
      "La estimación o el coste máximo han cambiado desde que los viste.",
    );
    expect(count("topic")).toBe(0);
  });

  test("8 y 9. los temas terminados quedan como borradores, los fallidos se identifican con su motivo, y reanudar solo genera lo pendiente o fallido", async () => {
    await enter("docente1", ["teacher"]);
    await proposedOutline();
    await approveOutline();
    // Dos respuestas válidas, una que no cumple el formato y una ausente.
    recordTopic(TITLES[0]);
    recordTopic(TITLES[1], { blocks: [] });
    recordTopic(TITLES[3]);
    const first = await generate();
    expect(first.status).toBe(303);
    expect(topicStates()).toEqual({
      "Tema 1": "draft",
      "Tema 2": "failed",
      "Tema 3": "failed",
      Presen: "draft",
    });
    let page = flat(await viewSyllabus());
    expect(page).toContain(
      "Temas terminados como borrador: 2. Fallidos: 2. No enviados por falta de presupuesto: 0. La generación está incompleta.",
    );
    expect(page).toContain("Generación incompleta.");
    expect(page).toContain(
      "la propuesta no cumplía el formato exigido y se rechazó",
    );
    expect(page).toContain("la operación terminó con error");
    expect(page).toContain("Reanudar: generar solo lo pendiente o fallido");
    expect(page).toContain("reserva de presupuesto: 2.");
    // El resultado inválido no se guardó y un tema fallido no se aprueba.
    expect(count("topic_block")).toBe(4);
    const failedTopic = await viewTopic(topicId(TITLES[1]));
    expect(flat(failedTopic)).toContain("Este tema no tiene contenido.");
    expect(failedTopic.body).not.toContain('action="/api/topics/approve"');
    const forced = await client.post(topicApproveAction, {
      csrf: await csrf(),
      topic: topicId(TITLES[1]),
      revision: "1",
    });
    expect(forced.status).toBe(422);
    // La versión no puede aprobarse.
    const blocked = await approveVersion();
    expect(blocked.status).toBe(422);
    expect(flat(blocked)).toContain(
      "Temas sin desarrollar, pendientes o fallidos:",
    );
    // Exactamente una operación por tema: ningún reintento automático.
    expect(
      client.runtime.db
        .prepare(
          "SELECT validation_result FROM generation_call WHERE task = 'topic' ORDER BY at",
        )
        .all()
        .map((row) => row.validation_result),
    ).toEqual(["valid", "invalid_output", "provider_error", "valid"]);

    // Otro intento, explícito: solo los dos fallidos, con reserva propia.
    const drafts = client.runtime.db
      .prepare("SELECT id, revision, status FROM topic WHERE status = 'draft'")
      .all();
    recordTopic(TITLES[1]);
    recordTopic(TITLES[2]);
    expect((await generate()).status).toBe(303);
    expect(topicStates()).toEqual({
      "Tema 1": "draft",
      "Tema 2": "draft",
      "Tema 3": "draft",
      Presen: "draft",
    });
    expect(count("generation_call")).toBe(2 + 4 + 2);
    expect(
      client.runtime.db
        .prepare(
          "SELECT count(*) AS n FROM budget_reservation WHERE task = 'topic'",
        )
        .get()?.n,
    ).toBe(6);
    for (const draft of drafts) {
      expect(
        client.runtime.db
          .prepare("SELECT id, revision, status FROM topic WHERE id = ?")
          .get(String(draft.id)),
      ).toEqual(draft);
    }
    page = flat(await viewSyllabus());
    expect(page).not.toContain("Generación incompleta.");
    expect(page).toContain(
      "No hay ningún tema pendiente o fallido que se pueda generar ahora.",
    );
    expect(page).toContain("5 de 5 requisitos citados y desarrollados.");
  });
});

describe("escenarios 2, 3 y 4: un tema junto a su fuente normativa", () => {
  test("cada bloque se identifica como requisito del BOE o como desarrollo, con acceso a la página de origen y los requisitos que desarrolla; el texto con marcado se muestra literal (SC-046)", async () => {
    await enter("docente1", ["teacher"]);
    await developed();
    const page = await viewTopic(topicId(TITLES[0]));
    expect(page.status).toBe(200);
    const body = flat(page);
    expect(
      body.match(/<p class="kind">Requisito extraído del BOE<\/p>/g),
    ).toHaveLength(2);
    expect(
      body.match(/<p class="kind">Desarrollo didáctico generado<\/p>/g),
    ).toHaveLength(1);
    const [norm = "", development = ""] = body
      .split('<section class="block ')
      .slice(1)
      .filter((_part, index) => index === 0 || index === 2);
    // 3. El requisito enlaza a su página de origen.
    expect(norm).toContain("Capacidad sintética uno.");
    expect(norm).toMatch(
      /href="\/documents\/[0-9a-f]{32}\/pages\/1">página 1<\/a>/,
    );
    expect(norm).toContain(
      "Documento sintético de prueba, Capacidades y criterios",
    );
    // 4. El desarrollo dice en qué requisitos se apoya.
    expect(development).toContain("Desarrolla:");
    expect(development).toContain("<strong>C1</strong>");
    expect(development).toContain("<strong>CE1.1</strong>");
    // Texto hostil: literal, nunca un elemento.
    expect(body).toContain(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&lt;b&gt;negrita&lt;/b&gt;",
    );
    expect(page.body).not.toMatch(/<script>alert|<b>negrita/);
    // Una entrada sin requisitos da un desarrollo sin respaldo normativo.
    expect(flat(await viewTopic(topicId(TITLES[3])))).toContain(
      "Sin respaldo normativo",
    );
    expect(body).toContain("No son una generación real");
  });
});

describe("edición de un tema", () => {
  test("el formulario de un bloque guarda texto plano y sus vínculos, y lo inválido responde 422 con lo enviado", async () => {
    await enter("docente1", ["teacher"]);
    await developed();
    const id = topicId(TITLES[0]);
    const form = await client.get(newBlockPage, { params: { id } });
    expect(form.status).toBe(200);
    expect(form.body.match(/type="checkbox"/g)).toHaveLength(2);
    const added = await topicAction(topicEditAction, TITLES[0], {
      mode: "add_development",
      text: `# Ampliación\n\n${HOSTILE}\n\n- uno\n- dos`,
      [`req_${requirementId("C1")}`]: "yes",
    });
    expect(added.status).toBe(303);
    const page = await viewTopic(id);
    expect(flat(page)).toContain(
      "El cambio queda registrado. El tema está en revisión.",
    );
    expect(flat(page)).toContain("<h3>Ampliación</h3>");
    expect(page.body).not.toMatch(/<script>alert|<b>negrita/);

    const invalid = await topicAction(topicEditAction, TITLES[0], {
      mode: "add_development",
      text: "   ",
      [`req_${requirementId("C1")}`]: "yes",
    });
    expect(invalid.status).toBe(422);
    expect(flat(invalid)).toContain("El contenido no es válido.");
    expect(invalid.body.match(/checked/g)).toHaveLength(1);

    const edit = await client.get(blockPage, {
      params: { id, bid: developmentBlock(TITLES[0]) },
    });
    expect(edit.status).toBe(200);
    expect(edit.body).toContain("# Desarrollo de Tema 1");
    // El texto guardado vuelve al formulario escapado.
    expect(edit.body).toContain("&lt;script&gt;");
    expect(
      (await client.get(blockPage, { params: { id, bid: "f".repeat(32) } }))
        .status,
    ).toBe(404);
    expect((await viewTopic("f".repeat(32))).status).toBe(404);
  });

  test("10. con una versión anterior, el guardado responde 409 con la más reciente junto al cambio enviado, y se guarda solo al reenviarlo (SC-033)", async () => {
    await enter("docente1", ["teacher"]);
    await developed();
    const id = topicId(TITLES[0]);
    const block = developmentBlock(TITLES[0]);
    const opened = revisionOf(await viewTopic(id));
    expect(
      (
        await topicAction(
          topicEditAction,
          TITLES[0],
          { mode: "edit", block, text: "Texto de la otra sesión." },
          opened,
        )
      ).status,
    ).toBe(303);
    const mine = {
      mode: "edit",
      block,
      text: "Mi texto, sin guardar.",
      [`req_${requirementId("CE1.1")}`]: "yes",
    };
    const conflict = await topicAction(
      topicEditAction,
      TITLES[0],
      mine,
      opened,
    );
    expect(conflict.status).toBe(409);
    const body = flat(conflict);
    expect(body).toContain(
      "Otra persona u otra sesión ha cambiado este tema desde que lo abriste. No se ha guardado nada.",
    );
    expect(body).toContain("Versión más reciente (3)");
    expect(body).toContain("Texto de la otra sesión.");
    expect(body).toContain("Tu cambio, sin guardar");
    expect(conflict.body).toContain("Mi texto, sin guardar.");
    expect(conflict.body.match(/checked/g)).toHaveLength(1);
    expect(body).toContain("Guardar mi cambio sobre la versión 3");
    expect(body).toContain("Descartar mi cambio y volver");
    expect(flat(await viewTopic(id))).not.toContain("Mi texto, sin guardar.");
    const resent = await client.post(topicEditAction, {
      ...client.hiddenFields(conflict, "/api/topics/edit"),
      text: mine.text,
      [`req_${requirementId("CE1.1")}`]: "yes",
    });
    expect(resent.status).toBe(303);
    expect(flat(await viewTopic(id))).toContain("Mi texto, sin guardar.");
    // Aprobar o rechazar sobre una versión anterior, igual.
    for (const [action, fields] of [
      [topicApproveAction, {}],
      [topicRejectAction, { reason: "Mi motivo" }],
    ] as const) {
      const reply = await topicAction(action, TITLES[0], fields, opened);
      expect(reply.status).toBe(409);
      expect(flat(reply)).toContain("Esta es la versión más reciente");
    }
    expect(count("topic_approval")).toBe(0);
    expect(count("rejection")).toBe(0);
  });
});

describe("escenarios 5, 6 y 7: aprobar la versión", () => {
  test("5. con todos los temas aprobados y cada requisito citado y desarrollado, registra la versión con docente, fecha y hora", async () => {
    await enter("docente1", ["teacher"]);
    await developed();
    // Sin temas aprobados, se impide y se dice cuáles faltan.
    const early = await approveVersion();
    expect(early.status).toBe(422);
    expect(flat(early)).toContain("Temas sin una aprobación vigente:");
    await approveTopics();
    const topic = flat(await viewTopic(topicId(TITLES[0])));
    expect(topic).toMatch(
      /Aprobación de la versión 2 por docente1, el \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\. <span class="tag good">Vigente/,
    );
    const reply = await approveVersion();
    expect(reply.status).toBe(303);
    const page = flat(await viewSyllabus());
    expect(page).toContain("Has aprobado la versión del temario.");
    expect(page).toMatch(
      /Versión v1, aprobada por docente1 el \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\. <span class="tag good">Vigente/,
    );
    expect(page).toMatch(/Huella del contenido: <code>[0-9a-f]{64}<\/code>/);
    expect(auditOf("syllabus.approve").at(-1)).toEqual({
      result: "ok",
      version: "v1",
    });
    // La instantánea no contiene identidades de usuarios.
    const snapshot = String(
      client.runtime.db.prepare("SELECT snapshot FROM syllabus_version").get()
        ?.snapshot,
    );
    expect(snapshot).not.toContain("docente1");
    expect(snapshot).toContain("Capacidad sintética uno.");
  });

  test("6. modificar un tema de una versión aprobada deja sin vigencia su aprobación y la de la versión", async () => {
    await enter("docente1", ["teacher"]);
    await developed();
    await approveTopics();
    await approveVersion();
    await topicAction(topicEditAction, TITLES[1], {
      mode: "add_development",
      text: "Un añadido posterior.",
    });
    const page = flat(await viewSyllabus());
    expect(page).toMatch(/Versión v1[^<]+<span class="tag">Sin vigencia/);
    expect(page).toContain("Temas sin una aprobación vigente:");
    const topic = flat(await viewTopic(topicId(TITLES[1])));
    expect(topic).toContain("En revisión");
    expect(topic).toMatch(
      /Aprobación de la versión 2[^<]+<span class="tag">Sin vigencia/,
    );
    expect((await approveVersion()).status).toBe(422);
    expect(count("syllabus_version")).toBe(1);
    // Con el tema aprobado de nuevo, una versión nueva; la anterior queda.
    await approveTopics([TITLES[1]]);
    expect((await approveVersion()).status).toBe(303);
    expect(flat(await viewSyllabus())).toMatch(
      /Versión v1[^<]+<span class="tag">Sin vigencia.*Versión v2[^<]+<span class="tag good">Vigente/,
    );
  });

  test("7. con un requisito citado pero sin contenido que lo desarrolle, se impide y se muestra con su referencia normativa (SC-035)", async () => {
    await enter("docente1", ["teacher"]);
    await developed();
    await topicAction(topicEditAction, TITLES[0], {
      mode: "edit",
      block: developmentBlock(TITLES[0]),
      text: "Solo desarrolla la capacidad.",
      [`req_${requirementId("C1")}`]: "yes",
    });
    await approveTopics();
    const page = flat(await viewSyllabus());
    expect(page).toContain("4 de 5 requisitos citados y desarrollados.");
    expect(page).toContain("Sin desarrollo");
    expect(page).toContain(
      "La cita identifica el requisito; por sí sola no acredita que esté desarrollado.",
    );
    const reply = await approveVersion();
    expect(reply.status).toBe(422);
    const body = flat(reply);
    expect(body).toContain("No se puede aprobar la versión");
    const alert = body.slice(
      body.indexOf("Pendiente para poder aprobar la versión:"),
      body.indexOf("<dl>"),
    );
    expect(alert).toContain(
      "Requisitos sin cita o sin contenido que los desarrolle:",
    );
    expect(alert).toContain("Criterio sintético uno.");
    expect(alert).toContain(
      "Documento sintético de prueba, Capacidades y criterios,",
    );
    expect(alert).toMatch(/href="\/documents\/[0-9a-f]{32}\/pages\/1"/);
    expect(alert).toContain("citado, pero sin desarrollo");
    expect(count("syllabus_version")).toBe(0);
    // Campos de más o una cuenta con los dos perfiles no lo cambian.
    const forced = await client.post(versionAction, {
      ...client.hiddenFields(await viewSyllabus(), "/api/syllabus/approve"),
      force: "yes",
      skip: "1",
    });
    expect(forced.status).toBe(422);
    await enter("jefa", ["admin", "teacher"]);
    expect((await approveVersion()).status).toBe(422);
    expect(count("syllabus_version")).toBe(0);
  });

  test("si el temario cambió desde que se abrió la página, aprobar responde 409 y no registra nada", async () => {
    await enter("docente1", ["teacher"]);
    await developed();
    await approveTopics();
    const opened = client.hiddenFields(
      await viewSyllabus(),
      "/api/syllabus/approve",
    );
    await topicAction(topicEditAction, TITLES[0], {
      mode: "add_development",
      text: "De otra sesión.",
    });
    const reply = await client.post(versionAction, opened);
    expect(reply.status).toBe(409);
    expect(flat(reply)).toContain(
      "El temario ha cambiado desde que abriste la página. No se ha aprobado nada.",
    );
    expect(count("syllabus_version")).toBe(0);
  });
});

describe("invalidación por el índice (SC-028)", () => {
  test.each([
    ["reordenar", () => ({ mode: "down", entry: entryId(TITLES[0]) })],
    [
      "renombrar",
      () => ({ mode: "edit", entry: entryId(TITLES[3]), title: "Bienvenida" }),
    ],
    ["añadir", () => ({ mode: "add", title: "Anexo" })],
    ["quitar", () => ({ mode: "remove", entry: entryId(TITLES[3]) })],
    [
      "cambiar los requisitos de una entrada",
      () => ({
        mode: "edit",
        entry: entryId(TITLES[3]),
        title: TITLES[3],
        [`req_${requirementId("C1")}`]: "yes",
      }),
    ],
  ])(
    "%s en el índice aprobado deja sin vigencia las aprobaciones de todos los temas y la de la versión, sin borrar ni regenerar nada",
    async (_name, fields) => {
      await enter("docente1", ["teacher"]);
      await developed();
      await approveTopics();
      await approveVersion();
      const blocks = count("topic_block");
      const calls = count("generation_call");
      const outline = await viewOutline();
      const edited = await client.post(outlineEditAction, {
        csrf: client.csrfOf(outline),
        outline: outlineId,
        revision: revisionOf(outline),
        ...fields(),
      });
      expect(edited.status).toBe(303);
      const page = flat(await viewSyllabus());
      expect(page).toContain("Sin aprobación vigente");
      expect(page).toMatch(/Versión v1[^<]+<span class="tag">Sin vigencia/);
      expect(page).not.toContain('<span class="tag good">Aprobado</span>');
      expect(page).toContain("Aprobación sin vigencia");
      expect((await approveVersion()).status).toBe(422);
      // Los temas no se aprueban hasta aprobar de nuevo el índice.
      const blocked = await topicAction(topicApproveAction, TITLES[0]);
      expect(blocked.status).toBe(422);
      expect(flat(blocked)).toContain(
        "Un tema solo se aprueba con el índice aprobado y vigente.",
      );
      // Nada se borra ni se regenera, y las aprobaciones permanecen.
      expect(count("topic_block")).toBe(blocks);
      expect(count("generation_call")).toBe(calls);
      expect(count("topic_approval")).toBe(4);
      expect(count("syllabus_version")).toBe(1);
    },
  );
});

describe("rechazo (SC-041)", () => {
  test("rechazar una interpretación, un índice o un tema exige un motivo, conserva el contenido, no genera nada y permite volver a revisión", async () => {
    await enter("docente1", ["teacher"]);
    await developed();
    const calls = count("generation_call");
    const blocks = count("topic_block");

    // Tema.
    const missing = await topicAction(topicRejectAction, TITLES[0], {
      reason: "  ",
    });
    expect(missing.status).toBe(422);
    expect(flat(missing)).toContain(
      "Para rechazar tienes que escribir el motivo.",
    );
    expect(
      (
        await topicAction(topicRejectAction, TITLES[0], {
          reason: "Falta un ejemplo.",
        })
      ).status,
    ).toBe(303);
    let topic = flat(await viewTopic(topicId(TITLES[0])));
    expect(topic).toContain("Has rechazado el tema.");
    expect(topic).toMatch(
      /Rechazo de la versión 2 por docente1, el [^.]+\. Motivo: Falta un ejemplo\./,
    );
    expect(topic).not.toContain('action="/api/topics/approve"');
    expect((await topicAction(topicApproveAction, TITLES[0])).status).toBe(422);
    expect((await topicAction(topicResubmitAction, TITLES[0])).status).toBe(
      303,
    );
    topic = flat(await viewTopic(topicId(TITLES[0])));
    expect(topic).toContain("El tema vuelve a estar en revisión.");
    expect((await topicAction(topicApproveAction, TITLES[0])).status).toBe(303);

    // Índice: su rechazo deja sin vigencia la aprobación del tema.
    const outline = await viewOutline();
    expect(
      (
        await client.post(outlineRejectAction, {
          csrf: client.csrfOf(outline),
          outline: outlineId,
          revision: revisionOf(outline),
          reason: "Hay que reordenarlo.",
        })
      ).status,
    ).toBe(303);
    expect(flat(await viewTopic(topicId(TITLES[0])))).toContain(
      "Aprobación sin vigencia",
    );

    // Interpretación.
    const interpretation = await client.get(interpretationPage, {
      params: { id: interpretationId },
    });
    expect(
      (
        await client.post(interpretationRejectAction, {
          csrf: client.csrfOf(interpretation),
          interpretation: interpretationId,
          revision: revisionOf(interpretation),
          reason: "Hay que revisar un criterio.",
        })
      ).status,
    ).toBe(303);
    expect(flat(await viewSyllabus())).toContain("Sin aprobación vigente");

    // Nada se ha borrado ni generado.
    expect(count("topic_block")).toBe(blocks);
    expect(count("generation_call")).toBe(calls);
    expect(count("rejection")).toBe(2);
    expect(count("interpretation_rejection")).toBe(1);
  });
});

describe("presupuesto por perfil (SC-037) y límite de coste (SC-032)", () => {
  // Consumo simulado: el adaptador determinista no cuesta nada, así que una
  // reserva preparada ocupa el presupuesto como lo haría una operación real
  // de resultado incierto.
  function simulateUncertain(cost: number): string {
    const run = client.runtime.generation.startRun({
      kind: "syllabus",
      targetId: outlineId,
      requestedBy: "simulación",
    });
    const reservation = client.runtime.db
      .prepare("SELECT lower(hex(randomblob(16))) AS id")
      .get()?.id;
    const id = String(reservation);
    client.runtime.db
      .prepare(
        "INSERT INTO budget_reservation (id, run_id, task, reserved_cost, " +
          "state, created_at, sent_at) VALUES (?, ?, 'topic', ?, 'sent', 0, 0)",
      )
      .run(id, run, cost);
    client.runtime.generation.budget.markUncertain(id, null);
    return id;
  }

  test("el docente consulta el presupuesto y no puede modificar el límite ni conciliar; el administrador sí, y queda registrado", async () => {
    await enter("docente1", ["teacher"]);
    await proposedOutline();
    const teacherView = await client.get(budgetPage);
    expect(teacherView.status).toBe(200);
    const body = flat(teacherView);
    expect(body).toContain("Límite del proyecto");
    expect(body).toContain("Coste simulado");
    expect(body).toContain(
      "Solo una cuenta con el perfil de administración puede fijar o modificar el límite.",
    );
    expect(teacherView.body).not.toContain('action="/api/budget/limit"');
    const token = await csrf();
    const denied = await client.post(limitAction, {
      csrf: token,
      revision: "1",
      limit: "500",
    });
    expect(denied.status).toBe(403);
    expect(denied.body).toBe("");
    expect(
      (
        await client.post(reconcileAction, {
          csrf: token,
          reservation: "x",
          cost: "1",
        })
      ).status,
    ).toBe(403);
    expect(client.runtime.generation.budget.status().limit).toBe(0);
    expect(
      client.runtime.audit
        .list()
        .filter((event) => event.result === "denied")
        .map((event) => event.details.operation),
    ).toEqual(["budget.limit", "budget.reconcile"]);

    await enter("admin1", ["admin"]);
    const adminView = await client.get(budgetPage);
    expect(adminView.status).toBe(200);
    expect(adminView.body).toContain('action="/api/budget/limit"');
    const invalid = await client.post(limitAction, {
      ...client.hiddenFields(adminView, "/api/budget/limit"),
      limit: "mucho",
    });
    expect(invalid.location).toBe("/budget");
    expect(flat(await client.get(budgetPage))).toContain(
      "El importe no es válido.",
    );
    const changed = await client.post(limitAction, {
      ...client.hiddenFields(await client.get(budgetPage), "/api/budget/limit"),
      limit: "12,5",
    });
    expect(changed.status).toBe(303);
    const after = flat(await client.get(budgetPage));
    expect(after).toContain(
      "El límite se ha modificado y queda registrado. No se ha iniciado ni reanudado ninguna generación.",
    );
    expect(after).toMatch(
      /<td>\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC<\/td> <td>admin1<\/td> <td>0,00 unidades \(moneda sin fijar\)<\/td> <td>12,50 unidades \(moneda sin fijar\)<\/td>/,
    );
    // Con una revisión anterior, no se guarda.
    const stale = await client.post(limitAction, {
      csrf: await csrf(),
      revision: "1",
      limit: "99",
    });
    expect(stale.location).toBe("/budget");
    expect(client.runtime.generation.budget.status().limit).toBe(12_500_000);
    // Modificar el límite no inicia ninguna generación.
    expect(count("topic")).toBe(0);
    // El administrador, sin perfil de docente, no entra en el temario.
    expect((await viewSyllabus()).status).toBe(403);
    // Una cuenta sin perfiles no ve el presupuesto.
    await enter("sinperfil", []);
    expect((await client.get(budgetPage)).status).toBe(403);
    expect(flat(await client.get(homePage))).not.toContain('href="/budget"');
  });

  test("al alcanzar el límite no se inicia ninguna operación; una operación incierta sigue contando hasta que el administrador la concilia, y entonces reanudar genera lo pendiente", async () => {
    await enter("docente1", ["teacher"]);
    await proposedOutline();
    await approveOutline();
    for (const title of TITLES) {
      recordTopic(title);
    }
    await enter("admin1", ["admin"]);
    await client.post(limitAction, {
      ...client.hiddenFields(await client.get(budgetPage), "/api/budget/limit"),
      limit: "1",
    });
    // Una operación incierta de 1,5 unidades: lo comprometido supera el
    // límite.
    const reservation = simulateUncertain(1_500_000);

    await enter("docente1", ["teacher"]);
    const first = await generate();
    expect(first.status).toBe(303);
    let page = flat(await viewSyllabus());
    expect(page).toContain(
      "Temas terminados como borrador: 0. Fallidos: 0. No enviados por falta de presupuesto: 4. La generación está incompleta.",
    );
    expect(page).toContain("Generación incompleta.");
    expect(topicStates()).toEqual({
      "Tema 1": "pending",
      "Tema 2": "pending",
      "Tema 3": "pending",
      Presen: "pending",
    });
    expect(
      client.runtime.db
        .prepare(
          "SELECT count(*) AS n FROM generation_call WHERE task = 'topic'",
        )
        .get()?.n,
    ).toBe(0);
    expect(flat(await client.get(budgetPage))).toContain(
      "El límite está por debajo de lo ya consumido o comprometido",
    );
    // El docente ve la operación incierta, pero no puede conciliarla.
    const teacherBudget = await client.get(budgetPage);
    expect(flat(teacherBudget)).toContain("Operaciones de resultado incierto");
    expect(teacherBudget.body).not.toContain('action="/api/budget/reconcile"');

    // El administrador la concilia con el importe confirmado.
    await enter("admin1", ["admin"]);
    const adminBudget = await client.get(budgetPage);
    expect(adminBudget.body).toContain('action="/api/budget/reconcile"');
    const reconciled = await client.post(reconcileAction, {
      ...client.hiddenFields(adminBudget, "/api/budget/reconcile"),
      cost: "0.25",
      note: "Confirmado con el proveedor.",
    });
    expect(reconciled.status).toBe(303);
    expect(flat(await client.get(budgetPage))).toContain(
      "La operación queda conciliada con el importe confirmado.",
    );
    expect(client.runtime.generation.budget.get(reservation)).toMatchObject({
      state: "settled",
      settledCost: 250_000,
    });
    expect(
      client.runtime.db.prepare("SELECT * FROM reconciliation").all(),
    ).toMatchObject([{ reservation_id: reservation, confirmed_cost: 250_000 }]);
    // Conciliar no reanuda nada.
    expect(topicStates()["Tema 1"]).toBe("pending");
    // Dos veces, no.
    const again = await client.post(reconcileAction, {
      csrf: await csrf(),
      reservation,
      cost: "1",
    });
    expect(again.location).toBe("/budget");
    expect(flat(await client.get(budgetPage))).toContain(
      "Esa operación ya no está pendiente de conciliación.",
    );

    // La reanudación explícita del docente genera lo pendiente.
    await enter("docente1", ["teacher"]);
    expect((await generate()).status).toBe(303);
    page = flat(await viewSyllabus());
    expect(page).toContain("Temas terminados como borrador: 4.");
    expect(page).not.toContain("Generación incompleta.");
  });
});

describe("autorización en el servidor (SC-007)", () => {
  test("sin sesión, sin perfil o sin el testigo, ninguna página ni acción de la historia responde", async () => {
    await enter("docente1", ["teacher"]);
    await developed();
    const topic = topicId(TITLES[0]);
    const pages = [
      [syllabusPage, { id: outlineId }],
      [topicPage, { id: topic }],
      [newBlockPage, { id: topic }],
      [blockPage, { id: topic, bid: developmentBlock(TITLES[0]) }],
    ] as const;
    const actions = [
      generateAction,
      versionAction,
      topicEditAction,
      topicApproveAction,
      topicRejectAction,
      topicResubmitAction,
    ];
    const fields = {
      outline: outlineId,
      topic,
      revision: "2",
      mode: "remove",
      block: developmentBlock(TITLES[0]),
      reason: "X",
      fingerprint: "x",
    };
    const token = await csrf();
    const before = topicStates();

    for (const action of actions) {
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
    }

    client.cookies.clear();
    for (const [page, params] of pages) {
      const reply = await client.get(page, { params });
      expect(reply.status).toBe(303);
      expect(reply.location).toBe("/login");
    }
    expect((await client.get(budgetPage)).location).toBe("/login");
    for (const action of [...actions, limitAction, reconcileAction]) {
      const reply = await client.post(action, { ...fields, csrf: token });
      expect(reply.status).toBe(303);
      expect(reply.location).toBe("/login");
    }

    await enter("sinperfil", []);
    for (const [page, params] of pages) {
      const reply = await client.get(page, { params });
      expect(reply.status).toBe(403);
      expect(reply.body).not.toContain("Capacidad sintética");
    }
    const other = await csrf();
    for (const action of actions) {
      const reply = await client.post(action, { ...fields, csrf: other });
      expect(reply.status).toBe(403);
      expect(reply.body).toBe("");
    }
    expect(topicStates()).toEqual(before);
    expect(count("topic_change")).toBe(4);
  });
});
