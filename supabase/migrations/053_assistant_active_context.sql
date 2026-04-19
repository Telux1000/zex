-- Persistent structured context for Claude / tool-based assistant follow-ups.

ALTER TABLE public.assistant_conversations
  ADD COLUMN IF NOT EXISTS assistant_active_context JSONB;
