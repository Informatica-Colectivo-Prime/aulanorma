// Temario (specs/002-boe-scorm-export: FR-016 a FR-024, FR-060, FR-063,
// FR-066, FR-067 y FR-070; data-model.md, «Contenido didáctico»).
//
// El temario se desarrolla tema a tema, uno por entrada del índice, y solo a
// partir de un índice aprobado y vigente. Cada tema separa los bloques de
// requisito, que citan la norma, de los bloques de desarrollo didáctico, que
// declaran qué requisitos trabajan.
//
// Generación: cada tema es una operación con su propia reserva de
// presupuesto. Un tema terminado queda como borrador; uno cuya operación
// termina con error, o cuya propuesta no supera el esquema o las
// comprobaciones, queda como fallido y su resultado no se guarda. No hay
// reintentos automáticos: otro intento es la misma acción explícita, que solo
// procesa los temas pendientes o fallidos. Una operación de resultado
// incierto no se reenvía hasta que se concilie.
//
// Revisión: cada cambio aumenta la revisión del tema y lo devuelve a
// revisión; nada se borra. Aprobar un tema y aprobar la versión son siempre
// acciones humanas explícitas. La vigencia se deriva: la aprobación de un
// tema vale mientras su revisión es la actual y la aprobación del índice en
// la que se apoyó sigue vigente; la de una versión, mientras lo estén todas
// las suyas.
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type {
  Requirement,
  StructuredInterpretation,
} from "@/modules/structured-interpretation";
import type { Audit } from "@/platform/audit";
import type { Generation } from "@/platform/generation";
import { transaction } from "@/platform/persistence";
import type { Database } from "@/platform/persistence";
import type {
  OutlineEntry,
  OutlineRejection,
  OutlineReview,
  Outlines,
} from "./index";
import { createReferences } from "./references";
import type { ReferenceCheck } from "./references";
import { CONTENT, textToContent } from "./render/index";
import type { ContentNode } from "./render/index";

export type TopicStatus =
  "pending" | "failed" | "draft" | "in_review" | "approved" | "rejected";
export type TopicFailure =
  "provider_error" | "invalid_output" | "rejected_by_domain" | "uncertain";

export interface TopicBlock {
  readonly id: string;
  readonly position: number;
  readonly kind: "requirement" | "development";
  readonly removed: boolean;
  // Un bloque de requisito cita uno; uno de desarrollo desarrolla varios, o
  // ninguno si no tiene respaldo normativo.
  readonly requirementIds: readonly string[];
  // Contenido de un bloque de desarrollo. Vacío en uno de requisito.
  readonly content: readonly ContentNode[];
}

export interface Topic {
  readonly id: string;
  readonly entryId: string;
  readonly status: TopicStatus;
  readonly revision: number;
  // Motivo, si el tema es fallido.
  readonly failure: TopicFailure | null;
  readonly lastCallId: string | null;
  // En su orden. Incluye los quitados, marcados.
  readonly blocks: readonly TopicBlock[];
}

export interface TopicChange {
  readonly id: string;
  readonly kind: "generate" | "add" | "edit" | "move" | "remove";
  readonly author: string;
  readonly at: number;
  readonly before: string;
  readonly after: string;
  readonly resultingRevision: number;
}

export interface TopicApproval {
  readonly id: string;
  readonly revision: number;
  readonly outlineApprovalId: string;
  readonly approvedBy: string;
  readonly approvedAt: number;
  readonly current: boolean;
}

export interface TopicHistory {
  readonly changes: readonly TopicChange[];
  readonly approvals: readonly TopicApproval[];
  readonly rejections: readonly OutlineRejection[];
}

export interface TopicReview {
  readonly topic: Topic;
  readonly entry: OutlineEntry;
  readonly outline: OutlineReview;
  // Requisitos vigentes en los que se apoya la entrada, en el orden del
  // inventario: los únicos que el tema puede citar o desarrollar.
  readonly requirements: readonly Requirement[];
  // La aprobación vigente del tema, si la hay.
  readonly approval: TopicApproval | undefined;
  // `true` si su última operación quedó incierta y sigue sin conciliar.
  readonly awaitingReconciliation: boolean;
  // Con un documento sustituto: referencias del tema sin comprobar.
  readonly referencesPending: readonly Requirement[];
  readonly referenceChecks: readonly ReferenceCheck[];
  readonly history: TopicHistory;
}

// Desarrollo de un requisito en el temario (FR-060): la cita lo identifica;
// por sí sola no acredita que esté desarrollado.
export interface DevelopmentItem {
  readonly requirement: Requirement;
  // Entradas cuyo tema lo cita en un bloque de requisito.
  readonly citedIn: readonly OutlineEntry[];
  // Entradas cuyo tema lo desarrolla en un bloque de desarrollo.
  readonly developedIn: readonly OutlineEntry[];
}

export interface Development {
  readonly items: readonly DevelopmentItem[];
  // Requisitos sin cita o sin desarrollo.
  readonly pending: readonly DevelopmentItem[];
  readonly complete: boolean;
}

export interface SyllabusTopic {
  readonly entry: OutlineEntry;
  // `undefined` si todavía no se ha pedido su generación.
  readonly topic: Topic | undefined;
  // `true` si tiene una aprobación vigente.
  readonly approved: boolean;
  readonly awaitingReconciliation: boolean;
}

export interface SyllabusVersion {
  readonly id: string;
  readonly label: string;
  readonly contentSha256: string;
  readonly approvedBy: string;
  readonly approvedAt: number;
  // Vigente mientras lo estén la aprobación del índice y las de sus temas.
  readonly current: boolean;
}

