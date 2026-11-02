/**
 * Communication through the data-access layer (BUILD-BRIEF section 36, D16-2 to D16-11; contract v1.9).
 * - Everyone reads records (the CommunicationRecord row). Readers see accepted audience versions only.
 * - The three parts (what, why, how) are written by the Strategy office, the goal's owner and facilitators. All three
 *   are needed to save.
 * - Facilitators, the Strategy office and the goal's owner ask for AI versions; only the Strategy office or the goal's
 *   owner edits and accepts them.
 * - Meetings are logged once a record exists: by the Strategy office, the goal's owner and facilitators for any unit,
 *   and by department heads for their department and the units within it. Small units show as the unit above (D16-8).
 * - "Why" is a sentence followed by the goal's linked 4Q points shown live (D16-6); card text follows the FourQEntry row.
 * Every change writes an audit entry; every AI call an AiTask.
 */
import type { AiTask, AuditEntry, CommunicationRecord, Id, ISODate, ISODateTime, StrategicPlan } from '../../contract/caspa-data-contract';
import { aiStub } from '../../ai';
import {
  AUDIENCES, canHaveRecord, communicationGoals, communicationPlans, fieldsComplete, firstAudience, meetingShownUnit, meetingUnitsHeadedBy,
  recordOf, recordStatus, whyCardIds, type Audience, type RecordStatus,
} from '../../rules/communication';
import { departmentsHeadedBy } from '../../rules/conception';
import { dateInZone, formatFinancialYear } from '../../selectors/format';
import { holderOf } from '../../selectors/node';
import { holdsFigure } from '../../selectors/plan-document';
import { en } from '../../strings/en';
import { can } from './permissions';
import type { Store } from './store';
import type { Viewer } from './viewer';

export interface VersionView {
  audience: Audience;
  text: string;
  state: 'ai_draft' | 'accepted' | 'edited';
  acceptedBy: { by: string; on: ISODate } | null;
}

export interface CommunicationGoalView {
  goalId: string;
  code: string;
  title: string;
  planId: string;
  planTitle: string;
  owner: { position: string; person: string | null } | null;
  status: RecordStatus;
  record: { what: string; why: string; how: string; updated: { by: string; on: ISODate } } | null;
  /** The goal's linked 4Q points, live. `text` is null where this reader may not read card text (count only). */
  whyCards: { id: string; cell: string; text: string | null }[];
  whyCardsVisible: boolean;
  /** Accepted versions for readers; every version for those who edit them. */
  versions: VersionView[];
  firstAudience: Audience;
  meetings: { unit: string; heldOn: ISODate; feedbackSummary: string }[];
  can: { write: boolean; askAi: boolean; draftVersions: boolean; editVersions: boolean; logMeeting: boolean };
  /** Units this viewer may log meetings for. */
  meetingUnits: { id: string; name: string }[];
  /** Names that may hold numbers and are not figures, for the live figures note while editing (D15-3, D16-6). */
  names: string[];
  /** The goal's plan has a final plan document (D16-2). */
  documentFinal: boolean;
}

export interface CommunicationPage {
  plans: { planId: string; title: string; period: string; status: string; goals: CommunicationGoalView[]; complete: number }[];
  aiEnabled: boolean;
}

export interface BoardPaper {
  organisation: string;
  planTitle: string;
  period: string;
  goalLabel: string;
  code: string;
  title: string;
  text: string | null;
  acceptedBy: { by: string; on: ISODate } | null;
  whyCards: CommunicationGoalView['whyCards'];
  whyCardsVisible: boolean;
}

export type CommunicationError = 'not_allowed' | 'not_found' | 'required' | 'ai_off' | 'no_record' | 'unit' | 'date' | 'feedback' | 'empty' | 'not_drafted';
export type CommunicationResult = { ok: true } | { ok: false; error: CommunicationError };
export type Fields = { what: string; why: string; how: string };

export interface CommunicationAccess {
  page(): CommunicationPage;
  goal(goalId: string): CommunicationGoalView | null;
  boardPaper(goalId: string): BoardPaper | null;
  /** The AI's suggested wording for the three parts. Nothing is stored until a person saves it. */
  suggest(goalId: string): Promise<{ ok: true; fields: Fields } | { ok: false; error: CommunicationError }>;
  save(goalId: string, fields: Fields): CommunicationResult;
  draftVersions(goalId: string): Promise<CommunicationResult>;
  editVersion(goalId: string, audience: Audience, text: string): CommunicationResult;
  acceptVersion(goalId: string, audience: Audience): CommunicationResult;
  logMeeting(goalId: string, meeting: { unitId: string; heldOn: string; feedbackSummary: string }): CommunicationResult;
}

