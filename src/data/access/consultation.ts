/**
 * Strategy formation, part 11c: Consultation and Confirmation, through the data-access layer (Strategy Formation
 * Specification v1.0, F2 and F3; BUILD-BRIEF section 32; contract v1.6). Permissions follow the matrix:
 * - ConsultationRound: seen by all members; scheduled, opened and closed by the Strategy office or a facilitator.
 * - ConsultationInput: read by the round's audience, the Executive, the Strategy office and facilitators. Comments and
 *   ideas come from the audience, section meeting summaries from department heads, expert input from the Strategy
 *   office or a facilitator. Every screen shows the unit only (F-3); the author stays in the audit record.
 * - BaselineMeasure: seen by the Executive, the Strategy office and the measure's owner; the owner accepts or corrects
 *   it; the Strategy office validates it. The AI never validates.
 * - ComplianceItem: seen by all members; listed by the Strategy office or the compliance officer; flagged by
 *   department heads for their area; reviewed by the compliance officer only.
 * Every AI call is logged as an AiTask; every AI-drafted baseline is a draft until a person accepts or corrects it.
 */
import type {
  AiTask, AuditEntry, BaselineMeasure, ComplianceItem, ConsultationInput, ConsultationRound, DraftMeta, Id, ISODate, ISODateTime, Provenance, StrategicPlan,
} from '../../contract/caspa-data-contract';
import { aiStub } from '../../ai';
import { departments, departmentsHeadedBy } from '../../rules/conception';
import {
  authorUnit, baselineCounts, baselineOwnerPosition, baselinesOf, baselineState, canMoveRound, complianceCounts, complianceOf, currentRound, inAudience,
  inputsOf, isComplianceSource, isLiveBaseline, readBaselineRows, roundChecks, roundCounts, roundsOf, shownUnit, unitAndBelow,
  type BaselineRow, type BaselineState, type RoundMust,
} from '../../rules/consultation';
import { formingPlan } from '../../rules/formation';
import { dateInZone } from '../../selectors/format';
import { en } from '../../strings/en';
import { can } from './permissions';
import type { Store } from './store';
import type { Viewer } from './viewer';

type Stage = 'not_started' | 'open' | 'complete';
const has = (v: Viewer, r: string) => v.roles.includes(r as never);

/* ───────── Views ───────── */

export interface InputView {
  id: string;
  kind: ConsultationInput['kind'];
  text: string;
  /** The unit it is shown as (F-3); null for expert input or a member with no position. */
  unit: string | null;
  attachment: string | null;
  on: ISODate;
  /** Sent by this viewer: only they are told so. */
  mine: boolean;
}

export interface RoundView {
  id: string;
  status: ConsultationRound['status'];
  audience: 'all' | string[];
  opensOn: ISODate;
  closesOn: ISODate;
  counts: ReturnType<typeof roundCounts>;
}

export interface RoomPage {
  planId: string;
  planTitle: string;
  stage: Stage;
  aiEnabled: boolean;
  /** Strategy office or facilitator: schedules, opens and closes rounds and adds expert input. */
  canRun: boolean;
  round: RoundView | null;
  earlierRounds: number;
  /** Whether this viewer may read the round's inputs. */
  seesInputs: boolean;
  inputs: InputView[];
  /** In the audience of the open round. */
  canComment: boolean;
  /** Units a department head may record a section meeting for: their departments and every unit below. */
  meetingUnits: { id: string; name: string }[];
  /** The vision as confirmed by leadership; shown at Consultation only once confirmed (prototype). */
  vision: { vision: string; mission: string } | null;
  minGroup: number;
  /** For choosing a round's audience. */
  units: { id: string; name: string; parent: string | null }[];
}

export interface BaselineView {
  id: string;
  name: string;
  unit: string;
  value: number;
  asOf: ISODate;
  source: string;
  owner: { unitId: string; unit: string; position: string | null; holder: string | null } | null;
  state: BaselineState;
  fromAi: boolean;
  confirmed: { by: string; on: ISODate } | null;
  validated: { by: string; on: ISODate } | null;
  /** Owner or Strategy office: accept, correct or reject a draft; correct a confirmed value. */
  canDecide: boolean;
  canValidate: boolean;
  mine: boolean;
}

