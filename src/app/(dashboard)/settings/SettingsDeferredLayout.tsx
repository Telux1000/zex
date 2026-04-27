import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { getCachedEffectiveBusinessRole } from '@/lib/rbac/server';
import { defaultDeniedFlags, permissionFlagsForRole } from '@/lib/rbac/permissions';
import { SETTINGS_BUSINESS_SELECT } from '@/lib/business/settings-business-select';
import { settingsPagePerfLog } from '@/lib/dev/settings-page-perf';
import { resolveSubscriberWorkspaceRole } from '@/lib/roles/workspace-roles';

type Props = {
  businessId: string;
  userId: string;
  ownerId: string;
  suggestedCountryCode: string | null;
  profileCardFullName: string | null;
  profileCardProfileRole: string | null;
  profileCardEmail: string | null;
};

/** Heavier Supabase bundle: full business row, RBAC, financial presence — streams after fast gates. */
export async function SettingsDeferredLayout({
  businessId,
  userId,
  ownerId,
  suggestedCountryCode,
  profileCardFullName,
  profileCardProfileRole,
  profileCardEmail,
}: Props) {
  const t0 = Date.now();
  settingsPagePerfLog('settings: settings_layout_heavy_start');

  const { supabase } = await getServerSupabaseUser();

  const tBundle = Date.now();
  const [bizRes, role, inv, quotes, expenses] = await Promise.all([
    supabase.from('businesses').select(SETTINGS_BUSINESS_SELECT).eq('id', businessId).single(),
    getCachedEffectiveBusinessRole(businessId, userId, ownerId),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
  ]);
  settingsPagePerfLog('settings: business_role_financial_counts_parallel_ms', { ms: Date.now() - tBundle });

  const business = bizRes.data;
  let permissionFlags = defaultDeniedFlags();
  if (role) permissionFlags = permissionFlagsForRole(role);
  const hasFinancialRecords =
    (inv.count ?? 0) > 0 || (quotes.count ?? 0) > 0 || (expenses.count ?? 0) > 0;

  settingsPagePerfLog('settings: settings_layout_heavy_total_ms', { ms: Date.now() - t0 });

  const workspaceRole = resolveSubscriberWorkspaceRole(role, profileCardProfileRole);

  return (
    <SettingsLayout
      business={business}
      permissionFlags={permissionFlags}
      hasFinancialRecords={hasFinancialRecords}
      suggestedCountryCode={suggestedCountryCode}
      profileCardInitial={{
        full_name: profileCardFullName,
        email: profileCardEmail,
        workspace_role: workspaceRole,
      }}
    />
  );
}
