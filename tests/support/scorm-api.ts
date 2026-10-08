// Doble de la API de SCORM 1.2 que ofrece una plataforma. Registra las
// llamadas, aplica los límites del formato y conserva lo guardado entre
// sesiones, para comprobar la reanudación. No es un LMS: sirve para probar
// lo que el paquete pide, no lo que una plataforma real hace con ello.

export interface Call {
  readonly name: string;
  readonly args: readonly string[];
  readonly result: string;
}

export interface Store {
  // Valores confirmados con `LMSCommit`.
  committed: Record<string, string>;
}

export interface Failures {
  initialize?: boolean;
  commit?: boolean;
  finish?: boolean;
  // Elementos cuya escritura o lectura falla.
  set?: readonly string[];
  get?: readonly string[];
  // La llamada lanza una excepción en vez de devolver "false".
  throws?: boolean;
}

export interface ScormApi {
  LMSInitialize(argument: string): string;
  LMSFinish(argument: string): string;
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): string;
  LMSCommit(argument: string): string;
  LMSGetLastError(): string;
  LMSGetErrorString(code: string): string;
  LMSGetDiagnostic(code: string): string;
}

const LIMITS: Readonly<Record<string, number>> = {
  "cmi.core.lesson_location": 255,
  "cmi.suspend_data": 4096,
};
const VOCABULARY: Readonly<Record<string, readonly string[]>> = {
  "cmi.core.lesson_status": [
    "passed",
    "completed",
    "failed",
    "incomplete",
    "browsed",
    "not attempted",
  ],
  "cmi.core.exit": ["time-out", "suspend", "logout", ""],
};
const READ_ONLY = ["cmi.core.entry", "cmi.core.student_id"];
const WRITE_ONLY = ["cmi.core.exit", "cmi.core.session_time"];
const KNOWN = [
  ...Object.keys(LIMITS),
  ...Object.keys(VOCABULARY),
  ...READ_ONLY,
  "cmi.core.score.raw",
  "cmi.core.score.min",
  "cmi.core.score.max",
];

export function createStore(): Store {
  return { committed: {} };
}

export function createScormApi(
  store: Store,
  failures: Failures = {},
): { readonly api: ScormApi; readonly calls: Call[]; failures: Failures } {
  const calls: Call[] = [];
  const state = { failures };
  let phase: "idle" | "running" | "finished" = "idle";
  let error = "0";
  // Valores escritos en esta sesión y todavía sin confirmar.
  let working: Record<string, string> = {};

  const done = (name: string, args: string[], result: string): string => {
    calls.push({ name, args, result });
    if (state.failures.throws === true && result === "false") {
      throw new Error("fallo de la plataforma");
    }
    return result;
  };
  const fail = (name: string, args: string[], code: string): string => {
    error = code;
    return done(name, args, name === "LMSGetValue" ? "" : "false");
  };

  const api: ScormApi = {
    LMSInitialize(argument) {
      if (argument !== "") {
        return fail("LMSInitialize", [argument], "201");
      }
      if (phase !== "idle" || state.failures.initialize === true) {
        return fail("LMSInitialize", [argument], "101");
      }
      phase = "running";
      working = { ...store.committed };
      // La plataforma decide la entrada según cómo terminó la vez anterior.
      working["cmi.core.entry"] =
        store.committed["cmi.core.exit"] === "suspend"
          ? "resume"
          : "cmi.core.lesson_status" in store.committed
            ? ""
            : "ab-initio";
      working["cmi.core.lesson_status"] ??= "not attempted";
      error = "0";
      return done("LMSInitialize", [argument], "true");
    },
    LMSFinish(argument) {
      if (phase !== "running" || state.failures.finish === true) {
        return fail("LMSFinish", [argument], "301");
      }
      phase = "finished";
      store.committed = { ...working };
      error = "0";
      return done("LMSFinish", [argument], "true");
    },
    LMSGetValue(element) {
      if (phase !== "running") {
        return fail("LMSGetValue", [element], "301");
      }
      if (state.failures.get?.includes(element) === true) {
        return fail("LMSGetValue", [element], "101");
      }
      if (!KNOWN.includes(element)) {
        return fail("LMSGetValue", [element], "401");
      }
      if (WRITE_ONLY.includes(element)) {
        return fail("LMSGetValue", [element], "404");
      }
      error = "0";
      return done("LMSGetValue", [element], working[element] ?? "");
    },
    LMSSetValue(element, value) {
      const args = [element, value];
      if (phase !== "running") {
        return fail("LMSSetValue", args, "301");
      }
      if (state.failures.set?.includes(element) === true) {
        return fail("LMSSetValue", args, "101");
      }
      if (!KNOWN.includes(element)) {
        return fail("LMSSetValue", args, "401");
      }
      if (READ_ONLY.includes(element)) {
        return fail("LMSSetValue", args, "403");
      }
      const limit = LIMITS[element];
      const vocabulary = VOCABULARY[element];
      if (
        typeof value !== "string" ||
        (limit !== undefined && value.length > limit) ||
        (vocabulary !== undefined && !vocabulary.includes(value)) ||
        // `not attempted` solo lo fija la plataforma.
        (element === "cmi.core.lesson_status" && value === "not attempted")
      ) {
        return fail("LMSSetValue", args, "405");
      }
      working[element] = value;
      error = "0";
      return done("LMSSetValue", args, "true");
    },
    LMSCommit(argument) {
      if (phase !== "running" || state.failures.commit === true) {
        return fail("LMSCommit", [argument], "101");
      }
      store.committed = { ...working };
      error = "0";
      return done("LMSCommit", [argument], "true");
    },
    LMSGetLastError() {
      return error;
    },
    LMSGetErrorString() {
      return "";
    },
    LMSGetDiagnostic() {
      return "";
    },
  };
  return {
    api,
    calls,
    get failures() {
      return state.failures;
    },
    set failures(value: Failures) {
      state.failures = value;
    },
  };
}
