'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useFinance, usePrefs } from '@/state/AppProvider';
import { money, moneyWithCurrency, parsePrice, roundMoney, toArs } from '@/lib/utils';
import type { Currency, Debt, Priority } from '@/lib/types';
import { CURRENCY_OPTIONS, PRIORITIES, PRIORITY } from '@/lib/config';
import { Icon } from './Icon';

// ==========================================
// DEUDAS Y COMPROMISOS CON PAGOS PARCIALES
// ==========================================

const INPUT_CLASS =
  'w-full min-h-[44px] px-3 rounded-xl border border-line-strong bg-surface text-[0.95rem] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 transition-colors';

const TEXTAREA_CLASS =
  'w-full min-h-[70px] px-3 py-2.5 rounded-xl border border-line-strong bg-surface text-[0.95rem] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 transition-colors resize-y';

const LABEL_CLASS = 'text-xs font-bold uppercase tracking-wider text-muted';

const SMALL_INPUT_CLASS =
  'w-full min-h-[38px] px-2.5 rounded-lg border border-line-strong bg-surface text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20';

type DebtFilter = 'pendientes' | 'saldadas' | 'todas';

const FILTER_OPTIONS: { id: DebtFilter; label: string }[] = [
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'saldadas', label: 'Saldadas' },
  { id: 'todas', label: 'Todas' },
];

/** Strings completos: Tailwind no acepta clases interpoladas. */
const PRIORITY_CHIP: Record<Priority, string> = {
  urgente: 'bg-urgent-soft text-urgent',
  alta: 'bg-high-soft text-high',
  media: 'bg-medium-soft text-medium',
  baja: 'bg-surface-3 text-muted',
};

const remainingOf = (debt: Debt) => roundMoney(debt.totalAmount - debt.paidAmount);

const isSettled = (debt: Debt) => remainingOf(debt) <= 0;

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'; 'YYYY-MM' → 'MM/YYYY'. */
function formatDueDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-');
  if (!year || !month) return null;
  return day ? `${day}/${month}/${year}` : `${month}/${year}`;
}

