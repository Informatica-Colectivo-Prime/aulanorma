// Reglas de la imagen del piloto (ADR 0005, Propuesto;
// docs/engineering/easypanel.md). Se comprueban sobre el texto del
// `Dockerfile` y de `.dockerignore`, sin construir nada: no acreditan que la
// imagen se construya ni que funcione. Eso lo acredita el ensayo con Docker
// que registra `easypanel.md`, que estas pruebas no sustituyen.
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
    expect(text).not.toMatch(/openai|api[_-]?key|secret|password|token/i);
    // Las únicas variables fijadas son las que dependen de ser un
    // contenedor: el modo, la telemetría de Next.js y la dirección de escucha.
    expect(text.match(/AULANORMA_[A-Z_]+/g)).toEqual(["AULANORMA_LISTEN_HOST"]);
    const names = of("ENV").flatMap((line) =>
      [...line.matchAll(/([A-Z_]+)=/g)].map((match) => match[1]),
    );
    expect([...new Set(names)].sort()).toEqual([
      "AULANORMA_LISTEN_HOST",
      "NEXT_TELEMETRY_DISABLED",
      "NODE_ENV",
    ]);
    expect(of("ENV").join(" ")).toContain("NODE_ENV=production");
    // Solo la etapa final, la que se ejecuta, escucha en todas las
    // interfaces del contenedor, y lo dice de forma explícita.
    expect(of("ENV").join(" ")).toContain("AULANORMA_LISTEN_HOST=0.0.0.0");
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

  test("el proceso no se ejecuta como root, hay un único puerto y ningún reenvío", () => {
    expect(of("USER").at(-1)).toBe("node");
    expect(of("EXPOSE")).toEqual(["3000"]);
    expect(of("VOLUME")).toEqual([]);
    expect(instructions.join("\n")).not.toContain("socat");
  });

  test("arranca con npm start, la única entrada de producción, bajo tini", () => {
    expect(instructions.at(-1)).toBe(
      'ENTRYPOINT ["tini", "--", "npm", "start"]',
    );
    expect(of("CMD")).toEqual([]);
    expect(instructions.join("\n")).not.toContain("server.mjs");
  });

  test("la comprobación de estado usa el puerto del servicio", () => {
    const [check] = instructions.filter((line) =>
      line.startsWith("HEALTHCHECK "),
    );
    expect(check).toContain("http://127.0.0.1:3000/api/health");
  });

  test("todo lo que copia del contexto existe en él: nada de lo que el Dockerfile copia está en .dockerignore", () => {
    const sources = instructions
      .filter((line) => line.startsWith("COPY ") && !line.includes("--from="))
      .flatMap((line) => line.split(" ").slice(1, -1));
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources.filter((item) => item !== ".")) {
      const top = source.split("/")[0] ?? "";
      expect(ignored, source).not.toContain(top);
      expect(ignored, source).not.toContain(source);
    }
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
