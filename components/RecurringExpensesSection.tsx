'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useFinance, usePrefs } from '@/state/AppProvider';
import {
  analyzeRecurringExpenseStatus,
  money,
  moneyWithCurrency,
  parsePrice,
  toArs,
  RECURRING_CATEGORIES,
} from '@/lib/utils';
import type {
  Currency,
  RecurringExpense,
  RecurringExpenseState,
  RecurringFrequency,
} from '@/lib/types';
import { CURRENCY_OPTIONS } from '@/lib/config';
import { Icon } from './Icon';

// ==========================================
// GASTOS FIJOS Y SERVICIOS DEL HOGAR
// ==========================================

const INPUT_CLASS =
  'w-full min-h-[44px] px-3 rounded-xl border border-line-strong bg-surface text-[0.95rem] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 transition-colors';

const TEXTAREA_CLASS =
  'w-full min-h-[70px] px-3 py-2.5 rounded-xl border border-line-strong bg-surface text-[0.95rem] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 transition-colors resize-y';

const LABEL_CLASS = 'text-xs font-bold uppercase tracking-wider text-muted';

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'anual', label: 'Anual' },
];

const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  anual: 'Anual',
};

/** Etiqueta y clases por estado. Strings completos: Tailwind no acepta interpolación. */
const STATE_META: Record<RecurringExpenseState, { chip: string; label: string }> = {
  paid: { chip: 'bg-low-soft text-low', label: 'Pagado este mes' },
  overdue: { chip: 'bg-danger-soft text-danger', label: 'Vencido' },
  'due-soon': { chip: 'bg-medium-soft text-medium', label: 'Por vencer' },
  upcoming: { chip: 'bg-surface-3 text-muted', label: 'Pendiente' },
  paused: { chip: 'bg-surface-3 text-muted', label: 'Pausado' },
};

/** Orden de la grilla: primero lo urgente, al final lo pagado/pausado. */
const STATE_RANK: Record<RecurringExpenseState, number> = {
  overdue: 0,
  'due-soon': 1,
  upcoming: 2,
  paid: 3,
  paused: 4,
};

function statusLabel(expense: RecurringExpense, status: ReturnType<typeof analyzeRecurringExpenseStatus>): string {
  if (!expense.active) return 'Pausado';
  if (!status.appliesThisMonth) return 'No vence este mes';
  if (status.isPaidThisMonth) return 'Pagado este mes';
  if (status.daysUntilDue === null) return 'Pendiente';
  if (status.daysUntilDue < 0) return `Vencido hace ${Math.abs(status.daysUntilDue)} d`;
  if (status.daysUntilDue === 0) return 'Vence hoy';
  return `Vence en ${status.daysUntilDue} d`;
}

