/**
 * Sync Assistant threads to Supabase (`assistant_conversations` + `assistant_messages`).
 * Used together with `conversation-storage.ts` (localStorage cache): server is source of truth when newer.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceWizardDraft, InvoiceWizardStep } from '@/lib/invoices/conversational-invoice-wizard';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import { coerceAssistantActiveContextFromUnknown } from '@/lib/business-assistant/claude/assistant-active-context';
import { coerceAssistantResponseMetaFromUnknown } from '@/lib/business-assistant/claude/assistant-response-meta';
import type {
  MessageRetentionOption,
  PersistedAssistantThread,
  PersistedChatMessage,
} from '@/lib/assistant/conversation-storage';
import {
  getActiveAssistantSessionPointerKey,
  pruneMessagesByRetention,
  THREAD_STORAGE_VERSION,
} from '@/lib/assistant/conversation-storage';

export type RemoteThreadBundle = {
  thread: PersistedAssistantThread;
  /** `assistant_conversations.updated_at` in epoch ms — for merge vs localStorage `updatedAt`. */
  serverUpdatedAtMs: number;
};

function extrasFromMessage(m: PersistedChatMessage): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (m.cards != null) extras.cards = m.cards;
  if (m.quickReplies != null) extras.quickReplies = m.quickReplies;
  if (m.structured != null) extras.structured = m.structured;
  if (m.assistantResponseMeta != null) extras.assistantResponseMeta = m.assistantResponseMeta;
  if (m.postCardContent != null && String(m.postCardContent).trim()) extras.postCardContent = m.postCardContent;
  if (m.editedAt != null) extras.editedAt = m.editedAt;
  return extras;
}

type AssistantMessageRow = {
  id: string;
  role: string;
  content: string | null;
  variant: string | null;
  sort_index: number | null;
  client_created_at_ms: number | null;
  extras: unknown;
};

function messageFromRow(row: AssistantMessageRow, fallbackCreatedAt: number): PersistedChatMessage {
  const extras = row.extras && typeof row.extras === 'object' ? (row.extras as Record<string, unknown>) : {};
  const assistantResponseMeta = coerceAssistantResponseMetaFromUnknown(extras.assistantResponseMeta);
  const editedAtRaw = extras.editedAt;
  const editedAt =
    typeof editedAtRaw === 'number' && Number.isFinite(editedAtRaw) ? editedAtRaw : undefined;
  return {
    id: row.id,
    role: row.role === 'user' ? 'user' : 'assistant',
    content: row.content ?? '',
    variant: row.variant === 'error' ? 'error' : undefined,
    createdAt:
      row.client_created_at_ms != null && Number.isFinite(Number(row.client_created_at_ms))
        ? Number(row.client_created_at_ms)
        : fallbackCreatedAt,
    ...(editedAt != null ? { editedAt } : {}),
    cards: extras.cards as PersistedChatMessage['cards'],
    quickReplies: extras.quickReplies as PersistedChatMessage['quickReplies'],
    structured: extras.structured as PersistedChatMessage['structured'],
    postCardContent:
      typeof extras.postCardContent === 'string' ? extras.postCardContent : undefined,
    assistantResponseMeta,
  };
}

/**
 * Load thread from Supabase for this business + user + client session id.
 */
export async function loadAssistantThreadFromSupabase(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  wizardSessionId: string,
  retention: MessageRetentionOption
): Promise<RemoteThreadBundle | null> {
  const { data: conv, error: convErr } = await supabase
    .from('assistant_conversations')
    .select(
      'id, wizard_draft, wizard_step, pending_invoice_lookup, metric_session_context, assistant_active_context, updated_at'
    )
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .eq('client_session_id', wizardSessionId)
    .maybeSingle();

  if (convErr || !conv) return null;

  const serverUpdatedAtMs = Date.parse(String(conv.updated_at)) || Date.now();

  const { data: msgRows, error: msgErr } = await supabase
    .from('assistant_messages')
    .select('id, role, content, variant, sort_index, client_created_at_ms, extras')
    .eq('conversation_id', conv.id)
    .order('sort_index', { ascending: true });

  if (msgErr) return null;

  const rawMessages = (msgRows ?? []) as AssistantMessageRow[];
  const messages: PersistedChatMessage[] = rawMessages.map((row) =>
    messageFromRow(row, serverUpdatedAtMs)
  );
  const pruned = pruneMessagesByRetention(messages, retention, Date.now());

  const thread: PersistedAssistantThread = {
    v: THREAD_STORAGE_VERSION,
    updatedAt: serverUpdatedAtMs,
    messages: pruned,
    wizardDraft: (conv.wizard_draft ?? undefined) as InvoiceWizardDraft | undefined,
    wizardStep: (conv.wizard_step ?? null) as InvoiceWizardStep | null,
    pendingInvoiceLookup: (conv.pending_invoice_lookup ?? null) as PersistedAssistantThread['pendingInvoiceLookup'],
    metricSessionContext: (conv.metric_session_context ?? null) as AssistantMetricSessionContext | null,
    assistantActiveContext: coerceAssistantActiveContextFromUnknown(
      (conv as { assistant_active_context?: unknown }).assistant_active_context
    ),
  };

  return { thread, serverUpdatedAtMs };
}

