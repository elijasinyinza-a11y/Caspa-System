/**
 * Strategy formation, part 11a: the calendar and sessions (Strategy Formation Specification v1.0, "Workshops",
 * "Formation calendar", "Sessions"; BUILD-BRIEF section 30). Pure: records in, results out. No clock.
 */
import type { FormationStage, ISODate, StrategicPlan, Workshop, WorkshopPurpose } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { accountablePositionOfUnit } from './structure';

export const STAGES: FormationStage[] = ['conception', 'consultation', 'confirmation', 'composition', 'communication'];
export const PURPOSES: WorkshopPurpose[] = ['kickoff', 'four_q_review', 'vision', 'composition', 'validation', 'launch'];
export type Format = Workshop['format'];

/** The example packages (specification, "Example packages"; prototype). Sessions as purposes and format. */
export const PACKAGES: Record<'standard' | 'lean' | 'remote', { purposes: WorkshopPurpose[]; format: Format }[]> = {
  standard: PURPOSES.map((p) => ({ purposes: [p], format: 'in_person' as const })),
  lean: [
    { purposes: ['kickoff'], format: 'online' }, { purposes: ['four_q_review', 'vision'], format: 'in_person' },
    { purposes: ['composition', 'validation'], format: 'in_person' }, { purposes: ['launch'], format: 'online' },
  ],
  remote: [
    { purposes: ['kickoff'], format: 'online' }, { purposes: ['four_q_review'], format: 'async_review' }, { purposes: ['vision'], format: 'online' },
    { purposes: ['composition'], format: 'async_review' }, { purposes: ['validation'], format: 'online' }, { purposes: ['launch'], format: 'online' },
  ],
};

const current = (s: Store, now: ISODate) => s.assignments.filter((a) => a.from <= now && (a.to === null || a.to >= now));

/** F-2: department heads are whoever answers for each unit directly below the top unit (vacant posts included). */
export function departmentHeadPositions(s: Store): string[] {
  const top = s.units.filter((u) => !u.parentId);
  const below = s.units.filter((u) => u.parentId && top.some((t) => t.id === u.parentId));
  return [...new Set(below.map((u) => accountablePositionOfUnit(s, u.id)).filter((p): p is NonNullable<typeof p> => !!p).map(String))];
}

/** Leadership: the positions held by people with the Executive role. */
export function leadershipPositions(s: Store, now: ISODate): string[] {
  const execs = new Set(s.memberships.filter((m) => m.status === 'active' && m.roles.includes('executive')).map((m) => m.personId as string));
  return [...new Set(current(s, now).filter((a) => execs.has(a.personId)).map((a) => a.positionId as string))];
}

/**
 * Who a session usually involves (specification, "Sessions"): leadership only for vision and validation, all staff
 * for launch, leadership and department heads otherwise. Merged sessions take the union.
 */
export function defaultParticipants(s: Store, purposes: WorkshopPurpose[], now: ISODate): string[] {
  const lead = leadershipPositions(s, now);
  const heads = departmentHeadPositions(s);
  const out = new Set<string>();
  for (const p of purposes) {
    if (p === 'launch') s.positions.forEach((x) => out.add(x.id));
    else if (p === 'vision' || p === 'validation') lead.forEach((x) => out.add(x));
    else [...lead, ...heads].forEach((x) => out.add(x));
  }
  return [...out];
}

/** Packages add sessions only for purposes not yet covered by a session that is not cancelled. */
export function packageAdds(existing: Workshop[], pkg: keyof typeof PACKAGES): { purposes: WorkshopPurpose[]; format: Format }[] {
  const covered = new Set(existing.filter((w) => w.status !== 'cancelled').flatMap((w) => w.purposes));
  return PACKAGES[pkg].filter((x) => !x.purposes.some((p) => covered.has(p)));
}

export const sessionsOf = (s: Store, planId: string) => s.workshops.filter((w) => w.planId === planId && w.status !== 'cancelled');
export const deadlinesOf = (s: Store, planId: string) => s.formationDeadlines.filter((d) => d.planId === planId);

/** The date a session sits on in the agenda: its day, or the day its review window opens. */
export const sessionDate = (w: Workshop): ISODate | null => w.scheduledOn ?? w.window?.opensOn ?? null;

