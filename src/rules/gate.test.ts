import type { Acknowledgement, BudgetVersion, GateEvent, ISODateTime } from '../contract/caspa-data-contract';
import { createSeed, FY } from '../data/sample/seed';
import { approveError, checkGate, gateRecord, returnError, submitError, submitterOf } from './gate';
import { computeFindings, RULES } from './integrity';

const findings = (s = createSeed()) => computeFindings(s, { financialYear: FY });
const at = (t: string) => t as ISODateTime;
const version = (s: ReturnType<typeof createSeed>) => s.budgetVersions[0]!;
const submitted = (s: ReturnType<typeof createSeed>, by: string): void => {
  s.gateEvents.push({
    id: 'ge-1', orgId: s.organisation.id, gate: 'budget.submit_consolidated', subject: { type: 'BudgetVersion', id: version(s).id },
    attempted: { at: at('2026-10-20T09:00:00Z'), byMembershipId: by }, outcome: 'passed', blockingFindingKeys: [], advisoryAtGate: [],
  } as unknown as GateEvent);
  (version(s) as BudgetVersion).status = 'submitted';
};

describe('budget gate (slice 5)', () => {
  it('is blocked by the orphan line and shows the unfunded goal as its only advisory', () => {
    const c = checkGate(findings(), 'budget.submit_consolidated');
    expect(c.passes).toBe(false);
    expect(c.blocking.map((f) => f.key)).toEqual(['STRUCT-BUDGETLINE-NO-ACTIVITY:BudgetLine:bl-5']);
    expect(c.advisory.map((f) => f.key)).toEqual(['STRUCT-GOAL-NO-FUNDED-ACTIVITY:Goal:g3']);
  });

  it('shows only the gate’s own advisory rules, never other open flags', () => {
    const all = findings().filter((f) => f.blocksAt.length === 0).map((f) => f.ruleId);
    expect(all).toContain(RULES.kpiNoOwner.id); // open, but not a budget matter
    expect(checkGate(findings(), 'budget.submit_consolidated').advisory.every((f) => f.ruleId === RULES.goalNoFundedActivity.id)).toBe(true);
  });

  it('passes once the line is linked to an activity', () => {
    const s = createSeed();
    s.budgetLines.find((l) => l.id === 'bl-5')!.activityId = s.activities.find((a) => a.code === 'A1.1.1.1')!.id;
    const c = checkGate(findings(s), 'budget.submit_consolidated');
    expect(c.passes).toBe(true);
    expect(gateRecord(s, c).outcome).toBe('passed');
  });

  it('records each advisory flag with its acknowledgement, or null; a lapsed acknowledgement counts as none', () => {
    const s = createSeed();
    const key = 'STRUCT-GOAL-NO-FUNDED-ACTIVITY:Goal:g3';
    expect(gateRecord(s, checkGate(findings(s), 'budget.submit_consolidated')).advisoryAtGate).toEqual([{ findingKey: key, acknowledgementId: null }]);
    const ack = { id: 'ack-1', orgId: s.organisation.id, findingKey: key, reason: 'Funded from next year', acknowledged: { at: at('2026-10-18T09:00:00Z'), byMembershipId: 'm-md' } } as unknown as Acknowledgement;
    s.acknowledgements.push(ack);
    expect(gateRecord(s, checkGate(findings(s), 'budget.submit_consolidated')).advisoryAtGate).toEqual([{ findingKey: key, acknowledgementId: 'ack-1' }]);
    s.goals.find((g) => g.id === 'g3')!.updated = { at: at('2026-10-19T09:00:00Z'), byMembershipId: 'm-spm' } as never;
    expect(gateRecord(s, checkGate(findings(s), 'budget.submit_consolidated')).advisoryAtGate[0]!.acknowledgementId).toBeNull();
  });

  it('a blocked attempt names its blocking findings', () => {
    const s = createSeed();
    const r = gateRecord(s, checkGate(findings(s), 'budget.submit_consolidated'));
    expect(r.outcome).toBe('blocked');
    expect(r.blockingFindingKeys).toEqual(['STRUCT-BUDGETLINE-NO-ACTIVITY:BudgetLine:bl-5']);
  });

  it('only a draft can be submitted', () => {
    const s = createSeed();
    expect(submitError(version(s))).toBeNull();
    submitted(s, 'm-hof');
    expect(submitError(version(s))).toBe('not_draft');
  });

  it('whoever submits cannot approve or return (B7)', () => {
    const s = createSeed();
    expect(approveError(s, version(s), 'm-md', { resolutionRef: 'R1', date: '2026-11-20' as never })).toBe('not_submitted');
    submitted(s, 'm-hof');
    expect(submitterOf(s, version(s).id)).toBe('m-hof');
    expect(approveError(s, version(s), 'm-hof', { resolutionRef: 'R1', date: '2026-11-20' as never })).toBe('own_submission');
    expect(returnError(s, version(s), 'm-hof', 'Too high')).toBe('own_submission');
  });

  it('requires a board reference only when the organisation requires board approval of the budget', () => {
    const s = createSeed();
    submitted(s, 'm-hof');
    expect(approveError(s, version(s), 'm-md', null)).toBe('board_reference_required');
    expect(approveError(s, version(s), 'm-md', { resolutionRef: '  ', date: '2026-11-20' as never })).toBe('board_reference_required');
    expect(approveError(s, version(s), 'm-md', { resolutionRef: 'BR/2026/14', date: 'not a date' as never })).toBe('board_reference_required');
    expect(approveError(s, version(s), 'm-md', { resolutionRef: 'BR/2026/14', date: '2026-11-20' as never })).toBeNull();
    s.organisation.settings.boardApprovalRequired.budget = false;
    expect(approveError(s, version(s), 'm-md', null)).toBeNull();
  });

  it('a return needs a reason', () => {
    const s = createSeed();
    submitted(s, 'm-hof');
    expect(returnError(s, version(s), 'm-md', '   ')).toBe('reason_required');
    expect(returnError(s, version(s), 'm-md', 'Revisit vehicle costs')).toBeNull();
  });
});
