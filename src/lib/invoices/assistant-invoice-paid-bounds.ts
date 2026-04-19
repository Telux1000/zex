import { formatInTimeZone } from 'date-fns-tz';
import {
  resolvePaymentsReceivedTimeRange,
  type PaymentsNaturalRangeSpec,
} from '@/lib/analytics/payments-received-time-range';

/** Calendar presets for assistant “paid in period” queries (aligned with payments analytics). */
export type AssistantPaidPeriodPreset =
  | 'today'
  | 'this_week'
  | 'last_week'
  | 'last_7_days'
  | 'this_month'
  | 'last_month';

function presetToSpec(preset: AssistantPaidPeriodPreset): PaymentsNaturalRangeSpec {
  switch (preset) {
    case 'today':
      return { kind: 'today' };
    case 'this_week':
      return { kind: 'this_week' };
    case 'last_week':
      return { kind: 'last_week' };
    case 'last_7_days':
      return { kind: 'rolling_days', days: 7 };
    case 'this_month':
      return { kind: 'this_month' };
    case 'last_month':
      return { kind: 'last_month' };
  }
}

export type AssistantPaidUtcWindow = {
  startIso: string;
  endIso: string;
  timezone: string;
  /** Internal label e.g. this_week — for logs only */
  label: string;
};

/**
 * Resolve inclusive UTC bounds for payment timestamp filtering, using the same rules as
 * dashboard / payments-received analytics (IANA TZ, Monday-start week).
 */
export function resolveAssistantPaidUtcWindow(
  preset: AssistantPaidPeriodPreset,
  now: Date = new Date(),
  workspaceTimezone?: string | null
): AssistantPaidUtcWindow | null {
  const r = resolvePaymentsReceivedTimeRange(presetToSpec(preset), now, workspaceTimezone);
  if (!r.ok) return null;
  return {
    startIso: r.value.startIso,
    endIso: r.value.endIso,
    timezone: r.value.timezone,
    label: r.value.label,
  };
}

export type AssistantInvoicePeriodContext = {
  utcWindow: AssistantPaidUtcWindow;
  /** Inclusive civil dates in workspace TZ for `issue_date` / `created_at` filtering */
  issueBounds: { from: string; to: string };
  humanRange: string;
};

/**
 * Resolve payment UTC bounds plus civil date bounds for invoice issue-date queries,
 * aligned with dashboard payments-received rules.
 */
export function resolveAssistantInvoicePeriodContext(
  spec: PaymentsNaturalRangeSpec,
  now: Date = new Date(),
  workspaceTimezone?: string | null
): { ok: true; value: AssistantInvoicePeriodContext } | { ok: false } {
  const r = resolvePaymentsReceivedTimeRange(spec, now, workspaceTimezone);
  if (!r.ok) return { ok: false };
  const tz = r.value.timezone;
  const from = formatInTimeZone(new Date(r.value.startIso), tz, 'yyyy-MM-dd');
  const to = formatInTimeZone(new Date(r.value.endIso), tz, 'yyyy-MM-dd');
  return {
    ok: true,
    value: {
      utcWindow: {
        startIso: r.value.startIso,
        endIso: r.value.endIso,
        timezone: tz,
        label: r.value.label,
      },
      issueBounds: { from, to },
      humanRange: r.value.humanRange,
    },
  };
}