// Lo que impide aprobar la versión.
export interface VersionBlockers {
  readonly outlineNotApproved: boolean;
  // Entradas sin tema desarrollado: pendientes o fallidas.
  readonly undeveloped: readonly OutlineEntry[];
  // Entradas cuyo tema no tiene una aprobación vigente.
  readonly unapproved: readonly OutlineEntry[];
  // Requisitos sin cita o sin desarrollo.
  readonly development: readonly DevelopmentItem[];
}

export interface SyllabusReview {
  readonly outline: OutlineReview;
  // Un elemento por entrada vigente del índice, en su orden.
  readonly topics: readonly SyllabusTopic[];
  readonly development: Development;
  // Temas que procesaría ahora una generación: pendientes o fallidos, sin los
  // que esperan una conciliación.
  readonly toGenerate: readonly OutlineEntry[];
  // Estimación y coste máximo de procesarlos, sumados.
  readonly cost: { readonly estimatedCost: number; readonly maxCost: number };
  // `true` si se ha pedido la generación y quedan temas sin desarrollar.
  readonly incomplete: boolean;
  readonly blockers: VersionBlockers;
  readonly versions: readonly SyllabusVersion[];
  // Estado que se confirma al aprobar la versión: cambia con cualquier
  // modificación del índice o de un tema.
  readonly fingerprint: string;
}

export type GenerateRejection =
  | "not_found"
  | "superseded"
  | "outline_not_approved"
  | "nothing_to_generate"
  // Las cifras que el usuario vio ya no son las actuales.
  | "estimate_changed";

export type GenerateResult =
  | {
      readonly ok: true;
      // Temas terminados como borrador en esta ejecución.
      readonly generated: number;
      readonly failed: number;
      // Temas que no se enviaron por falta de presupuesto.
      readonly notSent: number;
      readonly incomplete: boolean;
    }
  | { readonly ok: false; readonly reason: GenerateRejection };

export type TopicRejection =
  | "not_found"
  | "superseded"
  | "conflict"
  | "invalid"
  | "unknown_requirement"
  | "already_cited"
  | "removed"
  | "unchanged"
  | "cannot_move"
  | "too_many_blocks"
  | "not_developed"
  | "not_reviewable"
  | "empty"
  | "outline_not_approved"
  | "unchecked_references"
  | "missing_reason"
  | "not_rejected"
  | "not_historical"
  | "not_confirmed"
  | "already_checked";

export type TopicResult =
  | { readonly ok: true; readonly revision: number }
  | {
      readonly ok: false;
      readonly reason: TopicRejection;
      // Referencias sin comprobar que bloquean la aprobación.
      readonly pending: readonly Requirement[];
    };

export type VersionResult =
  | { readonly ok: true; readonly versionId: string; readonly label: string }
  | {
      readonly ok: false;
      readonly reason: "not_found" | "conflict" | "blocked";
      readonly blockers: VersionBlockers | undefined;
    };

interface Actor {
  readonly actorId: string;
  readonly correlationId: string;
}

interface TopicTarget extends Actor {
  readonly topicId: string;
  // Revisión que el usuario tenía abierta.
  readonly revision: number;
}

export interface DevelopmentInput {
  // Texto editable del bloque (`contentToText`).
  readonly text: string;
  readonly requirementIds: readonly string[];
}

export interface Syllabus {
  review(outlineId: string): SyllabusReview | undefined;
  // Genera los temas pendientes o fallidos, uno a uno. Es la misma operación
  // para lanzar la generación, reanudarla y pedir otro intento.
  generate(
    input: Actor & {
      readonly outlineId: string;
      // Estimación y coste máximo que el usuario vio (FR-021).
      readonly shown?: {
        readonly estimatedCost: number;
        readonly maxCost: number;
      };
    },
  ): Promise<GenerateResult>;
  getTopic(id: string): Topic | undefined;
  reviewTopic(id: string): TopicReview | undefined;
  addDevelopmentBlock(
    input: TopicTarget & { readonly block: DevelopmentInput },
  ): TopicResult;
  addRequirementBlock(
    input: TopicTarget & { readonly requirementId: string },
  ): TopicResult;
  editBlock(
    input: TopicTarget & {
      readonly blockId: string;
      readonly block: DevelopmentInput;
    },
  ): TopicResult;
  moveBlock(
    input: TopicTarget & {
      readonly blockId: string;
      readonly direction: "up" | "down";
    },
  ): TopicResult;
  removeBlock(input: TopicTarget & { readonly blockId: string }): TopicResult;
  approveTopic(input: TopicTarget): TopicResult;
  rejectTopic(input: TopicTarget & { readonly reason: string }): TopicResult;
  resubmitTopic(input: TopicTarget): TopicResult;
  checkTopicReference(
    input: Actor & {
      readonly topicId: string;
      readonly requirementId: string;
      readonly confirmed: boolean;
    },
  ): TopicResult;
  approveVersion(
    input: Actor & {
      readonly outlineId: string;
      // Estado que el usuario tenía delante (`SyllabusReview.fingerprint`).
      readonly fingerprint: string;
    },
  ): VersionResult;
  // Instantánea guardada de una versión, como texto JSON.
  snapshotOf(versionId: string): string | undefined;
}

export interface SyllabusOptions {
  readonly db: Database;
  readonly audit: Audit;
  readonly interpretations: StructuredInterpretation;
  readonly outlines: Outlines;
  readonly generation: Generation;
  readonly prompt: { readonly version: string; readonly instructions: string };
  readonly now: () => number;
}

export const MAX_BLOCKS = 80;
const MAX_OUTPUT_TOKENS = 8000;
const ID = /^[0-9a-f]{32}$/;
const REF = /^r[1-9][0-9]{0,3}$/;

