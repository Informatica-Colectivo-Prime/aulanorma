// Tratamiento de un PDF antes de registrarlo (specs/002-boe-scorm-export:
// FR-002, FR-004, FR-064 y SC-042; research.md, R4; feasibility.md, 2.6 a
// 2.8). Son tres pasos separados, y superar uno no acredita los otros:
//
// 1. Validación del fichero: tamaño y firma `%PDF-`.
// 2. Inspección estructural: qpdf entrega la estructura interpretada y la
//    política propia (`policy.ts`) decide sobre ella. qpdf no es un antivirus
//    y su éxito no garantiza un PDF seguro.
// 3. Extracción: `pdfjs-dist` obtiene el texto de cada página.
//
// Los tres pasos externos se ejecutan en procesos hijos con el entorno vacío,
// sin acceso a la base de datos ni a la configuración, con límite de tiempo y
// de salida. Los de Node.js llevan además límite de montón y el modelo de
// permisos, que solo les deja leer su código y el fichero. Esto contiene
// bloqueos y consumo excesivo; no es un aislamiento de seguridad. La salida
// de cada uno se valida con un esquema antes de usarse. Cualquier error,
// aviso, límite excedido o resultado no comprobable acaba en rechazo, y el
// fichero nunca se modifica: su huella se comprueba al terminar.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { StructureCategory } from "./policy.ts";

export interface PdfLimits {
  readonly maxBytes: number;
  readonly maxPages: number;
}

export interface PdfEnvironment {
  // Raíz del proyecto: ahí están las herramientas verificadas, su fichero de
  // huellas y el código de los procesos hijos.
  readonly projectRoot: string;
  // Directorio privado donde se crean los temporales de cada análisis.
  readonly workDir: string;
}

export type PdfRejection =
  | "empty"
  | "too_large"
  | "not_pdf"
  | "encrypted"
  | "damaged"
  | "active_content"
  | "form_not_allowed"
  | "too_many_pages"
  | "not_verifiable";

export interface AnalyzedPage {
  readonly number: number;
  readonly text: string;
  readonly hasExtractableText: boolean;
  readonly hasImages: boolean;
}

export type PdfAnalysis =
  | {
      readonly ok: true;
      readonly sha256: string;
      readonly sizeBytes: number;
      readonly pageCount: number;
      readonly hasSignatureField: boolean;
      readonly pages: readonly AnalyzedPage[];
    }
  | {
      readonly ok: false;
      readonly reason: PdfRejection;
      // Clases de contenido activo encontradas, para explicar el rechazo.
      readonly categories: readonly StructureCategory[];
    };

const STEP_TIMEOUT_MS = 60_000;
const POLICY_HEAP_MIB = 1024;
const EXTRACTION_HEAP_MIB = 512;
const STRUCTURE_LIMIT_BYTES = 256 * 1024 * 1024;
const SMALL_OUTPUT_BYTES = 1024 * 1024;
const EXTRACTION_LIMIT_BYTES = 64 * 1024 * 1024;
const PDF_SIGNATURE = "%PDF-";
// qpdf no intenta descifrar nada con una clave dada en hexadecimal: así
// informa de si el documento está cifrado sin depender de su proveedor
// criptográfico, que en el binario de macOS no puede cargar los algoritmos
// antiguos.
const NO_KEY = "0".repeat(64);
const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"];

function rejection(
  reason: PdfRejection,
  categories: readonly StructureCategory[] = [],
): PdfAnalysis {
  return { ok: false, reason, categories };
}

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

// --- Herramienta verificada ---

const LOCK = z.object({
  schemaVersion: z.literal(1),
  tools: z.object({
    qpdf: z.object({
      platforms: z.record(
        z.string(),
        z.object({
          files: z
            .array(
              z.object({
                path: z.string().regex(/^[\w.+-]+(?:\/[\w.+-]+)*$/),
                sha256: z.string().regex(/^[0-9a-f]{64}$/),
              }),
            )
            .min(1),
        }),
      ),
    }),
  }),
});

async function listTree(directory: string, prefix = ""): Promise<string[]> {
  const names: string[] = [];
  for (const name of await readdir(directory)) {
    const stats = await lstat(path.join(directory, name));
    if (stats.isDirectory()) {
      names.push(
        ...(await listTree(path.join(directory, name), `${prefix}${name}/`)),
      );
    } else {
      names.push(`${prefix}${name}`);
    }
  }
  return names;
}

