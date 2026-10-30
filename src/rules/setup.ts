/**
 * Organisation setup rules (Organisation Setup Specification v0.3, D7-2, D7-3, D7-4, D7-7, D7-14).
 *
 * A pure rule set, separate from the integrity rules: it runs on a structure (the draft structure before
 * confirmation, or the stored records after it) and never on findings. No React, no I/O, no clock. Every lookup
 * goes through an index by ID, so a structure of thousands of positions is checked in milliseconds.
 */
import { PERMISSIONS, type AssignedRole, type DraftMeta, type Principal } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { currentBudgetVersion } from './structure';

/* ───────── The shape the rules read ───────── */

export interface StructureUnit { id: string; name: string; unitType: string; parentId: string | null; draft?: DraftMeta }
export interface StructurePosition {
  id: string; unitId: string; title: string;
  /** The organisation's own reference, such as a post number; needed only where titles repeat in one unit. */
  ref: string | null;
  reportsToId: string | null;
  holder: { personId: string; acting: boolean } | null;
  draft?: DraftMeta;
}
export interface StructurePerson { id: string; fullName: string; email: string | null; roles: AssignedRole[] }
export interface StructureInput { units: StructureUnit[]; positions: StructurePosition[]; people: StructurePerson[] }

export interface StructureIndex {
  st: StructureInput;
  unit: Map<string, StructureUnit>;
  position: Map<string, StructurePosition>;
  person: Map<string, StructurePerson>;
  children: Map<string | null, StructureUnit[]>;
  positionsOfUnit: Map<string, StructurePosition[]>;
  positionsOfHolder: Map<string, StructurePosition[]>;
  reportsTo: Map<string, StructurePosition[]>;
  memo: { accountable: Map<string, string | null>; counts: Map<string, UnitCounts> };
}

const cache = new WeakMap<StructureInput, StructureIndex>();
const group = <T, K>(xs: T[], key: (x: T) => K | undefined): Map<K, T[]> => {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (k === undefined) continue;
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
};

/** Index a structure by ID. Cached per structure object: callers pass a new object after every change. */
export function indexStructure(st: StructureInput): StructureIndex {
  const hit = cache.get(st);
  if (hit) return hit;
  const ix: StructureIndex = {
    st,
    unit: new Map(st.units.map((u) => [u.id, u])),
    position: new Map(st.positions.map((p) => [p.id, p])),
    person: new Map(st.people.map((p) => [p.id, p])),
    children: group(st.units, (u) => u.parentId),
    positionsOfUnit: group(st.positions, (p) => p.unitId),
    positionsOfHolder: group(st.positions, (p) => p.holder?.personId),
    reportsTo: group(st.positions, (p) => p.reportsToId ?? undefined),
    memo: { accountable: new Map(), counts: new Map() },
  };
  cache.set(st, ix);
  return ix;
}

/** Units at the top: no parent, or a parent that does not exist. */
export const topUnits = (ix: StructureIndex) => ix.st.units.filter((u) => !u.parentId || !ix.unit.has(u.parentId));
export const childUnits = (ix: StructureIndex, unitId: string) => ix.children.get(unitId) ?? [];
export const positionsIn = (ix: StructureIndex, unitId: string) => ix.positionsOfUnit.get(unitId) ?? [];

/** Unit names from the top down to the unit. Guards against loops. */
export function unitPath(ix: StructureIndex, unitId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let u = ix.unit.get(unitId);
  while (u && !seen.has(u.id)) {
    out.unshift(u.name);
    seen.add(u.id);
    u = u.parentId ? ix.unit.get(u.parentId) : undefined;
  }
  return out;
}

/** Positions above a position in its single reporting line, nearest first, stopping at a loop. */
export function managersInStructure(ix: StructureIndex, positionId: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([positionId]);
  let next = ix.position.get(positionId)?.reportsToId ?? null;
  while (next && !seen.has(next) && ix.position.has(next)) {
    chain.push(next);
    seen.add(next);
    next = ix.position.get(next)?.reportsToId ?? null;
  }
  return chain;
}

/**
 * Who answers for a unit (contract v1.2, the same derivation as accountablePositionOfUnit in structure.ts):
 * the single position in the unit all others report up to; else the lowest common manager of its top positions;
 * a unit with no positions uses its parent's. `fromUnitId` names the unit it was taken from when inherited.
 */
