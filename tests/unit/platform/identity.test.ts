// Identidad (specs/002-boe-scorm-export: T018 a T022; FR-026, FR-027, FR-054
// y FR-068; research.md, R2): contraseñas, sesiones, intentos repetidos,
// comprobación de origen y permisos.
//
// Las contraseñas de estas pruebas son sintéticas y únicas en cada ejecución.
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { createAudit } from "@/platform/audit";
import type { Audit } from "@/platform/audit";
import {
  createIdentity,
  DEFAULT_PASSWORD_PARAMS,
  MIN_PASSWORD_LENGTH,
  originAllowed,
  ROLES,
  safeEqual,
} from "@/platform/identity";
import type { Identity, SessionContext } from "@/platform/identity";
import {
  migrate,
  openMemoryDatabase,
  PLATFORM_MIGRATIONS,
} from "@/platform/persistence";

// Coste reducido solo para que las pruebas sean rápidas. El coste real se
// comprueba aparte.
const FAST = { N: 1024, r: 8, p: 1 } as const;
const MINUTE = 60_000;
const IDLE = 30 * MINUTE;
const MAX = 12 * 60 * MINUTE;

const RUN = randomUUID();
const PASSWORD = `inicial-${RUN}`;
const NEW_PASSWORD = `nueva-${RUN}`;
const WRONG = `incorrecta-${RUN}`;

let db: ReturnType<typeof openMemoryDatabase>;
let audit: Audit;
let identity: Identity;
let clock: number;

function advance(ms: number): void {
  clock += ms;
}

beforeEach(() => {
  db = openMemoryDatabase();
  migrate(db, PLATFORM_MIGRATIONS);
  audit = createAudit(db);
  clock = Date.parse("2026-01-01T09:00:00Z");
  identity = createIdentity({
    db,
    audit: (event) => {
      audit.record(event);
    },
    now: () => clock,
    sessionIdleMs: IDLE,
    sessionMaxMs: MAX,
    passwordParams: FAST,
  });
});

async function createUser(
  username: string,
  roles: readonly string[] = ["teacher"],
): Promise<void> {
  expect(
    await identity.createUser({
      username,
      password: PASSWORD,
      roles,
      correlationId: "alta",
    }),
  ).toEqual({ ok: true });
}

async function signIn(
  username: string,
  password: string = PASSWORD,
): ReturnType<Identity["signIn"]> {
  const entry = identity.beginEntry();
  return identity.signIn({
    entryCookie: entry.cookie,
    csrfToken: entry.csrfToken,
    username,
    password,
    correlationId: "entrada",
  });
}

async function sessionOf(username: string): Promise<{
  cookie: string;
  session: SessionContext;
}> {
  const result = await signIn(username);
  if (!result.ok) {
    expect.fail(`no se pudo entrar: ${result.reason}`);
  }
  const session = identity.resolveSession(result.cookie);
  if (session === null) {
    expect.fail("la sesión recién creada no se resuelve");
  }
  return { cookie: result.cookie, session };
}

function stored(username: string): Record<string, unknown> {
  const row = db
    .prepare("SELECT * FROM user_account WHERE username = ?")
    .get(username);
  if (row === undefined) {
    expect.fail("la cuenta no existe");
  }
  return row;
}

function everythingStored(): string {
  return JSON.stringify({
    audit: audit.list(),
    sessions: db.prepare("SELECT * FROM session").all(),
    throttle: db.prepare("SELECT * FROM sign_in_throttle").all(),
  });
}

describe("constantes", () => {
  test("el coste de partida es N = 2^17, r = 8, p = 1, y la longitud mínima, 12", () => {
    expect(DEFAULT_PASSWORD_PARAMS).toEqual({ N: 131072, r: 8, p: 1 });
    expect(Object.isFrozen(DEFAULT_PASSWORD_PARAMS)).toBe(true);
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(ROLES).toEqual(["admin", "teacher"]);
  });

  test("con el coste de partida, una contraseña se deriva y se verifica", async () => {
    const real = createIdentity({
      db,
      audit: () => undefined,
      now: () => clock,
      sessionIdleMs: IDLE,
      sessionMaxMs: MAX,
      passwordParams: DEFAULT_PASSWORD_PARAMS,
    });
    await real.createUser({
      username: "coste-real",
      password: PASSWORD,
      roles: [],
      correlationId: "alta",
    });
    expect(JSON.parse(String(stored("coste-real").password_params))).toEqual({
      N: 131072,
      r: 8,
      p: 1,
    });
    const entry = real.beginEntry();
    const result = await real.signIn({
      entryCookie: entry.cookie,
      csrfToken: entry.csrfToken,
      username: "coste-real",
      password: PASSWORD,
      correlationId: "entrada",
    });
    expect(result.ok).toBe(true);
  });
});

describe("contraseñas", () => {
  test("se guarda una derivación con sal propia y sus parámetros, nunca la contraseña", async () => {
    await createUser("docente1");
    await createUser("docente2");
    const first = stored("docente1");
    const second = stored("docente2");
    const [salt, key] = String(first.password_hash).split(":");
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(key).toMatch(/^[0-9a-f]{128}$/);
    expect(first.password_hash).not.toBe(second.password_hash);
    expect(JSON.parse(String(first.password_params))).toEqual(FAST);
    expect(
      JSON.stringify(db.prepare("SELECT * FROM user_account").all()),
    ).not.toContain(PASSWORD);
  });

  test.each([
    { name: "demasiado corta", password: "a".repeat(MIN_PASSWORD_LENGTH - 1) },
    { name: "vacía", password: "" },
    { name: "desmesurada", password: "a".repeat(257) },
  ])("createUser rechaza una contraseña $name", async ({ password }) => {
    expect(
      await identity.createUser({
        username: "docente1",
        password,
        roles: [],
        correlationId: "alta",
      }),
    ).toEqual({ ok: false, reason: "invalid_password" });
    expect(identity.listUsers()).toEqual([]);
  });

  test("una cuenta nueva debe cambiar su contraseña inicial", async () => {
    await createUser("docente1");
    const result = await signIn("docente1");
    expect(result).toMatchObject({ ok: true, mustChangePassword: true });
  });
});

