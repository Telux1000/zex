'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Copy, ImageIcon, Loader2, Mic, Pencil, Send, X } from 'lucide-react';
import {
  emptyInvoiceWizardDraft,
  type AssistantCustomerEditSessionV1,
  type InvoiceAssistantChatCard,
  type InvoiceWizardDraft,
  type InvoiceWizardStep,
  type PendingAssistantCustomer,
  type PendingInvoiceLookup,
  type WizardClientUI,
} from '@/lib/invoices/conversational-invoice-wizard';
import { CountrySelect } from '@/components/location/CountrySelect';
import { detectLikelyCountryCode } from '@/lib/location';
import {
  flattenAssistantStructured,
  type AssistantOpenRecordPayment,
  type AssistantQuickReply,
  type AssistantStructuredBody,
} from '@/lib/invoices/conversational-invoice-wizard/types';
import { PaymentModal } from '@/components/invoices/PaymentModal';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import CustomerFormModal from '@/components/customers/CustomerFormModal';
import type { AssistantInvoicePreviewContext } from '@/components/invoices/assistant-invoice-preview-context';
import { AssistantInvoicePreviewModal } from '@/components/invoices/AssistantInvoicePreviewModal';
import { InvoiceAssistantChatCards } from '@/components/invoices/InvoiceAssistantChatCards';
import type {
  AssistantInvoiceChatOverlay,
  AssistantInvoiceSavedToChatPayload,
} from '@/lib/invoices/assistant-invoice-chat-overlay';
import {
  iterSnapshotsFromCard,
  snapshotFromOverlayFields,
  snapshotsEqual,
  type InvoiceValueSnapshot,
} from '@/lib/invoices/assistant-invoice-chat-baseline';
import {
  buildEffectiveInvoiceCardOverlayById,
  collectInvoiceIdsFromMessages,
  fetchAssistantInvoiceRowsForChat,
  invoiceAnchorMsByIdFromMessages,
  type AssistantInvoiceRehydrateRow,
} from '@/lib/invoices/assistant-invoice-chat-rehydrate';
import {
  ChatMessageMobileActionSheet,
  MobileCopyToast,
} from '@/components/invoices/ChatMessageMobileActionSheet';
import { getChatMessagePlainText } from '@/lib/assistant/chat-message-plaintext';
import { getClientDashboardTimezone } from '@/lib/dashboard/date-range';
import { deriveAssistantActiveWorkflowFromClientState } from '@/lib/business-assistant/assistant-intent-hierarchy';
import { normalizePendingCustomerContextFromUnknown } from '@/lib/business-assistant/assistant-customer-follow-up';
import { ASSISTANT_SUCCESS_CREATED } from '@/lib/business-assistant/assistant-tone';
import { shouldResetDraftForNewInvoiceIntent } from '@/lib/invoices/invoice-chat-intent';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import type { AssistantActiveContextV1 } from '@/lib/business-assistant/claude/assistant-active-context';
import type { AssistantResponseMetaV1 } from '@/lib/business-assistant/claude/assistant-response-meta';
import {
  clearAssistantThread,
  loadAssistantThread,
  loadMessageRetention,
  type MessageRetentionOption,
  pruneMessagesByRetention,
  saveAssistantThread,
  saveMessageRetention,
  type PersistedChatMessage,
} from '@/lib/assistant/conversation-storage';
import {
  clearAssistantThreadFromSupabase,
  loadAssistantThreadFromSupabase,
  mergeAssistantThreads,
  saveAssistantThreadToSupabase,
} from '@/lib/assistant/conversation-sync-supabase';
import { createClient } from '@/lib/supabase/client';
import { downloadPdfFile } from '@/lib/assistant/conversation-export-pdf';
import { useAssistantConversationRegister } from '@/components/assistant/assistant-conversation-context';
import type { AssistantLaunchContext } from '@/lib/assistant/assistant-launch-context';
import { AssistantOpeningContextPanels } from '@/components/invoices/AssistantOpeningContextPanels';
import { sanitizeLegacyAssistantOpeningMessages } from '@/lib/assistant/sanitize-legacy-assistant-opening';
import { parseConversationCommand } from '@/lib/assistant/conversation-commands';
import {
  assistantInvoiceChatTimingEnabled,
  devLogAssistantInvoiceChatPhase,
  devMarkAssistantChatFullContextReady,
  devMarkAssistantChatInputReady,
  devMarkAssistantChatShellVisible,
} from '@/lib/dev/assistant-invoice-chat-timing';

const ASSISTANT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

function readFileAsImagePayload(file: File): Promise<{ base64: string; mime_type: string }> {
  return new Promise((resolve, reject) => {
    if (file.size > ASSISTANT_IMAGE_MAX_BYTES) {
      reject(new Error('Image too large'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      const comma = r.indexOf(',');
      const base64 = comma >= 0 ? r.slice(comma + 1) : r;
      const mime =
        file.type && /^image\/(jpeg|png|webp|gif)$/i.test(file.type) ? file.type : 'image/jpeg';
      resolve({ base64, mime_type: mime });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
import { AssistantRetentionModal } from '@/components/assistant/AssistantRetentionModal';
import { renderAssistantFormattedText } from '@/components/invoices/assistant-formatted-text';
import { cn } from '@/lib/utils/cn';
import { hapticMedium } from '@/lib/ui/haptics';
import type { Customer } from '@/lib/database.types';
import { UpgradePlanModal } from '@/components/billing/UpgradePlanModal';
import { mapApiCodeToUpgradeTrigger, type UpgradeTrigger } from '@/lib/billing/upgrade-modal';

function coerceLegacyWizardStep(step: InvoiceWizardStep | string | null | undefined): InvoiceWizardStep | null {
  if (step == null) return null;
  if (step === 'COLLECT_CUSTOMER_OPTIONALS') return 'COLLECT_NEW_CUSTOMER_PHONE';
  if (step === 'AWAIT_POST_CREATE_CUSTOMER') return 'AWAIT_POST_CREATE_CUSTOMER';
  return step as InvoiceWizardStep;
}

function normalizePendingInvoiceLookupFromServer(raw: unknown): PendingInvoiceLookup | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === 'invoice_ref' && o.subkind === 'view_edit') {
    if (o.intent === 'edit_invoice' || o.intent === 'view_invoice') {
      return { kind: 'invoice_ref', subkind: 'view_edit', intent: o.intent };
    }
    return null;
  }
  if (o.kind === 'invoice_ref' && o.subkind === 'action') {
    const a = o.action;
    if (
      a === 'mark_paid' ||
      a === 'send' ||
      a === 'resend' ||
      a === 'duplicate' ||
      a === 'void'
    ) {
      return { kind: 'invoice_ref', subkind: 'action', action: a };
    }
    return null;
  }
  if (!('kind' in o) && (o.intent === 'edit_invoice' || o.intent === 'view_invoice')) {
    return { kind: 'invoice_ref', subkind: 'view_edit', intent: o.intent };
  }
  return null;
}

type RecordingState = 'idle' | 'recording' | 'uploading';

export type WizardCustomerRow = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  preferred_currency_code: string | null;
};

type CustomerSuggestion = {
  id: string;
  label: string;
  email: string | null;
  currency?: string | null;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  variant?: 'error';
  /** Epoch ms — used for retention & export */
  createdAt: number;
  /** User edited this message in chat. */
  editedAt?: number;
  /** Ephemeral blob URL for a user-attached screenshot; not persisted. */
  imageUrl?: string;
  cards?: InvoiceAssistantChatCard[];
  quickReplies?: AssistantQuickReply[];
  /** Plain title + lines (no markdown); rendered with styled title. */
  structured?: AssistantStructuredBody;
  /** Rendered after cards, before quick replies (e.g. follow-up question). */
  postCardContent?: string;
  assistantResponseMeta?: AssistantResponseMetaV1 | null;
};

type OverdueModalSummary = {
  amountLabel: string;
  countLabel: string;
};

type OverdueModalRow = {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  balance_due: number;
  currency: string | null;
  due_date: string | null;
  status: string | null;
};

function toPersistedChatMessage(msg: ChatMessage): PersistedChatMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    variant: msg.variant,
    createdAt: msg.createdAt,
    ...(msg.editedAt != null ? { editedAt: msg.editedAt } : {}),
    cards: msg.cards,
    quickReplies: msg.quickReplies,
    structured: msg.structured,
    ...(msg.postCardContent?.trim() ? { postCardContent: msg.postCardContent.trim() } : {}),
    assistantResponseMeta: msg.assistantResponseMeta,
  };
}

function lastAssistantResponseMetaFromMessages(
  msgs: readonly ChatMessage[]
): AssistantResponseMetaV1 | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.role === 'assistant' && m.assistantResponseMeta) return m.assistantResponseMeta;
  }
  return null;
}

function parseAssistantStructured(raw: unknown): AssistantStructuredBody | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.lines)) return undefined;
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : undefined;
  return {
    title,
    lines: o.lines.map((x) => String(x)),
  };
}

function formatChatModalDate(isoLike: string | null | undefined): string {
  if (!isoLike) return '—';
  const d = new Date(isoLike);
  if (!Number.isFinite(d.getTime())) return String(isoLike).slice(0, 10) || '—';
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
  } catch {
    return String(isoLike).slice(0, 10) || '—';
  }
}

type Props = {
  businessId: string | null;
  loadBusiness: () => Promise<string | null>;
  wizardSessionId: string;
  companyBaseCurrency: string | null;
  allCustomers: WizardCustomerRow[];
  /** Signed-in user’s first name for the opening greeting. */
  userFirstName?: string | null;
  /** Override root layout (e.g. `h-full min-h-0` when embedded in a modal). */
  rootClassName?: string;
  /**
   * `page` — dedicated Assistant route: taller layout, no duplicate “Assistant” chrome.
   * `embedded` — default (e.g. invoice hub modal).
   */
  variant?: 'embedded' | 'page';
  /** Mobile full-screen chat: flex-1, no card border/radius (paired with parent header). */
  fullBleedChat?: boolean;
  /** Fires when the invoice wizard step changes (for dynamic page titles). */
  onWizardStepChange?: (step: InvoiceWizardStep | null) => void;
  /** Signed-in user id — required for persisted Assistant threads. */
  persistenceUserId?: string | null;
  /** When true, chat history & wizard state persist in localStorage (Assistant page). */
  conversationPersistence?: boolean;
  /**
   * When true with `conversationPersistence`, turns still run through `/api/ai/invoice-wizard`
   * first (extract, match, auto-create) so invoice creation stays deterministic.
   */
  useClaudeAssistant?: boolean;
  /** Entry intent from `/dashboard/assistant?context=` — shapes empty-bootstrap copy on the server. */
  launchContext?: AssistantLaunchContext;
};

