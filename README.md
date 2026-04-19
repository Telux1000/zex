# Zenzex

**AI-powered invoicing and business intelligence** for freelancers and small businesses. Run your finances conversationally—create invoices via chat, voice, or screenshots, and get AI CFO insights.

**→ [SETUP.md](./SETUP.md)** – Necessary setups (Supabase, OpenAI, Stripe, env, run).

## Tech stack

- **Frontend:** Next.js 14 (App Router), React, TypeScript, TailwindCSS
- **Backend:** Supabase (Auth, PostgreSQL, Storage)
- **AI:** OpenAI (GPT-4o-mini, Whisper, Vision)
- **Payments:** Stripe (Checkout, webhooks)
- **Deploy:** Vercel + Supabase

## Setup

### 1. Clone and install

```bash
cd zenzex
npm install
```

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
cp .env.local.example .env.local
```

- **Supabase:** Create a project at [supabase.com](https://supabase.com). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (for webhooks and server-side).
- **OpenAI:** Get an API key from [platform.openai.com](https://platform.openai.com). Set `OPENAI_API_KEY`.
- **Stripe:** Create a project at [stripe.com](https://stripe.com). Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` (for payment webhooks).
- **App URL:** Set `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000` for local).

### 3. Database schema

In the Supabase SQL Editor, run the migration:

```bash
# Or use Supabase CLI: supabase db push
```

Paste and run the contents of `supabase/migrations/001_initial_schema.sql`.

### 4. Stripe webhook (local)

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the printed webhook signing secret as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up, create a business in onboarding, then create invoices via the AI flow.

## Project structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── ai/                 # parse-invoice, business-query, generate-insights
│   │   ├── voice/transcribe/
│   │   ├── documents/parse/
│   │   ├── invoices/
│   │   ├── customers/
│   │   ├── stripe/             # create-payment-link, webhook
│   │   └── businesses/
│   ├── (auth)/                 # login, signup
│   ├── (dashboard)/            # dashboard, invoices, customers, insights, activity, settings
│   ├── auth/callback/
│   └── pay/                    # success, cancel (viral pages)
├── components/
├── lib/
│   ├── ai/                     # invoice-parser, voice-pipeline, document-parser, business-query, insights-engine
│   ├── validations/
│   ├── supabase/
│   ├── activity.ts
│   ├── stripe.ts
│   └── utils/
└── ...
```

## API overview

| Route | Method | Description |
|-------|--------|-------------|
| `/api/ai/parse-invoice` | POST | Natural language → validated invoice JSON → DB |
| `/api/voice/transcribe` | POST | Audio file → Whisper → parser → DB |
| `/api/documents/parse` | POST | Image/screenshot → Vision → parser → DB |
| `/api/ai/business-query` | POST | NL question → query type → safe DB query |
| `/api/ai/generate-insights` | POST | Business data → AI insights → `ai_insights` table |
| `/api/invoices` | GET, POST | List/create invoices |
| `/api/invoices/[id]` | GET, PATCH | Invoice detail/update |
| `/api/customers` | GET, POST | List/create customers |
| `/api/stripe/create-payment-link` | POST | Create Stripe Checkout link for an invoice |
| `/api/stripe/webhook` | POST | Stripe events (checkout.session.completed → mark paid) |

## AI pipeline rules

- **AI never writes directly to the database.** Flow is: user input → AI → JSON → Zod validation → server writes to DB.
- All invoice creation goes through `createInvoiceFromParsed` or the validated `POST /api/invoices` body.
- Business questions use a fixed set of `query_type`s; the server runs type-safe queries, not raw SQL from the model.

## Deployment

- **Vercel:** Connect the repo, set env vars, deploy. Set `NEXT_PUBLIC_APP_URL` to your production URL.
- **Stripe webhook:** In Stripe Dashboard, add endpoint `https://your-domain.com/api/stripe/webhook` and set the signing secret in Vercel env.
- **Supabase:** Use the same project or a production project; run migrations and point env to production URL/keys.

## License

MIT
# zex
# zex
