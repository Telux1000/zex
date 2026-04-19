/**
 * Client-side Assistant conversation persistence (localStorage).
 * Scoped per business + user + wizard session. Does not touch invoices/customers/DB.
 *
 * ## Data model (no Supabase tables)
 *
 * - **Thread** (`PersistedAssistantThread`): one JSON blob per conversation, keyed by
 *   `zenzex.assistant.thread.v1:{businessId}:{userId}:{wizardSessionId}`.
 * - **Messages** (`PersistedChatMessage[]`): ordered array; each entry has `id`, `role`,
 *   `content`, `createdAt` (epoch ms), optional `cards`, `quickReplies`, `structured`, `variant`.
 * - **Active session pointer**: `zenzex.assistant.activeSession.v1:{businessId}:{userId}` stores the
 *   `wizardSessionId` to reuse when the user reopens `/dashboard/assistant` without `?session=`.
 *   If the pointer is missing (new device, cleared site data, or after sign-out device cleanup), the
 *   Assistant page falls back to the latest row in `assistant_conversations` (see
 *   `resolveAssistantWizardSessionWithServer` in `conversation-sync-supabase.ts`).
 * - **Workflow state** on the same thread payload: `wizardDraft`, `wizardStep`,
 *   `pendingInvoiceLookup`, `pendingCustomerContext`, `customerEditSession`, `metricSessionContext`, `assistantActiveContext`.
 */

import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import type { AssistantActiveContextV1 } from '@/lib/business-assistant/claude/assistant-active-context';
import type { AssistantResponseMetaV1 } from '@/lib/business-assistant/claude/assistant-response-meta';
import type { InvoiceWizardDraft, InvoiceWizardStep } from '@/lib/invoices/conversational-invoice-wizard';
import type {
  AssistantCustomerEditSessionV1,
  AssistantQuickReply,
  AssistantStructuredBody,
  InvoiceAssistantChatCard,
  PendingAssistantCustomer,
  PendingInvoiceLookup,
} from '@/lib/invoices/conversational-invoice-wizard/types';

const THREAD_PREFIX = 'zenzex.assistant.thread.v1';
const RETENTION_PREFIX = 'zenzex.assistant.retention.v1';
const ACTIVE_SESSION_PREFIX = 'zenzex.assistant.activeSession.v1';

export function getActiveAssistantSessionPointerKey(businessId: string, userId: string): string {
  return `${ACTIVE_SESSION_PREFIX}:${businessId}:${userId}`;
}

/**
 * Chooses the wizard `session_id` for the Assistant page so the same thread is restored
 * after refresh or when navigating away and back.
 *
 * - Non-empty `?session=` in the URL becomes the active session and is written to the pointer.
 * - Otherwise the last pointer value for `businessId` + `userId` is reused.
 * - If there is no pointer, a new id is generated and stored.
 */
