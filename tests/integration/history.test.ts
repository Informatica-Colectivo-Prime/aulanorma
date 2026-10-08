// Historial consultable (specs/002-boe-scorm-export: T087; FR-028 y FR-039;
// SC-010 y SC-044), por las rutas reales.
//
// Hace el recorrido completo con un documento sintético y respuestas
// grabadas, con una cuenta de prueba, y consulta después el historial de cada
// elemento con una cuenta de docente y con una de administración. Es un
// ensayo: ni el contenido ni las aprobaciones son reales. Necesita
// `npm run tools:install`.
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
import * as topicRejectAction from "@/pages/api/topics/reject";
import * as topicResubmitAction from "@/pages/api/topics/resubmit";
import * as packagePage from "@/pages/export/packages/[id]/index";
import * as instructionsPage from "@/pages/export/packages/[id]/instructions";
import * as documentHistory from "@/pages/history/documents/[id]";
import * as historyIndex from "@/pages/history/index";
import * as interpretationHistory from "@/pages/history/interpretations/[id]";
import * as outlineHistory from "@/pages/history/outlines/[id]";
import * as topicHistory from "@/pages/history/topics/[id]";
import * as homePage from "@/pages/index";
import * as interpretationPage from "@/pages/interpretations/[id]/index";
import * as loginPage from "@/pages/login";
import * as metricsPage from "@/pages/metrics/index";
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
const REASON = 'Falta el criterio <b>CE1.1</b> & "su" desarrollo';
const TITLES = [
  "Tema 1. La capacidad sintética y su criterio",
  "Tema 2. El contenido sintético",
  "Tema 3. El detalle del subapartado",
  "Presentación del curso",
] as const;

let client: WebClient;
let recordings: string;
let documentId = "";
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

// Graba la respuesta del tema con la entrada exacta que envía el producto.
function recordTopic(title: string, index: number): void {
  const interpretation = openStructuredInterpretation(client.runtime).get(
    interpretationId,
  );
  const linked = client.runtime.db
    .prepare(
      "SELECT requirement_id FROM entry_requirement WHERE outline_entry_id = ?",
    )
    .all(entryId(title))
    .map((row) => String(row.requirement_id));
  const input = {
    unitCode: interpretation?.unitCode,
    unitTitle: interpretation?.unitTitle,
    entryTitle: title,
    requirements: (interpretation?.requirements ?? [])
      .filter((item) => !item.withdrawn && linked.includes(item.id))
      .map((item, position) => ({
        ref: `r${String(position + 1)}`,
        kind: item.kind,
        code: item.code,
        text: item.text,
      })),
  };
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
            content: [{ type: "paragraph", text: `Desarrollo de ${title}` }],
          },
        ],
      },
    }),
  );
}

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
  documentId =
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
  const syllabus = await client.get(syllabusPage, {
    params: { id: outlineId },
  });
  expect(
    (
      await client.post(
        generateAction,
        client.hiddenFields(syllabus, "/api/syllabus/generate"),
      )
    ).status,
  ).toBe(303);
}

async function topicAction(
  action: Parameters<WebClient["post"]>[0],
  title: string,
  extra: Record<string, string> = {},
): Promise<void> {
  const page = await client.get(topicPage, { params: { id: topicId(title) } });
  const reply = await client.post(action, {
    csrf: client.csrfOf(page),
    topic: topicId(title),
    revision: revisionOf(page),
    ...extra,
  });
  expect(reply.status, reply.body).toBe(303);
}

