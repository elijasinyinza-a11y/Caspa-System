/** Strategy formation, part 11d (BUILD-BRIEF section 34): Composition from a confirmed vision to a confirmed plan. */
import type { FourQCell, ISODate } from '../../contract/caspa-data-contract';
import { aiStub } from '../../ai';
import { CELLS, cellKey } from '../../rules/conception';
import { kpiBaseline } from '../../rules/baseline';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
const HOO = 'm-hoo'; // Head of Operations, a department head
type Role = Parameters<typeof devMembership>[1];

const fresh = () => {
  const orgs = createReviewOrgs();
  const org = orgs.find((o) => o.orgId === SWU)! as ReviewOrg;
  const repoFor = (membershipId: string) => createMemoryRepository(orgs.map((o) => o.store), SWU, membershipId, NOW);
  const as = (role: Role) => repoFor(devMembership(org, role, NOW)!);
  return { as, repoFor, store: org.store, org };
};
type F = ReturnType<typeof fresh>;
const last = <T,>(xs: T[]): T => xs[xs.length - 1]!;
const cell = (k: string) => CELLS.find((c) => cellKey(c) === k)! as FourQCell;

/** Conception done: every card accepted and on the organisation's board, and the vision confirmed. */
const visionDone = (f: F) => {
  const so = f.as('strategy');
  so.formation.moveStage('conception', 'open');
  for (const d of so.conception.page()!.departments) for (const c of d.sheet) if (c.state === 'ai_draft') so.conception.updateCard(c.id, { decision: 'accept' });
  for (const d of so.conception.page()!.departments) so.conception.consolidate(d.unitId);
  so.conception.addCard({ cell: cell('repositioning.failure_factors'), text: 'Readers skip remote meters on long routes', unitId: null, evidence: null });
  const ex = f.as('executive').conception;
  ex.saveVision({ vision: 'Safe water for every household we serve', mission: 'We supply, bill and care for our customers fairly.' });
  expect(ex.confirmVision()).toMatchObject({ ok: true, outcome: 'passed' });
};
const openComposition = (f: F) => {
  visionDone(f);
  expect(f.as('strategy').formation.moveStage('composition', 'open')).toEqual({ ok: true });
};
/** Themes suggested and accepted, a goal made from each, every goal confirmed. */
const withGoals = async (f: F) => {
  openComposition(f);
  const so = f.as('strategy').composition;
  await so.suggestThemes();
  for (const t of so.page()!.themes) so.acceptTheme(t.id);
  for (const t of so.page()!.themes) so.goalFromTheme(t.id);
  const ex = f.as('executive').composition;
  for (const g of ex.page()!.goals) ex.confirmItem('Goal', g.id);
};
const objectiveNamed = (f: F, title: string) => f.as('strategy').composition.page()!.goals.flatMap((g) => g.objectives).find((o) => o.title === title)!;

