'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  useData, useFinance, usePrefs, useToast, useUI, type Theme,
} from '@/state/AppProvider';
import {
  CARD_COLOR_OPTIONS, CARD_SURFACE_OPTIONS, DEFAULT_PREFS, HOME_ICON_NAMES,
  HOME_LAYOUT_OPTIONS, HOME_MODULES, START_VIEW_OPTIONS, createDefaultHomeCards,
} from '@/lib/config';
import { money, parsePrice } from '@/lib/utils';
import { ACCENT_THEMES } from './homeCardTheme';
import type { CardAccentColor, HomeCardConfig, HomeLayout, HomeModuleId } from '@/lib/types';
import { Icon } from './Icon';

type SettingsTab = 'general' | 'home' | 'data';

const LAST_BACKUP_KEY = 'depa.lastBackupAt';

const THEME_OPTIONS: { id: Theme; label: string; hint: string }[] = [
  { id: 'light', label: 'Claro', hint: 'Fondo cálido de día' },
  { id: 'dark', label: 'Oscuro', hint: 'Alto contraste nocturno' },
  { id: 'system', label: 'Sistema', hint: 'Sigue a Windows' },
];

const SWATCH: Record<CardAccentColor, string> = {
  accent: 'bg-accent',
  high: 'bg-high',
  medium: 'bg-medium',
  low: 'bg-low',
  urgent: 'bg-urgent',
  neutral: 'bg-surface-3 border border-line-strong',
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function LayoutPreview({ layout }: { layout: HomeLayout }) {
  if (layout === 'list') {
    return (
      <span aria-hidden="true" className="flex w-full flex-col gap-1.5">
        <span className="h-2 w-full rounded bg-line-strong/80" />
        <span className="h-2 w-full rounded bg-line-strong/80" />
        <span className="h-2 w-full rounded bg-line-strong/80" />
      </span>
    );
  }

  const columns = layout === 'cards-lg' ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <span aria-hidden="true" className={`grid w-full gap-1.5 ${columns}`}>
      <span className="h-7 rounded bg-line-strong/80" />
      <span className="h-7 rounded bg-line-strong/80" />
      {layout === 'cards-sm' && <span className="h-7 rounded bg-line-strong/80" />}
    </span>
  );
}

function formatLastBackup(iso: string | null): string {
  if (!iso) return 'Todavía no exportaste ninguna copia';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'Todavía no exportaste ninguna copia';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts));
}

