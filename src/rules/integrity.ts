/**
 * Integrity rule catalogue and checker (Build Brief v1.1, section 8).
 * Pure: no React, no I/O, no system clock. Findings are computed, never stored.
 */
import type { Finding, GateCode, Id, IntegrityRule } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { en } from '../strings/en';
import { kpiBaseline } from './baseline';
import { signedQuantity } from './cascade-edit';
import { activityFingerprint } from './fingerprint';
import { activitiesOfGoal, fundedActivityIds, linesOfVersion, objectiveOfActivity, objectiveOfKpi, accountablePositionOfUnit } from './structure';

export const RULES = {
  budgetLineNoActivity: { id: 'STRUCT-BUDGETLINE-NO-ACTIVITY', source: 'structural', description: 'Budget line has no parent activity', blocksAt: ['budget.submit_unit', 'budget.submit_consolidated'] },
  activityNo6P: { id: 'STRUCT-ACTIVITY-NO-6P', source: 'structural', description: 'Activity has no 6P decision level', blocksAt: ['cascade.publish'] },
  kpiTargetInvalid: { id: 'STRUCT-KPI-TARGET-INVALID', source: 'structural', description: 'KPI target equals baseline or is on the wrong side for its direction', blocksAt: ['cascade.publish'] },
  goalNoFundedActivity: { id: 'STRUCT-GOAL-NO-FUNDED-ACTIVITY', source: 'structural', description: 'Goal has no funded activity', blocksAt: [] },
  objectiveNoKpi: { id: 'STRUCT-OBJECTIVE-NO-KPI', source: 'structural', description: 'Objective has no KPI', blocksAt: [] },
  kpiNoOwner: { id: 'STRUCT-KPI-NO-OWNER', source: 'structural', description: 'KPI has no owner', blocksAt: [] },
  deficiencyUnaddressed: { id: 'STRUCT-DEFICIENCY-UNADDRESSED', source: 'structural', description: 'Deficiency has no corrective activity', blocksAt: [] },
  contractUpstreamChanged: { id: 'STRUCT-CONTRACT-UPSTREAM-CHANGED', source: 'structural', description: "Contract objective's source changed after signature", blocksAt: [] },
  kpiBaselineNotValidated: { id: 'BOOK-KPI-BASELINE-NOT-VALIDATED', source: 'book', description: 'KPI uses a baseline that is not validated', blocksAt: ['cascade.publish'] },
  goalNoWhy: { id: 'BOOK-GOAL-NO-WHY', source: 'book', description: 'Goal has no recorded why (no linked 4Q entry)', blocksAt: [] },
  envelopeExceeded: { id: 'BOOK-ENVELOPE-EXCEEDED', source: 'book', description: "Objectives' indicative costs exceed the resource envelope", blocksAt: [] },
  // Part 11d (D11d-8): checks at plan confirmation for a formed plan, computed by src/rules/composition.ts.
  riskUnaddressed: { id: 'STRUCT-4Q-RISK-UNADDRESSED', source: 'structural', description: 'A critical failure factor or predicted future risk is not addressed by any goal or objective', blocksAt: [] },
  goalNoObjective: { id: 'STRUCT-GOAL-NO-OBJECTIVE', source: 'structural', description: 'Goal has no accepted objective', blocksAt: [] },
  // v0.29.0 (CV-7): a formed plan confirmed without corporate values; worth checking only, never blocking.
  planNoValues: { id: 'STRUCT-PLAN-NO-VALUES', source: 'structural', description: 'Plan has no corporate values recorded', blocksAt: [] },
  // v0.26.0 (contract v1.20): the plan-size guide, set by HR, off by default; worth checking only, never blocking.
  objectiveManyKpis: { id: 'GUIDE-OBJECTIVE-MANY-KPIS', source: 'structural', description: 'Objective has more KPIs than the plan-size guide suggests', blocksAt: [] },
  kpiManyActivities: { id: 'GUIDE-KPI-MANY-ACTIVITIES', source: 'structural', description: 'KPI has more activities than the plan-size guide suggests', blocksAt: [] },
  // v0.27.0 (in-year changes, IC-6 and IC-7): worth checking only, never blocking.
  activityTargetBelowSigned: { id: 'STRUCT-ACTIVITY-TARGET-BELOW-SIGNED', source: 'structural', description: "Activity's quantity target is below what signed contracts carry", blocksAt: [] },
  commitmentActivityStopped: { id: 'STRUCT-COMMITMENT-ACTIVITY-STOPPED', source: 'structural', description: "A signed commitment's activity was stopped", blocksAt: [] },
  budgetLineActivityStopped: { id: 'STRUCT-BUDGETLINE-ACTIVITY-STOPPED', source: 'structural', description: "Budget line's activity was stopped", blocksAt: [] },
} as const satisfies Record<string, IntegrityRule>;

