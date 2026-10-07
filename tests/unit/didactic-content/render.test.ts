// Contenido estructurado de un tema y su renderizador
// (specs/002-boe-scorm-export: T052; FR-017, FR-018 y FR-020; SC-046;
// research.md, R7). Todo texto sale escapado, y la norma y el desarrollo se
// distinguen con una etiqueta de texto.
import { describe, expect, test } from "vitest";
import {
  CONTENT,
  contentToText,
  DEVELOPMENT_LABEL,
  renderBlock,
  renderBlocks,
  REQUIREMENT_LABEL,
  textToContent,
  UNSUPPORTED_LABEL,
} from "@/modules/didactic-content";
import type {
  ContentNode,
  RenderedRequirement,
} from "@/modules/didactic-content";

const HOSTILE =
  `<script>alert("x")</script><img src=x onerror='alert(1)'>` +
  `<a href="javascript:alert(2)">enlace</a> & <b>negrita</b>`;

function requirement(
  overrides: Partial<RenderedRequirement> = {},
): RenderedRequirement {
  return {
    code: "C1",
    kindName: "Capacidad",
    text: "Describir el ejemplo.",
    documentTitle: "Documento sintético",
    section: "Capacidades",
    pageFrom: 3,
    pageTo: 3,
    quote: "C1: Describir el ejemplo.",
    ...overrides,
  };
}

// Ningún elemento ni atributo activo procedente del texto.
function expectInert(html: string): void {
  // `onerror=` puede aparecer como texto escapado, nunca dentro de una etiqueta.
  expect(html).not.toMatch(/<script|<img|<b>|<[^>]*(?:onerror|javascript:)/i);
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&lt;b&gt;negrita&lt;/b&gt;");
}

describe("esquema del contenido", () => {
  test("admite encabezados, párrafos y listas de texto plano, y recorta espacios", () => {
    expect(
      CONTENT.parse([
        { type: "heading", text: "  Título  " },
        { type: "paragraph", text: "Una línea\nOtra línea" },
        { type: "list", items: ["uno", "dos"] },
      ]),
    ).toEqual([
      { type: "heading", text: "Título" },
      { type: "paragraph", text: "Una línea\nOtra línea" },
      { type: "list", items: ["uno", "dos"] },
    ]);
  });

  test.each([
    ["sin elementos", []],
    ["tipo desconocido", [{ type: "html", text: "<p>x</p>" }]],
    ["texto vacío", [{ type: "paragraph", text: "   " }]],
    ["lista vacía", [{ type: "list", items: [] }]],
    ["carácter de control", [{ type: "paragraph", text: "a\u0000b" }]],
    [
      "párrafo demasiado largo",
      [{ type: "paragraph", text: "a".repeat(4001) }],
    ],
    [
      "demasiados elementos",
      Array.from({ length: 61 }, () => ({ type: "paragraph", text: "x" })),
    ],
  ])("rechaza %s", (_name, value) => {
    expect(CONTENT.safeParse(value).success).toBe(false);
  });

  test("el texto con marcado es texto válido: se guarda tal cual y se escapa al mostrarlo", () => {
    const parsed = CONTENT.parse([{ type: "paragraph", text: HOSTILE }]);
    expect(parsed).toEqual([{ type: "paragraph", text: HOSTILE }]);
  });
});

describe("texto editable", () => {
  const nodes: ContentNode[] = [
    { type: "heading", text: "Título" },
    { type: "paragraph", text: "Primera línea\nSegunda línea" },
    { type: "list", items: ["uno", "dos"] },
    { type: "paragraph", text: "Cierre." },
  ];

  test("ida y vuelta sin pérdida", () => {
    const text = contentToText(nodes);
    expect(text).toBe(
      "# Título\n\nPrimera línea\nSegunda línea\n\n- uno\n- dos\n\nCierre.",
    );
    expect(CONTENT.parse(textToContent(text))).toEqual(nodes);
  });

  test("separa encabezados, listas y párrafos aunque vayan seguidos, y admite saltos de Windows", () => {
    expect(
      textToContent(
        "# Uno\r\ntexto\r\n- a\r\n- b\r\nmás texto\r\n\r\n\r\n# Dos",
      ),
    ).toEqual([
      { type: "heading", text: "Uno" },
      { type: "paragraph", text: "texto" },
      { type: "list", items: ["a", "b"] },
      { type: "paragraph", text: "más texto" },
      { type: "heading", text: "Dos" },
    ]);
    expect(textToContent("   \n\n  ")).toEqual([]);
  });

  test("no interpreta marcado: el texto hostil sigue siendo un párrafo", () => {
    expect(textToContent(HOSTILE)).toEqual([
      { type: "paragraph", text: HOSTILE },
    ]);
  });
});

