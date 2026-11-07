/** v0.23.0 scoring policy, personal attributes, countersigning, period targets and printouts (contract v1.15). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { rateContract, schemeFor } from '../../rules/rating';
import { ALL_DEV_ROLES, createSampleOrgs } from '../sample/all';
import { createSeed, ORG } from '../sample/seed';
import { createDevice } from './device';
import { createMemoryRepository } from './repository';
import { importRows } from './setup/import';
import type { Store } from './store';

const NOW = '2026-10-18' as ISODate;
const RV = 'rv-mrb-2026-mid';
const as = (s: Store, m: string) => createMemoryRepository([s], ORG, m, NOW, { device: createDevice() });
const MARY = 'm-mrb', ESTHER = 'm-co', PETER = 'm-cm', HR = 'm-hrm', MD = 'm-md', FIN = 'm-hof';

/** Mary Chileshe's contract scored under the FY2027 sample policy (weighted points, attributes at 5%), approved. */
const underSample = (s: Store, extra: Partial<Store['ratingSchemes'][number]> = {}) => {
  const p = s.ratingSchemes.find((r) => r.id === 'rs-2027')!;
  Object.assign(p, { approval: { status: 'approved', sent: null, decided: null, returnReason: null } }, extra);
  s.contracts.find((c) => c.id === 'pc-mrb-2026')!.ratingSchemeId = p.id;
  return p;
};

