/**
 * Access review (v0.30.0; Access Review Specification v0.1, AR-1 to AR-10; BUILD-BRIEF section 54): the four fixes
 * D1 to D4, the five ACCESS- checks, People and access by role, and the audit entries at confirmation (AR-8).
 */
import type { ISODate } from '../../contract/caspa-data-contract';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { SAMPLE_TEMPLATE_ROWS } from '../sample/new-org';
import { createMemoryRepository } from './repository';
import { withHeader } from './setup/import';
import { resolveViewer } from './viewer';
import { accessEnded, heldSince, membershipActiveOn, ROLE_ORDER } from '../../rules/access';
import { setupChecks, type StructureInput, type WorthKind } from '../../rules/setup';
import { RULES } from '../../rules/integrity';
import { fixTarget } from '../../selectors/integrity';
import { parseRoute, hrefFor } from '../../routes/router';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
const NEW = 'org-new';
const fresh = () => {
  const orgs = createReviewOrgs();
  const store = (id: string) => orgs.find((o) => o.orgId === id)!.store;
  const as = (role: Parameters<typeof devMembership>[1], orgId = SWU, on: ISODate = NOW) => {
    const org = orgs.find((o) => o.orgId === orgId)! as ReviewOrg;
    return createMemoryRepository(orgs.map((o) => o.store), orgId, devMembership(org, role, on)!, on);
  };
  const asMember = (membershipId: string, orgId = SWU, on: ISODate = NOW) => createMemoryRepository(orgs.map((o) => o.store), orgId, membershipId, on);
  return { orgs, store, as, asMember };
};
const ruleIds = (r: ReturnType<ReturnType<typeof fresh>['as']>) => r.findings().map((f) => f.finding.ruleId).filter((id) => id.startsWith('ACCESS-'));

describe('D1: access counts only between its start and end dates', () => {
  it('membershipActiveOn is inclusive at both ends, and an ended membership never counts', () => {
    const m = { status: 'active' as const, startsOn: '2026-10-01' as ISODate, endsOn: '2026-11-30' as ISODate };
    expect(membershipActiveOn(m, '2026-09-30' as ISODate)).toBe(false);
    expect(membershipActiveOn(m, '2026-10-01' as ISODate)).toBe(true);
    expect(membershipActiveOn(m, '2026-11-30' as ISODate)).toBe(true);
    expect(membershipActiveOn(m, '2026-12-01' as ISODate)).toBe(false);
    expect(membershipActiveOn({ ...m, status: 'ended' }, '2026-10-15' as ISODate)).toBe(false);
    expect(accessEnded(m, '2026-12-01' as ISODate)).toBe(true);
    expect(accessEnded(m, '2026-09-30' as ISODate)).toBe(false); // not started is not ended
  });

  it('the sample facilitator resolves within her dates only', () => {
    const { store } = fresh();
    const s = store(SWU);
    expect(resolveViewer(s, 'm-fac', '2026-11-30' as ISODate, 2026).roles).toEqual(['facilitator']);
    expect(() => resolveViewer(s, 'm-fac', '2026-12-01' as ISODate, 2026)).toThrow();
    expect(() => resolveViewer(s, 'm-fac', '2026-09-30' as ISODate, 2026)).toThrow();
  });

  it('the consultant at Sample New Organisation resolves on 31 December 2026 and not on 1 January 2027', () => {
    const { store } = fresh();
    const s = store(NEW);
    const m = s.memberships.find((x) => x.endsOn === '2026-12-31')!;
    expect(resolveViewer(s, m.id, '2026-12-31' as ISODate, 2026).roles).toContain('org_admin');
    expect(() => resolveViewer(s, m.id, '2027-01-01' as ISODate, 2027)).toThrow();
  });

  it('the organisation switcher leaves out an organisation whose access has ended', () => {
    const { store, asMember } = fresh();
    const s = store(SWU);
    expect(asMember('m-fac', SWU, '2026-11-30' as ISODate).organisationsForPerson().map((o) => o.id)).toEqual([SWU]);
    s.memberships.find((m) => m.id === 'm-md')!.endsOn = '2026-10-17' as ISODate;
    // The Executive still reaches the three test organisations, where her access has no end date, but not this one.
    expect(asMember('m-ngo-shared-exec', 'org-ngo').organisationsForPerson().map((o) => o.id)).not.toContain(SWU);
  });
});

