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
import { formatRateWithUnit } from '@/lib/invoices/invoice-line-units';
import { filterAndRankLineItemSuggestions } from '@/lib/saved-line-items/client-filter-suggestions';
import type { LineItemSuggestRow } from '@/lib/saved-line-items/suggest-types';

const MAX_SUGGESTIONS = 8;
const MIN_QUERY_LEN = 1;

export type ItemSuggestionPick = {
  name: string;
  unitPrice: number;
  description: string | null;
  taxPercent: number | null;
  unitLabel: string;
  /** ISO currency for the stored rate. */
  currency: string;
  source: 'saved' | 'history';
};

type ItemNameSuggestInputProps = {
  businessId: string | null;
  currencyCode: string;
  value: string;
  onChange: (value: string) => void;
  onPickSuggestion: (pick: ItemSuggestionPick) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  required?: boolean;
  id?: string;
  /** Focused after a suggestion is chosen (e.g. description field). */
  nextFieldId?: string;
  /** When the next field is not unique in the DOM (e.g. mobile + desktop rows). */
  nextFocusSelector?: string;
  /** Runs after pick; use to focus the visible duplicate field. */
  onAfterSelect?: () => void;
  /** If true, show a short "Loading saved items" line (use only the first line row to avoid repeated noise). */
  showIndexLoadingStatusText?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

function trackFeatureUse(businessId: string, targetKey: 'line_item_suggestion_shown' | 'line_item_suggestion_selected') {
  if (!businessId) return;
  void fetch('/api/product-usage/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'feature_use', target_key: targetKey, business_id: businessId }),
  }).catch(() => {});
}

function SuggestionNameWithHighlight({ name, query }: { name: string; query: string }) {
  const q = query.trim();
  if (q.length === 0) {
    return <span className="min-w-0 font-semibold text-[var(--foreground)]">{name}</span>;
  }
  const lower = name.toLowerCase();
  const ql = q.toLowerCase();
  const i = lower.indexOf(ql);
  if (i < 0) {
    return <span className="min-w-0 font-semibold text-[var(--foreground)]">{name}</span>;
  }
  return (
    <span className="min-w-0 font-semibold text-[var(--foreground)]">
      {name.slice(0, i)}
      <mark className="rounded-sm bg-amber-100/95 text-inherit dark:bg-amber-500/25">{name.slice(i, i + q.length)}</mark>
      {name.slice(i + q.length)}
    </span>
  );
}

