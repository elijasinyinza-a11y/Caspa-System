/**
 * Setup rules (D7-2, D7-3, D7-4, D7-7, D7-14): checks on the draft structure, who answers for each unit, edit
 * guards, removal, and a generated structure of about 5,000 positions checked within a time limit.
 */
import type { ISODate } from '../contract/caspa-data-contract';
import { importRows, withHeader } from '../data/access/setup/import';
import { structureOfStore, type DraftPerson } from '../data/access/setup/draft';
import { createSampleOrgs } from '../data/sample/all';
import { SAMPLE_TEMPLATE_ROWS } from '../data/sample/new-org';
import { largeStructureRows } from '../data/sample/scale';
import { createSeed, FY } from '../data/sample/seed';
import {
  answersFor, flaggedUnits, indexStructure, mustCount, newMustProblems, positionRemovalBlockers, reportsToLoop, setupChecks,
  unitCounts, unitParentLoop, unitRemovalBlockers, type StructureInput,
} from './setup';
import { accountablePositionOfUnit } from './structure';

const NOW = '2026-10-18' as ISODate;
const admin = (): DraftPerson[] => [
  { id: 'p-is', fullName: 'Ireen Sakala', email: 'i.sakala@sample-new.example', roles: ['org_admin'], endsOn: null, existing: true },
  { id: 'p-cn', fullName: 'Chipo Ngoma', email: 'c.ngoma@sample-advisers.example', roles: ['org_admin'], endsOn: '2026-12-31' as ISODate, existing: true },
];
const ids = () => { let n = 0; return (p: string) => `${p}-${++n}`; };
const sample = () => importRows(withHeader(SAMPLE_TEMPLATE_ROWS), admin(), ids());
const kinds = (st: StructureInput) => {
  const c = setupChecks(st);
  return { must: Object.fromEntries(c.must.map((g) => [g.kind, g.items.length])), worth: Object.fromEntries(c.worth.map((g) => [g.kind, g.items.length])) };
};
const base = (): StructureInput => ({
  units: [{ id: 'u1', name: 'Top', unitType: 'Organisation', parentId: null }],
  positions: [{ id: 'a', unitId: 'u1', title: 'Head', ref: null, reportsToId: null, holder: { personId: 'x', acting: false } }],
  people: [{ id: 'x', fullName: 'X', email: 'x@example.test', roles: ['executive', 'org_admin'] }],
});

describe('who answers for each unit', () => {
  it.each(createSampleOrgs().map((o) => [o.store.organisation.name, o.store] as const))('matches the budget-holder rule in %s', (_n, s) => {
    const ix = indexStructure(structureOfStore(s, NOW));
    for (const u of s.units) expect(answersFor(ix, u.id)?.positionId ?? null, u.name).toBe(accountablePositionOfUnit(s, u.id));
  });
  it('a unit with no positions is answered for from the unit above, and says so', () => {
    const { structure } = sample();
    const ix = indexStructure(structure);
    const regions = structure.units.find((u) => u.name === 'Regions')!;
    const ops = structure.units.find((u) => u.name === 'Operations')!;
    const a = answersFor(ix, regions.id)!;
    expect(ix.position.get(a.positionId)!.title).toBe('Operations Manager');
    expect(a.fromUnitId).toBe(ops.id);
    expect(answersFor(ix, ops.id)!.fromUnitId).toBeNull();
  });
  it('counts positions, vacancies and people through every unit below', () => {
    const { structure } = sample();
    const ix = indexStructure(structure);
    const top = structure.units.find((u) => !u.parentId)!;
    expect(unitCounts(ix, top.id)).toEqual({ positions: 12, vacant: 2, people: 10 });
    expect(unitCounts(ix, structure.units.find((u) => u.name === 'Regions')!.id)).toEqual({ positions: 5, vacant: 1, people: 4 });
  });
});

