/** Strategy formation, part 11c (BUILD-BRIEF section 32; contract v1.6): the consultation room, the baseline register and the compliance register. */
import type { ISODate } from '../../contract/caspa-data-contract';
import { PERMISSIONS } from '../../contract/caspa-data-contract';
import { SAMPLE_BASELINE_DRAFT, SAMPLE_COMPLIANCE_DRAFT } from '../../ai';
import { ALL_DEV_ROLES } from '../sample/all';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createMemoryRepository } from './repository';
import { can } from './permissions';
import { resolveViewer } from './viewer';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
type Role = Parameters<typeof devMembership>[1];
const d = (x: string) => x as ISODate;
const last = <T,>(xs: T[]): T => xs[xs.length - 1]!;

const fresh = (orgId = SWU) => {
  const orgs = createReviewOrgs();
  const org = orgs.find((o) => o.orgId === orgId)! as ReviewOrg;
  const repoFor = (membershipId: string) => createMemoryRepository(orgs.map((o) => o.store), orgId, membershipId, NOW);
  const as = (role: Role) => repoFor(devMembership(org, role, NOW)!);
  return { as, repoFor, store: org.store, org };
};
type F = ReturnType<typeof fresh>;
const openStage = (f: F, stage: 'consultation' | 'confirmation') => f.as('strategy').formation.moveStage(stage, 'open');
/** The Strategy office opens Consultation and a round for everyone. */
const openRound = (f: F, audience: string[] | 'all' = 'all') => {
  openStage(f, 'consultation');
  const so = f.as('strategy').consultation;
  const r = so.scheduleRound({ audienceUnitIds: audience, opensOn: d('2026-10-19'), closesOn: d('2026-11-13') });
  if (!r.ok) throw new Error('round not planned');
  expect(so.moveRound(r.id, 'open')).toEqual({ ok: true });
  return r.id;
};
const HOO = 'm-hoo'; // Head of Operations: answers for Operations (F-2)

describe('contract v1.6', () => {
  it('adds the consultation rows and widens the compliance row as decided', () => {
    expect(PERMISSIONS.ConsultationRound).toEqual({ view: ['all_members'], draft: ['strategy_office', 'facilitator'] });
    expect(PERMISSIONS.ConsultationInput?.view).toContain('round_audience');
    expect(PERMISSIONS.ComplianceItem).toEqual({ view: ['all_members'], draft: ['strategy_office', 'compliance', 'owner'], approve: ['compliance'] });
    expect(PERMISSIONS.BaselineMeasure?.approve).toEqual(['strategy_office']);
  });
  it('seeds the prototype’s six baselines with owners, and its six obligations, none validated or reviewed', () => {
    const f = fresh();
    const b = f.store.baselineMeasures.filter((x) => x.planId === 'plan-2027');
    expect(b.map((x) => [x.name, x.ownerUnitId])).toEqual([
      ['Non-revenue water', 'u-com'], ['Supply hours per day', 'u-ops'], ['Collection efficiency', 'u-fin'],
      ['Sanitation coverage', 'u-ops'], ['Metered connections', 'u-com'], ['Staff with signed contracts', null],
    ]);
    expect(b.every((x) => x.validated === null)).toBe(true);
    expect(f.store.complianceItems.map((c) => c.provenance.kind)).toEqual(['document', 'document', 'document', 'document', 'document', 'manual']);
    expect(f.store.complianceItems.every((c) => c.outcome === null)).toBe(true);
  });
});

