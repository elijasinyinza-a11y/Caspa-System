/**
 * The Strategy landing (v0.28.0; Strategy Landing Specification v0.1, decisions SL-1 to SL-7, approved 18 November
 * 2026; prototype approved the same day). The page shows the strategy itself: the active plan, its vision and mission,
 * the goals the viewer's signed work serves, and each goal with its progress and why it was chosen.
 *
 * Every block reuses an existing figure or rule: goal progress as Home (`goalProgress`), reasons as record pages
 * (`nodeView`'s strategy section), owners as record pages (`holderOf`). Everything shown is readable by all members
 * under the contract's matrix, except reasons, which follow `FourQEntry: view` (SL-3). No contract change.
 */
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
  statements: { vision: string | null; mission: string | null; recorded: { by: string; on: ISODate } | null };
  /** SL-4: the Executive, while the active plan has neither statement. */
  canRecord: boolean;
  /** SL-5: the goals the viewer's signed commitments serve this year; null without a signed contract. */
  yourPart: NodeRef[] | null;
  /** SL-2: by perspective, in the organisation's order, when it uses a scorecard; otherwise one group with no label. */
  groups: { label: string | null; goals: LandingGoal[] }[];
  /** The share of the financial year passed, for the mark on progress bars. */
  expected: number;
  themes: { id: string; title: string }[];
}

export type RecordStatementsError = 'not_allowed' | 'already_recorded' | 'no_plan' | 'text_required';

export interface StrategyLandingAccess {
  /** The landing for the active plan, limited to this viewer; null when there is no active plan. */
  landing(): StrategyLanding | null;
  /** SL-4: the Executive records the vision and mission once, confirmed as saved. Later changes go through a plan revision. */
  recordStatements(vision: string, mission: string): { ok: true } | { ok: false; error: RecordStatementsError };
}

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'en-GB', { numeric: true });

export function createStrategyLandingAccess(c: Ctx): StrategyLandingAccess {
  const { s, viewer: v, now } = c;
  const fy = c.financialYear as number;
  const isExecutive = v.roles.includes('executive');
  const active = () => s.plans.find((p) => p.status === 'active');
  const person = (membershipId: string) => s.people.find((p) => p.id === s.memberships.find((m) => m.id === membershipId)?.personId)?.fullName ?? '';
  const on = (at: string) => dateInZone(at, s.organisation.timeZone);
  const statementsOf = (planId: string) => s.visionStatements.filter((x) => x.planId === planId && x.text.trim() !== '');

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
      const stamp = (vision ?? mission)?.confirmation ?? null;

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
        statements: { vision: vision?.text ?? null, mission: mission?.text ?? null, recorded: stamp ? { by: person(stamp.byMembershipId), on: on(stamp.at) } : null },
        canRecord: isExecutive && st.length === 0,
        yourPart: mine.length ? [...served.values()].sort(byCode) : null,
        groups,
        expected: expectedToDate(fy, start, now),
        themes: s.themes.filter((t) => t.planId === p.id).map((t) => ({ id: t.id, title: t.title })),
      };
    },

    recordStatements(vision, mission) {
      const p = active();
      if (!p) return { ok: false, error: 'no_plan' };
      if (!isExecutive || !can(s, v, 'draft', { type: 'VisionStatement', id: p.id })) return { ok: false, error: 'not_allowed' };
      if (statementsOf(p.id).length) return { ok: false, error: 'already_recorded' };
      if (!vision.trim() || !mission.trim()) return { ok: false, error: 'text_required' };
      const stamp = { at: c.clock(), byMembershipId: v.membershipId };
      for (const [kind, text] of [['vision', vision], ['mission', mission]] as const) {
        const old = s.visionStatements.find((x) => x.planId === p.id && x.kind === kind);
        const rec: VisionStatement = old
          ? { ...old, text: text.trim(), confirmation: stamp, updated: stamp }
          : { orgId: s.organisation.id, created: stamp, updated: stamp, id: `vs-${p.id}-${kind}` as Id<'VisionStatement'>, planId: p.id, kind, text: text.trim(), confirmation: stamp };
        if (old) Object.assign(old, rec); else s.visionStatements.push(rec);
        s.auditEntries.push({ id: `au-${s.auditEntries.length + 1}` as never, orgId: s.organisation.id, at: stamp.at, actorMembershipId: v.membershipId, action: 'confirm', entity: { type: 'VisionStatement', id: rec.id }, before: null, after: { kind, text: rec.text, afterPublication: true } });
      }
      c.changed();
      return { ok: true };
    },
  };
}