export interface BaselinePage {
  planId: string;
  stage: Stage;
  aiEnabled: boolean;
  /** Strategy office: adds, drafts from documents, imports, sets owners and validates. */
  canRun: boolean;
  /** Department heads may add measures for the units they answer for. */
  ownUnits: { id: string; name: string }[];
  counts: ReturnType<typeof baselineCounts>;
  rows: BaselineView[];
  /** Measures this viewer may not see (a count, never the text). */
  hidden: number;
  documents: { id: string; title: string }[];
  units: { id: string; name: string }[];
}

export interface ComplianceView {
  id: string;
  title: string;
  kind: ComplianceItem['kind'];
  source: string;
  fromDocument: boolean;
  flaggedBy: { unitId: string; name: string }[];
  outcome: ComplianceItem['outcome'];
  reviewed: { by: string; on: ISODate } | null;
  /** Departments this viewer may flag or unflag the item for. */
  canFlag: { unitId: string; name: string; flagged: boolean }[];
  canReview: boolean;
  canEdit: boolean;
}

export interface CompliancePage {
  planId: string;
  stage: Stage;
  aiEnabled: boolean;
  /** Strategy office or compliance officer. */
  canAdd: boolean;
  /** The compliance officer. */
  canReview: boolean;
  counts: ReturnType<typeof complianceCounts>;
  items: ComplianceView[];
  /** Laws, regulations, licences, policies and standards given for this plan, which the AI may read obligations from. */
  documents: { id: string; title: string }[];
}

export type ConsultationError = 'not_allowed' | 'not_found' | 'required' | 'ai_off' | 'locked' | 'not_open' | 'not_source' | 'not_ready';
export type ConsultationResult<T = object> = ({ ok: true } & T) | { ok: false; error: ConsultationError };

export interface BaselineInput { name: string; unit: string; value: number; asOf: ISODate; source: string; ownerUnitId: string | null }

export interface ConsultationAccess {
  room(): RoomPage | null;
  scheduleRound(input: { audienceUnitIds: string[] | 'all'; opensOn: ISODate; closesOn: ISODate }): ConsultationResult<{ id: string }> | { ok: false; error: 'checks'; checks: RoundMust[] };
  moveRound(id: string, to: 'open' | 'closed'): ConsultationResult;
  addInput(input: { kind: ConsultationInput['kind']; text: string; unitId?: string | null; attachment?: string | null }): ConsultationResult<{ id: string }>;
  groupInputs(): Promise<ConsultationResult<{ groups: { word: string; inputs: InputView[] }[]; single: InputView[] }>>;

  baselines(): BaselinePage | null;
  addBaseline(input: BaselineInput): ConsultationResult<{ id: string }>;
  decideBaseline(id: string, decision: 'accept' | 'reject'): ConsultationResult;
  correctBaseline(id: string, input: Omit<BaselineInput, 'ownerUnitId'>): ConsultationResult;
  setBaselineOwner(id: string, ownerUnitId: string | null): ConsultationResult;
  validateBaseline(id: string): ConsultationResult;
  draftBaselines(documentId: string): Promise<ConsultationResult<{ added: number; sameForAnyFile: boolean }>>;
  importBaselines(rows: string[][]): ConsultationResult<{ added: number; problems: BaselineRow[] }>;

  compliance(): CompliancePage | null;
  addCompliance(input: { title: string; kind: ComplianceItem['kind'] }): ConsultationResult<{ id: string }>;
  editCompliance(id: string, input: { title: string; kind: ComplianceItem['kind'] }): ConsultationResult;
  flagCompliance(id: string, unitId: string, flagged: boolean): ConsultationResult;
  reviewCompliance(id: string, outcome: NonNullable<ComplianceItem['outcome']>): ConsultationResult;
  draftCompliance(documentId: string): Promise<ConsultationResult<{ added: number; sameForAnyFile: boolean }>>;
}

interface Ctx {
  s: Store; viewer: Viewer; now: ISODate; clock: () => ISODateTime;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  onChange?: () => void;
}