describe('the sample template', () => {
  it('reads twelve rows into seven units, twelve positions and ten holders, merging the administrator by name and email', () => {
    const r = sample();
    expect(r.summary).toEqual({ rows: 12, units: 7, positions: 12, holders: 10 });
    const ireen = r.structure.people.filter((p) => p.fullName === 'Ireen Sakala');
    expect(ireen).toHaveLength(1);
    expect(ireen[0]!.id).toBe('p-is');
    expect(ireen[0]!.roles.sort()).toEqual(['hr', 'org_admin']);
  });
  it('accepts ›, > and / in unit paths', () => {
    const r = sample();
    expect(r.structure.units.filter((u) => u.name === 'North')).toHaveLength(1);
    expect(r.structure.units.find((u) => u.name === 'Regions')!.unitType).toBe('');
  });
  it('finds "Reports to" in the same unit, then the units above', () => {
    const { structure } = sample();
    const ix = indexStructure(structure);
    const fo = structure.positions.find((p) => p.ref === 'FO-N1')!;
    expect(ix.position.get(fo.reportsToId!)!.unitId).toBe(fo.unitId); // Regional Supervisor, North
    const north = structure.positions.find((p) => p.title === 'Regional Supervisor' && ix.unit.get(p.unitId)!.name === 'North')!;
    expect(ix.position.get(north.reportsToId!)!.title).toBe('Operations Manager');
  });
  it('lists two rows that need attention, by spreadsheet row number', () => {
    expect(sample().problems.map((p) => [p.kind, p.row])).toEqual([['roles_on_vacant', 5], ['reports_unmatched', 13]]);
  });
  it('must fix one shared email; worth checking: no line manager, an empty unit with no type, a holder with no email', () => {
    expect(kinds(sample().structure)).toEqual({
      must: { same_email: 1 },
      worth: { no_manager: 2, empty_unit: 1, no_unit_type: 1, no_email: 1 },
    });
  });
  it('ignores blank emails when looking for duplicates', () => {
    const st = base();
    st.people.push({ id: 'y', fullName: 'Y', email: null, roles: [] }, { id: 'z', fullName: 'Z', email: '  ', roles: [] });
    expect(kinds(st).must.same_email).toBeUndefined();
  });
});

describe('must fix before confirming', () => {
  it('finds a reporting loop once, naming every position in it', () => {
    const st = base();
    st.positions.push({ id: 'b', unitId: 'u1', title: 'B', ref: null, reportsToId: 'c', holder: null }, { id: 'c', unitId: 'u1', title: 'C', ref: null, reportsToId: 'b', holder: null });
    const loop = setupChecks(st).must.find((g) => g.kind === 'loop')!;
    expect(loop.items).toHaveLength(1);
    expect(loop.items[0]!.ids.sort()).toEqual(['b', 'c']);
  });
  it('finds broken trees and more than one top unit', () => {
    const st = base();
    st.units.push({ id: 'u2', name: 'Second', unitType: 'X', parentId: null }, { id: 'u3', name: 'Lost', unitType: 'X', parentId: 'gone' });
    st.positions.push({ id: 'q', unitId: 'nowhere', title: 'Q', ref: null, reportsToId: 'a', holder: null });
    expect(kinds(st).must).toEqual({ position_unit_missing: 1, unit_parent_missing: 1, top_units: 1 });
  });
  it('needs an Executive, and an administrator who holds a position (D7-7)', () => {
    const st = base();
    st.people[0]!.roles = [];
    st.people.push({ id: 'cons', fullName: 'Consultant', email: 'c@example.test', roles: ['org_admin'] });
    expect(kinds(st).must).toEqual({ no_executive: 1, no_staff_admin: 1 });
  });
  it('offers to merge an administrator with a holder of the same name', () => {
    const st = base();
    st.people[0]!.roles = ['executive'];
    st.people.push({ id: 'adm', fullName: ' x ', email: 'x2@example.test', roles: ['org_admin'] });
    const item = setupChecks(st).must.find((g) => g.kind === 'no_staff_admin')!.items[0]!;
    expect(item.merge).toEqual({ keepPersonId: 'adm', dropPersonId: 'x' });
  });
  it('keeps every unaccepted AI draft item as one must-fix item', () => {
    const st = base();
    st.units[0]!.draft = { state: 'ai_draft', provenance: { kind: 'manual' }, decided: null };
    st.positions[0]!.draft = { state: 'ai_draft', provenance: { kind: 'manual' }, decided: null };
    const g = setupChecks(st).must.find((x) => x.kind === 'ai_pending')!;
    expect(g.items).toHaveLength(1);
    expect(g.items[0]!.ids).toEqual(['u1', 'a']);
  });
  it('people holding two permanent positions are worth checking; acting ones are not', () => {
    const st = base();
    st.positions.push({ id: 'b', unitId: 'u1', title: 'B', ref: null, reportsToId: 'a', holder: { personId: 'x', acting: true } });
    expect(kinds(st).worth.two_permanent).toBeUndefined();
    st.positions[1]!.holder!.acting = false;
    expect(kinds(st).worth.two_permanent).toBe(1);
  });
});

