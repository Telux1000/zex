/** Monday 00:00 local time */
export function getWeekStartMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function lastNWeekStarts(n: number, now = new Date()): Date[] {
  const anchor = getWeekStartMonday(now);
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - 7 * i);
    out.push(d);
  }
  return out;
}

/** Week starts (Monday 00:00 local) from the week containing `rangeStart` through `rangeEnd`, capped. */
export function weekBucketStartsCoveringRange(
  rangeStart: Date,
  rangeEnd: Date,
  maxWeeks = 14
): Date[] {
  const endMs = rangeEnd.getTime();
  let w = getWeekStartMonday(rangeStart);
  const out: Date[] = [];
  while (w.getTime() <= endMs && out.length < maxWeeks) {
    out.push(new Date(w));
    w = new Date(w);
    w.setDate(w.getDate() + 7);
  }
  if (out.length === 0) {
    out.push(getWeekStartMonday(rangeEnd));
  }
  return out;
}

export function sumInWeekBuckets(
  weekStarts: Date[],
  rows: { at: string; amount: number }[]
): number[] {
  return weekStarts.map((start) => {
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const t0 = start.getTime();
    const t1 = end.getTime();
    return rows.reduce((s, r) => {
      const t = new Date(r.at).getTime();
      if (t >= t0 && t < t1) return s + r.amount;
      return s;
    }, 0);
  });
}

export function formatShortWeekLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
