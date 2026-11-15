'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useData, useToast, useUI } from '@/state/AppProvider';
import {
  createId, formatInstallments,
  money, normalizeLabel, normalizeUrl, parsePrice,
} from '@/lib/utils';
import type { Installments, Item, ItemOption } from '@/lib/types';
import { Icon } from './Icon';

const PRESET_BADGES = ['', 'Más recomendado', 'Más vendido', 'Mejor garantía', 'Envío gratis'];

interface OptionDraft {
  label: string;
  brand: string;
  model: string;
  storeName: string;
  storeLocation: string;
  price: string;
  hasInstallments: boolean;
  installmentsCount: string;
  installmentsAmount: string;
  purchaseUrl: string;
  rating: number;
  badge: string;
  pros: string;
  cons: string;
}

const emptyDraft = (item?: Item): OptionDraft => ({
  label: '',
  brand: item?.brand ?? '',
  model: '',
  storeName: '',
  storeLocation: '',
  price: '',
  hasInstallments: false,
  installmentsCount: '3',
  installmentsAmount: '',
  purchaseUrl: '',
  rating: 4,
  badge: '',
  pros: '',
  cons: '',
});

const draftFromOption = (opt: ItemOption): OptionDraft => ({
  label: opt.label,
  brand: opt.brand,
  model: opt.model,
  storeName: opt.storeName,
  storeLocation: opt.storeLocation,
  price: opt.price > 0 ? String(opt.price) : '',
  hasInstallments: Boolean(opt.installments),
  installmentsCount: opt.installments ? String(opt.installments.count) : '3',
  installmentsAmount: opt.installments ? String(opt.installments.amount) : '',
  purchaseUrl: opt.purchaseUrl,
  rating: opt.rating,
  badge: opt.badge,
  pros: opt.pros,
  cons: opt.cons,
});

const analyzeOptions = (options: ItemOption[]) => {
  const pricedOptions = options.filter((option) => option.price > 0);
  const bestCash = pricedOptions.reduce<ItemOption | null>(
    (best, option) => (!best || option.price < best.price ? option : best),
    null,
  );
  const installmentOptions = pricedOptions.filter(
    (option) => option.installments && option.installments.amount > 0,
  );
  const lowestInstallment = installmentOptions.reduce<ItemOption | null>(
    (best, option) =>
      !best || option.installments!.amount < best.installments!.amount ? option : best,
    null,
  );
  const bestValue = pricedOptions.reduce<ItemOption | null>((best, option) => {
    if (!best) return option;
    const optionValue = option.rating / option.price;
    const bestValue = best.rating / best.price;
    return optionValue > bestValue ? option : best;
  }, null);

  return {
    bestCashId: bestCash?.id,
    lowestInstallmentId: lowestInstallment?.id,
    bestValueId: bestValue?.id,
  };
};

