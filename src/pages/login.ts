// Página de entrada (specs/002-boe-scorm-export: T027;
// contracts/http-surface.md). Es, con su envío, lo único accesible sin sesión,
// y no concede acceso a nada más.
import { entryPage, html, layout, noticeBox } from "@/platform/web";
import type { Html, Notice } from "@/platform/web";

const MESSAGES: Partial<Record<Notice, Html>> = {
  signin_refused: noticeBox(
    "bad",
    "No hemos podido iniciar la sesión. Revisa el nombre de usuario y la contraseña e inténtalo de nuevo.",
  ),
  signin_throttled: noticeBox(
    "bad",
    "Hay demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.",
  ),
  signin_expired: noticeBox(
    "bad",
    "La página había caducado. Vuelve a escribir tus datos para entrar.",
  ),
  signed_out: noticeBox("good", "Has salido de AulaNorma."),
};

export const getServerSideProps = entryPage(({ entry, notice }) => ({
  status: 200,
  page: layout({
    title: "Entrar",
    session: null,
    content: html`<h1>Entrar en AulaNorma</h1>
      ${notice === undefined ? null : MESSAGES[notice]}
      <form method="post" action="/api/session/sign-in">
        <input type="hidden" name="csrf" value="${entry.csrfToken}" />
        <label for="username">Nombre de usuario</label>
        <input
          id="username"
          name="username"
          type="text"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          required
        />
        <label for="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />
        <button type="submit" data-busy="Entrando…">Entrar</button>
      </form>
      <p class="hint">
        Las cuentas las crea quien administra AulaNorma. Si no recuerdas tu
        contraseña, pídele que te asigne una nueva.
      </p>`,
  }),
}));

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function Login(): null {
  return null;
}
