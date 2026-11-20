/**
 * Drafting the vision, mission and values (v0.31.0; Vision, Mission and Values Drafting Specification v0.1, VM-1 to
 * VM-8; contract v1.22; BUILD-BRIEF section 55), and A4 (a failure factor's cause level in the plan document).
 */
import type { ISODate, StrategicPlan } from '../../contract/caspa-data-contract';
import { createSampleOrgs } from '../sample/all';
import { devMembership } from '../sample/review';
import { createMemoryRepository } from './repository';
import { planDocumentContent } from '../../selectors/plan-document';

const NOW = '2026-10-18' as ISODate;
const V = (name: string) => ({ name, text: `${name}, in daily work.` });

function setup() {
  const orgs = createSampleOrgs();
  const stores = orgs.map((o) => o.store);
  const swu = orgs[0]!;
  const mfg = orgs.find((o) => o.store.organisation.name.includes('Packaging'))!;
  const as = (role: Parameters<typeof devMembership>[1], o = swu) => createMemoryRepository(stores, o.orgId, devMembership(o, role, NOW)!, NOW);
  const asMember = (membershipId: string, o = swu) => createMemoryRepository(stores, o.orgId, membershipId, NOW);
  return { orgs, swu, mfg, as, asMember };
}
const needs = (r: ReturnType<ReturnType<typeof setup>['as']>) => r.home().needsYou.filter((i) => i.key.startsWith('vision:'));

