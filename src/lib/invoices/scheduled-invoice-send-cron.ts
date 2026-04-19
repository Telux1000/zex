import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAdminPlatformSettings } from '@/lib/admin/admin-platform-settings';
import { deliverInvoiceSendEmail } from '@/lib/invoices/send-invoice-delivery';

const BATCH = 25;
/** Max batches per cron run so a large backlog drains without timing out. */
const MAX_BATCHES = 20;

export type ProcessScheduledInvoiceSendsOpts = {
  /** When set, only drafts for this business are considered (for user-driven drains). */
  businessId?: string;
};

/**
 * Sends draft invoices whose scheduled_send_at is due (UTC `<= now`).
 * Uses `deliverInvoiceSendEmail` — same Postmark path as "Send now" (`POSTMARK_TEMPLATE_INVOICE_SENT`, subject, PDF, etc.).
 */
export async function processScheduledInvoiceSends(
  supabase: SupabaseClient,
  now: Date = new Date(),
  opts?: ProcessScheduledInvoiceSendsOpts
) {
  const platform = await fetchAdminPlatformSettings(supabase);
  if (!platform.feature_scheduled_send_enabled) {
    return { sent: 0, skipped: 0, failed: 0, scanned: 0 };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let scanned = 0;

  for (let b = 0; b < MAX_BATCHES; b++) {
    let q = supabase
      .from('invoices')
      .select(
        'id, business_id, invoice_number, status, stripe_payment_link_id, total, subtotal, tax_amount, currency, customer_id, customer_name, customer_email, issue_date, due_date, amount_paid, balance_due, scheduled_send_at'
      )
      .eq('status', 'draft')
      .not('scheduled_send_at', 'is', null)
      .lte('scheduled_send_at', now.toISOString())
      .order('scheduled_send_at', { ascending: true })
      .limit(BATCH);
    if (opts?.businessId) {
      q = q.eq('business_id', opts.businessId);
    }
    const { data: rows, error } = await q;

    if (error) throw new Error(error.message);
    const batch = rows ?? [];
    if (batch.length === 0) break;
    scanned += batch.length;

    let sentThisBatch = 0;
    for (const raw of batch) {
      const inv = raw as Record<string, unknown>;
      const invoiceId = String(inv.id);
      const businessId = String(inv.business_id);

      const { data: business } = await supabase
        .from('businesses')
        .select('id, name, owner_id, payment_settings')
        .eq('id', businessId)
        .maybeSingle();
      if (!business) {
        failed += 1;
        continue;
      }
      const ownerId = String((business as { owner_id?: string }).owner_id ?? '');
      if (!ownerId) {
        failed += 1;
        continue;
      }

      const hasEmail = Boolean(String((inv as { customer_email?: string | null }).customer_email ?? '').trim());
      const hasCustomer = Boolean(String((inv as { customer_id?: string | null }).customer_id ?? '').trim());
      const hasName = Boolean(String((inv as { customer_name?: string | null }).customer_name ?? '').trim());
      if (!hasEmail || !hasCustomer || !hasName) {
        skipped += 1;
        continue;
      }

      const r = await deliverInvoiceSendEmail(supabase, {
        invoice: inv as never,
        business: business as never,
        invoiceId,
        actorUserId: null,
        actorName: 'System',
        pdfOwnerUserId: ownerId,
        sendSource: 'scheduled_send',
      });

      if (r.ok) {
        sent += 1;
        sentThisBatch += 1;
      } else {
        failed += 1;
        console.error(
          '[scheduled-invoice-send] deliverInvoiceSendEmail failed; invoice left draft for retry',
          { invoiceId, error: r.error }
        );
      }
    }

    if (batch.length < BATCH) break;
    /** Avoid re-querying the same stuck rows (failed/skipped) in one run; next cron tick retries failures. */
    if (sentThisBatch === 0) break;
  }

  return { sent, skipped, failed, scanned };
}
