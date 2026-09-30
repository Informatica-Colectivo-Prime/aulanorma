// Control de seguridad de los workflows (paso previo a T056 y T057;
// research.md, R13; FR-014).
//
// Ejecuta el `scripts/check-workflows.mjs` real como proceso hijo en proyectos
// desechables. zizmor se sustituye por un analizador falso escrito en
// JavaScript, instalado en `.tools/bin/zizmor` con su SHA-256 en un
// `tools.lock.json` sintético: el envoltorio lo verifica igual que el binario
// real. El falso registra cada invocación, marca como `template-injection` la
// línea de cada workflow que contiene el marcador sintético y emite el informe
// JSON v1. Por una variable propia puede simular salidas y códigos
// incoherentes; el script productivo no la lee.
//
// El marcador se genera en cada ejecución. No hay red: la ejecución real de
// zizmor contra una inyección de plantilla se comprueba fuera de esta suite,
// porque `check:test` no instala las herramientas.
import { execFile } from "node:child_process";
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
const SCRIPT = path.join(repoRoot, "scripts/check-workflows.mjs");
const VERIFIED_TOOL = path.join(repoRoot, "scripts/tools/verified-tool.mjs");
const TIMEOUT_MS = 30_000;
const PLATFORM = `${process.platform}-${process.arch}`;

// Marcador sintético, distinto en cada ejecución de la suite.
const MARKER = `INYECCION_SINTETICA_${randomBytes(6).toString("hex").toUpperCase()}`;

const ARGS = [
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
];

