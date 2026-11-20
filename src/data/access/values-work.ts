/**
 * Values group work through the data-access layer (v0.32.0; Values Group Work Specification v0.1, VG-1 to VG-10,
 * confirmed by Elijah on 20 November 2026; contract v1.23; prototype `reference/caspa-values-group-work-prototype.html`).
 *
 * - A values session sits in the forming schedule (forming a plan), or is started from the Strategy landing when the
 *   active plan has no values (VG-8). The Strategy office sets up groups: a name and a scribe, member names optional (VG-3).
 * - A group's scribe enters the group's answers to questions 1 to 4 and up to three candidate values on the group's flip
 *   chart, only while the group is open; offline entries are kept on the device and sent on reconnect. The Strategy
 *   office may enter them on the group's behalf, recorded as such.
 * - Candidates reach the values board once the group is closed. The Strategy office and facilitators keep, merge or set
 *   them aside with a reason (VG-5); the group's own wording stays in the record. There is no voting (VG-6).
 * - Kept candidates join the draft values, which then follow the drafting route (VM-1 to VM-8): the Executive confirms.
 * - Who sees what (VG-9): the Strategy office, facilitators and the Executive see every group and the board; a scribe sees
 *   their own group's flip chart; everyone else sees nothing until the values are confirmed. Enforced here.
 */
import { aiStub, type AiDraft } from '../../ai';
import type { AuditEntry, Id, ISODate, ISODateTime, StrategicPlan, ValueCandidate, Workshop, WorkshopGroup } from '../../contract/caspa-data-contract';
import { formationInProgress } from '../../rules/formation';
import { membershipActiveOn } from '../../rules/access';
import { MAX_VALUES, valueInputs, valuesOf } from '../../rules/values';
import {
  ANSWER_MAX, BOARD_ORDER, candidateError, candidatesOf, groupsBehind, groupsBehindValue, isValuesSession, MAX_CANDIDATES, mayStartAfterPublication, mergeError, onBoard,
  type AnswerQuestion, type CandidateError, type MergeError,
} from '../../rules/values-work';
import { dateInZone } from '../../selectors/format';
import type { Device } from './device';
import { can } from './permissions';
import type { Store } from './store';
import { saveValues } from './values';
import type { Viewer } from './viewer';

export type ValuesWorkError =
  | 'not_allowed' | 'not_found' | 'required' | 'closed' | 'locked' | 'held' | 'done' | 'too_many' | 'reason_required'
  | 'not_kept' | 'in_draft' | 'draft_full' | 'with_executive' | 'not_offered' | 'ai_off' | 'too_long' | CandidateError | MergeError;
export type ValuesWorkResult<T = object> = ({ ok: true } & T) | { ok: false; error: ValuesWorkError };

export interface ValuesGroupView {
  id: string;
  name: string;
  scribe: { membershipId: string; name: string };
  memberNames: string[];
  closed: { by: string; on: ISODate } | null;
  answers: number;
  candidates: number;
  toReview: number;
}

export interface ValuesSessionView {
  workshopId: string;
  planId: string;
  planTitle: string;
  /** Forming a new plan, or after publication for a plan with no values (VG-8). */
  route: 'forming' | 'after';
  scheduledOn: ISODate | null;
  groups: ValuesGroupView[];
  /** Add and change groups: the Strategy office, until the session is held. */
  canManage: boolean;
  /** Close a group for review, reopen it, enter on its behalf and print its sheet: the Strategy office. */
  canRun: boolean;
  /** The values are confirmed: nothing more changes here. */
  locked: boolean;
  members: { membershipId: string; name: string }[];
}

export interface CandidateView {
  id: string;
  name: string;
  meaning: string;
  /** The group's own wording, when the board has changed it. */
  entered: { name: string; meaning: string } | null;
  group: { id: string; name: string };
  /** VG-6: the groups that put it forward, merged candidates included. A fact, never a score. */
  groups: string[];
  of: number;
  state: ValueCandidate['state'];
  setAsideReason: string | null;
  onBehalf: boolean;
  answers: { group: string; question: AnswerQuestion; text: string }[];
  mergedFrom: { name: string; group: string }[];
  /** Already among the draft values. */
  inDraft: boolean;
}

