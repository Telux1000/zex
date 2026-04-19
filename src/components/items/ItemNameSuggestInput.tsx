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
import { formatCurrencyAmount } from '@/lib/utils/currency';
import {
  filterSavedLineItemSuggestions,
  SAVED_LINE_ITEMS_CHANGED_EVENT,
  savedLineItemsLocalStorageKey,
  type SavedLineItemSuggestion,
} from '@/lib/items/saved-line-items-store';

const DEBOUNCE_MS = 220;
const MAX_SUGGESTIONS = 8;
const MIN_QUERY_LEN = 1;

export type ItemSuggestionPick = {
  name: string;
  unitPrice: number;
  description: string | null;
  taxPercent: number | null;
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
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

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
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: ItemNameSuggestInputProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const uid = useId().replace(/:/g, '');
  const listId = `${id ? `${id}-` : ''}item-suggest-${uid}`;
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [bucketRev, setBucketRev] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!businessId) return;
    const bump = (e: Event) => {
      const d = (e as CustomEvent<{ businessId?: string }>).detail;
      if (d?.businessId && d.businessId !== businessId) return;
      setBucketRev((r) => r + 1);
    };
    window.addEventListener(SAVED_LINE_ITEMS_CHANGED_EVENT, bump as EventListener);
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === savedLineItemsLocalStorageKey(businessId)) setBucketRev((r) => r + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SAVED_LINE_ITEMS_CHANGED_EVENT, bump as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [businessId]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [value]);

  const suggestions: SavedLineItemSuggestion[] = useMemo(() => {
    if (!businessId || disabled) return [];
    const q = debounced.trim();
    if (q.length < MIN_QUERY_LEN) return [];
    return filterSavedLineItemSuggestions(businessId, q, MAX_SUGGESTIONS);
  }, [businessId, debounced, disabled, bucketRev]);

  const shouldShowDropdown =
    open &&
    !disabled &&
    Boolean(businessId) &&
    debounced.trim().length >= MIN_QUERY_LEN;

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
  }, [open, shouldShowDropdown, suggestions.length, debounced, value, updateMenuPosition]);

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
    (s: SavedLineItemSuggestion) => {
      onPickSuggestion({
        name: s.name,
        unitPrice: s.unitPrice,
        description: s.description,
        taxPercent: s.taxPercent,
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
    [onPickSuggestion, nextFieldId, nextFocusSelector, onAfterSelect]
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
    debounced.trim().length >= MIN_QUERY_LEN &&
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
        aria-label="Saved items"
        className="fixed z-50 max-h-[min(15rem,70vh)] w-[min(100vw-1rem,var(--suggest-w))] overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900"
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
          const cur = (currencyCode || 'USD').toUpperCase();
          const subParts: string[] = [formatCurrencyAmount(s.unitPrice, cur)];
          if (s.description?.trim()) subParts.push(s.description.trim());
          const sub = subParts.join(' • ');
          const active = i === highlighted;
          return (
            <button
              key={s.key}
              type="button"
              role="option"
              aria-selected={active}
              className={`flex w-full cursor-pointer flex-col items-start px-3 py-2.5 text-left text-sm sm:py-2 ${
                active
                  ? 'bg-gray-100 dark:bg-gray-800'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(ev) => {
                ev.preventDefault();
                applySuggestion(s);
              }}
            >
              <span className="font-semibold text-gray-900 dark:text-white">{s.name}</span>
              {sub ? (
                <span className="mt-0.5 line-clamp-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                  {sub}
                </span>
              ) : null}
            </button>
          );
        })}
        {showEmptyHint ? (
          <div className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">Create new item</div>
        ) : null}
      </div>,
      document.body
    );

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
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
        aria-expanded={Boolean(open && (suggestions.length > 0 || showEmptyHint))}
        aria-controls={listId}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      />
      {dropdown}
    </div>
  );
}
