// Identidad: cuentas, contraseñas, sesiones, intentos de entrada, CSRF y
// permisos (specs/002-boe-scorm-export: FR-026, FR-027, FR-054 y FR-068;
// research.md, R2; data-model.md, «Plataforma»; ADR 0004). Módulo portable:
// solo importa módulos incluidos en Node.js y usa sintaxis TypeScript borrable.
//
// Solo usa primitivas de `node:crypto`: `scrypt` para las contraseñas,
// `randomBytes` para los identificadores y testigos, SHA-256 para no guardar
// el identificador de sesión y `timingSafeEqual` para comparar.
//
// Nunca devuelve, registra ni audita contraseñas, huellas, identificadores de
// sesión ni testigos. El nombre de usuario que alguien teclea al entrar tampoco
// se audita: puede ser una contraseña escrita en el campo equivocado.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type Role = "admin" | "teacher";
export const ROLES: readonly Role[] = Object.freeze(["admin", "teacher"]);

export interface PasswordParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

// Coste de partida; se guarda con cada huella para poder subirlo sin
// invalidar las cuentas existentes.
export const DEFAULT_PASSWORD_PARAMS: PasswordParams = Object.freeze({
  N: 131072,
  r: 8,
  p: 1,
});

export const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

const ENTRY_LIFETIME_MS = 15 * 60_000;
const LAST_SEEN_PRECISION_MS = 60_000;
// Los fallos de una cuenta se acumulan mientras no pasen 30 minutos sin
// ninguno; así el bloqueo máximo, de 15 minutos, se mantiene ante quien
// insiste.
const ACCOUNT_WINDOW_MS = 30 * 60_000;
const ACCOUNT_FREE_ATTEMPTS = 3;
const ACCOUNT_FIRST_LOCK_MS = 5000;
const ACCOUNT_MAX_LOCK_MS = 15 * 60_000;
const GLOBAL_SUBJECT = "global";
const GLOBAL_WINDOW_MS = 5 * 60_000;
const GLOBAL_FAILURES = 50;
const GLOBAL_LOCK_MS = 60_000;

export interface IdentityAuditEvent {
  readonly actorId: string | null;
  readonly action: string;
  readonly targetKind: string | null;
  readonly targetId: string | null;
  readonly result: "ok" | "denied" | "failed";
  readonly correlationId: string;
  readonly details: Readonly<Record<string, string | number | boolean>>;
}

export interface IdentityOptions {
  readonly db: DatabaseSync;
  readonly audit: (event: IdentityAuditEvent) => void;
  readonly now: () => number;
  readonly sessionIdleMs: number;
  readonly sessionMaxMs: number;
  readonly passwordParams: PasswordParams;
}

export interface UserSummary {
  readonly id: string;
  readonly username: string;
  readonly roles: readonly Role[];
  readonly disabled: boolean;
  readonly mustChangePassword: boolean;
}

export interface SessionContext {
  readonly csrfToken: string;
  readonly user: UserSummary;
}

export interface EntryContext {
  readonly csrfToken: string;
}

export interface IssuedEntry extends EntryContext {
  readonly cookie: string;
}

export type SignInResult =
  | {
      readonly ok: true;
      readonly cookie: string;
      readonly mustChangePassword: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid_request" | "throttled" | "invalid_credentials";
    };

export type PasswordChangeResult =
  | { readonly ok: true; readonly cookie: string }
  | {
      readonly ok: false;
      readonly reason: "invalid_current" | "invalid_new" | "unchanged";
    };

export type AdminResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "invalid_username"
        | "invalid_password"
        | "invalid_roles"
        | "already_exists"
        | "not_found";
    };

export interface Identity {
  createUser(input: {
    readonly username: string;
    readonly password: string;
    readonly roles: readonly string[];
    readonly correlationId: string;
  }): Promise<AdminResult>;
  setRoles(
    username: string,
    roles: readonly string[],
    correlationId: string,
  ): AdminResult;
  setDisabled(
    username: string,
    disabled: boolean,
    correlationId: string,
  ): AdminResult;
  resetPassword(
    username: string,
    password: string,
    correlationId: string,
  ): Promise<AdminResult>;
  revokeSessions(username: string, correlationId: string): AdminResult;
  listUsers(): readonly UserSummary[];
  beginEntry(): IssuedEntry;
  resolveEntry(cookie: string | undefined): EntryContext | null;
  signIn(input: {
    readonly entryCookie: string | undefined;
    readonly csrfToken: string | undefined;
    readonly username: string;
    readonly password: string;
    readonly correlationId: string;
  }): Promise<SignInResult>;
  resolveSession(cookie: string | undefined): SessionContext | null;
  signOut(cookie: string | undefined, correlationId: string): void;
  changePassword(input: {
    readonly session: SessionContext;
    readonly currentPassword: string;
    readonly newPassword: string;
    readonly correlationId: string;
  }): Promise<PasswordChangeResult>;
  authorize(
    session: SessionContext,
    required: Role | null,
    operation: string,
    correlationId: string,
  ): boolean;
}

