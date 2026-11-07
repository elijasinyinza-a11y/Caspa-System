/**
 * Performance ratings, R1–R10 (approved rating scheme, contract v1.3). Pure: no React, no I/O, "now" is passed in.
 * Scores are computed live and shown as provisional until a review's final result is frozen at appraisal.close.
 * Nothing here is stored. Achievement and overall scores are never rounded here; only the label rounds (half up).
 */
import { objectiveBasis } from './targets';
import {
  RATING_PRESETS, type ContractObjective, type ISODate, type PerformanceContract, type RatingScheme, type Review,
} from '../contract/caspa-data-contract';
import { latestVerified } from './progress';
import type { Store } from '../data/access/store';

export type Score = 1 | 2 | 3 | 4 | 5;
export type Bands = RatingScheme['bands'];

export type SchemeView = Pick<RatingScheme, 'preset' | 'bands' | 'competencySection' | 'floorRule' | 'highAchievementFlagAt' | 'scoringMethod' | 'achievementCap' | 'countersignAll' | 'flagScoredOne'> & { id?: RatingScheme['id'] };
const DEFAULT_SCHEME: SchemeView = { preset: 'A', bands: RATING_PRESETS.A, competencySection: { enabled: false, weightPct: 0 }, floorRule: false, highAchievementFlagAt: 1.5 };

/** The organisation's scheme in force (R1). Without a stored scheme the default applies: preset A, safeguards at their defaults. */
export const schemeOf = (s: Store): SchemeView => s.ratingSchemes.find((r) => r.id === s.organisation.settings.ratingSchemeId) ?? DEFAULT_SCHEME;

/** v1.15: a policy counts as approved when it predates approvals (no record) or the Executive approved it. */
export const isApproved = (r: RatingScheme): boolean => !r.approval || r.approval.status === 'approved';

/**
 * v1.15: the policy a contract is scored under. A signed contract keeps the one it was signed under; otherwise the
 * latest approved policy that applies to its financial year, then the one in force.
 */
export function schemeFor(s: Store, c: PerformanceContract): SchemeView {
  const fixed = c.ratingSchemeId ? s.ratingSchemes.find((r) => r.id === c.ratingSchemeId) : undefined;
  if (fixed) return fixed;
  const forYear = s.ratingSchemes
    .filter((r) => isApproved(r) && r.appliesFromYear != null && r.appliesFromYear <= c.financialYear)
    .sort((a, b) => (b.appliesFromYear ?? 0) - (a.appliesFromYear ?? 0))[0];
  return forYear ?? schemeOf(s);
}

export const methodOf = (sc: SchemeView): 'bands' | 'weighted_points' => sc.scoringMethod ?? 'bands';

const pad = (n: number) => String(n).padStart(2, '0');
/** The last day of a review's period: a quarter's own end, the half-year for mid-year, else the year's end. */
export function reviewPeriodEnd(s: Store, r: Review, c: PerformanceContract): ISODate {
  if (r.periodEnd) return r.periodEnd;
  const m0 = s.organisation.financialYearStartMonth; // 1–12
  const months = r.kind === 'mid_year' ? 6 : 12;
  const endMonthIndex = m0 - 1 + months; // months after January of the start year, exclusive
  const y = c.financialYear + Math.floor(endMonthIndex / 12);
  const m = endMonthIndex % 12; // 0-based month that starts the next period
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ey = m === 0 ? y - 1 : y;
  const em = m === 0 ? 12 : m;
  return `${ey}-${pad(em)}-${pad(lastDay)}` as ISODate;
}

/** A5: the target for the review's period, where one is stored; otherwise null (the full-year target applies). */
export function periodTargetFor(co: ContractObjective, periodEnd: ISODate | null): number | null {
  if (!periodEnd || !co.periodTargets?.length) return null;
  return co.periodTargets.find((p) => p.periodEnd === periodEnd)?.value ?? null;
}

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
  /** Verified quantity as a share of the personal target. Unrounded; may exceed 1 (R2). Always shown as measured. */
  achievement: number | null;
  /** v1.15: achievement as counted, after the policy's limit; equals achievement when there is no limit. */
  counted: number | null;
  /** v1.15: weighted points (weight × counted), under the weighted-points method. */
  points: number | null;
  /** v1.15: the full-year target, shown beside a period target. */
  fullYearTarget: number | null;
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
  /**
   * Bands: the weighted mean of objective scores out of 5 (R3/R4), blended with attributes (R5).
   * Weighted points (v1.15): the overall result as a percentage (98.8 = 98.8%). Null when nothing is scored.
   */
  overall: number | null;
  /** v1.15: which method produced it. */
  method: 'bands' | 'weighted_points';
  /** v1.15: the overall as a percentage: bands ÷ 5, or the points result itself. */
  percent: number | null;
  /** v1.15: the parts, for the calculation on the printout. Targets: score out of 5 (bands) or percent (points). */
  targetsPart: number | null;
  attributes: { enabled: boolean; weightPct: number; sum: number; max: number; percent: number | null; complete: boolean };
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
export const verifiedDone = (s: Store, co: ContractObjective, now: ISODate): number | null =>
  latestVerified(s.progressUpdates, co.id, now)?.quantityDone ?? null; // v0.18.0: a verified correction supersedes (OP-4)

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

