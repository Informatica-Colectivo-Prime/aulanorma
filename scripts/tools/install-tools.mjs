// Instalador de Gitleaks y zizmor (`npm run tools:install`; research.md, R11
// y R13; ADR 0002). Node.js sin dependencias: funciona sin `npm ci` y sin
// credenciales. Además de Node.js necesita `tar` en el `PATH`, que macOS y
// Linux incluyen. Instala `.tools/bin/gitleaks` y `.tools/bin/zizmor`, que
// usan `check:secrets` y `check:workflows`.
//
// `tools.lock.json` (junto a este script) fija cada herramienta:
//
//   { "schemaVersion": 1,
//     "tools": { "<herramienta>": {
//       "version": "X.Y.Z",
//       "archiveSha256Source": "release-checksums-file" | "github-asset-digest",
//       "platforms": { "<darwin-arm64|darwin-x64|linux-x64|linux-arm64>": {
//         "url", "archiveSha256", "member", "binarySha256" } } } } }
//
// Procedencia de los valores:
// - `url`: el asset de la release oficial de cada proyecto.
// - `archiveSha256`: hash del archivo publicado. En Gitleaks procede del
//   fichero de sumas que publica el proyecto en su release
//   (`release-checksums-file`). zizmor no publica ese fichero: procede del
//   `digest` SHA-256 que GitHub publica para cada asset de la release oficial
//   (`github-asset-digest`), corroborado por el sujeto de las dos atestaciones
//   publicadas de la release. Las firmas Sigstore de esas atestaciones no se
//   han verificado criptográficamente.
// - `member`: ruta exacta del binario dentro del archivo.
// - `binarySha256`: calculado tras extraer `member` del archivo cuyo hash ya
//   se había verificado.
//
// Este instalador verifica la integridad contra los valores fijados en el
// lock; no verifica firmas ni la procedencia del proceso de compilación.
//
// Comportamiento:
// - Valida el lock completo antes de usar sus campos y termina con código 1
//   en una plataforma no admitida.
// - Antes de tocar ningún binario, crea `.tools` y `.tools/bin` de uno en uno
//   y exige que sean directorios reales: si alguno es un enlace simbólico u
//   otra entrada, termina con código 1 sin seguirlo ni modificarlo.
// - Si el binario instalado es un fichero regular cuyo hash coincide con
//   `binarySha256`, no descarga nada. Si es otro fichero o un enlace, lo
//   retira sin seguirlo antes de reinstalar, así que un binario alterado nunca
//   queda como válido. Si es un directorio, falla sin borrarlo: solo se borran
//   de forma recursiva los temporales propios.
// - Descarga solo por HTTPS, sin tokens ni `Authorization`, con redirecciones,
//   tiempo y tamaño limitados. Comprueba `archiveSha256`, extrae con `tar` solo
//   el miembro exacto en un temporal aislado dentro de `.tools`, exige un
//   fichero regular sin nada más extraído, comprueba `binarySha256` y solo
//   entonces lo publica con permisos de ejecución mediante `rename`.
// - Los temporales se eliminan siempre. Los mensajes no muestran rutas
//   absolutas ni respuestas remotas. Código 0 si todo queda verificado; 1 en
//   cualquier otro caso.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import https from "node:https";
import path from "node:path";

const LOCK_FILE = path.join(import.meta.dirname, "tools.lock.json");
const TOOLS_DIR = path.join(import.meta.dirname, "..", "..", ".tools");
const BIN_DIR = path.join(TOOLS_DIR, "bin");

const TOOLS = ["gitleaks", "zizmor"];
const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"];
const SOURCES = ["release-checksums-file", "github-asset-digest"];

const MAX_REDIRECTS = 5;
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const IDLE_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 300_000;
const TAR_TIMEOUT_MS = 60_000;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

const SHA256 = /^[0-9a-f]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;

// Error con un mensaje apto para mostrarse: sin rutas ni contenido remoto.
class InstallError extends Error {}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hasExactKeys(value, keys) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isHash(value) {
  return typeof value === "string" && SHA256.test(value);
}

function isHttpsUrl(value) {
  if (typeof value !== "string" || !URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.href === value
  );
}

