// Contrato del seguimiento del paquete (specs/002-boe-scorm-export: T062;
// FR-042 a FR-049; SC-017; contracts/scorm-package.md).
//
// El script del paquete se ejecuta en `jsdom` contra un doble de la API de
// SCORM 1.2 que aplica los límites del formato. Comprueba lo que el paquete
// pide a la plataforma y lo que dice al alumno; no acredita lo que hace un
// Moodle real, que es una comprobación manual (T079).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { packageDocument } from "@/modules/content-export";
import type { PackageSource } from "@/modules/content-export";
import { createScormApi, createStore } from "../support/scorm-api.ts";
import type { Call, Failures, Store } from "../support/scorm-api.ts";

const SCRIPT = readFileSync(
  fileURLToPath(
    new URL(
      "../../src/modules/content-export/package/assets/app.js",
      import.meta.url,
    ),
  ),
  "utf8",
);
const VERSION = "a".repeat(32);

function source(topics = 3, versionId = VERSION): PackageSource {
  return {
    versionId,
    label: "v1",
    documentTitle: "Documento sintético",
    kindNames: { capacity: "Capacidad" },
    trial: false,
    snapshot: {
      format: 1,
      unit: { code: "UX9001", title: "Unidad sintética" },
      topics: Array.from({ length: topics }, (_item, index) => ({
        title: `Título ${String(index + 1)}`,
        blocks: [
          {
            kind: "development" as const,
            content: [{ type: "paragraph" as const, text: "Texto." }],
            requirements: [],
          },
        ],
      })),
    },
  };
}

interface Session {
  readonly dom: JSDOM;
  readonly document: Document;
  readonly calls: Call[];
  readonly platform: ReturnType<typeof createScormApi> | undefined;
  status(): string;
  alert(): string;
  visibleTopic(): string;
  click(text: string, within?: string): void;
  mark(topic: number, checked?: boolean): void;
  finishButton(): HTMLButtonElement;
  leave(): void;
}

function open(
  options: {
    readonly store?: Store;
    readonly failures?: Failures;
    readonly api?: boolean;
    readonly topics?: number;
    readonly versionId?: string;
  } = {},
): Session {
  const dom = new JSDOM(
    packageDocument(source(options.topics, options.versionId)),
    { runScripts: "outside-only" },
  );
  const platform =
    options.api === false
      ? undefined
      : createScormApi(options.store ?? createStore(), options.failures);
  if (platform !== undefined) {
    Object.assign(dom.window, { API: platform.api });
  }
  dom.window.eval(SCRIPT);
  const { document } = dom.window;
  const text = (id: string): string =>
    document.getElementById(id)?.textContent ?? "";
  return {
    dom,
    document,
    calls: platform?.calls ?? [],
    platform,
    status: () => text("estado"),
    alert: () =>
      document.getElementById("aviso")?.hasAttribute("hidden") === true
        ? ""
        : text("aviso"),
    visibleTopic: () =>
      [...document.querySelectorAll("article.topic")]
        .filter((item) => !item.hasAttribute("hidden"))
        .map((item) => item.id)
        .join(","),
    click(label, within = "body") {
      const button = [
        ...document.querySelectorAll<HTMLElement>(
          `${within} button, ${within} a`,
        ),
      ].find(
        (item) =>
          !item.closest("[hidden]") &&
          item.textContent.trim().startsWith(label),
      );
      if (button === undefined) {
        throw new Error(`No hay ningún control visible «${label}».`);
      }
      button.click();
    },
    mark(topic, checked = true) {
      const box = document.querySelector<HTMLInputElement>(
        `#tema-${String(topic)} input[type=checkbox]`,
      );
      if (box === null) {
        throw new Error("No hay casilla.");
      }
      box.checked = checked;
      box.dispatchEvent(new dom.window.Event("change"));
    },
    finishButton() {
      const button = document.querySelector<HTMLButtonElement>("#finalizar");
      if (button === null) {
        throw new Error("No hay botón de finalizar.");
      }
      return button;
    },
    leave() {
      dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    },
  };
}