export function answersFor(ix: StructureIndex, unitId: string): { positionId: string; fromUnitId: string | null } | null {
  const own = accountable(ix, unitId, 0);
  if (!own) return null;
  const holderUnit = ix.position.get(own)?.unitId ?? null;
  return { positionId: own, fromUnitId: holderUnit !== unitId && positionsIn(ix, unitId).length === 0 ? sourceUnit(ix, unitId) : null };
}
function sourceUnit(ix: StructureIndex, unitId: string): string | null {
  let u = ix.unit.get(unitId);
  const seen = new Set<string>();
  while (u && !seen.has(u.id)) {
    if (positionsIn(ix, u.id).length > 0) return u.id;
    seen.add(u.id);
    u = u.parentId ? ix.unit.get(u.parentId) : undefined;
  }
  return null;
}
function accountable(ix: StructureIndex, unitId: string, depth: number): string | null {
  const memo = ix.memo.accountable;
  if (memo.has(unitId)) return memo.get(unitId)!;
  if (depth > ix.st.units.length) return null;
  const inUnit = positionsIn(ix, unitId);
  let out: string | null = null;
  if (inUnit.length === 0) {
    const parent = ix.unit.get(unitId)?.parentId;
    out = parent ? accountable(ix, parent, depth + 1) : null;
  } else {
    const ids = new Set(inUnit.map((p) => p.id));
    const tops = inUnit.filter((p) => !p.reportsToId || !ids.has(p.reportsToId)).map((p) => p.id);
    if (tops.length === 1) out = tops[0]!;
    else {
      const [first, ...rest] = tops.map((t) => managersInStructure(ix, t));
      const sets = rest.map((c) => new Set(c));
      out = first?.find((m) => sets.every((s) => s.has(m))) ?? null;
    }
  }
  memo.set(unitId, out);
  return out;
}

export interface UnitCounts { positions: number; vacant: number; people: number }
/** Positions, vacancies and people in a unit and every unit below it (D7-14). */
export function unitCounts(ix: StructureIndex, unitId: string): UnitCounts {
  const hit = ix.memo.counts.get(unitId);
  if (hit) return hit;
  const people = new Set<string>();
  let positions = 0;
  let vacant = 0;
  const stack: string[] = [unitId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const p of positionsIn(ix, id)) {
      positions += 1;
      if (p.holder) people.add(p.holder.personId);
      else vacant += 1;
    }
    for (const c of childUnits(ix, id)) stack.push(c.id);
  }
  const counts = { positions, vacant, people: people.size };
  ix.memo.counts.set(unitId, counts);
  return counts;
}

/* ───────── Checks (D7-2) ───────── */

export type MustKind = 'ai_pending' | 'loop' | 'position_unit_missing' | 'unit_parent_missing' | 'top_units' | 'same_email' | 'no_executive' | 'no_staff_admin';
export type WorthKind = 'no_manager' | 'empty_unit' | 'no_unit_type' | 'two_permanent' | 'no_email';
export type SetupCheckKind = MustKind | WorthKind;

/** Must-fix kinds in the order they are shown; worth-checking kinds likewise. */
export const MUST_KINDS: MustKind[] = ['ai_pending', 'loop', 'position_unit_missing', 'unit_parent_missing', 'top_units', 'same_email', 'no_executive', 'no_staff_admin'];
export const WORTH_KINDS: WorthKind[] = ['no_manager', 'empty_unit', 'no_unit_type', 'two_permanent', 'no_email'];

export interface SetupItem {
  kind: SetupCheckKind;
  /** What the item is about. For a loop, the first position met; for an email, the first person. */
  subject: { type: 'unit' | 'position' | 'person' | 'organisation'; id: string };
  /** Every record involved, e.g. the positions in a loop or the people sharing an email. */
  ids: string[];
  /** The unit it concerns, for the tree filter; null when it concerns the whole organisation. */
  unitId: string | null;
  /** For "No administrator holds a position here": an administrator with no position whose name matches a holder's. */
  merge?: { keepPersonId: string; dropPersonId: string };
  /** For "Units with no positions": who answers for the unit, from the unit above. */
  answeredBy?: { positionId: string; fromUnitId: string | null } | null;
}
export interface SetupGroup { level: 'must' | 'worth'; kind: SetupCheckKind; items: SetupItem[] }
export interface SetupChecks { must: SetupGroup[]; worth: SetupGroup[] }

export const mustCount = (c: SetupChecks) => c.must.reduce((n, g) => n + g.items.length, 0);
/** A stable key per item, to compare checks before and after a change. */
export const itemKey = (i: SetupItem) => `${i.kind}:${[...i.ids].sort().join(',') || i.subject.id}`;

