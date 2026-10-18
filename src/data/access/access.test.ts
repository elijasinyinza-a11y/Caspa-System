import type { ISODate } from '../../contract/caspa-data-contract';
import { createSeed, DEV_ROLE_MEMBERSHIPS, ORG } from '../sample/seed';
import { can } from './permissions';
import { createMemoryRepository } from './repository';
import { resolveViewer } from './viewer';

const NOW = '2026-10-18' as ISODate;
const repo = (role: keyof typeof DEV_ROLE_MEMBERSHIPS) => createMemoryRepository([createSeed()], ORG, DEV_ROLE_MEMBERSHIPS[role], NOW);
const counts = (role: keyof typeof DEV_ROLE_MEMBERSHIPS) => {
  const f = repo(role).findings();
  return [f.filter((x) => x.finding.blocksAt.length).length, f.filter((x) => !x.finding.blocksAt.length).length];
};

describe('data access', () => {
  it('works in FY2026 on 18 October 2026', () => expect(repo('executive').financialYear).toBe(2026));

  it('shows each role the workspaces in the approved shell', () => {
    expect(repo('executive').workspaces()).toEqual(['home', 'strategy', 'cascade', 'plan', 'performance']);
    expect(repo('finance').workspaces()).toEqual(['home', 'strategy', 'cascade', 'plan']);
    expect(repo('supervisor').workspaces()).toEqual(['home', 'cascade', 'performance']);
    expect(repo('employee').workspaces()).toEqual(['home', 'performance']);
  });

  it('gives each role only the findings it may see and is concerned with', () => {
    expect(counts('executive')).toEqual([1, 7]);
    expect(counts('finance')).toEqual([1, 2]);
    expect(counts('supervisor')).toEqual([0, 0]); // the orphan line goes to the head of Commercial
    expect(counts('employee')).toEqual([0, 0]);
  });

  it('restricts budget lines to Finance, Executive and budget holders', () => {
    const s = createSeed();
    const v = (m: string) => resolveViewer(s, m, NOW, 2026);
    const line = { type: 'BudgetLine', id: 'bl-1' };
    expect(can(s, v(DEV_ROLE_MEMBERSHIPS.finance), 'view', line)).toBe(true);
    expect(can(s, v(DEV_ROLE_MEMBERSHIPS.supervisor), 'view', line)).toBe(false); // in Commercial, but not accountable (v1.2)
    expect(can(s, v(DEV_ROLE_MEMBERSHIPS.employee), 'view', line)).toBe(false);
  });

  it('lets the employee, supervisor and next-level reviewer see a review, and nobody else', () => {
    const s = createSeed();
    const v = (m: string) => resolveViewer(s, m, NOW, 2026);
    const contract = { type: 'Review', id: 'x' };
    const pc = { type: 'PerformanceContract', id: 'pc-mrb-2026' };
    expect(can(s, v(DEV_ROLE_MEMBERSHIPS.employee), 'view', pc)).toBe(true);
    expect(can(s, v(DEV_ROLE_MEMBERSHIPS.supervisor), 'view', pc)).toBe(true);
    expect(can(s, v(DEV_ROLE_MEMBERSHIPS.finance), 'view', pc)).toBe(false);
    expect(can(s, v(DEV_ROLE_MEMBERSHIPS.finance), 'view', contract)).toBe(false);
  });

  it('shows the organisation switcher only to people with more than one membership', () => {
    expect(repo('executive').organisationsForPerson()).toHaveLength(1);
  });

  it('computes funding coverage from records', () => {
    const c = repo('employee').home().coverage.map((g) => [g.code, g.funded, g.total]);
    expect(c).toEqual([['G1', 1, 5], ['G2', 1, 1], ['G3', 0, 1], ['G4', 1, 1]]);
  });
});
