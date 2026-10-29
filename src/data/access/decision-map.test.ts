/** The decision map end to end through the data-access layer (BUILD-BRIEF section 22, D6-1 to D6-6). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { createSampleOrgs, DEV_ROLES } from '../sample/all';
import { createMemoryRepository, sampleClock } from './repository';

const NOW = '2026-10-18' as ISODate;
const DEF5_KEY = 'STRUCT-DEFICIENCY-UNADDRESSED:Deficiency:def-5';
const setup = () => {
  const orgs = createSampleOrgs();
  const stores = orgs.map((o) => o.store);
  const util = orgs[0]!;
  const clock = sampleClock(NOW);
  const as = (role: keyof typeof util.devRoles) => createMemoryRepository(stores, util.orgId, util.devRoles[role], NOW, { clock });
  const asMember = (membershipId: string) => createMemoryRepository(stores, util.orgId, membershipId, NOW, { clock });
  return { s: util.store, as, asMember, orgs, stores };
};
const draft = (s: ReturnType<typeof setup>['s'], over: Partial<Parameters<ReturnType<ReturnType<typeof setup>['as']>['addCorrectiveActivity']>[1]> = {}) => ({
  kpiId: 'k1.2.1', title: 'Train meter readers to spot tampering', level: 'people' as const,
  ownerPositionId: s.positions.find((p) => p.title === 'Commercial Manager')!.id, evidence: 'Attendance registers',
  frequency: 'monthly' as const, quantity: null, ...over,
});

describe('who sees the map', () => {
  it('shows it in full to the Executive and the Strategy office', () => {
    const { as } = setup();
    for (const role of ['executive', 'strategy'] as const) {
      const p = as(role).decisionMap('o1.2')!;
      expect(p.map.visible).toBe(true);
      expect(p.map.total).toBe(5);
    }
  });
  it.each(['finance', 'hr', 'supervisor', 'employee'] as const)('gives %s the count only, with no row text', (role) => {
    const { as } = setup();
    const p = as(role).decisionMap('o1.2')!;
    expect(p.map.visible).toBe(false);
    expect(p.map.total).toBe(5);
    expect(JSON.stringify(p)).not.toMatch(/tampering|Meters kept in service|2 years/);
    expect(p.can).toEqual({ link: false, add: false });
  });
  it('shows the objective owner their own map, with the fix', () => {
    const { asMember } = setup();
    const p = asMember('m-hoo').decisionMap('o1.2')!;
    expect(p.map.visible).toBe(true);
    expect(p.can).toEqual({ link: true, add: true });
    expect(p.checks['def-5']?.routedToMe).toBe(true);
  });
  it('lets the Executive see but not change corrective work', () => {
    const { as } = setup();
    expect(as('executive').decisionMap('o1.2')!.can).toEqual({ link: false, add: false });
    expect(as('executive').correctiveForm('def-5')).toBeNull();
    expect(as('strategy').decisionMap('o1.2')!.can).toEqual({ link: true, add: true });
  });
});

describe('fixing "No corrective activity yet" (D6-1)', () => {
  it('links an existing activity: the check clears, the row is stamped and audited', () => {
    const { s, as } = setup();
    const repo = as('strategy');
    expect(repo.findings().some((f) => f.finding.key === DEF5_KEY)).toBe(true);
    const audits = s.auditEntries.length;
    expect(repo.linkCorrective('def-5', 'a1.2.1.1')).toEqual({ ok: true });
    expect(as('strategy').findings().some((f) => f.finding.key === DEF5_KEY)).toBe(false);
    const df = s.deficiencies.find((d) => d.id === 'def-5')!;
    expect(df.correctiveActivityIds).toEqual(['a1.2.1.1']);
    expect(df.updated.byMembershipId).toBe('m-spm');
    expect(s.auditEntries).toHaveLength(audits + 1);
    expect(s.auditEntries[s.auditEntries.length - 1]).toMatchObject({ action: 'update', entity: { type: 'Deficiency', id: 'def-5' }, before: { correctiveActivityIds: [] }, after: { correctiveActivityIds: ['a1.2.1.1'] } });
  });
  it('removes a link: the check comes back and the activity stays', () => {
    const { s, as } = setup();
    const repo = as('strategy');
    repo.linkCorrective('def-5', 'a1.2.1.1');
    expect(repo.unlinkCorrective('def-5', 'a1.2.1.1')).toEqual({ ok: true });
    expect(as('strategy').findings().some((f) => f.finding.key === DEF5_KEY)).toBe(true);
    expect(s.activities.some((a) => a.id === 'a1.2.1.1')).toBe(true);
    expect(repo.unlinkCorrective('def-5', 'a1.2.1.1')).toEqual({ ok: false, error: 'not_linked' });
  });
  it('adds a new activity under the objective’s KPI at the chosen level, linked and audited', () => {
    const { s, as } = setup();
    const audits = s.auditEntries.length;
    const r = as('strategy').addCorrectiveActivity('def-5', draft(s));
    expect(r).toMatchObject({ ok: true, code: 'A1.2.1.5' });
    const a = s.activities.find((x) => x.code === 'A1.2.1.5')!;
    expect([a.kpiId, a.decisionLevel, a.status, a.draft.state, a.financialYear]).toEqual(['k1.2.1', 'people', 'planned', 'human', 2026]);
    expect(s.deficiencies.find((d) => d.id === 'def-5')!.correctiveActivityIds).toEqual([a.id]);
    expect(s.auditEntries.slice(audits).map((e) => [e.action, e.entity.type])).toEqual([['create', 'Activity'], ['update', 'Deficiency']]);
    expect(as('strategy').findings().some((f) => f.finding.key === DEF5_KEY)).toBe(false);
    expect(as('strategy').decisionMap('o1.2')!.map.corrective).toBe(5);
  });
  it('lets the solution sit at another level than the problem', () => {
    const { s, as } = setup();
    as('strategy').addCorrectiveActivity('def-5', draft(s, { level: 'procedures' }));
    const row = as('strategy').decisionMap('o1.2')!.map.groups.find((g) => g.level === 'people')!.rows[0]!;
    expect(row.corrective[0]!.solvedAt).toBe('procedures');
  });
  it('checks the new activity in the data-access layer', () => {
    const { s, as } = setup();
    expect(as('strategy').addCorrectiveActivity('def-5', draft(s, { title: '' }))).toEqual({ ok: false, error: 'title_required' });
    expect(as('strategy').addCorrectiveActivity('def-5', draft(s, { kpiId: 'k1.1.1' }))).toEqual({ ok: false, error: 'kpi_not_allowed' });
    expect(s.activities.some((a) => a.code === 'A1.2.1.5')).toBe(false);
  });
  it.each(['executive', 'finance', 'hr', 'supervisor', 'employee'] as const)('refuses %s every write, whatever the screen shows', (role) => {
    const { s, as } = setup();
    const repo = as(role);
    const want = role === 'executive' ? 'not_allowed' : 'not_found';
    expect(repo.linkCorrective('def-5', 'a1.2.1.1')).toEqual({ ok: false, error: want });
    expect(repo.unlinkCorrective('def-1', 'a1.2.1.3')).toEqual({ ok: false, error: want });
    expect(repo.addCorrectiveActivity('def-5', draft(s))).toEqual({ ok: false, error: want });
    expect(s.deficiencies.find((d) => d.id === 'def-5')!.correctiveActivityIds).toEqual([]);
  });
  it('refuses a link to an activity of another objective', () => {
    const { as } = setup();
    expect(as('strategy').linkCorrective('def-5', 'a1.1.1.1')).toEqual({ ok: false, error: 'activity_not_found' });
  });
});

describe('changing an activity’s 6P level (D6-6)', () => {
  it('changes it with a reason kept in the audit entry, and lists it on the activity page', () => {
    const { s, as } = setup();
    const repo = as('strategy');
    expect(repo.activityLevel('a1.2.1.3')).toMatchObject({ canChange: true, commitments: 1, history: [] });
    expect(repo.changeActivityLevel('a1.2.1.3', 'people', ' Skills, not equipment ')).toEqual({ ok: true });
    expect(s.activities.find((a) => a.id === 'a1.2.1.3')!.decisionLevel).toBe('people');
    expect(s.auditEntries[s.auditEntries.length - 1]).toMatchObject({ action: 'update', entity: { type: 'Activity', id: 'a1.2.1.3' }, before: { decisionLevel: 'process' }, after: { decisionLevel: 'people', reason: 'Skills, not equipment' } });
    expect(as('strategy').activityLevel('a1.2.1.3')!.history).toEqual([
      { from: 'process', to: 'people', reason: 'Skills, not equipment', by: 'Strategy and Planning Manager', on: '2026-10-18' },
    ]);
  });
  it('asks the signed commitment from it to review the change, and only that one', () => {
    const { as } = setup();
    const before = as('supervisor').findings().filter((f) => f.finding.ruleId === 'STRUCT-CONTRACT-UPSTREAM-CHANGED').length;
    as('strategy').changeActivityLevel('a1.2.1.3', 'people', 'reason');
    const after = as('supervisor').findings().filter((f) => f.finding.ruleId === 'STRUCT-CONTRACT-UPSTREAM-CHANGED');
    expect(after).toHaveLength(before + 1);
    expect(after[after.length - 1]!.routedToMe).toBe(true);
    // A1.2.1.1 has no signed commitment: changing it raises nothing new.
    as('strategy').changeActivityLevel('a1.2.1.1', 'procedures', 'reason');
    expect(as('supervisor').findings().filter((f) => f.finding.ruleId === 'STRUCT-CONTRACT-UPSTREAM-CHANGED')).toHaveLength(before + 1);
  });
  it('refuses the same level, a missing reason, and anyone without Activity draft', () => {
    const { s, as } = setup();
    expect(as('strategy').changeActivityLevel('a1.2.1.3', 'process', 'reason')).toEqual({ ok: false, error: 'same_level' });
    expect(as('strategy').changeActivityLevel('a1.2.1.3', 'people', ' ')).toEqual({ ok: false, error: 'reason_required' });
    for (const role of ['executive', 'finance', 'hr', 'supervisor', 'employee'] as const) {
      expect(as(role).changeActivityLevel('a1.2.1.3', 'people', 'reason'), role).toEqual({ ok: false, error: 'not_allowed' });
      expect(as(role).activityLevel('a1.2.1.3')!.canChange, role).toBe(false);
    }
    expect(s.activities.find((a) => a.id === 'a1.2.1.3')!.decisionLevel).toBe('process');
  });
  it('lets the activity’s owner change their own activity', () => {
    const { asMember } = setup();
    expect(asMember('m-cm').changeActivityLevel('a1.2.1.3', 'people', 'reason')).toEqual({ ok: true });
  });
  it('shows "Corrects:" only to those who may see deficiencies', () => {
    const { as } = setup();
    expect(as('strategy').activityLevel('a1.2.1.3')!.corrects).toEqual([{ id: 'def-1', objectiveId: 'o1.2', description: 'Faulty and aged customer meters', level: 'process' }]);
    expect(as('finance').activityLevel('a1.2.1.3')!.corrects).toBeNull();
  });
});

describe('every organisation, every role', () => {
  const { orgs, stores } = setup();
  describe.each(orgs.map((o) => [o.store.organisation.name, o] as const))('%s', (_n, org) => {
    it.each(DEV_ROLES)('the %s role reaches every map row its checks point to', (role) => {
      const repo = createMemoryRepository(stores, org.orgId, org.devRoles[role], NOW);
      for (const v of repo.findings()) {
        if (v.fix?.kind !== 'map') continue;
        const p = repo.decisionMap(v.fix.objectiveId)!;
        expect(p.map.visible, v.finding.key).toBe(true);
        expect(p.map.groups.flatMap((g) => g.rows).some((r) => r.id === (v.fix as { deficiencyId: string }).deficiencyId), v.finding.key).toBe(true);
      }
    });
    it.each(DEV_ROLES)('the %s role sees every map in full or as a count, never in between', (role) => {
      const repo = createMemoryRepository(stores, org.orgId, org.devRoles[role], NOW);
      for (const o of org.store.objectives) {
        const p = repo.decisionMap(o.id)!;
        expect(p.map.total).toBe(org.store.deficiencies.filter((d) => d.objectiveId === o.id).length);
        if (!p.map.visible) expect(p.map.groups).toEqual([]);
        const tree = repo.cascadeView().maps[o.id];
        expect(tree ?? 0).toBe(p.map.visible ? p.map.total : 0);
      }
    });
  });
  it('the scale organisation’s department head owns O2.1 and may fix its map', () => {
    const scale = orgs.find((o) => o.store.organisation.name === 'Sample Scale Test Organisation')!;
    const repo = createMemoryRepository(stores, scale.orgId, scale.devRoles.supervisor, NOW);
    const o = scale.store.objectives.find((x) => x.code === 'O2.1')!;
    expect(repo.decisionMap(o.id)!.can).toEqual({ link: true, add: true });
  });
});
