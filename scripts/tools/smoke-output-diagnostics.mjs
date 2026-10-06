// @ts-check
// Diagnóstico de la salida capturada por la prueba de humo
// (`scripts/smoke-test.mjs`). Solo observa: la aceptación sigue decidiéndose
// sobre la salida mezclada de stdout y stderr que usan las aserciones, y este
// módulo nunca convierte un fallo en éxito.
//
// En paralelo a esa mezcla, registra la procedencia de cada línea (flujo,
// índice dentro del flujo y secuencia de recepción) y la clasifica en un
// conjunto cerrado de categorías. Ante un fallo de auditoría, el informe se
// construye solo con constantes, enumeraciones, índices y booleanos: nunca con
// el texto de la salida, ni siquiera redactado, ni con mensajes de excepción.
//
// El orden de recepción entre dos pipes no es el orden real de emisión: dentro
// de un mismo flujo el orden se conserva, pero entre stdout y stderr solo se
// conoce el orden en que llegaron los datos.

/** @typedef {"stdout" | "stderr"} Stream */

export const CATEGORY = Object.freeze({
  EMPTY: "vacía",
  NPM_BANNER: "cabecera-npm",
  NEXT_STARTUP: "next-inicio",
  STARTUP_COMPLETED: "evento-startup.completed",
  CONFIG_INVALID: "evento-startup.config_invalid",
  JSON_OTHER: "json-otro",
  JSON_INVALID: "json-inválido",
  TURBOPACK_PERSISTENCE: "turbopack-persistencia",
  NEXT_WARNING: "next-aviso",
  NEXT_ERROR: "next-error",
  NEXT_OTHER: "next-otro",
  NPM_WARNING: "npm-aviso",
  NPM_ERROR: "npm-error",
  UNKNOWN: "texto-desconocido",
});

/** @typedef {(typeof CATEGORY)[keyof typeof CATEGORY]} Category */

// Firmas de mensajes concretos, en un conjunto cerrado e independiente de la
// categoría.
export const SIGNATURE = Object.freeze({
  SLOW_FILESYSTEM: "slow-filesystem",
  SLOW_FILESYSTEM_SEE_MORE: "slow-filesystem-ver-mas",
  NONE: "ninguna",
});

/** @typedef {(typeof SIGNATURE)[keyof typeof SIGNATURE]} Signature */

export const LIMITS = Object.freeze({
  // Caracteres conservados de una línea abierta; el resto solo se cuenta.
  maxLineLength: 65_536,
  // Líneas registradas por flujo; las siguientes solo se cuentan.
  maxRecordsPerStream: 5_000,
  // Detalles impresos por caso; los demás se cuentan como omitidos.
  maxDetails: 10,
});

/**
 * @typedef {object} Limits
 * @property {number} maxLineLength
 * @property {number} maxRecordsPerStream
 * @property {number} maxDetails
 */

// Firmas verificadas en el código instalado de Next.js 16.3.6:
// - prefijos de nivel de `next/dist/build/output/log.js` (sin color, que
//   está desactivado en los procesos del arnés);
// - mensajes de la caché persistente de Turbopack. Firmas observadas en el
//   binario nativo instalado (`@next/swc-darwin-arm64` 16.3.6) y contrastadas
//   en `@next/swc-linux-x64-gnu` 16.3.6. Su presencia en los binarios no
//   demuestra que el mensaje se emita, su formato ni la causa de un fallo.
// Una coincidencia identifica el mensaje; no confirma por sí sola su causa.
const TURBOPACK_PERSISTENCE_SIGNATURES = [
  "Persisting failed during shutdown: ",
  "Failed to restore data for task ",
  "Failed to restore meta for task ",
  "Batch data restore failed: ",
  "Batch meta restore failed: ",
  "Failed to merge database files for family ",
  "tasks from database failed",
];
const NEXT_WARNING_PREFIX = "⚠";
const NEXT_ERROR_PREFIX = "⨯";
// Aviso de sistema de archivos lento de Turbopack en desarrollo, verificado en
// Next.js 16.3.6: `SlowFilesystemEvent` de
// `crates/next-napi-bindings/src/next_api/project.rs`, que
// `dist/shared/lib/turbopack/compilation-events.js` publica con `Log.warn` como
// dos líneas en una sola escritura. La primera firma reconoce solo el prefijo
// del mensaje tras el prefijo de aviso de Next.js: no valida el resto del
// mensaje ni identifica la causa de la lentitud. La segunda es la línea exacta
// que lo sigue.
const SLOW_FILESYSTEM_PREFIX = `${NEXT_WARNING_PREFIX} Slow filesystem detected. The benchmark took `;
const SLOW_FILESYSTEM_SEE_MORE =
  "See more: https://nextjs.org/docs/app/guides/local-development";
