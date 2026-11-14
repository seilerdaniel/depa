'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AppProvider, useData, useUI } from '@/state/AppProvider';
import type { View } from '@/lib/types';
import { Header } from './Header';
import { PurchasesPanel } from './PurchasesPanel';
import { ItemForm } from './ItemForm';
import { ListView } from './ListView';
import { Moodboard } from './Moodboard';
import { Toast } from './Toast';
import { ItemModal } from './ItemModal';
import { CategoryManager } from './CategoryManager';
import { SettingsModal } from './SettingsModal';
import { BuyItemModal } from './BuyItemModal';
import { ErrorBoundary } from './ErrorBoundary';
import { Icon } from './Icon';

// Los imports dinámicos van AFUERA del componente para evaluarse UNA sola vez.
const Home = dynamic(() => import('./Home').then((mod) => mod.Home), {
  loading: () => <p className="p-4 text-center text-sm text-muted animate-pulse">Cargando...</p>,
  ssr: false,
});

const Dashboard = dynamic(() => import('./Dashboard').then((mod) => mod.Dashboard), {
  loading: () => <p className="p-4 text-center text-sm text-muted animate-pulse">Cargando dashboard...</p>,
  ssr: false,
});

// Finanzas arrastra recharts (ExpenseChart) y no debe pesar en el chunk inicial.
const FinanceDashboard = dynamic(
  () => import('./FinanceDashboard').then((mod) => mod.FinanceDashboard),
  {
    loading: () => <p className="p-4 text-center text-sm text-muted animate-pulse">Cargando finanzas...</p>,
    ssr: false,
  },
);

// Un único dueño para las vistas que viven dentro de "Mis Compras".
const PURCHASE_VIEWS: readonly View[] = ['list', 'wishlist', 'moodboard', 'dashboard', 'history'];

function ModuleHeader({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={onBack}
        className="group mb-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg py-1 pr-2 text-xs font-semibold text-muted transition-colors hover:text-ink"
      >
        <Icon
          name="chevron"
          size={14}
          className="rotate-90 transition-transform duration-200 group-hover:-translate-x-0.5"
        />
        <span>Volver al Inicio</span>
      </button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.65rem]">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

function Shell() {
  const { ready } = useData();
  const {
    view, setView, setEditingItem,
    selectedItem, buyPromptItemId, isCategoryManagerOpen, itemFormOpen,
    isSettingsOpen,
  } = useUI();

  const isPurchaseView = PURCHASE_VIEWS.includes(view);

  useEffect(() => {
    setEditingItem(null);
  }, [view, setEditingItem]);

  // ==========================================
  // ATAJOS DE TECLADO (escritorio)
  // ==========================================
  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target.isContentEditable
      );
    };

    const focusSearch = () => {
      const selector = isPurchaseView
        ? '[data-search-target="items"]'
        : '[data-search-target="finance"]';
      const input = document.querySelector<HTMLInputElement>(selector);
      input?.focus();
      input?.select();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (selectedItem || buyPromptItemId || isCategoryManagerOpen || isSettingsOpen) return;

      if (event.key === 'Escape' || (event.altKey && event.key === 'ArrowLeft')) {
        if (view === 'home') return;
        event.preventDefault();
        setView('home');
        return;
      }

      const ctrlK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      const slash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey;

      if (ctrlK || slash) {
        if (!isPurchaseView && view !== 'finance') return;
        event.preventDefault();
        focusSearch();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    view, setView, isPurchaseView,
    selectedItem, buyPromptItemId, isCategoryManagerOpen, isSettingsOpen,
  ]);

  const jumpToNewMovement = () => {
    const form = document.getElementById('finance-movement-form');
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      document.getElementById('tx-amount')?.focus();
    }, 150);
  };

  if (!ready) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-bg">
        <p className="animate-pulse text-lg font-medium text-muted">Cargando Depa…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header />

      <main
        className="mx-auto w-[min(1180px,100%-32px)] flex-1 py-4 pb-10 outline-none focus:outline-none"
        id="contenido"
        tabIndex={-1}
        style={{ outline: 'none' }}
      >
        {view === 'home' && (
          <div className="animate-in fade-in duration-300">
            <Home />
          </div>
        )}

        {isPurchaseView && (
          <ErrorBoundary key={view}>
            <ModuleHeader
              title="Mis Compras"
              subtitle="Equipamiento, presupuestos, wishlist y seguimiento de cuotas."
              onBack={() => setView('home')}
            />

            <PurchasesPanel />

            <div
              className={`grid items-start gap-6 pt-6 ${
                view === 'list' && !itemFormOpen
                  ? 'grid-cols-1'
                  : 'lg:grid-cols-[370px_minmax(0,1fr)]'
              }`}
            >
              {view === 'list' && (
                <>
                  <aside className="min-w-0 lg:sticky lg:top-4">
                    <ItemForm />
                  </aside>
                  <div className="min-w-0">
                    <ListView mode="list" />
                  </div>
                </>
              )}

              {view === 'wishlist' && (
                <div className="min-w-0 animate-in fade-in duration-300 lg:col-span-2">
                  <ListView mode="wishlist" />
                </div>
              )}

              {view === 'history' && (
                <div className="min-w-0 animate-in fade-in duration-300 lg:col-span-2">
                  <ListView mode="history" />
                </div>
              )}

              {view === 'moodboard' && (
                <div className="min-w-0 animate-in fade-in duration-300 lg:col-span-2">
                  <Moodboard />
                </div>
              )}

              {view === 'dashboard' && (
                <div className="min-w-0 animate-in fade-in duration-300 lg:col-span-2">
                  <Dashboard />
                </div>
              )}
            </div>
          </ErrorBoundary>
        )}

        {view === 'finance' && (
          <ErrorBoundary key={view}>
            <ModuleHeader
              title="Mis Finanzas"
              subtitle="Cuentas, billeteras, metas de ahorro y movimientos."
              onBack={() => setView('home')}
              action={
                <button
                  type="button"
                  onClick={jumpToNewMovement}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-accent-on shadow-sm transition-all hover:bg-accent-ink active:scale-[0.99]"
                >
                  <Icon name="plus" size={17} />
                  Nuevo movimiento
                </button>
              }
            />
            <FinanceDashboard />
          </ErrorBoundary>
        )}
      </main>

      <Toast />
      <ItemModal />
      <CategoryManager />
      <SettingsModal />
      <BuyItemModal />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}