const sets = (calls: readonly Call[], element: string): string[] =>
  calls
    .filter((call) => call.name === "LMSSetValue" && call.args[0] === element)
    .map((call) => call.args[1] ?? "");
const names = (calls: readonly Call[]): string[] =>
  calls.map((call) => call.name);
const SAVED = /confirmado que tu recorrido está guardado/;
// Ninguna de las formas en que el paquete podría afirmar un guardado.
const CLAIMS_SAVED = /guardado\.|está guardado|confirmado/;

describe("inicio", () => {
  test("la primera vez inicia, lee el estado, pasa a «incomplete» y guarda", () => {
    const session = open();
    expect(names(session.calls).slice(0, 4)).toEqual([
      "LMSInitialize",
      "LMSGetValue",
      "LMSGetValue",
      "LMSGetValue",
    ]);
    expect(
      session.calls
        .filter((call) => call.name === "LMSGetValue")
        .map((call) => call.args[0]),
    ).toEqual([
      "cmi.core.lesson_status",
      "cmi.suspend_data",
      "cmi.core.lesson_location",
    ]);
    expect(sets(session.calls, "cmi.core.lesson_status")).toEqual([
      "incomplete",
    ]);
    expect(names(session.calls).at(-1)).toBe("LMSCommit");
    expect(session.calls.every((call) => call.result !== "false")).toBe(true);
    expect(session.status()).toMatch(SAVED);
    expect(session.alert()).toBe("");
    // Empieza en el índice, con todos los temas pendientes.
    expect(session.visibleTopic()).toBe("");
    expect(
      session.document.querySelectorAll("[data-mark]")[0]?.textContent,
    ).toBe("· Pendiente");
  });

  test("sin el script, el documento muestra todos los temas y dice que no se guarda", () => {
    const dom = new JSDOM(packageDocument(source()));
    expect(
      dom.window.document.querySelectorAll("article.topic:not([hidden])"),
    ).toHaveLength(3);
    expect(dom.window.document.getElementById("estado")?.textContent).toMatch(
      /el recorrido no se guarda/,
    );
  });
});

describe("navegación y marcas", () => {
  test("índice, tema siguiente y tema anterior; cada cambio se guarda", () => {
    const session = open();
    session.click("Tema 1.", "#indice");
    expect(session.visibleTopic()).toBe("tema-1");
    session.click("Tema siguiente", "#tema-1");
    expect(session.visibleTopic()).toBe("tema-2");
    session.click("Tema anterior", "#tema-2");
    expect(session.visibleTopic()).toBe("tema-1");
    session.click("Índice", "#tema-1");
    expect(session.visibleTopic()).toBe("");
    expect(sets(session.calls, "cmi.core.lesson_location")).toEqual([
      "",
      "t1",
      "t2",
      "t1",
      "",
    ]);
    // El primer tema no tiene anterior ni el último siguiente.
    expect(
      session.document.querySelector("#tema-1 .controls")?.textContent,
    ).not.toContain("Tema anterior");
    expect(
      session.document.querySelector("#tema-3 .controls")?.textContent,
    ).not.toContain("Tema siguiente");
  });

  test("marcar y desmarcar un tema guarda un estado compacto con la versión", () => {
    const session = open();
    session.mark(2);
    session.mark(3);
    session.mark(2, false);
    expect(sets(session.calls, "cmi.suspend_data").slice(-3)).toEqual([
      `1|${VERSION}|010`,
      `1|${VERSION}|011`,
      `1|${VERSION}|001`,
    ]);
    expect(
      session.document.querySelectorAll("[data-mark]")[2]?.textContent,
    ).toBe("· Recorrido");
    expect(names(session.calls).at(-1)).toBe("LMSCommit");
  });
});

