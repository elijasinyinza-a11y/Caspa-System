/**
 * Onboarding rules (slice 8; Onboarding Specification v0.1, decisions O1 to O9). Pure: records in, results out.
 * No React, no I/O, no clock.
 */
import type { Finding, ISODate, PerspectiveKey, SixPLevel, StrategicPlan } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { checkGate, type GateCheck } from './gate';
import { computeFindings } from './integrity';

/* ───────── Rows: what the template, the AI draft and the editor all produce (O3) ───────── */

export type PlanItemKind = 'goal' | 'objective' | 'kpi' | 'activity';
export interface PlanRow {
  kind: PlanItemKind;
  /** As written; numbered when blank. */
  code: string | null;
  title: string;
  /** The parent's code; null for a goal. */
  partOf: string | null;
  /** The owner as written: a position title, or "title, unit" where titles repeat. */
  owner: string;
  perspective?: PerspectiveKey | null;
  kpi?: { unit: string; direction: 'higher_is_better' | 'lower_is_better'; aggregation: 'latest' | 'sum' | 'average'; baseline: number | null; baselineAsOf: ISODate | null; target: number | null };
  activity?: { level: SixPLevel | null; quantity: number | null; quantityUnit: string };
  /** Page of the plan document (AI drafts), or spreadsheet row (imports). */
  page: number | null;
  row: number | null;
}

const PARENT: Record<PlanItemKind, PlanItemKind | null> = { goal: null, objective: 'goal', kpi: 'objective', activity: 'kpi' };
export const parentKind = (k: PlanItemKind) => PARENT[k];

export interface PositionRef { id: string; title: string; unitName: string }

/** A position for an owner as written: the title if it is unique, else "title, unit". Never a guess (section 4). */
export function matchOwner(positions: PositionRef[], text: string): { positionId: string } | { problem: 'none' | 'ambiguous' } {
  const t = text.trim().toLowerCase();
  if (!t) return { problem: 'none' };
  const byTitle = positions.filter((p) => p.title.toLowerCase() === t);
  if (byTitle.length === 1) return { positionId: byTitle[0]!.id };
  const withUnit = positions.filter((p) => `${p.title}, ${p.unitName}`.toLowerCase() === t);
  if (withUnit.length === 1) return { positionId: withUnit[0]!.id };
  return { problem: byTitle.length > 1 ? 'ambiguous' : 'none' };
}

/** Codes kept as written; blank ones numbered under their parent (G2, O2.1, K2.1.1, A2.1.1.1) after those already used. */
export function numberCodes(rows: PlanRow[]): PlanRow[] {
  const out = rows.map((r) => ({ ...r }));
  const used = new Set(out.flatMap((r) => (r.code ? [r.code] : [])));
  const prefix: Record<PlanItemKind, string> = { goal: 'G', objective: 'O', kpi: 'K', activity: 'A' };
  for (const r of out) {
    if (r.code) continue;
    const parent = r.partOf ? out.find((x) => x.code === r.partOf) : undefined;
    const stem = parent?.code ? parent.code.replace(/^[A-Z]/, '') + '.' : '';
    let n = 1;
    while (used.has(`${prefix[r.kind]}${stem}${n}`)) n++;
    r.code = `${prefix[r.kind]}${stem}${n}`;
    used.add(r.code);
  }
  return out;
}

export type PlanRowProblem =
  | { kind: 'owner_unmatched' | 'owner_ambiguous'; code: string; owner: string; row: number | null }
  | { kind: 'parent_missing'; code: string; partOf: string | null; row: number | null };

/** Rows that need attention: an owner that matches no position (or several), or a parent that is not in the plan. */
export function rowProblems(rows: PlanRow[], positions: PositionRef[]): PlanRowProblem[] {
  const out: PlanRowProblem[] = [];
  const byCode = new Map(rows.map((r) => [r.code, r]));
  for (const r of rows) {
    const want = PARENT[r.kind];
    if (want && (!r.partOf || byCode.get(r.partOf)?.kind !== want)) out.push({ kind: 'parent_missing', code: r.code ?? '', partOf: r.partOf, row: r.row });
    const m = matchOwner(positions, r.owner);
    if ('problem' in m && r.owner.trim()) out.push({ kind: m.problem === 'ambiguous' ? 'owner_ambiguous' : 'owner_unmatched', code: r.code ?? '', owner: r.owner, row: r.row });
  }
  return out;
}

/* ───────── Checks before the plan is confirmed (O4, section 4) ───────── */

export type PlanMust = { kind: 'period' } | { kind: 'no_goal' } | { kind: 'ai_pending'; count: number };

/** The plan's records, if it were the active plan: so the existing rules check a draft before it is confirmed. */
export function asIfActive(s: Store, planId: string): Store {
  return { ...s, plans: s.plans.map((p) => (p.id === planId ? { ...p, status: 'active' } : p.status === 'active' ? { ...p, status: 'confirmed' } : p)) };
}

