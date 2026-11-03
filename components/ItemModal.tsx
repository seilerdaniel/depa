'use client';

import { useApp } from '@/state/AppProvider';
import { money, formatDimensions, formatInstallments, getItemImage, formatMonth } from '@/lib/utils';
import { PRIORITY } from '@/lib/config';
import { Icon } from './Icon';

export function ItemModal() {
  const { selectedItem, setSelectedItem } = useApp();
  if (!selectedItem) return null;

  const item = selectedItem;
  const src = getItemImage(item);
  const dims = formatDimensions(item.dimensions);
  const installments = formatInstallments(item.installments);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedItem(null)}>
      <div 
        className="bg-surface w-full max-w-2xl max-h-[90vh] rounded-3xl border border-line shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface-2/30">
          <h3 className="font-bold text-lg text-ink truncate pr-4">{item.name}</h3>
          <button onClick={() => setSelectedItem(null)} className="p-2 rounded-full hover:bg-surface-3 text-muted hover:text-ink transition-colors">
            <Icon name="cancel" size={20} />
          </button>
        </div>

        <div className="overflow-y-auto">
          {src && (
            <div className="w-full aspect-video sm:aspect-[21/9] bg-surface-2 relative">
              <img src={src} alt={item.name} className="w-full h-full object-contain sm:object-cover" />
            </div>
          )}

          <div className="p-5 sm:p-6 grid gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${PRIORITY.get(item.priority)!.id === 'urgente' ? 'bg-urgent-soft text-urgent' : PRIORITY.get(item.priority)!.id === 'media' ? 'bg-medium-soft text-medium' : 'bg-low-soft text-low'}`}>
                Prioridad {PRIORITY.get(item.priority)!.label}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-surface-2 text-muted border border-line">
                {item.category}
              </span>
              {item.subcategory && (
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-surface-2 text-muted border border-line">
                  {item.subcategory}
                </span>
              )}
              {item.purchaseMonth && (
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-accent-soft text-accent-ink">
                  Planificado: {formatMonth(item.purchaseMonth)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-surface-2 p-3 rounded-xl border border-line">
                <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">Precio Total</p>
                <p className="font-bold text-lg text-ink">{money(item.price)}</p>
              </div>
              {installments && (
                <div className="bg-surface-2 p-3 rounded-xl border border-line">
                  <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">Financiación</p>
                  <p className="font-bold text-sm text-medium">{installments}</p>
                </div>
              )}
              {dims && (
                <div className="bg-surface-2 p-3 rounded-xl border border-line">
                  <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-1">Medidas</p>
                  <p className="font-semibold text-sm text-ink">{dims}</p>
                </div>
              )}
            </div>

            {item.notes && (
              <div>
                <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-2">Notas</p>
                <p className="text-sm text-ink-soft bg-surface-2 p-3 rounded-xl border border-line whitespace-pre-wrap">{item.notes}</p>
              </div>
            )}

            {(item.storeName || item.storeLocation || item.purchaseUrl) && (
              <div>
                <p className="text-[0.65rem] font-bold text-muted uppercase tracking-wider mb-2">Tienda / Enlace</p>
                <div className="flex flex-col gap-2">
                  {(item.storeName || item.storeLocation) && (
                    <p className="text-sm text-ink flex items-center gap-2">
                      <Icon name="store" size={16} className="text-muted" />
                      {item.storeName} {item.storeLocation ? `· ${item.storeLocation}` : ''}
                    </p>
                  )}
                  {item.purchaseUrl && (
                    <a href={item.purchaseUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline flex items-center gap-2 w-fit">
                      <Icon name="globe" size={16} /> Ir al sitio web
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}