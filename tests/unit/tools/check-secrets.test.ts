// Control de secretos (T051; research.md, R11; FR-014 y FR-020).
//
// Ejecuta el `scripts/check-secrets.mjs` real como proceso hijo en
// repositorios Git desechables. Gitleaks se sustituye por un analizador falso
// escrito en JavaScript, instalado en `.tools/bin/gitleaks` con su SHA-256 en
// un `tools.lock.json` sintético: el envoltorio lo verifica igual que el
// binario real. El falso busca un marcador sintético en el historial
// (`git log -p`), en el índice (`git diff --cached`) o en el directorio
// analizado, aplica `.gitleaksignore`, escribe el informe JSON y registra cada
// invocación. Por variables propias puede simular fallos; el script productivo
// no las lee.
//
// El marcador se genera en cada ejecución y no es una credencial. El reloj se
// fija con un módulo precargado para probar los límites exactos de las fechas
// sin esperas. No hay red.
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const SCRIPT = path.join(repoRoot, "scripts/check-secrets.mjs");
const TIMEOUT_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const PLATFORM = `${process.platform}-${process.arch}`;
const RULE = "marcador-sintetico";

// Marcador sintético, distinto en cada ejecución de la suite.
const MARKER = `MARCADOR_SINTETICO_${randomBytes(6).toString("hex").toUpperCase()}`;

const FAKE_GITLEAKS = `#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const mode = args[0] === "dir" ? "dir" : args.includes("--staged") ? "staged" : "history";
const plan = JSON.parse(process.env.FAKE_GITLEAKS_PLAN || "{}")[mode] || {};
const pattern = /MARCADOR_SINTETICO_[0-9A-F]{12}/;
const findings = [];
const add = (file, line, commit) => {
  findings.push({
    RuleID: "${RULE}",
    File: file,
    StartLine: line,
    Commit: commit || "",
    Secret: "REDACTED",
    Match: "REDACTED",
    Fingerprint: (commit ? commit + ":" : "") + file + ":${RULE}:" + line,
  });
};
const scanPatch = (text, withCommits) => {
  let commit = "";
  let file = "";
  let line = 0;
  let commits = 0;
  for (const row of text.split("\\n")) {
    if (withCommits && row.startsWith("commit ")) {
      commit = row.slice(7).trim();
      commits += 1;
    } else if (row.startsWith("+++ ")) {
      file = row === "+++ /dev/null" ? "" : row.slice(6);
    } else if (row.startsWith("@@")) {
      line = Number(/\\+(\\d+)/.exec(row)[1]);
    } else if (row.startsWith("+") && file !== "") {
      if (pattern.test(row)) add(file, line, commit);
      line += 1;
    }
  }
  return commits;
};
const seen = [];
let commits = 0;
if (mode === "history") {
  const logOpts = args.find((arg) => arg.startsWith("--log-opts=")).slice(11).split(" ");
  const text = execFileSync("git", ["log", "-p", "-U0", "--no-color", "--format=commit %H", ...logOpts], { encoding: "utf8" });
  commits = scanPatch(text, true);
} else if (mode === "staged") {
  scanPatch(execFileSync("git", ["diff", "--cached", "-U0", "--no-color"], { encoding: "utf8" }), false);
} else {
  const walk = (relative) => {
    for (const name of fs.readdirSync(path.join(".", relative)).sort()) {
      const child = relative === "" ? name : relative + "/" + name;
      const stats = fs.lstatSync(child);
      if (stats.isDirectory()) walk(child);
      else {
        seen.push(child);
        fs.readFileSync(child, "utf8").split("\\n").forEach((text, index) => {
          if (pattern.test(text)) add(child, index + 1);
        });
      }
    }
  };
  walk("");
}
const ignorePath = option("--gitleaks-ignore-path");
const ignored = new Set(
  fs.readFileSync(ignorePath, "utf8").split("\\n").map((row) => row.trim()).filter((row) => row !== "" && !row.startsWith("#")),
);
const reported = findings.filter((finding) => !ignored.has(finding.Fingerprint));
fs.appendFileSync(process.env.FAKE_GITLEAKS_LOG, JSON.stringify({
  mode, args, cwd: process.cwd(), seen,
  ignore: fs.readFileSync(ignorePath, "utf8"),
  gitleaksEnv: Object.keys(process.env).filter((key) => key.startsWith("GITLEAKS_")),
}) + "\\n");
if (plan.touch) fs.writeFileSync(path.join(process.env.FAKE_GITLEAKS_REPO, "tocado.txt"), "x");
const out = [];
if (plan.raw) out.push(plan.raw);
if (mode === "history" && !plan.noCommitsLine) out.push("12:00PM INF " + commits + " commits scanned.");
if (plan.errorLine) out.push("12:00PM ERR fallo simulado");
out.push(reported.length === 0 ? "12:00PM INF no leaks found" : "12:00PM WRN leaks found: " + reported.length);
process.stdout.write(out.join("\\n") + "\\n");
process.stderr.write(plan.raw ? plan.raw + "\\n" : "");
const report = option("--report-path");
if (!plan.noReport) {
  const body = plan.report !== undefined ? plan.report : JSON.stringify(plan.findings !== undefined ? plan.findings : reported);
  fs.writeFileSync(report, body);
}
const exitCode = Number(option("--exit-code"));
process.exit(plan.exit !== undefined ? plan.exit : reported.length > 0 ? exitCode : 0);
`;