describe('the scoring policy (A1): HR drafts, the Executive approves', () => {
  it('shows the FY2027 draft to HR and the Executive only, editable by HR', () => {
    const s = createSeed();
    expect(as(s, HR).policy.view().canEdit).toBe(true);
    expect(as(s, MD).policy.view()).toMatchObject({ canEdit: false, canDecide: false });
    expect(as(s, MD).policy.view().draft?.method).toBe('weighted_points');
    for (const m of [MARY, ESTHER, PETER, FIN]) expect(as(s, m).policy.visible()).toBe(false);
    expect(as(s, FIN).policy.save(as(s, HR).policy.view().draft!)).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('refuses to send with something to fix, then sends, approves and puts it in the Executive’s queue', () => {
    const s = createSeed();
    const hr = as(s, HR).policy;
    const d = hr.view().draft!;
    expect(hr.save({ ...d, mins: [70, 80, 60, 50] })).toEqual({ ok: true });
    expect(hr.view().checks.map((c) => c.kind)).toEqual(['thresholds_order']);
    expect(hr.send()).toEqual({ ok: false, error: 'must_fix' });
    expect(hr.save({ ...d })).toEqual({ ok: true });
    expect(hr.send()).toEqual({ ok: true });
    expect(as(s, HR).policy.view().canEdit).toBe(false);
    expect(as(s, MD).home().needsYou.some((n) => n.key.startsWith('policy:') && n.title.includes('FY2027'))).toBe(true);
    expect(as(s, HR).policy.approve()).toEqual({ ok: false, error: 'not_allowed' });
    expect(as(s, MD).policy.returnToHr(' ')).toEqual({ ok: false, error: 'reason_required' });
    expect(as(s, MD).policy.approve()).toEqual({ ok: true });
    expect(s.ratingSchemes.find((r) => r.id === 'rs-2027')!.approval!.status).toBe('approved');
    expect(s.auditEntries.filter((a) => a.entity.type === 'RatingScheme').map((a) => a.action)).toEqual(['update', 'update', 'send', 'approve']);
  });
  it('a returned policy goes back to HR with the reason, and to HR’s queue', () => {
    const s = createSeed();
    as(s, HR).policy.send();
    expect(as(s, MD).policy.returnToHr('Keep the limit at 110%.')).toEqual({ ok: true });
    const v = as(s, HR).policy.view();
    expect([v.canEdit, v.draft!.status, v.draft!.returnReason]).toEqual([true, 'returned', 'Keep the limit at 110%.']);
    expect(as(s, HR).home().needsYou.some((n) => n.key.startsWith('policy:'))).toBe(true);
  });
  it('never touches the policy in force; a draft starts as a copy of it', () => {
    const s = createSeed();
    s.ratingSchemes = s.ratingSchemes.filter((r) => r.id !== 'rs-2027');
    expect(as(s, HR).policy.view().canStart).toBe(true);
    expect(as(s, HR).policy.start()).toEqual({ ok: true });
    expect(as(s, HR).policy.start()).toEqual({ ok: false, error: 'not_allowed' });
    const d = as(s, HR).policy.view();
    expect(d.draft!.method).toBe('bands');
    expect(d.draft!.mins).toEqual(d.inForce.mins);
    expect(s.organisation.settings.ratingSchemeId).toBe('rs-a');
  });
});

describe('which policy scores a contract', () => {
  it('keeps the one a contract was signed under, even after a later approval', () => {
    const s = createSeed();
    s.contracts.find((c) => c.id === 'pc-mrb-2026')!.ratingSchemeId = 'rs-a' as never;
    underSample(s);
    s.contracts.find((c) => c.id === 'pc-mrb-2026')!.ratingSchemeId = 'rs-a' as never;
    expect(schemeFor(s, s.contracts.find((c) => c.id === 'pc-mrb-2026')!).scoringMethod ?? 'bands').toBe('bands');
  });
  it('gives a next-year contract the approved policy for that year, and none while it is only a draft', () => {
    const s = createSeed();
    const c = { ...s.contracts.find((x) => x.id === 'pc-mrb-2026')!, ratingSchemeId: null, financialYear: 2027 as never };
    expect(schemeFor(s, c).scoringMethod ?? 'bands').toBe('bands');
    s.ratingSchemes.find((r) => r.id === 'rs-2027')!.approval!.status = 'approved';
    expect(schemeFor(s, c).scoringMethod).toBe('weighted_points');
  });
});

describe('weighted points on a real review', () => {
  it('earns weight × achievement and rates the overall share', () => {
    const s = createSeed();
    underSample(s);
    const r = rateContract(s, 'pc-mrb-2026', { now: NOW })!;
    // Mid-year: 140 of 400 meters (35%) and 2,210 of 2,400 readings (92.1%), at 50% each; no attributes scored yet.
    expect(r.method).toBe('weighted_points');
    expect(r.objectives.map((o) => o.points)).toEqual([50 * (140 / 400), 50 * (2210 / 2400)]);
    expect(r.overall).toBeCloseTo((50 * 0.35 + 50 * (2210 / 2400)) / 100 * 100, 10);
    expect(r.label).toBe('Partly meets');
    expect(r.attributes).toMatchObject({ enabled: true, weightPct: 5, max: 25, percent: null, complete: false });
  });
  it('uses a stored period target for the review’s period; achievement stays as measured', () => {
    const s = createSeed();
    const co = s.contractObjectives.find((x) => x.id === 'co-b-1')!;
    co.periodTargets = [{ periodEnd: '2026-06-30' as ISODate, value: 200 }];
    const o = rateContract(s, 'pc-mrb-2026', { now: NOW })!.objectives.find((x) => x.contractObjectiveId === 'co-b-1')!;
    expect([o.target, o.fullYearTarget, o.achievement]).toEqual([200, 400, 140 / 200]);
  });
});

describe('personal attributes on the review (B)', () => {
  const ready = () => {
    const s = createSeed();
    underSample(s);
    expect(as(s, MARY).reviews.selfRateAttribute(RV, 'attr-time', 5)).toEqual({ ok: true });
    expect(as(s, MARY).reviews.submitSelf(RV, 'Routes were reassigned in July.')).toEqual({ ok: true });
    return s;
  };
  it('a self-score alone never counts, and completing needs every attribute scored with a comment', () => {
    const s = ready();
    expect(rateContract(s, 'pc-mrb-2026', { now: NOW })!.attributes.percent).toBeNull();
    const e = as(s, ESTHER).reviews;
    expect(e.review(RV)!.blocks.filter((b) => b.startsWith('Score “')).length).toBe(5);
    expect(e.rateAttribute(RV, 'attr-time', 4, ' ')).toEqual({ ok: false, error: 'comment_required' });
    for (const [a, n] of [['attr-teamwork', 4], ['attr-time', 4], ['attr-customer', 3], ['attr-integrity', 4], ['attr-attendance', 4]] as const) {
      expect(e.rateAttribute(RV, a, n, 'Seen through the year.')).toEqual({ ok: true });
    }
    const r = rateContract(s, 'pc-mrb-2026', { now: NOW })!;
    expect([r.attributes.sum, r.attributes.max, r.attributes.percent, r.attributes.complete]).toEqual([19, 25, 76, true]);
    const v = as(s, ESTHER).reviews.review(RV)!;
    expect(v.attributes.lines.find((l) => l.id === 'attr-time')).toMatchObject({ score: 4, selfScore: 5, scoreLabel: 'Commendable' });
    expect(v.blocks).toEqual([]);
  });
  it('hides the supervisor’s attribute scores from the employee until the review is completed', () => {
    const s = ready();
    as(s, ESTHER).reviews.rateAttribute(RV, 'attr-time', 2, 'Late returns.');
    expect(as(s, MARY).reviews.review(RV)!.attributes.lines.find((l) => l.id === 'attr-time')).toMatchObject({ score: null, selfScore: 5, justification: '' });
  });
  it('keeps the supervisor’s notes, unscored, and shows them once completed', () => {
    const s = ready();
    expect(as(s, MARY).reviews.saveNotes(RV, { contributions: 'x' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(as(s, ESTHER).reviews.saveNotes(RV, { contributions: ' Trained two new readers. ', followUp: 'Route course.' })).toEqual({ ok: true });
    expect(as(s, ESTHER).reviews.review(RV)).toMatchObject({ contributions: 'Trained two new readers.', followUp: 'Route course.' });
    expect(as(s, MARY).reviews.review(RV)!.contributions).toBeNull();
  });
});

describe('countersigning every review (C3)', () => {
  it('sends every completed review to the next-level reviewer, who agrees, or disagrees with reasons', () => {
    const s = createSeed();
    s.ratingSchemes.find((r) => r.id === 'rs-a')!.countersignAll = true;
    s.contractObjectives.find((x) => x.id === 'co-b-1')!.periodTargets = [{ periodEnd: '2026-06-30' as ISODate, value: 150 }]; // no flag: 93% at mid-year
    as(s, MARY).reviews.submitSelf(RV, 'Fine.');
    expect(as(s, ESTHER).reviews.complete(RV, 'Good year.')).toMatchObject({ ok: true });
    expect(as(s, ESTHER).reviews.review(RV)!.flags).toEqual([]);
    expect(as(s, PETER).reviews.review(RV)!.can.check).toBe(true);
    expect(as(s, PETER).reviews.countersign(RV, false, ' ')).toEqual({ ok: false, error: 'reason_required' });
    expect(as(s, PETER).reviews.countersign(RV, false, 'Meters score looks generous.')).toEqual({ ok: true });
    expect(as(s, HR).reviews.review(RV)!.countersign.done).toMatchObject({ agrees: false, reason: 'Meters score looks generous.', by: 'Peter Mwansa' });
    expect(as(s, MARY).reviews.review(RV)!.can.acknowledge).toBe(true);
  });
});

describe('printouts', () => {
  it('prints the signed contract for those who may see it, with the agreed details', () => {
    const s = createSeed();
    for (const m of [MARY, ESTHER, HR]) expect(as(s, m).printouts.contract('pc-mrb-2026')).not.toBeNull();
    for (const m of [FIN, MD]) expect(as(s, m).printouts.contract('pc-mrb-2026')).toBeNull();
    const p = as(s, HR).printouts.contract('pc-mrb-2026')!;
    expect(p.employee).toMatchObject({ name: 'Mary Chileshe', number: 'SWU-0412', position: 'Meter Reader, Zone B' });
    expect(p.objectives.map((o) => [o.title, o.mov, o.weight])).toEqual([
      ['Replace 400 faulty meters on route', 'Meter replacement job cards; meter changes in the billing system', 50],
      ['Complete scheduled meter readings', 'Route reading sheets; reading log in the billing system', 50],
    ]);
    expect(p.objectives[0]!.chain).toBe('K1.2.1 Non-revenue water › O1.2 Reduce non-revenue water › G1 Improve financial sustainability');
    expect([p.targetsPct, p.attributesPct, p.status]).toEqual([100, 0, 'signed']);
  });
  it('prints a review with the same totals as the screen, for the review’s people only', () => {
    const s = createSeed();
    underSample(s);
    expect(as(s, FIN).printouts.review(RV)).toBeNull();
    const p = as(s, HR).printouts.review(RV)!;
    expect([p.final, p.reviewEnd, p.attributesPct]).toEqual([false, '2026-06-30', 5]);
    expect(p.review.overall!.display).toBe(as(s, HR).reviews.review(RV)!.overall!.display);
    expect(p.review.overall!.display.endsWith('%')).toBe(true);
  });
  it('lists signed contracts as received by HR, with nothing to record', () => {
    const s = createSeed();
    const o = as(s, HR).contracts.page().overview!;
    expect(o.received.map((x) => x.person)).toEqual(['Mary Chileshe']);
    expect(as(s, HR).home().hr!.received).toEqual({ contracts: 1, assessments: 0 });
  });
});

describe('the setup spreadsheet’s optional employee number (C7)', () => {
  it('reads the last column into the person', () => {
    let n = 0;
    const r = importRows([['Org', 'Organisation', 'Managing Director', '', 'Ann Banda', 'ann@example.org', '', 'Executive', '', 'EMP-001']], [], (p) => `${p}-${++n}`);
    expect(r.structure.people[0]!.employeeNumber).toBe('EMP-001');
  });
});

describe('every role in every organisation', () => {
  it('opens the policy, the printouts and the reviews without error', () => {
    for (const o of createSampleOrgs()) for (const role of ALL_DEV_ROLES) {
      const m = (o.devRoles as Record<string, string>)[role];
      if (!m) continue;
      const repo = createMemoryRepository([o.store], o.orgId, m, NOW);
      if (repo.policy.visible()) repo.policy.view();
      for (const c of o.store.contracts) repo.printouts.contract(c.id);
      for (const r of o.store.reviews) repo.printouts.review(r.id);
      repo.reviews.page(); repo.home();
    }
  });
});
