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
import type { Html, SessionContext } from "@/platform/web";

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
    readonly method?: string;
    readonly credentials: string;
    readonly redirect: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
  };
  // Con un cuerpo: texto, o un objeto que se entrega como JSON.
  respond(status: number, body?: string | object): Promise<void>;
  fail(): Promise<void>;
}

// Un envío de formulario que llegó a salir de la página.
type Submission = Record<string, string>;

interface Tab {
  readonly window: Window & typeof globalThis;
  readonly requests: Request[];
  advance(ms: number): void;
  element(id: string): HTMLElement;
  readonly box: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly password: HTMLInputElement;
  readonly renewButton: HTMLButtonElement;
  readonly submissions: Submission[];
  // Valor del testigo en cada formulario de la página.
  tokens(): string[];
  storage(): Record<string, string>;
  // Otra pestaña acaba de renovar la sesión.
  renewedElsewhere(): void;
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

const WORK = html`<h1>Prueba</h1>
  <form method="post" action="/api/topics/edit">
    <input type="hidden" name="csrf" value="${TOKEN}" />
    <label for="texto">Texto</label>
    <textarea id="texto" name="text"></textarea>
    <button type="submit">Guardar</button>
  </form>`;

// Documento que devuelve el servidor, con su hora anotada en el marcado.
function pageOf(context: SessionContext | null, content: Html = WORK): string {
  const realNow = Date.now;
  Date.now = () => SERVER_NOW;
  try {
    return layout({ title: "Prueba", session: context, content }).text;
  } finally {
    Date.now = realNow;
  }
}

function open(
  context: SessionContext | null = session(),
  options: { readonly content?: Html } = {},
): Tab {
  const page = pageOf(context, options.content);
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
        respond: async (status, body = "") => {
          resolve({
            status,
            text: () =>
              Promise.resolve(
                typeof body === "string" ? body : JSON.stringify(body),
              ),
            json: () =>
              typeof body === "string"
                ? Promise.reject(new SyntaxError("no es JSON"))
                : Promise.resolve(body),
          });
          await settle();
        },
        fail: async () => {
          reject(new Error("sin red"));
          await settle();
        },
      });
    })) as unknown as typeof window.fetch;
  window.eval(script);
  // Lo que el script deja salir de la página, tal como se enviaría.
  const submissions: Submission[] = [];
  window.addEventListener("submit", (event) => {
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const sent: Submission = { action: form.getAttribute("action") ?? "" };
    new window.FormData(form).forEach((value, name) => {
      sent[name] = typeof value === "string" ? value : "";
    });
    const { submitter } = event;
    if (
      submitter instanceof window.HTMLButtonElement &&
      submitter.name !== ""
    ) {
      sent[submitter.name] = submitter.value;
    }
    submissions.push(sent);
  });
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
    get password() {
      return element("sesion-contrasena") as HTMLInputElement;
    },
    get renewButton() {
      const found = element("sesion-renovar").querySelector("button");
      if (found === null) {
        throw new Error("falta el botón de renovar");
      }
      return found;
    },
    submissions,
    tokens() {
      return [
        ...window.document.querySelectorAll<HTMLInputElement>(
          'input[name="csrf"]',
        ),
      ].map((input) => input.value);
    },
    storage() {
      const entries: Record<string, string> = {};
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index) ?? "";
        entries[key] = window.localStorage.getItem(key) ?? "";
      }
      return entries;
    },
    renewedElsewhere() {
      const newValue = String(clock);
      window.localStorage.setItem("aulanorma-renovada", newValue);
      window.dispatchEvent(
        new window.StorageEvent("storage", {
          key: "aulanorma-renovada",
          newValue,
        }),
      );
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

  test("si el servidor rechaza la ampliación, comprueba si la sesión sigue viva y, si no, lo dice en vez de ocultar el aviso", async () => {
    // 0 es una redirección no seguida: la que lleva a la entrada.
    for (const status of [0, 303, 401, 403, 409]) {
      const tab = open();
      tab.advance(IDLE - MINUTE);
      press(tab);
      await tab.requests[0]?.respond(status);
      // Una sola comprobación, a una página propia.
      expect(tab.requests.map((request) => request.url)).toEqual([
        "/api/session/extend",
        "/account/password",
      ]);
      expect(tab.text, String(status)).toContain("a punto de caducar");
      await tab.requests[1]?.respond(0);

      expect(tab.text, String(status)).toContain("Tu sesión ha terminado");
      expect(tab.focused, String(status)).toBe("a:Volver a entrar");
      expect(tab.published(), String(status)).toEqual({ ended: true });
      // Ya no ofrece ampliar ni vuelve a intentarlo.
      tab.advance(5 * MINUTE);
      expect(tab.requests, String(status)).toHaveLength(2);
    }
  });

  test("si la ampliación se rechaza porque otra pestaña renovó la sesión, toma el testigo vigente y sigue", async () => {
    const tab = open();
    tab.advance(IDLE - MINUTE);
    press(tab);
    await tab.requests[0]?.respond(409, "<html></html>");
    await tab.requests[1]?.respond(
      200,
      pageOf(session({ csrfToken: "testigo nuevo" })),
    );
    expect(tab.box.hidden).toBe(true);
    expect(new Set(tab.tokens())).toEqual(new Set(["testigo nuevo"]));
    expect(tab.live).toBe(
      "La sesión ya se había renovado en otra pestaña. Puedes seguir trabajando.",
    );
    expect(tab.published()).toEqual({ idleAt: CLIENT_NOW + IDLE });
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

describe("duración máxima: renovar la autenticación en la propia página", () => {
  const NEAR_MAX = { expiresAt: SERVER_NOW + 10 * MINUTE };
  const RENEWED = {
    csrf: "testigo nuevo",
    now: SERVER_NOW + 6 * MINUTE,
    idleAt: SERVER_NOW + 6 * MINUTE + IDLE,
    idleMs: IDLE,
    maxAt: SERVER_NOW + 6 * MINUTE + MAX,
  };

  // Deja el aviso de fin de sesión a la vista, con trabajo sin enviar.
  function atLimit(): Tab {
    const tab = open(session(NEAR_MAX));
    tab.element("texto").focus();
    (tab.element("texto") as HTMLTextAreaElement).value = "trabajo sin enviar";
    tab.advance(5 * MINUTE);
    return tab;
  }

  function submitRenewal(tab: Tab, password: string): void {
    tab.password.focus();
    tab.password.value = password;
    tab.renewButton.click();
  }

  test("cinco minutos antes, el aviso pide la contraseña para renovar, sin llevar el foco al campo", () => {
    const tab = open(session(NEAR_MAX));
    tab.element("texto").focus();
    tab.advance(5 * MINUTE - 1000);
    expect(tab.box.hidden).toBe(true);

    tab.advance(1000);
    expect(tab.box.hidden).toBe(false);
    expect(tab.text).toBe(
      "Tu sesión está a punto de terminar | Tu sesión termina dentro de 5 minutos porque ha alcanzado su duración máxima. Para seguir trabajando sin perder lo que tienes en esta página, escribe tu contraseña y pulsa «Renovar la sesión».",
    );
    expect(tab.element("sesion-renovar").hidden).toBe(false);
    expect(tab.element("sesion-ampliar").hidden).toBe(true);
    // El foco va al aviso, no al campo: lo que se estuviera tecleando no
    // acaba en la contraseña.
    expect(tab.focused).toBe("section#sesion-aviso");
    expect(tab.password.getAttribute("autocomplete")).toBe("current-password");
    expect(tab.password.type).toBe("password");
    expect(tab.requests).toEqual([]);
  });

  test("el campo admite pegar y rellenarse desde un gestor: ningún manejador lo impide", () => {
    const tab = atLimit();
    const paste = new tab.window.Event("paste", {
      bubbles: true,
      cancelable: true,
    });
    expect(tab.password.dispatchEvent(paste)).toBe(true);
    expect(paste.defaultPrevented).toBe(false);
    // Un gestor escribe el valor sin teclear.
    tab.password.value = "valor puesto por un gestor";
    tab.password.dispatchEvent(
      new tab.window.Event("input", { bubbles: true }),
    );
    expect(tab.password.value).toBe("valor puesto por un gestor");
    expect(tab.password.readOnly).toBe(false);
    expect(tab.password.disabled).toBe(false);
  });

  test("renovar envía la contraseña una vez al servidor y, si la acepta, pone el testigo nuevo en todos los formularios sin recargar ni perder lo escrito", async () => {
    const tab = atLimit();
    const before = tab.tokens();
    expect(new Set(before)).toEqual(new Set([TOKEN]));
    submitRenewal(tab, "la contraseña");

    expect(tab.requests).toHaveLength(1);
    expect(tab.requests[0]?.url).toBe("/api/session/renew");
    expect(tab.requests[0]?.init).toEqual({
      method: "POST",
      credentials: "same-origin",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `csrf=${encodeURIComponent(TOKEN)}&password=${encodeURIComponent("la contraseña")}`,
    });

    await tab.requests[0]?.respond(200, RENEWED);
    expect(tab.box.hidden).toBe(true);
    expect(tab.live).toBe("Sesión renovada. Puedes seguir trabajando.");
    // Todos los formularios de la página, también el del trabajo pendiente.
    expect(tab.tokens()).toHaveLength(before.length);
    expect(new Set(tab.tokens())).toEqual(new Set(["testigo nuevo"]));
    expect((tab.element("texto") as HTMLTextAreaElement).value).toBe(
      "trabajo sin enviar",
    );
    expect(tab.focused).toBe("textarea#texto");
    // La contraseña no se queda en la página.
    expect(tab.password.value).toBe("");
    expect(tab.renewButton.disabled).toBe(false);

    // El trabajo pendiente se envía ya con el testigo nuevo, sin más pasos.
    tab.window.document
      .querySelector<HTMLButtonElement>(
        'form[action="/api/topics/edit"] button',
      )
      ?.click();
    expect(tab.submissions).toEqual([
      {
        action: "/api/topics/edit",
        csrf: "testigo nuevo",
        text: "trabajo sin enviar",
      },
    ]);
    expect(tab.requests).toHaveLength(1);
  });

  test("tras renovar, los plazos son los de la sesión nueva: doce horas más y la inactividad entera", async () => {
    const tab = atLimit();
    submitRenewal(tab, "la contraseña");
    tab.advance(MINUTE);
    await tab.requests[0]?.respond(200, RENEWED);

    // Pasado el final de la sesión anterior, sigue viva y sin avisos.
    tab.advance(10 * MINUTE);
    expect(tab.box.hidden).toBe(true);
    // El siguiente aviso es el de inactividad de la sesión nueva.
    tab.advance(IDLE - 12 * MINUTE - 1000);
    expect(tab.box.hidden).toBe(true);
    tab.advance(1000);
    expect(tab.text).toContain("a punto de caducar");
  });

  test("en el almacenamiento local solo queda el instante de la renovación: ni contraseña, ni testigo, ni cookie", async () => {
    const tab = atLimit();
    submitRenewal(tab, "la contraseña");
    await tab.requests[0]?.respond(200, RENEWED);

    const stored = tab.storage();
    expect(Object.keys(stored).sort()).toEqual([
      "aulanorma-renovada",
      "aulanorma-sesion",
    ]);
    expect(stored["aulanorma-renovada"]).toBe(String(CLIENT_NOW + 5 * MINUTE));
    expect(JSON.parse(stored["aulanorma-sesion"] ?? "")).toEqual({
      idleAt: CLIENT_NOW + 5 * MINUTE + IDLE,
    });
    const everything = JSON.stringify(stored);
    for (const secret of ["la contraseña", TOKEN, "testigo nuevo"]) {
      expect(everything).not.toContain(secret);
      expect(everything).not.toContain(encodeURIComponent(secret));
    }
    expect(tab.window.sessionStorage.length).toBe(0);
    expect(tab.window.document.cookie).toBe("");
  });

  test.each([
    {
      status: 422,
      message: "La contraseña no es correcta. Vuelve a escribirla.",
    },
    {
      status: 429,
      message:
        "Demasiados intentos seguidos. Espera unos minutos antes de volver a intentarlo.",
    },
    {
      status: 500,
      message:
        "No se ha podido renovar la sesión por un error interno. No se ha perdido nada: vuelve a intentarlo.",
    },
  ])(
    "un rechazo $status se dice en una alerta, deja el foco en el campo vacío y no toca nada más",
    async ({ status, message }) => {
      const tab = atLimit();
      submitRenewal(tab, "equivocada");
      await tab.requests[0]?.respond(status, { reason: "x" });

      expect(tab.element("sesion-error").textContent).toBe(message);
      expect(tab.element("sesion-error").getAttribute("role")).toBe("alert");
      expect(tab.password.getAttribute("aria-describedby")).toBe(
        "sesion-error",
      );
      expect(tab.focused).toBe("input#sesion-contrasena");
      expect(tab.password.value).toBe("");
      expect(tab.box.hidden).toBe(false);
      expect(tab.renewButton.disabled).toBe(false);
      // Ni testigos nuevos, ni aviso a otras pestañas, ni trabajo perdido.
      expect(new Set(tab.tokens())).toEqual(new Set([TOKEN]));
      expect(tab.storage()["aulanorma-renovada"]).toBeUndefined();
      expect(tab.published()).toEqual({ idleAt: CLIENT_NOW + IDLE });
      expect((tab.element("texto") as HTMLTextAreaElement).value).toBe(
        "trabajo sin enviar",
      );

      // Se puede volver a intentar, y al conseguirlo el error desaparece.
      submitRenewal(tab, "la contraseña");
      expect(tab.element("sesion-error").textContent).toBe("");
      await tab.requests[1]?.respond(200, RENEWED);
      expect(tab.box.hidden).toBe(true);
    },
  );

  test("si falla la red o la respuesta no se entiende, lo dice y deja reintentar", async () => {
    const tab = atLimit();
    submitRenewal(tab, "la contraseña");
    await tab.requests[0]?.fail();
    expect(tab.element("sesion-error").textContent).toBe(
      "No se ha podido renovar la sesión. Comprueba la conexión y vuelve a intentarlo.",
    );
    expect(tab.focused).toBe("input#sesion-contrasena");

    submitRenewal(tab, "la contraseña");
    await tab.requests[1]?.respond(200, "esto no es JSON");
    expect(tab.element("sesion-error").textContent).toContain(
      "No se ha podido renovar la sesión.",
    );
    expect(new Set(tab.tokens())).toEqual(new Set([TOKEN]));
    expect(tab.renewButton.disabled).toBe(false);
  });

  test("si el servidor rechaza la renovación, comprueba si la sesión sigue viva y, si no, la da por terminada en todas las pestañas", async () => {
    for (const status of [0, 303, 401, 403, 409]) {
      const tab = atLimit();
      submitRenewal(tab, "la contraseña");
      await tab.requests[0]?.respond(status);
      expect(tab.requests[1]?.url, String(status)).toBe("/account/password");
      await tab.requests[1]?.respond(0);
      expect(tab.text, String(status)).toContain("Tu sesión ha terminado");
      expect(tab.element("sesion-renovar").hidden, String(status)).toBe(true);
      expect(tab.password.value, String(status)).toBe("");
      expect(tab.focused, String(status)).toBe("a:Volver a entrar");
      expect(tab.published(), String(status)).toEqual({ ended: true });
    }
  });

  test("si la sesión sigue viva pero no se renovó, el aviso continúa y se puede volver a intentar", async () => {
    const tab = atLimit();
    submitRenewal(tab, "la contraseña");
    await tab.requests[0]?.respond(403);
    // La misma sesión: a la hora de esta respuesta le quedan cuatro minutos.
    await tab.requests[1]?.respond(
      200,
      pageOf(session({ expiresAt: SERVER_NOW + 4 * MINUTE })),
    );
    expect(tab.text).toContain("ha alcanzado su duración máxima");
    expect(tab.element("sesion-renovar").hidden).toBe(false);
    expect(tab.live).not.toContain("renovado");
    expect(tab.published()).toEqual({ idleAt: CLIENT_NOW + IDLE });
  });

  test("si nadie renueva, termina a su hora, aunque se haya ampliado la inactividad", async () => {
    const tab = open(session({ expiresAt: SERVER_NOW + 40 * MINUTE }));
    tab.advance(IDLE - MINUTE);
    expect(tab.text).toContain("a punto de caducar");
    press(tab);
    await tab.requests[0]?.respond(204);
    expect(tab.box.hidden).toBe(true);

    tab.advance(6 * MINUTE);
    expect(tab.text).toContain("ha alcanzado su duración máxima");
    tab.advance(5 * MINUTE);
    expect(tab.text).toContain("Tu sesión ha terminado");
    expect(tab.requests).toHaveLength(1);
  });

  test("si la inactividad vence antes que el final, el aviso de renovación cuenta hasta lo que vence primero", () => {
    const tab = open(
      session({
        idleExpiresAt: SERVER_NOW + 3 * MINUTE,
        expiresAt: SERVER_NOW + 4 * MINUTE,
      }),
    );
    tab.advance(1000);
    expect(tab.text).toContain("termina dentro de 3 minutos");
    expect(tab.element("sesion-renovar").hidden).toBe(false);
    tab.advance(3 * MINUTE);
    expect(tab.text).toContain("Tu sesión ha terminado");
  });
});

describe("renovación con varias pestañas", () => {
  const NEW_PAGE = { csrfToken: "testigo nuevo" };

  // Página propia que devolvería el servidor con la sesión nueva.
  function freshPage(): string {
    return pageOf(
      session({
        ...NEW_PAGE,
        idleExpiresAt: SERVER_NOW + IDLE,
        expiresAt: SERVER_NOW + MAX,
      }),
    );
  }

  test("al renovar otra pestaña, esta pide una página propia y toma de ella su testigo, sin contraseña y sin perder lo escrito", async () => {
    const tab = open(session({ expiresAt: SERVER_NOW + 10 * MINUTE }));
    tab.element("texto").focus();
    (tab.element("texto") as HTMLTextAreaElement).value = "otra pestaña";
    tab.advance(6 * MINUTE);
    expect(tab.text).toContain("ha alcanzado su duración máxima");

    tab.renewedElsewhere();
    expect(tab.requests).toHaveLength(1);
    expect(tab.requests[0]?.url).toBe("/account/password");
    expect(tab.requests[0]?.init).toEqual({
      credentials: "same-origin",
      redirect: "manual",
    });
    await tab.requests[0]?.respond(200, freshPage());

    expect(new Set(tab.tokens())).toEqual(new Set(["testigo nuevo"]));
    expect(tab.box.hidden).toBe(true);
    expect(tab.live).toBe(
      "La sesión se ha renovado en otra pestaña. Puedes seguir trabajando.",
    );
    expect(tab.focused).toBe("textarea#texto");
    expect((tab.element("texto") as HTMLTextAreaElement).value).toBe(
      "otra pestaña",
    );
    // Sigue viva pasado el final de la sesión anterior.
    tab.advance(10 * MINUTE);
    expect(tab.box.hidden).toBe(true);
  });

  test("un formulario enviado antes de tener el testigo nuevo espera, lo pide y se envía con él y con su mismo botón", async () => {
    const tab = open(session(), {
      content: html`<h1>Índice</h1>
        <form method="post" action="/api/outlines/edit">
          <input type="hidden" name="csrf" value="${TOKEN}" />
          <input type="hidden" name="entry" value="e1" />
          <button type="submit" name="direction" value="up">Subir</button>
          <button type="submit" name="direction" value="down">Bajar</button>
        </form>`,
    });
    // La otra pestaña renovó, pero esta todavía no se ha enterado: solo está
    // el instante en el almacenamiento local.
    tab.window.localStorage.setItem(
      "aulanorma-renovada",
      String(CLIENT_NOW + 1000),
    );
    tab.advance(2000);

    tab.window.document
      .querySelector<HTMLButtonElement>('button[value="down"]')
      ?.click();
    // No ha salido con el testigo antiguo.
    expect(tab.submissions).toEqual([]);
    expect(tab.requests.map((request) => request.url)).toEqual([
      "/account/password",
    ]);
    await tab.requests[0]?.respond(200, freshPage());

    expect(tab.submissions).toEqual([
      {
        action: "/api/outlines/edit",
        csrf: "testigo nuevo",
        entry: "e1",
        direction: "down",
      },
    ]);
    // El siguiente envío ya no pide nada. (El primer botón quedó en estado
    // de carga, como en una página que está a punto de cambiar.)
    tab.window.document
      .querySelector<HTMLButtonElement>('button[value="down"]')
      ?.click();
    expect(tab.requests).toHaveLength(1);
    expect(tab.submissions).toHaveLength(2);
  });

  test("si al pedir el testigo la sesión ya no existe, no se envía nada y se dice que ha terminado", async () => {
    const tab = open();
    (tab.element("texto") as HTMLTextAreaElement).value = "pendiente";
    tab.window.localStorage.setItem(
      "aulanorma-renovada",
      String(CLIENT_NOW + 1000),
    );
    tab.advance(2000);
    tab.window.document
      .querySelector<HTMLButtonElement>(
        'form[action="/api/topics/edit"] button',
      )
      ?.click();
    await tab.requests[0]?.respond(0);

    expect(tab.submissions).toEqual([]);
    expect(tab.text).toContain("Tu sesión ha terminado");
    expect((tab.element("texto") as HTMLTextAreaElement).value).toBe(
      "pendiente",
    );
  });

  // La que llega después de sustituirse la sesión recibe un 409 de la
  // guarda; la que estaba comprobando su contraseña en ese momento, un 401.
  test.each([409, 401])(
    "dos pestañas renuevan a la vez: la que pierde recibe un %i, toma el testigo vigente y sigue, sin dar nada por terminado",
    async (status) => {
      const tab = open(session({ expiresAt: SERVER_NOW + 10 * MINUTE }));
      (tab.element("texto") as HTMLTextAreaElement).value = "pendiente";
      tab.advance(6 * MINUTE);
      tab.password.value = "la contraseña";
      tab.renewButton.click();
      await tab.requests[0]?.respond(status, "<html></html>");

      expect(tab.requests.map((request) => request.url)).toEqual([
        "/api/session/renew",
        "/account/password",
      ]);
      await tab.requests[1]?.respond(200, freshPage());
      expect(new Set(tab.tokens())).toEqual(new Set(["testigo nuevo"]));
      expect(tab.box.hidden).toBe(true);
      expect(tab.live).toBe(
        "La sesión ya se había renovado en otra pestaña. Puedes seguir trabajando.",
      );
      expect(tab.password.value).toBe("");
      expect((tab.element("texto") as HTMLTextAreaElement).value).toBe(
        "pendiente",
      );
      // No anuncia una renovación propia ni un final de sesión a las demás.
      expect(tab.storage()["aulanorma-renovada"]).toBeUndefined();
      expect(tab.published()).toEqual({ idleAt: CLIENT_NOW + IDLE });
    },
  );

  test("una renovación en otra pestaña no reabre una sesión que aquí ya terminó", async () => {
    const tab = open();
    tab.fromOtherTab({ ended: true });
    tab.renewedElsewhere();
    expect(tab.requests).toEqual([]);
    expect(tab.text).toContain("Tu sesión ha terminado");
    await Promise.resolve();
    expect(new Set(tab.tokens())).toEqual(new Set([TOKEN]));
  });
});

describe("envío devuelto tras una renovación", () => {
  // La página que devuelve el servidor cuando un formulario llegó con la
  // sesión o el testigo anteriores: sin sesión en su cabecera y sin testigo.
  const replay = (): Tab =>
    open(null, {
      content: html`<h1>Tu envío no se ha guardado todavía</h1>
        <form method="post" action="/api/topics/edit" data-replay>
          <input type="hidden" name="csrf" value="" />
          <input type="hidden" name="text" value="texto que se envió" />
          <button type="submit" data-busy="Enviando…">Enviar de nuevo</button>
          <p class="hint" role="status" data-replay-status></p>
        </form>`,
    });

  test("«Enviar de nuevo» pide el testigo de la sesión vigente y envía lo mismo con él", async () => {
    const tab = replay();
    tab.window.document
      .querySelector<HTMLButtonElement>("form button")
      ?.click();
    expect(tab.submissions).toEqual([]);
    expect(tab.requests.map((request) => request.url)).toEqual([
      "/account/password",
    ]);
    await tab.requests[0]?.respond(
      200,
      pageOf(session({ csrfToken: "testigo nuevo" })),
    );
    expect(tab.submissions).toEqual([
      {
        action: "/api/topics/edit",
        csrf: "testigo nuevo",
        text: "texto que se envió",
      },
    ]);
  });

  test("no se envía por sí sola: ni al cargar, ni con el tiempo, ni al renovarse la sesión en otra pestaña", async () => {
    const tab = replay();
    tab.advance(10 * MINUTE);
    expect(tab.requests).toEqual([]);
    tab.renewedElsewhere();
    for (const request of tab.requests) {
      await request.respond(
        200,
        pageOf(session({ csrfToken: "testigo nuevo" })),
      );
    }
    tab.advance(10 * MINUTE);
    expect(tab.submissions).toEqual([]);
  });

  test("sin sesión vigente no envía nada y lo explica", async () => {
    const tab = replay();
    tab.window.document
      .querySelector<HTMLButtonElement>("form button")
      ?.click();
    await tab.requests[0]?.respond(0);
    expect(tab.submissions).toEqual([]);
    expect(
      tab.window.document.querySelector("[data-replay-status]")?.textContent,
    ).toBe(
      "No se ha podido continuar con la sesión nueva. Vuelve a entrar y repite el envío.",
    );
  });
});

describe("formulario de entrada", () => {
  const login = (): Tab =>
    open(null, {
      content: html`<h1>Entrar</h1>
        <form method="post" action="/api/session/sign-in">
          <input type="hidden" name="csrf" value="testigo de entrada" />
          <input id="username" name="username" value="docente1" />
          <input id="password" name="password" type="password" value="clave" />
          <button type="submit">Entrar</button>
        </form>`,
    });
  const press = (tab: Tab): void => {
    tab.window.document
      .querySelector<HTMLButtonElement>("form button")
      ?.click();
  };

  test("enviado en menos de cinco minutos, sale tal cual y sin ninguna petición previa", () => {
    const tab = login();
    tab.advance(4 * MINUTE);
    press(tab);
    expect(tab.requests).toEqual([]);
    expect(tab.submissions).toEqual([
      {
        action: "/api/session/sign-in",
        csrf: "testigo de entrada",
        username: "docente1",
        password: "clave",
      },
    ]);
  });

  test("si lleva más tiempo abierto, antes de enviarse pide un testigo vigente y conserva lo escrito: su caducidad no obliga a repetir nada", async () => {
    const tab = login();
    tab.advance(40 * MINUTE);
    // Abierto y sin tocar, no ha pedido nada.
    expect(tab.requests).toEqual([]);
    press(tab);
    expect(tab.submissions).toEqual([]);
    expect(tab.requests.map((request) => request.url)).toEqual(["/login"]);
    await tab.requests[0]?.respond(
      200,
      '<html><body><form><input type="hidden" name="csrf" value="entrada nueva"></form></body></html>',
    );
    expect(tab.submissions).toEqual([
      {
        action: "/api/session/sign-in",
        csrf: "entrada nueva",
        username: "docente1",
        password: "clave",
      },
    ]);
  });

  test("si no consigue el testigo, se envía igualmente y decide el servidor", async () => {
    const tab = login();
    tab.advance(40 * MINUTE);
    press(tab);
    await tab.requests[0]?.fail();
    expect(tab.submissions).toHaveLength(1);
    expect(tab.submissions[0]?.csrf).toBe("testigo de entrada");
    expect(tab.requests).toHaveLength(1);
  });
});
