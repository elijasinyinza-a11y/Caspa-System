/**
 * Values group work (v0.32.0; Values Group Work Specification v0.1, VG-1 to VG-10, confirmed by Elijah on 20 November
 * 2026; contract v1.23; prototype `reference/caspa-values-group-work-prototype.html`). Pure rules: no React, no I/O, no
 * clock. Groups answer five fixed questions (VG-2) and each puts forward up to three candidate values (VG-4); the
 * Strategy office keeps, merges or sets candidates aside on the values board (VG-5); there is no voting, and how many
 * groups put a value forward is a fact, never a score (VG-6). The questions' wording lives in `en.valuesWork`.
 */
import type { StrategicPlan, ValueCandidate, VisionStatement, Workshop, WorkshopGroup } from '../contract/caspa-data-contract';
import { MAX_VALUES, VALUE_MEANING_MAX, VALUE_NAME_MAX, type ValueInput } from './values';

/** VG-4: candidate values per group. */
export const MAX_CANDIDATES = 3;
/** Questions 1 to 4 take answers; question 5 takes candidates. */
export const ANSWER_QUESTIONS = [1, 2, 3, 4] as const;
export type AnswerQuestion = (typeof ANSWER_QUESTIONS)[number];
export const ANSWER_MAX = 300;
export { MAX_VALUES, VALUE_MEANING_MAX, VALUE_NAME_MAX };

export type CandidateError = 'name_required' | 'meaning_required' | 'name_too_long' | 'meaning_too_long';

/** Why a candidate cannot be saved, or null. Names up to 40 characters (VG-4, CV-4). */
export function candidateError(c: { name: string; meaning: string }): CandidateError | null {
  const name = c.name.trim();
  const meaning = c.meaning.trim();
  if (!name) return 'name_required';
  if (!meaning) return 'meaning_required';
  if (name.length > VALUE_NAME_MAX) return 'name_too_long';
  if (meaning.length > VALUE_MEANING_MAX) return 'meaning_too_long';
  return null;
}

/** A values session: one whose purposes include values group work. */
export const isValuesSession = (w: Pick<Workshop, 'purposes'>): boolean => w.purposes.includes('values');

/**
 * VG-8: after publication, group work is offered only while the active plan has no values (confirmed or drafted) and no
 * values session is running for it. Confirmed values change only through a plan revision.
 */
export function mayStartAfterPublication(plan: Pick<StrategicPlan, 'id' | 'status'>, statements: readonly VisionStatement[], workshops: readonly Workshop[]): boolean {
  if (plan.status !== 'active') return false;
  if (statements.some((x) => x.planId === plan.id && x.kind === 'value')) return false;
  return !workshops.some((w) => w.planId === plan.id && isValuesSession(w) && w.status !== 'cancelled');
}

/** A group's candidates, in the order they were added. */
export const candidatesOf = (all: readonly ValueCandidate[], workshopId: string, groupId: string): ValueCandidate[] =>
  all.filter((c) => c.workshopId === workshopId && c.groupId === groupId);

/** VG-4: whether the group may add another candidate. */
export const mayAddCandidate = (all: readonly ValueCandidate[], workshopId: string, groupId: string): boolean =>
  candidatesOf(all, workshopId, groupId).length < MAX_CANDIDATES;

/**
 * Whether a candidate is on the values board: its group is closed for review, or the board has already acted on it
 * (reopening a group covers only candidates still waiting for review, as for 4Q groups).
 */
export function onBoard(c: ValueCandidate, groups: readonly WorkshopGroup[]): boolean {
  if (c.state !== 'to_review') return true;
  return !!groups.find((g) => g.id === c.groupId)?.closed;
}

/** The groups behind a candidate: its own, and those of every candidate merged into it (VG-5). Group ids, unique, in order. */
export function groupsBehind(all: readonly ValueCandidate[], id: string, seen = new Set<string>()): string[] {
  const c = all.find((x) => x.id === id);
  if (!c || seen.has(id)) return [];
  seen.add(id);
  const out = [c.groupId, ...all.filter((x) => x.mergedIntoId === id).flatMap((x) => groupsBehind(all, x.id, seen))];
  return [...new Set(out)];
}

/** The groups behind a draft value made from one or more candidates (VG-6: shown as a fact, never a score). */
export function groupsBehindValue(all: readonly ValueCandidate[], candidateIds: readonly string[]): string[] {
  return [...new Set(candidateIds.flatMap((id) => groupsBehind(all, id)))];
}

export type MergeError = 'too_few' | 'not_mergeable' | 'mixed_sessions' | CandidateError;

/** Why candidates cannot be merged, or null: two or more, from one session, each to review or kept. */
export function mergeError(cands: readonly ValueCandidate[], wording: { name: string; meaning: string }): MergeError | null {
  if (cands.length < 2) return 'too_few';
  if (cands.some((c) => c.state !== 'to_review' && c.state !== 'kept')) return 'not_mergeable';
  if (new Set(cands.map((c) => c.workshopId)).size > 1) return 'mixed_sessions';
  return candidateError(wording);
}

/** Board order: to review first, then kept, then set aside; merged candidates show inside the one they joined. */
export const BOARD_ORDER: Record<ValueCandidate['state'], number> = { to_review: 0, kept: 1, set_aside: 2, merged: 3 };

/**
 * v0.32.0: merge values added from the values board into a list someone is editing. Edits not yet saved are kept; any
 * stored value from group work that the list does not hold yet is added at the end.
 */
export function withBoardValues(editing: ValueInput[], stored: ValueInput[]): ValueInput[] {
  const has = (x: ValueInput) => editing.some((e) => (e.fromCandidateIds ?? []).join() === (x.fromCandidateIds ?? []).join());
  return [...editing, ...stored.filter((x) => x.fromCandidateIds?.length && !has(x))];
}
