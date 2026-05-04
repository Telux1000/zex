'use client';

import type { CSSProperties } from 'react';
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { normalizeCountryCode } from '@/lib/location';
import { flagEmojiFromIso } from '@/lib/location/resolve-country-input';
import { CALLING_COUNTRIES, type CallingCountryRow } from '@/lib/phone/calling-countries';
import {
  isPhoneCountryCallingCodeOnly,
  PHONE_MSG,
  resolveCountryForDialOnlyInput,
} from '@/lib/phone/e164';
import { cn } from '@/lib/utils/cn';

export type PhoneNumberInputProps = {
  value: string;
  onChange: (e164OrEmpty: string) => void;
  /** ISO 3166-1 alpha-2 default when `value` is empty or not parseable. */
  defaultCountry: string;
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
  /** Root element */
  className?: string;
  /** Phone input id (for label htmlFor). */
  id?: string;
  /** Optional id for the country listbox trigger button. */
  countrySelectorId?: string;
  /** Fires after the phone field blurs (e.g. parent field validation). */
  onBlur?: () => void;
  /**
   * `inline` (default): country + number side by side from `md` up.
   * `stacked`: country selector row, then number row (all breakpoints).
   */
  layout?: 'inline' | 'stacked';
};

function dialPlus(iso: CountryCode | null): string {
  if (!iso) return '';
  try {
    return `+${getCountryCallingCode(iso)}`;
  } catch {
    return '+';
  }
}

function isOnlyDialOrEmpty(line: string, iso: CountryCode | null): boolean {
  const t = line.replace(/\s/g, '');
  if (!t || t === '+') return true;
  if (!iso) return false;
  return t === dialPlus(iso).replace(/\s/g, '');
}

function parseValid(line: string, hint: CountryCode | null) {
  const c = line.replace(/\s/g, '');
  if (!c || c === '+') return null;
  let p = parsePhoneNumberFromString(c);
  if (p?.isValid()) return p;
  if (hint) {
    p = parsePhoneNumberFromString(c, hint);
    if (p?.isValid()) return p;
  }
  return null;
}

function hydrateCountryAndLine(
  v: string,
  fallback: CountryCode
): { country: CountryCode | null; line2: string } {
  const t = v.trim();
  if (!t) {
    return { country: null, line2: '' };
  }
  const compactHead = t.replace(/\s/g, '');
  if (compactHead.startsWith('+') && isPhoneCountryCallingCodeOnly(compactHead)) {
    const iso = resolveCountryForDialOnlyInput(compactHead, fallback);
    return { country: iso, line2: compactHead };
  }
  let p = parsePhoneNumberFromString(t);
  if (p?.isValid()) {
    return {
      country: (p.country ?? fallback) as CountryCode,
      line2: p.formatInternational(),
    };
  }
  p = parsePhoneNumberFromString(t, fallback);
  if (p?.isValid()) {
    return {
      country: (p.country ?? fallback) as CountryCode,
      line2: p.formatInternational(),
    };
  }
  const p2 = parsePhoneNumberFromString(t.replace(/\s/g, ''), fallback);
  if (p2?.nationalNumber) {
    const iso = (p2.country ?? fallback) as CountryCode;
    const q = parsePhoneNumberFromString(t.replace(/\s/g, ''), iso);
    if (q?.isValid()) {
      return { country: iso, line2: q.formatInternational() };
    }
    return { country: iso, line2: q?.formatInternational() ?? t };
  }
  const digits = t.replace(/\D/g, '');
  if (digits) {
    const q = parsePhoneNumberFromString(digits, fallback);
    if (q?.isValid()) {
      return { country: (q.country ?? fallback) as CountryCode, line2: q.formatInternational() };
    }
    return { country: fallback, line2: `${dialPlus(fallback)}${digits}` };
  }
  return { country: fallback, line2: t };
}

