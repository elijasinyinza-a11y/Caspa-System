/** v0.15.0 (BUILD-BRIEF section 35): the plan document, read-only views after confirmation, and the first year's cascade. */
import type { FourQCell, ISODate } from '../../contract/caspa-data-contract';
import { CELLS, cellKey } from '../../rules/conception';
import { asIfActive } from '../../rules/onboarding';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const JAN = '2027-01-04' as ISODate;
const SWU = 'org-sample-water';
type Role = Parameters<typeof devMembership>[1];

const fresh = () => {
  const orgs = createReviewOrgs();
  const org = orgs.find((o) => o.orgId === SWU)! as ReviewOrg;
  const at = (role: Role, now: ISODate = NOW) => createMemoryRepository(orgs.map((o) => o.store), SWU, devMembership(org, role, now)!, now);
  return { as: (role: Role) => at(role), at, store: org.store, org, orgs };
};
type F = ReturnType<typeof fresh>;
const cell = (k: string) => CELLS.find((c) => cellKey(c) === k)! as FourQCell;

/** From the seeded state to a confirmed 2027–2031 plan, through every stage's screens. */
async function confirmedPlan(f: F) {
  const so = f.as('strategy');
  so.formation.moveStage('conception', 'open');
  for (const d of so.conception.page()!.departments) for (const c of d.sheet) if (c.state === 'ai_draft') so.conception.updateCard(c.id, { decision: 'accept' });
  for (const d of so.conception.page()!.departments) so.conception.consolidate(d.unitId);
  so.conception.addCard({ cell: cell('repositioning.failure_factors'), text: 'Readers skip remote meters on long routes', unitId: null, evidence: null });
  const ex = f.as('executive');
  ex.conception.saveVision({ vision: 'Safe water for every household we serve', mission: 'We supply, bill and care for our customers fairly.' });
  ex.conception.confirmVision();
  so.formation.moveStage('composition', 'open');
  const c = so.composition;
  await c.suggestThemes();
  for (const t of c.page()!.themes) { c.acceptTheme(t.id); c.goalFromTheme(t.id); }
  for (const g of ex.composition.page()!.goals) ex.composition.confirmItem('Goal', g.id);
  await c.suggestObjectives();
  for (const o of c.page()!.goals.flatMap((g) => g.objectives)) await c.suggestKpi(o.id);
  for (const g of ex.composition.page()!.goals) for (const o of g.objectives) {
    ex.composition.confirmItem('Objective', o.id);
    for (const k of o.kpis) ex.composition.confirmItem('Kpi', k.id);
  }
  const co = f.as('compliance').consultation;
  for (const i of co.compliance()!.items) co.reviewCompliance(i.id, 'aligned');
  expect(c.send()).toEqual({ ok: true });
  expect(ex.composition.confirmPlan({ resolutionRef: 'BR/2026/21', date: '2026-10-17' as ISODate })).toEqual({ ok: true });
  return f.store.plans.find((p) => p.entryDoor === 'formed' && p.status === 'confirmed')!;
}

describe('the plan document (D15-1 to D15-6)', () => {
  it('is drafted after confirmation, accepted section by section, finalised, then read by everyone', async () => {
    const f = fresh();
    expect(f.as('strategy').planDocument.page()).toBeNull();
    await confirmedPlan(f);
    const so = f.as('strategy').planDocument;
    expect(so.page()).toMatchObject({ document: null, canDraft: true });
    expect(await f.as('executive').planDocument.draft()).toEqual({ ok: false, error: 'not_allowed' });
    expect(await so.draft()).toEqual({ ok: true });
    expect(await so.draft()).toEqual({ ok: false, error: 'exists' });
    const doc = so.page()!.document!;
    expect(doc.sections.map((x) => x.heading)).toEqual(['Executive summary', 'Recover revenue and cut losses', 'Make supply reliable through drier years', 'Fund sanitation properly', 'Prepare a sound tariff case for 2028']);
    expect(doc.sections[0]!.text).toMatch(/^Strategic Plan 2027–2031 sets out how Sample Water Utility will move/);
    // No figures in the AI's narrative (D15-3); names of records, such as the plan's title, are not figures.
    expect(doc.sections.every((x) => !x.figuresNote)).toBe(true);
    // A draft stays with leadership and the Strategy office.
    expect(f.as('employee').planDocument.page()).toMatchObject({ document: null, hidden: true });
    expect(f.as('executive').planDocument.page()!.document).not.toBeNull();
    // An edit with a number gets a note, never a block; editing sends the section back for acceptance.
    expect(so.editSection('summary', 'Over 5 years we will reach our vision.')).toEqual({ ok: true });
    expect(so.page()!.document!.sections[0]).toMatchObject({ figuresNote: true, state: 'edited' });
    expect(so.finalise()).toEqual({ ok: false, error: 'pending' });
    for (const x of so.page()!.document!.sections) expect(so.acceptSection(x.id)).toEqual({ ok: true });
    expect(so.finalise()).toEqual({ ok: true });
    expect(so.editSection('summary', 'x')).toEqual({ ok: false, error: 'final' });
    // Contract v1.8: a final document is read by all members.
    const emp = f.as('employee').planDocument.page()!;
    expect(emp.document).toMatchObject({ status: 'final' });
    expect(f.store.auditEntries[f.store.auditEntries.length - 1]).toMatchObject({ action: 'finalise' });
  });
  it('shows live figures from the records, and card text only to those who read 4Q cards', async () => {
    const f = fresh();
    await confirmedPlan(f);
    const content = f.as('strategy').planDocument.page()!.content;
    expect(content.years).toEqual(['FY2027', 'FY2028', 'FY2029', 'FY2030', 'FY2031']);
    const nrw = content.goals[0]!.objectives[0]!.kpis[0]!;
    expect(nrw).toMatchObject({ name: 'Non-revenue water', baseline: 47, targets: [44, 41, 38, 35, 32], lowerIsBetter: true });
    expect(content.where[0]!.sections.some((x) => x.cards && x.cards.length > 0)).toBe(true);
    const emp = f.as('employee').planDocument.page()!.content;
    expect(emp.where.flatMap((b) => b.sections).filter((x) => x.count > 0).every((x) => x.cards === null)).toBe(true);
    // Approval comes from the confirmation record.
    expect(f.as('strategy').planDocument.page()!.approval).toMatchObject({ boardRef: 'BR/2026/21', boardOn: '2026-10-17' });
  });
});

