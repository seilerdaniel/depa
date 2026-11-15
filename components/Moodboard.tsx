'use client';

import { memo, useMemo, useState } from 'react';
import { useData, useUI } from '@/state/AppProvider';
import { money } from '@/lib/utils';
import { useResolvedImageSrc } from '@/lib/nativeImages';
import type { Item } from '@/lib/types';
import { Icon } from './Icon';

type MoodboardFilter = 'todos' | 'lista' | 'wishlist';

const FILTERS: { id: MoodboardFilter; label: string }[] = [
  { id: 'todos', label: 'Todas' },
  { id: 'lista', label: 'Lista' },
  { id: 'wishlist', label: 'Wishlist' },
];

interface MoodboardTileProps {
  item: Item;
  onOpen: () => void;
}

const MoodboardTile = memo(function MoodboardTile({ item, onOpen }: MoodboardTileProps) {
  const src = useResolvedImageSrc(item.imageData, item.imageUrl);
  // Guardamos el src fallido: si se reemplaza la foto por otra, se reintenta automáticamente.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src.length > 0 && failedSrc !== src;

  return (
    <figure
      onClick={onOpen}
      className="group relative m-0 aspect-square overflow-hidden border border-line rounded-2xl bg-surface-2 cursor-pointer shadow-sm hover:shadow-md transition-all duration-300"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={item.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
          <Icon name="photo" size={26} className="text-muted opacity-40" />
          <span
            className="max-w-full truncate text-[0.65rem] font-semibold uppercase tracking-wide text-muted"
            title={item.category}
          >
            {item.category}
          </span>
        </div>
      )}

      {/* Overlay de Información */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
        <span className="text-xs font-bold text-white/80 uppercase tracking-wider mb-1">
          {item.wishlist ? 'Wishlist' : 'En Lista'}
        </span>
        <h3 className="text-sm font-bold text-white leading-tight line-clamp-2">
          {item.name}
        </h3>
        <p className="text-sm font-semibold text-accent-soft mt-1 tabular-nums">
          {money(item.price)}
        </p>
        <div className="mt-2 flex items-center gap-1 text-[0.65rem] font-bold text-white/90 bg-white/20 w-fit px-2 py-0.5 rounded-md backdrop-blur-sm">
          Ver detalles <Icon name="chevron" size={12} className="-rotate-90" />
        </div>
      </div>
    </figure>
  );
});

export function Moodboard() {
  const { items } = useData();
  const { setView, setSelectedItem } = useUI();
  const [filter, setFilter] = useState<MoodboardFilter>('todos');

  const withImage = useMemo(() => {
    return items.filter((i) => {
      if (!(i.imageData || i.imageUrl)) return false;
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
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                filter === f.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {withImage.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {withImage.map((it) => (
            <MoodboardTile
              key={it.id}
              item={it}
              onOpen={() => setSelectedItem(it)}
            />
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
          <button
            type="button"
            onClick={() => setView('list')}
            className="mt-6 inline-flex items-center gap-2 min-h-[44px] px-5 border border-line-strong rounded-xl bg-surface text-ink font-semibold hover:bg-surface-2 transition-colors shadow-sm cursor-pointer"
          >
            Ir a la lista
          </button>
        </div>
      )}
    </section>
  );
}