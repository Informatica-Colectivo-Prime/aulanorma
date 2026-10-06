// Contrato de `src/platform/version` (T035) y `src/platform/health` (T036):
// `getVersion()` y `buildHealthStatus()` (FR-006, C2 y C4; plan.md, «Interfaz
// de estado y versión»; contracts/health.openapi.yaml). Como las demás pruebas
// escritas antes de la implementación, falla hasta que existan los módulos.
//
// Los módulos se importan de forma dinámica y se tipan con el contrato esperado
// que declara esta prueba; no hay declaración de módulo que oculte su ausencia.
//
// Importar un módulo no debe hacer trabajo: se admite que el sistema de
// módulos resuelva y conserve la importación JSON estática de `package.json`,
// pero la validación y la composición solo ocurren al invocar las funciones.
// Para observarlo:
// - `node:fs` y `fs`, con sus variantes de promesas, se sustituyen por
//   envoltorios que delegan en el módulo real y anotan cada llamada;
// - `process.env` se sustituye durante cada observación por un proxy que anota
//   los accesos hechos desde `src/platform`;
// - la salida estándar, la de error y `console` se capturan;
// - la red ya está bloqueada para todas las pruebas (tests/setup/no-network.ts).
// Los manifiestos no válidos y la función `getVersion` que usa `health` se
// sustituyen con `vi.doMock`, sin tocar el `package.json` real.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";

// Contrato esperado (plan.md, «Interfaz de estado y versión»).
interface VersionModule {
  readonly getVersion: () => string;
}
interface HealthStatus {
  readonly status: "ok";
  readonly version: string;
}
interface HealthModule {
  readonly buildHealthStatus: () => HealthStatus;
}

const fsCalls = vi.hoisted(() => {
  const calls: string[] = [];
  return calls;
});

const recordFs = vi.hoisted(
  () =>
    (
      name: string,
      actual: Record<string, unknown>,
    ): Record<string, unknown> => {
      const wrap = (
        source: Record<string, unknown>,
        prefix: string,
      ): Record<string, unknown> =>
        Object.fromEntries(
          Object.entries(source).map(([key, value]) => [
            key,
            typeof value === "function"
              ? (...args: unknown[]): unknown => {
                  fsCalls.push(`${prefix}.${key}`);
                  return Reflect.apply(value, source, args);
                }
              : value,
          ]),
        );
      const wrapped = wrap(actual, name);
      const fallback = actual.default;
      if (typeof fallback === "object" && fallback !== null) {
        wrapped.default = wrap(fallback as Record<string, unknown>, name);
      }
      return wrapped;
    },
);

vi.mock("node:fs", async (importOriginal) =>
  recordFs("node:fs", await importOriginal()),
);
vi.mock("fs", async (importOriginal) => recordFs("fs", await importOriginal()));
vi.mock("node:fs/promises", async (importOriginal) =>
  recordFs("node:fs/promises", await importOriginal()),
);
vi.mock("fs/promises", async (importOriginal) =>
  recordFs("fs/promises", await importOriginal()),
);

// La ausencia de cualquiera de los dos módulos hace fallar la prueba aquí.
await import("@/platform/version");
await import("@/platform/health");

// El espacio de nombres pasa por `unknown` antes de tiparse con el contrato: la
// conversión es necesaria tanto con los módulos ausentes como con los reales.
const loadVersion = async (): Promise<VersionModule> => {
  const namespace: unknown = await import("@/platform/version");
  return namespace as VersionModule;
};
const loadHealth = async (): Promise<HealthModule> => {
  const namespace: unknown = await import("@/platform/health");
  return namespace as HealthModule;
};

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const MANIFEST = path.join(repoRoot, "package.json");
const PLATFORM_FRAME = `${path.sep}src${path.sep}platform${path.sep}`;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// El `package.json` real, leído con `require` nativo, fuera de las
// sustituciones de Vitest.
const realManifest = createRequire(import.meta.url)(MANIFEST) as {
  readonly name: string;
  readonly version: string;
};

