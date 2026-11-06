/**
 * Every sample organisation in the review build: the Sample Water Utility demo and three fictional test
 * organisations. The utility's Executive belongs to all four, so the organisation switcher reaches them.
 */
import type { Store } from '../access/store';
import { createManufacturer } from './manufacturing';
import { createNgo } from './ngo';
import { createScale } from './scale';
import { createSeed, DEV_ROLE_MEMBERSHIPS, ORG } from './seed';
import { addSampleSurvey } from './survey-samples';

export type BaseDevRole = 'executive' | 'strategy' | 'finance' | 'hr' | 'supervisor' | 'employee';
/**
 * Every development role switch: the six roles, the organisation administrator (D7-13), and, where one exists, the
 * compliance officer (part 11c), a consultant, and the employee's next-level reviewer (v0.20.0, RV-8).
 */
export type DevRole = BaseDevRole | 'admin' | 'compliance' | 'consultant' | 'reviewer';
export const DEV_ROLES: BaseDevRole[] = ['executive', 'strategy', 'finance', 'hr', 'supervisor', 'employee'];
export const ALL_DEV_ROLES: DevRole[] = [...DEV_ROLES, 'admin', 'compliance', 'consultant', 'reviewer'];

export interface SampleOrg {
  orgId: string;
  store: Store;
  /** Membership behind each development role switch, per organisation. */
  devRoles: Record<BaseDevRole | 'admin', string>;
}

export const createSampleOrgs = (): SampleOrg[] => [
  { orgId: ORG, store: createSeed(), devRoles: { ...DEV_ROLE_MEMBERSHIPS } },
  ...[createNgo(), createManufacturer(), createScale()].map((o) => ({ orgId: o.orgId, store: o.store, devRoles: o.devRoles })),
].map((o) => {
  // v0.19.0: staff survey rounds for two test organisations (src/data/sample/survey-samples.ts).
  if (o.store.organisation.name.includes('Health NGO')) addSampleSurvey(o.store, { title: 'Start of year, 2026/27', opensOn: '2026-07-13', closesOn: '2026-08-07', answers: 3 });
  if (o.store.organisation.name.includes('Scale Test')) addSampleSurvey(o.store, { title: 'Start of year, 2026', opensOn: '2026-02-09', closesOn: '2026-03-06', answers: 'all' });
  return o;
});
