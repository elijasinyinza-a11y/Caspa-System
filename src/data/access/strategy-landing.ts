/**
 * The Strategy landing (v0.28.0; Strategy Landing Specification v0.1, decisions SL-1 to SL-7, approved 18 November
 * 2026; prototype approved the same day). The page shows the strategy itself: the active plan, its vision and mission,
 * the goals the viewer's signed work serves, and each goal with its progress and why it was chosen.
 *
 * Every block reuses an existing figure or rule: goal progress as Home (`goalProgress`), reasons as record pages
 * (`nodeView`'s strategy section), owners as record pages (`holderOf`). Everything shown is readable by all members
 * under the contract's matrix, except reasons, which follow `FourQEntry: view` (SL-3). No contract change.
 *
 * v0.31.0 (Vision, Mission and Values Drafting Specification v0.1, VM-1 to VM-8; contract v1.22): the Strategy office or
 * a facilitator drafts the vision, mission and values after publication and sends the draft to the Executive, who
 * confirms it as written or sends it back with a reason. Everyone else sees only confirmed statements (VM-3).
 */
import { valuesError, valuesOf, type ValueInput, type ValuesError } from '../../rules/values';
import { saveValues } from './values';
import type { FinancialYear, Goal, Id, ISODate, ISODateTime, VisionStatement } from '../../contract/caspa-data-contract';
import { expectedToDate, goalProgress, type RollUp } from '../../rules/kpi-progress';
import { goalOfActivity, objectiveOfKpi } from '../../rules/structure';
import { dateInZone, formatFinancialYear } from '../../selectors/format';
import { holderOf, nodeView, refGoal, type Holder, type NodeRef, type Reasons } from '../../selectors/node';
import { can } from './permissions';
import type { Store } from './store';
import type { Viewer } from './viewer';

interface Ctx { s: Store; viewer: Viewer; now: ISODate; financialYear: FinancialYear | number; clock: () => ISODateTime; changed: () => void }

export interface LandingGoal {
  ref: NodeRef;
  owner: Holder | null;
  progress: RollUp;
  objectives: number;
  kpis: number;
  /** In full for those who may read 4Q entries, a count for everyone else (SL-3). */
  reasons: Reasons;
}

export interface StrategyLanding {
  plan: {
    id: string;
    title: string;
    /** "FY2022 to FY2026". */
    period: string;
    /** Where this financial year sits in the plan, or null outside its period. */
    year: { label: string; n: number; of: number } | null;
    confirmed: { by: string; on: ISODate; ref: string | null } | null;
  };
  /** Confirmed statements only (VM-3). */
  statements: { vision: string | null; mission: string | null; values: ValueInput[]; recorded: { by: string; on: ISODate } | null };
  /**
   * v0.31.0 (VM-4): the draft waiting to be sent or confirmed, for the Strategy office, facilitators and the Executive
   * only; null for everyone else and when there is none. `mode` 'values' when the plan already has a vision and mission.
   */
  draft: LandingDraft | null;
  /** v0.31.0 (VM-1): what the Strategy office or a facilitator may draft now; null while a draft is with the Executive. */
  canDraft: 'all' | 'values' | null;
  /**
   * What the Executive may record once (SL-4, CV-5): everything while the plan has no statements, the values alone
   * while it has a vision or mission but no values, otherwise nothing.
   */
  canRecord: 'all' | 'values' | null;
  /** SL-5: the goals the viewer's signed commitments serve this year; null without a signed contract. */
  yourPart: NodeRef[] | null;
  /** SL-2: by perspective, in the organisation's order, when it uses a scorecard; otherwise one group with no label. */
  groups: { label: string | null; goals: LandingGoal[] }[];
  /** The share of the financial year passed, for the mark on progress bars. */
  expected: number;
  themes: { id: string; title: string }[];
}

export type RecordStatementsError = 'not_allowed' | 'already_recorded' | 'no_plan' | 'text_required' | 'already_sent' | ValuesError;
/** v0.31.0: why a draft could not be saved, sent, confirmed or sent back. */
export type DraftError = RecordStatementsError | 'no_draft' | 'not_sent' | 'already_sent' | 'reason_required' | 'values_required';

