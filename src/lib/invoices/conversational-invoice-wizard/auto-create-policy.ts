/**
 * Server-only: whether to auto-submit invoice creation from natural-language turns.
 * Must NOT fire when the draft was already complete at the start of the request — that catches
 * stale sessions where the user says “create invoice” to start over (req.5, req.11).
 */
export function shouldAutoCreateInvoiceFromWizardTurn(params: {
  userText: string | null | undefined;
  action: unknown;
  readyAfter: boolean;
  /** Draft was already creatable before this turn’s extract/merge (stale complete draft). */
  readyBefore: boolean;
  extractHadInvoicePayload: boolean;
}): boolean {
  const userText = params.userText?.trim() ?? '';
  if (!userText || params.action != null || !params.readyAfter) return false;
  if (params.readyBefore) return false;
  return params.extractHadInvoicePayload;
}
