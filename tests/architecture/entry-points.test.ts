// Puntos de entrada admitidos (T032; FR-006 C7; research.md, R1, R8 y K17):
// `npm run dev` y `npm start` son los únicos, y los dos ejecutan el preflight
// seguido de `server.mjs`. Como las demás pruebas escritas antes de la
// implementación, falla hasta que existan `next.config.ts` (T039) y
// `server.mjs` (T041).
//
// Todo se comprueba de forma estructural, sin ejecutar nada:
// - cada script de `package.json` se analiza como una lista de comandos
//   simples unidos por `&&`, cada uno con sus asignaciones de entorno y sus
//   argumentos. Cualquier otra sintaxis del intérprete (comillas, `;`, `||`,
//   tuberías, redirecciones, sustituciones o comodines) hace fallar la prueba,
//   porque ya no se podría garantizar qué se ejecuta;
// - `next.config.ts`, `server.mjs` y los ficheros operativos se analizan con el
//   AST de TypeScript, así que los comentarios no cuentan.
// `public-routes.test.ts` comprueba además la única ruta pública y la
// frontera; aquí solo se verifica lo que la eludiría.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

interface PackageManifest {
  readonly scripts?: Readonly<Record<string, string>>;
}

const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
) as PackageManifest;
const scripts: Readonly<Record<string, string>> = manifest.scripts ?? {};

// Scripts de npm.

