// Reglas de la imagen del piloto (ADR 0005, Propuesto;
// docs/engineering/easypanel.md). Se comprueban sobre el texto del
// `Dockerfile`, del arranque del contenedor y de `.dockerignore`, sin
// construir nada: no acreditan que la imagen se construya ni que funcione.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const read = (file: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../${file}`, import.meta.url)),
    "utf8",
  );

// Instrucciones del `Dockerfile`, sin comentarios y con las líneas
// continuadas unidas.
const instructions = read("Dockerfile")
  .replaceAll("\\\n", " ")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));
const of = (name: string): string[] =>
  instructions
    .filter((line) => line.startsWith(`${name} `))
    .map((line) => line.slice(name.length + 1).trim());

const entrypoint = read("deploy/easypanel/entrypoint.sh")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));
const ignored = read(".dockerignore")
  .split("\n")
  .map((line) => line.trim());

describe("imagen del piloto", () => {
  test("todas las etapas parten de la imagen oficial de Node.js en la versión de .node-version, fijada por la misma huella", () => {
    const version = read(".node-version").trim();
    const bases = of("FROM").map((line) => line.split(" ")[0] ?? "");
    expect(bases.length).toBeGreaterThan(0);
    for (const base of bases) {
      expect(base).toMatch(
        new RegExp(
          `^node:${version.replaceAll(".", "\\.")}-bookworm-slim@sha256:[0-9a-f]{64}$`,
        ),
      );
    }
    expect(new Set(bases).size).toBe(1);
  });

  test("no lleva configuración, secretos ni argumentos de construcción", () => {
    expect(of("ARG")).toEqual([]);
    const text = instructions.join("\n");
    expect(text).not.toContain("AULANORMA_");
    expect(text).not.toMatch(/openai|api[_-]?key|secret|password|token/i);
    // Las únicas variables fijadas son el modo y la telemetría de Next.js.
    const names = of("ENV").flatMap((line) =>
      [...line.matchAll(/([A-Z_]+)=/g)].map((match) => match[1]),
    );
    expect([...new Set(names)].sort()).toEqual([
      "NEXT_TELEMETRY_DISABLED",
      "NODE_ENV",
    ]);
    expect(of("ENV").join(" ")).toContain("NODE_ENV=production");
  });

  test("instala con npm ci, las herramientas verificadas y la construcción, sin ejecutar scripts de instalación de paquetes", () => {
    const run = of("RUN").join("\n");
    expect(run).toContain("npm ci");
    expect(run).toContain("npm run tools:install");
    expect(run).toContain("npm run build");
    expect(run).not.toMatch(/npm (?:install|i|rebuild|update)\b/);
    expect(run).not.toMatch(/curl|wget/);
    expect(read(".npmrc")).toContain("ignore-scripts=true");
    expect(
      instructions.some((line) => /^COPY .*\.npmrc.* \.\/$/.test(line)),
    ).toBe(true);
  });

  test("el proceso no se ejecuta como root y solo expone el puerto del reenvío", () => {
    expect(of("USER").at(-1)).toBe("node");
    expect(of("EXPOSE")).toEqual(["8080"]);
    expect(of("VOLUME")).toEqual([]);
    const last = instructions.at(-1) ?? "";
    expect(last).toBe('ENTRYPOINT ["tini", "--", "aulanorma-entrypoint"]');
    expect(of("CMD")).toEqual([]);
  });

  test("la comprobación de estado pasa por el reenvío, como el proxy", () => {
    const [check] = instructions.filter((line) =>
      line.startsWith("HEALTHCHECK "),
    );
    expect(check).toContain("http://127.0.0.1:8080/api/health");
  });
});

describe("arranque del contenedor", () => {
  test("el servicio arranca con npm start, su única entrada de producción, y es el proceso del contenedor", () => {
    expect(entrypoint.at(-1)).toBe("exec npm start");
    expect(entrypoint.join("\n")).not.toContain("server.mjs");
    expect(entrypoint).toContain("set -eu");
  });

  test("el reenvío va solo del puerto del contenedor a la dirección local del servicio", () => {
    const forwards = entrypoint.filter((line) => line.includes("socat"));
    expect(forwards).toEqual([
      "socat TCP-LISTEN:8080,fork,reuseaddr TCP:127.0.0.1:3000 &",
    ]);
  });
});

describe("contexto de construcción", () => {
  test("nunca incluye la configuración local, el historial ni lo generado en el equipo", () => {
    for (const entry of [
      ".git",
      ".env",
      ".env.*",
      "*.pem",
      "*.key",
      "node_modules",
      ".next",
      ".tools",
    ]) {
      expect(ignored, entry).toContain(entry);
    }
  });

  test("conserva lo que el servicio necesita en ejecución", () => {
    for (const entry of ["src", "scripts", "prompts", "server.mjs"]) {
      expect(ignored, entry).not.toContain(entry);
    }
  });
});
