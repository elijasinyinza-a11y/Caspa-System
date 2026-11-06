/** v0.22.0 Performance › Contracts (Contracts Specification v0.1, CT-1 to CT-10; contract v1.14). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { draftChecks } from '../../rules/contracts';
import { createSampleOrgs, ALL_DEV_ROLES } from '../sample/all';
import { createSeed, ORG } from '../sample/seed';
import { createMemoryRepository } from './repository';
import type { Store } from './store';

const NOW = '2026-10-18' as ISODate;
const PC = 'pc-co-2026';
const as = (s: Store, m: string) => createMemoryRepository([s], ORG, m, NOW);
const PETER = 'm-cm', ESTHER = 'm-co', CHANDA = 'm-md', HR = 'm-hrm', MARY = 'm-mrb';
const fixWeights = (s: Store) => { expect(as(s, PETER).contracts.updateObjective('co-co-3', { weight: 20 })).toEqual({ ok: true }); expect(as(s, PETER).contracts.updateObjective('co-co-2', { weight: 40 })).toEqual({ ok: true }); };

describe('drafting checks (CT-3, CT-4)', () => {
  it('finds the sample draft’s problems', () => {
    const s = createSeed();
    const ch = draftChecks(s, PC, NOW);
    expect(ch.mustFix.map((x) => x.kind)).toEqual(['weights', 'standing_duties']);
    expect(ch.worth.map((x) => x.kind)).toEqual(['over_activity', 'dependency']);
    expect(ch.worth.find((x) => x.kind === 'dependency')).toMatchObject({ flags: ['not_carried', 'late', 'higher_level'] });
    expect(ch.fairness).toBe(true);
  });
  it('applies HR’s single-objective limit once set', () => {
    const s = createSeed();
    fixWeights(s);
    expect(as(s, HR).contracts.saveLimits({ standing: 20, single: 35, showDraft: false })).toEqual({ ok: true });
    expect(draftChecks(s, PC, NOW).mustFix.map((x) => x.kind)).toEqual(['single_limit', 'single_limit']);
  });
});

describe('the journey (CT-5, CT-6)', () => {
  it('blocks issuing, sends a flagged contract for checking, then issues, signs and freezes it', () => {
    const s = createSeed();
    const peter = () => as(s, PETER).contracts;
    expect(as(s, ESTHER).contracts.contract(PC)).toBeNull(); // drafts are hidden from staff by default (CT-7)
    expect(peter().issue(PC)).toEqual({ ok: false, error: 'must_fix' });
    expect(s.gateEvents.some((g) => g.gate === 'contract.issue' && g.outcome === 'blocked')).toBe(true);
    fixWeights(s);
    expect(peter().issue(PC)).toEqual({ ok: true, outcome: 'sent_for_check' });
    expect(peter().clearCheck(PC)).toEqual({ ok: false, error: 'not_allowed' }); // B7
    expect(as(s, CHANDA).home().needsYou.some((i) => i.key === 'contracts:check')).toBe(true);
    expect(as(s, CHANDA).contracts.clearCheck(PC)).toEqual({ ok: true });
    expect(peter().issue(PC)).toEqual({ ok: true, outcome: 'issued' });
    expect(s.gateEvents.find((g) => g.gate === 'contract.issue' && g.outcome === 'passed')!.advisoryAtGate.length).toBe(2);
    expect(as(s, ESTHER).contracts.sign(PC, 'The briefings depend on a policy revision I cannot influence.')).toEqual({ ok: true, outcome: 'signed' });
    expect(peter().sign(PC, '')).toEqual({ ok: true, outcome: 'fully_signed' });
    const ct = s.contracts.find((x) => x.id === PC)!;
    expect([ct.status, ct.employeeNote]).toEqual(['signed', 'The briefings depend on a policy revision I cannot influence.']);
    expect(s.contractObjectives.filter((x) => x.contractId === PC).every((x) => x.snapshot !== null)).toBe(true);
  });
  it('the next-level reviewer may send it back with a reason', () => {
    const s = createSeed();
    fixWeights(s);
    as(s, PETER).contracts.issue(PC);
    expect(as(s, CHANDA).contracts.sendBack(PC, '')).toEqual({ ok: false, error: 'reason_required' });
    expect(as(s, CHANDA).contracts.sendBack(PC, 'Move the briefings weight until the policy is revised.')).toEqual({ ok: true });
    const v = as(s, PETER).contracts.contract(PC)!;
    expect([v.step, v.checkReason, v.can.edit]).toEqual(['sent_back', 'Move the briefings weight until the policy is revised.', true]);
  });
});

describe('objectives and dependencies (CT-2, section 4)', () => {
  it('adds objectives by source, and refuses a circle of dependencies', () => {
    const s = createSeed();
    const peter = as(s, PETER).contracts;
    expect(peter.addObjective(PC, { source: 'activity', refId: 'a1.2.1.3', title: 'Oversee meter replacement', quantity: 200, unit: '', weight: 0 })).toMatchObject({ ok: true });
    expect(peter.addObjective(PC, { source: 'duty', title: 'Monthly stock count', quantity: 12, unit: 'counts', weight: 0 })).toMatchObject({ ok: true });
    expect(peter.addObjective(PC, { source: 'activity', title: 'No source', quantity: 1, unit: '', weight: 0 })).toEqual({ ok: false, error: 'source_required' });
    expect(peter.addDependency('co-co-2', 'a1.1.1.1', '2026-12-31', '')).toEqual({ ok: false, error: 'circle' });
    expect(peter.addDependency('co-co-2', 'a1.2.1.3', '2026-12-31', 'Faulty meters give no reading.')).toEqual({ ok: true });
    expect(as(s, PETER).contracts.addDependency('co-co-1', 'a1.1.1.1', '2026-12-31', '')).toEqual({ ok: true });
    expect(as(s, ESTHER).contracts.addDependency('co-co-1', 'a1.2.1.3', '2026-12-31', '')).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('revising a signed contract (CT-8)', () => {
  it('drafts a new version, keeps the old one in force until both sign, then closes it', () => {
    const s = createSeed();
    fixWeights(s);
    as(s, PETER).contracts.issue(PC); as(s, CHANDA).contracts.clearCheck(PC); as(s, PETER).contracts.issue(PC);
    as(s, ESTHER).contracts.sign(PC, ''); as(s, PETER).contracts.sign(PC, '');
    const r = as(s, PETER).contracts.revise(PC);
    expect(r).toEqual({ ok: true, id: `${PC}-v2` });
    expect(s.contracts.find((x) => x.id === PC)!.status).toBe('signed');
    expect(s.dependencies.some((d) => d.id === 'dep-co-1-v2')).toBe(true);
    const v2 = `${PC}-v2`;
    expect(as(s, PETER).contracts.issue(v2)).toEqual({ ok: true, outcome: 'sent_for_check' }); // still flagged
    as(s, CHANDA).contracts.clearCheck(v2); as(s, PETER).contracts.issue(v2);
    as(s, ESTHER).contracts.sign(v2, ''); as(s, PETER).contracts.sign(v2, '');
    expect([s.contracts.find((x) => x.id === PC)!.status, s.contracts.find((x) => x.id === v2)!.status]).toEqual(['closed', 'signed']);
  });
});

describe('at review (section 4, CT-9)', () => {
  it('shows what an objective depends on, and lets the employee ask HR', () => {
    const s = createSeed();
    s.dependencies.push({ ...structuredClone(s.dependencies[0]!), id: 'dep-mary' as never, from: { contractObjectiveId: 'co-b-1' as never }, on: { activityId: 'a1.2.1.2' as never } });
    const line = as(s, MARY).reviews.page().mine[0]!.objectives.find((o) => o.id === 'co-b-1')!;
    expect(line.depends[0]).toMatch(/^Depends on: A1\.2\.1\.2 Revise meter management policy, Head of Commercial \(Policy level\), needed by 28 February 2026 · /);
    expect(as(s, MARY).reviews.askCantAssess('rv-mrb-2026-mid', 'co-b-1', 'No meters were delivered until September.')).toEqual({ ok: true });
    expect(s.reviews[0]!.notAssessable[0]).toMatchObject({ askedBy: 'employee', hrApproval: null });
  });
});

describe('every organisation and role', () => {
  it('builds Contracts without error', () => {
    for (const o of createSampleOrgs()) for (const role of ALL_DEV_ROLES) {
      const m = (o.devRoles as Record<string, string>)[role];
      if (!m) continue;
      const r = createMemoryRepository([o.store], o.orgId, m, NOW);
      const p = r.contracts.page();
      for (const t of p.team) if (t.contract) { r.contracts.contract(t.contract.id); r.contracts.sources(t.contract.id); }
      r.contracts.needs();
    }
  });
});
