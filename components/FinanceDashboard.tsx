'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFinance, usePrefs } from '@/state/AppProvider';
import { moneyWithCurrency, parsePrice, toArs } from '@/lib/utils';
import { DEFAULT_USD_RATE } from '@/lib/config';
import type { Currency, Transaction, TransactionType } from '@/lib/types';
import { Icon } from './Icon';
import { ExpenseChart } from './ExpenseChart';
import { CashflowForecast } from './CashflowForecast';
import { FinanceSection } from './FinanceSection';

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const rateFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

const TX_LABEL: Record<TransactionType, string> = {
  ingreso: 'Ingreso',
  gasto: 'Gasto',
  transferencia: 'Transferencia',
};

function signedAmount(transaction: Transaction, currency: Currency): string {
  const value = moneyWithCurrency(transaction.amount, currency);
  if (transaction.type === 'ingreso') return `+${value}`;
  if (transaction.type === 'gasto') return `−${value}`;
  return value;
}

/**
 * Pill editable con la cotización de referencia. Escribe en `prefs.usdRate`
 * sólo al confirmar (Enter o blur) y descarta valores inválidos.
 */
function UsdRatePill() {
  const { prefs, setPrefs } = usePrefs();
  const rate = prefs.usdRate ?? DEFAULT_USD_RATE;
  const [draft, setDraft] = useState(() => rateFormatter.format(rate));
  const [editing, setEditing] = useState(false);

  // Si la cotización cambia por fuera (import, settings), re-sincronizamos.
  useEffect(() => {
    if (!editing) setDraft(rateFormatter.format(rate));
  }, [rate, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parsePrice(draft);
    if (Number.isFinite(parsed) && parsed > 0) {
      setPrefs({ usdRate: parsed });
    } else {
      setDraft(rateFormatter.format(rate));
    }
  };

  return (
    <label className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-xs font-semibold text-muted shadow-soft">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon name="finance" size={13} />
      </span>
      <span className="whitespace-nowrap">Dólar ref.: $</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(rateFormatter.format(rate));
            setEditing(false);
            event.currentTarget.blur();
          }
        }}
        aria-label="Cotización del dólar en pesos"
        className="w-20 rounded-lg border border-transparent bg-surface-2 px-2 py-1 text-right text-xs font-bold tabular-nums text-ink outline-none transition-colors focus:border-accent focus:bg-surface"
      />
    </label>
  );
}

export function FinanceDashboard() {
  const { accounts, transactions } = useFinance();
  const { prefs } = usePrefs();
  const usdRate = prefs.usdRate ?? DEFAULT_USD_RATE;

  const currencyOf = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.currency ?? 'ARS'] as const)),
    [accounts],
  );

  // Todo el consolidado se expresa en pesos: las cuentas en USD se convierten
  // con la cotización de referencia.
  const totalBalance = useMemo(
    () =>
      accounts.reduce(
        (sum, account) => sum + toArs(account.balance, account.currency ?? 'ARS', usdRate),
        0,
      ),
    [accounts, usdRate],
  );

  const { monthlyIncome, monthlyExpenses } = useMemo(() => {
    const now = new Date();
    let income = 0;
    let expenses = 0;

    for (const transaction of transactions) {
      const date = new Date(transaction.date);
      if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) continue;

      const inArs = toArs(
        transaction.amount,
        currencyOf.get(transaction.accountId) ?? 'ARS',
        usdRate,
      );
      if (transaction.type === 'ingreso') income += inArs;
      if (transaction.type === 'gasto') expenses += inArs;
    }

    return { monthlyIncome: income, monthlyExpenses: expenses };
  }, [transactions, currencyOf, usdRate]);

  const lastTransaction = useMemo(() => {
    if (transactions.length === 0) return null;
    return [...transactions].sort((a, b) => b.date - a.date)[0];
  }, [transactions]);

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name] as const)),
    [accounts],
  );

  const accountName = (id: string | null | undefined): string =>
    id ? accountNames.get(id) ?? 'Cuenta eliminada' : 'Cuenta eliminada';

  return (
    <div className="animate-in fade-in duration-300">
      {/* BARRA SUPERIOR: COTIZACIÓN */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">Resumen financiero</h2>
          <p className="mt-0.5 text-xs text-muted">
            Todo el consolidado se expresa en pesos; los saldos en dólares se convierten con la
            cotización de referencia.
          </p>
        </div>
        <UsdRatePill />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
              Saldo total consolidado
            </p>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent">
              <Icon name="wallet" size={16} />
            </span>
          </div>
          <p
            className={`mt-3 text-2xl font-bold tabular-nums tracking-tight ${
              totalBalance < 0 ? 'text-danger' : 'text-ink'
            }`}
          >
            {moneyWithCurrency(totalBalance, 'ARS')}
          </p>
          <p className="mt-1 text-xs text-muted">
            {accounts.length === 0
              ? 'Sin cuentas todavía'
              : `${accounts.length} cuenta${accounts.length === 1 ? '' : 's'}`}
          </p>
        </article>

        <article className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
              Ingresos del mes
            </p>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-low-soft text-low">
              <Icon name="arrow-up" size={16} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-ink">
            {moneyWithCurrency(monthlyIncome, 'ARS')}
          </p>
          <p className="mt-1 text-xs text-muted">Mes en curso</p>
        </article>

        <article className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
              Gastos del mes
            </p>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-danger-soft text-danger">
              <Icon name="arrow-down" size={16} />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-ink">
            {moneyWithCurrency(monthlyExpenses, 'ARS')}
          </p>
          <p className="mt-1 text-xs text-muted">Mes en curso</p>
        </article>

        <article className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
              Último movimiento
            </p>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted">
              <Icon name="history" size={16} />
            </span>
          </div>

          {lastTransaction ? (
            <>
              <p className="mt-3 truncate text-sm font-bold text-ink">
                {lastTransaction.category || TX_LABEL[lastTransaction.type]}
              </p>
              <p
                className={`text-lg font-bold tabular-nums tracking-tight ${
                  lastTransaction.type === 'ingreso'
                    ? 'text-low'
                    : lastTransaction.type === 'gasto'
                      ? 'text-danger'
                      : 'text-high'
                }`}
              >
                {signedAmount(
                  lastTransaction,
                  currencyOf.get(lastTransaction.accountId) ?? 'ARS',
                )}
              </p>
              <p className="truncate text-xs text-muted">
                {accountName(lastTransaction.accountId)}
                <span className="mx-1 text-muted/50">·</span>
                {dateFormatter.format(new Date(lastTransaction.date))}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">Sin movimientos registrados.</p>
          )}
        </article>
      </div>

      <div className="mt-4">
        <ExpenseChart />
      </div>

      <div className="mt-4">
        <CashflowForecast />
      </div>

      <FinanceSection />
    </div>
  );
}