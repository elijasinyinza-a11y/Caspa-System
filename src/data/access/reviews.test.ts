/** v0.20.0 Performance › Reviews (Reviews Specification v0.1, RV-1 to RV-10; R7–R9; contract v1.12). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { rateContract } from '../../rules/rating';
import { createSampleOrgs, ALL_DEV_ROLES } from '../sample/all';
import { createSeed, ORG } from '../sample/seed';
import { createDevice } from './device';
import { createMemoryRepository } from './repository';
import type { Store } from './store';

const NOW = '2026-10-18' as ISODate;
const RV = 'rv-mrb-2026-mid';
const as = (s: Store, m: string, device = createDevice()) => createMemoryRepository([s], ORG, m, NOW, { device });
const MARY = 'm-mrb', ESTHER = 'm-co', PETER = 'm-cm', HR = 'm-hrm';
const submitted = (s: Store) => { expect(as(s, MARY).reviews.submitSelf(RV, 'Routes were reassigned in July.')).toEqual({ ok: true }); };

describe('RV-1: lower-is-better objectives', () => {
  it('scores target ÷ verified figure, and a verified 0 at the top band', () => {
    const s = createSeed();
    const co = s.contractObjectives.find((x) => x.id === 'co-b-2')!;
    co.direction = 'lower_is_better';
    co.quantityTarget = { value: 2600, unit: 'readings' };
    co.snapshot = { ...co.snapshot!, quantityTarget: { value: 2600, unit: 'readings' } };
    const o = rateContract(s, 'pc-mrb-2026', { now: NOW })!.objectives.find((x) => x.contractObjectiveId === 'co-b-2')!;
    expect([o.basis, o.achievement, o.score]).toEqual(['verified', 2600 / 2210, 4]);
  });
});

describe('the review, step by step', () => {
  it('runs self-assessment, completion, the check and reading it; reading never changes a score', () => {
    const s = createSeed();
    expect(as(s, MARY).reviews.page().mine[0]!.step).toBe('awaiting_self');
    expect(as(s, MARY).reviews.submitSelf(RV, '  ')).toEqual({ ok: false, error: 'text_required' });
    submitted(s);
    expect(s.gateEvents.some((g) => g.gate === 'review.submit_self' && g.outcome === 'passed')).toBe(true);
    const esther = as(s, ESTHER).reviews;
    expect(esther.adjust(RV, 'co-b-2', 1, '')).toEqual({ ok: false, error: 'reason_required' });
    expect(esther.complete(RV, '')).toEqual({ ok: false, error: 'blocked' });
    expect(s.gateEvents.some((g) => g.gate === 'review.complete' && g.outcome === 'blocked')).toBe(true);
    expect(as(s, ESTHER).reviews.complete(RV, 'Good readings; replacement behind.')).toEqual({ ok: true, note: 'Peter Mwansa' });
    // The meters objective scores 1, so the next-level reviewer checks first; Mary waits.
    expect(as(s, MARY).reviews.page().mine[0]!.step).toBe('being_checked');
    expect(as(s, MARY).reviews.acknowledge(RV, '')).toEqual({ ok: false, error: 'not_allowed' });
    expect(as(s, PETER).home().needsYou.some((i) => i.key === 'review:check')).toBe(true);
    expect(as(s, ESTHER).reviews.accept(RV)).toEqual({ ok: false, error: 'not_allowed' }); // B7
    expect(as(s, PETER).reviews.accept(RV)).toEqual({ ok: true });
    const before = rateContract(s, 'pc-mrb-2026', { now: NOW })!.overall;
    expect(as(s, MARY).home().needsYou.some((i) => i.key === `review:ack:${RV}`)).toBe(true);
    expect(as(s, MARY).reviews.acknowledge(RV, 'The route change was outside my control.')).toEqual({ ok: true });
    expect(rateContract(s, 'pc-mrb-2026', { now: NOW })!.overall).toBe(before);
    expect(as(s, MARY).reviews.page().mine[0]!.step).toBe('acknowledged');
  });
  it('moving the meters score off 1 means nothing to check (flags follow the score)', () => {
    const s = createSeed();
    submitted(s);
    expect(as(s, ESTHER).reviews.adjust(RV, 'co-b-1', 1, 'Route reassigned in July.')).toEqual({ ok: true });
    as(s, ESTHER).reviews.complete(RV, 'Fair, given the route change.');
    expect(as(s, MARY).reviews.page().mine[0]!.step).toBe('awaiting_acknowledgement');
  });
  it('a supervisor may send a self-assessment back with a reason; a reviewer may return a review', () => {
    const s = createSeed();
    submitted(s);
    expect(as(s, ESTHER).reviews.sendBack(RV, '')).toEqual({ ok: false, error: 'reason_required' });
    expect(as(s, ESTHER).reviews.sendBack(RV, 'Say more about the readings.')).toEqual({ ok: true });
    const m = as(s, MARY).reviews.page().mine[0]!;
    expect([m.step, m.sentBack, m.can.writeSelf]).toEqual(['awaiting_self', 'Say more about the readings.', true]);
    submitted(s);
    as(s, ESTHER).reviews.complete(RV, 'Assessment.');
    expect(as(s, PETER).reviews.returnToSupervisor(RV, 'Check the meters figure.')).toEqual({ ok: true });
    const e = as(s, ESTHER).reviews.page().team[0]!;
    expect([e.step, e.returned?.reason, e.can.supervise]).toEqual(['awaiting_supervisor', 'Check the meters figure.', true]);
  });
  it('"Can’t be assessed" needs HR before completing, and then leaves the objective out', () => {
    const s = createSeed();
    submitted(s);
    expect(as(s, ESTHER).reviews.askCantAssess(RV, 'co-b-1', 'No meters were delivered until September.')).toEqual({ ok: true });
    expect(as(s, ESTHER).reviews.page().team[0]!.blocks).toEqual(['“Replace 400 faulty meters on route” is waiting for HR to accept “Can’t be assessed”.']);
    expect(as(s, ESTHER).reviews.complete(RV, 'x')).toEqual({ ok: false, error: 'blocked' });
    expect(as(s, HR).home().needsYou.some((i) => i.key === 'review:cant_assess')).toBe(true);
    expect(as(s, ESTHER).reviews.decideCantAssess(RV, 'co-b-1', true)).toEqual({ ok: false, error: 'not_allowed' });
    expect(as(s, HR).reviews.decideCantAssess(RV, 'co-b-1', true)).toEqual({ ok: true });
    const r = rateContract(s, 'pc-mrb-2026', { now: NOW })!;
    expect([r.overall, r.scoredWeightPct, r.flags]).toEqual([2, 50, []]);
    expect(as(s, ESTHER).reviews.complete(RV, 'Assessment.')).toEqual({ ok: true });
  });
});

describe('visibility (section 17)', () => {
  it('reaches the employee, supervisor, next-level reviewer and HR only', () => {
    const s = createSeed();
    for (const m of ['m-md', 'm-spm', 'm-hof']) {
      const r = as(s, m).reviews;
      expect(r.page().tabs).toEqual([]);
      expect(r.review(RV)).toBeNull();
    }
    expect(as(s, MARY).reviews.page().tabs).toEqual(['mine']);
    expect(as(s, ESTHER).reviews.page().tabs).toEqual(['team']);
    expect(as(s, PETER).reviews.page().tabs).toEqual(['check']);
    expect(as(s, HR).reviews.page().tabs).toEqual(['round']);
  });
  it('shows flags to the reviewer and HR, never to the employee', () => {
    const s = createSeed();
    submitted(s);
    as(s, ESTHER).reviews.complete(RV, 'Assessment.');
    expect(as(s, MARY).reviews.page().mine[0]!.flags).toEqual([]);
    expect(as(s, PETER).reviews.page().check[0]!.flags.map((f) => f.kind)).toEqual(['objective_scored_one']);
  });
});

describe('offline (RV-7)', () => {
  it('a self-assessment written offline waits on the device and is sent when back online', () => {
    const s = createSeed();
    const device = createDevice();
    const r = as(s, MARY, device);
    r.progress.setOffline(true);
    expect(r.reviews.submitSelf(RV, 'Written in the field.')).toEqual({ ok: true, queued: true });
    expect(as(s, MARY, device).reviews.page().mine[0]!.step).toBe('waiting_to_send');
    as(s, MARY, device).progress.setOffline(false);
    const rv = s.reviews.find((x) => x.id === RV)!;
    expect([rv.status, rv.selfAssessment?.capturedOffline]).toEqual(['self_submitted', true]);
  });
});

describe('the year-end round (R9)', () => {
  it('opens only once mid-year is done, blocks closing while anything is open, then freezes final scores', () => {
    const s = createSeed();
    const hr = () => as(s, HR).reviews;
    expect(hr().page().round!.canOpen).toEqual([]); // mid-year still open
    expect(hr().closeRound()).toEqual({ ok: false, error: 'not_allowed' }); // mid-year is never closed
    submitted(s);
    as(s, ESTHER).reviews.complete(RV, 'Assessment.');
    as(s, PETER).reviews.accept(RV);
    expect(hr().page().round!.canOpen).toEqual([{ kind: 'annual', periodEnd: null }]);
    expect(hr().openRound('annual')).toEqual({ ok: true });
    const yr = s.reviews.find((x) => x.kind === 'annual')!;
    expect(hr().page().round!.closeBlocks).toEqual(['1 review is not completed yet.']);
    expect(hr().closeRound()).toEqual({ ok: false, error: 'blocked' });
    expect(as(s, MARY).reviews.submitSelf(yr.id, 'Year-end self-assessment.')).toEqual({ ok: true });
    as(s, ESTHER).reviews.complete(yr.id, 'Year-end assessment.');
    as(s, PETER).reviews.accept(yr.id);
    expect(hr().closeRound()).toEqual({ ok: true });
    expect(yr.finalResult).toMatchObject({ overallScore: 1.5, label: 'Partly meets' });
    expect(s.gateEvents.some((g) => g.gate === 'appraisal.close' && g.outcome === 'passed')).toBe(true);
    expect(rateContract(s, 'pc-mrb-2026', { now: NOW })!.provisional).toBe(false);
  });
});

describe('every organisation and role', () => {
  it('builds the page and "Needs you" without error', () => {
    for (const o of createSampleOrgs()) for (const role of ALL_DEV_ROLES) {
      const m = (o.devRoles as Record<string, string>)[role];
      if (!m) continue;
      const r = createMemoryRepository([o.store], o.orgId, m, NOW);
      r.reviews.page(); r.reviews.needs(); r.menu();
    }
  });
});
