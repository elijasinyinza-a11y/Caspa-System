/**
 * Staff survey sample rounds for the test organisations (v0.19.0). Generated, fictional, the same every time:
 * - the NGO: a closed round with 3 answers from 6 people asked, so it shows "Too few answers to show";
 * - the scale organisation: a closed round answered by everyone asked, so small units fold upwards;
 * - the packaging manufacturer: none, so the tab shows "No rounds yet".
 * Responses store the group-sized unit (SV-2), and receipts never share an id with them.
 */
import type { ISODate, ISODateTime, Stamp, SurveyAnswerValue, SurveyResponse } from '../../contract/caspa-data-contract';
import { askedOn, questionsFor, storedUnit } from '../../rules/survey';
import type { Store } from '../access/store';

const CYCLE: Record<string, SurveyAnswerValue[]> = {
  content: ['right', 'right', 'wrong', 'right', 'dont_know'], context: ['right', 'wrong', 'right', 'right', 'right'],
  own_goal: ['right', 'right', 'dont_know', 'wrong', 'right'], own_role: ['agree', 'partly', 'agree', 'disagree', 'agree'],
  team_met: ['yes', 'no', 'yes', 'yes', 'not_sure'], raise_concerns: ['yes', 'yes', 'not_sure', 'no', 'yes'],
  views_passed_on: ['no', 'yes', 'not_sure', 'yes', 'no'], told_of_change: ['yes', 'no', 'no_change', 'yes', 'yes'],
};

export function addSampleSurvey(s: Store, o: { opensOn: string; closesOn: string; title: string; answers: number | 'all' }): Store {
  const plan = s.plans.find((p) => p.status === 'active');
  const lead = s.memberships.find((m) => m.roles.includes('strategy_office')) ?? s.memberships[0]!;
  if (!plan) return s;
  const goalIds = s.goals.filter((g) => g.planId === plan.id).slice(0, 2).map((g) => g.id);
  const stamp: Stamp = { at: `${o.opensOn}T08:00:00+00:00` as ISODateTime, byMembershipId: lead.id };
  const id = `sr-${s.organisation.id}-sample`;
  const round = {
    orgId: s.organisation.id, id: id as never, planId: plan.id, title: o.title, asksAboutChanges: false, goalIds,
    opensOn: o.opensOn as ISODate, closesOn: o.closesOn as ISODate, status: 'closed' as const, openedBy: stamp,
    closedBy: { ...stamp, at: `${o.closesOn}T17:00:00+00:00` as ISODateTime }, closingNote: null, concernSummary: null, created: stamp, updated: stamp,
  };
  s.surveyRounds.push(round);
  const asked = askedOn(s, round.opensOn);
  const who = o.answers === 'all' ? asked : asked.slice(0, o.answers);
  who.forEach((a, i) => {
    const results = questionsFor(round).map((q, k) => ({ question: q.key, goalId: q.goalId as SurveyResponse['results'][number]['goalId'], value: CYCLE[q.key]![(i + k) % 5]! }));
    s.surveyResponses.push({ orgId: s.organisation.id, id: `rs-${id}-${String(i + 1).padStart(3, '0')}` as never, roundId: round.id, unitId: storedUnit(s, a.unitId, round.opensOn) as never, results, concern: null });
    s.surveyReceipts.push({ orgId: s.organisation.id, id: `srr-${id}-${a.membershipId}` as never, roundId: round.id, membershipId: a.membershipId as never, outcome: 'answered', on: round.opensOn });
  });
  return s;
}
