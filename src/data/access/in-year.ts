/**
 * In-year cascade changes (v0.27.0; In-Year Cascade Changes Specification v0.1, decisions IC-1 to IC-8, accepted
 * 18 November 2026). Correcting a published cascade during the year: owners, an activity's details and quantity
 * target, and marking an activity complete, reopening, stopping or restarting it.
 *
 * - IC-1: a change is saved at once, with a reason, as the 6P level change is (D6-6). No approval queue.
 * - IC-2: an activity's owner may correct its details and mark it complete, but not change its target or owner or stop
 *   it; those need the objective owner, the Strategy office or a facilitator. Only the Strategy office restarts.
 * - IC-3: a KPI's owner is assigned by the objective owner or the Strategy office.
 * - IC-4: a goal's or objective's owner is changed by the Strategy office only.
 * - IC-8: "Changes this year" is read from the audit trail; it is never a separate record.
 *
 * Every permission starts from the contract's matrix (`can`), which IC-2 to IC-4 narrow here. No contract change.
 */
import type { Activity, FinancialYear, ISODate, ISODateTime, ReportingFrequency, SixPLevel } from '../../contract/caspa-data-contract';
import {
  activityChangeError, activityChangeImpact, latestRecorded, ownerChangeError, reasonNeeded,
  type ActivityChange, type ActivityChangeError, type OwnerChangeError,
} from '../../rules/cascade-edit';
import { activityFingerprint } from '../../rules/fingerprint';
import { linesOfVersion, objectiveOfActivity, objectiveOfKpi } from '../../rules/structure';
import { dateInZone } from '../../selectors/format';
import { holderOf, type NodeKind } from '../../selectors/node';
import { en } from '../../strings/en';
import { can } from './permissions';
import type { Store } from './store';
import { financialYearOf, type Viewer } from './viewer';

interface Ctx { s: Store; viewer: Viewer; now: ISODate; financialYear: FinancialYear | number; clock: () => ISODateTime; changed: () => void }

export type ChangeChoice = 'details' | 'target' | 'owner' | 'level' | 'complete' | 'reopen' | 'stop' | 'restart';
/** A change as the panel sends it. The 6P level is listed here for effects; it is saved through `changeActivityLevel`. */
export type ChangeInput = ActivityChange | { change: 'level'; level: SixPLevel };

export interface PositionOption { id: string; title: string; holder: string | null; acting: boolean }

/** What the "Make a change" panel offers on one record. Null when this viewer may make no change there. */
export interface ChangeForm {
  kind: NodeKind;
  id: string;
  code: string;
  title: string;
  choices: ChangeChoice[];
  owner: { positionId: string | null; holder: string | null; title: string | null };
  /** The organisation's positions, in structure order, with who holds each today. */
  positions: PositionOption[];
  /** Activities only. */
  activity: {
    evidence: string;
    frequency: ReportingFrequency;
    quantity: { value: number; unit: string } | null;
    level: SixPLevel | null;
    status: Activity['status'];
    recorded: { done: number; periodEnd: ISODate } | null;
    signed: number;
  } | null;
}

/** One line of "This will affect", as data; the screen words it in the organisation's labels. */
export type EffectLine =
  | { kind: 'commitments_flagged'; named: { person: string; position: string; title: string; supervisor: string | null }[]; others: number }
  | { kind: 'commitments_stay'; named: string[]; others: number }
  | { kind: 'no_commitment_affected' }
  | { kind: 'signed_carry'; signed: number; unit: string; recorded: { done: number; periodEnd: ISODate } | null }
  | { kind: 'below_signed'; signed: number; unit: string; objectiveOwner: string | null }
  | { kind: 'recorded'; done: number; target: number; unit: string; periodEnd: ISODate; below: boolean }
  | { kind: 'budget_lines_flagged'; count: number }
  | { kind: 'budget_lines_stay'; count: number }
  | { kind: 'dependents_done'; count: number }
  | { kind: 'dependents_not_done'; count: number }
  | { kind: 'no_figures_added' }
  | { kind: 'leaves_counts' }
  | { kind: 'returns_counts' }
  | { kind: 'stop_flags_clear' }
  | { kind: 'owner_sees'; what: NodeKind; position: string; person: string | null }
  | { kind: 'no_owner_clears' };

