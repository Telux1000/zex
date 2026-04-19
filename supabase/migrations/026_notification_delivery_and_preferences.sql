-- Notification preferences + outbound email tracking

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_sent_emails BOOLEAN NOT NULL DEFAULT TRUE,
  payment_received_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  payment_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  overdue_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  quote_emails BOOLEAN NOT NULL DEFAULT TRUE,
  ai_insight_emails BOOLEAN NOT NULL DEFAULT TRUE,
  internal_operational_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS entity_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS entity_id UUID NULL;

CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  related_entity_type TEXT NULL,
  related_entity_id UUID NULL,
  event_type TEXT NOT NULL,
  recipient_to TEXT NOT NULL,
  subject TEXT NULL,
  postmark_message_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  opened_at TIMESTAMPTZ NULL,
  clicked_at TIMESTAMPTZ NULL,
  bounced_at TIMESTAMPTZ NULL,
  complained_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_business ON public.email_messages(business_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_event ON public.email_messages(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_message_id ON public.email_messages(postmark_message_id);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_preferences'
      AND policyname = 'Users can manage notification preferences of own businesses'
  ) THEN
    CREATE POLICY "Users can manage notification preferences of own businesses"
      ON public.notification_preferences
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.businesses b
          WHERE b.id = business_id AND b.owner_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.businesses b
          WHERE b.id = business_id AND b.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_messages'
      AND policyname = 'Users can read email messages of own businesses'
  ) THEN
    CREATE POLICY "Users can read email messages of own businesses"
      ON public.email_messages
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.businesses b
          WHERE b.id = business_id AND b.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_messages'
      AND policyname = 'Service role can insert email messages'
  ) THEN
    CREATE POLICY "Service role can insert email messages"
      ON public.email_messages
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_messages'
      AND policyname = 'Service role can update email messages'
  ) THEN
    CREATE POLICY "Service role can update email messages"
      ON public.email_messages
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

