/** Hash routes, so the single-file build works anywhere without a server. */
import { useEffect, useState } from 'react';
import { NODE_KINDS, type NodeKind } from '../selectors/node';
import { WORKSPACE_ORDER } from '../selectors/nav';
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
  | { kind: 'org'; tab?: 'vacancies'; handover?: string }
  /** The plan document's print version, #/plan-document (D15-5). */
  | { kind: 'planDocument' }
  /** The Communication page in Strategy, #/communication, optionally at one goal: #/communication/<goalId> (D16-3). */
  | { kind: 'communication'; goalId?: string }
  /** A goal's board version printed as a short board paper, #/board-paper/<goalId> (D16-7). */
  | { kind: 'boardPaper'; goalId: string };

export const hrefFor = (r: Route): string =>
  r.kind === 'org' ? (r.handover ? `#/organisation/handover/${encodeURIComponent(r.handover)}` : r.tab ? '#/organisation/vacancies' : '#/organisation')
  : r.kind === 'planDocument' ? '#/plan-document'
  : r.kind === 'communication' ? `#/communication${r.goalId ? `/${encodeURIComponent(r.goalId)}` : ''}`
  : r.kind === 'boardPaper' ? `#/board-paper/${encodeURIComponent(r.goalId)}`
  : r.kind === 'workspace' ? `#/${r.w}`
  : r.kind === 'map' ? `#/map/${encodeURIComponent(r.objectiveId)}${r.deficiencyId ? `/${encodeURIComponent(r.deficiencyId)}` : ''}`
  : `#/node/${r.node}/${encodeURIComponent(r.id)}${r.from ? `~${r.from}` : ''}`;
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
  if (parts[0] === 'plan-document') return { kind: 'planDocument' };
  if (parts[0] === 'communication') return { kind: 'communication', goalId: parts[1] ? decodeURIComponent(parts[1]) : undefined };
  if (parts[0] === 'board-paper' && parts[1]) return { kind: 'boardPaper', goalId: decodeURIComponent(parts[1]) };
  if (parts[0] === 'organisation') {
    if (parts[1] === 'handover' && parts[2]) return { kind: 'org', handover: decodeURIComponent(parts[2]) };
    return parts[1] === 'vacancies' ? { kind: 'org', tab: 'vacancies' } : { kind: 'org' };
  }
  const w = parts[0] as WorkspaceKey;
  return { kind: 'workspace', w: WORKSPACE_ORDER.includes(w) ? w : 'home' };
};

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(window.location.hash));
      document.getElementById('main')?.focus({ preventScroll: false });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (r) => { window.location.hash = hrefFor(r).slice(1); }];
}
