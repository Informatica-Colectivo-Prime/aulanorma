// Matriz de dependencias entre capas y prohibiciones de data-model.md,
// verificadas con la API de ESLint sobre rutas sintéticas (FR-007, FR-023).
// Debe fallar hasta que exista la configuración de ESLint (T019).
//
// Solo cuentan los errores de las reglas de restricción. Además, ningún caso
// puede producir un mensaje fatal ni un aviso de fichero ignorado: si el
// fichero no se analiza, un caso permitido no puede pasar por omisión.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const RESTRICTION_RULES: ReadonlySet<string> = new Set([
  "no-restricted-imports",
  "@typescript-eslint/no-restricted-imports",
  "no-restricted-globals",
  "no-restricted-properties",
  "no-restricted-syntax",
]);

const LAYERS = [
  "normative-source",
  "structured-interpretation",
  "didactic-content",
  "content-export",
] as const;
type Layer = (typeof LAYERS)[number];

// Matriz de data-model.md: capas que cada capa de dominio puede importar,
// además de `platform`.
const ALLOWED_LAYER_IMPORTS: Readonly<Record<Layer, readonly Layer[]>> = {
  "normative-source": [],
  "structured-interpretation": ["normative-source"],
  "didactic-content": ["structured-interpretation"],
  "content-export": ["didactic-content"],
};

const API_ROUTE = "src/pages/api/health.ts";
const SERVER = "server.mjs";
const PORTABLE_MODULES = [
  "src/platform/config/index.ts",
  "src/platform/logging/index.ts",
  "src/platform/http-boundary/index.ts",
] as const;
const NETWORK_MODULES = [
  "node:http",
  "node:https",
  "node:http2",
  "node:net",
  "node:tls",
  "node:dgram",
  "node:dns",
  "http",
  "https",
  "http2",
  "net",
  "tls",
  "dgram",
  "dns",
] as const;
const SRC_LOCATIONS = [
  API_ROUTE,
  "src/platform/health/index.ts",
  "src/modules/normative-source/index.ts",
] as const;

interface BoundaryCase {
  readonly name: string;
  readonly file: string;
  readonly code: string;
}

const layerFile = (layer: Layer): string => `src/modules/${layer}/index.ts`;
const importOf = (specifier: string): string =>
  `import * as dependency from "${specifier}";\nexport { dependency };\n`;

const forbidden: BoundaryCase[] = [];
const allowed: BoundaryCase[] = [];

// Entrega: `src/pages/api/health.ts` y `server.mjs` no importan capas de
// dominio, ni con alias ni con ruta relativa.
for (const layer of LAYERS) {
  forbidden.push(
    {
      name: `${API_ROUTE} → @/modules/${layer}`,
      file: API_ROUTE,
      code: importOf(`@/modules/${layer}`),
    },
    {
      name: `${SERVER} → @/modules/${layer}`,
      file: SERVER,
      code: importOf(`@/modules/${layer}`),
    },
    {
      name: `${SERVER} → ./src/modules/${layer}/index.ts`,
      file: SERVER,
      code: importOf(`./src/modules/${layer}/index.ts`),
    },
  );
}

// Entrega: la API Route importa la API pública de `platform`.
for (const area of ["config", "logging", "health", "version"]) {
  allowed.push({
    name: `${API_ROUTE} → @/platform/${area}`,
    file: API_ROUTE,
    code: importOf(`@/platform/${area}`),
  });
}

// Adaptador: `server.mjs` importa legítimamente `node:http`, `next` y los
// módulos portables por su ruta `.ts`.
allowed.push(
  { name: `${SERVER} → node:http`, file: SERVER, code: importOf("node:http") },
  { name: `${SERVER} → next`, file: SERVER, code: importOf("next") },
  {
    name: `${SERVER} → ./src/platform/config/index.ts`,
    file: SERVER,
    code: importOf("./src/platform/config/index.ts"),
  },
);

// Rutas internas: solo se permite la API pública (`index.ts`).
forbidden.push(
  {
    name: `${API_ROUTE} → @/platform/config/<interno>`,
    file: API_ROUTE,
    code: importOf("@/platform/config/schema"),
  },
  {
    name: "structured-interpretation → @/modules/normative-source/<interno>",
    file: layerFile("structured-interpretation"),
    code: importOf("@/modules/normative-source/internal"),
  },
  {
    name: "didactic-content → @/platform/logging/<interno>",
    file: layerFile("didactic-content"),
    code: importOf("@/platform/logging/internal"),
  },
);

// Matriz entre capas de dominio y `platform`.
for (const from of LAYERS) {
  allowed.push({
    name: `${from} → @/platform/config`,
    file: layerFile(from),
    code: importOf("@/platform/config"),
  });
  for (const to of LAYERS) {
    if (from === to) {
      continue;
    }
    const target: BoundaryCase = {
      name: `${from} → @/modules/${to}`,
      file: layerFile(from),
      code: importOf(`@/modules/${to}`),
    };
    if (ALLOWED_LAYER_IMPORTS[from].includes(to)) {
      allowed.push(target);
    } else {
      forbidden.push(target, {
        name: `${from} → ../${to}/index.ts`,
        file: layerFile(from),
        code: importOf(`../${to}/index.ts`),
      });
    }
  }
  forbidden.push({
    name: `platform → @/modules/${from}`,
    file: "src/platform/health/index.ts",
    code: importOf(`@/modules/${from}`),
  });
}

