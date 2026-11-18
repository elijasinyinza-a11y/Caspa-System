/**
 * Pure rules for cascade edits: adding a corrective activity from the decision map (D6-1), changing an activity's 6P
 * level (D6-6), and the in-year changes of v0.27.0 (IC-1 to IC-8). No React, no I/O, no clock.
 */
import type { Activity, ContractObjective, Deficiency, ISODate, ReportingFrequency, SixPLevel } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { activityFingerprint } from './fingerprint';
import { objectiveOfActivity } from './structure';

/**
 * The next activity code under a KPI: the lowest unused number after its activities' common stem, e.g.
 * "A1.2.1.5". A KPI with no activities yet takes the organisation's activity prefix and the KPI's numbering, so
 * "IN1.1.1" in an organisation whose activities read "IV…" gives "IV1.1.1.1".
 */
export function nextActivityCode(s: Store, kpiId: string): string {
  const kpi = s.kpis.find((k) => k.id === kpiId);
  if (!kpi) throw new Error(`Unknown KPI ${kpiId}`);
  const siblings = s.activities.filter((a) => a.kpiId === kpiId);
  const first = siblings[0];
  const prefix = s.activities[0]?.code.match(/^[A-Za-z]+/)?.[0] ?? 'A';
  const stem = first ? first.code.slice(0, first.code.lastIndexOf('.')) : `${prefix}${kpi.code.replace(/^[A-Za-z]+/, '')}`;
  const taken = new Set(s.activities.map((a) => a.code));
  let n = 1;
  while (taken.has(`${stem}.${n}`)) n += 1;
  return `${stem}.${n}`;
}

/** The KPIs a corrective activity for this deficiency may sit under: the deficiency's own objective's KPIs. */
export const kpisForDeficiency = (s: Store, df: Deficiency) => s.kpis.filter((k) => k.objectiveId === df.objectiveId).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

/**
 * Activities that may be linked as corrective work: the year's activities under the same objective, not already
 * linked and not archived. Those at the deficiency's level come first, then code order. Deterministic; no AI.
 */
export function correctiveOptions(s: Store, df: Deficiency, fy: number): Activity[] {
  const level = (a: Activity) => (a.decisionLevel === df.level ? 0 : 1);
  return s.activities
    .filter((a) => a.financialYear === fy && a.status !== 'archived' && !df.correctiveActivityIds.includes(a.id))
    .filter((a) => objectiveOfActivity(s, a)?.id === df.objectiveId)
    .sort((a, b) => level(a) - level(b) || a.code.localeCompare(b.code, 'en', { numeric: true }));
}

export interface NewActivityDraft {
  kpiId: string;
  title: string;
  level: SixPLevel;
  ownerPositionId: string;
  evidence: string;
  frequency: ReportingFrequency;
  quantity: { value: number; unit: string } | null;
}
export type NewActivityError = 'kpi_not_allowed' | 'title_required' | 'owner_required' | 'evidence_required' | 'quantity_invalid';

/** Why a new corrective activity cannot be added, or null. A level is always set: a new activity never starts with none. */
export function newActivityError(s: Store, df: Deficiency, d: NewActivityDraft): NewActivityError | null {
  if (!kpisForDeficiency(s, df).some((k) => k.id === d.kpiId)) return 'kpi_not_allowed';
  if (!d.title.trim()) return 'title_required';
  if (!s.positions.some((p) => p.id === d.ownerPositionId)) return 'owner_required';
  if (!d.evidence.trim()) return 'evidence_required';
  if (d.quantity && (!(d.quantity.value > 0) || !Number.isInteger(d.quantity.value) || !d.quantity.unit.trim())) return 'quantity_invalid';
  return null;
}

export type LevelChangeError = 'same_level' | 'reason_required' | 'archived';

/** Why an activity's 6P level cannot be changed to `to`, or null (D6-6). There is no way back to no level. */
export function levelChangeError(a: Activity, to: SixPLevel, reason: string): LevelChangeError | null {
  if (a.status === 'archived') return 'archived';
  if (to === a.decisionLevel) return 'same_level';
  if (!reason.trim()) return 'reason_required';
  return null;
}

/* ───────── In-year cascade changes (v0.27.0, In-Year Cascade Changes Specification v0.1, IC-1 to IC-8) ───────── */

/** One correction to a published activity. The 6P level keeps its own path (levelChangeError, D6-6). */
export type ActivityChange =
  | { change: 'details'; title: string; evidence: string; frequency: ReportingFrequency }
  | { change: 'target'; value: number }
  | { change: 'owner'; positionId: string }
  | { change: 'complete' | 'reopen' | 'stop' | 'restart' };

export type ActivityChangeError =
  | 'stopped' | 'not_stopped' | 'already_complete' | 'not_complete' | 'no_change'
  | 'title_required' | 'evidence_required' | 'target_invalid' | 'no_target' | 'owner_unknown' | 'reason_required';

/** Signed commitments drawn from an activity this year: frozen objectives of contracts that are signed and not closed. */
export function signedCommitments(s: Store, activityId: string, fy: number): ContractObjective[] {
  const live = new Set(s.contracts.filter((c) => c.financialYear === fy && c.status !== 'closed').map((c) => c.id as string));
  return s.contractObjectives.filter((co) => co.sourceActivityId === activityId && !!co.snapshot && live.has(co.contractId));
}

/** The quantity those signed commitments carry, from their frozen snapshots. */
export const signedQuantity = (s: Store, activityId: string, fy: number): number =>
  signedCommitments(s, activityId, fy).reduce((sum, co) => sum + ((co.snapshot?.quantityTarget ?? co.quantityTarget)?.value ?? 0), 0);

