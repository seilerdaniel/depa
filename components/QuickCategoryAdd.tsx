'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useData } from '@/state/AppProvider';
import { CATEGORY_MAX_LENGTH } from '@/lib/config';
import { normalizeLabel, sameText } from '@/lib/utils';
import { Icon } from './Icon';

/**
 * Alta rápida de categorías de artículos.
 *
 * Se usa en la barra de filtros de Mis Compras y en el formulario de artículo:
 * abre un popover con un input, valida duplicados y avisa al padre para que
 * seleccione la categoría recién creada. No renderiza el selector de categoría:
 * eso queda en cada consumidor.
 */
export function QuickCategoryAdd({
  onCreated,
  variant = 'button',
}: {
  /** Se llama con el nombre normalizado ya persistido en el estado global. */
  onCreated: (name: string) => void;
  /** `icon` muestra sólo el `+`, para espacios angostos. */
  variant?: 'button' | 'icon';
}) {
  const { categories, addCategory } = useData();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setDraft('');
    setError('');
  }, []);

  // Cerrar al hacer clic fuera del popover.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close();
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    const name = normalizeLabel(draft, CATEGORY_MAX_LENGTH);

    if (!name) {
      setError('Escribí un nombre.');
      return;
    }

    if (categories.some((category) => sameText(category, name))) {
      setError('Ya existe una categoría con ese nombre.');
      return;
    }

    if (!addCategory(name)) {
      setError('No se pudo crear la categoría.');
      return;
    }

    onCreated(name);
    close();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Nueva categoría"
        className={
          variant === 'icon'
            ? 'grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-line bg-surface-2 text-muted transition-colors hover:border-line-strong hover:text-ink'
            : 'inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-ink'
        }
      >
        <Icon name="plus" size={variant === 'icon' ? 16 : 14} />
        {variant === 'button' && <span>Nueva categoría</span>}
        {variant === 'icon' && <span className="sr-only">Nueva categoría</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Nueva categoría"
          className="absolute right-0 top-full z-30 mt-2 w-[260px] rounded-2xl border border-line bg-surface p-3 shadow-xl"
        >
          <label
            htmlFor="quick-category-name"
            className="text-[0.68rem] font-bold uppercase tracking-wider text-muted"
          >
            Nueva categoría
          </label>

          <input
            ref={inputRef}
            id="quick-category-name"
            type="text"
            maxLength={CATEGORY_MAX_LENGTH}
            placeholder="Ej. Mudanza, Deudas..."
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
            }}
            className="mt-1.5 min-h-[38px] w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
          />

          {error && (
            <p role="alert" className="mt-1.5 text-[0.7rem] font-semibold text-danger">
              {error}
            </p>
          )}

          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={close}
              className="min-h-[34px] cursor-pointer rounded-lg px-2.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              className="inline-flex min-h-[34px] cursor-pointer items-center gap-1 rounded-lg bg-accent px-3 text-xs font-bold text-accent-on transition-all hover:brightness-110"
            >
              <Icon name="check" size={12} />
              Crear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
