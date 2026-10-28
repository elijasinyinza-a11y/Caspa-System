/**
 * Sample Packaging Manufacturer — fictional test organisation (Build Brief, section 14).
 * Breaks the utility's assumptions: five unit levels, April–March year, staff reporting outside their
 * own unit, a lower-is-better KPI with no baseline (P4), an objective with no KPI, a draft activity
 * with no 6P level, a personnel line, and a contract objective with no quantity.
 */
import { buildOrg, DEFAULT_PERSPECTIVES } from './build';

export const createManufacturer = () =>
  buildOrg({
    key: 'mfg',
    name: 'Sample Packaging Manufacturer',
    countryCode: 'KE', timeZone: 'Africa/Nairobi', currency: 'KES', fyStartMonth: 4, fy: 2026,
    planTitle: 'Corporate strategy 2025–2028', planYears: [2025, 2027],
    perspectives: DEFAULT_PERSPECTIVES,
    units: [
      { id: 'co', parent: null, name: 'Sample Packaging Manufacturer', type: 'Company' },
      { id: 'ops', parent: 'co', name: 'Operations Division', type: 'Division' },
      { id: 'plant1', parent: 'ops', name: 'Plant 1', type: 'Plant' },
      { id: 'prod', parent: 'plant1', name: 'Production', type: 'Department' },
      { id: 'quality', parent: 'plant1', name: 'Quality', type: 'Department' },
      { id: 'line2', parent: 'prod', name: 'Line 2', type: 'Line' },
    ],
    people: [
      { key: 'ceo', name: 'James Kariuki', title: 'Chief Executive', unit: 'co', reportsTo: null },
      { key: 'fm', name: 'Wanjiru Mwangi', title: 'Finance Manager', unit: 'co', reportsTo: 'ceo', roles: ['finance'] },
      { key: 'od', name: 'Samuel Njoroge', title: 'Operations Director', unit: 'ops', reportsTo: 'ceo', roles: ['strategy_office'] },
      { key: 'hrm', name: 'Faith Wairimu', title: 'Human Resources Manager', unit: 'co', reportsTo: 'ceo', roles: ['hr'] },
      { key: 'pm', name: 'Lucy Wambui', title: 'Plant Manager', unit: 'plant1', reportsTo: 'od' },
      { key: 'prm', name: 'Kevin Ochieng', title: 'Production Manager', unit: 'prod', reportsTo: 'pm' },
      { key: 'qm', name: 'Esther Chebet', title: 'Quality Manager', unit: 'quality', reportsTo: 'pm' },
      { key: 'ls', name: 'John Mutua', title: 'Line Supervisor, Line 2', unit: 'line2', reportsTo: 'prm' },
      { key: 'op', name: 'Brian Otieno', title: 'Machine Operator, Line 2', unit: 'line2', reportsTo: 'ls' },
      { key: 'qi', name: 'Mercy Achieng', title: 'Quality Inspector, Line 2', unit: 'line2', reportsTo: 'qm' }, // reports outside her unit
    ],
    devRoles: { finance: 'fm', supervisor: 'ls', employee: 'op', hr: 'hrm', strategy: 'od' },
    // Slice 5 (approved 28 October 2026): one orphan line, so the budget gate is exercised here too.
    orphanLines: [{ description: 'Forklift hire, Plant 1', amountMinor: 4_500_000, unit: 'plant1', category: 'operating', source: 'own_revenue' }],
    goals: [
      {
        code: 'G1', title: 'Reduce the cost of production', perspective: 'financial', owner: 'ceo',
        why: { cell: { band: 'retraction', column: 'failures' }, text: 'Material waste rose for three years running.' },
        objectives: [
          {
            code: 'O1.1', title: 'Cut material waste', owner: 'pm',
            kpis: [{
              code: 'K1.1.1', name: 'Material waste', unit: '% of input', direction: 'lower_is_better', baseline: 6.5, target: 4, actuals: [['2026-09-30', 5.6]], owner: 'pm',
              activities: [
                {
                  code: 'A1.1.1.1', title: 'Recalibrate cutting machines on Line 2', level: 'process', owner: 'ls', evidence: 'Calibration certificates',
                  qty: { value: 12, unit: 'machines', done: 5, asOf: '2026-09-30' },
                  lines: [{ description: 'Calibration contract', amountMinor: 240_000_000, unit: 'line2', category: 'capital', source: 'own_revenue' }],
                },
                {
                  code: 'A1.1.1.2', title: 'Keep a scrap log at every shift change', level: 'procedures', owner: 'qm', evidence: 'Signed shift scrap logs',
                  lines: [{ description: 'Scrap log stationery', amountMinor: 15_000_000, unit: 'quality', category: 'operating', source: 'own_revenue' }],
                },
              ],
            }],
          },
          {
            code: 'O1.2', title: 'Lower energy cost per tonne', owner: 'pm',
            kpis: [{
              code: 'K1.2.1', name: 'Energy cost per tonne', unit: 'KES per tonne', direction: 'lower_is_better', aggregation: 'average', baseline: null, target: 3800,
              actuals: [['2026-08-31', 4100], ['2026-09-30', 3900]], owner: 'prm',
              activities: [{ code: 'A1.2.1.1', title: 'Run compressors off-peak', level: 'practices', owner: 'prm', evidence: 'Compressor run logs' }],
            }],
          },
        ],
      },
      {
        code: 'G2', title: 'Meet customer delivery dates', perspective: 'customer', owner: 'od',
        objectives: [
          {
            code: 'O2.1', title: 'Improve on-time delivery', owner: 'od',
            kpis: [{
              code: 'K2.1.1', name: 'Orders delivered on time', unit: '%', direction: 'higher_is_better', baseline: 81, target: 95, actuals: [['2026-09-30', 88]], owner: 'od',
              activities: [
                {
                  code: 'A2.1.1.1', title: 'Publish a weekly production schedule agreed with sales', level: 'procedures', owner: 'prm', evidence: 'Published schedules',
                  lines: [{ description: 'Scheduler overtime', amountMinor: 60_000_000, unit: 'prod', category: 'personnel', source: 'own_revenue' }],
                },
                { code: 'A2.1.1.2', title: 'Pilot a returnable crate scheme', level: null, owner: 'od', evidence: 'Pilot report' },
              ],
            }],
          },
          { code: 'O2.2', title: 'Reduce customer complaints', owner: 'qm', kpis: [] },
        ],
      },
    ],
    contracts: [{
      person: 'op', status: 'signed',
      objectives: [
        { activity: 'A1.1.1.1', title: 'Recalibrate 6 machines with the contractor', qty: { value: 6, unit: 'machines' }, weight: 60, done: 3 },
        { activity: 'A1.1.1.2', title: 'Keep the scrap log on every shift', qty: null, weight: 40 },
      ],
    }],
  });
