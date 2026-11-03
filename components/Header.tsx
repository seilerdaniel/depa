'use client';

import { useMemo } from 'react';
import { useApp } from '@/state/AppProvider';
import { money, pluralize } from '@/lib/utils';
import { Icon } from './Icon';
import { PWAInstall } from './PWAInstall';

export function Header() {
  // 1. Agregamos theme y setTheme aquí
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

  // 2. Función para alternar el tema
  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <header className="pt-7 pb-1">
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
          
          {/* 3. CONTENEDOR DE ACCIONES (PWA, Tema, Badge) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <PWAInstall />
            
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full border border-line bg-surface text-muted hover:text-ink transition-colors"
              title={`Tema actual: ${theme}`}
            >
              {theme === 'light' && <Icon name="sun" size={18} />}
              {theme === 'dark' && <Icon name="moon" size={18} />}
              {theme === 'system' && <Icon name="monitor" size={18} />}
            </button>

            <p className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border border-line rounded-full bg-surface text-muted text-xs font-semibold">
              <Icon name="local" size={13} /> 100% local
            </p>
          </div>
        </div>

        <section className="p-4 border border-line rounded-2xl bg-surface shadow-soft" aria-label="Resumen financiero">
          <h2 className="sr-only">Resumen financiero</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <Stat label="Pendiente" value={money(pendingTotal)} meta={pluralize(pendingCount, 'artículo', 'artículos')} tone="accent" />
            <Stat label="Comprado" value={money(boughtTotal)} meta={pluralize(boughtCount, 'artículo', 'artículos')} />
            <Stat label="Total estimado" value={money(grand)} meta="Pendiente + comprado" />
            <Stat label="Cuotas (Mensual)" value={money(monthly)} meta="Compromiso fijo de pagos" tone="medium" />
          </div>

          {wishCount > 0 && (
            <button
              type="button"
              onClick={() => setView('wishlist')}
              className="flex items-center gap-2.5 w-full mt-3 px-3 py-2.5 border border-line rounded-xl bg-surface-2 text-left text-sm hover:border-line-strong hover:bg-surface-3"
            >
              <span className="grid place-items-center w-7 h-7 rounded-lg bg-accent-soft text-accent-ink"><Icon name="wishlist" size={14} /></span>
              <span className="text-muted">
                Wishlist · <strong className="text-ink">{pluralize(wishCount, 'artículo', 'artículos')}</strong>
              </span>
              <span className="ml-auto font-bold tabular-nums">{money(wishTotal)}</span>
            </button>
          )}

          <div className="flex flex-wrap items-end gap-3 mt-4 pt-4 border-t border-line">
            <div className="flex-1 min-w-[200px] max-w-[250px] grid gap-1.5">
              <label htmlFor="budget-input" className="text-[0.7rem] font-bold tracking-wider uppercase text-muted">
                Presupuesto máximo (Contado)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-semibold" aria-hidden="true">$</span>
                <input
                  id="budget-input"
                  type="text"
                  inputMode="decimal"
                  maxLength={20}
                  placeholder="Sin límite"
                  defaultValue={budget !== null ? new Intl.NumberFormat('es-AR').format(budget) : ''}
                  onChange={(e) => onBudgetInput(e.target.value)}
                  onBlur={(e) => onBudgetBlur(e.target.value)}
                  className="w-full min-h-[40px] pl-7 pr-3 border border-line-strong rounded-xl bg-surface text-ink tabular-nums focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/20"
                />
              </div>
            </div>
            <div className="flex-1 min-w-[260px] pb-0.5">
              <p className={`text-[0.9rem] font-semibold ${budget === null ? 'text-muted font-normal' : over ? 'text-danger' : warning ? 'text-medium' : 'text-accent-ink'}`}>
                {budget === null ? 'Definí un presupuesto para controlar el gasto.'
                  : over ? `Excedido por ${money(Math.abs(diff))}`
                  : `Margen disponible: ${money(diff)}`}
              </p>
              <p className="text-xs text-muted tabular-nums mt-0.5">
                {budget === null ? `Total proyectado: ${money(grand)}` : `${money(grand)} de ${money(budget)}`}
              </p>
            </div>
          </div>

          {budget !== null && (
            <div className="flex items-center gap-3.5 mt-3 px-1">
              <div
                className="relative flex-1 h-2 rounded-full bg-surface-3 overflow-hidden"
                role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(percent, 100)}
              >
                <span
                  className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${over ? 'bg-danger' : warning ? 'bg-medium' : 'bg-accent'}`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <p className={`text-xs font-semibold tabular-nums ${over ? 'text-danger' : warning ? 'text-medium' : 'text-muted'}`}>
                {percent}%
              </p>
            </div>
          )}
        </section>
      </div>
    </header>
  );
}

function Stat({ label, value, meta, tone }: { label: string; value: string; meta: string; tone?: 'accent' | 'medium' }) {
  const toneBg = tone === 'accent' ? 'bg-accent-soft' : tone === 'medium' ? 'bg-medium-soft' : 'bg-surface-2';
  const toneText = tone === 'accent' ? 'text-accent-ink' : tone === 'medium' ? 'text-medium' : 'text-ink';
  const labelTone = tone === 'accent' ? 'text-accent-ink' : tone === 'medium' ? 'text-medium' : 'text-muted';
  return (
    <article className={`p-3 rounded-xl ${toneBg}`}>
      <p className={`text-[0.7rem] font-bold tracking-wider uppercase ${labelTone}`}>{label}</p>
      <p className={`mt-0.5 text-lg md:text-xl font-bold tabular-nums tracking-tight ${toneText}`}>{value}</p>
      <p className="text-xs text-muted mt-0.5">{meta}</p>
    </article>
  );
}