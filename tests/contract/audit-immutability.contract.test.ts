// Registro de auditoría inalterable desde el producto (specs/002-boe-scorm-export:
// T016, FR-028 y SC-043).
//
// Ejercita todas las operaciones de la superficie con todos los perfiles,
// incluido el de administración, y comprueba que los eventos registrados antes
// conservan su contenido y que ninguno desaparece. Comprueba además que el
// código del producto no contiene ninguna sentencia que modifique o borre la
// tabla y que una corrección es un evento nuevo.
//
// Esta protección es de la aplicación. No cubre a quien administre el servidor
// y modifique directamente los ficheros.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as passwordPage from "@/pages/account/password";
import * as passwordAction from "@/pages/api/account/password";
import * as signInAction from "@/pages/api/session/sign-in";
import * as signOutAction from "@/pages/api/session/sign-out";
import * as homePage from "@/pages/index";
import * as loginPage from "@/pages/login";
import type { AuditEvent } from "@/platform/audit";
import { openDatabase } from "@/platform/persistence";
import { createWebClient } from "../support/web-client.ts";
import type { WebClient } from "../support/web-client.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const RUN = randomUUID();
const PASSWORD = `inicial-${RUN}`;
const NEW_PASSWORD = `nueva-${RUN}`;

// Estas pruebas usan el coste real de derivación de contraseñas, que es lento a
// propósito: cada entrada o cambio de contraseña tarda décimas de segundo.
vi.setConfig({ testTimeout: 120_000 });

let client: WebClient;

beforeEach(() => {
  client = createWebClient();
});

afterEach(() => {
  client.dispose();
});

function events(): readonly AuditEvent[] {
  return client.runtime.audit.list();
}

// Todas las operaciones de la superficie, correctas e incorrectas, con una
// cuenta de los perfiles indicados.
async function exerciseEverything(
  username: string,
  roles: readonly string[],
): Promise<void> {
  const { identity } = client.runtime;
  await identity.createUser({
    username,
    password: PASSWORD,
    roles,
    correlationId: `alta-${username}`,
  });
  client.cookies.clear();
  await client.get(homePage);
  let form = await client.get(loginPage);
  await client.post(signInAction, {
    csrf: client.csrfOf(form),
    username,
    password: "incorrecta-000000",
  });
  await client.post(
    signInAction,
    { csrf: client.csrfOf(form), username, password: PASSWORD },
    { origin: "https://atacante.example" },
  );
  form = await client.get(loginPage);
  await client.post(signInAction, {
    csrf: client.csrfOf(form),
    username,
    password: PASSWORD,
  });
  form = await client.get(passwordPage);
  await client.post(passwordAction, {
    csrf: "inventado",
    current: PASSWORD,
    next: NEW_PASSWORD,
  });
  await client.post(passwordAction, {
    csrf: client.csrfOf(form),
    current: "incorrecta-000000",
    next: NEW_PASSWORD,
  });
  await client.post(passwordAction, {
    csrf: client.csrfOf(form),
    current: PASSWORD,
    next: NEW_PASSWORD,
  });
  const home = await client.get(homePage);
  await client.get(passwordPage);
  await client.post(signOutAction, { csrf: client.csrfOf(home) });
  identity.setRoles(username, [...roles], `perfiles-${username}`);
  identity.setDisabled(username, true, `baja-${username}`);
  identity.setDisabled(username, false, `alta-de-nuevo-${username}`);
  identity.revokeSessions(username, `cierre-${username}`);
}