describe('consultation rounds', () => {
  it('cannot be planned until the Consultation stage is open; dates are checked, never enforced', () => {
    const f = fresh();
    const so = f.as('strategy').consultation;
    const r = so.scheduleRound({ audienceUnitIds: 'all', opensOn: d('2026-10-19'), closesOn: d('2026-10-01') });
    expect(r).toEqual({ ok: false, error: 'checks', checks: ['stage_not_open', 'dates_backwards'] });
  });
  it('are run by the Strategy office, open and close by hand, and only one runs at a time', () => {
    const f = fresh();
    openStage(f, 'consultation');
    const so = f.as('strategy').consultation;
    expect(f.as('executive').consultation.scheduleRound({ audienceUnitIds: 'all', opensOn: d('2026-10-19'), closesOn: d('2026-11-13') })).toEqual({ ok: false, error: 'not_allowed' });
    const r = so.scheduleRound({ audienceUnitIds: 'all', opensOn: d('2026-10-19'), closesOn: d('2026-11-13') });
    if (!r.ok) throw new Error();
    expect(so.room()!.round!.status).toBe('scheduled');
    expect(f.store.consultationRounds[0]!.attribution).toBe('unit_only');
    expect(so.scheduleRound({ audienceUnitIds: 'all', opensOn: d('2026-10-19'), closesOn: d('2026-11-13') })).toEqual({ ok: false, error: 'checks', checks: ['another_round'] });
    expect(so.moveRound(r.id, 'closed')).toEqual({ ok: false, error: 'locked' });
    expect(so.moveRound(r.id, 'open')).toEqual({ ok: true });
    expect(so.moveRound(r.id, 'closed')).toEqual({ ok: true });
    expect(so.moveRound(r.id, 'open')).toEqual({ ok: false, error: 'locked' });
    expect(f.store.auditEntries.filter((a) => a.entity.type === 'ConsultationRound').map((a) => a.action)).toEqual(['create', 'open', 'close']);
  });
  it('bring the audience into the Strategy workspace while open, and into “Needs you” until they have had their say', () => {
    const f = fresh();
    expect(f.as('employee').workspaces()).not.toContain('strategy');
    const id = openRound(f);
    const emp = f.as('employee');
    expect(emp.workspaces()).toContain('strategy');
    expect(emp.home().needsYou.map((n) => n.title)).toContain('Have your say on Strategic Plan 2027–2031');
    expect(emp.consultation.addInput({ kind: 'idea', text: 'Let readers mark meters they can’t reach.' }).ok).toBe(true);
    expect(f.as('employee').home().needsYou.some((n) => n.key === `consult:say:${id}`)).toBe(false);
    f.as('strategy').consultation.moveRound(id, 'closed');
    expect(f.as('employee').workspaces()).not.toContain('strategy');
  });
});

