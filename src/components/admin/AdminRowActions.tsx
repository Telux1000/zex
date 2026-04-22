'use client';

import { MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';

export type AdminRowActionItem =
  | {
      label: string;
      onClick: () => void | Promise<void>;
      danger?: boolean;
      disabled?: boolean;
    }
  | { divider: true };

const MENU_GAP = 4;
const VIEWPORT_PAD = 8;
const MENU_Z = 200;

function placeMenu(trigger: DOMRect, menuW: number, menuH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = trigger.bottom + MENU_GAP;
  const fitsBelow = trigger.bottom + MENU_GAP + menuH <= vh - VIEWPORT_PAD;
  const fitsAbove = trigger.top - MENU_GAP - menuH >= VIEWPORT_PAD;

  if (!fitsBelow && fitsAbove) {
    top = trigger.top - MENU_GAP - menuH;
  } else if (!fitsBelow && !fitsAbove) {
    const maxH = vh - 2 * VIEWPORT_PAD;
    const effectiveH = Math.min(menuH, maxH);
    top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - effectiveH);
  } else if (top + menuH > vh - VIEWPORT_PAD) {
    top = Math.max(VIEWPORT_PAD, vh - VIEWPORT_PAD - menuH);
  }

  let left = trigger.right - menuW;
  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - menuW - VIEWPORT_PAD));

  return { top, left };
}

export function AdminRowActions({ items, disabled }: { items: AdminRowActionItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    const menuEl = menuRef.current;
    if (!triggerEl || !menuEl) return;
    const tr = triggerEl.getBoundingClientRect();
    const { offsetWidth: mw, offsetHeight: mh } = menuEl;
    if (mw === 0 || mh === 0) return;
    setCoords(placeMenu(tr, mw, mh));
  }, []);

  useLayoutEffect(() => {
    if (!open || mobile) return;
    updatePosition();
    const id = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(id);
  }, [open, mobile, items, updatePosition]);

  useEffect(() => {
    if (!open || mobile) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, mobile, updatePosition]);

  useEffect(() => {
    if (!open || mobile) return;
    const menuEl = menuRef.current;
    if (!menuEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updatePosition());
    ro.observe(menuEl);
    return () => ro.disconnect();
  }, [open, mobile, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  useEffect(() => {
    if (!open || mobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, mobile]);

  useEffect(() => {
    const apply = () => setMobile(window.innerWidth < 768);
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  const flat = items.filter((x): x is Exclude<AdminRowActionItem, { divider: true }> => !('divider' in x));
  if (flat.length === 0) return null;

  const menuBody = (
    <>
      {items.map((item, idx) =>
        'divider' in item ? (
          <div
            key={`d-${idx}`}
            className="my-1 border-t border-zinc-200 dark:border-zinc-700"
            role="separator"
          />
        ) : (
          <button
            key={`${item.label}-${idx}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cn(
              'block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800',
              item.danger ? 'text-red-600 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-200',
              item.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent dark:hover:bg-transparent'
            )}
            onClick={() => {
              if (item.disabled) return;
              const out = item.onClick();
              if (out != null && typeof (out as Promise<void>).then === 'function') {
                void (out as Promise<void>).finally(() => setOpen(false));
              } else {
                setOpen(false);
              }
            }}
          >
            {item.label}
          </button>
        )
      )}
    </>
  );

  const desktopMenu =
    open && !mobile && mounted ? (
      createPortal(
        <div
          ref={menuRef}
          className="fixed max-h-[min(20rem,calc(100vh-1rem))] min-w-[11rem] overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          style={{ top: coords.top, left: coords.left, zIndex: MENU_Z }}
          role="menu"
        >
          {menuBody}
        </div>,
        document.body
      )
    ) : null;

  return (
    <div className="relative flex justify-end" ref={triggerRef}>
      <button
        type="button"
        className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-label="Row actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && mobile ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/50"
            aria-label="Close actions"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            {menuBody}
          </div>
        </div>
      ) : null}
      {desktopMenu}
    </div>
  );
}