// Compara dos textos sin revelar por el tiempo dónde difieren ni su longitud.
export function safeEqual(left: string, right: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(left).digest(),
    createHash("sha256").update(right).digest(),
  );
}

// Comprobación de origen de una petición que cambia estado: el `Origin` debe
// ser exactamente el origen público y, si el navegador envía
// `Sec-Fetch-Site`, debe ser `same-origin`.
export function originAllowed(
  publicOrigin: string,
  origin: string | undefined,
  secFetchSite: string | undefined,
): boolean {
  if (origin !== publicOrigin) {
    return false;
  }
  return secFetchSite === undefined || secFetchSite === "same-origin";
}

function validPassword(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH
  );
}

function derive(
  password: string,
  salt: Buffer,
  params: PasswordParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      {
        N: params.N,
        r: params.r,
        p: params.p,
        maxmem: 256 * params.N * params.r,
      },
      (error, key) => {
        if (error === null) {
          resolve(key);
        } else {
          reject(error);
        }
      },
    );
  });
}

interface StoredPassword {
  readonly hash: string;
  readonly params: string;
}

async function hashPassword(
  password: string,
  params: PasswordParams,
): Promise<StoredPassword> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, params);
  return {
    hash: `${salt.toString("hex")}:${key.toString("hex")}`,
    params: JSON.stringify({ N: params.N, r: params.r, p: params.p }),
  };
}

function parseParams(value: string): PasswordParams | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null) {
      const { N, r, p } = parsed as Record<string, unknown>;
      if (
        typeof N === "number" &&
        typeof r === "number" &&
        typeof p === "number"
      ) {
        return { N, r, p };
      }
    }
  } catch {
    // Parámetros ilegibles: la contraseña no se puede verificar.
  }
  return null;
}

