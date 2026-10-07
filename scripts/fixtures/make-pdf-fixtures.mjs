// Generador de los PDF sintéticos de prueba (specs/002-boe-scorm-export,
// tarea T007; research.md, R4). Node.js sin dependencias.
//
//   node scripts/fixtures/make-pdf-fixtures.mjs [directorio] [--heavy-mb=N]
//
// Escribe en `tests/fixtures/pdf/synthetic` (o en el directorio indicado) un
// PDF por cada caso de la comprobación de viabilidad. Los ficheros son
// deterministas: no contienen fechas, identificadores aleatorios ni datos
// reales. El contenido "activo" es inerte: el JavaScript es un comentario y la
// acción de lanzamiento nombra un fichero que no existe.
//
// `--heavy-mb=N` añade `heavy-stream.pdf`, cuya página se descomprime a N MiB.
// Sirve para probar los límites de tiempo y de memoria; no se guarda en el
// repositorio.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const DEFAULT_DIRECTORY = path.join(repoRoot, "tests/fixtures/pdf/synthetic");

/** @typedef {{ dictionary: string, stream?: Buffer }} PdfObject */

/**
 * Serializa los objetos (numerados desde 1) con su tabla de referencias.
 *
 * @param {PdfObject[]} objects
 * @param {string} [trailerExtra]
 * @returns {Buffer}
 */
function serialize(objects, trailerExtra = "") {
  /** @type {Buffer[]} */
  const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  /** @type {number[]} */
  const offsets = [];
  let length = chunks[0]?.length ?? 0;
  objects.forEach((object, index) => {
    offsets.push(length);
    const head = `${index + 1} 0 obj\n${object.dictionary}\n`;
    const parts =
      object.stream === undefined
        ? [Buffer.from(`${head}endobj\n`, "latin1")]
        : [
            Buffer.from(`${head}stream\n`, "latin1"),
            object.stream,
            Buffer.from("\nendstream\nendobj\n", "latin1"),
          ];
    for (const part of parts) {
      chunks.push(part);
      length += part.length;
    }
  });
  const size = objects.length + 1;
  const entries = offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  chunks.push(
    Buffer.from(
      `xref\n0 ${size}\n0000000000 65535 f \n${entries}` +
        `trailer\n<< /Size ${size} /Root 1 0 R ${trailerExtra}>>\n` +
        `startxref\n${length}\n%%EOF\n`,
      "latin1",
    ),
  );
  return Buffer.concat(chunks);
}

/**
 * @param {Buffer} content
 * @param {string} [extra]
 * @returns {PdfObject}
 */
function stream(content, extra = "") {
  return {
    dictionary: `<< /Length ${content.length} ${extra}>>`,
    stream: content,
  };
}

/**
 * @param {number} page
 * @returns {Buffer}
 */
function textContent(page) {
  return Buffer.from(
    `BT /F1 12 Tf 72 720 Td (Synthetic fixture, page ${page}.) Tj ` +
      "0 -18 Td (This text is extractable.) Tj ET",
    "latin1",
  );
}

const IMAGE_CONTENT = Buffer.from(
  "q 200 0 0 200 72 500 cm /Im1 Do Q",
  "latin1",
);

/**
 * Documento de varias páginas. Objetos: 1 catálogo, 2 páginas, 3 fuente,
 * 4 imagen; después, una página y su contenido por cada elemento.
 *
 * @param {{
 *   pages: ("text" | "image" | "blank" | Buffer)[],
 *   catalogExtra?: string,
 *   pageExtra?: string,
 *   extraObjects?: PdfObject[],
 *   trailerExtra?: string,
 * }} options
 * @returns {Buffer}
 */
function document({
  pages,
  catalogExtra = "",
  pageExtra = "",
  extraObjects = [],
  trailerExtra = "",
}) {
  const firstPageObject = 5;
  const kids = pages
    .map((_, index) => `${firstPageObject + index * 2} 0 R`)
    .join(" ");
  /** @type {PdfObject[]} */
  const objects = [
    { dictionary: `<< /Type /Catalog /Pages 2 0 R ${catalogExtra}>>` },
    { dictionary: `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>` },
    {
      dictionary:
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica " +
        "/Encoding /WinAnsiEncoding >>",
    },
    stream(
      Buffer.from([0x80]),
      "/Type /XObject /Subtype /Image /Width 1 /Height 1 " +
        "/ColorSpace /DeviceGray /BitsPerComponent 8 ",
    ),
  ];
  pages.forEach((kind, index) => {
    const contentObject = firstPageObject + index * 2 + 1;
    objects.push({
      dictionary:
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
        "/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >> " +
        `/Contents ${contentObject} 0 R ${pageExtra}>>`,
    });
    if (Buffer.isBuffer(kind)) {
      objects.push(stream(kind, "/Filter /FlateDecode "));
    } else if (kind === "text") {
      objects.push(stream(textContent(index + 1)));
    } else if (kind === "image") {
      objects.push(stream(IMAGE_CONTENT));
    } else {
      objects.push(stream(Buffer.alloc(0)));
    }
  });
  objects.push(...extraObjects);
  return serialize(objects, trailerExtra);
}

/**
 * Número del primer objeto libre tras las páginas.
 *
 * @param {number} pageCount
 * @returns {number}
 */