interface Result {
  readonly code: number | string | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface Invocation {
  readonly mode: string;
  readonly args: string[];
  readonly cwd: string;
  readonly seen: string[];
  readonly ignore: string;
  readonly gitleaksEnv: string[];
}

interface Workspace {
  readonly dir: string;
  readonly temp: string;
  readonly log: string;
  readonly gitConfig: string;
}

let root = "";

const sha256 = (data: Buffer | string): string =>
  createHash("sha256").update(data).digest("hex");

const iso = (time: number): string => new Date(time).toISOString();

const IGNORE_HEADER = "# Huellas exceptuadas.\n";

function registry(exceptions: readonly object[] | string): string {
  const body =
    typeof exceptions === "string"
      ? exceptions
      : JSON.stringify({ schemaVersion: 1, exceptions });
  return `# Excepciones\n\nTexto explicativo.\n\n\`\`\`json\n${body}\n\`\`\`\n`;
}

function exception(fingerprint: string, overrides: object = {}): object {
  return {
    fingerprint,
    owner: "mantenedor",
    justification: "Falso positivo sintético de prueba.",
    approvedAt: iso(NOW - DAY_MS),
    reviewBy: iso(NOW + DAY_MS),
    ...overrides,
  };
}

function gitEnv(workspace: Pick<Workspace, "gitConfig">): NodeJS.ProcessEnv {
  // Entorno construido desde cero, sin `NODE_ENV`.
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: workspace.gitConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Prueba",
    GIT_AUTHOR_EMAIL: "prueba@example.invalid",
    GIT_COMMITTER_NAME: "Prueba",
    GIT_COMMITTER_EMAIL: "prueba@example.invalid",
  };
  return env as NodeJS.ProcessEnv;
}

function git(workspace: Workspace, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: workspace.dir,
    env: gitEnv(workspace),
    encoding: "utf8",
  });
}

