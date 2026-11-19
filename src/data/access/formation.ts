/**
 * Strategy formation, part 11a, through the data-access layer: setting up a formed plan, its stages, the
 * preparer-built calendar and its sessions with decision logs. Permissions follow the matrix: the Strategy office or
 * a facilitator sets up the plan and plans sessions (F-1); only the named preparer edits and publishes the calendar;
 * nothing reaches participants until it is published.
 */
import type { AuditEntry, FourQCell, FormationDeadline, FormationStage, Id, ISODate, ISODateTime, StrategicPlan, Workshop, WorkshopGroup, WorkshopPurpose } from '../../contract/caspa-data-contract';
import { byMonth, countsByStage, mayMarkDone, nextItem, schedule, starterOwners, starterSchedule, type ScheduleItem } from '../../rules/schedule';
import {
  agenda, canMoveStage, defaultParticipants, departmentHeadPositions, formationChecks, formationInProgress, leadershipPositions, packageAdds, PACKAGES, sessionsOf, STAGES,
  type AgendaItem, type FormationCheck, type Format,
} from '../../rules/formation';
import { dateInZone, formatFinancialYear } from '../../selectors/format';
import { CELLS, cellKey } from '../../rules/conception';
const CELL_KEYS = new Set(CELLS.map(cellKey));
import { en } from '../../strings/en';
import { can } from './permissions';
import type { Store } from './store';
import type { Viewer } from './viewer';
import { membershipActiveOn } from '../../rules/access';

export interface ActionView { logIndex: number; actionIndex: number; text: string; owner: string; dueOn: ISODate; done: { by: string; on: ISODate } | null; canClose: boolean }
export interface GroupView {
  id: string; name: string; cells: FourQCell[]; scribe: { membershipId: string; name: string }; memberNames: string[];
  closed: { by: string; on: ISODate } | null; toReview: number; accepted: number;
}
export interface SessionView {
  id: string; purposes: WorkshopPurpose[]; format: Format; scheduledOn: ISODate | null; window: { opensOn: ISODate; closesOn: ISODate } | null;
  status: Workshop['status']; participants: number;
  decisionLog: { decision: string; actions: ActionView[] }[];
  /** v1.19: groups, on a 4Q review session. */
  groups: GroupView[];
  /** The Strategy office sets up groups until the session is held; it closes and reopens them. */
  canManageGroups: boolean;
  /** Close a group for review, or reopen it: the Strategy office, while the plan is a draft. */
  canCloseGroups: boolean;
}
/** One schedule item, ready to show (Forming Schedule Specification v0.1). */
export interface ScheduleItemView extends ScheduleItem {
  /** The deadline's label; for sessions and confirmations the screen names them from purposes and gates. */
  label: string | null;
  purposes: WorkshopPurpose[];
  owners: string[];
  canSetDate: boolean;
  canMarkDone: boolean;
  canEdit: boolean;
}
export interface ScheduleView {
  empty: boolean;
  next: ScheduleItemView | null;
  months: { month: string; items: ScheduleItemView[] }[];
  undated: ScheduleItemView[];
  counts: Record<FormationStage, number>;
  /** "Build the schedule": the preparer, while nothing is scheduled. */
  canBuild: boolean;
  /** Adding, dating, renaming and removing: the named preparer. */
  canEdit: boolean;
  canMoveStages: boolean;
}
export interface FormationPage {
  activePlan: { title: string; label: string } | null;
  plan: null | {
    id: string; title: string; label: string; startYear: number; endYear: number;
    processOwner: { positionId: string; label: string; holder: string | null } | null;
    preparer: { membershipId: string; name: string } | null;
    published: { by: string; on: ISODate } | null;
    visionTargetOn: ISODate | null; planTargetOn: ISODate | null;
    /** When vision.confirm passed (part 11b), or null. */
    visionConfirmedOn: ISODate | null;
    stages: { stage: FormationStage; status: 'not_started' | 'open' | 'complete'; startsOn: ISODate | null; endsOn: ISODate | null }[];
  };
  canSetUp: boolean;
  /** Only the named preparer edits and publishes the calendar. */
  isPreparer: boolean;
  /** Whether this viewer sees the calendar and sessions before they are published. */
  seesDraft: boolean;
  preparerOptions: { membershipId: string; name: string; role: string }[];
  positions: { id: string; label: string; holder: string | null }[];
  deadlines: { id: string; label: string; owners: string[]; dueOn: ISODate | null; completed: boolean }[];
  schedule: ScheduleView;
  /** For choosing a group's scribe: active members. */
  members: { membershipId: string; name: string }[];
  sessions: SessionView[];
  agenda: AgendaItem[];
  /** Worth checking, for the process owner and the Strategy office only. */
  checks: FormationCheck[];
  leadership: number;
  departmentHeads: number;
  fyStartMonth: number;
  /** "Now", for what is coming up and what is overdue. */
  today: ISODate;
  /** The first year a new plan would usually start: the year after the active plan ends. */
  nextStartYear: number;
}

