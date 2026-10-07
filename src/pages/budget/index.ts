// Presupuesto de generación (specs/002-boe-scorm-export: US3, FR-021, FR-027
// y FR-028; SC-037). Lo consultan las cuentas con el perfil de docente o de
// administración. Modificar el límite y conciliar una operación incierta son
// acciones aparte, solo para administración.
import { protectedPage } from "@/platform/web";
import { budgetView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: ["teacher", "admin"],
    operation: "budget.view",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime }) => {
    const { budget } = runtime.generation;
    return budgetView({
      session,
      notice,
      budget: budget.status(),
      changes: budget.changes(),
      uncertain: budget.list("uncertain"),
      provider: runtime.generation.provider,
      names: new Map(
        runtime.identity.listUsers().map((user) => [user.id, user.username]),
      ),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function BudgetPage(): null {
  return null;
}
