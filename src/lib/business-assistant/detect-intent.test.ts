import { describe, expect, it } from 'vitest';
import { detectAssistantIntentCategory } from '@/lib/business-assistant/detect-intent';

describe('detectAssistantIntentCategory', () => {
  it('routes paid-invoice money questions with an explicit period to financial_queries (before broad invoice rule)', () => {
    expect(
      detectAssistantIntentCategory(
        'what is total amount of paid invoice for the past 90 days?',
        null
      )
    ).toBe('financial_queries');
  });

  it('routes paid invoices + period to financial_queries (payments-collected family beats invoice wizard)', () => {
    expect(detectAssistantIntentCategory('how many paid invoices last week?', null)).toBe(
      'financial_queries'
    );
    expect(detectAssistantIntentCategory('list paid invoices from last month', null)).toBe(
      'financial_queries'
    );
  });

  it('routes global revenue / collected KPIs to financial_queries (not general → invoice wizard)', () => {
    const cases = [
      'how much was made only last month?',
      'how much was made last month',
      'revenue last month',
      'total paid last month',
      'how much did we collect last month',
    ];
    for (const text of cases) {
      expect(detectAssistantIntentCategory(text, null)).toBe('financial_queries');
    }
  });

  it('routes partially paid invoice count to financial_queries', () => {
    expect(detectAssistantIntentCategory('how many partially paid invoices do i have', null)).toBe(
      'financial_queries'
    );
  });

  it('routes partially paid invoice detail (list / balances) to financial_queries', () => {
    expect(detectAssistantIntentCategory('list my partially paid invoices', null)).toBe(
      'financial_queries'
    );
    expect(
      detectAssistantIntentCategory('show total paid and balance for partially paid invoices', null)
    ).toBe('financial_queries');
  });
});
