/** Hash routes, so the single-file build works anywhere without a server. */
import { useEffect, useState } from 'react';
import { NODE_KINDS, type NodeKind } from '../selectors/node';
import { FORMING_STAGES, WORKSPACE_ORDER, type FormingStage, type StrategyEntry } from '../selectors/nav';
import type { WorkspaceKey } from '../strings/en';
import type { FixTarget } from '../selectors/integrity';

/**
 * A workspace, or a record page: #/node/<kind>/<id>, optionally ending ~<workspace> for the workspace the person
 * came from, which decides the section that opens first (Clarity Specification, section 9.3). Record pages are open
 * to all members (line of sight).
 */
export type Route =
  | { kind: 'workspace'; w: WorkspaceKey }
  | { kind: 'node'; node: NodeKind; id: string; from?: WorkspaceKey }
  /** An objective's decision map, #/map/<objectiveId>, optionally at one row: #/map/<objectiveId>/<deficiencyId> (D6-2). */
  | { kind: 'map'; objectiveId: string; deficiencyId?: string }
  /**
   * The organisation's structure and its setup, #/organisation (slice 7, D7-13); its vacant and acting positions,
   * #/organisation/vacancies, and a position's handover list, #/organisation/handover/<positionId> (slice 9).
   */
  | { kind: 'org'; tab?: 'vacancies' | 'people'; handover?: string }
  /** The plan document's print version, #/strategy/plan-document/print (D15-5; was #/plan-document, which redirects). */
  | { kind: 'planDocument' }
  /**
   * A Strategy sub-menu entry (v0.17.0, NV-5): #/strategy/<entry>, with Forming the next plan's stage and tab
   * (#/strategy/forming/<stage>/<tab>), a register (#/strategy/registers/<tab>), or one goal on Communication
   * (#/strategy/communication/<goalId>; was #/communication, which redirects).
   */
  | { kind: 'strategy'; entry: StrategyEntry; stage?: FormingStage; tab?: string; goalId?: string }
  /** A goal's board version printed as a short board paper, #/board-paper/<goalId> (D16-7). */
  | { kind: 'boardPaper'; goalId: string }
  /**
   * Performance › Progress updates (v0.18.0, section 39): #/performance/progress opens where the work is; the tabs
   * have their own addresses, #/performance/progress/mine (optionally /<contractObjectiveId>, whose form opens) and
   * #/performance/progress/verify.
   */
  | { kind: 'progress'; tab?: 'mine' | 'verify'; objectiveId?: string }
  /** Staff survey (v0.19.0): answering, #/survey/<roundId>, and the organisation's results, #/survey/<roundId>/results. */
  | { kind: 'survey'; roundId: string; results?: boolean };

export const hrefFor = (r: Route): string =>
  r.kind === 'org' ? (r.handover ? `#/organisation/handover/${encodeURIComponent(r.handover)}` : r.tab ? `#/organisation/${r.tab}` : '#/organisation')
  : r.kind === 'planDocument' ? '#/strategy/plan-document/print'
  : r.kind === 'strategy' ? strategyHref(r)
  : r.kind === 'boardPaper' ? `#/board-paper/${encodeURIComponent(r.goalId)}`
  : r.kind === 'survey' ? `#/survey/${encodeURIComponent(r.roundId)}${r.results ? '/results' : ''}`
  : r.kind === 'progress' ? ['#/performance/progress', r.tab, r.tab === 'mine' && r.objectiveId ? encodeURIComponent(r.objectiveId) : null].filter(Boolean).join('/')
  : r.kind === 'workspace' ? `#/${r.w}`
  : r.kind === 'map' ? `#/map/${encodeURIComponent(r.objectiveId)}${r.deficiencyId ? `/${encodeURIComponent(r.deficiencyId)}` : ''}`
  : `#/node/${r.node}/${encodeURIComponent(r.id)}${r.from ? `~${r.from}` : ''}`;
