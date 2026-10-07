// Página de inicio (specs/002-boe-scorm-export: T028). Exige sesión. Muestra
// con qué cuenta y perfiles se ha entrado y qué se puede hacer ya; no presenta
// como disponibles las funciones que todavía no existen.
import { html, layout, protectedPage } from "@/platform/web";
import type { Role } from "@/platform/web";

const ROLE_NAMES: Record<Role, string> = {
  admin: "Administración",
  teacher: "Docente autorizado",
};

export const getServerSideProps = protectedPage(
  { role: null, operation: "home.view", allowPendingPasswordChange: false },
  ({ session }) => {
    const { username, roles } = session.user;
    const profiles =
      roles.length === 0
        ? "Ninguno. Con esta cuenta puedes entrar y salir, pero no usar las funciones de AulaNorma."
        : roles.map((role) => ROLE_NAMES[role]).join(" y ");
    return {
      status: 200,
      page: layout({
        title: "Inicio",
        session,
        content: html`<h1>Inicio</h1>
          <dl>
            <dt>Cuenta</dt>
            <dd>${username}</dd>
            <dt>Perfiles</dt>
            <dd>${profiles}</dd>
          </dl>
          <h2>Qué puedes hacer ahora</h2>
          <ul>
            <li><a href="/account/password">Cambiar tu contraseña</a></li>
            <li>Salir, con el botón de la cabecera.</li>
          </ul>
          <h2>Qué no está disponible todavía</h2>
          <p class="muted">
            Esta versión solo incluye el acceso. Subir el documento oficial,
            revisar su interpretación, aprobar el índice y el temario y exportar
            el paquete llegarán en entregas posteriores.
          </p>`,
      }),
    };
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function Home(): null {
  return null;
}
