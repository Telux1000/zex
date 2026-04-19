import { dueDateUtc, type EffectiveReminderConfig } from '@/lib/invoices/reminder-settings';

function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Human-readable preview of the next reminder (one-off scheduled, else earliest rule-based date).
 */
export function formatNextReminderPreview(
  effective: EffectiveReminderConfig,
  dueDateStr: string,
  now: Date = new Date()
): string {
  const scheduledRaw = effective.scheduledReminderAt;
  if (scheduledRaw != null && String(scheduledRaw).trim()) {
    const t = Date.parse(String(scheduledRaw));
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      if (t >= utcDayStart(now)) {
        return `Next one-off reminder: ${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
      }
    }
  }

  if (!effective.automaticReminders) {
    return 'Automatic reminders are off. Add a one-off reminder above if needed.';
  }

  const due = dueDateUtc(dueDateStr);
  if (!due) {
    return 'Add a due date on the invoice to preview automatic reminder dates.';
  }

  let bestTs: number | null = null;
  for (const entry of effective.reminderTiming) {
    const cand = new Date(due);
    if (entry.relativeTo === 'before_due') {
      cand.setUTCDate(cand.getUTCDate() - entry.days);
    } else {
      cand.setUTCDate(cand.getUTCDate() + entry.days);
    }
    const candTs = utcDayStart(cand);
    const startToday = utcDayStart(now);
    if (candTs >= startToday) {
      if (bestTs == null || candTs < bestTs) bestTs = candTs;
    }
  }

  if (bestTs != null) {
    const d = new Date(bestTs);
    return `Next automatic reminder: ${d.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
  }

  return 'No upcoming automatic reminder dates (based on due date and timing rules).';
}
