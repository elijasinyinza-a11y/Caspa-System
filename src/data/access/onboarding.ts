/**
 * Onboarding through the data-access layer (slice 8; Onboarding Specification v0.1, decisions O1 to O9).
 *
 * The plan being brought in is stored as records from the start: a StrategicPlan in "draft" and goals, objectives,
 * KPIs and activities carrying the contract's DraftMeta. Every screen reads only the active plan, so nothing shows
 * elsewhere until the Executive confirms it. Permissions follow the matrix: the Strategy office or a facilitator
 * drafts (O1), the Executive confirms and types the vision and mission (O9), the Strategy office publishes (O5).
 */
import type {
  Activity, AuditEntry, BaselineMeasure, DraftMeta, GateEvent, Goal, Id, ISODate, ISODateTime, Kpi, KpiTarget, Objective, PerspectiveKey, SixPLevel,
  SourceDocument, AiTask, StrategicPlan, VisionStatement,
} from '../../contract/caspa-data-contract';
import { aiStub, SAMPLE_PLAN_DRAFT, type PlanDraft } from '../../ai';
import { checkGate, gateRecord } from '../../rules/gate';
import { computeFindings } from '../../rules/integrity';
import {
  gettingStarted, isPublished, matchOwner, numberCodes, onboardingPlan, planChecks, planRecords, rowProblems, sentBy, statusOnConfirm,
  type PlanItemKind, type PlanMust, type PlanRow, type PlanRowProblem, type PositionRef, type Step,
} from '../../rules/onboarding';
import { dateInZone, formatFinancialYear } from '../../selectors/format';
import { en } from '../../strings/en';
import type { Store } from './store';
import type { Viewer } from './viewer';
import { structureConfirmation } from './setup/confirmation';

/* ───────── Reading the template (O3) ───────── */

const T = () => en.onboarding.template;
const norm = (v: string | undefined) => (v ?? '').trim();
const lower = (v: string | undefined) => norm(v).toLowerCase();