export function InvoiceChatWizard({
  businessId,
  loadBusiness,
  wizardSessionId,
  companyBaseCurrency,
  allCustomers,
  userFirstName,
  rootClassName,
  variant = 'embedded',
  fullBleedChat = false,
  onWizardStepChange,
  persistenceUserId = null,
  conversationPersistence = false,
  useClaudeAssistant = false,
  launchContext = 'general',
}: Props) {
  const router = useRouter();
  const { showSuccessToast } = useToasts();
  const threadEndRef = useRef<HTMLDivElement>(null);
  const pendingInvoiceLookupRef = useRef<PendingInvoiceLookup | null>(null);
  const pendingCustomerContextRef = useRef<PendingAssistantCustomer | null>(null);
  const customerEditSessionRef = useRef<AssistantCustomerEditSessionV1 | null>(null);
  const metricSessionContextRef = useRef<AssistantMetricSessionContext | null>(null);
  const assistantActiveContextRef = useRef<AssistantActiveContextV1 | null>(null);
  const assistantLastResponseMetaRef = useRef<AssistantResponseMetaV1 | null>(null);
  const userFirstNameRef = useRef(userFirstName);
  userFirstNameRef.current = userFirstName;
  const confirmIdempotencyRef = useRef<string | null>(null);
  const prevWizardStepRef = useRef<InvoiceWizardStep | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const [composerText, setComposerText] = useState('');
  const [loading, setLoading] = useState(false);
  /** Empty-thread opening POST to `/api/ai/invoice-wizard` — never blocks the composer; UI hint only. */
  const [openingTurnLoading, setOpeningTurnLoading] = useState(false);
  const openingTurnInFlightRef = useRef(false);
  /** Invalidates stale empty-thread opening responses when the user sends first or remote hydration wins. */
  const openingBootstrapGenRef = useRef(0);
  const [wizardDraft, setWizardDraft] = useState<InvoiceWizardDraft>(() => emptyInvoiceWizardDraft());
  const [wizardStep, setWizardStep] = useState<InvoiceWizardStep | null>(null);
  const [wizardClientUi, setWizardClientUi] = useState<WizardClientUI | null>(null);
  const [pendingCountryIso, setPendingCountryIso] = useState('');
  const [customerRequired, setCustomerRequired] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<CustomerSuggestion[]>([]);
  const [customerPrompt, setCustomerPrompt] = useState('');
  const [customerConfidence, setCustomerConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [customerSelectorOpen, setCustomerSelectorOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [successInvoice, setSuccessInvoice] = useState<{
    id: string;
    invoice_number: string | null;
    customer_name: string | null;
    status: string | null;
  } | null>(null);
  const successInvoiceRef = useRef(successInvoice);
  successInvoiceRef.current = successInvoice;
  /** Pending screenshot before send (blob URL + file for upload). */
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [assistantCustomerFormModal, setAssistantCustomerFormModal] = useState<{
    open: boolean;
    businessId: string | null;
    customer: Customer | null;
  }>({ open: false, businessId: null, customer: null });
  const [customerFormOpenTrigger, setCustomerFormOpenTrigger] = useState<string | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<UpgradeTrigger | null>(null);
  const [previewContext, setPreviewContext] = useState<AssistantInvoicePreviewContext | null>(null);
  const [overdueModalOpen, setOverdueModalOpen] = useState(false);
  const [overdueModalLoading, setOverdueModalLoading] = useState(false);
  const [overdueModalRows, setOverdueModalRows] = useState<OverdueModalRow[]>([]);
  const [overdueModalTotalCount, setOverdueModalTotalCount] = useState(0);
  const [overdueModalSummary, setOverdueModalSummary] = useState<OverdueModalSummary | null>(null);
  const [overdueModalError, setOverdueModalError] = useState<string | null>(null);
  /** In-chat Record Payment (assistant mark-paid). */
  const [assistantRecordPaymentModal, setAssistantRecordPaymentModal] =
    useState<AssistantOpenRecordPayment | null>(null);
  /** Fresh invoice fields + “Edited” for chat cards after save from Assistant invoice modal. */
  const [invoiceCardOverlayById, setInvoiceCardOverlayById] = useState<
    Record<string, AssistantInvoiceChatOverlay>
  >({});
  /** First-seen invoice fields from structured chat cards (per message) — for “Edited” vs no-op saves. */
  const invoiceCardBaselineByIdRef = useRef<Record<string, InvoiceValueSnapshot>>({});

  /** Canonical invoice rows for structured cards (survives refresh / navigation). */
  const [invoiceRehydrateById, setInvoiceRehydrateById] = useState<
    Record<string, AssistantInvoiceRehydrateRow>
  >({});

  const invoiceCardAnchorMsById = useMemo(
    () => invoiceAnchorMsByIdFromMessages(messages),
    [messages]
  );

  const effectiveInvoiceOverlayById = useMemo(
    () =>
      buildEffectiveInvoiceCardOverlayById({
        rehydrateById: invoiceRehydrateById,
        sessionOverlayById: invoiceCardOverlayById,
        anchorMsById: invoiceCardAnchorMsById,
      }),
    [invoiceRehydrateById, invoiceCardOverlayById, invoiceCardAnchorMsById]
  );

  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant' || !msg.cards?.length) continue;
      for (const card of msg.cards) {
        for (const { invoiceId, snapshot } of iterSnapshotsFromCard(card)) {
          if (invoiceCardBaselineByIdRef.current[invoiceId] === undefined) {
            invoiceCardBaselineByIdRef.current[invoiceId] = snapshot;
          }
        }
      }
    }
  }, [messages]);

  const handleInvoiceSavedToAssistant = useCallback((payload: AssistantInvoiceSavedToChatPayload) => {
    const { invoiceId, editedAtMs, ...rest } = payload;
    const baseline = invoiceCardBaselineByIdRef.current[invoiceId];
    const saved = snapshotFromOverlayFields(rest);
    const hasBaseline = baseline !== undefined;
    if (hasBaseline && snapshotsEqual(baseline, saved)) {
      return;
    }
    const showEdited = hasBaseline;
    setInvoiceCardOverlayById((prev) => ({
      ...prev,
      [invoiceId]: {
        ...rest,
        ...(showEdited && editedAtMs != null ? { editedAtMs } : {}),
      },
    }));
  }, []);

  const [persistHydrated, setPersistHydrated] = useState(() => !conversationPersistence);

  useEffect(() => {
    if (!conversationPersistence) setPersistHydrated(true);
  }, [conversationPersistence]);
  const storageHadMessagesRef = useRef(false);
  /** After restoring from localStorage, scroll once with `behavior: 'auto'` once bootstrap finishes. */
  const scrollInstantAfterRestoreRef = useRef(false);
  const [retentionPolicy, setRetentionPolicy] = useState<MessageRetentionOption>('off');
  const persistBundleRef = useRef({
    messages: [] as ChatMessage[],
    wizardDraft: emptyInvoiceWizardDraft(),
    wizardStep: null as InvoiceWizardStep | null,
    retentionPolicy: 'off' as MessageRetentionOption,
  });
  persistBundleRef.current = {
    messages,
    wizardDraft,
    wizardStep,
    retentionPolicy,
  };
  const [retentionModalOpen, setRetentionModalOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [actionSheetMessageId, setActionSheetMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [mobileCopyToast, setMobileCopyToast] = useState<string | null>(null);
  /** Below `lg`: which message shows inline Edit/Copy icons (tap message to reveal; tap outside to hide). */
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileCopyToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerConversationMenu = useAssistantConversationRegister();

  const supabaseRef = useRef<ReturnType<typeof createClient>>();
  if (supabaseRef.current === undefined) {
    supabaseRef.current = createClient();
  }

  useEffect(() => {
    if (!businessId) return;
    const ids = collectInvoiceIdsFromMessages(messages);
    if (ids.length === 0) {
      setInvoiceRehydrateById({});
      return;
    }
    let cancelled = false;
    const sb = supabaseRef.current;
    if (!sb) return;
    void fetchAssistantInvoiceRowsForChat(sb, businessId, ids).then((rows) => {
      if (!cancelled) setInvoiceRehydrateById(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [messages, businessId]);

  const flushPersistence = useCallback(() => {
    if (!conversationPersistence || !businessId || !persistenceUserId) return;
    const b = persistBundleRef.current;
    const sb = supabaseRef.current;
    const threadPayload = {
      messages: b.messages.map(toPersistedChatMessage),
      wizardDraft: b.wizardDraft,
      wizardStep: b.wizardStep,
      pendingInvoiceLookup: pendingInvoiceLookupRef.current,
      pendingCustomerContext: pendingCustomerContextRef.current,
      customerEditSession: customerEditSessionRef.current,
      metricSessionContext: metricSessionContextRef.current,
      assistantActiveContext: assistantActiveContextRef.current,
    };
    saveAssistantThread(
      businessId,
      persistenceUserId,
      wizardSessionId,
      threadPayload,
      b.retentionPolicy
    );
    if (sb) {
      void saveAssistantThreadToSupabase(
        sb,
        businessId,
        persistenceUserId,
        wizardSessionId,
        { ...threadPayload, updatedAt: Date.now() },
        b.retentionPolicy
      );
    }
  }, [
    conversationPersistence,
    businessId,
    persistenceUserId,
    wizardSessionId,
  ]);

  const scrollToBottom = useCallback(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, successInvoice, scrollToBottom]);

  useLayoutEffect(() => {
    if (!scrollInstantAfterRestoreRef.current || !persistHydrated) return;
    threadEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
    scrollInstantAfterRestoreRef.current = false;
  }, [messages, persistHydrated]);

  useLayoutEffect(() => {
    if (!assistantInvoiceChatTimingEnabled()) return;
    devMarkAssistantChatShellVisible('invoice_chat_wizard_mount');
  }, []);

  useLayoutEffect(() => {
    if (!assistantInvoiceChatTimingEnabled()) return;
    if (!businessId || !persistHydrated) return;
    devMarkAssistantChatInputReady('composer_enabled');
  }, [businessId, persistHydrated]);

  useEffect(() => {
    if (!assistantInvoiceChatTimingEnabled()) return;
    if (!businessId || !persistHydrated) return;
    if (openingTurnLoading) return;
    devMarkAssistantChatFullContextReady('persist_plus_opening_turn_settled');
  }, [businessId, persistHydrated, openingTurnLoading]);

  useEffect(() => {
    onWizardStepChange?.(wizardStep);
  }, [wizardStep, onWizardStepChange]);

  useEffect(() => {
    if (!editingMessageId) return;
    const id = requestAnimationFrame(() => {
      editTextareaRef.current?.focus();
      editTextareaRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [editingMessageId]);

  useEffect(() => {
    if (!editingMessageId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingMessageId(null);
        setEditingDraft('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingMessageId]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current != null) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyFlashTimeoutRef.current != null) {
        clearTimeout(copyFlashTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mobileCopyToastTimeoutRef.current != null) {
        clearTimeout(mobileCopyToastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (editingMessageId) setActiveMessageId(null);
  }, [editingMessageId]);

  useEffect(() => {
    const isMobileLayout = () =>
      typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;

    const onPointerDown = (e: PointerEvent) => {
      if (!isMobileLayout()) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('[data-mobile-msg-sheet]')) return;
      const anchor = t.closest('[data-msg-anchor]');
      if (anchor) {
        const id = anchor.getAttribute('data-msg-anchor');
        if (id) {
          setActiveMessageId(id);
          setActionSheetMessageId(null);
        }
        return;
      }
      setActiveMessageId(null);
      setActionSheetMessageId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!activeMessageId) return;
    if (!messages.some((m) => m.id === activeMessageId)) {
      setActiveMessageId(null);
    }
  }, [messages, activeMessageId]);

  useEffect(() => {
    if (wizardStep === 'COLLECT_NEW_CUSTOMER_COUNTRY') {
      const fromDraft = (wizardDraft.customerCountry ?? '').trim();
      setPendingCountryIso(fromDraft || detectLikelyCountryCode() || '');
    } else {
      setPendingCountryIso('');
    }
  }, [wizardStep, wizardDraft.customerCountry]);

  function pushAssistantMessage(
    lines: string[],
    opts?: {
      variant?: 'error';
      cards?: InvoiceAssistantChatCard[];
      quickReplies?: AssistantQuickReply[];
      structured?: AssistantStructuredBody;
      /** Joined and shown after cards, before quick replies. */
      postCardLines?: string[];
      assistantResponseMeta?: AssistantResponseMetaV1 | null;
    }
  ) {
    const structured = opts?.structured;
    const content = structured
      ? flattenAssistantStructured(structured).join('\n').trim()
      : lines.filter(Boolean).join('\n').trim();
    const postCardContent =
      opts?.postCardLines?.filter((s) => String(s).trim().length > 0).join('\n\n') ?? '';
    const hasCards = Boolean(opts?.cards?.length);
    const hasQuick = Boolean(opts?.quickReplies?.length);
    const hasStructured = Boolean(
      structured && (Boolean(structured.title?.trim()) || structured.lines.length > 0)
    );
    const hasPostCard = Boolean(postCardContent.trim());
    if (!content && !hasCards && !hasQuick && !hasStructured && !hasPostCard) return;
    const ts = Date.now();
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: content || (hasCards || hasQuick || hasStructured || hasPostCard ? '\u00a0' : ''),
        variant: opts?.variant,
        createdAt: ts,
        cards: opts?.cards,
        quickReplies: opts?.quickReplies,
        structured,
        ...(hasPostCard ? { postCardContent: postCardContent.trim() } : {}),
        assistantResponseMeta: opts?.assistantResponseMeta,
      },
    ]);
  }

  function pushAssistant(lines: string[], variant?: 'error') {
    pushAssistantMessage(lines, { variant });
  }

  const handleAssistantRecordPaymentSuccess = useCallback(
    async ({
      invoice,
      paymentRecordedAt,
    }: {
      invoice?: Record<string, unknown>;
      paymentRecordedAt?: string | null;
    }) => {
      const idRaw = invoice?.id != null ? String(invoice.id).trim() : '';
      if (!idRaw || !businessId) {
        setAssistantRecordPaymentModal(null);
        return;
      }
      const sb = supabaseRef.current;
      let refreshed: AssistantInvoiceRehydrateRow | null = null;
      if (sb) {
        const rows = await fetchAssistantInvoiceRowsForChat(sb, businessId, [idRaw]);
        setInvoiceRehydrateById((prev) => ({ ...prev, ...rows }));
        refreshed = rows[idRaw] ?? null;
      }
      setAssistantRecordPaymentModal(null);
      showSuccessToast('Payment recorded.');
      const invoiceNumberRaw =
        refreshed?.invoice_number ??
        (invoice?.invoice_number != null ? String(invoice.invoice_number).trim() : '');
      const customerNameRaw =
        refreshed?.customer_name ??
        (invoice?.customer_name != null ? String(invoice.customer_name).trim() : '');
      const currencyRaw =
        refreshed?.currency ?? (invoice?.currency != null ? String(invoice.currency).trim() : '');
      const statusRaw =
        refreshed?.status ?? (invoice?.status != null ? String(invoice.status).trim() : '');
      const paidAtRaw =
        typeof paymentRecordedAt === 'string' && paymentRecordedAt.trim().length > 0
          ? paymentRecordedAt.trim()
          : refreshed?.paid_at && String(refreshed.paid_at).trim().length > 0
            ? String(refreshed.paid_at).trim()
            : invoice?.paid_at != null && String(invoice.paid_at).trim().length > 0
              ? String(invoice.paid_at).trim()
          : new Date().toISOString();
      pushAssistantMessage([], {
        cards: [
          {
            card_type: 'invoice_payment_success',
            invoice_id: idRaw,
            invoice_number: invoiceNumberRaw || null,
            customer_name: customerNameRaw || null,
            currency: currencyRaw || null,
            status: statusRaw || 'paid',
            payment_recorded_at: paidAtRaw,
          },
        ],
      });
    },
    [businessId, showSuccessToast]
  );

  function pushUser(text: string, imageUrl?: string) {
    const t = text.trim();
    if (!t && !imageUrl) return;
    const ts = Date.now();
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: t || (imageUrl ? '\u00a0' : ''),
        createdAt: ts,
        ...(imageUrl ? { imageUrl } : {}),
      },
    ]);
  }

  function applyWizardResponse(
    data: Record<string, unknown>,
    options?: { emitChat?: boolean }
  ) {
    const emitChat = options?.emitChat !== false;
    const nextStep = coerceLegacyWizardStep(data.step as string | undefined);
    const invPayload = data.invoice as { id?: string } | null | undefined;
    const createdInvoiceThisTurn =
      invPayload &&
      typeof invPayload === 'object' &&
      typeof invPayload.id === 'string' &&
      Boolean(invPayload.id.trim());
    const postSuccess = successInvoiceRef.current;
    const preservePostSuccessUi =
      Boolean(postSuccess) && !createdInvoiceThisTurn && nextStep !== 'SUCCESS';

    if (data.draft && typeof data.draft === 'object' && !preservePostSuccessUi) {
      setWizardDraft(data.draft as InvoiceWizardDraft);
    }
    if (nextStep && !preservePostSuccessUi) {
      if (nextStep === 'CONFIRM' && prevWizardStepRef.current !== 'CONFIRM') {
        confirmIdempotencyRef.current = crypto.randomUUID();
      }
      if (nextStep === 'SUCCESS') {
        confirmIdempotencyRef.current = null;
        customerEditSessionRef.current = null;
      }
      prevWizardStepRef.current = nextStep;
      setWizardStep(nextStep);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'wizard_client_ui')) {
      const wui = data.wizard_client_ui;
      if (wui && typeof wui === 'object') {
        const u = wui as WizardClientUI;
        const formId = u.open_customer_form?.customer_id?.trim();
        if (formId) {
          setCustomerFormOpenTrigger(formId);
        }
        const { open_customer_form: _ocf, ...rest } = u;
        const wantsCountryUi = rest.country_pick === true || rest.country_modal === true;
        setWizardClientUi(wantsCountryUi ? rest : null);
      } else {
        setWizardClientUi(null);
      }
    } else {
      setWizardClientUi(null);
    }
    const lines = Array.isArray(data.assistant_lines) ? (data.assistant_lines as string[]) : [];
    const err = data.error != null && String(data.error).trim() ? String(data.error) : null;
    let structured = parseAssistantStructured(data.assistant_structured);
    if (err && structured) {
      structured = { title: structured.title, lines: [err, ...structured.lines] };
    }
    const cards =
      Array.isArray(data.chat_cards) && data.chat_cards.length > 0
        ? (data.chat_cards as InvoiceAssistantChatCard[])
        : undefined;

    const quickRepliesRaw = data.quick_replies;
    const quickReplies =
      Array.isArray(quickRepliesRaw) && quickRepliesRaw.length > 0
        ? (quickRepliesRaw as AssistantQuickReply[])
        : undefined;

    const postCardLinesRaw = data.assistant_post_card_lines;
    const postCardLines =
      Array.isArray(postCardLinesRaw) && postCardLinesRaw.length > 0
        ? (postCardLinesRaw as string[])
        : undefined;

    if (Object.prototype.hasOwnProperty.call(data, 'pending_invoice_lookup')) {
      pendingInvoiceLookupRef.current = normalizePendingInvoiceLookupFromServer(
        data.pending_invoice_lookup
      );
    }

    if (Object.prototype.hasOwnProperty.call(data, 'pending_customer_context')) {
      pendingCustomerContextRef.current = normalizePendingCustomerContextFromUnknown(
        data.pending_customer_context
      );
    }

    if (Object.prototype.hasOwnProperty.call(data, 'customer_edit_session')) {
      const ces = data.customer_edit_session;
      if (
        ces &&
        typeof ces === 'object' &&
        typeof (ces as Record<string, unknown>).customer_id === 'string' &&
        String((ces as Record<string, unknown>).customer_id).trim()
      ) {
        customerEditSessionRef.current = {
          customer_id: String((ces as Record<string, unknown>).customer_id).trim(),
          display_name: String((ces as Record<string, unknown>).display_name ?? '').trim(),
        };
      } else {
        customerEditSessionRef.current = null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(data, 'open_record_payment')) {
      const raw = data.open_record_payment;
      if (raw && typeof raw === 'object' && typeof (raw as Record<string, unknown>).invoice_id === 'string') {
        setAssistantRecordPaymentModal(raw as AssistantOpenRecordPayment);
      } else {
        setAssistantRecordPaymentModal(null);
      }
    }

    const clientNav = data.client_navigate as { href?: string } | null | undefined;
    if (clientNav && typeof clientNav.href === 'string' && clientNav.href.trim()) {
      pendingCustomerContextRef.current = null;
      customerEditSessionRef.current = null;
      router.push(clientNav.href.trim());
    }

    if (Object.prototype.hasOwnProperty.call(data, 'metric_session_context')) {
      const msc = data.metric_session_context;
      metricSessionContextRef.current =
        msc && typeof msc === 'object'
          ? (msc as AssistantMetricSessionContext)
          : null;
    }

    if (
      emitChat &&
      (structured ||
        lines.length ||
        err ||
        cards?.length ||
        quickReplies?.length ||
        postCardLines?.length)
    ) {
      pushAssistantMessage(
        structured ? [] : lines.length ? lines : err ? [err] : [],
        {
          variant: err ? 'error' : undefined,
          cards,
          quickReplies,
          structured,
          postCardLines,
        }
      );
    }

    const cm = data.customer_match as {
      suggestions?: CustomerSuggestion[];
      confidence?: string;
      prompt?: string;
    } | null;
    const pending = pendingCustomerContextRef.current;
    const suppressCustomerSearchUi =
      pending?.kind === 'inline_editing' ||
      pending?.kind === 'customer_pick_options' ||
      Boolean(customerEditSessionRef.current?.customer_id?.trim());
    if (
      !preservePostSuccessUi &&
      !suppressCustomerSearchUi &&
      cm &&
      (nextStep === 'CHECK_CUSTOMER' || (cm.suggestions && cm.suggestions.length > 0))
    ) {
      setCustomerRequired(true);
      setCustomerSuggestions(Array.isArray(cm.suggestions) ? cm.suggestions : []);
      setCustomerPrompt(String(cm.prompt || ''));
      setCustomerConfidence((cm.confidence as 'high' | 'medium' | 'low' | undefined) ?? null);
    } else if (
      nextStep &&
      !preservePostSuccessUi &&
      !['CHECK_CUSTOMER', 'GET_CUSTOMER'].includes(nextStep)
    ) {
      setCustomerRequired(false);
      setCustomerSuggestions([]);
    } else if (suppressCustomerSearchUi) {
      setCustomerRequired(false);
      setCustomerSuggestions([]);
      setCustomerPrompt('');
      setCustomerConfidence(null);
    }
  }

  const postWizard = useCallback(
    async (body: Record<string, unknown>) => {
      const bid = businessId ?? (await loadBusiness());
      if (!bid) {
        pushAssistant(['Create a business first to continue.'], 'error');
        return null;
      }
      const res = await fetch('/api/ai/invoice-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: bid,
          session_id: wizardSessionId,
          assistant_launch_context: launchContext,
          pending_invoice_lookup: pendingInvoiceLookupRef.current,
          pending_customer_context: pendingCustomerContextRef.current,
          customer_edit_session: customerEditSessionRef.current,
          metric_session_context: metricSessionContextRef.current,
          workspace_timezone: getClientDashboardTimezone(),
          active_workflow: deriveAssistantActiveWorkflowFromClientState({
            pendingCustomer: pendingCustomerContextRef.current,
            wizardStep,
            successInvoice: Boolean(successInvoice),
          }),
          ...(successInvoice
            ? {
                recent_created_invoice: {
                  invoice_id: successInvoice.id,
                  invoice_number: successInvoice.invoice_number,
                  customer_name: successInvoice.customer_name,
                  status: successInvoice.status,
                },
              }
            : {}),
          ...body,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const trigger = mapApiCodeToUpgradeTrigger(typeof data?.code === 'string' ? data.code : null);
        if (trigger) setUpgradeModal(trigger);
      }
      return { res, data, bid };
    },
    [businessId, loadBusiness, wizardSessionId, wizardStep, successInvoice, launchContext]
  );

  /** Always latest `postWizard` for one-shot bootstrap — must NOT be a bootstrap effect dep (wizardStep changes each turn). */
  const postWizardRef = useRef(postWizard);
  postWizardRef.current = postWizard;

  const commitUserMessageEdit = useCallback(
    async (messageId: string, newTextRaw: string) => {
      const trimmed = newTextRaw.trim();
      if (!trimmed || loading || successInvoice) return;

      const idx = messagesRef.current.findIndex((m) => m.id === messageId);
      if (idx < 0) return;
      const target = messagesRef.current[idx]!;
      if (target.role !== 'user') return;

      const prefix = messagesRef.current.slice(0, idx);
      const nextMsg: ChatMessage = {
        ...target,
        content: trimmed,
        editedAt: Date.now(),
      };
      // Keep [0..i-1] unchanged (user + assistant), replace user at i, drop everything after i.
      const truncated = [...prefix, nextMsg];
      const userTurns = truncated
        .filter((m) => m.role === 'user')
        .map((m) => m.content.trim())
        .filter(Boolean);

      setEditingMessageId(null);
      setEditingDraft('');
      setActionSheetMessageId(null);
      setActiveMessageId(null);
      setMessages(truncated);
      setSuccessInvoice(null);
      confirmIdempotencyRef.current = null;

      pendingInvoiceLookupRef.current = null;
      pendingCustomerContextRef.current = null;
      customerEditSessionRef.current = null;
      metricSessionContextRef.current = null;
      assistantActiveContextRef.current = null;
      assistantLastResponseMetaRef.current = lastAssistantResponseMetaFromMessages(
        truncated.filter((m) => m.role === 'assistant')
      );

      setCustomerRequired(false);
      setCustomerSuggestions([]);
      setCustomerPrompt('');
      setCustomerConfidence(null);

      setLoading(true);
      try {
        const resetResult = await postWizard({
          draft: emptyInvoiceWizardDraft(),
          action: { type: 'reset' },
        });
        if (!resetResult) return;
        const { res, data } = resetResult;
        if (!res.ok) {
          if (data?.draft && typeof data.draft === 'object') {
            applyWizardResponse(data, { emitChat: false });
          }
          pushAssistant(['Could not rewind the wizard after your edit. Try again.'], 'error');
          return;
        }
        applyWizardResponse(data, { emitChat: false });
        let draft = (data.draft as InvoiceWizardDraft) ?? emptyInvoiceWizardDraft();

        for (let i = 0; i < userTurns.length; i++) {
          const isLastReplayTurn = i === userTurns.length - 1;
          const turnResult = await postWizard({ draft, user_text: userTurns[i] });
          if (!turnResult) return;
          const { res: r2, data: d2 } = turnResult;
          draft = (d2?.draft as InvoiceWizardDraft) ?? draft;
          if (!r2.ok) {
            applyWizardResponse(d2, { emitChat: true });
            const missing = Array.isArray(d2?.missing_fields) ? (d2.missing_fields as string[]) : [];
            if (missing.includes('customer')) setCustomerRequired(true);
            return;
          }
          // Only the final user turn may append an assistant bubble; earlier turns sync wizard state silently.
          applyWizardResponse(d2, { emitChat: isLastReplayTurn });
        }
        setComposerText('');
      } catch (e) {
        pushAssistant(
          [e instanceof Error && e.message ? e.message : 'Could not apply your edit. Try again.'],
          'error'
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, successInvoice, postWizard]
  );

  const copyChatMessage = useCallback(
    async (msg: ChatMessage, opts?: { fromActionSheet?: boolean }) => {
      try {
        await navigator.clipboard.writeText(getChatMessagePlainText(msg));
        if (copyFlashTimeoutRef.current != null) {
          clearTimeout(copyFlashTimeoutRef.current);
        }
        setCopiedMessageId(msg.id);
        copyFlashTimeoutRef.current = setTimeout(() => {
          copyFlashTimeoutRef.current = null;
          setCopiedMessageId(null);
        }, 1000);
        if (opts?.fromActionSheet) {
          if (mobileCopyToastTimeoutRef.current != null) {
            clearTimeout(mobileCopyToastTimeoutRef.current);
          }
          setMobileCopyToast('Copied');
          mobileCopyToastTimeoutRef.current = setTimeout(() => {
            mobileCopyToastTimeoutRef.current = null;
            setMobileCopyToast(null);
          }, 1300);
        }
      } catch {
        // Clipboard may be unavailable (non-secure context / permission).
      }
      setActionSheetMessageId(null);
    },
    []
  );

  const cancelLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  /** Below `lg`, inline actions are hidden; ~550ms long-press on the bubble opens the mobile action sheet. */
  const handleMessageTouchStart = useCallback(
    (msg: ChatMessage) => {
      if (editingMessageId || loading) return;
      cancelLongPressTimer();
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        hapticMedium();
        setActiveMessageId(null);
        setActionSheetMessageId(msg.id);
      }, 550);
    },
    [editingMessageId, loading, cancelLongPressTimer]
  );

  const handleMessageTouchEndOrCancel = useCallback(() => {
    cancelLongPressTimer();
  }, [cancelLongPressTimer]);

  const startCustomerInlineEdit = useCallback(
    async (customerId: string) => {
      if (loading || successInvoice) return;
      setLoading(true);
      try {
        const result = await postWizard({
          draft: wizardDraft,
          action: { type: 'start_customer_inline_edit', customer_id: customerId },
        });
        if (!result) return;
        const { res, data } = result;
        if (!res.ok) {
          if (data?.draft && typeof data.draft === 'object') {
            applyWizardResponse(data);
          } else {
            pushAssistant(['Could not start in-chat customer edit.'], 'error');
          }
          return;
        }
        applyWizardResponse(data);
      } finally {
        setLoading(false);
      }
    },
    [loading, successInvoice, postWizard, wizardDraft]
  );

  const openCustomerFormFromAssistant = useCallback(
    async (customerId: string) => {
      const bid = businessId ?? (await loadBusiness());
      if (!bid) {
        pushAssistant(['Create a business first to continue.'], 'error');
        return;
      }
      const sb = supabaseRef.current;
      if (!sb) return;
      const { data, error } = await sb
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .eq('business_id', bid)
        .maybeSingle();
      if (error || !data) {
        pushAssistant(['Could not open the customer form.'], 'error');
        return;
      }
      setAssistantCustomerFormModal({
        open: true,
        businessId: bid,
        customer: data as Customer,
      });
    },
    [businessId, loadBusiness]
  );

  useEffect(() => {
    if (!customerFormOpenTrigger) return;
    const id = customerFormOpenTrigger;
    setCustomerFormOpenTrigger(null);
    void openCustomerFormFromAssistant(id);
  }, [customerFormOpenTrigger, openCustomerFormFromAssistant]);

  const openOverdueModalFromInsightCard = useCallback(
    (card: Extract<InvoiceAssistantChatCard, { card_type: 'insight_summary' }>): boolean => {
      if (card.cta?.href !== '/dashboard/invoices?status=overdue') return false;
      const amountLabel = card.rows.find((r) => r.label.toLowerCase() === 'amount')?.value ?? '—';
      const countLabel =
        card.rows.find((r) => r.label.toLowerCase() === 'invoices counted')?.value ?? '0';
      setOverdueModalSummary({ amountLabel, countLabel });
      setOverdueModalError(null);
      setOverdueModalOpen(true);
      return true;
    },
    []
  );

  useEffect(() => {
    if (!overdueModalOpen) return;
    let cancelled = false;
    void (async () => {
      setOverdueModalLoading(true);
      setOverdueModalError(null);
      try {
        const bid = businessId ?? (await loadBusiness());
        if (!bid) throw new Error('Missing business');
        const params = new URLSearchParams({
          business_id: bid,
          status: 'overdue',
          page: '1',
          page_size: '50',
        });
        const res = await fetch(`/api/invoices?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(String(data?.error || 'Could not load overdue invoices'));
        const rows = Array.isArray(data?.invoices) ? (data.invoices as Record<string, unknown>[]) : [];
        if (cancelled) return;
        setOverdueModalRows(
          rows.map((r) => ({
            id: String(r.id ?? ''),
            invoice_number: r.invoice_number != null ? String(r.invoice_number) : null,
            customer_name: r.customer_name != null ? String(r.customer_name) : null,
            balance_due: Number(r.balance_due ?? 0),
            currency: r.currency != null ? String(r.currency) : null,
            due_date: r.due_date != null ? String(r.due_date) : null,
            status: r.status != null ? String(r.status) : null,
          }))
        );
        setOverdueModalTotalCount(Number(data?.totalCount ?? 0));
      } catch (e) {
        if (!cancelled) {
          setOverdueModalRows([]);
          setOverdueModalTotalCount(0);
          setOverdueModalError(e instanceof Error ? e.message : 'Could not load overdue invoices');
        }
      } finally {
        if (!cancelled) setOverdueModalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [overdueModalOpen, businessId, loadBusiness]);

  async function applyCountryFromPicker() {
    if (loading || successInvoice) return;
    const code = pendingCountryIso.trim().toUpperCase();
    if (code.length !== 2) return;
    setLoading(true);
    try {
      const result = await postWizard({
        draft: wizardDraft,
        action: { type: 'apply_country', country_code: code },
      });
      if (!result) return;
      const { res, data } = result;
      if (!res.ok) {
        if (data?.draft && typeof data.draft === 'object') {
          applyWizardResponse(data);
        } else {
          pushAssistant(['Could not save country'], 'error');
        }
        return;
      }
      applyWizardResponse(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!conversationPersistence) {
      setPersistHydrated(true);
      return;
    }
    if (!businessId || !persistenceUserId) {
      setPersistHydrated(true);
      return;
    }
    let cancelled = false;
    const sb = supabaseRef.current;

    const applyMerged = (
      merged: NonNullable<ReturnType<typeof mergeAssistantThreads>['merged']>,
      migrateLocalToServer: boolean,
      retention: MessageRetentionOption
    ) => {
      const cleanedMessages = sanitizeLegacyAssistantOpeningMessages(merged.messages);
      storageHadMessagesRef.current = cleanedMessages.length > 0;
      if (cleanedMessages.length > 0) {
        scrollInstantAfterRestoreRef.current = true;
        const restored = cleanedMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          variant: m.variant,
          createdAt: m.createdAt ?? Date.now(),
          editedAt: m.editedAt,
          cards: m.cards,
          quickReplies: m.quickReplies,
          structured: m.structured,
          postCardContent: m.postCardContent,
          assistantResponseMeta: m.assistantResponseMeta,
        }));
        setMessages(restored);
        assistantLastResponseMetaRef.current = lastAssistantResponseMetaFromMessages(restored);
      }
      setWizardDraft(merged.wizardDraft ?? emptyInvoiceWizardDraft());
      setWizardStep(coerceLegacyWizardStep(merged.wizardStep ?? null));
      pendingInvoiceLookupRef.current = merged.pendingInvoiceLookup ?? null;
      pendingCustomerContextRef.current = merged.pendingCustomerContext ?? null;
      customerEditSessionRef.current = merged.customerEditSession ?? null;
      metricSessionContextRef.current = merged.metricSessionContext ?? null;
      assistantActiveContextRef.current = merged.assistantActiveContext ?? null;

      saveAssistantThread(
        businessId,
        persistenceUserId,
        wizardSessionId,
        {
          messages: cleanedMessages,
          wizardDraft: merged.wizardDraft,
          wizardStep: merged.wizardStep,
          pendingInvoiceLookup: merged.pendingInvoiceLookup,
          pendingCustomerContext: merged.pendingCustomerContext,
          customerEditSession: merged.customerEditSession,
          metricSessionContext: merged.metricSessionContext,
          assistantActiveContext: merged.assistantActiveContext,
        },
        retention
      );

      if (migrateLocalToServer && sb) {
        void saveAssistantThreadToSupabase(
          sb,
          businessId,
          persistenceUserId,
          wizardSessionId,
          {
            messages: cleanedMessages,
            wizardDraft: merged.wizardDraft,
            wizardStep: merged.wizardStep,
            pendingInvoiceLookup: merged.pendingInvoiceLookup,
            metricSessionContext: merged.metricSessionContext,
            assistantActiveContext: merged.assistantActiveContext,
            updatedAt: merged.updatedAt,
          },
          retention
        );
      }
    };

    const retention = loadMessageRetention(businessId, persistenceUserId);
    setRetentionPolicy(retention);

    const local = loadAssistantThread(businessId, persistenceUserId, wizardSessionId, retention);
    const { merged: localMerged, migrateLocalToServer: localMigrate } = mergeAssistantThreads(null, local);

    if (localMerged) {
      applyMerged(localMerged, localMigrate, retention);
    } else {
      storageHadMessagesRef.current = false;
    }

    if (!cancelled) setPersistHydrated(true);

    if (sb) {
      void (async () => {
        const remote = await loadAssistantThreadFromSupabase(
          sb,
          businessId,
          persistenceUserId,
          wizardSessionId,
          retention
        );
        if (cancelled) return;
        if (messagesRef.current.some((m) => m.role === 'user')) {
          devLogAssistantInvoiceChatPhase('remote_thread_skipped_has_user_turn', {});
          return;
        }
        if (!remote) return;
        const local2 = loadAssistantThread(businessId, persistenceUserId, wizardSessionId, retention);
        const { merged, migrateLocalToServer } = mergeAssistantThreads(remote, local2);
        if (!merged || cancelled) return;
        const cleanedRemote = sanitizeLegacyAssistantOpeningMessages(merged.messages);
        if (cleanedRemote.length > 0) {
          openingBootstrapGenRef.current += 1;
        }
        applyMerged(merged, migrateLocalToServer, retention);
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [conversationPersistence, businessId, persistenceUserId, wizardSessionId]);

  useEffect(() => {
    if (!persistHydrated || !businessId) return;
    /** Thread already has content — never re-run empty bootstrap (avoids duplicate greeting when deps change). */
    if (messagesRef.current.length > 0) {
      setOpeningTurnLoading(false);
      return;
    }
    let cancelled = false;
    const myGen = ++openingBootstrapGenRef.current;
    openingTurnInFlightRef.current = true;
    setOpeningTurnLoading(true);
    void (async () => {
      try {
        const result = await postWizardRef.current({ draft: emptyInvoiceWizardDraft() });
        if (cancelled) return;
        if (myGen !== openingBootstrapGenRef.current) return;
        if (messagesRef.current.some((m) => m.role === 'user')) return;
        if (!result) {
          return;
        }
        const { res, data } = result;
        if (cancelled) return;
        if (myGen !== openingBootstrapGenRef.current) return;
        if (!res.ok) {
          if (data?.draft && typeof data.draft === 'object') {
            applyWizardResponse(data);
          } else {
            pushAssistant(
              [
                typeof data?.error === 'string'
                  ? data.error
                  : 'Could not start the assistant.',
              ],
              'error'
            );
          }
          return;
        }
        if (cancelled) return;
        if (myGen !== openingBootstrapGenRef.current) return;
        /** Restored thread, or messages added before this async finished — do not inject greeting / server echo. */
        const suppressBootstrapChat =
          storageHadMessagesRef.current || messagesRef.current.length > 0;
        applyWizardResponse(data, { emitChat: !suppressBootstrapChat });
        const als = Array.isArray(data.assistant_lines) ? (data.assistant_lines as string[]) : [];
        const bootErr = data.error != null && String(data.error).trim() ? String(data.error) : null;
        if (!suppressBootstrapChat && !bootErr && als.length === 0) {
          const fn = userFirstNameRef.current?.trim();
          const g = fn
            ? `Hi ${fn}. I can help you with invoices, customers, and more.`
            : 'Hi. I can help you with invoices, customers, and more.';
          pushAssistantMessage([g]);
        }
      } catch {
        if (!cancelled && myGen === openingBootstrapGenRef.current) {
          pushAssistant(['Could not start the assistant.'], 'error');
        }
      } finally {
        openingTurnInFlightRef.current = false;
        if (!cancelled) setOpeningTurnLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally omit `postWizard` — it changes every wizard step and would retrigger bootstrap + greeting.
  }, [persistHydrated, businessId, wizardSessionId, launchContext]);

  useEffect(() => {
    if (!conversationPersistence || !businessId || !persistenceUserId || !persistHydrated) return;
    const h = window.setTimeout(() => {
      flushPersistence();
    }, 0);
    return () => window.clearTimeout(h);
  }, [
    conversationPersistence,
    businessId,
    persistenceUserId,
    wizardSessionId,
    messages,
    wizardDraft,
    wizardStep,
    retentionPolicy,
    persistHydrated,
    flushPersistence,
  ]);

  useEffect(() => {
    if (!conversationPersistence || !businessId || !persistenceUserId || !persistHydrated) return;

    const onPageHide = () => flushPersistence();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPersistence();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flushPersistence();
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [
    conversationPersistence,
    businessId,
    persistenceUserId,
    wizardSessionId,
    persistHydrated,
    flushPersistence,
  ]);

  useEffect(() => {
    if (!registerConversationMenu || !conversationPersistence) return;
    registerConversationMenu({
      clearConversation: () => setClearConfirmOpen(true),
      exportConversation: () => {
        void (async () => {
          try {
            const { buildConversationPdfBytes } = await import('@/lib/assistant/conversation-export-pdf');
            const bytes = await buildConversationPdfBytes(
              messages.map(toPersistedChatMessage),
              'Zenzex Assistant conversation'
            );
            downloadPdfFile(
              `zenzex-assistant-${new Date().toISOString().slice(0, 10)}.pdf`,
              bytes
            );
          } catch {
            pushAssistant(['Could not create the PDF. Try again or use a shorter conversation.'], 'error');
          }
        })();
      },
      openRetentionModal: () => setRetentionModalOpen(true),
      disabled: loading,
    });
    return () => registerConversationMenu(null);
  }, [registerConversationMenu, conversationPersistence, loading, messages]);

  async function runWizardSend(userText: string, extra?: Record<string, unknown>) {
    const trimmed = userText.trim();
    const assistantImage = extra?.assistant_image as
      | { base64: string; mime_type: string }
      | undefined;
    if (successInvoice) {
      if (!trimmed && !assistantImage) return;
    } else if (!trimmed && !assistantImage && wizardStep !== 'CONFIRM') {
      return;
    }
    if (wizardStep === 'CONFIRM' && !trimmed && !confirmIdempotencyRef.current) {
      confirmIdempotencyRef.current = crypto.randomUUID();
    }

    if (openingTurnInFlightRef.current) {
      openingBootstrapGenRef.current += 1;
    }

    setLoading(true);
    try {
      if (
        useClaudeAssistant &&
        conversationPersistence &&
        (trimmed || assistantImage) &&
        wizardStep !== 'CONFIRM' &&
        !successInvoice
      ) {
        const bid = businessId ?? (await loadBusiness());
        if (!bid) {
          pushAssistant(['Create a business first to continue.'], 'error');
          return;
        }
        const wf = await postWizard({
          draft: wizardDraft,
          ...(trimmed ? { user_text: trimmed } : {}),
          ...(assistantImage ? { assistant_image: assistantImage } : {}),
        });
        if (!wf) return;
        const { res, data, bid: wfBid } = wf;
        if (!res.ok) {
          if (data?.draft && typeof data.draft === 'object') {
            applyWizardResponse(data);
          } else {
            pushAssistant([typeof data?.error === 'string' ? data.error : 'Request failed'], 'error');
          }
          const missing = Array.isArray(data?.missing_fields) ? (data.missing_fields as string[]) : [];
          if (missing.includes('customer')) setCustomerRequired(true);
          setComposerText('');
          return;
        }
        const nextStep = data.step as InvoiceWizardStep | undefined;
        if (nextStep === 'SUCCESS' && data.invoice && typeof data.invoice === 'object') {
          const inv = data.invoice as {
            id?: string;
            invoice_number?: string | null;
            customer_name?: string | null;
            status?: string | null;
          };
          if (inv.id) {
            if (data.draft && typeof data.draft === 'object') {
              setWizardDraft(data.draft as InvoiceWizardDraft);
            }
            setWizardStep('SUCCESS');
            setSuccessInvoice({
              id: String(inv.id),
              invoice_number: inv.invoice_number != null ? String(inv.invoice_number) : null,
              customer_name: inv.customer_name != null ? String(inv.customer_name) : null,
              status: inv.status != null ? String(inv.status) : null,
            });
            const rawLines = Array.isArray(data.assistant_lines) ? (data.assistant_lines as string[]) : [];
            const cards =
              Array.isArray(data.chat_cards) && data.chat_cards.length > 0
                ? (data.chat_cards as InvoiceAssistantChatCard[])
                : undefined;
            const hasCreatedCard = cards?.some((c) => c.card_type === 'invoice_created_success');
            const lines = hasCreatedCard
              ? rawLines.filter((l) => l.trim() !== ASSISTANT_SUCCESS_CREATED.trim())
              : rawLines;
            const quickRepliesRaw = data.quick_replies;
            const quickReplies =
              Array.isArray(quickRepliesRaw) && quickRepliesRaw.length > 0
                ? (quickRepliesRaw as AssistantQuickReply[])
                : undefined;
            pushAssistantMessage(lines.length ? lines : hasCreatedCard ? [] : [ASSISTANT_SUCCESS_CREATED], {
              cards,
              quickReplies,
            });
            setComposerText('');
            return;
          }
        }
        applyWizardResponse(data);
        setComposerText('');
        return;
      }

      const payload: Record<string, unknown> = { draft: wizardDraft, ...extra };
      if (trimmed) payload.user_text = trimmed;
      if (wizardStep === 'CONFIRM' && !trimmed) {
        payload.action = {
          type: 'confirm_create',
          idempotency_key: confirmIdempotencyRef.current!,
        };
      }
      const result = await postWizard(payload);
      if (!result) return;
      const { res, data, bid } = result;

      if (!res.ok) {
        if (data?.draft && typeof data.draft === 'object') {
          applyWizardResponse(data);
        } else {
          pushAssistant([typeof data?.error === 'string' ? data.error : 'Request failed'], 'error');
        }
        const missing = Array.isArray(data?.missing_fields)
          ? (data.missing_fields as string[])
          : [];
        if (missing.includes('customer')) setCustomerRequired(true);
        return;
      }

      const nextStep = data.step as InvoiceWizardStep | undefined;
      if (nextStep === 'SUCCESS' && data.invoice && typeof data.invoice === 'object') {
        const inv = data.invoice as {
          id?: string;
          invoice_number?: string | null;
          customer_name?: string | null;
          status?: string | null;
        };
        if (inv.id) {
          if (data.draft && typeof data.draft === 'object') {
            setWizardDraft(data.draft as InvoiceWizardDraft);
          }
          setWizardStep('SUCCESS');
          setSuccessInvoice({
            id: String(inv.id),
            invoice_number: inv.invoice_number != null ? String(inv.invoice_number) : null,
            customer_name: inv.customer_name != null ? String(inv.customer_name) : null,
            status: inv.status != null ? String(inv.status) : null,
          });
          const rawLines = Array.isArray(data.assistant_lines) ? (data.assistant_lines as string[]) : [];
          const cards =
            Array.isArray(data.chat_cards) && data.chat_cards.length > 0
              ? (data.chat_cards as InvoiceAssistantChatCard[])
              : undefined;
          const hasCreatedCard = cards?.some((c) => c.card_type === 'invoice_created_success');
          const lines = hasCreatedCard
            ? rawLines.filter((l) => l.trim() !== ASSISTANT_SUCCESS_CREATED.trim())
            : rawLines;
          const quickRepliesRaw = data.quick_replies;
          const quickReplies =
            Array.isArray(quickRepliesRaw) && quickRepliesRaw.length > 0
              ? (quickRepliesRaw as AssistantQuickReply[])
              : undefined;
          pushAssistantMessage(lines.length ? lines : hasCreatedCard ? [] : [ASSISTANT_SUCCESS_CREATED], {
            cards,
            quickReplies,
          });
          return;
        }
      }

      applyWizardResponse(data);
      if (trimmed) setComposerText('');
    } catch (e) {
      pushAssistant(
        [e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.'],
        'error'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleAssistantImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      pushAssistant(['Please choose an image (JPEG, PNG, WebP, or GIF).'], 'error');
      return;
    }
    if (f.size > ASSISTANT_IMAGE_MAX_BYTES) {
      pushAssistant(['Image is too large. Maximum size is 4 MB.'], 'error');
      return;
    }
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file: f, previewUrl: URL.createObjectURL(f) };
    });
  }

  function clearPendingImage() {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  async function onSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (loading || !persistHydrated) return;
    const t = composerText.trim();
    const hasPending = Boolean(pendingImage);

    if (t && successInvoice && shouldResetDraftForNewInvoiceIntent(t)) {
      setSuccessInvoice(null);
    }

    if (t) {
      const cmd = parseConversationCommand(t);
      if (cmd?.kind === 'clear_chat') {
        setComposerText('');
        setClearConfirmOpen(true);
        return;
      }
    }

    if (!t && !hasPending && wizardStep !== 'CONFIRM') return;

    if (wizardStep === 'CONFIRM') {
      if (pendingImage) {
        URL.revokeObjectURL(pendingImage.previewUrl);
        setPendingImage(null);
      }
      if (t) pushUser(t);
      else pushUser('Create draft invoice');
      await runWizardSend(t);
      return;
    }

    let imagePayload: { base64: string; mime_type: string } | undefined;
    let previewUrl: string | undefined;
    if (pendingImage) {
      previewUrl = pendingImage.previewUrl;
      try {
        imagePayload = await readFileAsImagePayload(pendingImage.file);
      } catch {
        pushAssistant(['Could not read the image. Try another file.'], 'error');
        return;
      }
      setPendingImage(null);
    }

    if (t) pushUser(t, previewUrl);
    else if (previewUrl) pushUser('', previewUrl);

    await runWizardSend(t, imagePayload ? { assistant_image: imagePayload } : undefined);
  }

  async function selectCustomer(c: WizardCustomerRow) {
    if (loading || successInvoice) return;
    pushUser(String(c.company || c.name || 'Selected customer'));
    setCustomerSelectorOpen(false);
    setLoading(true);
    try {
      const result = await postWizard({
        draft: wizardDraft,
        action: { type: 'select_customer', customer_id: c.id },
      });
      if (!result) return;
      const { res, data } = result;
      if (!res.ok) {
        if (data?.draft && typeof data.draft === 'object') {
          applyWizardResponse(data);
        } else {
          pushAssistant([typeof data?.error === 'string' ? data.error : 'Request failed'], 'error');
        }
        return;
      }
      applyWizardResponse(data);
    } finally {
      setLoading(false);
    }
  }

  async function markNewCustomer() {
    if (loading || successInvoice) return;
    pushUser('New customer');
    setLoading(true);
    try {
      const result = await postWizard({
        draft: wizardDraft,
        action: { type: 'mark_new_customer' },
      });
      if (!result) return;
      const { res, data } = result;
      if (!res.ok) {
        if (data?.draft && typeof data.draft === 'object') {
          applyWizardResponse(data);
        } else {
          pushAssistant([typeof data?.error === 'string' ? data.error : 'Request failed'], 'error');
        }
        return;
      }
      applyWizardResponse(data);
    } finally {
      setLoading(false);
    }
  }

  async function resetWizard() {
    if (loading) return;
    if (copyFlashTimeoutRef.current != null) {
      clearTimeout(copyFlashTimeoutRef.current);
      copyFlashTimeoutRef.current = null;
    }
    if (mobileCopyToastTimeoutRef.current != null) {
      clearTimeout(mobileCopyToastTimeoutRef.current);
      mobileCopyToastTimeoutRef.current = null;
    }
    setCopiedMessageId(null);
    setMobileCopyToast(null);
    setActiveMessageId(null);
    setSuccessInvoice(null);
    pendingInvoiceLookupRef.current = null;
    pendingCustomerContextRef.current = null;
    customerEditSessionRef.current = null;
    metricSessionContextRef.current = null;
    assistantActiveContextRef.current = null;
    assistantLastResponseMetaRef.current = null;
    setWizardDraft(emptyInvoiceWizardDraft());
    setWizardStep(null);
    setCustomerRequired(false);
    setCustomerSuggestions([]);
    setCustomerPrompt('');
    setCustomerConfidence(null);
    setCustomerSelectorOpen(false);
    setComposerText('');
    const kickoff = 'create invoice';
    pushUser('Create another invoice');
    await runWizardSend(kickoff);
  }

  function handleRetentionChange(opt: MessageRetentionOption) {
    setRetentionPolicy(opt);
    if (businessId && persistenceUserId) {
      saveMessageRetention(businessId, persistenceUserId, opt);
      setMessages((prev) => {
        const pruned = pruneMessagesByRetention(
          prev.map(toPersistedChatMessage),
          opt,
          Date.now()
        );
        return pruned.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          variant: m.variant,
          createdAt: m.createdAt,
          editedAt: m.editedAt,
          cards: m.cards,
          quickReplies: m.quickReplies,
          structured: m.structured,
          assistantResponseMeta: m.assistantResponseMeta,
        }));
      });
    }
  }

  async function confirmClearConversation() {
    setClearConfirmOpen(false);
    storageHadMessagesRef.current = false;
    if (copyFlashTimeoutRef.current != null) {
      clearTimeout(copyFlashTimeoutRef.current);
      copyFlashTimeoutRef.current = null;
    }
    if (mobileCopyToastTimeoutRef.current != null) {
      clearTimeout(mobileCopyToastTimeoutRef.current);
      mobileCopyToastTimeoutRef.current = null;
    }
    setCopiedMessageId(null);
    setMobileCopyToast(null);
    setActiveMessageId(null);
    setSuccessInvoice(null);
    pendingInvoiceLookupRef.current = null;
    pendingCustomerContextRef.current = null;
    customerEditSessionRef.current = null;
    metricSessionContextRef.current = null;
    assistantActiveContextRef.current = null;
    assistantLastResponseMetaRef.current = null;
    setInvoiceCardOverlayById({});
    setInvoiceRehydrateById({});
    invoiceCardBaselineByIdRef.current = {};
    setMessages([]);
    if (conversationPersistence && businessId && persistenceUserId) {
      clearAssistantThread(businessId, persistenceUserId, wizardSessionId);
      const sb = supabaseRef.current;
      if (sb) void clearAssistantThreadFromSupabase(sb, businessId, persistenceUserId, wizardSessionId);
    }
    setComposerText('');
    setLoading(true);
    try {
      const result = await postWizard({ draft: emptyInvoiceWizardDraft(), action: { type: 'reset' } });
      if (!result) return;
      const { res, data } = result;
      if (res.ok) {
        applyWizardResponse(data, { emitChat: false });
      } else if (data?.draft && typeof data.draft === 'object') {
        applyWizardResponse(data, { emitChat: false });
      } else {
        pushAssistant(['Could not clear the conversation. Try again.'], 'error');
        return;
      }
      const fn = userFirstNameRef.current?.trim();
      pushAssistantMessage([
        fn
          ? `Hi ${fn}. I can help you with invoices, customers, and more.`
          : 'Hi. I can help you with invoices, customers, and more.',
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function startVoiceRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        pushAssistant(['Microphone is not supported in this browser.'], 'error');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mediaRecorder.onstop = async () => {
        setRecordingState('uploading');
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const file = new File([blob], 'invoice-recording.webm', { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/voice-invoice', { method: 'POST', body: formData });
          const data = await res.json().catch(() => null);
          const trigger = mapApiCodeToUpgradeTrigger(typeof data?.code === 'string' ? data.code : null);
          if (trigger) setUpgradeModal(trigger);
          if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
          if (data?.transcript) setComposerText((prev) => (prev ? `${prev}\n${data.transcript}` : data.transcript));
        } catch (err) {
          pushAssistant(
            [err instanceof Error ? err.message : 'Could not transcribe audio.'],
            'error'
          );
        } finally {
          setRecordingState('idle');
          stream.getTracks().forEach((t) => t.stop());
        }
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecordingState('recording');
    } catch {
      pushAssistant(['Could not access the microphone.'], 'error');
      setRecordingState('idle');
    }
  }

  function stopVoiceRecording() {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  const effectiveSuggestions: WizardCustomerRow[] = (() => {
    const merged = [...allCustomers];
    for (const s of customerSuggestions) {
      if (!merged.some((c) => c.id === s.id)) {
        merged.push({
          id: s.id,
          name: s.label || null,
          company: s.label || null,
          email: s.email || null,
          preferred_currency_code: s.currency ?? null,
        });
      }
    }
    const q = customerQuery.trim().toLowerCase();
    if (!q) return merged.slice(0, 12);
    return merged
      .filter((c) => {
        const label = String(c.company || c.name || '').toLowerCase();
        return label.includes(q) || String(c.email || '').toLowerCase().includes(q);
      })
      .slice(0, 12);
  })();

  const showConfirmChip = wizardStep === 'CONFIRM' && !successInvoice;
  const showCustomerChips =
    wizardStep === 'CHECK_CUSTOMER' && customerRequired && customerSuggestions.length > 0 && !successInvoice;
  const showNewCustomerChip =
    wizardStep === 'CHECK_CUSTOMER' && customerRequired && !successInvoice;
  const showSkipOnboardingChip =
    !successInvoice &&
    wizardStep !== 'AWAIT_POST_CREATE_CUSTOMER' &&
    (wizardStep === 'COLLECT_NEW_CUSTOMER_PHONE' ||
      wizardStep === 'COLLECT_NEW_CUSTOMER_CONTACT' ||
      wizardStep === 'COLLECT_NEW_CUSTOMER_ADDRESS' ||
      wizardStep === 'COLLECT_NEW_CUSTOMER_COUNTRY');

  const composerDisabled = !persistHydrated || loading || !businessId;

  const chatActionsLocked = loading;
  const actionSheetTarget = actionSheetMessageId
    ? messages.find((m) => m.id === actionSheetMessageId)
    : undefined;

  const rootLayout =
    rootClassName?.trim() ||
    (variant === 'page' && fullBleedChat
      ? 'relative flex w-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--card)] lg:h-[min(680px,calc(100dvh-11rem))] lg:min-h-[420px] lg:rounded-2xl lg:border lg:border-[var(--card-border)] lg:shadow-sm dark:lg:shadow-none'
      : variant === 'page'
        ? 'relative flex h-[min(720px,calc(100dvh-8rem))] min-h-[min(480px,calc(100dvh-10rem))] flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none sm:rounded-3xl'
        : 'relative flex min-h-[min(520px,calc(100dvh-12rem))] flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none sm:rounded-3xl');

  return (
    <div className={rootLayout}>
      {variant === 'embedded' ? (
        <div
          className="shrink-0 border-b border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 sm:px-4"
          aria-hidden
        >
          <p className="text-center text-[11px] font-medium text-[var(--muted)] sm:text-xs">
            Assistant
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-slate-100/90 px-2 py-3 [-webkit-overflow-scrolling:touch] dark:bg-slate-950/50 sm:px-3 sm:py-4',
          fullBleedChat &&
            'pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]'
        )}
      >
        {openingTurnLoading && messages.length === 0 ? (
          <p className="mx-auto max-w-xl px-2 pb-1 text-center text-[11px] text-[var(--muted)] sm:text-xs">
            Preparing suggestions…
          </p>
        ) : null}

        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {messages.map((msg, index) => {
            const isEditing = editingMessageId === msg.id && msg.role === 'user';
            const bubbleClass =
              msg.role === 'user'
                ? 'rounded-2xl rounded-br-md bg-indigo-600 px-3 py-2 text-sm leading-relaxed text-white shadow-sm'
                : msg.variant === 'error'
                  ? 'rounded-2xl rounded-bl-md border border-red-200/80 bg-red-50/95 px-3 py-2 text-sm leading-relaxed text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100'
                  : 'rounded-2xl rounded-bl-md border border-[var(--card-border)] bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

            return (
              <Fragment key={msg.id}>
              <div
                className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={cn(
                    'group/msg relative flex min-w-0 max-w-[85%] flex-col',
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  )}
                  data-msg-anchor={msg.id}
                >
                  <div
                    className={bubbleClass}
                    onTouchStart={() => handleMessageTouchStart(msg)}
                    onTouchEnd={handleMessageTouchEndOrCancel}
                    onTouchCancel={handleMessageTouchEndOrCancel}
                    onTouchMove={handleMessageTouchEndOrCancel}
                  >
                    {msg.role === 'user' && isEditing ? (
                      <form
                        className="space-y-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!editingDraft.trim() || chatActionsLocked) return;
                          void commitUserMessageEdit(msg.id, editingDraft);
                        }}
                      >
                        <textarea
                          ref={editTextareaRef}
                          value={editingDraft}
                          onChange={(e) => setEditingDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              if (!editingDraft.trim() || chatActionsLocked) return;
                              void commitUserMessageEdit(msg.id, editingDraft);
                            }
                          }}
                          rows={Math.min(8, Math.max(3, editingDraft.split('\n').length))}
                          className="min-h-[4.5rem] w-full resize-y rounded-lg border border-white/30 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-indigo-200/80 focus:outline-none focus:ring-2 focus:ring-white/40"
                          placeholder="Message"
                          disabled={chatActionsLocked}
                        />
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={chatActionsLocked}
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditingDraft('');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-100 hover:bg-white/10 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={chatActionsLocked || !editingDraft.trim()}
                            className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-40"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden />
                            Save & resend
                          </button>
                        </div>
                      </form>
                    ) : msg.role === 'user' ? (
                      <>
                        {msg.imageUrl ? (
                          <img
                            src={msg.imageUrl}
                            alt=""
                            className="mb-2 max-h-52 w-full max-w-[240px] rounded-lg border border-white/20 object-cover object-top shadow-sm"
                          />
                        ) : null}
                        {msg.content.trim() && msg.content !== '\u00a0' ? (
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {renderAssistantFormattedText(msg.content)}
                          </p>
                        ) : null}
                        {msg.editedAt != null ? (
                          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-indigo-200/90">
                            Edited
                          </p>
                        ) : null}
                      </>
                    ) : msg.structured &&
                      (msg.structured.title ||
                        (msg.structured.lines && msg.structured.lines.length > 0)) ? (
                      <div className="space-y-2">
                        {msg.structured.title ? (
                          <p className="text-sm leading-snug text-slate-900 dark:text-slate-100">
                            {renderAssistantFormattedText(msg.structured.title)}
                          </p>
                        ) : null}
                        {msg.structured.lines.map((line, i) => (
                          <p
                            key={i}
                            className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900 dark:text-slate-100"
                          >
                            {renderAssistantFormattedText(line)}
                          </p>
                        ))}
                      </div>
                    ) : msg.content.trim() && msg.content !== '\u00a0' ? (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                        {renderAssistantFormattedText(msg.content)}
                      </p>
                    ) : null}

                    {msg.role === 'assistant' && msg.cards?.length ? (
                      <div
                        className={
                          msg.structured ||
                          (msg.content.trim() && msg.content !== '\u00a0')
                            ? 'mt-2'
                            : ''
                        }
                      >
                        <InvoiceAssistantChatCards
                          cards={msg.cards}
                          invoiceOverlayById={effectiveInvoiceOverlayById}
                          onFollowUpMessage={(t) => {
                            if (loading) return;
                            const text = t.trim();
                            if (!text) return;
                            pushUser(text);
                            void runWizardSend(text);
                          }}
                          followUpDisabled={loading}
                          onOpenInvoicePreview={(ctx) => setPreviewContext(ctx)}
                          onInsightSummaryCta={openOverdueModalFromInsightCard}
                        />
                      </div>
                    ) : null}
                    {msg.role === 'assistant' && msg.postCardContent?.trim() ? (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                        {renderAssistantFormattedText(msg.postCardContent)}
                      </p>
                    ) : null}
                    {msg.role === 'assistant' && msg.quickReplies?.length ? (
                      <div
                        className={
                          msg.structured ||
                          (msg.content.trim() && msg.content !== '\u00a0') ||
                          msg.postCardContent?.trim()
                            ? 'mt-3'
                            : 'mt-1'
                        }
                        role="group"
                        aria-label="Suggested follow-ups"
                      >
                        <div className="flex flex-wrap gap-2">
                          {msg.quickReplies.map((q) => (
                            <button
                              key={`${q.label}-${q.href ?? q.message}`.slice(0, 120)}
                              type="button"
                              disabled={loading}
                              onTouchStart={(e) => e.stopPropagation()}
                              onClick={() => {
                                if (loading) return;
                                const nav = typeof q.href === 'string' ? q.href.trim() : '';
                                if (nav) {
                                  router.push(nav);
                                  return;
                                }
                                const t = q.message.trim();
                                if (!t) return;
                                pushUser(t);
                                void runWizardSend(t);
                              }}
                              className="rounded-full border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-left text-xs font-medium text-[var(--foreground)] shadow-sm transition hover:bg-[var(--card)] disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700/80"
                            >
                              {q.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {!isEditing ? (
                    <>
                      {/* Mobile: icons only for tapped message; long-press on bubble still opens sheet. */}
                      {activeMessageId === msg.id ? (
                      <div
                        className={cn(
                          'mt-1.5 flex w-full shrink-0 items-center gap-1 lg:hidden',
                          'animate-message-actions-reveal',
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        {msg.role === 'user' && !chatActionsLocked ? (
                          <button
                            type="button"
                            aria-label="Edit message"
                            className={cn(
                              'rounded-lg p-2 text-slate-400/90 transition-colors',
                              'hover:text-slate-600 active:bg-slate-200/60 active:opacity-90',
                              'dark:text-slate-500 dark:hover:text-slate-300 dark:active:bg-slate-700/50',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--background)]'
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingMessageId(msg.id);
                              setEditingDraft(msg.content);
                              setActionSheetMessageId(null);
                            }}
                          >
                            <Pencil className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label={copiedMessageId === msg.id ? 'Copied' : 'Copy message'}
                          className={cn(
                            'rounded-lg p-2 text-slate-400/90 transition-colors',
                            'hover:text-slate-600 active:bg-slate-200/60 active:opacity-90',
                            'dark:text-slate-500 dark:hover:text-slate-300 dark:active:bg-slate-700/50',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--background)]',
                            copiedMessageId === msg.id && 'text-slate-600 dark:text-slate-300'
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            void copyChatMessage(msg, { fromActionSheet: true });
                          }}
                        >
                          {copiedMessageId === msg.id ? (
                            <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
                          ) : (
                            <Copy className="h-[15px] w-[15px]" strokeWidth={1.75} aria-hidden />
                          )}
                        </button>
                      </div>
                      ) : null}

                    <div
                      className={cn(
                        // lg+ only: hover row. Below lg, use long-press → sheet (matches `useIsLgDown` / touch layouts).
                        'mt-2 hidden w-full shrink-0 justify-end gap-4 px-0.5 lg:flex',
                        'text-xs font-medium leading-none text-slate-500/90 dark:text-slate-400/90',
                        copiedMessageId === msg.id
                          ? 'pointer-events-auto translate-y-0 opacity-100'
                          : cn(
                              'pointer-events-none translate-y-1 opacity-0 transition-[opacity,transform] duration-150 ease-out',
                              'group-hover/msg:pointer-events-auto group-hover/msg:translate-y-0 group-hover/msg:opacity-100'
                            )
                      )}
                    >
                      {msg.role === 'user' && !chatActionsLocked ? (
                        <button
                          type="button"
                          aria-label="Edit message"
                          className={cn(
                            'cursor-pointer rounded px-0.5 py-0.5',
                            'text-inherit transition-[color,transform,opacity] duration-150 ease-out',
                            'hover:text-slate-800 active:scale-[0.98] active:opacity-80 dark:hover:text-slate-100',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/35 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--background)]'
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingMessageId(msg.id);
                            setEditingDraft(msg.content);
                            setActionSheetMessageId(null);
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        aria-label={copiedMessageId === msg.id ? 'Copied' : 'Copy message'}
                        className={cn(
                          'cursor-pointer rounded px-0.5 py-0.5 tabular-nums',
                          'text-inherit transition-[color,transform,opacity] duration-150 ease-out',
                          'hover:text-slate-800 active:scale-[0.98] active:opacity-80 dark:hover:text-slate-100',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/35 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--background)]',
                          copiedMessageId === msg.id && 'pointer-events-none text-slate-700 dark:text-slate-200'
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyChatMessage(msg);
                        }}
                      >
                        {copiedMessageId === msg.id ? 'Copied ✓' : 'copy'}
                      </button>
                    </div>
                    </>
                  ) : null}
                </div>
              </div>
              {index === 0 && msg.role === 'assistant' ? (
                <AssistantOpeningContextPanels
                  launchContext={launchContext}
                  show={
                    !messages.some((m) => m.role === 'user') &&
                    (launchContext === 'create_invoice' || launchContext === 'create_customer')
                  }
                  disabled={loading || Boolean(successInvoice)}
                  onChip={(text) => {
                    if (loading || successInvoice) return;
                    pushUser(text);
                    void runWizardSend(text);
                  }}
                />
              ) : null}
              </Fragment>
            );
          })}

          {loading ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[var(--card-border)] bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" aria-hidden />
                <span className="text-xs text-[var(--muted)]">Thinking…</span>
              </div>
            </div>
          ) : null}

          {successInvoice ? (
            <div className="mx-auto mt-2 flex w-full max-w-[85%] justify-center">
              <button
                type="button"
                onClick={() => void resetWizard()}
                className="text-center text-xs font-medium text-[var(--muted)] underline-offset-2 hover:underline"
              >
                Create another invoice
              </button>
            </div>
          ) : null}

          {(showConfirmChip ||
            showCustomerChips ||
            showNewCustomerChip ||
            showSkipOnboardingChip) &&
          !loading ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {showConfirmChip ? (
                <button
                  type="button"
                  onClick={() => {
                    if (loading || successInvoice) return;
                    pushUser('Create draft invoice');
                    void runWizardSend('');
                  }}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-900/40"
                >
                  Create draft invoice
                </button>
              ) : null}
              {showCustomerChips
                ? customerSuggestions.slice(0, 6).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        void selectCustomer({
                          id: s.id,
                          name: s.label,
                          company: s.label,
                          email: s.email,
                          preferred_currency_code: s.currency ?? null,
                        })
                      }
                      className="max-w-full truncate rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      {s.label}
                    </button>
                  ))
                : null}
              {showNewCustomerChip ? (
                <>
                  <button
                    type="button"
                    onClick={() => void markNewCustomer()}
                    className="rounded-full border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--card)]"
                  >
                    New customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerSelectorOpen(true)}
                    className="rounded-full border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--card)]"
                  >
                    Browse customers
                  </button>
                </>
              ) : null}
              {showSkipOnboardingChip ? (
                <button
                  type="button"
                  onClick={() => {
                    if (loading || successInvoice) return;
                    pushUser('skip');
                    void runWizardSend('skip');
                  }}
                  className="rounded-full border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--card)]"
                >
                  Skip
                </button>
              ) : null}
            </div>
          ) : null}

          <div ref={threadEndRef} />
        </div>
      </div>

      {customerSelectorOpen ? (
        <div
          className="absolute inset-0 z-10 flex items-end justify-center bg-slate-950/40 p-3 sm:items-center"
          role="dialog"
          aria-label="Choose customer"
        >
          <div className="max-h-[min(70vh,24rem)] w-full max-w-md overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-lg">
            <div className="border-b border-[var(--card-border)] px-3 py-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">{customerPrompt || 'Pick a customer'}</p>
            </div>
            <div className="p-2">
              <input
                type="text"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"
              />
              <div className="mt-2 max-h-52 overflow-auto">
                {effectiveSuggestions.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-[var(--muted)]">No customers found</p>
                ) : (
                  effectiveSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void selectCustomer(c)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span className="truncate">{String(c.company || c.name || 'Customer')}</span>
                      <span className="truncate text-xs text-[var(--muted)]">{String(c.email || '')}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="mt-2 flex justify-between border-t border-[var(--card-border)] pt-2">
                <Link
                  href="/dashboard/customers"
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400"
                >
                  Create new
                </Link>
                <button
                  type="button"
                  onClick={() => setCustomerSelectorOpen(false)}
                  className="text-xs font-medium text-[var(--muted)]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {wizardStep === 'COLLECT_NEW_CUSTOMER_COUNTRY' &&
      !successInvoice &&
      wizardClientUi?.country_modal === true ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Select country"
        >
          <div className="flex max-h-[min(88vh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl ring-1 ring-slate-900/[0.06] dark:ring-white/[0.06]">
            <div className="shrink-0 border-b border-[var(--card-border)] px-4 py-3.5">
              <p className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
                Select country
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                Search by country name or two-letter code, then confirm.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              <CountrySelect
                value={pendingCountryIso}
                onChange={setPendingCountryIso}
                ariaLabel="Country"
              />
            </div>
            <div className="shrink-0 border-t border-[var(--card-border)] p-3 sm:p-4">
              <button
                type="button"
                disabled={loading || pendingCountryIso.trim().length !== 2}
                onClick={() => void applyCountryFromPicker()}
                className="w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Use this country
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={onSend}
        className={cn(
          'shrink-0 border-t border-[var(--card-border)] bg-[var(--background)] p-2 sm:p-3',
          fullBleedChat &&
            'pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]'
        )}
      >
        {pendingImage && !successInvoice && wizardStep !== 'CONFIRM' ? (
          <div className="mx-auto mb-2 flex w-full max-w-xl items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-2 shadow-sm sm:p-2.5">
            <img
              src={pendingImage.previewUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg border border-[var(--card-border)] object-cover sm:h-16 sm:w-16"
            />
            <p className="min-w-0 flex-1 text-xs leading-snug text-[var(--muted)] sm:text-sm">
              Screenshot attached. Add an optional note, then send.
            </p>
            <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => clearPendingImage()}
                className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
              >
                Remove
              </button>
            </div>
          </div>
        ) : null}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleAssistantImageSelected}
        />
        <div className="mx-auto flex max-w-xl items-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (recordingState === 'recording') stopVoiceRecording();
              else void startVoiceRecording();
            }}
            disabled={composerDisabled || recordingState === 'uploading'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--card)] text-indigo-600 transition hover:bg-[var(--background)] disabled:opacity-40 dark:text-indigo-400"
            aria-label={recordingState === 'recording' ? 'Stop recording' : 'Voice message'}
          >
            {recordingState === 'recording' ? (
              <span className="h-3 w-3 rounded-sm bg-amber-500" />
            ) : recordingState === 'uploading' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Mic className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={composerDisabled || recordingState === 'uploading' || wizardStep === 'CONFIRM'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--card)] text-indigo-600 transition hover:bg-[var(--background)] disabled:opacity-40 dark:text-indigo-400"
            aria-label="Attach screenshot"
          >
            <ImageIcon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </button>
          <label htmlFor="invoice-chat-composer" className="sr-only">
            Message
          </label>
          <textarea
            id="invoice-chat-composer"
            rows={1}
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
            disabled={composerDisabled}
            placeholder={
              successInvoice
                ? 'Try “Send it”, “View it”, or describe your next step…'
                : wizardStep === 'CONFIRM'
                  ? 'Add a note or tap Create draft invoice…'
                  : 'Type a message…'
            }
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={
              composerDisabled ||
              (wizardStep !== 'CONFIRM' && !composerText.trim() && !pendingImage)
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-40 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            aria-label="Send"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
        {recordingState === 'recording' ? (
          <p className="mx-auto mt-1 max-w-xl text-center text-[10px] text-amber-700 dark:text-amber-400">
            Recording… tap mic to stop
          </p>
        ) : null}
      </form>

      <PaymentModal
        open={assistantRecordPaymentModal != null}
        onClose={() => setAssistantRecordPaymentModal(null)}
        invoiceId={assistantRecordPaymentModal?.invoice_id ?? ''}
        mode={assistantRecordPaymentModal?.mode ?? 'full'}
        amount={assistantRecordPaymentModal?.amount ?? 0}
        remainingBalance={assistantRecordPaymentModal?.remaining_balance ?? 0}
        scheduleItemId={assistantRecordPaymentModal?.schedule_item_id ?? null}
        issueDate={assistantRecordPaymentModal?.issue_date ?? null}
        invoiceNumber={assistantRecordPaymentModal?.invoice_number ?? null}
        customerName={assistantRecordPaymentModal?.customer_name ?? null}
        assistantContext
        overlayZClass="z-[140]"
        onSuccess={handleAssistantRecordPaymentSuccess}
      />

      {overdueModalOpen ? (
        <div className="fixed inset-0 z-[95] bg-black/45" role="dialog" aria-modal="true" aria-label="Overdue invoices">
          <div className="absolute inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
            <div className="flex h-full w-full flex-col bg-[var(--card)] sm:h-[85vh] sm:max-h-[48rem] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-[var(--card-border)] sm:shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--card-border)] px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-[var(--foreground)]">Overdue invoices</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {overdueModalSummary?.countLabel ?? String(overdueModalTotalCount)} invoices ·{' '}
                    {overdueModalSummary?.amountLabel ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/dashboard/invoices?status=overdue"
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--background)]"
                  >
                    Open in Invoices
                  </Link>
                  <button
                    type="button"
                    onClick={() => setOverdueModalOpen(false)}
                    className="inline-flex items-center justify-center rounded-lg border border-[var(--card-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--background)]"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-5">
                {overdueModalLoading ? (
                  <div className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading overdue invoices...
                  </div>
                ) : overdueModalError ? (
                  <div className="rounded-xl border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300">
                    {overdueModalError}
                  </div>
                ) : overdueModalRows.length === 0 ? (
                  <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--muted)]">
                    No overdue invoices found.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {overdueModalRows.map((row) => (
                      <li
                        key={row.id}
                        className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                              {row.invoice_number || 'Invoice'}
                            </p>
                            <p className="truncate text-xs text-[var(--muted)]">{row.customer_name || '—'}</p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              Due {formatChatModalDate(row.due_date)} · Status {row.status || '—'}
                            </p>
                            <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                              Balance due: {row.balance_due.toLocaleString(undefined, { style: 'currency', currency: (row.currency || 'USD').toUpperCase() })}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewContext({
                                  invoiceId: row.id,
                                  invoice_number: row.invoice_number,
                                  customer_name: row.customer_name,
                                  balance_due: row.balance_due,
                                  currency: row.currency,
                                  status: row.status,
                                })
                              }
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                            >
                              View invoice
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewContext({
                                  invoiceId: row.id,
                                  invoice_number: row.invoice_number,
                                  customer_name: row.customer_name,
                                  balance_due: row.balance_due,
                                  currency: row.currency,
                                  status: row.status,
                                  initialMode: 'edit',
                                })
                              }
                              className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)]"
                            >
                              Edit invoice
                            </button>
                            <button
                              type="button"
                              disabled={loading || !row.invoice_number}
                              onClick={() => {
                                if (!row.invoice_number) return;
                                const text = `Resend invoice ${row.invoice_number}`;
                                pushUser(text);
                                void runWizardSend(text);
                              }}
                              className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)] disabled:opacity-50"
                            >
                              Send reminder
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AssistantRetentionModal
        open={retentionModalOpen}
        value={retentionPolicy}
        onChange={handleRetentionChange}
        onClose={() => setRetentionModalOpen(false)}
      />
      <UpgradePlanModal
        open={upgradeModal != null}
        trigger={upgradeModal ?? 'ai_feature'}
        onClose={() => setUpgradeModal(null)}
        onUpgrade={() => {
          setUpgradeModal(null);
          window.location.href = '/settings';
        }}
      />

      <AssistantInvoicePreviewModal
        context={previewContext}
        open={previewContext != null}
        onClose={() => setPreviewContext(null)}
        followUpDisabled={loading}
        onAssistantFollowUp={(message) => {
          const text = message.trim();
          if (!text) return;
          pushUser(text);
          void runWizardSend(text);
        }}
        onInvoiceSavedToAssistant={handleInvoiceSavedToAssistant}
      />

      <ChatMessageMobileActionSheet
        open={Boolean(actionSheetMessageId && actionSheetTarget)}
        previewPlainText={
          actionSheetTarget ? getChatMessagePlainText(actionSheetTarget) : ''
        }
        role={actionSheetTarget?.role ?? 'assistant'}
        canEdit={Boolean(actionSheetTarget?.role === 'user' && !chatActionsLocked)}
        onClose={() => setActionSheetMessageId(null)}
        onEdit={() => {
          if (!actionSheetTarget) return;
          setEditingMessageId(actionSheetTarget.id);
          setEditingDraft(actionSheetTarget.content);
          setActionSheetMessageId(null);
        }}
        onCopy={() => {
          if (!actionSheetTarget) return;
          void copyChatMessage(actionSheetTarget, { fromActionSheet: true });
        }}
      />
      <MobileCopyToast message={mobileCopyToast} />

      {clearConfirmOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-conv-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Dismiss"
            onClick={() => setClearConfirmOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-xl dark:border-slate-600 dark:bg-slate-800">
            <h2
              id="clear-conv-title"
              className="text-base font-semibold text-[var(--foreground)]"
            >
              Clear this conversation?
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Chat messages on this device will be removed. Invoices, customers, and payments you created
              stay in Zenzex.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setClearConfirmOpen(false)}
                className="rounded-xl border border-[var(--card-border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--background)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmClearConversation()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Clear chat
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {assistantCustomerFormModal.open &&
      assistantCustomerFormModal.businessId &&
      assistantCustomerFormModal.customer ? (
        <CustomerFormModal
          open
          onClose={() =>
            setAssistantCustomerFormModal({ open: false, businessId: null, customer: null })
          }
          onSaved={async (customer) => {
            const cid = customer?.id;
            setAssistantCustomerFormModal({ open: false, businessId: null, customer: null });
            if (!cid) return;
            setLoading(true);
            try {
              const result = await postWizard({
                draft: wizardDraft,
                action: { type: 'start_customer_inline_edit', customer_id: cid },
              });
              if (result?.res.ok) applyWizardResponse(result.data);
            } finally {
              setLoading(false);
            }
          }}
          businessId={assistantCustomerFormModal.businessId}
          companyBaseCurrency={companyBaseCurrency}
          customer={assistantCustomerFormModal.customer}
        />
      ) : null}
    </div>
  );
}
