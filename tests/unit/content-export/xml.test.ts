// Lectura del manifiesto con un analizador ajeno al generador
// (specs/002-boe-scorm-export: T064; research.md, R8; package-validation.md).
//
// Este fichero prueba el análisis sintáctico y la adaptación de su resultado:
// buena formación, espacios de nombres y referencias. Las reglas del formato
// se prueban en `tests/contract/scorm-package.contract.test.ts`.
//
// `@xmldom/xmldom` es tolerante. Aquí queda escrito, caso a caso, qué rechaza
// y qué deja pasar, para que un cambio de versión que lo altere se note.
import { describe, expect, test } from "vitest";
import { parseXml } from "@/modules/content-export";

function parsed(text: string) {
  const result = parseXml(text);
  if (!result.ok) {
    throw new Error(`Debía leerse: ${result.problem}`);
  }
  return result;
}

describe("XML mal formado que el analizador rechaza", () => {
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
    [
      "entidad declarada en un DOCTYPE",
      '<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>',
    ],
    ["comentario con dos guiones dentro", "<a><!-- a -- b --></a>"],
    ["comentario sin cerrar", "<a><!-- x</a>"],
    ["sección CDATA sin cerrar", "<a><![CDATA[x</a>"],
    ["declaración XML después de la raíz", '<a/><?xml version="1.0"?>'],
    ["declaración XML tras un espacio", ' <?xml version="1.0"?><a/>'],
    ["HTML que no es XML", "<html><br></html>"],
  ])("%s", (_name, text) => {
    const result = parseXml(text);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.problem).not.toBe("");
  });

  test("un anidamiento desmesurado se rechaza sin agotar la pila", () => {
    const deep = `${"<a>".repeat(200)}${"</a>".repeat(200)}`;
    expect(parseXml(deep)).toEqual({
      ok: false,
      problem: "demasiados niveles de anidamiento",
    });
  });
});

describe("espacios de nombres", () => {
  test.each([
    ["prefijo de elemento sin declarar", "<x:a/>"],
    ["prefijo de atributo sin declarar", '<a x:b="1"/>'],
    ["prefijo anulado", '<a xmlns:p=""><p:b/></a>'],
  ])("rechaza: %s", (_name, text) => {
    expect(parseXml(text).ok).toBe(false);
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
    expect([...root.attributes.keys()].sort()).toEqual([
      "http://www.w3.org/XML/1998/namespace|lang",
      "|b",
    ]);
    // Las declaraciones de espacios de nombres no cuentan como atributos.
    expect(root.attributes.size).toBe(2);
  });

  test("sin espacio de nombres, queda vacío", () => {
    expect(parsed("<a/>").root.namespace).toBe("");
  });
});

describe("referencias y texto", () => {
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

  test("conserva el texto que no es ASCII y admite la marca de orden de bytes", () => {
    expect(parsed("﻿<a>ñ € 日本語</a>").root.text).toBe("ñ € 日本語");
  });
});

describe("construcciones que se anotan para las reglas del formato", () => {
  test("DOCTYPE, instrucciones de procesamiento y comentarios", () => {
    expect(
      parsed('<!DOCTYPE a SYSTEM "file:///etc/passwd"><a/>').features,
    ).toMatchObject({ doctype: true });
    expect(parsed("<a><?php echo 1 ?></a>").features).toMatchObject({
      processingInstructions: true,
    });
    expect(parsed("<?estilo x?><a/>").features).toMatchObject({
      processingInstructions: true,
    });
    expect(parsed("<!-- c --><a><!-- d --></a>").features).toMatchObject({
      comments: true,
    });
    expect(
      parsed('<?xml version="1.0" encoding="UTF-8"?><a/>').features,
    ).toEqual({
      doctype: false,
      processingInstructions: false,
      cdata: false,
      comments: false,
    });
  });

  test("un DOCTYPE externo no se resuelve: no se lee ningún fichero", () => {
    const result = parsed('<!DOCTYPE a SYSTEM "file:///etc/passwd"><a>x</a>');
    expect(result.root.text).toBe("x");
  });
});

// Errores de buena formación que este analizador NO diagnostica. Están aquí
// para que consten y para detectar un cambio de comportamiento. Los que
// afectan al manifiesto que escribe AulaNorma los rechazan las reglas
// léxicas de su perfil, que se prueban en el contrato del paquete; para un
// manifiesto ajeno, quedan fuera de lo que esta comprobación detecta.
describe("tolerancias conocidas del analizador", () => {
  test.each([
    ["«&» sin escapar", "<a>a & b</a>"],
    ["referencia a un carácter no admitido", "<a>&#0;</a>"],
    ["carácter de control", "<a>\u0001</a>"],
    ["«]]>» en el texto", "<a>]]></a>"],
    ["prefijo xml enlazado a otro espacio", '<a xmlns:xml="urn:x"/>'],
    [
      "un atributo repetido con dos prefijos del mismo espacio",
      '<a xmlns:p="urn:p" xmlns:q="urn:p" p:b="1" q:b="2"/>',
    ],
  ])("deja pasar: %s", (_name, text) => {
    expect(parseXml(text).ok).toBe(true);
  });
});