export function ItemNameSuggestInput({
  businessId,
  currencyCode,
  value,
  onChange,
  onPickSuggestion,
  disabled,
  placeholder,
  className,
  required,
  id,
  nextFieldId,
  nextFocusSelector,
  onAfterSelect,
  showIndexLoadingStatusText = false,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: ItemNameSuggestInputProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const uid = useId().replace(/:/g, '');
  const listId = `${id ? `${id}-` : ''}item-suggest-${uid}`;
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState<LineItemSuggestRow[]>([]);
  const [indexStatus, setIndexStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const shownLoggedRef = useRef(false);
  const indexFetchGen = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // One-time (per business + currency) preload: client-side filter has no per-keystroke network.
  useEffect(() => {
    if (!businessId || disabled) {
      setAutocompleteIndex([]);
      setIndexStatus('idle');
      return;
    }
    const cur = (currencyCode || 'USD').toUpperCase().slice(0, 3);
    indexFetchGen.current += 1;
    const gen = indexFetchGen.current;
    setIndexStatus('loading');
    const ac = new AbortController();
    const u = new URL(
      `/api/businesses/${encodeURIComponent(businessId)}/saved-line-items/autocomplete-index`,
      window.location.origin
    );
    u.searchParams.set('currency', cur);
    void fetch(u.toString(), { signal: ac.signal })
      .then((r) => r.json())
      .then((data: { items?: LineItemSuggestRow[] }) => {
        if (gen !== indexFetchGen.current) return;
        setAutocompleteIndex(Array.isArray(data?.items) ? data.items : []);
        setIndexStatus('ready');
      })
      .catch((e: unknown) => {
        if (gen !== indexFetchGen.current) return;
        const n = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
        if (n === 'AbortError') return;
        setAutocompleteIndex([]);
        setIndexStatus('error');
      });
    return () => ac.abort();
  }, [businessId, disabled, currencyCode]);

  const suggestions = useMemo(
    () => filterAndRankLineItemSuggestions(autocompleteIndex, value, MAX_SUGGESTIONS),
    [autocompleteIndex, value]
  );

  useEffect(() => {
    setHighlighted((h) => {
      if (suggestions.length === 0) return -1;
      return h >= 0 && h < suggestions.length ? h : -1;
    });
  }, [suggestions]);

  const shouldShowDropdown =
    open &&
    !disabled &&
    Boolean(businessId) &&
    value.trim().length >= MIN_QUERY_LEN &&
    (indexStatus === 'ready' || indexStatus === 'error');

  const updateMenuPosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const width = Math.max(r.width, 200);
    let left = r.left;
    left = Math.min(left, window.innerWidth - width - pad);
    left = Math.max(pad, left);
    setMenuPos({
      top: r.bottom + 4,
      left,
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !shouldShowDropdown) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, shouldShowDropdown, suggestions.length, value, updateMenuPosition]);

  useEffect(() => {
    if (!open) {
      shownLoggedRef.current = false;
      return;
    }
    if (suggestions.length > 0 && !shownLoggedRef.current && businessId) {
      shownLoggedRef.current = true;
      trackFeatureUse(businessId, 'line_item_suggestion_shown');
    }
  }, [open, suggestions.length, businessId]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updateMenuPosition();
    const onResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (portalRef.current?.contains(t)) return;
      setOpen(false);
      setHighlighted(-1);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const applySuggestion = useCallback(
    (s: LineItemSuggestRow) => {
      if (businessId) trackFeatureUse(businessId, 'line_item_suggestion_selected');
      onPickSuggestion({
        name: s.name,
        unitPrice: s.unitPrice,
        description: s.description,
        taxPercent: s.taxPercent,
        unitLabel: s.unitLabel,
        currency: s.currency,
        source: s.source,
      });
      setOpen(false);
      setHighlighted(-1);
      requestAnimationFrame(() => {
        if (onAfterSelect) {
          onAfterSelect();
          return;
        }
        if (nextFieldId) {
          document.getElementById(nextFieldId)?.focus();
        } else if (nextFocusSelector) {
          document.querySelector<HTMLElement>(nextFocusSelector)?.focus();
        }
      });
    },
    [onPickSuggestion, nextFieldId, nextFocusSelector, onAfterSelect, businessId]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const canNav = open && suggestions.length > 0;
    if (e.key === 'ArrowDown') {
      if (!open && businessId && value.trim().length >= MIN_QUERY_LEN) {
        setOpen(true);
      }
      if (canNav) {
        e.preventDefault();
        setHighlighted((h) => (h + 1 >= suggestions.length ? 0 : h + 1));
      }
      return;
    }
    if (e.key === 'ArrowUp' && canNav) {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
      return;
    }
    if (e.key === 'Enter') {
      if (canNav && highlighted >= 0 && suggestions[highlighted]) {
        e.preventDefault();
        applySuggestion(suggestions[highlighted]);
      }
      return;
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setHighlighted(-1);
      }
    }
  };

  const showEmptyHint =
    open &&
    businessId &&
    (indexStatus === 'ready' || indexStatus === 'error') &&
    value.trim().length >= MIN_QUERY_LEN &&
    suggestions.length === 0;

  const dropdown =
    mounted &&
    shouldShowDropdown &&
    menuPos &&
    createPortal(
      <div
        ref={portalRef}
        id={listId}
        role="listbox"
        aria-label="Line item suggestions"
        className="fixed z-50 max-h-[min(15rem,70vh)] w-[min(100vw-1rem,var(--suggest-w))] overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] shadow-lg"
        style={
          {
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            maxWidth: 'calc(100vw - 1rem)',
            ['--suggest-w' as string]: `${menuPos.width}px`,
          } as React.CSSProperties
        }
      >
        {suggestions.map((s, i) => {
          const cur = (s.currency || currencyCode || 'USD').toUpperCase();
          const rateLine = formatRateWithUnit(s.unitPrice, cur, s.unitLabel);
          const subParts: string[] = [rateLine];
          if (s.description?.trim()) subParts.push(s.description.trim());
          const sub = subParts.join(' • ');
          const active = i === highlighted;
          const tag = s.source === 'history' ? 'Recent' : 'Saved';
          return (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={active}
              className={`flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm sm:py-2 ${
                active
                  ? 'bg-[var(--background)] text-[var(--foreground)]'
                  : 'hover:bg-[var(--background)] hover:text-[var(--foreground)]'
              }`}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(ev) => {
                ev.preventDefault();
                applySuggestion(s);
              }}
            >
              <span className="flex w-full min-w-0 items-center justify-between gap-2">
                <SuggestionNameWithHighlight name={s.name} query={value} />
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {tag}
                </span>
              </span>
              {sub ? (
                <span className="line-clamp-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                  {sub}
                </span>
              ) : null}
            </button>
          );
        })}
        {showEmptyHint ? (
          <div className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">
            {autocompleteIndex.length === 0
              ? 'Saved items will appear here after you create invoices.'
              : 'No matching saved items or recent lines.'}
          </div>
        ) : null}
      </div>,
      document.body
    );

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      {showIndexLoadingStatusText && indexStatus === 'loading' && businessId && !disabled ? (
        <p className="min-h-4 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          Loading saved items…
        </p>
      ) : null}
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlighted(-1);
        }}
        onFocus={() => {
          if (businessId && value.trim().length >= MIN_QUERY_LEN) setOpen(true);
        }}
        onBlur={() => {
          /* menu uses mousedown; avoid racing close before pick */
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={className}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={Boolean(
          open && (suggestions.length > 0 || showEmptyHint) && value.trim().length >= MIN_QUERY_LEN
        )}
        aria-controls={listId}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      />
      {dropdown}
    </div>
  );
}
