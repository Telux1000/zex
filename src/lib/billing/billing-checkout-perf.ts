/**
 * Dev-only instrumentation for SaaS billing checkout (Flutterwave / Paystack redirect).
 * Label: [billing-checkout-perf]
 */

export const BILLING_CHECKOUT_PERF_LABEL = '[billing-checkout-perf]' as const;

export function billingCheckoutPerfEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function billingCheckoutPerfLog(
  area: 'client' | 'server',
  event: string,
  payload?: Record<string, string | number | boolean | null | undefined>
): void {
  if (!billingCheckoutPerfEnabled()) return;
  if (payload && Object.keys(payload).length > 0) {
    console.info(BILLING_CHECKOUT_PERF_LABEL, area, event, payload);
  } else {
    console.info(BILLING_CHECKOUT_PERF_LABEL, area, event);
  }
}

/** Server route / service: monotonic marks from request start. */
export class BillingCheckoutServerPerf {
  private readonly t0 = Date.now();
  private lastAt = this.t0;
  private readonly segments: { step: string; segment_ms: number; total_ms: number }[] = [];

  mark(step: string, extras?: Record<string, string | number | boolean | null | undefined>): void {
    if (!billingCheckoutPerfEnabled()) return;
    const now = Date.now();
    const segment_ms = now - this.lastAt;
    const total_ms = now - this.t0;
    this.lastAt = now;
    this.segments.push({ step, segment_ms, total_ms });
    billingCheckoutPerfLog('server', step, { segment_ms, total_ms, ...extras });
  }

  slowestSegment(): { step: string; segment_ms: number } | null {
    if (this.segments.length === 0) return null;
    return this.segments.reduce((a, b) => (a.segment_ms >= b.segment_ms ? a : b));
  }

  totalMs(): number {
    return Date.now() - this.t0;
  }

  finish(extra?: Record<string, string | number | boolean | null | undefined>): void {
    if (!billingCheckoutPerfEnabled()) return;
    const total = this.totalMs();
    const slow = this.slowestSegment();
    billingCheckoutPerfLog('server', 'server_summary', {
      server_total_ms: total,
      slowest_step: slow?.step ?? 'n/a',
      slowest_segment_ms: slow?.segment_ms ?? 0,
      ...(extra ?? {}),
    });
  }
}
