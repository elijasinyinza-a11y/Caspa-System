/**
 * CASPA™ data contract — v1.1
 *
 * The single shape of every record in CASPA™. Screens, the sample store, the
 * rules engine and (later) the backend all use these types. Nothing outside
 * this contract is a source of truth.
 *
 * Standing rules this file encodes:
 * - Organisation is the tenant: every stored record carries orgId.
 * - Positions, not people, own cascade records (decision A2).
 * - Every figure is computed once by a selector or the rules engine; there
 *   are no stored totals, percentages, counts or findings.
 * - Money is stored as integer minor units (e.g. ngwee) to avoid rounding.
 * - Live links for traceability; frozen snapshots for signed commitments.
 *
 * v1.0 closes the v0.1 PENDING items: KPI progress rules (P1–P10), the
 * rating scheme (R1–R10 plus over-achievement safeguards) and the strategy
 * formation flow (F1–F5 with AI assistance). SLI is removed.
 *
 * v1.1 (reconciliation, 18 October 2026):
 *  1. Activity.decisionLevel may be null on drafts; the rule
 *     STRUCT-ACTIVITY-NO-6P blocks cascade.publish, so no activity is
 *     published without exactly one 6P level.
 *  2. DraftMeta added to Activity and Deficiency (AI-drafted decision-map rows).
 *  3. Assigned role 'compliance'; compliance items are approved by it.
 *  4. PlanDocument added; figures are rendered from records, never typed.
 *  5. ContractObjective carries a personal title and quantity target,
 *     editable until signature and frozen in the snapshot.
 *  6. Activities are viewable by all members (line of sight); budget
 *     amounts stay restricted.
 *  7. Finance may draft budget lines (relinking during consolidation).
 *  8. ConsultationRound gains 'scheduled' status and an attribution setting.
 *  9. Formation stages carry an owner; organisations record whether board
 *     approval is required for the plan and the budget.
 * Friction signals are removed for now and may return only with a confirmed
 * source. Leadership assessments are described generically.
 */

/* ───────────────────────── Primitives ───────────────────────── */

type Brand<K, T extends string> = K & { readonly __brand: T };
export type Id<T extends string> = Brand<string, T>;

/** Calendar date, ISO 8601: "2026-10-14". */
export type ISODate = Brand<string, 'ISODate'>;
/** Instant, ISO 8601 with offset: "2026-10-14T09:30:00+02:00". */
export type ISODateTime = Brand<string, 'ISODateTime'>;
/** Financial year identified by the calendar year it starts in. */
export type FinancialYear = number;

/** Integer amount in the currency's minor unit. Never a float. */
export interface Money {
  amountMinor: number;
  currency: string; // ISO 4217, always the organisation's base currency in v1 (L1)
}

export interface Stamp {
  at: ISODateTime;
  byMembershipId: Id<'Membership'>;
}

export interface Audited {
  created: Stamp;
  updated: Stamp;
}

export interface OrgScoped {
  orgId: Id<'Organisation'>;
}

/** Where a record's content came from. AI output always points to its source. */
export type Provenance =
  | { kind: 'manual' }
  | { kind: 'document'; sourceDocumentId: Id<'SourceDocument'>; page: number | null; excerpt: string }
  | { kind: 'interview'; aiTaskId: Id<'AiTask'> }
  | { kind: 'ai_suggestion'; aiTaskId: Id<'AiTask'> };

/** Every AI-produced item is a draft until a person accepts it. */
export interface DraftMeta {
  state: 'ai_draft' | 'accepted' | 'rejected' | 'human';
  provenance: Provenance;
  decided: Stamp | null; // who accepted or rejected it
}

/* ───────────────────────── Framework enums (book terms, not renameable — T2) ───────────────────────── */

/** The six levels of business decision making, Business Beyond the Strategic Plan, ch. 7. */
export type SixPLevel =
  | 'principle'
  | 'process'
  | 'people'
  | 'policy'
  | 'procedures'
  | 'practices';

/** Figure 10 scope, shown as the short description beside each level. */
export const SIX_P_SCOPE: Record<SixPLevel, string> = {
  principle: 'Value, customer, capital, people',
  process: 'Technology, infrastructure',
  people: 'Organisational structure, people skills, behaviours and attitudes',
  policy: 'Investment, labour, statutory, regulatory, industrial relations, asset management',
  procedures: 'Standard operating procedures',
  practices: 'Organisational culture',
};

