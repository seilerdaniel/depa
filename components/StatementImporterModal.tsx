'use client';

import {
  useCallback, useEffect, useRef, useState,
  type ChangeEvent, type DragEvent,
} from 'react';
import { useFinance } from '@/state/AppProvider';
import { money } from '@/lib/utils';
import {
  buildStatementPreview,
  detectColumnMapping,
  guessCategoryFromConcept,
  parseStatementFile,
  STATEMENT_CATEGORIES,
  type ParsedStatementRow,
  type RawStatementTable,
  type StatementColumnMapping,
} from '@/lib/statementImporter';
import { Icon } from './Icon';

// ==========================================
// IMPORTADOR DE EXTRACTOS · MODAL EN 3 PASOS
// ==========================================

const INPUT_CLASS =
  'w-full min-h-[42px] rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20';

const LABEL_CLASS = 'text-[0.68rem] font-bold uppercase tracking-wider text-muted';

const DATE_FORMAT = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function ColumnSelect({
  id,
  label,
  value,
  headers,
  onChange,
  optional,
}: {
  id: string;
  label: string;
  value: number | null;
  headers: string[];
  onChange: (value: number | null) => void;
  optional?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
        {optional && <span className="ml-1 normal-case text-muted/80">(opcional)</span>}
      </label>
      <select
        id={id}
        value={value ?? -1}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(next < 0 ? null : next);
        }}
        className={INPUT_CLASS}
      >
        <option value={-1}>Sin columna</option>
        {headers.map((header, index) => (
          <option key={`${header}-${index}`} value={index}>
            {header}
          </option>
        ))}
      </select>
    </div>
  );
}

