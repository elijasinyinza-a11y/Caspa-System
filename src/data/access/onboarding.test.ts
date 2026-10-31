/**
 * Onboarding (slice 8; Onboarding Specification v0.1, decisions O1 to O9): Sample New Organisation from a confirmed
 * structure to a published cascade through the import door, every route in, and the rules behind each step.
 */
import type { ISODate } from '../../contract/caspa-data-contract';
import { SAMPLE_PLAN_DRAFT } from '../../ai';
import { matchOwner, numberCodes, type PlanRow } from '../../rules/onboarding';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { SAMPLE_TEMPLATE_ROWS } from '../sample/new-org';
import { createMemoryRepository } from './repository';
import { readPlanSheet, readDate, rowsOfDraft } from './onboarding';
import { withHeader } from './setup/import';
import { readXlsx, writeXlsx } from './setup/files';

const NOW = '2026-10-18' as ISODate;
const NEW = 'org-new';

/** Sample New Organisation with its structure confirmed from the sample template (as slice 7 leaves it). */
function confirmedNewOrg() {
  const orgs = createReviewOrgs();
  const as = (role: Parameters<typeof devMembership>[1], orgId = NEW) => {
    const org = orgs.find((o) => o.orgId === orgId)! as ReviewOrg;
    return createMemoryRepository(orgs.map((o) => o.store), orgId, devMembership(org, role, NOW)!, NOW);
  };
  const admin = as('admin').structure;
  admin.importSheet(withHeader(SAMPLE_TEMPLATE_ROWS));
  const page = admin.page();
  admin.fixRowReports(page.rowProblems.find((r) => r.kind === 'reports_unmatched')!.positionId, page.structure.positions.find((p) => p.title === 'Regional Supervisor' && page.structure.units.find((u) => u.id === p.unitId)!.name === 'South')!.id);
  admin.dropVacantRoles(page.rowProblems.find((r) => r.kind === 'roles_on_vacant')!.positionId);
  admin.savePerson(page.structure.people.find((p) => p.fullName === 'Brian Mumba')!.id, { email: 'b.mumba@sample-new.example' });
  expect(admin.confirm()).toEqual({ ok: true });
  return { orgs, as, store: orgs.find((o) => o.orgId === NEW)!.store };
}
const setUp = (r: ReturnType<typeof confirmedNewOrg>) => {
  const s = r.as('strategy').onboarding;
  const om = r.store.positions.find((p) => p.title === 'Operations Manager')!.id;
  expect(s.setupPlan({ title: 'Strategic Plan 2025–2029', startYear: 2025, endYear: 2029, processOwnerPositionId: om })).toMatchObject({ ok: true });
  return s;
};

describe('the first question and "Getting started"', () => {
  it('before the structure is confirmed, the first step is the structure', () => {
    const orgs = createReviewOrgs();
    const org = orgs.find((o) => o.orgId === NEW)!;
    const page = createMemoryRepository(orgs.map((o) => o.store), NEW, devMembership(org, 'admin', NOW)!, NOW).onboarding.page();
    expect(page.steps.map((x) => [x.key, x.state]).slice(0, 3)).toEqual([['structure', 'next'], ['strategy_office', 'later'], ['plan_setup', 'later']]);
  });
  it('once confirmed, the Strategy office sets up the plan; the Executive and administrator see the steps; others do not', () => {
    const r = confirmedNewOrg();
    expect(r.as('strategy').onboarding.page()).toMatchObject({ canSetUp: true, plan: null, strategyOffice: 'Joseph Lungu' });
    expect(r.as('executive').onboarding.page().steps.map((x) => x.state)).toEqual(['done', 'done', 'next', 'later', 'later', 'later', 'later']);
    expect(r.as('executive').onboarding.setupPlan({ title: 'x', startYear: 2025, endYear: 2029, processOwnerPositionId: null })).toMatchObject({ ok: false, error: 'not_allowed' });
    expect(r.as('finance').onboarding.page().steps).toEqual([]);
    expect(r.as('admin').onboarding.page().steps.length).toBe(7);
  });
  it('the four running sample organisations never see it: their cascades were published', () => {
    const orgs = createReviewOrgs().filter((o) => o.orgId !== NEW);
    for (const o of orgs) {
      const page = createMemoryRepository(orgs.map((x) => x.store), o.orgId, o.devRoles.executive!, NOW).onboarding.page();
      expect([o.orgId, page.steps, page.plan?.published, page.plan?.status]).toEqual([o.orgId, [], true, 'active']);
    }
  });
  it('a period running backwards is refused', () => {
    const r = confirmedNewOrg();
    expect(r.as('strategy').onboarding.setupPlan({ title: 'x', startYear: 2029, endYear: 2025, processOwnerPositionId: null })).toMatchObject({ ok: false, error: 'period' });
  });
});

