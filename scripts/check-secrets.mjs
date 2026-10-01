// Control de secretos (`npm run check:secrets`; FR-014 y FR-020; research.md,
// R11; ADR 0002). Node.js sin dependencias: funciona sin `npm ci`, en local y
// en la integración continua.
//
// Ejecuta Gitleaks, instalado con `npm run tools:install`, en tres análisis
// separados:
// 1. historial alcanzable desde `HEAD`:
//    `gitleaks git --log-opts="--full-history HEAD"`, nunca con `--all`;
// 2. índice de Git: `gitleaks git --pre-commit --staged`, el contenido
//    preparado aunque difiera del árbol de trabajo;
// 3. árbol de trabajo: los ficheros regulares existentes de
//    `git ls-files --modified --others --exclude-standard`, copiados con su
//    ruta relativa a un temporal fuera del repositorio, sin seguir enlaces
//    simbólicos (tampoco de directorios intermedios) ni incluir borrados ni
//    ignorados; `gitleaks dir` se ejecuta en la copia.
//
// Falla (código 1) si cualquier análisis encuentra un hallazgo no exceptuado o
// no puede completarse, si falta Gitleaks o su SHA-256 no coincide con
// `scripts/tools/tools.lock.json`, si el repositorio es superficial, si el
// registro de excepciones no es válido o si `git status` del repositorio
// cambia durante la ejecución, también cuando otro paso ya ha fallado.
//
// Las excepciones solo entran por el registro de
// `docs/engineering/security-exceptions.md` y sus huellas en
// `.gitleaksignore`, con correspondencia uno a uno y fechas vigentes. No hay
// otra vía de supresión: se ignoran los comentarios `gitleaks:allow`, se
// rechaza una configuración `.gitleaks.toml` y no se transmiten las variables
// `GITLEAKS_*`. Los tres análisis usan una copia del `.gitleaksignore` ya
// validado.
//
// Gitleaks escribe un informe JSON redactado en un temporal externo. De cada
// hallazgo solo se muestra la huella, la ruta relativa, la regla y la línea;
// nunca el secreto ni la salida completa de Gitleaks. El binario verificado
// (`scripts/tools/verified-tool.mjs`) se ejecuta desde una copia en ese
// temporal, que se elimina siempre.
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ToolError,
  copyVerifiedTool,
  currentPlatform as toolPlatform,
} from "./tools/verified-tool.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const IGNORE_FILE = path.join(ROOT, ".gitleaksignore");
const REGISTRY_FILE = path.join(
  ROOT,
  "docs/engineering/security-exceptions.md",
);
const GITLEAKS_CONFIG = path.join(ROOT, ".gitleaks.toml");

// Código de salida de Gitleaks cuando encuentra hallazgos; cualquier otro
// distinto de 0 es un error de ejecución.
const FINDINGS_EXIT_CODE = 10;
const GITLEAKS_TIMEOUT_MS = 600_000;
const GIT_TIMEOUT_MS = 60_000;
const OUTPUT_LIMIT = 64 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REVIEW_MS = 90 * DAY_MS;

// Líneas de registro de Gitleaks sin color: hora, nivel y mensaje.
const LOG_ERROR = /^\d{1,2}:\d{2}(?:AM|PM) (?:ERR|FTL) /m;
const COMMITS_SCANNED = /^\d{1,2}:\d{2}(?:AM|PM) INF (\d+) commits scanned\.$/m;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ENTRY_KEYS = [
  "fingerprint",
  "owner",
  "justification",
  "approvedAt",
  "reviewBy",
];
// Variables que cambiarían el repositorio que examinan Git y Gitleaks.
const GIT_LOCATION_VARIABLES = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE",
]);

// Error con un mensaje apto para mostrarse: sin rutas absolutas ni secretos.
class CheckError extends Error {}

// Sustituye los caracteres de control para que un nombre de fichero no pueda
// alterar la salida del terminal.
function printable(value) {
  return Array.from(String(value), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? "?" : character;
  }).join("");
}

