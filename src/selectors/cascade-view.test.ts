import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '../data/access/repository';
import { createSampleOrgs } from '../data/sample/all';
import { SAMPLE_NOW } from '../data/sample/seed';
import { en } from '../strings/en';
import { branchNeedsAttention, defaultOpen, findRecords, indexTree, toCheckOnRow, visibleFor } from './cascade-view';

const orgs = createSampleOrgs();
const water = orgs[0]!;
const repo = (role: keyof typeof water.devRoles) =>
  createMemoryRepository(orgs.map((o) => o.store), water.orgId, water.devRoles[role], SAMPLE_NOW);

describe('Cascade workspace view (Clarity Specification, section 8)', () => {
  it('starts the Employee on their part, with the chain above their work open', () => {
    const v = repo('employee').cascadeView();
    expect(v.defaults.scope).toBe('part');
    const index = indexTree(v.tree.goals);
    const codes = v.own.map((id) => index.get(id)!.node.ref.code).sort();
    expect(codes).toContain('A1.2.1.3');
    const open = defaultOpen(index, v.own, v.defaults.stopAboveKpi);
    const a = [...index.values()].find((x) => x.node.ref.code === 'A1.2.1.3')!;
    expect(open.has(a.parentId!)).toBe(true); // its KPI is open, so the activity is in view
    const shown = visibleFor(index, v.own);
    expect([...shown].map((id) => index.get(id)!.node.ref.code)).toContain('G1');
  });

  it('starts the Supervisor at their KPIs, with problems first', () => {
    const v = repo('supervisor').cascadeView();
    expect(v.defaults).toMatchObject({ scope: 'part', attention: true, stopAboveKpi: true, codes: false });
    const index = indexTree(v.tree.goals);
    const open = defaultOpen(index, v.own, true);
    expect([...open].every((id) => index.get(id)!.node.ref.kind !== 'kpi')).toBe(true);
  });

  it('shows the Executive the whole organisation with codes, and Finance the funding signal', () => {
    expect(repo('executive').cascadeView().defaults).toMatchObject({ scope: 'whole', codes: true, signal: 'progress' });
    expect(repo('finance').cascadeView().defaults).toMatchObject({ scope: 'whole', codes: true, signal: 'funding' });
  });

  it('rolls checks up to the nearest open record and keeps items that must be fixed off the tree', () => {
    const v = repo('executive').cascadeView();
    const g1 = v.tree.goals.find((g) => g.ref.code === 'G1')!;
    const closed = toCheckOnRow(g1, false, v.checks);
    const open = toCheckOnRow(g1, true, v.checks);
    expect(closed.count).toBeGreaterThanOrEqual(open.count);
    expect(branchNeedsAttention(g1, v.checks)).toBe(true); // K1.2.1 is behind or at risk
    expect(v.unlinkedLines).toBe(1); // "Vehicle hire, Zone C" has no record in the tree
  });

  it('gives Finance one verb-first next step: link the unlinked budget line', () => {
    const v = repo('finance').cascadeView();
    expect(v.nextStep?.text).toBe(en.fixStep['STRUCT-BUDGETLINE-NO-ACTIVITY']!('Vehicle hire, Zone C'));
    expect(v.nextStep?.fix).toEqual({ kind: 'workspace', w: 'plan' });
  });

  it('finds by title always and by code only when codes are shown', () => {
    const index = indexTree(repo('executive').cascadeView().tree.goals);
    expect(findRecords(index, 'meters', false).length).toBeGreaterThan(0);
    expect(findRecords(index, 'A1.2.1.3', false)).toHaveLength(0);
    expect(findRecords(index, 'A1.2.1.3', true).map((n) => n.ref.code)).toEqual(['A1.2.1.3']);
  });

  it('writes finding messages in the organisation’s own labels (D3)', () => {
    const ngo = orgs.find((o) => o.store.organisation.termLabels.goal.singular !== 'Goal');
    if (!ngo) return;
    const r = createMemoryRepository(orgs.map((o) => o.store), ngo.orgId, ngo.devRoles.executive, SAMPLE_NOW);
    const t = ngo.store.organisation.termLabels;
    const goalFinding = r.findings().find((f) => f.finding.subject.type === 'Goal');
    if (goalFinding) expect(goalFinding.finding.message.startsWith(t.goal.singular)).toBe(true);
  });
});
