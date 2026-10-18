/** Figures for the interim Home view. Computed from records every time; nothing stored. Pure. */
import type { Store } from '../data/access/store';
import { activitiesOfGoal, fundedActivityIds } from '../rules/structure';

export interface GoalCoverage {
  goalId: string;
  code: string;
  title: string;
  perspectiveLabel: string | null;
  funded: number;
  total: number;
}

export function fundingCoverage(s: Store, fy: number): GoalCoverage[] {
  const active = new Set(s.plans.filter((p) => p.status === 'active').map((p) => p.id));
  const funded = fundedActivityIds(s, fy);
  return s.goals
    .filter((g) => active.has(g.planId))
    .sort((a, b) => a.code.localeCompare(b.code, 'en-GB', { numeric: true }))
    .map((g) => {
      const acts = activitiesOfGoal(s, g.id, fy);
      return {
        goalId: g.id,
        code: g.code,
        title: g.title,
        perspectiveLabel: s.organisation.perspectives?.find((p) => p.key === g.perspective)?.label ?? null,
        funded: acts.filter((a) => funded.has(a.id)).length,
        total: acts.length,
      };
    });
}

export const activePlanTitle = (s: Store): string | null => s.plans.find((p) => p.status === 'active')?.title ?? null;