describe('the import door, end to end, from the plan document', () => {
  it('drafts, is accepted and corrected, sent, confirmed and published', async () => {
    const r = confirmedNewOrg();
    const s = setUp(r);
    await s.draftFromDocument('strategic-plan.pdf');
    let page = s.page();
    expect(r.store.sourceDocuments[r.store.sourceDocuments.length - 1]!.kind).toBe('strategic_plan');
    expect(page.items).toHaveLength(22);
    expect(page.items.every((i) => i.draft === 'ai_draft' && i.page !== null)).toBe(true);
    expect(page.must).toEqual([{ kind: 'ai_pending', count: 22 }]);
    // Owners matched by title, then "title, unit"; one matches nothing and is a row to fix, never a guess.
    expect(page.items.find((i) => i.code === 'K1.2.1')!.owner).toMatchObject({ label: 'Regional Supervisor, South', holder: null });
    expect(page.problems).toEqual([{ kind: 'owner_unmatched', code: 'A1.1.1.2', owner: 'Head of Customer Care', row: null }]);
    // Nothing reaches the rest of CASPA™ until the plan is confirmed.
    expect(r.as('executive').cascadeTree().goals).toEqual([]);
    expect(r.as('executive').findings()).toEqual([]);

    for (const i of page.items) expect(s.accept(i.type, i.id)).toEqual({ ok: true });
    const a = page.items.find((i) => i.code === 'A1.1.1.2')!;
    expect(s.saveItem('Activity', a.id, { ownerPositionId: page.positions.find((p) => p.label === 'Operations Manager')!.id })).toEqual({ ok: true });
    page = s.page();
    expect([page.must, page.problems]).toEqual([[], []]);
    expect(page.worth.map((w) => w.key.split(':')[0]).sort()).toEqual([
      ...Array(5).fill('BOOK-KPI-BASELINE-NOT-VALIDATED'), ...Array(3).fill('BOOK-GOAL-NO-WHY'), ...Array(3).fill('STRUCT-GOAL-NO-FUNDED-ACTIVITY'),
    ].sort());
    expect(page.noVisionOrMission).toBe(true);
    expect(page.publishBlocks.map((b) => b.key.split(':')[0]).sort()).toEqual(['BOOK-KPI-BASELINE-NOT-VALIDATED', 'BOOK-KPI-BASELINE-NOT-VALIDATED', 'BOOK-KPI-BASELINE-NOT-VALIDATED', 'BOOK-KPI-BASELINE-NOT-VALIDATED', 'BOOK-KPI-BASELINE-NOT-VALIDATED', 'STRUCT-ACTIVITY-NO-6P']);

    // O9: only the Executive types the vision and mission.
    expect(s.saveVision('vision', 'x')).toMatchObject({ ok: false, error: 'not_allowed' });
    const exec = r.as('executive').onboarding;
    expect(exec.saveVision('vision', 'A trusted organisation that serves every region well.')).toEqual({ ok: true });
    expect(exec.saveVision('mission', 'We deliver reliable services through capable people.')).toEqual({ ok: true });
    expect(exec.page().noVisionOrMission).toBe(false);

    // The Executive cannot confirm before it is sent; the Strategy office sends; it reaches the Executive's "Needs you".
    expect(exec.confirm({ resolutionRef: 'BR/2026/14', date: '2026-10-28' as ISODate })).toMatchObject({ ok: false, error: 'not_ready' });
    expect(s.send()).toEqual({ ok: true });
    expect(r.as('executive').home().needsYou.map((n) => n.key)).toContain(`approve:plan:${page.plan!.id}`);
    expect(r.as('strategy').onboarding.confirm(null)).toMatchObject({ ok: false, error: 'not_allowed' });
    expect(exec.confirm(null)).toMatchObject({ ok: false, error: 'board_required' });
    expect(exec.confirm({ resolutionRef: 'BR/2026/14', date: '2026-10-28' as ISODate })).toEqual({ ok: true });
    const plan = r.store.plans.find((p) => p.id === page.plan!.id)!;
    expect([plan.status, plan.boardApproval?.resolutionRef]).toEqual(['active', 'BR/2026/14']); // O4: its period includes FY2026
    expect(r.store.visionStatements.every((v) => v.confirmation !== null)).toBe(true);
    expect(r.store.gateEvents.filter((g) => g.gate === 'plan.confirm').map((g) => g.outcome)).toEqual(['passed']);
    expect(r.as('executive').home().needsYou.some((n) => n.key.startsWith('approve:plan:'))).toBe(false);

    // O5: the Strategy office publishes; the existing hard blocks bite first, and every attempt is recorded.
    expect(exec.publish()).toMatchObject({ ok: false, error: 'not_allowed' });
    expect(s.publish()).toEqual({ ok: true, blocking: 6 });
    expect(s.page().plan!.published).toBe(false);
    const act = s.page().items.find((i) => i.code === 'A1.2.1.2')!;
    expect(s.saveItem('Activity', act.id, { level: 'process' })).toEqual({ ok: true });
    expect(s.validateAllBaselines()).toEqual({ ok: true, count: 5 });
    expect(s.publish()).toEqual({ ok: true, blocking: 0 });
    expect(r.store.gateEvents.filter((g) => g.gate === 'cascade.publish').map((g) => g.outcome)).toEqual(['blocked', 'passed']);
    expect(s.page()).toMatchObject({ steps: [], plan: { published: true, status: 'active' } });
    // The cascade now works on the plan.
    expect(r.as('executive').cascadeTree().goals.map((g) => g.ref.code)).toEqual(['G1', 'G2', 'G3']);
  });
});

