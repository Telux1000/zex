-- Assistant chat: per-user conversation + messages (dashboard assistant persistence).

CREATE TABLE public.assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_session_id TEXT NOT NULL,
  wizard_draft JSONB,
  wizard_step TEXT,
  pending_invoice_lookup JSONB,
  metric_session_context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assistant_conversations_session_unique UNIQUE (business_id, user_id, client_session_id)
);

CREATE INDEX idx_assistant_conversations_business_user
  ON public.assistant_conversations(business_id, user_id);

CREATE INDEX idx_assistant_conversations_updated
  ON public.assistant_conversations(business_id, user_id, updated_at DESC);

CREATE TABLE public.assistant_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  variant TEXT,
  sort_index INTEGER NOT NULL DEFAULT 0,
  client_created_at_ms BIGINT,
  extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assistant_messages_conversation_sort
  ON public.assistant_messages(conversation_id, sort_index ASC);

CREATE TRIGGER assistant_conversations_updated_at
  BEFORE UPDATE ON public.assistant_conversations
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY assistant_conversations_select ON public.assistant_conversations
  FOR SELECT USING (
    user_id = auth.uid()
    AND public.business_can_see(business_id, auth.uid())
  );

CREATE POLICY assistant_conversations_insert ON public.assistant_conversations
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND public.business_can_see(business_id, auth.uid())
  );

CREATE POLICY assistant_conversations_update ON public.assistant_conversations
  FOR UPDATE USING (
    user_id = auth.uid()
    AND public.business_can_see(business_id, auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.business_can_see(business_id, auth.uid())
  );

CREATE POLICY assistant_conversations_delete ON public.assistant_conversations
  FOR DELETE USING (
    user_id = auth.uid()
    AND public.business_can_see(business_id, auth.uid())
  );

CREATE POLICY assistant_messages_select ON public.assistant_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = assistant_messages.conversation_id
        AND c.user_id = auth.uid()
        AND public.business_can_see(c.business_id, auth.uid())
    )
  );

CREATE POLICY assistant_messages_insert ON public.assistant_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = assistant_messages.conversation_id
        AND c.user_id = auth.uid()
        AND public.business_can_see(c.business_id, auth.uid())
    )
  );

CREATE POLICY assistant_messages_update ON public.assistant_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = assistant_messages.conversation_id
        AND c.user_id = auth.uid()
        AND public.business_can_see(c.business_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = assistant_messages.conversation_id
        AND c.user_id = auth.uid()
        AND public.business_can_see(c.business_id, auth.uid())
    )
  );

CREATE POLICY assistant_messages_delete ON public.assistant_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = assistant_messages.conversation_id
        AND c.user_id = auth.uid()
        AND public.business_can_see(c.business_id, auth.uid())
    )
  );
