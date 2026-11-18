/** Counts read correctly for one and for many (v0.26.2). */
import { en } from './en';

describe('count wording', () => {
  it('uses the singular label when the count is of one', () => {
    expect(en.node.summary.fundedOf(0, 1, 'Activity', 'Activities')).toBe('0 of 1 activity funded');
    expect(en.node.summary.fundedOf(1, 5, 'Activity', 'Activities')).toBe('1 of 5 activities funded');
    expect(en.node.fundedOf(1, 1, 'Activity', 'Activities')).toBe('1 of 1 activity funded');
    expect(en.budget.fundedActivities(1, 1, 'Activity', 'Activities')).toBe('1 of 1 activity funded');
    expect(en.goalHealth.funded(0, 1, 'Activity', 'Activities')).toBe('0 of 1 activity funded');
    expect(en.goalHealth.reporting(1, 1, 'Objective', 'Objectives')).toBe('1 of 1 objective reporting');
    expect(en.goalHealth.reporting(1, 2, 'Objective', 'Objectives')).toBe('1 of 2 objectives reporting');
  });
  it('agrees the verb on Home', () => {
    expect(en.home.fundedNote(1, 1, 'Activity', 'Activities', 'Budget line')).toBe('1 of 1 activity has at least one budget line');
    expect(en.home.fundedNote(3, 8, 'Activity', 'Activities', 'Budget line')).toBe('3 of 8 activities have at least one budget line');
  });
  it('names one child in the singular on a record page', () => {
    expect(en.node.summary.children(1, 'Activity', 'Activities', '1 at Procedure')).toBe('1 activity: 1 at Procedure');
    expect(en.node.summary.children(4, 'Activity', 'Activities', '2 at Process')).toBe('4 activities: 2 at Process');
    expect(en.node.summary.children(1, 'KPI', 'KPIs', '1 behind')).toBe('1 KPI: 1 behind');
  });
});

describe('acronyms inside a sentence (v0.28.0)', () => {
  it('keeps KPI and KPIs as written', () => {
    expect(en.landing.counts(2, 2, { objective: { singular: 'Objective', plural: 'Objectives' }, kpi: { singular: 'KPI', plural: 'KPIs' } } as never)).toBe('2 objectives · 2 KPIs');
    expect(en.landing.counts(1, 1, { objective: { singular: 'Outcome', plural: 'Outcomes' }, kpi: { singular: 'Indicator', plural: 'Indicators' } } as never)).toBe('1 outcome · 1 indicator');
  });
});
