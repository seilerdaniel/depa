'use client';

import { useState, useEffect } from 'react';
import { useData, useUI } from '@/state/AppProvider';
import { money, formatMonth } from '@/lib/utils';
import type { Item } from '@/lib/types';
import { Icon } from './Icon';

interface Props {
  items: Item[];
  wishlistMode: boolean;
}

type ColumnKey = 'article' | 'category' | 'month' | 'price' | 'status' | 'actions';

// Anchos por defecto
const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  article: 280,
  category: 180,
  month: 120,
  price: 120,
  status: 110,
  actions: 110,
};

const STORAGE_KEY = 'depa.table-col-widths.v1';

export function TableView({ items, wishlistMode }: Props) {
  const { removeItem, toggleBought, setWishlist } = useData();
  const { setEditingItem, setView } = useUI();

  // 1. Inicializamos con los valores por defecto para evitar problemas de hidratación
  const [colWidths, setColWidths] = useState<Record<ColumnKey, number>>(DEFAULT_WIDTHS);
  const [isLoaded, setIsLoaded] = useState(false);

  // 2. Cargar los anchos guardados al montar el componente
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validación básica para asegurar que tiene las propiedades correctas
        if (parsed && typeof parsed === 'object' && parsed.article) {
          setColWidths({ ...DEFAULT_WIDTHS, ...parsed });
        }
      }
    } catch (e) {
      console.warn('No se pudieron cargar los anchos de columna', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // 3. Guardar en localStorage cada vez que cambian los anchos
  useEffect(() => {
    if (!isLoaded) return; // Evita sobreescribir con los valores por defecto en el primer render
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(colWidths));
    } catch (e) {
      console.warn('No se pudieron guardar los anchos de columna', e);
    }
  }, [colWidths, isLoaded]);

  const resetWidths = () => {
    setColWidths(DEFAULT_WIDTHS);
  };

  const handleMouseDown = (e: React.MouseEvent, key: ColumnKey) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.pageX;
    const startWidth = colWidths[key];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(80, startWidth + (moveEvent.pageX - startX));
      setColWidths((prev) => ({ ...prev, [key]: newWidth }));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };

    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

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
    <div className="w-full flex flex-col gap-2 animate-in fade-in duration-300">
      
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

      <div className="w-full overflow-x-auto border border-line rounded-2xl bg-surface shadow-sm">
        <table className="w-full text-sm text-left">
          
          <colgroup>
            <col style={{ width: `${colWidths.article}px` }} />
            <col style={{ width: `${colWidths.category}px` }} />
            <col style={{ width: `${colWidths.month}px` }} />
            <col style={{ width: `${colWidths.price}px` }} />
            <col style={{ width: `${colWidths.status}px` }} />
            <col style={{ width: `${colWidths.actions}px` }} />
          </colgroup>

          <thead className="bg-surface-2 text-muted text-[0.7rem] uppercase font-bold tracking-wider border-b border-line select-none">
            <tr>
              <HeaderCell label="Artículo" colKey="article" onResize={handleMouseDown} />
              <HeaderCell label="Categoría" colKey="category" onResize={handleMouseDown} />
              <HeaderCell label="Mes" colKey="month" onResize={handleMouseDown} align="center" />
              <HeaderCell label="Precio" colKey="price" onResize={handleMouseDown} align="right" />
              <HeaderCell label="Estado" colKey="status" onResize={handleMouseDown} align="center" />
              <HeaderCell label="Acciones" colKey="actions" onResize={handleMouseDown} align="right" isLast />
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-surface-2/60 transition-colors group">
                <td className="px-3 py-3">
                  <p className={`font-semibold truncate ${item.bought && !wishlistMode ? 'line-through text-muted' : 'text-ink'}`} title={item.name}>
                    {item.name}
                  </p>
                  {item.purchaseUrl && (
                    <a href={item.purchaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-0.5 text-[0.7rem] text-accent hover:underline">
                      <Icon name="globe" size={10} /> Ir al sitio
                    </a>
                  )}
                </td>

                <td className="px-3 py-3">
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
  onResize, 
  align = 'left',
  isLast = false
}: { 
  label: string; 
  colKey: ColumnKey; 
  onResize: (e: React.MouseEvent, key: ColumnKey) => void;
  align?: 'left' | 'center' | 'right';
  isLast?: boolean;
}) {
  const alignment = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
  
  return (
    <th className={`relative px-3 py-3.5 font-bold ${alignment} ${isLast ? 'rounded-tr-2xl' : ''} ${colKey === 'article' ? 'rounded-tl-2xl' : ''}`}>
      <span className="truncate block">{label}</span>
      
      {/* Manija de arrastre */}
      {!isLast && (
        <div
          onMouseDown={(e) => onResize(e, colKey)}
          className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-accent/30 transition-colors flex items-center justify-center group/resize z-10"
          title="Arrastrar para redimensionar"
        >
          <div className="w-[1px] h-1/2 bg-line-strong group-hover/resize:bg-accent transition-colors" />
        </div>
      )}
    </th>
  );
}