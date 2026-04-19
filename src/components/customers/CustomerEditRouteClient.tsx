'use client';

import { useRouter } from 'next/navigation';
import type { Customer } from '@/lib/database.types';
import CustomerFormModal from '@/components/customers/CustomerFormModal';

type Props = {
  customer: Customer;
  businessId: string;
  companyBaseCurrency: string | null;
};

export function CustomerEditRouteClient({ customer, businessId, companyBaseCurrency }: Props) {
  const router = useRouter();

  return (
    <CustomerFormModal
      open
      onClose={() => router.push(`/dashboard/customers/${customer.id}`)}
      onSaved={() => router.push(`/dashboard/customers/${customer.id}`)}
      businessId={businessId}
      companyBaseCurrency={companyBaseCurrency ?? undefined}
      customer={customer}
    />
  );
}
