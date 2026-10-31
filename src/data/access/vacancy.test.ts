/**
 * Vacancies and handover (slice 9; decisions H1 to H9): what each position holds, who sees the view and the list,
 * the order of what stops soonest, and the limits of section 6.
 */
import type { ISODate } from '../../contract/caspa-data-contract';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
const NGO = 'org-ngo';
const fresh = () => {
  const orgs = createReviewOrgs();
  const as = (role: Parameters<typeof devMembership>[1], orgId = SWU) => {
    const org = orgs.find((o) => o.orgId === orgId)! as ReviewOrg;
    return createMemoryRepository(orgs.map((o) => o.store), orgId, devMembership(org, role, NOW)!, NOW);
  };
  return { orgs, as, store: (id: string) => orgs.find((o) => o.orgId === id)!.store };
};

describe('the vacancy view (H1, H2, H4)', () => {
  it('lists the vacant Head of Commercial post at Sample Water Utility with what it holds', () => {
    const { as } = fresh();
    const v = as('executive').structure.vacancies()!;
    expect(v.scope).toBe('all');
    expect(v.rows.map((r) => [r.title, r.state, r.vacantSince])).toEqual([['Head of Commercial', 'vacant', '2026-09-01']]);
    const r = v.rows[0]!;
    expect(r.owned.map((o) => o.code).sort()).toEqual(['A1.2.1.2', 'O1.1']);
    expect(r.lines.map((l) => [l.description, l.amount?.amountMinor ?? null])).toEqual([
      ['Customer meters', 120_000_000], ['Meter installation', 30_000_000], ['Vehicle hire, Zone C', 18_000_000],
    ]);
    expect(r.lines.find((l) => l.description === 'Vehicle hire, Zone C')!.mustFix).toBe(true);
    expect(r.answersFor.map((u) => u.name)).toEqual(['Commercial']);
    expect(r.reports).toEqual([{ positionId: 'pos-cm', title: 'Commercial Manager', holder: 'Peter Mwansa' }]);
    expect(r.contracts).toEqual([]);
    expect(r.checks.some((c) => c.must)).toBe(true); // the unlinked line is sent to this post
  });

  it('puts first the post whose vacancy stops contracts (H1), vacant before acting', () => {
    const { as } = fresh();
    const admin = as('admin').structure;
    expect(admin.savePosition('pos-co', { title: 'Commercial Officer', unitId: 'u-com', reportsToId: 'pos-cm', ref: null, holder: null })).toEqual({ ok: true });
    const rows = as('executive').structure.vacancies()!.rows;
    expect(rows.map((r) => r.title)).toEqual(['Commercial Officer', 'Head of Commercial']);
    const co = rows[0]!;
    expect(co.contracts.map((c) => [c.positionTitle, c.status, c.openReview, c.needsSupervisor])).toEqual([
      ['Meter Reader, Zone B', 'signed', true, true], ['Meter Reader, Zone C', 'draft', false, true],
    ]);
    expect(co.reports).toHaveLength(4);
  });

  it('lists an acting post after the vacant ones (the NGO)', () => {
    const { as } = fresh();
    const rows = as('strategy', NGO).structure.vacancies()!.rows;
    expect(rows.map((r) => [r.title, r.state, r.holder?.name ?? null])).toEqual([['Programme Coordinator', 'acting', 'Grace Namutebi']]);
  });

  it('H4: oversight roles see it; managers see the units they answer for; others do not', () => {
    const { as } = fresh();
    for (const role of ['executive', 'hr', 'strategy', 'admin'] as const) expect(as(role).structure.vacancies()?.scope).toBe('all');
    expect(as('finance').structure.vacancies()).toBeNull(); // answers for Finance, but manages nobody
    expect(as('employee').structure.vacancies()).toBeNull(); // a meter reader answers for their zone but manages nobody
    expect(as('supervisor').structure.vacancies()).toBeNull(); // answers for no unit
  });

  it('section 6: amounts for the Executive and Finance only, contract names for HR and the supervisor', () => {
    const { as } = fresh();
    as('admin').structure.savePosition('pos-co', { title: 'Commercial Officer', unitId: 'u-com', reportsToId: 'pos-cm', ref: null, holder: null });
    const hr = as('hr').structure.vacancies()!.rows;
    expect(hr.find((r) => r.title === 'Head of Commercial')!.lines.every((l) => l.amount === null)).toBe(true);
    expect(hr.find((r) => r.title === 'Commercial Officer')!.contracts.map((c) => c.personName)).toEqual(['Mary Chileshe', 'Daniel Sakala']);
    const exec = as('executive').structure.vacancies()!.rows;
    expect(exec.find((r) => r.title === 'Commercial Officer')!.contracts.map((c) => c.personName)).toEqual([null, null]);
  });

  it('follows the organisation’s setting for who sees the structure (v1.5)', () => {
    const { as } = fresh();
    const admin = as('admin').structure;
    const d = admin.page().details;
    admin.saveDetails({ ...d, settings: { ...d.settings, structureView: { fullViewRoles: ['hr'], others: 'own_line' } } });
    expect(as('executive').structure.vacancies()!.rows).toEqual([]); // the Head of Commercial is outside the Managing Director's own line
    expect(as('hr').structure.vacancies()!.rows).toHaveLength(1);
  });
});

