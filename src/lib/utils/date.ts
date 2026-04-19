import {
  format,
  parse,
  parseISO,
  addDays,
  isBefore,
  isAfter,
  startOfDay,
  isValid,
  differenceInCalendarDays,
  formatDistanceToNowStrict,
} from 'date-fns';

/**
 * Parse due_date from AI output: "Friday", "in 7 days", "2025-03-20", "next Friday"
 */
export function parseDueDate(input: string, fromDate: Date = new Date()): Date {
  const trimmed = (input || '').trim().toLowerCase();
  if (!trimmed) return addDays(fromDate, 30);

  // ISO date
  const iso = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) return startOfDay(parseISO(trimmed));

  // "in N days"
  const inDays = trimmed.match(/in\s+(\d+)\s+days?/);
  if (inDays) return addDays(fromDate, parseInt(inDays[1], 10));

  // "N days"
  const numDays = trimmed.match(/^(\d+)\s+days?$/);
  if (numDays) return addDays(fromDate, parseInt(numDays[1], 10));

  // Day names: "friday", "next friday"
  const days: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };
  let targetDay: number | null = null;
  let next = false;
  for (const [name, d] of Object.entries(days)) {
    if (trimmed.includes(name)) {
      targetDay = d;
      next = trimmed.includes('next');
      break;
    }
  }
  if (targetDay != null) {
    const current = fromDate.getDay();
    let diff = targetDay - current;
    if (diff <= 0 || next) diff += 7;
    return addDays(fromDate, diff);
  }

  return addDays(fromDate, 30);
}

export function formatDueDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Normalize English month tokens for date-fns `parse` (case-sensitive month names).
 * e.g. "8 may" → "8 May", "may 8th" → "May 8th" (ordinal stripped elsewhere).
 */
export function normalizeEnglishMonthTokensForDueParse(phrase: string): string {
  return phrase.replace(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi,
    (m) => {
      const low = m.toLowerCase().replace(/\.$/, '');
      const map: Record<string, string> = {
        jan: 'Jan',
        feb: 'Feb',
        mar: 'Mar',
        apr: 'Apr',
        may: 'May',
        jun: 'Jun',
        jul: 'Jul',
        aug: 'Aug',
        sep: 'Sep',
        sept: 'Sep',
        oct: 'Oct',
        nov: 'Nov',
        dec: 'Dec',
        january: 'January',
        february: 'February',
        march: 'March',
        april: 'April',
        june: 'June',
        july: 'July',
        august: 'August',
        september: 'September',
        october: 'October',
        november: 'November',
        december: 'December',
      };
      return map[low] ?? m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
    }
  );
}

/** Try common absolute invoice due phrases → ISO date (e.g. "17 April 2026", "April 17, 2026"). */
export function tryParseAbsoluteDuePhraseToIso(
  phrase: string,
  fromDate: Date = new Date()
): string | null {
  let c = phrase.trim().replace(/\.$/, '');
  if (!c) return null;
  c = c.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
  c = normalizeEnglishMonthTokensForDueParse(c);
  if (/^\d{4}-\d{2}-\d{2}$/.test(c)) return c;
  const year = format(fromDate, 'yyyy');
  const formats = [
    'd MMMM yyyy',
    'd MMM yyyy',
    'MMMM d, yyyy',
    'MMM d, yyyy',
    'MMMM d yyyy',
    'MMM d yyyy',
    'd MMMM',
    'd MMM',
    'MMMM d',
    'MMM d',
    'yyyy-MM-dd',
  ];
  for (const fmt of formats) {
    const withYear =
      fmt === 'd MMMM' || fmt === 'd MMM' || fmt === 'MMMM d' || fmt === 'MMM d'
        ? `${c} ${year}`
        : c;
    const parseFmt =
      fmt === 'd MMMM' || fmt === 'd MMM' || fmt === 'MMMM d' || fmt === 'MMM d'
        ? `${fmt} yyyy`
        : fmt;
    const d = parse(withYear, parseFmt, fromDate);
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  }
  return null;
}

