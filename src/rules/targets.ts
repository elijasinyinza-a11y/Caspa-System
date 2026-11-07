/**
 * Performance › Targets rules (v0.21.0; Targets Specification v0.1, TG-1 to TG-11; contract v1.13). Pure functions:
 * combining unit shares, the figures a contract objective is scored from, the Targets checks, the standing-duty limit
 * and the final-period check (TG-8). No React, no I/O, no system clock.
 */
import type { ContractObjective, FinancialYear, ISODate, KpiBreakdown, KpiShare, ShareReading } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';

export const sharesOf = (s: Store, breakdownId: string): KpiShare[] => s.kpiShares.filter((x) => x.breakdownId === breakdownId);
export const breakdownOf = (s: Store, kpiId: string, fy: FinancialYear): KpiBreakdown | undefined => s.kpiBreakdowns.find((b) => b.kpiId === kpiId && b.financialYear === fy);
export const corporateTarget = (s: Store, kpiId: string, fy: FinancialYear): number | null => s.kpiTargets.find((t) => t.kpiId === kpiId && t.financialYear === fy)?.target ?? null;
export const lowerIsBetter = (s: Store, kpiId: string): boolean => s.kpis.find((k) => k.id === kpiId)?.direction === 'lower_is_better';

/** The latest verified reading on or before "now"; a later verified correction for the same period wins (as OP-4). */
export function latestVerifiedReading(s: Store, shareId: string, now: ISODate): ShareReading | null {
  const rs = s.shareReadings.filter((r) => r.shareId === shareId && r.verified && r.periodEnd <= now);
  rs.sort((a, b) => (a.periodEnd === b.periodEnd ? (a.verified!.by.at < b.verified!.by.at ? -1 : 1) : a.periodEnd < b.periodEnd ? -1 : 1));
  return rs[rs.length - 1] ?? null;
}

/** The one combining rule (TG-1, TG-2): add up, weighted average by planned weights, or not combined. */
export function combine(rule: KpiBreakdown['combine'], items: { value: number; weight: number | null }[]): number | null {
  if (rule === 'none' || items.length === 0) return null;
  if (rule === 'sum') return items.reduce((a, x) => a + x.value, 0);
  const w = items.filter((x) => x.weight !== null && x.weight > 0);
  const total = w.reduce((a, x) => a + x.weight!, 0);
  return total > 0 ? w.reduce((a, x) => a + x.weight! * x.value, 0) / total : null;
}

export const combinedTarget = (s: Store, b: KpiBreakdown): number | null => combine(b.combine, sharesOf(s, b.id).map((x) => ({ value: x.target, weight: x.weight })));

/** The combined figure from verified readings only; "covered" says how many shares it rests on. */
export function combinedLatest(s: Store, b: KpiBreakdown, now: ISODate): { value: number | null; covered: number; of: number } {
  const shares = sharesOf(s, b.id);
  const items = shares.flatMap((x) => { const r = latestVerifiedReading(s, x.id, now); return r ? [{ value: r.value, weight: x.weight }] : []; });
  return { value: items.length === shares.length ? combine(b.combine, items) : null, covered: items.length, of: shares.length };
}

/**
 * The target and verified figure a contract objective is scored from (R1 basis), and whether lower is better.
 * Activities and standing duties: quantity and verified progress updates, as before. A share: its target and latest
 * verified reading. A breakdown: the combined target and combined verified figure.
 */