describe('what people send (F-3: the unit, never a name)', () => {
  it('shows the unit only; small units show as the unit above them; the author stays in the audit record', () => {
    const f = fresh();
    openRound(f);
    f.as('employee').consultation.addInput({ kind: 'idea', text: 'Let readers mark meters they can’t reach.' }); // Zone B has 1 person
    f.repoFor(HOO).consultation.addInput({ kind: 'comment', text: 'Fix leaks before we build new supply.' }); // Operations has 1 person
    f.as('supervisor').consultation.addInput({ kind: 'comment', text: 'Clear route targets help.' }); // Commercial has 6 people
    const room = f.as('executive').consultation.room()!;
    expect(room.inputs.map((i) => [i.unit, i.kind])).toEqual([['Commercial', 'comment'], ['Sample Water Utility', 'comment'], ['Commercial', 'idea']]);
    expect(room.inputs.every((i) => !i.mine)).toBe(true);
    expect(JSON.stringify(room)).not.toContain('Mary Chileshe');
    expect(f.as('employee').consultation.room()!.inputs.find((i) => i.kind === 'idea')!.mine).toBe(true);
    const audit = f.store.auditEntries.find((a) => a.entity.type === 'ConsultationInput')!;
    expect(audit.actorMembershipId).toBe('m-mrb');
    expect(room.round!.counts).toMatchObject({ inputs: 3, comments: 2, ideas: 1, units: 2 });
  });
  it('a round for chosen units: only that audience (with the units within it) may send and read', () => {
    const f = fresh();
    openRound(f, ['u-com']);
    expect(f.as('employee').consultation.room()!.canComment).toBe(true); // Zone B sits within Commercial
    expect(f.as('employee').consultation.addInput({ kind: 'comment', text: 'Clearer targets.' }).ok).toBe(true);
    const fin = f.as('finance').consultation;
    expect(fin.room()!.canComment).toBe(false);
    expect(fin.room()!.seesInputs).toBe(false);
    expect(fin.addInput({ kind: 'comment', text: 'Finance view.' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('executive').consultation.room()!.inputs).toHaveLength(1);
  });
  it('meeting summaries come from department heads, for their department and sections; expert input from the Strategy office', () => {
    const f = fresh();
    openRound(f);
    const hoo = f.repoFor(HOO).consultation;
    expect(hoo.room()!.meetingUnits.map((u) => u.name)).toEqual(['Operations']);
    expect(hoo.addInput({ kind: 'meeting_summary', text: 'Teams asked for clearer pump schedules.', unitId: 'u-ops' }).ok).toBe(true);
    expect(hoo.addInput({ kind: 'meeting_summary', text: 'Not mine.', unitId: 'u-fin' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('employee').consultation.addInput({ kind: 'meeting_summary', text: 'x', unitId: 'u-zone-b' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('employee').consultation.addInput({ kind: 'expert_input', text: 'x' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('strategy').consultation.addInput({ kind: 'expert_input', text: 'Leadership assessment report: summary of strengths.', attachment: 'assessment.pdf' }).ok).toBe(true);
    const room = f.as('executive').consultation.room()!;
    expect(room.inputs[0]).toMatchObject({ kind: 'expert_input', unit: null, attachment: 'assessment.pdf' });
  });
  it('nothing is sent to a planned or closed round', () => {
    const f = fresh();
    const id = openRound(f);
    f.as('strategy').consultation.moveRound(id, 'closed');
    expect(f.as('employee').consultation.addInput({ kind: 'idea', text: 'Late idea.' })).toEqual({ ok: false, error: 'not_open' });
  });
  it('the AI groups what people sent for the Strategy office, keeps ideas raised once, sees only the text, and decides nothing', async () => {
    const f = fresh();
    openRound(f);
    f.as('employee').consultation.addInput({ kind: 'idea', text: 'Fix leaks in Zone B before new supply.' });
    f.repoFor(HOO).consultation.addInput({ kind: 'comment', text: 'Most leaks are on old mains.' });
    f.as('supervisor').consultation.addInput({ kind: 'comment', text: 'Route targets need to be realistic.' });
    expect(await f.as('employee').consultation.groupInputs()).toEqual({ ok: false, error: 'not_allowed' });
    const before = f.store.consultationInputs.length;
    const r = await f.as('strategy').consultation.groupInputs();
    if (!r.ok) throw new Error();
    expect(r.groups.map((g) => [g.word, g.inputs.length])).toEqual([['leaks', 2]]);
    expect(r.single.map((i) => i.text)).toEqual(['Route targets need to be realistic.']);
    expect(last(f.store.aiTasks).kind).toBe('cluster');
    expect(f.store.consultationInputs).toHaveLength(before); // nothing stored
    f.store.organisation.settings.aiEnabled = false;
    expect(await f.as('strategy').consultation.groupInputs()).toEqual({ ok: false, error: 'ai_off' });
  });
  it('the vision appears in the room only once leadership has confirmed it', () => {
    const f = fresh();
    openRound(f);
    expect(f.as('employee').consultation.room()!.vision).toBeNull();
    f.store.visionStatements.push({ orgId: f.store.organisation.id, id: 'vs-x' as never, planId: 'plan-2027' as never, kind: 'vision', text: 'Safe, reliable services for every household', confirmation: { at: '2026-10-17T10:00:00+02:00' as never, byMembershipId: 'm-md' as never }, created: f.store.plans[0]!.created, updated: f.store.plans[0]!.created });
    expect(f.as('employee').consultation.room()!.vision!.vision).toBe('Safe, reliable services for every household');
  });
});

describe('the baseline register', () => {
  it('owners see their own measures; leadership and the Strategy office see all; others a count only', () => {
    const f = fresh();
    expect(f.as('strategy').consultation.baselines()!.rows).toHaveLength(6);
    expect(f.as('executive').consultation.baselines()!.rows).toHaveLength(6);
    const fin = f.as('finance').consultation.baselines()!;
    expect(fin.rows.map((r) => r.name)).toEqual(['Collection efficiency']);
    expect([fin.hidden, fin.rows[0]!.mine, fin.rows[0]!.canDecide, fin.rows[0]!.canValidate]).toEqual([5, true, true, false]);
    expect(f.repoFor(HOO).consultation.baselines()!.rows.map((r) => r.name)).toEqual(['Supply hours per day', 'Sanitation coverage']);
    const emp = f.as('employee').consultation.baselines()!;
    expect([emp.rows.length, emp.hidden]).toEqual([0, 6]);
  });
  it('the owner confirms an AI draft; the Strategy office then validates it; the AI never validates', () => {
    const f = fresh();
    const so = f.as('strategy').consultation;
    expect(so.validateBaseline('bm-2027-3')).toEqual({ ok: false, error: 'not_ready' }); // awaiting Finance
    expect(f.as('finance').consultation.decideBaseline('bm-2027-3', 'accept')).toEqual({ ok: true });
    expect(f.as('finance').consultation.validateBaseline('bm-2027-3')).toEqual({ ok: false, error: 'not_allowed' });
    expect(so.validateBaseline('bm-2027-3')).toEqual({ ok: true });
    const row = so.baselines()!.rows.find((r) => r.id === 'bm-2027-3')!;
    expect([row.state, row.confirmed?.by, row.validated?.by]).toEqual(['validated', 'Ruth Phiri', 'Bwalya Musonda']);
    expect(so.validateBaseline('bm-2027-3')).toEqual({ ok: false, error: 'locked' });
    expect(f.store.auditEntries.filter((a) => a.entity.id === 'bm-2027-3').map((a) => a.action)).toEqual(['update', 'validate']);
    expect(f.as('finance').consultation.decideBaseline('bm-2027-2', 'accept')).toEqual({ ok: false, error: 'not_allowed' }); // Operations’ measure
  });
  it('a corrected value is accepted as corrected, and a changed validated value must be validated again', () => {
    const f = fresh();
    const fin = f.as('finance').consultation;
    expect(fin.correctBaseline('bm-2027-3', { name: 'Collection efficiency', unit: '%', value: 79, asOf: d('2026-09-30'), source: 'Finance revenue report, Q3 2026' })).toEqual({ ok: true });
    expect(fin.baselines()!.rows[0]!.state).toBe('confirmed');
    f.as('strategy').consultation.validateBaseline('bm-2027-3');
    fin.correctBaseline('bm-2027-3', { name: 'Collection efficiency', unit: '%', value: 80, asOf: d('2026-10-15'), source: 'Finance revenue report, October 2026' });
    const b = f.store.baselineMeasures.find((x) => x.id === 'bm-2027-3')!;
    expect([b.value, b.validated]).toEqual([80, null]);
    expect(fin.correctBaseline('bm-2027-3', { name: '', unit: '%', value: 80, asOf: d('2026-10-15'), source: '' })).toEqual({ ok: false, error: 'required' });
  });
  it('a rejected draft leaves the register and its counts', () => {
    const f = fresh();
    expect(f.as('strategy').consultation.baselines()!.counts.total).toBe(6);
    f.as('strategy').consultation.decideBaseline('bm-2027-5', 'reject');
    expect(f.as('strategy').consultation.baselines()!.counts).toEqual({ total: 5, awaiting: 2, confirmed: 3, validated: 0 });
  });
  it('the Strategy office sets owners; a department head adds measures only for the units they answer for', () => {
    const f = fresh();
    expect(f.as('finance').consultation.setBaselineOwner('bm-2027-6', 'u-fin')).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('strategy').consultation.setBaselineOwner('bm-2027-6', 'u-fin')).toEqual({ ok: true });
    expect(f.as('finance').consultation.baselines()!.rows.map((r) => r.name)).toContain('Staff with signed contracts');
    const add = (unit: string) => f.as('finance').consultation.addBaseline({ name: 'Days to pay suppliers', unit: 'days', value: 45, asOf: d('2026-09-30'), source: 'Payables ledger', ownerUnitId: unit });
    expect(add('u-ops')).toEqual({ ok: false, error: 'not_allowed' });
    const r = add('u-fin');
    expect(r.ok).toBe(true);
    expect(f.as('finance').consultation.baselines()!.rows.find((x) => x.name === 'Days to pay suppliers')!.state).toBe('confirmed');
  });
  it('drafts from a document are tied to their page, start with no owner and are logged', async () => {
    const f = fresh();
    expect(await f.as('finance').consultation.draftBaselines('sd-2027-3')).toEqual({ ok: false, error: 'not_allowed' });
    const r = await f.as('strategy').consultation.draftBaselines('sd-2027-3');
    expect(r).toEqual({ ok: true, added: SAMPLE_BASELINE_DRAFT.measures.length, sameForAnyFile: true });
    const made = f.store.baselineMeasures.slice(-3);
    expect(made.every((b) => b.ownerUnitId === null && b.draft.state === 'ai_draft' && b.draft.provenance.kind === 'document')).toBe(true);
    expect(last(f.store.aiTasks).outputRefs.map((x) => x.id)).toEqual(made.map((b) => b.id));
    expect(f.as('strategy').home().needsYou.some((n) => n.key.startsWith('baseline:office'))).toBe(false); // not until Consultation opens
  });
  it('imports from a spreadsheet, adding good rows and reporting the rest with reasons', () => {
    const f = fresh();
    const r = f.as('strategy').consultation.importBaselines([
      ['Measure', 'Unit', 'Value', 'As of', 'Source', 'Owner unit'],
      ['Average days to connect', 'days', '12', '2026-09-30', 'Connections log', 'Operations'],
      ['Debt days', 'days', '1,240', '', 'Ledger', 'finance'],
      ['', '%', '5', '', '', ''],
      ['Bad value', '%', 'high', '2026-13-40', '', 'Marketing'],
      ['', '', '', '', '', ''],
    ]);
    if (!r.ok) throw new Error();
    expect(r.added).toBe(2);
    expect(r.problems.map((p) => [p.row, p.problems])).toEqual([[4, ['no_name']], [5, ['bad_value', 'bad_date', 'unknown_unit']]]);
    const added = f.store.baselineMeasures.slice(-2);
    expect(added.map((b) => [b.value, b.asOf, b.ownerUnitId, b.draft.state])).toEqual([[12, '2026-09-30', 'u-ops', 'human'], [1240, NOW, 'u-fin', 'human']]);
  });
  it('“Needs you”: owners check theirs, the Strategy office checks those with no owner or a vacant one and validates confirmed ones', () => {
    const f = fresh();
    openStage(f, 'consultation');
    expect(f.as('finance').home().needsYou.map((n) => n.title)).toContain('Check 1 baseline for Finance');
    expect(f.repoFor(HOO).home().needsYou.some((n) => n.key.startsWith('baseline:check'))).toBe(false); // Operations confirmed both
    const so = f.as('strategy').home().needsYou.map((n) => n.title);
    expect(so).toContain('Check 2 AI-drafted baselines with no owner or a vacant owner'); // Commercial's head is vacant (H2)
    expect(so).toContain('Validate 3 baselines confirmed by their owners');
  });
});

describe('the compliance register', () => {
  it('is seen by all members; only the compliance officer reviews, and every review is stamped', () => {
    const f = fresh();
    expect(f.as('employee').consultation.compliance()!.items).toHaveLength(6);
    expect(f.as('strategy').consultation.reviewCompliance('ci-2027-1', 'aligned')).toEqual({ ok: false, error: 'not_allowed' });
    const co = f.as('compliance').consultation;
    expect(co.reviewCompliance('ci-2027-4', 'needs_change')).toEqual({ ok: true });
    const item = co.compliance()!.items.find((c) => c.id === 'ci-2027-4')!;
    expect([item.outcome, item.reviewed?.by]).toEqual(['needs_change', 'Lillian Siame']);
    expect(co.compliance()!.counts).toMatchObject({ total: 6, reviewed: 1, needsChange: 1 });
  });
  it('department heads mark obligations for their own department, which makes them its owners', () => {
    const f = fresh();
    const fin = f.as('finance').consultation;
    expect(fin.compliance()!.items[0]!.canFlag.map((x) => x.name)).toEqual(['Finance']);
    expect(fin.flagCompliance('ci-2027-3', 'u-ops', true)).toEqual({ ok: false, error: 'not_allowed' });
    expect(fin.flagCompliance('ci-2027-3', 'u-fin', true)).toEqual({ ok: true });
    expect(f.as('finance').consultation.compliance()!.items.find((c) => c.id === 'ci-2027-3')!.flaggedBy.map((u) => u.name)).toEqual(['Finance']);
    expect(can(f.store, resolveViewer(f.store, 'm-hof', NOW, 2026), 'draft', { type: 'ComplianceItem', id: 'ci-2027-3' })).toBe(true);
    expect(f.as('employee').consultation.flagCompliance('ci-2027-3', 'u-com', true)).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('strategy').consultation.compliance()!.items[0]!.canFlag).toHaveLength(3); // the Strategy office may mark for any department
  });
  it('the compliance officer adds what the documents don’t cover; it shows who added it', () => {
    const f = fresh();
    expect(f.as('finance').consultation.addCompliance({ title: 'x', kind: 'law' })).toEqual({ ok: false, error: 'not_allowed' });
    const co = f.as('compliance').consultation;
    expect(co.addCompliance({ title: 'Environmental management requirements', kind: 'law' }).ok).toBe(true);
    expect(last(co.compliance()!.items).source).toBe('Added by Legal and Compliance Officer');
    expect(co.compliance()!.items.find((c) => c.id === 'ci-2027-1')!.source).toBe('Water Supply Licence, page 3');
  });
  it('obligations are read only from laws, regulations, licences, policies and standards', async () => {
    const f = fresh();
    const co = f.as('compliance').consultation;
    expect(co.compliance()!.documents.map((x) => x.title)).toEqual(['Water Supply Licence', 'Regulatory notice: tariff review 2028']);
    expect(await co.draftCompliance('sd-2027-2')).toEqual({ ok: false, error: 'not_source' });
    expect(await co.draftCompliance('sd-2027-4')).toEqual({ ok: true, added: SAMPLE_COMPLIANCE_DRAFT.items.length, sameForAnyFile: true });
    expect(f.store.complianceItems.slice(-3).every((c) => c.provenance.kind === 'document' && c.outcome === null)).toBe(true);
    expect(last(f.store.aiTasks).kind).toBe('extract');
  });
  it('changing an item’s wording means it is reviewed again', () => {
    const f = fresh();
    const co = f.as('compliance').consultation;
    co.reviewCompliance('ci-2027-2', 'aligned');
    expect(co.editCompliance('ci-2027-2', { title: 'Maintain drinking water quality to the national standard at all times', kind: 'licence_condition' })).toEqual({ ok: true });
    expect(f.store.complianceItems.find((c) => c.id === 'ci-2027-2')).toMatchObject({ outcome: null, reviewed: null });
  });
  it('reaches the compliance officer’s “Needs you” once Confirmation opens', () => {
    const f = fresh();
    expect(f.as('compliance').home().needsYou.some((n) => n.key.startsWith('compliance:'))).toBe(false);
    openStage(f, 'confirmation');
    expect(f.as('compliance').home().needsYou.map((n) => n.title)).toContain('Review 6 compliance items');
    expect(f.as('compliance').workspaces()).toContain('strategy');
  });
});

describe('every organisation and role', () => {
  it('computes the room and both registers without error, and shows no names with what people send', () => {
    for (const org of createReviewOrgs()) {
      for (const role of ALL_DEV_ROLES) {
        const m = devMembership(org, role, NOW);
        if (!m) continue;
        const repo = createMemoryRepository([org.store], org.orgId, m, NOW);
        const room = repo.consultation.room();
        repo.consultation.baselines();
        repo.consultation.compliance();
        for (const i of room?.inputs ?? []) expect(Object.keys(i)).not.toContain('author');
      }
    }
  });
});
