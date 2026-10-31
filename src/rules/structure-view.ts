/**
 * Who sees which part of the organisation structure (contract v1.5, decided by Elijah on 30 October 2026).
 * Pure: a structure, a person and the organisation's setting in; the part they may see out.
 *
 * The administrator always sees all of it; so do the roles the organisation ticks. Everyone else sees the whole
 * structure, the units they answer for and everything below plus their own line, or their own line only. Their own
 * line is a floor no setting removes: the units of the positions they hold, everyone in those units, and every
 * position above theirs in the reporting line with its unit. Units on the way to the top are kept, so the tree can
 * be followed, but carry only the positions the person may see.
 */
import type { AssignedRole, Organisation } from '../contract/caspa-data-contract';
import { answersFor, childUnits, indexStructure, managersInStructure, positionsIn, type StructureInput } from './setup';

export type StructureViewSetting = Organisation['settings']['structureView'];
export type StructureLevel = StructureViewSetting['others'];

/** The default (v1.5): every assigned role sees the whole structure, and so does everyone else. */
export const DEFAULT_STRUCTURE_VIEW: StructureViewSetting = {
  fullViewRoles: ['executive', 'strategy_office', 'finance', 'hr', 'facilitator', 'compliance'],
  others: 'whole',
};

export type StructureScope = { whole: true } | { whole: false; units: Set<string>; positions: Set<string> };

export function structureScope(
  st: StructureInput, person: { personId: string; roles: AssignedRole[]; /** Positions held, when known already; else read from holders. */ positionIds?: string[] },
  setting: StructureViewSetting,
): StructureScope {
  if (person.roles.includes('org_admin') || person.roles.some((r) => setting.fullViewRoles.includes(r)) || setting.others === 'whole') return { whole: true };
  const ix = indexStructure(st);
  const held = person.positionIds
    ? person.positionIds.flatMap((id) => (ix.position.has(id) ? [ix.position.get(id)!] : []))
    : ix.positionsOfHolder.get(person.personId) ?? [];
  const units = new Set<string>();
  const positions = new Set<string>();
  const addUnitWithAncestors = (unitId: string) => {
    let u = ix.unit.get(unitId);
    while (u && !units.has(u.id)) {
      units.add(u.id);
      u = u.parentId ? ix.unit.get(u.parentId) : undefined;
    }
  };
  // The floor: their own line.
  for (const p of held) {
    addUnitWithAncestors(p.unitId);
    for (const c of positionsIn(ix, p.unitId)) positions.add(c.id);
    for (const m of managersInStructure(ix, p.id)) {
      positions.add(m);
      addUnitWithAncestors(ix.position.get(m)!.unitId);
    }
  }
  // The units they answer for, and everything below.
  if (setting.others === 'answers_for') {
    const heldIds = new Set(held.map((p) => p.id));
    const full = new Set<string>();
    for (const u of st.units) {
      const a = answersFor(ix, u.id);
      if (!a || !heldIds.has(a.positionId) || a.fromUnitId) continue;
      const stack = [u.id];
      while (stack.length) {
        const id = stack.pop()!;
        if (full.has(id)) continue;
        full.add(id);
        addUnitWithAncestors(id);
        for (const x of positionsIn(ix, id)) positions.add(x.id);
        for (const c of childUnits(ix, id)) stack.push(c.id);
      }
    }
  }
  return { whole: false, units, positions };
}

/** The structure limited to a scope. People are the holders of the positions left in it. */
export function scopedStructure(st: StructureInput, scope: StructureScope): StructureInput {
  if (scope.whole) return st;
  const positions = st.positions.filter((p) => scope.positions.has(p.id));
  const holders = new Set(positions.flatMap((p) => (p.holder ? [p.holder.personId] : [])));
  return {
    units: st.units.filter((u) => scope.units.has(u.id)),
    positions,
    people: st.people.filter((p) => holders.has(p.id)),
  };
}