// Recorrido completo: un tema rechazado con su motivo y vuelto a revisión,
// todos aprobados, una versión aprobada, exportada y descargada, y después
// invalidada por un cambio, con un intento de descarga denegado.
async function journey(): Promise<{ exportId: string; sha256: string }> {
  await developed();
  await topicAction(topicRejectAction, TITLES[0], { reason: REASON });
  await topicAction(topicResubmitAction, TITLES[0]);
  for (const title of TITLES) {
    await topicAction(topicApproveAction, title);
  }
  const syllabus = await client.get(syllabusPage, {
    params: { id: outlineId },
  });
  expect(
    (
      await client.post(
        versionAction,
        client.hiddenFields(syllabus, "/api/syllabus/approve"),
      )
    ).status,
  ).toBe(303);
  const version =
    openSyllabus(client.runtime)
      .review(outlineId)
      ?.versions.find((item) => item.current)?.id ?? "";
  const exported = await client.post(exportAction, {
    csrf: await csrf(),
    version,
  });
  expect(exported.status, exported.body).toBe(303);
  const row = client.runtime.db
    .prepare("SELECT id, package_sha256 FROM package_export")
    .get();
  const exportId = String(row?.id);
  expect(
    (await client.get(packagePage, { params: { id: exportId } })).status,
  ).toBe(200);
  expect(
    (await client.get(instructionsPage, { params: { id: exportId } })).status,
  ).toBe(200);

  // Un cambio en un tema aprobado invalida la versión.
  const block = idOf(
    "SELECT id FROM topic_block WHERE topic_id = ? AND " +
      "kind = 'development' AND removed = 0",
    topicId(TITLES[1]),
  );
  const form = await client.get(blockPage, {
    params: { id: topicId(TITLES[1]), bid: block },
  });
  const linked = client.runtime.db
    .prepare(
      "SELECT requirement_id FROM block_requirement WHERE topic_block_id = ?",
    )
    .all(block)
    .map((item) => String(item.requirement_id));
  expect(
    (
      await client.post(topicEditAction, {
        csrf: client.csrfOf(form),
        topic: topicId(TITLES[1]),
        revision: revisionOf(form),
        mode: "edit",
        block,
        text: "Texto cambiado después de aprobar.",
        ...Object.fromEntries(linked.map((id) => [`req_${id}`, "yes"])),
      })
    ).status,
  ).toBe(303);
  expect(
    (await client.get(packagePage, { params: { id: exportId } })).status,
  ).not.toBe(200);
  return { exportId, sha256: String(row?.package_sha256) };
}

const pages = (): [string, () => Promise<Reply>][] => [
  ["índice", () => client.get(historyIndex)],
  [
    "documento",
    () => client.get(documentHistory, { params: { id: documentId } }),
  ],
  [
    "interpretación",
    () =>
      client.get(interpretationHistory, { params: { id: interpretationId } }),
  ],
  [
    "índice y temario",
    () => client.get(outlineHistory, { params: { id: outlineId } }),
  ],
  [
    "tema",
    () => client.get(topicHistory, { params: { id: topicId(TITLES[0]) } }),
  ],
];

