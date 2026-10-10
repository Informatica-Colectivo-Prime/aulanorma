// Contenido didáctico: el índice del temario (specs/002-boe-scorm-export:
// FR-009 a FR-015, FR-058, FR-059, FR-063, FR-065 y FR-070; data-model.md,
// «Contenido didáctico»). API pública de la capa.
//
// El índice se propone a partir de una interpretación validada y vigente, a
// través de la interfaz de generación, y solo se guarda si cumple su esquema
// y si cada entrada se apoya en requisitos que existen en el inventario o va
// marcada «sin respaldo normativo». Lo que la propuesta afirme sobre la
// cobertura se ignora: la cobertura se calcula (`./coverage`).
//
// Después lo revisa una persona. Cada cambio queda registrado y aumenta la
// revisión; nada se borra: una entrada quitada queda marcada. Aprobar y
// rechazar son siempre acciones humanas explícitas sobre la revisión que esa
// persona tiene delante. Aprobar exige cobertura completa y no existe ninguna
// vía para saltárselo. La vigencia de una aprobación se deriva: vale solo
// mientras su revisión del índice es la actual y la validación de la
// interpretación en la que se apoyó sigue vigente. Por eso cualquier cambio
// del índice aprobado, o de su interpretación, la deja sin vigencia sin
// borrar nada.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import type {
  Interpretation,
  InterpretationServices,
  Requirement,
  StructuredInterpretation,
} from "@/modules/structured-interpretation";
import type { Audit } from "@/platform/audit";
import type { CostEstimate, Generation } from "@/platform/generation";
import { transaction } from "@/platform/persistence";
import type { Database } from "@/platform/persistence";
import { computeCoverage } from "./coverage";
import type { Coverage } from "./coverage";
import { createReferences } from "./references";
import type { ReferenceCheck } from "./references";
import { createSyllabus } from "./syllabus";
import type { Syllabus } from "./syllabus";

export { computeCoverage } from "./coverage";
export type { Coverage, CoverageEntry, CoverageItem } from "./coverage";
export type { ReferenceCheck } from "./references";
export {
  CONTENT,
  contentToText,
  DEVELOPMENT_LABEL,
  renderBlock,
  renderBlocks,
  REQUIREMENT_LABEL,
  textToContent,
  UNSUPPORTED_LABEL,
} from "./render/index";
export type {
  ContentNode,
  RenderBlock,
  RenderedRequirement,
  RenderOptions,
} from "./render/index";
export {
  computeDevelopment,
  createSyllabus,
  MAX_BLOCKS,
  TOPIC_OUTPUT,
} from "./syllabus";
export type {
  Development,
  DevelopmentInput,
  DevelopmentItem,
  GenerateRejection,
  GenerateResult,
  Syllabus,
  SyllabusReview,
  SyllabusTopic,
  SyllabusVersion,
  Topic,
  TopicApproval,
  TopicBlock,
  TopicChange,
  TopicFailure,
  TopicHistory,
  TopicOutput,
  TopicRejection,
  TopicResult,
  TopicReview,
  TopicStatus,
  VersionBlockers,
  VersionLocation,
  VersionResult,
} from "./syllabus";

export type OutlineStatus = "proposed" | "in_review" | "approved" | "rejected";

export interface OutlineEntry {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  // «Sin respaldo normativo»: no se apoya en ningún requisito.
  readonly unsupported: boolean;
  // Quitada del índice. Se conserva, marcada.
  readonly removed: boolean;
  // Vínculos explícitos con requisitos del inventario.
  readonly requirementIds: readonly string[];
}

export interface Outline {
  readonly id: string;
  readonly interpretationId: string;
  readonly status: OutlineStatus;
  readonly revision: number;
  readonly generationRunId: string;
  readonly createdBy: string;
  readonly createdAt: number;
  // En su orden. Incluye las quitadas, marcadas.
  readonly entries: readonly OutlineEntry[];
}

export interface OutlineChange {
  readonly id: string;
  readonly entryId: string;
  readonly kind: "add" | "edit" | "move" | "remove";
  readonly author: string;
  readonly at: number;
  readonly before: string;
  readonly after: string;
  readonly resultingRevision: number;
}

export interface OutlineApproval {
  readonly id: string;
  readonly revision: number;
  readonly interpretationValidationId: string;
  readonly approvedBy: string;
  readonly approvedAt: number;
  // Vigente solo si su revisión es la actual, el índice sigue aprobado y la
  // validación de la interpretación en la que se apoyó sigue vigente.
  readonly current: boolean;
}

