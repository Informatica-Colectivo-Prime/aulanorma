// Política sobre la estructura de un PDF (specs/002-boe-scorm-export: FR-002 y
// SC-042; research.md, R4; feasibility.md, 2.6). Código propio, sin
// importaciones y con sintaxis TypeScript borrable: lo carga directamente
// Node.js en un proceso hijo.
//
// Se aplica a la salida JSON versión 2 de qpdf, que entrega cada objeto ya
// interpretado: nombres sin escapes, referencias como `"7 0 R"`, objetos de
// los flujos de objetos y el estado vigente tras las actualizaciones
// incrementales. No lee los bytes del fichero.
//
// Es una lista finita de construcciones rechazadas, más dos reglas de
// admisión cerradas (formularios y acciones). Que un documento la supere no
// acredita que sea seguro, y admitir un campo de firma no comprueba la firma.

export type StructureCategory =
  | "javascript"
  | "xfa"
  | "automatic_action"
  | "launch"
  | "embedded_file"
  | "rich_media"
  | "action"
  | "form"
  | "encrypted"
  | "unverifiable";

export interface StructureVerdict {
  readonly accepted: boolean;
  readonly categories: readonly StructureCategory[];
  readonly signatureField: boolean;
  readonly pageCount: number;
  readonly objectCount: number;
}

type Json = unknown;
type Dictionary = Readonly<Record<string, Json>>;

const REFERENCE = /^\d+ \d+ R$/;
const MAX_REFERENCE_DEPTH = 20;

const PROHIBITED_KEYS: Readonly<Record<string, StructureCategory>> = {
  "/JS": "javascript",
  "/JavaScript": "javascript",
  "/AA": "automatic_action",
  "/OpenAction": "automatic_action",
  "/EmbeddedFiles": "embedded_file",
  "/EF": "embedded_file",
  "/XFA": "xfa",
  "/RichMedia": "rich_media",
};

const PROHIBITED_ACTIONS: Readonly<Record<string, StructureCategory>> = {
  "/JavaScript": "javascript",
  "/Launch": "launch",
  "/SubmitForm": "action",
  "/ImportData": "action",
  "/GoToR": "action",
  "/GoToE": "action",
  "/Rendition": "action",
  "/Movie": "action",
  "/Sound": "action",
  "/Hide": "action",
  "/SetOCGState": "action",
  "/Trans": "action",
  "/GoTo3DView": "action",
  "/ResetForm": "action",
  "/Named": "action",
};

// Únicas acciones admitidas en una anotación: un salto dentro del documento y
// un enlace.
const ALLOWED_ACTIONS: readonly string[] = ["/GoTo", "/URI"];

