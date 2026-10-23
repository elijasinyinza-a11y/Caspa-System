/** Display formatting only. Values are never rounded in storage or calculation. */
import type { ISODate, Money } from '../contract/caspa-data-contract';

/** Round half up, away from zero for negatives, for display only. */
export const roundHalfUp = (x: number, dp = 0): number => {
  const f = 10 ** dp;
  return (Math.sign(x) * Math.floor(Math.abs(x) * f + 0.5)) / f;
};

export const formatNumber = (n: number): string => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(n);

export const formatPercent = (share: number): string => `${formatNumber(roundHalfUp(share * 100))}%`;

/**
 * ISO 4217 minor units for currencies that do not use two decimal places. Every other code uses two.
 * Held here rather than read from Intl, so formatting is the same on every runtime and on the server.
 */
const MINOR_UNITS: Record<string, number> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
};
export const minorUnitsOf = (currency: string): number => MINOR_UNITS[currency] ?? 2;

/** Money is integer minor units. Whole amounts show no decimals; part amounts show the currency's full minor units. */
export const formatMoney = (m: Money): string => {
  const digits = minorUnitsOf(m.currency);
  const major = m.amountMinor / 10 ** digits;
  const whole = m.amountMinor % 10 ** digits === 0;
  const n = new Intl.NumberFormat('en-GB', { minimumFractionDigits: whole ? 0 : digits, maximumFractionDigits: digits }).format(major);
  return `${m.currency} ${n}`;
};

/** A financial year is numbered by the calendar year it starts in: FY2026 for January years, FY2026/27 otherwise. */
export const formatFinancialYear = (fy: number, startMonth: number): string =>
  startMonth === 1 ? `FY${fy}` : `FY${fy}/${String((fy + 1) % 100).padStart(2, '0')}`;

/** Calendar dates as 14 October 2026. ISO dates carry no time, so no time-zone shift can apply. */
export const formatDate = (d: ISODate): string => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, day)));
};

/** The calendar date of an instant in the organisation's time zone, for display with formatDate. */
export const dateInZone = (at: string, timeZone: string): ISODate =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at)) as ISODate;
