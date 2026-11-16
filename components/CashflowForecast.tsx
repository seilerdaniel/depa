'use client';

import { useMemo, useState } from 'react';
import { useData, useFinance, usePrefs } from '@/state/AppProvider';
import { buildCashflowForecast, money, parsePrice } from '@/lib/utils';
import { Icon } from './Icon';

// ==========================================
// PROYECCIÓN DE FLUJO DE CAJA (6 MESES)
// ==========================================
// Gráfico propio en SVG: no hay librería de charts en el proyecto y sumar una
// para seis barras sería cargar 40 kB por un rectángulo.
const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const PLOT_TOP = 12;
const PLOT_BOTTOM = 34;
const PLOT_HEIGHT = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const BAR_WIDTH = 26;
const BAR_GAP = 6;

function readableMax(value: number): number {
  if (value <= 0) return 1;

  // Redondea el techo a un múltiplo "lindo" para que las barras no queden
  // pegadas al borde superior.
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export function CashflowForecast() {
  const { items } = useData();
  const { accounts, transactions, recurringExpenses } = useFinance();
  const { prefs } = usePrefs();

  const [incomeDraft, setIncomeDraft] = useState<string | null>(null);

  const forecast = useMemo(() => {
    const parsed = incomeDraft === null ? null : parsePrice(incomeDraft);
    const override = parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;

    return buildCashflowForecast(
      items,
      transactions,
      accounts,
      override,
      recurringExpenses,
      new Date(),
      prefs.usdRate,
    );
  }, [items, transactions, accounts, incomeDraft, recurringExpenses, prefs.usdRate]);

  const peak = useMemo(
    () =>
      readableMax(
        Math.max(
          0,
          ...forecast.months.map((month) => Math.max(month.estimatedIncome, month.totalOutflow)),
        ),
      ),
    [forecast.months],
  );

  const groupWidth = CHART_WIDTH / forecast.months.length;
  const usableDraft = incomeDraft !== null && incomeDraft.trim() !== '';

  return (
    <section aria-labelledby="cashflow-heading" className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="cashflow-heading" className="text-base font-bold text-ink">
            Proyección de flujo de caja
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Próximos 6 meses: ingresos estimados contra cuotas vigentes, gastos fijos y compras
            planificadas.
          </p>
        </div>

        <div className="shrink-0 rounded-2xl border border-line bg-surface-2/60 px-3 py-2 text-right">
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted">
            Liquidez inicial
          </p>
          <p
            className={`text-sm font-bold tabular-nums ${
              forecast.startingLiquidity < 0 ? 'text-danger' : 'text-ink'
            }`}
          >
            {money(forecast.startingLiquidity)}
          </p>
        </div>
      </div>

      {/* CONTROL DE INGRESO ESTIMADO */}
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface-2/50 p-3">
        <div className="grid min-w-[180px] flex-1 gap-1">
          <label
            htmlFor="cashflow-income"
            className="text-[0.65rem] font-bold uppercase tracking-wider text-muted"
          >
            Ingreso mensual estimado
          </label>
          <input
            id="cashflow-income"
            type="text"
            inputMode="decimal"
            value={incomeDraft ?? ''}
            placeholder={money(forecast.defaultMonthlyIncome)}
            onChange={(event) => setIncomeDraft(event.target.value)}
            className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIncomeDraft(null)}
            disabled={!usableDraft}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-[0.7rem] font-semibold text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="history" size={13} />
            Usar promedio
          </button>
          <p className="text-[0.7rem] text-muted">
            Promedio 3 meses:{' '}
            <span className="font-bold tabular-nums text-ink">
              {money(forecast.defaultMonthlyIncome)}
            </span>
          </p>
        </div>
      </div>

      {forecast.hasNegativeMonth && forecast.firstNegativeMonth && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger"
        >
          <Icon name="bell" size={14} className="mt-0.5 shrink-0" />
          <span>
            La liquidez proyectada entra en rojo en {forecast.firstNegativeMonth.label}: quedan{' '}
            {money(forecast.firstNegativeMonth.projectedLiquidity)}.
          </span>
        </p>
      )}

      {/* GRÁFICO */}
      <figure className="mt-4">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label="Ingresos estimados contra egresos proyectados de los próximos 6 meses"
          className="h-56 w-full"
        >
          {/* Línea base */}
          <line
            x1={0}
            y1={PLOT_TOP + PLOT_HEIGHT}
            x2={CHART_WIDTH}
            y2={PLOT_TOP + PLOT_HEIGHT}
            className="stroke-line"
            strokeWidth={1}
          />

          {forecast.months.map((month, index) => {
            const groupX = index * groupWidth;
            const centerX = groupX + groupWidth / 2;

            const incomeHeight = (month.estimatedIncome / peak) * PLOT_HEIGHT;
            const installmentsHeight = (month.activeInstallments / peak) * PLOT_HEIGHT;
            const recurringHeight = (month.recurringTotal / peak) * PLOT_HEIGHT;
            const plannedHeight = (month.plannedPurchases / peak) * PLOT_HEIGHT;

            const baseY = PLOT_TOP + PLOT_HEIGHT;
            const incomeX = centerX - BAR_WIDTH - BAR_GAP / 2;
            const outflowX = centerX + BAR_GAP / 2;

            return (
              <g key={month.key}>
                {/* Ingresos */}
                <rect
                  x={incomeX}
                  y={baseY - incomeHeight}
                  width={BAR_WIDTH}
                  height={Math.max(incomeHeight, 1)}
                  rx={4}
                  className="fill-low"
                >
                  <title>
                    {month.label} · Ingresos estimados: {money(month.estimatedIncome)}
                  </title>
                </rect>

                {/* Egresos: planificadas abajo, fijos en el medio, cuotas arriba */}
                <rect
                  x={outflowX}
                  y={baseY - plannedHeight}
                  width={BAR_WIDTH}
                  height={Math.max(plannedHeight, month.plannedPurchases > 0 ? 2 : 0)}
                  rx={4}
                  className="fill-medium"
                >
                  <title>
                    {month.label} · Compras planificadas: {money(month.plannedPurchases)}
                  </title>
                </rect>
                <rect
                  x={outflowX}
                  y={baseY - plannedHeight - recurringHeight}
                  width={BAR_WIDTH}
                  height={Math.max(recurringHeight, month.recurringTotal > 0 ? 2 : 0)}
                  rx={4}
                  className="fill-high"
                >
                  <title>
                    {month.label} · Gastos fijos: {money(month.recurringTotal)}
                  </title>
                </rect>
                <rect
                  x={outflowX}
                  y={baseY - plannedHeight - recurringHeight - installmentsHeight}
                  width={BAR_WIDTH}
                  height={Math.max(installmentsHeight, month.activeInstallments > 0 ? 2 : 0)}
                  rx={4}
                  className="fill-accent"
                >
                  <title>{month.label} · Cuotas vigentes: {money(month.activeInstallments)}</title>
                </rect>

                {/* Etiqueta del mes */}
                <text
                  x={centerX}
                  y={CHART_HEIGHT - 12}
                  textAnchor="middle"
                  className="fill-muted text-[11px] font-semibold"
                >
                  {month.label}
                </text>
              </g>
            );
          })}
        </svg>

        <figcaption className="mt-1 flex flex-wrap items-center gap-4 text-[0.65rem] font-semibold text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-low" />
            Ingresos est.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-accent" />
            Cuotas vigentes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-high" />
            Gastos fijos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-medium" />
            Compras planificadas
          </span>
        </figcaption>
      </figure>

      {/* TABLA */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">
            Detalle mensual de la proyección de flujo de caja a 6 meses
          </caption>
          <thead>
            <tr className="bg-surface-2/60 text-left text-[0.62rem] uppercase tracking-wider text-muted">
              <th scope="col" className="px-3 py-2 font-bold">
                Mes
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                Ingresos est.
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                Cuotas vigentes
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                Gastos fijos
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                Compras planificadas
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                Balance del mes
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                Liquidez proyectada
              </th>
            </tr>
          </thead>
          <tbody>
            {forecast.months.map((month) => (
              <tr key={month.key} className="border-t border-line">
                <th scope="row" className="px-3 py-2 text-left text-xs font-bold text-ink">
                  {month.label}
                </th>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-ink">
                  {money(month.estimatedIncome)}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-ink">
                  {money(month.activeInstallments)}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-ink">
                  {money(month.recurringTotal)}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-ink">
                  {money(month.plannedPurchases)}
                </td>
                <td
                  className={`px-3 py-2 text-right text-xs font-bold tabular-nums ${
                    month.netCashflow < 0 ? 'text-danger' : 'text-low'
                  }`}
                >
                  {month.netCashflow < 0 ? '−' : '+'}
                  {money(Math.abs(month.netCashflow))}
                </td>
                <td
                  className={`px-3 py-2 text-right text-xs font-bold tabular-nums ${
                    month.projectedLiquidity < 0 ? 'text-danger' : 'text-ink'
                  }`}
                >
                  {money(month.projectedLiquidity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[0.7rem] text-muted">
        La proyección asume que las compras planificadas se pagan en su mes y que las cuotas
        siguen igual. No modifica tus datos: es sólo una estimación.
      </p>
    </section>
  );
}
