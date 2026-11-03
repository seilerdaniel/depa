'use client';

import { useApp } from '@/state/AppProvider';
import { money, formatDimensions, formatInstallments, getItemImage, formatMonth } from '@/lib/utils';
import { PRIORITY } from '@/lib/config';
import type { Item } from '@/lib/types';
import { Icon } from './Icon';

const CATEGORY_ICONS: Record<string, string> = {
  'Electrodomésticos grandes': 'finance', 
  'Pequeños electrodomésticos': 'finance',
  'Muebles de cocina': 'store', 
  'Muebles de baño': 'store', 
  'Muebles de dormitorio': 'brand', 
  'Otros': 'list'
};

const PRIO_TONES: Record<Item['priority'], { border: string; badge: string }> = {
  urgente: { border: 'border-t-urgent', badge: 'bg-urgent-soft text-urgent border border-urgent/20' },
  media: { border: 'border-t-medium', badge: 'bg-medium-soft text-medium border border-medium/20' },
  baja: { border: 'border-t-low', badge: 'bg-low-soft text-low border border-low/20' },
};

export function ItemCard({ item, wishlistMode }: { item: Item; wishlistMode: boolean }) {
  // Agregamos setSelectedItem para abrir el modal
  const { removeItem, toggleBought, setWishlist, setView, setEditingItem, setSelectedItem } = useApp();
  
  const tone = PRIO_TONES[item.priority];
  const src = getItemImage(item);
  const dims = formatDimensions(item.dimensions);
  const installments = formatInstallments(item.installments);
  const catIcon = CATEGORY_ICONS[item.category] || 'list';
  
  const placeText = !item.purchaseUrl && (item.storeName || item.storeLocation) 
    ? [item.storeName, item.storeLocation].filter(Boolean).join(' · ') 
    : '';

  const moveToList = () => { if (setWishlist(item.id, false)) setView('list'); };
  const handleEdit = () => { setEditingItem(item); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <li className={`flex flex-col overflow-hidden border border-line ${tone.border} border-t-[3px] rounded-2xl bg-surface transition-all duration-200 group hover:border-accent/40 hover:shadow-soft min-w-0`}>
      
      {/* IMAGEN CON CLICK PARA ABRIR MODAL */}
      <div 
        onClick={() => setSelectedItem(item)}
        className={`relative cursor-pointer aspect-[16/9] overflow-hidden bg-surface-2 ${!src ? 'flex items-center justify-center text-muted text-xs bg-gradient-to-br from-surface-2 to-surface-3' : ''}`}
      >
        {src ? (
          <img 
            src={src} 
            alt={`Imagen de ${item.name}`} 
            loading="lazy" 
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${item.bought && !wishlistMode ? 'grayscale opacity-50' : ''}`} 
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
          />
        ) : (
          <Icon name={catIcon} size={32} className="opacity-20" />
        )}
        
        {/* Overlay sutil al pasar el mouse */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
           <span className="opacity-0 group-hover:opacity-100 bg-surface/90 text-ink text-xs font-bold px-3 py-1.5 rounded-full shadow-sm transition-opacity">
             Ver detalles
           </span>
        </div>

        {item.bought && !wishlistMode && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-white/90 text-low text-[0.6rem] font-bold uppercase tracking-wider shadow-sm z-10">
            Comprado
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-4 pt-3 pb-2 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.6rem] font-bold uppercase tracking-wide ${tone.badge}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {PRIORITY.get(item.priority)!.label}
          </span>
          
          <span className="flex items-center gap-1 text-[0.65rem] text-muted truncate max-w-[100px]" title={item.category}>
            <Icon name={catIcon} size={10} />
            {item.category}
          </span>
          
          {item.purchaseMonth && (
            <span className="ml-auto text-[0.6rem] font-bold text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded-full shrink-0 capitalize">
              {formatMonth(item.purchaseMonth)}
            </span>
          )}
        </div>

        <h3 className={`text-sm font-semibold leading-tight line-clamp-2 mt-0.5 ${item.bought && !wishlistMode ? 'text-muted line-through' : 'text-ink'}`}>
          {item.name}
        </h3>
        
        {item.notes && <p className="text-[0.65rem] text-muted italic line-clamp-1 mt-0.5">"{item.notes}"</p>}

        <div className="flex items-end justify-between flex-wrap gap-1 mt-auto pt-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className={`text-base font-bold tabular-nums tracking-tight ${item.bought && !wishlistMode ? 'text-muted' : 'text-ink'}`}>
              {money(item.price)}
            </span>
            {installments && (
              <span className="inline-flex w-fit items-center gap-1 px-1.5 py-0.5 rounded-full bg-medium-soft text-medium text-[0.6rem] font-bold">
                {installments}
              </span>
            )}
          </div>
          
          {item.purchaseUrl && (
            <a 
              href={item.purchaseUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-2 border border-line-strong text-ink text-[0.65rem] font-semibold hover:bg-accent-soft hover:border-accent hover:text-accent transition-colors shrink-0"
            >
              <Icon name="globe" size={10} /> Ir
            </a>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-between gap-1 px-4 pb-3 pt-2 border-t border-line/50 min-w-0">
        {!wishlistMode ? (
          <label className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold text-muted cursor-pointer hover:text-ink group/check shrink-0">
            <input 
              type="checkbox" 
              checked={item.bought} 
              onChange={(e) => toggleBought(item.id, e.target.checked)} 
              className="sr-only peer" 
            />
            <span className="grid place-items-center w-4 h-4 border-[1.5px] border-line-strong rounded bg-surface text-accent-on peer-checked:bg-accent peer-checked:border-accent group-hover/check:border-accent transition-colors">
              <Icon name="check" size={10} className="opacity-0 scale-50 peer-checked:opacity-100 peer-checked:scale-100 transition-all" />
            </span>
            <span>Comprado</span>
          </label>
        ) : (
          <button 
            type="button" 
            onClick={moveToList} 
            className="text-[0.65rem] font-semibold text-accent hover:underline flex items-center gap-1 shrink-0"
          >
            <Icon name="list" size={12} /> Mover
          </button>
        )}

        <div className="flex items-center gap-0.5 ml-auto opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
          <button type="button" onClick={handleEdit} className="grid place-items-center w-7 h-7 rounded-md text-muted hover:bg-surface-2 hover:text-ink" title="Editar">
            <Icon name="edit" size={13} />
          </button>
          
          {!wishlistMode && (
            <button type="button" onClick={() => setWishlist(item.id, true)} className="grid place-items-center w-7 h-7 rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink" title="Guardar en wishlist">
              <Icon name="wishlist" size={13} />
            </button>
          )}
          
          <button type="button" onClick={() => removeItem(item.id)} className="grid place-items-center w-7 h-7 rounded-md text-muted hover:bg-danger-soft hover:text-danger" title="Eliminar">
            <Icon name="delete" size={13} />
          </button>
        </div>
      </div>
    </li>
  );
}