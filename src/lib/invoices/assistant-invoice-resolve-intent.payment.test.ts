import { describe, it, expect } from 'vitest';
import { resolveInvoiceAssistantIntent } from '@/lib/invoices/assistant-invoice-resolve-intent';

describe('resolveInvoiceAssistantIntent — mark paid / record payment', () => {
  it('resolves mark invoice as paid to mark_paid action', () => {
    expect(resolveInvoiceAssistantIntent('Mark invoice as paid')).toEqual({
      type: 'action',
      action: 'mark_paid',
      ref: null,
    });
  });

  it('resolves add payment without a ref', () => {
    expect(resolveInvoiceAssistantIntent('add payment')).toEqual({
      type: 'action',
      action: 'mark_paid',
      ref: null,
    });
  });

  it('maps payment action synonyms to mark_paid', () => {
    for (const message of [
      'record payment',
      'add payment',
      'log payment',
      'register payment',
      'invoice paid',
    ]) {
      expect(resolveInvoiceAssistantIntent(message)).toEqual({
        type: 'action',
        action: 'mark_paid',
        ref: null,
      });
    }
  });

  it('parses invoice ref when present', () => {
    const r = resolveInvoiceAssistantIntent('mark invoice INV-0042 as paid');
    expect(r?.type).toBe('action');
    if (r?.type === 'action') {
      expect(r.action).toBe('mark_paid');
      expect(r.ref).not.toBeNull();
    }
  });

  it('parses invoice ref for record payment phrasing', () => {
    const r = resolveInvoiceAssistantIntent('Record payment INV-00078');
    expect(r?.type).toBe('action');
    if (r?.type === 'action') {
      expect(r.action).toBe('mark_paid');
      expect(r.ref).not.toBeNull();
    }
  });
});
