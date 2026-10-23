/**
 * The "Needs you" queue (Build Brief, screen 4): deadlines, decision-log actions, findings routed to the person's
 * positions and approvals waiting for them, merged across all their roles, soonest first.
 * Pure: computed from stored records on every call; nothing is stored. Permissions come in from the data-access layer.
 */
import type { Finding, GateCode, ISODate } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';
import type { Viewer } from '../data/access/viewer';
import { blockersAt, computeFindings } from '../rules/integrity';
import { rateContract } from '../rules/rating';
import { currentBudgetVersion } from '../rules/structure';
import { en } from '../strings/en';
import type { FixTarget } from './integrity';
import type { HomeKind } from './home';
import { holderOf } from './node';

export type NeedsYouKind = 'deadline' | 'decision_action' | 'finding' | 'approval';
export type NeedsYouLink = FixTarget | { kind: 'findings' } | null;

export interface NeedsYouItem {
  key: string;
  kind: NeedsYouKind;
  title: string;
  detail: string | null;
  due: ISODate | null;
  /** Days past due at "now"; 0 or less is not overdue. Null when there is no due date. */
  daysOverdue: number | null;
  severity: 'blocking' | 'advisory' | null;
  /** Which of the person's roles brings the item, if one does (findings come by position). */
  as: HomeKind | null;
  link: NeedsYouLink;
}

export interface NeedsYouInput {
  viewer: Viewer;
  financialYear: number;
  now: ISODate;
  /** Findings this viewer is shown that are routed to their positions, with their fix link. */
  routedFindings: { finding: Finding; fix: FixTarget | null; acknowledged: boolean }[];
  canSeeRating: (contractId: string) => boolean;
  canView: (subject: { type: string; id: string }) => boolean;
}

const DAY = 86_400_000;
const days = (a: ISODate, b: ISODate) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY;

/** The earliest due date this year's cycles set for a gate. Gates themselves never check dates. */
export const gateDueDate = (s: Store, gate: GateCode, fy: number): ISODate | null =>
  s.cycles
    .filter((c) => c.financialYear === fy && c.status !== 'closed')
    .map((c) => c.gateDueDates[gate])
    .filter((d): d is ISODate => !!d)
    .sort()[0] ?? null;

const KIND_ORDER: NeedsYouKind[] = ['approval', 'deadline', 'finding', 'decision_action'];

/** Soonest first: dated items by date (the most overdue first), then undated ones. Ties by kind, then title. */
export const sortQueue = (items: NeedsYouItem[]): NeedsYouItem[] =>
  [...items].sort((a, b) => {
    if (a.due !== b.due) {
      if (a.due === null) return 1;
      if (b.due === null) return -1;
      return a.due < b.due ? -1 : 1;
    }
    const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    return k !== 0 ? k : a.title.localeCompare(b.title, 'en-GB');
  });

