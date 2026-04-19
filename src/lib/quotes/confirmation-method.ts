export type ConfirmationMethodId =
  | 'phone_call'
  | 'whatsapp'
  | 'in_person'
  | 'verbal_agreement'
  | 'courier'
  | 'other';

export type ConfirmationMethodParseResult = {
  isManual: boolean;
  methodId: ConfirmationMethodId | null;
  otherSpec: string | null;
};

const MANUAL_OTHER_PREFIX = 'manual_other:';
const MANUAL_VIA_PREFIX = 'manual_';

const UI_OPTION_LABELS: Record<ConfirmationMethodId, string> = {
  phone_call: 'Via phone call',
  whatsapp: 'Via WhatsApp',
  in_person: 'In person',
  verbal_agreement: 'Verbal agreement',
  courier: 'Courier',
  other: 'Other',
};

const ACTIVITY_VIA_LABELS: Record<ConfirmationMethodId, string> = {
  phone_call: 'phone call',
  whatsapp: 'WhatsApp',
  in_person: 'In person',
  verbal_agreement: 'verbal agreement',
  courier: 'Courier',
  other: 'Other',
};

export { MANUAL_VIA_PREFIX };

export function encodeManualConfirmationMethod(methodId: ConfirmationMethodId, otherSpec?: string | null) {
  const trimmed = otherSpec?.trim() ?? '';
  if (methodId === 'other') {
    if (!trimmed) throw new Error('Please specify');
    return `${MANUAL_OTHER_PREFIX}${trimmed}`;
  }
  return `${MANUAL_VIA_PREFIX}${methodId}`;
}

export function parseManualConfirmationVia(v?: string | null): ConfirmationMethodParseResult {
  if (!v) return { isManual: false, methodId: null, otherSpec: null };
  if (v === 'manual') return { isManual: true, methodId: null, otherSpec: null };
  if (!v.startsWith(MANUAL_VIA_PREFIX) && !v.startsWith(MANUAL_OTHER_PREFIX)) return { isManual: false, methodId: null, otherSpec: null };
  if (v.startsWith(MANUAL_OTHER_PREFIX)) {
    return { isManual: true, methodId: 'other', otherSpec: v.slice(MANUAL_OTHER_PREFIX.length) || null };
  }
  const methodId = v.slice(MANUAL_VIA_PREFIX.length) as ConfirmationMethodId;
  return { isManual: true, methodId, otherSpec: null };
}

export function isManualConfirmationVia(v?: string | null) {
  return parseManualConfirmationVia(v).isManual;
}

export function getConfirmationMethodSubtextFromVia(v?: string | null) {
  const parsed = parseManualConfirmationVia(v);
  if (!parsed.isManual) return null;
  if (v === 'manual') return null;
  if (parsed.methodId === 'other' && parsed.otherSpec) return `Via ${parsed.otherSpec}`;
  if (parsed.methodId) return UI_OPTION_LABELS[parsed.methodId];
  return null;
}

export function getConfirmationMethodActivityLabelFromVia(v?: string | null) {
  const parsed = parseManualConfirmationVia(v);
  if (!parsed.isManual) return null;
  if (v === 'manual') return null;
  if (parsed.methodId === 'other' && parsed.otherSpec) return parsed.otherSpec;
  if (parsed.methodId) return ACTIVITY_VIA_LABELS[parsed.methodId];
  return null;
}

