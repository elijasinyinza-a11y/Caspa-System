/**
 * The six-point decision map for one objective (Build Brief, screen 6; BUILD-BRIEF section 22). Pure: every count is
 * computed from stored Deficiency and Activity records on each call. Permissions are decided by the data-access layer,
 * which passes `canView`; without it the view carries the count only (D6-5).
 */
import type { Activity, Deficiency, SixPLevel } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { goalOfObjective, SIX_P_LEVELS } from '../rules/structure';
import type { NodeRef } from './node';

export interface CorrectiveRef {
  ref: NodeRef;
  level: SixPLevel | null;
  owner: string | null;
  status: Activity['status'];
  /** The solution's level, when it differs from the level where the problem occurs. */
  solvedAt: SixPLevel | null;
}

export interface MapRow {
  id: string;
  level: SixPLevel;
  description: string;
  probableCause: string;
  effects: string;
  timeframe: string;
  aiDraft: boolean;
  corrective: CorrectiveRef[];
}

export interface DecisionMapView {
  objective: NodeRef;
  goal: NodeRef;
  owner: string | null;
  /** How many deficiencies are recorded. Shown to everyone. */
  total: number;
  /** False: the viewer may not see deficiencies, so everything below is empty. */
  visible: boolean;
  levelsUsed: number;
  counts: Record<SixPLevel, number>;
  /** Distinct activities across the rows' corrective links. */
  corrective: number;
  unaddressed: number;
  /** Levels with at least one deficiency, in book order. */
  groups: { level: SixPLevel; rows: MapRow[] }[];
  /** Levels with none, in book order: "Nothing recorded at: …". */
  empty: SixPLevel[];
}

const ref = (kind: NodeRef['kind'], r: { id: string; code: string; title: string }): NodeRef => ({ kind, id: r.id, code: r.code, title: r.title });
const zero = (): Record<SixPLevel, number> => Object.fromEntries(SIX_P_LEVELS.map((l) => [l, 0])) as Record<SixPLevel, number>;

/** Rows in the order recorded: created stamp, then id, so the page is stable. */
export const deficienciesOf = (s: Store, objectiveId: string): Deficiency[] =>
  s.deficiencies
    .filter((d) => d.objectiveId === objectiveId)
    .sort((a, b) => Date.parse(a.created.at) - Date.parse(b.created.at) || a.id.localeCompare(b.id, 'en', { numeric: true }));

export function decisionMap(s: Store, objectiveId: string, access: { canView: boolean }): DecisionMapView | null {
  const o = s.objectives.find((x) => x.id === objectiveId);
  const g = o && goalOfObjective(s, o);
  if (!o || !g) return null;
  const title = (pid: string | null) => (pid ? s.positions.find((p) => p.id === pid)?.title ?? null : null);
  const defs = deficienciesOf(s, o.id);
  const base = { objective: ref('objective', o), goal: ref('goal', g), owner: title(o.ownerPositionId), total: defs.length };
  if (!access.canView) return { ...base, visible: false, levelsUsed: 0, counts: zero(), corrective: 0, unaddressed: 0, groups: [], empty: [] };

  const counts = zero();
  defs.forEach((d) => { counts[d.level] += 1; });
  const row = (d: Deficiency): MapRow => ({
    id: d.id, level: d.level, description: d.description, probableCause: d.probableCause, effects: d.effects, timeframe: d.timeframe,
    aiDraft: d.draft.state === 'ai_draft',
    corrective: d.correctiveActivityIds.flatMap((aid) => {
      const a = s.activities.find((x) => x.id === aid);
      return a ? [{
        ref: ref('activity', a), level: a.decisionLevel, owner: title(a.ownerPositionId), status: a.status,
        solvedAt: a.decisionLevel && a.decisionLevel !== d.level ? a.decisionLevel : null,
      }] : [];
    }),
  });
  return {
    ...base,
    visible: true,
    levelsUsed: SIX_P_LEVELS.filter((l) => counts[l] > 0).length,
    counts,
    corrective: new Set(defs.flatMap((d) => d.correctiveActivityIds)).size,
    unaddressed: defs.filter((d) => d.correctiveActivityIds.length === 0).length,
    groups: SIX_P_LEVELS.filter((l) => counts[l] > 0).map((level) => ({ level, rows: defs.filter((d) => d.level === level).map(row) })),
    empty: SIX_P_LEVELS.filter((l) => counts[l] === 0),
  };
}

/** Deficiencies an activity corrects, for "Corrects:" on its record page. */
export const correctedBy = (s: Store, activityId: string): Deficiency[] =>
  s.deficiencies.filter((d) => d.correctiveActivityIds.includes(activityId as Deficiency['correctiveActivityIds'][number]));