/* ───────────────────────── Organisation and settings ───────────────────────── */

/** System terms whose display labels an organisation may rename (T1). */
export type SystemTerm =
  | 'goal'
  | 'objective'
  | 'kpi'
  | 'activity'
  | 'deficiency'
  | 'budgetLine'
  | 'contractObjective';

export interface TermLabel {
  singular: string;
  plural: string;
}

/** Book default perspectives (T3). Optional per plan; labels renameable. */
export type PerspectiveKey = 'customer' | 'internal' | 'innovation_learning' | 'financial';

export interface Perspective {
  key: PerspectiveKey;
  label: string; // default: Customer, Internal, Innovation and learning, Financial
}

export interface Organisation extends Audited {
  id: Id<'Organisation'>;
  name: string;
  countryCode: string; // ISO 3166-1 alpha-2, drives formats (L2)
  timeZone: string; // IANA, e.g. "Africa/Lusaka" (C9)
  baseCurrency: string; // ISO 4217 (L1)
  financialYearStartMonth: number; // 1–12 (C2)
  termLabels: Record<SystemTerm, TermLabel>;
  perspectives: Perspective[] | null; // null = scorecard not used
  settings: {
    overdueEscalationDays: number; // default 7 (C7)
    reviewModel: 'mid_year_and_annual' | 'quarterly'; // C4
    kpiStatus: { onTrackAt: number; atRiskAt: number }; // share of expected-to-date, defaults 0.9 / 0.7 (P10)
    ratingSchemeId: Id<'RatingScheme'>; // R1
    aiEnabled: boolean; // organisation may switch AI assistance off
    boardApprovalRequired: { plan: boolean; budget: boolean }; // v1.1: plan.confirm and budget.approve require a BoardApproval when true
    consultationMinGroupSize: number; // v1.1: default 5; under 'unit_only', smaller units are shown as their parent unit
  };
}

/* ───────────────────────── People, membership and roles (B1) ───────────────────────── */

export interface Person {
  id: Id<'Person'>;
  fullName: string;
  email: string;
}

/** Assigned roles. Supervisor, owner and employee are derived, never assigned. */
export type AssignedRole =
  | 'executive'
  | 'strategy_office'
  | 'finance'
  | 'hr'
  | 'facilitator'
  | 'compliance' // v1.1: compliance or legal officer
  | 'org_admin';

export interface Membership extends OrgScoped, Audited {
  id: Id<'Membership'>;
  personId: Id<'Person'>;
  roles: AssignedRole[];
  startsOn: ISODate;
  endsOn: ISODate | null; // required when roles include 'facilitator' (B4)
  status: 'active' | 'suspended' | 'ended';
}

/* ───────────────────────── Organisation structure (A1–A3) ───────────────────────── */

export interface OrgUnit extends OrgScoped, Audited {
  id: Id<'OrgUnit'>;
  parentId: Id<'OrgUnit'> | null; // null = the organisation's top unit
  name: string;
  unitType: string; // organisation's own word: "District", "Department", ...
}

export interface Position extends OrgScoped, Audited {
  id: Id<'Position'>;
  unitId: Id<'OrgUnit'>;
  title: string; // a position with no current holder is a role placeholder
  reportsToPositionId: Id<'Position'> | null; // one line only in v1 (A3)
}

export interface PositionAssignment extends OrgScoped, Audited {
  id: Id<'PositionAssignment'>;
  positionId: Id<'Position'>;
  personId: Id<'Person'>;
  kind: 'substantive' | 'acting';
  from: ISODate;
  to: ISODate | null;
}

/* ───────────────────────── Approvals ───────────────────────── */

export interface Confirmation extends Stamp {
  note?: string;
}

/** Board approval recorded as a reference, not as board accounts (B8). */
export interface BoardApproval {
  resolutionRef: string;
  date: ISODate;
}

/* ───────────────────────── Strategy ───────────────────────── */