/** A date as ISO, from "2025-12-31", "31/12/2025" or a spreadsheet's day number. */
export function readDate(v: string): ISODate | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t as ISODate;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` as ISODate;
  if (/^\d{5}(\.\d+)?$/.test(t)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000).toISOString().slice(0, 10) as ISODate;
  return null;
}
const num = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v.replace(/,/g, ''))) ? null : Number(v.replace(/,/g, '')));

/** The template's rows into plan rows. Unknown types are skipped; blank rows ignored. Row numbers count the header as 1. */
export function readPlanSheet(sheet: string[][], terms: Store['organisation']['termLabels'], perspectives: Store['organisation']['perspectives']): PlanRow[] {
  const kinds = new Map<string, PlanItemKind>();
  for (const [k, sys] of [['goal', 'goal'], ['objective', 'objective'], ['kpi', 'kpi'], ['activity', 'activity']] as const) {
    kinds.set(k, sys);
    kinds.set(terms[sys].singular.toLowerCase(), sys);
  }
  const levels = new Map((Object.entries(en.sixP) as [SixPLevel, string][]).map(([k, label]) => [label.toLowerCase(), k]));
  levels.set('procedures', 'procedures');
  const persp = new Map<string, PerspectiveKey>((perspectives ?? []).flatMap((p) => [[p.label.toLowerCase(), p.key], [p.key, p.key]] as [string, PerspectiveKey][]));
  const start = sheet.length && lower(sheet[0]![0]) === T().columns[0].toLowerCase() ? 1 : 0;
  const rows: PlanRow[] = [];
  for (let i = start; i < sheet.length; i++) {
    const c = (sheet[i] ?? []).map((x) => x ?? '');
    if (c.every((x) => !x.trim())) continue;
    const kind = kinds.get(lower(c[0]));
    if (!kind || !norm(c[2])) continue;
    const row: PlanRow = { kind, code: norm(c[1]) || null, title: norm(c[2]), partOf: norm(c[3]) || null, owner: norm(c[4]), page: null, row: i + 1 };
    if (kind === 'goal') row.perspective = persp.get(lower(c[5])) ?? null;
    if (kind === 'kpi') {
      row.kpi = {
        unit: norm(c[6]), direction: /lower/i.test(c[7] ?? '') ? 'lower_is_better' : 'higher_is_better',
        aggregation: lower(c[8]) === 'sum' ? 'sum' : lower(c[8]) === 'average' ? 'average' : 'latest',
        baseline: num(c[9] ?? ''), baselineAsOf: readDate(c[10] ?? ''), target: num(c[11] ?? ''),
      };
    }
    if (kind === 'activity') row.activity = { level: levels.get(lower(c[12])) ?? null, quantity: num(c[13] ?? ''), quantityUnit: norm(c[14]) };
    rows.push(row);
  }
  return rows;
}

/** A plan draft from the AI, as rows. */
export const rowsOfDraft = (d: PlanDraft): PlanRow[] =>
  d.items.map((x) => ({
    kind: x.kind, code: x.code, title: x.title, partOf: x.partOf, owner: x.owner, page: x.page, row: null, perspective: x.perspective ?? null,
    kpi: x.kpi && { ...x.kpi, baselineAsOf: x.kpi.baselineAsOf as ISODate | null },
    activity: x.activity && { level: x.activity.level, quantity: x.activity.quantity, quantityUnit: x.activity.quantityUnit },
  }));

/** A plan as template rows (the sample spreadsheet, and downloads). */
export function rowsToSheet(rows: PlanRow[], terms: Store['organisation']['termLabels'], perspectives: Store['organisation']['perspectives']): string[][] {
  const p = new Map((perspectives ?? []).map((x) => [x.key, x.label]));
  return [[...T().columns], ...rows.map((r) => [
    terms[r.kind].singular, r.code ?? '', r.title, r.partOf ?? '', r.owner, r.perspective ? p.get(r.perspective) ?? '' : '',
    r.kpi?.unit ?? '', r.kpi ? (r.kpi.direction === 'lower_is_better' ? T().lower : T().higher) : '', r.kpi?.aggregation ?? '',
    r.kpi?.baseline === null || r.kpi?.baseline === undefined ? '' : String(r.kpi.baseline), r.kpi?.baselineAsOf ?? '',
    r.kpi?.target === null || r.kpi?.target === undefined ? '' : String(r.kpi.target),
    r.activity?.level ? en.sixP[r.activity.level] : '', r.activity?.quantity === null || r.activity?.quantity === undefined ? '' : String(r.activity.quantity), r.activity?.quantityUnit ?? '',
  ])];
}

/* ───────── The page ───────── */

export type ItemType = 'Goal' | 'Objective' | 'Kpi' | 'Activity';
export interface PlanItemView {
  type: ItemType; kind: PlanItemKind; id: string; code: string; title: string; parentId: string | null;
  owner: { positionId: string; label: string; holder: string | null } | null;
  /** The owner as written in the plan, when it matched no position. */
  ownerText: string | null;
  draft: DraftMeta['state'];
  page: number | null;
  perspective: PerspectiveKey | null;
  kpi: { unit: string; direction: Kpi['direction']; aggregation: Kpi['aggregation']; baseline: number | null; baselineAsOf: ISODate | null; validated: boolean | null; target: number | null } | null;
  activity: { level: SixPLevel | null; quantity: number | null; unit: string } | null;
}

export interface OnboardingPage {
  structureConfirmed: boolean;
  /** "Getting started" for the Executive, Strategy office and administrator; empty for others or once published. */
  steps: Step[];
  /** Who sets up and brings the plan in (O1). */
  canSetUp: boolean;
  isExecutive: boolean;
  strategyOffice: string | null;
  plan: null | {
    id: string; title: string; startYear: number; endYear: number; label: string; status: StrategicPlan['status']; door: StrategicPlan['entryDoor'];
    processOwner: string | null; sentBy: string | null; confirmed: { by: string; on: ISODate; ref: string | null } | null; published: boolean;
    boardApprovalRequired: boolean;
  };
  items: PlanItemView[];
  problems: PlanRowProblem[];
  must: PlanMust[];
  worth: { key: string; message: string }[];
  publishBlocks: { key: string; message: string; subject: { type: string; id: string } }[];
  noVisionOrMission: boolean;
  vision: string;
  mission: string;
  sheet: { rows: number; goals: number; objectives: number; kpis: number; activities: number } | null;
  ai: { fileName: string } | null;
  positions: { id: string; label: string; holder: string | null }[];
  financialYear: number;
  /** What the screens need of the organisation's settings. */
  /** Whether board approval is needed for a plan (settings), for plan setup before a plan exists. */
  boardApprovalForNew: boolean;
  org: { fyStartMonth: number; aiEnabled: boolean; termLabels: Store['organisation']['termLabels']; perspectives: Store['organisation']['perspectives'] };
}

export interface SetupInput { title: string; startYear: number; endYear: number; processOwnerPositionId: string | null }
export interface ItemInput {
  title?: string; ownerPositionId?: string | null; perspective?: PerspectiveKey | null;
  baseline?: number | null; target?: number | null; level?: SixPLevel | null; quantity?: number | null; quantityUnit?: string;
}
export type OnboardingError = 'not_allowed' | 'not_found' | 'not_draft' | 'not_ready' | 'board_required' | 'same_person' | 'not_active' | 'blocked' | 'period';
export type OnboardingResult<T = object> = ({ ok: true } & T) | { ok: false; error: OnboardingError; detail?: unknown };

export interface OnboardingAccess {
  page(): OnboardingPage;
  setupPlan(input: SetupInput): OnboardingResult<{ id: string }>;
  importSheet(sheet: string[][]): OnboardingResult<{ problems: number }>;
  draftFromDocument(fileName: string): Promise<OnboardingResult>;
  sampleSheet(): string[][];
  addItem(kind: PlanItemKind, parentId: string | null): OnboardingResult<{ id: string }>;
  saveItem(type: ItemType, id: string, input: ItemInput): OnboardingResult;
  removeItem(type: ItemType, id: string): OnboardingResult;
  accept(type: ItemType, id: string): OnboardingResult;
  validateBaseline(kpiId: string): OnboardingResult;
  validateAllBaselines(): OnboardingResult<{ count: number }>;
  saveVision(kind: 'vision' | 'mission', text: string): OnboardingResult;
  send(): OnboardingResult;
  confirm(board: { resolutionRef: string; date: ISODate } | null): OnboardingResult;
  publish(): OnboardingResult<{ blocking: number }>;
}

interface Ctx {
  s: Store; viewer: Viewer; now: ISODate; financialYear: number; clock: () => ISODateTime;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  onChange?: () => void;
}

/** Owners as written that matched nothing, and the last import's summary, kept beside the store (not records). */
const notes = new WeakMap<Store, { ownerText: Map<string, string>; sheet: OnboardingPage['sheet']; ai: { fileName: string } | null }>();
const noteOf = (s: Store) => notes.get(s) ?? notes.set(s, { ownerText: new Map(), sheet: null, ai: null }).get(s)!;

export function createOnboardingAccess(ctx: Ctx): OnboardingAccess {
  const { s, viewer, now, financialYear: fy, clock, audit } = ctx;
  const can = (r: string) => viewer.roles.includes(r as never);
  const canSetUp = can('strategy_office') || can('facilitator');
  const isExecutive = can('executive');
  const changed = () => ctx.onChange?.();
  const stamp = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const base = () => ({ orgId: s.organisation.id, created: stamp(), updated: stamp() });
  const key = (s.organisation.id as string).replace(/^org-/, '');
  let seq = 0;
  const nextId = (prefix: string) => {
    const used = new Set<string>([...s.goals, ...s.objectives, ...s.kpis, ...s.activities, ...s.kpiTargets, ...s.baselineMeasures, ...s.plans].map((x) => x.id as string));
    let id: string;
    do id = `${prefix}-${key}-${++seq}`; while (used.has(id));
    return id;
  };
  const personOf = (mid: string) => s.people.find((p) => p.id === s.memberships.find((m) => m.id === mid)?.personId)?.fullName ?? mid;
  const on = (at: string) => dateInZone(at, s.organisation.timeZone);
  const deny = <T,>(error: OnboardingError = 'not_allowed', detail?: unknown): OnboardingResult<T> => ({ ok: false, error, detail });

  const current = () => s.assignments.filter((a) => a.from <= now && (a.to === null || a.to >= now));
  const holderOf = (pid: string) => {
    const a = current().find((x) => x.positionId === pid);
    return a ? s.people.find((p) => p.id === a.personId)?.fullName ?? null : null;
  };
  const unitName = (u: string) => s.units.find((x) => x.id === u)?.name ?? '';
  const positionRefs = (): PositionRef[] => s.positions.map((p) => ({ id: p.id, title: p.title, unitName: unitName(p.unitId) }));
  const labelOf = (pid: string) => {
    const p = s.positions.find((x) => x.id === pid);
    if (!p) return pid;
    return s.positions.filter((x) => x.title === p.title).length > 1 ? `${p.title}, ${unitName(p.unitId)}` : p.title;
  };

  const plan = () => onboardingPlan(s);
  const draftPlan = () => {
    const p = plan();
    return p && p.status === 'draft' ? p : null;
  };
  const records = () => {
    const p = plan();
    return p ? planRecords(s, p.id) : { goals: [], objectives: [], kpis: [], activities: [] };
  };
  const find = (type: ItemType, id: string) => {
    const r = records();
    const list = { Goal: r.goals, Objective: r.objectives, Kpi: r.kpis, Activity: r.activities }[type] as (Goal | Objective | Kpi | Activity)[];
    return list.find((x) => x.id === id);
  };
  const decided = (x: { draft: DraftMeta }) => {
    if (x.draft.state === 'ai_draft') x.draft = { ...x.draft, state: 'accepted', decided: stamp() };
  };

  /** Remove every record of a plan's content, before an import replaces it. */
  const clearContent = (planId: string) => {
    const r = planRecords(s, planId);
    const kpiIds = new Set(r.kpis.map((k) => k.id as string));
    const drop = new Set<string>([...r.goals, ...r.objectives, ...r.kpis, ...r.activities].map((x) => x.id));
    const measures = new Set(r.kpis.flatMap((k) => (k.baselineMeasureId ? [k.baselineMeasureId as string] : [])));
    s.goals = s.goals.filter((x) => !drop.has(x.id));
    s.objectives = s.objectives.filter((x) => !drop.has(x.id));
    s.kpis = s.kpis.filter((x) => !drop.has(x.id));
    s.activities = s.activities.filter((x) => !drop.has(x.id));
    s.kpiTargets = s.kpiTargets.filter((t) => !kpiIds.has(t.kpiId));
    s.baselineMeasures = s.baselineMeasures.filter((m) => !measures.has(m.id));
  };

  /** Rows into records under the draft plan. Owners matched by rules; unmatched ones noted as rows to fix. */
  const write = (planId: string, rowsIn: PlanRow[], draft: (r: PlanRow) => DraftMeta, sourceDescription: string) => {
    const rows = numberCodes(rowsIn);
    const refs = positionRefs();
    const n = noteOf(s);
    n.ownerText.clear();
    const idOf = new Map<string, string>();
    const owner = (r: PlanRow, id: string) => {
      const m = matchOwner(refs, r.owner);
      if ('positionId' in m) return m.positionId as Id<'Position'>;
      if (r.owner.trim()) n.ownerText.set(id, r.owner);
      return null;
    };
    for (const r of rows) {
      const parentId = r.partOf ? idOf.get(r.partOf) : undefined;
      if (r.kind === 'goal') {
        const id = nextId('g');
        s.goals.push({ ...base(), id: id as Id<'Goal'>, planId: planId as Id<'StrategicPlan'>, code: r.code!, title: r.title, perspective: r.perspective ?? null, ownerPositionId: owner(r, id), themeIds: [], fourQEntryIds: [], draft: draft(r) });
        idOf.set(r.code!, id);
      } else if (r.kind === 'objective' && parentId) {
        const id = nextId('o');
        s.objectives.push({ ...base(), id: id as Id<'Objective'>, goalId: parentId as Id<'Goal'>, code: r.code!, title: r.title, ownerPositionId: owner(r, id), proposedByPositionId: null, fourQEntryIds: [], draft: draft(r) });
        idOf.set(r.code!, id);
      } else if (r.kind === 'kpi' && parentId) {
        const id = nextId('k');
        const k = r.kpi ?? { unit: '', direction: 'higher_is_better' as const, aggregation: 'latest' as const, baseline: null, baselineAsOf: null, target: null };
        let measureId: Id<'BaselineMeasure'> | null = null;
        if (k.baseline !== null) {
          const m: BaselineMeasure = { ...base(), id: nextId('bm') as Id<'BaselineMeasure'>, planId: planId as Id<'StrategicPlan'>, name: r.title, unit: k.unit, value: k.baseline, asOf: (k.baselineAsOf ?? now) as ISODate, sourceDescription, validated: null, draft: draft(r) };
          s.baselineMeasures.push(m);
          measureId = m.id;
        }
        s.kpis.push({
          ...base(), id: id as Id<'Kpi'>, objectiveId: parentId as Id<'Objective'>, code: r.code!, name: r.title, unit: k.unit, direction: k.direction, aggregation: k.aggregation,
          baseline: k.baseline, baselineMeasureId: measureId, milestones: [], reportingFrequency: 'quarterly', ownerPositionId: owner(r, id), draft: draft(r),
        });
        if (k.target !== null) s.kpiTargets.push({ ...base(), id: nextId('kt') as Id<'KpiTarget'>, kpiId: id as Id<'Kpi'>, financialYear: fy, target: k.target } satisfies KpiTarget);
        idOf.set(r.code!, id);
      } else if (r.kind === 'activity' && parentId) {
        const id = nextId('a');
        const a = r.activity ?? { level: null, quantity: null, quantityUnit: '' };
        s.activities.push({
          ...base(), id: id as Id<'Activity'>, kpiId: parentId as Id<'Kpi'>, financialYear: fy, code: r.code!, title: r.title, decisionLevel: a.level, ownerPositionId: owner(r, id),
          reportingFrequency: 'quarterly', evidence: '', quantityTarget: a.quantity === null ? null : { value: a.quantity, unit: a.quantityUnit }, dependsOn: [], status: 'planned', draft: draft(r),
        });
        idOf.set(r.code!, id);
      }
    }
    return rows;
  };

  const viewOf = (): PlanItemView[] => {
    const r = records();
    const n = noteOf(s);
    const own = (pid: Id<'Position'> | null) => (pid ? { positionId: pid as string, label: labelOf(pid), holder: holderOf(pid) } : null);
    const page = (d: DraftMeta) => (d.provenance.kind === 'document' ? d.provenance.page : null);
    const out: PlanItemView[] = [];
    const common = (x: Goal | Objective | Kpi | Activity) => ({ id: x.id as string, owner: own(x.ownerPositionId), ownerText: n.ownerText.get(x.id) ?? null, draft: x.draft.state, page: page(x.draft) });
    for (const g of r.goals) out.push({ ...common(g), type: 'Goal', kind: 'goal', code: g.code, title: g.title, parentId: null, perspective: g.perspective, kpi: null, activity: null });
    for (const o of r.objectives) out.push({ ...common(o), type: 'Objective', kind: 'objective', code: o.code, title: o.title, parentId: o.goalId, perspective: null, kpi: null, activity: null });
    for (const k of r.kpis) {
      const m = k.baselineMeasureId ? s.baselineMeasures.find((b) => b.id === k.baselineMeasureId) : undefined;
      out.push({
        ...common(k), type: 'Kpi', kind: 'kpi', code: k.code, title: k.name, parentId: k.objectiveId, perspective: null, activity: null,
        kpi: { unit: k.unit, direction: k.direction, aggregation: k.aggregation, baseline: k.baseline, baselineAsOf: m?.asOf ?? null, validated: m ? m.validated !== null : null, target: s.kpiTargets.find((t) => t.kpiId === k.id && t.financialYear === fy)?.target ?? null },
      });
    }
    for (const a of r.activities) out.push({ ...common(a), type: 'Activity', kind: 'activity', code: a.code, title: a.title, parentId: a.kpiId, perspective: null, kpi: null, activity: { level: a.decisionLevel, quantity: a.quantityTarget?.value ?? null, unit: a.quantityTarget?.unit ?? '' } });
    return out;
  };

  const page = (): OnboardingPage => {
    const p = plan();
    const confirmed = !!structureConfirmation(s);
    const sees = canSetUp || isExecutive || can('org_admin');
    const strategyMember = s.memberships.find((m) => m.status === 'active' && m.roles.includes('strategy_office'));
    const confirmEvent = p ? s.gateEvents.filter((g) => g.gate === 'plan.confirm' && g.outcome === 'passed' && g.subject.id === p.id).pop() : undefined;
    const checks = p ? planChecks(s, p, fy) : null;
    const items = p ? viewOf() : [];
    const vs = (kind: 'vision' | 'mission') => (p ? s.visionStatements.find((v) => v.planId === p.id && v.kind === kind)?.text ?? '' : '');
    const n = noteOf(s);
    return {
      structureConfirmed: confirmed,
      steps: sees ? gettingStarted(s, fy, now, confirmed) : [],
      canSetUp, isExecutive,
      strategyOffice: strategyMember ? personOf(strategyMember.id) : null,
      plan: p && {
        id: p.id, title: p.title, startYear: p.startYear, endYear: p.endYear, status: p.status, door: p.entryDoor,
        label: `${formatFinancialYear(p.startYear, s.organisation.financialYearStartMonth)} to ${formatFinancialYear(p.endYear, s.organisation.financialYearStartMonth)}`,
        processOwner: p.processOwnerPositionId ? `${labelOf(p.processOwnerPositionId)} (${holderOf(p.processOwnerPositionId) ?? en.onboarding.vacant})` : null,
        sentBy: (() => { const m = sentBy(s, p); return m ? personOf(m) : null; })(),
        confirmed: p.confirmation ? { by: personOf(p.confirmation.byMembershipId), on: on(p.confirmation.at), ref: p.boardApproval?.resolutionRef ?? null } : confirmEvent ? { by: personOf(confirmEvent.attempted.byMembershipId), on: on(confirmEvent.attempted.at), ref: null } : null,
        published: isPublished(s, p.id),
        boardApprovalRequired: s.organisation.settings.boardApprovalRequired.plan,
      },
      items,
      problems: p && p.status === 'draft' ? rowProblems(items.filter((i) => i.ownerText && !i.owner).map((i) => ({ kind: i.kind, code: i.code, title: i.title, partOf: null, owner: i.ownerText!, page: null, row: null })), positionRefs()).filter((x) => x.kind !== 'parent_missing') : [],
      must: checks?.must ?? [],
      worth: (checks?.worth ?? []).map((f) => ({ key: f.key, message: f.message })),
      publishBlocks: (checks?.publishBlocks ?? []).map((f) => ({ key: f.key, message: f.message, subject: f.subject })),
      noVisionOrMission: checks?.noVisionOrMission ?? false,
      vision: vs('vision'), mission: vs('mission'),
      sheet: p && p.status === 'draft' ? n.sheet : null,
      ai: p && p.status === 'draft' ? n.ai : null,
      positions: s.positions.map((x) => ({ id: x.id, label: labelOf(x.id), holder: holderOf(x.id) })),
      financialYear: fy,
      boardApprovalForNew: s.organisation.settings.boardApprovalRequired.plan,
      org: { fyStartMonth: s.organisation.financialYearStartMonth, aiEnabled: s.organisation.settings.aiEnabled, termLabels: s.organisation.termLabels, perspectives: s.organisation.perspectives },
    };
  };

  const replaceContent = (rows: PlanRow[], draft: (r: PlanRow) => DraftMeta, source: string) => {
    const p = draftPlan()!;
    clearContent(p.id);
    write(p.id, rows, draft, source);
  };
  const counts = () => {
    const r = records();
    return { goals: r.goals.length, objectives: r.objectives.length, kpis: r.kpis.length, activities: r.activities.length };
  };

  return {
    page,

    setupPlan(input) {
      if (!canSetUp) return deny();
      if (input.endYear < input.startYear) return deny('period');
      const existing = draftPlan();
      if (existing) {
        const before = structuredClone(existing);
        Object.assign(existing, { title: input.title.trim() || existing.title, startYear: input.startYear, endYear: input.endYear, processOwnerPositionId: input.processOwnerPositionId, updated: stamp() });
        audit('update', { type: 'StrategicPlan', id: existing.id }, before, existing);
        changed();
        return { ok: true, id: existing.id };
      }
      if (plan()) return deny('not_draft');
      const p: StrategicPlan = {
        ...base(), id: nextId('plan') as Id<'StrategicPlan'>, title: input.title.trim() || en.onboarding.setup.defaultTitle, startYear: input.startYear, endYear: input.endYear,
        entryDoor: 'imported', status: 'draft', confirmation: null, boardApproval: null, formation: null,
        processOwnerPositionId: input.processOwnerPositionId as Id<'Position'> | null, calendar: null, currentRevision: 0,
      };
      s.plans.push(p);
      audit('create', { type: 'StrategicPlan', id: p.id }, null, p);
      changed();
      return { ok: true, id: p.id };
    },

    importSheet(sheet) {
      const p = draftPlan();
      if (!canSetUp) return deny();
      if (!p) return deny('not_draft');
      const rows = readPlanSheet(sheet, s.organisation.termLabels, s.organisation.perspectives);
      replaceContent(rows, () => ({ state: 'human', provenance: { kind: 'manual' }, decided: null }), en.onboarding.sourceSheet);
      const n = noteOf(s);
      n.sheet = { rows: rows.length, ...counts() };
      n.ai = null;
      changed();
      return { ok: true, problems: page().problems.length };
    },

    async draftFromDocument(fileName) {
      const p = draftPlan();
      if (!canSetUp) return deny();
      if (!p) return deny('not_draft');
      const d = await aiStub.draftPlan(fileName);
      const doc: SourceDocument = { ...base(), id: `sd-${s.sourceDocuments.length + 1}-${key}` as Id<'SourceDocument'>, title: fileName, kind: 'strategic_plan', fileRef: fileName };
      const task: AiTask = { orgId: s.organisation.id, id: `ai-${s.aiTasks.length + 1}-${key}` as Id<'AiTask'>, kind: 'extract', requested: stamp(), inputRefs: [{ type: 'SourceDocument', id: doc.id }], outputRefs: [], model: 'stub' };
      s.sourceDocuments.push(doc);
      s.aiTasks.push(task);
      replaceContent(rowsOfDraft(d), (r) => ({ state: 'ai_draft', provenance: { kind: 'document', sourceDocumentId: doc.id, page: r.page, excerpt: '' }, decided: null }), fileName);
      const r = records();
      task.outputRefs = [...r.goals, ...r.objectives, ...r.kpis, ...r.activities].map((x) => ({ type: 'draft', id: x.id }));
      const n = noteOf(s);
      n.ai = { fileName };
      n.sheet = null;
      changed();
      return { ok: true };
    },

    sampleSheet() {
      return rowsToSheet(rowsOfDraft(SAMPLE_PLAN_DRAFT), s.organisation.termLabels, s.organisation.perspectives);
    },

    addItem(kind, parentId) {
      const p = draftPlan();
      if (!canSetUp) return deny();
      if (!p) return deny('not_draft');
      const r = records();
      const parent = parentId ? [...r.goals, ...r.objectives, ...r.kpis].find((x) => x.id === parentId) : undefined;
      if (kind !== 'goal' && !parent) return deny('not_found');
      // Codes numbered under the parent, after those already used (O3).
      const taken: PlanRow[] = [...r.goals, ...r.objectives, ...r.kpis, ...r.activities].map((x) => ({ kind: 'goal', code: x.code, title: '', partOf: null, owner: '', page: null, row: null }));
      const code = numberCodes([...taken, { kind, code: null, title: '', partOf: parent?.code ?? null, owner: '', page: null, row: null }]).pop()!.code!;
      const d: DraftMeta = { state: 'human', provenance: { kind: 'manual' }, decided: null };
      const title = en.onboarding.newItem[kind];
      let id: string;
      if (kind === 'goal') {
        id = nextId('g');
        s.goals.push({ ...base(), id: id as Id<'Goal'>, planId: p.id, code, title, perspective: null, ownerPositionId: null, themeIds: [], fourQEntryIds: [], draft: d });
      } else if (kind === 'objective') {
        id = nextId('o');
        s.objectives.push({ ...base(), id: id as Id<'Objective'>, goalId: parentId as Id<'Goal'>, code, title, ownerPositionId: null, proposedByPositionId: null, fourQEntryIds: [], draft: d });
      } else if (kind === 'kpi') {
        id = nextId('k');
        s.kpis.push({ ...base(), id: id as Id<'Kpi'>, objectiveId: parentId as Id<'Objective'>, code, name: title, unit: '', direction: 'higher_is_better', aggregation: 'latest', baseline: null, baselineMeasureId: null, milestones: [], reportingFrequency: 'quarterly', ownerPositionId: null, draft: d });
      } else {
        id = nextId('a');
        s.activities.push({ ...base(), id: id as Id<'Activity'>, kpiId: parentId as Id<'Kpi'>, financialYear: fy, code, title, decisionLevel: null, ownerPositionId: null, reportingFrequency: 'quarterly', evidence: '', quantityTarget: null, dependsOn: [], status: 'planned', draft: d });
      }
      audit('create', { type: kind === 'kpi' ? 'Kpi' : kind[0]!.toUpperCase() + kind.slice(1), id }, null, { code, title });
      changed();
      return { ok: true, id };
    },

    saveItem(type, id, input) {
      const p = draftPlan();
      const confirmedCanFix = !p && canSetUp && type === 'Activity' && input.level !== undefined && Object.keys(input).length === 1;
      if (!canSetUp) return deny();
      if (!p && !confirmedCanFix) return deny('not_draft');
      const x = find(type, id);
      if (!x) return deny('not_found');
      const before = structuredClone(x);
      if (input.title !== undefined && input.title.trim()) { if (type === 'Kpi') (x as Kpi).name = input.title.trim(); else (x as Goal).title = input.title.trim(); }
      if (input.ownerPositionId !== undefined) { x.ownerPositionId = input.ownerPositionId as Id<'Position'> | null; if (input.ownerPositionId) noteOf(s).ownerText.delete(id); }
      if (type === 'Goal' && input.perspective !== undefined) (x as Goal).perspective = input.perspective;
      if (type === 'Activity') {
        const a = x as Activity;
        if (input.level !== undefined) a.decisionLevel = input.level;
        if (input.quantity !== undefined) a.quantityTarget = input.quantity === null ? null : { value: input.quantity, unit: input.quantityUnit ?? a.quantityTarget?.unit ?? '' };
      }
      if (type === 'Kpi') {
        const k = x as Kpi;
        if (input.baseline !== undefined && input.baseline !== k.baseline) {
          k.baseline = input.baseline;
          const m = k.baselineMeasureId ? s.baselineMeasures.find((b) => b.id === k.baselineMeasureId) : undefined;
          if (input.baseline === null) k.baselineMeasureId = null;
          else if (m) { m.value = input.baseline; m.validated = null; }
          else {
            const nm: BaselineMeasure = { ...base(), id: nextId('bm') as Id<'BaselineMeasure'>, planId: p!.id, name: k.name, unit: k.unit, value: input.baseline, asOf: now, sourceDescription: en.onboarding.sourceTyped, validated: null, draft: { state: 'human', provenance: { kind: 'manual' }, decided: null } };
            s.baselineMeasures.push(nm);
            k.baselineMeasureId = nm.id;
          }
        }
        if (input.target !== undefined) {
          const t = s.kpiTargets.find((y) => y.kpiId === k.id && y.financialYear === fy);
          if (input.target === null) s.kpiTargets = s.kpiTargets.filter((y) => y !== t);
          else if (t) t.target = input.target;
          else s.kpiTargets.push({ ...base(), id: nextId('kt') as Id<'KpiTarget'>, kpiId: k.id, financialYear: fy, target: input.target });
        }
      }
      decided(x);
      x.updated = stamp();
      audit('update', { type, id }, before, x);
      changed();
      return { ok: true };
    },

    removeItem(type, id) {
      const p = draftPlan();
      if (!canSetUp) return deny();
      if (!p) return deny('not_draft');
      const x = find(type, id);
      if (!x) return deny('not_found');
      const drop = new Set<string>([id]);
      for (let grew = true; grew;) {
        grew = false;
        for (const o of s.objectives) if (drop.has(o.goalId) && !drop.has(o.id)) { drop.add(o.id); grew = true; }
        for (const k of s.kpis) if (drop.has(k.objectiveId) && !drop.has(k.id)) { drop.add(k.id); grew = true; }
        for (const a of s.activities) if (drop.has(a.kpiId) && !drop.has(a.id)) { drop.add(a.id); grew = true; }
      }
      s.goals = s.goals.filter((y) => !drop.has(y.id));
      s.objectives = s.objectives.filter((y) => !drop.has(y.id));
      s.kpis = s.kpis.filter((y) => !drop.has(y.id));
      s.activities = s.activities.filter((y) => !drop.has(y.id));
      s.kpiTargets = s.kpiTargets.filter((t) => !drop.has(t.kpiId));
      audit('remove', { type, id }, x, null);
      changed();
      return { ok: true };
    },

    accept(type, id) {
      if (!canSetUp) return deny();
      if (!draftPlan()) return deny('not_draft');
      const x = find(type, id);
      if (!x) return deny('not_found');
      decided(x);
      const k = type === 'Kpi' ? (x as Kpi) : null;
      const m = k?.baselineMeasureId ? s.baselineMeasures.find((b) => b.id === k.baselineMeasureId) : undefined;
      if (m) decided(m);
      changed();
      return { ok: true };
    },

    validateBaseline(kpiId) {
      // BaselineMeasure approve: the Strategy office (matrix). A person vouches for it.
      if (!can('strategy_office')) return deny();
      const k = records().kpis.find((x) => x.id === kpiId);
      const m = k?.baselineMeasureId ? s.baselineMeasures.find((b) => b.id === k.baselineMeasureId) : undefined;
      if (!m) return deny('not_found');
      if (m.draft.state === 'ai_draft') return deny('not_ready');
      const before = structuredClone(m);
      m.validated = stamp();
      audit('approve', { type: 'BaselineMeasure', id: m.id }, before, m);
      changed();
      return { ok: true };
    },

    validateAllBaselines() {
      if (!can('strategy_office')) return deny();
      let count = 0;
      for (const k of records().kpis) {
        const m = k.baselineMeasureId ? s.baselineMeasures.find((b) => b.id === k.baselineMeasureId) : undefined;
        if (m && !m.validated && m.draft.state !== 'ai_draft') {
          const before = structuredClone(m);
          m.validated = stamp();
          audit('approve', { type: 'BaselineMeasure', id: m.id }, before, m);
          count++;
        }
      }
      changed();
      return { ok: true, count };
    },

    saveVision(kind, text) {
      // VisionStatement draft: the Executive only; the AI never drafts them (F1).
      const p = draftPlan();
      if (!isExecutive) return deny();
      if (!p) return deny('not_draft');
      const v = s.visionStatements.find((x) => x.planId === p.id && x.kind === kind);
      if (v) {
        const before = structuredClone(v);
        v.text = text.trim();
        v.updated = stamp();
        audit('update', { type: 'VisionStatement', id: v.id }, before, v);
      } else {
        const nv: VisionStatement = { ...base(), id: nextId('vs') as Id<'VisionStatement'>, planId: p.id, kind, text: text.trim(), confirmation: null };
        s.visionStatements.push(nv);
        audit('create', { type: 'VisionStatement', id: nv.id }, null, nv);
      }
      changed();
      return { ok: true };
    },

    send() {
      const p = draftPlan();
      if (!canSetUp) return deny();
      if (!p) return deny('not_draft');
      const c = planChecks(s, p, fy);
      if (c.must.length) return deny('not_ready', c.must);
      audit('submit', { type: 'StrategicPlan', id: p.id }, null, { counts: counts() });
      changed();
      return { ok: true };
    },

    confirm(board) {
      const p = draftPlan();
      if (!isExecutive) return deny();
      if (!p) return deny('not_draft');
      const sender = sentBy(s, p);
      if (!sender) return deny('not_ready');
      if (sender === viewer.membershipId) return deny('same_person'); // B7: whoever submits a gate cannot approve it
      if (s.organisation.settings.boardApprovalRequired.plan && (!board || !board.resolutionRef.trim() || !board.date)) return deny('board_required');
      const c = planChecks(s, p, fy);
      const blocked = c.must.length > 0 || !c.gate.passes;
      const event: GateEvent = { id: `ge-${s.gateEvents.length + 1}-${key}` as Id<'GateEvent'>, orgId: s.organisation.id, gate: 'plan.confirm', subject: { type: 'StrategicPlan', id: p.id }, attempted: stamp(), ...gateRecord(s, c.gate), outcome: blocked ? 'blocked' : 'passed' };
      s.gateEvents.push(event);
      if (blocked) { changed(); return deny('blocked', c.must); }
      const before = structuredClone(p);
      p.confirmation = stamp();
      p.boardApproval = s.organisation.settings.boardApprovalRequired.plan ? board : null;
      p.status = statusOnConfirm(s, p, fy);
      p.updated = stamp();
      // O9: an imported vision and mission are confirmed with the plan.
      for (const v of s.visionStatements.filter((x) => x.planId === p.id)) v.confirmation = stamp();
      audit('confirm', { type: 'StrategicPlan', id: p.id }, before, p);
      changed();
      return { ok: true };
    },

    publish() {
      const p = plan();
      if (!can('strategy_office')) return deny();
      if (!p || p.status !== 'active') return deny('not_active');
      if (isPublished(s, p.id)) return deny('not_draft');
      const r = planRecords(s, p.id);
      const ids = new Set<string>([...r.goals, ...r.objectives, ...r.kpis, ...r.activities].map((x) => x.id));
      const findings = computeFindings(s, { financialYear: fy }).filter((f) => ids.has(f.subject.id));
      const check = checkGate(findings, 'cascade.publish');
      s.gateEvents.push({ id: `ge-${s.gateEvents.length + 1}-${key}` as Id<'GateEvent'>, orgId: s.organisation.id, gate: 'cascade.publish', subject: { type: 'StrategicPlan', id: p.id }, attempted: stamp(), ...gateRecord(s, check) });
      changed();
      return { ok: true, blocking: check.blocking.length };
    },
  };
}

