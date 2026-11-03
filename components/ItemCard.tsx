'use client';

import { useApp } from '@/state/AppProvider';
import { money, formatDimensions, formatInstallments, getItemImage, formatMonth } from '@/lib/utils';
import { PRIORITY } from '@/lib/config';
import type { Item } from '@/lib/types';
import { Icon } from './Icon';

interface Props { item: Item; wishlistMode: boolean; }

const PRIO_TONES: Record<Item['priority'], { border: string; badge: string }> = {
  urgente: { border: 'border-t-urgent', badge: 'bg-urgent-soft text-urgent' },
  media: { border: 'border-t-medium', badge: 'bg-medium-soft text-medium' },
  baja: { border: 'border-t-low', badge: 'bg-low-soft text-low' },
};

export function ItemCard({ item, wishlistMode }: Props) {
  const { removeItem, toggleBought, setWishlist, setView, setEditingItem } = useApp();
  const tone = PRIO_TONES[item.priority];
  const src = getItemImage(item);
  const installments = formatInstallments(item.installments);
  
  const placeText = !item.purchaseUrl && (item.storeName || item.storeLocation) ? [item.storeName, item.storeLocation].filter(Boolean).join(' · ') : '';
  const moveToList = () => { if (setWishlist(item.id, false)) setView('list'); };
  const handleEdit = () => { setEditingItem(item); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <li className={`flex flex-col overflow-hidden border border-line ${tone.border} border-t-[3px] rounded-2xl bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft group`}>
      
      {/* Imagen con aspecto 16/9 */}
      <div className={`relative aspect-[16/9] overflow-hidden bg-surface-2 ${!src ? 'flex items-center justify-center text-muted text-xs bg-gradient-to-br from-surface-2 to-surface-3' : ''}`}>
        {src ? <img src={src} alt={`Imagen de ${item.name}`} loading="lazy" className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${item.bought && !wishlistMode ? 'grayscale opacity-50' : ''}`} onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <span className="opacity-70 font-medium">Sin imagen</span>}
        {item.bought && !wishlistMode && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-white/90 text-low text-[0.6rem] font-bold uppercase tracking-wider shadow-sm">Comprado</span>}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-4 pt-3 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.6rem] font-bold uppercase tracking-wide ${tone.badge}`}><span className="w-1 h-1 rounded-full bg-current" /> {PRIORITY.get(item.priority)!.label}</span>
          <span className="text-[0.65rem] text-muted truncate max-w-[80px]">{item.category}</span>
          {item.purchaseMonth && <span className="ml-auto text-[0.6rem] font-bold text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded-full shrink-0 capitalize">{formatMonth(item.purchaseMonth)}</span>}
        </div>

        <h3 className={`text-sm font-semibold leading-tight line-clamp-2 mt-0.5 ${item.bought && !wishlistMode ? 'text-muted line-through' : 'text-ink'}`}>{item.name}</h3>
        {item.notes && <p className="text-[0.65rem] text-muted italic line-clamp-1 mt-0.5">"{item.notes}"</p>}

        <div className="flex items-end justify-between flex-wrap gap-1 mt-auto pt-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className={`text-base font-bold tabular-nums tracking-tight ${item.bought && !wishlistMode ? 'text-muted' : 'text-ink'}`}>{money(item.price)}</span>
            {installments && <span className="inline-flex w-fit items-center gap-1 px-1.5 py-0.5 rounded-full bg-medium-soft text-medium text-[0.6rem] font-bold">{installments}</span>}
          </div>
          {item.purchaseUrl && <a href={item.purchaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-2 border border-line-strong text-ink text-[0.65rem] font-semibold hover:bg-surface-3 hover:text-accent transition-colors shrink-0"><Icon name="globe" size={10} /> Ir</a>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 px-4 pb-3 pt-1">
        {!wishlistMode ? (
          <label className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-muted cursor-pointer hover:text-ink">
            <input type="checkbox" checked={item.bought} onChange={(e) => toggleBought(item.id, e.target.checked)} className="sr-only peer" />
            <span className="grid place-items-center w-4 h-4 border-[1.5px] border-line-strong rounded bg-surface text-accent-on peer-checked:bg-accent peer-checked:border-accent"><Icon name="check" size={10} className="opacity-0 scale-50 peer-checked:opacity-100 peer-checked:scale-100 transition-all" /></span>
            <span>Comprado</span>
          </label>
        ) : <button type="button" onClick={moveToList} className="text-[0.65rem] font-semibold text-accent-ink hover:underline">Mover a lista</button>}

        <div className="flex items-center gap-0.5 ml-auto">
          <button type="button" onClick={handleEdit} className="grid place-items-center w-7 h-7 rounded-md text-muted hover:bg-surface-2 hover:text-ink"><Icon name="edit" size={13} /></button>
          {!wishlistMode && <button type="button" onClick={() => setWishlist(item.id, true)} className="grid place-items-center w-7 h-7 rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink"><Icon name="wishlist" size={13} /></button>}
          <button type="button" onClick={() => removeItem(item.id)} className="grid place-items-center w-7 h-7 rounded-md text-muted hover:bg-danger-soft hover:text-danger"><Icon name="delete" size={13} /></button>
        </div>
      </div>
    </li>
  );
}