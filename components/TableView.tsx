'use client';

import { useState, useEffect, useRef } from 'react';
import { useData, useUI } from '@/state/AppProvider';
import { money, formatMonth } from '@/lib/utils';
import type { Item } from '@/lib/types';
import { Icon } from './Icon';

interface Props {
  items: Item[];
  wishlistMode: boolean;
}

type ColumnKey = 'article' | 'category' | 'month' | 'price' | 'status' | 'actions';

const COLUMN_KEYS: readonly ColumnKey[] = ['article', 'category', 'month', 'price', 'status', 'actions'];

const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  article: 280,
  category: 180,
  month: 120,
  price: 120,
  status: 110,
  actions: 110,
};

/**
 * Piso por columna. Un mínimo global de 80px parece razonable hasta que
 * "Precio" recorta "$ 1.200.000" o "Acciones" corta el último botón.
 */
const MIN_WIDTHS: Record<ColumnKey, number> = {
  article: 160,
  category: 100,
  month: 100,
  price: 110,
  status: 100,
  actions: 110,
};

const MAX_WIDTH = 800;
const STORAGE_KEY = 'depa.table-col-widths.v1';
const KEYBOARD_STEP = 8;
const KEYBOARD_STEP_LARGE = 32;

interface DragState {
  key: ColumnKey;
  startX: number;
  startWidth: number;
}

interface ResizeControls {
  active: ColumnKey | null;
  start: (event: React.PointerEvent<HTMLDivElement>, key: ColumnKey) => void;
  move: (event: React.PointerEvent<HTMLDivElement>) => void;
  end: (event: React.PointerEvent<HTMLDivElement>) => void;
  nudge: (key: ColumnKey, delta: number) => void;
}

const clampWidth = (key: ColumnKey, value: number) =>
  Math.min(MAX_WIDTH, Math.max(MIN_WIDTHS[key], Math.round(value)));

function sanitizeWidths(raw: unknown): Record<ColumnKey, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const next = { ...DEFAULT_WIDTHS };
  let touched = false;

  for (const key of COLUMN_KEYS) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) {
      next[key] = clampWidth(key, value);
      touched = true;
    }
  }

  return touched ? next : null;
}

