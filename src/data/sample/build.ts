/**
 * Builds a fictional test organisation from a compact description (Build Brief, section 14).
 * Test organisations break the sample utility's assumptions: other sectors, currencies, year starts,
 * structures and term labels. Every record is a plain contract record; nothing computed is stored.
 */
import type {
  Activity, AssignedRole, BudgetLine, ContractObjective, DraftMeta, FourQCell, FourQEntry, Goal, Id, ISODate, ISODateTime,
  Kpi, Membership, Objective, OrgUnit, Perspective, PerspectiveKey, Position, SixPLevel, Stamp, SystemTerm, TermLabel,
} from '../../contract/caspa-data-contract';
import { activityFingerprint } from '../../rules/fingerprint';
import type { Store } from '../access/store';

const id = <T extends string>(s: string) => s as Id<T>;
const d = (s: string) => s as ISODate;
const dt = (s: string) => s as ISODateTime;

export const DEFAULT_TERMS: Record<SystemTerm, TermLabel> = {
  goal: { singular: 'Goal', plural: 'Goals' },
  objective: { singular: 'Objective', plural: 'Objectives' },
  kpi: { singular: 'KPI', plural: 'KPIs' },
  activity: { singular: 'Activity', plural: 'Activities' },
  deficiency: { singular: 'Deficiency', plural: 'Deficiencies' },
  budgetLine: { singular: 'Budget line', plural: 'Budget lines' },
  contractObjective: { singular: 'Contract objective', plural: 'Contract objectives' },
};
export const DEFAULT_PERSPECTIVES: Perspective[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'internal', label: 'Internal' },
  { key: 'innovation_learning', label: 'Innovation and learning' },
  { key: 'financial', label: 'Financial' },
];

/** The person who, in the review build, belongs to every sample organisation, so the organisation switcher reaches them. */
export const SHARED_EXECUTIVE = { personId: 'p-md', fullName: 'Chanda Mulenga', email: 'md@sample-water.example' };

export interface LineSpec { description: string; amountMinor: number; unit: string; category: BudgetLine['costCategory']; source: BudgetLine['fundingSource'] }
export interface ActivitySpec {
  code: string; title: string; level: SixPLevel | null; owner: string; evidence: string;
  qty?: { value: number; unit: string; done?: number; asOf?: string }; lines?: LineSpec[];
}
export interface KpiSpec {
  code: string; name: string; unit: string; direction: Kpi['direction']; aggregation?: Kpi['aggregation'];
  baseline: number | null; target?: number; actuals?: [string, number][]; owner: string | null;
  milestones?: { label: string; weight: number; completedOn: string | null }[]; activities: ActivitySpec[];
}
export interface ObjectiveSpec { code: string; title: string; owner: string; kpis: KpiSpec[] }
export interface GoalSpec { code: string; title: string; perspective: PerspectiveKey | null; owner: string; why?: { cell: FourQCell; text: string }; objectives: ObjectiveSpec[] }
export interface PersonSpec { key: string; name: string; title: string; unit: string; reportsTo: string | null; roles?: AssignedRole[] }
export interface ContractSpec {
  person: string; status: 'draft' | 'signed';
  objectives: { activity: string; title: string; qty: { value: number; unit: string } | null; weight: number; done?: number }[];
}

export interface OrgSpec {
  key: string; // short id prefix, unique per organisation
  name: string; countryCode: string; timeZone: string; currency: string; fyStartMonth: number; fy: number;
  terms?: Partial<Record<SystemTerm, TermLabel>>; perspectives: Perspective[] | null;
  units: { id: string; parent: string | null; name: string; type: string }[];
  people: PersonSpec[];
  goals: GoalSpec[];
  orphanLines?: LineSpec[];
  contracts: ContractSpec[];
  /** Who each development role switch views as. The executive is the shared person. */
  devRoles: { finance: string; supervisor: string; employee: string };
  planTitle: string; planYears: [number, number];
}

export interface BuiltOrg { store: Store; orgId: string; devRoles: Record<'executive' | 'finance' | 'supervisor' | 'employee', string> }

