/** v0.25.0: Finish Targets Specification v0.1 — TG-4, TG-9 (contract v1.17), To verify with shares, share dependencies, F9–F11. */
import type { ISODate } from '../../contract/caspa-data-contract';
import { kpiProgress } from '../../rules/kpi-progress';
import { fromShares, suggestedCombine, unusualCombine } from '../../rules/targets';
import { createSampleOrgs } from '../sample/all';
import { createMemoryRepository } from './repository';
import type { Store } from './store';

const NOW = '2026-10-18' as ISODate;
const org = (id: string) => createSampleOrgs().find((o) => o.orgId === id)!;
const as = (o: { orgId: string; store: Store }, m: string) => createMemoryRepository([o.store], o.orgId, m, NOW);
const MFG_KPI = 'k-mfg-K1.1.1';
const PROD = 'ks-kb-k-mfg-K1.1.1-2026-u-mfg-prod', QUAL = 'ks-kb-k-mfg-K1.1.1-2026-u-mfg-quality';
const SC2 = 'ks-kb-k-scale-K2.1.1-2026-u-scale-d2p2', SC3 = 'ks-kb-k-scale-K2.1.1-2026-u-scale-d2p3';
const verified = (s: Store, shareId: string, periodEnd: string, value: number, by: string) => s.shareReadings.push({
  orgId: s.organisation.id, id: `sr-t-${shareId}-${periodEnd}` as never, shareId: shareId as never, periodEnd: periodEnd as ISODate, value, savedOffline: false,
  verified: { by: { at: `${periodEnd}T12:00:00+00:00` as never, byMembershipId: by as never } }, returned: null,
  created: { at: `${periodEnd}T09:00:00+00:00` as never, byMembershipId: by as never }, updated: { at: `${periodEnd}T09:00:00+00:00` as never, byMembershipId: by as never },
});

describe('TG-4: the corporate figure from verified shares', () => {
  it('combines a complete period by its rule and feeds KPI progress', () => {
    const o = org('org-mfg'); const s = o.store;
    const f = fromShares(s, MFG_KPI, 2026 as never, '2026-04-01' as ISODate, NOW)!;
    // Weighted by tonnes of input: (4.5 × 9,000 + 2.8 × 1,000) ÷ 10,000.
    expect(f.periods).toEqual([{ periodEnd: '2026-09-30', value: (4.5 * 9000 + 2.8 * 1000) / 10000 }]);
    const k = s.kpis.find((x) => x.id === MFG_KPI)!;
    expect(kpiProgress(s, k, { financialYear: 2026, now: NOW }).actual).toBeCloseTo(4.33, 10);
  });
  it('uses only periods every share has verified, and says how many reported', () => {
    const o = org('org-mfg'); const s = o.store;
    verified(s, PROD, '2026-10-31', 4.0, 'm-mfg-pm');
    const late = '2026-11-05' as ISODate;
    let f = fromShares(s, MFG_KPI, 2026 as never, '2026-04-01' as ISODate, late)!;
    expect([f.periods.map((p) => p.periodEnd), f.latest, f.of]).toEqual([['2026-09-30'], { periodEnd: '2026-10-31', reported: 1 }, 2]);
    expect(createMemoryRepository([s], o.orgId, 'm-mfg-pm', late).targets.cascadeLine(MFG_KPI)!.fromShares).toMatchObject({ reported: 1, of: 2, latest: '2026-10-31', showing: '2026-09-30' });
    verified(s, QUAL, '2026-10-31', 3.0, 'm-mfg-pm');
    f = fromShares(s, MFG_KPI, 2026 as never, '2026-04-01' as ISODate, late)!;
    expect(f.periods.map((p) => p.periodEnd)).toEqual(['2026-09-30', '2026-10-31']);
  });
  it('leaves a "Not combined" KPI on its own readings, and closes the owner’s readings otherwise (F2)', () => {
    const o = org('org-mfg'); const s = o.store;
    const pm = as(o, 'm-mfg-pm').progress;
    expect(pm.kpiForm(MFG_KPI)!.fromShares).toBe(true);
    expect(pm.recordKpi(MFG_KPI, pm.kpiForm(MFG_KPI)!.periods[0]!, '4')).toEqual({ ok: false, error: 'from_shares' });
    s.kpiBreakdowns.find((b) => b.kpiId === MFG_KPI)!.combine = 'none';
    expect(fromShares(s, MFG_KPI, 2026 as never, '2026-04-01' as ISODate, NOW)).toBeNull();
    expect(as(o, 'm-mfg-pm').progress.kpiForm(MFG_KPI)!.fromShares).toBe(false);
  });
});

