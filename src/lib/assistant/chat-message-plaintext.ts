import type { AssistantStructuredBody } from '@/lib/invoices/conversational-invoice-wizard/types';

/** Plain text for clipboard / export (keeps `**` markers as readable emphasis). */
export function structuredBodyPlainText(structured: AssistantStructuredBody | undefined | null): string {
  if (!structured) return '';
  const parts = [structured.title, ...(structured.lines ?? [])].map((x) => String(x ?? '').trim()).filter(Boolean);
  return parts.join('\n');
}

export function getChatMessagePlainText(msg: {
  content: string;
  structured?: AssistantStructuredBody | null;
  imageUrl?: string;
}): string {
  const fromStructured = structuredBodyPlainText(msg.structured ?? undefined);
  if (fromStructured) return fromStructured;
  const text = String(msg.content ?? '')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (msg.imageUrl) {
    const parts = [text, '[Image attachment]'].filter((p) => p.length > 0);
    return parts.join('\n');
  }
  return text;
}
