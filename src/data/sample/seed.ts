/**
 * Seed records for Sample Water Utility (Build Brief v1.1, section 7).
 * Fictional organisation and people. Every figure on every screen is derived from these records.
 */
import {
  RATING_PRESETS, type Activity, type BudgetLine, type ContractObjective, type Deficiency, type DraftMeta, type FourQCell, type FourQEntry,
  type Goal, type Id, type ISODate, type ISODateTime, type Kpi, type Membership,
  type Objective, type OrgUnit, type Person, type Position, type PositionAssignment, type SixPLevel, type Stamp,
} from '../../contract/caspa-data-contract';
import { activityFingerprint } from '../../rules/fingerprint';
import { seededConfirmation, seededPublication } from '../access/setup/confirmation';
import type { Store } from '../access/store';
import { DEFAULT_STRUCTURE_VIEW } from '../../rules/structure-view';

const id = <T extends string>(s: string) => s as Id<T>;
const d = (s: string) => s as ISODate;
const dt = (s: string) => s as ISODateTime;

export const ORG = id<'Organisation'>('org-sample-water');
const orgId = ORG;
const MD_MEMBERSHIP = id<'Membership'>('m-md');
const stamp: Stamp = { at: dt('2026-01-15T08:00:00+02:00'), byMembershipId: MD_MEMBERSHIP };
const base = { orgId, created: stamp, updated: stamp };
const human: DraftMeta = { state: 'human', provenance: { kind: 'manual' }, decided: null };
const zmw = (kwacha: number) => ({ amountMinor: kwacha * 100, currency: 'ZMW' });

export const FY = 2026;

/* People, positions, memberships */
type P = { key: string; name: string; title: string; unit: string; reportsTo: string | null; roles?: Membership['roles'] };
const PEOPLE: P[] = [
  { key: 'md', name: 'Chanda Mulenga', title: 'Managing Director', unit: 'u-org', reportsTo: null, roles: ['executive'] },
  { key: 'hof', name: 'Ruth Phiri', title: 'Head of Finance', unit: 'u-fin', reportsTo: 'md', roles: ['finance'] },
  // Added for slice 4 (approved 23 October 2026), so the HR and Strategy office homes have a holder.
  // Organisation administrator added for slice 7 (prototype approved 29 October 2026).
  { key: 'hrm', name: 'Natasha Kabwe', title: 'Human Resources Manager', unit: 'u-org', reportsTo: 'md', roles: ['hr', 'org_admin'] },
  { key: 'spm', name: 'Bwalya Musonda', title: 'Strategy and Planning Manager', unit: 'u-org', reportsTo: 'md', roles: ['strategy_office'] },
  { key: 'hoo', name: 'Joseph Tembo', title: 'Head of Operations', unit: 'u-ops', reportsTo: 'md' },
  { key: 'hoc', name: 'Grace Zulu', title: 'Head of Commercial', unit: 'u-com', reportsTo: 'md' },
  { key: 'cm', name: 'Peter Mwansa', title: 'Commercial Manager', unit: 'u-com', reportsTo: 'hoc' },
  { key: 'co', name: 'Esther Banda', title: 'Commercial Officer', unit: 'u-com', reportsTo: 'cm' },
  { key: 'mra', name: 'Moses Lungu', title: 'Meter Reader, Zone A', unit: 'u-zone-a', reportsTo: 'co' },
  { key: 'mrb', name: 'Mary Chileshe', title: 'Meter Reader, Zone B', unit: 'u-zone-b', reportsTo: 'co' },
  { key: 'mrc', name: 'Daniel Sakala', title: 'Meter Reader, Zone C', unit: 'u-zone-c', reportsTo: 'co' },
  { key: 'bc', name: 'Agnes Mumba', title: 'Billing Clerk', unit: 'u-com', reportsTo: 'co' },
];
const pos = (k: string) => id<'Position'>(`pos-${k}`);
const per = (k: string) => id<'Person'>(`p-${k}`);