/** Positions caught in a reporting loop, each loop once (A reports to B, B reports to A). */
function loops(ix: StructureIndex): string[][] {
  const state = new Map<string, 1 | 2>(); // 1: on the current walk, 2: done
  const out: string[][] = [];
  for (const start of ix.st.positions) {
    if (state.has(start.id)) continue;
    const walk: string[] = [];
    let cur: string | null = start.id;
    while (cur && ix.position.has(cur) && !state.has(cur)) {
      state.set(cur, 1);
      walk.push(cur);
      cur = ix.position.get(cur)!.reportsToId;
    }
    if (cur && state.get(cur) === 1) out.push(walk.slice(walk.indexOf(cur)));
    walk.forEach((p) => state.set(p, 2));
  }
  return out;
}

/** Whether a person currently holds any position in the structure. */
export const holdsPosition = (ix: StructureIndex, personId: string) => (ix.positionsOfHolder.get(personId)?.length ?? 0) > 0;

export function setupChecks(st: StructureInput): SetupChecks {
  const ix = indexStructure(st);
  const must = new Map<SetupCheckKind, SetupItem[]>();
  const worth = new Map<SetupCheckKind, SetupItem[]>();
  const add = (m: Map<SetupCheckKind, SetupItem[]>, item: SetupItem) => {
    const list = m.get(item.kind);
    if (list) list.push(item);
    else m.set(item.kind, [item]);
  };
  const unitOfPerson = (pid: string) => ix.positionsOfHolder.get(pid)?.[0]?.unitId ?? null;

  // Every AI draft item is accepted or corrected by a person before confirming (prototype, 29 October 2026).
  const pending = [...st.units, ...st.positions].filter((x) => x.draft?.state === 'ai_draft');
  if (pending.length) add(must, { kind: 'ai_pending', subject: { type: 'organisation', id: '' }, ids: pending.map((x) => x.id), unitId: null });

  for (const loop of loops(ix)) add(must, { kind: 'loop', subject: { type: 'position', id: loop[0]! }, ids: loop, unitId: ix.position.get(loop[0]!)!.unitId });
  for (const p of st.positions) if (!ix.unit.has(p.unitId)) add(must, { kind: 'position_unit_missing', subject: { type: 'position', id: p.id }, ids: [p.id], unitId: null });
  for (const u of st.units) if (u.parentId && !ix.unit.has(u.parentId)) add(must, { kind: 'unit_parent_missing', subject: { type: 'unit', id: u.id }, ids: [u.id], unitId: u.id });
  const tops = st.units.filter((u) => !u.parentId);
  if (tops.length > 1) add(must, { kind: 'top_units', subject: { type: 'organisation', id: '' }, ids: tops.map((u) => u.id), unitId: null });

  const byEmail = group(st.people.filter((p) => (p.email ?? '').trim()), (p) => p.email!.trim().toLowerCase());
  for (const [, people] of byEmail) {
    if (people.length > 1) add(must, { kind: 'same_email', subject: { type: 'person', id: people[0]!.id }, ids: people.map((p) => p.id), unitId: unitOfPerson(people[0]!.id) });
  }
  if (!st.people.some((p) => p.roles.includes('executive'))) add(must, { kind: 'no_executive', subject: { type: 'organisation', id: '' }, ids: [], unitId: null });

  // D7-7: confirmation comes from an administrator who holds a position in the organisation.
  const admins = st.people.filter((p) => p.roles.includes('org_admin'));
  if (!admins.some((a) => holdsPosition(ix, a.id))) {
    const norm = (n: string) => n.trim().toLowerCase();
    const twin = admins
      .map((a) => ({ a, h: st.people.find((x) => x.id !== a.id && holdsPosition(ix, x.id) && norm(x.fullName) === norm(a.fullName)) }))
      .find((x) => x.h);
    add(must, {
      kind: 'no_staff_admin', subject: { type: 'organisation', id: '' }, ids: admins.map((a) => a.id), unitId: null,
      merge: twin ? { keepPersonId: twin.a.id, dropPersonId: twin.h!.id } : undefined,
    });
  }

  const noManager = st.positions.filter((p) => !p.reportsToId);
  if (noManager.length > 1) noManager.forEach((p) => add(worth, { kind: 'no_manager', subject: { type: 'position', id: p.id }, ids: [p.id], unitId: p.unitId }));
  for (const u of st.units) {
    if (positionsIn(ix, u.id).length === 0) add(worth, { kind: 'empty_unit', subject: { type: 'unit', id: u.id }, ids: [u.id], unitId: u.id, answeredBy: answersFor(ix, u.id) });
    if (!u.unitType.trim()) add(worth, { kind: 'no_unit_type', subject: { type: 'unit', id: u.id }, ids: [u.id], unitId: u.id });
  }
  for (const [personId, held] of ix.positionsOfHolder) {
    const permanent = held.filter((p) => !p.holder!.acting);
    if (permanent.length > 1) add(worth, { kind: 'two_permanent', subject: { type: 'person', id: personId }, ids: permanent.map((p) => p.id), unitId: permanent[0]!.unitId });
  }
  for (const p of st.people) {
    if (holdsPosition(ix, p.id) && !(p.email ?? '').trim()) add(worth, { kind: 'no_email', subject: { type: 'person', id: p.id }, ids: [p.id], unitId: unitOfPerson(p.id) });
  }

  const groups = (m: Map<SetupCheckKind, SetupItem[]>, order: SetupCheckKind[], level: 'must' | 'worth') =>
    order.filter((k) => m.has(k)).map((k) => ({ level, kind: k, items: m.get(k)! }));
  return { must: groups(must, MUST_KINDS, 'must'), worth: groups(worth, WORTH_KINDS, 'worth') };
}

