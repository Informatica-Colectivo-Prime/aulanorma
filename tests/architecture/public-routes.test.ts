// Superficie HTTP cerrada y sin rutas sin control de acceso (FR-006 C7 de
// 001; specs/002-boe-scorm-export/contracts/http-surface.md; ADR 0004).
//
// Sustituye a la comprobación de ruta única de la base de ingeniería, que
// fallaba ante una segunda ruta. Ahora falla ante cualquier ruta que no esté
// en la lista cerrada de esta prueba, ante cualquier diferencia entre esa
// lista, los ficheros de `src/pages` y `ROUTES` de la frontera, y ante una
// ruta de producto que no se declare con su guarda de acceso.
//
// - `/api/health` es la única ruta sin guarda: es la excepción cerrada del
//   principio V y no usa `@/platform/web`.
// - `entryPage` y `entryAction` son lo único accesible sin sesión, y solo las
//   usan la página de entrada y su envío.
// - El resto usa `protectedPage` o `protectedAction`.
//
// La frontera y las rutas se verifican sobre el AST de TypeScript. Es un
// control complementario de las pruebas de comportamiento de la frontera, de
// las de contrato de sesión y de la matriz de `scripts/smoke-test.mjs`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { METHODS } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { ROUTES } from "@/platform/http-boundary";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const BOUNDARY = "src/platform/http-boundary/index.ts";
const WEB = "@/platform/web";

type Guard =
  | "entryPage"
  | "entryAction"
  | "protectedPage"
  | "protectedAction"
  | "protectedUpload"
  | "none";

interface SurfaceRoute {
  readonly target: string;
  readonly file: string;
  readonly methods: readonly string[];
  readonly guard: Guard;
  // Tamaño máximo del cuerpo; 0 si la ruta no admite cuerpo.
  readonly maxBody: number;
}

const FORM = 4096;
const TEXT_FORM = 65_536;
const UPLOAD = 64 * 1024 * 1024;

const page = (target: string, file: string): SurfaceRoute => ({
  target,
  file: `src/pages/${file}`,
  methods: ["GET"],
  guard: "protectedPage",
  maxBody: 0,
});
const action = (
  target: string,
  maxBody: number = FORM,
  guard: Guard = "protectedAction",
): SurfaceRoute => ({
  target,
  file: `src/pages${target}.ts`,
  methods: ["POST"],
  guard,
  maxBody,
});

