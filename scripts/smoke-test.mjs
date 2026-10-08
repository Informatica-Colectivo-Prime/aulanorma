// Prueba de humo de los puntos de entrada admitidos (FR-004, FR-005, FR-006,
// FR-008 y FR-009; plan.md, «Estrategia de pruebas»; research.md, R8).
// Node.js sin dependencias. Se ejecuta desde `npm run check:build`, después de
// `next build`.
//
// Contiene la infraestructura común, el modo producción con `npm start` en el
// repositorio (T025) y, después y nunca a la vez, el modo desarrollo con
// `npm run dev` (T026); la matriz negativa por TCP crudo contra `npm start`
// (T029); la misma matriz en `npm run dev`, comparada caso a caso con la de
// producción (T030), y la auditoría de registros de todos los arranques de
// ambos modos (T031).
//
// El modo desarrollo se ejecuta en una copia temporal (research.md, R14): los
// ficheros regulares de `git ls-files --cached --others --exclude-standard`,
// sin ficheros ignorados, con sus propias dependencias instaladas mediante
// `npm ci` desde la caché de npm ya poblada. El `npm ci` es el único proceso
// que usa esa caché, y escribe sus registros en el temporal del arnés, no en
// ella; no puede alterar `package-lock.json` ni `package.json`.
// La copia se elimina siempre, y el repositorio original debe quedar idéntico,
// incluido `.next`.
//
// Higiene:
// - el entorno de cada proceso hijo se construye desde cero: del proceso padre
//   solo se conserva `PATH`, para localizar `npm` y `node`; el inicio, los
//   temporales y la caché de npm son directorios propios dentro de un temporal
//   del arnés, que se elimina al terminar; el aviso de actualización de npm se
//   desactiva para no salir a la red, y cada caso añade solo sus variables;
// - solo se usa el puerto fijo 127.0.0.1:3000 de los puntos de entrada, y se
//   comprueba que está libre antes de cada arranque;
// - cada proceso arranca en su propio grupo, que se termina completo al acabar
//   el caso;
// - las esperas dependen de señales observables (salida del proceso, evento
//   `startup.completed` y puerto), siempre con un límite de tiempo y sin dejar
//   temporizadores pendientes;
// - SIGINT o SIGTERM marcan la detención al instante: desde entonces no se
//   arranca ningún proceso, caso, instalación ni copia, se ejecuta una única
//   limpieza y el código de salida es 130 o 143;
// - se niega a ejecutarse si existen ficheros `.env*` de producción;
// - todo lo que imprime pasa antes por `redact`, sin valores sintéticos ni
//   rutas locales.
//
// No arranca `next start` ni `next dev`, que no están admitidos (T032).
// `server.mjs` solo se ejecuta directamente para comprobar su defensa interna,
// y el preflight, para comprobar que rechaza un `NODE_ENV` discordante.
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  createOutputCapture,
  diagnosticLines,
} from "./tools/smoke-output-diagnostics.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const HOST = "127.0.0.1";
const PORT = 3000;
const TARGET = "/api/health";
const ALLOW = "GET, HEAD, OPTIONS";
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

const EXIT_LIMIT_MS = 20_000;
const READY_LIMIT_MS = 60_000;
const STOP_LIMIT_MS = 10_000;
const RESPONSE_LIMIT_MS = 5_000;
const WARMUP_LIMIT_MS = 60_000;
const INSTALL_LIMIT_MS = 300_000;
const POLL_MS = 10;

const PRODUCTION_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

const SENTINEL = `centinela-${randomUUID()}`;
// Claves de los cimientos del producto (ADR 0004), válidas. El directorio de
// datos lo añade `caseEnvironment`, dentro del temporal de la ejecución. El
// origen público es HTTPS: `npm start` no admite otro. El origen HTTP local
// solo vale con `npm run dev` (`DEVELOPMENT_CONFIG`).
const LOCAL_HTTP_ORIGIN = `http://${HOST}:${String(PORT)}`;
const PRODUCT_CONFIG = {
  AULANORMA_PUBLIC_ORIGIN: "https://aulanorma.example",
  AULANORMA_SESSION_IDLE_MINUTES: "30",
  AULANORMA_SESSION_MAX_HOURS: "12",
  AULANORMA_PDF_MAX_MIB: "32",
  AULANORMA_PDF_MAX_PAGES: "600",
  AULANORMA_GENERATION_MAX_OPERATION_COST: "1000000",
};
const VALID_CONFIG = {
  AULANORMA_LOG_LEVEL: "info",
  AULANORMA_ENVIRONMENT: "ci",
  ...PRODUCT_CONFIG,
};
const DEVELOPMENT_CONFIG = {
  ...VALID_CONFIG,
  AULANORMA_PUBLIC_ORIGIN: LOCAL_HTTP_ORIGIN,
};
// Arranques satisfactorios auditados (T031): script de npm y entorno esperado
// en `startup.completed`, el de la configuración válida en ambos modos.
const PRODUCTION_STARTUP = {
  script: "start",
  environment: VALID_CONFIG.AULANORMA_ENVIRONMENT,
};
const DEVELOPMENT_STARTUP = {
  script: "dev",
  environment: VALID_CONFIG.AULANORMA_ENVIRONMENT,
};
const MANIFEST = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
const VERSION = MANIFEST.version;

// Redacción de todo lo que se imprime.
function realOrSelf(value) {
  try {
    return realpathSync(value);
  } catch {
    return value;
  }
}

const privateValues = [];

function protect(value, label) {
  if (value.length > 1) {
    privateValues.push([value, label]);
    privateValues.sort(([left], [right]) => right.length - left.length);
  }
}

protect(SENTINEL, "<centinela>");
protect(ROOT, "<repositorio>");
protect(realOrSelf(ROOT), "<repositorio>");
protect(os.tmpdir(), "<temporal>");
protect(realOrSelf(os.tmpdir()), "<temporal>");
protect(os.homedir(), "<inicio>");

function redact(text) {
  let result = String(text);
  for (const [value, label] of privateValues) {
    result = result.split(value).join(label);
  }
  return result;
}

function print(line) {
  process.stdout.write(`${redact(line)}\n`);
}

// Comprobaciones de la salida de un arranque fallido.
const ABSOLUTE_PATH =
  /(?:^|[\s"'(=:])(?:\/(?:Users|home|private|var|tmp|opt|usr|root|Volumes)\/|[A-Za-z]:\\)/m;
const STACK_TRACE = /^\s+at\s/m;
const ENV_FILE_NAME = /\.env\b/;
const LEAKS = {
  sentinel: "la salida contiene el valor centinela",
  absolutePath: "la salida contiene una ruta absoluta",
  envFile: "la salida nombra un fichero .env",
  stackTrace: "la salida contiene una traza",
};

function hasAbsolutePath(text) {
  return (
    text.includes(ROOT) ||
    text.includes(os.homedir()) ||
    privatePaths.some((value) => text.includes(value)) ||
    ABSOLUTE_PATH.test(text)
  );
}

function leakProblems(output) {
  const problems = [];
  if (output.includes(SENTINEL)) {
    problems.push(LEAKS.sentinel);
  }
  if (hasAbsolutePath(output)) {
    problems.push(LEAKS.absolutePath);
  }
  if (ENV_FILE_NAME.test(output)) {
    problems.push(LEAKS.envFile);
  }
  if (STACK_TRACE.test(output)) {
    problems.push(LEAKS.stackTrace);
  }
  return problems;
}

function hasStartupCompleted(output) {
  return output.split("\n").some((line) => {
    try {
      return JSON.parse(line)?.msg === "startup.completed";
    } catch {
      return false;
    }
  });
}

// Auditoría de registros (T031; FR-006 C4 y FR-008; research.md, R9). La
// salida de cada proceso contiene un único evento estructurado aprobado:
// - un arranque satisfactorio termina con `startup.completed`;
// - un arranque rechazado, con `startup.config_invalid`.
// Antes del evento solo se admiten líneas vacías y, si el proceso se lanzó con
// npm, las dos líneas con las que npm anuncia el script, exactamente una vez y
// en orden; en un proceso directo, ninguna. En un arranque satisfactorio se
// admite además, como mucho una vez, entre la cabecera de npm y el evento, la
// línea informativa que Next.js escribe siempre al preparar la aplicación
// (`NEXT_STARTUP_LINE`); no es un registro de la aplicación ni se exige. Nunca
// se admite en un arranque rechazado ni en el preflight. Después del evento no
// aparece ninguna línea: ni registros por petición o rechazo, ni avisos,
// errores o trazas.
// Cada evento es una sola línea JSON con exactamente los campos aprobados; el
// contrato completo del formato es de `tests/unit/platform/logging.test.ts`.
// Los problemas se describen con etiquetas, nunca con la salida.
const ISO_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const COMPLETED_FIELDS = ["environment", "level", "msg", "service", "time"];
const CONFIG_INVALID_FIELDS = [
  "environment",
  "level",
  "mode",
  "msg",
  "problems",
  "service",
  "time",
];
// Línea informativa que Next.js 16.3.6 escribe al cargar `next.config.ts`
// durante `app.prepare()`, sin ninguna opción pública que la evite. El patrón
// reproduce exactamente `durationToStringWithNanoseconds`
// (`next/dist/build/duration-to-string.js` de esa versión), que da formato a la
// duración con `toFixed` por tramos:
// - menos de 2 ms: milisegundos con un decimal, de `0.0ms` a `2.0ms`;
// - de 2 ms a menos de 2 s: milisegundos enteros, de `2ms` a `2000ms`;
// - de 2 s a menos de 40 s: segundos con un decimal, de `2.0s` a `40.0s`;
// - de 40 s a menos de 2 min: segundos enteros, de `40s` a `120s`;
// - desde 2 min: minutos con un decimal, desde `2.0min`.
// El redondeo puede alcanzar el límite superior de cada tramo.
// No debe sustituirse por una expresión amplia (`.*`, `\S+`, `[0-9.]+`…): la
// auditoría de T031 solo admite esta línea porque su forma es cerrada, y una
// expresión amplia dejaría pasar rutas, PID, valores o cualquier otro texto de
// Next.js sin detectarlo. Al actualizar Next.js hay que revisar su formateador
// y ajustar estos tramos.
const NEXT_DURATION = [
  String.raw`(?:[01]\.\d|2\.0)ms`,
  String.raw`(?:[2-9]|[1-9]\d{1,2}|1\d{3}|2000)ms`,
  String.raw`(?:(?:[2-9]|[1-3]\d)\.\d|40\.0)s`,
  String.raw`(?:[4-9]\d|1[01]\d|120)s`,
  String.raw`(?:[2-9]|[1-9]\d+)\.\dmin`,
].join("|");
const NEXT_STARTUP_LINE = new RegExp(
  String.raw`^✓ Running next\.config\.ts took (?:${NEXT_DURATION})$`,
);
const PROBLEM_CODES = new Set([
  "missing",
  "invalid_value",
  "unknown_key",
  "mode_mismatch",
  "env_load_failed",
]);

function sameFields(value, fields) {
  return (
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields])
  );
}

