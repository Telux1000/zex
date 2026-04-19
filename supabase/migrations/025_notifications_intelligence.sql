-- Notification intelligence system
-- Turns business signals into grouped, prioritized, low-noise notifications.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL,
  priority_score NUMERIC NOT NULL DEFAULT 0,
  action_label TEXT,
  action_target TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  group_key TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_notifications_business ON public.notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_business_created ON public.notifications(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_business_read ON public.notifications(business_id, read, dismissed);
CREATE INDEX IF NOT EXISTS idx_notifications_business_group ON public.notifications(business_id, group_key);

-- Allows deduplication/upsert: same business + group + type.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique_group_type
  ON public.notifications(business_id, group_key, type);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'Users can read notifications of own businesses'
  ) THEN
    CREATE POLICY "Users can read notifications of own businesses"
      ON public.notifications FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.businesses b
          WHERE b.id = business_id AND b.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Insert/Upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'Users can manage notifications of own businesses'
  ) THEN
    CREATE POLICY "Users can manage notifications of own businesses"
      ON public.notifications
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

