/**
 * Organisation setup and structure, through the data-access layer (slice 7). Permissions are enforced here:
 * only the organisation administrator drafts (contract v1.4, D7-5); emails reach administrators only; confirming
 * needs an administrator who holds a position in the structure being confirmed (D7-7).
 *
 * Before confirmation every change goes to the draft structure (D7-8), which is not a record. Confirming turns it
 * into records, with an audit entry holding every worth-checking kind and its reason (D7-9). After confirmation,
 * changes go straight to the records, each with an audit entry; a change that would add a must-fix problem is
 * refused (D7-10). Removing follows "move first, then remove" (D7-3, D7-4).
 */
import type {
  AuditEntry, Id, ISODate, ISODateTime, Membership, OrgUnit, Person, Position, PositionAssignment, SourceDocument, AiTask, AssignedRole,
} from '../../../contract/caspa-data-contract';
import { aiStub, type StructureDraft } from '../../../ai';
import {
  indexStructure, mustCount, nearbyPositions, newMustProblems, positionRemovalBlockers, reportsToLoop, setupChecks,
  unitParentLoop, unitRemovalBlockers, holdsPosition, type RemovalBlocker, type SetupChecks, type SetupItem, type StructureInput,
  type StructurePosition, type WorthKind,
} from '../../../rules/setup';
import { dateInZone } from '../../../selectors/format';
import type { Store } from '../store';
import type { Viewer } from '../viewer';
import { CONFIRM_ACTION, structureConfirmation, type StructureConfirmationRecord } from './confirmation';
import { detailsOf, emptyDraft, human, structureOfStore, type DraftDetails, type DraftPerson, type DraftPosition, type DraftUnit, type RowProblem, type SetupDraft } from './draft';
import { importRows } from './import';
import type { Sheet } from './files';

export type { SetupDraft, DraftDetails, RowProblem };

/** Drafts live beside each store in memory, so they survive the repository being rebuilt after a change. */
const drafts = new WeakMap<Store, SetupDraft>();
const draftOf = (s: Store): SetupDraft => {
  let d = drafts.get(s);
  if (!d) {
    d = emptyDraft(s);
    drafts.set(s, d);
  }
  return d;
};

export interface UnitInput { name: string; unitType: string; parentId: string | null }
export interface PositionInput {
  title: string; unitId: string; reportsToId: string | null; ref: string | null;
  /** An existing person, or a new name; null holder means vacant. */
  holder: { personId: string | null; name: string; acting: boolean } | null;
}
export interface PersonInput { fullName?: string; email?: string | null; roles?: AssignedRole[]; endsOn?: ISODate | null }

export type SetupError =
  | { error: 'not_allowed' }
  | { error: 'not_found' }
  | { error: 'loop'; through: string[] }
  | { error: 'unit_loop' }
  | { error: 'must_fix'; items: SetupItem[] }
  | { error: 'blocked'; blockers: RemovalBlocker[] }
  | { error: 'reason_required' }
  | { error: 'not_ready'; must: number };
export type SetupResult<T = object> = ({ ok: true } & T) | ({ ok: false } & SetupError);

export interface StructureChange { at: ISODate; by: string; action: string; type: string; label: string }

/** Everything the Organisation page shows, already limited to this viewer. */
export interface OrganisationPage {
  /** "setup" before confirmation for administrators, "waiting" for everyone else; "structure" once confirmed. */
  mode: 'setup' | 'structure' | 'waiting';
  isAdmin: boolean;
  /** Whether this viewer may confirm: an administrator holding a position in the draft structure (D7-7). */
  canConfirm: boolean;
  /** An administrator on the organisation's own staff, named for a consultant who cannot confirm. */
  staffAdmin: string | null;
  confirmed: { by: string; on: ISODate } | null;
  details: DraftDetails;
  /** Currency and year start lock at first confirmation (D7-10). */
  locked: boolean;
  /** Units, positions and people; emails only for administrators. */
  structure: StructureInput;
  checks: SetupChecks;
  checked: Partial<Record<WorthKind, { reason: string; by: string; on: ISODate }>>;
  rowProblems: RowProblem[];
  sheet: SetupDraft['sheet'];
  ai: { fileName: string; page: number } | null;
  aiEnabled: boolean;
  /** People with the Executive role, who are told when the structure is confirmed. */
  executives: string[];
  /** People with an end date on their access, by person id. */
  endsOn: Record<string, ISODate | null>;
  /** Changes to the confirmed structure, newest first. */
  changes: StructureChange[];
  financialYear: number;
}