function logRecord(line) {
  if (!line.startsWith("{")) {
    return undefined;
  }
  try {
    const value = JSON.parse(line);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

// Líneas completas de la salida, clasificadas, y el fragmento final sin salto
// de línea, si lo hay.
function logLines(output) {
  const lines = output.split("\n");
  const partial = lines.pop() ?? "";
  return {
    partial,
    entries: lines.map((line) => {
      if (line.trim() === "") {
        return { kind: "vacía" };
      }
      const record = logRecord(line);
      return record === undefined
        ? { kind: "texto", line }
        : { kind: "evento", record };
    }),
  };
}

// Cabecera de npm para el script, derivada de `package.json`: su nombre, su
// versión, el nombre del script y su comando exacto. Sin script, ninguna.
function npmBanner(script) {
  return script === undefined
    ? []
    : [
        `> ${String(MANIFEST.name)}@${String(VERSION)} ${script}`,
        `> ${String(MANIFEST.scripts?.[script])}`,
      ];
}

// Lo que rodea al evento de la posición `index`: antes, solo líneas vacías,
// la cabecera exacta de npm y, con `nextStartup`, como mucho una línea
// informativa de Next.js justo antes del evento; después, nada. Sin evento, se
// revisa toda la salida como anterior a él.
function framingProblems(
  { entries, partial },
  index,
  script,
  event,
  { nextStartup = false } = {},
) {
  const problems = [];
  const banner = npmBanner(script);
  const before = (
    index === undefined ? entries : entries.slice(0, index)
  ).filter(({ kind }) => kind !== "vacía");
  const isNextLine = (entry) =>
    nextStartup && entry.kind === "texto" && NEXT_STARTUP_LINE.test(entry.line);
  const nextLines = before.filter(isNextLine);
  const own = before.filter((entry) => !isNextLine(entry));
  if (
    own.some((entry) => entry.kind !== "texto" || !banner.includes(entry.line))
  ) {
    problems.push(
      script === undefined
        ? `la salida contiene líneas distintas de ${event}`
        : nextStartup
          ? `la salida contiene líneas distintas de la cabecera de npm, la línea informativa de Next.js y ${event}`
          : `la salida contiene líneas distintas de la cabecera de npm y ${event}`,
    );
  } else if (
    own.length !== banner.length ||
    own.some(({ line }, position) => line !== banner[position])
  ) {
    problems.push(
      "la cabecera de npm no aparece exactamente una vez y en orden",
    );
  }
  if (nextLines.length > 1) {
    problems.push(
      `la línea informativa de Next.js aparece ${String(nextLines.length)} veces`,
    );
  } else if (nextLines.length === 1 && before.at(-1) !== nextLines[0]) {
    problems.push(
      `la línea informativa de Next.js no está entre la cabecera de npm y ${event}`,
    );
  }
  if ((index !== undefined && entries.length > index + 1) || partial !== "") {
    problems.push(`hay líneas después de ${event}`);
  }
  return problems;
}

function baseProblems(record, fields, level) {
  const problems = [];
  if (!sameFields(record, fields)) {
    problems.push("campos");
  }
  if (record.level !== level) {
    problems.push("nivel");
  }
  if (record.service !== "aulanorma") {
    problems.push("servicio");
  }
  if (
    typeof record.time !== "string" ||
    !ISO_TIME.test(record.time) ||
    Number.isNaN(Date.parse(record.time))
  ) {
    problems.push("marca de tiempo");
  }
  return problems;
}

// `startup.completed`: nivel `info`, sin campos propios y con el entorno de la
// configuración validada.
function completedProblems(record, environment) {
  const problems = baseProblems(record, COMPLETED_FIELDS, "info");
  if (record.environment !== environment) {
    problems.push("entorno");
  }
  return problems;
}

// `startup.config_invalid`: nivel `fatal`, el modo explícito como `mode` y
// como `environment`, y una lista de `{ key, problem }` sin ningún otro dato.
function configInvalidProblems(record, mode) {
  const problems = baseProblems(record, CONFIG_INVALID_FIELDS, "fatal");
  if (record.mode !== mode) {
    problems.push("modo");
  }
  if (record.environment !== mode) {
    problems.push("entorno");
  }
  const list = record.problems;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    list.some(
      (item) =>
        typeof item !== "object" ||
        item === null ||
        Array.isArray(item) ||
        !sameFields(item, ["key", "problem"]) ||
        typeof item.key !== "string" ||
        !PROBLEM_CODES.has(item.problem),
    )
  ) {
    problems.push("lista de problemas");
  }
  return problems;
}

// Arranque satisfactorio, auditado antes de detener el proceso: cabecera de
// npm, como mucho la línea informativa de Next.js, un único
// `startup.completed` y nada más después.
function startupLogProblems(output, { script, environment }) {
  const lines = logLines(output);
  const { entries } = lines;
  const problems = [];
  const completed = entries.flatMap((entry, index) =>
    entry.kind === "evento" && entry.record.msg === "startup.completed"
      ? [index]
      : [],
  );
  const [first] = completed;
  if (first === undefined) {
    problems.push("el arranque no registró startup.completed");
  } else {
    if (completed.length > 1) {
      problems.push(
        `startup.completed se registró ${String(completed.length)} veces`,
      );
    }
    const format = completedProblems(entries[first].record, environment);
    if (format.length > 0) {
      problems.push(
        `startup.completed no tiene el formato aprobado (${format.join(", ")})`,
      );
    }
  }
  problems.push(
    ...framingProblems(lines, first, script, "startup.completed", {
      nextStartup: true,
    }),
    ...leakProblems(output),
  );
  return problems.map((problem) => `registros: ${problem}`);
}

// Arranque rechazado por la configuración: cabecera de npm si se lanzó con
// npm y un único `startup.config_invalid` aprobado, sin ninguna otra línea.
function configInvalidLogProblems(output, { script, mode }) {
  const lines = logLines(output);
  const { entries } = lines;
  const problems = [];
  const positions = entries.flatMap((entry, index) =>
    entry.kind === "evento" && entry.record.msg === "startup.config_invalid"
      ? [index]
      : [],
  );
  const events = positions.map((index) => entries[index]);
  if (events.length !== 1) {
    problems.push(
      `startup.config_invalid se registró ${String(events.length)} veces en lugar de 1`,
    );
  }
  const [event] = events;
  if (event !== undefined) {
    const format = configInvalidProblems(event.record, mode);
    if (format.length > 0) {
      problems.push(
        `startup.config_invalid no tiene el formato aprobado (${format.join(", ")})`,
      );
    }
  }
  problems.push(
    ...framingProblems(lines, positions[0], script, "startup.config_invalid"),
  );
  return problems.map((problem) => `registros: ${problem}`);
}

// Entorno de cada caso, construido desde cero: `PATH` del proceso padre, los
// directorios aislados del temporal del arnés, el aviso de actualización de
// npm desactivado y las variables del caso. Nada más se hereda.
let searchPath;
let sandbox;
let developmentCopy;
const privatePaths = [];

function hidePath(value, label) {
  for (const variant of new Set([value, realOrSelf(value)])) {
    privatePaths.push(variant);
    protect(variant, label);
  }
}

function createSandbox() {
  sandbox = mkdtempSync(path.join(os.tmpdir(), "aulanorma-humo-"));
  hidePath(sandbox, "<temporal del arnés>");
  for (const directory of ["home", "tmp", "npm-cache", "npm-logs"]) {
    mkdirSync(path.join(sandbox, directory));
  }
  hidePath(path.join(sandbox, "npm-logs"), "<registros de npm>");
}

function removeDirectory(directory) {
  if (directory === undefined) {
    return true;
  }
  try {
    rmSync(directory, { recursive: true, force: true });
  } catch {
    // Se informa en la limpieza.
  }
  return !existsSync(directory);
}

function removeTemporaries() {
  return removeDirectory(developmentCopy) && removeDirectory(sandbox);
}

function isolatedEnvironment(npmCache) {
  return {
    PATH: searchPath,
    HOME: path.join(sandbox, "home"),
    TMPDIR: path.join(sandbox, "tmp"),
    npm_config_cache: npmCache,
    npm_config_update_notifier: "false",
  };
}

function caseEnvironment(variables) {
  return {
    ...isolatedEnvironment(path.join(sandbox, "npm-cache")),
    AULANORMA_DATA_DIR: path.join(sandbox, "datos"),
    ...variables,
  };
}

// Detención solicitada por una señal. Se marca de forma síncrona en el
// manejador; `throwIfStopping` impide, a partir de ese momento, arrancar
// procesos, casos, la instalación o la copia.
class StopRequested extends Error {}

const STOP_CODES = { SIGINT: 130, SIGTERM: 143 };
let stopSignal;

function stopping() {
  return stopSignal !== undefined;
}

function throwIfStopping() {
  if (stopping()) {
    throw new StopRequested();
  }
}

// Git solo necesita `PATH` y un inicio aislado, sin configuración global.
function gitOutput(args) {
  throwIfStopping();
  return execFileSync("git", args, {
    cwd: ROOT,
    env: {
      PATH: searchPath,
      HOME: path.join(sandbox, "home"),
      TMPDIR: path.join(sandbox, "tmp"),
    },
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 256 * 1024 * 1024,
  });
}

// Procesos: cada uno en su propio grupo, con su salida en memoria. La guarda,
// el arranque y el alta en `launched` son síncronos, así que ninguna señal
// puede dejar un proceso sin registrar.
const launched = new Set();

function launch(command, args, environment, cwd = ROOT) {
  throwIfStopping();
  const child = spawn(command, args, {
    cwd,
    env: environment,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  launched.add(child);
  let output = "";
  let running = true;
  // En paralelo a la mezcla que usan las aserciones, la procedencia de cada
  // línea para el diagnóstico de un fallo de auditoría; no decide nada.
  const script =
    command === NPM ? (args[0] === "run" ? args[1] : args[0]) : undefined;
  const capture = createOutputCapture({
    bannerLines: npmBanner(script),
    nextStartupLine: NEXT_STARTUP_LINE,
    hasAbsolutePath,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
    capture.receive("stdout", chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
    capture.receive("stderr", chunk);
  });
  const exited = new Promise((resolve) => {
    child.once("error", () => {
      running = false;
      resolve({ code: null, signal: null, started: false });
    });
    child.once("close", (code, signal) => {
      running = false;
      resolve({ code, signal, started: true });
    });
  });
  return {
    child,
    exited,
    output: () => output,
    running: () => running,
    capture,
  };
}

// Diagnóstico de un fallo de auditoría de la salida: se añade al fallo, nunca
// lo sustituye ni lo convierte en éxito. `currentCase` es el ordinal del caso
// en curso, desde 1.
let currentCase = 0;
const AUDIT_PROBLEMS = new Set([
  ...Object.values(LEAKS),
  "se registró algo por las consultas",
]);
const EXPECT_STARTUP = {
  expectedEvent: "startup.completed",
  nextStartupAllowed: true,
};
const EXPECT_CONFIG_INVALID = {
  expectedEvent: "startup.config_invalid",
  nextStartupAllowed: false,
};
const EXPECT_SILENCE = { expectedEvent: undefined, nextStartupAllowed: false };

function withDiagnostics(proc, problems, expectation) {
  const audited = problems.some(
    (problem) =>
      problem.startsWith("registros: ") || AUDIT_PROBLEMS.has(problem),
  );
  return audited ? diagnosticLines(proc.capture, expectation, currentCase) : [];
}

function groupAlive(pid) {
  if (pid === undefined) {
    return false;
  }
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function signalGroup(pid, signal) {
  if (pid === undefined) {
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // El grupo ya no existe.
  }
}

async function waitUntil(condition, limitMs) {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await delay(POLL_MS);
  }
  return condition();
}

// Termina el grupo completo: primero SIGTERM y, si no basta, SIGKILL.
async function stop(proc) {
  const { pid } = proc.child;
  if (groupAlive(pid)) {
    signalGroup(pid, "SIGTERM");
    const ended = await waitUntil(() => !groupAlive(pid), STOP_LIMIT_MS);
    if (!ended) {
      signalGroup(pid, "SIGKILL");
      await waitUntil(() => !groupAlive(pid), STOP_LIMIT_MS);
    }
  }
  // Nunca espera sin límite: si el grupo sigue vivo, queda registrado para que
  // la limpieza final lo termine y lo cuente como residuo.
  await exitResult(proc);
  if (!groupAlive(pid)) {
    launched.delete(proc.child);
  }
}

// Resultado de salida tras `stop`; si el proceso no terminó, `code` es `null`.
// El temporizador se cancela en cuanto el proceso termina.
async function exitResult(proc) {
  let timer;
  const limit = new Promise((resolve) => {
    timer = setTimeout(
      () => resolve({ code: null, signal: null }),
      STOP_LIMIT_MS,
    );
  });
  try {
    return await Promise.race([proc.exited, limit]);
  } finally {
    clearTimeout(timer);
  }
}

// Puerto.
function portAccepts() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port: PORT });
    const finish = (accepted) => {
      socket.destroy();
      resolve(accepted);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1_000, () => finish(false));
  });
}

class FatalError extends Error {}

async function ensurePortFree() {
  throwIfStopping();
  const busy = await portAccepts();
  throwIfStopping();
  if (busy) {
    throw new FatalError(
      `El puerto ${HOST}:${String(PORT)} está ocupado. Libéralo antes de ejecutar la prueba de humo.`,
    );
  }
}

// Observa el puerto durante toda la vida del proceso.
async function watchNeverOpens(proc) {
  const deadline = Date.now() + EXIT_LIMIT_MS;
  let opened = false;
  while (proc.running() && Date.now() < deadline) {
    throwIfStopping();
    if (await portAccepts()) {
      opened = true;
    }
    await delay(POLL_MS);
  }
  throwIfStopping();
  const timedOut = proc.running();
  if (await portAccepts()) {
    opened = true;
  }
  return { opened, timedOut };
}

async function waitReady(proc) {
  const deadline = Date.now() + READY_LIMIT_MS;
  while (Date.now() < deadline) {
    throwIfStopping();
    if (!proc.running()) {
      return "el proceso terminó antes de estar listo";
    }
    // `startup.completed` se registra después de empezar a escuchar (T031):
    // en cuanto aparece, el puerto ya debe aceptar conexiones.
    if (hasStartupCompleted(proc.output())) {
      return (await portAccepts())
        ? undefined
        : "registros: startup.completed se registró antes de escuchar";
    }
    await delay(POLL_MS);
  }
  return "el proceso no estuvo listo a tiempo";
}

