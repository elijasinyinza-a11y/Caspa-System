/**
 * Integrity rule catalogue and checker (Build Brief v1.1, section 8).
 * Pure: no React, no I/O, no system clock. Findings are computed, never stored.
 */
import type { Finding, GateCode, Id, IntegrityRule } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { en } from '../strings/en';
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
    if (t && k.baseline !== null && k.direction !== 'milestone') {
      const wrong = k.direction === 'lower_is_better' ? t.target >= k.baseline : t.target <= k.baseline;
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
  }
  return out;
}

export const isBlocking = (f: Finding): boolean => f.blocksAt.length > 0;

/** Findings that would stop a given gate right now. Hard blocks cannot be overridden or acknowledged. */
export const blockersAt = (findings: Finding[], gate: GateCode): Finding[] => findings.filter((f) => f.blocksAt.includes(gate));

