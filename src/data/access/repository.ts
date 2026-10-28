/**
 * The only way screens read data. The in-memory implementation here is replaced by the real
 * backend later without changes to the screens. Permissions are enforced here, not in the UI.
 */
import type { Acknowledgement, AuditEntry, BoardApproval, Finding, GateCode, GateEvent, ISODate, ISODateTime } from '../../contract/caspa-data-contract';
import { approveError, checkGate, gateEventsFor, gateRecord, returnError, submitError, submitterOf, type BudgetStepError } from '../../rules/gate';
import { currentBudgetVersion } from '../../rules/structure';
import { budgetView, linkOptions, type BudgetView, type LinkOption } from '../../selectors/budget';
import { gateDueDate } from '../../selectors/needs-you';
import { acknowledgementState } from '../../rules/acknowledgement';
import { dateInZone } from '../../selectors/format';
import { computeFindings, RULES } from '../../rules/integrity';
import { fixTarget, type FixTarget } from '../../selectors/integrity';
import {
  activePlanTitle, financeSummary, goalHealth, homesFor, hrSummary, myContracts, team,
  type FinanceSummary, type GoalHealth, type HomeKind, type HrSummary, type MyContract, type TeamMember,
} from '../../selectors/home';
import { needsYou, type NeedsYouItem } from '../../selectors/needs-you';
import { expectedToDate } from '../../rules/kpi-progress';
import { cascadeTree, nodeView, type CascadeTree, type NodeKind, type NodeView } from '../../selectors/node';
import { workspacesFor } from '../../selectors/nav';
import type { WorkspaceKey } from '../../strings/en';
import { can, canAcknowledge, canSeeRating, canTakeBudgetStep } from './permissions';
import type { Store } from './store';
import { financialYearOf, resolveViewer, type Viewer } from './viewer';

export interface FindingView {
  finding: Finding;
  routedTo: string[]; // position titles
  /** True when the finding is routed to one of this viewer's positions. */
  routedToMe: boolean;
  /** Where to fix it, already limited to places this viewer can open. Null if nowhere they can reach. */
  fix: FixTarget | null;
  /** Acknowledgement state (advisory flags only). Lapsed means the record changed after it. */
  ack:
    | { state: 'open' }
    | { state: 'acknowledged' | 'lapsed'; reason: string; by: string; on: ISODate };
  /** Whether this viewer may acknowledge it now (contract v1.3). Never true for a hard block. */
  canAcknowledge: boolean;
}

export type AcknowledgeResult = { ok: true } | { ok: false; error: 'not_found' | 'blocking' | 'not_allowed' | 'reason_required' | 'already_acknowledged' };


/** One step in the budget's history, from gate records and the audit trail. Counts only; no amounts. */
export interface BudgetHistoryItem {
  key: string;
  kind: 'submitted' | 'submit_blocked' | 'approved' | 'approve_blocked' | 'returned';
  by: string;
  on: ISODate;
  blocking: number;
  advisory: { acknowledged: number; open: number };
  reason: string | null;
  board: BoardApproval | null;
}

/** The budget screen (Build Brief, screen 5), already restricted to this viewer. */
export interface BudgetPage {
  financialYear: number;
  budget: BudgetView;
  /** The gate the version faces next, checked now. Null once approved. */
  next: {
    gate: GateCode;
    due: ISODate | null;
    blocking: FindingView[];
    /** Hard blocks on records this viewer may not see: counted, never described. */
    hiddenBlocking: number;
    advisory: FindingView[];
  } | null;
  can: { submit: boolean; approve: boolean; return: boolean };
  /** Why this viewer cannot take the next step, when they hold a role that otherwise could. */
  ownSubmission: boolean;
  boardRequired: boolean;
  submitted: { by: string; on: ISODate } | null;
  approved: { by: string; on: ISODate; note: string | null; board: BoardApproval | null } | null;
  /** The latest return, while the version is back in draft because of it. */
  returned: { by: string; on: ISODate; reason: string } | null;
  history: BudgetHistoryItem[];
}

export type LinkError = 'not_found' | 'not_allowed' | 'not_draft' | 'already_linked' | 'activity_not_found';
export type BudgetActionError = BudgetStepError | 'no_version' | 'not_allowed';
export type GateResult = { ok: true; outcome: GateEvent['outcome']; blocking: number } | { ok: false; error: BudgetActionError };

export interface RepositoryOptions {
  /** Time source for stamps. The rules engine never reads a clock; the data-access layer stamps writes. */
  clock?: () => ISODateTime;
  /** Called after every stored change, so screens recompute findings at once. */
  onChange?: () => void;
}

