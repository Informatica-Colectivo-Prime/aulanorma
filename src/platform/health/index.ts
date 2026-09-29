// Estado de la aplicación (FR-006; plan.md, «Interfaz de estado y versión»).
// `version` lee y valida la versión; este módulo solo compone el estado.
// Importarlo no hace trabajo: `getVersion` solo se invoca al construir el
// estado, dentro del `try` de la API Route. No lee configuración,
// `process.env` ni datos de la petición, y no registra nada.
import { getVersion } from "@/platform/version";

export interface HealthStatus {
  readonly status: "ok";
  readonly version: string;
}

// Llama a `getVersion` exactamente una vez y devuelve un objeto nuevo con
// `status` y `version`, en ese orden. Un fallo de `getVersion` se propaga sin
// transformar, así que nunca devuelve "ok" sin una versión válida.
export function buildHealthStatus(): HealthStatus {
  const version = getVersion();
  return { status: "ok", version };
}
