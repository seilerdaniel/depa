'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useData, useUI } from '@/state/AppProvider';
import { money, getItemImage, formatMonth } from '@/lib/utils';
import { PRIORITY } from '@/lib/config';
import type { Item } from '@/lib/types';
import { Icon } from './Icon';

interface Props {
  item: Item;
  wishlistMode: boolean;
  isDraggable?: boolean; // <-- Agregado
}

export function ListItem({ item, wishlistMode, isDraggable = false }: Props) {
  const { removeItem, toggleBought, setWishlist } = useData();
  const { setView, setEditingItem, setSelectedItem } = useUI();
  
  // Lógica de Drag & Drop
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: item.id,
    disabled: !isDraggable 
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const src = getItemImage(item);

  return (
    <li 
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-surface border border-line rounded-xl hover:bg-surface-2 transition-all group ${isDragging ? 'shadow-2xl ring-2 ring-accent' : ''}`}
    >
      {/* ASA DE ARRASTRE (Solo visible si isDraggable es true) */}
      {isDraggable && (
        <button 
          {...attributes} 
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted hover:text-ink p-1 -ml-1 shrink-0"
          title="Arrastrar para reordenar"
        >
          <Icon name="menu" size={16} />
        </button>
      )}

      {/* Miniatura */}
      <div 
        className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-surface-2 border border-line cursor-pointer"
        onClick={() => setSelectedItem(item)}
      >
        {src ? (
          <img src={src} alt={item.name} className={`w-full h-full object-cover ${item.bought && !wishlistMode ? 'grayscale opacity-50' : ''}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted">
            <Icon name="store" size={20} className="opacity-30" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[0.6rem] font-bold uppercase tracking-wider ${item.bought && !wishlistMode ? 'text-muted' : 'text-accent'}`}>
            {PRIORITY.get(item.priority)?.label || 'Media'}
          </span>
          <span className="text-[0.65rem] text-muted truncate">{item.category}</span>
          {item.purchaseMonth && (
            <span className="text-[0.6rem] text-medium font-bold ml-auto shrink-0">
              {formatMonth(item.purchaseMonth)}
            </span>
          )}
        </div>
        <h3 className={`text-sm font-semibold truncate ${item.bought && !wishlistMode ? 'line-through text-muted' : 'text-ink'}`}>
          {item.name}
        </h3>
        <p className={`text-sm font-bold mt-0.5 ${item.bought && !wishlistMode ? 'text-muted' : 'text-ink'}`}>
          {money(item.price)}
        </p>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        {!wishlistMode ? (
          <label className="cursor-pointer p-2 hover:bg-surface-3 rounded-lg text-muted hover:text-accent transition-colors" title="Marcar como comprado">
            <input 
              type="checkbox" 
              checked={item.bought} 
              onChange={(e) => toggleBought(item.id, e.target.checked)} 
              className="sr-only peer" 
            />
            <Icon name="check" size={16} className={item.bought ? 'text-accent' : ''} />
          </label>
        ) : (
          <button onClick={() => { if (setWishlist(item.id, false)) setView('list'); }} className="p-2 hover:bg-accent-soft hover:text-accent rounded-lg text-muted transition-colors" title="Mover a lista">
            <Icon name="list" size={16} />
          </button>
        )}
        <button onClick={() => setEditingItem(item)} className="p-2 hover:bg-surface-3 rounded-lg text-muted hover:text-ink transition-colors" title="Editar">
          <Icon name="edit" size={16} />
        </button>
        <button onClick={() => removeItem(item.id)} className="p-2 hover:bg-danger-soft rounded-lg text-muted hover:text-danger transition-colors" title="Eliminar">
          <Icon name="delete" size={16} />
        </button>
      </div>
    </li>
  );
}