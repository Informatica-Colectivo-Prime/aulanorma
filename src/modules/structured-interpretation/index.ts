// Interpretación estructurada (specs/002-boe-scorm-export: FR-005 a FR-008,
// FR-057, FR-061, FR-063, FR-065, FR-067 y FR-070; data-model.md,
// «Interpretación estructurada»). API pública de la capa.
//
// La interpretación de una unidad formativa se obtiene del texto de las
// páginas de su sección, a través de la interfaz de generación, y solo se
// guarda si cumple su esquema y las comprobaciones que el esquema no puede
// hacer: cada página existe y cada cita aparece en el texto de su página.
//
// Después la revisa una persona. Cada corrección queda registrada y aumenta
// la revisión; el documento no cambia. Validar es siempre una acción humana
// explícita sobre la revisión que esa persona tiene delante, y su vigencia se
// deriva: una validación solo vale mientras su revisión es la actual. Nada se
// borra: un requisito erróneo se retira del inventario.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { openNormativeSource } from "@/modules/normative-source";
import type {
  NormativeSource,
  SourceServices,
} from "@/modules/normative-source";
import type { Audit } from "@/platform/audit";
import type { Generation } from "@/platform/generation";
import { transaction } from "@/platform/persistence";
import type { Database } from "@/platform/persistence";

export type RequirementKind =
  "capability" | "criterion" | "content" | "subcontent";
export type InterpretationStatus = "in_review" | "validated" | "rejected";

export interface Requirement {
  readonly id: string;
  readonly kind: RequirementKind;
  readonly parentId: string | null;
  readonly position: number;
  readonly code: string;
  readonly text: string;
  // Referencia normativa: siempre al documento de su interpretación.
  readonly section: string;
  readonly pageFrom: number;
  readonly pageTo: number;
  readonly quote: string | null;
  readonly origin: "generated" | "correction";
  readonly withdrawn: boolean;
  // Profundidad en la jerarquía, para mostrarla.
  readonly depth: number;
}

export interface Interpretation {
  readonly id: string;
  readonly documentId: string;
  readonly unitCode: string;
  readonly unitTitle: string;
  // La duración es un metadato de la unidad, no un requisito (FR-061).
  readonly durationHours: number | null;
  readonly durationSection: string;
  readonly durationPage: number | null;
  readonly durationQuote: string | null;
  // Sección original de la unidad en el documento.
  readonly sectionPageFrom: number;
  readonly sectionPageTo: number;
  readonly status: InterpretationStatus;
  readonly revision: number;
  readonly generationRunId: string;
  readonly createdBy: string;
  readonly createdAt: number;
  // En orden jerárquico. Incluye los retirados, marcados.
  readonly requirements: readonly Requirement[];
}

export interface Correction {
  readonly id: string;
  readonly requirementId: string | null;
  readonly kind: "edit" | "add" | "withdraw" | "unit";
  readonly author: string;
  readonly at: number;
  readonly before: string;
  readonly after: string;
  readonly resultingRevision: number;
}

export interface Validation {
  readonly id: string;
  readonly revision: number;
  readonly validatedBy: string;
  readonly validatedAt: number;
  readonly inventoryReviewedStatement: string;
  // Vigente solo si su revisión es la actual.
  readonly current: boolean;
}

export interface Rejection {
  readonly id: string;
  readonly revision: number;
  readonly rejectedBy: string;
  readonly rejectedAt: number;
  readonly reason: string;
}

export interface History {
  readonly corrections: readonly Correction[];
  readonly validations: readonly Validation[];
  readonly rejections: readonly Rejection[];
}

export interface RequirementInput {
  readonly kind: string;
  readonly parentId: string | null;
  readonly code: string;
  readonly text: string;
  readonly section: string;
  readonly pageFrom: number;
  readonly pageTo: number;
  readonly quote: string | null;
}

export interface UnitInput {
  readonly unitTitle: string;
  readonly durationHours: number | null;
  readonly durationSection: string;
  readonly durationPage: number | null;
  readonly durationQuote: string | null;
}

