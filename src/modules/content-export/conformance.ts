// Comprobación de un paquete, releyendo el ZIP ya generado
// (specs/002-boe-scorm-export: T064; FR-032, FR-033, FR-037; research.md, R8;
// contracts/scorm-package.md; package-validation.md).
//
// Aquí están las reglas del formato, separadas del análisis sintáctico, que
// hace un analizador ajeno en `xml.ts`. Son de dos clases:
//
// - Reglas de estructura de un paquete SCORM 1.2, que también debe superar
//   un paquete ajeno: manifiesto en la raíz, metadatos, organizaciones,
//   recursos y ficheros coherentes.
// - Reglas del perfil que exporta AulaNorma (`delivery`): un único SCO, sin
//   puntuación, con la versión aprobada, sin direcciones externas y con un
//   manifiesto de forma restringida.
//
// No es un validador general de paquetes SCORM, no equivale a validar contra
// los XSD de SCORM 1.2 y no acredita conformidad con SCORM: lo que comprueba
// y lo que deja fuera está en package-validation.md. Que una plataforma
// importe el paquete y guarde el recorrido solo lo acredita la prueba en un
// Moodle real.
import { strFromU8, unzipSync } from "fflate";
import { ADLCP_NAMESPACE, CP_NAMESPACE, MANIFEST_NAME } from "./build";
import { parseXml } from "./xml";
import type { XmlElement } from "./xml";

// Mecanismos que componen la comprobación, tal como se registran con cada
// exportación. La validación contra los XSD no forma parte de ella: se
// sustituyó por esta estrategia (research.md, R8).
export const VALIDATION_STRATEGY = {
  id: "profile-v1",
  parser: "@xmldom/xmldom",
  xsd: "not_part_of_strategy",
  moodle: "pending_manual_verification",
} as const;

export interface ConformanceExpectation {
  // Identificador que el manifiesto debe llevar (FR-034).
  readonly manifestIdentifier?: string;
  // Texto que debe aparecer en el título del ítem: la versión aprobada.
  readonly versionId?: string;
  // Textos que no pueden aparecer en ningún fichero: nombres e
  // identificadores de usuarios (FR-033).
  readonly forbidden?: readonly string[];
  // Reglas de entrega de AulaNorma, además de las del formato: un único SCO
  // y ninguna dirección externa.
  readonly delivery: boolean;
}

export interface ConformanceResult {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly files: readonly string[];
  readonly strategy: typeof VALIDATION_STRATEGY;
}

