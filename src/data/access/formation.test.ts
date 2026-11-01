/** Strategy formation, part 11a (BUILD-BRIEF section 30): setup, stages, the preparer's calendar, sessions and decision logs. */
import type { ISODate } from '../../contract/caspa-data-contract';
import { departmentHeadPositions, leadershipPositions, packageAdds } from '../../rules/formation';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
const fresh = () => {
  const orgs = createReviewOrgs();
  const as = (role: Parameters<typeof devMembership>[1]) => {
    const org = orgs.find((o) => o.orgId === SWU)! as ReviewOrg;
    return createMemoryRepository(orgs.map((o) => o.store), SWU, devMembership(org, role, NOW)!, NOW);
  };
  return { as, store: orgs.find((o) => o.orgId === SWU)!.store };
};
const setUp = (f: ReturnType<typeof fresh>) =>
  f.as('strategy').formation.setUp({ title: 'Strategic Plan 2027–2031', startYear: 2027, endYear: 2031, processOwnerPositionId: 'pos-spm', preparerMembershipId: 'm-spm' });

describe('who takes part (F-2)', () => {
  it('department heads answer for the units directly below the top unit; leadership holds the Executive role', () => {
    const { store } = fresh();
    expect(departmentHeadPositions(store).sort()).toEqual(['pos-hoc', 'pos-hof', 'pos-hoo']);
    expect(leadershipPositions(store, NOW)).toEqual(['pos-md']);
  });
});

describe('setting up the next plan (F-1)', () => {
  it('the Strategy office sets it up and names the preparer; the Executive cannot', () => {
    const f = fresh();
    expect(f.as('executive').formation.setUp({ title: 'x', startYear: 2027, endYear: 2031, processOwnerPositionId: null, preparerMembershipId: null })).toEqual({ ok: false, error: 'not_allowed' });
    expect(setUp(f)).toMatchObject({ ok: true, id: 'plan-2027' }); // the seeded formed plan is the one set up
    const page = f.as('executive').formation.page();
    expect(page.plan).toMatchObject({ title: 'Strategic Plan 2027–2031', preparer: { name: 'Bwalya Musonda' }, processOwner: { label: 'Strategy and Planning Manager' } });
    expect(page.preparerOptions.map((x) => x.name)).toEqual(['Bwalya Musonda']);
    expect(page.activePlan?.title).toBe('Strategic Plan 2022–2026');
  });
  it('stages move forward only, and only the Strategy office moves them', () => {
    const f = fresh();
    setUp(f);
    const so = f.as('strategy').formation;
    expect(so.moveStage('conception', 'complete')).toEqual({ ok: false, error: 'stage_order' });
    expect(so.moveStage('conception', 'open')).toEqual({ ok: true });
    expect(f.as('executive').formation.moveStage('conception', 'complete')).toEqual({ ok: false, error: 'not_allowed' });
    expect(so.moveStage('conception', 'complete')).toEqual({ ok: true });
  });
});

describe('the formation calendar', () => {
  it('only the preparer edits and publishes; nothing reaches participants until published', () => {
    const f = fresh();
    setUp(f);
    const prep = f.as('strategy').formation;
    expect(f.as('executive').formation.saveCalendar({ stages: {}, visionTargetOn: null, planTargetOn: null })).toEqual({ ok: false, error: 'not_preparer' });
    expect(prep.saveCalendar({ stages: { conception: { startsOn: '2026-11-02' as ISODate, endsOn: '2026-10-30' as ISODate } }, visionTargetOn: null, planTargetOn: null })).toEqual({ ok: false, error: 'dates' });
    expect(prep.saveCalendar({ stages: { conception: { startsOn: '2026-11-02' as ISODate, endsOn: '2026-12-18' as ISODate } }, visionTargetOn: '2026-12-11' as ISODate, planTargetOn: '2027-03-31' as ISODate })).toEqual({ ok: true });
    expect(prep.addDeadline({ label: 'Submit department 4Q entries', ownerPositionIds: prep.departmentHeads(), dueOn: '2026-11-20' as ISODate })).toMatchObject({ ok: true });
    // The preparer is reminded until it is published; department heads see nothing yet.
    expect(f.as('strategy').home().needsYou.map((n) => n.title)).toContain('Prepare and publish the formation calendar: Strategic Plan 2027–2031');
    expect(f.as('finance').home().needsYou.some((n) => n.title === 'Submit department 4Q entries')).toBe(false);
    expect(f.as('employee').formation.page().agenda).toEqual([]);
    expect(prep.publishCalendar()).toEqual({ ok: true });
    expect(f.as('finance').home().needsYou.find((n) => n.title === 'Submit department 4Q entries')).toMatchObject({ due: '2026-11-20' });
    expect(f.as('strategy').home().needsYou.some((n) => n.title.startsWith('Prepare and publish'))).toBe(false);
    const agenda = f.as('executive').formation.page().agenda.map((i) => [i.kind, i.date]);
    expect(agenda).toEqual([['stage_opens', '2026-11-02'], ['gate_target', '2026-12-11'], ['stage_closes', '2026-12-18'], ['deadline', '2026-11-20'], ['gate_target', '2027-03-31']].sort((a, b) => (a[1]! < b[1]! ? -1 : 1)));
  });
  it('an overdue deadline reaches the owner’s supervisor after the escalation days', () => {
    const f = fresh();
    setUp(f);
    const prep = f.as('strategy').formation;
    prep.addDeadline({ label: 'Enter resource envelopes', ownerPositionIds: ['pos-hof'], dueOn: '2026-10-01' as ISODate });
    prep.publishCalendar();
    expect(f.as('executive').home().needsYou.map((n) => n.title)).toContain('Overdue: Enter resource envelopes (Head of Finance)');
  });
  it('raises what is worth checking to the process owner and Strategy office only, never blocking', () => {
    const f = fresh();
    setUp(f);
    const kinds = f.as('strategy').formation.page().checks.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'purpose_uncovered')).toHaveLength(6);
    expect(kinds).toContain('calendar_unpublished');
    expect(f.as('finance').formation.page().checks).toEqual([]);
  });
});