export interface OutlineRejection {
  readonly id: string;
  readonly revision: number;
  readonly rejectedBy: string;
  readonly rejectedAt: number;
  readonly reason: string;
}

export interface OutlineHistory {
  readonly changes: readonly OutlineChange[];
  readonly approvals: readonly OutlineApproval[];
  readonly rejections: readonly OutlineRejection[];
}

// Todo lo que hace falta para mostrar un índice, leído de una vez.
export interface OutlineReview {
  readonly outline: Outline;
  readonly interpretation: Interpretation;
  readonly coverage: Coverage<OutlineEntry>;
  // `true` si la interpretación está validada, vigente y no es histórico.
  readonly interpretationValid: boolean;
  // `true` si el documento de la interpretación tiene un sustituto.
  readonly historical: boolean;
  // Con un documento sustituto: requisitos en los que se apoya el índice y
  // cuya referencia nadie ha comprobado todavía contra la nueva fuente. Vacío
  // si no hay sustituto.
  readonly referencesPending: readonly Requirement[];
  readonly referenceChecks: readonly ReferenceCheck[];
  // La aprobación vigente, si la hay.
  readonly approval: OutlineApproval | undefined;
  readonly history: OutlineHistory;
}

export interface EntryInput {
  readonly title: string;
  readonly requirementIds: readonly string[];
}

export type RequestRejection =
  | "interpretation_not_found"
  | "superseded"
  | "not_validated"
  | "already_exists"
  | "provider_error"
  | "invalid_output"
  | "rejected_by_domain"
  // No había presupuesto para reservar la operación: no se envió nada.
  | "budget_exceeded"
  // Las cifras que el usuario vio ya no son las actuales: no se envió nada.
  | "estimate_changed";

export type RequestResult =
  | { readonly ok: true; readonly outlineId: string }
  | { readonly ok: false; readonly reason: RequestRejection };

export type ChangeRejection =
  | "not_found"
  | "superseded"
  // Otra sesión cambió el índice desde que se abrió (FR-063).
  | "conflict"
  | "invalid"
  | "unknown_requirement"
  | "removed"
  | "unchanged"
  | "cannot_move"
  | "too_many_entries"
  | "not_reviewable"
  | "interpretation_not_validated"
  | "incomplete_coverage"
  | "missing_reason"
  | "not_rejected"
  // Quedan referencias heredadas sin comprobar contra el documento sustituto.
  | "unchecked_references"
  | "not_historical"
  | "not_confirmed"
  | "already_checked";

export type ChangeResult =
  | { readonly ok: true; readonly revision: number }
  | {
      readonly ok: false;
      readonly reason: ChangeRejection;
      // Requisitos que bloquean la aprobación: sin cubrir o, tras un
      // documento sustituto, con la referencia sin comprobar.
      readonly pending: readonly Requirement[];
    };

interface Actor {
  readonly actorId: string;
  readonly correlationId: string;
}

interface Target extends Actor {
  readonly outlineId: string;
  // Revisión que el usuario tenía abierta.
  readonly revision: number;
}

export interface Outlines {
  // Estimación y coste máximo de pedir el índice de una interpretación, sin
  // enviar nada. `undefined` si no hay interpretación.
  estimate(interpretationId: string): CostEstimate | undefined;
  request(
    input: Actor & {
      readonly interpretationId: string;
      // Estimación y coste máximo que el usuario vio antes de pedirlo. Si se
      // indican y ya no son los actuales, no se envía nada (FR-021).
      readonly shown?: CostEstimate;
    },
  ): Promise<RequestResult>;
  get(id: string): Outline | undefined;
  getForInterpretation(interpretationId: string): Outline | undefined;
  review(id: string): OutlineReview | undefined;
  addEntry(input: Target & { readonly entry: EntryInput }): ChangeResult;
  // Renombra una entrada o cambia los requisitos en los que se apoya.
  editEntry(
    input: Target & { readonly entryId: string; readonly entry: EntryInput },
  ): ChangeResult;
  moveEntry(
    input: Target & {
      readonly entryId: string;
      readonly direction: "up" | "down";
    },
  ): ChangeResult;
  removeEntry(input: Target & { readonly entryId: string }): ChangeResult;
  approve(input: Target): ChangeResult;
  reject(input: Target & { readonly reason: string }): ChangeResult;
  // Devuelve a revisión un índice rechazado, sin cambiarlo.
  resubmit(input: Target): ChangeResult;
  // Tras un documento sustituto: registra que un docente ha comprobado contra
  // la nueva fuente la referencia de un requisito en el que se apoya el
  // índice. No cambia el índice ni su revisión.
  checkReference(
    input: Actor & {
      readonly outlineId: string;
      readonly requirementId: string;
      // Confirmación expresa de quien la comprueba.
      readonly confirmed: boolean;
    },
  ): ChangeResult;
}

