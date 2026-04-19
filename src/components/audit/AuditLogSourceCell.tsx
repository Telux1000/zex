'use client';

import type { AuditLogRow } from '@/lib/audit-log';

export function AuditLogSourceCell({ row }: { row: AuditLogRow }) {
  const src = row.actor_source_label ?? 'Workspace';
  return <span className="whitespace-nowrap">{src}</span>;
}
