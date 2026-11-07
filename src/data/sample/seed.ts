/**
 * Seed records for Sample Water Utility (Build Brief v1.1, section 7).
 * Fictional organisation and people. Every figure on every screen is derived from these records.
 */
import {
  RATING_PRESETS, type Activity, type BudgetLine, type ContractObjective, type Deficiency, type DraftMeta, type FourQCell, type FourQEntry,
  type Goal, type Id, type ISODate, type ISODateTime, type Kpi, type Membership,
  type Objective, type OrgUnit, type Person, type Position, type PositionAssignment, type SixPLevel, type Stamp,
  type AiTask, type CommunicationRecord, type SourceDocument, type BaselineMeasure, type ComplianceItem, type ProgressUpdate,
  type Dependency, type SurveyAnswerValue, type SurveyQuestionKey, type SurveyReceipt, type SurveyResponse, type SurveyRound,
} from '../../contract/caspa-data-contract';
import { activityFingerprint } from '../../rules/fingerprint';
import { seededConfirmation, seededPublication } from '../access/setup/confirmation';
import type { Store } from '../access/store';
import type { FinancialYear, KpiTarget } from '../../contract/caspa-data-contract';
import './composition'; // part 11d: the AI stub's approved sample wording for this organisation
import { DEFAULT_STRUCTURE_VIEW } from '../../rules/structure-view';
import { en } from '../../strings/en';

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
  // Added for part 11c (approved 1 November 2026), so the compliance register has a reviewer.
  { key: 'lco', name: 'Lillian Siame', title: 'Legal and Compliance Officer', unit: 'u-org', reportsTo: 'md', roles: ['compliance'] },
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
  ...base, id: id(`pa-${p.key}`), positionId: pos(p.key), personId: per(p.key), kind: 'substantive', from: d('2024-01-01'),
  // H2 (BUILD-BRIEF section 26, 30 October 2026): the Head of Commercial post is vacant from 1 September 2026.
  to: p.key === 'hoc' ? d('2026-08-31') : null,
}));
const memberships: Membership[] = PEOPLE.map((p, i) => ({
  ...base, id: id(`m-${p.key}`), personId: per(p.key), roles: p.roles ?? [], startsOn: d('2024-01-01'), endsOn: null, status: 'active',
  // v0.23.0 (C7): sample staff numbers, as printed on contracts (Mary Chileshe's approved as SWU-0412).
  employeeNumber: p.key === 'mrb' ? 'SWU-0412' : `SWU-${String(101 + i * 7).padStart(4, '0')}`,
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
/*
 * Part 11b: what the AI drafted for the 2027–2031 plan when its documents were given (approved Strategy workspace
 * prototype, wording as approved). The prototype's Sanitation and Engineering departments are raised by Operations,
 * which answers for them in this sample. Every card is an AI draft on its department's sheet until a person checks it.
 */
const FORMING = id<'StrategicPlan'>('plan-2027');
const draftedStamp: Stamp = { at: dt('2026-10-16T09:00:00+02:00'), byMembershipId: id('m-spm') };
const draftedBase = { orgId, created: draftedStamp, updated: draftedStamp };
const formationDocs: SourceDocument[] = ([
  ['sd-2027-1', 'Strategic Plan 2022–2026', 'strategic_plan'], ['sd-2027-2', 'Annual Report 2025', 'annual_report'], ['sd-2027-3', 'Performance Report 2025', 'performance_report'],
  ['sd-2027-4', 'Water Supply Licence', 'licence'], ['sd-2027-5', 'Regulatory notice: tariff review 2028', 'regulatory'],
] as const).map(([i, title, kind]) => ({ ...draftedBase, id: id<'SourceDocument'>(i), title, kind, fileRef: `${title}.pdf` }));
const EXTRACT = id<'AiTask'>('ai-2027-extract');
const drafted = (n: string, cell: FourQCell, text: string, unit: string, from: { doc: string; page: number } | { evidence: string }): FourQEntry => ({
  ...draftedBase, id: id(`q-2027-${n}`), planId: FORMING, cell, text, raisedByUnitIds: [id(unit)], scope: 'department', mergedIntoId: null,
  evidence: 'evidence' in from ? from.evidence : null,
  draft: { state: 'ai_draft', decided: null, provenance: 'doc' in from ? { kind: 'document', sourceDocumentId: id(from.doc), page: from.page, excerpt: '' } : { kind: 'ai_suggestion', aiTaskId: EXTRACT } },
});
const formationCards: FourQEntry[] = [
  drafted('r1', { band: 'retraction', column: 'successes' }, 'Metered connections rose from 58% to 81%', 'u-com', { doc: 'sd-2027-2', page: 9 }),
  drafted('r2', { band: 'retraction', column: 'success_factors' }, 'Dedicated metering project team', 'u-ops', { doc: 'sd-2027-2', page: 11 }),
  drafted('r3', { band: 'retraction', column: 'failures' }, 'Sanitation coverage 31% against a 45% target', 'u-ops', { doc: 'sd-2027-3', page: 22 }),
  drafted('r4', { band: 'retraction', column: 'failure_factors' }, 'No funded sanitation activities in annual budgets', 'u-fin', { evidence: 'FY2026 budget: G3 has no funded activity' }),
  drafted('p1', { band: 'repositioning', column: 'successes' }, 'Supply hours up from 14 to 16 per day', 'u-ops', { evidence: 'K2.1.1 Average hours of supply per day' }),
  drafted('p2', { band: 'repositioning', column: 'success_factors' }, 'Weekly zonal supply schedules published', 'u-ops', { doc: 'sd-2027-2', page: 14 }),
  drafted('p3', { band: 'repositioning', column: 'failures' }, 'Non-revenue water at 47% against a 40% target', 'u-com', { evidence: 'K1.2.1 Non-revenue water' }),
  drafted('p4', { band: 'repositioning', column: 'failures' }, 'High water losses in the distribution network', 'u-ops', { doc: 'sd-2027-3', page: 8 }),
  drafted('j1', { band: 'projection', column: 'opportunities' }, 'Regulator’s tariff review window in 2028', 'u-fin', { doc: 'sd-2027-5', page: 3 }),
  drafted('j2', { band: 'projection', column: 'key_strategic_actions' }, 'Cost-of-service study before the tariff application', 'u-fin', { doc: 'sd-2027-5', page: 4 }),
  drafted('j3', { band: 'projection', column: 'risks' }, 'Drought reducing raw water yield', 'u-ops', { doc: 'sd-2027-3', page: 27 }),
  drafted('j4', { band: 'projection', column: 'risk_strategies' }, 'Develop a second borehole field', 'u-ops', { doc: 'sd-2027-1', page: 41 }),
  // v0.24.0 (4Q Enhancement Specification v0.1): two critical failure factors with cause levels; wording approved 6 November 2026.
  { ...drafted('r5', { band: 'retraction', column: 'failure_factors' }, 'Reading routes left without supervision', 'u-com', { doc: 'sd-2027-3', page: 18 }), causeLevel: 'people' },
  { ...drafted('p5', { band: 'repositioning', column: 'failure_factors' }, 'Leaks repaired only after customers complain', 'u-ops', { doc: 'sd-2027-3', page: 9 }), causeLevel: 'process' },
];
const formationAi: AiTask = {
  orgId, id: EXTRACT, kind: 'extract', requested: draftedStamp, model: 'stub',
  inputRefs: [...formationDocs.map((d) => ({ type: 'SourceDocument', id: d.id as string })), { type: 'StrategicPlan', id: FORMING as string }],
  outputRefs: formationCards.map((c) => ({ type: 'FourQEntry', id: c.id as string })),
};
/*
 * Part 11c (approved 1 November 2026): the prototype's six baselines and six compliance items, in its wording.
 * Baselines were drafted by the AI with the 4Q cards; where the prototype names a page they point to it, otherwise
 * to the drafting task with the system export named in words. Owners follow the sample's units as in 11b
 * (Sanitation's measure is Operations'); the staff measure has no department here, so the Strategy office checks it.
 * As in the prototype, Operations and the Strategy office have already confirmed theirs; none is validated yet.
 */
const confirmedBy = (m: string): Stamp => ({ at: dt('2026-10-17T10:00:00+02:00'), byMembershipId: id(m) });
const baseline = (n: number, name: string, unit: string, value: number, asOf: string, source: string, owner: string | null, from: { doc: string; page: number } | null, confirmed: string | null): BaselineMeasure => ({
  ...draftedBase, id: id(`bm-2027-${n}`), planId: FORMING, name, unit, value, asOf: d(asOf), sourceDescription: source, ownerUnitId: owner ? id(owner) : null, validated: null,
  draft: {
    state: confirmed ? 'accepted' : 'ai_draft', decided: confirmed ? confirmedBy(confirmed) : null,
    provenance: from ? { kind: 'document', sourceDocumentId: id(from.doc), page: from.page, excerpt: '' } : { kind: 'ai_suggestion', aiTaskId: EXTRACT },
  },
});
const formationBaselines: BaselineMeasure[] = [
  baseline(1, 'Non-revenue water', '%', 47, '2026-09-30', 'Billing export, September 2026', 'u-com', null, null),
  baseline(2, 'Supply hours per day', 'hours per day', 16, '2026-09-30', 'Operations supply log', 'u-ops', null, 'm-hoo'),
  baseline(3, 'Collection efficiency', '%', 78, '2026-09-30', 'Finance revenue report, Q3 2026', 'u-fin', null, null),
  baseline(4, 'Sanitation coverage', '%', 31, '2025-12-31', 'Performance Report 2025, p. 22', 'u-ops', { doc: 'sd-2027-3', page: 22 }, 'm-hoo'),
  baseline(5, 'Metered connections', '%', 81, '2025-12-31', 'Annual Report 2025, p. 9', 'u-com', { doc: 'sd-2027-2', page: 9 }, null),
  baseline(6, 'Staff with signed contracts', '%', 85, '2026-09-30', 'HR records', null, null, 'm-spm'),
];
/** Obligations come only from uploaded documents, or are typed by a person (never from the AI's general knowledge). */
const obligation = (n: number, title: string, kind: ComplianceItem['kind'], from: { doc: string; page: number } | null): ComplianceItem => ({
  ...(from ? draftedBase : { orgId, created: confirmedBy('m-lco'), updated: confirmedBy('m-lco') }), id: id(`ci-2027-${n}`), planId: FORMING, title, kind,
  provenance: from ? { kind: 'document', sourceDocumentId: id(from.doc), page: from.page, excerpt: '' } : { kind: 'manual' },
  flaggedByUnitIds: [], outcome: null, reviewed: null,
});
const formationCompliance: ComplianceItem[] = [
  obligation(1, 'Report service hours to the regulator every quarter', 'licence_condition', { doc: 'sd-2027-4', page: 3 }),
  obligation(2, 'Maintain drinking water quality to the national standard', 'licence_condition', { doc: 'sd-2027-4', page: 5 }),
  obligation(3, 'Support tariff applications with a cost-of-service study', 'licence_condition', { doc: 'sd-2027-4', page: 7 }),
  obligation(4, 'Keep an up-to-date asset register', 'licence_condition', { doc: 'sd-2027-4', page: 12 }),
  obligation(5, 'Tariff review applications open in 2028', 'regulation', { doc: 'sd-2027-5', page: 2 }),
  obligation(6, 'Public finance management rules', 'regulation', null),
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

/** v0.23.0 (C1): means of verification agreed for the Zone B contract (approved with the printed samples, 6 November 2026). */
const MOV: Record<number, string> = { 1: 'Meter replacement job cards; meter changes in the billing system', 2: 'Route reading sheets; reading log in the billing system' };
const signed = (a: Activity, title: string, value: number, unit: string, weightPct: number, n: number): ContractObjective => ({
  ...base, id: id(`co-b-${n}`), contractId: id('pc-mrb-2026'), sourceActivityId: a.id, title, quantityTarget: { value, unit }, meansOfVerification: MOV[n] ?? null,
  snapshot: { title, quantityTarget: { value, unit }, sourceFingerprint: activityFingerprint(a), frozenAt: dt('2026-02-02T10:00:00+02:00') },
  direction: 'higher_is_better', weightPct,
});

/** v0.22.0: an objective in a draft contract (no snapshot until signed). */
const draftObjective = (n: string, activityId: Id<'Activity'> | null, duty: string | null, title: string, value: number, unit: string, weightPct: number): ContractObjective => ({
  ...base, id: id(n), contractId: id('pc-co-2026'), sourceActivityId: activityId, standingDuty: duty ? { description: duty } : null,
  title, quantityTarget: { value, unit }, snapshot: null, direction: 'higher_is_better', weightPct,
});
/** v0.22.0: the briefings depend on the meter management policy, owned by the vacant Head of Commercial post. */
const draftDependencies: Dependency[] = [{
  ...base, id: id('dep-co-1'), from: { contractObjectiveId: id('co-co-1') }, on: { activityId: id('a1.2.1.2') }, neededBy: d('2026-02-28'),
  note: 'The revised policy sets the check-in rules the briefings teach.',
}];

/**
 * v0.23.0: HR's draft scoring policy for FY2027, the sample approved on 6 November 2026: weighted points, no objective
 * earning more than its weight, thresholds 90/80/70/60, and five personal attributes at 5%. Not yet sent for approval.
 * Attribute wording is general and approved as sample wording; it is not copied from any organisation's form.
 */
const ATTR = (key: string, name: string, measures: string, levels: string[]) => ({ id: `attr-${key}`, name, measures, levels });
const FY2027_POLICY_DRAFT = {
  ...base, id: id<'RatingScheme'>('rs-2027'), preset: 'custom' as const,
  bands: [
    { score: 5 as const, label: 'Outstanding', minAchievement: 0.9 }, { score: 4 as const, label: 'Exceeds', minAchievement: 0.8 },
    { score: 3 as const, label: 'Meets', minAchievement: 0.7 }, { score: 2 as const, label: 'Partly meets', minAchievement: 0.6 },
    { score: 1 as const, label: 'Does not meet', minAchievement: null },
  ],
  competencySection: {
    enabled: true, weightPct: 5, levelLabels: ['Outstanding', 'Commendable', 'Satisfactory', 'Needs improvement', 'Unsatisfactory'],
    attributes: [
      ATTR('teamwork', 'Teamwork', 'Working with others, sharing knowledge and supporting team decisions.', [
        'Supports and helps put others’ ideas into practice; shares knowledge without being asked; disagrees constructively and offers alternatives.',
        'Responds constructively to others’ ideas; shares knowledge when asked; disagrees constructively.',
        'Responds constructively to others’ ideas but rarely helps put them into practice; shares knowledge when own work needs it.',
        'Seldom supports others’ ideas; disagrees without offering workable alternatives.',
        'Rarely supports others or shares ideas; disagreement is unconstructive.']),
      ATTR('time', 'Time keeping', 'Meeting deadlines and keeping working hours.', [
        'No missed deadlines in the period; no late arrivals or early departures.',
        'Missed fewer than 5% of deadlines; rarely late or early.',
        'Missed 5% to under 10% of deadlines; sometimes late or early by a few minutes.',
        'Missed 10% to under 20% of deadlines; late or early most weeks.',
        'Missed 20% or more of deadlines; consistently late or leaves early.']),
      ATTR('customer', 'Customer focus', 'Courtesy and care in dealing with customers and colleagues, and resolving complaints.', [
        'No complaints; commended by customers or colleagues; calm under pressure.',
        'Rarely a complaint; handles matters to others’ satisfaction; tracks customer satisfaction.',
        'Occasional complaints, fewer than before, and handled fairly.',
        'At least one complaint about conduct every two months.',
        'More than two complaints about conduct in a quarter.']),
      ATTR('integrity', 'Integrity and accountability', 'Honesty, owning one’s work and mistakes, and seeking and giving feedback.', [
        'Recorded commendations for honesty; owns mistakes without exception; seeks and gives feedback promptly.',
        'No concerns about honesty; owns mistakes; seeks and gives feedback promptly.',
        'No concerns about honesty; sometimes blames others; gives feedback only when asked.',
        'Concerns about honesty raised once; often blames others; needs reminding to give feedback.',
        'Repeated concerns about honesty; blames others; resists feedback.']),
      ATTR('attendance', 'Attendance', 'Being at work and available, and absence only with permission.', [
        'Never absent without permission; availability used fully for the job.',
        'Rarely absent; asks permission only for emergencies.',
        'Absence with and without permission in roughly equal measure; improving.',
        'Often absent; rarely asks permission first.',
        'Consistently absent without regard to supervision.']),
    ],
  },
  floorRule: false, highAchievementFlagAt: 1.5, lockedByCycleId: null,
  scoringMethod: 'weighted_points' as const, achievementCap: 1, countersignAll: false, flagScoredOne: true,
  appliesFromYear: 2027 as FinancialYear, approval: { status: 'draft' as const, sent: null, decided: null, returnReason: null },
};

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
        overdueEscalationDays: 7, reviewModel: 'mid_year_and_annual', standingDutyLimitPct: 20, singleObjectiveLimitPct: null, showDraftToEmployee: false, kpiStatus: { onTrackAt: 0.9, atRiskAt: 0.7 },
        ratingSchemeId: id('rs-a'), aiEnabled: true, boardApprovalRequired: { plan: true, budget: true }, consultationMinGroupSize: 5, structureView: structuredClone(DEFAULT_STRUCTURE_VIEW),
      },
    },
    people, memberships, units, positions, assignments,
    fourQEntries: [...fourQEntries, ...formationCards],
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
    ].map(([k, t]): KpiTarget => ({ ...base, id: id(`kt-${k}-${FY}`), kpiId: id(`k${k}`), financialYear: FY, target: t as number })).concat(
      // v0.24.0 (B5): the closed years' targets under the plan in force.
      ([['1.1.1', 2024, 82], ['1.1.1', 2025, 86], ['1.2.1', 2024, 46], ['1.2.1', 2025, 43]] as const).map(([k, y, t]): KpiTarget => ({ ...base, id: id<'KpiTarget'>(`kt-${k}-${y}`), kpiId: id<'Kpi'>(`k${k}`), financialYear: y as never, target: t }))),
    kpiActuals: [{ ...base, id: id('ka-1.2.1-2026-06'), kpiId: id('k1.2.1'), periodEnd: d('2026-06-30'), value: 47 },
      // v0.24.0 (B5, approved 6 November 2026): year-end results for FY2024 and FY2025, so Retraction has suggestions.
      ...([['1.1.1', 2024, 83], ['1.1.1', 2025, 87], ['1.2.1', 2024, 50], ['1.2.1', 2025, 49]] as const).map(([k, y, v]) => ({ ...base, id: id<'KpiActual'>(`ka-${k}-${y}-12`), kpiId: id<'Kpi'>(`k${k}`), periodEnd: d(`${y}-12-31`), value: v }))],
    baselineMeasures: formationBaselines,
    consultationRounds: [], consultationInputs: [], complianceItems: formationCompliance,
    resourceEnvelopes: [], themes: [], indicativeCosts: [], planDocuments: [], communicationRecords, surveyRounds, surveyResponses, surveyReceipts, kpiBreakdowns: [], kpiShares: [], activityProposals: [], shareReadings: [], dependencies: draftDependencies,
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
      // v0.22.0 (approved with the prototype, 6 November 2026): Esther Banda's FY2026 contract, drafted by the
      // Commercial Manager, with the problems the checks are there to catch.
      { ...base, id: id('pc-co-2026'), personId: per('co'), positionId: pos('co'), financialYear: FY, status: 'draft', signedByEmployee: null, signedBySupervisor: null, version: 1, previousVersionId: null, employeeNote: null, preIssueCheck: null },
    ],
    contractObjectives: [
      signed(act('1.2.1.3'), 'Replace 400 faulty meters on route', 400, 'meters', 50, 1),
      signed(act('1.1.1.1'), 'Complete scheduled meter readings', 2400, 'readings', 50, 2),
      // v0.23.0 (A5): mid-year targets on Esther Banda's draft, half the full year.
      { ...draftObjective('co-co-1', act('1.2.1.4').id, null, 'Run daily route briefings for the meter readers', 240, 'briefings', 40), periodTargets: [{ periodEnd: d('2026-06-30'), value: 120 }] },
      { ...draftObjective('co-co-2', act('1.1.1.1').id, null, 'Complete monthly meter-reading routes in Zones A to C', 2400, 'readings', 40), periodTargets: [{ periodEnd: d('2026-06-30'), value: 1200 }] },
      draftObjective('co-co-3', null, 'Monthly commercial report', 'Submit the monthly commercial report by the 12th', 12, 'reports', 30),
    ],
    progressUpdates: ([
      ['co-b-1', 140], ['co-b-2', 2210],
    ] as const).map(([c, q]): ProgressUpdate => ({
      ...base, id: id(`pu-${c}`), contractObjectiveId: id(c), periodEnd: d('2026-06-30'), quantityDone: q, note: '', evidence: 'Route sheet',
      verified: { at: dt('2026-07-03T09:00:00+02:00'), byMembershipId: id('m-co') },
      sync: { capturedOffline: false, capturedAt: dt('2026-07-01T16:00:00+02:00'), syncedAt: dt('2026-07-01T16:00:00+02:00') },
      returned: null,
    })).concat([{
      // OP-11 (approved 2 November 2026): 260 meters at 30 September 2026, saved offline, waiting for the Commercial Officer.
      orgId, id: id('pu-co-b-1-2026-09'), contractObjectiveId: id('co-b-1'), periodEnd: d('2026-09-30'), quantityDone: 260, note: '', evidence: 'Job cards',
      created: { at: dt('2026-10-03T07:55:00+02:00'), byMembershipId: id('m-mrb') }, updated: { at: dt('2026-10-03T07:55:00+02:00'), byMembershipId: id('m-mrb') },
      verified: null, returned: null,
      sync: { capturedOffline: true, capturedAt: dt('2026-10-02T15:40:00+02:00'), syncedAt: dt('2026-10-03T07:55:00+02:00') },
    }]),
    // One open mid-year review for the Zone B contract (approved 23 October 2026). Scores are computed, never stored here.
    reviews: [{
      ...base, id: id('rv-mrb-2026-mid'), contractId: id('pc-mrb-2026'), kind: 'mid_year', selfAssessment: null, supervisorAssessment: null,
      status: 'open', adjustments: [], notAssessable: [], competencyRatings: [], returnedByReviewer: null, reviewerCheck: null, employeeAcknowledgement: null, finalResult: null,
    }],
    // R1: preset A with the safeguards at their defaults; locked while the appraisal round is open.
    ratingSchemes: [{
      ...base, id: id('rs-a'), preset: 'A', bands: RATING_PRESETS.A, competencySection: { enabled: false, weightPct: 0 },
      floorRule: false, highAchievementFlagAt: 1.5, lockedByCycleId: id('cy-appraisal-2026'),
    }, FY2027_POLICY_DRAFT],
    workshops: [],
    formationDeadlines: [],
    acknowledgements: [],
    // The imported plan's cascade was published when the plan was brought in (section 28).
    gateEvents: [seededPublication(orgId, PLAN, id('m-spm'), dt('2026-01-20T09:00:00+02:00'))],
    // The structure was confirmed by the organisation administrator on 15 January 2026 (D7-9).
    auditEntries: [seededConfirmation(orgId, id('m-hrm'), dt('2026-01-15T09:00:00+02:00'), { units: units.length, positions: positions.length, people: people.length })],
    sourceDocuments: formationDocs,
    // The same drafting task also drafted the baselines and the compliance items read from documents (part 11c).
    aiTasks: [communicationAi, { ...formationAi, outputRefs: [...formationAi.outputRefs, ...formationBaselines.map((b) => ({ type: 'BaselineMeasure', id: b.id as string })), ...formationCompliance.filter((c) => c.provenance.kind === 'document').map((c) => ({ type: 'ComplianceItem', id: c.id as string }))] }],
    visionStatements: [],
  };
}

