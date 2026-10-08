// El HTML solo se compone con la plantilla de `@/platform/markup`
// (specs/002-boe-scorm-export: FR-020, SC-046). Estas comprobaciones impiden
// que vuelva a existir una vía que trate una cadena como HTML ya escapado.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function sources(directory: string): string[] {
  return readdirSync(path.join(repoRoot, directory), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && /\.(?:ts|mjs)$/.test(entry.name))
    .map((entry) =>
      path.relative(repoRoot, path.join(entry.parentPath, entry.name)),
    )
    .sort();
}

const MARKUP = "src/platform/markup/index.ts";
const WEB = "src/platform/web/index.ts";
const FILES = sources("src");

function read(file: string): string {
  return readFileSync(path.join(repoRoot, file), "utf8");
}

describe("marcado de confianza", () => {
  test("el área de marcado solo exporta la plantilla y sus ayudantes", () => {
    const exported = [
      ...read(MARKUP).matchAll(
        /^export (?:function|const|interface|type) (\w+)/gm,
      ),
    ].map((match) => match[1]);
    expect(exported.sort()).toEqual([
      "Html",
      "HtmlValue",
      "html",
      "inlineResource",
      "joinHtml",
      "localHref",
    ]);
  });

  test("el recurso sin escape solo lo usa la entrega web, con sus dos constantes", () => {
    const users = FILES.filter(
      (file) => file !== MARKUP && read(file).includes("inlineResource"),
    );
    expect(users).toEqual([WEB]);
    const calls = [...read(WEB).matchAll(/inlineResource\(([^)]*)\)/g)].map(
      (match) => match[1],
    );
    expect(calls).toEqual(['"style", STYLE', '"script", SCRIPT']);
  });

  test("nadie fabrica un fragmento con una conversión de tipo", () => {
    const forged = FILES.filter(
      (file) =>
        file !== MARKUP && /\bas (?:unknown as )?Html\b/.test(read(file)),
    );
    expect(forged).toEqual([]);
  });

  test("ninguna capa ni vista asigna HTML a un elemento desde el script", () => {
    const sinks = FILES.filter((file) =>
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(read(file)),
    );
    expect(sinks).toEqual([]);
  });
});
