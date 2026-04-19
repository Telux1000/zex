/**
 * Regex-only line item extraction for the invoice wizard when the model returns no items.
 * Uses global scans for "N … at … price" so lines work inside longer sentences.
 */

export type DeterministicLineItem = {
  name: string;
  quantity: number;
  unit_price: number;
};

function parseMoney(s: string): number | null {
  const n = parseFloat(String(s).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 1e10) return null;
  return n;
}

function parseQty(s: string): number | null {
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0 || n > 1e6) return null;
  return n;
}

/**
 * All "qty … at … price" occurrences in the message (e.g. "for 5 Cars at 800", "4 Chairs at 400").
 */
function findAllQtyNameAtPrice(text: string): DeterministicLineItem[] {
  const re = /\b(\d+(?:\.\d+)?)\s+(.+?)\s+at\s+\$?([\d,]+(?:\.\d+)?)\b/gi;
  const out: DeterministicLineItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const qty = parseQty(m[1]!);
    let name = m[2]!.trim().replace(/\s+/g, ' ');
    const price = parseMoney(m[3]!);
    if (qty == null || price == null) continue;
    name = name.replace(/\s+(each|ea|per\s+unit|\/\s*unit|total|only)$/i, '').trim();
    if (name.length < 1 || name.length > 500) continue;
    if (/^(for|to|and|or|the|a|an|of|on)\s*$/i.test(name)) continue;
    const key = `${name.toLowerCase()}|${qty}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, quantity: qty, unit_price: price });
  }
  return out;
}

/** Segment must be standalone: "10 widgets @ 12.50" */
function parseQtyNameAtPriceCompact(segment: string): DeterministicLineItem | null {
  const t = segment.trim();
  const m = t.match(
    /^(\d+(?:\.\d+)?)\s+([^@]+?)\s*@\s*\$?([\d,]+(?:\.\d+)?)\s*\.?$/i
  );
  if (!m) return null;
  const qty = parseQty(m[1]!);
  const name = m[2]!.trim().replace(/\s+/g, ' ');
  const price = parseMoney(m[3]!);
  if (qty == null || price == null) return null;
  if (name.length < 1 || name.length > 500) return null;
  return { name, quantity: qty, unit_price: price };
}

/** "Logo design $500" → qty 1 (requires $). */
function parseNameDollarPrice(segment: string): DeterministicLineItem | null {
  const t = segment.trim();
  const m = t.match(/^(.+?)\s+\$([\d,]+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const name = m[1]!.trim().replace(/\s+/g, ' ');
  const price = parseMoney(m[2]!);
  if (price == null || name.length < 2 || name.length > 500) return null;
  if (/^(invoice|bill|quote|for|the|a|an)\s*$/i.test(name)) return null;
  return { name, quantity: 1, unit_price: price };
}

function shouldSkipMessage(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return true;
  if (/^(clear|skip|no thanks|no\.|yes|ok|thanks)\b/i.test(t)) return true;
  return false;
}

function splitIntoLineSegments(text: string): string[] {
  const t = text.trim();
  const byComma = t.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const piece of byComma) {
    const byAnd = piece.split(/\s+\band\s+(?=\d)/i).map((s) => s.trim()).filter(Boolean);
    out.push(...byAnd);
  }
  return out.length ? out : [t];
}

/**
 * Returns line items only when the message contains explicit qty + unit price patterns.
 */
export function tryParseDeterministicWizardLineItems(text: string): DeterministicLineItem[] | null {
  if (shouldSkipMessage(text)) return null;

  const raw = text.trim();

  const primary = findAllQtyNameAtPrice(raw);
  if (primary.length > 0) return primary;

  const segments = splitIntoLineSegments(raw);
  const fromSegments: DeterministicLineItem[] = [];
  for (const seg of segments) {
    const row = parseQtyNameAtPriceCompact(seg) || parseNameDollarPrice(seg);
    if (row) fromSegments.push(row);
  }
  if (fromSegments.length > 0) return fromSegments;

  const single = parseNameDollarPrice(raw);
  return single ? [single] : null;
}
