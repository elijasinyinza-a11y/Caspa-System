/**
 * Printed contract and printed assessment (v0.23.0; Scoring Policy and Personal Attributes Specification v0.1, section
 * on printouts; decisions of 6 November 2026). Built from the same records and rules as the screens, for those who may
 * already see the contract or review. The record in CASPA™ stays the authoritative version; paper is a copy.
 */
import type { ISODate } from '../../contract/caspa-data-contract';
import { schemeFor, rateContract, reviewPeriodEnd } from '../../rules/rating';
import { holdersOf, reviewerPositionOf, supervisorPositionOf } from '../../rules/review';
import { en } from '../../strings/en';
import type { ContractsAccess } from './contracts';
import type { ReviewsAccess, ReviewView } from './reviews';
import type { Store } from './store';
import type { Viewer } from './viewer';

interface Ctx { s: Store; viewer: Viewer; now: ISODate; contracts: ContractsAccess; reviews: ReviewsAccess }

export interface PrintParty { name: string; position: string }
export interface PrintHeader {
  organisation: string; financialYear: number; startMonth: number; periodStart: ISODate; periodEnd: ISODate; reference: string; version: number;
  employee: PrintParty & { number: string | null; unit: string; appointed: ISODate | null }; supervisor: PrintParty; reviewer: PrintParty | null;
  methodText: string; bands: { score: number; label: string; min: number | null }[]; method: 'bands' | 'weighted_points';
  targetsPct: number; attributesPct: number;
  printedOn: ISODate; timeZone: string;
}
export interface PrintContract extends PrintHeader {
  objectives: { title: string; source: string; level: string | null; chain: string; mov: string | null; fullYear: number | null; unit: string; periodTargets: { label: string; value: number | null }[]; weight: number }[];
  attributes: { name: string; measures: string }[];
  signedByEmployee: string | null; signedBySupervisor: string | null; signedVersionOn: ISODate | null; employeeNote: string | null; status: string;
}
export interface PrintReview extends PrintHeader {
  review: ReviewView; kindLabel: string; reviewEnd: ISODate; final: boolean; frozenOn: ISODate | null;
}

export interface PrintoutsAccess {
  contract(id: string): PrintContract | null;
  review(id: string): PrintReview | null;
}

export function createPrintoutsAccess(c: Ctx): PrintoutsAccess {
  const { s, now } = c;
  const person = (id: string | null | undefined) => s.people.find((p) => p.id === id)?.fullName ?? '';
  const posTitle = (id: string | null | undefined) => s.positions.find((p) => p.id === id)?.title ?? '';
  const party = (pos: string | null): PrintParty => ({ name: person(holdersOf(s, pos, now)[0]), position: posTitle(pos) });
  const levelName = (l: string | null | undefined) => (l ? (en.sixP as Record<string, string>)[l] ?? l : null);
  const day = (at: string | undefined | null) => (at ? (at.slice(0, 10) as ISODate) : null);

  const header = (ctId: string): PrintHeader | null => {
    const ct = s.contracts.find((x) => x.id === ctId);
    if (!ct) return null;
    const sc = schemeFor(s, ct);
    const start = s.organisation.financialYearStartMonth;
    const pad = (n: number) => String(n).padStart(2, '0');
    const periodStart = `${ct.financialYear}-${pad(start)}-01` as ISODate;
    const periodEnd = reviewPeriodEnd(s, { kind: 'annual', periodEnd: null } as never, ct);
    const pos = s.positions.find((p) => p.id === ct.positionId);
    const assign = s.assignments.filter((a) => a.positionId === ct.positionId && a.personId === ct.personId).sort((a, b) => (a.from < b.from ? 1 : -1))[0];
    const membership = s.memberships.find((m) => m.personId === ct.personId);
    const on = sc.competencySection.enabled && (sc.competencySection.attributes?.length ?? 0) > 0;
    const w = on ? sc.competencySection.weightPct : 0;
    const rv = reviewerPositionOf(s, ct, now);
    return {
      organisation: s.organisation.name, financialYear: ct.financialYear, startMonth: start, periodStart, periodEnd, reference: ct.id, version: ct.version ?? 1,
      employee: { name: person(ct.personId), position: pos?.title ?? '', number: membership?.employeeNumber ?? null, unit: s.units.find((u) => u.id === pos?.unitId)?.name ?? '', appointed: assign?.from ?? null },
      supervisor: party(supervisorPositionOf(s, ct)), reviewer: rv ? party(rv) : null,
      methodText: (sc.scoringMethod ?? 'bands') === 'weighted_points' ? en.reviews.policy.weightedPoints(sc.achievementCap ?? null) : en.reviews.policy.bands(sc.achievementCap ?? null),
      bands: [...sc.bands].sort((a, b) => b.score - a.score).map((b) => ({ score: b.score, label: b.label, min: b.minAchievement })), method: sc.scoringMethod ?? 'bands',
      targetsPct: 100 - w, attributesPct: w, printedOn: now, timeZone: s.organisation.timeZone,
    };
  };

  return {
    contract(id) {
      const v = c.contracts.contract(id);
      const ct = s.contracts.find((x) => x.id === id);
      const h = header(id);
      if (!v || !ct || !h) return null;
      const sc = schemeFor(s, ct);
      return {
        ...h,
        objectives: v.objectives.map((o) => {
          const co = s.contractObjectives.find((x) => x.id === o.id)!;
          const a = s.activities.find((x) => x.id === co.sourceActivityId);
          const k = a && s.kpis.find((x) => x.id === a.kpiId);
          const ob = k && s.objectives.find((x) => x.id === k.objectiveId);
          const g = ob && s.goals.find((x) => x.id === ob.goalId);
          return {
            title: o.title, source: a ? `${a.code} ${a.title}` : o.sourceText, level: levelName(a?.decisionLevel), chain: [k && `${k.code} ${k.name}`, ob && `${ob.code} ${ob.title}`, g && `${g.code} ${g.title}`].filter(Boolean).join(' › '),
            mov: o.meansOfVerification, fullYear: o.quantity, unit: o.unit, periodTargets: o.periodTargets.map((p) => ({ label: p.label, value: p.value })), weight: o.weight,
          };
        }),
        attributes: sc.competencySection.enabled ? (sc.competencySection.attributes ?? []).map((x) => ({ name: x.name, measures: x.measures })) : [],
        signedByEmployee: ct.signedByEmployee?.at ?? null, signedBySupervisor: ct.signedBySupervisor?.at ?? null,
        signedVersionOn: day(ct.signedByEmployee && ct.signedBySupervisor ? (ct.signedByEmployee.at > ct.signedBySupervisor.at ? ct.signedByEmployee.at : ct.signedBySupervisor.at) : null),
        employeeNote: ct.employeeNote ?? null, status: v.step,
      };
    },
    review(id) {
      const r = c.reviews.review(id);
      const rec = s.reviews.find((x) => x.id === id);
      const ct = rec && s.contracts.find((x) => x.id === rec.contractId);
      const h = rec && header(rec.contractId);
      if (!r || !rec || !ct || !h) return null;
      void rateContract;
      return { ...h, review: r, kindLabel: r.kind, reviewEnd: reviewPeriodEnd(s, rec, ct), final: !!rec.finalResult, frozenOn: day(rec.finalResult?.frozenAt) };
    },
  };
}