const MAX_FILES = 2000;
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
const TEXT_FILE = /\.(?:html?|js|css|xml)$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// Lo que haría salir del paquete, según el tipo de fichero. En el HTML solo
// cuentan los atributos que cargan o enlazan algo: una dirección escrita en
// el texto de un requisito no es una petición.
const EXTERNAL_BY_TYPE: readonly (readonly [RegExp, RegExp])[] = [
  [
    /\.html?$/i,
    /<[^>]*\s(?:href|src|srcset|action|formaction|data|poster|background|cite|manifest|ping)\s*=\s*["']?\s*(?:[a-z][a-z0-9+.-]*:|\/\/)|<\s*(?:base|iframe|object|embed|form)\b|<meta[^>]*http-equiv/i,
  ],
  [/\.css$/i, /url\s*\(|@import/i],
  [
    /\.js$/i,
    /(?:[a-z][a-z0-9+.-]*:)?\/\/[a-z0-9[]|\b(?:XMLHttpRequest|fetch|WebSocket|EventSource|sendBeacon|importScripts)\b|\bimport\s*\(/i,
  ],
  [/\.xml$/i, /(?:[a-z][a-z0-9+.-]*:)?\/\/[a-z0-9[]/i],
];

// Caracteres que XML 1.0 no admite: de control, salvo tabulador y saltos de
// línea, sustitutos sueltos y los dos últimos de cada plano básico.
function hasForbiddenCharacters(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const allowed =
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      code >= 0x10000;
    if (!allowed) {
      return true;
    }
  }
  return false;
}

function unsafeName(name: string): boolean {
  return (
    name === "" ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    /^[A-Za-z]:/.test(name) ||
    name.split("/").some((part) => part === ".." || part === "." || part === "")
  );
}

function child(parent: XmlElement, name: string): XmlElement | undefined {
  return parent.children.find(
    (item) => item.namespace === CP_NAMESPACE && item.name === name,
  );
}

function children(parent: XmlElement, name: string): XmlElement[] {
  return parent.children.filter(
    (item) => item.namespace === CP_NAMESPACE && item.name === name,
  );
}

function descendants(parent: XmlElement, name: string): XmlElement[] {
  return parent.children.flatMap((item) => [
    ...(item.namespace === CP_NAMESPACE && item.name === name ? [item] : []),
    ...descendants(item, name),
  ]);
}

function everything(parent: XmlElement): XmlElement[] {
  return [parent, ...parent.children.flatMap(everything)];
}

// Ruta local de un `href`, sin consulta ni fragmento; `undefined` si no es
// una ruta dentro del paquete.
function localPath(href: string): string | undefined {
  const path = (href.split(/[?#]/)[0] ?? "").trim();
  if (SCHEME.test(href.trim()) || href.trim().startsWith("//")) {
    return undefined;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return undefined;
  }
  return unsafeName(decoded) ? undefined : decoded;
}

export function checkPackage(
  zip: Uint8Array,
  expectation: ConformanceExpectation,
): ConformanceResult {
  const problems: string[] = [];
  const result = (files: readonly string[]): ConformanceResult => ({
    ok: problems.length === 0,
    problems,
    files,
    strategy: VALIDATION_STRATEGY,
  });

  let entries: Record<string, Uint8Array>;
  try {
    let count = 0;
    let bytes = 0;
    entries = unzipSync(zip, {
      filter: (file) => {
        count += 1;
        bytes += file.originalSize;
        if (count > MAX_FILES || bytes > MAX_UNPACKED_BYTES) {
          throw new Error("too large");
        }
        return true;
      },
    });
  } catch {
    problems.push(
      "El fichero no es un ZIP legible o supera el tamaño admitido.",
    );
    return result([]);
  }

  // Las entradas que solo son directorios no cuentan como ficheros.
  const files = Object.keys(entries)
    .filter((name) => !name.endsWith("/"))
    .sort();
  for (const name of Object.keys(entries)) {
    if (unsafeName(name.endsWith("/") ? name.slice(0, -1) : name)) {
      problems.push(`Nombre de entrada no admitido: ${JSON.stringify(name)}.`);
    }
  }
  const lowered = files.map((name) => name.toLowerCase());
  if (new Set(lowered).size !== lowered.length) {
    problems.push("Hay entradas que solo se distinguen por mayúsculas.");
  }
  const manifestBytes = entries[MANIFEST_NAME];
  if (manifestBytes === undefined) {
    problems.push("Falta imsmanifest.xml en la raíz del paquete.");
    return result(files);
  }

  let manifestText: string;
  try {
    manifestText = new TextDecoder("utf-8", { fatal: true }).decode(
      manifestBytes,
    );
  } catch {
    problems.push("El manifiesto no es UTF-8 válido.");
    return result(files);
  }
  const parsed = parseXml(manifestText);
  if (!parsed.ok) {
    problems.push(`El manifiesto no es XML admitido: ${parsed.problem}.`);
    return result(files);
  }
  const { root, features } = parsed;
  // Nada que resolver fuera del propio documento, en ningún paquete.
  if (features.doctype) {
    problems.push(
      "El manifiesto lleva una declaración DOCTYPE, que no se admite.",
    );
  }
  if (features.processingInstructions) {
    problems.push(
      "El manifiesto lleva instrucciones de procesamiento, que no se admiten.",
    );
  }
  const encoding =
    /^(?:\uFEFF)?<\?xml[^>]*\sencoding\s*=\s*["']([^"']*)["']/.exec(
      manifestText,
    )?.[1];
  if (encoding !== undefined && encoding.toLowerCase() !== "utf-8") {
    problems.push("El manifiesto declara una codificación distinta de UTF-8.");
  }
  if (root.namespace !== CP_NAMESPACE || root.name !== "manifest") {
    problems.push(
      "El elemento raíz no es un manifiesto de empaquetado de contenidos de SCORM 1.2.",
    );
    return result(files);
  }

  const identifier = root.attributes.get("|identifier") ?? "";
  if (identifier === "") {
    problems.push("El manifiesto no tiene identificador.");
  }
  if (
    expectation.manifestIdentifier !== undefined &&
    identifier !== expectation.manifestIdentifier
  ) {
    problems.push("El identificador del manifiesto no es el de la versión.");
  }

  const metadata = child(root, "metadata");
  if (
    metadata === undefined ||
    child(metadata, "schema")?.text.trim() !== "ADL SCORM" ||
    child(metadata, "schemaversion")?.text.trim() !== "1.2"
  ) {
    problems.push("Los metadatos no declaran ADL SCORM, versión 1.2.");
  }

  // Identificadores únicos en todo el manifiesto.
  const identifiers = everything(root).flatMap((item) => {
    const value = item.attributes.get("|identifier");
    return value === undefined ? [] : [value];
  });
  if (new Set(identifiers).size !== identifiers.length) {
    problems.push("Hay identificadores repetidos en el manifiesto.");
  }

  const resourcesElement = child(root, "resources");
  const resources =
    resourcesElement === undefined
      ? []
      : children(resourcesElement, "resource");
  const byId = new Map(
    resources.map((item) => [item.attributes.get("|identifier") ?? "", item]),
  );

  const organizations = child(root, "organizations");
  const organizationList =
    organizations === undefined ? [] : children(organizations, "organization");
  if (organizationList.length === 0) {
    problems.push("El manifiesto no tiene ninguna organización.");
  }
  const defaultOrganization = organizations?.attributes.get("|default");
  if (
    defaultOrganization !== undefined &&
    !organizationList.some(
      (item) => item.attributes.get("|identifier") === defaultOrganization,
    )
  ) {
    problems.push("La organización por defecto no existe.");
  }
  const items = organizationList.flatMap((item) => descendants(item, "item"));
  const launched = new Set<XmlElement>();
  for (const item of items) {
    const reference = item.attributes.get("|identifierref");
    if (reference === undefined || reference === "") {
      continue;
    }
    const resource = byId.get(reference);
    if (resource === undefined) {
      problems.push(
        `Un ítem remite a un recurso que no existe: ${JSON.stringify(reference)}.`,
      );
      continue;
    }
    launched.add(resource);
    if (resource.attributes.get("|href") === undefined) {
      problems.push(
        "El recurso que lanza un ítem no tiene dirección de inicio.",
      );
    }
    const scormType = resource.attributes.get(`${ADLCP_NAMESPACE}|scormtype`);
    if (scormType !== "sco" && scormType !== "asset") {
      problems.push("El recurso que lanza un ítem no declara su tipo SCORM.");
    }
  }
  if (launched.size === 0) {
    problems.push("Ningún ítem lanza un recurso.");
  }

  // `xml:base` cambia la ruta de los ficheros. Esta comprobación no lo
  // resuelve: un manifiesto que lo use no se da por bueno.
  if (
    everything(root).some((item) =>
      item.attributes.has("http://www.w3.org/XML/1998/namespace|base"),
    )
  ) {
    problems.push(
      "El manifiesto usa xml:base, que esta comprobación no resuelve.",
    );
  }

  // Cada fichero declarado existe, y no sobra ninguno.
  const declared = new Set<string>();
  for (const resource of resources) {
    for (const dependency of children(resource, "dependency")) {
      const reference = dependency.attributes.get("|identifierref") ?? "";
      if (!byId.has(reference)) {
        problems.push(
          `Un recurso depende de otro que no existe: ${JSON.stringify(reference)}.`,
        );
      }
    }
    if (
      children(resource, "file").some(
        (file) => file.attributes.get("|href") === undefined,
      )
    ) {
      problems.push("Un fichero declarado en un recurso no tiene dirección.");
    }
    const hrefs = [
      resource.attributes.get("|href"),
      ...children(resource, "file").map((file) => file.attributes.get("|href")),
    ];
    for (const href of hrefs) {
      if (href === undefined) {
        continue;
      }
      const path = localPath(href);
      if (path === undefined) {
        problems.push(
          `Dirección no admitida en un recurso: ${JSON.stringify(href)}.`,
        );
      } else if (!files.includes(path)) {
        problems.push(
          `El manifiesto declara un fichero que no está en el paquete: ${JSON.stringify(path)}.`,
        );
      } else {
        declared.add(path);
      }
    }
    const start = resource.attributes.get("|href");
    const startPath = start === undefined ? undefined : localPath(start);
    if (
      startPath !== undefined &&
      !children(resource, "file").some(
        (file) => localPath(file.attributes.get("|href") ?? "") === startPath,
      )
    ) {
      problems.push(
        "La dirección de inicio de un recurso no figura entre sus ficheros.",
      );
    }
  }
  for (const name of files) {
    if (name !== MANIFEST_NAME && !declared.has(name)) {
      problems.push(
        `El paquete contiene un fichero que el manifiesto no declara: ${JSON.stringify(name)}.`,
      );
    }
  }

  if (expectation.delivery) {
    // Forma restringida del manifiesto que escribe el generador. Son reglas
    // léxicas sobre el texto, no un segundo análisis: cubren errores de
    // buena formación que el analizador tolera sin avisar.
    if (features.cdata || features.comments) {
      problems.push(
        "El manifiesto lleva comentarios o secciones CDATA, que el generador no escribe.",
      );
    }
    // Solo los dos espacios de nombres que declara el generador, una vez
    // cada uno: así un atributo no puede repetirse con otro prefijo.
    const declarations = [
      ...manifestText.matchAll(
        /\sxmlns(?::([A-Za-z0-9_.-]+))?\s*=\s*"([^"]*)"/g,
      ),
    ].map((match) => `${match[1] ?? ""}=${match[2] ?? ""}`);
    if (
      declarations.length !== 2 ||
      declarations[0] !== `=${CP_NAMESPACE}` ||
      declarations[1] !== `adlcp=${ADLCP_NAMESPACE}` ||
      /\sxmlns[^=\s]*\s*=\s*'/.test(manifestText)
    ) {
      problems.push(
        "El manifiesto no declara exactamente los dos espacios de nombres del generador.",
      );
    }
    if (manifestText.includes("]]>")) {
      problems.push("El manifiesto lleva la secuencia «]]>» fuera de lugar.");
    }
    if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(manifestText)) {
      problems.push(
        "El manifiesto lleva un «&» que no inicia una de las cinco referencias que escribe el generador.",
      );
    }
    if (hasForbiddenCharacters(manifestText)) {
      problems.push("El manifiesto lleva caracteres que XML 1.0 no admite.");
    }
    const scos = [...launched].filter(
      (item) => item.attributes.get(`${ADLCP_NAMESPACE}|scormtype`) === "sco",
    );
    if (items.length !== 1 || launched.size !== 1 || scos.length !== 1) {
      problems.push("El paquete no es un único SCO lanzado por un único ítem.");
    }
    if (
      everything(root).some(
        (item) =>
          item.namespace === ADLCP_NAMESPACE &&
          ["masteryscore", "maxtimeallowed", "timelimitaction"].includes(
            item.name,
          ),
      )
    ) {
      problems.push(
        "El manifiesto declara puntuación o límites, que este paquete no usa.",
      );
    }
    if (
      expectation.versionId !== undefined &&
      !items.some((item) =>
        (child(item, "title")?.text ?? "").includes(
          expectation.versionId ?? "",
        ),
      )
    ) {
      problems.push("El título del ítem no identifica la versión aprobada.");
    }
    for (const name of files) {
      if (!TEXT_FILE.test(name)) {
        problems.push(`Tipo de fichero no previsto: ${JSON.stringify(name)}.`);
        continue;
      }
      let text = strFromU8(entries[name] ?? new Uint8Array());
      if (name === MANIFEST_NAME) {
        // Los espacios de nombres son identificadores, no direcciones que se
        // carguen: se excluyen de la búsqueda.
        text = text.replace(/\sxmlns(?::[A-Za-z0-9_-]+)?\s*=\s*"[^"]*"/g, "");
      }
      const external = EXTERNAL_BY_TYPE.find(([type]) => type.test(name));
      if (external?.[1].test(text) === true) {
        problems.push(`Hay una dirección externa en ${JSON.stringify(name)}.`);
      }
    }
  }

  for (const forbidden of expectation.forbidden ?? []) {
    if (forbidden === "") {
      continue;
    }
    for (const name of files) {
      if (strFromU8(entries[name] ?? new Uint8Array()).includes(forbidden)) {
        problems.push(`Hay un dato de usuario en ${JSON.stringify(name)}.`);
      }
    }
  }

  return result(files);
}
