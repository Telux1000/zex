import { describe, expect, it } from 'vitest';
import { tryParseDeterministicWizardLineItems } from './wizard-line-items-deterministic';

describe('tryParseDeterministicWizardLineItems', () => {
  it('parses qty name at price', () => {
    const r = tryParseDeterministicWizardLineItems('Invoice Young Ltd for 5 Cars at 800 each');
    expect(r).not.toBeNull();
    expect(r![0]).toMatchObject({ name: 'Cars', quantity: 5, unit_price: 800 });
  });

  it('parses comma-separated lines', () => {
    const r = tryParseDeterministicWizardLineItems('4 Chairs at 400, 7 Tables at 50');
    expect(r).not.toBeNull();
    expect(r).toHaveLength(2);
    expect(r![0]).toMatchObject({ name: 'Chairs', quantity: 4, unit_price: 400 });
    expect(r![1]).toMatchObject({ name: 'Tables', quantity: 7, unit_price: 50 });
  });

  it('parses @ form', () => {
    const r = tryParseDeterministicWizardLineItems('10 widgets @ 12.50');
    expect(r).not.toBeNull();
    expect(r![0]).toMatchObject({ name: 'widgets', quantity: 10, unit_price: 12.5 });
  });

  it('parses name $price with implicit qty 1', () => {
    const r = tryParseDeterministicWizardLineItems('Logo design $500');
    expect(r).not.toBeNull();
    expect(r![0]).toMatchObject({ name: 'Logo design', quantity: 1, unit_price: 500 });
  });

  it('returns null for commands', () => {
    expect(tryParseDeterministicWizardLineItems('undo')).toBeNull();
  });

  it('returns null when no line pattern', () => {
    expect(tryParseDeterministicWizardLineItems('What is revenue last month?')).toBeNull();
  });
});