describe('D2: a Facilitator needs an end date', () => {
  it('is refused without one, accepted with one, and the date cannot be cleared or put in the past', () => {
    const { as } = fresh();
    const admin = as('admin').structure;
    expect(admin.savePerson('p-hoo', { roles: ['facilitator'] })).toEqual({ ok: false, error: 'ends_required' });
    expect(admin.savePerson('p-hoo', { endsOn: '2026-12-31' as ISODate })).toEqual({ ok: true });
    expect(admin.savePerson('p-hoo', { roles: ['facilitator'] })).toEqual({ ok: true });
    expect(admin.savePerson('p-fac', { endsOn: null })).toEqual({ ok: false, error: 'ends_required' });
    expect(admin.savePerson('p-fac', { endsOn: '2026-10-17' as ISODate })).toEqual({ ok: false, error: 'ends_past' });
  });

  it('is a must-check in setup (facilitator_no_end), which also covers a role from the spreadsheet', () => {
    const st: StructureInput = {
      units: [{ id: 'u', name: 'Org', unitType: 'Organisation', parentId: null }],
      positions: [{ id: 'p1', unitId: 'u', title: 'Director', ref: null, reportsToId: null, holder: { personId: 'a', acting: false } }],
      people: [
        { id: 'a', fullName: 'A', email: 'a@x.example', roles: ['executive', 'org_admin'] },
        { id: 'f', fullName: 'F', email: null, roles: ['facilitator'], endsOn: null },
      ],
    };
    expect(setupChecks(st).must.map((g) => g.kind)).toEqual(['facilitator_no_end']);
    st.people[1]!.endsOn = '2026-12-31';
    expect(setupChecks(st).must).toEqual([]);
  });

  it('is refused in the setup draft too', () => {
    const { as } = fresh();
    const admin = as('admin', NEW).structure;
    const ireen = admin.page().structure.people.find((p) => p.fullName === 'Ireen Sakala')!;
    expect(admin.savePerson(ireen.id, { roles: ['org_admin', 'facilitator'] })).toEqual({ ok: false, error: 'ends_required' });
  });
});

describe('D3: vacating a position is checked', () => {
  it('the only administrator holding a position cannot be removed from it; anyone else can', () => {
    const { as, store } = fresh();
    const admin = as('admin').structure;
    const pos = (id: string) => store(SWU).positions.find((p) => p.id === id)!;
    const vacate = (id: string) => admin.savePosition(id, { title: pos(id).title, unitId: pos(id).unitId, reportsToId: pos(id).reportsToPositionId, ref: null, holder: null });
    const r = vacate('pos-hrm');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error === 'must_fix' && r.items.map((i) => i.kind)).toEqual(['no_staff_admin']);
    expect(vacate('pos-hoo')).toEqual({ ok: true });
  });
});