// Esquema versionado de la salida de la tarea `topic`.
export const TOPIC_OUTPUT_VERSION = "v1";
export const TOPIC_OUTPUT = z.object({
  blocks: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("requirement"),
          requirementRef: z.string().regex(REF),
        }),
        z.object({
          kind: z.literal("development"),
          requirementRefs: z.array(z.string().regex(REF)).max(100),
          content: CONTENT,
        }),
      ]),
    )
    .min(1)
    .max(MAX_BLOCKS),
});
export type TopicOutput = z.infer<typeof TOPIC_OUTPUT>;

const STATUSES: readonly TopicStatus[] = [
  "pending",
  "failed",
  "draft",
  "in_review",
  "approved",
  "rejected",
];
const FAILURES: readonly TopicFailure[] = [
  "provider_error",
  "invalid_output",
  "rejected_by_domain",
  "uncertain",
];

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
  reason: TopicRejection,
  pending: readonly Requirement[] = [],
): TopicResult {
  return { ok: false, reason, pending };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((item) => right.includes(item))
  );
}

// `true` si el tema tiene contenido: no está pendiente ni es fallido.
function developed(topic: Topic | undefined): boolean {
  return (
    topic !== undefined &&
    topic.status !== "pending" &&
    topic.status !== "failed"
  );
}

// Desarrollo de cada requisito del inventario vigente en los temas con
// contenido. Sin herencia: cada requisito necesita su propia cita y su
// propio desarrollo.
export function computeDevelopment(
  inventory: readonly Requirement[],
  topics: readonly {
    readonly entry: OutlineEntry;
    readonly topic: Topic | undefined;
  }[],
): Development {
  const withContent = topics.filter((item) => developed(item.topic));
  const entriesWith = (
    requirementId: string,
    kind: TopicBlock["kind"],
  ): OutlineEntry[] =>
    withContent
      .filter((item) =>
        item.topic?.blocks.some(
          (block) =>
            !block.removed &&
            block.kind === kind &&
            block.requirementIds.includes(requirementId),
        ),
      )
      .map((item) => item.entry);
  const items = inventory
    .filter((requirement) => !requirement.withdrawn)
    .map((requirement) => ({
      requirement,
      citedIn: entriesWith(requirement.id, "requirement"),
      developedIn: entriesWith(requirement.id, "development"),
    }));
  const pending = items.filter(
    (item) => item.citedIn.length === 0 || item.developedIn.length === 0,
  );
  return { items, pending, complete: items.length > 0 && pending.length === 0 };
}