// Comprueba que `.tools/qpdf` contiene exactamente los ficheros fijados en
// `scripts/tools/tools.lock.json` para esta plataforma, regulares y con su
// huella, y devuelve la ruta del ejecutable. Si algo no coincide, no hay
// herramienta: se instala con `npm run tools:install`.
export async function verifiedQpdf(
  projectRoot: string,
): Promise<string | undefined> {
  const platform = `${process.platform}-${process.arch}`;
  if (!PLATFORMS.includes(platform)) {
    return undefined;
  }
  try {
    const lock = LOCK.parse(
      JSON.parse(
        await readFile(
          path.join(projectRoot, "scripts/tools/tools.lock.json"),
          "utf8",
        ),
      ),
    );
    const files = lock.tools.qpdf.platforms[platform]?.files;
    if (files === undefined) {
      return undefined;
    }
    const bundle = path.join(projectRoot, ".tools/qpdf");
    for (const directory of [path.join(projectRoot, ".tools"), bundle]) {
      if (!(await lstat(directory)).isDirectory()) {
        return undefined;
      }
    }
    const installed = (await listTree(bundle)).sort();
    const expected = files.map((file) => file.path).sort();
    if (JSON.stringify(installed) !== JSON.stringify(expected)) {
      return undefined;
    }
    for (const file of files) {
      const target = path.join(bundle, file.path);
      if (
        !(await lstat(target)).isFile() ||
        sha256(await readFile(target)) !== file.sha256
      ) {
        return undefined;
      }
    }
    return path.join(bundle, "bin/qpdf");
  } catch {
    return undefined;
  }
}

// --- Procesos hijos ---

interface ChildResult {
  readonly code: number | null;
  readonly stdout: Buffer;
  readonly stderr: string;
  // El proceso se interrumpió por tiempo o por exceso de salida.
  readonly interrupted: boolean;
}

interface ChildOptions {
  readonly env: Readonly<Record<string, string>>;
  readonly maxOutput: number;
  // Si se indica, la salida estándar se guarda en este fichero.
  readonly outputFile?: string;
}

function runChild(
  command: string,
  args: readonly string[],
  { env, maxOutput, outputFile }: ChildOptions,
): Promise<ChildResult> {
  return new Promise((resolve) => {
    // Entorno exacto del hijo: no hereda nada del proceso.
    const child = spawn(command, [...args], {
      env: { ...env } as unknown as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const sink =
      outputFile === undefined
        ? undefined
        : createWriteStream(outputFile, { mode: 0o600 });
    let size = 0;
    let stderr = "";
    let interrupted = false;
    let settled = false;
    const interrupt = (): void => {
      interrupted = true;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(interrupt, STEP_TIMEOUT_MS);
    const finish = (code: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const result = {
        code,
        stdout: Buffer.concat(chunks),
        stderr,
        interrupted,
      };
      if (sink === undefined) {
        resolve(result);
      } else {
        sink.end(() => {
          resolve(result);
        });
      }
    };
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxOutput) {
        interrupt();
      } else if (sink === undefined) {
        chunks.push(chunk);
      } else {
        sink.write(chunk);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 65_536) {
        stderr += chunk.toString("utf8");
      }
    });
    child.on("error", () => {
      interrupted = true;
      finish(null);
    });
    child.on("close", (code) => {
      finish(code);
    });
  });
}

// Proceso hijo de Node.js con el entorno vacío, límite de montón y el modelo
// de permisos: solo puede leer las rutas indicadas, y no puede escribir,
// lanzar procesos ni crear hilos.
function runNode(
  script: string,
  argument: string,
  heapMib: number,
  readable: readonly string[],
  maxOutput: number,
): Promise<ChildResult> {
  return runChild(
    process.execPath,
    [
      `--max-old-space-size=${String(heapMib)}`,
      "--permission",
      ...readable.map((target) => `--allow-fs-read=${target}`),
      script,
      argument,
    ],
    { env: {}, maxOutput },
  );
}

const ENCRYPTION = z.object({
  encrypt: z.object({ encrypted: z.boolean() }),
});

const VERDICT = z.object({
  accepted: z.boolean(),
  categories: z.array(
    z.enum([
      "javascript",
      "xfa",
      "automatic_action",
      "launch",
      "embedded_file",
      "rich_media",
      "action",
      "form",
      "encrypted",
      "unverifiable",
    ]),
  ),
  signatureField: z.boolean(),
  pageCount: z.number().int().min(0),
  objectCount: z.number().int().min(0),
});

const EXTRACTION = z.object({
  pages: z.array(
    z.object({
      number: z.number().int().min(1),
      text: z.string(),
      imageOperations: z.number().int().min(0),
    }),
  ),
});

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

