/**
 * Organisation setup through the data-access layer (slice 7): permissions, the draft, confirmation, editing after
 * confirmation and removal. Uses the review build's organisations, so Sample New Organisation is included.
 */
import type { ISODate } from '../../contract/caspa-data-contract';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { SAMPLE_TEMPLATE_ROWS } from '../sample/new-org';
import { createMemoryRepository } from './repository';
import { withHeader } from './setup/import';
import { parseCsv, readXlsx, toCsv, writeXlsx } from './setup/files';
import { createSampleOrgs, DEV_ROLES } from '../sample/all';

const NOW = '2026-10-18' as ISODate;
const fresh = () => {
  const orgs = createReviewOrgs();
  const as = (orgId: string, role: Parameters<typeof devMembership>[1]) => {
    const org = orgs.find((o) => o.orgId === orgId)! as ReviewOrg;
    const m = devMembership(org, role, NOW);
    if (!m) throw new Error(`no ${role} in ${orgId}`);
    return createMemoryRepository(orgs.map((o) => o.store), orgId, m, NOW);
  };
  return { orgs, as, store: (id: string) => orgs.find((o) => o.orgId === id)!.store };
};
const NEW = 'org-new';
const SWU = 'org-sample-water';

describe('Sample New Organisation, before confirmation', () => {
  it('the administrator sets up; nobody else can reach the draft', () => {
    const { as } = fresh();
    const page = as(NEW, 'admin').structure.page();
    expect(page.mode).toBe('setup');
    expect(page.structure.people.map((p) => p.fullName)).toEqual(['Ireen Sakala', 'Chipo Ngoma']);
    // Ireen holds no position yet, so the checks say so and she cannot confirm yet.
    expect(page.canConfirm).toBe(false);
    expect(page.checks.must.map((g) => g.kind)).toEqual(['no_executive', 'no_staff_admin']);
  });

  it('spreadsheet route: two rows need attention, one email must be fixed, then the administrator confirms', () => {
    const { as, store } = fresh();
    const admin = as(NEW, 'admin').structure;
    expect(admin.importSheet(withHeader(SAMPLE_TEMPLATE_ROWS))).toEqual({ ok: true, problems: 2 });
    let page = admin.page();
    expect(page.sheet).toEqual({ rows: 12, units: 7, positions: 12, holders: 10 });
    expect(page.canConfirm).toBe(true);
    expect(page.checks.must.map((g) => [g.kind, g.items.length])).toEqual([['same_email', 1]]);
    expect(admin.confirm()).toEqual({ ok: false, error: 'not_ready', must: 1 });

    // Fix the row problems and the email.
    const st = page.structure;
    const lweendo = page.rowProblems.find((r) => r.kind === 'reports_unmatched')!;
    const southSup = st.positions.find((p) => p.title === 'Regional Supervisor' && st.units.find((u) => u.id === p.unitId)!.name === 'South')!;
    expect(admin.fixRowReports(lweendo.positionId, southSup.id)).toEqual({ ok: true });
    const vacant = page.rowProblems.find((r) => r.kind === 'roles_on_vacant')!;
    expect(admin.dropVacantRoles(vacant.positionId)).toEqual({ ok: true });
    const brian = st.people.find((p) => p.fullName === 'Brian Mumba')!;
    expect(admin.savePerson(brian.id, { email: 'b.mumba@sample-new.example' })).toEqual({ ok: true });
    page = admin.page();
    expect(page.checks.must).toEqual([]);
    expect(page.rowProblems.every((r) => r.done)).toBe(true);
    expect(page.checks.worth.map((g) => g.kind)).toEqual(['empty_unit', 'no_unit_type', 'no_email']);

    expect(admin.markChecked('no_email', '  ')).toEqual({ ok: false, error: 'reason_required' });
    expect(admin.markChecked('no_email', 'Kelvin Daka has no work email yet')).toEqual({ ok: true });
    expect(admin.confirm()).toEqual({ ok: true });

    const s = store(NEW);
    expect(s.units).toHaveLength(7);
    expect(s.positions).toHaveLength(12);
    expect(s.assignments).toHaveLength(10);
    expect(s.assignments.find((a) => a.personId === s.people.find((p) => p.fullName === 'Lweendo Hamoonga')!.id)!.kind).toBe('acting');
    // Ireen keeps her own person record and now holds a position.
    expect(s.assignments.some((a) => a.personId === 'p-new-is')).toBe(true);
    const entry = s.auditEntries.find((e) => e.action === 'confirm')!;
    expect(entry.entity).toEqual({ type: 'Organisation', id: NEW });
    expect(entry.after).toMatchObject({ units: 7, positions: 12, checked: [
      { kind: 'empty_unit', count: 1, reason: null }, { kind: 'no_unit_type', count: 1, reason: null },
      { kind: 'no_email', count: 1, reason: 'Kelvin Daka has no work email yet' },
    ] });

    // The Executive is told: it appears on their Home as information.
    const exec = as(NEW, 'executive');
    expect(exec.viewer.roles).toContain('executive');
    expect(exec.structureConfirmed()).toEqual({ by: 'Ireen Sakala', on: '2026-10-18' });
    const view = exec.structure.page();
    expect(view.mode).toBe('structure');
    expect(view.structure.people.every((p) => p.email === null)).toBe(true); // emails: administrators only
    expect(view.structure.people.every((p) => p.roles.length === 0)).toBe(true); // roles: administrators only
    expect([view.endsOn, view.executives, view.staffAdmin]).toEqual([{}, [], null]);
    expect(view.checks.must).toEqual([]);
    // Supervisors and employees follow from the structure.
    expect(as(NEW, 'supervisor').viewer.isSupervisor).toBe(true);
    expect(as(NEW, 'employee').viewer.positionIds).toHaveLength(1);
  });

  it('a consultant builds the draft but cannot confirm it', () => {
    const { as } = fresh();
    const c = as(NEW, 'consultant').structure;
    expect(c.importSheet(withHeader(SAMPLE_TEMPLATE_ROWS)).ok).toBe(true);
    const page = c.page();
    expect(page.canConfirm).toBe(false);
    expect(page.staffAdmin).toBe('Ireen Sakala');
    expect(c.confirm()).toMatchObject({ ok: false });
  });

  it('organogram route: every item is an AI draft until accepted; the administrator merges with her twin', async () => {
    const { as, store } = fresh();
    const admin = as(NEW, 'admin').structure;
    await admin.draftFromOrganogram('organogram.pdf');
    const s = store(NEW);
    expect(s.sourceDocuments).toMatchObject([{ kind: 'other', title: 'organogram.pdf' }]);
    expect(s.aiTasks).toMatchObject([{ kind: 'extract' }]);
    let page = admin.page();
    expect(page.ai).toEqual({ fileName: 'organogram.pdf', page: 1 });
    const must = Object.fromEntries(page.checks.must.map((g) => [g.kind, g.items]));
    expect(must.ai_pending![0]!.ids).toHaveLength(18);
    expect(must.no_executive).toHaveLength(1);
    const merge = must.no_staff_admin![0]!.merge!;
    expect(merge.keepPersonId).toBe('p-new-is');
    expect(admin.mergePeople(merge.keepPersonId, merge.dropPersonId)).toEqual({ ok: true });
    page = admin.page();
    expect(page.checks.must.map((g) => g.kind)).toEqual(['ai_pending', 'no_executive']);
    // Correct the misread line: the Accountant reports to the Finance Manager.
    const acc = page.structure.positions.find((p) => p.title === 'Accountant')!;
    const fm = page.structure.positions.find((p) => p.title === 'Finance Manager')!;
    expect(admin.savePosition(acc.id, { title: acc.title, unitId: acc.unitId, reportsToId: fm.id, ref: null, holder: { personId: acc.holder!.personId, name: '', acting: false } })).toEqual({ ok: true });
    for (const x of [...page.structure.units, ...page.structure.positions]) admin.accept(x.id);
    const ceo = page.structure.positions.find((p) => p.title === 'Chief Executive Officer')!;
    admin.savePerson(ceo.holder!.personId, { roles: ['executive'] });
    page = admin.page();
    expect(page.checks.must).toEqual([]);
    expect(admin.confirm()).toEqual({ ok: true });
  });

  it('refuses a loop in the draft and replaces only the draft on a second import', () => {
    const { as, store } = fresh();
    const admin = as(NEW, 'admin').structure;
    admin.importSheet(withHeader(SAMPLE_TEMPLATE_ROWS));
    const st = admin.page().structure;
    const ceo = st.positions.find((p) => p.title === 'Chief Executive Officer')!;
    const it = st.positions.find((p) => p.title === 'IT Officer')!;
    expect(admin.savePosition(ceo.id, { title: ceo.title, unitId: ceo.unitId, reportsToId: it.id, ref: null, holder: null })).toMatchObject({ ok: false, error: 'loop' });
    admin.importSheet(withHeader(SAMPLE_TEMPLATE_ROWS.slice(0, 3)));
    expect(admin.page().structure.positions).toHaveLength(3);
    expect(store(NEW).positions).toHaveLength(0);
  });

  it('only the administrator may change anything', () => {
    const { as } = fresh();
    const exec = as(SWU, 'executive').structure;
    expect(exec.page().isAdmin).toBe(false);
    expect(exec.addUnit({ name: 'X', unitType: 'Y', parentId: 'u-org' })).toEqual({ ok: false, error: 'not_allowed' });
    expect(exec.savePerson('p-md', { email: 'x@example.test' })).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('Sample Water Utility, after confirmation (D7-10)', () => {
  it('was confirmed by Natasha Kabwe on 15 January 2026, and the administrator sees emails', () => {
    const { as } = fresh();
    const page = as(SWU, 'admin').structure.page();
    expect(page.mode).toBe('structure');
    expect(page.confirmed).toEqual({ by: 'Natasha Kabwe', on: '2026-01-15' });
    expect(page.locked).toBe(true);
    expect(page.structure.people.find((p) => p.id === 'p-md')!.email).toBe('md@sample-water.example');
    expect(page.checks.must).toEqual([]);
  });

  it('refuses a reporting loop: the Managing Director cannot report to the Commercial Officer', () => {
    const { as } = fresh();
    const a = as(SWU, 'admin').structure;
    expect(a.savePosition('pos-md', { title: 'Managing Director', unitId: 'u-org', reportsToId: 'pos-co', ref: null, holder: { personId: 'p-md', name: '', acting: false } }))
      .toMatchObject({ ok: false, error: 'loop' });
  });

  it('refuses a change that adds a must-fix problem, such as taking away the only Executive', () => {
    const { as } = fresh();
    expect(as(SWU, 'admin').structure.savePerson('p-md', { roles: [] })).toMatchObject({ ok: false, error: 'must_fix', items: [{ kind: 'no_executive' }] });
  });

  it('saves changes straight to the records, each with an audit entry', () => {
    const { as, store } = fresh();
    const a = as(SWU, 'admin').structure;
    const s = store(SWU);
    const audits = s.auditEntries.length;
    const added = a.addPosition({ title: 'Meter Reader, Zone D', unitId: 'u-com', reportsToId: 'pos-co', ref: null, holder: { personId: null, name: 'Ruth Banda', acting: true } });
    expect(added.ok).toBe(true);
    const id = (added as { id: string }).id;
    expect(s.positions.find((p) => p.id === id)!.reportsToPositionId).toBe('pos-co');
    expect(s.auditEntries.slice(audits).map((e) => [e.action, e.entity.type])).toEqual([
      ['create', 'Position'], ['create', 'Person'], ['create', 'Membership'], ['create', 'PositionAssignment'],
    ]);
    // The holder leaves: the assignment ends and the position stays vacant.
    expect(a.savePosition(id, { title: 'Meter Reader, Zone D', unitId: 'u-com', reportsToId: 'pos-co', ref: null, holder: null })).toEqual({ ok: true });
    expect(s.assignments.find((x) => x.positionId === id)!.to).toBe('2026-10-17'); // held until yesterday, vacant from today
    expect(a.page().structure.positions.find((p) => p.id === id)!.holder).toBeNull();
    expect(a.page().changes[0]).toMatchObject({ action: 'update', type: 'PositionAssignment' });
    // Nothing reports to it and it owns nothing, so it can be removed.
    expect(a.remove('position', id)).toEqual({ ok: true });
    expect(s.positions.some((p) => p.id === id)).toBe(false);
  });

  it('blocks removal until what is held has moved', () => {
    const { as } = fresh();
    const a = as(SWU, 'admin').structure;
    expect(a.remove('position', 'pos-hoo')).toMatchObject({ ok: false, error: 'blocked' });
    expect(a.remove('unit', 'u-com')).toMatchObject({ ok: false, error: 'blocked' });
  });

  it('keeps currency and year start fixed after confirmation, and records settings changes', () => {
    const { as, store } = fresh();
    const a = as(SWU, 'admin').structure;
    const d = a.page().details;
    expect(a.saveDetails({ ...d, baseCurrency: 'USD', financialYearStartMonth: 7, settings: { ...d.settings, overdueEscalationDays: 10 } })).toEqual({ ok: true });
    const o = store(SWU).organisation;
    expect([o.baseCurrency, o.financialYearStartMonth, o.settings.overdueEscalationDays, o.settings.ratingSchemeId]).toEqual(['ZMW', 1, 10, 'rs-a']);
    expect(store(SWU).auditEntries[store(SWU).auditEntries.length - 1]!.action).toBe('settings');
  });
});

describe('the four existing organisations', () => {
  it.each(createSampleOrgs().map((o) => [o.store.organisation.name, o] as const))('%s is confirmed, by an administrator on its own staff, with nothing to fix', (_n, org) => {
    const stores = createSampleOrgs().map((o) => o.store);
    const admin = createMemoryRepository(stores, org.orgId, org.devRoles.admin, NOW);
    expect(admin.viewer.roles).toContain('org_admin');
    expect(admin.viewer.positionIds.length).toBeGreaterThan(0);
    const page = admin.structure.page();
    expect(page.mode).toBe('structure');
    expect(page.checks.must).toEqual([]);
    for (const role of DEV_ROLES) expect(createMemoryRepository(stores, org.orgId, org.devRoles[role], NOW).structureConfirmed()).not.toBeNull();
  });
});

describe('spreadsheet files (D7-12)', () => {
  it('reads CSV with quotes, commas and line breaks', () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n"x\ny",z\n')).toEqual([['a', 'b, c', 'd "e"'], ['x\ny', 'z']]);
    expect(parseCsv(toCsv([['1', 'a,b'], ['“›”', '']]))).toEqual([['1', 'a,b'], ['“›”', '']]);
  });
  it('writes an .xlsx and reads it back', async () => {
    const rows = withHeader(SAMPLE_TEMPLATE_ROWS);
    const bytes = writeXlsx([{ name: 'Positions', rows }, { name: 'Instructions', rows: [['x']] }]);
    const back = await readXlsx(bytes);
    expect(back).toEqual(rows);
    expect(back[1]![2]).toBe('Chief Executive Officer');
    expect(back[0]![4]).toBe('Holder’s full name');
  });
  it('reads a deflated .xlsx', async () => {
    // A minimal workbook compressed the way spreadsheet programs save it.
    const { zip } = await import('./setup/files');
    const enc = new TextEncoder();
    const deflate = async (t: string) => new Uint8Array(await new Response(new Blob([enc.encode(t)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const files = [
      { name: 'xl/workbook.xml', text: '<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: 'xl/sharedStrings.xml', text: '<sst><si><t>Unit path</t></si><si><r><t>Head </t></r><r><t>office</t></r></si></sst>' },
      { name: 'xl/worksheets/sheet1.xml', text: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><v>42</v></c></row></sheetData></worksheet>' },
    ];
    // Build a zip whose entries are deflated by swapping in compressed data and method 8.
    const plain = zip(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
    expect((await readXlsx(plain))[1]).toEqual(['Head office', '', '42']);
    const deflated = await Promise.all(files.map(async (f) => ({ name: f.name, raw: enc.encode(f.text), data: await deflate(f.text) })));
    const z = zip(deflated.map((f) => ({ name: f.name, data: f.data })));
    // Patch method, CRC and uncompressed size in local and central headers.
    const v = new DataView(z.buffer);
    let p = 0;
    for (const f of deflated) {
      v.setUint16(p + 8, 8, true);
      v.setUint32(p + 22, f.raw.length, true);
      p += 30 + new TextEncoder().encode(f.name).length + f.data.length;
    }
    for (const f of deflated) {
      v.setUint16(p + 10, 8, true);
      v.setUint32(p + 24, f.raw.length, true);
      p += 46 + new TextEncoder().encode(f.name).length;
    }
    expect((await readXlsx(z))[1]).toEqual(['Head office', '', '42']);
  });
});

describe('about 5,000 positions through the data-access layer (D7-14)', () => {
  it('imports, confirms, and then reads and edits the confirmed structure within time limits', async () => {
    const { largeStructureRows } = await import('../sample/scale');
    const { as, store } = fresh();
    const admin = as(NEW, 'admin').structure;
    let t0 = performance.now();
    admin.importSheet(withHeader(largeStructureRows()));
    let page = admin.page();
    expect(performance.now() - t0).toBeLessThan(2000);
    for (const item of page.checks.must.flatMap((g) => g.items)) admin.savePerson(item.ids[1]!, { email: null });
    expect(admin.page().checks.must).toEqual([]);
    expect(admin.confirm()).toEqual({ ok: true });
    const s = store(NEW);
    expect(s.positions.length).toBeGreaterThan(4900);

    const after = as(NEW, 'admin').structure;
    t0 = performance.now();
    page = after.page();
    expect(performance.now() - t0).toBeLessThan(2000);
    const p = page.structure.positions.find((x) => x.title === 'Officer')!;
    t0 = performance.now();
    expect(after.savePosition(p.id, { title: 'Senior Officer', unitId: p.unitId, reportsToId: p.reportsToId, ref: null, holder: p.holder ? { personId: p.holder.personId, name: '', acting: false } : null })).toEqual({ ok: true });
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('what non-administrators receive (D7-5, Membership row)', () => {
  it.each(['executive', 'strategy', 'finance', 'hr', 'supervisor', 'employee'] as const)('%s at Sample Water Utility gets no emails, roles or end dates', (role) => {
    const { as } = fresh();
    const r = as(SWU, role);
    if (r.viewer.roles.includes('org_admin')) return; // the HR Manager also administers here
    const page = r.structure.page();
    expect(page.mode).toBe('structure');
    expect(page.structure.people.some((p) => p.email !== null || p.roles.length > 0)).toBe(false);
    expect(page.endsOn).toEqual({});
    expect(page.checks).toEqual({ must: [], worth: [] });
    expect(r.structure.removalBlockers('position', 'pos-hoo')).toEqual([]);
    expect(page.structure.positions).toHaveLength(12); // the structure itself stays visible to all members
  });
});

describe('who sees the structure, as the organisation sets it (v1.5)', () => {
  const limited = (others: 'answers_for' | 'own_line') => {
    const f = fresh();
    const admin = f.as(SWU, 'admin').structure;
    const d = admin.page().details;
    expect(admin.saveDetails({ ...d, settings: { ...d.settings, structureView: { fullViewRoles: ['executive', 'strategy_office', 'hr'], others } } })).toEqual({ ok: true });
    return f;
  };

  it('an employee sees their own line, with who answers for each unit in it', () => {
    const { as } = limited('own_line');
    const page = as(SWU, 'employee').structure.page();
    expect(page.scoped).toBe(true);
    expect(page.structure.positions.map((p) => p.id).sort()).toEqual(['pos-cm', 'pos-co', 'pos-hoc', 'pos-md', 'pos-mrb']);
    expect(page.structure.units.map((u) => u.id).sort()).toEqual(['u-com', 'u-org', 'u-zone-b']);
    expect(page.answers['u-com']).toMatchObject({ title: 'Head of Commercial', holder: 'Grace Zulu' });
    expect(page.answers['u-fin']).toBeUndefined();
  });

  it('a ticked role, and the administrator, still see the whole structure', () => {
    const { as } = limited('own_line');
    for (const role of ['executive', 'strategy', 'admin'] as const) {
      const page = as(SWU, role).structure.page();
      expect([role, page.scoped, page.structure.positions.length]).toEqual([role, false, 12]);
    }
    // Finance is not ticked here, so the Head of Finance sees their own line.
    expect(as(SWU, 'finance').structure.page().structure.positions.map((p) => p.id).sort()).toEqual(['pos-hof', 'pos-md']);
  });

  it('is enforced in the permission check too, and leaves record pages alone', async () => {
    const { can } = await import('./permissions');
    const f = limited('own_line');
    const repo = f.as(SWU, 'employee');
    const s = f.store(SWU);
    expect(can(s, repo.viewer, 'view', { type: 'Position', id: 'pos-co' })).toBe(true);
    expect(can(s, repo.viewer, 'view', { type: 'Position', id: 'pos-hoo' })).toBe(true); // the record row is unchanged
    expect((await import('./permissions')).can(s, repo.viewer, 'view', { type: 'OrganisationStructure', id: 'pos-hoo' } as never)).toBe(false);
    // Who owns a record stays on the record's page, even outside the person's part of the structure.
    const a = s.activities.find((x) => x.code === 'A1.2.1.1')!;
    expect(repo.node('activity', a.id)?.owner).toMatchObject({ position: 'Head of Operations', person: 'Joseph Tembo' });
  });

  it('managers see the units they answer for', () => {
    const { as } = limited('answers_for');
    // In this sample the Supervisor answers for no unit, so sees their own line.
    expect(as(SWU, 'supervisor').structure.page().structure.positions.map((p) => p.id).sort()).toEqual(['pos-bc', 'pos-cm', 'pos-co', 'pos-hoc', 'pos-md']);
  });

  it('records the change of setting', () => {
    const f = limited('answers_for');
    const last = f.store(SWU).auditEntries[f.store(SWU).auditEntries.length - 1]!;
    expect([last.action, (last.after as { settings: { structureView: { others: string } } }).settings.structureView.others]).toEqual(['settings', 'answers_for']);
  });
});