export function TableView({ items, wishlistMode }: Props) {
  const { removeItem, toggleBought, setWishlist } = useData();
  const { setEditingItem, setView } = useUI();

  // Arrancamos con los defaults para no romper la hidratación.
  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>(DEFAULT_WIDTHS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [resizingKey, setResizingKey] = useState<ColumnKey | null>(null);

  // Guardamos el punto de partida del arrastre fuera del estado:
  // el estado cambia en cada píxel y no queremos usarlo como referencia.
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = sanitizeWidths(JSON.parse(saved));
        if (parsed) setColWidths(parsed);
      }
    } catch (e) {
      console.warn('No se pudieron cargar los anchos de columna', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Debounce: durante un arrastre hay decenas de cambios por segundo y
  // localStorage es sincrónico. Escribimos una sola vez al soltar.
  useEffect(() => {
    if (!isLoaded) return;

    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(colWidths));
      } catch (e) {
        console.warn('No se pudieron guardar los anchos de columna', e);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [colWidths, isLoaded]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>, key: ColumnKey) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    dragRef.current = { key, startX: event.clientX, startWidth: colWidths[key] };
    setResizingKey(key);

    // La captura hace que pointermove/pointerup sigan llegando a la manija
    // aunque el cursor salga del elemento o de la ventana.
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const next = clampWidth(drag.key, drag.startWidth + (event.clientX - drag.startX));
    setColWidths((prev) => (prev[drag.key] === next ? prev : { ...prev, [drag.key]: next }));
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;

    dragRef.current = null;
    setResizingKey(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const nudgeWidth = (key: ColumnKey, delta: number) => {
    setColWidths((prev) => ({ ...prev, [key]: clampWidth(key, prev[key] + delta) }));
  };

  const resetWidths = () => setColWidths({ ...DEFAULT_WIDTHS });

  const resize: ResizeControls = {
    active: resizingKey,
    start: startResize,
    move: moveResize,
    end: endResize,
    nudge: nudgeWidth,
  };

  // `table-fixed` obedece los <col> sólo si el ancho de la tabla es la suma
  // exacta de las columnas. Con width:100% el navegador reparte el sobrante.
  const tableWidth = COLUMN_KEYS.reduce((sum, key) => sum + colWidths[key], 0);

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMoveToList = (id: string) => {
    if (setWishlist(id, false)) {
      setView('list');
    }
  };

  return (
    <div className={`w-full flex flex-col gap-2 animate-in fade-in duration-300 ${resizingKey ? 'cursor-col-resize select-none' : ''}`}>

      {/* Barra de herramientas de la tabla */}
      <div className="flex justify-end">
        <button
          onClick={resetWidths}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink bg-surface border border-line rounded-lg transition-colors"
          title="Restaurar el ancho original de las columnas"
        >
          <Icon name="settings" size={12} /> Restaurar columnas
        </button>
      </div>

      <div className="w-fit max-w-full overflow-x-auto border border-line rounded-2xl bg-surface shadow-sm">
        <table className="table-fixed text-sm text-left" style={{ width: tableWidth }}>

          <colgroup>
            <col style={{ width: colWidths.article }} />
            <col style={{ width: colWidths.category }} />
            <col style={{ width: colWidths.month }} />
            <col style={{ width: colWidths.price }} />
            <col style={{ width: colWidths.status }} />
            <col style={{ width: colWidths.actions }} />
          </colgroup>

          <thead className="bg-surface-2 text-muted text-[0.7rem] uppercase font-bold tracking-wider border-b border-line select-none">
            <tr>
              <HeaderCell label="Artículo" colKey="article" width={colWidths.article} resize={resize} />
              <HeaderCell label="Categoría" colKey="category" width={colWidths.category} resize={resize} />
              <HeaderCell label="Mes" colKey="month" width={colWidths.month} resize={resize} align="center" />
              <HeaderCell label="Precio" colKey="price" width={colWidths.price} resize={resize} align="right" />
              <HeaderCell label="Estado" colKey="status" width={colWidths.status} resize={resize} align="center" />
              <HeaderCell label="Acciones" colKey="actions" width={colWidths.actions} resize={resize} align="right" isLast />
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-surface-2/60 transition-colors group">
                <td className="px-3 py-3 overflow-hidden">
                  <p className={`font-semibold truncate ${item.bought && !wishlistMode ? 'line-through text-muted' : 'text-ink'}`} title={item.name}>
                    {item.name}
                  </p>
                  {item.purchaseUrl && (
                    <a href={item.purchaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-0.5 text-[0.7rem] text-accent hover:underline">
                      <Icon name="globe" size={10} /> Ir al sitio
                    </a>
                  )}
                </td>

                <td className="px-3 py-3 overflow-hidden">
                  <span className="text-ink-soft truncate block" title={item.category}>{item.category}</span>
                  {item.subcategory && (
                    <span className="block text-[0.65rem] text-muted truncate" title={item.subcategory}>{item.subcategory}</span>
                  )}
                </td>

                <td className="px-3 py-3 text-center">
                  {item.purchaseMonth ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-accent-soft text-accent-ink font-semibold text-[0.7rem] capitalize whitespace-nowrap">
                      {formatMonth(item.purchaseMonth)}
                    </span>
                  ) : (
                    <span className="text-muted/50">—</span>
                  )}
                </td>

                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <span className={`font-bold tabular-nums ${item.bought && !wishlistMode ? 'text-muted' : 'text-ink'}`}>
                    {money(item.price)}
                  </span>
                  {item.installments && (
                    <span className="block text-[0.65rem] text-medium font-semibold mt-0.5">
                      {item.installments.count} cuotas
                    </span>
                  )}
                </td>

                <td className="px-3 py-3 text-center">
                  {!wishlistMode ? (
                    <label className="inline-flex items-center justify-center cursor-pointer">
                      <input type="checkbox" checked={item.bought} onChange={(e) => toggleBought(item.id, e.target.checked)} className="sr-only peer" />
                      <span className={`px-2 py-1 rounded-md text-[0.65rem] font-bold border transition-colors whitespace-nowrap ${item.bought ? 'bg-accent text-accent-on border-accent' : 'bg-surface border-line-strong text-muted hover:border-accent'}`}>
                        {item.bought ? 'Comprado' : 'Pendiente'}
                      </span>
                    </label>
                  ) : (
                    <span className="px-2 py-1 rounded-md bg-surface-2 border border-line-strong text-muted text-[0.65rem] font-bold">Idea</span>
                  )}
                </td>

                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(item)} className="p-1.5 text-muted hover:text-ink hover:bg-surface-3 rounded-lg" title="Editar">
                      <Icon name="edit" size={15} />
                    </button>
                    {!wishlistMode ? (
                      <button onClick={() => setWishlist(item.id, true)} className="p-1.5 text-muted hover:text-accent-ink hover:bg-accent-soft rounded-lg" title="Wishlist">
                        <Icon name="wishlist" size={15} />
                      </button>
                    ) : (
                      <button onClick={() => handleMoveToList(item.id)} className="p-1.5 text-muted hover:text-accent-ink hover:bg-accent-soft rounded-lg" title="Mover">
                        <Icon name="list" size={15} />
                      </button>
                    )}
                    <button onClick={() => removeItem(item.id)} className="p-1.5 text-muted hover:text-danger hover:bg-danger-soft rounded-lg" title="Eliminar">
                      <Icon name="delete" size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Sub-componente para el encabezado con su manija de arrastre
function HeaderCell({
  label,
  colKey,
  width,
  resize,
  align = 'left',
  isLast = false,
}: {
  label: string;
  colKey: ColumnKey;
  width: number;
  resize: ResizeControls;
  align?: 'left' | 'center' | 'right';
  isLast?: boolean;
}) {
  const alignment = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
  const isActive = resize.active === colKey;

  return (
    <th className={`relative px-3 py-3.5 font-bold ${alignment} ${isLast ? 'rounded-tr-2xl' : ''} ${colKey === 'article' ? 'rounded-tl-2xl' : ''}`}>
      <span className="truncate block">{label}</span>

      {/* Manija de arrastre */}
      {!isLast && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Ajustar ancho de la columna ${label}`}
          aria-valuenow={width}
          aria-valuemin={MIN_WIDTHS[colKey]}
          aria-valuemax={MAX_WIDTH}
          tabIndex={0}
          title="Arrastrá para ajustar el ancho. Usá ← → para ajustar de a poco."
          onPointerDown={(e) => resize.start(e, colKey)}
          onPointerMove={resize.move}
          onPointerUp={resize.end}
          onPointerCancel={resize.end}
          onLostPointerCapture={resize.end}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
            resize.nudge(colKey, e.key === 'ArrowRight' ? step : -step);
          }}
          className={`absolute top-0 right-0 z-10 flex h-full w-3 cursor-col-resize touch-none items-center justify-center outline-none transition-colors hover:bg-accent/20 focus-visible:bg-accent/30 ${isActive ? 'bg-accent/30' : ''}`}
        >
          <span className={`h-1/2 w-px transition-colors ${isActive ? 'bg-accent' : 'bg-line-strong'}`} />
        </div>
      )}
    </th>
  );
}