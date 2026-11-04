/**
 * Progress capture rules (slice 13; Offline Progress Capture Specification v1.0, BUILD-BRIEF section 39, OP-1 to
 * OP-12). Pure: no React, no I/O, "now" is passed in. The same functions run on the device, for checks that need no
 * server, and on arrival.
 *
 * Figures are cumulative to date: the latest record on or before "now" is the one that counts. Only verified updates
 * count towards achievement (R6); nothing here changes P1–P10 or R1–R10.
 */
import type {
  ContractObjective, ISODate, ISODateTime, PerformanceContract, ProgressUpdate, ReportingFrequency,
} from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { activityFingerprint } from './fingerprint';
import { financialYearBounds } from './kpi-progress';

const STEP: Record<ReportingFrequency, number> = { monthly: 1, quarterly: 3, biannual: 6, annual: 12 };
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10) as ISODate;
/** Instants are compared as instants: stored stamps carry different offsets. */
export const instant = (t: string): number => Date.parse(t);

/** The last day of each reporting period of a financial year, from the year's start month and the frequency. */
export function periodEnds(fy: number, startMonth: number, freq: ReportingFrequency): ISODate[] {
  const step = STEP[freq];
  const out: ISODate[] = [];
  for (let k = step; k <= 12; k += step) out.push(iso(Date.UTC(fy, startMonth - 1 + k, 1) - 86_400_000));
  return out;
}

/** Periods that have ended before "now" (a period ends at the close of its last day). */
export const endedPeriods = (fy: number, startMonth: number, freq: ReportingFrequency, now: ISODate): ISODate[] =>
  periodEnds(fy, startMonth, freq).filter((e) => e < now);

/** The source activity's reporting frequency, which sets a contract objective's periods. */
export const frequencyOf = (s: Store, co: ContractObjective): ReportingFrequency =>
  s.activities.find((a) => a.id === co.sourceActivityId)?.reportingFrequency ?? 'monthly';

/**
 * The verified figure that counts at "now": the latest period on or before "now"; for the same period, the one
 * verified last, so a verified correction supersedes the figure it corrects (OP-4). Unverified never counts (R6).
 */
export function latestVerified(updates: readonly ProgressUpdate[], contractObjectiveId: string, now: ISODate): ProgressUpdate | null {
  const v = updates
    .filter((u) => u.contractObjectiveId === contractObjectiveId && u.verified !== null && u.periodEnd <= now)
    .sort((a, b) => (a.periodEnd !== b.periodEnd ? (a.periodEnd < b.periodEnd ? -1 : 1) : instant(a.verified!.at) - instant(b.verified!.at)));
  return v[v.length - 1] ?? null;
}

/** What a new figure is compared with: the latest verified figure for a period up to and including its own, other than itself. */
export function previousVerified(updates: readonly ProgressUpdate[], u: { id?: string; contractObjectiveId: string; periodEnd: ISODate }): ProgressUpdate | null {
  return latestVerified(updates.filter((x) => x.id !== u.id), u.contractObjectiveId, u.periodEnd);
}

/** Where a stored update stands. "Waiting to send" and "Couldn't be sent" exist only on the device. */
export type UpdateState = 'sent' | 'verified' | 'returned';
export const updateState = (u: ProgressUpdate): UpdateState => (u.verified ? 'verified' : u.returned ? 'returned' : 'sent');

/** A verified update that a later verified update for the same period has superseded (OP-4). Both are kept. */
export const isSuperseded = (updates: readonly ProgressUpdate[], u: ProgressUpdate): boolean =>
  !!u.verified && updates.some((x) => x !== u && x.contractObjectiveId === u.contractObjectiveId && x.periodEnd === u.periodEnd && !!x.verified && instant(x.verified.at) > instant(u.verified!.at));

/**
 * On arrival, the unverified updates a new one replaces (OP-5): the same objective and period, not yet verified.
 * They leave the record list and stay in the audit trail. A verified figure is never replaced; a new one corrects it.
 */
export const replacedBy = (updates: readonly ProgressUpdate[], incoming: { contractObjectiveId: string; periodEnd: ISODate }): ProgressUpdate[] =>
  updates.filter((u) => u.contractObjectiveId === incoming.contractObjectiveId && u.periodEnd === incoming.periodEnd && !u.verified);

/** Marks for the supervisor (OP-9 and the device-time rule). They inform; they never block verification. */
export type ProgressMark = 'lower' | 'saved_time' | 'source_changed';

export function marksFor(s: Store, u: ProgressUpdate): ProgressMark[] {
  const out: ProgressMark[] = [];
  const prev = previousVerified(s.progressUpdates, u);
  if (prev && u.quantityDone !== null && prev.quantityDone !== null && u.quantityDone < prev.quantityDone) out.push('lower');
  if (u.sync.syncedAt && savedTimeLooksWrong(u.sync.capturedAt, u.sync.syncedAt)) out.push('saved_time');
  const co = s.contractObjectives.find((x) => x.id === u.contractObjectiveId);
  const a = co && s.activities.find((x) => x.id === co.sourceActivityId);
  if (co?.snapshot && a && activityFingerprint(a) !== co.snapshot.sourceFingerprint) out.push('source_changed');
  return out;
}

