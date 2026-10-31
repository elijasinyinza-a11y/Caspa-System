/**
 * Vacancies and handover (slice 9; Vacancy and Handover Specification v0.1, decisions H1 to H9). Pure selectors over
 * stored records: what each position holds, and the vacant and acting positions in a fixed order of what stops
 * soonest (H1). Nothing is stored and no score is computed. Permissions are applied by the data-access layer.
 */
import type { Finding, ISODate } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import { computeFindings } from '../rules/integrity';
import { accountablePositionOfUnit, currentBudgetVersion } from '../rules/structure';
import { gateDueDate } from './needs-you';

export type HoldingState = 'vacant' | 'acting' | 'held';
export type OwnedType = 'Goal' | 'Objective' | 'Kpi' | 'Activity';

export interface Holdings {
  positionId: string;
  title: string;
  unitId: string;
  unitPath: string[];
  state: HoldingState;
  holder: { personId: string; name: string; acting: boolean; since: ISODate } | null;
  /** The day after the last assignment ended; null when the position was never held, or is held. */
  vacantSince: ISODate | null;
  neverHeld: boolean;
  owned: { type: OwnedType; id: string; code: string; title: string; mustFix: boolean }[];
  /** Direct budget holder only: the holder unit's accountable position, or the funded activity's owner (section 2). */
  lines: { id: string; description: string; amountMinor: number; currency: string; funds: { id: string; code: string; title: string } | null; mustFix: boolean }[];
  answersFor: { unitId: string; name: string }[];
  reports: { positionId: string; title: string; holder: string | null }[];
  contracts: {
    contractId: string; positionId: string; positionTitle: string; personName: string; status: string;
    openReview: boolean; unverified: number; issueDue: ISODate | null; reviewDue: ISODate | null;
    /** Waiting on a supervisor's action: an open review, a contract to issue, or progress to verify. */
    needsSupervisor: boolean;
  }[];
  corrective: { deficiencies: number; unaddressed: number };
  checks: { finding: Finding; must: boolean }[];
  dated: { kind: 'formation_deadline' | 'decision_action'; label: string; due: ISODate }[];
}

const dayAfter = (d: ISODate) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) as ISODate;

/** One pass over the store, shared by every position's holdings (D7-14: quick at thousands of positions). */
export function holdingsIndex(s: Store, financialYear: number, now: ISODate) {
  const findings = computeFindings(s, { financialYear });
  const byRoute = new Map<string, Finding[]>();
  for (const f of findings) for (const p of f.routeToPositionIds) (byRoute.get(p) ?? byRoute.set(p, []).get(p)!).push(f);
  const blockingSubjects = new Set(findings.filter((f) => f.blocksAt.length > 0).map((f) => f.subject.id));
  const current = new Map<string, Store['assignments'][number]>();
  const lastEnded = new Map<string, ISODate>();
  for (const a of s.assignments) {
    if (a.from <= now && (a.to === null || a.to >= now)) current.set(a.positionId, a);
    else if (a.to && a.to < now && (!lastEnded.get(a.positionId) || a.to > lastEnded.get(a.positionId)!)) lastEnded.set(a.positionId, a.to);
  }
  const everHeld = new Set(s.assignments.filter((a) => a.from <= now).map((a) => a.positionId as string));
  const person = new Map(s.people.map((p) => [p.id as string, p.fullName]));
  const unit = new Map(s.units.map((u) => [u.id as string, u]));
  const position = new Map(s.positions.map((p) => [p.id as string, p]));
  const accountable = new Map(s.units.map((u) => [u.id as string, accountablePositionOfUnit(s, u.id)]));
  const activePlans = new Set(s.plans.filter((p) => p.status === 'active').map((p) => p.id as string));
  const goals = s.goals.filter((g) => activePlans.has(g.planId));
  const goalIds = new Set(goals.map((g) => g.id as string));
  const objectives = s.objectives.filter((o) => goalIds.has(o.goalId));
  const objectiveIds = new Set(objectives.map((o) => o.id as string));
  const kpis = s.kpis.filter((k) => objectiveIds.has(k.objectiveId));
  const kpiIds = new Set(kpis.map((k) => k.id as string));
  const activities = s.activities.filter((a) => kpiIds.has(a.kpiId) && a.financialYear === financialYear && a.status !== 'archived');
  const activity = new Map(s.activities.map((a) => [a.id as string, a]));
  const version = currentBudgetVersion(s, financialYear);
  const lines = version ? s.budgetLines.filter((l) => l.versionId === version.id) : [];
  const reviewDue = gateDueDate(s, 'review.complete', financialYear);
  const issueDue = gateDueDate(s, 'contract.issue', financialYear);
  return { findings, byRoute, blockingSubjects, current, lastEnded, everHeld, person, unit, position, accountable, goals, objectives, kpis, activities, activity, lines, reviewDue, issueDue };
}
export type HoldingsIndex = ReturnType<typeof holdingsIndex>;

