/**
 * AI interface (Build Brief rule 4). In this build every call returns fixed sample text labelled "AI draft".
 * The AI handles language only: it never decides, scores, confirms or clears anything. The rules engine
 * alone decides whether a finding exists; an explanation never changes that.
 */
import type { Finding } from "../contract/caspa-data-contract";
import { RULES } from "../rules/integrity";

export interface AiDraft {
  label: "AI draft";
  text: string;
}

/** An organisation structure read from an organogram (D7-8). Every item is a draft until a person accepts or corrects it. */
export interface StructureDraft {
  label: "AI draft";
  /** Page of the document each item was read from. */
  page: number;
  /** Units as [name, parent name or null, unit type]. */
  units: [string, string | null, string][];
  /** Positions as [title, unit name, title of the position it reports to or null, holder's name or ""]. */
  positions: [string, string, string | null, string][];
  /** Says plainly that the review build's stub returns the same draft for any file (D7-13). */
  sameForAnyFile: true;
}

/** One item of a strategic plan read from its document (onboarding, O3). Owners as written; people match them. */
export interface PlanDraftItem {
  kind: "goal" | "objective" | "kpi" | "activity";
  code: string;
  title: string;
  /** The code of the item it sits under; null for a goal. */
  partOf: string | null;
  /** The owner as the document names it, matched to a position by people and rules, never by the AI. */
  owner: string;
  page: number;
  perspective?: "customer" | "internal" | "innovation_learning" | "financial";
  kpi?: { unit: string; direction: "higher_is_better" | "lower_is_better"; aggregation: "latest" | "sum" | "average"; baseline: number | null; baselineAsOf: string | null; target: number };
  activity?: { level: "principle" | "process" | "people" | "policy" | "procedures" | "practices" | null; quantity: number; quantityUnit: string };
}
export interface PlanDraft {
  label: "AI draft";
  items: PlanDraftItem[];
  /** Says plainly that the review build's stub returns the same draft for any file. The AI never drafts vision or mission (F1). */
  sameForAnyFile: true;
}

export interface AiService {
  explainFinding(finding: Finding): Promise<AiDraft>;
  /** Read an organogram and draft units, positions and reporting lines. Language only: it never confirms anything. */
  draftStructure(fileName: string): Promise<StructureDraft>;
  /** Read a strategic plan document and draft its goals, objectives, KPIs and activities. Language only. */
  draftPlan(fileName: string): Promise<PlanDraft>;
}

