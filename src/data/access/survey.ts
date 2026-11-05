/**
 * Staff survey data access (v0.19.0; Staff Voice Specification v0.1; contract v1.11). Answers and who answered are
 * written to separate records that nothing links (SV-2). Every figure is computed here from stored records and
 * never stored. Who sees what (SV-5, SV-7):
 * - everyone asked: their own answering status, and the organisation's results once the round closes;
 * - the Strategy office: every count, comments with their group, the coverage view, and runs rounds;
 * - the Executive: counts, the coverage view and the accepted summary of comments, never the comments;
 * - department heads: counts for their own department and below, when it reaches the small-group size.
 */
import type { DraftMeta, ISODate, ISODateTime, SurveyAnswerValue, SurveyReceipt, SurveyResponse, SurveyRound } from '../../contract/caspa-data-contract';
import { aiStub } from '../../ai';
import { accountablePositionOfUnit } from '../../rules/structure';
import {
  ANSWERS, AREA_OF, CONCERN_MAX, NOTE_MAX, SURVEY_AREAS, answerCounts, arrivalCheck, askedOn, eligibleGoals, goalsOfOwnWork,
  questionsFor, resultGroups, roundChecks, scoreAnswer, storedUnit, unitChain, type ArrivalFailure, type RoundCaution,
  type RoundProblem, type SurveyArea, type SurveyQuestion,
} from '../../rules/survey';
import type { NeedsYouItem } from '../../selectors/needs-you';
import { dateInZone } from '../../selectors/format';
import { en } from '../../strings/en';
import type { Device, DeviceSurvey } from './device';
import type { Store } from './store';
import type { Viewer } from './viewer';

const S = en.survey;

interface Ctx {
  s: Store;
  viewer: Viewer;
  now: ISODate;
  clock: () => ISODateTime;
  device: Device;
  changed: () => void;
}

export interface QuestionLine {
  key: SurveyQuestion['key'];
  goalId: string | null;
  area: SurveyArea;
  text: string;
  positive: number;
  of: number;
  counts: { word: string; n: number }[];
}
export interface ResultsBlock {
  answered: number;
  lines: QuestionLine[];
  areas: { area: SurveyArea; positive: number; of: number }[];
  strongest: { area: SurveyArea; positive: number; of: number } | null;
  weakest: { area: SurveyArea; positive: number; of: number } | null;
  notLinked: number;
}
export interface FormQuestion {
  index: number;
  key: SurveyQuestion['key'];
  goalId: string | null;
  area: SurveyArea;
  prompt: string;
  quote: string | null; // the record's "What changes", for "Which goal is this?"
  options: { value: string; label: string }[];
}
export interface SurveyForm {
  roundId: string;
  title: string;
  minGroup: number;
  questions: FormQuestion[];
}
export type HomeState = 'open' | 'answered' | 'declined' | 'waiting' | 'failed';
export interface SurveyHome {
  open: { roundId: string; title: string; closesOn: ISODate; state: HomeState; failure: ArrivalFailure | null } | null;
  closed: { roundId: string; title: string }[];
}
export interface StaffResults {
  title: string;
  opensOn: ISODate;
  closesOn: ISODate;
  asked: number;
  note: { text: string; on: ISODate } | null;
  block: ResultsBlock | null; // null when too few answered
}
export interface CompareColumn { name: string; answered: number; areas: { area: SurveyArea; positive: number; of: number }[] }
export interface TabRound {
  id: string;
  title: string;
  status: SurveyRound['status'];
  goals: string;
  opensOn: ISODate;
  closesOn: ISODate;
  asked: number;
  openCount: { answered: number; byGroup: { name: string; n: number }[] } | null;
  note: { text: string; on: ISODate } | null;
  whole: ResultsBlock | null;
  compare: CompareColumn[] | null;
  coverage: { name: string; meetings: ISODate[]; met: number; of: number }[] | null;
  concerns: { text: string; group: string }[] | null;
  concernCount: number;
  summary: { text: string; accepted: boolean } | null;
  unit: { name: string; block: ResultsBlock | null } | null;
  can: { open: boolean; close: boolean; note: boolean; summary: boolean };
}
export interface SurveyTab {
  role: 'strategy_office' | 'executive' | 'department_head';
  minGroup: number;
  rounds: TabRound[];
  canCreate: boolean;
}
export interface RoundDraft { title: string; goalIds: string[]; opensOn: ISODate; closesOn: ISODate; asksAboutChanges: boolean }
export interface RoundCheckView { mustFix: string[]; worth: string[] }