describe("ninguna operación del producto modifica ni borra un evento", () => {
  test("tras ejercitar toda la superficie con cada perfil, los eventos anteriores siguen idénticos", async () => {
    const snapshots: (readonly AuditEvent[])[] = [];
    for (const [username, roles] of [
      ["admin1", ["admin"]],
      ["docente1", ["teacher"]],
      ["ambos1", ["admin", "teacher"]],
      ["sinperfil", []],
    ] as const) {
      await exerciseEverything(username, roles);
      const current = events();
      for (const previous of snapshots) {
        expect(current.slice(0, previous.length)).toEqual(previous);
      }
      const last = snapshots.at(-1);
      expect(current.length).toBeGreaterThan(last?.length ?? 0);
      snapshots.push(current);
    }
    const all = events();
    expect(all.map(({ id }) => id)).toEqual(all.map((_, index) => index + 1));
  });

  test("cada operación ejercitada deja su propio evento, también las denegadas", async () => {
    await exerciseEverything("admin1", ["admin"]);
    expect(events().map(({ action, result }) => `${action}:${result}`)).toEqual(
      [
        "user.created:ok",
        "session.sign_in:failed",
        "request.denied:denied",
        "session.sign_in:ok",
        "request.denied:denied",
        "user.password_changed:failed",
        "user.password_changed:ok",
        "session.sign_out:ok",
        "user.roles_changed:ok",
        "user.disabled:ok",
        "user.enabled:ok",
        "user.sessions_revoked:ok",
      ],
    );
  });

  test("una corrección es un evento nuevo: el anterior no cambia", async () => {
    const { identity } = client.runtime;
    await identity.createUser({
      username: "docente1",
      password: PASSWORD,
      roles: ["teacher"],
      correlationId: "alta",
    });
    identity.setRoles("docente1", ["admin"], "error");
    const before = events();
    identity.setRoles("docente1", ["teacher"], "correccion");
    const after = events();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toMatchObject({
      action: "user.roles_changed",
      correlationId: "correccion",
      details: { previous: "admin", roles: "teacher" },
    });
  });

  test("el servicio de auditoría que reciben las rutas solo permite añadir y leer", () => {
    expect(Object.keys(client.runtime.audit).sort()).toEqual([
      "list",
      "record",
    ]);
  });
});

describe("la base de datos rechaza modificar o borrar eventos", () => {
  test.each([
    "UPDATE audit_event SET result = 'ok'",
    "UPDATE audit_event SET details = '{}' WHERE id = 1",
    "DELETE FROM audit_event",
    "DELETE FROM audit_event WHERE id = 1",
    "INSERT OR REPLACE INTO audit_event (id, at, action, result, correlation_id, details) VALUES (1, 'x', 'x', 'ok', 'x', '{}')",
  ])("%s", async (sql) => {
    await exerciseEverything("admin1", ["admin"]);
    const before = events();
    const db = openDatabase(client.dataDir);
    try {
      expect(() => {
        db.exec(sql);
      }).toThrow(/append-only/);
    } finally {
      db.close();
    }
    expect(events()).toEqual(before);
  });
});

describe("el código del producto no modifica ni borra la tabla", () => {
  function sourceFiles(directory: string): string[] {
    return readdirSync(path.join(repoRoot, directory)).flatMap((entry) => {
      const relative = path.posix.join(directory, entry);
      return statSync(path.join(repoRoot, relative)).isDirectory()
        ? sourceFiles(relative)
        : [relative];
    });
  }

  test("ninguna sentencia UPDATE, DELETE, REPLACE ni DROP nombra audit_event en src/ ni en scripts/", () => {
    const offenders = [...sourceFiles("src"), ...sourceFiles("scripts")]
      .filter((file) => /\.(?:ts|tsx|mjs|js)$/.test(file))
      .filter((file) => {
        const text = readFileSync(path.join(repoRoot, file), "utf8");
        return (
          /UPDATE\s+audit_event\b(?!_)/i.test(
            text.replace(/BEFORE UPDATE ON audit_event/g, ""),
          ) ||
          /DELETE\s+FROM\s+audit_event\b/i.test(text) ||
          /REPLACE\s+INTO\s+audit_event\b/i.test(text) ||
          /DROP\s+(?:TABLE|TRIGGER)\s+(?:IF\s+EXISTS\s+)?audit_event/i.test(
            text,
          )
        );
      });
    expect(offenders).toEqual([]);
  });
});
