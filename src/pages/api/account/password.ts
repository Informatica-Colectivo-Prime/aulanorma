// Cambio de contraseña (specs/002-boe-scorm-export: T028 y FR-068;
// contracts/http-surface.md). Exige sesión y su testigo. Al cambiarla se
// revocan todas las sesiones de la cuenta y esta se sustituye por una nueva.
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default protectedAction(
  {
    role: null,
    operation: "account.password.change",
    allowPendingPasswordChange: true,
  },
  async ({ field, runtime, correlationId, session }) => {
    const result = await runtime.identity.changePassword({
      session,
      currentPassword: field("current"),
      newPassword: field("next"),
      correlationId,
    });
    if (result.ok) {
      return {
        location: "/account/password",
        notice: "password_changed",
        sessionCookie: result.cookie,
        event: "account.password_changed",
      };
    }
    return {
      location: "/account/password",
      notice:
        result.reason === "invalid_current"
          ? "password_invalid_current"
          : result.reason === "invalid_new"
            ? "password_invalid_new"
            : "password_unchanged",
      event: "account.password_change_refused",
    };
  },
);
