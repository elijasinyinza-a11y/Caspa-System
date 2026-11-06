/** v0.17.0 (BUILD-BRIEF section 37, NV-1 to NV-9): sub-menus for every role in every sample organisation. */
import type { ISODate } from '../../contract/caspa-data-contract';
import { MENU_CAP, openStageOf, strategyMenu } from '../../selectors/nav';
import { ALL_DEV_ROLES } from '../sample/all';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const orgs = createReviewOrgs();
const stores = orgs.map((o) => o.store);
const labels = (r: ReturnType<typeof createMemoryRepository>) => r.menu().strategy.map((e) => e.label);

describe('the menu model (NV-9)', () => {
  it('never shows more than four entries, in fixed places', () => {
    const all = strategyMenu({ forming: { stages: ['overview', 'composition'], openStage: 'composition', audienceOnly: false }, registers: ['baselines'], planDocument: true, communication: true });
    expect(all.map((e) => e.entry)).toEqual(['forming', 'registers', 'plan-document', 'communication']);
    expect(strategyMenu({ forming: null, registers: [], planDocument: false, communication: true }).map((e) => e.entry)).toEqual(['communication']);
    expect(strategyMenu({ forming: { stages: ['consultation'], openStage: 'consultation', audienceOnly: true }, registers: [], planDocument: false, communication: false })[0]!.label).toBe('say');
  });
  it('opens on the furthest open stage the person sees', () => {
    expect(openStageOf(['overview', 'conception', 'consultation', 'composition'], (s) => s !== 'composition')).toBe('consultation');
    expect(openStageOf(['overview', 'consultation'], (s) => s === 'composition')).toBe('overview');
  });
});

describe.each(orgs.map((o) => [o.store.organisation.name, o] as const))('%s', (_n, org) => {
  it.each(ALL_DEV_ROLES)('the %s role: at most four, each entry opens to something (N-4, N-5)', (role) => {
    const m = devMembership(org as ReviewOrg, role, NOW);
    if (!m) return;
    const repo = createMemoryRepository(stores, org.orgId, m, NOW);
    const menu = repo.menu();
    expect(menu.strategy.length).toBeLessThanOrEqual(MENU_CAP);
    expect(menu.organisation.length).toBeLessThanOrEqual(MENU_CAP);
    if (menu.strategy.length) expect(repo.workspaces()).toContain('strategy');
    for (const e of menu.strategy) {
      if (e.entry === 'forming') expect(repo.formation.page().plan).not.toBeNull();
      if (e.entry === 'registers') expect(menu.registers.length).toBeGreaterThan(0);
      if (e.entry === 'plan-document') expect(repo.planDocument.page()).not.toBeNull();
      if (e.entry === 'communication') expect(repo.communication.page().plans.length).toBeGreaterThan(0);
    }
    // v0.18.0: Progress updates shows exactly when its page holds the person's own contract or someone to verify.
    expect(menu.performance.length).toBeLessThanOrEqual(MENU_CAP);
    const pp = repo.workspaces().includes('performance') ? repo.progress.page() : null;
    expect(menu.performance.some((e) => e.entry === 'progress')).toBe(!!pp && (pp.mine !== null || pp.verify !== null));
    if (menu.performance.length) expect(repo.workspaces()).toContain('performance');
    if (menu.organisation.some((e) => e.entry === 'vacancies')) expect(repo.structure.vacancies()).not.toBeNull();
    if (menu.organisation.some((e) => e.entry === 'people')) expect(repo.structure.page().isAdmin).toBe(true);
  });
});

describe('Sample Water Utility at 18 October 2026', () => {
  const swu = orgs.find((o) => o.orgId === 'org-sample-water')! as ReviewOrg;
  const as = (role: Parameters<typeof devMembership>[1]) => createMemoryRepository(stores, swu.orgId, devMembership(swu, role, NOW)!, NOW);
  it('gives the menus the specification lists (section 6)', () => {
    expect(labels(as('executive'))).toEqual(['forming', 'registers', 'communication']);
    expect(labels(as('strategy'))).toEqual(['forming', 'registers', 'communication']);
    expect(labels(as('employee'))).toEqual([]);
    expect(as('hr').menu().organisation.map((e) => e.entry)).toEqual(['vacancies', 'people']);
    expect(as('executive').menu().organisation.map((e) => e.entry)).toEqual(['vacancies']);
    expect(as('employee').menu().organisation).toEqual([]);
    expect(as('strategy').menu().forming).toMatchObject({ openStage: 'overview', audienceOnly: false });
  });
  it('gives Progress updates to the Meter Reader, Zone B and the Commercial Officer only (v0.18.0)', () => {
    const perf = (r: Parameters<typeof devMembership>[1]) => as(r).menu().performance.map((e) => e.label);
    // v0.20.0 (RV-5): Reviews joins for the employee, the supervisor, the next-level reviewer and HR.
    // v0.22.0: Contracts for anyone with a contract, supervisors of positions, and HR (at most four entries, N-5).
    expect(perf('employee')).toEqual(['progress', 'reviews', 'contracts']);
    expect(perf('supervisor')).toEqual(['progress', 'reviews', 'contracts']);
    expect(perf('reviewer')).toEqual(['reviews', 'contracts']);
    expect(perf('hr')).toEqual(['reviews', 'contracts']);
    // v0.21.0: Targets for KPI owners (the Executive owns one) and the Strategy office.
    expect(perf('executive')).toEqual(['targets', 'contracts']);
    expect(perf('strategy')).toEqual(['targets']);
    expect(perf('finance')).toEqual([]);
  });
  it('opens Registers on Compliance for the compliance officer (NV-3)', () => {
    expect(as('compliance').menu().registers[0]).toBe('compliance');
    expect(as('strategy').menu().registers[0]).toBe('baselines');
  });
});

describe('"Needs you" opens the exact page (C-4)', () => {
  it('sends Strategy items to their entry, stage and tab, and only to people who have Strategy', () => {
    for (const o of orgs) for (const role of ALL_DEV_ROLES) {
      const m = devMembership(o as ReviewOrg, role, NOW);
      if (!m) continue;
      const repo = createMemoryRepository(stores, o.orgId, m, NOW);
      for (const i of repo.home().needsYou) {
        expect(i.link?.kind === 'workspace' && i.link.w === 'strategy', i.key).toBe(false);
        if (i.link?.kind === 'progress') {
          expect(repo.workspaces(), i.key).toContain('performance');
          expect(repo.menu().performance.map((e) => e.entry), i.key).toContain('progress');
        }
        if (i.link?.kind === 'strategy') {
          expect(repo.workspaces(), i.key).toContain('strategy');
          expect(repo.menu().strategy.map((e) => e.entry), i.key).toContain(i.link.entry);
        }
      }
    }
  });
});
