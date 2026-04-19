import { flagEmojiFromIso, resolveCountryAgainstCandidates, resolveCountryFromUserText } from '@/lib/location/resolve-country-input';
import { mergeCountryIntoNewCustomerDraft } from '@/lib/invoices/conversational-invoice-wizard/new-customer-onboarding';
import type { AssistantQuickReply, InvoiceWizardDraft } from '@/lib/invoices/conversational-invoice-wizard/types';

export type WizardCountryTurnResult =
  | { kind: 'no_op'; draft: InvoiceWizardDraft }
  | { kind: 'resolved'; draft: InvoiceWizardDraft; ackLines: string[] }
  | {
      kind: 'disambiguate';
      draft: InvoiceWizardDraft;
      lines: string[];
      quickReplies: AssistantQuickReply[];
    }
  | { kind: 'need_modal'; draft: InvoiceWizardDraft; lines: string[] };

/**
 * Intelligent country capture for new-customer onboarding (chat-first; modal only on low confidence).
 */
export function applyWizardCountryUserMessage(args: {
  draft: InvoiceWizardDraft;
  userText: string;
}): WizardCountryTurnResult {
  const t = args.userText.trim();
  if (!t) return { kind: 'no_op', draft: args.draft };

  let draft = args.draft;
  const pending = draft.pendingCountryCandidates?.length
    ? draft.pendingCountryCandidates
    : null;

  const resolution = pending
    ? resolveCountryAgainstCandidates(t, pending)
    : resolveCountryFromUserText(t);

  if (resolution.tier === 'high') {
    const next = mergeCountryIntoNewCustomerDraft(
      {
        ...draft,
        pendingCountryCandidates: null,
        countryModalRecommended: false,
      },
      resolution.code
    );
    const flag = flagEmojiFromIso(resolution.code);
    const ackLines = [`Got it — ${resolution.name}${flag ? ` ${flag}` : ''}`];
    return { kind: 'resolved', draft: next, ackLines };
  }

  if (resolution.tier === 'medium' && resolution.candidates.length > 0) {
    const codes = resolution.candidates.map((c) => c.code);
    const lines = [
      'Did you mean one of these?',
      ...resolution.candidates.map((c) => {
        const f = flagEmojiFromIso(c.code);
        return `• ${c.name}${f ? ` ${f}` : ''} (${c.code})`;
      }),
    ];
    const quickReplies: AssistantQuickReply[] = resolution.candidates.slice(0, 4).map((c) => ({
      label: c.name,
      message: c.name,
    }));
    return {
      kind: 'disambiguate',
      draft: {
        ...draft,
        pendingCountryCandidates: codes,
        countryModalRecommended: false,
      },
      lines,
      quickReplies,
    };
  }

  return {
    kind: 'need_modal',
    draft: {
      ...draft,
      pendingCountryCandidates: null,
      countryModalRecommended: true,
    },
    lines: [
      'I couldn’t match that to a country yet. Open the country picker below, or try a two-letter code like GB or US.',
    ],
  };
}
