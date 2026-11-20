/** Corporate values (v0.29.0; Corporate Values Specification v0.1, CV-1 to CV-8; contract v1.21). */
import type { FourQCell, ISODate } from '../../contract/caspa-data-contract';
import { compositionFindings } from '../../rules/composition';
import { CELLS, cellKey } from '../../rules/conception';
import { valuesError, valuesOf } from '../../rules/values';
import { planDocumentContent } from '../../selectors/plan-document';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { clearSampleSchedule } from '../sample/schedule-samples';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
type Role = Parameters<typeof devMembership>[1];
const V = (name: string, text = `${name} in practice.`) => ({ name, text });

const fresh = () => {
  const orgs = createReviewOrgs();
  clearSampleSchedule(orgs.find((o) => o.orgId === SWU)!.store);
  const org = orgs.find((o) => o.orgId === SWU)! as ReviewOrg;
  const as = (role: Role) => createMemoryRepository(orgs.map((o) => o.store), SWU, devMembership(org, role, NOW)!, NOW);
  return { as, store: org.store };
};
/** Fill the forming plan's 4Q board so the vision step opens (as in conception.test.ts). */
const openVision = (f: ReturnType<typeof fresh>) => {
  const so = f.as('strategy').conception;
  for (const d of so.page()!.departments) for (const c of d.sheet) if (c.state === 'ai_draft') so.updateCard(c.id, { decision: 'accept' });
  for (const d of so.page()!.departments) so.consolidate(d.unitId);
  so.addCard({ cell: CELLS.find((c) => cellKey(c) === 'repositioning.failure_factors')! as FourQCell, text: 'Readers skip remote meters on long routes', unitId: null, evidence: null });
};

describe('the values rule (CV-4)', () => {
  it('allows none, up to ten, each named and explained within the limits, no two with the same name', () => {
    expect(valuesError([])).toBeNull();
    expect(valuesError([V('Integrity'), V('Teamwork')])).toBeNull();
    expect(valuesError(Array.from({ length: 11 }, (_, i) => V(`Value ${i}`)))).toBe('too_many');
    expect(valuesError([V(' ')])).toBe('name_required');
    expect(valuesError([{ name: 'Integrity', text: '' }])).toBe('meaning_required');
    expect(valuesError([V('x'.repeat(41))])).toBe('name_too_long');
    expect(valuesError([{ name: 'Integrity', text: 'x'.repeat(301) }])).toBe('meaning_too_long');
    expect(valuesError([V('Integrity'), V('integrity ')])).toBe('duplicate_name');
  });
});

describe('the Strategy landing (CV-5, CV-8)', () => {
  it('the Executive records everything once, values included, and everyone reads them in order', () => {
    const f = fresh();
    expect(f.as('strategy').strategyLanding.recordValues([V('Integrity')])).toEqual({ ok: false, error: 'not_allowed' });
    const ex = f.as('executive').strategyLanding;
    expect(ex.recordStatements('Safe water for all', 'We supply water', [V('Integrity'), V('Integrity')])).toEqual({ ok: false, error: 'duplicate_name' });
    expect(ex.recordStatements('Safe water for all', 'We supply water', [V('Integrity'), V('Customer focus'), V('Teamwork')])).toEqual({ ok: true });
    expect(f.as('employee').strategyLanding.landing()!.statements.values.map((v) => v.name)).toEqual(['Integrity', 'Customer focus', 'Teamwork']);
    expect(valuesOf(f.store.visionStatements, 'plan-2022').every((v) => v.confirmation?.byMembershipId === 'm-md')).toBe(true);
    expect(f.as('executive').strategyLanding.landing()!.canRecord).toBeNull();
    expect(ex.recordValues([V('Accountability')])).toEqual({ ok: false, error: 'already_recorded' });
  });
  it('a plan with a vision but no values offers the values alone, once', () => {
    const f = fresh();
    f.as('executive').strategyLanding.recordStatements('Safe water for all', 'We supply water');
    const ex = f.as('executive').strategyLanding;
    expect(ex.landing()!.canRecord).toBe('values');
    expect(ex.recordValues([])).toEqual({ ok: false, error: 'name_required' });
    expect(ex.recordValues([V('Integrity'), V('Teamwork')])).toEqual({ ok: true });
    expect(f.as('executive').strategyLanding.landing()!.canRecord).toBeNull();
    expect(f.as('hr').strategyLanding.landing()!.statements.values.map((v) => v.name)).toEqual(['Integrity', 'Teamwork']);
  });
});