// Analiza el fichero y devuelve su huella, su texto por página y lo que se
// necesita para registrarlo, o el motivo del rechazo. No registra nada.
export async function analyzePdf(
  file: string,
  { projectRoot, workDir }: PdfEnvironment,
  limits: PdfLimits,
): Promise<PdfAnalysis> {
  // 1. Validación del fichero, antes de analizarlo.
  const { size } = await stat(file);
  if (size === 0) {
    return rejection("empty");
  }
  if (size > limits.maxBytes) {
    return rejection("too_large");
  }
  const content = await readFile(file);
  const digest = sha256(content);
  if (
    content.subarray(0, PDF_SIGNATURE.length).toString("latin1") !==
    PDF_SIGNATURE
  ) {
    return rejection("not_pdf");
  }

  const qpdf = await verifiedQpdf(projectRoot);
  if (qpdf === undefined) {
    return rejection("not_verifiable");
  }
  const scratch = path.join(workDir, `pdf-${randomBytes(8).toString("hex")}`);
  await mkdir(scratch, { recursive: true, mode: 0o700 });
  try {
    // qpdf se ejecuta sin heredar nada del entorno. Las tres variables
    // impiden además que su biblioteca criptográfica cargue configuración o
    // módulos del sistema: solo se ejecuta código de la herramienta
    // verificada.
    const qpdfEnv = {
      OPENSSL_CONF: path.join(scratch, "sin-configuracion"),
      OPENSSL_MODULES: path.join(scratch, "sin-modulos"),
      OPENSSL_ENGINES: path.join(scratch, "sin-motores"),
    };

    // 2a. ¿Está cifrado? Lo dice qpdf a partir de la estructura.
    const probe = await runChild(
      qpdf,
      [
        "--password-is-hex-key",
        `--password=${NO_KEY}`,
        "--json=2",
        "--json-key=encrypt",
        file,
      ],
      { env: qpdfEnv, maxOutput: SMALL_OUTPUT_BYTES },
    );
    if (probe.interrupted) {
      return rejection("not_verifiable");
    }
    if (probe.code !== 0 || probe.stderr !== "") {
      return rejection("damaged");
    }
    const encryption = ENCRYPTION.safeParse(
      parseJson(probe.stdout.toString("utf8")),
    );
    if (!encryption.success) {
      return rejection("not_verifiable");
    }
    if (encryption.data.encrypt.encrypted) {
      return rejection("encrypted");
    }

    // 2b. Estructura interpretada, a un fichero temporal.
    const structure = path.join(scratch, "estructura.json");
    const inspection = await runChild(
      qpdf,
      [
        "--json=2",
        "--json-stream-data=none",
        "--json-key=qpdf",
        "--json-key=pages",
        file,
      ],
      {
        env: qpdfEnv,
        maxOutput: STRUCTURE_LIMIT_BYTES,
        outputFile: structure,
      },
    );
    if (inspection.interrupted) {
      return rejection("not_verifiable");
    }
    if (inspection.code !== 0 || inspection.stderr !== "") {
      return rejection("damaged");
    }

    // 2c. Política propia sobre esa estructura.
    const children = path.join(projectRoot, "src/modules/normative-source/pdf");
    const manifest = path.join(projectRoot, "package.json");
    const judged = await runNode(
      path.join(children, "policy-child.ts"),
      structure,
      POLICY_HEAP_MIB,
      [children, manifest, scratch],
      SMALL_OUTPUT_BYTES,
    );
    const verdict = VERDICT.safeParse(
      judged.interrupted || judged.code !== 0
        ? undefined
        : parseJson(judged.stdout.toString("utf8")),
    );
    if (!verdict.success) {
      return rejection("not_verifiable");
    }
    const { accepted, categories, pageCount, signatureField } = verdict.data;
    if (!accepted) {
      if (categories.includes("unverifiable")) {
        return rejection("not_verifiable");
      }
      if (categories.includes("encrypted")) {
        return rejection("encrypted");
      }
      return categories.every((category) => category === "form")
        ? rejection("form_not_allowed", categories)
        : rejection("active_content", categories);
    }
    if (pageCount === 0) {
      return rejection("damaged");
    }
    if (pageCount > limits.maxPages) {
      return rejection("too_many_pages");
    }

    // 3. Extracción del texto, página a página.
    const extracted = await runNode(
      path.join(children, "extract-child.ts"),
      file,
      EXTRACTION_HEAP_MIB,
      [children, manifest, path.join(projectRoot, "node_modules"), file],
      EXTRACTION_LIMIT_BYTES,
    );
    const extraction = EXTRACTION.safeParse(
      extracted.interrupted || extracted.code !== 0
        ? undefined
        : parseJson(extracted.stdout.toString("utf8")),
    );
    // Los dos intérpretes deben ver el mismo número de páginas, numeradas
    // desde 1 y sin huecos.
    if (
      !extraction.success ||
      extraction.data.pages.length !== pageCount ||
      extraction.data.pages.some((page, index) => page.number !== index + 1)
    ) {
      return rejection("not_verifiable");
    }

    // El fichero no ha cambiado durante el análisis.
    if (sha256(await readFile(file)) !== digest) {
      return rejection("not_verifiable");
    }
    return {
      ok: true,
      sha256: digest,
      sizeBytes: size,
      pageCount,
      hasSignatureField: signatureField,
      pages: extraction.data.pages.map((page) => ({
        number: page.number,
        text: page.text,
        // Sin umbral: sin texto extraíble es no tener ningún carácter
        // distinto de espacio (FR-064).
        hasExtractableText: page.text.trim() !== "",
        hasImages: page.imageOperations > 0,
      })),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