const FAKE_ZIZMOR = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const plan = JSON.parse(process.env.FAKE_ZIZMOR_PLAN || "{}");
const files = args.slice(args.indexOf("--") + 1);
fs.appendFileSync(process.env.FAKE_ZIZMOR_LOG, JSON.stringify({
  args,
  cwd: process.cwd(),
  self: process.argv[1],
  env: Object.keys(process.env).filter((key) => key.startsWith("ZIZMOR_") || key.startsWith("GH_") || key === "GITHUB_TOKEN"),
}) + "\\n");
const pattern = /INYECCION_SINTETICA_[0-9A-F]{12}/;
const findings = [];
for (const file of files) {
  fs.readFileSync(file, "utf8").split("\\n").forEach((text, row) => {
    if (pattern.test(text)) {
      findings.push({
        ident: "template-injection",
        desc: "code injection via template expansion",
        determinations: { confidence: "High", severity: "High", persona: "Regular" },
        locations: [
          { symbolic: { key: { Local: { verbatim_path: file } }, kind: "Hidden" },
            concrete: { location: { start_point: { row: 0, column: 0 } }, feature: text } },
          { symbolic: { key: { Local: { verbatim_path: file } }, kind: "Primary" },
            concrete: { location: { start_point: { row, column: 4 } }, feature: text } },
        ],
      });
    }
  });
}
process.stderr.write(" INFO zizmor: " + (plan.stderr || "fake") + "\\n");
if (plan.signal) process.kill(process.pid, plan.signal);
const body = plan.stdout !== undefined ? plan.stdout : JSON.stringify(plan.findings !== undefined ? plan.findings : findings);
process.stdout.write(body);
process.exit(plan.exit !== undefined ? plan.exit : findings.length > 0 ? 14 : 0);
`;

const CLEAN_WORKFLOW = [
  "name: limpio",
  "on:",
  "  pull_request:",
  "    branches: [main]",
  "permissions: {}",
  "jobs:",
  "  limpio:",
  "    runs-on: ubuntu-24.04",
  "    permissions: {}",
  "    steps:",
  "      - run: echo limpio",
  "",
].join("\n");

const INJECTED_WORKFLOW = CLEAN_WORKFLOW.replace(
  "      - run: echo limpio",
  `      - run: echo limpio\n      - run: echo "${MARKER}"`,
);

interface Result {
  readonly code: number | string | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface Invocation {
  readonly args: string[];
  readonly cwd: string;
  readonly self: string;
  readonly env: string[];
}

interface Workspace {
  readonly dir: string;
  readonly temp: string;
  readonly log: string;
}

let root = "";

const sha256 = (data: Buffer | string): string =>
  createHash("sha256").update(data).digest("hex");

function write(workspace: Workspace, file: string, content: string): void {
  const target = path.join(workspace.dir, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function installFake(dir: string, content = FAKE_ZIZMOR): void {
  const bin = path.join(dir, ".tools/bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, "zizmor"), content, { mode: 0o755 });
}

function lock(hash = sha256(FAKE_ZIZMOR)): string {
  return JSON.stringify({
    schemaVersion: 1,
    tools: { zizmor: { platforms: { [PLATFORM]: { binarySha256: hash } } } },
  });
}

// Proyecto con el script, su módulo de verificación, el lock sintético, el
// zizmor falso y un workflow limpio.
function workspace(): Workspace {
  const base = mkdtempSync(path.join(root, "case-"));
  const dir = path.join(base, "repo");
  const temp = path.join(base, "tmp");
  mkdirSync(dir);
  mkdirSync(temp);
  const created: Workspace = { dir, temp, log: path.join(base, "zizmor.log") };
  write(created, "scripts/check-workflows.mjs", readFileSync(SCRIPT, "utf8"));
  write(
    created,
    "scripts/tools/verified-tool.mjs",
    readFileSync(VERIFIED_TOOL, "utf8"),
  );
  write(created, "scripts/tools/tools.lock.json", lock());
  write(created, ".github/workflows/ci.yml", CLEAN_WORKFLOW);
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
  // Entorno construido desde cero, sin `NODE_ENV`.
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    TMPDIR: workspace.temp,
    FAKE_ZIZMOR_LOG: workspace.log,
    FAKE_ZIZMOR_PLAN: JSON.stringify(plan),
    ...extraEnv,
  };
  const args = [
    ...preload.flatMap((module) => ["--import", module]),
    "scripts/check-workflows.mjs",
  ];
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      args,
      {
        cwd: workspace.dir,
        env: env as NodeJS.ProcessEnv,
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

// Salida segura y sin restos: sin el marcador ni fragmentos del workflow, sin
// rutas absolutas del caso, sin la salida de zizmor y sin temporales.
function expectSafe(workspace: Workspace, result: Result): void {
  const output = result.stdout + result.stderr;
  expect(output).not.toContain(MARKER);
  expect(output).not.toContain("echo");
  expect(output).not.toContain(root);
  expect(output).not.toContain("INFO zizmor");
  expect(readdirSync(workspace.temp)).toEqual([]);
}

async function runChecked(
  workspace: Workspace,
  options: Parameters<typeof run>[1] = {},
): Promise<Result> {
  const result = await run(workspace, options);
  expectSafe(workspace, result);
  return result;
}

beforeAll(() => {
  // Ruta real: en macOS el temporal del sistema es un enlace simbólico.
  root = realpathSync(
    mkdtempSync(path.join(tmpdir(), "aulanorma-check-workflows-")),
  );
});

afterAll(() => {
  if (root !== "") {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("análisis", () => {
  test(
    "un workflow limpio pasa con las opciones exigidas y la copia verificada",
    async () => {
      const ws = workspace();
      const result = await runChecked(ws);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Workflows analizados: 1.");
      expect(result.stdout).toContain("check:workflows: sin hallazgos.");
      const calls = invocations(ws);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.args).toEqual([...ARGS, ".github/workflows/ci.yml"]);
      expect(calls[0]?.args).not.toContain("--fix");
      expect(calls[0]?.cwd).toBe(ws.dir);
      // Se ejecuta la copia del temporal, no `.tools/bin/zizmor`.
      expect(calls[0]?.self.startsWith(ws.temp)).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "analiza solo los YAML regulares del directorio, en orden",
    async () => {
      const ws = workspace();
      write(ws, ".github/workflows/b.yaml", CLEAN_WORKFLOW);
      write(ws, ".github/workflows/a.yml", CLEAN_WORKFLOW);
      write(ws, ".github/workflows/README.md", "# Nota\n");
      write(ws, ".github/workflows/sub/otro.yml", CLEAN_WORKFLOW);
      const result = await runChecked(ws);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Workflows analizados: 3.");
      expect(invocations(ws)[0]?.args.slice(ARGS.length)).toEqual([
        ".github/workflows/a.yml",
        ".github/workflows/b.yaml",
        ".github/workflows/ci.yml",
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "falla con cada hallazgo mostrando solo regla, gravedad, fichero y línea",
    async () => {
      const ws = workspace();
      write(ws, ".github/workflows/ci.yml", INJECTED_WORKFLOW);
      write(ws, ".github/workflows/otro.yml", INJECTED_WORKFLOW);
      const result = await runChecked(ws);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("zizmor: 2 hallazgo(s):");
      expect(result.stderr).toContain(
        "  regla template-injection | gravedad High | fichero .github/workflows/ci.yml | línea 12",
      );
      expect(result.stderr).toContain(
        "  regla template-injection | gravedad High | fichero .github/workflows/otro.yml | línea 12",
      );
      expect(result.stderr).toContain("check:workflows: no superado.");
      expect(result.stdout).not.toContain("sin hallazgos");
    },
    TIMEOUT_MS,
  );
});

describe("herramienta y plataforma", () => {
  const cases: readonly (readonly [string, (ws: Workspace) => void, string])[] =
    [
      [
        "falta zizmor",
        (ws) => {
          rmSync(path.join(ws.dir, ".tools"), { recursive: true });
        },
        "Falta .tools/bin/zizmor o no es un fichero regular: ejecuta npm run tools:install.",
      ],
      [
        "su SHA-256 no coincide",
        (ws) => {
          installFake(ws.dir, `${FAKE_ZIZMOR}// alterado\n`);
        },
        "El SHA-256 de .tools/bin/zizmor no coincide con tools.lock.json: ejecuta npm run tools:install.",
      ],
      [
        "es un enlace simbólico",
        (ws) => {
          const bin = path.join(ws.dir, ".tools/bin");
          cpSync(path.join(bin, "zizmor"), path.join(ws.dir, ".tools/real"));
          unlinkSync(path.join(bin, "zizmor"));
          symlinkSync(
            path.join(ws.dir, ".tools/real"),
            path.join(bin, "zizmor"),
          );
        },
        "Falta .tools/bin/zizmor o no es un fichero regular",
      ],
      [
        ".tools es un enlace simbólico",
        (ws) => {
          const real = path.join(path.dirname(ws.dir), "tools-real");
          cpSync(path.join(ws.dir, ".tools"), real, { recursive: true });
          rmSync(path.join(ws.dir, ".tools"), { recursive: true });
          symlinkSync(real, path.join(ws.dir, ".tools"));
        },
        ".tools o .tools/bin no es un directorio real.",
      ],
      [
        ".tools/bin es un enlace simbólico",
        (ws) => {
          const real = path.join(path.dirname(ws.dir), "bin-real");
          cpSync(path.join(ws.dir, ".tools/bin"), real, { recursive: true });
          rmSync(path.join(ws.dir, ".tools/bin"), { recursive: true });
          symlinkSync(real, path.join(ws.dir, ".tools/bin"));
        },
        ".tools o .tools/bin no es un directorio real.",
      ],
      [
        "es un directorio",
        (ws) => {
          unlinkSync(path.join(ws.dir, ".tools/bin/zizmor"));
          mkdirSync(path.join(ws.dir, ".tools/bin/zizmor"));
        },
        "Falta .tools/bin/zizmor o no es un fichero regular",
      ],
      [
        "el lock no fija su SHA-256",
        (ws) => {
          write(
            ws,
            "scripts/tools/tools.lock.json",
            JSON.stringify({
              schemaVersion: 1,
              tools: { gitleaks: { platforms: {} } },
            }),
          );
        },
        `tools.lock.json no fija el SHA-256 de zizmor para ${PLATFORM}.`,
      ],
      [
        "el lock tiene otra versión de esquema",
        (ws) => {
          write(
            ws,
            "scripts/tools/tools.lock.json",
            lock().replace('"schemaVersion":1', '"schemaVersion":2'),
          );
        },
        `tools.lock.json no fija el SHA-256 de zizmor para ${PLATFORM}.`,
      ],
      [
        "el lock no es JSON",
        (ws) => {
          write(ws, "scripts/tools/tools.lock.json", "{");
        },
        "No se pudo leer scripts/tools/tools.lock.json como JSON.",
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
      expect(result.stderr).toContain("check:workflows: no superado.");
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
});

