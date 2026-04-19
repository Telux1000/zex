DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'quote_expired';
  END IF;
END $$;
