// @ts-check
// Configuración plana de ESLint (research.md, R6; data-model.md, matriz de
// dependencias entre capas). En la configuración plana, un bloque posterior
// sustituye por completo las opciones de una regla, así que cada ubicación de
// `src/` y `server.mjs` recibe su conjunto completo de restricciones, generado
// por las funciones de este fichero.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const LAYERS = [
  "normative-source",
  "structured-interpretation",
  "didactic-content",
  "content-export",
];

// Capas de dominio que cada capa puede importar, además de `platform`.
/** @type {Record<string, readonly string[]>} */
const ALLOWED_LAYER_IMPORTS = {
  "normative-source": [],
  "structured-interpretation": ["normative-source"],
  "didactic-content": ["structured-interpretation"],
  "content-export": ["didactic-content"],
};

const PLATFORM_AREAS = [
  "config",
  "logging",
  "http-boundary",
  "health",
  "version",
  "persistence",
  "audit",
  "identity",
  "generation",
  "web",
];
// Capas de dominio que la entrega puede importar, por su API pública. Se
// abren una a una, con la primera ruta que las necesita (ADR 0004).
const DELIVERY_LAYERS = ["normative-source", "structured-interpretation"];
const DELIVERY_PLATFORM_AREAS = [
  "config",
  "logging",
  "health",
  "version",
  "web",
];
const PORTABLE_MODULES = [
  "src/platform/config/index.ts",
  "src/platform/logging/index.ts",
  "src/platform/http-boundary/index.ts",
  "src/platform/persistence/index.ts",
  "src/platform/audit/index.ts",
  "src/platform/identity/index.ts",
];
const NETWORK_MODULES = [
  "http",
  "https",
  "http2",
  "net",
  "tls",
  "dgram",
  "dns",
];

const SOURCE_FILES = "src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}";

/** @param {string} value */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** @param {readonly string[]} names */
const alternatives = (names) => names.map(escapeRegex).join("|");

// --- Restricciones de importación (regla del núcleo `no-restricted-imports`) ---

/** @typedef {{ regex: string; message: string; caseSensitive: true }} RestrictedPattern */

/**
 * @param {string} regex
 * @param {string} message
 * @returns {RestrictedPattern}
 */
const pattern = (regex, message) => ({ regex, message, caseSensitive: true });

const INTERNAL_ALIAS = pattern(
  "^@/(?:platform|modules)/[^/]+/",
  "Solo se permite la API pública: importa `@/platform/<área>` o `@/modules/<capa>`, nunca sus rutas internas.",
);

/**
 * Importaciones relativas que salen de la unidad actual hacia otra capa, otra
 * área o la raíz de `src/`: deben usar el alias y la API pública.
 * @param {readonly string[]} names
 */
const relativeEscape = (names) =>
  pattern(
    `^\\.\\./(?:.*/)?(?:${alternatives(names)})(?:/|$)`,
    "Una importación relativa no puede cruzar a otra capa o área: usa la API pública con `@/`.",
  );

// `process` como módulo expone `env`; fuera de `src/platform/config` no se lee.
const PROCESS_ENV_IMPORTS = ["process", "node:process"].map((name) => ({
  name,
  importNames: ["env", "default"],
  message: "Solo `src/platform/config` lee el entorno del proceso.",
}));

/**
 * @param {readonly RestrictedPattern[]} patterns
 * @param {{ allowProcessEnv?: boolean }} [options]
 */
const restrictedImports = (patterns, { allowProcessEnv = false } = {}) => [
  "error",
  {
    paths: allowProcessEnv ? [] : PROCESS_ENV_IMPORTS,
    patterns: [...patterns],
  },
];

// --- Red en `src/` (variante de typescript-eslint, con `import type`) ---

const networkMessage =
  "Sin acceso a red en `src/` (FR-007): la aplicación no hace llamadas externas.";

/** @param {{ allowHttpTypes: boolean }} options */
const networkImports = ({ allowHttpTypes }) => {
  const others = NETWORK_MODULES.filter(
    (name) => !allowHttpTypes || name !== "http",
  );
  const patterns = [
    {
      regex: `^(?:node:)?(?:${alternatives(others)})(?:/.*)?$`,
      message: networkMessage,
      caseSensitive: true,
    },
  ];
  if (allowHttpTypes) {
    patterns.push({
      regex: "^(?:node:)?http$",
      message: `${networkMessage} La frontera solo admite \`import type\` de \`node:http\`.`,
      caseSensitive: true,
      allowTypeImports: true,
    });
  }
  return ["error", { patterns }];
};

const networkModuleRegex = `/^(?:node:)?(?:${alternatives(NETWORK_MODULES)})(?:\\u002F.*)?$/`;

// `import()` dinámico y `require()` de módulos de red, equivalentes a una
// importación estática.
const NETWORK_SYNTAX = [
  {
    selector: `ImportExpression[source.value=${networkModuleRegex}]`,
    message: networkMessage,
  },
  {
    selector: `CallExpression[callee.name="require"][arguments.0.value=${networkModuleRegex}]`,
    message: networkMessage,
  },
];

