/** Hash routes, so the single-file build works anywhere without a server. */
import { useEffect, useState } from 'react';
import { NODE_KINDS, type NodeKind } from '../selectors/node';
import { WORKSPACE_ORDER } from '../selectors/nav';
import type { WorkspaceKey } from '../strings/en';

/**
 * A workspace, or a record page: #/node/<kind>/<id>, optionally ending ~<workspace> for the workspace the person
 * came from, which decides the section that opens first (Clarity Specification, section 9.3). Record pages are open
 * to all members (line of sight).
 */
export type Route = { kind: 'workspace'; w: WorkspaceKey } | { kind: 'node'; node: NodeKind; id: string; from?: WorkspaceKey };

export const hrefFor = (r: Route): string =>
  r.kind === 'workspace' ? `#/${r.w}` : `#/node/${r.node}/${encodeURIComponent(r.id)}${r.from ? `~${r.from}` : ''}`;
export const nodeHref = (node: NodeKind, id: string, from?: WorkspaceKey) => hrefFor({ kind: 'node', node, id, from });

export const parseRoute = (hash: string): Route => {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'node' && NODE_KINDS.includes(parts[1] as NodeKind) && parts[2]) {
    const [rawId, rawFrom] = parts.slice(2).join('/').split('~');
    const from = WORKSPACE_ORDER.includes(rawFrom as WorkspaceKey) ? (rawFrom as WorkspaceKey) : undefined;
    return { kind: 'node', node: parts[1] as NodeKind, id: decodeURIComponent(rawId!), from };
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
