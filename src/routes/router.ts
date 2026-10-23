/** Hash routes, so the single-file build works anywhere without a server. */
import { useEffect, useState } from 'react';
import { NODE_KINDS, type NodeKind } from '../selectors/node';
import { WORKSPACE_ORDER } from '../selectors/nav';
import type { WorkspaceKey } from '../strings/en';

/** A workspace, or a cascade-node page: #/node/<kind>/<id>. Node pages are open to all members (line of sight). */
export type Route = { kind: 'workspace'; w: WorkspaceKey } | { kind: 'node'; node: NodeKind; id: string };

export const hrefFor = (r: Route): string =>
  r.kind === 'workspace' ? `#/${r.w}` : `#/node/${r.node}/${encodeURIComponent(r.id)}`;
export const nodeHref = (node: NodeKind, id: string) => hrefFor({ kind: 'node', node, id });

export const parseRoute = (hash: string): Route => {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'node' && NODE_KINDS.includes(parts[1] as NodeKind) && parts[2]) {
    return { kind: 'node', node: parts[1] as NodeKind, id: decodeURIComponent(parts.slice(2).join('/')) };
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