// Cliente TCP crudo: estado, cabeceras en su orden, cuerpo, cierre de la
// conexión y ausencia de respuesta. Las peticiones que deben rechazarse se
// envían como HTTP/1.1 persistente, sin `Connection: close`, para que el cierre
// y su cabecera los decida el servidor y no el cliente. `limitMs` es el tiempo
// total de la petición; al agotarse, la conexión cuenta como no cerrada.
function rawRequest(
  method,
  target,
  { persistent = false, headers = [], limitMs = RESPONSE_LIMIT_MS } = {},
) {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    const socket = net.connect({ host: HOST, port: PORT });
    const finish = (closed) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(parseResponse(Buffer.concat(chunks), closed));
    };
    const timer = setTimeout(() => finish(false), limitMs);
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.once("end", () => finish(true));
    socket.once("close", () => finish(true));
    socket.once("error", () => finish(true));
    socket.once("connect", () => {
      const lines = [
        `${method} ${target} HTTP/1.1`,
        `Host: ${HOST}:${String(PORT)}`,
        ...(persistent ? [] : ["Connection: close"]),
        ...headers,
      ];
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    });
  });
}

function parseResponse(raw, closed) {
  const separator = raw.indexOf("\r\n\r\n");
  if (raw.length === 0 || separator === -1) {
    return {
      responded: false,
      closed,
      status: undefined,
      headers: [],
      body: Buffer.alloc(0),
    };
  }
  const [statusLine = "", ...lines] = raw
    .subarray(0, separator)
    .toString("latin1")
    .split("\r\n");
  const headers = lines.map((line) => {
    const colon = line.indexOf(":");
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
  });
  return {
    responded: true,
    closed,
    status: Number(statusLine.split(" ")[1]),
    headers,
    body: raw.subarray(separator + 4),
  };
}

// Conjunto cerrado de cabeceras: exige las obligatorias con su valor, admite
// las opcionales con su valor permitido y rechaza cualquier otra o repetida.
function headerProblems(response, required, optional) {
  const problems = [];
  const seen = new Set();
  for (const [name, value] of response.headers) {
    const key = name.toLowerCase();
    if (seen.has(key)) {
      problems.push(`cabecera repetida ${name}`);
    }
    seen.add(key);
    if (key in required) {
      if (value !== required[key]) {
        problems.push(`valor inesperado en ${name}`);
      }
    } else if (key in optional) {
      if (!optional[key](value)) {
        problems.push(`valor no admitido en ${name}`);
      }
    } else {
      problems.push(`cabecera no admitida ${name}`);
    }
  }
  for (const key of Object.keys(required)) {
    if (!seen.has(key)) {
      problems.push(`falta la cabecera ${key}`);
    }
  }
  return problems;
}

const anyValue = () => true;
const TRANSPORT = {
  date: anyValue,
  connection: (value) => value === "keep-alive" || value === "close",
  "keep-alive": (value) => value === "timeout=5",
};
const CLOSED_REJECTION = {
  "cache-control": "no-store",
  "content-length": "0",
  connection: "close",
};

function looksLikeHtml(response) {
  return /<html|<!doctype/i.test(response.body.toString("utf8"));
}

function rejectionProblems(response, status) {
  if (!response.responded) {
    return [`sin respuesta (se esperaba ${String(status)})`];
  }
  const problems = [];
  if (response.status !== status) {
    problems.push(
      `estado ${String(response.status)} en lugar de ${String(status)}`,
    );
  }
  problems.push(
    ...headerProblems(
      response,
      status === 405 ? { ...CLOSED_REJECTION, allow: ALLOW } : CLOSED_REJECTION,
      { date: anyValue },
    ),
  );
  if (response.body.length > 0) {
    problems.push("el rechazo tiene cuerpo");
  }
  if (looksLikeHtml(response)) {
    problems.push("el rechazo contiene HTML");
  }
  if (!response.closed) {
    problems.push("la conexión no se cerró");
  }
  return problems;
}

// Calentamiento del modo desarrollo: solo exige una respuesta final y completa
// sobre una conexión que el servidor cierra; su estado y su contrato no se
// evalúan todavía, porque la primera consulta compila la ruta.
function warmupProblems(response) {
  if (!response.responded) {
    return ["el calentamiento no recibió respuesta"];
  }
  const problems = [];
  if (!(response.status >= 200 && response.status <= 599)) {
    problems.push("el calentamiento no recibió una respuesta final");
  }
  const header = (name) =>
    response.headers.find(([key]) => key.toLowerCase() === name)?.[1];
  const length = header("content-length");
  const chunked = /\bchunked\b/i.test(header("transfer-encoding") ?? "");
  if (
    (length !== undefined && response.body.length !== Number(length)) ||
    (length === undefined &&
      chunked &&
      !response.body.toString("latin1").endsWith("0\r\n\r\n"))
  ) {
    problems.push("la respuesta del calentamiento está incompleta");
  }
  if (!response.closed) {
    problems.push("el calentamiento no terminó a tiempo");
  }
  return problems;
}

function successHeaders(bodyLength) {
  return {
    "cache-control": "no-store",
    "content-type": "application/json",
    "content-length": String(bodyLength),
  };
}

function getProblems(response) {
  if (!response.responded) {
    return ["GET sin respuesta"];
  }
  const problems = [];
  if (response.status !== 200) {
    problems.push(`GET respondió ${String(response.status)}`);
  }
  const text = response.body.toString("utf8");
  problems.push(
    ...headerProblems(response, successHeaders(response.body.length), {
      ...TRANSPORT,
      vary: (value) => value === "Accept-Encoding",
    }).map((problem) => `GET: ${problem}`),
  );
  try {
    const body = JSON.parse(text);
    if (
      JSON.stringify(Object.keys(body)) !==
        JSON.stringify(["status", "version"]) ||
      body.status !== "ok" ||
      body.version !== VERSION
    ) {
      problems.push("GET: el cuerpo no es exactamente el del contrato");
    }
  } catch {
    problems.push("GET: el cuerpo no es JSON");
  }
  return problems;
}

async function checkContract() {
  const problems = [];
  const get = await rawRequest("GET", TARGET);
  problems.push(...getProblems(get));

  const head = await rawRequest("HEAD", TARGET);
  if (!head.responded || head.status !== 200) {
    problems.push(`HEAD respondió ${String(head.status)}`);
  } else {
    problems.push(
      ...headerProblems(head, successHeaders(get.body.length), {
        ...TRANSPORT,
        vary: (value) => value === "Accept-Encoding",
      }).map((problem) => `HEAD: ${problem}`),
    );
    if (head.body.length > 0) {
      problems.push("HEAD: la respuesta tiene cuerpo");
    }
  }

  const options = await rawRequest("OPTIONS", TARGET);
  if (!options.responded || options.status !== 204) {
    problems.push(`OPTIONS respondió ${String(options.status)}`);
  } else {
    problems.push(
      ...headerProblems(
        options,
        { allow: ALLOW, "cache-control": "no-store" },
        TRANSPORT,
      ).map((problem) => `OPTIONS: ${problem}`),
    );
    if (options.body.length > 0) {
      problems.push("OPTIONS: la respuesta tiene cuerpo");
    }
  }

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "TRACE"]) {
    const response = await rawRequest(method, TARGET, { persistent: true });
    problems.push(
      ...rejectionProblems(response, 405).map(
        (problem) => `${method}: ${problem}`,
      ),
    );
  }

  for (const target of NON_EXACT_TARGETS) {
    const response = await rawRequest("GET", target, { persistent: true });
    problems.push(
      ...rejectionProblems(response, 404).map(
        (problem) => `GET ${target}: ${problem}`,
      ),
    );
  }
  return problems;
}

// Rutas de producto sin sesión (ADR 0004;
// specs/002-boe-scorm-export/contracts/http-surface.md). Las páginas llevan a
// la entrada sin devolver nada; la entrada es HTML completo, sin recursos
// externos ni rastro del framework; un envío sin origen se rechaza; y las
// acciones no admiten otro método ni un cuerpo sin longitud.
const PRODUCT_LIMIT_MS = 30_000;
const FORM_HEADERS = [
  "Content-Type: application/x-www-form-urlencoded",
  "Content-Length: 0",
];

function headerValues(response, name) {
  return response.headers
    .filter(([header]) => header.toLowerCase() === name)
    .map(([, value]) => value);
}

function frameworkHeaderProblems(response) {
  return response.headers
    .map(([header]) => header.toLowerCase())
    .filter(
      (header) => header === "x-powered-by" || header.startsWith("x-nextjs"),
    )
    .map((header) => `revela el framework con ${header}`);
}