describe("cuentas", () => {
  test.each([
    "ab",
    "Docente",
    "docente 1",
    "-docente",
    "docente@centro",
    "a".repeat(33),
  ])("createUser rechaza el nombre %j", async (username) => {
    expect(
      await identity.createUser({
        username,
        password: PASSWORD,
        roles: [],
        correlationId: "alta",
      }),
    ).toEqual({ ok: false, reason: "invalid_username" });
  });

  test("rechaza un perfil desconocido y un nombre repetido", async () => {
    expect(
      await identity.createUser({
        username: "docente1",
        password: PASSWORD,
        roles: ["reader"],
        correlationId: "alta",
      }),
    ).toEqual({ ok: false, reason: "invalid_roles" });
    await createUser("docente1");
    expect(
      await identity.createUser({
        username: "docente1",
        password: PASSWORD,
        roles: [],
        correlationId: "alta",
      }),
    ).toEqual({ ok: false, reason: "already_exists" });
  });

  test("listUsers no devuelve contraseñas ni huellas", async () => {
    await createUser("admin1", ["teacher", "admin"]);
    await createUser("sinperfil", []);
    const users = identity.listUsers();
    expect(users.map(({ username, roles }) => [username, roles])).toEqual([
      ["admin1", ["admin", "teacher"]],
      ["sinperfil", []],
    ]);
    expect(Object.keys(users[0] ?? {}).sort()).toEqual([
      "disabled",
      "id",
      "mustChangePassword",
      "roles",
      "username",
    ]);
  });

  test.each(["setRoles", "setDisabled", "revokeSessions"] as const)(
    "%s sobre una cuenta inexistente no cambia nada",
    (operation) => {
      const result =
        operation === "setRoles"
          ? identity.setRoles("nadie", ["admin"], "c")
          : operation === "setDisabled"
            ? identity.setDisabled("nadie", true, "c")
            : identity.revokeSessions("nadie", "c");
      expect(result).toEqual({ ok: false, reason: "not_found" });
      expect(audit.list()).toEqual([]);
    },
  );
});