/*
 * Part 11e (D16-11, wording approved 2 November 2026): G1's communication record, its three versions drafted by the AI
 * stub and accepted by the Strategy office, and the Commercial meeting on 15 October 2026 (moved from 22 October so it
 * lies before both review-build dates).
 */
const COMM_AI = id<'AiTask'>('ai-comm-g1');
// v0.19.0 (approved 5 November 2026): G1's record and a new G2 record, each "why" repeating the goal's approved 4Q
// reason, written in plain words that do not name the goal, so the staff survey can ask about them. Both are dated
// 2 February 2026, so the "Start of year, 2026" survey round could have run.
const commStamp: Stamp = { at: dt('2026-02-02T10:00:00+02:00'), byMembershipId: id('m-spm') };
const commAccepted: Stamp = { at: dt('2026-02-02T10:30:00+02:00'), byMembershipId: id('m-spm') };
const T = en.communication.template;
const COMM = {
  g1: { what: 'Every customer is billed for what they actually use, and more of what we bill is collected.', why: 'Billed revenue has not covered operating and maintenance costs.' },
  g2: { what: 'Fewer and shorter interruptions to supply, as ageing pumps are renewed on a plan.', why: 'Ageing pumping equipment causes frequent supply interruptions.' },
};
const record = (goal: 'g1' | 'g2', meetings: CommunicationRecord['meetings']): CommunicationRecord => {
  const { what, why } = COMM[goal];
  return {
    orgId, id: id(`cr-${goal}`), goalId: id(goal), created: commStamp, updated: commAccepted,
    content: what, context: why, concept: T.how,
    audienceVersions: ([
      ['board', T.board(what, why, T.how)], ['managers', T.managers(what, why)], ['staff', T.staff(what, why)],
    ] as const).map(([audience, text]) => ({ audience, text, draft: { state: 'accepted' as const, provenance: { kind: 'ai_suggestion' as const, aiTaskId: COMM_AI }, decided: commAccepted } })),
    meetings,
  };
};
const communicationRecords: CommunicationRecord[] = [
  record('g1', [{ unitId: id('u-com'), heldOn: d('2026-10-15'), feedbackSummary: 'Meter readers asked how the new targets affect their routes' }]),
  record('g2', []),
];