describe('the spreadsheet and typing routes', () => {
  it('reads the template from an .xlsx: same plan, every item a person’s, one owner to fix', async () => {
    const r = confirmedNewOrg();
    const s = setUp(r);
    const back = await readXlsx(writeXlsx([{ name: 'Plan', rows: s.sampleSheet() }]));
    expect(s.importSheet(back)).toEqual({ ok: true, problems: 1 });
    const page = s.page();
    expect(page.sheet).toEqual({ rows: 22, goals: 3, objectives: 5, kpis: 6, activities: 8 });
    expect(page.items.every((i) => i.draft === 'human')).toBe(true);
    expect(page.items.find((i) => i.code === 'K2.2.1')!.kpi).toMatchObject({ direction: 'lower_is_better', baseline: 31, target: 20, baselineAsOf: '2025-12-31' });
    expect(page.items.find((i) => i.code === 'G3')!.perspective).toBe('innovation_learning');
    expect(page.must).toEqual([]);
  });
  it('replaces what was brought in, never adding to it', async () => {
    const r = confirmedNewOrg();
    const s = setUp(r);
    await s.draftFromDocument('a.pdf');
    s.importSheet(s.sampleSheet());
    expect(s.page().items).toHaveLength(22);
    expect(r.store.kpiTargets.filter((t) => r.store.kpis.some((k) => k.id === t.kpiId))).toHaveLength(6);
  });
  it('typing numbers codes under each parent', () => {
    const r = confirmedNewOrg();
    const s = setUp(r);
    const g = s.addItem('goal', null) as { ok: true; id: string };
    const o = s.addItem('objective', g.id) as { ok: true; id: string };
    const k = s.addItem('kpi', o.id) as { ok: true; id: string };
    s.addItem('activity', k.id);
    s.addItem('goal', null);
    expect(s.page().items.map((i) => i.code)).toEqual(['G1', 'G2', 'O1.1', 'K1.1.1', 'A1.1.1.1']);
    expect(s.removeItem('Goal', g.id)).toEqual({ ok: true });
    expect(s.page().items.map((i) => i.code)).toEqual(['G2']);
  });
});