export interface ChangeEffects {
  /** Why it cannot be saved yet, reason aside; null when the change itself is ready. */
  error: ActivityChangeError | OwnerChangeError | 'same_level' | null;
  reasonNeeded: boolean;
  lines: EffectLine[];
}

export type ChangeError = 'not_found' | 'not_allowed' | ActivityChangeError | OwnerChangeError;

/** One entry of "Changes this year", newest first. */
export interface ChangeItem {
  field: 'title' | 'evidence' | 'frequency' | 'target' | 'owner' | 'level' | 'status';
  from: string;
  to: string;
  reason: string;
  by: string;
  on: ISODate;
}

export interface InYearAccess {
  /** What this viewer may change on a record, or null. */
  form(kind: NodeKind, id: string): ChangeForm | null;
  /** What a draft change would affect, computed before saving (spec section 6). */
  effects(kind: NodeKind, id: string, input: ChangeInput): ChangeEffects;
  /** Save a change with its reason (IC-1). The 6P level is saved through `changeActivityLevel` (D6-6). */
  make(kind: NodeKind, id: string, input: ActivityChange, reason: string): { ok: true } | { ok: false; error: ChangeError };
  /** "Changes this year" for a record, read from the audit trail (IC-8). Anyone who may view the record sees it. */
  changes(kind: NodeKind, id: string): ChangeItem[];
}

const TYPE: Record<NodeKind, string> = { goal: 'Goal', objective: 'Objective', kpi: 'Kpi', activity: 'Activity' };