describe('F10, F11: a starting choice and a check on unusual combining', () => {
  it('starts rates at weighted average and counts at add up; flags sums of rates and averages of money', () => {
    expect(['%', '% of input', 'ratio', 'litres per connection'].map(suggestedCombine)).toEqual(['weighted', 'weighted', 'weighted', 'weighted']);
    expect(['connections', 'meters', 'ZMW'].map(suggestedCombine)).toEqual(['sum', 'sum', 'sum']);
    expect([unusualCombine('%', 'sum', 'ZMW'), unusualCombine('ZMW', 'weighted', 'ZMW'), unusualCombine('%', 'weighted', 'ZMW'), unusualCombine('m³', 'none', 'ZMW')]).toEqual(['sum_of_rates', 'average_of_money', null, null]);
    const o = org('org-mfg');
    o.store.kpiBreakdowns.find((b) => b.kpiId === MFG_KPI)!.combine = 'sum';
    expect(as(o, 'm-mfg-pm').targets.breakdown(`kb-${MFG_KPI}-2026`)!.checks.some((c) => !c.must && c.text.startsWith('Shares of a rate'))).toBe(true);
  });
});

describe('TG-9: proposing new work into Cascade', () => {
  const input = { title: 'Run a weekly output huddle', decisionLevel: 'procedures' as const, quantity: 40, unit: 'huddles', ownerPositionId: 'pos-scale-dh22', evidence: 'Huddle notes', reason: 'Slips are caught too late.' };
  it('lets the share owner or their supervisor propose, and nobody else; a level is needed', () => {
    const o = org('org-scale');
    expect(as(o, 'm-scale-dh22').targets.propose(SC2, { ...input, decisionLevel: null })).toEqual({ ok: false, error: 'level_required' });
    expect(as(o, 'm-scale-dh22').targets.propose(SC2, input)).toMatchObject({ ok: true });
    expect(as(o, 'm-scale-dir2').targets.propose(SC2, input)).toMatchObject({ ok: true });
    for (const m of ['m-scale-dh21', 'm-scale-off1', 'm-scale-dir3']) expect(as(o, m).targets.propose(SC2, input)).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('waits for the Strategy office, out of Cascade; confirming creates the activity with the next code', () => {
    const o = org('org-scale'); const s = o.store;
    const before = s.activities.length;
    const so = as(o, 'm-scale-dir3').targets;
    expect(so.proposalsToDecide().map((p) => p.title)).toEqual(['Run a quarterly output review clinic for the department']);
    expect(as(o, 'm-scale-dir3').home().needsYou.some((n) => n.key === 'targets:proposal:prop-scale-1')).toBe(true);
    expect(s.activities.length).toBe(before);
    expect(as(o, 'm-scale-dh22').targets.confirmProposal('prop-scale-1')).toEqual({ ok: false, error: 'not_allowed' });
    const r = so.confirmProposal('prop-scale-1', { title: 'Run a quarterly output review clinic' });
    expect(r).toMatchObject({ ok: true, code: 'A2.1.1.7' });
    const a = s.activities.find((x) => x.code === 'A2.1.1.7')!;
    expect([a.kpiId, a.decisionLevel, a.ownerPositionId, a.quantityTarget, a.title]).toEqual(['k-scale-K2.1.1', 'procedures', 'pos-scale-dh22', { value: 4, unit: 'clinics' }, 'Run a quarterly output review clinic']);
    const p = s.activityProposals.find((x) => x.id === 'prop-scale-1')!;
    expect([p.outcome, p.activityId, p.asSent?.title]).toEqual(['confirmed', a.id, 'Run a quarterly output review clinic for the department']);
    expect(as(o, 'm-scale-dh22').targets.share(SC2)!.proposals[0]).toMatchObject({ outcome: 'confirmed', activityCode: 'A2.1.1.7' });
  });
  it('a return needs a reason; the proposer can change and send again, or withdraw', () => {
    const o = org('org-scale');
    const so = as(o, 'm-scale-dir3').targets;
    expect(so.returnProposal('prop-scale-1', ' ')).toEqual({ ok: false, error: 'reason_required' });
    expect(so.returnProposal('prop-scale-1', 'Say how often.')).toEqual({ ok: true });
    expect(as(o, 'm-scale-dh22').home().needsYou.some((n) => n.key === 'targets:returned:prop-scale-1')).toBe(true);
    const own = as(o, 'm-scale-dh22').targets;
    expect(own.share(SC2)!.proposals[0]).toMatchObject({ outcome: 'returned', returnReason: 'Say how often.', canChange: true });
    expect(own.changeProposal('prop-scale-1', { ...input, title: 'Run a monthly output review clinic' })).toEqual({ ok: true });
    expect(so.proposalsToDecide().map((p) => p.title)).toEqual(['Run a monthly output review clinic']);
    expect(own.withdrawProposal('prop-scale-1')).toEqual({ ok: true });
    expect(so.proposalsToDecide()).toEqual([]);
  });
  it('is seen only by the share’s owner, their supervisor, the objective’s owner and the Strategy office', () => {
    const o = org('org-scale');
    expect(as(o, 'm-scale-dir2').targets.share(SC2)!.proposals.length).toBe(1);
    // The KPI's owner here also owns the objective; an employee cannot open the share at all.
    expect(as(o, 'm-scale-dh21').targets.share(SC2)!.proposals.length).toBe(1);
    expect(as(o, 'm-scale-off1').targets.share(SC2)).toBeNull();
  });
});

describe('F6: share readings in To verify', () => {
  it('lists a share reading for the owner’s supervisor only, with contract updates', () => {
    const o = org('org-scale');
    const rows = as(o, 'm-scale-dir2').progress.page().shareReadings;
    expect(rows.map((r) => [r.shareId, r.value])).toEqual([[SC2, 76]]);
    expect(as(o, 'm-scale-dir2').progress.page().verify).not.toBeNull();
    for (const m of ['m-scale-dh22', 'm-scale-dh21', 'm-scale-dir3']) expect(as(o, m).progress.page().shareReadings).toEqual([]);
    expect(as(o, 'm-scale-dir2').targets.verify(rows[0]!.id)).toMatchObject({ ok: true });
    expect(as(o, 'm-scale-dir2').progress.page().shareReadings).toEqual([]);
  });
});

describe('dependencies from and on shares', () => {
  it('records what a share depends on, flags a share with no owner, and refuses a circle', () => {
    const o = org('org-scale');
    const own = as(o, 'm-scale-dh22').targets;
    expect(own.addDependency(SC2, SC3, '2026-12-31', 'Needs their outputs')).toEqual({ ok: true });
    const d = own.share(SC2)!.deps;
    expect(d[0]!.on).toContain('share of K2.1.1');
    expect(d[0]!.flags[0]).toMatch(/nobody’s contract|no owner/);
    const act = o.store.activities.find((a) => a.kpiId === 'k-scale-K2.1.1')!;
    expect(own.addDependency(SC2, act.id, '2026-12-31', '')).toEqual({ ok: true });
    expect(as(o, 'm-scale-off1').targets.addDependency(SC2, act.id, '2026-12-31', '')).toEqual({ ok: false, error: 'not_allowed' });
    expect(as(o, 'm-scale-dh21').targets.addDependency('ks-kb-k-scale-K2.1.1-2026-u-scale-d2p1', SC2, '2026-12-31', '')).toEqual({ ok: true });
    expect(own.addDependency(SC2, 'ks-kb-k-scale-K2.1.1-2026-u-scale-d2p1', '2026-12-31', '')).toEqual({ ok: false, error: 'circle' });
    const first = own.share(SC2)!.deps[0]!.id;
    expect(own.removeDependency(first)).toEqual({ ok: true });
  });
});

describe('every role in every organisation', () => {
  it('opens Targets, shares, To verify and the proposals without error', () => {
    for (const o of createSampleOrgs()) for (const m of Object.values(o.devRoles)) {
      const r = createMemoryRepository([o.store], o.orgId, m, NOW);
      r.targets.list(); r.targets.proposalsToDecide(); r.progress.page();
      for (const sh of o.store.kpiShares) r.targets.share(sh.id);
      for (const k of o.store.kpis) r.targets.cascadeLine(k.id);
    }
  });
});