function isDictionary(value: Json): value is Dictionary {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unverifiable(pageCount = 0): StructureVerdict {
  return {
    accepted: false,
    categories: ["unverifiable"],
    signatureField: false,
    pageCount,
    objectCount: 0,
  };
}

// Evalúa el documento JSON de qpdf, pedido con las claves `qpdf` y `pages`.
export function evaluateStructure(document: Json): StructureVerdict {
  if (!isDictionary(document)) {
    return unverifiable();
  }
  const pages = document.pages;
  const qpdf = document.qpdf;
  if (!Array.isArray(pages) || !Array.isArray(qpdf)) {
    return unverifiable();
  }
  const header: Json = qpdf[0];
  const objects: Json = qpdf[1];
  if (
    !isDictionary(header) ||
    header.jsonversion !== 2 ||
    !isDictionary(objects)
  ) {
    return unverifiable(pages.length);
  }
  const table: Dictionary = objects;

  const categories = new Set<StructureCategory>();
  const reject = (category: StructureCategory): void => {
    categories.add(category);
  };

  // Contenido de un objeto: su valor o, si es un flujo, su diccionario.
  const contentOf = (object: Json): Json => {
    if (!isDictionary(object)) {
      return undefined;
    }
    if ("value" in object) {
      return object.value;
    }
    const stream = object.stream;
    return isDictionary(stream) ? stream.dict : undefined;
  };

  // Sigue las referencias indirectas hasta un valor. Una referencia que no
  // se puede resolver, o una cadena demasiado larga, rechaza el documento.
  const resolve = (value: Json, depth = 0): Json => {
    if (typeof value !== "string" || !REFERENCE.test(value)) {
      return value;
    }
    if (depth > MAX_REFERENCE_DEPTH) {
      reject("unverifiable");
      return undefined;
    }
    const object = table[`obj:${value}`];
    if (object === undefined) {
      reject("unverifiable");
      return undefined;
    }
    return resolve(contentOf(object), depth + 1);
  };

  const trailer = contentOf(table.trailer);
  const catalog = isDictionary(trailer) ? resolve(trailer["/Root"]) : undefined;
  if (!isDictionary(trailer) || !isDictionary(catalog)) {
    return unverifiable(pages.length);
  }
  if (trailer["/Encrypt"] !== undefined) {
    reject("encrypted");
  }

  // Elementos del árbol de estructura de un PDF etiquetado. En ellos `/A` son
  // atributos, no acciones: se distinguen recorriendo el árbol desde el
  // catálogo, no por su aspecto.
  const structureElements = new Set<Json>();
  {
    const stack: Json[] = [catalog["/StructTreeRoot"]];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const item = stack.pop();
      if (typeof item === "string" && REFERENCE.test(item)) {
        if (seen.has(item)) {
          continue;
        }
        seen.add(item);
      }
      const element = resolve(item);
      if (Array.isArray(element)) {
        stack.push(...(element as Json[]));
      } else if (isDictionary(element)) {
        structureElements.add(element);
        if (element["/K"] !== undefined) {
          stack.push(element["/K"]);
        }
      }
    }
  }

  const walk = (value: Json): void => {
    if (Array.isArray(value)) {
      for (const item of value as Json[]) {
        walk(item);
      }
      return;
    }
    if (!isDictionary(value)) {
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      const prohibited = PROHIBITED_KEYS[key];
      if (prohibited !== undefined) {
        reject(prohibited);
      }
      if (key === "/S") {
        const type = resolve(item);
        const action =
          typeof type === "string" ? PROHIBITED_ACTIONS[type] : undefined;
        if (action !== undefined) {
          reject(action);
        }
      }
      if (key === "/Type" && resolve(item) === "/EmbeddedFile") {
        reject("embedded_file");
      }
      if (key === "/A" && !structureElements.has(value)) {
        const action = resolve(item);
        const type = isDictionary(action) ? resolve(action["/S"]) : undefined;
        if (typeof type !== "string" || !ALLOWED_ACTIONS.includes(type)) {
          reject("action");
        }
      }
      walk(item);
    }
  };

  let objectCount = 0;
  for (const [name, object] of Object.entries(table)) {
    if (name !== "trailer") {
      objectCount += 1;
    }
    walk(contentOf(object));
  }

  // Formularios: solo se admite uno cuyos campos sean todos de firma y sin
  // acciones.
  let signatureField = false;
  const form = resolve(catalog["/AcroForm"]);
  if (form !== undefined) {
    const visited = new Set<string>();
    const checkField = (reference: Json, inheritedType: Json): void => {
      if (typeof reference === "string") {
        if (visited.has(reference)) {
          reject("form");
          return;
        }
        visited.add(reference);
      }
      const field = resolve(reference);
      if (!isDictionary(field)) {
        reject("form");
        return;
      }
      const type = resolve(field["/FT"]) ?? inheritedType;
      if ("/A" in field || "/AA" in field) {
        reject("form");
      }
      const kids = resolve(field["/Kids"]);
      if (Array.isArray(kids) && kids.length > 0) {
        for (const kid of kids as Json[]) {
          checkField(kid, type);
        }
      } else if (type === "/Sig") {
        signatureField = true;
      } else {
        reject("form");
      }
    };
    const fields = isDictionary(form) ? resolve(form["/Fields"]) : undefined;
    if (Array.isArray(fields)) {
      for (const field of fields as Json[]) {
        checkField(field, undefined);
      }
    } else {
      reject("form");
    }
  }

  return {
    accepted: categories.size === 0,
    categories: [...categories].sort(),
    signatureField: categories.size === 0 && signatureField,
    pageCount: pages.length,
    objectCount,
  };
}