const NEXT_OTHER_PREFIXES = ["✓", "○", "▲", "»"];
// Cabecera de nivel de npm 11 (`lib/utils/display.js`: `heading` y nivel).
const NPM_WARNING = /^npm (?:warn|WARN)\b/;
const NPM_ERROR = /^npm (?:error|ERR!)/;

// Secuencias ANSI: CSI completas y escapes de un carácter. El carácter de
// escape se construye aparte para no escribir un control literal en la
// expresión.
const ESC = String.fromCharCode(0x1b);
const ANSI_SOURCE = `${ESC}(?:\\[[0-?]*[ -/]*[@-~]|[@-Z\\\\-_])`;
const ANSI = new RegExp(ANSI_SOURCE);
const ANSI_ALL = new RegExp(ANSI_SOURCE, "g");

/**
 * @typedef {object} ClassifyOptions
 * @property {readonly string[]} bannerLines Cabecera exacta de npm del script.
 * @property {RegExp} nextStartupLine Línea informativa admitida de Next.js.
 * @property {(text: string) => boolean} hasAbsolutePath Detector de rutas.
 */

/**
 * @typedef {object} Classification
 * @property {Category} category
 * @property {boolean} ansi
 * @property {boolean} absolutePath
 */

/**
 * Clasifica una línea completa. No conserva ni devuelve su texto.
 * @param {string} line
 * @param {ClassifyOptions} options
 * @returns {Classification}
 */
export function classifyLine(line, options) {
  const ansi = ANSI.test(line);
  const plain = ansi ? line.replace(ANSI_ALL, "") : line;
  const absolutePath =
    options.hasAbsolutePath(line) || (ansi && options.hasAbsolutePath(plain));
  return { category: categoryOf(line, plain, options), ansi, absolutePath };
}

/**
 * @param {string} line
 * @param {string} plain
 * @param {ClassifyOptions} options
 * @returns {Category}
 */
function categoryOf(line, plain, options) {
  const trimmed = plain.trim();
  if (trimmed === "") {
    return CATEGORY.EMPTY;
  }
  if (options.bannerLines.includes(line)) {
    return CATEGORY.NPM_BANNER;
  }
  if (options.nextStartupLine.test(plain)) {
    return CATEGORY.NEXT_STARTUP;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return jsonCategory(trimmed);
  }
  if (
    TURBOPACK_PERSISTENCE_SIGNATURES.some((signature) =>
      plain.includes(signature),
    )
  ) {
    return CATEGORY.TURBOPACK_PERSISTENCE;
  }
  const start = plain.trimStart();
  if (start.startsWith(NEXT_WARNING_PREFIX)) {
    return CATEGORY.NEXT_WARNING;
  }
  if (start.startsWith(NEXT_ERROR_PREFIX)) {
    return CATEGORY.NEXT_ERROR;
  }
  if (NEXT_OTHER_PREFIXES.some((prefix) => start.startsWith(`${prefix} `))) {
    return CATEGORY.NEXT_OTHER;
  }
  if (NPM_WARNING.test(start)) {
    return CATEGORY.NPM_WARNING;
  }
  if (NPM_ERROR.test(start)) {
    return CATEGORY.NPM_ERROR;
  }
  return CATEGORY.UNKNOWN;
}

/**
 * Firma de una línea completa, sobre el texto sin secuencias ANSI, como la
 * categoría. No conserva ni devuelve su texto.
 * @param {string} line
 * @returns {Signature}
 */