// `secure` indica si el origen público es HTTPS: entonces las cookies llevan
// el prefijo `__Host-` y `Secure`; con el origen HTTP local del modo
// desarrollo, ninguno de los dos.
async function checkProductSurface(secure) {
  const entryCookie = secure
    ? /^__Host-aulanorma-entry=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict; Secure$/
    : /^aulanorma-entry=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict$/;
  const problems = [];
  const expectStatus = (name, response, status) => {
    if (!response.responded || response.status !== status) {
      problems.push(
        `${name}: estado ${String(response.status)} en lugar de ${String(status)}`,
      );
      return false;
    }
    problems.push(
      ...frameworkHeaderProblems(response).map(
        (problem) => `${name}: ${problem}`,
      ),
    );
    return true;
  };

  // Los destinos con un segmento variable solo admiten su forma exacta.
  for (const target of [
    "/documents/",
    "/documents/x",
    `/documents/${"A".repeat(32)}`,
    `/documents/${"a".repeat(32)}/pages/0`,
    `/documents/${"a".repeat(32)}/pages/1?x=1`,
    `/interpretations/${"a".repeat(32)}/requirements/`,
    "/outlines",
    `/outlines/${"a".repeat(32)}/`,
    `/outlines/${"a".repeat(32)}/approve`,
    `/outlines/${"a".repeat(32)}/entries/`,
    "/api/outlines",
    "/api/outlines/force-approve",
    "/syllabus",
    `/syllabus/${"a".repeat(32)}/approve`,
    `/topics/${"a".repeat(32)}/blocks`,
    "/budget/",
    "/api/budget",
    "/export",
    `/export/${"a".repeat(32)}/delete`,
    `/export/packages/${"a".repeat(32)}/delete`,
    "/api/export",
    "/api/export/delete",
    "/api/syllabus/force-approve",
    "/api/documents",
  ]) {
    const response = await rawRequest("GET", target, { persistent: true });
    problems.push(
      ...rejectionProblems(response, 404).map(
        (problem) => `GET ${target}: ${problem}`,
      ),
    );
  }

  for (const target of [
    "/",
    "/account/password",
    "/documents",
    "/documents/new",
    `/documents/${"a".repeat(32)}`,
    `/documents/${"a".repeat(32)}/file`,
    `/documents/${"a".repeat(32)}/pages/1`,
    `/interpretations/${"a".repeat(32)}`,
    `/interpretations/${"a".repeat(32)}/unit`,
    `/interpretations/${"a".repeat(32)}/requirements/new`,
    `/interpretations/${"a".repeat(32)}/requirements/${"b".repeat(32)}`,
    `/outlines/${"a".repeat(32)}`,
    `/outlines/${"a".repeat(32)}/preview`,
    `/outlines/${"a".repeat(32)}/entries/new`,
    `/outlines/${"a".repeat(32)}/entries/${"b".repeat(32)}`,
    `/syllabus/${"a".repeat(32)}`,
    `/topics/${"a".repeat(32)}`,
    `/topics/${"a".repeat(32)}/blocks/new`,
    `/topics/${"a".repeat(32)}/blocks/${"b".repeat(32)}`,
    `/export/${"a".repeat(32)}`,
    `/export/${"a".repeat(32)}/preview`,
    `/export/packages/${"a".repeat(32)}`,
    `/export/packages/${"a".repeat(32)}/instructions`,
    "/budget",
    "/history",
    `/history/documents/${"a".repeat(32)}`,
    `/history/interpretations/${"a".repeat(32)}`,
    `/history/outlines/${"a".repeat(32)}`,
    `/history/topics/${"a".repeat(32)}`,
    "/metrics",
  ]) {
    const name = `GET ${target} sin sesión`;
    const response = await rawRequest("GET", target, {
      limitMs: PRODUCT_LIMIT_MS,
    });
    if (expectStatus(name, response, 303)) {
      if (headerValues(response, "location").join() !== "/login") {
        problems.push(`${name}: no lleva a /login`);
      }
      if (headerValues(response, "cache-control").join() !== "no-store") {
        problems.push(`${name}: sin Cache-Control: no-store`);
      }
      if (response.body.length > 0) {
        problems.push(`${name}: la redirección tiene cuerpo`);
      }
    }
  }

  const login = await rawRequest("GET", "/login", {
    limitMs: PRODUCT_LIMIT_MS,
  });
  if (expectStatus("GET /login", login, 200)) {
    const body = login.body.toString("utf8");
    const policy = headerValues(login, "content-security-policy").join();
    const cookies = headerValues(login, "set-cookie");
    const checks = [
      [
        headerValues(login, "content-type").join() ===
          "text/html; charset=utf-8",
        "tipo de contenido inesperado",
      ],
      [
        headerValues(login, "cache-control").join() === "no-store",
        "sin Cache-Control: no-store",
      ],
      [
        headerValues(login, "x-content-type-options").join() === "nosniff",
        "sin X-Content-Type-Options: nosniff",
      ],
      [
        policy.includes("default-src 'none'") && !policy.includes("unsafe"),
        "política de contenido ausente o permisiva",
      ],
      [body.startsWith("<!doctype html>"), "no es un documento HTML completo"],
      ...["style", "script"].map((tag) => {
        const element = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body);
        const digest = createHash("sha256")
          .update(element?.[1] ?? "")
          .digest("base64");
        return [
          element !== null && policy.includes(`'sha256-${digest}'`),
          `la política de contenido no lleva la huella de su <${tag}>`,
        ];
      }),
      [
        headerValues(login, "referrer-policy").join() === "same-origin",
        "Referrer-Policy distinta de same-origin",
      ],
      [
        !body.includes("_next") && !body.includes("__NEXT_DATA__"),
        "el HTML contiene rastro del framework",
      ],
      [
        !/(?:src|href)="(?:https?:)?\/\//.test(body),
        "el HTML carga un recurso externo",
      ],
      [
        cookies.length === 1 && entryCookie.test(cookies[0] ?? ""),
        "la cookie de la sesión previa no es la esperada",
      ],
    ];
    for (const [passed, problem] of checks) {
      if (!passed) {
        problems.push(`GET /login: ${problem}`);
      }
    }
  }

  const noOrigin = await rawRequest("POST", "/api/session/sign-in", {
    headers: FORM_HEADERS,
    limitMs: PRODUCT_LIMIT_MS,
  });
  if (expectStatus("POST de entrada sin Origin", noOrigin, 403)) {
    if (
      noOrigin.body.length > 0 ||
      headerValues(noOrigin, "set-cookie").length > 0
    ) {
      problems.push("POST de entrada sin Origin: devuelve cuerpo o cookies");
    }
  }

  for (const target of [
    "/api/session/sign-in",
    "/api/session/sign-out",
    "/api/session/extend",
    "/api/account/password",
    "/api/documents/upload",
    "/api/documents/resolve-page",
    "/api/interpretations/request",
    "/api/interpretations/correct",
    "/api/interpretations/validate",
    "/api/interpretations/reject",
    "/api/interpretations/resubmit",
    "/api/outlines/request",
    "/api/outlines/edit",
    "/api/outlines/approve",
    "/api/outlines/reject",
    "/api/outlines/resubmit",
    "/api/syllabus/generate",
    "/api/syllabus/approve",
    "/api/topics/edit",
    "/api/topics/approve",
    "/api/topics/reject",
    "/api/topics/resubmit",
    "/api/references/check",
    "/api/export/create",
    "/api/budget/limit",
    "/api/budget/reconcile",
  ]) {
    const noLength = await rawRequest("POST", target, { persistent: true });
    problems.push(
      ...rejectionProblems(noLength, 400).map(
        (problem) => `POST ${target} sin Content-Length: ${problem}`,
      ),
    );
    const get = await rawRequest("GET", target, { persistent: true });
    if (
      !get.responded ||
      get.status !== 405 ||
      headerValues(get, "allow").join() !== "POST" ||
      get.body.length > 0
    ) {
      problems.push(`GET ${target}: no es un 405 cerrado con Allow: POST`);
    }
  }

  // El origen exigido es el público de la configuración, no el de la conexión
  // ni el que digan las cabeceras de un proxy.
  const origin = secure
    ? PRODUCT_CONFIG.AULANORMA_PUBLIC_ORIGIN
    : LOCAL_HTTP_ORIGIN;
  if (secure) {
    const local = await rawRequest("POST", "/api/session/sign-out", {
      headers: [
        ...FORM_HEADERS,
        `Origin: ${LOCAL_HTTP_ORIGIN}`,
        "X-Forwarded-Proto: http",
        `X-Forwarded-Host: ${HOST}:${String(PORT)}`,
      ],
      limitMs: PRODUCT_LIMIT_MS,
    });
    if (expectStatus("POST con el origen HTTP local", local, 403)) {
      if (
        local.body.length > 0 ||
        headerValues(local, "set-cookie").length > 0
      ) {
        problems.push(
          "POST con el origen HTTP local: devuelve cuerpo o cookies",
        );
      }
    }
  }
  // La subida de un PDF sin sesión se rechaza sin cuerpo, y el fichero no se
  // guarda.
  const upload = await rawRequest("POST", "/api/documents/upload", {
    headers: [
      "Content-Type: application/pdf",
      "Content-Length: 0",
      `Origin: ${origin}`,
    ],
    limitMs: PRODUCT_LIMIT_MS,
  });
  if (expectStatus("POST de subida sin sesión", upload, 401)) {
    if (
      upload.body.length > 0 ||
      headerValues(upload, "set-cookie").length > 0
    ) {
      problems.push("POST de subida sin sesión: devuelve cuerpo o cookies");
    }
  }

  for (const target of [
    "/api/session/sign-out",
    "/api/session/extend",
    "/api/account/password",
    "/api/documents/resolve-page",
    "/api/interpretations/request",
    "/api/interpretations/correct",
    "/api/interpretations/validate",
    "/api/interpretations/reject",
    "/api/interpretations/resubmit",
    "/api/outlines/request",
    "/api/outlines/edit",
    "/api/outlines/approve",
    "/api/outlines/reject",
    "/api/outlines/resubmit",
    "/api/syllabus/generate",
    "/api/syllabus/approve",
    "/api/topics/edit",
    "/api/topics/approve",
    "/api/topics/reject",
    "/api/topics/resubmit",
    "/api/references/check",
    "/api/export/create",
    "/api/budget/limit",
    "/api/budget/reconcile",
  ]) {
    const response = await rawRequest("POST", target, {
      headers: [...FORM_HEADERS, `Origin: ${origin}`],
      limitMs: PRODUCT_LIMIT_MS,
    });
    const name = `POST ${target} sin sesión`;
    if (expectStatus(name, response, 303)) {
      if (
        headerValues(response, "location").join() !== "/login" ||
        response.body.length > 0
      ) {
        problems.push(`${name}: no lleva a /login sin cuerpo`);
      }
    }
  }
  return problems;
}

const NON_EXACT_TARGETS = [
  "//",
  "/index",
  "/login/",
  "/login?next=/",
  "/account",
  "/api/session",
  "/foo",
  "/api",
  "/api/health/",
  "/api/health/extra",
  "/favicon.ico",
  "/404",
  "/500",
  "/_error",
  "/_not-found",
  "/_next/data/compilacion/index.json",
  "/_next/image?url=%2Ffavicon.ico&w=64&q=75",
  "/_next/static/chunks/main.js",
  "/__nextjs_original-stack-frame",
  "/api/health.rsc",
];

// Matriz negativa por TCP crudo (T029; research.md, R1, K18, K19 y K24):
// subconjunto permanente del oráculo de viabilidad. Cada caso envía bytes
// exactos por una conexión nueva, sin un cliente HTTP que normalice nada; lee
// hasta que el servidor cierra y analiza las respuestas en orden, como máximo
// una por petición y sin bytes adicionales. Donde el analizador HTTP de Node.js
// puede rechazar la entrada antes de la frontera, el 400 cerrado de error de
// análisis es una alternativa contractual (K18); el cierre ordenado y el
// reinicio de la conexión son equivalentes (K19). No cubre los errores internos
// del framework anteriores al manejador (K25). Los métodos y destinos de
// `checkContract` no se repiten aquí.
const WIRE_LIMIT_MS = 5_000;
const WIRE_HOST = `Host: ${HOST}:${String(PORT)}`;
const WIRE_RUN = randomUUID();
const PARSE_ALTERNATIVE = 400;
const EXPECTED_BODY_LENGTH = Buffer.byteLength(
  JSON.stringify({ status: "ok", version: VERSION }),
);

// Identificador de compilación del repositorio, si existe: nunca debe aparecer
// en una respuesta.
function buildId() {
  try {
    return readFileSync(path.join(ROOT, ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return undefined;
  }
}

// Petición en bruto: línea, cabeceras y cuerpo, sin añadir nada.
function wire(line, headers = [], body = "") {
  return `${[line, ...headers].join("\r\n")}\r\n\r\n${body}`;
}

// Envía los bytes y lee hasta el cierre del servidor. Con `resetAfterWrite`,
// el cliente reinicia la conexión justo después de escribir.
function wireExchange(bytes, { resetAfterWrite = false } = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    const socket = net.connect({ host: HOST, port: PORT });
    const finish = (closed) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({ data: Buffer.concat(chunks), closed });
    };
    const timer = setTimeout(() => finish("abierta"), WIRE_LIMIT_MS);
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.once("end", () => finish("cerrada"));
    socket.once("close", () => finish("cerrada"));
    socket.once("error", (error) => {
      finish(error?.code === "ECONNRESET" ? "reiniciada" : "error");
    });
    socket.once("connect", () => {
      socket.write(Buffer.from(bytes, "latin1"));
      if (resetAfterWrite) {
        socket.resetAndDestroy();
        finish("reiniciada por el cliente");
      }
    });
  });
}

// Respuestas encadenadas del flujo recibido, en orden. `methods` indica el
// método de cada petición, porque la respuesta a `HEAD` no tiene cuerpo.
function parseWire(data, methods) {
  const responses = [];
  let offset = 0;
  let index = 0;
  while (offset < data.length) {
    const end = data.indexOf("\r\n\r\n", offset, "latin1");
    if (end === -1) {
      return { responses, leftover: data.length - offset };
    }
    const [statusLine = "", ...lines] = data
      .subarray(offset, end)
      .toString("latin1")
      .split("\r\n");
    const match = /^HTTP\/1\.[01] (\d{3})(?: [^\r\n]*)?$/.exec(statusLine);
    if (match === null) {
      return { responses, leftover: data.length - offset };
    }
    const status = Number(match[1]);
    const headers = lines.map((line) => {
      const colon = line.indexOf(":");
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
    });
    const method = methods[index];
    const declared = headers.find(
      ([name]) => name.toLowerCase() === "content-length",
    )?.[1];
    const start = end + 4;
    let length = data.length - start;
    if (status < 200 || status === 204 || method === "HEAD") {
      length = 0;
    } else if (declared !== undefined && /^\d+$/.test(declared)) {
      length = Number(declared);
    }
    const body = data.subarray(start, start + length);
    if (body.length < length) {
      return { responses, leftover: data.length - offset };
    }
    responses.push({ responded: true, status, headers, body, method });
    offset = start + length;
    if (status >= 200) {
      index += 1;
    }
  }
  return { responses, leftover: 0 };
}

function wireHeader(response, name) {
  return response.headers.find(([key]) => key.toLowerCase() === name)?.[1];
}

// Contrato de cada respuesta según su estado, y auditoría común: sin
// respuestas provisionales, sin HTML, sin 500 y con `Keep-Alive: timeout=5`
// solo en respuestas satisfactorias sobre conexiones persistentes (K24). Los
// conjuntos cerrados de cabeceras excluyen las del framework, `Vary` distinta
// de `Accept-Encoding`, `ETag`, `Server`, `X-Powered-By`, `Location`,
// `Refresh`, `Content-Encoding` y `Transfer-Encoding`.
function wireResponseProblems(response) {
  const { status } = response;
  const problems = [];
  if (status < 200) {
    return [`respuesta provisional ${String(status)} prohibida`];
  }
  if (status === 500) {
    return ["500 inesperado"];
  }
  if (looksLikeHtml(response)) {
    problems.push("contiene HTML");
  }
  const vary = { vary: (value) => value === "Accept-Encoding" };
  if (status === 200 && response.method === "HEAD") {
    problems.push(
      ...headerProblems(response, successHeaders(EXPECTED_BODY_LENGTH), {
        ...TRANSPORT,
        ...vary,
      }),
    );
    if (response.body.length > 0) {
      problems.push("HEAD con cuerpo");
    }
  } else if (status === 200) {
    problems.push(...getProblems(response));
  } else if (status === 204) {
    problems.push(
      ...headerProblems(
        response,
        { allow: ALLOW, "cache-control": "no-store" },
        TRANSPORT,
      ),
    );
    if (response.body.length > 0) {
      problems.push("204 con cuerpo");
    }
  } else if ([400, 404, 405, 505].includes(status)) {
    problems.push(
      ...headerProblems(
        response,
        status === 405
          ? { ...CLOSED_REJECTION, allow: ALLOW }
          : CLOSED_REJECTION,
        { date: anyValue },
      ),
    );
    if (response.body.length > 0) {
      problems.push("el rechazo tiene cuerpo");
    }
  }
  if (
    wireHeader(response, "keep-alive") !== undefined &&
    wireHeader(response, "connection") !== "keep-alive"
  ) {
    problems.push("Keep-Alive sin una conexión persistente");
  }
  return problems;
}