export function resolveAssistantWizardSessionId(
  businessId: string,
  userId: string,
  sessionQueryParam: string | null | undefined
): string {
  const explicit = typeof sessionQueryParam === 'string' ? sessionQueryParam.trim() : '';
  if (typeof window === 'undefined') {
    return explicit || `asst_ssr_${Date.now()}`;
  }
  const pointerKey = getActiveAssistantSessionPointerKey(businessId, userId);
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
 * Removes Assistant thread blobs and active-session pointers from localStorage only.
 * Does not touch Supabase. Call on sign-out so shared devices do not keep chat in local cache;
 * the next sign-in restores from the server via `resolveAssistantWizardSessionWithServer`.
 * Retention preference keys (`zenzex.assistant.retention.v1:*`) are kept.
 */
export function clearAssistantLocalDeviceCache(): void {
  if (typeof window === 'undefined') return;
  const prefixes = [`${THREAD_PREFIX}:`, `${ACTIVE_SESSION_PREFIX}:`] as const;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** Bump when persisted thread shape or onboarding copy changes; invalidates stale localStorage blobs. */
export const THREAD_STORAGE_VERSION = 2 as const;

export type MessageRetentionOption = 'off' | '24h' | '3d' | '7d' | '30d';

const RETENTION_MS: Record<Exclude<MessageRetentionOption, 'off'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function retentionOptionToMs(option: MessageRetentionOption): number | null {
  if (option === 'off') return null;
  return RETENTION_MS[option];
}

export function getMessageRetentionKey(businessId: string, userId: string): string {
  return `${RETENTION_PREFIX}:${businessId}:${userId}`;
}

export function loadMessageRetention(businessId: string, userId: string): MessageRetentionOption {
  if (typeof window === 'undefined') return 'off';
  try {
    const raw = localStorage.getItem(getMessageRetentionKey(businessId, userId));
    if (
      raw === '24h' ||
      raw === '3d' ||
      raw === '7d' ||
      raw === '30d' ||
      raw === 'off'
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'off';
}

export function saveMessageRetention(
  businessId: string,
  userId: string,
  option: MessageRetentionOption
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getMessageRetentionKey(businessId, userId), option);
  } catch {
    /* quota */
  }
}

export type PersistedChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  variant?: 'error';
  createdAt: number;
  /** Set when the user edited this message in chat. */
  editedAt?: number;
  cards?: InvoiceAssistantChatCard[];
  quickReplies?: AssistantQuickReply[];
  structured?: AssistantStructuredBody;
  /** Assistant copy rendered after cards, before quick replies (restored from extras). */
  postCardContent?: string;
  /** Last Claude turn metadata for deterministic weak-confirmation follow-ups. */
  assistantResponseMeta?: AssistantResponseMetaV1 | null;
};

export type PersistedAssistantThread = {
  v: typeof THREAD_STORAGE_VERSION;
  updatedAt: number;
  messages: PersistedChatMessage[];
  wizardDraft?: InvoiceWizardDraft;
  wizardStep?: InvoiceWizardStep | null;
  pendingInvoiceLookup?: PendingInvoiceLookup | null;
  pendingCustomerContext?: PendingAssistantCustomer | null;
  /** Echo of `customer_edit_session` while editing a customer in Assistant (local persistence only). */
  customerEditSession?: AssistantCustomerEditSessionV1 | null;
  metricSessionContext?: AssistantMetricSessionContext | null;
  /** Claude Business Assistant follow-up context (period, metric, breakdown). */
  assistantActiveContext?: AssistantActiveContextV1 | null;
};

export function getThreadStorageKey(
  businessId: string,
  userId: string,
  wizardSessionId: string
): string {
  return `${THREAD_PREFIX}:${businessId}:${userId}:${wizardSessionId}`;
}

export function pruneMessagesByRetention(
  messages: PersistedChatMessage[],
  retention: MessageRetentionOption,
  nowMs: number
): PersistedChatMessage[] {
  const maxAge = retentionOptionToMs(retention);
  if (maxAge == null) return messages;
  const cutoff = nowMs - maxAge;
  return messages.filter((m) => (m.createdAt ?? 0) >= cutoff);
}

export function loadAssistantThread(
  businessId: string,
  userId: string,
  wizardSessionId: string,
  retention: MessageRetentionOption
): PersistedAssistantThread | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getThreadStorageKey(businessId, userId, wizardSessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAssistantThread;
    if (parsed?.v !== THREAD_STORAGE_VERSION || !Array.isArray(parsed.messages)) return null;
    const now = Date.now();
    const messages = pruneMessagesByRetention(parsed.messages, retention, now);
    return { ...parsed, messages, updatedAt: now };
  } catch {
    return null;
  }
}

export function saveAssistantThread(
  businessId: string,
  userId: string,
  wizardSessionId: string,
  thread: Omit<PersistedAssistantThread, 'v' | 'updatedAt'> & { messages: PersistedChatMessage[] },
  retention: MessageRetentionOption
): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const pruned = pruneMessagesByRetention(thread.messages, retention, now);
    const payload: PersistedAssistantThread = {
      v: THREAD_STORAGE_VERSION,
      updatedAt: now,
      messages: pruned,
      wizardDraft: thread.wizardDraft,
      wizardStep: thread.wizardStep,
      pendingInvoiceLookup: thread.pendingInvoiceLookup,
      pendingCustomerContext: thread.pendingCustomerContext,
      customerEditSession: thread.customerEditSession,
      metricSessionContext: thread.metricSessionContext,
      assistantActiveContext: thread.assistantActiveContext,
    };
    localStorage.setItem(
      getThreadStorageKey(businessId, userId, wizardSessionId),
      JSON.stringify(payload)
    );
  } catch {
    /* quota */
  }
}

export function clearAssistantThread(businessId: string, userId: string, wizardSessionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getThreadStorageKey(businessId, userId, wizardSessionId));
  } catch {
    /* ignore */
  }
}

function formatExportTimestamp(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

export function flattenMessageForExport(msg: PersistedChatMessage): string[] {
  const lines: string[] = [];
  const ts = formatExportTimestamp(msg.createdAt);
  const who = msg.role === 'user' ? 'You' : 'Assistant';
  if (msg.structured?.title) {
    lines.push(`[${ts}] ${who}: ${msg.structured.title}`);
    for (const l of msg.structured.lines ?? []) {
      if (String(l).trim()) lines.push(`  ${l}`);
    }
  } else if (msg.content.trim() && msg.content !== '\u00a0') {
    lines.push(`[${ts}] ${who}: ${msg.content.trim()}`);
  }
  if (msg.cards?.length) {
    lines.push(`  (${msg.cards.length} attached card(s) — open the app to view details.)`);
  }
  if (msg.postCardContent?.trim()) {
    lines.push(`  ${msg.postCardContent.trim()}`);
  }
  if (msg.quickReplies?.length) {
    lines.push(
      `  Suggested replies: ${msg.quickReplies.map((q) => q.label).join(', ')}`
    );
  }
  if (lines.length === 0) {
    lines.push(`[${ts}] ${who}: (message)`);
  }
  return lines;
}