export function StatementImporterModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { accounts, transactions, addTransactionsBatch } = useFinance();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [targetAccountId, setTargetAccountId] = useState('');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<RawStatementTable | null>(null);
  const [mapping, setMapping] = useState<StatementColumnMapping | null>(null);
  const [invertSigns, setInvertSigns] = useState(false);
  const [rows, setRows] = useState<ParsedStatementRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset al abrir: cada importación empieza limpia.
  useEffect(() => {
    if (!open) return;

    setStep(1);
    setFileName('');
    setTable(null);
    setMapping(null);
    setInvertSigns(false);
    setRows([]);
    setError('');
    setBusy(false);
    setTargetAccountId((previous) => previous || accounts[0]?.id || '');
  }, [open, accounts]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setBusy(true);

    try {
      const parsed = await parseStatementFile(file);

      if (parsed.rows.length === 0) {
        setError('No se encontraron movimientos en el archivo. Revisá que tenga una tabla de datos.');
        return;
      }

      setTable(parsed);
      setMapping(detectColumnMapping(parsed.headers));
      setFileName(file.name);
      setStep(2);
    } catch (readError) {
      console.warn('No se pudo leer el extracto.', readError);
      setError('No se pudo leer el archivo. Formatos soportados: CSV, TXT, XLSX y XLS.');
    } finally {
      setBusy(false);
    }
  }, []);

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const updateMapping = (patch: Partial<StatementColumnMapping>) => {
    setMapping((previous) => (previous ? { ...previous, ...patch } : previous));
    setError('');
  };

  const buildPreview = () => {
    if (!table || !mapping) return;

    if (!targetAccountId) {
      setError('Elegí una cuenta destino.');
      return;
    }
    if (mapping.dateCol === null) {
      setError('Elegí la columna de fecha.');
      return;
    }
    if (mapping.descriptionCol === null) {
      setError('Elegí la columna de concepto.');
      return;
    }
    if (mapping.amountMode === 'split') {
      if (mapping.debitCol === null && mapping.creditCol === null) {
        setError('Elegí al menos una columna de Débito o Crédito.');
        return;
      }
    } else if (mapping.amountCol === null) {
      setError('Elegí la columna de monto.');
      return;
    }

    const preview = buildStatementPreview(table, mapping, {
      targetAccountId,
      transactions,
      invertSigns,
    });

    if (preview.length === 0) {
      setError('No se pudo interpretar ninguna fila. Revisá el mapeo de columnas.');
      return;
    }

    setRows(preview);
    setError('');
    setStep(3);
  };

  const patchRow = (id: string, patch: Partial<ParsedStatementRow>) => {
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const selectAll = () => setRows((previous) => previous.map((row) => ({ ...row, selected: true })));
  const selectOnlyNew = () =>
    setRows((previous) => previous.map((row) => ({ ...row, selected: !row.isDuplicate })));
  const selectNone = () => setRows((previous) => previous.map((row) => ({ ...row, selected: false })));

  const selectedRows = rows.filter((row) => row.selected);
  const duplicateOmitted = rows.filter((row) => row.isDuplicate && !row.selected).length;
  const netImpact = selectedRows.reduce(
    (sum, row) => sum + (row.type === 'ingreso' ? row.amount : -row.amount),
    0,
  );

  const handleImport = () => {
    if (selectedRows.length === 0) {
      setError('Seleccioná al menos un movimiento para importar.');
      return;
    }

    const imported = addTransactionsBatch(
      selectedRows.map((row) => ({
        accountId: targetAccountId,
        destinationAccountId: null,
        type: row.type,
        amount: row.amount,
        date: row.date,
        category: row.category || guessCategoryFromConcept(row.description),
        notes: row.description,
        linkedItemId: null,
        recurringExpenseId: null,
      })),
    );

    if (imported === 0) {
      setError('No se pudo importar. Verificá la cuenta destino y los montos.');
      return;
    }

    onClose();
  };

  if (!open) return null;

  const hasAccounts = accounts.length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="statement-importer-title"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
      >
        {/* CABECERA */}
        <div className="shrink-0 border-b border-line bg-surface-2/50 px-5 pt-3.5 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="statement-importer-title"
                className="flex items-center gap-2 text-base font-bold text-ink"
              >
                <Icon name="upload" size={18} className="text-accent" />
                Importar extracto
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                CSV, TXT, XLSX o XLS de bancos y billeteras. Detectamos columnas y duplicados.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar importador"
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <Icon name="cancel" size={18} />
            </button>
          </div>

          <ol className="mt-3 flex flex-wrap gap-1.5 text-[0.68rem] font-bold">
            {[
              { id: 1 as const, label: '1 · Archivo' },
              { id: 2 as const, label: '2 · Columnas' },
              { id: 3 as const, label: '3 · Vista previa' },
            ].map((item) => (
              <li
                key={item.id}
                aria-current={step === item.id ? 'step' : undefined}
                className={`rounded-full px-3 py-1 ${
                  step === item.id
                    ? 'bg-accent text-accent-on'
                    : step > item.id
                      ? 'bg-low-soft text-low'
                      : 'bg-surface-3 text-muted'
                }`}
              >
                {item.label}
              </li>
            ))}
          </ol>
        </div>

        {/* CUERPO */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          {step === 1 && (
            <>
              <div className="grid gap-2 rounded-2xl border border-line bg-surface-2/40 p-4">
                <label htmlFor="statement-account" className={LABEL_CLASS}>
                  Cuenta destino
                </label>
                <select
                  id="statement-account"
                  value={targetAccountId}
                  onChange={(event) => {
                    setTargetAccountId(event.target.value);
                    setError('');
                  }}
                  disabled={!hasAccounts}
                  className={INPUT_CLASS}
                >
                  {hasAccounts ? (
                    accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} · {money(account.balance)}
                      </option>
                    ))
                  ) : (
                    <option value="">Sin cuentas</option>
                  )}
                </select>
                <p className="text-[0.7rem] text-muted">
                  Los movimientos se suman a esta cuenta y ajustan su saldo.
                </p>
              </div>

              {!hasAccounts && (
                <p
                  role="alert"
                  className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
                >
                  Primero creá una cuenta en Mis Finanzas para poder importar movimientos.
                </p>
              )}

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
                  dragActive
                    ? 'border-accent bg-accent-soft/30'
                    : 'border-line-strong bg-surface-2/30'
                }`}
              >
                <Icon name="upload" size={22} className="text-muted" />
                <p className="text-sm font-bold text-ink">
                  Arrastrá el extracto acá
                </p>
                <p className="text-xs text-muted">
                  CSV, TXT, XLSX o XLS · hasta 4 MB recomendados
                </p>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!hasAccounts || busy}
                  className="mt-2 inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl bg-ink px-5 text-xs font-bold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="archive" size={14} />
                  {busy ? 'Leyendo…' : 'Elegir archivo CSV o Excel'}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.txt,text/csv"
                  onChange={onInputChange}
                  className="hidden"
                />

                {fileName && (
                  <p className="mt-2 text-[0.7rem] font-semibold text-accent-ink">{fileName}</p>
                )}
              </div>
            </>
          )}

          {step === 2 && table && mapping && (
            <>
              <div className="rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-[0.72rem] text-muted">
                <span className="font-semibold text-ink">{fileName}</span> ·{' '}
                {table.rows.length} filas de datos · encabezado detectado en la fila{' '}
                {table.headerRowIndex + 1}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ColumnSelect
                  id="map-date"
                  label="Fecha"
                  value={mapping.dateCol}
                  headers={table.headers}
                  onChange={(value) => updateMapping({ dateCol: value })}
                />

                <ColumnSelect
                  id="map-description"
                  label="Concepto / Descripción"
                  value={mapping.descriptionCol}
                  headers={table.headers}
                  onChange={(value) => updateMapping({ descriptionCol: value })}
                />
              </div>

              <div className="rounded-2xl border border-line bg-surface-2/40 p-4">
                <p className={LABEL_CLASS}>Modo de importe</p>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      {
                        id: 'signed' as const,
                        title: 'Columna única con signo',
                        hint: 'Mercado Pago, Brubank, Ualá',
                      },
                      {
                        id: 'split' as const,
                        title: 'Débito y Crédito separados',
                        hint: 'Galicia, Santander, Naranja X',
                      },
                    ] as const
                  ).map((option) => {
                    const active = mapping.amountMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateMapping({ amountMode: option.id })}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? 'border-accent bg-accent-soft/40 ring-1 ring-accent'
                            : 'border-line bg-surface hover:border-line-strong'
                        }`}
                      >
                        <span className={`block text-xs font-bold ${active ? 'text-accent-ink' : 'text-ink'}`}>
                          {option.title}
                        </span>
                        <span className="mt-0.5 block text-[0.68rem] text-muted">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {mapping.amountMode === 'signed' ? (
                    <ColumnSelect
                      id="map-amount"
                      label="Monto"
                      value={mapping.amountCol}
                      headers={table.headers}
                      onChange={(value) => updateMapping({ amountCol: value })}
                    />
                  ) : (
                    <>
                      <ColumnSelect
                        id="map-debit"
                        label="Débito / Egreso"
                        value={mapping.debitCol}
                        headers={table.headers}
                        onChange={(value) => updateMapping({ debitCol: value })}
                      />
                      <ColumnSelect
                        id="map-credit"
                        label="Crédito / Ingreso"
                        value={mapping.creditCol}
                        headers={table.headers}
                        onChange={(value) => updateMapping({ creditCol: value })}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ColumnSelect
                  id="map-category"
                  label="Categoría"
                  optional
                  value={mapping.categoryCol}
                  headers={table.headers}
                  onChange={(value) => updateMapping({ categoryCol: value })}
                />

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-2/40 p-3">
                  <input
                    type="checkbox"
                    checked={invertSigns}
                    onChange={(event) => setInvertSigns(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-xs font-bold text-ink">Invertir signos</span>
                    <span className="mt-0.5 block text-[0.68rem] leading-tight text-muted">
                      Usalo si los gastos vienen en positivo y los ingresos en negativo.
                    </span>
                  </span>
                </label>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Filas válidas', value: String(rows.length), tone: 'text-ink' },
                  { label: 'Seleccionadas', value: String(selectedRows.length), tone: 'text-ink' },
                  { label: 'Duplicados omitidos', value: String(duplicateOmitted), tone: duplicateOmitted > 0 ? 'text-medium' : 'text-ink' },
                  {
                    label: 'Neto en saldo',
                    value: `${netImpact < 0 ? '−' : '+'}${money(Math.abs(netImpact))}`,
                    tone: netImpact < 0 ? 'text-danger' : 'text-low',
                  },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-line bg-surface-2/40 px-3 py-2">
                    <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted">
                      {stat.label}
                    </p>
                    <p className={`mt-0.5 text-sm font-bold tabular-nums ${stat.tone}`}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.7rem] font-bold text-muted transition-colors hover:text-ink"
                >
                  Seleccionar todas
                </button>
                <button
                  type="button"
                  onClick={selectOnlyNew}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.7rem] font-bold text-muted transition-colors hover:text-ink"
                >
                  Solo nuevas
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.7rem] font-bold text-muted transition-colors hover:text-ink"
                >
                  Deseleccionar todas
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-line">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <caption className="sr-only">Vista previa de movimientos detectados</caption>
                  <thead>
                    <tr className="bg-surface-2/60 text-left text-[0.6rem] uppercase tracking-wider text-muted">
                      <th scope="col" className="w-10 px-3 py-2 font-bold">
                        <span className="sr-only">Importar</span>
                      </th>
                      <th scope="col" className="px-2 py-2 font-bold">Fecha</th>
                      <th scope="col" className="px-2 py-2 font-bold">Concepto</th>
                      <th scope="col" className="px-2 py-2 font-bold">Tipo</th>
                      <th scope="col" className="px-2 py-2 font-bold">Categoría</th>
                      <th scope="col" className="px-2 py-2 text-right font-bold">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`border-t border-line ${row.isDuplicate ? 'bg-medium-soft/20' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(event) => patchRow(row.id, { selected: event.target.checked })}
                            aria-label={`Importar ${row.description}`}
                            className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                          />
                        </td>

                        <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums text-muted">
                          {DATE_FORMAT.format(new Date(row.date))}
                        </td>

                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(event) => patchRow(row.id, { description: event.target.value })}
                            aria-label="Concepto"
                            className="w-full min-w-[180px] rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                          />
                          {row.isDuplicate && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-medium-soft px-2 py-0.5 text-[0.6rem] font-bold text-medium">
                              <Icon name="history" size={10} />
                              Posible duplicado
                            </span>
                          )}
                        </td>

                        <td className="px-2 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-bold ${
                              row.type === 'ingreso'
                                ? 'bg-low-soft text-low'
                                : 'bg-danger-soft text-danger'
                            }`}
                          >
                            {row.type === 'ingreso' ? 'Ingreso' : 'Gasto'}
                          </span>
                        </td>

                        <td className="px-2 py-2">
                          <select
                            value={row.category}
                            onChange={(event) => patchRow(row.id, { category: event.target.value })}
                            aria-label="Categoría"
                            className="w-full min-w-[130px] rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                          >
                            {STATEMENT_CATEGORIES.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                            {!STATEMENT_CATEGORIES.includes(row.category) && (
                              <option value={row.category}>{row.category}</option>
                            )}
                          </select>
                        </td>

                        <td className="whitespace-nowrap px-2 py-2 text-right text-xs font-bold tabular-nums text-ink">
                          {row.type === 'ingreso' ? '+' : '−'}
                          {money(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
              {error}
            </p>
          )}
        </div>

        {/* PIE */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              if (step === 1) onClose();
              else {
                setError('');
                setStep((previous) => (previous === 3 ? 2 : 1));
              }
            }}
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface px-4 text-xs font-bold text-muted transition-colors hover:text-ink"
          >
            <Icon name="chevron" size={14} className="rotate-180" />
            {step === 1 ? 'Cancelar' : 'Atrás'}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {step === 3 && (
              <span className="text-[0.7rem] text-muted">
                {selectedRows.length} de {rows.length} seleccionados
              </span>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={buildPreview}
                className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-5 text-xs font-bold text-accent-on transition-all hover:brightness-110"
              >
                Ver vista previa
                <Icon name="chevron" size={14} />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleImport}
                disabled={selectedRows.length === 0}
                className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-5 text-xs font-bold text-accent-on transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="check" size={14} />
                Importar {selectedRows.length} {selectedRows.length === 1 ? 'movimiento' : 'movimientos'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