function strategyHref(r: Extract<Route, { kind: 'strategy' }>): string {
  const tail = r.entry === 'forming' ? [r.stage, r.stage && r.tab].filter(Boolean)
    : r.entry === 'registers' ? [r.tab]
    : r.entry === 'communication' ? [r.tab === 'survey' ? 'survey' : r.goalId && encodeURIComponent(r.goalId)] : [];
  return ['#/strategy', r.entry, ...tail.filter((x): x is string => !!x)].join('/');
}
export const mapHref = (objectiveId: string, deficiencyId?: string) => hrefFor({ kind: 'map', objectiveId, deficiencyId });
/** Where a check's fix opens. */
export const fixHref = (fix: FixTarget, from?: WorkspaceKey): string =>
  fix.kind === 'node' ? nodeHref(fix.node, fix.id, from) : fix.kind === 'map' ? mapHref(fix.objectiveId, fix.deficiencyId) : hrefFor({ kind: 'workspace', w: fix.w });
export const nodeHref = (node: NodeKind, id: string, from?: WorkspaceKey) => hrefFor({ kind: 'node', node, id, from });

export const parseRoute = (hash: string): Route => {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'node' && NODE_KINDS.includes(parts[1] as NodeKind) && parts[2]) {
    const [rawId, rawFrom] = parts.slice(2).join('/').split('~');
    const from = WORKSPACE_ORDER.includes(rawFrom as WorkspaceKey) ? (rawFrom as WorkspaceKey) : undefined;
    return { kind: 'node', node: parts[1] as NodeKind, id: decodeURIComponent(rawId!), from };
  }
  if (parts[0] === 'map' && parts[1]) {
    return { kind: 'map', objectiveId: decodeURIComponent(parts[1]), deficiencyId: parts[2] ? decodeURIComponent(parts[2]) : undefined };
  }
  // NV-5: earlier addresses still open.
  if (parts[0] === 'plan-document') return { kind: 'planDocument' };
  if (parts[0] === 'communication') return { kind: 'strategy', entry: 'communication', goalId: parts[1] ? decodeURIComponent(parts[1]) : undefined };
  if (parts[0] === 'strategy' && parts[1]) {
    const entry = parts[1] as StrategyEntry;
    if (entry === 'plan-document') return parts[2] === 'print' ? { kind: 'planDocument' } : { kind: 'strategy', entry };
    if (entry === 'communication') return parts[2] === 'survey' ? { kind: 'strategy', entry, tab: 'survey' } : { kind: 'strategy', entry, goalId: parts[2] ? decodeURIComponent(parts[2]) : undefined };
    if (entry === 'registers') return { kind: 'strategy', entry, tab: parts[2] || undefined };
    if (entry === 'forming') {
      const stage = FORMING_STAGES.includes(parts[2] as FormingStage) ? (parts[2] as FormingStage) : undefined;
      return { kind: 'strategy', entry, stage, tab: stage ? parts[3] || undefined : undefined };
    }
  }
  if (parts[0] === 'survey' && parts[1]) return { kind: 'survey', roundId: decodeURIComponent(parts[1]), results: parts[2] === 'results' ? true : undefined };
  if (parts[0] === 'performance' && parts[1] === 'progress') {
    const tab = parts[2] === 'mine' || parts[2] === 'verify' ? parts[2] : undefined;
    return { kind: 'progress', tab, objectiveId: tab === 'mine' && parts[3] ? decodeURIComponent(parts[3]) : undefined };
  }
  if (parts[0] === 'board-paper' && parts[1]) return { kind: 'boardPaper', goalId: decodeURIComponent(parts[1]) };
  if (parts[0] === 'organisation') {
    if (parts[1] === 'handover' && parts[2]) return { kind: 'org', handover: decodeURIComponent(parts[2]) };
    return parts[1] === 'vacancies' || parts[1] === 'people' ? { kind: 'org', tab: parts[1] } : { kind: 'org' };
  }
  const w = parts[0] as WorkspaceKey;
  return { kind: 'workspace', w: WORKSPACE_ORDER.includes(w) ? w : 'home' };
};

/** Old addresses are replaced in the address bar by their new ones, so links already shared still open (NV-5). */
export const LEGACY = /^#\/(communication|plan-document)(\/|$)/;
function canonical(hash: string): Route {
  const r = parseRoute(hash);
  if (LEGACY.test(hash)) window.history.replaceState(null, '', hrefFor(r));
  return r;
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => canonical(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(canonical(window.location.hash));
      document.getElementById('main')?.focus({ preventScroll: false });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (r) => { window.location.hash = hrefFor(r).slice(1); }];
}
