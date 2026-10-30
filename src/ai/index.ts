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

export interface AiService {
  explainFinding(finding: Finding): Promise<AiDraft>;
  /** Read an organogram and draft units, positions and reporting lines. Language only: it never confirms anything. */
  draftStructure(fileName: string): Promise<StructureDraft>;
}

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
};
