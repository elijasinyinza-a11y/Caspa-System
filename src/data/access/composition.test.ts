/** Contract v1.7 (Build Brief, section 34): permission rows for Strategy formation part 11d, Composition. */
import { describe, expect, it } from 'vitest';
import type { ISODate } from '../../contract/caspa-data-contract';
import { PERMISSIONS } from '../../contract/caspa-data-contract';
import { createReviewOrgs, type ReviewOrg } from '../sample/review';
import { can } from './permissions';
import { resolveViewer } from './viewer';

const NOW = '2026-10-18' as ISODate;
const swu = () => (createReviewOrgs().find((o) => o.orgId === 'org-sample-water') as ReviewOrg).store;

describe('contract v1.7 permission rows', () => {
  it('themes: seen by all, drafted by the Strategy office or a facilitator, accepted by the Strategy office', () => {
    expect(PERMISSIONS.Theme).toEqual({ view: ['all_members'], draft: ['strategy_office', 'facilitator'], approve: ['strategy_office'] });
    expect(PERMISSIONS.Theme?.approve).not.toContain('facilitator');
  });
  it('objectives may be proposed by their owner; the Executive still confirms', () => {
    expect(PERMISSIONS.Objective?.propose).toEqual(['owner']);
    expect(PERMISSIONS.Objective?.confirm).toEqual(['executive']);
  });
  it('indicative costs follow the envelope row, plus the objective’s owner', () => {
    expect(PERMISSIONS.IndicativeCost).toEqual({
      view: ['executive', 'finance', 'strategy_office', 'objective_owner'],
      draft: ['objective_owner', 'finance', 'strategy_office'],
    });
  });
  it('the owner of an objective may draft and propose its KPIs, and nobody else’s', () => {
    const s = swu();
    const k = s.kpis.find((x) => x.code === 'K1.2.1')!;
    const o = s.objectives.find((x) => x.id === k.objectiveId)!;
    const holder = s.assignments.find((a) => a.positionId === o.ownerPositionId)!;
    const m = s.memberships.find((x) => x.personId === holder.personId)!;
    const v = resolveViewer(s, m.id, NOW, 2026);
    expect(can(s, v, 'draft', { type: 'Kpi', id: k.id })).toBe(true);
    expect(can(s, v, 'propose', { type: 'Kpi', id: k.id })).toBe(true);
    const other = s.kpis.find((x) => s.objectives.find((y) => y.id === x.objectiveId)?.ownerPositionId !== o.ownerPositionId && x.ownerPositionId !== null && !v.positionIds.includes(x.ownerPositionId))!;
    expect(can(s, v, 'draft', { type: 'Kpi', id: other.id })).toBe(false);
  });
});
