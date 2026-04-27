import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import { getEffectiveBusinessRole } from '@/lib/rbac/server';
import { getPrimaryBusinessForUserFresh } from '@/lib/supabase/server-auth';
import { deliverOnboardingWelcomeEmail } from '@/lib/onboarding/deliver-onboarding-welcome-postmark';
import { getOnboardingCompletionBlockerFromSnapshot } from '@/lib/onboarding/completion-blocker';
import { isThemeMode } from '@/lib/theme/constants';
import { resolveSubscriberWorkspaceRole } from '@/lib/roles/workspace-roles';
import { profileBillingBeforePlanSelection } from '@/lib/billing/subscription-access';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { fetchAdminPlatformSettings } from '@/lib/admin/admin-platform-settings';
import type { BillingPlan } from '@/lib/billing/plans';

async function newSubscriberProfileDefaults(): Promise<{
  trial: ReturnType<typeof profileBillingBeforePlanSelection>;
  billing_plan: BillingPlan;
}> {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return { trial: profileBillingBeforePlanSelection(), billing_plan: 'starter' };
  }
  const platform = await fetchAdminPlatformSettings(admin);
  return {
    trial: profileBillingBeforePlanSelection(),
    billing_plan: platform.default_new_account_plan,
  };
}

/** Fields returned by GET (avoid `select('*')`); keep in sync with `serializeProfileRow` consumers. */
const PROFILE_GET_COLUMNS = 'id, full_name, email, role, account_number, theme';

function serializeProfileRow(p: Record<string, unknown> | null | undefined) {
  if (!p) return p;
  const acct = p.account_number != null ? String(p.account_number).trim() : '';
  const rest = { ...p };
  delete rest.internal_admin_role;
  return {
    ...rest,
    accountNumber: acct,
    fullName: p.full_name != null ? String(p.full_name) : null,
  };
}

function sendOnboardingWelcomeEmailBestEffort(
  userEmail: string,
  ctx: { recipientFirstName: string; businessName: string }
) {
  const base = String(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) {
    console.warn('[profile] skip welcome email: NEXT_PUBLIC_APP_URL unset');
    return;
  }
  const supportEmail =
    String(process.env.SUPPORT_EMAIL ?? process.env.POSTMARK_REPLY_TO ?? process.env.POSTMARK_FROM_EMAIL ?? '')
      .trim() || 'support@example.com';
  const appName = String(process.env.NEXT_PUBLIC_APP_NAME ?? '').trim() || 'Zenzex';
  const year = String(new Date().getFullYear());
  void deliverOnboardingWelcomeEmail({
    to: userEmail,
    firstName: ctx.recipientFirstName,
    businessName: ctx.businessName,
    dashboardUrl: `${base}/dashboard`,
    createInvoiceUrl: `${base}/dashboard/invoices/new`,
    addCustomerUrl: `${base}/dashboard/customers`,
    supportEmail,
    appName,
    year,
  }).then((r) => {
    if (!r.ok) console.error('[profile] onboarding welcome email:', r.error);
  });
}