export function createSyllabus({
  db,
  audit,
  interpretations,
  outlines,
  generation,
  prompt,
  now,
}: SyllabusOptions): Syllabus {
  const references = createReferences({ db, now });

  const blocksOf = (topicId: string): TopicBlock[] => {
    const links = new Map<string, string[]>();
    for (const row of db
      .prepare(
        "SELECT block_requirement.* FROM block_requirement " +
          "JOIN topic_block ON topic_block.id = topic_block_id " +
          "WHERE topic_id = ? ORDER BY requirement_id",
      )
      .all(topicId)) {
      const blockId = text(row.topic_block_id);
      links.set(blockId, [
        ...(links.get(blockId) ?? []),
        text(row.requirement_id),
      ]);
    }
    return db
      .prepare(
        "SELECT * FROM topic_block WHERE topic_id = ? ORDER BY position, id",
      )
      .all(topicId)
      .map((row) => {
        const parsed = CONTENT.safeParse(JSON.parse(text(row.body)));
        return {
          id: text(row.id),
          position: integer(row.position),
          kind: row.kind === "requirement" ? "requirement" : "development",
          removed: integer(row.removed) === 1,
          requirementIds: links.get(text(row.id)) ?? [],
          content: parsed.success ? parsed.data : [],
        };
      });
  };

  const topicOf = (row: Record<string, unknown>): Topic => ({
    id: text(row.id),
    entryId: text(row.outline_entry_id),
    status: STATUSES.find((status) => status === row.status) ?? "pending",
    revision: integer(row.revision),
    failure: FAILURES.find((item) => item === row.failure) ?? null,
    lastCallId: typeof row.last_call_id === "string" ? row.last_call_id : null,
    blocks: blocksOf(text(row.id)),
  });

  const getTopic = (id: string): Topic | undefined => {
    if (!ID.test(id)) {
      return undefined;
    }
    const row = db.prepare("SELECT * FROM topic WHERE id = ?").get(id);
    return row === undefined ? undefined : topicOf(row);
  };

  const topicOfEntry = (entryId: string): Topic | undefined => {
    const row = db
      .prepare("SELECT * FROM topic WHERE outline_entry_id = ?")
      .get(entryId);
    return row === undefined ? undefined : topicOf(row);
  };

  // `true` si la última operación del tema quedó incierta y nadie la ha
  // conciliado: no se reenvía (FR-066).
  const awaiting = (topic: Topic | undefined): boolean =>
    topic?.failure === "uncertain" &&
    topic.lastCallId !== null &&
    generation.budget
      .list("uncertain")
      .some((item) => item.callId === topic.lastCallId);

  const requirementsOfEntry = (
    review: OutlineReview,
    entry: OutlineEntry,
  ): Requirement[] =>
    review.interpretation.requirements.filter(
      (item) => !item.withdrawn && entry.requirementIds.includes(item.id),
    );

  // Requisitos vigentes que el tema cita o desarrolla y cuya referencia
  // sigue sin comprobar tras un documento sustituto.
  const topicReferencesPending = (
    review: OutlineReview,
    topic: Topic,
  ): Requirement[] => {
    if (!review.historical) {
      return [];
    }
    const used = new Set(
      topic.blocks
        .filter((block) => !block.removed)
        .flatMap((block) => block.requirementIds),
    );
    const required = review.interpretation.requirements.filter(
      (item) => !item.withdrawn && used.has(item.id),
    );
    const pending = references.pending(
      "topic",
      topic.id,
      required.map((item) => item.id),
    );
    return required.filter((item) => pending.includes(item.id));
  };

  const approvalsOf = (
    review: OutlineReview,
    topic: Topic,
  ): TopicApproval[] => {
    const since = interpretations.historicalSince(review.interpretation.id);
    const unchecked = topicReferencesPending(review, topic).length;
    return db
      .prepare(
        "SELECT * FROM topic_approval WHERE topic_id = ? " +
          "ORDER BY approved_at, id",
      )
      .all(topic.id)
      .map((row) => ({
        id: text(row.id),
        revision: integer(row.topic_revision),
        outlineApprovalId: text(row.outline_approval_id),
        approvedBy: text(row.approved_by),
        approvedAt: integer(row.approved_at),
        current:
          topic.status === "approved" &&
          integer(row.topic_revision) === topic.revision &&
          review.approval !== undefined &&
          review.approval.id === row.outline_approval_id &&
          (since === null ||
            (integer(row.approved_at) >= since && unchecked === 0)),
      }));
  };

  const topicReviewOf = (topic: Topic): TopicReview | undefined => {
    const row = db
      .prepare("SELECT outline_id FROM outline_entry WHERE id = ?")
      .get(topic.entryId);
    const review = outlines.review(text(row?.outline_id));
    const entry = review?.outline.entries.find(
      (item) => item.id === topic.entryId,
    );
    if (review === undefined || entry === undefined) {
      return undefined;
    }
    const approvals = approvalsOf(review, topic);
    return {
      topic,
      entry,
      outline: review,
      requirements: requirementsOfEntry(review, entry),
      approval: approvals.find((item) => item.current),
      awaitingReconciliation: awaiting(topic),
      referencesPending: topicReferencesPending(review, topic),
      referenceChecks: references.list("topic", topic.id),
      history: {
        changes: db
          .prepare(
            "SELECT * FROM topic_change WHERE topic_id = ? " +
              "ORDER BY resulting_revision",
          )
          .all(topic.id)
          .map((item) => ({
            id: text(item.id),
            kind:
              item.kind === "generate" ||
              item.kind === "add" ||
              item.kind === "move" ||
              item.kind === "remove"
                ? item.kind
                : "edit",
            author: text(item.author),
            at: integer(item.at),
            before: text(item.before),
            after: text(item.after),
            resultingRevision: integer(item.resulting_revision),
          })),
        approvals,
        rejections: db
          .prepare(
            "SELECT * FROM rejection WHERE target_kind = 'topic' " +
              "AND target_id = ? ORDER BY rejected_at, id",
          )
          .all(topic.id)
          .map((item) => ({
            id: text(item.id),
            revision: integer(item.target_revision),
            rejectedBy: text(item.rejected_by),
            rejectedAt: integer(item.rejected_at),
            reason: text(item.reason),
          })),
      },
    };
  };

  // Entrada de la generación de un tema: la unidad, el título de la entrada
  // y sus requisitos, como dato, con identificadores locales. Ningún dato de
  // usuarios.
  const topicRequest = (review: OutlineReview, entry: OutlineEntry) => {
    const requirements = requirementsOfEntry(review, entry);
    const refs = new Map(
      requirements.map((item, index) => [`r${String(index + 1)}`, item.id]),
    );
    return {
      refs,
      request: {
        task: "topic" as const,
        promptVersion: prompt.version,
        instructions: prompt.instructions,
        input: {
          unitCode: review.interpretation.unitCode,
          unitTitle: review.interpretation.unitTitle,
          entryTitle: entry.title,
          requirements: requirements.map((item, index) => ({
            ref: `r${String(index + 1)}`,
            kind: item.kind,
            code: item.code,
            text: item.text,
          })),
        },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    };
  };

  const liveEntries = (review: OutlineReview): OutlineEntry[] =>
    review.outline.entries.filter((entry) => !entry.removed);

  const syllabusReviewOf = (review: OutlineReview): SyllabusReview => {
    const topics = liveEntries(review).map((entry) => {
      const topic = topicOfEntry(entry.id);
      return {
        entry,
        topic,
        approved:
          topic !== undefined &&
          approvalsOf(review, topic).some((item) => item.current),
        awaitingReconciliation: awaiting(topic),
      };
    });
    const development = computeDevelopment(
      review.interpretation.requirements,
      topics,
    );
    const toGenerate = topics
      .filter((item) => !developed(item.topic) && !item.awaitingReconciliation)
      .map((item) => item.entry);
    const cost = toGenerate.reduce(
      (total, entry) => {
        const estimate = generation.estimate(
          topicRequest(review, entry).request,
        );
        return {
          estimatedCost: total.estimatedCost + estimate.estimatedCost,
          maxCost: total.maxCost + estimate.maxCost,
        };
      },
      { estimatedCost: 0, maxCost: 0 },
    );
    const versionRows = db
      .prepare(
        "SELECT * FROM syllabus_version WHERE outline_id = ? " +
          "ORDER BY approved_at, id",
      )
      .all(review.outline.id);
    const currentApprovals = new Set(
      topics.flatMap((item) =>
        item.topic === undefined
          ? []
          : approvalsOf(review, item.topic)
              .filter((approval) => approval.current)
              .map((approval) => approval.id),
      ),
    );
    return {
      outline: review,
      topics,
      development,
      toGenerate,
      cost,
      incomplete:
        topics.some((item) => item.topic !== undefined) &&
        topics.some((item) => !developed(item.topic)),
      blockers: {
        outlineNotApproved: review.approval === undefined,
        undeveloped: topics
          .filter((item) => !developed(item.topic))
          .map((item) => item.entry),
        unapproved: topics
          .filter((item) => developed(item.topic) && !item.approved)
          .map((item) => item.entry),
        development: development.pending,
      },
      versions: versionRows.map((row) => {
        const approvals = db
          .prepare(
            "SELECT topic_approval_id FROM syllabus_version_topic " +
              "WHERE syllabus_version_id = ?",
          )
          .all(text(row.id))
          .map((item) => text(item.topic_approval_id));
        return {
          id: text(row.id),
          label: text(row.label),
          contentSha256: text(row.content_sha256),
          approvedBy: text(row.approved_by),
          approvedAt: integer(row.approved_at),
          current:
            review.approval !== undefined &&
            review.approval.id === row.outline_approval_id &&
            approvals.length === topics.length &&
            approvals.every((id) => currentApprovals.has(id)),
        };
      }),
      fingerprint: createHash("sha256")
        .update(
          JSON.stringify([
            review.outline.revision,
            review.approval?.id ?? null,
            topics.map((item) => [
              item.entry.id,
              item.topic?.revision ?? 0,
              item.topic?.status ?? "none",
              item.approved,
            ]),
          ]),
        )
        .digest("hex")
        .slice(0, 32),
    };
  };

  const blocked = (blockers: VersionBlockers): boolean =>
    blockers.outlineNotApproved ||
    blockers.undeveloped.length > 0 ||
    blockers.unapproved.length > 0 ||
    blockers.development.length > 0;

  const record = (
    actor: Actor,
    action: string,
    targetKind: "topic" | "syllabus",
    targetId: string | null,
    result: "ok" | "failed",
    details: Readonly<Record<string, string | number | boolean>>,
  ): void => {
    audit.record({
      actorId: actor.actorId,
      action,
      targetKind,
      targetId,
      result,
      correlationId: actor.correlationId,
      details,
    });
  };

  // Ejecuta un cambio sobre la revisión abierta del tema, en una
  // transacción. Si el tema cambió desde que se abrió, no se guarda nada.
  const change = (
    input: TopicTarget,
    action: string,
    work: (review: TopicReview) => TopicResult,
    // Aprobar sigue disponible con un documento sustituto.
    allowHistorical = false,
  ): TopicResult =>
    transaction(db, () => {
      const topic = getTopic(input.topicId);
      const review = topic === undefined ? undefined : topicReviewOf(topic);
      let result: TopicResult;
      if (review === undefined) {
        result = failure("not_found");
      } else if (review.outline.historical && !allowHistorical) {
        result = failure("superseded");
      } else if (review.topic.revision !== input.revision) {
        result = failure("conflict");
      } else {
        result = work(review);
      }
      record(
        input,
        action,
        "topic",
        review === undefined ? null : review.topic.id,
        result.ok ? "ok" : "failed",
        result.ok
          ? { revision: result.revision }
          : { reason: result.reason, revision: input.revision },
      );
      return result;
    });

  const snapshot = (block: TopicBlock): unknown => ({
    kind: block.kind,
    position: block.position,
    removed: block.removed,
    requirementIds: block.requirementIds,
    content: block.content,
  });

  // Cualquier cambio aumenta la revisión y devuelve el tema a revisión: su
  // aprobación anterior deja de estar vigente y permanece en el registro
  // (FR-024).
  const modify = (
    topic: Topic,
    actor: Actor,
    kind: TopicChange["kind"],
    blockId: string | null,
    before: unknown,
    after: unknown,
  ): TopicResult => {
    const revision = topic.revision + 1;
    db.prepare(
      "UPDATE topic SET revision = ?, status = 'in_review' WHERE id = ?",
    ).run(revision, topic.id);
    db.prepare(
      "INSERT INTO topic_change (id, topic_id, block_id, kind, author, at, " +
        "before, after, resulting_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      newId(),
      topic.id,
      blockId,
      kind,
      actor.actorId,
      now(),
      JSON.stringify(before),
      JSON.stringify(after),
      revision,
    );
    return { ok: true, revision };
  };

  const insertBlock = (
    topicId: string,
    position: number,
    kind: TopicBlock["kind"],
    content: readonly ContentNode[],
    requirementIds: readonly string[],
  ): string => {
    const id = newId();
    db.prepare(
      "INSERT INTO topic_block (id, topic_id, position, kind, body, removed) " +
        "VALUES (?, ?, ?, ?, ?, 0)",
    ).run(id, topicId, position, kind, JSON.stringify(content));
    const link = db.prepare(
      "INSERT INTO block_requirement (topic_block_id, requirement_id) " +
        "VALUES (?, ?)",
    );
    for (const requirementId of requirementIds) {
      link.run(id, requirementId);
    }
    return id;
  };

  // Valida un bloque de desarrollo enviado: su contenido y sus vínculos, con
  // requisitos de la entrada y sin repetir.
  const checkDevelopment = (
    review: TopicReview,
    input: DevelopmentInput,
  ):
    | {
        readonly ok: true;
        readonly content: readonly ContentNode[];
        readonly requirementIds: readonly string[];
      }
    | { readonly ok: false; readonly reason: TopicRejection } => {
    const parsed = CONTENT.safeParse(textToContent(input.text));
    if (!parsed.success) {
      return { ok: false, reason: "invalid" };
    }
    const { requirementIds } = input;
    if (
      new Set(requirementIds).size !== requirementIds.length ||
      requirementIds.some(
        (id) => !review.requirements.some((item) => item.id === id),
      )
    ) {
      return { ok: false, reason: "unknown_requirement" };
    }
    return { ok: true, content: parsed.data, requirementIds };
  };

  // Solo se edita un tema con contenido.
  const editable = (review: TopicReview): TopicResult | undefined =>
    developed(review.topic) ? undefined : failure("not_developed");

  const nextPosition = (topic: Topic): number =>
    topic.blocks.reduce(
      (highest, block) => Math.max(highest, block.position),
      -1,
    ) + 1;

  const liveBlocks = (topic: Topic): TopicBlock[] =>
    topic.blocks.filter((block) => !block.removed);

  return {
    review(outlineId) {
      const review = outlines.review(outlineId);
      return review === undefined ? undefined : syllabusReviewOf(review);
    },

    async generate({ outlineId, shown, actorId, correlationId }) {
      const actor = { actorId, correlationId };
      const refuse = (reason: GenerateRejection): GenerateResult => {
        record(actor, "syllabus.generate", "syllabus", null, "failed", {
          reason,
        });
        return { ok: false, reason };
      };
      const review = outlines.review(outlineId);
      if (review === undefined) {
        return refuse("not_found");
      }
      if (review.historical) {
        return refuse("superseded");
      }
      // Solo a partir de un índice aprobado y vigente (FR-016).
      const approval = review.approval;
      if (approval === undefined) {
        return refuse("outline_not_approved");
      }
      const before = syllabusReviewOf(review);
      if (before.toGenerate.length === 0) {
        return refuse("nothing_to_generate");
      }
      if (
        shown !== undefined &&
        (shown.estimatedCost !== before.cost.estimatedCost ||
          shown.maxCost !== before.cost.maxCost)
      ) {
        return refuse("estimate_changed");
      }

      // Un tema por entrada: los que faltan nacen pendientes.
      transaction(db, () => {
        for (const entry of before.toGenerate) {
          if (topicOfEntry(entry.id) === undefined) {
            db.prepare(
              "INSERT INTO topic (id, outline_entry_id, status, revision, " +
                "created_at) VALUES (?, ?, 'pending', 1, ?)",
            ).run(newId(), entry.id, now());
          }
        }
      });

      const runId = generation.startRun({
        kind: "syllabus",
        targetId: outlineId,
        requestedBy: actorId,
      });
      let generated = 0;
      let failed = 0;
      let notSent = 0;
      let stopped = false;
      // Uno a uno: cada tema es una operación, con su propia reserva. Los
      // terminados quedan guardados aunque los siguientes no se generen.
      for (const entry of before.toGenerate) {
        if (stopped) {
          notSent += 1;
          continue;
        }
        const { request, refs } = topicRequest(review, entry);
        const result = await generation.call(runId, {
          ...request,
          outputSchema: TOPIC_OUTPUT,
          // Cada bloque cita o desarrolla requisitos de su entrada, sin
          // repetir. Lo demás se rechaza, sin repararlo.
          accept: (output) =>
            output.blocks.every((block) =>
              block.kind === "requirement"
                ? refs.has(block.requirementRef)
                : new Set(block.requirementRefs).size ===
                    block.requirementRefs.length &&
                  block.requirementRefs.every((ref) => refs.has(ref)),
            ) &&
            new Set(
              output.blocks.flatMap((block) =>
                block.kind === "requirement" ? [block.requirementRef] : [],
              ),
            ).size ===
              output.blocks.filter((block) => block.kind === "requirement")
                .length,
        });
        if (result.status === "budget_exceeded") {
          // Sin reserva posible, ni esta operación ni las siguientes se
          // envían: la generación queda incompleta (FR-021).
          stopped = true;
          notSent += 1;
          continue;
        }
        const stored = transaction(db, (): boolean => {
          const topic = topicOfEntry(entry.id);
          // El índice o el tema pudieron cambiar mientras se esperaba: un
          // resultado nunca sustituye un tema que ya tiene contenido.
          if (
            topic === undefined ||
            developed(topic) ||
            outlines.review(outlineId)?.approval?.id !== approval.id
          ) {
            return false;
          }
          if (result.status !== "ok") {
            // Tema fallido: el resultado inválido no se guarda (FR-019).
            db.prepare(
              "UPDATE topic SET status = 'failed', failure = ?, " +
                "last_call_id = ? WHERE id = ?",
            ).run(
              result.uncertain ? "uncertain" : result.status,
              result.callId,
              topic.id,
            );
            return false;
          }
          result.output.blocks.forEach((block, position) => {
            insertBlock(
              topic.id,
              position,
              block.kind,
              block.kind === "development" ? block.content : [],
              (block.kind === "requirement"
                ? [block.requirementRef]
                : block.requirementRefs
              ).map((ref) => refs.get(ref) ?? ""),
            );
          });
          db.prepare(
            "UPDATE topic SET status = 'draft', failure = NULL, " +
              "revision = ?, last_call_id = ? WHERE id = ?",
          ).run(topic.revision + 1, result.callId, topic.id);
          db.prepare(
            "INSERT INTO topic_change (id, topic_id, block_id, kind, " +
              "author, at, before, after, resulting_revision) " +
              "VALUES (?, ?, NULL, 'generate', ?, ?, 'null', ?, ?)",
          ).run(
            newId(),
            topic.id,
            actorId,
            now(),
            JSON.stringify({
              blocks: result.output.blocks.length,
              provider: generation.provider,
            }),
            topic.revision + 1,
          );
          return true;
        });
        if (stored) {
          generated += 1;
        } else {
          failed += 1;
        }
      }
      const after = outlines.review(outlineId);
      const incomplete =
        after === undefined || syllabusReviewOf(after).incomplete;
      generation.finishRun(runId, incomplete ? "incomplete" : "succeeded");
      record(actor, "syllabus.generate", "syllabus", outlineId, "ok", {
        generated,
        failed,
        notSent,
        incomplete,
        provider: generation.provider,
      });
      return { ok: true, generated, failed, notSent, incomplete };
    },

    getTopic,

    reviewTopic(id) {
      const topic = getTopic(id);
      return topic === undefined ? undefined : topicReviewOf(topic);
    },

    addDevelopmentBlock(input) {
      return change(input, "topic.edit", (review) => {
        const { topic } = review;
        const refused = editable(review);
        if (refused !== undefined) {
          return refused;
        }
        if (liveBlocks(topic).length >= MAX_BLOCKS) {
          return failure("too_many_blocks");
        }
        const checked = checkDevelopment(review, input.block);
        if (!checked.ok) {
          return failure(checked.reason);
        }
        const position = nextPosition(topic);
        const id = insertBlock(
          topic.id,
          position,
          "development",
          checked.content,
          checked.requirementIds,
        );
        return modify(topic, input, "add", id, null, {
          kind: "development",
          position,
          removed: false,
          requirementIds: checked.requirementIds,
          content: checked.content,
        });
      });
    },

    addRequirementBlock(input) {
      return change(input, "topic.edit", (review) => {
        const { topic } = review;
        const refused = editable(review);
        if (refused !== undefined) {
          return refused;
        }
        if (liveBlocks(topic).length >= MAX_BLOCKS) {
          return failure("too_many_blocks");
        }
        if (
          !review.requirements.some((item) => item.id === input.requirementId)
        ) {
          return failure("unknown_requirement");
        }
        if (
          liveBlocks(topic).some(
            (block) =>
              block.kind === "requirement" &&
              block.requirementIds.includes(input.requirementId),
          )
        ) {
          return failure("already_cited");
        }
        const position = nextPosition(topic);
        const id = insertBlock(
          topic.id,
          position,
          "requirement",
          [],
          [input.requirementId],
        );
        return modify(topic, input, "add", id, null, {
          kind: "requirement",
          position,
          removed: false,
          requirementIds: [input.requirementId],
          content: [],
        });
      });
    },

    editBlock(input) {
      return change(input, "topic.edit", (review) => {
        const { topic } = review;
        const existing = topic.blocks.find(
          (block) => block.id === input.blockId,
        );
        if (existing === undefined) {
          return failure("not_found");
        }
        if (existing.removed) {
          return failure("removed");
        }
        // Un bloque de requisito cita la norma: no tiene texto que editar.
        if (existing.kind === "requirement") {
          return failure("invalid");
        }
        const checked = checkDevelopment(review, input.block);
        if (!checked.ok) {
          return failure(checked.reason);
        }
        if (
          JSON.stringify(checked.content) ===
            JSON.stringify(existing.content) &&
          sameSet(checked.requirementIds, existing.requirementIds)
        ) {
          return failure("unchanged");
        }
        db.prepare("UPDATE topic_block SET body = ? WHERE id = ?").run(
          JSON.stringify(checked.content),
          existing.id,
        );
        db.prepare(
          "DELETE FROM block_requirement WHERE topic_block_id = ?",
        ).run(existing.id);
        const link = db.prepare(
          "INSERT INTO block_requirement (topic_block_id, requirement_id) " +
            "VALUES (?, ?)",
        );
        for (const requirementId of checked.requirementIds) {
          link.run(existing.id, requirementId);
        }
        return modify(topic, input, "edit", existing.id, snapshot(existing), {
          ...(snapshot(existing) as object),
          requirementIds: checked.requirementIds,
          content: checked.content,
        });
      });
    },

    moveBlock(input) {
      return change(input, "topic.edit", ({ topic }) => {
        const live = liveBlocks(topic);
        const index = live.findIndex((block) => block.id === input.blockId);
        const existing = live[index];
        if (existing === undefined) {
          return failure(
            topic.blocks.some((block) => block.id === input.blockId)
              ? "removed"
              : "not_found",
          );
        }
        const other = live[index + (input.direction === "up" ? -1 : 1)];
        if (other === undefined) {
          return failure("cannot_move");
        }
        const move = db.prepare(
          "UPDATE topic_block SET position = ? WHERE id = ?",
        );
        move.run(other.position, existing.id);
        move.run(existing.position, other.id);
        return modify(topic, input, "move", existing.id, snapshot(existing), {
          ...(snapshot(existing) as object),
          position: other.position,
        });
      });
    },

    removeBlock(input) {
      return change(input, "topic.edit", ({ topic }) => {
        const existing = topic.blocks.find(
          (block) => block.id === input.blockId,
        );
        if (existing === undefined) {
          return failure("not_found");
        }
        if (existing.removed) {
          return failure("removed");
        }
        // El bloque no se borra: queda marcado, con su contenido.
        db.prepare("UPDATE topic_block SET removed = 1 WHERE id = ?").run(
          existing.id,
        );
        return modify(topic, input, "remove", existing.id, snapshot(existing), {
          ...(snapshot(existing) as object),
          removed: true,
        });
      });
    },

    approveTopic(input) {
      return change(
        input,
        "topic.approve",
        (review) => {
          const { topic } = review;
          // Un tema pendiente o fallido no tiene nada que aprobar.
          if (!developed(topic)) {
            return failure("not_developed");
          }
          if (
            topic.status === "rejected" ||
            (topic.status === "approved" && review.approval !== undefined)
          ) {
            return failure("not_reviewable");
          }
          if (liveBlocks(topic).length === 0) {
            return failure("empty");
          }
          // Solo con el índice aprobado y vigente (FR-022).
          const outlineApproval = review.outline.approval;
          if (outlineApproval === undefined) {
            return failure("outline_not_approved");
          }
          if (review.referencesPending.length > 0) {
            return failure("unchecked_references", review.referencesPending);
          }
          db.prepare("UPDATE topic SET status = 'approved' WHERE id = ?").run(
            topic.id,
          );
          db.prepare(
            "INSERT INTO topic_approval (id, topic_id, topic_revision, " +
              "outline_approval_id, approved_by, approved_at) " +
              "VALUES (?, ?, ?, ?, ?, ?)",
          ).run(
            newId(),
            topic.id,
            topic.revision,
            outlineApproval.id,
            input.actorId,
            now(),
          );
          return { ok: true, revision: topic.revision };
        },
        true,
      );
    },

    rejectTopic(input) {
      return change(input, "topic.reject", ({ topic }) => {
        if (!developed(topic)) {
          return failure("not_developed");
        }
        if (topic.status === "rejected") {
          return failure("not_reviewable");
        }
        const reason = input.reason.trim();
        if (reason === "" || reason.length > 1000) {
          return failure("missing_reason");
        }
        // Rechazar conserva el contenido y no inicia ninguna generación.
        db.prepare("UPDATE topic SET status = 'rejected' WHERE id = ?").run(
          topic.id,
        );
        db.prepare(
          "INSERT INTO rejection (id, target_kind, target_id, " +
            "target_revision, rejected_by, rejected_at, reason) " +
            "VALUES (?, 'topic', ?, ?, ?, ?, ?)",
        ).run(newId(), topic.id, topic.revision, input.actorId, now(), reason);
        return { ok: true, revision: topic.revision };
      });
    },

    resubmitTopic(input) {
      return change(input, "topic.resubmit", ({ topic }) => {
        if (topic.status !== "rejected") {
          return failure("not_rejected");
        }
        db.prepare("UPDATE topic SET status = 'in_review' WHERE id = ?").run(
          topic.id,
        );
        return { ok: true, revision: topic.revision };
      });
    },

    checkTopicReference({ topicId, requirementId, confirmed, ...actor }) {
      return transaction(db, () => {
        const topic = getTopic(topicId);
        const review = topic === undefined ? undefined : topicReviewOf(topic);
        let result: TopicResult;
        if (review === undefined) {
          result = failure("not_found");
        } else if (!review.outline.historical) {
          result = failure("not_historical");
        } else if (!confirmed) {
          result = failure("not_confirmed");
        } else if (
          !review.referencesPending.some((item) => item.id === requirementId)
        ) {
          result = failure("already_checked");
        } else {
          references.record({
            kind: "topic",
            targetId: topicId,
            requirementId,
            actorId: actor.actorId,
          });
          result = { ok: true, revision: review.topic.revision };
        }
        record(
          actor,
          "topic.reference_check",
          "topic",
          review === undefined ? null : topicId,
          result.ok ? "ok" : "failed",
          result.ok
            ? { requirement: requirementId }
            : { reason: result.reason },
        );
        return result;
      });
    },

    approveVersion({ outlineId, fingerprint, ...actor }) {
      return transaction(db, (): VersionResult => {
        const outline = outlines.review(outlineId);
        const review =
          outline === undefined ? undefined : syllabusReviewOf(outline);
        let result: VersionResult;
        if (review === undefined) {
          result = { ok: false, reason: "not_found", blockers: undefined };
        } else if (review.fingerprint !== fingerprint) {
          result = { ok: false, reason: "conflict", blockers: undefined };
        } else if (
          blocked(review.blockers) ||
          review.outline.approval === undefined
        ) {
          // Sin excepciones: índice vigente, todos los temas desarrollados y
          // aprobados, y cada requisito citado y desarrollado (FR-060).
          result = { ok: false, reason: "blocked", blockers: review.blockers };
        } else {
          const { interpretation } = review.outline;
          const requirement = (id: string) =>
            interpretation.requirements.find((item) => item.id === id);
          const content = JSON.stringify({
            format: 1,
            unit: {
              code: interpretation.unitCode,
              title: interpretation.unitTitle,
            },
            documentId: interpretation.documentId,
            interpretation: {
              id: interpretation.id,
              revision: interpretation.revision,
            },
            outline: {
              id: review.outline.outline.id,
              revision: review.outline.outline.revision,
              approvalId: review.outline.approval.id,
            },
            topics: review.topics.map(({ entry, topic }) => ({
              entryId: entry.id,
              title: entry.title,
              topicId: topic?.id,
              revision: topic?.revision,
              blocks: (topic === undefined ? [] : liveBlocks(topic)).map(
                (block) => ({
                  kind: block.kind,
                  content: block.content,
                  requirements: block.requirementIds
                    .map(requirement)
                    .filter((item) => item !== undefined && !item.withdrawn)
                    .map((item) => ({
                      id: item?.id,
                      kind: item?.kind,
                      code: item?.code,
                      text: item?.text,
                      section: item?.section,
                      pageFrom: item?.pageFrom,
                      pageTo: item?.pageTo,
                      quote: item?.quote,
                    })),
                }),
              ),
            })),
          });
          const versionId = newId();
          const label = `v${String(review.versions.length + 1)}`;
          db.prepare(
            "INSERT INTO syllabus_version (id, outline_id, " +
              "outline_approval_id, label, content_sha256, snapshot, " +
              "approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(
            versionId,
            outlineId,
            review.outline.approval.id,
            label,
            createHash("sha256").update(content).digest("hex"),
            content,
            actor.actorId,
            now(),
          );
          const link = db.prepare(
            "INSERT INTO syllabus_version_topic (syllabus_version_id, " +
              "topic_approval_id) VALUES (?, ?)",
          );
          for (const { topic } of review.topics) {
            const approval =
              topic === undefined
                ? undefined
                : approvalsOf(review.outline, topic).find(
                    (item) => item.current,
                  );
            if (approval !== undefined) {
              link.run(versionId, approval.id);
            }
          }
          result = { ok: true, versionId, label };
        }
        record(
          actor,
          "syllabus.approve",
          "syllabus",
          review === undefined ? null : outlineId,
          result.ok ? "ok" : "failed",
          result.ok
            ? { version: result.label }
            : {
                reason: result.reason,
                undeveloped: result.blockers?.undeveloped.length ?? 0,
                unapproved: result.blockers?.unapproved.length ?? 0,
                requirements: result.blockers?.development.length ?? 0,
              },
        );
        return result;
      });
    },

    snapshotOf(versionId) {
      if (!ID.test(versionId)) {
        return undefined;
      }
      const row = db
        .prepare("SELECT snapshot FROM syllabus_version WHERE id = ?")
        .get(versionId);
      return row === undefined ? undefined : text(row.snapshot);
    },
  };
}
