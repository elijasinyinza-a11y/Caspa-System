/** Strategy formation, part 11b (BUILD-BRIEF section 31): the 4Q board, department sheets, interview, consolidation, vision and mission. */
import type { FourQCell, ISODate } from '../../contract/caspa-data-contract';
import { CELLS, cellKey } from '../../rules/conception';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
type Role = Parameters<typeof devMembership>[1];

const fresh = (orgId = SWU) => {
  const orgs = createReviewOrgs();
  const org = orgs.find((o) => o.orgId === orgId)! as ReviewOrg;
  const repoFor = (membershipId: string) => createMemoryRepository(orgs.map((o) => o.store), orgId, membershipId, NOW);
  const as = (role: Role) => repoFor(devMembership(org, role, NOW)!);
  return { as, repoFor, store: org.store };
};
const openConception = (f: ReturnType<typeof fresh>) => f.as('strategy').formation.moveStage('conception', 'open');
const cell = (k: string) => CELLS.find((c) => cellKey(c) === k)! as FourQCell;

/** The Strategy office checks every seeded draft and brings all three departments onto the organisation sheet. */
const consolidateAll = (f: ReturnType<typeof fresh>) => {
  const so = f.as('strategy').conception;
  for (const d of so.page()!.departments) for (const c of d.sheet) if (c.state === 'ai_draft') so.updateCard(c.id, { decision: 'accept' });
  for (const d of so.page()!.departments) so.consolidate(d.unitId);
};

describe('who sees which cards', () => {
  it('leadership and the Strategy office see every card; a department head sees only their department’s', () => {
    const f = fresh();
    const exec = f.as('executive').conception.page()!;
    expect(exec.seesAll).toBe(true);
    expect(exec.departments.map((d) => [d.name, d.sheet.length])).toEqual([['Finance', 3], ['Operations', 7], ['Commercial', 2]]);
    const fin = f.as('finance').conception.page()!;
    expect(fin.seesAll).toBe(false);
    expect(fin.myDepartments).toEqual(['u-fin']);
    expect(fin.departments.map((d) => d.name)).toEqual(['Finance']);
    expect(fin.departments[0]!.sheet.map((c) => c.text)).toContain('No funded sanitation activities in annual budgets');
    expect(fin.documents).toEqual([]);
  });
  it('once consolidated, a department head sees a count of other departments’ cards, never their text', () => {
    const f = fresh();
    consolidateAll(f);
    const fin = f.as('finance').conception.page()!;
    expect(fin.board.flatMap((c) => c.cards).every((c) => c.units.includes('Finance'))).toBe(true);
    expect(fin.hiddenOnBoard).toBe(9);
    expect(f.as('executive').conception.page()!.hiddenOnBoard).toBe(0);
  });
  it('an employee sees no cards and no departments, but may read the vision once written', () => {
    const f = fresh();
    const emp = f.as('employee').conception.page()!;
    expect(emp.departments).toEqual([]);
    expect(emp.board.flatMap((c) => c.cards)).toEqual([]);
    expect(emp.vision.canWrite).toBe(false);
  });
  it('department heads get the Strategy workspace while a plan is formed; others do not gain it', () => {
    const f = fresh();
    expect(f.repoFor('m-hoo').workspaces()).toContain('strategy');
    expect(f.as('employee').workspaces()).not.toContain('strategy');
  });
});

