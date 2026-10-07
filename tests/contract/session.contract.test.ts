// Contrato de entrada, sesión y permisos de las rutas de producto
// (specs/002-boe-scorm-export: T029; contracts/http-surface.md; FR-026,
// FR-027 y FR-068; SC-007 y SC-039, en lo que cubre una prueba sin red).
//
// Ejercita las rutas reales (`getServerSideProps` y los manejadores de las
// acciones) con el coste real de las contraseñas. Las contraseñas son
// sintéticas y únicas en cada ejecución.
import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as passwordPage from "@/pages/account/password";
import * as passwordAction from "@/pages/api/account/password";
import * as signInAction from "@/pages/api/session/sign-in";
import * as signOutAction from "@/pages/api/session/sign-out";
import * as homePage from "@/pages/index";
import * as loginPage from "@/pages/login";
import { html, layout, protectedAction, protectedPage } from "@/platform/web";
import { createWebClient, ORIGIN } from "../support/web-client.ts";
import type { Reply, WebClient } from "../support/web-client.ts";

const RUN = randomUUID();
const PASSWORD = `inicial-${RUN}`;
const NEW_PASSWORD = `nueva-${RUN}`;
const WRONG = `incorrecta-${RUN}`;

const SESSION = "__Host-aulanorma-session";
const ENTRY = "__Host-aulanorma-entry";
const NOTICE = "__Host-aulanorma-notice";

// Estas pruebas usan el coste real de derivación de contraseñas, que es lento a
// propósito: cada entrada o cambio de contraseña tarda décimas de segundo.
vi.setConfig({ testTimeout: 120_000 });

let client: WebClient;

beforeEach(() => {
  client = createWebClient();
});

afterEach(() => {
  vi.useRealTimers();
  client.dispose();
});

async function createUser(
  username: string,
  roles: readonly string[],
): Promise<void> {
  expect(
    await client.runtime.identity.createUser({
      username,
      password: PASSWORD,
      roles,
      correlationId: "alta",
    }),
  ).toEqual({ ok: true });
}

async function signIn(username: string, password = PASSWORD): Promise<Reply> {
  const form = await client.get(loginPage);
  return client.post(signInAction, {
    csrf: client.csrfOf(form),
    username,
    password,
  });
}

// Entra y cambia la contraseña inicial: la cuenta queda lista para usarse.
async function enter(
  username: string,
  roles: readonly string[],
): Promise<void> {
  await createUser(username, roles);
  expect((await signIn(username)).location).toBe("/account/password");
  const form = await client.get(passwordPage);
  const changed = await client.post(passwordAction, {
    csrf: client.csrfOf(form),
    current: PASSWORD,
    next: NEW_PASSWORD,
  });
  expect(changed.location).toBe("/account/password");
  await client.get(passwordPage);
}

function auditActions(): string[] {
  return client.runtime.audit.list().map(({ action, result, details }) => {
    const reason =
      typeof details.reason === "string" ? `:${details.reason}` : "";
    return `${action}:${result}${reason}`;
  });
}

function expectClosed(reply: Reply, status: number): void {
  expect(reply.status).toBe(status);
  expect(reply.body).toBe("");
  expect(reply.headers["cache-control"]).toBe("no-store");
  expect(reply.headers["content-length"]).toBe("0");
}

describe("sin sesión", () => {
  test.each([
    ["/", homePage],
    ["/account/password", passwordPage],
  ] as const)(
    "%s lleva a la entrada sin devolver ningún dato",
    async (_name, page) => {
      const reply = await client.get(page);
      expect(reply.status).toBe(303);
      expect(reply.location).toBe("/login");
      expect(reply.body).toBe("");
      expect(reply.headers["cache-control"]).toBe("no-store");
    },
  );

  test.each([
    ["salir", signOutAction],
    ["cambiar la contraseña", passwordAction],
  ] as const)("%s lleva a la entrada sin hacer nada", async (_name, action) => {
    const reply = await client.post(action, {
      csrf: "x",
      current: "x",
      next: "x",
    });
    expect(reply.status).toBe(303);
    expect(reply.location).toBe("/login");
    expect(reply.body).toBe("");
    expect(client.runtime.audit.list()).toEqual([]);
  });

  test("una cookie de sesión inventada no sirve", async () => {
    const reply = await client.post(
      signOutAction,
      { csrf: "x" },
      { cookies: { [SESSION]: "inventada" } },
    );
    expect(reply.location).toBe("/login");
    client.cookies.set(SESSION, "inventada");
    expect((await client.get(homePage)).location).toBe("/login");
  });
});