const units: OrgUnit[] = [
  { ...base, id: id('u-org'), parentId: null, name: 'Sample Water Utility', unitType: 'Organisation' },
  { ...base, id: id('u-fin'), parentId: id('u-org'), name: 'Finance', unitType: 'Department' },
  { ...base, id: id('u-ops'), parentId: id('u-org'), name: 'Operations', unitType: 'Department' },
  { ...base, id: id('u-com'), parentId: id('u-org'), name: 'Commercial', unitType: 'Department' },
  { ...base, id: id('u-zone-a'), parentId: id('u-com'), name: 'Zone A', unitType: 'Zone' },
  { ...base, id: id('u-zone-b'), parentId: id('u-com'), name: 'Zone B', unitType: 'Zone' },
  { ...base, id: id('u-zone-c'), parentId: id('u-com'), name: 'Zone C', unitType: 'Zone' },
];
const people: Person[] = PEOPLE.map((p) => ({ id: per(p.key), fullName: p.name, email: `${p.key}@sample-water.example` }));
const positions: Position[] = PEOPLE.map((p) => ({
  ...base, id: pos(p.key), unitId: id<'OrgUnit'>(p.unit), title: p.title, reportsToPositionId: p.reportsTo ? pos(p.reportsTo) : null,
}));
const assignments: PositionAssignment[] = PEOPLE.map((p) => ({
  ...base, id: id(`pa-${p.key}`), positionId: pos(p.key), personId: per(p.key), kind: 'substantive', from: d('2024-01-01'), to: null,
}));
const memberships: Membership[] = PEOPLE.map((p) => ({
  ...base, id: id(`m-${p.key}`), personId: per(p.key), roles: p.roles ?? [], startsOn: d('2024-01-01'), endsOn: null, status: 'active',
}));

/** Membership behind each development role switch (Build Brief, screen 1). */
export const DEV_ROLE_MEMBERSHIPS = {
  executive: id<'Membership'>('m-md'),
  strategy: id<'Membership'>('m-spm'),
  finance: id<'Membership'>('m-hof'),
  hr: id<'Membership'>('m-hrm'),
  supervisor: id<'Membership'>('m-co'),
  employee: id<'Membership'>('m-mrb'),
  admin: id<'Membership'>('m-hrm'),
} as const;

/* Strategy: the imported 2022–2026 plan runs FY2026; the 2027–2031 plan is in formation */
const PLAN = id<'StrategicPlan'>('plan-2022');
/** Sample 4Q entries (approved 18 October 2026). G1, G2 and G4 each record one reason; G3 has none, so its finding stays. */
const fourQ = (goalN: number, cell: FourQCell, text: string): FourQEntry => ({
  ...base, id: id(`q-g${goalN}-1`), planId: PLAN, cell, text, raisedByUnitIds: [id('u-org')], scope: 'organisation', mergedIntoId: null, evidence: null, draft: human,
});
const fourQEntries: FourQEntry[] = [
  fourQ(1, { band: 'retraction', column: 'failures' }, 'Billed revenue has not covered operating and maintenance costs.'),
  fourQ(2, { band: 'retraction', column: 'failure_factors' }, 'Ageing pumping equipment causes frequent supply interruptions.'),
  fourQ(4, { band: 'repositioning', column: 'failure_factors' }, 'Section heads were promoted from technical roles without supervisory training.'),
];
const goal = (n: number, title: string, perspective: Goal['perspective'], owner: string): Goal => ({
  ...base, id: id(`g${n}`), planId: PLAN, code: `G${n}`, title, perspective, ownerPositionId: pos(owner), themeIds: [],
  fourQEntryIds: fourQEntries.filter((q) => q.id === `q-g${n}-1`).map((q) => q.id), draft: human,
});
const objective = (code: string, g: number, title: string, owner: string): Objective => ({
  ...base, id: id(`o${code}`), goalId: id(`g${g}`), code: `O${code}`, title, ownerPositionId: pos(owner), proposedByPositionId: null, fourQEntryIds: [], draft: human,
});
const kpi = (code: string, o: string, name: string, unit: string, direction: Kpi['direction'], baseline: number, owner: string | null): Kpi => ({
  ...base, id: id(`k${code}`), objectiveId: id(`o${o}`), code: `K${code}`, name, unit, direction, aggregation: 'latest', baseline,
  baselineMeasureId: null, milestones: [], reportingFrequency: 'monthly', ownerPositionId: owner ? pos(owner) : null, draft: human,
});
const activity = (code: string, k: string, title: string, level: SixPLevel, owner: string, evidence: string, qty: Activity['quantityTarget'] = null): Activity => ({
  ...base, id: id(`a${code}`), kpiId: id(`k${k}`), financialYear: FY, code: `A${code}`, title, decisionLevel: level, ownerPositionId: pos(owner),
  reportingFrequency: 'monthly', evidence, quantityTarget: qty, dependsOn: [], status: 'in_progress', draft: human,
});

