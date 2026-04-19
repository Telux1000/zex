'use client';

import type { AuditLogRow } from '@/lib/audit-log';

/** User column: `profiles.full_name` via `actor_display_label` (API-enriched), with optional email tooltip. */
export function AuditLogUserCell({ row }: { row: AuditLogRow }) {
  const label = row.actor_display_label ?? row.performed_by_name;
  const tip = row.actor_display_tooltip;
  return (
    <span
      title={tip ?? undefined}
      className="inline-block max-w-full cursor-default break-words text-left md:inline md:max-w-[16rem] md:truncate"
    >
      {label}
    </span>
  );
}
