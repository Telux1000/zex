import { normalizeCountryCode } from '@/lib/location';
import { dedupeWizardAddressFields, normalizeAddressWhitespace } from './address-dedupe';
import type { InvoiceWizardDraft } from './types';

export type AddressCollectSlot = 'street' | 'city' | 'region' | 'postal';

export type ParsedAddressPieces = {
  line1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
};

/** US ZIP / Canadian postal / UK outward codes (light touch). */
const US_ZIP_RE = /\b(\d{5})(?:-(\d{4}))?\b/;
const CA_POSTAL_RE = /\b([A-Z]\d[A-Z])\s?(\d[A-Z]\d)\b/i;
const UK_POSTAL_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

const US_STATE_ABBREV = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC',
]);

function postalLikelyRequired(country: string): boolean {
  const c = country.toUpperCase();
  return c === 'US' || c === 'CA' || c === 'GB';
}

/**
 * Parse free-text address input into structured fields (best-effort, no external APIs).
 */
export function parseFreeformAddressInput(raw: string): ParsedAddressPieces {
  const t = normalizeAddressWhitespace(String(raw ?? ''));
  if (!t) {
    return { line1: null, city: null, state: null, postalCode: null, countryCode: null };
  }

  let rest = t;
  let countryCode: string | null = null;

  const commaParts = t.split(',').map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    const last = commaParts[commaParts.length - 1]!;
    const maybeCountry = normalizeCountryCode(last);
    if (maybeCountry) {
      countryCode = maybeCountry;
      commaParts.pop();
    }
    if (commaParts.length >= 1) {
      const maybeZipLine = commaParts[commaParts.length - 1]!;
      const usZip = maybeZipLine.match(US_ZIP_RE);
      const ca = maybeZipLine.match(CA_POSTAL_RE);
      const uk = maybeZipLine.match(UK_POSTAL_RE);
      let postalCode: string | null = null;
      if (usZip) {
        postalCode = usZip[1]! + (usZip[2] ? `-${usZip[2]}` : '');
        commaParts.pop();
      } else if (ca) {
        postalCode = `${ca[1]}-${ca[2]}`.toUpperCase();
        commaParts.pop();
      } else if (uk) {
        postalCode = uk[1]!.toUpperCase();
        commaParts.pop();
      }

      if (commaParts.length >= 2) {
        const maybeState = commaParts[commaParts.length - 1]!;
        const stUpper = maybeState.toUpperCase();
        if (US_STATE_ABBREV.has(stUpper) && maybeState.length <= 3) {
          const cityPart = commaParts[commaParts.length - 2]!;
          const lineParts = commaParts.slice(0, -2);
          return {
            line1: lineParts.join(', ') || null,
            city: cityPart || null,
            state: stUpper,
            postalCode,
            countryCode: countryCode ?? null,
          };
        }
        const lastPart = commaParts[commaParts.length - 1]!;
        const prev = commaParts[commaParts.length - 2]!;
        const lineParts = commaParts.slice(0, -2);
        return {
          line1: lineParts.length ? lineParts.join(', ') : prev || null,
          city: prev && lineParts.length ? prev : lastPart || null,
          state: lineParts.length ? lastPart : null,
          postalCode,
          countryCode,
        };
      }
      if (commaParts.length === 1) {
        return {
          line1: commaParts[0]!,
          city: null,
          state: null,
          postalCode,
          countryCode,
        };
      }
    }
  }

  const usZipInline = rest.match(US_ZIP_RE);
  const caInline = rest.match(CA_POSTAL_RE);
  let postalCode: string | null = null;
  if (usZipInline) {
    postalCode = usZipInline[1]! + (usZipInline[2] ? `-${usZipInline[2]}` : '');
    rest = rest.replace(usZipInline[0], ' ').trim();
  } else if (caInline) {
    postalCode = `${caInline[1]}-${caInline[2]}`.toUpperCase();
    rest = rest.replace(caInline[0], ' ').trim();
  }

  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const lastTok = tokens[tokens.length - 1]!.toUpperCase();
    if (US_STATE_ABBREV.has(lastTok) && lastTok.length === 2) {
      const state = lastTok;
      tokens.pop();
      return {
        line1: tokens.join(' ') || null,
        city: null,
        state,
        postalCode,
        countryCode: countryCode ?? 'US',
      };
    }
  }

  return {
    line1: rest || null,
    city: null,
    state: null,
    postalCode,
    countryCode,
  };
}