const activities: Activity[] = [
  activity('1.1.1.1', '1.1.1', 'Complete monthly meter-reading routes', 'procedures', 'co', 'Signed route sheets and the billing system’s reading log', { value: 2400, unit: 'readings' }),
  activity('1.2.1.1', '1.2.1', 'Establish district metered areas', 'process', 'hoo', 'Commissioning report for each district metered area'),
  activity('1.2.1.2', '1.2.1', 'Revise meter management policy', 'policy', 'hoc', 'Board-approved revised policy'),
  activity('1.2.1.3', '1.2.1', 'Replace faulty customer meters', 'process', 'cm', 'Meter replacement job cards matched to the customer register', { value: 1800, unit: 'meters' }),
  activity('1.2.1.4', '1.2.1', 'Introduce daily route briefing and check-in procedure', 'procedures', 'co', 'Daily briefing attendance and check-in records'),
  activity('2.1.1.1', '2.1.1', 'Rehabilitate the main pumping station', 'process', 'hoo', 'Contractor’s completion certificate and commissioning test results'),
  activity('3.1.1.1', '3.1.1', 'Build demonstration sanitation units in low-income areas', 'process', 'hoo', 'Handover certificates for completed units'),
  activity('4.1.1.1', '4.1.1', 'Run supervisory skills training for section heads', 'people', 'md', 'Attendance registers and completion certificates'),
];
const act = (code: string) => {
  const a = activities.find((x) => x.code === `A${code}`);
  if (!a) throw new Error(`Seed: missing activity ${code}`);
  return a;
};

const deficiency = (n: number, level: SixPLevel, description: string, probableCause: string, effects: string, fix: string[], timeframe: string): Deficiency => ({
  ...base, id: id(`def-${n}`), objectiveId: id('o1.2'), level, description, probableCause, effects,
  correctiveActivityIds: fix.map((c) => act(c).id), timeframe, draft: human,
});

const line = (n: number, activityCode: string | null, description: string, kwacha: number, unit: string, cat: BudgetLine['costCategory'], src: BudgetLine['fundingSource']): BudgetLine => ({
  ...base, id: id(`bl-${n}`), versionId: id('bv-2026-1'), activityId: activityCode ? act(activityCode).id : null, holderUnitId: id(unit),
  description, amount: zmw(kwacha), costCategory: cat, fundingSource: src, fundingNote: null,
});

const signed = (a: Activity, title: string, value: number, unit: string, weightPct: number, n: number): ContractObjective => ({
  ...base, id: id(`co-b-${n}`), contractId: id('pc-mrb-2026'), sourceActivityId: a.id, title, quantityTarget: { value, unit },
  snapshot: { title, quantityTarget: { value, unit }, sourceFingerprint: activityFingerprint(a), frozenAt: dt('2026-02-02T10:00:00+02:00') },
  direction: 'higher_is_better', weightPct,
});

export function createSeed(): Store {
  // A deep copy, so every store owns its records: slice 6 writes to activities, which are built once at module level.
  return structuredClone(seedStore());
}

