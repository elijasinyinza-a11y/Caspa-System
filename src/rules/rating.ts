/**
 * Performance ratings, R1–R10 (approved rating scheme, contract v1.3). Pure: no React, no I/O, "now" is passed in.
 * Scores are computed live and shown as provisional until a review's final result is frozen at appraisal.close.
 * Nothing here is stored. Achievement and overall scores are never rounded here; only the label rounds (half up).
 */
import {
  RATING_PRESETS, type ContractObjective, type ISODate, type PerformanceContract, type RatingScheme, type Review,
} from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';

export type Score = 1 | 2 | 3 | 4 | 5;
export type Bands = RatingScheme['bands'];

/** The organisation's scheme (R1). Without a stored scheme the default applies: preset A, safeguards at their defaults. */
export const schemeOf = (s: Store): Pick<RatingScheme, 'preset' | 'bands' | 'competencySection' | 'floorRule' | 'highAchievementFlagAt'> =>
  s.ratingSchemes.find((r) => r.id === s.organisation.settings.ratingSchemeId) ?? {
    preset: 'A', bands: RATING_PRESETS.A, competencySection: { enabled: false, weightPct: 0 }, floorRule: false, highAchievementFlagAt: 1.5,
  };

/** R2: the band for an achievement share. Lower bounds are inclusive and compared unrounded (1.046 under preset A is 3). */
export function bandFor(achievement: number, bands: Bands): Score {
  const ordered = [...bands].sort((a, b) => (b.minAchievement ?? -Infinity) - (a.minAchievement ?? -Infinity));
  const hit = ordered.find((b) => b.minAchievement === null || achievement >= b.minAchievement);
  return (hit ?? ordered[ordered.length - 1]!).score;
}

const last = <T>(xs: T[]): T | undefined => xs[xs.length - 1];
const halfUp = (x: number) => Math.floor(x + 0.5);
const clampScore = (n: number): Score => Math.min(5, Math.max(1, n)) as Score;

/** R3: the label of an overall score comes from rounding half up (3.50 is 4, 3.49 is 3). The score itself is not rounded. */
export const labelScore = (overall: number): Score => clampScore(halfUp(overall));
export const labelOf = (score: Score, bands: Bands): string => bands.find((b) => b.score === score)?.label ?? '';

export type ObjectiveBasis =
  | 'verified' // scored from verified progress
  | 'not_verified' // no verified progress yet: not scored, never treated as zero
  | 'no_quantity' // no personal quantity target, so no achievement can be computed
  | 'not_assessable' // R9: marked not assessable with HR approval; left out of the overall
  | 'direction_unconfirmed'; // lower-is-better contract objectives: achievement rule not yet confirmed

export interface ObjectiveRating {
  contractObjectiveId: string;
  weightPct: number;
  target: number | null;
  done: number | null;
  /** Verified quantity as a share of the personal target. Unrounded; may exceed 1 (R2). */
  achievement: number | null;
  basis: ObjectiveBasis;
  /** Score from the band, before any adjustment. */
  bandScore: Score | null;
  /** R7: one-band supervisor adjustment, with its reason. */
  adjustment: { delta: -1 | 1; reason: string } | null;
  score: Score | null;
}

export type RatingFlagKind = 'objective_scored_one' | 'high_achievement';
/** Over-achievement safeguards: advisory flags to the next-level reviewer. They never change a score. */
export interface RatingFlag {
  kind: RatingFlagKind;
  contractObjectiveId: string;
  achievement: number | null;
  routeToPositionIds: string[];
}

export interface ContractRating {
  contractId: string;
  objectives: ObjectiveRating[];
  /** Weighted mean of objective scores (R3/R4), with competencies if the scheme enables them (R5). Null when nothing is scored. */
  overall: number | null;
  labelScore: Score | null;
  label: string | null;
  /** True until a final result is frozen at appraisal.close (R9). */
  provisional: boolean;
  /** Share of the contract's weight that is scored, so a partial basis is never presented as the whole. */
  scoredWeightPct: number;
  totalWeightPct: number;
  floorApplied: boolean;
  flags: RatingFlag[];
}

export interface RatingContext {
  now: ISODate;
}

/** The latest verified update on or before "now". Unverified updates never count (R6). */
export const verifiedDone = (s: Store, co: ContractObjective, now: ISODate): number | null => {
  const latest = s.progressUpdates
    .filter((u) => u.contractObjectiveId === co.id && u.verified !== null && u.periodEnd <= now)
    .sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0));
  return last(latest)?.quantityDone ?? null;
};

