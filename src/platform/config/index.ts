// Configuración de la aplicación (FR-005; research.md, R8; data-model.md,
// «Configuración de la aplicación»). Módulo portable: el preflight y
// `server.mjs` lo cargan directamente con Node.js, así que solo importa
// paquetes npm y usa sintaxis TypeScript borrable.
//
// Las tres operaciones devuelven la misma unión discriminada y nunca
// devuelven ni registran valores. Es el único módulo que lee `process.env`.
import nextEnv from "@next/env";
import { z } from "zod";

export type Mode = "development" | "production";
export type ProblemCode =
  | "missing"
  | "invalid_value"
  | "unknown_key"
  | "mode_mismatch"
  | "env_load_failed";

export interface ConfigProblem {
  readonly key: string;
  readonly problem: ProblemCode;
}

export interface Config {
  readonly logLevel: LogLevel;
  readonly environment: Environment;
}

export type ConfigResult =
  | { readonly ok: true; readonly config: Config }
  | { readonly ok: false; readonly problems: readonly ConfigProblem[] };

export type ConfigSource = Readonly<Record<string, string | undefined>>;

const LOG_LEVEL = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);
const ENVIRONMENT = z.enum(["development", "test", "ci"]);

export type LogLevel = z.infer<typeof LOG_LEVEL>;
export type Environment = z.infer<typeof ENVIRONMENT>;

// Esquema: cada variable de entorno con los valores que admite.
const SCHEMA = {
  AULANORMA_LOG_LEVEL: LOG_LEVEL,
  AULANORMA_ENVIRONMENT: ENVIRONMENT,
} as const;

const PREFIX = "AULANORMA_";

function failure(problems: readonly ConfigProblem[]): ConfigResult {
  return { ok: false, problems };
}

// Valida una fuente inyectada. Es pura: no lee `process.env`, no modifica la
// fuente y devuelve todos los problemas a la vez, sin ningún valor. Las
// claves sin el prefijo `AULANORMA_`, incluido `__NEXT_PROCESSED_ENV`, no
// pertenecen al esquema y se ignoran.
export function validateConfig(source: ConfigSource): ConfigResult {
  const problems: ConfigProblem[] = [];
  const logLevel = SCHEMA.AULANORMA_LOG_LEVEL.safeParse(
    source.AULANORMA_LOG_LEVEL,
  );
  const environment = SCHEMA.AULANORMA_ENVIRONMENT.safeParse(
    source.AULANORMA_ENVIRONMENT,
  );
  for (const [key, parsed] of [
    ["AULANORMA_LOG_LEVEL", logLevel],
    ["AULANORMA_ENVIRONMENT", environment],
  ] as const) {
    const value = source[key];
    if (value === undefined || value === "") {
      problems.push({ key, problem: "missing" });
    } else if (!parsed.success) {
      problems.push({ key, problem: "invalid_value" });
    }
  }
  for (const key of Object.keys(source)) {
    if (key.startsWith(PREFIX) && !Object.hasOwn(SCHEMA, key)) {
      problems.push({ key, problem: "unknown_key" });
    }
  }
  if (!logLevel.success || !environment.success || problems.length > 0) {
    return failure(problems);
  }
  return {
    ok: true,
    config: Object.freeze({
      logLevel: logLevel.data,
      environment: environment.data,
    }),
  };
}

// Fallos de `loadConfig`: cada devolución crea un resultado, una lista y un
// problema nuevos, sin ninguna referencia compartida entre llamadas.
function modeMismatch(): ConfigResult {
  return failure([{ key: "NODE_ENV", problem: "mode_mismatch" }]);
}

function envLoadFailed(): ConfigResult {
  return failure([{ key: "environment", problem: "env_load_failed" }]);
}

// Raíz del proyecto, a partir de la ubicación de este módulo
// (`src/platform/config`). Se calcula al cargar, nunca al importar.
function projectRoot(): string {
  return `${import.meta.dirname}/../../..`;
}

// Carga los ficheros `.env*` del modo explícito con `@next/env`, el cargador de
// Next.js, y valida el `process.env` resultante. El modo no se deduce ni se
// convierte: si no es exactamente `development` o `production`, o si
// `NODE_ENV` no coincide con él, falla antes de cargar nada. Cada llamada usa
// `forceReload` y un logger privado nuevo que descarta todo; un error de
// carga, marcado por el logger o lanzado por el cargador, se convierte en un
// único problema genérico, sin rutas, nombres de fichero, mensajes ni trazas.
export function loadConfig(mode: Mode): ConfigResult {
  const requested: unknown = mode;
  if (
    (requested !== "development" && requested !== "production") ||
    process.env.NODE_ENV !== requested
  ) {
    return modeMismatch();
  }
  let loadFailed = false;
  const logger = {
    info(): void {
      // Descarta lo que el cargador anuncia.
    },
    error(): void {
      loadFailed = true;
    },
  };
  try {
    nextEnv.loadEnvConfig(
      projectRoot(),
      requested === "development",
      logger,
      true,
    );
  } catch {
    loadFailed = true;
  }
  if (loadFailed) {
    return envLoadFailed();
  }
  return validateConfig(process.env);
}

// Valida el `process.env` ya preparado del proceso, sin volver a cargar
// ficheros ni llamar a `@next/env`. La usa la API Route en cada manejo.
export function readRuntimeConfig(): ConfigResult {
  return validateConfig(process.env);
}
