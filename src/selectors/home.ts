/**
 * Figures for the role homes (Build Brief, screen 4). Computed from records on every call; nothing stored. Pure.
 * Permissions are not decided here: the data-access layer passes `canView` and `canSeeRating`, and a restricted
 * figure is returned whenever they say no (rule 5).
 */
import type { ISODate, Money, PerformanceContract, Review } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import type { Viewer } from '../data/access/viewer';
import { goalProgress, type ProgressContext, type RollUp } from '../rules/kpi-progress';
import { currentReview, labelOf, rateContract, schemeOf, type ContractRating, type ObjectiveRating } from '../rules/rating';
import { activitiesOfGoal, currentBudgetVersion, fundedActivityIds, goalOfObjective, kpiOf, linesOfVersion, objectiveOfKpi } from '../rules/structure';
import { holderOf, refActivity, refGoal, refKpi, refObjective, type Holder, type NodeRef } from './node';

/** Fixed role homes (shell decision): one per assigned role or derived relation, in this order. */
export type HomeKind = 'executive' | 'strategy_office' | 'finance' | 'hr' | 'supervisor' | 'employee' | 'member';

export function homesFor(v: Viewer): HomeKind[] {
  const out: HomeKind[] = [];
  if (v.roles.includes('executive')) out.push('executive');
  if (v.roles.includes('strategy_office')) out.push('strategy_office');
  if (v.roles.includes('finance')) out.push('finance');
  if (v.roles.includes('hr')) out.push('hr');
  if (v.isSupervisor) out.push('supervisor');
  if (v.hasContract) out.push('employee');
  return out.length ? out : ['member'];
}

export interface Access {
  canView: (subject: { type: string; id: string }) => boolean;
  canSeeRating: (contractId: string) => boolean;
}

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'en-GB', { numeric: true });
const activeGoals = (s: Store) => {
  const active = new Set(s.plans.filter((p) => p.status === 'active').map((p) => p.id));
  return s.goals.filter((g) => active.has(g.planId)).sort(byCode);
};
const perspectiveOf = (s: Store, key: string | null) => s.organisation.perspectives?.find((p) => p.key === key)?.label ?? null;

/* ───────── Executive and Strategy office: goal progress ───────── */

export interface GoalHealth {
  ref: NodeRef;
  perspectiveLabel: string | null;
  owner: string | null; // position title
  progress: RollUp;
  funded: number;
  activities: number;
}

export function goalHealth(s: Store, ctx: ProgressContext): GoalHealth[] {
  const funded = fundedActivityIds(s, ctx.financialYear);
  return activeGoals(s).map((g) => {
    const acts = activitiesOfGoal(s, g.id, ctx.financialYear);
    return {
      ref: refGoal(g),
      perspectiveLabel: perspectiveOf(s, g.perspective),
      owner: s.positions.find((p) => p.id === g.ownerPositionId)?.title ?? null,
      progress: goalProgress(s, g, ctx),
      funded: acts.filter((a) => funded.has(a.id)).length,
      activities: acts.length,
    };
  });
}

export const activePlanTitle = (s: Store): string | null => s.plans.find((p) => p.status === 'active')?.title ?? null;

/* ───────── Finance: the current budget version ───────── */

export interface FinanceSummary {
  version: { number: number; status: 'draft' | 'submitted' | 'approved' | 'locked' | 'superseded' } | null;
  lines: number;
  hiddenLines: number;
  /** Amounts only when every line is visible, so no partial total is ever shown as the whole. */
  total: Money | null;
  linked: { lines: number; amount: Money | null };
  unlinked: { lines: number; amount: Money | null };
  bySource: { source: string; amount: Money }[] | null;
}

