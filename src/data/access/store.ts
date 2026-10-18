/** The in-memory shape of one organisation's records. Holds stored records only, never computed values. */
import type {
  Acknowledgement, Activity, ActivityProgress, BaselineMeasure, BudgetLine, BudgetVersion, ContractObjective, Cycle,
  Deficiency, GateEvent, Goal, Kpi, KpiActual, KpiTarget, Membership, Objective, Organisation, OrgUnit,
  PerformanceContract, Person, Position, PositionAssignment, ProgressUpdate, ResourceEnvelope, StrategicPlan,
} from '../../contract/caspa-data-contract';

export interface Store {
  organisation: Organisation;
  people: Person[];
  memberships: Membership[];
  units: OrgUnit[];
  positions: Position[];
  assignments: PositionAssignment[];
  plans: StrategicPlan[];
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
  acknowledgements: Acknowledgement[];
  gateEvents: GateEvent[];
}
