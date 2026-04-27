'use client';

import { Suspense, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AssistantConversationProvider } from '@/components/assistant/assistant-conversation-context';
import { AssistantConversationMenu } from '@/components/assistant/AssistantConversationMenu';
import { InvoiceChatWizard } from '@/components/invoices/InvoiceChatWizard';
import { InvoiceCustomerSetupPanel } from '@/components/onboarding/InvoiceCustomerSetupPanel';
import { getBusinessBaseCurrency } from '@/lib/business/currency-policy';
import { greetingFirstNameFromProfileAndUser } from '@/lib/user/greeting-first-name';
import { useIsLgDown } from '@/hooks/use-is-lg-down';
import { cn } from '@/lib/utils/cn';
import { ZenzexLogoMark } from '@/components/branding/AppLogoInline';
import {
  persistExplicitAssistantSessionPointer,
  resolveAssistantWizardSessionWithServer,
} from '@/lib/assistant/conversation-sync-supabase';
import { parseAssistantLaunchContextParam } from '@/lib/assistant/assistant-launch-context';
import { hasPlanFeature } from '@/lib/billing/plans';
import { useBillingPlan } from '@/hooks/use-billing-plan';
import {
  assistantInvoiceChatTimingEnabled,
  devEnsureAssistantInvoiceChatClickT0,
  devLogAssistantInvoiceChatPhase,
} from '@/lib/dev/assistant-invoice-chat-timing';

type CustomerRow = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  preferred_currency_code: string | null;
};

function AssistantPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isLgDown = useIsLgDown();
  const sessionParam = searchParams.get('session');
  const launchContext = parseAssistantLaunchContextParam(searchParams.get('context'));
  const [resolvedWizardSessionId, setResolvedWizardSessionId] = useState<string | null>(null);

  const supabase = createClient();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [companyBaseCurrency, setCompanyBaseCurrency] = useState<string | null>(null);
  const [allCustomers, setAllCustomers] = useState<CustomerRow[]>([]);
  const [customersFetchState, setCustomersFetchState] = useState<'idle' | 'loading' | 'resolved'>(
    'idle'
  );
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [assistantUserId, setAssistantUserId] = useState<string | null>(null);
  const [assistantAuthReady, setAssistantAuthReady] = useState(false);
  const { plan: billingPlan, loading: planLoading } = useBillingPlan();

  const loadBusiness = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.from('businesses').select('id').limit(1);
    const id = data?.[0]?.id != null ? String((data[0] as { id: string }).id) : null;
    return id;
  }, [supabase]);

  useEffect(() => {
    devEnsureAssistantInvoiceChatClickT0();
    devLogAssistantInvoiceChatPhase('assistant_page_component_mount', {});
  }, []);

  useEffect(() => {
    if (planLoading || !assistantInvoiceChatTimingEnabled()) return;
    devLogAssistantInvoiceChatPhase('billing_plan_fetch_done', {
      hasAiAssistant: hasPlanFeature(billingPlan, 'ai_assistant'),
    });
  }, [planLoading, billingPlan]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      devLogAssistantInvoiceChatPhase('auth_workspace_check_start', {});
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setAssistantUserId(user?.id ?? null);
      setAssistantAuthReady(true);
      if (!user) {
        devLogAssistantInvoiceChatPhase('auth_workspace_check_done', { signedIn: false });
        return;
      }
      const [{ data: prof }, { data: bizRows }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
        supabase.from('businesses').select('id, currency, invoice_settings').limit(1),
      ]);
      if (cancelled) return;
      setUserFirstName(
        greetingFirstNameFromProfileAndUser(
          prof as { full_name?: string | null } | null,
          user
        ) || null
      );
      const row = bizRows?.[0] as
        | {
            id?: string;
            currency?: string | null;
            invoice_settings?: { default_currency?: string | null } | null;
          }
        | undefined;
      const bid = row?.id != null ? String(row.id) : null;
      setBusinessId(bid);
      if (row) {
        setCompanyBaseCurrency(getBusinessBaseCurrency(row));
      } else {
        setCompanyBaseCurrency(null);
      }
      devLogAssistantInvoiceChatPhase('auth_workspace_check_done', { signedIn: true });
      devLogAssistantInvoiceChatPhase('business_settings_fetch_done', { hasBusinessId: Boolean(bid) });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useLayoutEffect(() => {
    if (!businessId || !assistantUserId) {
      setResolvedWizardSessionId(null);
      return;
    }
    const ex = sessionParam?.trim() ?? '';
    if (ex.length >= 8) {
      const id = persistExplicitAssistantSessionPointer(businessId, assistantUserId, sessionParam);
      setResolvedWizardSessionId(id);
      devLogAssistantInvoiceChatPhase('wizard_session_resolved_explicit', {});
    }
  }, [businessId, assistantUserId, sessionParam]);

  useEffect(() => {
    if (!businessId || !assistantUserId) return;
    const ex = sessionParam?.trim() ?? '';
    if (ex.length >= 8) return;
    let cancelled = false;
    devLogAssistantInvoiceChatPhase('wizard_session_resolve_implicit_start', {});
    void (async () => {
      const id = await resolveAssistantWizardSessionWithServer(
        supabase,
        businessId,
        assistantUserId,
        null
      );
      if (!cancelled) {
        setResolvedWizardSessionId(id);
        devLogAssistantInvoiceChatPhase('wizard_session_resolve_implicit_done', {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, assistantUserId, sessionParam, supabase]);

  useEffect(() => {
    if (!businessId) {
      setCustomersFetchState('idle');
      return;
    }
    setCustomersFetchState('loading');
    devLogAssistantInvoiceChatPhase('customers_fetch_start', {});
    void supabase
      .from('customers')
      .select('id, name, company, email, preferred_currency_code')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(80)
      .then(({ data }) => {
        const rows = (data ?? []) as CustomerRow[];
        setAllCustomers(rows);
        setCustomersFetchState('resolved');
        devLogAssistantInvoiceChatPhase('customers_fetch_done', { count: rows.length });
      });
  }, [businessId, supabase]);

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    const rt = searchParams.get('returnTo');
    if (rt && rt.startsWith('/') && !rt.startsWith('//')) {
      router.push(rt);
      return;
    }
    router.push('/dashboard');
  }

  if (!assistantAuthReady) {
    return <AssistantFallback />;
  }
  if (!assistantUserId) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--muted)]">
        Sign in to use the assistant.
      </div>
    );
  }
  const assistantReturnTo =
    pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');

  const createInvoiceNeedsCustomer =
    launchContext === 'create_invoice' &&
    customersFetchState === 'resolved' &&
    allCustomers.length === 0;

  const createInvoiceSubtitle = createInvoiceNeedsCustomer
    ? 'Add a customer first, then you can create invoices here.'
    : 'Create an invoice — share customer, line items, rates, and due date.';

  if (!planLoading && !hasPlanFeature(billingPlan, 'ai_assistant')) {
    return (
      <div className="mx-auto flex w-full max-w-2xl">
        <div className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-sm dark:shadow-none sm:p-8">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
            <Lock className="h-5 w-5" aria-hidden />
          </div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            AI Assistant is available on Professional plan
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Upgrade to unlock chat-to-invoice, faster drafting, and AI-guided workflows.
          </p>
          <div className="mt-5">
            <Link href="/settings" className="app-btn-primary inline-flex items-center justify-center">
              Upgrade
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const showCustomerListBanner =
    launchContext === 'create_invoice' &&
    customersFetchState === 'loading' &&
    Boolean(businessId && resolvedWizardSessionId);

  return (
    <AssistantConversationProvider>
      <div
        className={cn(
          'flex w-full flex-col',
          isLgDown ? 'min-h-0 flex-1 overflow-hidden' : 'mx-auto min-h-0 max-w-2xl gap-4'
        )}
      >
        {isLgDown ? (
          <header className="grid shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1 border-b border-[var(--card-border)] bg-[var(--background)] pb-3 pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--foreground)] transition-colors hover:bg-[var(--card)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              aria-label="Back"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
            </button>
            <div className="flex min-w-0 items-center justify-center gap-2">
              <ZenzexLogoMark className="h-6 w-6" />
              <h1 className="truncate text-base font-semibold leading-snug tracking-tight text-[var(--foreground)]">
                Zenzex Assistant
              </h1>
            </div>
            <div className="flex justify-end">
              <AssistantConversationMenu compact />
            </div>
          </header>
        ) : (
          <header className="space-y-1">
            <div className="flex items-start gap-3">
              <ZenzexLogoMark className="mt-0.5 h-7 w-7 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-xl font-semibold leading-tight tracking-tight text-[var(--foreground)] sm:text-2xl">
                    Assistant
                  </h1>
                  <AssistantConversationMenu className="shrink-0" />
                </div>
                <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                  {launchContext === 'create_invoice'
                    ? createInvoiceSubtitle
                    : launchContext === 'create_customer'
                      ? 'Add a customer with the details you have.'
                      : 'Invoices, customers, and quick business answers—right in chat.'}
                </p>
              </div>
            </div>
          </header>
        )}

        {showCustomerListBanner ? (
          <p className="text-center text-[11px] text-[var(--muted)] sm:text-xs">Loading customer list…</p>
        ) : null}

        {createInvoiceNeedsCustomer ? (
          <div
            className={cn(
              isLgDown ? 'min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2' : 'px-0'
            )}
          >
            <InvoiceCustomerSetupPanel returnTo={assistantReturnTo} />
          </div>
        ) : businessId && resolvedWizardSessionId ? (
          <InvoiceChatWizard
            key={resolvedWizardSessionId}
            businessId={businessId}
            loadBusiness={loadBusiness}
            wizardSessionId={resolvedWizardSessionId}
            companyBaseCurrency={companyBaseCurrency}
            allCustomers={allCustomers}
            userFirstName={userFirstName}
            variant="page"
            fullBleedChat={isLgDown}
            persistenceUserId={assistantUserId}
            conversationPersistence
            useClaudeAssistant
            launchContext={launchContext}
            rootClassName={
              isLgDown
                ? undefined
                : 'flex h-[min(680px,calc(100dvh-11rem))] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm dark:shadow-none sm:rounded-3xl'
            }
          />
        ) : (
          <div className="flex min-h-[420px] flex-1 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-4 text-center text-sm text-[var(--muted)] sm:min-h-[min(680px,calc(100dvh-11rem))] sm:rounded-3xl">
            Loading assistant…
          </div>
        )}
      </div>
    </AssistantConversationProvider>
  );
}

function AssistantFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--muted)]">
      Loading assistant…
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={<AssistantFallback />}>
      <AssistantPageContent />
    </Suspense>
  );
}
