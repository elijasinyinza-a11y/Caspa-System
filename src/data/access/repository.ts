/**
 * The only way screens read data. The in-memory implementation here is replaced by the real
 * backend later without changes to the screens. Permissions are enforced here, not in the UI.
 */
import type { Acknowledgement, AuditEntry, BoardApproval, Finding, GateCode, GateEvent, ISODate, ISODateTime } from '../../contract/caspa-data-contract';
import { approveError, checkGate, gateEventsFor, gateRecord, returnError, submitError, submitterOf, type BudgetStepError } from '../../rules/gate';
import { currentBudgetVersion } from '../../rules/structure';
import type { Activity, Deficiency, SixPLevel } from '../../contract/caspa-data-contract';
import { correctiveOptions, kpisForDeficiency, levelChangeError, newActivityError, nextActivityCode, type LevelChangeError, type NewActivityDraft, type NewActivityError } from '../../rules/cascade-edit';
import { correctedBy, decisionMap, type DecisionMapView } from '../../selectors/decision-map';
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
import { cascadeTree, nodeView, type CascadeTree, type NodeKind, type NodeRef, type NodeView } from '../../selectors/node';
import { workspacesFor } from '../../selectors/nav';
import { en, type WorkspaceKey } from '../../strings/en';
import { indexTree, type NodeChecks } from '../../selectors/cascade-view';
import { can, canAcknowledge, canSeeRating, canTakeBudgetStep } from './permissions';
import type { Store } from './store';
import { createOrganisationAccess, type OrganisationAccess } from './setup';
import { createOnboardingAccess, type OnboardingAccess } from './onboarding';
import { structureConfirmation } from './setup/confirmation';
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

/** An objective's decision map (BUILD-BRIEF section 22), already restricted to this viewer. */
export interface MapPage {
  map: DecisionMapView;
  /** Whether this viewer may link or remove corrective activities (Deficiency draft) and add new ones (Activity draft too). */
  can: { link: boolean; add: boolean };
  /** The "No corrective activity yet" check for each unaddressed row this viewer is shown, by deficiency id. */
  checks: Record<string, FindingView>;
}

/** What the "Add corrective activity" panel offers for one deficiency. */
export interface CorrectiveForm {
  deficiency: { id: string; description: string; level: SixPLevel; objectiveId: string };
  /** Existing activities of the same objective, those at the deficiency's level first. */
  options: { ref: NodeRef; level: SixPLevel | null; owner: string | null }[];
  /** Null when this viewer may link but not add. */
  add: { kpis: { ref: NodeRef; nextCode: string }[]; positions: { id: string; title: string }[] } | null;
}

/** "How it's done" additions on an activity page (D6-6, and "Corrects:" from D6-2). */
export interface ActivityLevelView {
  canChange: boolean;
  /** Signed commitments drawn from this activity: each is asked to review a change. */
  commitments: number;
  /** Deficiencies it corrects, or null when this viewer may not see deficiencies. */
  corrects: { id: string; objectiveId: string; description: string; level: SixPLevel }[] | null;
  /** Level changes, newest first. */
  history: { from: SixPLevel | null; to: SixPLevel; reason: string; by: string; on: ISODate }[];
}

export type CorrectiveError = 'not_found' | 'not_allowed' | 'already_linked' | 'not_linked' | 'activity_not_found';
export type AddActivityError = 'not_found' | 'not_allowed' | NewActivityError;
export type ChangeLevelError = 'not_found' | 'not_allowed' | LevelChangeError;

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
  /** The Cascade workspace: the tree plus the checks, own records and defaults it needs (Clarity Specification, section 8). */
  cascadeView(): CascadeViewData;
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
  /** An objective's decision map. Null if the objective is not found here. */
  decisionMap(objectiveId: string): MapPage | null;
  /** What may be linked or added for one deficiency. Null if this viewer may not change its corrective work. */
  correctiveForm(deficiencyId: string): CorrectiveForm | null;
  linkCorrective(deficiencyId: string, activityId: string): { ok: true } | { ok: false; error: CorrectiveError };
  /** Remove a corrective link; the activity itself stays. */
  unlinkCorrective(deficiencyId: string, activityId: string): { ok: true } | { ok: false; error: CorrectiveError };
  /** Add a new activity under one of the objective's KPIs and link it as corrective work (D6-1). */
  addCorrectiveActivity(deficiencyId: string, draft: NewActivityDraft): { ok: true; activityId: string; code: string } | { ok: false; error: AddActivityError };
  /** Level, its history and "Corrects:" for an activity page. Null if not found. */
  activityLevel(activityId: string): ActivityLevelView | null;
  /** Change an activity's 6P level, with a reason kept in the audit entry (D6-6). */
  changeActivityLevel(activityId: string, to: SixPLevel, reason: string): { ok: true } | { ok: false; error: ChangeLevelError };
  /** Organisation setup and structure (slice 7): the draft before confirmation, the records after it. */
  structure: OrganisationAccess;
  /** Onboarding (slice 8): the first question, plan setup, the import door, confirmation and publication. */
  onboarding: OnboardingAccess;
  /** Who confirmed the structure and when (D7-9), for the Executive's Home; null until confirmed. */
  structureConfirmed(): { by: string; on: ISODate } | null;
}

