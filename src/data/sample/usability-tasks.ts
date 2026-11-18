/**
 * The first usability round's tasks (Clarity Specification v0.1, "Usability test kit", section 5), word for word, on
 * Sample Water Utility. Development only; not part of the product. The facilitator sets the role; participants never
 * touch the role switcher. Section 7 sets the pass mark: at least 4 of 5 complete a task unaided.
 * Tasks 6 and 7 were added on 18 November 2026 (Strategy Landing Specification, SL-7), with the same pass mark.
 */
import type { DevRole } from './all';

export interface UsabilityTask { no: number; role: DevRole; roleLabel: string; card: string; completedWhen: string }
export const USABILITY_TASKS: UsabilityTask[] = [
  { no: 1, role: 'employee', roleLabel: 'Employee', card: 'You work as a meter reader. Find out what your work contributes to in the organisation’s plan.', completedWhen: 'names the goal their commitment serves' },
  { no: 2, role: 'finance', roleLabel: 'Finance', card: 'The budget cannot be submitted. Find out why, and fix it.', completedWhen: 'links “Vehicle hire, Zone C” to an activity' },
  { no: 3, role: 'supervisor', roleLabel: 'Supervisor', card: 'Find out who owns the measure “Collection efficiency”.', completedWhen: 'opens it and says it has no owner yet' },
  { no: 4, role: 'executive', roleLabel: 'Executive', card: 'Is the organisation on track to reduce non-revenue water? How do you know?', completedWhen: 'finds its status and explains it from the progress shown' },
  { no: 5, role: 'employee', roleLabel: 'Any', card: 'One activity is at the “Procedure” decision level. Find out what that means.', completedWhen: 'opens the explanation of Procedure' },
  { no: 6, role: 'strategy', roleLabel: 'Strategy office', card: 'The measure “Collection efficiency” has no owner. Make the Head of Operations its owner.', completedWhen: 'saves the change and the owner shows on the page' },
  { no: 7, role: 'employee', roleLabel: 'Employee', card: 'Find out which goal your work this year serves, and how it is going.', completedWhen: 'names the goal and its status' },
];
/** The organisation every task starts in: the demo, from its seeded state. */
export const USABILITY_ORG_INDEX = 0;
export const PARTICIPANTS = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;
