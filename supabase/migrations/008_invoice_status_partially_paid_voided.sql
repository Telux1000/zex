-- Add accounting workflow statuses: partially_paid, voided
-- Run as standalone statements (not inside DO block)

ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'partially_paid';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'voided';