export interface OrganisationAccess {
  page(): OrganisationPage;
  /** Line managers to offer: the position's own unit and the one above it, or those matching a search (D7-14). */
  managerOptions(positionId: string | null, unitId: string, query: string): { options: StructurePosition[]; total: number };
  /** What must move before a unit or position can be removed. Empty means it can go. */
  removalBlockers(kind: 'unit' | 'position', id: string): RemovalBlocker[];
  saveDetails(d: DraftDetails): SetupResult;
  importSheet(sheet: Sheet): SetupResult<{ problems: number }>;
  draftFromOrganogram(fileName: string): Promise<SetupResult>;
  addUnit(input: UnitInput): SetupResult<{ id: string }>;
  saveUnit(id: string, input: UnitInput): SetupResult;
  addPosition(input: PositionInput): SetupResult<{ id: string }>;
  savePosition(id: string, input: PositionInput): SetupResult;
  accept(id: string): SetupResult;
  remove(kind: 'unit' | 'position', id: string): SetupResult;
  addPerson(): SetupResult<{ id: string }>;
  savePerson(id: string, input: PersonInput): SetupResult;
  mergePeople(keepPersonId: string, dropPersonId: string): SetupResult;
  fixRowReports(positionId: string, managerId: string): SetupResult;
  dropVacantRoles(positionId: string): SetupResult;
  markChecked(kind: WorthKind, reason: string): SetupResult;
  confirm(): SetupResult;
}

export interface AccessContext {
  s: Store;
  viewer: Viewer;
  now: ISODate;
  financialYear: number;
  clock: () => ISODateTime;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  onChange?: () => void;
}

const STRUCTURE_TYPES = new Set(['OrgUnit', 'Position', 'Person', 'PositionAssignment', 'Membership', 'Organisation']);