// Filas de la tabla del historial: fecha, cuenta, hecho y detalle.
function rows(reply: Reply): string[][] {
  return [...reply.body.matchAll(/<tr>\s*<td>(.*?)<\/tr>/gs)].map((match) =>
    `<td>${match[1] ?? ""}`
      .split(/<\/td>/)
      .slice(0, 4)
      .map((cell) =>
        cell
          .replace(/<\/?code>/g, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      ),
  );
}

const MOMENT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/;

describe("historial de cada elemento", () => {
  test("reúne correcciones, validaciones, aprobaciones, rechazos con su motivo, generaciones, exportaciones y descargas", async () => {
    await enter("docente1", ["teacher"]);
    const { sha256 } = await journey();

    // Índice: cada elemento, con su enlace.
    const index = flat(await client.get(historyIndex));
    expect(index).toContain(`href="/history/documents/${documentId}"`);
    expect(index).toContain(
      `href="/history/interpretations/${interpretationId}"`,
    );
    expect(index).toContain(`href="/history/outlines/${outlineId}"`);
    for (const title of TITLES) {
      expect(index).toContain(`href="/history/topics/${topicId(title)}"`);
    }

    // Documento: registro, con su huella, y la generación de la interpretación
    // con proveedor, modelo y versión de las instrucciones (SC-044).
    const document = rows(
      await client.get(documentHistory, { params: { id: documentId } }),
    );
    expect(document.map((row) => row[2])).toEqual([
      "Registro del documento",
      "Generación de la interpretación, pedida",
      "Llamada de generación: interpretación",
    ]);
    expect(document[0]?.[1]).toBe("docente1");
    expect(document[0]?.[3]).toMatch(/Huella SHA-256: [0-9a-f]{64}/);
    expect(document[1]?.[3]).toContain("Estado: completada");
    expect(document[2]?.[3]).toMatch(
      /Proveedor: respuestas grabadas \(ensayo, sin proveedor real\)\. Modelo: \S+\. Versión de las instrucciones: v1\. Resultado: respuesta aceptada\./,
    );

    // Interpretación: quién validó, cuándo y qué versión (SC-010).
    const interpretation = rows(
      await client.get(interpretationHistory, {
        params: { id: interpretationId },
      }),
    );
    const validation = interpretation.find((row) =>
      row[2]?.startsWith("Validación de la versión "),
    );
    expect(validation?.[0]).toMatch(MOMENT);
    expect(validation?.[1]).toBe("docente1");
    expect(validation?.[2]).toMatch(/^Validación de la versión \d+$/);
    expect(validation?.[3]).toContain("Vigente");
    expect(interpretation.map((row) => row[2])).toContain(
      "Generación del índice, pedida",
    );

    // Índice y temario: aprobaciones, generación, versión, exportación y
    // descargas, con su resultado.
    const outline = rows(
      await client.get(outlineHistory, { params: { id: outlineId } }),
    );
    const facts = outline.map((row) => row[2]);
    expect(
      facts.filter(
        (fact) => fact === "Llamada de generación: tema del temario",
      ),
    ).toHaveLength(TITLES.length);
    for (const fact of [
      "Índice creado",
      "Generación del temario, pedida",
      "Exportación del paquete",
      "Descarga del paquete",
      "Consulta de las instrucciones",
    ]) {
      expect(facts).toContain(fact);
    }
    const approval = outline.find((row) =>
      /^Aprobación de la versión \d+ del índice$/.test(row[2] ?? ""),
    );
    expect(approval?.[0]).toMatch(MOMENT);
    expect(approval?.[1]).toBe("docente1");
    const version = outline.find((row) =>
      /^Aprobación de la versión .+ del temario$/.test(row[2] ?? ""),
    );
    expect(version?.[1]).toBe("docente1");
    // La versión se invalidó después con un cambio.
    expect(version?.[3]).toMatch(
      /^Sin vigencia Huella del contenido: [0-9a-f]{64}\.$/,
    );
    const exported = outline.find(
      (row) => row[2] === "Exportación del paquete",
    );
    expect(exported?.[3]).toContain(`Huella SHA-256: ${sha256}.`);
    expect(exported?.[3]).toContain("Paquete de ensayo.");
    const downloads = outline
      .filter((row) => row[2] === "Descarga del paquete")
      .map((row) => row[3]);
    expect(downloads).toHaveLength(2);
    expect(downloads[0]).toMatch(/^Entregada\. /);
    expect(downloads[0]).toContain(`Huella del paquete: ${sha256}.`);
    expect(downloads[1]).toMatch(/^Denegada: versión sin vigencia\. /);
    // Por orden de fecha.
    const moments = outline.map((row) => row[0] ?? "");
    expect(moments).toEqual([...moments].sort());

    // Tema: generación, rechazo con su motivo literal, y aprobación.
    const reply = await client.get(topicHistory, {
      params: { id: topicId(TITLES[0]) },
    });
    const topic = rows(reply);
    expect(topic.map((row) => row[2])).toEqual([
      "Generación del contenido del tema",
      expect.stringMatching(/^Rechazo de la versión \d+ del tema$/),
      expect.stringMatching(/^Aprobación de la versión \d+ del tema$/),
    ]);
    expect(reply.body).toContain(
      "Motivo: Falta el criterio &lt;b&gt;CE1.1&lt;/b&gt; &amp; &quot;su&quot; desarrollo",
    );
    expect(reply.body).not.toContain("<b>CE1.1</b>");
    expect(topic[1]?.[1]).toBe("docente1");
    expect(topic[2]?.[3]).toBe("Vigente");
  });

  test("es de solo lectura: no ofrece ninguna acción y consultarlo no cambia nada", async () => {
    await enter("docente1", ["teacher"]);
    await journey();
    const state = (): string =>
      JSON.stringify(
        [
          "document",
          "correction",
          "interpretation_validation",
          "outline_change",
          "outline_approval",
          "topic_change",
          "topic_approval",
          "rejection",
          "syllabus_version",
          "generation_run",
          "generation_call",
          "package_export",
          "package_download",
          "budget_reservation",
        ].map((table) => [
          table,
          client.runtime.db
            .prepare(`SELECT count(*) AS total FROM ${table}`)
            .get()?.total,
        ]),
      );
    const before = state();
    for (const [, view] of pages()) {
      const reply = await view();
      expect(reply.status).toBe(200);
      // El único formulario es el de salir, de la cabecera.
      expect(reply.body.match(/<form /g)).toHaveLength(1);
      expect(reply.body).toContain('action="/api/session/sign-out"');
      expect(reply.body).toContain("Esta página es de solo lectura.");
      expect(reply.headers["cache-control"]).toBe("no-store");
    }
    expect(state()).toBe(before);
  });
});

// Estructura que necesita la tecnología de apoyo. Es una comprobación
// automática del marcado: no sustituye a una evaluación con lector de pantalla
// ni con personas.
describe("estructura de las páginas de historial y de métricas", () => {
  test("idioma, título, encabezado único, regiones, tablas con título y cabeceras, y zonas desplazables accesibles con el teclado", async () => {
    await enter("docente1", ["teacher"]);
    await journey();
    await enter("ambos", ["teacher", "admin"]);
    const views = [...pages(), ["métricas", () => client.get(metricsPage)]] as [
      string,
      () => Promise<Reply>,
    ][];
    for (const [name, view] of views) {
      const { body } = await view();
      expect(body, name).toContain('<html lang="es">');
      expect(body, name).toMatch(/<title>[^<]+ · AulaNorma<\/title>/);
      expect(body.match(/<h1[\s>]/g), name).toHaveLength(1);
      expect(body, name).toContain('<main id="contenido">');
      expect(body, name).toContain('href="#contenido"');
      expect(body, name).toContain('<nav aria-label="Principal">');
      // Ningún salto de nivel de encabezado.
      const levels = [...body.matchAll(/<h([1-6])[\s>]/g)].map((match) =>
        Number(match[1]),
      );
      levels.forEach((level, index) => {
        expect(level - (levels[index - 1] ?? 0), name).toBeLessThanOrEqual(1);
      });
      const tables = body.match(/<table>/g) ?? [];
      expect(body.match(/<caption[\s>]/g) ?? [], name).toHaveLength(
        tables.length,
      );
      expect(
        body.match(
          /<div\s+class="scroll"\s+tabindex="0"\s+role="region"\s+aria-label="[^"]+"/g,
        ) ?? [],
        name,
      ).toHaveLength(tables.length);
      // Toda celda de cabecera declara su ámbito, y no hay cabeceras vacías.
      expect(body, name).not.toMatch(/<th>/);
      expect(body, name).not.toMatch(/<th scope="col">\s*<\/th>/);
      // Nada depende solo del color: las etiquetas de vigencia llevan texto.
      expect(body, name).not.toMatch(/<span class="tag[^"]*">\s*<\/span>/);
      expect(body, name).not.toMatch(/tabindex="[1-9]/);
      expect(body, name).not.toMatch(/<img|<svg|autofocus|<marquee|<blink/);
    }
  });
});

describe("acceso al historial", () => {
  test("una cuenta de administración, sin perfil de docente, lo consulta entero", async () => {
    await enter("docente1", ["teacher"]);
    await journey();
    await enter("admin1", ["admin"]);
    for (const [name, view] of pages()) {
      const reply = await view();
      expect(reply.status, name).toBe(200);
      if (name !== "índice") {
        expect(reply.body, name).toContain("docente1");
      }
    }
    expect(flat(await client.get(homePage))).toContain('href="/history"');
  });

  test("sin sesión lleva a la entrada, y sin perfiles se deniega y se audita", async () => {
    await enter("docente1", ["teacher"]);
    await journey();
    client.cookies.clear();
    for (const [name, view] of pages()) {
      const reply = await view();
      expect(reply.status, name).toBe(303);
      expect(reply.location, name).toBe("/login");
      expect(reply.body, name).toBe("");
    }
    await enter("sinperfil", []);
    for (const [name, view] of pages()) {
      const reply = await view();
      expect(reply.status, name).toBe(403);
      expect(reply.body, name).not.toContain("docente1");
      expect(reply.body, name).not.toContain("Documento sintético");
    }
    const denied = client.runtime.audit
      .list()
      .filter((event) => event.action === "access.denied")
      .map((event) => event.details.operation);
    expect(denied).toEqual([
      "history.view",
      "history.document.view",
      "history.interpretation.view",
      "history.outline.view",
      "history.topic.view",
    ]);
    expect(flat(await client.get(homePage))).not.toContain('href="/history"');
  });

  test("un elemento que no existe responde 404 sin datos", async () => {
    await enter("docente1", ["teacher"]);
    const missing = { params: { id: "0".repeat(32) } };
    for (const page of [
      documentHistory,
      interpretationHistory,
      outlineHistory,
      topicHistory,
    ]) {
      expect((await client.get(page, missing)).status).toBe(404);
    }
    const empty = flat(await client.get(historyIndex));
    expect(empty).toContain("Todavía no hay ningún documento registrado.");
  });

  test("sus rutas son páginas de solo lectura en la lista cerrada", () => {
    const history = ROUTES.filter((route) =>
      route.target.startsWith("/history"),
    );
    expect(history.map((route) => route.target)).toEqual([
      "/history",
      "/history/documents/:id",
      "/history/interpretations/:id",
      "/history/outlines/:id",
      "/history/topics/:id",
    ]);
    for (const route of history) {
      expect(route.methods).toEqual(["GET"]);
      expect(route.maxBody).toBe(0);
    }
  });
});

// Métricas mínimas del principio XI (T085): errores, latencia, coste de
// generación y estado de las exportaciones, a partir de lo ya registrado.
describe("métricas mínimas", () => {
  // Pares de término y valor de las listas de la página.
  function figures(reply: Reply): Record<string, string> {
    return Object.fromEntries(
      [...reply.body.matchAll(/<dt>(.*?)<\/dt>\s*<dd>(.*?)<\/dd>/gs)].map(
        (match) => [
          (match[1] ?? "").replace(/\s+/g, " ").trim(),
          (match[2] ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        ],
      ),
    );
  }

  test("sin nada registrado, lo dice y no inventa cifras", async () => {
    await enter("admin1", ["admin"]);
    const reply = await client.get(metricsPage);
    expect(reply.status).toBe(200);
    const page = flat(reply);
    expect(page).toContain(
      "Todavía no hay ninguna llamada de generación registrada.",
    );
    expect(page).toContain("La de las peticiones web no se registra.");
    expect(page).not.toContain("Coste simulado");
    const values = figures(reply);
    expect(values["Paquetes generados y comprobados"]).toBe("0");
    expect(values["Exportaciones fallidas"]).toBe("0");
    expect(values["Descargas entregadas"]).toBe("0");
    expect(values["Intentos denegados"]).toBe("0");
  });

  test("tras el recorrido cuenta errores, latencia, coste y exportaciones", async () => {
    await enter("docente1", ["teacher"]);
    await journey();
    // Un intento denegado: el docente no puede ver las métricas.
    expect((await client.get(metricsPage)).status).toBe(403);
    await enter("admin1", ["admin"]);

    const reply = await client.get(metricsPage);
    expect(reply.status).toBe(200);
    const values = figures(reply);
    // La descarga con la versión invalidada y el acceso del docente.
    expect(
      client.runtime.audit
        .list()
        .filter((event) => event.result === "denied")
        .map((event) => event.action),
    ).toEqual(["export.download", "access.denied"]);
    expect(values["Intentos denegados"]).toBe("2");
    expect(values["Operaciones registradas con error"]).toBe(
      String(
        client.runtime.audit.list().filter((event) => event.result === "failed")
          .length,
      ),
    );
    // Una llamada de interpretación, una de índice y una por tema.
    const calls = 2 + TITLES.length;
    expect(values["Llamadas de generación medidas"]).toBe(String(calls));
    expect(values["Llamadas de generación sin respuesta aceptada"]).toMatch(
      new RegExp(`^0 de ${String(calls)}:`),
    );
    expect(values["Generaciones fallidas, incompletas o sin terminar"]).toBe(
      "0 fallidas, 0 incompletas y 0 sin terminar, frente a 3 completadas",
    );
    for (const key of ["Media", "Percentil 95", "Máxima"]) {
      expect(values[key]).toMatch(/^\d+ ms$/);
    }
    expect(Number.parseInt(values["Máxima"] ?? "", 10)).toBeGreaterThanOrEqual(
      Number.parseInt(values["Percentil 95"] ?? "", 10),
    );
    expect(values["Paquetes generados y comprobados"]).toBe("1");
    expect(values["Exportaciones fallidas"]).toBe("0");
    // El paquete y sus instrucciones, y un intento con la versión invalidada.
    expect(values["Descargas entregadas"]).toBe("2");
    expect(values["Descargas denegadas"]).toMatch(
      /^1: 1 por versión sin vigencia, 0 por requisitos sin cubrir y 0 sin fichero descargable$/,
    );
    expect(values["Consumo confirmado"]).toContain("moneda sin fijar");
    const page = flat(reply);
    // Las cifras del adaptador determinista no se presentan como reales.
    expect(page).toContain("estas cifras no son las de ningún proveedor");
    expect(page).toContain("Coste simulado");
    // Solo lectura.
    expect(reply.body.match(/<form /g)).toHaveLength(1);
  });

  test("solo para administración: sin sesión lleva a la entrada y un docente recibe 403", async () => {
    expect((await client.get(metricsPage)).location).toBe("/login");
    await enter("docente1", ["teacher"]);
    const reply = await client.get(metricsPage);
    expect(reply.status).toBe(403);
    expect(reply.body).not.toContain("Percentil");
    expect(client.runtime.audit.list().at(-1)).toMatchObject({
      action: "access.denied",
      details: { operation: "metrics.view", required: "admin" },
    });
    expect(flat(await client.get(homePage))).not.toContain('href="/metrics"');
    expect(ROUTES.find((route) => route.target === "/metrics")).toEqual({
      target: "/metrics",
      methods: ["GET"],
      maxBody: 0,
    });
  });
});
