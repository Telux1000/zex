'use client';

import { useEffect, useState } from 'react';
import { AdminContentCard } from '@/components/admin/AdminContentCard';
import { AdminSecurityConsole } from '@/components/admin/security/AdminSecurityConsole';
import type { SecurityConsolePayload } from '@/components/admin/security/types';

export function AdminSecurityPanel() {
  const [data, setData] = useState<SecurityConsolePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/admin/security')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setError(typeof json.error === 'string' ? json.error : 'Failed to load security console');
          setData(null);
          return;
        }
        setError(null);
        setData(json as SecurityConsolePayload);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load security console');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <AdminContentCard>
        <p className="text-sm text-zinc-500">Loading security console…</p>
      </AdminContentCard>
    );
  }

  if (error || !data) {
    return (
      <AdminContentCard>
        <p className="text-sm text-red-600 dark:text-red-400">{error ?? 'Unknown error'}</p>
      </AdminContentCard>
    );
  }

  return (
    <AdminSecurityConsole
      data={data}
      onPoliciesSaved={(policies) =>
        setData((prev) => (prev ? { ...prev, policies } : prev))
      }
    />
  );
}
