/** Hash routes, so the single-file build works anywhere without a server. */
import { useEffect, useState } from 'react';
import type { WorkspaceKey } from '../strings/en';
import { WORKSPACE_ORDER } from '../selectors/nav';

const parse = (): WorkspaceKey => {
  const key = window.location.hash.replace(/^#\/?/, '').split('/')[0] as WorkspaceKey;
  return WORKSPACE_ORDER.includes(key) ? key : 'home';
};

export function useRoute(): [WorkspaceKey, (w: WorkspaceKey) => void] {
  const [route, setRoute] = useState<WorkspaceKey>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (w) => { window.location.hash = `/${w}`; }];
}