describe("entrada", () => {
  test("con las credenciales correctas emite una sesión nueva y descarta la sesión previa", async () => {
    await createUser("docente1");
    const entry = identity.beginEntry();
    expect(identity.resolveEntry(entry.cookie)).toEqual({
      csrfToken: entry.csrfToken,
    });
    const result = await identity.signIn({
      entryCookie: entry.cookie,
      csrfToken: entry.csrfToken,
      username: "docente1",
      password: PASSWORD,
      correlationId: "entrada",
    });
    if (!result.ok) {
      expect.fail("se esperaba entrar");
    }
    expect(result.cookie).not.toBe(entry.cookie);
    expect(identity.resolveEntry(entry.cookie)).toBeNull();
    expect(identity.resolveSession(entry.cookie)).toBeNull();
    const session = identity.resolveSession(result.cookie);
    expect(session?.user).toMatchObject({
      username: "docente1",
      roles: ["teacher"],
    });
    expect(session?.csrfToken).not.toBe(entry.csrfToken);
  });

  test("la sesión previa anónima no es una sesión y no concede nada", () => {
    const entry = identity.beginEntry();
    expect(identity.resolveSession(entry.cookie)).toBeNull();
  });

  test.each([
    { name: "sin sesión previa", cookie: false, token: true },
    { name: "sin testigo", cookie: true, token: false },
    {
      name: "con el testigo de otra sesión previa",
      cookie: true,
      token: "otro",
    },
  ])("se rechaza $name aunque la contraseña sea correcta", async (scenario) => {
    await createUser("docente1");
    const entry = identity.beginEntry();
    const other = identity.beginEntry();
    const result = await identity.signIn({
      entryCookie: scenario.cookie ? entry.cookie : undefined,
      csrfToken:
        scenario.token === "otro"
          ? other.csrfToken
          : scenario.token
            ? entry.csrfToken
            : undefined,
      username: "docente1",
      password: PASSWORD,
      correlationId: "entrada",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_request" });
    expect(audit.list().at(-1)).toMatchObject({
      action: "session.sign_in",
      result: "denied",
      details: { reason: "invalid_request" },
    });
  });

  test("una sesión previa caducada no sirve", async () => {
    await createUser("docente1");
    const entry = identity.beginEntry();
    advance(15 * MINUTE);
    expect(identity.resolveEntry(entry.cookie)).toBeNull();
    const result = await identity.signIn({
      entryCookie: entry.cookie,
      csrfToken: entry.csrfToken,
      username: "docente1",
      password: PASSWORD,
      correlationId: "entrada",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_request" });
  });

  test("contraseña incorrecta, cuenta inexistente y cuenta desactivada dan el mismo resultado", async () => {
    await createUser("docente1");
    await createUser("desactivada");
    identity.setDisabled("desactivada", true, "c");
    const outcomes = [
      await signIn("docente1", WRONG),
      await signIn("no-existe", PASSWORD),
      await signIn("desactivada", PASSWORD),
    ];
    expect(outcomes).toEqual([
      { ok: false, reason: "invalid_credentials" },
      { ok: false, reason: "invalid_credentials" },
      { ok: false, reason: "invalid_credentials" },
    ]);
  });

  test("no se guarda ni se audita el nombre tecleado, la contraseña, la cookie ni el testigo", async () => {
    await createUser("docente1");
    const typed = `tecleado-${RUN}`;
    await signIn(typed, WRONG);
    await signIn("docente1", WRONG);
    const { cookie, session } = await sessionOf("docente1");
    const everything = everythingStored();
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toContain(WRONG);
    expect(JSON.stringify(audit.list())).not.toContain(typed);
    expect(everything).not.toContain(cookie);
    expect(JSON.stringify(audit.list())).not.toContain(session.csrfToken);
  });

  test("audita cada entrada, correcta o fallida, con su cuenta cuando existe", async () => {
    await createUser("docente1");
    await signIn("docente1", WRONG);
    await signIn("no-existe", WRONG);
    await signIn("docente1");
    const id = stored("docente1").id;
    expect(
      audit
        .list()
        .filter(({ action }) => action === "session.sign_in")
        .map(({ result, targetId, actorId }) => [result, targetId, actorId]),
    ).toEqual([
      ["failed", id, null],
      ["failed", null, null],
      ["ok", id, id],
    ]);
  });
});

describe("intentos repetidos", () => {
  test("los dos primeros fallos no bloquean; el tercero bloquea 5 s y cada fallo posterior duplica la espera", async () => {
    await createUser("docente1");
    expect((await signIn("docente1", WRONG)).ok).toBe(false);
    expect((await signIn("docente1", WRONG)).ok).toBe(false);
    expect(await signIn("docente1", WRONG)).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    // Bloqueada: ni la contraseña correcta entra.
    expect(await signIn("docente1")).toEqual({
      ok: false,
      reason: "throttled",
    });
    advance(4999);
    expect(await signIn("docente1")).toEqual({
      ok: false,
      reason: "throttled",
    });
    advance(1);
    expect((await signIn("docente1", WRONG)).ok).toBe(false);
    advance(9999);
    expect(await signIn("docente1")).toEqual({
      ok: false,
      reason: "throttled",
    });
    advance(1);
    expect((await signIn("docente1")).ok).toBe(true);
  });

  test("el bloqueo no supera 15 minutos, ni siquiera ante quien insiste", async () => {
    await createUser("docente1");
    // Cada fallo llega justo al terminar el bloqueo anterior, que nunca
    // supera los 15 minutos.
    for (let attempt = 0; attempt < 13; attempt += 1) {
      expect(await signIn("docente1", WRONG)).toEqual({
        ok: false,
        reason: "invalid_credentials",
      });
      advance(15 * MINUTE);
    }
    expect((await signIn("docente1", WRONG)).ok).toBe(false);
    advance(15 * MINUTE - 1);
    expect(await signIn("docente1")).toEqual({
      ok: false,
      reason: "throttled",
    });
    advance(1);
    expect((await signIn("docente1")).ok).toBe(true);
  });

  test("tras 30 minutos sin fallos, el contador de la cuenta vuelve a empezar", async () => {
    await createUser("docente1");
    await signIn("docente1", WRONG);
    await signIn("docente1", WRONG);
    advance(30 * MINUTE);
    await signIn("docente1", WRONG);
    await signIn("docente1", WRONG);
    expect((await signIn("docente1")).ok).toBe(true);
  });

  test("entrar con éxito borra el contador de la cuenta", async () => {
    await createUser("docente1");
    await signIn("docente1", WRONG);
    await signIn("docente1", WRONG);
    expect((await signIn("docente1")).ok).toBe(true);
    await signIn("docente1", WRONG);
    await signIn("docente1", WRONG);
    expect((await signIn("docente1")).ok).toBe(true);
  });

  test("el bloqueo es por nombre: también se aplica a una cuenta inexistente y no afecta a otra", async () => {
    await createUser("docente1");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await signIn("no-existe", WRONG);
    }
    expect(await signIn("no-existe", WRONG)).toEqual({
      ok: false,
      reason: "throttled",
    });
    expect((await signIn("docente1")).ok).toBe(true);
  });

  test("un intento bloqueado se audita como denegado", async () => {
    await createUser("docente1");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await signIn("docente1", WRONG);
    }
    expect(audit.list().at(-1)).toMatchObject({
      action: "session.sign_in",
      result: "denied",
      details: { reason: "throttled" },
    });
  });

  test("50 fallos en cinco minutos, aunque sean de nombres distintos, bloquean toda entrada durante un minuto", async () => {
    await createUser("docente1");
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await signIn(`nombre-${String(attempt)}`, WRONG);
    }
    expect(await signIn("docente1")).toEqual({
      ok: false,
      reason: "throttled",
    });
    advance(MINUTE);
    expect((await signIn("docente1")).ok).toBe(true);
  });
});

describe("caducidad de la sesión", () => {
  test("caduca tras el periodo de inactividad", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    advance(IDLE - 1);
    expect(identity.resolveSession(cookie)).not.toBeNull();
    advance(IDLE);
    expect(identity.resolveSession(cookie)).toBeNull();
  });

  test("el uso renueva el periodo de inactividad, pero no la duración máxima", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    for (let elapsed = 0; elapsed + 20 * MINUTE < MAX; elapsed += 20 * MINUTE) {
      advance(20 * MINUTE);
      expect(identity.resolveSession(cookie), String(elapsed)).not.toBeNull();
    }
    advance(20 * MINUTE);
    expect(identity.resolveSession(cookie)).toBeNull();
  });

  test("una sesión caducada no vuelve a servir", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    advance(IDLE);
    expect(identity.resolveSession(cookie)).toBeNull();
    clock -= IDLE;
    advance(IDLE + MAX);
    expect(identity.resolveSession(cookie)).toBeNull();
  });

  test.each([undefined, "", "no-es-una-cookie", "a".repeat(43)])(
    "resolveSession(%j) no encuentra sesión",
    (cookie) => {
      expect(identity.resolveSession(cookie)).toBeNull();
    },
  );
});