describe('rules behind the import', () => {
  const refs = [{ id: 'a', title: 'Regional Supervisor', unitName: 'North' }, { id: 'b', title: 'Regional Supervisor', unitName: 'South' }, { id: 'c', title: 'Accountant', unitName: 'Finance' }];
  it('matches owners by title, then title and unit, never guessing', () => {
    expect(matchOwner(refs, 'accountant')).toEqual({ positionId: 'c' });
    expect(matchOwner(refs, 'Regional Supervisor, South')).toEqual({ positionId: 'b' });
    expect(matchOwner(refs, 'Regional Supervisor')).toEqual({ problem: 'ambiguous' });
    expect(matchOwner(refs, 'Head of Customer Care')).toEqual({ problem: 'none' });
  });
  it('keeps codes as written and numbers blank ones after them', () => {
    const row = (kind: PlanRow['kind'], code: string | null, partOf: string | null): PlanRow => ({ kind, code, title: 't', partOf, owner: '', page: null, row: null });
    expect(numberCodes([row('goal', 'G1', null), row('goal', null, null), row('objective', null, 'G1'), row('objective', 'O1.1', 'G1')]).map((r) => r.code)).toEqual(['G1', 'G2', 'O1.2', 'O1.1']);
  });
  it('reads dates as written, typed day/month/year, or a spreadsheet day number', () => {
    expect([readDate('2025-12-31'), readDate('31/12/2025'), readDate('46022'), readDate('soon')]).toEqual(['2025-12-31', '2025-12-31', '2025-12-31', null]);
  });
  it('reads the organisation’s own words for item types', () => {
    const terms = { ...createReviewOrgs()[0]!.store.organisation.termLabels, objective: { singular: 'Result', plural: 'Results' } };
    expect(readPlanSheet([['Goal', 'G1', 'x', '', ''], ['Result', '', 'y', 'G1', '']], terms, null).map((r) => [r.kind, r.code])).toEqual([['goal', 'G1'], ['objective', null]]);
  });
  it('a plan of about 300 activities is brought in and checked within the time limit', () => {
    const r = confirmedNewOrg();
    const s = setUp(r);
    const big = rowsOfDraft(SAMPLE_PLAN_DRAFT).filter((x) => x.kind !== 'activity');
    for (let i = 1; i <= 300; i++) big.push({ kind: 'activity', code: null, title: `Activity ${i}`, partOf: ['K1.1.1', 'K2.1.1', 'K3.1.1'][i % 3]!, owner: 'IT Officer', page: null, row: null, activity: { level: 'process', quantity: 1, quantityUnit: 'item' } });
    const t0 = performance.now();
    s.importSheet(s.sampleSheet().slice(0, 1).concat(big.map((x) => [x.kind, x.code ?? '', x.title, x.partOf ?? '', x.owner, '', x.kpi?.unit ?? '', x.kpi?.direction === 'lower_is_better' ? 'lower' : '', x.kpi?.aggregation ?? '', String(x.kpi?.baseline ?? ''), x.kpi?.baselineAsOf ?? '', String(x.kpi?.target ?? ''), x.activity ? 'Process' : '', '1', 'item'])));
    const page = s.page();
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(page.items.filter((i) => i.kind === 'activity')).toHaveLength(300);
  });
});