const OVERSIGHT_ROLES = ['executive', 'strategy_office'] as const;
const FINANCE_RULES: string[] = [RULES.budgetLineNoActivity.id, RULES.goalNoFundedActivity.id, RULES.envelopeExceeded.id];

/** A clock for the sample build that starts on the sample's "now" and moves forward one second per write. */
export const sampleClock = (now: ISODate): (() => ISODateTime) => {
  let tick = 0;
  return () => new Date(Date.parse(`${now}T09:00:00Z`) + 1000 * tick++).toISOString() as ISODateTime;
};

/** Everything the Cascade workspace shows, already limited to what this viewer may see. */
export interface CascadeViewData {
  tree: CascadeTree;
  /** Checks on each record, by record id, counted as this viewer is shown them. */
  checks: Record<string, NodeChecks>;
  /** Budget lines not linked to any activity that this viewer is shown; they have no record in the tree. */
  unlinkedLines: number;
  /** Records that are this viewer's own work: owned by their positions, or the source of a commitment in their or their team's contracts. */
  own: string[];
  /** Positions that own at least one record, for the owner filter. */
  owners: { positionId: string; title: string }[];
  /** Starting view by role (section 8.1). The person can change each one. */
  defaults: { scope: 'part' | 'whole'; attention: boolean; codes: boolean; signal: 'progress' | 'funding'; stopAboveKpi: boolean };
  /** One verb-first next step from the checks sent to this viewer (principle C6), or null. */
  nextStep: { text: string; fix: FixTarget } | null;
  /** Deficiencies recorded per objective, only for objectives whose decision map this viewer may see (D6-2). */
  maps: Record<string, number>;
}

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
    const reachable = target && (target.kind !== 'workspace' || workspacesFor(viewer).includes(target.w));
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

  /* ───────── Decision map (slice 6) ───────── */

  const stampNow = () => ({ at: clock(), byMembershipId: viewer.membershipId });
  const refOf = (a: Activity): NodeRef => ({ kind: 'activity', id: a.id, code: a.code, title: a.title });
  const deficiencyFor = (id: string): Deficiency | null => {
    const df = s.deficiencies.find((d) => d.id === id);
    return df && can(s, viewer, 'view', { type: 'Deficiency', id: df.id }) ? df : null;
  };
  const mayLinkCorrective = (df: Deficiency) => can(s, viewer, 'draft', { type: 'Deficiency', id: df.id });
  // A new activity has no record yet, so Activity draft is checked against its objective: the objective's owner,
  // the Strategy office and a facilitator hold it there (the "owner" principal resolves to the same objective owner).
  const mayAddUnder = (df: Deficiency) => mayLinkCorrective(df) && can(s, viewer, 'draft', { type: 'Activity', id: df.objectiveId });
  const setCorrective = (df: Deficiency, next: Deficiency['correctiveActivityIds']) => {
    const before = { correctiveActivityIds: [...df.correctiveActivityIds] };
    df.correctiveActivityIds = next;
    df.updated = stampNow();
    audit('update', { type: 'Deficiency', id: df.id }, before, { correctiveActivityIds: [...next] });
  };

  const mapPage = (objectiveId: string): MapPage | null => {
    const o = s.objectives.find((x) => x.id === objectiveId);
    if (!o) return null;
    // Deficiency view is checked against the objective, so an objective with no rows answers the same way: the
    // objective_owner principal resolves to the objective's owner; the Executive, Strategy office and facilitator by role.
    const canView = can(s, viewer, 'view', { type: 'Deficiency', id: o.id });
    const map = decisionMap(s, o.id, { canView });
    if (!map) return null;
    const probe = s.deficiencies.find((d) => d.objectiveId === o.id);
    const checks: Record<string, FindingView> = {};
    if (map.visible) {
      for (const f of computeFindings(s, { financialYear }).filter(concerned)) {
        if (f.ruleId === RULES.deficiencyUnaddressed.id && s.deficiencies.some((d) => d.id === f.subject.id && d.objectiveId === o.id)) checks[f.subject.id] = describe(f);
      }
    }
    return {
      map,
      can: { link: !!probe && map.visible && mayLinkCorrective(probe), add: !!probe && map.visible && mayAddUnder(probe) },
      checks,
    };
  };
  const correctiveForm = (deficiencyId: string): CorrectiveForm | null => {
    const df = deficiencyFor(deficiencyId);
    if (!df || !mayLinkCorrective(df)) return null;
    const ownerTitle = (a: Activity) => (a.ownerPositionId ? title(a.ownerPositionId) : null);
    return {
      deficiency: { id: df.id, description: df.description, level: df.level, objectiveId: df.objectiveId },
      options: correctiveOptions(s, df, financialYear).map((a) => ({ ref: refOf(a), level: a.decisionLevel, owner: ownerTitle(a) })),
      add: mayAddUnder(df)
        ? {
            kpis: kpisForDeficiency(s, df).map((k) => ({ ref: { kind: 'kpi', id: k.id, code: k.code, title: k.name }, nextCode: nextActivityCode(s, k.id) })),
            positions: s.positions.map((p) => ({ id: p.id, title: p.title })).sort((a, b) => a.title.localeCompare(b.title)),
          }
        : null,
    };
  };

  const linkCorrective = (deficiencyId: string, activityId: string): { ok: true } | { ok: false; error: CorrectiveError } => {
    const df = deficiencyFor(deficiencyId);
    if (!df) return { ok: false, error: 'not_found' };
    if (!mayLinkCorrective(df)) return { ok: false, error: 'not_allowed' };
    if (df.correctiveActivityIds.includes(activityId as Activity['id'])) return { ok: false, error: 'already_linked' };
    if (!correctiveOptions(s, df, financialYear).some((a) => a.id === activityId)) return { ok: false, error: 'activity_not_found' };
    setCorrective(df, [...df.correctiveActivityIds, activityId as Activity['id']]);
    options.onChange?.();
    return { ok: true };
  };

  const unlinkCorrective = (deficiencyId: string, activityId: string): { ok: true } | { ok: false; error: CorrectiveError } => {
    const df = deficiencyFor(deficiencyId);
    if (!df) return { ok: false, error: 'not_found' };
    if (!mayLinkCorrective(df)) return { ok: false, error: 'not_allowed' };
    if (!df.correctiveActivityIds.includes(activityId as Activity['id'])) return { ok: false, error: 'not_linked' };
    setCorrective(df, df.correctiveActivityIds.filter((x) => x !== activityId));
    options.onChange?.();
    return { ok: true };
  };

  const addCorrectiveActivity = (deficiencyId: string, d: NewActivityDraft): { ok: true; activityId: string; code: string } | { ok: false; error: AddActivityError } => {
    const df = deficiencyFor(deficiencyId);
    if (!df) return { ok: false, error: 'not_found' };
    if (!mayAddUnder(df)) return { ok: false, error: 'not_allowed' };
    const err = newActivityError(s, df, d);
    if (err) return { ok: false, error: err };
    const stamp = stampNow();
    const code = nextActivityCode(s, d.kpiId);
    const a: Activity = {
      orgId: s.organisation.id, created: stamp, updated: stamp,
      id: `act-new-${s.auditEntries.length + 1}` as Activity['id'], kpiId: d.kpiId as Activity['kpiId'], financialYear,
      code, title: d.title.trim(), decisionLevel: d.level, ownerPositionId: d.ownerPositionId as Activity['ownerPositionId'],
      reportingFrequency: d.frequency, evidence: d.evidence.trim(),
      quantityTarget: d.quantity ? { value: d.quantity.value, unit: d.quantity.unit.trim() } : null,
      dependsOn: [], status: 'planned', draft: { state: 'human', provenance: { kind: 'manual' }, decided: null },
    };
    s.activities.push(a);
    audit('create', { type: 'Activity', id: a.id }, null, { code, kpiId: a.kpiId, decisionLevel: a.decisionLevel, forDeficiencyId: df.id });
    setCorrective(df, [...df.correctiveActivityIds, a.id]);
    options.onChange?.();
    return { ok: true, activityId: a.id, code };
  };

  const activityLevel = (activityId: string): ActivityLevelView | null => {
    const a = s.activities.find((x) => x.id === activityId);
    if (!a) return null;
    const corrected = correctedBy(s, a.id);
    const seesAll = corrected.every((d) => can(s, viewer, 'view', { type: 'Deficiency', id: d.id }));
    const signedIds = new Set(s.contracts.filter((c) => c.status === 'signed' || c.signedByEmployee).map((c) => c.id as string));
    return {
      canChange: a.status !== 'archived' && can(s, viewer, 'draft', { type: 'Activity', id: a.id }),
      commitments: s.contractObjectives.filter((co) => co.sourceActivityId === a.id && co.snapshot && signedIds.has(co.contractId)).length,
      corrects: corrected.length === 0 || seesAll ? corrected.map((d) => ({ id: d.id, objectiveId: d.objectiveId, description: d.description, level: d.level })) : null,
      history: s.auditEntries
        .filter((e) => e.entity.type === 'Activity' && e.entity.id === a.id && e.action === 'update' && (e.after as { decisionLevel?: unknown } | null)?.decisionLevel)
        .map((e) => {
          const after = e.after as { decisionLevel: SixPLevel; reason: string };
          return { from: (e.before as { decisionLevel: SixPLevel | null }).decisionLevel, to: after.decisionLevel, reason: after.reason, by: title(viewerPosition(e.actorMembershipId)), on: on(e.at) };
        })
        .reverse(),
    };
  };
  // Level changes name the position that made them, as the record anatomy names owners by position.
  const viewerPosition = (membershipId: string): string => {
    const m = s.memberships.find((x) => x.id === membershipId);
    const pa = s.assignments.find((x) => x.personId === m?.personId);
    return pa?.positionId ?? personOf(membershipId);
  };

  const changeActivityLevel = (activityId: string, to: SixPLevel, reason: string): { ok: true } | { ok: false; error: ChangeLevelError } => {
    const a = s.activities.find((x) => x.id === activityId);
    if (!a) return { ok: false, error: 'not_found' };
    if (!can(s, viewer, 'draft', { type: 'Activity', id: a.id })) return { ok: false, error: 'not_allowed' };
    const err = levelChangeError(a, to, reason);
    if (err) return { ok: false, error: err };
    const from = a.decisionLevel;
    a.decisionLevel = to;
    a.updated = stampNow();
    audit('update', { type: 'Activity', id: a.id }, { decisionLevel: from }, { decisionLevel: to, reason: reason.trim() });
    options.onChange?.();
    return { ok: true };
  };

  return {
    viewer,
    financialYear,
    structure: createOrganisationAccess({ s, viewer, now, financialYear, clock, audit, onChange: options.onChange }),
    onboarding: createOnboardingAccess({ s, viewer, now, financialYear, clock, audit, onChange: options.onChange }),
    structureConfirmed: () => {
      const e = structureConfirmation(s);
      return e ? { by: personOf(e.actorMembershipId), on: on(e.at) } : null;
    },
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
    cascadeView: () => {
      const tree = cascadeTree(s, { financialYear, now });
      const index = indexTree(tree.goals);
      const shown = computeFindings(s, { financialYear }).filter(concerned).map(describe);
      const checks: Record<string, NodeChecks> = {};
      let unlinkedLines = 0;
      for (const f of shown) {
        const target = fixTarget(s, f.finding);
        // A decision-map row's check sits on its objective's row in the tree.
        const onId = target?.kind === 'node' ? target.id : target?.kind === 'map' ? target.objectiveId : null;
        if (!onId) {
          if (f.finding.ruleId === RULES.budgetLineNoActivity.id) unlinkedLines += 1;
          continue;
        }
        const c = (checks[onId] ??= { mustFix: 0, toCheck: 0, checked: 0 });
        if (f.finding.blocksAt.length > 0) c.mustFix += 1;
        else if (f.ack.state === 'acknowledged') c.checked += 1;
        else c.toCheck += 1;
      }
      const mine = new Set(viewer.positionIds as string[]);
      const contractIds = new Set(
        s.contracts
          .filter((c) => c.financialYear === financialYear)
          .filter((c) => c.personId === viewer.personId || mine.has(s.positions.find((p) => p.id === c.positionId)?.reportsToPositionId ?? ''))
          .map((c) => c.id as string),
      );
      const own = new Set<string>();
      for (const x of index.values()) if (x.node.ownerPositionId && mine.has(x.node.ownerPositionId)) own.add(x.node.ref.id);
      for (const co of s.contractObjectives) if (contractIds.has(co.contractId) && index.has(co.sourceActivityId)) own.add(co.sourceActivityId);
      const ownerIds = [...new Set([...index.values()].map((x) => x.node.ownerPositionId).filter((p): p is string => !!p))];
      const r = viewer.roles;
      const oversight = r.includes('executive') || r.includes('strategy_office') || r.includes('finance') || r.includes('hr');
      // The next step: what must be fixed first, then what is worth checking, among checks sent to this viewer.
      const mineToAct = shown
        .filter((f) => f.routedToMe || (r.includes('finance') && f.finding.ruleId === RULES.budgetLineNoActivity.id))
        .filter((f) => f.fix && (f.finding.blocksAt.length > 0 || f.ack.state !== 'acknowledged'))
        .sort((a, b) => Number(b.finding.blocksAt.length > 0) - Number(a.finding.blocksAt.length > 0));
      const first = mineToAct[0];
      let nextStep: CascadeViewData['nextStep'] = null;
      if (first?.fix) {
        const step = en.fixStep[first.finding.ruleId];
        const subjectTitle =
          first.finding.subject.type === 'BudgetLine'
            ? s.budgetLines.find((l) => l.id === first.finding.subject.id)?.description ?? ''
            : first.finding.subject.type === 'Deficiency'
              ? s.deficiencies.find((d) => d.id === first.finding.subject.id)?.description ?? ''
              : first.fix.kind === 'node' ? index.get(first.fix.id)?.node.ref.title ?? first.fix.code : '';
        nextStep = { text: step ? step(subjectTitle) : first.finding.message, fix: first.fix };
      }
      return {
        tree,
        checks,
        unlinkedLines,
        own: [...own],
        owners: ownerIds.map((positionId) => ({ positionId, title: title(positionId) })).sort((a, b) => a.title.localeCompare(b.title)),
        defaults: {
          scope: !oversight && own.size > 0 ? 'part' : 'whole',
          attention: r.includes('strategy_office') || (!oversight && viewer.isSupervisor),
          codes: r.includes('executive') || r.includes('strategy_office') || r.includes('finance'),
          signal: r.includes('finance') && !r.includes('executive') && !r.includes('strategy_office') ? 'funding' : 'progress',
          stopAboveKpi: !oversight && viewer.isSupervisor,
        },
        nextStep,
        maps: Object.fromEntries(
          s.objectives
            .filter((o) => can(s, viewer, 'view', { type: 'Deficiency', id: o.id }))
            .map((o) => [o.id, s.deficiencies.filter((d) => d.objectiveId === o.id).length] as const)
            .filter(([, n]) => n > 0),
        ),
      };
    },
    node: (kind, id) => nodeView(s, kind, id, { financialYear, now }, { canView: (subject) => can(s, viewer, 'view', subject) }),
    settings: () => ({
      baseCurrency: s.organisation.baseCurrency,
      financialYearStartMonth: s.organisation.financialYearStartMonth,
      termLabels: s.organisation.termLabels,
    }),
    budget: budgetPage,
    budgetLinkOptions: (lineId) => (mayLink(lineId) ? [] : linkOptions(s, financialYear, lineId)),
    linkBudgetLine,
    decisionMap: mapPage,
    correctiveForm,
    linkCorrective,
    unlinkCorrective,
    addCorrectiveActivity,
    activityLevel,
    changeActivityLevel,
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