/** Units on the way to every item, so the tree filter can keep only branches with something to fix or check. */
export function flaggedUnits(ix: StructureIndex, checks: SetupChecks): Set<string> {
  const out = new Set<string>();
  for (const g of [...checks.must, ...checks.worth]) {
    for (const item of g.items) {
      let u = item.unitId ? ix.unit.get(item.unitId) : undefined;
      while (u && !out.has(u.id)) {
        out.add(u.id);
        u = u.parentId ? ix.unit.get(u.parentId) : undefined;
      }
    }
  }
  return out;
}

/**
 * Must-fix problems a change would add (D7-10): after confirmation, a change that adds one is refused.
 * Compares the checks before and after; existing problems never block an unrelated change.
 */
export function newMustProblems(before: StructureInput, after: StructureInput): SetupItem[] {
  const had = new Set(setupChecks(before).must.flatMap((g) => g.items.map(itemKey)));
  return setupChecks(after).must.flatMap((g) => g.items.filter((i) => !had.has(itemKey(i))));
}

/** Whether setting a position's line manager would make it report to itself, directly or through others. */
export function reportsToLoop(ix: StructureIndex, positionId: string, managerId: string | null): string[] | null {
  if (!managerId) return null;
  if (managerId === positionId) return [positionId];
  const chain = [managerId, ...managersInStructure(ix, managerId)];
  const at = chain.indexOf(positionId);
  return at >= 0 ? chain.slice(0, at) : null;
}

/** Whether putting a unit under another would place it inside itself. */
export function unitParentLoop(ix: StructureIndex, unitId: string, parentId: string | null): boolean {
  const seen = new Set<string>();
  let u = parentId ? ix.unit.get(parentId) : undefined;
  while (u && !seen.has(u.id)) {
    if (u.id === unitId) return true;
    seen.add(u.id);
    u = u.parentId ? ix.unit.get(u.parentId) : undefined;
  }
  return false;
}

/** Positions to offer first as a line manager: the position's own unit, then the unit above it (D7-14). */
export function nearbyPositions(ix: StructureIndex, positionId: string, unitId: string): StructurePosition[] {
  const parent = ix.unit.get(unitId)?.parentId ?? null;
  return [...positionsIn(ix, unitId), ...(parent ? positionsIn(ix, parent) : [])].filter((p) => p.id !== positionId);
}

/* ───────── Removing after confirmation (D7-3, D7-4) ───────── */

export type RemovalReason = 'child_unit' | 'position_in_unit' | 'reports_to_it' | 'owns_record' | 'budget_line_draft' | 'budget_line_fixed' | 'signed_contract';

export interface RemovalBlocker {
  reason: RemovalReason;
  /** The record that must move first. */
  subject: { type: string; id: string; code: string | null; title: string };
  /** Who may move it: position titles, or role holders, computed from the permissions matrix. Empty means the administrator. */
  who: { positionId: string | null; title: string; role: AssignedRole | 'objective_owner' | 'budget_holder' | null }[];
  /** Must-fix blockers cannot be cleared from this screen, e.g. a signed contract or a submitted budget. */
  fixed: boolean;
  /** The budget version's status, for budget lines. */
  budgetStatus?: string;
}

/** Positions whose holders carry an assigned role, as reassigners. Roles held by nobody are skipped. */
function roleHolders(s: Store, role: AssignedRole, now: string): RemovalBlocker['who'] {
  const out: RemovalBlocker['who'] = [];
  for (const m of s.memberships) {
    if (m.status !== 'active' || !m.roles.includes(role)) continue;
    const held = s.assignments.filter((a) => a.personId === m.personId && a.from <= now && (a.to === null || a.to >= now));
    if (held.length === 0) {
      const name = s.people.find((p) => p.id === m.personId)?.fullName ?? m.personId;
      out.push({ positionId: null, title: name, role });
    }
    for (const a of held) out.push({ positionId: a.positionId, title: s.positions.find((p) => p.id === a.positionId)?.title ?? a.positionId, role });
  }
  return out;
}

