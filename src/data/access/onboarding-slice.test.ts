/** v0.26.0: the plan-size guide (contract v1.20), the KPI owner role switch, the usability results rule and the second door. */
import type { ISODate } from '../../contract/caspa-data-contract';
import { RULES } from '../../rules/integrity';
import { draftChecks } from '../../rules/contracts';
import { taskResult } from '../../routes/Usability';
import { USABILITY_TASKS } from '../sample/usability-tasks';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
type Role = Parameters<typeof devMembership>[1];
const fresh = (orgId = SWU) => {
  const orgs = createReviewOrgs();
  const org = orgs.find((o) => o.orgId === orgId)! as ReviewOrg;
  return { as: (r: Role) => createMemoryRepository(orgs.map((o) => o.store), orgId, devMembership(org, r, NOW)!, NOW), store: org.store, org };
};
const guideFindings = (f: ReturnType<typeof fresh>) =>
  f.as('executive').findings().filter((v) => v.finding.ruleId === RULES.objectiveManyKpis.id || v.finding.ruleId === RULES.kpiManyActivities.id);

describe('the plan-size guide (v1.20)', () => {
  it('is off by default in every sample organisation, so nothing is raised', () => {
    for (const o of createReviewOrgs()) {
      expect(o.store.organisation.settings.planSizeGuide ?? null).toBeNull();
    }
    expect(guideFindings(fresh())).toEqual([]);
  });
  it('only HR sets it, with whole numbers of 1 or more or empty', () => {
    const f = fresh();
    const g = { kpisPerObjective: 1, activitiesPerKpi: 3, objectivesPerContract: 1 };
    expect(f.as('executive').contracts.saveGuide(g)).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('strategy').contracts.saveGuide(g)).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('hr').contracts.saveGuide({ ...g, activitiesPerKpi: 0 })).toEqual({ ok: false, error: 'bad_number' });
    expect(f.as('hr').contracts.saveGuide({ ...g, activitiesPerKpi: 2.5 })).toEqual({ ok: false, error: 'bad_number' });
    expect(f.as('hr').contracts.saveGuide(g)).toEqual({ ok: true });
    expect(f.store.organisation.settings.planSizeGuide).toEqual(g);
    expect(f.as('hr').contracts.page().overview!.guide).toEqual(g);
  });
  it('more than the number is worth checking, never blocking, routed to the owner and fixed on the record', () => {
    const f = fresh();
    f.as('hr').contracts.saveGuide({ kpisPerObjective: null, activitiesPerKpi: 3, objectivesPerContract: null });
    const found = guideFindings(f);
    expect(found.map((v) => v.finding.subject)).toEqual([{ type: 'Kpi', id: 'k1.2.1' }]);
    expect(found[0]!.finding.blocksAt).toEqual([]);
    expect(found[0]!.finding.message).toContain('has 4 activities; the plan-size guide suggests at most 3');
    expect(found[0]!.finding.routeToPositionIds).toEqual(['pos-hoo']);
  });
  it('objectives per contract shows in the contract checks as worth checking only', () => {
    const f = fresh();
    const c = f.store.contracts.find((x) => x.status === 'signed')!;
    expect(draftChecks(f.store, c.id, NOW).worth.some((w) => w.kind === 'many_objectives')).toBe(false);
    f.as('hr').contracts.saveGuide({ kpisPerObjective: null, activitiesPerKpi: null, objectivesPerContract: 1 });
    const checks = draftChecks(f.store, c.id, NOW);
    expect(checks.worth.find((w) => w.kind === 'many_objectives')).toMatchObject({ limit: 1 });
    expect(checks.mustFix.some((w) => (w.kind as string) === 'many_objectives')).toBe(false);
  });
});

describe('the KPI owner role switch', () => {
  it('in Sample Water Utility views as the Head of Operations, who owns KPIs and holds no assigned role', () => {
    const f = fresh();
    expect(devMembership(f.org, 'kpiOwner', NOW)).toBe('m-hoo');
    expect(f.as('kpiOwner').viewer.roles).not.toContain('executive');
  });
});

describe('the usability results', () => {
  it('a task passes only with at least 4 of 5 unaided, and is undecided while any result is blank', () => {
    expect(taskResult(['unaided', 'unaided', 'unaided', 'unaided', 'not'])).toBe('pass');
    expect(taskResult(['unaided', 'unaided', 'unaided', 'helped', 'not'])).toBe('fail');
    expect(taskResult(['unaided', 'unaided', 'unaided', 'unaided', ''])).toBe('open');
    expect(taskResult([])).toBe('open');
  });
  it('holds the five tasks of the Clarity Specification’s kit, each with a role the demo has', () => {
    const f = fresh();
    expect(USABILITY_TASKS.map((t) => t.no)).toEqual([1, 2, 3, 4, 5]);
    for (const t of USABILITY_TASKS) expect(devMembership(f.org, t.role, NOW)).not.toBeNull();
  });
});

describe('the second door, “Form a new strategy” (O6 lifted)', () => {
  it('with no plan yet, the Strategy office sets up a formed plan, which opens Forming the next plan', () => {
    const f = fresh();
    // An organisation with no plan at all: as on first use.
    f.store.plans = f.store.plans.filter((p) => p.id !== 'plan-2027');
    for (const p of f.store.plans) p.status = 'superseded';
    expect(f.as('strategy').onboarding.page().plan).toBeNull();
    const r = f.as('strategy').formation.setUp({ title: 'Strategic Plan 2027–2031', startYear: 2027, endYear: 2031, processOwnerPositionId: 'pos-spm', preparerMembershipId: 'm-spm' });
    expect(r).toMatchObject({ ok: true });
    expect(f.as('strategy').onboarding.page().plan).toMatchObject({ door: 'formed', status: 'draft' });
    expect(f.as('strategy').menu().strategy.map((e) => e.entry)).toContain('forming');
    expect(f.as('strategy').formation.page().schedule).toMatchObject({ empty: true, canBuild: true });
  });
});
