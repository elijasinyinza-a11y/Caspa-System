/**
 * Every cascade-node page for every role in every sample organisation (Build Brief, section 14).
 * Checks that nothing assumes the utility's shape, and that every restriction holds everywhere.
 */
import type { ISODate } from '../../contract/caspa-data-contract';
import { NODE_KINDS, NODE_TYPE, type NodeKind } from '../../selectors/node';
import { formatFinancialYear, formatMoney } from '../../selectors/format';
import { accountablePositionOfUnit } from '../../rules/structure';
import { createSampleOrgs, DEV_ROLES } from '../sample/all';
import { can, canSeeRating } from './permissions';
import { sortQueue } from '../../selectors/needs-you';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const orgs = createSampleOrgs();
const stores = orgs.map((o) => o.store);
const records = (o: (typeof orgs)[number]) => ({
  goal: o.store.goals, objective: o.store.objectives, kpi: o.store.kpis, activity: o.store.activities,
}) as Record<NodeKind, { id: string }[]>;

describe.each(orgs.map((o) => [o.store.organisation.name, o] as const))('%s', (_name, org) => {
  it.each(DEV_ROLES)('every finding the %s role sees links to a page that opens', (role) => {
    const repo = createMemoryRepository(stores, org.orgId, org.devRoles[role], NOW);
    for (const v of repo.findings()) {
      expect(v.fix, v.finding.key).not.toBeNull();
      if (v.fix?.kind === 'node') expect(repo.node(v.fix.node, v.fix.id), v.finding.key).not.toBeNull();
      if (v.fix?.kind === 'workspace') expect(repo.workspaces()).toContain(v.fix.w);
      expect(v.routedTo).toHaveLength(v.finding.routeToPositionIds.length);
      // Hard blocks are never acknowledgeable; nothing is acknowledged in the seeds.
      if (v.finding.blocksAt.length > 0) expect(v.canAcknowledge).toBe(false);
      expect(v.ack.state).toBe('open');
    }
  });

  it.each(DEV_ROLES)('every node page renders for the %s role, restricted correctly', (role) => {
    const repo = createMemoryRepository(stores, org.orgId, org.devRoles[role], NOW);
    const viewer = repo.viewer;
    const s = org.store;
    for (const kind of NODE_KINDS) {
      for (const rec of records(org)[kind]) {
        const n = repo.node(kind, rec.id);
        expect(n, `${kind} ${rec.id}`).not.toBeNull();
        if (!n) continue;
        // Lineage ends at the node and starts at a goal.
        expect(n.lineage[0]!.kind).toBe('goal');
        expect(n.lineage[n.lineage.length - 1]!.id).toBe(rec.id);
        expect(n.label).toBe(s.organisation.termLabels[kind].singular);
        // Plan: only permitted lines, and a total only when every line is visible.
        for (const l of n.plan.lines) expect(can(s, viewer, 'view', { type: 'BudgetLine', id: l.id })).toBe(true);
        if (n.plan.hiddenLines > 0) expect(n.plan.total).toBeNull();
        if (n.plan.total) {
          expect(n.plan.total.amountMinor).toBe(n.plan.lines.reduce((x, l) => x + l.amount.amountMinor, 0));
          expect(n.plan.total.currency).toBe(s.organisation.baseCurrency);
        }
        // Plan groups (section 18): goal and objective pages only; they partition the lines, and the
        // subtotals sum to the total whenever the total is shown.
        if (kind === 'goal' || kind === 'objective') {
          const g = n.plan.groups!;
          expect(g).not.toBeNull();
          expect(g.flatMap((x) => x.lines.map((l) => l.id)).sort()).toEqual(n.plan.lines.map((l) => l.id).sort());
          expect(g.reduce((x, y) => x + y.hiddenLines, 0)).toBe(n.plan.hiddenLines);
          expect(g.reduce((x, y) => x + y.activities, 0)).toBe(n.plan.activities);
          for (const x of g) if (x.hiddenLines > 0) expect(x.subtotal).toBeNull();
          if (n.plan.total) {
            expect(g.reduce((x, y) => x + (y.subtotal?.amountMinor ?? 0), 0)).toBe(n.plan.total.amountMinor);
            for (const x of g) if (x.lines.length > 0) expect(x.subtotal).not.toBeNull();
          }
        } else {
          expect(n.plan.groups).toBeNull();
        }
        // Performance: names only for contracts the viewer may see; never ratings.
        for (const o of n.performance.objectives) expect(can(s, viewer, 'view', { type: 'ContractObjective', id: o.id })).toBe(true);
        // Strategy: 4Q text only for those who may read it.
        if (n.strategy.reasons.visible) {
          for (const q of s.fourQEntries) if (n.strategy.reasons.entries.some((e) => e.text === q.text)) expect(can(s, viewer, 'view', { type: 'FourQEntry', id: q.id })).toBe(true);
        }
        // Findings: only those whose subject the viewer may see.
        for (const f of n.findings) expect(can(s, viewer, 'view', f.subject)).toBe(true);
        expect(n.ref.kind).toBe(kind);
        expect(NODE_TYPE[kind]).toBeTruthy();
      }
    }
    expect(JSON.stringify(repo.cascadeTree())).not.toMatch(/amountMinor/);
  });

  it.each(DEV_ROLES)('the %s role gets a home whose queue is sorted, reachable and restricted', (role) => {
    const repo = createMemoryRepository(stores, org.orgId, org.devRoles[role], NOW);
    const s = org.store;
    const h = repo.home();
    expect(h.homes.length).toBeGreaterThan(0);
    expect(h.needsYou.map((i) => i.key)).toEqual(sortQueue(h.needsYou).map((i) => i.key));
    expect(new Set(h.needsYou.map((i) => i.key)).size).toBe(h.needsYou.length);
    for (const i of h.needsYou) {
      if (i.link?.kind === 'node') expect(repo.node(i.link.node, i.link.id), i.key).not.toBeNull();
      if (i.daysOverdue !== null) expect(i.due).not.toBeNull();
    }
    // Ratings only for those the Review row allows (B5); Finance, Executive and Strategy office never see them by role.
    for (const m of h.team ?? []) if (m.rating) expect(canSeeRating(s, repo.viewer, m.contract!.id)).toBe(true);
    for (const c of h.contracts ?? []) if (c.rating) expect(canSeeRating(s, repo.viewer, c.id)).toBe(true);
    for (const x of h.hr?.scored ?? []) expect(canSeeRating(s, repo.viewer, x.contractId)).toBe(true);
    if (!h.homes.includes('hr')) expect(h.hr).toBeNull();
    if (!h.homes.includes('finance')) expect(h.finance).toBeNull();
    // Finance amounts only when every line is visible.
    if (h.finance?.total) expect(s.budgetLines.every((l) => can(s, repo.viewer, 'view', { type: 'BudgetLine', id: l.id }))).toBe(true);
  });

  it('formats its money and financial year by its own currency and year start', () => {
    const o = org.store.organisation;
    const line = org.store.budgetLines[0]!;
    expect(formatMoney(line.amount).startsWith(`${o.baseCurrency} `)).toBe(true);
    expect(formatFinancialYear(2026, o.financialYearStartMonth)).toMatch(/^FY2026(\/27)?$/);
  });

  it('derives an accountable position for every unit', () => {
    for (const u of org.store.units) expect(accountablePositionOfUnit(org.store, u.id), u.name).not.toBeNull();
  });
});