describe("página de entrada", () => {
  test("es HTML completo, sin recursos externos, con su política de contenido y sin caché", async () => {
    const reply = await client.get(loginPage);
    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(reply.headers["cache-control"]).toBe("no-store");
    expect(reply.headers["x-content-type-options"]).toBe("nosniff");
    expect(reply.headers["x-frame-options"]).toBe("DENY");
    // Con `no-referrer`, el navegador enviaría `Origin: null` en los
    // formularios y la comprobación de origen rechazaría los envíos legítimos.
    expect(reply.headers["referrer-policy"]).toBe("same-origin");
    expect(reply.headers["content-length"]).toBe(
      String(Buffer.byteLength(reply.body)),
    );
    const policy = String(reply.headers["content-security-policy"]);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("unsafe");
    expect(reply.body.startsWith("<!doctype html>")).toBe(true);
    expect(reply.body).toContain('<html lang="es">');
    expect(reply.body).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
    expect(reply.body).not.toContain("_next");
    expect(reply.body).not.toContain("__NEXT_DATA__");
  });

  test.each([
    ["style", "style-src"],
    ["script", "script-src"],
  ])(
    "la política de contenido lleva la huella exacta del único <%s> del documento",
    async (tag, directive) => {
      const reply = await client.get(loginPage);
      const elements = [
        ...reply.body.matchAll(
          new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"),
        ),
      ];
      expect(elements).toHaveLength(1);
      const digest = createHash("sha256")
        .update(elements[0]?.[1] ?? "")
        .digest("base64");
      expect(String(reply.headers["content-security-policy"])).toContain(
        `${directive} 'sha256-${digest}'`,
      );
      expect(reply.body).not.toMatch(new RegExp(`<${tag}[^>]`));
    },
  );

  test("ningún elemento lleva estilos ni manejadores en línea, que la política bloquearía", async () => {
    const { body } = await client.get(loginPage);
    expect(body).not.toMatch(/\sstyle="/);
    expect(body).not.toMatch(/\son[a-z]+="/);
  });

  test("tiene un formulario accesible: etiquetas, un h1, enlace para saltar y el testigo", async () => {
    const { body } = await client.get(loginPage);
    expect(body.match(/<h1>/g)).toHaveLength(1);
    expect(body).toContain('<main id="contenido">');
    expect(body).toContain('href="#contenido"');
    expect(body).toMatch(/<label for="username">/);
    expect(body).toMatch(/<label for="password">/);
    expect(body).toMatch(/id="username"[^>]*autocomplete="username"/s);
    expect(body).toMatch(/id="password"[^>]*type="password"/s);
    expect(body).toMatch(
      /<form method="post" action="\/api\/session\/sign-in">/,
    );
    expect(client.csrfOf({ body } as Reply)).toMatch(/^[\w-]{43}$/);
  });

  test("emite la sesión previa con una cookie __Host-, Secure, HttpOnly y SameSite=Strict, y la reutiliza", async () => {
    const first = await client.get(loginPage);
    expect(first.setCookies).toHaveLength(1);
    expect(first.setCookies[0]).toMatch(
      new RegExp(
        `^${ENTRY}=[\\w-]{43}; Path=/; HttpOnly; SameSite=Strict; Secure$`,
      ),
    );
    const second = await client.get(loginPage);
    expect(second.setCookies).toEqual([]);
    expect(client.csrfOf(second)).toBe(client.csrfOf(first));
  });

  test("no concede acceso a nada: con la sesión previa, las rutas de producto siguen cerradas", async () => {
    await client.get(loginPage);
    const entry = client.cookies.get(ENTRY) ?? "";
    expect((await client.get(homePage)).location).toBe("/login");
    client.cookies.set(SESSION, entry);
    expect((await client.get(homePage)).location).toBe("/login");
    expect((await client.get(passwordPage)).location).toBe("/login");
  });

  test("con una sesión viva lleva al inicio", async () => {
    await enter("docente1", ["teacher"]);
    const reply = await client.get(loginPage);
    expect(reply.status).toBe(303);
    expect(reply.location).toBe("/");
  });
});

describe("envío de la entrada", () => {
  test("con credenciales correctas emite una sesión nueva, borra la sesión previa y lleva al cambio de la contraseña inicial", async () => {
    await createUser("docente1", ["teacher"]);
    await client.get(loginPage);
    const entry = client.cookies.get(ENTRY);
    const reply = await signIn("docente1");
    expect(reply.status).toBe(303);
    expect(reply.location).toBe("/account/password");
    expect(reply.body).toBe("");
    const session = client.cookies.get(SESSION);
    expect(session).toMatch(/^[\w-]{43}$/);
    expect(session).not.toBe(entry);
    expect(client.cookies.has(ENTRY)).toBe(false);
    expect(
      reply.setCookies.find((cookie) => cookie.startsWith(SESSION)),
    ).toMatch(/; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
    expect(auditActions()).toEqual(["user.created:ok", "session.sign_in:ok"]);
  });

  test.each([
    { name: "contraseña incorrecta", username: "docente1", password: WRONG },
    { name: "cuenta inexistente", username: "nadie", password: PASSWORD },
  ])(
    "$name: vuelve a la entrada con el mismo aviso, sin sesión",
    async (scenario) => {
      await createUser("docente1", ["teacher"]);
      const reply = await signIn(scenario.username, scenario.password);
      expect(reply.status).toBe(303);
      expect(reply.location).toBe("/login");
      expect(client.cookies.has(SESSION)).toBe(false);
      expect(client.cookies.get(NOTICE)).toBe("signin_refused");
      const page = await client.get(loginPage);
      expect(page.body).toContain('role="alert"');
      expect(page.body).toContain("No hemos podido iniciar la sesión");
      expect(page.body).not.toContain(scenario.username);
      expect(client.cookies.has(NOTICE)).toBe(false);
      expect((await client.get(loginPage)).body).not.toContain('role="alert"');
    },
  );

  test.each([
    { name: "sin Origin", options: { origin: null } },
    {
      name: "con otro Origin",
      options: { origin: "https://atacante.example" },
    },
    {
      name: "con el Origin en HTTP",
      options: { origin: "http://aulanorma.example" },
    },
    {
      name: "con Sec-Fetch-Site cross-site",
      options: { secFetchSite: "cross-site" },
    },
  ])(
    "$name se rechaza con 403, se audita y no crea sesión",
    async ({ options }) => {
      await createUser("docente1", ["teacher"]);
      const form = await client.get(loginPage);
      const reply = await client.post(
        signInAction,
        { csrf: client.csrfOf(form), username: "docente1", password: PASSWORD },
        options,
      );
      expectClosed(reply, 403);
      expect(client.cookies.has(SESSION)).toBe(false);
      expect(auditActions().at(-1)).toBe("request.denied:denied:origin");
    },
  );

  test.each([
    { name: "sin el testigo", fields: {} },
    { name: "con un testigo inventado", fields: { csrf: "inventado" } },
  ])("$name no entra aunque la contraseña sea correcta", async ({ fields }) => {
    await createUser("docente1", ["teacher"]);
    await client.get(loginPage);
    const reply = await client.post(signInAction, {
      ...fields,
      username: "docente1",
      password: PASSWORD,
    });
    expect(reply.location).toBe("/login");
    expect(client.cookies.has(SESSION)).toBe(false);
    expect(client.cookies.get(NOTICE)).toBe("signin_expired");
    expect(auditActions().at(-1)).toBe(
      "session.sign_in:denied:invalid_request",
    );
  });

  test("sin la sesión previa no entra aunque el resto sea correcto", async () => {
    await createUser("docente1", ["teacher"]);
    const form = await client.get(loginPage);
    const reply = await client.post(
      signInAction,
      { csrf: client.csrfOf(form), username: "docente1", password: PASSWORD },
      { cookies: {} },
    );
    expect(reply.location).toBe("/login");
    expect(reply.setCookies.some((cookie) => cookie.startsWith(SESSION))).toBe(
      false,
    );
  });

  test.each([
    { name: "JSON", contentType: "application/json" },
    { name: "multipart", contentType: "multipart/form-data; boundary=x" },
    { name: "texto", contentType: "text/plain" },
  ])("un cuerpo $name se rechaza con 400", async ({ contentType }) => {
    const form = await client.get(loginPage);
    expectClosed(
      await client.post(
        signInAction,
        { csrf: client.csrfOf(form), username: "docente1", password: PASSWORD },
        { contentType },
      ),
      400,
    );
  });

  test.each(["GET", "PUT", "DELETE"])(
    "%s se rechaza con 405 y Allow: POST",
    async (method) => {
      const reply = await client.post(signInAction, {}, { method });
      expect(reply.status).toBe(405);
      expect(reply.headers.allow).toBe("POST");
      expect(reply.body).toBe("");
    },
  );

  test("tras varios fallos, la cuenta queda bloqueada un tiempo y el aviso lo dice", async () => {
    await createUser("docente1", ["teacher"]);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await signIn("docente1", WRONG);
    }
    const reply = await signIn("docente1");
    expect(reply.location).toBe("/login");
    expect(client.cookies.has(SESSION)).toBe(false);
    expect(client.cookies.get(NOTICE)).toBe("signin_throttled");
    expect((await client.get(loginPage)).body).toContain(
      "demasiados intentos fallidos",
    );
  });
});

describe("con sesión", () => {
  test("la contraseña inicial pendiente solo deja llegar al cambio de contraseña", async () => {
    await createUser("docente1", ["teacher"]);
    await signIn("docente1");
    const home = await client.get(homePage);
    expect(home.status).toBe(303);
    expect(home.location).toBe("/account/password");
    const page = await client.get(passwordPage);
    expect(page.status).toBe(200);
    expect(page.body).toContain("Estás usando la contraseña inicial");
  });

  test("el inicio muestra la cuenta y sus perfiles, y no presenta funciones futuras como disponibles", async () => {
    await enter("docente1", ["teacher"]);
    const home = await client.get(homePage);
    expect(home.status).toBe(200);
    expect(home.body).toContain("<dd>docente1</dd>");
    expect(home.body).toContain("Docente autorizado");
    expect(home.body).toContain("Qué no está disponible todavía");
    expect(home.body.match(/<h1>/g)).toHaveLength(1);
    expect(home.body).toContain('<nav aria-label="Principal">');
    expect(home.body).toMatch(/action="\/api\/session\/sign-out"/);
    expect(home.body).not.toMatch(
      /href="\/(?:documents|outline|syllabus|export)/,
    );
  });

  test("una cuenta sin perfiles entra, ve el inicio y se le dice que no puede usar las funciones", async () => {
    await enter("sinperfil", []);
    const home = await client.get(homePage);
    expect(home.status).toBe(200);
    expect(home.body).toContain("Ninguno.");
  });

  test("el nombre de la cuenta se escapa en el HTML", async () => {
    await enter("docente1", ["teacher"]);
    const reply = protectedPage(
      { role: null, operation: "prueba", allowPendingPasswordChange: false },
      ({ session }) => ({
        status: 200,
        page: layout({
          title: "<script>alert(1)</script>",
          session,
          content: html`<p>${'<img src=x onerror="alert(1)">'}</p>`,
        }),
      }),
    );
    const { body } = await client.get({ getServerSideProps: reply });
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).not.toContain("<img src=x");
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  test("cambiar la contraseña la cambia, renueva la sesión y lo confirma", async () => {
    await createUser("docente1", ["teacher"]);
    await signIn("docente1");
    const before = client.cookies.get(SESSION);
    const form = await client.get(passwordPage);
    const reply = await client.post(passwordAction, {
      csrf: client.csrfOf(form),
      current: PASSWORD,
      next: NEW_PASSWORD,
    });
    expect(reply.status).toBe(303);
    expect(reply.location).toBe("/account/password");
    expect(client.cookies.get(SESSION)).not.toBe(before);
    const page = await client.get(passwordPage);
    expect(page.body).toContain("Tu contraseña se ha cambiado");
    expect(page.body).toContain('role="status"');
    expect((await client.get(homePage)).status).toBe(200);
    // La sesión anterior ya no sirve.
    expect(
      (
        await client.post(
          signOutAction,
          { csrf: client.csrfOf(form) },
          { cookies: { [SESSION]: before ?? "" } },
        )
      ).location,
    ).toBe("/login");
  });

  test.each([
    {
      name: "actual incorrecta",
      current: WRONG,
      next: NEW_PASSWORD,
      text: "actual no es correcta",
    },
    {
      name: "nueva demasiado corta",
      current: PASSWORD,
      next: "corta",
      text: "al menos 12 caracteres",
    },
    {
      name: "nueva igual a la actual",
      current: PASSWORD,
      next: PASSWORD,
      text: "distinta de la actual",
    },
  ])(
    "contraseña $name: no cambia nada y lo explica",
    async ({ current, next, text }) => {
      await createUser("docente1", ["teacher"]);
      await signIn("docente1");
      const session = client.cookies.get(SESSION);
      const form = await client.get(passwordPage);
      const reply = await client.post(passwordAction, {
        csrf: client.csrfOf(form),
        current,
        next,
      });
      expect(reply.location).toBe("/account/password");
      expect(client.cookies.get(SESSION)).toBe(session);
      const page = await client.get(passwordPage);
      expect(page.body).toContain('role="alert"');
      expect(page.body).toContain(text);
      expect(page.body).toContain("No se ha cambiado nada");
    },
  );

  test("salir revoca la sesión, borra su cookie y lo confirma en la entrada", async () => {
    await enter("docente1", ["teacher"]);
    const session = client.cookies.get(SESSION) ?? "";
    const home = await client.get(homePage);
    const reply = await client.post(signOutAction, {
      csrf: client.csrfOf(home),
    });
    expect(reply.status).toBe(303);
    expect(reply.location).toBe("/login");
    expect(client.cookies.has(SESSION)).toBe(false);
    expect((await client.get(loginPage)).body).toContain(
      "Has salido de AulaNorma",
    );
    client.cookies.set(SESSION, session);
    expect((await client.get(homePage)).location).toBe("/login");
    expect(auditActions().at(-1)).toBe("session.sign_out:ok");
  });
});

describe("CSRF en las acciones con sesión", () => {
  test.each([
    ["salir", signOutAction],
    ["cambiar la contraseña", passwordAction],
  ] as const)(
    "%s sin el testigo de la sesión se rechaza con 403 y se audita",
    async (_name, action) => {
      await enter("docente1", ["teacher"]);
      for (const csrf of ["", "inventado"]) {
        const reply = await client.post(action, {
          csrf,
          current: NEW_PASSWORD,
          next: `otra-${RUN}`,
        });
        expectClosed(reply, 403);
        expect(auditActions().at(-1)).toBe("request.denied:denied:csrf");
      }
      expect((await client.get(homePage)).status).toBe(200);
    },
  );

  test("el testigo de otra sesión no sirve", async () => {
    await enter("docente1", ["teacher"]);
    const mine = new Map(client.cookies);
    const myToken = client.csrfOf(await client.get(homePage));
    client.cookies.clear();
    await enter("docente2", ["teacher"]);
    expectClosed(await client.post(signOutAction, { csrf: myToken }), 403);
    client.cookies.clear();
    for (const [name, value] of mine) {
      client.cookies.set(name, value);
    }
    expect((await client.post(signOutAction, { csrf: myToken })).location).toBe(
      "/login",
    );
  });

  test.each([
    { name: "sin Origin", options: { origin: null } },
    {
      name: "con otro Origin",
      options: { origin: "https://atacante.example" },
    },
    {
      name: "con Sec-Fetch-Site same-site",
      options: { secFetchSite: "same-site" },
    },
  ])(
    "salir $name se rechaza con 403 aunque el testigo sea correcto",
    async ({ options }) => {
      await enter("docente1", ["teacher"]);
      const home = await client.get(homePage);
      expectClosed(
        await client.post(
          signOutAction,
          { csrf: client.csrfOf(home) },
          options,
        ),
        403,
      );
      expect((await client.get(homePage)).status).toBe(200);
    },
  );

  test("el origen esperado es el público configurado", async () => {
    await enter("docente1", ["teacher"]);
    const home = await client.get(homePage);
    const reply = await client.post(
      signOutAction,
      { csrf: client.csrfOf(home) },
      { origin: ORIGIN, secFetchSite: "same-origin" },
    );
    expect(reply.location).toBe("/login");
  });
});

describe("permisos comprobados en el servidor", () => {
  const adminPage = {
    getServerSideProps: protectedPage(
      {
        role: "admin",
        operation: "prueba.admin.ver",
        allowPendingPasswordChange: false,
      },
      ({ session }) => ({
        status: 200,
        page: layout({
          title: "Solo administración",
          session,
          content: html`<h1>Reservado</h1>`,
        }),
      }),
    ),
  };
  let ran = 0;
  const adminAction = {
    default: protectedAction(
      {
        role: "admin",
        operation: "prueba.admin.cambiar",
        allowPendingPasswordChange: false,
      },
      () => {
        ran += 1;
        return Promise.resolve({ location: "/" });
      },
    ),
  };

  beforeEach(() => {
    ran = 0;
  });

  test.each([
    { name: "docente", roles: ["teacher"] },
    { name: "cuenta sin perfiles", roles: [] },
  ])(
    "$name: la página de administración responde 403 sin su contenido, y se audita",
    async ({ roles }) => {
      await enter("cuenta1", roles);
      const reply = await client.get(adminPage);
      expect(reply.status).toBe(403);
      expect(reply.body).toContain("No tienes permiso");
      expect(reply.body).not.toContain("Reservado");
      expect(client.runtime.audit.list().at(-1)).toMatchObject({
        action: "access.denied",
        result: "denied",
        details: { operation: "prueba.admin.ver", required: "admin" },
      });
    },
  );

  test.each([
    { name: "docente", roles: ["teacher"] },
    { name: "cuenta sin perfiles", roles: [] },
  ])(
    "$name: la acción de administración responde 403 sin ejecutarse, aunque el testigo sea correcto",
    async ({ roles }) => {
      await enter("cuenta1", roles);
      const home = await client.get(homePage);
      const reply = await client.post(adminAction, {
        csrf: client.csrfOf(home),
      });
      expectClosed(reply, 403);
      expect(ran).toBe(0);
      expect(client.runtime.audit.list().at(-1)).toMatchObject({
        action: "access.denied",
        details: { operation: "prueba.admin.cambiar", required: "admin" },
      });
    },
  );

  test("administración: la página y la acción se conceden", async () => {
    await enter("admin1", ["admin"]);
    expect((await client.get(adminPage)).status).toBe(200);
    const home = await client.get(homePage);
    expect(
      (await client.post(adminAction, { csrf: client.csrfOf(home) })).location,
    ).toBe("/");
    expect(ran).toBe(1);
  });

  test("retirar el perfil se aplica en la petición siguiente y cierra la sesión", async () => {
    await enter("admin1", ["admin"]);
    expect((await client.get(adminPage)).status).toBe(200);
    client.runtime.identity.setRoles("admin1", ["teacher"], "cambio");
    expect((await client.get(adminPage)).location).toBe("/login");
  });

  test("con la contraseña inicial pendiente no se alcanza ni con el perfil", async () => {
    await createUser("admin1", ["admin"]);
    await signIn("admin1");
    expect((await client.get(adminPage)).location).toBe("/account/password");
    const form = await client.get(passwordPage);
    const reply = await client.post(adminAction, { csrf: client.csrfOf(form) });
    expect(reply.location).toBe("/account/password");
    expect(ran).toBe(0);
  });
});

describe("caducidad y revocación", () => {
  test("la sesión caduca a los 30 minutos sin uso", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T09:00:00Z"));
    await enter("docente1", ["teacher"]);
    vi.setSystemTime(new Date("2026-03-01T09:29:00Z"));
    expect((await client.get(homePage)).status).toBe(200);
    vi.setSystemTime(new Date("2026-03-01T09:59:00Z"));
    expect((await client.get(homePage)).location).toBe("/login");
  });

  test("la sesión caduca a las 12 horas aunque se use", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.parse("2026-03-01T09:00:00Z");
    vi.setSystemTime(start);
    await enter("docente1", ["teacher"]);
    for (let minutes = 20; minutes < 12 * 60; minutes += 20) {
      vi.setSystemTime(start + minutes * 60_000);
      expect((await client.get(homePage)).status, String(minutes)).toBe(200);
    }
    vi.setSystemTime(start + 12 * 3_600_000 + 60_000);
    expect((await client.get(homePage)).location).toBe("/login");
  });

  test("enviar un formulario con la sesión caducada lleva a la entrada con un aviso", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T09:00:00Z"));
    await enter("docente1", ["teacher"]);
    const home = await client.get(homePage);
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
    const reply = await client.post(passwordAction, {
      csrf: client.csrfOf(home),
      current: NEW_PASSWORD,
      next: `otra-${RUN}`,
    });
    expect(reply.location).toBe("/login");
    expect((await client.get(loginPage)).body).toContain("había caducado");
  });

  test.each([
    {
      name: "desactivar la cuenta",
      act: (target: WebClient) =>
        target.runtime.identity.setDisabled("docente1", true, "c"),
    },
    {
      name: "cambiar sus permisos",
      act: (target: WebClient) =>
        target.runtime.identity.setRoles("docente1", ["admin"], "c"),
    },
    {
      name: "cerrar sus sesiones",
      act: (target: WebClient) =>
        target.runtime.identity.revokeSessions("docente1", "c"),
    },
  ])(
    "$name deja la sesión sin efecto en la petición siguiente",
    async ({ act }) => {
      await enter("docente1", ["teacher"]);
      expect((await client.get(homePage)).status).toBe(200);
      expect(act(client)).toEqual({ ok: true });
      expect((await client.get(homePage)).location).toBe("/login");
    },
  );
});

