// Instalador de herramientas (T047; research.md, R11 y R13).
//
// Ejecuta el `scripts/tools/install-tools.mjs` real como proceso hijo, en un
// directorio temporal con un `tools.lock.json` sintético, contra un servidor
// HTTPS local en 127.0.0.1. El certificado del servidor se genera con
// `openssl` en cada ejecución y el hijo solo confía en él mediante
// `NODE_EXTRA_CA_CERTS`, el mecanismo estándar de Node.js: el instalador no
// tiene ninguna vía de prueba. El hijo carga además el bloqueo de red de las
// pruebas, así que solo puede conectar con 127.0.0.1.
//
// Los archivos son sintéticos, creados con `tar`, y los binarios son texto:
// ninguno se ejecuta. Las comprobaciones son observables: código de salida,
// mensajes, ficheros publicados, temporales y peticiones recibidas.
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateRawSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const INSTALLER = path.join(repoRoot, "scripts/tools/install-tools.mjs");
const NO_NETWORK = pathToFileURL(
  path.join(repoRoot, "tests/setup/no-network.ts"),
).href;
const TOOLS = ["gitleaks", "zizmor"] as const;
const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"];
const TIMEOUT_MS = 30_000;

type Tool = (typeof TOOLS)[number];

interface Entry {
  readonly url: string;
  readonly archiveSha256: string;
  readonly member: string;
  readonly binarySha256: string;
}

interface Result {
  readonly code: number | string | null;
  readonly stdout: string;
  readonly stderr: string;
}

type Route = (res: ServerResponse) => void;

let root = "";
let certificate = "";
let server: Server | undefined;
let baseUrl = "";
const routes = new Map<string, Route>();
const received: { url: string; authorization: string | undefined }[] = [];

const sha256 = (data: Buffer | string): string =>
  createHash("sha256").update(data).digest("hex");

const content = (tool: Tool): Buffer =>
  Buffer.from(`binario sintético de ${tool}\n`);

// Crea un `.tar.gz` con `tar` a partir de un directorio preparado. Cada
// elemento de `layers` se añade en orden, lo que permite repetir un nombre.
function archive(
  layers: readonly ((staging: string) => readonly string[])[],
): Buffer {
  const dir = mkdtempSync(path.join(root, "archive-"));
  const tarFile = path.join(dir, "archive.tar");
  // Sin metadatos de macOS (`._*`) en el tar de BSD; GNU tar lo ignora.
  const env = { ...process.env, COPYFILE_DISABLE: "1" };
  for (const [index, layer] of layers.entries()) {
    const staging = path.join(dir, `staging-${String(index)}`);
    mkdirSync(staging);
    const names = layer(staging);
    execFileSync(
      "tar",
      [index === 0 ? "-cf" : "-rf", tarFile, "-C", staging, ...names],
      { env },
    );
  }
  const data = gzipSync(readFileSync(tarFile));
  rmSync(dir, { recursive: true, force: true });
  return data;
}

function regularArchive(tool: Tool, member: string = tool): Buffer {
  return archive([
    (staging) => {
      writeFileSync(path.join(staging, "LICENSE"), "licencia sintética\n");
      mkdirSync(path.dirname(path.join(staging, member)), { recursive: true });
      writeFileSync(path.join(staging, member), content(tool));
      return ["LICENSE", member];
    },
  ]);
}

// Publica un archivo en el servidor y devuelve su entrada del lock.
function serve(
  name: string,
  data: Buffer,
  tool: Tool,
  member: string = tool,
): Entry {
  routes.set(`/files/${name}`, (res) => {
    res.writeHead(200, { "Content-Length": String(data.length) });
    res.end(data);
  });
  return {
    url: `${baseUrl}/files/${name}`,
    archiveSha256: sha256(data),
    member,
    binarySha256: sha256(content(tool)),
  };
}

function redirect(from: string, location: string): void {
  routes.set(from, (res) => {
    res.writeHead(302, { Location: location });
    res.end();
  });
}

// --- Herramienta de varios ficheros (qpdf): archivo `.zip` sintético ---

interface BundleFile {
  readonly member: string;
  readonly path: string;
  readonly sha256: string;
  readonly executable: boolean;
}

interface BundleEntry {
  readonly url: string;
  readonly archiveSha256: string;
  readonly files: readonly BundleFile[];
}

interface ZipMember {
  readonly name: string;
  readonly data: Buffer;
  // Modo Unix; 0o120777 es un enlace simbólico.
  readonly mode?: number;
  readonly stored?: boolean;
  readonly encrypted?: boolean;
}

