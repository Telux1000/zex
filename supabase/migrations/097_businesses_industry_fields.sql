alter table public.businesses
  add column if not exists industry_key text,
  add column if not exists industry_label text,
  add column if not exists industry_other_text text;
