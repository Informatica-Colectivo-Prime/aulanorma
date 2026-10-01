// Control de dependencias (T052; research.md, R12; FR-017 y FR-020).
//
// Ejecuta el `scripts/check-dependencies.mjs` real como proceso hijo en un
// directorio desechable, con un `npm` falso delante en el `PATH`. El falso
// devuelve respuestas deterministas de `npm audit --json` y de
// `npm audit signatures` según un plan y registra sus argumentos; el script
// productivo no lee esas variables. El reloj se fija con un módulo precargado
// para probar los límites exactos de las fechas. No hay red.
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const SCRIPT = path.join(repoRoot, "scripts/check-dependencies.mjs");
const TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const RAW = "SALIDA-CRUDA-DE-NPM";
const AUDIT_ARGS = [
  "audit",
  "--json",
  "--package-lock-only",
  "--include=prod",
  "--include=dev",
  "--include=optional",
  "--include=peer",
];

const GHSA_A = "GHSA-2345-6789-cfgh";
const GHSA_B = "GHSA-jmpq-rvwx-2345";
const GHSA_C = "GHSA-6789-cfgh-jmpq";

const FAKE_NPM = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify(args) + "\\n");
const plan = JSON.parse(process.env.FAKE_NPM_PLAN);
const step = args[1] === "signatures" ? plan.signatures : plan.audit;
process.stdout.write(step.stdout);
process.stderr.write("${RAW}\\n");
process.exit(step.code);
`;

type Severity = "info" | "low" | "moderate" | "high" | "critical";

interface Vulnerability {
  readonly severity: Severity;
  readonly via: readonly (string | object)[];
}

interface Step {
  readonly code: number;
  readonly stdout: string;
}

interface Plan {
  readonly audit: Step;
  readonly signatures?: Step;
}

interface Result {
  readonly code: number | string | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface Workspace {
  readonly dir: string;
  readonly bin: string;
  readonly nodeBin: string;
  readonly log: string;
  readonly summary: string;
}

let root = "";

const iso = (time: number): string => new Date(time).toISOString();

function advisory(
  name: string,
  severity: Severity,
  ghsa: string,
  url = `https://github.com/advisories/${ghsa}`,
): object {
  return {
    source: 1,
    name,
    dependency: name,
    title: "Aviso sintético",
    url,
    severity,
    cwe: [],
    cvss: { score: 0, vectorString: null },
    range: "<1.0.0",
  };
}

function report(vulnerabilities: Record<string, Vulnerability>): string {
  const counts: Record<string, number> = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
  };
  const entries: Record<string, object> = {};
  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    counts[vulnerability.severity] = (counts[vulnerability.severity] ?? 0) + 1;
    entries[name] = {
      name,
      severity: vulnerability.severity,
      isDirect: false,
      via: vulnerability.via,
      effects: [],
      range: "*",
      nodes: [`node_modules/${name}`],
      fixAvailable: false,
    };
  }
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: entries,
    metadata: {
      vulnerabilities: {
        ...counts,
        total: Object.keys(vulnerabilities).length,
      },
      dependencies: {
        prod: 1,
        dev: 1,
        optional: 0,
        peer: 0,
        peerOptional: 0,
        total: 2,
      },
    },
  });
}

const clean: Plan = { audit: { code: 0, stdout: report({}) } };

function audit(vulnerabilities: Record<string, Vulnerability>): Plan {
  return {
    audit: {
      code: Object.keys(vulnerabilities).length > 0 ? 1 : 0,
      stdout: report(vulnerabilities),
    },
  };
}

function exception(overrides: object = {}): object {
  return {
    advisory: GHSA_A,
    package: "alto",
    justification: "Sin ruta explotable en esta base sintética.",
    owner: "mantenedor",
    approvedAt: iso(NOW - DAY_MS),
    reviewBy: iso(NOW + DAY_MS),
    ...overrides,
  };
}