export function rateObjective(s: Store, co: ContractObjective, review: Review | undefined, ctx: RatingContext, bands: Bands, opts: { cap?: number | null; periodEnd?: ISODate | null; method?: 'bands' | 'weighted_points' } = {}): ObjectiveRating {
  // v0.21.0 (TG-5): a share, a breakdown's combined figure, a standing duty or an activity, each from verified figures.
  const basis = objectiveBasis(s, co, ctx.now, () => verifiedDone(s, co, ctx.now));
  const fullYearTarget = basis.target;
  // v1.15 (A5): a stored period target replaces the full-year target for that review's period.
  const own = !co.sourceShareId && !co.sourceBreakdownId;
  const pt = own ? periodTargetFor(co, opts.periodEnd ?? null) : null;
  const target = pt ?? fullYearTarget;
  const done = basis.done;
  const base = { contractObjectiveId: co.id, weightPct: co.weightPct, target, done, achievement: null, counted: null, points: null, fullYearTarget, bandScore: null, adjustment: null, score: null };
  if (review?.notAssessable.some((n) => n.contractObjectiveId === co.id && n.hrApproval !== null)) return { ...base, basis: 'not_assessable' };
  if (target === null || target <= 0) return { ...base, basis: 'no_quantity' };
  if (done === null) return { ...base, basis: 'not_verified' };
  // RV-1 (Elijah, 5 November 2026): where lower is better, achievement is target ÷ verified figure, so 16 recorded
  // against at most 20 is 125%; a verified figure of 0 scores the top band.
  const achievement = basis.lower ? (done === 0 ? Number.POSITIVE_INFINITY : target / done) : done / target;
  // v1.15: the limit applies to what counts, never to what is shown.
  const counted = opts.cap == null ? achievement : Math.min(achievement, opts.cap);
  if (opts.method === 'weighted_points') {
    // Points have no per-objective band; the band of the counted share is kept only for the reviewer's flags.
    const finite = Number.isFinite(counted) ? counted : (opts.cap ?? 1);
    return { ...base, achievement, counted, points: (co.weightPct * finite), basis: 'verified', bandScore: bandFor(counted, bands), adjustment: null, score: null };
  }
  const bandScore = bandFor(counted, bands);
  // R7: the latest adjustment with a written reason; one band only, kept within the scale.
  const adj = last(review?.adjustments.filter((a) => a.contractObjectiveId === co.id && a.reason.trim() !== '') ?? []);
  const adjustment = adj ? { delta: adj.bandDelta, reason: adj.reason } : null;
  return { ...base, achievement, counted, basis: 'verified', bandScore, adjustment, score: clampScore(bandScore + (adjustment?.delta ?? 0)) };
}

