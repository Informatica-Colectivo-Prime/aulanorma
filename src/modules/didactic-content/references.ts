// Comprobación de referencias heredadas (specs/002-boe-scorm-export: FR-067;
// data-model.md, `ReferenceCheck`).
//
// Cuando el documento de una interpretación recibe un sustituto, su índice y
// sus temas se conservan, pero no pueden aprobarse mientras alguna de sus
// referencias normativas no se haya comprobado contra la nueva fuente. La
// comprobación la hace un docente, referencia a referencia, y queda
// registrada: nada se reasigna ni se da por comprobado en silencio.
import { randomBytes } from "node:crypto";
import type { Database } from "@/platform/persistence";

export type ReferenceTarget = "outline" | "topic";

export interface ReferenceCheck {
  readonly requirementId: string;
  readonly checkedBy: string;
  readonly checkedAt: number;
}

export interface References {
  list(kind: ReferenceTarget, targetId: string): readonly ReferenceCheck[];
  // De esos requisitos, los que todavía no se han comprobado.
  pending(
    kind: ReferenceTarget,
    targetId: string,
    requirementIds: readonly string[],
  ): readonly string[];
  // Registra la comprobación. `false` si ya estaba registrada.
  record(input: {
    readonly kind: ReferenceTarget;
    readonly targetId: string;
    readonly requirementId: string;
    readonly actorId: string;
  }): boolean;
}

export function createReferences({
  db,
  now,
}: {
  readonly db: Database;
  readonly now: () => number;
}): References {
  const list = (kind: ReferenceTarget, targetId: string): ReferenceCheck[] =>
    db
      .prepare(
        "SELECT * FROM reference_check WHERE target_kind = ? AND " +
          "target_id = ? ORDER BY checked_at, id",
      )
      .all(kind, targetId)
      .map((row) => ({
        requirementId: String(row.requirement_id),
        checkedBy: String(row.checked_by),
        checkedAt: Number(row.checked_at),
      }));

  return {
    list,

    pending(kind, targetId, requirementIds) {
      const checked = new Set(
        list(kind, targetId).map((item) => item.requirementId),
      );
      return requirementIds.filter((id) => !checked.has(id));
    },

    record({ kind, targetId, requirementId, actorId }) {
      if (
        list(kind, targetId).some(
          (item) => item.requirementId === requirementId,
        )
      ) {
        return false;
      }
      db.prepare(
        "INSERT INTO reference_check (id, target_kind, target_id, " +
          "requirement_id, checked_by, checked_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        randomBytes(16).toString("hex"),
        kind,
        targetId,
        requirementId,
        actorId,
        now(),
      );
      return true;
    },
  };
}