export interface StrategicPlan extends OrgScoped, Audited {
  id: Id<'StrategicPlan'>;
  title: string;
  startYear: FinancialYear;
  endYear: FinancialYear;
  entryDoor: 'imported' | 'formed';
  status: 'draft' | 'confirmed' | 'active' | 'superseded'; // one active at a time (C1)
  confirmation: Confirmation | null; // by an Executive
  boardApproval: BoardApproval | null;
  formation: Record<FormationStage, { status: 'not_started' | 'open' | 'complete'; startsOn: ISODate | null; endsOn: ISODate | null; ownerPositionId: Id<'Position'> | null }> | null; // null for imported plans
  processOwnerPositionId: Id<'Position'> | null;
  /** No built-in timeline: an assigned person prepares the formation calendar. */
  calendar: {
    preparerMembershipId: Id<'Membership'> | null; // Head of Strategy, an assigned staff member, or the consultant
    published: Stamp | null; // nothing reaches participants until published
    visionTargetOn: ISODate | null; // targets only; gates never check dates
    planTargetOn: ISODate | null;
  } | null;
  currentRevision: number; // 0 until the first post-confirmation revision
}

/** A dated task in the formation calendar. Feeds owners' "Needs you" once the calendar is published. */
export interface FormationDeadline extends OrgScoped, Audited {
  id: Id<'FormationDeadline'>;
  planId: Id<'StrategicPlan'>;
  label: string;
  ownerPositionIds: Id<'Position'>[];
  dueOn: ISODate;
  completed: Stamp | null;
}

/** Changes to a confirmed plan: proposed, then confirmed by an Executive (new version). */
export interface PlanRevision extends OrgScoped, Audited {
  id: Id<'PlanRevision'>;
  planId: Id<'StrategicPlan'>;
  revision: number;
  summary: string;
  changedRecords: { type: 'Goal' | 'Objective' | 'Kpi' | 'KpiTarget'; id: string }[];
  status: 'proposed' | 'confirmed' | 'rejected';
  decision: Confirmation | null;
}

/* ───────────────────────── Strategy formation (F1–F5) ───────────────────────── */

export type FormationStage = 'conception' | 'consultation' | 'confirmation' | 'composition' | 'communication';

export interface SourceDocument extends OrgScoped, Audited {
  id: Id<'SourceDocument'>;
  title: string;
  kind: 'strategic_plan' | 'annual_report' | 'performance_report' | 'board_paper' | 'budget' | 'regulatory' | 'licence' | 'policy' | 'other';
  fileRef: string;
}

/** Table 2 of the book: three bands, four columns each. */
export type FourQCell =
  | { band: 'retraction' | 'repositioning'; column: 'successes' | 'success_factors' | 'failures' | 'failure_factors' }
  | { band: 'projection'; column: 'opportunities' | 'key_strategic_actions' | 'risks' | 'risk_strategies' };

export interface FourQEntry extends OrgScoped, Audited {
  id: Id<'FourQEntry'>;
  planId: Id<'StrategicPlan'>;
  cell: FourQCell;
  text: string;
  raisedByUnitIds: Id<'OrgUnit'>[]; // kept when merged
  scope: 'department' | 'organisation';
  mergedIntoId: Id<'FourQEntry'> | null; // consolidation keeps the original
  evidence: string | null;
  draft: DraftMeta;
}

export interface Theme extends OrgScoped, Audited {
  id: Id<'Theme'>;
  planId: Id<'StrategicPlan'>;
  title: string;
  fourQEntryIds: Id<'FourQEntry'>[];
  draft: DraftMeta;
}

/** Written by leadership. The AI never drafts these (F1); provenance must be manual. */
export interface VisionStatement extends OrgScoped, Audited {
  id: Id<'VisionStatement'>;
  planId: Id<'StrategicPlan'>;
  kind: 'vision' | 'mission';
  text: string;
  confirmation: Confirmation | null; // gate vision.confirm
}

export interface ConsultationRound extends OrgScoped, Audited {
  id: Id<'ConsultationRound'>;
  planId: Id<'StrategicPlan'>;
  audienceUnitIds: Id<'OrgUnit'>[] | 'all';
  opensOn: ISODate;
  closesOn: ISODate;
  status: 'scheduled' | 'open' | 'closed'; // opened and closed by the strategy office, not by the clock
  /** v1.1: the author is always kept in the audit trail; 'unit_only' shows only the unit on every screen. */
  attribution: 'named' | 'unit_only'; // default 'unit_only'
}