export function objectiveBasis(s: Store, co: ContractObjective, now: ISODate, verifiedDone: () => number | null): { target: number | null; done: number | null; lower: boolean } {
  if (co.sourceShareId) {
    const sh = s.kpiShares.find((x) => x.id === co.sourceShareId);
    const b = sh && s.kpiBreakdowns.find((x) => x.id === sh.breakdownId);
    return { target: sh?.target ?? null, done: sh ? (latestVerifiedReading(s, sh.id, now)?.value ?? null) : null, lower: !!b && lowerIsBetter(s, b.kpiId) };
  }
  if (co.sourceBreakdownId) {
    const b = s.kpiBreakdowns.find((x) => x.id === co.sourceBreakdownId);
    return { target: b ? combinedTarget(s, b) : null, done: b ? combinedLatest(s, b, now).value : null, lower: !!b && lowerIsBetter(s, b.kpiId) };
  }
  return { target: (co.snapshot?.quantityTarget ?? co.quantityTarget)?.value ?? null, done: verifiedDone(), lower: co.direction === 'lower_is_better' };
}

export type TargetsCheck =
  | { kind: 'short_of_target'; breakdownId: string; combined: number; corporate: number }
  | { kind: 'no_owner'; shareId: string }
  | { kind: 'no_work'; shareId: string }
  | { kind: 'not_carried'; kpiId: string };

/** The breakdown's checks (section 4 of the specification). */
export function breakdownChecks(s: Store, b: KpiBreakdown): TargetsCheck[] {
  const out: TargetsCheck[] = [];
  const corp = corporateTarget(s, b.kpiId, b.financialYear);
  const comb = combinedTarget(s, b);
  if (corp !== null && comb !== null) {
    const short = lowerIsBetter(s, b.kpiId) ? comb > corp + 1e-9 : comb < corp - 1e-9;
    if (short) out.push({ kind: 'short_of_target', breakdownId: b.id, combined: comb, corporate: corp });
  }
  for (const x of sharesOf(s, b.id)) {
    if (!x.ownerPositionId) out.push({ kind: 'no_owner', shareId: x.id });
    else if (!s.contractObjectives.some((co) => co.servesShareId === x.id || co.sourceShareId === x.id)) out.push({ kind: 'no_work', shareId: x.id });
  }
  return out;
}

/** Cascade KPIs with a target this year that nobody in Performance carries: no breakdown and in no contract. */
export function notCarried(s: Store, fy: FinancialYear): string[] {
  const contracts = new Set(s.contracts.filter((c) => c.financialYear === fy).map((c) => c.id as string));
  const inContracts = new Set(s.contractObjectives.filter((co) => contracts.has(co.contractId)).flatMap((co) => {
    const b = co.sourceBreakdownId ? s.kpiBreakdowns.find((x) => x.id === co.sourceBreakdownId) : co.sourceShareId ? s.kpiBreakdowns.find((x) => x.id === s.kpiShares.find((y) => y.id === co.sourceShareId)?.breakdownId) : undefined;
    return b ? [b.kpiId as string] : [];
  }));
  return s.kpiTargets.filter((t) => t.financialYear === fy).map((t) => t.kpiId as string)
    .filter((k, i, a) => a.indexOf(k) === i && !breakdownOf(s, k, fy) && !inContracts.has(k));
}

/** Weight carried by standing duties in a contract, against HR's limit (TG-6). */
export function standingDutyShare(s: Store, contractId: string): { pct: number; limit: number; over: boolean } {
  const pct = s.contractObjectives.filter((co) => co.contractId === contractId && co.standingDuty).reduce((a, co) => a + co.weightPct, 0);
  const limit = s.organisation.settings.standingDutyLimitPct;
  return { pct, limit, over: pct > limit };
}

/** The last day of a financial year. */
export function yearEnd(fy: FinancialYear, startMonth: number): ISODate {
  const d = new Date(Date.UTC(fy + 1, startMonth - 1, 0));
  return d.toISOString().slice(0, 10) as ISODate;
}

/**
 * TG-8: figures for the year's last period that were sent but are not yet verified or returned, for these contracts
 * (progress updates) and these shares (readings). Worth checking before a year-end review is completed or the year closed.
 */
