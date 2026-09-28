// Prueba de humo de los puntos de entrada admitidos (FR-004, FR-005, FR-006,
// FR-008 y FR-009; plan.md, «Estrategia de pruebas»; research.md, R8).
// Node.js sin dependencias. Se ejecuta desde `npm run check:build`, después de
// `next build`.
//
// Esta parte (T025) contiene la infraestructura común y el modo producción con
// `npm start`. T026 añade el modo desarrollo, T029 la matriz negativa por TCP
// crudo, T030 la equivalencia entre modos y T031 la auditoría de registros.
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
//   `startup.completed` y puerto), siempre con un límite de tiempo;
// - se niega a ejecutarse si existen ficheros `.env*` de producción;
// - todo lo que imprime pasa antes por `redact`, sin valores sintéticos ni
//   rutas locales.
//
// No arranca `next start` ni `next dev`, que no están admitidos (T032).
// `server.mjs` solo se ejecuta directamente para comprobar su defensa interna.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

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
const POLL_MS = 10;

const PRODUCTION_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

const SENTINEL = `centinela-${randomUUID()}`;
const VALID_CONFIG = {
  AULANORMA_LOG_LEVEL: "info",
  AULANORMA_ENVIRONMENT: "ci",
};
const VERSION = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf8"),
).version;

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

function leakProblems(output) {
  const problems = [];
  if (output.includes(SENTINEL)) {
    problems.push("la salida contiene el valor centinela");
  }
  if (
    output.includes(ROOT) ||
    output.includes(os.homedir()) ||
    sandboxPaths.some((value) => output.includes(value)) ||
    ABSOLUTE_PATH.test(output)
  ) {
    problems.push("la salida contiene una ruta absoluta");
  }
  if (ENV_FILE_NAME.test(output)) {
    problems.push("la salida nombra un fichero .env");
  }
  if (STACK_TRACE.test(output)) {
    problems.push("la salida contiene una traza");
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

// Entorno de cada caso, construido desde cero: `PATH` del proceso padre, los
// directorios aislados del temporal del arnés, el aviso de actualización de
// npm desactivado y las variables del caso. Nada más se hereda.
let searchPath;
let sandbox;
const sandboxPaths = [];

function createSandbox() {
  sandbox = mkdtempSync(path.join(os.tmpdir(), "aulanorma-humo-"));
  sandboxPaths.push(sandbox, realOrSelf(sandbox));
  for (const value of sandboxPaths) {
    protect(value, "<temporal del arnés>");
  }
  for (const directory of ["home", "tmp", "npm-cache"]) {
    mkdirSync(path.join(sandbox, directory));
  }
}

function removeSandbox() {
  if (sandbox === undefined) {
    return true;
  }
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    // Se informa abajo.
  }
  return !existsSync(sandbox);
}

function caseEnvironment(variables) {
  return {
    PATH: searchPath,
    HOME: path.join(sandbox, "home"),
    TMPDIR: path.join(sandbox, "tmp"),
    npm_config_cache: path.join(sandbox, "npm-cache"),
    npm_config_update_notifier: "false",
    ...variables,
  };
}

// Procesos: cada uno en su propio grupo, con su salida en memoria.
const launched = new Set();

function launch(command, args, environment) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: environment,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  launched.add(child);
  let output = "";
  let running = true;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
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
  };
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
  await proc.exited;
  launched.delete(proc.child);
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
  if (await portAccepts()) {
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
    if (await portAccepts()) {
      opened = true;
    }
    await delay(POLL_MS);
  }
  const timedOut = proc.running();
  if (await portAccepts()) {
    opened = true;
  }
  return { opened, timedOut };
}

async function waitReady(proc) {
  const deadline = Date.now() + READY_LIMIT_MS;
  while (Date.now() < deadline) {
    if (!proc.running()) {
      return "el proceso terminó antes de estar listo";
    }
    if (hasStartupCompleted(proc.output()) && (await portAccepts())) {
      return undefined;
    }
    await delay(POLL_MS);
  }
  return "el proceso no estuvo listo a tiempo";
}

