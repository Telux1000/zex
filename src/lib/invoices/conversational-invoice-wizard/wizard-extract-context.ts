import type { InvoiceWizardDraft } from './types';

/**
 * Slot-style summary of the current invoice draft (for extraction prompts).
 * Mirrors `{ customer, items, due_date }` at a high level.
 */
export function formatDraftSlotsForWizardExtract(d: InvoiceWizardDraft): string {
  const customer = d.customerId
    ? '(linked to existing customer)'
    : d.customerName.trim() || '(not set)';
  const email = d.customerEmail.trim() ? ` · email: ${d.customerEmail.trim()}` : '';
  const lines = d.items.length
    ? d.items
        .map(
          (i) =>
            `${i.name.trim()} × ${i.quantity} @ ${i.unit_price}${i.unit_label && i.unit_label !== 'item' ? ` ${i.unit_label}` : ''}`
        )
        .join('; ')
    : '(none yet)';
  const due = d.dueDate?.trim() ? d.dueDate.trim() : '(not set)';
  return [
    `Customer: ${customer}${email}`,
    `Line items (${d.items.length}): ${lines}`,
    `Due date: ${due}`,
  ].join('\n');
}
