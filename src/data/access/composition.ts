/**
 * Strategy formation, part 11d: Composition, through the data-access layer (Strategy Formation Specification v1.0,
 * F4; BUILD-BRIEF section 34, D11d-1 to D11d-10; contract v1.7). Permissions follow the matrix:
 * - Theme: drafted by the Strategy office or a facilitator once the vision is confirmed; accepted by the Strategy office.
 * - Goal: drafted by the Strategy office or a facilitator; confirmed by the Executive, one by one.
 * - Objective: drafted by the Strategy office or a facilitator, or proposed by a department head as its owner;
 *   confirmed by the Executive. The goal's owner sees proposals but does not decide them.
 * - Kpi (and its yearly targets): drafted by the objective's owner, the KPI's owner or the Strategy office; confirmed
 *   by the Executive. A KPI linked to a measure reads its baseline from it (D11d-6).
 * - IndicativeCost: set by the objective's owner, Finance or the Strategy office. ResourceEnvelope: set by Finance.
 * - Deficiency rows and corrective activities: the objective's owner, the Strategy office or a facilitator. A new
 *   corrective activity is given a year of the plan (D11d-9).
 * Edits to a confirmed record send it back for confirmation. Removing a draft keeps it in the audit record.
 * Every AI call is logged as an AiTask; its results are drafts or suggestions until a person decides.
 */
import type {
  Activity, AiTask, AuditEntry, Deficiency, DraftMeta, GateEvent, Goal, Id, ISODate, ISODateTime, Kpi, Objective, PerspectiveKey,
  SixPLevel, StrategicPlan, Theme,
} from '../../contract/caspa-data-contract';
import { aiStub, type CardForAi } from '../../ai';
import { nextActivityCode } from '../../rules/cascade-edit';
import { boardCards, composition, envelopeChecks, isDecided, nextCode, planYears, themeGroupings, type Grouping } from '../../rules/composition';
import { departmentsHeadedBy, visionConfirmed } from '../../rules/conception';
import { isLiveBaseline } from '../../rules/consultation';
import { formationInProgress } from '../../rules/formation';
import { gateRecord } from '../../rules/gate';
import { planChecks, sentBy, statusOnConfirm, type PlanMust } from '../../rules/onboarding';
import { dateInZone, formatFinancialYear } from '../../selectors/format';
import { holderOf } from '../../selectors/node';
import { can } from './permissions';
import { financialYearOf } from './viewer';
import type { Store } from './store';
import type { Viewer } from './viewer';

type Stage = 'not_started' | 'open' | 'complete';
const has = (v: Viewer, r: string) => v.roles.includes(r as never);

/* ───────── Views ───────── */

export interface CardRef { id: string; text: string }
export interface Owner { id: string; label: string; holder: string | null }

export interface ThemeView {
  id: string;
  title: string;
  accepted: boolean;
  fromAi: boolean;
  groupings: Grouping[];
  /** The linked cards' text, or null where this viewer may not read 4Q cards. */
  cards: CardRef[] | null;
  cardCount: number;
  canAccept: boolean;
  canEdit: boolean;
  /** The goal made from this theme, if any. */
  goal: string | null;
  canMakeGoal: boolean;
}

export interface KpiView {
  id: string;
  code: string;
  name: string;
  unit: string;
  direction: 'higher_is_better' | 'lower_is_better';
  measure: { id: string; name: string; validated: boolean } | null;
  baseline: number | null;
  /** One per plan year, in order. */
  targets: (number | null)[];
  owner: Owner | null;
  confirmed: boolean;
  fromAi: boolean;
  canEdit: boolean;
  canConfirm: boolean;
}

export interface RowView {
  id: string;
  description: string;
  level: SixPLevel;
  fromAi: boolean;
  /** An AI draft the owner has not yet accepted. */
  draft: boolean;
  corrective: { id: string; code: string; title: string; year: number; level: SixPLevel | null }[];
  canEdit: boolean;
}

export interface ObjectiveView {
  id: string;
  code: string;
  title: string;
  owner: Owner | null;
  proposedBy: string | null;
  fromAi: boolean;
  confirmed: boolean;
  cards: CardRef[] | null;
  cardCount: number;
  canEdit: boolean;
  canConfirm: boolean;
  kpis: KpiView[];
  canAddKpi: boolean;
  /** One per plan year, in minor units; null where this viewer may not see costs. */
  costs: (number | null)[] | null;
  canSetCost: boolean;
  /** Null where this viewer may not see deficiencies (D6-5): rowCount says how many. */
  rows: RowView[] | null;
  rowCount: number;
  canEditRows: boolean;
  /** The AI's note on the wording, from the last review; a suggestion, never a check. */
  wording: string | null;
}

export interface GoalView {
  id: string;
  code: string;
  title: string;
  perspective: PerspectiveKey | null;
  owner: Owner | null;
  confirmed: boolean;
  themes: string[];
  cards: CardRef[] | null;
  cardCount: number;
  canEdit: boolean;
  canConfirm: boolean;
  /** One per plan year: the envelope (minor units) and the confirmed objectives' indicative cost. Null if not visible. */
  envelopes: { amount: number | null; cost: number; exceeded: boolean }[] | null;
  objectives: ObjectiveView[];
  canAddObjective: boolean;
  canPropose: boolean;
}

export interface ComposerPage {
  planId: string;
  planTitle: string;
  stage: Stage;
  /** The vision is confirmed: themes may be drafted (D11d-1). */
  ready: boolean;
  /** Composition is open: goals, objectives, KPIs, costs and rows may be changed. */
  open: boolean;
  aiEnabled: boolean;
  years: { fy: number; label: string }[];
  currency: string;
  /** Strategy office or facilitator. */
  runs: boolean;
  /** Board cards this viewer may read, for linking. Empty where they may not read cards. */
  cards: (CardRef & { grouping: Grouping })[];
  themes: ThemeView[];
  goals: GoalView[];
  /** The whole-plan envelope per year (minor units), where visible. */
  planEnvelopes: { amount: number | null; cost: number; exceeded: boolean }[] | null;
  canSetEnvelope: boolean;
  positions: { id: string; label: string }[];
  /** The organisation's scorecard perspectives, with its own labels; empty when it does not use them. */
  perspectives: { key: PerspectiveKey; label: string }[];
  measures: { id: string; name: string; unit: string; value: number; validated: boolean }[];
  /** The department head's position a proposal is made as, or null. */
  proposeAs: Owner | null;
  checks: { must: PlanMust[]; worth: { key: string; message: string; years: string[] }[] };
  confirm: {
    status: StrategicPlan['status'];
    sentBy: string | null;
    canSend: boolean;
    canConfirm: boolean;
    boardRequired: boolean;
    confirmed: { by: string; on: ISODate; ref: string | null } | null;
  };
}

