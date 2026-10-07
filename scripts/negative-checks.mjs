// Pruebas negativas locales (`npm run verify:negative [categoría…]`; T053;
// plan.md, "Diseño de las pruebas negativas"; FR-011 y FR-012). Es un
// procedimiento de aceptación local, no un control: ningún workflow lo ejecuta.
// Node.js sin dependencias.
//
// Sin argumentos verifica las ocho categorías en orden canónico (`format`,
// `lint`, `types`, `test`, `build`, `secrets`, `dependencies` y `workflows`).
// Un nombre desconocido o repetido termina con código 2 antes de crear nada.
//
// Por cada categoría (y por cada subcaso de secretos):
// 1. crea con `fs.mkdtemp` una copia con los ficheros regulares de
//    `git ls-files --cached --others --exclude-standard`, sin ignorados, sin
//    enlaces simbólicos (tampoco de directorios intermedios) y sin borrados;
// 2. inicializa en ella un repositorio Git desechable con un commit base, con
//    identidad sintética de `example.invalid` y configuración aislada, sin
//    hooks ni firma;
// 3. copia, si la categoría la usa, la herramienta de `.tools/bin` sin seguir
//    enlaces; el control de la copia verifica después su SHA-256;
// 4. instala las dependencias con
//    `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`;
// 5. aplica una única alteración sintética y ejecuta solo el comando de su
//    categoría;
// 6. exige que falle por la causa esperada y en la ubicación esperada: un
//    código distinto de cero sin esa causa hace fallar el procedimiento. Los
//    fallos colaterales se registran, pero nunca sustituyen a la causa;
// 7. elimina la copia en `finally`.
//
// Secretos tiene tres subcasos, cada uno con su copia y un token sintético con
// formato de token personal de GitHub generado en ese momento con un
// generador criptográfico: (a) en un commit y (b) en un fichero nuevo sin
// seguimiento, que deben fallar, y (c) solo en `.env.development.local`,
// ignorado, que debe terminar con éxito (exclusión positiva, no una novena
// prueba negativa). El token nunca se escribe fuera de la copia ni se muestra.
//
// Al principio registra `HEAD` y `git status` del repositorio original, y la
// firma (tipo, tamaño, inodo y fecha de modificación, sin leer su contenido)
// de rutas ignoradas que una alteración podría tocar; al final falla si algo
// ha cambiado. La salida solo muestra causas, ubicaciones relativas y fallos
// colaterales, nunca la salida completa de los comandos.
//
// Cada proceso se ejecuta en su propio grupo con un tiempo máximo y se termina
// completo. SIGINT o SIGTERM detienen el proceso en curso, no inician
// categorías nuevas y eliminan las copias antes de salir con 130 o 143.
//
// La categoría de dependencias necesita el registro de npm; las demás usan la
// caché de npm ya poblada (`npm_config_cache` o la de por defecto).
import { spawn } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

const CATEGORIES = [
  "format",
  "lint",
  "types",
  "test",
  "build",
  "secrets",
  "dependencies",
  "workflows",
];

const GIT_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 600_000;
const COMMAND_TIMEOUT_MS = 900_000;
const STOP_GRACE_MS = 5_000;
const OUTPUT_LIMIT = 32 * 1024 * 1024;
const STOP_CODES = { SIGINT: 130, SIGTERM: 143 };

// Rutas ignoradas del original que una alteración o un comando podrían tocar.
const IGNORED_PATHS = [
  ".env.development.local",
  ".next",
  "node_modules",
  ".tools",
  ".tools/bin",
  ".tools/bin/gitleaks",
  ".tools/bin/zizmor",
];

const GIT_CONFIG = [
  "[core]",
  "\thooksPath = /dev/null",
  "[commit]",
  "\tgpgSign = false",
  "[tag]",
  "\tgpgSign = false",
  "[init]",
  "\tdefaultBranch = main",
  "",
].join("\n");

// Secuencias de color ANSI, por si alguna herramienta las emite pese a
// `NO_COLOR`.
const ANSI_COLOR = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");

const TOKEN_CHARACTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Error del procedimiento con un mensaje apto para mostrarse.
class NegativeError extends Error {}

class StopRequested extends Error {}

let stopSignal;