// Datos sintéticos únicos en cada ejecución. Nunca se imprimen.
const RUN = randomUUID();
const SENTINEL = `centinela-${RUN}`;
const MANIFEST_NAME = `manifiesto-${RUN}`;

interface Observation {
  readonly output: string;
  readonly environment: readonly string[];
  readonly fs: readonly string[];
}

// Observa una acción: salida estándar, de error y `console`; accesos a
// `process.env` desde `src/platform`; y llamadas a `node:fs`.
async function observe<T>(
  action: () => T | Promise<T>,
): Promise<{ readonly value: T; readonly observed: Observation }> {
  const chunks: string[] = [];
  const record = (...args: unknown[]): void => {
    chunks.push(
      args
        .map((arg) => (typeof arg === "string" ? arg : inspect(arg)))
        .join(" "),
    );
  };
  const spies = [
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      record(chunk);
      return true;
    }),
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      record(chunk);
      return true;
    }),
    vi.spyOn(console, "log").mockImplementation(record),
    vi.spyOn(console, "info").mockImplementation(record),
    vi.spyOn(console, "warn").mockImplementation(record),
    vi.spyOn(console, "error").mockImplementation(record),
    vi.spyOn(console, "debug").mockImplementation(record),
    vi.spyOn(console, "trace").mockImplementation(record),
  ];
  const environment: string[] = [];
  const touch = (key: string | symbol): void => {
    if (new Error().stack?.includes(PLATFORM_FRAME) === true) {
      environment.push(String(key));
    }
  };
  const originalEnvironment = process.env;
  process.env = new Proxy(originalEnvironment, {
    get(target, key) {
      touch(key);
      return Reflect.get(target, key) as unknown;
    },
    has(target, key) {
      touch(key);
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      touch("*");
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      touch(key);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  fsCalls.length = 0;
  try {
    const value = await action();
    return {
      value,
      observed: {
        output: chunks.join(""),
        environment: [...environment],
        fs: [...fsCalls],
      },
    };
  } finally {
    process.env = originalEnvironment;
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
}

function expectQuiet(observed: Observation): void {
  expect(observed.output.length, "sin salida estándar ni de error").toBe(0);
  expect(observed.environment, "sin acceso a process.env").toEqual([]);
  expect(observed.fs, "sin llamadas a node:fs").toEqual([]);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) {
      deepFreeze(inner);
    }
    Object.freeze(value);
  }
  return value;
}

function useManifest(manifest: unknown): void {
  vi.doMock(MANIFEST, () => ({ default: manifest }));
}

function isAsync(fn: unknown): boolean {
  return (
    typeof fn === "function" &&
    (fn as { constructor: { name: string } }).constructor.name ===
      "AsyncFunction"
  );
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock(MANIFEST);
  vi.doUnmock("@/platform/version");
  vi.resetModules();
});