export function rateContract(s: Store, contractId: string, ctx: RatingContext): ContractRating | null {
  const c = s.contracts.find((x) => x.id === contractId);
  if (!c) return null;
  const scheme = schemeFor(s, c);
  const method = methodOf(scheme);
  const review = currentReview(s, c.id);
  const periodEnd = review ? reviewPeriodEnd(s, review, c) : null;
  const opts = { cap: scheme.achievementCap ?? null, periodEnd, method };
  const objectives = s.contractObjectives.filter((co) => co.contractId === c.id).map((co) => rateObjective(s, co, review, ctx, scheme.bands, opts));
  const counted = objectives.filter((o) => o.basis !== 'not_assessable');
  const scored = counted.filter((o) => o.basis === 'verified');
  const scoredWeight = scored.reduce((n, o) => n + o.weightPct, 0);

  // R5 / B: personal attributes. Each counts equally; the supervisor's scores count, never the self-scores.
  const cs = scheme.competencySection;
  const defined = cs.attributes ?? [];
  const comp = review?.competencyRatings ?? [];
  // v1.15: an attribute counts once the supervisor has scored it, which always carries their comment; a self-score alone never counts.
  const attrScores = defined.length ? defined.map((a) => comp.find((r) => r.attributeId === a.id && r.justification.trim() !== '')?.score ?? null) : comp.map((r) => r.score);
  const given = attrScores.filter((x): x is Score => x !== null);
  const attrOn = cs.enabled && (defined.length > 0 || comp.length > 0);
  const attrMax = 5 * (defined.length || comp.length);
  const attrSum = given.reduce((n, x) => n + x, 0);
  const attrPct = attrOn && given.length ? (attrSum / (5 * given.length)) * 100 : null;
  const w = attrOn && given.length ? cs.weightPct / 100 : 0;

  let overall: number | null = null;
  let targetsPart: number | null = null;
  let floorApplied = false;
  if (method === 'weighted_points') {
    // v1.15: points earned as a share of the weight scored, then blended with attributes.
    targetsPart = scoredWeight > 0 ? (scored.reduce((n, o) => n + (o.points ?? 0), 0) / scoredWeight) * 100 : null;
    overall = targetsPart === null ? null : (1 - w) * targetsPart + w * (attrPct ?? 0);
  } else {
    const withScore = scored.filter((o): o is ObjectiveRating & { score: Score } => o.score !== null);
    targetsPart = scoredWeight > 0 ? withScore.reduce((n, o) => n + o.weightPct * o.score, 0) / scoredWeight : null;
    overall = targetsPart;
    if (overall !== null && w > 0) overall = (1 - w) * overall + w * (attrSum / given.length);
    // Floor rule, off by default: any objective scored 1 caps the overall at 3.
    floorApplied = overall !== null && scheme.floorRule && withScore.some((o) => o.score === 1) && overall > 3;
    if (floorApplied) overall = 3;
  }

  const reviewer = nextLevelPositionOf(s, c);
  const route = reviewer ? [reviewer] : [];
  const flags: RatingFlag[] = [];
  for (const o of scored) {
    // Under weighted points an objective has no score; its counted share falling in the lowest band raises the same flag.
    const lowest = method === 'weighted_points' ? o.bandScore === 1 : o.score === 1;
    if (lowest && scheme.flagScoredOne !== false) flags.push({ kind: 'objective_scored_one', contractObjectiveId: o.contractObjectiveId, achievement: o.achievement, routeToPositionIds: route });
    if (o.achievement !== null && o.achievement > scheme.highAchievementFlagAt) {
      flags.push({ kind: 'high_achievement', contractObjectiveId: o.contractObjectiveId, achievement: o.achievement, routeToPositionIds: route });
    }
  }

  // R9: a frozen final result wins over the live computation.
  const final = review?.finalResult ?? null;
  if (final) overall = final.overallScore;
  // Bands: the label rounds the score half up (R3). Points: the level whose lower bound the overall share reaches.
  const ls = overall === null ? null : method === 'weighted_points' ? bandFor(overall / 100, scheme.bands) : labelScore(overall);
  return {
    contractId: c.id,
    objectives,
    overall,
    method,
    percent: overall === null ? null : method === 'weighted_points' ? overall : (overall / 5) * 100,
    targetsPart,
    attributes: { enabled: attrOn, weightPct: attrOn ? cs.weightPct : 0, sum: attrSum, max: attrMax, percent: attrPct, complete: attrOn ? given.length === (defined.length || comp.length) : true },
    labelScore: ls,
    label: final ? final.label : ls === null ? null : labelOf(ls, scheme.bands),
    provisional: final === null,
    scoredWeightPct: scoredWeight,
    totalWeightPct: counted.reduce((n, o) => n + o.weightPct, 0),
    floorApplied,
    flags,
  };
}

/**
 * v0.23.0: a policy's result for given inputs, for the "Try it" calculator on the policy page. The same arithmetic as
 * rateContract (tested to agree), over typed-in achievements rather than stored records; nothing is stored.
 */
export function scoreWith(sc: SchemeView, objectives: { weightPct: number; achievement: number }[], attributeScores: number[]): { method: 'bands' | 'weighted_points'; targetsPart: number | null; attributesPercent: number | null; overall: number | null; percent: number | null; label: string | null; score: Score | null } {
  const method = methodOf(sc);
  const weight = objectives.reduce((n, o) => n + o.weightPct, 0);
  const cnt = (a: number) => (sc.achievementCap == null ? a : Math.min(a, sc.achievementCap));
  const attrOn = sc.competencySection.enabled && attributeScores.length > 0;
  const attrPct = attrOn ? (attributeScores.reduce((n, x) => n + x, 0) / (5 * attributeScores.length)) * 100 : null;
  const w = attrOn ? sc.competencySection.weightPct / 100 : 0;
  if (!weight) return { method, targetsPart: null, attributesPercent: attrPct, overall: null, percent: null, label: null, score: null };
  if (method === 'weighted_points') {
    const t = (objectives.reduce((n, o) => n + o.weightPct * cnt(o.achievement), 0) / weight) * 100;
    const overall = (1 - w) * t + w * (attrPct ?? 0);
    const s = bandFor(overall / 100, sc.bands);
    return { method, targetsPart: t, attributesPercent: attrPct, overall, percent: overall, label: labelOf(s, sc.bands), score: s };
  }
  const t = objectives.reduce((n, o) => n + o.weightPct * bandFor(cnt(o.achievement), sc.bands), 0) / weight;
  const overall = attrOn ? (1 - w) * t + w * (attributeScores.reduce((n, x) => n + x, 0) / attributeScores.length) : t;
  const s = labelScore(overall);
  return { method, targetsPart: t, attributesPercent: attrPct, overall, percent: (overall / 5) * 100, label: labelOf(s, sc.bands), score: s };
}
