// Diagnóstico de la salida capturada por la prueba de humo
// (`scripts/tools/smoke-output-diagnostics.mjs`). Solo observa: estas pruebas
// comprueban la procedencia por flujo, la clasificación cerrada, los límites y
// que el informe nunca contiene texto de la salida.
//
// Los valores sensibles son sintéticos y se generan en cada ejecución.
import { randomBytes } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { describe, expect, test } from "vitest";
import {
  CATEGORY,
  LIMITS,
  SIGNATURE,
  classifyLine,
  createOutputCapture,
  diagnose,
  diagnosticLines,
  signatureOf,
} from "../../../scripts/tools/smoke-output-diagnostics.mjs";

const BANNER = ["> aulanorma@0.1.0 dev", "> npm-script-sintético"];
const NEXT_LINE = /^✓ Running next\.config\.ts took \d+ms$/;
const ABSOLUTE = /(?:^|[\s"'(=:])(?:\/(?:Users|home|tmp)\/|[A-Za-z]:\\)/;
const OPTIONS = {
  bannerLines: BANNER,
  nextStartupLine: NEXT_LINE,
  hasAbsolutePath: (text: string) => ABSOLUTE.test(text),
};
const EXPECT_STARTUP = {
  expectedEvent: "startup.completed",
  nextStartupAllowed: true,
} as const;
const COMPLETED = JSON.stringify({
  level: "info",
  time: "2026-01-01T00:00:00.000Z",
  service: "aulanorma",
  environment: "ci",
  msg: "startup.completed",
});

const synthetic = () => randomBytes(12).toString("hex");

describe("procedencia por flujo", () => {
  test("separa los flujos y numera la recepción común", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stdout", `${BANNER[0] ?? ""}\n${BANNER[1] ?? ""}\n`);
    capture.receive("stdout", "✓ Running next.config.ts took 25ms\n");
    capture.receive("stderr", "⚠ aviso sintético\n");
    capture.receive("stdout", `${COMPLETED}\n`);
    const { records, streams } = capture.snapshot();
    expect(streams.stdout).toEqual({ lines: 4, chunks: 3, unrecorded: 0 });
    expect(streams.stderr).toEqual({ lines: 1, chunks: 1, unrecorded: 0 });
    expect(
      records.map(({ stream, line, received, category }) => [
        stream,
        line,
        received,
        category,
      ]),
    ).toEqual([
      ["stdout", 1, 1, CATEGORY.NPM_BANNER],
      ["stdout", 2, 1, CATEGORY.NPM_BANNER],
      ["stdout", 3, 2, CATEGORY.NEXT_STARTUP],
      ["stderr", 1, 3, CATEGORY.NEXT_WARNING],
      ["stdout", 4, 4, CATEGORY.STARTUP_COMPLETED],
    ]);
  });

  test("una línea repartida entre fragmentos se completa con el último", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stderr", "⚠ av");
    capture.receive("stderr", "iso ");
    capture.receive("stderr", "partido\n");
    const [record] = capture.snapshot().records;
    expect(record).toMatchObject({
      stream: "stderr",
      line: 1,
      received: 3,
      category: CATEGORY.NEXT_WARNING,
      unterminated: false,
      spliced: false,
    });
  });

  test("varios saltos por fragmento y un fragmento final sin salto", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stdout", "uno\n\ndos\ntres sin salto");
    const { records, streams } = capture.snapshot();
    expect(streams.stdout.lines).toBe(4);
    expect(
      records.map(({ line, category, unterminated }) => [
        line,
        category,
        unterminated,
      ]),
    ).toEqual([
      [1, CATEGORY.UNKNOWN, false],
      [2, CATEGORY.EMPTY, false],
      [3, CATEGORY.UNKNOWN, false],
      [4, CATEGORY.UNKNOWN, true],
    ]);
  });

  test("marca el empalme cuando el otro flujo llega con una línea abierta", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stdout", '{"msg":"startup.comp');
    capture.receive("stderr", "⚠ intercalado\n");
    capture.receive("stdout", 'leted"}\n');
    const snapshot = capture.snapshot();
    expect(snapshot.interleavings).toBe(1);
    const stdout = snapshot.records.find(({ stream }) => stream === "stdout");
    expect(stdout).toMatchObject({
      category: CATEGORY.STARTUP_COMPLETED,
      spliced: true,
    });
  });

  // En la salida mezclada, el fragmento de A queda pegado a la línea abierta de
  // B: la línea de B y la primera línea de A combinan los dos flujos. La marca
  // no pasa a las líneas posteriores de A.
  test.each([
    ["stdout", "stderr"],
    ["stderr", "stdout"],
  ] as const)(
    "empalme con %s abierto y un fragmento de %s: marca las dos líneas afectadas",
    (open, other) => {
      const capture = createOutputCapture(OPTIONS);
      capture.receive(open, "abierta");
      capture.receive(other, "primera\nsegunda\n");
      capture.receive(open, " cierre\n");
      capture.receive(other, "tercera\n");
      const snapshot = capture.snapshot();
      expect(snapshot.interleavings).toBe(1);
      expect(
        snapshot.records.map(({ stream, line, spliced }) => [
          stream,
          line,
          spliced,
        ]),
      ).toEqual([
        [other, 1, true],
        [other, 2, false],
        [open, 1, true],
        [other, 3, false],
      ]);
    },
  );

  test("caracteres multibyte partidos entre bytes, como con setEncoding", () => {
    // `⚠` ocupa tres bytes y `ñ`, dos: los cortes caen dentro de ellos.
    const bytes = Buffer.from("⚠ señal ñandú\n", "utf8");
    const decoder = new StringDecoder("utf8");
    const capture = createOutputCapture(OPTIONS);
    const cuts = [0, 1, 2, 6, 7, bytes.length];
    for (const [index, end] of cuts.entries()) {
      if (index > 0) {
        const start = cuts[index - 1] ?? 0;
        capture.receive("stderr", decoder.write(bytes.subarray(start, end)));
      }
    }
    const { records, streams } = capture.snapshot();
    expect(streams.stderr.chunks).toBe(5);
    expect(records).toHaveLength(1);
    expect(records[0]?.category).toBe(CATEGORY.NEXT_WARNING);
  });

  test("las secuencias ANSI se detectan y no impiden clasificar", () => {
    expect(
      classifyLine("\u001b[33m\u001b[1m⚠\u001b[22m\u001b[39m aviso", OPTIONS),
    ).toEqual({
      category: CATEGORY.NEXT_WARNING,
      ansi: true,
      absolutePath: false,
    });
    expect(
      classifyLine(
        "\u001b[32m✓\u001b[39m Running next.config.ts took 3ms",
        OPTIONS,
      ).category,
    ).toBe(CATEGORY.NEXT_STARTUP);
  });
});

