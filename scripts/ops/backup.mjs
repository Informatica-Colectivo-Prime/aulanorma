// @ts-check
// Copia de seguridad (specs/002-boe-scorm-export: T070; research.md, R11;
// FR-069). Se ejecuta en el servidor, con la cuenta del servicio y sin
// detenerlo.
//
//   NODE_ENV=<modo> node scripts/ops/backup.mjs <directorio de copias>
//
// `<modo>` es `development` o `production`, como en `npm run dev` y
// `npm start`, y decide qué configuración se carga: de ella sale el directorio
// de datos. Crea `<directorio de copias>/aulanorma-<fecha>/` con una
// instantánea de la base de datos, los ficheros publicados y el registro
// `backup.json`, y verifica en la propia copia que cada referencia tiene su
// fichero con la huella correcta.
//
// Escribe una línea con el nombre, la fecha, el tamaño y la huella de la
// copia. Termina con código 1 si la copia no ha podido hacerse o ha quedado
// marcada como fallida: una copia fallida no sirve para restaurar. Una copia
// tampoco cuenta hasta que su restauración se ha probado con
// `scripts/ops/verify-restore.mjs`.
//
// La copia contiene huellas de contraseñas y los documentos registrados: su
// directorio solo es accesible para la cuenta que la hace y debe guardarse con
// acceso restringido. No incluye la configuración del servicio.
import path from "node:path";
import { loadConfig } from "../../src/platform/config/index.ts";
import { createBackup } from "../../src/platform/persistence/index.ts";

/** @param {string} message */
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function main() {
  const [destination, ...rest] = process.argv.slice(2);
  if (destination === undefined || rest.length > 0) {
    fail(
      "Uso: NODE_ENV=<modo> node scripts/ops/backup.mjs <directorio de copias>",
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
  const target = path.resolve(destination);
  const dataDir = path.resolve(result.config.dataDir);
  if (target === dataDir || target.startsWith(`${dataDir}${path.sep}`)) {
    fail("El directorio de copias no puede estar dentro del de datos.");
    return;
  }
  const { directory, record } = await createBackup({
    dataDir,
    destination: target,
    now: () => Date.now(),
  });
  process.stdout.write(
    `${JSON.stringify({
      name: record.name,
      createdAt: record.createdAt,
      status: record.status,
      sizeBytes: record.sizeBytes,
      sha256: record.sha256,
      files: record.inventory.length,
      references: record.references,
      unreferenced: record.unreferenced,
      problems: record.problems,
    })}\n`,
  );
  if (record.status !== "ok") {
    fail(`La copia ha quedado marcada como fallida: ${directory}`);
  }
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : "Ha fallado la copia.");
}
