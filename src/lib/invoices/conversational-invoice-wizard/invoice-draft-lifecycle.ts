import { isEmptyWizardDraft } from '@/lib/invoices/conversational-invoice-wizard/draft';
import {
  isWizardDraftReadyForInvoiceCreate,
} from '@/lib/invoices/conversational-invoice-wizard/state-machine';
import type { InvoiceWizardStep } from '@/lib/invoices/conversational-invoice-wizard/types';
import type { InvoiceWizardDraft } from '@/lib/invoices/conversational-invoice-wizard/types';

/**
 * Bounded workflow phases for Assistant invoice drafting (documentation + UI/testing).
 * - idle — empty draft, no active invoice work
 * - draft_active — collecting customer / lines / due date
 * - draft_ready — linked customer, all required fields, at confirm
 * - draft_created — invoice just created (client may show success; server returns cleared draft)
 * - draft_cleared — explicit reset / empty after success handoff
 */
export type InvoiceDraftLifecyclePhase =
  | 'idle'
  | 'draft_active'
  | 'draft_ready'
  | 'draft_created'
  | 'draft_cleared';

export function deriveInvoiceDraftLifecyclePhase(
  draft: InvoiceWizardDraft,
  opts: {
    wizardStep: InvoiceWizardStep | null;
    /** Client: successInvoice != null */
    hasSuccessInvoiceBanner: boolean;
  }
): InvoiceDraftLifecyclePhase {
  if (opts.hasSuccessInvoiceBanner) return 'draft_created';
  if (isEmptyWizardDraft(draft)) {
    if (opts.wizardStep === 'SUCCESS') return 'draft_cleared';
    return 'idle';
  }
  if (isWizardDraftReadyForInvoiceCreate(draft, false)) return 'draft_ready';
  return 'draft_active';
}
