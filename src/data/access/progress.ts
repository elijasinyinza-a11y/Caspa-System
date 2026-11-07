/**
 * Progress capture (slice 13; Offline Progress Capture Specification v1.0, BUILD-BRIEF section 39). Employees report
 * progress on their own contract objectives, offline if need be; whoever verifies (OP-6) verifies or returns each
 * update; activity and KPI owners record their figures online. Every write is checked here against the matrix
 * (contract v1.10) and leaves an audit entry. Rules come from src/rules/progress.ts; nothing computed is stored.
 */
import type {
  AuditEntry, ContractObjective, ISODate, ISODateTime, KpiActual, ActivityProgress, PerformanceContract, ProgressUpdate,
  ReportingFrequency,
} from '../../contract/caspa-data-contract';
import { expectedToDate, financialYearBounds, statusFor, type ProgressStatus } from '../../rules/kpi-progress';
import {
  arrivalCheck, awaitingDecision, duePeriod, endedPeriods, frequencyOf, instant, isLowerThanLast, isSuperseded, latestVerified,
  marksFor, mayVerify, parseFigure, periodEnds, previousVerified, replacedBy, updateState, verifierPosition,
  type ArrivalError, type ProgressMark,
} from '../../rules/progress';
import { holderOf, refActivity, type NodeRef } from '../../selectors/node';
import { dateInZone, formatDate } from '../../selectors/format';
import type { NeedsYouItem } from '../../selectors/needs-you';
import { en } from '../../strings/en';
import { can } from './permissions';
import type { Device, DeviceDecision, DeviceUpdate } from './device';
import { fromShares } from '../../rules/targets';
import type { Store } from './store';
import type { Viewer } from './viewer';

export interface ObjectiveCard {
  id: string;
  title: string;
  target: { value: number; unit: string } | null;
  unit: string;
  frequency: ReportingFrequency;
  activity: NodeRef | null;
  verified: { done: number; periodEnd: ISODate } | null;
  /** True share of the personal target (verified only), clamped share for the bar, and P10 status against the year elapsed. */
  share: number | null;
  clamped: number | null;
  status: ProgressStatus;
  /** Periods that may be reported, newest first. */
  periods: ISODate[];
  /** The period asked for in "Needs you" (OP-10), or null. */
  due: ISODate | null;
  /** A returned update still waiting for a corrected figure. */
  returned: { updateId: string; periodEnd: ISODate; quantityDone: number | null; reason: string; by: string; on: ISODate } | null;
  /** The latest update not yet verified (sent, waiting or couldn't be sent), for the landing card. */
  pending: { state: RowState; periodEnd: ISODate; quantityDone: number | null } | null;
  /** Per period: an unverified figure already sent, and a verified one, for the form's notes. */
  sentByPeriod: Record<string, number | null>;
  verifiedByPeriod: Record<string, number | null>;
}

export type RowState = 'waiting' | 'failed' | 'sent' | 'verified' | 'returned';

export interface UpdateRow {
  id: string;
  onDevice: boolean;
  state: RowState;
  contractObjectiveId: string;
  objectiveTitle: string;
  unit: string;
  frequency: ReportingFrequency;
  periodEnd: ISODate;
  quantityDone: number | null;
  note: string;
  evidence: string;
  savedAt: ISODateTime;
  savedOffline: boolean;
  sentAt: ISODateTime | null;
  verified: { by: string; on: ISODate } | null;
  returned: { by: string; on: ISODate; reason: string } | null;
  failure: ArrivalError | null;
  superseded: boolean;
}

export interface VerifyCard {
  id: string;
  person: string;
  firstName: string;
  position: string;
  objectiveTitle: string;
  unit: string;
  frequency: ReportingFrequency;
  activity: NodeRef | null;
  periodEnd: ISODate;
  quantityDone: number | null;
  previous: { done: number | null; periodEnd: ISODate } | null;
  target: { value: number; unit: string } | null;
  note: string;
  evidence: string;
  savedAt: ISODateTime;
  savedOffline: boolean;
  arrivedAt: ISODateTime | null;
  marks: ProgressMark[];
  /** A decision taken offline and waiting to send. */
  queued: 'verify' | 'return' | null;
}

export interface TeamRow {
  positionId: string;
  position: string;
  person: string | null;
  contract: PerformanceContract['status'] | null;
  /** Updates from this person waiting for this viewer's decision. */
  waiting: number;
}

