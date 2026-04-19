import OpenAI from 'openai';
import { parsedInvoiceSchema, type ParsedInvoice } from '@/lib/validations/invoice';
import {
  INVOICE_PARSER_SYSTEM,
  INVOICE_PARSER_USER,
  INVOICE_WIZARD_EXTRACT_USER,
} from '@/lib/ai/prompts/invoice-parser';
import { detectCurrencyFromText } from '@/lib/currency/detect-from-text';
import { isSupportedCurrency } from '@/lib/currency/supported';
import { isEmptyWizardDraft } from '@/lib/invoices/conversational-invoice-wizard/draft';
import type { InvoiceWizardDraft } from '@/lib/invoices/conversational-invoice-wizard/types';
import { formatDraftSlotsForWizardExtract } from '@/lib/invoices/conversational-invoice-wizard/wizard-extract-context';
import {
  wizardAiExtractSchema,
  type WizardAiExtract,
} from '@/lib/invoices/conversational-invoice-wizard/wizard-ai-extract';
import { normalizeAiInvoiceItemsArray } from '@/lib/invoices/invoice-line-units';
import { extractDueDateIsoFromInvoiceUserMessage } from '@/lib/invoices/extract-due-date-from-message';
import { filterWizardExtractAgainstUserText } from '@/lib/invoices/conversational-invoice-wizard/wizard-extract-guardrails';
import { tryParseDeterministicWizardLineItems } from '@/lib/invoices/conversational-invoice-wizard/wizard-line-items-deterministic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Fetches and normalizes invoice-shaped JSON from the model (shared by strict parse and wizard extract).
 * @param currencyDetectionSource optional text for currency hints (e.g. raw user message when `userContent` includes draft context).
 */
export async function fetchInvoiceAiNormalizedJson(
  userContent: string,
  opts?: { currencyDetectionSource?: string }
): Promise<Record<string, unknown>> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: INVOICE_PARSER_SYSTEM },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty AI response');

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON from AI');
  }

  const obj = json as Record<string, unknown>;
  if (obj && typeof obj === 'object') {
    let arr = obj.items ?? obj.line_items;
    if (!Array.isArray(arr)) {
      arr = arr && typeof arr === 'object' && !Array.isArray(arr) ? [arr] : [];
    }
    obj.items = normalizeAiInvoiceItemsArray(arr);
    const emailValue = obj.email ?? obj.customer_email;
    if (emailValue !== undefined) obj.customer_email = emailValue;
    delete obj.email;

    const rawCurrency =
      (obj.currency as string | undefined) ??
      (obj.currency_code as string | undefined) ??
      (obj.currencyCode as string | undefined);
    const normalizedRawCurrency = String(rawCurrency ?? '').trim().toUpperCase();
    const textCurrency = detectCurrencyFromText(opts?.currencyDetectionSource ?? userContent);
    if (textCurrency) {
      obj.currency = textCurrency;
    } else if (normalizedRawCurrency && isSupportedCurrency(normalizedRawCurrency)) {
      obj.currency = normalizedRawCurrency;
    }
    delete obj.currency_code;
    delete obj.currencyCode;
    const cur = String(obj.currency ?? '').trim().toUpperCase();
    if (!cur || cur.length !== 3 || !isSupportedCurrency(cur)) {
      delete obj.currency;
    }
  }

  return obj;
}

/**
 * Converts natural language or extracted text into structured invoice JSON.
 * Returns validated ParsedInvoice or throws.
 */
export async function parseInvoiceFromText(input: string): Promise<ParsedInvoice> {
  const trimmed = input.trim();
  const obj = await fetchInvoiceAiNormalizedJson(INVOICE_PARSER_USER(trimmed));
  if (!String((obj as { due_date?: unknown }).due_date ?? '').trim()) {
    const iso = extractDueDateIsoFromInvoiceUserMessage(trimmed);
    if (iso) (obj as Record<string, unknown>).due_date = iso;
  }
  return parsedInvoiceSchema.parse(obj);
}

export type WizardUserTextExtractResult =
  | { ok: true; extract: WizardAiExtract }
  | { ok: false; issues: import('zod').ZodIssue[] };

/**
 * Lenient extraction for the conversational invoice wizard (chat path only).
 * Does not require line items; use `parseInvoiceFromText` for final strict payloads elsewhere.
 */
export async function extractInvoiceWizardUserText(
  input: string,
  opts?: { draft?: InvoiceWizardDraft }
): Promise<WizardUserTextExtractResult> {
  const trimmed = input.trim();
  const userContent =
    opts?.draft && !isEmptyWizardDraft(opts.draft)
      ? INVOICE_WIZARD_EXTRACT_USER(formatDraftSlotsForWizardExtract(opts.draft), trimmed)
      : INVOICE_PARSER_USER(trimmed);
  const obj = await fetchInvoiceAiNormalizedJson(userContent, {
    currencyDetectionSource: trimmed,
  });
  const r = wizardAiExtractSchema.safeParse(obj);
  if (!r.success) {
    console.error('[invoice-wizard] wizardAiExtractSchema failed', r.error.issues);
    return { ok: false, issues: r.error.issues };
  }
  let extract = filterWizardExtractAgainstUserText(r.data, trimmed);
  if (!String(extract.due_date ?? '').trim()) {
    const fromMsg = extractDueDateIsoFromInvoiceUserMessage(trimmed);
    if (fromMsg) {
      extract = { ...extract, due_date: fromMsg };
    }
  }

  const noItems = !extract.items || extract.items.length === 0;
  if (noItems) {
    const det = tryParseDeterministicWizardLineItems(trimmed);
    if (det?.length) {
      extract = filterWizardExtractAgainstUserText(
        {
          ...extract,
          items: det.map((d) => ({
            name: d.name,
            quantity: d.quantity,
            unit_price: d.unit_price,
          })),
        },
        trimmed
      );
    }
  }

  return { ok: true, extract };
}
