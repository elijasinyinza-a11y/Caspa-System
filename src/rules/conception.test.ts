/** Part 11b rules: Table 2 cells, departments (F-2), department checklist and the vision.confirm checks. Pure. */
import { describe, expect, it } from 'vitest';
import { createSampleOrgs } from '../data/sample/all';
import { firstSentence } from '../ai';
import {
  canSubmitDepartment, cardOwnerPositions, CELLS, cellKey, cellOfKey, departments, departmentState, entriesOf, filledCells, headsADepartment, visionChecks, visionMustKey,
} from './conception';

const swu = () => createSampleOrgs().find((o) => o.orgId === 'org-sample-water')!.store;
const PLAN = 'plan-2027';

describe('the 4Q record sheet (Table 2)', () => {
  it('has twelve sections: three bands of four, in reading order', () => {
    expect(CELLS).toHaveLength(12);
    expect(CELLS.map((c) => c.band)).toEqual([...Array(4).fill('retraction'), ...Array(4).fill('repositioning'), ...Array(4).fill('projection')]);
    expect(new Set(CELLS.map(cellKey)).size).toBe(12);
    for (const c of CELLS) expect(cellOfKey(cellKey(c))).toEqual(c);
    expect(cellOfKey('nowhere.at_all')).toBeNull();
  });
});

describe('departments (F-2)', () => {
  it('are the units directly below the top unit, with the position that answers for each, vacant or not', () => {
    expect(departments(swu()).map((d) => [d.name, d.headPositionId])).toEqual([['Finance', 'pos-hof'], ['Operations', 'pos-hoo'], ['Commercial', 'pos-hoc']]);
  });
  it('a card belongs to the heads of the departments that raised it', () => {
    const s = swu();
    const r4 = s.fourQEntries.find((e) => e.id === 'q-2027-r4')!;
    expect(cardOwnerPositions(s, r4)).toEqual(['pos-hof']);
    expect(cardOwnerPositions(s, { ...r4, raisedByUnitIds: [] })).toEqual([]);
  });
  it('heading a department counts only while a plan is being formed', () => {
    const s = swu();
    expect(headsADepartment(s, ['pos-hoo'])).toBe(true);
    expect(headsADepartment(s, ['pos-mrb'])).toBe(false);
    s.plans = s.plans.filter((p) => p.id !== PLAN);
    expect(headsADepartment(s, ['pos-hoo'])).toBe(false);
  });
});

describe('a department’s checklist', () => {
  it('counts drafts to check and accepted cards, and allows sending only when every draft is checked', () => {
    const s = swu();
    const fin = departmentState(s, PLAN, 'u-fin');
    expect(fin).toMatchObject({ toCheck: 3, waiting: 0, consolidated: 0, interviewed: false, submitted: false });
    expect(canSubmitDepartment(fin)).toBe(false);
    for (const e of entriesOf(s, PLAN).filter((x) => x.raisedByUnitIds.includes('u-fin' as never))) e.draft = { ...e.draft, state: 'accepted' };
    const after = departmentState(s, PLAN, 'u-fin');
    expect(after).toMatchObject({ toCheck: 0, waiting: 3 });
    expect(canSubmitDepartment(after)).toBe(true);
    expect(canSubmitDepartment({ ...after, waiting: 0 })).toBe(false); // nothing to send
  });
});

describe('vision.confirm checks', () => {
  it('department sheets do not count: only accepted cards on the organisation sheet fill a section', () => {
    const s = swu();
    expect(filledCells(s, PLAN)).toHaveLength(0);
    const checks = visionChecks(s, s.plans.find((p) => p.id === PLAN)!);
    expect(checks.filter((c) => c.kind === 'cell_empty')).toHaveLength(12);
    expect(checks.some((c) => c.kind === 'no_vision')).toBe(true);
  });
  it('an AI draft on the organisation sheet does not fill a section until a person accepts it', () => {
    const s = swu();
    const e = s.fourQEntries.find((x) => x.id === 'q-2027-r1')!;
    e.scope = 'organisation';
    expect(filledCells(s, PLAN)).toHaveLength(0);
    e.draft = { ...e.draft, state: 'accepted' };
    expect(filledCells(s, PLAN).map(cellKey)).toEqual(['retraction.successes']);
    e.mergedIntoId = 'q-2027-r2' as never; // a merged card counts through the card it joined, not itself
    expect(filledCells(s, PLAN)).toHaveLength(0);
  });
  it('applies only to a plan being formed; keys are stable', () => {
    const s = swu();
    expect(visionChecks(s, s.plans.find((p) => p.id === 'plan-2022')!)).toEqual([{ kind: 'not_formed' }]);
    expect(visionMustKey(PLAN, { kind: 'cell_empty', cell: CELLS[2]! })).toBe('FORM-4Q-CELL-EMPTY:StrategicPlan:plan-2027:retraction.failures');
    expect(visionMustKey(PLAN, { kind: 'no_vision' })).toBe('FORM-NO-VISION:StrategicPlan:plan-2027');
  });
});

describe('the AI stub’s interview draft', () => {
  it('keeps the first sentence of an answer and shortens long ones at a word', () => {
    expect(firstSentence('Billing disputes have gone up. We need more staff.')).toBe('Billing disputes have gone up');
    const long = firstSentence(`${'word '.repeat(40)}end.`);
    expect(long.length).toBeLessThanOrEqual(118);
    expect(long.endsWith('…')).toBe(true);
  });
});
