'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useData, usePrefs, useToast, useUI } from '@/state/AppProvider';
import {
  DEFAULT_ITEM_FIELDS,
  MAX_UPLOAD_BYTES,
  PRIORITIES,
  SUBCATEGORY_MAX_LENGTH,
} from '@/lib/config';
import { persistImageToDisk, useResolvedImageSrc } from '@/lib/nativeImages';
import { moneyWithCurrency, normalizeLabel, parsePrice, sameText } from '@/lib/utils';
import type { Currency, Dimensions, Installments, Item, Priority } from '@/lib/types';
import { CURRENCY_OPTIONS } from '@/lib/config';
import { Icon } from './Icon';
import { QuickCategoryAdd } from './QuickCategoryAdd';

const NAME_MAX_LENGTH = 100;
const NOTES_MAX_LENGTH = 1000;

async function compressImage(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo procesar la imagen.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

type FormTab = 'basic' | 'details' | 'extra';

interface FormState {
  name: string;
  category: string;
  subcategory: string;
  price: string;
  currency: Currency;
  priority: Priority;
  wishlist: boolean;
  purchaseMonth: string;
  hasInstallments: boolean;
  installmentsCount: string;
  installmentsAmount: string;
  purchaseUrl: string;
  storeName: string;
  storeLocation: string;
  brand: string;
  model: string;
  color: string;
  width: string;
  height: string;
  depth: string;
  warranty: string;
  orderNumber: string;
  notes: string;
  imageUrl: string;
  imageData: string | null;
}

const inputCls = (hasError: boolean) =>
  `w-full rounded-xl border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors ${
    hasError ? 'border-danger focus:border-danger' : 'border-line focus:border-accent'
  }`;

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-ink-soft">{label}</span>
        {hint && <span className="text-[0.68rem] text-muted">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </label>
  );
}

function buildInitialState(
  editingItem: Item | null,
  categories: string[],
  defaultWishlist: boolean,
): FormState {
  if (!editingItem) {
    return {
      name: '',
      category: categories[0] ?? 'Otros',
      subcategory: '',
      price: '',
      currency: 'ARS',
      priority: 'media',
      wishlist: defaultWishlist,
      purchaseMonth: '',
      hasInstallments: false,
      installmentsCount: '3',
      installmentsAmount: '',
      purchaseUrl: '',
      storeName: '',
      storeLocation: '',
      brand: '',
      model: '',
      color: '',
      width: '',
      height: '',
      depth: '',
      warranty: '',
      orderNumber: '',
      notes: '',
      imageUrl: '',
      imageData: null,
    };
  }

  return {
    name: editingItem.name,
    category: editingItem.category,
    subcategory: editingItem.subcategory ?? '',
    price: editingItem.price > 0 ? String(editingItem.price) : '',
    currency: editingItem.currency ?? 'ARS',
    priority: editingItem.priority,
    wishlist: editingItem.wishlist,
    purchaseMonth: editingItem.purchaseMonth ?? '',
    hasInstallments: Boolean(editingItem.installments),
    installmentsCount: editingItem.installments ? String(editingItem.installments.count) : '3',
    installmentsAmount: editingItem.installments ? String(editingItem.installments.amount) : '',
    purchaseUrl: editingItem.purchaseUrl ?? '',
    storeName: editingItem.storeName ?? '',
    storeLocation: editingItem.storeLocation ?? '',
    brand: editingItem.brand ?? '',
    model: editingItem.model ?? '',
    color: editingItem.color ?? '',
    width: editingItem.dimensions?.width ? String(editingItem.dimensions.width) : '',
    height: editingItem.dimensions?.height ? String(editingItem.dimensions.height) : '',
    depth: editingItem.dimensions?.depth ? String(editingItem.dimensions.depth) : '',
    warranty: editingItem.warranty ? String(editingItem.warranty) : '',
    orderNumber: editingItem.orderNumber ?? '',
    notes: editingItem.notes ?? '',
    imageUrl: editingItem.imageUrl ?? '',
    imageData: editingItem.imageData ?? null,
  };
}