// Escribe un `.zip` mínimo y válido: cabeceras locales, directorio central y
// registro final, sin ZIP64.
function zip(members: readonly ZipMember[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const member of members) {
    const name = Buffer.from(member.name, "utf8");
    const stored = member.stored === true;
    const body = stored ? member.data : deflateRawSync(member.data);
    const flags = member.encrypted === true ? 1 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(crc32(member.data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(member.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(crc32(member.data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(member.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((member.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const BUNDLE_BINARY = Buffer.from("ejecutable sintético de qpdf\n");
const BUNDLE_LIBRARY = Buffer.from(
  "biblioteca sintética de qpdf\n".repeat(200),
);

const bundleFiles = (): BundleFile[] => [
  {
    member: "bin/qpdf",
    path: "bin/qpdf",
    sha256: sha256(BUNDLE_BINARY),
    executable: true,
  },
  {
    member: "lib/libqpdf.1.2.so",
    path: "lib/libqpdf.so",
    sha256: sha256(BUNDLE_LIBRARY),
    executable: false,
  },
];

const regularZip = (): Buffer =>
  zip([
    { name: "bin/", data: Buffer.alloc(0), mode: 0o040755, stored: true },
    { name: "bin/qpdf", data: BUNDLE_BINARY, mode: 0o100755 },
    { name: "bin/otro", data: Buffer.from("no se instala\n") },
    { name: "lib/libqpdf.1.2.so", data: BUNDLE_LIBRARY },
    {
      name: "lib/libqpdf.so",
      data: Buffer.from("libqpdf.1.2.so"),
      mode: 0o120777,
      stored: true,
    },
  ]);

function serveBundle(
  name: string,
  data: Buffer,
  files: readonly BundleFile[] = bundleFiles(),
): BundleEntry {
  routes.set(`/files/${name}`, (res) => {
    res.writeHead(200, { "Content-Length": String(data.length) });
    res.end(data);
  });
  return {
    url: `${baseUrl}/files/${name}`,
    archiveSha256: sha256(data),
    files,
  };
}

let goodBundle: BundleEntry = { url: "", archiveSha256: "", files: [] };

const bundlePath = (dir: string, relative: string): string =>
  path.join(dir, ".tools/qpdf", relative);

const good: Record<Tool, Entry> = {
  gitleaks: { url: "", archiveSha256: "", member: "", binarySha256: "" },
  zizmor: { url: "", archiveSha256: "", member: "", binarySha256: "" },
};

function lockWith(
  entries: Partial<Record<Tool, Entry>> = {},
  platforms: readonly string[] = PLATFORMS,
  bundle: object = goodBundle,
): object {
  const tool = (name: Tool, source: string): object => ({
    version: name === "gitleaks" ? "8.30.1" : "1.30.1",
    archiveSha256Source: source,
    platforms: Object.fromEntries(
      platforms.map((platform) => [platform, entries[name] ?? good[name]]),
    ),
  });
  return {
    schemaVersion: 1,
    tools: {
      gitleaks: tool("gitleaks", "release-checksums-file"),
      zizmor: tool("zizmor", "github-asset-digest"),
      qpdf: {
        version: "12.4.2",
        archiveSha256Source: "release-checksums-file",
        platforms: Object.fromEntries(
          platforms.map((platform) => [platform, bundle]),
        ),
      },
    },
  };
}

function workspace(lock: object | string): string {
  const dir = mkdtempSync(path.join(root, "workspace-"));
  const tools = path.join(dir, "scripts/tools");
  mkdirSync(tools, { recursive: true });
  cpSync(INSTALLER, path.join(tools, "install-tools.mjs"));
  writeFileSync(
    path.join(tools, "tools.lock.json"),
    typeof lock === "string" ? lock : JSON.stringify(lock),
  );
  return dir;
}

function run(
  dir: string,
  { trusted = true, preload = [] as readonly string[] } = {},
): Promise<Result> {
  // Entorno construido desde cero, sin `NODE_ENV`.
  const env: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    // Tokens sintéticos: el instalador no debe leerlos ni enviarlos.
    GITHUB_TOKEN: "token-sintetico-de-prueba",
    GH_TOKEN: "token-sintetico-de-prueba",
  };
  if (trusted) {
    env.NODE_EXTRA_CA_CERTS = certificate;
  }
  const args = [
    "--import",
    NO_NETWORK,
    ...preload.flatMap((module) => ["--import", module]),
    "scripts/tools/install-tools.mjs",
  ];
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      args,
      {
        cwd: dir,
        env: env as NodeJS.ProcessEnv,
        timeout: TIMEOUT_MS,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        resolve({
          code: error === null ? 0 : (error.code ?? null),
          stdout,
          stderr,
        });
      },
    );
  });
}

const binPath = (dir: string, tool: Tool): string =>
  path.join(dir, ".tools/bin", tool);

function published(dir: string): string[] {
  const bin = path.join(dir, ".tools/bin");
  return existsSync(bin) ? readdirSync(bin).sort() : [];
}

// Tras cualquier ejecución, `.tools` solo puede contener `bin` y `qpdf`:
// ningún temporal sobrevive.
function expectNoTemporaries(dir: string): void {
  const tools = path.join(dir, ".tools");
  const entries = existsSync(tools) ? readdirSync(tools) : [];
  expect(
    entries.filter((entry) => entry !== "bin" && entry !== "qpdf"),
  ).toEqual([]);
}

function expectFailure(result: Result, message: string): void {
  expect(result.code).toBe(1);
  expect(result.stderr).toContain(message);
  expect(result.stderr).toContain("No se completó la instalación.");
  expect(result.stderr).not.toContain(root);
  expect(result.stderr).not.toContain("CUERPO-REMOTO");
}

// Contenido de un árbol, sin seguir enlaces: ruta relativa, tipo y contenido
// de ficheros o destino de enlaces.
function snapshot(dir: string): string[] {
  const entries: string[] = [];
  const walk = (relative: string): void => {
    for (const name of readdirSync(path.join(dir, relative)).sort()) {
      const child = path.join(relative, name);
      const full = path.join(dir, child);
      const stats = lstatSync(full);
      if (stats.isSymbolicLink()) {
        entries.push(`enlace ${child} -> ${readlinkSync(full)}`);
      } else if (stats.isDirectory()) {
        entries.push(`directorio ${child}`);
        walk(child);
      } else {
        entries.push(`fichero ${child} ${sha256(readFileSync(full))}`);
      }
    }
  };
  walk("");
  return entries;
}

function requestsDuring(): () => number {
  const start = received.length;
  return () => received.length - start;
}

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "aulanorma-install-tools-"));
  const key = path.join(root, "key.pem");
  certificate = path.join(root, "certificate.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-keyout",
      key,
      "-out",
      certificate,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  const tls = { key: readFileSync(key), cert: readFileSync(certificate) };
  const listening = createServer(
    tls,
    (req: IncomingMessage, res: ServerResponse) => {
      received.push({
        url: req.url ?? "",
        authorization: req.headers.authorization,
      });
      const route = routes.get(req.url ?? "");
      if (route === undefined) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("CUERPO-REMOTO que no debe mostrarse");
      } else {
        route(res);
      }
    },
  );
  server = listening;
  await new Promise<void>((resolve) => {
    listening.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `https://127.0.0.1:${String((listening.address() as AddressInfo).port)}`;
  for (const tool of TOOLS) {
    good[tool] = serve(`${tool}.tar.gz`, regularArchive(tool), tool);
  }
  goodBundle = serveBundle("qpdf.zip", regularZip());
});

afterAll(async () => {
  const listening = server;
  if (listening !== undefined) {
    listening.closeAllConnections();
    await new Promise((resolve) => listening.close(resolve));
  }
  if (root !== "") {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("instalación verificada", () => {
  test(
    "instala las herramientas con permisos de ejecución y sin temporales",
    async () => {
      const dir = workspace(lockWith());
      const start = received.length;
      const result = await run(dir);

      expect(result.code).toBe(0);
      expect(result.stdout).toBe(
        "gitleaks 8.30.1: instalado y verificado en .tools/bin/gitleaks.\n" +
          "zizmor 1.30.1: instalado y verificado en .tools/bin/zizmor.\n" +
          "qpdf 12.4.2: instalado y verificado en .tools/qpdf.\n",
      );
      expect(published(dir)).toEqual(["gitleaks", "zizmor"]);
      expect(
        snapshot(path.join(dir, ".tools/qpdf")).map((entry) =>
          entry.replace(/ [0-9a-f]{64}$/, ""),
        ),
      ).toEqual([
        "directorio bin",
        "fichero bin/qpdf",
        "directorio lib",
        "fichero lib/libqpdf.so",
      ]);
      expect(readFileSync(bundlePath(dir, "bin/qpdf"))).toEqual(BUNDLE_BINARY);
      expect(readFileSync(bundlePath(dir, "lib/libqpdf.so"))).toEqual(
        BUNDLE_LIBRARY,
      );
      expect(statSync(bundlePath(dir, "bin/qpdf")).mode & 0o777).toBe(0o755);
      expect(statSync(bundlePath(dir, "lib/libqpdf.so")).mode & 0o777).toBe(
        0o644,
      );
      for (const tool of TOOLS) {
        expect(readFileSync(binPath(dir, tool))).toEqual(content(tool));
        expect(statSync(binPath(dir, tool)).mode & 0o777).toBe(0o755);
      }
      expectNoTemporaries(dir);
      // Tres descargas y ninguna con `Authorization`, aunque el entorno del
      // proceso tiene tokens.
      const requests = received.slice(start);
      expect(requests.map((request) => request.url)).toEqual([
        "/files/gitleaks.tar.gz",
        "/files/zizmor.tar.gz",
        "/files/qpdf.zip",
      ]);
      expect(requests.map((request) => request.authorization)).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "sigue redirecciones HTTPS hasta el archivo",
    async () => {
      redirect("/redirect/gitleaks", good.gitleaks.url);
      const dir = workspace(
        lockWith({
          gitleaks: { ...good.gitleaks, url: `${baseUrl}/redirect/gitleaks` },
        }),
      );
      const result = await run(dir);

      expect(result.code).toBe(0);
      expect(readFileSync(binPath(dir, "gitleaks"))).toEqual(
        content("gitleaks"),
      );
    },
    TIMEOUT_MS,
  );

  test(
    "acepta un miembro dentro de un directorio del archivo",
    async () => {
      const nested = serve(
        "nested.tar.gz",
        regularArchive("gitleaks", "dist/gitleaks"),
        "gitleaks",
        "dist/gitleaks",
      );
      const dir = workspace(lockWith({ gitleaks: nested }));
      const result = await run(dir);

      expect(result.code).toBe(0);
      expect(readFileSync(binPath(dir, "gitleaks"))).toEqual(
        content("gitleaks"),
      );
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );
});

describe("idempotencia y reparación", () => {
  test(
    "una segunda ejecución con binarios verificados no descarga nada",
    async () => {
      const dir = workspace(lockWith());
      expect((await run(dir)).code).toBe(0);
      const before = TOOLS.map((tool) => statSync(binPath(dir, tool)).ino);
      const requests = requestsDuring();
      const result = await run(dir);

      expect(result.code).toBe(0);
      expect(result.stdout).toBe(
        "gitleaks 8.30.1: ya instalado y verificado en .tools/bin/gitleaks.\n" +
          "zizmor 1.30.1: ya instalado y verificado en .tools/bin/zizmor.\n" +
          "qpdf 12.4.2: ya instalado y verificado en .tools/qpdf.\n",
      );
      expect(requests()).toBe(0);
      expect(TOOLS.map((tool) => statSync(binPath(dir, tool)).ino)).toEqual(
        before,
      );
    },
    TIMEOUT_MS,
  );

  test(
    "repara un binario alterado desde el archivo verificado",
    async () => {
      const dir = workspace(lockWith());
      expect((await run(dir)).code).toBe(0);
      appendFileSync(binPath(dir, "gitleaks"), "alterado");
      const requests = requestsDuring();
      const result = await run(dir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(
        "gitleaks 8.30.1: el binario instalado no coincide con tools.lock.json; se retira y se reinstala.",
      );
      expect(readFileSync(binPath(dir, "gitleaks"))).toEqual(
        content("gitleaks"),
      );
      expect(requests()).toBe(1);
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );

  test(
    "sustituye un enlace simbólico en lugar del binario",
    async () => {
      const dir = workspace(lockWith());
      mkdirSync(path.join(dir, ".tools/bin"), { recursive: true });
      const outside = path.join(dir, "fuera");
      writeFileSync(outside, content("gitleaks"));
      symlinkSync(outside, binPath(dir, "gitleaks"));
      const result = await run(dir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("se retira y se reinstala");
      expect(statSync(binPath(dir, "gitleaks")).isFile()).toBe(true);
      expect(readFileSync(outside)).toEqual(content("gitleaks"));
    },
    TIMEOUT_MS,
  );

  test(
    "si la reparación falla, retira el binario alterado y termina con error",
    async () => {
      const dir = workspace(lockWith());
      expect((await run(dir)).code).toBe(0);
      appendFileSync(binPath(dir, "gitleaks"), "alterado");
      writeFileSync(
        path.join(dir, "scripts/tools/tools.lock.json"),
        JSON.stringify(
          lockWith({
            gitleaks: { ...good.gitleaks, url: `${baseUrl}/ausente` },
          }),
        ),
      );
      const result = await run(dir);

      expectFailure(result, "gitleaks 8.30.1: la descarga falló con HTTP 404.");
      expect(published(dir)).toEqual(["zizmor"]);
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );
});

describe("verificación de hashes", () => {
  test(
    "rechaza un archivo cuyo SHA-256 no coincide y no publica nada",
    async () => {
      const dir = workspace(
        lockWith({
          gitleaks: { ...good.gitleaks, archiveSha256: sha256("otro") },
        }),
      );
      const result = await run(dir);

      expectFailure(
        result,
        "gitleaks 8.30.1: el SHA-256 del archivo no coincide con tools.lock.json.",
      );
      expect(published(dir)).toEqual([]);
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );

  test(
    "rechaza un binario extraído cuyo SHA-256 no coincide y no lo publica",
    async () => {
      const dir = workspace(
        lockWith({ zizmor: { ...good.zizmor, binarySha256: sha256("otro") } }),
      );
      const result = await run(dir);

      expectFailure(
        result,
        "zizmor 1.30.1: el SHA-256 del binario extraído no coincide con tools.lock.json.",
      );
      expect(published(dir)).toEqual(["gitleaks"]);
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );
});

describe("lock y plataforma", () => {
  const invalidLocks: readonly (readonly [string, () => object | string])[] = [
    ["no es JSON", () => "{"],
    [
      "versión de esquema distinta",
      () => ({ ...lockWith(), schemaVersion: 2 }),
    ],
    [
      "falta una herramienta",
      () => ({ schemaVersion: 1, tools: { gitleaks: {} } }),
    ],
    ["clave desconocida", () => ({ ...lockWith(), extra: true })],
    [
      "URL HTTP",
      () =>
        lockWith({ gitleaks: { ...good.gitleaks, url: "http://127.0.0.1/x" } }),
    ],
    [
      "SHA-256 mal formado",
      () => lockWith({ gitleaks: { ...good.gitleaks, archiveSha256: "abc" } }),
    ],
    [
      "miembro con ..",
      () => lockWith({ gitleaks: { ...good.gitleaks, member: "../gitleaks" } }),
    ],
    [
      "miembro absoluto",
      () => lockWith({ gitleaks: { ...good.gitleaks, member: "/gitleaks" } }),
    ],
    [
      "miembro con forma de opción",
      () => lockWith({ gitleaks: { ...good.gitleaks, member: "-gitleaks" } }),
    ],
    ["falta una plataforma", () => lockWith({}, PLATFORMS.slice(0, 3))],
    ...["gitl*aks", "gitleaks?", "[g]itleaks"].map(
      (member) =>
        [
          `miembro con comodín ${member}`,
          () => lockWith({ gitleaks: { ...good.gitleaks, member } }),
        ] as const,
    ),
  ];

  test.each(invalidLocks)(
    "rechaza un lock inválido (%s) antes de descargar",
    async (_name, build) => {
      const dir = workspace(build());
      const requests = requestsDuring();
      const result = await run(dir);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(
        /^(No se pudo leer tools\.lock\.json como JSON\.|tools\.lock\.json no tiene la estructura esperada\.)\nNo se completó la instalación\.\n$/,
      );
      expect(requests()).toBe(0);
      expect(existsSync(path.join(dir, ".tools"))).toBe(false);
    },
    TIMEOUT_MS,
  );

  test(
    "rechaza una plataforma no admitida antes de descargar",
    async () => {
      const dir = workspace(lockWith());
      const requests = requestsDuring();
      const result = await run(dir, {
        preload: [
          'data:text/javascript,Object.defineProperty(process,"platform",{value:"win32"});Object.defineProperty(process,"arch",{value:"ia32"})',
        ],
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toBe(
        "Plataforma no admitida: win32-ia32. Admitidas: darwin-arm64, darwin-x64, linux-x64, linux-arm64.\n" +
          "No se completó la instalación.\n",
      );
      expect(requests()).toBe(0);
      expect(existsSync(path.join(dir, ".tools"))).toBe(false);
    },
    TIMEOUT_MS,
  );
});

describe("transporte", () => {
  test(
    "una descarga fallida no muestra la respuesta remota",
    async () => {
      const dir = workspace(
        lockWith({ gitleaks: { ...good.gitleaks, url: `${baseUrl}/ausente` } }),
      );
      const result = await run(dir);

      expectFailure(result, "gitleaks 8.30.1: la descarga falló con HTTP 404.");
      expect(published(dir)).toEqual([]);
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );

  test(
    "una conexión rechazada falla sin publicar nada",
    async () => {
      const closed = createServer();
      await new Promise<void>((resolve) => {
        closed.listen(0, "127.0.0.1", resolve);
      });
      const port = (closed.address() as AddressInfo).port;
      await new Promise((resolve) => closed.close(resolve));
      const dir = workspace(
        lockWith({
          gitleaks: {
            ...good.gitleaks,
            url: `https://127.0.0.1:${String(port)}/x`,
          },
        }),
      );
      const result = await run(dir);

      expectFailure(result, "gitleaks 8.30.1: la descarga falló.");
      expect(published(dir)).toEqual([]);
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );

  test(
    "rechaza un certificado en el que no confía",
    async () => {
      const dir = workspace(lockWith());
      const result = await run(dir, { trusted: false });

      expectFailure(result, "gitleaks 8.30.1: la descarga falló.");
      expect(published(dir)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "rechaza una redirección a HTTP sin seguirla",
    async () => {
      redirect("/redirect/http", `http://127.0.0.1:1/gitleaks.tar.gz`);
      const dir = workspace(
        lockWith({
          gitleaks: { ...good.gitleaks, url: `${baseUrl}/redirect/http` },
        }),
      );
      const requests = requestsDuring();
      const result = await run(dir);

      expectFailure(
        result,
        "gitleaks 8.30.1: la descarga recibió una redirección no HTTPS.",
      );
      expect(requests()).toBe(1);
      expect(published(dir)).toEqual([]);
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );

  test(
    "limita el número de redirecciones",
    async () => {
      redirect("/redirect/loop", `${baseUrl}/redirect/loop`);
      const dir = workspace(
        lockWith({
          gitleaks: { ...good.gitleaks, url: `${baseUrl}/redirect/loop` },
        }),
      );
      const requests = requestsDuring();
      const result = await run(dir);

      expectFailure(
        result,
        "gitleaks 8.30.1: la descarga superó el número de redirecciones.",
      );
      expect(requests()).toBe(6);
      expect(published(dir)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "rechaza un archivo que declara un tamaño excesivo",
    async () => {
      routes.set("/huge", (res) => {
        res.writeHead(200, { "Content-Length": String(1024 * 1024 * 1024) });
        res.write("x");
      });
      const dir = workspace(
        lockWith({ gitleaks: { ...good.gitleaks, url: `${baseUrl}/huge` } }),
      );
      const result = await run(dir);

      expectFailure(
        result,
        "gitleaks 8.30.1: el archivo supera el tamaño máximo admitido.",
      );
      expect(published(dir)).toEqual([]);
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );
});

describe("directorios de instalación", () => {
  // Directorio exterior con un `gitleaks` alterado y un centinela, que el
  // instalador no debe tocar.
  function outsideDirectory(): string {
    const outside = mkdtempSync(path.join(root, "outside-"));
    writeFileSync(path.join(outside, "gitleaks"), "gitleaks alterado\n");
    writeFileSync(path.join(outside, "centinela"), "centinela\n");
    return outside;
  }

  const links: readonly (readonly [string, string])[] = [
    [".tools", ".tools"],
    [".tools/bin", ".tools/bin"],
  ];

  test.each(links)(
    "rechaza %s como enlace simbólico sin seguirlo ni modificarlo",
    async (_name, relative) => {
      const dir = workspace(lockWith());
      const outside = outsideDirectory();
      const link = path.join(dir, relative);
      mkdirSync(path.dirname(link), { recursive: true });
      symlinkSync(outside, link);
      const before = snapshot(outside);
      const workspaceBefore = snapshot(dir);
      const requests = requestsDuring();
      const result = await run(dir);

      expect(result.code).toBe(1);
      expect(result.stderr).toBe(
        ".tools o .tools/bin no es un directorio real.\n" +
          "No se completó la instalación.\n",
      );
      expect(requests()).toBe(0);
      expect(readlinkSync(link)).toBe(outside);
      expect(snapshot(outside)).toEqual(before);
      expect(snapshot(dir)).toEqual(workspaceBefore);
    },
    TIMEOUT_MS,
  );

  test(
    "falla sin borrar un directorio que ocupa el destino del binario",
    async () => {
      const dir = workspace(lockWith());
      const occupied = binPath(dir, "gitleaks");
      mkdirSync(path.join(occupied, "dentro"), { recursive: true });
      writeFileSync(path.join(occupied, "dentro/centinela"), "centinela\n");
      const before = snapshot(dir);
      const requests = requestsDuring();
      const result = await run(dir);

      expectFailure(
        result,
        "gitleaks 8.30.1: el destino de instalación es un directorio y no se retira.",
      );
      expect(requests()).toBe(0);
      expect(snapshot(dir)).toEqual(before);
    },
    TIMEOUT_MS,
  );
});

describe("extracción segura", () => {
  const unsafe: readonly (readonly [string, () => Buffer, string])[] = [
    [
      "el miembro es un enlace simbólico",
      () =>
        archive([
          (staging) => {
            writeFileSync(path.join(staging, "real"), content("gitleaks"));
            symlinkSync("real", path.join(staging, "gitleaks"));
            return ["gitleaks"];
          },
        ]),
      "el miembro extraído no es un fichero regular",
    ],
    [
      "el miembro es un directorio",
      () =>
        archive([
          (staging) => {
            mkdirSync(path.join(staging, "gitleaks"));
            writeFileSync(
              path.join(staging, "gitleaks/dentro"),
              content("gitleaks"),
            );
            return ["gitleaks"];
          },
        ]),
      // `tar` lista el directorio como `gitleaks/`, distinto del miembro.
      "el archivo no contiene exactamente un miembro con esa ruta",
    ],
    [
      "falta el miembro",
      () =>
        archive([
          (staging) => {
            writeFileSync(path.join(staging, "otro"), content("gitleaks"));
            return ["otro"];
          },
        ]),
      "el archivo no contiene exactamente un miembro con esa ruta",
    ],
    [
      "el miembro aparece dos veces",
      () =>
        archive([
          (staging) => {
            writeFileSync(path.join(staging, "gitleaks"), content("gitleaks"));
            return ["gitleaks"];
          },
          (staging) => {
            writeFileSync(path.join(staging, "gitleaks"), "segunda copia\n");
            return ["gitleaks"];
          },
        ]),
      "el archivo no contiene exactamente un miembro con esa ruta",
    ],
  ];

  test.each(unsafe)(
    "rechaza la extracción cuando %s",
    async (name, build, message) => {
      const entry = serve(
        `unsafe-${sha256(name).slice(0, 12)}.tar.gz`,
        build(),
        "gitleaks",
      );
      const dir = workspace(lockWith({ gitleaks: entry }));
      const result = await run(dir);

      expectFailure(result, `gitleaks 8.30.1: ${message}.`);
      expect(published(dir)).toEqual([]);
      expectNoTemporaries(dir);
      expect(readdirSync(dir).sort()).toEqual([".tools", "scripts"]);
    },
    TIMEOUT_MS,
  );
});

describe("herramienta de varios ficheros", () => {
  const QPDF_INSTALLED =
    "qpdf 12.4.2: instalado y verificado en .tools/qpdf.\n";
  const QPDF_VERIFIED =
    "qpdf 12.4.2: ya instalado y verificado en .tools/qpdf.\n";
  const QPDF_REPAIRED =
    "qpdf 12.4.2: lo instalado no coincide con tools.lock.json; se retira y se reinstala.\n";

  test(
    "una segunda ejecución no descarga nada",
    async () => {
      const dir = workspace(lockWith());
      expect((await run(dir)).code).toBe(0);
      const before = snapshot(path.join(dir, ".tools"));
      const requests = requestsDuring();
      const result = await run(dir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(QPDF_VERIFIED);
      expect(requests()).toBe(0);
      expect(snapshot(path.join(dir, ".tools"))).toEqual(before);
    },
    TIMEOUT_MS,
  );

  const alterations: readonly (readonly [string, (dir: string) => void])[] = [
    [
      "un fichero alterado",
      (dir) => {
        appendFileSync(bundlePath(dir, "lib/libqpdf.so"), "alterado");
      },
    ],
    [
      "un fichero de más",
      (dir) => {
        writeFileSync(bundlePath(dir, "lib/extra.so"), "ajeno");
      },
    ],
    [
      "un fichero que falta",
      (dir) => {
        rmSync(bundlePath(dir, "bin/qpdf"));
      },
    ],
    [
      "un fichero sustituido por un enlace",
      (dir) => {
        rmSync(bundlePath(dir, "bin/qpdf"));
        symlinkSync("../lib/libqpdf.so", bundlePath(dir, "bin/qpdf"));
      },
    ],
  ];

  test.each(alterations)(
    "con %s, retira lo instalado y lo reinstala completo",
    async (_name, alter) => {
      const dir = workspace(lockWith());
      expect((await run(dir)).code).toBe(0);
      const before = snapshot(path.join(dir, ".tools"));
      alter(dir);
      const result = await run(dir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(QPDF_REPAIRED + QPDF_INSTALLED);
      expect(snapshot(path.join(dir, ".tools"))).toEqual(before);
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );

  test(
    "si .tools/qpdf es un enlace, lo retira sin seguirlo ni tocar su destino",
    async () => {
      const dir = workspace(lockWith());
      const outside = path.join(dir, "ajeno");
      mkdirSync(outside);
      writeFileSync(path.join(outside, "dato"), "no se toca");
      mkdirSync(path.join(dir, ".tools"));
      symlinkSync(outside, path.join(dir, ".tools/qpdf"));
      const result = await run(dir);

      expect(result.code).toBe(0);
      expect(lstatSync(path.join(dir, ".tools/qpdf")).isDirectory()).toBe(true);
      expect(readFileSync(bundlePath(dir, "bin/qpdf"))).toEqual(BUNDLE_BINARY);
      expect(snapshot(outside)).toEqual([
        `fichero dato ${sha256("no se toca")}`,
      ]);
    },
    TIMEOUT_MS,
  );

  const rejected: readonly (readonly [string, () => BundleEntry, string])[] = [
    [
      "el archivo no coincide con su hash",
      () => ({ ...goodBundle, archiveSha256: sha256("otro") }),
      "qpdf 12.4.2: el SHA-256 del archivo no coincide con tools.lock.json.",
    ],
    [
      "un fichero extraído no coincide con su hash",
      () =>
        serveBundle(
          "qpdf-hash.zip",
          regularZip(),
          bundleFiles().map((file, index) =>
            index === 1 ? { ...file, sha256: sha256("otro") } : file,
          ),
        ),
      "qpdf 12.4.2: el SHA-256 de un fichero extraído no coincide con tools.lock.json.",
    ],
    [
      "falta un miembro",
      () =>
        serveBundle(
          "qpdf-missing.zip",
          zip([{ name: "bin/qpdf", data: BUNDLE_BINARY }]),
        ),
      "qpdf 12.4.2: el archivo no contiene un miembro esperado.",
    ],
    [
      "un miembro está repetido",
      () =>
        serveBundle(
          "qpdf-repeated.zip",
          zip([
            { name: "bin/qpdf", data: BUNDLE_BINARY },
            { name: "bin/qpdf", data: BUNDLE_BINARY },
            { name: "lib/libqpdf.1.2.so", data: BUNDLE_LIBRARY },
          ]),
        ),
      "qpdf 12.4.2: el archivo contiene un miembro repetido con esa ruta.",
    ],
    [
      "un miembro es un enlace simbólico",
      () =>
        serveBundle(
          "qpdf-link.zip",
          zip([
            { name: "bin/qpdf", data: BUNDLE_BINARY, mode: 0o120777 },
            { name: "lib/libqpdf.1.2.so", data: BUNDLE_LIBRARY },
          ]),
        ),
      "qpdf 12.4.2: un miembro del archivo no es un fichero admitido.",
    ],
    [
      "un miembro está cifrado",
      () =>
        serveBundle(
          "qpdf-encrypted.zip",
          zip([
            { name: "bin/qpdf", data: BUNDLE_BINARY, encrypted: true },
            { name: "lib/libqpdf.1.2.so", data: BUNDLE_LIBRARY },
          ]),
        ),
      "qpdf 12.4.2: un miembro del archivo no es un fichero admitido.",
    ],
    [
      "el archivo no es un .zip",
      () =>
        serveBundle("qpdf-not-zip.zip", Buffer.from("no es un zip".repeat(8))),
      "qpdf 12.4.2: el archivo .zip no es válido.",
    ],
    [
      "el contenido de un miembro está dañado",
      () => {
        const data = regularZip();
        const at = data.indexOf(deflateRawSync(BUNDLE_LIBRARY));
        data.writeUInt8(data.readUInt8(at + 4) ^ 0xff, at + 4);
        return serveBundle("qpdf-damaged.zip", data);
      },
      "qpdf 12.4.2: el archivo .zip no es válido.",
    ],
  ];

  test.each(rejected)(
    "falla cerrado si %s, sin publicar nada de qpdf",
    async (_name, build, message) => {
      const dir = workspace(lockWith({}, PLATFORMS, build()));
      const result = await run(dir);

      expectFailure(result, message);
      expect(existsSync(path.join(dir, ".tools/qpdf"))).toBe(false);
      expectNoTemporaries(dir);
    },
    TIMEOUT_MS,
  );

  const invalidBundles: readonly (readonly [string, () => object])[] = [
    ["sin ficheros", () => ({ ...goodBundle, files: [] })],
    [
      "ruta de instalación con ..",
      () => ({
        ...goodBundle,
        files: [{ ...bundleFiles()[0], path: "../bin/qpdf" }],
      }),
    ],
    [
      "miembro absoluto",
      () => ({
        ...goodBundle,
        files: [{ ...bundleFiles()[0], member: "/bin/qpdf" }],
      }),
    ],
    [
      "dos ficheros con la misma ruta de instalación",
      () => ({
        ...goodBundle,
        files: bundleFiles().map((file) => ({ ...file, path: "bin/qpdf" })),
      }),
    ],
    [
      "clave desconocida en un fichero",
      () => ({
        ...goodBundle,
        files: [{ ...bundleFiles()[0], extra: true }],
      }),
    ],
    [
      "hash mal formado",
      () => ({
        ...goodBundle,
        files: [{ ...bundleFiles()[0], sha256: "abc" }],
      }),
    ],
    [
      "executable que no es booleano",
      () => ({
        ...goodBundle,
        files: [{ ...bundleFiles()[0], executable: "sí" }],
      }),
    ],
    ["URL HTTP", () => ({ ...goodBundle, url: "http://127.0.0.1/x" })],
    ["forma de herramienta de un solo binario", () => good.gitleaks],
  ];

  test.each(invalidBundles)(
    "rechaza un lock inválido (%s) antes de descargar",
    async (_name, build) => {
      const dir = workspace(lockWith({}, PLATFORMS, build()));
      const requests = requestsDuring();
      const result = await run(dir);

      expect(result.code).toBe(1);
      expect(result.stderr).toBe(
        "tools.lock.json no tiene la estructura esperada.\nNo se completó la instalación.\n",
      );
      expect(requests()).toBe(0);
      expect(existsSync(path.join(dir, ".tools"))).toBe(false);
    },
    TIMEOUT_MS,
  );
});