/** Who may reassign a record's owner: the record type's draft principals, without the position being removed. */
function reassigners(s: Store, type: string, objectiveOwnerId: string | null, removing: string, now: string): RemovalBlocker['who'] {
  const principals: Principal[] = PERMISSIONS[type]?.draft ?? [];
  const out: RemovalBlocker['who'] = [];
  for (const p of principals) {
    if (p === 'objective_owner') {
      if (objectiveOwnerId && objectiveOwnerId !== removing) out.push({ positionId: objectiveOwnerId, title: s.positions.find((x) => x.id === objectiveOwnerId)?.title ?? objectiveOwnerId, role: 'objective_owner' });
    } else if (p === 'executive' || p === 'strategy_office' || p === 'finance' || p === 'hr' || p === 'facilitator' || p === 'compliance' || p === 'org_admin') {
      out.push(...roleHolders(s, p, now));
    }
  }
  const seen = new Set<string>();
  return out.filter((w) => {
    const k = `${w.positionId ?? w.title}:${w.role}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** What must move before a unit can be removed: units and positions in it, and the budget lines it holds. */
export function unitRemovalBlockers(s: Store, unitId: string, financialYear: number, now: string): RemovalBlocker[] {
  const out: RemovalBlocker[] = [];
  for (const u of s.units.filter((x) => x.parentId === unitId)) out.push({ reason: 'child_unit', subject: { type: 'OrgUnit', id: u.id, code: null, title: u.name }, who: [], fixed: false });
  for (const p of s.positions.filter((x) => x.unitId === unitId)) out.push({ reason: 'position_in_unit', subject: { type: 'Position', id: p.id, code: null, title: p.title }, who: [], fixed: false });
  const v = currentBudgetVersion(s, financialYear);
  if (v) {
    const lines = s.budgetLines.filter((l) => l.versionId === v.id && l.holderUnitId === unitId);
    const draft = v.status === 'draft';
    const who = draft ? [...roleHolders(s, 'finance', now), { positionId: null, title: '', role: 'budget_holder' as const }] : [];
    for (const l of lines) {
      out.push({ reason: draft ? 'budget_line_draft' : 'budget_line_fixed', subject: { type: 'BudgetLine', id: l.id, code: null, title: l.description }, who, fixed: !draft, budgetStatus: v.status });
    }
  }
  return out;
}

/** What must move before a position can be removed: who reports to it, what it owns, and a signed contract this year. */
export function positionRemovalBlockers(s: Store, positionId: string, financialYear: number, now: string): RemovalBlocker[] {
  const out: RemovalBlocker[] = [];
  for (const p of s.positions.filter((x) => x.reportsToPositionId === positionId)) {
    out.push({ reason: 'reports_to_it', subject: { type: 'Position', id: p.id, code: null, title: p.title }, who: [], fixed: false });
  }
  const owned = (type: string, id: string, code: string, title: string, objectiveOwnerId: string | null) =>
    out.push({ reason: 'owns_record', subject: { type, id, code, title }, who: reassigners(s, type, objectiveOwnerId, positionId, now), fixed: false });
  for (const g of s.goals) if (g.ownerPositionId === positionId) owned('Goal', g.id, g.code, g.title, null);
  for (const o of s.objectives) if (o.ownerPositionId === positionId) owned('Objective', o.id, o.code, o.title, null);
  for (const k of s.kpis) {
    if (k.ownerPositionId === positionId) owned('Kpi', k.id, k.code, k.name, s.objectives.find((o) => o.id === k.objectiveId)?.ownerPositionId ?? null);
  }
  for (const a of s.activities) {
    if (a.ownerPositionId !== positionId || a.status === 'archived') continue;
    const k = s.kpis.find((x) => x.id === a.kpiId);
    owned('Activity', a.id, a.code, a.title, (k && s.objectives.find((o) => o.id === k.objectiveId)?.ownerPositionId) ?? null);
  }
  for (const c of s.contracts) {
    if (c.positionId === positionId && c.financialYear === financialYear && c.status === 'signed') {
      out.push({ reason: 'signed_contract', subject: { type: 'PerformanceContract', id: c.id, code: null, title: '' }, who: [], fixed: true });
    }
  }
  return out;
}