export type CompositionError =
  | 'not_allowed' | 'not_found' | 'required' | 'not_ready' | 'not_open' | 'ai_off' | 'has_children' | 'same_person' | 'board_required' | 'blocked' | 'not_draft' | 'invalid';
export type CompositionResult<T = object> = ({ ok: true } & T) | { ok: false; error: CompositionError; detail?: unknown };

export type ItemType = 'Theme' | 'Goal' | 'Objective' | 'Kpi' | 'Deficiency';

export interface GoalInput { title: string; perspective: PerspectiveKey | null; ownerPositionId: string | null; themeIds: string[]; cardIds: string[] }
export interface ObjectiveInput { title: string; ownerPositionId: string | null; cardIds: string[] }
export interface KpiInput {
  name: string;
  unit: string;
  direction: 'higher_is_better' | 'lower_is_better';
  measureId: string | null;
  /** Used only when no measure is linked. */
  baseline: number | null;
  ownerPositionId: string | null;
  /** One per plan year; null leaves that year without a target. */
  targets: (number | null)[];
}
export interface CorrectiveInput { kpiId: string; title: string; level: SixPLevel; ownerPositionId: string; evidence: string; year: number }

export interface CompositionAccess {
  page(): ComposerPage | null;
  suggestThemes(): Promise<CompositionResult<{ added: number }>>;
  addTheme(input: { title: string; cardIds: string[] }): CompositionResult<{ id: string }>;
  editTheme(id: string, input: { title: string; cardIds: string[] }): CompositionResult;
  acceptTheme(id: string): CompositionResult;
  goalFromTheme(themeId: string): CompositionResult<{ id: string }>;
  addGoal(input: GoalInput): CompositionResult<{ id: string }>;
  editGoal(id: string, input: GoalInput): CompositionResult;
  addObjective(goalId: string, input: ObjectiveInput): CompositionResult<{ id: string }>;
  proposeObjective(goalId: string, input: { title: string; cardIds: string[] }): CompositionResult<{ id: string }>;
  suggestObjectives(): Promise<CompositionResult<{ added: number }>>;
  editObjective(id: string, input: ObjectiveInput): CompositionResult;
  mergeObjective(id: string, intoId: string): CompositionResult;
  addKpi(objectiveId: string, input: KpiInput): CompositionResult<{ id: string }>;
  suggestKpi(objectiveId: string): Promise<CompositionResult<{ id: string } | { id: null }>>;
  editKpi(id: string, input: KpiInput): CompositionResult;
  confirmItem(type: 'Goal' | 'Objective' | 'Kpi', id: string): CompositionResult;
  remove(type: ItemType, id: string): CompositionResult;
  setCost(objectiveId: string, year: number, amountMinor: number | null): CompositionResult;
  setEnvelope(goalId: string | null, year: number, amountMinor: number | null): CompositionResult;
  suggestRows(objectiveId: string): Promise<CompositionResult<{ added: number }>>;
  addRow(objectiveId: string, input: { description: string; level: SixPLevel }): CompositionResult<{ id: string }>;
  acceptRow(id: string): CompositionResult;
  addCorrective(rowId: string, input: CorrectiveInput): CompositionResult<{ id: string; code: string }>;
  unlinkCorrective(rowId: string, activityId: string): CompositionResult;
  reviewWording(): Promise<CompositionResult<{ notes: number }>>;
  send(): CompositionResult;
  confirmPlan(board: { resolutionRef: string; date: ISODate } | null): CompositionResult;
}

interface Ctx {
  s: Store; viewer: Viewer; now: ISODate; clock: () => ISODateTime;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  onChange?: () => void;
}

/** Kept beside the store, never stored: the AI's wording notes from the last review, and its suggested perspectives. */
const notes = new WeakMap<Store, { wording: Map<string, string>; perspective: Map<string, PerspectiveKey> }>();
const notesOf = (s: Store) => {
  let n = notes.get(s);
  if (!n) notes.set(s, (n = { wording: new Map(), perspective: new Map() }));
  return n;
};