// Ruta relativa sin segmentos vacíos, `.` ni `..`, sin barra inicial ni
// invertida, sin forma de opción de `tar` y sin los comodines `*`, `?` ni `[`,
// que el `tar` de BSD interpretaría como patrón.
function isSafeMember(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    !value.startsWith("-") &&
    !/[\\\0*?[]/.test(value) &&
    value
      .split("/")
      .every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

function isValidEntry(entry) {
  return (
    hasExactKeys(entry, ["url", "archiveSha256", "member", "binarySha256"]) &&
    isHttpsUrl(entry.url) &&
    isHash(entry.archiveSha256) &&
    isSafeMember(entry.member) &&
    isHash(entry.binarySha256)
  );
}

function isValidTool(tool) {
  return (
    hasExactKeys(tool, ["version", "archiveSha256Source", "platforms"]) &&
    typeof tool.version === "string" &&
    VERSION.test(tool.version) &&
    SOURCES.includes(tool.archiveSha256Source) &&
    hasExactKeys(tool.platforms, PLATFORMS) &&
    PLATFORMS.every((platform) => isValidEntry(tool.platforms[platform]))
  );
}

async function readLock() {
  let lock;
  try {
    lock = JSON.parse(await readFile(LOCK_FILE, "utf8"));
  } catch {
    throw new InstallError("No se pudo leer tools.lock.json como JSON.");
  }
  const valid =
    hasExactKeys(lock, ["schemaVersion", "tools"]) &&
    lock.schemaVersion === 1 &&
    hasExactKeys(lock.tools, TOOLS) &&
    TOOLS.every((tool) => isValidTool(lock.tools[tool]));
  if (!valid) {
    throw new InstallError("tools.lock.json no tiene la estructura esperada.");
  }
  return lock;
}

function currentPlatform() {
  const platform = `${process.platform}-${process.arch}`;
  if (!PLATFORMS.includes(platform)) {
    throw new InstallError(
      `Plataforma no admitida: ${platform}. Admitidas: ${PLATFORMS.join(", ")}.`,
    );
  }
  return platform;
}

// --- Descarga ---

function request(url, signal) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        agent: false,
        signal,
        timeout: IDLE_TIMEOUT_MS,
        headers: {
          Accept: "application/octet-stream",
          "User-Agent": "aulanorma-install-tools",
        },
      },
      resolve,
    );
    req.on("timeout", () => {
      req.destroy(new InstallError("la descarga dejó de responder"));
    });
    req.on("error", reject);
  });
}

// Guarda el cuerpo en `destination` y devuelve su SHA-256.
async function save(response, destination) {
  const hash = createHash("sha256");
  let size = 0;
  const handle = await open(destination, "wx", 0o600);
  try {
    for await (const chunk of response) {
      size += chunk.length;
      if (size > MAX_ARCHIVE_BYTES) {
        response.destroy();
        throw new InstallError("el archivo supera el tamaño máximo admitido");
      }
      hash.update(chunk);
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  if (!response.complete) {
    throw new InstallError("la descarga quedó incompleta");
  }
  return hash.digest("hex");
}

async function fetchTo(url, destination, signal) {
  let current = new URL(url);
  for (let redirects = 0; ; redirects += 1) {
    const response = await request(current, signal);
    const status = response.statusCode ?? 0;
    if (REDIRECT_STATUS.has(status)) {
      response.destroy();
      const location = response.headers.location;
      if (redirects === MAX_REDIRECTS) {
        throw new InstallError("la descarga superó el número de redirecciones");
      }
      if (location === undefined || !URL.canParse(location, current)) {
        throw new InstallError("la descarga recibió una redirección no válida");
      }
      current = new URL(location, current);
      if (current.protocol !== "https:") {
        throw new InstallError("la descarga recibió una redirección no HTTPS");
      }
      continue;
    }
    if (status !== 200) {
      response.destroy();
      throw new InstallError(`la descarga falló con HTTP ${String(status)}`);
    }
    const declared = Number(response.headers["content-length"]);
    if (declared > MAX_ARCHIVE_BYTES) {
      response.destroy();
      throw new InstallError("el archivo supera el tamaño máximo admitido");
    }
    return save(response, destination);
  }
}

async function download(url, destination) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, DOWNLOAD_TIMEOUT_MS);
  try {
    return await fetchTo(url, destination, controller.signal);
  } catch (error) {
    if (error instanceof InstallError) {
      throw error;
    }
    throw new InstallError(
      controller.signal.aborted
        ? "la descarga superó el tiempo máximo"
        : "la descarga falló",
    );
  } finally {
    clearTimeout(timer);
  }
}

// --- Extracción ---

function tar(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "tar",
      args,
      { timeout: TAR_TIMEOUT_MS, maxBuffer: 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        if (error === null) {
          resolve(stdout);
        } else if (error.code === "ENOENT") {
          reject(
            new InstallError(
              "falta tar en el PATH y el instalador lo necesita",
            ),
          );
        } else {
          reject(new InstallError("tar no pudo procesar el archivo"));
        }
      },
    );
  });
}

