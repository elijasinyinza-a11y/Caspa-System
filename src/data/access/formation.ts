/**
 * Strategy formation, part 11a, through the data-access layer: setting up a formed plan, its stages, the
 * preparer-built calendar and its sessions with decision logs. Permissions follow the matrix: the Strategy office or
 * a facilitator sets up the plan and plans sessions (F-1); only the named preparer edits and publishes the calendar;
 * nothing reaches participants until it is published.
 */
import type { AuditEntry, FormationDeadline, FormationStage, Id, ISODate, ISODateTime, StrategicPlan, Workshop, WorkshopPurpose } from '../../contract/caspa-data-contract';
import {
  agenda, canMoveStage, defaultParticipants, departmentHeadPositions, formationChecks, formingPlan, leadershipPositions, packageAdds, PACKAGES, sessionsOf, STAGES,
  type AgendaItem, type FormationCheck, type Format,
} from '../../rules/formation';
import { dateInZone, formatFinancialYear } from '../../selectors/format';
import { en } from '../../strings/en';
import { can } from './permissions';
import type { Store } from './store';
import type { Viewer } from './viewer';

export interface SessionView {
  id: string; purposes: WorkshopPurpose[]; format: Format; scheduledOn: ISODate | null; window: { opensOn: ISODate; closesOn: ISODate } | null;
  status: Workshop['status']; participants: number;
  decisionLog: { decision: string; actions: { text: string; owner: string; dueOn: ISODate }[] }[];
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
  deadlines: { id: string; label: string; owners: string[]; dueOn: ISODate; completed: boolean }[];
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
export type FormationError = 'not_allowed' | 'not_found' | 'period' | 'not_preparer' | 'stage_order' | 'dates' | 'required';
export type FormationResult<T = object> = ({ ok: true } & T) | { ok: false; error: FormationError };

export interface FormationAccess {
  page(): FormationPage;
  /** F-2: the department heads' positions, for "all department heads" as deadline owners. */
  departmentHeads(): string[];
  setUp(input: FormationSetup): FormationResult<{ id: string }>;
  moveStage(stage: FormationStage, to: 'open' | 'complete'): FormationResult;
  saveCalendar(input: { stages: Partial<Record<FormationStage, { startsOn: ISODate | null; endsOn: ISODate | null }>>; visionTargetOn: ISODate | null; planTargetOn: ISODate | null }): FormationResult;
  addDeadline(input: { label: string; ownerPositionIds: string[]; dueOn: ISODate }): FormationResult<{ id: string }>;
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
  const plan = () => formingPlan(s);
  const isPreparer = () => !!plan()?.calendar?.preparerMembershipId && plan()!.calendar!.preparerMembershipId === viewer.membershipId;
  const fyLabel = (y: number) => formatFinancialYear(y, s.organisation.financialYearStartMonth);
  const touch = (p: StrategicPlan, before: unknown) => { p.updated = stamp(); audit('update', { type: 'StrategicPlan', id: p.id }, before, p); };

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
        .filter((m) => m.status === 'active' && (m.roles.includes('strategy_office') || m.roles.includes('facilitator')))
        .map((m) => ({ membershipId: m.id, name: personOf(m.id), role: m.roles.includes('strategy_office') ? en.assignedRole.strategy_office : en.assignedRole.facilitator })),
      positions: s.positions.map((x) => ({ id: x.id, label: labelOf(x.id), holder: holderOf(x.id) })),
      deadlines: deadlines.map((d) => ({ id: d.id, label: d.label, owners: d.ownerPositionIds.map(labelOf), dueOn: d.dueOn, completed: !!d.completed })).sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1)),
      sessions: visibleSessions.map((w) => ({
        id: w.id, purposes: w.purposes, format: w.format, scheduledOn: w.scheduledOn, window: w.window, status: w.status, participants: w.participantPositionIds.length,
        decisionLog: w.decisionLog.map((l) => ({ decision: l.decision, actions: l.actions.map((a) => ({ text: a.text, owner: labelOf(a.ownerPositionId), dueOn: a.dueOn })) })),
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
      if (!input.label.trim() || !input.ownerPositionIds.length || !input.dueOn) return deny('required');
      const d: FormationDeadline = { ...base(), id: nextId('fd', s.formationDeadlines) as Id<'FormationDeadline'>, planId: p.id, label: input.label.trim(), ownerPositionIds: input.ownerPositionIds as Id<'Position'>[], dueOn: input.dueOn, completed: null };
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
      w.decisionLog.push({ decision: input.decision.trim(), actions: input.actions.map((a) => ({ text: a.text.trim(), ownerPositionId: a.ownerPositionId as Id<'Position'>, dueOn: a.dueOn })) });
      w.updated = stamp();
      audit('update', { type: 'Workshop', id }, before, w);
      changed();
      return { ok: true };
    },
  };
}
