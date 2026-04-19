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
  END IF;
END $$;
