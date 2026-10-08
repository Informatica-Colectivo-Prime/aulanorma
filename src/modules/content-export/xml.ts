// Lector de XML mínimo y estricto, para releer el manifiesto de un paquete.
//
// Acepta el subconjunto que un manifiesto necesita: declaración, comentarios,
// elementos, atributos, texto, secciones CDATA y las referencias
// predefinidas o numéricas. Rechaza lo demás, en particular cualquier
// `DOCTYPE`, entidad propia o instrucción de procesamiento: no hay nada que
// resolver fuera del propio documento.

export interface XmlElement {
  // Espacio de nombres resuelto, o cadena vacía.
  readonly namespace: string;
  readonly name: string;
  // Atributos por «espacio de nombres resuelto|nombre local».
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  readonly text: string;
}

export type XmlResult =
  | { readonly ok: true; readonly root: XmlElement }
  | { readonly ok: false; readonly problem: string };

const NAME = /^[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?/;
const PREDEFINED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const MAX_DEPTH = 64;

class XmlError extends Error {}

function decode(value: string): string {
  return value.replace(/&([^;&]*);?/g, (match: string, body: string) => {
    if (!match.endsWith(";")) {
      throw new XmlError("referencia sin terminar");
    }
    const named = PREDEFINED[body];
    if (named !== undefined) {
      return named;
    }
    const numeric = /^#(?:x([0-9A-Fa-f]{1,6})|([0-9]{1,7}))$/.exec(body);
    if (numeric === null) {
      throw new XmlError("entidad no admitida");
    }
    const code = parseInt(
      numeric[1] ?? numeric[2] ?? "",
      numeric[1] === undefined ? 10 : 16,
    );
    if (code === 0 || code > 0x10ffff) {
      throw new XmlError("referencia numérica no válida");
    }
    return String.fromCodePoint(code);
  });
}

interface Mutable {
  namespace: string;
  name: string;
  attributes: Map<string, string>;
  children: XmlElement[];
  text: string;
}

export function parseXml(source: string): XmlResult {
  let position = source.startsWith("﻿") ? 1 : 0;
  const fail = (problem: string): never => {
    throw new XmlError(problem);
  };
  const skipSpace = (): void => {
    while (/\s/.test(source[position] ?? "")) {
      position += 1;
    }
  };
  const skipMisc = (): void => {
    for (;;) {
      skipSpace();
      if (!source.startsWith("<!--", position)) {
        return;
      }
      const end = source.indexOf("-->", position + 4);
      if (end < 0) {
        fail("comentario sin cerrar");
      }
      position = end + 3;
    }
  };

  const element = (
    scopes: ReadonlyMap<string, string>,
    depth: number,
  ): XmlElement => {
    if (depth > MAX_DEPTH) {
      fail("demasiados niveles");
    }
    position += 1;
    const qualified = NAME.exec(source.slice(position, position + 256))?.[0];
    if (qualified === undefined) {
      return fail("nombre de elemento no válido");
    }
    position += qualified.length;
    const raw = new Map<string, string>();
    for (;;) {
      const before = position;
      skipSpace();
      if (source[position] === ">" || source.startsWith("/>", position)) {
        break;
      }
      if (before === position) {
        fail("atributo mal formado");
      }
      const attribute = NAME.exec(source.slice(position, position + 256))?.[0];
      if (attribute === undefined) {
        return fail("nombre de atributo no válido");
      }
      position += attribute.length;
      skipSpace();
      if (source[position] !== "=") {
        fail("atributo sin valor");
      }
      position += 1;
      skipSpace();
      const quote = source[position];
      if (quote !== '"' && quote !== "'") {
        return fail("valor de atributo sin comillas");
      }
      const end = source.indexOf(quote, position + 1);
      if (end < 0) {
        fail("valor de atributo sin cerrar");
      }
      const value = source.slice(position + 1, end);
      if (value.includes("<")) {
        fail("valor de atributo no válido");
      }
      if (raw.has(attribute)) {
        fail("atributo repetido");
      }
      raw.set(attribute, decode(value));
      position = end + 1;
    }
    const scope = new Map(scopes);
    for (const [name, value] of raw) {
      if (name === "xmlns") {
        scope.set("", value);
      } else if (name.startsWith("xmlns:")) {
        scope.set(name.slice(6), value);
      }
    }
    const resolve = (name: string, isAttribute: boolean): [string, string] => {
      const [first, second] = name.split(":");
      if (second === undefined) {
        // Un atributo sin prefijo no está en ningún espacio de nombres.
        return [isAttribute ? "" : (scope.get("") ?? ""), first ?? ""];
      }
      const namespace =
        first === "xml" ? XML_NAMESPACE : scope.get(first ?? "");
      if (namespace === undefined) {
        return fail("prefijo sin declarar");
      }
      return [namespace, second];
    };
    const [namespace, name] = resolve(qualified, false);
    const node: Mutable = {
      namespace,
      name,
      attributes: new Map(),
      children: [],
      text: "",
    };
    for (const [attribute, value] of raw) {
      if (attribute === "xmlns" || attribute.startsWith("xmlns:")) {
        continue;
      }
      const [attributeNamespace, local] = resolve(attribute, true);
      node.attributes.set(`${attributeNamespace}|${local}`, value);
    }
    if (source.startsWith("/>", position)) {
      position += 2;
      return node;
    }
    position += 1;
    for (;;) {
      const next = source.indexOf("<", position);
      if (next < 0) {
        return fail("elemento sin cerrar");
      }
      node.text += decode(source.slice(position, next));
      position = next;
      if (source.startsWith("</", position)) {
        position += 2;
        if (!source.startsWith(qualified, position)) {
          fail("cierre que no corresponde");
        }
        position += qualified.length;
        skipSpace();
        if (source[position] !== ">") {
          fail("cierre mal formado");
        }
        position += 1;
        return node;
      }
      if (source.startsWith("<!--", position)) {
        const end = source.indexOf("-->", position + 4);
        if (end < 0) {
          fail("comentario sin cerrar");
        }
        position = end + 3;
      } else if (source.startsWith("<![CDATA[", position)) {
        const end = source.indexOf("]]>", position + 9);
        if (end < 0) {
          fail("sección CDATA sin cerrar");
        }
        node.text += source.slice(position + 9, end);
        position = end + 3;
      } else if (source[position + 1] === "!" || source[position + 1] === "?") {
        fail("construcción no admitida");
      } else {
        node.children.push(element(scope, depth + 1));
      }
    }
  };

  try {
    if (source.startsWith("<?xml", position)) {
      const end = source.indexOf("?>", position);
      if (end < 0) {
        fail("declaración sin cerrar");
      }
      position = end + 2;
    }
    skipMisc();
    if (source[position] !== "<" || !NAME.test(source.slice(position + 1))) {
      fail("no hay elemento raíz o hay una construcción no admitida");
    }
    const root = element(new Map(), 0);
    skipMisc();
    if (position !== source.length) {
      fail("contenido después del elemento raíz");
    }
    return { ok: true, root };
  } catch (error) {
    if (error instanceof XmlError) {
      return { ok: false, problem: error.message };
    }
    throw error;
  }
}
