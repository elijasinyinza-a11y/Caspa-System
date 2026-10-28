/**
 * The universal cascade-node page and the cascade tree (Build Brief, screen 2).
 * Pure: every figure is computed from stored records on each call. Permissions are not decided here:
 * the data-access layer passes in `canView`, and this module returns the restricted version of a panel
 * whenever `canView` says no (rule 5).
 */
import {
  SIX_P_SCOPE, type Activity, type FourQCell, type Goal, type ISODate, type Kpi, type Money, type Objective,
  type SixPLevel, type SystemTerm,
} from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { computeFindings } from '../rules/integrity';
import { goalProgress, kpiProgress, objectiveProgress, type KpiProgress, type ProgressContext, type RollUp } from '../rules/kpi-progress';
import { fundedActivityIds, goalOfObjective, kpiOf, linesOfVersion, objectiveOfKpi } from '../rules/structure';
import type { Finding } from '../contract/caspa-data-contract';

export type NodeKind = 'goal' | 'objective' | 'kpi' | 'activity';
export const NODE_KINDS: NodeKind[] = ['goal', 'objective', 'kpi', 'activity'];
/** Contract record type behind each node kind, as used in permissions and finding subjects. */
export const NODE_TYPE: Record<NodeKind, 'Goal' | 'Objective' | 'Kpi' | 'Activity'> = { goal: 'Goal', objective: 'Objective', kpi: 'Kpi', activity: 'Activity' };
const TERM: Record<NodeKind, SystemTerm> = { goal: 'goal', objective: 'objective', kpi: 'kpi', activity: 'activity' };

export interface NodeRef {
  kind: NodeKind;
  id: string;
  code: string;
  title: string;
}

export interface Holder {
  position: string;
  person: string | null; // null: the position is vacant
  acting: boolean;
}

export type Reasons =
  | { visible: true; entries: { on: 'goal' | 'objective'; cell: FourQCell; text: string }[] }
  | { visible: false; count: number };

export interface StrategyPanel {
  planTitle: string;
  goal: NodeRef;
  perspective: string | null;
  reasons: Reasons;
}

export type CascadePanel =
  | { kind: 'goal'; progress: RollUp; children: { ref: NodeRef; progress: RollUp }[] }
  | { kind: 'objective'; progress: RollUp; children: { ref: NodeRef; progress: KpiProgress }[] }
  | {
      kind: 'kpi';
      progress: KpiProgress;
      unit: string;
      direction: Kpi['direction'];
      aggregation: Kpi['aggregation'];
      frequency: Kpi['reportingFrequency'];
      children: { ref: NodeRef; level: SixPLevel | null; funded: boolean }[];
    }
  | {
      kind: 'activity';
      level: SixPLevel | null;
      scope: string | null;
      evidence: string;
      frequency: Activity['reportingFrequency'];
      status: Activity['status'];
      /** Activity completion. Never counted as KPI progress (Build Brief, section 8). */
      completion: { target: number; unit: string; done: number | null; asOf: ISODate | null; share: number | null } | null;
      dependsOn: NodeRef[];
      kpi: { ref: NodeRef; progress: KpiProgress };
    };

export interface PlanLine {
  id: string;
  description: string;
  amount: Money;
  costCategory: string;
  fundingSource: string;
  activity: NodeRef;
}

export interface PlanPanel {
  /** Activities under this node in the year, and how many have at least one budget line. Visible to everyone. */
  activities: number;
  funded: number;
  /** Funded or not, per activity. Visible to everyone (BudgetLine non-viewers see status only). */
  activityFunding: { ref: NodeRef; funded: boolean }[];
  /** Lines this viewer may see in full. */
  lines: PlanLine[];
  /** Lines that exist but this viewer may not see. */
  hiddenLines: number;
  /** Sum of lines, only when every line is visible, so no partial total is ever shown as the whole. */
  total: Money | null;
  /**
   * Goal and objective pages only (Build Brief, section 18): the lines grouped by the next level down,
   * one group per child in code order. A subtotal is shown only when every line in its group is visible,
   * so whenever `total` is shown the subtotals sum to it. Null on KPI and activity pages.
   */
  groups: PlanGroup[] | null;
}