export function financeSummary(s: Store, fy: number, access: Access): FinanceSummary {
  const v = currentBudgetVersion(s, fy);
  const currency = s.organisation.baseCurrency;
  const lines = linesOfVersion(s, fy);
  const all = lines.every((l) => access.canView({ type: 'BudgetLine', id: l.id }));
  const hidden = lines.filter((l) => !access.canView({ type: 'BudgetLine', id: l.id })).length;
  const sum = (ls: typeof lines): Money => ({ amountMinor: ls.reduce((n, l) => n + l.amount.amountMinor, 0), currency });
  const linked = lines.filter((l) => l.activityId);
  const unlinked = lines.filter((l) => !l.activityId);
  const sources = [...new Set(lines.map((l) => l.fundingSource))];
  return {
    version: v ? { number: v.version, status: v.status } : null,
    lines: lines.length,
    hiddenLines: hidden,
    total: all ? sum(lines) : null,
    linked: { lines: linked.length, amount: all ? sum(linked) : null },
    unlinked: { lines: unlinked.length, amount: all ? sum(unlinked) : null },
    bySource: all
      ? sources.map((source) => ({ source, amount: sum(lines.filter((l) => l.fundingSource === source)) })).sort((a, b) => b.amount.amountMinor - a.amount.amountMinor)
      : null,
  };
}

/* ───────── Ratings, as they may be shown ───────── */

export interface RatingView {
  overall: number | null;
  label: string | null;
  provisional: boolean;
  scoredWeightPct: number;
  totalWeightPct: number;
  floorApplied: boolean;
  flags: number;
}

const ratingView = (r: ContractRating): RatingView => ({
  overall: r.overall, label: r.label, provisional: r.provisional, scoredWeightPct: r.scoredWeightPct, totalWeightPct: r.totalWeightPct,
  floorApplied: r.floorApplied, flags: r.flags.length,
});

/* ───────── Supervisor: the team ───────── */

export interface TeamMember {
  positionId: string;
  position: string;
  unit: string;
  holder: Holder | null;
  contract: { id: string; status: PerformanceContract['status']; objectives: number } | null;
  review: { kind: Review['kind']; status: Review['status'] } | null;
  /** Null when the viewer may not see ratings for this contract, or there is no contract. */
  rating: RatingView | null;
}

export function team(s: Store, v: Viewer, ctx: ProgressContext, access: Access): TeamMember[] {
  const reports = s.positions.filter((p) => p.reportsToPositionId !== null && (v.positionIds as string[]).includes(p.reportsToPositionId));
  return reports
    .map((p) => {
      const c = s.contracts.find((x) => x.positionId === p.id && x.financialYear === ctx.financialYear);
      const visible = !!c && access.canView({ type: 'PerformanceContract', id: c.id });
      const r = c && visible ? currentReview(s, c.id) : undefined;
      const rated = c && visible && access.canSeeRating(c.id) ? rateContract(s, c.id, { now: ctx.now }) : null;
      return {
        positionId: p.id,
        position: p.title,
        unit: s.units.find((u) => u.id === p.unitId)?.name ?? '',
        holder: holderOf(s, p.id, ctx.now),
        contract: c && visible ? { id: c.id, status: c.status, objectives: s.contractObjectives.filter((o) => o.contractId === c.id).length } : null,
        review: r ? { kind: r.kind, status: r.status } : null,
        rating: rated ? ratingView(rated) : null,
      };
    })
    .sort((a, b) => a.position.localeCompare(b.position, 'en-GB', { numeric: true }));
}

/* ───────── Employee: the contract, with line of sight ───────── */

export interface ContractObjectiveView {
  id: string;
  title: string;
  weightPct: number;
  /** Goal › objective › KPI › activity, each a cascade-node page open to all members. */
  lineage: NodeRef[];
  target: { value: number; unit: string } | null;
  /** Null when the viewer may not see ratings. */
  rating: (Pick<ObjectiveRating, 'done' | 'achievement' | 'basis' | 'score' | 'adjustment'> & { label: string | null }) | null;
}