// Nada de la petición, del repositorio ni de la compilación se refleja.
function wireLeaks(response, markers) {
  const text = [
    ...response.headers.map(([name, value]) => `${name}: ${value}`),
    response.body.toString("latin1"),
  ].join("\n");
  const secrets = [
    ROOT,
    realOrSelf(ROOT),
    os.homedir(),
    ...privatePaths,
    buildId(),
    ...markers,
  ].filter((value) => value !== undefined && value !== "");
  return secrets.some((value) => text.includes(value))
    ? ["refleja una ruta, la compilación o un valor de la petición"]
    : [];
}

// Resultado comparable entre modos (T030): estados, conjunto de cabeceras
// (salvo el valor de `Date`), cuerpos y cierre, sin distinguir el cierre
// ordenado del reinicio (K19).
function comparable(responses, closed) {
  return JSON.stringify({
    responses: responses.map((response) => ({
      status: response.status,
      headers: response.headers
        .map(([name, value]) => {
          const key = name.toLowerCase();
          return `${key}: ${key === "date" ? "<fecha>" : value}`;
        })
        .sort(),
      body: response.body.toString("base64"),
    })),
    closed: closed === "cerrada" || closed === "reiniciada",
  });
}

const GET_CLOSE = ["GET"];
const REJECTED = (...statuses) => [statuses];

function wireCase(family, name, bytes, methods, expect, markers = []) {
  return { family, name, bytes, methods, expect, markers };
}

// Cabeceras de control del framework (tasks.md, T029): 21 casos sobre el
// destino canónico, con un marcador sintético único por valor.
const FRAMEWORK_FAMILIES = [
  "RSC",
  "Next-Router-State-Tree",
  "Next-Router-Prefetch",
  "Next-Router-Segment-Prefetch",
  "Next-Url",
  "x-middleware-subrequest",
  "x-invoke-path",
  "x-invoke-status",
  "x-invoke-error",
  "x-nextjs-data",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "Purpose",
];
const FORWARDED = [
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
];
const ROUTER = [
  "RSC",
  "Next-Router-State-Tree",
  "Next-Router-Prefetch",
  "Next-Router-Segment-Prefetch",
  "Next-Url",
];
const FRAMEWORK_CASES = [
  ["GET", ["RSC"]],
  ["HEAD", ["RSC"]],
  ["GET", ["Next-Router-State-Tree"]],
  ["HEAD", ["Next-Router-State-Tree"]],
  ["GET", ["Next-Router-Prefetch"]],
  ["HEAD", ["Next-Router-Prefetch"]],
  ["GET", ["Next-Router-Segment-Prefetch"]],
  ["HEAD", ["Next-Router-Segment-Prefetch"]],
  ["GET", ROUTER],
  ["HEAD", ROUTER],
  ["GET", ["Next-Url"]],
  ["GET", ["x-invoke-path"]],
  ["GET", ["x-invoke-status"]],
  ["GET", ["x-invoke-error"]],
  ["GET", ["x-middleware-subrequest"]],
  ["GET", ["x-nextjs-data"]],
  ["GET", ["Purpose"]],
  ["GET", FORWARDED],
  ["HEAD", FORWARDED],
  ["GET", ["Next-Router-Prefetch", "x-nextjs-data"]],
  ["GET", FRAMEWORK_FAMILIES],
];

function frameworkCase([method, names], index) {
  const number = String(index + 1);
  const markers = [];
  const headers = names.map((name, position) => {
    if (name === "Purpose") {
      return "Purpose: prefetch";
    }
    const marker = `marca-${number}-${String(position)}-${WIRE_RUN}`;
    markers.push(marker);
    return `${name}: ${marker}`;
  });
  return wireCase(
    "cabeceras de control del framework",
    `${number}: ${method} con ${names.length === FRAMEWORK_FAMILIES.length ? "las quince familias" : names.join(", ")}`,
    wire(`${method} ${TARGET} HTTP/1.1`, [
      WIRE_HOST,
      ...headers,
      "Connection: close",
    ]),
    [method],
    [[200]],
    markers,
  );
}

const CLOSE = "Connection: close";
const UPGRADE = [
  "Connection: Upgrade",
  "Upgrade: websocket",
  "Sec-WebSocket-Version: 13",
  `Sec-WebSocket-Key: ${Buffer.from(WIRE_RUN.slice(0, 16)).toString("base64")}`,
];
const MALFORMED = `GET ${TARGET} HTTX/1.1\r\n${WIRE_HOST}\r\n\r\n`;
const VERSION_REJECTED = REJECTED(505, PARSE_ALTERNATIVE);

const WIRE_CASES = [
  // Versiones.
  wireCase(
    "versión",
    "HTTP/1.0 sin Host",
    wire(`GET ${TARGET} HTTP/1.0`),
    GET_CLOSE,
    [[200]],
  ),
  wireCase(
    "versión",
    "HEAD en HTTP/1.0",
    wire(`HEAD ${TARGET} HTTP/1.0`, [WIRE_HOST]),
    ["HEAD"],
    [[200]],
  ),
  wireCase(
    "versión",
    "HTTP/1.1",
    wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, CLOSE]),
    GET_CLOSE,
    [[200]],
  ),
  wireCase(
    "versión",
    "HTTP/2.0 en texto plano",
    wire(`GET ${TARGET} HTTP/2.0`, [WIRE_HOST]),
    GET_CLOSE,
    VERSION_REJECTED,
  ),
  wireCase(
    "versión",
    "HTTP/0.9 con versión",
    wire(`GET ${TARGET} HTTP/0.9`, [WIRE_HOST]),
    GET_CLOSE,
    VERSION_REJECTED,
  ),
  wireCase(
    "versión",
    "HTTP/0.9 sin versión",
    `GET ${TARGET}\r\n\r\n`,
    GET_CLOSE,
    VERSION_REJECTED,
  ),
  wireCase(
    "versión",
    "HTTP/1.2",
    wire(`GET ${TARGET} HTTP/1.2`, [WIRE_HOST]),
    GET_CLOSE,
    VERSION_REJECTED,
  ),
  wireCase(
    "versión",
    "HTTP/3.0",
    wire(`GET ${TARGET} HTTP/3.0`, [WIRE_HOST]),
    GET_CLOSE,
    VERSION_REJECTED,
  ),
  wireCase("versión", "protocolo mal formado", MALFORMED, GET_CLOSE, [[400]]),
  wireCase(
    "versión",
    "líneas terminadas solo en LF",
    `GET ${TARGET} HTTP/1.1\n${WIRE_HOST}\n\n`,
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "versión",
    "cabecera sin dos puntos",
    wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, "Cabecera"]),
    GET_CLOSE,
    [[400]],
  ),
  // Host.
  wireCase(
    "Host",
    "ausente en HTTP/1.1",
    wire(`GET ${TARGET} HTTP/1.1`),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "Host",
    "duplicado con distinto uso de mayúsculas",
    wire(`GET ${TARGET} HTTP/1.1`, [
      WIRE_HOST,
      `host: ${HOST}:${String(PORT)}`,
    ]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "Host",
    "duplicado idéntico",
    wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, WIRE_HOST]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "Host",
    "vacío",
    wire(`GET ${TARGET} HTTP/1.1`, ["Host:"]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "Host",
    "solo espacios",
    wire(`GET ${TARGET} HTTP/1.1`, ["Host:    "]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "Host",
    "con coma",
    wire(`GET ${TARGET} HTTP/1.1`, [`${WIRE_HOST},otro`]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "Host",
    "con \\x01",
    wire(`GET ${TARGET} HTTP/1.1`, ["Host: a\x01b"]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "Host",
    "con \\x7f",
    wire(`GET ${TARGET} HTTP/1.1`, ["Host: a\x7fb"]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "Host",
    "con tabulador interno",
    wire(`GET ${TARGET} HTTP/1.1`, ["Host: a\tb"]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "Host",
    "con coma en HTTP/1.0",
    wire(`GET ${TARGET} HTTP/1.0`, ["Host: a,b"]),
    GET_CLOSE,
    [[400]],
  ),
  // Cuerpo y framing.
  wireCase(
    "cuerpo y framing",
    "Content-Length: 5 con cuerpo",
    wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, "Content-Length: 5"], "12345"),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "cuerpo y framing",
    "Content-Length: 0",
    wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, "Content-Length: 0", CLOSE]),
    GET_CLOSE,
    [[200]],
  ),
  wireCase(
    "cuerpo y framing",
    "Transfer-Encoding: chunked",
    wire(
      `GET ${TARGET} HTTP/1.1`,
      [WIRE_HOST, "Transfer-Encoding: chunked"],
      "0\r\n\r\n",
    ),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "cuerpo y framing",
    "Transfer-Encoding: identity",
    wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, "Transfer-Encoding: identity"]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "cuerpo y framing",
    "Transfer-Encoding y Content-Length",
    wire(
      `GET ${TARGET} HTTP/1.1`,
      [WIRE_HOST, "Transfer-Encoding: chunked", "Content-Length: 0"],
      "0\r\n\r\n",
    ),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "cuerpo y framing",
    "Content-Length duplicado y conflictivo",
    wire(`GET ${TARGET} HTTP/1.1`, [
      WIRE_HOST,
      "Content-Length: 0",
      "Content-Length: 5",
    ]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "cuerpo y framing",
    "Content-Length negativo",
    wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, "Content-Length: -1"]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "cuerpo y framing",
    "Transfer-Encoding en HTTP/1.0",
    wire(`GET ${TARGET} HTTP/1.0`, ["Transfer-Encoding: chunked"], "0\r\n\r\n"),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "cuerpo y framing",
    "POST con cuerpo: el método precede",
    wire(`POST ${TARGET} HTTP/1.1`, [WIRE_HOST, "Content-Length: 5"], "12345"),
    ["POST"],
    [[405]],
  ),
  // Expect.
  wireCase(
    "Expect",
    "100-continue sin cuerpo",
    wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, "Expect: 100-continue", CLOSE]),
    GET_CLOSE,
    [[200]],
  ),
  wireCase(
    "Expect",
    "100-continue con longitud, sin enviar el cuerpo",
    wire(`GET ${TARGET} HTTP/1.1`, [
      WIRE_HOST,
      "Expect: 100-continue",
      "Content-Length: 5",
    ]),
    GET_CLOSE,
    [[400]],
  ),
  wireCase(
    "Expect",
    "100-continue con POST",
    wire(`POST ${TARGET} HTTP/1.1`, [
      WIRE_HOST,
      "Expect: 100-continue",
      "Content-Length: 5",
    ]),
    ["POST"],
    [[405]],
  ),
  wireCase(
    "Expect",
    "otra expectativa",
    wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, "Expect: x-sintetico", CLOSE]),
    GET_CLOSE,
    [[200]],
  ),
  wireCase(
    "Expect",
    "otra expectativa con PUT",
    wire(`PUT ${TARGET} HTTP/1.1`, [WIRE_HOST, "Expect: x-sintetico"]),
    ["PUT"],
    [[405]],
  ),
  // CONNECT y Upgrade.
  wireCase(
    "CONNECT",
    "hacia otra autoridad",
    wire(`CONNECT ${HOST}:${String(PORT)} HTTP/1.1`, [WIRE_HOST]),
    ["CONNECT"],
    [[404]],
  ),
  wireCase(
    "CONNECT",
    "hacia /api/health",
    wire(`CONNECT ${TARGET} HTTP/1.1`, [WIRE_HOST]),
    ["CONNECT"],
    [[405]],
  ),
  wireCase(
    "Upgrade",
    "websocket hacia /api/health",
    wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, ...UPGRADE]),
    GET_CLOSE,
    [[405]],
  ),
  wireCase(
    "Upgrade",
    "websocket de recarga de desarrollo",
    wire("GET /_next/webpack-hmr HTTP/1.1", [WIRE_HOST, ...UPGRADE]),
    GET_CLOSE,
    [[404]],
  ),
  wireCase(
    "Upgrade",
    "h2c hacia un destino que no se delega",
    wire("GET /foo HTTP/1.1", [
      WIRE_HOST,
      "Connection: Upgrade, HTTP2-Settings",
      "Upgrade: h2c",
      "HTTP2-Settings: AAMAAABkAARAAAAAAAIAAAAA",
    ]),
    GET_CLOSE,
    [[404]],
  ),
  wireCase(
    "Upgrade",
    "POST hacia /api/health",
    wire(`POST ${TARGET} HTTP/1.1`, [WIRE_HOST, ...UPGRADE]),
    ["POST"],
    [[405]],
  ),
  // Destinos codificados y variantes.
  ...[
    "/api%2fhealth",
    "/%61pi/health",
    "/api/health%2F",
    "/API/health",
    "//api/health",
    "/api//health",
    "/api/./health",
    "/api/health?x=1",
    "/api/health#x",
    "/api/health;x",
    `http://${HOST}:${String(PORT)}${TARGET}`,
  ].map((target) =>
    wireCase(
      "destino",
      target,
      wire(`GET ${target} HTTP/1.1`, [WIRE_HOST]),
      GET_CLOSE,
      [[404]],
    ),
  ),
  wireCase(
    "destino",
    "OPTIONS *",
    wire("OPTIONS * HTTP/1.1", [WIRE_HOST]),
    ["OPTIONS"],
    [[404]],
  ),
  // Métodos no cubiertos por `checkContract` y respuestas admitidas.
  wireCase(
    "método",
    "PROPFIND",
    wire(`PROPFIND ${TARGET} HTTP/1.1`, [WIRE_HOST]),
    ["PROPFIND"],
    [[405]],
  ),
  wireCase(
    "método",
    "MKCOL",
    wire(`MKCOL ${TARGET} HTTP/1.1`, [WIRE_HOST]),
    ["MKCOL"],
    [[405]],
  ),
  wireCase(
    "método",
    "SEARCH",
    wire(`SEARCH ${TARGET} HTTP/1.1`, [WIRE_HOST]),
    ["SEARCH"],
    [[405]],
  ),
  wireCase(
    "método",
    "HEAD",
    wire(`HEAD ${TARGET} HTTP/1.1`, [WIRE_HOST, CLOSE]),
    ["HEAD"],
    [[200]],
  ),
  wireCase(
    "método",
    "OPTIONS",
    wire(`OPTIONS ${TARGET} HTTP/1.1`, [WIRE_HOST, CLOSE]),
    ["OPTIONS"],
    [[204]],
  ),
  wireCase(
    "método",
    "GET con Accept-Encoding",
    wire(`GET ${TARGET} HTTP/1.1`, [
      WIRE_HOST,
      "Accept-Encoding: gzip, deflate, br",
      CLOSE,
    ]),
    GET_CLOSE,
    [[200]],
  ),
  // Cabeceras de control del framework.
  ...FRAMEWORK_CASES.map(frameworkCase),
  // Canalización: orden, una respuesta por petición, ninguna tras un rechazo
  // y errores de análisis diferidos.
  wireCase(
    "canalización",
    "GET, HEAD, OPTIONS y GET final con cierre",
    [
      wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST]),
      wire(`HEAD ${TARGET} HTTP/1.1`, [WIRE_HOST]),
      wire(`OPTIONS ${TARGET} HTTP/1.1`, [WIRE_HOST]),
      wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, CLOSE]),
    ].join(""),
    ["GET", "HEAD", "OPTIONS", "GET"],
    [[200], [200], [204], [200]],
  ),
  wireCase(
    "canalización",
    "un 405 intermedio corta la conexión",
    [
      wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST]),
      wire(`POST ${TARGET} HTTP/1.1`, [WIRE_HOST]),
      wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST]),
    ].join(""),
    ["GET", "POST", "GET"],
    [[200], [405]],
  ),
  wireCase(
    "canalización",
    "un 404 intermedio corta la conexión",
    [
      wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST]),
      wire("GET /otra HTTP/1.1", [WIRE_HOST]),
      wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST]),
    ].join(""),
    ["GET", "GET", "GET"],
    [[200], [404]],
  ),
  wireCase(
    "canalización",
    "un rechazo inicial no deja delegar la siguiente",
    [
      wire("GET /otra HTTP/1.1", [WIRE_HOST]),
      wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST]),
    ].join(""),
    ["GET", "GET"],
    [[404]],
  ),
  wireCase(
    "canalización",
    "error de análisis diferido con flush",
    `${wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST])}${MALFORMED}`,
    ["GET", "GET"],
    [[200], [400]],
  ),
  wireCase(
    "canalización",
    "error de análisis diferido tras dos pendientes",
    `${wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST])}${wire(`HEAD ${TARGET} HTTP/1.1`, [WIRE_HOST])}${MALFORMED}`,
    ["GET", "HEAD", "GET"],
    [[200], [200], [400]],
  ),
  {
    family: "canalización",
    name: "error de análisis diferido con reinicio del cliente (robustez del descarte)",
    bytes: `${wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST])}${MALFORMED}`,
    dropped: true,
    markers: [],
  },
];