function write(workspace: Workspace, file: string, content: string): void {
  const target = path.join(workspace.dir, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function installFake(dir: string, content = FAKE_GITLEAKS): void {
  const bin = path.join(dir, ".tools/bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, "gitleaks"), content, { mode: 0o755 });
}

function lock(hash = sha256(FAKE_GITLEAKS)): string {
  return JSON.stringify({
    schemaVersion: 1,
    tools: { gitleaks: { platforms: { [PLATFORM]: { binarySha256: hash } } } },
  });
}

// Repositorio con el script, el lock sintético, los registros vacíos, un
// `.gitignore` y un commit base.
function workspace(): Workspace {
  const base = mkdtempSync(path.join(root, "case-"));
  const dir = path.join(base, "repo");
  const temp = path.join(base, "tmp");
  mkdirSync(dir);
  mkdirSync(temp);
  const gitConfig = path.join(base, "gitconfig");
  writeFileSync(gitConfig, "");
  const created: Workspace = {
    dir,
    temp,
    log: path.join(base, "gitleaks.log"),
    gitConfig,
  };
  git(created, "init", "--quiet", "--initial-branch=main");
  write(created, "scripts/check-secrets.mjs", readFileSync(SCRIPT, "utf8"));
  write(created, "scripts/tools/tools.lock.json", lock());
  write(created, ".gitleaksignore", IGNORE_HEADER);
  write(created, "docs/engineering/security-exceptions.md", registry([]));
  write(created, ".gitignore", ".tools/\n.env.*\n");
  write(created, "limpio.txt", "sin secretos\n");
  git(created, "add", "--all");
  git(created, "commit", "--quiet", "--message", "base");
  installFake(dir);
  return created;
}

function run(
  workspace: Workspace,
  {
    plan = {},
    extraEnv = {},
    preload = [] as readonly string[],
  }: {
    plan?: object;
    extraEnv?: Record<string, string>;
    preload?: readonly string[];
  } = {},
): Promise<Result> {
  const env = {
    ...gitEnv(workspace),
    TMPDIR: workspace.temp,
    FAKE_GITLEAKS_LOG: workspace.log,
    FAKE_GITLEAKS_REPO: workspace.dir,
    FAKE_GITLEAKS_PLAN: JSON.stringify(plan),
    ...extraEnv,
  };
  const clock = `data:text/javascript,Date.now=()=>${String(NOW)}`;
  const args = [
    ...[clock, ...preload].flatMap((module) => ["--import", module]),
    "scripts/check-secrets.mjs",
  ];
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      args,
      {
        cwd: workspace.dir,
        env,
        timeout: TIMEOUT_MS,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        resolve({
          code: error === null ? 0 : (error.code ?? null),
          stdout,
          stderr,
        });
      },
    );
  });
}

function invocations(workspace: Workspace): Invocation[] {
  if (!existsSync(workspace.log)) {
    return [];
  }
  return readFileSync(workspace.log, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Invocation);
}

function status(workspace: Workspace): string {
  return git(workspace, "status", "--porcelain=v1", "--untracked-files=all");
}

// Salida segura y sin restos: sin el marcador, sin rutas absolutas del caso y
// sin temporales del script.
function expectSafe(workspace: Workspace, result: Result): void {
  const output = result.stdout + result.stderr;
  expect(output).not.toContain(MARKER);
  expect(output).not.toContain(root);
  expect(readdirSync(workspace.temp)).toEqual([]);
}

async function runChecked(
  workspace: Workspace,
  options: Parameters<typeof run>[1] = {},
): Promise<Result> {
  const before = status(workspace);
  const result = await run(workspace, options);
  expect(status(workspace)).toBe(before);
  expectSafe(workspace, result);
  return result;
}

beforeAll(() => {
  // Ruta real: en macOS el temporal del sistema es un enlace simbólico.
  root = realpathSync(
    mkdtempSync(path.join(tmpdir(), "aulanorma-check-secrets-")),
  );
});