describe("revocación de sesiones", () => {
  test("salir revoca la sesión y lo audita", async () => {
    await createUser("docente1");
    const { cookie, session } = await sessionOf("docente1");
    identity.signOut(cookie, "salida");
    expect(identity.resolveSession(cookie)).toBeNull();
    expect(audit.list().at(-1)).toMatchObject({
      action: "session.sign_out",
      actorId: session.user.id,
      correlationId: "salida",
    });
  });

  test("salir con una cookie desconocida no hace nada", () => {
    identity.signOut("desconocida", "salida");
    identity.signOut(undefined, "salida");
    expect(audit.list()).toEqual([]);
  });

  test.each([
    {
      name: "cambiar sus perfiles",
      act: () => identity.setRoles("docente1", ["admin"], "c"),
    },
    {
      name: "desactivar la cuenta",
      act: () => identity.setDisabled("docente1", true, "c"),
    },
    {
      name: "cerrar sus sesiones",
      act: () => identity.revokeSessions("docente1", "c"),
    },
    {
      name: "asignarle otra contraseña",
      act: () => identity.resetPassword("docente1", NEW_PASSWORD, "c"),
    },
  ])("$name revoca todas las sesiones de la cuenta", async ({ act }) => {
    await createUser("docente1");
    await createUser("docente2");
    const first = await sessionOf("docente1");
    const second = await sessionOf("docente1");
    const other = await sessionOf("docente2");
    expect(await act()).toEqual({ ok: true });
    expect(identity.resolveSession(first.cookie)).toBeNull();
    expect(identity.resolveSession(second.cookie)).toBeNull();
    expect(identity.resolveSession(other.cookie)).not.toBeNull();
  });

  test("una cuenta desactivada no entra; reactivada, vuelve a entrar", async () => {
    await createUser("docente1");
    identity.setDisabled("docente1", true, "c");
    expect((await signIn("docente1")).ok).toBe(false);
    advance(15 * MINUTE);
    identity.setDisabled("docente1", false, "c");
    expect((await signIn("docente1")).ok).toBe(true);
  });

  test("los perfiles se leen en cada petición: un cambio hecho por fuera se ve en la siguiente", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    db.prepare(
      "UPDATE user_account SET roles = 'admin' WHERE username = ?",
    ).run("docente1");
    expect(identity.resolveSession(cookie)?.user.roles).toEqual(["admin"]);
    db.prepare("UPDATE user_account SET disabled = 1 WHERE username = ?").run(
      "docente1",
    );
    expect(identity.resolveSession(cookie)).toBeNull();
  });

  test("cada cambio de cuenta se audita, con los perfiles anteriores y nuevos", async () => {
    await createUser("docente1");
    identity.setRoles("docente1", ["admin", "teacher"], "c1");
    identity.setDisabled("docente1", true, "c2");
    identity.setDisabled("docente1", false, "c3");
    await identity.resetPassword("docente1", NEW_PASSWORD, "c4");
    identity.revokeSessions("docente1", "c5");
    expect(
      audit.list().map(({ action, details }) => [action, details]),
    ).toEqual([
      ["user.created", { via: "admin-script", roles: "teacher" }],
      [
        "user.roles_changed",
        { via: "admin-script", previous: "teacher", roles: "admin,teacher" },
      ],
      ["user.disabled", { via: "admin-script" }],
      ["user.enabled", { via: "admin-script" }],
      ["user.password_reset", { via: "admin-script" }],
      ["user.sessions_revoked", { via: "admin-script" }],
    ]);
    expect(JSON.stringify(audit.list())).not.toContain(NEW_PASSWORD);
  });
});

describe("cambio de contraseña", () => {
  test("cambia la contraseña, revoca todas las sesiones y devuelve una nueva", async () => {
    await createUser("docente1");
    const current = await sessionOf("docente1");
    const elsewhere = await sessionOf("docente1");
    const result = await identity.changePassword({
      session: current.session,
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      correlationId: "cambio",
    });
    if (!result.ok) {
      expect.fail("se esperaba cambiar la contraseña");
    }
    expect(identity.resolveSession(current.cookie)).toBeNull();
    expect(identity.resolveSession(elsewhere.cookie)).toBeNull();
    const renewed = identity.resolveSession(result.cookie);
    expect(renewed?.user.mustChangePassword).toBe(false);
    expect(renewed?.csrfToken).not.toBe(current.session.csrfToken);
    expect((await signIn("docente1", PASSWORD)).ok).toBe(false);
    expect((await signIn("docente1", NEW_PASSWORD)).ok).toBe(true);
    expect(everythingStored()).not.toContain(NEW_PASSWORD);
  });

  test.each([
    {
      name: "la actual no es correcta",
      current: WRONG,
      next: NEW_PASSWORD,
      reason: "invalid_current",
    },
    {
      name: "la nueva es demasiado corta",
      current: PASSWORD,
      next: "corta",
      reason: "invalid_new",
    },
    {
      name: "la nueva es igual a la actual",
      current: PASSWORD,
      next: PASSWORD,
      reason: "unchanged",
    },
  ])("no cambia nada si $name", async ({ current, next, reason }) => {
    await createUser("docente1");
    const { cookie, session } = await sessionOf("docente1");
    const before = stored("docente1").password_hash;
    expect(
      await identity.changePassword({
        session,
        currentPassword: current,
        newPassword: next,
        correlationId: "cambio",
      }),
    ).toEqual({ ok: false, reason });
    expect(stored("docente1").password_hash).toBe(before);
    expect(identity.resolveSession(cookie)).not.toBeNull();
    expect(audit.list().at(-1)).toMatchObject({
      action: "user.password_changed",
      result: "failed",
      details: { reason },
    });
  });
});