/**
 * `client_session_id` of the most recently updated assistant row for this user + business.
 * Used when the device has no local active-session pointer (e.g. after sign-out cache clear or new device).
 */
export async function fetchLatestAssistantSessionId(
  supabase: SupabaseClient,
  businessId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .select('client_session_id')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.client_session_id) return null;
  const sid = String(data.client_session_id).trim();
  return sid.length >= 8 ? sid : null;
}

/**
 * Session id for `/dashboard/assistant`: `?session=`, else local pointer, else latest Supabase conversation, else new UUID.
 */
export async function resolveAssistantWizardSessionWithServer(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  sessionQueryParam: string | null
): Promise<string> {
  const explicit = sessionQueryParam?.trim() ?? '';
  const pointerKey = getActiveAssistantSessionPointerKey(businessId, userId);

  if (typeof window === 'undefined') {
    return explicit || `asst_ssr_${Date.now()}`;
  }

  if (explicit) {
    try {
      localStorage.setItem(pointerKey, explicit);
    } catch {
      /* quota */
    }
    return explicit;
  }

  try {
    const stored = localStorage.getItem(pointerKey);
    if (stored && stored.length >= 8) return stored;
  } catch {
    /* ignore */
  }

  const latest = await fetchLatestAssistantSessionId(supabase, businessId, userId);
  if (latest) {
    try {
      localStorage.setItem(pointerKey, latest);
    } catch {
      /* quota */
    }
    return latest;
  }

  const fresh =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `asst_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  try {
    localStorage.setItem(pointerKey, fresh);
  } catch {
    /* quota */
  }
  return fresh;
}

/**
 * When both localStorage and Supabase have data, prefer the newer snapshot (by `updatedAt` / server `updated_at`).
 */
export function mergeAssistantThreads(
  remote: RemoteThreadBundle | null,
  local: PersistedAssistantThread | null
): { merged: PersistedAssistantThread | null; migrateLocalToServer: boolean } {
  if (!remote && !local) return { merged: null, migrateLocalToServer: false };
  if (!remote && local) return { merged: local, migrateLocalToServer: true };
  if (remote && !local) return { merged: remote.thread, migrateLocalToServer: false };

  const localMs = local!.updatedAt ?? 0;
  const remoteMs = remote!.serverUpdatedAtMs;
  if (remoteMs >= localMs) {
    return { merged: remote!.thread, migrateLocalToServer: false };
  }
  return { merged: local!, migrateLocalToServer: true };
}

/**
 * Replace server row + messages with the given thread (full sync).
 */
export async function saveAssistantThreadToSupabase(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  wizardSessionId: string,
  thread: Omit<PersistedAssistantThread, 'v'> & { messages: PersistedChatMessage[] },
  retention: MessageRetentionOption
): Promise<boolean> {
  const now = Date.now();
  const pruned = pruneMessagesByRetention(thread.messages, retention, now);

  const { data: convRow, error: upErr } = await supabase
    .from('assistant_conversations')
    .upsert(
      {
        business_id: businessId,
        user_id: userId,
        client_session_id: wizardSessionId,
        wizard_draft: thread.wizardDraft ?? null,
        wizard_step: thread.wizardStep ?? null,
        pending_invoice_lookup: thread.pendingInvoiceLookup ?? null,
        metric_session_context: thread.metricSessionContext ?? null,
        assistant_active_context: thread.assistantActiveContext ?? null,
      },
      { onConflict: 'business_id,user_id,client_session_id' }
    )
    .select('id')
    .single();

  if (upErr || !convRow?.id) return false;

  const convId = convRow.id as string;

  const { error: delErr } = await supabase
    .from('assistant_messages')
    .delete()
    .eq('conversation_id', convId);

  if (delErr) return false;

  if (pruned.length === 0) return true;

  const inserts = pruned.map((m, i) => ({
    id: m.id,
    conversation_id: convId,
    role: m.role,
    content: m.content,
    variant: m.variant ?? null,
    sort_index: i,
    client_created_at_ms: m.createdAt,
    extras: extrasFromMessage(m),
  }));

  const { error: insErr } = await supabase.from('assistant_messages').insert(inserts);
  return !insErr;
}

export async function clearAssistantThreadFromSupabase(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  wizardSessionId: string
): Promise<void> {
  await supabase
    .from('assistant_conversations')
    .delete()
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .eq('client_session_id', wizardSessionId);
}