export function RecurringExpensesSection() {
  const {
    accounts,
    recurringExpenses,
    addRecurringExpense,
    updateRecurringExpense,
    deleteRecurringExpense,
    payRecurringExpense,
  } = useFinance();
  const { prefs } = usePrefs();
  const usdRate = prefs.usdRate;

  // ----- FORMULARIO -----
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Servicios');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('ARS');
  const [taxPercent, setTaxPercent] = useState('');
  const [dueDay, setDueDay] = useState('10');
  const [frequency, setFrequency] = useState<RecurringFrequency>('mensual');
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [formError, setFormError] = useState('');

  // ----- PAGO -----
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payError, setPayError] = useState('');

  // ----- ELIMINACIÓN EN 2 PASOS -----
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const decorated = useMemo(
    () =>
      recurringExpenses
        .map((expense) => ({
          expense,
          status: analyzeRecurringExpenseStatus(expense),
        }))
        .sort((a, b) => {
          // Lo que no cae este mes cierra la lista: no es urgente, pero sigue visible.
          const rankOf = (row: typeof a) =>
            row.status.appliesThisMonth ? STATE_RANK[row.status.state] : 6;

          const rank = rankOf(a) - rankOf(b);
          if (rank !== 0) return rank;
          if (a.status.daysUntilDue !== b.status.daysUntilDue) {
            return (a.status.daysUntilDue ?? 999) - (b.status.daysUntilDue ?? 999);
          }
          return a.expense.name.localeCompare(b.expense.name);
        }),
    [recurringExpenses],
  );

  const totals = useMemo(() => {
    let fixed = 0;
    let pending = 0;
    let paid = 0;

    for (const row of decorated) {
      if (!row.expense.active || !row.status.appliesThisMonth) continue;

      // El consolidado del panel se expresa en pesos: un servicio en USD suma
      // la cotización y las percepciones configuradas.
      const inArs = toArs(
        row.expense.amount,
        row.expense.currency ?? 'ARS',
        usdRate,
        row.expense.taxPercent ?? 0,
      );
      fixed += inArs;
      if (row.status.isPaidThisMonth) paid += inArs;
      else pending += inArs;
    }

    return { fixed, pending, paid };
  }, [decorated, usdRate]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCategory('Servicios');
    setAmount('');
    setCurrency('ARS');
    setTaxPercent('');
    setDueDay('10');
    setFrequency('mensual');
    setAccountId('');
    setNotes('');
    setActive(true);
    setFormError('');
  };

  const toggleForm = () => {
    if (isFormOpen) {
      setFormOpen(false);
      resetForm();
      return;
    }
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (expense: RecurringExpense) => {
    setEditingId(expense.id);
    setName(expense.name);
    setCategory(expense.category);
    setAmount(expense.amount > 0 ? String(expense.amount) : '');
    setCurrency(expense.currency ?? 'ARS');
    setTaxPercent(
      expense.currency === 'USD' && expense.taxPercent ? String(expense.taxPercent) : '',
    );
    setDueDay(String(expense.dueDay));
    setFrequency(expense.frequency);
    setAccountId(expense.accountId ?? '');
    setNotes(expense.notes);
    setActive(expense.active);
    setFormError('');
    setFormOpen(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Poné un nombre para el servicio.');
      return;
    }

    const parsedAmount = amount.trim() === '' ? 0 : parsePrice(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setFormError('El monto tiene que ser un número válido.');
      return;
    }

    const parsedDay = Number(dueDay);
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      setFormError('El día de vencimiento va del 1 al 31.');
      return;
    }

    const parsedTax = taxPercent.trim() === '' ? 0 : Number(taxPercent.replace(',', '.'));
    if (!Number.isFinite(parsedTax) || parsedTax < 0 || parsedTax > 200) {
      setFormError('El porcentaje de impuestos va del 0 al 200.');
      return;
    }

    const draft = {
      name: cleanName,
      category: category.trim() || 'Servicios',
      amount: parsedAmount,
      currency,
      // Los impuestos sólo tienen sentido en dólares: en pesos se guarda 0.
      taxPercent: currency === 'USD' ? parsedTax : 0,
      dueDay: parsedDay,
      frequency,
      accountId: accountId || null,
      active,
      lastPaidMonth: null,
      notes: notes.trim(),
    };

    const existing = editingId
      ? recurringExpenses.find((expense) => expense.id === editingId)
      : undefined;

    if (editingId && !existing) {
      setFormError('El servicio ya no existe.');
      return;
    }

    const saved = existing
      ? updateRecurringExpense({
          ...existing,
          ...draft,
          // Editar no puede "despagar" el mes ya registrado.
          lastPaidMonth: existing.lastPaidMonth,
        })
      : addRecurringExpense(draft);

    if (!saved) {
      setFormError('No se pudo guardar. El nombre no puede repetirse.');
      return;
    }

    setFormOpen(false);
    resetForm();
  };

  const openPayment = (expense: RecurringExpense) => {
    if (payingId === expense.id) {
      setPayingId(null);
      return;
    }

    setPayingId(expense.id);
    setPayAmount(expense.amount > 0 ? String(expense.amount) : '');
    setPayAccountId(expense.accountId ?? accounts[0]?.id ?? '');
    setPayError('');
    setConfirmDeleteId(null);
  };

  const handlePayment = (expense: RecurringExpense) => {
    const parsed = payAmount.trim() === '' ? expense.amount : parsePrice(payAmount);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPayError('Ingresá el monto real de la boleta.');
      return;
    }

    const done = payRecurringExpense(expense.id, payAccountId || null, parsed);
    if (!done) {
      setPayError('No se pudo registrar el pago.');
      return;
    }

    setPayingId(null);
    setPayAmount('');
    setPayError('');
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    deleteRecurringExpense(id);
    setConfirmDeleteId(null);
    if (editingId === id) {
      setFormOpen(false);
      resetForm();
    }
    if (payingId === id) setPayingId(null);
  };

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">Gastos fijos y servicios</h2>
          <p className="mt-1 text-xs text-muted">
            Alquiler, expensas, luz, internet. Se registran como gasto en un clic.
          </p>
        </div>

        <button
          type="button"
          onClick={toggleForm}
          className="inline-flex min-h-[42px] cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-5 py-2.5 text-xs font-bold text-surface transition-opacity hover:opacity-90"
        >
          <Icon name={isFormOpen ? 'cancel' : 'plus'} size={14} />
          {isFormOpen ? 'Cancelar' : 'Nuevo servicio'}
        </button>
      </div>

      {/* RESUMEN */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface-2/50 px-3 py-2">
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted">
            Fijo del mes
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">{money(totals.fixed)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2/50 px-3 py-2">
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted">
            Resta pagar
          </p>
          <p
            className={`mt-0.5 text-sm font-bold tabular-nums ${
              totals.pending > 0 ? 'text-medium' : 'text-low'
            }`}
          >
            {money(totals.pending)}
          </p>
        </div>
        <div className="col-span-2 rounded-2xl border border-line bg-surface-2/50 px-3 py-2 sm:col-span-1">
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted">
            Pagado este mes
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">{money(totals.paid)}</p>
        </div>
      </div>

      {/* FORMULARIO INLINE */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface-2/40 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
              {editingId ? 'Editar servicio' : 'Nuevo servicio'}
            </h3>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[0.7rem] font-semibold text-muted">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
                className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
              />
              Activo
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor="recurring-name" className={LABEL_CLASS}>
                Nombre
              </label>
              <input
                id="recurring-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Luz Edenor, Internet Fibra…"
                maxLength={60}
                className={INPUT_CLASS}
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor="recurring-category" className={LABEL_CLASS}>
                Categoría
              </label>
              <input
                id="recurring-category"
                type="text"
                list="recurring-categories"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Servicios"
                maxLength={40}
                className={INPUT_CLASS}
              />
              <datalist id="recurring-categories">
                {RECURRING_CATEGORIES.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>

            <div className="grid gap-1">
              <label htmlFor="recurring-amount" className={LABEL_CLASS}>
                Monto estimado
              </label>
              <div className="flex gap-2">
                <input
                  id="recurring-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0"
                  className={`${INPUT_CLASS} flex-1`}
                />
                <select
                  aria-label="Moneda del servicio"
                  value={currency}
                  onChange={(event) => {
                    const next = event.target.value as Currency;
                    setCurrency(next);
                    if (next !== 'USD') setTaxPercent('');
                  }}
                  className="min-h-[44px] w-28 shrink-0 cursor-pointer rounded-xl border border-line-strong bg-surface px-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.id}
                    </option>
                  ))}
                </select>
              </div>

              {currency === 'USD' && (
                <div className="mt-1 grid gap-1 rounded-xl border border-line bg-surface p-2.5">
                  <label htmlFor="recurring-tax" className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
                    % Impuestos y percepciones
                  </label>
                  <input
                    id="recurring-tax"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={200}
                    step={0.1}
                    value={taxPercent}
                    onChange={(event) => setTaxPercent(event.target.value)}
                    placeholder="Ej. 21, 30, 60"
                    className="w-full min-h-[38px] rounded-lg border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
                  />
                  <p className="text-[0.65rem] text-muted">
                    Estimado final:{' '}
                    <span className="font-bold tabular-nums text-ink">
                      {moneyWithCurrency(
                        toArs(
                          parsePrice(amount) || 0,
                          'USD',
                          usdRate,
                          Number(taxPercent.replace(',', '.')) || 0,
                        ),
                        'ARS',
                      )}
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <label htmlFor="recurring-due-day" className={LABEL_CLASS}>
                  Vence día
                </label>
                <input
                  id="recurring-due-day"
                  type="number"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(event) => setDueDay(event.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid gap-1">
                <label htmlFor="recurring-frequency" className={LABEL_CLASS}>
                  Frecuencia
                </label>
                <select
                  id="recurring-frequency"
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}
                  className={INPUT_CLASS}
                >
                  {FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-1 sm:col-span-2">
              <label htmlFor="recurring-account" className={LABEL_CLASS}>
                Cuenta sugerida (opcional)
              </label>
              <select
                id="recurring-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Sin cuenta (sólo recordatorio)</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ·{' '}
                    {moneyWithCurrency(account.balance, account.currency ?? 'ARS')}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1 sm:col-span-2">
              <label htmlFor="recurring-notes" className={LABEL_CLASS}>
                Notas
              </label>
              <textarea
                id="recurring-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Nº de cliente, alias de pago…"
                maxLength={200}
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-[0.7rem] font-semibold text-danger">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="inline-flex min-h-[42px] cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 text-xs font-bold text-accent-on transition-opacity hover:opacity-90"
            >
              <Icon name="check" size={14} />
              {editingId ? 'Guardar cambios' : 'Crear servicio'}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="inline-flex min-h-[42px] cursor-pointer items-center rounded-xl border border-line px-5 py-2.5 text-xs font-bold text-muted transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* GRILLA DE SERVICIOS */}
      {decorated.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-line px-4 py-8 text-center">
          <p className="text-xs font-semibold text-ink">Todavía no cargaste servicios.</p>
          <p className="mt-1 text-[0.7rem] text-muted">
            Sumá alquiler, expensas o servicios para no olvidarte de pagarlos.
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {decorated.map(({ expense, status }) => {
            const meta = STATE_META[status.state];
            const account = accounts.find((a) => a.id === expense.accountId) ?? null;
            const isPaying = payingId === expense.id;
            const canPay = expense.active && status.appliesThisMonth && !status.isPaidThisMonth;

            return (
              <li
                key={expense.id}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/40 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{expense.name}</p>
                    <p className="text-[0.68rem] text-muted">
                      {expense.category} · Vence día {expense.dueDay}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-bold ${
                      status.appliesThisMonth ? meta.chip : 'bg-surface-3 text-muted'
                    }`}
                  >
                    {statusLabel(expense, status)}
                  </span>
                </div>

                <div>
                  <p className="text-base font-bold tabular-nums text-ink">
                    {moneyWithCurrency(expense.amount, expense.currency ?? 'ARS')}
                  </p>
                  {(expense.currency ?? 'ARS') === 'USD' && (
                    <p className="text-[0.68rem] font-semibold tabular-nums text-muted">
                      ≈{' '}
                      {moneyWithCurrency(
                        toArs(
                          expense.amount,
                          'USD',
                          usdRate,
                          expense.taxPercent ?? 0,
                        ),
                        'ARS',
                      )}
                      {(expense.taxPercent ?? 0) > 0 && (
                        <span className="font-normal"> (con {expense.taxPercent}% imp.)</span>
                      )}
                    </p>
                  )}
                  <p className="text-[0.62rem] text-muted">
                    {FREQUENCY_LABEL[expense.frequency]}
                    {account ? ` · ${account.name}` : ' · sin cuenta'}
                  </p>
                </div>

                {expense.notes && (
                  <p className="text-[0.68rem] leading-snug text-muted line-clamp-2">
                    {expense.notes}
                  </p>
                )}

                {isPaying && (
                  <div className="grid gap-2 rounded-xl border border-line bg-surface p-3">
                    <div className="grid gap-1">
                      <label
                        htmlFor={`pay-amount-${expense.id}`}
                        className="text-[0.62rem] font-bold uppercase tracking-wider text-muted"
                      >
                        Monto real de la boleta
                      </label>
                      <input
                        id={`pay-amount-${expense.id}`}
                        type="text"
                        inputMode="decimal"
                        value={payAmount}
                        onChange={(event) => setPayAmount(event.target.value)}
                        className="w-full min-h-[38px] px-2.5 rounded-lg border border-line-strong bg-surface text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
                      />
                      <p className="text-[0.65rem] text-muted">
                        Monto en {expense.currency === 'USD' ? 'US$' : '$'}.
                        {(expense.currency ?? 'ARS') === 'USD'
                          ? ' Si la cuenta es en pesos, se suma la cotización y los impuestos.'
                          : ' Se debita en la moneda de la cuenta.'}
                      </p>
                    </div>

                    <div className="grid gap-1">
                      <label
                        htmlFor={`pay-account-${expense.id}`}
                        className="text-[0.62rem] font-bold uppercase tracking-wider text-muted"
                      >
                        Cuenta
                      </label>
                      <select
                        id={`pay-account-${expense.id}`}
                        value={payAccountId}
                        onChange={(event) => setPayAccountId(event.target.value)}
                        className="w-full min-h-[38px] px-2.5 rounded-lg border border-line-strong bg-surface text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
                      >
                        <option value="">Sin cuenta (sólo recordatorio)</option>
                        {accounts.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} ·{' '}
                            {moneyWithCurrency(option.balance, option.currency ?? 'ARS')}
                          </option>
                        ))}
                      </select>
                    </div>

                    {payError && (
                      <p role="alert" className="text-[0.68rem] font-semibold text-danger">
                        {payError}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePayment(expense)}
                        className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg bg-accent px-3 text-[0.7rem] font-bold text-accent-on transition-opacity hover:opacity-90"
                      >
                        <Icon name="check" size={12} />
                        Confirmar pago
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayingId(null)}
                        className="inline-flex min-h-[36px] cursor-pointer items-center rounded-lg border border-line px-3 text-[0.7rem] font-bold text-muted transition-colors hover:text-ink"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  {status.isPaidThisMonth ? (
                    <span className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-low-soft px-3 text-[0.7rem] font-bold text-low">
                      <Icon name="check" size={12} />
                      Pagado
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openPayment(expense)}
                      disabled={!canPay}
                      className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg bg-ink px-3 text-[0.7rem] font-bold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon name="wallet" size={12} />
                      Registrar pago
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      updateRecurringExpense({ ...expense, active: !expense.active })
                    }
                    className="inline-flex min-h-[36px] cursor-pointer items-center rounded-lg border border-line px-2.5 text-[0.7rem] font-semibold text-muted transition-colors hover:text-ink"
                  >
                    {expense.active ? 'Pausar' : 'Reanudar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => openEdit(expense)}
                    aria-label={`Editar ${expense.name}`}
                    className="inline-flex min-h-[36px] w-9 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-ink"
                  >
                    <Icon name="edit" size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(expense.id)}
                    aria-label={
                      confirmDeleteId === expense.id
                        ? `Confirmar eliminación de ${expense.name}`
                        : `Eliminar ${expense.name}`
                    }
                    className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg border px-2.5 text-[0.7rem] font-semibold transition-colors ${
                      confirmDeleteId === expense.id
                        ? 'border-danger/40 bg-danger-soft text-danger'
                        : 'border-line text-muted hover:text-danger'
                    }`}
                  >
                    <Icon name="delete" size={13} />
                    {confirmDeleteId === expense.id && 'Confirmar'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-[0.7rem] text-muted">
        Los servicios bimestrales y anuales cuentan sólo en los meses que les toca, según la
        fecha de alta. El pago registra un gasto con el monto real de la boleta.
      </p>
    </div>
  );
}
