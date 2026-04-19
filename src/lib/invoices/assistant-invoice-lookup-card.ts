import type { InvoiceAssistantChatCard } from '@/lib/invoices/conversational-invoice-wizard/types';
import { canEdit as invoiceStatusAllowsEdit } from '@/lib/invoices/edit-rules';
import { detectInvoiceLookupIntent } from '@/lib/invoices/invoice-chat-intent';
import type { InvoiceLookupRow } from '@/lib/invoices/resolve-invoices-by-reference';
import { hasPermission } from '@/lib/rbac/permissions';
import type { BusinessRole } from '@/lib/rbac/types';

export type BuildInvoiceLookupCardOptions = {
  /** Original user message (Claude path) */
  userText?: string;
  /** Deterministic pipeline already knows view vs edit */
  intentOverride?: 'edit_invoice' | 'view_invoice';
};

/**
 * Shared invoice lookup → chat card(s) for the assistant (wizard + Claude tool path).
 */
export function buildInvoiceLookupChatCards(
  matches: InvoiceLookupRow[] | null | undefined,
  role: BusinessRole,
  opts?: BuildInvoiceLookupCardOptions
): InvoiceAssistantChatCard[] | null {
  if (!matches || matches.length === 0) return null;

  const intent =
    opts?.intentOverride ??
    detectInvoiceLookupIntent(String(opts?.userText ?? '').trim()) ??
    'view_invoice';

  const canEditRole = hasPermission(role, 'edit_invoice');

  if (matches.length > 1) {
    return [
      {
        card_type: 'invoice_pick',
        intent,
        can_edit: canEditRole && intent === 'edit_invoice',
        options: matches.map((m) => ({
          invoice_id: m.id,
          invoice_number: m.invoice_number,
          customer_name: m.customer_name,
          total: m.total,
          currency: m.currency,
          status: m.status,
        })),
      },
    ];
  }

  const m = matches[0]!;
  const statusStr = m.status ?? '';
  const invoiceAllowsEditNavigation = invoiceStatusAllowsEdit(statusStr);

  const primary_action =
    intent === 'edit_invoice' && canEditRole && invoiceAllowsEditNavigation
      ? 'edit_invoice'
      : 'view_invoice';

  const display_edit_secondary =
    primary_action === 'view_invoice' && canEditRole && invoiceAllowsEditNavigation;

  const helper_text =
    String(statusStr).toLowerCase() === 'draft'
      ? 'This invoice is still in draft, so you can edit it before sending.'
      : null;

  return [
    {
      card_type: 'invoice_single',
      intent,
      invoice_id: m.id,
      invoice_number: m.invoice_number,
      customer_name: m.customer_name,
      total: m.total,
      currency: m.currency,
      status: m.status,
      primary_action,
      headline: 'Invoice found',
      helper_text,
      display_edit_secondary,
    },
  ];
}