describe('forming the next plan (CV-2, CV-3)', () => {
  it('starts from the active plan’s values, saves the Executive’s list, and confirms it with the vision', () => {
    const f = fresh();
    f.as('executive').strategyLanding.recordStatements('Safe water for all', 'We supply water', [V('Integrity'), V('Teamwork')]);
    openVision(f);
    const ex = f.as('executive').conception;
    expect(ex.page()!.vision.carried.map((v) => v.name)).toEqual(['Integrity', 'Teamwork']);
    expect(ex.page()!.vision.values).toEqual([]);
    expect(f.as('finance').conception.saveVision({ vision: 'v', mission: '', values: [V('Integrity')] })).toEqual({ ok: false, error: 'not_allowed' }); // v0.31.0: the Strategy office may
    expect(ex.saveVision({ vision: 'Safe water for every household', mission: 'We supply and care', values: [V('Teamwork'), V('Integrity'), V('Accountability')] })).toEqual({ ok: true });
    expect(f.as('executive').conception.page()!.vision.values.map((v) => v.name)).toEqual(['Teamwork', 'Integrity', 'Accountability']);
    expect(f.as('executive').conception.page()!.vision.carried).toEqual([]);
    // Reordering and removing keep one record per value.
    f.as('executive').conception.saveVision({ vision: 'Safe water for every household', mission: 'We supply and care', values: [V('Integrity'), V('Teamwork')] });
    expect(valuesOf(f.store.visionStatements, 'plan-2027').map((v) => [v.order, v.name])).toEqual([[1, 'Integrity'], [2, 'Teamwork']]);
    expect(f.as('executive').conception.saveVision({ vision: 'x', mission: '', values: [V('A'), V('a')] })).toEqual({ ok: false, error: 'values' });
    expect(f.as('executive').conception.confirmVision()).toMatchObject({ ok: true, outcome: 'passed' });
    expect(valuesOf(f.store.visionStatements, 'plan-2027').every((v) => v.confirmation?.byMembershipId === 'm-md')).toBe(true);
    expect(f.as('executive').conception.saveVision({ vision: 'x', mission: '', values: [] })).toEqual({ ok: false, error: 'locked' });
  });
});

describe('where values are read', () => {
  it('the plan document shows the confirmed values in order', () => {
    const f = fresh();
    f.as('executive').strategyLanding.recordStatements('Safe water for all', 'We supply water', [V('Integrity'), V('Teamwork')]);
    const plan = f.store.plans.find((p) => p.id === 'plan-2022')!;
    expect(planDocumentContent(f.store, plan, () => true).values.map((v) => v.name)).toEqual(['Integrity', 'Teamwork']);
  });
});

describe('STRUCT-PLAN-NO-VALUES (CV-7)', () => {
  it('flags a formed plan without values, never an imported one, and never blocks', () => {
    const f = fresh();
    const formed = f.store.plans.find((p) => p.id === 'plan-2027')!;
    const imported = f.store.plans.find((p) => p.id === 'plan-2022')!;
    const flag = compositionFindings(f.store, formed).find((x) => x.ruleId === 'STRUCT-PLAN-NO-VALUES');
    expect(flag).toMatchObject({ subject: { type: 'StrategicPlan', id: 'plan-2027' }, blocksAt: [] });
    expect(flag!.routeToPositionIds).toContain('pos-md');
    expect(compositionFindings(f.store, imported).some((x) => x.ruleId === 'STRUCT-PLAN-NO-VALUES')).toBe(false);
    openVision(f);
    f.as('executive').conception.saveVision({ vision: 'Safe water', mission: '', values: [V('Integrity')] });
    expect(compositionFindings(f.store, formed).some((x) => x.ruleId === 'STRUCT-PLAN-NO-VALUES')).toBe(false);
  });
});
