import type { ReactNode } from 'react';

/**
 * Invoice creation stays in-flow: core setup gaps are handled inside Manual Invoice
 * (inline prerequisite + contextual CTAs), not via a server redirect to /onboarding.
 */
export default function NewInvoiceLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
