'use client';

import { useEffect, useRef, useState } from 'react';
import { usePurchasePayment, useUI } from '@/state/AppProvider';
import {
  money, formatDimensions, formatInstallments, formatMonth,
  getInstallmentStatus, formatInstallmentProgress, currentMonthKey,
} from '@/lib/utils';
import { useResolvedImageSrc } from '@/lib/nativeImages';
import { PRIORITY } from '@/lib/config';
import type { Priority } from '@/lib/types';
import { Icon } from './Icon';
import { OptionComparator } from './OptionComparator';

const PRIO_BADGE: Record<Priority, string> = {
  urgente: 'bg-urgent-soft text-urgent',
  alta: 'bg-high-soft text-high',
  media: 'bg-medium-soft text-medium',
  baja: 'bg-low-soft text-low',
};

export function ItemModal() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const { selectedItem, setSelectedItem, setEditingItem } = useUI();
  const payment = usePurchasePayment(selectedItem ?? { id: '', bought: false });

  // El resolver es un hook: debe ejecutarse antes del retorno temprano.
  const src = useResolvedImageSrc(selectedItem?.imageData ?? '', selectedItem?.imageUrl ?? '');

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsExpanded(false);
    setFailedSrc(null);
  }, [selectedItem?.id]);

  useEffect(() => {
    if (!selectedItem) return;

    dialogRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setSelectedItem(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedItem, setSelectedItem]);

  if (!selectedItem) return null;

  const item = selectedItem;
  const showImage = src.length > 0 && failedSrc !== src;
  const dims = formatDimensions(item.dimensions);
  const installments = formatInstallments(item.installments);
  const installmentStatus = getInstallmentStatus(item.installments, currentMonthKey());
  const progress = formatInstallmentProgress(installmentStatus);
  const hasTechnicalDetails = Boolean(item.brand || item.model || item.color);
  const hasWarranty = item.warranty != null && item.warranty > 0;

  const handleEdit = () => {
    setSelectedItem(null);
    setEditingItem(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => setSelectedItem(null)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-modal-title"
        tabIndex={-1}
        className="bg-surface w-full max-w-2xl max-h-[90vh] rounded-3xl border border-line shadow-2xl overflow-hidden flex flex-col outline-none animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABECERA */}
        <div className="flex items-center justify-between gap-2 p-4 border-b border-line bg-surface-2/30">
          <h3 id="item-modal-title" className="font-bold text-lg text-ink truncate pr-2">
            {item.name}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line bg-surface text-xs font-bold text-ink hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <Icon name="edit" size={14} />
              Editar
            </button>
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              aria-label="Cerrar detalle"
              className="p-2 rounded-full hover:bg-surface-3 text-muted hover:text-ink transition-colors cursor-pointer"
            >
              <Icon name="cancel" size={20} />
            </button>
          </div>
        </div>

        {/* CONTENIDO */}
        <div className="overflow-y-auto">
          <div
            className={`relative w-full bg-surface-2 border-b border-line flex items-center justify-center transition-all duration-300 ${
              showImage ? (isExpanded ? 'h-[60vh]' : 'aspect-video sm:aspect-[21/9]') : 'h-36 sm:h-44'
            }`}
          >
            {showImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={item.name}
                  className={`w-full h-full transition-all duration-300 ${isExpanded ? 'object-contain' : 'object-cover'}`}
                  onError={() => setFailedSrc(src)}
                />

                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="absolute bottom-3 right-3 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-sm transition-colors shadow-lg cursor-pointer"
                  aria-label={isExpanded ? 'Ajustar imagen a pantalla' : 'Expandir imagen'}
                  title={isExpanded ? 'Ajustar a pantalla' : 'Expandir imagen'}
                >
                  <Icon name={isExpanded ? 'minimize' : 'maximize'} size={16} />
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 px-6 text-center">
                <Icon name="store" size={30} className="text-muted opacity-40" />
                <span
                  className="max-w-full truncate text-xs font-semibold uppercase tracking-wide text-muted"
                  title={item.subcategory || item.category}
                >
                  {item.subcategory || item.category}
                </span>
                <span className="text-[0.7rem] text-muted">Sin imagen cargada</span>
              </div>
            )}
          </div>

          <div className="p-5 sm:p-6 grid gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${PRIO_BADGE[item.priority]}`}>
                Prioridad {PRIORITY.get(item.priority)!.label}
              </span>
              <span className="max-w-full truncate rounded-full bg-surface-2 px-3 py-1 text-xs font-bold uppercase tracking-wide text-muted border border-line" title={item.category}>
                {item.category}
              </span>
              {item.subcategory && (
                <span className="max-w-full truncate rounded-full bg-surface-2 px-3 py-1 text-xs font-bold uppercase tracking-wide text-muted border border-line" title={item.subcategory}>
                  {item.subcategory}
                </span>
              )}
              {item.purchaseMonth && (
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-accent-soft text-accent-ink">
                  Planificado: {formatMonth(item.purchaseMonth)}
                </span>
              )}
              {payment && (
                <span
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    payment === 'Sin cuenta vinculada' || payment === 'Pagado con cuenta eliminada'
                      ? 'bg-surface-2 text-muted border border-line'
                      : 'bg-accent-soft text-accent-ink'
                  }`}
                  title={payment}
                >
                  <Icon name="wallet" size={12} className="shrink-0" />
                  <span className="truncate">{payment}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-surface-2 p-3 rounded-xl border border-line">
                <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">Precio Total</p>
                <p className="font-bold text-lg text-ink tabular-nums">{money(item.price)}</p>
              </div>
              {installments && (
                <div className="bg-surface-2 p-3 rounded-xl border border-line">
                  <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">Financiación</p>
                  <p className="font-bold text-sm text-medium">{installments}</p>
                  {progress && (
                    <p
                      className={`mt-1 text-[0.7rem] font-bold ${
                        installmentStatus?.finished ? 'text-muted' : 'text-high'
                      }`}
                    >
                      {progress}
                    </p>
                  )}
                </div>
              )}
              {hasWarranty && (
                <div className="bg-surface-2 p-3 rounded-xl border border-line">
                  <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">Garantía</p>
                  <p className="font-bold text-sm text-ink">
                    {item.warranty} {item.warranty === 1 ? 'mes' : 'meses'}
                  </p>
                </div>
              )}
              {dims && (
                <div className="bg-surface-2 p-3 rounded-xl border border-line">
                  <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">Medidas</p>
                  <p className="font-semibold text-sm text-ink">{dims}</p>
                </div>
              )}
            </div>

            {hasTechnicalDetails && (
              <div>
                <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-2">Detalles Técnicos</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {item.brand && (
                    <div className="bg-surface-2 p-3 rounded-xl border border-line">
                      <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">Marca</p>
                      <p className="font-semibold text-sm text-ink truncate" title={item.brand}>{item.brand}</p>
                    </div>
                  )}
                  {item.model && (
                    <div className="bg-surface-2 p-3 rounded-xl border border-line">
                      <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">Modelo</p>
                      <p className="font-semibold text-sm text-ink truncate" title={item.model}>{item.model}</p>
                    </div>
                  )}
                  {item.color && (
                    <div className="bg-surface-2 p-3 rounded-xl border border-line">
                      <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">Color</p>
                      <p className="font-semibold text-sm text-ink truncate" title={item.color}>{item.color}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {item.notes && (
              <div>
                <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-2">Notas</p>
                <p className="text-sm text-ink-soft bg-surface-2 p-3 rounded-xl border border-line whitespace-pre-wrap">
                  {item.notes}
                </p>
              </div>
            )}

            {(item.storeName || item.storeLocation || item.purchaseUrl || item.orderNumber) && (
              <div>
                <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-2">Tienda / Enlace</p>
                <div className="flex flex-col gap-2">
                  {(item.storeName || item.storeLocation) && (
                    <p className="text-sm text-ink flex items-center gap-2">
                      <Icon name="store" size={16} className="text-muted" />
                      {[item.storeName, item.storeLocation].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {item.orderNumber && (
                    <p className="text-sm text-ink flex items-center gap-2">
                      <Icon name="archive" size={16} className="text-muted" />
                      <span>Orden: <span className="font-semibold">{item.orderNumber}</span></span>
                    </p>
                  )}
                  {item.purchaseUrl && (
                    <a
                      href={item.purchaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent hover:underline flex items-center gap-2 w-fit"
                    >
                      <Icon name="globe" size={16} /> Ir al sitio web
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* COMPARADOR DE OPCIONES, TIENDAS Y MODELOS */}
            <OptionComparator item={item} />
          </div>
        </div>
      </div>
    </div>
  );
}