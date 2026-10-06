// Control de seguridad de los workflows (`npm run check:workflows`; FR-014 y
// FR-021; research.md, R13; ADR 0002). Node.js sin dependencias: funciona sin
// `npm ci`, en local y en la integración continua.
//
// Ejecuta zizmor, instalado con `npm run tools:install`, sobre los ficheros
// YAML de `.github/workflows`, sin red y con todas las auditorías de gravedad
// baja o superior:
//
//   zizmor --offline --min-severity low --no-config --no-ignores
//          --strict-collection --format json-v1 <workflows>
//
// Falla (código 1) si zizmor encuentra hallazgos, si falta o su SHA-256 no
// coincide con `scripts/tools/tools.lock.json`, si `.github/workflows` no es un
// directorio real con al menos un YAML regular, si contiene enlaces
// simbólicos, o si el análisis no puede completarse: error, tiempo agotado,
// salida no válida o incoherente con el código de salida.
//
// No hay excepciones de workflows: se rechazan los ficheros de configuración
// de zizmor (`zizmor.yml` y `.github/zizmor.yml`, con extensión `.yml` o
// `.yaml`) y las directivas `zizmor: ignore` de los workflows, y zizmor se
// ejecuta con `--no-config` y `--no-ignores`. No se transmiten `GH_TOKEN`,
// `GITHUB_TOKEN`, `GH_HOST` ni las variables `ZIZMOR_*`. Nunca se aplican
// correcciones automáticas.
//
// De cada hallazgo solo se muestra la regla, la gravedad, el fichero relativo
// y la línea; nunca la salida de zizmor, fragmentos del workflow ni rutas
// absolutas. El binario verificado (`scripts/tools/verified-tool.mjs`) se
// ejecuta desde una copia en un temporal externo, que se elimina siempre.
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ToolError,
  copyVerifiedTool,
  currentPlatform,
} from "./tools/verified-tool.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const WORKFLOWS = ".github/workflows";
const CONFIG_FILES = [
  "zizmor.yml",
  "zizmor.yaml",
  ".github/zizmor.yml",
  ".github/zizmor.yaml",
];
const YAML = /\.ya?ml$/;
const SUPPRESSION = /zizmor\s*:\s*ignore/i;
const RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEVERITIES = ["Unknown", "Informational", "Low", "Medium", "High"];
// zizmor termina con 10 más el rango de la gravedad máxima cuando encuentra
// hallazgos; cualquier otro código distinto de 0 es un error.
const FINDINGS_EXIT_CODES = new Set([10, 11, 12, 13, 14]);
const ZIZMOR_TIMEOUT_MS = 120_000;
const MAX_WORKFLOW_BYTES = 1024 * 1024;
const OUTPUT_LIMIT = 16 * 1024 * 1024;
// Variables que darían a zizmor credenciales, otro servidor u otra
// configuración.
const BLOCKED_VARIABLES = new Set(["GH_TOKEN", "GITHUB_TOKEN", "GH_HOST"]);

// Error con un mensaje apto para mostrarse: sin rutas absolutas ni contenido.
class CheckError extends Error {}

// Sustituye los caracteres de control para que un nombre de fichero no pueda
// alterar la salida del terminal.
function printable(value) {
  return Array.from(String(value), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? "?" : character;
  }).join("");
}

function environment() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("ZIZMOR_") && !BLOCKED_VARIABLES.has(key)) {
      env[key] = value;
    }
  }
  return env;
}

function asCheckError(error) {
  return error instanceof ToolError ? new CheckError(error.message) : error;
}

// --- Entradas ---

async function lstatOrUndefined(relative) {
  try {
    return await lstat(path.join(ROOT, relative));
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw new CheckError(`No se pudo comprobar ${relative}.`);
  }
}

async function rejectConfiguration() {
  for (const relative of CONFIG_FILES) {
    if ((await lstatOrUndefined(relative)) !== undefined) {
      throw new CheckError(
        `No se admite ${relative}: no hay excepciones de workflows.`,
      );
    }
  }
}