function nextObject(pageCount) {
  return 5 + pageCount * 2;
}

const INERT_SCRIPT = "(// synthetic fixture: inert)";
const HEX_32 = "00".repeat(32);

/** @type {Record<string, () => Buffer>} */
const FIXTURES = {
  "text-two-pages.pdf": () => document({ pages: ["text", "text"] }),
  "five-pages.pdf": () =>
    document({ pages: ["text", "text", "text", "text", "text"] }),
  "image-only-page.pdf": () => document({ pages: ["text", "image"] }),
  "blank-page.pdf": () => document({ pages: ["text", "blank"] }),
  "encrypted.pdf": () =>
    document({
      pages: ["text"],
      extraObjects: [
        {
          dictionary:
            `<< /Filter /Standard /V 1 /R 2 /O <${HEX_32}> ` +
            `/U <${HEX_32}> /P -44 >>`,
        },
      ],
      trailerExtra:
        `/Encrypt ${nextObject(1)} 0 R ` +
        "/ID [<00112233445566778899aabbccddeeff> " +
        "<00112233445566778899aabbccddeeff>] ",
    }),
  "truncated.pdf": () => {
    const whole = document({ pages: ["text", "text"] });
    return whole.subarray(0, Math.floor(whole.length * 0.6));
  },
  "javascript.pdf": () =>
    document({
      pages: ["text"],
      catalogExtra: `/Names << /JavaScript << /Names [(a) ${nextObject(1)} 0 R] >> >> `,
      extraObjects: [
        { dictionary: `<< /S /JavaScript /JS ${INERT_SCRIPT} >>` },
      ],
    }),
  "open-action-javascript.pdf": () =>
    document({
      pages: ["text"],
      catalogExtra: `/OpenAction ${nextObject(1)} 0 R `,
      extraObjects: [
        { dictionary: `<< /S /JavaScript /JS ${INERT_SCRIPT} >>` },
      ],
    }),
  "open-action-launch.pdf": () =>
    document({
      pages: ["text"],
      catalogExtra: `/OpenAction ${nextObject(1)} 0 R `,
      extraObjects: [
        { dictionary: "<< /S /Launch /F (synthetic-missing-file) >>" },
      ],
    }),
  "page-additional-action.pdf": () =>
    document({
      pages: ["text"],
      pageExtra: `/AA << /O ${nextObject(1)} 0 R >> `,
      extraObjects: [
        { dictionary: `<< /S /JavaScript /JS ${INERT_SCRIPT} >>` },
      ],
    }),
  "embedded-file.pdf": () => {
    const first = nextObject(1);
    return document({
      pages: ["text"],
      catalogExtra: `/Names << /EmbeddedFiles << /Names [(note.txt) ${first} 0 R] >> >> `,
      extraObjects: [
        {
          dictionary:
            "<< /Type /Filespec /F (note.txt) " +
            `/EF << /F ${first + 1} 0 R >> >>`,
        },
        stream(Buffer.from("synthetic attachment\n"), "/Type /EmbeddedFile "),
      ],
    });
  },
  "xfa-form.pdf": () => {
    const first = nextObject(1);
    return document({
      pages: ["text"],
      catalogExtra: `/AcroForm << /Fields [] /XFA ${first} 0 R >> `,
      extraObjects: [
        stream(
          Buffer.from(
            '<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"></xdp:xdp>',
          ),
        ),
      ],
    });
  },
  "not-a-pdf.pdf": () => Buffer.from("This file is not a PDF document.\n"),
};

/**
 * @param {number} megabytes
 * @returns {Buffer}
 */
function heavyDocument(megabytes) {
  const line = Buffer.from("BT /F1 12 Tf 72 720 Td (x) Tj ET\n", "latin1");
  const repeats = Math.ceil((megabytes * 1024 * 1024) / line.length);
  const content = Buffer.alloc(repeats * line.length);
  for (let index = 0; index < repeats; index += 1) {
    line.copy(content, index * line.length);
  }
  return document({ pages: [deflateSync(content, { level: 9 })] });
}

/**
 * @param {string[]} argv
 * @returns {{ directory: string, heavyMegabytes: number | undefined }}
 */
function parseArguments(argv) {
  let directory = DEFAULT_DIRECTORY;
  /** @type {number | undefined} */
  let heavyMegabytes;
  for (const argument of argv) {
    const heavy = /^--heavy-mb=(\d+)$/.exec(argument);
    if (heavy !== null) {
      heavyMegabytes = Number(heavy[1]);
    } else if (argument.startsWith("--")) {
      throw new Error(`Opción desconocida: ${argument}`);
    } else {
      directory = path.resolve(argument);
    }
  }
  return { directory, heavyMegabytes };
}

const { directory, heavyMegabytes } = parseArguments(process.argv.slice(2));
mkdirSync(directory, { recursive: true });
for (const [name, build] of Object.entries(FIXTURES)) {
  writeFileSync(path.join(directory, name), build());
}
if (heavyMegabytes !== undefined) {
  writeFileSync(
    path.join(directory, "heavy-stream.pdf"),
    heavyDocument(heavyMegabytes),
  );
}
process.stdout.write(
  `${Object.keys(FIXTURES).length + (heavyMegabytes === undefined ? 0 : 1)} ` +
    "PDF sintéticos generados.\n",
);
