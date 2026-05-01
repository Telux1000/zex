const PREFIX = '[billing]';

type BillingLogPayload = Record<string, string | number | boolean | null | undefined>;

function safePayload(p: BillingLogPayload): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    o[k] = v;
  }
  return o;
}

export const billingLog = {
  info(message: string, payload?: BillingLogPayload) {
    if (payload) console.info(PREFIX, message, safePayload(payload));
    else console.info(PREFIX, message);
  },
  warn(message: string, payload?: BillingLogPayload) {
    if (payload) console.warn(PREFIX, message, safePayload(payload));
    else console.warn(PREFIX, message);
  },
} as const;
