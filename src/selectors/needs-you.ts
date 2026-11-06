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
import { escalated, formingPlan } from '../rules/formation';
import { canSubmitDepartment, CELLS, departments, departmentsHeadedBy, departmentState, entriesOf, filledCells, isLive, visionConfirmed } from '../rules/conception';
import { composition, isDecided } from '../rules/composition';
import { sentBy } from '../rules/onboarding';
import { goalsNeedingRecord } from '../rules/communication';
import type { FormingStage, StrategyEntry } from './nav';
import { baselineOwnerPosition, baselinesOf, baselineState, complianceOf, currentRound, inAudience, inputsOf, isLiveBaseline } from '../rules/consultation';
import { formatNumber } from './format';
import { currentBudgetVersion } from '../rules/structure';
import { en } from '../strings/en';
import type { FixTarget } from './integrity';
import type { HomeKind } from './home';
import { holderOf } from './node';

export type NeedsYouKind = 'deadline' | 'decision_action' | 'finding' | 'approval';
/** A Strategy sub-menu page (v0.17.0, C-4): "Needs you" opens the exact entry, stage and tab. */
export type StrategyLink = { kind: 'strategy'; entry: StrategyEntry; stage?: FormingStage; tab?: string };
/** Performance › Progress updates (v0.18.0): a tab, and on Mine the objective whose form opens. */
export type ProgressLink = { kind: 'progress'; tab: 'mine' | 'verify'; objectiveId?: string };
/** v0.20.0: Performance › Reviews, at one review or a tab. */
export type ReviewsLink = { kind: 'reviews'; reviewId?: string; tab?: 'mine' | 'team' | 'check' | 'round' };
export type NeedsYouLink = FixTarget | { kind: 'findings' } | { kind: 'communication'; goalId: string } | StrategyLink | ProgressLink | { kind: 'survey'; roundId: string } | ReviewsLink | { kind: 'targets'; breakdownId?: string; shareId?: string } | { kind: 'contracts'; contractId?: string; tab?: 'mine' | 'team' | 'check' | 'overview' } | null;
const at = (entry: StrategyEntry, stage?: FormingStage, tab?: string): StrategyLink => ({ kind: 'strategy', entry, ...(stage ? { stage } : {}), ...(tab ? { tab } : {}) });

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

  /* Onboarding (section 28): a plan sent by the Strategy office waits for the Executive's confirmation. */
  if (v.roles.includes('executive')) {
    for (const p of s.plans.filter((x) => x.status === 'draft')) {
      const sender = sentBy(s, p);
      if (sender && sender !== v.membershipId) {
        add({
          key: `approve:plan:${p.id}`, kind: 'approval', title: en.needsYou.confirmPlan(p.title), detail: en.needsYou.submittedBy(personName(sender)),
          due: null, severity: null, as: 'executive', link: at('forming', 'composition'),
        });
      }
    }
  }

  /* Contracts: issue drafts (supervisor), sign issued ones (employee and supervisor). */
  for (const c of s.contracts.filter((x) => x.financialYear === fy)) {
    const position = s.positions.find((p) => p.id === c.positionId);
    const supervises = mine(position?.reportsToPositionId);
    const person = s.people.find((p) => p.id === c.personId)?.fullName ?? null;
    if (c.status === 'draft' && supervises) {
      add({
        key: `gate:contract.issue:${c.id}`, kind: 'deadline',
        title: person ? en.needsYou.issueContract(person, position?.title ?? '') : en.needsYou.issueContractVacant(position?.title ?? ''),
        detail: en.needsYou.contractDraft, due: gateDueDate(s, 'contract.issue', fy), severity: null, as: 'supervisor', link: { kind: 'contracts', contractId: c.id },
      });
    }
    if (c.status === 'issued') {
      const due = gateDueDate(s, 'contract.sign', fy);
      if (c.personId === v.personId && !c.signedByEmployee) add({ key: `gate:contract.sign:self:${c.id}`, kind: 'deadline', title: en.needsYou.signContract, detail: null, due, severity: null, as: 'employee', link: { kind: 'contracts', contractId: c.id } });
      if (supervises && !c.signedBySupervisor && person) add({ key: `gate:contract.sign:sup:${c.id}`, kind: 'deadline', title: en.needsYou.signContractFor(person), detail: null, due, severity: null, as: 'supervisor', link: { kind: 'contracts', contractId: c.id } });
    }
  }

  /* Reviews: the employee submits a self-assessment; the supervisor completes the review. */
  for (const r of s.reviews.filter((x) => x.status !== 'completed')) {
    const c = s.contracts.find((x) => x.id === r.contractId);
    if (!c || c.financialYear !== fy) continue;
    const kind = en.needsYou.reviewKind[r.kind];
    if (c.personId === v.personId && r.status === 'open' && !r.selfAssessment?.submitted) {
      add({ key: `gate:review.submit_self:${r.id}`, kind: 'deadline', title: en.needsYou.submitSelf(kind), detail: null, due: gateDueDate(s, 'review.submit_self', fy), severity: null, as: 'employee', link: { kind: 'reviews', reviewId: r.id } });
    }
    const position = s.positions.find((p) => p.id === c.positionId);
    if (mine(position?.reportsToPositionId)) {
      const person = holderOf(s, c.positionId, now)?.person ?? s.people.find((p) => p.id === c.personId)?.fullName ?? '';
      add({
        key: `gate:review.complete:${r.id}`, kind: 'deadline', title: en.needsYou.completeReview(person, kind),
        detail: r.status === 'self_submitted' ? en.needsYou.selfSubmitted : en.needsYou.selfPending, due: gateDueDate(s, 'review.complete', fy), severity: null, as: 'supervisor', link: { kind: 'reviews', reviewId: r.id },
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
    add({ key: `formation:${d.id}`, kind: 'deadline', title: d.label, detail: plan.title, due: d.dueOn, severity: null, as: null, link: at('forming', 'overview') });
  }

  /* Formation (part 11a): the calendar preparer prepares and publishes the calendar. */
  for (const p of s.plans.filter((x) => x.entryDoor === 'formed' && x.status === 'draft')) {
    if (p.calendar?.preparerMembershipId === v.membershipId && !p.calendar.published) {
      add({ key: `formation:prepare:${p.id}`, kind: 'deadline', title: en.formation.needs.prepare(p.title), detail: null, due: p.calendar.visionTargetOn, severity: null, as: null, link: at('forming', 'overview', 'calendar') });
    }
  }
  /* Conception (part 11b), while the stage is open and the vision is not yet confirmed. */
  const forming = formingPlan(s);
  if (forming && forming.formation?.conception.status === 'open' && !visionConfirmed(s, forming.id)) {
    const count = (n: number, k: 'card' | 'aiCard') => `${formatNumber(n)} ${n === 1 ? en.setup.plural[k]![0] : en.setup.plural[k]![1]}`;
    const due = forming.calendar?.visionTargetOn ?? null;
    const C = en.conception.needs;
    // Department heads (F-2): one next step per department they answer for.
    for (const d of departmentsHeadedBy(s, v.positionIds as string[])) {
      const st = departmentState(s, forming.id, d.unitId);
      const blank = st.toCheck + st.waiting + st.consolidated === 0;
      if (st.toCheck > 0) add({ key: `conception:check:${d.unitId}`, kind: 'deadline', title: C.check(count(st.toCheck, 'aiCard'), d.name), detail: forming.title, due, severity: null, as: null, link: at('forming', 'conception', 'mine') });
      else if (blank && !st.interviewed && s.organisation.settings.aiEnabled) add({ key: `conception:interview:${d.unitId}`, kind: 'deadline', title: C.interview(d.name), detail: forming.title, due, severity: null, as: null, link: at('forming', 'conception', 'mine') });
      else if (!st.submitted && canSubmitDepartment(st)) add({ key: `conception:send:${d.unitId}`, kind: 'deadline', title: C.send(d.name), detail: forming.title, due, severity: null, as: null, link: at('forming', 'conception', 'mine') });
    }
    // The Strategy office: AI drafts on the organisation sheet or on a department sheet with no head, and accepted cards to bring together.
    if (v.roles.includes('strategy_office')) {
      const headless = new Set(departments(s).filter((d) => !d.headPositionId || !holderOf(s, d.headPositionId, now)?.person).map((d) => d.unitId));
      const drafts = entriesOf(s, forming.id).filter((e) => isLive(e) && e.draft.state === 'ai_draft' && (e.scope === 'organisation' || e.raisedByUnitIds.some((u) => headless.has(u)))).length;
      if (drafts) add({ key: `conception:curate:${forming.id}`, kind: 'deadline', title: C.curate(count(drafts, 'aiCard')), detail: forming.title, due, severity: null, as: 'strategy_office', link: at('forming', 'conception', 'board') });
      for (const d of departments(s)) {
        const st = departmentState(s, forming.id, d.unitId);
        if (st.submitted && st.waiting > 0) add({ key: `conception:consolidate:${d.unitId}`, kind: 'deadline', title: C.consolidate(d.name), detail: forming.title, due, severity: null, as: 'strategy_office', link: at('forming', 'conception', 'board') });
      }
    }
    // The Executive: once every section has an accepted card, the vision is theirs to write and confirm.
    if (v.roles.includes('executive') && filledCells(s, forming.id).length === CELLS.length) {
      add({ key: `approve:vision:${forming.id}`, kind: 'approval', title: C.vision(forming.title), detail: C.visionDetail, due, severity: null, as: 'executive', link: at('forming', 'conception', 'vision') });
    }
  }

  /* Consultation and Confirmation (part 11c). */
  if (forming) {
    const N = en.consultation.needs;
    const strategy = at('forming', 'consultation');
    const count = (n: number, k: string) => `${formatNumber(n)} ${n === 1 ? en.setup.plural[k]![0] : en.setup.plural[k]![1]}`;
    const started = (st: 'consultation' | 'confirmation') => (forming.formation?.[st].status ?? 'not_started') !== 'not_started';
    const round = currentRound(s, forming.id);
    const runsRound = v.roles.includes('strategy_office') || v.roles.includes('facilitator');
    // The round's audience: have your say while it is open, until you have sent something. Those running it are not asked.
    if (round?.status === 'open' && !runsRound && inAudience(s, round, v.positionIds as string[]) && !inputsOf(s, round.id).some((i) => i.created.byMembershipId === v.membershipId)) {
      add({ key: `consult:say:${round.id}`, kind: 'deadline', title: N.say(forming.title), detail: N.sayDetail, due: round.closesOn, severity: null, as: null, link: strategy });
    }
    if (round?.status === 'scheduled' && v.roles.includes('strategy_office') && forming.formation?.consultation.status === 'open') {
      add({ key: `consult:open:${round.id}`, kind: 'deadline', title: N.openRound, detail: forming.title, due: round.opensOn, severity: null, as: 'strategy_office', link: strategy });
    }
    if (started('consultation')) {
      const live = baselinesOf(s, forming.id).filter(isLiveBaseline);
      // Owners: the measures of the units they answer for, still awaiting them.
      const awaitingByUnit = new Map<string, number>();
      for (const b of live) {
        const pos = baselineOwnerPosition(s, b);
        if (baselineState(b) === 'awaiting_owner' && b.ownerUnitId && mine(pos)) awaitingByUnit.set(b.ownerUnitId, (awaitingByUnit.get(b.ownerUnitId) ?? 0) + 1);
      }
      for (const [u, n] of awaitingByUnit) {
        const name = s.units.find((x) => x.id === u)?.name ?? '';
        add({ key: `baseline:check:${u}`, kind: 'deadline', title: N.check(count(n, 'baseline'), name), detail: forming.title, due: null, severity: null, as: null, link: at('registers', undefined, 'baselines') });
      }
      if (v.roles.includes('strategy_office')) {
        const orphaned = live.filter((b) => baselineState(b) === 'awaiting_owner' && (() => { const pos = baselineOwnerPosition(s, b); return !pos || !holderOf(s, pos, now)?.person; })()).length;
        if (orphaned) add({ key: `baseline:office:${forming.id}`, kind: 'deadline', title: N.officeCheck(count(orphaned, 'aiBaseline')), detail: forming.title, due: null, severity: null, as: 'strategy_office', link: at('registers', undefined, 'baselines') });
        const toValidate = live.filter((b) => baselineState(b) === 'confirmed').length;
        if (toValidate) add({ key: `baseline:validate:${forming.id}`, kind: 'deadline', title: N.validate(count(toValidate, 'baseline')), detail: forming.title, due: null, severity: null, as: 'strategy_office', link: at('registers', undefined, 'baselines') });
      }
    }
    // The compliance officer reviews every item once Confirmation opens.
    if (started('confirmation') && v.roles.includes('compliance')) {
      const open = complianceOf(s, forming.id).filter((c) => c.outcome === null).length;
      if (open) add({ key: `compliance:review:${forming.id}`, kind: 'deadline', title: N.review(count(open, 'complianceItem')), detail: N.reviewDetail, due: forming.calendar?.planTargetOn ?? null, severity: null, as: null, link: at('registers', undefined, 'compliance') });
    }
  }

  /* Composition (part 11d, BUILD-BRIEF section 34). */
  if (forming && visionConfirmed(s, forming.id) && forming.status === 'draft') {
    const N = en.composition.needs;
    const strategy = at('forming', 'composition');
    const count = (n: number, k: string) => `${formatNumber(n)} ${n === 1 ? en.setup.plural[k]![0] : en.setup.plural[k]![1]}`;
    const rec = composition(s, forming.id);
    const open = forming.formation?.composition.status === 'open';
    // The Strategy office accepts or removes suggested themes.
    const themes = rec.themes.filter((t) => !isDecided(t.draft)).length;
    if (themes && v.roles.includes('strategy_office')) add({ key: `composition:themes:${forming.id}`, kind: 'deadline', title: N.themes(count(themes, 'theme')), detail: forming.title, due: null, severity: null, as: 'strategy_office', link: strategy });
    if (open && v.roles.includes('executive')) {
      const items = [...rec.goals, ...rec.objectives, ...rec.kpis].filter((x) => !isDecided(x.draft)).length;
      if (items) add({ key: `composition:confirm:${forming.id}`, kind: 'approval', title: N.confirmItems(count(items, 'item')), detail: forming.title, due: null, severity: null, as: 'executive', link: strategy });
    }
    // Owners of confirmed objectives with no KPI yet propose them (D11d-5).
    if (open) {
      const bare = rec.objectives.filter((o) => isDecided(o.draft) && mine(o.ownerPositionId) && !rec.kpis.some((k) => k.objectiveId === o.id)).length;
      if (bare) add({ key: `composition:kpis:${forming.id}`, kind: 'deadline', title: N.addKpis(count(bare, 'objective')), detail: forming.title, due: null, severity: null, as: null, link: strategy });
    }
  }

  /* Overdue formation deadlines reach the owner's supervisor after the organisation's escalation days. */
  for (const e of escalated(s, now)) {
    if (!mine(e.supervisorPositionId)) continue;
    const owner = s.positions.find((x) => x.id === e.ownerPositionId)?.title ?? '';
    add({ key: `formation:escalated:${e.deadlineId}:${e.ownerPositionId}`, kind: 'deadline', title: en.formation.needs.escalated(e.label, owner), detail: null, due: e.dueOn, severity: null, as: 'supervisor', link: at('forming', 'overview') });
  }

  /* Part 11e (D16-10): confirmed goals with no communication record, for the goal's owner and the Strategy office. Undated. */
  for (const g of goalsNeedingRecord(s)) {
    const owns = mine(g.ownerPositionId);
    const office = v.roles.includes('strategy_office');
    if (!owns && !office) continue;
    const plan = s.plans.find((p) => p.id === g.planId);
    add({
      key: `communication:write:${g.id}`, kind: 'deadline', title: en.communication.needs.write(g.code, g.title), detail: plan?.title ?? null,
      due: null, severity: null, as: owns ? null : 'strategy_office', link: { kind: 'communication', goalId: g.id },
    });
  }

  /* Decision-log actions from held sessions, owned by the person's positions. */
  for (const w of s.workshops.filter((x) => x.status === 'held')) {
    w.decisionLog.forEach((entry, i) =>
      entry.actions.forEach((a, j) => {
        if (!mine(a.ownerPositionId)) return;
        add({ key: `action:${w.id}:${i}:${j}`, kind: 'decision_action', title: a.text, detail: entry.decision, due: a.dueOn, severity: null, as: null, link: at('forming', 'overview', 'sessions') });
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
