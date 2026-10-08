// Métricas mínimas (specs/002-boe-scorm-export: T085; constitución, principio
// XI): errores, latencia, coste de generación y estado de las exportaciones.
// Son recuentos de lo que ya está registrado, calculados al consultar la
// página. No hay series temporales, alertas ni monitorización.
import type { ExportStatistics } from "@/modules/content-export";
import { html } from "@/platform/web";
import type { PageReply, SessionContext } from "@/platform/web";
import { amount, reply } from "./shared";

export interface MetricsInput {
  readonly session: SessionContext;
  // Eventos de auditoría, por resultado.
  readonly audit: {
    readonly ok: number;
    readonly denied: number;
    readonly failed: number;
  };
  readonly generation: {
    readonly runs: Readonly<
      Record<"running" | "succeeded" | "failed" | "incomplete", number>
    >;
    readonly calls: number;
    readonly callsByResult: Readonly<
      Record<
        "valid" | "invalid_output" | "provider_error" | "rejected_by_domain",
        number
      >
    >;
    readonly latencyMs: {
      readonly mean: number;
      readonly p95: number;
      readonly max: number;
    } | null;
    readonly providers: readonly string[];
  };
  readonly budget: {
    readonly limit: number;
    readonly currency: string;
    readonly settled: number;
    readonly reserved: number;
    readonly uncertain: number;
    readonly available: number;
  };
  readonly exports: ExportStatistics;
}

export function metricsView(input: MetricsInput): PageReply {
  const { audit, generation, budget, exports } = input;
  const money = (value: number): string => amount(value, budget.currency);
  const simulated =
    generation.providers.length > 0 &&
    generation.providers.every((provider) => provider === "deterministic");
  const failedCalls =
    generation.callsByResult.invalid_output +
    generation.callsByResult.provider_error +
    generation.callsByResult.rejected_by_domain;
  return reply(
    200,
    "Métricas",
    input.session,
    html`<h1>Métricas</h1>
      <p>
        Recuentos de lo que ya está registrado, calculados al abrir esta página.
        No hay series temporales, alertas ni monitorización.
      </p>

      <h2>Errores</h2>
      <dl>
        <dt>Operaciones registradas con error</dt>
        <dd>${audit.failed}</dd>
        <dt>Intentos denegados</dt>
        <dd>${audit.denied}</dd>
        <dt>Operaciones registradas sin error</dt>
        <dd>${audit.ok}</dd>
        <dt>Llamadas de generación sin respuesta aceptada</dt>
        <dd>
          ${failedCalls} de ${generation.calls}:
          ${generation.callsByResult.provider_error} por error del proveedor,
          ${generation.callsByResult.invalid_output} por formato no válido y
          ${generation.callsByResult.rejected_by_domain} rechazadas por las
          reglas del contenido
        </dd>
        <dt>Generaciones fallidas, incompletas o sin terminar</dt>
        <dd>
          ${generation.runs.failed} fallidas, ${generation.runs.incomplete}
          incompletas y ${generation.runs.running} sin terminar, frente a
          ${generation.runs.succeeded} completadas
        </dd>
        <dt>Exportaciones fallidas</dt>
        <dd>${exports.exports.failed}</dd>
      </dl>
      <p class="hint">
        Los errores internos del servidor no se cuentan aquí: quedan en los
        registros del proceso.
      </p>

      <h2>Latencia</h2>
      ${
        generation.latencyMs === null
          ? html`<p class="muted">
              Todavía no hay ninguna llamada de generación registrada.
            </p>`
          : html`<dl>
              <dt>Llamadas de generación medidas</dt>
              <dd>${generation.calls}</dd>
              <dt>Media</dt>
              <dd>${generation.latencyMs.mean} ms</dd>
              <dt>Percentil 95</dt>
              <dd>${generation.latencyMs.p95} ms</dd>
              <dt>Máxima</dt>
              <dd>${generation.latencyMs.max} ms</dd>
            </dl>`
      }
      <p class="hint">
        Solo se mide la latencia de las llamadas de generación. La de las
        peticiones web no se
        registra.${
          simulated
            ? " Todas las llamadas registradas son del adaptador determinista, que responde con una grabación: estas cifras no son las de ningún proveedor."
            : ""
        }
      </p>

      <h2>Coste de generación</h2>
      <dl>
        <dt>Límite del proyecto</dt>
        <dd>${money(budget.limit)}</dd>
        <dt>Consumo confirmado</dt>
        <dd>${money(budget.settled)}</dd>
        <dt>Reservado por operaciones en curso</dt>
        <dd>${money(budget.reserved)}</dd>
        <dt>Operaciones de resultado incierto</dt>
        <dd>${money(budget.uncertain)}</dd>
        <dt>Disponible</dt>
        <dd>${money(Math.max(0, budget.available))}</dd>
      </dl>
      <p class="hint">
        ${
          simulated
            ? "Coste simulado: el adaptador determinista no cuesta nada. "
            : ""
        }El
        detalle y la conciliación están en
        <a href="/budget">Presupuesto</a>.
      </p>

      <h2>Estado de las exportaciones</h2>
      <dl>
        <dt>Paquetes generados y comprobados</dt>
        <dd>${exports.exports.succeeded}</dd>
        <dt>Exportaciones fallidas</dt>
        <dd>${exports.exports.failed}</dd>
        <dt>Descargas entregadas</dt>
        <dd>${exports.downloads.granted}</dd>
        <dt>Descargas denegadas</dt>
        <dd>
          ${
            exports.downloads.not_current +
            exports.downloads.incomplete +
            exports.downloads.unavailable
          }:
          ${exports.downloads.not_current} por versión sin vigencia,
          ${exports.downloads.incomplete} por requisitos sin cubrir y
          ${exports.downloads.unavailable} sin fichero descargable
        </dd>
      </dl>`,
  );
}
