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
import * as extendAction from "@/pages/api/session/extend";
import * as renewAction from "@/pages/api/session/renew";
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
    // Lo que ya existe para un docente se ofrece; lo que no existe, no.
    expect(home.body).toMatch(/href="\/documents"/);
    expect(home.body).not.toMatch(/href="\/(?:outline|syllabus|export)/);
  });

  test("a una cuenta sin el perfil de docente no se le ofrecen los documentos", async () => {
    await enter("admin1", ["admin"]);
    const home = await client.get(homePage);
    expect(home.status).toBe(200);
    expect(home.body).not.toMatch(/href="\/documents/);
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
        (page.body.match(/<input[^>]*\sname="csrf"/g) ?? []).length,
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

// El entorno `production` solo es una anotación de los registros: con él, el
// acceso se decide exactamente igual que con cualquier otro.
describe("entorno production", () => {
  beforeEach(() => {
    client.dispose();
    client = createWebClient({ environment: "production" });
  });

  test("la configuración lo recoge y el origen sigue siendo HTTPS", () => {
    expect(client.runtime.config.environment).toBe("production");
    expect(client.runtime.config.publicOrigin).toBe(ORIGIN);
  });

  test("las cookies llevan __Host-, Secure, HttpOnly y SameSite=Strict", async () => {
    const login = await client.get(loginPage);
    expect(login.setCookies).toHaveLength(1);
    expect(login.setCookies[0]).toMatch(
      new RegExp(
        `^${ENTRY}=[\\w-]{43}; Path=/; HttpOnly; SameSite=Strict; Secure$`,
      ),
    );
    await createUser("docente1", ["teacher"]);
    const reply = await signIn("docente1");
    const session = reply.setCookies.find((cookie) =>
      cookie.startsWith(`${SESSION}=`),
    );
    expect(session).toMatch(/; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
  });

  test("sin sesión, una página protegida lleva a la entrada sin devolver nada", async () => {
    const reply = await client.get(homePage);
    expect(reply.status).toBe(303);
    expect(reply.location).toBe("/login");
    expect(reply.body).toBe("");
  });

  test("una acción sin Origin, de otro origen o sin testigo se rechaza", async () => {
    await enter("docente1", ["teacher"]);
    const csrf = client.csrfOf(await client.get(homePage));
    expectClosed(
      await client.post(signOutAction, { csrf }, { origin: null }),
      403,
    );
    expectClosed(
      await client.post(
        signOutAction,
        { csrf },
        { origin: "http://127.0.0.1:3000" },
      ),
      403,
    );
    expectClosed(await client.post(signOutAction, { csrf: "otro" }), 403);
    expect((await client.get(homePage)).status).toBe(200);
  });

  test.each([
    { name: "docente", roles: ["teacher"] },
    { name: "cuenta sin perfiles", roles: [] },
  ])(
    "$name: una página de administración responde 403 y se audita",
    async ({ roles }) => {
      await enter("cuenta1", roles);
      const reply = await client.get({
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
      });
      expect(reply.status).toBe(403);
      expect(reply.body).not.toContain("Reservado");
      expect(client.runtime.audit.list().at(-1)).toMatchObject({
        action: "access.denied",
        result: "denied",
      });
    },
  );
});

// Aviso de caducidad y ampliación de la sesión (T082; WCAG 2.2.1). El aviso
// va en cada página con sesión; la ampliación es una acción protegida. El
// reloj se adelanta para comprobar la caducidad real en el servidor.
describe("aviso de caducidad y ampliación de la sesión", () => {
  const IDLE = 30 * 60_000;
  const MAX = 12 * 3_600_000;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-02T08:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const advance = (ms: number): void => {
    vi.setSystemTime(Date.now() + ms);
  };

  function warning(reply: Reply): Record<string, string> {
    const tag = /<section\s[^>]*id="sesion-aviso"[^>]*>/s.exec(reply.body)?.[0];
    return Object.fromEntries(
      [...(tag ?? "").matchAll(/([a-z-]+)="([^"]*)"/g)].map((match) => [
        match[1] ?? "",
        match[2] ?? "",
      ]),
    );
  }

  test("cada página con sesión lleva el aviso, oculto, con sus plazos y una acción explícita para continuar", async () => {
    await enter("docente1", ["teacher"]);
    const start = Date.now();
    const reply = await client.get(homePage);
    const attributes = warning(reply);
    expect(attributes).toMatchObject({
      id: "sesion-aviso",
      role: "alertdialog",
      "aria-modal": "false",
      "aria-labelledby": "sesion-titulo",
      "aria-describedby": "sesion-texto",
      tabindex: "-1",
      "data-now": String(start),
      "data-idle-at": String(start + IDLE),
      "data-idle-ms": String(IDLE),
    });
    // La duración máxima cuenta desde la entrada, no desde esta página.
    expect(Number(attributes["data-max-at"])).toBeLessThanOrEqual(start + MAX);
    expect(Number(attributes["data-max-at"])).toBeGreaterThan(
      start + MAX - 60_000,
    );
    expect(reply.body).toMatch(
      /<section\s[^>]*id="sesion-aviso"[^>]*\shidden/s,
    );
    const body = reply.body.replace(/\s+/g, " ");
    expect(body).toContain(
      '<form id="sesion-ampliar" method="post" action="/api/session/extend">',
    );
    expect(body).toMatch(
      /<button type="submit" data-busy="Ampliando…">\s*Continuar la sesión\s*<\/button>/,
    );
    expect(body).toContain('<p id="sesion-estado" class="skip" role="status">');
    expect(body).toContain('<a href="/login">Volver a entrar</a>');
    // El aviso va antes de la cabecera, para que el foco lo encuentre primero.
    expect(body.indexOf('id="sesion-aviso"')).toBeLessThan(
      body.indexOf("<header"),
    );
    // El script sigue autorizado solo por su huella.
    const script = /<script>(.*?)<\/script>/s.exec(reply.body)?.[1] ?? "";
    expect(reply.headers["content-security-policy"]).toContain(
      `script-src 'sha256-${createHash("sha256").update(script).digest("base64")}'`,
    );
    expect(script).toContain("/api/session/sign-out");
    // Sin temporizadores que consulten al servidor. Las tres llamadas son la
    // subida de un PDF, el envío de los formularios del aviso y la lectura
    // del testigo vigente tras una renovación; ninguna está en el
    // temporizador.
    expect(script.match(/fetch\(/g)).toHaveLength(3);
    expect(/function tick\(\)\{[^}]*fetch/.test(script)).toBe(false);
    expect(script).not.toMatch(
      /XMLHttpRequest|sendBeacon|EventSource|WebSocket/,
    );
  });

  test("sin sesión no hay aviso ni formulario de ampliación", async () => {
    const reply = await client.get(loginPage);
    expect(reply.body).not.toContain('id="sesion-aviso"');
    expect(reply.body).not.toContain('action="/api/session/extend"');
  });

  test("ampliar responde 204 sin cuerpo, retrasa la caducidad y se registra", async () => {
    await enter("docente1", ["teacher"]);
    advance(IDLE - 60_000);
    const token = client.csrfOf(await client.get(homePage));
    // Casi todo el periodo, sin más actividad que la ampliación.
    advance(IDLE - 1000);
    const reply = await client.post(extendAction, { csrf: token });
    expectClosed(reply, 204);
    expect(reply.setCookies).toEqual([]);
    expect(auditActions().at(-1)).toBe("session.extended:ok");

    advance(IDLE - 1000);
    const after = await client.get(homePage);
    expect(after.status).toBe(200);
    expect(warning(after)["data-idle-at"]).toBe(String(Date.now() + IDLE));
  });

  test("permite más de diez ampliaciones seguidas sin ninguna otra petición", async () => {
    await enter("docente1", ["teacher"]);
    const token = client.csrfOf(await client.get(homePage));
    for (let round = 1; round <= 12; round += 1) {
      advance(IDLE - 1000);
      expect(
        (await client.post(extendAction, { csrf: token })).status,
        String(round),
      ).toBe(204);
    }
    expect((await client.get(homePage)).status).toBe(200);
  });

  test("sin ampliar ni hacer nada, la sesión caduca de verdad: la página lleva a la entrada y la ampliación ya no sirve", async () => {
    await enter("docente1", ["teacher"]);
    const token = client.csrfOf(await client.get(homePage));
    advance(IDLE);
    const late = await client.post(extendAction, { csrf: token });
    expect(late.status).toBe(303);
    expect(late.location).toBe("/login");
    expect(late.body).toBe("");
    expect((await client.get(homePage)).location).toBe("/login");
    expect(auditActions()).not.toContain("session.extended:ok");
  });

  test("la duración máxima no se amplía: llegado ese momento la sesión termina aunque se haya ampliado", async () => {
    await enter("docente1", ["teacher"]);
    const first = await client.get(homePage);
    const token = client.csrfOf(first);
    const maxAt = Number(warning(first)["data-max-at"]);
    while (Date.now() + IDLE - 1000 < maxAt) {
      advance(IDLE - 1000);
      expect((await client.post(extendAction, { csrf: token })).status).toBe(
        204,
      );
    }
    // La página sigue anunciando el mismo final.
    expect(warning(await client.get(homePage))["data-max-at"]).toBe(
      String(maxAt),
    );
    vi.setSystemTime(maxAt);
    expect((await client.post(extendAction, { csrf: token })).location).toBe(
      "/login",
    );
    expect((await client.get(homePage)).location).toBe("/login");
  });

  test.each([
    { name: "sin Origin", options: { origin: null } },
    { name: "desde otro origen", options: { origin: "https://otro.example" } },
    {
      name: "desde otro sitio según el navegador",
      options: { secFetchSite: "cross-site" },
    },
  ])(
    "$name se rechaza antes de mirar la sesión: ni amplía ni cuenta como actividad",
    async ({ options }) => {
      await enter("docente1", ["teacher"]);
      const token = client.csrfOf(await client.get(homePage));
      advance(IDLE - 120_000);
      expectClosed(
        await client.post(extendAction, { csrf: token }, options),
        403,
      );
      expect(auditActions()).not.toContain("session.extended:ok");
      // La caducidad sigue donde estaba.
      advance(120_000);
      expect((await client.get(homePage)).location).toBe("/login");
    },
  );

  test.each([
    { name: "sin testigo", fields: {} },
    { name: "con otro testigo", fields: { csrf: "otro" } },
  ])(
    "$name se rechaza, no se registra ninguna ampliación y no cuenta como actividad",
    async ({ fields }) => {
      await enter("docente1", ["teacher"]);
      await client.get(homePage);
      advance(IDLE - 120_000);
      expectClosed(await client.post(extendAction, fields), 403);
      expect(auditActions().at(-1)).toBe("request.denied:denied:csrf");
      expect(auditActions()).not.toContain("session.extended:ok");
      // La caducidad sigue donde estaba: el rechazo no la ha retrasado.
      advance(120_000);
      expect((await client.get(homePage)).location).toBe("/login");
    },
  );

  test("solo admite POST, y sin sesión lleva a la entrada", async () => {
    await enter("docente1", ["teacher"]);
    const token = client.csrfOf(await client.get(homePage));
    const get = await client.post(
      extendAction,
      { csrf: token },
      { method: "GET" },
    );
    expect(get.status).toBe(405);
    expect(get.headers.allow).toBe("POST");
    client.cookies.clear();
    const anonymous = await client.post(extendAction, { csrf: token });
    expect(anonymous.status).toBe(303);
    expect(anonymous.location).toBe("/login");
  });

  test("una sesión revocada, cerrada o de una cuenta desactivada no se amplía", async () => {
    await enter("docente1", ["teacher"]);
    const token = client.csrfOf(await client.get(homePage));
    const cookies = new Map(client.cookies);

    client.runtime.identity.revokeSessions("docente1", "revocación");
    expect((await client.post(extendAction, { csrf: token })).location).toBe(
      "/login",
    );

    // Cerrada desde otra pestaña: la cookie anterior ya no sirve.
    await signIn("docente1", NEW_PASSWORD);
    const again = await client.get(homePage);
    const other = new Map(client.cookies);
    await client.post(signOutAction, { csrf: client.csrfOf(again) });
    const stale = await client.post(
      extendAction,
      { csrf: client.csrfOf(again) },
      { cookies: Object.fromEntries(other) },
    );
    expect(stale.location).toBe("/login");

    await signIn("docente1", NEW_PASSWORD);
    const live = client.csrfOf(await client.get(homePage));
    client.runtime.identity.setDisabled("docente1", true, "baja");
    expect((await client.post(extendAction, { csrf: live })).location).toBe(
      "/login",
    );
    expect(cookies.size).toBeGreaterThan(0);
    expect(auditActions()).not.toContain("session.extended:ok");
  });

  test("con la contraseña inicial pendiente también se puede ampliar, y no da acceso a nada más", async () => {
    await createUser("docente1", ["teacher"]);
    expect((await signIn("docente1")).location).toBe("/account/password");
    const form = await client.get(passwordPage);
    expect(warning(form).id).toBe("sesion-aviso");
    expect(
      (await client.post(extendAction, { csrf: client.csrfOf(form) })).status,
    ).toBe(204);
    expect((await client.get(homePage)).location).toBe("/account/password");
  });

  test("dos sesiones de la misma cuenta son independientes: ampliar una no amplía la otra", async () => {
    await enter("docente1", ["teacher"]);
    const first = {
      cookies: Object.fromEntries(client.cookies),
      token: client.csrfOf(await client.get(homePage)),
    };
    client.cookies.clear();
    await signIn("docente1", NEW_PASSWORD);
    const second = client.csrfOf(await client.get(homePage));

    advance(IDLE - 1000);
    expect((await client.post(extendAction, { csrf: second })).status).toBe(
      204,
    );
    advance(2000);
    // La segunda sigue viva; la primera, que nadie amplió, ha caducado.
    expect((await client.get(homePage)).status).toBe(200);
    expect(
      (
        await client.post(
          extendAction,
          { csrf: first.token },
          { cookies: first.cookies },
        )
      ).location,
    ).toBe("/login");
  });
});

// Renovación de la autenticación sin salir de la página (FR-071; WCAG
// 2.2.1). Sustituye la sesión por otra nueva: no prolonga ninguna.
describe("renovación de la sesión", () => {
  interface Renewal {
    csrf: string;
    now: number;
    idleAt: number;
    idleMs: number;
    maxAt: number;
  }

  // Estado de un navegador: sus cookies y el testigo de una página abierta.
  async function opened(): Promise<{
    cookies: Record<string, string>;
    token: string;
  }> {
    const home = await client.get(passwordPage);
    return {
      cookies: Object.fromEntries(client.cookies),
      token: client.csrfOf(home),
    };
  }

  const renew = (
    token: string,
    password: string,
    options: Parameters<WebClient["post"]>[2] = {},
  ): Promise<Reply> =>
    client.post(renewAction, { csrf: token, password }, options);

  const renewals = (): string[] =>
    auditActions().filter((action) => action.startsWith("session.renew"));

  test("el aviso lleva el formulario de renovación, oculto, con campos que admiten pegar y gestores de contraseñas", async () => {
    await enter("docente1", ["teacher"]);
    const body = (await client.get(homePage)).body.replace(/\s+/g, " ");
    expect(body).toContain(
      '<form id="sesion-renovar" method="post" action="/api/session/renew" hidden >',
    );
    expect(body).toContain(
      '<input class="skip" type="text" name="username" autocomplete="username" value="docente1" tabindex="-1" aria-hidden="true" readonly />',
    );
    expect(body).toContain(
      '<label for="sesion-contrasena">Contraseña</label> <input id="sesion-contrasena" name="password" type="password" autocomplete="current-password" aria-describedby="sesion-error" required />',
    );
    expect(body).toContain(
      '<p id="sesion-error" class="session-error" role="alert"></p>',
    );
    expect(body).toMatch(
      /<button type="submit" data-busy="Renovando…">\s*Renovar la sesión\s*<\/button>/,
    );
    // Nada impide pegar ni rellenar el campo.
    const script = /<script>(.*?)<\/script>/s.exec(body)?.[1] ?? "";
    expect(script).not.toMatch(/paste|autocomplete|keydown|keypress|keyup/);
    // El almacenamiento local solo recibe instantes y el fin de la sesión:
    // nunca contraseñas, cookies ni testigos.
    expect(
      [...script.matchAll(/publish\(([A-Z_]+),([^)]*)\)/g)]
        .map((match) => `${match[1] ?? ""}:${match[2] ?? ""}`)
        .filter((call) => !call.startsWith("key:"))
        .sort(),
    ).toEqual([
      "RENEWED_KEY:at",
      "SESSION_KEY:{ended:true}",
      "SESSION_KEY:{ended:true}",
      "SESSION_KEY:{idleAt:idleAt}",
      "SESSION_KEY:{idleAt:idleAt}",
      "SESSION_KEY:{idleAt:idleAt}",
    ]);
    expect(script.match(/localStorage\.setItem/g)).toHaveLength(1);
  });

  test("con la contraseña correcta responde con el testigo y los plazos nuevos, cambia la cookie y revoca la sesión anterior", async () => {
    await enter("docente1", ["teacher"]);
    const before = await opened();
    const reply = await renew(before.token, NEW_PASSWORD);

    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe(
      "application/json; charset=utf-8",
    );
    expect(reply.headers["cache-control"]).toBe("no-store");
    expect(reply.headers["x-content-type-options"]).toBe("nosniff");
    const data = JSON.parse(reply.body) as Renewal;
    expect(Object.keys(data).sort()).toEqual([
      "csrf",
      "idleAt",
      "idleMs",
      "maxAt",
      "now",
    ]);
    expect(data.csrf).toMatch(/^[\w-]{43}$/);
    expect(data.csrf).not.toBe(before.token);
    expect(data.idleMs).toBe(30 * 60_000);
    expect(data.idleAt - data.now).toBeLessThanOrEqual(30 * 60_000);
    expect(data.maxAt - data.now).toBeGreaterThan(12 * 3_600_000 - 5000);
    expect(data.maxAt - data.now).toBeLessThanOrEqual(12 * 3_600_000);
    expect(reply.setCookies).toHaveLength(1);
    expect(reply.setCookies[0]).toMatch(
      new RegExp(
        `^${SESSION}=[\\w-]{43}; Path=/; HttpOnly; SameSite=Strict; Secure$`,
      ),
    );
    const cookie = client.cookies.get(SESSION);
    expect(cookie).not.toBe(before.cookies[SESSION]);
    expect(reply.body).not.toContain(cookie ?? "?");
    expect(renewals()).toEqual(["session.renew:ok"]);

    // Con la sesión nueva, las páginas llevan el testigo nuevo.
    const home = await client.get(homePage);
    expect(home.status).toBe(200);
    expect(client.csrfOf(home)).toBe(data.csrf);
  });

  test("una página pedida con la cookie anterior no borra la cookie nueva ni lleva a la entrada", async () => {
    await enter("docente1", ["teacher"]);
    const before = await opened();
    await renew(before.token, NEW_PASSWORD);

    const stale = await client.get(homePage, { cookies: before.cookies });
    expect(stale.status).toBe(409);
    expect(stale.setCookies).toEqual([]);
    expect(stale.body).toContain("Tu sesión se ha renovado");
    expect(stale.body).not.toContain("docente1");
    expect(stale.body).not.toMatch(/<input[^>]*name="csrf"/);
    // La sesión nueva sigue intacta.
    expect((await client.get(homePage)).status).toBe(200);
  });

  test("un formulario enviado con la cookie anterior no se ejecuta ni se pierde: se devuelve para repetirlo, sin testigo y sin tocar la cookie nueva", async () => {
    await enter("docente1", ["teacher"]);
    const before = await opened();
    await renew(before.token, NEW_PASSWORD);

    const hostile = '"><script>alert(1)</script> & texto pendiente';
    const reply = await client.post(
      passwordAction,
      { csrf: before.token, current: hostile, next: "otro valor" },
      { cookies: before.cookies, path: "/api/account/password?x=1" },
    );
    expect(reply.status).toBe(409);
    expect(reply.setCookies).toEqual([]);
    const body = reply.body.replace(/\s+/g, " ");
    expect(body).toContain("Tu envío no se ha guardado todavía");
    expect(body).toContain(
      '<form method="post" action="/api/account/password" data-replay>',
    );
    // Lo enviado vuelve escapado, y el testigo, vacío.
    expect(body).toContain('<input type="hidden" name="csrf" value="" />');
    expect(body).toContain(
      '<input type="hidden" name="current" value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; texto pendiente" />',
    );
    expect(body).toContain(
      '<input type="hidden" name="next" value="otro valor" />',
    );
    expect(reply.body).not.toContain(before.token);
    expect(reply.body).not.toContain(client.cookies.get(SESSION) ?? "?");
    expect(auditActions().at(-1)).toBe("request.denied:denied:session_renewed");
    // La contraseña no ha cambiado y la sesión nueva sigue viva: con la
    // contraseña de siempre se puede renovar otra vez.
    const home = await client.get(homePage);
    expect(home.status).toBe(200);
    expect((await renew(client.csrfOf(home), NEW_PASSWORD)).status).toBe(200);
  });

  test("un formulario con la cookie nueva y el testigo anterior tampoco se ejecuta: se devuelve para repetirlo", async () => {
    await enter("docente1", ["teacher"]);
    const before = await opened();
    await renew(before.token, NEW_PASSWORD);

    // Salir, con el testigo de antes de renovar.
    const reply = await client.post(
      signOutAction,
      { csrf: before.token },
      { path: "/api/session/sign-out" },
    );
    expect(reply.status).toBe(409);
    expect(reply.setCookies).toEqual([]);
    expect(reply.body.replace(/\s+/g, " ")).toContain(
      '<form method="post" action="/api/session/sign-out" data-replay>',
    );
    expect(auditActions().at(-1)).toBe("request.denied:denied:csrf_renewed");
    // No ha salido.
    expect((await client.get(homePage)).status).toBe(200);
    // Un destino que no es una acción propia no produce ningún formulario.
    const odd = await client.post(
      signOutAction,
      { csrf: before.token },
      { path: "//otro.example/api/x" },
    );
    expect(odd.status).toBe(409);
    expect(odd.body).not.toContain("data-replay>");
    expect(odd.body).not.toContain("otro.example");

    // Un testigo inventado sigue siendo un rechazo sin más.
    expectClosed(await client.post(signOutAction, { csrf: "inventado" }), 403);
    // Y repetido con el testigo vigente, se ejecuta.
    const current = client.csrfOf(await client.get(homePage));
    expect((await client.post(signOutAction, { csrf: current })).location).toBe(
      "/login",
    );
  });

  test("la sesión anterior no revive por ninguna vía", async () => {
    await enter("docente1", ["teacher"]);
    const before = await opened();
    await renew(before.token, NEW_PASSWORD);
    const old = { cookies: before.cookies };

    expect((await client.get(homePage, old)).status).toBe(409);
    expect(
      (await client.post(extendAction, { csrf: before.token }, old)).status,
    ).toBe(409);
    expect((await renew(before.token, NEW_PASSWORD, old)).status).toBe(409);
    expect(
      client.runtime.identity.resolveSession(before.cookies[SESSION]),
    ).toBeNull();
    expect(auditActions()).not.toContain("session.extended:ok");
    expect(renewals()).toEqual(["session.renew:ok"]);
  });

  test("con una contraseña incorrecta responde 422, no cambia la cookie y la sesión sigue igual", async () => {
    await enter("docente1", ["teacher"]);
    const before = await opened();
    const reply = await renew(before.token, WRONG);
    expect(reply.status).toBe(422);
    expect(JSON.parse(reply.body)).toEqual({ reason: "invalid_credentials" });
    expect(reply.setCookies).toEqual([]);
    expect(reply.body).not.toContain(WRONG);
    expect(renewals()).toEqual(["session.renew:failed:invalid_credentials"]);
    // El mismo testigo sigue sirviendo.
    expect(client.csrfOf(await client.get(homePage))).toBe(before.token);
  });

  test("tras tres fallos responde 429 aunque la contraseña sea correcta, y la sesión no se pierde", async () => {
    await enter("docente1", ["teacher"]);
    const { token } = await opened();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await renew(token, WRONG)).status).toBe(422);
    }
    const reply = await renew(token, NEW_PASSWORD);
    expect(reply.status).toBe(429);
    expect(JSON.parse(reply.body)).toEqual({ reason: "throttled" });
    expect(reply.setCookies).toEqual([]);
    expect(renewals().at(-1)).toBe("session.renew:denied:throttled");
    expect((await client.get(homePage)).status).toBe(200);
  });

  test("si la sesión se revoca mientras se comprueba la contraseña, responde 401 sin cookie nueva", async () => {
    await enter("docente1", ["teacher"]);
    const { token } = await opened();
    const pending = renew(token, NEW_PASSWORD);
    client.runtime.identity.revokeSessions("docente1", "revocación");
    const reply = await pending;
    expect(reply.status).toBe(401);
    expect(JSON.parse(reply.body)).toEqual({ reason: "session_ended" });
    expect(reply.setCookies).toEqual([]);
    expect((await client.get(homePage)).location).toBe("/login");
  });

  test("dos renovaciones simultáneas desde dos pestañas: una sustituye la sesión y la otra no crea ninguna más", async () => {
    await enter("docente1", ["teacher"]);
    const before = await opened();
    const old = { cookies: before.cookies };
    const [first, second] = await Promise.all([
      renew(before.token, NEW_PASSWORD, old),
      renew(before.token, NEW_PASSWORD, old),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 401]);
    expect(
      client.runtime.db
        .prepare(
          "SELECT count(*) AS n FROM session WHERE user_id IS NOT NULL AND revoked_at IS NULL",
        )
        .get()?.n,
    ).toBe(1);
    expect([...first.setCookies, ...second.setCookies]).toHaveLength(1);
  });

  test("un fallo interno responde 500 sin cuerpo y deja la sesión como estaba", async () => {
    await enter("docente1", ["teacher"]);
    const before = await opened();
    client.runtime.db.exec(
      "CREATE TRIGGER fallo BEFORE INSERT ON audit_event " +
        "WHEN NEW.action = 'session.renew' AND NEW.result = 'ok' " +
        "BEGIN SELECT RAISE(ABORT, 'fallo provocado'); END;",
    );
    const reply = await renew(before.token, NEW_PASSWORD);
    client.runtime.db.exec("DROP TRIGGER fallo");
    expect(reply.status).toBe(500);
    expect(reply.body).toBe("");
    expect(reply.setCookies).toEqual([]);
    // La misma sesión y el mismo testigo siguen sirviendo, y puede renovarse.
    expect(client.csrfOf(await client.get(homePage))).toBe(before.token);
    expect((await renew(before.token, NEW_PASSWORD)).status).toBe(200);
  });

  test.each([
    { name: "sin Origin", options: { origin: null }, token: undefined },
    {
      name: "desde otro origen",
      options: { origin: "https://otro.example" },
      token: undefined,
    },
    { name: "sin testigo", options: {}, token: "" },
    { name: "con un testigo inventado", options: {}, token: "inventado" },
  ])(
    "$name se rechaza sin comprobar la contraseña ni contar un intento",
    async ({ options, token }) => {
      await enter("docente1", ["teacher"]);
      const before = await opened();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        expectClosed(await renew(token ?? before.token, WRONG, options), 403);
      }
      expect(renewals()).toEqual([]);
      // Cuatro rechazos no han bloqueado nada.
      expect((await renew(before.token, NEW_PASSWORD)).status).toBe(200);
    },
  );

  test("sin sesión, con la sesión caducada o con la cuenta desactivada lleva a la entrada", async () => {
    await enter("docente1", ["teacher"]);
    const before = await opened();
    client.cookies.clear();
    expect((await renew(before.token, NEW_PASSWORD)).location).toBe("/login");

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 30 * 60_000);
      const expired = await renew(before.token, NEW_PASSWORD, {
        cookies: before.cookies,
      });
      expect(expired.location).toBe("/login");
    } finally {
      vi.useRealTimers();
    }
    client.runtime.identity.setDisabled("docente1", true, "baja");
    expect(
      (await renew(before.token, NEW_PASSWORD, { cookies: before.cookies }))
        .location,
    ).toBe("/login");
    expect(renewals()).toEqual([]);
  });

  test("con la contraseña inicial pendiente se puede renovar, y sigue pendiente", async () => {
    await createUser("docente1", ["teacher"]);
    await signIn("docente1");
    const form = await client.get(passwordPage);
    expect((await renew(client.csrfOf(form), PASSWORD)).status).toBe(200);
    expect((await client.get(homePage)).location).toBe("/account/password");
  });

  test("renovar no cambia los permisos, y un cambio de permisos revoca también la sesión renovada", async () => {
    await enter("docente1", ["teacher"]);
    const { token } = await opened();
    expect((await renew(token, NEW_PASSWORD)).status).toBe(200);
    expect(
      client.runtime.identity.resolveSession(client.cookies.get(SESSION))?.user
        .roles,
    ).toEqual(["teacher"]);
    client.runtime.identity.setRoles("docente1", ["admin"], "permisos");
    expect((await client.get(homePage)).location).toBe("/login");
  });

  test("ni las respuestas ni el registro contienen la contraseña, y el registro tampoco cookies ni testigos", async () => {
    await enter("docente1", ["teacher"]);
    const before = await opened();
    const refused = await renew(before.token, WRONG);
    const reply = await renew(before.token, NEW_PASSWORD);
    const data = JSON.parse(reply.body) as Renewal;
    for (const response of [refused, reply]) {
      const text = JSON.stringify([response.body, response.headers]);
      expect(text).not.toContain(WRONG);
      expect(text).not.toContain(NEW_PASSWORD);
    }
    const recorded = JSON.stringify(client.runtime.audit.list());
    for (const secret of [
      WRONG,
      NEW_PASSWORD,
      before.token,
      data.csrf,
      before.cookies[SESSION] ?? "?",
      client.cookies.get(SESSION) ?? "?",
    ]) {
      expect(recorded).not.toContain(secret);
    }
  });
});