export function OptionComparator({ item }: { item: Item }) {
  const { updateItem } = useData();
  const { setSelectedItem } = useUI();
  const { showToast } = useToast();

  const options = item.options ?? [];
  const [isAdding, setIsAdding] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OptionDraft>(() => emptyDraft(item));

  const winners = useMemo(() => analyzeOptions(options), [options]);

  const persistOptions = (nextOptions: ItemOption[], nextSelectedId = item.selectedOptionId ?? null) => {
    const updated: Item = {
      ...item,
      options: nextOptions,
      selectedOptionId: nextSelectedId,
    };
    updateItem(updated);
    setSelectedItem(updated);
  };

  const openNew = () => {
    setEditingOptionId(null);
    setDraft(emptyDraft(item));
    setIsAdding(true);
  };

  const openEdit = (opt: ItemOption) => {
    setEditingOptionId(opt.id);
    setDraft(draftFromOption(opt));
    setIsAdding(true);
  };

  const closeForm = () => {
    setIsAdding(false);
    setEditingOptionId(null);
  };

  const handlePriceChange = (raw: string) => {
    const parsed = parsePrice(raw);
    const count = parseInt(draft.installmentsCount, 10) || 3;
    setDraft((prev) => ({
      ...prev,
      price: raw,
      installmentsAmount:
        prev.hasInstallments && !Number.isNaN(parsed) && parsed > 0
          ? String(Math.round((parsed / count) * 100) / 100)
          : prev.installmentsAmount,
    }));
  };

  const handleCountChange = (rawCount: string) => {
    const parsed = parsePrice(draft.price);
    const count = parseInt(rawCount, 10) || 1;
    setDraft((prev) => ({
      ...prev,
      installmentsCount: rawCount,
      installmentsAmount:
        !Number.isNaN(parsed) && parsed > 0 && count > 0
          ? String(Math.round((parsed / count) * 100) / 100)
          : prev.installmentsAmount,
    }));
  };

  const handleSaveOption = (e: FormEvent) => {
    e.preventDefault();

    const parsedPrice = draft.price.trim() ? parsePrice(draft.price) : 0;
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      showToast('Ingresá un precio válido para la opción.');
      return;
    }

    const label = normalizeLabel(draft.label, 80);
    const brand = normalizeLabel(draft.brand, 40);
    const model = normalizeLabel(draft.model, 40);
    const storeName = normalizeLabel(draft.storeName, 80);

    if (!label && !brand && !model && !storeName) {
      showToast('Indicá al menos una tienda, marca, modelo o etiqueta.');
      return;
    }

    let installments: Installments | null = null;
    if (draft.hasInstallments) {
      const count = Math.min(72, Math.max(1, parseInt(draft.installmentsCount, 10) || 1));
      const rawAmt = parsePrice(draft.installmentsAmount);
      const amount = !Number.isNaN(rawAmt) && rawAmt > 0
        ? rawAmt
        : Math.round((parsedPrice / count) * 100) / 100;
      if (amount > 0) {
        installments = { count, amount: Math.round(amount * 100) / 100 };
      }
    }

    const cleanOption: ItemOption = {
      id: editingOptionId ?? createId(),
      label,
      brand,
      model,
      storeName,
      storeLocation: normalizeLabel(draft.storeLocation, 120),
      price: Math.round(parsedPrice * 100) / 100,
      installments,
      purchaseUrl: normalizeUrl(draft.purchaseUrl) || '',
      rating: Math.min(5, Math.max(0, Math.round(draft.rating))),
      badge: normalizeLabel(draft.badge, 32),
      pros: normalizeLabel(draft.pros, 200),
      cons: normalizeLabel(draft.cons, 200),
      createdAt: editingOptionId
        ? (options.find((o) => o.id === editingOptionId)?.createdAt ?? Date.now())
        : Date.now(),
    };

    const nextOptions = editingOptionId
      ? options.map((o) => (o.id === editingOptionId ? cleanOption : o))
      : [...options, cleanOption];

    persistOptions(nextOptions);
    closeForm();
    showToast(editingOptionId ? 'Opción actualizada' : 'Opción agregada al comparador');
  };

  const handleDeleteOption = (id: string) => {
    const nextOptions = options.filter((o) => o.id !== id);
    const nextSelectedId = item.selectedOptionId === id ? null : (item.selectedOptionId ?? null);
    persistOptions(nextOptions, nextSelectedId);
    showToast('Opción eliminada');
  };

  const handleChooseOption = (opt: ItemOption) => {
    const updated: Item = {
      ...item,
      price: opt.price > 0 ? opt.price : item.price,
      installments: opt.installments,
      storeName: opt.storeName || item.storeName,
      storeLocation: opt.storeLocation || item.storeLocation,
      purchaseUrl: opt.purchaseUrl || item.purchaseUrl,
      brand: opt.brand || item.brand,
      model: opt.model || item.model,
      selectedOptionId: opt.id,
    };

    updateItem(updated);
    setSelectedItem(updated);
    showToast(`Opción "${opt.label || opt.storeName || opt.model || 'elegida'}" aplicada al artículo`);
  };

  /** Importa los datos actuales del artículo como primera alternativa base. */
  const handleSnapshotCurrent = () => {
    const baseOption: ItemOption = {
      id: createId(),
      label: 'Opción base',
      brand: item.brand,
      model: item.model,
      storeName: item.storeName,
      storeLocation: item.storeLocation,
      price: item.price,
      installments: item.installments,
      purchaseUrl: item.purchaseUrl,
      rating: 3,
      badge: '',
      pros: '',
      cons: '',
      createdAt: Date.now(),
    };
    persistOptions([...options, baseOption], baseOption.id);
    showToast('Datos actuales guardados como opción base');
  };

  return (
    <div className="border-t border-line pt-5">
      {/* CABECERA DEL COMPARADOR */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h4 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
            <Icon name="finance" size={14} className="text-accent" />
            Comparador de opciones ({options.length})
          </h4>
          <p className="text-[0.7rem] text-muted mt-0.5">
            Evaluá tiendas o modelos sin inflar el presupuesto hasta elegir uno.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {options.length === 0 && (item.price > 0 || item.storeName || item.brand) && !isAdding && (
            <button
              type="button"
              onClick={handleSnapshotCurrent}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-line bg-surface-2 text-[0.7rem] font-semibold text-ink hover:border-line-strong transition-colors cursor-pointer"
              title="Guarda los datos actuales del artículo como primera opción"
            >
              Guardar actual como base
            </button>
          )}
          {!isAdding && (
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent text-accent-on text-xs font-bold shadow-sm hover:brightness-110 transition-all cursor-pointer"
            >
              <Icon name="plus" size={14} />
              Agregar opción
            </button>
          )}
        </div>
      </div>

      {/* FORMULARIO DE ALTA / EDICIÓN DE OPCIÓN */}
      {isAdding && (
        <form
          onSubmit={handleSaveOption}
          className="mb-4 rounded-2xl border border-accent/40 bg-surface-2/60 p-4 space-y-3 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink">
              {editingOptionId ? 'Editar alternativa' : 'Nueva alternativa'}
            </span>
            <button
              type="button"
              onClick={closeForm}
              className="text-xs font-semibold text-muted hover:text-ink cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              placeholder="Etiqueta (Ej. Versión Inverter / Oferta)"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="Tienda (Ej. Mercado Libre, Frávega)"
              value={draft.storeName}
              onChange={(e) => setDraft({ ...draft, storeName: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              placeholder="Marca"
              value={draft.brand}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="Modelo"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent"
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="Precio contado *"
              value={draft.price}
              onChange={(e) => handlePriceChange(e.target.value)}
              className="col-span-2 sm:col-span-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold tabular-nums text-ink outline-none focus:border-accent"
            />
          </div>

          {/* CUOTAS DE LA OPCIÓN */}
          <div className="rounded-xl border border-line bg-surface p-2.5">
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-[0.7rem] font-bold text-ink">Financiación / Cuotas</span>
              <input
                type="checkbox"
                checked={draft.hasInstallments}
                onChange={(e) => {
                  const checked = e.target.checked;
                  const parsed = parsePrice(draft.price);
                  const count = parseInt(draft.installmentsCount, 10) || 3;
                  setDraft({
                    ...draft,
                    hasInstallments: checked,
                    installmentsAmount:
                      checked && !Number.isNaN(parsed) && parsed > 0
                        ? String(Math.round((parsed / count) * 100) / 100)
                        : draft.installmentsAmount,
                  });
                }}
                className="h-3.5 w-3.5 accent-accent cursor-pointer"
              />
            </label>
            {draft.hasInstallments && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  max={72}
                  placeholder="Cuotas"
                  value={draft.installmentsCount}
                  onChange={(e) => handleCountChange(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs tabular-nums text-ink outline-none focus:border-accent"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Monto por cuota"
                  value={draft.installmentsAmount}
                  onChange={(e) => setDraft({ ...draft, installmentsAmount: e.target.value })}
                  className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs tabular-nums text-ink outline-none focus:border-accent"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="url"
              placeholder="URL del producto (https://...)"
              value={draft.purchaseUrl}
              onChange={(e) => setDraft({ ...draft, purchaseUrl: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="Sucursal / Ubicación (opcional)"
              value={draft.storeLocation}
              onChange={(e) => setDraft({ ...draft, storeLocation: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent"
            />
          </div>

          {/* PUNTAJE Y ETIQUETA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
            <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-1.5">
              <span className="text-[0.7rem] font-bold text-ink-soft">Calidad:</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setDraft({ ...draft, rating: draft.rating === star ? 0 : star })}
                    className={`text-sm font-bold px-1 transition-transform hover:scale-110 cursor-pointer ${
                      star <= draft.rating ? 'text-medium' : 'text-muted/40'
                    }`}
                    aria-label={`${star} estrellas`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <select
              value={draft.badge}
              onChange={(e) => setDraft({ ...draft, badge: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent cursor-pointer"
            >
              <option value="">Sin etiqueta destacada</option>
              {PRESET_BADGES.filter(Boolean).map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* PROS / CONTRAS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              placeholder="+ Pros (Ej. Envío en 24h, 2 años garantía)"
              value={draft.pros}
              onChange={(e) => setDraft({ ...draft, pros: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="- Contras (Ej. Sin stock en color negro)"
              value={draft.cons}
              onChange={(e) => setDraft({ ...draft, cons: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeForm}
              className="px-3 py-1.5 rounded-xl border border-line bg-surface text-xs font-semibold text-muted hover:text-ink cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent text-accent-on text-xs font-bold shadow-sm hover:brightness-110 cursor-pointer"
            >
              <Icon name="check" size={14} />
              {editingOptionId ? 'Guardar opción' : 'Añadir'}
            </button>
          </div>
        </form>
      )}

      {/* MATRIZ VISUAL DE DECISIÓN */}
      {options.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {options.map((opt) => {
            const isChosen = item.selectedOptionId === opt.id;
            const isBestCash = winners.bestCashId === opt.id;
            const isLowestInst = winners.lowestInstallmentId === opt.id;
            const isBestValue = winners.bestValueId === opt.id;
            const title = opt.label || [opt.brand, opt.model].filter(Boolean).join(' ') || opt.storeName || 'Alternativa';
            const subtitle = [opt.storeName, opt.storeLocation, opt.label ? [opt.brand, opt.model].filter(Boolean).join(' ') : '']
              .filter(Boolean)
              .join(' · ');
            const instText = formatInstallments(opt.installments);

            return (
              <div
                key={opt.id}
                className={`flex flex-col justify-between rounded-2xl border p-3.5 transition-all ${
                  isChosen
                    ? 'border-accent bg-accent-soft/25 shadow-sm'
                    : 'border-line bg-surface-2/60 hover:border-line-strong'
                }`}
              >
                <div>
                  {/* BADGES AUTOMÁTICOS Y PERSONALIZADOS */}
                  <div className="flex flex-wrap items-center gap-1 mb-2">
                    {isChosen && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-accent-on text-[0.6rem] font-bold uppercase tracking-wide">
                        <Icon name="check" size={10} /> Elegida
                      </span>
                    )}
                    {isBestCash && (
                      <span className="px-2 py-0.5 rounded-full bg-low-soft text-low border border-low/20 text-[0.6rem] font-bold">
                        Mejor contado
                      </span>
                    )}
                    {isLowestInst && (
                      <span className="px-2 py-0.5 rounded-full bg-medium-soft text-medium border border-medium/20 text-[0.6rem] font-bold">
                        Cuota más baja
                      </span>
                    )}
                    {isBestValue && !isBestCash && (
                      <span className="px-2 py-0.5 rounded-full bg-high-soft text-high border border-high/20 text-[0.6rem] font-bold">
                        Mejor precio/calidad
                      </span>
                    )}
                    {opt.badge && (
                      <span className="px-2 py-0.5 rounded-full bg-surface border border-line text-ink-soft text-[0.6rem] font-bold">
                        {opt.badge}
                      </span>
                    )}
                  </div>

                  {/* TÍTULO Y ESTRELLAS */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h5 className="text-sm font-bold text-ink truncate" title={title}>
                        {title}
                      </h5>
                      {subtitle && (
                        <p className="text-[0.68rem] text-muted truncate" title={subtitle}>
                          {subtitle}
                        </p>
                      )}
                    </div>

                    {opt.rating > 0 && (
                      <span
                        className="shrink-0 text-xs font-bold text-medium tracking-tight"
                        title={`Calidad: ${opt.rating}/5`}
                      >
                        {'★'.repeat(opt.rating)}
                        <span className="text-muted/30">{'★'.repeat(5 - opt.rating)}</span>
                      </span>
                    )}
                  </div>

                  {/* PRECIO Y CUOTAS */}
                  <div className="mt-2.5 flex flex-wrap items-baseline gap-2">
                    <span className="text-base font-bold text-ink tabular-nums">
                      {money(opt.price)}
                    </span>
                    {instText && (
                      <span className="text-[0.68rem] font-semibold text-medium bg-medium-soft px-2 py-0.5 rounded-full">
                        {instText}
                      </span>
                    )}
                  </div>

                  {/* PROS / CONTRAS */}
                  {(opt.pros || opt.cons) && (
                    <div className="mt-2.5 space-y-1 text-[0.68rem]">
                      {opt.pros && (
                        <p className="text-low font-medium line-clamp-1" title={opt.pros}>
                          + {opt.pros}
                        </p>
                      )}
                      {opt.cons && (
                        <p className="text-danger font-medium line-clamp-1" title={opt.cons}>
                          − {opt.cons}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ACCIONES DE LA OPCIÓN */}
                <div className="mt-3 pt-2.5 border-t border-line/60 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleChooseOption(opt)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[0.7rem] font-bold transition-colors cursor-pointer ${
                      isChosen
                        ? 'bg-accent/15 text-accent-ink'
                        : 'bg-accent text-accent-on hover:brightness-110'
                    }`}
                  >
                    <Icon name="check" size={12} />
                    {isChosen ? 'Aplicada' : 'Elegir esta opción'}
                  </button>

                  <div className="flex items-center gap-0.5">
                    {opt.purchaseUrl && (
                      <a
                        href={opt.purchaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid place-items-center w-7 h-7 rounded-lg text-muted hover:bg-surface hover:text-accent transition-colors"
                        title="Abrir enlace"
                        aria-label="Abrir enlace"
                      >
                        <Icon name="globe" size={13} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(opt)}
                      className="grid place-items-center w-7 h-7 rounded-lg text-muted hover:bg-surface hover:text-ink transition-colors cursor-pointer"
                      title="Editar opción"
                      aria-label="Editar opción"
                    >
                      <Icon name="edit" size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteOption(opt.id)}
                      className="grid place-items-center w-7 h-7 rounded-lg text-muted hover:bg-danger-soft hover:text-danger transition-colors cursor-pointer"
                      title="Eliminar opción"
                      aria-label="Eliminar opción"
                    >
                      <Icon name="delete" size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !isAdding && (
          <p className="text-xs text-muted italic bg-surface-2/50 border border-dashed border-line rounded-2xl p-4 text-center">
            Todavía no cargaste alternativas para este artículo.
          </p>
        )
      )}
    </div>
  );
}