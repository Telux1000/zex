import { NextResponse } from 'next/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { deliverWaitlistConfirmationEmail } from '@/lib/waitlist/deliver-waitlist-confirmation-postmark';
import { generateWaitlistReferralCode } from '@/lib/waitlist/waitlist-referral-code';
import { getWaitlistInviteLinkBaseUrl } from '@/lib/billing/app-base-url';
import { billingLog } from '@/lib/billing/billing-logger';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase();
  if (!t || /[\r\n]/.test(t) || !EMAIL_RE.test(t)) return null;
  return t;
}

function normalizeOptionalString(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function normalizeSource(raw: unknown): string {
  let s = normalizeOptionalString(raw, 64);
  if (!s) return 'landing';
  if (s === 'payment_failure') s = 'payment_error';
  if (s === 'feature_gate' || s === 'modal') s = 'feature_locked';
  const cleaned = s.replace(/[^a-z0-9_-]/gi, '_').slice(0, 64) || 'landing';
  return cleaned;
}

function normalizeTriggerReason(raw: unknown): string {
  const t = normalizeOptionalString(raw, 96);
  if (!t) return 'general';
  return t.replace(/[^a-z0-9_-]/gi, '_').slice(0, 96) || 'general';
}

function normalizeReferralCode(raw: unknown): string | null {
  const s = normalizeOptionalString(raw, 32);
  if (!s) return null;
  const up = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return up.length >= 4 ? up : null;
}

export async function POST(req: Request) {
  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const source = normalizeSource(body.source);
  const triggerReason = normalizeTriggerReason(body.trigger_reason);
  const country = normalizeOptionalString(body.country, 120);
  const businessType = normalizeOptionalString(body.business_type, 120);
  const referredByCode = normalizeReferralCode(body.referred_by);

  const { data: existing, error: existingErr } = await admin
    .from('waitlist')
    .select('id, referral_code')
    .eq('email', email)
    .maybeSingle();

  if (existingErr) {
    console.error('[waitlist]', existingErr);
    return NextResponse.json({ ok: false, error: 'Something went wrong. Try again.' }, { status: 500 });
  }

  const base = getWaitlistInviteLinkBaseUrl();
  if (existing) {
    const code = existing.referral_code as string;
    const emailDomain = email.includes('@') ? email.split('@')[1]! : null;
    billingLog.info('waitlist_duplicate_attempt', {
      source,
      trigger_reason: triggerReason,
      country: country ?? null,
      email_domain: emailDomain,
    });
    return NextResponse.json({
      ok: true,
      already_on_list: true,
      referral_code: code,
      share_url: `${base}/?ref=${encodeURIComponent(code)}`,
    });
  }

  let referrerId: string | null = null;
  if (referredByCode) {
    const { data: refRow, error: refErr } = await admin
      .from('waitlist')
      .select('id, email')
      .eq('referral_code', referredByCode)
      .maybeSingle();
    if (!refErr && refRow && String(refRow.email).toLowerCase() !== email) {
      referrerId = refRow.id as string;
    }
  }

  const rowBase = {
    email,
    source,
    trigger_reason: triggerReason,
    country,
    business_type: businessType,
    referred_by: referrerId,
    status: 'pending' as const,
  };

  let referralCode: string | null = null;
  let insertId: string | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateWaitlistReferralCode();
    const { data: inserted, error: insErr } = await admin
      .from('waitlist')
      .insert({ ...rowBase, referral_code: code })
      .select('id, referral_code')
      .single();

    if (!insErr && inserted) {
      referralCode = inserted.referral_code as string;
      insertId = inserted.id as string;
      break;
    }
    const msg = insErr?.message ?? '';
    if (msg.includes('duplicate') || msg.includes('unique') || insErr?.code === '23505') {
      const { data: raced } = await admin.from('waitlist').select('id, referral_code').eq('email', email).maybeSingle();
      if (raced) {
        const c = raced.referral_code as string;
        return NextResponse.json({
          ok: true,
          already_on_list: true,
          referral_code: c,
          share_url: `${base}/?ref=${encodeURIComponent(c)}`,
        });
      }
      continue;
    }
    console.error('[waitlist] insert', insErr);
    return NextResponse.json({ ok: false, error: 'Something went wrong. Try again.' }, { status: 500 });
  }

  if (!referralCode || !insertId) {
    return NextResponse.json({ ok: false, error: 'Something went wrong. Try again.' }, { status: 500 });
  }

  if (referrerId) {
    const { error: rpcErr } = await admin.rpc('waitlist_increment_referral_count', {
      p_referrer_id: referrerId,
    });
    if (rpcErr) {
      console.warn('[waitlist] referral increment', rpcErr);
    }
  }

  const emailDomain = email.includes('@') ? email.split('@')[1]! : null;
  billingLog.info('waitlist_signup', {
    source,
    trigger_reason: triggerReason,
    country: country ?? null,
    email_domain: emailDomain,
  });

  void deliverWaitlistConfirmationEmail({ to: email }).then((r) => {
    if (!r.ok) console.error('[waitlist] confirmation email not sent', r.error);
  });

  return NextResponse.json({
    ok: true,
    referral_code: referralCode,
    share_url: `${base}/?ref=${encodeURIComponent(referralCode)}`,
  });
}
