import { describe, expect, it } from 'vitest';
import { shouldExitCustomerInlineEditForStrongIntent } from '@/lib/customers/customer-inline-edit-strong-intent';

describe('shouldExitCustomerInlineEditForStrongIntent', () => {
  it('exits for new customer creation phrasing', () => {
    expect(shouldExitCustomerInlineEditForStrongIntent('create a new customer Haret LLC', null)).toBe(true);
    expect(shouldExitCustomerInlineEditForStrongIntent('Create customer Acme', null)).toBe(true);
    expect(shouldExitCustomerInlineEditForStrongIntent('add a new customer', null)).toBe(true);
  });

  it('exits for invoice intents', () => {
    expect(shouldExitCustomerInlineEditForStrongIntent('create an invoice for Acme', null)).toBe(true);
    expect(shouldExitCustomerInlineEditForStrongIntent('open invoice 1042', null)).toBe(true);
  });

  it('exits for find customer', () => {
    expect(shouldExitCustomerInlineEditForStrongIntent('find customer Basir Limited', null)).toBe(true);
    expect(shouldExitCustomerInlineEditForStrongIntent('edit Haret LLC', null)).toBe(true);
  });

  it('exits for revenue-style queries', () => {
    expect(shouldExitCustomerInlineEditForStrongIntent('how much did we make last month', null)).toBe(true);
    expect(shouldExitCustomerInlineEditForStrongIntent('show revenue this quarter', null)).toBe(true);
  });

  it('does not exit for edit-like phrases', () => {
    expect(shouldExitCustomerInlineEditForStrongIntent('change email to a@b.com', null)).toBe(false);
    expect(shouldExitCustomerInlineEditForStrongIntent('company name', null)).toBe(false);
    expect(shouldExitCustomerInlineEditForStrongIntent('remove address', null)).toBe(false);
    expect(shouldExitCustomerInlineEditForStrongIntent('show details', null)).toBe(false);
    expect(shouldExitCustomerInlineEditForStrongIntent('done', null)).toBe(false);
  });
});