export interface ConsultationInput extends OrgScoped, Audited {
  id: Id<'ConsultationInput'>;
  roundId: Id<'ConsultationRound'>;
  kind: 'comment' | 'idea' | 'meeting_summary' | 'expert_input';
  unitId: Id<'OrgUnit'> | null;
  text: string;
  attachmentRef: string | null; // expert input, e.g. a leadership assessment report, held as a reference and never scored
}

export interface BaselineMeasure extends OrgScoped, Audited {
  id: Id<'BaselineMeasure'>;
  planId: Id<'StrategicPlan'>;
  name: string;
  unit: string;
  value: number;
  asOf: ISODate;
  sourceDescription: string;
  validated: Stamp | null; // a person vouches for it
  draft: DraftMeta;
}

export interface ComplianceItem extends OrgScoped, Audited {
  id: Id<'ComplianceItem'>;
  planId: Id<'StrategicPlan'>;
  title: string;
  kind: 'law' | 'regulation' | 'licence_condition' | 'policy' | 'standard';
  provenance: Provenance; // AI extractions must be kind 'document', never general knowledge
  flaggedByUnitIds: Id<'OrgUnit'>[];
  outcome: 'aligned' | 'needs_change' | 'not_applicable' | null;
  reviewed: Stamp | null;
}

export interface ResourceEnvelope extends OrgScoped, Audited {
  id: Id<'ResourceEnvelope'>;
  planId: Id<'StrategicPlan'>;
  goalId: Id<'Goal'> | null; // null = whole plan
  financialYear: FinancialYear;
  amount: Money;
}

export interface CommunicationRecord extends OrgScoped, Audited {
  id: Id<'CommunicationRecord'>;
  goalId: Id<'Goal'>;
  content: string; // what changes
  context: string; // why
  concept: string; // how: methods and principles
  audienceVersions: { audience: 'board' | 'managers' | 'staff'; text: string; draft: DraftMeta }[];
  meetings: { unitId: Id<'OrgUnit'>; heldOn: ISODate; feedbackSummary: string }[];
}

/**
 * Workshops are configurable: an organisation may merge, drop or change the format
 * of any workshop to suit its budget. Gates never check that a workshop happened;
 * they check the data and confirmations it produces. A purpose with no session
 * planned raises an advisory flag to the process owner only.
 */
export type WorkshopPurpose = 'kickoff' | 'four_q_review' | 'vision' | 'composition' | 'validation' | 'launch';

export interface Workshop extends OrgScoped, Audited {
  id: Id<'Workshop'>;
  planId: Id<'StrategicPlan'>;
  purposes: WorkshopPurpose[]; // more than one when sessions are merged
  format: 'in_person' | 'online' | 'hybrid' | 'async_review';
  scheduledOn: ISODate | null; // a single day for sessions
  window: { opensOn: ISODate; closesOn: ISODate } | null; // for async_review
  participantPositionIds: Id<'Position'>[]; // 'vision' must include leadership positions
  recordingRef: string | null;
  status: 'planned' | 'held' | 'cancelled';
  decisionLog: {
    decision: string;
    actions: { text: string; ownerPositionId: Id<'Position'>; dueOn: ISODate }[]; // actions feed "Needs you"
  }[];
}

/**
 * v1.1: the plan document (F4 step 9). Sections hold narrative text only.
 * Figures, names and the goal/objective/KPI tables are rendered from records
 * at display or export time through references of the form
 * {{Type:id:field}}, so the document never holds a hand-typed figure.
 */
export interface PlanDocument extends OrgScoped, Audited {
  id: Id<'PlanDocument'>;
  planId: Id<'StrategicPlan'>;
  basedOnRevision: number; // StrategicPlan.currentRevision when drafted
  status: 'draft' | 'final';
  finalised: Stamp | null;
  sections: {
    id: string;
    kind: 'executive_summary' | 'narrative' | 'goal_narrative';
    goalId: Id<'Goal'> | null; // required for 'goal_narrative'
    order: number;
    heading: string;
    text: string;
    draft: DraftMeta;
  }[];
}

/** Log of every AI call, for audit. Ratings, salaries and personal data are never sent. */
export interface AiTask extends OrgScoped {
  id: Id<'AiTask'>;
  kind: 'extract' | 'interview' | 'transcribe' | 'merge' | 'cluster' | 'summarise' | 'draft' | 'language_review' | 'explain';
  requested: Stamp;
  inputRefs: { type: string; id: string }[];
  outputRefs: { type: string; id: string }[];
  model: string;
}