describe("renderizador", () => {
  test("un bloque de requisito lleva su etiqueta, el texto de la norma, su referencia y su cita", () => {
    const html = renderBlock({
      kind: "requirement",
      requirement: requirement(),
    });
    expect(html).toContain(`<p class="kind">${REQUIREMENT_LABEL}</p>`);
    expect(html).not.toContain(DEVELOPMENT_LABEL);
    expect(html).toContain("<strong>C1</strong> Describir el ejemplo.");
    expect(html).toContain("Documento sintético, Capacidades, página 3");
    expect(html).toContain(
      "<blockquote>C1: Describir el ejemplo.</blockquote>",
    );
  });

  test("con una dirección de página, la referencia enlaza a cada página de origen", () => {
    const html = renderBlock(
      {
        kind: "requirement",
        requirement: requirement({ pageFrom: 3, pageTo: 4 }),
      },
      { pageHref: (page) => `/documents/abc/pages/${String(page)}` },
    );
    expect(html).toContain(
      '<a href="/documents/abc/pages/3">página 3</a> a <a href="/documents/abc/pages/4">página 4</a>',
    );
  });

  test("un bloque de desarrollo lleva su etiqueta y dice qué requisitos desarrolla", () => {
    const html = renderBlock({
      kind: "development",
      content: [
        { type: "heading", text: "Título" },
        { type: "paragraph", text: "Línea uno\nLínea dos" },
        { type: "list", items: ["a", "b"] },
      ],
      requirements: [requirement(), requirement({ code: "CE1.1" })],
    });
    expect(html).toContain(`<p class="kind">${DEVELOPMENT_LABEL}</p>`);
    expect(html).not.toContain(REQUIREMENT_LABEL);
    expect(html).toContain("<h3>Título</h3>");
    expect(html).toContain("<p>Línea uno<br />Línea dos</p>");
    expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
    expect(html).toContain("Desarrolla:");
    expect(html).toContain("<strong>C1</strong>");
    expect(html).toContain("<strong>CE1.1</strong>");
    expect(html).not.toContain(UNSUPPORTED_LABEL);
  });

  test("un desarrollo sin requisitos se muestra como sin respaldo normativo", () => {
    const html = renderBlock({
      kind: "development",
      content: [{ type: "paragraph", text: "Texto." }],
      requirements: [],
    });
    expect(html).toContain(UNSUPPORTED_LABEL);
    expect(html).not.toContain("Desarrolla:");
  });

  test("un requisito citado que ya no está en el inventario se dice, sin inventar su texto", () => {
    expect(
      renderBlock({ kind: "requirement", requirement: undefined }),
    ).toContain("ya no está en el inventario vigente");
  });

  test("el texto hostil sale como texto literal en todos los campos (SC-046)", () => {
    const hostile = requirement({
      code: HOSTILE,
      kindName: HOSTILE,
      text: HOSTILE,
      documentTitle: HOSTILE,
      section: HOSTILE,
      quote: HOSTILE,
    });
    const html = renderBlocks(
      [
        { kind: "requirement", requirement: hostile },
        {
          kind: "development",
          content: [
            { type: "heading", text: HOSTILE },
            { type: "paragraph", text: HOSTILE },
            { type: "list", items: [HOSTILE] },
          ],
          requirements: [hostile],
        },
      ],
      { pageHref: () => `/x"><script>alert(3)</script>` },
    );
    expectInert(html);
    expect(html).toContain('href="/x&quot;&gt;&lt;script&gt;');
    // Las únicas etiquetas son las del renderizador.
    const tags = new Set(
      [...html.matchAll(/<\/?([a-z0-9]+)/g)].map((match) => match[1]),
    );
    expect([...tags].sort()).toEqual([
      "a",
      "blockquote",
      "h3",
      "li",
      "p",
      "section",
      "span",
      "strong",
      "ul",
    ]);
  });
});
