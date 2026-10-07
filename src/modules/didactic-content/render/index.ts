// Contenido de un tema y su renderizador (specs/002-boe-scorm-export: FR-017,
// FR-018 y FR-020; SC-046; research.md, R7).
//
// El contenido de un tema no es HTML: es una lista de bloques estructurados,
// validados por esquema, con encabezados, párrafos y listas de texto plano.
// El HTML lo produce siempre este renderizador, que escapa todo el texto: no
// hay nada que sanear con heurísticas, y la revisión y el paquete muestran lo
// mismo. La distinción entre norma y desarrollo didáctico es un dato del
// bloque y se muestra con una etiqueta de texto, no solo con un estilo.
import { z } from "zod";

// Caracteres de control, salvo el tabulador y los saltos de línea.
function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      code === 0x7f
    ) {
      return true;
    }
  }
  return false;
}

function plain(max: number) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(max)
        .refine((value) => !hasControlCharacters(value)),
    );
}

export const MAX_NODES = 60;
export const MAX_TEXT = 4000;

// Esquema versionado del contenido de un bloque de desarrollo.
export const CONTENT_VERSION = "v1";
export const CONTENT_NODE = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: plain(200) }),
  z.object({ type: z.literal("paragraph"), text: plain(MAX_TEXT) }),
  z.object({
    type: z.literal("list"),
    items: z.array(plain(1000)).min(1).max(40),
  }),
]);
export const CONTENT = z.array(CONTENT_NODE).min(1).max(MAX_NODES);
export type ContentNode = z.infer<typeof CONTENT_NODE>;

// --- Texto editable ---
//
// Un docente edita el contenido como texto plano: una línea que empieza por
// «# » es un encabezado; las líneas seguidas que empiezan por «- », una
// lista; y el resto, párrafos separados por una línea en blanco. Nada de ese
// texto se interpreta como marcado.

export function contentToText(nodes: readonly ContentNode[]): string {
  return nodes
    .map((node) =>
      node.type === "heading"
        ? `# ${node.text}`
        : node.type === "list"
          ? node.items.map((item) => `- ${item}`).join("\n")
          : node.text,
    )
    .join("\n\n");
}

export function textToContent(text: string): unknown[] {
  const nodes: unknown[] = [];
  for (const chunk of text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    let paragraph: string[] = [];
    let items: string[] = [];
    const flush = (): void => {
      if (paragraph.length > 0) {
        nodes.push({ type: "paragraph", text: paragraph.join("\n") });
        paragraph = [];
      }
      if (items.length > 0) {
        nodes.push({ type: "list", items });
        items = [];
      }
    };
    for (const line of lines) {
      if (line.startsWith("# ")) {
        flush();
        nodes.push({ type: "heading", text: line.slice(2) });
      } else if (line.startsWith("- ")) {
        if (paragraph.length > 0) {
          flush();
        }
        items.push(line.slice(2));
      } else {
        if (items.length > 0) {
          flush();
        }
        paragraph.push(line);
      }
    }
    flush();
  }
  return nodes;
}

// --- Renderizador ---

// Requisito tal como se muestra en un bloque: su referencia normativa.
export interface RenderedRequirement {
  readonly code: string;
  readonly kindName: string;
  readonly text: string;
  readonly documentTitle: string;
  readonly section: string;
  readonly pageFrom: number;
  readonly pageTo: number;
  readonly quote: string | null;
}

export type RenderBlock =
  | {
      readonly kind: "requirement";
      // `undefined` si el requisito citado ya no está en el inventario.
      readonly requirement: RenderedRequirement | undefined;
    }
  | {
      readonly kind: "development";
      readonly content: readonly ContentNode[];
      // Requisitos que desarrolla. Vacío: sin respaldo normativo.
      readonly requirements: readonly RenderedRequirement[];
    };

export interface RenderOptions {
  // Dirección de una página del documento de origen. Sin ella, la página se
  // muestra como texto.
  readonly pageHref?: (page: number) => string;
}

export const REQUIREMENT_LABEL = "Requisito extraído del BOE";
export const DEVELOPMENT_LABEL = "Desarrollo didáctico generado";
export const UNSUPPORTED_LABEL = "Sin respaldo normativo";

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Escapa un texto para usarlo como contenido o como valor de un atributo.
export function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

// Texto de varias líneas: cada salto de línea pasa a ser un `<br />`.
function lines(value: string): string {
  return value.split("\n").map(escapeText).join("<br />");
}

function pages(requirement: RenderedRequirement, options: RenderOptions) {
  const one = (page: number): string =>
    options.pageHref === undefined
      ? `página ${String(page)}`
      : `<a href="${escapeText(options.pageHref(page))}">página ${String(page)}</a>`;
  return requirement.pageTo === requirement.pageFrom
    ? one(requirement.pageFrom)
    : `${one(requirement.pageFrom)} a ${one(requirement.pageTo)}`;
}

function source(requirement: RenderedRequirement, options: RenderOptions) {
  return (
    `${escapeText(requirement.documentTitle)}, ` +
    `${escapeText(requirement.section)}, ${pages(requirement, options)}`
  );
}

function label(requirement: RenderedRequirement): string {
  return (
    `<span class="tag">${escapeText(requirement.kindName)}</span> ` +
    (requirement.code === ""
      ? ""
      : `<strong>${escapeText(requirement.code)}</strong> `)
  );
}

function node(item: ContentNode): string {
  switch (item.type) {
    case "heading":
      return `<h3>${escapeText(item.text)}</h3>`;
    case "paragraph":
      return `<p>${lines(item.text)}</p>`;
    case "list":
      return `<ul>${item.items.map((entry) => `<li>${lines(entry)}</li>`).join("")}</ul>`;
  }
}

// HTML de un bloque. Todo texto que llega aquí sale escapado.
export function renderBlock(
  block: RenderBlock,
  options: RenderOptions = {},
): string {
  if (block.kind === "requirement") {
    const { requirement } = block;
    return (
      `<section class="block norm"><p class="kind">${REQUIREMENT_LABEL}</p>` +
      (requirement === undefined
        ? `<p class="muted">El requisito citado ya no está en el inventario vigente.</p>`
        : `<p>${label(requirement)}${lines(requirement.text)}</p>` +
          `<p class="hint">${source(requirement, options)}</p>` +
          (requirement.quote === null
            ? ""
            : `<blockquote>${lines(requirement.quote)}</blockquote>`)) +
      `</section>`
    );
  }
  return (
    `<section class="block development"><p class="kind">${DEVELOPMENT_LABEL}</p>` +
    block.content.map(node).join("") +
    (block.requirements.length === 0
      ? `<p class="hint"><span class="tag bad">${UNSUPPORTED_LABEL}</span> ` +
        `Este desarrollo no se apoya en ningún requisito.</p>`
      : `<p class="hint">Desarrolla:</p><ul class="hint">` +
        block.requirements
          .map(
            (requirement) =>
              `<li>${label(requirement)}${source(requirement, options)}</li>`,
          )
          .join("") +
        `</ul>`) +
    `</section>`
  );
}

export function renderBlocks(
  blocks: readonly RenderBlock[],
  options: RenderOptions = {},
): string {
  return blocks.map((block) => renderBlock(block, options)).join("");
}
