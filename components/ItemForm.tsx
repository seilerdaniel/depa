'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useApp } from '@/state/AppProvider';
import {
  normalizeLabel, parsePrice, parseDimension, normalizeUrl,
  optimizePhoto, estimateKb, sameText,
} from '@/lib/utils';
import { PRIORITY, CATEGORY_MAX_LENGTH, SUBCATEGORY_MAX_LENGTH } from '@/lib/config';
import { Icon } from './Icon';

interface FormState {
  name: string;
  category: string;
  subcategory: string;
  price: string;
  priority: 'urgente' | 'media' | 'baja';
  wishlist: boolean;
  purchaseMonth: string;
  installments: string;
  installmentAmount: string;
  imageUrl: string;
  photoData: string;
  purchaseUrl: string;
  storeName: string;
  storeLocation: string;
  height: string;
  width: string;
  depth: string;
  notes: string;
}

type Errors = Partial<Record<'name' | 'category' | 'price' | 'imageUrl' | 'purchaseUrl' | 'dimensions' | 'installments', string>>;

const EMPTY: FormState = {
  name: '', category: '', subcategory: '', price: '', priority: 'media', wishlist: false,
  purchaseMonth: '', installments: '', installmentAmount: '', imageUrl: '', photoData: '',
  purchaseUrl: '', storeName: '', storeLocation: '', height: '', width: '', depth: '', notes: ''
};

