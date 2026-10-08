// Métricas mínimas: errores, latencia, coste de generación y estado de las
// exportaciones, a partir de lo ya registrado (specs/002-boe-scorm-export:
// T085; constitución, principio XI). Solo lectura, para administración.
import { openContentExport } from "@/modules/content-export";
import { protectedPage } from "@/platform/web";
import { metricsView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "admin",
    operation: "metrics.view",
    allowPendingPasswordChange: false,
  },
  ({ session, runtime }) => {
    const audit = { ok: 0, denied: 0, failed: 0 };
    for (const event of runtime.audit.list()) {
      audit[event.result] += 1;
    }
    return metricsView({
      session,
      audit,
      generation: runtime.generation.summary(),
      budget: runtime.generation.budget.status(),
      exports: openContentExport(runtime).statistics(),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function MetricsPage(): null {
  return null;
}
