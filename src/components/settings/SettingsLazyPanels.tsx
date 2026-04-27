'use client';

import dynamic from 'next/dynamic';
import type { Business } from '@/lib/database.types';
import { SettingsSectionSkeleton } from './SettingsSectionSkeleton';

const TeamPanelDynamic = dynamic(() => import('./TeamPanel').then((m) => m.TeamPanel), {
  loading: () => <SettingsSectionSkeleton message="Loading team…" />,
});

const AuditLogGlobalPanelDynamic = dynamic(() => import('./AuditLogGlobalPanel').then((m) => m.AuditLogGlobalPanel), {
  loading: () => <SettingsSectionSkeleton message="Loading activity…" />,
});

export function TeamPanelLazy({ business }: { business: Business }) {
  return <TeamPanelDynamic business={business} />;
}

export function AuditLogGlobalPanelLazy({ businessId }: { businessId: string }) {
  return <AuditLogGlobalPanelDynamic businessId={businessId} />;
}