export function createConsultationAccess(ctx: Ctx): ConsultationAccess {
  const { s, viewer, clock, audit, now } = ctx;
  const runs = has(viewer, 'strategy_office') || has(viewer, 'facilitator');
  const isSO = has(viewer, 'strategy_office');
  const changed = () => ctx.onChange?.();
  const stamp = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const base = () => ({ orgId: s.organisation.id, created: stamp(), updated: stamp() });
  const deny = <T,>(error: ConsultationError = 'not_allowed'): ConsultationResult<T> => ({ ok: false, error });
  const key = (s.organisation.id as string).replace(/^org-/, '');
  const nextId = (prefix: string, taken: { id: string }[]) => {
    const used = new Set(taken.map((x) => x.id));
    let n = taken.length;
    let id: string;
    do id = `${prefix}-${key}-${++n}`; while (used.has(id));
    return id;
  };
  const tz = s.organisation.timeZone;
  const plan = (): StrategicPlan | null => formingPlan(s);
  const stageOf = (p: StrategicPlan, st: 'consultation' | 'confirmation'): Stage => p.formation?.[st].status ?? 'not_started';
  const unitName = (u: string | null) => (u ? s.units.find((x) => x.id === u)?.name ?? '' : '');
  const personOf = (mid: string) => s.people.find((p) => p.id === s.memberships.find((m) => m.id === mid)?.personId)?.fullName ?? '';
  const holderOf = (pid: string | null) => {
    if (!pid) return null;
    const a = s.assignments.find((x) => x.positionId === pid && x.from <= now && (x.to === null || x.to >= now));
    return a ? s.people.find((p) => p.id === a.personId)?.fullName ?? null : null;
  };
  /** The position a membership's holder fills now, by title: how a hand-typed item says who added it. */
  const titleOf = (mid: string) => {
    const pid = s.memberships.find((m) => m.id === mid)?.personId;
    const a = s.assignments.find((x) => x.personId === pid && x.from <= now && (x.to === null || x.to >= now));
    return s.positions.find((p) => p.id === a?.positionId)?.title ?? personOf(mid);
  };
  const myDepts = () => departmentsHeadedBy(s, viewer.positionIds as string[]);
  const task = (kind: AiTask['kind'], inputRefs: AiTask['inputRefs']): AiTask => {
    const t: AiTask = { orgId: s.organisation.id, id: nextId('ai', s.aiTasks) as Id<'AiTask'>, kind, requested: stamp(), inputRefs, outputRefs: [], model: 'stub' };
    s.aiTasks.push(t);
    return t;
  };
  /** Documents given for this formation (as in Conception): recorded with the plan, or read by an AI task for it. */
  const formationDocs = (p: StrategicPlan) =>
    s.sourceDocuments.filter((d) =>
      s.auditEntries.some((a) => a.action === 'create' && a.entity.type === 'SourceDocument' && a.entity.id === d.id && (a.after as { planId?: string } | null)?.planId === p.id) ||
      s.aiTasks.some((t) => t.inputRefs.some((r) => r.type === 'StrategicPlan' && r.id === p.id) && t.inputRefs.some((r) => r.type === 'SourceDocument' && r.id === d.id)));
  const docSource = (prov: Provenance, fallback: string) => {
    if (prov.kind !== 'document') return fallback;
    const doc = s.sourceDocuments.find((d) => d.id === prov.sourceDocumentId);
    return prov.page ? en.consultation.source.page(doc?.title ?? '', prov.page) : en.consultation.source.document(doc?.title ?? '');
  };

  /* ───────── Consultation room ───────── */

  const inputView = (i: ConsultationInput): InputView => ({
    id: i.id, kind: i.kind, text: i.text, unit: i.kind === 'expert_input' ? null : unitName(shownUnit(s, i.unitId, now)) || null,
    attachment: i.attachmentRef, on: dateInZone(i.created.at, tz), mine: i.created.byMembershipId === viewer.membershipId,
  });
  const seesInputsOf = (r: ConsultationRound) => can(s, viewer, 'view', { type: 'ConsultationInput', id: r.id });
  const roundView = (r: ConsultationRound): RoundView => ({
    id: r.id, status: r.status, audience: r.audienceUnitIds === 'all' ? 'all' : r.audienceUnitIds.map((u) => unitName(u)),
    opensOn: r.opensOn, closesOn: r.closesOn, counts: roundCounts(s, r.id, now),
  });
  /** Department heads record meetings for their departments and the sections below them. */
  const meetingUnits = () => {
    const ids = new Set(myDepts().flatMap((d) => [...unitAndBelow(s, d.unitId)]));
    return s.units.filter((u) => ids.has(u.id)).map((u) => ({ id: u.id as string, name: u.name }));
  };

  /* ───────── Baseline register ───────── */

  const seesBaseline = (b: BaselineMeasure) => can(s, viewer, 'view', { type: 'BaselineMeasure', id: b.id });
  /** The viewer answers for the measure's unit. */
  const ownsBaseline = (b: BaselineMeasure) => { const pos = baselineOwnerPosition(s, b); return !!pos && viewer.positionIds.includes(pos as never); };
  const decidesBaseline = (b: BaselineMeasure) => isSO || can(s, viewer, 'draft', { type: 'BaselineMeasure', id: b.id });
  const baselineView = (b: BaselineMeasure): BaselineView => {
    const pos = baselineOwnerPosition(s, b);
    const st = baselineState(b);
    return {
      id: b.id, name: b.name, unit: b.unit, value: b.value, asOf: b.asOf, source: docSource(b.draft.provenance, b.sourceDescription),
      owner: b.ownerUnitId ? { unitId: b.ownerUnitId, unit: unitName(b.ownerUnitId), position: pos ? s.positions.find((p) => p.id === pos)?.title ?? null : null, holder: holderOf(pos) } : null,
      state: st, fromAi: b.draft.provenance.kind !== 'manual',
      confirmed: b.draft.decided ? { by: personOf(b.draft.decided.byMembershipId), on: dateInZone(b.draft.decided.at, tz) } : null,
      validated: b.validated ? { by: personOf(b.validated.byMembershipId), on: dateInZone(b.validated.at, tz) } : null,
      canDecide: decidesBaseline(b) && st !== 'rejected',
      canValidate: st === 'confirmed' && can(s, viewer, 'approve', { type: 'BaselineMeasure', id: b.id }),
      mine: ownsBaseline(b),
    };
  };
  const touchBaseline = (b: BaselineMeasure, before: unknown, action = 'update') => {
    b.updated = stamp();
    audit(action, { type: 'BaselineMeasure', id: b.id }, before, structuredClone(b));
  };
  const newBaseline = (p: StrategicPlan, input: BaselineInput, draft: DraftMeta): BaselineMeasure => {
    const b: BaselineMeasure = {
      ...base(), id: nextId('bm', s.baselineMeasures) as Id<'BaselineMeasure'>, planId: p.id, name: input.name.trim(), unit: input.unit.trim(), value: input.value,
      asOf: input.asOf, sourceDescription: input.source.trim(), ownerUnitId: (input.ownerUnitId as Id<'OrgUnit'> | null) ?? null, validated: null, draft,
    };
    s.baselineMeasures.push(b);
    audit('create', { type: 'BaselineMeasure', id: b.id }, null, structuredClone(b));
    return b;
  };
  const validBaseline = (input: { name: string; value: number; asOf: ISODate }) => !!input.name.trim() && Number.isFinite(input.value) && /^\d{4}-\d{2}-\d{2}$/.test(input.asOf);

  /* ───────── Compliance register ───────── */

  const listsCompliance = isSO || has(viewer, 'compliance');
  const complianceView = (c: ComplianceItem): ComplianceView => {
    const mine = new Set(myDepts().map((d) => d.unitId));
    const flaggable = isSO ? departments(s) : departments(s).filter((d) => mine.has(d.unitId));
    return {
      id: c.id, title: c.title, kind: c.kind,
      source: c.provenance.kind === 'manual' ? en.consultation.compliance.addedBy(titleOf(c.created.byMembershipId)) : docSource(c.provenance, ''),
      fromDocument: c.provenance.kind === 'document',
      flaggedBy: c.flaggedByUnitIds.map((u) => ({ unitId: u, name: unitName(u) })),
      outcome: c.outcome,
      reviewed: c.reviewed ? { by: personOf(c.reviewed.byMembershipId), on: dateInZone(c.reviewed.at, tz) } : null,
      canFlag: flaggable.map((d) => ({ unitId: d.unitId, name: d.name, flagged: c.flaggedByUnitIds.includes(d.unitId as never) })),
      canReview: can(s, viewer, 'approve', { type: 'ComplianceItem', id: c.id }),
      canEdit: listsCompliance,
    };
  };
  const touchCompliance = (c: ComplianceItem, before: unknown, action = 'update') => {
    c.updated = stamp();
    audit(action, { type: 'ComplianceItem', id: c.id }, before, structuredClone(c));
  };
  const KINDS: ComplianceItem['kind'][] = ['law', 'regulation', 'licence_condition', 'policy', 'standard'];

  return {
    /* ───────── The room ───────── */

    room() {
      const p = plan();
      if (!p) return null;
      const r = currentRound(s, p.id);
      const sees = !!r && seesInputsOf(r);
      const vision = s.visionStatements.find((v) => v.planId === p.id && v.kind === 'vision');
      const mission = s.visionStatements.find((v) => v.planId === p.id && v.kind === 'mission');
      const open = r?.status === 'open';
      return {
        planId: p.id, planTitle: p.title, stage: stageOf(p, 'consultation'), aiEnabled: s.organisation.settings.aiEnabled, canRun: runs,
        round: r ? roundView(r) : null,
        earlierRounds: Math.max(0, roundsOf(s, p.id).length - (r ? 1 : 0)),
        seesInputs: sees,
        inputs: sees && r ? [...inputsOf(s, r.id)].reverse().map(inputView) : [],
        canComment: !!r && open && inAudience(s, r, viewer.positionIds as string[]),
        meetingUnits: open ? meetingUnits() : [],
        vision: vision?.confirmation ? { vision: vision.text, mission: mission?.confirmation ? mission.text : '' } : null,
        minGroup: s.organisation.settings.consultationMinGroupSize,
        units: runs ? s.units.map((u) => ({ id: u.id as string, name: u.name, parent: u.parentId ? unitName(u.parentId) : null })) : [],
      };
    },

    scheduleRound(input) {
      const p = plan();
      if (!p) return deny('not_found');
      if (!can(s, viewer, 'draft', { type: 'ConsultationRound', id: '' })) return deny();
      const checks = roundChecks(s, p, input);
      if (checks.length) return { ok: false, error: 'checks', checks };
      const r: ConsultationRound = {
        ...base(), id: nextId('cr', s.consultationRounds) as Id<'ConsultationRound'>, planId: p.id,
        audienceUnitIds: input.audienceUnitIds === 'all' ? 'all' : (input.audienceUnitIds as Id<'OrgUnit'>[]), opensOn: input.opensOn, closesOn: input.closesOn,
        // F-3: the unit only, on every screen. 'named' is never offered.
        status: 'scheduled', attribution: 'unit_only',
      };
      s.consultationRounds.push(r);
      audit('create', { type: 'ConsultationRound', id: r.id }, null, structuredClone(r));
      changed();
      return { ok: true, id: r.id };
    },

    moveRound(id, to) {
      const p = plan();
      const r = p && s.consultationRounds.find((x) => x.id === id && x.planId === p.id);
      if (!r || !p) return deny('not_found');
      if (!can(s, viewer, 'draft', { type: 'ConsultationRound', id: r.id })) return deny();
      if (!canMoveRound(r.status, to)) return deny('locked');
      if (to === 'open' && p.formation?.consultation.status !== 'open') return deny('not_open');
      const before = structuredClone(r);
      r.status = to;
      r.updated = stamp();
      audit(to === 'open' ? 'open' : 'close', { type: 'ConsultationRound', id: r.id }, before, structuredClone(r));
      changed();
      return { ok: true };
    },

    addInput(input) {
      const p = plan();
      const r = p && currentRound(s, p.id);
      if (!p || !r) return deny('not_found');
      if (r.status !== 'open') return deny('not_open');
      const text = input.text.trim();
      if (!text) return deny('required');
      let unitId: string | null;
      if (input.kind === 'comment' || input.kind === 'idea') {
        if (!inAudience(s, r, viewer.positionIds as string[])) return deny();
        unitId = authorUnit(s, viewer.positionIds as string[]);
      } else if (input.kind === 'meeting_summary') {
        if (!input.unitId || !meetingUnits().some((u) => u.id === input.unitId)) return deny();
        unitId = input.unitId;
      } else {
        if (!runs) return deny();
        unitId = null;
      }
      const i: ConsultationInput = {
        ...base(), id: nextId('cin', s.consultationInputs) as Id<'ConsultationInput'>, roundId: r.id, kind: input.kind,
        unitId: unitId as Id<'OrgUnit'> | null, text, attachmentRef: input.kind === 'expert_input' ? input.attachment?.trim() || null : null,
      };
      s.consultationInputs.push(i);
      // The author is kept here, in the audit record, and never shown (F-3).
      audit('create', { type: 'ConsultationInput', id: i.id }, null, structuredClone(i));
      changed();
      return { ok: true, id: i.id };
    },

    async groupInputs() {
      const p = plan();
      const r = p && currentRound(s, p.id);
      if (!runs && !has(viewer, 'executive')) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      if (!p || !r) return deny('not_found');
      const inputs = inputsOf(s, r.id);
      // Only the text goes to the AI: no names, no units (AI guardrails).
      const t = task('cluster', inputs.map((i) => ({ type: 'ConsultationInput', id: i.id })));
      const g = await aiStub.groupInputs(inputs.map((i) => ({ id: i.id, text: i.text })));
      const byId = new Map(inputs.map((i) => [i.id as string, inputView(i)]));
      t.outputRefs = [];
      return {
        ok: true,
        groups: g.groups.map((x) => ({ word: x.word, inputs: x.inputIds.map((id) => byId.get(id)!).filter(Boolean) })),
        single: g.single.map((id) => byId.get(id)!).filter(Boolean),
      };
    },

    /* ───────── Baselines ───────── */

    baselines() {
      const p = plan();
      if (!p) return null;
      const all = baselinesOf(s, p.id).filter(isLiveBaseline);
      const shown = all.filter(seesBaseline);
      return {
        planId: p.id, stage: stageOf(p, 'consultation'), aiEnabled: s.organisation.settings.aiEnabled, canRun: isSO,
        ownUnits: myDepts().map((d) => ({ id: d.unitId, name: d.name })),
        counts: baselineCounts(s, p.id), rows: shown.map(baselineView), hidden: all.length - shown.length,
        documents: isSO ? formationDocs(p).map((d) => ({ id: d.id, title: d.title })) : [],
        units: isSO ? s.units.map((u) => ({ id: u.id as string, name: u.name })) : [],
      };
    },

    addBaseline(input) {
      const p = plan();
      if (!p) return deny('not_found');
      const own = myDepts().some((d) => d.unitId === input.ownerUnitId);
      if (!isSO && !own) return deny();
      if (!validBaseline(input)) return deny('required');
      const b = newBaseline(p, { ...input, ownerUnitId: input.ownerUnitId }, { state: 'human', provenance: { kind: 'manual' }, decided: null });
      changed();
      return { ok: true, id: b.id };
    },

    decideBaseline(id, decision) {
      const p = plan();
      const b = p && s.baselineMeasures.find((x) => x.id === id && x.planId === p.id && isLiveBaseline(x));
      if (!b) return deny('not_found');
      if (!decidesBaseline(b)) return deny();
      if (b.draft.state !== 'ai_draft') return deny('locked');
      const before = structuredClone(b);
      b.draft = { ...b.draft, state: decision === 'accept' ? 'accepted' : 'rejected', decided: stamp() };
      touchBaseline(b, before);
      changed();
      return { ok: true };
    },

    correctBaseline(id, input) {
      const p = plan();
      const b = p && s.baselineMeasures.find((x) => x.id === id && x.planId === p.id && isLiveBaseline(x));
      if (!b) return deny('not_found');
      if (!decidesBaseline(b)) return deny();
      if (!validBaseline(input)) return deny('required');
      const before = structuredClone(b);
      const moved = b.value !== input.value || b.asOf !== input.asOf || b.unit !== input.unit.trim() || b.name !== input.name.trim() || b.sourceDescription !== input.source.trim();
      if (!moved && b.draft.state !== 'ai_draft') return { ok: true };
      Object.assign(b, { name: input.name.trim(), unit: input.unit.trim(), value: input.value, asOf: input.asOf, sourceDescription: input.source.trim() });
      // Correcting a draft is accepting it as corrected; a changed value needs vouching for again.
      if (b.draft.state === 'ai_draft') b.draft = { ...b.draft, state: 'accepted', decided: stamp() };
      if (moved) b.validated = null;
      touchBaseline(b, before);
      changed();
      return { ok: true };
    },

    setBaselineOwner(id, ownerUnitId) {
      const p = plan();
      const b = p && s.baselineMeasures.find((x) => x.id === id && x.planId === p.id && isLiveBaseline(x));
      if (!b) return deny('not_found');
      if (!isSO) return deny();
      if (ownerUnitId && !s.units.some((u) => u.id === ownerUnitId)) return deny('not_found');
      if (b.ownerUnitId === ownerUnitId) return { ok: true };
      const before = structuredClone(b);
      b.ownerUnitId = (ownerUnitId as Id<'OrgUnit'> | null) ?? null;
      touchBaseline(b, before);
      changed();
      return { ok: true };
    },

    validateBaseline(id) {
      const p = plan();
      const b = p && s.baselineMeasures.find((x) => x.id === id && x.planId === p.id && isLiveBaseline(x));
      if (!b) return deny('not_found');
      if (!can(s, viewer, 'approve', { type: 'BaselineMeasure', id: b.id })) return deny();
      if (baselineState(b) !== 'confirmed') return deny(baselineState(b) === 'validated' ? 'locked' : 'not_ready');
      const before = structuredClone(b);
      b.validated = stamp();
      touchBaseline(b, before, 'validate');
      changed();
      return { ok: true };
    },

    async draftBaselines(documentId) {
      const p = plan();
      if (!isSO) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const doc = s.sourceDocuments.find((d) => d.id === documentId);
      if (!p || !doc) return deny('not_found');
      const draft = await aiStub.draftBaselinesFromDocument(doc.fileRef);
      const t = task('extract', [{ type: 'SourceDocument', id: doc.id }, { type: 'StrategicPlan', id: p.id }]);
      const made = draft.measures.map((m) => newBaseline(p, { name: m.name, unit: m.unit, value: m.value, asOf: m.asOf as ISODate, source: en.consultation.source.page(doc.title, m.page), ownerUnitId: null }, {
        // The AI never decides whose data a measure is: the Strategy office sets the owner.
        state: 'ai_draft', provenance: { kind: 'document', sourceDocumentId: doc.id, page: m.page, excerpt: '' }, decided: null,
      }));
      t.outputRefs = made.map((b) => ({ type: 'BaselineMeasure', id: b.id }));
      changed();
      return { ok: true, added: made.length, sameForAnyFile: draft.sameForAnyFile };
    },

    importBaselines(rows) {
      const p = plan();
      if (!isSO) return deny();
      if (!p) return deny('not_found');
      const read = readBaselineRows(s, rows);
      const good = read.filter((r) => r.problems.length === 0);
      for (const r of good) newBaseline(p, { name: r.name, unit: r.unit, value: r.value!, asOf: r.asOf ?? now, source: r.source || en.consultation.baselines.imported, ownerUnitId: r.ownerUnitId }, { state: 'human', provenance: { kind: 'manual' }, decided: null });
      if (good.length) changed();
      return { ok: true, added: good.length, problems: read.filter((r) => r.problems.length > 0) };
    },

    /* ───────── Compliance ───────── */

    compliance() {
      const p = plan();
      if (!p) return null;
      return {
        planId: p.id, stage: stageOf(p, 'confirmation'), aiEnabled: s.organisation.settings.aiEnabled,
        canAdd: listsCompliance, canReview: has(viewer, 'compliance'),
        counts: complianceCounts(s, p.id),
        items: complianceOf(s, p.id).filter((c) => can(s, viewer, 'view', { type: 'ComplianceItem', id: c.id })).map(complianceView),
        documents: listsCompliance ? formationDocs(p).filter(isComplianceSource).map((d) => ({ id: d.id, title: d.title })) : [],
      };
    },

    addCompliance(input) {
      const p = plan();
      if (!p) return deny('not_found');
      if (!listsCompliance) return deny();
      if (!input.title.trim() || !KINDS.includes(input.kind)) return deny('required');
      const c: ComplianceItem = {
        ...base(), id: nextId('ci', s.complianceItems) as Id<'ComplianceItem'>, planId: p.id, title: input.title.trim(), kind: input.kind,
        provenance: { kind: 'manual' }, flaggedByUnitIds: [], outcome: null, reviewed: null,
      };
      s.complianceItems.push(c);
      audit('create', { type: 'ComplianceItem', id: c.id }, null, structuredClone(c));
      changed();
      return { ok: true, id: c.id };
    },

    editCompliance(id, input) {
      const p = plan();
      const c = p && s.complianceItems.find((x) => x.id === id && x.planId === p.id);
      if (!c) return deny('not_found');
      if (!listsCompliance) return deny();
      if (!input.title.trim() || !KINDS.includes(input.kind)) return deny('required');
      if (c.title === input.title.trim() && c.kind === input.kind) return { ok: true };
      const before = structuredClone(c);
      c.title = input.title.trim();
      c.kind = input.kind;
      // The wording reviewed has changed, so it is reviewed again.
      c.outcome = null;
      c.reviewed = null;
      touchCompliance(c, before);
      changed();
      return { ok: true };
    },

    flagCompliance(id, unitId, flagged) {
      const p = plan();
      const c = p && s.complianceItems.find((x) => x.id === id && x.planId === p.id);
      if (!c) return deny('not_found');
      if (!departments(s).some((d) => d.unitId === unitId)) return deny('not_found');
      // A department head flags for their own department (becoming an owner); the Strategy office for any.
      if (!isSO && !myDepts().some((d) => d.unitId === unitId)) return deny();
      const isFlagged = c.flaggedByUnitIds.includes(unitId as never);
      if (isFlagged === flagged) return { ok: true };
      const before = structuredClone(c);
      c.flaggedByUnitIds = flagged ? [...c.flaggedByUnitIds, unitId as Id<'OrgUnit'>] : c.flaggedByUnitIds.filter((u) => u !== unitId);
      touchCompliance(c, before, flagged ? 'flag' : 'unflag');
      changed();
      return { ok: true };
    },

    reviewCompliance(id, outcome) {
      const p = plan();
      const c = p && s.complianceItems.find((x) => x.id === id && x.planId === p.id);
      if (!c) return deny('not_found');
      if (!can(s, viewer, 'approve', { type: 'ComplianceItem', id: c.id })) return deny();
      if (c.outcome === outcome) return { ok: true };
      const before = structuredClone(c);
      c.outcome = outcome;
      c.reviewed = stamp();
      touchCompliance(c, before, 'review');
      changed();
      return { ok: true };
    },

    async draftCompliance(documentId) {
      const p = plan();
      if (!listsCompliance) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const doc = s.sourceDocuments.find((d) => d.id === documentId);
      if (!p || !doc) return deny('not_found');
      // Obligations come only from laws, regulations, licences and policies given for this plan (F3).
      if (!isComplianceSource(doc)) return deny('not_source');
      const draft = await aiStub.draftComplianceFromDocument(doc.fileRef);
      const t = task('extract', [{ type: 'SourceDocument', id: doc.id }, { type: 'StrategicPlan', id: p.id }]);
      const made = draft.items.map((x) => {
        const c: ComplianceItem = {
          ...base(), id: nextId('ci', s.complianceItems) as Id<'ComplianceItem'>, planId: p.id, title: x.title, kind: x.kind,
          provenance: { kind: 'document', sourceDocumentId: doc.id, page: x.page, excerpt: '' }, flaggedByUnitIds: [], outcome: null, reviewed: null,
        };
        s.complianceItems.push(c);
        audit('create', { type: 'ComplianceItem', id: c.id }, null, structuredClone(c));
        return c;
      });
      t.outputRefs = made.map((c) => ({ type: 'ComplianceItem', id: c.id }));
      changed();
      return { ok: true, added: made.length, sameForAnyFile: draft.sameForAnyFile };
    },
  };
}