// Un caso de la matriz: sus problemas y su resultado comparable.
async function runWireCase(wireCase) {
  if (wireCase.dropped) {
    // Robustez del descarte: el cliente reinicia la conexión justo después de
    // enviar una petición válida y bytes mal formados. Según la carrera entre
    // los datos y el reinicio, el servidor descarta el diferido (dropped),
    // recibe `ECONNRESET` o no llega a ver la petición; desde fuera no se
    // distingue cuál, y el descarte determinista lo prueba T027. Se exige que
    // el servidor siga atendiendo con el contrato en una conexión nueva y, como
    // en toda la matriz, que no registre nada.
    await wireExchange(wireCase.bytes, { resetAfterWrite: true });
    const health = await wireExchange(
      wire(`GET ${TARGET} HTTP/1.1`, [WIRE_HOST, CLOSE]),
    );
    const served = parseWire(health.data, GET_CLOSE).responses;
    const problems =
      served.length === 1 && served[0]?.status === 200
        ? getProblems(served[0])
        : ["el servidor no atiende después del reinicio"];
    return {
      problems,
      result: JSON.stringify({ served: problems.length === 0 }),
    };
  }
  const exchange = await wireExchange(wireCase.bytes);
  const { responses, leftover } = parseWire(exchange.data, wireCase.methods);
  const problems = [];
  if (responses.length !== wireCase.expect.length) {
    problems.push(
      `${String(responses.length)} respuestas en lugar de ${String(wireCase.expect.length)}`,
    );
  }
  responses.forEach((response, index) => {
    const label = `respuesta ${String(index + 1)}`;
    const allowed = wireCase.expect[index] ?? [];
    if (!allowed.includes(response.status)) {
      problems.push(`${label}: estado ${String(response.status)}`);
    }
    problems.push(
      ...wireResponseProblems(response).map(
        (problem) => `${label}: ${problem}`,
      ),
      ...wireLeaks(response, wireCase.markers).map(
        (problem) => `${label}: ${problem}`,
      ),
    );
  });
  if (leftover > 0) {
    problems.push("bytes adicionales o respuesta incompleta");
  }
  if (exchange.closed !== "cerrada" && exchange.closed !== "reiniciada") {
    problems.push("la conexión no se cerró");
  }
  return { problems, result: comparable(responses, exchange.closed) };
}

// Recorre la matriz en orden, sin registros por petición.
async function runWireMatrix(proc) {
  const mark = proc.output().length;
  const problems = [];
  const results = new Map();
  for (const wireCase of WIRE_CASES) {
    throwIfStopping();
    const { problems: caseProblems, result } = await runWireCase(wireCase);
    results.set(`${wireCase.family}: ${wireCase.name}`, result);
    problems.push(
      ...caseProblems.map(
        (problem) => `${wireCase.family}, ${wireCase.name}: ${problem}`,
      ),
    );
  }
  if (proc.output().slice(mark).trim() !== "") {
    problems.push("se registró algo durante la matriz");
  }
  return { problems, results };
}

// Casos.

// `npm start` o `npm run dev` con una configuración inválida: termina con
// código distinto de 0 en menos de 20 s, el puerto nunca acepta conexiones y
// la salida nombra la clave y el problema sin filtrar nada.
async function invalidStart(
  variables,
  key,
  problem,
  { args = ["start"], cwd = ROOT } = {},
) {
  await ensurePortFree();
  const proc = launch(NPM, args, caseEnvironment(variables), cwd);
  const problems = [];
  try {
    const { opened, timedOut } = await watchNeverOpens(proc);
    if (timedOut) {
      problems.push("no terminó en menos de 20 s");
    }
    if (opened) {
      problems.push("el puerto aceptó conexiones");
    }
  } finally {
    await stop(proc);
  }
  const { code } = await exitResult(proc);
  const output = proc.output();
  if (code === 0) {
    problems.push("terminó con código 0");
  }
  if (!output.includes(key) || !output.includes(problem)) {
    problems.push(`la salida no nombra ${key} y ${problem}`);
  }
  if (hasStartupCompleted(output)) {
    problems.push("se registró startup.completed");
  }
  problems.push(...leakProblems(output));
  const script = args.at(-1);
  problems.push(
    ...configInvalidLogProblems(output, {
      script,
      mode: script === "dev" ? "development" : "production",
    }),
  );
  problems.push(...withDiagnostics(proc, problems, EXPECT_CONFIG_INVALID));
  return problems;
}

// El preflight con un `NODE_ENV` distinto del modo termina con código 1 y
// nombra `NODE_ENV` y `mode_mismatch` sin el valor recibido.
async function preflightMismatch(
  nodeEnv,
  { mode = "start", cwd = ROOT, variables = VALID_CONFIG } = {},
) {
  await ensurePortFree();
  const proc = launch(
    process.execPath,
    ["scripts/preflight.mjs", mode],
    caseEnvironment({ ...variables, NODE_ENV: nodeEnv }),
    cwd,
  );
  const problems = [];
  try {
    const { opened, timedOut } = await watchNeverOpens(proc);
    if (timedOut) {
      problems.push("no terminó en menos de 20 s");
    }
    if (opened) {
      problems.push("el puerto aceptó conexiones");
    }
  } finally {
    await stop(proc);
  }
  const { code } = await exitResult(proc);
  const output = proc.output();
  if (code !== 1) {
    problems.push(`terminó con código ${String(code)} en lugar de 1`);
  }
  problems.push(...mismatchProblems(output, nodeEnv));
  if (hasStartupCompleted(output)) {
    problems.push("el preflight registró startup.completed");
  }
  problems.push(...leakProblems(output));
  problems.push(
    ...configInvalidLogProblems(output, {
      mode: mode === "dev" ? "development" : "production",
    }),
  );
  problems.push(...withDiagnostics(proc, problems, EXPECT_CONFIG_INVALID));
  return problems;
}

// El preflight con una configuración válida termina con código 0 sin escribir
// nada, sin `startup.completed`, que solo registra `server.mjs`, y sin abrir
// el puerto (T031).
async function preflightValid({
  mode = "start",
  cwd = ROOT,
  variables = VALID_CONFIG,
} = {}) {
  await ensurePortFree();
  const proc = launch(
    process.execPath,
    ["scripts/preflight.mjs", mode],
    caseEnvironment({
      ...variables,
      NODE_ENV: mode === "dev" ? "development" : "production",
    }),
    cwd,
  );
  const problems = [];
  try {
    const { opened, timedOut } = await watchNeverOpens(proc);
    if (timedOut) {
      problems.push("no terminó en menos de 20 s");
    }
    if (opened) {
      problems.push("el puerto aceptó conexiones");
    }
  } finally {
    await stop(proc);
  }
  const { code } = await exitResult(proc);
  const output = proc.output();
  if (code !== 0) {
    problems.push(`terminó con código ${String(code)} en lugar de 0`);
  }
  if (hasStartupCompleted(output)) {
    problems.push("registros: el preflight registró startup.completed");
  }
  if (output !== "") {
    problems.push("registros: el preflight válido escribió en la salida");
  }
  problems.push(...leakProblems(output));
  problems.push(...withDiagnostics(proc, problems, EXPECT_SILENCE));
  return problems;
}

// Un rechazo por `NODE_ENV` discordante nombra `NODE_ENV` y `mode_mismatch`
// sin mostrar el valor recibido.
function mismatchProblems(output, nodeEnv) {
  const problems = [];
  if (!output.includes("NODE_ENV") || !output.includes("mode_mismatch")) {
    problems.push("la salida no nombra NODE_ENV y mode_mismatch");
  }
  if (new RegExp(`\\b${nodeEnv}\\b`).test(output)) {
    problems.push("la salida contiene el valor recibido");
  }
  return problems;
}

