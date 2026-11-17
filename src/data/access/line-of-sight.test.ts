/** Each commitment on the Performance landing names the goal its activity serves (v0.26.2). */
import type { ISODate } from '../../contract/caspa-data-contract';
import { goalOfActivity } from '../../rules/structure';
import { createSampleOrgs, DEV_ROLES } from '../sample/all';
import { createMemoryRepository } from './repository';

const NOW = '2026-10-18' as ISODate;
const orgs = createSampleOrgs();
const stores = orgs.map((o) => o.store);

describe.each(orgs.map((o) => [o.store.organisation.name, o] as const))('%s', (_name, org) => {
  it.each(DEV_ROLES)('the %s role sees the goal each of their commitments serves', (role) => {
    const mine = createMemoryRepository(stores, org.orgId, org.devRoles[role], NOW).progress.landing().mine;
    for (const o of mine?.objectives ?? []) {
      const a = o.activity && org.store.activities.find((x) => x.id === o.activity!.id);
      const g = a ? goalOfActivity(org.store, a) : undefined;
      expect(o.goal?.id ?? null).toBe(g?.id ?? null);
    }
  });
});

it('Sample Water Utility: the Zone B meter reader’s commitments serve G1', () => {
  const org = orgs[0]!;
  const mine = createMemoryRepository(stores, org.orgId, org.devRoles.employee, NOW).progress.landing().mine;
  expect(mine?.objectives.length).toBe(2);
  expect(mine?.objectives.map((o) => o.goal?.code)).toEqual(['G1', 'G1']);
});