export function positionHoldings(s: Store, ix: HoldingsIndex, positionId: string, financialYear: number): Holdings | null {
  const p = ix.position.get(positionId);
  if (!p) return null;
  const path: string[] = [];
  for (let u = ix.unit.get(p.unitId), guard = 0; u && guard < 100; u = u.parentId ? ix.unit.get(u.parentId) : undefined, guard++) path.unshift(u.name);
  const a = ix.current.get(positionId);
  const owned: Holdings['owned'] = [
    ...ix.goals.filter((g) => g.ownerPositionId === positionId).map((g) => ({ type: 'Goal' as const, id: g.id as string, code: g.code, title: g.title })),
    ...ix.objectives.filter((o) => o.ownerPositionId === positionId).map((o) => ({ type: 'Objective' as const, id: o.id as string, code: o.code, title: o.title })),
    ...ix.kpis.filter((k) => k.ownerPositionId === positionId).map((k) => ({ type: 'Kpi' as const, id: k.id as string, code: k.code, title: k.name })),
    ...ix.activities.filter((x) => x.ownerPositionId === positionId).map((x) => ({ type: 'Activity' as const, id: x.id as string, code: x.code, title: x.title })),
  ].map((o) => ({ ...o, mustFix: ix.blockingSubjects.has(o.id) }));
  const lines = ix.lines
    .filter((l) => ix.accountable.get(l.holderUnitId) === positionId || (l.activityId && ix.activity.get(l.activityId)?.ownerPositionId === positionId))
    .map((l) => {
      const act = l.activityId ? ix.activity.get(l.activityId) : undefined;
      return { id: l.id as string, description: l.description, amountMinor: l.amount.amountMinor, currency: l.amount.currency, funds: act ? { id: act.id as string, code: act.code, title: act.title } : null, mustFix: ix.blockingSubjects.has(l.id) };
    });
  const contracts = s.contracts
    .filter((c) => c.financialYear === financialYear && ix.position.get(c.positionId)?.reportsToPositionId === positionId)
    .map((c) => {
      const openReview = s.reviews.some((r) => r.contractId === c.id && r.status === 'open');
      const unverified = s.progressUpdates.filter((u) => !u.verified && s.contractObjectives.some((o) => o.id === u.contractObjectiveId && o.contractId === c.id)).length;
      return {
        contractId: c.id as string, positionId: c.positionId as string, positionTitle: ix.position.get(c.positionId)?.title ?? '', personName: ix.person.get(c.personId) ?? '',
        status: c.status, openReview, unverified, issueDue: c.status === 'draft' ? ix.issueDue : null, reviewDue: openReview ? ix.reviewDue : null,
        needsSupervisor: openReview || c.status === 'draft' || unverified > 0,
      };
    });
  const ownedObjectives = new Set(ix.objectives.filter((o) => o.ownerPositionId === positionId).map((o) => o.id as string));
  const defs = s.deficiencies.filter((d) => ownedObjectives.has(d.objectiveId));
  const dated: Holdings['dated'] = [
    ...s.formationDeadlines.filter((d) => !d.completed && d.ownerPositionIds.includes(positionId as never)).map((d) => ({ kind: 'formation_deadline' as const, label: d.label, due: d.dueOn })),
    ...s.workshops.flatMap((w) => w.decisionLog.flatMap((l) => l.actions.filter((x) => x.ownerPositionId === positionId).map((x) => ({ kind: 'decision_action' as const, label: x.text, due: x.dueOn })))),
  ].sort((x, y) => (x.due < y.due ? -1 : 1));
  const ended = ix.lastEnded.get(positionId);
  return {
    positionId, title: p.title, unitId: p.unitId, unitPath: path,
    state: !a ? 'vacant' : a.kind === 'acting' ? 'acting' : 'held',
    holder: a ? { personId: a.personId, name: ix.person.get(a.personId) ?? '', acting: a.kind === 'acting', since: a.from } : null,
    vacantSince: !a && ended ? dayAfter(ended) : null,
    neverHeld: !a && !ix.everHeld.has(positionId),
    owned, lines,
    answersFor: s.units.filter((u) => ix.accountable.get(u.id) === positionId).map((u) => ({ unitId: u.id as string, name: u.name })),
    reports: s.positions.filter((x) => x.reportsToPositionId === positionId).map((x) => {
      const h = ix.current.get(x.id);
      return { positionId: x.id as string, title: x.title, holder: h ? ix.person.get(h.personId) ?? null : null };
    }),
    contracts,
    corrective: { deficiencies: defs.length, unaddressed: defs.filter((d) => d.correctiveActivityIds.length === 0).length },
    checks: (ix.byRoute.get(positionId) ?? []).map((f) => ({ finding: f, must: f.blocksAt.length > 0 })),
    dated,
  };
}

/** H1: what stops soonest first. Contracts that need a supervisor, then budget lines, then must-fix records, then the rest. */
export function rank(h: Holdings): (number | string)[] {
  const mustFix = h.owned.some((o) => o.mustFix) || h.lines.some((l) => l.mustFix) || h.checks.some((c) => c.must);
  return [
    h.state === 'vacant' ? 0 : 1,
    h.contracts.some((c) => c.needsSupervisor) ? 0 : 1,
    h.lines.length ? 0 : 1,
    mustFix ? 0 : 1,
    -(h.owned.length + h.lines.length + h.contracts.length),
    h.title,
  ];
}
const compare = (a: (number | string)[], b: (number | string)[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return 0;
};

/** Every vacant and acting position (H3: not those whose holder leaves soon), vacant first, in H1 order. */
export function vacancyView(s: Store, ix: HoldingsIndex, financialYear: number, positionIds?: Set<string>): Holdings[] {
  const out: Holdings[] = [];
  for (const p of s.positions) {
    if (positionIds && !positionIds.has(p.id)) continue;
    const a = ix.current.get(p.id);
    if (a && a.kind !== 'acting') continue;
    out.push(positionHoldings(s, ix, p.id, financialYear)!);
  }
  return out.sort((x, y) => compare(rank(x), rank(y)));
}


