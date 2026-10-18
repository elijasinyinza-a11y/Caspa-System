/**
 * AI interface (Build Brief rule 4). In this build every call returns fixed sample text labelled "AI draft".
 * The AI handles language only: it never decides, scores, confirms or clears anything.
 */
import type { Finding } from '../contract/caspa-data-contract';

export interface AiDraft {
  label: 'AI draft';
  text: string;
}

export interface AiService {
  explainFinding(finding: Finding): Promise<AiDraft>;
}

export const aiStub: AiService = {
  async explainFinding(finding) {
    return {
      label: 'AI draft',
      text: `Sample explanation for rule ${finding.ruleId}. The live service will explain, in plain language, why this check matters and what usually fixes it. It cannot clear the finding.`,
    };
  },
};
