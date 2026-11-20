/**
 * v0.32.0 (Values Group Work Specification v0.1, "Sample data"): Sample Water Utility's 2027–2031 plan has a values
 * session with three groups, from the approved prototype (`reference/caspa-values-group-work-prototype.html`), mapped
 * onto the sample's own people. Development only; sample wording.
 *
 * The session was held on 15 October 2026. Group 1's scribe is the Commercial Officer (the Supervisor role) and Group 2's the Head of Operations (the KPI owner
 * role); both groups are closed, so their six candidates wait on the values board. Two pairs say the same thing, to
 * show merging. Group 3's scribe is the Meter Reader (the Employee role), whose group is still entering answers.
 */
import type { Id, Stamp, ValueCandidate, Workshop, WorkshopGroup } from '../../contract/caspa-data-contract';
import type { Store } from '../access/store';

const id = <T extends string>(x: string) => x as Id<T>;
const at = (on: string, by = 'm-spm'): Stamp => ({ at: `${on}T10:00:00+02:00` as never, byMembershipId: id(by) });

export function addSampleValuesWork(s: Store) {
  const plan = s.plans.find((p) => p.id === 'plan-2027');
  if (!plan?.formation) return;
  const orgId = s.organisation.id;
  const answers = (list: [1 | 2 | 3 | 4, string][]): WorkshopGroup['answers'] => list.map(([question, text], i) => ({ id: `a${i + 1}`, question, text }));
  const groups: WorkshopGroup[] = [
    {
      id: 'g1', name: 'Group 1', scribeMembershipId: id('m-co'), memberNames: ['Commercial Manager', 'two district managers', 'Billing Clerk'], closed: at('2026-10-16'),
      answers: answers([
        [1, 'During the 2024 outbreak every department worked weekends to keep chlorination going'],
        [1, 'Staff called customers back the same day'],
        [2, 'Complaints wait too long because nobody owns them. Instead: one person follows each complaint to the end'],
        [3, 'Every connection metered and billed correctly'],
        [4, 'Water that is safe to drink, every day'],
      ]),
    },
    {
      id: 'g2', name: 'Group 2', scribeMembershipId: id('m-hoo'), memberNames: [], closed: at('2026-10-16'),
      answers: answers([
        [1, 'Teams shared vehicles and fuel to finish the meter roll-out'],
        [2, 'We blame other departments when targets are missed'],
        [2, 'Instead: report problems early and own the fix'],
        [3, 'Decisions based on figures, not guesswork'],
        [4, 'Honest bills and a straight answer'],
      ]),
    },
    {
      id: 'g3', name: 'Group 3', scribeMembershipId: id('m-mrb'), memberNames: ['Water Quality Officer', 'two plumbers'], closed: null,
      answers: answers([
        [1, 'The night shift fixed the main burst in four hours'],
        [4, 'Someone who answers the phone'],
      ]),
    },
  ];
  const session: Workshop = {
    orgId, created: at('2026-11-10'), updated: at('2026-10-16'), id: id('ws-2027-values'), planId: plan.id, purposes: ['values'], format: 'in_person',
    scheduledOn: '2026-10-15' as never, window: null, participantPositionIds: [], recordingRef: null, status: 'held', decisionLog: [], groups,
  };
  s.workshops.push(session);

  const cand = (n: number, group: string, by: string, name: string, meaning: string, answerIds: string[]): ValueCandidate => ({
    orgId, created: at('2026-10-15', by), updated: at('2026-10-15', by), id: id(`vc-2027-${n}`), planId: plan.id, workshopId: session.id, groupId: group,
    name, meaning, entered: { name, meaning }, answerIds, state: 'to_review', mergedIntoId: null, setAsideReason: null, onBehalf: false,
  });
  s.valueCandidates.push(
    cand(1, 'g1', 'm-co', 'Customer care', 'We answer every customer the same day and follow each complaint until it is closed.', ['a2', 'a3']),
    cand(2, 'g1', 'm-co', 'Safe water first', 'We never compromise on water quality, whatever the pressure.', ['a1', 'a5']),
    cand(3, 'g1', 'm-co', 'Teamwork', 'Departments help each other when the work demands it.', ['a1']),
    cand(4, 'g2', 'm-hoo', 'Putting customers first', 'Customers get honest bills and a straight answer from whoever they speak to.', ['a5']),
    cand(5, 'g2', 'm-hoo', 'Owning the result', 'We report problems early and own the fix instead of blaming others.', ['a2', 'a3']),
    cand(6, 'g2', 'm-hoo', 'Working together', 'We share vehicles, fuel and knowledge to get the job done.', ['a1']),
    cand(7, 'g3', 'm-mrb', 'Quick response', 'We fix faults fast, day or night.', ['a1']),
  );
}
