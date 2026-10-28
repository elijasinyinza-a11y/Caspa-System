/**
 * The consolidated budget by goal (Build Brief, screen 5). Pure: computed from stored records on every call.
 * Permissions come in from the data-access layer. A subtotal or total is given only when every line it
 * covers is visible to the viewer, so a partial sum is never shown as the whole; whenever the total is
 * given, the goal subtotals and the "not linked" subtotal sum to it.
 */
import type { Activity, BudgetVersion, Money } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { currentBudgetVersion, fundedActivityIds, goalOfActivity, linesOfVersion, objectiveOfActivity } from '../rules/structure';
import { refActivity, refGoal, refObjective, type NodeRef } from './node';

export interface BudgetLineRow {
  id: string;
  description: string;
  amount: Money;
  costCategory: string;
  fundingSource: string;
  holderUnit: string;
  activity: NodeRef | null;
}

export interface BudgetObjectiveGroup {
  ref: NodeRef;
  lines: BudgetLineRow[];
  hiddenLines: number;
  subtotal: Money | null;
}

export interface BudgetGoalGroup {
  ref: NodeRef;
  /** Activities under the goal this year, and how many have a line. Visible to everyone. */
  activities: number;
  funded: number;
  lineCount: number;
  hiddenLines: number;
  subtotal: Money | null;
  /** Share of the total, only when both are known. */
  share: number | null;
  objectives: BudgetObjectiveGroup[];
}

export interface BudgetView {
  version: Pick<BudgetVersion, 'id' | 'version' | 'status'> | null;
  goals: BudgetGoalGroup[];
  /** Lines with no activity, or whose activity does not trace to a goal of the active plan. */
  unlinked: { lines: BudgetLineRow[]; lineCount: number; hiddenLines: number; subtotal: Money | null; share: number | null };
  lineCount: number;
  hiddenLines: number;
  total: Money | null;
}

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'en-GB', { numeric: true });

export function budgetView(s: Store, fy: number, canView: (subject: { type: string; id: string }) => boolean): BudgetView {
  const v = currentBudgetVersion(s, fy);
  const currency = s.organisation.baseCurrency;
  const lines = linesOfVersion(s, fy);
  const visible = (l: (typeof lines)[number]) => canView({ type: 'BudgetLine', id: l.id });
  const sum = (ls: typeof lines): Money => ({ amountMinor: ls.reduce((n, l) => n + l.amount.amountMinor, 0), currency });
  const sumIfAll = (ls: typeof lines): Money | null => (ls.every(visible) ? sum(ls) : null);
  const unitName = (id: string) => s.units.find((u) => u.id === id)?.name ?? id;
  const activityOf = (l: (typeof lines)[number]): Activity | undefined => (l.activityId ? s.activities.find((a) => a.id === l.activityId) : undefined);
  const row = (l: (typeof lines)[number]): BudgetLineRow => {
    const a = activityOf(l);
    return {
      id: l.id, description: l.description, amount: l.amount, costCategory: l.costCategory, fundingSource: l.fundingSource,
      holderUnit: unitName(l.holderUnitId), activity: a ? refActivity(a) : null,
    };
  };

  const activePlans = new Set(s.plans.filter((p) => p.status === 'active').map((p) => p.id));
  const goals = s.goals.filter((g) => activePlans.has(g.planId)).sort(byCode);
  const goalIds = new Set(goals.map((g) => g.id));
  const goalOfLine = (l: (typeof lines)[number]) => {
    const a = activityOf(l);
    const g = a && goalOfActivity(s, a);
    return g && goalIds.has(g.id) ? g : undefined;
  };
  const total = sumIfAll(lines);
  const shareOf = (m: Money | null) => (m && total && total.amountMinor > 0 ? m.amountMinor / total.amountMinor : null);
  const funded = fundedActivityIds(s, fy);

  const goalGroups: BudgetGoalGroup[] = goals.map((g) => {
    const gl = lines.filter((l) => goalOfLine(l)?.id === g.id);
    const acts = s.activities.filter((a) => a.financialYear === fy && a.status !== 'archived' && goalOfActivity(s, a)?.id === g.id);
    const objectives = s.objectives
      .filter((o) => o.goalId === g.id)
      .sort(byCode)
      .map((o) => {
        const ol = gl.filter((l) => {
          const a = activityOf(l);
          return a && objectiveOfActivity(s, a)?.id === o.id;
        });
        return { ref: refObjective(o), lines: ol.filter(visible).map(row), hiddenLines: ol.filter((l) => !visible(l)).length, subtotal: sumIfAll(ol) };
      })
      .filter((o) => o.lines.length + o.hiddenLines > 0);
    const subtotal = sumIfAll(gl);
    return {
      ref: refGoal(g), activities: acts.length, funded: acts.filter((a) => funded.has(a.id)).length,
      lineCount: gl.length, hiddenLines: gl.filter((l) => !visible(l)).length, subtotal, share: shareOf(subtotal), objectives,
    };
  });

  const ul = lines.filter((l) => !goalOfLine(l));
  const unlinkedSubtotal = sumIfAll(ul);
  return {
    version: v ? { id: v.id, version: v.version, status: v.status } : null,
    goals: goalGroups,
    unlinked: { lines: ul.filter(visible).map(row), lineCount: ul.length, hiddenLines: ul.filter((l) => !visible(l)).length, subtotal: unlinkedSubtotal, share: shareOf(unlinkedSubtotal) },
    lineCount: lines.length,
    hiddenLines: lines.filter((l) => !visible(l)).length,
    total,
  };
}

/** One activity a line can be linked to, with its path through the cascade. */
export interface LinkOption {
  ref: NodeRef;
  path: string; // e.g. "G1 › O1.1 › K1.1.1"
  /** Owned within the line's holder unit or a unit below it: listed first. Deterministic; no AI. */
  suggested: boolean;
}

const unitAndBelow = (s: Store, unitId: string): Set<string> => {
  const out = new Set<string>([unitId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of s.units) if (u.parentId && out.has(u.parentId) && !out.has(u.id)) { out.add(u.id); grew = true; }
  }
  return out;
};

export function linkOptions(s: Store, fy: number, lineId: string): LinkOption[] {
  const line = s.budgetLines.find((l) => l.id === lineId);
  if (!line) return [];
  const activePlans = new Set(s.plans.filter((p) => p.status === 'active').map((p) => p.id));
  const units = unitAndBelow(s, line.holderUnitId);
  const unitOfPosition = (pid: string | null) => s.positions.find((p) => p.id === pid)?.unitId;
  return s.activities
    .filter((a) => a.financialYear === fy && a.status !== 'archived')
    .flatMap((a) => {
      const g = goalOfActivity(s, a);
      if (!g || !activePlans.has(g.planId)) return [];
      const o = objectiveOfActivity(s, a)!;
      const k = s.kpis.find((x) => x.id === a.kpiId)!;
      const u = unitOfPosition(a.ownerPositionId);
      return [{ ref: refActivity(a), path: `${g.code} › ${o.code} › ${k.code}`, suggested: !!u && units.has(u) }];
    })
    .sort((a, b) => (a.suggested === b.suggested ? byCode(a.ref, b.ref) : a.suggested ? -1 : 1));
}
