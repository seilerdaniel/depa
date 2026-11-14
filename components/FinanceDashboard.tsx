'use client';

import { useMemo } from 'react';
import { useFinance } from '@/state/AppProvider';
import { money } from '@/lib/utils';
import type { Transaction, TransactionType } from '@/lib/types';
import { Icon } from './Icon';
import { ExpenseChart } from './ExpenseChart';
import { FinanceSection } from './FinanceSection';

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const TX_LABEL: Record<TransactionType, string> = {
  ingreso: 'Ingreso',
  gasto: 'Gasto',
  transferencia: 'Transferencia',
};

function signedAmount(transaction: Transaction): string {
  if (transaction.type === 'ingreso') return `+${money(transaction.amount)}`;
  if (transaction.type === 'gasto') return `−${money(transaction.amount)}`;
  return money(transaction.amount);
}

export function FinanceDashboard() {
  const { accounts, transactions } = useFinance();

  const totalBalance = useMemo(
    () => accounts.reduce((sum, account) => sum + account.balance, 0),
    [accounts],
  );

  const { monthlyIncome, monthlyExpenses } = useMemo(() => {
    const now = new Date();
    let income = 0;
    let expenses = 0;

    for (const transaction of transactions) {
      const date = new Date(transaction.date);
      if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) continue;
      if (transaction.type === 'ingreso') income += transaction.amount;
      if (transaction.type === 'gasto') expenses += transaction.amount;
    }

    return { monthlyIncome: income, monthlyExpenses: expenses };
  }, [transactions]);

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

  const startNewMovement = () => {
    document
      .getElementById('finance-movement-form')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="animate-in fade-in duration-300">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink">Mis Finanzas</h2>
          <p className="mt-1 text-sm text-muted">
            Saldo consolidado, cuentas y movimientos guardados en SQLite.
          </p>
        </div>

        <button
          type="button"
          onClick={startNewMovement}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-accent-on transition-colors hover:bg-accent-ink"
        >
          <Icon name="add" size={15} />
          Nuevo movimiento
        </button>
      </header>

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
            {money(totalBalance)}
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
            {money(monthlyIncome)}
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
            {money(monthlyExpenses)}
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
                {signedAmount(lastTransaction)}
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

      <FinanceSection />
    </div>
  );
}