describe('cross-organisation specifics', () => {
  const [, ngo, mfg, scale] = orgs;
  const repo = (o: (typeof orgs)[number], role: (typeof DEV_ROLES)[number]) => createMemoryRepository(stores, o!.orgId, o!.devRoles[role], NOW);

  it('NGO: renamed terms, UGX without minor units, a July–June year, milestone progress by weight', () => {
    const r = repo(ngo!, 'executive');
    expect(r.financialYear).toBe(2026);
    const n = r.node('activity', 'a-ngo-IV1.1.1.1')!;
    expect(n.lineage.map((x) => x.label)).toEqual(['Outcome', 'Result', 'Indicator', 'Intervention']);
    const m = r.node('kpi', 'k-ngo-IN1.2.1')!.cascade;
    if (m.kind !== 'kpi') throw new Error('expected kpi');
    expect(m.progress.progress).toBe(0.25); // 1 of 4 weight
    const sum = r.node('kpi', 'k-ngo-IN2.1.1')!.cascade;
    if (sum.kind !== 'kpi') throw new Error('expected kpi');
    expect(sum.progress).toMatchObject({ actual: 37, baselineAssumedZero: true }); // P2 sum, P4 baseline 0
  });

  it('NGO: personnel lines are Finance-only, so the Executive sees no total for that intervention', () => {
    const exec = repo(ngo!, 'executive').node('activity', 'a-ngo-IV1.1.1.1')!.plan;
    expect(exec.lines.map((l) => l.description)).toEqual(['Transport for home visits']);
    expect(exec.hiddenLines).toBe(1);
    expect(exec.total).toBeNull();
    const fin = repo(ngo!, 'finance').node('activity', 'a-ngo-IV1.1.1.1')!.plan;
    expect(formatMoney(fin.total!)).toBe('UGX 42,000,000');
  });

  it('NGO: the Programme Coordinator, as supervisor, sees the signed and the draft work-plan targets', () => {
    const p = repo(ngo!, 'supervisor').node('activity', 'a-ngo-IV1.1.1.1')!.performance;
    expect(p.objectives.map((o) => [o.person, o.contractStatus, o.done])).toEqual([['Sarah Nakato', 'signed', 96], ['Peter Okello', 'draft', null]]);
  });

  it('Manufacturer: Line 2 answers to the Plant Manager, because one of its staff reports outside the line', () => {
    expect(accountablePositionOfUnit(mfg!.store, 'u-mfg-line2')).toBe('pos-mfg-pm');
  });

  it('Manufacturer: a lower-is-better KPI with no baseline shows status only (P4)', () => {
    const c = repo(mfg!, 'executive').node('kpi', 'k-mfg-K1.2.1')!.cascade;
    if (c.kind !== 'kpi') throw new Error('expected kpi');
    expect(c.progress).toMatchObject({ kind: 'target_check', status: 'target_not_met', progress: null });
  });

  it('Manufacturer: a draft activity with no 6P level shows no level and raises its blocking finding', () => {
    const n = repo(mfg!, 'executive').node('activity', 'a-mfg-A2.1.1.2')!;
    if (n.cascade.kind !== 'activity') throw new Error('expected activity');
    expect(n.cascade.level).toBeNull();
    expect(n.findings.map((f) => f.ruleId)).toContain('STRUCT-ACTIVITY-NO-6P');
  });

  it('Scale: 288 activities in the tree', () => {
    expect(repo(scale!, 'executive').cascadeTree().counts).toEqual({ goal: 4, objective: 16, kpi: 48, activity: 288 });
  });

  it('the shared Executive belongs to all four organisations; nobody else does', () => {
    expect(repo(orgs[0]!, 'executive').organisationsForPerson()).toHaveLength(4);
    expect(repo(orgs[0]!, 'finance').organisationsForPerson()).toHaveLength(1);
    expect(repo(ngo!, 'employee').organisationsForPerson()).toHaveLength(1);
  });
});