/** The latest recorded completion of an activity, by period end. Never invented: null when nothing is recorded. */
export function latestRecorded(s: Store, activityId: string): { done: number; periodEnd: ISODate } | null {
  const p = s.activityProgress
    .filter((x) => x.activityId === activityId && x.quantityDone !== null)
    .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0];
  return p && p.quantityDone !== null ? { done: p.quantityDone, periodEnd: p.periodEnd } : null;
}

/** Marking complete needs a reason only when the recorded completion is below the quantity target (IC-5); every other change needs one. */
export function reasonNeeded(s: Store, a: Activity, ch: ActivityChange): boolean {
  if (ch.change !== 'complete') return true;
  if (!a.quantityTarget) return false;
  return (latestRecorded(s, a.id)?.done ?? 0) < a.quantityTarget.value;
}

/** Why a change cannot be made, or null. Who may make it is the data-access layer's job (IC-2), not this rule's. */
export function activityChangeError(s: Store, a: Activity, ch: ActivityChange, reason: string): ActivityChangeError | null {
  const stopped = a.status === 'archived';
  if (ch.change === 'restart') { if (!stopped) return 'not_stopped'; }
  else if (stopped) return 'stopped';
  switch (ch.change) {
    case 'details':
      if (!ch.title.trim()) return 'title_required';
      if (!ch.evidence.trim()) return 'evidence_required';
      if (ch.title.trim() === a.title && ch.evidence.trim() === a.evidence && ch.frequency === a.reportingFrequency) return 'no_change';
      break;
    case 'target':
      if (!a.quantityTarget) return 'no_target';
      if (!Number.isInteger(ch.value) || ch.value <= 0) return 'target_invalid';
      if (ch.value === a.quantityTarget.value) return 'no_change';
      break;
    case 'owner':
      if (!s.positions.some((p) => p.id === ch.positionId)) return 'owner_unknown';
      if (ch.positionId === a.ownerPositionId) return 'no_change';
      break;
    case 'complete':
      if (a.status === 'complete') return 'already_complete';
      break;
    case 'reopen':
      if (a.status !== 'complete') return 'not_complete';
      break;
  }
  if (reasonNeeded(s, a, ch) && !reason.trim()) return 'reason_required';
  return null;
}

/** The activity as it would be after the change. Pure: returns a copy. */
export function applyActivityChange(a: Activity, ch: ActivityChange): Activity {
  switch (ch.change) {
    case 'details': return { ...a, title: ch.title.trim(), evidence: ch.evidence.trim(), reportingFrequency: ch.frequency };
    case 'target': return { ...a, quantityTarget: a.quantityTarget && { ...a.quantityTarget, value: ch.value } };
    case 'owner': return { ...a, ownerPositionId: ch.positionId as Activity['ownerPositionId'] };
    case 'complete': return { ...a, status: 'complete' };
    case 'stop': return { ...a, status: 'archived' };
    case 'reopen':
    case 'restart': return { ...a, status: 'in_progress' };
  }
}

/** What a change would touch, computed before it is saved (section 6, "This will affect"). Ids only; the caller names them. */
export interface ActivityChangeImpact {
  /** Signed commitments drawn from the activity this year. */
  commitments: ContractObjective[];
  /** True when the change alters what those commitments froze at signature, so each is flagged (STRUCT-CONTRACT-UPSTREAM-CHANGED). */
  upstreamChanged: boolean;
  /** True when stopping, so each commitment and each budget line is flagged (IC-6). */
  stops: boolean;
  /** The quantity signed commitments carry, and whether the new target would fall below it (IC-7). */
  signed: number;
  belowSigned: boolean;
  /** Budget lines of the year's current version linked to the activity. */
  budgetLineIds: string[];
  /** Work that waits on this activity: contract and share dependencies, and activities that list it first. */
  dependents: number;
}

export function activityChangeImpact(s: Store, a: Activity, ch: ActivityChange, fy: number, lines: { id: string; activityId: string | null }[]): ActivityChangeImpact {
  const commitments = signedCommitments(s, a.id, fy);
  const after = applyActivityChange(a, ch);
  const signed = signedQuantity(s, a.id, fy);
  const was = !!a.quantityTarget && a.quantityTarget.value < signed;
  const willBe = ch.change === 'target' && !!after.quantityTarget && after.quantityTarget.value < signed;
  return {
    commitments,
    upstreamChanged: commitments.length > 0 && activityFingerprint(after) !== activityFingerprint(a),
    stops: ch.change === 'stop',
    signed,
    belowSigned: willBe && !was,
    budgetLineIds: lines.filter((l) => l.activityId === a.id).map((l) => l.id),
    dependents:
      s.dependencies.filter((d) => 'activityId' in d.on && (d.on as { activityId: string }).activityId === a.id).length +
      s.activities.filter((x) => x.id !== a.id && x.status !== 'archived' && x.dependsOn.includes(a.id)).length,
  };
}

export type OwnerChangeError = 'owner_unknown' | 'no_change' | 'reason_required';

/** Why a goal's, objective's or KPI's owner cannot be changed to `positionId`, or null (IC-3, IC-4). */
export function ownerChangeError(s: Store, current: string | null, positionId: string, reason: string): OwnerChangeError | null {
  if (!s.positions.some((p) => p.id === positionId)) return 'owner_unknown';
  if (positionId === current) return 'no_change';
  if (!reason.trim()) return 'reason_required';
  return null;
}