function seedStore(): Store {
  return {
    organisation: {
      id: ORG, name: 'Sample Water Utility', countryCode: 'ZM', timeZone: 'Africa/Lusaka', baseCurrency: 'ZMW', financialYearStartMonth: 1,
      created: stamp, updated: stamp,
      termLabels: {
        goal: { singular: 'Goal', plural: 'Goals' },
        objective: { singular: 'Objective', plural: 'Objectives' },
        kpi: { singular: 'KPI', plural: 'KPIs' },
        activity: { singular: 'Activity', plural: 'Activities' },
        deficiency: { singular: 'Deficiency', plural: 'Deficiencies' },
        budgetLine: { singular: 'Budget line', plural: 'Budget lines' },
        contractObjective: { singular: 'Contract objective', plural: 'Contract objectives' },
      },
      perspectives: [
        { key: 'customer', label: 'Customer' },
        { key: 'internal', label: 'Internal' },
        { key: 'innovation_learning', label: 'Innovation and learning' },
        { key: 'financial', label: 'Financial' },
      ],
      settings: {
        overdueEscalationDays: 7, reviewModel: 'mid_year_and_annual', kpiStatus: { onTrackAt: 0.9, atRiskAt: 0.7 },
        ratingSchemeId: id('rs-a'), aiEnabled: true, boardApprovalRequired: { plan: true, budget: true }, consultationMinGroupSize: 5, structureView: structuredClone(DEFAULT_STRUCTURE_VIEW),
      },
    },
    people, memberships, units, positions, assignments,
    fourQEntries,
    plans: [
      {
        ...base, id: PLAN, title: 'Strategic Plan 2022–2026', startYear: 2022, endYear: 2026, entryDoor: 'imported', status: 'active',
        confirmation: { at: dt('2022-01-10T09:00:00+02:00'), byMembershipId: MD_MEMBERSHIP }, boardApproval: { resolutionRef: 'BR/2021/14', date: d('2021-12-09') },
        formation: null, processOwnerPositionId: null, calendar: null, currentRevision: 0,
      },
      {
        ...base, id: id('plan-2027'), title: 'Strategic Plan 2027–2031', startYear: 2027, endYear: 2031, entryDoor: 'formed', status: 'draft',
        confirmation: null, boardApproval: null, processOwnerPositionId: null, currentRevision: 0,
        formation: Object.fromEntries((['conception', 'consultation', 'confirmation', 'composition', 'communication'] as const).map((s) => [s, { status: 'not_started', startsOn: null, endsOn: null, ownerPositionId: null }])) as NonNullable<Store['plans'][number]['formation']>,
        calendar: { preparerMembershipId: null, published: null, visionTargetOn: null, planTargetOn: null },
      },
    ],
    goals: [
      goal(1, 'Improve financial sustainability', 'financial', 'hof'),
      goal(2, 'Provide reliable water supply', 'customer', 'hoo'),
      goal(3, 'Expand access to sanitation', 'customer', 'hoo'),
      goal(4, 'Strengthen institutional capacity', 'innovation_learning', 'md'),
    ],
    objectives: [
      objective('1.1', 1, 'Increase collection efficiency', 'hoc'),
      objective('1.2', 1, 'Reduce non-revenue water', 'hoo'),
      objective('2.1', 2, 'Extend daily hours of supply', 'hoo'),
      objective('3.1', 3, 'Increase household sanitation coverage', 'hoo'),
      objective('4.1', 4, 'Build supervisory skills across sections', 'md'),
    ],
    kpis: [
      kpi('1.1.1', '1.1', 'Collection efficiency', '%', 'higher_is_better', 78, null),
      kpi('1.2.1', '1.2', 'Non-revenue water', '%', 'lower_is_better', 52, 'hoo'),
      kpi('2.1.1', '2.1', 'Average hours of supply per day', 'hours per day', 'higher_is_better', 14, 'hoo'),
      kpi('3.1.1', '3.1', 'Households with improved sanitation', '%', 'higher_is_better', 31, 'hoo'),
      kpi('4.1.1', '4.1', 'Section heads trained in supervision', '%', 'higher_is_better', 40, 'md'),
    ],
    kpiTargets: [
      ['1.1.1', 90], ['1.2.1', 40], ['2.1.1', 18], ['3.1.1', 36], ['4.1.1', 70],
    ].map(([k, t]) => ({ ...base, id: id(`kt-${k}-${FY}`), kpiId: id(`k${k}`), financialYear: FY, target: t as number })),
    kpiActuals: [{ ...base, id: id('ka-1.2.1-2026-06'), kpiId: id('k1.2.1'), periodEnd: d('2026-06-30'), value: 47 }],
    baselineMeasures: [],
    resourceEnvelopes: [],
    activities,
    activityProgress: [{ ...base, id: id('ap-1.2.1.3-2026-06'), activityId: act('1.2.1.3').id, periodEnd: d('2026-06-30'), quantityDone: 620, note: '' }],
    deficiencies: [
      deficiency(1, 'process', 'Faulty and aged customer meters', 'Meters kept in service past their working life', 'Under-recorded consumption and lost revenue', ['1.2.1.3'], '2 years'),
      deficiency(2, 'process', 'Losses cannot be located by area', 'No measurement of volumes supplied to each zone', 'Repair effort spread blindly across the network', ['1.2.1.1'], '18 months'),
      deficiency(3, 'policy', 'Meters replaced only when they fail', 'Asset policy sets no replacement standard for meters', 'Failures pile up between budget cycles', ['1.2.1.2'], '6 months'),
      deficiency(4, 'practices', 'Meter readings estimated instead of taken on some routes', 'Readers skip remote meters; weak route supervision', 'Billing disputes; losses hidden in estimates', ['1.2.1.4'], '3 months'),
      deficiency(5, 'people', 'Meter readers not trained to spot tampering', 'No training on illegal connections and meter tampering', 'Commercial losses go unreported', [], 'Not set'),
    ],
    // Gate due dates approved 23 October 2026. They feed "Needs you"; gates themselves never check dates.
    cycles: [
      { ...base, id: id('cy-budget-2026'), kind: 'budget', financialYear: FY, status: 'open', gateDueDates: { 'budget.submit_consolidated': d('2026-11-06'), 'budget.approve': d('2026-11-27') } },
      { ...base, id: id('cy-contracts-2026'), kind: 'contracts', financialYear: FY, status: 'open', gateDueDates: { 'contract.issue': d('2026-01-31') } },
      { ...base, id: id('cy-appraisal-2026'), kind: 'appraisal', financialYear: FY, status: 'open', gateDueDates: { 'review.complete': d('2027-01-15') } },
    ],
    budgetVersions: [{ ...base, id: id('bv-2026-1'), cycleId: id('cy-budget-2026'), version: 1, status: 'draft', approval: null, boardApproval: null }],
    budgetLines: [
      line(1, '1.2.1.3', 'Customer meters', 1_200_000, 'u-com', 'capital', 'own_revenue'),
      line(2, '1.2.1.3', 'Meter installation', 300_000, 'u-com', 'operating', 'own_revenue'),
      line(3, '2.1.1.1', 'Pumping station rehabilitation works', 850_000, 'u-ops', 'capital', 'donor'),
      line(4, '4.1.1.1', 'Supervisory skills training', 120_000, 'u-org', 'operating', 'own_revenue'),
      line(5, null, 'Vehicle hire, Zone C', 180_000, 'u-com', 'operating', 'own_revenue'),
    ],
    contracts: [
      {
        ...base, id: id('pc-mrb-2026'), personId: per('mrb'), positionId: pos('mrb'), financialYear: FY, status: 'signed',
        signedByEmployee: { at: dt('2026-02-02T10:00:00+02:00'), byMembershipId: id('m-mrb') }, signedBySupervisor: { at: dt('2026-02-02T10:05:00+02:00'), byMembershipId: id('m-co') },
      },
      { ...base, id: id('pc-mrc-2026'), personId: per('mrc'), positionId: pos('mrc'), financialYear: FY, status: 'draft', signedByEmployee: null, signedBySupervisor: null },
    ],
    contractObjectives: [
      signed(act('1.2.1.3'), 'Replace 400 faulty meters on route', 400, 'meters', 50, 1),
      signed(act('1.1.1.1'), 'Complete scheduled meter readings', 2400, 'readings', 50, 2),
    ],
    progressUpdates: [
      ['co-b-1', 140], ['co-b-2', 2210],
    ].map(([c, q]) => ({
      ...base, id: id(`pu-${c}`), contractObjectiveId: id(c as string), periodEnd: d('2026-06-30'), quantityDone: q as number, note: '', evidence: 'Route sheet',
      verified: { at: dt('2026-07-03T09:00:00+02:00'), byMembershipId: id('m-co') },
      sync: { capturedOffline: false, capturedAt: dt('2026-07-01T16:00:00+02:00'), syncedAt: dt('2026-07-01T16:00:00+02:00') },
    })),
    // One open mid-year review for the Zone B contract (approved 23 October 2026). Scores are computed, never stored here.
    reviews: [{
      ...base, id: id('rv-mrb-2026-mid'), contractId: id('pc-mrb-2026'), kind: 'mid_year', selfAssessment: null, supervisorAssessment: null,
      status: 'open', adjustments: [], notAssessable: [], competencyRatings: [], returnedByReviewer: null, employeeAcknowledgement: null, finalResult: null,
    }],
    // R1: preset A with the safeguards at their defaults; locked while the appraisal round is open.
    ratingSchemes: [{
      ...base, id: id('rs-a'), preset: 'A', bands: RATING_PRESETS.A, competencySection: { enabled: false, weightPct: 0 },
      floorRule: false, highAchievementFlagAt: 1.5, lockedByCycleId: id('cy-appraisal-2026'),
    }],
    workshops: [],
    formationDeadlines: [],
    acknowledgements: [],
    // The imported plan's cascade was published when the plan was brought in (section 28).
    gateEvents: [seededPublication(orgId, PLAN, id('m-spm'), dt('2026-01-20T09:00:00+02:00'))],
    // The structure was confirmed by the organisation administrator on 15 January 2026 (D7-9).
    auditEntries: [seededConfirmation(orgId, id('m-hrm'), dt('2026-01-15T09:00:00+02:00'), { units: units.length, positions: positions.length, people: people.length })],
    sourceDocuments: [],
    aiTasks: [], visionStatements: [],
  };
}

/** The sample's clock. Rules never read the system clock; "now" is always passed in. */
export const SAMPLE_NOW = '2026-10-18' as ISODate;