type RuleKey = keyof typeof RULES;

export interface CheckContext {
  financialYear: number;
}

const P = (ids: (string | null | undefined)[]) => ids.filter((x): x is string => !!x) as Id<'Position'>[];

export function computeFindings(s: Store, ctx: CheckContext): Finding[] {
  const out: Finding[] = [];
  const push = (rule: RuleKey, subject: { type: string; id: string }, message: string, route: (string | null | undefined)[]) => {
    const r = RULES[rule];
    out.push({ key: `${r.id}:${subject.type}:${subject.id}`, ruleId: r.id, subject, message, blocksAt: [...r.blocksAt] as GateCode[], routeToPositionIds: P(route) });
  };
  const fy = ctx.financialYear;
  // Messages read in the organisation's own labels (Clarity Specification, D3).
  const terms = s.organisation.termLabels;
  const activePlans = new Set(s.plans.filter((p) => p.status === 'active').map((p) => p.id));
  const goals = s.goals.filter((g) => activePlans.has(g.planId));
  const goalIds = new Set(goals.map((g) => g.id));
  const objectives = s.objectives.filter((o) => goalIds.has(o.goalId));
  const objectiveIds = new Set(objectives.map((o) => o.id));
  const kpis = s.kpis.filter((k) => objectiveIds.has(k.objectiveId));
  // Only the active plan's activities: a draft plan being brought in (onboarding) is checked separately, before confirmation.
  const kpiIds = new Set(kpis.map((k) => k.id));
  const activities = s.activities.filter((a) => a.financialYear === fy && a.status !== 'archived' && kpiIds.has(a.kpiId));

  for (const l of linesOfVersion(s, fy)) {
    if (!l.activityId) push('budgetLineNoActivity', { type: 'BudgetLine', id: l.id }, en.findings.budgetLineNoActivity(terms, l.description), [accountablePositionOfUnit(s, l.holderUnitId)]);
  }
  for (const a of activities) {
    if (a.decisionLevel === null) push('activityNo6P', { type: 'Activity', id: a.id }, en.findings.activityNo6P(terms, a.code, a.title), [a.ownerPositionId ?? objectiveOfActivity(s, a)?.ownerPositionId]);
  }
  for (const k of kpis) {
    const o = objectiveOfKpi(s, k);
    const t = s.kpiTargets.find((x) => x.kpiId === k.id && x.financialYear === fy);
    const kb = kpiBaseline(s, k); // D11d-6
    if (t && kb !== null && k.direction !== 'milestone') {
      const wrong = k.direction === 'lower_is_better' ? t.target >= kb : t.target <= kb;
      if (wrong) push('kpiTargetInvalid', { type: 'Kpi', id: k.id }, en.findings.kpiTargetInvalid(terms, k.code, k.name), [k.ownerPositionId ?? o?.ownerPositionId]);
    }
    if (!k.ownerPositionId) push('kpiNoOwner', { type: 'Kpi', id: k.id }, en.findings.kpiNoOwner(terms, k.code, k.name), [o?.ownerPositionId]);
    if (k.baselineMeasureId) {
      const m = s.baselineMeasures.find((b) => b.id === k.baselineMeasureId);
      if (!m || !m.validated) push('kpiBaselineNotValidated', { type: 'Kpi', id: k.id }, en.findings.kpiBaselineNotValidated(terms, k.code, k.name), [k.ownerPositionId ?? o?.ownerPositionId]);
    }
  }
  const funded = fundedActivityIds(s, fy);
  for (const g of goals) {
    if (!activitiesOfGoal(s, g.id, fy).some((a) => funded.has(a.id))) push('goalNoFundedActivity', { type: 'Goal', id: g.id }, en.findings.goalNoFundedActivity(terms, g.code, g.title), [g.ownerPositionId]);
    if (g.fourQEntryIds.length === 0) push('goalNoWhy', { type: 'Goal', id: g.id }, en.findings.goalNoWhy(terms, g.code, g.title), [g.ownerPositionId]);
    const env = s.resourceEnvelopes.find((e) => e.goalId === g.id && e.financialYear === fy);
    if (env) {
      const cost = linesOfVersion(s, fy)
        .filter((l) => l.activityId && activitiesOfGoal(s, g.id, fy).some((a) => a.id === l.activityId))
        .reduce((sum, l) => sum + l.amount.amountMinor, 0);
      if (cost > env.amount.amountMinor) push('envelopeExceeded', { type: 'Goal', id: g.id }, en.findings.envelopeExceeded(terms, g.code, g.title), [g.ownerPositionId]);
    }
  }
  for (const o of objectives) {
    if (!kpis.some((k) => k.objectiveId === o.id)) push('objectiveNoKpi', { type: 'Objective', id: o.id }, en.findings.objectiveNoKpi(terms, o.code, o.title), [o.ownerPositionId]);
  }
  // The plan-size guide (v1.20): only when HR has set a number.
  const guide = s.organisation.settings.planSizeGuide;
  if (guide?.kpisPerObjective != null) {
    for (const o of objectives) {
      const n = kpis.filter((k) => k.objectiveId === o.id).length;
      if (n > guide.kpisPerObjective) push('objectiveManyKpis', { type: 'Objective', id: o.id }, en.findings.objectiveManyKpis(terms, o.code, o.title, n, guide.kpisPerObjective), [o.ownerPositionId]);
    }
  }
  if (guide?.activitiesPerKpi != null) {
    for (const k of kpis) {
      const n = activities.filter((a) => a.kpiId === k.id).length;
      if (n > guide.activitiesPerKpi) push('kpiManyActivities', { type: 'Kpi', id: k.id }, en.findings.kpiManyActivities(terms, k.code, k.name, n, guide.activitiesPerKpi), [k.ownerPositionId ?? objectiveOfKpi(s, k)?.ownerPositionId]);
    }
  }
  for (const df of s.deficiencies) {
    if (objectiveIds.has(df.objectiveId) && df.correctiveActivityIds.length === 0) {
      push('deficiencyUnaddressed', { type: 'Deficiency', id: df.id }, en.findings.deficiencyUnaddressed(terms, df.description), [s.objectives.find((o) => o.id === df.objectiveId)?.ownerPositionId]);
    }
  }
  for (const co of s.contractObjectives) {
    const c = s.contracts.find((x) => x.id === co.contractId);
    const a = s.activities.find((x) => x.id === co.sourceActivityId);
    if (!c || !a || !co.snapshot || c.financialYear !== fy) continue;
    if (activityFingerprint(a) !== co.snapshot.sourceFingerprint) {
      const supervisor = s.positions.find((p) => p.id === c.positionId)?.reportsToPositionId;
      push('contractUpstreamChanged', { type: 'ContractObjective', id: co.id }, en.findings.contractUpstreamChanged(terms, co.title), [c.positionId, supervisor]);
    }
    // v0.27.0 (IC-6): the commitment stays as signed; its holder and supervisor decide what to do about it.
    if (a.status === 'archived' && c.status !== 'closed' && kpiIds.has(a.kpiId)) {
      const supervisor = s.positions.find((p) => p.id === c.positionId)?.reportsToPositionId;
      push('commitmentActivityStopped', { type: 'ContractObjective', id: co.id }, en.findings.commitmentActivityStopped(terms, co.title), [c.positionId, supervisor]);
    }
  }
  // v0.27.0 (IC-7): a target lowered below what signed contracts carry goes to the objective's owner.
  for (const a of activities) {
    if (a.quantityTarget && a.quantityTarget.value < signedQuantity(s, a.id, fy)) {
      push('activityTargetBelowSigned', { type: 'Activity', id: a.id }, en.findings.activityTargetBelowSigned(terms, a.code, a.title), [objectiveOfActivity(s, a)?.ownerPositionId]);
    }
  }
  // v0.27.0 (IC-6): a line still linked to a stopped activity goes to its budget holder and Finance.
  const finance = s.memberships
    .filter((m) => m.status === 'active' && m.roles.includes('finance'))
    .flatMap((m) => s.assignments.filter((x) => x.personId === m.personId && x.to === null).map((x) => x.positionId as string));
  for (const l of linesOfVersion(s, fy)) {
    const a = l.activityId ? s.activities.find((x) => x.id === l.activityId) : undefined;
    if (a && a.status === 'archived') push('budgetLineActivityStopped', { type: 'BudgetLine', id: l.id }, en.findings.budgetLineActivityStopped(terms, l.description, a.code), [accountablePositionOfUnit(s, l.holderUnitId), ...finance]);
  }
  return out;
}

export const isBlocking = (f: Finding): boolean => f.blocksAt.length > 0;

/** Findings that would stop a given gate right now. Hard blocks cannot be overridden or acknowledged. */
export const blockersAt = (findings: Finding[], gate: GateCode): Finding[] => findings.filter((f) => f.blocksAt.includes(gate));

