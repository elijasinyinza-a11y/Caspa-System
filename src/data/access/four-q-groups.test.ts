/** 4Q group work (4Q Group Work Specification v0.1; contract v1.19) and removing a card (contract v1.20). */
import type { FourQCell, ISODate } from '../../contract/caspa-data-contract';
import { cellKey, filledCells } from '../../rules/conception';
import { fourQCandidates } from '../../selectors/four-q-candidates';
import { createDevice } from './device';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
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
const W = 'ws-2027-4q';
const pastFailure: FourQCell = { band: 'retraction', column: 'failures' };
const presentFailure: FourQCell = { band: 'repositioning', column: 'failures' };

describe('setting up groups', () => {
  it('only the Strategy office adds, changes, closes and reopens groups; a facilitator or the Executive cannot', () => {
    const f = fresh();
    const input = { name: 'Group 4', cells: [{ band: 'projection', column: 'risks' } as FourQCell], scribeMembershipId: 'm-hof', memberNames: ['Billing Clerk'] };
    expect(f.as('executive').formation.addGroup(W, input)).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('strategy').formation.addGroup(W, input)).toEqual({ ok: true, id: 'g4' });
    expect(f.as('strategy').formation.addGroup(W, { ...input, cells: [pastFailure, pastFailure] })).toEqual({ ok: false, error: 'cells' });
    expect(f.as('strategy').formation.addGroup(W, { ...input, scribeMembershipId: '' })).toEqual({ ok: false, error: 'required' });
    expect(f.as('strategy').formation.updateGroup(W, 'g4', { name: 'Group 4b' })).toEqual({ ok: true });
    expect(f.as('executive').formation.setGroupClosed(W, 'g4', true)).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('groups are set up until the session is held; closing and reopening still work after', () => {
    const f = fresh();
    f.as('strategy').formation.markHeld(W);
    expect(f.as('strategy').formation.addGroup(W, { name: 'Late', cells: [pastFailure], scribeMembershipId: 'm-hof', memberNames: [] })).toEqual({ ok: false, error: 'held' });
    expect(f.as('strategy').formation.setGroupClosed(W, 'g1', true)).toEqual({ ok: true });
    expect(f.as('strategy').formation.setGroupClosed(W, 'g1', false)).toEqual({ ok: true });
    expect(f.store.auditEntries.slice(-2).map((a) => a.action)).toEqual(['group.close', 'group.reopen']);
  });
  it('the session card lists each group with its scribe and cards to review', () => {
    const w = fresh().as('strategy').formation.page().sessions.find((x) => x.id === W)!;
    expect(w.groups.map((g) => [g.name, g.scribe.name, g.toReview])).toEqual([['Group 1', 'Esther Banda', 2], ['Group 2', 'Joseph Tembo', 2], ['Group 3', 'Bwalya Musonda', 0]]);
    expect(w.canManageGroups).toBe(true);
  });
});

describe('the scribe’s 4Q flip chart', () => {
  it('opens for its scribe and the Strategy office only', () => {
    const f = fresh();
    expect(f.as('supervisor').conception.flipChart(W, 'g1')).toMatchObject({ name: 'Group 1', isScribe: true });
    expect(f.as('strategy').conception.flipChart(W, 'g1')).toMatchObject({ isScribe: false });
    expect(f.as('finance').conception.flipChart(W, 'g1')).toBeNull();
    expect(f.as('supervisor').conception.flipChart(W, 'g2')).toBeNull();
  });
  it('the scribe adds cards only in the group’s sections, only while it is open', () => {
    const f = fresh();
    const sc = f.as('supervisor').conception;
    expect(sc.addGroupCard(W, 'g1', { cell: presentFailure, text: 'x', evidence: null })).toEqual({ ok: false, error: 'cell' });
    expect(sc.addGroupCard(W, 'g1', { cell: pastFailure, text: '  ', evidence: null })).toEqual({ ok: false, error: 'required' });
    expect(f.as('strategy').conception.addGroupCard(W, 'g1', { cell: pastFailure, text: 'x', evidence: null })).toEqual({ ok: false, error: 'not_allowed' });
    const r = sc.addGroupCard(W, 'g1', { cell: pastFailure, text: 'Billing disputes took months to settle', evidence: null });
    expect(r).toMatchObject({ ok: true });
    const card = f.store.fourQEntries.find((e) => e.text === 'Billing disputes took months to settle')!;
    expect(card).toMatchObject({ scope: 'organisation', fromGroup: { workshopId: W, groupId: 'g1' }, draft: { state: 'ai_draft', provenance: { kind: 'manual' } } });
    f.as('strategy').formation.setGroupClosed(W, 'g1', true);
    expect(f.as('supervisor').conception.addGroupCard(W, 'g1', { cell: pastFailure, text: 'Too late', evidence: null })).toEqual({ ok: false, error: 'closed' });
  });
  it('the scribe changes or deletes cards still waiting for review; reopening covers only those', () => {
    const f = fresh();
    expect(f.as('supervisor').conception.updateGroupCard('q-2027-g1', { text: 'Sanitation coverage stayed well below target', evidence: null })).toEqual({ ok: true });
    f.as('strategy').conception.updateCard('q-2027-g2', { decision: 'accept' });
    expect(f.as('supervisor').conception.updateGroupCard('q-2027-g2', { text: 'changed', evidence: null })).toEqual({ ok: false, error: 'locked' });
    f.as('strategy').formation.setGroupClosed(W, 'g1', true);
    expect(f.as('supervisor').conception.deleteGroupCard('q-2027-g1')).toEqual({ ok: false, error: 'closed' });
    f.as('strategy').formation.setGroupClosed(W, 'g1', false);
    expect(f.as('supervisor').conception.updateGroupCard('q-2027-g2', { text: 'changed', evidence: null })).toEqual({ ok: false, error: 'locked' });
    expect(f.as('supervisor').conception.deleteGroupCard('q-2027-g1')).toEqual({ ok: true });
    expect(f.store.fourQEntries.some((e) => e.id === 'q-2027-g1')).toBe(false);
    expect(f.store.auditEntries.slice(-1)[0]).toMatchObject({ action: 'delete', entity: { id: 'q-2027-g1' } });
  });
  it('offline, cards wait on the device and are sent when the scribe is back online', () => {
    const f = fresh();
    f.as('supervisor').progress.setOffline(true);
    const r = f.as('supervisor').conception.addGroupCard(W, 'g1', { cell: pastFailure, text: 'Kept on the phone', evidence: null });
    expect(r).toEqual({ ok: true, queued: true });
    expect(f.store.fourQEntries.some((e) => e.text === 'Kept on the phone')).toBe(false);
    expect(f.as('supervisor').conception.flipChart(W, 'g1')!.waiting.map((x) => x.text)).toEqual(['Kept on the phone']);
    expect(f.as('strategy').conception.flipChart(W, 'g1')!.waiting).toEqual([]);
    f.as('supervisor').progress.setOffline(false);
    expect(f.store.fourQEntries.find((e) => e.text === 'Kept on the phone')).toMatchObject({ fromGroup: { groupId: 'g1' } });
    expect(f.device.groupCards).toEqual([]);
  });
});

describe('reviewing group cards on the board', () => {
  it('group cards never fill a section until the Strategy office accepts them', () => {
    const f = fresh();
    const before = filledCells(f.store, 'plan-2027').map(cellKey);
    expect(before).not.toContain(cellKey(pastFailure));
    expect(f.as('strategy').conception.updateCard('q-2027-g1', { decision: 'accept' })).toEqual({ ok: true });
    expect(filledCells(f.store, 'plan-2027').map(cellKey)).toContain(cellKey(pastFailure));
  });
  it('only the Strategy office accepts, edits, merges or rejects them; a facilitator, the Executive or a department head cannot', () => {
    const f = fresh();
    const strategy = f.store.memberships.find((m) => m.id === 'm-spm')!;
    strategy.roles = ['facilitator'];
    expect(f.repoFor('m-spm').conception.updateCard('q-2027-g1', { decision: 'accept' })).toEqual({ ok: false, error: 'not_allowed' });
    const typed = f.repoFor('m-spm').conception.addCard({ cell: pastFailure, text: 'Sanitation targets missed again', unitId: null, evidence: null });
    if (!typed.ok) throw new Error('expected a card');
    expect(f.repoFor('m-spm').conception.merge(typed.id, 'q-2027-g1')).toEqual({ ok: false, error: 'not_allowed' });
    strategy.roles = ['strategy_office'];
    expect(f.as('executive').conception.updateCard('q-2027-g1', { decision: 'reject' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('strategy').conception.updateCard('q-2027-g3', { text: 'Water losses too high in the network' })).toEqual({ ok: true });
    expect(f.store.fourQEntries.find((e) => e.id === 'q-2027-g3')!.draft.state).toBe('accepted');
  });
  it('the board labels each card with its group, never as an AI draft, and filters “to review” by group', () => {
    const c = fresh().as('strategy').conception.page()!;
    const card = c.board.flatMap((x) => x.cards).find((x) => x.id === 'q-2027-g3')!;
    expect(card).toMatchObject({ toReview: true, group: { name: 'Group 2' }, source: 'Group 2, 4Q review session', canDecide: true });
    expect(c.groups.map((g) => [g.name, g.toReview])).toEqual([['Group 1', 2], ['Group 2', 2], ['Group 3', 0]]);
    expect(c.reviewsGroups).toBe(true);
  });
  it('the scribe gets their flip chart in “Needs you” while the group is open; the Strategy office gets the cards to review', () => {
    const f = fresh();
    expect(f.as('supervisor').home().needsYou.map((i) => i.title)).toContain('Enter Group 1’s cards on its 4Q flip chart');
    expect(f.as('strategy').home().needsYou.map((i) => i.title)).toContain('Review 4 cards from the 4Q review groups');
    f.as('strategy').formation.setGroupClosed(W, 'g1', true);
    expect(f.as('supervisor').home().needsYou.map((i) => i.title)).not.toContain('Enter Group 1’s cards on its 4Q flip chart');
  });
});

describe('removing a card (v1.20)', () => {
  const accepted = (f: ReturnType<typeof fresh>) => { f.as('strategy').conception.updateCard('q-2027-g1', { decision: 'accept' }); return 'q-2027-g1'; };
  it('needs a reason, keeps the card in the record, and the section counts as unfilled when it empties', () => {
    const f = fresh();
    const id = accepted(f);
    expect(f.as('strategy').conception.removeCard(id, '  ')).toEqual({ ok: false, error: 'reason' });
    expect(f.as('strategy').conception.removeCard(id, 'Repeats a card from the Operations sheet')).toEqual({ ok: true });
    expect(f.store.fourQEntries.find((e) => e.id === id)!.removed).toMatchObject({ reason: 'Repeats a card from the Operations sheet' });
    expect(filledCells(f.store, 'plan-2027').map(cellKey)).not.toContain(cellKey(pastFailure));
    const c = f.as('strategy').conception.page()!;
    expect(c.removed.map((x) => x.id)).toEqual([id]);
    expect(c.board.flatMap((x) => x.cards).some((x) => x.id === id)).toBe(false);
  });
  it('drafts are rejected, not removed; only those who may edit the card remove it', () => {
    const f = fresh();
    expect(f.as('strategy').conception.removeCard('q-2027-g1', 'why')).toEqual({ ok: false, error: 'not_accepted' });
    const id = accepted(f);
    expect(f.as('executive').conception.removeCard(id, 'why')).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('is refused while linked to a theme, goal or objective, and after plan confirmation', () => {
    const f = fresh();
    const id = accepted(f);
    f.store.themes.push({ orgId: f.store.organisation.id, id: 'th-x' as never, planId: 'plan-2027' as never, title: 'Sanitation', fourQEntryIds: [id as never], draft: { state: 'human', provenance: { kind: 'manual' }, decided: null }, created: f.store.plans[0]!.created, updated: f.store.plans[0]!.updated } as never);
    expect(f.as('strategy').conception.removeCard(id, 'why')).toEqual({ ok: false, error: 'linked' });
    expect(f.as('strategy').conception.page()!.board.flatMap((x) => x.cards).find((x) => x.id === id)).toMatchObject({ canRemove: false, removeBlocked: 'linked' });
    f.store.themes.pop();
    f.store.plans.find((p) => p.id === 'plan-2027')!.status = 'confirmed';
    expect(f.as('strategy').conception.removeCard(id, 'why')).toEqual({ ok: false, error: 'locked' });
  });
  it('a removed suggestion is not offered again', () => {
    const f = fresh();
    const so = f.as('strategy').conception;
    const sheet = so.page()!.candidates.find((x) => x.open.length)!;
    const key = sheet.open[0]!.key;
    return so.acceptCandidate(key).then((r) => {
      if (!r.ok) throw new Error('expected a card');
      expect(f.as('strategy').conception.removeCard(r.id, 'Not relevant to the new plan')).toEqual({ ok: true });
      expect(fourQCandidates(f.store, 'plan-2027', { now: NOW, financialYear: 2026 }).some((c) => c.key === key)).toBe(false);
    });
  });
});
