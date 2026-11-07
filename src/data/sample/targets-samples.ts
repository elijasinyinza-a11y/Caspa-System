/**
 * Targets sample data for the test organisations (v0.21.0, TG-10). Fictional, the same every time; Sample Water
 * Utility's approved structure is unchanged. The NGO's structure is flat (no units below its office), so it has none.
 * - Scale organisation: a weighted-average breakdown of the KPI its supervisor role owns, across that directorate's
 *   departments; one share without an owner; readings verified, waiting and none.
 *   One proposal of new work from the second department's share waits for the Strategy office (v0.25.0, TG-9).
 * - Packaging manufacturer: Material waste (lower is better) by Production and Quality, weighted by tonnes of input,
 *   combining above the corporate target; and one standing duty in the Machine Operator's contract.
 */
import type { ISODate, ISODateTime, Stamp } from '../../contract/caspa-data-contract';
import type { Store } from '../access/store';

const at = (d: string) => `${d}T09:00:00+00:00` as ISODateTime;

function breakdown(s: Store, o: { kpiId: string; parentUnitId: string; weightLabel: string; shares: { unitId: string; owner: string | null; target: number; weight: number; reading?: { periodEnd: string; value: number; verifiedBy?: string } }[] }) {
  const k = s.kpis.find((x) => x.id === o.kpiId);
  const lead = s.memberships.find((m) => m.roles.includes('strategy_office')) ?? s.memberships[0]!;
  if (!k) return;
  const st: Stamp = { at: at('2026-04-10'), byMembershipId: lead.id };
  const fy = s.kpiTargets.find((t) => t.kpiId === k.id)?.financialYear ?? 2026;
  const id = `kb-${k.id}-${fy}`;
  s.kpiBreakdowns.push({ orgId: s.organisation.id, id: id as never, kpiId: k.id, financialYear: fy, combine: 'weighted', weightLabel: o.weightLabel, created: st, updated: st });
  for (const x of o.shares) {
    const sid = `ks-${id}-${x.unitId}`;
    s.kpiShares.push({ orgId: s.organisation.id, id: sid as never, breakdownId: id as never, unitId: x.unitId as never, ownerPositionId: x.owner as never, target: x.target, weight: x.weight, created: st, updated: st });
    if (!x.reading) continue;
    const holder = s.assignments.find((a) => a.positionId === x.owner)?.personId;
    const m = s.memberships.find((mm) => mm.personId === holder) ?? lead;
    const rs: Stamp = { at: at(x.reading.periodEnd.replace(/-\d\d$/, '-28')), byMembershipId: m.id };
    s.shareReadings.push({
      orgId: s.organisation.id, id: `sr-${sid}-${x.reading.periodEnd}` as never, shareId: sid as never, periodEnd: x.reading.periodEnd as ISODate, value: x.reading.value, savedOffline: false,
      verified: x.reading.verifiedBy ? { by: { at: at('2026-10-05'), byMembershipId: x.reading.verifiedBy as never } } : null, returned: null, created: rs, updated: rs,
    });
  }
}

export function addSampleTargets(s: Store): Store {
  const name = s.organisation.name;
  if (name.includes('Scale Test')) {
    const owner = s.kpis.find((k) => k.ownerPositionId === 'pos-scale-dh21');
    if (owner) breakdown(s, { kpiId: owner.id, parentUnitId: 'u-scale-d2', weightLabel: 'Planned outputs in the year', shares: [
      { unitId: 'u-scale-d2p1', owner: 'pos-scale-dh21', target: 78, weight: 50, reading: { periodEnd: '2026-09-30', value: 71, verifiedBy: 'm-scale-dir2' } },
      { unitId: 'u-scale-d2p2', owner: 'pos-scale-dh22', target: 82, weight: 30, reading: { periodEnd: '2026-09-30', value: 76 } },
      { unitId: 'u-scale-d2p3', owner: null, target: 80, weight: 20 },
    ] });
    // v0.25.0 (TG-9): one proposal of new work waiting for the Strategy office, from the second department's share.
    const b = owner && s.kpiBreakdowns.find((x) => x.kpiId === owner.id);
    const share = b && s.kpiShares.find((x) => x.breakdownId === b.id && x.ownerPositionId === 'pos-scale-dh22');
    const by = s.memberships.find((m) => m.personId === s.assignments.find((a) => a.positionId === 'pos-scale-dh22')?.personId);
    if (b && share && by) {
      const st: Stamp = { at: at('2026-10-12'), byMembershipId: by.id };
      s.activityProposals.push({
        orgId: s.organisation.id, id: 'prop-scale-1' as never, shareId: share.id, kpiId: b.kpiId, financialYear: b.financialYear,
        title: 'Run a quarterly output review clinic for the department', decisionLevel: 'procedures', quantityTarget: { value: 4, unit: 'clinics' },
        ownerPositionId: 'pos-scale-dh22' as never, evidence: 'Clinic attendance records and the actions log', reason: 'Outputs slip between the quarterly checks; there is no routine to catch them early.',
        sent: st, asSent: null, outcome: 'waiting', decided: null, returnReason: null, activityId: null, created: st, updated: st,
      });
    }
  }
  if (name.includes('Packaging')) {
    breakdown(s, { kpiId: 'k-mfg-K1.1.1', parentUnitId: 'u-mfg-plant1', weightLabel: 'Tonnes of material input a year', shares: [
      { unitId: 'u-mfg-prod', owner: 'pos-mfg-prm', target: 4.2, weight: 9000, reading: { periodEnd: '2026-09-30', value: 4.5, verifiedBy: 'm-mfg-pm' } },
      { unitId: 'u-mfg-quality', owner: 'pos-mfg-qm', target: 3, weight: 1000, reading: { periodEnd: '2026-09-30', value: 2.8, verifiedBy: 'm-mfg-pm' } },
    ] });
    // TG-6: one standing duty, within HR's 20% limit; the first objective gives up the weight.
    const cos = s.contractObjectives.filter((co) => co.contractId === 'pc-mfg-op');
    if (cos[0]) {
      cos[0].weightPct -= 10;
      s.contractObjectives.push({ ...structuredClone(cos[0]), id: 'co-mfg-op-duty' as never, sourceActivityId: null, standingDuty: { description: 'Shift handover report at the end of every shift' }, title: 'Submit the shift handover report at the end of every shift', quantityTarget: { value: 250, unit: 'reports' }, snapshot: cos[0].snapshot ? { ...cos[0].snapshot, title: 'Submit the shift handover report at the end of every shift', quantityTarget: { value: 250, unit: 'reports' } } : null, direction: 'higher_is_better', weightPct: 10, servesShareId: null });
    }
  }
  return s;
}