describe('VM-1, VM-3: who drafts, and who sees a draft', () => {
  it('the Strategy office and a facilitator may draft; Finance may not; the Executive keeps the one-step record', () => {
    const f = setup();
    expect(f.as('strategy').strategyLanding.landing()!.canDraft).toBe('all');
    expect(f.asMember('m-fac').strategyLanding.landing()!.canDraft).toBe('all');
    expect(f.as('finance').strategyLanding.landing()!).toMatchObject({ canDraft: null, canRecord: null, draft: null });
    expect(f.as('executive').strategyLanding.landing()!).toMatchObject({ canDraft: null, canRecord: 'all' });
    expect(f.as('finance').strategyLanding.saveDraft('v', 'm', [])).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('a saved draft shows to the Strategy office, facilitators and the Executive only', () => {
    const f = setup();
    expect(f.as('strategy').strategyLanding.saveDraft('Safe water for every household.', '', [V('Act early')])).toEqual({ ok: true });
    const d = f.as('executive').strategyLanding.landing()!.draft!;
    expect(d).toMatchObject({ mode: 'all', vision: 'Safe water for every household.', mission: '', status: 'draft', by: 'Bwalya Musonda', sent: null });
    expect(d.values).toEqual([V('Act early')]);
    expect(f.asMember('m-fac').strategyLanding.landing()!.draft!.status).toBe('draft');
    for (const role of ['finance', 'hr', 'employee', 'supervisor'] as const) {
      const l = f.as(role).strategyLanding.landing()!;
      expect(l.draft).toBeNull();
      expect(l.statements).toMatchObject({ vision: null, mission: null, values: [] });
    }
  });
});

describe('VM-4 to VM-6: send, confirm or send back', () => {
  it('sends, is sent back with a reason, is sent again and confirmed, with Needs you items and audit entries', () => {
    const f = setup();
    const office = f.as('strategy').strategyLanding;
    office.saveDraft('Safe water for every household.', '', [V('Act early')]);
    expect(office.sendDraft()).toEqual({ ok: false, error: 'text_required' }); // both vision and mission
    office.saveDraft('Safe water for every household.', 'We supply and care.', [V('Act early'), V('Plan ahead')]);
    expect(office.sendDraft()).toEqual({ ok: true });
    expect(f.as('strategy').strategyLanding.landing()!).toMatchObject({ canDraft: null, draft: { status: 'sent', sent: { by: 'Bwalya Musonda' } } });
    expect(f.as('strategy').strategyLanding.saveDraft('x', 'y', [])).toEqual({ ok: false, error: 'already_sent' });

    const exec = f.as('executive');
    expect(exec.strategyLanding.landing()!.canRecord).toBeNull(); // VM-6: not while a draft waits
    expect(exec.strategyLanding.recordStatements('x', 'y')).toEqual({ ok: false, error: 'already_sent' });
    expect(needs(exec).map((i) => [i.title, i.kind])).toEqual([['Confirm the vision, mission and values drafted by Bwalya Musonda', 'approval']]);
    expect(needs(exec)[0]!.link).toEqual({ kind: 'landing' });
    expect(f.as('strategy').strategyLanding.confirmDraft()).toEqual({ ok: false, error: 'not_allowed' });
    expect(exec.strategyLanding.sendBackDraft('  ')).toEqual({ ok: false, error: 'reason_required' });
    expect(exec.strategyLanding.sendBackDraft('Shorten the vision to one line.')).toEqual({ ok: true });

    expect(needs(f.as('executive'))).toEqual([]);
    expect(needs(f.as('strategy')).map((i) => i.title)).toEqual(['Sent back by Chanda Mulenga: Shorten the vision to one line.']);
    expect(f.as('strategy').strategyLanding.landing()!.draft).toMatchObject({ status: 'returned', returned: { by: 'Chanda Mulenga', reason: 'Shorten the vision to one line.' } });
    expect(needs(f.asMember('m-fac'))).toEqual([]); // only the person who drafted it

    const again = f.as('strategy').strategyLanding;
    again.saveDraft('Safe water for all.', 'We supply and care.', [V('Act early'), V('Plan ahead')]);
    expect(f.as('strategy').strategyLanding.landing()!.draft!.status).toBe('returned'); // until sent again
    expect(again.sendDraft()).toEqual({ ok: true });
    expect(f.as('strategy').strategyLanding.landing()!.draft!.returned).toBeNull();
    expect(f.as('executive').strategyLanding.confirmDraft()).toEqual({ ok: true });

    const seen = f.as('finance').strategyLanding.landing()!;
    expect(seen.statements).toMatchObject({ vision: 'Safe water for all.', mission: 'We supply and care.', recorded: { by: 'Chanda Mulenga' } });
    expect(seen.statements.values.map((x) => x.name)).toEqual(['Act early', 'Plan ahead']);
    expect(f.as('strategy').strategyLanding.landing()!).toMatchObject({ canDraft: null, draft: null });
    expect(needs(f.as('strategy'))).toEqual([]);
    const actions = f.swu.store.auditEntries.map((e) => e.action);
    expect(actions.filter((a) => a === 'send')).toHaveLength(2);
    expect(actions).toContain('send_back');
    expect(f.swu.store.auditEntries.filter((e) => e.action === 'confirm' && e.entity.type === 'VisionStatement')).toHaveLength(4);
  });

  it('the Executive may still record their own text in one step, replacing an unsent draft', () => {
    const f = setup();
    f.as('strategy').strategyLanding.saveDraft('Draft vision', 'Draft mission', [V('Draft value')]);
    expect(f.as('executive').strategyLanding.recordStatements('Our vision', 'Our mission', [V('Integrity')])).toEqual({ ok: true });
    const l = f.as('finance').strategyLanding.landing()!;
    expect(l.statements).toMatchObject({ vision: 'Our vision', mission: 'Our mission', values: [V('Integrity')] });
    expect(f.as('strategy').strategyLanding.landing()!.draft).toBeNull();
  });

  it('values only, when the plan already has a confirmed vision and mission', () => {
    const f = setup();
    f.as('executive').strategyLanding.recordStatements('Our vision', 'Our mission');
    const office = f.as('strategy').strategyLanding;
    expect(office.landing()!.canDraft).toBe('values');
    expect(office.sendDraft()).toEqual({ ok: false, error: 'no_draft' });
    expect(office.saveDraft('ignored', 'ignored', [V('Integrity')])).toEqual({ ok: true });
    expect(office.sendDraft()).toEqual({ ok: true });
    expect(needs(f.as('executive'))[0]!.title).toBe('Confirm the values drafted by Bwalya Musonda');
    expect(f.as('executive').strategyLanding.confirmDraft()).toEqual({ ok: true });
    expect(f.as('finance').strategyLanding.landing()!.statements).toMatchObject({ vision: 'Our vision', values: [V('Integrity')] });
  });
});

describe('sample data: the Packaging Manufacturer', () => {
  it('has a draft from its Strategy office waiting for the Executive', () => {
    const f = setup();
    const exec = f.as('executive', f.mfg);
    expect(needs(exec).map((i) => i.key)).toEqual(['vision:confirm:plan-mfg']);
    expect(exec.strategyLanding.landing()!.draft).toMatchObject({ status: 'sent', mode: 'all' });
    expect(exec.strategyLanding.landing()!.draft!.values.map((v) => v.name)).toEqual(['Quality at the source', 'Keep our word', 'Safety first']);
    expect(f.as('finance', f.mfg).strategyLanding.landing()!.draft).toBeNull();
  });
});

describe('A4: a failure factor shows where its cause sits in the plan document', () => {
  it('after its text', () => {
    const { swu } = setup();
    const s = swu.store;
    const plan = s.plans.find((p) => p.status !== 'active') as StrategicPlan;
    for (const e of s.fourQEntries.filter((x) => x.planId === plan.id)) Object.assign(e, { scope: 'organisation', draft: { ...e.draft, state: 'accepted' } });
    const cards = planDocumentContent(s, plan, () => true).where.flatMap((b) => b.sections).flatMap((x) => x.cards ?? []);
    expect(cards).toContain('Leaks repaired only after customers complain (cause: Process)');
    expect(cards).toContain('Reading routes left without supervision (cause: People)');
    expect(cards).toContain('Dedicated metering project team'); // no level, unchanged
  });
});