describe("authorize(session, required, operation, correlationId)", () => {
  test("null exige solo una sesión: lo cumple cualquier cuenta, también sin perfiles", async () => {
    await createUser("sinperfil", []);
    const { session } = await sessionOf("sinperfil");
    const before = audit.list().length;
    expect(identity.authorize(session, null, "inicio", "c")).toBe(true);
    expect(audit.list()).toHaveLength(before);
  });

  test.each([
    { roles: ["teacher"], required: "teacher", granted: true },
    { roles: ["admin"], required: "admin", granted: true },
    { roles: ["admin", "teacher"], required: "teacher", granted: true },
    { roles: ["teacher"], required: "admin", granted: false },
    { roles: ["admin"], required: "teacher", granted: false },
    { roles: [], required: "teacher", granted: false },
    { roles: [], required: "admin", granted: false },
  ] as const)(
    "perfiles $roles, exigido $required: concedido $granted",
    async ({ roles, required, granted }) => {
      await createUser("cuenta1", roles);
      const { session } = await sessionOf("cuenta1");
      const before = audit.list().length;
      expect(identity.authorize(session, required, "operacion.x", "c-9")).toBe(
        granted,
      );
      const added = audit.list().slice(before);
      if (granted) {
        expect(added).toEqual([]);
      } else {
        expect(added).toHaveLength(1);
        expect(added[0]).toMatchObject({
          action: "access.denied",
          result: "denied",
          actorId: session.user.id,
          correlationId: "c-9",
          details: { operation: "operacion.x", required },
        });
      }
    },
  );

  test("administrar no incluye el perfil docente", async () => {
    await createUser("admin1", ["admin"]);
    const { session } = await sessionOf("admin1");
    expect(identity.authorize(session, "teacher", "revisar", "c")).toBe(false);
  });
});

describe("originAllowed(publicOrigin, origin, secFetchSite)", () => {
  const ORIGIN = "https://aulanorma.example";

  test.each([
    { origin: ORIGIN, site: undefined, allowed: true },
    { origin: ORIGIN, site: "same-origin", allowed: true },
    { origin: ORIGIN, site: "same-site", allowed: false },
    { origin: ORIGIN, site: "cross-site", allowed: false },
    { origin: ORIGIN, site: "none", allowed: false },
    { origin: undefined, site: undefined, allowed: false },
    { origin: undefined, site: "same-origin", allowed: false },
    { origin: "null", site: undefined, allowed: false },
    { origin: "https://otro.example", site: undefined, allowed: false },
    { origin: "http://aulanorma.example", site: undefined, allowed: false },
    { origin: `${ORIGIN}:8443`, site: undefined, allowed: false },
    { origin: `${ORIGIN}/`, site: undefined, allowed: false },
    {
      origin: "https://aulanorma.example.atacante.example",
      site: undefined,
      allowed: false,
    },
  ])(
    "Origin $origin y Sec-Fetch-Site $site: $allowed",
    ({ origin, site, allowed }) => {
      expect(originAllowed(ORIGIN, origin, site)).toBe(allowed);
    },
  );
});

describe("safeEqual(left, right)", () => {
  test("compara textos de cualquier longitud sin lanzar", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("", "a")).toBe(false);
  });
});

