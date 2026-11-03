'use client';

import { useApp } from '@/state/AppProvider';
import { TAB_ORDER } from '@/lib/config';
import type { View } from '@/lib/types';
import { Icon } from './Icon';

const META: Record<View, { label: string; icon: string }> = {
  list: { label: 'Lista', icon: 'list' },
  wishlist: { label: 'Wishlist', icon: 'wishlist' },
  moodboard: { label: 'Moodboard', icon: 'moodboard' },
  dashboard: { label: 'Dashboard', icon: 'chart' }, // <-- Agregado aquí
};

export function ViewTabs() {
  const { view, setView, items } = useApp();
  
  const counts: Record<View, number> = {
    list: items.filter((i) => !i.wishlist).length,
    wishlist: items.filter((i) => i.wishlist).length,
    moodboard: items.filter((i) => i.imageData || i.imageUrl).length,
    dashboard: 0, // <-- Agregado aquí para evitar errores
  };

  return (
    <div role="tablist" aria-label="Secciones principales" className="inline-flex gap-1 p-1 border border-line rounded-2xl bg-surface shadow-soft">
      {TAB_ORDER.map((id) => {
        const selected = view === id;
        
        // Prevención por si en el futuro se agrega otra pestaña sin META
        if (!META[id]) return null;

        return (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => setView(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              selected ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon name={META[id].icon} size={16} />
            {META[id].label}
            
            {/* Solo mostramos el contador si no es la pestaña de dashboard */}
            {id !== 'dashboard' && (
              <span className={`min-w-[22px] px-1.5 py-px rounded-full text-[0.7rem] font-bold text-center tabular-nums ${
                selected ? 'bg-surface text-accent-ink' : 'bg-surface-3 text-muted'
              }`}>
                {counts[id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}