export function buildOrg(spec: OrgSpec): BuiltOrg {
  const k = spec.key;
  const orgId = id<'Organisation'>(`org-${k}`);
  const sharedMembership = id<'Membership'>(`m-${k}-shared-exec`);
  const stamp: Stamp = { at: dt(`${spec.fy}-01-05T08:00:00Z`), byMembershipId: sharedMembership };
  const base = { orgId, created: stamp, updated: stamp };
  const human: DraftMeta = { state: 'human', provenance: { kind: 'manual' }, decided: null };
  const pos = (p: string) => id<'Position'>(`pos-${k}-${p}`);
  const per = (p: string) => id<'Person'>(`p-${k}-${p}`);
  const unit = (u: string) => id<'OrgUnit'>(`u-${k}-${u}`);
  const planId = id<'StrategicPlan'>(`plan-${k}`);
  const fyStart = d(`${spec.fy}-${String(spec.fyStartMonth).padStart(2, '0')}-01`);

  const units: OrgUnit[] = spec.units.map((u) => ({ ...base, id: unit(u.id), parentId: u.parent ? unit(u.parent) : null, name: u.name, unitType: u.type }));
  const positions: Position[] = spec.people.map((p) => ({ ...base, id: pos(p.key), unitId: unit(p.unit), title: p.title, reportsToPositionId: p.reportsTo ? pos(p.reportsTo) : null }));
  const people = [
    ...spec.people.map((p) => ({ id: per(p.key), fullName: p.name, email: `${p.key}@${k}.example` })),
    { id: id<'Person'>(SHARED_EXECUTIVE.personId), fullName: SHARED_EXECUTIVE.fullName, email: SHARED_EXECUTIVE.email },
  ];
  const assignments = spec.people.map((p) => ({
    ...base, id: id<'PositionAssignment'>(`pa-${k}-${p.key}`), positionId: pos(p.key), personId: per(p.key), kind: 'substantive' as const, from: d('2024-01-01'), to: null,
  }));
  const membership = (mid: string, personId: Id<'Person'>, roles: AssignedRole[]): Membership => ({
    ...base, id: id(mid), personId, roles, startsOn: d('2024-01-01'), endsOn: null, status: 'active',
  });
  const memberships: Membership[] = [
    ...spec.people.map((p) => membership(`m-${k}-${p.key}`, per(p.key), p.roles ?? [])),
    membership(sharedMembership, id(SHARED_EXECUTIVE.personId), ['executive']),
  ];

  const goals: Goal[] = [];
  const objectives: Objective[] = [];
  const kpis: Kpi[] = [];
  const activities: Activity[] = [];
  const fourQEntries: FourQEntry[] = [];
  const store: Store = {
    organisation: {
      id: orgId, name: spec.name, countryCode: spec.countryCode, timeZone: spec.timeZone, baseCurrency: spec.currency,
      financialYearStartMonth: spec.fyStartMonth, created: stamp, updated: stamp,
      termLabels: { ...DEFAULT_TERMS, ...spec.terms }, perspectives: spec.perspectives,
      settings: {
        overdueEscalationDays: 7, reviewModel: 'mid_year_and_annual', kpiStatus: { onTrackAt: 0.9, atRiskAt: 0.7 }, ratingSchemeId: id(`rs-${k}`),
        aiEnabled: true, boardApprovalRequired: { plan: true, budget: false }, consultationMinGroupSize: 5,
      },
    },
    people, memberships, units, positions, assignments,
    plans: [{
      ...base, id: planId, title: spec.planTitle, startYear: spec.planYears[0], endYear: spec.planYears[1], entryDoor: 'imported', status: 'active',
      confirmation: { at: stamp.at, byMembershipId: sharedMembership }, boardApproval: null, formation: null, processOwnerPositionId: null, calendar: null, currentRevision: 0,
    }],
    fourQEntries, goals, objectives, kpis,
    kpiTargets: [], kpiActuals: [], baselineMeasures: [], resourceEnvelopes: [], activities, activityProgress: [], deficiencies: [],
    cycles: [{ ...base, id: id(`cy-${k}-budget`), kind: 'budget', financialYear: spec.fy, status: 'open', gateDueDates: {} }],
    budgetVersions: [{ ...base, id: id(`bv-${k}-1`), cycleId: id(`cy-${k}-budget`), version: 1, status: 'draft', approval: null, boardApproval: null }],
    budgetLines: [], contracts: [], contractObjectives: [], progressUpdates: [], acknowledgements: [], gateEvents: [],
  };

  let lineNo = 0;
  const addLine = (l: LineSpec, activityId: Id<'Activity'> | null) => {
    lineNo += 1;
    store.budgetLines.push({
      ...base, id: id(`bl-${k}-${lineNo}`), versionId: id(`bv-${k}-1`), activityId, holderUnitId: unit(l.unit), description: l.description,
      amount: { amountMinor: l.amountMinor, currency: spec.currency }, costCategory: l.category, fundingSource: l.source, fundingNote: null,
    });
  };

  for (const g of spec.goals) {
    const why = g.why ? [{ ...base, id: id<'FourQEntry'>(`q-${k}-${g.code}`), planId, cell: g.why.cell, text: g.why.text, raisedByUnitIds: [unit(spec.units[0]!.id)], scope: 'organisation' as const, mergedIntoId: null, evidence: null, draft: human }] : [];
    fourQEntries.push(...why);
    const gid = id<'Goal'>(`g-${k}-${g.code}`);
    goals.push({ ...base, id: gid, planId, code: g.code, title: g.title, perspective: g.perspective, ownerPositionId: pos(g.owner), themeIds: [], fourQEntryIds: why.map((q) => q.id), draft: human });
    for (const o of g.objectives) {
      const oid = id<'Objective'>(`o-${k}-${o.code}`);
      objectives.push({ ...base, id: oid, goalId: gid, code: o.code, title: o.title, ownerPositionId: pos(o.owner), proposedByPositionId: null, fourQEntryIds: [], draft: human });
      for (const kp of o.kpis) {
        const kid = id<'Kpi'>(`k-${k}-${kp.code}`);
        kpis.push({
          ...base, id: kid, objectiveId: oid, code: kp.code, name: kp.name, unit: kp.unit, direction: kp.direction, aggregation: kp.aggregation ?? 'latest',
          baseline: kp.baseline, baselineMeasureId: null, reportingFrequency: 'monthly', ownerPositionId: kp.owner ? pos(kp.owner) : null, draft: human,
          milestones: (kp.milestones ?? []).map((m, i) => ({ id: `${kid}-m${i + 1}`, label: m.label, weight: m.weight, completedOn: m.completedOn ? d(m.completedOn) : null })),
        });
        if (kp.target !== undefined) store.kpiTargets.push({ ...base, id: id(`kt-${k}-${kp.code}`), kpiId: kid, financialYear: spec.fy, target: kp.target });
        (kp.actuals ?? []).forEach(([on, value], i) => store.kpiActuals.push({ ...base, id: id(`ka-${k}-${kp.code}-${i}`), kpiId: kid, periodEnd: d(on), value }));
        for (const a of kp.activities) {
          const aid = id<'Activity'>(`a-${k}-${a.code}`);
          activities.push({
            ...base, id: aid, kpiId: kid, financialYear: spec.fy, code: a.code, title: a.title, decisionLevel: a.level, ownerPositionId: pos(a.owner),
            reportingFrequency: 'monthly', evidence: a.evidence, quantityTarget: a.qty ? { value: a.qty.value, unit: a.qty.unit } : null, dependsOn: [],
            status: a.level === null ? 'planned' : 'in_progress', draft: human,
          });
          if (a.qty?.done !== undefined) {
            store.activityProgress.push({ ...base, id: id(`ap-${k}-${a.code}`), activityId: aid, periodEnd: d(a.qty.asOf ?? fyStart), quantityDone: a.qty.done, note: '' });
          }
          (a.lines ?? []).forEach((l) => addLine(l, aid));
        }
      }
    }
  }
  (spec.orphanLines ?? []).forEach((l) => addLine(l, null));

  const signedAt = dt(`${spec.fy}-${String(spec.fyStartMonth).padStart(2, '0')}-20T10:00:00Z`);
  for (const c of spec.contracts) {
    const person = spec.people.find((p) => p.key === c.person)!;
    const cid = id<'PerformanceContract'>(`pc-${k}-${c.person}`);
    const supervisorKey = person.reportsTo!;
    const signed = c.status === 'signed';
    store.contracts.push({
      ...base, id: cid, personId: per(c.person), positionId: pos(c.person), financialYear: spec.fy, status: c.status,
      signedByEmployee: signed ? { at: signedAt, byMembershipId: id(`m-${k}-${c.person}`) } : null,
      signedBySupervisor: signed ? { at: signedAt, byMembershipId: id(`m-${k}-${supervisorKey}`) } : null,
    });
    c.objectives.forEach((o, i) => {
      const a = activities.find((x) => x.code === o.activity);
      if (!a) throw new Error(`${spec.name}: contract objective names unknown activity ${o.activity}`);
      const coid = id<'ContractObjective'>(`co-${k}-${c.person}-${i + 1}`);
      const co: ContractObjective = {
        ...base, id: coid, contractId: cid, sourceActivityId: a.id, title: o.title, quantityTarget: o.qty,
        snapshot: signed ? { title: o.title, quantityTarget: o.qty, sourceFingerprint: activityFingerprint(a), frozenAt: signedAt } : null,
        direction: 'higher_is_better', weightPct: o.weight,
      };
      store.contractObjectives.push(co);
      if (o.done !== undefined) {
        // Verified at the end of the second month of the year.
        const end = new Date(Date.UTC(spec.fy, spec.fyStartMonth + 1, 0)).toISOString().slice(0, 10);
        const at = dt(`${end}T16:00:00Z`);
        store.progressUpdates.push({
          ...base, id: id(`pu-${k}-${c.person}-${i + 1}`), contractObjectiveId: coid, periodEnd: d(end), quantityDone: o.done, note: '', evidence: 'Supervisor check',
          verified: { at, byMembershipId: id(`m-${k}-${supervisorKey}`) }, sync: { capturedOffline: true, capturedAt: at, syncedAt: at },
        });
      }
    });
  }

  return {
    store,
    orgId,
    devRoles: {
      executive: sharedMembership,
      finance: `m-${k}-${spec.devRoles.finance}`,
      supervisor: `m-${k}-${spec.devRoles.supervisor}`,
      employee: `m-${k}-${spec.devRoles.employee}`,
    },
  };
}
