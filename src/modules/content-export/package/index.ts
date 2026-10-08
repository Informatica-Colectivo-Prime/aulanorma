// Contenido del paquete (specs/002-boe-scorm-export: T061; FR-032, FR-034,
// FR-042 a FR-050; contracts/scorm-package.md; research.md, R7 y R8).
//
// Un único documento con el índice y todos los temas. El HTML de cada bloque
// lo produce el renderizador de `didactic-content`, con la misma plantilla
// con escape que usa la revisión: aquí no se convierte ninguna cadena en
// HTML. Sin el script, el documento se lee entero; el script solo añade la
// navegación entre temas y el seguimiento.
import { z } from "zod";
import { CONTENT, renderBlock } from "@/modules/didactic-content";
import type { RenderedRequirement } from "@/modules/didactic-content";
// Con otro nombre que `html` para que el formateador no altere el marcado:
// dos exportaciones de la misma versión deben producir el mismo documento.
import { html as h } from "@/platform/markup";
import type { Html } from "@/platform/markup";

// Máximo de temas por paquete (FR-048). Con un carácter por tema, el estado
// de seguimiento cabe con holgura en los 4096 caracteres de SCORM 1.2.
export const MAX_TOPICS = 200;

const REQUIREMENT = z.object({
  id: z.string(),
  kind: z.string(),
  code: z.string(),
  text: z.string(),
  section: z.string(),
  pageFrom: z.number().int(),
  pageTo: z.number().int(),
  quote: z.string().nullable(),
});

// Instantánea de una versión aprobada, tal como la guarda `didactic-content`.
export const SNAPSHOT = z.object({
  format: z.literal(1),
  unit: z.object({ code: z.string(), title: z.string() }),
  topics: z
    .array(
      z.object({
        title: z.string(),
        blocks: z.array(
          z.object({
            kind: z.enum(["requirement", "development"]),
            // Un bloque de requisito no tiene contenido propio.
            content: z.union([CONTENT, z.array(z.never()).length(0)]),
            requirements: z.array(REQUIREMENT),
          }),
        ),
      }),
    )
    .min(1),
});
export type Snapshot = z.infer<typeof SNAPSHOT>;

export interface PackageSource {
  // Identificador y etiqueta de la versión aprobada (FR-034).
  readonly versionId: string;
  readonly label: string;
  readonly snapshot: Snapshot;
  // Título del documento oficial del que proceden los requisitos.
  readonly documentTitle: string;
  // Nombre de cada tipo de requisito, para mostrarlo.
  readonly kindNames: Readonly<Record<string, string>>;
  // `true` si algún tema salió de respuestas grabadas: el paquete lo dice.
  readonly trial: boolean;
}

export const TRIAL_NOTICE =
  "Paquete de ensayo. Su contenido procede de respuestas grabadas para probar el producto: no es un temario real ni ha sido generado por ningún modelo.";

export function packageTitle(source: PackageSource): string {
  const { code, title } = source.snapshot.unit;
  return `${code} ${title}`.trim();
}

function topicHtml(source: PackageSource, index: number): Html {
  const topic = source.snapshot.topics[index];
  if (topic === undefined) {
    return h``;
  }
  const rendered = (
    item: z.infer<typeof REQUIREMENT>,
  ): RenderedRequirement => ({
    code: item.code,
    kindName: source.kindNames[item.kind] ?? item.kind,
    text: item.text,
    documentTitle: source.documentTitle,
    section: item.section,
    pageFrom: item.pageFrom,
    pageTo: item.pageTo,
    quote: item.quote,
  });
  const number = index + 1;
  // Sin dirección de página: el documento oficial no viaja en el paquete, así
  // que la procedencia se muestra como texto.
  const blocks = topic.blocks.map((block) =>
    block.kind === "requirement"
      ? renderBlock({
          kind: "requirement",
          requirement:
            block.requirements[0] === undefined
              ? undefined
              : rendered(block.requirements[0]),
        })
      : renderBlock({
          kind: "development",
          content: block.content,
          requirements: block.requirements.map(rendered),
        }),
  );
  return h`<article class="topic" id="tema-${number}" data-topic="${number}" tabindex="-1"><h2>Tema ${number}. ${topic.title}</h2>${blocks}</article>\n`;
}

// Los temas tal como van en el paquete, para la vista previa.
export function packageTopics(source: PackageSource): Html {
  return h`${source.snapshot.topics.map((_topic, position) => topicHtml(source, position))}`;
}

// `index.html` del paquete.
export function packageDocument(source: PackageSource): string {
  const title = packageTitle(source);
  const topics = source.snapshot.topics;
  const index = topics.map(
    (topic, position) =>
      h`<li><a href="#tema-${position + 1}">Tema ${position + 1}. ${topic.title}</a> <span class="mark" data-mark="${position + 1}"></span></li>`,
  );
  return h`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<link rel="stylesheet" href="assets/style.css" />
</head>
<body data-version="${source.versionId}" data-topics="${topics.length}">
<a class="skip" href="#contenido">Saltar al contenido</a>
<header>
<h1>${title}</h1>
<p class="meta">Versión del temario: ${source.label} · Identificador: <code>${source.versionId}</code></p>
${source.trial ? h`<p class="trial"><strong>${TRIAL_NOTICE}</strong></p>` : null}
</header>
<p id="estado" class="status" role="status">Sin el script de este paquete, el contenido se muestra completo y el recorrido no se guarda.</p>
<p id="aviso" class="alert" role="alert" hidden></p>
<main id="contenido">
<nav id="indice" aria-labelledby="indice-titulo">
<h2 id="indice-titulo">Índice</h2>
<ol>${index}</ol>
</nav>
${topics.map((_topic, position) => topicHtml(source, position))}<section id="final" aria-labelledby="final-titulo">
<h2 id="final-titulo">Finalizar</h2>
<p>«Finalizar» comunica a la plataforma que has recorrido todos los temas. No es una calificación ni acredita el aprendizaje, la formación ni la competencia.</p>
</section>
</main>
<script src="assets/app.js"></script>
</body>
</html>
`.text;
}
