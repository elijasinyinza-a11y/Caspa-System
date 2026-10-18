import type { BudgetLine, ISODate, OrgUnit, Position } from '../contract/caspa-data-contract';
import { can } from '../data/access/permissions';
import { resolveViewer } from '../data/access/viewer';
import { createSeed } from '../data/sample/seed';
import type { Store } from '../data/access/store';
import { accountablePositionOfUnit, budgetHolderPositions } from './structure';

const NOW = '2026-10-18' as ISODate;
const sees = (s: Store, personKey: string, lineId: string) => can(s, resolveViewer(s, `m-${personKey}`, NOW, 2026), 'view', { type: 'BudgetLine', id: lineId });
const holders = (s: Store, lineId: string) => [...budgetHolderPositions(s, s.budgetLines.find((l) => l.id === lineId)!)].sort();

/** Adds a position, its person, assignment and membership to a store (test helper). */
function addPerson(s: Store, key: string, unitId: string, reportsTo: string | null, kind: 'substantive' | 'acting' = 'substantive', positionId = `pos-${key}`) {
  const base = s.positions[0]!;
  if (!s.positions.some((p) => p.id === positionId)) {
    s.positions.push({ ...base, id: positionId as Position['id'], unitId: unitId as OrgUnit['id'], title: key, reportsToPositionId: reportsTo as Position['id'] | null });
  }
  s.people.push({ id: `p-${key}` as never, fullName: key, email: `${key}@sample-water.example` });
  s.assignments.push({ ...s.assignments[0]!, id: `pa-${key}` as never, positionId: positionId as never, personId: `p-${key}` as never, kind, from: '2026-01-01' as ISODate, to: null });
  s.memberships.push({ ...s.memberships[0]!, id: `m-${key}` as never, personId: `p-${key}` as never, roles: [] });
}
const addUnit = (s: Store, id: string, parentId: string | null) => s.units.push({ ...s.units[0]!, id: id as OrgUnit['id'], parentId: parentId as OrgUnit['id'] | null, name: id, unitType: 'Unit' });
const addLine = (s: Store, id: string, unitId: string, activityId: string | null = null) =>
  s.budgetLines.push({ ...s.budgetLines[0]!, id: id as BudgetLine['id'], holderUnitId: unitId as OrgUnit['id'], activityId: activityId as BudgetLine['activityId'] });

describe('budget holders (contract v1.2) on the sample', () => {
  it('gives the meter-replacement lines to the Head of Commercial, the activity owner and the line above', () => {
    expect(holders(createSeed(), 'bl-1')).toEqual(['pos-cm', 'pos-hoc', 'pos-md']);
  });

  it('shows amounts to the Head of Commercial and Commercial Manager, "Funded" to the rest of Commercial', () => {
    const s = createSeed();
    expect(sees(s, 'hoc', 'bl-1')).toBe(true);
    expect(sees(s, 'cm', 'bl-1')).toBe(true);
    expect(sees(s, 'co', 'bl-1')).toBe(false); // Supervisor role
    expect(sees(s, 'bc', 'bl-1')).toBe(false);
    expect(sees(s, 'mrb', 'bl-1')).toBe(false);
  });

  it('keeps departments apart: Operations lines are not visible in Commercial', () => {
    const s = createSeed();
    expect(sees(s, 'hoo', 'bl-3')).toBe(true);
    expect(sees(s, 'hoc', 'bl-3')).toBe(false);
  });

  it('gives an orphan line to its unit\'s accountable position and the line above only', () => {
    expect(holders(createSeed(), 'bl-5')).toEqual(['pos-hoc', 'pos-md']);
  });
});

describe('budget holders across structures', () => {
  it('flat: everyone reports to the head; only the head holds a unit-level line', () => {
    const s = createSeed();
    addUnit(s, 'u-flat', 'u-org');
    addPerson(s, 'lead', 'u-flat', 'pos-md');
    ['s1', 's2', 's3'].forEach((k) => addPerson(s, k, 'u-flat', 'pos-lead'));
    addLine(s, 'bl-flat', 'u-flat');
    expect(accountablePositionOfUnit(s, 'u-flat')).toBe('pos-lead');
    expect(sees(s, 'lead', 'bl-flat')).toBe(true);
    expect(sees(s, 's1', 'bl-flat')).toBe(false);
  });

  it('deep: region › district › zone; a zone line is visible to its lead and every level above', () => {
    const s = createSeed();
    addUnit(s, 'u-region', 'u-org');
    addUnit(s, 'u-district', 'u-region');
    addUnit(s, 'u-zone-x', 'u-district');
    addPerson(s, 'rm', 'u-region', 'pos-md');
    addPerson(s, 'dm', 'u-district', 'pos-rm');
    addPerson(s, 'zs', 'u-zone-x', 'pos-dm');
    addPerson(s, 'zw', 'u-zone-x', 'pos-zs');
    addLine(s, 'bl-zone', 'u-zone-x');
    expect(holders(s, 'bl-zone')).toEqual(['pos-dm', 'pos-md', 'pos-rm', 'pos-zs']);
    expect(sees(s, 'zw', 'bl-zone')).toBe(false);
  });

  it('staff reporting outside their unit: the outside manager is accountable, not every member', () => {
    const s = createSeed();
    // Zone B gains two more readers, all reporting to the Commercial Officer in the parent unit.
    addPerson(s, 'mrb2', 'u-zone-b', 'pos-co');
    addPerson(s, 'mrb3', 'u-zone-b', 'pos-co');
    addLine(s, 'bl-zb', 'u-zone-b');
    expect(accountablePositionOfUnit(s, 'u-zone-b')).toBe('pos-co');
    expect(sees(s, 'co', 'bl-zb')).toBe(true);
    expect(sees(s, 'mrb', 'bl-zb')).toBe(false);
    expect(sees(s, 'mrb2', 'bl-zb')).toBe(false);
  });

  it('a one-position unit: its only position is accountable', () => {
    expect(accountablePositionOfUnit(createSeed(), 'u-zone-c')).toBe('pos-mrc');
  });

  it('a unit with no positions uses its parent unit\'s accountable position', () => {
    const s = createSeed();
    addUnit(s, 'u-empty', 'u-com');
    expect(accountablePositionOfUnit(s, 'u-empty')).toBe('pos-hoc');
  });

  it('acting appointment: the acting holder inherits access from the position', () => {
    const s = createSeed();
    addPerson(s, 'acting-hoc', 'u-com', 'pos-md', 'acting', 'pos-hoc');
    expect(sees(s, 'acting-hoc', 'bl-1')).toBe(true);
  });

  it('vacant head: the managers above still see the line', () => {
    const s = createSeed();
    s.assignments = s.assignments.filter((a) => a.positionId !== 'pos-hoc');
    expect(holders(s, 'bl-5')).toEqual(['pos-hoc', 'pos-md']);
    expect(sees(s, 'md', 'bl-5')).toBe(true);
  });

  it('cross-unit work: the funded activity\'s owner sees the line though another unit holds it', () => {
    const s = createSeed();
    addLine(s, 'bl-x', 'u-com', 'a2.1.1.1'); // Operations activity, Commercial-held line
    expect(sees(s, 'hoo', 'bl-x')).toBe(true);
    expect(sees(s, 'hoc', 'bl-x')).toBe(true);
  });
});