/** v0.31.0 (VM-4): a draft of the vision, mission and values after publication. */
export interface LandingDraft {
  mode: 'all' | 'values';
  vision: string;
  mission: string;
  values: ValueInput[];
  status: 'draft' | 'sent' | 'returned';
  /** Who last saved it. */
  by: string;
  sent: { by: string; on: ISODate } | null;
  returned: { by: string; on: ISODate; reason: string } | null;
}

export interface StrategyLandingAccess {
  /** The landing for the active plan, limited to this viewer; null when there is no active plan. */
  landing(): StrategyLanding | null;
  /** SL-4, CV-5: the Executive records the vision, mission and any values once, confirmed as saved. Later changes go through a plan revision. */
  recordStatements(vision: string, mission: string, values?: ValueInput[]): { ok: true } | { ok: false; error: RecordStatementsError };
  /** CV-5: the Executive adds values once to a plan that has a vision or mission but no values. */
  recordValues(values: ValueInput[]): { ok: true } | { ok: false; error: RecordStatementsError };
  /** v0.31.0 (VM-1): the Strategy office or a facilitator saves a draft; vision and mission are ignored in 'values' mode. */
  saveDraft(vision: string, mission: string, values: ValueInput[]): { ok: true } | { ok: false; error: DraftError };
  /** v0.31.0 (VM-4): send the saved draft to the Executive (a Needs you item for each Executive). */
  sendDraft(): { ok: true } | { ok: false; error: DraftError };
  /** v0.31.0 (VM-2, VM-5): the Executive confirms the sent draft as written. */
  confirmDraft(): { ok: true } | { ok: false; error: DraftError };
  /** v0.31.0 (VM-4): the Executive sends the draft back with a reason (required). */
  sendBackDraft(reason: string): { ok: true } | { ok: false; error: DraftError };
}

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'en-GB', { numeric: true });

