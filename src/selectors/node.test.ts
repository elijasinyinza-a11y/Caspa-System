import type { ISODate } from '../contract/caspa-data-contract';
import { createMemoryRepository } from '../data/access/repository';
import { createSeed, DEV_ROLE_MEMBERSHIPS, ORG } from '../data/sample/seed';
import { formatMoney, formatPercent } from './format';

const NOW = '2026-10-18' as ISODate;
const as = (role: keyof typeof DEV_ROLE_MEMBERSHIPS) => createMemoryRepository([createSeed()], ORG, DEV_ROLE_MEMBERSHIPS[role], NOW);
const A = 'a1.2.1.3';

describe('cascade-node page for A1.2.1.3 Replace faulty customer meters', () => {
  it('traces the lineage goal › objective › KPI › activity, with the organisation’s labels', () => {
    const n = as('employee').node('activity', A)!;
    expect(n.lineage.map((r) => r.code)).toEqual(['G1', 'O1.2', 'K1.2.1', 'A1.2.1.3']);
    expect(n.lineage.map((r) => r.label)).toEqual(['Goal', 'Objective', 'KPI', 'Activity']);
  });

  it('Strategy: the Executive reads the why; roles that may not read 4Q entries see how many are recorded', () => {
    const exec = as('executive').node('activity', A)!.strategy;
    expect(exec.perspective).toBe('Financial');
    expect(exec.reasons).toEqual({
      visible: true,
      entries: [{ on: 'goal', cell: { band: 'retraction', column: 'failures' }, text: 'Billed revenue has not covered operating and maintenance costs.' }],
    });
    expect(as('supervisor').node('activity', A)!.strategy.reasons).toEqual({ visible: false, count: 1 });
    expect(as('employee').node('activity', A)!.strategy.reasons).toEqual({ visible: false, count: 1 });
  });

  it('Cascade: one 6P level with its scope, owner, evidence, and completion kept apart from KPI progress', () => {
    const c = as('employee').node('activity', A)!.cascade;
    if (c.kind !== 'activity') throw new Error('expected activity');
    expect(c.level).toBe('process');
    expect(c.scope).toBe('Technology, infrastructure');
    expect(c.evidence).toBe('Meter replacement job cards matched to the customer register');
    expect(c.completion).toMatchObject({ target: 1800, unit: 'meters', done: 620, asOf: '2026-06-30' });
    expect(formatPercent(c.completion!.share!)).toBe('34%');
    expect(formatPercent(c.kpi.progress.progress!)).toBe('42%'); // the KPI's own progress, not 620 ÷ 1,800
    expect(as('employee').node('activity', A)!.owner).toEqual({ position: 'Commercial Manager', person: 'Peter Mwansa', acting: false });
  });

  it('Plan: amounts and total for Finance, the Executive and budget holders; “funded” for everyone else', () => {
    for (const role of ['executive', 'finance'] as const) {
      const p = as(role).node('activity', A)!.plan;
      expect(p.lines.map((l) => l.description)).toEqual(['Customer meters', 'Meter installation']);
      expect(formatMoney(p.total!)).toBe('ZMW 1,500,000');
    }
    for (const role of ['supervisor', 'employee'] as const) {
      const p = as(role).node('activity', A)!.plan;
      expect(p.lines).toEqual([]);
      expect(p.total).toBeNull();
      expect(p.hiddenLines).toBe(2);
      expect(p.activityFunding).toEqual([{ ref: expect.objectContaining({ code: 'A1.2.1.3' }), funded: true }]);
    }
  });

  it('Performance: the employee and supervisor see the contract objective; others see coverage only; never ratings', () => {
    for (const role of ['employee', 'supervisor'] as const) {
      const p = as(role).node('activity', A)!.performance;
      expect(p.objectives).toEqual([
        expect.objectContaining({ person: 'Mary Chileshe', position: 'Meter Reader, Zone B', title: 'Replace 400 faulty meters on route', target: { value: 400, unit: 'meters' }, done: 140, contractStatus: 'signed' }),
      ]);
      expect(p.hidden.count).toBe(0);
    }
    for (const role of ['executive', 'finance'] as const) {
      const p = as(role).node('activity', A)!.performance;
      expect(p.objectives).toEqual([]);
      expect(p.hidden).toEqual({ count: 1, assigned: [{ value: 400, unit: 'meters' }] });
    }
    expect(JSON.stringify(as('supervisor').node('activity', A))).not.toMatch(/rating|score/i);
  });
});

