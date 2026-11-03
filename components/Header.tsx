'use client';

import { useMemo } from 'react';
import { useApp } from '@/state/AppProvider';
import { money, pluralize } from '@/lib/utils';
import { Icon } from './Icon';
import { PWAInstall } from './PWAInstall';

export function Header() {
  const { items, prefs, setPrefs, setView, theme, setTheme } = useApp();

  const { pendingTotal, pendingCount, boughtTotal, boughtCount, grand, monthly, wishCount, wishTotal } = useMemo(() => {
    let pendingTotal = 0, boughtTotal = 0, monthly = 0, wishTotal = 0;
    let pendingCount = 0, boughtCount = 0, wishCount = 0;
    for (const it of items) {
      if (it.wishlist) { wishTotal += it.price; wishCount++; continue; }
      if (it.installments && it.installments.count > 0 && it.installments.amount > 0) monthly += it.installments.amount;
      if (it.bought) { boughtTotal += it.price; boughtCount++; }
      else { pendingTotal += it.price; pendingCount++; }
    }
    return { pendingTotal, pendingCount, boughtTotal, boughtCount, grand: pendingTotal + boughtTotal, monthly, wishCount, wishTotal };
  }, [items]);

  const budget = prefs.budget;
  const over = budget !== null && grand > budget;
  const percent = budget === null ? 0 : (budget === 0 ? (grand > 0 ? 100 : 0) : Math.round((grand / budget) * 100));
  const warning = !over && percent >= 80;
  const diff = budget !== null ? budget - grand : 0;

  const onBudgetInput = (value: string) => {
    const raw = value.trim();
    if (!raw) { setPrefs({ budget: null }); return; }
    const parsed = Number(raw.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) setPrefs({ budget: Math.round(parsed * 100) / 100 });
  };

  const onBudgetBlur = (value: string) => {
    const raw = value.trim();
    if (!raw) return;
    const parsed = Number(raw.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) {
      const el = document.getElementById('budget-input') as HTMLInputElement | null;
      if (el) el.value = new Intl.NumberFormat('es-AR').format(parsed);
    }
  };

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <header className="pt-7 pb-2">
      <div className="mx-auto w-[min(1180px,100%-32px)]">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-11 h-11 rounded-2xl bg-accent text-accent-on shadow-soft">
              <Icon name="brand" size={22} />
            </span>
            <div>
              <h1 className="text-[1.35rem] font-bold leading-tight tracking-tight">Depa</h1>
              <p className="text-sm text-muted">Organizá las compras de tu primer departamento.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <PWAInstall />
            <button onClick={toggleTheme} className="p-2 rounded-full border border-line bg-surface text-muted hover:text-ink transition-colors" title={`Tema: ${theme}`}>
              {theme === 'light' && <Icon name="sun" size={18} />}
              {theme === 'dark' && <Icon name="moon" size={18} />}
              {theme === 'system' && <Icon name="monitor" size={18} />}
            </button>
            <p className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border border-line rounded-full bg-surface text-muted text-xs font-semibold">
              <Icon name="local" size={13} /> 100% local
            </p>
          </div>
        </div>

        {/* NUEVO HEADER COMPACTO */}
        <section className="border border-line rounded-2xl bg-surface shadow-soft overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-line">
            <Stat label="Pendiente" value={money(pendingTotal)} meta={pluralize(pendingCount, 'artículo', 'artículos')} tone="accent" />
            <Stat label="Comprado" value={money(boughtTotal)} meta={pluralize(boughtCount, 'artículo', 'artículos')} />
            <Stat label="Total estimado" value={money(grand)} meta="Pendiente + comprado" />
            <Stat label="Cuotas (Mensual)" value={money(monthly)} meta="Compromiso fijo" tone="medium" />
          </div>

          <div className="p-3 bg-surface-2/50 border-t border-line flex flex-wrap sm:flex-nowrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[200px]">
              <label htmlFor="budget-input" className="text-xs font-bold tracking-wider uppercase text-muted whitespace-nowrap">
                Presupuesto:
              </label>
              <div className="relative flex-1 max-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm font-semibold" aria-hidden="true">$</span>
                <input
                  id="budget-input" type="text" inputMode="decimal" maxLength={20} placeholder="Sin límite"
                  defaultValue={budget !== null ? new Intl.NumberFormat('es-AR').format(budget) : ''}
                  onChange={(e) => onBudgetInput(e.target.value)} onBlur={(e) => onBudgetBlur(e.target.value)}
                  className="w-full min-h-[36px] pl-7 pr-3 border border-line-strong rounded-lg bg-surface text-ink text-sm tabular-nums focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-col">
                <p className={`text-xs font-semibold ${budget === null ? 'text-muted' : over ? 'text-danger' : warning ? 'text-medium' : 'text-accent-ink'}`}>
                  {budget === null ? 'Definí un límite' : over ? `Excedido por ${money(Math.abs(diff))}` : `Margen: ${money(diff)}`}
                </p>
              </div>
            </div>

            {wishCount > 0 && (
              <button type="button" onClick={() => setView('wishlist')} className="inline-flex items-center gap-2 px-3 py-1.5 border border-line rounded-lg bg-surface text-xs font-semibold hover:border-accent transition-colors shrink-0">
                <Icon name="wishlist" size={12} className="text-accent" />
                <span className="text-muted">Wishlist:</span>
                <span className="text-ink font-bold">{money(wishTotal)}</span>
              </button>
            )}

            {budget !== null && (
              <div className="flex items-center gap-3 w-full sm:w-auto min-w-[150px]">
                <div className="relative flex-1 h-2 rounded-full bg-surface-3 overflow-hidden" role="progressbar">
                  <span className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${over ? 'bg-danger' : warning ? 'bg-medium' : 'bg-accent'}`} style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
                <p className={`text-xs font-bold tabular-nums ${over ? 'text-danger' : warning ? 'text-medium' : 'text-muted'}`}>{percent}%</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </header>
  );
}

function Stat({ label, value, meta, tone }: { label: string; value: string; meta: string; tone?: 'accent' | 'medium' }) {
  const toneText = tone === 'accent' ? 'text-accent' : tone === 'medium' ? 'text-medium' : 'text-ink';
  return (
    <article className="p-4 sm:p-5 flex flex-col justify-center">
      <p className="text-[0.65rem] font-bold tracking-wider uppercase text-muted">{label}</p>
      <p className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums tracking-tight ${toneText}`}>{value}</p>
      <p className="text-[0.7rem] text-muted mt-0.5">{meta}</p>
    </article>
  );
}