/** v0.24.0: 4Q Enhancement Specification v0.1 — cause levels on failure factors (A) and suggested cards (B); contract v1.16. */
import type { FourQCell, ISODate } from '../../contract/caspa-data-contract';
import { CELLS, cellKey, causeLevels, mergeLevel } from '../../rules/conception';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
const HOO = 'm-hoo'; // Head of Operations, a department head
type Role = Parameters<typeof devMembership>[1];
const fresh = () => {
  const orgs = createReviewOrgs();
  const org = orgs.find((o) => o.orgId === SWU)! as ReviewOrg;
  const repoFor = (m: string) => createMemoryRepository(orgs.map((o) => o.store), SWU, m, NOW);
  const as = (role: Role) => repoFor(devMembership(org, role, NOW)!);
  as('strategy').formation.moveStage('conception', 'open');
  return { as, repoFor, store: org.store };
};
type F = ReturnType<typeof fresh>;
const cell = (k: string) => CELLS.find((c) => cellKey(c) === k)! as FourQCell;
const sheet = (f: F, who: string | Role, name: string) =>
  (who.startsWith('m-') ? f.repoFor(who) : f.as(who as Role)).conception.page()!.candidates.find((x) => x.name === name);

describe('suggested cards from the plan in force (Part B)', () => {
  it('go to the department owning the record; records with no owner go to the Strategy office', () => {
    const f = fresh();
    const so = f.as('strategy').conception.page()!.candidates;
    expect(so.map((x) => [x.name, x.open.length])).toEqual([['Operations', 4], ['Records with no owner', 2]]);
    expect(f.repoFor(HOO).conception.page()!.candidates.map((x) => x.name)).toEqual(['Operations']);
    for (const r of ['executive', 'finance'] as Role[]) expect(f.as(r).conception.page()!.candidates).toEqual([]);
  });
  it('map each result to its section, from the KPI progress rules, with no figures in the words', () => {
    const f = fresh();
    const ops = sheet(f, HOO, 'Operations')!.open;
    expect(ops.map((c) => [cellKey(c.cell), c.text])).toEqual([
      ['retraction.failures', 'Non-revenue water: target not met in FY2024'],
      ['retraction.failures', 'Non-revenue water: target not met in FY2025'],
      ['repositioning.failures', 'Non-revenue water: behind in FY2026 so far'],
      ['repositioning.failure_factors', 'Meter readers not trained to spot tampering'],
    ]);
    const none = sheet(f, 'strategy', 'Records with no owner')!.open;
    expect(none.map((c) => [cellKey(c.cell), c.text])).toEqual([
      ['retraction.successes', 'Collection efficiency: target met in FY2024'],
      ['retraction.successes', 'Collection efficiency: target met in FY2025'],
    ]);
    for (const c of [...ops, ...none]) expect(c.text.replace(/FY\d{4}/, '')).not.toMatch(/\d/);
    expect(ops[2]!.figures).toMatchObject({ code: 'K1.2.1', actual: 47, target: 40, outcome: 'behind' });
    expect(ops[3]!.level).toBe('people');
    expect(ops.some((c) => c.cell.band === 'projection')).toBe(false);
  });
  it('adding one makes an ordinary card with a link to its record, and asks the duplicate check (AI suggestion)', async () => {
    const f = fresh();
    const hoo = f.repoFor(HOO).conception;
    const r = await hoo.acceptCandidate('kpi:k1.2.1:2026');
    expect(r).toMatchObject({ ok: true, mayRepeat: 'High water losses in the distribution network' });
    const card = f.store.fourQEntries.find((e) => e.id === (r as { id: string }).id)!;
    expect([card.scope, card.raisedByUnitIds, card.basis, card.draft.state]).toEqual(['department', ['u-ops'], { type: 'kpi_year', kpiId: 'k1.2.1', financialYear: 2026 }, 'human']);
    expect(sheet(f, HOO, 'Operations')!.open.map((c) => c.key)).not.toContain('kpi:k1.2.1:2026');
    const v = hoo.page()!.departments.find((d) => d.name === 'Operations')!.sheet.find((c) => c.id === card.id)!;
    expect(v.basis).toMatchObject({ code: 'K1.2.1', actual: 47, target: 40 });
    // A later correction to the KPI's reading shows on the card: figures are never copied into it.
    f.store.kpiActuals.find((a) => a.id === 'ka-1.2.1-2026-06')!.value = 45;
    expect(hoo.page()!.departments.find((d) => d.name === 'Operations')!.sheet.find((c) => c.id === card.id)!.basis!.actual).toBe(45);
  });
  it('reworded before adding keeps the link; a decision-map row arrives with its level', async () => {
    const f = fresh();
    const hoo = f.repoFor(HOO).conception;
    const a = await hoo.acceptCandidate('kpi:k1.2.1:2024', 'Losses stayed high in 2024');
    expect(f.store.fourQEntries.find((e) => e.id === (a as { id: string }).id)!.basis).toEqual({ type: 'kpi_year', kpiId: 'k1.2.1', financialYear: 2024 });
    const d = f.store.deficiencies.find((x) => x.correctiveActivityIds.length === 0)!;
    const b = await hoo.acceptCandidate(`deficiency:${d.id}`);
    expect(f.store.fourQEntries.find((e) => e.id === (b as { id: string }).id)).toMatchObject({ causeLevel: 'people', cell: { band: 'repositioning', column: 'failure_factors' } });
  });
  it('dismissing removes it from that sheet, recorded; restoring brings it back', () => {
    const f = fresh();
    const hoo = f.repoFor(HOO).conception;
    expect(hoo.dismissCandidate('kpi:k1.2.1:2025')).toEqual({ ok: true });
    expect(sheet(f, HOO, 'Operations')!.dismissed.map((c) => c.key)).toEqual(['kpi:k1.2.1:2025']);
    expect(f.store.auditEntries.some((x) => x.action === 'four_q.dismiss_candidate')).toBe(true);
    expect(f.as('finance').conception.dismissCandidate('kpi:k1.2.1:2024')).toEqual({ ok: false, error: 'not_allowed' });
    expect(hoo.restoreCandidate('kpi:k1.2.1:2025')).toEqual({ ok: true });
    expect(sheet(f, HOO, 'Operations')!.dismissed).toEqual([]);
  });
  it('offers nothing when no plan is in force', () => {
    const f = fresh();
    for (const p of f.store.plans) if (p.status === 'active') p.status = 'closed' as never;
    expect(f.as('strategy').conception.page()!.candidates).toEqual([]);
  });
});