/**
 * Staff survey (v0.19.0; approved 5 November 2026). "Start of year, 2026" closed with 12 answers from the 13 people
 * asked on 9 February (the Head of Commercial did not answer). Six are stored under Commercial; the other six
 * (head office, Finance and Operations, each under five people) under the organisation. "Mid-year, 2026" is open,
 * asks about plan changes, and has no answers yet.
 */
const surveyStamp = (on: string): Stamp => ({ at: dt(`${on}T08:00:00+02:00`), byMembershipId: id('m-spm') });
const surveyRounds: SurveyRound[] = [
  {
    orgId, id: id('sr-2026-start'), planId: PLAN, title: 'Start of year, 2026', asksAboutChanges: false, goalIds: [id('g1'), id('g2')],
    opensOn: d('2026-02-09'), closesOn: d('2026-03-06'), status: 'closed', openedBy: surveyStamp('2026-02-09'), closedBy: surveyStamp('2026-03-06'), closingNote: null, concernSummary: null,
    created: surveyStamp('2026-02-03'), updated: surveyStamp('2026-03-06'),
  },
  {
    orgId, id: id('sr-2026-mid'), planId: PLAN, title: 'Mid-year, 2026', asksAboutChanges: true, goalIds: [id('g1'), id('g2')],
    opensOn: d('2026-10-12'), closesOn: d('2026-11-08'), status: 'open', openedBy: surveyStamp('2026-10-12'), closedBy: null, closingNote: null, concernSummary: null,
    created: surveyStamp('2026-10-09'), updated: surveyStamp('2026-10-12'),
  },
];
const SURVEY_KEYS: [SurveyQuestionKey, string | null][] = [['content', 'g1'], ['content', 'g2'], ['context', 'g1'], ['context', 'g2'], ['own_goal', null], ['own_role', null], ['team_met', null], ['raise_concerns', null], ['views_passed_on', null]];
const answers = (unit: string, v: SurveyAnswerValue[], concern: string | null = null) => ({ unit, v, concern });
const SEEDED_ANSWERS = [
  answers('u-com', ['right', 'right', 'right', 'wrong', 'right', 'agree', 'yes', 'yes', 'no'], 'Meter readers heard about the new meter targets but not why tariffs are under review.'),
  answers('u-com', ['right', 'wrong', 'right', 'right', 'right', 'agree', 'yes', 'yes', 'not_sure']),
  answers('u-com', ['right', 'right', 'dont_know', 'right', 'right', 'partly', 'yes', 'not_sure', 'no']),
  answers('u-com', ['wrong', 'right', 'right', 'right', 'wrong', 'partly', 'yes', 'yes', 'yes']),
  answers('u-com', ['right', 'right', 'right', 'dont_know', 'right', 'agree', 'no', 'no', 'no'], 'Our section has not had a meeting about the plan yet.'),
  answers('u-com', ['right', 'dont_know', 'wrong', 'right', 'dont_know', 'disagree', 'yes', 'yes', 'not_sure']),
  answers('u-org', ['right', 'right', 'right', 'right', 'right', 'agree', 'yes', 'yes', 'yes']),
  answers('u-org', ['right', 'right', 'right', 'right', 'not_linked', 'agree', 'yes', 'yes', 'yes']),
  answers('u-org', ['right', 'wrong', 'right', 'right', 'right', 'agree', 'no', 'yes', 'not_sure']),
  answers('u-org', ['right', 'right', 'right', 'wrong', 'right', 'partly', 'no', 'not_sure', 'no'], 'The plan was emailed to us, but nobody explained it.'),
  answers('u-org', ['dont_know', 'right', 'right', 'right', 'dont_know', 'partly', 'no', 'yes', 'not_sure']),
  answers('u-org', ['right', 'right', 'dont_know', 'right', 'right', 'agree', 'yes', 'yes', 'yes']),
];
// Responses are listed in a computed order, never in the order they arrived (SV-2); ids carry no link to receipts.
const surveyResponses: SurveyResponse[] = SEEDED_ANSWERS.map((a, i) => ({
  orgId, id: id(`rs-start-${String(i + 1).padStart(2, '0')}`), roundId: id('sr-2026-start'), unitId: id(a.unit),
  results: SURVEY_KEYS.map(([question, goalId], k) => ({ question, goalId: goalId ? id(goalId) : null, value: a.v[k]! })), concern: a.concern,
}));
const surveyReceipts: SurveyReceipt[] = PEOPLE.filter((p) => p.key !== 'hoc').map((p, i) => ({
  orgId, id: id(`srr-start-${p.key}`), roundId: id('sr-2026-start'), membershipId: id(`m-${p.key}`), outcome: 'answered', on: d(`2026-02-${String(9 + (i % 9)).padStart(2, '0')}`),
}));

const communicationAi: AiTask = {
  orgId, id: COMM_AI, kind: 'draft', requested: commStamp, inputRefs: [{ type: 'Goal', id: 'g1' }], outputRefs: [{ type: 'CommunicationRecord', id: 'cr-g1' }], model: 'stub',
};

/** The sample's clock. Rules never read the system clock; "now" is always passed in. */
export const SAMPLE_NOW = '2026-10-18' as ISODate;
