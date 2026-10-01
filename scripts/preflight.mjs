// Preflight de la configuración (FR-005; research.md, R8; plan.md, «Arranque»).
// Lo ejecutan `npm run dev` (`dev`) y `npm start` (`start`) antes de
// `server.mjs`, cada uno con su `NODE_ENV`.
//
// El modo sale del argumento, nunca de `NODE_ENV`: `dev` pide `development` y
// `start`, `production`. `loadConfig` exige que `NODE_ENV` coincida, carga los
// ficheros `.env*` con `@next/env` y valida; los módulos portables se importan
// directamente, con eliminación nativa de tipos.
// - Configuración válida: código 0 sin escribir nada. `startup.completed` solo
//   lo registra `server.mjs`.
// - Configuración no válida: un único `startup.config_invalid` con el modo y
//   la lista saneada de `{ key, problem }`, y código 1.
// - Argumento ausente o distinto de `dev` y `start`: código 1 sin escribir
//   nada.
// - Si la validación no puede completarse, por ejemplo porque no se pueden
//   cargar los módulos: código 1 y una línea fija, sin el error, rutas, nombres
//   de ficheros `.env` ni trazas.
const MODES = new Map([
  ["dev", "development"],
  ["start", "production"],
]);

const LOAD_FAILURE = "No se pudo cargar la validación de la configuración.\n";

async function main() {
  const args = process.argv.slice(2);
  const mode = args.length === 1 ? MODES.get(args[0]) : undefined;
  if (mode === undefined) {
    return 1;
  }
  try {
    const [{ loadConfig }, { createLogger, logConfigInvalid }] =
      await Promise.all([
        import("../src/platform/config/index.ts"),
        import("../src/platform/logging/index.ts"),
      ]);
    const result = loadConfig(mode);
    if (result.ok) {
      return 0;
    }
    logConfigInvalid(
      createLogger({ environment: mode, level: "fatal" }),
      mode,
      result.problems,
    );
    return 1;
  } catch {
    process.stderr.write(LOAD_FAILURE);
    return 1;
  }
}

process.exitCode = await main();
