import type { RecurringFrequency } from '@/lib/recurring-invoice/types';

/** Next calendar occurrence after `fromIso` (YYYY-MM-DD), interpreted at UTC noon to avoid DST edge cases. */
export function addRecurringInterval(fromIso: string, frequency: RecurringFrequency): string {
  const d = new Date(`${fromIso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${fromIso}`);
  }
  switch (frequency) {
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case 'quarterly':
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
  return d.toISOString().slice(0, 10);
}

/** First run date: scheduled start, or today (UTC) if start is in the past. */
export function computeInitialNextRun(startDateIso: string, todayIso: string): string {
  return startDateIso < todayIso ? todayIso : startDateIso;
}
