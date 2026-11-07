/**
 * The scoring policy's own checks (v0.23.0; Scoring Policy and Personal Attributes Specification v0.1; contract v1.15).
 * Pure: what must be fixed before HR sends a policy to the Executive. No React, no I/O, no system clock.
 */
import type { RatingScheme } from '../contract/caspa-data-contract';

export type PolicyCheck =
  | { kind: 'level_name'; score: number }
  | { kind: 'thresholds_order' }
  | { kind: 'unreachable'; scores: number[] }
  | { kind: 'attr_weight' }
  | { kind: 'attr_count'; n: number }
  | { kind: 'attr_level_name' }
  | { kind: 'attr_incomplete'; index: number; name: string }
  | { kind: 'flag_high' };

/** Bands are held score 5 first. Thresholds are shares (1.2 = 120%); the lowest level has none. */
export function policyChecks(p: Pick<RatingScheme, 'bands' | 'competencySection' | 'highAchievementFlagAt' | 'scoringMethod' | 'achievementCap'>): PolicyCheck[] {
  const out: PolicyCheck[] = [];
  const bands = [...p.bands].sort((a, b) => b.score - a.score);
  for (const b of bands) if (!b.label.trim()) out.push({ kind: 'level_name', score: b.score });
  const mins = bands.slice(0, 4).map((b) => b.minAchievement ?? 0);
  if (mins.some((m, i) => i > 0 && !(mins[i - 1]! > m)) || mins.some((m) => !(m > 0))) out.push({ kind: 'thresholds_order' });
  // Under bands, a limit below a level's threshold means no objective can ever reach that level.
  if ((p.scoringMethod ?? 'bands') === 'bands' && p.achievementCap != null) {
    const scores = bands.slice(0, 4).filter((b) => (b.minAchievement ?? 0) > p.achievementCap!).map((b) => b.score);
    if (scores.length) out.push({ kind: 'unreachable', scores });
  }
  const cs = p.competencySection;
  if (cs.enabled) {
    if (!(cs.weightPct >= 1 && cs.weightPct <= 30)) out.push({ kind: 'attr_weight' });
    const attrs = cs.attributes ?? [];
    if (attrs.length < 3 || attrs.length > 8) out.push({ kind: 'attr_count', n: attrs.length });
    if ((cs.levelLabels ?? []).length !== 5 || (cs.levelLabels ?? []).some((l) => !l.trim())) out.push({ kind: 'attr_level_name' });
    attrs.forEach((a, i) => {
      if (!a.name.trim() || !a.measures.trim() || a.levels.length !== 5 || a.levels.some((x) => !x.trim())) out.push({ kind: 'attr_incomplete', index: i, name: a.name.trim() });
    });
  }
  if (!(p.highAchievementFlagAt >= 1)) out.push({ kind: 'flag_high' });
  return out;
}