describe('edit guards (D7-10)', () => {
  it('refuses a line manager that would loop back', () => {
    const st = base();
    st.positions.push({ id: 'b', unitId: 'u1', title: 'B', ref: null, reportsToId: 'a', holder: null }, { id: 'c', unitId: 'u1', title: 'C', ref: null, reportsToId: 'b', holder: null });
    const ix = indexStructure(st);
    expect(reportsToLoop(ix, 'a', 'c')).toEqual(['c', 'b']);
    expect(reportsToLoop(ix, 'a', 'a')).toEqual(['a']);
    expect(reportsToLoop(ix, 'c', 'a')).toBeNull();
    expect(unitParentLoop(ix, 'u1', 'u1')).toBe(true);
  });
  it('reports only problems a change adds, never existing ones', () => {
    const before = base();
    before.people.push({ id: 'y', fullName: 'Y', email: 'x@example.test', roles: [] }); // already a shared email
    const after = structuredClone(before);
    after.people[0]!.roles = ['org_admin'];
    expect(newMustProblems(before, after).map((i) => i.kind)).toEqual(['no_executive']);
    expect(newMustProblems(before, structuredClone(before))).toEqual([]);
  });
  it('flags the units on the way to every item, for the tree filter', () => {
    const { structure } = sample();
    const ix = indexStructure(structure);
    const flagged = flaggedUnits(ix, setupChecks(structure));
    expect([...flagged].map((u) => ix.unit.get(u)!.name)).toEqual(expect.arrayContaining(['Head office', 'Operations', 'Regions', 'North']));
  });
});

describe('removing after confirmation (D7-3, D7-4)', () => {
  const s = createSeed();
  it('a position that owns records lists each, with who can reassign it', () => {
    const b = positionRemovalBlockers(s, 'pos-hoo', FY, NOW);
    expect(b).toHaveLength(11);
    const act = b.find((x) => x.subject.code === 'A1.2.1.1')!;
    // Activity: objective owner (unless it is this position) and the Strategy office, from the matrix.
    expect(act.who.map((w) => w.title)).toEqual(['Strategy and Planning Manager']);
    const kpi = b.find((x) => x.subject.code === 'K1.2.1')!;
    expect(kpi.who.map((w) => [w.title, w.role])).toEqual([['Strategy and Planning Manager', 'strategy_office']]);
  });
  it('a position with a signed contract this year cannot be removed', () => {
    const b = positionRemovalBlockers(s, 'pos-mrb', FY, NOW);
    expect(b.map((x) => [x.reason, x.fixed])).toEqual([['signed_contract', true]]);
  });
  it('a position others report to lists them first', () => {
    expect(positionRemovalBlockers(s, 'pos-co', FY, NOW).filter((x) => x.reason === 'reports_to_it')).toHaveLength(4);
  });
  it('a unit holding lines in a draft budget can have them moved; in a submitted one it cannot', () => {
    const draft = unitRemovalBlockers(s, 'u-com', FY, NOW);
    expect(draft.filter((x) => x.reason === 'budget_line_draft')).toHaveLength(3);
    expect(draft.filter((x) => x.reason === 'child_unit')).toHaveLength(3);
    const t = createSeed();
    t.budgetVersions[0]!.status = 'submitted';
    expect(unitRemovalBlockers(t, 'u-com', FY, NOW).filter((x) => x.reason === 'budget_line_fixed' && x.fixed)).toHaveLength(3);
  });
  it('a unit with nothing in it can go', () => {
    const t = createSeed();
    t.units.push({ ...t.units[0]!, id: 'u-empty' as never, parentId: 'u-org' as never, name: 'Empty' });
    expect(unitRemovalBlockers(t, 'u-empty', FY, NOW)).toEqual([]);
  });
});

describe('a structure of about 5,000 positions (D7-14)', () => {
  it('imports and checks within the time limit, counting by kind', () => {
    const t0 = performance.now();
    const r = importRows(withHeader(largeStructureRows()), admin(), ids());
    const c = setupChecks(r.structure);
    const ix = indexStructure(r.structure);
    for (const u of r.structure.units) { answersFor(ix, u.id); unitCounts(ix, u.id); }
    flaggedUnits(ix, c);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(2000);
    expect(r.summary.positions).toBeGreaterThan(4900);
    expect(r.summary.positions).toBeLessThan(5100);
    expect(c.must.map((g) => [g.kind, g.items.length])).toEqual([['same_email', 3]]);
    expect(mustCount(c)).toBe(3);
    expect(c.worth.find((g) => g.kind === 'no_email')!.items.length).toBeGreaterThan(500);
    expect(r.problems.filter((p) => p.kind === 'reports_unmatched').length).toBeGreaterThan(0);
    // Only units holding a row whose "Reports to" matched nothing have nobody answering for them yet.
    const unmatched = new Set(r.problems.filter((p) => p.kind === 'reports_unmatched').map((p) => ix.position.get(p.positionId)!.unitId));
    expect(r.structure.units.filter((u) => answersFor(ix, u.id) === null).map((u) => u.id).sort()).toEqual([...unmatched].sort());
  });
  it('checks a change to it quickly enough to refuse or allow it while the person waits', () => {
    const { structure } = importRows(withHeader(largeStructureRows()), admin(), ids());
    const after = structuredClone(structure);
    after.positions[10]!.reportsToId = after.positions[11]!.id;
    const t0 = performance.now();
    newMustProblems(structure, after);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