export function createOrganisationAccess(ctx: AccessContext): OrganisationAccess {
  const { s, viewer, now, clock, audit } = ctx;
  const isAdmin = viewer.roles.includes('org_admin');
  const confirmedEntry = () => structureConfirmation(s);
  const confirmed = () => confirmedEntry() !== null;
  const changed = () => ctx.onChange?.();
  const on = (at: string) => dateInZone(at, s.organisation.timeZone);
  const nameOfMembership = (mid: string) => {
    const m = s.memberships.find((x) => x.id === mid);
    return s.people.find((p) => p.id === m?.personId)?.fullName ?? mid;
  };
  const stamp = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const deny = <T,>(): SetupResult<T> => ({ ok: false, error: 'not_allowed' }) as SetupResult<T>;

  /* ───── IDs: unique in the organisation, and kept as record IDs on confirmation ───── */
  const taken = () => new Set<string>([...s.units, ...s.positions, ...s.people].map((x) => x.id as string));
  let seq = 0;
  const nextId = (prefix: 'u' | 'pos' | 'per') => {
    const used = taken();
    const d = drafts.get(s);
    if (d) [...d.structure.units, ...d.structure.positions, ...d.structure.people].forEach((x) => used.add(x.id));
    const key = (s.organisation.id as string).replace(/^org-/, '');
    let id: string;
    do id = `${prefix}-${key}-${++seq}`; while (used.has(id));
    return id;
  };

  /* ───── Reading ───── */
  const current = (): StructureInput => (confirmed() ? structureOfStore(s, now) : draftOf(s).structure);
  /** A new structure object after a draft change, so the rules' index is rebuilt. */
  const touch = (d: SetupDraft) => { d.structure = { ...d.structure }; };

  const page = (): OrganisationPage => {
    const entry = confirmedEntry();
    const d = drafts.get(s);
    const mode = entry ? 'structure' : isAdmin ? 'setup' : 'waiting';
    const raw = entry ? structureOfStore(s, now) : isAdmin ? draftOf(s).structure : { units: [], positions: [], people: [] };
    const st: StructureInput = isAdmin ? raw : { ...raw, people: raw.people.map((p) => ({ ...p, email: null })) };
    const ix = indexStructure(raw);
    const staff = raw.people.find((p) => p.roles.includes('org_admin') && holdsPosition(ix, p.id));
    const checkedRaw = entry ? {} : d?.checked ?? {};
    return {
      mode, isAdmin,
      canConfirm: isAdmin && !entry && holdsPosition(ix, viewer.personId),
      staffAdmin: staff?.fullName ?? null,
      confirmed: entry ? { by: nameOfMembership(entry.actorMembershipId), on: on(entry.at) } : null,
      details: entry || !d ? detailsOf(s.organisation) : d.details,
      locked: !!entry,
      structure: st,
      checks: isAdmin ? setupChecks(raw) : { must: [], worth: [] },
      checked: Object.fromEntries(Object.entries(checkedRaw).map(([k, v]) => [k, { reason: v!.reason, by: nameOfMembership(v!.by.byMembershipId), on: on(v!.by.at) }])),
      rowProblems: !entry && isAdmin ? d?.rowProblems ?? [] : [],
      sheet: !entry && isAdmin ? d?.sheet ?? null : null,
      ai: !entry && isAdmin && d?.ai ? { fileName: d.ai.fileName, page: 1 } : null,
      aiEnabled: (entry || !d ? s.organisation.settings.aiEnabled : d.details.settings.aiEnabled),
      executives: raw.people.filter((p) => p.roles.includes('executive')).map((p) => p.fullName),
      endsOn: Object.fromEntries((entry ? s.memberships.map((m) => [m.personId, m.endsOn]) : (d?.structure.people ?? []).map((p) => [p.id, p.endsOn])) as [string, ISODate | null][]),
      changes: isAdmin ? changes() : [],
      financialYear: ctx.financialYear,
    };
  };

  const labelOf = (e: AuditEntry): string => {
    const rec = (e.after ?? e.before) as Record<string, unknown> | null;
    if (!rec) return e.entity.id;
    return String(rec.name ?? rec.title ?? rec.fullName ?? e.entity.id);
  };
  const changes = (): StructureChange[] =>
    s.auditEntries
      .filter((e) => STRUCTURE_TYPES.has(e.entity.type) && e.action !== CONFIRM_ACTION)
      .slice(-12)
      .reverse()
      .map((e) => ({ at: on(e.at), by: nameOfMembership(e.actorMembershipId), action: e.action, type: e.entity.type, label: labelOf(e) }));

  /* ───── Changing the confirmed records (D7-10) ───── */

  /** Apply a change to a copy of the stored structure first; refuse it if it adds a must-fix problem. */
  const guard = (change: (st: StructureInput) => StructureInput): SetupResult => {
    const before = structureOfStore(s, now);
    const added = newMustProblems(before, change(structuredClone(before)));
    return added.length ? { ok: false, error: 'must_fix', items: added } : { ok: true };
  };
  const touchRecord = <T extends { updated: { at: ISODateTime; byMembershipId: Id<'Membership'> } }>(r: T) => { r.updated = stamp(); };
  const base = () => ({ orgId: s.organisation.id, created: stamp(), updated: stamp() });
  const currentAssignment = (positionId: string) => s.assignments.find((a) => a.positionId === positionId && a.from <= now && (a.to === null || a.to >= now));
  /** The last day held is the day before "now", so the position is vacant from today (an appointment made today never took effect). */
  const dayBefore = (d: ISODate) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) as ISODate;
  const endAssignment = (a: PositionAssignment) => {
    const before = structuredClone(a);
    a.to = dayBefore(now);
    touchRecord(a);
    audit('update', { type: 'PositionAssignment', id: a.id }, before, a);
  };
  /** A person in the organisation by id, or a new person and access with no roles, for a name typed in. */
  const personFor = (holder: NonNullable<PositionInput['holder']>): Id<'Person'> => {
    if (holder.personId && s.people.some((p) => p.id === holder.personId)) return holder.personId as Id<'Person'>;
    const existing = s.people.find((p) => p.fullName.trim().toLowerCase() === holder.name.trim().toLowerCase() && s.memberships.some((m) => m.personId === p.id && m.status === 'active'));
    if (existing) return existing.id;
    const person: Person = { id: nextId('per') as Id<'Person'>, fullName: holder.name.trim(), email: null };
    s.people.push(person);
    audit('create', { type: 'Person', id: person.id }, null, person);
    const m: Membership = { ...base(), id: `m-${person.id}` as Id<'Membership'>, personId: person.id, roles: [], startsOn: now, endsOn: null, status: 'active' };
    s.memberships.push(m);
    audit('create', { type: 'Membership', id: m.id }, null, m);
    return person.id;
  };
  const setHolder = (positionId: string, holder: PositionInput['holder']) => {
    const cur = currentAssignment(positionId);
    const want = holder ? personFor(holder) : null;
    const kind = holder?.acting ? 'acting' : 'substantive';
    if (cur && want === cur.personId && cur.kind === kind) return;
    if (cur) endAssignment(cur);
    if (want) {
      const a: PositionAssignment = { ...base(), id: `pa-${positionId}-${s.assignments.length + 1}` as Id<'PositionAssignment'>, positionId: positionId as Id<'Position'>, personId: want, kind, from: now, to: null };
      s.assignments.push(a);
      audit('create', { type: 'PositionAssignment', id: a.id }, null, a);
    }
  };
  const applyPosition = (st: StructureInput, id: string, input: PositionInput): StructureInput => {
    const p = st.positions.find((x) => x.id === id);
    if (p) Object.assign(p, { title: input.title, unitId: input.unitId, reportsToId: input.reportsToId, ref: input.ref });
    return st;
  };

  /* ───── Draft helpers ───── */
  const draftPerson = (d: SetupDraft, holder: NonNullable<PositionInput['holder']>): string => {
    if (holder.personId && d.structure.people.some((p) => p.id === holder.personId)) return holder.personId;
    const name = holder.name.trim();
    const same = d.structure.people.find((p) => p.fullName.trim().toLowerCase() === name.toLowerCase());
    if (same) return same.id;
    const p: DraftPerson = { id: nextId('per'), fullName: name, email: null, roles: [], endsOn: null, existing: false };
    d.structure.people.push(p);
    return p.id;
  };
  const accepted = <T extends { draft: DraftUnit['draft'] }>(x: T) => {
    if (x.draft.state === 'ai_draft') x.draft = { ...x.draft, state: 'accepted', decided: stamp() };
  };
  const loopError = (st: StructureInput, id: string | null, reportsToId: string | null): SetupResult | null => {
    if (!id) return null;
    const through = reportsToLoop(indexStructure(st), id, reportsToId);
    return through ? { ok: false, error: 'loop', through } : null;
  };

  /* ───── Actions ───── */
  const removalBlockers = (kind: 'unit' | 'position', id: string): RemovalBlocker[] => {
      if (!confirmed()) {
        const ix = indexStructure(draftOf(s).structure);
        if (kind === 'unit') {
          return [
            ...(ix.children.get(id) ?? []).map((u): RemovalBlocker => ({ reason: 'child_unit', subject: { type: 'OrgUnit', id: u.id, code: null, title: u.name }, who: [], fixed: false })),
            ...(ix.positionsOfUnit.get(id) ?? []).map((p): RemovalBlocker => ({ reason: 'position_in_unit', subject: { type: 'Position', id: p.id, code: null, title: p.title }, who: [], fixed: false })),
          ];
        }
        return (ix.reportsTo.get(id) ?? []).map((p): RemovalBlocker => ({ reason: 'reports_to_it', subject: { type: 'Position', id: p.id, code: null, title: p.title }, who: [], fixed: false }));
      }
      return kind === 'unit' ? unitRemovalBlockers(s, id, ctx.financialYear, now) : positionRemovalBlockers(s, id, ctx.financialYear, now);
    };

  return {
    page,

    managerOptions(positionId, unitId, query) {
      const st = current();
      const ix = indexStructure(st);
      const q = query.trim().toLowerCase();
      if (q.length < 2) return { options: nearbyPositions(ix, positionId ?? '', unitId).slice(0, 8), total: nearbyPositions(ix, positionId ?? '', unitId).length };
      const near = new Set([unitId, ix.unit.get(unitId)?.parentId ?? '']);
      const holder = (p: StructurePosition) => (p.holder ? ix.person.get(p.holder.personId)?.fullName ?? '' : '');
      const all = st.positions
        .filter((p) => p.id !== positionId && (p.title.toLowerCase().includes(q) || holder(p).toLowerCase().includes(q) || (p.ref ?? '').toLowerCase().includes(q)))
        .sort((a, b) => Number(near.has(b.unitId)) - Number(near.has(a.unitId)));
      return { options: all.slice(0, 8), total: all.length };
    },

    removalBlockers,

    saveDetails(details) {
      if (!isAdmin) return deny();
      if (!confirmed()) {
        const d = draftOf(s);
        d.details = structuredClone(details);
        changed();
        return { ok: true };
      }
      const o = s.organisation;
      const before = structuredClone(o);
      // Currency and the year's start month are fixed at first confirmation (D7-10).
      Object.assign(o, {
        name: details.name.trim() || o.name, countryCode: details.countryCode, timeZone: details.timeZone, termLabels: structuredClone(details.termLabels),
        perspectives: details.perspectives ? structuredClone(details.perspectives) : null, settings: { ...structuredClone(details.settings), ratingSchemeId: o.settings.ratingSchemeId },
      });
      touchRecord(o);
      audit('settings', { type: 'Organisation', id: o.id }, before, o);
      changed();
      return { ok: true };
    },

    importSheet(sheet) {
      if (!isAdmin || confirmed()) return deny();
      const d = draftOf(s);
      const r = importRows(sheet, d.structure.people.filter((p) => p.existing).map((p) => ({ ...p })), nextId);
      d.structure = r.structure;
      d.rowProblems = r.problems;
      d.sheet = r.summary;
      d.checked = {};
      d.ai = null;
      changed();
      return { ok: true, problems: r.problems.length };
    },

    async draftFromOrganogram(fileName) {
      if (!isAdmin || confirmed()) return deny();
      const draft: StructureDraft = await aiStub.draftStructure(fileName);
      const d = draftOf(s);
      const doc: SourceDocument = { ...base(), id: `sd-${s.sourceDocuments.length + 1}-${(s.organisation.id as string).replace(/^org-/, '')}` as Id<'SourceDocument'>, title: fileName, kind: 'other', fileRef: fileName };
      const task: AiTask = {
        orgId: s.organisation.id, id: `ai-${s.aiTasks.length + 1}-${(s.organisation.id as string).replace(/^org-/, '')}` as Id<'AiTask'>, kind: 'extract', requested: stamp(),
        inputRefs: [{ type: 'SourceDocument', id: doc.id }], outputRefs: [], model: 'stub',
      };
      s.sourceDocuments.push(doc);
      s.aiTasks.push(task);
      const meta = (): DraftUnit['draft'] => ({ state: 'ai_draft', provenance: { kind: 'document', sourceDocumentId: doc.id, page: draft.page, excerpt: '' }, decided: null });
      const units: DraftUnit[] = [];
      const byName = new Map<string, DraftUnit>();
      for (const [name, parent, type] of draft.units) {
        const u: DraftUnit = { id: nextId('u'), name, unitType: type, parentId: parent ? byName.get(parent)?.id ?? null : null, draft: meta() };
        byName.set(name, u);
        units.push(u);
      }
      const people = d.structure.people.filter((p) => p.existing);
      const positions: DraftPosition[] = [];
      const pending: { p: DraftPosition; to: string | null }[] = [];
      for (const [title, unit, to, holder] of draft.positions) {
        const p: DraftPosition = { id: nextId('pos'), unitId: byName.get(unit)!.id, title, ref: null, reportsToId: null, holder: null, draft: meta(), row: null };
        if (holder) {
          // The AI reads names only, so every holder starts as a new person; an administrator's twin is offered to merge.
          const person: DraftPerson = { id: nextId('per'), fullName: holder, email: null, roles: [], endsOn: null, existing: false };
          people.push(person);
          p.holder = { personId: person.id, acting: false };
        }
        positions.push(p);
        pending.push({ p, to });
      }
      for (const { p, to } of pending) {
        if (!to) continue;
        const c = positions.filter((x) => x.title === to && x.id !== p.id);
        p.reportsToId = (c.find((x) => x.unitId === p.unitId) ?? c[0])?.id ?? null;
      }
      task.outputRefs = [...units, ...positions].map((x) => ({ type: 'draft', id: x.id }));
      d.structure = { units, positions, people };
      d.rowProblems = [];
      d.sheet = null;
      d.checked = {};
      d.ai = { sourceDocumentId: doc.id, aiTaskId: task.id, fileName };
      changed();
      return { ok: true };
    },

    addUnit(input) {
      if (!isAdmin) return deny();
      if (!confirmed()) {
        const d = draftOf(s);
        const st = d.structure;
        const u: DraftUnit = { id: nextId('u'), name: input.name.trim() || 'Unit', unitType: input.unitType.trim(), parentId: input.parentId, draft: human() };
        st.units.push(u);
        touch(d);
        changed();
        return { ok: true, id: u.id };
      }
      const id = nextId('u');
      const g = guard((st) => ({ ...st, units: [...st.units, { id, name: input.name, unitType: input.unitType, parentId: input.parentId }] }));
      if (!g.ok) return g;
      const u: OrgUnit = { ...base(), id: id as Id<'OrgUnit'>, parentId: input.parentId as Id<'OrgUnit'> | null, name: input.name.trim(), unitType: input.unitType.trim() };
      s.units.push(u);
      audit('create', { type: 'OrgUnit', id: u.id }, null, u);
      changed();
      return { ok: true, id };
    },

    saveUnit(id, input) {
      if (!isAdmin) return deny();
      const st = current();
      if (!st.units.some((u) => u.id === id)) return { ok: false, error: 'not_found' };
      if (unitParentLoop(indexStructure(st), id, input.parentId)) return { ok: false, error: 'unit_loop' };
      if (!confirmed()) {
        const d = draftOf(s);
        const u = d.structure.units.find((x) => x.id === id)!;
        Object.assign(u, { name: input.name.trim() || u.name, unitType: input.unitType.trim(), parentId: input.parentId });
        accepted(u);
        touch(d);
        changed();
        return { ok: true };
      }
      const g = guard((c) => ({ ...c, units: c.units.map((u) => (u.id === id ? { ...u, name: input.name, unitType: input.unitType, parentId: input.parentId } : u)) }));
      if (!g.ok) return g;
      const u = s.units.find((x) => x.id === id)!;
      const before = structuredClone(u);
      Object.assign(u, { name: input.name.trim() || u.name, unitType: input.unitType.trim(), parentId: input.parentId });
      touchRecord(u);
      audit('update', { type: 'OrgUnit', id }, before, u);
      changed();
      return { ok: true };
    },

    addPosition(input) {
      if (!isAdmin) return deny();
      const id = nextId('pos');
      if (!confirmed()) {
        const d = draftOf(s);
        const p: DraftPosition = { id, unitId: input.unitId, title: input.title.trim() || 'Position', ref: input.ref, reportsToId: input.reportsToId, holder: null, draft: human(), row: null };
        if (input.holder?.name.trim() || input.holder?.personId) p.holder = { personId: draftPerson(d, input.holder), acting: input.holder.acting };
        d.structure.positions.push(p);
        touch(d);
        changed();
        return { ok: true, id };
      }
      const g = guard((st) => ({ ...st, positions: [...st.positions, { id, unitId: input.unitId, title: input.title, ref: null, reportsToId: input.reportsToId, holder: null }] }));
      if (!g.ok) return g;
      const p: Position = { ...base(), id: id as Id<'Position'>, unitId: input.unitId as Id<'OrgUnit'>, title: input.title.trim(), reportsToPositionId: input.reportsToId as Id<'Position'> | null };
      s.positions.push(p);
      audit('create', { type: 'Position', id }, null, p);
      if (input.holder?.name.trim() || input.holder?.personId) setHolder(id, input.holder);
      changed();
      return { ok: true, id };
    },

    savePosition(id, input) {
      if (!isAdmin) return deny();
      const st = current();
      if (!st.positions.some((p) => p.id === id)) return { ok: false, error: 'not_found' };
      const loop = loopError(st, id, input.reportsToId);
      if (loop) return loop;
      const holder = input.holder && (input.holder.name.trim() || input.holder.personId) ? input.holder : null;
      if (!confirmed()) {
        const d = draftOf(s);
        const p = d.structure.positions.find((x) => x.id === id)!;
        Object.assign(p, { title: input.title.trim() || p.title, unitId: input.unitId, reportsToId: input.reportsToId, ref: input.ref });
        p.holder = holder ? { personId: draftPerson(d, holder), acting: holder.acting } : null;
        accepted(p);
        // A holder added to a vacant row with roles takes those roles, and the row problem is done.
        const rp = d.rowProblems.find((r) => r.positionId === id && !r.done && r.kind === 'roles_on_vacant');
        if (rp && rp.kind === 'roles_on_vacant' && p.holder) {
          const person = d.structure.people.find((x) => x.id === p.holder!.personId)!;
          rp.roles.forEach((r) => { if (!person.roles.includes(r)) person.roles.push(r); });
          rp.done = true;
        }
        const rr = d.rowProblems.find((r) => r.positionId === id && !r.done && r.kind === 'reports_unmatched');
        if (rr && input.reportsToId) rr.done = true;
        touch(d);
        changed();
        return { ok: true };
      }
      const g = guard((c) => applyPosition(c, id, input));
      if (!g.ok) return g;
      const p = s.positions.find((x) => x.id === id)!;
      const before = structuredClone(p);
      Object.assign(p, { title: input.title.trim() || p.title, unitId: input.unitId as Id<'OrgUnit'>, reportsToPositionId: input.reportsToId as Id<'Position'> | null });
      if (JSON.stringify(before) !== JSON.stringify({ ...p, updated: before.updated })) {
        touchRecord(p);
        audit('update', { type: 'Position', id }, before, p);
      }
      setHolder(id, holder);
      changed();
      return { ok: true };
    },

    accept(id) {
      if (!isAdmin || confirmed()) return deny();
      const d = draftOf(s);
      const x = d.structure.units.find((u) => u.id === id) ?? d.structure.positions.find((p) => p.id === id);
      if (!x) return { ok: false, error: 'not_found' };
      accepted(x);
      touch(d);
      changed();
      return { ok: true };
    },

    remove(kind, id) {
      if (!isAdmin) return deny();
      const blockers = removalBlockers(kind, id);
      if (blockers.length) return { ok: false, error: 'blocked', blockers };
      if (!confirmed()) {
        const d = draftOf(s);
        if (kind === 'unit') d.structure.units = d.structure.units.filter((u) => u.id !== id);
        else {
          d.structure.positions = d.structure.positions.filter((p) => p.id !== id);
          d.rowProblems = d.rowProblems.filter((r) => r.positionId !== id);
        }
        touch(d);
        changed();
        return { ok: true };
      }
      const g = guard((st) => (kind === 'unit' ? { ...st, units: st.units.filter((u) => u.id !== id) } : { ...st, positions: st.positions.filter((p) => p.id !== id) }));
      if (!g.ok) return g;
      if (kind === 'unit') {
        const u = s.units.find((x) => x.id === id);
        if (!u) return { ok: false, error: 'not_found' };
        s.units.splice(s.units.indexOf(u), 1);
        audit('remove', { type: 'OrgUnit', id }, u, null);
      } else {
        const p = s.positions.find((x) => x.id === id);
        if (!p) return { ok: false, error: 'not_found' };
        const a = currentAssignment(id);
        if (a) endAssignment(a);
        s.positions.splice(s.positions.indexOf(p), 1);
        audit('remove', { type: 'Position', id }, p, null);
      }
      changed();
      return { ok: true };
    },

    addPerson() {
      if (!isAdmin) return deny();
      if (!confirmed()) {
        const d = draftOf(s);
        const p: DraftPerson = { id: nextId('per'), fullName: 'New person', email: null, roles: [], endsOn: null, existing: false };
        d.structure.people.push(p);
        touch(d);
        changed();
        return { ok: true, id: p.id };
      }
      const person: Person = { id: nextId('per') as Id<'Person'>, fullName: 'New person', email: null };
      s.people.push(person);
      audit('create', { type: 'Person', id: person.id }, null, person);
      const m: Membership = { ...base(), id: `m-${person.id}` as Id<'Membership'>, personId: person.id, roles: [], startsOn: now, endsOn: null, status: 'active' };
      s.memberships.push(m);
      audit('create', { type: 'Membership', id: m.id }, null, m);
      changed();
      return { ok: true, id: person.id };
    },

    savePerson(id, input) {
      if (!isAdmin) return deny();
      const email = input.email === undefined ? undefined : input.email?.trim() || null;
      if (!confirmed()) {
        const d = draftOf(s);
        const p = d.structure.people.find((x) => x.id === id);
        if (!p) return { ok: false, error: 'not_found' };
        if (input.fullName !== undefined) p.fullName = input.fullName.trim() || p.fullName;
        if (email !== undefined) p.email = email;
        if (input.roles) p.roles = [...new Set(input.roles)];
        if (input.endsOn !== undefined) p.endsOn = input.endsOn;
        touch(d);
        changed();
        return { ok: true };
      }
      const person = s.people.find((x) => x.id === id);
      const m = s.memberships.find((x) => x.personId === id && x.status === 'active');
      if (!person || !m) return { ok: false, error: 'not_found' };
      const g = guard((st) => ({
        ...st,
        people: st.people.map((p) => (p.id === id ? { ...p, fullName: input.fullName ?? p.fullName, email: email === undefined ? p.email : email, roles: input.roles ?? p.roles } : p)),
      }));
      if (!g.ok) return g;
      if (input.fullName !== undefined || email !== undefined) {
        const before = structuredClone(person);
        if (input.fullName !== undefined) person.fullName = input.fullName.trim() || person.fullName;
        if (email !== undefined) person.email = email;
        audit('update', { type: 'Person', id }, before, person);
      }
      if (input.roles || input.endsOn !== undefined) {
        const before = structuredClone(m);
        if (input.roles) m.roles = [...new Set(input.roles)];
        if (input.endsOn !== undefined) m.endsOn = input.endsOn;
        touchRecord(m);
        audit('update', { type: 'Membership', id: m.id }, before, { ...m, name: person.fullName });
      }
      changed();
      return { ok: true };
    },

    mergePeople(keepPersonId, dropPersonId) {
      if (!isAdmin || confirmed()) return deny();
      const d = draftOf(s);
      const keep = d.structure.people.find((p) => p.id === keepPersonId);
      const drop = d.structure.people.find((p) => p.id === dropPersonId);
      if (!keep || !drop) return { ok: false, error: 'not_found' };
      d.structure.positions.forEach((p) => { if (p.holder?.personId === drop.id) p.holder = { ...p.holder, personId: keep.id }; });
      keep.roles = [...new Set([...keep.roles, ...drop.roles])];
      keep.email = keep.email ?? drop.email;
      d.structure.people = d.structure.people.filter((p) => p.id !== drop.id);
      touch(d);
      changed();
      return { ok: true };
    },

    fixRowReports(positionId, managerId) {
      if (!isAdmin || confirmed()) return deny();
      const d = draftOf(s);
      const loop = loopError(d.structure, positionId, managerId);
      if (loop) return loop;
      const p = d.structure.positions.find((x) => x.id === positionId);
      const r = d.rowProblems.find((x) => x.positionId === positionId && x.kind === 'reports_unmatched');
      if (!p || !r) return { ok: false, error: 'not_found' };
      p.reportsToId = managerId;
      r.done = true;
      touch(d);
      changed();
      return { ok: true };
    },

    dropVacantRoles(positionId) {
      if (!isAdmin || confirmed()) return deny();
      const d = draftOf(s);
      const r = d.rowProblems.find((x) => x.positionId === positionId && x.kind === 'roles_on_vacant');
      if (!r) return { ok: false, error: 'not_found' };
      r.done = true;
      changed();
      return { ok: true };
    },

    markChecked(kind, reason) {
      if (!isAdmin || confirmed()) return deny();
      const text = reason.trim();
      if (!text) return { ok: false, error: 'reason_required' };
      draftOf(s).checked[kind] = { reason: text, by: stamp() };
      changed();
      return { ok: true };
    },

    confirm() {
      if (!isAdmin || confirmed()) return deny();
      const d = draftOf(s);
      const st = d.structure;
      const checks = setupChecks(st);
      if (mustCount(checks) > 0) return { ok: false, error: 'not_ready', must: mustCount(checks) };
      if (!holdsPosition(indexStructure(st), viewer.personId)) return deny();
      const o = s.organisation;
      const before = { name: o.name, units: s.units.length, positions: s.positions.length };
      Object.assign(o, {
        name: d.details.name.trim() || o.name, countryCode: d.details.countryCode, timeZone: d.details.timeZone, baseCurrency: d.details.baseCurrency,
        financialYearStartMonth: d.details.financialYearStartMonth, termLabels: structuredClone(d.details.termLabels),
        perspectives: d.details.perspectives ? structuredClone(d.details.perspectives) : null,
        settings: { ...structuredClone(d.details.settings), ratingSchemeId: o.settings.ratingSchemeId },
      });
      touchRecord(o);
      // Draft IDs become record IDs (D7-8).
      for (const u of st.units) s.units.push({ ...base(), id: u.id as Id<'OrgUnit'>, parentId: u.parentId as Id<'OrgUnit'> | null, name: u.name, unitType: u.unitType });
      for (const p of st.positions) s.positions.push({ ...base(), id: p.id as Id<'Position'>, unitId: p.unitId as Id<'OrgUnit'>, title: p.title, reportsToPositionId: p.reportsToId as Id<'Position'> | null });
      for (const p of st.people) {
        const existing = s.people.find((x) => x.id === p.id);
        if (existing) Object.assign(existing, { fullName: p.fullName, email: p.email });
        else s.people.push({ id: p.id as Id<'Person'>, fullName: p.fullName, email: p.email });
        const m = s.memberships.find((x) => x.personId === p.id && x.status === 'active');
        if (m) Object.assign(m, { roles: [...p.roles], endsOn: p.endsOn, updated: stamp() });
        else s.memberships.push({ ...base(), id: `m-${p.id}` as Id<'Membership'>, personId: p.id as Id<'Person'>, roles: [...p.roles], startsOn: now, endsOn: p.endsOn, status: 'active' });
      }
      for (const p of st.positions) {
        if (!p.holder) continue;
        s.assignments.push({
          ...base(), id: `pa-${p.id}` as Id<'PositionAssignment'>, positionId: p.id as Id<'Position'>, personId: p.holder.personId as Id<'Person'>,
          kind: p.holder.acting ? 'acting' : 'substantive', from: now, to: null,
        });
      }
      const record: StructureConfirmationRecord = {
        units: st.units.length, positions: st.positions.length, people: st.people.length,
        checked: checks.worth.map((g) => ({ kind: g.kind as WorthKind, count: g.items.length, reason: d.checked[g.kind as WorthKind]?.reason ?? null })),
      };
      audit(CONFIRM_ACTION, { type: 'Organisation', id: o.id }, before, record);
      drafts.delete(s);
      changed();
      return { ok: true };
    },
  };
}

