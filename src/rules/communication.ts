/**
 * Communication, part 11e (BUILD-BRIEF section 36, D16-1 to D16-12; contract v1.9). Pure: records in, results out.
 * No clock is read; "now" is passed in where it matters.
 *
 * Status here is plain information ("Record complete" or "No context yet"), never a check (D16-9). The confirmed rule
 * "Goal has no recorded why" stays in the integrity rules and reads the goal's 4Q links.
 */
import type { AssignedRole, CommunicationRecord, Goal, ISODate, StrategicPlan } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { isDecided } from './composition';
import { departments, departmentsHeadedBy } from './conception';
import { shownUnit, stageStarted, unitAndBelow } from './consultation';

export type Audience = CommunicationRecord['audienceVersions'][number]['audience'];
export const AUDIENCES: Audience[] = ['board', 'managers', 'staff'];

/**
 * Plans whose goals can have records (D16-3, D16-4): any confirmed or active plan, imported plans included, and a
 * formed plan still being formed once Composition has started. Active first, then confirmed, then the one in formation.
 */
export function communicationPlans(s: Store): StrategicPlan[] {
  const rank = (p: StrategicPlan) => (p.status === 'active' ? 0 : p.status === 'confirmed' ? 1 : 2);
  return s.plans
    .filter((p) => p.status === 'active' || p.status === 'confirmed' || (p.status === 'draft' && p.entryDoor === 'formed' && stageStarted(p, 'composition')))
    .sort((a, b) => rank(a) - rank(b) || b.startYear - a.startYear);
}

/**
 * Whether the Executive has confirmed a goal (D16-4). A formed plan's goals are confirmed one by one in Composition;
 * an imported plan's goals are confirmed with the plan itself.
 */
export function goalConfirmed(s: Store, goal: Goal): boolean {
  const plan = s.plans.find((p) => p.id === goal.planId);
  if (!plan) return false;
  if (plan.entryDoor === 'imported') return plan.confirmation !== null;
  return isDecided(goal.draft);
}

const byCode = (a: Goal, b: Goal) => a.code.localeCompare(b.code, 'en', { numeric: true });

/** The confirmed goals of a plan that can have records, in code order. Empty for any other plan. */
export function communicationGoals(s: Store, planId: string): Goal[] {
  if (!communicationPlans(s).some((p) => p.id === planId)) return [];
  return s.goals.filter((g) => g.planId === planId && goalConfirmed(s, g)).sort(byCode);
}

/** Whether a goal can have a record now. */
export const canHaveRecord = (s: Store, goalId: string) => {
  const g = s.goals.find((x) => x.id === goalId);
  return !!g && communicationGoals(s, g.planId).some((x) => x.id === goalId);
};

export const recordOf = (s: Store, goalId: string): CommunicationRecord | null => s.communicationRecords.find((r) => r.goalId === goalId) ?? null;

/** A record is saved only with all three parts (what, why, how) filled in. */
export const fieldsComplete = (f: { content: string; context: string; concept: string }) => !!(f.content.trim() && f.context.trim() && f.concept.trim());

/** D16-9: plain status, not a check. */
export type RecordStatus = 'complete' | 'no_context';
export const recordStatus = (r: CommunicationRecord | null): RecordStatus => (r && fieldsComplete(r) ? 'complete' : 'no_context');

/**
 * D16-10: confirmed goals with no saved record, for the goal's owner and the Strategy office ("Needs you"). Undated.
 */
export function goalsNeedingRecord(s: Store): Goal[] {
  return communicationPlans(s).flatMap((p) => communicationGoals(s, p.id)).filter((g) => recordStatus(recordOf(s, g.id)) !== 'complete');
}

/**
 * D16-7: the version a reader sees first. The Executive reads the board version; supervisors and department heads
 * the managers version; everyone else the staff version. The others are one tap away.
 */
export function firstAudience(v: { roles: readonly AssignedRole[]; isSupervisor: boolean; headsDepartment: boolean }): Audience {
  if (v.roles.includes('executive')) return 'board';
  if (v.isSupervisor || v.headsDepartment) return 'managers';
  return 'staff';
}

/** The department heads of the organisation: with the goal's owner, the "owner" of a record (contract v1.9). */
export const departmentHeadPositionsAll = (s: Store): string[] =>
  [...new Set(departments(s).map((d) => d.headPositionId).filter((p): p is string => !!p))];

/** Who holds "owner" on a goal's record: its owner, and the department heads for meetings in their own unit. */
export function communicationOwnerPositions(s: Store, goalId: string): string[] {
  const owner = s.goals.find((g) => g.id === goalId)?.ownerPositionId;
  return [...new Set([...(owner ? [owner as string] : []), ...departmentHeadPositionsAll(s)])];
}

/**
 * Units a department head may log meetings for: their department and every unit within it (the 11c precedent).
 */
export function meetingUnitsHeadedBy(s: Store, positionIds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const d of departmentsHeadedBy(s, positionIds)) unitAndBelow(s, d.unitId).forEach((u) => out.add(u));
  return [...out];
}

/** D16-8: a meeting's unit as shown; the consultation small-group rule applies (small units as the unit above). */
export const meetingShownUnit = (s: Store, unitId: string, now: ISODate): string | null => shownUnit(s, unitId, now);

/** The goal's linked 4Q points, shown live under "why" (D16-6). Merged cards are followed to the card they became. */
export function whyCardIds(s: Store, goal: Goal): string[] {
  const out: string[] = [];
  for (const id of goal.fourQEntryIds) {
    let e = s.fourQEntries.find((x) => x.id === id);
    const seen = new Set<string>();
    while (e?.mergedIntoId && !seen.has(e.id)) { seen.add(e.id); e = s.fourQEntries.find((x) => x.id === e!.mergedIntoId); }
    if (e && !out.includes(e.id)) out.push(e.id);
  }
  return out;
}