export interface ValuesBoardView {
  workshopId: string;
  route: 'forming' | 'after';
  groups: { id: string; name: string; closed: boolean }[];
  candidates: CandidateView[];
  toReview: number;
  /** Keep, merge, set aside, back to review: the Strategy office and facilitators (VG-5). */
  canReview: boolean;
  /** Add a kept candidate to the draft values (VM-1): the Strategy office and facilitators. */
  canDraft: boolean;
  draftCount: number;
  /** Why the draft values cannot take another value now, or null. */
  draftBlocked: 'draft_full' | 'with_executive' | 'locked' | null;
  locked: boolean;
}

export interface ValuesFlipChartView {
  workshopId: string;
  groupId: string;
  name: string;
  planTitle: string;
  scheduledOn: ISODate | null;
  isScribe: boolean;
  /** The Strategy office entering for a scribe who cannot sign in. */
  onBehalf: boolean;
  open: boolean;
  offline: boolean;
  answers: { id: string; question: AnswerQuestion; text: string }[];
  waitingAnswers: { key: string; question: AnswerQuestion; text: string }[];
  candidates: { id: string; name: string; meaning: string; answerIds: string[]; state: ValueCandidate['state']; onBehalf: boolean; canChange: boolean }[];
  waitingCandidates: { key: string; name: string; meaning: string }[];
  mayAddCandidate: boolean;
  /** May change entries: the scribe, or the Strategy office on the group's behalf, while open. */
  canEnter: boolean;
  aiEnabled: boolean;
}

export interface GroupSheetView {
  organisation: string;
  planTitle: string;
  scheduledOn: ISODate | null;
  name: string;
  scribe: string;
  memberNames: string[];
}

export interface ValuesWorkAccess {
  /** The values session of the plan being formed, or of the active plan after publication; null when none or not visible. */
  sessionFor(route: 'forming' | 'after'): ValuesSessionView | null;
  session(workshopId: string): ValuesSessionView | null;
  /** VG-8: the Strategy office may start group work after publication while the active plan has no values. */
  canStartAfterPublication(): boolean;
  startAfterPublication(): ValuesWorkResult<{ workshopId: string }>;
  addGroup(workshopId: string, input: { name: string; scribeMembershipId: string; memberNames: string[] }): ValuesWorkResult<{ id: string }>;
  updateGroup(workshopId: string, groupId: string, input: { name?: string; scribeMembershipId?: string; memberNames?: string[] }): ValuesWorkResult;
  setGroupClosed(workshopId: string, groupId: string, closed: boolean): ValuesWorkResult;
  flipChart(workshopId: string, groupId: string): ValuesFlipChartView | null;
  groupSheet(workshopId: string, groupId: string): GroupSheetView | null;
  addAnswer(workshopId: string, groupId: string, question: AnswerQuestion, text: string): ValuesWorkResult<{ queued?: boolean }>;
  deleteAnswer(workshopId: string, groupId: string, answerId: string): ValuesWorkResult;
  addCandidate(workshopId: string, groupId: string, input: { name: string; meaning: string; answerIds: string[] }): ValuesWorkResult<{ id?: string; queued?: boolean }>;
  updateCandidate(id: string, input: { name: string; meaning: string; answerIds: string[] }): ValuesWorkResult;
  deleteCandidate(id: string): ValuesWorkResult;
  /** VG-7: on request, the AI tidies a candidate's meaning. Language only; never a value, a name or an answer. */
  tidyWording(workshopId: string, groupId: string, text: string): Promise<ValuesWorkResult<{ draft: AiDraft }>>;
  board(workshopId: string): ValuesBoardView | null;
  keep(id: string, wording?: { name: string; meaning: string }): ValuesWorkResult;
  merge(ids: string[], targetId: string, wording: { name: string; meaning: string }): ValuesWorkResult;
  setAside(id: string, reason: string): ValuesWorkResult;
  backToReview(id: string): ValuesWorkResult;
  /** Add a kept candidate to the plan's draft values, remembering where it came from. */
  addToDraftValues(id: string): ValuesWorkResult;
  /** VG-6: how many of the session's groups a draft value's candidates came from; null when it did not come from group work. */
  backing(candidateIds: readonly string[] | undefined): { groups: number; of: number } | null;
  /** Sends answers and candidates saved on this device while offline. */
  sendWaiting(): number;
}