describe("categorías cerradas", () => {
  test.each([
    ["", CATEGORY.EMPTY],
    [BANNER[0] ?? "", CATEGORY.NPM_BANNER],
    ["✓ Running next.config.ts took 25ms", CATEGORY.NEXT_STARTUP],
    [COMPLETED, CATEGORY.STARTUP_COMPLETED],
    ['{"msg":"startup.config_invalid"}', CATEGORY.CONFIG_INVALID],
    ['{"msg":"otro"}', CATEGORY.JSON_OTHER],
    ["[1, 2]", CATEGORY.JSON_OTHER],
    ['{"incompleto": ', CATEGORY.JSON_INVALID],
    ["⚠ Warning: aviso sintético", CATEGORY.NEXT_WARNING],
    ["⨯ error sintético", CATEGORY.NEXT_ERROR],
    ["○ Compiling /api/health ...", CATEGORY.NEXT_OTHER],
    ["▲ Next.js 16.3.6", CATEGORY.NEXT_OTHER],
    ["npm warn config sintético", CATEGORY.NPM_WARNING],
    ["npm error code SINTETICO", CATEGORY.NPM_ERROR],
    [
      "Persisting failed during shutdown: sintético",
      CATEGORY.TURBOPACK_PERSISTENCE,
    ],
    ["⚠ Failed to restore data for task 7", CATEGORY.TURBOPACK_PERSISTENCE],
    ["Batch meta restore failed: x", CATEGORY.TURBOPACK_PERSISTENCE],
    ["texto cualquiera", CATEGORY.UNKNOWN],
    ["✓ otra línea de Next", CATEGORY.NEXT_OTHER],
  ])("%j → %s", (line, category) => {
    expect(classifyLine(line, OPTIONS).category).toBe(category);
  });
});

