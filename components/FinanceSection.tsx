'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useData, useFinance } from '@/state/AppProvider';
import {
  money, parsePrice, foldText, formatMonth, currentMonthKey,
  formatInstallmentProgress, getInstallmentStatus,
  type InstallmentStatus,
} from '@/lib/utils';
import type {
  Account, AccountType, Item, SavingsGoal, Transaction, TransactionType,
} from '@/lib/types';
import { Icon } from './Icon';

// ==========================================
// METADATOS DE PRESENTACIÓN
// ==========================================
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

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'banco', label: 'Banco' },
  { value: 'billetera', label: 'Billetera virtual' },
  { value: 'tarjeta', label: 'Tarjeta' },
];

const TX_OPTIONS: { value: TransactionType; label: string; icon: string }[] = [
  { value: 'gasto', label: 'Gasto', icon: 'arrow-down' },
  { value: 'ingreso', label: 'Ingreso', icon: 'arrow-up' },
  { value: 'transferencia', label: 'Transferencia', icon: 'chevron' },
];

const TX_META: Record<
  TransactionType,
  { symbol: string; chip: string; label: string; tone: string }
> = {
  ingreso: { symbol: '+', chip: 'bg-low-soft text-low', label: 'Ingreso', tone: 'text-low' },
  gasto: { symbol: '−', chip: 'bg-danger-soft text-danger', label: 'Gasto', tone: 'text-danger' },
  transferencia: {
    symbol: '⇄',
    chip: 'bg-high-soft text-high',
    label: 'Transferencia',
    tone: 'text-high',
  },
};

const COLOR_OPTIONS: { id: string; label: string; swatch: string }[] = [
  { id: 'accent', label: 'Verde', swatch: 'var(--accent)' },
  { id: 'low', label: 'Menta', swatch: 'var(--low)' },
  { id: 'medium', label: 'Ámbar', swatch: 'var(--medium)' },
  { id: 'high', label: 'Naranja', swatch: 'var(--high)' },
  { id: 'danger', label: 'Rojo', swatch: 'var(--danger)' },
];

const COLOR_VAR: Record<string, string> = {
  accent: 'var(--accent)',
  danger: 'var(--danger)',
  medium: 'var(--medium)',
  low: 'var(--low)',
  high: 'var(--high)',
};

const accentColor = (color: string): string =>
  color.startsWith('#') ? color : (COLOR_VAR[color] ?? COLOR_VAR.accent);

const FINANCE_CATEGORIES = [
  'Supermercado',
  'Alquiler',
  'Expensas',
  'Servicios',
  'Transporte',
  'Salud',
  'Ocio',
  'Educación',
  'Sueldo',
  'Freelance',
  'Ahorro',
  'Otros',
];

const INPUT_CLASS =
  'w-full min-h-[44px] px-3 rounded-xl border border-line-strong bg-surface text-[0.95rem] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 transition-colors';

const TEXTAREA_CLASS =
  'w-full min-h-[76px] px-3 py-2.5 rounded-xl border border-line-strong bg-surface text-[0.95rem] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 transition-colors resize-y';

const LABEL_CLASS = 'text-xs font-bold uppercase tracking-wider text-muted';

const budgetFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const formatAmount = (value: number) => budgetFormatter.format(value);

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const PAGE_SIZE = 20;

function monthKeyOf(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseDateInput(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return Date.now();
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}

function toDateInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseSignedAmount(raw: string): number {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith('-');
  const parsed = parsePrice(negative ? trimmed.slice(1) : trimmed);
  return negative ? -parsed : parsed;
}

function signedAmount(transaction: Transaction): string {
  if (transaction.type === 'ingreso') return `+${money(transaction.amount)}`;
  if (transaction.type === 'gasto') return `−${money(transaction.amount)}`;
  return money(transaction.amount);
}

interface SelectFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}