function workspace(exceptions: readonly object[] | string = []): Workspace {
  const dir = mkdtempSync(path.join(root, "case-"));
  const bin = path.join(dir, "bin");
  mkdirSync(path.join(dir, "project/scripts"), { recursive: true });
  mkdirSync(path.join(dir, "project/security"), { recursive: true });
  mkdirSync(bin);
  // Solo `node`, para el `npm` falso: el `npm` real nunca queda en el PATH.
  const nodeBin = path.join(dir, "node-bin");
  mkdirSync(nodeBin);
  symlinkSync(process.execPath, path.join(nodeBin, "node"));
  writeFileSync(
    path.join(dir, "project/scripts/check-dependencies.mjs"),
    readFileSync(SCRIPT),
  );
  writeFileSync(
    path.join(dir, "project/security/audit-exceptions.json"),
    typeof exceptions === "string"
      ? exceptions
      : JSON.stringify({ schemaVersion: 1, exceptions }),
  );
  writeFileSync(path.join(bin, "npm"), FAKE_NPM, { mode: 0o755 });
  return {
    dir,
    bin,
    nodeBin,
    log: path.join(dir, "npm.log"),
    summary: path.join(dir, "summary.md"),
  };
}

interface RunOptions {
  readonly npmOnPath?: boolean;
  readonly withSummary?: boolean;
  readonly summary?: string;
  readonly extraEnv?: Readonly<Record<string, string>>;
}