describe("relación con startup.completed", () => {
  test("mismo flujo: orden de emisión conocido", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stdout", "texto antes\n");
    capture.receive("stdout", `${COMPLETED}\n`);
    capture.receive("stdout", "texto después\n");
    const { details } = diagnose(capture.snapshot(), EXPECT_STARTUP);
    expect(
      details.map(({ relation, emissionOrder }) => [relation, emissionOrder]),
    ).toEqual([
      ["antes", "mismo-flujo"],
      ["después", "mismo-flujo"],
    ]);
  });

  test("entre flujos: solo orden de recepción", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stderr", "⚠ primero\n");
    capture.receive("stdout", `${COMPLETED}\n`);
    capture.receive("stderr", "⚠ después\n");
    const { details } = diagnose(capture.snapshot(), EXPECT_STARTUP);
    expect(
      details.map(({ relation, emissionOrder }) => [relation, emissionOrder]),
    ).toEqual([
      ["recibida-antes", "no-determinable-entre-flujos"],
      ["recibida-después", "no-determinable-entre-flujos"],
    ]);
  });

  test("sin evento, la relación no se inventa", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stderr", "⚠ suelto\n");
    const { details, startupCompleted } = diagnose(
      capture.snapshot(),
      EXPECT_STARTUP,
    );
    expect(startupCompleted).toBeUndefined();
    expect(details[0]?.relation).toBe("sin-startup.completed");
  });

  test("las líneas admitidas no se informan", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive(
      "stdout",
      `${BANNER.join("\n")}\n\n✓ Running next.config.ts took 9ms\n${COMPLETED}\n`,
    );
    const diagnosis = diagnose(capture.snapshot(), EXPECT_STARTUP);
    expect(diagnosis.details).toHaveLength(0);
    const forbidden = diagnose(capture.snapshot(), {
      expectedEvent: "startup.config_invalid",
      nextStartupAllowed: false,
    });
    expect(forbidden.details.map(({ record }) => record.category)).toEqual([
      CATEGORY.NEXT_STARTUP,
      CATEGORY.STARTUP_COMPLETED,
    ]);
  });
});

describe("límites", () => {
  const small = { maxLineLength: 8, maxRecordsPerStream: 3, maxDetails: 2 };

  test("trunca las líneas largas y cuenta las no registradas", () => {
    const capture = createOutputCapture(OPTIONS, small);
    capture.receive("stderr", `${"x".repeat(40)}\nb\nc\nd\ne\n`);
    const { records, streams } = capture.snapshot();
    expect(records).toHaveLength(3);
    expect(records[0]?.truncated).toBe(true);
    expect(streams.stderr).toEqual({ lines: 5, chunks: 1, unrecorded: 2 });
  });

  test("informa de los detalles omitidos", () => {
    const capture = createOutputCapture(OPTIONS, small);
    capture.receive("stderr", "a\nb\nc\n");
    const lines = diagnosticLines(capture, EXPECT_STARTUP, 4, small);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("no-admitidas=3 omitidas=1");
  });

  test("los límites por defecto son finitos", () => {
    expect(LIMITS.maxLineLength).toBeGreaterThan(0);
    expect(LIMITS.maxRecordsPerStream).toBeGreaterThan(0);
    expect(LIMITS.maxDetails).toBeGreaterThan(0);
  });
});

