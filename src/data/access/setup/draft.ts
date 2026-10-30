/**
 * The draft structure (D7-8): a frontend-only type, not a contract record. It reuses the contract's DraftMeta and
 * Provenance. Nothing in it reaches permissions or checks on stored records until the administrator confirms it;
 * on confirmation its IDs become the record IDs. In the review build it lives in memory and resets on reload.
 */
import type { AssignedRole, DraftMeta, ISODate, ISODateTime, Id, Organisation, Stamp } from '../../../contract/caspa-data-contract';
import type { StructureInput, StructurePerson, StructurePosition, StructureUnit, WorthKind } from '../../../rules/setup';
import type { Store } from '../store';

export interface DraftUnit extends StructureUnit { draft: DraftMeta }
export interface DraftPosition extends StructurePosition { draft: DraftMeta; /** Spreadsheet row it came from. */ row: number | null }
export interface DraftPerson extends StructurePerson {
  /** When their access ends: required for a consultant's administrator access (B4). */
  endsOn: ISODate | null;
  /** True when the person is already a record in this organisation (for example the administrator). */
  existing: boolean;
}
export interface DraftStructure extends StructureInput { units: DraftUnit[]; positions: DraftPosition[]; people: DraftPerson[] }

/** Every organisation setting except the rating scheme, which stays with HR (D7-11). */
export type DraftDetails = Pick<Organisation, 'name' | 'countryCode' | 'timeZone' | 'baseCurrency' | 'financialYearStartMonth' | 'termLabels' | 'perspectives'> & {
  settings: Omit<Organisation['settings'], 'ratingSchemeId'>;
};

export type RowProblem =
  | { kind: 'reports_unmatched'; row: number; positionId: string; reportsTo: string; ambiguous: boolean; done: boolean }
  | { kind: 'roles_on_vacant'; row: number; positionId: string; roles: AssignedRole[]; done: boolean };

export interface SetupDraft {
  details: DraftDetails;
  structure: DraftStructure;
  rowProblems: RowProblem[];
  /** What the last spreadsheet import added, shown after reading it. */
  sheet: { rows: number; units: number; positions: number; holders: number } | null;
  /** Worth-checking kinds marked as checked, with the reason (kept in the confirmation's audit entry). */
  checked: Partial<Record<WorthKind, { reason: string; by: Stamp }>>;
  /** The organogram behind an AI draft. */
  ai: { sourceDocumentId: Id<'SourceDocument'>; aiTaskId: Id<'AiTask'>; fileName: string } | null;
}

export const human = (): DraftMeta => ({ state: 'human', provenance: { kind: 'manual' }, decided: null });

/** The details and settings an organisation already has, each setting at its default where it starts empty. */
export const detailsOf = (o: Organisation): DraftDetails => {
  const settings: Omit<Organisation['settings'], 'ratingSchemeId'> & { ratingSchemeId?: unknown } = structuredClone(o.settings);
  delete settings.ratingSchemeId;
  return {
    name: o.name, countryCode: o.countryCode, timeZone: o.timeZone, baseCurrency: o.baseCurrency, financialYearStartMonth: o.financialYearStartMonth,
    termLabels: structuredClone(o.termLabels), perspectives: o.perspectives ? structuredClone(o.perspectives) : null, settings,
  };
};

/** The people already in an organisation before setup (administrators and consultants), as draft people. */
export const existingPeople = (s: Store): DraftPerson[] =>
  s.memberships
    .filter((m) => m.status === 'active')
    .map((m) => {
      const p = s.people.find((x) => x.id === m.personId)!;
      return { id: p.id, fullName: p.fullName, email: p.email, roles: [...m.roles], endsOn: m.endsOn, existing: true };
    });

export const emptyDraft = (s: Store): SetupDraft => ({
  details: detailsOf(s.organisation),
  structure: { units: [], positions: [], people: existingPeople(s) },
  rowProblems: [], sheet: null, checked: {}, ai: null,
});

/** The stored structure in the shape the setup rules read: current holders only (D7-10, editing after confirmation). */
export function structureOfStore(s: Store, now: ISODate): StructureInput {
  const current = s.assignments.filter((a) => a.from <= now && (a.to === null || a.to >= now));
  const holderOf = new Map(current.map((a) => [a.positionId as string, a]));
  const roles = new Map(s.memberships.filter((m) => m.status === 'active').map((m) => [m.personId as string, m.roles]));
  return {
    units: s.units.map((u) => ({ id: u.id, name: u.name, unitType: u.unitType, parentId: u.parentId })),
    positions: s.positions.map((p) => {
      const a = holderOf.get(p.id);
      return { id: p.id, unitId: p.unitId, title: p.title, ref: null, reportsToId: p.reportsToPositionId, holder: a ? { personId: a.personId, acting: a.kind === 'acting' } : null };
    }),
    // Only people who belong to the organisation now; a person who has left keeps their record but is not listed.
    people: s.people.filter((p) => roles.has(p.id)).map((p) => ({ id: p.id, fullName: p.fullName, email: p.email, roles: [...(roles.get(p.id) ?? [])] })),
  };
}

export type { ISODateTime };