describe('themes', () => {
  it('open once the vision is confirmed, with the approved wording; only the Strategy office accepts', async () => {
    const f = fresh();
    expect(f.as('strategy').composition.page()).toBeNull();
    visionDone(f);
    const so = f.as('strategy').composition;
    expect(await so.suggestThemes()).toEqual({ ok: true, added: 4 });
    const themes = so.page()!.themes;
    expect(themes.map((t) => t.title)).toEqual(['Recover revenue and cut losses', 'Make supply reliable through drier years', 'Fund sanitation properly', 'Prepare a sound tariff case for 2028']);
    expect(themes[0]).toMatchObject({ accepted: false, fromAi: true, cardCount: 2, groupings: ['sustain', 'correct'], canMakeGoal: false });
    expect(last(f.store.aiTasks)).toMatchObject({ kind: 'cluster', outputRefs: themes.map((t) => ({ type: 'Theme', id: t.id })) });
    expect(f.as('executive').composition.acceptTheme(themes[0]!.id)).toEqual({ ok: false, error: 'not_allowed' });
    expect(so.acceptTheme(themes[0]!.id)).toEqual({ ok: true });
    // Goals wait for Composition to open.
    expect(so.goalFromTheme(themes[0]!.id)).toEqual({ ok: false, error: 'not_open' });
    // Suggesting again adds nothing already there.
    expect(await so.suggestThemes()).toEqual({ ok: true, added: 0 });
  });
  it('everyone sees a theme’s title; only those who work on the board read its cards (D11d-1)', async () => {
    const f = fresh();
    visionDone(f);
    await f.as('strategy').composition.suggestThemes();
    const t = f.as('employee').composition.page()!.themes[0]!;
    expect(t.title).toBe('Recover revenue and cut losses');
    expect(t).toMatchObject({ cards: null, cardCount: 2, canAccept: false, canEdit: false });
    expect(f.as('executive').composition.page()!.themes[0]!.cards!.map((c) => c.text)).toContain('Metered connections rose from 58% to 81%');
  });
  it('a theme with a goal cannot be removed', async () => {
    const f = fresh();
    await withGoals(f);
    const t = f.as('strategy').composition.page()!.themes[0]!;
    expect(t.goal).toBe('G1');
    expect(f.as('strategy').composition.remove('Theme', t.id)).toEqual({ ok: false, error: 'has_children' });
  });
});

