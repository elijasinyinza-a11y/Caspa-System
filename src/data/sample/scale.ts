/**
 * Sample Scale Test Organisation — fictional, generated (Build Brief, section 14).
 * 4 goals × 4 objectives × 3 KPIs × 6 activities = 288 activities, with long names, to test layouts,
 * the cascade tree and selector speed. RWF has no minor units.
 */
import type { SixPLevel } from '../../contract/caspa-data-contract';
import { buildOrg, DEFAULT_PERSPECTIVES, type DeficiencySpec, type GoalSpec, type PersonSpec } from './build';

const LEVELS: SixPLevel[] = ['principle', 'process', 'people', 'policy', 'procedures', 'practices'];
const PERSPECTIVES = ['financial', 'customer', 'internal', 'innovation_learning'] as const;
const LONG = 'across every directorate, regional office and partner programme, with quarterly reporting to the board and annual independent verification';

const directorates = [1, 2, 3, 4];
const departments = [1, 2, 3];
const deptHead = (dir: number, dep: number) => `dh${dir}${dep}`;

const people: PersonSpec[] = [
  { key: 'dg', name: 'Director General', title: 'Director General', unit: 'hq', reportsTo: null },
  ...directorates.map((d) => ({ key: `dir${d}`, name: `Director ${d}`, title: `Director, Directorate ${d}`, unit: `d${d}`, reportsTo: 'dg', roles: d === 1 ? ['finance' as const] : d === 2 ? ['hr' as const] : d === 3 ? ['strategy_office' as const] : [] })),
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

const DEF_LEVELS: [SixPLevel, number][] = [['principle', 1], ['process', 8], ['people', 2], ['policy', 1], ['procedures', 1], ['practices', 1]];
/** O2.1's activities at each level: A2.1.k.a sits at LEVELS[a - 1]. */
const fixAt = (level: SixPLevel, n: number) => `A2.1.${(n % 3) + 1}.${LEVELS.indexOf(level) + 1}`;
const SCALE_DEFICIENCIES: DeficiencySpec[] = DEF_LEVELS.flatMap(([level, count]) => Array.from({ length: count }, (_, i) => ({ level, i })))
  .map(({ level, i }, n) => ({
    objective: 'O2.1',
    level,
    description: `Deficiency 2.1.${n + 1}: outputs fall short of standard in programme area 1 ${LONG}`,
    cause: `Probable cause recorded for deficiency 2.1.${n + 1} ${LONG}`,
    effects: `Effects recorded for deficiency 2.1.${n + 1}`,
    fix: (level === 'process' && i >= 6) || level === 'policy' ? [] : [fixAt(level, n)],
    timeframe: '12 months',
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
    devRoles: { finance: 'dir1', supervisor: 'dh21', employee: 'off1', hr: 'dir2', strategy: 'dir3' },
    // Slice 5 (approved 28 October 2026): one orphan line, so the budget gate is exercised here too.
    orphanLines: [{ description: 'Conference venue hire for the directorate planning retreat, Directorate 2', amountMinor: 2_400_000, unit: 'd2', category: 'operating', source: 'own_revenue' }],
    goals,
    // Slice 6 (approved 29 October 2026): 14 generated rows on O2.1 across all six levels, 8 at Process. Three have no
    // corrective activity, two of them the 7th and 8th Process rows, so folding never hides an unaddressed row.
    deficiencies: SCALE_DEFICIENCIES,
    contracts: [{
      person: 'off1', status: 'signed',
      objectives: [
        { activity: 'A2.1.1.1', title: 'Deliver 40 outputs to standard', qty: { value: 40, unit: 'outputs' }, weight: 50, done: 12 },
        { activity: 'A2.1.1.2', title: 'Support the department’s second activity', qty: null, weight: 25 },
        { activity: 'A2.1.1.3', title: 'Support the department’s third activity', qty: null, weight: 25 },
      ],
    }],
  });

/**
 * A generated structure of about 5,000 positions for the scale test organisation (D7-14), as template rows: the
 * same rows every time. Ten departments; three with 20 districts and seven with three sections, each with a
 * supervisor and 60 posts. About one post in eleven is vacant and one in seven holders has no email. A few rows
 * report to a title that does not exist, a few carry roles on a vacant row, and three pairs of people share an email.
 */
export function largeStructureRows(): string[][] {
  const FIRST = ['Mwila', 'Chola', 'Bupe', 'Mulenga', 'Natasha', 'Kabwe', 'Musonda', 'Chileshe', 'Lubinda', 'Mutinta', 'Inonge', 'Kondwani', 'Thandiwe', 'Chiza', 'Nalukui', 'Mapalo', 'Taonga', 'Luyando', 'Mwansa', 'Kunda'];
  const LAST = ['Banda', 'Phiri', 'Tembo', 'Zulu', 'Mwale', 'Daka', 'Lungu', 'Sakala', 'Mumba', 'Chanda', 'Ngoma', 'Mbewe', 'Simwanza', 'Hamoonga', 'Kasonde', 'Mutale', 'Siame', 'Nkhata', 'Chibwe', 'Lombe'];
  const rows: string[][] = [['Head office', 'Organisation', 'Chief Executive Officer', '', 'Mutale Banda', 'm.banda@sample-new.example', 'no', 'Executive', 'HO-001']];
  rows.push(['Head office › Corporate Services', 'Department', 'Head of Department', 'Chief Executive Officer', 'Ireen Sakala', 'i.sakala@sample-new.example', 'no', 'HR; Organisation administrator', 'CS-001']);
  let n = 0;
  const person = (): [string, string] => {
    n++;
    const f = FIRST[n % 20]!;
    const l = LAST[Math.floor(n / 20) % 20]!;
    return [`${f} ${l}`, `${f}.${l}.${n}@sample-new.example`.toLowerCase()];
  };
  const field = ['Operations', 'Customer Services', 'Engineering'];
  const office = ['Finance', 'Planning', 'Procurement', 'Information Technology', 'Internal Audit', 'Legal', 'Corporate Services'];
  for (const dep of [...field, ...office]) {
    if (dep !== 'Corporate Services') {
      const [name, email] = person();
      rows.push([`Head office › ${dep}`, 'Department', 'Head of Department', 'Chief Executive Officer', name, email, 'no', dep === 'Finance' ? 'Finance' : dep === 'Planning' ? 'Strategy office' : '', `${dep.slice(0, 3).toUpperCase()}-001`]);
    }
    const subs = field.includes(dep) ? Array.from({ length: 20 }, (_v, i) => [`District ${i + 1}`, 'District']) : [['Section A', 'Section'], ['Section B', 'Section'], ['Section C', 'Section']];
    for (const [sub, type] of subs) {
      const path = `Head office › ${dep} › ${sub}`;
      const [sn, se] = person();
      rows.push([path, type!, 'Supervisor', 'Head of Department', sn, se, 'no', '', '']);
      for (let k = 0; k < 60; k++) {
        const [name, email] = person();
        const vacant = n % 11 === 0;
        const noMail = n % 7 === 0;
        rows.push([path, type!, field.includes(dep) ? 'Field Officer' : 'Officer', n % 160 === 5 ? 'Team Leader' : 'Supervisor', vacant ? '' : name, vacant || noMail ? '' : email, 'no', vacant && n % 37 === 0 ? 'Finance' : '', '']);
      }
    }
  }
  for (let i = 1; i <= 3; i++) {
    const [name, email] = person();
    rows.push([`Head office › Planning › Projects › Project ${i}`, 'Project', 'Project Officer', 'Head of Department', name, email, 'no', '', '']);
  }
  const filled = rows.filter((r) => r[5] && r[4]);
  for (const i of [400, 1800, 3200]) filled[i + 1]![5] = filled[i]![5]!;
  return rows;
}