// Plazos de la sesión y ampliación expresa (T082; WCAG 2.2.1). La ampliación
// la pide el usuario desde el aviso de caducidad; el servidor decide.
describe("plazos y ampliación de la sesión", () => {
  test("la sesión informa de cuándo caduca por inactividad y de cuándo termina", async () => {
    await createUser("docente1");
    const start = clock;
    const { cookie, session } = await sessionOf("docente1");
    expect(session.idleMs).toBe(IDLE);
    expect(session.idleExpiresAt).toBe(start + IDLE);
    expect(session.expiresAt).toBe(start + MAX);

    // Una petición posterior retrasa la inactividad, no la duración máxima.
    advance(10 * MINUTE);
    const later = identity.resolveSession(cookie);
    expect(later?.idleExpiresAt).toBe(start + 10 * MINUTE + IDLE);
    expect(later?.expiresAt).toBe(start + MAX);
  });

  test("ampliar retrasa la caducidad por inactividad desde ese instante, y se registra", async () => {
    await createUser("docente1");
    const start = clock;
    const { cookie } = await sessionOf("docente1");
    advance(IDLE - 1000);

    expect(identity.extendSession(cookie, "ampliación")).toEqual({
      idleExpiresAt: clock + IDLE,
      expiresAt: start + MAX,
    });

    // Sin la ampliación habría caducado un segundo después.
    advance(IDLE - 1000);
    expect(identity.resolveSession(cookie)).not.toBeNull();
    expect(
      audit
        .list()
        .filter((event) => event.action === "session.extended")
        .map(({ actorId, result, correlationId }) => ({
          actor: actorId !== null,
          result,
          correlationId,
        })),
    ).toEqual([{ actor: true, result: "ok", correlationId: "ampliación" }]);
  });

  test("ampliar justo después de otra petición también cuenta: no depende de la precisión con que se anota la actividad", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    advance(IDLE - 5000);
    expect(identity.resolveSession(cookie)).not.toBeNull();
    advance(4000);
    expect(identity.extendSession(cookie, "c")?.idleExpiresAt).toBe(
      clock + IDLE,
    );
    advance(IDLE - 1);
    expect(identity.resolveSession(cookie)).not.toBeNull();
  });

  test("se puede ampliar más de diez veces seguidas, cada una sin ninguna otra actividad", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    // Veintitrés ampliaciones caben en doce horas con media hora de
    // inactividad.
    for (let round = 1; round <= 23; round += 1) {
      advance(IDLE - 1000);
      expect(identity.extendSession(cookie, "c"), String(round)).not.toBeNull();
    }
    expect(identity.resolveSession(cookie)).not.toBeNull();
    expect(
      audit.list().filter((event) => event.action === "session.extended"),
    ).toHaveLength(23);
  });

  test("sin peticiones ni ampliación, la sesión caduca: nada la mantiene sola", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    advance(IDLE);
    expect(identity.resolveSession(cookie)).toBeNull();
    // Ya caducada, no se puede ampliar ni revive.
    expect(identity.extendSession(cookie, "c")).toBeNull();
    expect(identity.resolveSession(cookie)).toBeNull();
    expect(
      audit.list().filter((event) => event.action === "session.extended"),
    ).toEqual([]);
  });

  test("ampliar no retrasa la duración máxima", async () => {
    await createUser("docente1");
    const start = clock;
    const { cookie } = await sessionOf("docente1");
    while (clock + IDLE - 1000 < start + MAX) {
      advance(IDLE - 1000);
      expect(identity.extendSession(cookie, "c")?.expiresAt).toBe(start + MAX);
    }
    clock = start + MAX - 1;
    expect(identity.extendSession(cookie, "c")?.expiresAt).toBe(start + MAX);
    clock = start + MAX;
    expect(identity.extendSession(cookie, "c")).toBeNull();
    expect(identity.resolveSession(cookie)).toBeNull();
  });

  test("una sesión revocada, cerrada o de una cuenta desactivada no se amplía", async () => {
    await createUser("docente1");
    const revoked = await sessionOf("docente1");
    identity.revokeSessions("docente1", "c");
    expect(identity.extendSession(revoked.cookie, "c")).toBeNull();

    const closed = await sessionOf("docente1");
    identity.signOut(closed.cookie, "c");
    expect(identity.extendSession(closed.cookie, "c")).toBeNull();

    const disabled = await sessionOf("docente1");
    identity.setDisabled("docente1", true, "c");
    expect(identity.extendSession(disabled.cookie, "c")).toBeNull();
    identity.setDisabled("docente1", false, "c");
    expect(identity.extendSession(disabled.cookie, "c")).toBeNull();

    expect(identity.extendSession(undefined, "c")).toBeNull();
    expect(identity.extendSession("", "c")).toBeNull();
    expect(identity.extendSession("no-es-una-sesión", "c")).toBeNull();
    // La sesión de entrada, sin cuenta, tampoco.
    expect(
      identity.extendSession(identity.beginEntry().cookie, "c"),
    ).toBeNull();
    expect(
      audit.list().filter((event) => event.action === "session.extended"),
    ).toEqual([]);
  });

  test("con un periodo de inactividad de un minuto, la actividad se anota a tiempo", async () => {
    const short = createIdentity({
      db,
      audit: (event) => {
        audit.record(event);
      },
      now: () => clock,
      sessionIdleMs: MINUTE,
      sessionMaxMs: MAX,
      passwordParams: FAST,
    });
    await createUser("docente1");
    const entry = short.beginEntry();
    const signedIn = await short.signIn({
      entryCookie: entry.cookie,
      csrfToken: entry.csrfToken,
      username: "docente1",
      password: PASSWORD,
      correlationId: "entrada",
    });
    if (!signedIn.ok) {
      expect.fail("no se pudo entrar");
    }
    // Una petición cada 40 segundos durante cinco minutos mantiene la sesión.
    for (let step = 0; step < 8; step += 1) {
      advance(40_000);
      expect(
        short.resolveSession(signedIn.cookie),
        String(step),
      ).not.toBeNull();
    }
    advance(MINUTE);
    expect(short.resolveSession(signedIn.cookie)).toBeNull();
  });
});

