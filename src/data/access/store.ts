/** The in-memory shape of one organisation's records. Holds stored records only, never computed values. */
import type {
  Acknowledgement, CommunicationRecord, Activity, AiTask, AuditEntry, ComplianceItem, ConsultationInput, ConsultationRound, ActivityProgress, BaselineMeasure, BudgetLine, BudgetVersion, ContractObjective, Cycle,
  Deficiency, FormationDeadline, FourQEntry, GateEvent, Goal, Kpi, KpiActual, KpiTarget, Membership, Objective, Organisation, OrgUnit,
  PerformanceContract, Person, Position, PositionAssignment, ProgressUpdate, RatingScheme, ResourceEnvelope, Review, Theme, IndicativeCost, PlanDocument,
  SourceDocument, StrategicPlan, VisionStatement, Workshop,
} from '../../contract/caspa-data-contract';

export interface Store {
  organisation: Organisation;
  people: Person[];
  memberships: Membership[];
  units: OrgUnit[];
  positions: Position[];
  assignments: PositionAssignment[];
  plans: StrategicPlan[];
  fourQEntries: FourQEntry[];
  goals: Goal[];
  objectives: Objective[];
  kpis: Kpi[];
  kpiTargets: KpiTarget[];
  kpiActuals: KpiActual[];
  baselineMeasures: BaselineMeasure[];
  resourceEnvelopes: ResourceEnvelope[];
  /** v1.7, part 11d: themes from the 4Q board, and objectives' indicative costs. */
  themes: Theme[];
  indicativeCosts: IndicativeCost[];
  /** v0.15.0 (D15-4): plan documents. */
  planDocuments: PlanDocument[];
  /** v0.16.0 (part 11e): communication records, one per goal (D16-3). */
  communicationRecords: CommunicationRecord[];
  activities: Activity[];
  activityProgress: ActivityProgress[];
  deficiencies: Deficiency[];
  cycles: Cycle[];
  budgetVersions: BudgetVersion[];
  budgetLines: BudgetLine[];
  contracts: PerformanceContract[];
  contractObjectives: ContractObjective[];
  progressUpdates: ProgressUpdate[];
  reviews: Review[];
  ratingSchemes: RatingScheme[];
  workshops: Workshop[];
  formationDeadlines: FormationDeadline[];
  acknowledgements: Acknowledgement[];
  gateEvents: GateEvent[];
  /** Who changed what (contract AuditEntry). Written by the data-access layer on every change it makes. */
  auditEntries: AuditEntry[];
  /** Documents given to CASPA™, such as an organogram behind an AI draft (D7-8). */
  sourceDocuments: SourceDocument[];
  /** Every AI call, for audit (contract AiTask). */
  aiTasks: AiTask[];
  /** Vision and mission (contract VisionStatement); for an imported plan, typed by the Executive (O9). */
  visionStatements: VisionStatement[];
  /** Part 11c: consultation rounds and what people sent in (contract v1.6). */
  consultationRounds: ConsultationRound[];
  consultationInputs: ConsultationInput[];
  /** Part 11c: the compliance register (Confirmation). */
  complianceItems: ComplianceItem[];
}