/** Human-readable due date for assistant summaries (e.g. "17 April 2026"). */
export function formatDueDateForAssistantSummary(
  isoOrNatural: string,
  fromDate: Date = new Date()
): string {
  const t = String(isoOrNatural ?? '').trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = startOfDay(parseISO(t));
    return isValid(d) ? format(d, 'd MMMM yyyy') : t;
  }
  const d = parseDueDate(t, fromDate);
  return isValid(d) ? format(d, 'd MMMM yyyy') : t;
}

/**
 * Normalize wizard/AI due strings to ISO `yyyy-MM-dd` when we can do so safely.
 * Leaves other phrasing as-is (avoid mapping unknown text to a default date).
 */
export function normalizeWizardDueDateToIso(
  raw: string | undefined | null,
  fromDate: Date = new Date()
): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const lower = t.toLowerCase();
  if (
    /in\s+\d+\s+days?/.test(lower) ||
    /^\d+\s+days?$/.test(lower) ||
    /\b(today|tomorrow)\b/.test(lower) ||
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(lower)
  ) {
    if (/\btoday\b/.test(lower)) return formatDueDate(startOfDay(fromDate));
    if (/\btomorrow\b/.test(lower)) return formatDueDate(addDays(startOfDay(fromDate), 1));
    const d = parseDueDate(t, fromDate);
    return isValid(d) ? formatDueDate(d) : null;
  }
  const abs = tryParseAbsoluteDuePhraseToIso(t, fromDate);
  if (abs) return abs;
  return null;
}

/**
 * Wizard safety check: reject past due dates and suggest same month/day next year.
 */
export function validateAssistantDueDateIso(
  iso: string,
  fromDate: Date = new Date()
): { ok: true } | { ok: false; suggestedIso: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { ok: false, suggestedIso: iso };
  const due = startOfDay(parseISO(iso));
  const today = startOfDay(fromDate);
  if (!isValid(due)) return { ok: false, suggestedIso: iso };
  if (!isBefore(due, today)) return { ok: true };
  const y = Number(format(due, 'yyyy')) + 1;
  const m = format(due, 'MM');
  const d = format(due, 'dd');
  const candidate = `${y}-${m}-${d}`;
  const parsed = startOfDay(parseISO(candidate));
  return { ok: false, suggestedIso: isValid(parsed) ? candidate : iso };
}

export function formatDisplayDate(date: string | Date | null | undefined): string {
  if (date == null) return '—';
  if (typeof date === 'string') {
    const raw = String(date).trim();
    if (!raw) return '—';
    // Plain YYYY-MM-DD: parse at noon UTC to avoid TZ edge cases; still invalid if malformed.
    const normalized =
      raw.length <= 10 && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00.000Z` : raw;
    const d = parseISO(normalized);
    if (!isValid(d)) return '—';
    return format(d, 'MMM d, yyyy');
  }
  if (!isValid(date)) return '—';
  return format(date, 'MMM d, yyyy');
}

export type PaidAtTableSubtitleOptions = {
  /** Tooltip wording: full payment vs most recent partial payment */
  tooltipKind?: 'paid_on' | 'last_payment_on';
};

/**
 * Subtitle under paid / partially-paid status in tables.
 * Always uses calendar `line` (MMM d, yyyy) for a stable two-line layout; optional relative phrase only in `title` (tooltip).
 */
export function formatPaidAtTableSubtitle(
  iso: string | null | undefined,
  opts?: PaidAtTableSubtitleOptions
): {
  line: string;
  title: string;
} | null {
  if (iso == null || String(iso).trim() === '') return null;
  const raw = String(iso).trim();
  const d = parseISO(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (!isValid(d)) return null;
  const absolute = formatDisplayDate(d);
  const long = format(d, 'EEEE, MMMM d, yyyy');
  const kind = opts?.tooltipKind ?? 'paid_on';
  const baseTitle =
    kind === 'last_payment_on' ? `Last payment on ${long}` : `Paid on ${long}`;
  const days = differenceInCalendarDays(new Date(), d);
  const rel =
    days >= 0 && days <= 7 ? formatDistanceToNowStrict(d, { addSuffix: true }) : null;
  const title = rel ? `${baseTitle} · ${rel}` : baseTitle;
  return { line: absolute, title };
}

export function isOverdue(dueDate: string, status: string): boolean {
  if (status === 'paid') return false;
  return isBefore(parseISO(dueDate), startOfDay(new Date()));
}
