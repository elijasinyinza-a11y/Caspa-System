/** v0.19.0 staff survey (Staff Voice Specification v0.1, SV-1 to SV-14; contract v1.11). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { createSampleOrgs, ALL_DEV_ROLES } from '../sample/all';
import { createSeed, ORG } from '../sample/seed';
import { questionsFor, resultGroups, roundChecks, scoreAnswer, storedUnit } from '../../rules/survey';
import { createDevice } from './device';
import { createMemoryRepository } from './repository';
import type { Store } from './store';

const NOW = '2026-10-18' as ISODate;
const as = (s: Store, m: string, device = createDevice()) => createMemoryRepository([s], ORG, m, NOW, { device });
const MID = 'sr-2026-mid';
const START = 'sr-2026-start';
/** Answers every question of a form with its first option. */
const answerAll = (s: Store, m: string, device = createDevice()) => {
  const r = as(s, m, device);
  const f = r.survey.form(MID)!;
  return { r, f, choices: Object.fromEntries(f.questions.map((q) => [`${q.key}:${q.goalId ?? ''}`, q.options[0]!.value])) };
};

describe('rules', () => {
  it('asks two questions per goal, five more, and the change question only when the round asks it', () => {
    expect(questionsFor({ goalIds: ['g1', 'g2'] as never, asksAboutChanges: false })).toHaveLength(9);
    expect(questionsFor({ goalIds: ['g1', 'g2'] as never, asksAboutChanges: true }).map((q) => q.key).slice(-1)[0]).toBe('told_of_change');
  });
  it('never stores a unit smaller than a group: Zone B and Finance fold upwards (SV-2)', () => {
    const s = createSeed();
    expect(storedUnit(s, 'u-zone-b', '2026-10-12' as ISODate)).toBe('u-com');
    expect(storedUnit(s, 'u-fin', '2026-10-12' as ISODate)).toBe('u-org');
  });
  it('keeps the result of scored questions only, and "not scored" for people with no records of their own', () => {
    const q = { key: 'own_goal' as const, goalId: null };
    expect(scoreAnswer(q, 'g1', new Set(['g1']))).toBe('right');
    expect(scoreAnswer(q, 'g2', new Set(['g1']))).toBe('wrong');
    expect(scoreAnswer(q, 'g2', new Set())).toBe('not_linked');
    expect(scoreAnswer({ key: 'content', goalId: 'g2' }, 'g2', new Set())).toBe('right');
  });
  it('must fix before opening: one goal, a goal with no record, over 28 days; worth checking a "what" naming its goal', () => {
    const s = createSeed();
    const base = { title: 'Test', goalIds: ['g1', 'g2'] as never, opensOn: NOW, closesOn: '2026-11-10' as ISODate };
    expect(roundChecks(s, base, NOW)).toEqual({ mustFix: [], worth: [] });
    expect(roundChecks(s, { ...base, goalIds: ['g1'] as never }, NOW).mustFix.map((p) => p.kind)).toEqual(['too_few_goals']);
    expect(roundChecks(s, { ...base, goalIds: ['g1', 'g3'] as never }, NOW).mustFix).toEqual([{ kind: 'no_record', goalId: 'g3' }]);
    expect(roundChecks(s, { ...base, closesOn: '2026-11-20' as ISODate }, NOW).mustFix.map((p) => p.kind)).toEqual(['window_long']);
    s.communicationRecords[0]!.content = 'We will improve financial sustainability over FY2022–FY2026.';
    expect(roundChecks(s, base, NOW).worth).toEqual([{ kind: 'what_names_goal', goalId: 'g1' }]);
  });
  it('folds groups at four, five and six answers', () => {
    const s = createSeed();
    const rs = (n: number, unit: string) => Array.from({ length: n }, (_v, i) => ({ ...s.surveyResponses[0]!, id: `x-${unit}-${i}` as never, unitId: unit as never }));
    expect(resultGroups(s, rs(4, 'u-com'))).toEqual([]); // too few in total
    expect(resultGroups(s, rs(5, 'u-com')).map((g) => [g.unitId, g.responses.length])).toEqual([['u-com', 5]]);
    const mixed = [...rs(6, 'u-com'), ...rs(4, 'u-org')];
    expect(resultGroups(s, mixed).map((g) => [g.unitId, g.together, g.responses.length])).toEqual([['u-com', false, 6], ['u-org', true, 4]]);
  });
});