describe('goals, objectives and KPIs', () => {
  it('a goal made from a theme takes its title, cards and suggested perspective; the Executive confirms it', async () => {
    const f = fresh();
    openComposition(f);
    const so = f.as('strategy').composition;
    await so.suggestThemes();
    const t = so.page()!.themes[0]!;
    so.acceptTheme(t.id);
    const r = so.goalFromTheme(t.id);
    expect(r.ok).toBe(true);
    const g = so.page()!.goals[0]!;
    expect(g).toMatchObject({ code: 'G1', title: 'Recover revenue and cut losses', perspective: 'financial', confirmed: false, themes: ['Recover revenue and cut losses'], cardCount: 2 });
    expect(so.confirmItem('Goal', g.id)).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('executive').composition.confirmItem('Goal', g.id)).toEqual({ ok: true });
    expect(so.page()!.goals[0]!.confirmed).toBe(true);
    // An edit sends it back for confirmation.
    expect(so.editGoal(g.id, { title: 'Recover revenue and reduce losses', perspective: 'financial', ownerPositionId: null, themeIds: [t.id], cardIds: [] })).toEqual({ ok: true });
    expect(so.page()!.goals[0]!.confirmed).toBe(false);
  });
  it('suggests the approved objectives for confirmed goals, as drafts the Executive confirms', async () => {
    const f = fresh();
    await withGoals(f);
    expect(await f.as('strategy').composition.suggestObjectives()).toEqual({ ok: true, added: 6 });
    const goals = f.as('strategy').composition.page()!.goals;
    expect(goals[0]!.objectives.map((o) => `${o.code} ${o.title}`)).toEqual(['O1.1 Reduce non-revenue water', 'O1.2 Increase collection efficiency']);
    expect(goals[0]!.objectives[1]).toMatchObject({ fromAi: true, confirmed: false, cardCount: 0 });
  });
  it('a department head proposes an objective as its owner; an employee cannot (D11d-4)', async () => {
    const f = fresh();
    await withGoals(f);
    const goal = f.as('strategy').composition.page()!.goals[1]!;
    const hoo = f.repoFor(HOO).composition;
    expect(hoo.page()!.proposeAs?.label).toBe('Head of Operations');
    const r = hoo.proposeObjective(goal.id, { title: 'Cut supply interruptions in the dry season', cardIds: [] });
    expect(r.ok).toBe(true);
    const o = objectiveNamed(f, 'Cut supply interruptions in the dry season');
    expect(o).toMatchObject({ proposedBy: 'Head of Operations', owner: { label: 'Head of Operations' }, confirmed: false });
    expect(f.as('employee').composition.proposeObjective(goal.id, { title: 'x', cardIds: [] })).toEqual({ ok: false, error: 'not_allowed' });
    // As the objective's owner, the department head proposes its KPIs (D11d-5).
    const k = hoo.addKpi(o.id, { name: 'Supply interruptions', unit: 'per month', direction: 'lower_is_better', measureId: null, baseline: 12, ownerPositionId: null, targets: [11, 10, 9, 8, 7] });
    expect(k.ok).toBe(true);
    expect(f.as('finance').composition.addKpi(o.id, { name: 'x', unit: '', direction: 'higher_is_better', measureId: null, baseline: null, ownerPositionId: null, targets: [null, null, null, null, null] })).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('a suggested KPI reads its baseline from the register, with the approved targets (D11d-6)', async () => {
    const f = fresh();
    await withGoals(f);
    const so = f.as('strategy').composition;
    await so.suggestObjectives();
    const nrw = objectiveNamed(f, 'Reduce non-revenue water');
    const r = await so.suggestKpi(nrw.id);
    expect(r.ok && r.id).toBeTruthy();
    const k = objectiveNamed(f, 'Reduce non-revenue water').kpis[0]!;
    expect(k).toMatchObject({ code: 'K1.1.1', name: 'Non-revenue water', direction: 'lower_is_better', baseline: 47, targets: [44, 41, 38, 35, 32], fromAi: true, measure: { name: 'Non-revenue water', validated: false } });
    const stored = f.store.kpis.find((x) => x.id === k.id)!;
    expect(stored.baseline).toBeNull();
    expect(kpiBaseline(f.store, stored)).toBe(47);
    // No matching measure, so no suggestion.
    expect(await so.suggestKpi(objectiveNamed(f, 'Secure raw water sources against drought').id)).toEqual({ ok: true, id: null });
  });
  it('merging keeps one objective with both sets of cards', async () => {
    const f = fresh();
    await withGoals(f);
    const so = f.as('strategy').composition;
    await so.suggestObjectives();
    const a = objectiveNamed(f, 'Increase daily supply hours');
    const b = objectiveNamed(f, 'Secure raw water sources against drought');
    expect(so.mergeObjective(b.id, a.id)).toEqual({ ok: true });
    expect(objectiveNamed(f, 'Increase daily supply hours').cardCount).toBe(2);
    expect(objectiveNamed(f, 'Secure raw water sources against drought')).toBeUndefined();
    expect(last(f.store.auditEntries)).toMatchObject({ action: 'merge', entity: { type: 'Objective', id: b.id } });
  });
});

describe('costs, envelopes and the decision map', () => {
  it('compares indicative costs of confirmed objectives with Finance’s envelope (D11d-7)', async () => {
    const f = fresh();
    await withGoals(f);
    const so = f.as('strategy').composition;
    await so.suggestObjectives();
    const goal = so.page()!.goals[0]!;
    const o = goal.objectives[0]!;
    expect(so.setEnvelope(goal.id, 2027, 100_000_00)).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('finance').composition.setEnvelope(goal.id, 2027, 100_000_00)).toEqual({ ok: true });
    expect(f.as('finance').composition.setCost(o.id, 2027, 150_000_00)).toEqual({ ok: true });
    // Not yet over: the objective is not confirmed.
    expect(so.page()!.goals[0]!.envelopes![0]).toEqual({ amount: 100_000_00, cost: 0, exceeded: false });
    f.as('executive').composition.confirmItem('Objective', o.id);
    expect(so.page()!.goals[0]!.envelopes![0]).toEqual({ amount: 100_000_00, cost: 150_000_00, exceeded: true });
    expect(so.page()!.checks.worth.find((w) => w.key.startsWith('BOOK-ENVELOPE-EXCEEDED'))).toMatchObject({ years: ['FY2027'] });
    // Supervisors and employees see neither costs nor envelopes.
    const emp = f.as('employee').composition.page()!.goals[0]!;
    expect(emp.envelopes).toBeNull();
    expect(emp.objectives[0]!.costs).toBeNull();
  });
  it('rows come only from linked failure factors; corrective work is given a plan year (D11d-9)', async () => {
    const f = fresh();
    await withGoals(f);
    const so = f.as('strategy').composition;
    await so.suggestObjectives();
    expect(await so.suggestRows(objectiveNamed(f, 'Reduce non-revenue water').id)).toEqual({ ok: true, added: 0 });
    const san = objectiveNamed(f, 'Fund and deliver a sanitation programme');
    expect(await so.suggestRows(san.id)).toEqual({ ok: true, added: 1 });
    const row = objectiveNamed(f, 'Fund and deliver a sanitation programme').rows![0]!;
    expect(row).toMatchObject({ description: 'No funded sanitation activities in annual budgets', level: 'policy', draft: true });
    expect(so.acceptRow(row.id)).toEqual({ ok: true });
    await so.suggestKpi(san.id);
    const kpi = objectiveNamed(f, 'Fund and deliver a sanitation programme').kpis[0]!;
    const pos = f.store.positions[0]!.id;
    const r = so.addCorrective(row.id, { kpiId: kpi.id, title: 'Ring-fence a sanitation budget line', level: 'policy', ownerPositionId: pos, evidence: 'Approved budget', year: 2028 });
    // Codes stay unique across plans: the imported plan already holds A3.1.1.1.
    expect(r.ok && r.code).toBe('A3.1.1.2');
    const a = f.store.activities.find((x) => r.ok && x.id === r.id)!;
    expect(a).toMatchObject({ financialYear: 2028, decisionLevel: 'policy' });
    expect(objectiveNamed(f, 'Fund and deliver a sanitation programme').rows![0]!.corrective).toMatchObject([{ code: 'A3.1.1.2', year: 2028 }]);
    expect(so.addCorrective(row.id, { kpiId: kpi.id, title: 'x', level: 'policy', ownerPositionId: pos, evidence: 'y', year: 2035 })).toEqual({ ok: false, error: 'invalid' });
    // Finance may not see rows: a count only (D6-5).
    expect(f.as('finance').composition.page()!.goals[2]!.objectives[0]).toMatchObject({ rows: null, rowCount: 1 });
  });
});