/** The review that applies now: an open one first, otherwise the latest completed. */
export const currentReview = (s: Store, contractId: string): Review | undefined => {
  const reviews = s.reviews.filter((r) => r.contractId === contractId);
  return reviews.find((r) => r.status !== 'completed') ?? last(reviews);
};

/** The next-level reviewer's position: the supervisor's supervisor. */
export const nextLevelPositionOf = (s: Store, c: PerformanceContract): string | null => {
  const sup = s.positions.find((p) => p.id === c.positionId)?.reportsToPositionId ?? null;
  return sup ? (s.positions.find((p) => p.id === sup)?.reportsToPositionId ?? null) : null;
};

export function rateObjective(s: Store, co: ContractObjective, review: Review | undefined, ctx: RatingContext, bands: Bands): ObjectiveRating {
  const target = (co.snapshot?.quantityTarget ?? co.quantityTarget)?.value ?? null;
  const done = verifiedDone(s, co, ctx.now);
  const base = { contractObjectiveId: co.id, weightPct: co.weightPct, target, done, achievement: null, bandScore: null, adjustment: null, score: null };
  if (review?.notAssessable.some((n) => n.contractObjectiveId === co.id && n.hrApproval !== null)) return { ...base, basis: 'not_assessable' };
  if (co.direction === 'lower_is_better') return { ...base, basis: 'direction_unconfirmed' };
  if (target === null || target <= 0) return { ...base, basis: 'no_quantity' };
  if (done === null) return { ...base, basis: 'not_verified' };
  const achievement = done / target;
  const bandScore = bandFor(achievement, bands);
  // R7: the latest adjustment with a written reason; one band only, kept within the scale.
  const adj = last(review?.adjustments.filter((a) => a.contractObjectiveId === co.id && a.reason.trim() !== '') ?? []);
  const adjustment = adj ? { delta: adj.bandDelta, reason: adj.reason } : null;
  return { ...base, achievement, basis: 'verified', bandScore, adjustment, score: clampScore(bandScore + (adjustment?.delta ?? 0)) };
}

export function rateContract(s: Store, contractId: string, ctx: RatingContext): ContractRating | null {
  const c = s.contracts.find((x) => x.id === contractId);
  if (!c) return null;
  const scheme = schemeOf(s);
  const review = currentReview(s, c.id);
  const objectives = s.contractObjectives.filter((co) => co.contractId === c.id).map((co) => rateObjective(s, co, review, ctx, scheme.bands));
  const counted = objectives.filter((o) => o.basis !== 'not_assessable');
  const scored = counted.filter((o): o is ObjectiveRating & { score: Score } => o.score !== null);
  const scoredWeight = scored.reduce((n, o) => n + o.weightPct, 0);

  let overall: number | null = scoredWeight > 0 ? scored.reduce((n, o) => n + o.weightPct * o.score, 0) / scoredWeight : null;
  // R5: competencies, if the organisation's scheme enables them.
  const comp = review?.competencyRatings ?? [];
  if (overall !== null && scheme.competencySection.enabled && comp.length > 0) {
    const w = scheme.competencySection.weightPct / 100;
    overall = (1 - w) * overall + w * (comp.reduce((n, r) => n + r.score, 0) / comp.length);
  }
  // Floor rule, off by default: any objective scored 1 caps the overall at 3.
  const floorApplied = overall !== null && scheme.floorRule && scored.some((o) => o.score === 1) && overall > 3;
  if (floorApplied) overall = 3;

  const reviewer = nextLevelPositionOf(s, c);
  const route = reviewer ? [reviewer] : [];
  const flags: RatingFlag[] = [];
  for (const o of scored) {
    if (o.score === 1) flags.push({ kind: 'objective_scored_one', contractObjectiveId: o.contractObjectiveId, achievement: o.achievement, routeToPositionIds: route });
    if (o.achievement !== null && o.achievement > scheme.highAchievementFlagAt) {
      flags.push({ kind: 'high_achievement', contractObjectiveId: o.contractObjectiveId, achievement: o.achievement, routeToPositionIds: route });
    }
  }

  // R9: a frozen final result wins over the live computation.
  const final = review?.finalResult ?? null;
  if (final) overall = final.overallScore;
  const ls = overall === null ? null : labelScore(overall);
  return {
    contractId: c.id,
    objectives,
    overall,
    labelScore: ls,
    label: final ? final.label : ls === null ? null : labelOf(ls, scheme.bands),
    provisional: final === null,
    scoredWeightPct: scoredWeight,
    totalWeightPct: counted.reduce((n, o) => n + o.weightPct, 0),
    floorApplied,
    flags,
  };
}