function line2AfterCountryChange(
  prevLine: string,
  fromIso: CountryCode | null,
  toIso: CountryCode
): string {
  const newDial = dialPlus(toIso);
  if (!fromIso) {
    return newDial;
  }
  const compact = prevLine.replace(/\s/g, '');
  const oldDial = dialPlus(fromIso).replace(/\s/g, '');
  if (!compact || compact === '+' || compact === oldDial) {
    return newDial;
  }
  const pOld = parsePhoneNumberFromString(compact, fromIso) ?? parsePhoneNumberFromString(compact);
  if (pOld?.nationalNumber) {
    const nat = String(pOld.nationalNumber);
    const pNew = parsePhoneNumberFromString(nat, toIso);
    if (pNew?.isValid()) return pNew.formatInternational();
    const glued = `${newDial}${nat}`;
    const p3 = parsePhoneNumberFromString(glued.replace(/\s/g, ''), toIso);
    if (p3?.isValid()) return p3.formatInternational();
    return newDial;
  }
  return newDial;
}

/** Keep +, digits, spaces; collapse duplicate + */
function sanitizePhoneLine(raw: string): string {
  const s = raw.replace(/[^\d\s+]/g, '');
  const i = s.indexOf('+');
  if (i === -1) return s;
  return s.slice(i).replace(/(?!^)\+/g, '');
}

function rowByIso(iso: CountryCode | null): CallingCountryRow | undefined {
  if (!iso) return undefined;
  return CALLING_COUNTRIES.find((r) => r.iso2 === iso);
}

