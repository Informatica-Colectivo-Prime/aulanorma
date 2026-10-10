// Generación del temario: la lanza, la reanuda o pide otro intento de los
// temas fallidos (specs/002-boe-scorm-export: US3, FR-016, FR-019, FR-021 y
// FR-066). Exige sesión, su testigo y el perfil de docente.
//
// Es siempre una acción explícita de una persona: nada la inicia ni la
// reanuda por su cuenta, tampoco modificar el límite. La solicitud lleva la
// estimación y el coste máximo que el usuario vio; si ya no son los actuales,
// no se envía nada. Solo procesa temas pendientes o fallidos, cada uno con su
// propia reserva.
//
// Los temas se generan uno a uno y cada uno puede tardar hasta el tiempo
// máximo de una operación. Si la generación no termina en unos segundos, la
// respuesta no la espera: sigue en el servidor y la página del temario
// muestra su avance. Cerrar la página no la interrumpe ni la repite.
import { openSyllabus } from "@/modules/didactic-content";
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

const ID = /^[0-9a-f]{32}$/;
const NUMBER = /^(?:0|[1-9][0-9]{0,9})$/;
// Lo que la respuesta espera a la generación antes de dejarla en curso.
const GRACE_MS = 3000;

// El resultado, si llega antes de `milliseconds`; si no, `undefined`.
async function within<Result>(
  pending: Promise<Result>,
  milliseconds: number,
): Promise<Result | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          resolve(undefined);
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export default protectedAction(
  {
    role: "teacher",
    operation: "syllabus.generate",
    allowPendingPasswordChange: false,
  },
  async ({ field, session, runtime, correlationId }) => {
    const outlineId = field("outline");
    if (!ID.test(outlineId)) {
      return { location: "/documents" };
    }
    const shown = (name: string): number =>
      NUMBER.test(field(name)) ? Number(field(name)) : Number.NaN;
    const pending = openSyllabus(runtime).generate({
      outlineId,
      shown: {
        estimatedCost: shown("shown_estimate"),
        maxCost: shown("shown_max"),
      },
      actorId: session.user.id,
      correlationId,
    });
    const result = await within(pending, GRACE_MS);
    if (result === undefined) {
      // Sigue en el servidor. Su resultado queda en el temario y en el
      // registro; un fallo deja la ejecución como incompleta.
      pending.catch(() => undefined);
      return {
        location: `/syllabus/${outlineId}`,
        notice: "syllabus_running",
      };
    }
    if (!result.ok) {
      return result.reason === "not_found"
        ? { location: "/documents" }
        : {
            location: `/syllabus/${outlineId}`,
            notice: { code: "syllabus_refused", detail: result.reason },
          };
    }
    return {
      location: `/syllabus/${outlineId}`,
      notice: {
        code: "syllabus_generated",
        detail: [
          result.generated,
          result.failed,
          result.notSent,
          result.discarded,
          result.invalidated ? 1 : 0,
        ].join("_"),
      },
    };
  },
);