function hasExactKeys(value, keys) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isFilledString(value) {
  return typeof value === "string" && value.trim() !== "";
}

// Instante UTC `YYYY-MM-DDTHH:mm:ss.sssZ` que existe en el calendario: la
// representación canónica debe coincidir, así que no se aceptan fechas
// normalizadas como el 30 de febrero.
function parseInstant(value) {
  if (typeof value !== "string" || !INSTANT.test(value)) {
    return undefined;
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    return undefined;
  }
  return time;
}

function environment() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("GITLEAKS_") && !GIT_LOCATION_VARIABLES.has(key)) {
      env[key] = value;
    }
  }
  return env;
}

function run(file, args, { cwd, timeout, encoding = "utf8" }) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { cwd, env: environment(), timeout, maxBuffer: OUTPUT_LIMIT, encoding },
      (error, stdout, stderr) => {
        resolve({
          code: error === null ? 0 : error.code,
          killed: error?.killed === true,
          stdout,
          stderr,
        });
      },
    );
  });
}

async function git(args, encoding = "utf8") {
  const result = await run("git", args, {
    cwd: ROOT,
    timeout: GIT_TIMEOUT_MS,
    encoding,
  });
  if (result.code !== 0) {
    throw new CheckError(`git ${args[0]} no pudo completarse.`);
  }
  return result.stdout;
}

function status() {
  return git(
    [
      "--no-optional-locks",
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ],
    "buffer",
  );
}

// --- Repositorio ---

async function checkRepository() {
  const inside = await run("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: ROOT,
    timeout: GIT_TIMEOUT_MS,
  });
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    throw new CheckError("El proyecto no es un repositorio Git.");
  }
  if (
    (await git(["rev-parse", "--is-shallow-repository"])).trim() !== "false"
  ) {
    throw new CheckError(
      "El repositorio es superficial: el historial no puede analizarse completo. Hace falta un clon completo.",
    );
  }
  await git(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  const commits = Number((await git(["rev-list", "--count", "HEAD"])).trim());
  if (!Number.isSafeInteger(commits) || commits < 1) {
    throw new CheckError(
      "No se pudo contar el historial alcanzable desde HEAD.",
    );
  }
  if (await exists(GITLEAKS_CONFIG)) {
    throw new CheckError(
      "No se admite .gitleaks.toml: las excepciones solo entran por el registro.",
    );
  }
  return commits;
}

async function exists(file) {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw new CheckError("No se pudo comprobar una ruta del repositorio.");
  }
}

// --- Registro de excepciones ---

async function readRegularFile(file, label) {
  let stats;
  try {
    stats = await lstat(file);
  } catch {
    throw new CheckError(`Falta ${label}.`);
  }
  if (!stats.isFile()) {
    throw new CheckError(`${label} no es un fichero regular.`);
  }
  return readFile(file, "utf8");
}

async function readIgnoreFile() {
  const text = await readRegularFile(IGNORE_FILE, ".gitleaksignore");
  const fingerprints = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const problems = [];
  const seen = new Set();
  for (const fingerprint of fingerprints) {
    if (/\s/.test(fingerprint)) {
      problems.push(
        `.gitleaksignore: huella con espacios: ${printable(fingerprint)}`,
      );
    } else if (seen.has(fingerprint)) {
      problems.push(
        `.gitleaksignore: huella repetida: ${printable(fingerprint)}`,
      );
    }
    seen.add(fingerprint);
  }
  return { text, fingerprints: seen, problems };
}

// Extrae el único bloque `json` del registro.
function registryBlock(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === "```json") {
      const end = lines.findIndex(
        (line, position) => position > index && line.trim() === "```",
      );
      if (end === -1) {
        return undefined;
      }
      blocks.push(lines.slice(index + 1, end).join("\n"));
      index = end;
    }
  }
  return blocks.length === 1 ? blocks[0] : undefined;
}

