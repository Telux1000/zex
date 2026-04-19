import { describe, expect, it } from 'vitest';
import {
  parseCustomerInlineEditCommand,
  parseCustomerInlineEditIntent,
} from '@/lib/customers/parse-customer-inline-edit-intent';

describe('parseCustomerInlineEditIntent (legacy)', () => {
  it('parses email change', () => {
    expect(parseCustomerInlineEditIntent('change the email to hello@basir.com')).toEqual({
      kind: 'patch',
      key: 'email',
      value: 'hello@basir.com',
    });
  });

  it('parses phone update', () => {
    expect(parseCustomerInlineEditIntent('update the phone number to +1 555 0100')).toEqual({
      kind: 'patch',
      key: 'phone',
      value: '+1 555 0100',
    });
  });

  it('parses address', () => {
    expect(parseCustomerInlineEditIntent('change the address to 12 Main St')).toEqual({
      kind: 'patch',
      key: 'address_line1',
      value: '12 Main St',
    });
  });

  it('returns need_value for bare update phone', () => {
    expect(parseCustomerInlineEditIntent('update the phone number')).toEqual({
      kind: 'need_value',
      key: 'phone',
    });
  });

  it('returns unclear for unrelated text', () => {
    expect(parseCustomerInlineEditIntent('create an invoice for Acme')).toEqual({ kind: 'unclear' });
  });

  it('parses open form', () => {
    expect(parseCustomerInlineEditIntent('open form')).toEqual({ kind: 'open_form' });
    expect(parseCustomerInlineEditIntent('edit manually')).toEqual({ kind: 'open_form' });
  });

  it('parses clear address', () => {
    expect(parseCustomerInlineEditIntent('remove address')).toEqual({ kind: 'clear_address' });
  });

  it('parses set contact person', () => {
    expect(parseCustomerInlineEditIntent('set contact person to John')).toEqual({
      kind: 'patch',
      key: 'name',
      value: 'John',
    });
  });
});

describe('parseCustomerInlineEditCommand', () => {
  it('parses natural address sentence', () => {
    expect(
      parseCustomerInlineEditCommand('the address is 17 estcost street, Chicago, USA')
    ).toEqual({
      kind: 'direct_update',
      key: 'address_line1',
      value: '17 estcost street, Chicago, USA',
    });
  });

  it('parses change contact person', () => {
    expect(parseCustomerInlineEditCommand('change contact person to Mark David')).toEqual({
      kind: 'direct_update',
      key: 'name',
      value: 'Mark David',
    });
  });

  it('bare name is ambiguous', () => {
    expect(parseCustomerInlineEditCommand('name')).toEqual({ kind: 'ambiguous_name' });
    expect(parseCustomerInlineEditCommand('the name')).toEqual({ kind: 'ambiguous_name' });
  });

  it('company name alone is field focus', () => {
    expect(parseCustomerInlineEditCommand('company name')).toEqual({
      kind: 'field_focus',
      key: 'company',
    });
  });

  it('session and switch commands', () => {
    expect(parseCustomerInlineEditCommand('switch customer')).toEqual({ kind: 'switch_customer' });
    expect(parseCustomerInlineEditCommand('edit another customer')).toEqual({ kind: 'switch_customer' });
    expect(parseCustomerInlineEditCommand('show details')).toEqual({ kind: 'show_review' });
    expect(parseCustomerInlineEditCommand('review')).toEqual({ kind: 'show_review' });
  });

  it('clear field targets', () => {
    expect(parseCustomerInlineEditCommand('remove phone number')).toEqual({
      kind: 'clear_field',
      target: 'phone',
    });
    expect(parseCustomerInlineEditCommand('clear contact person')).toEqual({
      kind: 'clear_field',
      target: 'name',
    });
    expect(parseCustomerInlineEditCommand('delete email')).toEqual({
      kind: 'clear_field',
      target: 'email',
    });
  });

  it('email address alias', () => {
    expect(parseCustomerInlineEditCommand('email address')).toEqual({
      kind: 'field_focus',
      key: 'email',
    });
  });

  it('telephone alias', () => {
    expect(parseCustomerInlineEditCommand('telephone')).toEqual({
      kind: 'field_focus',
      key: 'phone',
    });
  });
});