/** The stub's fixed plan draft, approved with the onboarding prototype on 31 October 2026 (O7). Fictional. */
export const SAMPLE_PLAN_DRAFT: PlanDraft = {
  label: "AI draft",
  sameForAnyFile: true,
  items: [
    { kind: "goal", code: "G1", title: "Improve service to customers", partOf: null, owner: "Chief Executive Officer", page: 4, perspective: "customer" },
    { kind: "objective", code: "O1.1", title: "Respond to customer requests faster", partOf: "G1", owner: "Operations Manager", page: 5 },
    { kind: "kpi", code: "K1.1.1", title: "Requests resolved within 5 working days", partOf: "O1.1", owner: "Operations Manager", page: 5, kpi: { unit: "%", direction: "higher_is_better", aggregation: "latest", baseline: 62, baselineAsOf: "2025-12-31", target: 80 } },
    { kind: "kpi", code: "K1.1.2", title: "Customer satisfaction score (out of 5)", partOf: "O1.1", owner: "Operations Manager", page: 5, kpi: { unit: "out of 5", direction: "higher_is_better", aggregation: "average", baseline: 3.4, baselineAsOf: "2025-12-31", target: 4 } },
    { kind: "activity", code: "A1.1.1.1", title: "Introduce a request tracking log in both regions", partOf: "K1.1.1", owner: "Regional Supervisor, North", page: 6, activity: { level: "procedures", quantity: 2, quantityUnit: "regions" } },
    { kind: "activity", code: "A1.1.1.2", title: "Train field officers in request handling", partOf: "K1.1.1", owner: "Head of Customer Care", page: 6, activity: { level: "people", quantity: 3, quantityUnit: "officers" } },
    { kind: "objective", code: "O1.2", title: "Extend regular service to the South region", partOf: "G1", owner: "Operations Manager", page: 7 },
    { kind: "kpi", code: "K1.2.1", title: "Field visits completed in the South region", partOf: "O1.2", owner: "Regional Supervisor, South", page: 7, kpi: { unit: "visits", direction: "higher_is_better", aggregation: "sum", baseline: 120, baselineAsOf: "2025-12-31", target: 300 } },
    { kind: "activity", code: "A1.2.1.1", title: "Fill the Regional Supervisor post, South", partOf: "K1.2.1", owner: "Corporate Services Manager", page: 7, activity: { level: "people", quantity: 1, quantityUnit: "post" } },
    { kind: "activity", code: "A1.2.1.2", title: "Agree a monthly visit schedule for the South region", partOf: "K1.2.1", owner: "Operations Manager", page: 7, activity: { level: null, quantity: 12, quantityUnit: "schedules" } },
    { kind: "goal", code: "G2", title: "Strengthen financial management", partOf: null, owner: "Finance Manager", page: 8, perspective: "financial" },
    { kind: "objective", code: "O2.1", title: "Close the monthly accounts on time", partOf: "G2", owner: "Finance Manager", page: 8 },
    { kind: "kpi", code: "K2.1.1", title: "Months closed within 10 working days", partOf: "O2.1", owner: "Accountant", page: 8, kpi: { unit: "months", direction: "higher_is_better", aggregation: "sum", baseline: 7, baselineAsOf: "2025-12-31", target: 12 } },
    { kind: "activity", code: "A2.1.1.1", title: "Adopt a month-end closing checklist", partOf: "K2.1.1", owner: "Accountant", page: 8, activity: { level: "procedures", quantity: 1, quantityUnit: "checklist" } },
    { kind: "objective", code: "O2.2", title: "Reduce overdue amounts owed to the organisation", partOf: "G2", owner: "Finance Manager", page: 9 },
    { kind: "kpi", code: "K2.2.1", title: "Amounts owed for more than 90 days", partOf: "O2.2", owner: "Finance Manager", page: 9, kpi: { unit: "%", direction: "lower_is_better", aggregation: "latest", baseline: 31, baselineAsOf: "2025-12-31", target: 20 } },
    { kind: "activity", code: "A2.2.1.1", title: "Revise the debt recovery procedure", partOf: "K2.2.1", owner: "Finance Manager", page: 9, activity: { level: "procedures", quantity: 1, quantityUnit: "procedure" } },
    { kind: "goal", code: "G3", title: "Build a capable organisation", partOf: null, owner: "Corporate Services Manager", page: 10, perspective: "innovation_learning" },
    { kind: "objective", code: "O3.1", title: "Bring core systems up to date", partOf: "G3", owner: "Corporate Services Manager", page: 10 },
    { kind: "kpi", code: "K3.1.1", title: "Staff using the shared records system", partOf: "O3.1", owner: "IT Officer", page: 10, kpi: { unit: "%", direction: "higher_is_better", aggregation: "latest", baseline: null, baselineAsOf: null, target: 90 } },
    { kind: "activity", code: "A3.1.1.1", title: "Move all units onto the shared records system", partOf: "K3.1.1", owner: "IT Officer", page: 11, activity: { level: "process", quantity: 6, quantityUnit: "units" } },
    { kind: "activity", code: "A3.1.1.2", title: "Run refresher training on the records system", partOf: "K3.1.1", owner: "IT Officer", page: 11, activity: { level: "people", quantity: 40, quantityUnit: "staff" } },
  ],
};

/**
 * The stub's fixed organogram draft, whatever file is given (rule 4). Fictional names. One reporting line is
 * misread on purpose (the Accountant is drafted as reporting to the Chief Executive Officer), so a person has to
 * check each item.
 */