describe('answering (SV-2, SV-4, SV-8)', () => {
  it('writes a response with no person and no time, and a separate receipt with no answers', () => {
    const s = createSeed();
    const { r, choices } = answerAll(s, 'm-mrb');
    expect(r.survey.send(MID, choices, 'More meetings, please.')).toEqual({ ok: true });
    const resp = s.surveyResponses.find((x) => x.roundId === MID)!;
    expect(Object.keys(resp).sort()).toEqual(['concern', 'id', 'orgId', 'results', 'roundId', 'unitId']);
    expect(resp.unitId).toBe('u-com');
    expect(JSON.stringify(resp)).not.toContain('mrb');
    const rc = s.surveyReceipts.find((x) => x.roundId === MID)!;
    expect(rc).toMatchObject({ membershipId: 'm-mrb', outcome: 'answered' });
    expect(Object.keys(rc)).not.toContain('results');
    const audit = s.auditEntries.find((a) => a.entity.type === 'SurveyResponse')!;
    expect(audit).toMatchObject({ actorMembershipId: 'm-spm', after: { roundId: MID, unitId: 'u-com' } });
    expect(audit.at.slice(11, 19)).toBe('00:00:00');
  });
  it('accepts one answer per person, and stops asking once answered or declined', () => {
    const s = createSeed();
    const { r, choices } = answerAll(s, 'm-mrb');
    expect(r.home().needsYou.some((i) => i.key === `survey:answer:${MID}`)).toBe(true);
    r.survey.send(MID, choices, '');
    expect(as(s, 'm-mrb').survey.send(MID, choices, '')).toEqual({ ok: false, error: 'already_answered' });
    expect(as(s, 'm-mrb').home().needsYou.some((i) => i.key.startsWith('survey:'))).toBe(false);
    expect(as(s, 'm-mrb').survey.home().open?.state).toBe('answered');
    const co = as(s, 'm-co');
    expect(co.survey.decline(MID)).toEqual({ ok: true });
    expect(s.surveyReceipts.find((x) => x.membershipId === 'm-co' && x.roundId === MID)!.outcome).toBe('declined');
    expect(s.surveyResponses.filter((x) => x.roundId === MID)).toHaveLength(1);
    expect(as(s, 'm-co').survey.form(MID)).toBeNull();
  });
  it('scores the goal question against the cascade: Mary’s work is under G1', () => {
    const s = createSeed();
    const r = as(s, 'm-mrb');
    const f = r.survey.form(MID)!;
    const choices = Object.fromEntries(f.questions.map((q) => [`${q.key}:${q.goalId ?? ''}`, q.key === 'own_goal' ? 'g1' : 'dont_know']));
    r.survey.send(MID, choices, '');
    const res = s.surveyResponses.find((x) => x.roundId === MID)!.results;
    expect(res.find((x) => x.question === 'own_goal')!.value).toBe('right');
    expect(res.filter((x) => x.question === 'content').map((x) => x.value)).toEqual(['dont_know', 'dont_know']);
  });
  it('waits on the device offline, sends when back online, and keeps a refused answer as "couldn’t be sent"', () => {
    const s = createSeed();
    const device = createDevice();
    const { r, choices } = answerAll(s, 'm-mrb', device);
    r.progress.setOffline(true);
    expect(r.survey.send(MID, choices, '')).toEqual({ ok: true, queued: true });
    expect(s.surveyResponses.some((x) => x.roundId === MID)).toBe(false);
    expect(as(s, 'm-mrb', device).survey.home().open?.state).toBe('waiting');
    as(s, 'm-mrb', device).progress.setOffline(false);
    expect(s.surveyResponses.filter((x) => x.roundId === MID)).toHaveLength(1);

    const s2 = createSeed();
    const d2 = createDevice();
    const a = answerAll(s2, 'm-co', d2);
    a.r.progress.setOffline(true);
    a.r.survey.send(MID, a.choices, '');
    as(s2, 'm-spm').survey.closeRound(MID);
    as(s2, 'm-co', d2).progress.setOffline(false);
    expect(as(s2, 'm-co', d2).survey.home().open).toBeNull(); // the round closed
    expect(d2.survey[0]!.failure).toBe('round_closed');
    expect(s2.surveyResponses.some((x) => x.roundId === MID)).toBe(false);
  });
});

