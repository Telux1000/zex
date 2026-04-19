'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type SearchableCustomerOption = {
  id: string;
  label: string;
  company?: string | null;
  email?: string | null;
};

type SearchableCustomerSelectProps = {
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  options: SearchableCustomerOption[];
  value: string;
  onChange: (customerId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Shown when `value` is set but not in `options` (e.g. archived customer). */
  orphanValueLabel?: string;
  /** Trigger + closed state matches Quote form controls. */
  triggerClassName?: string;
  className?: string;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function matchesQuery(opt: SearchableCustomerOption, q: string): boolean {
  if (!q.trim()) return true;
  const n = norm(q);
  if (norm(opt.label).includes(n)) return true;
  if (opt.company && norm(opt.company).includes(n)) return true;
  if (opt.email && norm(opt.email).includes(n)) return true;
  return false;
}

export function SearchableCustomerSelect({
  id: propId,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  options,
  value,
  onChange,
  placeholder = 'Select customer',
  disabled,
  orphanValueLabel,
  triggerClassName,
  className,
}: SearchableCustomerSelectProps) {
  const uid = useId().replace(/:/g, '');
  const listboxId = propId ? `${propId}-listbox` : `customer-select-${uid}-listbox`;
  const searchInputId = propId ? `${propId}-search` : `customer-select-${uid}-search`;
  const baseId = propId ?? `customer-select-${uid}`;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => options.filter((o) => matchesQuery(o, search)), [options, search]);

  const selectedOpt = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const closedLabel = useMemo(() => {
    if (selectedOpt) return selectedOpt.label;
    if (value && orphanValueLabel?.trim()) return orphanValueLabel.trim();
    return '';
  }, [selectedOpt, value, orphanValueLabel]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const width = Math.max(r.width, 280);
    let left = r.left;
    left = Math.min(left, window.innerWidth - width - pad);
    left = Math.max(pad, left);
    setMenuPos({
      top: r.bottom + 4,
      left,
      width: Math.min(width, window.innerWidth - pad * 2),
    });
  }, [open, search, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const pad = 8;
      const w = Math.max(r.width, 280);
      let left = r.left;
      left = Math.min(left, window.innerWidth - w - pad);
      left = Math.max(pad, left);
      setMenuPos({
        top: r.bottom + 4,
        left,
        width: Math.min(w, window.innerWidth - pad * 2),
      });
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!search.trim()) {
      const idx = filtered.findIndex((o) => o.id === value);
      setHighlighted(idx >= 0 ? idx : 0);
    } else {
      setHighlighted(0);
    }
  }, [open, search, filtered, value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (portalRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selectOption = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
      setSearch('');
      setHighlighted(0);
      requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [onChange]
  );

  const defaultTrigger =
    'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm outline-none transition-colors hover:border-slate-400 focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600 dark:focus-visible:border-indigo-400 dark:focus-visible:ring-indigo-400/25';

  const onKeyDownTrigger = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      setSearch('');
      return;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onKeyDownSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => (filtered.length === 0 ? 0 : (h + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) =>
        filtered.length === 0 ? 0 : (h - 1 + filtered.length) % filtered.length
      );
    } else if (e.key === 'Enter') {
      if (filtered[highlighted]) {
        e.preventDefault();
        selectOption(filtered[highlighted].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setSearch('');
      triggerRef.current?.focus();
    }
  };

  const panel =
    mounted &&
    open &&
    menuPos &&
    createPortal(
      <div
        ref={portalRef}
        id={listboxId}
        role="listbox"
        aria-label="Customers"
        data-searchable-customer-select-portal=""
        className="fixed z-[100] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: 'min(20rem, calc(100vh - 1rem))',
        }}
      >
        <div className="border-b border-slate-200 p-2 dark:border-slate-700">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden
            />
            <input
              ref={searchRef}
              id={searchInputId}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onKeyDownSearch}
              placeholder="Search customers…"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-400"
              autoComplete="off"
              aria-autocomplete="list"
            />
          </div>
        </div>
        <div className="max-h-[min(14rem,calc(100vh-8rem))] overflow-y-auto overscroll-contain p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No customers found
            </p>
          ) : (
            filtered.map((opt, i) => {
              const active = i === highlighted;
              const secondary = [opt.company?.trim(), opt.email?.trim()].filter(Boolean).join(' · ');
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  id={`${baseId}-opt-${opt.id}`}
                  aria-selected={value === opt.id}
                  className={cn(
                    'flex w-full flex-col items-start rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                    active
                      ? 'bg-slate-100 dark:bg-slate-800'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/80',
                    value === opt.id && 'ring-1 ring-inset ring-indigo-500/40 dark:ring-indigo-400/30'
                  )}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    selectOption(opt.id);
                  }}
                >
                  <span className="font-medium text-slate-900 dark:text-white">{opt.label}</span>
                  {secondary ? (
                    <span className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                      {secondary}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>,
      document.body
    );

  return (
    <div ref={wrapRef} className={cn('relative min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        id={baseId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={cn(defaultTrigger, triggerClassName)}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDownTrigger}
      >
        <span className={cn('min-w-0 flex-1 truncate', !closedLabel && 'text-slate-400 dark:text-slate-500')}>
          {closedLabel || placeholder}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {panel}
    </div>
  );
}