describe("informe sin filtraciones", () => {
  test("ni texto, ni rutas, ni valores, ni claves", () => {
    const token = `ghp_${synthetic()}${synthetic()}`;
    const unixPath = `/home/${synthetic()}/proyecto`;
    const windowsPath = `C:\\Users\\${synthetic()}\\proyecto`;
    const key = `CLAVE_${synthetic()}`;
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stderr", `⚠ aviso ${token} en ${unixPath}\n`);
    capture.receive("stderr", `npm warn ${windowsPath}\n`);
    capture.receive("stdout", `{"${key}":"${token}"}\n`);
    capture.receive("stdout", `Failed to restore data for task ${unixPath}\n`);
    const report = diagnosticLines(capture, EXPECT_STARTUP, 20).join("\n");
    for (const secret of [token, unixPath, windowsPath, key, "proyecto"]) {
      expect(report).not.toContain(secret);
    }
    expect(report).not.toMatch(/\/home\/|C:\\|ghp_/);
    expect(report).toContain(
      "flujo=stderr línea=1 recepción=1 respecto-a-startup.completed=sin-startup.completed orden-de-emisión=no-aplica categoría=next-aviso ruta-absoluta=sí",
    );
    expect(report).toContain("categoría=npm-aviso ruta-absoluta=sí");
    expect(report).toContain("categoría=json-otro ruta-absoluta=no");
    expect(report).toContain(
      "categoría=turbopack-persistencia ruta-absoluta=sí",
    );
  });

  test("cada línea del informe solo usa campos controlados", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stderr", `⚠ ${synthetic()} /tmp/${synthetic()}\n`);
    capture.receive("stdout", `${COMPLETED}\n`);
    for (const line of diagnosticLines(capture, EXPECT_STARTUP, 7)) {
      expect(line).toMatch(
        /^diagnóstico: caso=7 (?:resumen: |flujo=(?:stdout|stderr) )[\w.:=()\-áéíóúñ ]+$/,
      );
    }
  });
});

// Aviso de sistema de archivos lento de Turbopack (Next.js 16.3.6): dos líneas
// en una sola escritura. Los mensajes son sintéticos, con la forma verificada:
// solo validan la instrumentación, no que el aviso se haya emitido.
const SEE_MORE =
  "See more: https://nextjs.org/docs/app/guides/local-development";
const slowFilesystem = (directory: string, duration: number) =>
  `⚠ Slow filesystem detected. The benchmark took ${String(duration)}ms. If ${directory} is a network drive, consider moving it to a local folder.`;
const duration = () => 201 + (randomBytes(2).readUInt16BE() % 5000);
const signatures = (capture: ReturnType<typeof createOutputCapture>) =>
  capture
    .snapshot()
    .records.map(({ stream, line, category, signature }) => [
      stream,
      line,
      category,
      signature,
    ]);