export function signatureOf(line) {
  const plain = ANSI.test(line) ? line.replace(ANSI_ALL, "") : line;
  if (plain.trimStart().startsWith(SLOW_FILESYSTEM_PREFIX)) {
    return SIGNATURE.SLOW_FILESYSTEM;
  }
  if (plain === SLOW_FILESYSTEM_SEE_MORE) {
    return SIGNATURE.SLOW_FILESYSTEM_SEE_MORE;
  }
  return SIGNATURE.NONE;
}

/**
 * @param {string} text
 * @returns {Category}
 */
function jsonCategory(text) {
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return CATEGORY.JSON_INVALID;
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const { msg } = /** @type {{ msg?: unknown }} */ (value);
    if (msg === "startup.completed") {
      return CATEGORY.STARTUP_COMPLETED;
    }
    if (msg === "startup.config_invalid") {
      return CATEGORY.CONFIG_INVALID;
    }
  }
  return CATEGORY.JSON_OTHER;
}

/**
 * @typedef {object} LineRecord
 * @property {Stream} stream
 * @property {number} line Índice de la línea dentro de su flujo, desde 1.
 * @property {number} received Secuencia de recepción del fragmento que la
 *   completó, desde 1, común a los dos flujos.
 * @property {Category} category
 * @property {boolean} ansi
 * @property {boolean} absolutePath
 * @property {Signature} signature
 * @property {boolean} unterminated Fragmento final sin salto de línea.
 * @property {boolean} truncated Superó `maxLineLength`.
 * @property {boolean} spliced Recibió datos del otro flujo mientras estaba
 *   abierta: en la salida mezclada aparece empalmada con ellos.
 */

/**
 * @typedef {object} StreamState
 * @property {string} partial
 * @property {boolean} truncated
 * @property {boolean} spliced
 * @property {number} lines
 * @property {number} chunks
 * @property {number} unrecorded
 * @property {LineRecord[]} records
 */

/**
 * @typedef {object} StreamSummary
 * @property {number} lines
 * @property {number} chunks
 * @property {number} unrecorded
 */

/**
 * @typedef {object} CaptureSnapshot
 * @property {boolean} failed
 * @property {number} interleavings
 * @property {{ stdout: StreamSummary, stderr: StreamSummary }} streams
 * @property {readonly LineRecord[]} records
 */

/**
 * @typedef {object} OutputCapture
 * @property {(stream: Stream, chunk: string) => void} receive
 * @property {() => CaptureSnapshot} snapshot
 */

/** @returns {StreamState} */
function newStreamState() {
  return {
    partial: "",
    truncated: false,
    spliced: false,
    lines: 0,
    chunks: 0,
    unrecorded: 0,
    records: [],
  };
}

/**
 * Captura por flujo. `receive` nunca lanza: si algo falla, la captura queda
 * marcada como fallida y el diagnóstico lo indica sin detalles.
 * @param {ClassifyOptions} options
 * @param {Limits} [limits]
 * @returns {OutputCapture}
 */
