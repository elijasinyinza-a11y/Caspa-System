/**
 * Staff survey rules (v0.19.0; Staff Voice Specification v0.1, SV-1 to SV-14; contract v1.11). Pure functions over
 * the store: who is asked, the unit a response stores, scoring, the checks before a round opens, and how results
 * fold into groups. No React, no I/O, no system clock ("now" is passed in).
 */
import type { Goal, ISODate, SurveyAnswerValue, SurveyQuestionKey, SurveyResponse, SurveyRound } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { goalOfActivity, goalOfObjective, objectiveOfKpi } from './structure';

export const MAX_GOALS = 5;
export const MIN_GOALS = 2;
export const MAX_WINDOW_DAYS = 28;
export const CONCERN_MAX = 500;
export const NOTE_MAX = 1000;

/** The survey's areas, in the order results are shown (section 2). */
export type SurveyArea = 'content' | 'context' | 'concept' | 'interaction' | 'continuity';
export const SURVEY_AREAS: SurveyArea[] = ['content', 'context', 'concept', 'interaction', 'continuity'];
export const AREA_OF: Record<SurveyQuestionKey, SurveyArea> = {
  content: 'content', context: 'context', own_goal: 'concept', own_role: 'concept',
  team_met: 'interaction', raise_concerns: 'interaction', views_passed_on: 'interaction', told_of_change: 'continuity',
};
/** Each question's possible answers, in display order; the first counts as positive (SV-14). */
export const ANSWERS: Record<SurveyQuestionKey, SurveyAnswerValue[]> = {
  content: ['right', 'wrong', 'dont_know'], context: ['right', 'wrong', 'dont_know'], own_goal: ['right', 'wrong', 'dont_know'],
  own_role: ['agree', 'partly', 'disagree'],
  team_met: ['yes', 'no', 'not_sure'], raise_concerns: ['yes', 'no', 'not_sure'], views_passed_on: ['yes', 'no', 'not_sure'],
  told_of_change: ['yes', 'no', 'no_change'],
};

export interface SurveyQuestion { key: SurveyQuestionKey; goalId: string | null }

/** The round's questions in order. The optional comment is not a question here; it travels on the response. */
export function questionsFor(round: Pick<SurveyRound, 'goalIds' | 'asksAboutChanges'>): SurveyQuestion[] {
  return [
    ...round.goalIds.map((g) => ({ key: 'content' as const, goalId: g as string })),
    ...round.goalIds.map((g) => ({ key: 'context' as const, goalId: g as string })),
    ...(['own_goal', 'own_role', 'team_met', 'raise_concerns', 'views_passed_on'] as const).map((key) => ({ key, goalId: null })),
    ...(round.asksAboutChanges ? [{ key: 'told_of_change' as const, goalId: null }] : []),
  ];
}

const held = (from: ISODate, to: ISODate | null, on: ISODate) => from <= on && (to === null || to >= on);

/** People holding a position on a date, substantive or acting: everyone asked in a round opening then. */
export function askedOn(s: Store, on: ISODate): { membershipId: string; personId: string; positionIds: string[]; unitId: string }[] {
  const out: { membershipId: string; personId: string; positionIds: string[]; unitId: string }[] = [];
  for (const m of s.memberships) {
    if (m.status !== 'active' || m.startsOn > on || (m.endsOn !== null && m.endsOn < on)) continue;
    const positionIds = s.assignments.filter((a) => a.personId === m.personId && held(a.from, a.to, on)).map((a) => a.positionId as string);
    if (!positionIds.length) continue;
    const unitId = s.positions.find((p) => p.id === positionIds[0])!.unitId as string;
    out.push({ membershipId: m.id, personId: m.personId, positionIds, unitId });
  }
  return out;
}

/** A unit and every unit above it, lowest first. */
export function unitChain(s: Store, unitId: string): string[] {
  const out: string[] = [];
  const byId = new Map(s.units.map((u) => [u.id as string, u]));
  for (let u: string | null = unitId; u && out.length < 64; u = (byId.get(u)?.parentId as string | null) ?? null) out.push(u);
  return out;
}

const rootUnit = (s: Store) => s.units.find((u) => u.parentId === null)!.id as string;

/**
 * The unit a response stores (SV-2): the lowest unit on the person's chain holding at least the small-group size of
 * people asked on the opening date, falling back to the organisation. No stored unit is smaller than a group.
 */
export function storedUnit(s: Store, unitId: string, opensOn: ISODate): string {
  const min = s.organisation.settings.consultationMinGroupSize;
  const asked = askedOn(s, opensOn);
  const under = (u: string) => asked.filter((a) => unitChain(s, a.unitId).includes(u)).length;
  return unitChain(s, unitId).find((u) => under(u) >= min) ?? rootUnit(s);
}

/** Goals above what the person's positions own, and above their signed contract commitments, on a date. */
export function goalsOfOwnWork(s: Store, positionIds: string[], personId: string, now: ISODate): Set<string> {
  const mine = new Set(positionIds);
  const goals = new Set<string>();
  const add = (g: Goal | undefined) => { if (g) goals.add(g.id); };
  for (const g of s.goals) if (g.ownerPositionId && mine.has(g.ownerPositionId)) goals.add(g.id);
  for (const o of s.objectives) if (o.ownerPositionId && mine.has(o.ownerPositionId)) add(goalOfObjective(s, o));
  for (const k of s.kpis) if (k.ownerPositionId && mine.has(k.ownerPositionId)) { const o = objectiveOfKpi(s, k); add(o && goalOfObjective(s, o)); }
  for (const a of s.activities) if (a.ownerPositionId && mine.has(a.ownerPositionId)) add(goalOfActivity(s, a));
  const year = Number(now.slice(0, 4));
  for (const c of s.contracts) {
    if (c.personId !== personId || c.status !== 'signed' || Math.abs(c.financialYear - year) > 1) continue;
    for (const co of s.contractObjectives.filter((x) => x.contractId === c.id)) {
      const a = s.activities.find((x) => x.id === co.sourceActivityId);
      if (a) add(goalOfActivity(s, a));
    }
  }
  return goals;
}

