// Montaje común de las pruebas del índice: una base de datos en memoria, una
// fuente normativa doble con páginas sintéticas, la interpretación real de
// una unidad sintética, ya validada, y un proveedor simulado que responde a
// la tarea `outline` con lo que cada prueba indique. No hay documento real,
// red ni proveedor.
import { createOutlines, createSyllabus } from "@/modules/didactic-content";
import type {
  OutlineOutput,
  Outlines,
  Syllabus,
  TopicOutput,
} from "@/modules/didactic-content";
import type { NormativeSource } from "@/modules/normative-source";
import { createStructuredInterpretation } from "@/modules/structured-interpretation";
import type {
  InterpretationOutput,
  Requirement,
  StructuredInterpretation,
} from "@/modules/structured-interpretation";
import { createAudit } from "@/platform/audit";
import type { Audit } from "@/platform/audit";
import { createBudget, createGeneration } from "@/platform/generation";
import type {
  Budget,
  Generation,
  ProviderReply,
  ProviderRequest,
} from "@/platform/generation";
import {
  migrate,
  openMemoryDatabase,
  PLATFORM_MIGRATIONS,
} from "@/platform/persistence";
import type { Database } from "@/platform/persistence";

export const DOCUMENT = "d".repeat(32);
export const UNIT = "UX9001";
export const TEACHER = { actorId: "docente-1", correlationId: "correlación" };
export const OTHER_TEACHER = {
  actorId: "docente-2",
  correlationId: "correlación-2",
};

const PAGES: Readonly<Record<number, string>> = {
  1: "Unidad sintética. C1 y CE1.1.",
  2: "Contenido uno y sus apartados.",
};

type Kind = InterpretationOutput["requirements"][number]["kind"];

function item(
  ref: string,
  parentRef: string | null,
  kind: Kind,
  page: number,
): InterpretationOutput["requirements"][number] {
  return {
    ref,
    parentRef,
    kind,
    code: ref,
    text: `Texto de ${ref}`,
    section: "Sección sintética",
    pageFrom: page,
    pageTo: page,
    quote: null,
  };
}

// Inventario sintético: una capacidad con un criterio y un contenido con un
// subapartado que tiene otro. En la petición del índice son `r1` a `r5`.
const INTERPRETATION: InterpretationOutput = {
  unit: {
    code: UNIT,
    title: "Unidad sintética",
    durationHours: null,
    durationSection: "",
    durationPage: null,
    durationQuote: null,
  },
  requirements: [
    item("C1", null, "capability", 1),
    item("CE1.1", "C1", "criterion", 1),
    item("K1", null, "content", 2),
    item("S1", "K1", "subcontent", 2),
    item("S2", "S1", "subcontent", 2),
  ],
};

// Propuesta que cubre los cinco requisitos con tres entradas, una de ellas
// apoyada en varios, más una entrada sin respaldo normativo.
export function proposal(
  overrides: Partial<OutlineOutput> = {},
): OutlineOutput {
  return {
    entries: [
      { title: "Tema 1", unsupported: false, requirementRefs: ["r1", "r2"] },
      { title: "Tema 2", unsupported: false, requirementRefs: ["r3", "r4"] },
      { title: "Tema 3", unsupported: false, requirementRefs: ["r5", "r3"] },
      { title: "Presentación", unsupported: true, requirementRefs: [] },
    ],
    ...overrides,
  };
}

// Desarrollo completo de un tema: cita cada requisito recibido y los
// desarrolla todos en un bloque. Sin requisitos, un desarrollo sin respaldo.
export function topicOutput(request: ProviderRequest): TopicOutput {
  const { entryTitle, requirements } = request.input as {
    entryTitle: string;
    requirements: { ref: string }[];
  };
  const refs = requirements.map((item) => item.ref);
  return {
    blocks: [
      ...refs.map((ref) => ({
        kind: "requirement" as const,
        requirementRef: ref,
      })),
      {
        kind: "development" as const,
        requirementRefs: refs,
        content: [
          { type: "heading" as const, text: `Desarrollo de ${entryTitle}` },
          { type: "paragraph" as const, text: "Texto de desarrollo." },
          { type: "list" as const, items: ["Primera idea", "Segunda idea"] },
        ],
      },
    ],
  };
}

// Lo que el proveedor simulado hace con la petición de un tema: devuelve una
// salida, `undefined` para fallar, una respuesta completa o lanza un error.
export type TopicReply = (request: ProviderRequest) => unknown;

