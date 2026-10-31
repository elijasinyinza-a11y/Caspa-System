/**
 * Sample New Organisation (D7-13): a fifth, unconfirmed organisation for trying organisation setup in the review
 * build. It holds only its administrator and a consultant; everything else arrives through setup. Fictional.
 */
import { RATING_PRESETS, type Id, type ISODate, type ISODateTime, type Stamp } from '../../contract/caspa-data-contract';
import type { Store } from '../access/store';
import { DEFAULT_STRUCTURE_VIEW } from '../../rules/structure-view';
import { DEFAULT_PERSPECTIVES, DEFAULT_TERMS } from './build';

const id = <T extends string>(s: string) => s as Id<T>;
export const NEW_ORG = id<'Organisation'>('org-new');
const stamp: Stamp = { at: '2026-10-01T08:00:00+02:00' as ISODateTime, byMembershipId: id('m-new-is') };
const base = { orgId: NEW_ORG, created: stamp, updated: stamp };

export function createNewOrganisation(): { orgId: string; store: Store; devRoles: { admin: string; consultant: string } } {
  const store: Store = {
    organisation: {
      id: NEW_ORG, name: 'Sample New Organisation', countryCode: 'ZM', timeZone: 'Africa/Lusaka', baseCurrency: 'ZMW', financialYearStartMonth: 1,
      created: stamp, updated: stamp, termLabels: structuredClone(DEFAULT_TERMS), perspectives: structuredClone(DEFAULT_PERSPECTIVES),
      settings: {
        overdueEscalationDays: 7, reviewModel: 'mid_year_and_annual', kpiStatus: { onTrackAt: 0.9, atRiskAt: 0.7 }, ratingSchemeId: id('rs-new'),
        aiEnabled: true, boardApprovalRequired: { plan: true, budget: true }, consultationMinGroupSize: 5, structureView: structuredClone(DEFAULT_STRUCTURE_VIEW),
      },
    },
    people: [
      { id: id('p-new-is'), fullName: 'Ireen Sakala', email: 'i.sakala@sample-new.example' },
      { id: id('p-new-cn'), fullName: 'Chipo Ngoma', email: 'c.ngoma@sample-advisers.example' },
    ],
    memberships: [
      { ...base, id: id('m-new-is'), personId: id('p-new-is'), roles: ['org_admin'], startsOn: '2026-10-01' as ISODate, endsOn: null, status: 'active' },
      // A consultant setting up for the client: administrator access with an end date, and no position (D7-7).
      { ...base, id: id('m-new-cn'), personId: id('p-new-cn'), roles: ['org_admin'], startsOn: '2026-10-01' as ISODate, endsOn: '2026-12-31' as ISODate, status: 'active' },
    ],
    units: [], positions: [], assignments: [], plans: [], fourQEntries: [], goals: [], objectives: [], kpis: [], kpiTargets: [], kpiActuals: [],
    baselineMeasures: [], resourceEnvelopes: [], activities: [], activityProgress: [], deficiencies: [], cycles: [], budgetVersions: [], budgetLines: [],
    contracts: [], contractObjectives: [], progressUpdates: [], reviews: [],
    ratingSchemes: [{
      ...base, id: id('rs-new'), preset: 'A', bands: RATING_PRESETS.A, competencySection: { enabled: false, weightPct: 0 },
      floorRule: false, highAchievementFlagAt: 1.5, lockedByCycleId: null,
    }],
    workshops: [], formationDeadlines: [], acknowledgements: [], gateEvents: [], auditEntries: [], sourceDocuments: [], aiTasks: [], visionStatements: [],
  };
  return { orgId: NEW_ORG, store, devRoles: { admin: 'm-new-is', consultant: 'm-new-cn' } };
}

/** The small sample template file: one row per position, the nine approved columns. Two rows need attention on purpose. */
export const SAMPLE_TEMPLATE_ROWS: string[][] = [
  ['Head office', 'Organisation', 'Chief Executive Officer', '', 'Mutale Banda', 'm.banda@sample-new.example', 'no', 'Executive', ''],
  ['Head office › Finance', 'Department', 'Finance Manager', 'Chief Executive Officer', 'Grace Tembo', 'g.tembo@sample-new.example', 'no', 'Finance', ''],
  ['Head office › Finance', 'Department', 'Accountant', 'Finance Manager', 'Peter Zulu', 'p.zulu@sample-new.example', 'no', '', ''],
  ['Head office › Finance', 'Department', 'Assistant Accountant', 'Accountant', '', '', '', 'Finance', ''],
  ['Head office › Corporate Services', 'Department', 'Corporate Services Manager', 'Chief Executive Officer', 'Ireen Sakala', 'i.sakala@sample-new.example', 'no', 'HR; Organisation administrator', ''],
  ['Head office › Corporate Services', 'Department', 'IT Officer', 'Corporate Services Manager', 'Brian Mumba', 'm.chanda@sample-new.example', 'no', '', ''],
  ['Head office › Operations', 'Department', 'Operations Manager', 'Chief Executive Officer', 'Joseph Lungu', 'j.lungu@sample-new.example', 'no', 'Strategy office', ''],
  ['Head office > Operations > Regions > North', 'Region', 'Regional Supervisor', 'Operations Manager', 'Agnes Mwale', 'a.mwale@sample-new.example', 'no', '', ''],
  ['Head office > Operations > Regions > South', 'Region', 'Regional Supervisor', 'Operations Manager', '', '', '', '', ''],
  ['Head office / Operations / Regions / North', 'Region', 'Field Officer', 'Regional Supervisor', 'Kelvin Daka', '', 'no', '', 'FO-N1'],
  ['Head office / Operations / Regions / North', 'Region', 'Field Officer', 'Regional Supervisor', 'Mary Chanda', 'm.chanda@sample-new.example', 'no', '', 'FO-N2'],
  ['Head office / Operations / Regions / South', 'Region', 'Field Officer', 'Supervisor', 'Lweendo Hamoonga', 'l.hamoonga@sample-new.example', 'yes', '', ''],
];
