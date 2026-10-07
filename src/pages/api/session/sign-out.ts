// Salida (specs/002-boe-scorm-export: T027; contracts/http-surface.md). Exige
// sesión y su testigo, revoca la sesión y borra su cookie.
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default protectedAction(
  {
    role: null,
    operation: "session.sign_out",
    allowPendingPasswordChange: true,
  },
  ({ runtime, correlationId, sessionCookie }) => {
    runtime.identity.signOut(sessionCookie, correlationId);
    return Promise.resolve({
      location: "/login",
      notice: "signed_out",
      sessionCookie: null,
      event: "session.signed_out",
    });
  },
);
