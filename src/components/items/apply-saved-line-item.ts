import type { ItemSuggestionPick } from './ItemNameInput';

type QuoteLikeLineItem = {
  name: string;
  description: string;
  unit_price: string;
  tax_percent: string;
};

type InvoiceLikeLineItem = {
  name: string;
  description: string;
  unit_label: string;
  unit_price: number;
  tax_percent: number;
};

function formatNumberForInput(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

export function applySavedLineItemToQuoteRow(
  suggestion: ItemSuggestionPick
): Partial<QuoteLikeLineItem> {
  return {
    name: suggestion.name,
    description: suggestion.description ?? '',
    unit_price: formatNumberForInput(suggestion.unitPrice),
    tax_percent: formatNumberForInput(suggestion.taxPercent ?? 0),
  };
}

export function applySavedLineItemToInvoiceRow(
  suggestion: ItemSuggestionPick
): Partial<InvoiceLikeLineItem> {
  return {
    name: suggestion.name,
    description: suggestion.description ?? '',
    unit_label: suggestion.unitLabel,
    unit_price: suggestion.unitPrice,
    tax_percent: suggestion.taxPercent ?? 0,
  };
}
