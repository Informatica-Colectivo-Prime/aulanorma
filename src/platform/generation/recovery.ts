// Regla de recuperación de las reservas de presupuesto (research.md, R6 y
// R11; contracts/generation-provider.md). Fichero portable: lo cargan con
// Node.js el servicio, a través del presupuesto, y la comprobación de una
// restauración, así que no importa nada en ejecución.
//
// Tras una caída, o al restaurar una copia hecha con operaciones en curso, no
// puede saberse si lo que constaba como enviado llegó a consumirse: queda
// como incierto y sigue contando contra el presupuesto. Lo reservado que no
// llegó a enviarse se libera. Debe llamarse dentro de una transacción.
import type { DatabaseSync } from "node:sqlite";

export function recoverInterruptedReservations(
  db: DatabaseSync,
  at: number,
): { readonly uncertain: number; readonly released: number } {
  return {
    uncertain: Number(
      db
        .prepare(
          "UPDATE budget_reservation SET state = 'uncertain' " +
            "WHERE state = 'sent'",
        )
        .run().changes,
    ),
    released: Number(
      db
        .prepare(
          "UPDATE budget_reservation SET state = 'released', " +
            "closed_at = ? WHERE state = 'reserved'",
        )
        .run(at).changes,
    ),
  };
}