describe("salida y reanudación", () => {
  test("al salir sin finalizar pide suspender, guarda y termina; al volver continúa", () => {
    const store = createStore();
    const first = open({ store });
    first.click("Tema 2.", "#indice");
    first.mark(2);
    first.mark(1);
    first.leave();
    expect(
      first.calls.slice(-3).map((call) => [call.name, ...call.args]),
    ).toEqual([
      ["LMSSetValue", "cmi.core.exit", "suspend"],
      ["LMSCommit", ""],
      ["LMSFinish", ""],
    ]);
    // Una segunda señal de salida no repite nada.
    const before = first.calls.length;
    first.dom.window.dispatchEvent(new first.dom.window.Event("beforeunload"));
    expect(first.calls).toHaveLength(before);

    const second = open({ store });
    expect(second.visibleTopic()).toBe("tema-2");
    expect(
      [...second.document.querySelectorAll("[data-mark]")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["· Recorrido", "· Recorrido", "· Pendiente"]);
    // No vuelve a fijar el estado: ya era «incomplete».
    expect(sets(second.calls, "cmi.core.lesson_status")).toEqual([]);
    expect(second.alert()).toBe("");
  });

  test("el estado de otra versión del temario se descarta y se avisa", () => {
    const store = createStore();
    const first = open({ store });
    first.mark(1);
    first.click("Tema 1.", "#indice");
    first.leave();

    const second = open({ store, versionId: "b".repeat(32) });
    expect(second.alert()).toMatch(/otra versión de este temario/);
    expect(second.visibleTopic()).toBe("");
    expect(sets(second.calls, "cmi.suspend_data")).toEqual([
      `1|${"b".repeat(32)}|000`,
    ]);
  });

  test.each([
    ["otro formato", `2|${VERSION}|100`],
    ["otra longitud", `1|${VERSION}|10`],
    ["caracteres ajenos", `1|${VERSION}|1x0`],
    ["sin partes", "basura"],
  ])("un estado guardado con %s no se reutiliza", (_name, suspend) => {
    const store = createStore();
    store.committed = {
      "cmi.core.lesson_status": "incomplete",
      "cmi.suspend_data": suspend,
      "cmi.core.lesson_location": "t2",
    };
    const session = open({ store });
    expect(session.alert()).toMatch(/otra versión/);
    expect(session.visibleTopic()).toBe("");
  });
});

describe("finalización", () => {
  test("«Finalizar» solo está disponible con todos los temas marcados", () => {
    const session = open();
    expect(session.finishButton().disabled).toBe(true);
    session.mark(1);
    session.mark(2);
    expect(session.finishButton().disabled).toBe(true);
    expect(
      session.document.getElementById("finalizar-nota")?.textContent,
    ).toMatch(/todos los temas/);
    session.mark(3);
    expect(session.finishButton().disabled).toBe(false);
    session.mark(3, false);
    expect(session.finishButton().disabled).toBe(true);
    // Un clic forzado sobre el botón deshabilitado no comunica nada.
    session.finishButton().click();
    expect(sets(session.calls, "cmi.core.lesson_status")).toEqual([
      "incomplete",
    ]);
  });

  test("al finalizar comunica «completed», sin suspender, guarda y termina", () => {
    const store = createStore();
    const session = open({ store });
    session.mark(1);
    session.mark(2);
    session.mark(3);
    session.finishButton().click();
    expect(
      session.calls.slice(-4).map((call) => [call.name, ...call.args]),
    ).toEqual([
      ["LMSSetValue", "cmi.core.lesson_status", "completed"],
      ["LMSSetValue", "cmi.core.exit", ""],
      ["LMSCommit", ""],
      ["LMSFinish", ""],
    ]);
    expect(store.committed["cmi.core.lesson_status"]).toBe("completed");
    expect(session.status()).toMatch(/confirmado la finalización/);
    expect(session.status()).toMatch(/No es una calificación/);
    expect(session.finishButton().disabled).toBe(true);
    // Después de terminar no hay más llamadas, tampoco al salir.
    const before = session.calls.length;
    session.leave();
    expect(session.calls).toHaveLength(before);
  });

  test("nunca comunica puntuación ni superación", () => {
    const store = createStore();
    const session = open({ store });
    session.click("Tema 1.", "#indice");
    session.mark(1);
    session.mark(2);
    session.mark(3);
    session.finishButton().click();
    const written = session.calls.filter((call) => call.name === "LMSSetValue");
    expect(written.some((call) => call.args[0]?.includes("score"))).toBe(false);
    expect(
      written.some((call) => ["passed", "failed"].includes(call.args[1] ?? "")),
    ).toBe(false);
    expect(new Set(written.map((call) => call.args[0]))).toEqual(
      new Set([
        "cmi.core.lesson_status",
        "cmi.core.lesson_location",
        "cmi.suspend_data",
        "cmi.core.exit",
      ]),
    );
    expect(SCRIPT).not.toMatch(/score|passed|failed|mastery/);
  });

  test("una actividad ya finalizada no vuelve a «incomplete» ni se finaliza de nuevo", () => {
    const store = createStore();
    const first = open({ store });
    first.mark(1);
    first.mark(2);
    first.mark(3);
    first.finishButton().click();

    const second = open({ store });
    expect(sets(second.calls, "cmi.core.lesson_status")).toEqual([]);
    expect(second.status()).toMatch(/ya consta como finalizada/);
    expect(second.finishButton().disabled).toBe(true);
    second.leave();
    expect(sets(second.calls, "cmi.core.exit")).toEqual([]);
    expect(store.committed["cmi.core.lesson_status"]).toBe("completed");
  });
});

describe("sin plataforma", () => {
  test("muestra el contenido, avisa de que no se guarda y nunca afirma un guardado", () => {
    const session = open({ api: false });
    expect(session.status()).toMatch(/tu recorrido no se guardará/);
    session.click("Tema 1.", "#indice");
    expect(session.visibleTopic()).toBe("tema-1");
    session.mark(1);
    session.mark(2);
    session.mark(3);
    session.click("Tema siguiente", "#tema-1");
    expect(session.status()).toMatch(/tu recorrido no se guardará/);
    expect(session.status()).not.toMatch(CLAIMS_SAVED);
    expect(session.alert()).not.toMatch(CLAIMS_SAVED);
    // No hay a quién comunicar la finalización.
    expect(session.finishButton().disabled).toBe(true);
    expect(
      session.document.getElementById("finalizar-nota")?.textContent,
    ).toMatch(/No disponible/);
    session.leave();
  });

  test("si la plataforma rechaza el inicio, se trata igual y no se la vuelve a llamar", () => {
    const session = open({ failures: { initialize: true } });
    expect(session.status()).toMatch(/no ha aceptado el inicio/);
    session.mark(1);
    session.leave();
    expect(names(session.calls)).toEqual(["LMSInitialize"]);
    expect(session.status()).not.toMatch(CLAIMS_SAVED);
  });
});

describe("fallos de la plataforma", () => {
  test.each([
    ["LMSCommit", { commit: true }],
    ["la escritura del estado", { set: ["cmi.suspend_data"] }],
    ["la escritura de la posición", { set: ["cmi.core.lesson_location"] }],
    ["una excepción", { commit: true, throws: true }],
  ] as const)(
    "si falla %s, no dice que ha guardado y lo indica al alumno",
    (_name, failures) => {
      const session = open();
      expect(session.status()).toMatch(SAVED);
      if (session.platform !== undefined) {
        session.platform.failures = failures;
      }
      session.mark(1);
      expect(session.status()).toBe("Recorrido sin guardar.");
      expect(session.status()).not.toMatch(CLAIMS_SAVED);
      expect(session.alert()).toMatch(/No se ha podido guardar/);
      // La marca se conserva en pantalla y el siguiente guardado lo repara.
      if (session.platform !== undefined) {
        session.platform.failures = {};
      }
      session.mark(2);
      expect(session.status()).toMatch(SAVED);
      expect(session.alert()).toBe("");
      expect(sets(session.calls, "cmi.suspend_data").at(-1)).toBe(
        `1|${VERSION}|110`,
      );
    },
  );

  test("si falla desde el inicio, la primera pantalla ya lo dice", () => {
    const session = open({ failures: { commit: true } });
    expect(session.status()).toBe("Recorrido sin guardar.");
    expect(session.alert()).toMatch(/No se ha podido guardar/);
  });

  test("si la plataforma no acepta «incomplete», se reintenta con el siguiente guardado", () => {
    const session = open({ failures: { set: ["cmi.core.lesson_status"] } });
    expect(session.status()).toBe("Recorrido sin guardar.");
    if (session.platform !== undefined) {
      session.platform.failures = {};
    }
    session.mark(1);
    expect(
      session.calls.filter(
        (call) =>
          call.args[0] === "cmi.core.lesson_status" && call.result === "true",
      ),
    ).toHaveLength(1);
    expect(session.status()).toMatch(SAVED);
  });

  test.each([
    ["el guardado", { commit: true }],
    ["el cierre", { finish: true }],
    ["el estado", { set: ["cmi.core.lesson_status"] }],
  ] as const)(
    "si al finalizar falla %s, no consta como finalizada y se puede reintentar",
    (_name, failures) => {
      const session = open();
      session.mark(1);
      session.mark(2);
      session.mark(3);
      if (session.platform !== undefined) {
        session.platform.failures = failures;
      }
      session.finishButton().click();
      expect(session.alert()).toMatch(
        /No se ha podido comunicar la finalización/,
      );
      expect(session.status()).not.toMatch(CLAIMS_SAVED);
      expect(session.finishButton().disabled).toBe(false);
      if (session.platform !== undefined) {
        session.platform.failures = {};
      }
      session.finishButton().click();
      expect(session.status()).toMatch(/confirmado la finalización/);
      expect(session.alert()).toBe("");
    },
  );

  test("si no se puede leer el recorrido anterior, no lo sustituye hasta que el alumno actúa", () => {
    const store = createStore();
    const first = open({ store });
    first.mark(1);
    first.leave();
    const saved = store.committed["cmi.suspend_data"];

    const second = open({ store, failures: { get: ["cmi.suspend_data"] } });
    expect(second.alert()).toMatch(
      /No se ha podido leer tu recorrido anterior/,
    );
    expect(second.status()).not.toMatch(CLAIMS_SAVED);
    expect(sets(second.calls, "cmi.suspend_data")).toEqual([]);
    expect(store.committed["cmi.suspend_data"]).toBe(saved);
  });
});

describe("límites del formato", () => {
  test("con 200 temas, el estado y la posición caben en los límites de SCORM 1.2", () => {
    const store = createStore();
    const session = open({ store, topics: 200 });
    for (let topic = 1; topic <= 200; topic += 1) {
      session.mark(topic);
    }
    session.click("Tema 200.", "#indice");
    const state = store.committed["cmi.suspend_data"] ?? "";
    expect(state).toBe(`1|${VERSION}|${"1".repeat(200)}`);
    expect(state.length).toBeLessThanOrEqual(4096);
    expect(store.committed["cmi.core.lesson_location"]).toBe("t200");
    // El doble rechaza lo que excede el formato: ninguna llamada falló.
    expect(session.calls.every((call) => call.result !== "false")).toBe(true);
    session.leave();
    expect(open({ store, topics: 200 }).visibleTopic()).toBe("tema-200");
  });

  test("el script no hace peticiones de red ni carga nada", () => {
    expect(SCRIPT).not.toMatch(
      /XMLHttpRequest|fetch|WebSocket|sendBeacon|import\(|https?:|\/\/[a-z0-9]/i,
    );
  });
});
