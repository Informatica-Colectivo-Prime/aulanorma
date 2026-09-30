// Control de dependencias (`npm run check:deps`; FR-017 y FR-020;
// research.md, R12; ADR 0002). Node.js sin dependencias: funciona igual en
// local y en la integración continua, y necesita acceso al registro de npm.
//
// 1. `npm audit --json --package-lock-only` con `--include` de producción,
//    desarrollo, opcionales y pares, así que una configuración heredada
//    (`omit`, `NODE_ENV=production`) no excluye ninguna dependencia del
//    lockfile, tampoco las transitivas.
// 2. Distingue un informe válido de un error de consulta: un error, una
//    respuesta que no es un informe válido o incoherente, o una referencia de
//    `via` que no puede resolverse hacen fallar el control.
// 3. Resuelve cada vulnerabilidad hasta sus avisos, también a través de las
//    referencias indirectas de `via`, sin rebajar ninguna gravedad. Un aviso
//    alto o crítico falla salvo que tenga una excepción vigente en
//    `security/audit-exceptions.json` para la pareja exacta de GHSA y paquete.
//    Un aviso bloqueante sin GHSA no puede exceptuarse.
// 4. Muestra sin fallar los avisos medios, bajos e informativos, con paquete,
//    aviso, gravedad y enlace, en la salida y, si existe, en
//    `$GITHUB_STEP_SUMMARY`.
// 5. Ejecuta siempre `npm audit signatures`; un código distinto de 0 hace
//    fallar el control.
//
// Las excepciones tienen `advisory`, `package`, `justification`, `owner`,
// `approvedAt` y `reviewBy`, con instantes UTC `YYYY-MM-DDTHH:mm:ss.sssZ`
// (docs/engineering/security-exceptions.md). Una excepción caducada,
// incompleta o repetida hace fallar el control. No ejecuta `npm audit fix` y
// no muestra la salida de npm. Código 0 si se supera; 1 en otro caso.
import { execFile } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const EXCEPTIONS_FILE = path.join(ROOT, "security/audit-exceptions.json");

const AUDIT_ARGS = [
  "audit",
  "--json",
  "--package-lock-only",
  "--include=prod",
  "--include=dev",
  "--include=optional",
  "--include=peer",
];
const SIGNATURES_ARGS = ["audit", "signatures"];
const NPM_TIMEOUT_MS = 600_000;
const OUTPUT_LIMIT = 64 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REVIEW_MS = 90 * DAY_MS;

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const BLOCKING = new Set(["high", "critical"]);
const SEVERITY_LABELS = {
  info: "informativa",
  low: "baja",
  moderate: "media",
  high: "alta",
  critical: "crítica",
};
const GHSA = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/;
const ADVISORY_URL =
  /^https:\/\/github\.com\/advisories\/(GHSA(?:-[23456789cfghjmpqrvwx]{4}){3})$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ENTRY_KEYS = [
  "advisory",
  "package",
  "justification",
  "owner",
  "approvedAt",
  "reviewBy",
];

// Error con un mensaje apto para mostrarse: sin rutas absolutas ni salida de
// npm.
class CheckError extends Error {}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isFilledString(value) {
  return typeof value === "string" && value.trim() !== "";
}

// Sustituye los caracteres de control para que un dato del informe no pueda
// alterar la salida del terminal.
function printable(value) {
  return Array.from(String(value), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? "?" : character;
  }).join("");
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