// Extrae solo `member` en `directory`, que debe estar vacío, y exige que el
// resultado sea exactamente esa ruta, con directorios reales intermedios y un
// fichero regular al final. Devuelve la ruta del fichero extraído.
async function extractMember(archive, member, directory) {
  const names = (await tar(["-tzf", archive])).split("\n");
  if (names.filter((name) => name === member).length !== 1) {
    throw new InstallError(
      "el archivo no contiene exactamente un miembro con esa ruta",
    );
  }
  await tar(["-xzf", archive, "-C", directory, member]);
  const segments = member.split("/");
  let current = directory;
  for (const [index, segment] of segments.entries()) {
    const entries = await readdir(current);
    if (entries.length !== 1 || entries[0] !== segment) {
      throw new InstallError("la extracción produjo entradas inesperadas");
    }
    current = path.join(current, segment);
    const stats = await lstat(current);
    const last = index === segments.length - 1;
    if (last ? !stats.isFile() : !stats.isDirectory()) {
      throw new InstallError("el miembro extraído no es un fichero regular");
    }
  }
  return current;
}

// --- Instalación ---

// Crea `directory` sin crear sus padres. Exista antes o no, exige con `lstat`
// que sea un directorio real: un enlace simbólico u otra entrada se rechaza
// sin seguirla, sustituirla ni borrarla.
async function ensureRealDirectory(directory) {
  try {
    await mkdir(directory);
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw new InstallError("No se pudo crear .tools o .tools/bin.");
    }
  }
  const stats = await lstat(directory);
  if (!stats.isDirectory()) {
    throw new InstallError(".tools o .tools/bin no es un directorio real.");
  }
}

// Estado de `target`: `verified` si es un fichero regular con el hash
// esperado, `absent` si no existe y `removed` si había un fichero distinto o
// un enlace, que se retira sin seguirlo. Un directorio no se retira.
async function checkInstalled(target, expected) {
  let stats;
  try {
    stats = await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") {
      return "absent";
    }
    throw new InstallError("no se pudo comprobar el binario instalado");
  }
  if (stats.isDirectory()) {
    throw new InstallError(
      "el destino de instalación es un directorio y no se retira",
    );
  }
  if (stats.isFile() && sha256(await readFile(target)) === expected) {
    await chmod(target, 0o755);
    return "verified";
  }
  await unlink(target);
  return "removed";
}

async function installFromArchive(entry, target) {
  const temp = await mkdtemp(path.join(TOOLS_DIR, "tmp-"));
  try {
    const archive = path.join(temp, "archive.tar.gz");
    if ((await download(entry.url, archive)) !== entry.archiveSha256) {
      throw new InstallError(
        "el SHA-256 del archivo no coincide con tools.lock.json",
      );
    }
    const extracted = path.join(temp, "extracted");
    await mkdir(extracted);
    const binary = await extractMember(archive, entry.member, extracted);
    if (sha256(await readFile(binary)) !== entry.binarySha256) {
      throw new InstallError(
        "el SHA-256 del binario extraído no coincide con tools.lock.json",
      );
    }
    await chmod(binary, 0o755);
    await rename(binary, target);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function installTool(name, version, entry) {
  const label = `${name} ${version}`;
  const shown = `.tools/bin/${name}`;
  const target = path.join(BIN_DIR, name);
  try {
    const installed = await checkInstalled(target, entry.binarySha256);
    if (installed === "verified") {
      process.stdout.write(
        `${label}: ya instalado y verificado en ${shown}.\n`,
      );
      return;
    }
    if (installed === "removed") {
      process.stdout.write(
        `${label}: el binario instalado no coincide con tools.lock.json; se retira y se reinstala.\n`,
      );
    }
    await installFromArchive(entry, target);
    process.stdout.write(`${label}: instalado y verificado en ${shown}.\n`);
  } catch (error) {
    throw new InstallError(
      `${label}: ${error instanceof InstallError ? error.message : "error inesperado durante la instalación"}.`,
    );
  }
}

async function main() {
  const lock = await readLock();
  const platform = currentPlatform();
  await ensureRealDirectory(TOOLS_DIR);
  await ensureRealDirectory(BIN_DIR);
  for (const name of TOOLS) {
    const tool = lock.tools[name];
    await installTool(name, tool.version, tool.platforms[platform]);
  }
}

try {
  await main();
} catch (error) {
  const message =
    error instanceof InstallError
      ? error.message
      : "Error inesperado durante la instalación.";
  process.stderr.write(`${message}\nNo se completó la instalación.\n`);
  process.exitCode = 1;
}