export type RequestRejection =
  | "document_not_found"
  | "superseded"
  | "invalid_unit"
  | "invalid_pages"
  | "already_exists"
  | "provider_error"
  | "invalid_output"
  | "rejected_by_domain";

export type RequestResult =
  | { readonly ok: true; readonly interpretationId: string }
  | { readonly ok: false; readonly reason: RequestRejection };

export type ChangeRejection =
  | "not_found"
  | "superseded"
  // Otra sesión cambió la interpretación desde que se abrió (FR-063).
  | "conflict"
  | "invalid"
  | "invalid_parent"
  | "page_not_found"
  | "quote_not_found"
  | "has_children"
  | "withdrawn"
  | "not_confirmed"
  | "not_in_review"
  | "empty_inventory"
  | "unresolved_pages"
  | "missing_reason"
  | "not_rejected";

export type ChangeResult =
  | { readonly ok: true; readonly revision: number }
  | {
      readonly ok: false;
      readonly reason: ChangeRejection;
      // Páginas sin texto que bloquean la validación.
      readonly pages: readonly number[];
    };

interface Actor {
  readonly actorId: string;
  readonly correlationId: string;
}

interface Target extends Actor {
  readonly interpretationId: string;
  // Revisión que el usuario tenía abierta.
  readonly revision: number;
}

export interface StructuredInterpretation {
  request(
    input: Actor & {
      readonly documentId: string;
      readonly unitCode: string;
      readonly pageFrom: number;
      readonly pageTo: number;
    },
  ): Promise<RequestResult>;
  listForDocument(documentId: string): readonly Interpretation[];
  get(id: string): Interpretation | undefined;
  history(id: string): History;
  editRequirement(
    input: Target & {
      readonly requirementId: string;
      readonly change: RequirementInput;
    },
  ): ChangeResult;
  addRequirement(
    input: Target & { readonly requirement: RequirementInput },
  ): ChangeResult;
  withdrawRequirement(
    input: Target & { readonly requirementId: string },
  ): ChangeResult;
  editUnit(input: Target & { readonly unit: UnitInput }): ChangeResult;
  validate(
    input: Target & { readonly inventoryReviewed: boolean },
  ): ChangeResult;
  reject(input: Target & { readonly reason: string }): ChangeResult;
  // Devuelve a revisión una interpretación rechazada, sin cambiarla.
  resubmit(input: Target): ChangeResult;
}

export interface StructuredInterpretationOptions {
  readonly db: Database;
  readonly audit: Audit;
  readonly source: NormativeSource;
  readonly generation: Generation;
  // Prompt versionado: un fichero del repositorio.
  readonly prompt: { readonly version: string; readonly instructions: string };
  readonly now: () => number;
}

// Texto que confirma quien valida (FR-057).
export const INVENTORY_REVIEW_STATEMENT =
  "Confirmo que he revisado el inventario de requisitos contra la sección " +
  "original de la unidad formativa en el documento.";

// Máximo de páginas de una sección que se envían en una petición.
export const MAX_SECTION_PAGES = 40;
const MAX_OUTPUT_TOKENS = 16_000;
const ID = /^[0-9a-f]{32}$/;
const UNIT_CODE = /^[A-Z][A-Z0-9_]{1,19}$/;
const KINDS: readonly RequirementKind[] = [
  "capability",
  "criterion",
  "content",
  "subcontent",
];

function line(max: number, min = 1) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(min)
        .max(max)
        .regex(/^[^\p{Cc}]*$/u),
    );
}

// Caracteres de control, salvo el tabulador y los saltos de línea.
function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      code === 0x7f
    ) {
      return true;
    }
  }
  return false;
}

// Texto de varias líneas: se admiten saltos de línea y tabuladores.
function block(max: number) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .max(max)
        .refine((value) => !hasControlCharacters(value)),
    );
}

const PAGE = z.number().int().min(1).max(100_000);
const QUOTE = block(2000)
  .nullable()
  .transform((value) => (value === null || value === "" ? null : value));

