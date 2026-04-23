'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { INDUSTRY_OPTIONS, getIndustryLabelFromKey } from '@/lib/business/industry-options';

type IndustrySelectProps = {
  id?: string;
  value: string;
  onChange: (industryKey: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

export function IndustrySelect({
  id,
  value,
  onChange,
  placeholder = 'Select your industry',
  className = '',
  ariaLabel = 'Industry',
  disabled = false,
}: IndustrySelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = id ? `${id}-listbox` : undefined;

  const displayLabel = getIndustryLabelFromKey(value) ?? '';

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return INDUSTRY_OPTIONS;
    return INDUSTRY_OPTIONS.filter(
      (opt) => opt.label.toLowerCase().includes(q) || opt.key.toLowerCase().includes(q)
    );
  }, [searchTerm]);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (ev: MouseEvent | TouchEvent) => {
      const target = ev.target;
      if (!wrapRef.current || !(target instanceof Node)) return;
      if (!wrapRef.current.contains(target)) {
        setOpen(false);
        setSearchTerm(displayLabel || '');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open, displayLabel]);

  useEffect(() => {
    if (!open) setSearchTerm(displayLabel || '');
  }, [open, displayLabel]);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      const el = searchInputRef.current;
      if (!el) return;
      const len = el.value.length;
      try {
        el.focus();
        el.setSelectionRange(len, len);
      } catch {
        el.focus();
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  const setSelectedAndClose = (industryKey: string) => {
    onChange(industryKey);
    setSearchTerm(getIndustryLabelFromKey(industryKey) ?? '');
    setHighlightedIndex(0);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative min-w-0 w-full max-w-full overflow-visible">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) {
            setOpen(false);
            setSearchTerm(displayLabel || '');
            setHighlightedIndex(0);
            return;
          }
          setSearchTerm(displayLabel || '');
          setHighlightedIndex(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSearchTerm(displayLabel || '');
            setHighlightedIndex(0);
            setOpen(true);
          }
        }}
        className={`${className} flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={`min-w-0 flex-1 truncate ${displayLabel ? '' : 'text-slate-400 dark:text-slate-500'}`}>
          {displayLabel || placeholder}
        </span>
        <svg className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
          role="dialog"
          aria-label="Industry selector"
        >
          <div className="border-b border-slate-200 p-2 dark:border-slate-700">
            <input
              ref={searchInputRef}
              type="search"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setOpen(false);
                  setSearchTerm(displayLabel || '');
                  setHighlightedIndex(0);
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(filtered.length - 1, 0)));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightedIndex((prev) => Math.max(prev - 1, 0));
                }
                if (e.key === 'Enter' && filtered.length > 0) {
                  e.preventDefault();
                  const selected = filtered[Math.max(0, highlightedIndex)];
                  if (selected) {
                    setSelectedAndClose(selected.key);
                  }
                }
              }}
              placeholder="Search industries"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              aria-label="Search industry"
            />
          </div>
          <div id={listboxId} role="listbox" className="max-h-64 overflow-y-auto overscroll-contain p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No industries found</div>
            ) : (
              filtered.map((option, index) => {
                const selected = value === option.key;
                const highlighted = index === highlightedIndex;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSelectedAndClose(option.key);
                    }}
                    className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm ${
                      selected
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                        : highlighted
                          ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                          : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
