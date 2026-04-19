import { normalizeCountryCode } from '@/lib/location';
import {
  applyIntelligentAddressInput,
  resolveAddressPhase,
} from './address-intelligence';
import { userTextSkipsCustomerOptionalStep } from './state-machine';
import { dedupeWizardAddressFields, normalizeAddressWhitespace } from './address-dedupe';
import type { InvoiceWizardDraft, InvoiceWizardStep } from './types';

export { dedupeWizardAddressFields, normalizeAddressWhitespace } from './address-dedupe';

/**
 * After email, optional onboarding order: phone → (contact if phone) → address → (country if unclear).
 */
export function ensureNewCustomerOnboardSubstep(draft: InvoiceWizardDraft): InvoiceWizardDraft {
  if (!draft.isNewCustomer || !draft.customerEmail.trim() || draft.customerId || draft.newCustomerOptionalStepDone) {
    return draft;
  }
  if (draft.newCustomerOnboardSubstep == null) {
    return { ...draft, newCustomerOnboardSubstep: 'phone' };
  }
  return draft;
}

export function hasWizardCustomerAddressText(d: InvoiceWizardDraft): boolean {
  return Boolean(
    d.customerAddressLine1?.trim() ||
      d.customerAddress?.trim() ||
      (d.customerCity?.trim() && d.customerPostalCode?.trim())
  );
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * Plain text blob for country parsing (no duplicate line1 + customerAddress).
 */
export function collectAddressTextForCountryInference(draft: InvoiceWizardDraft): string {
  const d = dedupeWizardAddressFields(draft);
  const line = d.customerAddressLine1?.trim() || '';
  const rest = [d.customerCity, d.customerState, d.customerPostalCode]
    .map((x) => (x != null ? normalizeAddressWhitespace(String(x)) : ''))
    .filter(Boolean)
    .join(', ');
  if (line && rest) {
    const l = line.toLowerCase();
    const r = rest.toLowerCase();
    if (l.includes(r)) return line;
    const parts = rest
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const allInLine = parts.length > 0 && parts.every((p) => l.includes(p.toLowerCase()));
    if (allInLine) return line;
    return normalizeAddressWhitespace(`${line}, ${rest}`);
  }
  return line || rest;
}

/**
 * Single-line address for Assistant summary (deduped; does not repeat line1 + freeform).
 */
export function formatWizardCustomerAddressSummary(draft: InvoiceWizardDraft): string {
  const d = dedupeWizardAddressFields(draft);
  const line = d.customerAddressLine1?.trim() || '';
  const rest = [d.customerCity, d.customerState, d.customerPostalCode]
    .map((x) => (x != null ? normalizeAddressWhitespace(String(x)) : ''))
    .filter(Boolean)
    .join(', ');
  if (line && rest) {
    const l = line.toLowerCase();
    const parts = rest
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const allInLine = parts.length > 0 && parts.every((p) => l.includes(p.toLowerCase()));
    if (l.includes(rest.toLowerCase()) || allInLine) {
      return normalizeAddressWhitespace(line);
    }
    return normalizeAddressWhitespace(`${line}, ${rest}`);
  }
  if (line) return line;
  if (rest) return rest;
  return '—';
}

/**
 * Keep contact person separate from phone: strip phone-like contact, optionally move digits-only contact into phone.
 */
export function sanitizeWizardContactVsPhone(d: InvoiceWizardDraft): InvoiceWizardDraft {
  const phone = d.customerPhone?.trim() ?? '';
  const contact = d.customerContactName?.trim() ?? '';
  if (!contact) return d;

  const strippedForAlpha = contact.replace(/\b(ext|extension|x)\b\.?/gi, '');
  const hasRealNameLetters = /[a-zA-Z]{2,}/.test(strippedForAlpha);
  if (hasRealNameLetters) return d;

  const cd = digitsOnly(contact);
  if (cd.length < 7) return d;

  const pd = digitsOnly(phone);
  if (pd.length >= 7 && cd === pd) {
    return { ...d, customerContactName: null };
  }
  if (pd.length >= 7) {
    return { ...d, customerContactName: null };
  }
  return { ...d, customerContactName: null, customerPhone: contact };
}

/** Dedupe address, fix contact/phone mix-ups, infer ISO country from comma-separated tail segments. */
export function finalizeWizardNewCustomerExtractFields(d: InvoiceWizardDraft): InvoiceWizardDraft {
  if (!d.isNewCustomer || d.customerId) return d;
  let out = dedupeWizardAddressFields(d);
  out = sanitizeWizardContactVsPhone(out);
  out = tryInferCountryFromAddressText(out);
  return out;
}

/** Try comma-separated segment(s) as country name or ISO code (scan from the end). */
export function tryInferCountryFromAddressText(draft: InvoiceWizardDraft): InvoiceWizardDraft {
  const d = dedupeWizardAddressFields(draft);
  if (d.customerCountry?.trim()) return d;
  const blob = collectAddressTextForCountryInference(d);
  if (!blob.trim()) return d;
  const parts = blob.split(',').map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const code = normalizeCountryCode(parts[i]!);
    if (code) return { ...d, customerCountry: code };
  }
  return d;
}

