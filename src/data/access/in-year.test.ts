/** In-year cascade changes (v0.27.0; In-Year Cascade Changes Specification v0.1, IC-1 to IC-8). */
import type { ISODate, Membership, Person } from '../../contract/caspa-data-contract';
import { computeFindings } from '../../rules/integrity';
import { ALL_DEV_ROLES, createSampleOrgs, type SampleOrg } from '../sample/all';
import { devMembership } from '../sample/review';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const FY = 2026;

function setup() {
  const orgs = createSampleOrgs();
  const stores = orgs.map((o) => o.store);
  const org = orgs[0]!;
  const s = org.store;
  // A consultant invited as a facilitator, with an end date (B4). No sample organisation has one.
  s.people.push({ id: 'p-fac', fullName: 'Grace Mutale', email: null } as Person);
  s.memberships.push({ ...s.memberships[0]!, id: 'm-fac', personId: 'p-fac', roles: ['facilitator'], startsOn: '2026-09-01', endsOn: '2027-03-31', status: 'active' } as Membership);
  const as = (m: string) => createMemoryRepository(stores, org.orgId, m, NOW);
  return { orgs, stores, org, s, as };
}
const A = 'a1.2.1.3'; // Replace faulty customer meters: 1,800 meters, owned by the Commercial Manager, under O1.2 (Head of Operations)

describe('who may make which change (section 5)', () => {
  const cases: [string, string, string[]][] = [
    ['Strategy office', 'm-spm', ['details', 'target', 'owner', 'level', 'complete', 'stop']],
    ['objective owner', 'm-hoo', ['details', 'target', 'owner', 'level', 'complete', 'stop']],
    ['facilitator', 'm-fac', ['details', 'target', 'owner', 'level', 'complete', 'stop']],
    ['activity owner (IC-2)', 'm-cm', ['details', 'level', 'complete']],
  ];
  it.each(cases)('%s on an activity', (_n, m, choices) => {
    expect(setup().as(m).inYear.form('activity', A)?.choices).toEqual(choices);
  });
  it.each([['meter reader', 'm-mrb'], ['Executive', 'm-md'], ['Finance', 'm-hof'], ['supervisor', 'm-co']])('the %s may make no change on it', (_n, m) => {
    expect(setup().as(m).inYear.form('activity', A)).toBeNull();
  });
  it('KPI owners: the Strategy office or the objective owner (IC-3), never a facilitator or the KPI owner', () => {
    const { as, s } = setup();
    expect(as('m-spm').inYear.form('kpi', 'k1.1.1')?.choices).toEqual(['owner']);
    expect(as('m-fac').inYear.form('kpi', 'k1.1.1')).toBeNull();
    // K1.2.1 sits under O1.2, owned by the Head of Operations, who also owns the KPI.
    expect(s.kpis.find((k) => k.id === 'k1.2.1')!.ownerPositionId).toBe('pos-hoo');
    expect(as('m-hoo').inYear.form('kpi', 'k1.2.1')?.choices).toEqual(['owner']);
    expect(as('m-cm').inYear.form('kpi', 'k1.2.1')).toBeNull();
  });
  it('goal and objective owners: the Strategy office only (IC-4)', () => {
    const { as } = setup();
    expect(as('m-spm').inYear.form('objective', 'o1.1')?.choices).toEqual(['owner']);
    expect(as('m-spm').inYear.form('goal', 'g1')?.choices).toEqual(['owner']);
    for (const m of ['m-fac', 'm-hoo', 'm-md']) {
      expect(as(m).inYear.form('objective', 'o1.2')).toBeNull();
      expect(as(m).inYear.form('goal', 'g1')).toBeNull();
    }
  });
  it('a record outside the active plan offers nothing', () => {
    const { as, s } = setup();
    const draftGoal = s.goals.find((g) => s.plans.find((p) => p.id === g.planId)?.status !== 'active');
    if (draftGoal) expect(as('m-spm').inYear.form('goal', draftGoal.id)).toBeNull();
  });
});