// Lista cerrada. Añadir una ruta exige añadirla aquí, en `ROUTES` y en el
// contrato, con su guarda.
const SURFACE: readonly SurfaceRoute[] = [
  {
    target: "/api/health",
    file: "src/pages/api/health.ts",
    methods: ["GET", "HEAD", "OPTIONS"],
    guard: "none",
    maxBody: 0,
  },
  {
    target: "/",
    file: "src/pages/index.ts",
    methods: ["GET"],
    guard: "protectedPage",
    maxBody: 0,
  },
  {
    target: "/login",
    file: "src/pages/login.ts",
    methods: ["GET"],
    guard: "entryPage",
    maxBody: 0,
  },
  {
    target: "/account/password",
    file: "src/pages/account/password.ts",
    methods: ["GET"],
    guard: "protectedPage",
    maxBody: 0,
  },
  {
    target: "/api/session/sign-in",
    file: "src/pages/api/session/sign-in.ts",
    methods: ["POST"],
    guard: "entryAction",
    maxBody: FORM,
  },
  {
    target: "/api/session/sign-out",
    file: "src/pages/api/session/sign-out.ts",
    methods: ["POST"],
    guard: "protectedAction",
    maxBody: FORM,
  },
  {
    target: "/api/account/password",
    file: "src/pages/api/account/password.ts",
    methods: ["POST"],
    guard: "protectedAction",
    maxBody: FORM,
  },
  // Historia 1: documento e interpretación. Todas exigen sesión.
  page("/documents", "documents/index.ts"),
  page("/documents/new", "documents/new.ts"),
  page("/documents/:id", "documents/[id]/index.ts"),
  page("/documents/:id/file", "documents/[id]/file.ts"),
  page("/documents/:id/pages/:n", "documents/[id]/pages/[n].ts"),
  page("/interpretations/:id", "interpretations/[id]/index.ts"),
  page("/interpretations/:id/unit", "interpretations/[id]/unit.ts"),
  page(
    "/interpretations/:id/requirements/new",
    "interpretations/[id]/requirements/new.ts",
  ),
  page(
    "/interpretations/:id/requirements/:id",
    "interpretations/[id]/requirements/[rid].ts",
  ),
  // Historia 2: índice y cobertura. Todas exigen sesión.
  page("/outlines/:id", "outlines/[id]/index.ts"),
  page("/outlines/:id/preview", "outlines/[id]/preview.ts"),
  page("/outlines/:id/entries/new", "outlines/[id]/entries/new.ts"),
  page("/outlines/:id/entries/:id", "outlines/[id]/entries/[eid].ts"),
  // Historia 3: temario, presupuesto y aprobaciones. Todas exigen sesión.
  page("/syllabus/:id", "syllabus/[id].ts"),
  page("/topics/:id", "topics/[id]/index.ts"),
  page("/topics/:id/blocks/new", "topics/[id]/blocks/new.ts"),
  page("/topics/:id/blocks/:id", "topics/[id]/blocks/[bid].ts"),
  // Historia 4: exportación y descarga. Todas exigen sesión.
  page("/export/:id", "export/[id]/index.ts"),
  page("/export/:id/preview", "export/[id]/preview.ts"),
  page("/export/packages/:id", "export/packages/[id]/index.ts"),
  page(
    "/export/packages/:id/instructions",
    "export/packages/[id]/instructions.ts",
  ),
  page("/budget", "budget/index.ts"),
  // Historial, de solo lectura.
  page("/history", "history/index.ts"),
  page("/history/documents/:id", "history/documents/[id].ts"),
  page("/history/interpretations/:id", "history/interpretations/[id].ts"),
  page("/history/outlines/:id", "history/outlines/[id].ts"),
  page("/history/topics/:id", "history/topics/[id].ts"),
  page("/metrics", "metrics/index.ts"),
  action("/api/documents/upload", UPLOAD, "protectedUpload"),
  action("/api/documents/resolve-page"),
  action("/api/interpretations/request"),
  action("/api/interpretations/correct", TEXT_FORM),
  action("/api/interpretations/validate"),
  action("/api/interpretations/reject", TEXT_FORM),
  action("/api/interpretations/resubmit"),
  action("/api/outlines/request"),
  action("/api/outlines/edit", TEXT_FORM),
  action("/api/outlines/approve"),
  action("/api/outlines/reject", TEXT_FORM),
  action("/api/outlines/resubmit"),
  action("/api/syllabus/generate"),
  action("/api/syllabus/approve"),
  action("/api/topics/edit", TEXT_FORM),
  action("/api/topics/approve"),
  action("/api/topics/reject", TEXT_FORM),
  action("/api/topics/resubmit"),
  action("/api/references/check"),
  action("/api/export/create"),
  action("/api/budget/limit"),
  action("/api/budget/reconcile", TEXT_FORM),
];

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

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(path.join(repoRoot, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

// Destino que Next.js asigna a un fichero de `src/pages`, con sus segmentos
// variables en la forma cerrada de la frontera: `[n]` es un número de página
// y cualquier otro, un identificador.
function targetOf(file: string): string {
  const route = file
    .replace(/^src\/pages/, "")
    .replace(/\.tsx?$/, "")
    .replace(/\/index$/, "")
    .replace(/\[n\]/g, ":n")
    .replace(/\[[a-z]+\]/g, ":id");
  return route === "" ? "/" : route;
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
  visit(parse(file));
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

// Nombres que el fichero importa en ejecución de `@/platform/web`.
function webImports(source: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === WEB &&
      statement.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword
    ) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        names.push(
          ...bindings.elements
            .filter((element) => !element.isTypeOnly)
            .map((element) => (element.propertyName ?? element.name).text),
        );
      }
    }
  }
  return names;
}

function calledGuard(expression: ts.Expression | undefined): string {
  return expression !== undefined &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression)
    ? expression.expression.text
    : "";
}

// Guarda con la que una página declara `getServerSideProps`.
function pageGuard(source: ts.SourceFile): string {
  for (const statement of source.statements) {
    if (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ) === true
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === "getServerSideProps"
        ) {
          return calledGuard(declaration.initializer);
        }
      }
    }
  }
  return "";
}

// Guarda con la que una acción declara su exportación por defecto.
function actionGuard(source: ts.SourceFile): string {
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement) && statement.isExportEquals !== true) {
      return calledGuard(statement.expression);
    }
  }
  return "";
}

const GUARDS: readonly string[] = [
  "entryPage",
  "entryAction",
  "protectedPage",
  "protectedAction",
  "protectedUpload",
];

