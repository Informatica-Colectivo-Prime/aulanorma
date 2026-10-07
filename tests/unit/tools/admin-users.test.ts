// Script de administración de cuentas (specs/002-boe-scorm-export: T023).
// Se ejecuta como proceso aparte, con la contraseña por la entrada estándar, y
// se comprueba que nunca la imprime ni la deja en la base de datos.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Usa el coste real de derivación de contraseñas, que es lento a propósito.
vi.setConfig({ testTimeout: 120_000 });

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const SCRIPT = path.join(repoRoot, "scripts/admin/users.mjs");
const PASSWORD = `inicial-${randomUUID()}`;

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "aulanorma-admin-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(
  args: readonly string[],
  {
    input = "",
    mode = "production",
  }: { input?: string; mode?: string | null } = {},
): Run {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: dataDir,
    input,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: process.env.PATH ?? "",
      ...(mode === null ? {} : { NODE_ENV: mode }),
      AULANORMA_LOG_LEVEL: "silent",
      AULANORMA_ENVIRONMENT: "test",
      AULANORMA_DATA_DIR: path.join(dataDir, "datos"),
      AULANORMA_PUBLIC_ORIGIN: "https://aulanorma.example",
      AULANORMA_SESSION_IDLE_MINUTES: "30",
      AULANORMA_SESSION_MAX_HOURS: "12",
      AULANORMA_PDF_MAX_MIB: "32",
      AULANORMA_PDF_MAX_PAGES: "600",
    } as unknown as NodeJS.ProcessEnv,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("scripts/admin/users.mjs", () => {
  test("crea cuentas, las lista con sus perfiles y no imprime ni guarda la contraseña", () => {
    const created = run(["create", "docente1", "--role", "teacher"], {
      input: `${PASSWORD}\n`,
    });
    expect(created).toMatchObject({ code: 0, stderr: "" });
    expect(created.stdout).toContain("Cuenta creada");
    expect(
      run(["create", "admin1", "--role", "admin", "--role", "teacher"], {
        input: PASSWORD,
      }).code,
    ).toBe(0);
    expect(run(["create", "sinperfil"], { input: PASSWORD }).code).toBe(0);

    const listed = run(["list"]);
    expect(listed.code).toBe(0);
    expect(listed.stdout.split("\n").filter((line) => line !== "")).toEqual([
      "admin1\tadministración, docente\tcontraseña inicial",
      "docente1\tdocente\tcontraseña inicial",
      "sinperfil\tsin perfiles\tcontraseña inicial",
    ]);

    for (const output of [created.stdout, created.stderr, listed.stdout]) {
      expect(output).not.toContain(PASSWORD);
    }
    const database = readFileSync(path.join(dataDir, "datos", "aulanorma.db"));
    expect(database.includes(Buffer.from(PASSWORD))).toBe(false);
  });

  test.each([
    {
      name: "una cuenta repetida",
      setup: true,
      args: ["create", "docente1"],
      input: PASSWORD,
      message: "Ya existe una cuenta",
    },
    {
      name: "una contraseña corta",
      setup: false,
      args: ["create", "docente1"],
      input: "corta",
      message: "al menos 12 caracteres",
    },
    {
      name: "un perfil desconocido",
      setup: false,
      args: ["create", "docente1", "--role", "reader"],
      input: PASSWORD,
      message: "admin y teacher",
    },
    {
      name: "un nombre no admitido",
      setup: false,
      args: ["create", "Docente Uno"],
      input: PASSWORD,
      message: "nombre de usuario",
    },
    {
      name: "una cuenta inexistente",
      setup: false,
      args: ["disable", "nadie"],
      input: "",
      message: "No existe ninguna cuenta",
    },
    {
      name: "una orden desconocida",
      setup: false,
      args: ["borrar", "docente1"],
      input: "",
      message: "Orden desconocida",
    },
    {
      name: "una opción desconocida",
      setup: false,
      args: ["create", "docente1", "--password", PASSWORD],
      input: "",
      message: "Uso:",
    },
  ])("rechaza $name con código 1 y sin imprimir la contraseña", (scenario) => {
    if (scenario.setup) {
      expect(run(["create", "docente1"], { input: PASSWORD }).code).toBe(0);
    }
    const result = run(scenario.args, { input: scenario.input });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(scenario.message);
    expect(result.stdout + result.stderr).not.toContain(PASSWORD);
  });

  test("cambia perfiles, desactiva, reactiva, asigna otra contraseña y cierra sesiones", () => {
    expect(run(["create", "docente1"], { input: PASSWORD }).code).toBe(0);
    expect(run(["roles", "docente1", "--role", "admin"]).stdout).toContain(
      "Perfiles actualizados",
    );
    expect(run(["disable", "docente1"]).stdout).toContain("desactivada");
    expect(run(["list"]).stdout).toContain(
      "docente1\tadministración\tdesactivada, contraseña inicial",
    );
    expect(run(["enable", "docente1"]).stdout).toContain("reactivada");
    expect(
      run(["password", "docente1"], { input: `otra-${PASSWORD}` }).stdout,
    ).toContain("Contraseña asignada");
    expect(run(["revoke", "docente1"]).stdout).toContain("Sesiones cerradas");
  });

  test.each([null, "test", "staging"])(
    "sin un modo válido (NODE_ENV=%s) no hace nada",
    (mode) => {
      const result = run(["list"], { mode });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("NODE_ENV");
    },
  );
});