// `process.env`: solo en `src/platform/config`; `server.mjs` solo lee
// `process.env.NODE_ENV`.
for (const file of [
  "src/platform/logging/index.ts",
  "src/platform/health/index.ts",
  API_ROUTE,
  "src/modules/didactic-content/index.ts",
]) {
  forbidden.push({
    name: `process.env en ${file}`,
    file,
    code: "export const value = process.env.AULANORMA_LOG_LEVEL;\n",
  });
}
allowed.push(
  {
    name: "process.env en src/platform/config/index.ts",
    file: "src/platform/config/index.ts",
    code: "export const value = process.env.AULANORMA_LOG_LEVEL;\n",
  },
  {
    name: `${SERVER} lee process.env.NODE_ENV`,
    file: SERVER,
    code: "export const mode = process.env.NODE_ENV;\n",
  },
);
forbidden.push(
  {
    name: `${SERVER} lee process.env.PORT`,
    file: SERVER,
    code: "export const port = process.env.PORT;\n",
  },
  {
    name: `${SERVER} lee process.env["HOSTNAME"]`,
    file: SERVER,
    code: 'export const host = process.env["HOSTNAME"];\n',
  },
  {
    name: `${SERVER} usa process.env completo`,
    file: SERVER,
    code: "export const environment = process.env;\n",
  },
);

// Módulos portables: sin importaciones relativas ni `@/`; solo paquetes npm.
for (const file of PORTABLE_MODULES) {
  forbidden.push(
    {
      name: `${file} → importación relativa`,
      file,
      code: importOf("./internal.ts"),
    },
    {
      name: `${file} → @/platform/version`,
      file,
      code: importOf("@/platform/version"),
    },
  );
}
allowed.push(
  {
    name: "src/platform/config/index.ts → zod",
    file: "src/platform/config/index.ts",
    code: importOf("zod"),
  },
  {
    name: "src/platform/config/index.ts → @next/env",
    file: "src/platform/config/index.ts",
    code: importOf("@next/env"),
  },
  {
    name: "src/platform/logging/index.ts → pino",
    file: "src/platform/logging/index.ts",
    code: importOf("pino"),
  },
);

// Red en `src/`: `fetch`, `WebSocket`, `EventSource` y módulos de red, salvo
// `import type` de `node:http` en la frontera.
for (const file of SRC_LOCATIONS) {
  for (const specifier of NETWORK_MODULES) {
    forbidden.push({
      name: `${file} → ${specifier}`,
      file,
      code: importOf(specifier),
    });
  }
  for (const global of ["fetch", "WebSocket", "EventSource"]) {
    forbidden.push({
      name: `${file} usa ${global}`,
      file,
      code: `export const reference = ${global};\n`,
    });
  }
  forbidden.push({
    name: `${file} → import type de node:http`,
    file,
    code: 'import type { IncomingMessage } from "node:http";\nexport type Request = IncomingMessage;\n',
  });
}
allowed.push({
  name: "src/platform/http-boundary/index.ts → import type de node:http",
  file: "src/platform/http-boundary/index.ts",
  code: 'import type { IncomingMessage } from "node:http";\nexport type Request = IncomingMessage;\n',
});
forbidden.push({
  name: "src/platform/http-boundary/index.ts → node:http en ejecución",
  file: "src/platform/http-boundary/index.ts",
  code: importOf("node:http"),
});

let eslint: ESLint;

// Esta prueba verifica las reglas de arquitectura con entradas sintéticas en
// rutas que pueden no existir todavía, y typescript-eslint no puede tipar un
// fichero inexistente. Carga la configuración real del repositorio y solo
// desactiva las reglas que requieren información de tipos; las restricciones de
// capas, importaciones, red y `process.env` siguen activas. La configuración
// tipada completa se comprueba con `npm run check:lint` sobre ficheros reales.
beforeAll(() => {
  eslint = new ESLint({
    cwd: repoRoot,
    overrideConfig: tseslint.configs.disableTypeChecked,
  });
});

async function lint(testCase: BoundaryCase): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(testCase.code, {
    filePath: path.join(repoRoot, testCase.file),
  });
  if (result === undefined) {
    throw new Error(`ESLint no devolvió resultado para ${testCase.file}`);
  }
  // Un mensaje sin regla es un error de análisis o un aviso de fichero
  // ignorado: el caso no se habría evaluado.
  const unevaluated = result.messages.filter(
    (message) => message.fatal === true || message.ruleId === null,
  );
  expect(unevaluated, testCase.name).toEqual([]);
  return result.messages.filter(
    (message) =>
      message.severity === 2 &&
      message.ruleId !== null &&
      RESTRICTION_RULES.has(message.ruleId),
  );
}

describe("límites de importación y prohibiciones (data-model.md)", () => {
  test.each(forbidden.map((testCase) => [testCase.name, testCase] as const))(
    "prohibido: %s",
    async (_name, testCase) => {
      const errors = await lint(testCase);
      expect(errors.length, testCase.name).toBeGreaterThan(0);
    },
  );

  test.each(allowed.map((testCase) => [testCase.name, testCase] as const))(
    "permitido: %s",
    async (_name, testCase) => {
      const errors = await lint(testCase);
      expect(errors, testCase.name).toEqual([]);
    },
  );
});
