// Marcado HTML con escape (specs/002-boe-scorm-export: FR-020, SC-046;
// research.md, R7).
//
// Es el único sitio que convierte texto en HTML. Un fragmento solo lo crea la
// plantilla `html`, que escapa cada valor interpolado; no hay ninguna función
// que acepte una cadena como HTML ya escapado. Lo usan la entrega web y el
// renderizador de contenido, de modo que la revisión, la vista previa y el
// paquete exportado comparten la misma garantía.
//
// El escape sirve para texto y para valores de atributos entre comillas, que
// son los dos únicos contextos en los que una plantilla debe interpolar. No
// decide si una dirección es segura: eso lo hace `localHref`.

// Fragmento de HTML ya escapado. La marca impide construirlo por tipos y el
// registro impide hacerlo en ejecución con un objeto de la misma forma.
declare const markup: unique symbol;
export interface Html {
  readonly [markup]: true;
  readonly text: string;
}

export type HtmlValue =
  string | number | Html | readonly Html[] | null | undefined;

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

const created = new WeakSet<object>();

function fragment(text: string): Html {
  const value = Object.freeze({ text }) as Html;
  created.add(value);
  return value;
}

function textOf(value: unknown): string {
  if (typeof value !== "object" || value === null || !created.has(value)) {
    throw new TypeError("Solo se compone HTML creado por la plantilla.");
  }
  return (value as Html).text;
}

// Plantilla de HTML: el texto literal se emite tal cual y cada valor
// interpolado se escapa, salvo que sea otro fragmento creado aquí.
export function html(
  strings: TemplateStringsArray,
  ...values: readonly HtmlValue[]
): Html {
  let text = "";
  strings.forEach((literal, index) => {
    text += literal;
    const value = values[index];
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value === "string") {
      text += escapeHtml(value);
    } else if (typeof value === "number") {
      text += String(value);
    } else if (Array.isArray(value)) {
      text += (value as readonly unknown[]).map(textOf).join("");
    } else {
      text += textOf(value);
    }
  });
  return fragment(text);
}

// Une fragmentos con un separador que también es un fragmento.
export function joinHtml(parts: readonly Html[], separator: Html): Html {
  return fragment(parts.map(textOf).join(textOf(separator)));
}

// Dirección local, sin esquema ni servidor, o `null` si no lo es. Escapar un
// atributo no impide un `javascript:`; un enlace solo se emite con una
// dirección que pasa por aquí.
export function localHref(value: string): string | null {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f || char === "\\") {
      return null;
    }
  }
  if (value === "" || value.startsWith("//")) {
    return null;
  }
  const head = /^[^/?#]*/.exec(value)?.[0] ?? "";
  return head.includes(":") ? null : value;
}

// Elemento `style` o `script` con un recurso propio del proceso, byte a byte:
// su huella es la que lleva la política de contenido. Es la única vía que no
// escapa, y por eso solo admite constantes del código: la usa la entrega web
// para su estilo y su script, y una prueba de arquitectura impide cualquier
// otro uso. Rechaza un contenido que pudiera cerrar el elemento.
export function inlineResource(tag: "script" | "style", source: string): Html {
  if (/<\/|<!--/.test(source)) {
    throw new TypeError("El recurso no puede contener marcado de cierre.");
  }
  return fragment(`<${tag}>${source}</${tag}>`);
}
