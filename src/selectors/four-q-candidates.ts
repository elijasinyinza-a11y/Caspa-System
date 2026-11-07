/**
 * Candidate 4Q cards from the plan in force (v0.24.0; 4Q Enhancement Specification v0.1, Part B; contract v1.16).
 * Pure, over the store, with "now" passed in. CASPA™ says what happened; only people say why, so candidates fill
 * outcome sections (successes, failures) from KPI results and the one factor section from decision-map rows people
 * already wrote. Projection is never suggested. Sentences hold no figures: those are shown live from the record.
 */
import type { FourQCell, ISODate, SixPLevel } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { departments, entriesOf } from '../rules/conception';
import { kpiProgress } from '../rules/kpi-progress';

export const DISMISS_ACTION = 'four_q.dismiss_candidate';
export const RESTORE_ACTION = 'four_q.restore_candidate';

export type CandidateOutcome = 'target_met' | 'target_not_met' | 'on_track' | 'at_risk' | 'behind';
export interface FourQCandidate {
  key: string;
  /** The department sheet it goes to; null when no department owns the record (the Strategy office's list). */
  unitId: string | null;
  cell: FourQCell;
  kind: 'kpi' | 'deficiency';
  kpi?: { id: string; code: string; name: string; financialYear: number; outcome: CandidateOutcome; target: number | null; actual: number | null; progress: number | null; closed: boolean };
  deficiency?: { id: string; objective: string; description: string; level: SixPLevel };
  level: SixPLevel | null;
}

/** The plan in force: the source of results while the next plan is being formed (C1, one at a time). */
export const sourcePlan = (s: Store) => s.plans.find((p) => p.status === 'active') ?? null;

/** The department a position sits in: its unit, or the unit above it that is a department. */
export function departmentOfPosition(s: Store, positionId: string | null | undefined): string | null {
  if (!positionId) return null;
  const deps = new Set(departments(s).map((d) => d.unitId));
  let u = s.units.find((x) => x.id === s.positions.find((p) => p.id === positionId)?.unitId);
  while (u) { if (deps.has(u.id)) return u.id; u = u.parentId ? s.units.find((x) => x.id === u!.parentId) : undefined; }
  return null;
}

/** Dismissed candidate keys for a plan and sheet: the latest dismiss or restore per key wins. */
export function dismissedKeys(s: Store, planId: string, unitId: string | null): Set<string> {
  const out = new Set<string>();
  for (const a of s.auditEntries) {
    if (a.action !== DISMISS_ACTION && a.action !== RESTORE_ACTION) continue;
    const x = a.after as { planId?: string; key?: string; unitId?: string | null } | null;
    if (!x || x.planId !== planId || (x.unitId ?? null) !== unitId || !x.key) continue;
    if (a.action === DISMISS_ACTION) out.add(x.key); else out.delete(x.key);
  }
  return out;
}

const keyOfBasis = (b: NonNullable<import('../contract/caspa-data-contract').FourQEntry['basis']>) => (b.type === 'kpi_year' ? `kpi:${b.kpiId}:${b.financialYear}` : `deficiency:${b.deficiencyId}`);

/** Every candidate for the plan being formed, before dismissals; those already added (by their basis) are left out. */
export function fourQCandidates(s: Store, formingPlanId: string, ctx: { now: ISODate; financialYear: number }): FourQCandidate[] {
  const src = sourcePlan(s);
  if (!src || src.id === formingPlanId) return [];
  const added = new Set(entriesOf(s, formingPlanId).flatMap((e) => (e.basis ? [keyOfBasis(e.basis)] : [])));
  const goalIds = new Set(s.goals.filter((g) => g.planId === src.id).map((g) => g.id as string));
  const objectives = s.objectives.filter((o) => goalIds.has(o.goalId));
  const objIds = new Set(objectives.map((o) => o.id as string));
  const out: FourQCandidate[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = s.organisation.financialYearStartMonth;
  // The last day of a financial year: the day before the next one starts.
  const yearEnd = (fy: number): ISODate => { const d = new Date(Date.UTC(fy + 1, start - 1, 0)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` as ISODate; };

  for (const k of s.kpis.filter((x) => objIds.has(x.objectiveId))) {
    if (k.direction === 'milestone') continue;
    const years = [...new Set(s.kpiTargets.filter((t) => t.kpiId === k.id).map((t) => t.financialYear as number))].filter((fy) => fy <= ctx.financialYear).sort();
    for (const fy of years) {
      const closed = fy < ctx.financialYear;
      const p = kpiProgress(s, k, { financialYear: fy, now: closed ? yearEnd(fy) : ctx.now });
      if (p.status === 'no_data' || p.actual === null) continue;
      // A closed year is judged against its target; the current year against the share of the year elapsed (P10).
      const outcome: CandidateOutcome = closed
        ? (p.status === 'target_met' || (p.progress !== null && p.progress >= 1) ? 'target_met' : 'target_not_met')
        : (p.status === 'target_met' ? 'on_track' : p.status === 'target_not_met' ? 'behind' : (p.status as CandidateOutcome));
      const good = outcome === 'target_met' || outcome === 'on_track';
      const key = `kpi:${k.id}:${fy}`;
      if (added.has(key)) continue;
      out.push({
        key, unitId: departmentOfPosition(s, k.ownerPositionId), kind: 'kpi', level: null,
        cell: { band: closed ? 'retraction' : 'repositioning', column: good ? 'successes' : 'failures' },
        kpi: { id: k.id, code: k.code, name: k.name, financialYear: fy, outcome, target: p.target, actual: p.actual, progress: p.progress, closed },
      });
    }
  }
  for (const d of s.deficiencies.filter((x) => objIds.has(x.objectiveId) && x.correctiveActivityIds.length === 0)) {
    const key = `deficiency:${d.id}`;
    if (added.has(key)) continue;
    const o = objectives.find((x) => x.id === d.objectiveId)!;
    out.push({
      key, unitId: departmentOfPosition(s, o.ownerPositionId), kind: 'deficiency', level: d.level,
      cell: { band: 'repositioning', column: 'failure_factors' },
      deficiency: { id: d.id, objective: `${o.code} ${o.title}`, description: d.description, level: d.level },
    });
  }
  return out;
}
