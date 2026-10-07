// @ts-check
// Adaptador mínimo de arranque (research.md, R1 y R8; plan.md, «Frontera
// HTTP»; ADR 0001). Lo ejecutan `npm run dev` y `npm start` después del
// preflight; `node server.mjs` directo no es una entrada admitida.
//
// Valida la configuración y aplica las migraciones de la base de datos antes
// de cargar Next.js y de escuchar, decide cada petición con la frontera HTTP y
// solo delega en Next.js lo que ella admite.
// Escucha en 127.0.0.1:3000, fijos. Solo lee `process.env.NODE_ENV` y no
// registra nada por petición: sus únicos eventos son `startup.config_invalid`
// y `startup.completed`.
import http from "node:http";
import { loadConfig } from "./src/platform/config/index.ts";
import { createHttpBoundary } from "./src/platform/http-boundary/index.ts";
import {
  createLogger,
  logConfigInvalid,
  logStartupCompleted,
} from "./src/platform/logging/index.ts";
import {
  migrate,
  openDatabase,
  PLATFORM_MIGRATIONS,
} from "./src/platform/persistence/index.ts";

const HOSTNAME = "127.0.0.1";
const PORT = 3000;

// Un fallo de arranque posterior a la validación termina con código 1 sin
// escribir nada: ni trazas, ni rutas, ni el puerto abierto.
function abort() {
  process.exit(1);
}

async function main() {
  // `loadConfig` comprueba que `NODE_ENV` coincide con el modo pedido: un
  // valor ausente o distinto falla cerrado con `mode_mismatch`.
  const mode =
    process.env.NODE_ENV === "development" ? "development" : "production";
  const result = loadConfig(mode);
  if (!result.ok) {
    logConfigInvalid(
      createLogger({ environment: mode, level: "fatal" }),
      mode,
      result.problems,
    );
    process.exitCode = 1;
    return;
  }
  const logger = createLogger({
    environment: result.config.environment,
    level: result.config.logLevel,
  });

  // Aplica las migraciones pendientes antes de cargar Next.js y de escuchar.
  // Si la base de datos no puede abrirse o migrarse, el arranque termina con
  // código 1 sin abrir el puerto.
  const database = openDatabase(result.config.dataDir);
  migrate(database, PLATFORM_MIGRATIONS);
  database.close();

  const { default: next } = await import("next");
  // En desarrollo se selecciona Webpack de forma explícita: sin la opción,
  // `next()` elige Turbopack. En producción las opciones no cambian, porque el
  // servidor solo sirve lo que generó `next build`.
  const dev = mode === "development";
  const app = next({
    dev,
    dir: import.meta.dirname,
    hostname: HOSTNAME,
    port: PORT,
    ...(dev ? { webpack: true } : {}),
  });
  const handle = app.getRequestHandler();
  await app.prepare();

  const boundary = createHttpBoundary((req, res) => handle(req, res));
  const server = http.createServer({ requireHostHeader: false }, (req, res) => {
    void boundary.request(req, res);
  });
  server.on("checkContinue", (req, res) => {
    void boundary.checkContinue(req, res);
  });
  server.on("checkExpectation", (req, res) => {
    void boundary.checkExpectation(req, res);
  });
  server.on("connect", (req, socket) => {
    boundary.connect(req, socket);
  });
  server.on("upgrade", (req, socket) => {
    boundary.upgrade(req, socket);
  });
  server.on("clientError", (error, socket) => {
    boundary.clientError(error, socket);
  });
  server.on("error", abort);
  server.listen(PORT, HOSTNAME, () => {
    logStartupCompleted(logger);
  });
}

try {
  await main();
} catch {
  abort();
}
