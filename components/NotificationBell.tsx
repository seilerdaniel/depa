'use client';

import { useState, useEffect } from 'react';
import { useData } from '@/state/AppProvider';
import { Icon } from './Icon';
import { formatMonth } from '@/lib/utils';

export function NotificationBell() {
  const { items } = useData();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [hasPending, setHasPending] = useState(false);

  // 1. Contar si hay artículos planificados para este mes
  useEffect(() => {
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const pendingThisMonth = items.filter(i => 
      !i.bought && !i.wishlist && i.purchaseMonth === currentMonth
    );
    setHasPending(pendingThisMonth.length > 0);
  }, [items]);

  // 2. Obtener permiso actual
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('Tu navegador no soporta notificaciones.');
      return;
    }
    
    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      triggerNotification();
    }
  };

  const triggerNotification = () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const pending = items.filter(i => !i.bought && !i.wishlist && i.purchaseMonth === currentMonth);
    
    if (pending.length === 0) {
      new Notification('Depa', { body: 'No tenés compras planificadas para este mes. ¡Todo al día!' });
    } else {
      const names = pending.map(i => i.name).join(', ');
      new Notification('Recordatorio de Depa', { 
        body: `Este mes te toca comprar: ${names}`,
        icon: '/favicon.svg'
      });
    }
  };

  if (permission === 'denied') return null; // Si el usuario bloqueó las notis, no mostramos nada

  return (
    <button
      onClick={permission === 'granted' ? triggerNotification : requestPermission}
      className="relative p-2 rounded-full border border-line bg-surface text-muted hover:text-ink transition-colors"
      title={permission === 'granted' ? 'Probar notificación' : 'Activar notificaciones'}
    >
      <Icon name="bell" size={18} />
      {hasPending && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger animate-pulse" />
      )}
    </button>
  );
}