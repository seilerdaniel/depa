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

const COLUMN_LABELS: Record<ColumnKey, string> = {
  article: 'Artículo',
  category: 'Categoría',
  month: 'Mes',
  price: 'Precio',
  status: 'Estado',
  actions: 'Acciones',
};

const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  article: 30, category: 18, month: 13, price: 15, status: 12, actions: 12,
};

const MIN_WIDTHS: Record<ColumnKey, number> = {
  article: 14, category: 9, month: 8, price: 10, status: 9, actions: 10,
};

const STORAGE_KEY = 'depa.table-col-widths.v2';
const VISIBILITY_KEY = 'depa.table-col-visibility.v1';
const LEGACY_STORAGE_KEY = 'depa.table-col-widths.v1';

interface HeaderCellProps {
  label: string;
  colKey: ColumnKey;
  width: number;
  isDragging: boolean;
  align?: 'left' | 'center' | 'right';
  isLast?: boolean;
  onResizeStart: (event: React.MouseEvent<HTMLDivElement>, key: ColumnKey) => void;
  onNudge: (key: ColumnKey, delta: number) => void;
}

function normalizeWidths(raw: unknown): Record<ColumnKey, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const values = {} as Record<ColumnKey, number>;
  let total = 0;

  for (const key of COLUMN_KEYS) {
    const value = Number(source[key]);
    if (!Number.isFinite(value) || value <= 0) return null;
    values[key] = value;
    total += value;
  }

  if (total <= 0) return null;

  const normalized = {} as Record<ColumnKey, number>;
  for (const key of COLUMN_KEYS) normalized[key] = (values[key] / total) * 100;
  return normalized;
}

function applyDelta(base: Record<ColumnKey, number>, key: ColumnKey, delta: number): Record<ColumnKey, number> {
  const index = COLUMN_KEYS.indexOf(key);
  const neighbor = COLUMN_KEYS[index + 1];
  if (!neighbor) return base;

  const total = base[key] + base[neighbor];
  const min = MIN_WIDTHS[key];
  const minNeighbor = MIN_WIDTHS[neighbor];

  if (total <= min + minNeighbor) return base;
  const next = Math.min(total - minNeighbor, Math.max(min, base[key] + delta));
  if (next === base[key]) return base;

  return { ...base, [key]: next, [neighbor]: total - next };
}

