'use client';

import { useEffect } from 'react';
import { AppProvider, useApp } from '@/state/AppProvider';
import { Header } from './Header';
import { ViewTabs } from './ViewTabs';
import { ItemForm } from './ItemForm';
import { ListView } from './ListView';
import { Moodboard } from './Moodboard';
import { Dashboard } from './Dashboard';
import { Toast } from './Toast';
import { ItemModal } from './ItemModal';
import { CategoryManager } from './CategoryManager';

function Shell() {
  const { view, ready, setEditingItem } = useApp();

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

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Header />

      <main className="flex-1 mx-auto w-[min(1180px,100%-32px)] py-4 pb-10 outline-none" id="contenido" tabIndex={-1}>
        <div className="mb-4">
          <ViewTabs />
        </div>

        {/* Agregamos min-w-0 a los hijos del grid para evitar desbordes */}
        <div className="grid gap-6 pt-2 items-start lg:grid-cols-[370px_minmax(0,1fr)]">
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
      </main>

      <Toast />
      <ItemModal />
      <CategoryManager />
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