/**
 * Advance substeps when the model (or merge) already filled fields for the current question.
 */
export function fastForwardNewCustomerOnboardingAfterExtract(draft: InvoiceWizardDraft): InvoiceWizardDraft {
  let d = ensureNewCustomerOnboardSubstep(draft);
  if (d.newCustomerOptionalStepDone || !d.isNewCustomer || d.customerId || !d.customerEmail.trim()) {
    return d;
  }
  if (d.newCustomerOnboardSubstep === 'phone' && d.customerPhone?.trim()) {
    d = { ...d, newCustomerOnboardSubstep: 'contact' };
  }
  if (d.newCustomerOnboardSubstep === 'contact' && d.customerContactName?.trim()) {
    d = { ...d, newCustomerOnboardSubstep: 'address' };
  }
  if (d.newCustomerOnboardSubstep === 'address') {
    d = tryInferCountryFromAddressText(d);
    const ph = resolveAddressPhase(d);
    if (ph.kind === 'need_country') {
      return { ...d, newCustomerOnboardSubstep: 'country', newCustomerAddressCollectSlot: null };
    }
    if (ph.kind === 'slot') {
      return { ...d, newCustomerAddressCollectSlot: ph.slot };
    }
    if (ph.kind === 'complete') {
      return completeNewCustomerOnboarding(d);
    }
  }
  if (d.newCustomerOnboardSubstep === 'country' && d.customerCountry?.trim()) {
    let d2 = finalizeWizardNewCustomerExtractFields(d);
    const ph2 = resolveAddressPhase(d2);
    if (ph2.kind === 'complete') {
      return completeNewCustomerOnboarding(d2);
    }
    if (ph2.kind === 'slot') {
      return {
        ...d2,
        newCustomerOnboardSubstep: 'address',
        newCustomerAddressCollectSlot: ph2.slot,
      };
    }
    if (ph2.kind === 'need_country') {
      return { ...d2, newCustomerAddressCollectSlot: null };
    }
  }
  return d;
}

export function completeNewCustomerOnboarding(draft: InvoiceWizardDraft): InvoiceWizardDraft {
  return {
    ...draft,
    newCustomerOptionalStepDone: true,
    newCustomerOnboardSubstep: null,
    newCustomerAddressCollectSlot: null,
    newCustomerAddressSkips: null,
  };
}

/** When user says "skip" on address step: skip region/postal only, or abandon optional address collection. */
function applySkipForOptionalAddressFields(draft: InvoiceWizardDraft): InvoiceWizardDraft {
  let d = finalizeWizardNewCustomerExtractFields(dedupeWizardAddressFields(draft));
  const ph = resolveAddressPhase(d);
  if (ph.kind === 'slot' && ph.slot === 'region') {
    d = {
      ...d,
      newCustomerAddressSkips: { ...(d.newCustomerAddressSkips ?? {}), region: true },
    };
    return fastForwardNewCustomerOnboardingAfterExtract(d);
  }
  if (ph.kind === 'slot' && ph.slot === 'postal') {
    d = {
      ...d,
      newCustomerAddressSkips: { ...(d.newCustomerAddressSkips ?? {}), postal: true },
    };
    return fastForwardNewCustomerOnboardingAfterExtract(d);
  }
  return completeNewCustomerOnboarding(d);
}

