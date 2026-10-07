// Registros estructurados de la aplicación (FR-008; research.md, R9; plan.md,
// «Interfaz de registros»). Módulo portable: el preflight y `server.mjs` lo
// cargan directamente con Node.js, así que solo importa `pino` y usa sintaxis
// TypeScript borrable.
//
// Hay dos eventos de arranque, `startup.completed` y `startup.config_invalid`,
// y una lista cerrada de eventos de producto (`logProductEvent`), cada uno con
// el identificador de correlación de su petición. Cada llamada escribe
// exactamente una línea JSON, con cualquiera de los siete niveles operativos,
// incluido `silent`: el evento lo escribe un hijo de Pino con su propio nivel.
// La comprobación de estado no registra nada.
import pino from "pino";
import type { DestinationStream, Logger as PinoLogger } from "pino";

export type Level =
  "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
export type Mode = "development" | "production";

export interface Destination {
  write(chunk: string): void;
}

export interface LoggerOptions {
  readonly environment: string;
  readonly level: Level;
  readonly destination?: Destination;
}

export interface ProblemInput {
  readonly key: string;
  readonly problem: string;
}

// Manejador opaco: un objeto nuevo y congelado, sin propiedades y con
// prototipo nulo, así que no alcanza el logger de Pino ni ningún método, ni
// siquiera los de `Object.prototype`. La marca solo existe en los tipos.
declare const opaque: unique symbol;
export interface AppLogger {
  readonly [opaque]: "AppLogger";
}

interface State {
  readonly pino: PinoLogger;
  readonly environment: string;
}

const states = new WeakMap<AppLogger, State>();

// Rutas censuradas, con la semántica de Pino: `*.campo` cubre un único nivel
// de anidamiento. Lista mínima y ampliable.
const REDACT_PATHS = [
  "*.password",
  "*.secret",
  "*.token",
  "*.apiKey",
  "authorization",
  "cookie",
];

// Crea el manejador sin escribir nada. Sin destino, escribe en la salida
// estándar. `environment` se añade en cada evento, porque
// `startup.config_invalid` usa el modo en su lugar.
export function createLogger({
  environment,
  level,
  destination,
}: LoggerOptions): AppLogger {
  const options = {
    level,
    base: { service: "aulanorma" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  };
  const logger = Object.freeze(Object.create(null) as object) as AppLogger;
  states.set(logger, {
    pino:
      destination === undefined
        ? pino(options)
        : pino(options, destination satisfies DestinationStream),
    environment,
  });
  return logger;
}

function stateOf(logger: AppLogger): State {
  const state = states.get(logger);
  if (state === undefined) {
    throw new TypeError("El manejador de registros no es válido.");
  }
  return state;
}

// `info` `startup.completed`, sin otros campos propios.
export function logStartupCompleted(logger: AppLogger): void {
  const { pino: root, environment } = stateOf(logger);
  root.child({ environment }, { level: "info" }).info("startup.completed");
}

// `fatal` `startup.config_invalid`, con el modo explícito como `environment` y
// como `mode`, y `problems` reconstruido copiando solo `key` y `problem`.
export function logConfigInvalid(
  logger: AppLogger,
  mode: Mode,
  problems: readonly ProblemInput[],
): void {
  const { pino: root } = stateOf(logger);
  root.child({ environment: mode }, { level: "fatal" }).fatal(
    {
      mode,
      problems: problems.map(({ key, problem }) => ({ key, problem })),
    },
    "startup.config_invalid",
  );
}

// Eventos de producto: una lista cerrada de nombres y de campos. No aceptan
// texto libre, así que no pueden llevar contraseñas, claves, identificadores
// de sesión ni contenido. `correlationId` identifica la petición y es el mismo
// que el de sus eventos de auditoría. La comprobación de estado sigue sin
// registrar nada.
export type ProductEvent =
  | "session.signed_in"
  | "session.sign_in_refused"
  | "session.signed_out"
  | "account.password_changed"
  | "account.password_change_refused"
  | "access.denied"
  | "request.failed";

export function logProductEvent(
  logger: AppLogger,
  event: ProductEvent,
  correlationId: string,
): void {
  const { pino: root, environment } = stateOf(logger);
  root.child({ environment }, { level: "info" }).info({ correlationId }, event);
}
