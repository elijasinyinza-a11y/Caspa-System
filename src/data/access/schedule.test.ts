/** The forming schedule through the data-access layer (Forming Schedule Specification v0.1; contract v1.18). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { clearSampleSchedule } from '../sample/schedule-samples';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
type Role = Parameters<typeof devMembership>[1];
const fresh = (now = NOW, blank = false) => {
  const orgs = createReviewOrgs();
  const org = orgs.find((o) => o.orgId === SWU)! as ReviewOrg;
  if (blank) clearSampleSchedule(org.store);
  const repoFor = (m: string, at = now) => createMemoryRepository(orgs.map((o) => o.store), SWU, m, at);
  return { as: (r: Role, at = now) => repoFor(devMembership(org, r, at)!, at), repoFor, store: org.store };
};

describe('the schedule page', () => {
  it('groups dated items by month, keeps undated items apart, and names what comes next', () => {
    const sc = fresh().as('strategy').formation.page().schedule;
    expect(sc.months.map((m) => m.month)).toEqual(['2026-10', '2026-11', '2027-01', '2027-02']);
    expect(sc.undated.map((i) => i.label)).toEqual(['Department briefings on the new plan']);
    expect(sc.next).toMatchObject({ label: 'Department sheets due', status: 'soon', inDays: 5 });
    expect(sc.months[0]!.items[0]).toMatchObject({ label: 'Leadership briefing on the 4Q review', status: 'done', doneBy: 'hand' });
  });
  it('the preparer edits; the Executive sees it; a department head sees only what they may view', () => {
    const f = fresh();
    expect(f.as('strategy').formation.page().schedule.canEdit).toBe(true);
    expect(f.as('executive').formation.page().schedule).toMatchObject({ canEdit: false, canBuild: false });
    expect(f.as('executive').formation.page().schedule.months.length).toBe(4);
  });
  it('with nothing scheduled the preparer builds the usual sequence once; others are told who builds it', () => {
    const f = fresh(NOW, true);
    const so = f.as('strategy').formation;
    expect(so.buildSchedule()).toEqual({ ok: false, error: 'not_preparer' });
    so.setUp({ title: 'Strategic Plan 2027–2031', startYear: 2027, endYear: 2031, processOwnerPositionId: 'pos-spm', preparerMembershipId: 'm-spm' });
    expect(f.as('strategy').formation.page().schedule).toMatchObject({ empty: true, canBuild: true });
    expect(f.as('executive').formation.page().schedule.canBuild).toBe(false);
    const r = f.as('strategy').formation.buildSchedule();
    expect(r).toEqual({ ok: true, added: 7 });
    const sc = f.as('strategy').formation.page().schedule;
    expect(sc.empty).toBe(false);
    expect(sc.months).toEqual([]);
    expect(sc.undated.map((i) => i.label ?? i.purposes.join() ?? '')).toEqual(expect.arrayContaining(['Department sheets due', 'Consultation closes', 'Board meeting: plan approval']));
    expect(sc.undated.filter((i) => i.kind === 'confirmation')).toHaveLength(2);
    expect(f.as('strategy').formation.buildSchedule()).toEqual({ ok: false, error: 'not_empty' });
    expect(f.store.formationDeadlines.find((d) => d.label === 'Department sheets due')!.doneWhen).toBe('department_sheets_submitted');
  });
  it('the preparer dates, renames and removes items, and dates the two confirmations', () => {
    const f = fresh();
    const so = f.as('strategy').formation;
    expect(so.updateDeadline('fd-2027-6', { dueOn: '2027-03-10' as ISODate, label: 'Department briefings' })).toEqual({ ok: true });
    expect(f.as('executive').formation.updateDeadline('fd-2027-6', { label: 'x' })).toEqual({ ok: false, error: 'not_preparer' });
    expect(f.store.formationDeadlines.find((d) => d.id === 'fd-2027-6')).toMatchObject({ dueOn: '2027-03-10', label: 'Department briefings' });
    expect(f.as('strategy').formation.setGateTarget('vision.confirm', null)).toEqual({ ok: true });
    expect(f.as('strategy').formation.page().schedule.undated.some((i) => i.key === 'gate:vision.confirm')).toBe(true);
    expect(f.as('strategy').formation.addDeadline({ label: 'Meeting with the regulator', ownerPositionIds: ['pos-spm'], dueOn: null, kind: 'meeting', stage: 'confirmation' })).toMatchObject({ ok: true });
  });
});

describe('marking an item done', () => {
  it('only items with no record behind them, once their date has come, by an owner or the Strategy office', () => {
    const later = '2026-11-13' as ISODate;
    const f = fresh(later);
    expect(f.as('finance', later).formation.markDeadlineDone('fd-2027-3')).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('strategy', later).formation.markDeadlineDone('fd-2027-4')).toEqual({ ok: false, error: 'done' });
    expect(f.as('strategy', later).formation.markDeadlineDone('fd-2027-5')).toEqual({ ok: false, error: 'not_yet' });
    expect(f.as('strategy', later).formation.markDeadlineDone('fd-2027-3')).toEqual({ ok: true });
    expect(f.store.formationDeadlines.find((d) => d.id === 'fd-2027-3')!.completed).not.toBeNull();
    expect(f.store.auditEntries.slice(-1)[0]).toMatchObject({ action: 'complete', entity: { type: 'FormationDeadline', id: 'fd-2027-3' } });
    // The owner may mark their own: the Managing Director owns the board meeting.
    const board = '2027-02-26' as ISODate;
    expect(fresh(board).as('executive', board).formation.markDeadlineDone('fd-2027-5')).toEqual({ ok: true });
  });
  it('the Mark done button shows only where the action is allowed', () => {
    const later = '2026-11-13' as ISODate;
    const items = (r: Role) => { const sc = fresh(later).as(r, later).formation.page().schedule; return [...sc.months.flatMap((m) => m.items), ...sc.undated]; };
    expect(items('strategy').filter((i) => i.canMarkDone).map((i) => i.label)).toEqual(['Consultation with staff and stakeholders']);
    expect(items('executive').filter((i) => i.canMarkDone)).toEqual([]);
  });
});

describe('“Needs you” for the schedule', () => {
  it('undated items and done items never appear; dated ones reach their owners', () => {
    const f = fresh();
    const titles = (r: Role) => f.as(r).home().needsYou.map((i) => i.title);
    expect(titles('finance')).toContain('Department sheets due');
    expect(titles('finance')).not.toContain('Department briefings on the new plan');
    expect(titles('strategy')).not.toContain('Leadership briefing on the 4Q review');
  });
});

describe('decision-log actions', () => {
  const held = () => {
    const f = fresh();
    const so = f.as('strategy').formation;
    expect(so.addDecision('ws-2027-4q', { decision: 'Draft the cost-of-service study terms', actions: [{ text: 'Send the draft terms', ownerPositionId: 'pos-hof', dueOn: '2026-11-20' as ISODate }] })).toEqual({ ok: true });
    expect(so.markHeld('ws-2027-4q')).toEqual({ ok: true });
    return f;
  };
  it('the assignee or the Strategy office closes an action, which then leaves “Needs you”; others cannot', () => {
    const f = held();
    expect(f.as('finance').home().needsYou.map((i) => i.title)).toContain('Send the draft terms');
    expect(f.as('executive').formation.setActionDone('ws-2027-4q', 0, 0, true)).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('finance').formation.setActionDone('ws-2027-4q', 0, 0, true)).toEqual({ ok: true });
    expect(f.as('finance').home().needsYou.map((i) => i.title)).not.toContain('Send the draft terms');
    expect(f.as('finance').formation.setActionDone('ws-2027-4q', 0, 0, true)).toEqual({ ok: false, error: 'done' });
  });
  it('a done action can be reopened by the same people, and both steps are recorded', () => {
    const f = held();
    f.as('strategy').formation.setActionDone('ws-2027-4q', 0, 0, true);
    expect(f.as('strategy').formation.setActionDone('ws-2027-4q', 0, 0, false)).toEqual({ ok: true });
    expect(f.store.auditEntries.slice(-2).map((a) => a.action)).toEqual(['action.done', 'action.reopen']);
    expect(f.as('finance').home().needsYou.map((i) => i.title)).toContain('Send the draft terms');
  });
  it('the session card shows who closed it and when, and who may close it', () => {
    const f = held();
    f.as('finance').formation.setActionDone('ws-2027-4q', 0, 0, true);
    const a = f.as('strategy').formation.page().sessions.find((w) => w.id === 'ws-2027-4q')!.decisionLog[0]!.actions[0]!;
    expect(a).toMatchObject({ canClose: true, done: { by: 'Ruth Phiri', on: '2026-10-18' } });
  });
});

describe('stages from the strip', () => {
  it('opens, closes and reopens a stage; counts show how many items each stage has', () => {
    const f = fresh();
    const so = f.as('strategy').formation;
    expect(so.page().schedule.counts.conception).toBe(3);
    expect(so.moveStage('conception', 'complete')).toEqual({ ok: true });
    expect(f.as('strategy').formation.moveStage('conception', 'open')).toEqual({ ok: true });
    expect(f.as('executive').formation.page().schedule.canMoveStages).toBe(false);
  });
});
