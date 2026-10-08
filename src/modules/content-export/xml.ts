// Lectura del manifiesto de un paquete (specs/002-boe-scorm-export: T064;
// research.md, R8; package-validation.md).
//
// El análisis sintáctico lo hace libxml2, a través de `libxml2-wasm`: un
// analizador estricto, mantenido y ajeno al generador. Aquí no se interpreta
// XML a mano ni se añade ninguna comprobación léxica propia. Este fichero
// configura el analizador, adapta su resultado a una estructura mínima con
// los espacios de nombres resueltos y libera sus recursos. No decide nada
// sobre SCORM: las reglas del formato están en `conformance.ts`.
//
// Configuración de la lectura:
//
// - Sin modo de recuperación: un documento mal formado no se repara, se
//   rechaza.
// - Sin sustitución de entidades, sin carga de DTD, sin XInclude y sin acceso
//   a entidades ni a recursos externos.
// - Cualquier error del analizador es un rechazo, y también cualquier aviso.
// - Un documento con DTD no se lee: sus entidades podrían expandirse al
//   consultar el texto.
// - El documento se libera siempre, también si la lectura falla.
import {
  ParseOption,
  XmlCData,
  XmlComment,
  XmlDocument,
  XmlElement as LibElement,
  XmlEntityReference,
  XmlLibError,
  XmlText,
} from "libxml2-wasm";

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

// Construcciones bien formadas presentes en el documento, para que las
// reglas del formato decidan si las admiten.
export interface XmlFeatures {
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

// Nunca `XML_PARSE_RECOVER`, `XML_PARSE_NOENT`, `XML_PARSE_DTDLOAD`,
// `XML_PARSE_DTDATTR`, `XML_PARSE_DTDVALID`, `XML_PARSE_XINCLUDE` ni
// `XML_PARSE_HUGE`.
export const PARSE_OPTIONS =
  ParseOption.XML_PARSE_NO_XXE |
  ParseOption.XML_PARSE_NONET |
  ParseOption.XML_PARSE_NO_SYS_CATALOG;

const MAX_DEPTH = 64;

class Unreadable extends Error {}

function convert(
  element: LibElement,
  features: { -readonly [Key in keyof XmlFeatures]: boolean },
  depth: number,
): XmlElement {
  if (depth > MAX_DEPTH) {
    throw new Unreadable("demasiados niveles de anidamiento");
  }
  const attributes = new Map<string, string>();
  for (const attribute of element.attrs) {
    attributes.set(
      `${attribute.namespaceUri}|${attribute.name}`,
      attribute.value,
    );
  }
  const children: XmlElement[] = [];
  let text = "";
  // Los hijos se piden con XPath y no siguiendo los enlaces entre hermanos:
  // una instrucción de procesamiento no tiene enlace al siguiente.
  for (const node of element.find("node()")) {
    if (node instanceof LibElement) {
      children.push(convert(node, features, depth + 1));
    } else if (node instanceof XmlCData) {
      features.cdata = true;
      text += node.content;
    } else if (node instanceof XmlText) {
      text += node.content;
    } else if (node instanceof XmlComment) {
      features.comments = true;
    } else if (node instanceof XmlEntityReference) {
      // Sin DTD no puede haber ninguna; si la hubiera, no se expande.
      throw new Unreadable("referencia a una entidad sin resolver");
    }
    // Lo único que queda es una instrucción de procesamiento, que ya está
    // anotada.
  }
  return {
    namespace: element.namespaceUri,
    name: element.name,
    attributes,
    children,
    text,
  };
}

export function parseXml(source: string | Uint8Array): XmlResult {
  const bytes =
    typeof source === "string" ? new TextEncoder().encode(source) : source;
  let document: XmlDocument | undefined;
  try {
    document = XmlDocument.fromBuffer(bytes, { option: PARSE_OPTIONS });
    const [warning] = document.warnings;
    if (warning !== undefined) {
      return { ok: false, problem: `aviso: ${warning.message.trim()}` };
    }
    if (document.dtd !== null) {
      return {
        ok: false,
        problem: "el documento lleva una declaración DOCTYPE, que no se lee",
      };
    }
    // Dentro y fuera del elemento raíz.
    const features = {
      processingInstructions:
        document.find("//processing-instruction()").length > 0,
      cdata: false,
      comments: document.find("//comment()").length > 0,
    };
    const { root } = document;
    return { ok: true, root: convert(root, features, 0), features };
  } catch (error) {
    if (error instanceof XmlLibError) {
      return {
        ok: false,
        problem: (error.details[0]?.message ?? error.message).trim(),
      };
    }
    if (error instanceof Unreadable) {
      return { ok: false, problem: error.message };
    }
    throw error;
  } finally {
    document?.dispose();
  }
}