describe('the handover list (H5 to H7)', () => {
  it('H5: the administrator, the holder, their supervisor and HR may open it; nobody else', () => {
    const { as } = fresh();
    expect(as('hr').structure.handover('pos-co')).not.toBeNull();
    expect(as('supervisor').structure.handover('pos-co')).not.toBeNull(); // the holder
    expect(as('supervisor').structure.handover('pos-mrb')).not.toBeNull(); // their supervisor
    expect(as('employee').structure.handover('pos-co')).toBeNull();
    expect(as('executive').structure.handover('pos-co')).toBeNull();
    expect(as('finance').structure.handover('pos-hoc')).toBeNull();
  });

  it('adds what leaves with the person and what waits on the supervisor', () => {
    const { as } = fresh();
    const h = as('hr').structure.handover('pos-co')!;
    expect(h.holder?.name).toBe('Esther Banda');
    expect(h.waiting.map((c) => [c.positionTitle, c.openReview, c.status])).toEqual([['Meter Reader, Zone B', true, 'signed'], ['Meter Reader, Zone C', false, 'draft']]);
    expect(h.rolesLeaving).toEqual([]); // Esther Banda has no assigned roles; Natasha administers here, so she is shown that
    expect(as('supervisor').structure.handover('pos-co')!.rolesLeaving).toBeNull(); // roles: administrators only
    const mine = as('hr').structure.handover('pos-hrm')!;
    expect(mine.rolesLeaving).toEqual(['hr', 'org_admin']);
  });

  it('shows the holder’s own signed contract as listed only (H6)', () => {
    const { as } = fresh();
    expect(as('employee').structure.handover('pos-mrb')!.ownContract).toEqual({ status: 'signed' });
  });

  it('H7: an AI note restates the list and is not stored', async () => {
    const { as, store } = fresh();
    const before = JSON.stringify(store(SWU));
    const note = await as('hr').structure.handoverNote('pos-co');
    expect(note).toContain('Esther Banda hands over the Commercial Officer post');
    expect(note).toContain('2 contracts; 2 need the supervisor’s action first');
    expect(JSON.stringify(store(SWU))).toBe(before);
    expect(await as('hr').structure.handoverNote('pos-hoc')).toBeNull(); // vacant: no one to hand over
  });

  it('the administrator sees what a holder change passes on', () => {
    const { as } = fresh();
    expect(as('admin').structure.holdingsPreview('pos-co')).toEqual({ owned: 2, lines: 0, contracts: 2, reports: 4, needingSupervisor: 2 });
    expect(as('executive').structure.holdingsPreview('pos-co')).toBeNull();
  });
});

describe('a structure of about 5,000 positions', () => {
  it('lists every vacancy within the time limit', async () => {
    const { largeStructureRows } = await import('../sample/scale');
    const { withHeader } = await import('./setup/import');
    const { as } = fresh();
    const admin = as('admin', 'org-new').structure;
    admin.importSheet(withHeader(largeStructureRows()));
    for (const item of admin.page().checks.must.flatMap((g) => g.items)) admin.savePerson(item.ids[1]!, { email: null });
    expect(admin.confirm()).toEqual({ ok: true });
    const t0 = performance.now();
    const v = as('admin', 'org-new').structure.vacancies()!;
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(v.rows.length).toBeGreaterThan(400);
    expect(v.rows.every((r) => r.state === 'vacant')).toBe(true);
  });
});
