import { describe, expect, it } from 'vitest';
import { buildInvoiceLookupChatCards } from '@/lib/invoices/assistant-invoice-lookup-card';

describe('buildInvoiceLookupChatCards', () => {
  const row = {
    id: 'inv-1',
    invoice_number: 'INV-00004',
    customer_name: 'Lava LLC',
    total: 685,
    currency: 'USD',
    status: 'draft',
  };

  it('uses Edit as primary for edit intent, draft, and edit permission', () => {
    const [card] = buildInvoiceLookupChatCards([row], 'owner', {
      intentOverride: 'edit_invoice',
    })!;
    expect(card?.card_type).toBe('invoice_single');
    if (card?.card_type !== 'invoice_single') return;
    expect(card.primary_action).toBe('edit_invoice');
    expect(card.headline).toBe('Invoice found');
    expect(card.helper_text).toMatch(/draft/i);
    expect(card.display_edit_secondary).toBe(false);
  });

  it('uses View as primary when invoice is paid', () => {
    const [card] = buildInvoiceLookupChatCards(
      [{ ...row, status: 'paid' }],
      'owner',
      { intentOverride: 'edit_invoice' }
    )!;
    expect(card?.card_type).toBe('invoice_single');
    if (card?.card_type !== 'invoice_single') return;
    expect(card.primary_action).toBe('view_invoice');
    expect(card.display_edit_secondary).toBe(false);
  });

  it('shows Edit as secondary when user asked to view but invoice is editable', () => {
    const [card] = buildInvoiceLookupChatCards([row], 'owner', {
      intentOverride: 'view_invoice',
    })!;
    expect(card?.card_type).toBe('invoice_single');
    if (card?.card_type !== 'invoice_single') return;
    expect(card.primary_action).toBe('view_invoice');
    expect(card.display_edit_secondary).toBe(true);
  });
});