async function verifyPassword(
  password: string,
  stored: StoredPassword,
): Promise<boolean> {
  const params = parseParams(stored.params);
  const [saltHex, keyHex] = stored.hash.split(":");
  if (params === null || saltHex === undefined || keyHex === undefined) {
    return false;
  }
  const expected = Buffer.from(keyHex, "hex");
  const key = await derive(password, Buffer.from(saltHex, "hex"), params);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function hashOf(cookie: string): string {
  return createHash("sha256").update(cookie).digest("hex");
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function parseRoles(value: unknown): readonly Role[] {
  const stored = text(value).split(",");
  return ROLES.filter((role) => stored.includes(role));
}

function normalizeRoles(roles: readonly string[]): readonly Role[] | null {
  if (!roles.every((role) => ROLES.some((known) => known === role))) {
    return null;
  }
  return ROLES.filter((role) => roles.includes(role));
}

type Row = Record<string, unknown>;

function summary(row: Row): UserSummary {
  return {
    id: text(row.id),
    username: text(row.username),
    roles: parseRoles(row.roles),
    disabled: integer(row.disabled) === 1,
    mustChangePassword: integer(row.must_change_password) === 1,
  };
}

// Revoca todas las sesiones, de todas las cuentas y también las de entrada.
// Es la regla de una restauración: ninguna sesión anterior a la copia sirve
// después (FR-069). Devuelve cuántas quedaban abiertas.
export function revokeEverySession(db: DatabaseSync, at: number): number {
  return Number(
    db
      .prepare("UPDATE session SET revoked_at = ? WHERE revoked_at IS NULL")
      .run(at).changes,
  );
}

export function createIdentity(options: IdentityOptions): Identity {
  const { db, audit, now, sessionIdleMs, sessionMaxMs, passwordParams } =
    options;

  // Huella de relleno: con una cuenta inexistente o desactivada se deriva
  // igualmente, para que el tiempo de respuesta no revele qué cuentas existen.
  let filler: Promise<StoredPassword> | undefined;
  function fillerPassword(): Promise<StoredPassword> {
    filler ??= hashPassword(randomBytes(24).toString("hex"), passwordParams);
    return filler;
  }

  function findUser(username: string): Row | undefined {
    return db
      .prepare("SELECT * FROM user_account WHERE username = ?")
      .get(username);
  }

  function revokeAll(userId: string): void {
    db.prepare(
      "UPDATE session SET revoked_at = ? " +
        "WHERE user_id = ? AND revoked_at IS NULL",
    ).run(now(), userId);
  }

  function issueSession(
    userId: string | null,
    lifetimeMs: number,
  ): IssuedEntry {
    const cookie = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const at = now();
    db.prepare(
      "INSERT INTO session (id_hash, user_id, csrf_token, created_at, " +
        "last_seen_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
    ).run(hashOf(cookie), userId, csrfToken, at, at, at + lifetimeMs);
    return { cookie, csrfToken };
  }

  // Sesión viva: existe, no está revocada y no ha superado ni su duración
  // máxima ni el periodo de inactividad.
  function liveSession(cookie: string | undefined): Row | undefined {
    if (cookie === undefined || cookie === "") {
      return undefined;
    }
    const row = db
      .prepare("SELECT * FROM session WHERE id_hash = ?")
      .get(hashOf(cookie));
    if (row?.revoked_at !== null) {
      return undefined;
    }
    const at = now();
    if (
      at >= integer(row.expires_at) ||
      at - integer(row.last_seen_at) >= sessionIdleMs
    ) {
      return undefined;
    }
    return row;
  }

  function lockedUntil(subject: string): number {
    const row = db
      .prepare("SELECT locked_until FROM sign_in_throttle WHERE subject = ?")
      .get(subject);
    return row === undefined ? 0 : integer(row.locked_until);
  }

  // Con `sliding`, la ventana se cuenta desde el último fallo; sin él, desde
  // el primero.
  function registerFailure(
    subject: string,
    windowMs: number,
    sliding: boolean,
    lockFor: (failures: number) => number,
  ): void {
    const at = now();
    const row = db
      .prepare("SELECT * FROM sign_in_throttle WHERE subject = ?")
      .get(subject);
    const inWindow =
      row !== undefined && at - integer(row.window_started_at) < windowMs;
    const failures = inWindow ? integer(row.failed_count) + 1 : 1;
    const windowStartedAt =
      inWindow && !sliding ? integer(row.window_started_at) : at;
    db.prepare(
      "INSERT INTO sign_in_throttle (subject, failed_count, " +
        "window_started_at, locked_until) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT (subject) DO UPDATE SET failed_count = excluded.failed_count, " +
        "window_started_at = excluded.window_started_at, " +
        "locked_until = excluded.locked_until",
    ).run(subject, failures, windowStartedAt, at + lockFor(failures));
  }

  function accountLock(failures: number): number {
    if (failures < ACCOUNT_FREE_ATTEMPTS) {
      return 0;
    }
    return Math.min(
      ACCOUNT_MAX_LOCK_MS,
      ACCOUNT_FIRST_LOCK_MS * 2 ** (failures - ACCOUNT_FREE_ATTEMPTS),
    );
  }

  function adminEvent(
    action: string,
    targetId: string | null,
    correlationId: string,
    details: IdentityAuditEvent["details"] = {},
  ): void {
    audit({
      actorId: null,
      action,
      targetKind: "user_account",
      targetId,
      result: "ok",
      correlationId,
      details: { via: "admin-script", ...details },
    });
  }

  return {
    async createUser({ username, password, roles, correlationId }) {
      if (!USERNAME.test(username)) {
        return { ok: false, reason: "invalid_username" };
      }
      if (!validPassword(password)) {
        return { ok: false, reason: "invalid_password" };
      }
      const normalized = normalizeRoles(roles);
      if (normalized === null) {
        return { ok: false, reason: "invalid_roles" };
      }
      if (findUser(username) !== undefined) {
        return { ok: false, reason: "already_exists" };
      }
      const stored = await hashPassword(password, passwordParams);
      const id = randomBytes(12).toString("hex");
      db.prepare(
        "INSERT INTO user_account (id, username, password_hash, " +
          "password_params, roles, disabled, must_change_password, created_at) " +
          "VALUES (?, ?, ?, ?, ?, 0, 1, ?)",
      ).run(
        id,
        username,
        stored.hash,
        stored.params,
        normalized.join(","),
        now(),
      );
      adminEvent("user.created", id, correlationId, {
        roles: normalized.join(","),
      });
      return { ok: true };
    },

    setRoles(username, roles, correlationId) {
      const normalized = normalizeRoles(roles);
      if (normalized === null) {
        return { ok: false, reason: "invalid_roles" };
      }
      const user = findUser(username);
      if (user === undefined) {
        return { ok: false, reason: "not_found" };
      }
      const id = text(user.id);
      db.prepare("UPDATE user_account SET roles = ? WHERE id = ?").run(
        normalized.join(","),
        id,
      );
      revokeAll(id);
      adminEvent("user.roles_changed", id, correlationId, {
        previous: parseRoles(user.roles).join(","),
        roles: normalized.join(","),
      });
      return { ok: true };
    },

    setDisabled(username, disabled, correlationId) {
      const user = findUser(username);
      if (user === undefined) {
        return { ok: false, reason: "not_found" };
      }
      const id = text(user.id);
      db.prepare("UPDATE user_account SET disabled = ? WHERE id = ?").run(
        disabled ? 1 : 0,
        id,
      );
      revokeAll(id);
      adminEvent(
        disabled ? "user.disabled" : "user.enabled",
        id,
        correlationId,
      );
      return { ok: true };
    },

    async resetPassword(username, password, correlationId) {
      if (!validPassword(password)) {
        return { ok: false, reason: "invalid_password" };
      }
      const user = findUser(username);
      if (user === undefined) {
        return { ok: false, reason: "not_found" };
      }
      const id = text(user.id);
      const stored = await hashPassword(password, passwordParams);
      db.prepare(
        "UPDATE user_account SET password_hash = ?, password_params = ?, " +
          "must_change_password = 1 WHERE id = ?",
      ).run(stored.hash, stored.params, id);
      revokeAll(id);
      adminEvent("user.password_reset", id, correlationId);
      return { ok: true };
    },

    revokeSessions(username, correlationId) {
      const user = findUser(username);
      if (user === undefined) {
        return { ok: false, reason: "not_found" };
      }
      const id = text(user.id);
      revokeAll(id);
      adminEvent("user.sessions_revoked", id, correlationId);
      return { ok: true };
    },

    listUsers() {
      return db
        .prepare("SELECT * FROM user_account ORDER BY username")
        .all()
        .map(summary);
    },

    // Sesión previa anónima del formulario de entrada: no pertenece a ninguna
    // cuenta, no concede nada y solo aporta el testigo que el envío exige.
    beginEntry() {
      return issueSession(null, ENTRY_LIFETIME_MS);
    },

    resolveEntry(cookie) {
      const row = liveSession(cookie);
      if (row?.user_id !== null) {
        return null;
      }
      return { csrfToken: text(row.csrf_token) };
    },

    async signIn({
      entryCookie,
      csrfToken,
      username,
      password,
      correlationId,
    }) {
      const refuse = (
        result: "denied" | "failed",
        reason: "invalid_request" | "throttled" | "invalid_credentials",
        targetId: string | null,
      ): SignInResult => {
        audit({
          actorId: null,
          action: "session.sign_in",
          targetKind: targetId === null ? null : "user_account",
          targetId,
          result,
          correlationId,
          details: { reason },
        });
        return { ok: false, reason };
      };

      const entryRow = liveSession(entryCookie);
      if (
        entryRow?.user_id !== null ||
        csrfToken === undefined ||
        !safeEqual(text(entryRow.csrf_token), csrfToken)
      ) {
        return refuse("denied", "invalid_request", null);
      }
      const subject = `account:${username.trim().toLowerCase().slice(0, 64)}`;
      const at = now();
      if (lockedUntil(subject) > at || lockedUntil(GLOBAL_SUBJECT) > at) {
        return refuse("denied", "throttled", null);
      }
      const user = findUser(username);
      const usable = user !== undefined && integer(user.disabled) === 0;
      const stored: StoredPassword = usable
        ? {
            hash: text(user.password_hash),
            params: text(user.password_params),
          }
        : await fillerPassword();
      const verified = await verifyPassword(password, stored);
      if (!usable || !verified) {
        registerFailure(subject, ACCOUNT_WINDOW_MS, true, accountLock);
        registerFailure(GLOBAL_SUBJECT, GLOBAL_WINDOW_MS, false, (failures) =>
          failures >= GLOBAL_FAILURES ? GLOBAL_LOCK_MS : 0,
        );
        return refuse(
          "failed",
          "invalid_credentials",
          user === undefined ? null : text(user.id),
        );
      }
      const id = text(user.id);
      db.prepare("DELETE FROM sign_in_throttle WHERE subject = ?").run(subject);
      db.prepare("UPDATE session SET revoked_at = ? WHERE id_hash = ?").run(
        now(),
        text(entryRow.id_hash),
      );
      // Identificador nuevo al autenticar: impide la fijación de sesión.
      const issued = issueSession(id, sessionMaxMs);
      audit({
        actorId: id,
        action: "session.sign_in",
        targetKind: "user_account",
        targetId: id,
        result: "ok",
        correlationId,
        details: {},
      });
      return {
        ok: true,
        cookie: issued.cookie,
        mustChangePassword: integer(user.must_change_password) === 1,
      };
    },

    // Los perfiles y el estado de la cuenta se leen en cada petición, no de la
    // sesión: un cambio se aplica desde la petición siguiente.
    resolveSession(cookie) {
      const row = liveSession(cookie);
      if (row === undefined) {
        return null;
      }
      const userId = row.user_id;
      if (typeof userId !== "string") {
        return null;
      }
      const user = db
        .prepare("SELECT * FROM user_account WHERE id = ?")
        .get(userId);
      if (user === undefined || integer(user.disabled) === 1) {
        return null;
      }
      const at = now();
      if (at - integer(row.last_seen_at) >= LAST_SEEN_PRECISION_MS) {
        db.prepare("UPDATE session SET last_seen_at = ? WHERE id_hash = ?").run(
          at,
          text(row.id_hash),
        );
      }
      return { csrfToken: text(row.csrf_token), user: summary(user) };
    },

    signOut(cookie, correlationId) {
      const row = liveSession(cookie);
      if (row === undefined) {
        return;
      }
      db.prepare("UPDATE session SET revoked_at = ? WHERE id_hash = ?").run(
        now(),
        text(row.id_hash),
      );
      if (row.user_id !== null) {
        const id = text(row.user_id);
        audit({
          actorId: id,
          action: "session.sign_out",
          targetKind: "user_account",
          targetId: id,
          result: "ok",
          correlationId,
          details: {},
        });
      }
    },

    async changePassword({
      session,
      currentPassword,
      newPassword,
      correlationId,
    }) {
      const id = session.user.id;
      const refuse = (
        reason: "invalid_current" | "invalid_new" | "unchanged",
      ): PasswordChangeResult => {
        audit({
          actorId: id,
          action: "user.password_changed",
          targetKind: "user_account",
          targetId: id,
          result: "failed",
          correlationId,
          details: { reason },
        });
        return { ok: false, reason };
      };
      const user = db
        .prepare("SELECT * FROM user_account WHERE id = ?")
        .get(id);
      if (
        user === undefined ||
        !(await verifyPassword(currentPassword, {
          hash: text(user.password_hash),
          params: text(user.password_params),
        }))
      ) {
        return refuse("invalid_current");
      }
      if (!validPassword(newPassword)) {
        return refuse("invalid_new");
      }
      if (newPassword === currentPassword) {
        return refuse("unchanged");
      }
      const stored = await hashPassword(newPassword, passwordParams);
      db.prepare(
        "UPDATE user_account SET password_hash = ?, password_params = ?, " +
          "must_change_password = 0 WHERE id = ?",
      ).run(stored.hash, stored.params, id);
      // Cambiar la contraseña revoca todas las sesiones de la cuenta, también
      // la actual, que se sustituye por una nueva.
      revokeAll(id);
      const issued = issueSession(id, sessionMaxMs);
      audit({
        actorId: id,
        action: "user.password_changed",
        targetKind: "user_account",
        targetId: id,
        result: "ok",
        correlationId,
        details: {},
      });
      return { ok: true, cookie: issued.cookie };
    },

    // Denegación por defecto: sin el perfil exigido no se concede, y cada
    // denegación se audita. `null` exige solo una sesión.
    authorize(session, required, operation, correlationId) {
      if (required === null || session.user.roles.includes(required)) {
        return true;
      }
      audit({
        actorId: session.user.id,
        action: "access.denied",
        targetKind: null,
        targetId: null,
        result: "denied",
        correlationId,
        details: { operation, required },
      });
      return false;
    },
  };
}