function validateEntry(entry, index, now) {
  const label = `registro, excepción ${String(index + 1)}`;
  if (!hasExactKeys(entry, ENTRY_KEYS)) {
    return [`${label}: debe tener exactamente ${ENTRY_KEYS.join(", ")}.`];
  }
  const problems = [];
  for (const key of ENTRY_KEYS) {
    if (!isFilledString(entry[key])) {
      problems.push(`${label}: ${key} no puede estar vacío.`);
    }
  }
  if (problems.length > 0) {
    return problems;
  }
  if (/\s/.test(entry.fingerprint)) {
    problems.push(`${label}: la huella no puede contener espacios.`);
  }
  const approvedAt = parseInstant(entry.approvedAt);
  const reviewBy = parseInstant(entry.reviewBy);
  if (approvedAt === undefined) {
    problems.push(`${label}: approvedAt no es un instante UTC válido.`);
  }
  if (reviewBy === undefined) {
    problems.push(`${label}: reviewBy no es un instante UTC válido.`);
  }
  if (approvedAt !== undefined && approvedAt > now) {
    problems.push(`${label}: approvedAt está en el futuro.`);
  }
  if (approvedAt !== undefined && reviewBy !== undefined) {
    if (reviewBy < approvedAt || reviewBy - approvedAt > MAX_REVIEW_MS) {
      problems.push(
        `${label}: reviewBy debe estar entre approvedAt y 90 días después.`,
      );
    }
  }
  if (reviewBy !== undefined && now > reviewBy) {
    problems.push(
      `${label}: la excepción caducó (reviewBy ${entry.reviewBy}).`,
    );
  }
  return problems;
}

async function readRegistry(now) {
  const markdown = await readRegularFile(
    REGISTRY_FILE,
    "docs/engineering/security-exceptions.md",
  );
  const block = registryBlock(markdown);
  if (block === undefined) {
    return {
      fingerprints: new Set(),
      problems: ["registro: debe contener exactamente un bloque json cerrado."],
    };
  }
  let registry;
  try {
    registry = JSON.parse(block);
  } catch {
    return {
      fingerprints: new Set(),
      problems: ["registro: el bloque json no es válido."],
    };
  }
  if (
    !hasExactKeys(registry, ["schemaVersion", "exceptions"]) ||
    registry.schemaVersion !== 1 ||
    !Array.isArray(registry.exceptions)
  ) {
    return {
      fingerprints: new Set(),
      problems: [
        'registro: debe ser { "schemaVersion": 1, "exceptions": [...] }.',
      ],
    };
  }
  const problems = [];
  const fingerprints = new Set();
  for (const [index, entry] of registry.exceptions.entries()) {
    problems.push(...validateEntry(entry, index, now));
    if (typeof entry?.fingerprint === "string") {
      if (fingerprints.has(entry.fingerprint)) {
        problems.push(
          `registro: huella repetida: ${printable(entry.fingerprint)}`,
        );
      }
      fingerprints.add(entry.fingerprint);
    }
  }
  return { fingerprints, problems };
}