export function needsYou(s: Store, input: NeedsYouInput): NeedsYouItem[] {
  const { viewer: v, financialYear: fy, now } = input;
  const mine = (pid: string | null | undefined) => !!pid && (v.positionIds as string[]).includes(pid);
  const items: NeedsYouItem[] = [];
  const add = (i: Omit<NeedsYouItem, 'daysOverdue'>) => items.push({ ...i, daysOverdue: i.due ? days(i.due, now) : null });
  const personName = (membershipId: string) => {
    const m = s.memberships.find((x) => x.id === membershipId);
    return s.people.find((p) => p.id === m?.personId)?.fullName ?? '';
  };

  /* Budget: consolidated submission (Finance) and approval (Executive; Finance too once submitted, never the submitter). */
  const version = currentBudgetVersion(s, fy);
  if (version) {
    const findings = computeFindings(s, { financialYear: fy });
    const plan: FixTarget = { kind: 'workspace', w: 'plan' };
    if (version.status === 'draft' && v.roles.includes('finance')) {
      const due = gateDueDate(s, 'budget.submit_consolidated', fy);
      add({
        key: `gate:budget.submit_consolidated:${version.id}`, kind: 'deadline', title: en.needsYou.submitConsolidated,
        detail: en.needsYou.blockedBy(blockersAt(findings, 'budget.submit_consolidated').length), due, severity: null, as: 'finance', link: plan,
      });
    }
    const approveDue = gateDueDate(s, 'budget.approve', fy);
    if (version.status === 'draft' && v.roles.includes('executive') && approveDue) {
      add({ key: `gate:budget.approve:${version.id}`, kind: 'deadline', title: en.needsYou.approveBudget, detail: en.needsYou.awaitingSubmission, due: approveDue, severity: null, as: 'executive', link: plan });
    }
    if (version.status === 'submitted' && (v.roles.includes('executive') || v.roles.includes('finance'))) {
      const submitted = s.gateEvents
        .filter((g) => g.gate === 'budget.submit_consolidated' && g.outcome === 'passed' && g.subject.id === version.id)
        .sort((a, b) => (a.attempted.at < b.attempted.at ? -1 : 1))
        .pop();
      if (!submitted || submitted.attempted.byMembershipId !== v.membershipId) {
        add({
          key: `approve:budget:${version.id}`, kind: 'approval', title: en.needsYou.approveBudget,
          detail: submitted ? en.needsYou.submittedBy(personName(submitted.attempted.byMembershipId)) : null, due: approveDue, severity: null,
          as: v.roles.includes('executive') ? 'executive' : 'finance', link: plan,
        });
      }
    }
  }

  /* Contracts: issue drafts (supervisor), sign issued ones (employee and supervisor). */
  for (const c of s.contracts.filter((x) => x.financialYear === fy)) {
    const position = s.positions.find((p) => p.id === c.positionId);
    const supervises = mine(position?.reportsToPositionId);
    const person = s.people.find((p) => p.id === c.personId)?.fullName ?? null;
    const performance: FixTarget = { kind: 'workspace', w: 'performance' };
    if (c.status === 'draft' && supervises) {
      add({
        key: `gate:contract.issue:${c.id}`, kind: 'deadline',
        title: person ? en.needsYou.issueContract(person, position?.title ?? '') : en.needsYou.issueContractVacant(position?.title ?? ''),
        detail: en.needsYou.contractDraft, due: gateDueDate(s, 'contract.issue', fy), severity: null, as: 'supervisor', link: performance,
      });
    }
    if (c.status === 'issued') {
      const due = gateDueDate(s, 'contract.sign', fy);
      if (c.personId === v.personId && !c.signedByEmployee) add({ key: `gate:contract.sign:self:${c.id}`, kind: 'deadline', title: en.needsYou.signContract, detail: null, due, severity: null, as: 'employee', link: performance });
      if (supervises && !c.signedBySupervisor && person) add({ key: `gate:contract.sign:sup:${c.id}`, kind: 'deadline', title: en.needsYou.signContractFor(person), detail: null, due, severity: null, as: 'supervisor', link: performance });
    }
  }

  /* Reviews: the employee submits a self-assessment; the supervisor completes the review. */
  for (const r of s.reviews.filter((x) => x.status !== 'completed')) {
    const c = s.contracts.find((x) => x.id === r.contractId);
    if (!c || c.financialYear !== fy) continue;
    const kind = en.needsYou.reviewKind[r.kind];
    const performance: FixTarget = { kind: 'workspace', w: 'performance' };
    if (c.personId === v.personId && r.status === 'open' && !r.selfAssessment?.submitted) {
      add({ key: `gate:review.submit_self:${r.id}`, kind: 'deadline', title: en.needsYou.submitSelf(kind), detail: null, due: gateDueDate(s, 'review.submit_self', fy), severity: null, as: 'employee', link: performance });
    }
    const position = s.positions.find((p) => p.id === c.positionId);
    if (mine(position?.reportsToPositionId)) {
      const person = holderOf(s, c.positionId, now)?.person ?? s.people.find((p) => p.id === c.personId)?.fullName ?? '';
      add({
        key: `gate:review.complete:${r.id}`, kind: 'deadline', title: en.needsYou.completeReview(person, kind),
        detail: r.status === 'self_submitted' ? en.needsYou.selfSubmitted : en.needsYou.selfPending, due: gateDueDate(s, 'review.complete', fy), severity: null, as: 'supervisor', link: performance,
      });
    }
  }

  /* Appraisal round: HR closes it. */
  if (v.roles.includes('hr')) {
    const due = gateDueDate(s, 'appraisal.close', fy);
    const open = s.cycles.find((c) => c.kind === 'appraisal' && c.financialYear === fy && c.status !== 'closed');
    if (open && due) add({ key: `gate:appraisal.close:${open.id}`, kind: 'deadline', title: en.needsYou.closeAppraisal, detail: null, due, severity: null, as: 'hr', link: { kind: 'workspace', w: 'performance' } });
  }

  /* Formation deadlines, once the calendar is published. */
  for (const d of s.formationDeadlines) {
    const plan = s.plans.find((p) => p.id === d.planId);
    if (d.completed || !plan?.calendar?.published || !d.ownerPositionIds.some(mine)) continue;
    if (!input.canView({ type: 'FormationDeadline', id: d.id })) continue;
    add({ key: `formation:${d.id}`, kind: 'deadline', title: d.label, detail: plan.title, due: d.dueOn, severity: null, as: null, link: { kind: 'workspace', w: 'strategy' } });
  }

  /* Decision-log actions from held sessions, owned by the person's positions. */
  for (const w of s.workshops.filter((x) => x.status === 'held')) {
    w.decisionLog.forEach((entry, i) =>
      entry.actions.forEach((a, j) => {
        if (!mine(a.ownerPositionId)) return;
        add({ key: `action:${w.id}:${i}:${j}`, kind: 'decision_action', title: a.text, detail: entry.decision, due: a.dueOn, severity: null, as: null, link: { kind: 'workspace', w: 'strategy' } });
      }),
    );
  }

  /* Findings routed to the person's positions. A blocking finding takes the due date of the earliest step it blocks. */
  for (const f of input.routedFindings) {
    if (f.acknowledged) continue;
    const blocking = f.finding.blocksAt.length > 0;
    const due = blocking ? f.finding.blocksAt.map((g) => gateDueDate(s, g, fy)).filter((d): d is ISODate => !!d).sort()[0] ?? null : null;
    add({
      key: `finding:${f.finding.key}`, kind: 'finding', title: f.finding.message,
      detail: blocking ? en.needsYou.findingBlocks(en.list(f.finding.blocksAt.map((g) => en.gates[g]))) : null,
      due, severity: blocking ? 'blocking' : 'advisory', as: null, link: f.fix ?? { kind: 'findings' },
    });
  }

  /* Rating flags: advisory, to the next-level reviewer only, and only for contracts whose ratings they may see. */
  for (const c of s.contracts.filter((x) => x.financialYear === fy)) {
    if (!input.canSeeRating(c.id)) continue;
    const rating = rateContract(s, c.id, { now });
    const person = s.people.find((p) => p.id === c.personId)?.fullName ?? '';
    for (const flag of rating?.flags ?? []) {
      if (!flag.routeToPositionIds.some(mine)) continue;
      const co = s.contractObjectives.find((x) => x.id === flag.contractObjectiveId);
      add({
        key: `rating:${flag.kind}:${flag.contractObjectiveId}`, kind: 'finding', title: en.needsYou.ratingFlag[flag.kind](person, co?.snapshot?.title ?? co?.title ?? ''),
        detail: en.needsYou.ratingFlagDetail, due: null, severity: 'advisory', as: null, link: null,
      });
    }
  }

  return sortQueue(items);
}