export function createStrategyLandingAccess(c: Ctx): StrategyLandingAccess {
  const { s, viewer: v, now } = c;
  const fy = c.financialYear as number;
  const isExecutive = v.roles.includes('executive');
  /** VM-1: the Strategy office and facilitators draft; the Executive records in one step or confirms. */
  const isDrafter = v.roles.includes('strategy_office') || v.roles.includes('facilitator');
  /** VM-3: who may see an unconfirmed statement. */
  const seesDrafts = isExecutive || isDrafter;
  const active = () => s.plans.find((p) => p.status === 'active');
  const person = (membershipId: string) => s.people.find((p) => p.id === s.memberships.find((m) => m.id === membershipId)?.personId)?.fullName ?? '';
  const on = (at: string) => dateInZone(at, s.organisation.timeZone);
  /** Confirmed vision and mission (VM-3: unconfirmed text is a draft). */
  const statementsOf = (planId: string) => s.visionStatements.filter((x) => x.planId === planId && x.kind !== 'value' && x.text.trim() !== '' && x.confirmation);
  const confirmedValues = (planId: string) => valuesOf(s.visionStatements, planId).filter((x) => x.confirmation);
  /** The plan's unconfirmed statements: the draft. */
  const draftRecords = (planId: string) => s.visionStatements.filter((x) => x.planId === planId && !x.confirmation && (x.kind === 'value' || x.text.trim() !== ''));
  /** 'all' while the plan has no confirmed statements, 'values' while it has a vision or mission but no values. */
  const modeOf = (planId: string): 'all' | 'values' | null => (statementsOf(planId).length === 0 && confirmedValues(planId).length === 0 ? 'all' : confirmedValues(planId).length === 0 ? 'values' : null);
  const draftStatus = (recs: VisionStatement[]): LandingDraft['status'] | null => {
    if (!recs.length) return null;
    if (recs.some((x) => x.sentForConfirmation)) return 'sent';
    if (recs.some((x) => x.returned)) return 'returned';
    return 'draft';
  };
  const audit = (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) =>
    s.auditEntries.push({ id: `au-${s.auditEntries.length + 1}` as never, orgId: s.organisation.id, at: c.clock(), actorMembershipId: v.membershipId, action, entity, before, after });

  /** The goal behind a contract objective: through its activity, or through the share or breakdown it comes from. */
  const goalOfObjective = (co: Store['contractObjectives'][number]): Goal | undefined => {
    if (co.sourceActivityId) { const a = s.activities.find((x) => x.id === co.sourceActivityId); return a && goalOfActivity(s, a); }
    const shareId = co.sourceShareId ?? co.servesShareId ?? null;
    const breakdownId = co.sourceBreakdownId ?? (shareId ? s.kpiShares.find((x) => x.id === shareId)?.breakdownId : null);
    const kpiId = breakdownId ? s.kpiBreakdowns.find((b) => b.id === breakdownId)?.kpiId : null;
    const k = kpiId ? s.kpis.find((x) => x.id === kpiId) : undefined;
    const o = k && objectiveOfKpi(s, k);
    return o && s.goals.find((g) => g.id === o.goalId);
  };

  return {
    landing() {
      const p = active();
      if (!p) return null;
      const start = s.organisation.financialYearStartMonth;
      const ctx = { financialYear: fy, now };
      const goals = s.goals.filter((g) => g.planId === p.id).sort(byCode);
      const card = (g: Goal): LandingGoal => {
        const objectives = s.objectives.filter((o) => o.goalId === g.id);
        const node = nodeView(s, 'goal', g.id, ctx, { canView: (subject) => can(s, v, 'view', subject) });
        return {
          ref: refGoal(g),
          owner: holderOf(s, g.ownerPositionId, now),
          progress: goalProgress(s, g, ctx),
          objectives: objectives.length,
          kpis: s.kpis.filter((k) => objectives.some((o) => o.id === k.objectiveId)).length,
          reasons: node ? node.strategy.reasons : { visible: false, count: g.fourQEntryIds.length },
        };
      };
      const perspectives = s.organisation.perspectives;
      const groups = perspectives
        ? [
            ...perspectives.map((x) => ({ label: x.label, goals: goals.filter((g) => g.perspective === x.key).map(card) })),
            { label: 'other', goals: goals.filter((g) => !g.perspective || !perspectives.some((x) => x.key === g.perspective)).map(card) },
          ].filter((x) => x.goals.length > 0)
        : [{ label: null, goals: goals.map(card) }];

      const st = statementsOf(p.id);
      const vision = st.find((x) => x.kind === 'vision') ?? null;
      const mission = st.find((x) => x.kind === 'mission') ?? null;
      const values = confirmedValues(p.id);
      const stamp = (vision ?? mission ?? values[0])?.confirmation ?? null;
      const recs = draftRecords(p.id);
      const status = draftStatus(recs);
      const mode = modeOf(p.id);
      const first = recs.find((x) => x.sentForConfirmation) ?? recs.find((x) => x.returned) ?? recs[0];
      const draft: LandingDraft | null = seesDrafts && status && mode && first ? {
        mode,
        vision: recs.find((x) => x.kind === 'vision')?.text ?? '',
        mission: recs.find((x) => x.kind === 'mission')?.text ?? '',
        values: valuesOf(recs, p.id).map((x) => ({ name: x.name ?? '', text: x.text, ...(x.fromCandidateIds?.length ? { fromCandidateIds: [...x.fromCandidateIds] } : {}) })),
        status,
        by: person(recs.reduce((a, b) => (a.updated.at >= b.updated.at ? a : b)).updated.byMembershipId),
        sent: first.sentForConfirmation ? { by: person(first.sentForConfirmation.byMembershipId), on: on(first.sentForConfirmation.at) } : null,
        returned: first.returned ? { by: person(first.returned.byMembershipId), on: on(first.returned.at), reason: first.returned.reason } : null,
      } : null;

      // SL-5: signed contracts this year held by the viewer, through any of their positions.
      const mine = s.contracts.filter((x) => x.financialYear === fy && x.status === 'signed' && (x.personId === v.personId || v.positionIds.includes(x.positionId)));
      const served = new Map<string, NodeRef>();
      for (const co of s.contractObjectives.filter((x) => mine.some((m) => m.id === x.contractId))) {
        const g = goalOfObjective(co);
        if (g && g.planId === p.id) served.set(g.id, refGoal(g));
      }

      const inPlan = fy >= p.startYear && fy <= p.endYear;
      return {
        plan: {
          id: p.id, title: p.title,
          period: `${formatFinancialYear(p.startYear, start)} to ${formatFinancialYear(p.endYear, start)}`,
          year: inPlan ? { label: formatFinancialYear(fy, start), n: fy - p.startYear + 1, of: p.endYear - p.startYear + 1 } : null,
          confirmed: p.confirmation ? { by: person(p.confirmation.byMembershipId), on: on(p.confirmation.at), ref: p.boardApproval?.resolutionRef ?? null } : null,
        },
        statements: { vision: vision?.text ?? null, mission: mission?.text ?? null, values: values.map((x) => ({ name: x.name ?? '', text: x.text })), recorded: stamp ? { by: person(stamp.byMembershipId), on: on(stamp.at) } : null },
        // VM-6: the Executive keeps the one-step record, except while a draft waits for them to confirm or send back.
        canRecord: !isExecutive || status === 'sent' ? null : mode,
        draft,
        canDraft: isDrafter && status !== 'sent' ? mode : null,
        yourPart: mine.length ? [...served.values()].sort(byCode) : null,
        groups,
        expected: expectedToDate(fy, start, now),
        themes: s.themes.filter((t) => t.planId === p.id).map((t) => ({ id: t.id, title: t.title })),
      };
    },

    recordValues(values) {
      const p = active();
      if (!p) return { ok: false, error: 'no_plan' };
      if (!isExecutive || !can(s, v, 'draft', { type: 'VisionStatement', id: p.id })) return { ok: false, error: 'not_allowed' };
      if (confirmedValues(p.id).length) return { ok: false, error: 'already_recorded' };
      if (draftStatus(draftRecords(p.id)) === 'sent') return { ok: false, error: 'already_sent' };
      if (!values.length) return { ok: false, error: 'name_required' };
      const err = valuesError(values);
      if (err) return { ok: false, error: err };
      saveValues(s, p.id, values, () => ({ at: c.clock(), byMembershipId: v.membershipId }), audit, true);
      for (const x of valuesOf(s.visionStatements, p.id)) { x.sentForConfirmation = null; x.returned = null; }
      c.changed();
      return { ok: true };
    },

    recordStatements(vision, mission, values = []) {
      const p = active();
      if (!p) return { ok: false, error: 'no_plan' };
      if (!isExecutive || !can(s, v, 'draft', { type: 'VisionStatement', id: p.id })) return { ok: false, error: 'not_allowed' };
      if (statementsOf(p.id).length || confirmedValues(p.id).length) return { ok: false, error: 'already_recorded' };
      if (draftStatus(draftRecords(p.id)) === 'sent') return { ok: false, error: 'already_sent' };
      if (!vision.trim() || !mission.trim()) return { ok: false, error: 'text_required' };
      const verr = valuesError(values);
      if (verr) return { ok: false, error: verr };
      const stamp = { at: c.clock(), byMembershipId: v.membershipId };
      for (const [kind, text] of [['vision', vision], ['mission', mission]] as const) {
        const old = s.visionStatements.find((x) => x.planId === p.id && x.kind === kind);
        const rec: VisionStatement = old
          ? { ...old, text: text.trim(), confirmation: stamp, updated: stamp, sentForConfirmation: null, returned: null }
          : { orgId: s.organisation.id, created: stamp, updated: stamp, id: `vs-${p.id}-${kind}` as Id<'VisionStatement'>, planId: p.id, kind, text: text.trim(), confirmation: stamp };
        if (old) Object.assign(old, rec); else s.visionStatements.push(rec);
        s.auditEntries.push({ id: `au-${s.auditEntries.length + 1}` as never, orgId: s.organisation.id, at: stamp.at, actorMembershipId: v.membershipId, action: 'confirm', entity: { type: 'VisionStatement', id: rec.id }, before: null, after: { kind, text: rec.text, afterPublication: true } });
      }
      if (values.length) saveValues(s, p.id, values, () => stamp, audit, true);
      // A draft by the Strategy office is replaced by the Executive's own text (VM-6); no stale draft state remains.
      for (const x of s.visionStatements.filter((y) => y.planId === p.id)) { x.sentForConfirmation = null; x.returned = null; }
      for (const x of draftRecords(p.id).filter((y) => y.kind === 'value')) {
        s.visionStatements.splice(s.visionStatements.indexOf(x), 1);
        audit('delete', { type: 'VisionStatement', id: x.id }, structuredClone(x), null);
      }
      c.changed();
      return { ok: true };
    },
    saveDraft(vision, mission, values) {
      const p = active();
      if (!p) return { ok: false, error: 'no_plan' };
      if (!isDrafter || !can(s, v, 'draft', { type: 'VisionStatement', id: p.id })) return { ok: false, error: 'not_allowed' };
      const mode = modeOf(p.id);
      if (!mode) return { ok: false, error: 'already_recorded' };
      if (draftStatus(draftRecords(p.id)) === 'sent') return { ok: false, error: 'already_sent' };
      // A draft may be incomplete; only the values' own rules apply on saving (names, meanings, up to ten).
      const verr = valuesError(values);
      if (verr) return { ok: false, error: verr };
      const stamp = { at: c.clock(), byMembershipId: v.membershipId };
      if (mode === 'all') {
        for (const [kind, text] of [['vision', vision], ['mission', mission]] as const) {
          const old = s.visionStatements.find((x) => x.planId === p.id && x.kind === kind);
          if (old) {
            if (old.text === text.trim()) continue;
            const before = structuredClone(old);
            Object.assign(old, { text: text.trim(), updated: stamp });
            audit('update', { type: 'VisionStatement', id: old.id }, before, structuredClone(old));
          } else if (text.trim()) {
            const rec: VisionStatement = { orgId: s.organisation.id, created: stamp, updated: stamp, id: `vs-${p.id}-${kind}` as Id<'VisionStatement'>, planId: p.id, kind, text: text.trim(), confirmation: null };
            s.visionStatements.push(rec);
            audit('create', { type: 'VisionStatement', id: rec.id }, null, structuredClone(rec));
          }
        }
      }
      saveValues(s, p.id, values, () => stamp, audit);
      // The draft keeps a sent-back reason until it is sent again; every record of it carries the same state.
      const returned = draftRecords(p.id).find((x) => x.returned)?.returned ?? null;
      for (const x of draftRecords(p.id)) x.returned = returned;
      c.changed();
      return { ok: true };
    },

    sendDraft() {
      const p = active();
      if (!p) return { ok: false, error: 'no_plan' };
      if (!isDrafter) return { ok: false, error: 'not_allowed' };
      const recs = draftRecords(p.id);
      const mode = modeOf(p.id);
      if (!recs.length || !mode) return { ok: false, error: 'no_draft' };
      if (draftStatus(recs) === 'sent') return { ok: false, error: 'already_sent' };
      const values = valuesOf(recs, p.id);
      if (mode === 'all' && (!recs.some((x) => x.kind === 'vision') || !recs.some((x) => x.kind === 'mission'))) return { ok: false, error: 'text_required' };
      if (mode === 'values' && !values.length) return { ok: false, error: 'values_required' };
      const stamp = { at: c.clock(), byMembershipId: v.membershipId };
      for (const x of recs) { x.sentForConfirmation = stamp; x.returned = null; }
      audit('send', { type: 'StrategicPlan', id: p.id }, null, { visionStatements: recs.map((x) => x.id), to: 'executive' });
      c.changed();
      return { ok: true };
    },

    confirmDraft() {
      const p = active();
      if (!p) return { ok: false, error: 'no_plan' };
      if (!isExecutive || !can(s, v, 'confirm', { type: 'VisionStatement', id: p.id })) return { ok: false, error: 'not_allowed' };
      const recs = draftRecords(p.id);
      if (!recs.length) return { ok: false, error: 'no_draft' };
      if (draftStatus(recs) !== 'sent') return { ok: false, error: 'not_sent' };
      const stamp = { at: c.clock(), byMembershipId: v.membershipId };
      for (const x of recs) {
        const before = structuredClone(x);
        Object.assign(x, { confirmation: stamp, sentForConfirmation: null, returned: null });
        audit('confirm', { type: 'VisionStatement', id: x.id }, before, { ...structuredClone(x), afterPublication: true });
      }
      c.changed();
      return { ok: true };
    },

    sendBackDraft(reason) {
      const p = active();
      if (!p) return { ok: false, error: 'no_plan' };
      if (!isExecutive) return { ok: false, error: 'not_allowed' };
      const recs = draftRecords(p.id);
      if (!recs.length) return { ok: false, error: 'no_draft' };
      if (draftStatus(recs) !== 'sent') return { ok: false, error: 'not_sent' };
      if (!reason.trim()) return { ok: false, error: 'reason_required' };
      const stamp = { at: c.clock(), byMembershipId: v.membershipId };
      for (const x of recs) { x.returned = { ...stamp, reason: reason.trim() }; x.sentForConfirmation = null; }
      audit('send_back', { type: 'StrategicPlan', id: p.id }, null, { visionStatements: recs.map((x) => x.id), reason: reason.trim() });
      c.changed();
      return { ok: true };
    },
  };
}