// Rutas relativas, ordenadas, de los YAML regulares de `.github/workflows`.
async function listWorkflows() {
  const missing = `Falta ${WORKFLOWS} o no es un directorio real: no hay workflows que analizar.`;
  for (const relative of [".github", WORKFLOWS]) {
    const stats = await lstatOrUndefined(relative);
    if (stats === undefined || !stats.isDirectory()) {
      throw new CheckError(missing);
    }
  }
  let entries;
  try {
    entries = await readdir(path.join(ROOT, WORKFLOWS), {
      withFileTypes: true,
    });
  } catch {
    throw new CheckError(`No se pudo leer ${WORKFLOWS}.`);
  }
  const files = [];
  for (const entry of entries) {
    const relative = `${WORKFLOWS}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new CheckError(
        `${printable(relative)} es un enlace simbólico: no se sigue.`,
      );
    }
    if (YAML.test(entry.name)) {
      if (!entry.isFile()) {
        throw new CheckError(
          `${printable(relative)} no es un fichero regular.`,
        );
      }
      files.push(relative);
    }
  }
  if (files.length === 0) {
    throw new CheckError(
      `${WORKFLOWS} no contiene ningún workflow YAML: no hay workflows que analizar.`,
    );
  }
  return files.sort();
}

async function readWorkflow(relative) {
  let handle;
  try {
    handle = await open(
      path.join(ROOT, relative),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch {
    throw new CheckError(`No se pudo leer ${printable(relative)}.`);
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > MAX_WORKFLOW_BYTES) {
      throw new CheckError(
        `${printable(relative)} no es un fichero regular analizable.`,
      );
    }
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

// Ubicaciones de las directivas `zizmor: ignore`, sin su contenido.
async function findSuppressions(files) {
  const found = [];
  for (const relative of files) {
    const lines = (await readWorkflow(relative)).split("\n");
    for (const [index, line] of lines.entries()) {
      if (SUPPRESSION.test(line)) {
        found.push(`${printable(relative)}, línea ${String(index + 1)}`);
      }
    }
  }
  return found;
}

// --- Ejecución ---

function run(file, args) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        cwd: ROOT,
        env: environment(),
        timeout: ZIZMOR_TIMEOUT_MS,
        maxBuffer: OUTPUT_LIMIT,
        encoding: "utf8",
      },
      (error, stdout) => {
        resolve({
          code: error === null ? 0 : error.code,
          killed: error?.killed === true,
          stdout,
        });
      },
    );
  });
}

// Hallazgo de `--format json-v1` reducido a regla, gravedad, fichero y línea,
// o `undefined` si no tiene la forma esperada. La línea es la de la ubicación
// principal (`row` empieza en 0).
function readFinding(value, files) {
  const severity = value?.determinations?.severity;
  const locations = value?.locations;
  if (
    typeof value?.ident !== "string" ||
    !RULE.test(value.ident) ||
    !SEVERITIES.includes(severity) ||
    !Array.isArray(locations) ||
    locations.length === 0
  ) {
    return undefined;
  }
  const primary =
    locations.find((location) => location?.symbolic?.kind === "Primary") ??
    locations[0];
  const file = primary?.symbolic?.key?.Local?.verbatim_path;
  const row = primary?.concrete?.location?.start_point?.row;
  if (!files.includes(file) || !Number.isSafeInteger(row) || row < 0) {
    return undefined;
  }
  return { rule: value.ident, severity, file, line: row + 1 };
}

async function analyse(zizmor, files) {
  const result = await run(zizmor, [
    "--offline",
    "--min-severity",
    "low",
    "--no-config",
    "--no-ignores",
    "--strict-collection",
    "--format",
    "json-v1",
    "--no-progress",
    "--color",
    "never",
    "--",
    ...files,
  ]);
  const failed = new CheckError(
    "zizmor: el análisis de los workflows no pudo completarse.",
  );
  if (
    result.killed ||
    (result.code !== 0 && !FINDINGS_EXIT_CODES.has(result.code))
  ) {
    throw failed;
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw failed;
  }
  if (!Array.isArray(report) || (result.code === 0) !== (report.length === 0)) {
    throw failed;
  }
  const findings = report.map((value) => readFinding(value, files));
  if (findings.includes(undefined)) {
    throw failed;
  }
  return findings;
}

async function main() {
  currentPlatform();
  await rejectConfiguration();
  const files = await listWorkflows();
  const suppressions = await findSuppressions(files);
  if (suppressions.length > 0) {
    throw new CheckError(
      `No se admiten directivas zizmor: ignore (no hay excepciones de workflows):\n${suppressions.map((item) => `  ${item}`).join("\n")}`,
    );
  }
  process.stdout.write(`Workflows analizados: ${String(files.length)}.\n`);
  const work = await mkdtemp(path.join(tmpdir(), "aulanorma-workflows-"));
  try {
    const zizmor = path.join(work, "zizmor");
    await copyVerifiedTool({
      root: ROOT,
      name: "zizmor",
      label: "zizmor",
      destination: zizmor,
    });
    return await analyse(zizmor, files);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

try {
  const findings = await main();
  if (findings.length === 0) {
    process.stdout.write("check:workflows: sin hallazgos.\n");
  } else {
    const lines = findings.map(
      (finding) =>
        `  regla ${finding.rule} | gravedad ${finding.severity} | fichero ${printable(finding.file)} | línea ${String(finding.line)}`,
    );
    process.stderr.write(
      `zizmor: ${String(findings.length)} hallazgo(s):\n${lines.join("\n")}\ncheck:workflows: no superado.\n`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  const failure = asCheckError(error);
  process.stderr.write(
    `${failure instanceof CheckError ? failure.message : "Error inesperado durante el análisis de los workflows."}\ncheck:workflows: no superado.\n`,
  );
  process.exitCode = 1;
}