export interface MyContract {
  id: string;
  position: string;
  status: PerformanceContract['status'];
  signedOn: ISODate | null;
  objectives: ContractObjectiveView[];
  review: { kind: Review['kind']; status: Review['status'] } | null;
  rating: RatingView | null;
}

export function myContracts(s: Store, v: Viewer, ctx: ProgressContext, access: Access, dateOf: (at: string) => ISODate): MyContract[] {
  const { bands } = schemeOf(s);
  return s.contracts
    .filter((c) => c.personId === v.personId && c.financialYear === ctx.financialYear && access.canView({ type: 'PerformanceContract', id: c.id }))
    .map((c) => {
      const rated = access.canSeeRating(c.id) ? rateContract(s, c.id, { now: ctx.now }) : null;
      const r = currentReview(s, c.id);
      return {
        id: c.id,
        position: s.positions.find((p) => p.id === c.positionId)?.title ?? '',
        status: c.status,
        signedOn: c.signedByEmployee ? dateOf(c.signedByEmployee.at) : null,
        review: r ? { kind: r.kind, status: r.status } : null,
        rating: rated ? ratingView(rated) : null,
        objectives: s.contractObjectives
          .filter((co) => co.contractId === c.id)
          .map((co) => {
            const a = s.activities.find((x) => x.id === co.sourceActivityId);
            const k = a && kpiOf(s, a);
            const o = k && objectiveOfKpi(s, k);
            const g = o && goalOfObjective(s, o);
            const lineage = [g && refGoal(g), o && refObjective(o), k && refKpi(k), a && refActivity(a)].filter((x): x is NodeRef => !!x);
            const or = rated?.objectives.find((x) => x.contractObjectiveId === co.id);
            return {
              id: co.id,
              title: co.snapshot?.title ?? co.title,
              weightPct: co.weightPct,
              lineage,
              target: co.snapshot?.quantityTarget ?? co.quantityTarget,
              rating: or
                ? { done: or.done, achievement: or.achievement, basis: or.basis, score: or.score, adjustment: or.adjustment, label: or.score ? labelOf(or.score, bands) : null }
                : null,
            };
          }),
      };
    });
}

/* ───────── HR: contract coverage and reviews ───────── */

export interface HrSummary {
  contracts: { signed: number; issued: number; draft: number; none: number };
  reviews: { open: number; selfSubmitted: number };
  scored: { contractId: string; person: string; position: string; rating: RatingView }[];
}

export function hrSummary(s: Store, ctx: ProgressContext, access: Access): HrSummary {
  const fy = ctx.financialYear;
  const contracts = s.contracts.filter((c) => c.financialYear === fy && access.canView({ type: 'PerformanceContract', id: c.id }));
  const withContract = new Set<string>(s.contracts.filter((c) => c.financialYear === fy).map((c) => c.positionId));
  const heldWithout = s.positions.filter((p) => !withContract.has(p.id) && holderOf(s, p.id, ctx.now)?.person);
  const reviews = s.reviews.filter((r) => contracts.some((c) => c.id === r.contractId));
  const scored: HrSummary['scored'] = [];
  for (const c of contracts) {
    if (!access.canSeeRating(c.id)) continue;
    const r = rateContract(s, c.id, { now: ctx.now });
    if (!r || r.overall === null) continue;
    scored.push({
      contractId: c.id,
      person: s.people.find((p) => p.id === c.personId)?.fullName ?? '',
      position: s.positions.find((p) => p.id === c.positionId)?.title ?? '',
      rating: ratingView(r),
    });
  }
  return {
    contracts: {
      signed: contracts.filter((c) => c.status === 'signed' || c.status === 'closed').length,
      issued: contracts.filter((c) => c.status === 'issued').length,
      draft: contracts.filter((c) => c.status === 'draft').length,
      none: heldWithout.length,
    },
    reviews: { open: reviews.filter((r) => r.status === 'open').length, selfSubmitted: reviews.filter((r) => r.status === 'self_submitted').length },
    scored,
  };
}
