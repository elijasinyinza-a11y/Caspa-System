import { RATING_PRESETS, type ContractObjective, type ISODate, type Review } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { createSampleOrgs } from '../data/sample/all';
import { createSeed } from '../data/sample/seed';
import { bandFor, labelOf, labelScore, rateContract } from './rating';

const NOW = '2026-10-18' as ISODate;
const A = RATING_PRESETS.A;
const B = RATING_PRESETS.B;

/** A copy of the seed with the Zone B objectives' verified quantities replaced. */
function withDone(done: [number, number], weights: [number, number] = [50, 50], mutate?: (s: Store) => void) {
  const s = createSeed();
  s.progressUpdates.find((u) => u.contractObjectiveId === 'co-b-1')!.quantityDone = done[0];
  s.progressUpdates.find((u) => u.contractObjectiveId === 'co-b-2')!.quantityDone = done[1];
  s.contractObjectives.find((c) => c.id === 'co-b-1')!.weightPct = weights[0];
  s.contractObjectives.find((c) => c.id === 'co-b-2')!.weightPct = weights[1];
  mutate?.(s);
  return rateContract(s, 'pc-mrb-2026', { now: NOW })!;
}
const review = (s: Store): Review => s.reviews.find((r) => r.id === 'rv-mrb-2026-mid')!;

describe('bands (R2): lower bound inclusive, unrounded', () => {
  it('104.6% under preset A is 3', () => expect(bandFor(1.046, A)).toBe(3));
  it('exactly 105% under preset A is 4, and just below is 3', () => {
    expect(bandFor(1.05, A)).toBe(4);
    expect(bandFor(1.0499999, A)).toBe(3);
  });
  it('the lowest band has no lower bound', () => {
    expect(bandFor(0, A)).toBe(1);
    expect(bandFor(-0.2, A)).toBe(1);
  });
  it('preset B moves the boundaries', () => {
    expect(bandFor(0.96, A)).toBe(3);
    expect(bandFor(0.96, B)).toBe(2);
    expect(bandFor(1.13, B)).toBe(5);
  });
});

describe('overall label (R3): rounding half up, score itself unrounded', () => {
  it('3.50 is "Exceeds" and 3.49 is "Meets"', () => {
    expect(labelOf(labelScore(3.5), A)).toBe('Exceeds');
    expect(labelOf(labelScore(3.49), A)).toBe('Meets');
  });
  it('200% and 50% on equal weights gives 3.0', () => {
    const r = withDone([800, 1200]); // 800/400 = 200%, 1,200/2,400 = 50%
    expect(r.objectives.map((o) => o.score)).toEqual([5, 1]);
    expect(r.overall).toBe(3);
    expect(r.label).toBe('Meets');
  });
  it('weights apply (R4): 75/25 on scores 5 and 1 is 4.0', () => {
    expect(withDone([800, 1200], [75, 25]).overall).toBe(4);
  });
});

describe('Sample Water Utility: Meter Reader, Zone B, at 18 October 2026', () => {
  const r = rateContract(createSeed(), 'pc-mrb-2026', { now: NOW })!;
  it('scores from verified progress against the full-year personal target', () => {
    expect(r.objectives.map((o) => [o.done, o.target, o.score])).toEqual([[140, 400, 1], [2210, 2400, 2]]);
    expect(r.objectives[0]!.achievement).toBe(0.35);
    expect(r.overall).toBe(1.5);
    expect(r.label).toBe('Partly meets');
    expect(r.provisional).toBe(true);
    expect(r.scoredWeightPct).toBe(100);
  });
  it('raises one advisory flag to the next-level reviewer for the objective scored 1', () => {
    expect(r.flags).toEqual([{ kind: 'objective_scored_one', contractObjectiveId: 'co-b-1', achievement: 0.35, routeToPositionIds: ['pos-cm'] }]);
  });
  it('a draft contract with no objectives has no score', () => {
    const d = rateContract(createSeed(), 'pc-mrc-2026', { now: NOW })!;
    expect(d.overall).toBeNull();
    expect(d.label).toBeNull();
  });
});

describe('verified progress only (R6)', () => {
  it('unverified updates never count, and no verified figure is not zero', () => {
    const s = createSeed();
    s.progressUpdates.forEach((u) => (u.verified = null));
    const r = rateContract(s, 'pc-mrb-2026', { now: NOW })!;
    expect(r.objectives.map((o) => [o.basis, o.score, o.achievement])).toEqual([['not_verified', null, null], ['not_verified', null, null]]);
    expect(r.overall).toBeNull();
  });
  it('updates after "now" are ignored', () => {
    expect(rateContract(createSeed(), 'pc-mrb-2026', { now: '2026-06-29' as ISODate })!.overall).toBeNull();
  });
  it('the overall is computed over scored weight only, and says so', () => {
    const s = createSeed();
    s.progressUpdates.find((u) => u.contractObjectiveId === 'co-b-1')!.verified = null;
    const r = rateContract(s, 'pc-mrb-2026', { now: NOW })!;
    expect(r.overall).toBe(2);
    expect([r.scoredWeightPct, r.totalWeightPct]).toEqual([50, 100]);
  });
});

