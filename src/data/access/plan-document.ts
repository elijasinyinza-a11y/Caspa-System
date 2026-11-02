/**
 * The plan document through the data-access layer (BUILD-BRIEF section 35, D15-1 to D15-6; contract v1.8).
 * - Drafted after the plan is confirmed, by the Strategy office or a facilitator, with the AI stub.
 * - Sections are edited by the Strategy office or a facilitator and accepted by the Strategy office; an edit sends an
 *   accepted section back for acceptance. Finalising needs every section accepted and freezes the document.
 * - Drafts are read by the Executive, the Strategy office and facilitators; a final document by all members.
 */
import type { AiTask, AuditEntry, Id, ISODate, ISODateTime, PlanDocument, StrategicPlan } from '../../contract/caspa-data-contract';
import { aiStub } from '../../ai';
import { composition, isDecided } from '../../rules/composition';
import { dateInZone } from '../../selectors/format';
import { holdsFigure, planDocumentContent, PLAN_DOCUMENT_LAYOUT, type PlanDocumentContent } from '../../selectors/plan-document';
import { can } from './permissions';
import type { Store } from './store';
import type { Viewer } from './viewer';

export interface PlanDocumentSectionView {
  id: string;
  kind: 'executive_summary' | 'narrative' | 'goal_narrative';
  goalId: string | null;
  heading: string;
  text: string;
  state: 'ai_draft' | 'accepted' | 'edited';
  /** The text holds a number (D15-3): a note, never a check. */
  figuresNote: boolean;
  canEdit: boolean;
  canAccept: boolean;
}

export interface PlanDocumentPage {
  planId: string;
  planTitle: string;
  layout: readonly string[];
  /** Null when there is no document yet, or this viewer may not read it. */
  document: {
    id: string;
    status: 'draft' | 'final';
    basedOnRevision: number;
    finalised: { by: string; on: ISODate } | null;
    sections: PlanDocumentSectionView[];
    canFinalise: boolean;
  } | null;
  /** A document exists that this viewer may not read yet (a draft). */
  hidden: boolean;
  canDraft: boolean;
  aiEnabled: boolean;
  content: PlanDocumentContent;
  approval: { confirmedBy: string; confirmedOn: ISODate; boardRef: string | null; boardOn: ISODate | null } | null;
  /** Names of records that may hold numbers and are not figures, for the live note while editing (D15-3). */
  names: string[];
}

export type PlanDocumentError = 'not_allowed' | 'not_found' | 'not_ready' | 'final' | 'pending' | 'ai_off' | 'exists' | 'required';
export type PlanDocumentResult = { ok: true } | { ok: false; error: PlanDocumentError };

export interface PlanDocumentAccess {
  page(): PlanDocumentPage | null;
  draft(): Promise<PlanDocumentResult>;
  editSection(sectionId: string, text: string): PlanDocumentResult;
  acceptSection(sectionId: string): PlanDocumentResult;
  finalise(): PlanDocumentResult;
}

interface Ctx {
  s: Store; viewer: Viewer; now: ISODate; clock: () => ISODateTime;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  onChange?: () => void;
}

/** The latest formed plan that is confirmed or active: the one whose document is drafted. */
export const documentPlan = (s: Store): StrategicPlan | null =>
  [...s.plans].reverse().find((p) => p.entryDoor === 'formed' && (p.status === 'confirmed' || p.status === 'active')) ?? null;

