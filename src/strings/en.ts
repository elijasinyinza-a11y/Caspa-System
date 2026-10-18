/**
 * All interface text, in one place, ready for translation (Build Brief, section 10).
 * 6P and 7C names are book terms and are never relabelled.
 */
import type { GateCode } from '../contract/caspa-data-contract';

export type WorkspaceKey = 'home' | 'strategy' | 'cascade' | 'plan' | 'performance';

export const en = {
  product: 'CASPA™',
  parentBrand: 'KarisMind™',
  skipToContent: 'Skip to main content',
  nav: {
    label: 'Main',
    home: 'Home',
    strategy: 'Strategy',
    cascade: 'Cascade',
    plan: 'Plan',
    performance: 'Performance',
  } satisfies Record<WorkspaceKey, string> & { label: string },
  /** Where each workspace sits in the 7Cs of leading strategy (Formation Specification v1.0; Build Brief v1.1). */
  sevenC: {
    home: 'Controlling',
    strategy: 'Conception to Communication',
    cascade: 'Coordination',
    plan: 'Coordination',
    performance: 'Controlling',
  } satisfies Record<WorkspaceKey, string>,
  sevenCPrefix: '7Cs:',
  workspaceIntro: {
    home: 'What needs you, and how the plan is doing.',
    strategy: 'Form a new strategic plan or bring in an existing one.',
    cascade: 'Turn goals into objectives, KPIs and activities, each at one 6P decision level.',
    plan: 'Fund the cascade: every budget line belongs to an activity.',
    performance: 'Contracts, progress and reviews, linked to the activities they serve.',
  } satisfies Record<WorkspaceKey, string>,
  notBuilt: 'These screens are built in a later slice.',
  devSwitcher: { label: 'Development preview', viewingAs: 'Viewing as' },
  roles: { executive: 'Executive', finance: 'Finance', supervisor: 'Supervisor', employee: 'Employee' },
  orgSwitcher: { label: 'Organisation' },
  integrity: {
    pillLabel: (blocking: number, advisory: number) =>
      `Integrity findings: ${blocking} blocking, ${advisory} advisory. Open the list.`,
    blocking: 'blocking',
    advisory: 'advisory',
    allClear: 'All checks clear',
    drawerTitle: 'Integrity findings',
    drawerIntro:
      'Computed by the rules engine after every change. A hard block stops one named step; an advisory flag never blocks.',
    hardBlock: 'Hard block',
    advisoryFlag: 'Advisory flag',
    blocks: (steps: string) => `Blocks ${steps}.`,
    routedTo: (who: string) => `Sent to ${who}.`,
    nobody: 'no owner yet',
    empty: 'Nothing to fix. Every check you can see has passed.',
    close: 'Close findings',
  },
  gates: {
    'vision.confirm': 'confirming the vision',
    'plan.confirm': 'confirming the plan',
    'cascade.publish': 'publishing the cascade',
    'budget.submit_unit': 'submitting a unit budget',
    'budget.submit_consolidated': 'submitting the consolidated budget',
    'budget.approve': 'approving the budget',
    'budget.lock': 'locking the budget',
    'contract.issue': 'issuing contracts',
    'contract.sign': 'signing contracts',
    'review.submit_self': 'submitting a self-assessment',
    'review.complete': 'completing a review',
    'appraisal.close': 'closing the appraisal round',
    'year.close': 'closing the year',
  } satisfies Record<GateCode, string>,
  /** Natural-language list: “A, B and C”. */
  list: (items: string[]) => new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' }).format(items),
  findings: {
    budgetLineNoActivity: (d: string) => `Budget line “${d}” is not linked to any activity.`,
    activityNo6P: (c: string, t: string) => `Activity ${c} “${t}” has no 6P decision level.`,
    kpiTargetInvalid: (c: string, n: string) =>
      `KPI ${c} “${n}”: the target equals the baseline or sits on the wrong side of it.`,
    goalNoFundedActivity: (c: string, t: string) => `Goal ${c} “${t}” has no funded activity.`,
    objectiveNoKpi: (c: string, t: string) => `Objective ${c} “${t}” has no KPI.`,
    kpiNoOwner: (c: string, n: string) => `KPI ${c} “${n}” has no owner.`,
    deficiencyUnaddressed: (d: string) => `Deficiency “${d}” has no corrective activity.`,
    contractUpstreamChanged: (t: string) => `“${t}”: the activity behind this signed objective has changed.`,
    kpiBaselineNotValidated: (c: string, n: string) => `KPI ${c} “${n}” uses a baseline that is not validated.`,
    goalNoWhy: (c: string, t: string) => `Goal ${c} “${t}” is not linked to any 4Q entry, so its “why” is not recorded.`,
    envelopeExceeded: (c: string, t: string) => `Goal ${c} “${t}”: indicative costs exceed the resource envelope.`,
  },
  home: {
    title: (fy: number) => `FY${fy} at a glance`,
    intro: 'Every figure here is computed from the cascade. Role home screens replace this view in a later slice.',
    goals: 'Strategic goals',
    goalsNote: (plan: string) => `From ${plan}`,
    funded: 'Activities funded',
    fundedNote: (n: number, of: number) => `${n} of ${of} activities have at least one budget line`,
    findings: 'Integrity findings',
    findingsNote: (b: number, a: number) => `${b} blocking, ${a} advisory`,
    coverageTitle: 'Funding coverage by goal',
    coverageNote: 'Share of each goal’s activities with at least one budget line',
    coverageRow: (n: number, of: number) => `${n} of ${of}`,
    noActivities: 'No activities',
  },
  breadcrumbLabel: 'Breadcrumb',
};