interface Ctx {
  s: Store; viewer: Viewer; now: ISODate; clock: () => ISODateTime;
  audit: (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => AuditEntry;
  onChange?: () => void;
  device?: Device;
}

export function createValuesWorkAccess(ctx: Ctx): ValuesWorkAccess {
  const { s, viewer, now, clock, audit, device } = ctx;
  const has = (r: string) => viewer.roles.includes(r as never);
  const office = has('strategy_office');
  const reviews = can(s, viewer, 'draft', { type: 'ValueCandidate', id: '' }); // VG-5: the Strategy office and facilitators
  const sees = can(s, viewer, 'view', { type: 'ValueCandidate', id: '' }); // VG-9: and the Executive
  const changed = () => ctx.onChange?.();
  const stamp = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const deny = <T,>(error: ValuesWorkError = 'not_allowed'): ValuesWorkResult<T> => ({ ok: false, error });
  const key = (s.organisation.id as string).replace(/^org-/, '');
  const on = (at: string) => dateInZone(at, s.organisation.timeZone);
  const personOf = (mid: string) => s.people.find((p) => p.id === s.memberships.find((m) => m.id === mid)?.personId)?.fullName ?? '';
  const offline = () => !!device?.offline[viewer.membershipId];
  let seq = 0;
  const nextId = (prefix: string, taken: { id: string }[]) => {
    const used = new Set(taken.map((x) => x.id));
    let id: string;
    do id = `${prefix}-${key}-${taken.length + ++seq}`; while (used.has(id));
    return id;
  };

  /** The plan a session belongs to, and which route it is on. Forming: the plan in formation; after: the active plan. */
  const routeOf = (w: Workshop): { p: StrategicPlan; route: 'forming' | 'after' } | null => {
    const p = s.plans.find((x) => x.id === w.planId);
    if (!p) return null;
    if (p.status === 'active') return { p, route: 'after' };
    if (formationInProgress(s)?.id === p.id) return { p, route: 'forming' };
    return null;
  };
  /** Values are settled: forming, once the vision is confirmed (CV-3); after publication, once any value is confirmed. */
  const lockedFor = (p: StrategicPlan, route: 'forming' | 'after') =>
    route === 'forming'
      ? p.status !== 'draft' || !!s.visionStatements.find((x) => x.planId === p.id && x.kind === 'vision')?.confirmation
      : valuesOf(s.visionStatements, p.id).some((x) => x.confirmation);
  const sessionById = (id: string) => {
    const w = s.workshops.find((x) => x.id === id && isValuesSession(x) && x.status !== 'cancelled');
    const r = w && routeOf(w);
    return w && r ? { w, ...r, locked: lockedFor(r.p, r.route) } : null;
  };
  const groupOf = (workshopId: string, groupId: string) => {
    const found = sessionById(workshopId);
    const g = found?.w.groups?.find((x) => x.id === groupId);
    return found && g ? { ...found, g } : null;
  };
  const touchSession = (w: Workshop, action: string, before: unknown) => { w.updated = stamp(); audit(action, { type: 'Workshop', id: w.id }, before, structuredClone(w)); };
  const touchCandidate = (c: ValueCandidate, action: string, before: unknown) => { c.updated = stamp(); audit(action, { type: 'ValueCandidate', id: c.id }, before, structuredClone(c)); };
  const isScribe = (g: WorkshopGroup) => g.scribeMembershipId === viewer.membershipId;
  /** The scribe enters their group's entries; the Strategy office may, on the group's behalf, when the scribe cannot sign in. */
  const mayEnter = (g: WorkshopGroup) => isScribe(g) || office;
  const enterRefusal = (found: NonNullable<ReturnType<typeof groupOf>>): ValuesWorkError | null => {
    if (!mayEnter(found.g)) return 'not_allowed';
    if (found.locked) return 'locked';
    if (found.g.closed) return 'closed';
    return null;
  };
  const waitingFor = (workshopId: string, groupId: string) =>
    (device?.valueEntries ?? []).filter((x) => x.membershipId === viewer.membershipId && x.workshopId === workshopId && x.groupId === groupId);
  const queue = (entry: NonNullable<Device['valueEntries']>[number]) => { device!.valueEntries = [...(device!.valueEntries ?? []), entry]; };

  const groupView = (w: Workshop, g: WorkshopGroup): ValuesGroupView => {
    const mine = candidatesOf(s.valueCandidates, w.id, g.id);
    return {
      id: g.id, name: g.name, scribe: { membershipId: g.scribeMembershipId, name: personOf(g.scribeMembershipId) }, memberNames: g.memberNames,
      closed: g.closed ? { by: personOf(g.closed.byMembershipId), on: on(g.closed.at) } : null,
      answers: (g.answers ?? []).length, candidates: mine.length, toReview: mine.filter((c) => c.state === 'to_review').length,
    };
  };
  const sessionView = (found: NonNullable<ReturnType<typeof sessionById>>): ValuesSessionView | null => {
    if (!sees) return null;
    const { w, p, route, locked } = found;
    return {
      workshopId: w.id, planId: p.id, planTitle: p.title, route, scheduledOn: w.scheduledOn,
      groups: (w.groups ?? []).map((g) => groupView(w, g)),
      canManage: office && !locked && (route === 'after' || w.status === 'planned'),
      canRun: office && !locked,
      locked,
      members: s.memberships.filter((m) => membershipActiveOn(m, now)).map((m) => ({ membershipId: m.id as string, name: personOf(m.id) })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  };
  const groupInputError = (input: { name: string; scribeMembershipId: string }): ValuesWorkError | null => {
    if (!input.name.trim() || !input.scribeMembershipId) return 'required';
    if (input.name.trim().length > 40) return 'too_long';
    if (!s.memberships.some((m) => m.id === input.scribeMembershipId && membershipActiveOn(m, now))) return 'required';
    return null;
  };
  const draftValues = (planId: string) => valuesOf(s.visionStatements, planId).filter((x) => !x.confirmation);
  const draftBlocked = (p: StrategicPlan, locked: boolean): ValuesBoardView['draftBlocked'] => {
    if (locked) return 'locked';
    if (s.visionStatements.some((x) => x.planId === p.id && !x.confirmation && x.sentForConfirmation)) return 'with_executive';
    if (draftValues(p.id).length >= MAX_VALUES) return 'draft_full';
    return null;
  };
  const candidateOnBoard = (id: string) => {
    const c = s.valueCandidates.find((x) => x.id === id);
    const found = c && sessionById(c.workshopId);
    return c && found && onBoard(c, found.w.groups ?? []) ? { c, ...found } : null;
  };
  const reviewRefusal = (found: { locked: boolean; p: StrategicPlan }, c: ValueCandidate): ValuesWorkError | null => {
    if (!reviews) return 'not_allowed';
    if (found.locked) return 'locked';
    if (draftValues(found.p.id).some((v) => (v.fromCandidateIds ?? []).includes(c.id))) return 'in_draft';
    return null;
  };
  const writeEntry = (found: NonNullable<ReturnType<typeof groupOf>>, entry: NonNullable<Device['valueEntries']>[number], fromDevice = false) => {
    const { w, p, g } = found;
    const behalf = !isScribe(g);
    if (entry.kind === 'answer') {
      const before = structuredClone(w);
      const used = new Set((g.answers ?? []).map((a) => a.id));
      let n = (g.answers ?? []).length + 1;
      while (used.has(`a${n}`)) n++;
      g.answers = [...(g.answers ?? []), { id: `a${n}`, question: entry.question, text: entry.text }];
      touchSession(w, behalf ? 'answer.on_behalf' : fromDevice ? 'answer.sync' : 'answer.add', before);
      return `a${n}`;
    }
    const c: ValueCandidate = {
      orgId: s.organisation.id, created: stamp(), updated: stamp(), id: nextId('vc', s.valueCandidates) as Id<'ValueCandidate'>,
      planId: p.id, workshopId: w.id, groupId: g.id, name: entry.name.trim(), meaning: entry.meaning.trim(), entered: { name: entry.name.trim(), meaning: entry.meaning.trim() },
      answerIds: entry.answerIds.filter((a) => (g.answers ?? []).some((x) => x.id === a)), state: 'to_review', mergedIntoId: null, setAsideReason: null, onBehalf: behalf,
    };
    s.valueCandidates.push(c);
    audit(fromDevice ? 'sync' : 'create', { type: 'ValueCandidate', id: c.id }, null, structuredClone(c));
    return c.id as string;
  };

  return {
    sessionFor(route) {
      if (!sees) return null;
      const p = route === 'forming' ? formationInProgress(s) : s.plans.find((x) => x.status === 'active');
      if (!p) return null;
      const w = s.workshops.find((x) => x.planId === p.id && isValuesSession(x) && x.status !== 'cancelled');
      const found = w && sessionById(w.id);
      return found && found.route === route ? sessionView(found) : null;
    },

    session(workshopId) {
      const found = sessionById(workshopId);
      return found ? sessionView(found) : null;
    },

    canStartAfterPublication() {
      const p = s.plans.find((x) => x.status === 'active');
      return office && !!p && mayStartAfterPublication(p, s.visionStatements, s.workshops);
    },

    startAfterPublication() {
      const p = s.plans.find((x) => x.status === 'active');
      if (!office) return deny();
      if (!p || !mayStartAfterPublication(p, s.visionStatements, s.workshops)) return deny('not_offered');
      const w: Workshop = {
        orgId: s.organisation.id, created: stamp(), updated: stamp(), id: nextId('ws', s.workshops) as Id<'Workshop'>, planId: p.id, purposes: ['values'], format: 'in_person',
        scheduledOn: null, window: null, participantPositionIds: [], recordingRef: null, status: 'planned', decisionLog: [], groups: [],
      };
      s.workshops.push(w);
      audit('create', { type: 'Workshop', id: w.id }, null, structuredClone(w));
      changed();
      return { ok: true, workshopId: w.id };
    },

    addGroup(workshopId, input) {
      const found = sessionById(workshopId);
      if (!office) return deny();
      if (!found) return deny('not_found');
      if (found.locked) return deny('locked');
      if (found.route === 'forming' && found.w.status !== 'planned') return deny('held');
      const err = groupInputError(input);
      if (err) return deny(err);
      const { w } = found;
      const before = structuredClone(w);
      const used = new Set((w.groups ?? []).map((g) => g.id));
      let n = (w.groups ?? []).length + 1;
      while (used.has(`g${n}`)) n++;
      const g: WorkshopGroup = { id: `g${n}`, name: input.name.trim(), scribeMembershipId: input.scribeMembershipId as Id<'Membership'>, memberNames: input.memberNames.map((x) => x.trim()).filter(Boolean), closed: null, answers: [] };
      w.groups = [...(w.groups ?? []), g];
      touchSession(w, 'update', before);
      changed();
      return { ok: true, id: g.id };
    },

    updateGroup(workshopId, groupId, input) {
      const found = groupOf(workshopId, groupId);
      if (!office) return deny();
      if (!found) return deny('not_found');
      if (found.locked) return deny('locked');
      if (found.route === 'forming' && found.w.status !== 'planned') return deny('held');
      const { w, g } = found;
      const err = groupInputError({ name: input.name ?? g.name, scribeMembershipId: input.scribeMembershipId ?? g.scribeMembershipId });
      if (err) return deny(err);
      const before = structuredClone(w);
      if (input.name !== undefined) g.name = input.name.trim();
      if (input.scribeMembershipId) g.scribeMembershipId = input.scribeMembershipId as Id<'Membership'>;
      if (input.memberNames) g.memberNames = input.memberNames.map((x) => x.trim()).filter(Boolean);
      touchSession(w, 'update', before);
      changed();
      return { ok: true };
    },

    setGroupClosed(workshopId, groupId, closed) {
      const found = groupOf(workshopId, groupId);
      if (!office) return deny();
      if (!found) return deny('not_found');
      if (found.locked) return deny('locked');
      const { w, g } = found;
      if (!!g.closed === closed) return deny('done');
      const before = structuredClone(g);
      g.closed = closed ? stamp() : null;
      w.updated = stamp();
      audit(closed ? 'group.close' : 'group.reopen', { type: 'Workshop', id: w.id }, { group: before }, { group: structuredClone(g) });
      changed();
      return { ok: true };
    },

    flipChart(workshopId, groupId) {
      const found = groupOf(workshopId, groupId);
      if (!found) return null;
      const { w, p, g, locked } = found;
      const scribe = isScribe(g);
      if (!scribe && !sees) return null; // VG-9: a scribe sees only their own group
      const open = !g.closed && !locked;
      const canEnter = open && mayEnter(g);
      const mine = candidatesOf(s.valueCandidates, w.id, g.id);
      const waiting = waitingFor(w.id, g.id);
      return {
        workshopId: w.id, groupId: g.id, name: g.name, planTitle: p.title, scheduledOn: w.scheduledOn,
        isScribe: scribe, onBehalf: !scribe && office, open, offline: offline(),
        answers: (g.answers ?? []).map((a) => ({ ...a })),
        waitingAnswers: waiting.flatMap((x) => (x.kind === 'answer' ? [{ key: x.key, question: x.question, text: x.text }] : [])),
        candidates: mine.map((c) => ({ id: c.id, name: c.entered.name, meaning: c.entered.meaning, answerIds: [...c.answerIds], state: c.state, onBehalf: c.onBehalf, canChange: canEnter && c.state === 'to_review' })),
        waitingCandidates: waiting.flatMap((x) => (x.kind === 'candidate' ? [{ key: x.key, name: x.name, meaning: x.meaning }] : [])),
        mayAddCandidate: canEnter && mine.length + waiting.filter((x) => x.kind === 'candidate').length < MAX_CANDIDATES,
        canEnter,
        aiEnabled: s.organisation.settings.aiEnabled,
      };
    },

    groupSheet(workshopId, groupId) {
      const found = groupOf(workshopId, groupId);
      if (!found || !office) return null;
      return { organisation: s.organisation.name, planTitle: found.p.title, scheduledOn: found.w.scheduledOn, name: found.g.name, scribe: personOf(found.g.scribeMembershipId), memberNames: [...found.g.memberNames] };
    },

    addAnswer(workshopId, groupId, question, text) {
      const found = groupOf(workshopId, groupId);
      if (!found) return deny('not_found');
      const why = enterRefusal(found);
      if (why) return deny(why);
      const t = text.trim();
      if (!t || ![1, 2, 3, 4].includes(question)) return deny('required');
      if (t.length > ANSWER_MAX) return deny('too_long');
      const entry = { key: `ve-${device?.seq ?? 0}`, membershipId: viewer.membershipId as string, workshopId, groupId, kind: 'answer' as const, question, text: t };
      if (offline() && device) { entry.key = `ve-${device.seq++}`; queue(entry); changed(); return { ok: true, queued: true }; }
      writeEntry(found, entry);
      changed();
      return { ok: true };
    },

    deleteAnswer(workshopId, groupId, answerId) {
      const found = groupOf(workshopId, groupId);
      if (!found) return deny('not_found');
      const why = enterRefusal(found);
      if (why) return deny(why);
      const { w, g } = found;
      if (!(g.answers ?? []).some((a) => a.id === answerId)) return deny('not_found');
      const before = structuredClone(w);
      g.answers = (g.answers ?? []).filter((a) => a.id !== answerId);
      for (const c of candidatesOf(s.valueCandidates, w.id, g.id).filter((x) => x.answerIds.includes(answerId))) {
        const b = structuredClone(c);
        c.answerIds = c.answerIds.filter((a) => a !== answerId);
        touchCandidate(c, 'update', b);
      }
      touchSession(w, 'answer.delete', before);
      changed();
      return { ok: true };
    },

    addCandidate(workshopId, groupId, input) {
      const found = groupOf(workshopId, groupId);
      if (!found) return deny('not_found');
      const why = enterRefusal(found);
      if (why) return deny(why);
      const err = candidateError(input);
      if (err) return deny(err);
      const waiting = waitingFor(workshopId, groupId).filter((x) => x.kind === 'candidate').length;
      if (candidatesOf(s.valueCandidates, workshopId, groupId).length + waiting >= MAX_CANDIDATES) return deny('too_many');
      const entry = { key: `ve-${device?.seq ?? 0}`, membershipId: viewer.membershipId as string, workshopId, groupId, kind: 'candidate' as const, name: input.name.trim(), meaning: input.meaning.trim(), answerIds: [...input.answerIds] };
      if (offline() && device) { entry.key = `ve-${device.seq++}`; queue(entry); changed(); return { ok: true, queued: true }; }
      const id = writeEntry(found, entry);
      changed();
      return { ok: true, id };
    },

    updateCandidate(id, input) {
      const c = s.valueCandidates.find((x) => x.id === id);
      const found = c && groupOf(c.workshopId, c.groupId);
      if (!c || !found) return deny('not_found');
      const why = enterRefusal(found);
      if (why) return deny(why);
      if (c.state !== 'to_review') return deny('closed');
      const err = candidateError(input);
      if (err) return deny(err);
      const before = structuredClone(c);
      c.name = input.name.trim();
      c.meaning = input.meaning.trim();
      c.entered = { name: c.name, meaning: c.meaning };
      c.answerIds = input.answerIds.filter((a) => (found.g.answers ?? []).some((x) => x.id === a));
      touchCandidate(c, 'update', before);
      changed();
      return { ok: true };
    },

    deleteCandidate(id) {
      const c = s.valueCandidates.find((x) => x.id === id);
      const found = c && groupOf(c.workshopId, c.groupId);
      if (!c || !found) return deny('not_found');
      const why = enterRefusal(found);
      if (why) return deny(why);
      if (c.state !== 'to_review') return deny('closed');
      // A candidate still waiting for review never counted; the scribe may take it back. The audit entry keeps it.
      s.valueCandidates.splice(s.valueCandidates.indexOf(c), 1);
      audit('delete', { type: 'ValueCandidate', id: c.id }, structuredClone(c), null);
      changed();
      return { ok: true };
    },

    async tidyWording(workshopId, groupId, text) {
      const found = groupOf(workshopId, groupId);
      if (!found) return deny('not_found');
      const why = enterRefusal(found);
      if (why) return deny(why);
      if (!s.organisation.settings.aiEnabled) return deny('ai_off');
      if (!text.trim()) return deny('meaning_required');
      s.aiTasks.push({ orgId: s.organisation.id, id: nextId('ai', s.aiTasks) as Id<'AiTask'>, kind: 'language_review', requested: stamp(), inputRefs: [{ type: 'Workshop', id: workshopId }], outputRefs: [], model: 'stub' });
      return { ok: true, draft: await aiStub.tidyValueWording(text) };
    },

    board(workshopId) {
      const found = sessionById(workshopId);
      if (!found || !sees) return null;
      const { w, p, route, locked } = found;
      const groups = w.groups ?? [];
      const name = (gid: string) => groups.find((g) => g.id === gid)?.name ?? '';
      const all = s.valueCandidates.filter((c) => c.workshopId === w.id);
      const shown = all.filter((c) => c.state !== 'merged' && onBoard(c, groups)).sort((a, b) => BOARD_ORDER[a.state] - BOARD_ORDER[b.state]);
      const inDraft = new Set(draftValues(p.id).flatMap((v) => (v.fromCandidateIds ?? []) as string[]));
      const answerOf = (gid: string, aid: string) => groups.find((g) => g.id === gid)?.answers?.find((a) => a.id === aid);
      const view = (c: ValueCandidate): CandidateView => {
        const merged = all.filter((x) => x.mergedIntoId === c.id);
        return {
          id: c.id, name: c.name, meaning: c.meaning,
          entered: c.entered.name !== c.name || c.entered.meaning !== c.meaning ? { ...c.entered } : null,
          group: { id: c.groupId, name: name(c.groupId) },
          groups: groupsBehind(all, c.id).map(name), of: groups.length, state: c.state, setAsideReason: c.setAsideReason, onBehalf: c.onBehalf,
          answers: [c, ...merged].flatMap((x) => x.answerIds.map((aid) => { const a = answerOf(x.groupId, aid); return a ? [{ group: name(x.groupId), question: a.question, text: a.text }] : []; }).flat()),
          mergedFrom: merged.map((x) => ({ name: x.entered.name, group: name(x.groupId) })),
          inDraft: inDraft.has(c.id),
        };
      };
      return {
        workshopId: w.id, route, groups: groups.map((g) => ({ id: g.id, name: g.name, closed: !!g.closed })),
        candidates: shown.map(view), toReview: shown.filter((c) => c.state === 'to_review').length,
        canReview: reviews && !locked, canDraft: reviews && !locked, draftCount: draftValues(p.id).length, draftBlocked: draftBlocked(p, locked), locked,
      };
    },

    keep(id, wording) {
      const found = candidateOnBoard(id);
      if (!found) return deny('not_found');
      const why = reviewRefusal(found, found.c);
      if (why) return deny(why);
      const { c } = found;
      if (c.state === 'merged' || c.state === 'set_aside') return deny('not_kept');
      if (wording) { const err = candidateError(wording); if (err) return deny(err); }
      const before = structuredClone(c);
      if (wording) { c.name = wording.name.trim(); c.meaning = wording.meaning.trim(); }
      c.state = 'kept';
      touchCandidate(c, 'keep', before);
      changed();
      return { ok: true };
    },

    merge(ids, targetId, wording) {
      const unique = [...new Set(ids)];
      if (!unique.includes(targetId)) return deny('not_found');
      const found = unique.map(candidateOnBoard);
      if (found.some((x) => !x)) return deny('not_found');
      const cands = found.map((x) => x!.c);
      for (const f of found) { const why = reviewRefusal(f!, f!.c); if (why) return deny(why); }
      const err = mergeError(cands, wording);
      if (err) return deny(err);
      const target = cands.find((c) => c.id === targetId)!;
      const before = structuredClone(target);
      target.name = wording.name.trim();
      target.meaning = wording.meaning.trim();
      target.state = 'kept';
      touchCandidate(target, 'merge', before);
      for (const c of cands.filter((x) => x.id !== targetId)) {
        const b = structuredClone(c);
        c.state = 'merged';
        c.mergedIntoId = target.id;
        touchCandidate(c, 'merge', b);
      }
      changed();
      return { ok: true };
    },

    setAside(id, reason) {
      const found = candidateOnBoard(id);
      if (!found) return deny('not_found');
      const why = reviewRefusal(found, found.c);
      if (why) return deny(why);
      const { c } = found;
      if (c.state === 'merged' || c.state === 'set_aside') return deny('done');
      if (!reason.trim()) return deny('reason_required');
      const before = structuredClone(c);
      c.state = 'set_aside';
      c.setAsideReason = reason.trim();
      touchCandidate(c, 'set_aside', before);
      changed();
      return { ok: true };
    },

    backToReview(id) {
      const found = candidateOnBoard(id);
      if (!found) return deny('not_found');
      const why = reviewRefusal(found, found.c);
      if (why) return deny(why);
      const { c } = found;
      if (c.state === 'to_review' || c.state === 'merged') return deny('done');
      const before = structuredClone(c);
      c.state = 'to_review';
      c.setAsideReason = null;
      // Candidates merged into it come back to review too, with the groups they speak for.
      for (const m of s.valueCandidates.filter((x) => x.mergedIntoId === c.id)) { const b = structuredClone(m); m.state = 'to_review'; m.mergedIntoId = null; touchCandidate(m, 'unmerge', b); }
      touchCandidate(c, 'back_to_review', before);
      changed();
      return { ok: true };
    },

    addToDraftValues(id) {
      const found = candidateOnBoard(id);
      if (!found) return deny('not_found');
      if (!reviews) return deny();
      const { c, p, locked } = found;
      if (c.state !== 'kept') return deny('not_kept');
      const blocked = draftBlocked(p, locked);
      if (blocked) return deny(blocked);
      const list = valueInputs(draftValues(p.id).length ? s.visionStatements : [], p.id);
      if (list.some((v) => (v.fromCandidateIds ?? []).includes(c.id))) return deny('in_draft');
      saveValues(s, p.id, [...list, { name: c.name, text: c.meaning, fromCandidateIds: [c.id] }], stamp, audit);
      changed();
      return { ok: true };
    },

    backing(candidateIds) {
      if (!candidateIds?.length) return null;
      const first = s.valueCandidates.find((x) => x.id === candidateIds[0]);
      const w = first && s.workshops.find((x) => x.id === first.workshopId);
      if (!w) return null;
      return { groups: groupsBehindValue(s.valueCandidates, candidateIds).length, of: (w.groups ?? []).length };
    },

    sendWaiting() {
      if (!device) return 0;
      const me = viewer.membershipId as string;
      let n = 0;
      for (const x of (device.valueEntries ?? []).filter((e) => e.membershipId === me)) {
        const found = groupOf(x.workshopId, x.groupId);
        // Sent only while the group is still open; anything for a closed group stays out, as for 4Q group cards.
        if (!found || enterRefusal(found)) continue;
        if (x.kind === 'candidate' && candidatesOf(s.valueCandidates, x.workshopId, x.groupId).length >= MAX_CANDIDATES) continue;
        writeEntry(found, x, true);
        n++;
      }
      device.valueEntries = (device.valueEntries ?? []).filter((e) => e.membershipId !== me);
      if (n) changed();
      return n;
    },
  };
}
