// Generador de los PDF sintéticos de prueba (specs/002-boe-scorm-export,
// tarea T007; research.md, R4). Node.js sin dependencias.
//
//   node scripts/fixtures/make-pdf-fixtures.mjs [directorio] [--heavy-mb=N]
//
// Escribe en `tests/fixtures/pdf/synthetic` (o en el directorio indicado) un
// PDF por cada caso de la comprobación de viabilidad. Los ficheros son
// deterministas: no contienen fechas, identificadores aleatorios ni datos
// reales. El contenido "activo" es inerte: el JavaScript es un comentario y la
// acción de lanzamiento nombra un fichero que no existe. La firma digital es
// sintética y no es válida.
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
 * Como `serialize`, pero en PDF 1.5: los objetos indicados van dentro de un
 * flujo de objetos comprimido y la tabla es un flujo de referencias cruzadas.
 * Sus diccionarios no aparecen como texto en el fichero.
 *
 * @param {PdfObject[]} objects
 * @param {number[]} compressed Números de los objetos sin flujo que se comprimen.
 * @returns {Buffer}
 */
function serializeWithObjectStream(objects, compressed) {
  const streamNumber = objects.length + 1;
  const xrefNumber = objects.length + 2;
  const bodies = compressed.map(
    (number) => `${objects[number - 1]?.dictionary ?? "null"}\n`,
  );
  /** @type {string[]} */
  const index = [];
  let bodyOffset = 0;
  compressed.forEach((number, position) => {
    index.push(`${number} ${bodyOffset}`);
    bodyOffset += Buffer.byteLength(bodies[position] ?? "", "latin1");
  });
  const head = `${index.join(" ")}\n`;
  const packed = deflateSync(Buffer.from(head + bodies.join(""), "latin1"), {
    level: 9,
  });
  /** @type {Buffer[]} */
  const chunks = [Buffer.from("%PDF-1.5\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  /** @type {Map<number, number>} */
  const offsets = new Map();
  let length = chunks[0]?.length ?? 0;
  /**
   * @param {number} number
   * @param {PdfObject} object
   */
  const write = (number, object) => {
    offsets.set(number, length);
    const start = `${number} 0 obj\n${object.dictionary}\n`;
    const parts =
      object.stream === undefined
        ? [Buffer.from(`${start}endobj\n`, "latin1")]
        : [
            Buffer.from(`${start}stream\n`, "latin1"),
            object.stream,
            Buffer.from("\nendstream\nendobj\n", "latin1"),
          ];
    for (const part of parts) {
      chunks.push(part);
      length += part.length;
    }
  };
  objects.forEach((object, position) => {
    if (!compressed.includes(position + 1)) {
      write(position + 1, object);
    }
  });
  write(streamNumber, {
    dictionary:
      `<< /Type /ObjStm /N ${compressed.length} ` +
      `/First ${Buffer.byteLength(head, "latin1")} ` +
      `/Filter /FlateDecode /Length ${packed.length} >>`,
    stream: packed,
  });
  const xrefOffset = length;
  const size = xrefNumber + 1;
  const table = Buffer.alloc(size * 7);
  for (let number = 0; number < size; number += 1) {
    const base = number * 7;
    const position = compressed.indexOf(number);
    if (number === 0) {
      table.writeUInt8(0, base);
      table.writeUInt16BE(65535, base + 5);
    } else if (position >= 0) {
      table.writeUInt8(2, base);
      table.writeUInt32BE(streamNumber, base + 1);
      table.writeUInt16BE(position, base + 5);
    } else {
      table.writeUInt8(1, base);
      table.writeUInt32BE(
        number === xrefNumber ? xrefOffset : (offsets.get(number) ?? 0),
        base + 1,
      );
    }
  }
  write(xrefNumber, {
    dictionary:
      `<< /Type /XRef /Size ${size} /W [1 4 2] /Root 1 0 R ` +
      `/Length ${table.length} >>`,
    stream: table,
  });
  chunks.push(Buffer.from(`startxref\n${xrefOffset}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}

/**
 * Añade una actualización incremental: objetos nuevos o redefinidos, y
 * objetos liberados, sin tocar los bytes anteriores.
 *
 * @param {Buffer} base
 * @param {{ number: number, dictionary: string }[]} updates
 * @param {number[]} [freed]
 * @returns {Buffer}
 */
function appendUpdate(base, updates, freed = []) {
  const text = base.toString("latin1");
  const previous = /startxref\n(\d+)\n%%EOF\n$/.exec(text);
  const sizeMatch = /\/Size (\d+)/.exec(text);
  if (previous === null || sizeMatch === null) {
    throw new Error("El documento base no termina en una tabla clásica.");
  }
  let size = Number(sizeMatch[1]);
  /** @type {string[]} */
  const bodies = [];
  /** @type {string[]} */
  const sections = [];
  let length = base.length;
  for (const { number, dictionary } of updates) {
    const body = `${number} 0 obj\n${dictionary}\nendobj\n`;
    sections.push(
      `${number} 1\n${String(length).padStart(10, "0")} 00000 n \n`,
    );
    bodies.push(body);
    length += Buffer.byteLength(body, "latin1");
    size = Math.max(size, number + 1);
  }
  for (const number of freed) {
    sections.push(`${number} 1\n0000000000 00001 f \n`);
  }
  return Buffer.concat([
    base,
    Buffer.from(
      `${bodies.join("")}xref\n${sections.join("")}` +
        `trailer\n<< /Size ${size} /Root 1 0 R /Prev ${previous[1]} >>\n` +
        `startxref\n${length}\n%%EOF\n`,
      "latin1",
    ),
  ]);
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
 *   compressed?: number[],
 * }} options
 * @returns {Buffer}
 */
function document({
  pages,
  catalogExtra = "",
  pageExtra = "",
  extraObjects = [],
  trailerExtra = "",
  compressed,
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
  return compressed === undefined
    ? serialize(objects, trailerExtra)
    : serializeWithObjectStream(objects, compressed);
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

/**
 * Documento con un campo de firma digital pasivo, como el de los boletines
 * oficiales: formulario con un único campo de firma. La firma es sintética y
 * no es válida.
 *
 * @param {string} widgetExtra Claves añadidas al campo, por ejemplo una acción.
 * @returns {Buffer}
 */
function signedDocument(widgetExtra) {
  const widget = nextObject(1);
  return document({
    pages: ["text"],
    catalogExtra: `/AcroForm << /Fields [${widget} 0 R] /SigFlags 3 >> `,
    pageExtra: `/Annots [${widget} 0 R] `,
    extraObjects: [
      {
        dictionary:
          "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) " +
          `/Rect [0 0 0 0] /F 132 /P 5 0 R /V ${widget + 1} 0 R ${widgetExtra}>>`,
      },
      {
        dictionary:
          "<< /Type /Sig /Filter /Adobe.PPKLite " +
          "/SubFilter /adbe.pkcs7.detached /ByteRange [0 0 0 0] " +
          `/Contents <${"00".repeat(16)}> >>`,
      },
    ],
  });
}

/** @returns {Buffer} */
function documentWithOpenAction() {
  return document({
    pages: ["text"],
    catalogExtra: `/OpenAction ${nextObject(1)} 0 R `,
    extraObjects: [{ dictionary: `<< /S /JavaScript /JS ${INERT_SCRIPT} >>` }],
  });
}

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
  "open-action-launch-escaped-name.pdf": () =>
    document({
      pages: ["text"],
      catalogExtra: `/OpenAction ${nextObject(1)} 0 R `,
      extraObjects: [
        { dictionary: "<< /S /L#61unch /F (synthetic-missing-file) >>" },
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
  "signature-field.pdf": () => signedDocument(""),
  "signature-field-with-action.pdf": () =>
    signedDocument(`/AA << /Fo << /S /JavaScript /JS ${INERT_SCRIPT} >> >> `),
  "signature-field-updated-open-action.pdf": () =>
    appendUpdate(signedDocument(""), [
      {
        number: 1,
        dictionary:
          "<< /Type /Catalog /Pages 2 0 R " +
          `/AcroForm << /Fields [${nextObject(1)} 0 R] /SigFlags 3 >> ` +
          `/OpenAction ${nextObject(1) + 2} 0 R >>`,
      },
      {
        number: nextObject(1) + 2,
        dictionary: "<< /S /Launch /F (synthetic-missing-file) >>",
      },
    ]),
  "form-text-field.pdf": () => {
    const field = nextObject(1);
    return document({
      pages: ["text"],
      catalogExtra: `/AcroForm << /Fields [${field} 0 R] >> `,
      pageExtra: `/Annots [${field} 0 R] `,
      extraObjects: [
        {
          dictionary:
            "<< /Type /Annot /Subtype /Widget /FT /Tx /T (Field1) " +
            "/Rect [72 600 300 620] /P 5 0 R >>",
        },
      ],
    });
  },
  "object-streams-allowed.pdf": () =>
    document({ pages: ["text", "text"], compressed: [2, 3] }),
  "object-streams-launch.pdf": () =>
    document({
      pages: ["text"],
      catalogExtra: `/OpenAction ${nextObject(1)} 0 R `,
      extraObjects: [
        { dictionary: "<< /S /Launch /F (synthetic-missing-file) >>" },
      ],
      compressed: [1, nextObject(1)],
    }),
  "indirect-action-type.pdf": () => {
    const first = nextObject(1);
    return document({
      pages: ["text"],
      catalogExtra: `/OpenAction ${first} 0 R `,
      extraObjects: [
        {
          dictionary: `<< /S ${first + 1} 0 R /F (synthetic-missing-file) >>`,
        },
        { dictionary: "/Launch" },
      ],
      compressed: [1, first, first + 1],
    });
  },
  "indirect-allowed.pdf": () => {
    const first = nextObject(1);
    return document({
      pages: ["text"],
      catalogExtra: `/Lang ${first} 0 R /PageLayout ${first + 1} 0 R `,
      extraObjects: [{ dictionary: "(en)" }, { dictionary: "/SinglePage" }],
      compressed: [first, first + 1],
    });
  },
  "incremental-allowed.pdf": () =>
    appendUpdate(document({ pages: ["text"] }), [
      {
        number: 1,
        dictionary: "<< /Type /Catalog /Pages 2 0 R /Lang (en) >>",
      },
    ]),
  "incremental-open-action.pdf": () =>
    appendUpdate(document({ pages: ["text"] }), [
      {
        number: 1,
        dictionary: `<< /Type /Catalog /Pages 2 0 R /OpenAction ${nextObject(1)} 0 R >>`,
      },
      {
        number: nextObject(1),
        dictionary: "<< /S /Launch /F (synthetic-missing-file) >>",
      },
    ]),
  "incremental-removed-action.pdf": () =>
    appendUpdate(documentWithOpenAction(), [
      { number: 1, dictionary: "<< /Type /Catalog /Pages 2 0 R >>" },
    ]),
  "incremental-freed-action.pdf": () =>
    appendUpdate(
      documentWithOpenAction(),
      [{ number: 1, dictionary: "<< /Type /Catalog /Pages 2 0 R >>" }],
      [nextObject(1)],
    ),
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