export function DebtsSection() {
  const {
    accounts,
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
    payDebtInstallment,
  } = useFinance();
  const { prefs } = usePrefs();
  const usdRate = prefs.usdRate;

  // ----- FILTRO -----
  const [filter, setFilter] = useState<DebtFilter>('pendientes');

  // ----- FORMULARIO -----
  const [isFormOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [creditor, setCreditor] = useState('');
  const [currency, setCurrency] = useState<Currency>('ARS');
  const [totalAmount, setTotalAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [dueMonth, setDueMonth] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [priority, setPriority] = useState<Priority>('media');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // ----- ABONO -----
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payError, setPayError] = useState('');

  // ----- ELIMINACIÓN EN 2 PASOS -----
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const totals = useMemo(() => {
    let pending = 0;
    let paid = 0;
    let active = 0;

    for (const debt of debts) {
      const remaining = remainingOf(debt);
      paid += toArs(debt.paidAmount, debt.currency ?? 'ARS', usdRate);
      if (remaining > 0) {
        pending += toArs(remaining, debt.currency ?? 'ARS', usdRate);
        active += 1;
      }
    }

    return { pending, paid, active };
  }, [debts, usdRate]);

  const decorated = useMemo(() => {
    const filtered = debts.filter((debt) => {
      if (filter === 'pendientes') return !isSettled(debt);
      if (filter === 'saldadas') return isSettled(debt);
      return true;
    });

    return filtered.sort((a, b) => {
      // Primero lo urgente; a igual prioridad, lo que vence antes.
      const rankA = PRIORITY.get(a.priority)?.rank ?? 99;
      const rankB = PRIORITY.get(b.priority)?.rank ?? 99;
      if (rankA !== rankB) return rankA - rankB;

      const dueA = a.dueDate ?? '9999-99-99';
      const dueB = b.dueDate ?? '9999-99-99';
      if (dueA !== dueB) return dueA.localeCompare(dueB);

      return b.createdAt - a.createdAt;
    });
  }, [debts, filter]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setCreditor('');
    setCurrency('ARS');
    setTotalAmount('');
    setPaidAmount('');
    setDueMonth('');
    setDueDay('');
    setPriority('media');
    setNotes('');
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

  const openEdit = (debt: Debt) => {
    setEditingId(debt.id);
    setTitle(debt.title);
    setCreditor(debt.creditor);
    setCurrency(debt.currency ?? 'ARS');
    setTotalAmount(debt.totalAmount > 0 ? String(debt.totalAmount) : '');
    setPaidAmount(debt.paidAmount > 0 ? String(debt.paidAmount) : '');
    setDueMonth(debt.dueDate ? debt.dueDate.slice(0, 7) : '');
    setDueDay(debt.dueDate && debt.dueDate.length === 10 ? debt.dueDate.slice(8, 10) : '');
    setPriority(debt.priority);
    setNotes(debt.notes);
    setFormError('');
    setFormOpen(true);
    setPayingId(null);
    setConfirmDeleteId(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError('Poné un concepto para la deuda.');
      return;
    }

    const parsedTotal = parsePrice(totalAmount);
    if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) {
      setFormError('El monto total tiene que ser mayor a cero.');
      return;
    }

    const parsedPaid = paidAmount.trim() === '' ? 0 : parsePrice(paidAmount);
    if (!Number.isFinite(parsedPaid) || parsedPaid < 0) {
      setFormError('Lo ya abonado tiene que ser un número válido.');
      return;
    }

    if (parsedPaid > parsedTotal) {
      setFormError('Lo ya abonado no puede superar el monto total.');
      return;
    }

    let parsedDay: number | null = null;
    if (dueDay.trim() !== '') {
      parsedDay = Number(dueDay);
      if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
        setFormError('El día de la fecha límite va del 1 al 31.');
        return;
      }
    }

    if (parsedDay !== null && dueMonth.trim() === '') {
      setFormError('Elegí el mes antes de indicar un día.');
      return;
    }

    const composedDue = dueMonth
      ? parsedDay !== null
        ? `${dueMonth}-${String(parsedDay).padStart(2, '0')}`
        : dueMonth
      : null;

    const draft = {
      title: cleanTitle,
      creditor: creditor.trim(),
      totalAmount: parsedTotal,
      paidAmount: parsedPaid,
      currency,
      dueDate: composedDue,
      priority,
      notes: notes.trim(),
    };

    const existing = editingId ? debts.find((debt) => debt.id === editingId) : undefined;
    if (editingId && !existing) {
      setFormError('La deuda ya no existe.');
      return;
    }

    const saved = existing
      ? updateDebt({ ...existing, ...draft })
      : addDebt(draft);

    if (!saved) {
      setFormError('No se pudo guardar la deuda. Revisá los datos.');
      return;
    }

    setFormOpen(false);
    resetForm();
  };

  const openPayment = (debt: Debt) => {
    if (payingId === debt.id) {
      setPayingId(null);
      return;
    }

    const remaining = remainingOf(debt);
    setPayingId(debt.id);
    setPayAmount(remaining > 0 ? String(remaining) : '');
    setPayAccountId(accounts[0]?.id ?? '');
    setPayError('');
    setConfirmDeleteId(null);
  };

  const fillHalf = (debt: Debt) => {
    const half = roundMoney(remainingOf(debt) / 2);
    setPayAmount(half > 0 ? String(half) : '');
    setPayError('');
  };

  const handlePayment = (debt: Debt) => {
    const parsed = parsePrice(payAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPayError('Ingresá un monto mayor a cero.');
      return;
    }

    const done = payDebtInstallment(debt.id, parsed, payAccountId || null);
    if (!done) {
      setPayError('No se pudo registrar el abono.');
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

    deleteDebt(id);
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
          <h2 className="text-sm font-bold text-ink">Deudas y compromisos</h2>
          <p className="mt-1 text-xs text-muted">
            Préstamos y compromisos con pagos parciales: registrá cada abono y seguí el saldo.
          </p>
        </div>

        <button
          type="button"
          onClick={toggleForm}
          className="inline-flex min-h-[42px] cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-5 py-2.5 text-xs font-bold text-surface transition-opacity hover:opacity-90"
        >
          <Icon name={isFormOpen ? 'cancel' : 'plus'} size={14} />
          {isFormOpen ? 'Cancelar' : 'Nueva deuda'}
        </button>
      </div>

      {/* RESUMEN CONSOLIDADO EN ARS */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface-2/50 px-3 py-2">
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted">
            Total pendiente
          </p>
          <p
            className={`mt-0.5 text-sm font-bold tabular-nums ${
              totals.pending > 0 ? 'text-danger' : 'text-low'
            }`}
          >
            {money(totals.pending)}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2/50 px-3 py-2">
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted">
            Deudas activas
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">{totals.active}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-line bg-surface-2/50 px-3 py-2 sm:col-span-1">
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted">
            Ya abonado
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">{money(totals.paid)}</p>
        </div>
      </div>

      {/* FILTRO RÁPIDO */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {FILTER_OPTIONS.map((option) => {
          const isActive = filter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={isActive}
              className={`inline-flex min-h-[34px] cursor-pointer items-center rounded-full border px-3 text-[0.7rem] font-bold transition-colors ${
                isActive
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* FORMULARIO INLINE */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface-2/40 p-4"
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
            {editingId ? 'Editar deuda' : 'Nueva deuda'}
          </h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor="debt-title" className={LABEL_CLASS}>
                Concepto
              </label>
              <input
                id="debt-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Depósito alquiler, mochila…"
                maxLength={60}
                className={INPUT_CLASS}
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor="debt-creditor" className={LABEL_CLASS}>
                Acreedor
              </label>
              <input
                id="debt-creditor"
                type="text"
                value={creditor}
                onChange={(event) => setCreditor(event.target.value)}
                placeholder="Silvana, Inmobiliaria…"
                maxLength={60}
                className={INPUT_CLASS}
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor="debt-total" className={LABEL_CLASS}>
                Monto total
              </label>
              <div className="flex gap-2">
                <input
                  id="debt-total"
                  type="text"
                  inputMode="decimal"
                  value={totalAmount}
                  onChange={(event) => setTotalAmount(event.target.value)}
                  placeholder="0"
                  className={`${INPUT_CLASS} flex-1`}
                />
                <select
                  aria-label="Moneda de la deuda"
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value as Currency)}
                  className="min-h-[44px] w-28 shrink-0 cursor-pointer rounded-xl border border-line-strong bg-surface px-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-1">
              <label htmlFor="debt-paid" className={LABEL_CLASS}>
                Ya abonado
              </label>
              <input
                id="debt-paid"
                type="text"
                inputMode="decimal"
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                placeholder="0"
                className={INPUT_CLASS}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <label htmlFor="debt-month" className={LABEL_CLASS}>
                  Mes estimado
                </label>
                <input
                  id="debt-month"
                  type="month"
                  value={dueMonth}
                  onChange={(event) => {
                    setDueMonth(event.target.value);
                    if (!event.target.value) setDueDay('');
                  }}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid gap-1">
                <label htmlFor="debt-day" className={LABEL_CLASS}>
                  Día (opcional)
                </label>
                <input
                  id="debt-day"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={dueDay}
                  onChange={(event) => setDueDay(event.target.value)}
                  placeholder="—"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="grid gap-1">
              <label htmlFor="debt-priority" className={LABEL_CLASS}>
                Prioridad
              </label>
              <select
                id="debt-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
                className={INPUT_CLASS}
              >
                {PRIORITIES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1 sm:col-span-2">
              <label htmlFor="debt-notes" className={LABEL_CLASS}>
                Notas
              </label>
              <textarea
                id="debt-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Acuerdo de pago, alias, cuotas pactadas…"
                maxLength={250}
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
              {editingId ? 'Guardar cambios' : 'Crear deuda'}
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

      {/* GRILLA DE DEUDAS */}
      {decorated.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-line px-4 py-8 text-center">
          <p className="text-xs font-semibold text-ink">
            {debts.length === 0
              ? 'Todavía no cargaste deudas.'
              : filter === 'pendientes'
                ? 'No tenés deudas pendientes.'
                : 'No hay deudas en este filtro.'}
          </p>
          <p className="mt-1 text-[0.7rem] text-muted">
            {debts.length === 0
              ? 'Sumá préstamos o compromisos para seguir cada abono.'
              : 'Probá con otro filtro para ver el resto.'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {decorated.map((debt) => {
            const remaining = remainingOf(debt);
            const settled = remaining <= 0;
            const pct = debt.totalAmount > 0
              ? Math.min(100, Math.max(0, (debt.paidAmount / debt.totalAmount) * 100))
              : 0;
            const dueLabel = formatDueDate(debt.dueDate);
            const isPaying = payingId === debt.id;

            return (
              <li
                key={debt.id}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/40 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{debt.title}</p>
                    {debt.creditor ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[0.62rem] font-semibold text-muted">
                        <Icon name="wallet" size={10} />
                        {debt.creditor}
                      </span>
                    ) : (
                      <span className="mt-1 inline-flex items-center rounded-full bg-surface-3 px-2 py-0.5 text-[0.62rem] font-semibold text-muted">
                        Sin acreedor
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.62rem] font-bold ${PRIORITY_CHIP[debt.priority]}`}
                    >
                      {PRIORITY.get(debt.priority)?.label ?? debt.priority}
                    </span>
                    {settled && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-low-soft px-2 py-0.5 text-[0.62rem] font-bold text-low">
                        <Icon name="check" size={10} />
                        Saldada
                      </span>
                    )}
                  </div>
                </div>

                {dueLabel && (
                  <p className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-muted">
                    <Icon name="calendar" size={11} />
                    Vence {dueLabel}
                  </p>
                )}

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-base font-bold tabular-nums text-ink">
                      {moneyWithCurrency(debt.totalAmount, debt.currency ?? 'ARS')}
                    </p>
                    {(debt.currency ?? 'ARS') === 'USD' && (
                      <p className="text-[0.65rem] font-semibold tabular-nums text-muted">
                        ≈ {money(toArs(debt.totalAmount, 'USD', usdRate))}
                      </p>
                    )}
                  </div>

                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full rounded-full transition-[width] ${settled ? 'bg-low' : 'bg-accent'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[0.68rem]">
                    <span className="text-muted">
                      Pagado:{' '}
                      <span className="font-semibold tabular-nums text-ink">
                        {moneyWithCurrency(debt.paidAmount, debt.currency ?? 'ARS')}
                      </span>
                    </span>
                    <span className="text-muted">
                      {settled ? 'Sin saldo' : 'Resta pagar:'}{' '}
                      <span
                        className={`font-bold tabular-nums ${settled ? 'text-low' : 'text-danger'}`}
                      >
                        {moneyWithCurrency(remaining, debt.currency ?? 'ARS')}
                      </span>
                    </span>
                  </div>
                </div>

                {debt.notes && (
                  <p className="text-[0.68rem] leading-snug text-muted line-clamp-2">
                    {debt.notes}
                  </p>
                )}

                {isPaying && !settled && (
                  <div className="grid gap-2 rounded-xl border border-line bg-surface p-3">
                    <div className="grid gap-1">
                      <label
                        htmlFor={`debt-pay-amount-${debt.id}`}
                        className="text-[0.62rem] font-bold uppercase tracking-wider text-muted"
                      >
                        Monto a abonar
                      </label>
                      <input
                        id={`debt-pay-amount-${debt.id}`}
                        type="text"
                        inputMode="decimal"
                        value={payAmount}
                        onChange={(event) => setPayAmount(event.target.value)}
                        className={SMALL_INPUT_CLASS}
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => fillHalf(debt)}
                          className="inline-flex min-h-[30px] cursor-pointer items-center rounded-full border border-line bg-surface-2 px-2.5 text-[0.65rem] font-bold text-ink transition-colors hover:border-accent hover:text-accent-ink"
                        >
                          50% mitad
                        </button>
                        <span className="text-[0.62rem] text-muted">
                          Monto en {debt.currency === 'USD' ? 'US$' : '$'}.
                          {debt.currency === 'USD'
                            ? ' Si la cuenta es en pesos, se convierte con la cotización.'
                            : ' Se debita en la moneda de la cuenta.'}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-1">
                      <label
                        htmlFor={`debt-pay-account-${debt.id}`}
                        className="text-[0.62rem] font-bold uppercase tracking-wider text-muted"
                      >
                        Cuenta de origen
                      </label>
                      <select
                        id={`debt-pay-account-${debt.id}`}
                        value={payAccountId}
                        onChange={(event) => setPayAccountId(event.target.value)}
                        className={SMALL_INPUT_CLASS}
                      >
                        <option value="">Sin cuenta — sólo descontar deuda</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} ·{' '}
                            {moneyWithCurrency(account.balance, account.currency ?? 'ARS')}
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
                        onClick={() => handlePayment(debt)}
                        className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg bg-accent px-3 text-[0.7rem] font-bold text-accent-on transition-opacity hover:opacity-90"
                      >
                        <Icon name="check" size={12} />
                        Confirmar abono
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
                  {settled ? (
                    <span className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-low-soft px-3 text-[0.7rem] font-bold text-low">
                      <Icon name="check" size={12} />
                      Saldada
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openPayment(debt)}
                      className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg bg-ink px-3 text-[0.7rem] font-bold text-surface transition-opacity hover:opacity-90"
                    >
                      <Icon name="wallet" size={12} />
                      Registrar pago / abono
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEdit(debt)}
                    aria-label={`Editar ${debt.title}`}
                    className="inline-flex min-h-[36px] w-9 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-ink"
                  >
                    <Icon name="edit" size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(debt.id)}
                    aria-label={
                      confirmDeleteId === debt.id
                        ? `Confirmar eliminación de ${debt.title}`
                        : `Eliminar ${debt.title}`
                    }
                    className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-lg border px-2.5 text-[0.7rem] font-semibold transition-colors ${
                      confirmDeleteId === debt.id
                        ? 'border-danger/40 bg-danger-soft text-danger'
                        : 'border-line text-muted hover:text-danger'
                    }`}
                  >
                    <Icon name="delete" size={13} />
                    {confirmDeleteId === debt.id ? 'Confirmar' : ''}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