function mergeParsedIntoDraft(d: InvoiceWizardDraft, p: ParsedAddressPieces): InvoiceWizardDraft {
  let out: InvoiceWizardDraft = { ...d };
  if (p.line1) out = { ...out, customerAddressLine1: p.line1, customerAddress: null };
  if (p.city) out = { ...out, customerCity: p.city };
  if (p.state) out = { ...out, customerState: p.state };
  if (p.postalCode) out = { ...out, customerPostalCode: p.postalCode };
  if (p.countryCode) out = { ...out, customerCountry: p.countryCode };
  return dedupeWizardAddressFields(out);
}

/**
 * Next address sub-prompt to show (one thing at a time). Returns null when address phase is complete
 * (caller should move to country step or finish).
 */
export type AddressPhaseResolution =
  | { kind: 'slot'; slot: AddressCollectSlot }
  | { kind: 'need_country' }
  | { kind: 'complete' };

/**
 * Order: street → city → region (optional, skippable) → country → postal when needed.
 * Region is collected before country so the conversation stays linear and country-aware prompts stay accurate.
 */
export function resolveAddressPhase(draft: InvoiceWizardDraft): AddressPhaseResolution {
  const d = dedupeWizardAddressFields(draft);
  const skips = d.newCustomerAddressSkips ?? {};
  if (!d.customerAddressLine1?.trim()) return { kind: 'slot', slot: 'street' };
  if (!d.customerCity?.trim()) return { kind: 'slot', slot: 'city' };
  if (!skips.region && !d.customerState?.trim()) {
    return { kind: 'slot', slot: 'region' };
  }
  if (!d.customerCountry?.trim()) return { kind: 'need_country' };

  const cc = normalizeCountryCode(d.customerCountry);
  if (cc && postalLikelyRequired(cc) && !skips.postal && !d.customerPostalCode?.trim()) {
    return { kind: 'slot', slot: 'postal' };
  }
  return { kind: 'complete' };
}

export function nextAddressCollectSlot(draft: InvoiceWizardDraft): AddressCollectSlot | null {
  const r = resolveAddressPhase(draft);
  return r.kind === 'slot' ? r.slot : null;
}

export function addressPhaseCompleteForCountryStep(draft: InvoiceWizardDraft): boolean {
  return resolveAddressPhase(draft).kind === 'complete';
}

export function conversationalPromptForAddressSlot(
  slot: AddressCollectSlot | null,
  draft: InvoiceWizardDraft
): string {
  const d = dedupeWizardAddressFields(draft);
  const street = d.customerAddressLine1?.trim();
  switch (slot) {
    case null:
      return 'What’s the street address?';
    case 'street':
      return 'What’s the street address?';
    case 'city':
      return street
        ? 'I’ve got the street address.\nWhat city is this in?'
        : 'What city is this in?';
    case 'region': {
      const city = d.customerCity?.trim();
      const lead = city ? `I’ve got the city.\n` : '';
      return `${lead}What state, province, or region should I use?\nYou can send it now or say skip.`;
    }
    case 'postal':
      return 'What postal or ZIP code should I use?\nYou can send it now or say skip.';
    default:
      return 'Tell me more about the address.';
  }
}

/**
 * Apply user text for the current address collection turn (freeform first line or targeted slot).
 * Pass `slot` null for a full free-text parse (first line or correction).
 */
export function applyIntelligentAddressInput(
  draft: InvoiceWizardDraft,
  userText: string,
  slot: AddressCollectSlot | null
): InvoiceWizardDraft {
  const t = userText.trim();
  if (!t) return draft;

  if (slot == null || slot === 'street') {
    const parsed = parseFreeformAddressInput(t);
    const d0 = dedupeWizardAddressFields(draft);
    const line1 = d0.customerAddressLine1?.trim();
    const cityMissing = !d0.customerCity?.trim();
    const parsedLine = parsed.line1?.trim() ?? '';
    const wordCount = parsedLine.split(/\s+/).filter(Boolean).length;
    const looksLikeCityOnly =
      line1 &&
      cityMissing &&
      !parsed.city &&
      parsedLine &&
      !/\d/.test(parsedLine) &&
      wordCount === 1 &&
      parsedLine.length <= 64;
    if (looksLikeCityOnly) {
      return dedupeWizardAddressFields({
        ...d0,
        customerCity: normalizeAddressWhitespace(parsedLine),
        customerAddressLine1: line1,
      });
    }
    return mergeParsedIntoDraft(draft, parsed);
  }

  const d0 = dedupeWizardAddressFields(draft);
  if (slot === 'city') {
    return dedupeWizardAddressFields({ ...d0, customerCity: normalizeAddressWhitespace(t) });
  }
  if (slot === 'region') {
    return dedupeWizardAddressFields({ ...d0, customerState: normalizeAddressWhitespace(t) });
  }
  if (slot === 'postal') {
    return dedupeWizardAddressFields({ ...d0, customerPostalCode: normalizeAddressWhitespace(t) });
  }
  return draft;
}
