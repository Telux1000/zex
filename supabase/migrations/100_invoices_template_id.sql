-- Persistent invoice document template (HTML preview / customer-facing), distinct from theme_id (branding colors in invoice_themes).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS template_id text NOT NULL DEFAULT 'classic'
    CHECK (template_id IN ('classic', 'modern', 'minimal', 'bold', 'elegant'));

UPDATE public.invoices
SET template_id = 'classic'
WHERE template_id IS NULL OR btrim(template_id) = '';

COMMENT ON COLUMN public.invoices.template_id IS
  'Layout preset for the invoice document (HTML/PDF). Allowed: classic, modern, minimal, bold, elegant. Default classic.';
