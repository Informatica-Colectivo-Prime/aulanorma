// Verificación compartida de las herramientas binarias instaladas por
// `npm run tools:install` (FR-014; research.md, R11 y R13; ADR 0002). La usan
// `check:secrets` y `check:workflows`. Node.js sin dependencias.
//
// `copyVerifiedTool` lee `.tools/bin/<herramienta>` sin seguir enlaces
// simbólicos, exige un fichero regular dentro de `.tools` y `.tools/bin`
// reales, comprueba su SHA-256 contra el `binarySha256` que
// `scripts/tools/tools.lock.json` fija para la plataforma actual y escribe esos
// mismos bytes, con permisos de ejecución, en el destino indicado, que es lo
// que se ejecuta. No escribe en ningún otro sitio.
//
// Los errores son `ToolError`, con mensajes aptos para mostrarse: sin rutas
// absolutas ni contenido de ficheros.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"];
const SHA256 = /^[0-9a-f]{64}$/;
const TOOL_NAME = /^[a-z][a-z0-9-]*$/;

export class ToolError extends Error {}

export function currentPlatform() {
  const platform = `${process.platform}-${process.arch}`;
  if (!PLATFORMS.includes(platform)) {
    throw new ToolError(`Plataforma no admitida: ${platform}.`);
  }
  return platform;
}

async function expectedHash(root, name, label, platform) {
  let lock;
  try {
    lock = JSON.parse(
      await readFile(path.join(root, "scripts/tools/tools.lock.json"), "utf8"),
    );
  } catch {
    throw new ToolError(
      "No se pudo leer scripts/tools/tools.lock.json como JSON.",
    );
  }
  const entry = lock?.tools?.[name]?.platforms?.[platform];
  if (
    lock?.schemaVersion !== 1 ||
    typeof entry?.binarySha256 !== "string" ||
    !SHA256.test(entry.binarySha256)
  ) {
    throw new ToolError(
      `tools.lock.json no fija el SHA-256 de ${label} para ${platform}.`,
    );
  }
  return entry.binarySha256;
}

// Copia en `destination`, que no debe existir, los bytes verificados de
// `<root>/.tools/bin/<name>`. `label` es el nombre que muestran los mensajes.
export async function copyVerifiedTool({ root, name, label, destination }) {
  if (!TOOL_NAME.test(name)) {
    throw new ToolError("Nombre de herramienta no válido.");
  }
  const platform = currentPlatform();
  const expected = await expectedHash(root, name, label, platform);
  const toolsDir = path.join(root, ".tools");
  const binDir = path.join(toolsDir, "bin");
  const missing = `Falta .tools/bin/${name} o no es un fichero regular: ejecuta npm run tools:install.`;
  for (const directory of [toolsDir, binDir]) {
    let stats;
    try {
      stats = await lstat(directory);
    } catch {
      throw new ToolError(missing);
    }
    if (!stats.isDirectory()) {
      throw new ToolError(".tools o .tools/bin no es un directorio real.");
    }
  }
  let handle;
  try {
    handle = await open(
      path.join(binDir, name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch {
    throw new ToolError(missing);
  }
  let data;
  try {
    if (!(await handle.stat()).isFile()) {
      throw new ToolError(missing);
    }
    data = await handle.readFile();
  } finally {
    await handle.close();
  }
  if (createHash("sha256").update(data).digest("hex") !== expected) {
    throw new ToolError(
      `El SHA-256 de .tools/bin/${name} no coincide con tools.lock.json: ejecuta npm run tools:install.`,
    );
  }
  await writeFile(destination, data, { mode: 0o700, flag: "wx" });
  await chmod(destination, 0o700);
}
