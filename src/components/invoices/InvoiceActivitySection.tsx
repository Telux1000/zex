'use client';

import { ActivitySection } from '@/components/activity/ActivitySection';
import type { AuditLogRow } from '@/lib/audit-log';

type Props = {
  logs: AuditLogRow[];
  className?: string;
};

export function InvoiceActivitySection({ logs, className }: Props) {
  return <ActivitySection logs={logs} className={className} />;
}
