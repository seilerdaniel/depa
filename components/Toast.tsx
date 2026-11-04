'use client';

import { useToast } from '@/state/AppProvider';

export function Toast() {
  const { toast, hideToast } = useToast();
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed left-1/2 bottom-5 -translate-x-1/2 z-50 flex items-center gap-4 max-w-[calc(100%-28px)] px-4 py-3 rounded-2xl bg-[#22211d] text-[#faf8f2] shadow-2xl">
      <p className="text-sm">{toast.message}</p>
      {toast.actionLabel && toast.onAction && (
        <button type="button" onClick={() => { hideToast(); toast.onAction?.(); }}
          className="shrink-0 px-1.5 py-1 rounded-md text-[#9adfbe] text-sm font-bold hover:bg-white/10">
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}