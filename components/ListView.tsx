'use client';

import { useMemo } from 'react';
import { useApp } from '@/state/AppProvider';
import { sameText } from '@/lib/utils';
import { PRIORITY } from '@/lib/config';
import type { Item, SortMode } from '@/lib/types';
import { ItemCard } from './ItemCard';
import { TableView } from './TableView';
import { Icon } from './Icon';

interface Props {
  mode: 'list' | 'wishlist';
}

export function ListView({ mode }: Props) {
  const { items, prefs, setPrefs, categories } = useApp();
  const isWish = mode === 'wishlist';

  // 1. Filtramos los items base según la pestaña (lista o wishlist)
  const scopeItems = useMemo(() => items.filter((i) => i.wishlist === isWish), [items, isWish]);

  // Definimos dinámicamente qué preferencias usar según la pestaña
  const categoryKey = isWish ? 'wishlistCategory' : 'category';
  const subcategoryKey = isWish ? 'wishlistSubcategory' : 'subcategory';
  const sortKey = isWish ? 'wishlistSort' : 'sort';

  // 2. Extraemos las subcategorías únicas disponibles según la categoría seleccionada
  const subcategories = useMemo(() => {
    const names = new Map<string, string>();
    const currentCat = prefs[categoryKey];

    for (const it of scopeItems) {
      if (!it.subcategory) continue;
      if (currentCat !== 'todas' && !sameText(it.category, currentCat)) continue;

      const k = it.subcategory.toLocaleLowerCase('es');
      if (!names.has(k)) names.set(k, it.subcategory);
    }
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [scopeItems, prefs, categoryKey]);

  // 3. Filtramos y ordenamos los items visibles
  const visible = useMemo(() => {
    const currentCat = prefs[categoryKey];
    const currentSub = prefs[subcategoryKey];
    const currentSort = prefs[sortKey] as SortMode;

    let list = scopeItems.filter((it) => {
      if (currentCat !== 'todas' && !sameText(it.category, currentCat)) return false;
      if (currentSub !== 'todas' && !sameText(it.subcategory, currentSub)) return false;

      // El filtro de estado solo aplica a la lista principal
      if (!isWish) {
        if (prefs.status === 'pendientes' && it.bought) return false;
        if (prefs.status === 'comprados' && !it.bought) return false;
      }
      return true;
    });

    const byPriority = (a: Item, b: Item) =>
      PRIORITY.get(a.priority)!.rank - PRIORITY.get(b.priority)!.rank || b.createdAt - a.createdAt;

    list.sort(
      currentSort === 'precio-desc' ? (a, b) => b.price - a.price || byPriority(a, b)
        : currentSort === 'precio-asc' ? (a, b) => a.price - b.price || byPriority(a, b)
          : currentSort === 'nombre' ? (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }) || byPriority(a, b)
            : byPriority
    );

    return list;
  }, [scopeItems, prefs, isWish, categoryKey, subcategoryKey, sortKey]);

  // 4. Contadores y estados vacíos
  const total = scopeItems.length;
  const filtered = visible.length !== total;
  const hasActiveFilters =
    (prefs[categoryKey] !== 'todas') ||
    (prefs[subcategoryKey] !== 'todas') ||
    (!isWish && prefs.status !== 'todos');

  const resetFilters = () => {
    if (isWish) {
      setPrefs({ wishlistCategory: 'todas', wishlistSubcategory: 'todas' });
    } else {
      setPrefs({ category: 'todas', subcategory: 'todas', status: 'todos' });
    }
  };

  const selectCls = "w-full min-h-[44px] pl-3 pr-9 border border-line-strong rounded-xl bg-surface text-ink text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/20 transition-colors appearance-none cursor-pointer";

  return (
    <section id={`panel-${mode}`} role="tabpanel" aria-labelledby={`tab-${mode}`} className="pt-2">

      {/* --- CABECERA --- */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold tracking-tight text-ink">
          {isWish ? 'Wishlist / Futuro' : 'Lista de compras'}
        </h2>

        <div className="flex items-center gap-3 ml-auto">
          {/* Toggle de Vista (Grid / Tabla) */}
          <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg shadow-sm">
            <button
              onClick={() => setPrefs({ viewMode: 'grid' })}
              className={`p-1.5 rounded-md transition-colors ${prefs.viewMode === 'grid' ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong/20' : 'text-muted hover:text-ink'}`}
              title="Vista de tarjetas"
              aria-label="Vista de tarjetas"
            >
              <Icon name="grid" size={16} />
            </button>
            <button
              onClick={() => setPrefs({ viewMode: 'table' })}
              className={`p-1.5 rounded-md transition-colors ${prefs.viewMode === 'table' ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong/20' : 'text-muted hover:text-ink'}`}
              title="Vista de tabla"
              aria-label="Vista de tabla"
            >
              <Icon name="table" size={16} />
            </button>
          </div>

          {/* Contador */}
          <span className="px-3 py-1 border border-line rounded-full bg-surface text-muted text-sm font-semibold tabular-nums">
            {total === 0 ? '0' : filtered ? `${visible.length} / ${total}` : total}
          </span>
        </div>
      </div>

      {/* --- CONTROLES DE FILTRO --- */}
      <div className="flex flex-wrap items-end gap-3 mb-5 p-3.5 border border-line rounded-2xl bg-surface shadow-sm">

        <div className="flex-1 min-w-[160px] grid gap-1.5">
          <label className="text-xs font-semibold text-ink-soft">Ordenar por</label>
          <div className="relative">
            <select
              value={prefs[sortKey]}
              onChange={(e) => setPrefs({ [sortKey]: e.target.value } as any)}
              className={selectCls}
            >
              <option value="prioridad">Urgentes primero</option>
              <option value="precio-desc">Mayor precio</option>
              <option value="precio-asc">Menor precio</option>
              <option value="nombre">Nombre</option>
            </select>
            <Icon name="chevron" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </div>

        <div className="flex-1 min-w-[160px] grid gap-1.5">
          <label className="text-xs font-semibold text-ink-soft">Categoría</label>
          <div className="relative">
            <select
              value={prefs[categoryKey]}
              onChange={(e) => setPrefs({ [categoryKey]: e.target.value } as any)}
              className={selectCls}
            >
              <option value="todas">Todas las categorías</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Icon name="chevron" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </div>

        <div className="flex-1 min-w-[160px] grid gap-1.5">
          <label className="text-xs font-semibold text-ink-soft">Subcategoría</label>
          <div className="relative">
            <select
              value={prefs[subcategoryKey]}
              onChange={(e) => setPrefs({ [subcategoryKey]: e.target.value } as any)}
              className={selectCls}
            >
              <option value="todas">Todas las subcategorías</option>
              {subcategories.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Icon name="chevron" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </div>

        {/* Filtro de Estado (Solo Lista Principal) */}
        {!isWish && (
          <div className="flex flex-1 w-full md:w-auto min-w-[260px] gap-0.5 p-1 rounded-xl bg-surface-2 border border-line-strong/50" role="group" aria-label="Filtrar por estado">
            {(['todos', 'pendientes', 'comprados'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={prefs.status === s}
                onClick={() => setPrefs({ status: s })}
                className={`flex-1 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold capitalize transition-all whitespace-nowrap ${prefs.status === s
                    ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong/20'
                    : 'text-muted hover:text-ink hover:bg-surface-3/50'
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* --- CONTENIDO (Lista o Tabla) --- */}
      {visible.length > 0 ? (
        prefs.viewMode === 'table' ? (
          <TableView items={visible} wishlistMode={isWish} />
        ) : (
          /* Cambiamos a 4 columnas en pantallas extra grandes */
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-300">
            {visible.map((it) => (
              <ItemCard key={it.id} item={it} wishlistMode={isWish} />
            ))}
          </ul>
        )
      ) : (
        <div className="p-12 border border-dashed border-line-strong rounded-3xl bg-surface text-center animate-in fade-in duration-300">
          {total === 0 ? (
            <>
              <h3 className="text-base font-semibold text-ink">
                {isWish ? 'Tu wishlist está vacía' : 'Tu lista está vacía'}
              </h3>
              <p className="max-w-[42ch] mx-auto mt-2 text-muted text-sm leading-relaxed">
                {isWish
                  ? 'Marcá «Wishlist / Futuro» al agregar un artículo para guardar ideas que todavía no vas a comprar.'
                  : 'Agregá tu primer artículo usando el formulario para empezar a organizar tus compras.'}
              </p>
              {isWish && (
                <button
                  type="button"
                  onClick={() => {
                    setPrefs({ wishlistCategory: 'todas', wishlistSubcategory: 'todas' });
                    const el = document.getElementById('item-wishlist') as HTMLInputElement | null;
                    if (el) el.checked = true;
                    document.getElementById('item-name')?.focus();
                  }}
                  className="mt-5 inline-flex items-center gap-2 min-h-[44px] px-5 border border-line-strong rounded-xl bg-surface text-ink font-semibold hover:bg-surface-2 transition-colors shadow-sm"
                >
                  <Icon name="add" size={16} /> Agregar idea
                </button>
              )}
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold text-ink">No hay resultados</h3>
              <p className="max-w-[42ch] mx-auto mt-2 text-muted text-sm leading-relaxed">
                Ningún artículo coincide con los filtros seleccionados. Probá cambiando la categoría o el estado.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-5 inline-flex items-center gap-2 min-h-[44px] px-5 border border-line-strong rounded-xl bg-surface text-ink font-semibold hover:bg-surface-2 transition-colors shadow-sm"
                >
                  Limpiar filtros
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}