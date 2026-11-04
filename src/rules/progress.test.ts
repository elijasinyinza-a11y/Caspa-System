/** v0.18.0 (BUILD-BRIEF section 39): periods, due, marks, arrival checks, who verifies, superseding, and R6. */
import type { ISODate, ISODateTime, ProgressUpdate } from '../contract/caspa-data-contract';
import { createDevice } from '../data/access/device';
import { createMemoryRepository } from '../data/access/repository';
import type { Store } from '../data/access/store';
import { createSeed } from '../data/sample/seed';
import {
  arrivalCheck, duePeriod, endedPeriods, isSuperseded, latestVerified, marksFor, mayVerify, parseFigure, periodEnds,
  previousVerified, replacedBy, savedTimeLooksWrong, verifierPosition,
} from './progress';
import { rateContract } from './rating';

const NOW = '2026-10-18' as ISODate;
const ORG = 'org-sample-water';
const d = (x: string) => x as ISODate;
const t = (x: string) => x as ISODateTime;
const repoFor = (s: Store, m: string, device = createDevice()) => createMemoryRepository([s], ORG, m, NOW, { device });
const contract = (s: Store) => s.contracts.find((x) => x.id === 'pc-mrb-2026')!;
const update = (s: Store, over: Partial<ProgressUpdate>): ProgressUpdate => ({ ...s.progressUpdates[0]!, ...over } as ProgressUpdate);