export function PhoneNumberInput({
  value,
  onChange,
  defaultCountry,
  disabled = false,
  required = false,
  error = null,
  className,
  id,
  countrySelectorId,
  onBlur: onBlurProp,
  layout = 'inline',
}: PhoneNumberInputProps) {
  const dc = (normalizeCountryCode(defaultCountry) || 'ZA') as CountryCode;

  const [country, setCountry] = useState<CountryCode | null>(() =>
    hydrateCountryAndLine(String(value ?? '').trim(), dc).country
  );
  const [line2, setLine2] = useState(
    () => hydrateCountryAndLine(String(value ?? '').trim(), dc).line2
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const lastSyncedValueRef = useRef<string | undefined>(undefined);
  const prevDcRef = useRef<CountryCode | null>(null);
  const reactId = useId();
  const phoneInputId = id ?? `${reactId}-phone`;
  const errId = `${phoneInputId}-err`;
  const countryBtnId = countrySelectorId ?? `${phoneInputId}-country`;

  const hydrateFromValue = useCallback((v: string, fallback: CountryCode) => {
    const { country: c, line2: l } = hydrateCountryAndLine(v, fallback);
    setCountry(c);
    setLine2(l);
    setLocalError(null);
  }, []);

  useLayoutEffect(() => {
    const v = value ?? '';
    const empty = !String(v).trim();

    if (!empty) {
      if (v === lastSyncedValueRef.current) return;
      lastSyncedValueRef.current = v;
      hydrateFromValue(v, dc);
      prevDcRef.current = dc;
      return;
    }

    if (v === lastSyncedValueRef.current && prevDcRef.current === dc) return;
    lastSyncedValueRef.current = v;
    prevDcRef.current = dc;
    hydrateFromValue('', dc);
  }, [value, dc, hydrateFromValue]);

  const commit = useCallback(
    (next: string) => {
      lastSyncedValueRef.current = next;
      onChange(next);
    },
    [onChange]
  );

  const selectedRow = rowByIso(country);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CALLING_COUNTRIES;
    return CALLING_COUNTRIES.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.iso2.toLowerCase().includes(q) ||
        r.dial.replace('+', '').includes(q) ||
        r.dial.toLowerCase().includes(q)
    );
  }, [search]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }
    const updatePosition = () => {
      const el = triggerRef.current;
      if (!el || typeof window === 'undefined') return;
      const r = el.getBoundingClientRect();
      const minW = 280;
      const w = Math.max(r.width, minW);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      const maxH = Math.max(160, window.innerHeight - r.bottom - 12);
      setPanelStyle({
        position: 'fixed',
        top: r.bottom + 4,
        left,
        width: w,
        maxHeight: maxH,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !panelStyle) return;
    const idRaf = window.requestAnimationFrame(() => {
      const el = searchRef.current;
      if (!el) return;
      const len = el.value.length;
      try {
        el.focus();
        el.setSelectionRange(len, len);
      } catch {
        el.focus();
      }
    });
    return () => window.cancelAnimationFrame(idRaf);
  }, [open, panelStyle]);

  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent | TouchEvent) => {
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
      setHighlighted(0);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      setOpen(false);
      setSearch('');
      setHighlighted(0);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const pickCountry = (iso: CountryCode) => {
    setLocalError(null);
    setOpen(false);
    setSearch('');
    setHighlighted(0);
    const nextLine = country == null ? dialPlus(iso) : line2AfterCountryChange(line2, country, iso);
    setCountry(iso);
    setLine2(nextLine);
    const p = parseValid(nextLine, iso);
    if (p?.isValid()) {
      commit(p.format('E.164'));
    } else if (isOnlyDialOrEmpty(nextLine, iso)) {
      commit(required ? dialPlus(iso) : '');
    }
  };

  const onLine2Change = (raw: string) => {
    setLocalError(null);
    let v = sanitizePhoneLine(raw);
    if (!v.trim() || v === '+') {
      setCountry(null);
      setLine2('');
      commit('');
      return;
    }
    if (!country) {
      setLine2(v);
      const p = parseValid(v, null);
      if (p?.isValid() && p.country) {
        setCountry(p.country);
        setLine2(p.formatInternational());
        commit(p.format('E.164'));
        return;
      }
      const c = v.replace(/\s/g, '');
      commit(c);
      return;
    }
    if (!v.startsWith('+')) {
      v = `${dialPlus(country)}${v.replace(/\D/g, '')}`;
    }
    setLine2(v);
    const p = parseValid(v, country);
    if (p?.isValid()) {
      commit(p.format('E.164'));
      return;
    }
    const compact = v.replace(/\s/g, '');
    if (isOnlyDialOrEmpty(v, country)) {
      commit(required ? dialPlus(country) : '');
      return;
    }
    commit(compact);
  };

  const onLine2Blur = () => {
    setLocalError(null);
    if (!country) {
      const p = parseValid(line2, null);
      if (p?.isValid() && p.country) {
        setCountry(p.country);
        setLine2(p.formatInternational());
        commit(p.format('E.164'));
      } else if (!line2.trim()) {
        setLocalError(null);
      } else if (isPhoneCountryCallingCodeOnly(line2.replace(/\s/g, ''))) {
        setLocalError(required ? PHONE_MSG.afterCountryCode : null);
        if (!required) {
          setCountry(null);
          setLine2('');
          commit('');
        }
      } else {
        setLocalError(PHONE_MSG.invalid);
      }
      onBlurProp?.();
      return;
    }
    const compact = line2.replace(/\s/g, '');
    if (!compact || compact === '+') {
      setCountry(null);
      setLine2('');
      commit('');
      onBlurProp?.();
      return;
    }
    const p = parseValid(line2, country);
    if (p?.isValid()) {
      setLine2(p.formatInternational());
      commit(p.format('E.164'));
      onBlurProp?.();
      return;
    }
    if (isOnlyDialOrEmpty(line2, country)) {
      if (required) {
        const dial = dialPlus(country);
        setLine2(dial);
        commit(dial);
        setLocalError(PHONE_MSG.afterCountryCode);
      } else {
        setCountry(null);
        setLine2('');
        commit('');
      }
      onBlurProp?.();
      return;
    }
    setLocalError(PHONE_MSG.invalid);
    onBlurProp?.();
  };

  const mergedError = error || localError;
  const listboxId = `${countryBtnId}-listbox`;

  const inputBase =
    'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500';

  return (
    <div ref={wrapRef} className={cn('w-full min-w-0 max-w-full space-y-2', className)}>
      <div
        className={cn(
          'grid w-full min-w-0 grid-cols-1 gap-3',
          layout === 'stacked'
            ? ''
            : 'md:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] md:items-start md:gap-4'
        )}
      >
        <div className="relative w-full min-w-0">
          <label htmlFor={countryBtnId} className="sr-only">
            Country
          </label>
          <button
            ref={triggerRef}
            id={countryBtnId}
            type="button"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? listboxId : undefined}
            aria-label={country ? `${selectedRow?.name ?? country}, change country` : 'Select country, opens list'}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (disabled) return;
              // Empty filter on open: never mirror selected country into search (avoids combobox-in-trigger UX).
              setSearch('');
              setHighlighted(
                country ? Math.max(0, CALLING_COUNTRIES.findIndex((r) => r.iso2 === country)) : 0
              );
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setSearch('');
                setHighlighted(
                  country ? Math.max(0, CALLING_COUNTRIES.findIndex((r) => r.iso2 === country)) : 0
                );
                setOpen(true);
              }
            }}
            className={cn(
              'flex min-h-11 w-full min-w-0 cursor-pointer select-none items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left text-sm text-slate-900 shadow-sm focus-visible:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white',
              mergedError ? 'border-red-500 dark:border-red-500' : ''
            )}
          >
            <span className="pointer-events-none shrink-0 text-lg leading-none" aria-hidden>
              {country ? flagEmojiFromIso(country) : '🌐'}
            </span>
            <span
              className={cn(
                'pointer-events-none min-w-0 flex-1 truncate',
                country ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {country ? (selectedRow?.name ?? country) : 'Select country'}
            </span>
            <svg
              className="pointer-events-none h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {open && panelStyle && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={panelRef}
                style={panelStyle}
                className="min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
                role="dialog"
                aria-label="Choose country"
              >
                <div className="border-b border-slate-200 p-2 dark:border-slate-700">
                  <input
                    ref={searchRef}
                    type="text"
                    inputMode="search"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setHighlighted(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setOpen(false);
                        setSearch('');
                        setHighlighted(0);
                        return;
                      }
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlighted((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlighted((h) => Math.max(h - 1, 0));
                      }
                      if (e.key === 'Enter' && filtered.length > 0) {
                        e.preventDefault();
                        const r = filtered[Math.max(0, highlighted)];
                        if (r) pickCountry(r.iso2);
                      }
                    }}
                    placeholder="Search country or code"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    aria-label="Search countries"
                  />
                </div>
                <div id={listboxId} role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No countries found</div>
                  ) : (
                    filtered.map((r, index) => {
                      const selected = country != null && r.iso2 === country;
                      const hi = index === highlighted;
                      return (
                        <button
                          key={r.iso2}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onMouseEnter={() => setHighlighted(index)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            pickCountry(r.iso2);
                          }}
                          className={cn(
                            'flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm',
                            selected
                              ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200'
                              : hi
                                ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                                : 'text-slate-700 dark:text-slate-200'
                          )}
                        >
                          <span className="shrink-0 text-base leading-none" aria-hidden>
                            {flagEmojiFromIso(r.iso2)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{r.dial}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>,
              document.body
            )
          : null}
        </div>

        <div className="w-full min-w-0">
          <label htmlFor={phoneInputId} className="sr-only">
            Phone number with country code
          </label>
          <input
            id={phoneInputId}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required={required}
            disabled={disabled}
            value={line2}
            aria-invalid={Boolean(mergedError)}
            aria-describedby={mergedError ? errId : undefined}
            onChange={(e) => onLine2Change(e.target.value)}
            onBlur={onLine2Blur}
            placeholder={country ? dialPlus(country) : 'Select a country first'}
            className={cn(inputBase, mergedError ? 'border-red-500 dark:border-red-500' : '')}
          />
        </div>
      </div>

      {mergedError ? (
        <p id={errId} className="text-xs text-red-600 dark:text-red-400" role="alert">
          {mergedError}
        </p>
      ) : null}
    </div>
  );
}