/** Everything the role homes show, already restricted to this viewer. A view the viewer does not have is null. */
export interface HomeView {
  financialYear: number;
  planTitle: string | null;
  /** Share of the financial year elapsed at "now" (P10). */
  expected: number;
  homes: HomeKind[];
  /** Merged across every role and relation the person holds, soonest first. */
  needsYou: NeedsYouItem[];
  goalHealth: GoalHealth[] | null;
  finance: FinanceSummary | null;
  hr: HrSummary | null;
  team: TeamMember[] | null;
  contracts: MyContract[] | null;
}

export interface Repository {
  readonly viewer: Viewer;
  readonly financialYear: number;
  organisation(): { id: string; name: string };
  /** Organisations this person belongs to; the switcher shows only when there is more than one. */
  organisationsForPerson(): { id: string; name: string }[];
  workspaces(): WorkspaceKey[];
  /** Findings this viewer may see and is concerned with, computed fresh on every call. */
  findings(): FindingView[];
  /** Routing and fix link for a finding this viewer already holds (e.g. from a node page). */
  describeFinding(finding: Finding): FindingView;
  /** Store an acknowledgement, with a reason, for an advisory flag this viewer may acknowledge. */
  acknowledge(findingKey: string, reason: string): AcknowledgeResult;
  home(): HomeView;
  /** The cascade from goals to activities, with progress and funded status (never amounts). */
  cascadeTree(): CascadeTree;
  /** One cascade-node page, with every panel already restricted to what this viewer may see. Null if not found here. */
  node(kind: NodeKind, id: string): NodeView | null;
  /** Display settings the screens need: currency, year start, perspective and term labels. */
  settings(): { baseCurrency: string; financialYearStartMonth: number; termLabels: Store['organisation']['termLabels'] };
  /** The consolidated budget, its next gate and its history. */
  budget(): BudgetPage;
  /** Activities an orphan line may be linked to, the holder unit's own first. Empty if this viewer may not link it. */
  budgetLinkOptions(lineId: string): LinkOption[];
  /** Link an orphan line to an activity, while the version is a draft. */
  linkBudgetLine(lineId: string, activityId: string): { ok: true } | { ok: false; error: LinkError };
  /** Attempt the consolidated submission. A blocked attempt is recorded too. */
  submitBudget(): GateResult;
  /** Approve a submitted version: never by its submitter; with a board reference when the organisation requires one. */
  approveBudget(board: BoardApproval | null, note: string): GateResult;
  /** Send a submitted version back to draft, with a reason. */
  returnBudget(reason: string): { ok: true } | { ok: false; error: BudgetActionError };
}

const OVERSIGHT_ROLES = ['executive', 'strategy_office'] as const;
const FINANCE_RULES: string[] = [RULES.budgetLineNoActivity.id, RULES.goalNoFundedActivity.id, RULES.envelopeExceeded.id];

/** A clock for the sample build that starts on the sample's "now" and moves forward one second per write. */
export const sampleClock = (now: ISODate): (() => ISODateTime) => {
  let tick = 0;
  return () => new Date(Date.parse(`${now}T09:00:00Z`) + 1000 * tick++).toISOString() as ISODateTime;
};