export function ItemForm() {
  const { items, categories, addItem, updateItem } = useData();
  const { prefs } = usePrefs();
  const { view, editingItem, setEditingItem } = useUI();
  const { showToast } = useToast();

  const fields = useMemo(
    () => ({ ...DEFAULT_ITEM_FIELDS, ...(prefs.itemFields ?? {}) }),
    [prefs.itemFields],
  );

  const [activeTab, setActiveTab] = useState<FormTab>('basic');
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(editingItem, categories, view === 'wishlist'),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reconstruye el formulario al cambiar de artículo o de vista. `categories`
  // queda fuera a propósito: crear una categoría nueva a mitad de la carga
  // borraría todo lo que el usuario ya escribió.
  useEffect(() => {
    setForm(buildInitialState(editingItem, categories, view === 'wishlist'));
    setErrors({});
    setActiveTab('basic');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem, view]);

  // Si la categoría elegida deja de existir, cae en la primera disponible.
  useEffect(() => {
    setForm((prev) =>
      categories.some((category) => sameText(category, prev.category))
        ? prev
        : { ...prev, category: categories[0] ?? 'Otros' },
    );
  }, [categories]);

  const hasDetailsTab = fields.store || fields.specs || fields.warranty || fields.orderNumber;
  const hasExtraTab = fields.notes || fields.photo;

  const visibleTabs = useMemo(() => {
    const tabs: { id: FormTab; label: string }[] = [{ id: 'basic', label: 'Básico' }];
    if (hasDetailsTab) tabs.push({ id: 'details', label: 'Detalles' });
    if (hasExtraTab) tabs.push({ id: 'extra', label: 'Notas y foto' });
    return tabs;
  }, [hasDetailsTab, hasExtraTab]);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab('basic');
    }
  }, [visibleTabs, activeTab]);

  const subcategoriesForCategory = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.category === form.category && item.subcategory) {
        set.add(item.subcategory);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [items, form.category]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handlePriceChange = (rawPrice: string) => {
    update('price', rawPrice);
    if (form.hasInstallments) {
      const parsedPrice = parsePrice(rawPrice);
      const count = parseInt(form.installmentsCount, 10);
      if (!Number.isNaN(parsedPrice) && parsedPrice > 0 && count > 0) {
        update('installmentsAmount', String(Math.round((parsedPrice / count) * 100) / 100));
      }
    }
  };

  const handleInstallmentsCountChange = (rawCount: string) => {
    update('installmentsCount', rawCount);
    const parsedPrice = parsePrice(form.price);
    const count = parseInt(rawCount, 10);
    if (!Number.isNaN(parsedPrice) && parsedPrice > 0 && count > 0) {
      update('installmentsAmount', String(Math.round((parsedPrice / count) * 100) / 100));
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      showToast('La imagen supera el tamaño máximo permitido.');
      return;
    }

    setIsCompressing(true);
    try {
      const dataUrl = await compressImage(file);
      const targetId = editingItem?.id ?? `draft-${Date.now()}`;
      const storedRef = await persistImageToDisk(dataUrl, targetId);

      update('imageData', storedRef);
      update('imageUrl', '');
    } catch {
      showToast('No se pudo procesar la imagen seleccionada.');
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const cleanName = normalizeLabel(form.name, NAME_MAX_LENGTH);
    const parsedPrice = form.price.trim() ? parsePrice(form.price) : 0;

    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (!cleanName) {
      nextErrors.name = 'Ingresá un nombre para el artículo.';
    }
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      nextErrors.price = 'Ingresá un monto válido (0 o mayor).';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setActiveTab('basic');
      return;
    }

    const subcategory = fields.subcategory
      ? normalizeLabel(form.subcategory, SUBCATEGORY_MAX_LENGTH)
      : (editingItem?.subcategory ?? '');

    const priority: Priority = fields.priority
      ? form.priority
      : (editingItem?.priority ?? 'media');

    const purchaseMonth = fields.purchaseMonth
      ? (form.purchaseMonth.trim() || null)
      : (editingItem?.purchaseMonth ?? null);

    let installments: Installments | null = editingItem?.installments ?? null;
    if (fields.installments) {
      if (form.hasInstallments) {
        const count = Math.max(1, parseInt(form.installmentsCount, 10) || 1);
        const amount = parsePrice(form.installmentsAmount);
        installments = {
          count,
          amount: !Number.isNaN(amount) && amount > 0
            ? amount
            : Math.round((parsedPrice / count) * 100) / 100,
        };
      } else {
        installments = null;
      }
    }

    const purchaseUrl = fields.purchaseUrl
      ? form.purchaseUrl.trim()
      : (editingItem?.purchaseUrl ?? '');

    const storeName = fields.store
      ? normalizeLabel(form.storeName, 80)
      : (editingItem?.storeName ?? '');

    const storeLocation = fields.store
      ? normalizeLabel(form.storeLocation, 80)
      : (editingItem?.storeLocation ?? '');

    const brand = fields.specs ? normalizeLabel(form.brand, 60) : (editingItem?.brand ?? '');
    const model = fields.specs ? normalizeLabel(form.model, 60) : (editingItem?.model ?? '');
    const color = fields.specs ? normalizeLabel(form.color, 40) : (editingItem?.color ?? '');

    let dimensions: Dimensions | null = editingItem?.dimensions ?? null;
    if (fields.specs) {
      const w = parseFloat(form.width);
      const h = parseFloat(form.height);
      const d = parseFloat(form.depth);
      const hasAnyDim =
        (Number.isFinite(w) && w > 0) ||
        (Number.isFinite(h) && h > 0) ||
        (Number.isFinite(d) && d > 0);
      dimensions = hasAnyDim
        ? {
            width: Number.isFinite(w) && w > 0 ? w : null,
            height: Number.isFinite(h) && h > 0 ? h : null,
            depth: Number.isFinite(d) && d > 0 ? d : null,
          }
        : null;
    }

    let warranty: number | null = editingItem?.warranty ?? null;
    if (fields.warranty) {
      const parsedWarranty = parseInt(form.warranty, 10);
      warranty = Number.isFinite(parsedWarranty) && parsedWarranty > 0 ? parsedWarranty : null;
    }

    const orderNumber = fields.orderNumber
      ? normalizeLabel(form.orderNumber, 60)
      : (editingItem?.orderNumber ?? '');

    const notes = fields.notes
      ? normalizeLabel(form.notes, NOTES_MAX_LENGTH)
      : (editingItem?.notes ?? '');

    const imageUrl = fields.photo
      ? form.imageUrl.trim()
      : (editingItem?.imageUrl ?? '');

    const imageData = fields.photo
      ? (form.imageData ?? '')
      : (editingItem?.imageData ?? '');

    const payload = {
      name: cleanName,
      category: form.category || 'Otros',
      subcategory,
      price: Math.round(parsedPrice * 100) / 100,
      currency: form.currency,
      priority,
      wishlist: form.wishlist,
      purchaseMonth,
      installments,
      purchaseUrl,
      storeName,
      storeLocation,
      brand,
      model,
      color,
      dimensions,
      warranty,
      orderNumber,
      notes,
      imageUrl,
      imageData,
    };

    if (editingItem) {
      updateItem({
        ...editingItem,
        ...payload,
        bought: payload.wishlist ? false : editingItem.bought,
      });
    } else {
      addItem(payload);
      setForm(buildInitialState(null, categories, view === 'wishlist'));
      setActiveTab('basic');
    }
  };

  // Resuelve tanto `local-img://...` como DataURL o URL externa para el <img>
  const previewImage = useResolvedImageSrc(
    form.imageData ?? '',
    form.imageUrl.trim(),
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-5"
    >
      {/* CABECERA */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <Icon name={editingItem ? 'edit' : 'plus'} size={18} className="text-accent" />
          {editingItem ? 'Editar artículo' : 'Nuevo artículo'}
        </h2>
        {editingItem && (
          <button
            type="button"
            onClick={() => setEditingItem(null)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <Icon name="cancel" size={14} />
            Cancelar
          </button>
        )}
      </div>

      {/* PESTAÑAS DINÁMICAS */}
      {visibleTabs.length > 1 && (
        <div role="tablist" className="mb-4 flex gap-1.5 border-b border-line pb-2.5">
          {visibleTabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t.id)}
                className={`cursor-pointer rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                  active
                    ? 'bg-accent text-accent-on shadow-sm'
                    : 'bg-surface-2/60 text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* PESTAÑA: BÁSICO */}
      {activeTab === 'basic' && (
        <div className="space-y-3.5">
          <Field label="Nombre del artículo *" error={errors.name}>
            <input
              type="text"
              placeholder="Ej. Heladera No Frost Samsung"
              maxLength={NAME_MAX_LENGTH}
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className={inputCls(Boolean(errors.name))}
            />
          </Field>

          <div className={`grid gap-3 ${fields.subcategory ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            <div className="grid gap-1.5">
              <span className="text-xs font-bold text-ink-soft">Categoría</span>
              <div className="flex items-stretch gap-2">
                <div className="relative flex-1">
                  <select
                    value={form.category}
                    onChange={(e) => update('category', e.target.value)}
                    aria-label="Categoría"
                    className={`${inputCls(false)} cursor-pointer appearance-none pr-9`}
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <Icon
                    name="chevron"
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                </div>

                <QuickCategoryAdd
                  variant="icon"
                  onCreated={(name) => update('category', name)}
                />
              </div>
            </div>

            {fields.subcategory && (
              <Field label="Subcategoría">
                <input
                  type="text"
                  list="depa-subcategories"
                  placeholder="Ej. Electrodomésticos"
                  maxLength={SUBCATEGORY_MAX_LENGTH}
                  value={form.subcategory}
                  onChange={(e) => update('subcategory', e.target.value)}
                  className={inputCls(false)}
                />
                <datalist id="depa-subcategories">
                  {subcategoriesForCategory.map((sub) => (
                    <option key={sub} value={sub} />
                  ))}
                </datalist>
              </Field>
            )}
          </div>

          <div className={`grid gap-3 ${fields.priority ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <Field label="Precio total" error={errors.price}>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.price}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  className={`${inputCls(Boolean(errors.price))} flex-1 font-bold tabular-nums`}
                />
                <select
                  aria-label="Moneda del precio"
                  value={form.currency}
                  onChange={(e) => update('currency', e.target.value as Currency)}
                  className={`${inputCls(false)} w-24 shrink-0 cursor-pointer tabular-nums`}
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.id}
                    </option>
                  ))}
                </select>
              </div>
            </Field>

            {fields.priority && (
              <Field label="Prioridad">
                <div className="relative">
                  <select
                    value={form.priority}
                    onChange={(e) => update('priority', e.target.value as Priority)}
                    className={`${inputCls(false)} cursor-pointer appearance-none pr-9`}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <Icon
                    name="chevron"
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                </div>
              </Field>
            )}
          </div>

          {fields.purchaseMonth && (
            <Field label="Mes estimado de compra">
              <input
                type="month"
                value={form.purchaseMonth}
                onChange={(e) => update('purchaseMonth', e.target.value)}
                className={inputCls(false)}
              />
            </Field>
          )}

          {fields.installments && (
            <div className="rounded-2xl border border-line bg-surface-2/40 p-3">
              <label className="flex cursor-pointer items-center justify-between gap-2">
                <span className="text-xs font-bold text-ink">Pago en cuotas</span>
                <input
                  type="checkbox"
                  checked={form.hasInstallments}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    update('hasInstallments', checked);
                    if (checked) {
                      const parsedPrice = parsePrice(form.price);
                      const count = parseInt(form.installmentsCount, 10) || 3;
                      if (!Number.isNaN(parsedPrice) && parsedPrice > 0) {
                        update(
                          'installmentsAmount',
                          String(Math.round((parsedPrice / count) * 100) / 100),
                        );
                      }
                    }
                  }}
                  className="h-4 w-4 cursor-pointer accent-accent"
                />
              </label>

              {form.hasInstallments && (
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <Field label="Cantidad">
                    <input
                      type="number"
                      min={1}
                      max={72}
                      value={form.installmentsCount}
                      onChange={(e) => handleInstallmentsCountChange(e.target.value)}
                      className={`${inputCls(false)} tabular-nums`}
                    />
                  </Field>
                  <Field label="Valor por cuota">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={form.installmentsAmount}
                      onChange={(e) => update('installmentsAmount', e.target.value)}
                      className={`${inputCls(false)} tabular-nums`}
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          {fields.purchaseUrl && (
            <Field label="Link de compra">
              <input
                type="url"
                placeholder="https://..."
                value={form.purchaseUrl}
                onChange={(e) => update('purchaseUrl', e.target.value)}
                className={inputCls(false)}
              />
            </Field>
          )}

          <label className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-line bg-surface-2/40 px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.wishlist}
              onChange={(e) => update('wishlist', e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-accent"
            />
            <span className="text-xs font-semibold text-ink">
              Guardar en Wishlist (idea a futuro, no suma al presupuesto)
            </span>
          </label>
        </div>
      )}

      {/* PESTAÑA: DETALLES */}
      {activeTab === 'details' && hasDetailsTab && (
        <div className="space-y-3.5">
          {fields.store && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tienda / Local">
                <input
                  type="text"
                  placeholder="Ej. Mercado Libre, Frávega"
                  value={form.storeName}
                  onChange={(e) => update('storeName', e.target.value)}
                  className={inputCls(false)}
                />
              </Field>
              <Field label="Ubicación / Sucursal">
                <input
                  type="text"
                  placeholder="Ej. Online, Palermo"
                  value={form.storeLocation}
                  onChange={(e) => update('storeLocation', e.target.value)}
                  className={inputCls(false)}
                />
              </Field>
            </div>
          )}

          {fields.specs && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Marca">
                  <input
                    type="text"
                    placeholder="Ej. Samsung"
                    value={form.brand}
                    onChange={(e) => update('brand', e.target.value)}
                    className={inputCls(false)}
                  />
                </Field>
                <Field label="Modelo">
                  <input
                    type="text"
                    placeholder="Ej. RT38"
                    value={form.model}
                    onChange={(e) => update('model', e.target.value)}
                    className={inputCls(false)}
                  />
                </Field>
                <Field label="Color">
                  <input
                    type="text"
                    placeholder="Ej. Inox"
                    value={form.color}
                    onChange={(e) => update('color', e.target.value)}
                    className={inputCls(false)}
                  />
                </Field>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-bold text-ink-soft">
                  Medidas en cm (Ancho × Alto × Prof.)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    placeholder="Ancho"
                    value={form.width}
                    onChange={(e) => update('width', e.target.value)}
                    className={`${inputCls(false)} tabular-nums`}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    placeholder="Alto"
                    value={form.height}
                    onChange={(e) => update('height', e.target.value)}
                    className={`${inputCls(false)} tabular-nums`}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    placeholder="Prof."
                    value={form.depth}
                    onChange={(e) => update('depth', e.target.value)}
                    className={`${inputCls(false)} tabular-nums`}
                  />
                </div>
              </div>
            </>
          )}

          {(fields.warranty || fields.orderNumber) && (
            <div className={`grid gap-3 ${fields.warranty && fields.orderNumber ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {fields.warranty && (
                <Field label="Garantía (meses)">
                  <input
                    type="number"
                    min={0}
                    placeholder="12"
                    value={form.warranty}
                    onChange={(e) => update('warranty', e.target.value)}
                    className={`${inputCls(false)} tabular-nums`}
                  />
                </Field>
              )}

              {fields.orderNumber && (
                <Field label="N° de pedido / factura">
                  <input
                    type="text"
                    placeholder="Ej. #98412"
                    value={form.orderNumber}
                    onChange={(e) => update('orderNumber', e.target.value)}
                    className={inputCls(false)}
                  />
                </Field>
              )}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA: NOTAS Y FOTO */}
      {activeTab === 'extra' && hasExtraTab && (
        <div className="space-y-3.5">
          {fields.notes && (
            <Field label="Notas" hint={`${form.notes.length}/${NOTES_MAX_LENGTH}`}>
              <textarea
                rows={3}
                maxLength={NOTES_MAX_LENGTH}
                placeholder="Detalles de entrega, descuentos bancarios, comparativas..."
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                className={`${inputCls(false)} resize-none`}
              />
            </Field>
          )}

          {fields.photo && (
            <div className="space-y-2.5">
              <span className="block text-xs font-bold text-ink-soft">Foto del artículo</span>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isCompressing}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-bold text-ink transition-colors hover:border-line-strong disabled:opacity-50"
                >
                  <Icon name="upload" size={14} />
                  {isCompressing ? 'Procesando...' : 'Subir imagen'}
                </button>

                {(previewImage || form.imageData || form.imageUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      update('imageData', null);
                      update('imageUrl', '');
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-danger/30 bg-danger-soft px-2.5 py-2 text-xs font-semibold text-danger"
                  >
                    <Icon name="trash" size={14} />
                    Quitar
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <Field label="O pegar URL de imagen">
                <input
                  type="url"
                  placeholder="https://..."
                  value={form.imageUrl}
                  onChange={(e) => {
                    update('imageUrl', e.target.value);
                    if (e.target.value.trim()) update('imageData', null);
                  }}
                  className={inputCls(false)}
                />
              </Field>

              {previewImage && (
                <div className="overflow-hidden rounded-2xl border border-line bg-surface-2 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewImage}
                    alt="Vista previa"
                    className="mx-auto max-h-40 rounded-xl object-contain"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* BOTÓN GUARDAR */}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-3.5">
        <span className="text-xs font-semibold text-muted tabular-nums">
          {parsePrice(form.price) > 0
            ? moneyWithCurrency(parsePrice(form.price), form.currency)
            : ''}
        </span>
        <button
          type="submit"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-bold text-accent-on shadow-sm transition-all hover:brightness-110"
        >
          <Icon name="check" size={16} />
          {editingItem ? 'Guardar cambios' : 'Agregar artículo'}
        </button>
      </div>
    </form>
  );
}