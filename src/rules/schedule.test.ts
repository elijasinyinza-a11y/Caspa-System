/** The forming schedule (Forming Schedule Specification v0.1; contract v1.18): every status computed from records. */
import type { ISODate } from '../contract/caspa-data-contract';
import { createReviewOrgs } from '../data/sample/review';
import { byMonth, countsByStage, deadlineDone, mayMarkDone, nextItem, schedule, starterSchedule, statusOf } from './schedule';
import { SUBMIT_ACTION, departments } from './conception';

const NOW = '2026-10-18' as ISODate;
const swu = () => createReviewOrgs()[0]!.store;
const planOf = (s: ReturnType<typeof swu>) => s.plans.find((p) => p.id === 'plan-2027')!;

describe('status against "now"', () => {
  it('reads Done, Today, In n days within a week, Overdue, or nothing', () => {
    expect(statusOf(true, '2026-10-01' as ISODate, NOW)).toEqual({ status: 'done', inDays: -17 });
    expect(statusOf(false, NOW, NOW)).toEqual({ status: 'today', inDays: 0 });
    expect(statusOf(false, '2026-10-25' as ISODate, NOW)).toEqual({ status: 'soon', inDays: 7 });
    expect(statusOf(false, '2026-10-26' as ISODate, NOW)).toEqual({ status: null, inDays: 8 });
    expect(statusOf(false, '2026-10-17' as ISODate, NOW)).toEqual({ status: 'overdue', inDays: -1 });
    expect(statusOf(false, null, NOW)).toEqual({ status: null, inDays: null });
  });
});

describe('the sample schedule for 2027–2031', () => {
  it('lists sessions, deadlines and both confirmations, dated first in date order, then the undated', () => {
    const s = swu();
    const items = schedule(s, planOf(s), NOW);
    const dated = items.filter((i) => i.date).map((i) => i.date!);
    expect(dated).toEqual([...dated].sort());
    expect(items.slice(-1)[0]!.date).toBeNull();
    expect(items.filter((i) => i.kind === 'confirmation').map((i) => i.date)).toEqual(['2026-11-30', '2027-01-29']);
    expect(byMonth(items).map((m) => m.month)).toEqual(['2026-10', '2026-11', '2027-01', '2027-02']);
    expect(countsByStage(items)).toEqual({ conception: 3, consultation: 2, confirmation: 1, composition: 3, communication: 1 });
  });
  it('marks the plan confirmation as needing the board’s resolution when the setting is on, and not otherwise', () => {
    const s = swu();
    expect(schedule(s, planOf(s), NOW).find((i) => i.key === 'gate:plan.confirm')!.needsBoard).toBe(s.organisation.settings.boardApprovalRequired.plan);
    s.organisation.settings.boardApprovalRequired.plan = false;
    expect(schedule(s, planOf(s), NOW).find((i) => i.key === 'gate:plan.confirm')!.needsBoard).toBe(false);
  });
  it('the next item is the first not done from today on', () => {
    const s = swu();
    expect(nextItem(schedule(s, planOf(s), NOW), NOW)!.key).toBe('deadline:fd-2027-2');
  });
});

