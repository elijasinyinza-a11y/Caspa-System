/**
 * Strategy formation, part 11b: Conception, through the data-access layer (Strategy Formation Specification v1.0, F1;
 * BUILD-BRIEF sections 30–31). Permissions follow the matrix:
 * - FourQEntry: the Executive, the Strategy office and facilitators see every card; a department head (the "owner")
 *   sees and works on the cards their department raised. The Strategy office and facilitators curate and consolidate.
 *   A department head sends their sheet to the Strategy office (the row's "propose").
 * - VisionStatement: written and confirmed by the Executive only, always by hand (the AI never drafts it); seen by all.
 * Every AI call is logged as an AiTask; every AI-produced card is a draft until a person accepts or corrects it.
 */
import type { AiTask, AuditEntry, DraftMeta, FourQCell, FourQEntry, GateEvent, Id, ISODate, ISODateTime, SourceDocument, StrategicPlan, VisionStatement } from '../../contract/caspa-data-contract';
import { aiStub, type AiDraft } from '../../ai';
import {
  canSubmitDepartment, CELLS, departments, departmentsHeadedBy, departmentSheet, departmentState, entriesOf, filledCells, isAccepted, isLive,
  keptSeparate, KEEP_SEPARATE_ACTION, pairKey, sameCell, submissionOf, SUBMIT_ACTION, visionChecks, visionMustKey, type DepartmentState, type VisionMust,
} from '../../rules/conception';
import { formationInProgress, formingPlan } from '../../rules/formation';
import { dateInZone } from '../../selectors/format';
import { en } from '../../strings/en';
import { can } from './permissions';
import type { Store } from './store';
import type { Viewer } from './viewer';

export interface CardView {
  id: string;
  cell: FourQCell;
  text: string;
  /** The departments that raised it, kept through merges. */
  units: string[];
  /** Where it came from, in words: a document and page, an interview, a session or a person. */
  source: string;
  evidence: string | null;
  state: DraftMeta['state'];
  scope: FourQEntry['scope'];
  /** Cards merged into this one. */
  merged: number;
  /** Whether this viewer may accept, correct, reject or edit it. */
  canDecide: boolean;
}

export interface DepartmentView extends DepartmentState {
  head: string | null;
  holder: string | null;
  submittedOn: ISODate | null;
  sheet: CardView[];
}

export interface ConceptionPage {
  planId: string;
  planTitle: string;
  stage: 'not_started' | 'open' | 'complete';
  aiEnabled: boolean;
  /** Strategy office or facilitator: curates every card, adds cards from sessions and consolidates. */
  canCurate: boolean;
  /** Sees every card (Executive, Strategy office, facilitator). */
  seesAll: boolean;
  isExecutive: boolean;
  /** The organisation sheet, as Table 2, with only the cards this viewer may read. */
  board: { cell: FourQCell; cards: CardView[]; filled: boolean }[];
  /** Cards on the organisation sheet this viewer may not read (D6-5 pattern: a count, never the text). */
  hiddenOnBoard: number;
  filled: number;
  /** All departments for those who see every card; otherwise only the viewer's own. */
  departments: DepartmentView[];
  /** The departments this viewer answers for (F-2). */
  myDepartments: string[];
  documents: { id: string; title: string; kind: SourceDocument['kind']; fileRef: string; drafted: number }[];
  vision: {
    vision: string;
    mission: string;
    confirmed: { by: string; on: ISODate } | null;
    canWrite: boolean;
    /** Writing opens when every section of the organisation sheet has an accepted card. */
    open: boolean;
    checks: VisionMust[];
  };
}

export type ConceptionError = 'not_allowed' | 'not_found' | 'required' | 'ai_off' | 'not_ready' | 'locked' | 'same_cell';
export type ConceptionResult<T = object> = ({ ok: true } & T) | { ok: false; error: ConceptionError };