describe('cascade-node pages above the activity', () => {
  it('K1.2.1 shows 42%, and “Behind” on 18 October 2026', () => {
    const c = as('executive').node('kpi', 'k1.2.1')!.cascade;
    if (c.kind !== 'kpi') throw new Error('expected kpi');
    expect(formatPercent(c.progress.progress!)).toBe('42%');
    expect(c.progress.status).toBe('behind');
    expect(c.children.map((a) => a.ref.code)).toEqual(['A1.2.1.1', 'A1.2.1.2', 'A1.2.1.3', 'A1.2.1.4']);
    expect(c.children.filter((a) => a.funded).map((a) => a.ref.code)).toEqual(['A1.2.1.3']);
  });

  it('O1.1 rolls up from a KPI with no reading as “No data”, never 0%', () => {
    const c = as('executive').node('objective', 'o1.1')!.cascade;
    if (c.kind !== 'objective') throw new Error('expected objective');
    expect(c.progress.progress).toBeNull();
    expect(c.progress.status).toBe('no_data');
  });

  it('G1 sums only the lines under it and lists its objectives', () => {
    const n = as('executive').node('goal', 'g1')!;
    expect(formatMoney(n.plan.total!)).toBe('ZMW 1,500,000'); // the orphan line belongs to no goal
    expect(n.plan).toMatchObject({ activities: 5, funded: 1 });
    if (n.cascade.kind !== 'goal') throw new Error('expected goal');
    expect(n.cascade.children.map((o) => o.ref.code)).toEqual(['O1.1', 'O1.2']);
  });

  it('G1 groups its budget lines by objective, and the subtotals sum to the total (section 18)', () => {
    const g = as('executive').node('goal', 'g1')!.plan.groups!;
    expect(g.map((x) => [x.ref.code, x.activities, x.funded, x.lines.length, x.subtotal && formatMoney(x.subtotal)])).toEqual([
      ['O1.1', 1, 0, 0, null],
      ['O1.2', 4, 1, 2, 'ZMW 1,500,000'],
    ]);
    // Those without access see funding status per group, never amounts.
    const e = as('employee').node('goal', 'g1')!.plan.groups!;
    expect(e.map((x) => [x.ref.code, x.funded, x.lines.length, x.hiddenLines, x.subtotal])).toEqual([
      ['O1.1', 0, 0, 0, null],
      ['O1.2', 1, 0, 2, null],
    ]);
  });

  it('O1.2 groups by KPI; KPI and activity pages list lines without groups', () => {
    const o = as('finance').node('objective', 'o1.2')!.plan.groups!;
    expect(o.map((x) => [x.ref.code, x.subtotal && formatMoney(x.subtotal)])).toEqual([['K1.2.1', 'ZMW 1,500,000']]);
    expect(as('finance').node('kpi', 'k1.2.1')!.plan.groups).toBeNull();
    expect(as('finance').node('activity', A)!.plan.groups).toBeNull();
  });

  it('G3 carries its own findings: no funded activity and no recorded why', () => {
    const n = as('executive').node('goal', 'g3')!;
    expect(n.plan).toMatchObject({ activities: 1, funded: 0, total: null });
    expect(n.findings.map((f) => f.ruleId).sort()).toEqual(['BOOK-GOAL-NO-WHY', 'STRUCT-GOAL-NO-FUNDED-ACTIVITY']);
  });

  it('returns nothing for a record that does not exist in this organisation', () => {
    expect(as('executive').node('activity', 'a9.9.9.9')).toBeNull();
    expect(as('executive').node('goal', 'a1.2.1.3')).toBeNull();
  });
});

describe('cascade tree', () => {
  it('holds every FY2026 record of the active plan, goal to activity', () => {
    const t = as('executive').cascadeTree();
    expect(t.counts).toEqual({ goal: 4, objective: 5, kpi: 5, activity: 8 });
    expect(t.goals.map((g) => g.ref.code)).toEqual(['G1', 'G2', 'G3', 'G4']);
    expect(JSON.stringify(t)).not.toMatch(/amountMinor/);
  });
});