/* Slice 5: the budget gate in every organisation (BUILD-BRIEF section 19). */
describe.each(createSampleOrgs().map((o) => [o.store.organisation.name, o.orgId] as const))('budget gate: %s', (_name, orgId) => {
  it.each(DEV_ROLES)('for the %s role, goal subtotals and the unlinked subtotal sum to the total whenever it is shown', (role) => {
    const fresh = createSampleOrgs();
    const org = fresh.find((o) => o.orgId === orgId)!;
    const b = createMemoryRepository(fresh.map((o) => o.store), orgId, org.devRoles[role], NOW).budget().budget;
    const parts = [...b.goals.map((g) => g.subtotal), b.unlinked.subtotal];
    if (b.total) expect(parts.reduce((n, m) => n + (m?.amountMinor ?? NaN), 0)).toBe(b.total.amountMinor);
    else expect(b.hiddenLines).toBeGreaterThan(0);
    expect(b.goals.reduce((n, g) => n + g.lineCount, 0) + b.unlinked.lineCount).toBe(b.lineCount);
    for (const g of b.goals) {
      if (g.subtotal) expect(g.objectives.reduce((n, o) => n + (o.subtotal?.amountMinor ?? NaN), 0)).toBe(g.subtotal.amountMinor);
    }
  });

  it('runs end to end: blocked, linked, submitted, approved by someone else, frozen', () => {
    const fresh = createSampleOrgs();
    const org = fresh.find((o) => o.orgId === orgId)!;
    const clock = (() => { let t = 0; return () => new Date(Date.parse(`${NOW}T09:00:00Z`) + 1000 * t++).toISOString() as never; })();
    const as = (role: (typeof DEV_ROLES)[number]) => createMemoryRepository(fresh.map((o) => o.store), orgId, org.devRoles[role], NOW, { clock });
    const total = as('finance').budget().budget.total!.amountMinor;
    expect(as('finance').submitBudget()).toMatchObject({ ok: true, outcome: 'blocked' });
    for (const l of as('finance').budget().budget.unlinked.lines) {
      const option = as('finance').budgetLinkOptions(l.id)[0]!;
      expect(as('finance').linkBudgetLine(l.id, option.ref.id)).toEqual({ ok: true });
    }
    expect(as('finance').budget().budget.total!.amountMinor).toBe(total);
    expect(as('finance').submitBudget()).toEqual({ ok: true, outcome: 'passed', blocking: 0 });
    const board = org.store.organisation.settings.boardApprovalRequired.budget ? { resolutionRef: 'R-1', date: '2026-11-20' as ISODate } : null;
    if (!board) expect(as('executive').approveBudget(null, '')).toMatchObject({ ok: true, outcome: 'passed' });
    else expect(as('executive').approveBudget(board, '')).toMatchObject({ ok: true, outcome: 'passed' });
    expect(org.store.budgetVersions[0]!.status).toBe('approved');
    expect(org.store.budgetVersions[0]!.boardApproval).toEqual(board);
    expect(org.store.gateEvents.map((g) => [g.gate, g.outcome])).toEqual([
      ['cascade.publish', 'passed'], // seeded: the plan's cascade was published when it was brought in (section 28)
      ['budget.submit_consolidated', 'blocked'], ['budget.submit_consolidated', 'passed'], ['budget.approve', 'passed'],
    ]);
  });

  it('every role whose positions hold a line can reach Plan, so the orphan-line finding always has a fix it can open', () => {
    const fresh = createSampleOrgs();
    const org = fresh.find((o) => o.orgId === orgId)!;
    for (const role of DEV_ROLES) {
      const repo = createMemoryRepository(fresh.map((o) => o.store), orgId, org.devRoles[role], NOW);
      if (repo.viewer.isBudgetHolder) expect(repo.workspaces()).toContain('plan');
    }
  });
});
