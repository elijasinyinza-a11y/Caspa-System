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

export interface AiService {
  explainFinding(finding: Finding): Promise<AiDraft>;
}

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
};
