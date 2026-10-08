// Generador del paquete SCORM 1.2 (specs/002-boe-scorm-export: T063; FR-030,
// FR-032 a FR-036 y FR-048; contracts/scorm-package.md; research.md, R8).
//
// Un único SCO. El manifiesto sale de una plantilla con escapado; el ZIP
// lleva sus entradas en orden fijo y con fecha fija, de modo que exportar dos
// veces la misma versión produce el mismo contenido. No incluye ningún dato
// de usuarios: ni quién aprobó ni quién exporta.
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { MAX_TOPICS, packageDocument, packageTitle } from "./package/index";
import type { PackageSource } from "./package/index";

export const MANIFEST_NAME = "imsmanifest.xml";
export const CP_NAMESPACE = "http://www.imsproject.org/xsd/imscp_rootv1p1p2";
export const ADLCP_NAMESPACE = "http://www.adlnet.org/xsd/adlcp_rootv1p2";

// Ficheros del paquete, además del manifiesto, en su orden.
const ENTRY = "index.html";
const SCRIPT = "assets/app.js";
const STYLE = "assets/style.css";

export interface PackageAssets {
  readonly script: string;
  readonly style: string;
}

export interface BuiltPackage {
  readonly zip: Uint8Array;
  readonly sha256: string;
}

export type BuildResult =
  | { readonly ok: true; readonly built: BuiltPackage }
  | { readonly ok: false; readonly reason: "too_many_topics" };

// Escapa un texto para un elemento o un atributo XML, y quita los caracteres
// que XML 1.0 no admite.
export function escapeXml(value: string): string {
  let text = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const allowed =
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      code >= 0x10000;
    if (!allowed) {
      continue;
    }
    text +=
      char === "&"
        ? "&amp;"
        : char === "<"
          ? "&lt;"
          : char === ">"
            ? "&gt;"
            : char === '"'
              ? "&quot;"
              : char === "'"
                ? "&apos;"
                : char;
  }
  return text;
}

// Identificador del manifiesto: incluye el de la versión aprobada (FR-034).
export function manifestIdentifier(versionId: string): string {
  return `aulanorma-${versionId}`;
}

export function buildManifest(source: PackageSource): string {
  const title = escapeXml(packageTitle(source));
  const version = escapeXml(
    `Versión ${source.label}, identificador ${source.versionId}`,
  );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<manifest identifier="${escapeXml(manifestIdentifier(source.versionId))}" version="1.0"\n` +
    `  xmlns="${CP_NAMESPACE}"\n` +
    `  xmlns:adlcp="${ADLCP_NAMESPACE}">\n` +
    `  <metadata>\n` +
    `    <schema>ADL SCORM</schema>\n` +
    `    <schemaversion>1.2</schemaversion>\n` +
    `  </metadata>\n` +
    `  <organizations default="organizacion">\n` +
    `    <organization identifier="organizacion">\n` +
    `      <title>${title}</title>\n` +
    `      <item identifier="temario" identifierref="contenido" isvisible="true">\n` +
    `        <title>${title} (${version})</title>\n` +
    `      </item>\n` +
    `    </organization>\n` +
    `  </organizations>\n` +
    `  <resources>\n` +
    `    <resource identifier="contenido" type="webcontent" adlcp:scormtype="sco" href="${ENTRY}">\n` +
    `      <file href="${ENTRY}"/>\n` +
    `      <file href="${SCRIPT}"/>\n` +
    `      <file href="${STYLE}"/>\n` +
    `    </resource>\n` +
    `  </resources>\n` +
    `</manifest>\n`
  );
}

// Fecha fija de las entradas. Se construye en hora local porque el formato
// ZIP guarda la hora local: así los bytes no dependen de la zona horaria.
const ENTRY_DATE = new Date(2000, 0, 1, 0, 0, 0);

export function buildPackage(
  source: PackageSource,
  assets: PackageAssets,
): BuildResult {
  if (source.snapshot.topics.length > MAX_TOPICS) {
    return { ok: false, reason: "too_many_topics" };
  }
  const options = { mtime: ENTRY_DATE, level: 9 } as const;
  const zip = zipSync({
    [MANIFEST_NAME]: [strToU8(buildManifest(source)), options],
    [ENTRY]: [strToU8(packageDocument(source)), options],
    [SCRIPT]: [strToU8(assets.script), options],
    [STYLE]: [strToU8(assets.style), options],
  });
  return {
    ok: true,
    built: { zip, sha256: createHash("sha256").update(zip).digest("hex") },
  };
}