describe('checking cards', () => {
  it('a department head accepts, corrects or rejects their own department’s drafts, not another’s', () => {
    const f = fresh();
    const fin = f.as('finance').conception;
    expect(fin.updateCard('q-2027-r4', { decision: 'accept' })).toEqual({ ok: true });
    expect(fin.updateCard('q-2027-r1', { decision: 'accept' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(fin.updateCard('q-2027-j1', { text: 'Tariff review window opens in 2028' })).toEqual({ ok: true }); // correcting accepts
    expect(fin.updateCard('q-2027-j2', { decision: 'reject' })).toEqual({ ok: true });
    expect(fin.updateCard('q-2027-j2', { decision: 'accept' })).toEqual({ ok: false, error: 'not_found' }); // rejected cards are out of play
    const st = f.store.fourQEntries.find((e) => e.id === 'q-2027-j1')!;
    expect(st.text).toBe('Tariff review window opens in 2028');
    expect(st.draft.state).toBe('accepted');
    expect(st.draft.decided?.byMembershipId).toBe('m-hof');
    expect(f.store.auditEntries.filter((a) => a.entity.type === 'FourQEntry').length).toBe(3);
  });
  it('the Executive views cards but does not curate them (FourQEntry draft: owner, Strategy office, facilitator)', () => {
    const f = fresh();
    const ex = f.as('executive').conception;
    expect(ex.updateCard('q-2027-r1', { decision: 'accept' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(ex.addCard({ cell: cell('retraction.successes'), text: 'x', unitId: null, evidence: null })).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('the interview (AI stub)', () => {
  it('drafts one card per answer on the department’s sheet, logs the call and keeps no answers', async () => {
    const f = fresh();
    const fin = f.as('finance').conception;
    expect(await fin.interview('u-fin', [])).toEqual({ ok: false, error: 'required' });
    const r = await fin.interview('u-fin', [
      { cell: cell('repositioning.failure_factors'), answer: 'Approvals take three weeks. Field teams wait.' },
      { cell: cell('projection.risks'), answer: '' },
      { cell: cell('projection.risks'), answer: 'Customers may resist the tariff increase.' },
    ]);
    expect(r).toEqual({ ok: true, added: 2 });
    const page = fin.page()!;
    const dept = page.departments[0]!;
    expect(dept.interviewed).toBe(true);
    expect(dept.sheet.filter((c) => c.source === 'AI draft from Finance’s interview').map((c) => c.text)).toEqual(['Approvals take three weeks', 'Customers may resist the tariff increase']);
    const task = f.store.aiTasks.find((t) => t.kind === 'interview')!;
    expect(task.inputRefs).toEqual([{ type: 'StrategicPlan', id: 'plan-2027' }, { type: 'OrgUnit', id: 'u-fin' }]);
    expect(task.outputRefs).toHaveLength(2);
    expect(JSON.stringify(task)).not.toContain('three weeks');
  });
  it('only that department’s head takes it, and not when AI assistance is off', async () => {
    const f = fresh();
    expect(await f.as('strategy').conception.interview('u-fin', [{ cell: CELLS[0]!, answer: 'a' }])).toEqual({ ok: false, error: 'not_allowed' });
    expect(await f.as('finance').conception.interview('u-ops', [{ cell: CELLS[0]!, answer: 'a' }])).toEqual({ ok: false, error: 'not_allowed' });
    f.store.organisation.settings.aiEnabled = false;
    expect(await f.as('finance').conception.interview('u-fin', [{ cell: CELLS[0]!, answer: 'a' }])).toEqual({ ok: false, error: 'ai_off' });
    // Without AI, cards are added by hand.
    expect(f.as('finance').conception.addCard({ cell: CELLS[0]!, text: 'Audit findings cleared', unitId: 'u-fin', evidence: null })).toMatchObject({ ok: true });
  });
});

describe('sending a sheet and consolidating', () => {
  it('a department sends only when every draft is checked; the Strategy office adds accepted cards to the organisation sheet', () => {
    const f = fresh();
    const fin = f.as('finance').conception;
    expect(fin.submitDepartment('u-fin')).toEqual({ ok: false, error: 'not_ready' });
    for (const id of ['q-2027-r4', 'q-2027-j1', 'q-2027-j2']) fin.updateCard(id, { decision: 'accept' });
    expect(fin.submitDepartment('u-fin')).toEqual({ ok: true });
    expect(fin.submitDepartment('u-ops')).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('executive').conception.page()!.departments[0]).toMatchObject({ submitted: true, waiting: 3, submittedOn: NOW });
    expect(fin.consolidate('u-fin')).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('strategy').conception.consolidate('u-fin')).toEqual({ ok: true, moved: 3 });
    const page = f.as('executive').conception.page()!;
    expect(page.departments[0]).toMatchObject({ waiting: 0, consolidated: 3 });
    expect(page.filled).toBe(3);
    // Finance's department head can no longer change a card once it is on the organisation sheet.
    expect(fin.updateCard('q-2027-r4', { text: 'changed' })).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('the AI suggests duplicates; merging keeps every department and keeping separate is remembered', async () => {
    const f = fresh();
    consolidateAll(f);
    const so = f.as('strategy').conception;
    const r = await so.findDuplicates();
    if (!r.ok) throw new Error('expected suggestions');
    expect(r.pairs.map(([a, b]) => [a.id, b.id])).toEqual([['q-2027-p3', 'q-2027-p4']]);
    expect(f.store.aiTasks.some((t) => t.kind === 'merge')).toBe(true);
    expect(so.merge('q-2027-p3', 'q-2027-r1')).toEqual({ ok: false, error: 'same_cell' });
    expect(so.merge('q-2027-p3', 'q-2027-p4')).toEqual({ ok: true });
    const kept = f.store.fourQEntries.find((e) => e.id === 'q-2027-p3')!;
    expect(kept.raisedByUnitIds).toEqual(['u-com', 'u-ops']);
    expect(f.store.fourQEntries.find((e) => e.id === 'q-2027-p4')!.mergedIntoId).toBe('q-2027-p3');
    expect(so.page()!.board.find((c) => cellKey(c.cell) === 'repositioning.failures')!.cards.map((c) => [c.id, c.merged])).toEqual([['q-2027-p3', 1]]);
    // A pair kept separate is not suggested again.
    so.addCard({ cell: cell('repositioning.failures'), text: 'Revenue losses from estimated readings', unitId: null, evidence: null });
    const again = await so.findDuplicates();
    if (!again.ok) throw new Error('expected suggestions');
    expect(again.pairs).toHaveLength(1);
    so.keepSeparate(again.pairs[0]![0].id, again.pairs[0]![1].id);
    const third = await so.findDuplicates();
    expect(third.ok && third.pairs).toEqual([]);
  });
  it('source documents: cards drafted from them stay linked to their page; the stub says it returns the same draft for any file', async () => {
    const f = fresh();
    const so = f.as('strategy').conception;
    expect(so.page()!.documents.map((d) => [d.title, d.drafted])).toEqual([
      ['Strategic Plan 2022–2026', 1], ['Annual Report 2025', 3], ['Performance Report 2025', 3], ['Water Supply Licence', 0], ['Regulatory notice: tariff review 2028', 2],
    ]);
    expect(f.as('finance').conception.addDocument({ title: 'x', kind: 'other', fileName: 'x.pdf' })).toEqual({ ok: false, error: 'not_allowed' });
    const add = so.addDocument({ title: 'Board paper on tariffs', kind: 'board_paper', fileName: 'board.pdf' });
    if (!add.ok) throw new Error('expected a document');
    expect(so.page()!.documents.slice(-1)[0]).toMatchObject({ title: 'Board paper on tariffs', drafted: 0 });
    expect(await so.draftFromDocument(add.id)).toEqual({ ok: true, added: 4, sameForAnyFile: true });
    const drafted = so.page()!.board.flatMap((c) => c.cards).filter((c) => c.source.startsWith('AI draft from Board paper on tariffs, page'));
    expect(drafted).toHaveLength(4);
    expect(drafted.every((c) => c.state === 'ai_draft' && c.scope === 'organisation')).toBe(true);
  });
});

describe('vision and mission (vision.confirm)', () => {
  const fillAll = (f: ReturnType<typeof fresh>) => {
    consolidateAll(f);
    // The seeded drafts leave one section empty; a card from the 4Q review session fills it.
    f.as('strategy').conception.addCard({ cell: cell('repositioning.failure_factors'), text: 'Readers skip remote meters on long routes', unitId: null, evidence: null });
  };
  it('writing opens only when every section has an accepted card, and only the Executive writes', () => {
    const f = fresh();
    expect(f.as('executive').conception.saveVision({ vision: 'v', mission: '' })).toEqual({ ok: false, error: 'not_ready' });
    consolidateAll(f);
    expect(f.as('executive').conception.page()!.filled).toBe(11);
    fillAll(f);
    expect(f.as('executive').conception.page()!.vision.open).toBe(true);
    expect(f.as('strategy').conception.saveVision({ vision: 'v', mission: '' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('executive').conception.saveVision({ vision: 'Safe water for every household we serve', mission: '' })).toEqual({ ok: true });
    expect(f.store.visionStatements.map((v) => v.kind)).toEqual(['vision']); // a blank mission is not stored
    expect(f.as('employee').conception.page()!.vision.vision).toBe('Safe water for every household we serve');
  });
  it('every attempt is recorded; a blocked one names what must be fixed; a passed one confirms and locks the vision', () => {
    const f = fresh();
    openConception(f);
    fillAll(f);
    const ex = f.as('executive');
    expect(ex.home().needsYou.map((n) => n.title)).toContain('Write and confirm the vision: Strategic Plan 2027–2031');
    expect(ex.conception.confirmVision()).toEqual({ ok: true, outcome: 'blocked', checks: [{ kind: 'no_vision' }] });
    expect(f.store.gateEvents.slice(-1)[0]).toMatchObject({ gate: 'vision.confirm', outcome: 'blocked', blockingFindingKeys: ['FORM-NO-VISION:StrategicPlan:plan-2027'] });
    expect(f.as('strategy').conception.confirmVision()).toEqual({ ok: false, error: 'not_allowed' });
    ex.conception.saveVision({ vision: 'Safe water for every household we serve', mission: 'We supply, bill and care for our customers fairly.' });
    expect(ex.conception.confirmVision()).toMatchObject({ ok: true, outcome: 'passed', checks: [] });
    expect(f.store.gateEvents.slice(-1)[0]).toMatchObject({ gate: 'vision.confirm', outcome: 'passed', subject: { type: 'StrategicPlan', id: 'plan-2027' }, attempted: { byMembershipId: 'm-md' } });
    expect(f.store.visionStatements.every((v) => v.confirmation?.byMembershipId === 'm-md')).toBe(true);
    expect(ex.conception.saveVision({ vision: 'changed', mission: '' })).toEqual({ ok: false, error: 'locked' });
    expect(ex.conception.confirmVision()).toEqual({ ok: false, error: 'locked' });
    expect(ex.conception.page()!.vision.confirmed).toEqual({ by: 'Chanda Mulenga', on: NOW });
    expect(ex.formation.page().plan?.visionConfirmedOn).toBe(NOW);
    expect(ex.home().needsYou.some((n) => n.title.startsWith('Write and confirm the vision'))).toBe(false);
  });
  it('the AI summary restates accepted cards only, is logged, and is never a vision', async () => {
    const f = fresh();
    fillAll(f);
    const r = await f.as('executive').conception.summarise();
    if (!r.ok) throw new Error('expected a summary');
    expect(r.draft.label).toBe('AI draft');
    expect(r.draft.text).toContain('Retraction: Metered connections rose from 58% to 81%');
    expect(f.store.aiTasks.some((t) => t.kind === 'summarise')).toBe(true);
    expect(f.store.visionStatements).toEqual([]);
    expect(await f.as('finance').conception.summarise()).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('“Needs you” while Conception is open', () => {
  it('department heads, the Strategy office and the Executive each get their next step', async () => {
    const f = fresh();
    expect(f.as('finance').home().needsYou.some((n) => n.key.startsWith('conception:'))).toBe(false); // not until Conception opens
    openConception(f);
    const titles = (r: Role) => f.as(r).home().needsYou.filter((n) => n.key.startsWith('conception:') || n.key.startsWith('approve:vision')).map((n) => n.title);
    expect(titles('finance')).toEqual(['Check 3 AI-drafted cards for Finance']);
    // Commercial's head is vacant, so its two drafts go to the Strategy office with nothing yet consolidated.
    expect(titles('strategy')).toEqual(['Check 2 AI-drafted cards on the 4Q board']);
    for (const id of ['q-2027-r4', 'q-2027-j1', 'q-2027-j2']) f.as('finance').conception.updateCard(id, { decision: 'accept' });
    expect(titles('finance')).toEqual(['Send Finance’s 4Q cards to the Strategy office']);
    f.as('finance').conception.submitDepartment('u-fin');
    expect(titles('finance')).toEqual([]);
    expect(titles('strategy')).toContain('Add Finance’s accepted cards to the organisation sheet');
    expect(titles('executive')).toEqual([]);
  });
});

describe('in every sample organisation', () => {
  it('a newly set-up formed plan has a board, departments from the structure, and nothing filled', () => {
    for (const orgId of ['org-ngo', 'org-mfg', 'org-scale']) {
      const f = fresh(orgId);
      const so = f.as('strategy');
      if (!so.conception.page()) expect(so.formation.setUp({ title: 'Next plan', startYear: 2028, endYear: 2032, processOwnerPositionId: null, preparerMembershipId: null })).toMatchObject({ ok: true });
      const page = so.conception.page()!;
      expect(page.board).toHaveLength(12);
      expect(page.filled).toBe(0);
      // The NGO is one unit, so it has no departments below the top (F-2): the Strategy office works on the organisation sheet directly.
      if (orgId === 'org-ngo') {
        expect(page.departments).toEqual([]);
        expect(so.conception.addCard({ cell: CELLS[0]!, text: 'Clinic visits doubled', unitId: null, evidence: null })).toMatchObject({ ok: true });
      } else expect(page.departments.length).toBeGreaterThan(0);
      expect(page.vision.checks.filter((c) => c.kind === 'cell_empty')).toHaveLength(12);
      // Every department head can open their own part; nobody else's.
      for (const d of page.departments.filter((x) => x.headPositionId)) {
        const holder = f.store.assignments.find((a) => a.positionId === d.headPositionId && a.from <= NOW && (a.to === null || a.to >= NOW));
        const m = holder && f.store.memberships.find((x) => x.personId === holder.personId && x.status === 'active');
        if (!m) continue;
        const mine = f.repoFor(m.id).conception.page()!;
        expect(mine.myDepartments).toContain(d.unitId);
        expect(f.repoFor(m.id).workspaces()).toContain('strategy');
      }
    }
  });
});