export interface Goal extends OrgScoped, Audited {
  id: Id<'Goal'>;
  planId: Id<'StrategicPlan'>;
  code: string; // "G1"
  title: string;
  perspective: PerspectiveKey | null;
  ownerPositionId: Id<'Position'> | null;
  themeIds: Id<'Theme'>[];
  fourQEntryIds: Id<'FourQEntry'>[]; // traceability starts here
  draft: DraftMeta;
}

export interface Objective extends OrgScoped, Audited {
  id: Id<'Objective'>;
  goalId: Id<'Goal'>;
  code: string; // "O1.2"
  title: string;
  ownerPositionId: Id<'Position'> | null;
  proposedByPositionId: Id<'Position'> | null;
  fourQEntryIds: Id<'FourQEntry'>[];
  draft: DraftMeta;
}

export type ReportingFrequency = 'monthly' | 'quarterly' | 'biannual' | 'annual';

export interface Kpi extends OrgScoped, Audited {
  id: Id<'Kpi'>;
  objectiveId: Id<'Objective'>;
  code: string; // "K1.2.1"
  name: string;
  unit: string; // "%", "hours per day", …
  direction: 'higher_is_better' | 'lower_is_better' | 'milestone';
  aggregation: 'latest' | 'sum' | 'average'; // P2
  baseline: number | null; // null allowed; see P4
  baselineMeasureId: Id<'BaselineMeasure'> | null;
  milestones: { id: string; label: string; weight: number; completedOn: ISODate | null }[]; // P5, milestone KPIs only
  reportingFrequency: ReportingFrequency; // C4
  ownerPositionId: Id<'Position'> | null;
  draft: DraftMeta;
  // Progress, status and caps are computed by the rules engine (P1, P3, P6–P10), never stored.
}

export interface KpiTarget extends OrgScoped, Audited {
  id: Id<'KpiTarget'>;
  kpiId: Id<'Kpi'>;
  financialYear: FinancialYear;
  target: number;
}

export interface KpiActual extends OrgScoped, Audited {
  id: Id<'KpiActual'>;
  kpiId: Id<'Kpi'>;
  periodEnd: ISODate;
  value: number;
}

/** In-year changes to strategic values go through propose → confirm (C6). */
export interface ChangeProposal extends OrgScoped, Audited {
  id: Id<'ChangeProposal'>;
  subject: { type: 'kpi_target'; id: Id<'KpiTarget'> } | { type: 'kpi_baseline'; id: Id<'Kpi'> };
  from: number;
  to: number;
  reason: string;
  status: 'pending' | 'confirmed' | 'rejected';
  decision: Confirmation | null; // by an Executive
}

/* ───────────────────────── Cascade ───────────────────────── */

export interface Activity extends OrgScoped, Audited {
  id: Id<'Activity'>;
  kpiId: Id<'Kpi'>; // parent; objective and goal are derived through it
  financialYear: FinancialYear;
  code: string; // "A1.2.1.3"
  title: string;
  decisionLevel: SixPLevel | null; // exactly one before publication (6P model); null only on drafts, blocks cascade.publish
  ownerPositionId: Id<'Position'> | null;
  reportingFrequency: ReportingFrequency;
  evidence: string; // means of verification
  quantityTarget: { value: number; unit: string } | null; // e.g. 1,800 meters
  dependsOn: Id<'Activity'>[]; // order of priority (Coordination ii)
  status: 'planned' | 'in_progress' | 'complete' | 'archived';
  draft: DraftMeta; // v1.1
}

export interface ActivityProgress extends OrgScoped, Audited {
  id: Id<'ActivityProgress'>;
  activityId: Id<'Activity'>;
  periodEnd: ISODate;
  quantityDone: number | null;
  note: string;
}

/** A row of the six-point decision map (Table 4). */
export interface Deficiency extends OrgScoped, Audited {
  id: Id<'Deficiency'>;
  objectiveId: Id<'Objective'>;
  level: SixPLevel; // where the deficiency occurs; may differ from the solution's level
  description: string;
  probableCause: string;
  effects: string;
  correctiveActivityIds: Id<'Activity'>[]; // empty = unaddressed
  timeframe: string;
  draft: DraftMeta; // v1.1: the AI may draft rows with a suggested level; the owner confirms
}