// De qué dependen los atributos de las cookies: solo del origen público de la
// configuración, que fuera del modo desarrollo es siempre HTTPS
// (tests/unit/platform/config.test.ts). Ninguna cabecera de la petición los
// cambia.
const PROXY_HEADERS = [
  { "x-forwarded-proto": "http" },
  { "x-forwarded-proto": "https" },
  { forwarded: "proto=http;host=otro.example" },
  { "x-forwarded-host": "otro.example", "x-forwarded-port": "80" },
  { "x-forwarded-ssl": "off", "front-end-https": "off" },
  { host: "otro.example" },
  { "x-forwarded-scheme": "http", "x-url-scheme": "http" },
];

describe("atributos de las cookies", () => {
  test("todas las cookies del recorrido cumplen el prefijo __Host-: Secure, Path=/ y sin Domain, además de HttpOnly y SameSite=Strict", async () => {
    await createUser("docente1", ["teacher"]);
    const emitted: string[] = [];
    const keep = (reply: Reply): Reply => {
      emitted.push(...reply.setCookies);
      return reply;
    };
    keep(await signIn("docente1", WRONG));
    keep(await client.get(loginPage));
    keep(await signIn("docente1"));
    const form = keep(await client.get(passwordPage));
    keep(
      await client.post(passwordAction, {
        csrf: client.csrfOf(form),
        current: PASSWORD,
        next: NEW_PASSWORD,
      }),
    );
    const home = keep(await client.get(passwordPage));
    keep(await client.post(signOutAction, { csrf: client.csrfOf(home) }));
    keep(await client.get(loginPage));

    const names = new Set(emitted.map((cookie) => cookie.split("=")[0]));
    expect([...names].sort()).toEqual([ENTRY, NOTICE, SESSION].sort());
    for (const cookie of emitted) {
      const [, ...attributes] = cookie.split("; ");
      expect(cookie).toMatch(/^__Host-aulanorma-(?:session|entry|notice)=/);
      expect(attributes).toContain("Secure");
      expect(attributes).toContain("HttpOnly");
      expect(attributes).toContain("SameSite=Strict");
      expect(attributes).toContain("Path=/");
      expect(
        attributes.filter((attribute) => /^(?:domain|path)=/i.test(attribute)),
      ).toEqual(["Path=/"]);
    }
  });

  test.each(PROXY_HEADERS)(
    "las cabeceras %j no cambian el nombre ni los atributos de las cookies",
    async (headers) => {
      const login = await client.get(loginPage, { headers });
      expect(login.setCookies).toHaveLength(1);
      expect(login.setCookies[0]).toMatch(
        new RegExp(
          `^${ENTRY}=[\\w-]{43}; Path=/; HttpOnly; SameSite=Strict; Secure$`,
        ),
      );
      await createUser("docente1", ["teacher"]);
      const reply = await client.post(
        signInAction,
        {
          csrf: client.csrfOf(login),
          username: "docente1",
          password: PASSWORD,
        },
        { headers },
      );
      expect(reply.location).toBe("/account/password");
      expect(
        reply.setCookies.find((cookie) => cookie.startsWith(SESSION)),
      ).toMatch(/; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
      for (const cookie of reply.setCookies) {
        expect(cookie).toMatch(/^__Host-/);
        expect(cookie).toContain("; Secure");
      }
    },
  );

  test.each(PROXY_HEADERS)(
    "las cabeceras %j no cambian el origen que se exige a un envío",
    async (headers) => {
      await createUser("docente1", ["teacher"]);
      const login = await client.get(loginPage);
      const reply = await client.post(
        signInAction,
        {
          csrf: client.csrfOf(login),
          username: "docente1",
          password: PASSWORD,
        },
        { headers, origin: "http://otro.example" },
      );
      expectClosed(reply, 403);
      expect(reply.setCookies).toEqual([]);
    },
  );
});

describe("modo desarrollo con el origen HTTP local", () => {
  beforeEach(() => {
    client.dispose();
    client = createWebClient({ development: true });
  });

  test("las cookies no llevan __Host- ni Secure, y conservan HttpOnly, SameSite=Strict y Path=/", async () => {
    const login = await client.get(loginPage);
    expect(login.setCookies).toHaveLength(1);
    expect(login.setCookies[0]).toMatch(
      /^aulanorma-entry=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict$/,
    );
    await createUser("docente1", ["teacher"]);
    const reply = await client.post(signInAction, {
      csrf: client.csrfOf(login),
      username: "docente1",
      password: PASSWORD,
    });
    expect(reply.location).toBe("/account/password");
    expect(
      reply.setCookies.find((cookie) =>
        cookie.startsWith("aulanorma-session="),
      ),
    ).toMatch(
      /^aulanorma-session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict$/,
    );
  });

  test.each(PROXY_HEADERS)(
    "las cabeceras %j tampoco cambian aquí las cookies",
    async (headers) => {
      const login = await client.get(loginPage, { headers });
      expect(login.setCookies[0]).toMatch(
        /^aulanorma-entry=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict$/,
      );
    },
  );

  test("un envío con el origen HTTPS de otro sitio se rechaza", async () => {
    const login = await client.get(loginPage);
    const reply = await client.post(
      signInAction,
      { csrf: client.csrfOf(login), username: "docente1", password: PASSWORD },
      { origin: ORIGIN },
    );
    expectClosed(reply, 403);
  });
});

describe("secretos", () => {
  // La cookie de sesión y el testigo del formulario tienen que viajar en las
  // respuestas que los entregan: `Set-Cookie` y el formulario de la propia
  // sesión. Lo que se comprueba es que no aparecen en ningún otro sitio.
  test("el identificador de sesión solo viaja en Set-Cookie y el testigo solo en los formularios de su sesión; los rechazos no llevan ninguno", async () => {
    await enter("docente1", ["teacher"]);
    const session = client.cookies.get(SESSION) ?? "";
    expect(session).toMatch(/^[\w-]{43}$/);
    const home = await client.get(homePage);
    const token = client.csrfOf(home);
    for (const page of [home, await client.get(passwordPage)]) {
      expect(page.status).toBe(200);
      expect(page.body).not.toContain(session);
      expect(page.setCookies).toEqual([]);
      expect(JSON.stringify(page.headers)).not.toContain(session);
      expect(JSON.stringify(page.headers)).not.toContain(token);
      expect(page.body.split(token).length - 1).toBe(
        (page.body.match(/name="csrf"/g) ?? []).length,
      );
    }
    const rejections = [
      await client.post(
        signOutAction,
        { csrf: token },
        { origin: "https://atacante.example" },
      ),
      await client.post(signOutAction, { csrf: "inventado" }),
    ];
    for (const reply of rejections) {
      expect(reply.body).toBe("");
      expect(JSON.stringify(reply.headers)).not.toContain(session);
      expect(JSON.stringify(reply.headers)).not.toContain(token);
    }
    const redirect = await client.post(signOutAction, { csrf: token });
    expect(redirect.location).toBe("/login");
    expect(redirect.body).toBe("");
    expect(JSON.stringify(redirect.headers)).not.toContain(session);
    expect(JSON.stringify(redirect.headers)).not.toContain(token);
  });

  test("ni las respuestas ni la auditoría contienen contraseñas, y la auditoría no contiene cookies ni testigos", async () => {
    await createUser("docente1", ["teacher"]);
    const replies: Reply[] = [];
    replies.push(await signIn("docente1", WRONG));
    replies.push(await client.get(loginPage));
    replies.push(await signIn("docente1"));
    const form = await client.get(passwordPage);
    replies.push(form);
    const token = client.csrfOf(form);
    replies.push(
      await client.post(passwordAction, {
        csrf: token,
        current: PASSWORD,
        next: NEW_PASSWORD,
      }),
    );
    const session = client.cookies.get(SESSION) ?? "";
    replies.push(await client.get(homePage));
    const responses = JSON.stringify(
      replies.map(({ body, headers }) => ({ body, headers })),
    );
    for (const secret of [PASSWORD, NEW_PASSWORD, WRONG]) {
      expect(responses).not.toContain(secret);
    }
    const audit = JSON.stringify(client.runtime.audit.list());
    for (const secret of [PASSWORD, NEW_PASSWORD, WRONG, session, token]) {
      expect(audit).not.toContain(secret);
    }
  });
});
