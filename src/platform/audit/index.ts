// Registro de auditoría (specs/002-boe-scorm-export: FR-028 y SC-043;
// data-model.md, «Plataforma»). Módulo portable: solo importa tipos de Node.js
// y usa sintaxis TypeScript borrable.
//
// Solo ofrece dos operaciones: añadir un evento y leerlos. No existe ninguna
// para modificar ni borrar, y los disparadores de la tabla rechazan cualquier
// `UPDATE` o `DELETE`: una corrección es siempre un evento nuevo. Esta
// protección es de la aplicación; no cubre a quien administre el servidor y
// modifique directamente los ficheros.
//
// Los detalles de un evento son pares de texto, número o booleano que elige
// quien lo registra. Nunca deben llevar contraseñas, claves, identificadores
// de sesión ni contenido de documentos.
import type { DatabaseSync } from "node:sqlite";

export type AuditResult = "ok" | "denied" | "failed";
export type AuditDetails = Readonly<Record<string, string | number | boolean>>;

export interface AuditInput {
  readonly actorId: string | null;
  readonly action: string;
  readonly targetKind: string | null;
  readonly targetId: string | null;
  readonly result: AuditResult;
  readonly correlationId: string;
  readonly details: AuditDetails;
}

export interface AuditEvent extends AuditInput {
  readonly id: number;
  readonly at: string;
}

export interface Audit {
  record(event: AuditInput): void;
  list(): readonly AuditEvent[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function resultOf(value: unknown): AuditResult {
  return value === "denied" || value === "failed" ? value : "ok";
}

function detailsOf(value: unknown): AuditDetails {
  const details: Record<string, string | number | boolean> = {};
  const parsed: unknown = JSON.parse(text(value));
  if (typeof parsed === "object" && parsed !== null) {
    for (const [key, item] of Object.entries(parsed)) {
      if (
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean"
      ) {
        details[key] = item;
      }
    }
  }
  return details;
}

export function createAudit(
  db: DatabaseSync,
  now: () => Date = () => new Date(),
): Audit {
  return {
    record(event) {
      db.prepare(
        "INSERT INTO audit_event (at, actor_id, action, target_kind, " +
          "target_id, result, correlation_id, details) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        now().toISOString(),
        event.actorId,
        event.action,
        event.targetKind,
        event.targetId,
        event.result,
        event.correlationId,
        JSON.stringify(event.details),
      );
    },
    list() {
      return db
        .prepare("SELECT * FROM audit_event ORDER BY id")
        .all()
        .map((row) => ({
          id: Number(row.id),
          at: text(row.at),
          actorId: optionalText(row.actor_id),
          action: text(row.action),
          targetKind: optionalText(row.target_kind),
          targetId: optionalText(row.target_id),
          result: resultOf(row.result),
          correlationId: text(row.correlation_id),
          details: detailsOf(row.details),
        }));
    },
  };
}
