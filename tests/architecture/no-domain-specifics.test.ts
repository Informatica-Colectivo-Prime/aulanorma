// Sin lógica de dominio específica de un certificado (FR-024).
//
// Busca los códigos de certificado en `src/`, `tests/`, `scripts/` y los
// ficheros operativos de la raíz (todos salvo Markdown), tanto versionados como
// nuevos no ignorados por Git. El patrón se construye a partir de fragmentos
// para que este fichero no contenga los códigos.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const certificateCodes = [
  ["U", "F", "05", "17"],
  ["AD", "GG", "04", "08"],
].map(([letters1, letters2, digits1, digits2]) => ({
  letters: `${letters1 ?? ""}${letters2 ?? ""}`,
  digits: `${digits1 ?? ""}${digits2 ?? ""}`,
}));

// Admite separadores habituales entre letras y dígitos (espacio, guion o guion
// bajo) y cualquier combinación de mayúsculas y minúsculas.
const certificatePattern = new RegExp(
  certificateCodes
    .map(({ letters, digits }) => `${letters}[\\s_-]?${digits}`)
    .join("|"),
  "i",
);

const SCANNED_DIRECTORIES = ["src/", "tests/", "scripts/"];

function isScanned(file: string): boolean {
  if (SCANNED_DIRECTORIES.some((directory) => file.startsWith(directory))) {
    return true;
  }
  return !file.includes("/") && !file.toLowerCase().endsWith(".md");
}

// Unión de los ficheros versionados y de los no versionados que Git no ignora.
// `-z` separa con NUL, así que los nombres con espacios llegan intactos.
function candidateFiles(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", env },
  );
  const files = new Set(
    output
      .split("\0")
      .filter((file) => file !== "")
      .filter(isScanned)
      .filter((file) => existsSync(path.join(root, file))),
  );
  return [...files].sort();
}

function filesWithCodes(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return candidateFiles(root, env).filter((file) =>
    certificatePattern.test(readFileSync(path.join(root, file), "utf8")),
  );
}

const scratchRoots: string[] = [];

afterAll(() => {
  for (const root of scratchRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("sin códigos de certificado en código y configuración", () => {
  test("el patrón construido detecta los códigos y este fichero no los contiene", () => {
    for (const { letters, digits } of certificateCodes) {
      expect(certificatePattern.test(`${letters}${digits}`)).toBe(true);
      expect(
        certificatePattern.test(`${letters.toLowerCase()}-${digits}`),
      ).toBe(true);
    }
    const ownSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
    expect(certificatePattern.test(ownSource)).toBe(false);
  });

  test("el recolector une versionados y nuevos no ignorados en un repositorio desechable", () => {
    const root = mkdtempSync(path.join(tmpdir(), "aulanorma-fr024-"));
    scratchRoots.push(root);
    // Aislado de la configuración global y de sistema de Git.
    const env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: path.join(root, ".no-global-gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1",
    };
    const git = (...args: string[]): void => {
      execFileSync("git", args, { cwd: root, env, stdio: "ignore" });
    };
    const { letters, digits } = certificateCodes[0] ?? {
      letters: "",
      digits: "",
    };
    const code = `export const plan = "${letters}${digits}";\n`;
    const write = (file: string, content: string): void => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    };

    git("init", "--quiet");
    write(".gitignore", "src/ignorado/\n");
    write("src/versionado.ts", code);
    git("add", "src/versionado.ts");
    write("src/nuevo fichero.ts", code);
    write("src/ignorado/oculto.ts", code);
    write("tests/limpio.ts", "export {};\n");
    write("scripts/nuevo.mjs", code);
    write("config.json", `{ "plan": "${letters}${digits}" }\n`);
    write("README.md", code);
    write("docs/fuera.ts", code);

    expect(candidateFiles(root, env)).toEqual([
      ".gitignore",
      "config.json",
      "scripts/nuevo.mjs",
      "src/nuevo fichero.ts",
      "src/versionado.ts",
      "tests/limpio.ts",
    ]);
    expect(filesWithCodes(root, env)).toEqual([
      "config.json",
      "scripts/nuevo.mjs",
      "src/nuevo fichero.ts",
      "src/versionado.ts",
    ]);
  });

  test("los ficheros examinados del repositorio no contienen los códigos", () => {
    const files = candidateFiles(repoRoot);
    expect(files).toContain("package.json");
    expect(files).toContain("tests/architecture/no-domain-specifics.test.ts");
    expect(filesWithCodes(repoRoot)).toEqual([]);
  });
});