// Valida los dos lados y su correspondencia uno a uno. Devuelve el contenido
// validado de `.gitleaksignore`, que es el que usan los tres análisis.
async function readExceptions(now) {
  const ignore = await readIgnoreFile();
  const registry = await readRegistry(now);
  const problems = [...ignore.problems, ...registry.problems];
  for (const fingerprint of ignore.fingerprints) {
    if (!registry.fingerprints.has(fingerprint)) {
      problems.push(
        `huella de .gitleaksignore sin entrada en el registro: ${printable(fingerprint)}`,
      );
    }
  }
  for (const fingerprint of registry.fingerprints) {
    if (!ignore.fingerprints.has(fingerprint)) {
      problems.push(
        `entrada del registro sin huella en .gitleaksignore: ${printable(fingerprint)}`,
      );
    }
  }
  if (problems.length > 0) {
    throw new CheckError(
      `Las excepciones de secretos no son válidas:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
    );
  }
  return { text: ignore.text, count: ignore.fingerprints.size };
}

// --- Herramienta ---

// La verificación está en `scripts/tools/verified-tool.mjs`; sus errores se
// muestran igual que los del control.
function asCheckError(error) {
  return error instanceof ToolError ? new CheckError(error.message) : error;
}

function currentPlatform() {
  try {
    return toolPlatform();
  } catch (error) {
    throw asCheckError(error);
  }
}

// Escribe en `destination` los bytes verificados de `.tools/bin/gitleaks`, que
// es lo que se ejecuta.
async function verifiedGitleaks(destination) {
  try {
    await copyVerifiedTool({
      root: ROOT,
      name: "gitleaks",
      label: "Gitleaks",
      destination,
    });
  } catch (error) {
    throw asCheckError(error);
  }
}

// --- Árbol de trabajo ---

// `true` si `relative` es un fichero regular alcanzable desde la raíz sin
// atravesar enlaces simbólicos. Un fichero borrado devuelve `false`.
async function isRegularWithoutLinks(relative) {
  const segments = relative.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new CheckError("Git devolvió una ruta no válida.");
  }
  let current = ROOT;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        return false;
      }
      throw new CheckError(
        "No se pudo comprobar un fichero del árbol de trabajo.",
      );
    }
    const last = index === segments.length - 1;
    if (last ? !stats.isFile() : !stats.isDirectory()) {
      return false;
    }
  }
  return true;
}

async function copyRegularFile(relative, destinationRoot) {
  let handle;
  try {
    handle = await open(
      path.join(ROOT, relative),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ELOOP") {
      return false;
    }
    throw new CheckError("No se pudo leer un fichero del árbol de trabajo.");
  }
  try {
    if (!(await handle.stat()).isFile()) {
      return false;
    }
    const destination = path.join(destinationRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await handle.readFile(), {
      flag: "wx",
      mode: 0o600,
    });
    return true;
  } finally {
    await handle.close();
  }
}

async function copyWorkingTree(destinationRoot) {
  const listed = await git([
    "ls-files",
    "-z",
    "--modified",
    "--others",
    "--exclude-standard",
  ]);
  const files = [...new Set(listed.split("\0").filter((file) => file !== ""))];
  let copied = 0;
  for (const relative of files.sort()) {
    if (
      (await isRegularWithoutLinks(relative)) &&
      (await copyRegularFile(relative, destinationRoot))
    ) {
      copied += 1;
    }
  }
  return copied;
}

// --- Análisis ---

function isFinding(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.Fingerprint === "string" &&
    typeof value.File === "string" &&
    typeof value.RuleID === "string" &&
    Number.isSafeInteger(value.StartLine)
  );
}

async function readReport(file) {
  let report;
  try {
    report = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return undefined;
  }
  return Array.isArray(report) && report.every(isFinding) ? report : undefined;
}

// Ejecuta un análisis y devuelve sus hallazgos. Cualquier resultado que no
// sea un éxito o unos hallazgos coherentes es un error del análisis.
async function analyse({
  label,
  args,
  cwd,
  gitleaks,
  report,
  ignore,
  commits,
}) {
  const result = await run(
    gitleaks,
    [
      ...args,
      "--redact",
      "--no-banner",
      "--verbose",
      "--no-color",
      "--ignore-gitleaks-allow",
      "--log-level",
      "info",
      "--exit-code",
      String(FINDINGS_EXIT_CODE),
      "--gitleaks-ignore-path",
      ignore,
      "--report-format",
      "json",
      "--report-path",
      report,
    ],
    { cwd, timeout: GITLEAKS_TIMEOUT_MS },
  );
  const failed = new CheckError(`${label}: el análisis no pudo completarse.`);
  if (
    result.killed ||
    (result.code !== 0 && result.code !== FINDINGS_EXIT_CODE)
  ) {
    throw failed;
  }
  // Gitleaks puede registrar un error de Git y terminar con código 0.
  const log = `${result.stdout}\n${result.stderr}`;
  if (LOG_ERROR.test(log)) {
    throw failed;
  }
  if (commits !== undefined) {
    const scanned = COMMITS_SCANNED.exec(log);
    const count = scanned === null ? Number.NaN : Number(scanned[1]);
    if (!(count >= 1 && count <= commits)) {
      throw failed;
    }
  }
  const findings = await readReport(report);
  if (
    findings === undefined ||
    (result.code === 0) !== (findings.length === 0)
  ) {
    throw failed;
  }
  return findings;
}

function describe(label, findings) {
  if (findings.length === 0) {
    return `${label}: sin hallazgos.`;
  }
  const lines = findings.map(
    (finding) =>
      `  huella ${printable(finding.Fingerprint)} | fichero ${printable(finding.File)} | regla ${printable(finding.RuleID)} | línea ${String(finding.StartLine)}`,
  );
  return `${label}: ${String(findings.length)} hallazgo(s) no exceptuado(s):\n${lines.join("\n")}`;
}

async function scan(commits, ignoreText) {
  const work = await mkdtemp(path.join(tmpdir(), "aulanorma-secrets-"));
  try {
    const gitleaks = path.join(work, "gitleaks");
    await verifiedGitleaks(gitleaks);
    const ignore = path.join(work, "gitleaksignore");
    await writeFile(ignore, ignoreText, { mode: 0o600 });
    const tree = path.join(work, "tree");
    await mkdir(tree);
    const copied = await copyWorkingTree(tree);

    const analyses = [
      {
        label: "Historial alcanzable desde HEAD",
        args: ["git", "--log-opts=--full-history HEAD", "."],
        cwd: ROOT,
        commits,
      },
      {
        label: "Índice de Git",
        args: ["git", "--pre-commit", "--staged", "."],
        cwd: ROOT,
      },
      {
        label: `Árbol de trabajo (${String(copied)} fichero(s) modificados o nuevos)`,
        args: ["dir", "."],
        cwd: tree,
      },
    ];
    let clean = true;
    const errors = [];
    for (const [index, analysis] of analyses.entries()) {
      try {
        const findings = await analyse({
          ...analysis,
          gitleaks,
          ignore,
          report: path.join(work, `report-${String(index)}.json`),
        });
        clean &&= findings.length === 0;
        process.stdout.write(`${describe(analysis.label, findings)}\n`);
      } catch (error) {
        if (!(error instanceof CheckError)) {
          throw error;
        }
        errors.push(error.message);
      }
    }
    if (errors.length > 0) {
      throw new CheckError(errors.join("\n"));
    }
    return clean;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function main() {
  const now = Date.now();
  currentPlatform();
  const commits = await checkRepository();
  const before = await status();
  let failure;
  let clean = false;
  try {
    const exceptions = await readExceptions(now);
    process.stdout.write(
      `Excepciones de secretos vigentes: ${String(exceptions.count)}.\n`,
    );
    clean = await scan(commits, exceptions.text);
  } catch (error) {
    failure = error;
  }
  let changed;
  try {
    changed = !(await status()).equals(before);
  } catch {
    changed = true;
  }
  const messages = [];
  if (failure !== undefined) {
    messages.push(
      failure instanceof CheckError
        ? failure.message
        : "Error inesperado durante el análisis de secretos.",
    );
  }
  if (changed) {
    messages.push(
      "El estado de Git del repositorio cambió durante el análisis.",
    );
  }
  if (messages.length > 0) {
    throw new CheckError(messages.join("\n"));
  }
  return clean;
}

try {
  if (await main()) {
    process.stdout.write("check:secrets: sin hallazgos no exceptuados.\n");
  } else {
    process.stderr.write("check:secrets: hay hallazgos no exceptuados.\n");
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof CheckError ? error.message : "Error inesperado durante el análisis de secretos."}\ncheck:secrets: no superado.\n`,
  );
  process.exitCode = 1;
}