// Defensa interna de `server.mjs`, ejecutado directamente solo para esta
// comprobación: con `NODE_ENV=test` termina con un código distinto de 0, sin
// abrir el puerto, rechazando `NODE_ENV` con `mode_mismatch` y sin filtrar
// nada. Un `server.mjs` ausente no la satisface.
async function serverDefense() {
  await ensurePortFree();
  const proc = launch(
    process.execPath,
    ["server.mjs"],
    caseEnvironment({
      ...VALID_CONFIG,
      NODE_ENV: "test",
      NEXT_TELEMETRY_DISABLED: "1",
    }),
  );
  const problems = [];
  try {
    const { opened, timedOut } = await watchNeverOpens(proc);
    if (timedOut) {
      problems.push("no terminó en menos de 20 s");
    }
    if (opened) {
      problems.push("el puerto aceptó conexiones");
    }
  } finally {
    await stop(proc);
  }
  const { code } = await exitResult(proc);
  const output = proc.output();
  if (typeof code !== "number" || code === 0) {
    problems.push(`terminó con código ${String(code)}`);
  }
  problems.push(...mismatchProblems(output, "test"));
  if (hasStartupCompleted(output)) {
    problems.push("se registró startup.completed");
  }
  problems.push(...leakProblems(output));
  problems.push(...configInvalidLogProblems(output, { mode: "production" }));
  problems.push(...withDiagnostics(proc, problems, EXPECT_CONFIG_INVALID));
  return problems;
}

// `npm start` válido. Con `full`, recorre el contrato completo; si no, solo
// el `GET` del contrato. En ningún caso se registra nada por las consultas.
async function validStart(variables, full) {
  await ensurePortFree();
  const proc = launch(
    NPM,
    ["start"],
    caseEnvironment({ ...VALID_CONFIG, ...variables }),
  );
  const problems = [];
  try {
    const failure = await waitReady(proc);
    if (failure !== undefined) {
      problems.push(failure);
    } else {
      const mark = proc.output().length;
      if (full) {
        problems.push(...(await checkContract()));
        problems.push(...(await checkProductSurface(true)));
      } else {
        problems.push(...getProblems(await rawRequest("GET", TARGET)));
      }
      if (proc.output().slice(mark).trim() !== "") {
        problems.push("se registró algo por las consultas");
      }
    }
    problems.push(...startupLogProblems(proc.output(), PRODUCTION_STARTUP));
  } finally {
    await stop(proc);
  }
  if (!(await waitUntil(async () => !(await portAccepts()), STOP_LIMIT_MS))) {
    problems.push("el puerto sigue abierto tras detener el servidor");
  }
  problems.push(...withDiagnostics(proc, problems, EXPECT_STARTUP));
  return problems;
}

// Resultados comparables de producción para la equivalencia de T030.
let productionWire;

// `npm start` con la matriz negativa por TCP crudo (T029). Sus resultados
// quedan para compararlos con los de desarrollo (T030).
async function wireStart() {
  await ensurePortFree();
  const proc = launch(NPM, ["start"], caseEnvironment(VALID_CONFIG));
  const problems = [];
  try {
    const failure = await waitReady(proc);
    if (failure !== undefined) {
      problems.push(failure);
    } else {
      const matrix = await runWireMatrix(proc);
      problems.push(...matrix.problems);
      productionWire = matrix.results;
    }
    problems.push(...startupLogProblems(proc.output(), PRODUCTION_STARTUP));
  } finally {
    await stop(proc);
  }
  if (!(await waitUntil(async () => !(await portAccepts()), STOP_LIMIT_MS))) {
    problems.push("el puerto sigue abierto tras detener el servidor");
  }
  problems.push(...withDiagnostics(proc, problems, EXPECT_STARTUP));
  return problems;
}

// Modo desarrollo (T026), en la copia temporal.
const DEVELOPMENT_TARGETS = [
  "/index",
  "/login/",
  "/api/health/",
  "/_next/static/chunks/main.js",
  "/__nextjs_original-stack-frame",
  "/__nextjs_source-map",
];
const DEVELOPMENT_RELOAD = "/_next/webpack-hmr";
const TEST_ONLY_KEY = "AULANORMA_SOLO_PARA_TEST";

function envFile(variables) {
  return Object.entries(variables)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
}

function writeDevelopmentConfig(variables) {
  writeFileSync(
    path.join(developmentCopy, ".env.development.local"),
    envFile(variables),
  );
}

