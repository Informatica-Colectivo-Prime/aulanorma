// Renovación de la autenticación sin salir de la página
// (specs/002-boe-scorm-export: FR-071; WCAG 2.2.1; contracts/http-surface.md).
// La pide el usuario desde el aviso de fin de sesión, con su contraseña. La
// guarda exige origen propio, una sesión vigente y su testigo; la identidad
// comprueba la contraseña con el control de intentos de la entrada y, si es
// correcta, sustituye la sesión por otra nueva y revoca la anterior en la
// misma transacción. Responde con datos al script de la página.
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

const REFUSALS = {
  invalid_credentials: 422,
  throttled: 429,
  // La sesión dejó de estar vigente mientras se comprobaba la contraseña.
  session_ended: 401,
} as const;

export default protectedAction(
  {
    role: null,
    operation: "session.renew",
    allowPendingPasswordChange: true,
    secretFields: true,
  },
  async ({ field, runtime, correlationId, sessionCookie }) => {
    const result = await runtime.identity.renewSession({
      cookie: sessionCookie,
      password: field("password"),
      correlationId,
    });
    if (!result.ok) {
      return {
        status: REFUSALS[result.reason],
        data: { reason: result.reason },
      };
    }
    return {
      status: 200,
      sessionCookie: result.cookie,
      data: {
        csrf: result.csrfToken,
        now: Date.now(),
        idleAt: result.idleExpiresAt,
        idleMs: result.idleMs,
        maxAt: result.expiresAt,
      },
    };
  },
);