const NETWORK_GLOBALS = ["fetch", "WebSocket", "EventSource"];

const restrictedGlobals = [
  "error",
  ...NETWORK_GLOBALS.map((name) => ({ name, message: networkMessage })),
];

/** @param {{ allowProcessEnv: boolean }} options */
const restrictedProperties = ({ allowProcessEnv }) => [
  "error",
  ...NETWORK_GLOBALS.map((property) => ({
    object: "globalThis",
    property,
    message: networkMessage,
  })),
  ...(allowProcessEnv
    ? []
    : [
        {
          object: "process",
          property: "env",
          message:
            "Solo `src/platform/config` lee `process.env`; el resto recibe la configuración validada.",
        },
      ]),
];

/**
 * Bloque completo de restricciones para una ubicación de `src/`.
 * @param {{
 *   name: string;
 *   files: string[];
 *   patterns: readonly RestrictedPattern[];
 *   allowProcessEnv?: boolean;
 *   allowHttpTypes?: boolean;
 * }} location
 * @returns {import("eslint").Linter.Config}
 */
const sourceLocation = ({
  name,
  files,
  patterns,
  allowProcessEnv = false,
  allowHttpTypes = false,
}) => ({
  name: `aulanorma/src/${name}`,
  files,
  rules: {
    "no-console": "error",
    "no-restricted-imports": restrictedImports(patterns, { allowProcessEnv }),
    "@typescript-eslint/no-restricted-imports": networkImports({
      allowHttpTypes,
    }),
    "no-restricted-globals": restrictedGlobals,
    "no-restricted-properties": restrictedProperties({ allowProcessEnv }),
    "no-restricted-syntax": ["error", ...NETWORK_SYNTAX],
  },
});

const OTHER_SEGMENTS = ["platform", "modules", "pages", "views", "app", "src"];

/** @param {string} area */
const platformArea = (area) =>
  sourceLocation({
    name: `platform/${area}`,
    files: [`src/platform/${area}/**/*`],
    allowProcessEnv: area === "config",
    patterns: [
      pattern(
        "^@/modules(?:/|$)",
        "`platform` no depende de ninguna capa de dominio.",
      ),
      pattern(
        "^@/(?!platform/)",
        "`platform` solo importa otras áreas por `@/platform/<área>`.",
      ),
      INTERNAL_ALIAS,
      relativeEscape([
        ...PLATFORM_AREAS.filter((other) => other !== area),
        ...LAYERS,
        ...OTHER_SEGMENTS,
      ]),
    ],
  });

/** @param {string} layer */
const domainLayer = (layer) => {
  const forbidden = LAYERS.filter(
    (other) =>
      other !== layer && !(ALLOWED_LAYER_IMPORTS[layer] ?? []).includes(other),
  );
  return sourceLocation({
    name: `modules/${layer}`,
    files: [`src/modules/${layer}/**/*`],
    patterns: [
      ...(forbidden.length > 0
        ? [
            pattern(
              `^@/modules/(?:${alternatives(forbidden)})(?:/|$)`,
              `\`${layer}\` no puede depender de esa capa (matriz de data-model.md).`,
            ),
          ]
        : []),
      pattern(
        "^@/(?!platform/|modules/)",
        "Las capas de dominio solo importan `@/platform/<área>` y la capa permitida.",
      ),
      INTERNAL_ALIAS,
      relativeEscape([
        ...LAYERS.filter((other) => other !== layer),
        ...OTHER_SEGMENTS,
      ]),
    ],
  });
};

// Módulos portables: los cargan directamente Node.js (preflight y
// `server.mjs`), que no resuelve alias ni rutas sin extensión.
const portableModule = (/** @type {string} */ file) => {
  const area = file.split("/")[2] ?? "";
  const base = platformArea(area);
  return {
    ...base,
    name: `aulanorma/src/portable/${area}`,
    files: [file],
    rules: {
      ...base.rules,
      "no-restricted-imports": restrictedImports(
        [
          pattern(
            "^\\.{1,2}(?:/|$)",
            "Módulo portable: sin importaciones relativas; solo paquetes npm.",
          ),
          pattern("^@/", "Módulo portable: sin alias `@/`; solo paquetes npm."),
        ],
        { allowProcessEnv: area === "config" },
      ),
      "@typescript-eslint/no-restricted-imports": networkImports({
        allowHttpTypes: area === "http-boundary",
      }),
    },
  };
};

// --- `server.mjs`: adaptador mínimo sin información de tipos ---

const PROCESS_ENV =
  'MemberExpression[object.name="process"][property.name="env"]';
const serverEnvMessage =
  "`server.mjs` solo lee `process.env.NODE_ENV`; el resto de la configuración llega por `loadConfig`.";