describe("firmas del aviso de sistema de archivos lento", () => {
  test("reconoce las dos firmas sin cambiar la categoría", () => {
    const first = slowFilesystem(`/tmp/${synthetic()}/.next`, duration());
    expect(signatureOf(first)).toBe(SIGNATURE.SLOW_FILESYSTEM);
    expect(classifyLine(first, OPTIONS).category).toBe(CATEGORY.NEXT_WARNING);
    expect(signatureOf(SEE_MORE)).toBe(SIGNATURE.SLOW_FILESYSTEM_SEE_MORE);
    expect(classifyLine(SEE_MORE, OPTIONS)).toEqual({
      category: CATEGORY.UNKNOWN,
      ansi: false,
      absolutePath: false,
    });
    expect(signatureOf("texto cualquiera")).toBe(SIGNATURE.NONE);
    expect(signatureOf("")).toBe(SIGNATURE.NONE);
  });

  test.each([
    [
      "sin el prefijo de aviso",
      "Slow filesystem detected. The benchmark took 900ms.",
    ],
    [
      "con el prefijo de error",
      "⨯ Slow filesystem detected. The benchmark took 900ms.",
    ],
    ["en minúsculas", "⚠ slow filesystem detected. The benchmark took 900ms."],
    ["sin la medición", "⚠ Slow filesystem detected."],
    ["prefijo incompleto", "⚠ Slow filesystem detected. The benchmark"],
    [
      "sin espacio tras el aviso",
      "⚠Slow filesystem detected. The benchmark took 900ms.",
    ],
    ["otra URL", "See more: https://nextjs.org/docs/app/guides/other"],
    ["la URL con barra final", `${SEE_MORE}/`],
    ["la URL con un espacio final", `${SEE_MORE} `],
    ["la URL con sangría", `  ${SEE_MORE}`],
    ["la URL tras el prefijo de aviso", `⚠ ${SEE_MORE}`],
    ["la URL dentro de otra línea", `Read more. ${SEE_MORE}`],
  ])("%s → ninguna", (_name, line) => {
    expect(signatureOf(line)).toBe(SIGNATURE.NONE);
  });

  test("las dos líneas en un mismo fragmento de stderr", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive(
      "stderr",
      `${slowFilesystem(`/tmp/${synthetic()}/.next`, duration())}\n${SEE_MORE}\n`,
    );
    expect(capture.snapshot().streams.stderr).toEqual({
      lines: 2,
      chunks: 1,
      unrecorded: 0,
    });
    expect(signatures(capture)).toEqual([
      ["stderr", 1, CATEGORY.NEXT_WARNING, SIGNATURE.SLOW_FILESYSTEM],
      ["stderr", 2, CATEGORY.UNKNOWN, SIGNATURE.SLOW_FILESYSTEM_SEE_MORE],
    ]);
  });

  test("las dos líneas repartidas entre fragmentos", () => {
    const text = `${slowFilesystem(`/tmp/${synthetic()}/.next`, duration())}\n${SEE_MORE}\n`;
    // Cortes dentro del prefijo de aviso, del prefijo del mensaje, en el salto
    // y dentro de la URL.
    const cuts = [1, 12, text.indexOf("\n") + 1, text.length - 20, text.length];
    const capture = createOutputCapture(OPTIONS);
    let start = 0;
    for (const end of cuts) {
      capture.receive("stderr", text.slice(start, end));
      start = end;
    }
    expect(capture.snapshot().streams.stderr.chunks).toBe(cuts.length);
    expect(signatures(capture)).toEqual([
      ["stderr", 1, CATEGORY.NEXT_WARNING, SIGNATURE.SLOW_FILESYSTEM],
      ["stderr", 2, CATEGORY.UNKNOWN, SIGNATURE.SLOW_FILESYSTEM_SEE_MORE],
    ]);
  });

  test("las secuencias ANSI no impiden reconocerlas y se conserva su indicador", () => {
    const colored = `\u001b[33m\u001b[1m⚠\u001b[22m\u001b[39m ${slowFilesystem("/tmp/x", 300).slice(2)}`;
    const dimmed = `\u001b[2m${SEE_MORE}\u001b[22m`;
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stderr", `${colored}\n${dimmed}\n`);
    expect(
      capture
        .snapshot()
        .records.map(({ category, ansi, signature }) => [
          category,
          ansi,
          signature,
        ]),
    ).toEqual([
      [CATEGORY.NEXT_WARNING, true, SIGNATURE.SLOW_FILESYSTEM],
      [CATEGORY.UNKNOWN, true, SIGNATURE.SLOW_FILESYSTEM_SEE_MORE],
    ]);
  });

  test("el informe muestra las firmas sin ruta, duración ni token", () => {
    const directory = `/tmp/${synthetic()}/.next`;
    const token = `ghp_${synthetic()}${synthetic()}`;
    const took = duration();
    const capture = createOutputCapture(OPTIONS);
    capture.receive(
      "stderr",
      `${slowFilesystem(directory, took)} ${token}\n${SEE_MORE}\n`,
    );
    capture.receive("stdout", `${COMPLETED}\n`);
    const lines = diagnosticLines(capture, EXPECT_STARTUP, 21);
    const report = lines.join("\n");
    for (const secret of [directory, token, `${String(took)}ms`, "ghp_"]) {
      expect(report).not.toContain(secret);
    }
    expect(report).not.toMatch(/\/tmp\/|Slow filesystem|nextjs\.org/);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      "diagnóstico: caso=21 flujo=stderr línea=1 recepción=1 respecto-a-startup.completed=recibida-antes orden-de-emisión=no-determinable-entre-flujos categoría=next-aviso ruta-absoluta=sí ansi=no sin-salto=no truncada=no empalmada-en-mezcla=no firma=slow-filesystem",
    );
    expect(lines[2]).toBe(
      "diagnóstico: caso=21 flujo=stderr línea=2 recepción=1 respecto-a-startup.completed=recibida-antes orden-de-emisión=no-determinable-entre-flujos categoría=texto-desconocido ruta-absoluta=no ansi=no sin-salto=no truncada=no empalmada-en-mezcla=no firma=slow-filesystem-ver-mas",
    );
    for (const line of lines) {
      expect(line).toMatch(
        /^diagnóstico: caso=21 (?:resumen: |flujo=(?:stdout|stderr) )[\w.:=()\-áéíóúñ ]+$/,
      );
    }
  });

  test("conserva el truncado, el empalme y la línea sin salto", () => {
    const limits = { ...LIMITS, maxLineLength: 64 };
    const capture = createOutputCapture(OPTIONS, limits);
    capture.receive("stdout", "abierta");
    capture.receive(
      "stderr",
      `${slowFilesystem(`/tmp/${synthetic()}/.next`, duration())}\n${SEE_MORE}`,
    );
    capture.receive("stdout", " cierre\n");
    const records = capture.snapshot().records;
    expect(
      records.map(({ stream, signature, truncated, spliced, unterminated }) => [
        stream,
        signature,
        truncated,
        spliced,
        unterminated,
      ]),
    ).toEqual([
      // La primera línea de stderr llegó con stdout abierta; la segunda seguía
      // abierta cuando llegó el cierre de stdout: las tres quedan empalmadas.
      ["stderr", SIGNATURE.SLOW_FILESYSTEM, true, true, false],
      ["stderr", SIGNATURE.SLOW_FILESYSTEM_SEE_MORE, false, true, true],
      ["stdout", SIGNATURE.NONE, false, true, false],
    ]);
    const report = diagnosticLines(capture, EXPECT_STARTUP, 9, limits).join(
      "\n",
    );
    expect(report).toContain(
      "sin-salto=no truncada=sí empalmada-en-mezcla=sí firma=slow-filesystem",
    );
    expect(report).toContain(
      "sin-salto=sí truncada=no empalmada-en-mezcla=sí firma=slow-filesystem-ver-mas",
    );
  });

  test("las líneas admitidas no se informan ni llevan firma en el informe", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive(
      "stdout",
      `${BANNER.join("\n")}\n✓ Running next.config.ts took 9ms\n${COMPLETED}\n`,
    );
    const lines = diagnosticLines(capture, EXPECT_STARTUP, 2);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("no-admitidas=0");
    expect(lines.join("\n")).not.toContain("firma=");
  });
});