export interface FormationSetup { title: string; startYear: number; endYear: number; processOwnerPositionId: string | null; preparerMembershipId: string | null }
export type FormationError = 'not_allowed' | 'not_found' | 'period' | 'not_preparer' | 'stage_order' | 'dates' | 'required' | 'not_yet' | 'done' | 'not_empty' | 'held' | 'cells';
export type FormationResult<T = object> = ({ ok: true } & T) | { ok: false; error: FormationError };

export interface FormationAccess {
  page(): FormationPage;
  /** F-2: the department heads' positions, for "all department heads" as deadline owners. */
  departmentHeads(): string[];
  setUp(input: FormationSetup): FormationResult<{ id: string }>;
  moveStage(stage: FormationStage, to: 'open' | 'complete'): FormationResult;
  saveCalendar(input: { stages: Partial<Record<FormationStage, { startsOn: ISODate | null; endsOn: ISODate | null }>>; visionTargetOn: ISODate | null; planTargetOn: ISODate | null }): FormationResult;
  addDeadline(input: { label: string; ownerPositionIds: string[]; dueOn: ISODate | null; kind?: FormationDeadline['kind']; stage?: FormationStage }): FormationResult<{ id: string }>;
  /** Rename, re-date or move an item the preparer added (v1.18). */
  updateDeadline(id: string, input: { label?: string; dueOn?: ISODate | null; kind?: FormationDeadline['kind']; stage?: FormationStage }): FormationResult;
  /** Items with no record behind them, once their date has come: an owner or the Strategy office (v1.18). */
  markDeadlineDone(id: string): FormationResult;
  /** A confirmation's target date, by the preparer; null clears it. Targets only: gates never check dates. */
  setGateTarget(gate: 'vision.confirm' | 'plan.confirm', on: ISODate | null): FormationResult;
  /** "Build the schedule": the usual sequence, once, when nothing is scheduled. */
  buildSchedule(): FormationResult<{ added: number }>;
  /** Decision-log actions: closed or reopened by the person assigned or the Strategy office (v1.18). */
  setActionDone(workshopId: string, logIndex: number, actionIndex: number, done: boolean): FormationResult;
  /** v1.19: groups on a 4Q review session, set up by the Strategy office until the session is held. */
  addGroup(workshopId: string, input: { name: string; cells: FourQCell[]; scribeMembershipId: string; memberNames: string[] }): FormationResult<{ id: string }>;
  updateGroup(workshopId: string, groupId: string, input: { name?: string; cells?: FourQCell[]; scribeMembershipId?: string; memberNames?: string[] }): FormationResult;
  /** Close a group for review, or reopen it: the Strategy office, recorded with who and when. */
  setGroupClosed(workshopId: string, groupId: string, closed: boolean): FormationResult;
  removeDeadline(id: string): FormationResult;
  publishCalendar(): FormationResult;
  addSession(input: { purposes: WorkshopPurpose[]; format: Format; scheduledOn: ISODate | null; window: { opensOn: ISODate; closesOn: ISODate } | null }): FormationResult<{ id: string }>;
  applyPackage(pkg: keyof typeof PACKAGES): FormationResult<{ added: number }>;
  updateSession(id: string, input: { format?: Format; scheduledOn?: ISODate | null; window?: { opensOn: ISODate; closesOn: ISODate } | null }): FormationResult;
  markHeld(id: string): FormationResult;
  cancelSession(id: string): FormationResult;
  addDecision(id: string, input: { decision: string; actions: { text: string; ownerPositionId: string; dueOn: ISODate }[] }): FormationResult;
}

