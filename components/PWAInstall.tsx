'use client';

import { useState, useEffect } from 'react';
import { Icon } from './Icon';

export function PWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevenir el banner automático de Chrome
      e.preventDefault();
      // Guardar el evento para dispararlo luego
      setDeferredPrompt(e);
      // Mostrar nuestro botón
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Ocultar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsVisible(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!isVisible) return null;

  return (
    <button
      onClick={handleInstallClick}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent text-accent-on text-xs font-bold shadow-sm hover:bg-accent-ink transition-colors animate-in fade-in slide-in-from-top-2"
    >
      <Icon name="brand" size={14} />
      Instalar App
    </button>
  );
}