function fingerprint(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// Caché ya poblada para `npm ci`: la que indica npm al proceso o, si no, la
// ruta por defecto de npm. Debe ser un directorio legible.
function sourceNpmCache() {
  const configured = process.env.npm_config_cache;
  const candidate =
    configured !== undefined && configured !== ""
      ? path.resolve(configured)
      : path.join(os.homedir(), ".npm");
  hidePath(candidate, "<caché de npm>");
  try {
    if (!statSync(candidate).isDirectory()) {
      return undefined;
    }
    accessSync(candidate, constants.R_OK | constants.X_OK);
  } catch {
    return undefined;
  }
  return candidate;
}

// Crea la copia con los ficheros regulares que Git no ignora, añade el
// `.env.test` señuelo e instala las dependencias con `npm ci`.
async function prepareDevelopmentCopy() {
  throwIfStopping();
  const cache = sourceNpmCache();
  if (cache === undefined) {
    return {
      ready: false,
      problems: [
        "la caché de npm no existe, no es un directorio o no puede leerse",
      ],
    };
  }
  let files;
  try {
    files = [
      ...new Set(
        gitOutput([
          "ls-files",
          "-z",
          "--cached",
          "--others",
          "--exclude-standard",
        ])
          .toString("utf8")
          .split("\0")
          .filter((name) => name !== ""),
      ),
    ].sort();
  } catch (error) {
    if (error instanceof StopRequested) {
      throw error;
    }
    return {
      ready: false,
      problems: ["no se pudo obtener la lista de ficheros"],
    };
  }
  throwIfStopping();
  try {
    developmentCopy = mkdtempSync(
      path.join(os.tmpdir(), "aulanorma-desarrollo-"),
    );
    hidePath(developmentCopy, "<copia de desarrollo>");
    for (const name of files) {
      const source = path.join(ROOT, name);
      if (!existsSync(source) || !lstatSync(source).isFile()) {
        continue;
      }
      const destination = path.join(developmentCopy, name);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
    writeFileSync(
      path.join(developmentCopy, ".env.test"),
      envFile({ [TEST_ONLY_KEY]: SENTINEL }),
    );
  } catch {
    return { ready: false, problems: ["no se pudo crear la copia"] };
  }
  const manifests = ["package-lock.json", "package.json"].map((name) =>
    path.join(developmentCopy, name),
  );
  let before;
  try {
    before = manifests.map(fingerprint);
  } catch {
    return {
      ready: false,
      problems: ["la copia no contiene package.json y package-lock.json"],
    };
  }
  throwIfStopping();
  // Los registros de `npm ci` van al temporal del arnés, no a la caché real.
  const install = launch(
    NPM,
    ["ci", "--ignore-scripts", "--prefer-offline", "--no-audit", "--no-fund"],
    {
      ...isolatedEnvironment(cache),
      npm_config_logs_dir: path.join(sandbox, "npm-logs"),
    },
    developmentCopy,
  );
  let finished;
  try {
    finished = await waitUntil(
      () => stopping() || !install.running(),
      INSTALL_LIMIT_MS,
    );
  } finally {
    await stop(install);
  }
  throwIfStopping();
  const { code } = await exitResult(install);
  if (!finished) {
    return { ready: false, problems: ["npm ci no terminó a tiempo"] };
  }
  if (code !== 0) {
    return { ready: false, problems: ["npm ci falló"] };
  }
  const problems = [];
  try {
    const after = manifests.map(fingerprint);
    if (after[0] !== before[0]) {
      problems.push("npm ci modificó package-lock.json");
    }
    if (after[1] !== before[1]) {
      problems.push("npm ci modificó package.json");
    }
  } catch {
    problems.push("npm ci eliminó package.json o package-lock.json");
  }
  return { ready: true, problems };
}

// Estado del repositorio original: `git status`, `next-env.d.ts`,
// `tsconfig.json`, los `.env*` de la raíz y un manifiesto completo de `.next`
// (rutas, tipo, tamaño y contenido), sin seguir enlaces simbólicos.
function addEntry(hash, base, relative) {
  const full = path.join(base, relative);
  let stats;
  try {
    stats = lstatSync(full);
  } catch {
    hash.update(`ausente\0${relative}\0`);
    return;
  }
  if (stats.isSymbolicLink()) {
    hash.update(`enlace\0${relative}\0${readlinkSync(full)}\0`);
  } else if (stats.isDirectory()) {
    hash.update(`directorio\0${relative}\0`);
    for (const name of readdirSync(full).sort()) {
      addEntry(hash, base, path.join(relative, name));
    }
  } else if (stats.isFile()) {
    hash.update(`fichero\0${relative}\0${String(stats.size)}\0`);
    hash.update(readFileSync(full));
    hash.update("\0");
  } else {
    hash.update(`otro\0${relative}\0`);
  }
}

function digest(update) {
  const hash = createHash("sha256");
  update(hash);
  return hash.digest("hex");
}

function snapshotOriginal() {
  return {
    "el estado de Git": digest((hash) =>
      hash.update(
        gitOutput([
          "--no-optional-locks",
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=all",
        ]),
      ),
    ),
    "next-env.d.ts": digest((hash) => {
      addEntry(hash, ROOT, "next-env.d.ts");
    }),
    "tsconfig.json": digest((hash) => {
      addEntry(hash, ROOT, "tsconfig.json");
    }),
    "los ficheros .env*": digest((hash) => {
      for (const name of readdirSync(ROOT)
        .filter((entry) => entry.startsWith(".env"))
        .sort()) {
        addEntry(hash, ROOT, name);
      }
    }),
    ".next": digest((hash) => {
      addEntry(hash, ROOT, ".next");
    }),
  };
}

async function developmentInvalidStart(fileVariables, variables, key, problem) {
  writeDevelopmentConfig(fileVariables);
  return invalidStart(variables, key, problem, {
    args: ["run", "dev"],
    cwd: developmentCopy,
  });
}

// `npm run dev` válido: calentamiento con la primera consulta, que compila la
// ruta, y después el `GET` del contrato. Con `full`, también la muestra de
// destinos no exactos y el `Upgrade` de recarga de desarrollo.
async function developmentStart(variables, full) {
  await ensurePortFree();
  writeDevelopmentConfig(DEVELOPMENT_CONFIG);
  const proc = launch(
    NPM,
    ["run", "dev"],
    caseEnvironment(variables),
    developmentCopy,
  );
  const problems = [];
  try {
    const failure = await waitReady(proc);
    if (failure !== undefined) {
      problems.push(failure);
    } else {
      problems.push(
        ...warmupProblems(
          await rawRequest("GET", TARGET, { limitMs: WARMUP_LIMIT_MS }),
        ),
      );
      problems.push(...getProblems(await rawRequest("GET", TARGET)));
      if (full) {
        for (const target of DEVELOPMENT_TARGETS) {
          const response = await rawRequest("GET", target, {
            persistent: true,
          });
          problems.push(
            ...rejectionProblems(response, 404).map(
              (problem) => `GET ${target}: ${problem}`,
            ),
          );
        }
        const upgrade = await rawRequest("GET", DEVELOPMENT_RELOAD, {
          persistent: true,
          headers: [
            "Connection: Upgrade",
            "Upgrade: websocket",
            "Sec-WebSocket-Version: 13",
            `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
          ],
        });
        problems.push(
          ...rejectionProblems(upgrade, 404).map(
            (problem) => `Upgrade ${DEVELOPMENT_RELOAD}: ${problem}`,
          ),
        );
        problems.push(...(await checkProductSurface(false)));
      }
    }
    problems.push(...startupLogProblems(proc.output(), DEVELOPMENT_STARTUP));
  } finally {
    await stop(proc);
  }
  if (!(await waitUntil(async () => !(await portAccepts()), STOP_LIMIT_MS))) {
    problems.push("el puerto sigue abierto tras detener el servidor");
  }
  problems.push(...withDiagnostics(proc, problems, EXPECT_STARTUP));
  return problems;
}

// Diferencias entre el resultado de producción y el de desarrollo de un caso.
function wireDifferences(production, development) {
  const expected = JSON.parse(production);
  const observed = JSON.parse(development);
  if (!("responses" in expected) || !("responses" in observed)) {
    return production === development ? [] : ["resultado"];
  }
  if (expected.responses.length !== observed.responses.length) {
    return ["número de respuestas"];
  }
  const found = new Set();
  expected.responses.forEach((response, index) => {
    const other = observed.responses[index];
    if (response.status !== other.status) {
      found.add("estado");
    }
    if (JSON.stringify(response.headers) !== JSON.stringify(other.headers)) {
      found.add("cabeceras");
    }
    if (response.body !== other.body) {
      found.add("cuerpo");
    }
  });
  if (expected.closed !== observed.closed) {
    found.add("cierre");
  }
  return [...found];
}

// `npm run dev` válido con la misma matriz de T029, tras el calentamiento, y
// su comparación caso a caso con producción (T030): mismos estados, conjunto
// de cabeceras (salvo el valor de `Date`), cuerpos y cierres, sin distinguir
// el cierre ordenado del reinicio (K19), y ningún registro durante la matriz
// en ninguno de los dos modos.
async function developmentEquivalence() {
  await ensurePortFree();
  writeDevelopmentConfig(VALID_CONFIG);
  const proc = launch(
    NPM,
    ["run", "dev"],
    caseEnvironment({}),
    developmentCopy,
  );
  const problems = [];
  try {
    const failure = await waitReady(proc);
    if (failure !== undefined) {
      problems.push(failure);
    } else {
      problems.push(
        ...warmupProblems(
          await rawRequest("GET", TARGET, { limitMs: WARMUP_LIMIT_MS }),
        ),
      );
      const matrix = await runWireMatrix(proc);
      problems.push(
        ...matrix.problems.map((problem) => `desarrollo: ${problem}`),
      );
      if (productionWire === undefined) {
        problems.push("sin resultados de producción para comparar");
      } else {
        for (const [name, result] of matrix.results) {
          const found = wireDifferences(
            productionWire.get(name) ?? "{}",
            result,
          );
          if (found.length > 0) {
            problems.push(
              `${name}: difiere de producción en ${found.join(", ")}`,
            );
          }
        }
      }
    }
    problems.push(...startupLogProblems(proc.output(), DEVELOPMENT_STARTUP));
  } finally {
    await stop(proc);
  }
  if (!(await waitUntil(async () => !(await portAccepts()), STOP_LIMIT_MS))) {
    problems.push("el puerto sigue abierto tras detener el servidor");
  }
  problems.push(...withDiagnostics(proc, problems, EXPECT_STARTUP));
  return problems;
}

const DEVELOPMENT_CASES = [
  [
    "npm run dev inválido: AULANORMA_LOG_LEVEL fuera de la lista en el fichero",
    () =>
      developmentInvalidStart(
        {
          ...PRODUCT_CONFIG,
          AULANORMA_LOG_LEVEL: SENTINEL,
          AULANORMA_ENVIRONMENT: "ci",
        },
        {},
        "AULANORMA_LOG_LEVEL",
        "invalid_value",
      ),
  ],
  [
    "npm run dev inválido: AULANORMA_LOG_LEVEL ausente del fichero",
    () =>
      developmentInvalidStart(
        { ...PRODUCT_CONFIG, AULANORMA_ENVIRONMENT: "ci" },
        {},
        "AULANORMA_LOG_LEVEL",
        "missing",
      ),
  ],
  [
    "npm run dev inválido: AULANORMA_LOG_LEVEL vacía en el proceso sobre un fichero válido",
    () =>
      developmentInvalidStart(
        VALID_CONFIG,
        { AULANORMA_LOG_LEVEL: "" },
        "AULANORMA_LOG_LEVEL",
        "missing",
      ),
  ],
  [
    "preflight dev con NODE_ENV=test",
    () => {
      writeDevelopmentConfig(VALID_CONFIG);
      return preflightMismatch("test", {
        mode: "dev",
        cwd: developmentCopy,
        variables: {},
      });
    },
  ],
  [
    "preflight dev válido: sin salida",
    () => {
      writeDevelopmentConfig(VALID_CONFIG);
      return preflightValid({
        mode: "dev",
        cwd: developmentCopy,
        variables: {},
      });
    },
  ],
  [
    "npm run dev válido: calentamiento, contrato, destinos y Upgrade",
    () => developmentStart({}, true),
  ],
  [
    "npm run dev con NODE_ENV heredado test",
    () => developmentStart({ NODE_ENV: "test" }, false),
  ],
  [
    "npm run dev con NODE_ENV heredado production",
    () => developmentStart({ NODE_ENV: "production" }, false),
  ],
  [
    "npm run dev: matriz y equivalencia contractual con npm start",
    () => developmentEquivalence(),
  ],
];

const CASES = [
  [
    "npm start inválido: AULANORMA_LOG_LEVEL ausente",
    () =>
      invalidStart(
        { ...PRODUCT_CONFIG, AULANORMA_ENVIRONMENT: "ci" },
        "AULANORMA_LOG_LEVEL",
        "missing",
      ),
  ],
  [
    "npm start inválido: AULANORMA_LOG_LEVEL vacía",
    () =>
      invalidStart(
        {
          ...PRODUCT_CONFIG,
          AULANORMA_LOG_LEVEL: "",
          AULANORMA_ENVIRONMENT: "ci",
        },
        "AULANORMA_LOG_LEVEL",
        "missing",
      ),
  ],
  [
    "npm start inválido: AULANORMA_LOG_LEVEL con un valor fuera de la lista",
    () =>
      invalidStart(
        {
          ...PRODUCT_CONFIG,
          AULANORMA_LOG_LEVEL: SENTINEL,
          AULANORMA_ENVIRONMENT: "ci",
        },
        "AULANORMA_LOG_LEVEL",
        "invalid_value",
      ),
  ],
  [
    "npm start inválido: AULANORMA_PUBLIC_ORIGIN ausente",
    () =>
      invalidStart(
        {
          AULANORMA_LOG_LEVEL: "info",
          AULANORMA_ENVIRONMENT: "ci",
          AULANORMA_SESSION_IDLE_MINUTES: "30",
          AULANORMA_SESSION_MAX_HOURS: "12",
          AULANORMA_PDF_MAX_MIB: "32",
          AULANORMA_PDF_MAX_PAGES: "600",
          AULANORMA_GENERATION_MAX_OPERATION_COST: "1000000",
        },
        "AULANORMA_PUBLIC_ORIGIN",
        "missing",
      ),
  ],
  [
    "npm start inválido: AULANORMA_PUBLIC_ORIGIN con el origen HTTP local",
    () =>
      invalidStart(
        { ...VALID_CONFIG, AULANORMA_PUBLIC_ORIGIN: LOCAL_HTTP_ORIGIN },
        "AULANORMA_PUBLIC_ORIGIN",
        "invalid_value",
      ),
  ],
  [
    "npm start inválido: AULANORMA_DATA_DIR con una ruta relativa",
    () =>
      invalidStart(
        { ...VALID_CONFIG, AULANORMA_DATA_DIR: "datos" },
        "AULANORMA_DATA_DIR",
        "invalid_value",
      ),
  ],
  [
    "npm start inválido: clave AULANORMA_ desconocida",
    () =>
      invalidStart(
        { ...VALID_CONFIG, AULANORMA_CLAVE_DESCONOCIDA: SENTINEL },
        "AULANORMA_CLAVE_DESCONOCIDA",
        "unknown_key",
      ),
  ],
  ["preflight start con NODE_ENV=test", () => preflightMismatch("test")],
  [
    "preflight start con NODE_ENV=development",
    () => preflightMismatch("development"),
  ],
  ["preflight start válido: sin salida", () => preflightValid()],
  ["server.mjs directo con NODE_ENV=test", () => serverDefense()],
  [
    "npm start válido: contrato, métodos y destinos",
    () => validStart({}, true),
  ],
  ["npm start: matriz negativa por TCP crudo", () => wireStart()],
  [
    "npm start con NODE_ENV heredado development",
    () => validStart({ NODE_ENV: "development" }, false),
  ],
  [
    "npm start con NODE_ENV heredado test",
    () => validStart({ NODE_ENV: "test" }, false),
  ],
];

// Termina cualquier grupo que siga vivo y comprueba que no queda nada. Revisa
// los grupos registrados hasta que no queda ninguno: cada uno sale de
// `launched` solo cuando se confirma que ya no existe.
async function cleanup() {
  const leftovers = new Set();
  const groupsEnded = await waitUntil(() => {
    for (const child of launched) {
      if (groupAlive(child.pid)) {
        leftovers.add(child.pid);
        signalGroup(child.pid, "SIGKILL");
      } else {
        launched.delete(child);
      }
    }
    return launched.size === 0;
  }, STOP_LIMIT_MS);
  const portClosed = await waitUntil(
    async () => !(await portAccepts()),
    STOP_LIMIT_MS,
  );
  const temporariesRemoved = await waitUntil(removeTemporaries, STOP_LIMIT_MS);
  return {
    leftovers: leftovers.size,
    groupsEnded,
    portClosed,
    temporariesRemoved,
  };
}

// Una única limpieza, compartida por el final de `main` y por las señales.
let cleanupRun;

function cleanupOnce() {
  cleanupRun ??= cleanup();
  return cleanupRun;
}

let failures = 0;

function report(name, problems) {
  if (problems.length === 0) {
    print(`ok  ${name}`);
    return;
  }
  failures += 1;
  print(`ERR ${name}`);
  for (const problem of problems) {
    print(`    - ${problem}`);
  }
}

// Fase de desarrollo: se ejecuta aunque la de producción haya fallado. La
// copia se elimina siempre, y el repositorio original debe quedar idéntico.
async function runDevelopment() {
  throwIfStopping();
  let before;
  try {
    before = snapshotOriginal();
  } catch (error) {
    if (error instanceof StopRequested) {
      throw error;
    }
    before = undefined;
  }
  try {
    const { ready, problems } = await prepareDevelopmentCopy();
    throwIfStopping();
    report("copia de desarrollo: creación, npm ci y manifiestos", problems);
    for (const [index, [name, run]] of DEVELOPMENT_CASES.entries()) {
      throwIfStopping();
      currentCase = CASES.length + index + 1;
      const caseProblems = ready
        ? await run()
        : ["la copia de desarrollo no está disponible"];
      throwIfStopping();
      report(name, caseProblems);
    }
  } finally {
    removeDirectory(developmentCopy);
  }
  throwIfStopping();
  let integrity;
  if (before === undefined) {
    integrity = ["no se pudo capturar el repositorio original antes"];
  } else {
    try {
      const after = snapshotOriginal();
      integrity = Object.keys(before)
        .filter((item) => before[item] !== after[item])
        .map((item) => `cambió ${item} del repositorio original`);
    } catch (error) {
      if (error instanceof StopRequested) {
        throw error;
      }
      integrity = ["no se pudo capturar el repositorio original después"];
    }
  }
  report("repositorio original intacto durante el modo desarrollo", integrity);
}

async function main() {
  const present = PRODUCTION_ENV_FILES.filter((name) =>
    existsSync(path.join(ROOT, name)),
  );
  if (present.length > 0) {
    print(
      `La prueba de humo se niega a ejecutarse: existen ficheros de entorno de producción (${present.join(", ")}). Elimínalos o muévelos fuera del repositorio.`,
    );
    return 1;
  }
  searchPath = process.env.PATH;
  if (searchPath === undefined || searchPath === "") {
    print(
      "La prueba de humo no puede ejecutarse: falta PATH o está vacío, y sin él no se localizan npm ni node.",
    );
    return 1;
  }
  try {
    throwIfStopping();
    createSandbox();
    for (const [index, [name, run]] of CASES.entries()) {
      throwIfStopping();
      currentCase = index + 1;
      const problems = await run();
      throwIfStopping();
      report(name, problems);
    }
    throwIfStopping();
    await runDevelopment();
  } catch (error) {
    if (!stopping()) {
      failures += 1;
      print(
        error instanceof FatalError
          ? error.message
          : "La prueba de humo se interrumpió por un error inesperado.",
      );
    }
  } finally {
    const { leftovers, groupsEnded, portClosed, temporariesRemoved } =
      await cleanupOnce();
    // Tras una señal, el grupo del caso en curso sigue vivo por diseño; solo
    // es un fallo si la limpieza no consigue terminarlo.
    if (leftovers > 0 && !stopping()) {
      failures += 1;
      print(`ERR quedaban ${String(leftovers)} grupos de procesos vivos`);
    }
    if (!groupsEnded) {
      failures += 1;
      print(`ERR siguen vivos ${String(launched.size)} grupos de procesos`);
    }
    if (!portClosed) {
      failures += 1;
      print(`ERR el puerto ${HOST}:${String(PORT)} sigue abierto`);
    }
    if (!temporariesRemoved) {
      failures += 1;
      print("ERR no se pudieron eliminar los temporales del arnés");
    }
  }
  if (stopping()) {
    print(`Prueba de humo interrumpida por ${stopSignal}.`);
    return STOP_CODES[stopSignal];
  }
  print(
    failures === 0
      ? `Prueba de humo superada: ${String(CASES.length + DEVELOPMENT_CASES.length)} casos.`
      : `Prueba de humo fallida: ${String(failures)} fallos.`,
  );
  return failures === 0 ? 0 : 1;
}

// La primera señal marca la detención y fija el código; todas comparten la
// misma limpieza. El código de salida se establece cuando esta termina, sin
// `process.exit`, para no interrumpirla.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopSignal ??= signal;
    void cleanupOnce().then(() => {
      process.exitCode = STOP_CODES[stopSignal];
    });
  });
}

process.exitCode = await main();
