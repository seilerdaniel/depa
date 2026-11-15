'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useData, useFinance, useToast, useUI } from '@/state/AppProvider';
import {
  analyzeRecurringExpenseStatus,
  currentMonthKey,
  formatMonth,
  money,
} from '@/lib/utils';
import { Icon } from './Icon';

export function NotificationBell() {
  const { items } = useData();
  const { recurringExpenses, payRecurringExpense } = useFinance();
  const { setSelectedItem, setView } = useUI();
  const { showToast } = useToast();

  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentMonth = currentMonthKey();

  const pendingThisMonth = useMemo(
    () =>
      items.filter(
        (i) => !i.bought && !i.wishlist && i.purchaseMonth === currentMonth,
      ),
    [items, currentMonth],
  );

  // Servicios vencidos o que vencen en los próximos 5 días.
  const pendingServices = useMemo(
    () =>
      recurringExpenses
        .map((expense) => ({
          expense,
          status: analyzeRecurringExpenseStatus(expense),
        }))
        .filter(
          ({ expense, status }) =>
            expense.active &&
            status.appliesThisMonth &&
            !status.isPaidThisMonth &&
            (status.state === 'overdue' || status.state === 'due-soon'),
        )
        .sort((a, b) => (a.status.daysUntilDue ?? 0) - (b.status.daysUntilDue ?? 0)),
    [recurringExpenses],
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Cerrar el popover al hacer clic afuera o presionar Escape
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const sendSystemNotification = () => {
    if (!hasPending) {
      new Notification('Depa', {
        body: 'No tenés compras planificadas ni servicios por vencer. ¡Todo al día!',
        icon: '/favicon.svg',
      });
      return;
    }

    const parts: string[] = [];
    if (pendingThisMonth.length > 0) {
      parts.push(`Compras: ${pendingThisMonth.map((i) => i.name).join(', ')}`);
    }
    if (pendingServices.length > 0) {
      parts.push(`Servicios: ${pendingServices.map(({ expense }) => expense.name).join(', ')}`);
    }

    new Notification('Recordatorio de Depa', {
      body: parts.join(' · '),
      icon: '/favicon.svg',
    });
  };

  const handleSystemAlert = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showToast('Este entorno no soporta notificaciones del sistema.');
      return;
    }

    if (permission === 'granted') {
      sendSystemNotification();
      showToast('Notificación enviada');
      return;
    }

    if (permission === 'denied') {
      showToast('Las notificaciones del sistema están bloqueadas en este navegador/ventana.');
      return;
    }

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      sendSystemNotification();
      showToast('Notificaciones activadas');
    } else {
      showToast('No se otorgó permiso para notificaciones del sistema.');
    }
  };

  const hasPending = pendingThisMonth.length > 0 || pendingServices.length > 0;
  const totalPending = pendingThisMonth.length + pendingServices.length;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          hasPending
            ? `Recordatorios: ${totalPending} pendientes entre compras y servicios`
            : 'Recordatorios del mes'
        }
        title="Recordatorios de compra y servicios"
        className={`relative p-2 rounded-full border transition-colors cursor-pointer ${
          open
            ? 'border-accent bg-accent-soft text-accent-ink'
            : 'border-line bg-surface text-muted hover:text-ink'
        }`}
      >
        <Icon name="bell" size={18} />
        {hasPending && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger animate-pulse"
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Recordatorios de compra"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface-2/40">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                Recordatorios
              </h3>
              <p className="text-[0.68rem] text-muted capitalize">
                {formatMonth(currentMonth)}
              </p>
            </div>
            {hasPending && (
              <span className="px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink text-[0.65rem] font-bold">
                {totalPending} {totalPending === 1 ? 'pendiente' : 'pendientes'}
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-line/60">
            {pendingThisMonth.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-surface-2/30">
                  <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted">
                    Compras planificadas este mes
                  </p>
                </div>
                {pendingThisMonth.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setSelectedItem(item);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-surface-2 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink truncate">{item.name}</p>
                      <p className="text-[0.65rem] text-muted truncate">{item.category}</p>
                    </div>
                    <span className="text-xs font-bold text-ink tabular-nums shrink-0">
                      {money(item.price)}
                    </span>
                  </button>
                ))}
              </>
            )}

            {pendingServices.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-surface-2/30">
                  <p className="text-[0.6rem] font-bold uppercase tracking-wider text-muted">
                    Servicios por vencer
                  </p>
                </div>
                {pendingServices.map(({ expense, status }) => {
                  const days = status.daysUntilDue ?? 0;
                  const isOverdue = status.state === 'overdue';

                  return (
                    <div
                      key={expense.id}
                      className="px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-surface-2 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setView('finance');
                        }}
                        className="min-w-0 text-left cursor-pointer"
                      >
                        <p className="text-xs font-semibold text-ink truncate">{expense.name}</p>
                        <p
                          className={`text-[0.65rem] ${
                            isOverdue ? 'font-semibold text-danger' : 'text-muted'
                          }`}
                        >
                          {isOverdue
                            ? `Vencido hace ${Math.abs(days)} d`
                            : days === 0
                              ? 'Vence hoy'
                              : `Vence en ${days} d`}
                        </p>
                      </button>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-xs font-bold text-ink tabular-nums">
                          {money(expense.amount)}
                        </span>
                        {expense.accountId ? (
                          <button
                            type="button"
                            onClick={() => payRecurringExpense(expense.id)}
                            className="inline-flex min-h-[28px] cursor-pointer items-center rounded-lg bg-accent px-2.5 text-[0.65rem] font-bold text-accent-on transition-opacity hover:opacity-90"
                          >
                            Pagar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              setView('finance');
                            }}
                            className="text-[0.65rem] font-bold text-accent hover:underline cursor-pointer"
                          >
                            Ver
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {!hasPending && (
              <div className="px-4 py-6 text-center">
                <p className="text-xs font-semibold text-ink">¡Todo al día!</p>
                <p className="text-[0.7rem] text-muted mt-1">
                  No tenés compras planificadas ni servicios por vencer este mes.
                </p>
              </div>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-line bg-surface-2/30 flex items-center justify-between gap-2">
            <span className="text-[0.65rem] text-muted">
              {permission === 'granted'
                ? 'Alertas del sistema activas'
                : permission === 'denied'
                  ? 'Alertas del sistema bloqueadas'
                  : 'Alertas del sistema sin activar'}
            </span>
            <button
              type="button"
              onClick={handleSystemAlert}
              className="text-[0.68rem] font-bold text-accent hover:underline cursor-pointer shrink-0"
            >
              {permission === 'granted' ? 'Probar alerta' : 'Activar alerta'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}