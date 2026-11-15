'use client';

import { useEffect, useState } from 'react';
import { useUI } from '@/state/AppProvider';
import { Icon } from './Icon';
import { NotificationBell } from './NotificationBell';

export function Header() {
  const { view, setView, setTheme, theme, setSettingsOpen } = useUI();

  // El tema "sistema" no es un estado visual: para alternar hay que saber
  // qué está mostrando el SO. Se sincroniza en un efecto para no romper la
  // hidratación (en el servidor no existe `matchMedia`).
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemDark(mq.matches);

    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemDark);

  return (
    <header className="pt-7 pb-3">
      <div className="mx-auto w-[min(1180px,100%-32px)]">
        <div className="flex items-center justify-between gap-4">
          <h1 className="min-w-0">
            <button
              type="button"
              onClick={() => setView('home')}
              title={view === 'home' ? 'Depa — Inicio' : 'Ir al Inicio'}
              aria-label={view === 'home' ? 'Depa — Inicio' : 'Ir al Inicio'}
              className="flex cursor-pointer items-center gap-4 rounded-2xl text-left transition-opacity hover:opacity-85 sm:gap-5"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-on shadow-soft">
                <Icon name="brand" size={22} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="block text-[1.35rem] font-bold leading-tight tracking-tight text-ink">
                  Depa
                </span>
                <span className="block truncate text-sm text-muted">
                  Organizá las compras de tu primer departamento.
                </span>
              </span>
            </button>
          </h1>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <NotificationBell />

            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
              title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              <Icon name={isDark ? 'sun' : 'moon'} size={18} />
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
              title="Configuración"
              aria-label="Configuración"
            >
              <Icon name="settings" size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
