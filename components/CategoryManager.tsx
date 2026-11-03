'use client';

import { useState } from 'react';
import { useApp } from '@/state/AppProvider';
import { Icon } from './Icon';

export function CategoryManager() {
  const { categories, isCategoryManagerOpen, setCategoryManagerOpen, updateCategory, deleteCategory, items } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  if (!isCategoryManagerOpen) return null;

  const startEdit = (name: string) => {
    setEditing(name);
    setEditValue(name);
  };

  const saveEdit = () => {
    if (editing && updateCategory(editing, editValue)) {
      setEditing(null);
    } else {
      setEditing(null);
    }
  };

  const countItems = (catName: string) => items.filter(i => i.category === catName).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setCategoryManagerOpen(false)}>
      <div className="bg-surface w-full max-w-md rounded-3xl border border-line shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        
        <div className="flex items-center justify-between p-4 border-b border-line bg-surface-2/30">
          <h3 className="font-bold text-lg text-ink">Gestionar Categorías</h3>
          <button onClick={() => setCategoryManagerOpen(false)} className="p-2 rounded-full hover:bg-surface-3 text-muted hover:text-ink transition-colors">
            <Icon name="cancel" size={20} />
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto grid gap-2">
          {categories.map(cat => (
            <div key={cat} className="flex items-center gap-2 p-3 rounded-xl bg-surface-2 border border-line">
              {editing === cat ? (
                <input 
                  autoFocus
                  type="text" 
                  value={editValue} 
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }}
                  className="flex-1 min-h-[36px] px-3 border border-accent rounded-lg bg-surface text-sm focus:outline-none"
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-ink truncate">{cat}</p>
                  <p className="text-[0.65rem] text-muted">{countItems(cat)} artículos</p>
                </div>
              )}

              {editing === cat ? (
                <div className="flex gap-1 shrink-0">
                  <button onClick={saveEdit} className="p-1.5 text-accent hover:bg-accent-soft rounded-md"><Icon name="check" size={16}/></button>
                  <button onClick={() => setEditing(null)} className="p-1.5 text-muted hover:bg-surface-3 rounded-md"><Icon name="cancel" size={16}/></button>
                </div>
              ) : (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(cat)} className="p-1.5 text-muted hover:bg-surface-3 hover:text-ink rounded-md" title="Editar"><Icon name="edit" size={16}/></button>
                  {cat !== 'Otros' && (
                    <button onClick={() => { if (confirm(`¿Eliminar categoría "${cat}"? Los artículos pasarán a "Otros".`)) deleteCategory(cat); }} className="p-1.5 text-muted hover:bg-danger-soft hover:text-danger rounded-md" title="Eliminar"><Icon name="delete" size={16}/></button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t border-line bg-surface-2/30 text-xs text-muted text-center">
          Al eliminar una categoría, sus artículos se mueven a "Otros".
        </div>
      </div>
    </div>
  );
}