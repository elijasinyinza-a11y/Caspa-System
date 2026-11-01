/**
 * Strategy formation, part 11d: Composition (Strategy Formation Specification v1.0, F4; BUILD-BRIEF section 34;
 * contract v1.7). Pure: records in, results out. No React, no I/O, no clock.
 *
 * - Themes group accepted cards of the organisation's 4Q board. What a theme is about (sustain, correct, act, manage
 *   risk) is computed from its cards' sections, never stored (D11d-1).
 * - Goals, objectives and KPIs are confirmed one by one by the Executive (D11d-3 to 5): a record is confirmed when
 *   its draft carries a decision. Themes are accepted by the Strategy office.
 * - Checks at plan confirmation (D11d-8, D11d-10): risks and failure factors no goal or objective addresses, goals
 *   with no confirmed objective, and indicative costs above the resource envelope (D11d-7), all worth checking.
 */
import type { DraftMeta, Finding, FourQCell, FourQEntry, GateCode, Id, StrategicPlan } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { en } from '../strings/en';
import { isAccepted, organisationSheet } from './conception';
import { RULES } from './integrity';

/** The financial years a plan covers, first to last. */
export const planYears = (p: Pick<StrategicPlan, 'startYear' | 'endYear'>): number[] =>
  p.endYear < p.startYear ? [] : Array.from({ length: p.endYear - p.startYear + 1 }, (_, i) => p.startYear + i);

/* ───────── Themes (D11d-1) ───────── */

export type Grouping = 'sustain' | 'correct' | 'act' | 'risks';
export const GROUPINGS: Grouping[] = ['sustain', 'correct', 'act', 'risks'];

/** What a 4Q section asks the organisation to do: keep successes, correct failures, take actions, manage risks. */
export function groupingOfCell(c: FourQCell): Grouping {
  switch (c.column) {
    case 'successes': case 'success_factors': return 'sustain';
    case 'failures': case 'failure_factors': return 'correct';
    case 'opportunities': case 'key_strategic_actions': return 'act';
    default: return 'risks';
  }
}

export const themesOf = (s: Store, planId: string) => s.themes.filter((t) => t.planId === planId);

/** The groupings a theme's cards fall under, in a fixed order. */
export function themeGroupings(s: Store, cardIds: readonly string[]): Grouping[] {
  const have = new Set(cardIds.map((id) => s.fourQEntries.find((e) => e.id === id)).filter((e): e is FourQEntry => !!e).map((e) => groupingOfCell(e.cell)));
  return GROUPINGS.filter((g) => have.has(g));
}

/** Accepted cards of the organisation's board: what themes, goals and objectives may link to. */
export const boardCards = (s: Store, planId: string) => organisationSheet(s, planId).filter(isAccepted);

/* ───────── Decisions ───────── */

/** Confirmed (a goal, objective or KPI by the Executive; a theme by the Strategy office; a row by its owner). */
export const isDecided = (d: DraftMeta) => d.decided !== null && d.state !== 'rejected';

/** The records Composition works on for one plan. */
export function composition(s: Store, planId: string) {
  const goals = s.goals.filter((g) => g.planId === planId);
  const goalIds = new Set<string>(goals.map((g) => g.id));
  const objectives = s.objectives.filter((o) => goalIds.has(o.goalId));
  const objectiveIds = new Set<string>(objectives.map((o) => o.id));
  const kpis = s.kpis.filter((k) => objectiveIds.has(k.objectiveId));
  const kpiIds = new Set<string>(kpis.map((k) => k.id));
  return {
    themes: themesOf(s, planId),
    goals, objectives, kpis,
    deficiencies: s.deficiencies.filter((d) => objectiveIds.has(d.objectiveId)),
    activities: s.activities.filter((a) => kpiIds.has(a.kpiId)),
  };
}

/** Items still waiting for a decision: themes, goals, objectives and KPIs not yet confirmed, and AI-drafted rows. */
export function pendingDecisions(s: Store, planId: string): number {
  const r = composition(s, planId);
  return [...r.themes, ...r.goals, ...r.objectives, ...r.kpis].filter((x) => !isDecided(x.draft)).length
    + [...r.deficiencies, ...r.activities].filter((x) => x.draft.state === 'ai_draft').length;
}

/* ───────── Checks at plan confirmation (D11d-8) ───────── */

/** Critical failure factors and predicted future risks on the board that no goal or objective links to. */
export function risksUnaddressed(s: Store, planId: string): FourQEntry[] {
  const r = composition(s, planId);
  const linked = new Set<string>([...r.goals, ...r.objectives].flatMap((x) => x.fourQEntryIds));
  return boardCards(s, planId).filter((e) => (e.cell.column === 'failure_factors' || e.cell.column === 'risks') && !linked.has(e.id));
}