export interface OutlineFixture {
  readonly syllabus: Syllabus;
  // Respuesta a la tarea `topic`. Por defecto, `topicOutput`.
  topicReply: TopicReply;
  // Coste máximo y consumo confirmado de cada tema; `null`, sin confirmar.
  topicMaxCost: number;
  topicCost: number | null;
  // Si se define, la respuesta a cada tema espera a que termine: permite
  // actuar mientras una operación está enviada y sin respuesta.
  topicHold: ((request: ProviderRequest) => Promise<void>) | undefined;
  // Si se define, la comprobación previa al envío de cada tema: permite
  // actuar con la reserva hecha y la operación todavía sin enviar.
  topicAdmit: ((request: ProviderRequest) => Promise<boolean>) | undefined;
  // Aprueba el índice y devuelve su identificador.
  approvedOutline(reply?: unknown): Promise<string>;
  readonly db: Database;
  readonly audit: Audit;
  readonly budget: Budget;
  readonly generation: Generation;
  readonly interpretations: StructuredInterpretation;
  readonly outlines: Outlines;
  // Peticiones que llegaron al proveedor.
  readonly sent: ProviderRequest[];
  readonly interpretationId: string;
  // Lo que el proveedor responde a la tarea `outline`; `undefined`, falla.
  reply: unknown;
  // Coste máximo que el proveedor declara para la tarea `outline`.
  outlineMaxCost: number;
  // Marca el documento como sustituido.
  supersede(): void;
  // Requisito vigente con ese código.
  requirement(code: string): Requirement;
  validate(): void;
  // Pide el índice con la propuesta indicada y devuelve su identificador.
  requestOutline(reply?: unknown): Promise<string>;
}

