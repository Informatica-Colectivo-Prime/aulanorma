// Lectura del manifiesto con libxml2 (specs/002-boe-scorm-export: T064;
// research.md, R8; package-validation.md).
//
// Este fichero prueba el análisis sintáctico y su configuración: buena
// formación, espacios de nombres, referencias, recursos externos y
// liberación de recursos. Las reglas del formato se prueban en
// `tests/contract/scorm-package.contract.test.ts`.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { diag, ParseOption } from "libxml2-wasm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseXml } from "@/modules/content-export";
// La configuración del analizador es interna del módulo; la prueba la lee
// para comprobar qué opciones lleva.
import { PARSE_OPTIONS } from "../../../src/modules/content-export/xml";

function parsed(text: string | Uint8Array) {
  const result = parseXml(text);
  if (!result.ok) {
    throw new Error(`Debía leerse: ${result.problem}`);
  }
  return result;
}

function rejected(text: string | Uint8Array): string {
  const result = parseXml(text);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.problem;
}

describe("configuración del analizador", () => {
  test("sin recuperación, sin sustitución de entidades, sin DTD, sin XInclude y sin recursos externos", () => {
    const has = (option: ParseOption): boolean =>
      (PARSE_OPTIONS & option) !== 0;
    expect(has(ParseOption.XML_PARSE_NO_XXE)).toBe(true);
    expect(has(ParseOption.XML_PARSE_NONET)).toBe(true);
    expect(has(ParseOption.XML_PARSE_NO_SYS_CATALOG)).toBe(true);
    for (const forbidden of [
      ParseOption.XML_PARSE_RECOVER,
      ParseOption.XML_PARSE_NOENT,
      ParseOption.XML_PARSE_DTDLOAD,
      ParseOption.XML_PARSE_DTDATTR,
      ParseOption.XML_PARSE_DTDVALID,
      ParseOption.XML_PARSE_XINCLUDE,
      ParseOption.XML_PARSE_HUGE,
      ParseOption.XML_PARSE_NOERROR,
      ParseOption.XML_PARSE_NOWARNING,
      ParseOption.XML_PARSE_CATALOG_PI,
    ]) {
      expect(has(forbidden)).toBe(false);
    }
  });
});

// Los cinco errores de buena formación que el analizador anterior
// (`@xmldom/xmldom`) aceptaba sin avisar, y un sexto de la misma clase. Son
// la prueba decisiva del cambio: los rechaza la propia lectura.
describe("errores que el analizador anterior dejaba pasar", () => {
  test.each([
    ["«&» sin escapar", "<a>a & b</a>"],
    ["referencia a un carácter no admitido", "<a>&#0;</a>"],
    ["carácter de control", "<a>\u0001</a>"],
    ["«]]>» en el texto", "<a>]]></a>"],
    ["prefijo xml enlazado a otro espacio", '<a xmlns:xml="urn:x"/>'],
    [
      "atributo repetido con dos prefijos del mismo espacio",
      '<a xmlns:p="urn:p" xmlns:q="urn:p" p:b="1" q:b="2"/>',
    ],
  ])("rechaza: %s", (_name, text) => {
    expect(rejected(text)).not.toBe("");
  });
});

describe("XML mal formado", () => {
  test.each([
    ["documento vacío", ""],
    ["solo texto", "texto"],
    ["elemento sin cerrar", "<a><b></a>"],
    ["cierres cruzados", "<a><b></a></b>"],
    ["cierre con otras mayúsculas", "<a></A>"],
    ["dos elementos raíz", "<a/><b/>"],
    ["texto después de la raíz", "<a/>texto"],
    ["texto antes de la raíz", "texto<a/>"],
    ["nombre de elemento no válido", "<1a/>"],
    ["atributo repetido", '<a b="1" b="2"/>'],
    ["atributo sin comillas", "<a b=1/>"],
    ["atributo sin valor", "<a b/>"],
    ["«<» en un valor de atributo", '<a b="<"/>'],
    ["entidad no declarada", "<a>&nope;</a>"],
    ["carácter nulo", "<a>\u0000</a>"],
    ["carácter U+FFFF", "<a>￿</a>"],
    ["referencia a un sustituto suelto", "<a>&#xD800;</a>"],
    ["comentario con dos guiones dentro", "<a><!-- a -- b --></a>"],
    ["comentario sin cerrar", "<a><!-- x</a>"],
    ["sección CDATA sin cerrar", "<a><![CDATA[x</a>"],
    ["declaración XML después de la raíz", '<a/><?xml version="1.0"?>'],
    ["declaración XML tras un espacio", ' <?xml version="1.0"?><a/>'],
    ["codificación desconocida", '<?xml version="1.0" encoding="nope"?><a/>'],
    ["HTML que no es XML", "<html><br></html>"],
  ])("rechaza: %s", (_name, text) => {
    expect(rejected(text)).not.toBe("");
  });

  test("bytes que no son UTF-8 válido", () => {
    expect(
      rejected(
        Uint8Array.from([0x3c, 0x61, 0x3e, 0xff, 0xfe, 0x3c, 0x2f, 0x61, 0x3e]),
      ),
    ).not.toBe("");
  });

  test("un aviso del analizador también es un rechazo", () => {
    expect(rejected('<?xml version="1.1"?><a/>')).toMatch(/^aviso: /);
  });

  test("un anidamiento desmesurado se rechaza", () => {
    expect(rejected(`${"<a>".repeat(200)}${"</a>".repeat(200)}`)).not.toBe("");
  });
});

