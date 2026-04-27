export type LineItemSuggestRow = {
  id: string;
  name: string;
  normalizedName: string;
  description: string | null;
  unitLabel: string;
  unitPrice: number;
  taxPercent: number;
  currency: string;
  source: 'saved' | 'history';
  usageCount: number;
  lastUsedAt: number;
};
