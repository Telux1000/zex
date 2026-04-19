DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    CREATE TYPE activity_type AS ENUM (
      'invoice_created',
      'invoice_sent',
      'invoice_viewed',
      'invoice_paid',
      'invoice_overdue',
      'customer_added',
      'payment_received',
      'ai_insight_generated',
      'business_updated'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'invoice_updated';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'invoice_deleted';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'customer_created';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'customer_updated';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'customer_deleted';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'high_expense_created';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'payment_partial';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'payment_full';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'expense_created';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'expense_updated';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'expense_deleted';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'expense_attachment_added';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type activity_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_business ON public.activity_events(business_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_created ON public.activity_events(business_id, created_at DESC);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_events'
      AND policyname = 'Users can read activity of own businesses'
  ) THEN
    CREATE POLICY "Users can read activity of own businesses" ON public.activity_events FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_events'
      AND policyname = 'Service role can insert activity'
  ) THEN
    CREATE POLICY "Service role can insert activity" ON public.activity_events FOR INSERT WITH CHECK (true);
  END IF;
END $$;
