/** Values group work (Values Group Work Specification v0.1, VG-1 to VG-10; contract v1.23). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { groupsBehind, mayStartAfterPublication, withBoardValues } from '../../rules/values-work';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createDevice } from './device';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
type Role = Parameters<typeof devMembership>[1];
const fresh = () => {
  const orgs = createReviewOrgs();
  const org = orgs.find((o) => o.orgId === SWU)! as ReviewOrg;
  const device = createDevice();
  const repoFor = (m: string) => createMemoryRepository(orgs.map((o) => o.store), SWU, m, NOW, { device });
  return { as: (r: Role) => repoFor(devMembership(org, r, NOW)!), repoFor, store: org.store, device };
};
const W = 'ws-2027-values';
const wording = { name: 'Customers first', meaning: 'We answer every customer the same day and give honest bills.' };

describe('setting up a values group (VG-3)', () => {
  it('needs a name and a scribe; member names are optional; only the Strategy office sets groups up', () => {
    const f = fresh();
    const vw = f.as('strategy').valuesWork;
    // The sample session was held on 15 October: groups are set up until a session is held, as for 4Q groups.
    expect(vw.addGroup(W, { name: 'Group 4', scribeMembershipId: 'm-hof', memberNames: [] })).toEqual({ ok: false, error: 'held' });
    f.store.workshops.find((w) => w.id === W)!.status = 'planned';
    expect(vw.addGroup(W, { name: 'Group 4', scribeMembershipId: 'm-hof', memberNames: [] })).toEqual({ ok: true, id: 'g4' });
    expect(vw.addGroup(W, { name: '', scribeMembershipId: 'm-hof', memberNames: [] })).toEqual({ ok: false, error: 'required' });
    expect(vw.addGroup(W, { name: 'Group 5', scribeMembershipId: '', memberNames: ['Billing Clerk'] })).toEqual({ ok: false, error: 'required' });
    expect(f.repoFor('m-fac').valuesWork.addGroup(W, { name: 'Group 5', scribeMembershipId: 'm-hof', memberNames: [] })).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('executive').valuesWork.setGroupClosed(W, 'g3', true)).toEqual({ ok: false, error: 'not_allowed' });
    const g = f.as('strategy').valuesWork.session(W)!.groups.find((x) => x.id === 'g4')!;
    expect([g.name, g.scribe.name, g.memberNames]).toEqual(['Group 4', 'Ruth Phiri', []]);
  });
  it('prints a group sheet with the group, its scribe and any member names, for the Strategy office only', () => {
    const f = fresh();
    expect(f.as('strategy').valuesWork.groupSheet(W, 'g1')).toMatchObject({ organisation: 'Sample Water Utility', name: 'Group 1', memberNames: ['Commercial Manager', 'two district managers', 'Billing Clerk'] });
    expect(f.as('supervisor').valuesWork.groupSheet(W, 'g1')).toBeNull();
  });
});

describe('the scribe’s flip chart', () => {
  it('only the scribe changes the group’s entries, and only while it is open', () => {
    const f = fresh();
    const scribe = f.as('employee').valuesWork; // Group 3, open
    expect(scribe.addAnswer(W, 'g3', 2, 'Leaks are reported but not logged')).toEqual({ ok: true });
    expect(f.as('supervisor').valuesWork.addAnswer(W, 'g3', 2, 'Not my group')).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('supervisor').valuesWork.addAnswer(W, 'g1', 2, 'Group 1 is closed')).toEqual({ ok: false, error: 'closed' });
    expect(f.as('supervisor').valuesWork.flipChart(W, 'g3')).toBeNull(); // a scribe sees only their own group
    expect(f.as('employee').valuesWork.flipChart(W, 'g3')!.answers.map((a) => a.question)).toEqual([1, 4, 2]);
  });
  it('question 5 takes at most three candidates, each named in up to 40 characters', () => {
    const f = fresh();
    const scribe = f.as('employee').valuesWork;
    expect(scribe.addCandidate(W, 'g3', { name: 'x'.repeat(41), meaning: 'Too long a name.', answerIds: [] })).toEqual({ ok: false, error: 'name_too_long' });
    expect(scribe.addCandidate(W, 'g3', { name: 'Courtesy', meaning: '', answerIds: [] })).toEqual({ ok: false, error: 'meaning_required' });
    expect(scribe.addCandidate(W, 'g3', { name: 'Courtesy', meaning: 'We are polite to every caller.', answerIds: ['a2'] })).toMatchObject({ ok: true });
    expect(scribe.addCandidate(W, 'g3', { name: 'Safety', meaning: 'Nobody gets hurt at work.', answerIds: [] })).toMatchObject({ ok: true });
    expect(scribe.addCandidate(W, 'g3', { name: 'One more', meaning: 'A fourth value.', answerIds: [] })).toEqual({ ok: false, error: 'too_many' });
    expect(scribe.flipChart(W, 'g3')!.mayAddCandidate).toBe(false);
  });
  it('entries made offline wait on the device and are sent on reconnect', () => {
    const f = fresh();
    f.as('employee').progress.setOffline(true);
    expect(f.as('employee').valuesWork.addAnswer(W, 'g3', 3, 'Repairs logged on phones')).toEqual({ ok: true, queued: true });
    expect(f.as('employee').valuesWork.flipChart(W, 'g3')!.waitingAnswers.map((a) => a.text)).toEqual(['Repairs logged on phones']);
    f.as('employee').progress.setOffline(false);
    const chart = f.as('employee').valuesWork.flipChart(W, 'g3')!;
    expect(chart.waitingAnswers).toEqual([]);
    expect(chart.answers.map((a) => a.text)).toContain('Repairs logged on phones');
  });
  it('the Strategy office may enter for a scribe who cannot sign in, recorded as on the group’s behalf', () => {
    const f = fresh();
    expect(f.as('strategy').valuesWork.addCandidate(W, 'g3', { name: 'Courtesy', meaning: 'We are polite to every caller.', answerIds: [] })).toMatchObject({ ok: true });
    expect(f.store.valueCandidates.find((c) => c.name === 'Courtesy')!.onBehalf).toBe(true);
  });
  it('the AI tidies wording only on request and never proposes a value (VG-7)', async () => {
    const f = fresh();
    const r = await f.as('employee').valuesWork.tidyWording(W, 'g3', 'we fix faults fast  day or night');
    expect(r).toEqual({ ok: true, draft: { label: 'AI draft', text: 'We fix faults fast day or night.' } });
    expect(await f.as('employee').valuesWork.tidyWording(W, 'g3', ' ')).toEqual({ ok: false, error: 'meaning_required' });
    expect(f.store.valueCandidates.filter((c) => c.groupId === 'g3')).toHaveLength(1); // nothing was added by the AI
  });
});

describe('the values board (VG-5, VG-6)', () => {
  it('shows candidates only once their group is closed', () => {
    const f = fresh();
    const board = () => f.as('strategy').valuesWork.board(W)!;
    expect(board().candidates.map((c) => c.name)).not.toContain('Quick response');
    expect(board().toReview).toBe(6);
    f.as('strategy').valuesWork.setGroupClosed(W, 'g3', true);
    expect(board().candidates.map((c) => c.name)).toContain('Quick response');
  });
  it('keeps (the group’s wording stays), merges with groups combined, sets aside with a reason, and reopens', () => {
    const f = fresh();
    const vw = f.repoFor('m-fac').valuesWork; // facilitators review too (VG-5)
    expect(vw.keep('vc-2027-2', { name: 'Safe water, always', meaning: 'We never compromise on water quality.' })).toEqual({ ok: true });
    expect(vw.setAside('vc-2027-5', ' ')).toEqual({ ok: false, error: 'reason_required' });
    expect(vw.setAside('vc-2027-5', 'Covered by Customer care')).toEqual({ ok: true });
    expect(vw.merge(['vc-2027-1', 'vc-2027-4'], 'vc-2027-1', wording)).toEqual({ ok: true });
    const board = f.as('strategy').valuesWork.board(W)!;
    const merged = board.candidates.find((c) => c.id === 'vc-2027-1')!;
    expect([merged.name, merged.groups, merged.of, merged.mergedFrom]).toEqual(['Customers first', ['Group 1', 'Group 2'], 3, [{ name: 'Putting customers first', group: 'Group 2' }]]);
    expect(board.candidates.find((c) => c.id === 'vc-2027-2')!.entered).toEqual({ name: 'Safe water first', meaning: 'We never compromise on water quality, whatever the pressure.' });
    expect(board.candidates.find((c) => c.id === 'vc-2027-5')!.setAsideReason).toBe('Covered by Customer care');
    expect(board.candidates.some((c) => c.id === 'vc-2027-4')).toBe(false); // shown inside the one it joined
    expect(groupsBehind(f.store.valueCandidates, 'vc-2027-1')).toEqual(['g1', 'g2']);
    expect(f.as('strategy').valuesWork.setGroupClosed(W, 'g1', false)).toEqual({ ok: true });
    expect(f.as('strategy').valuesWork.board(W)!.candidates.find((c) => c.id === 'vc-2027-3')).toBeUndefined(); // still to review: back with the group
    expect(f.as('strategy').valuesWork.board(W)!.candidates.find((c) => c.id === 'vc-2027-1')).toBeDefined(); // already reviewed: stays
  });
  it('the Executive sees the board but cannot act on it', () => {
    const f = fresh();
    const b = f.as('executive').valuesWork.board(W)!;
    expect(b.canReview).toBe(false);
    expect(f.as('executive').valuesWork.keep('vc-2027-3')).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('the short list and drafting (VM-4)', () => {
  it('takes up to ten kept candidates into the draft values, remembering where each came from', () => {
    const f = fresh();
    const vw = f.as('strategy').valuesWork;
    expect(vw.addToDraftValues('vc-2027-1')).toEqual({ ok: false, error: 'not_kept' });
    vw.merge(['vc-2027-1', 'vc-2027-4'], 'vc-2027-1', wording);
    expect(vw.addToDraftValues('vc-2027-1')).toEqual({ ok: true });
    expect(vw.addToDraftValues('vc-2027-1')).toEqual({ ok: false, error: 'in_draft' });
    const v = f.store.visionStatements.find((x) => x.planId === 'plan-2027' && x.kind === 'value')!;
    expect([v.name, v.fromCandidateIds, v.confirmation]).toEqual(['Customers first', ['vc-2027-1'], null]);
    expect(vw.backing(v.fromCandidateIds)).toEqual({ groups: 2, of: 3 });
    expect(vw.setAside('vc-2027-1', 'Changed our mind')).toEqual({ ok: false, error: 'in_draft' });
    // The vision step carries it, so the Executive sees "put forward by 2 of 3 groups" when confirming.
    expect(f.as('executive').conception.page()!.vision.values).toEqual([{ name: 'Customers first', text: wording.meaning, fromCandidateIds: ['vc-2027-1'] }]);
  });
});

describe('who sees it (VG-9)', () => {
  it('everyone outside the Strategy office, facilitators, the Executive and a group’s own scribe sees nothing', () => {
    const f = fresh();
    expect(f.as('finance').valuesWork.board(W)).toBeNull();
    expect(f.as('finance').valuesWork.session(W)).toBeNull();
    expect(f.as('finance').valuesWork.flipChart(W, 'g1')).toBeNull();
    expect(f.as('supervisor').valuesWork.board(W)).toBeNull(); // a scribe sees their flip chart, not the board
    expect(f.as('supervisor').valuesWork.flipChart(W, 'g1')).not.toBeNull();
    expect(f.as('executive').valuesWork.board(W)).not.toBeNull();
  });
});

describe('when it runs (VG-8)', () => {
  it('after publication, group work is offered only while the active plan has no values', () => {
    const f = fresh();
    const plan = f.store.plans.find((p) => p.status === 'active')!;
    expect(mayStartAfterPublication(plan, f.store.visionStatements, f.store.workshops)).toBe(true);
    expect(f.as('executive').valuesWork.canStartAfterPublication()).toBe(false); // the Strategy office starts it
    const r = f.as('strategy').valuesWork.startAfterPublication();
    expect(r).toMatchObject({ ok: true });
    expect(f.as('strategy').valuesWork.sessionFor('after')!.route).toBe('after');
    expect(f.as('strategy').valuesWork.canStartAfterPublication()).toBe(false); // one session at a time
    const g = fresh();
    g.as('executive').strategyLanding.recordValues([{ name: 'Integrity', text: 'We do what we say.' }]);
    expect(g.as('strategy').valuesWork.canStartAfterPublication()).toBe(false);
    expect(g.as('strategy').valuesWork.startAfterPublication()).toEqual({ ok: false, error: 'not_offered' });
  });
  it('while forming, nothing changes once the vision (with its values) is confirmed', () => {
    const f = fresh();
    f.store.visionStatements.push({
      orgId: f.store.organisation.id, created: { at: '2026-11-19T10:00:00+02:00' as never, byMembershipId: 'm-md' as never }, updated: { at: '2026-11-19T10:00:00+02:00' as never, byMembershipId: 'm-md' as never },
      id: 'vs-test' as never, planId: 'plan-2027' as never, kind: 'vision', text: 'Safe water for all.', confirmation: { at: '2026-11-19T10:00:00+02:00' as never, byMembershipId: 'm-md' as never },
    });
    expect(f.as('strategy').valuesWork.keep('vc-2027-3')).toEqual({ ok: false, error: 'locked' });
    expect(f.as('employee').valuesWork.addAnswer(W, 'g3', 1, 'Too late')).toEqual({ ok: false, error: 'locked' });
  });
});

describe('editing the draft values while the board adds one', () => {
  it('keeps edits not yet saved and adds the value from the board at the end', () => {
    const editing = [{ name: 'Honesty (edited)', text: 'We tell the truth.' }];
    const stored = [{ name: 'Honesty', text: 'We tell the truth.' }, { name: 'Customers first', text: 'Same-day answers.', fromCandidateIds: ['vc-1'] }];
    expect(withBoardValues(editing, stored)).toEqual([editing[0], stored[1]]);
    expect(withBoardValues([...editing, stored[1]!], stored)).toHaveLength(2); // already there: not added twice
  });
});
