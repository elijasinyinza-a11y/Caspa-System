/**
 * KPI progress, P1–P10 (approved 18 October 2026). Pure: no React, no I/O, "now" is passed in.
 * Progress values are raw shares (0.42 = 42%), never rounded here (P8) and never stored.
 */
import type { Goal, ISODate, Kpi, Objective } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';

export interface ProgressContext {
  financialYear: number;
  now: ISODate;
}

export type ProgressStatus = 'on_track' | 'at_risk' | 'behind' | 'target_met' | 'target_not_met' | 'no_data';

export interface KpiProgress {
  /** percent: P1/P5 progress computed; target_check: lower is better with no baseline (P4); no_data (P6); no_target; invalid: target equals baseline (P9). */
  kind: 'percent' | 'target_check' | 'no_data' | 'no_target' | 'invalid';
  actual: number | null;
  baseline: number | null; // the baseline used; 0 when assumed (P4)
  baselineAssumedZero: boolean;
  target: number | null;
  /** True value, unclamped: 1.12 for 112%, −0.15 for worse than baseline (P3). Null unless kind is percent. */
  progress: number | null;
  /** Clamped to 0–1 for bars and roll-ups (P3). */
  clamped: number | null;
  /** Share of the year elapsed at "now", assuming steady progress (P10). */
  expected: number;
  status: ProgressStatus;
}

export interface RollUp {
  progress: number | null; // mean of clamped children (P3, P7); null when none report
  reporting: number;
  total: number;
  expected: number;
  status: ProgressStatus;
}

const DAY = 86_400_000;
const toUtc = (d: ISODate) => {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, dd);
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10) as ISODate;

/** First and last day of a financial year for an organisation whose year starts in startMonth. */
export const financialYearBounds = (fy: number, startMonth: number): { start: ISODate; end: ISODate } => {
  const start = Date.UTC(fy, startMonth - 1, 1);
  const next = Date.UTC(fy + 1, startMonth - 1, 1);
  return { start: iso(start), end: iso(next - DAY) };
};

/** P10: share of the financial year elapsed at "now", counting "now" as elapsed; clamped to 0–1. */
export const expectedToDate = (fy: number, startMonth: number, now: ISODate): number => {
  const { start, end } = financialYearBounds(fy, startMonth);
  const total = (toUtc(end) - toUtc(start)) / DAY + 1;
  const elapsed = (toUtc(now) - toUtc(start)) / DAY + 1;
  return Math.min(1, Math.max(0, elapsed / total));
};

/** P10: status from progress against expected-to-date, using the organisation's thresholds. */
export const statusFor = (progress: number, expected: number, t: { onTrackAt: number; atRiskAt: number }): ProgressStatus => {
  if (expected <= 0 || progress >= expected) return 'on_track';
  const share = progress / expected;
  if (share >= t.onTrackAt) return 'on_track';
  if (share >= t.atRiskAt) return 'at_risk';
  return 'behind';
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** P2: the actual for the year to date — latest reading, sum, or average. Null when no reading (P6). */
export const kpiActual = (s: Store, k: Kpi, ctx: ProgressContext): number | null => {
  const { start } = financialYearBounds(ctx.financialYear, s.organisation.financialYearStartMonth);
  const readings = s.kpiActuals
    .filter((a) => a.kpiId === k.id && a.periodEnd >= start && a.periodEnd <= ctx.now)
    .sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0));
  if (readings.length === 0) return null;
  if (k.aggregation === 'latest') return readings[readings.length - 1]!.value;
  const sum = readings.reduce((n, r) => n + r.value, 0);
  return k.aggregation === 'sum' ? sum : sum / readings.length;
};

export function kpiProgress(s: Store, k: Kpi, ctx: ProgressContext): KpiProgress {
  const thresholds = s.organisation.settings.kpiStatus;
  const expected = expectedToDate(ctx.financialYear, s.organisation.financialYearStartMonth, ctx.now);
  const empty = { actual: null, baseline: k.baseline, baselineAssumedZero: false, progress: null, clamped: null, expected };

  // P5: milestone KPIs — total weight of milestones completed by now.
  if (k.direction === 'milestone') {
    const total = k.milestones.reduce((n, m) => n + m.weight, 0);
    if (total <= 0) return { ...empty, kind: 'no_data', target: null, status: 'no_data' };
    const done = k.milestones.filter((m) => m.completedOn !== null && m.completedOn <= ctx.now).reduce((n, m) => n + m.weight, 0);
    const progress = done / total;
    return { ...empty, kind: 'percent', target: null, progress, clamped: clamp01(progress), status: statusFor(progress, expected, thresholds) };
  }

  const target = s.kpiTargets.find((t) => t.kpiId === k.id && t.financialYear === ctx.financialYear)?.target ?? null;
  const actual = kpiActual(s, k, ctx);
  if (target === null) return { ...empty, actual, kind: 'no_target', target, status: 'no_data' };
  if (actual === null) return { ...empty, kind: 'no_data', target, status: 'no_data' };

  // P4: no baseline.
  if (k.baseline === null && k.direction === 'lower_is_better') {
    return { ...empty, actual, kind: 'target_check', target, status: actual <= target ? 'target_met' : 'target_not_met' };
  }
  const baseline = k.baseline ?? 0;
  const baselineAssumedZero = k.baseline === null;
  if (target === baseline) return { ...empty, actual, baseline, baselineAssumedZero, kind: 'invalid', target, status: 'no_data' };

  // P1: movement from baseline as a share of the distance from baseline to target (works in both directions).
  const progress = (actual - baseline) / (target - baseline);
  return {
    kind: 'percent', actual, baseline, baselineAssumedZero, target, progress, clamped: clamp01(progress), expected,
    status: statusFor(progress, expected, thresholds),
  };
}

const rollUp = (s: Store, values: (number | null)[], ctx: ProgressContext): RollUp => {
  const expected = expectedToDate(ctx.financialYear, s.organisation.financialYearStartMonth, ctx.now);
  const reporting = values.filter((v): v is number => v !== null);
  if (reporting.length === 0) return { progress: null, reporting: 0, total: values.length, expected, status: 'no_data' };
  const progress = reporting.reduce((n, v) => n + v, 0) / reporting.length;
  return { progress, reporting: reporting.length, total: values.length, expected, status: statusFor(progress, expected, s.organisation.settings.kpiStatus) };
};

/** P7: an objective's progress is the mean of its KPIs' clamped progress; KPIs with no figure are left out but counted (P6). */
export const objectiveProgress = (s: Store, o: Objective, ctx: ProgressContext): RollUp =>
  rollUp(s, s.kpis.filter((k) => k.objectiveId === o.id).map((k) => kpiProgress(s, k, ctx).clamped), ctx);

/** P7: a goal's progress is the mean of its objectives' progress. */
export const goalProgress = (s: Store, g: Goal, ctx: ProgressContext): RollUp =>
  rollUp(s, s.objectives.filter((o) => o.goalId === g.id).map((o) => objectiveProgress(s, o, ctx).progress), ctx);