export function createInYearAccess(c: Ctx): InYearAccess {
  const { s, viewer: v, now } = c;
  const fy = c.financialYear as number;
  const mine = (pid: string | null | undefined) => !!pid && v.positionIds.includes(pid as Viewer['positionIds'][number]);
  const isStrategy = v.roles.includes('strategy_office');
  const isFacilitator = v.roles.includes('facilitator');
  const active = new Set(s.plans.filter((p) => p.status === 'active').map((p) => p.id as string));
  const on = (at: string) => dateInZone(at, s.organisation.timeZone);
  const stamp = () => ({ at: c.clock(), byMembershipId: v.membershipId });
  const audit = (action: string, type: string, id: string, before: unknown, after: unknown) =>
    s.auditEntries.push({ id: `au-${s.auditEntries.length + 1}` as never, orgId: s.organisation.id, at: c.clock(), actorMembershipId: v.membershipId, action, entity: { type, id }, before, after });

  const goalOf = (kind: NodeKind, id: string) => {
    if (kind === 'goal') return s.goals.find((g) => g.id === id);
    if (kind === 'objective') { const o = s.objectives.find((x) => x.id === id); return o && s.goals.find((g) => g.id === o.goalId); }
    if (kind === 'kpi') { const k = s.kpis.find((x) => x.id === id); const o = k && objectiveOfKpi(s, k); return o && s.goals.find((g) => g.id === o.goalId); }
    const a = s.activities.find((x) => x.id === id);
    const o = a && objectiveOfActivity(s, a);
    return o && s.goals.find((g) => g.id === o.goalId);
  };
  /** The record, when it belongs to the active plan (and, for an activity, to this year). */
  const record = (kind: NodeKind, id: string) => {
    const g = goalOf(kind, id);
    if (!g || !active.has(g.planId)) return undefined;
    if (kind === 'goal') return g;
    if (kind === 'objective') return s.objectives.find((x) => x.id === id);
    if (kind === 'kpi') return s.kpis.find((x) => x.id === id);
    const a = s.activities.find((x) => x.id === id);
    return a && a.financialYear === fy ? a : undefined;
  };

  const choicesFor = (kind: NodeKind, id: string): ChangeChoice[] => {
    const r = record(kind, id);
    if (!r) return [];
    const subject = { type: TYPE[kind], id };
    if (kind === 'goal' || kind === 'objective') return isStrategy && can(s, v, 'draft', subject) ? ['owner'] : [];
    if (kind === 'kpi') {
      const k = r as Store['kpis'][number];
      return can(s, v, 'draft', subject) && (isStrategy || mine(objectiveOfKpi(s, k)?.ownerPositionId)) ? ['owner'] : [];
    }
    const a = r as Activity;
    if (a.status === 'archived') return isStrategy ? ['restart'] : [];
    const draft = can(s, v, 'draft', subject);
    if (!draft) return [];
    const upper = isStrategy || isFacilitator || mine(objectiveOfActivity(s, a)?.ownerPositionId);
    const out: ChangeChoice[] = ['details'];
    if (upper && a.quantityTarget) out.push('target');
    if (upper) out.push('owner');
    out.push('level', a.status === 'complete' ? 'reopen' : 'complete');
    if (upper) out.push('stop');
    return out;
  };

  const positions = (): PositionOption[] =>
    s.positions.map((p) => { const h = holderOf(s, p.id, now); return { id: p.id, title: p.title, holder: h?.person ?? null, acting: !!h?.acting }; });
  const ownerOf = (kind: NodeKind, id: string): string | null => {
    const r = record(kind, id) as { ownerPositionId: string | null } | undefined;
    return r?.ownerPositionId ?? null;
  };
  const choiceOf = (input: ChangeInput): ChangeChoice => input.change;

  /** Names the commitments this viewer may see; counts the rest, as the record page's Performance section does. */
  const commitmentLine = (ids: string[], kind: 'commitments_flagged' | 'commitments_stay'): EffectLine => {
    const named: { person: string; position: string; title: string; supervisor: string | null }[] = [];
    let others = 0;
    for (const coId of ids) {
      const co = s.contractObjectives.find((x) => x.id === coId);
      const ct = co && s.contracts.find((x) => x.id === co.contractId);
      if (!co || !ct || !can(s, v, 'view', { type: 'PerformanceContract', id: ct.id })) { others += 1; continue; }
      const h = holderOf(s, ct.positionId, now);
      const sup = s.positions.find((p) => p.id === ct.positionId)?.reportsToPositionId ?? null;
      const sh = sup ? holderOf(s, sup, now) : null;
      named.push({ person: s.people.find((p) => p.id === ct.personId)?.fullName ?? h?.person ?? '', position: h?.position ?? '', title: co.title, supervisor: sh ? (sh.person ?? sh.position) : null });
    }
    return kind === 'commitments_flagged' ? { kind, named, others } : { kind, named: named.map((n) => n.person), others };
  };
  const ownerSees = (what: NodeKind, positionId: string): EffectLine => {
    const h = holderOf(s, positionId, now);
    return { kind: 'owner_sees', what, position: h?.position ?? positionId, person: h?.person ?? null };
  };

  return {
    form(kind, id) {
      const choices = choicesFor(kind, id);
      if (!choices.length) return null;
      const r = record(kind, id) as { code: string; title?: string; name?: string; ownerPositionId: string | null };
      const h = holderOf(s, r.ownerPositionId, now);
      const a = kind === 'activity' ? (r as unknown as Activity) : null;
      return {
        kind, id, code: r.code, title: r.title ?? r.name ?? '', choices,
        owner: { positionId: r.ownerPositionId, holder: h?.person ?? null, title: h?.position ?? null },
        positions: positions(),
        activity: a && {
          evidence: a.evidence, frequency: a.reportingFrequency, quantity: a.quantityTarget, level: a.decisionLevel, status: a.status,
          recorded: latestRecorded(s, a.id), signed: activityChangeImpact(s, a, { change: 'complete' }, fy, []).signed,
        },
      };
    },

    effects(kind, id, input) {
      const lines: EffectLine[] = [];
      if (kind !== 'activity') {
        const positionId = input.change === 'owner' ? input.positionId : '';
        const error = ownerChangeError(s, ownerOf(kind, id), positionId, 'x');
        if (kind === 'kpi' && !ownerOf(kind, id)) lines.push({ kind: 'no_owner_clears' });
        if (positionId && s.positions.some((p) => p.id === positionId)) lines.push(ownerSees(kind, positionId));
        return { error, reasonNeeded: true, lines };
      }
      const a = record('activity', id) as Activity | undefined;
      if (!a) return { error: 'stopped', reasonNeeded: true, lines };
      const lineSet = linesOfVersion(s, fy).map((l) => ({ id: l.id as string, activityId: l.activityId as string | null }));
      if (input.change === 'level') {
        const changed = input.level !== a.decisionLevel;
        const commitments = activityChangeImpact(s, a, { change: 'complete' }, fy, []).commitments;
        const upstream = changed && commitments.length > 0 && activityFingerprint({ ...a, decisionLevel: input.level }) !== activityFingerprint(a);
        lines.push(upstream ? commitmentLine(commitments.map((x) => x.id), 'commitments_flagged') : { kind: 'no_commitment_affected' });
        return { error: changed ? null : 'same_level', reasonNeeded: true, lines };
      }
      const error = activityChangeError(s, a, input, 'x');
      const im = activityChangeImpact(s, a, input, fy, lineSet);
      const unit = a.quantityTarget?.unit ?? '';
      const recorded = latestRecorded(s, a.id);
      switch (input.change) {
        case 'details':
        case 'target':
          if (input.change === 'target' && a.quantityTarget) lines.push({ kind: 'signed_carry', signed: im.signed, unit, recorded });
          lines.push(im.upstreamChanged ? commitmentLine(im.commitments.map((x) => x.id), 'commitments_flagged') : { kind: 'no_commitment_affected' });
          if (im.belowSigned) lines.push({ kind: 'below_signed', signed: im.signed, unit, objectiveOwner: (() => { const h = holderOf(s, objectiveOfActivity(s, a)?.ownerPositionId ?? null, now); return h ? (h.person ? `${h.person}, ${h.position}` : h.position) : null; })() });
          break;
        case 'owner':
          if (im.commitments.length) lines.push(commitmentLine(im.commitments.map((x) => x.id), 'commitments_stay'));
          if (im.budgetLineIds.length) lines.push({ kind: 'budget_lines_stay', count: im.budgetLineIds.length });
          if (s.positions.some((p) => p.id === input.positionId)) lines.push(ownerSees('activity', input.positionId));
          break;
        case 'complete':
          if (a.quantityTarget) lines.push({ kind: 'recorded', done: recorded?.done ?? 0, target: a.quantityTarget.value, unit, periodEnd: recorded?.periodEnd ?? ('' as ISODate), below: reasonNeeded(s, a, input) });
          lines.push({ kind: 'dependents_done', count: im.dependents }, { kind: 'no_figures_added' });
          break;
        case 'reopen':
          lines.push({ kind: 'dependents_not_done', count: im.dependents });
          break;
        case 'stop':
          lines.push(im.commitments.length ? commitmentLine(im.commitments.map((x) => x.id), 'commitments_flagged') : { kind: 'no_commitment_affected' });
          if (im.budgetLineIds.length) lines.push({ kind: 'budget_lines_flagged', count: im.budgetLineIds.length });
          lines.push({ kind: 'leaves_counts' });
          break;
        case 'restart':
          lines.push({ kind: 'returns_counts' });
          if (im.commitments.length || im.budgetLineIds.length) lines.push({ kind: 'stop_flags_clear' });
          break;
      }
      return { error, reasonNeeded: reasonNeeded(s, a, input), lines };
    },

    make(kind, id, input, reason) {
      const r = record(kind, id);
      if (!r) return { ok: false, error: 'not_found' };
      if (!choicesFor(kind, id).includes(choiceOf(input))) return { ok: false, error: 'not_allowed' };
      if (kind !== 'activity') {
        if (input.change !== 'owner') return { ok: false, error: 'not_allowed' };
        const rec = r as { ownerPositionId: string | null; updated: unknown };
        const err = ownerChangeError(s, rec.ownerPositionId, input.positionId, reason);
        if (err) return { ok: false, error: err };
        const before = rec.ownerPositionId;
        rec.ownerPositionId = input.positionId;
        rec.updated = stamp();
        audit('update', TYPE[kind], id, { ownerPositionId: before }, { ownerPositionId: input.positionId, reason: reason.trim() });
        c.changed();
        return { ok: true };
      }
      const a = r as Activity;
      const err = activityChangeError(s, a, input, reason);
      if (err) return { ok: false, error: err };
      const pick = (keys: (keyof Activity)[], x: Activity) => Object.fromEntries(keys.map((k) => [k, x[k]]));
      let keys: (keyof Activity)[];
      let next: Partial<Activity>;
      switch (input.change) {
        case 'details':
          next = { title: input.title.trim(), evidence: input.evidence.trim(), reportingFrequency: input.frequency };
          keys = (['title', 'evidence', 'reportingFrequency'] as const).filter((k) => next[k] !== a[k]);
          break;
        case 'target': next = { quantityTarget: a.quantityTarget && { ...a.quantityTarget, value: input.value } }; keys = ['quantityTarget']; break;
        case 'owner': next = { ownerPositionId: input.positionId as Activity['ownerPositionId'] }; keys = ['ownerPositionId']; break;
        case 'complete': next = { status: 'complete' }; keys = ['status']; break;
        case 'stop': next = { status: 'archived' }; keys = ['status']; break;
        default: next = { status: 'in_progress' }; keys = ['status'];
      }
      const before = pick(keys, a);
      Object.assign(a, next);
      a.updated = stamp();
      const action = input.change === 'details' || input.change === 'target' || input.change === 'owner' ? 'update' : input.change;
      audit(action, 'Activity', a.id, before, { ...pick(keys, a), reason: reason.trim() });
      c.changed();
      return { ok: true };
    },

    changes(kind, id) {
      const type = TYPE[kind];
      if (!can(s, v, 'view', { type, id })) return [];
      const start = s.organisation.financialYearStartMonth;
      const who = (m: string) => {
        const pid = s.assignments.find((x) => x.personId === s.memberships.find((y) => y.id === m)?.personId && x.to === null)?.positionId ?? null;
        const h = holderOf(s, pid, now);
        const person = s.people.find((p) => p.id === s.memberships.find((y) => y.id === m)?.personId)?.fullName ?? '';
        return h ? `${person}, ${h.position}` : person;
      };
      const posTitle = (pid: unknown) => (typeof pid === 'string' ? s.positions.find((p) => p.id === pid)?.title ?? pid : en.inYear.noOwner);
      const out: ChangeItem[] = [];
      for (const e of [...s.auditEntries].reverse()) {
        if (e.entity.type !== type || e.entity.id !== id) continue;
        const after = e.after as Record<string, unknown> | null;
        const before = (e.before ?? {}) as Record<string, unknown>;
        if (!after || typeof after.reason !== 'string') continue;
        if (financialYearOf(on(e.at), start) !== fy) continue;
        const base = { reason: after.reason, by: who(e.actorMembershipId), on: on(e.at) };
        for (const k of Object.keys(after)) {
          if (k === 'reason') continue;
          const b = before[k], x = after[k];
          if (k === 'title') out.push({ field: 'title', from: String(b), to: String(x), ...base });
          else if (k === 'evidence') out.push({ field: 'evidence', from: String(b), to: String(x), ...base });
          else if (k === 'reportingFrequency') out.push({ field: 'frequency', from: en.frequency[b as ReportingFrequency], to: en.frequency[x as ReportingFrequency], ...base });
          else if (k === 'quantityTarget') {
            const q = (t: unknown) => { const y = t as { value: number; unit: string } | null; return y ? `${y.value.toLocaleString('en-GB')} ${y.unit}` : '—'; };
            out.push({ field: 'target', from: q(b), to: q(x), ...base });
          } else if (k === 'ownerPositionId') out.push({ field: 'owner', from: posTitle(b), to: posTitle(x), ...base });
          else if (k === 'decisionLevel') out.push({ field: 'level', from: b ? en.sixP[b as SixPLevel] : en.noSixP, to: en.sixP[x as SixPLevel], ...base });
          else if (k === 'status') out.push({ field: 'status', from: en.activityStatus[b as Activity['status']], to: en.activityStatus[x as Activity['status']], ...base });
        }
      }
      return out;
    },
  };
}