function SelectField({ id, value, onChange, disabled, children }: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={`${INPUT_CLASS} appearance-none pr-10 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {children}
      </select>
      <Icon
        name="chevron"
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

export function FinanceSection() {
  const { items, categories } = useData();
  const {
    accounts,
    transactions,
    savingsGoals,
    addAccount,
    updateAccount,
    deleteAccount,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    contributeToGoal,
  } = useFinance();

  // --- Cuentas ---
  const [isAccountFormOpen, setAccountFormOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountDraftName, setAccountDraftName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('efectivo');
  const [accountBalance, setAccountBalance] = useState('0');
  const [accountColor, setAccountColor] = useState('accent');
  const [accountError, setAccountError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // --- Movimientos ---
  const [txType, setTxType] = useState<TransactionType>('gasto');
  const [txAmount, setTxAmount] = useState('');
  const [txAccountId, setTxAccountId] = useState('');
  const [txDestinationId, setTxDestinationId] = useState('');
  const [txCategory, setTxCategory] = useState('');
  const [txDate, setTxDate] = useState(() => toDateInput(new Date()));
  const [txNotes, setTxNotes] = useState('');
  const [txLinkedItemId, setTxLinkedItemId] = useState('');
  const [txError, setTxError] = useState('');

  // --- Edición inline de movimientos ---
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editError, setEditError] = useState('');

  // --- Metas de ahorro ---
  const [isGoalFormOpen, setGoalFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalColor, setGoalColor] = useState('accent');
  const [goalError, setGoalError] = useState('');
  const [confirmGoalDeleteId, setConfirmGoalDeleteId] = useState<string | null>(null);

  const [contributingGoalId, setContributingGoalId] = useState<string | null>(null);
  const [contributionMode, setContributionMode] = useState<'aporte' | 'retiro'>('aporte');
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionAccountId, setContributionAccountId] = useState('');
  const [contributionError, setContributionError] = useState('');

  // --- Filtros del historial ---
  const [txFilterAccount, setTxFilterAccount] = useState('todas');
  const [txFilterType, setTxFilterType] = useState<'todos' | TransactionType>('todos');
  const [txFilterMonth, setTxFilterMonth] = useState('todos');
  const [txSearch, setTxSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // --- Cuota del mes ---
  const [installmentAccountId, setInstallmentAccountId] = useState('');

  const totalBalance = useMemo(
    () => accounts.reduce((sum, account) => sum + account.balance, 0),
    [accounts],
  );

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name] as const)),
    [accounts],
  );

  const itemNames = useMemo(
    () => new Map(items.map((item) => [item.id, item.name] as const)),
    [items],
  );

  const recentTransactions = useMemo(
    () => [...transactions].sort((a, b) => b.date - a.date),
    [transactions],
  );

  const categorySuggestions = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const category of [...categories, ...FINANCE_CATEGORIES]) {
      const key = category.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(category.trim());
    }
    return merged;
  }, [categories]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [items],
  );

  const monthKey = currentMonthKey();

  const txMonths = useMemo(() => {
    const months = new Set<string>();
    for (const transaction of transactions) months.add(monthKeyOf(transaction.date));
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const needle = foldText(txSearch.trim());

    return recentTransactions.filter((transaction) => {
      if (
        txFilterAccount !== 'todas' &&
        transaction.accountId !== txFilterAccount &&
        transaction.destinationAccountId !== txFilterAccount
      ) {
        return false;
      }

      if (txFilterType !== 'todos' && transaction.type !== txFilterType) return false;
      if (txFilterMonth !== 'todos' && monthKeyOf(transaction.date) !== txFilterMonth) return false;
      if (!needle) return true;

      const linked = transaction.linkedItemId ? itemNames.get(transaction.linkedItemId) : '';
      return (
        foldText(transaction.category).includes(needle) ||
        foldText(transaction.notes).includes(needle) ||
        foldText(linked).includes(needle)
      );
    });
  }, [recentTransactions, txFilterAccount, txFilterType, txFilterMonth, txSearch, itemNames]);

  const visibleTransactions = filteredTransactions.slice(0, visibleCount);

  const activeInstallments = useMemo(() => {
    const result: { item: Item; status: InstallmentStatus }[] = [];
    for (const item of items) {
      if (!item.bought || item.wishlist) continue;
      const status = getInstallmentStatus(item.installments, monthKey);
      if (status?.active && status.monthlyAmount > 0) result.push({ item, status });
    }
    return result.sort((a, b) => a.item.name.localeCompare(b.item.name, 'es'));
  }, [items, monthKey]);

  const paidThisMonth = useMemo(() => {
    const paid = new Set<string>();
    for (const transaction of transactions) {
      if (transaction.type !== 'gasto' || !transaction.linkedItemId) continue;
      if (monthKeyOf(transaction.date) === monthKey) paid.add(transaction.linkedItemId);
    }
    return paid;
  }, [transactions, monthKey]);

  const contributionOriginId = contributionAccountId;
  const installmentOriginId = installmentAccountId || accounts[0]?.id || '';

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteId]);

  useEffect(() => {
    if (!confirmGoalDeleteId) return;
    const timer = window.setTimeout(() => setConfirmGoalDeleteId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmGoalDeleteId]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setEditingTxId(null);
    setEditError('');
  }, [txFilterAccount, txFilterType, txFilterMonth, txSearch]);

  const accountName = (id: string | null | undefined): string =>
    id ? accountNames.get(id) ?? 'Cuenta eliminada' : 'Cuenta eliminada';

  const hasAccounts = accounts.length > 0;
  const originId = txAccountId || accounts[0]?.id || '';
  const isTransfer = txType === 'transferencia';
  const isExpense = txType === 'gasto';

  const focusMovementForm = () => {
    const form = document.getElementById('finance-movement-form');
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      document.getElementById('tx-amount')?.focus();
    }, 150);
  };

  // ==========================================
  // FORMULARIO DE CUENTA
  // ==========================================
  const resetAccountForm = () => {
    setEditingAccountId(null);
    setAccountDraftName('');
    setAccountType('efectivo');
    setAccountBalance('0');
    setAccountColor('accent');
    setAccountError('');
  };

  const openCreateAccount = () => {
    resetAccountForm();
    setAccountFormOpen(true);
  };

  const openEditAccount = (account: Account) => {
    setEditingAccountId(account.id);
    setAccountDraftName(account.name);
    setAccountType(account.type);
    setAccountBalance(formatAmount(account.balance));
    setAccountColor(account.color);
    setAccountError('');
    setAccountFormOpen(true);
  };

  const closeAccountForm = () => {
    setAccountFormOpen(false);
    resetAccountForm();
  };

  const handleAccountSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = accountDraftName.trim();
    if (!name) {
      setAccountError('Poné un nombre para la cuenta.');
      return;
    }

    const balance = accountBalance.trim() === '' ? 0 : parseSignedAmount(accountBalance);
    if (!Number.isFinite(balance)) {
      setAccountError('El saldo tiene que ser un número válido.');
      return;
    }

    if (editingAccountId) {
      const existing = accounts.find((account) => account.id === editingAccountId);
      if (!existing) {
        setAccountError('La cuenta ya no existe.');
        return;
      }

      const updated = updateAccount({
        ...existing,
        name,
        type: accountType,
        balance,
        color: accountColor,
      });

      if (!updated) {
        setAccountError('No se pudo actualizar. El nombre no puede repetirse.');
        return;
      }
    } else {
      const created = addAccount({ name, type: accountType, balance, color: accountColor });
      if (!created) {
        setAccountError('No se pudo crear la cuenta. El nombre no puede repetirse.');
        return;
      }
    }

    closeAccountForm();
  };

  const handleDeleteAccount = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    deleteAccount(id);
    setConfirmDeleteId(null);
    if (editingAccountId === id) closeAccountForm();
  };

  // ==========================================
  // FORMULARIO DE MOVIMIENTO
  // ==========================================
  const resetTransactionForm = () => {
    setTxAmount('');
    setTxAccountId('');
    setTxDestinationId('');
    setTxCategory('');
    setTxDate(toDateInput(new Date()));
    setTxNotes('');
    setTxLinkedItemId('');
    setTxError('');
  };

  const handleTransactionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasAccounts) return;

    const amount = parsePrice(txAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTxError('Ingresá un monto mayor a 0.');
      return;
    }

    if (!originId) {
      setTxError('Elegí la cuenta de origen.');
      return;
    }

    if (isTransfer) {
      if (!txDestinationId) {
        setTxError('Elegí la cuenta de destino.');
        return;
      }
      if (txDestinationId === originId) {
        setTxError('La cuenta de destino tiene que ser distinta de la de origen.');
        return;
      }
    }

    const created = addTransaction({
      accountId: originId,
      destinationAccountId: isTransfer ? txDestinationId : null,
      type: txType,
      amount,
      date: parseDateInput(txDate),
      category: txCategory.trim(),
      notes: txNotes.trim(),
      linkedItemId: isExpense && txLinkedItemId ? txLinkedItemId : null,
    });

    if (!created) {
      setTxError('No se pudo registrar el movimiento. Revisá los datos.');
      return;
    }

    resetTransactionForm();
  };

  // ==========================================
  // METAS DE AHORRO: FORMULARIO Y APORTES
  // ==========================================
  const resetGoalForm = () => {
    setEditingGoalId(null);
    setGoalName('');
    setGoalTarget('');
    setGoalDeadline('');
    setGoalColor('accent');
    setGoalError('');
  };

  const toggleGoalForm = () => {
    if (isGoalFormOpen) {
      setGoalFormOpen(false);
      resetGoalForm();
      return;
    }
    resetGoalForm();
    setGoalFormOpen(true);
  };

  const openEditGoal = (goal: SavingsGoal) => {
    setEditingGoalId(goal.id);
    setGoalName(goal.name);
    setGoalTarget(goal.targetAmount > 0 ? formatAmount(goal.targetAmount) : '');
    setGoalDeadline(goal.deadline ?? '');
    setGoalColor(goal.color);
    setGoalError('');
    setGoalFormOpen(true);
  };

  const handleGoalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = goalName.trim();
    if (!name) {
      setGoalError('Poné un nombre para la meta.');
      return;
    }

    const target = goalTarget.trim() === '' ? 0 : parsePrice(goalTarget);
    if (!Number.isFinite(target) || target < 0) {
      setGoalError('El objetivo tiene que ser un número válido.');
      return;
    }

    const existing = editingGoalId
      ? savingsGoals.find((goal) => goal.id === editingGoalId)
      : undefined;

    if (editingGoalId && !existing) {
      setGoalError('La meta ya no existe.');
      return;
    }

    const saved = existing
      ? updateSavingsGoal({
          ...existing,
          name,
          targetAmount: target,
          color: goalColor,
          deadline: goalDeadline || null,
        })
      : addSavingsGoal({
          name,
          targetAmount: target,
          currentAmount: 0,
          color: goalColor,
          deadline: goalDeadline || null,
        });

    if (!saved) {
      setGoalError('No se pudo guardar. El nombre no puede repetirse.');
      return;
    }

    setGoalFormOpen(false);
    resetGoalForm();
  };

  const handleGoalDelete = (id: string) => {
    if (confirmGoalDeleteId !== id) {
      setConfirmGoalDeleteId(id);
      return;
    }

    deleteSavingsGoal(id);
    setConfirmGoalDeleteId(null);
    if (editingGoalId === id) {
      setGoalFormOpen(false);
      resetGoalForm();
    }
    if (contributingGoalId === id) setContributingGoalId(null);
  };

  const openContribution = (goal: SavingsGoal, mode: 'aporte' | 'retiro') => {
    if (contributingGoalId === goal.id && contributionMode === mode) {
      setContributingGoalId(null);
      return;
    }
    setContributingGoalId(goal.id);
    setContributionMode(mode);
    setContributionAmount('');
    setContributionAccountId(accounts[0]?.id ?? '');
    setContributionError('');
  };

  const handleContributionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contributingGoalId) return;

    const amount = parsePrice(contributionAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setContributionError('Ingresá un monto mayor a 0.');
      return;
    }

    const signed = contributionMode === 'retiro' ? -amount : amount;
    const done = contributeToGoal(
      contributingGoalId,
      signed,
      contributionOriginId || null,
    );

    if (!done) {
      setContributionError('No se pudo registrar. Revisá el monto y la cuenta.');
      return;
    }

    setContributingGoalId(null);
    setContributionAmount('');
    setContributionError('');
  };

  // ==========================================
  // EDICIÓN INLINE DE MOVIMIENTOS
  // ==========================================
  const openTransactionEdit = (transaction: Transaction) => {
    if (editingTxId === transaction.id) {
      setEditingTxId(null);
      return;
    }

    setEditingTxId(transaction.id);
    setEditCategory(transaction.category);
    setEditNotes(transaction.notes);
    setEditDate(toDateInput(new Date(transaction.date)));
    setEditError('');
  };

  const cancelTransactionEdit = () => {
    setEditingTxId(null);
    setEditError('');
  };

  const handleTransactionEditSubmit = (
    event: FormEvent<HTMLFormElement>,
    transaction: Transaction,
  ) => {
    event.preventDefault();

    const done = updateTransaction(transaction.id, {
      category: editCategory,
      notes: editNotes,
      date: parseDateInput(editDate),
    });

    if (!done) {
      setEditError('No se pudo actualizar el movimiento.');
      return;
    }

    setEditingTxId(null);
    setEditError('');
  };

  // ==========================================
  // CUOTA DEL MES
  // ==========================================
  const payInstallment = (item: Item, status: InstallmentStatus) => {
    if (!installmentOriginId) return;

    const label = formatInstallmentProgress(status);

    addTransaction({
      accountId: installmentOriginId,
      destinationAccountId: null,
      type: 'gasto',
      amount: status.monthlyAmount,
      date: Date.now(),
      category: item.category,
      notes: `${label || 'Cuota mensual'}: ${item.name}`,
      linkedItemId: item.id,
    });
  };

  return (
    <section aria-labelledby="finance-section-heading" className="mt-4 grid gap-5">
      {/* ==========================================
          CUENTAS Y BILLETERAS
      ========================================== */}
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="finance-section-heading" className="text-sm font-bold text-ink">
              Cuentas y billeteras
            </h2>
            <p className="mt-1 text-xs text-muted">
              Saldo consolidado:{' '}
              <span
                className={`font-bold tabular-nums ${
                  totalBalance < 0 ? 'text-danger' : 'text-ink'
                }`}
              >
                {money(totalBalance)}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={isAccountFormOpen ? closeAccountForm : openCreateAccount}
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-4 text-xs font-bold text-surface transition-opacity hover:opacity-90"
          >
            <Icon name={isAccountFormOpen ? 'cancel' : 'add'} size={14} />
            {isAccountFormOpen ? 'Cerrar' : 'Nueva cuenta'}
          </button>
        </div>

        {/* FORMULARIO INLINE (crear / editar) */}
        {isAccountFormOpen && (
          <form
            onSubmit={handleAccountSubmit}
            className="mt-4 grid gap-4 rounded-2xl border border-line bg-surface-2/60 p-4 animate-in fade-in duration-200"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-ink">
                {editingAccountId ? 'Editar cuenta' : 'Nueva cuenta'}
              </p>
              {editingAccountId && (
                <button
                  type="button"
                  onClick={resetAccountForm}
                  className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  Crear una nueva en su lugar
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="account-name" className={LABEL_CLASS}>
                  Nombre
                </label>
                <input
                  id="account-name"
                  type="text"
                  value={accountDraftName}
                  onChange={(event) => {
                    setAccountDraftName(event.target.value);
                    setAccountError('');
                  }}
                  maxLength={60}
                  placeholder="Ej. Banco Nación"
                  required
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="account-type" className={LABEL_CLASS}>
                  Tipo
                </label>
                <SelectField
                  id="account-type"
                  value={accountType}
                  onChange={(value) => setAccountType(value as AccountType)}
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="account-balance" className={LABEL_CLASS}>
                  {editingAccountId ? 'Saldo actual' : 'Saldo inicial'}
                </label>
                <input
                  id="account-balance"
                  type="text"
                  inputMode="decimal"
                  value={accountBalance}
                  onChange={(event) => {
                    setAccountBalance(event.target.value);
                    setAccountError('');
                  }}
                  placeholder="0"
                  className={INPUT_CLASS}
                />
                {editingAccountId && (
                  <p className="text-[0.7rem] text-muted">
                    Ajustar el saldo a mano desacopla la cuenta de su historial de movimientos.
                  </p>
                )}
              </div>

              <fieldset className="grid gap-1.5">
                <legend className={LABEL_CLASS}>Color</legend>
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {COLOR_OPTIONS.map((option) => {
                    const selected = accountColor === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setAccountColor(option.id)}
                        aria-pressed={selected}
                        aria-label={`Color ${option.label}`}
                        title={option.label}
                        style={{ backgroundColor: option.swatch }}
                        className={`h-9 w-9 rounded-full border-2 transition-transform ${
                          selected
                            ? 'scale-110 border-ink ring-2 ring-ink/20'
                            : 'border-line-strong hover:scale-105'
                        }`}
                      />
                    );
                  })}
                </div>
              </fieldset>
            </div>

            {accountError && (
              <p
                role="alert"
                className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
              >
                {accountError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={closeAccountForm}
                className="min-h-[42px] rounded-xl px-4 text-sm font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-ink"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-accent-on shadow-sm transition-colors hover:bg-accent-ink"
              >
                <Icon name="check" size={16} />
                {editingAccountId ? 'Guardar cambios' : 'Crear cuenta'}
              </button>
            </div>
          </form>
        )}

        {/* TARJETAS */}
        {accounts.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface-2/60 px-4 py-6 text-center text-sm text-muted">
            Todavía no tenés cuentas. Creá la primera para registrar movimientos.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => {
              const accent = accentColor(account.color);
              const confirming = confirmDeleteId === account.id;

              return (
                <li
                  key={account.id}
                  className="group relative overflow-hidden rounded-2xl border border-line bg-surface-2 p-4 shadow-soft"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ backgroundColor: accent }}
                  />

                  <div className="flex items-start justify-between gap-2 pl-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface"
                        style={{ color: accent }}
                      >
                        <Icon name={ACCOUNT_ICON[account.type]} size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-tight text-ink">
                          {account.name}
                        </p>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                          {ACCOUNT_LABEL[account.type]}
                        </p>
                      </div>
                    </div>

                    {!confirming && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditAccount(account)}
                          aria-label={`Editar cuenta ${account.name}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(account.id)}
                          aria-label={`Eliminar cuenta ${account.name}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Icon name="delete" size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="relative mt-5 pl-2 text-[0.65rem] font-bold uppercase tracking-wider text-muted">
                    Saldo actual
                  </p>
                  <p
                    className={`relative pl-2 text-xl font-bold tabular-nums tracking-tight ${
                      account.balance < 0 ? 'text-danger' : 'text-ink'
                    }`}
                  >
                    {money(account.balance)}
                  </p>

                  {confirming && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2">
                      <p className="flex-1 text-[0.7rem] font-semibold text-danger">
                        Se borran sus movimientos. ¿Confirmás?
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(account.id)}
                        className="min-h-[32px] rounded-lg bg-danger px-2.5 text-[0.7rem] font-bold text-white"
                      >
                        Sí, eliminar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[32px] rounded-lg border border-line bg-surface px-2.5 text-[0.7rem] font-semibold text-ink"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ==========================================
          METAS DE AHORRO
      ========================================== */}
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink">Metas de Ahorro</h2>
            <p className="mt-1 text-xs text-muted">
              Objetivos con progreso. Si vinculás una cuenta, el aporte mueve saldo real.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleGoalForm}
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-4 text-xs font-bold text-surface transition-opacity hover:opacity-90"
          >
            <Icon name={isGoalFormOpen ? 'cancel' : 'plus'} size={14} />
            {isGoalFormOpen ? 'Cerrar' : 'Nueva meta'}
          </button>
        </div>

        {isGoalFormOpen && (
          <form
            onSubmit={handleGoalSubmit}
            className="mt-4 grid gap-4 rounded-2xl border border-line bg-surface-2/60 p-4 animate-in fade-in duration-200"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-ink">
                {editingGoalId ? 'Editar meta' : 'Nueva meta'}
              </p>
              {editingGoalId && (
                <button
                  type="button"
                  onClick={resetGoalForm}
                  className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  Crear una nueva en su lugar
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="goal-name" className={LABEL_CLASS}>
                  Nombre
                </label>
                <input
                  id="goal-name"
                  type="text"
                  value={goalName}
                  onChange={(event) => {
                    setGoalName(event.target.value);
                    setGoalError('');
                  }}
                  maxLength={60}
                  placeholder="Ej. Viaje a Brasil"
                  required
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="goal-target" className={LABEL_CLASS}>
                  Objetivo
                </label>
                <input
                  id="goal-target"
                  type="text"
                  inputMode="decimal"
                  value={goalTarget}
                  onChange={(event) => {
                    setGoalTarget(event.target.value);
                    setGoalError('');
                  }}
                  placeholder="0"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="goal-deadline" className={LABEL_CLASS}>
                  Fecha límite (opcional)
                </label>
                <input
                  id="goal-deadline"
                  type="date"
                  value={goalDeadline}
                  onChange={(event) => setGoalDeadline(event.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <fieldset className="grid gap-1.5">
                <legend className={LABEL_CLASS}>Color</legend>
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {COLOR_OPTIONS.map((option) => {
                    const selected = goalColor === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setGoalColor(option.id)}
                        aria-pressed={selected}
                        aria-label={`Color ${option.label}`}
                        title={option.label}
                        style={{ backgroundColor: option.swatch }}
                        className={`h-9 w-9 rounded-full border-2 transition-transform ${
                          selected
                            ? 'scale-110 border-ink ring-2 ring-ink/20'
                            : 'border-line-strong hover:scale-105'
                        }`}
                      />
                    );
                  })}
                </div>
              </fieldset>
            </div>

            {goalError && (
              <p
                role="alert"
                className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
              >
                {goalError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => {
                  setGoalFormOpen(false);
                  resetGoalForm();
                }}
                className="min-h-[42px] rounded-xl px-4 text-sm font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-ink"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-accent-on shadow-sm transition-colors hover:bg-accent-ink"
              >
                <Icon name="check" size={16} />
                {editingGoalId ? 'Guardar cambios' : 'Crear meta'}
              </button>
            </div>
          </form>
        )}

        {savingsGoals.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface-2/60 px-4 py-6 text-center text-sm text-muted">
            Todavía no tenés metas. Creá la primera para empezar a reservar.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {savingsGoals.map((goal) => {
              const accent = accentColor(goal.color);
              const confirming = confirmGoalDeleteId === goal.id;
              const contributing = contributingGoalId === goal.id;
              const percent =
                goal.targetAmount > 0
                  ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
                  : 0;
              const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
              const reached = goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount;

              return (
                <li
                  key={goal.id}
                  className="relative overflow-hidden rounded-2xl border border-line bg-surface-2 p-4 shadow-soft"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ backgroundColor: accent }}
                  />

                  <div className="flex items-start justify-between gap-2 pl-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold leading-tight text-ink" title={goal.name}>
                        {goal.name}
                      </p>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                        {goal.deadline
                          ? `Para ${dateFormatter.format(new Date(parseDateInput(goal.deadline)))}`
                          : 'Sin fecha límite'}
                      </p>
                    </div>

                    {!confirming && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditGoal(goal)}
                          aria-label={`Editar meta ${goal.name}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGoalDelete(goal.id)}
                          aria-label={`Eliminar meta ${goal.name}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Icon name="delete" size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="relative mt-4 pl-2">
                    <div className="flex items-end justify-between gap-2">
                      <p className="text-lg font-bold tabular-nums tracking-tight text-ink">
                        {money(goal.currentAmount)}
                      </p>
                      <p className="text-xs font-semibold tabular-nums text-muted">
                        {goal.targetAmount > 0 ? `de ${money(goal.targetAmount)}` : 'Sin objetivo'}
                      </p>
                    </div>

                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(percent)}
                      aria-label={`Progreso de ${goal.name}`}
                      className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
                    >
                      <span
                        className="block h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${percent}%`, backgroundColor: accent }}
                      />
                    </div>

                    <p className="mt-1.5 text-[0.7rem] font-semibold text-muted">
                      {reached
                        ? 'Meta alcanzada'
                        : goal.targetAmount > 0
                          ? `${Math.round(percent)}% · faltan ${money(remaining)}`
                          : `${Math.round(percent)}% del objetivo`}
                    </p>
                  </div>

                  <div className="relative mt-3 flex flex-wrap items-center gap-2 pl-2">
                    <button
                      type="button"
                      onClick={() => openContribution(goal, 'aporte')}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-accent-soft px-2.5 text-[0.7rem] font-bold text-accent-ink transition-colors hover:bg-accent/20"
                    >
                      <Icon name="arrow-up" size={12} />
                      Aportar
                    </button>
                    <button
                      type="button"
                      onClick={() => openContribution(goal, 'retiro')}
                      disabled={goal.currentAmount <= 0}
                      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[0.7rem] font-bold text-ink transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon name="arrow-down" size={12} />
                      Retirar
                    </button>
                  </div>

                  {confirming && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2">
                      <p className="flex-1 text-[0.7rem] font-semibold text-danger">
                        Se borra la meta. Los movimientos ya registrados quedan. ¿Confirmás?
                      </p>
                      <button
                        type="button"
                        onClick={() => handleGoalDelete(goal.id)}
                        className="min-h-[32px] rounded-lg bg-danger px-2.5 text-[0.7rem] font-bold text-white"
                      >
                        Sí, eliminar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmGoalDeleteId(null)}
                        className="min-h-[32px] rounded-lg border border-line bg-surface px-2.5 text-[0.7rem] font-semibold text-ink"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {contributing && (
                    <form
                      onSubmit={handleContributionSubmit}
                      className="relative mt-3 grid gap-2 rounded-xl border border-line bg-surface p-3 animate-in fade-in duration-200"
                    >
                      <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted">
                        {contributionMode === 'aporte' ? 'Aportar a la meta' : 'Retirar de la meta'}
                      </p>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={contributionAmount}
                          onChange={(event) => {
                            setContributionAmount(event.target.value);
                            setContributionError('');
                          }}
                          placeholder="Monto"
                          aria-label="Monto del aporte"
                          className={INPUT_CLASS}
                          required
                        />
                        <SelectField
                          id={`goal-account-${goal.id}`}
                          value={contributionOriginId}
                          onChange={(value) => {
                            setContributionAccountId(value);
                            setContributionError('');
                          }}
                        >
                          <option value="">Sin cuenta (sólo la meta)</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name} · {money(account.balance)}
                            </option>
                          ))}
                        </SelectField>
                      </div>

                      <p className="text-[0.65rem] leading-snug text-muted">
                        {contributionOriginId
                          ? contributionMode === 'aporte'
                            ? 'Se descuenta del saldo y se registra como gasto de Ahorro.'
                            : 'Vuelve al saldo y se registra como ingreso de Ahorro.'
                          : 'Sin cuenta: la meta sube, pero los saldos no se mueven.'}
                      </p>

                      {contributionError && (
                        <p role="alert" className="text-[0.7rem] font-semibold text-danger">
                          {contributionError}
                        </p>
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setContributingGoalId(null)}
                          className="min-h-[32px] rounded-lg px-2.5 text-[0.7rem] font-semibold text-muted hover:text-ink"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="min-h-[32px] rounded-lg bg-accent px-2.5 text-[0.7rem] font-bold text-accent-on hover:bg-accent-ink"
                        >
                          {contributionMode === 'aporte' ? 'Aportar' : 'Retirar'}
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ==========================================
          CUOTAS ACTIVAS DEL MES
      ========================================== */}
      {activeInstallments.length > 0 && (
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-ink">Cuotas activas del mes</h2>
              <p className="mt-1 text-xs text-muted">
                {activeInstallments.length === 1
                  ? '1 compra en cuotas sigue vigente.'
                  : `${activeInstallments.length} compras en cuotas siguen vigentes.`}{' '}
                Registrá la cuota en un clic.
              </p>
            </div>

            <div className="w-full max-w-[240px]">
              <label htmlFor="installment-account" className="sr-only">
                Cuenta para pagar la cuota
              </label>
              <SelectField
                id="installment-account"
                value={installmentOriginId}
                onChange={setInstallmentAccountId}
                disabled={!hasAccounts}
              >
                {!hasAccounts && <option value="">Sin cuentas</option>}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {money(account.balance)}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>

          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {activeInstallments.map(({ item, status }) => {
              const paid = paidThisMonth.has(item.id);

              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-line bg-surface-2 p-4 shadow-soft"
                >
                  <p className="truncate text-sm font-bold text-ink" title={item.name}>
                    {item.name}
                  </p>
                  <p className="mt-0.5 truncate text-[0.7rem] text-muted" title={item.category}>
                    {item.category}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-medium-soft px-2 py-0.5 text-[0.65rem] font-bold text-medium">
                      <Icon name="calendar" size={11} />
                      {formatInstallmentProgress(status) || 'Cuota mensual'}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-ink">
                      {money(status.monthlyAmount)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => payInstallment(item, status)}
                    disabled={!installmentOriginId || paid}
                    className="mt-3 inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-bold text-accent-on transition-colors hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Icon name={paid ? 'check' : 'wallet'} size={13} />
                    {paid ? 'Cuota registrada este mes' : 'Pagar cuota'}
                  </button>

                  {!installmentOriginId && (
                    <p className="mt-1.5 text-[0.65rem] text-muted">
                      Creá una cuenta para registrar el pago.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ==========================================
          MOVIMIENTOS
      ========================================== */}
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">Movimientos</h2>
            <p className="mt-0.5 text-xs text-muted">
              Ingresos, gastos y transferencias. Las transferencias mueven las dos cuentas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-muted">
              Mostrando{' '}
              <span className="font-bold tabular-nums text-ink">
                {filteredTransactions.length}
              </span>{' '}
              de <span className="font-bold tabular-nums text-ink">{transactions.length}</span>
            </p>

            <button
              type="button"
              onClick={focusMovementForm}
              disabled={!hasAccounts}
              className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-accent-on shadow-sm transition-all hover:bg-accent-ink active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="plus" size={16} />
              Nuevo movimiento
            </button>
          </div>
        </div>

        {!hasAccounts && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
          >
            Primero creá una cuenta. Sin cuentas no se pueden registrar movimientos.
          </p>
        )}

        <form
          id="finance-movement-form"
          onSubmit={handleTransactionSubmit}
          className="mt-4 grid gap-4 rounded-2xl border border-line bg-surface-2/60 p-4 sm:p-5"
        >
          <div className="grid gap-1.5">
            <span className={LABEL_CLASS}>Tipo de movimiento</span>
            <div
              role="group"
              aria-label="Tipo de movimiento"
              className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1"
            >
              {TX_OPTIONS.map((option) => {
                const selected = txType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setTxType(option.value);
                      setTxError('');
                    }}
                    aria-pressed={selected}
                    className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors ${
                      selected ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <Icon name={option.icon} size={14} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="tx-amount" className={LABEL_CLASS}>
                Monto
              </label>
              <input
                id="tx-amount"
                type="text"
                inputMode="decimal"
                value={txAmount}
                onChange={(event) => {
                  setTxAmount(event.target.value);
                  setTxError('');
                }}
                placeholder="1.200,50"
                required
                className={INPUT_CLASS}
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="tx-date" className={LABEL_CLASS}>
                Fecha
              </label>
              <input
                id="tx-date"
                type="date"
                value={txDate}
                onChange={(event) => {
                  setTxDate(event.target.value);
                  setTxError('');
                }}
                required
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="tx-account" className={LABEL_CLASS}>
                {isTransfer ? 'Cuenta de origen' : 'Cuenta'}
              </label>
              <SelectField
                id="tx-account"
                value={originId}
                onChange={(value) => {
                  setTxAccountId(value);
                  setTxError('');
                }}
                disabled={!hasAccounts}
              >
                {!hasAccounts && <option value="">Sin cuentas</option>}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {money(account.balance)}
                  </option>
                ))}
              </SelectField>
            </div>

            {isTransfer ? (
              <div className="grid gap-1.5">
                <label htmlFor="tx-destination" className={LABEL_CLASS}>
                  Cuenta de destino
                </label>
                <SelectField
                  id="tx-destination"
                  value={txDestinationId}
                  onChange={(value) => {
                    setTxDestinationId(value);
                    setTxError('');
                  }}
                  disabled={!hasAccounts}
                >
                  <option value="">Elegí una cuenta</option>
                  {accounts
                    .filter((account) => account.id !== originId)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {money(account.balance)}
                      </option>
                    ))}
                </SelectField>
                {hasAccounts && accounts.length < 2 && (
                  <p className="text-[0.7rem] text-muted">
                    Necesitás al menos dos cuentas para transferir.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid gap-1.5">
                <label htmlFor="tx-category" className={LABEL_CLASS}>
                  Categoría
                </label>
                <input
                  id="tx-category"
                  type="text"
                  list="finance-category-options"
                  value={txCategory}
                  onChange={(event) => {
                    setTxCategory(event.target.value);
                    setTxError('');
                  }}
                  maxLength={40}
                  placeholder="Ej. Supermercado"
                  className={INPUT_CLASS}
                />
                <datalist id="finance-category-options">
                  {categorySuggestions.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>
            )}
          </div>

          {isTransfer && (
            <div className="grid gap-1.5">
              <label htmlFor="tx-category-transfer" className={LABEL_CLASS}>
                Categoría
              </label>
              <input
                id="tx-category-transfer"
                type="text"
                list="finance-category-options"
                value={txCategory}
                onChange={(event) => {
                  setTxCategory(event.target.value);
                  setTxError('');
                }}
                maxLength={40}
                placeholder="Ej. Ahorro"
                className={INPUT_CLASS}
              />
            </div>
          )}

          {isExpense && (
            <div className="grid gap-1.5">
              <label htmlFor="tx-linked-item" className={LABEL_CLASS}>
                Vincular a una compra (opcional)
              </label>
              <SelectField
                id="tx-linked-item"
                value={txLinkedItemId}
                onChange={(value) => setTxLinkedItemId(value)}
              >
                <option value="">Sin vínculo</option>
                {sortedItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {money(item.price)}
                  </option>
                ))}
              </SelectField>
              <p className="text-[0.7rem] text-muted">
                Sólo se guarda la referencia; no cambia el estado de la compra.
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <label htmlFor="tx-notes" className={LABEL_CLASS}>
              Notas
            </label>
            <textarea
              id="tx-notes"
              value={txNotes}
              onChange={(event) => setTxNotes(event.target.value)}
              maxLength={250}
              rows={2}
              placeholder="Opcional"
              className={TEXTAREA_CLASS}
            />
          </div>

          {txError && (
            <p
              role="alert"
              className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
            >
              {txError}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={resetTransactionForm}
              className="min-h-[44px] cursor-pointer rounded-xl px-4 text-sm font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              Limpiar
            </button>
            <button
              type="submit"
              disabled={!hasAccounts}
              className="inline-flex min-h-[46px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-accent-on shadow-sm transition-all hover:bg-accent-ink active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              <Icon name="check" size={17} />
              Registrar movimiento
            </button>
          </div>
        </form>

        {/* FILTROS DEL HISTORIAL */}
        <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface-2/40 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-1.5">
            <label htmlFor="tx-filter-search" className={LABEL_CLASS}>
              Buscar
            </label>
            <input
              id="tx-filter-search"
              type="search"
              data-search-target="finance"
              value={txSearch}
              onChange={(event) => setTxSearch(event.target.value)}
              placeholder="Categoría, nota o artículo"
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="tx-filter-account" className={LABEL_CLASS}>
              Cuenta
            </label>
            <SelectField
              id="tx-filter-account"
              value={txFilterAccount}
              onChange={setTxFilterAccount}
            >
              <option value="todas">Todas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="tx-filter-type" className={LABEL_CLASS}>
              Tipo
            </label>
            <SelectField
              id="tx-filter-type"
              value={txFilterType}
              onChange={(value) => setTxFilterType(value as 'todos' | TransactionType)}
            >
              <option value="todos">Todos</option>
              <option value="gasto">Gastos</option>
              <option value="ingreso">Ingresos</option>
              <option value="transferencia">Transferencias</option>
            </SelectField>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="tx-filter-month" className={LABEL_CLASS}>
              Mes
            </label>
            <SelectField
              id="tx-filter-month"
              value={txFilterMonth}
              onChange={setTxFilterMonth}
            >
              <option value="todos">Todos los meses</option>
              {txMonths.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </SelectField>
          </div>
        </div>

        {/* LISTADO */}
        {transactions.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface-2/60 px-4 py-6 text-center text-sm text-muted">
            Sin movimientos todavía.
          </p>
        ) : filteredTransactions.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface-2/60 px-4 py-6 text-center text-sm text-muted">
            Ningún movimiento coincide con los filtros.
          </p>
        ) : (
          <>
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {visibleTransactions.map((transaction) => {
                const meta = TX_META[transaction.type];
                const title = transaction.category || meta.label;
                const linkedName = transaction.linkedItemId
                  ? itemNames.get(transaction.linkedItemId)
                  : undefined;

                return (
                  <li
                    key={transaction.id}
                    className={
                      editingTxId === transaction.id
                        ? 'bg-surface-2/40 px-4 py-3'
                        : 'group flex items-center gap-3 px-4 py-3'
                    }
                  >
                    {editingTxId === transaction.id ? (
                      <form
                        onSubmit={(event) => handleTransactionEditSubmit(event, transaction)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') {
                            event.stopPropagation();
                            cancelTransactionEdit();
                          }
                        }}
                        className="grid gap-3 animate-in fade-in duration-200"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink">
                            {title}
                            <span className="ml-2 font-bold tabular-nums">
                              {signedAmount(transaction)}
                            </span>
                          </p>
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                            Monto, tipo y cuentas bloqueados
                          </span>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid gap-1.5">
                            <label
                              htmlFor={`tx-edit-category-${transaction.id}`}
                              className={LABEL_CLASS}
                            >
                              Categoría
                            </label>
                            <input
                              id={`tx-edit-category-${transaction.id}`}
                              type="text"
                              value={editCategory}
                              onChange={(event) => {
                                setEditCategory(event.target.value);
                                setEditError('');
                              }}
                              maxLength={40}
                              autoFocus
                              className={INPUT_CLASS}
                            />
                          </div>

                          <div className="grid gap-1.5">
                            <label
                              htmlFor={`tx-edit-date-${transaction.id}`}
                              className={LABEL_CLASS}
                            >
                              Fecha
                            </label>
                            <input
                              id={`tx-edit-date-${transaction.id}`}
                              type="date"
                              value={editDate}
                              onChange={(event) => {
                                setEditDate(event.target.value);
                                setEditError('');
                              }}
                              className={INPUT_CLASS}
                            />
                          </div>
                        </div>

                        <div className="grid gap-1.5">
                          <label
                            htmlFor={`tx-edit-notes-${transaction.id}`}
                            className={LABEL_CLASS}
                          >
                            Notas
                          </label>
                          <input
                            id={`tx-edit-notes-${transaction.id}`}
                            type="text"
                            value={editNotes}
                            onChange={(event) => {
                              setEditNotes(event.target.value);
                              setEditError('');
                            }}
                            maxLength={250}
                            placeholder="Sin notas"
                            className={INPUT_CLASS}
                          />
                        </div>

                        {editError && (
                          <p role="alert" className="text-xs font-semibold text-danger">
                            {editError}
                          </p>
                        )}

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelTransactionEdit}
                            className="min-h-[36px] rounded-lg px-3 text-xs font-semibold text-muted transition-colors hover:text-ink"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-accent-on transition-colors hover:bg-accent-ink"
                          >
                            <Icon name="check" size={14} />
                            Guardar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${meta.chip}`}
                          aria-label={meta.label}
                        >
                          {meta.symbol}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">{title}</p>
                          <p className="truncate text-xs text-muted">
                            {transaction.type === 'transferencia'
                              ? `${accountName(transaction.accountId)} → ${accountName(
                                  transaction.destinationAccountId,
                                )}`
                              : accountName(transaction.accountId)}
                            <span className="mx-1.5 text-muted/50">·</span>
                            {dateFormatter.format(new Date(transaction.date))}
                          </p>
                          {linkedName && (
                            <p className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-semibold text-accent-ink">
                              <Icon name="shopping-cart" size={11} className="shrink-0" />
                              <span className="truncate">{linkedName}</span>
                            </p>
                          )}
                          {transaction.notes && (
                            <p className="truncate text-[0.7rem] text-muted">{transaction.notes}</p>
                          )}
                        </div>

                        <span className={`shrink-0 text-sm font-bold tabular-nums ${meta.tone}`}>
                          {signedAmount(transaction)}
                        </span>

                        <button
                          type="button"
                          onClick={() => openTransactionEdit(transaction)}
                          aria-label={`Editar movimiento: ${title}`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted opacity-0 transition-all hover:bg-surface-3 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Icon name="edit" size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteTransaction(transaction.id)}
                          aria-label={`Eliminar movimiento: ${title}`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted opacity-0 transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Icon name="delete" size={15} />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>

            {filteredTransactions.length > visibleCount && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  {visibleCount} de {filteredTransactions.length} movimientos
                </p>
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 text-xs font-bold text-ink transition-colors hover:bg-surface-3"
                >
                  <Icon name="chevron" size={14} />
                  Mostrar más
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}