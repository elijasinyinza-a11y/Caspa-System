/**
 * Sample Community Health NGO — fictional test organisation (Build Brief, section 14).
 * Breaks the utility's assumptions: flat structure (one unit), July–June year, UGX (no minor units),
 * renamed terms, no scorecard perspectives, a milestone indicator, a sum indicator with no baseline,
 * personnel costs, an orphan cost line, and one person holding both the Finance and HR roles.
 */
import { buildOrg } from './build';

export const NGO_NOW_FY = 2026; // July 2026 to June 2027: FY2026/27

export const createNgo = () =>
  buildOrg({
    key: 'ngo',
    name: 'Sample Community Health NGO',
    countryCode: 'UG', timeZone: 'Africa/Kampala', currency: 'UGX', fyStartMonth: 7, fy: NGO_NOW_FY,
    planTitle: 'Five-year programme strategy 2024–2029', planYears: [2024, 2028],
    terms: {
      goal: { singular: 'Outcome', plural: 'Outcomes' },
      objective: { singular: 'Result', plural: 'Results' },
      kpi: { singular: 'Indicator', plural: 'Indicators' },
      activity: { singular: 'Intervention', plural: 'Interventions' },
      budgetLine: { singular: 'Cost line', plural: 'Cost lines' },
      contractObjective: { singular: 'Work-plan target', plural: 'Work-plan targets' },
    },
    perspectives: null,
    units: [{ id: 'office', parent: null, name: 'Sample Community Health NGO', type: 'Office' }],
    people: [
      { key: 'cd', name: 'Florence Akello', title: 'Country Director', unit: 'office', reportsTo: null, roles: ['strategy_office'] },
      { key: 'fo', name: 'David Ssempala', title: 'Finance Officer', unit: 'office', reportsTo: 'cd', roles: ['finance', 'hr'] }, // one person, two roles: the merged queue
      { key: 'pc', name: 'Grace Namutebi', title: 'Programme Coordinator', unit: 'office', reportsTo: 'cd' },
      { key: 'chw1', name: 'Sarah Nakato', title: 'Community Health Worker', unit: 'office', reportsTo: 'pc' },
      { key: 'chw2', name: 'Peter Okello', title: 'Community Health Worker', unit: 'office', reportsTo: 'pc' },
      { key: 'chw3', name: 'Ruth Atim', title: 'Community Health Worker', unit: 'office', reportsTo: 'pc' },
    ],
    devRoles: { finance: 'fo', supervisor: 'pc', employee: 'chw1', hr: 'fo', strategy: 'cd' },
    // Slice 6 (wording approved 29 October 2026): two decision-map rows on R1.1, one solved at another level, one with none.
    deficiencies: [
      { objective: 'R1.1', level: 'people', description: 'Many women do not return after their first antenatal visit', cause: 'Mothers are not reminded when their next visit is due', effects: 'Fewer women complete four visits', fix: ['IV1.1.1.1'], timeframe: '12 months' },
      { objective: 'R1.1', level: 'practices', description: 'Visits are written up at the end of the month from memory', cause: 'Workers have no habit of recording at the household', effects: 'Visit counts cannot be relied on', fix: [], timeframe: 'Not set' },
    ],
    goals: [
      {
        code: 'OC1', title: 'Improve maternal and child health in the programme districts', perspective: null, owner: 'cd',
        why: { cell: { band: 'projection', column: 'opportunities' }, text: 'The district health office has asked for community follow-up of new mothers.' },
        objectives: [
          {
            code: 'R1.1', title: 'Increase uptake of antenatal visits', owner: 'pc',
            kpis: [{
              code: 'IN1.1.1', name: 'Women attending four antenatal visits', unit: '%', direction: 'higher_is_better', baseline: 48, target: 65,
              actuals: [['2026-09-30', 53]], owner: 'pc',
              activities: [
                {
                  code: 'IV1.1.1.1', title: 'Home visits to pregnant women', level: 'procedures', owner: 'pc', evidence: 'Visit forms signed by the household',
                  qty: { value: 1200, unit: 'visits', done: 310, asOf: '2026-09-30' },
                  lines: [
                    { description: 'Community health worker stipends', amountMinor: 24_000_000, unit: 'office', category: 'personnel', source: 'donor' },
                    { description: 'Transport for home visits', amountMinor: 18_000_000, unit: 'office', category: 'operating', source: 'donor' },
                  ],
                },
                {
                  code: 'IV1.1.1.2', title: 'Train community health workers on referral', level: 'people', owner: 'cd', evidence: 'Attendance registers',
                  lines: [{ description: 'Referral training', amountMinor: 9_500_000, unit: 'office', category: 'operating', source: 'donor' }],
                },
              ],
            }],
          },
          {
            code: 'R1.2', title: 'Keep complete referral records', owner: 'pc',
            kpis: [{
              code: 'IN1.2.1', name: 'Referral system in place', unit: 'milestones', direction: 'milestone', baseline: null, owner: 'pc',
              milestones: [
                { label: 'Referral form agreed', weight: 1, completedOn: '2026-08-15' },
                { label: 'Register issued to every worker', weight: 1, completedOn: null },
                { label: 'First quarterly audit', weight: 2, completedOn: null },
              ],
              activities: [{ code: 'IV1.2.1.1', title: 'Introduce a standard referral form and register', level: 'procedures', owner: 'pc', evidence: 'Issued registers' }],
            }],
          },
        ],
      },
      {
        code: 'OC2', title: 'Secure diversified funding', perspective: null, owner: 'cd',
        objectives: [{
          code: 'R2.1', title: 'Grow unrestricted income', owner: 'fo',
          kpis: [{
            code: 'IN2.1.1', name: 'Unrestricted income raised', unit: 'UGX million', direction: 'higher_is_better', aggregation: 'sum', baseline: null, target: 120,
            actuals: [['2026-08-31', 15], ['2026-09-30', 22]], owner: 'fo',
            activities: [{
              code: 'IV2.1.1.1', title: 'Run a local giving campaign', level: 'principle', owner: 'fo', evidence: 'Receipts and the donor register',
              lines: [{ description: 'Campaign materials', amountMinor: 6_000_000, unit: 'office', category: 'operating', source: 'own_revenue' }],
            }],
          }],
        }],
      },
    ],
    orphanLines: [{ description: 'Office generator fuel', amountMinor: 3_200_000, unit: 'office', category: 'operating', source: 'own_revenue' }],
    contracts: [
      { person: 'chw1', status: 'signed', objectives: [{ activity: 'IV1.1.1.1', title: 'Complete 400 home visits', qty: { value: 400, unit: 'visits' }, weight: 100, done: 96 }] },
      { person: 'chw2', status: 'draft', objectives: [{ activity: 'IV1.1.1.1', title: 'Complete 400 home visits', qty: { value: 400, unit: 'visits' }, weight: 100 }] },
    ],
  });
