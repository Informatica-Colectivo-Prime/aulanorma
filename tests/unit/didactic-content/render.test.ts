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
import type { Html } from "@/platform/markup";

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

function text(markup: Html): string {
  return markup.text;
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
    const html = text(
      renderBlock({
        kind: "requirement",
        requirement: requirement(),
      }),
    );
    expect(html).toContain(`<p class="kind">${REQUIREMENT_LABEL}</p>`);
    expect(html).not.toContain(DEVELOPMENT_LABEL);
    expect(html).toContain("<strong>C1</strong> Describir el ejemplo.");
    expect(html).toContain("Documento sintético, Capacidades, página 3");
    expect(html).toContain(
      "<blockquote>C1: Describir el ejemplo.</blockquote>",
    );
  });

  test("con una dirección de página, la referencia enlaza a cada página de origen", () => {
    const html = text(
      renderBlock(
        {
          kind: "requirement",
          requirement: requirement({ pageFrom: 3, pageTo: 4 }),
        },
        { pageHref: (page) => `/documents/abc/pages/${String(page)}` },
      ),
    );
    expect(html).toContain(
      '<a href="/documents/abc/pages/3">página 3</a> a <a href="/documents/abc/pages/4">página 4</a>',
    );
  });

  test("un bloque de desarrollo lleva su etiqueta y dice qué requisitos desarrolla", () => {
    const html = text(
      renderBlock({
        kind: "development",
        content: [
          { type: "heading", text: "Título" },
          { type: "paragraph", text: "Línea uno\nLínea dos" },
          { type: "list", items: ["a", "b"] },
        ],
        requirements: [requirement(), requirement({ code: "CE1.1" })],
      }),
    );
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
    const html = text(
      renderBlock({
        kind: "development",
        content: [{ type: "paragraph", text: "Texto." }],
        requirements: [],
      }),
    );
    expect(html).toContain(UNSUPPORTED_LABEL);
    expect(html).not.toContain("Desarrolla:");
  });

  test("un requisito citado que ya no está en el inventario se dice, sin inventar su texto", () => {
    expect(
      renderBlock({ kind: "requirement", requirement: undefined }).text,
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
    const html = text(
      renderBlocks(
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
      ),
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

  // Cada carga se coloca en todos los campos. Si se sustituye su forma
  // escapada por un marcador, el resultado es idéntico al de un texto
  // inofensivo: el texto no aporta al HTML nada más que su forma escapada.
  test.each([
    ["etiqueta de script", `<script>alert(1)</script>`],
    ["cierre del contenedor", `</section></p><iframe src="//example.invalid">`],
    ["atributo con comillas dobles", `" onmouseover="alert(1)" x="`],
    ["atributo con comillas simples", `' onfocus='alert(1)' autofocus='`],
    ["entidad ya escapada", `&lt;img src=x onerror=alert(1)&gt; &#60;b&#62;`],
    ["comentario y CDATA", `<!-- --><![CDATA[<svg onload=alert(1)>]]>`],
    ["etiqueta sin cerrar", `<svg/onload=alert(1)`],
    ["enlace con esquema", `<a href="javascript:alert(1)">x</a>`],
  ])("inyección por %s: solo aporta su forma escapada", (_name, payload) => {
    const render = (value: string): string => {
      const item = requirement({
        code: value,
        kindName: value,
        text: value,
        documentTitle: value,
        section: value,
        quote: value,
      });
      return renderBlocks(
        [
          { kind: "requirement", requirement: item },
          {
            kind: "development",
            content: [
              { type: "heading", text: value },
              { type: "paragraph", text: value },
              { type: "list", items: [value] },
            ],
            requirements: [item],
          },
        ],
        { pageHref: (page) => `/documents/abc/pages/${String(page)}` },
      ).text;
    };
    const escaped = payload
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
    expect(escaped).not.toMatch(/[<>"']/);
    expect(render(payload).replaceAll(escaped, "MARCADOR")).toBe(
      render("MARCADOR"),
    );
  });

  // Lectura independiente del resultado: se parte en etiquetas y texto. Toda
  // etiqueta debe ser, carácter a carácter, una de las que escribe el
  // renderizador; y el texto, una vez descodificado, debe contener la carga
  // íntegra en cada campo. Así una inyección no puede pasar por desaparecer:
  // quitar o alterar el texto hace fallar la prueba igual que no escaparlo.
  const ALLOWED_TAGS = new Set([
    '<section class="block norm">',
    '<section class="block development">',
    "</section>",
    '<p class="kind">',
    '<p class="hint">',
    "<p>",
    "</p>",
    '<span class="tag">',
    "</span>",
    "<strong>",
    "</strong>",
    "<blockquote>",
    "</blockquote>",
    "<h3>",
    "</h3>",
    "<ul>",
    '<ul class="hint">',
    "</ul>",
    "<li>",
    "</li>",
    "<br />",
    '<a href="/documents/abc/pages/3">',
    "</a>",
  ]);

  function decode(value: string): string {
    // Solo las cinco referencias que emite la plantilla; cualquier otra «&»
    // sería texto sin escapar.
    expect(value.replace(/&(?:amp|lt|gt|quot|#39);/g, "")).not.toContain("&");
    return value
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&amp;", "&");
  }

  // Texto visible del resultado, con cada `<br />` como salto de línea.
  function visibleText(html: string): string {
    let text = "";
    for (const token of html.split(/(<[^<>]*>)/)) {
      if (token.startsWith("<")) {
        expect(ALLOWED_TAGS, token).toContain(token);
        text += token === "<br />" ? "\n" : "\u0001";
      } else {
        // Fuera de una etiqueta no queda ningún delimitador de marcado.
        expect(token).not.toMatch(/[<>"']/);
        text += decode(token);
      }
    }
    return text;
  }

  test.each([
    ["etiqueta de script", `<script>alert(1)</script>`],
    ["cierre del contenedor", `</section></p><iframe src="//example.invalid">`],
    ["atributos", `" onmouseover="alert(1)" x='y' autofocus`],
    ["entidades ya escritas", `&lt;b&gt; &amp;amp; &#60;i&#62; &copy; &`],
    ["comentario y CDATA", `<!-- --><![CDATA[<svg onload=alert(1)>]]>`],
    ["etiqueta sin cerrar", `<svg/onload=alert(1)`],
    ["varias líneas", `uno <b>dos</b>\ntres & "cuatro"\n<br />`],
    ["otros alfabetos y símbolos", `ñ ü € 日本語 \u202e <x> 𝒳 ' \` =`],
  ])(
    "inyección por %s: la estructura es la del renderizador y el texto se conserva literal",
    (_name, payload) => {
      const render = (value: string): string => {
        const item = requirement({
          code: value,
          kindName: value,
          text: value,
          documentTitle: value,
          section: value,
          quote: value,
        });
        return renderBlocks(
          [
            { kind: "requirement", requirement: item },
            {
              kind: "development",
              content: [
                { type: "heading", text: value },
                { type: "paragraph", text: value },
                { type: "list", items: [value] },
              ],
              requirements: [item],
            },
          ],
          { pageHref: () => "/documents/abc/pages/3" },
        ).text;
      };
      const text = visibleText(render(payload));
      // Seis campos del requisito, tres del contenido y cuatro de la
      // referencia del desarrollo: la carga aparece entera en los trece.
      expect(text.split(payload)).toHaveLength(14);
      // Con las mismas etiquetas en los mismos sitios que un texto
      // inofensivo, y sin que falte ni sobre un solo carácter.
      expect(text.replaceAll(payload, "NEUTRO")).toBe(
        visibleText(render("NEUTRO")),
      );
    },
  );

  test.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:x",
    "//example.invalid/x",
    "/\\example.invalid/x",
    "\\\\example.invalid/x",
    "https://example.invalid/x",
    "",
  ])("una dirección que no es local no produce enlace: %j", (href) => {
    const html = text(
      renderBlock(
        { kind: "requirement", requirement: requirement() },
        { pageHref: () => href },
      ),
    );
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href");
    expect(html).toContain("Capacidades, página 3");
  });
});