export interface PlanGroup {
  ref: NodeRef;
  activities: number;
  funded: number;
  lines: PlanLine[];
  hiddenLines: number;
  subtotal: Money | null;
}

export interface PerformancePanel {
  /** Contract objectives the viewer may see in full. Ratings are never shown here. */
  objectives: {
    id: string;
    person: string;
    position: string;
    title: string;
    target: { value: number; unit: string } | null;
    done: number | null;
    contractStatus: string;
    activity: NodeRef;
  }[];
  /** Contract coverage the viewer may not see in full: a count and assigned quantity, with no names, positions or progress. */
  hidden: { count: number; assigned: { value: number; unit: string }[] };
}

export interface NodeView {
  ref: NodeRef;
  label: string; // the organisation's label for this kind (T1)
  lineage: (NodeRef & { label: string })[];
  owner: Holder | null;
  strategy: StrategyPanel;
  cascade: CascadePanel;
  plan: PlanPanel;
  performance: PerformancePanel;
  findings: Finding[];
}

export interface Access {
  canView: (subject: { type: string; id: string }) => boolean;
}

/* ───────── helpers ───────── */

const byCode = <T extends { code: string }>(a: T, b: T) => a.code.localeCompare(b.code, 'en-GB', { numeric: true });
export const refGoal = (g: Goal): NodeRef => ({ kind: 'goal', id: g.id, code: g.code, title: g.title });
export const refObjective = (o: Objective): NodeRef => ({ kind: 'objective', id: o.id, code: o.code, title: o.title });
export const refKpi = (k: Kpi): NodeRef => ({ kind: 'kpi', id: k.id, code: k.code, title: k.name });
export const refActivity = (a: Activity): NodeRef => ({ kind: 'activity', id: a.id, code: a.code, title: a.title });

const activePlanIds = (s: Store) => new Set(s.plans.filter((p) => p.status === 'active').map((p) => p.id));

/** The person holding a position on a date. A substantive holder is preferred to an acting one. */
export const holderOf = (s: Store, positionId: string | null, now: ISODate): Holder | null => {
  if (!positionId) return null;
  const p = s.positions.find((x) => x.id === positionId);
  if (!p) return null;
  const current = s.assignments
    .filter((a) => a.positionId === positionId && a.from <= now && (a.to === null || a.to >= now))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'substantive' ? -1 : 1))[0];
  const person = current ? s.people.find((x) => x.id === current.personId)?.fullName ?? null : null;
  return { position: p.title, person, acting: current?.kind === 'acting' };
};

/** The records under a node, for the year: the node's own subtree. */
function subtree(s: Store, kind: NodeKind, id: string, fy: number) {
  const goals = kind === 'goal' ? s.goals.filter((g) => g.id === id) : [];
  const objectives =
    kind === 'objective' ? s.objectives.filter((o) => o.id === id) : s.objectives.filter((o) => goals.some((g) => g.id === o.goalId));
  const kpis = kind === 'kpi' ? s.kpis.filter((k) => k.id === id) : s.kpis.filter((k) => objectives.some((o) => o.id === k.objectiveId));
  const activities = (kind === 'activity' ? s.activities.filter((a) => a.id === id) : s.activities.filter((a) => kpis.some((k) => k.id === a.kpiId)))
    .filter((a) => a.financialYear === fy && a.status !== 'archived')
    .sort(byCode);
  return { goals, objectives, kpis, activities };
}

/* ───────── node page ───────── */