export type AgendaItem =
  | { kind: 'stage_opens' | 'stage_closes'; date: ISODate; stage: FormationStage }
  | { kind: 'session'; date: ISODate; workshopId: string; purposes: WorkshopPurpose[]; format: Format }
  | { kind: 'deadline'; date: ISODate; deadlineId: string; label: string; ownerPositionIds: string[] }
  | { kind: 'gate_target'; date: ISODate; gate: 'vision.confirm' | 'plan.confirm' };

/** Everything dated in the formation calendar, in date order (prototype "Agenda"). */
export function agenda(s: Store, plan: StrategicPlan): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const st of STAGES) {
    const f = plan.formation?.[st];
    if (f?.startsOn) out.push({ kind: 'stage_opens', date: f.startsOn, stage: st });
    if (f?.endsOn) out.push({ kind: 'stage_closes', date: f.endsOn, stage: st });
  }
  for (const w of sessionsOf(s, plan.id)) {
    const d = sessionDate(w);
    if (d) out.push({ kind: 'session', date: d, workshopId: w.id, purposes: w.purposes, format: w.format });
  }
  for (const d of deadlinesOf(s, plan.id)) out.push({ kind: 'deadline', date: d.dueOn, deadlineId: d.id, label: d.label, ownerPositionIds: d.ownerPositionIds });
  if (plan.calendar?.visionTargetOn) out.push({ kind: 'gate_target', date: plan.calendar.visionTargetOn, gate: 'vision.confirm' });
  if (plan.calendar?.planTargetOn) out.push({ kind: 'gate_target', date: plan.calendar.planTargetOn, gate: 'plan.confirm' });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * What is worth checking about the formation calendar, for the process owner only; none of it ever blocks
 * (specification: an unpublished calendar and a purpose with no session raise advisory flags to the process owner).
 */
export type FormationCheck = { kind: 'no_preparer' } | { kind: 'calendar_unpublished' } | { kind: 'purpose_uncovered'; purpose: WorkshopPurpose } | { kind: 'stage_dates_backwards'; stage: FormationStage };
export function formationChecks(s: Store, plan: StrategicPlan): FormationCheck[] {
  const out: FormationCheck[] = [];
  if (!plan.calendar?.preparerMembershipId) out.push({ kind: 'no_preparer' });
  else if (!plan.calendar.published) out.push({ kind: 'calendar_unpublished' });
  const covered = new Set(sessionsOf(s, plan.id).flatMap((w) => w.purposes));
  for (const p of PURPOSES) if (!covered.has(p)) out.push({ kind: 'purpose_uncovered', purpose: p });
  for (const st of STAGES) {
    const f = plan.formation?.[st];
    if (f?.startsOn && f.endsOn && f.endsOn < f.startsOn) out.push({ kind: 'stage_dates_backwards', stage: st });
  }
  return out;
}

/** A stage moves forward only: not started → open → complete. Stages may overlap; only the two gates are enforced. */
export const canMoveStage = (from: 'not_started' | 'open' | 'complete', to: 'open' | 'complete') =>
  (from === 'not_started' && to === 'open') || (from === 'open' && to === 'complete');

/** The formed plan being prepared: a draft formed plan, newest first. */
export const formingPlan = (s: Store): StrategicPlan | null => [...s.plans].reverse().find((p) => p.entryDoor === 'formed' && p.status === 'draft') ?? null;

/** Overdue formation deadlines past the organisation's escalation days, for the owners' supervisors. */
export function escalated(s: Store, now: ISODate): { deadlineId: string; label: string; ownerPositionId: string; supervisorPositionId: string; dueOn: ISODate }[] {
  const days = s.organisation.settings.overdueEscalationDays;
  const out: ReturnType<typeof escalated> = [];
  for (const d of s.formationDeadlines) {
    const plan = s.plans.find((p) => p.id === d.planId);
    if (d.completed || !plan?.calendar?.published) continue;
    const late = (Date.parse(`${now}T00:00:00Z`) - Date.parse(`${d.dueOn}T00:00:00Z`)) / 86_400_000;
    if (late <= days) continue;
    for (const o of d.ownerPositionIds) {
      const sup = s.positions.find((p) => p.id === o)?.reportsToPositionId;
      if (sup) out.push({ deadlineId: d.id, label: d.label, ownerPositionId: o, supervisorPositionId: sup, dueOn: d.dueOn });
    }
  }
  return out;
}
