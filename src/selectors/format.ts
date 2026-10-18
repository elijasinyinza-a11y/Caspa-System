/** Display formatting only. Values are never rounded in storage or calculation (P9). */
import type { Money } from '../contract/caspa-data-contract';

/** Round half up, away from zero for negatives, for display only. */
export const roundHalfUp = (x: number, dp = 0): number => {
  const f = 10 ** dp;
  return (Math.sign(x) * Math.floor(Math.abs(x) * f + 0.5)) / f;
};

export const formatNumber = (n: number): string => new Intl.NumberFormat('en-GB').format(n);

export const formatPercent = (share: number): string => `${formatNumber(roundHalfUp(share * 100))}%`;

/** Money is integer minor units; ZMW has 100 ngwee to the kwacha. */
export const formatMoney = (m: Money): string => {
  const major = m.amountMinor / 100;
  const whole = Number.isInteger(major);
  return `${m.currency} ${new Intl.NumberFormat('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(major)}`;
};
