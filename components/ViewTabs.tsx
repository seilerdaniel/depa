'use client';

import { useApp } from '@/state/AppProvider';
import { TAB_ORDER } from '@/lib/config';
import type { View } from '@/lib/types';
import { Icon } from './Icon';

const META: Record<View, { label: string; icon: string }> = {
  list: { label: 'Lista', icon: 'list' },
  wishlist: { label: 'Wishlist', icon: 'wishlist' },
  moodboard: { label: 'Moodboard', icon: 'moodboard' },
  dashboard: { label: 'Dashboard', icon: 'chart' },
  history: { label: 'Historial', icon: 'archive' },
};

export function ViewTabs() {
  const { view, setView, items, setCategoryManagerOpen } = useApp();
  
  const counts: Record<View, number> = {
    list: items.filter((i) => !i.wishlist && !i.bought).length,
    wishlist: items.filter((i) => i.wishlist).length,
    moodboard: items.filter((i) => i.imageData || i.imageUrl).length,
    dashboard: 0,
    history: items.filter((i) => i.bought && !i.wishlist).length,
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="tablist" aria-label="Secciones principales" className="inline-flex flex-wrap gap-1 p-1 border border-line rounded-2xl bg-surface shadow-soft">
        {TAB_ORDER.map((id) => {
          const selected = view === id;
          if (!META[id]) return null;
          
          const showCount = id !== 'dashboard' && (id !== 'history' || counts[id] > 0);

          return (
            <button
              key={id}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setView(id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                selected ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:text-ink'
              }`}
            >
              <Icon name={META[id].icon} size={15} />
              <span className="hidden sm:inline">{META[id].label}</span>
              {showCount && (
                <span className={`min-w-[20px] px-1.5 py-px rounded-full text-[0.65rem] font-bold text-center tabular-nums ${
                  selected ? 'bg-surface text-accent-ink' : 'bg-surface-3 text-muted'
                }`}>
                  {counts[id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* BOTÓN DE CONFIGURACIÓN DE CATEGORÍAS */}
      <button 
        onClick={() => setCategoryManagerOpen(true)}
        className="p-2.5 rounded-xl border border-line bg-surface text-muted hover:text-ink hover:bg-surface-2 transition-colors shadow-sm"
        title="Gestionar Categorías"
      >
        <Icon name="settings" size={18} />
      </button>
    </div>
  );
}