describe('making changes', () => {
  it('refuses an activity owner changing their own target or owner, or stopping it (IC-2)', () => {
    const r = setup().as('m-cm').inYear;
    expect(r.make('activity', A, { change: 'target', value: 1000 }, 'Fewer meters')).toEqual({ ok: false, error: 'not_allowed' });
    expect(r.make('activity', A, { change: 'owner', positionId: 'pos-co' }, 'Hand over')).toEqual({ ok: false, error: 'not_allowed' });
    expect(r.make('activity', A, { change: 'stop' }, 'No longer needed')).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('needs a reason, and writes one audit entry with before, after and the reason', () => {
    const { as, s } = setup();
    const r = as('m-spm').inYear;
    expect(r.make('activity', A, { change: 'owner', positionId: 'pos-co' }, '  ')).toEqual({ ok: false, error: 'reason_required' });
    const n = s.auditEntries.length;
    expect(r.make('activity', A, { change: 'owner', positionId: 'pos-co' }, 'Officer leads the field work')).toEqual({ ok: true });
    expect(s.auditEntries.length).toBe(n + 1);
    const e = s.auditEntries[s.auditEntries.length - 1]!;
    expect(e).toMatchObject({ action: 'update', entity: { type: 'Activity', id: A }, before: { ownerPositionId: 'pos-cm' }, after: { ownerPositionId: 'pos-co', reason: 'Officer leads the field work' } });
    expect(s.activities.find((a) => a.id === A)!.ownerPositionId).toBe('pos-co');
  });
  it('lists every change in Changes this year, newest first, for anyone who may view the record (IC-8)', () => {
    const { as } = setup();
    const r = as('m-spm');
    r.inYear.make('activity', A, { change: 'details', title: 'Replace faulty meters', evidence: 'Job cards', frequency: 'monthly' }, 'Clearer wording');
    r.changeActivityLevel(A, 'people', 'Skills, not equipment');
    const seen = as('m-mrb').inYear.changes('activity', A);
    expect(seen.map((c) => c.field)).toEqual(['level', 'title', 'evidence']);
    expect(seen[0]).toMatchObject({ from: 'Process', to: 'People', reason: 'Skills, not equipment', by: 'Bwalya Musonda, Strategy and Planning Manager', on: NOW });
    expect(seen[1]).toMatchObject({ from: 'Replace faulty customer meters', to: 'Replace faulty meters' });
  });
  it('marking complete needs a reason only below the target (IC-5), and can be reopened', () => {
    const { as, s } = setup();
    const r = as('m-cm').inYear;
    expect(r.effects('activity', A, { change: 'complete' }).reasonNeeded).toBe(true); // 620 of 1,800 recorded
    expect(r.make('activity', A, { change: 'complete' }, '')).toEqual({ ok: false, error: 'reason_required' });
    expect(r.make('activity', A, { change: 'complete' }, 'The rest moved to next year')).toEqual({ ok: true });
    expect(s.activities.find((a) => a.id === A)!.status).toBe('complete');
    expect(as('m-cm').inYear.form('activity', A)?.choices).toContain('reopen');
    expect(as('m-cm').inYear.make('activity', A, { change: 'reopen' }, 'Not finished after all')).toEqual({ ok: true });
    // An activity without a quantity target is marked complete without a reason.
    expect(as('m-spm').inYear.effects('activity', 'a1.2.1.1', { change: 'complete' }).reasonNeeded).toBe(false);
  });
  it('stopping: only the Strategy office restarts it (IC-6)', () => {
    const { as, s } = setup();
    expect(as('m-hoo').inYear.make('activity', A, { change: 'stop' }, 'Contractor delivers next year')).toEqual({ ok: true });
    expect(s.activities.find((a) => a.id === A)!.status).toBe('archived');
    expect(as('m-hoo').inYear.form('activity', A)).toBeNull();
    expect(as('m-hoo').changeActivityLevel(A, 'people', 'x')).toEqual({ ok: false, error: 'archived' });
    expect(as('m-spm').inYear.form('activity', A)?.choices).toEqual(['restart']);
    expect(as('m-spm').inYear.make('activity', A, { change: 'restart' }, 'Contractor found')).toEqual({ ok: true });
    expect(s.activities.find((a) => a.id === A)!.status).toBe('in_progress');
  });
  it('changes a goal, objective or KPI owner with a reason', () => {
    const { as, s } = setup();
    const r = as('m-spm').inYear;
    expect(r.make('kpi', 'k1.1.1', { change: 'owner', positionId: 'pos-hoo' }, 'Operations runs the collection drive')).toEqual({ ok: true });
    expect(s.kpis.find((k) => k.id === 'k1.1.1')!.ownerPositionId).toBe('pos-hoo');
    expect(r.make('objective', 'o1.1', { change: 'owner', positionId: 'pos-hof' }, 'Head of Commercial is vacant')).toEqual({ ok: true });
    expect(as('m-mrb').inYear.changes('objective', 'o1.1')[0]).toMatchObject({ field: 'owner', from: 'Head of Commercial', to: 'Head of Finance' });
  });
});

describe('effects and checks (section 7)', () => {
  const keys = (s: SampleOrg['store']) => computeFindings(s, { financialYear: FY }).map((f) => f.ruleId);
  it('assigning a KPI owner clears "No owner yet"', () => {
    const { as, s } = setup();
    expect(keys(s)).toContain('STRUCT-KPI-NO-OWNER');
    as('m-spm').inYear.make('kpi', 'k1.1.1', { change: 'owner', positionId: 'pos-hoo' }, 'Assigned');
    expect(keys(s)).not.toContain('STRUCT-KPI-NO-OWNER');
  });
  it('a title change flags the signed commitment drawn from it; an owner change does not', () => {
    const { as, s } = setup();
    const r = as('m-spm').inYear;
    expect(r.effects('activity', A, { change: 'owner', positionId: 'pos-co' }).lines[0]).toMatchObject({ kind: 'commitments_stay' });
    r.make('activity', A, { change: 'owner', positionId: 'pos-co' }, 'Move');
    expect(keys(s)).not.toContain('STRUCT-CONTRACT-UPSTREAM-CHANGED');
    const eff = r.effects('activity', A, { change: 'details', title: 'Replace meters', evidence: s.activities.find((a) => a.id === A)!.evidence, frequency: 'monthly' });
    expect(eff.lines[0]).toMatchObject({ kind: 'commitments_flagged', others: 1 }); // the Strategy office cannot see the contract
    r.make('activity', A, { change: 'details', title: 'Replace meters', evidence: s.activities.find((a) => a.id === A)!.evidence, frequency: 'monthly' }, 'Shorter');
    expect(keys(s)).toContain('STRUCT-CONTRACT-UPSTREAM-CHANGED');
  });
  it('the contract holder’s supervisor sees the commitment named in the effects', () => {
    const { as, s } = setup();
    s.activities.find((a) => a.id === A)!.ownerPositionId = 'pos-co' as never; // the supervisor as the activity owner, to open the panel
    const line = as('m-co').inYear.effects('activity', A, { change: 'stop' }).lines[0];
    expect(line).toMatchObject({ kind: 'commitments_flagged', named: [{ person: 'Mary Chileshe', title: 'Replace 400 faulty meters on route' }], others: 0 });
  });
  it('a target below what signed contracts carry is flagged to the objective owner, and clears when raised (IC-7)', () => {
    const { as, s } = setup();
    const r = as('m-spm').inYear;
    const eff = r.effects('activity', A, { change: 'target', value: 300 });
    expect(eff.lines.map((l) => l.kind)).toEqual(['signed_carry', 'commitments_flagged', 'below_signed']);
    r.make('activity', A, { change: 'target', value: 300 }, 'Fewer faulty meters');
    const f = computeFindings(s, { financialYear: FY }).find((x) => x.ruleId === 'STRUCT-ACTIVITY-TARGET-BELOW-SIGNED');
    expect(f).toMatchObject({ subject: { type: 'Activity', id: A }, blocksAt: [], routeToPositionIds: ['pos-hoo'] });
    r.make('activity', A, { change: 'target', value: 500 }, 'Recount');
    expect(keys(s)).not.toContain('STRUCT-ACTIVITY-TARGET-BELOW-SIGNED');
  });
  it('stopping flags each commitment and budget line; restarting clears them; none blocks a gate (IC-6)', () => {
    const { as, s } = setup();
    const r = as('m-spm').inYear;
    const eff = r.effects('activity', A, { change: 'stop' });
    expect(eff.lines.map((l) => l.kind)).toEqual(['commitments_flagged', 'budget_lines_flagged', 'leaves_counts']);
    r.make('activity', A, { change: 'stop' }, 'Next year');
    const fs = computeFindings(s, { financialYear: FY });
    const c = fs.filter((f) => f.ruleId === 'STRUCT-COMMITMENT-ACTIVITY-STOPPED');
    const b = fs.filter((f) => f.ruleId === 'STRUCT-BUDGETLINE-ACTIVITY-STOPPED');
    expect(c).toHaveLength(1);
    expect(c[0]!.routeToPositionIds).toEqual(['pos-mrb', 'pos-co']);
    expect(b).toHaveLength(2);
    expect(b[0]!.routeToPositionIds).toContain('pos-hof');
    expect([...c, ...b].every((f) => f.blocksAt.length === 0)).toBe(true);
    r.make('activity', A, { change: 'restart' }, 'Back on');
    expect(keys(s).filter((k) => k.includes('STOPPED'))).toEqual([]);
  });
  it('the sample organisations raise none of the three new checks before any change', () => {
    for (const o of createSampleOrgs()) {
      const fy = Math.max(...o.store.activities.map((a) => a.financialYear));
      for (const y of [fy - 1, fy]) {
        const ids = computeFindings(o.store, { financialYear: y }).map((f) => f.ruleId);
        expect(ids.filter((x) => /TARGET-BELOW-SIGNED|ACTIVITY-STOPPED/.test(x)), o.store.organisation.name).toEqual([]);
      }
    }
  });
});

describe('every sample organisation and dev role', () => {
  it('offers changes only within section 5, and never throws', () => {
    for (const o of createSampleOrgs()) {
      const stores = [o.store];
      for (const role of ALL_DEV_ROLES) {
        const m = devMembership(o, role, NOW);
        if (!m) continue;
        const repo = createMemoryRepository(stores, o.orgId, m, NOW);
        const v = repo.viewer;
        for (const a of o.store.activities.slice(0, 40)) {
          const f = repo.inYear.form('activity', a.id);
          if (!f) continue;
          expect(f.choices.length).toBeGreaterThan(0);
          if (f.choices.includes('restart')) expect(v.roles).toContain('strategy_office');
          if (f.choices.includes('stop') || f.choices.includes('owner')) {
            const ownsObjective = o.store.objectives.some((x) => x.ownerPositionId && v.positionIds.includes(x.ownerPositionId as never));
            expect(v.roles.includes('strategy_office') || v.roles.includes('facilitator') || ownsObjective).toBe(true);
          }
        }
        for (const g of o.store.goals) {
          const f = repo.inYear.form('goal', g.id);
          if (f) expect(v.roles).toContain('strategy_office');
        }
      }
    }
  });
});
