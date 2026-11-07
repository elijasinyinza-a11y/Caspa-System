/** v0.23.0 scoring policy rules (Scoring Policy and Personal Attributes Specification v0.1; contract v1.15). */
import { RATING_PRESETS, type RatingScheme } from '../contract/caspa-data-contract';
import { policyChecks } from './policy';
import { scoreWith, type SchemeView } from './rating';

const POINTS_BANDS: RatingScheme['bands'] = [
  { score: 5, label: 'Outstanding', minAchievement: 0.9 }, { score: 4, label: 'Exceeds', minAchievement: 0.8 },
  { score: 3, label: 'Meets', minAchievement: 0.7 }, { score: 2, label: 'Partly meets', minAchievement: 0.6 },
  { score: 1, label: 'Does not meet', minAchievement: null },
];
const attrs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `A${i}`, measures: 'm', levels: ['1', '2', '3', '4', '5'] }));
const bands = (extra: Partial<SchemeView> = {}): SchemeView => ({ preset: 'A', bands: RATING_PRESETS.A, competencySection: { enabled: false, weightPct: 0 }, floorRule: false, highAchievementFlagAt: 1.5, ...extra });
const points = (extra: Partial<SchemeView> = {}): SchemeView => bands({ bands: POINTS_BANDS, scoringMethod: 'weighted_points', achievementCap: 1, ...extra });
const ZONE_B = [{ weightPct: 50, achievement: 410 / 400 }, { weightPct: 50, achievement: 2530 / 2400 }];
const ATTR_SCORES = [4, 4, 3, 4, 4];

describe('the worked example (spec Part A)', () => {
  it('bands then average: 3.50 of 5, rated Exceeds (3.50 rounds half up)', () => {
    const r = scoreWith(bands(), ZONE_B, []);
    expect([r.targetsPart, r.overall, r.label, r.percent]).toEqual([3.5, 3.5, 'Exceeds', 70]);
  });
  it('bands with attributes at 5%: 0.95 × 3.50 + 0.05 × 3.80 = 3.515, rated Exceeds', () => {
    const r = scoreWith(bands({ competencySection: { enabled: true, weightPct: 5 } }), ZONE_B, ATTR_SCORES);
    expect(r.overall).toBeCloseTo(3.515, 10);
    expect(r.label).toBe('Exceeds');
  });
  it('weighted points capped at 100%, attributes at 5%: 98.8%, rated Outstanding', () => {
    const r = scoreWith(points({ competencySection: { enabled: true, weightPct: 5 } }), ZONE_B, ATTR_SCORES);
    expect(r.targetsPart).toBeCloseTo(100, 10);
    expect(r.attributesPercent).toBeCloseTo(76, 10);
    expect(r.overall).toBeCloseTo(98.8, 10);
    expect(r.label).toBe('Outstanding');
  });
});

describe('the limit (most an objective can earn)', () => {
  it('counts exactly 100% at a cap of 100%, and only what counts is limited', () => {
    expect(scoreWith(points(), [{ weightPct: 100, achievement: 1 }], []).overall).toBeCloseTo(100, 10);
    expect(scoreWith(points(), [{ weightPct: 100, achievement: 1.43 }], []).overall).toBeCloseTo(100, 10);
    expect(scoreWith(points({ achievementCap: null }), [{ weightPct: 100, achievement: 1.43 }], []).overall).toBeCloseTo(143, 10);
  });
  it('stops overachievement on one objective offsetting a shortfall on another', () => {
    const r = scoreWith(points(), [{ weightPct: 50, achievement: 1.6 }, { weightPct: 50, achievement: 0.4 }], []);
    expect(r.overall).toBeCloseTo(70, 10);
    expect(scoreWith(points({ achievementCap: null }), [{ weightPct: 50, achievement: 1.6 }, { weightPct: 50, achievement: 0.4 }], []).overall).toBeCloseTo(100, 10);
  });
  it('rates the overall share with the lower bound inclusive', () => {
    expect(scoreWith(points(), [{ weightPct: 100, achievement: 0.9 }], []).label).toBe('Outstanding');
    expect(scoreWith(points(), [{ weightPct: 100, achievement: 0.8999 }], []).label).toBe('Exceeds');
  });
});

describe('policy checks (must fix before sending)', () => {
  const base = { bands: RATING_PRESETS.A, competencySection: { enabled: false, weightPct: 0 }, highAchievementFlagAt: 1.5 };
  it('passes the defaults', () => expect(policyChecks(base)).toEqual([]));
  it('needs names and thresholds that rise level by level', () => {
    const b = RATING_PRESETS.A.map((x) => ({ ...x }));
    b[1]!.minAchievement = 1.3; b[2]!.label = ' ';
    expect(policyChecks({ ...base, bands: b }).map((c) => c.kind).sort()).toEqual(['level_name', 'thresholds_order']);
  });
  it('finds levels no objective can reach under bands with a limit', () => {
    expect(policyChecks({ ...base, achievementCap: 1 })).toEqual([{ kind: 'unreachable', scores: [5, 4] }]);
    expect(policyChecks({ ...base, scoringMethod: 'weighted_points', achievementCap: 1, bands: POINTS_BANDS })).toEqual([]);
  });
  it('holds attributes to 1–30%, three to eight, each complete', () => {
    const cs = (weightPct: number, n: number) => ({ enabled: true, weightPct, levelLabels: ['a', 'b', 'c', 'd', 'e'], attributes: attrs(n) });
    expect(policyChecks({ ...base, competencySection: cs(5, 5) })).toEqual([]);
    expect(policyChecks({ ...base, competencySection: cs(31, 2) }).map((c) => c.kind)).toEqual(['attr_weight', 'attr_count']);
    const one = cs(5, 3); one.attributes[1]!.levels[2] = '';
    expect(policyChecks({ ...base, competencySection: one })).toEqual([{ kind: 'attr_incomplete', index: 1, name: 'A1' }]);
  });
});