describe('safeguards', () => {
  it('flags achievement above 150%, and not at exactly 150%', () => {
    expect(withDone([600, 2400]).flags.map((f) => f.kind)).toEqual([]); // 150%
    expect(withDone([601, 2400]).flags.map((f) => [f.kind, f.contractObjectiveId])).toEqual([['high_achievement', 'co-b-1']]);
  });
  it('the floor rule is off by default; when on, any objective scored 1 caps the overall at 3', () => {
    expect(withDone([800, 1200], [75, 25]).floorApplied).toBe(false);
    const capped = withDone([800, 1200], [75, 25], (s) => (s.ratingSchemes[0]!.floorRule = true));
    expect([capped.overall, capped.floorApplied, capped.label]).toEqual([3, true, 'Meets']);
  });
  it('one-band supervisor adjustment with a reason (R7); without a reason it is ignored', () => {
    const by = { at: '2026-10-18T09:00:00Z', byMembershipId: 'm-co' } as Review['adjustments'][number]['by'];
    const up = withDone([140, 2210], [50, 50], (s) => review(s).adjustments.push({ contractObjectiveId: 'co-b-1' as ContractObjective['id'], bandDelta: 1, reason: 'Route C meters were reassigned in May.', by }));
    expect(up.objectives[0]).toMatchObject({ bandScore: 1, score: 2, adjustment: { delta: 1 } });
    expect(up.flags).toEqual([]); // no longer scored 1
    const blank = withDone([140, 2210], [50, 50], (s) => review(s).adjustments.push({ contractObjectiveId: 'co-b-1' as ContractObjective['id'], bandDelta: 1, reason: '  ', by }));
    expect(blank.objectives[0]!.score).toBe(1);
    const top = withDone([800, 2210], [50, 50], (s) => review(s).adjustments.push({ contractObjectiveId: 'co-b-1' as ContractObjective['id'], bandDelta: 1, reason: 'x', by }));
    expect(top.objectives[0]!.score).toBe(5); // stays within the scale
  });
  it('an objective marked not assessable with HR approval is left out (R9)', () => {
    const r = withDone([140, 2210], [50, 50], (s) => review(s).notAssessable.push({
      contractObjectiveId: 'co-b-1' as ContractObjective['id'], reason: 'Meters not supplied', hrApproval: { at: '2026-09-01T09:00:00Z', byMembershipId: 'm-hrm' } as never,
    }));
    expect(r.objectives[0]!.basis).toBe('not_assessable');
    expect([r.overall, r.totalWeightPct]).toEqual([2, 50]);
  });
  it('a frozen final result wins and is no longer provisional (R9)', () => {
    const r = withDone([140, 2210], [50, 50], (s) => (review(s).finalResult = { overallScore: 2.5, label: 'Meets', schemeId: 'rs-a' as never, frozenAt: '2027-01-20T09:00:00Z' as never }));
    expect([r.overall, r.label, r.provisional]).toEqual([2.5, 'Meets', false]);
  });
  it('competencies count only when the scheme enables them (R5)', () => {
    const add = (s: Store) => review(s).competencyRatings.push({ label: '[from the scheme]', score: 5, justification: 'x' });
    expect(withDone([140, 2210], [50, 50], add).overall).toBe(1.5);
    const on = withDone([140, 2210], [50, 50], (s) => { add(s); s.ratingSchemes[0]!.competencySection = { enabled: true, weightPct: 20 }; });
    expect(on.overall).toBeCloseTo(0.8 * 1.5 + 0.2 * 5, 10);
  });
});

describe('every sample organisation', () => {
  it.each(createSampleOrgs().map((o) => [o.store.organisation.name, o.store] as const))('%s: every contract rates without error, within the scale', (_n, s) => {
    for (const c of s.contracts) {
      const r = rateContract(s, c.id, { now: NOW })!;
      if (r.overall !== null) {
        expect(r.overall).toBeGreaterThanOrEqual(1);
        expect(r.overall).toBeLessThanOrEqual(5);
        expect(r.label).toBeTruthy();
      }
      for (const f of r.flags) expect(f.routeToPositionIds.every((p) => s.positions.some((x) => x.id === p))).toBe(true);
    }
  });
});
