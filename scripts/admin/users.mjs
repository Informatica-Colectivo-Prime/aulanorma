// @ts-check
// Administración de cuentas (specs/002-boe-scorm-export: T023; research.md,
// R2). No hay registro libre ni recuperación por correo: las cuentas se crean
// y se mantienen con este script, desde el servidor.
//
//   NODE_ENV=<modo> node scripts/admin/users.mjs <orden> [argumentos]
//
//   create <usuario> [--role admin] [--role teacher]   Crea la cuenta.
//   roles <usuario> [--role admin] [--role teacher]    Fija sus perfiles.
//   password <usuario>                                 Asigna otra contraseña.
//   disable <usuario> | enable <usuario>               Desactiva o reactiva.
//   revoke <usuario>                                   Cierra sus sesiones.
//   list                                               Lista las cuentas.
//
// `<modo>` es `development` o `production`, como en `npm run dev` y
// `npm start`, y decide qué configuración se carga. La contraseña se lee de la
// entrada estándar: se pide dos veces sin mostrarla o, si la entrada no es un
// terminal, se toma su primera línea. Nunca se acepta como argumento y nunca
// se imprime ni se registra, igual que su huella. Toda contraseña asignada
// aquí es inicial: la cuenta debe cambiarla al entrar. Cambiar los perfiles,
// la contraseña o el estado de una cuenta cierra sus sesiones.
import { randomUUID } from "node:crypto";
import { createAudit } from "../../src/platform/audit/index.ts";
import { loadConfig } from "../../src/platform/config/index.ts";
import {
  createIdentity,
  DEFAULT_PASSWORD_PARAMS,
  MIN_PASSWORD_LENGTH,
} from "../../src/platform/identity/index.ts";
import {
  migrate,
  openDatabase,
  PLATFORM_MIGRATIONS,
} from "../../src/platform/persistence/index.ts";

const ROLE_NAMES = { admin: "administración", teacher: "docente" };

const PROBLEMS = {
  invalid_username:
    "El nombre de usuario debe tener entre 3 y 32 caracteres: minúsculas, cifras, punto, guion o guion bajo, y empezar por letra o cifra.",
  invalid_password: `La contraseña debe tener al menos ${String(MIN_PASSWORD_LENGTH)} caracteres.`,
  invalid_roles: "Los perfiles admitidos son admin y teacher.",
  already_exists: "Ya existe una cuenta con ese nombre.",
  not_found: "No existe ninguna cuenta con ese nombre.",
};

/** @param {string} message */
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

/**
 * @param {string[]} argv
 * @returns {{ positional: string[], roles: string[] } | undefined}
 */
function parseArguments(argv) {
  /** @type {string[]} */
  const positional = [];
  /** @type {string[]} */
  const roles = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--role") {
      const role = argv[index + 1];
      if (role === undefined) {
        return undefined;
      }
      roles.push(role);
      index += 1;
    } else if (argument.startsWith("--")) {
      return undefined;
    } else {
      positional.push(argument);
    }
  }
  return { positional, roles };
}

/** @returns {Promise<string>} */
function readPipedLine() {
  return new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      text += String(chunk);
    });
    process.stdin.on("end", () => {
      resolve(text.split(/\r?\n/)[0] ?? "");
    });
  });
}

/**
 * Lee una línea del terminal sin mostrar lo que se teclea.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    process.stderr.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let text = "";
    /** @param {string | Buffer} chunk */
    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stderr.write("\n");
          resolve(text);
          return;
        }
        if (char === "\u0003") {
          input.setRawMode(false);
          process.stderr.write("\n");
          reject(new Error("Cancelado."));
          return;
        }
        if (char === "\u007f" || char === "\b") {
          text = text.slice(0, -1);
        } else {
          text += char;
        }
      }
    };
    input.on("data", onData);
  });
}