describe("entradas", () => {
  const cases: readonly (readonly [string, (ws: Workspace) => void, string])[] =
    [
      [
        "no existe .github",
        (ws) => {
          rmSync(path.join(ws.dir, ".github"), { recursive: true });
        },
        "Falta .github/workflows o no es un directorio real",
      ],
      [
        "no existe .github/workflows",
        (ws) => {
          rmSync(path.join(ws.dir, ".github/workflows"), { recursive: true });
        },
        "Falta .github/workflows o no es un directorio real",
      ],
      [
        ".github/workflows es un fichero",
        (ws) => {
          rmSync(path.join(ws.dir, ".github/workflows"), { recursive: true });
          write(ws, ".github/workflows", CLEAN_WORKFLOW);
        },
        "Falta .github/workflows o no es un directorio real",
      ],
      [
        ".github/workflows es un enlace simbólico",
        (ws) => {
          const real = path.join(path.dirname(ws.dir), "workflows-real");
          cpSync(path.join(ws.dir, ".github/workflows"), real, {
            recursive: true,
          });
          rmSync(path.join(ws.dir, ".github/workflows"), { recursive: true });
          symlinkSync(real, path.join(ws.dir, ".github/workflows"));
        },
        "Falta .github/workflows o no es un directorio real",
      ],
      [
        ".github es un enlace simbólico",
        (ws) => {
          const real = path.join(path.dirname(ws.dir), "github-real");
          cpSync(path.join(ws.dir, ".github"), real, { recursive: true });
          rmSync(path.join(ws.dir, ".github"), { recursive: true });
          symlinkSync(real, path.join(ws.dir, ".github"));
        },
        "Falta .github/workflows o no es un directorio real",
      ],
      [
        "el directorio está vacío",
        (ws) => {
          unlinkSync(path.join(ws.dir, ".github/workflows/ci.yml"));
        },
        ".github/workflows no contiene ningún workflow YAML",
      ],
      [
        "solo hay ficheros que no son YAML",
        (ws) => {
          unlinkSync(path.join(ws.dir, ".github/workflows/ci.yml"));
          write(ws, ".github/workflows/README.md", "# Nota\n");
        },
        ".github/workflows no contiene ningún workflow YAML",
      ],
      [
        "un workflow es un enlace simbólico",
        (ws) => {
          write(ws, "fuera.yml", INJECTED_WORKFLOW);
          symlinkSync(
            path.join(ws.dir, "fuera.yml"),
            path.join(ws.dir, ".github/workflows/enlazado.yml"),
          );
        },
        ".github/workflows/enlazado.yml es un enlace simbólico: no se sigue.",
      ],
      [
        "hay un enlace simbólico que no es YAML",
        (ws) => {
          symlinkSync(
            path.join(ws.dir, "scripts"),
            path.join(ws.dir, ".github/workflows/dir"),
          );
        },
        ".github/workflows/dir es un enlace simbólico: no se sigue.",
      ],
      [
        "una entrada YAML es un directorio",
        (ws) => {
          mkdirSync(path.join(ws.dir, ".github/workflows/raro.yml"));
        },
        ".github/workflows/raro.yml no es un fichero regular.",
      ],
      [
        "un workflow supera el tamaño analizable",
        (ws) => {
          write(
            ws,
            ".github/workflows/grande.yml",
            `${CLEAN_WORKFLOW}#${"x".repeat(1024 * 1024)}\n`,
          );
        },
        ".github/workflows/grande.yml no es un fichero regular analizable.",
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
});

describe("sin excepciones de workflows", () => {
  test.each([
    "zizmor.yml",
    "zizmor.yaml",
    ".github/zizmor.yml",
    ".github/zizmor.yaml",
  ])(
    "rechaza la configuración %s",
    async (file) => {
      const ws = workspace();
      write(ws, file, "rules: {}\n");
      const result = await runChecked(ws);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        `No se admite ${file}: no hay excepciones de workflows.`,
      );
      expect(invocations(ws)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "rechaza una configuración que es un enlace simbólico roto",
    async () => {
      const ws = workspace();
      symlinkSync(
        path.join(ws.dir, "no-existe.yml"),
        path.join(ws.dir, "zizmor.yml"),
      );
      const result = await runChecked(ws);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("No se admite zizmor.yml");
      expect(invocations(ws)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test.each([
    ["en un comentario", "# zizmor: ignore[template-injection]"],
    ["con otro formato", "#ZIZMOR:IGNORE"],
  ])(
    "rechaza una directiva de supresión %s, con su fichero y línea",
    async (_name, directive) => {
      const ws = workspace();
      write(
        ws,
        ".github/workflows/ci.yml",
        INJECTED_WORKFLOW.replace(`"${MARKER}"`, `"${MARKER}" ${directive}`),
      );
      const result = await runChecked(ws);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "No se admiten directivas zizmor: ignore (no hay excepciones de workflows):\n  .github/workflows/ci.yml, línea 12",
      );
      expect(result.stderr).not.toContain("template-injection]");
      expect(invocations(ws)).toEqual([]);
    },
    TIMEOUT_MS,
  );
});

describe("entorno", () => {
  test(
    "no transmite GH_TOKEN, GITHUB_TOKEN, GH_HOST ni ZIZMOR_*",
    async () => {
      const ws = workspace();
      const value = `VALOR_${randomBytes(6).toString("hex")}`;
      const result = await runChecked(ws, {
        extraEnv: {
          GH_TOKEN: value,
          GITHUB_TOKEN: value,
          GH_HOST: value,
          ZIZMOR_GITHUB_TOKEN: value,
          ZIZMOR_CONFIG: path.join(ws.dir, "otra.yml"),
          ZIZMOR_OFFLINE: "false",
        },
      });

      expect(result.code).toBe(0);
      expect(invocations(ws).map((call) => call.env)).toEqual([[]]);
      expect(result.stdout + result.stderr).not.toContain(value);
    },
    TIMEOUT_MS,
  );
});

describe("análisis incompleto o salida no válida", () => {
  const finding = (overrides: object = {}): object => ({
    ident: "template-injection",
    determinations: { severity: "High" },
    locations: [
      {
        symbolic: {
          key: { Local: { verbatim_path: ".github/workflows/ci.yml" } },
          kind: "Primary",
        },
        concrete: { location: { start_point: { row: 3 } } },
      },
    ],
    ...overrides,
  });
  const located = (file: unknown, row: unknown): object =>
    finding({
      locations: [
        {
          symbolic: {
            key: { Local: { verbatim_path: file } },
            kind: "Primary",
          },
          concrete: { location: { start_point: { row } } },
        },
      ],
    });

  const failures: readonly (readonly [string, object])[] = [
    ["código de error de zizmor", { exit: 1, stdout: "" }],
    ["código de argumentos no válidos", { exit: 2, stdout: "" }],
    ["código de hallazgos desconocido", { exit: 15, findings: [finding()] }],
    ["terminación por señal", { signal: "SIGKILL" }],
    ["salida que no es JSON", { stdout: `no es JSON ${MARKER}` }],
    ["salida vacía", { stdout: "" }],
    ["JSON que no es una lista", { stdout: '{"findings":[]}' }],
    ["código 0 con hallazgos", { exit: 0, findings: [finding()] }],
    ["código de hallazgos sin hallazgos", { exit: 14, stdout: "[]" }],
    ["hallazgo sin regla", { exit: 14, findings: [finding({ ident: 7 })] }],
    [
      "regla con formato inesperado",
      { exit: 14, findings: [finding({ ident: "Regla Rara" })] },
    ],
    [
      "gravedad desconocida",
      {
        exit: 14,
        findings: [finding({ determinations: { severity: "Critica" } })],
      },
    ],
    ["sin ubicaciones", { exit: 14, findings: [finding({ locations: [] })] }],
    [
      "fichero absoluto",
      { exit: 14, findings: [located("/tmp/.github/workflows/ci.yml", 3)] },
    ],
    [
      "fichero no analizado",
      { exit: 14, findings: [located(".github/workflows/otro.yml", 3)] },
    ],
    [
      "línea negativa",
      { exit: 14, findings: [located(".github/workflows/ci.yml", -1)] },
    ],
    [
      "línea no entera",
      { exit: 14, findings: [located(".github/workflows/ci.yml", "3")] },
    ],
  ];

  test.each(failures)(
    "falla cerrado ante %s, sin mostrar la salida de zizmor",
    async (_name, plan) => {
      const ws = workspace();
      const result = await runChecked(ws, {
        plan: { ...plan, stderr: MARKER },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "zizmor: el análisis de los workflows no pudo completarse.",
      );
      expect(result.stderr).toContain("check:workflows: no superado.");
      expect(invocations(ws)).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  test(
    "usa la ubicación principal y numera las líneas desde 1",
    async () => {
      const ws = workspace();
      const result = await runChecked(ws, {
        plan: { exit: 13, findings: [located(".github/workflows/ci.yml", 0)] },
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "  regla template-injection | gravedad High | fichero .github/workflows/ci.yml | línea 1",
      );
    },
    TIMEOUT_MS,
  );
});