describe('confirming the plan (D11d-10)', () => {
  it('must-fix items, worth-checking items, sending, and the Executive’s confirmation with a board resolution', async () => {
    const f = fresh();
    await withGoals(f);
    const so = f.as('strategy').composition;
    await so.suggestObjectives();
    let page = so.page()!;
    expect(page.checks.must.map((m) => m.kind)).toEqual(['compliance', 'pending']);
    const worth = page.checks.worth.map((w) => w.key.split(':')[0]);
    expect(worth).toContain('STRUCT-4Q-RISK-UNADDRESSED');
    expect(worth).toContain('STRUCT-GOAL-NO-OBJECTIVE');
    expect(worth).not.toContain('STRUCT-GOAL-NO-FUNDED-ACTIVITY');
    expect(page.checks.worth.some((w) => w.message.includes('Readers skip remote meters on long routes'))).toBe(true);
    expect(so.send()).toMatchObject({ ok: false, error: 'not_ready' });

    // The compliance officer reviews every item; the Executive confirms every objective.
    const co = f.as('compliance').consultation;
    for (const c of co.compliance()!.items) co.reviewCompliance(c.id, 'aligned');
    const ex = f.as('executive').composition;
    for (const o of ex.page()!.goals.flatMap((g) => g.objectives)) ex.confirmItem('Objective', o.id);
    page = so.page()!;
    expect(page.checks.must).toEqual([]);
    expect(page.checks.worth.some((w) => w.key.startsWith('STRUCT-GOAL-NO-OBJECTIVE'))).toBe(false);

    expect(ex.confirmPlan(null)).toEqual({ ok: false, error: 'not_ready' });
    expect(so.send()).toEqual({ ok: true });
    expect(so.page()!.confirm).toMatchObject({ canSend: false, sentBy: expect.any(String) });
    // The Executive is asked in "Needs you".
    expect(f.as('executive').home().needsYou.some((i) => i.key.startsWith('approve:plan:'))).toBe(true);
    expect(ex.confirmPlan(null)).toEqual({ ok: false, error: 'board_required' });
    expect(ex.confirmPlan({ resolutionRef: 'BR/2026/21', date: '2026-10-17' as ISODate })).toEqual({ ok: true });
    const p = f.store.plans.find((x) => x.id === page.planId)!;
    expect(p).toMatchObject({ status: 'confirmed', boardApproval: { resolutionRef: 'BR/2026/21' } });
    const ge = last(f.store.gateEvents)!;
    expect(ge).toMatchObject({ gate: 'plan.confirm', outcome: 'passed', blockingFindingKeys: [] });
    expect(ge.advisoryAtGate.length).toBeGreaterThan(0);
    // Once confirmed, nothing changes here.
    expect(so.addGoal({ title: 'x', perspective: null, ownerPositionId: null, themeIds: [], cardIds: [] })).toEqual({ ok: false, error: 'not_draft' });
    expect(so.page()!.confirm.confirmed).toMatchObject({ ref: 'BR/2026/21' });
  });
  it('whoever sends the plan cannot confirm it', async () => {
    const f = fresh();
    await withGoals(f);
    const so = f.as('strategy');
    expect(so.composition.confirmPlan(null)).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('"Needs you" and wording', () => {
  it('asks the Strategy office about themes, the Executive about items, owners about KPIs', async () => {
    const f = fresh();
    openComposition(f);
    await f.as('strategy').composition.suggestThemes();
    const keys = (role: Role) => f.as(role).home().needsYou.map((i) => i.key.split(':').slice(0, 2).join(':'));
    expect(keys('strategy')).toContain('composition:themes');
    const so = f.as('strategy').composition;
    for (const t of so.page()!.themes) { so.acceptTheme(t.id); so.goalFromTheme(t.id); }
    expect(keys('strategy')).not.toContain('composition:themes');
    expect(keys('executive')).toContain('composition:confirm');
  });
  it('notes vague wording as an AI suggestion, never a check', async () => {
    const f = fresh();
    await withGoals(f);
    const so = f.as('strategy').composition;
    so.addObjective(so.page()!.goals[0]!.id, { title: 'Improve customer care', ownerPositionId: null, cardIds: [] });
    expect(await so.reviewWording()).toEqual({ ok: true, notes: 1 });
    expect(objectiveNamed(f, 'Improve customer care').wording).toMatch(/measurable/);
    expect(so.page()!.checks.worth.some((w) => /measurable/.test(w.message))).toBe(false);
    expect(last(f.store.aiTasks)!.kind).toBe('language_review');
  });
});

describe('the stub without sample wording', () => {
  it('groups cards by the kind of 4Q section and suggests no objectives or KPIs', async () => {
    const cards = [
      { id: 'a', cell: cell('retraction.successes'), text: 'A' }, { id: 'b', cell: cell('projection.risks'), text: 'B' },
      { id: 'c', cell: cell('repositioning.failure_factors'), text: 'C' },
    ];
    const t = await aiStub.suggestThemes('org-none', cards);
    expect(t.themes.map((x) => [x.title, x.cardIds])).toEqual([['What to sustain', ['a']], ['What to correct', ['c']], ['Risks to manage', ['b']]]);
    expect((await aiStub.suggestObjectives('org-none', [{ id: 'g', title: 'G', themeTitles: [] }], cards)).objectives).toEqual([]);
    expect(await aiStub.suggestKpi('org-none', 'G', [], 5)).toBeNull();
    expect((await aiStub.suggestDeficiencyRows('org-none', cards)).rows).toEqual([{ cardId: 'c', description: 'C', level: 'process' }]);
  });
});
