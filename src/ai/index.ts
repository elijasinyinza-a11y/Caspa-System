/**
 * AI interface (Build Brief rule 4). In this build every call returns fixed sample text labelled "AI draft".
 * The AI handles language only: it never decides, scores, confirms or clears anything. The rules engine
 * alone decides whether a finding exists; an explanation never changes that.
 */
import { en } from "../strings/en";
import type { Finding, FourQCell } from "../contract/caspa-data-contract";
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
  /** Turn a handover list into a readable note (H7). It restates the list only: no judgement, nothing decided. */
  draftHandoverNote(list: HandoverFacts): Promise<AiDraft>;
  /** Read a source document and draft 4Q cards, each tied to its page (F1). Every card is a draft for a person to check. */
  draftFourQFromDocument(fileName: string): Promise<FourQDraft>;
  /** Turn a department head's interview answers into draft 4Q cards, one per answer (F1). Language only. */
  draftFourQFromInterview(answers: { cell: FourQCell; answer: string }[]): Promise<FourQDraft>;
  /** Summarise accepted cards for leadership to read before writing the vision. Never a draft vision (F1). */
  summariseBoard(bands: { band: string; cards: string[] }[]): Promise<AiDraft>;
  /** Suggest cards in the same section that may say the same thing. A suggestion only: people merge or keep both. */
  suggestDuplicates(cards: { id: string; cell: FourQCell; text: string }[]): Promise<{ label: "AI suggestion"; pairs: [string, string][] }>;
  /**
   * Group consultation inputs that say similar things, for the Strategy office to read (F2). Only the text is sent,
   * never names or units. It decides nothing: ideas raised once stay listed on their own.
   */
  groupInputs(inputs: { id: string; text: string }[]): Promise<InputGroups>;
  /** Read a report or system export and draft baseline values, each tied to its page (F2). The data owner checks each one. */
  draftBaselinesFromDocument(fileName: string): Promise<BaselineDraft>;
  /** Read a law, regulation, licence or policy and draft its obligations, each tied to its page (F3). Never from general knowledge. */
  draftComplianceFromDocument(fileName: string): Promise<ComplianceDraft>;
}

/** Inputs grouped by what they share. Groups are labelled by the shared word, as a reading aid only. */
export interface InputGroups {
  label: "AI draft";
  groups: { word: string; inputIds: string[] }[];
  /** Inputs that share nothing with any other: kept visible, never dropped (specification F2). */
  single: string[];
}

/** Draft baselines. The AI never decides whose data a measure is, nor whether it is valid. */
export interface BaselineDraft {
  label: "AI draft";
  measures: { name: string; unit: string; value: number; asOf: string; page: number }[];
  sameForAnyFile: true;
}

/** Draft obligations, only ever read from the document given. */
export interface ComplianceDraft {
  label: "AI draft";
  items: { title: string; kind: "law" | "regulation" | "licence_condition" | "policy" | "standard"; page: number }[];
  sameForAnyFile: true;
}

/** The stub's fixed baseline draft for any report (part 11c). Fictional and sector-neutral; for Elijah to approve. */
export const SAMPLE_BASELINE_DRAFT: BaselineDraft = {
  label: "AI draft",
  sameForAnyFile: true,
  measures: [
    { name: "Customer complaints resolved within the target time", unit: "%", value: 72, asOf: "2025-12-31", page: 4 },
    { name: "Projects completed on time", unit: "%", value: 58, asOf: "2025-12-31", page: 10 },
    { name: "Staff turnover", unit: "%", value: 9, asOf: "2025-12-31", page: 15 },
  ],
};

/** The stub's fixed obligations for any law, regulation, licence or policy (part 11c). Fictional and sector-neutral; for Elijah to approve. */
export const SAMPLE_COMPLIANCE_DRAFT: ComplianceDraft = {
  label: "AI draft",
  sameForAnyFile: true,
  items: [
    { title: "Submit audited financial statements within six months of the year end", kind: "regulation", page: 4 },
    { title: "Publish an annual report on service performance", kind: "licence_condition", page: 6 },
    { title: "Review the procurement policy at least every two years", kind: "policy", page: 9 },
  ],
};

/** Draft 4Q cards. The AI never decides which department raised a card or whether it is right. */
export interface FourQDraft {
  label: "AI draft";
  cards: { cell: FourQCell; text: string; page: number | null }[];
  /** Says plainly that the review build's stub returns the same draft for any file. */
  sameForAnyFile: boolean;
}

