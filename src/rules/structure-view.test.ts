/** Who sees which part of the structure (contract v1.5): the organisation's own setting, with the own-line floor. */
import type { AssignedRole, ISODate } from '../contract/caspa-data-contract';
import { importRows, withHeader } from '../data/access/setup/import';
import { structureOfStore } from '../data/access/setup/draft';
import { createSampleOrgs } from '../data/sample/all';
import { largeStructureRows } from '../data/sample/scale';
import { createSeed } from '../data/sample/seed';
import { DEFAULT_STRUCTURE_VIEW, scopedStructure, structureScope, type StructureViewSetting } from './structure-view';

const NOW = '2026-10-18' as ISODate;
const st = () => structureOfStore(createSeed(), NOW);
const as = (positionIds: string[], roles: AssignedRole[] = []) => ({ personId: 'x', roles, positionIds });
const setting = (others: StructureViewSetting['others'], fullViewRoles: AssignedRole[] = ['executive', 'strategy_office', 'hr']): StructureViewSetting => ({ fullViewRoles, others });
const part = (positionIds: string[], others: StructureViewSetting['others'], roles: AssignedRole[] = []) => {
  const scope = structureScope(st(), as(positionIds, roles), setting(others));
  return scope.whole ? 'whole' : { units: [...scope.units].sort(), positions: [...scope.positions].sort() };
};

describe('the default', () => {
  it('lets every member of every sample organisation see the whole structure, as before v1.5', () => {
    for (const org of createSampleOrgs()) {
      const s = org.store;
      expect(s.organisation.settings.structureView).toEqual(DEFAULT_STRUCTURE_VIEW);
      const structure = structureOfStore(s, NOW);
      for (const p of s.people) expect(structureScope(structure, { personId: p.id, roles: [] }, s.organisation.settings.structureView).whole).toBe(true);
    }
  });
});

describe('their own line only', () => {
  it('a meter reader sees their unit and the managers above them, up to the top', () => {
    expect(part(['pos-mrb'], 'own_line')).toEqual({
      units: ['u-com', 'u-org', 'u-zone-b'],
      positions: ['pos-cm', 'pos-co', 'pos-hoc', 'pos-md', 'pos-mrb'],
    });
  });
  it('a supervisor sees their colleagues in the unit, but not the units below them', () => {
    const p = part(['pos-co'], 'own_line');
    expect(p).toEqual({ units: ['u-com', 'u-org'], positions: ['pos-bc', 'pos-cm', 'pos-co', 'pos-hoc', 'pos-md'] });
  });
  it('a person with no position sees nothing', () => {
    expect(part([], 'own_line')).toEqual({ units: [], positions: [] });
  });
});

describe('the units they answer for, and everything below', () => {
  it('the Head of Commercial sees all of Commercial and its zones, plus their own line', () => {
    const p = part(['pos-hoc'], 'answers_for');
    expect(p).toEqual({
      units: ['u-com', 'u-org', 'u-zone-a', 'u-zone-b', 'u-zone-c'],
      positions: ['pos-bc', 'pos-cm', 'pos-co', 'pos-hoc', 'pos-md', 'pos-mra', 'pos-mrb', 'pos-mrc'],
    });
  });
  it('someone who answers for no unit sees only their own line', () => {
    expect(part(['pos-co'], 'answers_for')).toEqual(part(['pos-co'], 'own_line'));
  });
  it('the Managing Director answers for the top unit, so sees everything', () => {
    const p = part(['pos-md'], 'answers_for');
    expect(p !== 'whole' && p.positions.length).toBe(st().positions.length);
  });
});

describe('who always sees the whole structure', () => {
  it('the administrator, whatever the setting', () => {
    expect(part(['pos-mrb'], 'own_line', ['org_admin'])).toBe('whole');
  });
  it('the roles the organisation ticks, and no others', () => {
    expect(part(['pos-hof'], 'own_line', ['finance'])).not.toBe('whole');
    expect(structureScope(st(), as(['pos-hof'], ['finance']), setting('own_line', ['finance'])).whole).toBe(true);
  });
});

describe('the limited structure', () => {
  it('keeps only holders of the positions shown', () => {
    const s = st();
    const scoped = scopedStructure(s, structureScope(s, as(['pos-mrb']), setting('own_line')));
    expect(scoped.people.map((p) => p.id).sort()).toEqual(['p-cm', 'p-co', 'p-hoc', 'p-md', 'p-mrb']);
  });
  it('is worked out for 200 people in a structure of about 5,000 positions within the time limit', () => {
    let n = 0;
    const { structure } = importRows(withHeader(largeStructureRows()), [], (p) => `${p}-${++n}`);
    const holders = structure.positions.filter((p) => p.holder).slice(0, 200);
    const t0 = performance.now();
    for (const p of holders) {
      for (const level of ['answers_for', 'own_line'] as const) {
        const scope = structureScope(structure, { personId: p.holder!.personId, roles: [] }, setting(level));
        expect(scope.whole).toBe(false);
      }
    }
    expect(performance.now() - t0).toBeLessThan(2000);
    const officer = holders.find((p) => p.title === 'Field Officer')!;
    const scope = structureScope(structure, { personId: officer.holder!.personId, roles: [] }, setting('own_line'));
    expect(!scope.whole && scope.positions.size).toBeLessThan(70); // their district, their supervisor's line: not 5,000
  });
});
