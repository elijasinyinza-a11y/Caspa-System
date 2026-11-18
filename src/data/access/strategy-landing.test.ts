/** The Strategy landing (v0.28.0; Strategy Landing Specification v0.1, SL-1 to SL-7). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { ALL_DEV_ROLES, createSampleOrgs } from '../sample/all';
import { devMembership } from '../sample/review';
import { can } from './permissions';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;

function setup() {
  const orgs = createSampleOrgs();
  const stores = orgs.map((o) => o.store);
  const org = orgs[0]!;
  const as = (role: Parameters<typeof devMembership>[1], o = org) => createMemoryRepository(stores, o.orgId, devMembership(o, role, NOW)!, NOW);
  return { orgs, stores, org, as };
}

describe('the landing', () => {
  it('shows Sample Water Utility’s plan, its year, and goals grouped by perspective in the organisation’s order (SL-2)', () => {
    const l = setup().as('strategy').strategyLanding.landing()!;
    expect(l.plan).toMatchObject({ title: 'Strategic Plan 2022–2026', period: 'FY2022 to FY2026', year: { label: 'FY2026', n: 5, of: 5 }, confirmed: { by: 'Chanda Mulenga', ref: 'BR/2021/14' } });
    expect(l.groups.map((g) => [g.label, g.goals.map((x) => x.ref.code)])).toEqual([
      ['Customer', ['G2', 'G3']], ['Innovation and learning', ['G4']], ['Financial', ['G1']],
    ]);
    const g1 = l.groups.flatMap((g) => g.goals).find((g) => g.ref.code === 'G1')!;
    expect(g1).toMatchObject({ objectives: 2, kpis: 2, owner: { position: 'Head of Finance', person: 'Ruth Phiri' } });
  });
  it('uses one group in code order for an organisation without a scorecard', () => {
    const { orgs, as } = setup();
    const ngo = orgs.find((o) => o.store.organisation.name.includes('Health NGO'))!;
    expect(ngo.store.organisation.perspectives).toBeNull();
    const l = as('strategy', ngo).strategyLanding.landing()!;
    expect(l.groups).toHaveLength(1);
    expect(l.groups[0]!.label).toBeNull();
    expect(l.groups[0]!.goals.map((g) => g.ref.code)).toEqual(['OC1', 'OC2']);
  });
  it('shows the same goal progress as Home', () => {
    const { as } = setup();
    const exec = as('executive');
    const home = exec.home().goalHealth!;
    for (const g of exec.strategyLanding.landing()!.groups.flatMap((x) => x.goals)) {
      expect(g.progress).toEqual(home.find((h) => h.ref.id === g.ref.id)!.progress);
    }
  });
  it('shows reasons in full to those who may read 4Q entries, and a count to everyone else (SL-3)', () => {
    const { as } = setup();
    const g = (role: Parameters<typeof devMembership>[1], code: string) => as(role).strategyLanding.landing()!.groups.flatMap((x) => x.goals).find((x) => x.ref.code === code)!.reasons;
    expect(g('strategy', 'G1')).toEqual({ visible: true, entries: [{ on: 'goal', cell: { band: 'retraction', column: 'failures' }, text: 'Billed revenue has not covered operating and maintenance costs.' }] });
    expect(g('employee', 'G1')).toEqual({ visible: false, count: 1 });
    expect(g('employee', 'G3')).toEqual({ visible: true, entries: [] }); // nothing to hide: "No reason recorded"
  });
  it('names the goals the viewer’s signed work serves, and nothing without a contract (SL-5)', () => {
    const { as } = setup();
    expect(as('employee').strategyLanding.landing()!.yourPart?.map((g) => g.code)).toEqual(['G1']);
    expect(as('strategy').strategyLanding.landing()!.yourPart).toBeNull();
  });
});

describe('recording the vision and mission (SL-4)', () => {
  it('only the Executive, only when none are recorded, and then everyone sees them', () => {
    const { as, org } = setup();
    expect(as('strategy').strategyLanding.landing()!.canRecord).toBeNull();
    expect(as('strategy').strategyLanding.recordStatements('V', 'M')).toEqual({ ok: false, error: 'not_allowed' });
    const exec = as('executive').strategyLanding;
    expect(exec.landing()!.canRecord).toBe('all');
    expect(exec.recordStatements('Safe water for every household', ' ')).toEqual({ ok: false, error: 'text_required' });
    expect(exec.recordStatements('Safe water for every household', 'We supply and treat water')).toEqual({ ok: true });
    const seen = as('employee').strategyLanding.landing()!.statements;
    expect(seen).toEqual({ vision: 'Safe water for every household', mission: 'We supply and treat water', values: [], recorded: { by: 'Chanda Mulenga', on: NOW } });
    expect(as('executive').strategyLanding.landing()!.canRecord).toBe('values'); // CV-5: values may still be added once
    expect(as('executive').strategyLanding.recordStatements('Again', 'Again')).toEqual({ ok: false, error: 'already_recorded' });
    expect(org.store.auditEntries.filter((e) => e.entity.type === 'VisionStatement' && e.action === 'confirm')).toHaveLength(2);
  });
});

describe('every sample organisation and dev role (SL-1)', () => {
  it('opens Strategy for everyone and shows only what the matrix allows', () => {
    const { orgs, stores } = setup();
    for (const o of orgs) {
      for (const role of ALL_DEV_ROLES) {
        const m = devMembership(o, role, NOW);
        if (!m) continue;
        const repo = createMemoryRepository(stores, o.orgId, m, NOW);
        expect(repo.workspaces()).toContain('strategy');
        const l = repo.strategyLanding.landing();
        if (!o.store.plans.some((p) => p.status === 'active')) { expect(l).toBeNull(); continue; }
        expect(l).not.toBeNull();
        for (const g of l!.groups.flatMap((x) => x.goals)) {
          const goal = o.store.goals.find((x) => x.id === g.ref.id)!;
          const readable = goal.fourQEntryIds.every((q) => can(o.store, repo.viewer, 'view', { type: 'FourQEntry', id: q }));
          expect(g.reasons.visible, `${o.store.organisation.name} ${role} ${goal.code}`).toBe(readable);
        }
        if (l!.canRecord) expect(repo.viewer.roles).toContain('executive');
      }
    }
  });
});
