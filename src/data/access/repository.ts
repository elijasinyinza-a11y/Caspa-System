/**
 * The only way screens read data. The in-memory implementation here is replaced by the real
 * backend later without changes to the screens. Permissions are enforced here, not in the UI.
 */
import type { Acknowledgement, Finding, ISODate, ISODateTime } from '../../contract/caspa-data-contract';
import { acknowledgementState } from '../../rules/acknowledgement';
import { dateInZone } from '../../selectors/format';
import { computeFindings, RULES } from '../../rules/integrity';
import { fixTarget, type FixTarget } from '../../selectors/integrity';
import { activePlanTitle, fundingCoverage, type GoalCoverage } from '../../selectors/home';
import { cascadeTree, nodeView, type CascadeTree, type NodeKind, type NodeView } from '../../selectors/node';
import { workspacesFor } from '../../selectors/nav';
import type { WorkspaceKey } from '../../strings/en';
import { can, canAcknowledge } from './permissions';
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

export interface RepositoryOptions {
  /** Time source for stamps. The rules engine never reads a clock; the data-access layer stamps writes. */
  clock?: () => ISODateTime;
  /** Called after every stored change, so screens recompute findings at once. */
  onChange?: () => void;
}

export interface HomeView {
  financialYear: number;
  planTitle: string | null;
  goalCount: number;
  coverage: GoalCoverage[];
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
    home: () => ({
      financialYear,
      planTitle: activePlanTitle(s),
      goalCount: s.goals.filter((g) => s.plans.some((p) => p.id === g.planId && p.status === 'active')).length,
      coverage: fundingCoverage(s, financialYear),
    }),
  };
}

/** Counts for the pill and Home: acknowledged flags are counted apart from open ones; a lapsed one is open. */
export const countFindings = (views: FindingView[]) => {
  const blocking = views.filter((v) => v.finding.blocksAt.length > 0).length;
  const acknowledged = views.filter((v) => v.ack.state === 'acknowledged').length;
  return { blocking, advisory: views.length - blocking - acknowledged, acknowledged, open: views.length - acknowledged, total: views.length };
};