describe("espacios de nombres", () => {
  test.each([
    ["prefijo de elemento sin declarar", "<x:a/>"],
    ["prefijo de atributo sin declarar", '<a x:b="1"/>'],
    ["prefijo anulado", '<a xmlns:p=""><p:b/></a>'],
  ])("rechaza: %s", (_name, text) => {
    expect(rejected(text)).not.toBe("");
  });

  test("resuelve el espacio por defecto, los prefijos y su ámbito", () => {
    const { root } = parsed(
      '<a xmlns="urn:a" xmlns:p="urn:p"><b/><p:c><d xmlns="urn:d"><e/></d><f/></p:c></a>',
    );
    const [b, c] = root.children;
    expect([root.namespace, root.name]).toEqual(["urn:a", "a"]);
    expect([b?.namespace, b?.name]).toEqual(["urn:a", "b"]);
    expect([c?.namespace, c?.name]).toEqual(["urn:p", "c"]);
    // El espacio por defecto redefinido solo vale dentro de su elemento.
    expect(c?.children[0]?.namespace).toBe("urn:d");
    expect(c?.children[0]?.children[0]?.namespace).toBe("urn:d");
    expect(c?.children[1]?.namespace).toBe("urn:a");
  });

  test("el mismo espacio con otro prefijo es el mismo nombre", () => {
    const one = parsed('<p:a xmlns:p="urn:x" p:b="1"/>').root;
    const other = parsed('<q:a xmlns:q="urn:x" q:b="1"/>').root;
    expect(one).toEqual(other);
    expect(one.attributes.get("urn:x|b")).toBe("1");
  });

  test("un atributo sin prefijo no hereda el espacio por defecto", () => {
    const { root } = parsed('<a xmlns="urn:a" b="1" xml:lang="es"/>');
    // Las declaraciones de espacios de nombres no cuentan como atributos.
    expect([...root.attributes.keys()].sort()).toEqual([
      "http://www.w3.org/XML/1998/namespace|lang",
      "|b",
    ]);
  });

  test("sin espacio de nombres, queda vacío", () => {
    expect(parsed("<a/>").root.namespace).toBe("");
  });
});

describe("el texto válido se conserva íntegro", () => {
  test("descodifica las cinco referencias predefinidas y las numéricas", () => {
    const { root } = parsed(
      `<a b="&lt;&gt;&amp;&quot;&apos;" c='&#65;&#x42;&#x1F600;'>&lt;x&gt; &amp;amp; &#233;</a>`,
    );
    expect(root.attributes.get("|b")).toBe(`<>&"'`);
    expect(root.attributes.get("|c")).toBe("AB😀");
    // «&amp;amp;» es el texto «&amp;», no «&».
    expect(root.text).toBe("<x> &amp; é");
  });

  test("una sección CDATA es texto literal y se anota", () => {
    const result = parsed("<a>uno <![CDATA[<b>&amp;</b>]]> dos</a>");
    expect(result.root.text).toBe("uno <b>&amp;</b> dos");
    expect(result.features.cdata).toBe(true);
    expect(result.root.children).toEqual([]);
  });

  test("el texto de un elemento no incluye el de sus hijos", () => {
    const { root } = parsed("<a>uno<b>dos</b>tres</a>");
    expect(root.text).toBe("unotres");
    expect(root.children[0]?.text).toBe("dos");
  });

  test.each([
    `ñ € 日本語 𝒳 ‮`,
    `  espacios   y\tsaltos\nde línea  `,
    `comillas " ' y signos = / ? # % ; :`,
    `]] > y -- y <! sueltos, escapados`,
  ])("ida y vuelta de %j", (value) => {
    const escaped = value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const { root } = parsed(
      `<a xmlns:p="urn:p" p:b="${escaped}">${escaped}</a>`,
    );
    expect(root.text).toBe(value);
    // En un atributo, XML normaliza tabuladores y saltos de línea a espacios.
    expect(root.attributes.get("urn:p|b")).toBe(value.replace(/[\t\n]/g, " "));
  });

  test("admite la marca de orden de bytes y la codificación declarada", () => {
    expect(parsed("﻿<a>ñ</a>").root.text).toBe("ñ");
    expect(
      parsed(
        Uint8Array.from([
          ...new TextEncoder().encode(
            '<?xml version="1.0" encoding="ISO-8859-1"?><a>',
          ),
          0xf1,
          ...new TextEncoder().encode("</a>"),
        ]),
      ).root.text,
    ).toBe("ñ");
  });
});

