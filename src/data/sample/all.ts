/**
 * Every sample organisation in the review build: the Sample Water Utility demo and three fictional test
 * organisations. The utility's Executive belongs to all four, so the organisation switcher reaches them.
 */
import type { Store } from '../access/store';
import { createManufacturer } from './manufacturing';
import { createNgo } from './ngo';
import { createScale } from './scale';
import { createSeed, DEV_ROLE_MEMBERSHIPS, ORG } from './seed';

export type BaseDevRole = 'executive' | 'strategy' | 'finance' | 'hr' | 'supervisor' | 'employee';
/** Every development role switch: the six roles, the organisation administrator (D7-13) and, where one exists, a consultant. */
export type DevRole = BaseDevRole | 'admin' | 'consultant';
export const DEV_ROLES: BaseDevRole[] = ['executive', 'strategy', 'finance', 'hr', 'supervisor', 'employee'];
export const ALL_DEV_ROLES: DevRole[] = [...DEV_ROLES, 'admin', 'consultant'];

export interface SampleOrg {
  orgId: string;
  store: Store;
  /** Membership behind each development role switch, per organisation. */
  devRoles: Record<BaseDevRole | 'admin', string>;
}

export const createSampleOrgs = (): SampleOrg[] => [
  { orgId: ORG, store: createSeed(), devRoles: { ...DEV_ROLE_MEMBERSHIPS } },
  ...[createNgo(), createManufacturer(), createScale()].map((o) => ({ orgId: o.orgId, store: o.store, devRoles: o.devRoles })),
];
