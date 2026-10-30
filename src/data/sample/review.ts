/**
 * The organisations in the review build: the four sample organisations plus Sample New Organisation (D7-13),
 * and which membership each development role switch views as. Development only; not part of the product.
 */
import type { Store } from '../access/store';
import { createSampleOrgs, type DevRole } from './all';
import { createNewOrganisation } from './new-org';

export interface ReviewOrg { orgId: string; store: Store; devRoles: Partial<Record<DevRole, string>> }

export const createReviewOrgs = (): ReviewOrg[] => [...createSampleOrgs(), createNewOrganisation()];

/**
 * The membership a development role views as. Fixed where the sample names one; otherwise found from the records,
 * so Sample New Organisation gains an Executive, a supervisor and an employee once its structure is confirmed.
 */
export function devMembership(org: ReviewOrg, role: DevRole, now: string): string | null {
  const fixed = org.devRoles[role];
  if (fixed) return fixed;
  const s = org.store;
  const active = s.memberships.filter((m) => m.status === 'active');
  const held = (personId: string) => s.assignments.filter((a) => a.personId === personId && a.from <= now && (a.to === null || a.to >= now)).map((a) => a.positionId as string);
  const byRole = (r: string) => active.find((m) => m.roles.includes(r as never) && held(m.personId).length > 0) ?? active.find((m) => m.roles.includes(r as never));
  switch (role) {
    case 'executive': return byRole('executive')?.id ?? null;
    case 'strategy': return byRole('strategy_office')?.id ?? null;
    case 'finance': return byRole('finance')?.id ?? null;
    case 'hr': return byRole('hr')?.id ?? null;
    case 'admin': return byRole('org_admin')?.id ?? null;
    case 'consultant': return active.find((m) => m.roles.includes('org_admin') && held(m.personId).length === 0 && m.endsOn)?.id ?? null;
    case 'supervisor':
    case 'employee': {
      const managers = new Set(s.positions.flatMap((p) => (p.reportsToPositionId ? [p.reportsToPositionId as string] : [])));
      return active.find((m) => m.roles.length === 0 && held(m.personId).some((p) => (role === 'supervisor') === managers.has(p)))?.id ?? null;
    }
  }
}