/** Shared by chat text and `apply_country` action — may return to address for region/postal. */
export function mergeCountryIntoNewCustomerDraft(draft: InvoiceWizardDraft, countryCode: string): InvoiceWizardDraft {
  let next = finalizeWizardNewCustomerExtractFields({
    ...draft,
    customerCountry: countryCode,
    pendingCountryCandidates: null,
    countryModalRecommended: false,
  });
  const ph = resolveAddressPhase(next);
  if (ph.kind === 'complete') {
    return completeNewCustomerOnboarding(next);
  }
  if (ph.kind === 'slot') {
    return {
      ...next,
      newCustomerOnboardSubstep: 'address',
      newCustomerAddressCollectSlot: ph.slot,
    };
  }
  return next;
}

export function applyNewCustomerOnboardingSkip(
  draft: InvoiceWizardDraft,
  step: InvoiceWizardStep
): InvoiceWizardDraft {
  let d = ensureNewCustomerOnboardSubstep(draft);
  switch (step) {
    case 'COLLECT_NEW_CUSTOMER_PHONE':
      return { ...d, customerPhone: null, newCustomerOnboardSubstep: 'address' };
    case 'COLLECT_NEW_CUSTOMER_CONTACT':
      return { ...d, newCustomerOnboardSubstep: 'address' };
    case 'COLLECT_NEW_CUSTOMER_ADDRESS':
      return applySkipForOptionalAddressFields(d);
    case 'COLLECT_NEW_CUSTOMER_COUNTRY':
      return completeNewCustomerOnboarding(d);
    default:
      return d;
  }
}

/** When extract did not run or missed fields, map plain user text to the active step. */
export function applyNewCustomerOnboardingRawInput(
  draft: InvoiceWizardDraft,
  step: InvoiceWizardStep,
  userText: string,
  skipExtractForThisField: boolean
): InvoiceWizardDraft {
  if (skipExtractForThisField) return draft;
  const t = userText.trim();
  if (!t) return draft;
  let d = ensureNewCustomerOnboardSubstep(draft);
  switch (step) {
    case 'COLLECT_NEW_CUSTOMER_PHONE':
      return { ...d, customerPhone: normalizeAddressWhitespace(t), newCustomerOnboardSubstep: 'contact' };
    case 'COLLECT_NEW_CUSTOMER_CONTACT':
      return { ...d, customerContactName: normalizeAddressWhitespace(t), newCustomerOnboardSubstep: 'address' };
    case 'COLLECT_NEW_CUSTOMER_ADDRESS': {
      if (userTextSkipsCustomerOptionalStep(t)) {
        return applySkipForOptionalAddressFields(d);
      }
      let next = applyIntelligentAddressInput(d, t, d.newCustomerAddressCollectSlot ?? null);
      next = finalizeWizardNewCustomerExtractFields(next);
      const ph = resolveAddressPhase(next);
      if (ph.kind === 'need_country') {
        return { ...next, newCustomerOnboardSubstep: 'country', newCustomerAddressCollectSlot: null };
      }
      if (ph.kind === 'slot') {
        return { ...next, newCustomerAddressCollectSlot: ph.slot };
      }
      if (ph.kind === 'complete') {
        return completeNewCustomerOnboarding(next);
      }
      return next;
    }
    case 'COLLECT_NEW_CUSTOMER_COUNTRY': {
      const code = normalizeCountryCode(t);
      if (!code) return d;
      return mergeCountryIntoNewCustomerDraft(d, code);
    }
    default:
      return d;
  }
}