/* ───────────────────────── Cycles and gates (C3, C7) ───────────────────────── */

export type CycleKind = 'cascade' | 'budget' | 'contracts' | 'appraisal' | 'year_end';

export type GateCode =
  | 'vision.confirm'
  | 'plan.confirm'
  | 'cascade.publish'
  | 'budget.submit_unit'
  | 'budget.submit_consolidated'
  | 'budget.approve'
  | 'budget.lock'
  | 'contract.issue'
  | 'contract.sign'
  | 'review.submit_self'
  | 'review.complete'
  | 'appraisal.close'
  | 'year.close';

export interface Cycle extends OrgScoped, Audited {
  id: Id<'Cycle'>;
  kind: CycleKind;
  financialYear: FinancialYear;
  status: 'not_started' | 'open' | 'in_review' | 'closed';
  gateDueDates: Partial<Record<GateCode, ISODate>>;
}

/** Written when someone attempts a gate. Approver must differ from submitter (B7). */
export interface GateEvent extends OrgScoped {
  id: Id<'GateEvent'>;
  gate: GateCode;
  subject: { type: string; id: string };
  attempted: Stamp;
  outcome: 'passed' | 'blocked';
  blockingFindingKeys: string[];
  advisoryAtGate: { findingKey: string; acknowledgementId: Id<'Acknowledgement'> | null }[];
}

/* ───────────────────────── Plan ───────────────────────── */

export interface BudgetVersion extends OrgScoped, Audited {
  id: Id<'BudgetVersion'>;
  cycleId: Id<'Cycle'>; // kind 'budget'
  version: number; // revisions are new versions (C5)
  status: 'draft' | 'submitted' | 'approved' | 'locked' | 'superseded';
  approval: Confirmation | null;
  boardApproval: BoardApproval | null;
}

export type FundingSource = 'own_revenue' | 'government_grant' | 'donor' | 'loan' | 'other';

export interface BudgetLine extends OrgScoped, Audited {
  id: Id<'BudgetLine'>;
  versionId: Id<'BudgetVersion'>;
  activityId: Id<'Activity'> | null; // null is an orphan and raises a finding
  holderUnitId: Id<'OrgUnit'>;
  description: string;
  amount: Money;
  costCategory: 'personnel' | 'operating' | 'capital' | 'other'; // personnel detail: Finance and HR only (B6)
  fundingSource: FundingSource; // L1
  fundingNote: string | null;
}

/* ───────────────────────── Performance ───────────────────────── */

export interface PerformanceContract extends OrgScoped, Audited {
  id: Id<'PerformanceContract'>;
  personId: Id<'Person'>;
  positionId: Id<'Position'>;
  financialYear: FinancialYear;
  status: 'draft' | 'issued' | 'signed' | 'closed';
  signedByEmployee: Stamp | null;
  signedBySupervisor: Stamp | null;
}

/** Live link to the source plus a frozen copy taken at signature (behaviour 5). */
export interface ContractObjective extends OrgScoped, Audited {
  id: Id<'ContractObjective'>;
  contractId: Id<'PerformanceContract'>;
  sourceActivityId: Id<'Activity'>;
  /** v1.1: the employee's share of the activity, set by the supervisor; editable until signature. */
  title: string;
  quantityTarget: { value: number; unit: string } | null; // e.g. 400 of the activity's 1,800 meters
  snapshot: {
    title: string; // frozen copy of ContractObjective.title
    quantityTarget: { value: number; unit: string } | null; // frozen copy of ContractObjective.quantityTarget
    sourceFingerprint: string; // compared with the live source to raise "upstream changed"
    frozenAt: ISODateTime;
  } | null; // null until signed
  direction: 'higher_is_better' | 'lower_is_better';
  weightPct: number; // set by supervisor, totals 100 per contract, frozen at signature (R4)
}

export interface ProgressUpdate extends OrgScoped, Audited {
  id: Id<'ProgressUpdate'>;
  contractObjectiveId: Id<'ContractObjective'>;
  periodEnd: ISODate;
  quantityDone: number | null;
  note: string;
  evidence: string; // note or document reference (R6)
  verified: Stamp | null; // counts towards achievement only once verified by the supervisor
  sync: { capturedOffline: boolean; capturedAt: ISODateTime; syncedAt: ISODateTime | null }; // K1
}