describe("src/platform/version", () => {
  test("exporta únicamente getVersion, síncrona", async () => {
    const version = await loadVersion();
    expect(Object.keys(version)).toEqual(["getVersion"]);
    expect(typeof version.getVersion).toBe("function");
    expect(isAsync(version.getVersion)).toBe(false);
  });

  test("importarlo con el manifiesto válido no lanza ni hace trabajo observable", async () => {
    const { observed } = await observe(loadVersion);
    expectQuiet(observed);
  });

  test("getVersion devuelve la versión de package.json", async () => {
    const version = await loadVersion();
    const { value, observed } = await observe(() => version.getVersion());
    expectQuiet(observed);
    expect(value).toBe(realManifest.version);
    expect(value).toMatch(SEMVER);
  });

  test.each([
    "0.0.0",
    "0.0.1",
    "0.1.0",
    "1.0.0",
    "10.20.30",
    "999999999.999999999.999999999",
  ])("acepta el límite válido %s y lo devuelve exactamente", async (valid) => {
    const manifest = deepFreeze({ name: MANIFEST_NAME, version: valid });
    useManifest(manifest);
    const version = await loadVersion();
    const { value, observed } = await observe(() => version.getVersion());
    expectQuiet(observed);
    expect(value).toBe(valid);
    expect(manifest).toEqual({ name: MANIFEST_NAME, version: valid });
  });

  // Cada caso: el manifiesto sustituido y una etiqueta sin el valor.
  const INVALID: readonly {
    readonly name: string;
    readonly manifest: object;
  }[] = [
    { name: "sin campo version", manifest: { name: MANIFEST_NAME } },
    { name: "undefined", manifest: { version: undefined } },
    { name: "null", manifest: { version: null } },
    { name: "número", manifest: { version: 1 } },
    { name: "booleano", manifest: { version: true } },
    { name: "objeto", manifest: { version: { major: 1 } } },
    { name: "array", manifest: { version: ["1.0.0"] } },
    { name: "texto vacío", manifest: { version: "" } },
    { name: "un fragmento", manifest: { version: "1" } },
    { name: "dos fragmentos", manifest: { version: "1.2" } },
    { name: "cuatro fragmentos", manifest: { version: "1.2.3.4" } },
    { name: "fragmento vacío", manifest: { version: "1..3" } },
    { name: "cero inicial en mayor", manifest: { version: "01.2.3" } },
    { name: "cero inicial en menor", manifest: { version: "1.02.3" } },
    { name: "cero inicial en parche", manifest: { version: "1.2.03" } },
    { name: "versión preliminar", manifest: { version: "1.2.3-beta" } },
    { name: "preliminar numérica", manifest: { version: "1.2.3-0" } },
    { name: "metadatos", manifest: { version: "1.2.3+build.1" } },
    {
      name: "preliminar y metadatos",
      manifest: { version: "1.2.3-rc.1+sha.5" },
    },
    { name: "espacio inicial", manifest: { version: " 1.2.3" } },
    { name: "espacio final", manifest: { version: "1.2.3 " } },
    { name: "salto de línea final", manifest: { version: "1.2.3\n" } },
    { name: "prefijo v", manifest: { version: "v1.2.3" } },
    { name: "comodín", manifest: { version: "1.2.x" } },
    { name: "signo negativo", manifest: { version: "-1.2.3" } },
    { name: "sufijo de letra", manifest: { version: "1.2.3a" } },
    { name: "dígito no ASCII", manifest: { version: "١.2.3" } },
    { name: "carácter nulo", manifest: { version: "1.2.3\u0000" } },
    { name: "centinela", manifest: { version: SENTINEL } },
    {
      name: "preliminar con centinela",
      manifest: { version: `1.2.3-${SENTINEL}` },
    },
    {
      name: "metadatos con centinela",
      manifest: { version: `1.2.3+${SENTINEL}` },
    },
  ];

  test.each(INVALID)(
    "$name: importar no lanza y getVersion lanza un error genérico",
    async ({ manifest }) => {
      const frozen = deepFreeze({ name: MANIFEST_NAME, ...manifest });
      const snapshot = inspect(frozen);
      useManifest(frozen);
      const imported = await observe(loadVersion);
      expectQuiet(imported.observed);
      const { value: thrown, observed } = await observe(() => {
        try {
          imported.value.getVersion();
        } catch (error: unknown) {
          return error;
        }
        return undefined;
      });
      expectQuiet(observed);
      expect(thrown, "getVersion lanza").toBeInstanceOf(Error);
      const error = thrown as Error;
      // El mensaje y las propiedades propias del error, sin la traza.
      const details = [
        error.name,
        error.message,
        ...Object.getOwnPropertyNames(error)
          .filter((key) => key !== "stack")
          .map((key) => inspect(Reflect.get(error, key))),
      ].join("\n");
      const version: unknown = Reflect.get(frozen, "version");
      const forbidden: Record<string, string> = {
        "nombre del manifiesto": MANIFEST_NAME,
        "valor centinela": SENTINEL,
        "nombre de fichero": "package.json",
        "ruta del repositorio": repoRoot,
      };
      if (typeof version === "string" && version.trim().length >= 3) {
        forbidden["valor recibido"] = version.trim();
      }
      expect(
        Object.entries(forbidden)
          .filter(([, secret]) => details.includes(secret))
          .map(([label]) => label),
        "error genérico",
      ).toEqual([]);
      expect(inspect(frozen), "manifiesto sin modificar").toBe(snapshot);
    },
  );
});

