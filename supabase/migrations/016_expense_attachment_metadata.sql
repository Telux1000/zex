ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size BIGINT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-attachments', 'expense-attachments', true)
ON CONFLICT (id) DO NOTHING;
