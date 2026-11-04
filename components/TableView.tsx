'use client';

import { useData, useUI } from '@/state/AppProvider';
import { money, formatMonth } from '@/lib/utils';
import type { Item } from '@/lib/types';
import { Icon } from './Icon';

interface Props {
  items: Item[];
  wishlistMode: boolean;
}

export function TableView({ items, wishlistMode }: Props) {
  const { removeItem, toggleBought, setWishlist } = useData();
  const { setEditingItem, setView } = useUI();

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    // Hacemos scroll hacia arriba para que el usuario vea el formulario
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMoveToList = (id: string) => {
    if (setWishlist(id, false)) {
      setView('list');
    }
  };

  return (
    <div className="overflow-x-auto border border-line rounded-2xl bg-surface shadow-sm animate-in fade-in duration-300">
      <table className="w-full text-sm text-left min-w-[700px]">
        <thead className="bg-surface-2 text-muted text-[0.7rem] uppercase font-bold tracking-wider border-b border-line">
          <tr>
            <th className="px-4 py-3.5 rounded-tl-2xl">Artículo</th>
            <th className="px-4 py-3.5">Categoría</th>
            <th className="px-4 py-3.5">Mes planificado</th>
            <th className="px-4 py-3.5 text-right">Precio</th>
            <th className="px-4 py-3.5 text-center">Estado</th>
            <th className="px-4 py-3.5 text-right rounded-tr-2xl">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-surface-2/60 transition-colors group">

              {/* Artículo (Nombre + URL) */}
              <td className="px-4 py-3 max-w-[250px]">
                <p className={`font-semibold truncate ${item.bought && !wishlistMode ? 'line-through text-muted' : 'text-ink'}`} title={item.name}>
                  {item.name}
                </p>
                {item.notes && (
                  <p className="text-[0.65rem] text-muted italic truncate mt-0.5" title={item.notes}>
                    "{item.notes}"
                  </p>
                )}
                {item.purchaseUrl && (
                  <a
                    href={item.purchaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-0.5 text-[0.7rem] text-accent hover:text-accent-ink hover:underline transition-colors"
                  >
                    <Icon name="globe" size={10} /> Ir al sitio
                  </a>
                )}
              </td>

              {/* Categoría y Subcategoría */}
              <td className="px-4 py-3">
                <span className="text-ink-soft">{item.category}</span>
                {item.subcategory && (
                  <span className="block text-[0.7rem] text-muted truncate max-w-[150px]" title={item.subcategory}>
                    {item.subcategory}
                  </span>
                )}
              </td>

              {/* Mes Planificado */}
              <td className="px-4 py-3">
                {item.purchaseMonth ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-accent-soft text-accent-ink font-semibold text-[0.7rem] capitalize">
                    {formatMonth(item.purchaseMonth)}
                  </span>
                ) : (
                  <span className="text-muted/50">—</span>
                )}
              </td>

              {/* Precio y Cuotas */}
              <td className="px-4 py-3 text-right">
                <span className={`font-bold tabular-nums ${item.bought && !wishlistMode ? 'text-muted' : 'text-ink'}`}>
                  {money(item.price)}
                </span>
                {item.installments && (
                  <span className="block text-[0.65rem] text-medium font-semibold mt-0.5">
                    {item.installments.count} cuotas
                  </span>
                )}
              </td>

              {/* Estado (Checkbox) */}
              <td className="px-4 py-3 text-center">
                {!wishlistMode ? (
                  <label className="inline-flex items-center justify-center cursor-pointer" title={item.bought ? 'Marcar como pendiente' : 'Marcar como comprado'}>
                    <input
                      type="checkbox"
                      checked={item.bought}
                      onChange={(e) => toggleBought(item.id, e.target.checked)}
                      className="sr-only peer"
                    />
                    <span className={`px-2.5 py-1 rounded-md text-[0.7rem] font-bold border transition-colors ${item.bought
                        ? 'bg-accent text-accent-on border-accent'
                        : 'bg-surface border-line-strong text-muted hover:border-accent hover:text-accent'
                      }`}>
                      {item.bought ? 'Comprado' : 'Pendiente'}
                    </span>
                  </label>
                ) : (
                  <span className="px-2.5 py-1 rounded-md bg-surface-2 border border-line-strong text-muted text-[0.7rem] font-bold">
                    Idea
                  </span>
                )}
              </td>

              {/* Acciones */}
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">

                  {/* Editar */}
                  <button
                    onClick={() => handleEdit(item)}
                    className="p-1.5 text-muted hover:text-ink hover:bg-surface-3 rounded-lg transition-colors"
                    title="Editar artículo"
                    aria-label={`Editar ${item.name}`}
                  >
                    <Icon name="edit" size={16} />
                  </button>

                  {/* Wishlist / Mover a Lista */}
                  {!wishlistMode ? (
                    <button
                      onClick={() => setWishlist(item.id, true)}
                      className="p-1.5 text-muted hover:text-accent-ink hover:bg-accent-soft rounded-lg transition-colors"
                      title="Mover a Wishlist"
                      aria-label={`Guardar ${item.name} en wishlist`}
                    >
                      <Icon name="wishlist" size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMoveToList(item.id)}
                      className="p-1.5 text-muted hover:text-accent-ink hover:bg-accent-soft rounded-lg transition-colors"
                      title="Mover a Lista de compras"
                      aria-label={`Mover ${item.name} a la lista`}
                    >
                      <Icon name="list" size={16} />
                    </button>
                  )}

                  {/* Eliminar */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 text-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-colors"
                    title="Eliminar artículo"
                    aria-label={`Eliminar ${item.name}`}
                  >
                    <Icon name="delete" size={16} />
                  </button>
                </div>
              </td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}