describe('sessions and decision logs', () => {
  it('a package adds sessions only for purposes not yet covered; participants come from positions', () => {
    const f = fresh();
    setUp(f);
    const so = f.as('strategy').formation;
    expect(so.applyPackage('lean')).toEqual({ ok: true, added: 4 });
    expect(so.applyPackage('standard')).toEqual({ ok: true, added: 0 });
    const sessions = so.page().sessions;
    expect(sessions.map((w) => [w.purposes.join('+'), w.format, w.participants]).sort()).toEqual([
      ['composition+validation', 'in_person', 4], ['four_q_review+vision', 'in_person', 4], ['kickoff', 'online', 4], ['launch', 'online', 13],
    ]);
    expect(so.page().checks.some((c) => c.kind === 'purpose_uncovered')).toBe(false);
    so.cancelSession(sessions.find((w) => w.purposes.includes('launch'))!.id);
    expect(so.page().checks).toContainEqual({ kind: 'purpose_uncovered', purpose: 'launch' });
    expect(packageAdds([], 'standard')).toHaveLength(6);
  });
  it('an asynchronous review takes a window; a vision session invites leadership only', () => {
    const f = fresh();
    setUp(f);
    const so = f.as('strategy').formation;
    expect(so.addSession({ purposes: ['four_q_review'], format: 'async_review', scheduledOn: null, window: { opensOn: '2026-11-10' as ISODate, closesOn: '2026-11-03' as ISODate } })).toEqual({ ok: false, error: 'dates' });
    expect(so.addSession({ purposes: ['vision'], format: 'in_person', scheduledOn: '2026-12-04' as ISODate, window: null }).ok).toBe(true);
    expect(so.page().sessions[0]!.participants).toBe(1);
    expect(f.as('executive').formation.addSession({ purposes: ['launch'], format: 'online', scheduledOn: null, window: null })).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('decision-log actions reach the owner’s "Needs you" once the session is held', () => {
    const f = fresh();
    setUp(f);
    const so = f.as('strategy').formation;
    const r = so.addSession({ purposes: ['kickoff'], format: 'online', scheduledOn: '2026-11-03' as ISODate, window: null }) as { ok: true; id: string };
    expect(so.addDecision(r.id, { decision: 'Adopt the lean package', actions: [{ text: 'Book the venue for day 1', ownerPositionId: 'pos-hof', dueOn: '2026-11-06' as ISODate }] })).toEqual({ ok: true });
    expect(f.as('finance').home().needsYou.some((n) => n.title === 'Book the venue for day 1')).toBe(false);
    expect(so.markHeld(r.id)).toEqual({ ok: true });
    expect(f.as('finance').home().needsYou.find((n) => n.title === 'Book the venue for day 1')).toMatchObject({ kind: 'decision_action', detail: 'Adopt the lean package' });
    expect(so.updateSession(r.id, { format: 'hybrid' })).toEqual({ ok: false, error: 'not_found' }); // held sessions are fixed
  });
});
