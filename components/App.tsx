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
import { BuyItemModal } from './BuyItemModal';
import { ErrorBoundary } from './ErrorBoundary';

// Los imports dinámicos van AFUERA del componente para evaluarse UNA sola vez.
const Home = dynamic(() => import('./Home').then((mod) => mod.Home), {
  loading: () => <p className="text-muted text-sm p-4 animate-pulse text-center">Cargando...</p>,
  ssr: false,
});

const Dashboard = dynamic(() => import('./Dashboard').then((mod) => mod.Dashboard), {
  loading: () => <p className="text-muted text-sm p-4 animate-pulse text-center">Cargando dashboard...</p>,
  ssr: false,
});

// Finanzas arrastra recharts (ExpenseChart) y no debe pesar en el chunk inicial.
const FinanceDashboard = dynamic(
  () => import('./FinanceDashboard').then((mod) => mod.FinanceDashboard),
  {
    loading: () => <p className="text-muted text-sm p-4 animate-pulse text-center">Cargando finanzas...</p>,
    ssr: false,
  },
);

// Un único dueño para las vistas que viven dentro de "Mis Compras".
const PURCHASE_VIEWS: readonly View[] = ['list', 'wishlist', 'moodboard', 'dashboard', 'history'];

function Shell() {
  const { ready } = useData();
  const {
    view, setView, setEditingItem,
    selectedItem, buyPromptItemId, isCategoryManagerOpen, itemFormOpen,
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
      // Un solo buscador montado a la vez, así que el selector no es ambiguo.
      const selector = isPurchaseView
        ? '[data-search-target="items"]'
        : '[data-search-target="finance"]';
      const input = document.querySelector<HTMLInputElement>(selector);
      input?.focus();
      input?.select();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Nunca robamos teclas mientras el usuario escribe: ahí "/" es una barra.
      if (isTyping(event.target)) return;

      const modalOpen = Boolean(selectedItem || buyPromptItemId || isCategoryManagerOpen);

      if (event.key === 'Escape' || (event.altKey && event.key === 'ArrowLeft')) {
        // Los modales manejan su propio Escape; acá sólo navegamos.
        if (modalOpen) return;
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
    selectedItem, buyPromptItemId, isCategoryManagerOpen,
  ]);

  if (!ready) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-bg">
        <p className="text-muted font-medium animate-pulse text-lg">Cargando Depa…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header />

      <main
        className="flex-1 mx-auto w-[min(1180px,100%-32px)] py-4 pb-10 outline-none focus:outline-none"
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
            <PurchasesPanel />

            <div
              className={`grid gap-6 pt-6 items-start ${
                view === 'list' && !itemFormOpen
                  ? 'grid-cols-1'
                  : 'lg:grid-cols-[370px_minmax(0,1fr)]'
              }`}
            >
              {view === 'list' && (
                <>
                  <aside className="lg:sticky lg:top-4 min-w-0">
                    <ItemForm />
                  </aside>
                  <div className="min-w-0">
                    <ListView mode="list" />
                  </div>
                </>
              )}

              {view === 'wishlist' && (
                <div className="lg:col-span-2 min-w-0 animate-in fade-in duration-300">
                  <ListView mode="wishlist" />
                </div>
              )}

              {view === 'history' && (
                <div className="lg:col-span-2 min-w-0 animate-in fade-in duration-300">
                  <ListView mode="history" />
                </div>
              )}

              {view === 'moodboard' && (
                <div className="lg:col-span-2 min-w-0 animate-in fade-in duration-300">
                  <Moodboard />
                </div>
              )}

              {view === 'dashboard' && (
                <div className="lg:col-span-2 min-w-0 animate-in fade-in duration-300">
                  <Dashboard />
                </div>
              )}
            </div>
          </ErrorBoundary>
        )}

        {view === 'finance' && (
          <ErrorBoundary key={view}>
            <FinanceDashboard />
          </ErrorBoundary>
        )}
      </main>

      <Toast />
      <ItemModal />
      <CategoryManager />
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
