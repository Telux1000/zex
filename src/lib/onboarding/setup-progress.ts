import { isBusinessProfileComplete } from '@/lib/business/profile';
import { isSupportedCurrency } from '@/lib/currency/supported';
import type { PrimaryBusinessRow } from '@/lib/supabase/server-auth';

export type SetupProgress = {
  profileComplete: boolean;
  businessProfileComplete: boolean;
  /** Supported base currency on the workspace (from business row). */
  currencyComplete: boolean;
  hasFirstCustomer: boolean;
};

export function computeSetupProgress(input: {
  profileFullName: string | null | undefined;
  business: PrimaryBusinessRow | null;
  customerCount: number;
}): SetupProgress {
  const profileComplete = Boolean(String(input.profileFullName ?? '').trim());
  const businessProfileComplete = input.business ? isBusinessProfileComplete(input.business) : false;
  const currencyComplete =
    input.business != null && isSupportedCurrency(String(input.business.currency ?? '').trim());
  const hasFirstCustomer = input.customerCount >= 1;
  return { profileComplete, businessProfileComplete, currencyComplete, hasFirstCustomer };
}

/** True until guided onboarding (profile, business, currency) is done — not customer. */
export function setupNeedsAttention(p: SetupProgress): boolean {
  return !isSetupProgressFullySatisfied(p);
}

/** Guided onboarding complete: profile + business profile + base currency only. */
export function isSetupProgressFullySatisfied(p: SetupProgress): boolean {
  return p.profileComplete && p.businessProfileComplete && p.currencyComplete;
}

/** Alias: core setup (profile + business + currency) — single source of truth with onboarding gating. */
export function coreSetupComplete(p: SetupProgress): boolean {
  return isSetupProgressFullySatisfied(p);
}

/** At least one customer in the workspace (invoice/quote finalize only). */
export function hasCustomer(p: SetupProgress): boolean {
  return p.hasFirstCustomer;
}

/** Workspace ready for invoice/quote UI (no customer required to open flows). */
export function isWorkspaceReadyForInvoicing(p: SetupProgress): boolean {
  return p.businessProfileComplete && p.currencyComplete;
}

/** API / persistence: business, currency, and at least one customer. */
export function isInvoiceCreationReady(p: SetupProgress): boolean {
  return isWorkspaceReadyForInvoicing(p) && p.hasFirstCustomer;
}
