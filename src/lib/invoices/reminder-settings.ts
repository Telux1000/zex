import type { Json } from '@/lib/database.types';

export type ReminderRelativeTo = 'before_due' | 'after_due';

export type ReminderTimingEntry = {
  days: number;
  relativeTo: ReminderRelativeTo;
};

export type CustomerReminderSettings = {
  automaticReminders: boolean;
  reminderTiming: ReminderTimingEntry[];
};

export type InvoiceReminderSettings = {
  /** ISO 8601 datetime — one-off scheduled reminder (invoice-level). */
  scheduledReminderAt?: string | null;
  /** Used when use_customer_reminder_defaults is false */
  automaticReminders?: boolean;
  reminderTiming?: ReminderTimingEntry[];
};

export const defaultCustomerReminderSettings = (): CustomerReminderSettings => ({
  automaticReminders: false,
  reminderTiming: [
    { days: 3, relativeTo: 'before_due' },
    { days: 3, relativeTo: 'after_due' },
  ],
});

function parseTimingEntry(raw: unknown): ReminderTimingEntry | null {
  if (typeof raw !== 'object' || !raw) return null;
  const o = raw as Record<string, unknown>;
  const days = Number(o.days);
  const rel = o.relativeTo === 'after_due' ? 'after_due' : 'before_due';
  if (!Number.isFinite(days) || days < 0 || days > 365) return null;
  return { days: Math.floor(days), relativeTo: rel };
}

export function parseCustomerReminderSettings(raw: unknown): CustomerReminderSettings | null {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const automaticReminders = Boolean(o.automaticReminders);
  const reminderTiming: ReminderTimingEntry[] = [];
  if (Array.isArray(o.reminderTiming)) {
    for (const t of o.reminderTiming) {
      const p = parseTimingEntry(t);
      if (p) reminderTiming.push(p);
    }
  }
  return { automaticReminders, reminderTiming };
}

export function parseInvoiceReminderSettings(raw: unknown): InvoiceReminderSettings | null {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const scheduledRaw = o.scheduledReminderAt;
  const scheduledReminderAt =
    scheduledRaw == null || scheduledRaw === ''
      ? null
      : typeof scheduledRaw === 'string'
        ? scheduledRaw
        : null;
  const automaticReminders =
    typeof o.automaticReminders === 'boolean' ? o.automaticReminders : undefined;
  const reminderTiming: ReminderTimingEntry[] = [];
  if (Array.isArray(o.reminderTiming)) {
    for (const t of o.reminderTiming) {
      const p = parseTimingEntry(t);
      if (p) reminderTiming.push(p);
    }
  }
  return {
    scheduledReminderAt,
    ...(automaticReminders !== undefined ? { automaticReminders } : {}),
    ...(reminderTiming.length > 0 ? { reminderTiming } : {}),
  };
}

export function serializeCustomerReminderSettings(s: CustomerReminderSettings): Json {
  return {
    automaticReminders: s.automaticReminders,
    reminderTiming: s.reminderTiming.map((t) => ({
      days: t.days,
      relativeTo: t.relativeTo,
    })),
  } as unknown as Json;
}

export function serializeInvoiceReminderSettings(
  s: InvoiceReminderSettings,
  opts: { useCustomerDefaults: boolean }
): Json {
  const base: Record<string, unknown> = {};
  if (s.scheduledReminderAt != null && String(s.scheduledReminderAt).trim()) {
    base.scheduledReminderAt = String(s.scheduledReminderAt).trim();
  } else {
    base.scheduledReminderAt = null;
  }
  if (!opts.useCustomerDefaults) {
    base.automaticReminders = Boolean(s.automaticReminders);
    base.reminderTiming = (s.reminderTiming ?? []).map((t) => ({
      days: t.days,
      relativeTo: t.relativeTo,
    }));
  }
  return base as unknown as Json;
}

export type EffectiveReminderConfig = {
  automaticReminders: boolean;
  reminderTiming: ReminderTimingEntry[];
  scheduledReminderAt: string | null;
};

export function resolveEffectiveReminderConfig(
  useCustomerDefaults: boolean,
  customerRaw: unknown,
  invoiceRaw: unknown,
  opts?: { fallbackTiming?: ReminderTimingEntry[] }
): EffectiveReminderConfig {
  const inv = parseInvoiceReminderSettings(invoiceRaw) ?? {};
  const cust = parseCustomerReminderSettings(customerRaw) ?? defaultCustomerReminderSettings();
  const defaultTiming = opts?.fallbackTiming ?? defaultCustomerReminderSettings().reminderTiming;

  const scheduledReminderAt =
    inv.scheduledReminderAt != null && String(inv.scheduledReminderAt).trim()
      ? String(inv.scheduledReminderAt).trim()
      : null;

  if (useCustomerDefaults) {
    return {
      automaticReminders: cust.automaticReminders,
      reminderTiming: cust.reminderTiming.length > 0 ? cust.reminderTiming : defaultTiming,
      scheduledReminderAt,
    };
  }

  return {
    automaticReminders: inv.automaticReminders ?? false,
    reminderTiming:
      inv.reminderTiming && inv.reminderTiming.length > 0 ? inv.reminderTiming : defaultTiming,
    scheduledReminderAt,
  };
}

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dueDateUtc(dueDateStr: string): Date | null {
  const iso = String(dueDateStr ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

/** Calendar day difference: target - due (negative = before due). */
export function calendarOffsetFromDue(dueDateStr: string, todayUtc: Date): number | null {
  const due = dueDateUtc(dueDateStr);
  if (!due) return null;
  const t = Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate());
  const d = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((t - d) / (24 * 60 * 60 * 1000));
}

export function offsetMatchesTiming(
  offsetFromDue: number,
  entry: ReminderTimingEntry
): boolean {
  if (entry.relativeTo === 'before_due') {
    return offsetFromDue === -entry.days;
  }
  return offsetFromDue === entry.days;
}
