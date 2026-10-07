// Registro de auditoría (specs/002-boe-scorm-export: T016, FR-028 y SC-043).
// Solo inserción: ni el módulo ni la base de datos permiten modificar o borrar
// un evento registrado.
import { describe, expect, test } from "vitest";
import { createAudit } from "@/platform/audit";
import type { AuditInput } from "@/platform/audit";
import {
  migrate,
  openMemoryDatabase,
  PLATFORM_MIGRATIONS,
} from "@/platform/persistence";

function database(): ReturnType<typeof openMemoryDatabase> {
  const db = openMemoryDatabase();
  migrate(db, PLATFORM_MIGRATIONS);
  return db;
}

const EVENT: AuditInput = {
  actorId: "usuario-1",
  action: "prueba.accion",
  targetKind: "cosa",
  targetId: "cosa-1",
  result: "ok",
  correlationId: "correlacion-1",
  details: { motivo: "sintético", intentos: 2, definitivo: true },
};

describe("createAudit(db)", () => {
  test("solo expone record y list", () => {
    expect(Object.keys(createAudit(database())).sort()).toEqual([
      "list",
      "record",
    ]);
  });

  test("registra un evento con su fecha y lo devuelve tal como se registró", () => {
    const at = new Date("2026-01-02T03:04:05.678Z");
    const audit = createAudit(database(), () => at);
    audit.record(EVENT);
    expect(audit.list()).toEqual([
      { ...EVENT, id: 1, at: "2026-01-02T03:04:05.678Z" },
    ]);
  });

  test("conserva el orden de registro y admite campos vacíos", () => {
    const audit = createAudit(database());
    audit.record(EVENT);
    audit.record({
      actorId: null,
      action: "prueba.denegada",
      targetKind: null,
      targetId: null,
      result: "denied",
      correlationId: "correlacion-2",
      details: {},
    });
    audit.record({ ...EVENT, result: "failed" });
    const events = audit.list();
    expect(events.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(events.map(({ result }) => result)).toEqual([
      "ok",
      "denied",
      "failed",
    ]);
    expect(events[1]).toMatchObject({
      actorId: null,
      targetKind: null,
      targetId: null,
      details: {},
    });
  });

  test("rechaza un resultado que no es de la lista cerrada", () => {
    const audit = createAudit(database());
    expect(() => {
      audit.record({ ...EVENT, result: "tal vez" as never });
    }).toThrow();
    expect(audit.list()).toEqual([]);
  });
});

describe("solo inserción en la base de datos", () => {
  test.each([
    "UPDATE audit_event SET action = 'cambiada'",
    "UPDATE audit_event SET result = 'denied' WHERE id = 1",
    "UPDATE audit_event SET details = '{}'",
    "DELETE FROM audit_event",
    "DELETE FROM audit_event WHERE id = 1",
    "INSERT OR REPLACE INTO audit_event (id, at, action, result, correlation_id, details) VALUES (1, 'x', 'x', 'ok', 'x', '{}')",
  ])("%s se rechaza y el evento no cambia", (sql) => {
    const db = database();
    const audit = createAudit(db);
    audit.record(EVENT);
    const before = audit.list();
    expect(() => {
      db.exec(sql);
    }).toThrow(/append-only|constraint/i);
    expect(audit.list()).toEqual(before);
  });

  test("una corrección es un evento nuevo: el anterior permanece", () => {
    const audit = createAudit(database());
    audit.record({ ...EVENT, action: "dato.registrado" });
    audit.record({ ...EVENT, action: "dato.corregido" });
    expect(audit.list().map(({ action }) => action)).toEqual([
      "dato.registrado",
      "dato.corregido",
    ]);
  });
});