export interface ProgressPage {
  financialYear: number;
  /** The year's first day, for "the total since …". */
  yearStart: ISODate;
  mine: null | {
    contractId: string;
    position: string;
    signedOn: ISODate | null;
    verifier: string | null;
    objectives: ObjectiveCard[];
    updates: UpdateRow[];
  };
  /** Null when this viewer verifies nobody's updates this year. */
  verify: VerifyCard[] | null;
  /** v0.25.0 (F6): share readings waiting for this viewer, verified here with contract updates. */
  shareReadings: { id: string; shareId: string; person: string; unit: string; kpi: string; periodEnd: ISODate; value: number; kpiUnit: string; target: number; savedOffline: boolean }[];
  queued: { id: string; decision: 'verify' | 'return'; quantityDone: number | null; unit: string; periodEnd: ISODate; frequency: ReportingFrequency }[];
  notices: { id: string; periodEnd: ISODate; quantityDone: number | null; unit: string; frequency: ReportingFrequency; person: string }[];
  /** Mine when an update is due or returned, otherwise To verify (section 39). */
  opensOn: 'mine' | 'verify';
}

export interface PerformanceLanding {
  financialYear: number;
  expected: number;
  mine: ProgressPage['mine'];
  team: TeamRow[] | null;
}

export interface SendResult { sent: number; failed: number; decisions: number; notApplied: number }

export type SaveError = 'not_found' | 'not_allowed' | 'figure_required' | 'figure_invalid' | 'reason_required' | 'period_invalid' | 'locked';
export type DecideError = 'not_found' | 'not_allowed' | 'already_decided' | 'return_reason';
export type RecordError = 'not_found' | 'not_allowed' | 'figure_required' | 'figure_invalid' | 'period_invalid' | 'offline' | 'from_shares';

export interface RecordForm {
  periods: ISODate[];
  frequency: ReportingFrequency;
  unit: string | null;
  /** Figures already recorded, by period end. */
  recorded: Record<string, number | null>;
  latest: { value: number | null; periodEnd: ISODate } | null;
  /** Activity pages only (OP-12): the verified total of the contract objectives drawn from it, for reference. */
  contractTotal: { value: number; unit: string } | null;
  /** v0.25.0 (F2): the KPI's figure comes from its shares this year, so its own readings are closed. */
  fromShares?: boolean;
}

export interface ProgressAccess {
  offline(): boolean;
  /** Development switch "Work offline" (OP-7). Going back online sends what waits, in the order saved. */
  setOffline(off: boolean): SendResult | null;
  /** Counts for the top bar: this person's unsent updates and decisions, and those that couldn't be sent. */
  waiting(): { updates: number; decisions: number; failed: number };
  landing(): PerformanceLanding;
  page(): ProgressPage;
  save(input: { contractObjectiveId: string; periodEnd: string; quantity: string; note: string; evidence: string; editId?: string }):
    { ok: true; queued: boolean; sent: SendResult | null } | { ok: false; error: SaveError };
  /** Delete an unsent update from the device. */
  remove(id: string): { ok: boolean };
  /** Send what waits, including updates that couldn't be sent before. */
  retry(id: string): SendResult | null;
  send(): SendResult;
  verify(updateId: string): { ok: true; queued: boolean } | { ok: false; error: DecideError };
  returnUpdate(updateId: string, reason: string): { ok: true; queued: boolean } | { ok: false; error: DecideError };
  dismissNotice(id: string): void;
  activityForm(activityId: string): RecordForm | null;
  recordActivity(activityId: string, periodEnd: string, quantity: string, note: string): { ok: true } | { ok: false; error: RecordError };
  kpiForm(kpiId: string): RecordForm | null;
  recordKpi(kpiId: string, periodEnd: string, value: string): { ok: true } | { ok: false; error: RecordError };
  /**
   * "Needs you" items (OP-10): for the employee, a period that has ended with no update, or a returned update waiting
   * for a corrected figure; for whoever verifies, how many updates wait. Undated, so they never show as overdue; no
   * escalation in this slice.
   */
  needs(): NeedsYouItem[];
}

interface Ctx {
  s: Store;
  viewer: Viewer;
  now: ISODate;
  financialYear: number;
  clock: () => ISODateTime;
  device: Device;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  changed: () => void;
}

