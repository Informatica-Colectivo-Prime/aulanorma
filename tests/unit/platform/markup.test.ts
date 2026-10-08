// Plantilla de HTML con escape (specs/002-boe-scorm-export: FR-020, SC-046).
// Un fragmento solo lo crea la plantilla; ninguna cadena ni ningún objeto
// ajeno se trata como HTML ya escapado.
import { describe, expect, test } from "vitest";
// Con otro nombre que `h` para que el formateador no altere el marcado.
import {
  html as h,
  inlineResource,
  joinHtml,
  localHref,
} from "@/platform/markup";
import type { Html } from "@/platform/markup";

describe("plantilla", () => {
  test("escapa el texto interpolado, también dentro de un atributo", () => {
    const value = `<b a="1" c='2'>&</b>`;
    expect(h`<p title="${value}">${value}</p>`.text).toBe(
      `<p title="&lt;b a=&quot;1&quot; c=&#39;2&#39;&gt;&amp;&lt;/b&gt;">` +
        `&lt;b a=&quot;1&quot; c=&#39;2&#39;&gt;&amp;&lt;/b&gt;</p>`,
    );
  });

  test("compone fragmentos y listas de fragmentos sin escaparlos de nuevo", () => {
    const item = h`<li>${"a & b"}</li>`;
    expect(h`<ul>${[item, item]}</ul>${item}${null}${undefined}${3}`.text).toBe(
      "<ul><li>a &amp; b</li><li>a &amp; b</li></ul><li>a &amp; b</li>3",
    );
    expect(joinHtml([item, item], h`<br />`).text).toBe(
      "<li>a &amp; b</li><br /><li>a &amp; b</li>",
    );
  });

  test("un objeto con la misma forma que un fragmento no es un fragmento", () => {
    const forged = { text: "<script>alert(1)</script>" } as unknown as Html;
    expect(() => h`<p>${forged}</p>`).toThrow(TypeError);
    expect(() => h`<p>${[forged]}</p>`).toThrow(TypeError);
    expect(() => joinHtml([forged], h``)).toThrow(TypeError);
    expect(() => joinHtml([], forged)).toThrow(TypeError);
    // Tampoco una copia de un fragmento auténtico.
    const copy = { ...h`<b>x</b>` };
    expect(() => h`${copy}`).toThrow(TypeError);
  });

  test("un fragmento no puede modificarse después de creado", () => {
    const fragment = h`<p>x</p>`;
    expect(Object.isFrozen(fragment)).toBe(true);
  });
});

describe("direcciones locales", () => {
  test.each([
    "/documents/a/pages/3",
    "/a?b=c#d",
    "#contenido",
    "pagina-3.html",
    "a/b.html",
    "./a",
    "../a",
    "?x=a:b",
  ])("admite %j", (value) => {
    expect(localHref(value)).toBe(value);
  });

  test.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,x",
    "https://example.invalid/",
    "mailto:a@example.invalid",
    "//example.invalid/",
    "/\\example.invalid",
    " /a",
    "/a b",
    "java\nscript:x",
    "\u0000javascript:x",
    "",
  ])("rechaza %j", (value) => {
    expect(localHref(value)).toBeNull();
  });
});

describe("recurso propio", () => {
  test("envuelve el recurso byte a byte", () => {
    expect(inlineResource("style", "a{b:c}").text).toBe(
      "<style>a{b:c}</style>",
    );
  });

  test.each(["</style>", "x</script >", "</SCRIPT>", "<!-- x"])(
    "rechaza un contenido que podría cerrar el elemento: %j",
    (source) => {
      expect(() => inlineResource("script", source)).toThrow(TypeError);
    },
  );
});
