/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type ToastVariant = 'success' | 'error';

export type Toast = {
  id: string;
  variant: ToastVariant;
  message: string;
  createdAt: number;
};

type ToastContextValue = {
  showSuccessToast: (message: string) => void;
  showErrorToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timeoutsRef.current.get(id);
    if (t) window.clearTimeout(t);
    timeoutsRef.current.delete(id);
  }, []);

  const showToast = useCallback(
    (variant: ToastVariant, message: string) => {
      const trimmed = String(message ?? '').trim();
      if (!trimmed) return;

      const id = makeId();
      const createdAt = Date.now();
      const toast: Toast = { id, variant, message: trimmed, createdAt };
      setToasts((prev) => [...prev, toast].slice(-4));

      const timeoutId = window.setTimeout(() => dismiss(id), 4000);
      timeoutsRef.current.set(id, timeoutId);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      showSuccessToast: (message) => showToast('success', message),
      showErrorToast: (message) => showToast('error', message),
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed top-3 right-3 z-[1000] flex w-full max-w-[92vw] flex-col gap-2 sm:top-4 sm:right-4 sm:max-w-[420px]"
        aria-live="polite"
        aria-relevant="additions removals"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 shadow-sm',
              t.variant === 'success'
                ? 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/50 dark:bg-green-900/30 dark:text-green-200'
                : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200'
            )}
            role="status"
          >
            {t.variant === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-snug">{t.message}</div>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              className={cn(
                'ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-sm transition-colors',
                'hover:bg-black/5 dark:hover:bg-white/10'
              )}
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts must be used within ToastProvider');
  return ctx;
}

