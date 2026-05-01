import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseServiceAdmin } from '@/lib/supabase/service-admin';
import { fetchAdminPlatformSettings } from '@/lib/admin/admin-platform-settings';
import { hostedSaaSCheckoutProviderOrder, normalizeBillingProviderMode } from '@/lib/billing/saas-billing-config';

export const dynamic = 'force-dynamic';

/**
 * Whether hosted SaaS checkout can start for this user (server-side provider config + platform mode).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ available: true });
  }

  const admin = getSupabaseServiceAdmin();
  if (!admin) {
    return NextResponse.json({ available: false });
  }

  const platform = await fetchAdminPlatformSettings(admin);
  const mode = normalizeBillingProviderMode(platform.billing_provider_mode);
  const order = hostedSaaSCheckoutProviderOrder(mode);
  return NextResponse.json({ available: order.length > 0 });
}