export const SAMPLE_STRUCTURE_DRAFT: StructureDraft = {
  label: "AI draft",
  page: 1,
  sameForAnyFile: true,
  units: [
    ["Head office", null, "Organisation"], ["Finance", "Head office", "Department"], ["Corporate Services", "Head office", "Department"],
    ["Operations", "Head office", "Department"], ["Regions", "Operations", "Division"], ["North", "Regions", "Region"], ["South", "Regions", "Region"],
  ],
  positions: [
    ["Chief Executive Officer", "Head office", null, "Mutale Banda"],
    ["Finance Manager", "Finance", "Chief Executive Officer", "Grace Tembo"],
    ["Accountant", "Finance", "Chief Executive Officer", "Peter Zulu"],
    ["Corporate Services Manager", "Corporate Services", "Chief Executive Officer", "Ireen Sakala"],
    ["IT Officer", "Corporate Services", "Corporate Services Manager", "Brian Mumba"],
    ["Operations Manager", "Operations", "Chief Executive Officer", "Joseph Lungu"],
    ["Regional Supervisor", "North", "Operations Manager", "Agnes Mwale"],
    ["Regional Supervisor", "South", "Operations Manager", ""],
    ["Field Officer", "North", "Regional Supervisor", "Kelvin Daka"],
    ["Field Officer", "North", "Regional Supervisor", "Mary Chanda"],
    ["Field Officer", "South", "Regional Supervisor", "Lweendo Hamoonga"],
  ],
};

/** Fixed sample explanations, one per rule. Plain language only; no framework wording is invented here. */
export const SAMPLE_EXPLANATIONS: Record<string, string> = {
  [RULES.budgetLineNoActivity.id]:
    "Every amount in the budget should pay for a piece of planned work. This line is not linked to an activity, so no one can tell which goal it serves. Linking it to the activity it pays for, or removing it, clears the check.",
  [RULES.activityNo6P.id]:
    "Each activity is decided at one of the six decision levels. Without one, the cascade cannot show at what level the decision sits. Choosing the level on the activity clears the check.",
  [RULES.kpiTargetInvalid.id]:
    "A target should ask for movement from the baseline in the direction the indicator improves. Here the target equals the baseline or points the other way, so progress cannot be measured. Correcting the target or the direction clears the check.",
  [RULES.goalNoFundedActivity.id]:
    "A goal with no funded activity has nothing in this year’s budget working towards it. Funding at least one of its activities, or recording why it is unfunded this year, addresses it.",
  [RULES.objectiveNoKpi.id]:
    "Without an indicator, there is no way to tell whether this objective is being achieved. Adding at least one KPI clears the check.",
  [RULES.kpiNoOwner.id]:
    "No position is accountable for this indicator, so no one is asked to report on it or act when it slips. Assigning an owning position clears the check.",
  [RULES.deficiencyUnaddressed.id]:
    "A deficiency was recorded but nothing in the plan corrects it yet. Adding a corrective activity, at whichever decision level fits, clears the check.",
  [RULES.contractUpstreamChanged.id]:
    "The activity behind this signed objective changed after the contract was signed. The signed version stays as it was; the employee and supervisor should look at whether the contract needs a revision.",
  [RULES.kpiBaselineNotValidated.id]:
    "Progress is measured from the baseline, so an unchecked baseline makes every progress figure uncertain. Validating the baseline measure clears the check.",
  [RULES.goalNoWhy.id]:
    "The reason for this goal has not been recorded. Linking it to the 4Q entry that explains why it exists keeps the reasoning with the goal.",
  [RULES.envelopeExceeded.id]:
    "The indicative costs under this goal add up to more than the resources set aside for it. Reducing the costs, or revising the envelope, brings them back in line.",
};

export const aiStub: AiService = {
  async explainFinding(finding) {
    return {
      label: "AI draft",
      text:
        SAMPLE_EXPLANATIONS[finding.ruleId] ??
        "A sample explanation is not available for this check yet.",
    };
  },
  async draftStructure() {
    return structuredClone(SAMPLE_STRUCTURE_DRAFT);
  },
  async draftPlan() {
    return structuredClone(SAMPLE_PLAN_DRAFT);
  },
};
