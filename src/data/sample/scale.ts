/**
 * Sample Scale Test Organisation — fictional, generated (Build Brief, section 14).
 * 4 goals × 4 objectives × 3 KPIs × 6 activities = 288 activities, with long names, to test layouts,
 * the cascade tree and selector speed. RWF has no minor units.
 */
import type { SixPLevel } from '../../contract/caspa-data-contract';
import { buildOrg, DEFAULT_PERSPECTIVES, type GoalSpec, type PersonSpec } from './build';

const LEVELS: SixPLevel[] = ['principle', 'process', 'people', 'policy', 'procedures', 'practices'];
const PERSPECTIVES = ['financial', 'customer', 'internal', 'innovation_learning'] as const;
const LONG = 'across every directorate, regional office and partner programme, with quarterly reporting to the board and annual independent verification';

const directorates = [1, 2, 3, 4];
const departments = [1, 2, 3];
const deptHead = (dir: number, dep: number) => `dh${dir}${dep}`;

const people: PersonSpec[] = [
  { key: 'dg', name: 'Director General', title: 'Director General', unit: 'hq', reportsTo: null },
  ...directorates.map((d) => ({ key: `dir${d}`, name: `Director ${d}`, title: `Director, Directorate ${d}`, unit: `d${d}`, reportsTo: 'dg', roles: d === 1 ? ['finance' as const] : [] })),
  ...directorates.flatMap((d) => departments.map((p) => ({ key: deptHead(d, p), name: `Head ${d}.${p}`, title: `Head of Department ${d}.${p}, responsible for programme delivery and reporting`, unit: `d${d}p${p}`, reportsTo: `dir${d}` }))),
  { key: 'off1', name: 'Officer One', title: 'Programme Officer, Department 2.1, with a deliberately long position title for layout checks', unit: 'd2p1', reportsTo: 'dh21' },
];

const goals: GoalSpec[] = directorates.map((g) => ({
  code: `G${g}`,
  title: `Goal ${g}: strengthen delivery of strategic priority ${g} ${LONG}`,
  perspective: PERSPECTIVES[g - 1]!,
  owner: `dir${g}`,
  why: g % 2 ? { cell: { band: 'projection', column: 'key_strategic_actions' }, text: `Recorded reason for goal ${g}.` } : undefined,
  objectives: [1, 2, 3, 4].map((o) => ({
    code: `O${g}.${o}`,
    title: `Objective ${g}.${o}: improve the measurable results of programme area ${o} ${LONG}`,
    owner: deptHead(g, ((o - 1) % 3) + 1),
    kpis: [1, 2, 3].map((k) => ({
      code: `K${g}.${o}.${k}`,
      name: `Indicator ${g}.${o}.${k}: share of planned outputs delivered to standard ${LONG}`,
      unit: '%',
      direction: 'higher_is_better' as const,
      baseline: 40,
      target: 80,
      actuals: k === 3 ? [] : ([[`2026-0${k + 4}-30`, 40 + g * 3 + o * 2 + k * 4]] as [string, number][]),
      owner: deptHead(g, k),
      activities: [1, 2, 3, 4, 5, 6].map((a) => {
        const code = `A${g}.${o}.${k}.${a}`;
        return {
          code,
          title: `Activity ${g}.${o}.${k}.${a}: carry out the agreed programme of work for this indicator ${LONG}`,
          level: LEVELS[(a - 1) % 6]!,
          owner: deptHead(g, k),
          evidence: 'Signed completion report',
          qty: a === 1 ? { value: 100, unit: 'outputs', done: 20 + a * g, asOf: '2026-06-30' } : undefined,
          lines: a % 2 ? [{ description: `Programme costs for ${code}`, amountMinor: 1_000_000 * (g + o + k + a), unit: `d${g}p${k}`, category: 'operating' as const, source: 'government_grant' as const }] : [],
        };
      }),
    })),
  })),
}));

export const createScale = () =>
  buildOrg({
    key: 'scale',
    name: 'Sample Scale Test Organisation',
    countryCode: 'RW', timeZone: 'Africa/Kigali', currency: 'RWF', fyStartMonth: 1, fy: 2026,
    planTitle: 'National programme strategy 2025–2029, including every directorate and partner programme', planYears: [2025, 2029],
    perspectives: DEFAULT_PERSPECTIVES,
    units: [
      { id: 'hq', parent: null, name: 'Sample Scale Test Organisation', type: 'Headquarters' },
      ...directorates.map((d) => ({ id: `d${d}`, parent: 'hq', name: `Directorate ${d}`, type: 'Directorate' })),
      ...directorates.flatMap((d) => departments.map((p) => ({ id: `d${d}p${p}`, parent: `d${d}`, name: `Department ${d}.${p}`, type: 'Department' }))),
    ],
    people,
    devRoles: { finance: 'dir1', supervisor: 'dh21', employee: 'off1' },
    goals,
    contracts: [{
      person: 'off1', status: 'signed',
      objectives: [
        { activity: 'A2.1.1.1', title: 'Deliver 40 outputs to standard', qty: { value: 40, unit: 'outputs' }, weight: 50, done: 12 },
        { activity: 'A2.1.1.2', title: 'Support the department’s second activity', qty: null, weight: 25 },
        { activity: 'A2.1.1.3', title: 'Support the department’s third activity', qty: null, weight: 25 },
      ],
    }],
  });
