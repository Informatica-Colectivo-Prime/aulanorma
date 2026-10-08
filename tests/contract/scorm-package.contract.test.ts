// Contrato del paquete SCORM 1.2 (specs/002-boe-scorm-export: T063 a T065;
// FR-032 a FR-037 y FR-048; SC-012, SC-014 y SC-015; research.md, R8;
// contracts/scorm-package.md).
//
// Comprueba el generador y las reglas de conformidad que se aplican al
// releer el ZIP: paquetes incorrectos hechos a mano que deben rechazarse y
// un paquete de referencia, escrito a mano y con otra estructura, que debe
// aceptarse.
//
// PENDIENTE: la validación del manifiesto contra los XSD oficiales no se
// prueba aquí, porque todavía no se ejecuta
// (specs/002-boe-scorm-export/scorm-schemas.md). Nada de este fichero
// acredita la conformidad con esos esquemas ni la importación en Moodle.
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
  SCHEMA_VALIDATION,
  TRIAL_NOTICE,
} from "@/modules/content-export";
import type { PackageSource } from "@/modules/content-export";
import { PACKAGE_ASSETS } from "../support/export-fixture.ts";

const REFERENCE = fileURLToPath(
  new URL("../fixtures/scorm/reference/", import.meta.url),
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

  test("supera la comprobación al releerlo, que dice que los esquemas no se han validado", () => {
    const result = checkPackage(built(), DELIVERY);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.schema).toBe(SCHEMA_VALIDATION);
    expect(result.schema.status).toBe("not_run");
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
      /no es XML admitido/,
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

describe("paquete de referencia, ajeno al generador", () => {
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

describe("lector de XML", () => {
  test.each([
    ["instrucción de procesamiento", "<a><?php echo 1 ?></a>"],
    ["entidad propia", "<a>&propia;</a>"],
    ["prefijo sin declarar", "<x:a/>"],
    ["atributo repetido", '<a b="1" b="2"/>'],
    ["atributo sin comillas", "<a b=1/>"],
    ["cierre cruzado", "<a><b></a></b>"],
    ["dos raíces", "<a/><b/>"],
    ["texto fuera de la raíz", "<a/>texto"],
    ["vacío", ""],
  ])("rechaza: %s", (_name, text) => {
    expect(parseXml(text).ok).toBe(false);
  });

  test("resuelve espacios de nombres, referencias y CDATA", () => {
    const parsed = parseXml(
      `<?xml version="1.0"?><!-- c --><p:a xmlns:p="urn:p" p:b="1 &amp; 2" c='&#65;&#x42;'><p:d><![CDATA[<x>]]> &lt;y&gt;</p:d></p:a>\n`,
    );
    if (!parsed.ok) {
      throw new Error(parsed.problem);
    }
    expect(parsed.root.namespace).toBe("urn:p");
    expect(parsed.root.attributes.get("urn:p|b")).toBe("1 & 2");
    expect(parsed.root.attributes.get("|c")).toBe("AB");
    expect(parsed.root.children[0]?.text).toBe("<x> <y>");
  });
});