export interface ConceptionAccess {
  page(): ConceptionPage | null;
  addDocument(input: { title: string; kind: SourceDocument['kind']; fileName: string }): ConceptionResult<{ id: string }>;
  draftFromDocument(documentId: string): Promise<ConceptionResult<{ added: number; sameForAnyFile: boolean }>>;
  interview(unitId: string, answers: { cell: FourQCell; answer: string }[]): Promise<ConceptionResult<{ added: number }>>;
  addCard(input: { cell: FourQCell; text: string; unitId: string | null; evidence: string | null }): ConceptionResult<{ id: string }>;
  /** Accept (optionally corrected), reject, or edit the text of a card a person has already accepted or written. */
  updateCard(id: string, input: { decision?: 'accept' | 'reject'; text?: string; evidence?: string | null }): ConceptionResult;
  submitDepartment(unitId: string): ConceptionResult;
  consolidate(unitId: string): ConceptionResult<{ moved: number }>;
  findDuplicates(): Promise<ConceptionResult<{ pairs: [CardView, CardView][] }>>;
  merge(keepId: string, mergeId: string): ConceptionResult;
  keepSeparate(aId: string, bId: string): ConceptionResult;
  summarise(): Promise<ConceptionResult<{ draft: AiDraft }>>;
  saveVision(input: { vision: string; mission: string }): ConceptionResult;
  confirmVision(): ConceptionResult<{ outcome: GateEvent['outcome']; checks: VisionMust[] }>;
}

interface Ctx {
  s: Store; viewer: Viewer; now: ISODate; clock: () => ISODateTime;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  onChange?: () => void;
}

