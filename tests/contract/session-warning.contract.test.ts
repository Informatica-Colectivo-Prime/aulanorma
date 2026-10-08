// Aviso de caducidad de la sesión en el navegador (specs/002-boe-scorm-export:
// T082; WCAG 2.2.1).
//
// Ejecuta el script real del documento sobre el marcado real, en un DOM
// simulado con el reloj, el temporizador y la red controlados por la prueba.
// Comprueba cuándo aparece el aviso, adónde va el foco, qué se anuncia, qué se
// envía al ampliar y qué ocurre al caducar, con varias pestañas y con una
// sesión que el servidor ya no reconoce.
//
// No sustituye a la comprobación en un navegador real con teclado y lector de
// pantalla: un DOM simulado no dice cómo se anuncia nada.
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { html, layout } from "@/platform/web";
import type { SessionContext } from "@/platform/web";

const MINUTE = 60_000;
const IDLE = 30 * MINUTE;
const MAX = 12 * 60 * MINUTE;
const SERVER_NOW = Date.parse("2026-03-02T08:00:00Z");
// El reloj del navegador no coincide con el del servidor.
const CLIENT_NOW = SERVER_NOW + 7 * MINUTE + 1234;
const KEY = "aulanorma-sesion";
const TOKEN = "testigo de prueba/+=&";

interface Request {
  readonly url: string;
  readonly init: {
    readonly method: string;
    readonly credentials: string;
    readonly redirect: string;
    readonly headers: Record<string, string>;
    readonly body: string;
  };
  respond(status: number): Promise<void>;
  fail(): Promise<void>;
}

interface Tab {
  readonly window: Window & typeof globalThis;
  readonly requests: Request[];
  advance(ms: number): void;
  element(id: string): HTMLElement;
  readonly box: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly text: string;
  readonly live: string;
  readonly focused: string;
  // Lo que otra pestaña dejaría en el almacenamiento local.
  fromOtherTab(value: unknown): void;
  published(): unknown;
}

function session(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    csrfToken: TOKEN,
    user: {
      id: "u1",
      username: "docente1",
      roles: ["teacher"],
      disabled: false,
      mustChangePassword: false,
    },
    idleExpiresAt: SERVER_NOW + IDLE,
    idleMs: IDLE,
    expiresAt: SERVER_NOW + MAX,
    ...overrides,
  };
}

function open(context: SessionContext | null = session()): Tab {
  // `layout` anota la hora del servidor en el marcado.
  const realNow = Date.now;
  Date.now = () => SERVER_NOW;
  let page: string;
  try {
    page = layout({
      title: "Prueba",
      session: context,
      content: html`<h1>Prueba</h1>
        <form method="post" action="/api/topics/edit">
          <label for="texto">Texto</label>
          <textarea id="texto" name="text"></textarea>
          <button type="submit">Guardar</button>
        </form>`,
    }).text;
  } finally {
    Date.now = realNow;
  }
  const script = /<script>(.*?)<\/script>/s.exec(page)?.[1] ?? "";
  const dom = new JSDOM(page.replace(/<script>.*?<\/script>/s, ""), {
    runScripts: "outside-only",
    url: "https://aulanorma.example/topics/1",
  });
  const { window } = dom;
  let clock = CLIENT_NOW;
  const ticks: (() => void)[] = [];
  const requests: Request[] = [];
  window.Date.now = () => clock;
  window.setInterval = ((callback: () => void) => {
    ticks.push(callback);
    return ticks.length;
  }) as unknown as typeof window.setInterval;
  // El estado de carga de un botón usa `setTimeout`: se ejecuta en el acto.
  window.setTimeout = ((callback: () => void) => {
    callback();
    return 0;
  }) as unknown as typeof window.setTimeout;
  const settle = async (): Promise<void> => {
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve();
    }
  };
  window.fetch = ((url: string, init: Request["init"]) =>
    new Promise((resolve, reject) => {
      requests.push({
        url,
        init,
        respond: async (status) => {
          resolve({ status });
          await settle();
        },
        fail: async () => {
          reject(new Error("sin red"));
          await settle();
        },
      });
    })) as unknown as typeof window.fetch;
  window.eval(script);
  const element = (id: string): HTMLElement => {
    const found = window.document.getElementById(id);
    if (found === null) {
      throw new Error(`falta #${id}`);
    }
    return found;
  };
  return {
    window,
    requests,
    advance(ms) {
      // Segundo a segundo, como el temporizador real.
      for (let passed = 0; passed < ms; passed += 1000) {
        clock += Math.min(1000, ms - passed);
        ticks.forEach((tick) => {
          tick();
        });
      }
    },
    element,
    get box() {
      return element("sesion-aviso");
    },
    get button() {
      const found = element("sesion-ampliar").querySelector("button");
      if (found === null) {
        throw new Error("falta el botón de continuar");
      }
      return found;
    },
    get text() {
      return `${element("sesion-titulo").textContent} | ${element("sesion-texto").textContent}`;
    },
    get live() {
      return element("sesion-estado").textContent;
    },
    get focused() {
      const active = window.document.activeElement;
      return active === null
        ? ""
        : `${active.tagName.toLowerCase()}${active.id === "" ? "" : `#${active.id}`}${active.tagName === "BUTTON" || active.tagName === "A" ? `:${active.textContent.trim()}` : ""}`;
    },
    fromOtherTab(value) {
      const newValue = JSON.stringify(value);
      window.localStorage.setItem(KEY, newValue);
      window.dispatchEvent(
        new window.StorageEvent("storage", { key: KEY, newValue }),
      );
    },
    published() {
      return JSON.parse(window.localStorage.getItem(KEY) ?? "null") as unknown;
    },
  };
}

