/**
 * The forming schedule (Forming Schedule Specification v0.1; contract v1.18). Pure: records in, results out; "now" is
 * passed in. Every status is computed: where a record already says something has happened (a session held, every
 * department's sheet submitted, the consultation closed, a confirmation passed), the schedule reads it, so it needs no
 * click and can never disagree with the record. Anything else is marked done by its owner or the Strategy office.
 */
import type { FormationDeadline, FormationStage, ISODate, StrategicPlan, Workshop, WorkshopPurpose } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { departments, submissionOf } from './conception';
import { leadershipPositions, sessionDate, sessionsOf, STAGES } from './formation';
import { membershipActiveOn } from './access';

/** The stage a session sits in, from its first purpose. Confirmation is where the vision is settled. */
export const STAGE_OF_PURPOSE: Record<WorkshopPurpose, FormationStage> = {
  kickoff: 'conception', four_q_review: 'conception', vision: 'confirmation', composition: 'composition', validation: 'composition', launch: 'communication',
};
export const stageOfSession = (w: Pick<Workshop, 'purposes'>): FormationStage => STAGE_OF_PURPOSE[w.purposes[0] ?? 'kickoff'];

export type ScheduleGate = 'vision.confirm' | 'plan.confirm';
export type ScheduleSource = { type: 'session'; id: string } | { type: 'deadline'; id: string } | { type: 'gate'; gate: ScheduleGate };
export type ScheduleStatus = 'done' | 'today' | 'soon' | 'overdue' | null;

export interface ScheduleItem {
  key: string;
  source: ScheduleSource;
  kind: 'meeting' | 'milestone' | 'confirmation';
  stage: FormationStage;
  date: ISODate | null;
  /** Owners by position; empty for sessions (the Strategy office) and confirmations (the Executive). */
  ownerPositionIds: string[];
  done: boolean;
  /** How done is known: from a record (computed), by hand (marked), or not yet. */
  doneBy: 'record' | 'hand' | null;
  /** What a computed item reads; null when it is marked by hand. */
  linked: 'session' | 'department_sheets' | 'consultation' | 'gate' | null;
  /** Plan confirmation when the organisation requires the board's resolution. */
  needsBoard: boolean;
  status: ScheduleStatus;
  /** Days from "now" to the date (negative when past), or null when undated. */
  inDays: number | null;
}

const dayDiff = (from: ISODate, to: ISODate) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Status against "now": Done, Today, In n days (within a week), Overdue, or nothing. */
export function statusOf(done: boolean, date: ISODate | null, now: ISODate): { status: ScheduleStatus; inDays: number | null } {
  const inDays = date ? dayDiff(now, date) : null;
  if (done) return { status: 'done', inDays };
  if (inDays === null) return { status: null, inDays };
  if (inDays < 0) return { status: 'overdue', inDays };
  if (inDays === 0) return { status: 'today', inDays };
  return { status: inDays <= 7 ? 'soon' : null, inDays };
}

/** "Department sheets due": every department has submitted its 4Q sheet (and there is at least one). */
export function sheetsAllSubmitted(s: Store, planId: string): boolean {
  const ds = departments(s);
  return ds.length > 0 && ds.every((d) => !!submissionOf(s, planId, d.unitId));
}
/** "Consultation closes": the plan's consultation round is closed (every round, when there is more than one). */
export function consultationClosed(s: Store, planId: string): boolean {
  const rounds = s.consultationRounds.filter((r) => r.planId === planId);
  return rounds.length > 0 && rounds.every((r) => r.status === 'closed');
}
export const gatePassed = (s: Store, planId: string, gate: ScheduleGate) =>
  s.gateEvents.some((g) => g.gate === gate && g.subject.type === 'StrategicPlan' && g.subject.id === planId && g.outcome === 'passed');

/** Whether a deadline is done: computed from its record when it has one, otherwise marked by hand. */
export function deadlineDone(s: Store, d: FormationDeadline): { done: boolean; doneBy: 'record' | 'hand' | null } {
  if (d.doneWhen === 'department_sheets_submitted') return sheetsAllSubmitted(s, d.planId) ? { done: true, doneBy: 'record' } : { done: false, doneBy: null };
  if (d.doneWhen === 'consultation_closed') return consultationClosed(s, d.planId) ? { done: true, doneBy: 'record' } : { done: false, doneBy: null };
  return d.completed ? { done: true, doneBy: 'hand' } : { done: false, doneBy: null };
}

/** Whether a deadline may be marked done by hand: no record behind it, not yet done, and its date has come. */
export const mayMarkDone = (d: FormationDeadline, now: ISODate) => d.doneWhen === null && !d.completed && d.dueOn !== null && d.dueOn <= now;

