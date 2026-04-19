import type { PaymentSettings } from '@/lib/database.types';
import { cn } from '@/lib/utils/cn';

type Props = {
  settings?: PaymentSettings | null;
  /** When provided (from businesses table), Stripe is shown only when true. Overrides payment_settings. */
  stripeChargesEnabled?: boolean;
  /** Public invoice pages: fixed light styling (no dark: variants). */
  publicDocument?: boolean;
};

export function InvoicePaymentMethods({ settings, stripeChargesEnabled, publicDocument }: Props) {
  const s = settings || {};
  const pd = publicDocument;

  const hasBank =
    s.enable_bank_transfer &&
    Boolean(
      s.bank_name ||
        s.bank_account_name ||
        s.bank_account_number ||
        s.bank_sort_code ||
        s.bank_swift_bic ||
        s.bank_address
    );

  const hasIntl =
    s.enable_international_bank_transfer &&
    Boolean(
      s.intl_account_name ||
        s.intl_iban ||
        s.intl_swift_bic ||
        s.intl_bank_name ||
        s.intl_bank_address
    );

  const hasPaypal = s.enable_paypal && Boolean(s.paypal_email);
  const hasStripe =
    s.enable_stripe_card &&
    (stripeChargesEnabled !== undefined
      ? stripeChargesEnabled
      : s.stripe_connect_status === 'connected' || s.stripe_connected === true);
  const hasInstructions = Boolean(s.payment_instructions);

  if (!hasBank && !hasIntl && !hasPaypal && !hasStripe && !hasInstructions) {
    return null;
  }

  return (
    <div className={cn('border-t border-slate-200 p-4 text-xs', !pd && 'dark:border-slate-800')}>
      <p
        className={cn(
          'text-xs font-semibold uppercase tracking-wide text-slate-500',
          !pd && 'dark:text-slate-400'
        )}
      >
        Payment methods
      </p>

      <div className="mt-3 space-y-3">
        {(hasBank || hasIntl) &&
          (hasBank && hasIntl ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 print:grid-cols-2">
              <div>
                <p className={cn('text-xs font-semibold text-slate-800', !pd && 'dark:text-slate-200')}>
                  Bank transfer
                </p>
                <div className={cn('mt-1 text-xs text-slate-700', !pd && 'dark:text-slate-300')}>
                  {s.bank_name && <p>Bank: {s.bank_name}</p>}
                  {s.bank_account_name && <p>Account name: {s.bank_account_name}</p>}
                  {s.bank_account_number && <p>Account number: {s.bank_account_number}</p>}
                  {s.bank_sort_code && <p>Sort code / routing: {s.bank_sort_code}</p>}
                  {s.bank_swift_bic && <p>SWIFT / BIC: {s.bank_swift_bic}</p>}
                  {s.bank_address && <p>Bank address: {s.bank_address}</p>}
                </div>
              </div>

              <div>
                <p className={cn('text-xs font-semibold text-slate-800', !pd && 'dark:text-slate-200')}>
                  International bank transfer
                </p>
                <div className={cn('mt-1 text-xs text-slate-700', !pd && 'dark:text-slate-300')}>
                  {s.intl_account_name && <p>Account name: {s.intl_account_name}</p>}
                  {s.intl_iban && <p>IBAN: {s.intl_iban}</p>}
                  {s.intl_swift_bic && <p>SWIFT / BIC: {s.intl_swift_bic}</p>}
                  {s.intl_bank_name && <p>Bank name: {s.intl_bank_name}</p>}
                  {s.intl_bank_address && <p>Bank address: {s.intl_bank_address}</p>}
                </div>
              </div>
            </div>
          ) : (
            <>
              {hasBank && (
                <div>
                  <p className={cn('text-xs font-semibold text-slate-800', !pd && 'dark:text-slate-200')}>
                    Bank transfer
                  </p>
                  <div className={cn('mt-1 text-xs text-slate-700', !pd && 'dark:text-slate-300')}>
                    {s.bank_name && <p>Bank: {s.bank_name}</p>}
                    {s.bank_account_name && <p>Account name: {s.bank_account_name}</p>}
                    {s.bank_account_number && <p>Account number: {s.bank_account_number}</p>}
                    {s.bank_sort_code && <p>Sort code / routing: {s.bank_sort_code}</p>}
                    {s.bank_swift_bic && <p>SWIFT / BIC: {s.bank_swift_bic}</p>}
                    {s.bank_address && <p>Bank address: {s.bank_address}</p>}
                  </div>
                </div>
              )}

              {hasIntl && (
                <div>
                  <p className={cn('text-xs font-semibold text-slate-800', !pd && 'dark:text-slate-200')}>
                    International bank transfer
                  </p>
                  <div className={cn('mt-1 text-xs text-slate-700', !pd && 'dark:text-slate-300')}>
                    {s.intl_account_name && <p>Account name: {s.intl_account_name}</p>}
                    {s.intl_iban && <p>IBAN: {s.intl_iban}</p>}
                    {s.intl_swift_bic && <p>SWIFT / BIC: {s.intl_swift_bic}</p>}
                    {s.intl_bank_name && <p>Bank name: {s.intl_bank_name}</p>}
                    {s.intl_bank_address && <p>Bank address: {s.intl_bank_address}</p>}
                  </div>
                </div>
              )}
            </>
          ))}

        {hasPaypal && (
          <div>
            <p className={cn('text-xs font-semibold text-slate-800', !pd && 'dark:text-slate-200')}>
              PayPal
            </p>
            <p className={cn('mt-1 text-xs text-slate-700', !pd && 'dark:text-slate-300')}>
              Send payments to: {s.paypal_email}
            </p>
          </div>
        )}

        {hasStripe && (
          <div>
            <p className={cn('text-xs font-semibold text-slate-800', !pd && 'dark:text-slate-200')}>
              Card payment (Stripe)
            </p>
            <p className={cn('mt-1 text-xs text-slate-700', !pd && 'dark:text-slate-300')}>
              Pay securely online with card via Stripe. Use the payment button or link provided with
              this invoice.
            </p>
          </div>
        )}

        {hasInstructions && (
          <div>
            <p className={cn('text-xs font-semibold text-slate-800', !pd && 'dark:text-slate-200')}>
              Additional instructions
            </p>
            <p className={cn('mt-1 whitespace-pre-wrap text-xs text-slate-700', !pd && 'dark:text-slate-300')}>
              {s.payment_instructions}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
