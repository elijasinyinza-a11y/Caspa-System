/**
 * The only way screens read data. The in-memory implementation here is replaced by the real
 * backend later without changes to the screens. Permissions are enforced here, not in the UI.
 */
import type { Finding, ISODate } from '../../contract/caspa-data-contract';
import { computeFindings, RULES } from '../../rules/integrity';
import { activePlanTitle, fundingCoverage, type GoalCoverage } from '../../selectors/home';
import { workspacesFor } from '../../selectors/nav';
import type { WorkspaceKey } from '../../strings/en';
import { can } from './permissions';
import type { Store } from './store';
import { financialYearOf, resolveViewer, type Viewer } from './viewer';

export interface FindingView {
  finding: Finding;
  routedTo: string[]; // position titles
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
  home(): HomeView;
}

const OVERSIGHT_ROLES = ['executive', 'strategy_office'] as const;
const FINANCE_RULES: string[] = [RULES.budgetLineNoActivity.id, RULES.goalNoFundedActivity.id, RULES.envelopeExceeded.id];

export function createMemoryRepository(stores: Store[], orgId: string, membershipId: string, now: ISODate): Repository {
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
        .map((finding) => ({ finding, routedTo: finding.routeToPositionIds.map(title) })),
    home: () => ({
      financialYear,
      planTitle: activePlanTitle(s),
      goalCount: s.goals.filter((g) => s.plans.some((p) => p.id === g.planId && p.status === 'active')).length,
      coverage: fundingCoverage(s, financialYear),
    }),
  };
}
