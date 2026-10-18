/** Pure lookups over the cascade. Links are by ID; objective and goal derive through the KPI. */
import type { Activity, BudgetVersion, Goal, Kpi, Objective } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';

export const kpiOf = (s: Store, a: Activity): Kpi | undefined => s.kpis.find((k) => k.id === a.kpiId);
export const objectiveOfKpi = (s: Store, k: Kpi): Objective | undefined => s.objectives.find((o) => o.id === k.objectiveId);
export const goalOfObjective = (s: Store, o: Objective): Goal | undefined => s.goals.find((g) => g.id === o.goalId);

export const objectiveOfActivity = (s: Store, a: Activity): Objective | undefined => {
  const k = kpiOf(s, a);
  return k && objectiveOfKpi(s, k);
};
export const goalOfActivity = (s: Store, a: Activity): Goal | undefined => {
  const o = objectiveOfActivity(s, a);
  return o && goalOfObjective(s, o);
};

/** The budget version in force for a year: the highest version that is not superseded. */
export const currentBudgetVersion = (s: Store, fy: number): BudgetVersion | undefined => {
  const cycleIds = new Set(s.cycles.filter((c) => c.kind === 'budget' && c.financialYear === fy).map((c) => c.id));
  return s.budgetVersions
    .filter((v) => cycleIds.has(v.cycleId) && v.status !== 'superseded')
    .sort((a, b) => b.version - a.version)[0];
};

export const linesOfVersion = (s: Store, fy: number) => {
  const v = currentBudgetVersion(s, fy);
  return v ? s.budgetLines.filter((l) => l.versionId === v.id) : [];
};

/** Activities with at least one budget line in the year's current budget version. */
export const fundedActivityIds = (s: Store, fy: number): Set<string> =>
  new Set(linesOfVersion(s, fy).flatMap((l) => (l.activityId ? [l.activityId] : [])));

export const activitiesOfGoal = (s: Store, goalId: string, fy: number): Activity[] =>
  s.activities.filter((a) => a.financialYear === fy && a.status !== 'archived' && goalOfActivity(s, a)?.id === goalId);

/** The unit's head positions: those in the unit whose line manager sits outside it. */
export const headsOfUnit = (s: Store, unitId: string): string[] => {
  const inUnit = s.positions.filter((p) => p.unitId === unitId);
  const ids = new Set(inUnit.map((p) => p.id));
  return inUnit.filter((p) => !p.reportsToPositionId || !ids.has(p.reportsToPositionId)).map((p) => p.id);
};