function initialFullNameFromUser(user: User): string | null {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  const full = m?.full_name;
  const name = m?.name;
  if (typeof full === 'string' && full.trim()) return full.trim();
  if (typeof name === 'string' && name.trim()) return name.trim();
  return null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: ownedBusiness }, { data: membership }] = await Promise.all([
    supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('business_members')
      .select('business_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const activeBusinessId = ownedBusiness?.id
    ? String(ownedBusiness.id)
    : membership?.business_id
      ? String(membership.business_id)
      : null;

  const [businessRole, existingResult] = await Promise.all([
    activeBusinessId
      ? getEffectiveBusinessRole(supabase, activeBusinessId, user.id)
      : Promise.resolve(null),
    supabase.from('profiles').select(PROFILE_GET_COLUMNS).eq('id', user.id).maybeSingle(),
  ]);

  const { data: existing, error: selectError } = existingResult;

  if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 });

  const profileRole = (existing as { role?: string | null } | null)?.role ?? null;
  const workspaceRole = resolveSubscriberWorkspaceRole(businessRole, profileRole);

  if (existing) {
    return NextResponse.json({
      user: { id: user.id, email: user.email ?? null },
      profile: serializeProfileRow(existing as Record<string, unknown>),
      business_role: businessRole,
      workspace_role: workspaceRole,
    });
  }

  const { trial, billing_plan } = await newSubscriberProfileDefaults();
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email ?? null,
      full_name: initialFullNameFromUser(user),
      billing_plan,
      plan_selection_status: 'NOT_SELECTED',
      ...trial,
    })
    .select('*')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced, error: again } = await supabase
        .from('profiles')
        .select(PROFILE_GET_COLUMNS)
        .eq('id', user.id)
        .maybeSingle();
      if (!again && raced) {
        const racedRole = (raced as { role?: string | null }).role ?? null;
        return NextResponse.json({
          user: { id: user.id, email: user.email ?? null },
          profile: serializeProfileRow(raced as Record<string, unknown>),
          business_role: businessRole,
          workspace_role: resolveSubscriberWorkspaceRole(businessRole, racedRole),
        });
      }
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const createdRole = (created as { role?: string | null }).role ?? null;
  return NextResponse.json({
    user: { id: user.id, email: user.email ?? null },
    profile: serializeProfileRow(created as Record<string, unknown>),
    business_role: businessRole,
    workspace_role: resolveSubscriberWorkspaceRole(businessRole, createdRole),
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(body, 'internal_admin_role') ||
    Object.prototype.hasOwnProperty.call(body, 'internalAdminRole')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  let onboardingJustCompleted = false;
  let welcomeEmailContext: { recipientFirstName: string; businessName: string } | null = null;

  if (body.full_name !== undefined) {
    const trimmedFullName = String(body.full_name ?? '').trim();
    if (!trimmedFullName) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }
    updates.full_name = trimmedFullName;
  }
  if (isThemeMode(body.theme)) {
    updates.theme = body.theme;
  }
  if (body.mark_onboarding_complete === true) {
    const { data: profGate } = await supabase
      .from('profiles')
      .select('full_name, onboarding_completed_at')
      .eq('id', user.id)
      .maybeSingle();
    const alreadyCompleted = Boolean(
      (profGate as { onboarding_completed_at?: string | null } | null)?.onboarding_completed_at
    );
    const effectiveFullName =
      body.full_name !== undefined
        ? String(body.full_name ?? '').trim()
        : String((profGate as { full_name?: string | null } | null)?.full_name ?? '').trim();
    const primaryBiz = await getPrimaryBusinessForUserFresh(user.id);

    if (!alreadyCompleted) {
      const blocker = getOnboardingCompletionBlockerFromSnapshot({
        profileFullName: effectiveFullName || null,
        business: primaryBiz,
      });
      if (blocker) {
        return NextResponse.json(
          {
            error: blocker.message,
            onboarding_blocker: { step: blocker.step, code: blocker.code },
            ...(blocker.business_profile_field_errors
              ? { business_profile_field_errors: blocker.business_profile_field_errors }
              : {}),
          },
          { status: 400 }
        );
      }
      updates.onboarding_completed_at = new Date().toISOString();
      onboardingJustCompleted = true;
      const first = effectiveFullName.trim().split(/\s+/)[0] || 'there';
      welcomeEmailContext = {
        recipientFirstName: first,
        businessName: String(primaryBiz?.name ?? '').trim() || 'Your business',
      };
    }
  }

  if (Object.keys(updates).length === 0) {
    if (body.mark_onboarding_complete === true) {
      const { data: full } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (full) {
        return NextResponse.json({
          user: { id: user.id, email: user.email ?? null },
          profile: serializeProfileRow(full as Record<string, unknown>),
          onboarding_just_completed: false,
        });
      }
    }
    return NextResponse.json({ error: 'No updates' }, { status: 400 });
  }

  const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (onboardingJustCompleted && user.email && welcomeEmailContext) {
      sendOnboardingWelcomeEmailBestEffort(user.email, welcomeEmailContext);
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email ?? null },
      profile: serializeProfileRow(data as Record<string, unknown>),
      onboarding_just_completed: onboardingJustCompleted,
    });
  }

  const { trial, billing_plan } = await newSubscriberProfileDefaults();
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email ?? null,
      full_name:
        updates.full_name !== undefined
          ? String(updates.full_name)
          : initialFullNameFromUser(user) ?? '',
      billing_plan,
      plan_selection_status: 'NOT_SELECTED',
      ...(isThemeMode(updates.theme) ? { theme: updates.theme } : {}),
      ...(updates.onboarding_completed_at
        ? { onboarding_completed_at: updates.onboarding_completed_at }
        : {}),
      ...trial,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (onboardingJustCompleted && user.email && welcomeEmailContext) {
    sendOnboardingWelcomeEmailBestEffort(user.email, welcomeEmailContext);
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email ?? null },
    profile: serializeProfileRow(data as Record<string, unknown>),
    onboarding_just_completed: onboardingJustCompleted,
  });
}
