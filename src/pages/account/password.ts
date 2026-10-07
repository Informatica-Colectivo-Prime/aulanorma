// Página de cambio de contraseña (specs/002-boe-scorm-export: T028). Exige
// sesión y es la única página que se alcanza mientras la cuenta tiene
// pendiente cambiar su contraseña inicial. El campo oculto con el nombre de la
// cuenta permite a los gestores de contraseñas asociar la contraseña nueva; el
// servidor no lo lee.
import {
  html,
  layout,
  MIN_PASSWORD_LENGTH,
  noticeBox,
  protectedPage,
} from "@/platform/web";
import type { Html, Notice } from "@/platform/web";

const MESSAGES: Partial<Record<Notice, Html>> = {
  password_changed: noticeBox(
    "good",
    "Tu contraseña se ha cambiado. Las demás sesiones de tu cuenta se han cerrado.",
  ),
  password_invalid_current: noticeBox(
    "bad",
    "La contraseña actual no es correcta. No se ha cambiado nada.",
  ),
  password_invalid_new: noticeBox(
    "bad",
    `La contraseña nueva debe tener al menos ${String(MIN_PASSWORD_LENGTH)} caracteres. No se ha cambiado nada.`,
  ),
  password_unchanged: noticeBox(
    "bad",
    "La contraseña nueva debe ser distinta de la actual. No se ha cambiado nada.",
  ),
};

const PENDING = noticeBox(
  "neutral",
  "Estás usando la contraseña inicial. Cámbiala para poder continuar.",
);

export const getServerSideProps = protectedPage(
  {
    role: null,
    operation: "account.password.view",
    allowPendingPasswordChange: true,
  },
  ({ session, notice }) => ({
    status: 200,
    page: layout({
      title: "Contraseña",
      session,
      content: html`<h1>Cambiar la contraseña</h1>
        ${notice === undefined ? null : MESSAGES[notice]}
        ${session.user.mustChangePassword ? PENDING : null}
        <form method="post" action="/api/account/password">
          <input type="hidden" name="csrf" value="${session.csrfToken}" />
          <input
            type="text"
            name="username"
            autocomplete="username"
            value="${session.user.username}"
            hidden
            readonly
          />
          <label for="current">Contraseña actual</label>
          <input
            id="current"
            name="current"
            type="password"
            autocomplete="current-password"
            required
          />
          <label for="next">Contraseña nueva</label>
          <input
            id="next"
            name="next"
            type="password"
            autocomplete="new-password"
            minlength="${MIN_PASSWORD_LENGTH}"
            aria-describedby="next-hint"
            required
          />
          <p class="hint" id="next-hint">
            Al menos ${MIN_PASSWORD_LENGTH} caracteres. Una frase larga es mejor
            que una palabra complicada.
          </p>
          <button type="submit" data-busy="Guardando…">
            Cambiar la contraseña
          </button>
        </form>`,
    }),
  }),
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function Password(): null {
  return null;
}
