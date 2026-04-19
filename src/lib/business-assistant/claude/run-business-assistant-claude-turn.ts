import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runClaudeToolLoop } from '@/lib/ai/claude-tools';
import type { AssistantMetricSessionContext } from '@/lib/business-assistant/metric-session-context';
import type { BusinessRole } from '@/lib/rbac/types';
import type { AssistantActiveContextV1 } from '@/lib/business-assistant/claude/assistant-active-context';
import { coerceAssistantActiveContextFromUnknown } from '@/lib/business-assistant/claude/assistant-active-context';
import { buildBusinessAssistantClaudeSystem } from '@/lib/business-assistant/claude/business-assistant-claude-system';
import { BUSINESS_ASSISTANT_CLAUDE_TOOLS } from '@/lib/business-assistant/claude/tool-definitions';
import {
  executeBusinessAssistantTool,
  type BusinessAssistantToolExecutorContext,
} from '@/lib/business-assistant/claude/tool-executor';
import { buildInvoiceLookupChatCards } from '@/lib/invoices/assistant-invoice-lookup-card';
import type { InvoiceAssistantChatCard } from '@/lib/invoices/conversational-invoice-wizard/types';
import type { AssistantResponseMetaV1 } from '@/lib/business-assistant/claude/assistant-response-meta';
import {
  augmentEditInvoiceWithoutReference,
  resolveAssistantFollowUpUserText,
} from '@/lib/business-assistant/claude/assistant-follow-up-resolver';
import { inferAssistantResponseMeta } from '@/lib/business-assistant/claude/infer-assistant-response-meta';

export type ConversationTailMessage = { role: 'user' | 'assistant'; content: string };

export async function runBusinessAssistantClaudeTurn(args: {
  supabase: SupabaseClient;
  businessId: string;
  userId: string;
  reportingCurrency: string;
  workspaceTimezone: string | null;
  role: BusinessRole;
  userText: string;
  conversationTail: ConversationTailMessage[];
  priorMetricSession: AssistantMetricSessionContext | null;
  priorActiveContext: AssistantActiveContextV1 | null;
  priorAssistantResponseMeta: AssistantResponseMetaV1 | null;
}): Promise<{
  assistant_text: string;
  chat_cards: InvoiceAssistantChatCard[] | null;
  metric_session_context: AssistantMetricSessionContext | null;
  assistant_active_context: AssistantActiveContextV1 | null;
  assistant_response_meta: AssistantResponseMetaV1 | null;
}> {
  if (!process.env.CLAUDE_API_KEY) {
    return {
      assistant_text:
        'The AI assistant is not configured (missing server key). Your workspace data is unchanged — contact support or try again later.',
      chat_cards: null,
      metric_session_context: args.priorMetricSession,
      assistant_active_context: args.priorActiveContext,
      assistant_response_meta: null,
    };
  }

  const activeJson =
    args.priorActiveContext != null ? JSON.stringify(args.priorActiveContext) : null;

  const system = buildBusinessAssistantClaudeSystem({
    reportingCurrency: args.reportingCurrency,
    workspaceTimezone: args.workspaceTimezone,
    activeContextJson: activeJson,
  });

  const trimmedUser = args.userText.trim();
  const followUp = resolveAssistantFollowUpUserText({
    userText: trimmedUser,
    priorResponseMeta: args.priorAssistantResponseMeta,
  });
  let effectiveUserContent = followUp.effective_user_text;
  if (followUp.decision === 'pass_through') {
    const aug = augmentEditInvoiceWithoutReference(trimmedUser);
    if (aug) effectiveUserContent = aug;
  }

  const messages: Anthropic.MessageParam[] = [];
  for (const m of args.conversationTail.slice(-24)) {
    const c = String(m.content ?? '').trim();
    if (!c) continue;
    messages.push({ role: m.role, content: c });
  }
  messages.push({ role: 'user', content: effectiveUserContent });

  const execCtx: BusinessAssistantToolExecutorContext = {
    supabase: args.supabase,
    businessId: args.businessId,
    reportingCurrency: args.reportingCurrency,
    workspaceTimezone: args.workspaceTimezone,
    role: args.role,
    now: new Date(),
    metricSessionContext: args.priorMetricSession,
    assistantActiveContext: args.priorActiveContext,
    toolTrace: [],
    findInvoiceLookupMatches: null,
  };

  const { text } = await runClaudeToolLoop({
    system,
    messages,
    tools: BUSINESS_ASSISTANT_CLAUDE_TOOLS,
    maxTokens: 8192,
    maxToolRounds: 10,
    toolExecutor: (name, _id, input) => executeBusinessAssistantTool(execCtx, name, input),
  });

  const assistant_response_meta = inferAssistantResponseMeta(execCtx.toolTrace, execCtx);

  const lastTool = execCtx.toolTrace[execCtx.toolTrace.length - 1];
  const chat_cards =
    lastTool === 'find_invoice' && execCtx.findInvoiceLookupMatches?.length
      ? buildInvoiceLookupChatCards(execCtx.findInvoiceLookupMatches, args.role, {
          userText: trimmedUser,
        })
      : null;

  return {
    assistant_text: text.trim() || 'I could not produce a reply. Please try rephrasing.',
    chat_cards,
    metric_session_context: execCtx.metricSessionContext,
    assistant_active_context: execCtx.assistantActiveContext,
    assistant_response_meta,
  };
}

export function parseAssistantActiveContextBody(raw: unknown): AssistantActiveContextV1 | null {
  return coerceAssistantActiveContextFromUnknown(raw);
}