/** Goals with no confirmed objective. */
export function goalsWithoutObjective(s: Store, planId: string) {
  const r = composition(s, planId);
  return r.goals.filter((g) => !r.objectives.some((o) => o.goalId === g.id && isDecided(o.draft)));
}

/* ───────── Indicative costs and the resource envelope (D11d-7) ───────── */

/** The sum of indicative costs, in minor units, for these objectives in one year. */
export const indicativeCost = (s: Store, objectiveIds: readonly string[], fy: number): number =>
  s.indicativeCosts.filter((c) => c.financialYear === fy && objectiveIds.includes(c.objectiveId)).reduce((n, c) => n + c.amount.amountMinor, 0);

export interface EnvelopeCheck {
  /** The goal, or null for the whole plan. */
  goalId: string | null;
  financialYear: number;
  /** Minor units. */
  cost: number;
  envelope: number;
  exceeded: boolean;
}

/** Every envelope of the plan against the indicative costs of the confirmed objectives it covers. */
export function envelopeChecks(s: Store, plan: StrategicPlan): EnvelopeCheck[] {
  const r = composition(s, plan.id);
  const confirmed = r.objectives.filter((o) => isDecided(o.draft));
  return s.resourceEnvelopes.filter((e) => e.planId === plan.id).map((e) => {
    const ids = confirmed.filter((o) => e.goalId === null || o.goalId === e.goalId).map((o) => o.id as string);
    const cost = indicativeCost(s, ids, e.financialYear);
    return { goalId: e.goalId, financialYear: e.financialYear, cost, envelope: e.amount.amountMinor, exceeded: cost > e.amount.amountMinor };
  });
}

/**
 * The checks Composition adds at plan confirmation, as findings so they are recorded at the gate like any other.
 * All worth checking: none blocks a gate. One finding per subject; the years are shown beside it on screen.
 */
export function compositionFindings(s: Store, plan: StrategicPlan): Finding[] {
  const out: Finding[] = [];
  const terms = s.organisation.termLabels;
  const push = (rule: 'riskUnaddressed' | 'goalNoObjective' | 'envelopeExceeded', subject: { type: string; id: string }, message: string, route: (string | null | undefined)[]) => {
    const r = RULES[rule];
    const key = `${r.id}:${subject.type}:${subject.id}`;
    if (out.some((f) => f.key === key)) return;
    out.push({ key, ruleId: r.id, subject, message, blocksAt: [...r.blocksAt] as GateCode[], routeToPositionIds: route.filter((x): x is string => !!x) as Id<'Position'>[] });
  };
  for (const e of risksUnaddressed(s, plan.id)) {
    push('riskUnaddressed', { type: 'FourQEntry', id: e.id }, en.findings.riskUnaddressed(terms, e.text), [plan.processOwnerPositionId]);
  }
  for (const g of goalsWithoutObjective(s, plan.id)) {
    push('goalNoObjective', { type: 'Goal', id: g.id }, en.findings.goalNoObjective(terms, g.code, g.title), [g.ownerPositionId]);
  }
  for (const c of envelopeChecks(s, plan).filter((x) => x.exceeded)) {
    const g = c.goalId ? s.goals.find((x) => x.id === c.goalId) : undefined;
    if (g) push('envelopeExceeded', { type: 'Goal', id: g.id }, en.findings.envelopeExceeded(terms, g.code, g.title), [g.ownerPositionId]);
    else push('envelopeExceeded', { type: 'StrategicPlan', id: plan.id }, en.findings.planEnvelopeExceeded(plan.title), [plan.processOwnerPositionId]);
  }
  return out;
}

/* ───────── Codes ───────── */

/** The next goal, objective or KPI code in a plan: G3, O2.4, K2.1.3. Never reuses a code still held in the plan. */
export function nextCode(s: Store, planId: string, kind: 'goal' | 'objective' | 'kpi', parentId: string | null): string {
  const r = composition(s, planId);
  if (kind === 'goal') return free('G', '', r.goals.map((g) => g.code));
  if (kind === 'objective') {
    const g = r.goals.find((x) => x.id === parentId)!;
    return free('O', `${g.code.replace(/^[A-Za-z]+/, '')}.`, r.objectives.map((o) => o.code));
  }
  const o = r.objectives.find((x) => x.id === parentId)!;
  return free('K', `${o.code.replace(/^[A-Za-z]+/, '')}.`, r.kpis.map((k) => k.code));
}
function free(prefix: string, stem: string, taken: string[]): string {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${stem}${n}`)) n++;
  return `${prefix}${stem}${n}`;
}