export function TableView({ items, wishlistMode }: Props) {
  const { removeItem, toggleBought, setWishlist } = useData();
  const { setEditingItem, setView } = useUI();

  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>(DEFAULT_WIDTHS);
  const [visibleCols, setVisibleCols] = useState<Record<ColumnKey, boolean>>({
    article: true, category: true, month: true, price: true, status: true, actions: true,
  });
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [draggingKey, setDraggingKey] = useState<ColumnKey | null>(null);
  const [showColMenu, setShowColMenu] = useState(false); // Estado para el menú

  const tableRef = useRef<HTMLTableElement>(null);
  const stopDragRef = useRef<(() => void) | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowColMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => stopDragRef.current?.(), []);

  // Cargar preferencias
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        const parsed = normalizeWidths(JSON.parse(raw));
        if (parsed) setColWidths(parsed);
      }
      
      const visRaw = localStorage.getItem(VISIBILITY_KEY);
      if (visRaw) {
        const parsedVis = JSON.parse(visRaw);
        if (parsedVis && typeof parsedVis === 'object') {
          setVisibleCols({ ...visibleCols, ...parsedVis });
        }
      }
    } catch (e) {
      console.warn('Error al cargar config de tabla', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Guardar preferencias con debounce
  useEffect(() => {
    if (!isLoaded) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(colWidths));
        localStorage.setItem(VISIBILITY_KEY, JSON.stringify(visibleCols));
      } catch (e) {}
    }, 250);
    return () => window.clearTimeout(timer);
  }, [colWidths, visibleCols, isLoaded]);

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>, key: ColumnKey) => {
    if (event.button !== 0) return;
    const table = tableRef.current;
    if (!table) return;
    const tableWidth = table.getBoundingClientRect().width;
    if (tableWidth <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    stopDragRef.current?.();

    const startX = event.clientX;
    const startWidths = colWidths;

    const handleMove = (moveEvent: MouseEvent) => {
      const delta = ((moveEvent.clientX - startX) / tableWidth) * 100;
      setColWidths(applyDelta(startWidths, key, delta));
    };

    const stop = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('blur', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      stopDragRef.current = null;
      setDraggingKey(null);
    };

    stopDragRef.current = stop;
    setDraggingKey(key);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
  };

  const nudgeWidth = (key: ColumnKey, delta: number) => {
    setColWidths((prev) => applyDelta(prev, key, delta));
  };

  const resetWidths = () => {
    setColWidths({ ...DEFAULT_WIDTHS });
    setVisibleCols({ article: true, category: true, month: true, price: true, status: true, actions: true });
  };

  const toggleCol = (key: ColumnKey) => {
    // Evitar que el usuario oculte todas las columnas
    const activeCount = Object.values(visibleCols).filter(Boolean).length;
    if (activeCount === 1 && visibleCols[key]) return;
    
    setVisibleCols(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleEdit = (item: Item) => { setEditingItem(item); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const handleMoveToList = (id: string) => { if (setWishlist(id, false)) setView('list'); };

  // Calcular el ancho de la tabla solo con las columnas visibles
  const activeColumns = COLUMN_KEYS.filter(key => visibleCols[key]);
  const tableWidth = activeColumns.reduce((sum, key) => sum + colWidths[key], 0);

  return (
    <div className={`w-full flex flex-col gap-2 animate-in fade-in duration-300 ${draggingKey ? 'cursor-col-resize' : ''}`}>
      
      {/* Barra de herramientas */}
      <div className="flex justify-end gap-2">
        
        {/* Botón de Mostrar/Ocultar Columnas */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowColMenu(!showColMenu)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink bg-surface border border-line rounded-lg transition-colors"
          >
            <Icon name="columns" size={12} /> Columnas
          </button>
          
          {showColMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-line rounded-xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95">
              {COLUMN_KEYS.map(key => (
                <label key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-2 rounded-lg cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={visibleCols[key]} 
                    onChange={() => toggleCol(key)}
                    className="accent-accent"
                  />
                  <span className="text-xs font-semibold text-ink">{COLUMN_LABELS[key]}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={resetWidths}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink bg-surface border border-line rounded-lg transition-colors"
          title="Restaurar el ancho original de las columnas"
        >
          <Icon name="settings" size={12} /> Restaurar
        </button>
      </div>

      <div className="w-full overflow-x-auto border border-line rounded-2xl bg-surface shadow-sm">
        <table ref={tableRef} className="w-full min-w-[720px] table-fixed text-sm text-left">

          <colgroup>
            {activeColumns.map(key => (
              <col key={key} style={{ width: `${colWidths[key]}%` }} />
            ))}
          </colgroup>

          <thead className="bg-surface-2 text-muted text-[0.7rem] uppercase font-bold tracking-wider border-b border-line select-none">
            <tr>
              {activeColumns.map((key, index) => (
                <HeaderCell 
                  key={key}
                  label={COLUMN_LABELS[key]} 
                  colKey={key} 
                  width={colWidths[key]} 
                  isDragging={draggingKey === key} 
                  onResizeStart={handleResizeStart} 
                  onNudge={nudgeWidth} 
                  isLast={index === activeColumns.length - 1} 
                  align={key === 'price' || key === 'actions' ? 'right' : key === 'month' || key === 'status' ? 'center' : 'left'}
                />
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-surface-2/60 transition-colors group">
                
                {visibleCols.article && (
                  <td className="px-3 py-3 overflow-hidden">
                    <p className={`font-semibold truncate ${item.bought && !wishlistMode ? 'line-through text-muted' : 'text-ink'}`} title={item.name}>{item.name}</p>
                    {item.purchaseUrl && <a href={item.purchaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-0.5 text-[0.7rem] text-accent hover:underline"><Icon name="globe" size={10} /> Ir al sitio</a>}
                  </td>
                )}

                {visibleCols.category && (
                  <td className="px-3 py-3 overflow-hidden">
                    <span className="text-ink-soft truncate block" title={item.category}>{item.category}</span>
                    {item.subcategory && <span className="block text-[0.65rem] text-muted truncate" title={item.subcategory}>{item.subcategory}</span>}
                  </td>
                )}

                {visibleCols.month && (
                  <td className="px-3 py-3 text-center overflow-hidden">
                    {item.purchaseMonth ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-accent-soft text-accent-ink font-semibold text-[0.7rem] capitalize whitespace-nowrap">{formatMonth(item.purchaseMonth)}</span>
                    ) : <span className="text-muted/50">—</span>}
                  </td>
                )}

                {visibleCols.price && (
                  <td className="px-3 py-3 text-right whitespace-nowrap overflow-hidden">
                    <span className={`font-bold tabular-nums ${item.bought && !wishlistMode ? 'text-muted' : 'text-ink'}`}>{money(item.price)}</span>
                    {item.installments && <span className="block text-[0.65rem] text-medium font-semibold mt-0.5">{item.installments.count} cuotas</span>}
                  </td>
                )}

                {visibleCols.status && (
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
                )}

                {visibleCols.actions && (
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(item)} className="p-1.5 text-muted hover:text-ink hover:bg-surface-3 rounded-lg" title="Editar"><Icon name="edit" size={15} /></button>
                      {!wishlistMode ? (
                        <button onClick={() => setWishlist(item.id, true)} className="p-1.5 text-muted hover:text-accent-ink hover:bg-accent-soft rounded-lg" title="Wishlist"><Icon name="wishlist" size={15} /></button>
                      ) : (
                        <button onClick={() => handleMoveToList(item.id)} className="p-1.5 text-muted hover:text-accent-ink hover:bg-accent-soft rounded-lg" title="Mover"><Icon name="list" size={15} /></button>
                      )}
                      <button onClick={() => removeItem(item.id)} className="p-1.5 text-muted hover:text-danger hover:bg-danger-soft rounded-lg" title="Eliminar"><Icon name="delete" size={15} /></button>
                    </div>
                  </td>
                )}

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeaderCell({ label, colKey, width, isDragging, align = 'left', isLast = false, onResizeStart, onNudge }: HeaderCellProps) {
  const alignment = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
  return (
    <th className={`relative px-3 py-3.5 font-bold ${alignment} ${isLast ? 'rounded-tr-2xl' : ''} ${colKey === 'article' ? 'rounded-tl-2xl' : ''}`}>
      <span className="truncate block pointer-events-none">{label}</span>
      {!isLast && (
        <div
          role="separator"
          tabIndex={0}
          onMouseDown={(event) => onResizeStart(event, colKey)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const step = event.shiftKey ? 4 : 1;
            onNudge(colKey, event.key === 'ArrowRight' ? step : -step);
          }}
          className={`absolute inset-y-0 right-0 z-20 flex w-3 cursor-col-resize select-none items-center justify-center outline-none transition-colors hover:bg-accent/20 focus-visible:bg-accent/30 ${isDragging ? 'bg-accent/30' : ''}`}
        >
          <span className={`h-1/2 w-px transition-colors ${isDragging ? 'bg-accent' : 'bg-line-strong'}`} />
        </div>
      )}
    </th>
  );
}