// Versión de la aplicación (plan.md, «Interfaz de estado y versión»). El
// sistema de módulos resuelve y conserva la importación JSON estática del
// `package.json` raíz; la validación solo ocurre al invocar `getVersion`,
// dentro del `try` de la API Route. No lee ficheros, configuración ni
// `process.env`.
import manifest from "../../../package.json" with { type: "json" };

// SemVer básico `X.Y.Z`, sin ceros iniciales, versión preliminar ni metadatos.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// Devuelve exactamente el campo `version` del manifiesto. Ante un valor no
// válido lanza un error genérico, sin el valor ni datos del manifiesto.
export function getVersion(): string {
  const version: unknown = Reflect.get(manifest, "version");
  if (typeof version !== "string" || !VERSION.test(version)) {
    throw new Error("La versión de la aplicación no es válida.");
  }
  return version;
}

export const sample: number = "text";
