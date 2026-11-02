/** v0.16.0 (BUILD-BRIEF section 36, D16-1 to D16-11): communication records, versions, meetings, "Needs you" and access. */
import type { ISODate } from '../../contract/caspa-data-contract';
import { communicationPlans, firstAudience, goalsNeedingRecord, recordStatus } from '../../rules/communication';
import { workspacesFor } from '../../selectors/nav';
import { createReviewOrgs, devMembership, type ReviewOrg } from '../sample/review';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const SWU = 'org-sample-water';
type Role = Parameters<typeof devMembership>[1];

const fresh = () => {
  const orgs = createReviewOrgs();
  const org = orgs.find((o) => o.orgId === SWU)! as ReviewOrg;
  const stores = orgs.map((o) => o.store);
  return {
    store: org.store,
    as: (role: Role) => createMemoryRepository(stores, SWU, devMembership(org, role, NOW)!, NOW),
    by: (membershipId: string) => createMemoryRepository(stores, SWU, membershipId, NOW),
  };
};
const fields = { what: 'We will widen supply.', why: 'This is what the 4Q review found.', how: 'Departments plan the yearly work.' };

describe('which goals can have a record (D16-3, D16-4)', () => {
  it('lists the active imported plan with its four goals, and not the plan still in Conception', () => {
    const f = fresh();
    expect(communicationPlans(f.store).map((p) => p.id)).toEqual(['plan-2022']);
    const page = f.as('employee').communication.page();
    expect(page.plans).toHaveLength(1);
    expect(page.plans[0]!.goals.map((g) => g.code)).toEqual(['G1', 'G2', 'G3', 'G4']);
    expect(page.plans[0]).toMatchObject({ complete: 1, period: 'FY2022–FY2026' });
  });
  it('shows G1 as complete and the rest as "No context yet" (D16-9: status, not a check)', () => {
    const f = fresh();
    const g = f.as('employee').communication.page().plans[0]!.goals;
    expect(g.map((x) => x.status)).toEqual(['complete', 'no_context', 'no_context', 'no_context']);
    expect(recordStatus(null)).toBe('no_context');
  });
});

describe('the seeded G1 record (D16-11, wording approved)', () => {
  it('reads in the approved wording, with the meeting on 15 October 2026 shown as Commercial', () => {
    const g = fresh().as('employee').communication.goal('g1')!;
    expect(g.record).toMatchObject({
      what: 'We will improve financial sustainability over FY2022–FY2026.',
      why: 'This is what the 4Q review found.',
      how: 'Each department turns this goal into yearly activities, budgets and individual objectives in CASPA™.',
    });
    expect(g.meetings).toEqual([{ unit: 'Commercial', heldOn: '2026-10-15', feedbackSummary: 'Meter readers asked how the new targets affect their routes' }]);
  });
  it('gives each reader their own version first, with the others one tap away (D16-7)', () => {
    const f = fresh();
    expect(f.as('executive').communication.goal('g1')!.firstAudience).toBe('board');
    expect(f.as('supervisor').communication.goal('g1')!.firstAudience).toBe('managers');
    expect(f.as('employee').communication.goal('g1')!.firstAudience).toBe('staff');
    expect(f.as('employee').communication.goal('g1')!.versions.map((v) => v.audience)).toEqual(['board', 'managers', 'staff']);
    expect(firstAudience({ roles: [], isSupervisor: false, headsDepartment: true })).toBe('managers');
    const staff = f.as('employee').communication.goal('g1')!.versions.find((v) => v.audience === 'staff')!;
    expect(staff.text).toBe('What is changing: We will improve financial sustainability over FY2022–FY2026. Why it matters: This is what the 4Q review found. What it means for you: your objectives will show how your work connects to this goal.');
  });
  it('shows the linked 4Q points live: text for the Executive, a count for staff (D16-6, point 10)', () => {
    const f = fresh();
    const ex = f.as('executive').communication.goal('g1')!;
    expect(ex.whyCardsVisible).toBe(true);
    expect(ex.whyCards[0]!.text).toBe('Billed revenue has not covered operating and maintenance costs.');
    const emp = f.as('employee').communication.goal('g1')!;
    expect(emp.whyCardsVisible).toBe(false);
    expect(emp.whyCards).toEqual([expect.objectContaining({ text: null })]);
    // Live, never copied: changing the card changes what the record shows.
    f.store.fourQEntries.find((e) => e.id === 'q-g1-1')!.text = 'Revenue fell short.';
    expect(f.as('executive').communication.goal('g1')!.whyCards[0]!.text).toBe('Revenue fell short.');
  });
  it('prints the accepted board version as a board paper', () => {
    const p = fresh().as('employee').communication.boardPaper('g1')!;
    expect(p.text).toMatch(/^What changes: We will improve financial sustainability/);
    expect(p.acceptedBy).toMatchObject({ by: 'Bwalya Musonda', on: '2026-10-12' });
  });
});

