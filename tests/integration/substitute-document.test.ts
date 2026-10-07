// Documento sustituto (specs/002-boe-scorm-export: T040; escenario 10 de la
// historia 1; FR-003 y FR-067; SC-038, en lo que alcanza esta historia: el
// índice y los temas todavía no existen).
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as passwordPage from "@/pages/account/password";
import * as passwordAction from "@/pages/api/account/password";
import * as uploadAction from "@/pages/api/documents/upload";
import * as correctAction from "@/pages/api/interpretations/correct";
import * as requestAction from "@/pages/api/interpretations/request";
import * as validateAction from "@/pages/api/interpretations/validate";
import * as signInAction from "@/pages/api/session/sign-in";
import * as filePage from "@/pages/documents/[id]/file";
import * as documentPage from "@/pages/documents/[id]/index";
import * as documentsPage from "@/pages/documents/index";
import * as interpretationPage from "@/pages/interpretations/[id]/index";
import * as loginPage from "@/pages/login";
import { inputDigest } from "@/platform/generation";
import { RECORDINGS_DIRECTORY } from "@/platform/web";
import { createWebClient } from "../support/web-client.ts";
import type { WebClient } from "../support/web-client.ts";

vi.setConfig({ testTimeout: 180_000 });

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixture = (name: string): Buffer =>
  readFileSync(path.join(repoRoot, "tests/fixtures/pdf/synthetic", name));
const PASSWORD = `inicial-${randomUUID()}`;
const UNIT = "UX9001";
const PAGE_TEXT = "Synthetic fixture, page 1.\nThis text is extractable.";
const META = {
  title: "Documento con una página no legible",
  issuer: "Organismo sintético",
  official_reference: "REF-0001",
  source: "Fichero sintético",
  obtained_on: "2026-10-07",
  version: "Texto original",
};

let client: WebClient;

beforeEach(() => {
  client = createWebClient();
  const recordings = path.join(client.dataDir, RECORDINGS_DIRECTORY);
  mkdirSync(recordings);
  // La misma página 1 en los dos documentos: la misma entrada y la misma
  // respuesta grabada.
  writeFileSync(
    path.join(recordings, "unidad.json"),
    JSON.stringify({
      task: "interpretation",
      promptVersion: "v1",
      inputSha256: inputDigest({
        unitCode: UNIT,
        pages: [{ number: 1, text: PAGE_TEXT }],
      }),
      output: {
        unit: {
          code: UNIT,
          title: "Unidad sintética",
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
            quote: "Synthetic fixture, page 1.",
          },
        ],
      },
    }),
  );
});

afterEach(() => {
  client.dispose();
});

const count = (table: string): number =>
  Number(
    client.runtime.db.prepare(`SELECT count(*) AS total FROM ${table}`).get()
      ?.total,
  );