describe('periods (section 39): from the year start and the frequency', () => {
  it('January year: monthly ends on each month’s last day, quarterly on March, June, September, December', () => {
    expect(periodEnds(2026, 1, 'monthly')).toHaveLength(12);
    expect(periodEnds(2026, 1, 'monthly').slice(0, 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(periodEnds(2026, 1, 'quarterly')).toEqual(['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31']);
    expect(periodEnds(2026, 1, 'annual')).toEqual(['2026-12-31']);
  });
  it('April year: quarters end in June, September, December and March of the next calendar year', () => {
    expect(periodEnds(2026, 4, 'quarterly')).toEqual(['2026-06-30', '2026-09-30', '2026-12-31', '2027-03-31']);
    expect(periodEnds(2026, 4, 'biannual')).toEqual(['2026-09-30', '2027-03-31']);
  });
  it('July year: the first month ends 31 July and the year on 30 June; February in a leap year has 29 days', () => {
    expect(periodEnds(2027, 7, 'monthly')[0]).toBe('2027-07-31');
    expect(periodEnds(2027, 7, 'monthly')).toContain('2028-02-29');
    expect(periodEnds(2026, 7, 'annual')).toEqual(['2027-06-30']);
  });
  it('a period has ended only after its last day', () => {
    expect(endedPeriods(2026, 1, 'monthly', d('2026-09-30'))).not.toContain('2026-09-30');
    expect(endedPeriods(2026, 1, 'monthly', d('2026-10-01'))).toContain('2026-09-30');
  });
});

describe('due (OP-10): only the latest ended period, one item per objective', () => {
  it('asks for September readings, and nothing once a figure is sent or waits on the device', () => {
    const s = createSeed();
    const co = s.contractObjectives.find((x) => x.id === 'co-b-2')!;
    expect(duePeriod(s, co, 2026, NOW)).toBe('2026-09-30');
    expect(duePeriod(s, co, 2026, NOW, [d('2026-09-30')])).toBeNull();
    const meters = s.contractObjectives.find((x) => x.id === 'co-b-1')!;
    expect(duePeriod(s, meters, 2026, NOW)).toBeNull(); // the OP-11 update covers September
  });
});

describe('figures', () => {
  it('accepts whole numbers with separators, and rejects negatives and words', () => {
    expect(parseFigure('2,150')).toBe(2150);
    expect(parseFigure(' 260 ')).toBe(260);
    expect(parseFigure('-5')).toBeNull();
    expect(parseFigure('about 200')).toBeNull();
    expect(parseFigure('')).toBeNull();
  });
});

describe('superseding (OP-4) and replacing (OP-5)', () => {
  it('a later verified figure for the same period counts, and both are kept', () => {
    const s = createSeed();
    const june = s.progressUpdates.find((u) => u.contractObjectiveId === 'co-b-1' && u.periodEnd === '2026-06-30')!;
    const fix = update(s, { id: 'pu-fix' as never, contractObjectiveId: june.contractObjectiveId, periodEnd: june.periodEnd, quantityDone: 150, verified: { at: t('2026-10-10T09:00:00+02:00'), byMembershipId: 'm-co' as never } });
    s.progressUpdates.push(fix);
    expect(latestVerified(s.progressUpdates, 'co-b-1', NOW)?.id).toBe('pu-fix');
    expect(isSuperseded(s.progressUpdates, june)).toBe(true);
    expect(isSuperseded(s.progressUpdates, fix)).toBe(false);
    expect(s.progressUpdates).toContain(june);
  });
  it('a new figure replaces only unverified ones for the same objective and period', () => {
    const s = createSeed();
    expect(replacedBy(s.progressUpdates, { contractObjectiveId: 'co-b-1', periodEnd: d('2026-09-30') }).map((u) => u.id)).toEqual(['pu-co-b-1-2026-09']);
    expect(replacedBy(s.progressUpdates, { contractObjectiveId: 'co-b-1', periodEnd: d('2026-06-30') })).toEqual([]);
  });
  it('unverified figures never count (R6), and the Zone B rating is unchanged by the OP-11 update', () => {
    const s = createSeed();
    expect(latestVerified(s.progressUpdates, 'co-b-1', NOW)?.quantityDone).toBe(140);
    const before = rateContract(s, 'pc-mrb-2026', { now: NOW });
    const without = createSeed();
    without.progressUpdates = without.progressUpdates.filter((u) => u.id !== 'pu-co-b-1-2026-09');
    expect(before).toEqual(rateContract(without, 'pc-mrb-2026', { now: NOW }));
  });
});

describe('marks (OP-9): they inform, never block', () => {
  it('marks a figure lower than the last verified one, and a saved time later than arrival', () => {
    const s = createSeed();
    const u = update(s, { id: 'pu-low' as never, contractObjectiveId: 'co-b-2' as never, periodEnd: d('2026-09-30'), quantityDone: 2150, verified: null, returned: null,
      sync: { capturedOffline: true, capturedAt: t('2026-10-04T10:00:00+02:00'), syncedAt: t('2026-10-03T10:00:00+02:00') } });
    s.progressUpdates.push(u);
    expect(previousVerified(s.progressUpdates, u)?.quantityDone).toBe(2210);
    expect(marksFor(s, u)).toEqual(['lower', 'saved_time']);
    expect(savedTimeLooksWrong(t('2026-10-02T15:40:00+02:00'), t('2026-10-03T07:55:00+02:00'))).toBe(false);
  });
  it('compares instants, not text: the same moment in two offsets is not wrong', () => {
    expect(savedTimeLooksWrong(t('2026-10-03T07:55:00+02:00'), t('2026-10-03T05:55:00Z'))).toBe(false);
  });
});

describe('arrival checks (section 39)', () => {
  const mary = (s: Store) => contract(s).personId as string;
  it('passes for the seed update', () => {
    const s = createSeed();
    expect(arrivalCheck(s, { contractObjectiveId: 'co-b-1', periodEnd: d('2026-09-30'), personId: mary(s) })).toBeNull();
  });
  it('fails when the contract is no longer signed, the objective is gone, the period is outside the year, or the position was not held', () => {
    let s = createSeed();
    contract(s).status = 'closed';
    expect(arrivalCheck(s, { contractObjectiveId: 'co-b-1', periodEnd: d('2026-09-30'), personId: mary(s) })).toBe('contract_not_signed');
    s = createSeed();
    expect(arrivalCheck(s, { contractObjectiveId: 'co-gone', periodEnd: d('2026-09-30'), personId: mary(s) })).toBe('objective_missing');
    expect(arrivalCheck(s, { contractObjectiveId: 'co-b-1', periodEnd: d('2027-01-31'), personId: mary(s) })).toBe('outside_year');
    for (const a of s.assignments.filter((x) => x.personId === mary(s) && x.positionId === contract(s).positionId)) a.from = d('2026-10-01');
    expect(arrivalCheck(s, { contractObjectiveId: 'co-b-1', periodEnd: d('2026-09-30'), personId: mary(s) })).toBe('position_not_held');
  });
  it('a failed arrival stays on the device as "Couldn’t be sent", and nothing is lost', () => {
    const s = createSeed();
    const device = createDevice();
    const r = repoFor(s, 'm-mrb', device);
    r.progress.setOffline(true);
    expect(r.progress.save({ contractObjectiveId: 'co-b-2', periodEnd: '2026-09-30', quantity: '2300', note: '', evidence: '' }).ok).toBe(true);
    contract(s).status = 'closed';
    const sent = repoFor(s, 'm-mrb', device).progress.setOffline(false)!;
    expect([sent.sent, sent.failed]).toEqual([0, 1]);
    expect(repoFor(s, 'm-mrb', device).progress.waiting()).toEqual({ updates: 0, decisions: 0, failed: 1 });
    expect(s.progressUpdates.some((u) => u.contractObjectiveId === 'co-b-2' && u.periodEnd === '2026-09-30')).toBe(false);
  });
});

describe('sending offline updates (OP-5, OP-7)', () => {
  it('sends in the order saved; a later figure for the same period replaces the earlier unverified one', () => {
    const s = createSeed();
    const device = createDevice();
    const r = repoFor(s, 'm-mrb', device);
    r.progress.setOffline(true);
    r.progress.save({ contractObjectiveId: 'co-b-1', periodEnd: '2026-09-30', quantity: '270', note: '', evidence: '' });
    r.progress.save({ contractObjectiveId: 'co-b-1', periodEnd: '2026-09-30', quantity: '280', note: '', evidence: '' });
    expect(r.progress.waiting().updates).toBe(2);
    expect(r.progress.setOffline(false)).toMatchObject({ sent: 2, failed: 0 });
    const sept = s.progressUpdates.filter((u) => u.contractObjectiveId === 'co-b-1' && u.periodEnd === '2026-09-30');
    expect(sept.map((u) => u.quantityDone)).toEqual([280]);
    expect(s.auditEntries.some((a) => a.entity.type === 'ProgressUpdate' && a.action === 'replace' && a.entity.id === 'pu-co-b-1-2026-09')).toBe(true);
  });
  it('unsent updates belong to the person who saved them', () => {
    const s = createSeed();
    const device = createDevice();
    const mary = repoFor(s, 'm-mrb', device);
    mary.progress.setOffline(true);
    mary.progress.save({ contractObjectiveId: 'co-b-2', periodEnd: '2026-09-30', quantity: '2300', note: '', evidence: '' });
    expect(repoFor(s, 'm-co', device).progress.waiting()).toEqual({ updates: 0, decisions: 0, failed: 0 });
    expect(repoFor(s, 'm-co', device).progress.offline()).toBe(false);
  });
  it('a lower figure needs a reason before it is saved', () => {
    const s = createSeed();
    const r = repoFor(s, 'm-mrb');
    expect(r.progress.save({ contractObjectiveId: 'co-b-2', periodEnd: '2026-09-30', quantity: '2150', note: '', evidence: '' })).toEqual({ ok: false, error: 'reason_required' });
    expect(r.progress.save({ contractObjectiveId: 'co-b-2', periodEnd: '2026-09-30', quantity: '2150', note: 'Two routes recounted.', evidence: '' }).ok).toBe(true);
  });
});

describe('who verifies (OP-6): substantive or acting, never oneself', () => {
  it('an acting holder of the Commercial Officer position verifies', () => {
    const s = createSeed();
    const c = contract(s);
    const co = s.positions.find((p) => p.title === 'Commercial Officer')!;
    for (const a of s.assignments.filter((x) => x.positionId === co.id)) a.to = d('2026-09-01');
    const actingPerson = s.people.find((p) => !s.assignments.some((a) => a.personId === p.id && a.positionId === co.id))!;
    s.assignments.push({ ...s.assignments[0]!, id: 'as-acting' as never, personId: actingPerson.id, positionId: co.id, from: d('2026-09-02'), to: null, acting: true } as never);
    expect(verifierPosition(s, c, NOW)).toBe(co.id);
    expect(mayVerify(s, c, { personId: actingPerson.id, positionIds: [co.id] }, NOW)).toBe(true);
  });
  it('the employee never verifies their own update, even when acting in the position above', () => {
    const s = createSeed();
    const c = contract(s);
    const co = s.positions.find((p) => p.title === 'Commercial Officer')!;
    for (const a of s.assignments.filter((x) => x.positionId === co.id)) a.to = d('2026-09-01');
    s.assignments.push({ ...s.assignments[0]!, id: 'as-self' as never, personId: c.personId, positionId: co.id, from: d('2026-09-02'), to: null, acting: true } as never);
    expect(verifierPosition(s, c, NOW)).toBe(co.reportsToPositionId);
    expect(mayVerify(s, c, { personId: c.personId, positionIds: [co.id] }, NOW)).toBe(false);
  });
});

describe('activity and KPI figures (OP-1, OP-12): owners only, online only, with an audit entry', () => {
  const ownerOf = (s: Store, positionId: string) => {
    const a = s.assignments.find((x) => x.positionId === positionId && x.to === null)!;
    return s.memberships.find((m) => m.personId === a.personId)!.id as string;
  };
  it('the activity owner records a figure; the contract total is shown for reference and nothing is copied', () => {
    const s = createSeed();
    const co = repoFor(s, 'm-co');
    const form = co.progress.activityForm('a1.1.1.1')!;
    expect(form.contractTotal).toEqual({ value: 2210, unit: 'readings' });
    expect(form.recorded).toEqual({});
    expect(co.progress.recordActivity('a1.1.1.1', '2026-09-30', '2,100', '')).toEqual({ ok: true });
    expect(s.activityProgress.find((x) => x.activityId === 'a1.1.1.1')?.quantityDone).toBe(2100);
    expect(s.auditEntries.some((a) => a.entity.type === 'ActivityProgress' && a.action === 'create')).toBe(true);
    expect(repoFor(s, 'm-mrb').progress.activityForm('a1.1.1.1')).toBeNull();
    expect(repoFor(s, 'm-mrb').progress.recordActivity('a1.1.1.1', '2026-09-30', '1', '')).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('the KPI owner records a reading online, and is refused offline', () => {
    const s = createSeed();
    const kpi = s.kpis.find((k) => k.id === 'k1.2.1')!;
    const owner = repoFor(s, ownerOf(s, kpi.ownerPositionId as string));
    const period = owner.progress.kpiForm('k1.2.1')!.periods.find((p) => p < NOW)!;
    owner.progress.setOffline(true);
    expect(owner.progress.recordKpi('k1.2.1', period, '46')).toEqual({ ok: false, error: 'offline' });
    owner.progress.setOffline(false);
    expect(owner.progress.recordKpi('k1.2.1', period, '46')).toEqual({ ok: true });
    expect(repoFor(s, 'm-co').progress.kpiForm('k1.2.1')).toBeNull();
  });
});