export interface Review extends OrgScoped, Audited {
  id: Id<'Review'>;
  contractId: Id<'PerformanceContract'>;
  kind: 'mid_year' | 'quarterly' | 'annual';
  selfAssessment: { text: string; submitted: Stamp | null; capturedOffline: boolean } | null;
  supervisorAssessment: { text: string; completed: Stamp | null } | null;
  status: 'open' | 'self_submitted' | 'completed';
  adjustments: { contractObjectiveId: Id<'ContractObjective'>; bandDelta: -1 | 1; reason: string; by: Stamp }[]; // R7
  notAssessable: { contractObjectiveId: Id<'ContractObjective'>; reason: string; hrApproval: Stamp | null }[]; // R9
  competencyRatings: { label: string; score: 1 | 2 | 3 | 4 | 5; justification: string }[]; // R5, if enabled
  returnedByReviewer: { reason: string; by: Stamp } | null; // R8
  employeeAcknowledgement: { at: ISODateTime; disagreement: string | null } | null; // R8
  /** Frozen at appraisal.close; until then scores are computed live and shown as provisional (R9). */
  finalResult: { overallScore: number; label: string; schemeId: Id<'RatingScheme'>; frozenAt: ISODateTime } | null;
  // Visibility: employee, supervisor, next-level reviewer, HR (B5).
}

/** R1–R4. Locked while an appraisal round is open. Bands: lower bound inclusive, unrounded values. */
export interface RatingScheme extends OrgScoped, Audited {
  id: Id<'RatingScheme'>;
  preset: 'A' | 'B' | 'custom'; // A is the default
  bands: { score: 1 | 2 | 3 | 4 | 5; label: string; minAchievement: number | null }[]; // null = no lower bound
  competencySection: { enabled: boolean; weightPct: number };
  floorRule: boolean; // off by default: any objective scored 1 caps overall at 3
  highAchievementFlagAt: number; // default 1.5 (150%), advisory to next-level reviewer
  lockedByCycleId: Id<'Cycle'> | null;
}

export const RATING_PRESETS: Record<'A' | 'B', RatingScheme['bands']> = {
  A: [
    { score: 5, label: 'Outstanding', minAchievement: 1.2 },
    { score: 4, label: 'Exceeds', minAchievement: 1.05 },
    { score: 3, label: 'Meets', minAchievement: 0.95 },
    { score: 2, label: 'Partly meets', minAchievement: 0.8 },
    { score: 1, label: 'Does not meet', minAchievement: null },
  ],
  B: [
    { score: 5, label: 'Outstanding', minAchievement: 1.13 },
    { score: 4, label: 'Exceeds', minAchievement: 1.05 },
    { score: 3, label: 'Meets', minAchievement: 0.97 },
    { score: 2, label: 'Partly meets', minAchievement: 0.89 },
    { score: 1, label: 'Does not meet', minAchievement: null },
  ],
};

/* ───────────────────────── Integrity ───────────────────────── */

/** A rule lives in the rules engine. Findings are computed from it, never stored. */
export interface IntegrityRule {
  id: string; // stable, e.g. "STRUCT-BUDGETLINE-NO-ACTIVITY"
  source: 'structural' | 'book'; // book rules need Elijah's confirmation first
  description: string;
  blocksAt: GateCode[]; // advisory everywhere else (behaviour 2)
}

export interface Finding {
  key: string; // `${ruleId}:${subjectType}:${subjectId}` — stable across recomputation
  ruleId: string;
  subject: { type: string; id: string };
  message: string; // plain language; must respect viewer permissions (behaviour 4)
  blocksAt: GateCode[];
  routeToPositionIds: Id<'Position'>[];
}

/** The only stored part of integrity (behaviour 6). Hard blocks cannot be acknowledged. */
export interface Acknowledgement extends OrgScoped {
  id: Id<'Acknowledgement'>;
  findingKey: string;
  reason: string;
  acknowledged: Stamp;
}

/* ───────────────────────── Audit ───────────────────────── */