export function createMemoryRepository(stores: Store[], orgId: string, membershipId: string, now: ISODate, options: RepositoryOptions = {}): Repository {
  const clock = options.clock ?? sampleClock(now);
  const s = stores.find((x) => x.organisation.id === orgId);
  if (!s) throw new Error(`Unknown organisation ${orgId}`);
  const financialYear = financialYearOf(now, s.organisation.financialYearStartMonth);
  const viewer = resolveViewer(s, membershipId, now, financialYear);
  const title = (pid: string) => s.positions.find((p) => p.id === pid)?.title ?? pid;

  const concerned = (f: Finding): boolean => {
    if (!can(s, viewer, 'view', f.subject)) return false;
    if (viewer.roles.some((r) => (OVERSIGHT_ROLES as readonly string[]).includes(r))) return true;
    if (viewer.roles.includes('finance') && FINANCE_RULES.includes(f.ruleId)) return true;
    return f.routeToPositionIds.some((p) => viewer.positionIds.includes(p));
  };

  const describe = (finding: Finding): FindingView => {
    const target = fixTarget(s, finding);
    const reachable = target && (target.kind === 'node' || workspacesFor(viewer).includes(target.w));
    return {
      finding,
      routedTo: finding.routeToPositionIds.map(title),
      routedToMe: finding.routeToPositionIds.some((p) => viewer.positionIds.includes(p)),
      fix: reachable ? target : null,
      ack: ackView(finding),
      canAcknowledge: canAcknowledge(s, viewer, finding),
    };
  };

  const personOf = (membershipId: string) => {
    const m = s.memberships.find((x) => x.id === membershipId);
    return s.people.find((p) => p.id === m?.personId)?.fullName ?? membershipId;
  };
  const ackView = (finding: Finding): FindingView['ack'] => {
    const a = acknowledgementState(s, finding);
    if (a.state === 'open') return a;
    return { state: a.state, reason: a.ack.reason, by: personOf(a.ack.acknowledged.byMembershipId), on: dateInZone(a.ack.acknowledged.at, s.organisation.timeZone) };
  };

  const acknowledge = (findingKey: string, reason: string): AcknowledgeResult => {
    const finding = computeFindings(s, { financialYear }).find((f) => f.key === findingKey);
    // Only findings this viewer is shown can be acted on; anything else is reported as not found.
    if (!finding || !concerned(finding)) return { ok: false, error: 'not_found' };
    if (finding.blocksAt.length > 0) return { ok: false, error: 'blocking' };
    if (!canAcknowledge(s, viewer, finding)) return { ok: false, error: 'not_allowed' };
    const text = reason.trim();
    if (!text) return { ok: false, error: 'reason_required' };
    if (acknowledgementState(s, finding).state === 'acknowledged') return { ok: false, error: 'already_acknowledged' };
    const ack: Acknowledgement = {
      id: `ack-${s.acknowledgements.length + 1}` as Acknowledgement['id'],
      orgId: s.organisation.id,
      findingKey,
      reason: text,
      acknowledged: { at: clock(), byMembershipId: viewer.membershipId },
    };
    s.acknowledgements.push(ack);
    options.onChange?.();
    return { ok: true };
  };


  /* ───────── Budget gate (slice 5) ───────── */

  const audit = (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => {
    const entry: AuditEntry = {
      id: `au-${s.auditEntries.length + 1}` as AuditEntry['id'], orgId: s.organisation.id, at: clock(),
      actorMembershipId: viewer.membershipId, action, entity, before, after,
    };
    s.auditEntries.push(entry);
    return entry;
  };
  const on = (at: string) => dateInZone(at, s.organisation.timeZone);
  const version = () => currentBudgetVersion(s, financialYear);
  const nextGate = (status: string): GateCode | null => (status === 'draft' ? 'budget.submit_consolidated' : status === 'submitted' ? 'budget.approve' : null);

  const attempt = (gate: GateCode): GateEvent => {
    const v = version()!;
    const check = checkGate(computeFindings(s, { financialYear }), gate);
    const event: GateEvent = {
      id: `ge-${s.gateEvents.length + 1}` as GateEvent['id'], orgId: s.organisation.id, gate,
      subject: { type: 'BudgetVersion', id: v.id }, attempted: { at: clock(), byMembershipId: viewer.membershipId }, ...gateRecord(s, check),
    };
    s.gateEvents.push(event);
    audit('gate.attempt', { type: 'BudgetVersion', id: v.id }, null, { gateEventId: event.id, gate, outcome: event.outcome });
    return event;
  };

  const budgetPage = (): BudgetPage => {
    const v = version();
    const budget = budgetView(s, financialYear, (subject) => can(s, viewer, 'view', subject));
    const empty: BudgetPage = {
      financialYear, budget, next: null, can: { submit: false, approve: false, return: false }, ownSubmission: false,
      boardRequired: s.organisation.settings.boardApprovalRequired.budget, submitted: null, approved: null, returned: null, history: [],
    };
    if (!v) return empty;
    const gate = nextGate(v.status);
    const findings = computeFindings(s, { financialYear });
    const check = gate ? checkGate(findings, gate) : null;
    const seen = (f: Finding) => can(s, viewer, 'view', f.subject);
    const submitter = submitterOf(s, v.id);
    const own = submitter === viewer.membershipId;
    const events = gateEventsFor(s, v.id);
    const returns = s.auditEntries.filter((a) => a.action === 'return' && a.entity.id === v.id);
    const history: BudgetHistoryItem[] = [
      ...events.map((g): BudgetHistoryItem & { at: string } => ({
        key: g.id, at: g.attempted.at,
        kind: g.gate === 'budget.approve' ? (g.outcome === 'passed' ? 'approved' : 'approve_blocked') : g.outcome === 'passed' ? 'submitted' : 'submit_blocked',
        by: personOf(g.attempted.byMembershipId), on: on(g.attempted.at), blocking: g.blockingFindingKeys.length,
        advisory: { acknowledged: g.advisoryAtGate.filter((x) => x.acknowledgementId).length, open: g.advisoryAtGate.filter((x) => !x.acknowledgementId).length },
        reason: null, board: g.gate === 'budget.approve' && g.outcome === 'passed' ? v.boardApproval : null,
      })),
      ...returns.map((a): BudgetHistoryItem & { at: string } => ({
        key: a.id, at: a.at, kind: 'returned', by: personOf(a.actorMembershipId), on: on(a.at), blocking: 0, advisory: { acknowledged: 0, open: 0 },
        reason: (a.after as { reason?: string } | null)?.reason ?? null, board: null,
      })),
    ]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .map((item) => ({ key: item.key, kind: item.kind, by: item.by, on: item.on, blocking: item.blocking, advisory: item.advisory, reason: item.reason, board: item.board }));
    const lastSubmit = events.filter((g) => g.gate === 'budget.submit_consolidated' && g.outcome === 'passed').pop();
    const lastReturn = returns[returns.length - 1];
    const returnedNow = v.status === 'draft' && lastReturn && (!lastSubmit || Date.parse(lastReturn.at) > Date.parse(lastSubmit.attempted.at));
    return {
      ...empty,
      next: gate && check ? {
        gate, due: gateDueDate(s, gate, financialYear),
        blocking: check.blocking.filter(seen).map(describe), hiddenBlocking: check.blocking.filter((f) => !seen(f)).length,
        advisory: check.advisory.filter(seen).map(describe),
      } : null,
      can: {
        submit: v.status === 'draft' && canTakeBudgetStep(viewer, 'submit'),
        approve: v.status === 'submitted' && canTakeBudgetStep(viewer, 'approve') && !own,
        return: v.status === 'submitted' && canTakeBudgetStep(viewer, 'return') && !own,
      },
      ownSubmission: v.status === 'submitted' && own,
      submitted: v.status !== 'draft' && lastSubmit ? { by: personOf(lastSubmit.attempted.byMembershipId), on: on(lastSubmit.attempted.at) } : null,
      approved: (v.status === 'approved' || v.status === 'locked') && v.approval
        ? { by: personOf(v.approval.byMembershipId), on: on(v.approval.at), note: v.approval.note ?? null, board: v.boardApproval }
        : null,
      returned: returnedNow ? { by: personOf(lastReturn.actorMembershipId), on: on(lastReturn.at), reason: (lastReturn.after as { reason: string }).reason } : null,
      history,
    };
  };

  const mayLink = (lineId: string): LinkError | null => {
    const l = s.budgetLines.find((x) => x.id === lineId);
    const v = version();
    if (!l || !v || l.versionId !== v.id || !can(s, viewer, 'view', { type: 'BudgetLine', id: l.id })) return 'not_found';
    if (!can(s, viewer, 'draft', { type: 'BudgetLine', id: l.id })) return 'not_allowed';
    if (v.status !== 'draft') return 'not_draft';
    if (l.activityId) return 'already_linked';
    return null;
  };

  const linkBudgetLine = (lineId: string, activityId: string): { ok: true } | { ok: false; error: LinkError } => {
    const err = mayLink(lineId);
    if (err) return { ok: false, error: err };
    if (!linkOptions(s, financialYear, lineId).some((o) => o.ref.id === activityId)) return { ok: false, error: 'activity_not_found' };
    const l = s.budgetLines.find((x) => x.id === lineId)!;
    const before = { activityId: l.activityId };
    l.activityId = activityId as typeof l.activityId;
    l.updated = { at: clock(), byMembershipId: viewer.membershipId };
    audit('update', { type: 'BudgetLine', id: l.id }, before, { activityId: l.activityId });
    options.onChange?.();
    return { ok: true };
  };

  const submitBudget = (): GateResult => {
    const v = version();
    if (!v) return { ok: false, error: 'no_version' };
    if (!canTakeBudgetStep(viewer, 'submit')) return { ok: false, error: 'not_allowed' };
    const err = submitError(v);
    if (err) return { ok: false, error: err };
    const event = attempt('budget.submit_consolidated');
    if (event.outcome === 'passed') {
      v.status = 'submitted';
      v.updated = { at: event.attempted.at, byMembershipId: viewer.membershipId };
    }
    options.onChange?.();
    return { ok: true, outcome: event.outcome, blocking: event.blockingFindingKeys.length };
  };

  const approveBudget = (board: BoardApproval | null, note: string): GateResult => {
    const v = version();
    if (!v) return { ok: false, error: 'no_version' };
    if (!canTakeBudgetStep(viewer, 'approve')) return { ok: false, error: 'not_allowed' };
    const err = approveError(s, v, viewer.membershipId, board);
    if (err) return { ok: false, error: err };
    const event = attempt('budget.approve');
    if (event.outcome === 'passed') {
      const text = note.trim();
      v.status = 'approved';
      v.approval = { at: event.attempted.at, byMembershipId: viewer.membershipId, ...(text ? { note: text } : {}) };
      v.boardApproval = s.organisation.settings.boardApprovalRequired.budget && board ? { resolutionRef: board.resolutionRef.trim(), date: board.date } : null;
      v.updated = { at: event.attempted.at, byMembershipId: viewer.membershipId };
    }
    options.onChange?.();
    return { ok: true, outcome: event.outcome, blocking: event.blockingFindingKeys.length };
  };

  const returnBudget = (reason: string): { ok: true } | { ok: false; error: BudgetActionError } => {
    const v = version();
    if (!v) return { ok: false, error: 'no_version' };
    if (!canTakeBudgetStep(viewer, 'return')) return { ok: false, error: 'not_allowed' };
    const err = returnError(s, v, viewer.membershipId, reason);
    if (err) return { ok: false, error: err };
    const stamp = { at: clock(), byMembershipId: viewer.membershipId };
    v.status = 'draft';
    v.updated = stamp;
    audit('return', { type: 'BudgetVersion', id: v.id }, { status: 'submitted' }, { status: 'draft', reason: reason.trim() });
    options.onChange?.();
    return { ok: true };
  };

  return {
    viewer,
    financialYear,
    organisation: () => ({ id: s.organisation.id, name: s.organisation.name }),
    organisationsForPerson: () =>
      stores
        .filter((x) => x.memberships.some((m) => m.personId === viewer.personId && m.status === 'active'))
        .map((x) => ({ id: x.organisation.id, name: x.organisation.name })),
    workspaces: () => workspacesFor(viewer),
    findings: () =>
      computeFindings(s, { financialYear })
        .filter(concerned)
        .map(describe),
    describeFinding: describe,
    acknowledge,
    cascadeTree: () => cascadeTree(s, { financialYear, now }),
    node: (kind, id) => nodeView(s, kind, id, { financialYear, now }, { canView: (subject) => can(s, viewer, 'view', subject) }),
    settings: () => ({
      baseCurrency: s.organisation.baseCurrency,
      financialYearStartMonth: s.organisation.financialYearStartMonth,
      termLabels: s.organisation.termLabels,
    }),
    budget: budgetPage,
    budgetLinkOptions: (lineId) => (mayLink(lineId) ? [] : linkOptions(s, financialYear, lineId)),
    linkBudgetLine,
    submitBudget,
    approveBudget,
    returnBudget,
    home: () => {
      const homes = homesFor(viewer);
      const has = (h: HomeKind) => homes.includes(h);
      const ctx = { financialYear, now };
      const access = { canView: (subject: { type: string; id: string }) => can(s, viewer, 'view', subject), canSeeRating: (cid: string) => canSeeRating(s, viewer, cid) };
      const routedFindings = computeFindings(s, { financialYear })
        .filter(concerned)
        .map(describe)
        .filter((f) => f.routedToMe)
        .map((f) => ({ finding: f.finding, fix: f.fix, acknowledged: f.ack.state === 'acknowledged' }));
      return {
        financialYear,
        planTitle: activePlanTitle(s),
        expected: expectedToDate(financialYear, s.organisation.financialYearStartMonth, now),
        homes,
        needsYou: needsYou(s, { viewer, financialYear, now, routedFindings, ...access }),
        goalHealth: has('executive') || has('strategy_office') || has('member') ? goalHealth(s, ctx) : null,
        finance: has('finance') ? financeSummary(s, financialYear, access) : null,
        hr: has('hr') ? hrSummary(s, ctx, access) : null,
        team: has('supervisor') ? team(s, viewer, ctx, access) : null,
        contracts: has('employee') ? myContracts(s, viewer, ctx, access, (at) => dateInZone(at, s.organisation.timeZone)) : null,
      };
    },
  };
}

/** Counts for the pill and Home: acknowledged flags are counted apart from open ones; a lapsed one is open. */
export const countFindings = (views: FindingView[]) => {
  const blocking = views.filter((v) => v.finding.blocksAt.length > 0).length;
  const acknowledged = views.filter((v) => v.ack.state === 'acknowledged').length;
  return { blocking, advisory: views.length - blocking - acknowledged, acknowledged, open: views.length - acknowledged, total: views.length };
};
