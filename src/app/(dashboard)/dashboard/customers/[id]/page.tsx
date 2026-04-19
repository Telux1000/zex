import { notFound } from 'next/navigation';
import { getServerSupabaseUser } from '@/lib/supabase/server-auth';
import { CustomerDetailClient } from '@/components/customers/CustomerDetailClient';
import {
  enrichAuditLogActorDisplayRows,
  enrichAuditLogsWithTeamMemberDisplayNames,
  type AuditLogRow,
} from '@/lib/audit-log';

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase, user } = await getServerSupabaseUser();
  if (!user) return null;

  const { id } = await params;

  const { data: customer } = await supabase.from('customers').select('*').eq('id', id).single();
  if (!customer) notFound();

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', customer.business_id)
    .eq('owner_id', user.id)
    .single();
  if (!business) notFound();

  const { data: auditRowsRaw } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('business_id', customer.business_id)
    .eq('entity_type', 'customer')
    .eq('entity_id', id)
    .order('created_at', { ascending: false });
  let auditRows = (auditRowsRaw ?? []) as AuditLogRow[];
  auditRows = await enrichAuditLogsWithTeamMemberDisplayNames(supabase, auditRows);
  auditRows = await enrichAuditLogActorDisplayRows(supabase, auditRows);

  return (
    <CustomerDetailClient customer={customer} auditLogs={auditRows} />
  );
}
