/**
 * Contract drafting rules (v0.22.0; Contracts Specification v0.1, CT-1 to CT-10; contract v1.14). Pure functions: the
 * checks before a contract is issued, dependency flags, and refusing circles. No React, no I/O, no system clock.
 */
import type { Dependency, ISODate } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { latestVerifiedReading, standingDutyShare } from './targets';

export type DraftCheck =
  | { kind: 'weights'; total: number }
  | { kind: 'no_quantity'; contractObjectiveId: string }
  | { kind: 'standing_duties'; pct: number; limit: number }
  | { kind: 'single_limit'; contractObjectiveId: string; pct: number; limit: number }
  | { kind: 'over_activity'; activityId: string; total: number; planned: number }
  | { kind: 'dependency'; dependencyId: string; flags: DependencyFlag[] };
export type DependencyFlag = 'not_carried' | 'late' | 'higher_level';

/** Higher decision levels where a dependency is shown as decided above most positions; a fact, not a judgement (CT, section 3). */
const HIGHER = new Set(['principle', 'policy']);

/** Personal quantities from an activity across the year's contracts (excluding closed earlier versions). */
export function carriedQuantity(s: Store, activityId: string, fy: number): number {
  const live = new Set(s.contracts.filter((c) => c.financialYear === fy && c.status !== 'closed').map((c) => c.id as string));
  return s.contractObjectives.filter((co) => co.sourceActivityId === activityId && live.has(co.contractId)).reduce((a, co) => a + ((co.snapshot?.quantityTarget ?? co.quantityTarget)?.value ?? 0), 0);
}

/** Done: the activity's latest recorded completion reaches its quantity, or it is marked complete; a share: a verified reading meets its target. */
export function dependencyDone(s: Store, d: Dependency, now: ISODate): boolean {
  if ('activityId' in d.on) {
    const a = s.activities.find((x) => x.id === (d.on as { activityId: string }).activityId);
    if (!a) return false;
    if (a.status === 'complete') return true;
    const p = s.activityProgress.filter((x) => x.activityId === a.id && x.periodEnd <= now).sort((x, y) => (x.periodEnd < y.periodEnd ? 1 : -1))[0];
    return !!p && p.quantityDone !== null && !!a.quantityTarget && p.quantityDone >= a.quantityTarget.value;
  }
  const sh = s.kpiShares.find((x) => x.id === (d.on as { shareId: string }).shareId);
  const r = sh && latestVerifiedReading(s, sh.id, now);
  return !!r && !!sh && r.value >= sh.target;
}

export function dependencyFlags(s: Store, d: Dependency, fy: number, now: ISODate): DependencyFlag[] {
  const out: DependencyFlag[] = [];
  if ('activityId' in d.on) {
    const id = (d.on as { activityId: string }).activityId;
    if (carriedQuantity(s, id, fy) === 0) out.push('not_carried');
    const level = s.activities.find((x) => x.id === id)?.decisionLevel;
    if (d.neededBy < now && !dependencyDone(s, d, now)) out.push('late');
    if (level && HIGHER.has(level)) out.push('higher_level');
  } else {
    // v0.25.0: a share with no owner is carried by nobody.
    const sh = s.kpiShares.find((x) => x.id === (d.on as { shareId: string }).shareId);
    if (!sh?.ownerPositionId) out.push('not_carried');
    if (d.neededBy < now && !dependencyDone(s, d, now)) out.push('late');
  }
  return out;
}

/** The checks before issuing (CT-3 must fix; the rest worth checking). */
export function draftChecks(s: Store, contractId: string, now: ISODate): { mustFix: DraftCheck[]; worth: DraftCheck[]; fairness: boolean } {
  const c = s.contracts.find((x) => x.id === contractId)!;
  const cos = s.contractObjectives.filter((co) => co.contractId === contractId);
  const mustFix: DraftCheck[] = [];
  const worth: DraftCheck[] = [];
  const total = cos.reduce((a, co) => a + co.weightPct, 0);
  if (total !== 100) mustFix.push({ kind: 'weights', total });
  for (const co of cos) if (!co.sourceShareId && !co.sourceBreakdownId && !((co.quantityTarget?.value ?? 0) > 0)) mustFix.push({ kind: 'no_quantity', contractObjectiveId: co.id });
  const duty = standingDutyShare(s, contractId);
  if (duty.over) mustFix.push({ kind: 'standing_duties', pct: duty.pct, limit: duty.limit });
  const single = s.organisation.settings.singleObjectiveLimitPct;
  if (single !== null) for (const co of cos) if (co.weightPct > single) mustFix.push({ kind: 'single_limit', contractObjectiveId: co.id, pct: co.weightPct, limit: single });
  for (const id of [...new Set(cos.map((co) => co.sourceActivityId).filter((x): x is NonNullable<typeof x> => !!x))]) {
    const a = s.activities.find((x) => x.id === id);
    const planned = carriedQuantity(s, id, c.financialYear);
    if (a?.quantityTarget && planned > a.quantityTarget.value) worth.push({ kind: 'over_activity', activityId: id, total: a.quantityTarget.value, planned });
  }
  const coIds = new Set(cos.map((co) => co.id as string));
  for (const d of s.dependencies.filter((x) => 'contractObjectiveId' in x.from && coIds.has((x.from as { contractObjectiveId: string }).contractObjectiveId))) {
    const flags = dependencyFlags(s, d, c.financialYear, now);
    if (flags.length) worth.push({ kind: 'dependency', dependencyId: d.id, flags });
  }
  return { mustFix, worth, fairness: worth.some((w) => w.kind === 'dependency') };
}

/** A new link would close a circle: the work depended on itself depends (directly or further down) on the dependent's work. */
export function makesCircle(s: Store, fromActivityOrShare: string, onActivityOrShare: string): boolean {
  if (fromActivityOrShare === onActivityOrShare) return true;
  const key = (x: Dependency['from'] | Dependency['on']) => ('activityId' in x ? x.activityId : 'shareId' in x ? x.shareId : (s.contractObjectives.find((co) => co.id === (x as { contractObjectiveId: string }).contractObjectiveId)?.sourceActivityId ?? ''));
  const seen = new Set<string>();
  const walk = (n: string): boolean => {
    if (n === fromActivityOrShare) return true;
    if (seen.has(n)) return false;
    seen.add(n);
    return s.dependencies.filter((d) => key(d.from) === n).some((d) => walk(key(d.on) as string));
  };
  return walk(onActivityOrShare);
}
