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
  const { view, setEditingItem } = useUI();

  useEffect(() => {
    setEditingItem(null);
  }, [view, setEditingItem]);

  if (!ready) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-bg">
        <p className="text-muted font-medium animate-pulse text-lg">Cargando Depa…</p>
      </div>
    );
  }

  const isPurchaseView = PURCHASE_VIEWS.includes(view);

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

            <div className="grid gap-6 pt-6 items-start lg:grid-cols-[370px_minmax(0,1fr)]">
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
