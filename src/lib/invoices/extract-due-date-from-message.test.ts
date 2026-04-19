import { describe, it, expect } from 'vitest';
import { extractDueDateIsoFromInvoiceUserMessage } from './extract-due-date-from-message';

describe('extractDueDateIsoFromInvoiceUserMessage', () => {
  const ref = new Date('2026-01-15T12:00:00.000Z');

  it('parses due date after multiple comma-separated items (17th April)', () => {
    const text =
      '5 shoes at $500 each, 2 cap at $600, due 17th April 2026';
    expect(extractDueDateIsoFromInvoiceUserMessage(text, ref)).toBe('2026-04-17');
  });

  it('parses April 17, 2026 form', () => {
    expect(
      extractDueDateIsoFromInvoiceUserMessage('1 widget at $10, due April 17, 2026', ref)
    ).toBe('2026-04-17');
  });

  it('parses due on …', () => {
    expect(
      extractDueDateIsoFromInvoiceUserMessage('Items x, due on 17 April 2026', ref)
    ).toBe('2026-04-17');
  });

  it('returns null when no due phrase', () => {
    expect(extractDueDateIsoFromInvoiceUserMessage('5 shoes at $500', ref)).toBeNull();
  });
});