// Renovación de la autenticación sin salir de la página (FR-071; WCAG 2.2.1).
// La sesión no se prolonga: se sustituye por otra nueva, con la contraseña.
describe("renovación de la sesión", () => {
  const sessions = (): Record<string, unknown>[] =>
    db.prepare("SELECT * FROM session WHERE user_id IS NOT NULL").all();
  const live = (): Record<string, unknown>[] =>
    sessions().filter((row) => row.revoked_at === null);
  const renewals = (): string[] =>
    audit
      .list()
      .filter((event) => event.action === "session.renew")
      .map(
        ({ result, details }) =>
          `${result}${typeof details.reason === "string" ? `:${details.reason}` : ""}`,
      );
  const renew = (
    cookie: string | undefined,
    password: string = PASSWORD,
  ): ReturnType<Identity["renewSession"]> =>
    identity.renewSession({ cookie, password, correlationId: "renovación" });

  test("con la contraseña correcta crea una sesión nueva, con otro identificador, otro testigo y su propia duración máxima, y revoca la anterior", async () => {
    await createUser("docente1");
    const second = await sessionOf("docente1");
    advance(20 * MINUTE);

    const result = await renew(second.cookie);
    if (!result.ok) {
      expect.fail(result.reason);
    }
    expect(result.cookie).not.toBe(second.cookie);
    expect(result.csrfToken).not.toBe(second.session.csrfToken);
    expect(result.idleExpiresAt).toBe(clock + IDLE);
    expect(result.idleMs).toBe(IDLE);
    // Doce horas desde la renovación, no desde la entrada.
    expect(result.expiresAt).toBe(clock + MAX);

    expect(identity.resolveSession(second.cookie)).toBeNull();
    expect(identity.wasRenewed(second.cookie)).toBe(true);
    const renewed = identity.resolveSession(result.cookie);
    expect(renewed?.csrfToken).toBe(result.csrfToken);
    expect(renewed?.user.username).toBe("docente1");
    expect(renewed?.expiresAt).toBe(clock + MAX);
    expect(live()).toHaveLength(1);
    expect(renewals()).toEqual(["ok"]);
  });

  test("la sesión anterior no revive: ni se resuelve, ni se amplía, ni se renueva otra vez", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    const result = await renew(cookie);
    expect(result.ok).toBe(true);

    expect(identity.resolveSession(cookie)).toBeNull();
    expect(identity.resolveSession(cookie, { touch: false })).toBeNull();
    expect(identity.extendSession(cookie, "c")).toBeNull();
    expect(await renew(cookie)).toEqual({ ok: false, reason: "session_ended" });
    expect(live()).toHaveLength(1);
    // Una sesión cerrada o caducada no figura como renovada.
    const other = await sessionOf("docente1");
    identity.signOut(other.cookie, "c");
    expect(identity.wasRenewed(other.cookie)).toBe(false);
    expect(identity.wasRenewed(undefined)).toBe(false);
    expect(identity.wasRenewed("no-es-una-sesión")).toBe(false);
  });

  test("el testigo de la sesión sustituida se reconoce como anterior, y solo desde la sesión que la sustituyó", async () => {
    await createUser("docente1");
    await createUser("docente2");
    const before = await sessionOf("docente1");
    const result = await renew(before.cookie);
    if (!result.ok) {
      expect.fail(result.reason);
    }
    expect(
      identity.isPreviousToken(result.cookie, before.session.csrfToken),
    ).toBe(true);
    expect(identity.isPreviousToken(result.cookie, result.csrfToken)).toBe(
      false,
    );
    expect(identity.isPreviousToken(result.cookie, "inventado")).toBe(false);
    expect(identity.isPreviousToken(result.cookie, "")).toBe(false);
    // Desde otra sesión, o desde la propia sustituida, no significa nada.
    const stranger = await sessionOf("docente2");
    expect(
      identity.isPreviousToken(stranger.cookie, before.session.csrfToken),
    ).toBe(false);
    expect(
      identity.isPreviousToken(before.cookie, before.session.csrfToken),
    ).toBe(false);
    // Tras una segunda renovación, el testigo de la primera sesión ya no
    // vale ni como anterior.
    const again = await renew(result.cookie);
    if (!again.ok) {
      expect.fail(again.reason);
    }
    expect(identity.isPreviousToken(again.cookie, result.csrfToken)).toBe(true);
    expect(
      identity.isPreviousToken(again.cookie, before.session.csrfToken),
    ).toBe(false);
  });

  test("con una contraseña incorrecta no cambia nada: la sesión sigue igual y el fallo se registra", async () => {
    await createUser("docente1");
    const { cookie, session } = await sessionOf("docente1");
    const before = JSON.stringify(sessions());

    expect(await renew(cookie, WRONG)).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(JSON.stringify(sessions())).toBe(before);
    expect(identity.resolveSession(cookie)?.csrfToken).toBe(session.csrfToken);
    expect(identity.wasRenewed(cookie)).toBe(false);
    expect(renewals()).toEqual(["failed:invalid_credentials"]);
  });

  test("usa el control de intentos de la entrada: los fallos de renovar y de entrar se suman, y el bloqueo vale para las dos", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    // Dos fallos al renovar y uno al entrar: al tercero, bloqueo.
    await renew(cookie, WRONG);
    await renew(cookie, WRONG);
    expect((await signIn("docente1", WRONG)).ok).toBe(false);

    expect(await renew(cookie)).toEqual({ ok: false, reason: "throttled" });
    expect(await signIn("docente1")).toMatchObject({
      ok: false,
      reason: "throttled",
    });
    // La sesión no se pierde por el bloqueo.
    expect(identity.resolveSession(cookie)).not.toBeNull();
    expect(renewals().at(-1)).toBe("denied:throttled");

    // Pasado el bloqueo, la contraseña correcta renueva y limpia los fallos.
    advance(6000);
    const result = await renew(cookie);
    expect(result.ok).toBe(true);
    expect(
      db
        .prepare(
          "SELECT count(*) AS n FROM sign_in_throttle WHERE subject LIKE 'account:%'",
        )
        .get()?.n,
    ).toBe(0);
  });

  test("tres fallos seguidos al renovar bloquean también la entrada", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await renew(cookie, WRONG);
    }
    expect(await signIn("docente1")).toMatchObject({
      ok: false,
      reason: "throttled",
    });
  });

  // La comprobación de la contraseña tarda. Lo que ocurra mientras tanto se
  // provoca justo después de pedir la renovación, antes de que termine.
  test.each([
    {
      name: "se revocan sus sesiones",
      during: () => identity.revokeSessions("docente1", "c"),
    },
    {
      name: "se cierra la sesión",
      during: (cookie: string) => {
        identity.signOut(cookie, "c");
      },
    },
    {
      name: "se desactiva la cuenta",
      during: () => identity.setDisabled("docente1", true, "c"),
    },
    {
      name: "cambian sus permisos",
      during: () => identity.setRoles("docente1", ["admin"], "c"),
    },
    {
      name: "caduca por inactividad",
      during: () => {
        advance(IDLE);
      },
    },
    {
      name: "alcanza su duración máxima",
      during: () => {
        advance(MAX);
      },
    },
  ])(
    "si mientras se comprueba la contraseña $name, no se renueva nada",
    async ({ during }) => {
      await createUser("docente1");
      const { cookie } = await sessionOf("docente1");
      const count = sessions().length;

      const pending = renew(cookie);
      during(cookie);
      expect(await pending).toEqual({ ok: false, reason: "session_ended" });

      // Ni una fila más: no se ha creado ninguna sesión.
      expect(sessions()).toHaveLength(count);
      expect(identity.resolveSession(cookie)).toBeNull();
      expect(identity.wasRenewed(cookie)).toBe(false);
      expect(renewals()).toEqual(["denied:session_ended"]);
    },
  );

  test("si mientras se comprueba cambia la contraseña de la cuenta, no se renueva con la antigua", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    const pending = renew(cookie);
    // La cambia quien administra, a la vez: además revoca todas las
    // sesiones. Termine antes una cosa o la otra, no queda ninguna
    // utilizable.
    await identity.resetPassword("docente1", NEW_PASSWORD, "c");
    const outcome = await pending;
    expect(identity.resolveSession(cookie)).toBeNull();
    expect(
      outcome.ok ? identity.resolveSession(outcome.cookie) : null,
    ).toBeNull();
    expect(live()).toEqual([]);

    // Aunque la sesión siguiera viva, la contraseña comprobada ya no es la
    // de la cuenta.
    const fresh = await signIn("docente1", NEW_PASSWORD);
    if (!fresh.ok) {
      expect.fail(fresh.reason);
    }
    const second = renew(fresh.cookie, NEW_PASSWORD);
    db.prepare(
      "UPDATE user_account SET password_hash = 'otra:huella' WHERE username = ?",
    ).run("docente1");
    expect(await second).toEqual({ ok: false, reason: "session_ended" });
    expect(identity.wasRenewed(fresh.cookie)).toBe(false);
  });

  test("dos renovaciones simultáneas de la misma sesión: solo una la sustituye", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    const [first, second] = await Promise.all([renew(cookie), renew(cookie)]);
    const results = [first, second];
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "session_ended" },
    ]);
    expect(live()).toHaveLength(1);
    expect(identity.resolveSession(cookie)).toBeNull();
    const winner = results.find((result) => result.ok);
    expect(winner?.ok && identity.resolveSession(winner.cookie)).toBeTruthy();
    expect(renewals().sort()).toEqual(["denied:session_ended", "ok"]);
  });

  test("si falla al guardar, no queda ni la sesión nueva ni la anterior revocada", async () => {
    await createUser("docente1");
    const { cookie, session } = await sessionOf("docente1");
    const before = JSON.stringify(sessions());
    // El registro de la renovación forma parte de la transacción.
    db.exec(
      "CREATE TRIGGER fallo BEFORE INSERT ON audit_event " +
        "WHEN NEW.action = 'session.renew' AND NEW.result = 'ok' " +
        "BEGIN SELECT RAISE(ABORT, 'fallo provocado'); END;",
    );
    await expect(renew(cookie)).rejects.toThrow("fallo provocado");
    db.exec("DROP TRIGGER fallo");

    expect(JSON.stringify(sessions())).toBe(before);
    expect(identity.resolveSession(cookie)?.csrfToken).toBe(session.csrfToken);
    // Y puede renovarse después con normalidad.
    expect((await renew(cookie)).ok).toBe(true);
  });

  test("no se renueva sin sesión, con una sesión de entrada ni con una cuenta desactivada", async () => {
    await createUser("docente1");
    expect(await renew(undefined)).toEqual({
      ok: false,
      reason: "session_ended",
    });
    expect(await renew("")).toEqual({ ok: false, reason: "session_ended" });
    expect(await renew(identity.beginEntry().cookie)).toEqual({
      ok: false,
      reason: "session_ended",
    });
    const { cookie } = await sessionOf("docente1");
    identity.setDisabled("docente1", true, "c");
    expect(await renew(cookie)).toEqual({ ok: false, reason: "session_ended" });
    expect(live()).toEqual([]);
  });

  test("ni el registro ni los resultados fallidos contienen contraseñas, cookies ni testigos", async () => {
    await createUser("docente1");
    const { cookie, session } = await sessionOf("docente1");
    const refused = await renew(cookie, WRONG);
    const result = await renew(cookie);
    if (!result.ok) {
      expect.fail(result.reason);
    }
    const recorded = JSON.stringify(audit.list());
    for (const secret of [
      PASSWORD,
      WRONG,
      cookie,
      session.csrfToken,
      result.cookie,
      result.csrfToken,
    ]) {
      expect(recorded).not.toContain(secret);
      expect(JSON.stringify(refused)).not.toContain(secret);
    }
    // En la base, el identificador de la sesión es su huella, no la cookie.
    expect(JSON.stringify(sessions())).not.toContain(result.cookie);
    expect(JSON.stringify(sessions())).not.toContain(cookie);
  });

  test("comprobar una sesión sin anotar actividad no retrasa su caducidad", async () => {
    await createUser("docente1");
    const { cookie } = await sessionOf("docente1");
    advance(IDLE - MINUTE);
    const peeked = identity.resolveSession(cookie, { touch: false });
    expect(peeked?.idleExpiresAt).toBe(clock + MINUTE);
    advance(MINUTE);
    expect(identity.resolveSession(cookie)).toBeNull();
  });
});