/** The records of one plan. */
export function planRecords(s: Store, planId: string) {
  const goals = s.goals.filter((g) => g.planId === planId);
  const goalIds = new Set(goals.map((g) => g.id as string));
  const objectives = s.objectives.filter((o) => goalIds.has(o.goalId));
  const objectiveIds = new Set(objectives.map((o) => o.id as string));
  const kpis = s.kpis.filter((k) => objectiveIds.has(k.objectiveId));
  const kpiIds = new Set(kpis.map((k) => k.id as string));
  const activities = s.activities.filter((a) => kpiIds.has(a.kpiId));
  return { goals, objectives, kpis, activities };
}

export interface PlanChecks {
  must: PlanMust[];
  /** Worth checking when the Executive confirms the plan (GATE_ADVISORIES['plan.confirm']), for this plan only. */
  worth: Finding[];
  /** Must fix before the cascade is published, for this plan only. */
  publishBlocks: Finding[];
  noVisionOrMission: boolean;
  gate: GateCheck;
}

export function planChecks(s: Store, plan: StrategicPlan, financialYear: number): PlanChecks {
  const r = planRecords(s, plan.id);
  const must: PlanMust[] = [];
  if (plan.endYear < plan.startYear) must.push({ kind: 'period' });
  if (r.goals.length === 0) must.push({ kind: 'no_goal' });
  const pending = [...r.goals, ...r.objectives, ...r.kpis, ...r.activities].filter((x) => x.draft.state === 'ai_draft').length;
  if (pending) must.push({ kind: 'ai_pending', count: pending });
  const ids = new Set<string>([...r.goals, ...r.objectives, ...r.kpis, ...r.activities].map((x) => x.id));
  const findings = computeFindings(asIfActive(s, plan.id), { financialYear }).filter((f) => ids.has(f.subject.id));
  const gate = checkGate(findings, 'plan.confirm');
  const statements = s.visionStatements.filter((v) => v.planId === plan.id && v.text.trim());
  return {
    must,
    worth: gate.advisory,
    publishBlocks: checkGate(findings, 'cascade.publish').blocking,
    noVisionOrMission: !statements.some((v) => v.kind === 'vision') || !statements.some((v) => v.kind === 'mission'),
    gate,
  };
}

/** O4: once confirmed, active at once when its period includes the current year and no other plan is active (C1). */
export const statusOnConfirm = (s: Store, plan: StrategicPlan, financialYear: number): 'active' | 'confirmed' =>
  plan.startYear <= financialYear && financialYear <= plan.endYear && !s.plans.some((p) => p.id !== plan.id && p.status === 'active') ? 'active' : 'confirmed';

/** Whether a plan's cascade has been published: a passed cascade.publish gate event for it. */
export const isPublished = (s: Store, planId: string) => s.gateEvents.some((g) => g.gate === 'cascade.publish' && g.outcome === 'passed' && g.subject.id === planId);

/** Whether the plan has been sent to the Executive and not confirmed since (an audit entry "submit"). */
export function sentBy(s: Store, plan: StrategicPlan): string | null {
  if (plan.status !== 'draft') return null;
  const last = s.auditEntries.filter((a) => a.entity.type === 'StrategicPlan' && a.entity.id === plan.id && (a.action === 'submit' || a.action === 'return')).pop();
  return last?.action === 'submit' ? last.actorMembershipId : null;
}

/* ───────── Getting started (section 7) ───────── */

export type StepState = 'done' | 'next' | 'later' | 'must';
export type StepKey = 'structure' | 'strategy_office' | 'plan_setup' | 'plan_content' | 'plan_confirmed' | 'published' | 'why';
export interface Step { key: StepKey; state: StepState }

/** The plan onboarding is about: the active one, else the newest one not superseded. */
export const onboardingPlan = (s: Store): StrategicPlan | null =>
  s.plans.find((p) => p.status === 'active') ?? [...s.plans].reverse().find((p) => p.status !== 'superseded') ?? null;

/** Every first-run step with its state, computed from the records; empty once the cascade is published. */
export function gettingStarted(s: Store, financialYear: number, now: ISODate, structureConfirmed: boolean): Step[] {
  const plan = onboardingPlan(s);
  if (plan && isPublished(s, plan.id)) return [];
  const strategy = s.memberships.some((m) => m.status === 'active' && m.roles.includes('strategy_office')
    && s.assignments.some((a) => a.personId === m.personId && a.from <= now && (a.to === null || a.to >= now)));
  const c = plan ? planChecks(s, plan, financialYear) : null;
  const content = !!plan && planRecords(s, plan.id).goals.length > 0 && c!.must.length === 0;
  const confirmed = !!plan && plan.confirmation !== null;
  const steps: Step[] = [
    { key: 'structure', state: structureConfirmed ? 'done' : 'next' },
    { key: 'strategy_office', state: strategy ? 'done' : structureConfirmed ? 'must' : 'later' },
    { key: 'plan_setup', state: plan ? 'done' : structureConfirmed && strategy ? 'next' : 'later' },
    { key: 'plan_content', state: content ? 'done' : plan ? 'next' : 'later' },
    { key: 'plan_confirmed', state: confirmed ? 'done' : content ? 'next' : 'later' },
    { key: 'published', state: confirmed ? 'next' : 'later' },
    { key: 'why', state: 'later' },
  ];
  return steps;
}