export function nodeView(s: Store, kind: NodeKind, id: string, ctx: ProgressContext, access: Access): NodeView | null {
  const plans = activePlanIds(s);
  const fy = ctx.financialYear;
  const label = (k: NodeKind) => s.organisation.termLabels[TERM[k]].singular;

  // Resolve the chain goal › objective › KPI › activity by ID.
  let goal: Goal | undefined;
  let objective: Objective | undefined;
  let kpi: Kpi | undefined;
  let activity: Activity | undefined;
  if (kind === 'activity') {
    activity = s.activities.find((a) => a.id === id);
    kpi = activity && kpiOf(s, activity);
  }
  if (kind === 'kpi') kpi = s.kpis.find((k) => k.id === id);
  if (kind === 'objective') objective = s.objectives.find((o) => o.id === id);
  if (kpi) objective = objectiveOfKpi(s, kpi);
  if (kind === 'goal') goal = s.goals.find((g) => g.id === id);
  if (objective) goal = goalOfObjective(s, objective);
  if (!goal || !plans.has(goal.planId)) return null;
  if (kind !== 'goal' && !objective) return null;
  if ((kind === 'kpi' || kind === 'activity') && !kpi) return null;
  if (kind === 'activity' && !activity) return null;
  if (!access.canView({ type: NODE_TYPE[kind], id })) return null;

  const chain: NodeRef[] = [refGoal(goal)];
  if (objective) chain.push(refObjective(objective));
  if (kpi) chain.push(refKpi(kpi));
  if (activity) chain.push(refActivity(activity));
  const ref = chain[chain.length - 1]!;
  const ownerPositionId = (activity ?? kpi ?? objective ?? goal).ownerPositionId;

  /* Strategy: why. 4Q entries on the goal and, below goal level, on the objective. */
  const entryIds: { on: 'goal' | 'objective'; id: string }[] = [
    ...goal.fourQEntryIds.map((q) => ({ on: 'goal' as const, id: q })),
    ...(objective ? objective.fourQEntryIds.map((q) => ({ on: 'objective' as const, id: q })) : []),
  ];
  const entries = entryIds.flatMap(({ on, id: qid }) => {
    const q = s.fourQEntries.find((x) => x.id === qid);
    return q ? [{ on, q }] : [];
  });
  const reasons: Reasons = entries.every(({ q }) => access.canView({ type: 'FourQEntry', id: q.id }))
    ? { visible: true, entries: entries.map(({ on, q }) => ({ on, cell: q.cell, text: q.text })) }
    : { visible: false, count: entries.length };
  const strategy: StrategyPanel = {
    planTitle: s.plans.find((p) => p.id === goal!.planId)?.title ?? '',
    goal: refGoal(goal),
    perspective: s.organisation.perspectives?.find((p) => p.key === goal!.perspective)?.label ?? null,
    reasons,
  };

  /* Cascade: how. */
  const funded = fundedActivityIds(s, fy);
  const actsOf = (k: Kpi) => s.activities.filter((a) => a.kpiId === k.id && a.financialYear === fy && a.status !== 'archived').sort(byCode);
  let cascade: CascadePanel;
  if (kind === 'goal') {
    cascade = {
      kind: 'goal',
      progress: goalProgress(s, goal, ctx),
      children: s.objectives.filter((o) => o.goalId === goal!.id).sort(byCode).map((o) => ({ ref: refObjective(o), progress: objectiveProgress(s, o, ctx) })),
    };
  } else if (kind === 'objective') {
    cascade = {
      kind: 'objective',
      progress: objectiveProgress(s, objective!, ctx),
      children: s.kpis.filter((k) => k.objectiveId === objective!.id).sort(byCode).map((k) => ({ ref: refKpi(k), progress: kpiProgress(s, k, ctx) })),
    };
  } else if (kind === 'kpi') {
    cascade = {
      kind: 'kpi',
      progress: kpiProgress(s, kpi!, ctx),
      unit: kpi!.unit,
      direction: kpi!.direction,
      aggregation: kpi!.aggregation,
      frequency: kpi!.reportingFrequency,
      children: actsOf(kpi!).map((a) => ({ ref: refActivity(a), level: a.decisionLevel, funded: funded.has(a.id) })),
    };
  } else {
    const a = activity!;
    const latest = s.activityProgress
      .filter((p) => p.activityId === a.id && p.periodEnd <= ctx.now && p.quantityDone !== null)
      .sort((x, y) => (x.periodEnd < y.periodEnd ? 1 : x.periodEnd > y.periodEnd ? -1 : 0))[0];
    cascade = {
      kind: 'activity',
      level: a.decisionLevel,
      scope: a.decisionLevel ? SIX_P_SCOPE[a.decisionLevel] : null,
      evidence: a.evidence,
      frequency: a.reportingFrequency,
      status: a.status,
      completion: a.quantityTarget
        ? {
            target: a.quantityTarget.value,
            unit: a.quantityTarget.unit,
            done: latest?.quantityDone ?? null,
            asOf: latest?.periodEnd ?? null,
            share: latest?.quantityDone != null && a.quantityTarget.value > 0 ? latest.quantityDone / a.quantityTarget.value : null,
          }
        : null,
      dependsOn: a.dependsOn.flatMap((d) => {
        const x = s.activities.find((y) => y.id === d);
        return x ? [refActivity(x)] : [];
      }),
      kpi: { ref: refKpi(kpi!), progress: kpiProgress(s, kpi!, ctx) },
    };
  }

  /* Plan: budget lines of the activities under this node, in the year's current version. */
  const tree = subtree(s, kind, id, fy);
  const actIds = new Set(tree.activities.map((a) => a.id));
  const allLines = linesOfVersion(s, fy).filter((l) => l.activityId && actIds.has(l.activityId));
  const visibleLines = allLines.filter((l) => access.canView({ type: 'BudgetLine', id: l.id }));
  const actRef = (aid: string) => refActivity(tree.activities.find((a) => a.id === aid)!);
  const toLine = (l: (typeof visibleLines)[number]): PlanLine => ({
    id: l.id, description: l.description, amount: l.amount, costCategory: l.costCategory, fundingSource: l.fundingSource, activity: actRef(l.activityId!),
  });
  const sum = (ls: typeof allLines): Money => ({ amountMinor: ls.reduce((n, l) => n + l.amount.amountMinor, 0), currency: s.organisation.baseCurrency });
  const childGroups: { ref: NodeRef; kpiIds: Set<string> }[] | null =
    kind === 'goal'
      ? tree.objectives.slice().sort(byCode).map((o) => ({ ref: refObjective(o), kpiIds: new Set(tree.kpis.filter((k) => k.objectiveId === o.id).map((k) => k.id)) }))
      : kind === 'objective'
        ? tree.kpis.slice().sort(byCode).map((k) => ({ ref: refKpi(k), kpiIds: new Set([k.id]) }))
        : null;
  const groups: PlanGroup[] | null = childGroups
    ? childGroups.map(({ ref: r, kpiIds }) => {
        const acts = tree.activities.filter((a) => kpiIds.has(a.kpiId));
        const ids = new Set(acts.map((a) => a.id));
        const all = allLines.filter((l) => ids.has(l.activityId!));
        const vis = all.filter((l) => access.canView({ type: 'BudgetLine', id: l.id }));
        return {
          ref: r,
          activities: acts.length,
          funded: acts.filter((a) => funded.has(a.id)).length,
          lines: vis.map(toLine),
          hiddenLines: all.length - vis.length,
          subtotal: all.length > 0 && vis.length === all.length ? sum(all) : null,
        };
      })
    : null;
  const plan: PlanPanel = {
    activities: tree.activities.length,
    funded: tree.activities.filter((a) => funded.has(a.id)).length,
    activityFunding: tree.activities.map((a) => ({ ref: refActivity(a), funded: funded.has(a.id) })),
    lines: visibleLines.map(toLine),
    hiddenLines: allLines.length - visibleLines.length,
    total: allLines.length > 0 && visibleLines.length === allLines.length ? sum(allLines) : null,
    groups,
  };

  /* Performance: contract objectives drawn from the activities under this node. Never ratings. */
  const performance: PerformancePanel = { objectives: [], hidden: { count: 0, assigned: [] } };
  const assigned = new Map<string, number>();
  for (const co of s.contractObjectives.filter((x) => actIds.has(x.sourceActivityId))) {
    const c = s.contracts.find((x) => x.id === co.contractId);
    if (!c || c.financialYear !== fy) continue;
    const target = co.snapshot ? co.snapshot.quantityTarget : co.quantityTarget;
    if (access.canView({ type: 'ContractObjective', id: co.id })) {
      // Verified updates only count (R6); quantities are cumulative to the period end, so the latest one stands.
      const verified = s.progressUpdates
        .filter((u) => u.contractObjectiveId === co.id && u.verified && u.periodEnd <= ctx.now)
        .sort((x, y) => (x.periodEnd < y.periodEnd ? 1 : x.periodEnd > y.periodEnd ? -1 : 0))[0];
      performance.objectives.push({
        id: co.id,
        person: s.people.find((p) => p.id === c.personId)?.fullName ?? '',
        position: s.positions.find((p) => p.id === c.positionId)?.title ?? '',
        title: co.snapshot ? co.snapshot.title : co.title,
        target,
        done: verified?.quantityDone ?? null,
        contractStatus: c.status,
        activity: actRef(co.sourceActivityId),
      });
    } else {
      performance.hidden.count += 1;
      if (target) assigned.set(target.unit, (assigned.get(target.unit) ?? 0) + target.value);
    }
  }
  performance.hidden.assigned = [...assigned].map(([unit, value]) => ({ unit, value }));

  /* Findings about this node and the records under it, as far as the viewer may see them. */
  const inTree = new Set<string>([
    ...tree.goals.map((x) => `Goal:${x.id}`),
    ...tree.objectives.map((x) => `Objective:${x.id}`),
    ...tree.kpis.map((x) => `Kpi:${x.id}`),
    ...tree.activities.map((x) => `Activity:${x.id}`),
    ...allLines.map((x) => `BudgetLine:${x.id}`),
    ...s.contractObjectives.filter((x) => actIds.has(x.sourceActivityId)).map((x) => `ContractObjective:${x.id}`),
    ...s.deficiencies.filter((d) => tree.objectives.some((o) => o.id === d.objectiveId)).map((x) => `Deficiency:${x.id}`),
  ]);
  const findings = computeFindings(s, { financialYear: fy }).filter((f) => inTree.has(`${f.subject.type}:${f.subject.id}`) && access.canView(f.subject));

  return {
    ref,
    label: label(kind),
    lineage: chain.map((c) => ({ ...c, label: label(c.kind) })),
    owner: holderOf(s, ownerPositionId, ctx.now),
    strategy,
    cascade,
    plan,
    performance,
    findings,
  };
}

