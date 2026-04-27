-- Expense currency + FX (base = business reporting currency)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS base_currency text,
  ADD COLUMN IF NOT EXISTS base_amount numeric(14, 2),
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18, 8);

COMMENT ON COLUMN public.expenses.currency IS 'ISO 4217 for amount; NULL = legacy row (amount is in business base currency)';
COMMENT ON COLUMN public.expenses.base_currency IS 'Business base ISO code at save time; NULL on legacy rows';
COMMENT ON COLUMN public.expenses.base_amount IS 'amount * exchange_rate in base_currency; NULL on legacy (use amount)';
COMMENT ON COLUMN public.expenses.exchange_rate IS 'Multiply amount by this to get base_amount; NULL on legacy (treat as 1)';
