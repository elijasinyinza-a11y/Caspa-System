import type { ISODate, Kpi } from '../contract/caspa-data-contract';
import { createSeed, FY } from '../data/sample/seed';
import type { Store } from '../data/access/store';
import { roundHalfUp } from '../selectors/format';
import { expectedToDate, goalProgress, kpiProgress, objectiveProgress, statusFor } from './kpi-progress';

const MID_YEAR = '2026-06-30' as ISODate;
const ctx = (now: ISODate = MID_YEAR) => ({ financialYear: FY, now });
const k = (s: Store, code: string) => s.kpis.find((x) => x.code === code)!;
const pct = (x: number | null) => (x === null ? null : roundHalfUp(x * 100));
const T = { onTrackAt: 0.9, atRiskAt: 0.7 };

describe('KPI progress P1–P10', () => {
  it('P1: K1.2.1 (lower is better, 52 → 40, actual 47) is 42%', () => {
    const p = kpiProgress(createSeed(), k(createSeed(), 'K1.2.1'), ctx());
    expect(p.kind).toBe('percent');
    expect(p.progress).toBeCloseTo(5 / 12, 10);
    expect(pct(p.progress)).toBe(42);
  });

  it('P10: K1.2.1 at mid-year shows "At risk"', () => {
    expect(kpiProgress(createSeed(), k(createSeed(), 'K1.2.1'), ctx()).status).toBe('at_risk');
  });

  it('P10: on 18 October 2026 the same reading is "Behind", because more of the year is expected', () => {
    expect(kpiProgress(createSeed(), k(createSeed(), 'K1.2.1'), ctx('2026-10-18' as ISODate)).status).toBe('behind');
  });

  it('P10: thresholds are inclusive at 90% and 70% of expected', () => {
    expect(statusFor(0.45, 0.5, T)).toBe('on_track');
    expect(statusFor(0.35, 0.5, T)).toBe('at_risk');
    expect(statusFor(0.3499, 0.5, T)).toBe('behind');
    expect(statusFor(0.1, 0, T)).toBe('on_track'); // nothing expected yet
  });

  it('P10: expected-to-date runs from 0 at the start of the year to 1 at its end', () => {
    expect(expectedToDate(2026, 1, '2026-12-31' as ISODate)).toBe(1);
    expect(expectedToDate(2026, 1, '2026-01-01' as ISODate)).toBeCloseTo(1 / 365, 10);
    expect(expectedToDate(2026, 7, '2026-12-31' as ISODate)).toBeCloseTo(184 / 365, 10); // July–June year
  });

  it('P1: higher is better — supply hours 14 → 18, actual 16 is 50%', () => {
    const s = createSeed();
    s.kpiActuals.push({ ...s.kpiActuals[0]!, id: 'ka-x' as never, kpiId: k(s, 'K2.1.1').id, value: 16 });
    expect(pct(kpiProgress(s, k(s, 'K2.1.1'), ctx()).progress)).toBe(50);
  });

  it('P2: sum and average aggregation', () => {
    const s = createSeed();
    const kp = k(s, 'K2.1.1');
    [['2026-04-30', 15], ['2026-05-31', 17]].forEach(([d, v], i) =>
      s.kpiActuals.push({ ...s.kpiActuals[0]!, id: `ka-${i}` as never, kpiId: kp.id, periodEnd: d as ISODate, value: v as number }));
    kp.aggregation = 'average';
    expect(kpiProgress(s, kp, ctx()).actual).toBe(16);
    kp.aggregation = 'sum';
    expect(kpiProgress(s, kp, ctx()).actual).toBe(32);
    kp.aggregation = 'latest';
    expect(kpiProgress(s, kp, ctx()).actual).toBe(17);
  });

  it('P2: readings after "now" or outside the year are ignored', () => {
    const s = createSeed();
    expect(kpiProgress(s, k(s, 'K1.2.1'), ctx('2026-05-31' as ISODate)).kind).toBe('no_data');
  });

  it('P3: true value shown, clamped for bars; worse than baseline is negative', () => {
    const s = createSeed();
    s.kpiActuals[0]!.value = 37; // beyond target
    let p = kpiProgress(s, k(s, 'K1.2.1'), ctx());
    expect(pct(p.progress)).toBe(125);
    expect(p.clamped).toBe(1);
    s.kpiActuals[0]!.value = 55; // worse than baseline
    p = kpiProgress(s, k(s, 'K1.2.1'), ctx());
    expect(pct(p.progress)).toBe(-25);
    expect(p.clamped).toBe(0);
  });

  it('P4: missing baseline — zero for higher is better, target check for lower is better', () => {
    const s = createSeed();
    const hi = k(s, 'K2.1.1');
    hi.baseline = null;
    s.kpiActuals.push({ ...s.kpiActuals[0]!, id: 'ka-h' as never, kpiId: hi.id, value: 9 });
    const ph = kpiProgress(s, hi, ctx());
    expect(ph.baselineAssumedZero).toBe(true);
    expect(pct(ph.progress)).toBe(50); // 9 of 18
    const lo = k(s, 'K1.2.1');
    lo.baseline = null;
    const pl = kpiProgress(s, lo, ctx());
    expect(pl.kind).toBe('target_check');
    expect(pl.progress).toBeNull();
    expect(pl.status).toBe('target_not_met');
  });

  it('P5: milestone KPI progress is the weight completed', () => {
    const s = createSeed();
    const m: Kpi = { ...k(s, 'K4.1.1'), direction: 'milestone', milestones: [
      { id: 'm1', label: 'One', weight: 1, completedOn: '2026-03-01' as ISODate },
      { id: 'm2', label: 'Two', weight: 1, completedOn: null },
      { id: 'm3', label: 'Three', weight: 2, completedOn: '2026-09-01' as ISODate },
    ] };
    expect(pct(kpiProgress(s, m, ctx()).progress)).toBe(25); // m3 not yet done at mid-year
    expect(pct(kpiProgress(s, m, ctx('2026-10-18' as ISODate)).progress)).toBe(75);
  });

  it('P6: no reading is "No data", never 0%', () => {
    const s = createSeed();
    const p = kpiProgress(s, k(s, 'K1.1.1'), ctx());
    expect(p.kind).toBe('no_data');
    expect(p.progress).toBeNull();
    expect(p.status).toBe('no_data');
  });

  it('P7: objective is the mean of reporting KPIs and says how many report', () => {
    const s = createSeed();
    const o = s.objectives.find((x) => x.code === 'O1.2')!;
    const r = objectiveProgress(s, o, ctx());
    expect(pct(r.progress)).toBe(42);
    expect([r.reporting, r.total]).toEqual([1, 1]);
  });

  it('P7: goal is the mean of objectives; objectives with no data are left out but counted', () => {
    const s = createSeed();
    const r = goalProgress(s, s.goals.find((g) => g.code === 'G1')!, ctx());
    expect(pct(r.progress)).toBe(42); // O1.1 has no data
    expect([r.reporting, r.total]).toEqual([1, 2]);
    expect(r.status).toBe('at_risk');
  });

  it('P7: activity completion never counts as KPI progress', () => {
    const s = createSeed();
    s.activityProgress[0]!.quantityDone = 1800; // meters all replaced
    expect(pct(kpiProgress(s, k(s, 'K1.2.1'), ctx()).progress)).toBe(42);
  });

  it('P3: roll-ups clamp each KPI, so one over-achiever cannot hide a failing KPI', () => {
    const s = createSeed();
    const o = s.objectives.find((x) => x.code === 'O1.2')!;
    s.kpis.push({ ...k(s, 'K1.2.1'), id: 'k1.2.2' as never, code: 'K1.2.2', direction: 'higher_is_better', baseline: 0 });
    s.kpiTargets.push({ ...s.kpiTargets[0]!, id: 'kt-x' as never, kpiId: 'k1.2.2' as never, target: 10 });
    s.kpiActuals.push({ ...s.kpiActuals[0]!, id: 'ka-y' as never, kpiId: 'k1.2.2' as never, value: 30 }); // 300%
    s.kpiActuals[0]!.value = 55; // K1.2.1 worse than baseline
    expect(pct(objectiveProgress(s, o, ctx()).progress)).toBe(50); // (1 + 0) / 2
  });

  it('P9: a target equal to its baseline yields no progress figure', () => {
    const s = createSeed();
    s.kpiTargets.find((t) => t.kpiId === k(s, 'K1.2.1').id)!.target = 52;
    expect(kpiProgress(s, k(s, 'K1.2.1'), ctx()).kind).toBe('invalid');
  });
});
