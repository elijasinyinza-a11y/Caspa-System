import type { ISODate } from '../contract/caspa-data-contract';
import { createMemoryRepository } from '../data/access/repository';
import { createSeed, DEV_ROLE_MEMBERSHIPS, ORG } from '../data/sample/seed';
import { formatMoney } from './format';
import { sortQueue, type NeedsYouItem } from './needs-you';

const NOW = '2026-10-18' as ISODate;
const repo = (role: keyof typeof DEV_ROLE_MEMBERSHIPS, s = createSeed(), now = NOW) => createMemoryRepository([s], ORG, DEV_ROLE_MEMBERSHIPS[role], now);
const queue = (role: keyof typeof DEV_ROLE_MEMBERSHIPS, s = createSeed()) => repo(role, s).home().needsYou.map((i) => [i.kind, i.title, i.due, i.daysOverdue]);

describe('role homes for Sample Water Utility at 18 October 2026', () => {
  it('each role gets its fixed home; the Executive also supervises, so has a team view', () => {
    expect(repo('executive').home().homes).toEqual(['executive', 'supervisor']);
    expect(repo('strategy').home().homes).toEqual(['strategy_office']);
    expect(repo('finance').home().homes).toEqual(['finance']);
    expect(repo('hr').home().homes).toEqual(['hr']);
    expect(repo('supervisor').home().homes).toEqual(['supervisor']);
    expect(repo('employee').home().homes).toEqual(['employee']);
  });

  it('Finance: submit the consolidated budget by 6 November, with the orphan line blocking it', () => {
    const items = repo('finance').home().needsYou;
    expect(items.map((i) => [i.title, i.due, i.detail])).toEqual([
      ['Submit the consolidated budget', '2026-11-06', '1 item must be fixed before this step.'],
    ]);
  });

  it('Executive: approval due 27 November, waiting for submission', () => {
    expect(queue('executive')).toEqual([['deadline', 'Approve the budget', '2026-11-27', -40]]);
  });

  it('Supervisor: the unissued Zone C contract is overdue; the review is due 15 January 2027', () => {
    expect(queue('supervisor')).toEqual([
      ['deadline', 'Issue the contract for Daniel Sakala, Meter Reader, Zone C', '2026-01-31', 260],
      ['deadline', 'Complete Mary Chileshe’s mid-year review', '2027-01-15', -89],
    ]);
  });

  it('Employee: the self-assessment has no due date, so it comes last', () => {
    expect(queue('employee')).toEqual([['deadline', 'Submit your self-assessment for the mid-year review', null, null]]);
  });

  it('linking the orphan line clears the blocker from the Finance item at once', () => {
    const s = createSeed();
    s.budgetLines.find((l) => l.id === 'bl-5')!.activityId = s.activities[0]!.id;
    expect(repo('finance', s).home().needsYou[0]!.detail).toBe('Nothing stops this step now.');
  });

  it('findings routed to a position appear in that person’s queue with the blocked step’s due date', () => {
    const s = createSeed();
    s.budgetLines.find((l) => l.id === 'bl-5')!.holderUnitId = 'u-zone-b' as never; // accountable: Meter Reader, Zone B
    const f = repo('employee', s).home().needsYou.find((i) => i.kind === 'finding')!;
    expect([f.severity, f.due]).toEqual(['blocking', '2026-11-06']);
  });

  it('a submitted budget becomes an approval for the Executive, never for whoever submitted it', () => {
    const s = createSeed();
    s.budgetVersions[0]!.status = 'submitted';
    s.gateEvents.push({
      id: 'ge-1' as never, orgId: ORG, gate: 'budget.submit_consolidated', subject: { type: 'BudgetVersion', id: 'bv-2026-1' },
      attempted: { at: '2026-11-02T09:00:00Z' as never, byMembershipId: 'm-hof' as never }, outcome: 'passed', blockingFindingKeys: [], advisoryAtGate: [],
    });
    expect(repo('executive', s).home().needsYou.map((i) => [i.kind, i.detail])).toEqual([['approval', 'Submitted by Ruth Phiri. Whoever submits a step cannot approve it.']]);
    expect(repo('finance', s).home().needsYou).toEqual([]);
  });

  it('rating flags reach the next-level reviewer only', () => {
    const s = createSeed();
    const cm = createMemoryRepository([s], ORG, 'm-cm', NOW).home().needsYou;
    expect(cm.map((i) => [i.kind, i.severity, i.title])).toEqual([['finding', 'advisory', 'Mary Chileshe: “Replace 400 faulty meters on route” scores 1 on verified progress']]);
    for (const r of ['executive', 'finance', 'strategy', 'supervisor', 'employee', 'hr'] as const) {
      expect(repo(r, s).home().needsYou.some((i) => i.key.startsWith('rating:'))).toBe(false);
    }
  });

  it('goal health is computed from the cascade; G1 is behind at 18 October', () => {
    const g = repo('executive').home().goalHealth!;
    expect(g.map((x) => [x.ref.code, x.progress.status])).toEqual([['G1', 'behind'], ['G2', 'no_data'], ['G3', 'no_data'], ['G4', 'no_data']]);
    expect(g[0]!.progress.progress).toBeCloseTo(5 / 12, 10); // K1.2.1 at 42%; K1.1.1 has no reading
  });

  it('Finance totals come from the lines; others never get the finance view', () => {
    const f = repo('finance').home().finance!;
    expect([formatMoney(f.total!), formatMoney(f.unlinked.amount!), f.unlinked.lines]).toEqual(['ZMW 2,650,000', 'ZMW 180,000', 1]);
    expect(repo('employee').home().finance).toBeNull();
  });

  it('the team view shows every direct report; only the Zone B contract has a score', () => {
    const t = repo('supervisor').home().team!;
    expect(t.map((m) => [m.position, m.contract?.status ?? null, m.rating?.label ?? null])).toEqual([
      ['Billing Clerk', null, null],
      ['Meter Reader, Zone A', null, null],
      ['Meter Reader, Zone B', 'signed', 'Partly meets'],
      ['Meter Reader, Zone C', 'draft', null],
    ]);
  });

  it('the Executive’s team view carries no ratings, because the Executive is not anyone’s reviewer of record here', () => {
    expect(repo('executive').home().team!.every((m) => m.rating === null)).toBe(true);
  });

  it('the employee sees each contract objective with its line of sight and provisional score', () => {
    const [c] = repo('employee').home().contracts!;
    expect(c!.objectives.map((o) => [o.lineage.map((l) => l.code), o.rating?.score, o.rating?.label])).toEqual([
      [['G1', 'O1.2', 'K1.2.1', 'A1.2.1.3'], 1, 'Does not meet'],
      [['G1', 'O1.1', 'K1.1.1', 'A1.1.1.1'], 2, 'Partly meets'],
    ]);
    expect([c!.rating?.overall, c!.rating?.label, c!.rating?.provisional, c!.signedOn]).toEqual([1.5, 'Partly meets', true, '2026-02-02']);
  });

  it('HR sees contract coverage and the provisional score', () => {
    const hr = repo('hr').home().hr!;
    expect(hr.contracts).toEqual({ signed: 1, issued: 0, draft: 1, none: 10 });
    expect(hr.scored.map((x) => [x.person, x.rating.label, x.rating.flags])).toEqual([['Mary Chileshe', 'Partly meets', 1]]);
  });
});

describe('queue order', () => {
  const item = (key: string, due: string | null, kind: NeedsYouItem['kind'] = 'deadline'): NeedsYouItem => ({
    key, kind, title: key, detail: null, due: due as ISODate | null, daysOverdue: null, severity: null, as: null, link: null,
  });
  it('soonest first, most overdue first, undated last, ties by kind then title', () => {
    const sorted = sortQueue([item('c', null), item('b', '2026-11-01'), item('a', '2026-01-01'), item('d', '2026-11-01', 'approval'), item('e', null, 'finding')]);
    expect(sorted.map((i) => i.key)).toEqual(['a', 'd', 'b', 'c', 'e']);
  });
});
