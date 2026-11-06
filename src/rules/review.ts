/**
 * The review journey (v0.20.0; Reviews Specification v0.1, RV-1 to RV-10; R7–R9). Pure functions: which step a review
 * is at, who acts at each step, and what blocks completing a review or closing the year. Scores themselves stay in
 * src/rules/rating.ts. No React, no I/O, no system clock.
 */
import type { ISODate, PerformanceContract, Review } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { rateContract } from './rating';

export type ReviewStep = 'awaiting_self' | 'awaiting_supervisor' | 'being_checked' | 'awaiting_acknowledgement' | 'acknowledged';

const held = (from: ISODate, to: ISODate | null, on: ISODate) => from <= on && (to === null || to >= on);
/** People holding a position on a date, substantive or acting. */
export function holdersOf(s: Store, positionId: string | null, on: ISODate): string[] {
  if (!positionId) return [];
  return s.assignments.filter((a) => a.positionId === positionId && held(a.from, a.to, on)).map((a) => a.personId as string);
}

/** The supervisor's position: the one the contract's position reports to. */
export const supervisorPositionOf = (s: Store, c: PerformanceContract): string | null =>
  (s.positions.find((p) => p.id === c.positionId)?.reportsToPositionId as string | null) ?? null;

/**
 * The next-level reviewer's position: the supervisor's supervisor. Whoever completed a review cannot also check it
 * (B7), so where the same person holds both, the check passes one position further up, as verification does (OP-6).
 */
export function reviewerPositionOf(s: Store, c: PerformanceContract, now: ISODate): string | null {
  const sup = supervisorPositionOf(s, c);
  const supPeople = holdersOf(s, sup, now);
  let p = (s.positions.find((x) => x.id === sup)?.reportsToPositionId as string | null) ?? null;
  for (let i = 0; p && i < 32; i++) {
    const people = holdersOf(s, p, now);
    // A vacant post can't check anything, so the check passes further up (as the Head of Commercial's does).
    if (people.length && !people.some((x) => supPeople.includes(x) || x === c.personId)) return p;
    p = (s.positions.find((x) => x.id === p)?.reportsToPositionId as string | null) ?? null;
  }
  return null;
}

/** True when a completed review has a flag (scored 1, or above the high-achievement level) not yet accepted. */
export function needsCheck(s: Store, r: Review, now: ISODate): boolean {
  if (r.status !== 'completed' || r.reviewerCheck) return false;
  return (rateContract(s, r.contractId, { now })?.flags.length ?? 0) > 0;
}

export function stepOf(s: Store, r: Review, now: ISODate): ReviewStep {
  if (r.status === 'open') return 'awaiting_self';
  if (r.status === 'self_submitted') return 'awaiting_supervisor';
  if (needsCheck(s, r, now)) return 'being_checked';
  return r.employeeAcknowledgement ? 'acknowledged' : 'awaiting_acknowledgement';
}

export type CompleteBlock =
  | { kind: 'waiting_for_hr'; contractObjectiveId: string }
  | { kind: 'not_scored'; contractObjectiveId: string }
  | { kind: 'no_assessment' };

/** What must be fixed before the supervisor completes a review (step 3). */
export function completeBlocks(s: Store, r: Review, assessment: string, now: ISODate): CompleteBlock[] {
  const out: CompleteBlock[] = [];
  const rating = rateContract(s, r.contractId, { now });
  for (const o of rating?.objectives ?? []) {
    const request = r.notAssessable.find((n) => n.contractObjectiveId === o.contractObjectiveId);
    if (request && !request.hrApproval) out.push({ kind: 'waiting_for_hr', contractObjectiveId: o.contractObjectiveId });
    else if (o.basis !== 'not_assessable' && o.score === null) out.push({ kind: 'not_scored', contractObjectiveId: o.contractObjectiveId });
  }
  if (!assessment.trim()) out.push({ kind: 'no_assessment' });
  return out;
}

export type CloseBlock = { kind: 'not_completed' | 'being_checked' | 'waiting_for_hr'; count: number };

/** What must be fixed before HR closes the year-end round (step 6). Mid-year rounds are never closed. */
export function closeBlocks(s: Store, reviews: Review[], now: ISODate): CloseBlock[] {
  const count = (f: (r: Review) => boolean) => reviews.filter(f).length;
  const out: CloseBlock[] = [
    { kind: 'not_completed', count: count((r) => r.status !== 'completed') },
    { kind: 'being_checked', count: count((r) => needsCheck(s, r, now)) },
    { kind: 'waiting_for_hr', count: count((r) => r.notAssessable.some((n) => !n.hrApproval)) },
  ];
  return out.filter((b) => b.count > 0);
}