export function createConceptionAccess(ctx: Ctx): ConceptionAccess {
  const { s, viewer, clock, audit } = ctx;
  const has = (r: string) => viewer.roles.includes(r as never);
  const curates = has('strategy_office') || has('facilitator');
  const seesAll = curates || has('executive');
  const changed = () => ctx.onChange?.();
  const stamp = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const base = () => ({ orgId: s.organisation.id, created: stamp(), updated: stamp() });
  const deny = <T,>(error: ConceptionError = 'not_allowed'): ConceptionResult<T> => ({ ok: false, error });
  const key = (s.organisation.id as string).replace(/^org-/, '');
  const nextId = (prefix: string, taken: { id: string }[]) => {
    const used = new Set(taken.map((x) => x.id));
    let n = taken.length;
    let id: string;
    do id = `${prefix}-${key}-${++n}`; while (used.has(id));
    return id;
  };
  const plan = (): StrategicPlan | null => formingPlan(s);
  const mine = () => departmentsHeadedBy(s, viewer.positionIds as string[]).map((d) => d.unitId);
  const unitName = (u: string) => s.units.find((x) => x.id === u)?.name ?? '';
  const personOf = (mid: string) => s.people.find((p) => p.id === s.memberships.find((m) => m.id === mid)?.personId)?.fullName ?? '';
  const holderOf = (pid: string | null) => {
    if (!pid) return null;
    const a = s.assignments.find((x) => x.positionId === pid && x.from <= ctx.now && (x.to === null || x.to >= ctx.now));
    return a ? s.people.find((p) => p.id === a.personId)?.fullName ?? null : null;
  };
  const sees = (e: FourQEntry) => can(s, viewer, 'view', { type: 'FourQEntry', id: e.id });
  /** Department heads act on department cards their unit raised; consolidated cards belong to the curators. */
  const decides = (e: FourQEntry) => curates || (e.scope === 'department' && can(s, viewer, 'draft', { type: 'FourQEntry', id: e.id }));
  const tz = s.organisation.timeZone;

  const sourceOf = (e: FourQEntry): string => {
    const p = e.draft.provenance;
    if (p.kind === 'document') {
      const doc = s.sourceDocuments.find((d) => d.id === p.sourceDocumentId);
      return p.page ? en.conception.source.documentPage(doc?.title ?? '', p.page) : en.conception.source.document(doc?.title ?? '');
    }
    if (p.kind === 'interview') {
      const task = s.aiTasks.find((t) => t.id === p.aiTaskId);
      return en.conception.source.interview(unitName(task?.inputRefs.find((r) => r.type === 'OrgUnit')?.id ?? ''));
    }
    if (p.kind === 'ai_suggestion') return en.conception.source.suggestion;
    return e.raisedByUnitIds.length ? en.conception.source.addedBy(en.list(e.raisedByUnitIds.map((u) => unitName(u)))) : en.conception.source.session;
  };
  const view = (e: FourQEntry, p: StrategicPlan): CardView => ({
    id: e.id, cell: e.cell, text: e.text, units: e.raisedByUnitIds.map((u) => unitName(u)), source: sourceOf(e), evidence: e.evidence,
    state: e.draft.state, scope: e.scope, merged: entriesOf(s, p.id).filter((x) => x.mergedIntoId === e.id).length, canDecide: p.status === 'draft' && decides(e),
  });
  const touch = (e: FourQEntry, before: unknown, action = 'update') => {
    e.updated = stamp();
    audit(action, { type: 'FourQEntry', id: e.id }, before, structuredClone(e));
  };
  const task = (kind: AiTask['kind'], inputRefs: AiTask['inputRefs']): AiTask => {
    const t: AiTask = { orgId: s.organisation.id, id: nextId('ai', s.aiTasks) as Id<'AiTask'>, kind, requested: stamp(), inputRefs, outputRefs: [], model: 'stub' };
    s.aiTasks.push(t);
    return t;
  };
  const newCard = (p: StrategicPlan, input: { cell: FourQCell; text: string; units: string[]; scope: FourQEntry['scope']; evidence: string | null; draft: DraftMeta }): FourQEntry => {
    const e: FourQEntry = {
      ...base(), id: nextId('q', s.fourQEntries) as Id<'FourQEntry'>, planId: p.id, cell: { ...input.cell } as FourQCell, text: input.text.trim(),
      raisedByUnitIds: input.units as Id<'OrgUnit'>[], scope: input.scope, mergedIntoId: null, evidence: input.evidence?.trim() || null, draft: input.draft,
    };
    s.fourQEntries.push(e);
    audit('create', { type: 'FourQEntry', id: e.id }, null, structuredClone(e));
    return e;
  };
  /**
   * Documents given for this formation: recorded with the plan when added, or read by an AI task for this plan,
   * even before any card is drafted from them.
   */
  const isFormationDoc = (planId: string, docId: string) =>
    s.auditEntries.some((a) => a.action === 'create' && a.entity.type === 'SourceDocument' && a.entity.id === docId && (a.after as { planId?: string } | null)?.planId === planId) ||
    s.aiTasks.some((t) => t.inputRefs.some((r) => r.type === 'StrategicPlan' && r.id === planId) && t.inputRefs.some((r) => r.type === 'SourceDocument' && r.id === docId));
  const draftedFrom = (planId: string, docId: string) =>
    entriesOf(s, planId).filter((e) => e.draft.provenance.kind === 'document' && e.draft.provenance.sourceDocumentId === docId).length;
  const visionOf = (p: StrategicPlan, kind: 'vision' | 'mission') => s.visionStatements.find((v) => v.planId === p.id && v.kind === kind) ?? null;

  const page = (): ConceptionPage | null => {
    // D15-11: a confirmed plan's board stays readable; its content is locked (changes go through plan().)
    const p = formationInProgress(s);
    if (!p) return null;
    const locked = p.status !== 'draft';
    const org = entriesOf(s, p.id).filter((e) => e.scope === 'organisation' && isLive(e));
    const shown = org.filter(sees);
    const heads = new Set(mine());
    const depts = departments(s).filter((d) => seesAll || heads.has(d.unitId));
    const vision = visionOf(p, 'vision');
    const checks = visionChecks(s, p);
    const filled = filledCells(s, p.id).length;
    return {
      planId: p.id, planTitle: p.title, stage: p.formation?.conception.status ?? 'not_started', aiEnabled: s.organisation.settings.aiEnabled,
      canCurate: curates && !locked, seesAll, isExecutive: has('executive'),
      board: CELLS.map((c) => {
        const cards = shown.filter((e) => sameCell(e.cell, c));
        return { cell: c, cards: cards.map((e) => view(e, p)), filled: org.some((e) => sameCell(e.cell, c) && isAccepted(e)) };
      }),
      hiddenOnBoard: org.length - shown.length,
      filled,
      departments: depts.map((d) => {
        const st = departmentState(s, p.id, d.unitId);
        const sub = submissionOf(s, p.id, d.unitId);
        return {
          ...st, head: d.headPositionId ? s.positions.find((x) => x.id === d.headPositionId)?.title ?? null : null, holder: holderOf(d.headPositionId),
          submittedOn: sub ? dateInZone(sub.at, tz) : null, sheet: departmentSheet(s, p.id, d.unitId).filter(sees).map((e) => view(e, p)),
        };
      }),
      myDepartments: [...heads],
      documents: seesAll ? s.sourceDocuments.filter((d) => isFormationDoc(p.id, d.id) || draftedFrom(p.id, d.id) > 0).map((d) => ({
        id: d.id, title: d.title, kind: d.kind, fileRef: d.fileRef,
        drafted: draftedFrom(p.id, d.id),
      })) : [],
      vision: {
        vision: vision?.text ?? '', mission: visionOf(p, 'mission')?.text ?? '',
        confirmed: vision?.confirmation ? { by: personOf(vision.confirmation.byMembershipId), on: dateInZone(vision.confirmation.at, tz) } : null,
        canWrite: can(s, viewer, 'draft', { type: 'VisionStatement', id: '' }) && !vision?.confirmation,
        open: filled === CELLS.length,
        checks,
      },
    };
  };

  return {
    page,

    addDocument(input) {
      const p = plan();
      if (!curates) return deny();
      if (!p) return deny('not_found');
      if (!input.title.trim() || !input.fileName.trim()) return deny('required');
      const d: SourceDocument = { ...base(), id: nextId('sd', s.sourceDocuments) as Id<'SourceDocument'>, title: input.title.trim(), kind: input.kind, fileRef: input.fileName.trim() };
      s.sourceDocuments.push(d);
      audit('create', { type: 'SourceDocument', id: d.id }, null, { ...d, planId: p.id });
      changed();
      return { ok: true, id: d.id };
    },

    async draftFromDocument(documentId) {
      const p = plan();
      if (!curates) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const doc = s.sourceDocuments.find((d) => d.id === documentId);
      if (!p || !doc) return deny('not_found');
      const draft = await aiStub.draftFourQFromDocument(doc.fileRef);
      const t = task('extract', [{ type: 'SourceDocument', id: doc.id }, { type: 'StrategicPlan', id: p.id }]);
      const made = draft.cards.map((c) => newCard(p, {
        cell: c.cell, text: c.text, units: [], scope: 'organisation', evidence: null,
        draft: { state: 'ai_draft', provenance: { kind: 'document', sourceDocumentId: doc.id, page: c.page, excerpt: '' }, decided: null },
      }));
      t.outputRefs = made.map((e) => ({ type: 'FourQEntry', id: e.id }));
      changed();
      return { ok: true, added: made.length, sameForAnyFile: draft.sameForAnyFile };
    },

    async interview(unitId, answers) {
      const p = plan();
      if (!p) return deny('not_found');
      if (!mine().includes(unitId)) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const given = answers.filter((a) => a.answer.trim());
      if (!given.length) return deny('required');
      const draft = await aiStub.draftFourQFromInterview(given);
      // The answers themselves are not stored: the task records what was asked about, and each card points to it.
      const t = task('interview', [{ type: 'StrategicPlan', id: p.id }, { type: 'OrgUnit', id: unitId }]);
      const made = draft.cards.map((c) => newCard(p, {
        cell: c.cell, text: c.text, units: [unitId], scope: 'department', evidence: null,
        draft: { state: 'ai_draft', provenance: { kind: 'interview', aiTaskId: t.id }, decided: null },
      }));
      t.outputRefs = made.map((e) => ({ type: 'FourQEntry', id: e.id }));
      changed();
      return { ok: true, added: made.length };
    },

    addCard(input) {
      const p = plan();
      if (!p) return deny('not_found');
      if (!input.text.trim()) return deny('required');
      if (input.unitId ? !(curates || mine().includes(input.unitId)) : !curates) return deny();
      const e = newCard(p, {
        cell: input.cell, text: input.text, units: input.unitId ? [input.unitId] : [], scope: input.unitId ? 'department' : 'organisation', evidence: input.evidence,
        draft: { state: 'human', provenance: { kind: 'manual' }, decided: null },
      });
      changed();
      return { ok: true, id: e.id };
    },

    updateCard(id, input) {
      const p = plan();
      const e = p && s.fourQEntries.find((x) => x.id === id && x.planId === p.id && isLive(x));
      if (!e) return deny('not_found');
      if (!decides(e)) return deny();
      if (input.text !== undefined && !input.text.trim()) return deny('required');
      const before = structuredClone(e);
      if (input.text !== undefined) e.text = input.text.trim();
      if (input.evidence !== undefined) e.evidence = input.evidence?.trim() || null;
      if (input.decision) {
        if (e.draft.state !== 'ai_draft') return deny('locked');
        e.draft = { ...e.draft, state: input.decision === 'accept' ? 'accepted' : 'rejected', decided: stamp() };
      } else if (e.draft.state === 'ai_draft' && input.text !== undefined) {
        // Correcting a draft is accepting it as corrected.
        e.draft = { ...e.draft, state: 'accepted', decided: stamp() };
      }
      touch(e, before);
      changed();
      return { ok: true };
    },

    submitDepartment(unitId) {
      const p = plan();
      if (!p) return deny('not_found');
      if (!mine().includes(unitId)) return deny();
      const st = departmentState(s, p.id, unitId);
      if (!canSubmitDepartment(st)) return deny('not_ready');
      audit(SUBMIT_ACTION, { type: 'OrgUnit', id: unitId }, null, { planId: p.id, accepted: st.waiting + st.consolidated });
      changed();
      return { ok: true };
    },

    consolidate(unitId) {
      const p = plan();
      if (!curates) return deny();
      if (!p) return deny('not_found');
      const moving = departmentSheet(s, p.id, unitId).filter(isAccepted);
      for (const e of moving) {
        const before = structuredClone(e);
        e.scope = 'organisation';
        touch(e, before);
      }
      if (moving.length) changed();
      return { ok: true, moved: moving.length };
    },

    async findDuplicates() {
      const p = plan();
      if (!curates) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      if (!p) return deny('not_found');
      const cards = entriesOf(s, p.id).filter((e) => e.scope === 'organisation' && isLive(e));
      const t = task('merge', cards.map((e) => ({ type: 'FourQEntry', id: e.id })));
      const r = await aiStub.suggestDuplicates(cards.map((e) => ({ id: e.id, cell: e.cell, text: e.text })));
      const kept = keptSeparate(s, p.id);
      const byId = new Map(cards.map((e) => [e.id as string, e]));
      const pairs = r.pairs.filter(([a, b]) => !kept.has(pairKey(a, b)) && byId.has(a) && byId.has(b)).map(([a, b]) => [view(byId.get(a)!, p), view(byId.get(b)!, p)] as [CardView, CardView]);
      t.outputRefs = pairs.flat().map((c) => ({ type: 'FourQEntry', id: c.id }));
      return { ok: true, pairs };
    },

    merge(keepId, mergeId) {
      const p = plan();
      if (!curates) return deny();
      const keep = p && s.fourQEntries.find((x) => x.id === keepId && x.planId === p.id && x.scope === 'organisation' && isLive(x));
      const gone = p && s.fourQEntries.find((x) => x.id === mergeId && x.planId === p.id && x.scope === 'organisation' && isLive(x));
      if (!keep || !gone || keep.id === gone.id) return deny('not_found');
      if (!sameCell(keep.cell, gone.cell)) return deny('same_cell');
      const [kb, gb] = [structuredClone(keep), structuredClone(gone)];
      keep.raisedByUnitIds = [...new Set([...keep.raisedByUnitIds, ...gone.raisedByUnitIds])];
      // A merged-in card that a person accepted counts for the card it joins.
      if (keep.draft.state === 'ai_draft' && isAccepted(gone)) keep.draft = { ...keep.draft, state: 'accepted', decided: stamp() };
      gone.mergedIntoId = keep.id;
      touch(keep, kb);
      touch(gone, gb, 'merge');
      changed();
      return { ok: true };
    },

    keepSeparate(aId, bId) {
      const p = plan();
      if (!curates) return deny();
      if (!p || !s.fourQEntries.some((x) => x.id === aId) || !s.fourQEntries.some((x) => x.id === bId)) return deny('not_found');
      audit(KEEP_SEPARATE_ACTION, { type: 'FourQEntry', id: aId }, null, { planId: p.id, otherId: bId });
      changed();
      return { ok: true };
    },

    async summarise() {
      const p = plan();
      if (!seesAll) return deny();
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      if (!p) return deny('not_found');
      const accepted = entriesOf(s, p.id).filter((e) => e.scope === 'organisation' && isLive(e) && isAccepted(e));
      task('summarise', accepted.map((e) => ({ type: 'FourQEntry', id: e.id })));
      const bands = (['retraction', 'repositioning', 'projection'] as const).map((b) => ({
        band: en.fourQ.band[b], cards: CELLS.filter((c) => c.band === b).flatMap((c) => accepted.filter((e) => sameCell(e.cell, c)).map((e) => e.text)),
      }));
      return { ok: true, draft: await aiStub.summariseBoard(bands) };
    },

    saveVision(input) {
      const p = plan();
      if (!p) return deny('not_found');
      if (!can(s, viewer, 'draft', { type: 'VisionStatement', id: '' })) return deny();
      if (visionOf(p, 'vision')?.confirmation) return deny('locked');
      if (filledCells(s, p.id).length < CELLS.length) return deny('not_ready');
      for (const kind of ['vision', 'mission'] as const) {
        const text = input[kind].trim();
        const v = visionOf(p, kind);
        if (v) {
          if (v.text === text) continue;
          const before = structuredClone(v);
          v.text = text;
          v.updated = stamp();
          audit('update', { type: 'VisionStatement', id: v.id }, before, structuredClone(v));
        } else if (text) {
          // Written by leadership; there is no AI provenance on a VisionStatement (F1).
          const nv: VisionStatement = { ...base(), id: nextId('vs', s.visionStatements) as Id<'VisionStatement'>, planId: p.id, kind, text, confirmation: null };
          s.visionStatements.push(nv);
          audit('create', { type: 'VisionStatement', id: nv.id }, null, structuredClone(nv));
        }
      }
      changed();
      return { ok: true };
    },

    confirmVision() {
      const p = plan();
      if (!p) return deny('not_found');
      if (!can(s, viewer, 'confirm', { type: 'VisionStatement', id: '' })) return deny();
      const checks = visionChecks(s, p);
      if (checks.some((c) => c.kind === 'already_confirmed' || c.kind === 'not_formed')) return deny('locked');
      const outcome: GateEvent['outcome'] = checks.length ? 'blocked' : 'passed';
      const ev: GateEvent = {
        orgId: s.organisation.id, id: nextId('ge', s.gateEvents) as Id<'GateEvent'>, gate: 'vision.confirm', subject: { type: 'StrategicPlan', id: p.id },
        attempted: stamp(), outcome, blockingFindingKeys: checks.map((c) => visionMustKey(p.id, c)), advisoryAtGate: [],
      };
      s.gateEvents.push(ev);
      if (outcome === 'passed') {
        for (const v of s.visionStatements.filter((x) => x.planId === p.id && x.text.trim())) {
          const before = structuredClone(v);
          v.confirmation = stamp();
          v.updated = stamp();
          audit('confirm', { type: 'VisionStatement', id: v.id }, before, structuredClone(v));
        }
      }
      changed();
      return { ok: true, outcome, checks };
    },
  };
}
