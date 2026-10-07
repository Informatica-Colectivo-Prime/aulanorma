// Proceso hijo de la inspección estructural: lee el JSON que qpdf dejó en un
// fichero, aplica la política y escribe el veredicto por la salida estándar.
//
//   node --permission --allow-fs-read=… policy-child.ts <estructura.json>
//
// Se ejecuta con el entorno vacío, sin acceso a la base de datos ni a la
// configuración, y solo puede leer su código y ese fichero. Cualquier fallo
// termina con un código distinto de cero y quien lo lanza rechaza el
// documento.
import { readFileSync } from "node:fs";
import { evaluateStructure } from "./policy.ts";

const [file] = process.argv.slice(2);
if (file === undefined) {
  process.exit(2);
}
const document: unknown = JSON.parse(readFileSync(file, "utf8"));
process.stdout.write(JSON.stringify(evaluateStructure(document)));
