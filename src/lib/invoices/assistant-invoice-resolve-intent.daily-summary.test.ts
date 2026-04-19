import { describe, expect, it } from 'vitest';
import {
  resolveInvoiceAssistantIntent,
  textLooksLikeDailyBusinessSummary,
} from '@/lib/invoices/assistant-invoice-resolve-intent';

describe('resolveInvoiceAssistantIntent — daily_business_summary', () => {
  it('maps task / priority today phrases', () => {
    for (const q of [
      'What is my task today?',
      'what should I do today',
      'what needs attention today',
      "today's tasks",
      'my priorities today',
      'daily summary',
      'what should I focus on today',
    ]) {
      expect(resolveInvoiceAssistantIntent(q)).toEqual({ type: 'daily_business_summary' });
    }
  });

  it('maps compact show follow-ups', () => {
    expect(resolveInvoiceAssistantIntent('overdue')).toEqual({ type: 'list', filter: 'overdue' });
    expect(resolveInvoiceAssistantIntent('Show overdue')).toEqual({ type: 'list', filter: 'overdue' });
    expect(resolveInvoiceAssistantIntent("What's overdue right now?")).toEqual({
      type: 'insight',
      metric: 'total_overdue',
    });
    expect(resolveInvoiceAssistantIntent('show unpaid')).toEqual({ type: 'unpaid_list' });
    expect(resolveInvoiceAssistantIntent('show unpaid invoices')).toEqual({ type: 'unpaid_list' });
    expect(resolveInvoiceAssistantIntent('show all unpaid')).toEqual({ type: 'unpaid_list' });
    expect(resolveInvoiceAssistantIntent('List due today')).toEqual({ type: 'list', filter: 'due_today' });
    expect(resolveInvoiceAssistantIntent('show invoices due today')).toEqual({
      type: 'list',
      filter: 'due_today',
    });
    expect(resolveInvoiceAssistantIntent('what invoices are overdue')).toEqual({
      type: 'list',
      filter: 'overdue',
    });
    expect(resolveInvoiceAssistantIntent('late invoices')).toEqual({ type: 'list', filter: 'overdue' });
    expect(resolveInvoiceAssistantIntent('who is overdue')).toEqual({ type: 'list', filter: 'overdue' });
    expect(resolveInvoiceAssistantIntent('Show drafts')).toEqual({ type: 'list', filter: 'draft' });
    expect(resolveInvoiceAssistantIntent('list draft invoices')).toEqual({ type: 'list', filter: 'draft' });
  });
});

describe('resolveInvoiceAssistantIntent — unpaid / receivables', () => {
  it('maps as-of-today unpaid snapshot (not issue-date balance window)', () => {
    expect(resolveInvoiceAssistantIntent('unpaid invoices as at today?')).toEqual({ type: 'unpaid_snapshot' });
    expect(resolveInvoiceAssistantIntent('outstanding invoices as of today')).toEqual({
      type: 'unpaid_snapshot',
    });
    expect(
      resolveInvoiceAssistantIntent('What are our outstanding invoices as of today')
    ).toEqual({ type: 'unpaid_snapshot' });
    expect(resolveInvoiceAssistantIntent("what's overdue right now")).toEqual({
      type: 'insight',
      metric: 'total_overdue',
    });
    expect(resolveInvoiceAssistantIntent("what's late")).toEqual({
      type: 'insight',
      metric: 'total_overdue',
    });
  });

  it('maps summary-style unpaid questions to snapshot; drill-down words to unpaid_list', () => {
    expect(resolveInvoiceAssistantIntent('what are unpaid')).toEqual({ type: 'unpaid_snapshot' });
    expect(resolveInvoiceAssistantIntent('unpaid')).toEqual({ type: 'unpaid_list' });
    expect(resolveInvoiceAssistantIntent('show outstanding')).toEqual({ type: 'unpaid_list' });
    expect(resolveInvoiceAssistantIntent('receivables')).toEqual({ type: 'unpaid_list' });
  });

  it('maps who owes to unpaid list', () => {
    expect(resolveInvoiceAssistantIntent("who hasn't paid us yet?")).toEqual({
      type: 'unpaid_list',
    });
  });

  it('does not treat as-of-today receivables as balance_in_period by issue date', () => {
    expect(resolveInvoiceAssistantIntent('unpaid invoices as of today')).toEqual({ type: 'unpaid_snapshot' });
    expect(resolveInvoiceAssistantIntent('unpaid invoices as of today')).not.toEqual(
      expect.objectContaining({ type: 'balance_in_period' })
    );
  });
});

describe('textLooksLikeDailyBusinessSummary', () => {
  it('is false for unrelated phrasing', () => {
    expect(textLooksLikeDailyBusinessSummary('how much revenue last month', 'how much revenue last month')).toBe(
      false
    );
  });
});
