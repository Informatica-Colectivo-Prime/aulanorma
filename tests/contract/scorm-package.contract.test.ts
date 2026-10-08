// Contrato del paquete SCORM 1.2 (specs/002-boe-scorm-export: T063 a T065;
// FR-032 a FR-037 y FR-048; SC-012, SC-014 y SC-015; research.md, R8;
// contracts/scorm-package.md).
//
// Comprueba el generador y las reglas de conformidad que se aplican al
// releer el ZIP: paquetes incorrectos hechos a mano que deben rechazarse; un
// fixture interno, escrito a mano con otra estructura; y el manifiesto
// SCORM 1.2 de un tercero (Adapt, GPL-3.0), copiado sin modificar, que debe
// aceptarse. Este último es una plantilla, no un paquete publicado completo:
// su procedencia y sus límites están en
// `tests/fixtures/scorm/third-party/adapt-contrib-spoor/PROVENANCE.md`.
//
// La validación contra los XSD de SCORM 1.2 no forma parte de la estrategia
// (research.md, R8; package-validation.md). Nada de este fichero equivale a
// esa validación, ni acredita conformidad completa con SCORM, ni la
// importación en Moodle. El análisis sintáctico se prueba en
// `tests/unit/content-export/xml.test.ts`.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import {
  buildManifest,
  buildPackage,
  checkPackage,
  escapeXml,
  MAX_TOPICS,
  packageDocument,
  parseXml,
  VALIDATION_STRATEGY,
  TRIAL_NOTICE,
} from "@/modules/content-export";
import type { PackageSource } from "@/modules/content-export";
import { PACKAGE_ASSETS } from "../support/export-fixture.ts";

const REFERENCE = fileURLToPath(
  new URL("../fixtures/scorm/reference/", import.meta.url),
);
const THIRD_PARTY = fileURLToPath(
  new URL(
    "../fixtures/scorm/third-party/adapt-contrib-spoor/",
    import.meta.url,
  ),
);
const VERSION = "c".repeat(32);
const HOSTILE = `<script>alert("x")</script> & </title><item identifier='x'>`;

function source(overrides: Partial<PackageSource> = {}): PackageSource {
  return {
    versionId: VERSION,
    label: "v1",
    documentTitle: "Documento sintético",
    kindNames: { capacity: "Capacidad" },
    trial: false,
    snapshot: {
      format: 1,
      unit: { code: "UX9001", title: "Unidad sintética" },
      topics: [
        {
          title: "Primer tema",
          blocks: [
            {
              kind: "requirement",
              content: [],
              requirements: [
                {
                  id: "r".repeat(32),
                  kind: "capacity",
                  code: "C1",
                  text: "Describir el ejemplo. Véase https://example.invalid/norma.",
                  section: "Capacidades",
                  pageFrom: 3,
                  pageTo: 4,
                  quote: "C1: Describir el ejemplo.",
                },
              ],
            },
            {
              kind: "development",
              content: [
                { type: "heading", text: "Desarrollo" },
                { type: "paragraph", text: "Texto del desarrollo." },
              ],
              requirements: [],
            },
          ],
        },
        { title: "Segundo tema", blocks: [] },
      ],
    },
    ...overrides,
  };
}

function built(overrides: Partial<PackageSource> = {}): Uint8Array {
  const result = buildPackage(source(overrides), PACKAGE_ASSETS);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.built.zip;
}

const DELIVERY = {
  delivery: true,
  manifestIdentifier: `aulanorma-${VERSION}`,
  versionId: VERSION,
} as const;

// El paquete generado con algunos ficheros sustituidos, añadidos o quitados.
function tampered(
  changes: Readonly<Record<string, string | null>>,
  base: Uint8Array = built(),
): Uint8Array {
  const files: Record<string, Uint8Array> = { ...unzipSync(base) };
  for (const [name, content] of Object.entries(changes)) {
    if (content === null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- nombre de fichero de la prueba
      delete files[name];
    } else {
      files[name] = strToU8(content);
    }
  }
  return zipSync(files);
}

