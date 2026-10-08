// Ampliación de la sesión (specs/002-boe-scorm-export: T082; WCAG 2.2.1;
// contracts/http-surface.md). La pide su usuario desde el aviso de caducidad.
// Exige una sesión viva y su testigo: no revive una sesión caducada o
// revocada, y no retrasa la duración máxima.
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default protectedAction(
  {
    role: null,
    operation: "session.extend",
    allowPendingPasswordChange: true,
  },
  ({ runtime, correlationId, sessionCookie }) => {
    // La guarda ya ha comprobado la sesión; si deja de estar viva entre
    // medias, la siguiente petición lo verá.
    runtime.identity.extendSession(sessionCookie, correlationId);
    return Promise.resolve({ done: true });
  },
);