describe('who writes (D16-5, points 3 to 7)', () => {
  it('lets the Strategy office write a record only with all three parts, and the AI suggest them', async () => {
    const f = fresh();
    const so = f.as('strategy').communication;
    expect(so.save('g2', { ...fields, how: ' ' })).toEqual({ ok: false, error: 'required' });
    const s = await so.suggest('g2');
    expect(s).toEqual({ ok: true, fields: { what: 'We will provide reliable water supply over FY2022–FY2026.', why: 'This is what the 4Q review found.', how: expect.stringMatching(/^Each department/) } });
    expect(f.store.communicationRecords.some((r) => r.goalId === 'g2')).toBe(false); // nothing stored until saved
    expect(so.save('g2', fields)).toEqual({ ok: true });
    expect(so.goal('g2')!.status).toBe('complete');
    expect(f.store.auditEntries[f.store.auditEntries.length - 1]).toMatchObject({ action: 'create', entity: { type: 'CommunicationRecord' } });
  });
  it('lets the Executive read but not write, except as G4’s owner', () => {
    const ex = fresh().as('executive').communication;
    expect(ex.save('g2', fields)).toEqual({ ok: false, error: 'not_allowed' });
    expect(ex.goal('g4')!.can.write).toBe(true);
    expect(ex.save('g4', fields)).toEqual({ ok: true });
  });
  it('lets a goal’s owner write it, and keeps employees and Finance on other goals reading only', () => {
    const f = fresh();
    expect(f.by('m-hoo').communication.save('g3', fields)).toEqual({ ok: true });
    expect(f.as('employee').communication.save('g3', fields)).toEqual({ ok: false, error: 'not_allowed' });
    expect(f.as('finance').communication.goal('g1')!.can.write).toBe(true); // Head of Finance owns G1
    expect(f.as('finance').communication.save('g2', fields)).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('drafts versions on request; only the Strategy office or the owner edits and accepts; readers see accepted ones only', async () => {
    const f = fresh();
    const so = f.as('strategy').communication;
    expect(await so.draftVersions('g2')).toEqual({ ok: false, error: 'no_record' });
    so.save('g2', fields);
    expect(await so.draftVersions('g2')).toEqual({ ok: true });
    expect(so.goal('g2')!.versions.map((v) => v.state)).toEqual(['ai_draft', 'ai_draft', 'ai_draft']);
    expect(so.goal('g2')!.versions[0]!.text).toBe('What changes: We will widen supply. Why: This is what the 4Q review found. How it will be delivered: Departments plan the yearly work.');
    expect(f.as('employee').communication.goal('g2')!.versions).toEqual([]);
    expect(f.as('executive').communication.acceptVersion('g2', 'board')).toEqual({ ok: false, error: 'not_allowed' });
    expect(so.acceptVersion('g2', 'board')).toEqual({ ok: true });
    expect(so.editVersion('g2', 'staff', 'Plain words for staff.')).toEqual({ ok: true });
    expect(so.goal('g2')!.versions.map((v) => v.state)).toEqual(['accepted', 'ai_draft', 'edited']);
    expect(f.as('employee').communication.goal('g2')!.versions.map((v) => v.audience)).toEqual(['board']);
    // Drafting again replaces only what is not accepted.
    await so.draftVersions('g2');
    expect(so.goal('g2')!.versions.map((v) => v.state)).toEqual(['accepted', 'ai_draft', 'ai_draft']);
    expect(f.store.aiTasks.filter((t) => t.inputRefs.some((r) => r.id === 'g2'))).toHaveLength(2);
  });
});

describe('meetings (D16-8, point 6)', () => {
  it('lets a department head log meetings for their department and units within it, once a record exists', () => {
    const f = fresh();
    const hoo = f.by('m-hoo').communication;
    expect(hoo.goal('g1')!.can.logMeeting).toBe(true);
    expect(hoo.goal('g1')!.meetingUnits.map((u) => u.name)).toEqual(['Operations']);
    expect(hoo.logMeeting('g1', { unitId: 'u-com', heldOn: '2026-10-16', feedbackSummary: 'x' })).toEqual({ ok: false, error: 'unit' });
    expect(hoo.logMeeting('g1', { unitId: 'u-ops', heldOn: '2026-10-19', feedbackSummary: 'x' })).toEqual({ ok: false, error: 'date' });
    expect(hoo.logMeeting('g1', { unitId: 'u-ops', heldOn: '2026-10-16', feedbackSummary: ' ' })).toEqual({ ok: false, error: 'feedback' });
    expect(hoo.logMeeting('g1', { unitId: 'u-ops', heldOn: '2026-10-16', feedbackSummary: 'Crews asked about overtime.' })).toEqual({ ok: true });
    expect(hoo.goal('g1')!.meetings[0]).toMatchObject({ heldOn: '2026-10-16' });
    expect(hoo.logMeeting('g4', { unitId: 'u-ops', heldOn: '2026-10-16', feedbackSummary: 'x' })).toEqual({ ok: false, error: 'no_record' });
    // Department heads never write the three parts of a goal they do not own.
    expect(hoo.save('g1', fields)).toEqual({ ok: false, error: 'not_allowed' });
  });
  it('shows a small unit as the unit above it', () => {
    const f = fresh();
    expect(f.as('strategy').communication.logMeeting('g1', { unitId: 'u-zone-b', heldOn: '2026-10-17', feedbackSummary: 'Routes question.' })).toEqual({ ok: true });
    expect(f.as('employee').communication.goal('g1')!.meetings[0]).toMatchObject({ unit: 'Commercial', heldOn: '2026-10-17' });
  });
});

describe('"Needs you" and reaching the page (D16-10, point 4)', () => {
  it('asks the Strategy office for every goal without a record, and an owner for their own', () => {
    const f = fresh();
    expect(goalsNeedingRecord(f.store).map((g) => g.code)).toEqual(['G2', 'G3', 'G4']);
    const items = (r: ReturnType<typeof f.as>) => r.home().needsYou.filter((i) => i.key.startsWith('communication:')).map((i) => i.title);
    expect(items(f.as('strategy'))).toEqual(['Write the communication record for G2 Provide reliable water supply', 'Write the communication record for G3 Expand access to sanitation', 'Write the communication record for G4 Strengthen institutional capacity']);
    expect(items(f.as('executive'))).toEqual(['Write the communication record for G4 Strengthen institutional capacity']);
    expect(items(f.by('m-hoo'))).toHaveLength(2);
    expect(items(f.as('employee'))).toEqual([]);
    f.as('strategy').communication.save('g2', fields);
    expect(items(f.as('strategy'))).toHaveLength(2);
    expect(f.as('strategy').home().needsYou.find((i) => i.key === 'communication:write:g3')!).toMatchObject({ due: null, link: { kind: 'communication', goalId: 'g3' } });
  });
  it('gives goal owners and department heads the Strategy workspace', () => {
    const f = fresh();
    expect(workspacesFor(f.by('m-hoo').viewer)).toContain('strategy');
    expect(f.by('m-hoo').viewer.writesCommunication).toBe(true);
    expect(f.as('employee').viewer.writesCommunication).toBe(false);
  });
});