describe('who sees what (SV-5, SV-7, SV-14)', () => {
  it('everyone asked sees the organisation’s results, in sentences, with three key facts', () => {
    const r = as(createSeed(), 'm-mrb').survey.staffResults(START)!;
    expect([r.asked, r.block!.answered]).toEqual([13, 12]);
    expect(r.block!.lines[0]!.text).toBe('10 of 12 recognised what is changing under “Improve financial sustainability”.');
    expect(r.block!.lines[0]!.counts).toEqual([{ word: 'Recognised', n: 10 }, { word: 'Didn’t recognise', n: 1 }, { word: 'Not sure', n: 1 }]);
    expect([r.block!.strongest, r.block!.weakest]).toEqual([{ area: 'content', positive: 19, of: 24 }, { area: 'interaction', positive: 21, of: 36 }]);
    expect(r.block!.notLinked).toBe(1);
  });
  it('the Strategy office reads comments by group; the Executive sees counts and only an accepted summary', async () => {
    const s = createSeed();
    const so = as(s, 'm-spm').survey.tab()!;
    const round = so.rounds.find((x) => x.id === START)!;
    expect(round.concerns!.map((c) => c.group)).toEqual(['Commercial', 'Commercial', 'Other units, shown together']);
    expect(round.compare!.map((c) => [c.name, c.answered])).toEqual([['Whole organisation', 12], ['Commercial', 6], ['Other units, shown together', 6]]);
    expect(round.coverage!.map((c) => [c.name, c.met, c.of])).toEqual([['Commercial', 5, 6], ['Other units, shown together', 3, 6]]);
    const ex = () => as(s, 'm-md').survey.tab()!.rounds.find((x) => x.id === START)!;
    expect([ex().concerns, ex().summary, ex().concernCount]).toEqual([null, null, 3]);
    const d = await as(s, 'm-spm').survey.draftSummary(START);
    expect(d.ok && d.text).toMatch(/^Two themes/);
    if (d.ok) expect(as(s, 'm-spm').survey.acceptSummary(START, d.text, d.aiTaskId)).toEqual({ ok: true });
    expect(ex().summary?.accepted).toBe(true);
    expect(as(s, 'm-md').survey.acceptSummary(START, 'x', 'y')).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('a department head sees only their department, and "too few" below the group size', () => {
    const t = as(createSeed(), 'm-hoo').survey.tab()!;
    expect(t.role).toBe('department_head');
    const r = t.rounds.find((x) => x.id === START)!;
    expect(r.unit).toEqual({ name: 'Operations', block: null });
    expect([r.whole, r.compare, r.concerns, r.coverage]).toEqual([null, null, null, null]);
  });
  it('people without an oversight role get no tab; while open, only counts of who answered', () => {
    const s = createSeed();
    expect(as(s, 'm-mrb').survey.tab()).toBeNull();
    const { r, choices } = answerAll(s, 'm-mrb');
    r.survey.send(MID, choices, '');
    const open = as(s, 'm-spm').survey.tab()!.rounds.find((x) => x.id === MID)!;
    expect(open.openCount).toEqual({ answered: 1, byGroup: [{ name: 'Commercial', n: 1 }] });
    expect([open.whole, open.concerns]).toEqual([null, null]);
    expect(as(s, 'm-md').survey.tab()!.rounds.find((x) => x.id === MID)!.openCount!.byGroup).toEqual([]);
  });
});

describe('running rounds (SV-4, SV-13)', () => {
  it('the Strategy office saves, opens and closes a round, and writes the closing note; others cannot', () => {
    const s = createSeed();
    const so = as(s, 'm-spm').survey;
    const d = { title: 'Start of year, 2027', goalIds: ['g1'], opensOn: NOW, closesOn: '2026-11-10' as ISODate, asksAboutChanges: false };
    expect(so.saveRound(d)).toEqual({ ok: false, error: 'must_fix' });
    expect(as(s, 'm-md').survey.saveRound({ ...d, goalIds: ['g1', 'g2'] })).toEqual({ ok: false, error: 'not_allowed' });
    expect(so.saveRound({ ...d, goalIds: ['g1', 'g2'] })).toEqual({ ok: true });
    const id = s.surveyRounds[s.surveyRounds.length - 1]!.id;
    expect(as(s, 'm-spm').survey.openRound(id)).toEqual({ ok: true });
    expect(as(s, 'm-spm').survey.closeRound(id)).toEqual({ ok: true });
    expect(s.surveyRounds[s.surveyRounds.length - 1]!.closesOn).toBe(NOW);
    expect(as(s, 'm-spm').survey.saveNote(START, 'Department heads will hold plan meetings.')).toEqual({ ok: true });
    expect(as(s, 'm-mrb').survey.staffResults(START)!.note).toEqual({ text: 'Department heads will hold plan meetings.', on: NOW });
    expect(as(s, 'm-md').survey.saveNote(START, 'x')).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('nothing prompts the Strategy office to run a round: no "Needs you" item for it', () => {
    const s = createSeed();
    s.surveyRounds = []; s.surveyResponses = []; s.surveyReceipts = [];
    expect(as(s, 'm-spm').home().needsYou.some((i) => i.key.startsWith('survey'))).toBe(false);
    expect(as(s, 'm-spm').survey.tab()!.rounds).toEqual([]);
  });
});

describe('every organisation and role', () => {
  it('computes home, tab and results without error; the NGO shows "too few", the manufacturer no rounds', () => {
    for (const o of createSampleOrgs()) {
      for (const role of ALL_DEV_ROLES) {
        const m = (o.devRoles as Record<string, string>)[role];
        if (!m) continue;
        const r = createMemoryRepository([o.store], o.orgId, m, NOW);
        r.survey.home(); r.survey.tab(); r.survey.needs();
        for (const x of o.store.surveyRounds) r.survey.staffResults(x.id);
      }
    }
    const [, ngo, mfg, scale] = createSampleOrgs();
    expect(createMemoryRepository([ngo!.store], ngo!.orgId, ngo!.devRoles.strategy, NOW).survey.tab()!.rounds[0]!.whole).toBeNull();
    expect(createMemoryRepository([mfg!.store], mfg!.orgId, mfg!.devRoles.strategy, NOW).survey.tab()!.rounds).toEqual([]);
    const sc = createMemoryRepository([scale!.store], scale!.orgId, scale!.devRoles.strategy, NOW).survey.tab()!.rounds[0]!;
    expect(sc.whole!.answered).toBe(scale!.store.surveyResponses.length);
    expect(sc.compare!.reduce((a, c, i) => (i ? a + c.answered : a), 0)).toBe(sc.whole!.answered); // groups sum to the whole
  });
  it('stays quick with thousands of answers', () => {
    const scale = createSampleOrgs()[3]!;
    const s = scale.store;
    const base = s.surveyResponses[0]!;
    for (let i = 0; i < 5000; i++) s.surveyResponses.push({ ...base, id: `vol-${i}` as never, unitId: s.units[i % s.units.length]!.id });
    const t0 = performance.now();
    const t = createMemoryRepository([s], scale.orgId, scale.devRoles.strategy, NOW).survey.tab()!;
    expect(t.rounds[0]!.whole!.answered).toBeGreaterThan(5000);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});