interface Ctx {
  s: Store; viewer: Viewer; now: ISODate; clock: () => ISODateTime;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  onChange?: () => void;
}

export function createFormationAccess(ctx: Ctx): FormationAccess {
  const { s, viewer, now, clock, audit } = ctx;
  const has = (r: string) => viewer.roles.includes(r as never);
  const drafts = has('strategy_office') || has('facilitator');
  const changed = () => ctx.onChange?.();
  const stamp = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const base = () => ({ orgId: s.organisation.id, created: stamp(), updated: stamp() });
  const deny = <T,>(error: FormationError = 'not_allowed'): FormationResult<T> => ({ ok: false, error });
  const key = (s.organisation.id as string).replace(/^org-/, '');
  let seq = 0;
  const nextId = (prefix: string, taken: { id: string }[]) => {
    const used = new Set(taken.map((x) => x.id));
    let id: string;
    do id = `${prefix}-${key}-${++seq}`; while (used.has(id));
    return id;
  };
  const current = () => s.assignments.filter((a) => a.from <= now && (a.to === null || a.to >= now));
  const holderOf = (pid: string) => { const a = current().find((x) => x.positionId === pid); return a ? s.people.find((p) => p.id === a.personId)?.fullName ?? null : null; };
  const unitName = (u: string) => s.units.find((x) => x.id === u)?.name ?? '';
  const labelOf = (pid: string) => {
    const p = s.positions.find((x) => x.id === pid);
    if (!p) return pid;
    return s.positions.filter((x) => x.title === p.title).length > 1 ? `${p.title}, ${unitName(p.unitId)}` : p.title;
  };
  const personOf = (mid: string) => s.people.find((p) => p.id === s.memberships.find((m) => m.id === mid)?.personId)?.fullName ?? mid;
  const plan = () => formationInProgress(s);
  const isPreparer = () => !!plan()?.calendar?.preparerMembershipId && plan()!.calendar!.preparerMembershipId === viewer.membershipId;
  const groupView = (planId: string, w: Workshop, g: WorkshopGroup): GroupView => {
    const cards = s.fourQEntries.filter((e) => e.planId === planId && e.fromGroup?.workshopId === w.id && e.fromGroup.groupId === g.id && !e.removed && e.mergedIntoId === null);
    return {
      id: g.id, name: g.name, cells: g.cells, scribe: { membershipId: g.scribeMembershipId, name: personOf(g.scribeMembershipId) }, memberNames: g.memberNames,
      closed: g.closed ? { by: personOf(g.closed.byMembershipId), on: dateInZone(g.closed.at, s.organisation.timeZone) } : null,
      toReview: cards.filter((e) => e.draft.state === 'ai_draft').length, accepted: cards.filter((e) => e.draft.state === 'accepted').length,
    };
  };
  const fyLabel = (y: number) => formatFinancialYear(y, s.organisation.financialYearStartMonth);
  /** A 4Q review session of the plan being formed, still a draft. */
  const groupSession = (id: string) => { const p = plan(); const w = s.workshops.find((x) => x.id === id && x.planId === p?.id && x.purposes.includes('four_q_review')); return w && p?.status === 'draft' ? w : null; };
  const groupInputError = (g: { name: string; cells: FourQCell[]; scribeMembershipId: string; memberNames: string[] }): FormationError | null => {
    if (!g.name.trim() || !g.cells.length || !g.scribeMembershipId) return 'required';
    if (!s.memberships.some((m) => m.id === g.scribeMembershipId && membershipActiveOn(m, now))) return 'required';
    const keys = g.cells.map((c) => `${c.band}.${c.column}`);
    if (new Set(keys).size !== keys.length || !g.cells.every((c) => CELL_KEYS.has(`${c.band}.${c.column}`))) return 'cells';
    return null;
  };
  const touch = (p: StrategicPlan, before: unknown) => { p.updated = stamp(); audit('update', { type: 'StrategicPlan', id: p.id }, before, p); };

  const office = has('strategy_office');
  const owns = (ids: readonly string[]) => ids.some((x) => viewer.positionIds.includes(x as never));
  const deadlineOf = (id: string) => s.formationDeadlines.find((x) => x.id === id && x.planId === plan()?.id) ?? null;
  const scheduleView = (p: StrategicPlan, visible: boolean): ScheduleView => {
    const ed = isPreparer() && p.status === 'draft';
    const all = visible ? schedule(s, p, now).filter((i) => i.source.type !== 'deadline' || can(s, viewer, 'view', { type: 'FormationDeadline', id: i.source.id }) || seesAllSchedule()) : [];
    const sessions = new Map(s.workshops.map((w) => [w.id as string, w]));
    const viewOf = (i: ScheduleItem): ScheduleItemView => {
      const d = i.source.type === 'deadline' ? deadlineOf(i.source.id) : null;
      const w = i.source.type === 'session' ? sessions.get(i.source.id) : undefined;
      return {
        ...i, label: d?.label ?? null, purposes: w?.purposes ?? [], owners: i.ownerPositionIds.map(labelOf),
        canSetDate: p.status === 'draft' && !i.done && (i.source.type === 'session' ? drafts && w?.format !== 'async_review' : ed),
        canMarkDone: !!d && p.status === 'draft' && mayMarkDone(d, now) && (office || owns(d.ownerPositionIds)),
        canEdit: ed && i.source.type === 'deadline',
      };
    };
    const views = all.map(viewOf);
    const nx = nextItem(all, now);
    return {
      empty: all.length === 0, next: nx ? views.find((v) => v.key === nx.key) ?? null : null,
      months: byMonth(all).map((g) => ({ month: g.month, items: g.items.map((i) => views.find((v) => v.key === i.key)!) })),
      undated: views.filter((v) => !v.date), counts: countsByStage(all),
      canBuild: ed && all.length === 0, canEdit: ed, canMoveStages: drafts && p.status === 'draft',
    };
  };
  const seesAllSchedule = () => has('executive') || drafts;

  const page = (): FormationPage => {
    const p = plan();
    const active = s.plans.find((x) => x.status === 'active');
    const seesDraft = has('executive') || drafts;
    const published = !!p?.calendar?.published;
    // Participants see the sessions they are invited to, once the calendar is published (Workshop row: owner).
    const visibleSessions = p && (seesDraft || published) ? sessionsOf(s, p.id).filter((w) => seesDraft || can(s, viewer, 'view', { type: 'Workshop', id: w.id })) : [];
    const deadlines = p && (seesDraft || published) ? s.formationDeadlines.filter((d) => d.planId === p.id && can(s, viewer, 'view', { type: 'FormationDeadline', id: d.id })) : [];
    const processOwner = p?.processOwnerPositionId ?? null;
    const isOwner = !!processOwner && viewer.positionIds.includes(processOwner as never);
    return {
      activePlan: active ? { title: active.title, label: `${fyLabel(active.startYear)} to ${fyLabel(active.endYear)}` } : null,
      plan: p && {
        id: p.id, title: p.title, label: `${fyLabel(p.startYear)} to ${fyLabel(p.endYear)}`, startYear: p.startYear, endYear: p.endYear,
        processOwner: processOwner ? { positionId: processOwner, label: labelOf(processOwner), holder: holderOf(processOwner) } : null,
        preparer: p.calendar?.preparerMembershipId ? { membershipId: p.calendar.preparerMembershipId, name: personOf(p.calendar.preparerMembershipId) } : null,
        published: p.calendar?.published ? { by: personOf(p.calendar.published.byMembershipId), on: dateInZone(p.calendar.published.at, s.organisation.timeZone) } : null,
        visionTargetOn: p.calendar?.visionTargetOn ?? null, planTargetOn: p.calendar?.planTargetOn ?? null,
        visionConfirmedOn: ((c) => (c ? dateInZone(c.at, s.organisation.timeZone) : null))(s.visionStatements.find((v) => v.planId === p.id && v.kind === 'vision')?.confirmation),
        stages: STAGES.map((st) => ({ stage: st, status: p.formation?.[st]?.status ?? 'not_started', startsOn: p.formation?.[st]?.startsOn ?? null, endsOn: p.formation?.[st]?.endsOn ?? null })),
      },
      canSetUp: drafts,
      isPreparer: isPreparer(),
      seesDraft,
      preparerOptions: s.memberships
        .filter((m) => membershipActiveOn(m, now) && (m.roles.includes('strategy_office') || m.roles.includes('facilitator')))
        .map((m) => ({ membershipId: m.id, name: personOf(m.id), role: m.roles.includes('strategy_office') ? en.assignedRole.strategy_office : en.assignedRole.facilitator })),
      positions: s.positions.map((x) => ({ id: x.id, label: labelOf(x.id), holder: holderOf(x.id) })),
      deadlines: deadlines.map((d) => ({ id: d.id, label: d.label, owners: d.ownerPositionIds.map(labelOf), dueOn: d.dueOn, completed: !!d.completed })).sort((a, b) => ((a.dueOn ?? '9999') < (b.dueOn ?? '9999') ? -1 : 1)),
      schedule: p ? scheduleView(p, seesDraft || published) : { empty: true, next: null, months: [], undated: [], counts: countsByStage([]), canBuild: false, canEdit: false, canMoveStages: false },
      members: s.memberships.filter((m) => membershipActiveOn(m, now)).map((m) => ({ membershipId: m.id, name: personOf(m.id) })).sort((a, b) => a.name.localeCompare(b.name)),
      sessions: visibleSessions.map((w) => ({
        id: w.id, purposes: w.purposes, format: w.format, scheduledOn: w.scheduledOn, window: w.window, status: w.status, participants: w.participantPositionIds.length,
        decisionLog: w.decisionLog.map((l, li) => ({
          decision: l.decision,
          actions: l.actions.map((a, ai) => ({
            logIndex: li, actionIndex: ai, text: a.text, owner: labelOf(a.ownerPositionId), dueOn: a.dueOn,
            done: a.done ? { by: personOf(a.done.byMembershipId), on: dateInZone(a.done.at, s.organisation.timeZone) } : null,
            canClose: w.status === 'held' && (office || viewer.positionIds.includes(a.ownerPositionId)),
          })),
        })),
        groups: (w.groups ?? []).map((g) => groupView(p!.id, w, g)),
        canManageGroups: office && w.purposes.includes('four_q_review') && w.status === 'planned' && p!.status === 'draft',
        canCloseGroups: office && w.purposes.includes('four_q_review') && p!.status === 'draft',
      })).sort((a, b) => ((a.scheduledOn ?? a.window?.opensOn ?? '9999') < (b.scheduledOn ?? b.window?.opensOn ?? '9999') ? -1 : 1)),
      agenda: p && (seesDraft || published) ? agenda(s, p) : [],
      checks: p && (isOwner || drafts) ? formationChecks(s, p) : [],
      leadership: leadershipPositions(s, now).length,
      departmentHeads: departmentHeadPositions(s).length,
      fyStartMonth: s.organisation.financialYearStartMonth,
      today: now,
      nextStartYear: active ? active.endYear + 1 : Number(now.slice(0, 4)) + 1,
    };
  };

  return {
    page,
    departmentHeads: () => departmentHeadPositions(s),

    setUp(input) {
      if (!drafts) return deny();
      if (input.endYear < input.startYear) return deny('period');
      const existing = plan();
      if (existing) {
        const before = structuredClone(existing);
        Object.assign(existing, {
          title: input.title.trim() || existing.title, startYear: input.startYear, endYear: input.endYear,
          processOwnerPositionId: input.processOwnerPositionId as Id<'Position'> | null,
          calendar: { ...(existing.calendar ?? { published: null, visionTargetOn: null, planTargetOn: null }), preparerMembershipId: input.preparerMembershipId as Id<'Membership'> | null },
        });
        touch(existing, before);
        changed();
        return { ok: true, id: existing.id };
      }
      const p: StrategicPlan = {
        ...base(), id: nextId('plan', s.plans) as Id<'StrategicPlan'>, title: input.title.trim() || en.formation.setup.titleFor(input.startYear, input.endYear),
        startYear: input.startYear, endYear: input.endYear, entryDoor: 'formed', status: 'draft', confirmation: null, boardApproval: null,
        formation: Object.fromEntries(STAGES.map((st) => [st, { status: 'not_started', startsOn: null, endsOn: null, ownerPositionId: null }])) as NonNullable<StrategicPlan['formation']>,
        processOwnerPositionId: input.processOwnerPositionId as Id<'Position'> | null,
        calendar: { preparerMembershipId: input.preparerMembershipId as Id<'Membership'> | null, published: null, visionTargetOn: null, planTargetOn: null },
        currentRevision: 0,
      };
      s.plans.push(p);
      audit('create', { type: 'StrategicPlan', id: p.id }, null, p);
      changed();
      return { ok: true, id: p.id };
    },

    moveStage(stage, to) {
      const p = plan();
      if (!drafts) return deny();
      if (!p?.formation) return deny('not_found');
      const f = p.formation[stage];
      if (!canMoveStage(f.status, to)) return deny('stage_order');
      const before = structuredClone(p);
      f.status = to;
      touch(p, before);
      changed();
      return { ok: true };
    },

    saveCalendar(input) {
      const p = plan();
      if (!p?.formation || !p.calendar) return deny('not_found');
      if (!isPreparer()) return deny('not_preparer');
      for (const [, v] of Object.entries(input.stages)) if (v?.startsOn && v.endsOn && v.endsOn < v.startsOn) return deny('dates');
      const before = structuredClone(p);
      for (const st of STAGES) {
        const v = input.stages[st];
        if (v) Object.assign(p.formation[st], { startsOn: v.startsOn, endsOn: v.endsOn });
      }
      p.calendar.visionTargetOn = input.visionTargetOn;
      p.calendar.planTargetOn = input.planTargetOn;
      touch(p, before);
      changed();
      return { ok: true };
    },

    addDeadline(input) {
      const p = plan();
      if (!p) return deny('not_found');
      if (!isPreparer()) return deny('not_preparer');
      if (!input.label.trim() || !input.ownerPositionIds.length) return deny('required');
      const d: FormationDeadline = {
        ...base(), id: nextId('fd', s.formationDeadlines) as Id<'FormationDeadline'>, planId: p.id, label: input.label.trim(), ownerPositionIds: input.ownerPositionIds as Id<'Position'>[],
        dueOn: input.dueOn || null, completed: null, stage: input.stage ?? 'conception', kind: input.kind ?? 'milestone', doneWhen: null,
      };
      s.formationDeadlines.push(d);
      audit('create', { type: 'FormationDeadline', id: d.id }, null, d);
      changed();
      return { ok: true, id: d.id };
    },

    removeDeadline(id) {
      if (!isPreparer()) return deny('not_preparer');
      const d = s.formationDeadlines.find((x) => x.id === id && x.planId === plan()?.id);
      if (!d) return deny('not_found');
      s.formationDeadlines.splice(s.formationDeadlines.indexOf(d), 1);
      audit('remove', { type: 'FormationDeadline', id }, d, null);
      changed();
      return { ok: true };
    },

    updateDeadline(id, input) {
      if (!isPreparer()) return deny('not_preparer');
      const d = deadlineOf(id);
      if (!d) return deny('not_found');
      if (input.label !== undefined && !input.label.trim()) return deny('required');
      const before = structuredClone(d);
      if (input.label !== undefined) d.label = input.label.trim();
      if (input.dueOn !== undefined) d.dueOn = input.dueOn || null;
      if (input.kind) d.kind = input.kind;
      if (input.stage) d.stage = input.stage;
      d.updated = stamp();
      audit('update', { type: 'FormationDeadline', id }, before, structuredClone(d));
      changed();
      return { ok: true };
    },

    markDeadlineDone(id) {
      const d = deadlineOf(id);
      if (!d) return deny('not_found');
      if (!(office || owns(d.ownerPositionIds))) return deny();
      if (d.doneWhen !== null || d.completed) return deny('done');
      if (!mayMarkDone(d, now)) return deny('not_yet');
      const before = structuredClone(d);
      d.completed = stamp();
      d.updated = stamp();
      audit('complete', { type: 'FormationDeadline', id }, before, structuredClone(d));
      changed();
      return { ok: true };
    },

    setGateTarget(gate, on) {
      const p = plan();
      if (!p?.calendar) return deny('not_found');
      if (!isPreparer()) return deny('not_preparer');
      const before = structuredClone(p);
      if (gate === 'vision.confirm') p.calendar.visionTargetOn = on; else p.calendar.planTargetOn = on;
      touch(p, before);
      changed();
      return { ok: true };
    },

    buildSchedule() {
      const p = plan();
      if (!p || p.status !== 'draft') return deny('not_found');
      if (!isPreparer()) return deny('not_preparer');
      if (schedule(s, p, now).length) return deny('not_empty');
      const fallback = p.processOwnerPositionId ? [p.processOwnerPositionId as string] : leadershipPositions(s, now);
      let added = 0;
      for (const x of starterSchedule(s.organisation.settings.boardApprovalRequired.plan)) {
        if (x.type === 'session') {
          if (packageAdds(s.workshops.filter((w) => w.planId === p.id), 'standard').some((a) => a.purposes.includes(x.purpose))) {
            const r = this.addSession({ purposes: [x.purpose], format: 'in_person', scheduledOn: null, window: null });
            if (r.ok) added++;
          }
          continue;
        }
        const owners = starterOwners(s, x.label, now, fallback);
        if (!owners.length) continue;
        const d: FormationDeadline = {
          ...base(), id: nextId('fd', s.formationDeadlines) as Id<'FormationDeadline'>, planId: p.id, label: en.formation.schedule.starter[x.label], ownerPositionIds: owners as Id<'Position'>[],
          dueOn: null, completed: null, stage: x.stage, kind: x.kind, doneWhen: x.doneWhen,
        };
        s.formationDeadlines.push(d);
        audit('create', { type: 'FormationDeadline', id: d.id }, null, d);
        added++;
      }
      changed();
      return { ok: true, added };
    },

    setActionDone(workshopId, logIndex, actionIndex, done) {
      const w = s.workshops.find((x) => x.id === workshopId && x.planId === plan()?.id);
      const a = w?.decisionLog[logIndex]?.actions[actionIndex];
      if (!w || !a) return deny('not_found');
      if (w.status !== 'held') return deny('not_yet');
      if (!(office || viewer.positionIds.includes(a.ownerPositionId))) return deny();
      if (!!a.done === done) return deny('done');
      const before = structuredClone(a);
      a.done = done ? stamp() : null;
      w.updated = stamp();
      audit(done ? 'action.done' : 'action.reopen', { type: 'Workshop', id: w.id }, { logIndex, actionIndex, action: before }, { logIndex, actionIndex, action: structuredClone(a) });
      changed();
      return { ok: true };
    },

    addGroup(workshopId, input) {
      const w = groupSession(workshopId);
      if (!office) return deny();
      if (!w) return deny('not_found');
      if (w.status !== 'planned') return deny('held');
      const err = groupInputError(input);
      if (err) return deny(err);
      const before = structuredClone(w);
      const used = new Set((w.groups ?? []).map((g) => g.id));
      let n = (w.groups ?? []).length + 1;
      while (used.has(`g${n}`)) n++;
      const g: WorkshopGroup = { id: `g${n}`, name: input.name.trim(), cells: input.cells.map((c) => ({ ...c }) as FourQCell), scribeMembershipId: input.scribeMembershipId as Id<'Membership'>, memberNames: input.memberNames.map((x) => x.trim()).filter(Boolean), closed: null };
      w.groups = [...(w.groups ?? []), g];
      w.updated = stamp();
      audit('update', { type: 'Workshop', id: w.id }, before, structuredClone(w));
      changed();
      return { ok: true, id: g.id };
    },

    updateGroup(workshopId, groupId, input) {
      const w = groupSession(workshopId);
      if (!office) return deny();
      const g = w?.groups?.find((x) => x.id === groupId);
      if (!w || !g) return deny('not_found');
      if (w.status !== 'planned') return deny('held');
      const err = groupInputError({ name: input.name ?? g.name, cells: input.cells ?? g.cells, scribeMembershipId: input.scribeMembershipId ?? g.scribeMembershipId, memberNames: input.memberNames ?? g.memberNames });
      if (err) return deny(err);
      const before = structuredClone(w);
      if (input.name !== undefined) g.name = input.name.trim();
      if (input.cells) g.cells = input.cells.map((c) => ({ ...c }) as FourQCell);
      if (input.scribeMembershipId) g.scribeMembershipId = input.scribeMembershipId as Id<'Membership'>;
      if (input.memberNames) g.memberNames = input.memberNames.map((x) => x.trim()).filter(Boolean);
      w.updated = stamp();
      audit('update', { type: 'Workshop', id: w.id }, before, structuredClone(w));
      changed();
      return { ok: true };
    },

    setGroupClosed(workshopId, groupId, closed) {
      const w = groupSession(workshopId);
      if (!office) return deny();
      const g = w?.groups?.find((x) => x.id === groupId);
      if (!w || !g) return deny('not_found');
      if (!!g.closed === closed) return deny('done');
      const before = structuredClone(g);
      g.closed = closed ? stamp() : null;
      w.updated = stamp(); // reopening does not change the session's status
      audit(closed ? 'group.close' : 'group.reopen', { type: 'Workshop', id: w.id }, { group: before }, { group: structuredClone(g) });
      changed();
      return { ok: true };
    },

    publishCalendar() {
      const p = plan();
      if (!p?.calendar) return deny('not_found');
      if (!isPreparer()) return deny('not_preparer');
      const before = structuredClone(p);
      p.calendar.published = stamp(); // republishing records the latest publication
      touch(p, before);
      audit('publish', { type: 'StrategicPlan', id: p.id }, null, { calendar: p.calendar });
      changed();
      return { ok: true };
    },

    addSession(input) {
      const p = plan();
      if (!drafts) return deny();
      if (!p) return deny('not_found');
      if (!input.purposes.length) return deny('required');
      if (input.window && input.window.closesOn < input.window.opensOn) return deny('dates');
      const w: Workshop = {
        ...base(), id: nextId('ws', s.workshops) as Id<'Workshop'>, planId: p.id, purposes: [...input.purposes], format: input.format,
        scheduledOn: input.format === 'async_review' ? null : input.scheduledOn, window: input.format === 'async_review' ? input.window : null,
        participantPositionIds: defaultParticipants(s, input.purposes, now) as Id<'Position'>[], recordingRef: null, status: 'planned', decisionLog: [],
      };
      s.workshops.push(w);
      audit('create', { type: 'Workshop', id: w.id }, null, w);
      changed();
      return { ok: true, id: w.id };
    },

    applyPackage(pkg) {
      const p = plan();
      if (!drafts) return deny();
      if (!p) return deny('not_found');
      const adds = packageAdds(s.workshops.filter((w) => w.planId === p.id), pkg);
      for (const a of adds) this.addSession({ purposes: a.purposes, format: a.format, scheduledOn: null, window: null });
      return { ok: true, added: adds.length };
    },

    updateSession(id, input) {
      if (!drafts) return deny();
      const w = s.workshops.find((x) => x.id === id && x.planId === plan()?.id);
      if (!w || w.status !== 'planned') return deny('not_found');
      const before = structuredClone(w);
      if (input.format) w.format = input.format;
      if (input.scheduledOn !== undefined) w.scheduledOn = input.scheduledOn;
      if (input.window !== undefined) {
        if (input.window && input.window.closesOn < input.window.opensOn) return deny('dates');
        w.window = input.window;
      }
      if (w.format === 'async_review') w.scheduledOn = null; else w.window = null;
      w.updated = stamp();
      audit('update', { type: 'Workshop', id }, before, w);
      changed();
      return { ok: true };
    },

    markHeld(id) {
      if (!drafts) return deny();
      const w = s.workshops.find((x) => x.id === id && x.planId === plan()?.id);
      if (!w || w.status !== 'planned') return deny('not_found');
      const before = structuredClone(w);
      w.status = 'held';
      w.updated = stamp();
      audit('update', { type: 'Workshop', id }, before, w);
      changed();
      return { ok: true };
    },

    cancelSession(id) {
      if (!drafts) return deny();
      const w = s.workshops.find((x) => x.id === id && x.planId === plan()?.id);
      if (!w || w.status !== 'planned') return deny('not_found');
      const before = structuredClone(w);
      w.status = 'cancelled';
      w.updated = stamp();
      audit('update', { type: 'Workshop', id }, before, w);
      changed();
      return { ok: true };
    },

    addDecision(id, input) {
      if (!drafts) return deny();
      const w = s.workshops.find((x) => x.id === id && x.planId === plan()?.id);
      if (!w || w.status === 'cancelled') return deny('not_found');
      if (!input.decision.trim() || input.actions.some((a) => !a.text.trim() || !a.ownerPositionId || !a.dueOn)) return deny('required');
      const before = structuredClone(w);
      w.decisionLog.push({ decision: input.decision.trim(), actions: input.actions.map((a) => ({ text: a.text.trim(), ownerPositionId: a.ownerPositionId as Id<'Position'>, dueOn: a.dueOn, done: null })) });
      w.updated = stamp();
      audit('update', { type: 'Workshop', id }, before, w);
      changed();
      return { ok: true };
    },
  };
}
