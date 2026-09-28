// Bloqueo de red para todas las pruebas (FR-007, FR-013; research.md, R7).
//
// Falla cerrado: `fetch` siempre lanza un error y `net.Socket.prototype.connect`
// solo admite TCP hacia 127.0.0.1 o ::1. Cualquier otro destino, un host
// ausente (que Node.js resolvería por nombre), un nombre como `localhost` o una
// ruta IPC se rechazan de forma síncrona, antes de abrir ninguna conexión.
// Ambos parches quedan fijados como no reescribibles para que ninguna prueba
// pueda retirarlos.
import net from "node:net";

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "::1"]);
const INSTALLED = Symbol.for("aulanorma.tests.no-network");

export const BLOCKED_ERROR_NAME = "NetworkAccessBlockedError";

export class NetworkAccessBlockedError extends Error {
  constructor(destination: string) {
    super(`Acceso a red bloqueado en las pruebas: ${destination}`);
    this.name = BLOCKED_ERROR_NAME;
  }
}

export interface Destination {
  readonly host: string | undefined;
  readonly port: unknown;
  readonly ipcPath: string | undefined;
}

const UNKNOWN_DESTINATION: Destination = {
  host: undefined,
  port: undefined,
  ipcPath: undefined,
};

function readOptions(options: object): Destination {
  const { host, port, path } = options as {
    host?: unknown;
    port?: unknown;
    path?: unknown;
  };
  return {
    host: typeof host === "string" ? host : undefined,
    port,
    ipcPath: typeof path === "string" ? path : undefined,
  };
}

// `net.connect()` y los agentes HTTP llaman a `connect` con un array
// normalizado `[opciones, callback]`; `socket.connect()` puede recibir un
// objeto de opciones, `(puerto, host?)` o una ruta IPC.
export function resolveDestination(args: readonly unknown[]): Destination {
  const [first, second] = args;
  if (Array.isArray(first)) {
    const [options] = first as unknown[];
    return typeof options === "object" && options !== null
      ? readOptions(options)
      : UNKNOWN_DESTINATION;
  }
  if (typeof first === "object" && first !== null) {
    return readOptions(first);
  }
  if (typeof first === "string" && Number.isNaN(Number(first))) {
    return { host: undefined, port: undefined, ipcPath: first };
  }
  return {
    host: typeof second === "string" ? second : undefined,
    port: first,
    ipcPath: undefined,
  };
}

export function isAllowedDestination(destination: Destination): boolean {
  return (
    destination.ipcPath === undefined &&
    destination.host !== undefined &&
    LOOPBACK_HOSTS.has(destination.host)
  );
}

function formatDestination(destination: Destination): string {
  if (destination.ipcPath !== undefined) {
    return `ipc:${destination.ipcPath}`;
  }
  return `${destination.host ?? "(host ausente)"}:${String(destination.port)}`;
}

function blockedFetch(): never {
  throw new NetworkAccessBlockedError("fetch");
}

function install(): void {
  const registry = globalThis as typeof globalThis & {
    [INSTALLED]?: true;
  };
  if (registry[INSTALLED] === true) {
    return;
  }

  const originalConnect = Reflect.get(net.Socket.prototype, "connect") as (
    this: net.Socket,
    ...args: unknown[]
  ) => net.Socket;

  function guardedConnect(this: net.Socket, ...args: unknown[]): net.Socket {
    const destination = resolveDestination(args);
    if (!isAllowedDestination(destination)) {
      throw new NetworkAccessBlockedError(formatDestination(destination));
    }
    return Reflect.apply(originalConnect, this, args);
  }

  Object.defineProperty(net.Socket.prototype, "connect", {
    value: guardedConnect,
    writable: false,
    configurable: false,
    enumerable: false,
  });
  Object.defineProperty(globalThis, "fetch", {
    value: blockedFetch,
    writable: false,
    configurable: false,
    enumerable: false,
  });
  Object.defineProperty(registry, INSTALLED, {
    value: true,
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

install();
