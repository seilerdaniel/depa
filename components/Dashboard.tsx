'use client';

import { useEffect, useMemo, useState } from 'react';
import { useData, usePrefs, useUI } from '@/state/AppProvider';
import { PRIORITY } from '@/lib/config';
import {
  formatMonth, money, parsePrice, pluralize, currentMonthKey, summarizePurchases,
} from '@/lib/utils';
import type { Item } from '@/lib/types';
import { Icon } from './Icon';

const budgetFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const formatBudget = (value: number) => budgetFormatter.format(value);

interface MonthGroup {
  key: string;
  label: string;
  items: Item[];
  total: number;
}

export function Dashboard() {
  const { items } = useData();
  const { prefs, setPrefs } = usePrefs();
  const { setView } = useUI();

  const budget = prefs.budget;

  // Borrador local: el usuario tipea libre y sólo persistimos en blur/Enter.
  const [budgetDraft, setBudgetDraft] = useState<string>(() =>
    budget === null ? '' : formatBudget(budget),
  );

  // Si el presupuesto cambia por fuera (import, otra vista), re-sincronizamos.
  useEffect(() => {
    setBudgetDraft(budget === null ? '' : formatBudget(budget));
  }, [budget]);

  // Misma función que usa PurchasesPanel: las dos pantallas no pueden divergir.
  const totals = useMemo(() => summarizePurchases(items, currentMonthKey()), [items]);

  const planning = useMemo(() => {
    const groups = new Map<string, Item[]>();

    for (const item of items) {
      if (item.bought || item.wishlist) continue;
      const key = item.purchaseMonth ?? '';
      const bucket = groups.get(key);
      if (bucket) bucket.push(item);
      else groups.set(key, [item]);
    }

    const result: MonthGroup[] = [];
    for (const [key, bucket] of groups) {
      bucket.sort((a, b) => b.price - a.price);
      result.push({
        key,
        label: key ? formatMonth(key) : 'Sin mes definido',
        items: bucket,
        total: bucket.reduce((acc, item) => acc + item.price, 0),
      });
    }

    result.sort((a, b) => {
      if (!a.key && !b.key) return 0;
      if (!a.key) return 1;
      if (!b.key) return -1;
      return a.key.localeCompare(b.key);
    });

    return result;
  }, [items]);

  const planningTotal = planning.reduce((acc, group) => acc + group.total, 0);

  // El presupuesto mide lo YA gastado. Se deja el porcentaje sin tope para
  // poder mostrar cuánto se excedió, pero la barra se recorta al 100%.
  const consumedPct =
    budget === null
      ? 0
      : budget > 0
        ? (totals.boughtTotal / budget) * 100
        : totals.boughtTotal > 0
          ? 100
          : 0;
  const barWidth = Math.min(100, consumedPct);
  const over = budget !== null && totals.boughtTotal > budget;
  const remaining = budget === null ? 0 : budget - totals.boughtTotal;

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

  return (
    <div className="mx-auto w-full max-w-5xl animate-in fade-in duration-500">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Tu foto financiera: lo comprado, las cuotas fijas y lo que falta planificar.
        </p>
      </header>

      {/* ==========================================
          RESUMEN
      ========================================== */}
      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
              Total Comprado
            </p>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent-ink">
              <Icon name="check" size={16} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-ink">
            {money(totals.boughtTotal)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {pluralize(totals.boughtCount, 'artículo comprado', 'artículos comprados')}
          </p>
        </article>

        <article className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
              Fijo Mensual de Cuotas
            </p>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-medium-soft text-medium">
              <Icon name="calendar" size={16} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-ink">
            {money(totals.monthlyAmount)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {totals.activeInstallments === 0
              ? 'Sin cuotas activas este mes'
              : `Compromiso de ${pluralize(totals.activeInstallments, 'compra en cuotas', 'compras en cuotas')}`}
          </p>
        </article>

        <article className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
              Pendiente de Compra
            </p>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted">
              <Icon name="shopping-cart" size={16} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-ink">
            {money(totals.pendingTotal)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {pluralize(totals.pendingCount, 'artículo pendiente', 'artículos pendientes')}
          </p>
        </article>
      </div>

      {/* ==========================================
          PRESUPUESTO
      ========================================== */}
      <section className="mt-4 rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-ink">Presupuesto límite</h2>
            <p className="mt-1 text-xs text-muted">
              Se compara contra el Total Comprado. Vacío = sin límite.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="dashboard-budget"
              className="text-xs font-bold uppercase tracking-wider text-muted"
            >
              Límite
            </label>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted"
                aria-hidden="true"
              >
                $
              </span>
              <input
                id="dashboard-budget"
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
                className="min-h-[40px] w-[170px] rounded-xl border border-line-strong bg-surface-2 pl-7 pr-3 text-sm tabular-nums text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
              />
            </div>
          </div>
        </div>

        {budget === null ? (
          <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
            Definí un límite para ver cuánto llevás gastado.
          </p>
        ) : (
          <div className="mt-4">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(barWidth)}
              aria-label="Consumo del presupuesto"
              className="relative h-3 w-full overflow-hidden rounded-full bg-surface-3"
            >
              <span
                className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${
                  over ? 'bg-danger' : consumedPct >= 80 ? 'bg-medium' : 'bg-accent'
                }`}
                style={{ width: `${barWidth}%` }}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p
                className={`text-xs font-semibold ${
                  over ? 'text-danger' : consumedPct >= 80 ? 'text-medium' : 'text-muted'
                }`}
              >
                {money(totals.boughtTotal)} de {money(budget)}
              </p>
              <p
                className={`text-xs font-bold tabular-nums ${
                  over ? 'text-danger' : consumedPct >= 80 ? 'text-medium' : 'text-accent-ink'
                }`}
              >
                {Math.round(consumedPct)}%
                {over
                  ? ` · excedido por ${money(Math.abs(remaining))}`
                  : ` · quedan ${money(remaining)}`}
              </p>
            </div>

            <p className="mt-2 text-[0.7rem] text-muted">
              Comprometido:{' '}
              <span className="font-bold tabular-nums text-ink">{money(totals.grand)}</span>{' '}
              (comprado + pendientes)
            </p>
          </div>
        )}
      </section>

      {/* ==========================================
          PLANIFICACIÓN MENSUAL
      ========================================== */}
      <section className="mt-4 rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-ink">Planificación mensual</h2>
            <p className="mt-1 text-xs text-muted">
              Pendientes agrupados por mes de compra.
            </p>
          </div>
          <p className="text-xs font-semibold text-muted">
            Total planificado:{' '}
            <span className="font-bold tabular-nums text-ink">{money(planningTotal)}</span>
          </p>
        </div>

        {planning.length === 0 ? (
          <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
            No hay compras pendientes para planificar.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {planning.map((group) => (
              <details
                key={group.key || 'sin-mes'}
                open
                className="group rounded-2xl border border-line bg-surface-2/40"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Icon name="calendar" size={15} className="text-muted" />
                    <span className="text-sm font-bold text-ink">{group.label}</span>
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[0.7rem] font-semibold text-muted">
                      {group.items.length}
                    </span>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-ink">
                    {money(group.total)}
                  </span>
                </summary>

                <ul className="grid gap-1.5 border-t border-line px-4 py-3">
                  {group.items.map((item) => {
                    const priority = PRIORITY.get(item.priority);
                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                          <p className="truncate text-[0.7rem] text-muted">
                            {[item.category, priority ? priority.label : '']
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-ink">
                          {money(item.price)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setView('list');
              window.setTimeout(() => {
                document
                  .getElementById('item-form')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 60);
            }}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-accent-on transition-colors hover:bg-accent-ink"
          >
            <Icon name="plus" size={16} />
            Agregar compra
          </button>
        </div>
      </section>
    </div>
  );
}