export function SettingsModal() {
  const { items, categories, exportData, importData } = useData();
  const { accounts, transactions, savingsGoals } = useFinance();
  const { prefs, setPrefs } = usePrefs();
  const {
    isSettingsOpen, setSettingsOpen, theme, setTheme, setCategoryManagerOpen,
  } = useUI();
  const { showToast } = useToast();

  const [tab, setTab] = useState<SettingsTab>('general');
  const [expanded, setExpanded] = useState<HomeModuleId | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const panelBaseId = useId();

  useEffect(() => {
    if (!isSettingsOpen) return;
    setBudgetInput(prefs.budget ? String(prefs.budget) : '');
    try {
      setLastBackup(localStorage.getItem(LAST_BACKUP_KEY));
    } catch {
      setLastBackup(null);
    }
  }, [isSettingsOpen, prefs.budget]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.focus();

    const close = () => setSettingsOpen(false);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [isSettingsOpen, setSettingsOpen]);

  if (!isSettingsOpen) return null;

  const updateCard = (id: HomeModuleId, patch: Partial<HomeCardConfig>) => {
    setPrefs({
      homeCards: { ...prefs.homeCards, [id]: { ...prefs.homeCards[id], ...patch } },
    });
  };

  const resetDesign = () => {
    setPrefs({
      homeLayout: DEFAULT_PREFS.homeLayout,
      homeCards: createDefaultHomeCards(),
    });
    setExpanded(null);
    showToast('Diseño del Inicio restaurado');
  };

  const handleSaveBudget = () => {
    const trimmed = budgetInput.trim();
    if (!trimmed) {
      setPrefs({ budget: null });
      showToast('Presupuesto límite eliminado');
      return;
    }
    const parsed = parsePrice(trimmed);
    if (Number.isNaN(parsed) || parsed <= 0) {
      showToast('Ingresá un monto válido mayor a 0');
      return;
    }
    setPrefs({ budget: parsed });
    showToast(`Presupuesto actualizado a ${money(parsed)}`);
  };

  const handleExport = () => {
    exportData();
    const now = new Date().toISOString();
    setLastBackup(now);
    try {
      localStorage.setItem(LAST_BACKUP_KEY, now);
    } catch {
      // Ignoramos si localStorage no está disponible
    }
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importData(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setSettingsOpen(false);
  };

  const openCategories = () => {
    setSettingsOpen(false);
    setCategoryManagerOpen(true);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-6"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{ maxHeight: 'calc(100vh - 2.5rem)' }}
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl outline-none"
      >
        {/* CABECERA FIJA */}
        <div className="shrink-0 border-b border-line bg-surface-2/50 px-5 pt-3.5 pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="flex items-center gap-2 text-base font-bold text-ink">
                <Icon name="settings" size={18} className="text-accent" />
                Configuración
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Apariencia, módulos del Inicio, presupuesto y copias de seguridad.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Cerrar configuración"
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <Icon name="cancel" size={18} />
            </button>
          </div>

          {/* NAVEGACIÓN DE PESTAÑAS */}
          <div role="tablist" aria-label="Secciones de configuración" className="mt-3.5 flex gap-1.5">
            {(
              [
                { id: 'general', label: 'General' },
                { id: 'home', label: 'Inicio y módulos' },
                { id: 'data', label: 'Respaldo y datos' },
              ] as const
            ).map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.id)}
                  className={`cursor-pointer rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    active
                      ? 'bg-accent text-accent-on shadow-sm'
                      : 'border border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* CUERPO SCROLLEABLE */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {tab === 'general' && (
            <>
              {/* APARIENCIA */}
              <section aria-labelledby={`${titleId}-theme`}>
                <h3
                  id={`${titleId}-theme`}
                  className="text-[0.7rem] font-bold uppercase tracking-wider text-muted"
                >
                  Apariencia
                </h3>
                <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {THEME_OPTIONS.map((option) => {
                    const active = theme === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setTheme(option.id)}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                          active
                            ? 'border-accent bg-accent-soft/60 ring-1 ring-accent'
                            : 'border-line bg-surface-2/40 hover:border-line-strong'
                        }`}
                      >
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                            active ? 'bg-accent text-accent-on' : 'bg-surface text-muted'
                          }`}
                        >
                          {option.id === 'light' && <Icon name="sun" size={18} />}
                          {option.id === 'dark' && <Icon name="moon" size={18} />}
                          {option.id === 'system' && (
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              className="h-[18px] w-[18px] fill-none stroke-current stroke-2"
                            >
                              <rect x="2" y="3" width="20" height="14" rx="2" />
                              <path d="M8 21h8M12 17v4" />
                            </svg>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block text-xs font-bold ${
                              active ? 'text-accent-ink' : 'text-ink'
                            }`}
                          >
                            {option.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.68rem] leading-tight text-muted">
                            {option.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* PANTALLA INICIAL */}
              <section aria-labelledby={`${titleId}-start-view`}>
                <h3
                  id={`${titleId}-start-view`}
                  className="text-[0.7rem] font-bold uppercase tracking-wider text-muted"
                >
                  Pantalla inicial al abrir Depa
                </h3>
                <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {START_VIEW_OPTIONS.map((option) => {
                    const active = prefs.startView === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPrefs({ startView: option.id })}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                          active
                            ? 'border-accent bg-accent-soft/60 ring-1 ring-accent'
                            : 'border-line bg-surface-2/40 hover:border-line-strong'
                        }`}
                      >
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                            active ? 'bg-accent text-accent-on' : 'bg-surface text-muted'
                          }`}
                        >
                          {option.id === 'home' && <Icon name="brand" size={18} />}
                          {option.id === 'list' && <Icon name="store" size={18} />}
                          {option.id === 'finance' && <Icon name="finance" size={18} />}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block text-xs font-bold ${
                              active ? 'text-accent-ink' : 'text-ink'
                            }`}
                          >
                            {option.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[0.68rem] leading-tight text-muted">
                            {option.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* PRESUPUESTO DE COMPRAS */}
              <section aria-labelledby={`${titleId}-budget`}>
                <h3
                  id={`${titleId}-budget`}
                  className="text-[0.7rem] font-bold uppercase tracking-wider text-muted"
                >
                  Presupuesto de compras
                </h3>
                <div className="mt-2.5 rounded-2xl border border-line bg-surface-2/40 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">Tope global de equipamiento</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {prefs.budget
                          ? `Límite actual: ${money(prefs.budget)}`
                          : 'Sin límite configurado actualmente.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Ej. 2500000"
                        value={budgetInput}
                        onChange={(e) => setBudgetInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveBudget()}
                        aria-label="Monto de presupuesto límite"
                        className="w-36 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink tabular-nums outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={handleSaveBudget}
                        className="cursor-pointer rounded-xl bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-on transition-all hover:brightness-110"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* CATEGORÍAS */}
              <section aria-labelledby={`${titleId}-categories`}>
                <h3
                  id={`${titleId}-categories`}
                  className="text-[0.7rem] font-bold uppercase tracking-wider text-muted"
                >
                  Organización
                </h3>
                <div className="mt-2.5 flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2/40 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">Categorías de artículos</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {categories.length} categorías configuradas (Cocina, Living, Electro, etc.).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openCategories}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-bold text-ink transition-colors hover:border-line-strong"
                  >
                    <Icon name="edit" size={14} />
                    Administrar
                  </button>
                </div>
              </section>
            </>
          )}

          {tab === 'home' && (
            <>
              {/* VISTA Y DENSIDAD */}
              <section aria-labelledby={`${titleId}-layout`}>
                <h3
                  id={`${titleId}-layout`}
                  className="text-[0.7rem] font-bold uppercase tracking-wider text-muted"
                >
                  Vista y densidad del Inicio
                </h3>
                <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {HOME_LAYOUT_OPTIONS.map((option) => {
                    const active = prefs.homeLayout === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPrefs({ homeLayout: option.id })}
                        className={`flex cursor-pointer flex-col gap-2 rounded-2xl border p-3 text-left transition-all ${
                          active
                            ? 'border-accent bg-accent-soft/60 ring-1 ring-accent'
                            : 'border-line bg-surface-2/40 hover:border-line-strong'
                        }`}
                      >
                        <span className="flex h-11 w-full items-center rounded-xl bg-surface/80 px-2.5">
                          <LayoutPreview layout={option.id} />
                        </span>
                        <span>
                          <span
                            className={`block text-xs font-bold ${
                              active ? 'text-accent-ink' : 'text-ink'
                            }`}
                          >
                            {option.label}
                          </span>
                          <span className="mt-0.5 block text-[0.68rem] leading-tight text-muted">
                            {option.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* MÓDULOS */}
              <section aria-labelledby={`${titleId}-modules`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3
                    id={`${titleId}-modules`}
                    className="text-[0.7rem] font-bold uppercase tracking-wider text-muted"
                  >
                    Cards y módulos
                  </h3>
                  <p className="text-[0.68rem] text-muted">
                    Activá o personalizá cada tarjeta del Inicio.
                  </p>
                </div>

                <ul className="mt-2.5 space-y-2">
                  {HOME_MODULES.map((module) => {
                    const card = prefs.homeCards[module.id];
                    const accent = ACCENT_THEMES[card.color];
                    const isOpen = expanded === module.id;
                    const panelId = `${panelBaseId}-${module.id}`;

                    return (
                      <li
                        key={module.id}
                        className="overflow-hidden rounded-2xl border border-line bg-surface"
                      >
                        <div className="flex items-center gap-3 p-3">
                          <span
                            aria-hidden="true"
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accent.tile}`}
                          >
                            <Icon name={card.icon} size={20} />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold text-ink">{module.title}</p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide ${
                                  module.status === 'active'
                                    ? 'bg-low-soft text-low'
                                    : 'bg-surface-3 text-muted'
                                }`}
                              >
                                {module.status === 'active' ? 'Activo' : 'Próximamente'}
                              </span>
                            </div>
                            <p
                              className="mt-0.5 truncate text-xs text-muted"
                              title={module.description}
                            >
                              {module.description}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={card.visible}
                              aria-label={`Mostrar ${module.title} en el Inicio`}
                              onClick={() => updateCard(module.id, { visible: !card.visible })}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                                card.visible
                                  ? 'border-accent bg-accent'
                                  : 'border-line-strong bg-surface-3'
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className={`h-4 w-4 rounded-full bg-surface shadow transition-transform ${
                                  card.visible ? 'translate-x-5' : 'translate-x-1'
                                }`}
                              />
                            </button>

                            <button
                              type="button"
                              onClick={() => setExpanded(isOpen ? null : module.id)}
                              aria-expanded={isOpen}
                              aria-controls={panelId}
                              aria-label={`Personalizar ${module.title}`}
                              className={`inline-flex cursor-pointer items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                                isOpen
                                  ? 'border-accent bg-accent-soft text-accent-ink'
                                  : 'border-line bg-surface-2/60 text-muted hover:text-ink'
                              }`}
                            >
                              <span>Editar</span>
                              <Icon
                                name="chevron"
                                size={14}
                                className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div
                            id={panelId}
                            className="space-y-4 border-t border-line bg-surface-2/35 px-4 py-3.5"
                          >
                            <fieldset className="min-w-0">
                              <legend className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider text-muted">
                                Color de tarjeta e ícono
                              </legend>
                              <div className="flex flex-wrap gap-2.5">
                                {CARD_COLOR_OPTIONS.map((option) => {
                                  const selected = card.color === option.id;
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      aria-label={`Color ${option.label}`}
                                      aria-pressed={selected}
                                      title={option.label}
                                      onClick={() => updateCard(module.id, { color: option.id })}
                                      className={`grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full transition-transform ${SWATCH[option.id]} ${
                                        selected
                                          ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface'
                                          : 'hover:scale-105'
                                      }`}
                                    >
                                      {selected && (
                                        <Icon
                                          name="check"
                                          size={14}
                                          className={ACCENT_THEMES[option.id].onSwatch}
                                        />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </fieldset>

                            <fieldset className="min-w-0">
                              <legend className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider text-muted">
                                Estilo de borde y fondo
                              </legend>
                              <div className="flex flex-wrap gap-2">
                                {CARD_SURFACE_OPTIONS.map((option) => {
                                  const selected = card.surface === option.id;
                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      aria-pressed={selected}
                                      onClick={() => updateCard(module.id, { surface: option.id })}
                                      className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        selected
                                          ? 'border-accent bg-accent-soft text-accent-ink'
                                          : 'border-line bg-surface text-muted hover:text-ink'
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </fieldset>

                            <fieldset className="min-w-0">
                              <legend className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider text-muted">
                                Ícono
                              </legend>
                              <div className="flex flex-wrap gap-1.5">
                                {HOME_ICON_NAMES.map((name) => {
                                  const selected = card.icon === name;
                                  return (
                                    <button
                                      key={name}
                                      type="button"
                                      aria-label={`Ícono ${name}`}
                                      aria-pressed={selected}
                                      title={name}
                                      onClick={() => updateCard(module.id, { icon: name })}
                                      className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl border transition-colors ${
                                        selected
                                          ? 'border-accent bg-accent-soft text-accent-ink'
                                          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
                                      }`}
                                    >
                                      <Icon name={name} size={16} />
                                    </button>
                                  );
                                })}
                              </div>
                            </fieldset>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}

          {tab === 'data' && (
            <section aria-labelledby={`${titleId}-backup`} className="space-y-4">
              <h3
                id={`${titleId}-backup`}
                className="text-[0.7rem] font-bold uppercase tracking-wider text-muted"
              >
                Copias de seguridad (JSON portable)
              </h3>

              {/* RESUMEN DE DATOS ACTUALES */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  { label: 'Artículos', value: items.length },
                  { label: 'Cuentas', value: accounts.length },
                  { label: 'Movimientos', value: transactions.length },
                  { label: 'Metas ahorro', value: savingsGoals.length },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-line bg-surface-2/40 p-3"
                  >
                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">
                      {stat.label}
                    </p>
                    <p className="mt-1 text-lg font-bold text-ink tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* EXPORTAR */}
              <div className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-surface-2/40 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">Exportar copia de seguridad</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Descarga un archivo <code className="font-mono">.json</code> con tus compras,
                    fotos, cuentas, movimientos y metas.
                  </p>
                  <p className="mt-1.5 text-[0.7rem] font-semibold text-accent-ink">
                    Último respaldo: {formatLastBackup(lastBackup)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-accent-on shadow-sm transition-all hover:brightness-110"
                >
                  <Icon name="download" size={16} />
                  Descargar JSON
                </button>
              </div>

              {/* IMPORTAR */}
              <div className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-surface-2/40 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">Restaurar desde archivo</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Reemplaza los datos actuales por los de un backup anterior (compatible con v1,
                    v2 y v3).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs font-bold text-ink transition-colors hover:border-line-strong"
                >
                  <Icon name="upload" size={16} />
                  Importar JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </div>
            </section>
          )}
        </div>

        {/* PIE FIJO */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-5 py-3">
          {tab === 'home' ? (
            <button
              type="button"
              onClick={resetDesign}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <Icon name="history" size={14} />
              Restaurar diseño del Inicio
            </button>
          ) : (
            <span className="text-[0.7rem] text-muted">
              Los cambios se guardan automáticamente en local.
            </span>
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-5 py-2 text-sm font-bold text-accent-on shadow-sm transition-all hover:brightness-110"
          >
            <Icon name="check" size={16} />
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}