function manifest(change: (text: string) => string): Uint8Array {
  return tampered({ "imsmanifest.xml": change(buildManifest(source())) });
}

function problems(zip: Uint8Array, expectation = DELIVERY): string {
  const result = checkPackage(zip, expectation);
  expect(result.ok).toBe(result.problems.length === 0);
  return result.problems.join("\n");
}

describe("paquete generado", () => {
  test("lleva el manifiesto en la raíz y exactamente los ficheros previstos, en orden fijo", () => {
    expect(Object.keys(unzipSync(built()))).toEqual([
      "imsmanifest.xml",
      "index.html",
      "assets/app.js",
      "assets/style.css",
    ]);
  });

  test("supera la comprobación al releerlo, que no incluye los XSD ni sustituye a Moodle", () => {
    const result = checkPackage(built(), DELIVERY);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.strategy).toBe(VALIDATION_STRATEGY);
    expect(result.strategy).toEqual({
      id: "profile-v1",
      parser: "@xmldom/xmldom",
      xsd: "not_part_of_strategy",
      moodle: "pending_manual_verification",
    });
  });

  test("el manifiesto declara un único SCO de SCORM 1.2 e identifica la versión", () => {
    const parsed = parseXml(buildManifest(source()));
    if (!parsed.ok) {
      throw new Error(parsed.problem);
    }
    expect(parsed.root.attributes.get("|identifier")).toBe(
      `aulanorma-${VERSION}`,
    );
    const text = buildManifest(source());
    expect(text).toContain("<schema>ADL SCORM</schema>");
    expect(text).toContain("<schemaversion>1.2</schemaversion>");
    expect(text.match(/<item /g)).toHaveLength(1);
    expect(text.match(/adlcp:scormtype="sco"/g)).toHaveLength(1);
    expect(text).toContain(`identificador ${VERSION}`);
    expect(text).not.toMatch(/masteryscore|schemaLocation/);
  });

  test("dos exportaciones de la misma versión son idénticas (SC-014)", () => {
    const first = buildPackage(source(), PACKAGE_ASSETS);
    const second = buildPackage(source(), PACKAGE_ASSETS);
    if (!first.ok || !second.ok) {
      throw new Error("Los dos paquetes debían generarse.");
    }
    expect(first.built.sha256).toBe(second.built.sha256);
    expect(Buffer.from(first.built.zip).equals(second.built.zip)).toBe(true);
    expect(first.built.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Otra versión, otro paquete.
    const other = buildPackage(
      source({ versionId: "d".repeat(32) }),
      PACKAGE_ASSETS,
    );
    expect(other.ok && other.built.sha256).not.toBe(first.built.sha256);
  });

  test("el documento conserva la distinción entre norma y desarrollo, con su procedencia", () => {
    const html = packageDocument(source());
    expect(html).toContain("Requisito extraído del BOE");
    expect(html).toContain("Desarrollo didáctico generado");
    expect(html).toContain(
      "Documento sintético, Capacidades, página 3 a página 4",
    );
    expect(html).toContain("Tema 1. Primer tema");
    expect(html).toContain(`<code>${VERSION}</code>`);
    expect(html).toContain('<html lang="es">');
    // Jerarquía de encabezados: título, temas y contenido.
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html.indexOf("<h2>Tema 1.")).toBeLessThan(html.indexOf("<h3>"));
  });

  test("no carga nada de fuera: una dirección en el texto de la norma no es una petición (SC-012)", () => {
    const html = packageDocument(source());
    expect(html).toContain("https://example.invalid/norma");
    expect(html).not.toMatch(/<a [^>]*href="(?!#)/);
    expect(problems(built())).toBe("");
    const tags = [...html.matchAll(/<(link|script|img|iframe|a)\b[^>]*>/g)].map(
      (match) => match[0],
    );
    expect(
      tags.filter((tag) => !/(?:href|src)="(?:#|assets\/)/.test(tag)),
    ).toEqual([]);
  });

  test("no contiene datos de usuarios ni secretos (SC-015)", () => {
    const zip = built();
    const all = Object.values(unzipSync(zip))
      .map((file) => strFromU8(file))
      .join("\n");
    expect(all).not.toMatch(
      /aprobad[oa] por|exportad[oa] por|csrf|cookie|password|contraseña/i,
    );
    expect(
      problems(zip, { ...DELIVERY, forbidden: ["docente-1"] } as never),
    ).toBe("");
    const leaked = tampered({
      "index.html": packageDocument(source()).replace(
        "</header>",
        "<p>docente-1</p></header>",
      ),
    });
    expect(
      problems(leaked, { ...DELIVERY, forbidden: ["docente-1"] } as never),
    ).toMatch(/dato de usuario/);
  });

  test("el texto hostil sale escapado en el documento y en el manifiesto", () => {
    const hostile = source();
    const snapshot = {
      ...hostile.snapshot,
      unit: { code: "UX", title: HOSTILE },
      topics: [{ title: HOSTILE, blocks: [] }],
    };
    const html = packageDocument({ ...hostile, snapshot });
    expect(html).not.toMatch(/<script>alert|<item/);
    expect(html.match(/<script /g)).toHaveLength(1);
    const xml = buildManifest({ ...hostile, snapshot });
    const parsed = parseXml(xml);
    expect(parsed.ok).toBe(true);
    expect(xml.match(/<item /g)).toHaveLength(1);
    expect(problems(built({ snapshot }))).toBe("");
    expect(escapeXml("a\u0000b\u000bc<&>\"'")).toBe(
      "abc&lt;&amp;&gt;&quot;&apos;",
    );
  });

  test("el analizador ajeno lee en el manifiesto exactamente el título que se escribió", () => {
    const awkward = `Seguridad & salud <1> "comillas" 'simples' ñ € 日本語 ]]> &amp;`;
    const base = source();
    const snapshot = { ...base.snapshot, unit: { code: "UX", title: awkward } };
    const parsed = parseXml(buildManifest({ ...base, snapshot }));
    if (!parsed.ok) {
      throw new Error(parsed.problem);
    }
    const organization = parsed.root.children
      .find((item) => item.name === "organizations")
      ?.children.find((item) => item.name === "organization");
    expect(
      organization?.children.find((item) => item.name === "title")?.text,
    ).toBe(`UX ${awkward}`);
    expect(problems(built({ snapshot }))).toBe("");
  });

  test("un paquete de ensayo lo dice de forma visible", () => {
    expect(packageDocument(source({ trial: true }))).toContain(TRIAL_NOTICE);
    expect(packageDocument(source())).not.toContain("ensayo");
  });

  test("rechaza más de 200 temas (FR-048)", () => {
    const topics = Array.from({ length: MAX_TOPICS + 1 }, (_item, index) => ({
      title: `Tema ${String(index)}`,
      blocks: [],
    }));
    const base = source();
    expect(
      buildPackage(
        { ...base, snapshot: { ...base.snapshot, topics } },
        PACKAGE_ASSETS,
      ),
    ).toEqual({ ok: false, reason: "too_many_topics" });
    expect(
      buildPackage(
        {
          ...base,
          snapshot: { ...base.snapshot, topics: topics.slice(0, MAX_TOPICS) },
        },
        PACKAGE_ASSETS,
      ).ok,
    ).toBe(true);
  });
});

describe("paquetes incorrectos, hechos a mano", () => {
  test.each([
    ["no es un ZIP", strToU8("esto no es un zip"), /no es un ZIP legible/],
    [
      "sin manifiesto",
      tampered({ "imsmanifest.xml": null }),
      /Falta imsmanifest/,
    ],
    [
      "manifiesto en un subdirectorio",
      tampered({
        "imsmanifest.xml": null,
        "paquete/imsmanifest.xml": buildManifest(source()),
      }),
      /Falta imsmanifest/,
    ],
    [
      "XML mal formado",
      manifest((text) => text.replace("</organizations>", "")),
      /no es XML admitido/,
    ],
    [
      "DOCTYPE con entidad",
      manifest((text) =>
        text.replace(
          "<manifest",
          '<!DOCTYPE manifest [<!ENTITY x SYSTEM "file:///etc/passwd">]>\n<manifest',
        ),
      ),
      /DOCTYPE/,
    ],
    [
      "otro elemento raíz",
      manifest((text) =>
        text.replace(/xmlns="[^"]*"/, 'xmlns="urn:otro:formato"'),
      ),
      /no es un manifiesto/,
    ],
    [
      "otra versión de SCORM",
      manifest((text) =>
        text.replace("<schemaversion>1.2", "<schemaversion>2004 4th Edition"),
      ),
      /ADL SCORM, versión 1.2/,
    ],
    [
      "sin organización",
      manifest((text) =>
        text.replace(/<organization [\s\S]*<\/organization>/, ""),
      ),
      /ninguna organización/,
    ],
    [
      "organización por defecto inexistente",
      manifest((text) =>
        text.replace('default="organizacion"', 'default="otra"'),
      ),
      /organización por defecto no existe/,
    ],
    [
      "ítem que remite a un recurso inexistente",
      manifest((text) =>
        text.replace('identifierref="contenido"', 'identifierref="nada"'),
      ),
      /recurso que no existe/,
    ],
    [
      "recurso sin tipo SCORM",
      manifest((text) => text.replace(' adlcp:scormtype="sco"', "")),
      /no declara su tipo SCORM/,
    ],
    [
      "tipo SCORM en otro espacio de nombres",
      manifest((text) =>
        text.replace(
          'xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"',
          'xmlns:adlcp="urn:otro"',
        ),
      ),
      /no declara su tipo SCORM/,
    ],
    [
      "recurso lanzable sin dirección de inicio",
      manifest((text) => text.replace(' href="index.html">', ">")),
      /no tiene dirección de inicio/,
    ],
    [
      "fichero declarado que no está",
      manifest((text) =>
        text.replace(
          '<file href="index.html"/>',
          '<file href="index.html"/><file href="falta.html"/>',
        ),
      ),
      /declara un fichero que no está/,
    ],
    [
      "fichero sin declarar",
      tampered({ "extra.html": "<p>extra</p>" }),
      /fichero que el manifiesto no declara/,
    ],
    [
      "dirección de inicio externa",
      manifest((text) =>
        text.replace(
          'href="index.html">',
          'href="https://example.invalid/index.html">',
        ),
      ),
      /Dirección no admitida/,
    ],
    [
      "ruta que sale del paquete",
      manifest((text) =>
        text.replace(
          '<file href="index.html"/>',
          '<file href="index.html"/><file href="../fuera.html"/>',
        ),
      ),
      /Dirección no admitida/,
    ],
    [
      "entrada con ruta que sale del paquete",
      zipSync({ ...unzipSync(built()), "../fuera.txt": strToU8("x") }),
      /Nombre de entrada no admitido/,
    ],
    [
      "identificadores repetidos",
      manifest((text) =>
        text.replace('identifier="temario"', 'identifier="contenido"'),
      ),
      /identificadores repetidos/,
    ],
    [
      "identificador de otra versión",
      manifest((text) =>
        text.replace(`aulanorma-${VERSION}`, `aulanorma-${"e".repeat(32)}`),
      ),
      /no es el de la versión/,
    ],
    [
      "título que no identifica la versión",
      manifest((text) =>
        text.replace(`identificador ${VERSION}`, "sin identificar"),
      ),
      /no identifica la versión/,
    ],
    [
      "puntuación de dominio",
      manifest((text) =>
        text.replace(
          "</item>",
          "<adlcp:masteryscore>80</adlcp:masteryscore></item>",
        ),
      ),
      /puntuación o límites/,
    ],
    [
      "dos ítems",
      manifest((text) =>
        text.replace(
          "</organization>",
          '<item identifier="otro" identifierref="contenido"><title>Otro</title></item></organization>',
        ),
      ),
      /único SCO/,
    ],
    [
      "DOCTYPE sin entidades",
      manifest((text) =>
        text.replace("<manifest", "<!DOCTYPE manifest>\n<manifest"),
      ),
      /DOCTYPE/,
    ],
    [
      "instrucción de procesamiento",
      manifest((text) =>
        text.replace("<metadata>", "<?php echo 1 ?><metadata>"),
      ),
      /instrucciones de procesamiento/,
    ],
    [
      "codificación declarada que no es UTF-8",
      manifest((text) =>
        text.replace('encoding="UTF-8"', 'encoding="ISO-8859-1"'),
      ),
      /codificación distinta de UTF-8/,
    ],
    [
      "«&» sin escapar en un título",
      manifest((text) => text.replace("<title>", "<title>Seguridad & salud ")),
      /«&»/,
    ],
    [
      "referencia numérica, que el generador no escribe",
      manifest((text) => text.replace("<title>", "<title>&#60;b&#62; ")),
      /«&»/,
    ],
    [
      "entidad propia",
      manifest((text) => text.replace("<title>", "<title>&propia; ")),
      /no es XML admitido/,
    ],
    [
      "carácter de control",
      manifest((text) => text.replace("<title>", "<title>\u0001")),
      /caracteres que XML 1.0 no admite/,
    ],
    [
      "sección CDATA",
      manifest((text) => text.replace("<title>", "<title><![CDATA[<b>]]>")),
      /comentarios o secciones CDATA/,
    ],
    [
      "comentario",
      manifest((text) => text.replace("<metadata>", "<!-- nota --><metadata>")),
      /comentarios o secciones CDATA/,
    ],
    [
      "atributo repetido con dos prefijos del mismo espacio de nombres",
      manifest((text) =>
        text.replace(
          ' adlcp:scormtype="sco"',
          ' xmlns:otro="http://www.adlnet.org/xsd/adlcp_rootv1p2" adlcp:scormtype="sco" otro:scormtype="asset"',
        ),
      ),
      /exactamente los dos espacios de nombres/,
    ],
    [
      "tipo SCORM sin prefijo",
      manifest((text) =>
        text.replace(' adlcp:scormtype="sco"', ' scormtype="sco"'),
      ),
      /no declara su tipo SCORM/,
    ],
    [
      "tipo SCORM en mayúsculas",
      manifest((text) => text.replace('scormtype="sco"', 'scormtype="SCO"')),
      /no declara su tipo SCORM/,
    ],
    [
      "organizaciones en otro espacio de nombres",
      manifest((text) =>
        text
          .replace("<organizations ", '<o:organizations xmlns:o="urn:otro" ')
          .replace("</organizations>", "</o:organizations>"),
      ),
      /ninguna organización/,
    ],
    [
      "sin espacio de nombres por defecto",
      manifest((text) => text.replace(/\s+xmlns="[^"]*"/, "")),
      /no es un manifiesto/,
    ],
    [
      "ítem que remite a otro ítem",
      manifest((text) =>
        text.replace('identifierref="contenido"', 'identifierref="temario"'),
      ),
      /recurso que no existe/,
    ],
    [
      "dependencia de un recurso inexistente",
      manifest((text) =>
        text.replace(
          "</resource>",
          '<dependency identifierref="nada"/></resource>',
        ),
      ),
      /depende de otro que no existe/,
    ],
    [
      "fichero declarado sin dirección",
      manifest((text) =>
        text.replace(
          '<file href="index.html"/>',
          '<file href="index.html"/><file/>',
        ),
      ),
      /no tiene dirección/,
    ],
    [
      "xml:base en los recursos",
      manifest((text) =>
        text.replace("<resources>", '<resources xml:base="assets/">'),
      ),
      /xml:base/,
    ],
    [
      "ruta absoluta",
      manifest((text) =>
        text.replace(
          '<file href="index.html"/>',
          '<file href="index.html"/><file href="/index.html"/>',
        ),
      ),
      /Dirección no admitida/,
    ],
    [
      "ruta con barra invertida",
      manifest((text) =>
        text.replace(
          '<file href="assets/app.js"/>',
          '<file href="assets\\app.js"/>',
        ),
      ),
      /Dirección no admitida/,
    ],
    [
      "ruta que sale del paquete con codificación de URL",
      manifest((text) =>
        text.replace(
          '<file href="index.html"/>',
          '<file href="index.html"/><file href="%2e%2e/fuera.html"/>',
        ),
      ),
      /Dirección no admitida/,
    ],
    [
      "ruta con codificación de URL mal formada",
      manifest((text) =>
        text.replace(
          '<file href="index.html"/>',
          '<file href="index.html"/><file href="%zz.html"/>',
        ),
      ),
      /Dirección no admitida/,
    ],
    [
      "esquema file:",
      manifest((text) =>
        text.replace('href="index.html">', 'href="file:///etc/passwd">'),
      ),
      /Dirección no admitida/,
    ],
    [
      "fichero declarado con otras mayúsculas",
      manifest((text) =>
        text.replace('<file href="index.html"/>', '<file href="Index.html"/>'),
      ),
      /declara un fichero que no está/,
    ],
    [
      "dirección de inicio que no figura entre los ficheros del recurso",
      manifest((text) => text.replace('<file href="index.html"/>', "")),
      /no figura entre sus ficheros/,
    ],
    [
      "script externo en el documento",
      tampered({
        "index.html": packageDocument(source()).replace(
          "</body>",
          '<script src="https://example.invalid/t.js"></script></body>',
        ),
      }),
      /dirección externa en "index.html"/,
    ],
    [
      "imagen de seguimiento sin esquema",
      tampered({
        "index.html": packageDocument(source()).replace(
          "</body>",
          '<img src="//example.invalid/p.gif" alt=""></body>',
        ),
      }),
      /dirección externa en "index.html"/,
    ],
    [
      "fuente externa en el estilo",
      tampered({
        "assets/style.css": `${PACKAGE_ASSETS.style}\n@font-face{font-family:x;src:url(f.woff)}`,
      }),
      /dirección externa en "assets\/style.css"/,
    ],
    [
      "petición de red en el script",
      tampered({
        "assets/app.js": `${PACKAGE_ASSETS.script}\nfetch("/seguimiento");`,
      }),
      /dirección externa en "assets\/app.js"/,
    ],
  ] as const)("rechaza: %s", (_name, zip, expected) => {
    const result = checkPackage(zip, DELIVERY);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(expected);
  });
});

describe("fixture interno, escrito a mano con otra estructura", () => {
  function reference(): Uint8Array {
    const files: Record<string, Uint8Array> = {};
    const walk = (directory: string): void => {
      for (const entry of readdirSync(path.join(REFERENCE, directory), {
        withFileTypes: true,
      })) {
        const name = path.posix.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(name);
        } else {
          files[name] = readFileSync(path.join(REFERENCE, name));
        }
      }
    };
    walk("");
    return zipSync(files);
  }

  test("supera las reglas del formato aunque su estructura sea otra", () => {
    const result = checkPackage(reference(), { delivery: false });
    expect(result.problems).toEqual([]);
    expect(result.files).toEqual([
      "content/anexo.html",
      "content/comun.js",
      "content/leccion.html",
      "imsmanifest.xml",
    ]);
  });

  test("no cumple las reglas de entrega de AulaNorma, que son más estrictas", () => {
    expect(problems(reference(), { delivery: true } as never)).toMatch(
      /único SCO/,
    );
  });

  test("también se rechaza si le falta un fichero declarado", () => {
    const files = { ...unzipSync(reference()) };
    delete files["content/anexo.html"];
    expect(problems(zipSync(files), { delivery: false } as never)).toMatch(
      /declara un fichero que no está/,
    );
  });
});

describe("manifiesto de un tercero, sin modificar", () => {
  test("los ficheros de terceros son solo fixtures: el producto no los referencia ni los empaqueta", () => {
    const sources = readdirSync(
      fileURLToPath(new URL("../../src/", import.meta.url)),
      { recursive: true, withFileTypes: true },
    )
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name));
    expect(sources.length).toBeGreaterThan(50);
    for (const file of sources) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /tests\/fixtures|third-party|adapt-contrib|index_lms/,
      );
    }
    // Y un paquete exportado lleva exactamente sus cuatro ficheros.
    expect(Object.keys(unzipSync(built())).sort()).toEqual([
      "assets/app.js",
      "assets/style.css",
      "imsmanifest.xml",
      "index.html",
    ]);
  });

  const read = (name: string): Buffer =>
    readFileSync(path.join(THIRD_PARTY, name));
  const pack = (): Uint8Array =>
    zipSync({
      "imsmanifest.xml": read("imsmanifest.xml"),
      "index_lms.html": read("index_lms.html"),
    });

  test("los ficheros son copias literales de su origen", () => {
    const sha256 = (name: string): string =>
      createHash("sha256").update(read(name)).digest("hex");
    expect({
      manifest: sha256("imsmanifest.xml"),
      launch: sha256("index_lms.html"),
      license: sha256("LICENSE"),
    }).toEqual({
      manifest:
        "e3619b8d67830f6d50c91e23cb73a0008c8a20b8b2bc487a2ae20513e4029bc0",
      launch:
        "10f4aa7b32721dab6342488d625c255b26851f3e7623241cf78e1faa602e6471",
      license:
        "e3df1185c1c835be365f40eda566c0be7701eb8ea8ecaece6861297e28d916ca",
    });
    // Su procedencia y su licencia los acompañan.
    expect(read("PROVENANCE.md").toString()).toContain(
      "2d8737c2982ee4617c862e7c21e44c31bbd4e7dd",
    );
    expect(read("LICENSE").toString()).toContain("GNU GENERAL PUBLIC LICENSE");
  });

  test("supera las reglas del formato, con metadatos LOM, CDATA y xsi:schemaLocation", () => {
    const result = checkPackage(pack(), { delivery: false });
    expect(result.problems).toEqual([]);
    expect(result.files).toEqual(["imsmanifest.xml", "index_lms.html"]);
    const parsed = parseXml(read("imsmanifest.xml").toString());
    if (!parsed.ok) {
      throw new Error(parsed.problem);
    }
    // Lo leído coincide con lo que el fichero dice, no con lo que AulaNorma
    // genera.
    expect(parsed.root.attributes.get("|identifier")).toBe(
      "@@config._spoor._advancedSettings._manifestIdentifier",
    );
    const lom = parsed.root.children[0]?.children.find(
      (item) => item.name === "lom",
    );
    expect(lom?.namespace).toBe(
      "http://www.imsglobal.org/xsd/imsmd_rootv1p2p1",
    );
    expect(
      lom?.children[0]?.children[0]?.children[0]?.attributes.get(
        "http://www.w3.org/XML/1998/namespace|lang",
      ),
    ).toBe("x-none");
  });

  test("no cumple las reglas de entrega de AulaNorma, y se dice por qué", () => {
    // No lleva la versión de AulaNorma y su página carga recursos propios.
    const text = problems(pack(), DELIVERY);
    expect(text).toMatch(/no es el de la versión/);
    expect(text).toMatch(/no identifica la versión/);
  });

  test("también se rechaza si le falta su página de inicio", () => {
    expect(
      problems(zipSync({ "imsmanifest.xml": read("imsmanifest.xml") }), {
        delivery: false,
      } as never),
    ).toMatch(/declara un fichero que no está/);
  });
});
