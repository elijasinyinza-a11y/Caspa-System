/**
 * Every sample organisation in the review build: the Sample Water Utility demo and three fictional test
 * organisations. The utility's Executive belongs to all four, so the organisation switcher reaches them.
 */
import type { Store } from '../access/store';
import { createManufacturer } from './manufacturing';
import { createNgo } from './ngo';
import { createScale } from './scale';
import { createSeed, DEV_ROLE_MEMBERSHIPS, ORG } from './seed';

export type DevRole = 'executive' | 'strategy' | 'finance' | 'hr' | 'supervisor' | 'employee';
export const DEV_ROLES: DevRole[] = ['executive', 'strategy', 'finance', 'hr', 'supervisor', 'employee'];

export interface SampleOrg {
  orgId: string;
  store: Store;
  /** Membership behind each development role switch, per organisation. */
  devRoles: Record<DevRole, string>;
}

export const createSampleOrgs = (): SampleOrg[] => [
  { orgId: ORG, store: createSeed(), devRoles: { ...DEV_ROLE_MEMBERSHIPS } },
  ...[createNgo(), createManufacturer(), createScale()].map((o) => ({ orgId: o.orgId, store: o.store, devRoles: o.devRoles })),
];
