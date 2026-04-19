# Zenzex – Necessary Setups

Follow these steps in order to run Zenzex locally or deploy it.

---

## 1. Install dependencies

```bash
cd zenzex
npm install
```

If you see npm cache permission errors, fix with:

```bash
sudo chown -R $(whoami) ~/.npm
```

Then run `npm install` again.

---

## 2. Supabase

### Create a project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → choose org, name (e.g. `zenzex`), database password, region.
3. Wait for the project to be ready.

### Get keys

1. In the project: **Settings** → **API**.
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret; server-only)

### Run the database migration

1. In Supabase: **SQL Editor** → **New query**.
2. Run migrations in this order (copy full file contents into the editor and **Run** each):
   - `supabase/migrations/001_initial_schema.sql` – base tables (profiles, businesses, invoices, invoice_items, etc.).
   - If you get "table public.businesses not found": run `002_ensure_public_businesses.sql`.
   - If you get "table public.invoices not found": run `003_ensure_public_invoices.sql`.
   - **Required for invoice form/preview:** run `006_invoices_pricing_and_metadata.sql` to add `discount_amount`, `reference_po`, `terms`, `metadata` on `invoices` and `tax_percent` on `invoice_items`.
3. After running SQL, **restart your Next.js dev server** (`npm run dev`) so the schema cache is refreshed.

You should see “Success” and tables like `profiles`, `businesses`, `invoices`, etc.

**Confirm you're using the right project:** the app uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`. These must point to the same Supabase project where you ran the migrations. Check **Settings → API** in the Dashboard for the Project URL.

### Email confirmation (signup link not arriving)

By default Supabase requires users to confirm their email. The confirmation email often does not reach your inbox unless you configure SMTP or use the options below.

**Option A – Development: disable confirmation (easiest)**  
1. In Supabase: **Authentication** → **Providers** → **Email**.  
2. Turn **OFF** “Confirm email”.  
3. New signups can sign in immediately without a confirmation link.

**Option B – Manually confirm a single user**  
1. **Authentication** → **Users**.  
2. Find the user → click the **⋮** menu → **Confirm user**.  
3. They can then sign in with their password.