describe("fallos del propio diagnóstico", () => {
  test("una captura que falla no lanza y lo indica sin detalles", () => {
    const capture = createOutputCapture({
      ...OPTIONS,
      hasAbsolutePath: () => {
        throw new Error(`detalle interno ${synthetic()}`);
      },
    });
    expect(() => {
      capture.receive("stderr", "línea\n");
    }).not.toThrow();
    expect(diagnosticLines(capture, EXPECT_STARTUP, 3)).toEqual([
      "diagnóstico: caso=3 no disponible: la captura por flujo falló",
    ]);
  });

  test("un error interno se convierte en un aviso genérico", () => {
    const secret = synthetic();
    const broken = {
      receive: () => undefined,
      snapshot: () => {
        throw new Error(secret);
      },
    };
    const lines = diagnosticLines(broken, EXPECT_STARTUP, 5);
    expect(lines).toEqual([
      "diagnóstico: caso=5 no disponible: error interno del diagnóstico",
    ]);
    expect(lines.join("")).not.toContain(secret);
  });

  test("el diagnóstico solo añade líneas: nunca devuelve una lista vacía ante un fallo", () => {
    const capture = createOutputCapture(OPTIONS);
    capture.receive("stdout", `${COMPLETED}\n`);
    const lines = diagnosticLines(capture, EXPECT_STARTUP, 1);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("no-admitidas=0");
  });
});