afterAll(() => {
  if (root !== "") {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("tres análisis separados", () => {
  test(
    "un repositorio limpio pasa los tres análisis con las opciones exigidas",
    async () => {
      const ws = workspace();
      const result = await runChecked(ws);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        "Historial alcanzable desde HEAD: sin hallazgos.",
      );
      expect(result.stdout).toContain("Índice de Git: sin hallazgos.");
      expect(result.stdout).toContain(
        "Árbol de trabajo (0 fichero(s) modificados o nuevos): sin hallazgos.",
      );
      const calls = invocations(ws);
      expect(calls.map((call) => call.mode)).toEqual([
        "history",
        "staged",
        "dir",
      ]);
      for (const call of calls) {
        for (const option of [
          "--redact",
          "--no-banner",
          "--verbose",
          "--ignore-gitleaks-allow",
        ]) {
          expect(call.args).toContain(option);
        }
        expect(call.args).not.toContain("--all");
        expect(call.args[call.args.indexOf("--exit-code") + 1]).toBe("10");
        expect(call.ignore).toBe(IGNORE_HEADER);
        expect(call.cwd.startsWith(ws.dir)).toBe(call.mode !== "dir");
      }
      expect(calls[0]?.args).toContain("--log-opts=--full-history HEAD");
      expect(calls[1]?.args).toEqual(
        expect.arrayContaining(["--pre-commit", "--staged"]),
      );
    },
    TIMEOUT_MS,
  );

  test(
    "detecta en el historial un secreto añadido y borrado después",
    async () => {
      const ws = workspace();
      write(ws, "antiguo.txt", `valor ${MARKER}\n`);
      git(ws, "add", "antiguo.txt");
      git(ws, "commit", "--quiet", "--message", "añade");
      const commit = git(ws, "rev-parse", "HEAD").trim();
      git(ws, "rm", "--quiet", "antiguo.txt");
      git(ws, "commit", "--quiet", "--message", "borra");
      const result = await runChecked(ws);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        `Historial alcanzable desde HEAD: 1 hallazgo(s) no exceptuado(s):\n  huella ${commit}:antiguo.txt:${RULE}:1 | fichero antiguo.txt | regla ${RULE} | línea 1`,
      );
      expect(result.stdout).toContain("Índice de Git: sin hallazgos.");
      expect(result.stderr).toContain(
        "check:secrets: hay hallazgos no exceptuados.",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "detecta en el índice un secreto preparado aunque el árbol ya esté limpio",
    async () => {
      const ws = workspace();
      write(ws, "preparado.txt", `valor ${MARKER}\n`);
      git(ws, "add", "preparado.txt");
      write(ws, "preparado.txt", "contenido limpio\n");
      const result = await runChecked(ws);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        `Índice de Git: 1 hallazgo(s) no exceptuado(s):\n  huella preparado.txt:${RULE}:1`,
      );
      expect(result.stdout).toContain(
        "Árbol de trabajo (1 fichero(s) modificados o nuevos): sin hallazgos.",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "detecta en el árbol un fichero nuevo y uno versionado modificado, con su ruta relativa",
    async () => {
      const ws = workspace();
      write(ws, "sub/nuevo.txt", `\nvalor ${MARKER}\n`);
      write(ws, "limpio.txt", `modificado ${MARKER}\n`);
      const result = await runChecked(ws);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        `Árbol de trabajo (2 fichero(s) modificados o nuevos): 2 hallazgo(s) no exceptuado(s):\n  huella limpio.txt:${RULE}:1 | fichero limpio.txt | regla ${RULE} | línea 1\n  huella sub/nuevo.txt:${RULE}:2 | fichero sub/nuevo.txt | regla ${RULE} | línea 2`,
      );
      expect(result.stdout).toContain("Índice de Git: sin hallazgos.");
    },
    TIMEOUT_MS,
  );

  test(
    "no copia ignorados, enlaces, directorios enlazados ni borrados",
    async () => {
      const ws = workspace();
      const outside = mkdtempSync(path.join(root, "outside-"));
      writeFileSync(path.join(outside, "fuera.txt"), `valor ${MARKER}\n`);
      writeFileSync(path.join(outside, "f.txt"), `valor ${MARKER}\n`);
      write(ws, "enlazado/f.txt", "limpio\n");
      write(ws, "borrado.txt", "limpio\n");
      git(ws, "add", "--all");
      git(ws, "commit", "--quiet", "--message", "más ficheros");
      write(ws, ".env.development.local", `CLAVE=${MARKER}\n`);
      symlinkSync(
        path.join(outside, "fuera.txt"),
        path.join(ws.dir, "enlace.txt"),
      );
      rmSync(path.join(ws.dir, "enlazado"), { recursive: true });
      symlinkSync(outside, path.join(ws.dir, "enlazado"));
      unlinkSync(path.join(ws.dir, "borrado.txt"));
      write(ws, "nombre con espacios.txt", "limpio\n");
      const result = await runChecked(ws);

      expect(result.code).toBe(0);
      const tree = invocations(ws).find((call) => call.mode === "dir");
      expect(tree?.seen).toEqual(["nombre con espacios.txt"]);
    },
    TIMEOUT_MS,
  );
});

describe("excepciones", () => {
  function exceptedWorkspace(entry: object): Workspace {
    const ws = workspace();
    write(ws, "falso.txt", `valor ${MARKER}\n`);
    git(ws, "add", "falso.txt");
    git(ws, "commit", "--quiet", "--message", "falso positivo");
    const commit = git(ws, "rev-parse", "HEAD").trim();
    const fingerprint = `${commit}:falso.txt:${RULE}:1`;
    write(ws, ".gitleaksignore", `${IGNORE_HEADER}${fingerprint}\n`);
    write(
      ws,
      "docs/engineering/security-exceptions.md",
      registry([exception(fingerprint, entry)]),
    );
    git(ws, "add", "--all");
    git(ws, "commit", "--quiet", "--message", "excepción");
    return ws;
  }

  test(
    "una excepción vigente omite su huella en el análisis",
    async () => {
      const ws = exceptedWorkspace({});
      const result = await runChecked(ws);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Excepciones de secretos vigentes: 1.");
    },
    TIMEOUT_MS,
  );

  test.each([
    [
      "límites incluidos: aprobada hace exactamente 90 días y revisión en este instante",
      { approvedAt: iso(NOW - 90 * DAY_MS), reviewBy: iso(NOW) },
      0,
    ],
    [
      "aprobada en este mismo instante",
      { approvedAt: iso(NOW), reviewBy: iso(NOW) },
      0,
    ],
    [
      "caducada por 1 ms",
      { approvedAt: iso(NOW - DAY_MS), reviewBy: iso(NOW - 1) },
      1,
    ],
    [
      "aprobada 1 ms en el futuro",
      { approvedAt: iso(NOW + 1), reviewBy: iso(NOW + DAY_MS) },
      1,
    ],
    [
      "revisión 90 días y 1 ms después de la aprobación",
      {
        approvedAt: iso(NOW - DAY_MS),
        reviewBy: iso(NOW - DAY_MS + 90 * DAY_MS + 1),
      },
      1,
    ],
    [
      "revisión anterior a la aprobación",
      { approvedAt: iso(NOW - 1), reviewBy: iso(NOW - 2) },
      1,
    ],
    ["fecha sin hora", { reviewBy: "2026-07-01" }, 1],
    [
      // Normalizada sería el 1 de mayo y cumpliría las demás reglas.
      "fecha imposible",
      { approvedAt: "2026-04-31T12:00:00.000Z" },
      1,
    ],
    [
      "fecha con zona horaria",
      { reviewBy: "2026-06-16T12:00:00.000+00:00" },
      1,
    ],
  ] as const)(
    "fechas: %s",
    async (_name, entry, code) => {
      const ws = exceptedWorkspace(entry);
      const result = await runChecked(ws);

      expect(result.code).toBe(code);
      if (code === 1) {
        expect(result.stderr).toContain(
          "Las excepciones de secretos no son válidas:",
        );
        expect(invocations(ws)).toEqual([]);
      }
    },
    TIMEOUT_MS,
  );

  const valid = (fingerprint: string): object => exception(fingerprint);
  const cases: readonly (readonly [string, string, string, string])[] = [
    [
      "huella de .gitleaksignore sin entrada",
      `${IGNORE_HEADER}a.txt:regla:1\n`,
      registry([]),
      "huella de .gitleaksignore sin entrada en el registro: a.txt:regla:1",
    ],
    [
      "entrada del registro sin huella",
      IGNORE_HEADER,
      registry([valid("a.txt:regla:1")]),
      "entrada del registro sin huella en .gitleaksignore: a.txt:regla:1",
    ],
    [
      "huella repetida en .gitleaksignore",
      `${IGNORE_HEADER}a.txt:regla:1\na.txt:regla:1\n`,
      registry([valid("a.txt:regla:1")]),
      ".gitleaksignore: huella repetida: a.txt:regla:1",
    ],
    [
      "huella repetida en el registro",
      `${IGNORE_HEADER}a.txt:regla:1\n`,
      registry([valid("a.txt:regla:1"), valid("a.txt:regla:1")]),
      "registro: huella repetida: a.txt:regla:1",
    ],
    [
      "sin bloque json",
      IGNORE_HEADER,
      "# Excepciones\n\nSin registro.\n",
      "registro: debe contener exactamente un bloque json cerrado.",
    ],
    [
      "dos bloques json",
      IGNORE_HEADER,
      `${registry([])}\n\`\`\`json\n{}\n\`\`\`\n`,
      "registro: debe contener exactamente un bloque json cerrado.",
    ],
    [
      "json inválido",
      IGNORE_HEADER,
      registry("{"),
      "registro: el bloque json no es válido.",
    ],
    [
      "otra versión de esquema",
      IGNORE_HEADER,
      registry('{"schemaVersion":2,"exceptions":[]}'),
      'registro: debe ser { "schemaVersion": 1, "exceptions": [...] }.',
    ],
    [
      "campo inesperado",
      `${IGNORE_HEADER}a.txt:regla:1\n`,
      registry([{ ...valid("a.txt:regla:1"), extra: "x" }]),
      "registro, excepción 1: debe tener exactamente fingerprint, owner, justification, approvedAt, reviewBy.",
    ],
    [
      "campo ausente",
      `${IGNORE_HEADER}a.txt:regla:1\n`,
      registry([
        {
          fingerprint: "a.txt:regla:1",
          owner: "mantenedor",
          approvedAt: iso(NOW),
          reviewBy: iso(NOW),
        },
      ]),
      "registro, excepción 1: debe tener exactamente",
    ],
    [
      "responsable vacío",
      `${IGNORE_HEADER}a.txt:regla:1\n`,
      registry([exception("a.txt:regla:1", { owner: "" })]),
      "registro, excepción 1: owner no puede estar vacío.",
    ],
    [
      "justificación solo con espacios",
      `${IGNORE_HEADER}a.txt:regla:1\n`,
      registry([exception("a.txt:regla:1", { justification: "   " })]),
      "registro, excepción 1: justification no puede estar vacío.",
    ],
  ];

  test.each(cases)(
    "rechaza el registro sin ejecutar Gitleaks: %s",
    async (_name, ignore, markdown, message) => {
      const ws = workspace();
      write(ws, ".gitleaksignore", ignore);
      write(ws, "docs/engineering/security-exceptions.md", markdown);
      const result = await runChecked(ws);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
      expect(result.stderr).toContain("check:secrets: no superado.");
      expect(invocations(ws)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "falla si falta .gitleaksignore",
    async () => {
      const ws = workspace();
      unlinkSync(path.join(ws.dir, ".gitleaksignore"));
      const result = await runChecked(ws);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Falta .gitleaksignore.");
      expect(invocations(ws)).toEqual([]);
    },
    TIMEOUT_MS,
  );
});

describe("herramienta y repositorio", () => {
  const cases: readonly (readonly [string, (ws: Workspace) => void, string])[] =
    [
      [
        "falta Gitleaks",
        (ws) => {
          rmSync(path.join(ws.dir, ".tools"), { recursive: true });
        },
        "Falta .tools/bin/gitleaks",
      ],
      [
        "su SHA-256 no coincide",
        (ws) => {
          installFake(ws.dir, `${FAKE_GITLEAKS}// alterado\n`);
        },
        "El SHA-256 de .tools/bin/gitleaks no coincide con tools.lock.json",
      ],
      [
        "es un enlace simbólico",
        (ws) => {
          const bin = path.join(ws.dir, ".tools/bin");
          cpSync(path.join(bin, "gitleaks"), path.join(ws.dir, ".tools/real"));
          unlinkSync(path.join(bin, "gitleaks"));
          symlinkSync(
            path.join(ws.dir, ".tools/real"),
            path.join(bin, "gitleaks"),
          );
        },
        "Falta .tools/bin/gitleaks o no es un fichero regular",
      ],
      [
        "el lock no fija su SHA-256",
        (ws) => {
          write(
            ws,
            "scripts/tools/tools.lock.json",
            '{"schemaVersion":1,"tools":{}}',
          );
        },
        "tools.lock.json no fija el SHA-256 de Gitleaks",
      ],
      [
        "existe .gitleaks.toml",
        (ws) => {
          write(ws, ".gitleaks.toml", "title = 'propia'\n");
        },
        "No se admite .gitleaks.toml",
      ],
    ];

  test.each(cases)(
    "falla cerrado si %s",
    async (_name, prepare, message) => {
      const ws = workspace();
      prepare(ws);
      const result = await runChecked(ws);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
      expect(invocations(ws)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "falla cerrado en una plataforma no admitida",
    async () => {
      const ws = workspace();
      const result = await runChecked(ws, {
        preload: [
          'data:text/javascript,Object.defineProperty(process,"platform",{value:"win32"})',
        ],
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Plataforma no admitida: win32-");
      expect(invocations(ws)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "falla cerrado en un repositorio superficial",
    async () => {
      const ws = workspace();
      git(ws, "commit", "--quiet", "--allow-empty", "--message", "segundo");
      const shallow: Workspace = {
        ...ws,
        dir: path.join(path.dirname(ws.dir), "superficial"),
      };
      execFileSync(
        "git",
        ["clone", "--quiet", "--depth", "1", `file://${ws.dir}`, shallow.dir],
        { env: gitEnv(ws) },
      );
      installFake(shallow.dir);
      const result = await runChecked(shallow);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("El repositorio es superficial");
      expect(invocations(shallow)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "no transmite las variables GITLEAKS_* que cambiarían la configuración",
    async () => {
      const ws = workspace();
      const result = await runChecked(ws, {
        extraEnv: {
          GITLEAKS_CONFIG: path.join(ws.dir, "otra.toml"),
          GITLEAKS_CONFIG_TOML: "title = 'propia'",
        },
      });

      expect(result.code).toBe(0);
      expect(invocations(ws).map((call) => call.gitleaksEnv)).toEqual([
        [],
        [],
        [],
      ]);
    },
    TIMEOUT_MS,
  );
});

describe("fallos del análisis", () => {
  const failures: readonly (readonly [string, object])[] = [
    ["código de salida inesperado", { exit: 2 }],
    ["línea de error con código 0", { errorLine: true }],
    ["informe ausente", { noReport: true }],
    ["informe truncado", { report: '[{"RuleID":' }],
    ["informe que no es una lista", { report: "{}" }],
    ["hallazgos anunciados con un informe vacío", { exit: 10, findings: [] }],
    [
      "informe con hallazgos y código 0",
      {
        exit: 0,
        findings: [
          { RuleID: "r", File: "f", StartLine: 1, Fingerprint: "f:r:1" },
        ],
      },
    ],
  ];

  test.each(failures)(
    "el historial falla si hay %s",
    async (_name, history) => {
      const ws = workspace();
      const result = await runChecked(ws, { plan: { history } });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "Historial alcanzable desde HEAD: el análisis no pudo completarse.",
      );
      expect(invocations(ws).map((call) => call.mode)).toEqual([
        "history",
        "staged",
        "dir",
      ]);
    },
    TIMEOUT_MS,
  );

  test.each([
    ["staged", "Índice de Git: el análisis no pudo completarse."],
    [
      "dir",
      "Árbol de trabajo (0 fichero(s) modificados o nuevos): el análisis no pudo completarse.",
    ],
  ] as const)(
    "el análisis %s falla si Gitleaks termina con un código inesperado",
    async (mode, message) => {
      const ws = workspace();
      const result = await runChecked(ws, { plan: { [mode]: { exit: 1 } } });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(message);
    },
    TIMEOUT_MS,
  );

  test(
    "el historial falla si Gitleaks no informa de los commits analizados",
    async () => {
      const ws = workspace();
      const result = await runChecked(ws, {
        plan: { history: { noCommitsLine: true } },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "Historial alcanzable desde HEAD: el análisis no pudo completarse.",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "no muestra la salida cruda de Gitleaks",
    async () => {
      const ws = workspace();
      const result = await runChecked(ws, {
        plan: { dir: { raw: `Secret: ${MARKER} en ${root}` } },
      });

      expect(result.code).toBe(0);
    },
    TIMEOUT_MS,
  );
});

describe("integridad del repositorio", () => {
  test.each([
    ["tras un análisis correcto", {}],
    ["también cuando el análisis falla", { exit: 2 }],
  ] as const)(
    "falla si git status cambia %s",
    async (_name, extra) => {
      const ws = workspace();
      const result = await run(ws, {
        plan: { dir: { touch: true, ...extra } },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "El estado de Git del repositorio cambió durante el análisis.",
      );
      expectSafe(ws, result);
    },
    TIMEOUT_MS,
  );
});