test("10. el sustituto es un documento nuevo; el anterior y su interpretación quedan como histórico, sin heredar validación y sin iniciar ninguna generación", async () => {
  await client.runtime.identity.createUser({
    username: "docente1",
    password: PASSWORD,
    roles: ["teacher"],
    correlationId: "alta",
  });
  const login = await client.get(loginPage);
  await client.post(signInAction, {
    csrf: client.csrfOf(login),
    username: "docente1",
    password: PASSWORD,
  });
  const change = await client.get(passwordPage);
  await client.post(passwordAction, {
    csrf: client.csrfOf(change),
    current: PASSWORD,
    next: `nueva-${randomUUID()}`,
  });
  const token = client.csrfOf(await client.get(documentsPage));
  const upload = async (name: string, fields: Record<string, string>) => {
    const reply = await client.upload(
      uploadAction,
      fixture(name),
      { ...META, ...fields },
      { csrf: token },
    );
    expect(reply.status, reply.body).toBe(201);
    return (
      (JSON.parse(reply.body) as { location: string }).location
        .split("/")
        .pop() ?? ""
    );
  };
  const interpret = async (document: string): Promise<string> => {
    const estimate = await client.post(requestAction, {
      csrf: token,
      document,
      unit_code: UNIT,
      page_from: "1",
      page_to: "1",
    });
    const reply = await client.post(
      requestAction,
      client.hiddenFields(estimate, "/api/interpretations/request"),
    );
    expect(reply.location).toMatch(/^\/interpretations\//);
    return reply.location?.split("/").pop() ?? "";
  };

  // Un documento bloqueado: su página 2 es una imagen y no se puede validar.
  const original = await upload("image-only-page.pdf", {});
  const oldInterpretation = await interpret(original);
  const blocked = await client.post(validateAction, {
    csrf: token,
    interpretation: oldInterpretation,
    revision: "1",
    inventory_reviewed: "yes",
  });
  expect(blocked.status).toBe(422);
  const before = {
    runs: count("generation_run"),
    calls: count("generation_call"),
    interpretations: count("interpretation"),
    oldView: (
      await client.get(interpretationPage, {
        params: { id: oldInterpretation },
      })
    ).body,
  };

  // Se registra la fuente legible como sustituto.
  const substitute = await upload("text-two-pages.pdf", {
    title: "Fuente legible",
    replaces: original,
  });
  expect(substitute).not.toBe(original);

  // Registrarlo no inicia ninguna generación ni crea ninguna interpretación.
  expect(count("generation_run")).toBe(before.runs);
  expect(count("generation_call")).toBe(before.calls);
  expect(count("interpretation")).toBe(before.interpretations);

  // El anterior sigue consultable, con su original y su pendiente, y dice
  // que es histórico; ya no ofrece pedir interpretaciones.
  const oldRecord = (
    await client.get(documentPage, { params: { id: original } })
  ).body.replace(/\s+/g, " ");
  expect(oldRecord).toContain("Este documento se conserva como histórico.");
  expect(oldRecord).toContain(`href="/documents/${substitute}"`);
  expect(oldRecord).toContain("1 siguen sin resolver");
  expect(oldRecord).not.toContain('action="/api/interpretations/request"');
  expect(
    (await client.get(filePage, { params: { id: original } })).raw.equals(
      fixture("image-only-page.pdf"),
    ),
  ).toBe(true);
  expect((await client.get(documentsPage)).body.replace(/\s+/g, " ")).toContain(
    '<span class="tag">Sustituido</span>',
  );

  // Su interpretación se conserva igual, como histórico: no se corrige ni
  // se valida, tampoco tras resolver la página.
  const oldView = (
    await client.get(interpretationPage, { params: { id: oldInterpretation } })
  ).body.replace(/\s+/g, " ");
  expect(oldView).toContain("Se conserva como histórico");
  expect(oldView).toContain("Capacidad sintética.");
  expect(oldView).not.toContain('action="/api/interpretations/validate"');
  expect(oldView).not.toContain("/requirements/new");
  for (const [action, fields] of [
    [validateAction, { inventory_reviewed: "yes" }],
    [
      correctAction,
      {
        mode: "unit",
        unit_title: "Otra",
        duration_hours: "",
        duration_section: "",
        duration_page: "",
        duration_quote: "",
      },
    ],
  ] as const) {
    const reply = await client.post(action, {
      csrf: token,
      interpretation: oldInterpretation,
      revision: "1",
      ...fields,
    });
    expect([303, 422]).toContain(reply.status);
  }
  expect(count("interpretation_validation")).toBe(0);
  expect(count("correction")).toBe(0);
  expect(
    client.runtime.db
      .prepare("SELECT revision, status FROM interpretation WHERE id = ?")
      .get(oldInterpretation),
  ).toEqual({ revision: 1, status: "in_review" });

  // El sustituto empieza sin interpretación. Se pide de forma explícita, se
  // obtiene de él y no hereda validación.
  const newRecord = (
    await client.get(documentPage, { params: { id: substitute } })
  ).body.replace(/\s+/g, " ");
  expect(newRecord).toContain("Sustituye a");
  expect(newRecord).toContain(`href="/documents/${original}"`);
  expect(newRecord).toContain(
    "Todavía no se ha pedido ninguna interpretación de este documento.",
  );
  expect(newRecord).toContain("Todas las páginas tienen texto extraíble.");

  const newInterpretation = await interpret(substitute);
  expect(newInterpretation).not.toBe(oldInterpretation);
  expect(count("generation_run")).toBe(before.runs + 1);
  const newView = (
    await client.get(interpretationPage, { params: { id: newInterpretation } })
  ).body.replace(/\s+/g, " ");
  expect(newView).toContain("En revisión");
  expect(newView).toContain(
    "Todavía no hay validaciones, rechazos ni correcciones.",
  );
  // Ninguna referencia mezcla páginas: todas las de la nueva apuntan al
  // sustituto, y las de la anterior, al documento anterior.
  expect(newView).toContain(`/documents/${substitute}/pages/1`);
  expect(newView).not.toContain(`/documents/${original}/`);
  expect(oldView).toContain(`/documents/${original}/pages/1`);
  expect(oldView).not.toContain(`/documents/${substitute}/pages/`);
  expect(
    client.runtime.db
      .prepare(
        "SELECT r.id FROM requirement r JOIN interpretation i " +
          "ON i.id = r.interpretation_id WHERE i.document_id = ?",
      )
      .all(substitute),
  ).toHaveLength(1);

  // La nueva sí se puede validar, con su propia decisión.
  expect(
    (
      await client.post(validateAction, {
        csrf: token,
        interpretation: newInterpretation,
        revision: "1",
        inventory_reviewed: "yes",
      })
    ).status,
  ).toBe(303);
  expect(
    client.runtime.db
      .prepare("SELECT interpretation_id FROM interpretation_validation")
      .all(),
  ).toEqual([{ interpretation_id: newInterpretation }]);
});
