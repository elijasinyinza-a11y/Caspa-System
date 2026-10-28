/**
 * Gate checks (Build Brief, screen 5; decisions of 28 October 2026, BUILD-BRIEF section 19).
 * Pure: no React, no I/O, no system clock. Stamps and "now" are passed in by the data-access layer.
 *
 * A gate passes when no hard block names it. Advisory flags never stop a gate; each gate shows a fixed
 * list of advisory rules, and the gate record notes each such flag with its acknowledgement, or null.
 */
import type { BoardApproval, BudgetVersion, Finding, GateCode, GateEvent, Id } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { acknowledgementState } from './acknowledgement';
import { blockersAt, isBlocking, RULES } from './integrity';

/** The advisory rules each gate shows. Every other advisory flag stays in the integrity drawer. */
export const GATE_ADVISORIES: Partial<Record<GateCode, readonly string[]>> = {
  'budget.submit_unit': [RULES.goalNoFundedActivity.id],
  'budget.submit_consolidated': [RULES.goalNoFundedActivity.id],
  'budget.approve': [RULES.goalNoFundedActivity.id],
};

export interface GateCheck {
  gate: GateCode;
  blocking: Finding[];
  advisory: Finding[];
  passes: boolean;
}

export function checkGate(findings: Finding[], gate: GateCode): GateCheck {
  const blocking = blockersAt(findings, gate);
  const rules = GATE_ADVISORIES[gate] ?? [];
  const advisory = findings.filter((f) => !isBlocking(f) && rules.includes(f.ruleId));
  return { gate, blocking, advisory, passes: blocking.length === 0 };
}

/** What a gate attempt records. A lapsed acknowledgement does not count: the flag is recorded as unacknowledged. */
export function gateRecord(s: Store, check: GateCheck): Pick<GateEvent, 'outcome' | 'blockingFindingKeys' | 'advisoryAtGate'> {
  return {
    outcome: check.passes ? 'passed' : 'blocked',
    blockingFindingKeys: check.blocking.map((f) => f.key),
    advisoryAtGate: check.advisory.map((f) => {
      const a = acknowledgementState(s, f);
      return { findingKey: f.key, acknowledgementId: a.state === 'acknowledged' ? (a.ack.id as Id<'Acknowledgement'>) : null };
    }),
  };
}

/** Gate events for one subject, oldest first. */
export const gateEventsFor = (s: Store, subjectId: string): GateEvent[] =>
  s.gateEvents.filter((g) => g.subject.id === subjectId).sort((a, b) => Date.parse(a.attempted.at) - Date.parse(b.attempted.at));

/** Who submitted the version as it now stands: the latest passed consolidated submission. */
export const submitterOf = (s: Store, versionId: string): Id<'Membership'> | null =>
  gateEventsFor(s, versionId).filter((g) => g.gate === 'budget.submit_consolidated' && g.outcome === 'passed').pop()?.attempted.byMembershipId ?? null;

export type BudgetStepError =
  | 'not_draft'
  | 'not_submitted'
  | 'own_submission'
  | 'board_reference_required'
  | 'reason_required';

/** Whether a version can be submitted. Hard blocks are not errors here: an attempt is recorded as blocked. */
export const submitError = (v: BudgetVersion): BudgetStepError | null => (v.status === 'draft' ? null : 'not_draft');

/**
 * Whether a person may approve a submitted version: never the submitter (B7), and with a board reference
 * when the organisation requires board approval for the budget.
 */
export function approveError(s: Store, v: BudgetVersion, approverMembershipId: string, board: BoardApproval | null): BudgetStepError | null {
  if (v.status !== 'submitted') return 'not_submitted';
  if (submitterOf(s, v.id) === approverMembershipId) return 'own_submission';
  if (s.organisation.settings.boardApprovalRequired.budget && !validBoard(board)) return 'board_reference_required';
  return null;
}

/** Returning a submitted version needs a reason, and is not open to the submitter. */
export function returnError(s: Store, v: BudgetVersion, membershipId: string, reason: string): BudgetStepError | null {
  if (v.status !== 'submitted') return 'not_submitted';
  if (submitterOf(s, v.id) === membershipId) return 'own_submission';
  if (!reason.trim()) return 'reason_required';
  return null;
}

const validBoard = (b: BoardApproval | null): boolean =>
  !!b && b.resolutionRef.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && !Number.isNaN(Date.parse(b.date));