/** Every item in the schedule, dated ones first in date order, then those not yet scheduled. */
export function schedule(s: Store, plan: StrategicPlan, now: ISODate): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  for (const w of sessionsOf(s, plan.id)) {
    const done = w.status === 'held';
    out.push({ key: `session:${w.id}`, source: { type: 'session', id: w.id }, kind: 'meeting', stage: stageOfSession(w), date: sessionDate(w), ownerPositionIds: [], done, doneBy: done ? 'record' : null, linked: 'session', needsBoard: false, ...statusOf(done, sessionDate(w), now) });
  }
  for (const d of s.formationDeadlines.filter((x) => x.planId === plan.id)) {
    const r = deadlineDone(s, d);
    out.push({ key: `deadline:${d.id}`, source: { type: 'deadline', id: d.id }, kind: d.kind, stage: d.stage, date: d.dueOn, ownerPositionIds: d.ownerPositionIds, done: r.done, doneBy: r.doneBy, linked: d.doneWhen === 'department_sheets_submitted' ? 'department_sheets' : d.doneWhen === 'consultation_closed' ? 'consultation' : null, needsBoard: false, ...statusOf(r.done, d.dueOn, now) });
  }
  // The two confirmations are always part of a schedule that has anything in it, dated by their targets.
  if (out.length || plan.calendar?.visionTargetOn || plan.calendar?.planTargetOn) {
    for (const gate of ['vision.confirm', 'plan.confirm'] as const) {
      const date = (gate === 'vision.confirm' ? plan.calendar?.visionTargetOn : plan.calendar?.planTargetOn) ?? null;
      const done = gatePassed(s, plan.id, gate);
      out.push({
        key: `gate:${gate}`, source: { type: 'gate', gate }, kind: 'confirmation', stage: gate === 'vision.confirm' ? 'confirmation' : 'composition', date, ownerPositionIds: [], done,
        doneBy: done ? 'record' : null, linked: 'gate', needsBoard: gate === 'plan.confirm' && s.organisation.settings.boardApprovalRequired.plan, ...statusOf(done, date, now),
      });
    }
  }
  const dated = out.filter((i) => i.date).sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : a.key < b.key ? -1 : 1));
  return [...dated, ...out.filter((i) => !i.date)];
}

/** The next item not yet done, from today on. */
export const nextItem = (items: ScheduleItem[], now: ISODate) => items.find((i) => i.date && !i.done && i.date >= now) ?? null;

/** Items grouped by month (YYYY-MM), oldest first; undated items are left out. */
export function byMonth(items: ScheduleItem[]): { month: string; items: ScheduleItem[] }[] {
  const out: { month: string; items: ScheduleItem[] }[] = [];
  for (const i of items) {
    if (!i.date) continue;
    const m = i.date.slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.month === m) last.items.push(i);
    else out.push({ month: m, items: [i] });
  }
  return out;
}

/** How many schedule items each stage has, for the stage strip. */
export const countsByStage = (items: ScheduleItem[]) => Object.fromEntries(STAGES.map((st) => [st, items.filter((i) => i.stage === st).length])) as Record<FormationStage, number>;

/**
 * "Build the schedule": the usual sequence, offered once when nothing is scheduled. Plain, generic names; no framework
 * text. Every item is undated; the preparer dates, renames or removes them. Sessions are added only for purposes no
 * session covers; the two confirmations are always part of a schedule and need no item.
 */
export type StarterItem =
  | { type: 'deadline'; label: 'sheets' | 'consultation' | 'closes' | 'board'; kind: FormationDeadline['kind']; stage: FormationStage; doneWhen: FormationDeadline['doneWhen'] }
  | { type: 'session'; purpose: WorkshopPurpose };
export function starterSchedule(boardRequired: boolean): StarterItem[] {
  return [
    { type: 'deadline', label: 'sheets', kind: 'milestone', stage: 'conception', doneWhen: 'department_sheets_submitted' },
    { type: 'session', purpose: 'four_q_review' },
    { type: 'deadline', label: 'consultation', kind: 'meeting', stage: 'consultation', doneWhen: null },
    { type: 'deadline', label: 'closes', kind: 'milestone', stage: 'consultation', doneWhen: 'consultation_closed' },
    { type: 'session', purpose: 'composition' },
    ...(boardRequired ? [{ type: 'deadline' as const, label: 'board' as const, kind: 'meeting' as const, stage: 'composition' as const, doneWhen: null }] : []),
    { type: 'session', purpose: 'launch' },
  ];
}

/** Owners for the starter items: department heads for their sheets, leadership for the board, otherwise the Strategy office's positions. */
export function starterOwners(s: Store, label: 'sheets' | 'consultation' | 'closes' | 'board', now: ISODate, fallback: string[]): string[] {
  const current = s.assignments.filter((a) => a.from <= now && (a.to === null || a.to >= now));
  const office = [...new Set(s.memberships.filter((m) => membershipActiveOn(m, now) && m.roles.includes('strategy_office')).flatMap((m) => current.filter((a) => a.personId === m.personId).map((a) => a.positionId as string)))];
  if (label === 'sheets') { const heads = departments(s).map((d) => d.headPositionId).filter((p): p is string => !!p); if (heads.length) return heads; }
  if (label === 'board') { const lead = leadershipPositions(s, now); if (lead.length) return lead; }
  return office.length ? office : fallback;
}