export function ItemForm() {
  const { items, categories, addItem, updateItem, addCategory, editingItem, setEditingItem } = useApp();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [showCatCreator, setShowCatCreator] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [newCatErr, setNewCatErr] = useState('');
  const [photoStatus, setPhotoStatus] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Efecto para cargar los datos si estamos en modo edición
  useEffect(() => {
    if (editingItem) {
      setForm({
        name: editingItem.name,
        category: editingItem.category,
        subcategory: editingItem.subcategory,
        price: String(editingItem.price),
        priority: editingItem.priority,
        wishlist: editingItem.wishlist,
        purchaseMonth: editingItem.purchaseMonth || '',
        installments: editingItem.installments ? String(editingItem.installments.count) : '',
        installmentAmount: editingItem.installments ? String(editingItem.installments.amount) : '',
        imageUrl: editingItem.imageUrl,
        photoData: editingItem.imageData,
        purchaseUrl: editingItem.purchaseUrl,
        storeName: editingItem.storeName,
        storeLocation: editingItem.storeLocation,
        height: editingItem.dimensions?.height ? String(editingItem.dimensions.height) : '',
        width: editingItem.dimensions?.width ? String(editingItem.dimensions.width) : '',
        depth: editingItem.dimensions?.depth ? String(editingItem.dimensions.depth) : '',
        notes: editingItem.notes || '',
      });
      setErrors({});
      setPhotoStatus('');
    } else {
      setForm(EMPTY);
    }
  }, [editingItem]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const clearError = (key: keyof Errors) => setErrors((e) => ({ ...e, [key]: undefined }));

  const subcategories = useMemo(() => {
    const names = new Map<string, string>();
    for (const it of items) {
      if (!it.subcategory) continue;
      if (form.category && !sameText(it.category, form.category)) continue;
      const k = it.subcategory.toLocaleLowerCase('es');
      if (!names.has(k)) names.set(k, it.subcategory);
    }
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, 'es'));
  }, [items, form.category]);

  const handlePhoto = async (file: File) => {
    setPhotoBusy(true);
    setPhotoStatus('Procesando foto…');
    setErrors((e) => ({ ...e, imageUrl: undefined }));
    try {
      const dataUrl = await optimizePhoto(file);
      update('photoData', dataUrl);
      setPhotoStatus(`Foto lista (${estimateKb(dataUrl)} KB).`);
    } catch (err: any) {
      setPhotoStatus('');
      setErrors((e) => ({ ...e, imageUrl: err.message || 'No se pudo procesar la imagen.' }));
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setForm(EMPTY);
    setErrors({});
    setPhotoStatus('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (photoBusy) return;
    const errs: Errors = {};

    const name = normalizeLabel(form.name, 60);
    if (!name) errs.name = 'Ingresá el nombre del artículo.';

    const category = form.category;
    if (!category) errs.category = 'Elegí una categoría.';

    const price = parsePrice(form.price);
    if (!Number.isFinite(price) || price < 0) errs.price = 'Ingresá un precio válido (ej. 250.000).';

    const imageUrl = normalizeUrl(form.imageUrl, true);
    if (imageUrl === null) errs.imageUrl = 'Ingresá una URL de imagen válida.';

    const purchaseUrl = normalizeUrl(form.purchaseUrl);
    if (purchaseUrl === null) errs.purchaseUrl = 'Ingresá una URL válida (https://...).';

    const h = parseDimension(form.height);
    const w = parseDimension(form.width);
    const d = parseDimension(form.depth);
    if ([h, w, d].some((v) => Number.isNaN(v))) errs.dimensions = 'Medidas inválidas (solo números > 0).';

    const countRaw = form.installments.trim();
    const amountRaw = form.installmentAmount.trim();
    let installments: { count: number; amount: number } | null = null;
    if (countRaw || amountRaw) {
      const c = Number(countRaw);
      const a = parsePrice(amountRaw);
      if (!Number.isInteger(c) || c < 1 || c > 72) errs.installments = 'Cuotas: número entero entre 1 y 72.';
      else if (!Number.isFinite(a) || a <= 0) errs.installments = 'Valor de cuota inválido.';
      else installments = { count: c, amount: Math.round(a * 100) / 100 };
    }

    if (Object.keys(errs).some((k) => errs[k as keyof Errors])) {
      setErrors(errs);
      return;
    }

    const dimensions = [h, w, d].some((v) => typeof v === 'number')
      ? { height: typeof h === 'number' ? h : null, width: typeof w === 'number' ? w : null, depth: typeof d === 'number' ? d : null }
      : null;

    const itemData = {
      name,
      category,
      subcategory: normalizeLabel(form.subcategory, SUBCATEGORY_MAX_LENGTH),
      price: Math.round(price * 100) / 100,
      priority: PRIORITY.has(form.priority) ? form.priority : 'media' as const,
      wishlist: form.wishlist,
      purchaseMonth: form.purchaseMonth || null,
      purchaseUrl: purchaseUrl || '',
      imageUrl: imageUrl || '',
      imageData: form.photoData || '',
      storeName: normalizeLabel(form.storeName, 80),
      storeLocation: normalizeLabel(form.storeLocation, 120),
      dimensions,
      installments,
      notes: normalizeLabel(form.notes, 250)
    };

    if (editingItem) {
      updateItem({ ...editingItem, ...itemData });
      setEditingItem(null);
    } else {
      addItem(itemData);
    }

    setForm(EMPTY);
    setErrors({});
    setPhotoStatus('');
    nameRef.current?.focus();
  };

  const createCat = () => {
    const name = normalizeLabel(newCat, CATEGORY_MAX_LENGTH);
    if (!name) { setNewCatErr('Escribí un nombre.'); return; }
    if (!addCategory(name)) { setNewCatErr('Esa categoría ya existe.'); return; }
    update('category', name);
    setNewCat('');
    setNewCatErr('');
    setShowCatCreator(false);
  };

  const inputCls = (invalid: boolean) =>
    `w-full min-h-[44px] px-3 border rounded-xl bg-surface text-ink text-[0.95rem] focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/20 transition-colors ${invalid ? 'border-danger' : 'border-line-strong'}`;

  return (
    <section className="p-5 border border-line rounded-3xl bg-surface shadow-soft">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">
            {editingItem ? 'Editar artículo' : 'Agregar artículo'}
          </h2>
          <p className="text-sm text-muted mt-0.5">
            {editingItem ? 'Modificá los datos y guardá los cambios.' : 'Completá lo básico; foto, cuotas, tienda y medidas son opcionales.'}
          </p>
        </div>
        {editingItem && (
          <button
            type="button"
            onClick={cancelEdit}
            className="text-xs font-semibold text-muted hover:text-danger transition-colors px-2 py-1 rounded-md hover:bg-danger-soft"
          >
            Cancelar edición
          </button>
        )}
      </div>

      {/* FORMULARIO EN GRID DE 2 COLUMNAS (1 en móviles) */}
      <form onSubmit={submit} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        
        <div className="sm:col-span-2">
          <Field label="Nombre del artículo" error={errors.name}>
            <input ref={nameRef} type="text" maxLength={60} placeholder="Ej. Heladera con freezer" value={form.name} onChange={(e) => { update('name', e.target.value); clearError('name'); }} className={inputCls(!!errors.name)} />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Categoría" error={errors.category}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select value={form.category} onChange={(e) => { update('category', e.target.value); clearError('category'); }} className={`${inputCls(!!errors.category)} pr-10 appearance-none cursor-pointer`}>
                  <option value="" disabled>Elegí una categoría</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <Icon name="chevron" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
              <button type="button" onClick={() => setShowCatCreator((s) => !s)} aria-label="Crear nueva categoría" aria-expanded={showCatCreator} className="w-11 h-11 shrink-0 border border-line-strong rounded-xl bg-surface text-muted hover:border-accent hover:bg-accent-soft hover:text-accent-ink transition-colors flex items-center justify-center">
                <Icon name="add" size={17} />
              </button>
            </div>

            {showCatCreator && (
              <div className="grid gap-1.5 mt-2 p-2.5 border border-dashed border-line-strong rounded-xl bg-surface-2 animate-in slide-in-from-top-2 duration-200">
                <label className="text-xs font-semibold text-ink-soft">Nueva categoría</label>
                <div className="flex items-center gap-2">
                  <input type="text" maxLength={40} value={newCat} placeholder="Ej. Iluminación" onChange={(e) => { setNewCat(e.target.value); setNewCatErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createCat(); } if (e.key === 'Escape') setShowCatCreator(false); }} className="flex-1 min-h-[38px] px-3 border border-line-strong rounded-xl bg-surface text-ink text-sm focus:outline-none focus:border-accent" />
                  <button type="button" onClick={createCat} className="min-h-[38px] px-3.5 rounded-xl bg-accent text-accent-on text-sm font-semibold hover:bg-accent-ink transition-colors">Crear</button>
                  <button type="button" onClick={() => { setShowCatCreator(false); setNewCatErr(''); }} aria-label="Cancelar" className="grid place-items-center w-9 h-9 rounded-xl text-muted hover:bg-danger-soft hover:text-danger transition-colors"><Icon name="cancel" size={15} /></button>
                </div>
                {newCatErr && <p className="text-xs text-danger">{newCatErr}</p>}
              </div>
            )}
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label={<>Subcategoría <span className="ml-1 px-1.5 py-0.5 rounded-full bg-surface-2 text-muted text-[0.62rem] font-bold uppercase tracking-wider">Opcional</span></>}>
            <input type="text" maxLength={40} list="subcategory-options" placeholder="Ej. Living" value={form.subcategory} onChange={(e) => update('subcategory', e.target.value)} className={inputCls(false)} />
            <datalist id="subcategory-options">
              {subcategories.map((s) => <option key={s} value={s} />)}
            </datalist>
          </Field>
        </div>

        {/* Precio y Prioridad en 2 columnas */}
        <Field label="Precio total" error={errors.price}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-semibold" aria-hidden="true">$</span>
            <input type="text" inputMode="decimal" maxLength={20} placeholder="1.200.000" value={form.price} onChange={(e) => { update('price', e.target.value); clearError('price'); }} className={`${inputCls(!!errors.price)} pl-7 tabular-nums`} />
          </div>
        </Field>

        <Field label="Prioridad">
          <div className="relative">
            <select value={form.priority} onChange={(e) => update('priority', e.target.value as any)} className={`${inputCls(false)} pr-10 appearance-none cursor-pointer`}>
              <option value="urgente">Urgente</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
            <Icon name="chevron" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </Field>

        {/* Mes y URL en 2 columnas */}
        <Field label="Mes planificado">
          <input type="month" value={form.purchaseMonth} onChange={(e) => update('purchaseMonth', e.target.value)} className={`${inputCls(false)} cursor-pointer text-sm`} />
        </Field>

        <Field label="URL del artículo" error={errors.purchaseUrl}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true"><Icon name="globe" size={14} /></span>
            <input type="url" placeholder="https://..." value={form.purchaseUrl} onChange={(e) => { update('purchaseUrl', e.target.value); clearError('purchaseUrl'); }} className={`${inputCls(!!errors.purchaseUrl)} pl-8 text-sm`} />
          </div>
        </Field>

        <div className="sm:col-span-2">
          <Field label={<>Notas <span className="ml-1 px-1.5 py-0.5 rounded-full bg-surface-2 text-muted text-[0.62rem] font-bold uppercase tracking-wider">Opcional</span></>}>
            <textarea rows={2} maxLength={250} placeholder="Ej. Medidas del mueble, color, sucursal donde lo vi..." value={form.notes} onChange={(e) => update('notes', e.target.value)} className={`${inputCls(false)} py-2 resize-none min-h-[60px]`} />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <label className={`flex items-start gap-2.5 p-3 border rounded-xl cursor-pointer transition-colors ${form.wishlist ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2 hover:bg-surface-3'}`}>
            <input type="checkbox" id="item-wishlist" checked={form.wishlist} onChange={(e) => update('wishlist', e.target.checked)} className="sr-only peer" />
            <span className={`relative w-[38px] h-[22px] mt-0.5 rounded-full shrink-0 transition-colors ${form.wishlist ? 'bg-accent' : 'bg-line-strong'}`}>
              <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${form.wishlist ? 'translate-x-4' : ''}`} />
            </span>
            <span className="grid gap-px min-w-0">
              <span className="text-sm font-semibold text-ink">Wishlist / Futuro</span>
              <span className="text-xs text-muted leading-tight mt-0.5">No suma al presupuesto hasta que lo compres.</span>
            </span>
          </label>
        </div>

        {/* Secciones colapsables abarcan las 2 columnas */}
        <div className="sm:col-span-2">
          <Section icon="finance" title="Financiación (Cuotas)" defaultOpen={false}>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Cuotas"><input type="number" inputMode="numeric" min={1} max={72} placeholder="Ej. 6" value={form.installments} onChange={(e) => { update('installments', e.target.value); clearError('installments'); }} className={inputCls(!!errors.installments)} /></Field>
              <div className="col-span-2">
                <Field label="Valor de cada cuota"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-semibold" aria-hidden="true">$</span><input type="text" inputMode="decimal" placeholder="50.000" value={form.installmentAmount} onChange={(e) => { update('installmentAmount', e.target.value); clearError('installments'); }} className={`${inputCls(!!errors.installments)} pl-7 tabular-nums`} /></div></Field>
              </div>
            </div>
            {errors.installments && <p className="text-xs text-danger">{errors.installments}</p>}
          </Section>
        </div>

        <div className="sm:col-span-2">
          <Section icon="photo" title="Foto del producto" defaultOpen={false}>
            <Field label="URL de la imagen" error={errors.imageUrl}><input type="url" placeholder="https://.../foto.jpg" value={form.imageUrl} onChange={(e) => { update('imageUrl', e.target.value); clearError('imageUrl'); }} className={inputCls(!!errors.imageUrl)} /></Field>
            <div className="flex items-center gap-2.5">
              {form.photoData && (
                <div className="relative w-16 h-16 shrink-0 overflow-hidden border border-line rounded-xl bg-surface-2">
                  <img src={form.photoData} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => { update('photoData', ''); setPhotoStatus(''); }} className="absolute top-0.5 right-0.5 grid place-items-center w-5 h-5 rounded-full bg-black/80 text-white hover:bg-danger"><Icon name="cancel" size={13} /></button>
                </div>
              )}
              <label className="inline-flex items-center justify-center flex-1 min-h-[44px] px-3 border border-dashed border-line-strong rounded-xl bg-surface-2 text-ink-soft text-xs font-semibold cursor-pointer hover:border-accent hover:text-accent-ink transition-colors">
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }} />
                {form.photoData ? 'Cambiar foto' : 'Tomar o subir foto'}
              </label>
            </div>
            {photoStatus && <p className="text-xs text-accent-ink font-semibold mt-1">{photoStatus}</p>}
          </Section>
        </div>

        <div className="sm:col-span-2">
          <Section icon="store" title="Tienda Física / Medidas" defaultOpen={false}>
            <Field label="Comercio físico"><input type="text" placeholder="Ej. Bazar Central" value={form.storeName} onChange={(e) => update('storeName', e.target.value)} className={inputCls(false)} /></Field>
            <Field label="Ubicación / Dirección"><input type="text" placeholder="Ej. Av. Rivadavia 1234" value={form.storeLocation} onChange={(e) => update('storeLocation', e.target.value)} className={inputCls(false)} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Alto (cm)"><input type="text" inputMode="numeric" value={form.height} onChange={(e) => { update('height', e.target.value); clearError('dimensions'); }} className={inputCls(!!errors.dimensions)} /></Field>
              <Field label="Ancho (cm)"><input type="text" inputMode="numeric" value={form.width} onChange={(e) => { update('width', e.target.value); clearError('dimensions'); }} className={inputCls(!!errors.dimensions)} /></Field>
              <Field label="Prof. (cm)"><input type="text" inputMode="numeric" value={form.depth} onChange={(e) => { update('depth', e.target.value); clearError('dimensions'); }} className={inputCls(!!errors.dimensions)} /></Field>
            </div>
            {errors.dimensions && <p className="text-xs text-danger">{errors.dimensions}</p>}
          </Section>
        </div>

        {/* Botón Sticky para que siempre esté visible al scrollear el formulario */}
        <div className="sm:col-span-2 sticky bottom-0 pt-3 pb-1 mt-2 bg-surface/95 backdrop-blur-sm z-10 border-t border-line/50">
          <button type="submit" disabled={photoBusy} className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-accent text-accent-on font-semibold hover:bg-accent-ink transition-colors disabled:opacity-60 shadow-sm">
            <Icon name={editingItem ? 'check' : 'add'} size={17} />
            {editingItem ? 'Guardar cambios' : (form.wishlist ? 'Agregar a la wishlist' : 'Agregar a la lista')}
          </button>
        </div>
      </form>
    </section>
  );
}

// --- Componentes Auxiliares ---

function Field({ label, error, children }: { label: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 min-w-0">
      <label className="text-sm font-semibold text-ink-soft truncate">{label}</label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function Section({ icon, title, defaultOpen = false, children }: { icon: string; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group border-t border-line [&[open]>summary_.chev]:rotate-180">
      <summary className="flex items-center gap-2 py-3 cursor-pointer list-none rounded-lg text-ink-soft text-sm font-semibold hover:text-ink [&::-webkit-details-marker]:hidden select-none">
        <span className="grid place-items-center w-7 h-7 rounded-lg bg-surface-2 text-muted">
          <Icon name={icon} size={16} />
        </span>
        <span className="flex-1">{title}</span>
        <span className="px-2 py-0.5 rounded-full bg-surface-2 text-muted text-[0.62rem] font-bold uppercase tracking-wider">Opcional</span>
        <Icon name="chevron" size={15} className="chev ml-auto transition-transform duration-200" />
      </summary>
      <div className="grid gap-3 pb-4">{children}</div>
    </details>
  );
}