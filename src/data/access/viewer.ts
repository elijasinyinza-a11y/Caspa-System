/** Who is looking: assigned roles plus authority derived from structure (decision B1). Pure. */
import type { AssignedRole, Id, ISODate } from '../../contract/caspa-data-contract';
import type { Store } from './store';

export interface Viewer {
  membershipId: Id<'Membership'>;
  personId: Id<'Person'>;
  orgId: Id<'Organisation'>;
  roles: AssignedRole[];
  positionIds: Id<'Position'>[];
  unitIds: Id<'OrgUnit'>[];
  isSupervisor: boolean;
  hasContract: boolean;
}

export function resolveViewer(s: Store, membershipId: string, now: ISODate, financialYear: number): Viewer {
  const m = s.memberships.find((x) => x.id === membershipId && x.status === 'active');
  if (!m) throw new Error(`No active membership ${membershipId}`);
  const positionIds = s.assignments
    .filter((a) => a.personId === m.personId && a.from <= now && (a.to === null || a.to >= now))
    .map((a) => a.positionId);
  const unitIds = s.positions.filter((p) => positionIds.includes(p.id)).map((p) => p.unitId);
  return {
    membershipId: m.id,
    personId: m.personId,
    orgId: m.orgId,
    roles: m.roles,
    positionIds,
    unitIds,
    isSupervisor: s.positions.some((p) => p.reportsToPositionId !== null && positionIds.includes(p.reportsToPositionId)),
    hasContract: s.contracts.some((c) => c.personId === m.personId && c.financialYear === financialYear),
  };
}

/** Financial year containing a date, for an organisation whose year starts in the given month. */
export const financialYearOf = (date: ISODate, startMonth: number): number => {
  const [y, mo] = date.split('-').map(Number) as [number, number];
  return mo >= startMonth ? y : y - 1;
};
