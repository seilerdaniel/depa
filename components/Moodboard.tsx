'use client';

import { useState, useMemo } from 'react';
import { useData, useUI } from '@/state/AppProvider';
import { getItemImage, money } from '@/lib/utils';
import { Icon } from './Icon';

export function Moodboard() {
  const { items } = useData();
  const { setView, setSelectedItem } = useUI();
  const [filter, setFilter] = useState<'todos' | 'lista' | 'wishlist'>('todos');

  const withImage = useMemo(() => {
    return items.filter(i => {
      if (!getItemImage(i)) return false;
      if (filter === 'lista') return !i.wishlist;
      if (filter === 'wishlist') return i.wishlist;
      return true;
    });
  }, [items, filter]);

  return (
    <section className="pt-2 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink">Moodboard</h2>
          <p className="text-sm text-muted">Inspiración visual de tus futuras compras.</p>
        </div>
        
        {/* Filtros Rápidos */}
        <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-xl">
          {[
            { id: 'todos', label: 'Todas' },
            { id: 'lista', label: 'Lista' },
            { id: 'wishlist', label: 'Wishlist' }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {withImage.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {withImage.map((it) => (
            <figure 
              key={it.id} 
              onClick={() => setSelectedItem(it)}
              className="group relative m-0 aspect-square overflow-hidden border border-line rounded-2xl bg-surface-2 cursor-pointer shadow-sm hover:shadow-md transition-all duration-300"
            >
              <img 
                src={getItemImage(it)} 
                alt={it.name} 
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
              />
              
              {/* Overlay de Información */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                <span className="text-xs font-bold text-white/80 uppercase tracking-wider mb-1">
                  {it.wishlist ? 'Wishlist' : 'En Lista'}
                </span>
                <h3 className="text-sm font-bold text-white leading-tight line-clamp-2">
                  {it.name}
                </h3>
                <p className="text-sm font-semibold text-accent-soft mt-1">
                  {money(it.price)}
                </p>
                <div className="mt-2 flex items-center gap-1 text-[0.65rem] font-bold text-white/90 bg-white/20 w-fit px-2 py-0.5 rounded-md backdrop-blur-sm">
                  Ver detalles <Icon name="chevron" size={12} className="-rotate-90" />
                </div>
              </div>
            </figure>
          ))}
        </div>
      ) : (
        <div className="p-12 border border-dashed border-line-strong rounded-3xl bg-surface text-center animate-in zoom-in-95">
          <Icon name="photo" size={48} className="mx-auto text-muted opacity-30 mb-4" />
          <h3 className="text-base font-semibold text-ink">Sin fotos por ahora</h3>
          <p className="max-w-[42ch] mx-auto mt-2 text-muted text-sm">
            {filter === 'todos' 
              ? 'Agregá imágenes a tus artículos para crear tu tablero de inspiración.' 
              : `No hay fotos en la sección de ${filter}.`}
          </p>
          <button type="button" onClick={() => setView('list')}
            className="mt-6 inline-flex items-center gap-2 min-h-[44px] px-5 border border-line-strong rounded-xl bg-surface text-ink font-semibold hover:bg-surface-2 transition-colors shadow-sm">
            Ir a la lista
          </button>
        </div>
      )}
    </section>
  );
}