function throwIfStopping() {
  if (stopSignal !== undefined) {
    throw new StopRequested();
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Sustituye los caracteres de control para que la salida no altere el
// terminal.
function printable(value) {
  return Array.from(String(value), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? "?" : character;
  }).join("");
}

// Token sintético con formato de token personal de GitHub: prefijo y 36
// caracteres alfanuméricos elegidos con un generador criptográfico. Nunca ha
// sido una credencial.
function syntheticToken() {
  let body = "";
  while (body.length < 36) {
    body += TOKEN_CHARACTERS[randomInt(TOKEN_CHARACTERS.length)];
  }
  return `ghp_${body}`;
}

// --- Procesos ---

const running = new Set();

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Termina todo el grupo del proceso: SIGTERM y, si sigue vivo tras el margen,
// SIGKILL.
async function terminateGroup(pid) {
  if (!signalGroup(pid, "SIGTERM")) {
    return;
  }
  const deadline = Date.now() + STOP_GRACE_MS;
  while (Date.now() < deadline) {
    await delay(100);
    if (!signalGroup(pid, 0)) {
      return;
    }
  }
  signalGroup(pid, "SIGKILL");
}

// Ejecuta un proceso en su propio grupo, con salida conjunta limitada y
// tiempo máximo. Al terminar se eliminan también los procesos del grupo que
// hubieran quedado vivos.
function execute(command, args, { cwd, env, timeout }) {
  throwIfStopping();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    running.add(child);
    const chunks = [];
    let size = 0;
    let truncated = false;
    let timedOut = false;
    const collect = (chunk) => {
      if (size + chunk.length > OUTPUT_LIMIT) {
        truncated = true;
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => {
      timedOut = true;
      void terminateGroup(child.pid);
    }, timeout);
    let finished = false;
    const finish = (code) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      running.delete(child);
      const settle = () => {
        resolve({
          code,
          timedOut,
          truncated,
          output: Buffer.concat(chunks).toString("utf8"),
        });
      };
      if (child.pid !== undefined && signalGroup(child.pid, 0)) {
        void terminateGroup(child.pid).then(settle);
      } else {
        settle();
      }
    };
    child.once("error", () => {
      finish(null);
    });
    child.once("close", (code) => {
      finish(code);
    });
  });
}

// --- Repositorio original ---

