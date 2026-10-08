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
            ${
              roles.includes("teacher")
                ? html`<li>
                      <a href="/documents">Subir un documento oficial</a>,
                      comprobar su registro y revisar y validar su
                      interpretación.
                    </li>
                    <li>
                      Desde una interpretación validada, proponer, revisar y
                      aprobar el índice; y desde un índice aprobado, desarrollar
                      el temario, revisar y aprobar cada tema y aprobar una
                      versión.
                    </li>`
                : null
            }
            ${
              roles.length > 0
                ? html`<li>
                    <a href="/budget">Consultar el presupuesto de generación</a
                    >${
                      roles.includes("admin")
                        ? ", modificar su límite y conciliar las operaciones de resultado incierto"
                        : ""
                    }.
                  </li>`
                : null
            }
            <li><a href="/account/password">Cambiar tu contraseña</a></li>
            <li>Salir, con el botón de la cabecera.</li>
          </ul>
          <h2>Qué no está disponible todavía</h2>
          <p class="muted">
            Exportar y descargar el paquete llegará en una entrega posterior. La
            interpretación, el índice y el temario se obtienen, por ahora, de
            respuestas grabadas: no hay ningún servicio de generación real
            conectado.
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