async function run(
  ws: Workspace,
  plan: Plan,
  {
    npmOnPath = true,
    withSummary = true,
    summary = ws.summary,
    extraEnv = {},
  }: RunOptions = {},
): Promise<Result> {
  const env: Record<string, string> = {
    PATH: [...(npmOnPath ? [ws.bin] : []), ws.nodeBin].join(path.delimiter),
    FAKE_NPM_LOG: ws.log,
    FAKE_NPM_PLAN: JSON.stringify({
      signatures: { code: 0, stdout: "firmas verificadas\n" },
      ...plan,
    }),
    ...extraEnv,
  };
  if (withSummary) {
    env.GITHUB_STEP_SUMMARY = summary;
  }
  const clock = `data:text/javascript,Date.now=()=>${String(NOW)}`;
  const result = await new Promise<Result>((resolve) => {
    execFile(
      process.execPath,
      ["--import", clock, "project/scripts/check-dependencies.mjs"],
      {
        cwd: ws.dir,
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
  // La salida nunca contiene la salida cruda de npm ni rutas del caso.
  expect(result.stdout + result.stderr).not.toContain(RAW);
  expect(result.stdout + result.stderr).not.toContain(root);
  return result;
}

function calls(ws: Workspace): string[][] {
  if (!existsSync(ws.log)) {
    return [];
  }
  return readFileSync(ws.log, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as string[]);
}

function summaryOf(ws: Workspace): string {
  return readFileSync(ws.summary, "utf8");
}

beforeAll(() => {
  root = realpathSync(
    mkdtempSync(path.join(tmpdir(), "aulanorma-check-dependencies-")),
  );
});

afterAll(() => {
  if (root !== "") {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("auditoría", () => {
  test(
    "sin vulnerabilidades y con firmas verificadas, el control se supera",
    async () => {
      const ws = workspace();
      const result = await run(ws, clean);

      expect(result.code).toBe(0);
      expect(result.stdout).toBe(
        "Dependencias auditadas del lockfile: 2.\n" +
          "Vulnerabilidades altas o críticas sin excepción: 0.\n" +
          "Sin vulnerabilidades medias ni bajas.\n" +
          "Firmas y atestaciones del registro: verificadas.\n" +
          "check:deps: superado.\n",
      );
      expect(calls(ws)).toEqual([AUDIT_ARGS, ["audit", "signatures"]]);
      expect(summaryOf(ws)).toBe(
        "## Dependencias: vulnerabilidades medias y bajas\n\nNo hay vulnerabilidades medias ni bajas.\n",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "incluye todos los tipos de dependencia aunque el entorno pida omitir las de desarrollo",
    async () => {
      const ws = workspace();
      const result = await run(ws, clean, {
        extraEnv: { npm_config_omit: "dev", NODE_ENV: "production" },
      });

      expect(result.code).toBe(0);
      expect(calls(ws)[0]).toEqual(AUDIT_ARGS);
    },
    TIMEOUT_MS,
  );

  test(
    "una vulnerabilidad alta sin excepción falla y las firmas se comprueban igualmente",
    async () => {
      const ws = workspace();
      const result = await run(
        ws,
        audit({
          alto: { severity: "high", via: [advisory("alto", "high", GHSA_A)] },
        }),
      );

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        `Vulnerabilidades altas o críticas sin excepción: 1.\n  - paquete alto | aviso ${GHSA_A} | gravedad alta | https://github.com/advisories/${GHSA_A}\n`,
      );
      expect(result.stderr).toBe("check:deps: no superado.\n");
      expect(calls(ws)).toEqual([AUDIT_ARGS, ["audit", "signatures"]]);
    },
    TIMEOUT_MS,
  );

  test(
    "resuelve las referencias indirectas de via hasta el aviso crítico",
    async () => {
      const ws = workspace();
      const result = await run(
        ws,
        audit({
          directo: { severity: "critical", via: ["intermedio"] },
          intermedio: { severity: "critical", via: ["profundo"] },
          profundo: {
            severity: "critical",
            via: [advisory("profundo", "critical", GHSA_B)],
          },
        }),
      );

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        `Vulnerabilidades altas o críticas sin excepción: 1.\n  - paquete profundo | aviso ${GHSA_B} | gravedad crítica |`,
      );
    },
    TIMEOUT_MS,
  );

  test(
    "una excepción vigente de la pareja exacta cubre el aviso alto",
    async () => {
      const ws = workspace([exception()]);
      const result = await run(
        ws,
        audit({
          alto: { severity: "high", via: [advisory("alto", "high", GHSA_A)] },
        }),
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        `Vulnerabilidades altas o críticas con excepción vigente: 1.\n  - paquete alto | aviso ${GHSA_A} | gravedad alta | https://github.com/advisories/${GHSA_A} | revisar antes de ${iso(NOW + DAY_MS)}`,
      );
    },
    TIMEOUT_MS,
  );

  test.each([
    ["el mismo aviso en otro paquete", { package: "otro" }],
    ["otro aviso del mismo paquete", { advisory: GHSA_C }],
  ])(
    "una excepción no cubre %s",
    async (_name, overrides) => {
      const ws = workspace([exception(overrides)]);
      const result = await run(
        ws,
        audit({
          alto: { severity: "high", via: [advisory("alto", "high", GHSA_A)] },
        }),
      );

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "Vulnerabilidades altas o críticas sin excepción: 1.",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "un aviso alto sin GHSA no puede exceptuarse",
    async () => {
      const ws = workspace([exception()]);
      const result = await run(
        ws,
        audit({
          alto: {
            severity: "high",
            via: [
              advisory("alto", "high", GHSA_A, "https://example.invalid/aviso"),
            ],
          },
        }),
      );

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "  - paquete alto | aviso sin identificador GHSA | gravedad alta | sin enlace válido",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "muestra las medias y bajas sin fallar, en la salida y en el resumen escapado",
    async () => {
      const ws = workspace();
      const result = await run(
        ws,
        audit({
          "pkg_con*marcas": {
            severity: "moderate",
            via: [advisory("pkg_con*marcas", "moderate", GHSA_B)],
          },
          bajo: {
            severity: "low",
            via: [advisory("bajo", "low", GHSA_C, "javascript:alert(1)")],
          },
        }),
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        "Vulnerabilidades medias y bajas (no bloquean): 2.\n" +
          "  - paquete bajo | aviso sin identificador GHSA | gravedad baja | sin enlace válido\n" +
          `  - paquete pkg_con*marcas | aviso ${GHSA_B} | gravedad media | https://github.com/advisories/${GHSA_B}\n`,
      );
      expect(summaryOf(ws)).toBe(
        "## Dependencias: vulnerabilidades medias y bajas\n\n" +
          "| Paquete | Aviso | Gravedad | Enlace |\n" +
          "| --- | --- | --- | --- |\n" +
          "| bajo | sin identificador GHSA | baja | sin enlace válido |\n" +
          `| pkg\\_con\\*marcas | ${GHSA_B} | media | [${GHSA_B}](https://github.com/advisories/${GHSA_B}) |\n`,
      );
    },
    TIMEOUT_MS,
  );

  test(
    "sin GITHUB_STEP_SUMMARY no escribe ningún resumen",
    async () => {
      const ws = workspace();
      const result = await run(ws, clean, { withSummary: false });

      expect(result.code).toBe(0);
      expect(existsSync(ws.summary)).toBe(false);
    },
    TIMEOUT_MS,
  );

  test(
    "falla si no puede escribir el resumen",
    async () => {
      const ws = workspace();
      const result = await run(ws, clean, { summary: ws.dir });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "No se pudo escribir el resumen de la ejecución.",
      );
    },
    TIMEOUT_MS,
  );
});

describe("informes que impiden decidir", () => {
  const cases: readonly (readonly [string, Plan, string])[] = [
    [
      "una referencia de via no resoluble",
      audit({ directo: { severity: "high", via: ["inexistente"] } }),
      "referencia no resoluble en el informe: inexistente.",
    ],
    [
      "una gravedad rebajada respecto a su aviso",
      audit({
        bajo: { severity: "low", via: [advisory("bajo", "critical", GHSA_A)] },
      }),
      "la gravedad de bajo no coincide con la de sus avisos.",
    ],
    [
      "una gravedad superior a la de sus avisos",
      audit({
        alto: { severity: "high", via: [advisory("alto", "low", GHSA_A)] },
      }),
      "la gravedad de alto no coincide con la de sus avisos.",
    ],
    [
      "un aviso incompleto",
      audit({ alto: { severity: "high", via: [{ name: "alto", url: "x" }] } }),
      "aviso incompleto en alto.",
    ],
    [
      "una vulnerabilidad sin avisos",
      audit({ alto: { severity: "high", via: [] } }),
      "referencia no resoluble en el informe: alto.",
    ],
  ];

  test.each(cases)(
    "falla con %s",
    async (_name, plan, message) => {
      const ws = workspace();
      const result = await run(ws, plan);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "El informe de npm audit no permite decidir el resultado:",
      );
      expect(result.stdout).toContain(message);
      expect(calls(ws).at(-1)).toEqual(["audit", "signatures"]);
    },
    TIMEOUT_MS,
  );

  const invalid: readonly (readonly [string, Step, string])[] = [
    [
      "un error de consulta",
      {
        code: 1,
        stdout: JSON.stringify({
          message: RAW,
          error: { summary: RAW, detail: RAW },
        }),
      },
      "npm audit no pudo consultar la base de avisos o el registro.",
    ],
    [
      "una respuesta vacía",
      { code: 1, stdout: "" },
      "npm audit no devolvió un informe JSON válido.",
    ],
    [
      "un JSON truncado",
      { code: 1, stdout: '{"auditReportVersion":2,' },
      "npm audit no devolvió un informe JSON válido.",
    ],
    [
      "otra versión de informe",
      {
        code: 0,
        stdout: JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {},
          metadata: { vulnerabilities: {} },
        }),
      },
      "npm audit devolvió un informe con un formato no admitido.",
    ],
    [
      "recuentos incoherentes",
      {
        code: 1,
        stdout: JSON.stringify({
          ...(JSON.parse(report({})) as object),
          metadata: {
            vulnerabilities: {
              info: 0,
              low: 0,
              moderate: 0,
              high: 1,
              critical: 0,
              total: 1,
            },
          },
        }),
      },
      "El informe de npm audit no es coherente.",
    ],
    [
      "un código de error sin vulnerabilidades",
      { code: 1, stdout: report({}) },
      "npm audit terminó con error sin informar vulnerabilidades.",
    ],
  ];

  test.each(invalid)(
    "distingue %s de un informe válido y falla cerrado",
    async (_name, step, message) => {
      const ws = workspace();
      const result = await run(ws, { audit: step });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(message);
      expect(calls(ws)).toEqual([AUDIT_ARGS, ["audit", "signatures"]]);
    },
    TIMEOUT_MS,
  );

  test(
    "falla si npm no está disponible",
    async () => {
      const ws = workspace();
      const result = await run(ws, clean, { npmOnPath: false });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain("npm audit no pudo ejecutarse.");
      expect(result.stdout).toContain(
        "npm audit signatures no pudo ejecutarse.",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "un código distinto de 0 en las firmas hace fallar el control",
    async () => {
      const ws = workspace();
      const result = await run(ws, {
        ...clean,
        signatures: { code: 1, stdout: RAW },
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "npm audit signatures terminó con código 1.",
      );
    },
    TIMEOUT_MS,
  );
});

// Referencias circulares en `via`: `a` y `b` se referencian entre sí, `a`
// tiene un aviso crítico y `b` uno propio. La gravedad de `b` es crítica solo
// a través de `a`, así que resolver `b` con un resultado parcial del ciclo
// rebajaría su gravedad y haría fallar un informe válido.
describe("ciclos en via", () => {
  function cycle(
    ownB: Severity,
    order: readonly ("a" | "b")[] = ["a", "b"],
  ): Plan {
    const a: Vulnerability = {
      severity: "critical",
      via: ["b", advisory("a", "critical", GHSA_A)],
    };
    const b: Vulnerability = {
      severity: "critical",
      via: ["a", advisory("b", ownB, GHSA_B)],
    };
    return audit(
      Object.fromEntries(order.map((name) => [name, name === "a" ? a : b])),
    );
  }

  test.each([
    ["en el orden a, b", ["a", "b"]],
    ["en el orden b, a", ["b", "a"]],
  ] as const)(
    "resuelve todos los avisos alcanzables de un ciclo válido %s",
    async (_name, order) => {
      const ws = workspace([exception({ package: "a" })]);
      const result = await run(ws, cycle("low", order));

      expect(result.code).toBe(0);
      expect(result.stdout).toBe(
        "Dependencias auditadas del lockfile: 2.\n" +
          "Vulnerabilidades altas o críticas sin excepción: 0.\n" +
          "Vulnerabilidades altas o críticas con excepción vigente: 1.\n" +
          `  - paquete a | aviso ${GHSA_A} | gravedad crítica | https://github.com/advisories/${GHSA_A} | revisar antes de ${iso(NOW + DAY_MS)}\n` +
          "Vulnerabilidades medias y bajas (no bloquean): 1.\n" +
          `  - paquete b | aviso ${GHSA_B} | gravedad baja | https://github.com/advisories/${GHSA_B}\n` +
          "Firmas y atestaciones del registro: verificadas.\n" +
          "check:deps: superado.\n",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "un aviso crítico dentro del ciclo sin excepción hace fallar el control",
    async () => {
      const ws = workspace();
      const result = await run(ws, cycle("low"));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        `Vulnerabilidades altas o críticas sin excepción: 1.\n  - paquete a | aviso ${GHSA_A} | gravedad crítica |`,
      );
      expect(result.stdout).not.toContain("no permite decidir");
    },
    TIMEOUT_MS,
  );

  test(
    "la excepción de un aviso del ciclo no silencia otro aviso alto alcanzable",
    async () => {
      const ws = workspace([exception({ package: "a" })]);
      const result = await run(ws, cycle("high"));

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        `Vulnerabilidades altas o críticas sin excepción: 1.\n  - paquete b | aviso ${GHSA_B} | gravedad alta |`,
      );
      expect(result.stdout).toContain(
        "Vulnerabilidades altas o críticas con excepción vigente: 1.",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "un ciclo sin ningún aviso resoluble sigue fallando cerrado",
    async () => {
      const ws = workspace();
      const result = await run(
        ws,
        audit({
          a: { severity: "high", via: ["b"] },
          b: { severity: "high", via: ["a"] },
        }),
      );

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        "El informe de npm audit no permite decidir el resultado:\n  - a no tiene avisos resolubles.\n  - b no tiene avisos resolubles.\n",
      );
    },
    TIMEOUT_MS,
  );
});

describe("registro de excepciones", () => {
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
    ["caducada por 1 ms", { reviewBy: iso(NOW - 1) }, 1],
    ["aprobada 1 ms en el futuro", { approvedAt: iso(NOW + 1) }, 1],
    [
      "revisión 90 días y 1 ms después de la aprobación",
      { reviewBy: iso(NOW - DAY_MS + 90 * DAY_MS + 1) },
      1,
    ],
    [
      "revisión anterior a la aprobación",
      { approvedAt: iso(NOW - 1), reviewBy: iso(NOW - 2) },
      1,
    ],
    ["fecha imposible", { reviewBy: "2026-06-31T00:00:00.000Z" }, 1],
    ["fecha sin milisegundos", { reviewBy: "2026-06-16T12:00:00Z" }, 1],
  ] as const)(
    "fechas: %s",
    async (_name, overrides, code) => {
      const ws = workspace([exception(overrides)]);
      const result = await run(
        ws,
        audit({
          alto: { severity: "high", via: [advisory("alto", "high", GHSA_A)] },
        }),
      );

      expect(result.code).toBe(code);
      if (code === 1) {
        expect(result.stdout).toContain(
          "Las excepciones de dependencias no son válidas:",
        );
        expect(result.stdout).toContain(
          "Vulnerabilidades altas o críticas sin excepción: 1.",
        );
      }
    },
    TIMEOUT_MS,
  );

  const cases: readonly (readonly [
    string,
    readonly object[] | string,
    string,
  ])[] = [
    [
      "no es JSON",
      "{",
      "no se pudo leer security/audit-exceptions.json como JSON.",
    ],
    [
      "otra versión de esquema",
      '{"schemaVersion":2,"exceptions":[]}',
      'security/audit-exceptions.json debe ser { "schemaVersion": 1, "exceptions": [...] }.',
    ],
    [
      "un campo inesperado",
      [{ ...exception(), extra: "x" }],
      "excepción 1: debe tener exactamente advisory, package, justification, owner, approvedAt, reviewBy.",
    ],
    [
      "un campo ausente",
      [{ advisory: GHSA_A, package: "alto" }],
      "excepción 1: debe tener exactamente",
    ],
    [
      "un responsable vacío",
      [exception({ owner: " " })],
      "excepción 1: owner no puede estar vacío.",
    ],
    [
      "un aviso sin forma GHSA",
      [exception({ advisory: "CVE-2026-0001" })],
      "excepción 1: advisory debe tener la forma GHSA-xxxx-xxxx-xxxx.",
    ],
    [
      "un paquete con espacios",
      [exception({ package: "dos palabras" })],
      "excepción 1: package no puede contener espacios.",
    ],
    [
      "una pareja repetida",
      [exception(), exception()],
      `excepción repetida para ${GHSA_A} en alto.`,
    ],
  ];

  test.each(cases)(
    "rechaza un registro con %s",
    async (_name, exceptions, message) => {
      const ws = workspace(exceptions);
      const result = await run(ws, clean);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain(message);
      expect(result.stderr).toBe("check:deps: no superado.\n");
    },
    TIMEOUT_MS,
  );
});