export interface OutlinesOptions {
  readonly db: Database;
  readonly audit: Audit;
  readonly interpretations: StructuredInterpretation;
  readonly generation: Generation;
  // Prompt versionado: un fichero del repositorio.
  readonly prompt: { readonly version: string; readonly instructions: string };
  readonly now: () => number;
}

export const MAX_ENTRIES = 200;
export const MAX_TITLE_LENGTH = 200;
const MAX_OUTPUT_TOKENS = 8000;
const ID = /^[0-9a-f]{32}$/;
const REF = /^r[1-9][0-9]{0,3}$/;

const TITLE = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(MAX_TITLE_LENGTH)
      .regex(/^[^\p{Cc}]*$/u),
  );

const ENTRY_INPUT = z.object({
  title: TITLE,
  requirementIds: z.array(z.string().regex(ID)).max(500),
});

// Esquema versionado de la salida de la tarea `outline`. `coverageComplete`
// es lo que una propuesta puede afirmar sobre la cobertura: se admite en el
// formato para dejar constancia de que se ignora, y no se guarda ni se usa.
export const OUTLINE_OUTPUT_VERSION = "v1";
export const OUTLINE_OUTPUT = z.object({
  entries: z
    .array(
      z.object({
        title: TITLE,
        unsupported: z.boolean(),
        requirementRefs: z.array(z.string().regex(REF)).max(500),
      }),
    )
    .min(1)
    .max(MAX_ENTRIES),
  coverageComplete: z.boolean().optional(),
});
export type OutlineOutput = z.infer<typeof OUTLINE_OUTPUT>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

function failure(
  reason: ChangeRejection,
  pending: readonly Requirement[] = [],
): ChangeResult {
  return { ok: false, reason, pending };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((item) => right.includes(item))
  );
}

const STATUSES: readonly OutlineStatus[] = [
  "proposed",
  "in_review",
  "approved",
  "rejected",
];