/* ───────── cascade tree ───────── */

export interface TreeNode {
  ref: NodeRef;
  /** Progress for goals, objectives and KPIs: the clamped share used for bars, and the status (P3, P10). */
  progress: { share: number | null; status: RollUp['status'] } | null;
  level: SixPLevel | null; // activities only
  funded: boolean | null; // activities only; status, never amounts
  children: TreeNode[];
}

export interface CascadeTree {
  planTitle: string | null;
  goals: TreeNode[];
  counts: Record<NodeKind, number>;
}

export function cascadeTree(s: Store, ctx: ProgressContext): CascadeTree {
  const plans = activePlanIds(s);
  const funded = fundedActivityIds(s, ctx.financialYear);
  const counts: Record<NodeKind, number> = { goal: 0, objective: 0, kpi: 0, activity: 0 };
  const goals = s.goals.filter((g) => plans.has(g.planId)).sort(byCode).map((g): TreeNode => {
    counts.goal += 1;
    const gp = goalProgress(s, g, ctx);
    return {
      ref: refGoal(g), progress: { share: gp.progress, status: gp.status }, level: null, funded: null,
      children: s.objectives.filter((o) => o.goalId === g.id).sort(byCode).map((o): TreeNode => {
        counts.objective += 1;
        const op = objectiveProgress(s, o, ctx);
        return {
          ref: refObjective(o), progress: { share: op.progress, status: op.status }, level: null, funded: null,
          children: s.kpis.filter((k) => k.objectiveId === o.id).sort(byCode).map((k): TreeNode => {
            counts.kpi += 1;
            const kp = kpiProgress(s, k, ctx);
            return {
              ref: refKpi(k), progress: { share: kp.clamped, status: kp.status }, level: null, funded: null,
              children: s.activities
                .filter((a) => a.kpiId === k.id && a.financialYear === ctx.financialYear && a.status !== 'archived')
                .sort(byCode)
                .map((a): TreeNode => {
                  counts.activity += 1;
                  return { ref: refActivity(a), progress: null, level: a.decisionLevel, funded: funded.has(a.id), children: [] };
                }),
            };
          }),
        };
      }),
    };
  });
  return { planTitle: s.plans.find((p) => plans.has(p.id))?.title ?? null, goals, counts };
}