export function createOutputCapture(options, limits = LIMITS) {
  let sequence = 0;
  let interleavings = 0;
  let failed = false;
  /** @type {Record<Stream, StreamState>} */
  const streams = { stdout: newStreamState(), stderr: newStreamState() };

  /**
   * @param {StreamState} state
   * @param {string} piece
   */
  const append = (state, piece) => {
    const room = limits.maxLineLength - state.partial.length;
    if (piece.length > room) {
      state.partial += piece.slice(0, Math.max(0, room));
      state.truncated = true;
    } else {
      state.partial += piece;
    }
  };

  /**
   * @param {Stream} stream
   * @param {StreamState} state
   * @param {number} received
   * @param {boolean} unterminated
   * @returns {LineRecord}
   */
  const toRecord = (stream, state, received, unterminated) => ({
    stream,
    line: state.lines + 1,
    received,
    ...classifyLine(state.partial, options),
    signature: signatureOf(state.partial),
    unterminated,
    truncated: state.truncated,
    spliced: state.spliced,
  });

  /**
   * @param {Stream} stream
   * @param {StreamState} state
   */
  const complete = (stream, state) => {
    if (state.records.length < limits.maxRecordsPerStream) {
      state.records.push(toRecord(stream, state, sequence, false));
    } else {
      state.unrecorded += 1;
    }
    state.lines += 1;
    state.partial = "";
    state.truncated = false;
    state.spliced = false;
  };

  return {
    receive(stream, chunk) {
      if (failed) {
        return;
      }
      try {
        sequence += 1;
        const own = streams[stream];
        const other = streams[stream === "stdout" ? "stderr" : "stdout"];
        // En la salida mezclada, este fragmento queda pegado a la línea abierta
        // del otro flujo: las dos líneas afectadas combinan ambos flujos. La
        // marca propia se reinicia al cerrar la línea en `complete`.
        if (other.partial !== "" || other.truncated) {
          other.spliced = true;
          own.spliced = true;
          interleavings += 1;
        }
        own.chunks += 1;
        const pieces = chunk.split("\n");
        const last = pieces.pop() ?? "";
        for (const piece of pieces) {
          append(own, piece);
          complete(stream, own);
        }
        append(own, last);
      } catch {
        failed = true;
      }
    },
    snapshot() {
      if (failed) {
        const empty = { lines: 0, chunks: 0, unrecorded: 0 };
        return {
          failed,
          interleavings,
          streams: { stdout: empty, stderr: empty },
          records: [],
        };
      }
      /** @type {LineRecord[]} */
      const records = [];
      for (const stream of /** @type {const} */ (["stdout", "stderr"])) {
        const state = streams[stream];
        records.push(...state.records);
        if (state.partial !== "" || state.truncated) {
          records.push(toRecord(stream, state, sequence, true));
        }
      }
      records.sort(
        (left, right) =>
          left.received - right.received ||
          left.stream.localeCompare(right.stream) ||
          left.line - right.line,
      );
      /** @param {StreamState} state */
      const summary = (state) => ({
        lines: state.lines + (state.partial !== "" || state.truncated ? 1 : 0),
        chunks: state.chunks,
        unrecorded: state.unrecorded,
      });
      return {
        failed,
        interleavings,
        streams: {
          stdout: summary(streams.stdout),
          stderr: summary(streams.stderr),
        },
        records,
      };
    },
  };
}

/**
 * @typedef {object} Expectation
 * @property {"startup.completed" | "startup.config_invalid" | undefined} expectedEvent
 * @property {boolean} nextStartupAllowed
 */

/**
 * @typedef {"antes" | "después" | "recibida-antes" | "recibida-después" | "es-el-evento" | "sin-startup.completed"} Relation
 * @typedef {"mismo-flujo" | "no-determinable-entre-flujos" | "no-aplica"} EmissionOrder
 */

/**
 * @typedef {object} Detail
 * @property {LineRecord} record
 * @property {Relation} relation
 * @property {EmissionOrder} emissionOrder
 */

/**
 * @typedef {object} Diagnosis
 * @property {CaptureSnapshot} snapshot
 * @property {LineRecord | undefined} startupCompleted
 * @property {readonly Detail[]} details
 * @property {number} omitted
 */

/**
 * Líneas no admitidas por la expectativa del caso, con su relación de
 * recepción respecto a `startup.completed`.
 * @param {CaptureSnapshot} snapshot
 * @param {Expectation} expectation
 * @param {Limits} [limits]
 * @returns {Diagnosis}
 */
export function diagnose(snapshot, expectation, limits = LIMITS) {
  const { records } = snapshot;
  const startupCompleted = records.find(
    (record) =>
      record.category === CATEGORY.STARTUP_COMPLETED && !record.unterminated,
  );
  const expectedCategory =
    expectation.expectedEvent === "startup.completed"
      ? CATEGORY.STARTUP_COMPLETED
      : expectation.expectedEvent === "startup.config_invalid"
        ? CATEGORY.CONFIG_INVALID
        : undefined;
  const expectedRecord = records.find(
    (record) => record.category === expectedCategory && !record.unterminated,
  );
  const unexpected = records.filter(
    (record) =>
      record !== expectedRecord &&
      !(
        !record.unterminated &&
        (record.category === CATEGORY.EMPTY ||
          record.category === CATEGORY.NPM_BANNER ||
          (record.category === CATEGORY.NEXT_STARTUP &&
            expectation.nextStartupAllowed))
      ),
  );
  const details = unexpected.slice(0, limits.maxDetails).map((record) => ({
    record,
    ...relationTo(record, startupCompleted),
  }));
  return {
    snapshot,
    startupCompleted,
    details,
    omitted: unexpected.length - details.length,
  };
}

