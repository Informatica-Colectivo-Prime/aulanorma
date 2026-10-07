// Proceso hijo de la extracción: obtiene con `pdfjs-dist` el texto de cada
// página y cuenta sus operaciones de imagen, y lo escribe como JSON por la
// salida estándar.
//
//   node --permission --allow-fs-read=… extract-child.ts <documento.pdf>
//
// Solo extrae texto: no decide nada sobre la estructura del documento. Se
// ejecuta con el entorno vacío y solo puede leer su código, sus dependencias
// y el documento. No carga fuentes del sistema y no procesa formularios XFA.
// Cualquier fallo termina con un código distinto de cero y quien lo lanza
// rechaza el documento.
import { readFileSync } from "node:fs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const [file] = process.argv.slice(2);
if (file === undefined) {
  process.exit(2);
}

const IMAGE_OPERATIONS: readonly number[] = [
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
  OPS.paintImageXObjectRepeat,
];

const document = await getDocument({
  data: new Uint8Array(readFileSync(file)),
  disableFontFace: true,
  useSystemFonts: false,
  enableXfa: false,
  stopAtErrors: true,
  verbosity: 0,
}).promise;

const pages: { number: number; text: string; imageOperations: number }[] = [];
for (let number = 1; number <= document.numPages; number += 1) {
  const page = await document.getPage(number);
  const content = await page.getTextContent();
  let text = "";
  for (const item of content.items) {
    if ("str" in item) {
      text += item.str + (item.hasEOL ? "\n" : " ");
    }
  }
  const operations = await page.getOperatorList();
  pages.push({
    number,
    text: text.trimEnd(),
    imageOperations: operations.fnArray.filter((operation) =>
      IMAGE_OPERATIONS.includes(operation),
    ).length,
  });
  page.cleanup();
}
process.stdout.write(JSON.stringify({ pages }));
