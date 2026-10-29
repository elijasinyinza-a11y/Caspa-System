/**
 * Pure rules for the cascade edits slice 6 allows (BUILD-BRIEF section 22): adding a corrective activity from the
 * decision map (D6-1) and changing an activity's 6P level (D6-6). No React, no I/O, no clock.
 */
import type { Activity, Deficiency, ReportingFrequency, SixPLevel } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { objectiveOfActivity } from './structure';

/**
 * The next activity code under a KPI: the lowest unused number after its activities' common stem, e.g.
 * "A1.2.1.5". A KPI with no activities yet takes the organisation's activity prefix and the KPI's numbering, so
 * "IN1.1.1" in an organisation whose activities read "IV…" gives "IV1.1.1.1".
 */
export function nextActivityCode(s: Store, kpiId: string): string {
  const kpi = s.kpis.find((k) => k.id === kpiId);
  if (!kpi) throw new Error(`Unknown KPI ${kpiId}`);
  const siblings = s.activities.filter((a) => a.kpiId === kpiId);
  const first = siblings[0];
  const prefix = s.activities[0]?.code.match(/^[A-Za-z]+/)?.[0] ?? 'A';
  const stem = first ? first.code.slice(0, first.code.lastIndexOf('.')) : `${prefix}${kpi.code.replace(/^[A-Za-z]+/, '')}`;
  const taken = new Set(s.activities.map((a) => a.code));
  let n = 1;
  while (taken.has(`${stem}.${n}`)) n += 1;
  return `${stem}.${n}`;
}

/** The KPIs a corrective activity for this deficiency may sit under: the deficiency's own objective's KPIs. */
export const kpisForDeficiency = (s: Store, df: Deficiency) => s.kpis.filter((k) => k.objectiveId === df.objectiveId).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

/**
 * Activities that may be linked as corrective work: the year's activities under the same objective, not already
 * linked and not archived. Those at the deficiency's level come first, then code order. Deterministic; no AI.
 */
export function correctiveOptions(s: Store, df: Deficiency, fy: number): Activity[] {
  const level = (a: Activity) => (a.decisionLevel === df.level ? 0 : 1);
  return s.activities
    .filter((a) => a.financialYear === fy && a.status !== 'archived' && !df.correctiveActivityIds.includes(a.id))
    .filter((a) => objectiveOfActivity(s, a)?.id === df.objectiveId)
    .sort((a, b) => level(a) - level(b) || a.code.localeCompare(b.code, 'en', { numeric: true }));
}

export interface NewActivityDraft {
  kpiId: string;
  title: string;
  level: SixPLevel;
  ownerPositionId: string;
  evidence: string;
  frequency: ReportingFrequency;
  quantity: { value: number; unit: string } | null;
}
export type NewActivityError = 'kpi_not_allowed' | 'title_required' | 'owner_required' | 'evidence_required' | 'quantity_invalid';

/** Why a new corrective activity cannot be added, or null. A level is always set: a new activity never starts with none. */
export function newActivityError(s: Store, df: Deficiency, d: NewActivityDraft): NewActivityError | null {
  if (!kpisForDeficiency(s, df).some((k) => k.id === d.kpiId)) return 'kpi_not_allowed';
  if (!d.title.trim()) return 'title_required';
  if (!s.positions.some((p) => p.id === d.ownerPositionId)) return 'owner_required';
  if (!d.evidence.trim()) return 'evidence_required';
  if (d.quantity && (!(d.quantity.value > 0) || !Number.isInteger(d.quantity.value) || !d.quantity.unit.trim())) return 'quantity_invalid';
  return null;
}

export type LevelChangeError = 'same_level' | 'reason_required' | 'archived';

/** Why an activity's 6P level cannot be changed to `to`, or null (D6-6). There is no way back to no level. */
export function levelChangeError(a: Activity, to: SixPLevel, reason: string): LevelChangeError | null {
  if (a.status === 'archived') return 'archived';
  if (to === a.decisionLevel) return 'same_level';
  if (!reason.trim()) return 'reason_required';
  return null;
}
