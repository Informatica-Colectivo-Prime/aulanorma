// Autoprueba del bloqueo de red de `tests/setup/no-network.ts` (FR-007, FR-013).
// No depende de servicios externos: los destinos externos son direcciones de
// documentación (RFC 5737 y RFC 3849) o nombres `.invalid`, que el bloqueo
// rechaza antes de abrir ninguna conexión, y las conexiones reales se hacen
// contra un servidor local efímero.
//
// Este fichero no importa `./no-network.ts` de forma estática: el bloqueo debe
// llegar instalado por `setupFiles` de `vitest.config.ts`. Si deja de cargarse,
// las primeras pruebas fallan. Los clasificadores se importan dinámicamente
// solo en el último bloque.
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { afterEach, describe, expect, test } from "vitest";

const BLOCKED_ERROR_NAME = "NetworkAccessBlockedError";

function expectBlocked(action: () => unknown): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).name).toBe(BLOCKED_ERROR_NAME);
}

interface LocalServer {
  readonly port: number;
  readonly connections: () => number;
  readonly close: () => Promise<void>;
}

const openServers: LocalServer[] = [];

async function startLocalServer(host: string): Promise<LocalServer> {
  let count = 0;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    count += 1;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.end("ok");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      resolve();
    });
  });
  const address = server.address() as net.AddressInfo;
  const local: LocalServer = {
    port: address.port,
    connections: () => count,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => {
          resolve();
        });
      }),
  };
  openServers.push(local);
  return local;
}

function connectAndRead(host: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let data = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      data += chunk;
    });
    socket.on("end", () => {
      resolve(data);
    });
    socket.on("error", reject);
  });
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => server.close()));
});

describe("bloqueo de red instalado por setupFiles", () => {
  test("fetch global lanza el error de bloqueo y no puede sustituirse", () => {
    expectBlocked(() => fetch("https://example.invalid/"));
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    expect(descriptor?.writable).toBe(false);
    expect(descriptor?.configurable).toBe(false);
  });

  test("net.Socket.prototype.connect está protegido y no puede sustituirse", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      net.Socket.prototype,
      "connect",
    );
    expect((descriptor?.value as { name?: string } | undefined)?.name).toBe(
      "guardedConnect",
    );
    expect(descriptor?.writable).toBe(false);
    expect(descriptor?.configurable).toBe(false);
  });
});

describe("conexiones externas rechazadas antes de conectar", () => {
  test.each([
    [
      "net.connect con opciones IPv4",
      () => net.connect({ host: "192.0.2.1", port: 80 }),
    ],
    ["net.connect con puerto y host", () => net.connect(80, "198.51.100.7")],
    [
      "socket.connect con puerto y host",
      () => new net.Socket().connect(443, "203.0.113.9"),
    ],
    ["IPv6 externa", () => net.connect({ host: "2001:db8::1", port: 80 })],
    [
      "IPv4 mapeada en IPv6",
      () => net.connect({ host: "::ffff:192.0.2.1", port: 80 }),
    ],
    [
      "nombre de host",
      () => net.connect({ host: "example.invalid", port: 80 }),
    ],
    ["http.request", () => http.request("http://192.0.2.1/").end()],
    ["https.request", () => https.request("https://192.0.2.1/").end()],
    ["tls.connect", () => tls.connect({ host: "192.0.2.1", port: 443 })],
  ])("%s", (_name, action) => {
    expectBlocked(action);
  });
});

describe("conexiones reales contra un servidor local", () => {
  test("127.0.0.1 literal se admite y la conexión llega al servidor", async () => {
    const server = await startLocalServer("127.0.0.1");
    await expect(connectAndRead("127.0.0.1", server.port)).resolves.toBe("ok");
    expect(server.connections()).toBe(1);
  });

  test("::1 literal se admite cuando el sistema ofrece IPv6 de bucle local", async (context) => {
    let server: LocalServer;
    try {
      server = await startLocalServer("::1");
    } catch {
      context.skip("el sistema no ofrece ::1");
      return;
    }
    await expect(connectAndRead("::1", server.port)).resolves.toBe("ok");
    expect(server.connections()).toBe(1);
  });

  test("el mismo servidor alcanzable por nombre o sin host no recibe ninguna conexión", async () => {
    const server = await startLocalServer("127.0.0.1");
    expectBlocked(() => net.connect({ host: "localhost", port: server.port }));
    expectBlocked(() => net.connect(server.port));
    expectBlocked(() =>
      http.get({ host: "localhost", port: server.port, path: "/" }),
    );
    await nextTurn();
    expect(server.connections()).toBe(0);
  });

  test("una ruta IPC se rechaza", () => {
    expectBlocked(() => net.connect("aulanorma-no-network.sock"));
  });
});

describe("clasificación de destinos", () => {
  test.each([
    [[{ host: "127.0.0.1", port: 1 }], true],
    [[{ host: "::1", port: 1 }], true],
    [[[{ host: "127.0.0.1", port: 1 }, () => undefined]], true],
    [[1, "127.0.0.1"], true],
    [[1, "::1"], true],
    [[{ host: "127.0.0.2", port: 1 }], false],
    [[{ host: "::ffff:127.0.0.1", port: 1 }], false],
    [[{ host: "localhost", port: 1 }], false],
    [[{ port: 1 }], false],
    [[1], false],
    [[{ path: "/tmp/x.sock" }], false],
    [["/tmp/x.sock"], false],
    [[[null]], false],
    [[], false],
  ] as const)("%j → %s", async (args, allowed) => {
    const { isAllowedDestination, resolveDestination } =
      await import("./no-network.ts");
    expect(isAllowedDestination(resolveDestination(args))).toBe(allowed);
  });
});