export function createCompositionAccess(ctx: Ctx): CompositionAccess {
  const { s, viewer, clock, audit, now } = ctx;
  const runs = has(viewer, 'strategy_office') || has(viewer, 'facilitator');
  const isExec = has(viewer, 'executive');
  const changed = () => ctx.onChange?.();
  const stamp = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const base = () => ({ orgId: s.organisation.id, created: stamp(), updated: stamp() });
  const deny = <T,>(error: CompositionError = 'not_allowed', detail?: unknown): CompositionResult<T> => ({ ok: false, error, detail });
  const key = (s.organisation.id as string).replace(/^org-/, '');
  const nextId = (prefix: string, taken: { id: string }[]) => {
    const used = new Set(taken.map((x) => x.id));
    let n = taken.length;
    let id: string;
    do id = `${prefix}-${key}-${++n}`; while (used.has(id));
    return id;
  };
  const tz = s.organisation.timeZone;
  const currency = s.organisation.baseCurrency;
  const plan = (): StrategicPlan | null => formationInProgress(s);
  const stageOf = (p: StrategicPlan): Stage => p.formation?.composition.status ?? 'not_started';
  const isOpen = (p: StrategicPlan) => stageOf(p) === 'open' && p.status === 'draft';
  const personOf = (mid: string) => s.people.find((p) => p.id === s.memberships.find((m) => m.id === mid)?.personId)?.fullName ?? '';
  const unitName = (u: string) => s.units.find((x) => x.id === u)?.name ?? '';
  const labelOf = (pid: string) => {
    const p = s.positions.find((x) => x.id === pid);
    if (!p) return pid;
    return s.positions.filter((x) => x.title === p.title).length > 1 ? `${p.title}, ${unitName(p.unitId)}` : p.title;
  };
  const owner = (pid: string | null): Owner | null => (pid ? { id: pid, label: labelOf(pid), holder: holderOf(s, pid, now)?.person ?? null } : null);
  const validPosition = (pid: string | null) => pid === null || s.positions.some((p) => p.id === pid);
  const humanDraft = (): DraftMeta => ({ state: 'human', provenance: { kind: 'manual' }, decided: null });
  const decidedNow = (): DraftMeta => ({ state: 'human', provenance: { kind: 'manual' }, decided: stamp() });
  const aiDraft = (t: AiTask): DraftMeta => ({ state: 'ai_draft', provenance: { kind: 'ai_suggestion', aiTaskId: t.id }, decided: null });
  const task = (kind: AiTask['kind'], inputRefs: AiTask['inputRefs']): AiTask => {
    const t: AiTask = { orgId: s.organisation.id, id: nextId('ai', s.aiTasks) as Id<'AiTask'>, kind, requested: stamp(), inputRefs, outputRefs: [], model: 'stub' };
    s.aiTasks.push(t);
    return t;
  };
  const record = (type: string, id: string, after: unknown, action = 'create') => audit(action, { type, id }, null, structuredClone(after));
  const touch = <T extends { updated: unknown }>(type: string, x: T & { id: string }, before: unknown) => {
    x.updated = stamp();
    audit('update', { type, id: x.id }, before, structuredClone(x));
  };
  /** An edit sends a confirmed record back for confirmation (as edits reset checks in part 11c). */
  const reopen = (d: DraftMeta): DraftMeta => (d.state === 'ai_draft' ? d : { ...d, state: d.state === 'accepted' ? 'human' : d.state, decided: null });

  const r = () => composition(s, plan()!.id);
  const cardsOk = (p: StrategicPlan, ids: string[]) => {
    const board = new Set(boardCards(s, p.id).map((e) => e.id as string));
    return ids.every((id) => board.has(id));
  };
  const seesCard = (id: string) => can(s, viewer, 'view', { type: 'FourQEntry', id });
  const cardRefs = (ids: readonly string[]): CardRef[] | null => {
    if (!ids.every(seesCard)) return null;
    return ids.map((id) => ({ id, text: s.fourQEntries.find((e) => e.id === id)?.text ?? '' }));
  };
  const forAi = (ids?: readonly string[]): CardForAi[] =>
    boardCards(s, plan()!.id).filter((e) => !ids || ids.includes(e.id)).map((e) => ({ id: e.id, cell: e.cell, text: e.text }));
  const years = (p: StrategicPlan) => planYears(p);
  const myHeadPosition = (): string | null => {
    const d = departmentsHeadedBy(s, viewer.positionIds as string[])[0];
    return d?.headPositionId ?? null;
  };

  /* ───────── Guards ───────── */

  type Guard = { p: StrategicPlan } | { error: CompositionError };
  const ready = (): Guard => {
    const p = plan();
    if (!p) return { error: 'not_found' };
    if (!visionConfirmed(s, p.id)) return { error: 'not_ready' };
    if (p.status !== 'draft') return { error: 'not_draft' };
    return { p };
  };
  const opened = (): Guard => {
    const g = ready();
    if ('error' in g) return g;
    return isOpen(g.p) ? g : { error: 'not_open' };
  };
  const objectiveOf = (id: string) => (plan() ? r().objectives.find((o) => o.id === id) : undefined);
  const goalOf = (id: string) => (plan() ? r().goals.find((g) => g.id === id) : undefined);
  const kpiOf = (id: string) => (plan() ? r().kpis.find((k) => k.id === id) : undefined);
  const mayDraftKpi = (objectiveId: string, kpiId?: string) =>
    can(s, viewer, 'draft', { type: 'Kpi', id: kpiId ?? objectiveId }) || (!!kpiId && can(s, viewer, 'draft', { type: 'Kpi', id: objectiveId }));
  const mayRows = (objectiveId: string) => can(s, viewer, 'draft', { type: 'Deficiency', id: objectiveId });
  const seesRows = (objectiveId: string) => can(s, viewer, 'view', { type: 'Deficiency', id: objectiveId });

  /* ───────── Views ───────── */

  const kpiView = (p: StrategicPlan, k: Kpi): KpiView => {
    const m = k.baselineMeasureId ? s.baselineMeasures.find((b) => b.id === k.baselineMeasureId) : undefined;
    return {
      id: k.id, code: k.code, name: k.name, unit: k.unit, direction: k.direction === 'lower_is_better' ? 'lower_is_better' : 'higher_is_better',
      measure: m ? { id: m.id, name: m.name, validated: !!m.validated } : null,
      baseline: m ? m.value : k.baseline,
      targets: years(p).map((fy) => s.kpiTargets.find((t) => t.kpiId === k.id && t.financialYear === fy)?.target ?? null),
      owner: owner(k.ownerPositionId), confirmed: isDecided(k.draft), fromAi: k.draft.provenance.kind !== 'manual',
      canEdit: isOpen(p) && mayDraftKpi(k.objectiveId, k.id),
      canConfirm: isOpen(p) && isExec && !isDecided(k.draft),
    };
  };
  const rowView = (p: StrategicPlan, d: Deficiency): RowView => ({
    id: d.id, description: d.description, level: d.level, fromAi: d.draft.provenance.kind !== 'manual', draft: d.draft.state === 'ai_draft',
    corrective: d.correctiveActivityIds.map((aid) => s.activities.find((a) => a.id === aid)).filter((a): a is Activity => !!a)
      .map((a) => ({ id: a.id, code: a.code, title: a.title, year: a.financialYear, level: a.decisionLevel })),
    canEdit: isOpen(p) && mayRows(d.objectiveId),
  });
  const objectiveView = (p: StrategicPlan, o: Objective): ObjectiveView => {
    const rows = s.deficiencies.filter((d) => d.objectiveId === o.id);
    const seesCost = can(s, viewer, 'view', { type: 'IndicativeCost', id: o.id });
    const isProposer = !!o.proposedByPositionId && viewer.positionIds.includes(o.proposedByPositionId) && !isDecided(o.draft);
    return {
      id: o.id, code: o.code, title: o.title, owner: owner(o.ownerPositionId),
      proposedBy: o.proposedByPositionId ? labelOf(o.proposedByPositionId) : null,
      fromAi: o.draft.provenance.kind !== 'manual', confirmed: isDecided(o.draft),
      cards: cardRefs(o.fourQEntryIds), cardCount: o.fourQEntryIds.length,
      canEdit: isOpen(p) && (runs || isProposer),
      canConfirm: isOpen(p) && isExec && !isDecided(o.draft),
      kpis: r().kpis.filter((k) => k.objectiveId === o.id).sort(byCode).map((k) => kpiView(p, k)),
      canAddKpi: isOpen(p) && mayDraftKpi(o.id),
      costs: seesCost ? years(p).map((fy) => s.indicativeCosts.find((c) => c.objectiveId === o.id && c.financialYear === fy)?.amount.amountMinor ?? null) : null,
      canSetCost: isOpen(p) && can(s, viewer, 'draft', { type: 'IndicativeCost', id: o.id }),
      rows: seesRows(o.id) ? rows.map((d) => rowView(p, d)) : null,
      rowCount: rows.length,
      canEditRows: isOpen(p) && mayRows(o.id),
      wording: notesOf(s).wording.get(o.id) ?? null,
    };
  };
  const envelopeRow = (p: StrategicPlan, goalId: string | null) => {
    const checks = envelopeChecks(s, p);
    const confirmed = r().objectives.filter((o) => isDecided(o.draft) && (goalId === null || o.goalId === goalId)).map((o) => o.id as string);
    return years(p).map((fy) => {
      const c = checks.find((x) => x.goalId === goalId && x.financialYear === fy);
      const cost = s.indicativeCosts.filter((x) => x.financialYear === fy && confirmed.includes(x.objectiveId)).reduce((n, x) => n + x.amount.amountMinor, 0);
      return { amount: c ? c.envelope : null, cost, exceeded: !!c?.exceeded };
    });
  };
  const seesEnvelopes = can(s, viewer, 'view', { type: 'ResourceEnvelope', id: '' });
  const goalView = (p: StrategicPlan, g: Goal): GoalView => ({
    id: g.id, code: g.code, title: g.title, perspective: g.perspective, owner: owner(g.ownerPositionId), confirmed: isDecided(g.draft),
    themes: g.themeIds.map((t) => s.themes.find((x) => x.id === t)?.title ?? '').filter(Boolean),
    cards: cardRefs(g.fourQEntryIds), cardCount: g.fourQEntryIds.length,
    canEdit: isOpen(p) && runs, canConfirm: isOpen(p) && isExec && !isDecided(g.draft),
    envelopes: seesEnvelopes ? envelopeRow(p, g.id) : null,
    objectives: r().objectives.filter((o) => o.goalId === g.id).sort(byCode).map((o) => objectiveView(p, o)),
    canAddObjective: isOpen(p) && runs,
    canPropose: isOpen(p) && !runs && isDecided(g.draft) && !!myHeadPosition(),
  });
  const themeView = (p: StrategicPlan, t: Theme): ThemeView => {
    const goal = r().goals.find((g) => g.themeIds.includes(t.id));
    return {
      id: t.id, title: t.title, accepted: isDecided(t.draft), fromAi: t.draft.provenance.kind !== 'manual',
      groupings: themeGroupings(s, t.fourQEntryIds), cards: cardRefs(t.fourQEntryIds), cardCount: t.fourQEntryIds.length,
      canAccept: p.status === 'draft' && !isDecided(t.draft) && can(s, viewer, 'approve', { type: 'Theme', id: t.id }),
      canEdit: p.status === 'draft' && can(s, viewer, 'draft', { type: 'Theme', id: t.id }),
      goal: goal ? goal.code : null,
      canMakeGoal: isOpen(p) && runs && isDecided(t.draft) && !goal,
    };
  };

  /* ───────── Changes ───────── */

  const goalInputError = (p: StrategicPlan, input: GoalInput): CompositionError | null => {
    if (!input.title.trim()) return 'required';
    if (!validPosition(input.ownerPositionId)) return 'invalid';
    if (!cardsOk(p, input.cardIds)) return 'invalid';
    if (!input.themeIds.every((t) => s.themes.some((x) => x.id === t && x.planId === p.id))) return 'invalid';
    return null;
  };
  const kpiInputError = (p: StrategicPlan, input: KpiInput): CompositionError | null => {
    if (!input.name.trim()) return 'required';
    if (!validPosition(input.ownerPositionId)) return 'invalid';
    if (input.measureId && !s.baselineMeasures.some((b) => b.id === input.measureId && b.planId === p.id && isLiveBaseline(b))) return 'invalid';
    if (input.targets.length !== years(p).length || input.targets.some((t) => t !== null && !Number.isFinite(t))) return 'invalid';
    return null;
  };
  const writeTargets = (p: StrategicPlan, k: Kpi, targets: (number | null)[]) => {
    years(p).forEach((fy, i) => {
      const value = targets[i] ?? null;
      const at = s.kpiTargets.findIndex((t) => t.kpiId === k.id && t.financialYear === fy);
      if (value === null) { if (at >= 0) s.kpiTargets.splice(at, 1); return; }
      if (at >= 0) { s.kpiTargets[at]!.target = value; s.kpiTargets[at]!.updated = stamp(); return; }
      s.kpiTargets.push({ ...base(), id: nextId('kt', s.kpiTargets) as Id<'KpiTarget'>, kpiId: k.id, financialYear: fy, target: value });
    });
  };
  const newKpi = (p: StrategicPlan, o: Objective, input: KpiInput, draft: DraftMeta): Kpi => {
    const k: Kpi = {
      ...base(), id: nextId('k', s.kpis) as Id<'Kpi'>, objectiveId: o.id, code: nextCode(s, p.id, 'kpi', o.id), name: input.name.trim(), unit: input.unit.trim(),
      direction: input.direction, aggregation: 'latest', baseline: input.measureId ? null : input.baseline,
      baselineMeasureId: (input.measureId as Id<'BaselineMeasure'> | null) ?? null, milestones: [], reportingFrequency: 'quarterly',
      ownerPositionId: (input.ownerPositionId as Id<'Position'> | null) ?? o.ownerPositionId, draft,
    };
    s.kpis.push(k);
    writeTargets(p, k, input.targets);
    record('Kpi', k.id, { ...k, targets: input.targets });
    return k;
  };
  const newObjective = (p: StrategicPlan, g: Goal, title: string, ownerPos: string | null, proposedBy: string | null, cardIds: string[], draft: DraftMeta): Objective => {
    const o: Objective = {
      ...base(), id: nextId('o', s.objectives) as Id<'Objective'>, goalId: g.id, code: nextCode(s, p.id, 'objective', g.id), title: title.trim(),
      ownerPositionId: ownerPos as Id<'Position'> | null, proposedByPositionId: proposedBy as Id<'Position'> | null,
      fourQEntryIds: cardIds as Id<'FourQEntry'>[], draft,
    };
    s.objectives.push(o);
    record('Objective', o.id, o);
    return o;
  };
  const removeRecord = <T extends { id: string }>(list: T[], type: string, x: T) => {
    list.splice(list.indexOf(x), 1);
    audit('delete', { type, id: x.id }, structuredClone(x), null);
  };

  return {
    page() {
      const p = plan();
      if (!p || !visionConfirmed(s, p.id)) return null;
      const rec = r();
      const checks = planChecks(s, p, p.startYear);
      const yrs = years(p);
      const sender = sentBy(s, p);
      const confirmEvent = s.gateEvents.filter((g) => g.gate === 'plan.confirm' && g.outcome === 'passed' && g.subject.id === p.id).pop();
      const head = myHeadPosition();
      const envelopeYears = (subject: { type: string; id: string }) => {
        if (subject.type === 'StrategicPlan') return envelopeChecks(s, p).filter((c) => c.goalId === null && c.exceeded).map((c) => label(c.financialYear));
        if (subject.type !== 'Goal') return [];
        return envelopeChecks(s, p).filter((c) => c.goalId === subject.id && c.exceeded).map((c) => label(c.financialYear));
      };
      const label = (fy: number) => formatFinancialYear(fy, s.organisation.financialYearStartMonth);
      return {
        planId: p.id, planTitle: p.title, stage: stageOf(p), ready: true, open: isOpen(p), aiEnabled: s.organisation.settings.aiEnabled,
        years: yrs.map((fy) => ({ fy, label: label(fy) })), currency,
        runs,
        cards: boardCards(s, p.id).filter((e) => seesCard(e.id)).map((e) => ({ id: e.id, text: e.text, grouping: themeGroupings(s, [e.id])[0]! })),
        themes: rec.themes.map((t) => themeView(p, t)),
        goals: [...rec.goals].sort(byCode).map((g) => goalView(p, g)),
        planEnvelopes: seesEnvelopes ? envelopeRow(p, null) : null,
        canSetEnvelope: isOpen(p) && can(s, viewer, 'draft', { type: 'ResourceEnvelope', id: '' }),
        positions: s.positions.map((x) => ({ id: x.id as string, label: labelOf(x.id) })).sort((a, b) => a.label.localeCompare(b.label)),
        perspectives: (s.organisation.perspectives ?? []).map((x) => ({ key: x.key, label: x.label })),
        measures: s.baselineMeasures.filter((b) => b.planId === p.id && isLiveBaseline(b)).map((b) => ({ id: b.id as string, name: b.name, unit: b.unit, value: b.value, validated: !!b.validated })),
        proposeAs: !runs && head ? owner(head) : null,
        checks: {
          must: checks.must,
          worth: checks.worth.map((f) => ({ key: f.key, message: f.message, years: f.ruleId === 'BOOK-ENVELOPE-EXCEEDED' ? envelopeYears(f.subject) : [] })),
        },
        confirm: {
          status: p.status, sentBy: sender ? personOf(sender) : null,
          canSend: runs && p.status === 'draft' && !sender,
          canConfirm: isExec && p.status === 'draft' && !!sender && sender !== viewer.membershipId,
          boardRequired: s.organisation.settings.boardApprovalRequired.plan,
          confirmed: p.confirmation
            ? { by: personOf(p.confirmation.byMembershipId), on: dateInZone(p.confirmation.at, tz), ref: p.boardApproval?.resolutionRef ?? null }
            : confirmEvent ? { by: personOf(confirmEvent.attempted.byMembershipId), on: dateInZone(confirmEvent.attempted.at, tz), ref: null } : null,
        },
      };
    },

    /* ───────── Themes ───────── */

    async suggestThemes() {
      const g = ready();
      if ('error' in g) return deny(g.error);
      if (!can(s, viewer, 'draft', { type: 'Theme', id: '' })) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const cards = forAi();
      const t = task('cluster', [{ type: 'StrategicPlan', id: g.p.id }, ...cards.map((c) => ({ type: 'FourQEntry', id: c.id }))]);
      const out = await aiStub.suggestThemes(s.organisation.id, cards);
      const taken = new Set(themesOfPlan(g.p).map((x) => x.title.toLowerCase()));
      let added = 0;
      for (const sug of out.themes) {
        if (taken.has(sug.title.toLowerCase())) continue;
        const th: Theme = { ...base(), id: nextId('th', s.themes) as Id<'Theme'>, planId: g.p.id, title: sug.title, fourQEntryIds: sug.cardIds as Id<'FourQEntry'>[], draft: aiDraft(t) };
        s.themes.push(th);
        t.outputRefs.push({ type: 'Theme', id: th.id });
        if (sug.perspective) notesOf(s).perspective.set(th.id, sug.perspective);
        record('Theme', th.id, th);
        added++;
      }
      changed();
      return { ok: true, added };
    },
    addTheme(input) {
      const g = ready();
      if ('error' in g) return deny(g.error);
      if (!can(s, viewer, 'draft', { type: 'Theme', id: '' })) return deny();
      if (!input.title.trim()) return deny('required');
      if (!cardsOk(g.p, input.cardIds)) return deny('invalid');
      const th: Theme = { ...base(), id: nextId('th', s.themes) as Id<'Theme'>, planId: g.p.id, title: input.title.trim(), fourQEntryIds: input.cardIds as Id<'FourQEntry'>[], draft: humanDraft() };
      s.themes.push(th);
      record('Theme', th.id, th);
      changed();
      return { ok: true, id: th.id };
    },
    editTheme(id, input) {
      const g = ready();
      if ('error' in g) return deny(g.error);
      const th = themesOfPlan(g.p).find((x) => x.id === id);
      if (!th) return deny('not_found');
      if (!can(s, viewer, 'draft', { type: 'Theme', id })) return deny();
      if (!input.title.trim()) return deny('required');
      if (!cardsOk(g.p, input.cardIds)) return deny('invalid');
      const before = structuredClone(th);
      th.title = input.title.trim();
      th.fourQEntryIds = input.cardIds as Id<'FourQEntry'>[];
      th.draft = reopen(th.draft);
      touch('Theme', th, before);
      changed();
      return { ok: true };
    },
    acceptTheme(id) {
      const g = ready();
      if ('error' in g) return deny(g.error);
      const th = themesOfPlan(g.p).find((x) => x.id === id);
      if (!th) return deny('not_found');
      if (!can(s, viewer, 'approve', { type: 'Theme', id })) return deny();
      const before = structuredClone(th);
      th.draft = { ...th.draft, state: th.draft.state === 'ai_draft' ? 'accepted' : th.draft.state, decided: stamp() };
      touch('Theme', th, before);
      changed();
      return { ok: true };
    },

    /* ───────── Goals ───────── */

    goalFromTheme(themeId) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      if (!can(s, viewer, 'draft', { type: 'Goal', id: '' })) return deny();
      const th = themesOfPlan(g.p).find((x) => x.id === themeId);
      if (!th) return deny('not_found');
      if (!isDecided(th.draft) || r().goals.some((x) => x.themeIds.includes(th.id))) return deny('invalid');
      return this.addGoal({ title: th.title, perspective: notesOf(s).perspective.get(th.id) ?? null, ownerPositionId: null, themeIds: [th.id], cardIds: [...th.fourQEntryIds] });
    },
    addGoal(input) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      if (!can(s, viewer, 'draft', { type: 'Goal', id: '' })) return deny();
      const err = goalInputError(g.p, input);
      if (err) return deny(err);
      const goal: Goal = {
        ...base(), id: nextId('g', s.goals) as Id<'Goal'>, planId: g.p.id, code: nextCode(s, g.p.id, 'goal', null), title: input.title.trim(),
        perspective: input.perspective, ownerPositionId: input.ownerPositionId as Id<'Position'> | null,
        themeIds: input.themeIds as Id<'Theme'>[], fourQEntryIds: input.cardIds as Id<'FourQEntry'>[], draft: humanDraft(),
      };
      s.goals.push(goal);
      record('Goal', goal.id, goal);
      changed();
      return { ok: true, id: goal.id };
    },
    editGoal(id, input) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const goal = goalOf(id);
      if (!goal) return deny('not_found');
      if (!can(s, viewer, 'draft', { type: 'Goal', id })) return deny();
      const err = goalInputError(g.p, input);
      if (err) return deny(err);
      const before = structuredClone(goal);
      Object.assign(goal, {
        title: input.title.trim(), perspective: input.perspective, ownerPositionId: input.ownerPositionId,
        themeIds: input.themeIds, fourQEntryIds: input.cardIds, draft: reopen(goal.draft),
      });
      touch('Goal', goal, before);
      changed();
      return { ok: true };
    },

    /* ───────── Objectives ───────── */

    addObjective(goalId, input) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const goal = goalOf(goalId);
      if (!goal) return deny('not_found');
      if (!can(s, viewer, 'draft', { type: 'Objective', id: '' })) return deny();
      if (!input.title.trim()) return deny('required');
      if (!validPosition(input.ownerPositionId) || !cardsOk(g.p, input.cardIds)) return deny('invalid');
      const o = newObjective(g.p, goal, input.title, input.ownerPositionId, null, input.cardIds, humanDraft());
      changed();
      return { ok: true, id: o.id };
    },
    proposeObjective(goalId, input) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const goal = goalOf(goalId);
      if (!goal) return deny('not_found');
      // D11d-4: a department head proposes with their own position as owner (the matrix's "owner" for the new record).
      const head = myHeadPosition();
      if (!head || !isDecided(goal.draft)) return deny();
      if (!input.title.trim()) return deny('required');
      if (!cardsOk(g.p, input.cardIds)) return deny('invalid');
      const o = newObjective(g.p, goal, input.title, head, head, input.cardIds, humanDraft());
      changed();
      return { ok: true, id: o.id };
    },
    async suggestObjectives() {
      const g = opened();
      if ('error' in g) return deny(g.error);
      if (!can(s, viewer, 'draft', { type: 'Objective', id: '' })) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const goals = r().goals.filter((x) => isDecided(x.draft));
      const cards = forAi();
      const t = task('draft', [{ type: 'StrategicPlan', id: g.p.id }, ...goals.map((x) => ({ type: 'Goal', id: x.id }))]);
      const out = await aiStub.suggestObjectives(s.organisation.id, goals.map((x) => ({ id: x.id, title: x.title, themeTitles: x.themeIds.map((id) => s.themes.find((th) => th.id === id)?.title ?? '') })), cards);
      let added = 0;
      for (const sug of out.objectives) {
        const goal = goals.find((x) => x.id === sug.goalId);
        if (!goal || r().objectives.some((o) => o.goalId === goal.id && o.title.toLowerCase() === sug.title.toLowerCase())) continue;
        const o = newObjective(g.p, goal, sug.title, null, null, sug.cardIds, aiDraft(t));
        t.outputRefs.push({ type: 'Objective', id: o.id });
        added++;
      }
      changed();
      return { ok: true, added };
    },
    editObjective(id, input) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const o = objectiveOf(id);
      if (!o) return deny('not_found');
      const isProposer = !!o.proposedByPositionId && viewer.positionIds.includes(o.proposedByPositionId) && !isDecided(o.draft);
      if (!can(s, viewer, 'draft', { type: 'Objective', id }) && !isProposer) return deny();
      if (!input.title.trim()) return deny('required');
      if (!validPosition(input.ownerPositionId) || !cardsOk(g.p, input.cardIds)) return deny('invalid');
      const before = structuredClone(o);
      o.title = input.title.trim();
      // A proposer keeps themselves as owner; only the Strategy office or a facilitator reassigns.
      if (runs) o.ownerPositionId = input.ownerPositionId as Id<'Position'> | null;
      o.fourQEntryIds = input.cardIds as Id<'FourQEntry'>[];
      o.draft = reopen(o.draft);
      touch('Objective', o, before);
      changed();
      return { ok: true };
    },
    mergeObjective(id, intoId) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const from = objectiveOf(id);
      const into = objectiveOf(intoId);
      if (!from || !into || from.id === into.id) return deny('not_found');
      if (!can(s, viewer, 'draft', { type: 'Objective', id })) return deny();
      if (from.goalId !== into.goalId) return deny('invalid');
      const before = structuredClone(into);
      into.fourQEntryIds = [...new Set([...into.fourQEntryIds, ...from.fourQEntryIds])];
      for (const k of s.kpis.filter((x) => x.objectiveId === from.id)) { k.objectiveId = into.id; k.updated = stamp(); }
      for (const d of s.deficiencies.filter((x) => x.objectiveId === from.id)) { d.objectiveId = into.id; d.updated = stamp(); }
      for (const c of s.indicativeCosts.filter((x) => x.objectiveId === from.id)) {
        const same = s.indicativeCosts.find((x) => x.objectiveId === into.id && x.financialYear === c.financialYear);
        if (same) { same.amount = { ...same.amount, amountMinor: same.amount.amountMinor + c.amount.amountMinor }; s.indicativeCosts.splice(s.indicativeCosts.indexOf(c), 1); }
        else c.objectiveId = into.id;
      }
      into.draft = reopen(into.draft);
      touch('Objective', into, before);
      s.objectives.splice(s.objectives.indexOf(from), 1);
      audit('merge', { type: 'Objective', id: from.id }, structuredClone(from), { mergedInto: into.id });
      changed();
      return { ok: true };
    },

    /* ───────── KPIs ───────── */

    addKpi(objectiveId, input) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const o = objectiveOf(objectiveId);
      if (!o) return deny('not_found');
      if (!mayDraftKpi(o.id)) return deny();
      const err = kpiInputError(g.p, input);
      if (err) return deny(err);
      const k = newKpi(g.p, o, input, humanDraft());
      changed();
      return { ok: true, id: k.id };
    },
    async suggestKpi(objectiveId) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const o = objectiveOf(objectiveId);
      if (!o) return deny('not_found');
      if (!mayDraftKpi(o.id)) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const measures = s.baselineMeasures.filter((b) => b.planId === g.p.id && isLiveBaseline(b));
      const t = task('draft', [{ type: 'Objective', id: o.id }, ...measures.map((m) => ({ type: 'BaselineMeasure', id: m.id }))]);
      const sug = await aiStub.suggestKpi(s.organisation.id, o.title, measures.map((m) => ({ id: m.id, name: m.name })), years(g.p).length);
      if (!sug) { changed(); return { ok: true, id: null }; }
      const m = measures.find((x) => x.id === sug.measureId)!;
      const targets = years(g.p).map((_, i) => sug.targets[i] ?? null);
      const k = newKpi(g.p, o, { name: m.name, unit: m.unit, direction: sug.direction, measureId: m.id, baseline: null, ownerPositionId: o.ownerPositionId, targets }, aiDraft(t));
      t.outputRefs.push({ type: 'Kpi', id: k.id });
      changed();
      return { ok: true, id: k.id };
    },
    editKpi(id, input) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const k = kpiOf(id);
      if (!k) return deny('not_found');
      if (!mayDraftKpi(k.objectiveId, k.id)) return deny();
      const err = kpiInputError(g.p, input);
      if (err) return deny(err);
      const before = { ...structuredClone(k), targets: kpiView(g.p, k).targets };
      Object.assign(k, {
        name: input.name.trim(), unit: input.unit.trim(), direction: input.direction,
        baselineMeasureId: input.measureId, baseline: input.measureId ? null : input.baseline,
        ownerPositionId: input.ownerPositionId, draft: reopen(k.draft),
      });
      writeTargets(g.p, k, input.targets);
      k.updated = stamp();
      audit('update', { type: 'Kpi', id: k.id }, before, { ...structuredClone(k), targets: input.targets });
      changed();
      return { ok: true };
    },

    /* ───────── Confirming and removing items ───────── */

    confirmItem(type, id) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const x = type === 'Goal' ? goalOf(id) : type === 'Objective' ? objectiveOf(id) : kpiOf(id);
      if (!x) return deny('not_found');
      if (!can(s, viewer, 'confirm', { type, id })) return deny();
      if (isDecided(x.draft)) return { ok: true };
      const before = structuredClone(x);
      x.draft = { ...x.draft, state: x.draft.state === 'ai_draft' ? 'accepted' : x.draft.state, decided: stamp() };
      x.updated = stamp();
      audit('confirm', { type, id }, before, structuredClone(x));
      changed();
      return { ok: true };
    },
    remove(type, id) {
      const g = ready();
      if ('error' in g) return deny(g.error);
      const p = g.p;
      if (type === 'Theme') {
        const th = themesOfPlan(p).find((x) => x.id === id);
        if (!th) return deny('not_found');
        if (!can(s, viewer, 'draft', { type, id })) return deny();
        if (r().goals.some((x) => x.themeIds.includes(th.id))) return deny('has_children');
        removeRecord(s.themes, type, th);
        changed();
        return { ok: true };
      }
      if (!isOpen(p)) return deny('not_open');
      if (type === 'Goal') {
        const goal = goalOf(id);
        if (!goal) return deny('not_found');
        if (!can(s, viewer, 'draft', { type, id }) && !can(s, viewer, 'confirm', { type, id })) return deny();
        if (r().objectives.some((o) => o.goalId === goal.id)) return deny('has_children');
        for (const e of s.resourceEnvelopes.filter((x) => x.goalId === goal.id)) removeRecord(s.resourceEnvelopes, 'ResourceEnvelope', e);
        removeRecord(s.goals, type, goal);
      } else if (type === 'Objective') {
        const o = objectiveOf(id);
        if (!o) return deny('not_found');
        const isProposer = !!o.proposedByPositionId && viewer.positionIds.includes(o.proposedByPositionId) && !isDecided(o.draft);
        if (!can(s, viewer, 'draft', { type, id }) && !can(s, viewer, 'confirm', { type, id }) && !isProposer) return deny();
        if (r().kpis.some((k) => k.objectiveId === o.id) || s.deficiencies.some((d) => d.objectiveId === o.id)) return deny('has_children');
        for (const c of s.indicativeCosts.filter((x) => x.objectiveId === o.id)) removeRecord(s.indicativeCosts, 'IndicativeCost', c);
        removeRecord(s.objectives, type, o);
      } else if (type === 'Kpi') {
        const k = kpiOf(id);
        if (!k) return deny('not_found');
        if (!mayDraftKpi(k.objectiveId, k.id) && !can(s, viewer, 'confirm', { type, id })) return deny();
        if (s.activities.some((a) => a.kpiId === k.id)) return deny('has_children');
        for (const t of s.kpiTargets.filter((x) => x.kpiId === k.id)) s.kpiTargets.splice(s.kpiTargets.indexOf(t), 1);
        removeRecord(s.kpis, type, k);
      } else {
        const d = s.deficiencies.find((x) => x.id === id && objectiveOf(x.objectiveId));
        if (!d) return deny('not_found');
        if (!mayRows(d.objectiveId)) return deny();
        if (d.correctiveActivityIds.length) return deny('has_children');
        removeRecord(s.deficiencies, type, d);
      }
      changed();
      return { ok: true };
    },

    /* ───────── Costs and envelopes (D11d-7) ───────── */

    setCost(objectiveId, year, amountMinor) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const o = objectiveOf(objectiveId);
      if (!o) return deny('not_found');
      if (!can(s, viewer, 'draft', { type: 'IndicativeCost', id: o.id })) return deny();
      if (!years(g.p).includes(year) || (amountMinor !== null && (!Number.isInteger(amountMinor) || amountMinor < 0))) return deny('invalid');
      const c = s.indicativeCosts.find((x) => x.objectiveId === o.id && x.financialYear === year);
      if (amountMinor === null) {
        if (c) removeRecord(s.indicativeCosts, 'IndicativeCost', c);
      } else if (c) {
        const before = structuredClone(c);
        c.amount = { amountMinor: amountMinor, currency };
        touch('IndicativeCost', c, before);
      } else {
        const n = { ...base(), id: nextId('ic', s.indicativeCosts) as Id<'IndicativeCost'>, objectiveId: o.id, financialYear: year, amount: { amountMinor: amountMinor, currency } };
        s.indicativeCosts.push(n);
        record('IndicativeCost', n.id, n);
      }
      changed();
      return { ok: true };
    },
    setEnvelope(goalId, year, amountMinor) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      if (goalId !== null && !goalOf(goalId)) return deny('not_found');
      if (!can(s, viewer, 'draft', { type: 'ResourceEnvelope', id: goalId ?? g.p.id })) return deny();
      if (!years(g.p).includes(year) || (amountMinor !== null && (!Number.isInteger(amountMinor) || amountMinor < 0))) return deny('invalid');
      const e = s.resourceEnvelopes.find((x) => x.planId === g.p.id && x.goalId === goalId && x.financialYear === year);
      if (amountMinor === null) {
        if (e) removeRecord(s.resourceEnvelopes, 'ResourceEnvelope', e);
      } else if (e) {
        const before = structuredClone(e);
        e.amount = { amountMinor, currency };
        touch('ResourceEnvelope', e, before);
      } else {
        const n = { ...base(), id: nextId('re', s.resourceEnvelopes) as Id<'ResourceEnvelope'>, planId: g.p.id, goalId: goalId as Id<'Goal'> | null, financialYear: year, amount: { amountMinor, currency } };
        s.resourceEnvelopes.push(n);
        record('ResourceEnvelope', n.id, n);
      }
      changed();
      return { ok: true };
    },

    /* ───────── Decision-map rows (D11d-9) ───────── */

    async suggestRows(objectiveId) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const o = objectiveOf(objectiveId);
      if (!o) return deny('not_found');
      if (!mayRows(o.id)) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const cards = forAi(o.fourQEntryIds);
      const t = task('draft', [{ type: 'Objective', id: o.id }, ...cards.map((c) => ({ type: 'FourQEntry', id: c.id }))]);
      const out = await aiStub.suggestDeficiencyRows(s.organisation.id, cards);
      let added = 0;
      for (const row of out.rows) {
        if (s.deficiencies.some((d) => d.objectiveId === o.id && d.description === row.description)) continue;
        const d: Deficiency = {
          ...base(), id: nextId('df', s.deficiencies) as Id<'Deficiency'>, objectiveId: o.id, level: row.level, description: row.description,
          probableCause: '', effects: '', correctiveActivityIds: [], timeframe: '', draft: aiDraft(t),
        };
        s.deficiencies.push(d);
        t.outputRefs.push({ type: 'Deficiency', id: d.id });
        record('Deficiency', d.id, d);
        added++;
      }
      changed();
      return { ok: true, added };
    },
    addRow(objectiveId, input) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const o = objectiveOf(objectiveId);
      if (!o) return deny('not_found');
      if (!mayRows(o.id)) return deny();
      if (!input.description.trim()) return deny('required');
      const d: Deficiency = {
        ...base(), id: nextId('df', s.deficiencies) as Id<'Deficiency'>, objectiveId: o.id, level: input.level, description: input.description.trim(),
        probableCause: '', effects: '', correctiveActivityIds: [], timeframe: '', draft: decidedNow(),
      };
      s.deficiencies.push(d);
      record('Deficiency', d.id, d);
      changed();
      return { ok: true, id: d.id };
    },
    acceptRow(id) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const d = s.deficiencies.find((x) => x.id === id && objectiveOf(x.objectiveId));
      if (!d) return deny('not_found');
      if (!mayRows(d.objectiveId)) return deny();
      const before = structuredClone(d);
      d.draft = { ...d.draft, state: 'accepted', decided: stamp() };
      touch('Deficiency', d, before);
      changed();
      return { ok: true };
    },
    addCorrective(rowId, input) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const d = s.deficiencies.find((x) => x.id === rowId && objectiveOf(x.objectiveId));
      if (!d) return deny('not_found');
      if (!mayRows(d.objectiveId) || !can(s, viewer, 'draft', { type: 'Activity', id: d.objectiveId })) return deny();
      if (!r().kpis.some((k) => k.id === input.kpiId && k.objectiveId === d.objectiveId)) return deny('invalid');
      if (!years(g.p).includes(input.year)) return deny('invalid');
      if (!input.title.trim() || !input.evidence.trim()) return deny('required');
      if (!s.positions.some((p) => p.id === input.ownerPositionId)) return deny('required');
      const code = nextActivityCode(s, input.kpiId);
      const a: Activity = {
        ...base(), id: nextId('a', s.activities) as Id<'Activity'>, kpiId: input.kpiId as Id<'Kpi'>, financialYear: input.year, code, title: input.title.trim(),
        decisionLevel: input.level, ownerPositionId: input.ownerPositionId as Id<'Position'>, reportingFrequency: 'quarterly', evidence: input.evidence.trim(),
        quantityTarget: null, dependsOn: [], status: 'planned', draft: decidedNow(),
      };
      s.activities.push(a);
      record('Activity', a.id, a);
      const before = { correctiveActivityIds: [...d.correctiveActivityIds] };
      d.correctiveActivityIds = [...d.correctiveActivityIds, a.id];
      d.updated = stamp();
      audit('update', { type: 'Deficiency', id: d.id }, before, { correctiveActivityIds: [...d.correctiveActivityIds] });
      changed();
      return { ok: true, id: a.id, code };
    },
    unlinkCorrective(rowId, activityId) {
      const g = opened();
      if ('error' in g) return deny(g.error);
      const d = s.deficiencies.find((x) => x.id === rowId && objectiveOf(x.objectiveId));
      if (!d) return deny('not_found');
      if (!mayRows(d.objectiveId)) return deny();
      if (!d.correctiveActivityIds.includes(activityId as Id<'Activity'>)) return deny('not_found');
      const before = { correctiveActivityIds: [...d.correctiveActivityIds] };
      d.correctiveActivityIds = d.correctiveActivityIds.filter((x) => x !== activityId);
      d.updated = stamp();
      audit('update', { type: 'Deficiency', id: d.id }, before, { correctiveActivityIds: [...d.correctiveActivityIds] });
      changed();
      return { ok: true };
    },

    /* ───────── Wording (AI suggestions, D11d-8) ───────── */

    async reviewWording() {
      const g = ready();
      if ('error' in g) return deny(g.error);
      if (!runs) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const objectives = r().objectives;
      task('language_review', objectives.map((o) => ({ type: 'Objective', id: o.id })));
      const out = await aiStub.reviewWording(objectives.map((o) => ({ id: o.id, title: o.title })));
      const w = notesOf(s).wording;
      w.clear();
      for (const n of out.notes) w.set(n.id, n.text);
      changed();
      return { ok: true, notes: out.notes.length };
    },

    /* ───────── Confirming the plan (D11d-10) ───────── */

    send() {
      const g = ready();
      if ('error' in g) return deny(g.error);
      if (!runs) return deny();
      if (sentBy(s, g.p)) return deny('invalid');
      const c = planChecks(s, g.p, g.p.startYear);
      if (c.must.length) return deny('not_ready', c.must);
      audit('submit', { type: 'StrategicPlan', id: g.p.id }, null, { goals: r().goals.length, objectives: r().objectives.length, kpis: r().kpis.length });
      changed();
      return { ok: true };
    },
    confirmPlan(board) {
      const g = ready();
      if ('error' in g) return deny(g.error);
      const p = g.p;
      if (!can(s, viewer, 'confirm', { type: 'StrategicPlan', id: p.id })) return deny();
      const sender = sentBy(s, p);
      if (!sender) return deny('not_ready');
      if (sender === viewer.membershipId) return deny('same_person'); // B7: whoever submits a gate cannot approve it
      const boardRequired = s.organisation.settings.boardApprovalRequired.plan;
      if (boardRequired && (!board || !board.resolutionRef.trim() || !board.date)) return deny('board_required');
      const c = planChecks(s, p, p.startYear);
      const blocked = c.must.length > 0 || !c.gate.passes;
      const event: GateEvent = {
        id: nextId('ge', s.gateEvents) as Id<'GateEvent'>, orgId: s.organisation.id, gate: 'plan.confirm', subject: { type: 'StrategicPlan', id: p.id },
        attempted: stamp(), ...gateRecord(s, c.gate), outcome: blocked ? 'blocked' : 'passed',
      };
      s.gateEvents.push(event);
      if (blocked) { changed(); return deny('blocked', c.must); }
      const before = structuredClone(p);
      p.confirmation = stamp();
      p.boardApproval = boardRequired && board ? { resolutionRef: board.resolutionRef.trim(), date: board.date } : null;
      p.status = statusOnConfirm(s, p, financialYearNow());
      p.updated = stamp();
      audit('confirm', { type: 'StrategicPlan', id: p.id }, before, structuredClone(p));
      changed();
      return { ok: true };
    },
  };

  function themesOfPlan(p: StrategicPlan) { return s.themes.filter((t) => t.planId === p.id); }
  function financialYearNow(): number { return financialYearOf(now, s.organisation.financialYearStartMonth); }
}

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, 'en', { numeric: true });