/** OP-9, on the device before saving: a figure below the last verified one needs a reason. */
export const isLowerThanLast = (s: Store, contractObjectiveId: string, periodEnd: ISODate, quantity: number): number | null => {
  const prev = latestVerified(s.progressUpdates, contractObjectiveId, periodEnd);
  return prev && prev.quantityDone !== null && quantity < prev.quantityDone ? prev.quantityDone : null;
};

export type ArrivalError = 'contract_not_signed' | 'objective_missing' | 'outside_year' | 'position_not_held';

/**
 * What the server checks when an update arrives: the contract is still signed, the objective still exists, the
 * period is within the contract's financial year, and the person held the contract's position at the period's end.
 * A failure stays on the device as "Couldn't be sent"; nothing is lost silently.
 */
export function arrivalCheck(s: Store, incoming: { contractObjectiveId: string; periodEnd: ISODate; personId: string }): ArrivalError | null {
  const co = s.contractObjectives.find((x) => x.id === incoming.contractObjectiveId);
  if (!co) return 'objective_missing';
  const c = s.contracts.find((x) => x.id === co.contractId);
  if (!c) return 'objective_missing';
  if (c.status !== 'signed') return 'contract_not_signed';
  const { start, end } = financialYearBounds(c.financialYear, s.organisation.financialYearStartMonth);
  if (incoming.periodEnd < start || incoming.periodEnd > end) return 'outside_year';
  const held = s.assignments.some((a) => a.personId === incoming.personId && a.positionId === c.positionId && a.from <= incoming.periodEnd && (a.to === null || a.to >= incoming.periodEnd));
  if (!held || c.personId !== incoming.personId) return 'position_not_held';
  return null;
}

/** People holding a position on a date, substantive or acting. */
const holdersAt = (s: Store, positionId: string, at: ISODate): string[] =>
  s.assignments.filter((a) => a.positionId === positionId && a.from <= at && (a.to === null || a.to >= at)).map((a) => a.personId);

/**
 * Who verifies (OP-6): the position the employee's position reports to, held substantively or acting. If it is
 * vacant, or its only holders are the employee, the next position up the reporting line. Null when nobody above
 * can. Nobody verifies their own update.
 */
export function verifierPosition(s: Store, c: PerformanceContract, at: ISODate): string | null {
  const seen = new Set<string>();
  let pid = s.positions.find((p) => p.id === c.positionId)?.reportsToPositionId ?? null;
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    if (holdersAt(s, pid, at).some((person) => person !== c.personId)) return pid;
    pid = s.positions.find((p) => p.id === pid)?.reportsToPositionId ?? null;
  }
  return null;
}

/** Whether a person, holding these positions on a date, may verify or return an update on this contract. */
export const mayVerify = (s: Store, c: PerformanceContract, person: { personId: string; positionIds: readonly string[] }, at: ISODate): boolean => {
  if (c.personId === person.personId) return false;
  const v = verifierPosition(s, c, at);
  return !!v && person.positionIds.includes(v);
};

/**
 * OP-10: the period an employee is asked to report, once it has ended with no update for it (a figure sent,
 * verified, returned or waiting on the device all count as an update). Only the latest ended period is asked for:
 * figures are cumulative, so one figure covers the months before it. Null when nothing is due.
 */
export function duePeriod(s: Store, co: ContractObjective, fy: number, now: ISODate, waitingPeriods: readonly ISODate[] = []): ISODate | null {
  const ended = endedPeriods(fy, s.organisation.financialYearStartMonth, frequencyOf(s, co), now);
  const last = ended[ended.length - 1];
  if (!last) return null;
  const has = s.progressUpdates.some((u) => u.contractObjectiveId === co.id && u.periodEnd === last) || waitingPeriods.includes(last);
  return has ? null : last;
}

/** A returned update still waiting for a corrected figure (OP-2): no later update has arrived for its period. */
export const returnedOpen = (s: Store, contractObjectiveId: string): ProgressUpdate[] =>
  s.progressUpdates.filter((u) => u.contractObjectiveId === contractObjectiveId && !u.verified && !!u.returned);

/** Updates waiting for a decision: arrived, neither verified nor returned. */
export const awaitingDecision = (s: Store): ProgressUpdate[] => s.progressUpdates.filter((u) => !u.verified && !u.returned);

/** A figure entered on a form: a whole number, zero or more. */
export const parseFigure = (raw: string): number | null => {
  const t = raw.replace(/[\s,]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** The device clock may be wrong: true when the saved time is later than arrival (marked, never rejected). */
export const savedTimeLooksWrong = (capturedAt: ISODateTime, syncedAt: ISODateTime): boolean => instant(capturedAt) > instant(syncedAt);
