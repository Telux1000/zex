import { describe, expect, it } from 'vitest';
import {
  normalizeWizardDueDateToIso,
  tryParseAbsoluteDuePhraseToIso,
  validateAssistantDueDateIso,
} from '@/lib/utils/date';

describe('assistant due date parsing', () => {
  const ref = new Date('2026-04-14T12:00:00.000Z');

  it('parses month/day phrases consistently', () => {
    expect(tryParseAbsoluteDuePhraseToIso('April 20', ref)).toBe('2026-04-20');
    expect(tryParseAbsoluteDuePhraseToIso('April 20th', ref)).toBe('2026-04-20');
    expect(tryParseAbsoluteDuePhraseToIso('Apr 20', ref)).toBe('2026-04-20');
    expect(tryParseAbsoluteDuePhraseToIso('20 April', ref)).toBe('2026-04-20');
    expect(tryParseAbsoluteDuePhraseToIso('8 may', ref)).toBe('2026-05-08');
    expect(tryParseAbsoluteDuePhraseToIso('may 8', ref)).toBe('2026-05-08');
    expect(tryParseAbsoluteDuePhraseToIso('8th may', ref)).toBe('2026-05-08');
    expect(tryParseAbsoluteDuePhraseToIso('may 8th', ref)).toBe('2026-05-08');
    expect(tryParseAbsoluteDuePhraseToIso('8 May 2026', ref)).toBe('2026-05-08');
    expect(tryParseAbsoluteDuePhraseToIso('20 April 2026', ref)).toBe('2026-04-20');
  });

  it('normalizes wizard due date without silently guessing invalid text', () => {
    expect(normalizeWizardDueDateToIso('April 20', ref)).toBe('2026-04-20');
    expect(normalizeWizardDueDateToIso('8 may', ref)).toBe('2026-05-08');
    expect(normalizeWizardDueDateToIso('not a date', ref)).toBeNull();
    expect(normalizeWizardDueDateToIso('8', ref)).toBeNull();
  });

  it('flags past due dates and suggests next year', () => {
    expect(validateAssistantDueDateIso('2026-04-20', new Date('2026-05-01T12:00:00.000Z'))).toEqual({
      ok: false,
      suggestedIso: '2027-04-20',
    });
    expect(validateAssistantDueDateIso('2026-06-20', new Date('2026-05-01T12:00:00.000Z'))).toEqual({
      ok: true,
    });
  });
});