export type SurveyResult = { ok: true } | { ok: false; error: string };

export interface SurveyAccess {
  home(): SurveyHome;
  needs(): NeedsYouItem[];
  form(roundId: string): SurveyForm | null;
  send(roundId: string, choices: Record<string, string>, concern: string): SurveyResult & { queued?: boolean };
  decline(roundId: string): SurveyResult;
  removeFailed(roundId: string): SurveyResult;
  /** Sends what waits on this device for this person; called when they go back online. */
  sendWaiting(): { sent: number; failed: number };
  staffResults(roundId: string): StaffResults | null;
  tab(): SurveyTab | null;
  newRound(): { goals: { id: string; label: string; ok: boolean }[]; suggested: string[]; defaults: RoundDraft };
  check(d: RoundDraft): RoundCheckView;
  saveRound(d: RoundDraft): SurveyResult;
  openRound(roundId: string): SurveyResult;
  closeRound(roundId: string): SurveyResult;
  saveNote(roundId: string, text: string): SurveyResult;
  draftSummary(roundId: string): Promise<{ ok: true; text: string; aiTaskId: string } | { ok: false; error: string }>;
  acceptSummary(roundId: string, text: string, aiTaskId: string): SurveyResult;
}

const pctLess = (a: { positive: number; of: number }, b: { positive: number; of: number }) => a.positive * b.of < b.positive * a.of;

