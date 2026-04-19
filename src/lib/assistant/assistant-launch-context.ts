/**
 * Entry intent for the shared Assistant (`/dashboard/assistant`).
 * Drives bootstrap copy and chips on the first turn without separate UIs.
 */
export type AssistantLaunchContext = 'general' | 'create_invoice' | 'create_customer';

export function parseAssistantLaunchContextParam(raw: string | null): AssistantLaunchContext {
  if (raw === 'create_invoice') return 'create_invoice';
  if (raw === 'create_customer') return 'create_customer';
  return 'general';
}
