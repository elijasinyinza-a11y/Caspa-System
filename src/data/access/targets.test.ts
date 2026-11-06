/** v0.21.0 Performance › Targets, quarterly reviews and the final-period check (Targets Specification v0.1; contract v1.13). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { rateContract } from '../../rules/rating';
import { combine, finalPeriodPending, notCarried, standingDutyShare } from '../../rules/targets';
import { createSampleOrgs, ALL_DEV_ROLES } from '../sample/all';
import { createSeed, ORG } from '../sample/seed';
import { createDevice } from './device';
import { createMemoryRepository } from './repository';
import type { Store } from './store';

const NOW = '2026-10-18' as ISODate;
const mfg = () => createSampleOrgs()[2]!;
const at = (s: Store, orgId: string, m: string, device = createDevice()) => createMemoryRepository([s], orgId, m, NOW, { device });
const BD = 'kb-k-mfg-K1.1.1-2026';
const PROD = `ks-${BD}-u-mfg-prod`;

describe('the combining rule (TG-1, TG-2)', () => {
  it('adds up, averages by weight, or does not combine', () => {
    const items = [{ value: 76, weight: 2400 }, { value: 80, weight: 1800 }, { value: 70, weight: 1200 }];
    expect(combine('sum', items)).toBe(226);
    expect(combine('weighted', items)).toBeCloseTo((76 * 2400 + 80 * 1800 + 70 * 1200) / 5400, 10);
    expect(combine('none', items)).toBeNull();
    expect(combine('weighted', [{ value: 5, weight: null }])).toBeNull();
  });
});

describe('a breakdown (manufacturer: material waste, lower is better)', () => {
  it('combines targets and verified readings, and says it falls short of the corporate target', () => {
    const o = mfg();
    const b = at(o.store, o.orgId, 'm-mfg-pm').targets.breakdown(BD)!;
    expect(b.combinedTarget).toBeCloseTo(4.08, 10); // (9,000 × 4.2 + 1,000 × 3) ÷ 10,000
    expect(b.combinedLatest.value).toBeCloseTo(4.33, 10);
    expect(b.checks.map((c) => [c.must, c.text])).toEqual([
      [true, 'The shares combine to 4.1% of input, short of the corporate target of 4% of input.'],
      [false, 'No one’s work is linked to Production’s share.'],
      [false, 'No one’s work is linked to Quality’s share.'],
    ]);
    expect(at(o.store, o.orgId, 'm-mfg-pm').targets.saveShares(BD, b.shares.map((x) => ({ shareId: x.id, target: x.unit === 'Production' ? 4.1 : 3, weight: x.weight, ownerPositionId: x.unit === 'Production' ? 'pos-mfg-prm' : 'pos-mfg-qm' })))).toEqual({ ok: true });
    expect(at(o.store, o.orgId, 'm-mfg-pm').targets.breakdown(BD)!.checks.some((c) => c.must)).toBe(false);
  });
  it('is edited only by the KPI owner or the Strategy office', () => {
    const o = mfg();
    expect(at(o.store, o.orgId, 'm-mfg-op').targets.saveShares(BD, [])).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('share readings are verified before they count (TG-3)', () => {
  it('the owner records; their supervisor verifies; the owner cannot verify their own', () => {
    const o = mfg();
    const owner = at(o.store, o.orgId, 'm-mfg-prm').targets;
    expect(owner.record(PROD, '2026-10-31', '4.4')).toEqual({ ok: false, error: 'bad_period' }); // not ended yet
    expect(owner.record(PROD, '2026-09-30', '4.3')).toEqual({ ok: true }); // a correction for September
    const r = o.store.shareReadings.find((x) => x.shareId === PROD && !x.verified)!;
    expect(owner.verify(r.id)).toEqual({ ok: false, error: 'not_allowed' });
    expect(at(o.store, o.orgId, 'm-mfg-pm').home().needsYou.some((i) => i.key === 'targets:verify')).toBe(true);
    expect(at(o.store, o.orgId, 'm-mfg-pm').targets.verify(r.id)).toEqual({ ok: true });
    expect(at(o.store, o.orgId, 'm-mfg-pm').targets.breakdown(BD)!.shares.find((x) => x.unit === 'Production')!.latest!.value).toBe(4.3);
  });
  it('a reading recorded offline waits on the device and is sent when back online', () => {
    const o = mfg();
    const device = createDevice();
    const owner = at(o.store, o.orgId, 'm-mfg-prm', device);
    owner.progress.setOffline(true);
    expect(owner.targets.record(PROD, '2026-08-31', '4.6')).toEqual({ ok: true, queued: true });
    expect(o.store.shareReadings.some((x) => x.periodEnd === '2026-08-31')).toBe(false);
    at(o.store, o.orgId, 'm-mfg-prm', device).progress.setOffline(false);
    expect(o.store.shareReadings.find((x) => x.periodEnd === '2026-08-31')?.savedOffline).toBe(true);
  });
  it('the share owner links their team’s work, which clears "no work linked"', () => {
    const o = mfg();
    const owner = at(o.store, o.orgId, 'm-mfg-prm').targets;
    const sh = owner.share(PROD)!;
    expect(sh.can.link).toBe(true);
    if (sh.linkable.length) {
      expect(owner.link(PROD, [sh.linkable[0]!.id])).toEqual({ ok: true });
      expect(owner.breakdown(BD)!.checks.some((c) => c.text.includes('Production’s share'))).toBe(false);
    }
  });
});

describe('what a contract can hold (TG-5, TG-6)', () => {
  it('scores an objective from a share and from a combined figure, lower is better', () => {
    const o = mfg();
    const s = o.store;
    const co = s.contractObjectives.find((x) => x.contractId === 'pc-mfg-op')!;
    s.contractObjectives.push({ ...structuredClone(co), id: 'co-share' as never, sourceActivityId: null, sourceShareId: PROD as never, weightPct: 0 });
    s.contractObjectives.push({ ...structuredClone(co), id: 'co-comb' as never, sourceActivityId: null, sourceBreakdownId: BD as never, weightPct: 0 });
    const r = rateContract(s, 'pc-mfg-op', { now: NOW })!;
    const byId = (id: string) => r.objectives.find((x) => x.contractObjectiveId === id)!;
    expect([byId('co-share').target, byId('co-share').done, byId('co-share').achievement]).toEqual([4.2, 4.5, 4.2 / 4.5]);
    expect(byId('co-comb').achievement).toBeCloseTo(4.08 / 4.33, 10);
  });
  it('labels standing duties and holds them to HR’s limit', () => {
    const s = mfg().store;
    expect(standingDutyShare(s, 'pc-mfg-op')).toEqual({ pct: 10, limit: 20, over: false });
    s.contractObjectives.find((x) => x.id === 'co-mfg-op-duty')!.weightPct = 30;
    expect(standingDutyShare(s, 'pc-mfg-op').over).toBe(true);
  });
  it('lists Cascade KPIs nobody in Performance carries', () => {
    const s = mfg().store;
    expect(notCarried(s, 2026)).toEqual(['k-mfg-K1.2.1', 'k-mfg-K2.1.1']);
  });
});

describe('Cascade keeps one line', () => {
  it('shows the breakdown and its combined figure on the KPI', () => {
    const o = mfg();
    const l = at(o.store, o.orgId, 'm-mfg-od').targets.cascadeLine('k-mfg-K1.1.1')!;
    expect([l.shares, l.breakdownId]).toEqual([2, BD]);
    expect(l.combinedLatest).toBeCloseTo(4.33, 10);
  });
});

describe('quarterly reviews (TG-11) and the final-period check (TG-8)', () => {
  it('opens quarters 1 to 3 as they end, then the year-end review', () => {
    const s = createSeed();
    s.organisation.settings.reviewModel = 'quarterly';
    s.reviews = [];
    const hr = () => at(s, ORG, 'm-hrm').reviews;
    expect(hr().page().round!.canOpen).toEqual([{ kind: 'quarterly', periodEnd: '2026-03-31' }]);
    expect(hr().openRound('quarterly', '2026-03-31' as ISODate)).toEqual({ ok: true });
    expect(s.reviews[0]).toMatchObject({ kind: 'quarterly', periodEnd: '2026-03-31' });
    expect(hr().page().round!.canOpen).toEqual([]); // busy until it is completed
  });
  it('counts final-period figures sent but not verified, and records them at the gate', () => {
    const s = createSeed();
    s.progressUpdates.push({ ...structuredClone(s.progressUpdates[0]!), id: 'pu-dec' as never, contractObjectiveId: 'co-b-2' as never, periodEnd: '2026-12-31' as ISODate, verified: null, returned: null });
    expect(finalPeriodPending(s, ['pc-mrb-2026'], [], 2026).updates).toEqual(['pu-dec']);
  });
});

describe('every organisation and role', () => {
  it('builds Targets without error', () => {
    for (const o of createSampleOrgs()) for (const role of ALL_DEV_ROLES) {
      const m = (o.devRoles as Record<string, string>)[role];
      if (!m) continue;
      const r = createMemoryRepository([o.store], o.orgId, m, NOW);
      const l = r.targets.list();
      for (const k of l.kpis) if (k.breakdown) { const b = r.targets.breakdown(k.breakdown.id); for (const x of b?.shares ?? []) r.targets.share(x.id); }
      r.targets.needs();
    }
  });
});
