'use client';

import { useEffect, useMemo, useState } from 'react';
import { useData, usePrefs, useUI } from '@/state/AppProvider';
import { money, parsePrice, pluralize, currentMonthKey, summarizePurchases } from '@/lib/utils';
import { Icon } from './Icon';
import { ViewTabs } from './ViewTabs';

const budgetFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const formatBudget = (value: number) => budgetFormatter.format(value);

/**
 * Panel superior de Mis Compras: métricas, presupuesto, pestañas internas
 * y acceso a "Nueva Compra". Antes vivía en el Header global.
 */
export function PurchasesPanel() {
  const { items } = useData();
  const { prefs, setPrefs } = usePrefs();
  const { setView } = useUI();

  const budget = prefs.budget;

  const [budgetDraft, setBudgetDraft] = useState<string>(() =>
    budget === null ? '' : formatBudget(budget),
  );

  useEffect(() => {
    setBudgetDraft(budget === null ? '' : formatBudget(budget));
  }, [budget]);

  const summary = useMemo(() => summarizePurchases(items, currentMonthKey()), [items]);

  // Misma referencia que el Dashboard: el presupuesto mide lo YA comprado.
  // `grand` se muestra aparte como compromiso total (comprado + pendiente).
  const diff = budget === null ? 0 : budget - summary.boughtTotal;
  const over = budget !== null && diff < 0;
  const warning = budget !== null && !over && diff <= budget * 0.2;
  const percent =
    budget === null
      ? 0
      : budget > 0
        ? Math.min((summary.boughtTotal / budget) * 100, 100)
        : summary.boughtTotal > 0
          ? 100
          : 0;

  const installmentsMeta =
    summary.activeInstallments === 0
      ? 'Sin cuotas activas'
      : pluralize(summary.activeInstallments, 'compra en cuotas', 'compras en cuotas');

  const commitBudget = (raw: string) => {
    const trimmed = raw.trim();

    if (!trimmed) {
      setPrefs({ budget: null });
      setBudgetDraft('');
      return;
    }

    const parsed = parsePrice(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setBudgetDraft(budget === null ? '' : formatBudget(budget));
      return;
    }

    setPrefs({ budget: parsed });
    setBudgetDraft(formatBudget(parsed));
  };

  const startNewPurchase = () => {
    setView('list');
    window.setTimeout(() => {
      document.getElementById('item-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">
      <div className="grid grid-cols-2 divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <Stat
          label="Pendiente"
          value={money(summary.pendingTotal)}
          meta={pluralize(summary.pendingCount, 'artículo', 'artículos')}
          tone="accent"
        />
        <Stat
          label="Comprado"
          value={money(summary.boughtTotal)}
          meta={pluralize(summary.boughtCount, 'artículo', 'artículos')}
        />
        <Stat
          label="Total estimado"
          value={money(summary.grand)}
          meta="Pendiente + comprado"
        />
        <Stat
          label="Cuotas (Mensual)"
          value={money(summary.monthlyAmount)}
          meta={installmentsMeta}
          tone="medium"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-surface-2/50 p-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <label
            htmlFor="purchases-budget"
            className="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted"
          >
            Gastado:
          </label>
          <div className="relative max-w-[200px] flex-1">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted"
              aria-hidden="true"
            >
              $
            </span>
            <input
              id="purchases-budget"
              type="text"
              inputMode="decimal"
              maxLength={20}
              placeholder="Sin límite"
              value={budgetDraft}
              onChange={(event) => setBudgetDraft(event.target.value)}
              onBlur={(event) => commitBudget(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              className="min-h-[36px] w-full rounded-lg border border-line-strong bg-surface pl-7 pr-3 text-sm tabular-nums text-ink focus:border-accent focus:outline-none"
            />
          </div>
          <p
            className={`text-xs font-semibold ${
              budget === null
                ? 'text-muted'
                : over
                  ? 'text-danger'
                  : warning
                    ? 'text-medium'
                    : 'text-accent-ink'
            }`}
          >
            {budget === null
              ? 'Definí un límite'
              : over
                ? `Excedido por ${money(Math.abs(diff))}`
                : `Margen: ${money(diff)}`}
          </p>
        </div>

        {budget !== null && (
          <div className="flex w-full min-w-[150px] items-center gap-3 sm:w-auto">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
              aria-label="Consumo del presupuesto de compras"
              className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-3"
            >
              <span
                className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${
                  over ? 'bg-danger' : warning ? 'bg-medium' : 'bg-accent'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p
              className={`text-xs font-bold tabular-nums ${
                over ? 'text-danger' : warning ? 'text-medium' : 'text-muted'
              }`}
            >
              {Math.round(percent)}%
            </p>
          </div>
        )}
      </div>

      {/* Misma lectura que el Dashboard: gastado vs. comprometido total. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface-2/30 px-3 py-2 text-[0.7rem] text-muted">
        <span>
          Comprado:{' '}
          <span className="font-bold tabular-nums text-ink">{money(summary.boughtTotal)}</span>
          {budget !== null && <span> de {money(budget)}</span>}
        </span>
        <span>
          Comprometido:{' '}
          <span className="font-bold tabular-nums text-ink">{money(summary.grand)}</span>
          <span> (incluye pendientes)</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-3">
        <ViewTabs />
        <button
          type="button"
          onClick={startNewPurchase}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-bold text-surface transition-opacity hover:opacity-90"
        >
          <Icon name="add" size={15} />
          Nueva compra
        </button>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  meta,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  tone?: 'accent' | 'medium';
}) {
  const toneText = tone === 'accent' ? 'text-accent' : tone === 'medium' ? 'text-medium' : 'text-ink';

  return (
    <article className="flex flex-col justify-center p-4 sm:p-5">
      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums tracking-tight sm:text-2xl ${toneText}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[0.7rem] text-muted">{meta}</p>
    </article>
  );
}