describe("lista cerrada de rutas", () => {
  test("src/pages contiene exactamente los ficheros de la lista", () => {
    expect(listFiles("src/pages").sort()).toEqual(
      SURFACE.map(({ file }) => file).sort(),
    );
  });

  test.each(SURFACE)("$file es el fichero de $target", ({ file, target }) => {
    expect(targetOf(file)).toBe(target);
  });

  test("no existe src/app ni directorios de rutas en la raíz", () => {
    expect(existsSync(path.join(repoRoot, "src/app"))).toBe(false);
    expect(existsSync(path.join(repoRoot, "app"))).toBe(false);
    expect(existsSync(path.join(repoRoot, "pages"))).toBe(false);
  });

  test("ROUTES de la frontera coincide con la lista, destino a destino y método a método", () => {
    expect(
      ROUTES.map(({ target, methods }) => [target, [...methods]]),
    ).toStrictEqual(SURFACE.map(({ target, methods }) => [target, methods]));
  });

  test("solo las acciones admiten cuerpo, y cada una con su máximo exacto", () => {
    for (const route of ROUTES) {
      const declared = SURFACE.find(({ target }) => target === route.target);
      const isAction =
        declared?.guard === "entryAction" ||
        declared?.guard === "protectedAction" ||
        declared?.guard === "protectedUpload";
      expect(route.maxBody > 0, route.target).toBe(isAction);
      expect(route.maxBody, route.target).toBe(declared?.maxBody);
    }
    // Solo la subida de un PDF admite un cuerpo grande.
    expect(
      SURFACE.filter(({ maxBody }) => maxBody > TEXT_FORM).map(
        ({ target }) => target,
      ),
    ).toEqual(["/api/documents/upload"]);
  });

  test("los segmentos variables son solo :id y :n, y ningún destino lleva comodines", () => {
    for (const { target } of ROUTES) {
      for (const segment of target.split("/")) {
        expect(segment, target).toMatch(/^(?::id|:n|[a-z-]*)$/);
      }
    }
  });
});

describe("la frontera solo nombra los destinos y los métodos de la lista", () => {
  test(`${BOUNDARY} existe`, () => {
    expect(existsSync(path.join(repoRoot, BOUNDARY))).toBe(true);
  });

  test("los únicos destinos que nombra la frontera son los de la lista", () => {
    const targets = stringLiterals(BOUNDARY).filter((literal) =>
      literal.startsWith("/"),
    );
    expect([...new Set(targets)].sort()).toEqual(
      SURFACE.map(({ target }) => target).sort(),
    );
  });

  test("la frontera no nombra métodos distintos de los de la lista", () => {
    const declared = new Set(SURFACE.flatMap(({ methods }) => methods));
    const others = stringLiterals(BOUNDARY)
      .flatMap(methodTokens)
      .filter((method) => !declared.has(method));
    expect([...new Set(others)]).toEqual([]);
  });
});

describe("ninguna ruta de producto sin control de acceso", () => {
  const product = SURFACE.filter(({ guard }) => guard !== "none");

  test.each(product)(
    "$file se declara con $guard, importada de @/platform/web",
    ({ file, guard }) => {
      const source = parse(file);
      const isPage = guard === "entryPage" || guard === "protectedPage";
      expect(isPage ? pageGuard(source) : actionGuard(source)).toBe(guard);
      expect(webImports(source)).toContain(guard);
    },
  );

  test.each(product)(
    "$file no importa ninguna otra guarda",
    ({ file, guard }) => {
      const others = webImports(parse(file)).filter(
        (name) => GUARDS.includes(name) && name !== guard,
      );
      expect(others).toEqual([]);
    },
  );

  test("solo la entrada y su envío son accesibles sin sesión", () => {
    const open = SURFACE.filter(
      ({ guard }) => guard === "entryPage" || guard === "entryAction",
    ).map(({ target }) => target);
    expect(open).toEqual(["/login", "/api/session/sign-in"]);
  });

  test("la comprobación de estado no usa la entrega web ni ninguna guarda", () => {
    const health = SURFACE.find(({ guard }) => guard === "none");
    expect(health?.target).toBe("/api/health");
    expect(webImports(parse(health?.file ?? ""))).toEqual([]);
    expect(
      SURFACE.filter(({ guard }) => guard === "none"),
      "una sola ruta sin guarda",
    ).toHaveLength(1);
  });

  test("las páginas no exportan ni usan otra forma de obtener datos", () => {
    for (const { file, guard } of product) {
      const text = readFileSync(path.join(repoRoot, file), "utf8");
      expect(text, file).not.toMatch(/getStaticProps|getInitialProps/);
      if (guard === "entryAction" || guard === "protectedAction") {
        expect(text, file).not.toMatch(/getServerSideProps/);
      }
    }
  });
});