export function createProgressAccess(c: Ctx): ProgressAccess {
  const { s, viewer: v, now, financialYear: fy, device } = c;
  const startMonth = s.organisation.financialYearStartMonth;
  const tz = s.organisation.timeZone;
  const on = (at: string) => dateInZone(at, tz);
  const me = v.membershipId as string;
  const personName = (membershipId: string) => {
    const m = s.memberships.find((x) => x.id === membershipId);
    return s.people.find((p) => p.id === m?.personId)?.fullName ?? '';
  };
  const contractOfObjective = (co: ContractObjective) => s.contracts.find((x) => x.id === co.contractId);
  const unitOf = (co: ContractObjective) => (co.snapshot?.quantityTarget ?? co.quantityTarget)?.unit ?? '';
  const titleOf = (co: ContractObjective) => co.snapshot?.title ?? co.title;
  const activityRef = (co: ContractObjective) => {
    const a = s.activities.find((x) => x.id === co.sourceActivityId);
    return a ? refActivity(a) : null;
  };
  const mine = () => device.outbox.filter((x): x is DeviceUpdate => x.kind === 'update' && x.membershipId === me);
  const myDecisions = () => device.outbox.filter((x): x is DeviceDecision => x.kind === 'decision' && x.membershipId === me);
  const isOffline = () => !!device.offline[me];
  const next = () => device.seq++;

  /** This viewer's signed contract for the year: the one they report on. */
  const myContract = () => s.contracts.find((x) => x.personId === v.personId && x.financialYear === fy && x.status === 'signed');
  const verifierName = (con: PerformanceContract) => {
    const pid = verifierPosition(s, con, now);
    return pid ? holderOf(s, pid, now)?.person ?? null : null;
  };
  const reportable = (co: ContractObjective): ISODate[] => {
    const freq = frequencyOf(s, co);
    const ended = endedPeriods(fy, startMonth, freq, now);
    // Before the first period has ended, the current one may still be reported (figures are cumulative to date).
    const list = ended.length ? ended : periodEnds(fy, startMonth, freq).slice(0, 1);
    return [...list].reverse();
  };

  const objectiveCard = (co: ContractObjective): ObjectiveCard => {
    const target = co.snapshot?.quantityTarget ?? co.quantityTarget;
    const ver = latestVerified(s.progressUpdates, co.id, now);
    const done = ver?.quantityDone ?? null;
    const share = done !== null && target && target.value > 0 ? done / target.value : null;
    const expected = expectedToDate(fy, startMonth, now);
    const status: ProgressStatus = share === null ? 'no_data' : statusFor(share, expected, s.organisation.settings.kpiStatus);
    const ret = s.progressUpdates
      .filter((u) => u.contractObjectiveId === co.id && !u.verified && u.returned)
      .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0];
    const waitingPeriods = mine().filter((x) => x.contractObjectiveId === co.id).map((x) => x.periodEnd);
    const rows = rowsFor(co.id);
    const pendingRow = rows.filter((r) => r.state !== 'verified').sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0];
    const sentByPeriod: Record<string, number | null> = {};
    const verifiedByPeriod: Record<string, number | null> = {};
    for (const u of s.progressUpdates.filter((x) => x.contractObjectiveId === co.id)) {
      if (u.verified) { if (!isSuperseded(s.progressUpdates, u)) verifiedByPeriod[u.periodEnd] = u.quantityDone; }
      else if (!u.returned) sentByPeriod[u.periodEnd] = u.quantityDone;
    }
    return {
      id: co.id, title: titleOf(co), target, unit: unitOf(co), frequency: frequencyOf(s, co), activity: activityRef(co),
      verified: ver && done !== null ? { done, periodEnd: ver.periodEnd } : null,
      share, clamped: share === null ? null : Math.min(1, Math.max(0, share)), status,
      periods: reportable(co),
      due: ret ? null : duePeriod(s, co, fy, now, waitingPeriods),
      returned: ret && ret.returned ? { updateId: ret.id, periodEnd: ret.periodEnd, quantityDone: ret.quantityDone, reason: ret.returned.reason, by: personName(ret.returned.by.byMembershipId), on: on(ret.returned.by.at) } : null,
      pending: pendingRow ? { state: pendingRow.state, periodEnd: pendingRow.periodEnd, quantityDone: pendingRow.quantityDone } : null,
      sentByPeriod, verifiedByPeriod,
    };
  };

  function rowsFor(contractObjectiveId?: string): UpdateRow[] {
    const con = myContract();
    if (!con) return [];
    const objectives = s.contractObjectives.filter((x) => x.contractId === con.id && (!contractObjectiveId || x.id === contractObjectiveId));
    const out: UpdateRow[] = [];
    for (const co of objectives) {
      const base = { contractObjectiveId: co.id, objectiveTitle: titleOf(co), unit: unitOf(co), frequency: frequencyOf(s, co) };
      for (const d of mine().filter((x) => x.contractObjectiveId === co.id)) {
        out.push({
          ...base, id: d.id, onDevice: true, state: d.failure ? 'failed' : 'waiting', periodEnd: d.periodEnd, quantityDone: d.quantityDone,
          note: d.note, evidence: d.evidence, savedAt: d.capturedAt, savedOffline: d.capturedOffline, sentAt: null, verified: null, returned: null,
          failure: d.failure, superseded: false,
        });
      }
      for (const u of s.progressUpdates.filter((x) => x.contractObjectiveId === co.id && can(s, v, 'view', { type: 'ProgressUpdate', id: x.id }))) {
        out.push({
          ...base, id: u.id, onDevice: false, state: updateState(u), periodEnd: u.periodEnd, quantityDone: u.quantityDone, note: u.note, evidence: u.evidence,
          savedAt: u.sync.capturedAt, savedOffline: u.sync.capturedOffline, sentAt: u.sync.syncedAt,
          verified: u.verified ? { by: personName(u.verified.byMembershipId), on: on(u.verified.at) } : null,
          returned: u.returned ? { by: personName(u.returned.by.byMembershipId), on: on(u.returned.by.at), reason: u.returned.reason } : null,
          failure: null, superseded: isSuperseded(s.progressUpdates, u),
        });
      }
    }
    return out.sort((a, b) => (a.periodEnd !== b.periodEnd ? (a.periodEnd < b.periodEnd ? 1 : -1) : instant(b.sentAt ?? b.savedAt) - instant(a.sentAt ?? a.savedAt)));
  }

  const mineView = (): ProgressPage['mine'] => {
    const con = myContract();
    if (!con || !can(s, v, 'view', { type: 'PerformanceContract', id: con.id })) return null;
    return {
      contractId: con.id,
      position: s.positions.find((p) => p.id === con.positionId)?.title ?? '',
      signedOn: con.signedByEmployee ? on(con.signedByEmployee.at) : null,
      verifier: verifierName(con),
      objectives: s.contractObjectives.filter((x) => x.contractId === con.id).map(objectiveCard),
      updates: rowsFor(),
    };
  };

  /** Contracts this viewer verifies this year (OP-6). */
  const verifiedContracts = () =>
    s.contracts.filter((x) => x.financialYear === fy && x.status === 'signed' && mayVerify(s, x, { personId: v.personId, positionIds: v.positionIds }, now));

  const verifyCards = (): VerifyCard[] | null => {
    const contracts = verifiedContracts();
    if (!contracts.length) return null;
    const ids = new Set(contracts.map((x) => x.id as string));
    return awaitingDecision(s)
      .filter((u) => {
        const co = s.contractObjectives.find((x) => x.id === u.contractObjectiveId);
        return !!co && ids.has(co.contractId) && can(s, v, 'approve', { type: 'ProgressUpdate', id: u.id });
      })
      .sort((a, b) => instant(a.sync.syncedAt ?? a.sync.capturedAt) - instant(b.sync.syncedAt ?? b.sync.capturedAt))
      .map((u) => {
        const co = s.contractObjectives.find((x) => x.id === u.contractObjectiveId)!;
        const con = contractOfObjective(co)!;
        const person = s.people.find((p) => p.id === con.personId)?.fullName ?? '';
        const prev = previousVerified(s.progressUpdates, u);
        const queued = myDecisions().find((d) => d.updateId === u.id)?.decision ?? null;
        return {
          id: u.id, person, firstName: person.split(' ')[0] ?? person, position: s.positions.find((p) => p.id === con.positionId)?.title ?? '',
          objectiveTitle: titleOf(co), unit: unitOf(co), frequency: frequencyOf(s, co), activity: activityRef(co),
          periodEnd: u.periodEnd, quantityDone: u.quantityDone, previous: prev ? { done: prev.quantityDone, periodEnd: prev.periodEnd } : null,
          target: co.snapshot?.quantityTarget ?? co.quantityTarget, note: u.note, evidence: u.evidence,
          savedAt: u.sync.capturedAt, savedOffline: u.sync.capturedOffline, arrivedAt: u.sync.syncedAt, marks: marksFor(s, u), queued,
        };
      });
  };

  /** F6: share readings this viewer verifies (the owner's supervisor; never their own). */
  const shareCards = (): ProgressPage['shareReadings'] => s.shareReadings
    .filter((r) => {
      const sh = s.kpiShares.find((x) => x.id === r.shareId);
      const sup = s.positions.find((p) => p.id === sh?.ownerPositionId)?.reportsToPositionId;
      return !!sh && !r.verified && !r.returned && !!sup && v.positionIds.includes(sup) && r.created.byMembershipId !== v.membershipId;
    })
    .sort((a, b) => (a.created.at < b.created.at ? -1 : 1))
    .map((r) => {
      const sh = s.kpiShares.find((x) => x.id === r.shareId)!;
      const b = s.kpiBreakdowns.find((x) => x.id === sh.breakdownId);
      const k = s.kpis.find((x) => x.id === b?.kpiId);
      const a = s.assignments.find((x) => x.positionId === sh.ownerPositionId && x.from <= now && (x.to === null || x.to >= now));
      return { id: r.id, shareId: sh.id, person: s.people.find((p) => p.id === a?.personId)?.fullName ?? '', unit: s.units.find((u) => u.id === sh.unitId)?.name ?? '', kpi: k ? `${k.code} ${k.name}` : '', periodEnd: r.periodEnd, value: r.value, kpiUnit: k?.unit ?? '', target: sh.target, savedOffline: r.savedOffline };
    });

  const page = (): ProgressPage => {
    const m = mineView();
    const shares = shareCards();
    const verify = verifyCards() ?? (shares.length ? [] : null);
    const unitFor = (coId: string) => {
      const co = s.contractObjectives.find((x) => x.id === coId);
      return co ? { unit: unitOf(co), frequency: frequencyOf(s, co) } : { unit: '', frequency: 'monthly' as ReportingFrequency };
    };
    const asksMine = !!m && m.objectives.some((o) => o.due || o.returned);
    return {
      financialYear: fy,
      yearStart: financialYearBounds(fy, startMonth).start,
      mine: m,
      verify,
      shareReadings: shares,
      queued: myDecisions().map((d) => {
        const u = s.progressUpdates.find((x) => x.id === d.updateId);
        return { id: d.id, decision: d.decision, quantityDone: u?.quantityDone ?? null, periodEnd: u?.periodEnd ?? now, ...unitFor(u?.contractObjectiveId ?? '') };
      }),
      notices: device.notices.filter((n) => n.membershipId === me).map((n) => ({ id: n.id, periodEnd: n.periodEnd, quantityDone: n.quantityDone, person: n.personName, ...unitFor(n.contractObjectiveId) })),
      opensOn: m && (asksMine || !verify) ? 'mine' : 'verify',
    };
  };

  const team = (): TeamRow[] | null => {
    const contracts = verifiedContracts();
    const direct = s.positions.filter((p) => p.reportsToPositionId && v.positionIds.includes(p.reportsToPositionId));
    const positionIds = [...new Set([...direct.map((p) => p.id as string), ...contracts.map((x) => x.positionId as string)])];
    if (!positionIds.length) return null;
    const waiting = awaitingDecision(s);
    return positionIds.map((pid) => {
      const con = s.contracts.find((x) => x.positionId === pid && x.financialYear === fy);
      const visible = con && can(s, v, 'view', { type: 'PerformanceContract', id: con.id });
      const n = con && contracts.includes(con)
        ? waiting.filter((u) => s.contractObjectives.some((co) => co.id === u.contractObjectiveId && co.contractId === con.id)).length
        : 0;
      return { positionId: pid, position: s.positions.find((p) => p.id === pid)?.title ?? '', person: holderOf(s, pid, now)?.person ?? null, contract: visible ? con.status : null, waiting: n };
    });
  };

  /* ───────── Sending: in the order saved; arrival checks; OP-4, OP-5 ───────── */

  const send = (): SendResult => {
    const result: SendResult = { sent: 0, failed: 0, decisions: 0, notApplied: 0 };
    const queue = mine().filter((x) => !x.failure).sort((a, b) => instant(a.capturedAt) - instant(b.capturedAt) || a.seq - b.seq);
    for (const d of queue) {
      const failure = arrivalCheck(s, { contractObjectiveId: d.contractObjectiveId, periodEnd: d.periodEnd, personId: v.personId });
      if (failure) {
        d.failure = failure;
        result.failed++;
        continue;
      }
      const syncedAt = c.clock();
      for (const old of replacedBy(s.progressUpdates, d)) {
        s.progressUpdates.splice(s.progressUpdates.indexOf(old), 1);
        c.audit('replace', { type: 'ProgressUpdate', id: old.id }, old, { replacedBy: `pu-${d.id}` });
      }
      const stamp = { at: syncedAt, byMembershipId: v.membershipId };
      const u: ProgressUpdate = {
        orgId: s.organisation.id, id: `pu-${d.id}` as ProgressUpdate['id'], contractObjectiveId: d.contractObjectiveId as ProgressUpdate['contractObjectiveId'],
        periodEnd: d.periodEnd, quantityDone: d.quantityDone, note: d.note, evidence: d.evidence, verified: null, returned: null,
        sync: { capturedOffline: d.capturedOffline, capturedAt: d.capturedAt, syncedAt }, created: stamp, updated: stamp,
      };
      s.progressUpdates.push(u);
      c.audit('create', { type: 'ProgressUpdate', id: u.id }, null, u);
      device.outbox.splice(device.outbox.indexOf(d), 1);
      result.sent++;
    }
    for (const d of myDecisions().sort((a, b) => a.seq - b.seq)) {
      device.outbox.splice(device.outbox.indexOf(d), 1);
      const u = s.progressUpdates.find((x) => x.id === d.updateId);
      const fresh = u && !u.verified && !u.returned && u.updated.at === d.seenUpdatedAt && can(s, v, 'approve', { type: 'ProgressUpdate', id: u.id });
      if (!fresh) {
        const co = u && s.contractObjectives.find((x) => x.id === u.contractObjectiveId);
        const con = co && contractOfObjective(co);
        const seen = c.s.auditEntries.find((a) => a.action === 'replace' && a.entity.id === d.updateId)?.before as ProgressUpdate | undefined;
        const ref = u ?? seen;
        const refCo = ref && s.contractObjectives.find((x) => x.id === ref.contractObjectiveId);
        const refCon = con ?? (refCo && contractOfObjective(refCo));
        device.notices.push({
          id: `nt-${next()}`, membershipId: me, contractObjectiveId: ref?.contractObjectiveId ?? '', periodEnd: ref?.periodEnd ?? now,
          quantityDone: ref?.quantityDone ?? null, personName: s.people.find((p) => p.id === refCon?.personId)?.fullName ?? '',
        });
        result.notApplied++;
        continue;
      }
      apply(u!, d.decision, d.reason, d.decidedAt);
      result.decisions++;
    }
    if (result.sent || result.failed || result.decisions || result.notApplied) c.changed();
    return result;
  };

  const apply = (u: ProgressUpdate, decision: 'verify' | 'return', reason: string, at: ISODateTime) => {
    const before = { verified: u.verified, returned: u.returned };
    const stamp = { at, byMembershipId: v.membershipId };
    if (decision === 'verify') u.verified = stamp;
    else u.returned = { reason, by: stamp };
    u.updated = stamp;
    c.audit(decision, { type: 'ProgressUpdate', id: u.id }, before, { verified: u.verified, returned: u.returned });
  };

  const decide = (updateId: string, decision: 'verify' | 'return', reason: string): { ok: true; queued: boolean } | { ok: false; error: DecideError } => {
    const u = s.progressUpdates.find((x) => x.id === updateId);
    if (!u || !can(s, v, 'view', { type: 'ProgressUpdate', id: u.id })) return { ok: false, error: 'not_found' };
    if (!can(s, v, 'approve', { type: 'ProgressUpdate', id: u.id })) return { ok: false, error: 'not_allowed' };
    if (u.verified || u.returned || myDecisions().some((d) => d.updateId === u.id)) return { ok: false, error: 'already_decided' };
    const text = reason.trim();
    if (decision === 'return' && !text) return { ok: false, error: 'return_reason' };
    if (isOffline()) {
      device.outbox.push({ kind: 'decision', id: `dd-${next()}`, membershipId: me, updateId: u.id, seenUpdatedAt: u.updated.at, decision, reason: text, decidedAt: c.clock(), seq: next() });
      c.changed();
      return { ok: true, queued: true };
    }
    apply(u, decision, text, c.clock());
    c.changed();
    return { ok: true, queued: false };
  };

  /* ───────── Activity and KPI figures: online, by the owner (OP-1, OP-12) ───────── */

  const recordPeriods = (freq: ReportingFrequency) => {
    const all = periodEnds(fy, startMonth, freq);
    const ended = all.filter((e) => e < now);
    const current = all.find((e) => e >= now);
    return [...(current ? [current] : []), ...[...ended].reverse()];
  };

  const activityForm = (activityId: string): RecordForm | null => {
    const a = s.activities.find((x) => x.id === activityId && x.financialYear === fy);
    if (!a || !can(s, v, 'draft', { type: 'ActivityProgress', id: a.id })) return null;
    const recs = s.activityProgress.filter((x) => x.activityId === a.id);
    const latest = [...recs].filter((x) => x.periodEnd <= now).sort((x, y) => (x.periodEnd < y.periodEnd ? -1 : 1)).pop();
    // OP-12: the verified total of contract objectives drawn from this activity, for reference; nothing is copied.
    const cos = s.contractObjectives.filter((co) => co.sourceActivityId === a.id && s.contracts.some((x) => x.id === co.contractId && x.financialYear === fy && x.status === 'signed'));
    const done = cos.map((co) => latestVerified(s.progressUpdates, co.id, now)?.quantityDone ?? null).filter((x): x is number => x !== null);
    return {
      periods: recordPeriods(a.reportingFrequency), frequency: a.reportingFrequency, unit: a.quantityTarget?.unit ?? null,
      recorded: Object.fromEntries(recs.map((x) => [x.periodEnd, x.quantityDone])),
      latest: latest ? { value: latest.quantityDone, periodEnd: latest.periodEnd } : null,
      contractTotal: done.length && a.quantityTarget ? { value: done.reduce((n, x) => n + x, 0), unit: a.quantityTarget.unit } : null,
    };
  };

  const kpiForm = (kpiId: string): RecordForm | null => {
    const k = s.kpis.find((x) => x.id === kpiId);
    if (!k || !can(s, v, 'draft', { type: 'KpiActual', id: k.id })) return null;
    const { start, end } = financialYearBounds(fy, startMonth);
    const recs = s.kpiActuals.filter((x) => x.kpiId === k.id && x.periodEnd >= start && x.periodEnd <= end);
    const latest = [...recs].filter((x) => x.periodEnd <= now).sort((x, y) => (x.periodEnd < y.periodEnd ? -1 : 1)).pop();
    return {
      periods: recordPeriods(k.reportingFrequency), frequency: k.reportingFrequency, unit: k.unit,
      recorded: Object.fromEntries(recs.map((x) => [x.periodEnd, x.value])),
      latest: latest ? { value: latest.value, periodEnd: latest.periodEnd } : null, contractTotal: null,
      fromShares: !!fromShares(s, k.id, fy as never, start, now),
    };
  };

  const needs = (): NeedsYouItem[] => {
    const items: NeedsYouItem[] = [];
    const item = (i: Omit<NeedsYouItem, 'due' | 'daysOverdue' | 'severity'>): NeedsYouItem => ({ ...i, due: null, daysOverdue: null, severity: null });
    const C = en.capture.needs;
    for (const o of mineView()?.objectives ?? []) {
      if (o.returned) {
        const p = en.capture.periodName(o.frequency, o.returned.periodEnd);
        items.push(item({ key: `progress:correct:${o.returned.updateId}`, kind: 'deadline', title: C.correct(p), detail: C.returnedDetail(o.title, o.returned.by), as: 'employee', link: { kind: 'progress', tab: 'mine', objectiveId: o.id } }));
      } else if (o.due) {
        const p = en.capture.periodName(o.frequency, o.due);
        items.push(item({ key: `progress:report:${o.id}:${o.due}`, kind: 'deadline', title: C.report(p), detail: C.endedDetail(o.title, p.charAt(0).toUpperCase() + p.slice(1), formatDate(o.due)), as: 'employee', link: { kind: 'progress', tab: 'mine', objectiveId: o.id } }));
      }
    }
    const cards = (verifyCards() ?? []).filter((x) => !x.queued);
    if (cards.length) {
      const people = [...new Set(cards.map((x) => `${x.person}, ${x.position}`))];
      items.push(item({ key: 'progress:verify', kind: 'approval', title: C.verify(cards.length), detail: C.verifyDetail(en.list(people)), as: 'supervisor', link: { kind: 'progress', tab: 'verify' } }));
    }
    return items;
  };

  return {
    needs,
    offline: isOffline,
    setOffline(off) {
      const was = isOffline();
      device.offline[me] = off;
      c.changed();
      return was && !off ? send() : null;
    },
    waiting: () => ({ updates: mine().filter((x) => !x.failure).length, decisions: myDecisions().length, failed: mine().filter((x) => x.failure).length }),
    landing: () => ({ financialYear: fy, expected: expectedToDate(fy, startMonth, now), mine: mineView(), team: v.isSupervisor || verifiedContracts().length ? team() : null }),
    page,
    save(input) {
      const co = s.contractObjectives.find((x) => x.id === input.contractObjectiveId);
      const con = co && contractOfObjective(co);
      if (!co || !con || con.id !== myContract()?.id) return { ok: false, error: 'not_found' };
      if (!can(s, v, 'draft', { type: 'ProgressUpdate', id: co.id })) return { ok: false, error: 'not_allowed' };
      const editing = input.editId ? mine().find((x) => x.id === input.editId) : undefined;
      if (input.editId && !editing) return { ok: false, error: 'locked' };
      if (!reportable(co).includes(input.periodEnd as ISODate) && !(editing && editing.periodEnd === input.periodEnd)) return { ok: false, error: 'period_invalid' };
      if (!input.quantity.trim()) return { ok: false, error: 'figure_required' };
      const q = parseFigure(input.quantity);
      if (q === null) return { ok: false, error: 'figure_invalid' };
      const periodEnd = input.periodEnd as ISODate;
      if (isLowerThanLast(s, co.id, periodEnd, q) !== null && !input.note.trim()) return { ok: false, error: 'reason_required' };
      const at = c.clock();
      const fields = { periodEnd, quantityDone: q, note: input.note.trim(), evidence: input.evidence.trim(), capturedAt: at };
      if (editing) Object.assign(editing, fields, { failure: null });
      else device.outbox.push({ kind: 'update', id: `dv-${next()}`, membershipId: me, contractObjectiveId: co.id, capturedOffline: isOffline(), seq: next(), failure: null, ...fields });
      if (isOffline()) { c.changed(); return { ok: true, queued: true, sent: null }; }
      const sent = send();
      c.changed();
      return { ok: true, queued: false, sent };
    },
    remove(id) {
      const d = mine().find((x) => x.id === id);
      if (!d) return { ok: false };
      device.outbox.splice(device.outbox.indexOf(d), 1);
      c.changed();
      return { ok: true };
    },
    retry(id) {
      const d = mine().find((x) => x.id === id);
      if (!d) return null;
      d.failure = null;
      if (isOffline()) { c.changed(); return null; }
      return send();
    },
    send,
    verify: (id) => decide(id, 'verify', ''),
    returnUpdate: (id, reason) => decide(id, 'return', reason),
    dismissNotice(id) {
      device.notices = device.notices.filter((n) => !(n.id === id && n.membershipId === me));
      c.changed();
    },
    activityForm,
    recordActivity(activityId, periodEnd, quantity, note) {
      const form = activityForm(activityId);
      if (!form) return { ok: false, error: s.activities.some((a) => a.id === activityId) ? 'not_allowed' : 'not_found' };
      if (isOffline()) return { ok: false, error: 'offline' };
      if (!form.periods.includes(periodEnd as ISODate)) return { ok: false, error: 'period_invalid' };
      if (!quantity.trim()) return { ok: false, error: 'figure_required' };
      const q = parseFigure(quantity);
      if (q === null) return { ok: false, error: 'figure_invalid' };
      const stamp = { at: c.clock(), byMembershipId: v.membershipId };
      const existing = s.activityProgress.find((x) => x.activityId === activityId && x.periodEnd === periodEnd);
      if (existing) {
        const before = { ...existing };
        Object.assign(existing, { quantityDone: q, note: note.trim(), updated: stamp });
        c.audit('update', { type: 'ActivityProgress', id: existing.id }, before, { ...existing });
      } else {
        const rec: ActivityProgress = {
          orgId: s.organisation.id, id: `ap-${activityId}-${periodEnd}-${next()}` as ActivityProgress['id'], activityId: activityId as ActivityProgress['activityId'],
          periodEnd: periodEnd as ISODate, quantityDone: q, note: note.trim(), created: stamp, updated: stamp,
        };
        s.activityProgress.push(rec);
        c.audit('create', { type: 'ActivityProgress', id: rec.id }, null, rec);
      }
      c.changed();
      return { ok: true };
    },
    kpiForm,
    recordKpi(kpiId, periodEnd, value) {
      const form = kpiForm(kpiId);
      if (!form) return { ok: false, error: s.kpis.some((k) => k.id === kpiId) ? 'not_allowed' : 'not_found' };
      if (form.fromShares) return { ok: false, error: 'from_shares' };
      if (isOffline()) return { ok: false, error: 'offline' };
      if (!form.periods.includes(periodEnd as ISODate)) return { ok: false, error: 'period_invalid' };
      if (!value.trim()) return { ok: false, error: 'figure_required' };
      const n = Number(value.replace(/[\s,]/g, ''));
      if (!Number.isFinite(n) || !/^-?[\d.,\s]+$/.test(value.trim())) return { ok: false, error: 'figure_invalid' };
      const stamp = { at: c.clock(), byMembershipId: v.membershipId };
      const existing = s.kpiActuals.find((x) => x.kpiId === kpiId && x.periodEnd === periodEnd);
      if (existing) {
        const before = { ...existing };
        Object.assign(existing, { value: n, updated: stamp });
        c.audit('update', { type: 'KpiActual', id: existing.id }, before, { ...existing });
      } else {
        const rec: KpiActual = {
          orgId: s.organisation.id, id: `ka-${kpiId}-${periodEnd}-${next()}` as KpiActual['id'], kpiId: kpiId as KpiActual['kpiId'],
          periodEnd: periodEnd as ISODate, value: n, created: stamp, updated: stamp,
        };
        s.kpiActuals.push(rec);
        c.audit('create', { type: 'KpiActual', id: rec.id }, null, rec);
      }
      c.changed();
      return { ok: true };
    },
  };
}