/** The stub's fixed 4Q draft for any document (part 11b). Fictional and sector-neutral; for Elijah to approve. */
export const SAMPLE_FOUR_Q_DRAFT: FourQDraft = {
  label: "AI draft",
  sameForAnyFile: true,
  cards: [
    { cell: { band: "retraction", column: "successes" }, text: "Most service targets in the last plan were met by its final year", page: 3 },
    { cell: { band: "retraction", column: "failures" }, text: "Two major projects finished more than a year late", page: 5 },
    { cell: { band: "repositioning", column: "failure_factors" }, text: "Approvals for spending take too long to reach field teams", page: 8 },
    { cell: { band: "projection", column: "opportunities" }, text: "New funding programmes open to organisations of this size", page: 11 },
  ],
};

/** Words that say little on their own, ignored when comparing cards. */
const COMMON = new Set(["about", "above", "after", "again", "against", "being", "below", "could", "every", "first", "from", "have", "having", "into", "more", "most", "other", "over", "should", "since", "some", "than", "that", "their", "there", "these", "they", "this", "those", "through", "under", "until", "very", "were", "what", "when", "where", "which", "while", "with", "would", "your"]);
const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9%]+/).filter((w) => w.length >= 5 && !COMMON.has(w)));

/** The first sentence of an answer, as a card's text; long sentences are cut at a word boundary. */
export function firstSentence(answer: string): string {
  const one = answer.trim().split(/(?<=[.!?])\s/)[0]!.replace(/[.!?]+$/, "").trim();
  if (one.length <= 120) return one;
  const cut = one.slice(0, 117);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 60 ? cut.lastIndexOf(" ") : 117)}…`;
}

/** The facts a handover note may restate, already limited to what the reader may see. */
export interface HandoverFacts { title: string; holder: string | null; owned: string[]; lines: number; contracts: number; waiting: number; checks: number }

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
  async draftHandoverNote(f) {
    // The stub writes from the list by a fixed template; a real model would only reword the same facts.
    return { label: "AI draft", text: en.vacancy.note(f) };
  },
  async draftFourQFromDocument() {
    return structuredClone(SAMPLE_FOUR_Q_DRAFT);
  },
  async draftFourQFromInterview(answers) {
    // The stub keeps each answer's first sentence; a real model would reword it. Blank answers draft nothing.
    return { label: "AI draft", sameForAnyFile: false, cards: answers.filter((a) => a.answer.trim()).map((a) => ({ cell: a.cell, text: firstSentence(a.answer), page: null })) };
  },
  async summariseBoard(bands) {
    // Restates accepted cards by band, by a fixed template. It never proposes a vision.
    return { label: "AI draft", text: en.conception.summary(bands) };
  },
  async suggestDuplicates(cards) {
    // The stub pairs cards in the same section that share a longer word; a real model would compare meaning.
    const pairs: [string, string][] = [];
    cards.forEach((a, i) => cards.slice(i + 1).forEach((b) => {
      if (a.cell.band !== b.cell.band || a.cell.column !== b.cell.column) return;
      const wa = words(a.text);
      if ([...words(b.text)].some((w) => wa.has(w))) pairs.push([a.id, b.id]);
    }));
    return { label: "AI suggestion", pairs };
  },
  async groupInputs(inputs) {
    // The stub groups inputs sharing a longer word, largest groups first; a real model would compare meaning.
    const counts = new Map<string, string[]>();
    for (const i of inputs) for (const w of words(i.text)) counts.set(w, [...(counts.get(w) ?? []), i.id]);
    const placed = new Set<string>();
    const groups: InputGroups["groups"] = [];
    for (const [word, ids] of [...counts].filter(([, ids]) => ids.length > 1).sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) {
      const free = ids.filter((id) => !placed.has(id));
      if (free.length < 2) continue;
      free.forEach((id) => placed.add(id));
      groups.push({ word, inputIds: free });
    }
    return { label: "AI draft", groups, single: inputs.map((i) => i.id).filter((id) => !placed.has(id)) };
  },
  async draftBaselinesFromDocument() {
    return structuredClone(SAMPLE_BASELINE_DRAFT);
  },
  async draftComplianceFromDocument() {
    return structuredClone(SAMPLE_COMPLIANCE_DRAFT);
  },
};