function originalEnvironment(session) {
  return {
    PATH: process.env.PATH ?? "",
    HOME: path.join(session, "home"),
    TMPDIR: path.join(session, "tmp"),
    GIT_CONFIG_GLOBAL: path.join(session, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
}

async function gitOriginal(session, args) {
  const result = await execute("git", args, {
    cwd: ROOT,
    env: originalEnvironment(session),
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.code !== 0 || result.timedOut || result.truncated) {
    throw new NegativeError(
      `git ${args[0]} no pudo completarse en el repositorio original.`,
    );
  }
  return result.output;
}

async function signature(relative) {
  try {
    const stats = await lstat(path.join(ROOT, relative));
    const type = stats.isSymbolicLink()
      ? "enlace"
      : stats.isDirectory()
        ? "directorio"
        : stats.isFile()
          ? "fichero"
          : "otro";
    return `${relative}:${type}:${String(stats.size)}:${String(stats.ino)}:${String(stats.mtimeMs)}`;
  } catch (error) {
    if (error.code === "ENOENT") {
      return `${relative}:ausente`;
    }
    throw new NegativeError(`No se pudo comprobar ${relative} en el original.`);
  }
}

async function originalState(session) {
  const head = (
    await gitOriginal(session, ["rev-parse", "--verify", "HEAD"])
  ).trim();
  const status = await gitOriginal(session, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const ignored = [];
  for (const relative of IGNORED_PATHS) {
    ignored.push(await signature(relative));
  }
  return { head, status, ignored: ignored.join("\n") };
}

// Ficheros regulares no ignorados del original, sin atravesar enlaces.
async function sourceFiles(session) {
  const listed = [
    ...new Set(
      (
        await gitOriginal(session, [
          "ls-files",
          "-z",
          "--cached",
          "--others",
          "--exclude-standard",
        ])
      )
        .split("\0")
        .filter((name) => name !== ""),
    ),
  ].sort();
  const files = [];
  for (const relative of listed) {
    if (await isRegularWithoutLinks(relative)) {
      files.push(relative);
    }
  }
  return files;
}

async function isRegularWithoutLinks(relative) {
  const segments = relative.split("/");
  if (segments.some((segment) => segment === "" || segment === "..")) {
    return false;
  }
  for (const [index] of segments.entries()) {
    let stats;
    try {
      stats = await lstat(path.join(ROOT, ...segments.slice(0, index + 1)));
    } catch {
      return false;
    }
    const last = index === segments.length - 1;
    if (
      stats.isSymbolicLink() ||
      (last ? !stats.isFile() : !stats.isDirectory())
    ) {
      return false;
    }
  }
  return true;
}

// Caché de npm ya poblada: la que indica el entorno o la de por defecto.
async function npmCache() {
  const configured = process.env.npm_config_cache;
  const cache =
    configured !== undefined && configured !== ""
      ? path.resolve(configured)
      : path.join(homedir(), ".npm");
  try {
    if (!(await stat(cache)).isDirectory()) {
      throw new Error("no es un directorio");
    }
  } catch {
    throw new NegativeError(
      "La caché de npm no existe o no es un directorio: ejecuta npm ci en el repositorio.",
    );
  }
  return cache;
}

// --- Copias ---

function copyEnvironment(work, cache) {
  return {
    PATH: process.env.PATH ?? "",
    HOME: path.join(work, "home"),
    TMPDIR: path.join(work, "tmp"),
    npm_config_cache: cache,
    npm_config_logs_dir: path.join(work, "npm-logs"),
    npm_config_update_notifier: "false",
    NO_COLOR: "1",
    GIT_CONFIG_GLOBAL: path.join(work, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "AulaNorma Negative Checks",
    GIT_AUTHOR_EMAIL: "negative-checks@example.invalid",
    GIT_COMMITTER_NAME: "AulaNorma Negative Checks",
    GIT_COMMITTER_EMAIL: "negative-checks@example.invalid",
  };
}

async function checked(label, result) {
  if (result.code !== 0 || result.timedOut || result.truncated) {
    throw new NegativeError(`${label} no pudo completarse en la copia.`);
  }
  return result.output;
}

function gitCopy(copy, args) {
  return execute("git", args, {
    cwd: copy.dir,
    env: copy.env,
    timeout: GIT_TIMEOUT_MS,
  }).then((result) => checked(`git ${args[0]}`, result));
}

async function copyTool(copy, name) {
  const missing = `Falta .tools/bin/${name} o no es un fichero regular: ejecuta npm run tools:install.`;
  for (const relative of [".tools", ".tools/bin"]) {
    let stats;
    try {
      stats = await lstat(path.join(ROOT, relative));
    } catch {
      throw new NegativeError(missing);
    }
    if (!stats.isDirectory()) {
      throw new NegativeError(".tools o .tools/bin no es un directorio real.");
    }
  }
  let handle;
  try {
    handle = await open(
      path.join(ROOT, ".tools/bin", name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch {
    throw new NegativeError(missing);
  }
  let data;
  try {
    if (!(await handle.stat()).isFile()) {
      throw new NegativeError(missing);
    }
    data = await handle.readFile();
  } finally {
    await handle.close();
  }
  const destination = path.join(copy.dir, ".tools/bin", name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data, { mode: 0o755, flag: "wx" });
  await chmod(destination, 0o755);
}

async function prepareCopy(work, files, cache, tool) {
  const dir = path.join(work, "repo");
  const copy = { dir, env: copyEnvironment(work, cache) };
  for (const directory of ["home", "tmp", "npm-logs", "repo"]) {
    await mkdir(path.join(work, directory));
  }
  await writeFile(path.join(work, "gitconfig"), GIT_CONFIG);
  for (const relative of files) {
    throwIfStopping();
    const source = path.join(ROOT, relative);
    const destination = path.join(dir, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    await chmod(destination, (await lstat(source)).mode & 0o777);
  }
  await gitCopy(copy, ["init", "--quiet"]);
  await gitCopy(copy, ["add", "--all"]);
  await gitCopy(copy, ["commit", "--quiet", "--no-verify", "-m", "base"]);
  if (tool !== undefined) {
    await copyTool(copy, tool);
  }
  await checked(
    "npm ci",
    await execute(
      "npm",
      ["ci", "--ignore-scripts", "--prefer-offline", "--no-audit", "--no-fund"],
      { cwd: dir, env: copy.env, timeout: INSTALL_TIMEOUT_MS },
    ),
  );
  return copy;
}

async function writeInCopy(copy, relative, content) {
  const target = path.join(copy.dir, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { flag: "wx" });
}

async function appendInCopy(copy, relative, content) {
  const target = path.join(copy.dir, relative);
  await writeFile(target, `${await readFile(target, "utf8")}${content}`);
}

// --- Categorías ---

const VERSION_MODULE = "src/platform/version/index.ts";
const LINT_FILE = "src/modules/normative-source/violation.ts";
const TEST_FILE = "tests/unit/negative.test.ts";
// Ruta de producto sin declarar (specs/002-boe-scorm-export, T026; ADR 0004).
const ROUTE_FILE = "src/pages/negative-route.ts";
const ROUTE_TEST = "tests/architecture/public-routes.test.ts";
const ROUTE_TEST_NAME =
  "lista cerrada de rutas > src/pages contiene exactamente los ficheros de la lista";
const BUILD_PAGE = "src/pages/negative-build.tsx";
const BUILD_ROUTE = "/negative-build";
const SECRET_FILE = "negative-secret.txt";
const IGNORED_SECRET_FILE = ".env.development.local";
const WORKFLOW_FILE = ".github/workflows/negative-test.yml";

// Líneas de `output` que cumplen `pattern`, sin la que ya es la causa.
function collateral(output, pattern, expected) {
  return output
    .split("\n")
    .filter((line) => pattern.test(line) && !expected.test(line))
    .map((line) => printable(line.trim()));
}

function lintLocations(output, copyDir) {
  // ESLint encabeza los errores de cada fichero con su ruta absoluta.
  const prefix = `${copyDir}/`;
  const found = [];
  let file = "";
  for (const line of output.split("\n")) {
    if (line.startsWith(prefix)) {
      file = line.slice(prefix.length).trim();
    } else if (/^\s+\d+:\d+\s+error\s/.test(line)) {
      found.push({ file, line: line.trim() });
    }
  }
  return found;
}

// Bloques de la salida de `check:secrets`: la cabecera de cada análisis y sus
// líneas de hallazgos. `undefined` si falta alguna cabecera.
function secretsBlocks(output) {
  const headers = {
    history: /^Historial alcanzable desde HEAD: /,
    index: /^Índice de Git: /,
    tree: /^Árbol de trabajo \(\d+ fichero\(s\) modificados o nuevos\): /,
  };
  const blocks = {};
  let current;
  for (const line of output.split("\n")) {
    const name = Object.keys(headers).find((key) => headers[key].test(line));
    if (name !== undefined) {
      current = name;
      blocks[name] = [line];
    } else if (current !== undefined && line.startsWith("  huella ")) {
      blocks[current].push(line);
    } else {
      current = undefined;
    }
  }
  return Object.keys(headers).every((key) => blocks[key] !== undefined)
    ? blocks
    : undefined;
}

// Cada caso devuelve el comando, la alteración y la evaluación de su salida.
// `evaluate` devuelve la causa y la ubicación comprobadas, o `problem` si la
// salida no las contiene.
const CASES = {
  format: () => ({
    label: "format",
    command: "check:format",
    alter: (copy) =>
      appendInCopy(copy, VERSION_MODULE, "\nconst  sample={a:1}\n"),
    evaluate: ({ code, output }) => {
      const location = new RegExp(
        `^\\[warn\\] ${escapeRegExp(VERSION_MODULE)}$`,
        "m",
      );
      if (
        code === 0 ||
        !location.test(output) ||
        !output.includes("Code style issues found")
      ) {
        return { problem: "Prettier no señala el módulo alterado." };
      }
      return {
        cause:
          "Prettier: el fichero no cumple el formato (Code style issues found)",
        location: VERSION_MODULE,
        collateral: collateral(
          output,
          /^\[warn\] (?!Code style issues)/,
          location,
        ),
      };
    },
  }),

  lint: () => ({
    label: "lint",
    command: "check:lint",
    alter: (copy) =>
      writeInCopy(copy, LINT_FILE, 'import "@/modules/content-export";\n'),
    evaluate: ({ code, output }, copy) => {
      const errors = lintLocations(output, copy.realDir);
      const expected = errors.find(
        (error) =>
          error.file === LINT_FILE &&
          /'@\/modules\/content-export'/.test(error.line) &&
          /\sno-restricted-imports$/.test(error.line),
      );
      if (code === 0 || expected === undefined) {
        return {
          problem: `ESLint no señala no-restricted-imports en ${LINT_FILE}.`,
        };
      }
      const [position] = expected.line.split(/\s+/);
      return {
        cause:
          "ESLint: no-restricted-imports (normative-source importa @/modules/content-export)",
        location: `${LINT_FILE}:${position}`,
        collateral: errors
          .filter((error) => error !== expected)
          .map((error) => printable(`${error.file} ${error.line}`)),
      };
    },
  }),

  types: () => ({
    label: "types",
    command: "check:types",
    alter: (copy) =>
      appendInCopy(
        copy,
        VERSION_MODULE,
        '\nexport const sample: number = "text";\n',
      ),
    evaluate: ({ code, output }) => {
      const location = new RegExp(
        `^${escapeRegExp(VERSION_MODULE)}\\((\\d+),(\\d+)\\): error TS2322: `,
        "m",
      );
      const match = location.exec(output);
      if (code === 0 || match === null) {
        return { problem: `TypeScript no señala TS2322 en ${VERSION_MODULE}.` };
      }
      return {
        cause: "TypeScript: TS2322 (string no es asignable a number)",
        location: `${VERSION_MODULE}:${match[1]}:${match[2]}`,
        collateral: collateral(output, /: error TS\d+: /, location),
      };
    },
  }),

  test: () => ({
    label: "test",
    command: "check:test",
    alter: (copy) =>
      writeInCopy(
        copy,
        TEST_FILE,
        [
          'import { expect, test } from "vitest";',
          "",
          'test("prueba negativa sintética", () => {',
          "  expect(1).toBe(2);",
          "});",
          "",
        ].join("\n"),
      ),
    evaluate: ({ code, output }) => {
      const location = new RegExp(
        `FAIL\\s+${escapeRegExp(TEST_FILE)} > prueba negativa sintética`,
      );
      if (
        code === 0 ||
        !location.test(output) ||
        !output.includes("AssertionError: expected 1 to be 2")
      ) {
        return { problem: `Vitest no señala el fallo de ${TEST_FILE}.` };
      }
      return {
        cause: "Vitest: AssertionError: expected 1 to be 2",
        location: `${TEST_FILE} > prueba negativa sintética`,
        collateral: [
          ...new Set(
            collateral(
              output,
              /^\s*FAIL\s+\S/,
              new RegExp(escapeRegExp(TEST_FILE)),
            ),
          ),
        ],
      };
    },
  }),

  // Una página nueva que no está en la lista cerrada de la superficie: las
  // pruebas de arquitectura deben rechazarla aunque compile y no la delegue la
  // frontera.
  "test-undeclared-route": () => ({
    label: "test (b) ruta de producto sin declarar",
    command: "check:test",
    alter: (copy) =>
      writeInCopy(
        copy,
        ROUTE_FILE,
        "export default function NegativeRoute(): null {\n  return null;\n}\n",
      ),
    evaluate: ({ code, output }) => {
      const location = new RegExp(
        `FAIL\\s+${escapeRegExp(ROUTE_TEST)} > ${escapeRegExp(ROUTE_TEST_NAME)}`,
      );
      if (
        code === 0 ||
        !location.test(output) ||
        !output.includes(ROUTE_FILE)
      ) {
        return {
          problem: `Vitest no señala la ruta sin declarar ${ROUTE_FILE}.`,
        };
      }
      return {
        cause: `Vitest: ${ROUTE_FILE} no está en la lista cerrada de rutas`,
        location: `${ROUTE_TEST} > ${ROUTE_TEST_NAME}`,
        collateral: [
          ...new Set(
            collateral(
              output,
              /^\s*FAIL\s+\S/,
              // La misma ruta la rechaza también la prueba de puntos de entrada.
              /tests\/architecture\/(?:public-routes|entry-points)\.test\.ts/,
            ),
          ),
        ],
      };
    },
  }),

  build: () => {
    // Marcador de esta ejecución: identifica la excepción de la página.
    const marker = `negative-build-${randomBytes(6).toString("hex")}`;
    return {
      label: "build",
      command: "check:build",
      alter: (copy) =>
        writeInCopy(
          copy,
          BUILD_PAGE,
          [
            'import type { GetStaticProps } from "next";',
            "",
            "export const getStaticProps: GetStaticProps = () => {",
            `  throw new Error("${marker}");`,
            "};",
            "",
            "export default function NegativeBuildPage() {",
            "  return <p>Prueba negativa</p>;",
            "}",
            "",
          ].join("\n"),
        ),
      evaluate: ({ code, output }) => {
        const prerender = `Error occurred prerendering page "${BUILD_ROUTE}"`;
        if (
          code === 0 ||
          !output.includes(prerender) ||
          !output.includes(`Error: ${marker}`) ||
          !output.includes(BUILD_PAGE)
        ) {
          return {
            problem: `next build no falla al generar ${BUILD_ROUTE} con la excepción de su getStaticProps.`,
          };
        }
        return {
          cause: `next build: ${prerender}, con la excepción del getStaticProps (marcador de la ejecución)`,
          location: `${BUILD_PAGE} (ruta ${BUILD_ROUTE})`,
          collateral: collateral(
            output,
            /Error occurred prerendering page/,
            new RegExp(escapeRegExp(prerender)),
          ),
        };
      },
    };
  },

  "secrets-history": () => {
    const token = syntheticToken();
    return {
      label: "secrets (a) historial",
      command: "check:secrets",
      tool: "gitleaks",
      token,
      alter: async (copy) => {
        await writeInCopy(copy, SECRET_FILE, `${token}\n`);
        await gitCopy(copy, ["add", "--", SECRET_FILE]);
        await gitCopy(copy, [
          "commit",
          "--quiet",
          "--no-verify",
          "-m",
          "negative secret",
        ]);
      },
      evaluate: ({ code, output }) => {
        const blocks = secretsBlocks(output);
        const finding = new RegExp(
          `^  huella [0-9a-f]{40}:${escapeRegExp(SECRET_FILE)}:github-pat:1 \\| fichero ${escapeRegExp(SECRET_FILE)} \\| regla github-pat \\| línea 1$`,
        );
        if (
          code === 0 ||
          blocks === undefined ||
          !blocks.history.some((line) => finding.test(line))
        ) {
          return {
            problem: "Gitleaks no señala github-pat en el historial.",
          };
        }
        return {
          cause: "Gitleaks: regla github-pat en el historial alcanzable",
          location: `${SECRET_FILE}:1 (commit de la copia)`,
          collateral: collateral(output, /^ {2}huella /, finding),
        };
      },
    };
  },

  "secrets-untracked": () => {
    const token = syntheticToken();
    return {
      label: "secrets (b) fichero nuevo sin seguimiento",
      command: "check:secrets",
      tool: "gitleaks",
      token,
      alter: (copy) => writeInCopy(copy, SECRET_FILE, `${token}\n`),
      evaluate: ({ code, output }) => {
        const blocks = secretsBlocks(output);
        const finding = new RegExp(
          `^  huella ${escapeRegExp(SECRET_FILE)}:github-pat:1 \\| fichero ${escapeRegExp(SECRET_FILE)} \\| regla github-pat \\| línea 1$`,
        );
        if (
          code === 0 ||
          blocks === undefined ||
          !blocks.tree.some((line) => finding.test(line))
        ) {
          return {
            problem:
              "Gitleaks no señala github-pat en el árbol de trabajo (fichero nuevo sin seguimiento).",
          };
        }
        return {
          cause:
            "Gitleaks: regla github-pat en el árbol de trabajo (fichero nuevo no ignorado)",
          location: `${SECRET_FILE}:1 (sin seguimiento)`,
          collateral: collateral(output, /^ {2}huella /, finding),
        };
      },
    };
  },

  "secrets-ignored": () => {
    const token = syntheticToken();
    return {
      label: "secrets (c) fichero ignorado, exclusión positiva",
      command: "check:secrets",
      tool: "gitleaks",
      token,
      positive: true,
      alter: async (copy) => {
        await writeInCopy(
          copy,
          IGNORED_SECRET_FILE,
          `NEGATIVE_TOKEN=${token}\n`,
        );
        await gitCopy(copy, [
          "check-ignore",
          "--quiet",
          "--",
          IGNORED_SECRET_FILE,
        ]);
      },
      evaluate: ({ code, output }) => {
        if (
          code !== 0 ||
          !output.includes("check:secrets: sin hallazgos no exceptuados.") ||
          !/^Árbol de trabajo \(0 fichero\(s\) modificados o nuevos\): sin hallazgos\.$/m.test(
            output,
          )
        ) {
          return {
            problem: `check:secrets examina ${IGNORED_SECRET_FILE} o no termina con éxito.`,
          };
        }
        return {
          cause: `check:secrets termina con éxito: ${IGNORED_SECRET_FILE} está ignorado y no se examina`,
          location: `${IGNORED_SECRET_FILE} (ignorado por .gitignore)`,
          collateral: [],
        };
      },
    };
  },

  dependencies: () => ({
    label: "dependencies",
    command: "check:deps",
    // Solo cambia package.json y el lockfile de la copia: no instala ni
    // ejecuta el paquete.
    alter: async (copy) => {
      await checked(
        "npm install lodash@4.17.20",
        await execute(
          "npm",
          [
            "install",
            "--package-lock-only",
            "--ignore-scripts",
            "lodash@4.17.20",
          ],
          { cwd: copy.dir, env: copy.env, timeout: INSTALL_TIMEOUT_MS },
        ),
      );
    },
    evaluate: ({ code, output }) => {
      const header =
        /^Vulnerabilidades altas o críticas sin excepción: (\d+)\.$/m;
      const start = output.search(header);
      const following =
        start === -1 ? [] : output.slice(start).split("\n").slice(1);
      const end = following.findIndex((line) => !line.startsWith("  - "));
      const blocking = end === -1 ? following : following.slice(0, end);
      const expected =
        /^ {2}- paquete lodash \| aviso (GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}) \| gravedad (alta|crítica) \|/;
      const found = blocking
        .map((line) => expected.exec(line))
        .filter((match) => match !== null);
      if (
        code === 0 ||
        found.length === 0 ||
        !output.includes("check:deps: no superado.")
      ) {
        return {
          problem: "check:deps no bloquea lodash por gravedad alta o crítica.",
        };
      }
      return {
        cause: `npm audit: gravedad ${found[0][2]} sin excepción (${found.map((match) => match[1]).join(", ")})`,
        location: "paquete lodash (4.17.20, solo en el lockfile de la copia)",
        collateral: blocking
          .filter((line) => !expected.test(line))
          .map((line) => printable(line.trim())),
      };
    },
  }),

  workflows: () => ({
    label: "workflows",
    command: "check:workflows",
    tool: "zizmor",
    alter: (copy) =>
      writeInCopy(
        copy,
        WORKFLOW_FILE,
        [
          "name: negative-test",
          "on:",
          "  pull_request:",
          "    branches: [main]",
          "permissions: {}",
          "jobs:",
          "  negative-test:",
          "    runs-on: ubuntu-24.04",
          "    permissions: {}",
          "    timeout-minutes: 5",
          "    steps:",
          '      - run: echo "${{ github.event.pull_request.title }}"',
          "",
        ].join("\n"),
      ),
    evaluate: ({ code, output }) => {
      const finding = new RegExp(
        `^  regla template-injection \\| gravedad High \\| fichero ${escapeRegExp(WORKFLOW_FILE)} \\| línea 12$`,
        "m",
      );
      if (code === 0 || !finding.test(output)) {
        return {
          problem: `zizmor no señala template-injection en ${WORKFLOW_FILE}.`,
        };
      }
      return {
        cause: "zizmor: template-injection (gravedad High)",
        location: `${WORKFLOW_FILE}:12`,
        collateral: collateral(output, /^ {2}regla /, finding),
      };
    },
  }),
};

// Casos que verifica cada categoría.
const CATEGORY_CASES = {
  format: ["format"],
  lint: ["lint"],
  types: ["types"],
  test: ["test", "test-undeclared-route"],
  build: ["build"],
  secrets: ["secrets-history", "secrets-untracked", "secrets-ignored"],
  dependencies: ["dependencies"],
  workflows: ["workflows"],
};

async function runCase(session, files, cache, name) {
  const spec = CASES[name]();
  const work = await mkdtemp(path.join(session, `${name}-`));
  try {
    const copy = await prepareCopy(work, files, cache, spec.tool);
    copy.realDir = await realpath(copy.dir);
    await spec.alter(copy);
    throwIfStopping();
    const result = await execute("npm", ["run", "--silent", spec.command], {
      cwd: copy.dir,
      env: copy.env,
      timeout: COMMAND_TIMEOUT_MS,
    });
    throwIfStopping();
    if (result.timedOut || result.truncated) {
      return {
        spec,
        problem: `${spec.command} no terminó dentro de sus límites de tiempo y salida.`,
      };
    }
    if (spec.token !== undefined && result.output.includes(spec.token)) {
      return {
        spec,
        problem: `${spec.command} mostró el token sintético en su salida.`,
      };
    }
    return {
      spec,
      ...spec.evaluate(
        { ...result, output: result.output.replace(ANSI_COLOR, "") },
        copy,
      ),
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function report({ spec, problem, cause, location, collateral: others }) {
  if (problem !== undefined) {
    process.stderr.write(
      `[${spec.label}] ${spec.command}: NO se obtuvo el resultado esperado. ${problem}\n`,
    );
    return false;
  }
  const verdict = spec.positive
    ? "termina con éxito, como se esperaba"
    : "falla por la causa esperada";
  process.stdout.write(
    [
      `[${spec.label}] ${spec.command} ${verdict}.`,
      `  causa: ${cause}`,
      `  ubicación: ${location}`,
      `  fallos colaterales:${others.length === 0 ? " ninguno" : ""}`,
      ...others.map((line) => `    ${line}`),
    ].join("\n") + "\n",
  );
  return true;
}

function parseArguments(args) {
  const unknown = args.filter((arg) => !CATEGORIES.includes(arg));
  const repeated = args.filter((arg, index) => args.indexOf(arg) !== index);
  if (unknown.length > 0 || repeated.length > 0) {
    const problems = [
      ...unknown.map((arg) => `categoría desconocida: ${printable(arg)}`),
      ...[...new Set(repeated)].map((arg) => `categoría repetida: ${arg}`),
    ];
    throw new NegativeError(
      `${problems.join("; ")}. Categorías válidas: ${CATEGORIES.join(", ")}.`,
    );
  }
  return args.length === 0
    ? [...CATEGORIES]
    : CATEGORIES.filter((category) => args.includes(category));
}

async function main(categories) {
  const session = await realpath(
    await mkdtemp(path.join(tmpdir(), "aulanorma-negative-")),
  );
  let failures = 0;
  let before;
  try {
    for (const directory of ["home", "tmp"]) {
      await mkdir(path.join(session, directory));
    }
    await writeFile(path.join(session, "gitconfig"), "");
    before = await originalState(session);
    process.stdout.write(
      `verify:negative: ${categories.join(", ")}.\nRepositorio original: HEAD ${before.head}.\n`,
    );
    const cache = await npmCache();
    const files = await sourceFiles(session);
    for (const category of categories) {
      for (const name of CATEGORY_CASES[category]) {
        throwIfStopping();
        try {
          if (!report(await runCase(session, files, cache, name))) {
            failures += 1;
          }
        } catch (error) {
          if (!(error instanceof NegativeError)) {
            throw error;
          }
          process.stderr.write(`[${name}] ${error.message}\n`);
          failures += 1;
        }
      }
    }
    const after = await originalState(session);
    const changes = [];
    if (after.head !== before.head) {
      changes.push("HEAD");
    }
    if (after.status !== before.status) {
      changes.push("git status");
    }
    if (after.ignored !== before.ignored) {
      changes.push(
        "rutas ignoradas (.env.development.local, .next, node_modules o .tools)",
      );
    }
    if (changes.length > 0) {
      throw new NegativeError(
        `El repositorio original cambió: ${changes.join(", ")}.`,
      );
    }
    process.stdout.write(
      "Repositorio original sin cambios: HEAD, git status y rutas ignoradas.\n",
    );
  } finally {
    await rm(session, { recursive: true, force: true });
  }
  return failures;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopSignal ??= signal;
    for (const child of running) {
      if (child.pid !== undefined) {
        void terminateGroup(child.pid);
      }
    }
  });
}

try {
  const categories = parseArguments(process.argv.slice(2));
  try {
    const failures = await main(categories);
    if (failures === 0) {
      process.stdout.write(
        "verify:negative: todas las categorías se comportan como se esperaba.\n",
      );
    } else {
      process.stderr.write(
        `verify:negative: no superado (${String(failures)} caso(s) sin el resultado esperado).\n`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof StopRequested) {
      process.stderr.write("verify:negative: detenido; copias eliminadas.\n");
      process.exitCode = STOP_CODES[stopSignal] ?? 1;
    } else {
      process.stderr.write(
        `${error instanceof NegativeError ? error.message : "Error inesperado durante las pruebas negativas."}\nverify:negative: no superado.\n`,
      );
      process.exitCode = 1;
    }
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof NegativeError ? error.message : "Error inesperado."}\n`,
  );
  process.exitCode = 2;
}
