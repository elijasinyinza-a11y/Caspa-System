/** Pure lookups over the cascade. Links are by ID; objective and goal derive through the KPI. */
import { SIX_P_SCOPE, type Activity, type BudgetLine, type BudgetVersion, type Goal, type Kpi, type Objective, type SixPLevel } from '../contract/caspa-data-contract';

/** The six 6P levels in the book's order (Principle to Practices), taken from the contract's own scope table. */
export const SIX_P_LEVELS = Object.keys(SIX_P_SCOPE) as SixPLevel[];
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

/** Positions above a position in its single reporting line, nearest first. Guards against loops. */
export const managersOf = (s: Store, positionId: string): string[] => {
  const chain: string[] = [];
  const seen = new Set<string>([positionId]);
  let next = s.positions.find((p) => p.id === positionId)?.reportsToPositionId ?? null;
  while (next && !seen.has(next)) {
    chain.push(next);
    seen.add(next);
    next = s.positions.find((p) => p.id === next)?.reportsToPositionId ?? null;
  }
  return chain;
};

/**
 * The position accountable for a unit (contract v1.2, budget_holder). The single position in the unit
 * that all others report up to; if the unit has several top positions, their lowest common manager;
 * if the unit has no positions, its parent unit's accountable position. Null if none can be derived.
 */
export const accountablePositionOfUnit = (s: Store, unitId: string, depth = 0): string | null => {
  if (depth > s.units.length) return null;
  const inUnit = s.positions.filter((p) => p.unitId === unitId);
  if (inUnit.length === 0) {
    const parent = s.units.find((u) => u.id === unitId)?.parentId;
    return parent ? accountablePositionOfUnit(s, parent, depth + 1) : null;
  }
  const ids = new Set<string>(inUnit.map((p) => p.id));
  const tops = inUnit.filter((p) => !p.reportsToPositionId || !ids.has(p.reportsToPositionId)).map((p) => p.id);
  if (tops.length === 1) return tops[0]!;
  const [first, ...rest] = tops.map((t) => managersOf(s, t));
  return first?.find((m) => rest.every((chain) => chain.includes(m))) ?? null;
};

/** Positions holding a budget line (contract v1.2): accountable position, funded activity owner, and all above them. */
export const budgetHolderPositions = (s: Store, line: BudgetLine): Set<string> => {
  const anchors = [accountablePositionOfUnit(s, line.holderUnitId)];
  if (line.activityId) anchors.push(s.activities.find((a) => a.id === line.activityId)?.ownerPositionId ?? null);
  const out = new Set<string>();
  for (const a of anchors) {
    if (!a) continue;
    out.add(a);
    managersOf(s, a).forEach((m) => out.add(m));
  }
  return out;
};
