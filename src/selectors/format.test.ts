import type { ISODate } from '../contract/caspa-data-contract';
import { formatDate, formatFinancialYear, formatMoney, formatPercent, roundHalfUp } from './format';

describe('display formatting', () => {
  it('rounds half up for display only', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(3.49)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(formatPercent(5 / 12)).toBe('42%'); // K1.2.1: (52 − 47) ÷ (52 − 40)
  });

  it('formats money from minor units in en-GB style, with each currency’s ISO 4217 minor units', () => {
    expect(formatMoney({ amountMinor: 120_000_000, currency: 'ZMW' })).toBe('ZMW 1,200,000');
    expect(formatMoney({ amountMinor: 123_456, currency: 'ZMW' })).toBe('ZMW 1,234.56');
    expect(formatMoney({ amountMinor: 4_500_000, currency: 'UGX' })).toBe('UGX 4,500,000');
    expect(formatMoney({ amountMinor: 750_000, currency: 'RWF' })).toBe('RWF 750,000');
    expect(formatMoney({ amountMinor: 1_000, currency: 'XOF' })).toBe('XOF 1,000');
    expect(formatMoney({ amountMinor: 1_234_500, currency: 'KWD' })).toBe('KWD 1,234.500');
  });

  it('numbers financial years by the calendar year they start in', () => {
    expect(formatFinancialYear(2026, 1)).toBe('FY2026');
    expect(formatFinancialYear(2026, 7)).toBe('FY2026/27');
    expect(formatFinancialYear(2099, 4)).toBe('FY2099/00');
  });

  it('formats dates as 14 October 2026', () => {
    expect(formatDate('2026-10-14' as ISODate)).toBe('14 October 2026');
  });
});