const REQUIREMENT_FIELDS = {
  kind: z.enum(["capability", "criterion", "content", "subcontent"]),
  code: line(40, 0),
  text: block(4000).pipe(z.string().min(1)),
  section: line(200),
  pageFrom: PAGE,
  pageTo: PAGE,
  quote: QUOTE,
};

const REQUIREMENT_INPUT = z.object({
  ...REQUIREMENT_FIELDS,
  parentId: z.string().regex(ID).nullable(),
});

const UNIT_INPUT = z.object({
  unitTitle: line(300),
  durationHours: z.number().int().min(1).max(10_000).nullable(),
  durationSection: line(200, 0),
  durationPage: PAGE.nullable(),
  durationQuote: QUOTE,
});

// Esquema versionado de la salida de la tarea `interpretation`.
export const INTERPRETATION_OUTPUT_VERSION = "v1";
export const INTERPRETATION_OUTPUT = z.object({
  unit: z.object({
    code: z.string().regex(UNIT_CODE),
    title: line(300),
    durationHours: z.number().int().min(1).max(10_000).nullable(),
    durationSection: line(200, 0),
    durationPage: PAGE.nullable(),
    durationQuote: QUOTE,
  }),
  requirements: z
    .array(
      z.object({
        ...REQUIREMENT_FIELDS,
        // Identificador local a la salida, para expresar la jerarquía.
        ref: z.string().regex(/^[\w.-]{1,40}$/),
        parentRef: z
          .string()
          .regex(/^[\w.-]{1,40}$/)
          .nullable(),
      }),
    )
    .max(500),
});
export type InterpretationOutput = z.infer<typeof INTERPRETATION_OUTPUT>;

