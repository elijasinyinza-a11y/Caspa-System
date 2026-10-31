/** The budget gate end to end through the data-access layer (Build Brief, screen 5; BUILD-BRIEF section 19). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { createSampleOrgs } from '../sample/all';
import { createMemoryRepository, sampleClock } from './repository';

const NOW = '2026-10-18' as ISODate;
const setup = () => {
  const orgs = createSampleOrgs();
  const stores = orgs.map((o) => o.store);
  const util = orgs[0]!;
  const clock = sampleClock(NOW); // one clock for the session, as in the app
  const as = (role: keyof typeof util.devRoles) => createMemoryRepository(stores, util.orgId, util.devRoles[role], NOW, { clock });
  return { util, as };
};
const zmw = (n: number) => n * 100;
const G3_KEY = 'STRUCT-GOAL-NO-FUNDED-ACTIVITY:Goal:g3';

describe('budget gate on Sample Water Utility', () => {
  it('shows the consolidated budget by goal, with the orphan line apart', () => {
    const { as } = setup();
    const b = as('finance').budget().budget;
    expect(b.total?.amountMinor).toBe(zmw(2_650_000));
    expect(b.goals.map((g) => [g.ref.code, g.subtotal?.amountMinor])).toEqual([
      ['G1', zmw(1_500_000)], ['G2', zmw(850_000)], ['G3', 0], ['G4', zmw(120_000)],
    ]);
    expect(b.unlinked.lines.map((l) => l.description)).toEqual(['Vehicle hire, Zone C']);
    expect(b.unlinked.subtotal?.amountMinor).toBe(zmw(180_000));
  });

  it('records a blocked submission and keeps the budget in draft', () => {
    const { util, as } = setup();
    const r = as('finance').submitBudget();
    expect(r).toEqual({ ok: true, outcome: 'blocked', blocking: 1 });
    expect(util.store.budgetVersions[0]!.status).toBe('draft');
    const budgetEvents = util.store.gateEvents.filter((g) => g.gate.startsWith('budget.')); // the seeded cascade.publish comes first
    expect(budgetEvents).toHaveLength(1);
    expect(budgetEvents[0]!.blockingFindingKeys).toEqual(['STRUCT-BUDGETLINE-NO-ACTIVITY:BudgetLine:bl-5']);
    expect(as('finance').budget().history.map((h) => h.kind)).toEqual(['submit_blocked']);
  });

  it('links the line: the finding clears, the amount moves into the goal and the total stands', () => {
    const { util, as } = setup();
    const fin = as('finance');
    const options = fin.budgetLinkOptions('bl-5');
    expect(options[0]!.suggested).toBe(true); // owned within Commercial, the holder unit
    const target = options.find((o) => o.ref.code === 'A1.1.1.1')!;
    expect(fin.linkBudgetLine('bl-5', target.ref.id)).toEqual({ ok: true });
    const after = as('finance').budget();
    expect(after.budget.unlinked.lineCount).toBe(0);
    expect(after.budget.goals.find((g) => g.ref.code === 'G1')!.subtotal?.amountMinor).toBe(zmw(1_680_000));
    expect(after.budget.total?.amountMinor).toBe(zmw(2_650_000));
    expect(after.next!.blocking).toHaveLength(0);
    expect(util.store.auditEntries.map((a) => a.action)).toEqual(['confirm', 'update']); // the seeded structure confirmation (D7-9), then the link
    expect(as('finance').linkBudgetLine('bl-5', target.ref.id)).toEqual({ ok: false, error: 'already_linked' });
  });

  it('refuses a link to an activity outside the list, and a link by someone who may not draft the line', () => {
    const { as } = setup();
    expect(as('finance').linkBudgetLine('bl-5', 'nope')).toEqual({ ok: false, error: 'activity_not_found' });
    expect(as('strategy').linkBudgetLine('bl-5', 'a1.1.1.1')).toEqual({ ok: false, error: 'not_found' }); // cannot see the line
    expect(as('strategy').budgetLinkOptions('bl-5')).toEqual([]);
  });

  it('submits, records the acknowledged advisory, and moves the approval to the Executive', () => {
    const { util, as } = setup();
    const fin = as('finance');
    fin.linkBudgetLine('bl-5', fin.budgetLinkOptions('bl-5').find((o) => o.ref.code === 'A1.1.1.1')!.ref.id);
    expect(as('executive').acknowledge(G3_KEY, 'Sanitation is funded from the next budget')).toEqual({ ok: true });
    expect(as('finance').submitBudget()).toEqual({ ok: true, outcome: 'passed', blocking: 0 });
    const v = util.store.budgetVersions[0]!;
    expect(v.status).toBe('submitted');
    const event = util.store.gateEvents[util.store.gateEvents.length - 1]!;
    expect(event.advisoryAtGate).toEqual([{ findingKey: G3_KEY, acknowledgementId: 'ack-1' }]);

    const finPage = as('finance').budget();
    expect(finPage.ownSubmission).toBe(true);
    expect(finPage.can.approve).toBe(false);
    expect(as('finance').approveBudget(null, '')).toEqual({ ok: false, error: 'own_submission' });
    expect(as('finance').home().needsYou.some((i) => i.kind === 'approval')).toBe(false);
    expect(as('executive').home().needsYou.some((i) => i.kind === 'approval')).toBe(true);
    // Submitted budgets are read-only.
    expect(as('finance').submitBudget()).toEqual({ ok: false, error: 'not_draft' });
  });

  it('approval needs the board reference here, then freezes the budget', () => {
    const { util, as } = setup();
    const fin = as('finance');
    fin.linkBudgetLine('bl-5', fin.budgetLinkOptions('bl-5')[0]!.ref.id);
    as('finance').submitBudget();
    const exec = as('executive');
    expect(exec.approveBudget(null, '')).toEqual({ ok: false, error: 'board_reference_required' });
    expect(as('executive').approveBudget({ resolutionRef: 'BR/2026/14', date: '2026-11-20' as ISODate }, 'As tabled')).toEqual({ ok: true, outcome: 'passed', blocking: 0 });
    const v = util.store.budgetVersions[0]!;
    expect(v.status).toBe('approved');
    expect(v.boardApproval).toEqual({ resolutionRef: 'BR/2026/14', date: '2026-11-20' });
    expect(v.approval?.byMembershipId).toBe('m-md');
    const page = as('executive').budget();
    expect(page.next).toBeNull();
    expect(page.approved?.board?.resolutionRef).toBe('BR/2026/14');
    expect(page.history.map((h) => h.kind)).toEqual(['submitted', 'approved']);
    expect(as('executive').home().needsYou.some((i) => i.key.startsWith('approve:budget') || i.key.startsWith('gate:budget'))).toBe(false);
  });

  it('a return needs a reason, sends the budget back to draft and shows why', () => {
    const { util, as } = setup();
    const fin = as('finance');
    fin.linkBudgetLine('bl-5', fin.budgetLinkOptions('bl-5')[0]!.ref.id);
    as('finance').submitBudget();
    expect(as('executive').returnBudget(' ')).toEqual({ ok: false, error: 'reason_required' });
    expect(as('executive').returnBudget('Revisit the vehicle hire estimate')).toEqual({ ok: true });
    expect(util.store.budgetVersions[0]!.status).toBe('draft');
    const page = as('finance').budget();
    expect(page.returned?.reason).toBe('Revisit the vehicle hire estimate');
    expect(page.can.submit).toBe(true);
    expect(as('finance').submitBudget()).toMatchObject({ ok: true, outcome: 'passed' });
    expect(as('finance').budget().returned).toBeNull();
    expect(as('finance').budget().history.map((h) => h.kind)).toEqual(['submitted', 'returned', 'submitted']);
  });

  it('roles without the step cannot take it', () => {
    const { as } = setup();
    expect(as('strategy').submitBudget()).toEqual({ ok: false, error: 'not_allowed' });
    expect(as('executive').submitBudget()).toEqual({ ok: false, error: 'not_allowed' });
    expect(as('strategy').budget().can).toEqual({ submit: false, approve: false, return: false });
  });

  it('roles that cannot see a line see the blocks counted, never described', () => {
    const { as } = setup();
    const page = as('strategy').budget();
    expect(page.next!.blocking).toHaveLength(0);
    expect(page.next!.hiddenBlocking).toBe(1);
    expect(page.budget.total).toBeNull();
  });
});
