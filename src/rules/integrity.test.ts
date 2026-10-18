import { createSeed, FY } from '../data/sample/seed';
import type { SixPLevel } from '../contract/caspa-data-contract';
import { blockersAt, computeFindings, isBlocking, RULES } from './integrity';

const ids = (s = createSeed()) => computeFindings(s, { financialYear: FY }).map((f) => f.key).sort();

describe('integrity rules on the Sample Water Utility seed', () => {
  it('finds exactly the seeded gaps', () => {
    expect(ids()).toEqual(
      [
        'BOOK-GOAL-NO-WHY:Goal:g1', 'BOOK-GOAL-NO-WHY:Goal:g2', 'BOOK-GOAL-NO-WHY:Goal:g3', 'BOOK-GOAL-NO-WHY:Goal:g4',
        'STRUCT-BUDGETLINE-NO-ACTIVITY:BudgetLine:bl-5',
        'STRUCT-DEFICIENCY-UNADDRESSED:Deficiency:def-5',
        'STRUCT-GOAL-NO-FUNDED-ACTIVITY:Goal:g3',
        'STRUCT-KPI-NO-OWNER:Kpi:k1.1.1',
      ].sort(),
    );
  });

  it('counts one blocking and seven advisory findings', () => {
    const f = computeFindings(createSeed(), { financialYear: FY });
    expect(f.filter(isBlocking)).toHaveLength(1);
    expect(f.filter((x) => !isBlocking(x))).toHaveLength(7);
  });

  it('blocks budget submission on the orphan line, and clears when it is linked', () => {
    const s = createSeed();
    expect(blockersAt(computeFindings(s, { financialYear: FY }), 'budget.submit_consolidated').map((f) => f.subject.id)).toEqual(['bl-5']);
    const orphan = s.budgetLines.find((l) => l.id === 'bl-5')!;
    orphan.activityId = s.activities.find((a) => a.code === 'A1.2.1.3')!.id;
    expect(blockersAt(computeFindings(s, { financialYear: FY }), 'budget.submit_consolidated')).toEqual([]);
  });

  it('blocks cascade publication when an activity has no 6P level', () => {
    const s = createSeed();
    s.activities[0]!.decisionLevel = null as SixPLevel | null;
    const f = blockersAt(computeFindings(s, { financialYear: FY }), 'cascade.publish');
    expect(f.map((x) => x.ruleId)).toEqual([RULES.activityNo6P.id]);
  });

  it('flags a KPI target equal to the baseline or on the wrong side', () => {
    const s = createSeed();
    s.kpiTargets.find((t) => t.kpiId === 'k1.2.1')!.target = 52; // equal, lower is better
    s.kpiTargets.find((t) => t.kpiId === 'k2.1.1')!.target = 12; // below baseline, higher is better
    const keys = computeFindings(s, { financialYear: FY }).filter((f) => f.ruleId === RULES.kpiTargetInvalid.id).map((f) => f.subject.id);
    expect(keys.sort()).toEqual(['k1.2.1', 'k2.1.1']);
  });

  it('flags a signed contract objective when its source activity changes', () => {
    const s = createSeed();
    s.activities.find((a) => a.code === 'A1.2.1.3')!.quantityTarget = { value: 2000, unit: 'meters' };
    const f = computeFindings(s, { financialYear: FY }).filter((x) => x.ruleId === RULES.contractUpstreamChanged.id);
    expect(f.map((x) => x.subject.id)).toEqual(['co-b-1']);
    expect(f[0]!.blocksAt).toEqual([]);
  });

  it('flags an unvalidated baseline, blocking only cascade publication', () => {
    const s = createSeed();
    s.kpis[1]!.baselineMeasureId = 'bm-x' as never;
    const f = computeFindings(s, { financialYear: FY }).find((x) => x.ruleId === RULES.kpiBaselineNotValidated.id)!;
    expect(f.blocksAt).toEqual(['cascade.publish']);
  });
});
