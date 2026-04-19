'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getBusinessBaseCurrency } from '@/lib/business/currency-policy';
import { greetingFirstNameFromProfileAndUser } from '@/lib/user/greeting-first-name';

export type InvoiceCreationCustomerRow = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  preferred_currency_code: string | null;
};

export type InvoiceCreationWorkspace = {
  businessId: string | null;
  businessAddressLine1: string | null;
  loadBusiness: () => Promise<string | null>;
  companyBaseCurrency: string | null;
  customersFetchState: 'idle' | 'loading' | 'resolved';
  allCustomers: InvoiceCreationCustomerRow[];
  userFirstName: string | null;
  invoiceHubReturnTo: string;
};

export function useInvoiceCreationWorkspace(): InvoiceCreationWorkspace {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const invoiceHubReturnTo = useMemo(
    () => pathname + (searchParams.toString() ? `?${searchParams.toString()}` : ''),
    [pathname, searchParams]
  );

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessAddressLine1, setBusinessAddressLine1] = useState<string | null>(null);
  const [companyBaseCurrency, setCompanyBaseCurrency] = useState<string | null>(null);
  const [customersFetchState, setCustomersFetchState] = useState<'idle' | 'loading' | 'resolved'>(
    'idle'
  );
  const [allCustomers, setAllCustomers] = useState<InvoiceCreationCustomerRow[]>([]);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const fn = greetingFirstNameFromProfileAndUser(
        prof as { full_name?: string | null } | null,
        user
      );
      setUserFirstName(fn || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    supabase
      .from('businesses')
      .select('id, address_line1')
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0];
        setBusinessId(row?.id ?? null);
        setBusinessAddressLine1((row as { address_line1?: string | null } | undefined)?.address_line1 ?? null);
      });
  }, [supabase]);

  useEffect(() => {
    if (!businessId) {
      setCustomersFetchState('idle');
      return;
    }
    setCustomersFetchState('loading');
    let cancelled = false;
    void supabase
      .from('customers')
      .select(
        'id, name, company, email, phone, address_line1, city, state, postal_code, country, preferred_currency_code'
      )
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(80)
      .then(({ data }) => {
        if (cancelled) return;
        setAllCustomers((data ?? []) as InvoiceCreationCustomerRow[]);
        setCustomersFetchState('resolved');
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, supabase]);

  useEffect(() => {
    if (!businessId) {
      setCompanyBaseCurrency(null);
      return;
    }
    supabase
      .from('businesses')
      .select('currency, invoice_settings')
      .eq('id', businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setCompanyBaseCurrency(
          getBusinessBaseCurrency(
            data as {
              currency?: string | null;
              invoice_settings?: { default_currency?: string | null } | null;
            }
          )
        );
      });
  }, [businessId, supabase]);

  async function loadBusiness() {
    const { data } = await supabase.from('businesses').select('id, address_line1').limit(1);
    const row = data?.[0];
    const id = row?.id ?? null;
    setBusinessId(id);
    setBusinessAddressLine1((row as { address_line1?: string | null } | undefined)?.address_line1 ?? null);
    return id;
  }

  return {
    businessId,
    businessAddressLine1,
    loadBusiness,
    companyBaseCurrency,
    customersFetchState,
    allCustomers,
    userFirstName,
    invoiceHubReturnTo,
  };
}