/** @returns {Promise<string | undefined>} */
async function readPassword() {
  if (!process.stdin.isTTY) {
    return readPipedLine();
  }
  const first = await readHidden("Contraseña inicial: ");
  const second = await readHidden("Repite la contraseña: ");
  if (first !== second) {
    fail("Las dos contraseñas no coinciden. No se ha cambiado nada.");
    return undefined;
  }
  return first;
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  const [command, username] = parsed?.positional ?? [];
  if (parsed === undefined || command === undefined) {
    fail(
      "Uso: NODE_ENV=<modo> node scripts/admin/users.mjs " +
        "<create|roles|password|disable|enable|revoke|list> [usuario] [--role <perfil>]",
    );
    return;
  }
  const mode = process.env.NODE_ENV;
  if (mode !== "development" && mode !== "production") {
    fail("Indica el modo: NODE_ENV=development o NODE_ENV=production.");
    return;
  }
  const result = loadConfig(mode);
  if (!result.ok) {
    fail(
      "La configuración no es válida: " +
        result.problems
          .map(({ key, problem }) => `${key} (${problem})`)
          .join(", "),
    );
    return;
  }
  const { config } = result;
  const database = openDatabase(config.dataDir);
  try {
    migrate(database, PLATFORM_MIGRATIONS);
    const audit = createAudit(database);
    const identity = createIdentity({
      db: database,
      audit: (event) => {
        audit.record(event);
      },
      now: () => Date.now(),
      sessionIdleMs: config.sessionIdleMinutes * 60_000,
      sessionMaxMs: config.sessionMaxHours * 3_600_000,
      passwordParams: DEFAULT_PASSWORD_PARAMS,
    });
    const correlationId = randomUUID();

    if (command === "list" && username === undefined) {
      for (const user of identity.listUsers()) {
        const roles =
          user.roles.length === 0
            ? "sin perfiles"
            : user.roles.map((role) => ROLE_NAMES[role]).join(", ");
        const state = [
          ...(user.disabled ? ["desactivada"] : []),
          ...(user.mustChangePassword ? ["contraseña inicial"] : []),
        ].join(", ");
        process.stdout.write(
          `${user.username}\t${roles}${state === "" ? "" : `\t${state}`}\n`,
        );
      }
      return;
    }
    if (username === undefined || parsed.positional.length !== 2) {
      fail("Falta el nombre de usuario, o sobran argumentos.");
      return;
    }

    /** @type {import("../../src/platform/identity/index.ts").AdminResult} */
    let outcome;
    let done = "";
    if (command === "create" || command === "password") {
      const password = await readPassword();
      if (password === undefined) {
        return;
      }
      if (command === "create") {
        outcome = await identity.createUser({
          username,
          password,
          roles: parsed.roles,
          correlationId,
        });
        done = "Cuenta creada. Debe cambiar la contraseña al entrar.";
      } else {
        outcome = await identity.resetPassword(
          username,
          password,
          correlationId,
        );
        done =
          "Contraseña asignada y sesiones cerradas. Debe cambiarla al entrar.";
      }
    } else if (command === "roles") {
      outcome = identity.setRoles(username, parsed.roles, correlationId);
      done = "Perfiles actualizados y sesiones cerradas.";
    } else if (command === "disable" || command === "enable") {
      outcome = identity.setDisabled(
        username,
        command === "disable",
        correlationId,
      );
      done =
        command === "disable"
          ? "Cuenta desactivada y sesiones cerradas."
          : "Cuenta reactivada.";
    } else if (command === "revoke") {
      outcome = identity.revokeSessions(username, correlationId);
      done = "Sesiones cerradas.";
    } else {
      fail(`Orden desconocida: ${command}.`);
      return;
    }
    if (outcome.ok) {
      process.stdout.write(`${done}\n`);
    } else {
      fail(PROBLEMS[outcome.reason]);
    }
  } finally {
    database.close();
  }
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : "Ha fallado la operación.");
}
