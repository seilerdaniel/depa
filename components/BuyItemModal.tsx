'use client';

import { useEffect, useRef, useState } from 'react';
import { useData, useFinance, useUI } from '@/state/AppProvider';
import { money } from '@/lib/utils';
import type { AccountType } from '@/lib/types';
import { Icon } from './Icon';

const ACCOUNT_LABEL: Record<AccountType, string> = {
  banco: 'Banco',
  billetera: 'Billetera virtual',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta de crédito',
};

const ACCOUNT_ICON: Record<AccountType, string> = {
  banco: 'bank',
  billetera: 'wallet',
  efectivo: 'finance',
  tarjeta: 'finance',
};

/**
 * Se abre al marcar un artículo como comprado cuando existen cuentas.
 * Confirmar con una cuenta crea el gasto en el mismo dispatch del reducer.
 */
export function BuyItemModal() {
  const { items, toggleBought } = useData();
  const { accounts } = useFinance();
  const { buyPromptItemId, setBuyPromptItemId } = useUI();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  const item = buyPromptItemId
    ? items.find((candidate) => candidate.id === buyPromptItemId)
    : undefined;

  useEffect(() => {
    if (buyPromptItemId) setSelectedAccountId(null);
  }, [buyPromptItemId]);

  // Al abrir, el foco entra al modal: primero la cuenta, o el diálogo si no hay.
  useEffect(() => {
    if (!buyPromptItemId) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const firstOption = dialog.querySelector<HTMLElement>('[role="radio"]');
    (firstOption ?? dialog).focus();
  }, [buyPromptItemId]);

  useEffect(() => {
    if (!buyPromptItemId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBuyPromptItemId(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [buyPromptItemId, setBuyPromptItemId]);

  if (!buyPromptItemId || !item) return null;

  const installmentAmount =
    item.installments && item.installments.count > 0 && item.installments.amount > 0
      ? item.installments.amount
      : null;

  const confirm = () => {
    toggleBought(item.id, true, selectedAccountId);
    setBuyPromptItemId(null);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => setBuyPromptItemId(null)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="buy-prompt-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl outline-none animate-in zoom-in-95 duration-200"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <h2 id="buy-prompt-title" className="text-lg font-bold text-ink">
              ¿Con qué medio de pago lo compraste?
            </h2>
            <p className="mt-1 truncate text-sm text-muted">
              {item.name} · <span className="font-semibold text-ink">{money(item.price)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBuyPromptItemId(null)}
            aria-label="Cerrar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <Icon name="cancel" size={18} />
          </button>
        </header>

        <div className="grid gap-2 overflow-y-auto p-5">
          <div role="radiogroup" aria-label="Medio de pago" className="grid gap-2">
            {accounts.map((account) => {
              const selected = selectedAccountId === account.id;

              return (
                <button
                  key={account.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                    selected
                      ? 'border-accent bg-accent-soft'
                      : 'border-line bg-surface-2 hover:border-line-strong'
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                      selected ? 'bg-surface text-accent' : 'bg-surface text-muted'
                    }`}
                  >
                    <Icon name={ACCOUNT_ICON[account.type]} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{account.name}</span>
                    <span className="block text-[0.7rem] uppercase tracking-wider text-muted">
                      {ACCOUNT_LABEL[account.type]}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-sm font-bold tabular-nums ${
                      account.balance < 0 ? 'text-danger' : 'text-ink'
                    }`}
                  >
                    {money(account.balance)}
                  </span>
                  {selected && <Icon name="check" size={16} className="shrink-0 text-accent" />}
                </button>
              );
            })}

            <button
              type="button"
              role="radio"
              aria-checked={selectedAccountId === null}
              onClick={() => setSelectedAccountId(null)}
              className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                selectedAccountId === null
                  ? 'border-accent bg-accent-soft'
                  : 'border-line bg-surface-2 hover:border-line-strong'
              }`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-muted">
                <Icon name="archive" size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">Sin registrar en finanzas</span>
                <span className="block text-[0.7rem] text-muted">
                  Sólo se marca como comprado.
                </span>
              </span>
            </button>
          </div>

          {selectedAccountId && installmentAmount !== null && (
            <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
              Se registrará la cuota mensual de{' '}
              <span className="font-bold text-ink">{money(installmentAmount)}</span>, no el precio
              total.
            </p>
          )}

          {selectedAccountId && (
            <p className="text-xs text-muted">
              Se descontará{' '}
              <span className="font-bold text-ink">
                {money(installmentAmount ?? item.price)}
              </span>{' '}
              del saldo y se creará un gasto vinculado a este artículo.
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line p-5">
          <button
            type="button"
            onClick={() => setBuyPromptItemId(null)}
            className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-accent-on transition-colors hover:bg-accent-ink"
          >
            <Icon name="check" size={16} />
            {selectedAccountId ? 'Marcar y registrar gasto' : 'Marcar como comprado'}
          </button>
        </footer>
      </div>
    </div>
  );
}
