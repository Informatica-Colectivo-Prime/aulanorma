// Lectura del manifiesto de un paquete (specs/002-boe-scorm-export: T064;
// research.md, R8).
//
// El análisis sintáctico lo hace `@xmldom/xmldom`, un analizador mantenido y
// ajeno al generador: aquí no se interpreta XML a mano. Este fichero solo
// adapta su resultado a una estructura mínima, con los espacios de nombres
// resueltos, y anota qué construcciones contiene el documento. No decide
// nada sobre SCORM: las reglas del formato están en `conformance.ts`.
//
// Criterio de aceptación sintáctica: el documento se rechaza si el analizador
// emite cualquier diagnóstico, también los que él considera avisos o errores
// recuperables. `@xmldom/xmldom` es tolerante y hay errores de buena
// formación que no diagnostica; los que importan al paquete que exporta
// AulaNorma se cubren con reglas léxicas del perfil, en `conformance.ts`, y
// el resto queda documentado como límite en
// specs/002-boe-scorm-export/package-validation.md.
import { DOMParser } from "@xmldom/xmldom";

export interface XmlElement {
  // Espacio de nombres resuelto, o cadena vacía.
  readonly namespace: string;
  readonly name: string;
  // Atributos por «espacio de nombres resuelto|nombre local».
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  // Texto propio del elemento, con las secciones CDATA incluidas.
  readonly text: string;
}

// Construcciones presentes en el documento, para que las reglas decidan.
export interface XmlFeatures {
  readonly doctype: boolean;
  readonly processingInstructions: boolean;
  readonly cdata: boolean;
  readonly comments: boolean;
}

export type XmlResult =
  | {
      readonly ok: true;
      readonly root: XmlElement;
      readonly features: XmlFeatures;
    }
  | { readonly ok: false; readonly problem: string };

const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const MAX_DEPTH = 64;

// Tipos de nodo del DOM.
const ELEMENT = 1;
const TEXT = 3;
const CDATA = 4;
const PROCESSING_INSTRUCTION = 7;
const COMMENT = 8;
const DOCTYPE = 10;

interface DomNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly nodeValue: string | null;
  readonly childNodes: ArrayLike<DomNode>;
}

interface DomAttribute {
  readonly namespaceURI: string | null;
  readonly localName: string | null;
  readonly name: string;
  readonly value: string;
}

interface DomElement extends DomNode {
  readonly namespaceURI: string | null;
  readonly localName: string | null;
  readonly attributes: ArrayLike<DomAttribute>;
}

class TooDeep extends Error {}

export function parseXml(source: string): XmlResult {
  const diagnostics: string[] = [];
  let document: DomNode & { readonly documentElement: DomElement | null };
  try {
    document = new DOMParser({
      onError: (level, message) => {
        diagnostics.push(`${level}: ${message.split("\n")[0] ?? ""}`);
      },
    }).parseFromString(
      source.startsWith("\uFEFF") ? source.slice(1) : source,
      "application/xml",
    );
  } catch (error) {
    return {
      ok: false,
      problem:
        diagnostics[0] ?? (error instanceof Error ? error.message : "error"),
    };
  }
  if (diagnostics.length > 0) {
    return { ok: false, problem: diagnostics[0] ?? "error" };
  }
  if (document.documentElement === null) {
    return { ok: false, problem: "no hay elemento raíz" };
  }

  const features = {
    doctype: false,
    processingInstructions: false,
    cdata: false,
    comments: false,
  };
  const note = (node: DomNode): void => {
    if (node.nodeType === DOCTYPE) {
      features.doctype = true;
    } else if (node.nodeType === PROCESSING_INSTRUCTION) {
      // El analizador presenta la declaración XML como una instrucción.
      if (node.nodeName.toLowerCase() !== "xml") {
        features.processingInstructions = true;
      }
    } else if (node.nodeType === CDATA) {
      features.cdata = true;
    } else if (node.nodeType === COMMENT) {
      features.comments = true;
    }
  };

  const convert = (element: DomElement, depth: number): XmlElement => {
    if (depth > MAX_DEPTH) {
      throw new TooDeep();
    }
    const attributes = new Map<string, string>();
    for (const attribute of Array.from(element.attributes)) {
      // Las declaraciones de espacios de nombres no son atributos del
      // contenido.
      if (
        attribute.namespaceURI === XMLNS_NAMESPACE ||
        attribute.name === "xmlns" ||
        attribute.name.startsWith("xmlns:")
      ) {
        continue;
      }
      attributes.set(
        `${attribute.namespaceURI ?? ""}|${attribute.localName ?? attribute.name}`,
        attribute.value,
      );
    }
    const children: XmlElement[] = [];
    let text = "";
    for (const node of Array.from(element.childNodes)) {
      note(node);
      if (node.nodeType === ELEMENT) {
        children.push(convert(node as DomElement, depth + 1));
      } else if (node.nodeType === TEXT || node.nodeType === CDATA) {
        text += node.nodeValue ?? "";
      }
    }
    return {
      namespace: element.namespaceURI ?? "",
      name: element.localName ?? "",
      attributes,
      children,
      text,
    };
  };

  try {
    Array.from(document.childNodes).forEach(note);
    return {
      ok: true,
      root: convert(document.documentElement, 0),
      features,
    };
  } catch (error) {
    if (error instanceof TooDeep) {
      return { ok: false, problem: "demasiados niveles de anidamiento" };
    }
    throw error;
  }
}