interface Ctx {
  s: Store; viewer: Viewer; now: ISODate; clock: () => ISODateTime;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  onChange?: () => void;
}

export const planPeriod = (s: Store, p: Pick<StrategicPlan, 'startYear' | 'endYear'>) =>
  en.communication.planPeriod(formatFinancialYear(p.startYear, s.organisation.financialYearStartMonth), formatFinancialYear(p.endYear, s.organisation.financialYearStartMonth));

export function createCommunicationAccess(ctx: Ctx): CommunicationAccess {
  const { s, viewer, now, clock, audit } = ctx;
  const stamp = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const changed = () => ctx.onChange?.();
  const deny = (error: CommunicationError) => ({ ok: false as const, error });
  const tz = s.organisation.timeZone;
  const personOf = (mid: string) => s.people.find((p) => p.id === s.memberships.find((m) => m.id === mid)?.personId)?.fullName ?? '';
  const roles = viewer.roles;
  const mine = (pid: string | null | undefined) => !!pid && (viewer.positionIds as string[]).includes(pid);
  const office = roles.includes('strategy_office');
  const facilitator = roles.includes('facilitator');

  /** What this viewer may do on one goal's record. The matrix decides first; the layer narrows "owner". */
  const rights = (goalId: string) => {
    const g = s.goals.find((x) => x.id === goalId);
    const ok = !!g && canHaveRecord(s, goalId);
    const r = recordOf(s, goalId);
    const drafts = ok && can(s, viewer, 'draft', { type: 'CommunicationRecord', id: r?.id ?? goalId });
    const owns = mine(g?.ownerPositionId);
    const write = drafts && (office || facilitator || owns);
    const editVersions = drafts && (office || owns);
    const headUnits = meetingUnitsHeadedBy(s, viewer.positionIds as string[]);
    const allUnits = write;
    const meetingUnits = !drafts ? [] : allUnits ? s.units.map((u) => u.id as string) : headUnits;
    return { g, r, write, editVersions, draftVersions: write, meetingUnits, logMeeting: !!r && meetingUnits.length > 0 };
  };

  const cardsOf = (goalId: string) => {
    const g = s.goals.find((x) => x.id === goalId);
    if (!g) return { cards: [], visible: true };
    const ids = whyCardIds(s, g);
    const visible = ids.every((id) => can(s, viewer, 'view', { type: 'FourQEntry', id }));
    return {
      visible,
      cards: ids.map((id) => {
        const e = s.fourQEntries.find((x) => x.id === id)!;
        return { id, cell: en.communication.fourQLink(en.fourQ.cellName(e.cell), en.fourQ.band[e.cell.band]), text: visible ? e.text : null };
      }),
    };
  };

  const versionState = (v: CommunicationRecord['audienceVersions'][number]): VersionView['state'] =>
    v.draft.state === 'ai_draft' ? 'ai_draft' : v.draft.decided ? 'accepted' : 'edited';

  const view = (goalId: string): CommunicationGoalView | null => {
    const x = rights(goalId);
    if (!x.g || !canHaveRecord(s, goalId)) return null;
    const g = x.g;
    const plan = s.plans.find((p) => p.id === g.planId)!;
    const r = x.r;
    const holder = holderOf(s, g.ownerPositionId, now);
    const why = cardsOf(goalId);
    const versions = (r?.audienceVersions ?? [])
      .map((v) => ({ audience: v.audience, text: v.text, state: versionState(v), acceptedBy: v.draft.decided ? { by: personOf(v.draft.decided.byMembershipId), on: dateInZone(v.draft.decided.at, tz) } : null }))
      .filter((v) => x.editVersions || v.state === 'accepted')
      .sort((a, b) => AUDIENCES.indexOf(a.audience) - AUDIENCES.indexOf(b.audience));
    return {
      goalId: g.id, code: g.code, title: g.title, planId: plan.id, planTitle: plan.title,
      owner: holder ? { position: holder.position, person: holder.person } : null,
      status: recordStatus(r),
      record: r && recordStatus(r) === 'complete' ? { what: r.content, why: r.context, how: r.concept, updated: { by: personOf(r.updated.byMembershipId), on: dateInZone(r.updated.at, tz) } } : null,
      whyCards: why.cards, whyCardsVisible: why.visible,
      versions,
      firstAudience: firstAudience({ roles, isSupervisor: viewer.isSupervisor, headsDepartment: departmentsHeadedBy(s, viewer.positionIds as string[]).length > 0 }),
      meetings: [...(r?.meetings ?? [])]
        .sort((a, b) => (a.heldOn < b.heldOn ? 1 : a.heldOn > b.heldOn ? -1 : 0))
        .map((m) => {
          const shown = meetingShownUnit(s, m.unitId, now);
          return { unit: s.units.find((u) => u.id === shown)?.name ?? '', heldOn: m.heldOn, feedbackSummary: m.feedbackSummary };
        }),
      can: { write: x.write, askAi: x.write && s.organisation.settings.aiEnabled, draftVersions: x.draftVersions && !!r && s.organisation.settings.aiEnabled, editVersions: x.editVersions, logMeeting: x.logMeeting },
      meetingUnits: x.logMeeting ? s.units.filter((u) => x.meetingUnits.includes(u.id)).map((u) => ({ id: u.id as string, name: u.name })) : [],
      names: [g.title, plan.title, s.organisation.name, ...s.units.map((u) => u.name)],
      documentFinal: s.planDocuments.some((d) => d.planId === plan.id && d.status === 'final'),
    };
  };

  const addTask = (goalId: string, outputs: { type: string; id: string }[]): AiTask => {
    const task: AiTask = {
      orgId: s.organisation.id, id: `ai-${(s.organisation.id as string).replace(/^org-/, '')}-${s.aiTasks.length + 1}` as Id<'AiTask'>, kind: 'draft',
      requested: stamp(), inputRefs: [{ type: 'Goal', id: goalId }], outputRefs: outputs, model: 'stub',
    };
    s.aiTasks.push(task);
    return task;
  };

  return {
    page() {
      const plans = communicationPlans(s).map((p) => {
        const goals = communicationGoals(s, p.id).map((g) => view(g.id)).filter((v): v is CommunicationGoalView => !!v);
        return { planId: p.id, title: p.title, period: planPeriod(s, p), status: p.status, goals, complete: goals.filter((g) => g.status === 'complete').length };
      }).filter((p) => p.goals.length > 0);
      return { plans, aiEnabled: s.organisation.settings.aiEnabled };
    },

    goal: view,

    boardPaper(goalId) {
      const v = view(goalId);
      if (!v) return null;
      const plan = s.plans.find((p) => p.id === v.planId)!;
      // Only an accepted board version prints; everyone may read accepted versions.
      const r = recordOf(s, goalId);
      const board = r?.audienceVersions.find((x) => x.audience === 'board' && versionState(x) === 'accepted');
      return {
        organisation: s.organisation.name, planTitle: plan.title, period: planPeriod(s, plan), goalLabel: s.organisation.termLabels.goal.singular,
        code: v.code, title: v.title, text: board?.text ?? null,
        acceptedBy: board?.draft.decided ? { by: personOf(board.draft.decided.byMembershipId), on: dateInZone(board.draft.decided.at, tz) } : null,
        whyCards: v.whyCards, whyCardsVisible: v.whyCardsVisible,
      };
    },

    async suggest(goalId) {
      const x = rights(goalId);
      if (!x.g || !canHaveRecord(s, goalId)) return deny('not_found');
      if (!x.write) return deny('not_allowed');
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const plan = s.plans.find((p) => p.id === x.g!.planId)!;
      addTask(goalId, []);
      const out = await aiStub.draftCommunication({ goalTitle: x.g.title, planPeriod: planPeriod(s, plan) });
      changed();
      return { ok: true, fields: { what: out.what, why: out.why, how: out.how } };
    },

    save(goalId, fields) {
      const x = rights(goalId);
      if (!x.g || !canHaveRecord(s, goalId)) return deny('not_found');
      if (!x.write) return deny('not_allowed');
      const f = { content: fields.what.trim(), context: fields.why.trim(), concept: fields.how.trim() };
      if (!fieldsComplete(f)) return deny('required');
      if (x.r) {
        const before = structuredClone(x.r);
        Object.assign(x.r, f);
        x.r.updated = stamp();
        audit('update', { type: 'CommunicationRecord', id: x.r.id }, before, structuredClone(x.r));
      } else {
        const r: CommunicationRecord = {
          orgId: s.organisation.id, id: `cr-${(s.organisation.id as string).replace(/^org-/, '')}-${s.communicationRecords.length + 1}` as Id<'CommunicationRecord'>,
          goalId: x.g.id, created: stamp(), updated: stamp(), ...f, audienceVersions: [], meetings: [],
        };
        s.communicationRecords.push(r);
        audit('create', { type: 'CommunicationRecord', id: r.id }, null, structuredClone(r));
      }
      changed();
      return { ok: true };
    },

    async draftVersions(goalId) {
      const x = rights(goalId);
      if (!x.g || !canHaveRecord(s, goalId)) return deny('not_found');
      if (!x.draftVersions) return deny('not_allowed');
      if (!x.r) return deny('no_record');
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      const r = x.r;
      const task = addTask(goalId, [{ type: 'CommunicationRecord', id: r.id }]);
      const out = await aiStub.draftAudienceVersions({ what: r.content, why: r.context, how: r.concept });
      const before = structuredClone(r);
      // Drafting again replaces only the versions not yet accepted; accepted ones stay until a person changes them.
      for (const v of out.versions) {
        const existing = r.audienceVersions.find((a) => a.audience === v.audience);
        const draft = { state: 'ai_draft' as const, provenance: { kind: 'ai_suggestion' as const, aiTaskId: task.id }, decided: null };
        if (!existing) r.audienceVersions.push({ audience: v.audience, text: v.text, draft });
        else if (versionState(existing) !== 'accepted') Object.assign(existing, { text: v.text, draft });
      }
      r.updated = stamp();
      audit('update', { type: 'CommunicationRecord', id: r.id }, { audienceVersions: before.audienceVersions }, { audienceVersions: structuredClone(r.audienceVersions) });
      changed();
      return { ok: true };
    },

    editVersion(goalId, audience, text) {
      const x = rights(goalId);
      if (!x.g || !x.r) return deny('not_found');
      if (!x.editVersions) return deny('not_allowed');
      if (!text.trim()) return deny('empty');
      const before = structuredClone(x.r.audienceVersions);
      const v = x.r.audienceVersions.find((a) => a.audience === audience);
      // An edited version is a person's text awaiting acceptance.
      if (v) Object.assign(v, { text: text.trim(), draft: { state: 'human' as const, provenance: v.draft.provenance, decided: null } });
      else x.r.audienceVersions.push({ audience, text: text.trim(), draft: { state: 'human', provenance: { kind: 'manual' }, decided: null } });
      x.r.updated = stamp();
      audit('update', { type: 'CommunicationRecord', id: x.r.id }, { audienceVersions: before }, { audienceVersions: structuredClone(x.r.audienceVersions) });
      changed();
      return { ok: true };
    },

    acceptVersion(goalId, audience) {
      const x = rights(goalId);
      if (!x.g || !x.r) return deny('not_found');
      if (!x.editVersions) return deny('not_allowed');
      const v = x.r.audienceVersions.find((a) => a.audience === audience);
      if (!v) return deny('not_drafted');
      const before = structuredClone(x.r.audienceVersions);
      v.draft = { ...v.draft, state: v.draft.state === 'ai_draft' ? 'accepted' : v.draft.state, decided: stamp() };
      x.r.updated = stamp();
      audit('update', { type: 'CommunicationRecord', id: x.r.id }, { audienceVersions: before }, { audienceVersions: structuredClone(x.r.audienceVersions) });
      changed();
      return { ok: true };
    },

    logMeeting(goalId, m) {
      const x = rights(goalId);
      if (!x.g || !canHaveRecord(s, goalId)) return deny('not_found');
      if (!x.r) return deny('no_record');
      if (!x.logMeeting) return deny('not_allowed');
      if (!x.meetingUnits.includes(m.unitId)) return deny('unit');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m.heldOn) || Number.isNaN(Date.parse(m.heldOn)) || m.heldOn > now) return deny('date');
      if (!m.feedbackSummary.trim()) return deny('feedback');
      const before = structuredClone(x.r.meetings);
      x.r.meetings.push({ unitId: m.unitId as Id<'OrgUnit'>, heldOn: m.heldOn as ISODate, feedbackSummary: m.feedbackSummary.trim() });
      x.r.updated = stamp();
      audit('update', { type: 'CommunicationRecord', id: x.r.id }, { meetings: before }, { meetings: structuredClone(x.r.meetings) });
      changed();
      return { ok: true };
    },
  };
}

/** Whether a text holds a figure, for the note under each part while editing (D15-3 applies to what, why and how). */
export const communicationFiguresNote = (text: string, names: readonly string[]) => holdsFigure(text, names);