describe('where the cause sits (Part A)', () => {
  it('is set only on critical failure factors, by whoever may draft the card', () => {
    const f = fresh();
    const fin = f.as('finance').conception;
    expect(fin.setCauseLevel('q-2027-r4', 'policy')).toEqual({ ok: true });
    expect(f.store.fourQEntries.find((e) => e.id === 'q-2027-r4')!.causeLevel).toBe('policy');
    expect(fin.setCauseLevel('q-2027-j1', 'policy')).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.repoFor(HOO).conception.setCauseLevel('q-2027-r4', 'people')).toEqual({ ok: false, error: 'not_allowed' });
    expect(fin.setCauseLevel('q-2027-r4', null)).toEqual({ ok: true });
    expect(f.store.auditEntries.filter((a) => a.action === 'cause_level').length).toBe(2);
  });
  it('is counted by level on the board, accepted organisation-sheet cards only', () => {
    const f = fresh();
    const so = f.as('strategy').conception;
    expect(so.page()!.causes.total).toBe(0);
    for (const d of so.page()!.departments) for (const c of d.sheet) if (c.state === 'ai_draft') so.updateCard(c.id, { decision: 'accept' });
    for (const d of so.page()!.departments) so.consolidate(d.unitId);
    const k = causeLevels(f.store, so.page()!.planId);
    expect([k.counts.people, k.counts.process, k.notSet, k.total]).toEqual([1, 1, 1, 3]);
    expect(so.page()!.causes).toEqual(k);
  });
  it('merging keeps the kept card’s level, or takes the other’s', () => {
    const f = fresh();
    const [a, b] = ['q-2027-r4', 'q-2027-r5'].map((id) => f.store.fourQEntries.find((e) => e.id === id)!);
    expect(mergeLevel(a!, b!)).toEqual({ level: 'people', differed: false });
    a!.causeLevel = 'policy';
    expect(mergeLevel(a!, b!)).toEqual({ level: 'policy', differed: true });
  });
  it('locks with the plan once it is confirmed', () => {
    const f = fresh();
    const p = f.store.plans.find((x) => x.status === 'draft')!;
    p.status = 'confirmed' as never;
    expect(f.as('finance').conception.setCauseLevel('q-2027-r4', 'policy').ok).toBe(false);
  });
  it('carries into the decision map: "Add as deficiency" keeps the level and a link, and needs a level', async () => {
    const f = fresh();
    const so = f.as('strategy');
    for (const d of so.conception.page()!.departments) for (const c of d.sheet) if (c.state === 'ai_draft') so.conception.updateCard(c.id, { decision: 'accept' });
    for (const d of so.conception.page()!.departments) so.conception.consolidate(d.unitId);
    so.conception.addCard({ cell: cell('projection.risks'), text: 'Extra risk', unitId: null, evidence: null });
    const ex = f.as('executive').conception;
    ex.saveVision({ vision: 'Safe water for every household we serve', mission: 'We supply, bill and care for our customers fairly.' });
    expect(ex.confirmVision()).toMatchObject({ ok: true, outcome: 'passed' });
    expect(so.formation.moveStage('composition', 'open')).toEqual({ ok: true });
    const cp = so.composition;
    await cp.suggestThemes();
    for (const t of cp.page()!.themes) cp.acceptTheme(t.id);
    for (const t of cp.page()!.themes) cp.goalFromTheme(t.id);
    const goal = cp.page()!.goals[0]!;
    expect(cp.addObjective(goal.id, { title: 'Reduce water losses', ownerPositionId: null, cardIds: ['q-2027-p5', 'q-2027-r4'] })).toMatchObject({ ok: true });
    const o = cp.page()!.goals.flatMap((g) => g.objectives).find((x) => x.title === 'Reduce water losses')!;
    expect(o.factors!.map((x) => [x.id, x.level, x.rowId])).toEqual([['q-2027-p5', 'process', null], ['q-2027-r4', null, null]]);
    expect(cp.addRowFromCard(o.id, 'q-2027-r4', { description: 'No funded sanitation activities', level: null })).toEqual({ ok: false, error: 'required' });
    expect(cp.addRowFromCard(o.id, 'q-2027-r4', { description: 'No funded sanitation activities', level: 'policy' })).toMatchObject({ ok: true });
    expect(cp.addRowFromCard(o.id, 'q-2027-p5', { description: 'Leaks repaired only after customers complain', level: null })).toMatchObject({ ok: true });
    const after = cp.page()!.goals.flatMap((g) => g.objectives).find((x) => x.id === o.id)!;
    expect(after.rows!.map((r) => [r.level, r.fromCard])).toEqual([['policy', 'retraction'], ['process', 'repositioning']]);
    expect(f.store.fourQEntries.find((e) => e.id === 'q-2027-r4')!.causeLevel ?? null).toBeNull();
  });
});