// Por defecto, sobre una base de datos en memoria.
export async function createOutlineFixture(
  db: Database = openMemoryDatabase(),
): Promise<OutlineFixture> {
  migrate(db, PLATFORM_MIGRATIONS);
  const audit = createAudit(db);
  let clock = Date.UTC(2026, 9, 7);
  const now = () => (clock += 1000);
  let superseded = false;
  let supersededAt = 0;
  const sent: ProviderRequest[] = [];

  const document = {
    id: DOCUMENT,
    title: "Documento sintético",
    issuer: "Organismo",
    officialReference: "REF",
    source: "prueba",
    obtainedOn: "2026-10-07",
    version: "v",
    sha256: "0".repeat(64),
    sizeBytes: 1,
    pageCount: 2,
    hasSignatureField: false,
    replacesDocumentId: null,
    registeredBy: TEACHER.actorId,
    registeredAt: 0,
  };
  const source: NormativeSource = {
    limits: { maxBytes: 1, maxPages: 2 },
    registerDocument: () => Promise.reject(new Error("no se usa")),
    listDocuments: () => [document],
    getDocument: (id) => (id === DOCUMENT ? document : undefined),
    substitutesOf: () =>
      superseded ? [{ ...document, registeredAt: supersededAt }] : [],
    listPages: () => [],
    getPage: (id, number) =>
      id === DOCUMENT && PAGES[number] !== undefined
        ? {
            number,
            text: PAGES[number],
            hasExtractableText: true,
            hasImages: false,
            resolution: null,
          }
        : undefined,
    unresolvedPages: () => [],
    resolvePage: () => ({ ok: true }),
    readOriginal: () => undefined,
  };

  const budget = createBudget({ db, audit, now, maxOperationCost: 1000 });
  budget.setLimit({
    actorId: "administrador-1",
    correlationId: "preparación",
    newLimit: 10_000,
    revision: 1,
  });
  const usage = { model: "simulado", tokensIn: 0, tokensOut: 0 };
  const fixture: {
    reply: unknown;
    outlineMaxCost: number;
    topicReply: TopicReply;
    topicMaxCost: number;
    topicCost: number | null;
    topicHold: ((request: ProviderRequest) => Promise<void>) | undefined;
    topicAdmit: ((request: ProviderRequest) => Promise<boolean>) | undefined;
  } = {
    reply: proposal(),
    outlineMaxCost: 0,
    topicReply: topicOutput,
    topicMaxCost: 0,
    topicCost: 0,
    topicHold: undefined,
    topicAdmit: undefined,
  };
  const generation = createGeneration({
    db,
    budget,
    now,
    provider: {
      name: "deterministic",
      estimateCost: () => 0,
      maxCost: (request) =>
        request.task === "outline"
          ? fixture.outlineMaxCost
          : request.task === "topic"
            ? fixture.topicMaxCost
            : 0,
      admit: (request) =>
        request.task === "topic" && fixture.topicAdmit !== undefined
          ? fixture.topicAdmit(request)
          : Promise.resolve(true),
      generate: (request): Promise<ProviderReply> => {
        sent.push(request);
        if (request.task === "topic") {
          const reply = (): ProviderReply => {
            const output = fixture.topicReply(request);
            return output === undefined
              ? { ok: false, usage, cost: fixture.topicCost }
              : { ok: true, output, usage, cost: fixture.topicCost };
          };
          if (fixture.topicHold !== undefined) {
            return fixture.topicHold(request).then(reply);
          }
          const output = fixture.topicReply(request);
          return Promise.resolve(
            output === undefined
              ? { ok: false, usage, cost: fixture.topicCost }
              : { ok: true, output, usage, cost: fixture.topicCost },
          );
        }
        const output =
          request.task === "interpretation" ? INTERPRETATION : fixture.reply;
        return Promise.resolve(
          output === undefined
            ? { ok: false, usage, cost: 0 }
            : { ok: true, output, usage, cost: 0 },
        );
      },
    },
  });
  const interpretations = createStructuredInterpretation({
    db,
    audit,
    source,
    generation,
    prompt: { version: "v1", instructions: "Instrucciones." },
    now,
  });
  const outlines = createOutlines({
    db,
    audit,
    interpretations,
    generation,
    prompt: { version: "v1", instructions: "Instrucciones del índice." },
    now,
  });

  const syllabus = createSyllabus({
    db,
    audit,
    interpretations,
    outlines,
    generation,
    prompt: { version: "v1", instructions: "Instrucciones del tema." },
    now,
  });

  const requested = await interpretations.request({
    ...TEACHER,
    documentId: DOCUMENT,
    unitCode: UNIT,
    pageFrom: 1,
    pageTo: 2,
  });
  if (!requested.ok) {
    throw new Error("La interpretación sintética debía crearse.");
  }
  const { interpretationId } = requested;

  const validate = (): void => {
    const current = interpretations.get(interpretationId);
    const result = interpretations.validate({
      ...TEACHER,
      interpretationId,
      revision: current?.revision ?? 0,
      inventoryReviewed: true,
    });
    if (!result.ok) {
      throw new Error("La interpretación sintética debía validarse.");
    }
  };
  validate();
  sent.length = 0;

  const requestOutline = async (reply: unknown = proposal()) => {
    fixture.reply = reply;
    const result = await outlines.request({ ...TEACHER, interpretationId });
    if (!result.ok) {
      throw new Error(`El índice debía crearse: ${result.reason}.`);
    }
    return result.outlineId;
  };

  return {
    syllabus,
    get topicReply() {
      return fixture.topicReply;
    },
    set topicReply(value: TopicReply) {
      fixture.topicReply = value;
    },
    get topicMaxCost() {
      return fixture.topicMaxCost;
    },
    set topicMaxCost(value: number) {
      fixture.topicMaxCost = value;
    },
    get topicHold() {
      return fixture.topicHold;
    },
    set topicHold(
      value: ((request: ProviderRequest) => Promise<void>) | undefined,
    ) {
      fixture.topicHold = value;
    },
    get topicAdmit() {
      return fixture.topicAdmit;
    },
    set topicAdmit(
      value: ((request: ProviderRequest) => Promise<boolean>) | undefined,
    ) {
      fixture.topicAdmit = value;
    },
    get topicCost() {
      return fixture.topicCost;
    },
    set topicCost(value: number | null) {
      fixture.topicCost = value;
    },
    async approvedOutline(reply) {
      const outlineId = await requestOutline(reply);
      const result = outlines.approve({ ...TEACHER, outlineId, revision: 1 });
      if (!result.ok) {
        throw new Error(`El índice debía aprobarse: ${result.reason}.`);
      }
      return outlineId;
    },
    db,
    audit,
    budget,
    generation,
    interpretations,
    outlines,
    sent,
    interpretationId,
    get reply() {
      return fixture.reply;
    },
    set reply(value: unknown) {
      fixture.reply = value;
    },
    get outlineMaxCost() {
      return fixture.outlineMaxCost;
    },
    set outlineMaxCost(value: number) {
      fixture.outlineMaxCost = value;
    },
    supersede() {
      superseded = true;
      supersededAt = now();
    },
    requirement(code) {
      const found = interpretations
        .get(interpretationId)
        ?.requirements.find((entry) => entry.code === code && !entry.withdrawn);
      if (found === undefined) {
        throw new Error(`No hay ningún requisito vigente ${code}.`);
      }
      return found;
    },
    validate,
    requestOutline,
  };
}
