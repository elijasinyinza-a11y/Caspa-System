/** The in-memory shape of one organisation's records. Holds stored records only, never computed values. */
import type {
  Acknowledgement, Activity, AuditEntry, ActivityProgress, BaselineMeasure, BudgetLine, BudgetVersion, ContractObjective, Cycle,
  Deficiency, FormationDeadline, FourQEntry, GateEvent, Goal, Kpi, KpiActual, KpiTarget, Membership, Objective, Organisation, OrgUnit,
  PerformanceContract, Person, Position, PositionAssignment, ProgressUpdate, RatingScheme, ResourceEnvelope, Review,
  StrategicPlan, Workshop,
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
}
