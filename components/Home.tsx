'use client';

import { useData, useFinance, useUI } from '@/state/AppProvider';
import { money } from '@/lib/utils';
import { Icon } from './Icon';

export function Home() {
  const { items } = useData();
  const { accounts, transactions } = useFinance();
  const { setView } = useUI();

  // --- CÁLCULOS DE FINANZAS ---
  const totalBalance = accounts.reduce((acc, curr) => acc + curr.balance, 0);

  const now = new Date();
  const currentMonthTx = transactions.filter((t) => {
    const date = new Date(t.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const monthlyIncome = currentMonthTx
    .filter((t) => t.type === 'ingreso')
    .reduce((acc, curr) => acc + curr.amount, 0);
  const monthlyExpenses = currentMonthTx
    .filter((t) => t.type === 'gasto')
    .reduce((acc, curr) => acc + curr.amount, 0);

  // --- CÁLCULOS DE COMPRAS ---
  const pendingItems = items.filter((i) => !i.bought && !i.wishlist);
  const totalPendingValue = pendingItems.reduce((acc, curr) => acc + curr.price, 0);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="mx-auto w-full max-w-5xl pt-6 pb-10">
      <header className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-ink">{greeting} 👋</h2>
        <p className="mt-2 text-lg text-muted">¿Qué querés gestionar hoy en Depa?</p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* MIS FINANZAS */}
        <button
          type="button"
          onClick={() => setView('finance')}
          className="group relative flex flex-col items-start overflow-hidden rounded-[2rem] border border-line bg-surface p-8 text-left shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl"
        >
          <span className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-accent-soft opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70" />

          <span className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-on shadow-lg transition-transform duration-300 group-hover:scale-110">
            <Icon name="wallet" size={28} />
          </span>

          <span className="text-2xl font-bold text-ink">Mis Finanzas</span>
          <span className="mb-8 mt-1 text-sm text-muted">
            Cuentas, billeteras y flujo de movimientos.
          </span>

          <span className="mt-auto block w-full border-t border-line pt-5">
            <span className="flex items-end justify-between gap-3">
              <span>
                <span className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wider text-muted">
                  Saldo total
                </span>
                <span
                  className={`block text-3xl font-bold tabular-nums tracking-tight ${
                    totalBalance < 0 ? 'text-danger' : 'text-ink'
                  }`}
                >
                  {money(totalBalance)}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-xs font-bold text-low">+{money(monthlyIncome)}</span>
                <span className="block text-xs font-bold text-danger">
                  −{money(monthlyExpenses)}
                </span>
              </span>
            </span>
          </span>
        </button>

        {/* MIS COMPRAS */}
        <button
          type="button"
          onClick={() => setView('list')}
          className="group relative flex flex-col items-start overflow-hidden rounded-[2rem] border border-line bg-surface p-8 text-left shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-medium/40 hover:shadow-xl"
        >
          <span className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-medium-soft opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70" />

          <span className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-medium text-surface shadow-lg transition-transform duration-300 group-hover:scale-110">
            <Icon name="shopping-cart" size={28} />
          </span>

          <span className="text-2xl font-bold text-ink">Mis Compras</span>
          <span className="mb-8 mt-1 text-sm text-muted">
            Presupuesto, cuotas y planificación de artículos.
          </span>

          <span className="mt-auto block w-full border-t border-line pt-5">
            <span className="flex items-end justify-between gap-3">
              <span>
                <span className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wider text-muted">
                  Pendientes
                </span>
                <span className="block text-3xl font-bold tabular-nums tracking-tight text-ink">
                  {pendingItems.length}{' '}
                  <span className="text-lg font-normal text-muted">artículos</span>
                </span>
              </span>
              <span className="text-right">
                <span className="mb-1 block text-xs font-bold text-muted">Valor estimado</span>
                <span className="block text-sm font-bold text-ink">{money(totalPendingValue)}</span>
              </span>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