// Activa el botón como lo hace el teclado: Intro o espacio sobre un botón de
// envío producen su `click`, y este, el envío del formulario.
function press(tab: Tab): void {
  expect(tab.focused).toBe("button:Continuar la sesión");
  tab.button.click();
}

describe("aviso antes de la caducidad por inactividad", () => {
  test("no aparece hasta dos minutos antes, y entonces recibe el foco y dice qué pasa y qué hacer", () => {
    const tab = open();
    expect(tab.box.hidden).toBe(true);
    tab.element("texto").focus();
    expect(tab.focused).toBe("textarea#texto");

    tab.advance(IDLE - 2 * MINUTE - 1000);
    expect(tab.box.hidden).toBe(true);
    expect(tab.focused).toBe("textarea#texto");

    tab.advance(1000);
    expect(tab.box.hidden).toBe(false);
    expect(tab.box.getAttribute("role")).toBe("alertdialog");
    expect(tab.text).toBe(
      "Tu sesión está a punto de caducar | Por inactividad, tu sesión caducará dentro de 2 minutos. Si caduca, lo que hayas escrito en esta página y no hayas enviado se perderá. Pulsa «Continuar la sesión» para seguir trabajando.",
    );
    expect(tab.element("sesion-cuenta").textContent).toBe(
      "Tiempo restante: 2:00",
    );
    expect(tab.focused).toBe("button:Continuar la sesión");
    expect(tab.element("sesion-ampliar").hidden).toBe(false);
    expect(tab.element("sesion-entrar").hidden).toBe(true);
    // Ninguna petición por su cuenta: ni antes ni al mostrar el aviso.
    expect(tab.requests).toEqual([]);
  });

  test("la cuenta atrás es visible cada segundo, pero solo se anuncia al minuto, a los treinta y a los diez segundos", () => {
    const tab = open();
    tab.advance(IDLE - 2 * MINUTE);
    const announced: string[] = [];
    let last = tab.live;
    for (let second = 0; second < 119; second += 1) {
      tab.advance(1000);
      if (tab.live !== last) {
        last = tab.live;
        announced.push(`${tab.element("sesion-cuenta").textContent} → ${last}`);
      }
    }
    expect(announced).toEqual([
      "Tiempo restante: 1:00 → Queda 1 minuto de sesión.",
      "Tiempo restante: 0:30 → Quedan 30 segundos de sesión.",
      "Tiempo restante: 0:10 → Quedan 10 segundos de sesión.",
    ]);
    expect(tab.element("sesion-cuenta").textContent).toBe(
      "Tiempo restante: 0:01",
    );
    // La cuenta visible no está en una región viva.
    expect(tab.element("sesion-cuenta").getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(tab.element("sesion-estado").getAttribute("role")).toBe("status");
  });

  test("continuar envía una única petición al servidor, con el testigo, y si la acepta oculta el aviso y devuelve el foco", async () => {
    const tab = open();
    tab.element("texto").focus();
    (tab.element("texto") as HTMLTextAreaElement).value = "trabajo sin enviar";
    tab.advance(IDLE - MINUTE);
    press(tab);

    expect(tab.requests).toHaveLength(1);
    const [request] = tab.requests;
    expect(request?.url).toBe("/api/session/extend");
    expect(request?.init).toEqual({
      method: "POST",
      credentials: "same-origin",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `csrf=${encodeURIComponent(TOKEN)}`,
    });
    // Mientras responde, el aviso sigue a la vista.
    expect(tab.box.hidden).toBe(false);

    await request?.respond(204);
    expect(tab.box.hidden).toBe(true);
    expect(tab.live).toBe("Sesión ampliada.");
    expect(tab.focused).toBe("textarea#texto");
    expect((tab.element("texto") as HTMLTextAreaElement).value).toBe(
      "trabajo sin enviar",
    );
    expect(tab.button.disabled).toBe(false);

    // El periodo vuelve a contar entero desde que se pidió la ampliación.
    tab.advance(IDLE - 2 * MINUTE - 1000);
    expect(tab.box.hidden).toBe(true);
    tab.advance(1000);
    expect(tab.box.hidden).toBe(false);
    expect(tab.requests).toHaveLength(1);
  });

  test("se puede continuar más de diez veces seguidas", async () => {
    const tab = open();
    for (let round = 1; round <= 12; round += 1) {
      tab.advance(IDLE - MINUTE);
      expect(tab.box.hidden, String(round)).toBe(false);
      press(tab);
      await tab.requests.at(-1)?.respond(204);
      expect(tab.box.hidden, String(round)).toBe(true);
    }
    expect(tab.requests).toHaveLength(12);
  });

  test("una pestaña abierta, sin que nadie pulse nada, no envía ninguna petición y acaba caducada", () => {
    const tab = open();
    tab.element("texto").focus();
    tab.advance(IDLE - 1000);
    expect(tab.text).toContain("Tu sesión está a punto de caducar");

    tab.advance(1000);
    expect(tab.text).toBe(
      "Tu sesión ha terminado | Lo que quedara sin enviar en esta página no se ha guardado. Puedes copiarlo antes de salir de ella. Para seguir trabajando, vuelve a entrar.",
    );
    expect(tab.box.hidden).toBe(false);
    expect(tab.element("sesion-ampliar").hidden).toBe(true);
    expect(tab.element("sesion-entrar").hidden).toBe(false);
    expect(tab.focused).toBe("a:Volver a entrar");
    expect(tab.element("sesion-cuenta").textContent).toBe("");

    // Horas después sigue igual, sin haber hablado nunca con el servidor.
    tab.advance(3 * 60 * MINUTE);
    expect(tab.text).toContain("Tu sesión ha terminado");
    expect(tab.requests).toEqual([]);
  });

  test("si el servidor ya no reconoce la sesión, lo dice en vez de ocultar el aviso", async () => {
    // 0 es una redirección no seguida: la que lleva a la entrada.
    for (const status of [0, 303, 401, 403]) {
      const tab = open();
      tab.advance(IDLE - MINUTE);
      press(tab);
      await tab.requests[0]?.respond(status);
      expect(tab.text, String(status)).toContain("Tu sesión ha terminado");
      expect(tab.focused, String(status)).toBe("a:Volver a entrar");
      expect(tab.published(), String(status)).toEqual({ ended: true });
      // Ya no ofrece ampliar ni vuelve a intentarlo.
      tab.advance(5 * MINUTE);
      expect(tab.requests, String(status)).toHaveLength(1);
    }
  });

  test("un error interno del servidor no da la sesión por terminada: se anuncia y se puede reintentar", async () => {
    const tab = open();
    tab.advance(IDLE - MINUTE);
    press(tab);
    await tab.requests[0]?.respond(500);
    expect(tab.text).toContain("a punto de caducar");
    expect(tab.live).toBe(
      "No se ha podido ampliar la sesión. Comprueba la conexión y vuelve a intentarlo.",
    );
    // Las demás pestañas no reciben ningún final de sesión.
    expect(tab.published()).toEqual({ idleAt: CLIENT_NOW + IDLE });
    press(tab);
    await tab.requests[1]?.respond(204);
    expect(tab.box.hidden).toBe(true);
  });

  test("si falla la red, lo anuncia y deja volver a intentarlo", async () => {
    const tab = open();
    tab.advance(IDLE - MINUTE);
    press(tab);
    await tab.requests[0]?.fail();
    expect(tab.live).toBe(
      "No se ha podido ampliar la sesión. Comprueba la conexión y vuelve a intentarlo.",
    );
    expect(tab.box.hidden).toBe(false);
    expect(tab.button.disabled).toBe(false);
    press(tab);
    await tab.requests[1]?.respond(204);
    expect(tab.box.hidden).toBe(true);
  });

  test("con un periodo de inactividad corto avisa a la mitad", () => {
    const tab = open(
      session({ idleMs: MINUTE, idleExpiresAt: SERVER_NOW + MINUTE }),
    );
    tab.advance(29_000);
    expect(tab.box.hidden).toBe(true);
    tab.advance(1000);
    expect(tab.box.hidden).toBe(false);
    expect(tab.text).toContain("caducará dentro de 30 segundos");
  });

  test("sin sesión no hay aviso ni temporizador", () => {
    const tab = open(null);
    expect(tab.window.document.getElementById("sesion-aviso")).toBeNull();
    tab.advance(2 * IDLE);
    expect(tab.requests).toEqual([]);
    expect(tab.published()).toBeNull();
  });
});

describe("varias pestañas", () => {
  test("la actividad o la ampliación en otra pestaña retrasa el aviso en esta, sin pasar por el servidor", () => {
    const tab = open();
    expect(tab.published()).toEqual({ idleAt: CLIENT_NOW + IDLE });
    tab.advance(IDLE - MINUTE);
    expect(tab.box.hidden).toBe(false);

    // Otra pestaña acaba de cargar una página o de ampliar.
    tab.fromOtherTab({ idleAt: CLIENT_NOW + IDLE - MINUTE + IDLE });
    expect(tab.box.hidden).toBe(true);
    tab.advance(IDLE - 2 * MINUTE - 1000);
    expect(tab.box.hidden).toBe(true);
    tab.advance(1000);
    expect(tab.box.hidden).toBe(false);
    expect(tab.requests).toEqual([]);
  });

  test("ampliar en esta pestaña lo comunica a las demás", async () => {
    const tab = open();
    tab.advance(IDLE - MINUTE);
    press(tab);
    await tab.requests[0]?.respond(204);
    expect(tab.published()).toEqual({
      idleAt: CLIENT_NOW + IDLE - MINUTE + IDLE,
    });
  });

  test("un plazo anterior, ilegible o exagerado de otra pestaña no adelanta ni alarga nada", () => {
    const tab = open();
    tab.fromOtherTab({ idleAt: CLIENT_NOW + MINUTE });
    tab.fromOtherTab("no es un plazo");
    tab.window.dispatchEvent(
      new tab.window.StorageEvent("storage", { key: KEY, newValue: "{" }),
    );
    tab.window.dispatchEvent(
      new tab.window.StorageEvent("storage", {
        key: "otra-clave",
        newValue: JSON.stringify({ ended: true }),
      }),
    );
    tab.advance(IDLE - 2 * MINUTE - 1000);
    expect(tab.box.hidden).toBe(true);

    // Ninguna pestaña puede prometer más que un periodo completo desde ahora.
    tab.fromOtherTab({ idleAt: CLIENT_NOW + 100 * IDLE });
    tab.advance(IDLE - 2 * MINUTE);
    expect(tab.box.hidden).toBe(false);
  });

  test("salir en otra pestaña termina la sesión en esta, y ya nada la reabre", () => {
    const tab = open();
    tab.element("texto").focus();
    tab.fromOtherTab({ ended: true });
    expect(tab.text).toContain("Tu sesión ha terminado");
    expect(tab.focused).toBe("a:Volver a entrar");

    // Una entrada posterior en la otra pestaña no revive esta página, cuyo
    // testigo ya no sirve.
    tab.fromOtherTab({ idleAt: CLIENT_NOW + 2 * IDLE });
    expect(tab.text).toContain("Tu sesión ha terminado");
    expect(tab.element("sesion-ampliar").hidden).toBe(true);
  });

  test("salir en esta pestaña lo comunica a las demás antes de enviar el formulario", () => {
    const tab = open();
    const form = tab.window.document.querySelector(
      'form[action="/api/session/sign-out"]',
    );
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
    });
    form?.querySelector("button")?.click();
    expect(tab.published()).toEqual({ ended: true });
  });
});

