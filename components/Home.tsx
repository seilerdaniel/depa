'use client';

import { useData, useFinance, usePrefs, useUI, useToast } from '@/state/AppProvider';
import { money } from '@/lib/utils';
import { HOME_MODULES } from '@/lib/config';
import {
  ACCENT_HOVER_BORDER, ACCENT_THEMES, LAYOUT_GRID, SURFACE_THEMES, accentSurfaceClass,
} from './homeCardTheme';
import type { HomeCardConfig, HomeModuleId } from '@/lib/types';
import { Icon } from './Icon';

interface ModuleKpi {
  label: string;
  value: string;
  danger?: boolean;
  secondary: { label: string; value: string; tone?: 'low' | 'danger' }[];
}

interface HomeModuleView {
  id: HomeModuleId;
  title: string;
  description: string;
  status: 'active' | 'soon';
  config: HomeCardConfig;
  kpi: ModuleKpi | null;
  onOpen: () => void;
}

const TONE: Record<'low' | 'danger', string> = {
  low: 'text-low',
  danger: 'text-danger',
};

function SoonBadge() {
  return (
    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-muted">
      Próximamente
    </span>
  );
}

function CardIcon({ config, large }: { config: HomeCardConfig; large?: boolean }) {
  const accent = ACCENT_THEMES[config.color];

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-2xl shadow-sm transition-transform duration-300 ${
        large ? 'h-14 w-14' : 'h-11 w-11'
      } ${accent.tile}`}
    >
      <Icon name={config.icon} size={large ? 28 : 20} />
    </span>
  );
}

function cardClasses(config: HomeCardConfig, extra = ''): string {
  const accent = ACCENT_THEMES[config.color];
  return `${SURFACE_THEMES[config.surface]} ${accentSurfaceClass(config.surface, accent)} ${ACCENT_HOVER_BORDER[config.color]} ${extra}`;
}

function LargeModuleCard({ module }: { module: HomeModuleView }) {
  const accent = ACCENT_THEMES[module.config.color];
  const { kpi } = module;

  return (
    <button
      type="button"
      onClick={module.onOpen}
      className={`group relative flex w-full cursor-pointer flex-col items-start overflow-hidden rounded-[2rem] p-8 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${cardClasses(
        module.config,
      )}`}
    >
      <span
        aria-hidden="true"
        className={`absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70 ${accent.glow}`}
      />

      <CardIcon config={module.config} large />

      <span className="mb-8 mt-6">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-bold text-ink">{module.title}</span>
          {module.status === 'soon' && <SoonBadge />}
        </span>
        <span className="mt-1 block text-sm text-muted">{module.description}</span>
      </span>

      {kpi ? (
        <span className="mt-auto block w-full border-t border-line pt-5">
          <span className="flex items-end justify-between gap-3">
            <span className="min-w-0">
              <span className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wider text-muted">
                {kpi.label}
              </span>
              <span
                className={`block text-3xl font-bold tabular-nums tracking-tight ${
                  kpi.danger ? 'text-danger' : 'text-ink'
                }`}
              >
                {kpi.value}
              </span>
            </span>
            {kpi.secondary.length > 0 && (
              <span className="shrink-0 space-y-1 text-right">
                {kpi.secondary.map((item) => (
                  <span key={item.label} className="block leading-snug">
                    <span className="block text-[0.62rem] font-semibold uppercase tracking-wide text-muted">
                      {item.label}
                    </span>
                    <span
                      className={`block text-xs font-bold ${
                        item.tone ? TONE[item.tone] : 'text-ink'
                      }`}
                    >
                      {item.value}
                    </span>
                  </span>
                ))}
              </span>
            )}
          </span>
        </span>
      ) : (
        <span className="mt-auto block w-full border-t border-line pt-5 text-xs font-semibold text-muted">
          Disponible en próximas etapas
        </span>
      )}
    </button>
  );
}

function CompactModuleCard({ module }: { module: HomeModuleView }) {
  const { kpi } = module;

  return (
    <button
      type="button"
      onClick={module.onOpen}
      className={`group flex w-full cursor-pointer flex-col gap-3 rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${cardClasses(
        module.config,
      )}`}
    >
      <span className="flex w-full items-center gap-3">
        <CardIcon config={module.config} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-base font-bold text-ink">{module.title}</span>
            {module.status === 'soon' && <SoonBadge />}
          </span>
        </span>
        <Icon
          name="chevron"
          size={14}
          className="-rotate-90 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
        />
      </span>

      <span className="block w-full border-t border-line pt-3">
        {kpi ? (
          <span className="flex items-center justify-between gap-2">
            <span className="text-[0.62rem] font-bold uppercase tracking-wider text-muted">
              {kpi.label}
            </span>
            <span
              className={`text-base font-bold tabular-nums ${
                kpi.danger ? 'text-danger' : 'text-ink'
              }`}
            >
              {kpi.value}
            </span>
          </span>
        ) : (
          <span className="text-[0.7rem] font-semibold text-muted">
            Disponible en próximas etapas
          </span>
        )}
      </span>
    </button>
  );
}

function ListModuleCard({ module }: { module: HomeModuleView }) {
  const { kpi } = module;

  return (
    <button
      type="button"
      onClick={module.onOpen}
      className={`group flex w-full cursor-pointer items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-surface-2 ${cardClasses(
        module.config,
      )}`}
    >
      <CardIcon config={module.config} />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink">{module.title}</span>
          {module.status === 'soon' && <SoonBadge />}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">{module.description}</span>
      </span>

      {kpi && (
        <span
          className={`shrink-0 text-sm font-bold tabular-nums ${
            kpi.danger ? 'text-danger' : 'text-ink'
          }`}
        >
          {kpi.value}
        </span>
      )}

      <Icon
        name="chevron"
        size={16}
        className="-rotate-90 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}

export function Home() {
  const { items } = useData();
  const { accounts, transactions } = useFinance();
  const { prefs } = usePrefs();
  const { setView, setSettingsOpen } = useUI();
  const { showToast } = useToast();

  const totalBalance = accounts.reduce((acc, curr) => acc + curr.balance, 0);

  const now = new Date();
  const currentMonthTx = transactions.filter((t) => {
    const date = new Date(t.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const monthlyIncome = currentMonthTx
    .filter((t) => t.type === 'ingreso')
    .reduce((acc, curr) => acc + curr.amount, 0);
  const monthlyExpenses = currentMonthTx
    .filter((t) => t.type === 'gasto')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const pendingItems = items.filter((i) => !i.bought && !i.wishlist);
  const totalPendingValue = pendingItems.reduce((acc, curr) => acc + curr.price, 0);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  const kpis: Record<HomeModuleId, ModuleKpi | null> = {
    finanzas: {
      label: 'Saldo total',
      value: money(totalBalance),
      danger: totalBalance < 0,
      secondary: [
        { label: 'Ingresos', value: money(monthlyIncome), tone: 'low' },
        { label: 'Gastos', value: money(monthlyExpenses), tone: 'danger' },
      ],
    },
    compras: {
      label: 'Pendientes',
      value: `${pendingItems.length} ${pendingItems.length === 1 ? 'artículo' : 'artículos'}`,
      secondary: [{ label: 'Valor estimado', value: money(totalPendingValue) }],
    },
    hogar: null,
    notas: null,
    tareas: null,
    habitos: null,
  };

  const openModule = (id: HomeModuleId) => {
    if (id === 'finanzas') setView('finance');
    else if (id === 'compras') setView('list');
    else showToast('Módulo en desarrollo — disponible en próximas etapas');
  };

  const visibleModules: HomeModuleView[] = HOME_MODULES
    .filter((module) => prefs.homeCards[module.id].visible)
    .map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      status: module.status,
      config: prefs.homeCards[module.id],
      kpi: kpis[module.id],
      onOpen: () => openModule(module.id),
    }));

  const gridSpacing =
    prefs.homeLayout === 'cards-lg' ? 'gap-6 sm:gap-8' : 'gap-4 sm:gap-5';

  return (
    <div className="mx-auto w-full max-w-5xl px-1 pt-6 pb-12">
      <header className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-ink">{greeting} 👋</h2>
        <p className="mt-2 text-lg text-muted">¿Qué querés gestionar hoy en Depa?</p>
      </header>

      {visibleModules.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <Icon name="grid" size={40} className="mx-auto text-muted opacity-40" />
          <h3 className="mt-4 text-base font-semibold text-ink">Tu Inicio está vacío</h3>
          <p className="mx-auto mt-2 max-w-[42ch] text-sm text-muted">
            Ocultaste todos los módulos. Activá al menos uno desde Configuración para volver a verlos.
          </p>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="mt-6 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            <Icon name="settings" size={16} />
            Abrir configuración
          </button>
        </div>
      ) : (
        <div className={`${LAYOUT_GRID[prefs.homeLayout]} ${gridSpacing}`}>
          {visibleModules.map((module) => {
            if (prefs.homeLayout === 'cards-lg') {
              return <LargeModuleCard key={module.id} module={module} />;
            }
            if (prefs.homeLayout === 'cards-sm') {
              return <CompactModuleCard key={module.id} module={module} />;
            }
            return <ListModuleCard key={module.id} module={module} />;
          })}
        </div>
      )}
    </div>
  );
}