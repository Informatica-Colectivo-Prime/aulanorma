// Envío del formulario de entrada (specs/002-boe-scorm-export: T027;
// contracts/http-surface.md). Con la página de entrada, es lo único accesible
// sin sesión. El resultado es siempre una redirección: al inicio, al cambio de
// la contraseña inicial o de vuelta a la entrada con un aviso que no revela si
// la cuenta existe.
import { entryAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default entryAction(
  "session.sign_in",
  async ({ field, correlationId, runtime, entryCookie }) => {
    const result = await runtime.identity.signIn({
      entryCookie,
      csrfToken: field("csrf"),
      username: field("username").trim().toLowerCase(),
      password: field("password"),
      correlationId,
    });
    if (result.ok) {
      return {
        location: result.mustChangePassword ? "/account/password" : "/",
        sessionCookie: result.cookie,
        event: "session.signed_in",
      };
    }
    return {
      location: "/login",
      notice:
        result.reason === "throttled"
          ? "signin_throttled"
          : result.reason === "invalid_request"
            ? "signin_expired"
            : "signin_refused",
      event: "session.sign_in_refused",
    };
  },
);