export function createOutlines({
  db,
  audit,
  interpretations,
  generation,
  prompt,
  now,
}: OutlinesOptions): Outlines {
  const references = createReferences({ db, now });

  // Requisitos vigentes en los que se apoya el índice y cuya referencia
  // sigue sin comprobar tras un documento sustituto.
  const referencesPendingOf = (
    outline: Outline,
    inventory: readonly Requirement[],
  ): Requirement[] => {
    if (!interpretations.isHistorical(outline.interpretationId)) {
      return [];
    }
    const linked = new Set(
      outline.entries
        .filter((entry) => !entry.removed)
        .flatMap((entry) => entry.requirementIds),
    );
    const required = inventory.filter(
      (item) => !item.withdrawn && linked.has(item.id),
    );
    const pending = references.pending(
      "outline",
      outline.id,
      required.map((item) => item.id),
    );
    return required.filter((item) => pending.includes(item.id));
  };

  const entriesOf = (outlineId: string): OutlineEntry[] => {
    const links = new Map<string, string[]>();
    for (const row of db
      .prepare(
        "SELECT entry_requirement.* FROM entry_requirement " +
          "JOIN outline_entry ON outline_entry.id = outline_entry_id " +
          "WHERE outline_id = ? ORDER BY requirement_id",
      )
      .all(outlineId)) {
      const entryId = text(row.outline_entry_id);
      links.set(entryId, [
        ...(links.get(entryId) ?? []),
        text(row.requirement_id),
      ]);
    }
    return db
      .prepare(
        "SELECT * FROM outline_entry WHERE outline_id = ? " +
          "ORDER BY position, id",
      )
      .all(outlineId)
      .map((row) => ({
        id: text(row.id),
        position: integer(row.position),
        title: text(row.title),
        unsupported: integer(row.unsupported) === 1,
        removed: integer(row.removed) === 1,
        requirementIds: links.get(text(row.id)) ?? [],
      }));
  };

  const outlineOf = (row: Record<string, unknown>): Outline => ({
    id: text(row.id),
    interpretationId: text(row.interpretation_id),
    status: STATUSES.find((status) => status === row.status) ?? "in_review",
    revision: integer(row.revision),
    generationRunId: text(row.generation_run_id),
    createdBy: text(row.created_by),
    createdAt: integer(row.created_at),
    entries: entriesOf(text(row.id)),
  });

  const get = (id: string): Outline | undefined => {
    if (!ID.test(id)) {
      return undefined;
    }
    const row = db.prepare("SELECT * FROM outline WHERE id = ?").get(id);
    return row === undefined ? undefined : outlineOf(row);
  };

  const historyOf = (outline: Outline): OutlineHistory => {
    const validation = interpretations.currentValidation(
      outline.interpretationId,
    );
    // Con un documento sustituto, solo vale una aprobación posterior a él y
    // con todas las referencias comprobadas (FR-067).
    const since = interpretations.historicalSince(outline.interpretationId);
    const unchecked =
      since === null
        ? 0
        : referencesPendingOf(
            outline,
            interpretations.get(outline.interpretationId)?.requirements ?? [],
          ).length;
    return {
      changes: db
        .prepare(
          "SELECT * FROM outline_change WHERE outline_id = ? " +
            "ORDER BY resulting_revision",
        )
        .all(outline.id)
        .map((row) => ({
          id: text(row.id),
          entryId: text(row.entry_id),
          kind:
            row.kind === "add" || row.kind === "move" || row.kind === "remove"
              ? row.kind
              : "edit",
          author: text(row.author),
          at: integer(row.at),
          before: text(row.before),
          after: text(row.after),
          resultingRevision: integer(row.resulting_revision),
        })),
      approvals: db
        .prepare(
          "SELECT * FROM outline_approval WHERE outline_id = ? " +
            "ORDER BY approved_at, id",
        )
        .all(outline.id)
        .map((row) => ({
          id: text(row.id),
          revision: integer(row.outline_revision),
          interpretationValidationId: text(row.interpretation_validation_id),
          approvedBy: text(row.approved_by),
          approvedAt: integer(row.approved_at),
          current:
            outline.status === "approved" &&
            integer(row.outline_revision) === outline.revision &&
            validation !== undefined &&
            validation.id === row.interpretation_validation_id &&
            (since === null ||
              (integer(row.approved_at) >= since && unchecked === 0)),
        })),
      rejections: db
        .prepare(
          "SELECT * FROM rejection WHERE target_kind = 'outline' " +
            "AND target_id = ? ORDER BY rejected_at, id",
        )
        .all(outline.id)
        .map((row) => ({
          id: text(row.id),
          revision: integer(row.target_revision),
          rejectedBy: text(row.rejected_by),
          rejectedAt: integer(row.rejected_at),
          reason: text(row.reason),
        })),
    };
  };

  const reviewOf = (outline: Outline): OutlineReview | undefined => {
    const interpretation = interpretations.get(outline.interpretationId);
    if (interpretation === undefined) {
      return undefined;
    }
    const history = historyOf(outline);
    const historical = interpretations.isHistorical(interpretation.id);
    return {
      outline,
      interpretation,
      coverage: computeCoverage(interpretation.requirements, outline.entries),
      interpretationValid:
        !historical &&
        interpretations.currentValidation(interpretation.id) !== undefined,
      historical,
      referencesPending: referencesPendingOf(
        outline,
        interpretation.requirements,
      ),
      referenceChecks: references.list("outline", outline.id),
      approval: history.approvals.find((item) => item.current),
      history,
    };
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
      targetKind: "outline",
      targetId,
      result,
      correlationId: actor.correlationId,
      details,
    });
  };

  // Ejecuta un cambio sobre la revisión abierta, en una transacción. Si el
  // índice cambió desde que se abrió, no se guarda nada.
  const change = (
    input: Target,
    action: string,
    work: (review: OutlineReview) => ChangeResult,
    // Aprobar y comprobar referencias siguen disponibles con un sustituto.
    allowHistorical = false,
  ): ChangeResult =>
    transaction(db, () => {
      const outline = get(input.outlineId);
      const review = outline === undefined ? undefined : reviewOf(outline);
      let result: ChangeResult;
      if (review === undefined) {
        result = failure("not_found");
      } else if (review.historical && !allowHistorical) {
        // El documento tiene un sustituto: este índice es histórico.
        result = failure("superseded");
      } else if (review.outline.revision !== input.revision) {
        result = failure("conflict");
      } else {
        result = work(review);
      }
      record(
        input,
        action,
        review === undefined ? null : review.outline.id,
        result.ok ? "ok" : "failed",
        result.ok
          ? { revision: result.revision }
          : {
              reason: result.reason,
              revision: input.revision,
              pending: result.pending.length,
            },
      );
      return result;
    });

  const snapshot = (entry: OutlineEntry): unknown => ({
    title: entry.title,
    position: entry.position,
    unsupported: entry.unsupported,
    removed: entry.removed,
    requirementIds: entry.requirementIds,
  });

  // Cualquier cambio aumenta la revisión y devuelve el índice a revisión: la
  // aprobación anterior deja de estar vigente y permanece en el registro
  // (FR-059).
  const modify = (
    outline: Outline,
    actor: Actor,
    kind: OutlineChange["kind"],
    entryId: string,
    before: unknown,
    after: unknown,
  ): ChangeResult => {
    const revision = outline.revision + 1;
    db.prepare(
      "UPDATE outline SET revision = ?, status = 'in_review' WHERE id = ?",
    ).run(revision, outline.id);
    db.prepare(
      "INSERT INTO outline_change (id, outline_id, entry_id, kind, author, " +
        "at, before, after, resulting_revision) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      newId(),
      outline.id,
      entryId,
      kind,
      actor.actorId,
      now(),
      JSON.stringify(before),
      JSON.stringify(after),
      revision,
    );
    return { ok: true, revision };
  };

  // Valida una entrada enviada: título y vínculos, todos con requisitos
  // vigentes del inventario y sin repetir.
  const checkEntry = (
    review: OutlineReview,
    input: EntryInput,
  ):
    | { readonly ok: true; readonly data: z.infer<typeof ENTRY_INPUT> }
    | { readonly ok: false; readonly reason: ChangeRejection } => {
    const parsed = ENTRY_INPUT.safeParse(input);
    if (!parsed.success) {
      return { ok: false, reason: "invalid" };
    }
    const { requirementIds } = parsed.data;
    const active = review.interpretation.requirements.filter(
      (item) => !item.withdrawn,
    );
    if (
      new Set(requirementIds).size !== requirementIds.length ||
      requirementIds.some((id) => !active.some((item) => item.id === id))
    ) {
      return { ok: false, reason: "unknown_requirement" };
    }
    return { ok: true, data: parsed.data };
  };

  const insertEntry = (
    outlineId: string,
    position: number,
    title: string,
    requirementIds: readonly string[],
  ): string => {
    const id = newId();
    db.prepare(
      "INSERT INTO outline_entry (id, outline_id, position, title, " +
        "unsupported, removed) VALUES (?, ?, ?, ?, ?, 0)",
    ).run(id, outlineId, position, title, requirementIds.length === 0 ? 1 : 0);
    const link = db.prepare(
      "INSERT INTO entry_requirement (outline_entry_id, requirement_id) " +
        "VALUES (?, ?)",
    );
    for (const requirementId of requirementIds) {
      link.run(id, requirementId);
    }
    return id;
  };

  // Entrada de la generación: la unidad y el inventario vigente, como dato,
  // con identificadores locales y estables. Ningún dato de usuarios.
  const proposalInput = (
    interpretation: Interpretation,
  ): { readonly input: unknown; readonly ids: ReadonlyMap<string, string> } => {
    const active = interpretation.requirements.filter(
      (item) => !item.withdrawn,
    );
    const refs = new Map(
      active.map((item, index) => [item.id, `r${String(index + 1)}`]),
    );
    return {
      input: {
        unitCode: interpretation.unitCode,
        unitTitle: interpretation.unitTitle,
        requirements: active.map((item) => ({
          ref: refs.get(item.id) ?? "",
          parentRef:
            item.parentId === null ? null : (refs.get(item.parentId) ?? null),
          kind: item.kind,
          code: item.code,
          text: item.text,
        })),
      },
      ids: new Map([...refs].map(([id, ref]) => [ref, id])),
    };
  };

  const providerRequest = (input: unknown) => ({
    task: "outline" as const,
    promptVersion: prompt.version,
    instructions: prompt.instructions,
    input,
    outputSchema: OUTLINE_OUTPUT,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  return {
    estimate(interpretationId) {
      const interpretation = interpretations.get(interpretationId);
      return interpretation === undefined
        ? undefined
        : generation.estimate(
            providerRequest(proposalInput(interpretation).input),
          );
    },

    async request({ interpretationId, shown, actorId, correlationId }) {
      const actor = { actorId, correlationId };
      const refuse = (reason: RequestRejection): RequestResult => {
        record(actor, "outline.request", null, "failed", { reason });
        return { ok: false, reason };
      };
      const interpretation = interpretations.get(interpretationId);
      if (interpretation === undefined) {
        return refuse("interpretation_not_found");
      }
      if (interpretations.isHistorical(interpretationId)) {
        return refuse("superseded");
      }
      // Solo a partir de una interpretación validada y vigente (FR-009).
      const validation = interpretations.currentValidation(interpretationId);
      if (validation === undefined) {
        return refuse("not_validated");
      }
      const exists = (): boolean =>
        db
          .prepare("SELECT id FROM outline WHERE interpretation_id = ?")
          .get(interpretationId) !== undefined;
      if (exists()) {
        return refuse("already_exists");
      }
      // Por qué la petición ya no procede, si algo cambió desde que se
      // comprobó: `undefined` mientras sigue procediendo.
      const lapsed = (): RequestRejection | undefined =>
        interpretations.isHistorical(interpretationId)
          ? "superseded"
          : interpretations.currentValidation(interpretationId)?.id !==
              validation.id
            ? "not_validated"
            : exists()
              ? "already_exists"
              : undefined;

      const { input, ids } = proposalInput(interpretation);
      const current = generation.estimate(providerRequest(input));
      if (
        shown !== undefined &&
        (shown.estimatedCost !== current.estimatedCost ||
          shown.maxCost !== current.maxCost)
      ) {
        return refuse("estimate_changed");
      }
      const runId = generation.startRun({
        kind: "outline",
        targetId: interpretationId,
        requestedBy: actorId,
      });
      const result = await generation.call(runId, {
        ...providerRequest(input),
        outputSchema: OUTLINE_OUTPUT,
        // De nuevo justo antes de enviar, tras la comprobación previa del
        // proveedor.
        authorized: () => lapsed() === undefined,
        // Cada entrada se apoya en requisitos que existen, sin repetir, o va
        // marcada sin respaldo y entonces no declara ninguno.
        accept: (output) =>
          output.entries.every(
            (entry) =>
              entry.unsupported === (entry.requirementRefs.length === 0) &&
              new Set(entry.requirementRefs).size ===
                entry.requirementRefs.length &&
              entry.requirementRefs.every((ref) => ids.has(ref)),
          ),
      });
      if (result.status === "withdrawn") {
        // No se envió nada y la reserva está liberada.
        generation.finishRun(runId, "incomplete");
        return refuse(lapsed() ?? "not_validated");
      }
      if (result.status !== "ok") {
        generation.finishRun(
          runId,
          result.status === "budget_exceeded" ? "incomplete" : "failed",
        );
        return refuse(result.status);
      }

      const { entries } = result.output;
      return transaction(db, (): RequestResult => {
        // La interpretación pudo cambiar, o el índice crearse, mientras se
        // esperaba la respuesta: entonces la propuesta no se guarda.
        const still = interpretations.currentValidation(interpretationId);
        if (still?.id !== validation.id) {
          generation.finishRun(runId, "failed");
          return refuse("not_validated");
        }
        if (exists()) {
          generation.finishRun(runId, "failed");
          return refuse("already_exists");
        }
        const id = newId();
        db.prepare(
          "INSERT INTO outline (id, interpretation_id, status, revision, " +
            "generation_run_id, created_by, created_at) " +
            "VALUES (?, ?, 'proposed', 1, ?, ?, ?)",
        ).run(id, interpretationId, runId, actorId, now());
        entries.forEach((entry, position) => {
          insertEntry(
            id,
            position,
            entry.title,
            entry.requirementRefs.map((ref) => ids.get(ref) ?? ""),
          );
        });
        generation.finishRun(runId, "succeeded");
        record(actor, "outline.request", id, "ok", {
          entries: entries.length,
          provider: generation.provider,
        });
        return { ok: true, outlineId: id };
      });
    },

    get,

    getForInterpretation(interpretationId) {
      if (!ID.test(interpretationId)) {
        return undefined;
      }
      const row = db
        .prepare("SELECT * FROM outline WHERE interpretation_id = ?")
        .get(interpretationId);
      return row === undefined ? undefined : outlineOf(row);
    },

    review(id) {
      const outline = get(id);
      return outline === undefined ? undefined : reviewOf(outline);
    },

    addEntry(input) {
      return change(input, "outline.edit", (review) => {
        const { outline } = review;
        if (
          outline.entries.filter((entry) => !entry.removed).length >=
          MAX_ENTRIES
        ) {
          return failure("too_many_entries");
        }
        const checked = checkEntry(review, input.entry);
        if (!checked.ok) {
          return failure(checked.reason);
        }
        const { title, requirementIds } = checked.data;
        const position =
          outline.entries.reduce(
            (highest, entry) => Math.max(highest, entry.position),
            -1,
          ) + 1;
        const id = insertEntry(outline.id, position, title, requirementIds);
        return modify(outline, input, "add", id, null, {
          title,
          position,
          unsupported: requirementIds.length === 0,
          removed: false,
          requirementIds,
        });
      });
    },

    editEntry(input) {
      return change(input, "outline.edit", (review) => {
        const { outline } = review;
        const existing = outline.entries.find(
          (entry) => entry.id === input.entryId,
        );
        if (existing === undefined) {
          return failure("not_found");
        }
        if (existing.removed) {
          return failure("removed");
        }
        const checked = checkEntry(review, input.entry);
        if (!checked.ok) {
          return failure(checked.reason);
        }
        const { title, requirementIds } = checked.data;
        if (
          title === existing.title &&
          sameSet(requirementIds, existing.requirementIds)
        ) {
          return failure("unchanged");
        }
        const unsupported = requirementIds.length === 0;
        // Los vínculos se sustituyen; el cambio conserva los anteriores.
        db.prepare(
          "DELETE FROM entry_requirement WHERE outline_entry_id = ?",
        ).run(existing.id);
        db.prepare(
          "UPDATE outline_entry SET title = ?, unsupported = ? WHERE id = ?",
        ).run(title, unsupported ? 1 : 0, existing.id);
        const link = db.prepare(
          "INSERT INTO entry_requirement (outline_entry_id, requirement_id) " +
            "VALUES (?, ?)",
        );
        for (const requirementId of requirementIds) {
          link.run(existing.id, requirementId);
        }
        return modify(outline, input, "edit", existing.id, snapshot(existing), {
          ...(snapshot(existing) as object),
          title,
          unsupported,
          requirementIds,
        });
      });
    },

    moveEntry(input) {
      return change(input, "outline.edit", (review) => {
        const { outline } = review;
        const live = outline.entries.filter((entry) => !entry.removed);
        const index = live.findIndex((entry) => entry.id === input.entryId);
        const existing = live[index];
        if (existing === undefined) {
          return failure(
            outline.entries.some((entry) => entry.id === input.entryId)
              ? "removed"
              : "not_found",
          );
        }
        const other = live[index + (input.direction === "up" ? -1 : 1)];
        if (other === undefined) {
          return failure("cannot_move");
        }
        const move = db.prepare(
          "UPDATE outline_entry SET position = ? WHERE id = ?",
        );
        move.run(other.position, existing.id);
        move.run(existing.position, other.id);
        return modify(outline, input, "move", existing.id, snapshot(existing), {
          ...(snapshot(existing) as object),
          position: other.position,
        });
      });
    },

    removeEntry(input) {
      return change(input, "outline.edit", (review) => {
        const { outline } = review;
        const existing = outline.entries.find(
          (entry) => entry.id === input.entryId,
        );
        if (existing === undefined) {
          return failure("not_found");
        }
        if (existing.removed) {
          return failure("removed");
        }
        // La entrada no se borra: queda marcada, con su título y sus
        // vínculos, y deja de contar para la cobertura.
        db.prepare("UPDATE outline_entry SET removed = 1 WHERE id = ?").run(
          existing.id,
        );
        return modify(
          outline,
          input,
          "remove",
          existing.id,
          snapshot(existing),
          { ...(snapshot(existing) as object), removed: true },
        );
      });
    },

    approve(input) {
      return change(
        input,
        "outline.approve",
        (review) => {
          const { outline } = review;
          // Un índice aprobado cuya aprobación perdió la vigencia puede
          // volver a aprobarse; uno con aprobación vigente o rechazado, no.
          if (
            outline.status === "rejected" ||
            (outline.status === "approved" && review.approval !== undefined)
          ) {
            return failure("not_reviewable");
          }
          const validation = interpretations.currentValidation(
            outline.interpretationId,
          );
          if (validation === undefined) {
            return failure("interpretation_not_validated");
          }
          // Tras un documento sustituto, ninguna referencia sin comprobar.
          if (review.referencesPending.length > 0) {
            return failure("unchecked_references", review.referencesPending);
          }
          // Sin excepciones: con algún requisito sin cubrir no se aprueba.
          if (!review.coverage.complete) {
            return failure("incomplete_coverage", review.coverage.pending);
          }
          db.prepare("UPDATE outline SET status = 'approved' WHERE id = ?").run(
            outline.id,
          );
          db.prepare(
            "INSERT INTO outline_approval (id, outline_id, outline_revision, " +
              "interpretation_validation_id, approved_by, approved_at) " +
              "VALUES (?, ?, ?, ?, ?, ?)",
          ).run(
            newId(),
            outline.id,
            outline.revision,
            validation.id,
            input.actorId,
            now(),
          );
          return { ok: true, revision: outline.revision };
        },
        true,
      );
    },

    reject(input) {
      return change(input, "outline.reject", ({ outline }) => {
        if (outline.status === "rejected") {
          return failure("not_reviewable");
        }
        const reason = input.reason.trim();
        if (reason === "" || reason.length > 1000) {
          return failure("missing_reason");
        }
        // Rechazar conserva el contenido y no inicia ninguna generación.
        db.prepare("UPDATE outline SET status = 'rejected' WHERE id = ?").run(
          outline.id,
        );
        db.prepare(
          "INSERT INTO rejection (id, target_kind, target_id, " +
            "target_revision, rejected_by, rejected_at, reason) " +
            "VALUES (?, 'outline', ?, ?, ?, ?, ?)",
        ).run(
          newId(),
          outline.id,
          outline.revision,
          input.actorId,
          now(),
          reason,
        );
        return { ok: true, revision: outline.revision };
      });
    },

    resubmit(input) {
      return change(input, "outline.resubmit", ({ outline }) => {
        if (outline.status !== "rejected") {
          return failure("not_rejected");
        }
        db.prepare("UPDATE outline SET status = 'in_review' WHERE id = ?").run(
          outline.id,
        );
        return { ok: true, revision: outline.revision };
      });
    },

    checkReference({ outlineId, requirementId, confirmed, ...actor }) {
      return transaction(db, () => {
        const outline = get(outlineId);
        const review = outline === undefined ? undefined : reviewOf(outline);
        let result: ChangeResult;
        if (review === undefined) {
          result = failure("not_found");
        } else if (!review.historical) {
          result = failure("not_historical");
        } else if (!confirmed) {
          result = failure("not_confirmed");
        } else if (
          !review.referencesPending.some((item) => item.id === requirementId)
        ) {
          result = failure("already_checked");
        } else {
          references.record({
            kind: "outline",
            targetId: outlineId,
            requirementId,
            actorId: actor.actorId,
          });
          result = { ok: true, revision: review.outline.revision };
        }
        record(
          actor,
          "outline.reference_check",
          review === undefined ? null : outlineId,
          result.ok ? "ok" : "failed",
          result.ok
            ? { requirement: requirementId }
            : { reason: result.reason },
        );
        return result;
      });
    },
  };
}

// --- Composición ---

export const OUTLINE_PROMPT_VERSION = "v1";

const opened = new WeakMap<InterpretationServices, Outlines>();

// Los índices de estos servicios: uno por proceso. El prompt es el fichero
// versionado del repositorio.
export function openOutlines(services: InterpretationServices): Outlines {
  let outlines = opened.get(services);
  if (outlines === undefined) {
    outlines = createOutlines({
      db: services.db,
      audit: services.audit,
      interpretations: openStructuredInterpretation(services),
      generation: services.generation,
      prompt: {
        version: OUTLINE_PROMPT_VERSION,
        instructions: readFileSync(
          `${services.projectRoot}/prompts/outline/${OUTLINE_PROMPT_VERSION}.md`,
          "utf8",
        ),
      },
      now: () => Date.now(),
    });
    opened.set(services, outlines);
  }
  return outlines;
}

export const TOPIC_PROMPT_VERSION = "v1";

const openedSyllabus = new WeakMap<InterpretationServices, Syllabus>();

// El temario de estos servicios: uno por proceso.
export function openSyllabus(services: InterpretationServices): Syllabus {
  let syllabus = openedSyllabus.get(services);
  if (syllabus === undefined) {
    syllabus = createSyllabus({
      db: services.db,
      audit: services.audit,
      interpretations: openStructuredInterpretation(services),
      outlines: openOutlines(services),
      generation: services.generation,
      prompt: {
        version: TOPIC_PROMPT_VERSION,
        instructions: readFileSync(
          `${services.projectRoot}/prompts/topic/${TOPIC_PROMPT_VERSION}.md`,
          "utf8",
        ),
      },
      now: () => Date.now(),
    });
    openedSyllabus.set(services, syllabus);
  }
  return syllabus;
}