function npm(args) {
  return new Promise((resolve) => {
    execFile(
      "npm",
      args,
      {
        cwd: ROOT,
        timeout: NPM_TIMEOUT_MS,
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

// --- Excepciones ---

function validateEntry(entry, index, now) {
  const label = `excepción ${String(index + 1)}`;
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
  if (!GHSA.test(entry.advisory)) {
    problems.push(
      `${label}: advisory debe tener la forma GHSA-xxxx-xxxx-xxxx.`,
    );
  }
  if (/\s/.test(entry.package)) {
    problems.push(`${label}: package no puede contener espacios.`);
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

// Devuelve las excepciones por pareja `GHSA|paquete`, o los problemas del
// registro.
async function readExceptions(now) {
  let registry;
  try {
    registry = JSON.parse(await readFile(EXCEPTIONS_FILE, "utf8"));
  } catch {
    return {
      exceptions: new Map(),
      problems: ["no se pudo leer security/audit-exceptions.json como JSON."],
    };
  }
  if (
    !hasExactKeys(registry, ["schemaVersion", "exceptions"]) ||
    registry.schemaVersion !== 1 ||
    !Array.isArray(registry.exceptions)
  ) {
    return {
      exceptions: new Map(),
      problems: [
        'security/audit-exceptions.json debe ser { "schemaVersion": 1, "exceptions": [...] }.',
      ],
    };
  }
  const problems = [];
  const exceptions = new Map();
  const seen = new Set();
  for (const [index, entry] of registry.exceptions.entries()) {
    const entryProblems = validateEntry(entry, index, now).map(printable);
    problems.push(...entryProblems);
    if (isRecord(entry)) {
      const key = `${String(entry.advisory)}|${String(entry.package)}`;
      if (seen.has(key)) {
        problems.push(
          printable(
            `excepción repetida para ${String(entry.advisory)} en ${String(entry.package)}.`,
          ),
        );
      }
      seen.add(key);
      // Solo una excepción válida puede cubrir un aviso.
      if (entryProblems.length === 0) {
        exceptions.set(key, entry);
      }
    }
  }
  return { exceptions, problems };
}

// --- Informe ---

function readAudit(result) {
  if (result.killed || typeof result.code !== "number") {
    throw new CheckError("npm audit no pudo ejecutarse.");
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new CheckError("npm audit no devolvió un informe JSON válido.");
  }
  if (isRecord(report) && Object.hasOwn(report, "error")) {
    throw new CheckError(
      "npm audit no pudo consultar la base de avisos o el registro.",
    );
  }
  const counts = report?.metadata?.vulnerabilities;
  if (
    !isRecord(report) ||
    report.auditReportVersion !== 2 ||
    !isRecord(report.vulnerabilities) ||
    !isRecord(counts)
  ) {
    throw new CheckError(
      "npm audit devolvió un informe con un formato no admitido.",
    );
  }
  const entries = Object.values(report.vulnerabilities);
  const coherent =
    SEVERITIES.every(
      (severity) =>
        counts[severity] ===
        entries.filter((entry) => entry?.severity === severity).length,
    ) && counts.total === entries.length;
  if (!coherent) {
    throw new CheckError("El informe de npm audit no es coherente.");
  }
  if (result.code !== 0 && entries.length === 0) {
    throw new CheckError(
      "npm audit terminó con error sin informar vulnerabilidades.",
    );
  }
  return report;
}

function rank(severity) {
  return SEVERITIES.indexOf(severity);
}

function readAdvisory(item) {
  if (
    !isRecord(item) ||
    !isFilledString(item.name) ||
    !SEVERITIES.includes(item.severity) ||
    typeof item.url !== "string"
  ) {
    return undefined;
  }
  const match = ADVISORY_URL.exec(item.url);
  return {
    package: item.name,
    severity: item.severity,
    ghsa: match === null ? undefined : match[1],
    url: match === null ? undefined : item.url,
    key: `${match === null ? item.url : match[1]}|${item.name}`,
  };
}

// Resuelve cada vulnerabilidad hasta sus avisos. Las referencias indirectas
// de `via` son nombres de otras vulnerabilidades del informe, que pueden
// formar ciclos. Cada vulnerabilidad se resuelve con un recorrido completo de
// todo lo alcanzable desde ella, sin reutilizar resultados de otros
// recorridos: un resultado parcial obtenido con un ciclo abierto nunca se
// conserva, así que el resultado no depende del orden de los paquetes. Una
// referencia que no existe, un aviso incompleto o una gravedad distinta de la
// máxima de sus avisos impiden decidir y se informan como problemas.
function resolveAdvisories(report) {
  const vulnerabilities = report.vulnerabilities;
  const advisories = new Map();
  const problems = new Set();

  const reachable = (start) => {
    const keys = new Set();
    const visited = new Set();
    const pending = [start];
    while (pending.length > 0) {
      const name = pending.pop();
      if (visited.has(name)) {
        continue;
      }
      visited.add(name);
      const vulnerability = vulnerabilities[name];
      if (
        !Object.hasOwn(vulnerabilities, name) ||
        !isRecord(vulnerability) ||
        !Array.isArray(vulnerability.via) ||
        vulnerability.via.length === 0 ||
        !SEVERITIES.includes(vulnerability.severity)
      ) {
        problems.add(
          `referencia no resoluble en el informe: ${printable(name)}.`,
        );
        continue;
      }
      for (const item of vulnerability.via) {
        if (typeof item === "string") {
          pending.push(item);
        } else {
          const advisory = readAdvisory(item);
          if (advisory === undefined) {
            problems.add(`aviso incompleto en ${printable(name)}.`);
          } else {
            advisories.set(advisory.key, advisory);
            keys.add(advisory.key);
          }
        }
      }
    }
    return keys;
  };

  for (const name of Object.keys(vulnerabilities).sort()) {
    const keys = reachable(name);
    const vulnerability = vulnerabilities[name];
    if (keys.size === 0) {
      problems.add(`${printable(name)} no tiene avisos resolubles.`);
      continue;
    }
    const highest = Math.max(
      ...[...keys].map((key) => rank(advisories.get(key)?.severity)),
    );
    if (rank(vulnerability?.severity) !== highest) {
      problems.add(
        `la gravedad de ${printable(name)} no coincide con la de sus avisos.`,
      );
    }
  }
  return { advisories: [...advisories.values()], problems: [...problems] };
}

// --- Salida ---

function line(advisory) {
  return `  - paquete ${printable(advisory.package)} | aviso ${advisory.ghsa ?? "sin identificador GHSA"} | gravedad ${SEVERITY_LABELS[advisory.severity]} | ${advisory.url ?? "sin enlace válido"}`;
}

function markdownText(value) {
  return printable(value)
    .replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, (character) => `\\${character}`)
    .replace(/\s+/g, " ");
}

function summary(shown) {
  const lines = ["## Dependencias: vulnerabilidades medias y bajas", ""];
  if (shown.length === 0) {
    lines.push("No hay vulnerabilidades medias ni bajas.");
  } else {
    lines.push(
      "| Paquete | Aviso | Gravedad | Enlace |",
      "| --- | --- | --- | --- |",
    );
    for (const advisory of shown) {
      const link =
        advisory.url === undefined
          ? "sin enlace válido"
          : `[${advisory.ghsa}](${advisory.url})`;
      lines.push(
        `| ${markdownText(advisory.package)} | ${advisory.ghsa ?? "sin identificador GHSA"} | ${SEVERITY_LABELS[advisory.severity]} | ${link} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function byPackage(left, right) {
  return (
    left.package.localeCompare(right.package) ||
    rank(right.severity) - rank(left.severity) ||
    left.key.localeCompare(right.key)
  );
}

// --- Control ---

async function audit(exceptions) {
  const report = readAudit(await npm(AUDIT_ARGS));
  const { advisories, problems } = resolveAdvisories(report);
  if (problems.length > 0) {
    throw new CheckError(
      `El informe de npm audit no permite decidir el resultado:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
    );
  }
  advisories.sort(byPackage);
  const blocking = [];
  const excepted = [];
  const shown = [];
  for (const advisory of advisories) {
    if (!BLOCKING.has(advisory.severity)) {
      shown.push(advisory);
    } else if (
      advisory.ghsa !== undefined &&
      exceptions.has(`${advisory.ghsa}|${advisory.package}`)
    ) {
      excepted.push(advisory);
    } else {
      blocking.push(advisory);
    }
  }
  const output = [
    `Dependencias auditadas del lockfile: ${String(report.metadata.dependencies?.total ?? "desconocidas")}.`,
    `Vulnerabilidades altas o críticas sin excepción: ${String(blocking.length)}.`,
    ...blocking.map(line),
  ];
  if (excepted.length > 0) {
    output.push(
      `Vulnerabilidades altas o críticas con excepción vigente: ${String(excepted.length)}.`,
      ...excepted.map(
        (advisory) =>
          `${line(advisory)} | revisar antes de ${exceptions.get(`${String(advisory.ghsa)}|${advisory.package}`).reviewBy}`,
      ),
    );
  }
  output.push(
    shown.length === 0
      ? "Sin vulnerabilidades medias ni bajas."
      : `Vulnerabilidades medias y bajas (no bloquean): ${String(shown.length)}.`,
    ...shown.map(line),
  );
  process.stdout.write(`${output.join("\n")}\n`);
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target !== undefined && target !== "") {
    try {
      await appendFile(target, summary(shown));
    } catch {
      throw new CheckError("No se pudo escribir el resumen de la ejecución.");
    }
  }
  return blocking.length === 0;
}

async function signatures() {
  const result = await npm(SIGNATURES_ARGS);
  if (result.code === 0) {
    process.stdout.write("Firmas y atestaciones del registro: verificadas.\n");
    return true;
  }
  process.stdout.write(
    result.killed || typeof result.code !== "number"
      ? "npm audit signatures no pudo ejecutarse.\n"
      : `npm audit signatures terminó con código ${String(result.code)}.\n`,
  );
  return false;
}

async function main() {
  const now = Date.now();
  const { exceptions, problems } = await readExceptions(now);
  let passed = true;
  if (problems.length > 0) {
    passed = false;
    process.stdout.write(
      `Las excepciones de dependencias no son válidas:\n${problems.map((problem) => `  - ${problem}`).join("\n")}\n`,
    );
  }
  try {
    passed = (await audit(exceptions)) && passed;
  } catch (error) {
    if (!(error instanceof CheckError)) {
      throw error;
    }
    passed = false;
    process.stdout.write(`${error.message}\n`);
  }
  // Las firmas se comprueban aunque la auditoría haya fallado.
  passed = (await signatures()) && passed;
  return passed;
}

try {
  if (await main()) {
    process.stdout.write("check:deps: superado.\n");
  } else {
    process.stderr.write("check:deps: no superado.\n");
    process.exitCode = 1;
  }
} catch {
  process.stderr.write(
    "Error inesperado durante la comprobación de dependencias.\ncheck:deps: no superado.\n",
  );
  process.exitCode = 1;
}