describe("construcciones bien formadas que se anotan para las reglas del formato", () => {
  test("instrucciones de procesamiento y comentarios, dentro y fuera de la raíz", () => {
    expect(parsed("<a><?php echo 1 ?></a>").features).toMatchObject({
      processingInstructions: true,
    });
    expect(parsed("<?estilo x?><a/>").features).toMatchObject({
      processingInstructions: true,
    });
    expect(parsed("<a/><?estilo x?>").features).toMatchObject({
      processingInstructions: true,
    });
    expect(parsed("<!-- c --><a/>").features).toMatchObject({ comments: true });
    expect(parsed("<a><!-- d --></a>").features).toMatchObject({
      comments: true,
    });
    expect(
      parsed('<?xml version="1.0" encoding="UTF-8"?><a/>').features,
    ).toEqual({ processingInstructions: false, cdata: false, comments: false });
  });
});

describe("recursos externos y DTD", () => {
  let directory = "";
  let secret = "";
  const MARK = "CONTENIDO-QUE-NO-DEBE-LEERSE";

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), "aulanorma-xml-"));
    writeFileSync(path.join(directory, "secreto.txt"), MARK);
    secret = pathToFileURL(path.join(directory, "secreto.txt")).href;
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  test.each([
    [
      "entidad externa general",
      (url: string) => `<!DOCTYPE a [<!ENTITY x SYSTEM "${url}">]><a>&x;</a>`,
    ],
    [
      "entidad externa de parámetro",
      (url: string) => `<!DOCTYPE a [<!ENTITY % p SYSTEM "${url}"> %p;]><a/>`,
    ],
    ["DTD externa", (url: string) => `<!DOCTYPE a SYSTEM "${url}"><a/>`],
    ["entidad interna", () => `<!DOCTYPE a [<!ENTITY x "boom">]><a>&x;</a>`],
    [
      "entidades internas encadenadas",
      () =>
        `<!DOCTYPE a [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]><a>&c;</a>`,
    ],
    ["DOCTYPE vacío", () => `<!DOCTYPE a><a/>`],
  ])(
    "un documento con %s no se lee, y no se abre ningún fichero",
    (_name, build) => {
      const result = parseXml(build(secret));
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(MARK);
      expect(JSON.stringify(result)).not.toContain("boom");
    },
  );

  test("XInclude no se procesa: el elemento queda como está", () => {
    const result = parsed(
      `<a xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="${secret}" parse="text"/></a>`,
    );
    expect(JSON.stringify(result)).not.toContain(MARK);
    expect(result.root.children[0]).toMatchObject({
      namespace: "http://www.w3.org/2001/XInclude",
      name: "include",
      text: "",
    });
  });
});

describe("liberación de recursos", () => {
  test("no queda ningún documento sin liberar, tampoco cuando la lectura falla", () => {
    diag.configure({ enabled: true });
    try {
      const inputs = [
        "<a><b>x</b></a>",
        "<a>a & b</a>",
        "<a><b></a>",
        "",
        '<?xml version="1.1"?><a/>',
        "<!DOCTYPE a><a/>",
        `${"<a>".repeat(200)}${"</a>".repeat(200)}`,
        "<a><?pi x?></a>",
      ];
      for (let round = 0; round < 50; round += 1) {
        for (const input of inputs) {
          parseXml(input);
        }
      }
      expect(diag.report()).toEqual({});
    } finally {
      diag.configure({ enabled: false });
    }
  });
});
