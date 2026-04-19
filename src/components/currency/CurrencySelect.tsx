'use client';

import { SUPPORTED_CURRENCIES } from '@/lib/currency/supported';
import { cn } from '@/lib/utils/cn';

type Props = {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
};

export function CurrencySelect({
  value,
  onChange,
  disabled,
  id,
  className,
  allowEmpty,
  emptyLabel,
}: Props) {
  const raw = (value ?? '').trim();
  const code =
    allowEmpty && raw === '' ? '' : (raw || 'USD').toUpperCase();
  const inSupported =
    code === '' || SUPPORTED_CURRENCIES.some((c) => c.code === code);

  return (
    <select
      id={id}
      disabled={disabled}
      value={code}
      onChange={(e) => onChange(e.target.value)}
      className={cn(className)}
    >
      {allowEmpty ? (
        <option value="">{emptyLabel ?? 'No preference'}</option>
      ) : null}
      {!inSupported && code ? (
        <option value={code}>
          {code} (custom)
        </option>
      ) : null}
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name} ({c.code})
        </option>
      ))}
    </select>
  );
}