**Option C – Production: use your own SMTP**  
1. **Project Settings** → **Auth** → **SMTP Settings**.  
2. Enable “Custom SMTP” and fill in your provider (e.g. [Resend](https://resend.com), SendGrid, Mailgun).  
3. Supabase will send confirmation and password-reset emails through your SMTP so they reach real inboxes.

**Option D – Postmark + Send Email hook (this repo)**  
Supabase can call your app on every auth email instead of sending mail itself. Zenzex verifies the hook, builds the confirmation link, and sends through Postmark (same stack as invoices and forgot-password).

**Email/password signup in this app** uses `POST /api/auth/signup-email` (admin `generateLink` + Postmark), **not** `supabase.auth.signUp()`, so the default Supabase “Confirm your signup” message is **not** used for new registrations. The hook still covers other auth emails (e.g. if anything still triggers the hosted mailer). Resend on `/signup/confirm` uses the same Postmark path (`generateLink` + Postmark), not `auth.resend()`.

1. In Postmark: create a **Template** from `postmark/signup-confirm.html`. Set template variables: `product_name`, `recipient_email`, `confirm_url`, `token`, `expiry_hours`, `year`. Note the template **alias** or numeric **Template ID**.
2. In `.env.local`: set `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM_EMAIL`, `POSTMARK_TEMPLATE_SIGNUP_CONFIRM` (alias or ID). Keep `POSTMARK_TEMPLATE_FORGOT_PASSWORD` set so password-reset emails triggered via the hook can use the same template as `/api/auth/forgot-password`.
3. Deploy the app so it has a public HTTPS URL.
4. In Supabase: **Authentication** → **Hooks** → **Send Email** → enable the hook. **Hook URL**: `https://YOUR_DOMAIN/api/auth/supabase-email-hook`. Copy the **hook secret** into `SEND_EMAIL_HOOK_SECRET` (value usually looks like `v1,whsec_...`).
5. With the hook enabled, Supabase **does not** send its own auth emails; this endpoint must return `200` after Postmark accepts the message. Ensure `NEXT_PUBLIC_SUPABASE_URL` matches the project that owns the hook.

If the hook is misconfigured or Postmark fails, users may not receive signup confirmation. Check server logs and Postmark activity.

**Still receiving “Confirm your signup” from Supabase (not Postmark)?**  
That message is Supabase’s **built-in** mailer. Your Postmark template only runs when **Authentication → Hooks → Send Email** is **enabled** and Supabase can reach your hook over **HTTPS**.

1. **Hook disabled** — In the Supabase dashboard (same project as `NEXT_PUBLIC_SUPABASE_URL`), open **Authentication** → **Hooks** (or **Project Settings** → **Auth** → hooks, depending on UI version). Turn **Send Email** on. If it’s off, Supabase sends its own emails and ignores your `/api/auth/supabase-email-hook` route.
2. **Hook URL must be public** — Use your deployed origin, e.g. `https://your-domain.com/api/auth/supabase-email-hook`. **localhost will not work** for a hosted Supabase project; use a tunnel (ngrok, etc.) for local testing or test on staging/production.
3. **Secrets on the server** — `SEND_EMAIL_HOOK_SECRET` and all `POSTMARK_*` vars must exist in **production** (e.g. Vercel **Environment Variables**), not only in `.env.local`. Redeploy after changing them.
4. **Hook returns 401/500** — Wrong `SEND_EMAIL_HOOK_SECRET` → 401. Missing Postmark token, bad template alias, or Postmark API error → 500. Supabase may then fall back to its default email (what you’re seeing). Check deployment logs for `[supabase-email-hook]` and `Postmark failed`.
5. **Custom SMTP in Supabase** — If you enabled **Auth → SMTP** without the Send Email hook, mail still uses **Supabase’s templates** (delivery may go through Postmark SMTP, but the content is still Supabase’s). For **your** Postmark HTML template, you need the **Send Email hook**, not SMTP alone.

**Signup confirmation resend (rate limits)**  
Run `supabase/migrations/047_signup_resend_attempts.sql` in the SQL editor so `/api/auth/resend-signup` can log attempts and enforce limits. Without this table, resend returns 503.

**Finance settings (base currency)**  
Run `supabase/migrations/048_finance_settings.sql` to add `finance_settings` and align `businesses.currency` with the former invoice default. Settings → Finance → Currency uses this column as the single base currency.

### (Optional) Enable Google OAuth

1. **Authentication** → **Providers** → **Google** → Enable.
2. Add your OAuth client ID and secret from [Google Cloud Console](https://console.cloud.google.com/) (OAuth 2.0 Client ID for a “Web application”, with redirect URI from Supabase).
3. In **URL Configuration**, set **Site URL** to `http://localhost:3000` for local dev. Add `http://localhost:3000/auth/callback` to **Redirect URLs** if needed.

---

## 3. OpenAI

1. Go to [platform.openai.com](https://platform.openai.com) and sign in.
2. **API keys** → **Create new secret key**.
3. Copy the key → `OPENAI_API_KEY` in `.env.local`.

Used for: invoice parsing (GPT), voice (Whisper), document/screenshot (Vision), business queries, AI insights.

---

## 4. Stripe

### Create an account and get keys

1. Go to [stripe.com](https://stripe.com) and sign up or sign in.
2. **Developers** → **API keys**.
3. Copy:
   - **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** → `STRIPE_SECRET_KEY`

### Local webhook (required for “mark as paid”)

1. Install Stripe CLI: [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli).
2. Log in: `stripe login`.
3. Forward webhooks to your app:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

4. The CLI prints a **webhook signing secret** (e.g. `whsec_...`). Copy it → `STRIPE_WEBHOOK_SECRET` in `.env.local`.

Leave the CLI running while you test payments locally.

---

## 5. Environment file

Create `.env.local` in the project root (same folder as `package.json`):

```bash
cp .env.local.example .env.local
```

Fill every variable (no quotes unless the value itself contains spaces):

| Variable | Where to get it | Example |
|----------|----------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public | `eyJhbGc...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role | `eyJhbGc...` |
| `OPENAI_API_KEY` | platform.openai.com → API keys | `sk-...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API keys → Publishable | `pk_test_...` |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Output of `stripe listen --forward-to ...` | `whsec_...` |
| `NEXT_PUBLIC_APP_URL` | Your app URL | `http://localhost:3000` (production: `https://your-domain.com`) |

Never commit `.env.local`. It is listed in `.gitignore`.

---

## 6. Run the app

```bash
npm run dev
```

- App: [http://localhost:3000](http://localhost:3000)
- Sign up (email or Google if configured).
- Complete onboarding (business name, currency).
- Create an invoice via **New invoice** (text or file), then open **View as client** or **Copy link** to test the public invoice page and payment.

---

## Checklist

- [ ] `npm install` succeeded
- [ ] Supabase project created
- [ ] Supabase migration `001_initial_schema.sql` run in SQL Editor
- [ ] `.env.local` created and all 8 variables set
- [ ] (Optional) Google OAuth enabled in Supabase
- [ ] Stripe CLI running with `stripe listen --forward-to localhost:3000/api/stripe/webhook` when testing payments
- [ ] `npm run dev` runs and app loads at http://localhost:3000

---

## Production (e.g. Vercel)

1. **Vercel:** Import the repo, add the same env vars in **Settings → Environment variables**. Set `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://zenzex.vercel.app`).
2. **Supabase:** In **Authentication → URL Configuration**, set **Site URL** to your production app URL and add your production callback (e.g. `https://your-domain.com/auth/callback`) to **Redirect URLs**.
3. **Stripe:** **Developers → Webhooks** → **Add endpoint**:
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events: `checkout.session.completed`
   - Copy the **Signing secret** and set it as `STRIPE_WEBHOOK_SECRET` in Vercel (no need for Stripe CLI in production).

After deployment, run the same migration on the production Supabase project if you use a separate one.

---

## Troubleshooting

**"Could not find the table public.businesses in the schema cache"**

1. In Supabase **Table Editor**, check if the `businesses` table exists.
2. **If it does not:** Run the full `001_initial_schema.sql` again. If you get errors like "relation already exists", run `002_ensure_public_businesses.sql` in the SQL Editor instead—it creates only the `businesses` table.
3. **If it does:** Your app may be using a different Supabase project. Confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` match the project where you ran the migration. Restart the dev server (`npm run dev`).

**"Could not find the table public.invoices in the schema cache"**

1. Make sure `businesses` exists (run `002_ensure_public_businesses.sql` if needed).
2. In the Supabase **SQL Editor**, run the full contents of `003_ensure_public_invoices.sql`. It creates the `customers`, `invoices`, and `invoice_items` tables (and related indexes, RLS, trigger, and `next_invoice_number` function) if they are missing.
3. Restart the dev server (`npm run dev`).

**"Could not find the 'discount_amount' column of 'invoices' in the schema cache"**

1. In the Supabase **SQL Editor**, run the full contents of `supabase/migrations/006_invoices_pricing_and_metadata.sql`. It adds `reference_po`, `discount_amount`, `terms`, `metadata` to `invoices` and `tax_percent` to `invoice_items`.
2. Restart the dev server (`npm run dev`) so PostgREST picks up the new schema.
3. (Optional) Regenerate TypeScript types: **Settings → API** in Supabase, copy the **Project ID** (ref), then run: `npx supabase gen types typescript --project-id YOUR_PROJECT_REF --schema public > src/lib/database.types.ts`