// Cliente TCP crudo: estado, cabeceras en su orden, cuerpo, cierre de la
// conexión y ausencia de respuesta. Las peticiones que deben rechazarse se
// envían como HTTP/1.1 persistente, sin `Connection: close`, para que el cierre
// y su cabecera los decida el servidor y no el cliente.
function rawRequest(method, target, { persistent = false } = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    const socket = net.connect({ host: HOST, port: PORT });
    const finish = (closed) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(parseResponse(Buffer.concat(chunks), closed));
    };
    socket.setTimeout(RESPONSE_LIMIT_MS, () => finish(false));
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.once("end", () => finish(true));
    socket.once("close", () => finish(true));
    socket.once("error", () => finish(true));
    socket.once("connect", () => {
      socket.write(
        `${method} ${target} HTTP/1.1\r\nHost: ${HOST}:${String(PORT)}\r\n${persistent ? "" : "Connection: close\r\n"}\r\n`,
      );
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

const NON_EXACT_TARGETS = [
  "/",
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

// Casos.

// `npm start` con una configuración inválida: termina con código distinto de 0
// en menos de 20 s, el puerto nunca acepta conexiones y la salida nombra la
// clave y el problema sin filtrar nada.
async function invalidStart(variables, key, problem) {
  await ensurePortFree();
  const proc = launch(NPM, ["start"], caseEnvironment(variables));
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
  const { code } = await proc.exited;
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
  return problems;
}

// El preflight con un `NODE_ENV` distinto del modo termina con código 1 y
// nombra `NODE_ENV` y `mode_mismatch` sin el valor recibido.
async function preflightMismatch(nodeEnv) {
  await ensurePortFree();
  const proc = launch(
    process.execPath,
    ["scripts/preflight.mjs", "start"],
    caseEnvironment({ ...VALID_CONFIG, NODE_ENV: nodeEnv }),
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
  const { code } = await proc.exited;
  const output = proc.output();
  if (code !== 1) {
    problems.push(`terminó con código ${String(code)} en lugar de 1`);
  }
  if (!output.includes("NODE_ENV") || !output.includes("mode_mismatch")) {
    problems.push("la salida no nombra NODE_ENV y mode_mismatch");
  }
  if (new RegExp(`\\b${nodeEnv}\\b`).test(output)) {
    problems.push("la salida contiene el valor recibido");
  }
  if (hasStartupCompleted(output)) {
    problems.push("el preflight registró startup.completed");
  }
  problems.push(...leakProblems(output));
  return problems;
}

// Defensa interna de `server.mjs`, ejecutado directamente solo para esta
// comprobación: con `NODE_ENV=test` termina sin abrir el puerto.
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
  const { code } = await proc.exited;
  if (code === 0) {
    problems.push("terminó con código 0");
  }
  if (hasStartupCompleted(proc.output())) {
    problems.push("se registró startup.completed");
  }
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
      } else {
        problems.push(...getProblems(await rawRequest("GET", TARGET)));
      }
      if (proc.output().slice(mark).trim() !== "") {
        problems.push("se registró algo por las consultas");
      }
    }
  } finally {
    await stop(proc);
  }
  if (!(await waitUntil(async () => !(await portAccepts()), STOP_LIMIT_MS))) {
    problems.push("el puerto sigue abierto tras detener el servidor");
  }
  return problems;
}

const CASES = [
  [
    "npm start inválido: AULANORMA_LOG_LEVEL ausente",
    () =>
      invalidStart(
        { AULANORMA_ENVIRONMENT: "ci" },
        "AULANORMA_LOG_LEVEL",
        "missing",
      ),
  ],
  [
    "npm start inválido: AULANORMA_LOG_LEVEL vacía",
    () =>
      invalidStart(
        { AULANORMA_LOG_LEVEL: "", AULANORMA_ENVIRONMENT: "ci" },
        "AULANORMA_LOG_LEVEL",
        "missing",
      ),
  ],
  [
    "npm start inválido: AULANORMA_LOG_LEVEL con un valor fuera de la lista",
    () =>
      invalidStart(
        { AULANORMA_LOG_LEVEL: SENTINEL, AULANORMA_ENVIRONMENT: "ci" },
        "AULANORMA_LOG_LEVEL",
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
  ["server.mjs directo con NODE_ENV=test", () => serverDefense()],
  [
    "npm start válido: contrato, métodos y destinos",
    () => validStart({}, true),
  ],
  [
    "npm start con NODE_ENV heredado development",
    () => validStart({ NODE_ENV: "development" }, false),
  ],
  [
    "npm start con NODE_ENV heredado test",
    () => validStart({ NODE_ENV: "test" }, false),
  ],
];

// Termina cualquier grupo que siga vivo y comprueba que no queda nada.
async function cleanup() {
  const leftovers = [];
  for (const child of launched) {
    if (groupAlive(child.pid)) {
      leftovers.push(child.pid);
      signalGroup(child.pid, "SIGKILL");
    }
  }
  launched.clear();
  const portClosed = await waitUntil(
    async () => !(await portAccepts()),
    STOP_LIMIT_MS,
  );
  const sandboxRemoved = await waitUntil(removeSandbox, STOP_LIMIT_MS);
  return { leftovers: leftovers.length, portClosed, sandboxRemoved };
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
  let failures = 0;
  try {
    createSandbox();
    for (const [name, run] of CASES) {
      const problems = await run();
      if (problems.length === 0) {
        print(`ok  ${name}`);
      } else {
        failures += 1;
        print(`ERR ${name}`);
        for (const problem of problems) {
          print(`    - ${problem}`);
        }
      }
    }
  } catch (error) {
    failures += 1;
    print(
      error instanceof FatalError
        ? error.message
        : "La prueba de humo se interrumpió por un error inesperado.",
    );
  } finally {
    const { leftovers, portClosed, sandboxRemoved } = await cleanup();
    if (leftovers > 0) {
      failures += 1;
      print(`ERR quedaban ${String(leftovers)} grupos de procesos vivos`);
    }
    if (!portClosed) {
      failures += 1;
      print(`ERR el puerto ${HOST}:${String(PORT)} sigue abierto`);
    }
    if (!sandboxRemoved) {
      failures += 1;
      print("ERR no se pudo eliminar el temporal del arnés");
    }
  }
  print(
    failures === 0
      ? `Prueba de humo superada: ${String(CASES.length)} casos.`
      : `Prueba de humo fallida: ${String(failures)} fallos.`,
  );
  return failures === 0 ? 0 : 1;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void cleanup().finally(() => {
      process.exit(130);
    });
  });
}

process.exitCode = await main();