describe('D4: End access and Give access again', () => {
  it('ends access from yesterday, keeps the record, and writes an audit entry', () => {
    const { as, store } = fresh();
    const admin = as('admin');
    expect(admin.structure.endAccess('p-kel')).toEqual({ ok: true, leftPositions: [] });
    const m = store(SWU).memberships.find((x) => x.id === 'm-kel')!;
    expect(m).toMatchObject({ status: 'ended', endsOn: '2026-10-17', roles: ['finance'] });
    expect(store(SWU).people.some((p) => p.id === 'p-kel')).toBe(true);
    expect(store(SWU).auditEntries[store(SWU).auditEntries.length - 1]).toMatchObject({ action: 'update', entity: { type: 'Membership', id: 'm-kel' } });
    expect(as('admin').structure.accessByRole()!.ended).toEqual([{ personId: 'p-kel', name: 'Kelvin Mwila', roles: ['finance'], lastDay: '2026-10-17' }]);
    expect(as('admin').structure.endAccess('p-kel')).toEqual({ ok: false, error: 'already' });
  });

  it('a person who holds a position leaves it when their access ends', () => {
    const { as, store } = fresh();
    expect(as('admin').structure.endAccess('p-hof')).toEqual({ ok: true, leftPositions: ['Head of Finance'] });
    expect(store(SWU).assignments.find((a) => a.positionId === 'pos-hof')!.to).toBe('2026-10-17');
  });

  it('is refused for oneself, the last Executive and the last administrator holding a position', () => {
    const { as } = fresh();
    const admin = as('admin').structure;
    expect(admin.endAccess('p-hrm')).toEqual({ ok: false, error: 'own_access' });
    const r = admin.endAccess('p-md');
    expect(!r.ok && r.error === 'must_fix' && r.items.map((i) => i.kind)).toEqual(['no_executive']);
    expect(as('executive').structure.endAccess('p-kel')).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('gives access again with no roles, from today', () => {
    const { as, store } = fresh();
    as('admin').structure.endAccess('p-kel');
    expect(as('admin').structure.giveAccessAgain('p-kel')).toEqual({ ok: true });
    expect(store(SWU).memberships.find((x) => x.id === 'm-kel')).toMatchObject({ status: 'active', startsOn: NOW, endsOn: null, roles: [] });
    expect(as('admin').structure.accessByRole()!.ended).toEqual([]);
  });

  it('the handover offers End access when the holder holds no other position, never for oneself', () => {
    const { as } = fresh();
    const admin = as('admin').structure;
    expect(admin.handover('pos-hof')!.endAccess).toEqual({ personId: 'p-hof', name: 'Ruth Phiri' });
    expect(admin.handover('pos-hrm')!.endAccess).toBeNull();
    expect(as('executive').structure.handover('pos-hof')!.endAccess).toBeNull();
  });
});

describe('the ACCESS- checks (section 4)', () => {
  it('Sample Water Utility: Kelvin Mwila holds Finance with no position; only administrators see it', () => {
    const { as } = fresh();
    const admin = as('admin');
    const f = admin.findings().find((x) => x.finding.ruleId === RULES.accessRoleNoPosition.id)!;
    expect(f.finding.message).toBe('Kelvin Mwila holds Finance but no position, and their access has no end date.');
    expect(f.finding.blocksAt).toEqual([]);
    expect(f.fix).toEqual({ kind: 'access', personId: 'p-kel' });
    expect(ruleIds(admin)).toEqual([RULES.accessRoleNoPosition.id]);
    for (const role of ['executive', 'strategy', 'finance', 'employee'] as const) expect(ruleIds(as(role))).toEqual([]);
  });

  it('AR-7: the test organisations raise no access check (the shared Executive holds each top position)', () => {
    const { as } = fresh();
    for (const org of ['org-ngo', 'org-mfg', 'org-scale']) expect(ruleIds(as('admin', org))).toEqual([]);
  });

  it('ACCESS-ENDS-SOON is raised 14 days before the end date, not 15', () => {
    const { as } = fresh();
    expect(ruleIds(as('admin', SWU, '2026-11-15' as ISODate))).not.toContain(RULES.accessEndsSoon.id);
    const on16 = as('admin', SWU, '2026-11-16' as ISODate);
    expect(on16.findings().find((x) => x.finding.ruleId === RULES.accessEndsSoon.id)!.finding.message).toBe('Mutale Chola’s access ends on 30 November 2026.');
    expect(ruleIds(as('admin', SWU, '2026-12-01' as ISODate))).not.toContain(RULES.accessEndsSoon.id); // ended by then
  });

  it('ACCESS-NO-STAFF-ADMIN: when an appointment runs out; the Executive sees it too, and it cannot be marked as checked', () => {
    const { as, store } = fresh();
    store(SWU).assignments.find((a) => a.positionId === 'pos-hrm')!.to = '2026-10-31' as ISODate;
    const on = '2026-11-01' as ISODate;
    expect(ruleIds(as('admin', SWU, on))).toContain(RULES.accessNoStaffAdmin.id);
    const exec = as('executive', SWU, on);
    expect(ruleIds(exec)).toEqual([RULES.accessNoStaffAdmin.id]); // nothing that names a person
    const f = exec.findings().find((x) => x.finding.ruleId === RULES.accessNoStaffAdmin.id)!;
    expect(f.canAcknowledge).toBe(false);
    expect(exec.acknowledge(f.finding.key, 'Fine').ok).toBe(false);
    expect(ruleIds(as('strategy', SWU, on))).toEqual([]);
  });

  it('ACCESS-NO-EXECUTIVE and ACCESS-KEY-ROLE-ACTING-ONLY', () => {
    const { as, store } = fresh();
    store(SWU).assignments.find((a) => a.positionId === 'pos-md')!.kind = 'acting';
    const acting = as('admin').findings().find((x) => x.finding.ruleId === RULES.accessKeyRoleActingOnly.id)!;
    expect(acting.finding.message).toBe('Everyone holding Executive is acting in their position.');
    expect(acting.fix).toEqual({ kind: 'access', role: 'executive' });
    expect(acting.canAcknowledge).toBe(false);
    store(SWU).memberships.find((m) => m.id === 'm-md')!.roles = [];
    expect(ruleIds(as('admin'))).toContain(RULES.accessNoExecutive.id);
  });

  it('a person-level check is marked as checked by an administrator, and reopens when the membership changes', () => {
    const f2 = fresh();
    const { as } = f2;
    const later = () => createMemoryRepository(f2.orgs.map((o) => o.store), SWU, 'm-hrm', NOW, { clock: () => '2026-10-18T23:00:00+02:00' as never });
    const admin = as('admin');
    const key = admin.findings().find((x) => x.finding.ruleId === RULES.accessRoleNoPosition.id)!.finding.key;
    expect(admin.acknowledge(key, 'Kelvin is on secondment and keeps Finance until March.')).toMatchObject({ ok: true });
    expect(as('admin').findings().find((x) => x.finding.key === key)!.ack.state).toBe('acknowledged');
    // A change later the same day (the default sample clock is fixed, so this one runs an hour on).
    later().structure.savePerson('p-kel', { roles: ['finance', 'compliance'] });
    expect(as('admin').findings().find((x) => x.finding.key === key)!.ack.state).toBe('lapsed');
  });

  it('runs only once the structure is confirmed', () => {
    const { as } = fresh();
    expect(ruleIds(as('admin', NEW))).toEqual([]);
  });
});

describe('People and access by role (section 3.1)', () => {
  it('lists the seven roles in order, with holders, positions and held since; administrators only', () => {
    const { as } = fresh();
    const v = as('admin').structure.accessByRole()!;
    expect(v.roles.map((r) => r.role)).toEqual(ROLE_ORDER);
    const finance = v.roles.find((r) => r.role === 'finance')!;
    expect(finance.holders.map((h) => [h.name, h.positions.map((p) => p.title), h.since])).toEqual([
      ['Kelvin Mwila', [], '2026-03-02'], ['Ruth Phiri', ['Head of Finance'], '2024-01-01'],
    ]);
    expect(v.roles.find((r) => r.role === 'facilitator')!.holders).toEqual([{ personId: 'p-fac', name: 'Mutale Chola', positions: [], since: '2026-10-01', endsOn: '2026-11-30' }]);
    expect(v.ended).toEqual([]);
    expect(as('executive').structure.accessByRole()).toBeNull();
    expect(as('admin', SWU, '2027-01-04' as ISODate).structure.accessByRole()!.ended.map((e) => e.name)).toEqual(['Mutale Chola']);
  });

  it('held since: the latest entry that added the role, else the start date', () => {
    const at = (iso: string) => iso.slice(0, 10) as ISODate;
    const m = { id: 'm1' as never, startsOn: '2024-01-01' as ISODate };
    const e = (date: string, before: string[], after: string[]) => ({ id: date, orgId: 'o', at: `${date}T09:00:00Z`, actorMembershipId: 'm0', action: 'update', entity: { type: 'Membership', id: 'm1' }, before: { roles: before }, after: { roles: after } }) as never;
    expect(heldSince([], m, 'finance', at)).toBe('2024-01-01');
    expect(heldSince([e('2026-03-02', [], ['finance']), e('2026-05-01', ['finance'], ['finance', 'hr'])], m, 'finance', at)).toBe('2026-03-02');
    expect(heldSince([e('2026-03-02', [], ['finance']), e('2026-04-01', ['finance'], []), e('2026-06-01', [], ['finance'])], m, 'finance', at)).toBe('2026-06-01');
  });

  it('addresses: by role, one role, and one person', () => {
    expect(parseRoute('#/organisation/people/by-role')).toEqual({ kind: 'org', tab: 'people', byRole: true });
    expect(parseRoute('#/organisation/people/by-role/finance')).toEqual({ kind: 'org', tab: 'people', byRole: true, role: 'finance' });
    expect(parseRoute('#/organisation/people/person/p-kel')).toEqual({ kind: 'org', tab: 'people', person: 'p-kel' });
    expect(hrefFor({ kind: 'org', tab: 'people', byRole: true, role: 'executive' })).toBe('#/organisation/people/by-role/executive');
  });

  it('fix targets: a membership opens its person, an organisation-level check its role', () => {
    const { store } = fresh();
    const s = store(SWU);
    expect(fixTarget(s, { key: 'k', ruleId: RULES.accessRoleNoPosition.id, subject: { type: 'Membership', id: 'm-kel' }, message: '', blocksAt: [], routeToPositionIds: [] })).toEqual({ kind: 'access', personId: 'p-kel' });
    expect(fixTarget(s, { key: 'k', ruleId: RULES.accessNoExecutive.id, subject: { type: 'Organisation', id: SWU }, message: '', blocksAt: [], routeToPositionIds: [] })).toEqual({ kind: 'access', role: 'executive' });
  });
});

describe('AR-8: confirmation writes a Membership audit entry per person with roles', () => {
  it('so the access history starts on the day the structure is confirmed', () => {
    const { as, store } = fresh();
    const admin = as('admin', NEW).structure;
    admin.importSheet(withHeader(SAMPLE_TEMPLATE_ROWS));
    const page = admin.page();
    const st = page.structure;
    const lweendo = page.rowProblems.find((r) => r.kind === 'reports_unmatched')!;
    const southSup = st.positions.find((p) => p.title === 'Regional Supervisor' && st.units.find((u) => u.id === p.unitId)!.name === 'South')!;
    admin.fixRowReports(lweendo.positionId, southSup.id);
    admin.dropVacantRoles(page.rowProblems.find((r) => r.kind === 'roles_on_vacant')!.positionId);
    admin.savePerson(st.people.find((p) => p.fullName === 'Brian Mumba')!.id, { email: 'b.mumba@sample-new.example' });
    for (const k of admin.page().checks.worth.map((g) => g.kind)) admin.markChecked(k as WorthKind, 'Checked in the prototype round');
    expect(admin.confirm()).toEqual({ ok: true });
    const s = store(NEW);
    const withRoles = s.memberships.filter((m) => m.status === 'active' && m.roles.length > 0);
    const entries = s.auditEntries.filter((e) => e.entity.type === 'Membership');
    expect(new Set(entries.map((e) => e.entity.id))).toEqual(new Set(withRoles.map((m) => m.id)));
    const v = as('admin', NEW).structure.accessByRole()!;
    expect(v.roles.find((r) => r.role === 'executive')!.holders.every((h) => h.since === NOW)).toBe(true);
  });
});