interface Command {
  readonly env: Readonly<Record<string, string>>;
  readonly argv: readonly string[];
}

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
// Caracteres con significado para el intérprete fuera de `&&`.
const SHELL_SYNTAX = /[;|&<>()$`"'\\*?[\]{}~!#]/;

// Comandos del script, o `undefined` si usa una sintaxis no admitida.
function parseScript(script: string): Command[] | undefined {
  const commands: string[][] = [[]];
  for (const token of script.trim().split(/\s+/)) {
    if (token === "&&") {
      commands.push([]);
    } else if (token === "" || SHELL_SYNTAX.test(token)) {
      return undefined;
    } else {
      commands.at(-1)?.push(token);
    }
  }
  const parsed: Command[] = [];
  for (const words of commands) {
    const env: Record<string, string> = {};
    let index = 0;
    for (; index < words.length; index += 1) {
      const match = ASSIGNMENT.exec(words[index] ?? "");
      if (match === null) {
        break;
      }
      const [, name = "", value = ""] = match;
      if (name in env) {
        return undefined;
      }
      env[name] = value;
    }
    const argv = words.slice(index);
    if (argv.length === 0) {
      return undefined;
    }
    parsed.push({ env, argv });
  }
  return parsed;
}

function commandsOf(name: string): readonly Command[] {
  return parseScript(scripts[name] ?? "") ?? [];
}

function normalized(argument: string): string {
  return path.posix.normalize(argument);
}

// Subcomando de Next.js que invoca el comando, si invoca Next.js: `""` si no
// tiene subcomando, que en Next.js equivale a `next dev`.
function nextSubcommand(command: Command): string | undefined {
  const index = command.argv.findIndex((argument) => {
    const value = normalized(argument);
    return (
      path.posix.basename(value) === "next" ||
      value.endsWith("next/dist/bin/next")
    );
  });
  if (index === -1) {
    return undefined;
  }
  return (
    command.argv
      .slice(index + 1)
      .find((argument) => !argument.startsWith("-")) ?? ""
  );
}

function runs(command: Command, file: string): boolean {
  return command.argv.some((argument) => normalized(argument) === file);
}

const NEXT_SUBCOMMANDS: ReadonlySet<string> = new Set(["build", "typegen"]);
const PREFLIGHT = "scripts/preflight.mjs";
const SERVER = "server.mjs";

const ENTRY_POINTS = [
  { script: "dev", mode: "development" },
  { script: "start", mode: "production" },
] as const;

describe("scripts de package.json", () => {
  test("todos son comandos simples unidos por &&", () => {
    const unsupported = Object.entries(scripts)
      .filter(([, script]) => parseScript(script) === undefined)
      .map(([name]) => name);
    expect(unsupported, "scripts con sintaxis no admitida").toEqual([]);
  });

  describe.each(ENTRY_POINTS)("$script", ({ script, mode }) => {
    test("es el preflight seguido de server.mjs", () => {
      const commands = commandsOf(script);
      expect(commands, "dos comandos unidos por &&").toHaveLength(2);
      expect(commands[0]?.argv, "preflight con su modo").toEqual([
        "node",
        PREFLIGHT,
        script,
      ]);
      expect(commands[1]?.argv, "server.mjs sin argumentos").toEqual([
        "node",
        SERVER,
      ]);
    });

    test(`fija NODE_ENV=${mode} en los dos lados de &&`, () => {
      const commands = commandsOf(script);
      expect(commands).toHaveLength(2);
      expect(commands.map(({ env }) => env.NODE_ENV)).toEqual([mode, mode]);
    });

    test("no añade otras variables de entorno", () => {
      expect(commandsOf(script).map(({ env }) => env)).toEqual([
        { NODE_ENV: mode },
        { NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: mode },
      ]);
    });
  });

  test("ninguno invoca next dev, next start ni next sin subcomando", () => {
    const direct = Object.keys(scripts).flatMap((name) =>
      commandsOf(name)
        .map(nextSubcommand)
        .filter(
          (subcommand) =>
            subcommand !== undefined && !NEXT_SUBCOMMANDS.has(subcommand),
        )
        .map((subcommand) => `${name}: next ${subcommand ?? ""}`.trim()),
    );
    expect(direct, "invocaciones de Next.js no admitidas").toEqual([]);
  });

  test("solo dev y start ejecutan el preflight y server.mjs", () => {
    const others = Object.keys(scripts)
      .filter((name) => name !== "dev" && name !== "start")
      .filter((name) =>
        commandsOf(name).some(
          (command) => runs(command, PREFLIGHT) || runs(command, SERVER),
        ),
      );
    expect(others, "otros scripts que arrancan el servidor").toEqual([]);
  });

  test("cada invocación de next o de server.mjs fija NEXT_TELEMETRY_DISABLED=1", () => {
    const missing = Object.keys(scripts).filter((name) =>
      commandsOf(name).some(
        (command) =>
          (nextSubcommand(command) !== undefined || runs(command, SERVER)) &&
          command.env.NEXT_TELEMETRY_DISABLED !== "1",
      ),
    );
    expect(missing, "scripts sin NEXT_TELEMETRY_DISABLED=1").toEqual([]);
  });
});

// Ficheros.

const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

function listFiles(relativeDirectory: string): string[] {
  const absolute = path.join(repoRoot, relativeDirectory);
  if (!existsSync(absolute)) {
    return [];
  }
  return readdirSync(absolute).flatMap((entry) => {
    const relative = path.posix.join(relativeDirectory, entry);
    return statSync(path.join(repoRoot, relative)).isDirectory()
      ? listFiles(relative)
      : [relative];
  });
}

// Ficheros operativos: `src/`, `scripts/` y el código de la raíz. Las pruebas
// no son puntos de entrada.
function operationalFiles(): string[] {
  const root = readdirSync(repoRoot).filter((entry) =>
    statSync(path.join(repoRoot, entry)).isFile(),
  );
  return [...root, ...listFiles("src"), ...listFiles("scripts")]
    .filter((file) => CODE_EXTENSIONS.has(path.extname(file)))
    .sort();
}

function parse(file: string): ts.SourceFile {
  const extension = path.extname(file);
  const kind =
    extension === ".tsx"
      ? ts.ScriptKind.TSX
      : extension === ".jsx"
        ? ts.ScriptKind.JSX
        : [".js", ".mjs", ".cjs"].includes(extension)
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
  return ts.createSourceFile(
    file,
    readFileSync(path.join(repoRoot, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => {
    visit(child, callback);
  });
}

function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return undefined;
}

// Módulos cargados en ejecución: `import` y `export … from` que no son solo de
// tipos, `import()` y `require()`.
function runtimeModules(source: ts.SourceFile): string[] {
  const modules: string[] = [];
  visit(source, (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const typeOnly =
        clause !== undefined &&
        (clause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
          (clause.name === undefined &&
            bindings !== undefined &&
            ts.isNamedImports(bindings) &&
            bindings.elements.every((element) => element.isTypeOnly)));
      if (!typeOnly) {
        modules.push(node.moduleSpecifier.text);
      }
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      modules.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const [first] = node.arguments;
      if (
        first !== undefined &&
        ts.isStringLiteralLike(first) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        modules.push(first.text);
      }
    }
  });
  return modules;
}

function withoutNodePrefix(specifier: string): string {
  return specifier.replace(/^node:/, "");
}

// Carga el servidor de Next.js: el paquete `next` en ejecución o sus módulos de
// servidor o de línea de órdenes.
function loadsNextServer(specifier: string): boolean {
  return (
    specifier === "next" ||
    specifier.startsWith("next/dist/server") ||
    specifier.startsWith("next/dist/cli")
  );
}

const SERVER_CALLS: ReadonlySet<string> = new Set([
  "createServer",
  "createSecureServer",
  "listen",
]);

describe("otros puntos de entrada", () => {
  test("ningún fichero operativo salvo server.mjs crea un servidor, escucha o carga el servidor de Next.js", () => {
    const found = operationalFiles()
      .filter((file) => file !== SERVER)
      .flatMap((file) => {
        const source = parse(file);
        const reasons: string[] = [];
        if (runtimeModules(source).some(loadsNextServer)) {
          reasons.push(`${file}: carga el servidor de Next.js`);
        }
        visit(source, (node) => {
          if (ts.isCallExpression(node)) {
            const name = calleeName(node);
            if (name !== undefined && SERVER_CALLS.has(name)) {
              reasons.push(`${file}: llama a ${name}`);
            }
          }
        });
        return reasons;
      });
    expect(found).toEqual([]);
  });

  test("no existen middleware, proxy, instrumentation, src/app ni app o pages en la raíz", () => {
    const forbidden = [
      ...["", "src/"].flatMap((base) =>
        ["middleware", "proxy", "instrumentation"].flatMap((name) =>
          [...CODE_EXTENSIONS].map((extension) => `${base}${name}${extension}`),
        ),
      ),
      "src/app",
      "app",
      "pages",
    ].filter((entry) => existsSync(path.join(repoRoot, entry)));
    expect(forbidden, "entradas que eludirían la frontera").toEqual([]);
  });

  test("src/pages no contiene otra ruta que la API Route de estado", () => {
    const extra = listFiles("src/pages").filter(
      (file) => file !== "src/pages/api/health.ts",
    );
    expect(extra, "segunda ruta pública").toEqual([]);
  });
});

// `next.config.ts` (T039).

const NEXT_CONFIG = "next.config.ts";

function requireFile(file: string, task: string): ts.SourceFile {
  if (!existsSync(path.join(repoRoot, file))) {
    expect.fail(`falta ${file} (${task})`);
  }
  return parse(file);
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
    ? name.text
    : undefined;
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isSatisfiesExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

// Objeto de configuración exportado por defecto, directamente o mediante una
// constante del mismo fichero.
function exportedConfig(source: ts.SourceFile): ts.ObjectLiteralExpression {
  const assignment = source.statements.find(
    (statement): statement is ts.ExportAssignment =>
      ts.isExportAssignment(statement) && statement.isExportEquals !== true,
  );
  if (assignment === undefined) {
    return expect.fail(
      "next.config.ts no exporta la configuración por defecto",
    );
  }
  let expression = unwrap(assignment.expression);
  if (ts.isIdentifier(expression)) {
    const name = expression.text;
    const declaration = source.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations)
      .find(
        (candidate) =>
          ts.isIdentifier(candidate.name) && candidate.name.text === name,
      );
    if (declaration?.initializer !== undefined) {
      expression = unwrap(declaration.initializer);
    }
  }
  if (!ts.isObjectLiteralExpression(expression)) {
    return expect.fail("la configuración exportada no es un objeto literal");
  }
  return expression;
}

// Valor de una propiedad de un objeto literal, que debe aparecer una sola vez.
function property(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  const matches = object.properties.filter(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) &&
      propertyName(candidate.name) === name,
  );
  expect(matches.length, `${name} aparece una sola vez`).toBeLessThanOrEqual(1);
  const [match] = matches;
  return match === undefined ? undefined : unwrap(match.initializer);
}

describe("next.config.ts", () => {
  test("no introduce rewrites, headers, redirects, middleware ni proxy", () => {
    const source = requireFile(NEXT_CONFIG, "T039");
    const found: string[] = [];
    visit(source, (node) => {
      if (ts.isSpreadAssignment(node)) {
        found.push("propiedades propagadas que no se pueden verificar");
      } else if (
        ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node)
      ) {
        const name = propertyName(node.name);
        if (name === undefined) {
          found.push("propiedad con nombre calculado");
        } else if (
          ["rewrites", "headers", "redirects"].includes(name) ||
          /middleware|proxy/i.test(name)
        ) {
          found.push(name);
        }
      }
    });
    expect(found).toEqual([]);
  });

  test("logging.incomingRequests.ignore es exactamente [/^\\/api\\/health$/]", () => {
    const config = exportedConfig(requireFile(NEXT_CONFIG, "T039"));
    const logging = property(config, "logging");
    expect(logging !== undefined && ts.isObjectLiteralExpression(logging)).toBe(
      true,
    );
    const incoming =
      logging !== undefined && ts.isObjectLiteralExpression(logging)
        ? property(logging, "incomingRequests")
        : undefined;
    const ignore =
      incoming !== undefined && ts.isObjectLiteralExpression(incoming)
        ? property(incoming, "ignore")
        : undefined;
    expect(
      ignore !== undefined && ts.isArrayLiteralExpression(ignore)
        ? ignore.elements.map((element) =>
            ts.isRegularExpressionLiteral(element) ? element.text : "otro",
          )
        : undefined,
    ).toEqual(["/^\\/api\\/health$/"]);
  });
});

// `server.mjs` (T041).

function isProcessEnv(node: ts.Node): node is ts.PropertyAccessExpression {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "env" &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process"
  );
}

function insideLoop(node: ts.Node): boolean {
  for (let current = node.parent; !ts.isSourceFile(current);) {
    if (ts.isIterationStatement(current, false)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

const DIAGNOSTIC_MODULES: ReadonlySet<string> = new Set([
  "async_hooks",
  "diagnostics_channel",
  "inspector",
  "inspector/promises",
  "perf_hooks",
  "trace_events",
  "v8",
]);

describe("server.mjs", () => {
  test("no usa propiedades privadas de Node.js", () => {
    const found: string[] = [];
    visit(requireFile(SERVER, "T041"), (node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        (node.name.text.startsWith("_") || node.name.text === "binding")
      ) {
        found.push(node.name.text);
      } else if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text.startsWith("_")
      ) {
        found.push(node.argumentExpression.text);
      } else if (ts.isIdentifier(node) && node.text === "internalBinding") {
        found.push(node.text);
      }
    });
    expect(found).toEqual([]);
  });

  test("solo lee process.env.NODE_ENV", () => {
    const found: string[] = [];
    visit(requireFile(SERVER, "T041"), (node) => {
      if (
        ts.isElementAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "process"
      ) {
        found.push("process[…]");
      } else if (isProcessEnv(node)) {
        const parent = node.parent;
        if (
          !ts.isPropertyAccessExpression(parent) ||
          parent.expression !== node ||
          parent.name.text !== "NODE_ENV"
        ) {
          found.push(
            ts.isPropertyAccessExpression(parent) && parent.expression === node
              ? `process.env.${parent.name.text}`
              : "process.env",
          );
        }
      }
    });
    expect(found, "lecturas de entorno no admitidas").toEqual([]);
  });

  test("llama a handle de Next.js como máximo una vez y nunca en un bucle", () => {
    const source = requireFile(SERVER, "T041");
    const handlers = new Set<string>();
    const isRequestHandler = (expression: ts.Expression): boolean => {
      const value = ts.isAwaitExpression(expression)
        ? expression.expression
        : expression;
      return (
        ts.isCallExpression(value) && calleeName(value) === "getRequestHandler"
      );
    };
    visit(source, (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        isRequestHandler(unwrap(node.initializer))
      ) {
        handlers.add(node.name.text);
      }
    });
    const calls: ts.CallExpression[] = [];
    visit(source, (node) => {
      if (!ts.isCallExpression(node)) {
        return;
      }
      let callee = node.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        ["call", "apply"].includes(callee.name.text)
      ) {
        callee = callee.expression;
      }
      if (
        (ts.isIdentifier(callee) && handlers.has(callee.text)) ||
        isRequestHandler(callee)
      ) {
        calls.push(node);
      }
    });
    expect(calls.length, "llamadas a handle").toBeLessThanOrEqual(1);
    expect(calls.filter(insideLoop), "llamadas dentro de un bucle").toEqual([]);
  });

  test("no contiene instrumentación de diagnóstico", () => {
    const source = requireFile(SERVER, "T041");
    const found = runtimeModules(source)
      .map(withoutNodePrefix)
      .filter((specifier) => DIAGNOSTIC_MODULES.has(specifier));
    visit(source, (node) => {
      if (node.kind === ts.SyntaxKind.DebuggerStatement) {
        found.push("debugger");
      } else if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === "console" ||
          (node.expression.text === "process" && node.name.text === "report"))
      ) {
        found.push(`${node.expression.text}.${node.name.text}`);
      }
    });
    expect(found).toEqual([]);
  });
});
