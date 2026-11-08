/**
 * v0.26.0: the forming schedule and 4Q review groups for Sample Water Utility's 2027–2031 plan, from the approved
 * prototypes (`reference/caspa-forming-schedule-prototype.html` and `reference/caspa-4q-groups-prototype.html`),
 * mapped onto the sample's own people and positions. Development only.
 *
 * The Strategy and Planning Manager prepares and has published the calendar; Conception is open. One meeting is done
 * by hand; the department sheets, the consultation and the confirmations are done only when their records say so.
 * The 4Q review session has three groups. Group 1's scribe is the Commercial Officer (the Supervisor role), Group 2's
 * the Head of Operations (the KPI owner role) and Group 3's the Strategy office itself; four group cards wait for review.
 */
import type { FormationDeadline, FourQCell, FourQEntry, Id, Stamp, Workshop } from '../../contract/caspa-data-contract';
import type { Store } from '../access/store';

const id = <T extends string>(x: string) => x as Id<T>;
const at = (on: string, by = 'm-spm'): Stamp => ({ at: `${on}T09:00:00+02:00` as never, byMembershipId: id(by) });

export function addSampleSchedule(s: Store) {
  const plan = s.plans.find((p) => p.id === 'plan-2027');
  if (!plan?.formation || !plan.calendar) return;
  const orgId = s.organisation.id;
  const base = { orgId, created: at('2026-10-05'), updated: at('2026-10-05') };
  plan.processOwnerPositionId = id('pos-spm');
  plan.calendar = { preparerMembershipId: id('m-spm'), published: at('2026-10-06'), visionTargetOn: '2026-11-30' as never, planTargetOn: '2027-01-29' as never };
  plan.formation.conception.status = 'open';

  const heads = ['pos-hof', 'pos-hoo', 'pos-hoc'].map((x) => id<'Position'>(x));
  const office = [id<'Position'>('pos-spm')];
  const deadline = (n: number, label: string, kind: FormationDeadline['kind'], stage: FormationDeadline['stage'], dueOn: string | null, owners: Id<'Position'>[], doneWhen: FormationDeadline['doneWhen'], completed: Stamp | null = null): FormationDeadline => ({
    ...base, id: id(`fd-2027-${n}`), planId: plan.id, label, kind, stage, dueOn: dueOn as never, ownerPositionIds: owners, doneWhen, completed,
  });
  s.formationDeadlines.push(
    deadline(1, 'Leadership briefing on the 4Q review', 'meeting', 'conception', '2026-10-09', office, null, at('2026-10-09')),
    deadline(2, 'Department sheets due', 'milestone', 'conception', '2026-10-23', heads, 'department_sheets_submitted'),
    deadline(3, 'Consultation with staff and stakeholders', 'meeting', 'consultation', '2026-11-12', office, null),
    deadline(4, 'Consultation closes', 'milestone', 'consultation', '2026-11-20', office, 'consultation_closed'),
    deadline(5, 'Board meeting: plan approval', 'meeting', 'composition', '2027-02-26', [id('pos-md')], null),
    deadline(6, 'Department briefings on the new plan', 'meeting', 'communication', null, heads, null),
  );

  const cells = (band: FourQCell['band']): FourQCell[] =>
    (band === 'projection' ? ['opportunities', 'key_strategic_actions', 'risks', 'risk_strategies'] : ['successes', 'success_factors', 'failures', 'failure_factors']).map((column) => ({ band, column }) as FourQCell);
  const review: Workshop = {
    ...base, id: id('ws-2027-4q'), planId: plan.id, purposes: ['four_q_review'], format: 'in_person', scheduledOn: '2026-11-04' as never, window: null,
    participantPositionIds: ['pos-md', 'pos-hof', 'pos-hoo', 'pos-hoc', 'pos-spm', 'pos-hrm'].map((x) => id<'Position'>(x)), recordingRef: null, status: 'planned', decisionLog: [],
    groups: [
      { id: 'g1', name: 'Group 1', cells: cells('retraction'), scribeMembershipId: id('m-co'), memberNames: ['Commercial Manager', 'Billing Clerk'], closed: null },
      { id: 'g2', name: 'Group 2', cells: cells('repositioning'), scribeMembershipId: id('m-hoo'), memberNames: ['Legal and Compliance Officer'], closed: null },
      { id: 'g3', name: 'Group 3', cells: cells('projection'), scribeMembershipId: id('m-spm'), memberNames: ['Managing Director', 'Head of Finance', 'Human Resources Manager'], closed: null },
    ],
  };
  const composition: Workshop = { ...review, id: id('ws-2027-comp'), purposes: ['composition'], scheduledOn: '2027-01-14' as never, groups: undefined };
  s.workshops.push(review, composition);

  const card = (n: number, by: string, group: string, cell: FourQCell, text: string): FourQEntry => ({
    orgId, created: at('2026-10-17', by), updated: at('2026-10-17', by), id: id(`q-2027-g${n}`), planId: plan.id, cell, text, raisedByUnitIds: [], scope: 'organisation',
    mergedIntoId: null, evidence: null, draft: { state: 'ai_draft', provenance: { kind: 'manual' }, decided: null }, fromGroup: { workshopId: review.id, groupId: group },
  });
  s.fourQEntries.push(
    card(1, 'm-co', 'g1', { band: 'retraction', column: 'failures' }, 'Sanitation coverage stayed below target'),
    card(2, 'm-co', 'g1', { band: 'retraction', column: 'failure_factors' }, 'Meter replacement fell behind for lack of stock'),
    card(3, 'm-hoo', 'g2', { band: 'repositioning', column: 'failures' }, 'Water losses still too high in the network'),
    card(4, 'm-hoo', 'g2', { band: 'repositioning', column: 'success_factors' }, 'Night-flow checks in two district metered areas'),
  );
}

/**
 * Takes the sample schedule and groups back out, for tests that start formation from nothing (formation, Conception
 * and the menu as they were before v0.26.0). The plan returns to no preparer, no calendar and no stage open.
 */
export function clearSampleSchedule(s: Store) {
  const plan = s.plans.find((p) => p.id === 'plan-2027');
  if (!plan?.formation) return;
  plan.processOwnerPositionId = null;
  plan.calendar = { preparerMembershipId: null, published: null, visionTargetOn: null, planTargetOn: null };
  plan.formation.conception.status = 'not_started';
  s.formationDeadlines = s.formationDeadlines.filter((d) => !d.id.startsWith('fd-2027-'));
  s.workshops = s.workshops.filter((w) => !w.id.startsWith('ws-2027-'));
  s.fourQEntries = s.fourQEntries.filter((e) => !e.fromGroup);
}