export function finalPeriodPending(s: Store, contractIds: string[], shareIds: string[], fy: FinancialYear): { updates: string[]; readings: string[] } {
  const end = yearEnd(fy, s.organisation.financialYearStartMonth);
  const cos = new Set(s.contractObjectives.filter((co) => contractIds.includes(co.contractId)).map((co) => co.id as string));
  return {
    updates: s.progressUpdates.filter((u) => cos.has(u.contractObjectiveId) && u.periodEnd === end && !u.verified && !u.returned).map((u) => u.id),
    readings: s.shareReadings.filter((r) => shareIds.includes(r.shareId) && r.periodEnd === end && !r.verified && !r.returned).map((r) => r.id),
  };
}

/* ── v0.25.0 (Finish Targets Specification v0.1, TG-4, F1, F2) ── */

/** A share's verified reading for exactly this period; a later verified correction for the same period wins. */
function verifiedFor(s: Store, shareId: string, periodEnd: ISODate): ShareReading | null {
  const rs = s.shareReadings.filter((r) => r.shareId === shareId && r.verified && r.periodEnd === periodEnd);
  rs.sort((a, b) => (a.verified!.by.at < b.verified!.by.at ? -1 : 1));
  return rs[rs.length - 1] ?? null;
}

export interface FromShares {
  /** Combined figures for every period in the year where every share has a verified reading, oldest first (F1). */
  periods: { periodEnd: ISODate; value: number }[];
  /** The latest period any share has reported (verified), and how many shares have it, for "3 of 4 reported". */
  latest: { periodEnd: ISODate; reported: number } | null;
  of: number;
}

/**
 * TG-4: the corporate KPI's figure from its shares, when the year's breakdown combines them (sum or weighted average).
 * Only verified readings count; only complete periods count (a partial sum would understate). Null when the KPI is
 * not broken down that year, or its shares are "Not combined", so the KPI keeps its own readings.
 */
export function fromShares(s: Store, kpiId: string, fy: FinancialYear, start: ISODate, now: ISODate): FromShares | null {
  const b = breakdownOf(s, kpiId, fy);
  if (!b || b.combine === 'none') return null;
  const shares = sharesOf(s, b.id);
  if (!shares.length) return null;
  const ids = new Set(shares.map((x) => x.id as string));
  const ends = [...new Set(s.shareReadings.filter((r) => ids.has(r.shareId) && r.verified && r.periodEnd >= start && r.periodEnd <= now).map((r) => r.periodEnd))].sort();
  const periods = ends.flatMap((p) => {
    const items = shares.map((x) => { const r = verifiedFor(s, x.id, p); return r ? { value: r.value, weight: x.weight } : null; });
    if (items.some((x) => x === null)) return [];
    const v = combine(b.combine, items as { value: number; weight: number | null }[]);
    return v === null ? [] : [{ periodEnd: p, value: v }];
  });
  const last = ends[ends.length - 1];
  return { periods, latest: last ? { periodEnd: last, reported: shares.filter((x) => verifiedFor(s, x.id, last)).length } : null, of: shares.length };
}

/** F10: the combining rule a breakdown starts from, by the KPI's unit; the owner confirms or changes it. */
export function suggestedCombine(unit: string): KpiBreakdown['combine'] {
  const u = unit.trim().toLowerCase();
  return u.includes('%') || u.includes('percent') || u.includes('ratio') || u.includes('rate') || u.includes('per ') || u.startsWith('/') ? 'weighted' : 'sum';
}

/** F11: an unusual combining choice, worth checking, never blocking: adding up percentages, or averaging money. */
export function unusualCombine(unit: string, rule: KpiBreakdown['combine'], currency: string): 'sum_of_rates' | 'average_of_money' | null {
  const u = unit.trim().toLowerCase();
  if (rule === 'sum' && suggestedCombine(unit) === 'weighted') return 'sum_of_rates';
  if (rule === 'weighted' && (u === currency.toLowerCase() || u.includes('money') || u.includes('amount'))) return 'average_of_money';
  return null;
}