export function createSurveyAccess(c: Ctx): SurveyAccess {
  const { s, viewer: v, now, device } = c;
  const me = v.membershipId as string;
  const min = () => s.organisation.settings.consultationMinGroupSize;
  const isSO = v.roles.includes('strategy_office');
  const isExec = v.roles.includes('executive');
  const root = () => s.units.find((u) => u.parentId === null)!.id as string;
  const unitName = (id: string) => s.units.find((u) => u.id === id)?.name ?? '';
  const goalTitle = (id: string) => s.goals.find((g) => g.id === id)?.title ?? '';
  const goalCode = (id: string) => s.goals.find((g) => g.id === id)?.code ?? '';
  const round = (id: string) => s.surveyRounds.find((r) => r.id === id);
  const responsesOf = (id: string) => s.surveyResponses.filter((r) => r.roundId === id);
  const asked = (r: SurveyRound) => askedOn(s, r.opensOn);
  const wasAsked = (r: SurveyRound) => asked(r).find((a) => a.membershipId === me) ?? null;
  const receipt = (r: SurveyRound) => s.surveyReceipts.find((x) => x.roundId === r.id && x.membershipId === me);
  const onDevice = (roundId: string) => (device.survey ?? []).find((x) => x.membershipId === me && x.roundId === roundId);
  const offline = () => !!device.offline[me];
  const stamp = () => ({ at: c.clock(), byMembershipId: v.membershipId });
  const today = () => dateInZone(c.clock(), s.organisation.timeZone);
  /** Department heads: the accountable position of a unit directly below the top unit (D16-5 sense). */
  const headedUnits = () => s.units.filter((u) => u.parentId === root() && (() => { const p = accountablePositionOfUnit(s, u.id); return !!p && v.positionIds.includes(p as never); })()).map((u) => u.id as string);

  /* ── results (selectors over responses; never stored) ── */
  const block = (r: SurveyRound, rs: SurveyResponse[]): ResultsBlock | null => {
    if (rs.length < min()) return null;
    const lines: QuestionLine[] = questionsFor(r).map((q) => {
      const counts = answerCounts(rs, q.key, q.goalId);
      const values = ANSWERS[q.key];
      const of = values.reduce((a, x) => a + (counts[x] ?? 0), 0);
      const positive = counts[values[0]!] ?? 0;
      const words = S.results.words[q.key]!;
      return {
        key: q.key, goalId: q.goalId, area: AREA_OF[q.key], positive, of,
        text: S.results.say[q.key]!(positive, of, q.goalId ? goalTitle(q.goalId) : ''),
        counts: values.map((x, i) => ({ word: words[i]!, n: counts[x] ?? 0 })),
      };
    });
    const areas = SURVEY_AREAS.map((area) => {
      const x = lines.filter((l) => l.area === area);
      return { area, positive: x.reduce((a, l) => a + l.positive, 0), of: x.reduce((a, l) => a + l.of, 0) };
    }).filter((a) => a.of > 0);
    // Fixed rule (SV-14): highest and lowest share; ties go to the area listed first.
    const strongest = areas.reduce<typeof areas[number] | null>((b, a) => (!b || pctLess(b, a) ? a : b), null);
    const weakest = areas.reduce<typeof areas[number] | null>((b, a) => (!b || pctLess(a, b) ? a : b), null);
    const notLinked = rs.filter((x) => x.results.some((y) => y.question === 'own_goal' && y.value === 'not_linked')).length;
    return { answered: rs.length, lines, areas, strongest, weakest, notLinked };
  };
  const groupName = (g: { unitId: string; together: boolean }) => (g.together ? S.results.together : unitName(g.unitId));
  const noteOf = (r: SurveyRound) => (r.closingNote ? { text: r.closingNote.text, on: dateInZone(r.closingNote.written.at, s.organisation.timeZone) } : null);

  /* ── answering ── */
  const form = (roundId: string): SurveyForm | null => {
    const r = round(roundId);
    if (!r || r.status !== 'open' || !wasAsked(r) || receipt(r) || onDevice(roundId)) return null;
    const allGoals = s.goals.filter((g) => g.planId === r.planId);
    // A fixed shuffle per round and question, computed, never stored, so the right answer is not always first.
    const order = <T,>(items: T[], seed: string, key: (x: T) => string) => [...items].sort((a, b) => hash(seed + key(a)) - hash(seed + key(b)));
    const questions = questionsFor(r).map((q, index): FormQuestion => {
      const area = AREA_OF[q.key];
      if (q.key === 'content' || q.key === 'own_goal') {
        const opts = order(allGoals, `${r.id}:${q.key}:${q.goalId ?? ''}`, (g) => g.id).map((g) => ({ value: g.id as string, label: g.title }));
        const rec = q.goalId ? s.communicationRecords.find((x) => x.goalId === q.goalId) : null;
        return { index, key: q.key, goalId: q.goalId, area, prompt: S.q[q.key] as string, quote: rec?.content ?? null, options: [...opts, { value: 'dont_know', label: S.choice.dont_know! }] };
      }
      if (q.key === 'context') {
        const opts = order(r.goalIds as string[], `${r.id}:context:${q.goalId}`, (g) => g).map((g) => ({ value: g, label: s.communicationRecords.find((x) => x.goalId === g)?.context ?? '' }));
        return { index, key: q.key, goalId: q.goalId, area, prompt: S.q.context(goalTitle(q.goalId!)), quote: null, options: [...opts, { value: 'dont_know', label: S.choice.dont_know! }] };
      }
      const labels = ANSWERS[q.key].map((x) => ({ value: x as string, label: S.choice[x]! }));
      return { index, key: q.key, goalId: null, area, prompt: S.q[q.key] as string, quote: null, options: labels };
    });
    return { roundId, title: r.title, minGroup: min(), questions };
  };

  const deliver = (item: DeviceSurvey): ArrivalFailure | null => {
    const fail = arrivalCheck(s, item.roundId, item.membershipId);
    if (fail) return fail;
    const r = round(item.roundId)!;
    const on = today();
    // Two records, written apart, with nothing shared but the round (SV-2). The response keeps no time and no person.
    const rid = `rs-${r.id}-${hash(`${item.id}:${s.surveyResponses.length}`).toString(36)}`;
    const response: SurveyResponse = { orgId: s.organisation.id, id: rid as SurveyResponse['id'], roundId: r.id, unitId: item.unitId as SurveyResponse['unitId'], results: item.results, concern: item.concern };
    const receiptRec: SurveyReceipt = { orgId: s.organisation.id, id: `srr-${r.id}-${me}` as SurveyReceipt['id'], roundId: r.id, membershipId: item.membershipId as SurveyReceipt['membershipId'], outcome: 'answered', on };
    // Responses are kept in a computed order, never the order they arrived.
    s.surveyResponses.push(response);
    s.surveyResponses.sort((a, b) => a.roundId.localeCompare(b.roundId) || hash(a.id) - hash(b.id));
    s.surveyReceipts.push(receiptRec);
    // The one audit entry names the round and unit only; its actor is the round's opener, and its time the start of
    // the day, so nothing in it points back to the person who answered (contract v1.11).
    s.auditEntries.push({
      id: `au-${s.auditEntries.length + 1}` as never, orgId: s.organisation.id, at: `${on}T00:00:00+00:00` as ISODateTime,
      actorMembershipId: r.openedBy?.byMembershipId ?? v.membershipId, action: 'create', entity: { type: 'SurveyResponse', id: r.id }, before: null, after: { roundId: r.id, unitId: item.unitId },
    });
    return null;
  };

  const send = (roundId: string, choices: Record<string, string>, concern: string): SurveyResult & { queued?: boolean } => {
    const r = round(roundId);
    if (!r) return { ok: false, error: 'round_closed' };
    const who = wasAsked(r);
    if (!who) return { ok: false, error: 'not_asked' };
    if (receipt(r) || onDevice(roundId)) return { ok: false, error: 'already_answered' };
    if (concern.trim().length > CONCERN_MAX) return { ok: false, error: 'too_long' };
    const own = goalsOfOwnWork(s, who.positionIds, who.personId, now);
    const results = questionsFor(r).flatMap((q) => {
      const choice = choices[`${q.key}:${q.goalId ?? ''}`];
      return choice ? [{ question: q.key, goalId: (q.goalId ?? null) as SurveyResponse['results'][number]['goalId'], value: scoreAnswer(q, choice, own) as SurveyAnswerValue }] : [];
    });
    const item: DeviceSurvey = {
      id: `ds-${device.seq++}`, membershipId: me, roundId, unitId: storedUnit(s, who.unitId, r.opensOn), results, concern: concern.trim() || null, failure: null,
    };
    (device.survey ??= []).push(item);
    if (offline()) { c.changed(); return { ok: true, queued: true }; }
    const fail = deliver(item);
    if (fail) { item.failure = fail; c.changed(); return { ok: false, error: fail }; }
    device.survey = device.survey.filter((x) => x !== item);
    c.changed();
    return { ok: true };
  };

  const sendWaiting = () => {
    let sent = 0, failed = 0;
    for (const item of (device.survey ?? []).filter((x) => x.membershipId === me && !x.failure)) {
      const fail = deliver(item);
      if (fail) { item.failure = fail; failed++; } else { device.survey = device.survey.filter((x) => x !== item); sent++; }
    }
    if (sent || failed) c.changed();
    return { sent, failed };
  };

  const decline = (roundId: string): SurveyResult => {
    const r = round(roundId);
    if (!r || r.status !== 'open') return { ok: false, error: 'round_closed' };
    if (!wasAsked(r)) return { ok: false, error: 'not_asked' };
    if (receipt(r) || onDevice(roundId)) return { ok: false, error: 'already_answered' };
    s.surveyReceipts.push({ orgId: s.organisation.id, id: `srr-${r.id}-${me}` as SurveyReceipt['id'], roundId: r.id, membershipId: v.membershipId, outcome: 'declined', on: today() });
    c.changed();
    return { ok: true };
  };

  const home = (): SurveyHome => {
    const mine = s.surveyRounds.filter((r) => r.status !== 'draft' && wasAsked(r));
    const o = mine.find((r) => r.status === 'open') ?? null;
    let open: SurveyHome['open'] = null;
    if (o) {
      const dev = onDevice(o.id), rc = receipt(o);
      const state: HomeState = dev ? (dev.failure ? 'failed' : 'waiting') : rc ? (rc.outcome === 'declined' ? 'declined' : 'answered') : 'open';
      open = { roundId: o.id, title: o.title, closesOn: o.closesOn, state, failure: dev?.failure ?? null };
    }
    const closed = mine.filter((r) => r.status === 'closed' && responsesOf(r.id).length >= min()).map((r) => ({ roundId: r.id, title: r.title }));
    return { open, closed };
  };

  const needs = (): NeedsYouItem[] => {
    const h = home();
    if (!h.open || h.open.state !== 'open') return [];
    const daysOverdue = Math.round((Date.parse(now) - Date.parse(h.open.closesOn)) / 864e5);
    return [{
      key: `survey:answer:${h.open.roundId}`, kind: 'deadline', title: S.needs.title, detail: S.needs.detail(h.open.title),
      due: h.open.closesOn, daysOverdue, severity: null, as: null, link: { kind: 'survey', roundId: h.open.roundId },
    }];
  };

  const staffResults = (roundId: string): StaffResults | null => {
    const r = round(roundId);
    if (!r || r.status !== 'closed' || !wasAsked(r)) return null;
    return { title: r.title, opensOn: r.opensOn, closesOn: r.closesOn, asked: asked(r).length, note: noteOf(r), block: block(r, responsesOf(r.id)) };
  };

  /* ── the Staff survey tab, for the Strategy office, the Executive and department heads ── */
  const tabRole = (): SurveyTab['role'] | null => (isSO ? 'strategy_office' : isExec ? 'executive' : headedUnits().length ? 'department_head' : null);

  const tabRound = (r: SurveyRound, role: SurveyTab['role']): TabRound => {
    const rs = responsesOf(r.id);
    const base: TabRound = {
      id: r.id, title: r.title, status: r.status, goals: r.goalIds.map(goalCode).join(', '), opensOn: r.opensOn, closesOn: r.closesOn, asked: asked(r).length,
      openCount: null, note: noteOf(r), whole: null, compare: null, coverage: null, concerns: null, concernCount: rs.filter((x) => x.concern).length,
      summary: null, unit: null, can: { open: false, close: false, note: false, summary: false },
    };
    if (role === 'strategy_office') base.can = { open: r.status === 'draft', close: r.status === 'open', note: r.status === 'closed' && !r.closingNote, summary: r.status === 'closed' };
    if (r.status === 'open') {
      // SV-6: while open, how many have answered only, and to the Strategy office by group, folded the same way.
      const answered = s.surveyReceipts.filter((x) => x.roundId === r.id && x.outcome === 'answered');
      let byGroup: { name: string; n: number }[] = [];
      if (role === 'strategy_office') {
        const units = asked(r);
        const groups = new Map<string, number>();
        for (const x of answered) {
          const a = units.find((u) => u.membershipId === x.membershipId);
          const g = a ? storedUnit(s, a.unitId, r.opensOn) : root();
          const name = g === root() ? en.survey.tabPage.otherUnits : unitName(g);
          groups.set(name, (groups.get(name) ?? 0) + 1);
        }
        byGroup = [...groups].map(([name, n]) => ({ name, n }));
      }
      base.openCount = { answered: answered.length, byGroup };
      return base;
    }
    if (r.status !== 'closed') return base;
    if (role === 'department_head') {
      const units = headedUnits();
      const mine = rs.filter((x) => unitChain(s, x.unitId).some((u) => units.includes(u)));
      base.unit = { name: units.map(unitName).join(', '), block: block(r, mine) };
      return base;
    }
    base.whole = block(r, rs);
    const groups = resultGroups(s, rs);
    base.compare = base.whole ? [
      { name: S.results.wholeOrg, answered: rs.length, areas: base.whole.areas },
      ...groups.map((g) => ({ name: groupName(g), answered: g.responses.length, areas: block(r, g.responses)?.areas ?? [] })),
    ] : null;
    const groupUnits = groups.filter((g) => !g.together).map((g) => g.unitId);
    const meetings = s.communicationRecords.filter((x) => r.goalIds.includes(x.goalId)).flatMap((x) => x.meetings)
      .filter((m) => m.heldOn.slice(0, 4) === r.closesOn.slice(0, 4));
    base.coverage = groups.map((g) => ({
      name: groupName(g),
      meetings: meetings.filter((m) => (g.together ? !unitChain(s, m.unitId).some((u) => groupUnits.includes(u)) : unitChain(s, m.unitId).includes(g.unitId))).map((m) => m.heldOn).sort(),
      met: g.responses.filter((x) => x.results.some((y) => y.question === 'team_met' && y.value === 'yes')).length,
      of: g.responses.length,
    }));
    if (role === 'strategy_office') {
      const shownIn = new Map<string, string>();
      for (const g of groups) for (const x of g.responses) shownIn.set(x.id, groupName(g));
      base.concerns = rs.filter((x) => x.concern).map((x) => ({ text: x.concern!, group: shownIn.get(x.id) ?? S.results.together }));
      base.summary = r.concernSummary ? { text: r.concernSummary.text, accepted: r.concernSummary.draft.state !== 'ai_draft' } : null;
    } else if (r.concernSummary && r.concernSummary.draft.state !== 'ai_draft') {
      base.summary = { text: r.concernSummary.text, accepted: true };
    }
    return base;
  };

  const tab = (): SurveyTab | null => {
    const role = tabRole();
    if (!role) return null;
    const rounds = s.surveyRounds.filter((r) => role === 'strategy_office' || r.status !== 'draft');
    return { role, minGroup: min(), rounds: [...rounds].reverse().map((r) => tabRound(r, role)), canCreate: role === 'strategy_office' };
  };

  const activePlan = () => s.plans.find((p) => p.status === 'active');
  const newRound = () => {
    const plan = activePlan();
    const year = Number(now.slice(0, 4));
    const goals = plan ? eligibleGoals(s, plan.id).map(({ goal, ok }) => ({ id: goal.id as string, label: `${goal.code} ${goal.title}`, ok })) : [];
    const opensOn = now;
    const closesOn = addDays(now, 27);
    return { goals, suggested: S.form.suggested(year), defaults: { title: '', goalIds: [] as string[], opensOn, closesOn, asksAboutChanges: false } };
  };
  const describe = (p: RoundProblem) => S.form.problems[p.kind]!;
  const describeCaution = (w: RoundCaution) => S.form.whatNamesGoal(`${goalCode(w.goalId)} ${goalTitle(w.goalId)}`);
  const check = (d: RoundDraft): RoundCheckView => {
    const r = roundChecks(s, { ...d, goalIds: d.goalIds as never }, now);
    return { mustFix: [...new Set(r.mustFix.map(describe))], worth: r.worth.map(describeCaution) };
  };
  const saveRound = (d: RoundDraft): SurveyResult => {
    if (!isSO) return { ok: false, error: 'not_allowed' };
    const plan = activePlan();
    if (!plan || check(d).mustFix.length) return { ok: false, error: 'must_fix' };
    const st = stamp();
    s.surveyRounds.push({
      orgId: s.organisation.id, id: `sr-${s.surveyRounds.length + 1}-${hash(d.title).toString(36)}` as SurveyRound['id'], planId: plan.id, title: d.title.trim(),
      asksAboutChanges: d.asksAboutChanges, goalIds: d.goalIds as never, opensOn: d.opensOn, closesOn: d.closesOn, status: 'draft',
      openedBy: null, closedBy: null, closingNote: null, concernSummary: null, created: st, updated: st,
    });
    audit('create', s.surveyRounds[s.surveyRounds.length - 1]!.id, null, { title: d.title.trim(), goalIds: d.goalIds });
    c.changed();
    return { ok: true };
  };
  const audit = (action: string, id: string, before: unknown, after: unknown) => {
    s.auditEntries.push({ id: `au-${s.auditEntries.length + 1}` as never, orgId: s.organisation.id, at: c.clock(), actorMembershipId: v.membershipId, action, entity: { type: 'SurveyRound', id }, before, after });
  };
  const openRound = (id: string): SurveyResult => {
    const r = round(id);
    if (!isSO || !r || r.status !== 'draft') return { ok: false, error: 'not_allowed' };
    if (check({ ...r, goalIds: r.goalIds as string[] }).mustFix.length) return { ok: false, error: 'must_fix' };
    r.status = 'open'; r.openedBy = stamp(); r.updated = r.openedBy;
    audit('open', id, { status: 'draft' }, { status: 'open' });
    c.changed();
    return { ok: true };
  };
  const closeRound = (id: string): SurveyResult => {
    const r = round(id);
    if (!isSO || !r || r.status !== 'open') return { ok: false, error: 'not_allowed' };
    r.status = 'closed'; r.closedBy = stamp(); r.updated = r.closedBy;
    if (r.closesOn > now) r.closesOn = now;
    audit('close', id, { status: 'open' }, { status: 'closed', closesOn: r.closesOn });
    c.changed();
    return { ok: true };
  };
  const saveNote = (id: string, text: string): SurveyResult => {
    const r = round(id);
    if (!isSO || !r || r.status !== 'closed') return { ok: false, error: 'not_allowed' };
    const t = text.trim();
    if (!t) return { ok: false, error: 'note_empty' };
    if (t.length > NOTE_MAX) return { ok: false, error: 'too_long' };
    const before = r.closingNote;
    r.closingNote = { text: t, written: stamp() }; r.updated = r.closingNote.written;
    audit('update', id, { closingNote: before }, { closingNote: r.closingNote });
    c.changed();
    return { ok: true };
  };
  const draftSummary = async (id: string) => {
    const r = round(id);
    if (!isSO || !r || r.status !== 'closed') return { ok: false as const, error: 'not_allowed' };
    // Only the comments' text is sent, never units (SV-7).
    const out = await aiStub.summariseConcerns(responsesOf(id).filter((x) => x.concern).map((x) => x.concern!));
    const task = { orgId: s.organisation.id, id: `ai-survey-${s.aiTasks.length + 1}` as never, kind: 'summarise' as const, requested: stamp(), inputRefs: [{ type: 'SurveyRound', id }], outputRefs: [{ type: 'SurveyRound', id }], model: 'stub' };
    s.aiTasks.push(task);
    return { ok: true as const, text: out.text, aiTaskId: task.id as string };
  };
  const acceptSummary = (id: string, text: string, aiTaskId: string): SurveyResult => {
    const r = round(id);
    if (!isSO || !r || r.status !== 'closed' || !text.trim()) return { ok: false, error: 'not_allowed' };
    const st = stamp();
    const draft: DraftMeta = { state: 'accepted', provenance: { kind: 'ai_suggestion', aiTaskId: aiTaskId as never }, decided: st };
    r.concernSummary = { text: text.trim(), draft }; r.updated = st;
    audit('update', id, null, { concernSummary: 'accepted' });
    c.changed();
    return { ok: true };
  };
  const removeFailed = (roundId: string): SurveyResult => {
    const it = onDevice(roundId);
    if (!it || !it.failure) return { ok: false, error: 'not_allowed' };
    device.survey = device.survey.filter((x) => x !== it);
    c.changed();
    return { ok: true };
  };

  return { home, needs, form, send, decline, removeFailed, sendWaiting, staffResults, tab, newRound, check, saveRound, openRound, closeRound, saveNote, draftSummary, acceptSummary };
}

function hash(x: string): number {
  let h = 2166136261;
  for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function addDays(d: ISODate, n: number): ISODate {
  const t = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)) + n));
  return t.toISOString().slice(0, 10) as ISODate;
}
