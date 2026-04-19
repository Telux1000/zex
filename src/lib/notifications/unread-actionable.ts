import type { NotificationModel } from '@/lib/notifications/types';

/** Matches `/api/notifications/intelligence` actionable unread semantics. */
export function computeUnreadActionableCount(items: NotificationModel[]): number {
  return items.filter((n) => !n.read && n.severity !== 'low').length;
}