describe("src/platform/health", () => {
  const MOCK_VERSION = "7.8.9";

  function useVersion(
    implementation: () => string = () => MOCK_VERSION,
  ): Mock<() => string> {
    const getVersion = vi.fn<() => string>(implementation);
    vi.doMock("@/platform/version", () => ({ getVersion }));
    return getVersion;
  }

  test("exporta únicamente buildHealthStatus, síncrona y sin parámetros", async () => {
    useVersion();
    const health = await loadHealth();
    expect(Object.keys(health)).toEqual(["buildHealthStatus"]);
    expect(typeof health.buildHealthStatus).toBe("function");
    expect(isAsync(health.buildHealthStatus)).toBe(false);
    expect(health.buildHealthStatus.length).toBe(0);
  });

  test("importarlo no invoca getVersion ni hace trabajo observable", async () => {
    const getVersion = useVersion();
    const { observed } = await observe(loadHealth);
    expectQuiet(observed);
    expect(getVersion).not.toHaveBeenCalled();
  });

  test("cada invocación llama una vez a getVersion y devuelve exactamente el estado", async () => {
    const getVersion = useVersion();
    const health = await loadHealth();
    for (let call = 1; call <= 3; call += 1) {
      const { value, observed } = await observe(() =>
        health.buildHealthStatus(),
      );
      expectQuiet(observed);
      expect(getVersion).toHaveBeenCalledTimes(call);
      expect(Object.keys(value).sort()).toEqual(["status", "version"]);
      expect(value).toStrictEqual({ status: "ok", version: MOCK_VERSION });
    }
  });

  test("devuelve un objeto nuevo e independiente en cada llamada", async () => {
    useVersion();
    const health = await loadHealth();
    const first = health.buildHealthStatus();
    Reflect.set(first, "status", "modificado");
    Reflect.set(first, "requestId", SENTINEL);
    const second = health.buildHealthStatus();
    expect(second).not.toBe(first);
    expect(second).toStrictEqual({ status: "ok", version: MOCK_VERSION });
    expect(health.buildHealthStatus()).not.toBe(second);
  });

  test("si getVersion lanza, la excepción se propaga y nunca devuelve ok", async () => {
    const failure = new Error("fallo de versión");
    useVersion(() => {
      throw failure;
    });
    const health = await loadHealth();
    const { value, observed } = await observe(() => {
      try {
        return health.buildHealthStatus();
      } catch (error: unknown) {
        return error;
      }
    });
    expectQuiet(observed);
    expect(value).toBe(failure);
  });

  test("ignora cualquier argumento: no usa datos de la petición", async () => {
    const getVersion = useVersion();
    const health = await loadHealth();
    const request = {
      headers: {
        "user-agent": SENTINEL,
        cookie: SENTINEL,
        "x-request-id": SENTINEL,
      },
      socket: { remoteAddress: SENTINEL },
      url: `/api/health?${SENTINEL}`,
    };
    const build = health.buildHealthStatus as (...args: unknown[]) => unknown;
    for (const args of [
      [request],
      [SENTINEL],
      ["1.2.3"],
      [request, SENTINEL],
    ]) {
      getVersion.mockClear();
      const value = build(...args);
      expect(inspect(value, { depth: null }).includes(SENTINEL)).toBe(false);
      expect(value).toStrictEqual({ status: "ok", version: MOCK_VERSION });
      expect(getVersion).toHaveBeenCalledTimes(1);
    }
  });
});

describe("health y version juntos", () => {
  test("importar los dos módulos reales no hace trabajo observable", async () => {
    const { observed } = await observe(async () => {
      await loadVersion();
      await loadHealth();
    });
    expectQuiet(observed);
  });

  test("buildHealthStatus devuelve la versión de package.json", async () => {
    const health = await loadHealth();
    const { value, observed } = await observe(() => health.buildHealthStatus());
    expectQuiet(observed);
    expect(value).toStrictEqual({
      status: "ok",
      version: realManifest.version,
    });
  });
});