export function createPlanDocumentAccess(ctx: Ctx): PlanDocumentAccess {
  const { s, viewer, clock, audit } = ctx;
  const stamp = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const changed = () => ctx.onChange?.();
  const deny = (error: PlanDocumentError): PlanDocumentResult => ({ ok: false, error });
  const tz = s.organisation.timeZone;
  const personOf = (mid: string) => s.people.find((p) => p.id === s.memberships.find((m) => m.id === mid)?.personId)?.fullName ?? '';
  const docOf = (p: StrategicPlan) => [...s.planDocuments].reverse().find((d) => d.planId === p.id) ?? null;
  const drafts = () => can(s, viewer, 'draft', { type: 'PlanDocument', id: '' });
  const approves = () => can(s, viewer, 'approve', { type: 'PlanDocument', id: '' });
  const stateOf = (d: PlanDocument['sections'][number]): PlanDocumentSectionView['state'] =>
    d.draft.state === 'ai_draft' ? 'ai_draft' : d.draft.decided ? 'accepted' : 'edited';
  const sectionOf = (sectionId: string) => {
    const p = documentPlan(s);
    const d = p && docOf(p);
    const sec = d?.sections.find((x) => x.id === sectionId);
    return d && sec ? { d, sec } : null;
  };

  return {
    page() {
      const p = documentPlan(s);
      if (!p) return null;
      const d = docOf(p);
      const reads = !!d && can(s, viewer, 'view', { type: 'PlanDocument', id: d.id });
      const confirmation = p.confirmation;
      const names = [p.title, s.organisation.name, ...composition(s, p.id).goals.map((g) => g.title), ...s.themes.filter((t) => t.planId === p.id).map((t) => t.title)];
      return {
        planId: p.id, planTitle: p.title, layout: PLAN_DOCUMENT_LAYOUT,
        document: d && reads ? {
          id: d.id, status: d.status, basedOnRevision: d.basedOnRevision,
          finalised: d.finalised ? { by: personOf(d.finalised.byMembershipId), on: dateInZone(d.finalised.at, tz) } : null,
          sections: [...d.sections].sort((a, b) => a.order - b.order).map((x) => ({
            id: x.id, kind: x.kind, goalId: x.goalId, heading: x.heading, text: x.text, state: stateOf(x), figuresNote: holdsFigure(x.text, names),
            canEdit: d.status === 'draft' && drafts(), canAccept: d.status === 'draft' && approves() && stateOf(x) !== 'accepted',
          })),
          canFinalise: d.status === 'draft' && approves(),
        } : null,
        hidden: !!d && !reads,
        canDraft: !d && drafts(),
        aiEnabled: s.organisation.settings.aiEnabled,
        // Contract v1.9 (D16-1): a final document shows its accepted organisation-level cards to all its readers.
        content: planDocumentContent(s, p, (id) => (d?.status === 'final' && reads) || can(s, viewer, 'view', { type: 'FourQEntry', id })),
        names,
        approval: confirmation ? {
          confirmedBy: personOf(confirmation.byMembershipId), confirmedOn: dateInZone(confirmation.at, tz),
          boardRef: p.boardApproval?.resolutionRef ?? null, boardOn: p.boardApproval?.date ?? null,
        } : null,
      };
    },

    async draft() {
      const p = documentPlan(s);
      if (!p) return deny('not_ready');
      if (!drafts()) return deny('not_allowed');
      if (docOf(p)) return deny('exists');
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const goals = composition(s, p.id).goals.filter((g) => isDecided(g.draft)).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
      const vision = s.visionStatements.find((v) => v.planId === p.id && v.kind === 'vision')?.text ?? '';
      const task: AiTask = {
        orgId: s.organisation.id, id: `ai-${(s.organisation.id as string).replace(/^org-/, '')}-${s.aiTasks.length + 1}` as Id<'AiTask'>, kind: 'draft',
        requested: stamp(), inputRefs: [{ type: 'StrategicPlan', id: p.id }, ...goals.map((g) => ({ type: 'Goal', id: g.id }))], outputRefs: [], model: 'stub',
      };
      s.aiTasks.push(task);
      const out = await aiStub.draftPlanDocument({
        planTitle: p.title, organisation: s.organisation.name, vision,
        goals: goals.map((g) => ({ id: g.id, title: g.title, themes: g.themeIds.map((t) => s.themes.find((x) => x.id === t)?.title ?? '').filter(Boolean) })),
      });
      const meta = { state: 'ai_draft' as const, provenance: { kind: 'ai_suggestion' as const, aiTaskId: task.id }, decided: null };
      const doc: PlanDocument = {
        orgId: s.organisation.id, id: `pd-${(s.organisation.id as string).replace(/^org-/, '')}-${s.planDocuments.length + 1}` as Id<'PlanDocument'>,
        planId: p.id, basedOnRevision: p.currentRevision, status: 'draft', finalised: null,
        created: stamp(), updated: stamp(),
        sections: [
          { id: 'summary', kind: 'executive_summary', goalId: null, order: 1, heading: out.summary.heading, text: out.summary.text, draft: { ...meta } },
          ...out.goals.map((g, i) => ({ id: `goal-${g.goalId}`, kind: 'goal_narrative' as const, goalId: g.goalId as Id<'Goal'>, order: i + 2, heading: g.heading, text: g.text, draft: { ...meta } })),
        ],
      };
      s.planDocuments.push(doc);
      task.outputRefs.push({ type: 'PlanDocument', id: doc.id });
      audit('create', { type: 'PlanDocument', id: doc.id }, null, structuredClone(doc));
      changed();
      return { ok: true };
    },

    editSection(sectionId, text) {
      const x = sectionOf(sectionId);
      if (!x) return deny('not_found');
      if (x.d.status === 'final') return deny('final');
      if (!drafts()) return deny('not_allowed');
      if (!text.trim()) return deny('required');
      const before = structuredClone(x.sec);
      x.sec.text = text.trim();
      // An edited section is a person's text awaiting acceptance by the Strategy office.
      x.sec.draft = { state: 'human', provenance: x.sec.draft.provenance, decided: null };
      x.d.updated = stamp();
      audit('update', { type: 'PlanDocument', id: x.d.id }, { section: before }, { section: structuredClone(x.sec) });
      changed();
      return { ok: true };
    },

    acceptSection(sectionId) {
      const x = sectionOf(sectionId);
      if (!x) return deny('not_found');
      if (x.d.status === 'final') return deny('final');
      if (!approves()) return deny('not_allowed');
      const before = structuredClone(x.sec);
      x.sec.draft = { ...x.sec.draft, state: x.sec.draft.state === 'ai_draft' ? 'accepted' : x.sec.draft.state, decided: stamp() };
      x.d.updated = stamp();
      audit('update', { type: 'PlanDocument', id: x.d.id }, { section: before }, { section: structuredClone(x.sec) });
      changed();
      return { ok: true };
    },

    finalise() {
      const p = documentPlan(s);
      const d = p && docOf(p);
      if (!d) return deny('not_found');
      if (d.status === 'final') return deny('final');
      if (!approves()) return deny('not_allowed');
      if (d.sections.some((x) => stateOf(x) !== 'accepted')) return deny('pending');
      const before = structuredClone(d);
      d.status = 'final';
      d.finalised = stamp();
      d.updated = stamp();
      audit('finalise', { type: 'PlanDocument', id: d.id }, before, structuredClone(d));
      changed();
      return { ok: true };
    },
  };
}