describe('after confirmation (D15-11)', () => {
  it('the board and the room are read-only; baselines can still be confirmed and validated; compliance stays open', async () => {
    const f = fresh();
    await confirmedPlan(f);
    const so = f.as('strategy');
    const board = so.conception.page()!;
    expect(board.canCurate).toBe(false);
    expect(board.board.flatMap((c) => c.cards).every((c) => !c.canDecide)).toBe(true);
    expect(so.consultation.room()!.canRun).toBe(false);
    const b = so.consultation.baselines()!;
    expect(b.canRun).toBe(false);
    const confirmed = b.rows.find((r) => r.state === 'confirmed')!;
    expect(so.consultation.validateBaseline(confirmed.id)).toEqual({ ok: true });
    expect(so.consultation.correctBaseline(confirmed.id, { value: 1, asOf: NOW, sourceDescription: 'x' } as never)).toMatchObject({ ok: false });
    expect(so.consultation.compliance()!.canAdd).toBe(true);
    expect(so.composition.page()!.confirm.confirmed).toMatchObject({ ref: 'BR/2026/21' });
  });
});

describe('the first year’s cascade (D15-7 to D15-9)', () => {
  it('adds work under a KPI, is shown through a view, and publishes only once the year has begun', async () => {
    const f = fresh();
    const plan = await confirmedPlan(f);
    const so = f.as('strategy').firstYear;
    expect(so.page()).toMatchObject({ planId: plan.id, yearLabel: 'FY2027', begun: false, canPublish: false });
    const kpi = f.store.kpis.find((k) => k.name === 'Non-revenue water' && f.store.objectives.find((o) => o.id === k.objectiveId)?.title === 'Reduce non-revenue water' && f.store.goals.some((g) => g.planId === plan.id && g.id === f.store.objectives.find((o) => o.id === k.objectiveId)!.goalId))!;
    const pos = f.store.positions[0]!.id;
    expect(f.as('finance').firstYear.addActivity(kpi.id, { title: 'x', level: 'process', ownerPositionId: pos, evidence: 'y' })).toEqual({ ok: false, error: 'not_allowed' });
    const r = so.addActivity(kpi.id, { title: 'Map district metered areas', level: 'process', ownerPositionId: pos, evidence: 'Approved map' });
    expect(r).toMatchObject({ ok: true });
    expect(f.store.activities.find((a) => r.ok && a.id === r.id)).toMatchObject({ financialYear: 2027, decisionLevel: 'process' });
    expect(so.publish()).toEqual({ ok: false, error: 'not_begun' });

    // Next year's draft through a view: the record pages read the plan as if active, at the start of 2027.
    const view = asIfActive(f.store, plan.id);
    const preview = createMemoryRepository(f.orgs.map((o) => (o.orgId === SWU ? view : o.store)), SWU, devMembership(f.org, 'strategy', NOW)!, '2027-01-01' as ISODate);
    expect(preview.node('kpi', kpi.id)).not.toBeNull();

    // In January 2027: blocked first by baselines not yet validated, then published.
    const jan = f.at('strategy', JAN);
    expect(jan.firstYear.page()!.blocks.length).toBeGreaterThan(0);
    expect(jan.firstYear.publish()).toEqual({ ok: true, passed: false });
    expect(f.store.gateEvents[f.store.gateEvents.length - 1]).toMatchObject({ gate: 'cascade.publish', outcome: 'blocked' });
    // Owners confirm the measures the AI drafted (still allowed after confirmation), then the Strategy office validates.
    for (const mid of f.store.memberships.filter((m) => m.status === 'active').map((m) => m.id)) {
      const owner = createMemoryRepository(f.orgs.map((o) => o.store), SWU, mid, JAN).consultation;
      for (const row of owner.baselines()?.rows ?? []) if (row.canDecide && row.state === 'awaiting_owner') owner.decideBaseline(row.id, 'accept');
    }
    for (const row of jan.consultation.baselines()?.rows ?? []) if (row.canValidate) jan.consultation.validateBaseline(row.id);
    const left = jan.firstYear.page()!.blocks;
    expect(left).toEqual([]);
    const old = f.store.plans.find((p) => p.status === 'active')!;
    expect(jan.firstYear.publish()).toEqual({ ok: true, passed: true });
    expect(plan.status).toBe('active');
    expect(old.status).toBe('superseded');
    expect(f.at('strategy', JAN).firstYear.page()).toBeNull();
  });
});
