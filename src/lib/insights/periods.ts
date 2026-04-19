/** Local-calendar date key YYYY-MM-DD */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday-start week; returns inclusive local date keys [start, end]. */
export function getWeekRangeContaining(date: Date): { startKey: string; endKey: string } {
  const x = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  const start = new Date(x);
  const end = new Date(x);
  end.setDate(end.getDate() + 6);
  return { startKey: toLocalDateKey(start), endKey: toLocalDateKey(end) };
}

export function getPreviousWeekRange(date: Date): { startKey: string; endKey: string } {
  const x = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  x.setDate(x.getDate() - 7);
  return getWeekRangeContaining(x);
}

export function getCurrentMonthRange(date: Date): { startKey: string; endKey: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { startKey: toLocalDateKey(start), endKey: toLocalDateKey(end) };
}

export function getPreviousMonthRange(date: Date): { startKey: string; endKey: string } {
  const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const end = new Date(date.getFullYear(), date.getMonth(), 0);
  return { startKey: toLocalDateKey(start), endKey: toLocalDateKey(end) };
}

export function isDateKeyInRange(key: string, startKey: string, endKey: string): boolean {
  return key >= startKey && key <= endKey;
}
