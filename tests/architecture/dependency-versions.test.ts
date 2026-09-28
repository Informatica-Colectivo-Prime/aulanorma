// `next` y `@next/env` enlazados en la misma versión exacta (research.md, K12).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
}

const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf8",
  ),
) as PackageManifest;

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

describe("versiones enlazadas de next y @next/env", () => {
  test("ambas son dependencias de ejecución con versión exacta, sin rango", () => {
    const next = manifest.dependencies?.["next"];
    const nextEnv = manifest.dependencies?.["@next/env"];
    expect(next).toMatch(EXACT_VERSION);
    expect(nextEnv).toMatch(EXACT_VERSION);
  });

  test("declaran la misma versión", () => {
    expect(manifest.dependencies?.["@next/env"]).toBe(
      manifest.dependencies?.["next"],
    );
  });
});
