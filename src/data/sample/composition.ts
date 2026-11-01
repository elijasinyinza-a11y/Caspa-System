/**
 * Part 11d sample wording for Sample Water Utility, approved by Elijah on 1 November 2026 (BUILD-BRIEF section 34,
 * D11d-14). The AI stub suggests these in Composition. Themes and objectives come from the approved Strategy
 * workspace prototype; cards are matched by their text. KPIs are suggested only where the baseline register holds a
 * matching measure, with sample targets for 2027 to 2031 that the owner sets. Decision-map rows come only from
 * critical failure factors.
 */
import { registerCompositionScript } from '../../ai';

export const SWU_COMPOSITION = {
  themes: [
    { title: 'Recover revenue and cut losses', cards: ['Non-revenue water at 47% against a 40% target', 'Metered connections rose from 58% to 81%'], perspective: 'financial' },
    { title: 'Make supply reliable through drier years', cards: ['Supply hours up from 14 to 16 per day', 'Drought reducing raw water yield', 'Develop a second borehole field'], perspective: 'customer' },
    { title: 'Fund sanitation properly', cards: ['Sanitation coverage 31% against a 45% target', 'No funded sanitation activities in annual budgets'], perspective: 'customer' },
    { title: 'Prepare a sound tariff case for 2028', cards: ['Regulator’s tariff review window in 2028', 'Cost-of-service study before the tariff application'], perspective: 'financial' },
  ],
  objectives: [
    { theme: 'Recover revenue and cut losses', title: 'Reduce non-revenue water', cards: ['Non-revenue water at 47% against a 40% target'] },
    { theme: 'Recover revenue and cut losses', title: 'Increase collection efficiency', cards: [] },
    { theme: 'Make supply reliable through drier years', title: 'Increase daily supply hours', cards: ['Supply hours up from 14 to 16 per day'] },
    { theme: 'Make supply reliable through drier years', title: 'Secure raw water sources against drought', cards: ['Drought reducing raw water yield'] },
    { theme: 'Fund sanitation properly', title: 'Fund and deliver a sanitation programme', cards: ['Sanitation coverage 31% against a 45% target', 'No funded sanitation activities in annual budgets'] },
    { theme: 'Prepare a sound tariff case for 2028', title: 'Complete a cost-of-service study by 2027', cards: ['Regulator’s tariff review window in 2028', 'Cost-of-service study before the tariff application'] },
  ],
  kpis: [
    { objective: 'Reduce non-revenue water', measure: 'Non-revenue water', direction: 'lower_is_better', targets: [44, 41, 38, 35, 32] },
    { objective: 'Increase collection efficiency', measure: 'Collection efficiency', direction: 'higher_is_better', targets: [81.9, 85.8, 89.7, 93.6, 97.5] },
    { objective: 'Increase daily supply hours', measure: 'Supply hours per day', direction: 'higher_is_better', targets: [16.8, 17.6, 18.4, 19.2, 20] },
    { objective: 'Fund and deliver a sanitation programme', measure: 'Sanitation coverage', direction: 'higher_is_better', targets: [32.6, 34.1, 35.7, 37.2, 38.8] },
  ],
  rowLevels: [{ card: 'No funded sanitation activities in annual budgets', level: 'policy' }],
} as const;

registerCompositionScript('org-sample-water', structuredClone(SWU_COMPOSITION) as never);