/** @type {import("eslint").Linter.Config} */
const serverAdapter = {
  name: "aulanorma/server",
  files: ["server.mjs"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: PROCESS_ENV_IMPORTS.map((entry) => ({
          ...entry,
          message: serverEnvMessage,
        })),
        patterns: [
          pattern(
            "^@/",
            "`server.mjs` no importa capas de dominio y Node.js no resuelve el alias `@/`.",
          ),
          pattern(
            `(?:^|/)(?:modules|${alternatives(LAYERS)})(?:/|$)`,
            "La entrega no importa ninguna capa de dominio (matriz de data-model.md).",
          ),
          pattern(
            "^\\./src/(?!platform/(?:config|logging|http-boundary|persistence)/index\\.ts$)",
            "De `src/`, `server.mjs` solo importa `config`, `logging`, `http-boundary` y `persistence` por su `index.ts`.",
          ),
          pattern(
            "^\\.\\./",
            "`server.mjs` no importa ficheros fuera del repositorio.",
          ),
        ],
      },
    ],
    "no-restricted-syntax": [
      "error",
      {
        selector: `MemberExpression[object.object.name="process"][object.property.name="env"]:not([computed=false][property.name="NODE_ENV"])`,
        message: serverEnvMessage,
      },
      {
        selector: `:not(MemberExpression) > ${PROCESS_ENV}`,
        message: serverEnvMessage,
      },
      {
        selector: 'MemberExpression[object.name="process"][computed=true]',
        message: serverEnvMessage,
      },
      {
        selector:
          'VariableDeclarator[init.name="process"] > ObjectPattern > Property[key.name="env"]',
        message: serverEnvMessage,
      },
    ],
  },
};

// Globales de Node.js para los `*.mjs` analizados sin información de tipos.
const NODE_GLOBALS = /** @type {const} */ ({
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  AbortController: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  clearImmediate: "readonly",
  queueMicrotask: "readonly",
});

export default defineConfig([
  globalIgnores([
    ".next/",
    ".tools/",
    "coverage/",
    "next-env.d.ts",
    ".specify/",
    ".cursor/",
    ".claude/",
    ".agents/",
    ".opencode/",
  ]),

  js.configs.recommended,

  // Registro global del plugin: las restricciones de red de `src/` usan su
  // variante de `no-restricted-imports` también en ficheros JavaScript.
  {
    name: "aulanorma/typescript-eslint-plugin",
    plugins: { "@typescript-eslint": tseslint.plugin },
  },

  {
    name: "aulanorma/typescript",
    files: ["**/*.ts"],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    name: "aulanorma/javascript",
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: NODE_GLOBALS,
    },
  },

  // Restricciones de `src/`: primero la más general y después cada ubicación.
  sourceLocation({
    name: "generic",
    files: [SOURCE_FILES],
    patterns: [
      pattern(
        "^@/modules(?:/|$)",
        "Solo las capas de dominio autorizadas importan `@/modules/<capa>`.",
      ),
      INTERNAL_ALIAS,
      relativeEscape([...PLATFORM_AREAS, ...LAYERS, ...OTHER_SEGMENTS]),
    ],
  }),
  sourceLocation({
    name: "delivery",
    files: ["src/pages/**/*"],
    patterns: [
      pattern(
        `^@/(?!platform/(?:${alternatives(DELIVERY_PLATFORM_AREAS)})$|modules/(?:${alternatives(DELIVERY_LAYERS)})$|views$)`,
        "La entrega solo importa `@/platform/<área>` (config, logging, health, version o web), las capas `normative-source` y `structured-interpretation` por su API pública, y `@/views`.",
      ),
      relativeEscape([...PLATFORM_AREAS, ...LAYERS, ...OTHER_SEGMENTS]),
    ],
  }),
  // La comprobación de estado es la excepción sin sesión: no importa ninguna
  // capa de dominio ni las vistas.
  sourceLocation({
    name: "delivery/health",
    files: ["src/pages/api/health.ts"],
    patterns: [
      pattern(
        `^@/(?!platform/(?:${alternatives(DELIVERY_PLATFORM_AREAS)})$)`,
        "La comprobación de estado solo importa `@/platform/<área>` (config, logging, health, version o web).",
      ),
      relativeEscape([...PLATFORM_AREAS, ...LAYERS, ...OTHER_SEGMENTS]),
    ],
  }),
  // Vistas que comparten páginas y acciones: solo componen HTML.
  sourceLocation({
    name: "views",
    files: ["src/views/**/*"],
    patterns: [
      pattern(
        `^@/(?!platform/web$|modules/(?:${alternatives(DELIVERY_LAYERS)})$)`,
        "Las vistas solo importan `@/platform/web` y las capas `normative-source` y `structured-interpretation`, por su API pública.",
      ),
      relativeEscape([...PLATFORM_AREAS, ...LAYERS, ...OTHER_SEGMENTS]),
    ],
  }),
  ...PLATFORM_AREAS.map(platformArea),
  ...PORTABLE_MODULES.map(portableModule),
  ...LAYERS.map(domainLayer),

  serverAdapter,
]);
