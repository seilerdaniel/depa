'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { useApp } from '@/state/AppProvider';
import { sameText } from '@/lib/utils';
import { PRIORITY } from '@/lib/config';
import type { Item, SortMode } from '@/lib/types';
import { ItemCard } from './ItemCard';
import { TableView } from './TableView';
import { Icon } from './Icon';

interface Props { mode: 'list' | 'wishlist' | 'history'; }

/** Minúsculas + sin acentos, para que "Heladera" encuentre "heladéra". */
const foldText = (value: unknown): string =>
  String(value ?? '')
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export function ListView({ mode }: Props) {
  const { items, prefs, setPrefs, categories, reorderItems } = useApp();

  // Búsqueda local: no persiste, no toca el contexto, no bloquea el tipeo.
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const needle = foldText(deferredSearch.trim());

  // DEFINICIÓN DE VARIABLES CLAVE
  const isWish = mode === 'wishlist';
  const isHistory = mode === 'history';
  const isActiveList = mode === 'list';

  // Sensores para Drag and Drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const scopeItems = useMemo(() => items.filter((i) => {
    if (isWish) return i.wishlist;
    if (isHistory) return i.bought && !i.wishlist;
    return !i.wishlist && !i.bought;
  }), [items, isWish, isHistory]);

  const categoryKey = isWish ? 'wishlistCategory' : 'category';
  const subcategoryKey = isWish ? 'wishlistSubcategory' : 'subcategory';
  const sortKey = isWish ? 'wishlistSort' : 'sort';

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

  const visible = useMemo(() => {
    const currentCat = prefs[categoryKey];
    const currentSub = prefs[subcategoryKey];
    const currentSort = prefs[sortKey] as SortMode;

    let list = scopeItems.filter((it) => {
      if (needle) {
        const haystack = `${foldText(it.name)} ${foldText(it.notes)}`;
        if (!haystack.includes(needle)) return false;
      }
      if (currentCat !== 'todas' && !sameText(it.category, currentCat)) return false;
      if (currentSub !== 'todas' && !sameText(it.subcategory, currentSub)) return false;
      if (isActiveList && prefs.status === 'pendientes' && it.bought) return false;
      if (isActiveList && prefs.status === 'comprados' && !it.bought) return false;
      return true;
    });

    if (currentSort === 'manual') {
      return list;
    }

    const byPriority = (a: Item, b: Item) => PRIORITY.get(a.priority)!.rank - PRIORITY.get(b.priority)!.rank || b.createdAt - a.createdAt;
    list.sort(
      currentSort === 'precio-desc' ? (a, b) => b.price - a.price || byPriority(a, b)
      : currentSort === 'precio-asc' ? (a, b) => a.price - b.price || byPriority(a, b)
      : currentSort === 'nombre' ? (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }) || byPriority(a, b)
      : byPriority
    );
    return list;
  }, [scopeItems, prefs, isActiveList, categoryKey, subcategoryKey, sortKey, needle]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderItems(active.id as string, over.id as string);
    }
  };

  const total = scopeItems.length;
  const filtered = visible.length !== total;
  const hasActiveFilters = (prefs[categoryKey] !== 'todas') || (prefs[subcategoryKey] !== 'todas') || (isActiveList && prefs.status !== 'todos') || needle !== '';

  const resetFilters = () => {
    setSearch('');
    if (isWish) setPrefs({ wishlistCategory: 'todas', wishlistSubcategory: 'todas' });
    else setPrefs({ category: 'todas', subcategory: 'todas', status: 'todos' });
  };

  const selectCls = "w-full min-h-[44px] pl-3 pr-9 border border-line-strong rounded-xl bg-surface text-ink text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/20 transition-colors appearance-none cursor-pointer";

  return (
    <section id={`panel-${mode}`} role="tabpanel" aria-labelledby={`tab-${mode}`} className="pt-2 min-w-0 w-full">

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold tracking-tight text-ink">
          {isWish ? 'Wishlist / Futuro' : isHistory ? 'Historial de Compras' : 'Lista de compras'}
        </h2>
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg shadow-sm">
            <button onClick={() => setPrefs({ viewMode: 'grid' })} className={`p-1.5 rounded-md transition-colors ${prefs.viewMode === 'grid' ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong/20' : 'text-muted hover:text-ink'}`} aria-label="Vista de tarjetas" aria-pressed={prefs.viewMode === 'grid'}><Icon name="grid" size={16} /></button>
            <button onClick={() => setPrefs({ viewMode: 'table' })} className={`p-1.5 rounded-md transition-colors ${prefs.viewMode === 'table' ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong/20' : 'text-muted hover:text-ink'}`} aria-label="Vista de tabla" aria-pressed={prefs.viewMode === 'table'}><Icon name="table" size={16} /></button>
          </div>
          <span className="px-3 py-1 border border-line rounded-full bg-surface text-muted text-sm font-semibold tabular-nums">
            {total === 0 ? '0' : filtered ? `${visible.length} / ${total}` : total}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-5 p-3.5 border border-line rounded-2xl bg-surface shadow-sm">
        <div className="flex-1 min-w-[160px] grid gap-1.5">
          <label htmlFor={`search-${mode}`} className="text-xs font-semibold text-ink-soft">Buscar artículo</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><Icon name="search" size={16} /></span>
            <input
              id={`search-${mode}`}
              type="search"
              placeholder="Ej. Heladera..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-h-[44px] pl-9 pr-3 border border-line-strong rounded-xl bg-surface text-ink text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/20 transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 min-w-[140px] grid gap-1.5">
          <label className="text-xs font-semibold text-ink-soft">Ordenar por</label>
          <div className="relative">
            <select value={prefs[sortKey]} onChange={(e) => setPrefs({ [sortKey]: e.target.value } as any)} className={selectCls}>
              <option value="prioridad">Urgentes primero</option>
              <option value="precio-desc">Mayor precio</option>
              <option value="precio-asc">Menor precio</option>
              <option value="nombre">Nombre</option>
              {isActiveList && <option value="manual">Manual (Arrastrar)</option>}
            </select>
            <Icon name="chevron" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </div>
        <div className="flex-1 min-w-[140px] grid gap-1.5">
          <label className="text-xs font-semibold text-ink-soft">Categoría</label>
          <div className="relative">
            <select value={prefs[categoryKey]} onChange={(e) => setPrefs({ [categoryKey]: e.target.value } as any)} className={selectCls}>
              <option value="todas">Todas</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Icon name="chevron" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </div>
        {isActiveList && (
          <div className="flex flex-1 w-full md:w-auto min-w-[260px] gap-0.5 p-1 rounded-xl bg-surface-2 border border-line-strong/50" role="group">
            {(['todos', 'pendientes', 'comprados'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={prefs.status === s} onClick={() => setPrefs({ status: s })} className={`flex-1 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold capitalize transition-all whitespace-nowrap ${prefs.status === s ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong/20' : 'text-muted hover:text-ink hover:bg-surface-3/50'}`}>{s}</button>
            ))}
          </div>
        )}
      </div>

      {visible.length > 0 ? (
        prefs.viewMode === 'table' ? (
          <TableView items={visible} wishlistMode={isWish} />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visible.map(i => i.id)} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-300 min-w-0">
                {visible.map((it) => <ItemCard key={it.id} item={it} wishlistMode={isWish} />)}
              </ul>
            </SortableContext>
          </DndContext>
        )
      ) : (
        <div className="p-12 border border-dashed border-line-strong rounded-3xl bg-surface text-center">
          <h3 className="text-base font-semibold text-ink">{total === 0 ? (isWish ? 'Wishlist vacía' : isHistory ? 'Historial vacío' : 'Lista vacía') : 'No hay resultados'}</h3>
          <p className="max-w-[42ch] mx-auto mt-2 text-muted text-sm">{total === 0 ? (isHistory ? 'Los artículos que marques como comprados aparecerán aquí.' : 'Agregá tu primer artículo.') : 'Probá cambiando los filtros.'}</p>
          {hasActiveFilters && <button type="button" onClick={resetFilters} className="mt-5 inline-flex items-center gap-2 min-h-[44px] px-5 border border-line-strong rounded-xl bg-surface text-ink font-semibold hover:bg-surface-2 transition-colors shadow-sm">Limpiar filtros</button>}
        </div>
      )}
    </section>
  );
}