/**
 * @param {LineRecord} record
 * @param {LineRecord | undefined} event
 * @returns {{ relation: Relation, emissionOrder: EmissionOrder }}
 */
function relationTo(record, event) {
  if (event === undefined) {
    return { relation: "sin-startup.completed", emissionOrder: "no-aplica" };
  }
  if (record === event) {
    return { relation: "es-el-evento", emissionOrder: "no-aplica" };
  }
  if (record.stream === event.stream) {
    return {
      relation: record.line < event.line ? "antes" : "después",
      emissionOrder: "mismo-flujo",
    };
  }
  return {
    relation:
      record.received < event.received ? "recibida-antes" : "recibida-después",
    emissionOrder: "no-determinable-entre-flujos",
  };
}

/** @param {boolean} value */
const yesNo = (value) => (value ? "sí" : "no");

/** @param {number} value */
const count = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? String(value) : "?";

/**
 * Informe con campos controlados: constantes, enumeraciones, índices y
 * booleanos. Ningún texto procede de la salida capturada.
 * @param {number} caseId
 * @param {Diagnosis} diagnosis
 * @returns {string[]}
 */
export function formatDiagnosis(caseId, diagnosis) {
  const prefix = `diagnóstico: caso=${count(caseId)}`;
  const { snapshot, startupCompleted, details, omitted } = diagnosis;
  const { stdout, stderr } = snapshot.streams;
  const event =
    startupCompleted === undefined
      ? "startup.completed=ausente"
      : `startup.completed=${startupCompleted.stream}:${count(startupCompleted.line)} recepción=${count(startupCompleted.received)}`;
  const lines = [
    `${prefix} resumen: stdout(líneas=${count(stdout.lines)} fragmentos=${count(stdout.chunks)} sin-registrar=${count(stdout.unrecorded)}) stderr(líneas=${count(stderr.lines)} fragmentos=${count(stderr.chunks)} sin-registrar=${count(stderr.unrecorded)}) intercalados-con-línea-abierta=${count(snapshot.interleavings)} ${event} no-admitidas=${count(details.length + omitted)} omitidas=${count(omitted)}`,
  ];
  for (const { record, relation, emissionOrder } of details) {
    lines.push(
      `${prefix} flujo=${record.stream} línea=${count(record.line)} recepción=${count(record.received)} respecto-a-startup.completed=${relation} orden-de-emisión=${emissionOrder} categoría=${record.category} ruta-absoluta=${yesNo(record.absolutePath)} ansi=${yesNo(record.ansi)} sin-salto=${yesNo(record.unterminated)} truncada=${yesNo(record.truncated)} empalmada-en-mezcla=${yesNo(record.spliced)} firma=${record.signature}`,
    );
  }
  return lines;
}

/**
 * Punto de entrada del arnés. Nunca lanza: si el diagnóstico no puede
 * completarse, devuelve un aviso genérico y el fallo original se conserva.
 * @param {OutputCapture} capture
 * @param {Expectation} expectation
 * @param {number} caseId
 * @param {Limits} [limits]
 * @returns {string[]}
 */
export function diagnosticLines(capture, expectation, caseId, limits = LIMITS) {
  try {
    const snapshot = capture.snapshot();
    if (snapshot.failed) {
      return [
        `diagnóstico: caso=${count(caseId)} no disponible: la captura por flujo falló`,
      ];
    }
    return formatDiagnosis(caseId, diagnose(snapshot, expectation, limits));
  } catch {
    return [
      `diagnóstico: caso=${count(caseId)} no disponible: error interno del diagnóstico`,
    ];
  }
}
