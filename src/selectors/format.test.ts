import { formatMoney, formatPercent, roundHalfUp } from './format';

describe('display formatting', () => {
  it('rounds half up for display only', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(3.49)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(formatPercent(5 / 12)).toBe('42%'); // K1.2.1: (52 − 47) ÷ (52 − 40)
  });
  it('formats money from minor units in en-GB style', () => {
    expect(formatMoney({ amountMinor: 120_000_000, currency: 'ZMW' })).toBe('ZMW 1,200,000');
  });
});
