// Una única ruta pública y ninguna ampliación de la excepción por analogía
// (FR-006 C7). Como las demás pruebas escritas antes de la implementación,
// falla hasta que existan la API Route (T037) y la frontera HTTP (T038).
//
// La frontera se verifica sobre el AST de TypeScript, sin depender de su
// interfaz exportada. Los comentarios no forman parte del AST y los
// especificadores de módulo (`import`, `export … from`, `import type` e
// `import()`) no se consideran. Del resto de literales de texto:
// - el único con forma de ruta (empieza por `/`) puede ser `/api/health`; un
//   prefijo o cualquier otra ruta sería una ampliación por analogía;
// - los literales formados solo por identificadores en mayúsculas (por
//   ejemplo, `"POST"` o `"GET, HEAD, OPTIONS"`) no pueden nombrar un método de
//   `http.METHODS` distinto de `GET`, `HEAD` y `OPTIONS`. Un texto libre que
//   mencione un método no es una lista de métodos y no se cuenta.
// Es un control complementario de las pruebas de comportamiento de la
// frontera (T024 y la matriz de `scripts/smoke-test.mjs`).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { METHODS } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const PUBLIC_ROUTE = "src/pages/api/health.ts";
const BOUNDARY = "src/platform/http-boundary/index.ts";
const CANONICAL_TARGET = "/api/health";
const DELEGATED_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
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

function isModuleSpecifier(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
      parent.moduleSpecifier === node) ||
    ts.isExternalModuleReference(parent) ||
    (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) ||
    (ts.isCallExpression(parent) &&
      parent.expression.kind === ts.SyntaxKind.ImportKeyword)
  );
}

function stringLiterals(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(path.join(repoRoot, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const literals: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) {
      if (!isModuleSpecifier(node)) {
        literals.push(node.text);
      }
    } else if (ts.isTemplateExpression(node)) {
      literals.push(
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return literals;
}

const UPPERCASE_IDENTIFIER = /^[A-Z][A-Z-]*$/;

function methodTokens(literal: string): string[] {
  const tokens = literal.split(/[\s,|]+/).filter((token) => token !== "");
  if (!tokens.every((token) => UPPERCASE_IDENTIFIER.test(token))) {
    return [];
  }
  return tokens.filter((token) => METHODS.includes(token));
}

describe("una única ruta pública", () => {
  test(`src/pages contiene exactamente ${PUBLIC_ROUTE}`, () => {
    expect(listFiles("src/pages")).toEqual([PUBLIC_ROUTE]);
  });

  test("no existe src/app ni directorios de rutas en la raíz", () => {
    expect(existsSync(path.join(repoRoot, "src/app"))).toBe(false);
    expect(existsSync(path.join(repoRoot, "app"))).toBe(false);
    expect(existsSync(path.join(repoRoot, "pages"))).toBe(false);
  });
});

describe(`la frontera solo delega ${CANONICAL_TARGET} con GET, HEAD y OPTIONS`, () => {
  test(`${BOUNDARY} existe`, () => {
    expect(existsSync(path.join(repoRoot, BOUNDARY))).toBe(true);
  });

  test(`el único destino que nombra la frontera es ${CANONICAL_TARGET}`, () => {
    const targets = stringLiterals(BOUNDARY).filter((literal) =>
      literal.startsWith("/"),
    );
    expect(targets).toContain(CANONICAL_TARGET);
    expect([...new Set(targets)]).toEqual([CANONICAL_TARGET]);
  });

  test("la frontera no nombra métodos distintos de GET, HEAD y OPTIONS", () => {
    const others = stringLiterals(BOUNDARY)
      .flatMap(methodTokens)
      .filter((method) => !DELEGATED_METHODS.has(method));
    expect([...new Set(others)]).toEqual([]);
  });
});