// Jerarquía admitida: un criterio pertenece a una capacidad; un subapartado,
// a un contenido o a otro subapartado; capacidades y contenidos no tienen
// padre.
function parentAllowed(
  kind: RequirementKind,
  parent: RequirementKind | null,
): boolean {
  switch (kind) {
    case "capability":
    case "content":
      return parent === null;
    case "criterion":
      return parent === "capability";
    case "subcontent":
      return parent === "content" || parent === "subcontent";
  }
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function optionalInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : integer(value);
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

type Row = Record<string, unknown>;

function failure(
  reason: ChangeRejection,
  pages: readonly number[] = [],
): ChangeResult {
  return { ok: false, reason, pages };
}

export function createStructuredInterpretation({
  db,
  audit,
  source,
  generation,
  prompt,
  now,
}: StructuredInterpretationOptions): StructuredInterpretation {
  // La cita debe aparecer en el texto de sus páginas, sin distinguir el
  // espaciado. La comprobación es literal: no interpreta nada del texto.
  const quoteFound = (
    documentId: string,
    pageFrom: number,
    pageTo: number,
    quote: string | null,
  ): "ok" | "page_not_found" | "quote_not_found" => {
    const texts: string[] = [];
    for (let number = pageFrom; number <= pageTo; number += 1) {
      const page = source.getPage(documentId, number);
      if (page === undefined) {
        return "page_not_found";
      }
      texts.push(page.text);
    }
    if (quote === null) {
      return "ok";
    }
    return collapse(texts.join(" ")).includes(collapse(quote))
      ? "ok"
      : "quote_not_found";
  };

  const requirementsOf = (interpretationId: string): Requirement[] => {
    const rows = db
      .prepare(
        "SELECT * FROM requirement WHERE interpretation_id = ? " +
          "ORDER BY position, id",
      )
      .all(interpretationId);
    const children = new Map<string | null, Row[]>();
    for (const row of rows) {
      const parent = optionalText(row.parent_id);
      children.set(parent, [...(children.get(parent) ?? []), row]);
    }
    const ordered: Requirement[] = [];
    const visit = (parent: string | null, depth: number): void => {
      for (const row of children.get(parent) ?? []) {
        ordered.push({
          id: text(row.id),
          kind: KINDS.find((kind) => kind === row.kind) ?? "content",
          parentId: optionalText(row.parent_id),
          position: integer(row.position),
          code: text(row.code),
          text: text(row.text),
          section: text(row.section),
          pageFrom: integer(row.page_from),
          pageTo: integer(row.page_to),
          quote: optionalText(row.quote),
          origin: row.origin === "correction" ? "correction" : "generated",
          withdrawn: integer(row.withdrawn) === 1,
          depth,
        });
        visit(text(row.id), depth + 1);
      }
    };
    visit(null, 0);
    return ordered;
  };

  const interpretationOf = (row: Row): Interpretation => ({
    id: text(row.id),
    documentId: text(row.document_id),
    unitCode: text(row.unit_code),
    unitTitle: text(row.unit_title),
    durationHours: optionalInteger(row.duration_hours),
    durationSection: text(row.duration_section),
    durationPage: optionalInteger(row.duration_page),
    durationQuote: optionalText(row.duration_quote),
    sectionPageFrom: integer(row.section_page_from),
    sectionPageTo: integer(row.section_page_to),
    status:
      row.status === "validated" || row.status === "rejected"
        ? row.status
        : "in_review",
    revision: integer(row.revision),
    generationRunId: text(row.generation_run_id),
    createdBy: text(row.created_by),
    createdAt: integer(row.created_at),
    requirements: requirementsOf(text(row.id)),
  });

  const get = (id: string): Interpretation | undefined => {
    if (!ID.test(id)) {
      return undefined;
    }
    const row = db.prepare("SELECT * FROM interpretation WHERE id = ?").get(id);
    return row === undefined ? undefined : interpretationOf(row);
  };

  const record = (
    actor: Actor,
    action: string,
    targetId: string | null,
    result: "ok" | "failed",
    details: Readonly<Record<string, string | number | boolean>>,
  ): void => {
    audit.record({
      actorId: actor.actorId,
      action,
      targetKind: "interpretation",
      targetId,
      result,
      correlationId: actor.correlationId,
      details,
    });
  };

  // Ejecuta un cambio sobre la revisión abierta, en una transacción. Si la
  // interpretación cambió desde que se abrió, no se guarda nada.
  const change = (
    input: Target,
    action: string,
    work: (current: Interpretation) => ChangeResult,
  ): ChangeResult =>
    transaction(db, () => {
      const current = get(input.interpretationId);
      let result: ChangeResult;
      if (current === undefined) {
        result = failure("not_found");
      } else if (source.substitutesOf(current.documentId).length > 0) {
        // El documento tiene un sustituto: esta interpretación es histórico.
        result = failure("superseded");
      } else if (current.revision !== input.revision) {
        result = failure("conflict");
      } else {
        result = work(current);
      }
      record(
        input,
        action,
        current === undefined ? null : current.id,
        result.ok ? "ok" : "failed",
        result.ok
          ? { revision: result.revision }
          : { reason: result.reason, revision: input.revision },
      );
      return result;
    });

  // Una corrección aumenta la revisión y devuelve la interpretación a
  // revisión: la validación anterior deja de estar vigente (FR-065).
  const correct = (
    current: Interpretation,
    actor: Actor,
    kind: Correction["kind"],
    requirementId: string | null,
    before: unknown,
    after: unknown,
  ): ChangeResult => {
    const revision = current.revision + 1;
    db.prepare(
      "UPDATE interpretation SET revision = ?, status = 'in_review' " +
        "WHERE id = ?",
    ).run(revision, current.id);
    db.prepare(
      "INSERT INTO correction (id, interpretation_id, requirement_id, kind, " +
        "author, at, before, after, resulting_revision) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      newId(),
      current.id,
      requirementId,
      kind,
      actor.actorId,
      now(),
      JSON.stringify(before),
      JSON.stringify(after),
      revision,
    );
    return { ok: true, revision };
  };

  const checkRequirement = (
    current: Interpretation,
    input: RequirementInput,
    selfId: string | null,
  ):
    | { readonly ok: true; readonly data: z.infer<typeof REQUIREMENT_INPUT> }
    | { readonly ok: false; readonly reason: ChangeRejection } => {
    const parsed = REQUIREMENT_INPUT.safeParse(input);
    if (!parsed.success || parsed.data.pageTo < parsed.data.pageFrom) {
      return { ok: false, reason: "invalid" };
    }
    const { data } = parsed;
    const parent =
      data.parentId === null
        ? null
        : current.requirements.find(({ id }) => id === data.parentId);
    if (
      parent === undefined ||
      (parent !== null && (parent.withdrawn || parent.id === selfId)) ||
      !parentAllowed(data.kind, parent === null ? null : parent.kind)
    ) {
      return { ok: false, reason: "invalid_parent" };
    }
    // Un requisito no puede colgar de uno de sus descendientes.
    let ancestor: Requirement | null | undefined = parent;
    while (ancestor !== null && ancestor !== undefined) {
      if (ancestor.id === selfId) {
        return { ok: false, reason: "invalid_parent" };
      }
      const above: string | null = ancestor.parentId;
      ancestor =
        above === null
          ? null
          : current.requirements.find(({ id }) => id === above);
    }
    const found = quoteFound(
      current.documentId,
      data.pageFrom,
      data.pageTo,
      data.quote,
    );
    return found === "ok" ? { ok: true, data } : { ok: false, reason: found };
  };

  const snapshot = (requirement: Requirement): unknown => ({
    kind: requirement.kind,
    parentId: requirement.parentId,
    code: requirement.code,
    text: requirement.text,
    section: requirement.section,
    pageFrom: requirement.pageFrom,
    pageTo: requirement.pageTo,
    quote: requirement.quote,
    withdrawn: requirement.withdrawn,
  });

  return {
    async request({
      documentId,
      unitCode,
      pageFrom,
      pageTo,
      actorId,
      correlationId,
    }) {
      const actor = { actorId, correlationId };
      const refuse = (reason: RequestRejection): RequestResult => {
        record(actor, "interpretation.request", null, "failed", { reason });
        return { ok: false, reason };
      };
      const document = source.getDocument(documentId);
      if (document === undefined) {
        return refuse("document_not_found");
      }
      if (source.substitutesOf(documentId).length > 0) {
        return refuse("superseded");
      }
      if (!UNIT_CODE.test(unitCode)) {
        return refuse("invalid_unit");
      }
      if (
        !Number.isSafeInteger(pageFrom) ||
        !Number.isSafeInteger(pageTo) ||
        pageFrom < 1 ||
        pageTo < pageFrom ||
        pageTo > document.pageCount ||
        pageTo - pageFrom + 1 > MAX_SECTION_PAGES
      ) {
        return refuse("invalid_pages");
      }
      const existing = db
        .prepare(
          "SELECT id FROM interpretation WHERE document_id = ? AND unit_code = ?",
        )
        .get(documentId, unitCode);
      if (existing !== undefined) {
        return refuse("already_exists");
      }

      // Entrada de la generación: solo la unidad pedida y el texto de las
      // páginas de su sección, como dato. Ningún dato de usuarios.
      const pages: { number: number; text: string }[] = [];
      for (let number = pageFrom; number <= pageTo; number += 1) {
        pages.push({
          number,
          text: source.getPage(documentId, number)?.text ?? "",
        });
      }
      const runId = generation.startRun({
        kind: "interpretation",
        targetId: documentId,
        requestedBy: actorId,
      });
      const result = await generation.call(runId, {
        task: "interpretation",
        promptVersion: prompt.version,
        instructions: prompt.instructions,
        input: { unitCode, pages },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        outputSchema: INTERPRETATION_OUTPUT,
        accept: (output) => {
          if (output.unit.code !== unitCode) {
            return false;
          }
          const inSection = (from: number, to: number): boolean =>
            from >= pageFrom && to <= pageTo && to >= from;
          const { durationPage, durationQuote } = output.unit;
          if (
            (durationPage === null && durationQuote !== null) ||
            (durationPage !== null &&
              (!inSection(durationPage, durationPage) ||
                quoteFound(
                  documentId,
                  durationPage,
                  durationPage,
                  durationQuote,
                ) !== "ok"))
          ) {
            return false;
          }
          const kinds = new Map<string, RequirementKind>();
          for (const item of output.requirements) {
            const parent =
              item.parentRef === null ? null : kinds.get(item.parentRef);
            if (
              kinds.has(item.ref) ||
              parent === undefined ||
              !parentAllowed(item.kind, parent) ||
              !inSection(item.pageFrom, item.pageTo) ||
              quoteFound(documentId, item.pageFrom, item.pageTo, item.quote) !==
                "ok"
            ) {
              return false;
            }
            kinds.set(item.ref, item.kind);
          }
          return true;
        },
      });
      if (result.status !== "ok") {
        generation.finishRun(runId, "failed");
        return refuse(result.status);
      }

      const { unit, requirements } = result.output;
      const id = newId();
      transaction(db, () => {
        db.prepare(
          "INSERT INTO interpretation (id, document_id, unit_code, " +
            "unit_title, duration_hours, duration_section, duration_page, " +
            "duration_quote, section_page_from, section_page_to, status, " +
            "revision, generation_run_id, created_by, created_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_review', 1, ?, ?, ?)",
        ).run(
          id,
          documentId,
          unitCode,
          unit.title,
          unit.durationHours,
          unit.durationSection,
          unit.durationPage,
          unit.durationQuote,
          pageFrom,
          pageTo,
          runId,
          actorId,
          now(),
        );
        const insert = db.prepare(
          "INSERT INTO requirement (id, interpretation_id, kind, parent_id, " +
            "position, code, text, section, page_from, page_to, quote, " +
            "origin, withdrawn) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', 0)",
        );
        const ids = new Map<string, string>();
        requirements.forEach((item, position) => {
          const requirementId = newId();
          ids.set(item.ref, requirementId);
          insert.run(
            requirementId,
            id,
            item.kind,
            item.parentRef === null ? null : (ids.get(item.parentRef) ?? null),
            position,
            item.code,
            item.text,
            item.section,
            item.pageFrom,
            item.pageTo,
            item.quote,
          );
        });
        generation.finishRun(runId, "succeeded");
        record(actor, "interpretation.request", id, "ok", {
          requirements: requirements.length,
          provider: generation.provider,
        });
      });
      return { ok: true, interpretationId: id };
    },

    listForDocument(documentId) {
      if (!ID.test(documentId)) {
        return [];
      }
      return db
        .prepare(
          "SELECT * FROM interpretation WHERE document_id = ? " +
            "ORDER BY created_at, id",
        )
        .all(documentId)
        .map(interpretationOf);
    },

    get,

    history(id) {
      const current = get(id);
      if (current === undefined) {
        return { corrections: [], validations: [], rejections: [] };
      }
      return {
        corrections: db
          .prepare(
            "SELECT * FROM correction WHERE interpretation_id = ? " +
              "ORDER BY resulting_revision",
          )
          .all(id)
          .map((row) => ({
            id: text(row.id),
            requirementId: optionalText(row.requirement_id),
            kind:
              row.kind === "add" ||
              row.kind === "withdraw" ||
              row.kind === "unit"
                ? row.kind
                : "edit",
            author: text(row.author),
            at: integer(row.at),
            before: text(row.before),
            after: text(row.after),
            resultingRevision: integer(row.resulting_revision),
          })),
        validations: db
          .prepare(
            "SELECT * FROM interpretation_validation " +
              "WHERE interpretation_id = ? ORDER BY validated_at, id",
          )
          .all(id)
          .map((row) => ({
            id: text(row.id),
            revision: integer(row.interpretation_revision),
            validatedBy: text(row.validated_by),
            validatedAt: integer(row.validated_at),
            inventoryReviewedStatement: text(row.inventory_reviewed_statement),
            current:
              current.status === "validated" &&
              integer(row.interpretation_revision) === current.revision,
          })),
        rejections: db
          .prepare(
            "SELECT * FROM interpretation_rejection " +
              "WHERE interpretation_id = ? ORDER BY rejected_at, id",
          )
          .all(id)
          .map((row) => ({
            id: text(row.id),
            revision: integer(row.interpretation_revision),
            rejectedBy: text(row.rejected_by),
            rejectedAt: integer(row.rejected_at),
            reason: text(row.reason),
          })),
      };
    },

    editRequirement(input) {
      return change(input, "interpretation.correct", (current) => {
        const existing = current.requirements.find(
          ({ id }) => id === input.requirementId,
        );
        if (existing === undefined) {
          return failure("not_found");
        }
        if (existing.withdrawn) {
          return failure("withdrawn");
        }
        const checked = checkRequirement(current, input.change, existing.id);
        if (!checked.ok) {
          return failure(checked.reason);
        }
        const { data } = checked;
        // Sus hijos deben seguir colgando de un tipo que los admita.
        if (
          current.requirements.some(
            (child) =>
              child.parentId === existing.id &&
              !child.withdrawn &&
              !parentAllowed(child.kind, data.kind),
          )
        ) {
          return failure("invalid_parent");
        }
        db.prepare(
          "UPDATE requirement SET kind = ?, parent_id = ?, code = ?, " +
            "text = ?, section = ?, page_from = ?, page_to = ?, quote = ? " +
            "WHERE id = ?",
        ).run(
          data.kind,
          data.parentId,
          data.code,
          data.text,
          data.section,
          data.pageFrom,
          data.pageTo,
          data.quote,
          existing.id,
        );
        return correct(
          current,
          input,
          "edit",
          existing.id,
          snapshot(existing),
          {
            ...data,
            withdrawn: false,
          },
        );
      });
    },

    addRequirement(input) {
      return change(input, "interpretation.correct", (current) => {
        const checked = checkRequirement(current, input.requirement, null);
        if (!checked.ok) {
          return failure(checked.reason);
        }
        const { data } = checked;
        const id = newId();
        const position =
          current.requirements.reduce(
            (highest, item) => Math.max(highest, item.position),
            -1,
          ) + 1;
        db.prepare(
          "INSERT INTO requirement (id, interpretation_id, kind, parent_id, " +
            "position, code, text, section, page_from, page_to, quote, " +
            "origin, withdrawn) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'correction', 0)",
        ).run(
          id,
          current.id,
          data.kind,
          data.parentId,
          position,
          data.code,
          data.text,
          data.section,
          data.pageFrom,
          data.pageTo,
          data.quote,
        );
        return correct(current, input, "add", id, null, {
          ...data,
          withdrawn: false,
        });
      });
    },

    withdrawRequirement(input) {
      return change(input, "interpretation.correct", (current) => {
        const existing = current.requirements.find(
          ({ id }) => id === input.requirementId,
        );
        if (existing === undefined) {
          return failure("not_found");
        }
        if (existing.withdrawn) {
          return failure("withdrawn");
        }
        if (
          current.requirements.some(
            (child) => child.parentId === existing.id && !child.withdrawn,
          )
        ) {
          return failure("has_children");
        }
        db.prepare("UPDATE requirement SET withdrawn = 1 WHERE id = ?").run(
          existing.id,
        );
        return correct(
          current,
          input,
          "withdraw",
          existing.id,
          snapshot(existing),
          { ...(snapshot(existing) as object), withdrawn: true },
        );
      });
    },

    editUnit(input) {
      return change(input, "interpretation.correct", (current) => {
        const parsed = UNIT_INPUT.safeParse(input.unit);
        if (
          !parsed.success ||
          (parsed.data.durationPage === null &&
            parsed.data.durationQuote !== null)
        ) {
          return failure("invalid");
        }
        const { data } = parsed;
        if (data.durationPage !== null) {
          const found = quoteFound(
            current.documentId,
            data.durationPage,
            data.durationPage,
            data.durationQuote,
          );
          if (found !== "ok") {
            return failure(found);
          }
        }
        db.prepare(
          "UPDATE interpretation SET unit_title = ?, duration_hours = ?, " +
            "duration_section = ?, duration_page = ?, duration_quote = ? " +
            "WHERE id = ?",
        ).run(
          data.unitTitle,
          data.durationHours,
          data.durationSection,
          data.durationPage,
          data.durationQuote,
          current.id,
        );
        return correct(
          current,
          input,
          "unit",
          null,
          {
            unitTitle: current.unitTitle,
            durationHours: current.durationHours,
            durationSection: current.durationSection,
            durationPage: current.durationPage,
            durationQuote: current.durationQuote,
          },
          data,
        );
      });
    },

    validate(input) {
      return change(input, "interpretation.validate", (current) => {
        if (current.status !== "in_review") {
          return failure("not_in_review");
        }
        if (!input.inventoryReviewed) {
          return failure("not_confirmed");
        }
        if (!current.requirements.some((item) => !item.withdrawn)) {
          return failure("empty_inventory");
        }
        const pending = source.unresolvedPages(current.documentId);
        if (pending.length > 0) {
          return failure("unresolved_pages", pending);
        }
        db.prepare(
          "UPDATE interpretation SET status = 'validated' WHERE id = ?",
        ).run(current.id);
        db.prepare(
          "INSERT INTO interpretation_validation (id, interpretation_id, " +
            "interpretation_revision, validated_by, validated_at, " +
            "inventory_reviewed_statement) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(
          newId(),
          current.id,
          current.revision,
          input.actorId,
          now(),
          INVENTORY_REVIEW_STATEMENT,
        );
        return { ok: true, revision: current.revision };
      });
    },

    reject(input) {
      return change(input, "interpretation.reject", (current) => {
        const reason = block(1000).safeParse(input.reason);
        if (!reason.success || reason.data === "") {
          return failure("missing_reason");
        }
        // Rechazar conserva el contenido y no inicia ninguna generación.
        db.prepare(
          "UPDATE interpretation SET status = 'rejected' WHERE id = ?",
        ).run(current.id);
        db.prepare(
          "INSERT INTO interpretation_rejection (id, interpretation_id, " +
            "interpretation_revision, rejected_by, rejected_at, reason) " +
            "VALUES (?, ?, ?, ?, ?, ?)",
        ).run(
          newId(),
          current.id,
          current.revision,
          input.actorId,
          now(),
          reason.data,
        );
        return { ok: true, revision: current.revision };
      });
    },

    resubmit(input) {
      return change(input, "interpretation.resubmit", (current) => {
        if (current.status !== "rejected") {
          return failure("not_rejected");
        }
        db.prepare(
          "UPDATE interpretation SET status = 'in_review' WHERE id = ?",
        ).run(current.id);
        return { ok: true, revision: current.revision };
      });
    },
  };
}

// --- Composición ---

export const INTERPRETATION_PROMPT_VERSION = "v1";

export interface InterpretationServices extends SourceServices {
  readonly generation: Generation;
}

const opened = new WeakMap<InterpretationServices, StructuredInterpretation>();

// La interpretación estructurada de estos servicios: una por proceso. El
// prompt es el fichero versionado del repositorio.
export function openStructuredInterpretation(
  services: InterpretationServices,
): StructuredInterpretation {
  let interpretation = opened.get(services);
  if (interpretation === undefined) {
    interpretation = createStructuredInterpretation({
      db: services.db,
      audit: services.audit,
      source: openNormativeSource(services),
      generation: services.generation,
      prompt: {
        version: INTERPRETATION_PROMPT_VERSION,
        instructions: readFileSync(
          `${services.projectRoot}/prompts/interpretation/${INTERPRETATION_PROMPT_VERSION}.md`,
          "utf8",
        ),
      },
      now: () => Date.now(),
    });
    opened.set(services, interpretation);
  }
  return interpretation;
}