describe('when an item counts as done', () => {
  it('a session is done when it is held; nothing else marks it', () => {
    const s = swu();
    const w = s.workshops.find((x) => x.id === 'ws-2027-4q')!;
    expect(schedule(s, planOf(s), NOW).find((i) => i.key === `session:${w.id}`)!.done).toBe(false);
    w.status = 'held';
    expect(schedule(s, planOf(s), NOW).find((i) => i.key === `session:${w.id}`)).toMatchObject({ done: true, doneBy: 'record', linked: 'session' });
  });
  it('“Department sheets due” is done only when every department has submitted its sheet', () => {
    const s = swu();
    const d = s.formationDeadlines.find((x) => x.id === 'fd-2027-2')!;
    expect(deadlineDone(s, d)).toEqual({ done: false, doneBy: null });
    const ds = departments(s);
    const submit = (unitId: string) => s.auditEntries.push({ orgId: s.organisation.id, id: `ae-${unitId}` as never, action: SUBMIT_ACTION, entity: { type: 'OrgUnit', id: unitId }, before: null, after: { planId: 'plan-2027' }, at: '2026-10-20T09:00:00+02:00' as never, actorMembershipId: 'm-hof' as never });
    ds.slice(0, -1).forEach((x) => submit(x.unitId));
    expect(deadlineDone(s, d).done).toBe(false);
    submit(ds.slice(-1)[0]!.unitId);
    expect(deadlineDone(s, d)).toEqual({ done: true, doneBy: 'record' });
    // A completed stamp on a computed item is never read: the record decides.
    expect(mayMarkDone(d, '2026-12-01' as ISODate)).toBe(false);
  });
  it('“Consultation closes” is done only when the plan’s consultation round is closed', () => {
    const s = swu();
    const d = s.formationDeadlines.find((x) => x.id === 'fd-2027-4')!;
    expect(deadlineDone(s, d).done).toBe(s.consultationRounds.some((r) => r.planId === 'plan-2027') && s.consultationRounds.filter((r) => r.planId === 'plan-2027').every((r) => r.status === 'closed'));
    for (const r of s.consultationRounds.filter((x) => x.planId === 'plan-2027')) r.status = 'closed';
    if (s.consultationRounds.some((r) => r.planId === 'plan-2027')) expect(deadlineDone(s, d)).toEqual({ done: true, doneBy: 'record' });
  });
  it('a confirmation is done when its gate has passed, never before', () => {
    const s = swu();
    const item = () => schedule(s, planOf(s), NOW).find((i) => i.key === 'gate:vision.confirm')!;
    expect(item().done).toBe(false);
    s.gateEvents.push({ orgId: s.organisation.id, id: 'ge-x' as never, gate: 'vision.confirm', subject: { type: 'StrategicPlan', id: 'plan-2027' }, attempted: { at: '2026-11-30T09:00:00+02:00' as never, byMembershipId: 'm-md' as never }, outcome: 'blocked', blockingFindingKeys: ['x'], advisoryAtGate: [] });
    expect(item().done).toBe(false);
    s.gateEvents.push({ ...s.gateEvents.slice(-1)[0]!, id: 'ge-y' as never, outcome: 'passed', blockingFindingKeys: [] });
    expect(item()).toMatchObject({ done: true, doneBy: 'record' });
  });
  it('anything else is marked by hand, and only once its date has come', () => {
    const s = swu();
    const done = s.formationDeadlines.find((x) => x.id === 'fd-2027-1')!;
    expect(deadlineDone(s, done)).toEqual({ done: true, doneBy: 'hand' });
    const meeting = s.formationDeadlines.find((x) => x.id === 'fd-2027-3')!;
    expect(mayMarkDone(meeting, NOW)).toBe(false);
    expect(mayMarkDone(meeting, '2026-11-12' as ISODate)).toBe(true);
    const undated = s.formationDeadlines.find((x) => x.id === 'fd-2027-6')!;
    expect(mayMarkDone(undated, '2030-01-01' as ISODate)).toBe(false);
  });
});

describe('the starting schedule', () => {
  it('offers the usual sequence with plain names; a board meeting only when board approval is required', () => {
    expect(starterSchedule(true).map((x) => (x.type === 'session' ? x.purpose : x.label))).toEqual(['sheets', 'four_q_review', 'consultation', 'closes', 'composition', 'board', 'launch']);
    expect(starterSchedule(false).some((x) => x.type === 'deadline' && x.label === 'board')).toBe(false);
    expect(starterSchedule(true).filter((x) => x.type === 'deadline' && x.doneWhen).map((x) => x.type === 'deadline' && x.doneWhen)).toEqual(['department_sheets_submitted', 'consultation_closed']);
  });
});