describe("duración máxima de la sesión", () => {
  test("cuando vence antes que la inactividad, el aviso dice que no se puede ampliar y no ofrece continuar", () => {
    const tab = open(
      session({
        idleExpiresAt: SERVER_NOW + IDLE,
        expiresAt: SERVER_NOW + 10 * MINUTE,
      }),
    );
    tab.element("texto").focus();
    tab.advance(8 * MINUTE);
    expect(tab.box.hidden).toBe(false);
    expect(tab.text).toBe(
      "Tu sesión está a punto de terminar | Tu sesión termina dentro de 2 minutos porque ha alcanzado su duración máxima, y no se puede ampliar. Envía ahora lo que tengas pendiente o cópialo: después tendrás que volver a entrar.",
    );
    expect(tab.element("sesion-ampliar").hidden).toBe(true);
    expect(tab.focused).toBe("section#sesion-aviso");

    tab.advance(2 * MINUTE);
    expect(tab.text).toContain("Tu sesión ha terminado");
    expect(tab.requests).toEqual([]);
  });

  test("una ampliación aceptada no la retrasa: el siguiente aviso es el de la duración máxima", async () => {
    const tab = open(session({ expiresAt: SERVER_NOW + 40 * MINUTE }));
    tab.advance(IDLE - MINUTE);
    expect(tab.text).toContain("a punto de caducar");
    press(tab);
    await tab.requests[0]?.respond(204);
    expect(tab.box.hidden).toBe(true);

    tab.advance(9 * MINUTE);
    expect(tab.text).toContain("ha alcanzado su duración máxima");
    expect(tab.element("sesion-ampliar").hidden).toBe(true);
    tab.advance(2 * MINUTE);
    expect(tab.text).toContain("Tu sesión ha terminado");
    expect(tab.requests).toHaveLength(1);
  });
});