/** Scores a choice. Scored questions keep the result only, never which goal was chosen (SV-2). */
export function scoreAnswer(q: SurveyQuestion, choice: string, ownGoals: Set<string>): SurveyAnswerValue {
  if (choice === 'dont_know') return 'dont_know';
  if (q.key === 'content' || q.key === 'context') return choice === q.goalId ? 'right' : 'wrong';
  if (q.key === 'own_goal') return ownGoals.size === 0 ? 'not_linked' : ownGoals.has(choice) ? 'right' : 'wrong';
  return choice as SurveyAnswerValue;
}

/** Days from a to b. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const t = (x: string) => Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 864e5);
}

export type RoundProblem =
  | { kind: 'too_few_goals' } | { kind: 'too_many_goals' }
  | { kind: 'no_record'; goalId: string }
  | { kind: 'window_order' } | { kind: 'window_long' } | { kind: 'window_ended' }
  | { kind: 'no_title' };
export type RoundCaution = { kind: 'what_names_goal'; goalId: string };

/** Must-fix problems before a round is saved or opened, and worth-checking cautions (D7-2 pattern, not findings). */
export function roundChecks(s: Store, r: Pick<SurveyRound, 'title' | 'goalIds' | 'opensOn' | 'closesOn'>, now: ISODate): { mustFix: RoundProblem[]; worth: RoundCaution[] } {
  const mustFix: RoundProblem[] = [];
  const worth: RoundCaution[] = [];
  if (!r.title.trim()) mustFix.push({ kind: 'no_title' });
  if (r.goalIds.length < MIN_GOALS) mustFix.push({ kind: 'too_few_goals' });
  if (r.goalIds.length > MAX_GOALS) mustFix.push({ kind: 'too_many_goals' });
  for (const g of r.goalIds) {
    const rec = s.communicationRecords.find((c) => c.goalId === g);
    if (!rec || !rec.content.trim() || !rec.context.trim()) { mustFix.push({ kind: 'no_record', goalId: g }); continue; }
    const goal = s.goals.find((x) => x.id === g);
    if (goal && rec.content.toLowerCase().includes(goal.title.toLowerCase())) worth.push({ kind: 'what_names_goal', goalId: g });
  }
  const len = daysBetween(r.opensOn, r.closesOn);
  if (len < 0) mustFix.push({ kind: 'window_order' });
  else if (len > MAX_WINDOW_DAYS) mustFix.push({ kind: 'window_long' });
  if (r.closesOn < now) mustFix.push({ kind: 'window_ended' });
  return { mustFix, worth };
}

/** Goals that may be chosen for a round: the plan's goals with a communication record holding what and why. */
export function eligibleGoals(s: Store, planId: string): { goal: Goal; ok: boolean }[] {
  return s.goals.filter((g) => g.planId === planId).map((goal) => {
    const rec = s.communicationRecords.find((c) => c.goalId === goal.id);
    return { goal, ok: !!rec && !!rec.content.trim() && !!rec.context.trim() };
  });
}

export type ArrivalFailure = 'round_closed' | 'not_asked' | 'already_answered';

/** Checks on arrival (SV-8): the round still open, the person asked, and no receipt yet. */
export function arrivalCheck(s: Store, roundId: string, membershipId: string): ArrivalFailure | null {
  const r = s.surveyRounds.find((x) => x.id === roundId);
  if (!r || r.status !== 'open') return 'round_closed';
  if (!askedOn(s, r.opensOn).some((a) => a.membershipId === membershipId)) return 'not_asked';
  if (s.surveyReceipts.some((x) => x.roundId === roundId && x.membershipId === membershipId)) return 'already_answered';
  return null;
}

/**
 * Display groups (SV-5): each response shows under the lowest unit on its chain with at least the small-group size
 * of responses in it. Responses folding to the organisation are "shown together". Empty when the round has fewer
 * responses than the small-group size in total.
 */
export function resultGroups(s: Store, responses: SurveyResponse[]): { unitId: string; together: boolean; responses: SurveyResponse[] }[] {
  const min = s.organisation.settings.consultationMinGroupSize;
  if (responses.length < min) return [];
  const root = rootUnit(s);
  const chains = new Map(responses.map((r) => [r.id as string, unitChain(s, r.unitId)]));
  const under = (u: string) => responses.filter((r) => chains.get(r.id)!.includes(u)).length;
  const groups = new Map<string, SurveyResponse[]>();
  for (const r of responses) {
    const u = chains.get(r.id)!.find((x) => under(x) >= min) ?? root;
    groups.set(u, [...(groups.get(u) ?? []), r]);
  }
  // A unit group's responses also count in the organisation total; "together" holds the rest.
  return [...groups].map(([unitId, rs]) => ({ unitId, together: unitId === root, responses: rs }))
    .sort((a, b) => Number(a.together) - Number(b.together) || a.unitId.localeCompare(b.unitId));
}

/** Counts per answer for one question across responses. */
export function answerCounts(responses: SurveyResponse[], key: SurveyQuestionKey, goalId: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of ANSWERS[key]) out[v] = 0;
  for (const r of responses) for (const x of r.results) if (x.question === key && (x.goalId ?? null) === goalId && x.value in out) out[x.value]! += 1;
  return out;
}
