'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { normalizeBillingPlan, type BillingPlan } from '@/lib/billing/plans';

export function useBillingPlan() {
  const [plan, setPlan] = useState<BillingPlan>('starter');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        const res = await fetch('/api/billing/effective-plan', { cache: 'no-store' });
        if (!res.ok) {
          const { data } = await supabase
            .from('profiles')
            .select('billing_plan')
            .eq('id', user.id)
            .maybeSingle();
          if (!cancelled) {
            setPlan(normalizeBillingPlan((data as { billing_plan?: unknown } | null)?.billing_plan));
          }
          return;
        }
        const j = (await res.json()) as { billing_plan?: unknown };
        if (!cancelled) {
          setPlan(normalizeBillingPlan(j.billing_plan));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { plan, loading };
}

