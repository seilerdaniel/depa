'use client';

import { useApp } from '@/state/AppProvider';
import { getItemImage } from '@/lib/utils';

export function Moodboard() {
  const { items, setView } = useApp();
  const withImage = items.filter((i) => Boolean(getItemImage(i)));

  return (
    <section id="panel-moodboard" role="tabpanel" aria-labelledby="tab-moodboard" className="pt-4">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h2 className="text-xl font-bold tracking-tight">Moodboard</h2>
        <span className="px-3 py-1 border border-line rounded-full bg-surface text-muted text-sm font-semibold tabular-nums">
          {withImage.length}
        </span>
      </div>

      {withImage.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {withImage.map((it) => (
            <figure key={it.id} className="group relative m-0 aspect-square overflow-hidden border border-line rounded-2xl bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getItemImage(it)} alt={it.name} loading="lazy"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.035]" />
              <figcaption className="absolute inset-x-0 bottom-0 p-2 pt-6 bg-gradient-to-t from-black/80 to-transparent text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                {it.name}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="p-10 border border-dashed border-line-strong rounded-2xl bg-surface text-center">
          <h3 className="text-base font-semibold">Sin fotos</h3>
          <p className="max-w-[42ch] mx-auto mt-1.5 text-muted text-sm">
            Agregá imágenes a tus artículos para verlos acá.
          </p>
          <button type="button" onClick={() => setView('list')}
            className="mt-4 inline-flex items-center gap-2 min-h-[44px] px-4 border border-line-strong rounded-xl bg-surface text-ink font-semibold hover:bg-surface-2">
            Ir a la lista
          </button>
        </div>
      )}
    </section>
  );
}