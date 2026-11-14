'use client';

import { useRef } from 'react';
import { useData, useUI } from '@/state/AppProvider';
import { Icon } from './Icon';
import { NotificationBell } from './NotificationBell';

export function Header() {
  const { exportData, importData } = useData();
  const { view, setView, theme, setTheme } = useUI();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importData(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const themeLabel =
    theme === 'light' ? 'claro' : theme === 'dark' ? 'oscuro' : 'sistema';

  return (
    <header className="pt-7 pb-2">
      <div className="mx-auto w-[min(1180px,100%-32px)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="min-w-0">
              <button
                type="button"
                onClick={() => setView('home')}
                title="Ir al inicio"
                className="flex items-center gap-3 rounded-2xl text-left transition-opacity hover:opacity-80"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-on shadow-soft">
                  <Icon name="brand" size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[1.35rem] font-bold leading-tight tracking-tight text-ink">
                    Depa
                  </span>
                  <span className="block truncate text-sm text-muted">
                    Organizá las compras de tu primer departamento.
                  </span>
                </span>
              </button>
            </h1>

            {view !== 'home' && (
              <button
                type="button"
                onClick={() => setView('home')}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Icon name="chevron" size={12} className="rotate-90" />
                Inicio
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NotificationBell />

            {/* IMPORTAR BACKUP */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-line bg-surface p-2 text-muted transition-colors hover:text-ink"
              title="Restaurar copia de seguridad"
              aria-label="Restaurar copia de seguridad"
            >
              <Icon name="upload" size={18} />
            </button>
            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            {/* EXPORTAR BACKUP */}
            <button
              type="button"
              onClick={exportData}
              className="rounded-full border border-line bg-surface p-2 text-muted transition-colors hover:text-ink"
              title="Descargar copia de seguridad"
              aria-label="Descargar copia de seguridad"
            >
              <Icon name="download" size={18} />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-full border border-line bg-surface p-2 text-muted transition-colors hover:text-ink"
              title={`Tema: ${themeLabel}`}
              aria-label={`Cambiar tema (actual: ${themeLabel})`}
            >
              {theme === 'light' && <Icon name="sun" size={18} />}
              {theme === 'dark' && <Icon name="moon" size={18} />}
              {theme === 'system' && <Icon name="monitor" size={18} />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
