/**
 * Access review (Access Review Specification v0.1, AR-1 to AR-10, confirmed 19 November 2026; BUILD-BRIEF section 54).
 * Pure: no React, no I/O, no system clock ("now" is passed in). Findings are computed, never stored.
 *
 * - D1: a membership counts only from its start date to its end date, inclusive (`membershipActiveOn`).
 * - Section 4: five checks on role holders once the structure is confirmed, all worth checking, none blocking.
 * - Section 3.1: when each role holder got the role ("held since"), from the audit trail.
 */
import type { AssignedRole, AuditEntry, ISODate, Membership } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';

/** D1: whether a membership gives access on a day: active, started, and not past its end date. */
export const membershipActiveOn = (m: Pick<Membership, 'status' | 'startsOn' | 'endsOn'>, on: ISODate): boolean =>
  m.status === 'active' && m.startsOn <= on && (m.endsOn === null || m.endsOn >= on);

/** Memberships that give access on a day. */
export const activeMemberships = (s: Store, on: ISODate): Membership[] => s.memberships.filter((m) => membershipActiveOn(m, on));

/**
 * Whether access has ended for a membership on a day: ended by an administrator, or past its end date. A membership
 * that has not started yet has not ended.
 */
export const accessEnded = (m: Pick<Membership, 'status' | 'startsOn' | 'endsOn'>, on: ISODate): boolean =>
  m.status === 'ended' || (m.endsOn !== null && m.endsOn < on);

/** Positions a person holds on a day. */
export const positionsHeldOn = (s: Store, personId: string, on: ISODate) =>
  s.assignments.filter((a) => a.personId === personId && a.from <= on && (a.to === null || a.to >= on));

/** The order roles are listed in By role (section 3.1). */
export const ROLE_ORDER: AssignedRole[] = ['executive', 'org_admin', 'strategy_office', 'finance', 'hr', 'compliance', 'facilitator'];

/** Days before an end date that ACCESS-ENDS-SOON is raised (AR-5). */
export const ENDS_SOON_DAYS = 14;

const addDays = (d: ISODate, n: number): ISODate => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10) as ISODate;

export type AccessCheckKind = 'roleNoPosition' | 'endsSoon' | 'noStaffAdmin' | 'noExecutive' | 'keyRoleActingOnly';

/** One access check, before it becomes a finding (src/rules/integrity.ts turns it into one). */
export interface AccessCheck {
  kind: AccessCheckKind;
  /** The membership for person-level checks; the organisation for the others. */
  subject: { type: 'Membership' | 'Organisation'; id: string };
  /** Key suffix that keeps two checks of one kind apart (the role, for the acting-only check). */
  part: string | null;
  personName: string | null;
  roles: AssignedRole[];
  endsOn: ISODate | null;
  /** For the acting-only check. */
  role: AssignedRole | null;
}

/** Positions held by people with a role, for routing (administrators' positions). */
export function roleHolderPositions(s: Store, role: AssignedRole, on: ISODate): string[] {
  return [...new Set(activeMemberships(s, on).filter((m) => m.roles.includes(role)).flatMap((m) => positionsHeldOn(s, m.personId, on).map((a) => a.positionId as string)))];
}

/** Section 4: the access checks on a confirmed structure, on a day. */
export function accessChecks(s: Store, now: ISODate): AccessCheck[] {
  const out: AccessCheck[] = [];
  const active = activeMemberships(s, now);
  const name = (personId: string) => s.people.find((p) => p.id === personId)?.fullName ?? personId;
  const soon = addDays(now, ENDS_SOON_DAYS);
  for (const m of active) {
    const held = positionsHeldOn(s, m.personId, now);
    // People with an end date (facilitators, consultants) are expected to hold no position.
    if (m.roles.length > 0 && held.length === 0 && m.endsOn === null) {
      out.push({ kind: 'roleNoPosition', subject: { type: 'Membership', id: m.id }, part: null, personName: name(m.personId), roles: [...m.roles], endsOn: null, role: null });
    }
    if (m.endsOn !== null && m.endsOn <= soon) {
      out.push({ kind: 'endsSoon', subject: { type: 'Membership', id: m.id }, part: null, personName: name(m.personId), roles: [...m.roles], endsOn: m.endsOn, role: null });
    }
  }
  const org = { type: 'Organisation' as const, id: s.organisation.id as string };
  const holders = (r: AssignedRole) => active.filter((m) => m.roles.includes(r));
  if (!holders('org_admin').some((m) => positionsHeldOn(s, m.personId, now).length > 0)) {
    out.push({ kind: 'noStaffAdmin', subject: org, part: null, personName: null, roles: [], endsOn: null, role: null });
  }
  if (holders('executive').length === 0) out.push({ kind: 'noExecutive', subject: org, part: null, personName: null, roles: [], endsOn: null, role: null });
  // AR-4: only for Executive and Organisation administrator.
  for (const r of ['executive', 'org_admin'] as const) {
    const placed = holders(r).map((m) => positionsHeldOn(s, m.personId, now)).filter((h) => h.length > 0);
    if (placed.length > 0 && placed.every((h) => h.every((a) => a.kind === 'acting'))) {
      out.push({ kind: 'keyRoleActingOnly', subject: org, part: r, personName: null, roles: [], endsOn: null, role: r });
    }
  }
  return out;
}

/** The roles a Membership audit entry's record holds, or null when it holds none. */
const rolesIn = (rec: unknown): AssignedRole[] | null => {
  const r = (rec as { roles?: unknown } | null)?.roles;
  return Array.isArray(r) ? (r as AssignedRole[]) : null;
};

/**
 * Section 3.1, "held since": the date of the latest audit entry that added the role to the membership, or the
 * membership's start date when no entry did (roles given before per-person audit entries, AR-8).
 */
export function heldSince(entries: readonly AuditEntry[], m: Pick<Membership, 'id' | 'startsOn'>, role: AssignedRole, dateOf: (at: string) => ISODate): ISODate {
  let since: ISODate | null = null;
  for (const e of entries) {
    if (e.entity.type !== 'Membership' || e.entity.id !== m.id) continue;
    const before = rolesIn(e.before) ?? [];
    const after = rolesIn(e.after);
    if (after && after.includes(role) && !before.includes(role)) since = dateOf(e.at);
  }
  return since && since >= m.startsOn ? since : m.startsOn;
}