export interface AuditEntry extends OrgScoped {
  id: Id<'AuditEntry'>;
  at: ISODateTime;
  actorMembershipId: Id<'Membership'>;
  action: string; // "create", "update", "confirm", "approve", "sign", "gate.attempt", …
  entity: { type: string; id: string };
  before: unknown;
  after: unknown;
}

/* ───────────────────────── Permissions (B2, B3) ───────────────────────── */

export type Action = 'view' | 'draft' | 'propose' | 'confirm' | 'approve' | 'sign';

/** Who may act: an assigned role, or a relation derived from structure. */
export type Principal =
  | AssignedRole
  | 'owner' // holds the owning position
  | 'objective_owner'
  | 'budget_holder' // holds a position in the line's holder unit
  | 'self' // the contract's employee
  | 'supervisor' // holds the position the employee's position reports to
  | 'next_level_reviewer' // the supervisor's supervisor
  | 'all_members';

export type PermissionMatrix = Partial<Record<string, Partial<Record<Action, Principal[]>>>>;

export const PERMISSIONS: PermissionMatrix = {
  StrategicPlan: { view: ['all_members'], draft: ['strategy_office', 'facilitator'], confirm: ['executive'] },
  Goal: { view: ['all_members'], draft: ['strategy_office', 'facilitator'], confirm: ['executive'] },
  Objective: { view: ['all_members'], draft: ['strategy_office', 'facilitator'], confirm: ['executive'] },
  Kpi: { view: ['all_members'], draft: ['owner', 'strategy_office'], propose: ['owner', 'strategy_office'], confirm: ['executive'] },
  Activity: { view: ['all_members'], draft: ['objective_owner', 'owner', 'strategy_office', 'facilitator'], approve: ['strategy_office'] },
  Deficiency: { view: ['executive', 'strategy_office', 'objective_owner', 'facilitator'], draft: ['objective_owner', 'strategy_office', 'facilitator'] },
  BudgetLine: { view: ['finance', 'executive', 'budget_holder'], draft: ['budget_holder', 'finance'], approve: ['finance', 'executive'] },
  PerformanceContract: { view: ['self', 'supervisor', 'hr'], draft: ['supervisor'], sign: ['self', 'supervisor'] },
  Review: { view: ['self', 'supervisor', 'next_level_reviewer', 'hr'], draft: ['self', 'supervisor'] },
  VisionStatement: { view: ['all_members'], draft: ['executive'], confirm: ['executive'] },
  FourQEntry: { view: ['executive', 'strategy_office', 'facilitator', 'owner'], draft: ['owner', 'strategy_office', 'facilitator'], propose: ['owner'] },
  BaselineMeasure: { view: ['executive', 'strategy_office', 'owner'], draft: ['owner', 'strategy_office'], approve: ['strategy_office'] },
  ComplianceItem: { view: ['executive', 'strategy_office', 'compliance', 'owner'], draft: ['strategy_office', 'owner'], approve: ['compliance'] },
  ResourceEnvelope: { view: ['executive', 'finance', 'strategy_office'], draft: ['finance'] },
  PlanDocument: { view: ['executive', 'strategy_office', 'facilitator'], draft: ['strategy_office', 'facilitator'], approve: ['strategy_office'] },
  // PlanDocument view widens to all members once status is 'final'.
  CommunicationRecord: { view: ['all_members'], draft: ['strategy_office', 'owner'] },
  Workshop: { view: ['executive', 'strategy_office', 'facilitator', 'owner'], draft: ['strategy_office', 'facilitator'] },
  FormationDeadline: { view: ['executive', 'strategy_office', 'facilitator', 'owner'], draft: ['strategy_office', 'facilitator'] },
  // Calendar edits are further limited to the assigned preparer (StrategicPlan.calendar.preparerMembershipId).
  PlanRevision: { view: ['all_members'], propose: ['strategy_office', 'owner'], confirm: ['executive'] },
  RatingScheme: { view: ['hr', 'executive'], draft: ['hr'], approve: ['executive'] },
  OrgUnit: { view: ['all_members'], draft: ['org_admin'] },
  Position: { view: ['all_members'], draft: ['org_admin'] },
  Membership: { view: ['org_admin'], draft: ['org_admin'] },
};
// BudgetLine non-viewers see funded/unfunded status only, including on activity pages.
// Facilitators never see personnel lines or reviews (B4); their access ends at Membership.endsOn.
